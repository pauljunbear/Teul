import {
  captureFigmaColorInventoryScope,
  inventoryFigmaColorSystem,
  type FigmaColorInventoryHost,
  type FigmaColorInventoryFrozenScope,
  type FigmaColorInventoryOptions,
  type FigmaColorInventoryResult,
} from './colorSystemAuditInventory';
import type {
  SnapshotDocumentProfile,
  SourceColorValue,
  SourceEvidenceLocator,
} from '../types/colorSystemAudit';
import { deterministicContentHash } from '../lib/colorSystemAudit';
import {
  buildColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotInputV2,
  type ColorSystemGenericSourceSnapshotV2,
  type GenericColorCollectionV2,
  type GenericColorUsageV2,
  type GenericColorValueV2,
  type GenericColorVariableV2,
  type GenericEnabledLibraryDescriptorV2,
  type GenericEvidenceKindV2,
  type GenericEvidenceRefV2,
  type GenericJsonObjectV2,
  type GenericJsonValueV2,
  type GenericPaintRecordV2,
  type GenericPaintStyleV2,
  type GenericPaletteStructureV2,
  type GenericSourceGapKindV2,
  type GenericSourceGapV2,
  type GenericSourceScopeV2,
  type GenericUsageContextKindV2,
  type GenericVariableModeValueV2,
} from '../lib/colorSystemGenericSourceAdapterV2';

const MAX_ALIAS_DEPTH = 64;

export type ColorSystemGenericSourceInventoryV2Status =
  | 'ready'
  | 'partial'
  | 'empty'
  | 'unsupported-profile'
  | 'cancelled'
  | 'capacity'
  | 'host-error';

export interface ColorSystemGenericSourceInventoryV2Result {
  status: ColorSystemGenericSourceInventoryV2Status;
  snapshot: ColorSystemGenericSourceSnapshotV2 | null;
  auditInventory: FigmaColorInventoryResult | null;
  message: string;
}

interface EvidenceRegistry {
  byId: Map<string, GenericEvidenceRefV2>;
  add(kind: GenericEvidenceKindV2, locator: string, detail?: string): string;
  addSource(evidence: SourceEvidenceLocator): string;
  values(): GenericEvidenceRefV2[];
}

interface AliasResolution {
  value?: GenericColorValueV2;
  gap?: GenericSourceGapKindV2;
  detail?: string;
}

function compareText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function createEvidenceRegistry(): EvidenceRegistry {
  const byId = new Map<string, GenericEvidenceRefV2>();
  const add = (kind: GenericEvidenceKindV2, locator: string, detail?: string): string => {
    const identity = { kind, locator, detail: detail ?? null };
    const evidenceId = `generic-evidence:${deterministicContentHash(identity).slice('sha256:'.length)}`;
    if (!byId.has(evidenceId)) {
      byId.set(evidenceId, {
        evidenceId,
        kind,
        locator,
        ...(detail === undefined ? {} : { detail }),
      });
    }
    return evidenceId;
  };
  return {
    byId,
    add,
    addSource: evidence => add(evidence.kind, evidence.locator, evidence.detail),
    values: () =>
      [...byId.values()].sort((left, right) => compareText(left.evidenceId, right.evidenceId)),
  };
}

function exactChannel(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite normalized channel from 0 through 1.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function colorSpaceForProfile(profile: SnapshotDocumentProfile): GenericColorValueV2['colorSpace'] {
  if (profile === 'srgb') return 'srgb';
  if (profile === 'display-p3') return 'display-p3';
  return 'unverified';
}

function colorFromChannels(
  color: { r: number; g: number; b: number; a?: number },
  alpha: number,
  profile: SnapshotDocumentProfile
): GenericColorValueV2 {
  return {
    colorSpace: colorSpaceForProfile(profile),
    components: [
      exactChannel(color.r, 'Red'),
      exactChannel(color.g, 'Green'),
      exactChannel(color.b, 'Blue'),
    ],
    alpha: exactChannel(alpha * (typeof color.a === 'number' ? color.a : 1), 'Alpha'),
  };
}

function colorFromAudit(value: SourceColorValue): GenericColorValueV2 {
  return {
    colorSpace: value.colorSpace,
    components: [...value.components],
    alpha: value.alpha,
  };
}

function isVariableAlias(value: unknown): value is VariableAlias {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'VARIABLE_ALIAS' &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

function isRawColor(value: unknown): value is RGB | RGBA {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { r?: unknown; g?: unknown; b?: unknown };
  return (
    typeof candidate.r === 'number' &&
    typeof candidate.g === 'number' &&
    typeof candidate.b === 'number'
  );
}

function jsonValue(value: unknown, depth = 0): GenericJsonValueV2 | undefined {
  if (
    depth > 16 ||
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    return undefined;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number')
    return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : undefined;
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      const normalized = jsonValue(item, depth + 1);
      return normalized === undefined ? [] : [normalized];
    });
  }
  if (typeof value !== 'object') return undefined;
  const output: Record<string, GenericJsonValueV2> = Object.create(null);
  for (const key of Object.keys(value as object).sort(compareText)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
    const normalized = jsonValue((value as Record<string, unknown>)[key], depth + 1);
    if (normalized !== undefined) output[key] = normalized;
  }
  return output;
}

function paintPayload(paint: Paint): GenericJsonObjectV2 {
  const source = paint as unknown as Record<string, unknown>;
  const output: Record<string, GenericJsonValueV2> = Object.create(null);
  for (const key of Object.keys(source).sort(compareText)) {
    if (['visible', 'opacity', 'blendMode', 'boundVariables'].includes(key)) continue;
    const normalized = jsonValue(source[key]);
    if (normalized !== undefined) output[key] = normalized;
  }
  return output;
}

function boundColorVariableId(paint: Paint): string | undefined {
  const bound = (paint as Paint & { boundVariables?: { color?: VariableAlias } }).boundVariables
    ?.color;
  return bound?.type === 'VARIABLE_ALIAS' ? bound.id : undefined;
}

function normalizePaint(
  paint: Paint,
  index: number,
  profile: SnapshotDocumentProfile
): GenericPaintRecordV2 {
  const opacity = typeof paint.opacity === 'number' ? paint.opacity : 1;
  const boundVariableId = boundColorVariableId(paint);
  return {
    order: index + 1,
    type: paint.type,
    visible: paint.visible !== false,
    opacity,
    blendMode: paint.blendMode ?? 'NORMAL',
    ...(boundVariableId ? { boundVariableId } : {}),
    ...(paint.type === 'SOLID'
      ? { solidValue: colorFromChannels(paint.color, opacity, profile) }
      : {}),
    payload: paintPayload(paint),
  };
}

function styleDirectDeclaration(
  paints: readonly GenericPaintRecordV2[]
): Pick<GenericPaintStyleV2, 'directDeclaration' | 'governingEligibility'> {
  const visible = paints.filter(paint => paint.visible);
  if (visible.length !== 1 || visible[0].type !== 'SOLID' || !visible[0].solidValue) {
    return { directDeclaration: null, governingEligibility: 'unsupported' };
  }
  const paint = visible[0];
  const solidValue = paint.solidValue;
  if (!solidValue) {
    return { directDeclaration: null, governingEligibility: 'unsupported' };
  }
  const contextDependent = paint.blendMode !== 'NORMAL' || paint.opacity < 1;
  if (contextDependent) {
    return { directDeclaration: null, governingEligibility: 'context-dependent' };
  }
  const directDeclaration = paint.boundVariableId
    ? ({ kind: 'alias', targetVariableId: paint.boundVariableId } as const)
    : ({ kind: 'literal', value: solidValue } as const);
  return {
    directDeclaration,
    governingEligibility: 'eligible',
  };
}

function collectionsFromRaw(inventory: FigmaColorInventoryResult): GenericColorCollectionV2[] {
  return (inventory.rawEvidence?.variableCollections ?? []).map(collection => ({
    collectionId: collection.id,
    name: collection.name,
    defaultModeId:
      collection.defaultModeId ?? collection.modes[0]?.modeId ?? 'missing-default-mode',
    modes: collection.modes.map((mode, index) => ({
      collectionId: collection.id,
      modeId: mode.modeId,
      name: mode.name,
      order: index + 1,
    })),
  }));
}

function sourceEvidenceIds(
  evidence: readonly SourceEvidenceLocator[],
  registry: EvidenceRegistry
): string[] {
  return [...new Set(evidence.map(item => registry.addSource(item)))].sort(compareText);
}

function gap(
  kind: GenericSourceGapKindV2,
  summary: string,
  evidenceIds: readonly string[],
  consumerIds: readonly string[],
  discriminator: unknown = null
): GenericSourceGapV2 {
  return {
    gapId: `generic-gap:${deterministicContentHash({ kind, summary, evidenceIds, consumerIds, discriminator }).slice('sha256:'.length)}`,
    kind,
    status: 'unsupported',
    summary,
    evidenceIds: [...new Set(evidenceIds)].sort(compareText),
    consumerIds: [...new Set(consumerIds)].sort(compareText),
  };
}

function rawVariableValue(variable: Variable, modeId: string): VariableValue | undefined {
  return Object.prototype.hasOwnProperty.call(variable.valuesByMode, modeId)
    ? variable.valuesByMode[modeId]
    : undefined;
}

function resolveAlias(
  variable: Variable,
  modeId: string,
  variablesById: ReadonlyMap<string, Variable>,
  profile: SnapshotDocumentProfile,
  visited: Set<string>,
  depth: number
): AliasResolution {
  if (depth >= MAX_ALIAS_DEPTH) {
    return { gap: 'alias-depth', detail: `Alias depth exceeds ${MAX_ALIAS_DEPTH}.` };
  }
  const identity = `${variable.id}\u0000${modeId}`;
  if (visited.has(identity)) return { gap: 'alias-cycle', detail: 'Alias graph contains a cycle.' };
  visited.add(identity);
  const raw = rawVariableValue(variable, modeId);
  if (raw === undefined) return { gap: 'missing-alias-target', detail: 'Mode value is missing.' };
  if (isRawColor(raw)) {
    if (profile !== 'srgb' && profile !== 'display-p3') {
      return {
        gap: 'unsupported-profile',
        detail: `The ${profile} document profile is unsupported.`,
      };
    }
    return { value: colorFromChannels(raw, 1, profile) };
  }
  if (!isVariableAlias(raw)) {
    return {
      gap: 'missing-alias-target',
      detail: 'Mode value is neither a color nor a Variable alias.',
    };
  }
  const target = variablesById.get(raw.id);
  if (!target) return { gap: 'missing-alias-target', detail: `Alias target ${raw.id} is missing.` };
  if (target.variableCollectionId !== variable.variableCollectionId) {
    return {
      gap: 'cross-collection-alias',
      detail: `Alias target ${raw.id} belongs to another collection; mode-name matching is not authority.`,
    };
  }
  return resolveAlias(target, modeId, variablesById, profile, visited, depth + 1);
}

function variablesFromRaw(
  inventory: FigmaColorInventoryResult,
  profile: SnapshotDocumentProfile,
  registry: EvidenceRegistry,
  gaps: GenericSourceGapV2[]
): GenericColorVariableV2[] {
  const raw = inventory.rawEvidence;
  if (!raw) return [];
  const collectionById = new Map(raw.variableCollections.map(item => [item.id, item]));
  const variablesById = new Map(raw.colorVariables.map(item => [item.id, item]));
  return raw.colorVariables.map(variable => {
    const evidenceId = registry.add('figma-resource', `variable:${variable.id}`, variable.name);
    const collection = collectionById.get(variable.variableCollectionId);
    if (!collection) {
      gaps.push(
        gap(
          'missing-alias-target',
          `Variable ${variable.name} references a missing local collection.`,
          [evidenceId],
          ['source-policy', 'mode-policy'],
          variable.id
        )
      );
    }
    const modes = collection?.modes ?? [];
    const duplicateModeNames = modes.filter(
      (mode, index) => modes.findIndex(candidate => candidate.name === mode.name) !== index
    );
    if (duplicateModeNames.length > 0) {
      gaps.push(
        gap(
          'duplicate-mode-name',
          `Collection ${collection?.name ?? variable.variableCollectionId} repeats a mode name; exact mode IDs remain authoritative.`,
          [evidenceId],
          ['mode-policy'],
          variable.variableCollectionId
        )
      );
    }
    const valuesByMode: GenericVariableModeValueV2[] = modes.map(mode => {
      const value = rawVariableValue(variable, mode.modeId);
      if (value === undefined) {
        gaps.push(
          gap(
            'missing-alias-target',
            `Variable ${variable.name} has no raw value for mode ${mode.name}.`,
            [evidenceId],
            ['source-policy', 'mode-policy'],
            [variable.id, mode.modeId]
          )
        );
        return {
          modeId: mode.modeId,
          modeName: mode.name,
          rawValue: { kind: 'missing' },
          resolution: 'missing',
        };
      }
      if (isRawColor(value)) {
        const rawColor = colorFromChannels(value, 1, profile);
        if (rawColor.alpha < 1) {
          gaps.push(
            gap(
              'context-dependent-color',
              `Variable ${variable.name} mode ${mode.name} is translucent and needs a declared rendered underlay.`,
              [evidenceId],
              ['color-math', 'accessibility'],
              [variable.id, mode.modeId, rawColor.alpha]
            )
          );
        }
        return {
          modeId: mode.modeId,
          modeName: mode.name,
          rawValue: { kind: 'color', value: rawColor },
          ...(profile === 'srgb' || profile === 'display-p3' ? { resolvedValue: rawColor } : {}),
          resolution:
            profile === 'srgb' || profile === 'display-p3' ? 'literal' : 'unsupported-profile',
        };
      }
      if (!isVariableAlias(value)) {
        gaps.push(
          gap(
            'missing-alias-target',
            `Variable ${variable.name} mode ${mode.name} has an unsupported raw value.`,
            [evidenceId],
            ['source-policy'],
            [variable.id, mode.modeId]
          )
        );
        return {
          modeId: mode.modeId,
          modeName: mode.name,
          rawValue: { kind: 'missing' },
          resolution: 'missing',
        };
      }
      const resolution = resolveAlias(variable, mode.modeId, variablesById, profile, new Set(), 0);
      if (resolution.gap) {
        gaps.push(
          gap(
            resolution.gap,
            `Variable ${variable.name} mode ${mode.name}: ${resolution.detail ?? 'alias cannot resolve'}`,
            [evidenceId],
            ['source-policy', 'mode-policy', 'color-math'],
            [variable.id, mode.modeId, value.id]
          )
        );
      }
      if (resolution.value && resolution.value.alpha < 1) {
        gaps.push(
          gap(
            'context-dependent-color',
            `Variable ${variable.name} mode ${mode.name} resolves to a translucent color and needs a declared rendered underlay.`,
            [evidenceId],
            ['color-math', 'accessibility'],
            [variable.id, mode.modeId, resolution.value.alpha]
          )
        );
      }
      return {
        modeId: mode.modeId,
        modeName: mode.name,
        rawValue: { kind: 'alias', targetVariableId: value.id },
        ...(resolution.value ? { resolvedValue: resolution.value } : {}),
        resolution: resolution.value
          ? 'resolved-alias'
          : resolution.gap === 'unsupported-profile'
            ? 'unsupported-profile'
            : 'unresolved-alias',
      };
    });
    return {
      variableId: variable.id,
      name: variable.name,
      description: variable.description ?? '',
      collectionId: variable.variableCollectionId,
      scopes: [...(variable.scopes ?? [])].map(String).sort(compareText),
      valuesByMode,
      evidenceIds: [evidenceId],
    };
  });
}

function stylesFromRaw(
  inventory: FigmaColorInventoryResult,
  profile: SnapshotDocumentProfile,
  registry: EvidenceRegistry,
  gaps: GenericSourceGapV2[]
): GenericPaintStyleV2[] {
  return (inventory.rawEvidence?.paintStyles ?? []).map(style => {
    const evidenceId = registry.add('figma-resource', `style:${style.id}`, style.name);
    const paints = style.paints.map((paint, index) => normalizePaint(paint, index, profile));
    const declaration = styleDirectDeclaration(paints);
    if (declaration.governingEligibility !== 'eligible') {
      gaps.push(
        gap(
          declaration.governingEligibility === 'unsupported'
            ? 'unsupported-paint'
            : 'context-dependent-color',
          `Paint Style ${style.name} is retained but cannot govern a direct opaque normal solid color.`,
          [evidenceId],
          ['source-policy', 'color-math', 'accessibility'],
          style.id
        )
      );
    }
    return {
      styleId: style.id,
      name: style.name,
      description: style.description ?? '',
      paints,
      ...declaration,
      evidenceIds: [evidenceId],
    };
  });
}

function palettesFromAudit(
  inventory: FigmaColorInventoryResult,
  registry: EvidenceRegistry
): GenericPaletteStructureV2[] {
  return (inventory.snapshotInput.sourceSections ?? []).map(section => ({
    structureId: `palette-structure:${section.sourceNodeId}`,
    sectionKind: section.kind,
    title: section.title,
    sourceNodeId: section.sourceNodeId,
    extractionMethod: section.extractionMethod,
    entries: section.entries.map(entry => ({
      entryId: entry.id,
      name: entry.name,
      order: entry.order,
      value: colorFromAudit(entry.value),
      evidenceIds: sourceEvidenceIds(entry.evidence, registry),
    })),
    evidenceIds: sourceEvidenceIds(section.evidence, registry),
  }));
}

function usageFromAudit(
  inventory: FigmaColorInventoryResult,
  registry: EvidenceRegistry
): GenericColorUsageV2[] {
  const contextsByUsageId = new Map<
    string,
    { kinds: Set<GenericUsageContextKindV2>; evidence: SourceEvidenceLocator[] }
  >();
  for (const context of inventory.rawEvidence?.usageContexts ?? []) {
    const current = contextsByUsageId.get(context.usageId) ?? {
      kinds: new Set<GenericUsageContextKindV2>(),
      evidence: [],
    };
    current.kinds.add(context.contextKind);
    current.evidence.push(...context.evidence);
    contextsByUsageId.set(context.usageId, current);
  }
  return inventory.snapshotInput.supportedUsage.map(usage => {
    const proven = contextsByUsageId.get(usage.id);
    const contextKinds = proven
      ? [...proven.kinds].sort(compareText)
      : (['unknown'] as GenericUsageContextKindV2[]);
    return {
      usageId: usage.id,
      ...(usage.tokenId ? { tokenId: usage.tokenId } : {}),
      mode: usage.mode,
      value: colorFromAudit(usage.value),
      count: usage.count,
      contextKinds,
      evidenceIds: sourceEvidenceIds([...usage.evidence, ...(proven?.evidence ?? [])], registry),
    };
  });
}

function librariesFromAudit(
  inventory: FigmaColorInventoryResult,
  registry: EvidenceRegistry,
  gaps: GenericSourceGapV2[]
): GenericEnabledLibraryDescriptorV2[] {
  return inventory.enabledLibraryDescriptors.map(descriptor => {
    const evidenceId = registry.add(
      'enabled-library-descriptor',
      descriptor.collectionKey,
      `${descriptor.libraryName} · ${descriptor.collectionName}`
    );
    gaps.push(
      gap(
        'remote-descriptor-only',
        `Enabled library ${descriptor.libraryName}/${descriptor.collectionName} is supporting metadata only; no values were imported.`,
        [evidenceId],
        ['source-policy'],
        descriptor.collectionKey
      )
    );
    return {
      collectionKey: descriptor.collectionKey,
      collectionName: descriptor.collectionName,
      libraryName: descriptor.libraryName,
      variables: descriptor.variables.map(variable => ({
        key: variable.key,
        name: variable.name,
        resolvedType: variable.resolvedType,
      })),
      evidenceIds: [evidenceId],
    };
  });
}

function auditGaps(
  inventory: FigmaColorInventoryResult,
  registry: EvidenceRegistry
): GenericSourceGapV2[] {
  return inventory.snapshotInput.unsupportedUsage.map(item => {
    const evidenceIds = sourceEvidenceIds(item.evidence, registry);
    const kind: GenericSourceGapKindV2 =
      item.reason === 'unsupported-color-space'
        ? 'unsupported-profile'
        : item.reason === 'unresolved-alias'
          ? 'missing-alias-target'
          : item.reason === 'blend-mode' ||
              item.reason === 'unknown-background' ||
              item.reason === 'transparency'
            ? 'context-dependent-color'
            : 'unsupported-paint';
    return gap(
      kind,
      `${item.detail} (${item.count} observation${item.count === 1 ? '' : 's'}).`,
      evidenceIds,
      ['source-policy', 'color-math', 'accessibility'],
      item.id
    );
  });
}

function scopeFromFrozenScope(
  scope: FigmaColorInventoryFrozenScope,
  inventory: FigmaColorInventoryResult,
  loadedPageIds: ReadonlySet<string>
): GenericSourceScopeV2 {
  const loaded = [...loadedPageIds].sort(compareText);
  return {
    kind: scope.usageScope === 'selection' ? 'selection' : 'current-file',
    usageScope: scope.usageScope,
    selectedNodeIds: scope.usageScope === 'selection' ? [...scope.selectedNodeIds] : [],
    loadedPageIds: loaded.length > 0 ? loaded : [scope.currentPageId],
    excludedPageIds:
      scope.usageScope === 'whole-file'
        ? []
        : scope.pageIds.filter(pageId => pageId !== scope.currentPageId),
    coverage: inventory.partial ? 'partial' : 'complete-supported-scope',
  };
}

function progressiveHost(
  host: FigmaColorInventoryHost,
  options: FigmaColorInventoryOptions,
  scope: FigmaColorInventoryFrozenScope,
  loadedPageIds: Set<string>
): FigmaColorInventoryHost {
  loadedPageIds.add(scope.currentPageId);
  return {
    get root() {
      return host.root;
    },
    get currentPage() {
      return scope.currentPage;
    },
    variables: host.variables,
    ...(host.teamLibrary ? { teamLibrary: host.teamLibrary } : {}),
    getLocalPaintStylesAsync: host.getLocalPaintStylesAsync.bind(host),
    getNodeByIdAsync: host.getNodeByIdAsync.bind(host),
    loadAllPagesAsync: async () => {
      const pages = scope.pages;
      const supportsProgressive = pages.every(
        page =>
          typeof (page as PageNode & { loadAsync?: () => Promise<void> }).loadAsync === 'function'
      );
      if (!supportsProgressive) {
        await host.loadAllPagesAsync.call(host);
        pages.forEach(page => loadedPageIds.add(page.id));
        return;
      }
      for (const page of pages) {
        if (options.isCancelled?.()) return;
        await (page as PageNode & { loadAsync: () => Promise<void> }).loadAsync();
        loadedPageIds.add(page.id);
      }
    },
  };
}

function buildSnapshotInput(
  scope: FigmaColorInventoryFrozenScope,
  options: FigmaColorInventoryOptions,
  inventory: FigmaColorInventoryResult,
  loadedPageIds: ReadonlySet<string>
): ColorSystemGenericSourceSnapshotInputV2 {
  const registry = createEvidenceRegistry();
  const gaps = auditGaps(inventory, registry);
  const collections = collectionsFromRaw(inventory);
  const variables = variablesFromRaw(inventory, options.documentProfile, registry, gaps);
  const paintStyles = stylesFromRaw(inventory, options.documentProfile, registry, gaps);
  const paletteStructures = palettesFromAudit(inventory, registry);
  const usageEvidence = usageFromAudit(inventory, registry);
  const enabledLibraryDescriptors = librariesFromAudit(inventory, registry, gaps);
  const profileEvidenceId = registry.add(
    'audit-observation',
    'document-profile',
    options.documentProfile
  );
  if (options.documentProfile !== 'srgb') {
    gaps.push(
      gap(
        'unsupported-profile',
        `The ${options.documentProfile} document profile is preserved but cannot enter the current sRGB recommendation engine.`,
        [profileEvidenceId],
        ['color-math', 'accessibility', 'source-policy'],
        options.documentProfile
      )
    );
  }
  if (!inventory.rawEvidence) {
    gaps.push(
      gap(
        'partial-inventory',
        'Exact raw collection modes, Variable scopes, and ordered Paint Style paints were unavailable.',
        [registry.add('audit-observation', 'raw-resource-evidence', 'unavailable')],
        ['source-policy', 'mode-policy'],
        'raw-evidence-missing'
      )
    );
  }
  if (inventory.cancelled) {
    gaps.push(
      gap(
        'cancelled',
        'Analysis was cancelled; returned evidence is partial and cannot govern output.',
        [registry.add('audit-observation', 'analysis-status', 'cancelled')],
        ['source-policy'],
        'cancelled'
      )
    );
  } else if (inventory.partial) {
    gaps.push(
      gap(
        'partial-inventory',
        'Analysis returned partial evidence and cannot claim complete source coverage.',
        [registry.add('audit-observation', 'analysis-status', 'partial')],
        ['source-policy'],
        'partial'
      )
    );
  }
  if (
    collections.length === 0 &&
    variables.length === 0 &&
    paintStyles.length === 0 &&
    paletteStructures.length === 0 &&
    usageEvidence.length === 0
  ) {
    gaps.push(
      gap(
        'empty',
        'No supported local color declaration or labeled palette structure was found.',
        [registry.add('audit-observation', 'analysis-status', 'empty')],
        ['source-policy'],
        'empty'
      )
    );
  }
  return {
    capturedAt: inventory.snapshotInput.capturedAt,
    scope: scopeFromFrozenScope(scope, inventory, loadedPageIds),
    documentProfile: options.documentProfile,
    collections,
    variables,
    paintStyles,
    paletteStructures,
    usageEvidence,
    unsupported: [...new Map(gaps.map(item => [item.gapId, item])).values()],
    evidence: registry.values(),
    enabledLibraryDescriptors,
    libraryBoundaryNote: inventory.libraryBoundaryNote,
    scannedNodeCount: inventory.scannedNodeCount,
    cancelled: inventory.cancelled,
    partial: inventory.partial,
  };
}

/**
 * One read-only Figma traversal feeds both the legacy audit snapshot and the
 * strict generic-source snapshot. Whole-file loading is progressive when the
 * host supports PageNode.loadAsync; legacy/test hosts use the existing fallback.
 */
export async function inventoryColorSystemGenericSourceV2(
  host: FigmaColorInventoryHost,
  options: FigmaColorInventoryOptions
): Promise<ColorSystemGenericSourceInventoryV2Result> {
  try {
    // Capture once, synchronously, before resources/libraries yield back to Figma.
    const frozenScope = captureFigmaColorInventoryScope(host, options.usageScope);
    const frozenOptions = { ...options, frozenScope };
    const loadedPageIds = new Set<string>([frozenScope.currentPageId]);
    const auditInventory = await inventoryFigmaColorSystem(
      progressiveHost(host, frozenOptions, frozenScope, loadedPageIds),
      frozenOptions
    );
    const snapshot = buildColorSystemGenericSourceSnapshotV2(
      buildSnapshotInput(frozenScope, frozenOptions, auditInventory, loadedPageIds)
    );
    const empty = snapshot.unsupported.some(item => item.kind === 'empty');
    const status: ColorSystemGenericSourceInventoryV2Status = auditInventory.cancelled
      ? 'cancelled'
      : auditInventory.partial
        ? 'partial'
        : options.documentProfile !== 'srgb'
          ? 'unsupported-profile'
          : empty
            ? 'empty'
            : 'ready';
    return {
      status,
      snapshot,
      auditInventory,
      message:
        status === 'ready'
          ? 'Supported local source evidence is ready for deterministic policy review.'
          : (snapshot.unsupported[0]?.summary ?? 'Generic source analysis requires review.'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Figma source analysis failed.';
    const status: ColorSystemGenericSourceInventoryV2Status = /limit|capacity|exceed/i.test(message)
      ? 'capacity'
      : 'host-error';
    return { status, snapshot: null, auditInventory: null, message };
  }
}
