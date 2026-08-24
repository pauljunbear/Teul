import {
  OBSERVED_LITERAL_EVIDENCE_LIMIT,
  OBSERVED_LITERAL_MODE_GROUP_ID,
  SOURCE_COLOR_SECTION_KINDS,
  STRUCTURED_SOURCE_MODE_GROUP_ID,
  type SnapshotDocumentProfile,
  type SnapshotUsageScope,
  type SourceColorToken,
  type SourceColorSection,
  type SourceColorSectionEntry,
  type SourceColorSectionKind,
  type SourceColorUsage,
  type SourceColorValue,
  type SourceEvidenceLocator,
  type SourceSystemSnapshotInput,
  type UnsupportedColorReason,
  type UnsupportedColorUsage,
} from '../types/colorSystemAudit';
import {
  COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS,
  deterministicContentHash,
  observedLiteralCandidateIdentity,
} from '../lib/colorSystemAudit';
import { inferScalePosition, inferSourceRoleEvidence } from '../lib/colorSystemRoleInference';
import {
  normalizeSourceSectionHeading,
  sourceSectionKindForHeading,
} from '../lib/colorSystemSourceSectionPolicy';
import { isTeulColorResource, isTeulColorSystemAuditOutput } from './colorResourceOwnership';

const TRAVERSAL_BATCH_SIZE = 250;
const MAX_EVIDENCE_PER_OBSERVATION = OBSERVED_LITERAL_EVIDENCE_LIMIT;
const MAX_AUDIT_RESOURCES = 50_000;
const MAX_AUDIT_MODES = 128;
const MAX_ENABLED_LIBRARY_COLLECTIONS = 1_000;
const MAX_ENABLED_LIBRARY_VARIABLES = 50_000;
const MAX_ENABLED_LIBRARY_VARIABLES_TOTAL = 50_000;
/** Fail-closed snapshot capacity; UI presentation is bounded separately. */
export const MAX_OBSERVED_LITERAL_SOURCE_CANDIDATES = COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources;
export const MAX_FIGMA_VARIABLE_ALIAS_DEPTH = 64;
export const MAX_FIGMA_COLOR_TRAVERSED_NODES = COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.usage;

const STRUCTURED_HEX_LABEL = /#[0-9a-f]{6}\b/gi;
const STRUCTURED_ALPHA_LABEL =
  /(?:opacity|alpha)\s*:?\s*(\d{1,3}(?:\.\d+)?)\s*%|(\d{1,3}(?:\.\d+)?)\s*%\s*(?:opacity|alpha)/i;
const MAX_STRUCTURED_SOURCE_LABELS = COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources;
const MAX_STRUCTURED_SOURCE_NODES = COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.usage;
const STRUCTURED_SOURCE_ROW_TOLERANCE = 4;

export interface ColorSystemAuditProgress {
  phase: 'resources' | 'usage' | 'libraries' | 'complete';
  completed: number;
  total: number;
  pageName?: string;
  message: string;
}

export interface EnabledLibraryVariableDescriptor {
  collectionKey: string;
  collectionName: string;
  libraryName: string;
  variables: readonly {
    key: string;
    name: string;
    resolvedType: VariableResolvedDataType;
  }[];
}

export interface FigmaColorInventoryResult {
  snapshotInput: SourceSystemSnapshotInput;
  cancelled: boolean;
  partial: boolean;
  scannedNodeCount: number;
  enabledLibraryDescriptors: readonly EnabledLibraryVariableDescriptor[];
  libraryBoundaryNote: string;
  /**
   * Backend-only raw resource evidence captured by the same async calls that
   * produced snapshotInput. It is never posted to the iframe. Generic intake
   * uses it to retain exact collection mode IDs/scopes and ordered Style paints
   * without a second Figma traversal.
   */
  rawEvidence?: FigmaColorInventoryRawEvidence;
}

export interface FigmaColorInventoryRawEvidence {
  variableCollections: readonly VariableCollection[];
  colorVariables: readonly Variable[];
  paintStyles: readonly PaintStyle[];
  usageContexts: readonly FigmaColorInventoryUsageContextEvidence[];
}

export type FigmaColorInventoryUsageContextKind = 'text' | 'chart' | 'product-graphic';

export interface FigmaColorInventoryUsageContextEvidence {
  usageId: string;
  contextKind: FigmaColorInventoryUsageContextKind;
  evidence: readonly SourceEvidenceLocator[];
}

export interface FigmaColorInventoryOptions {
  usageScope: Exclude<SnapshotUsageScope, 'not-applicable'>;
  documentProfile: SnapshotDocumentProfile;
  sourceLocator: string;
  authorization: SourceSystemSnapshotInput['authorization'];
  includeEnabledLibraryDescriptors: boolean;
  confirmWholeFile: boolean;
  capturedAt?: string;
  onProgress?: (progress: ColorSystemAuditProgress) => void;
  isCancelled?: () => boolean;
  /**
   * Backend-only scope captured synchronously before the first async host read.
   * Callers that compose more than one inventory representation pass the same
   * receipt through every phase so page/selection changes cannot mix evidence.
   */
  frozenScope?: FigmaColorInventoryFrozenScope;
}

export interface FigmaColorInventoryHost {
  readonly root: DocumentNode;
  readonly currentPage: PageNode;
  readonly variables: Pick<
    VariablesAPI,
    'getLocalVariablesAsync' | 'getLocalVariableCollectionsAsync' | 'getVariableByIdAsync'
  >;
  readonly teamLibrary?: Pick<
    TeamLibraryAPI,
    'getAvailableLibraryVariableCollectionsAsync' | 'getVariablesInLibraryCollectionAsync'
  >;
  getLocalPaintStylesAsync(): Promise<PaintStyle[]>;
  getNodeByIdAsync(id: string): Promise<BaseNode | null>;
  loadAllPagesAsync(): Promise<void>;
}

/**
 * The exact document scope authorized when Analyze starts. Node references are
 * retained only in the plugin backend and are never posted to the iframe.
 */
export interface FigmaColorInventoryFrozenScope {
  usageScope: Exclude<SnapshotUsageScope, 'not-applicable'>;
  currentPage: PageNode;
  currentPageId: string;
  currentPageName: string;
  selectedNodeIds: readonly string[];
  selectionRoots: readonly SceneNode[];
  currentPageRoots: readonly SceneNode[];
  pages: readonly PageNode[];
  pageIds: readonly string[];
}

interface UsageAccumulator {
  value: SourceColorValue;
  tokenId?: string;
  mode: string;
  count: number;
  evidence: SourceEvidenceLocator[];
  contextEvidence: Map<FigmaColorInventoryUsageContextKind, SourceEvidenceLocator[]>;
}

interface UnsupportedAccumulator {
  reason: UnsupportedColorReason;
  detail: string;
  count: number;
  evidence: SourceEvidenceLocator[];
}

interface VariableModeResolution {
  value?: RGB | RGBA;
  aliasTargetId?: string;
  unresolvedAlias?: string;
  aliasDepth: number;
  cancelled?: true;
  depthExceeded?: true;
}

interface VariableResolutionContext {
  host: FigmaColorInventoryHost;
  collectionsById: ReadonlyMap<string, VariableCollection>;
  localVariablesById: ReadonlyMap<string, Variable>;
  variableLookupCache: Map<string, Promise<Variable | null>>;
  resolutionCache: Map<string, VariableModeResolution>;
  excludedAuditVariableIds: ReadonlySet<string>;
  isCancelled?: () => boolean;
}

function createRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function variableModeKey(variableId: string, modeId: string, modeName: string): string {
  return JSON.stringify([variableId, modeId, modeName]);
}

function lookupVariable(
  host: FigmaColorInventoryHost,
  cache: Map<string, Promise<Variable | null>>,
  id: string
): Promise<Variable | null> {
  let lookup = cache.get(id);
  if (!lookup) {
    lookup = host.variables.getVariableByIdAsync(id);
    cache.set(id, lookup);
  }
  return lookup;
}

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function compareText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function assertCombinedDeclarationCapacity(
  variableCount: number,
  styleCount: number,
  paletteEntryCount: number
): void {
  const declarationCount = variableCount + styleCount + paletteEntryCount;
  if (declarationCount > MAX_AUDIT_RESOURCES) {
    throw new Error(
      `Combined local color declarations (Variables, Paint Styles, and palette entries) exceed the capacity of ${MAX_AUDIT_RESOURCES}.`
    );
  }
}

function byteHex(value: number): string {
  return Math.round(clampChannel(value) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function colorValue(color: RGB, alpha: number, profile: SnapshotDocumentProfile): SourceColorValue {
  if (profile !== 'srgb' && profile !== 'display-p3') {
    throw new Error(`${profile} channels cannot be represented as verified sRGB or Display P3.`);
  }
  const components = [clampChannel(color.r), clampChannel(color.g), clampChannel(color.b)] as const;
  return {
    colorSpace: profile === 'display-p3' ? 'display-p3' : 'srgb',
    ...(profile === 'display-p3'
      ? {}
      : { hex: `#${byteHex(components[0])}${byteHex(components[1])}${byteHex(components[2])}` }),
    components,
    alpha: clampChannel(alpha),
  };
}

function childNodes(node: BaseNode): readonly BaseNode[] {
  return 'children' in node ? (node.children as readonly BaseNode[]) : [];
}

function nativeDescendants(root: BaseNode): BaseNode[] {
  const result: BaseNode[] = [];
  const stack = [...childNodes(root)].reverse();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if ('visible' in node && node.visible === false) continue;
    result.push(node);
    const children = childNodes(node);
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
  return result;
}

function boundedSourceDescendants(root: BaseNode, isCancelled?: () => boolean): BaseNode[] | null {
  const result: BaseNode[] = [];
  const stack = [...childNodes(root)].reverse();
  while (stack.length > 0) {
    if (result.length % TRAVERSAL_BATCH_SIZE === 0 && isCancelled?.()) return null;
    const node = stack.pop();
    if (!node) continue;
    if ('visible' in node && node.visible === false) continue;
    result.push(node);
    if (result.length > MAX_STRUCTURED_SOURCE_NODES) {
      throw new Error(
        `A structured source section exceeds the extraction capacity of ${MAX_STRUCTURED_SOURCE_NODES} nodes; select a narrower source frame.`
      );
    }
    const children = childNodes(node);
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
  return result;
}

function nodeText(node: BaseNode): string | null {
  return node.type === 'TEXT' && typeof node.characters === 'string' ? node.characters : null;
}

function hexLabels(node: BaseNode): string[] {
  const text = nodeText(node);
  return text ? (text.match(STRUCTURED_HEX_LABEL) ?? []).map(hex => hex.toUpperCase()) : [];
}

function isStructuredHexLabel(node: BaseNode, hex: string): boolean {
  const text = nodeText(node);
  if (!text) return false;
  return text.split(/\r?\n/).some(line => {
    const normalized = line.trim();
    const match =
      /^(?:hex(?:adecimal)?\s*:?\s*)?(#[0-9a-f]{6})(?:\s*(?:[,·/]|at)?\s*(?:(?:opacity|alpha)\s*:?\s*)?\d{1,3}(?:\.\d+)?\s*%)?$/i.exec(
        normalized
      );
    return match?.[1].toUpperCase() === hex.toUpperCase();
  });
}

function nearestSingleLabelContainer(
  labelNode: BaseNode,
  sectionNode: BaseNode,
  labelCountByAncestorId: ReadonlyMap<string, number>
): BaseNode {
  let current = labelNode.parent;
  let container: BaseNode = labelNode;
  while (current && current.id !== sectionNode.id) {
    if (labelCountByAncestorId.get(current.id) !== 1) break;
    container = current;
    current = current.parent;
  }
  return container;
}

function isStructuredColorName(value: string, sectionTitle: string): boolean {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 80) return false;
  if (!/[a-z]/i.test(normalized) || normalized.split(/\s+/).length > 6) return false;
  if (normalizeSourceSectionHeading(normalized) === normalizeSourceSectionHeading(sectionTitle)) {
    return false;
  }
  if (/#[0-9a-f]{6}/i.test(normalized)) return false;
  if (/\b(?:rgb|rgba|cmyk|hsl|hsla|oklab|oklch|lab|lch)\b\s*:?/i.test(normalized)) return false;
  if (/^(?:opacity|alpha)?\s*\d{1,3}(?:\.\d+)?\s*%/i.test(normalized)) return false;
  if (/\b(?:color|typography)\s+palette\b/i.test(normalized)) return false;
  if (/[.!?]$/.test(normalized)) return false;
  return true;
}

function nameBeforeHex(text: string, hex: string, sectionTitle: string): string | null {
  const upperText = text.toUpperCase();
  const hexIndex = upperText.indexOf(hex.toUpperCase());
  if (hexIndex < 0) return null;
  const preceding = text.slice(0, hexIndex).split(/\r?\n/).reverse();
  for (const candidate of preceding) {
    const name = candidate
      .trim()
      .replace(/[·,:;-]+$/, '')
      .trim();
    if (isStructuredColorName(name, sectionTitle)) return name;
  }
  return null;
}

function entryName(
  labelNode: BaseNode,
  container: BaseNode,
  hex: string,
  sectionTitle: string
): { name: string; node: BaseNode } | null {
  const labelText = nodeText(labelNode) ?? '';
  const inline = nameBeforeHex(labelText, hex, sectionTitle);
  if (inline) return { name: inline, node: labelNode };
  const textNodes = [container, ...nativeDescendants(container)].filter(
    node => node.type === 'TEXT' && node.id !== labelNode.id
  );
  for (let index = textNodes.length - 1; index >= 0; index -= 1) {
    const textNode = textNodes[index];
    const lines = (nodeText(textNode) ?? '').split(/\r?\n/).reverse();
    for (const line of lines) {
      const name = line
        .trim()
        .replace(/[·,:;-]+$/, '')
        .trim();
      if (isStructuredColorName(name, sectionTitle)) return { name, node: textNode };
    }
  }
  return null;
}

function percentAlpha(value: string, hex: string): number | null {
  const named = STRUCTURED_ALPHA_LABEL.exec(value);
  STRUCTURED_ALPHA_LABEL.lastIndex = 0;
  const namedValue = named?.[1] ?? named?.[2];
  if (namedValue !== undefined) {
    const alpha = Number(namedValue) / 100;
    return alpha >= 0 && alpha <= 1 ? alpha : null;
  }
  const hexIndex = value.toUpperCase().indexOf(hex.toUpperCase());
  if (hexIndex >= 0) {
    const suffix = value.slice(hexIndex + hex.length);
    const adjacent = /^\s*(?:[,·/]\s*)?(\d{1,3}(?:\.\d+)?)\s*%/.exec(suffix);
    if (adjacent) {
      const alpha = Number(adjacent[1]) / 100;
      return alpha >= 0 && alpha <= 1 ? alpha : null;
    }
  }
  return null;
}

function matchingPaintAlpha(container: BaseNode, hex: string): number | null {
  for (const node of [container, ...nativeDescendants(container)]) {
    if (node.type === 'TEXT' || !('fills' in node) || !Array.isArray(node.fills)) continue;
    for (const paint of node.fills) {
      if (paint.visible === false || paint.type !== 'SOLID') continue;
      const paintHex = `#${byteHex(paint.color.r)}${byteHex(paint.color.g)}${byteHex(paint.color.b)}`;
      if (paintHex !== hex.toUpperCase()) continue;
      const nodeOpacity = 'opacity' in node && typeof node.opacity === 'number' ? node.opacity : 1;
      let alpha = (paint.opacity ?? 1) * nodeOpacity;
      let parent = node.id === container.id ? null : node.parent;
      while (parent) {
        if ('opacity' in parent && typeof parent.opacity === 'number') alpha *= parent.opacity;
        if (parent.id === container.id) break;
        parent = parent.parent;
      }
      return clampChannel(alpha);
    }
  }
  return null;
}

function structuredEntryAlpha(
  labelNode: BaseNode,
  container: BaseNode,
  hex: string,
  paintAlpha: number | null
): number {
  for (const node of [labelNode, container, ...nativeDescendants(container)]) {
    const text = nodeText(node);
    if (!text) continue;
    const alpha = percentAlpha(text, hex);
    if (alpha !== null) return alpha;
  }
  return paintAlpha ?? 1;
}

function srgbValueFromHex(hex: string, alpha: number): SourceColorValue {
  const normalized = hex.toUpperCase();
  return {
    colorSpace: 'srgb',
    hex: normalized,
    components: [
      Number.parseInt(normalized.slice(1, 3), 16) / 255,
      Number.parseInt(normalized.slice(3, 5), 16) / 255,
      Number.parseInt(normalized.slice(5, 7), 16) / 255,
    ],
    alpha,
  };
}

function nodeBounds(node: BaseNode): { x: number; y: number } | null {
  if (!('absoluteBoundingBox' in node) || !node.absoluteBoundingBox) return null;
  return { x: node.absoluteBoundingBox.x, y: node.absoluteBoundingBox.y };
}

function extractSourceSection(
  sectionNode: BaseNode,
  kind: SourceColorSectionKind,
  isCancelled?: () => boolean
): SourceColorSection | null {
  const descendants = boundedSourceDescendants(sectionNode, isCancelled);
  if (!descendants) return null;
  const labelNodes: BaseNode[] = [];
  for (const node of descendants) {
    const hexCount = hexLabels(node).length;
    if (hexCount === 1) labelNodes.push(node);
    if (labelNodes.length > MAX_STRUCTURED_SOURCE_LABELS) {
      throw new Error(
        `A structured source section exceeds the extraction capacity of ${MAX_STRUCTURED_SOURCE_LABELS} labelled colors; select a narrower source frame.`
      );
    }
  }
  const labelCountByAncestorId = new Map<string, number>();
  for (const labelNode of labelNodes) {
    let ancestor = labelNode.parent;
    while (ancestor && ancestor.id !== sectionNode.id) {
      labelCountByAncestorId.set(ancestor.id, (labelCountByAncestorId.get(ancestor.id) ?? 0) + 1);
      ancestor = ancestor.parent;
    }
  }
  const candidates: Array<{
    labelNode: BaseNode;
    nameNode: BaseNode;
    name: string;
    hex: string;
    alpha: number;
    bounds: { x: number; y: number } | null;
  }> = [];
  for (let sourceIndex = 0; sourceIndex < labelNodes.length; sourceIndex += 1) {
    if (sourceIndex % TRAVERSAL_BATCH_SIZE === 0 && isCancelled?.()) return null;
    const labelNode = labelNodes[sourceIndex];
    const [hex] = hexLabels(labelNode);
    if (!hex) continue;
    if (!isStructuredHexLabel(labelNode, hex)) {
      continue;
    }
    const container = nearestSingleLabelContainer(labelNode, sectionNode, labelCountByAncestorId);
    const paintAlpha = matchingPaintAlpha(container, hex);
    if (paintAlpha === null) continue;
    const title = sectionNode.name.trim();
    const named = entryName(labelNode, container, hex, title);
    if (!named) continue;
    candidates.push({
      labelNode,
      nameNode: named.node,
      name: named.name,
      hex,
      alpha: structuredEntryAlpha(labelNode, container, hex, paintAlpha),
      bounds: nodeBounds(container) ?? nodeBounds(labelNode),
    });
  }
  const positioned = candidates.filter(candidate => candidate.bounds !== null);
  positioned.sort((first, second) => {
    const firstBounds = first.bounds as { x: number; y: number };
    const secondBounds = second.bounds as { x: number; y: number };
    return (
      firstBounds.y - secondBounds.y ||
      firstBounds.x - secondBounds.x ||
      compareText(first.labelNode.id, second.labelNode.id)
    );
  });
  const rowByLabelId = new Map<string, number>();
  let rowIndex = -1;
  let rowStart = Number.NEGATIVE_INFINITY;
  for (const candidate of positioned) {
    const y = (candidate.bounds as { x: number; y: number }).y;
    if (rowIndex < 0 || y - rowStart > STRUCTURED_SOURCE_ROW_TOLERANCE) {
      rowIndex += 1;
      rowStart = y;
    }
    rowByLabelId.set(candidate.labelNode.id, rowIndex);
  }
  candidates.sort((first, second) => {
    const firstRow = rowByLabelId.get(first.labelNode.id);
    const secondRow = rowByLabelId.get(second.labelNode.id);
    if (firstRow !== undefined && secondRow !== undefined) {
      const firstBounds = first.bounds as { x: number; y: number };
      const secondBounds = second.bounds as { x: number; y: number };
      return (
        firstRow - secondRow ||
        firstBounds.x - secondBounds.x ||
        firstBounds.y - secondBounds.y ||
        compareText(first.labelNode.id, second.labelNode.id)
      );
    }
    if (firstRow !== undefined) {
      return -1;
    }
    if (secondRow !== undefined) {
      return 1;
    }
    return compareText(first.labelNode.id, second.labelNode.id);
  });
  if (candidates.length === 0) return null;
  const entries: SourceColorSectionEntry[] = candidates.map((candidate, index) => ({
    id: `source-section:${kind}:${candidate.labelNode.id}:${index + 1}`,
    name: candidate.name,
    order: index + 1,
    value: srgbValueFromHex(candidate.hex, candidate.alpha),
    evidence: [
      {
        kind: 'figma-node',
        locator: candidate.labelNode.id,
        detail: `${candidate.name} · ${candidate.hex} · alpha ${candidate.alpha}`,
      },
      ...(candidate.nameNode.id === candidate.labelNode.id
        ? []
        : [
            {
              kind: 'figma-node' as const,
              locator: candidate.nameNode.id,
              detail: `Native color name · ${candidate.name}`,
            },
          ]),
    ],
  }));
  return {
    kind,
    title: sectionNode.name.trim(),
    sourceNodeId: sectionNode.id,
    extractionMethod: 'explicit-heading',
    entries,
    evidence: [
      {
        kind: 'figma-node',
        locator: sectionNode.id,
        detail: `${sectionNode.name} · structured source section`,
      },
    ],
  };
}

/**
 * Reads explicit native section labels only. It never classifies colors by
 * frequency, chroma, or proximity and never mutates the Figma document.
 */
export function extractStructuredSourceColorSections(
  host: FigmaColorInventoryHost,
  options: Pick<
    FigmaColorInventoryOptions,
    'sourceLocator' | 'authorization' | 'usageScope' | 'isCancelled' | 'frozenScope'
  >
): SourceColorSection[] {
  if (options.authorization.status !== 'user-authorized' || options.isCancelled?.()) return [];
  const sections = new Map<SourceColorSectionKind, SourceColorSection>();
  const scope = resolvedFrozenScope(host, options);
  const scopeRoots: readonly BaseNode[] =
    scope.usageScope === 'selection'
      ? scope.selectionRoots
      : scope.usageScope === 'current-page'
        ? scope.currentPageRoots
        : scope.pages.flatMap(page => page.children);
  const candidatesByKind = new Map<SourceColorSectionKind, BaseNode[]>();
  let scannedScopeNodes = 0;
  for (const root of scopeRoots) {
    const stack: BaseNode[] = [root];
    while (stack.length > 0) {
      if (scannedScopeNodes % TRAVERSAL_BATCH_SIZE === 0 && options.isCancelled?.()) return [];
      const node = stack.pop();
      if (!node) continue;
      if (node.id !== root.id && 'visible' in node && node.visible === false) continue;
      if (scannedScopeNodes >= MAX_FIGMA_COLOR_TRAVERSED_NODES) {
        throw new Error(
          `Structured source traversal exceeds the capacity of ${MAX_FIGMA_COLOR_TRAVERSED_NODES} nodes; select a narrower usage scope.`
        );
      }
      scannedScopeNodes += 1;
      const children = childNodes(node);
      if (children.length > 0 && !isInsideAuditOutput(node)) {
        const kind = sourceSectionKindForHeading(node.name);
        if (kind) {
          const existing = candidatesByKind.get(kind) ?? [];
          existing.push(node);
          candidatesByKind.set(kind, existing);
        }
      }
      for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
    }
  }
  if ([...candidatesByKind.values()].some(candidates => candidates.length > 1)) return [];
  for (const kind of SOURCE_COLOR_SECTION_KINDS) {
    if (options.isCancelled?.()) return [];
    const [candidate] = candidatesByKind.get(kind) ?? [];
    if (!candidate) continue;
    const section = extractSourceSection(candidate, kind, options.isCancelled);
    if (section) sections.set(kind, section);
  }
  const result = SOURCE_COLOR_SECTION_KINDS.flatMap(kind => {
    const section = sections.get(kind);
    return section ? [section] : [];
  });
  const entryCount = result.reduce((count, section) => count + section.entries.length, 0);
  if (entryCount > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources) {
    throw new Error(
      `Structured source sections exceed the snapshot capacity of ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources} labelled colors; select a narrower usage scope.`
    );
  }
  return result;
}

function isVariableAlias(value: VariableValue): value is VariableAlias {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'VARIABLE_ALIAS' &&
    'id' in value &&
    typeof value.id === 'string'
  );
}

async function variableDependsOnAuditOutput(
  host: FigmaColorInventoryHost,
  variableLookupCache: Map<string, Promise<Variable | null>>,
  excludedAuditVariableIds: ReadonlySet<string>,
  dependencyCache: Map<string, Promise<boolean>>,
  variableId: string,
  resolvedVariableModes?: Readonly<Record<string, string>>,
  visiting: ReadonlySet<string> = new Set()
): Promise<boolean> {
  if (excludedAuditVariableIds.has(variableId)) return true;
  const variable = await lookupVariable(host, variableLookupCache, variableId);
  if (!variable || variable.resolvedType !== 'COLOR') return false;
  const activeModeId = resolvedVariableModes?.[variable.variableCollectionId];
  const dependencyKey = `${variableId}\u0000${activeModeId ?? '*'}`;
  if (visiting.has(dependencyKey)) return false;
  const cached = dependencyCache.get(dependencyKey);
  if (cached) return cached;
  const nextVisiting = new Set(visiting).add(dependencyKey);
  const result = (async (): Promise<boolean> => {
    const values = activeModeId
      ? [variable.valuesByMode[activeModeId]]
      : Object.values(variable.valuesByMode);
    for (const rawValue of values) {
      if (!isVariableAlias(rawValue)) continue;
      if (excludedAuditVariableIds.has(rawValue.id)) return true;
      if (
        await variableDependsOnAuditOutput(
          host,
          variableLookupCache,
          excludedAuditVariableIds,
          dependencyCache,
          rawValue.id,
          resolvedVariableModes,
          nextVisiting
        )
      ) {
        return true;
      }
    }
    return false;
  })();
  dependencyCache.set(variableId, result);
  return result;
}

function isColorVariableValue(value: VariableValue): value is RGB | RGBA {
  return (
    typeof value === 'object' &&
    value !== null &&
    'r' in value &&
    'g' in value &&
    'b' in value &&
    typeof value.r === 'number' &&
    typeof value.g === 'number' &&
    typeof value.b === 'number'
  );
}

function alphaOf(value: RGB | RGBA): number {
  return 'a' in value && typeof value.a === 'number' ? value.a : 1;
}

function pathFromName(name: string): string[] {
  const path = name
    .split('/')
    .map(part => part.trim())
    .filter(Boolean);
  return path.length > 0 ? path : [name || 'Unnamed color'];
}

function resourceEvidence(
  kind: 'variable' | 'style',
  id: string,
  name: string
): SourceEvidenceLocator {
  return {
    kind: 'figma-resource',
    locator: `${kind}:${id}`,
    detail: name,
  };
}

function hasLegacyAuditProvenance(description: string | undefined): boolean {
  const value = description?.trim() ?? '';
  return (
    /^Exact Radix Colors [^·]+ · .+/.test(value) ||
    /^Teul OKLCH v3 · protected step \d+$/.test(value) ||
    /^Source preserved from .+ \[[^\]]+\] #[0-9a-f]{6}$/i.test(value) ||
    /^Approved Teul proposal alias · .+$/.test(value)
  );
}

function legacyAuditCollectionIds(
  variables: readonly Variable[],
  collections: readonly VariableCollection[]
): Set<string> {
  const byCollection = new Map<string, Variable[]>();
  for (const variable of variables) {
    const group = byCollection.get(variable.variableCollectionId) ?? [];
    group.push(variable);
    byCollection.set(variable.variableCollectionId, group);
  }
  return new Set(
    collections
      .filter(collection => {
        if (collection.name !== 'Teul Color System Colors' || !isTeulColorResource(collection)) {
          return false;
        }
        const members = byCollection.get(collection.id) ?? [];
        return (
          members.length > 0 &&
          members.every(
            variable =>
              isTeulColorResource(variable) && hasLegacyAuditProvenance(variable.description)
          )
        );
      })
      .map(collection => collection.id)
  );
}

function isLegacyAuditStyle(style: PaintStyle): boolean {
  return (
    style.name.startsWith('Teul Color System/') &&
    isTeulColorResource(style) &&
    hasLegacyAuditProvenance(style.description)
  );
}

async function resolveVariableModeValue(
  context: VariableResolutionContext,
  variable: Variable,
  modeId: string,
  modeName: string,
  visited: Set<string>,
  depth: number
): Promise<VariableModeResolution> {
  const cacheKey = variableModeKey(variable.id, modeId, modeName);
  const cached = context.resolutionCache.get(cacheKey);
  if (cached) {
    if (cached.value && depth + cached.aliasDepth > MAX_FIGMA_VARIABLE_ALIAS_DEPTH) {
      return {
        aliasTargetId: cached.aliasTargetId,
        unresolvedAlias: variable.id,
        aliasDepth: cached.aliasDepth,
        depthExceeded: true,
      };
    }
    return cached;
  }
  if (visited.has(variable.id)) return { unresolvedAlias: variable.id, aliasDepth: 0 };
  visited.add(variable.id);
  if (!hasOwn(variable.valuesByMode, modeId)) {
    const result = { aliasDepth: 0 };
    context.resolutionCache.set(cacheKey, result);
    return result;
  }
  const rawValue = variable.valuesByMode[modeId];
  if (isColorVariableValue(rawValue)) {
    const result = { value: rawValue, aliasDepth: 0 };
    context.resolutionCache.set(cacheKey, result);
    return result;
  }
  if (!isVariableAlias(rawValue)) {
    const result = { aliasDepth: 0 };
    context.resolutionCache.set(cacheKey, result);
    return result;
  }

  if (context.excludedAuditVariableIds.has(rawValue.id)) {
    const result = { aliasTargetId: rawValue.id, unresolvedAlias: rawValue.id, aliasDepth: 1 };
    context.resolutionCache.set(cacheKey, result);
    return result;
  }

  if (depth >= MAX_FIGMA_VARIABLE_ALIAS_DEPTH) {
    return {
      aliasTargetId: rawValue.id,
      unresolvedAlias: rawValue.id,
      aliasDepth: 1,
      depthExceeded: true,
    };
  }
  if (context.isCancelled?.()) return { aliasDepth: 0, cancelled: true };

  let target = context.localVariablesById.get(rawValue.id) ?? null;
  if (!target) {
    target = await lookupVariable(context.host, context.variableLookupCache, rawValue.id);
    if (context.isCancelled?.()) return { aliasDepth: 0, cancelled: true };
  }
  if (!target || target.resolvedType !== 'COLOR') {
    const result = { aliasTargetId: rawValue.id, unresolvedAlias: rawValue.id, aliasDepth: 1 };
    context.resolutionCache.set(cacheKey, result);
    return result;
  }
  if (
    target.variableCollectionId !== variable.variableCollectionId ||
    !context.collectionsById.has(target.variableCollectionId)
  ) {
    const result = { aliasTargetId: rawValue.id, unresolvedAlias: rawValue.id, aliasDepth: 1 };
    context.resolutionCache.set(cacheKey, result);
    return result;
  }
  // Figma exposes no resource-level mapping between modes in different
  // collections. Only the same collection and exact mode ID are authoritative;
  // mode-name matching would be a heuristic and can report the wrong literal.
  const targetModeId = hasOwn(target.valuesByMode, modeId) ? modeId : undefined;
  if (!targetModeId) {
    const result = { aliasTargetId: rawValue.id, unresolvedAlias: rawValue.id, aliasDepth: 1 };
    context.resolutionCache.set(cacheKey, result);
    return result;
  }
  const targetResolution = await resolveVariableModeValue(
    context,
    target,
    targetModeId,
    modeName,
    visited,
    depth + 1
  );
  if (targetResolution.cancelled) return targetResolution;
  const result: VariableModeResolution = {
    ...targetResolution,
    aliasTargetId: rawValue.id,
    aliasDepth: targetResolution.aliasDepth + 1,
  };
  // Depth failures depend on the caller's starting point and are therefore not
  // safe to reuse for a later, shallower traversal.
  if (!result.depthExceeded) context.resolutionCache.set(cacheKey, result);
  return result;
}

async function inventoryVariables(
  host: FigmaColorInventoryHost,
  profile: SnapshotDocumentProfile,
  unsupported: Map<string, UnsupportedAccumulator>,
  variableLookupCache: Map<string, Promise<Variable | null>>,
  onProgress?: (progress: ColorSystemAuditProgress) => void,
  isCancelled?: () => boolean
): Promise<{
  tokens: SourceColorToken[];
  modes: string[];
  modeNameByCollectionModeId: Map<string, string>;
  variableCount: number;
  excludedAuditVariableIds: readonly string[];
  rawCollections: readonly VariableCollection[];
  rawVariables: readonly Variable[];
  cancelled: boolean;
}> {
  const [allVariables, collections] = await Promise.all([
    host.variables.getLocalVariablesAsync('COLOR'),
    host.variables.getLocalVariableCollectionsAsync(),
  ]);
  if (allVariables.length > MAX_AUDIT_RESOURCES) {
    throw new Error(`Local color variables exceed the audit limit of ${MAX_AUDIT_RESOURCES}.`);
  }
  const excludedLegacyCollectionIds = legacyAuditCollectionIds(allVariables, collections);
  const excludedAuditVariableIds = allVariables
    .filter(
      variable =>
        isTeulColorSystemAuditOutput(variable) ||
        excludedLegacyCollectionIds.has(variable.variableCollectionId)
    )
    .map(variable => variable.id);
  const excludedAuditVariableIdSet = new Set(excludedAuditVariableIds);
  const variables = allVariables.filter(variable => !excludedAuditVariableIdSet.has(variable.id));
  const collectionsById = new Map(collections.map(collection => [collection.id, collection]));
  for (const variable of variables) {
    if (!variableLookupCache.has(variable.id)) {
      variableLookupCache.set(variable.id, Promise.resolve(variable));
    }
  }
  const resolutionContext: VariableResolutionContext = {
    host,
    collectionsById,
    localVariablesById: new Map(variables.map(variable => [variable.id, variable])),
    variableLookupCache,
    resolutionCache: new Map(),
    excludedAuditVariableIds: excludedAuditVariableIdSet,
    isCancelled,
  };
  const tokens: SourceColorToken[] = [];
  const modeNames = new Set<string>();
  const modeNameByCollectionModeId = new Map<string, string>();
  for (const collection of collections) {
    for (const mode of collection.modes) {
      modeNameByCollectionModeId.set(`${collection.id}\u0000${mode.modeId}`, mode.name);
    }
  }
  if (new Set(modeNameByCollectionModeId.values()).size > MAX_AUDIT_MODES) {
    throw new Error(`Local color modes exceed the audit limit of ${MAX_AUDIT_MODES}.`);
  }

  for (let index = 0; index < variables.length; index += 1) {
    if (isCancelled?.()) {
      return {
        tokens,
        modes: [...modeNames].sort(),
        modeNameByCollectionModeId,
        variableCount: variables.length,
        excludedAuditVariableIds,
        rawCollections: collections.filter(collection =>
          variables.some(variable => variable.variableCollectionId === collection.id)
        ),
        rawVariables: variables,
        cancelled: true,
      };
    }
    const variable = variables[index];
    const collection = collectionsById.get(variable.variableCollectionId);
    const collectionModes = collection?.modes ?? [];
    const valuesByMode = createRecord<SourceColorValue>();
    const aliasTargets = new Set<string>();
    const aliasTargetsByMode = createRecord<string>();
    const evidence = [resourceEvidence('variable', variable.id, variable.name)];

    for (const mode of collectionModes) {
      modeNames.add(mode.name);
      const resolved = await resolveVariableModeValue(
        resolutionContext,
        variable,
        mode.modeId,
        mode.name,
        new Set(),
        0
      );
      if (resolved.cancelled) {
        return {
          tokens,
          modes: [...modeNames].sort(),
          modeNameByCollectionModeId,
          variableCount: variables.length,
          excludedAuditVariableIds,
          rawCollections: collections.filter(item =>
            variables.some(candidate => candidate.variableCollectionId === item.id)
          ),
          rawVariables: variables,
          cancelled: true,
        };
      }
      if (resolved.aliasTargetId) {
        aliasTargets.add(resolved.aliasTargetId);
        aliasTargetsByMode[mode.name] = resolved.aliasTargetId;
      }
      if (resolved.value) {
        if (profile === 'srgb' || profile === 'display-p3') {
          valuesByMode[mode.name] = colorValue(resolved.value, alphaOf(resolved.value), profile);
        } else {
          addUnsupported(
            unsupported,
            'unsupported-color-space',
            `Variable ${variable.name} mode ${mode.name} uses an unverified ${profile} document profile.`,
            evidence
          );
        }
      }
      if (resolved.unresolvedAlias) {
        addUnsupported(
          unsupported,
          'unresolved-alias',
          `Variable ${variable.name} has an unresolved alias in mode ${mode.name}.`,
          evidence
        );
      }
    }

    const path = pathFromName(variable.name);
    const everyCollectionModeSharesAlias =
      collectionModes.length > 0 &&
      Object.keys(aliasTargetsByMode).length === collectionModes.length &&
      aliasTargets.size === 1;
    tokens.push({
      id: variable.id,
      name: variable.name,
      path,
      ...(variable.description ? { description: variable.description } : {}),
      modeGroupId: `figma-variable-collection:${variable.variableCollectionId}`,
      valuesByMode,
      ...(everyCollectionModeSharesAlias ? { aliasTargetId: [...aliasTargets][0] } : {}),
      ...(Object.keys(aliasTargetsByMode).length > 0 ? { aliasTargetsByMode } : {}),
      evidence,
      roleEvidence: inferSourceRoleEvidence(variable.name, path, evidence),
      ...(inferScalePosition(path) ? { scalePosition: inferScalePosition(path) } : {}),
    });
    onProgress?.({
      phase: 'resources',
      completed: index + 1,
      total: variables.length,
      message: `Reading local color variables (${index + 1}/${variables.length})`,
    });
    if ((index + 1) % TRAVERSAL_BATCH_SIZE === 0) await yieldToHost(host);
  }

  return {
    tokens,
    modes: [...modeNames].sort(),
    modeNameByCollectionModeId,
    variableCount: variables.length,
    excludedAuditVariableIds,
    rawCollections: collections.filter(collection =>
      variables.some(variable => variable.variableCollectionId === collection.id)
    ),
    rawVariables: variables,
    cancelled: false,
  };
}

function firstSolidPaint(paints: readonly Paint[]): SolidPaint | undefined {
  const visible = paints.filter(paint => paint.visible !== false);
  if (visible.length !== 1 || visible[0].type !== 'SOLID') return undefined;
  return visible[0];
}

async function inventoryStyles(
  host: FigmaColorInventoryHost,
  profile: SnapshotDocumentProfile,
  unsupported: Map<string, UnsupportedAccumulator>,
  existingTokenIds: Set<string>,
  completedOffset: number,
  onProgress?: (progress: ColorSystemAuditProgress) => void,
  isCancelled?: () => boolean
): Promise<{
  tokens: SourceColorToken[];
  styleCount: number;
  excludedAuditStyleTokenIds: readonly string[];
  rawStyles: readonly PaintStyle[];
  cancelled: boolean;
}> {
  const allStyles = await host.getLocalPaintStylesAsync();
  if (allStyles.length > MAX_AUDIT_RESOURCES) {
    throw new Error(`Local paint styles exceed the audit limit of ${MAX_AUDIT_RESOURCES}.`);
  }
  const excludedStyles = allStyles.filter(
    style => isTeulColorSystemAuditOutput(style) || isLegacyAuditStyle(style)
  );
  const excludedAuditStyleTokenIds = excludedStyles.map(style => `style:${style.id}`);
  const excludedStyleIds = new Set(excludedStyles.map(style => style.id));
  const styles = allStyles.filter(style => !excludedStyleIds.has(style.id));
  assertCombinedDeclarationCapacity(completedOffset, styles.length, 0);
  const tokens: SourceColorToken[] = [];
  for (let index = 0; index < styles.length; index += 1) {
    if (index > 0 && index % TRAVERSAL_BATCH_SIZE === 0) await yieldToHost(host);
    if (isCancelled?.()) {
      return {
        tokens,
        styleCount: styles.length,
        excludedAuditStyleTokenIds,
        rawStyles: styles,
        cancelled: true,
      };
    }
    const style = styles[index];
    const evidence = [resourceEvidence('style', style.id, style.name)];
    const solid = firstSolidPaint(style.paints);
    if (!solid) {
      const visiblePaints = style.paints.filter(paint => paint.visible !== false);
      const reason: UnsupportedColorReason =
        visiblePaints.length > 1
          ? 'mixed-paint'
          : visiblePaints[0]?.type === 'GRADIENT_ANGULAR' ||
              visiblePaints[0]?.type === 'GRADIENT_DIAMOND' ||
              visiblePaints[0]?.type === 'GRADIENT_LINEAR' ||
              visiblePaints[0]?.type === 'GRADIENT_RADIAL'
            ? 'gradient'
            : visiblePaints[0]?.type === 'IMAGE'
              ? 'image'
              : visiblePaints[0]?.type === 'VIDEO'
                ? 'video'
                : 'other';
      addUnsupported(
        unsupported,
        reason,
        `Paint style ${style.name} is not one opaque solid paint.`,
        evidence
      );
      continue;
    }
    const alpha = solid.opacity ?? 1;
    if (alpha < 1) {
      addUnsupported(
        unsupported,
        'transparency',
        `Paint style ${style.name} is translucent and requires a rendered background.`,
        evidence
      );
    }
    const normalBlend = solid.blendMode === undefined || solid.blendMode === 'NORMAL';
    if (!normalBlend) {
      addUnsupported(
        unsupported,
        'blend-mode',
        `Paint style ${style.name} uses ${solid.blendMode} blending and is context-dependent.`,
        evidence
      );
    }
    const boundAlias = solid.boundVariables?.color;
    const id = `style:${style.id}`;
    if (existingTokenIds.has(id)) continue;
    const path = pathFromName(style.name);
    tokens.push({
      id,
      name: style.name,
      path,
      modeGroupId: `figma-paint-style:${style.id}`,
      valuesByMode:
        boundAlias || !normalBlend || (profile !== 'srgb' && profile !== 'display-p3')
          ? {}
          : { Default: colorValue(solid.color, alpha, profile) },
      ...(boundAlias ? { aliasTargetId: boundAlias.id } : {}),
      ...(boundAlias ? { aliasTargetsByMode: { Default: boundAlias.id } } : {}),
      evidence,
      roleEvidence: inferSourceRoleEvidence(style.name, path, evidence),
      ...(inferScalePosition(path) ? { scalePosition: inferScalePosition(path) } : {}),
    });
    if (!boundAlias && profile !== 'srgb' && profile !== 'display-p3') {
      addUnsupported(
        unsupported,
        'unsupported-color-space',
        `Paint style ${style.name} uses an unverified ${profile} document profile.`,
        evidence
      );
    }
    onProgress?.({
      phase: 'resources',
      completed: completedOffset + index + 1,
      total: completedOffset + styles.length,
      message: `Reading local paint styles (${index + 1}/${styles.length})`,
    });
  }
  return {
    tokens,
    styleCount: styles.length,
    excludedAuditStyleTokenIds,
    rawStyles: styles,
    cancelled: false,
  };
}

function addEvidence(
  target: SourceEvidenceLocator[],
  evidence: readonly SourceEvidenceLocator[]
): void {
  const byLocatorAndDetail = new Map<string, SourceEvidenceLocator>();
  for (const item of [...target, ...evidence]) {
    const key = JSON.stringify([item.locator, item.detail ?? '']);
    const current = byLocatorAndDetail.get(key);
    if (!current || compareText(item.kind, current.kind) < 0) byLocatorAndDetail.set(key, item);
  }
  const retained = [...byLocatorAndDetail.values()]
    .sort((left, right) => {
      const byLocator = compareText(left.locator, right.locator);
      if (byLocator !== 0) return byLocator;
      const byDetail = compareText(left.detail ?? '', right.detail ?? '');
      if (byDetail !== 0) return byDetail;
      return compareText(left.kind, right.kind);
    })
    .slice(0, MAX_EVIDENCE_PER_OBSERVATION);
  target.splice(0, target.length, ...retained);
}

function boundedEvidence(evidence: readonly SourceEvidenceLocator[]): SourceEvidenceLocator[] {
  const retained: SourceEvidenceLocator[] = [];
  addEvidence(retained, evidence);
  return retained;
}

function addUnsupported(
  accumulator: Map<string, UnsupportedAccumulator>,
  reason: UnsupportedColorReason,
  detail: string,
  evidence: readonly SourceEvidenceLocator[]
): void {
  const key = `${reason}\u0000${detail}`;
  const existing = accumulator.get(key);
  if (existing) {
    existing.count += 1;
    addEvidence(existing.evidence, evidence);
    return;
  }
  accumulator.set(key, { reason, detail, count: 1, evidence: boundedEvidence(evidence) });
}

function usageEvidence(node: SceneNode, field: 'fills' | 'strokes'): SourceEvidenceLocator[] {
  const page = node.parent?.type === 'PAGE' ? node.parent : node.parent?.parent;
  return [
    {
      kind: 'figma-node',
      locator: node.id,
      detail: `${node.name} · ${field}`,
    },
    ...(page?.type === 'PAGE'
      ? [{ kind: 'document-page' as const, locator: page.id, detail: page.name }]
      : []),
  ];
}

function explicitAncestorUsageContext(name: string): FigmaColorInventoryUsageContextKind | null {
  const normalized = name
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
  const unwrapped =
    normalized.startsWith('[') && normalized.endsWith(']')
      ? normalized.slice(1, -1).trim()
      : normalized;
  const label = unwrapped
    .replace(/^teul\s+/, '')
    .replace(/^usage\s+context\s*:\s*/, '')
    .replace(/^context\s*:\s*/, '');
  if (label === 'chart' || label === 'data viz' || label === 'data visualization') return 'chart';
  if (label === 'product graphic' || label === 'product graphics') return 'product-graphic';
  return null;
}

function provableUsageContextEvidence(
  node: SceneNode,
  field: 'fills' | 'strokes'
): ReadonlyMap<FigmaColorInventoryUsageContextKind, SourceEvidenceLocator[]> {
  const contexts = new Map<FigmaColorInventoryUsageContextKind, SourceEvidenceLocator[]>();
  if (node.type === 'TEXT') {
    contexts.set('text', [
      {
        kind: 'figma-node',
        locator: node.id,
        detail: `${node.name} · ${field} · TEXT node proves text usage`,
      },
    ]);
  }
  let ancestor = node.parent;
  while (ancestor && ancestor.type !== 'PAGE' && ancestor.type !== 'DOCUMENT') {
    const contextKind = explicitAncestorUsageContext(ancestor.name);
    if (contextKind) {
      const evidence = contexts.get(contextKind) ?? [];
      addEvidence(evidence, [
        {
          kind: 'figma-node',
          locator: ancestor.id,
          detail: `Explicit ancestor label "${ancestor.name}" proves ${contextKind} usage`,
        },
      ]);
      contexts.set(contextKind, evidence);
    }
    ancestor = ancestor.parent;
  }
  return contexts;
}

function addUsageContextEvidence(
  target: Map<FigmaColorInventoryUsageContextKind, SourceEvidenceLocator[]>,
  source: ReadonlyMap<FigmaColorInventoryUsageContextKind, SourceEvidenceLocator[]>
): void {
  for (const [contextKind, evidence] of source) {
    const retained = target.get(contextKind) ?? [];
    addEvidence(retained, evidence);
    target.set(contextKind, retained);
  }
}

function usageContextSignature(
  contextEvidence: ReadonlyMap<FigmaColorInventoryUsageContextKind, SourceEvidenceLocator[]>
): string {
  const contexts = [...contextEvidence.keys()].sort(compareText);
  return contexts.length > 0 ? contexts.join(',') : 'unknown';
}

function addSupportedUsage(
  accumulator: Map<string, UsageAccumulator>,
  value: SourceColorValue,
  tokenId: string | undefined,
  mode: string,
  evidence: readonly SourceEvidenceLocator[],
  contextEvidence: ReadonlyMap<FigmaColorInventoryUsageContextKind, SourceEvidenceLocator[]>
): void {
  const components = value.components.join(',');
  const key = `${tokenId ?? ''}\u0000${mode}\u0000${value.colorSpace}\u0000${components}\u0000${value.alpha}\u0000${usageContextSignature(contextEvidence)}`;
  const existing = accumulator.get(key);
  if (existing) {
    existing.count += 1;
    addEvidence(existing.evidence, evidence);
    addUsageContextEvidence(existing.contextEvidence, contextEvidence);
    return;
  }
  const retainedContextEvidence = new Map<
    FigmaColorInventoryUsageContextKind,
    SourceEvidenceLocator[]
  >();
  addUsageContextEvidence(retainedContextEvidence, contextEvidence);
  accumulator.set(key, {
    value,
    tokenId,
    mode,
    count: 1,
    evidence: boundedEvidence(evidence),
    contextEvidence: retainedContextEvidence,
  });
}

function ancestorContextIssue(node: SceneNode): string | null {
  let parent = node.parent;
  while (parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT') {
    if ('opacity' in parent && typeof parent.opacity === 'number' && parent.opacity < 1) {
      return `ancestor ${parent.name} has opacity ${parent.opacity}`;
    }
    if (
      'blendMode' in parent &&
      parent.blendMode !== 'NORMAL' &&
      parent.blendMode !== 'PASS_THROUGH'
    ) {
      return `ancestor ${parent.name} uses ${parent.blendMode} blending`;
    }
    parent = parent.parent;
  }
  return null;
}

async function inspectPaintField(
  host: FigmaColorInventoryHost,
  variableLookupCache: Map<string, Promise<Variable | null>>,
  node: SceneNode,
  field: 'fills' | 'strokes',
  paints: readonly Paint[] | PluginAPI['mixed'],
  styleId: string | PluginAPI['mixed'] | undefined,
  profile: SnapshotDocumentProfile,
  modeNameByCollectionModeId: ReadonlyMap<string, string>,
  ignoredAuditTokenIds: ReadonlySet<string>,
  auditDependencyCache: Map<string, Promise<boolean>>,
  supported: Map<string, UsageAccumulator>,
  unsupported: Map<string, UnsupportedAccumulator>
): Promise<void> {
  const evidence = usageEvidence(node, field);
  if (profile !== 'srgb' && profile !== 'display-p3') {
    addUnsupported(
      unsupported,
      'unsupported-color-space',
      `${node.name} ${field} use an unverified ${profile} document profile.`,
      evidence
    );
    return;
  }
  if (!Array.isArray(paints)) {
    addUnsupported(unsupported, 'mixed-paint', `${node.name} has mixed ${field}.`, evidence);
    return;
  }
  const visiblePaints = paints.filter(paint => paint.visible !== false);
  if (visiblePaints.length === 0) return;
  if (visiblePaints.length !== 1) {
    addUnsupported(
      unsupported,
      'mixed-paint',
      `${node.name} has ${visiblePaints.length} visible ${field} paints.`,
      evidence
    );
    return;
  }
  const paint = visiblePaints[0];
  if (paint.type !== 'SOLID') {
    const reason: UnsupportedColorReason = paint.type.startsWith('GRADIENT_')
      ? 'gradient'
      : paint.type === 'IMAGE'
        ? 'image'
        : paint.type === 'VIDEO'
          ? 'video'
          : 'other';
    addUnsupported(unsupported, reason, `${node.name} uses ${paint.type} in ${field}.`, evidence);
    return;
  }
  if (paint.blendMode !== undefined && paint.blendMode !== 'NORMAL') {
    addUnsupported(
      unsupported,
      'blend-mode',
      `${node.name} uses ${paint.blendMode} paint blending for ${field}.`,
      evidence
    );
    return;
  }
  const ancestorIssue = ancestorContextIssue(node);
  if (ancestorIssue) {
    addUnsupported(
      unsupported,
      'transparency',
      `${node.name} has context-dependent ${field}; ${ancestorIssue}.`,
      evidence
    );
    return;
  }
  const nodeOpacity = 'opacity' in node && typeof node.opacity === 'number' ? node.opacity : 1;
  let resolvedColor: RGB | RGBA = paint.color;
  let tokenId = typeof styleId === 'string' && styleId ? `style:${styleId}` : undefined;
  if (tokenId && ignoredAuditTokenIds.has(tokenId)) return;
  let mode = 'rendered';
  const boundVariableId = paint.boundVariables?.color?.id;
  if (boundVariableId) {
    if (ignoredAuditTokenIds.has(boundVariableId)) return;
    const resolvedVariableModes =
      'resolvedVariableModes' in node
        ? (node.resolvedVariableModes as Readonly<Record<string, string>>)
        : undefined;
    if (
      await variableDependsOnAuditOutput(
        host,
        variableLookupCache,
        ignoredAuditTokenIds,
        auditDependencyCache,
        boundVariableId,
        resolvedVariableModes
      )
    ) {
      return;
    }
    const variable = await lookupVariable(host, variableLookupCache, boundVariableId);
    if (!variable || variable.resolvedType !== 'COLOR') {
      addUnsupported(
        unsupported,
        'unresolved-alias',
        `${node.name} has an unresolved bound color variable in ${field}.`,
        evidence
      );
      return;
    }
    let resolved: ReturnType<Variable['resolveForConsumer']>;
    try {
      resolved = variable.resolveForConsumer(node);
    } catch {
      addUnsupported(
        unsupported,
        'unresolved-alias',
        `${node.name} bound color variable could not resolve for this consumer.`,
        evidence
      );
      return;
    }
    if (resolved.resolvedType !== 'COLOR' || !isColorVariableValue(resolved.value)) {
      addUnsupported(
        unsupported,
        'unresolved-alias',
        `${node.name} bound variable did not resolve to a color.`,
        evidence
      );
      return;
    }
    resolvedColor = resolved.value;
    tokenId = variable.id;
    const resolvedModeId = resolvedVariableModes?.[variable.variableCollectionId];
    mode = resolvedModeId
      ? (modeNameByCollectionModeId.get(
          `${variable.variableCollectionId}\u0000${resolvedModeId}`
        ) ?? `resolved-mode:${resolvedModeId}`)
      : 'resolved-for-consumer';
  }
  const alpha = (paint.opacity ?? 1) * nodeOpacity * alphaOf(resolvedColor);
  if (alpha < 1) {
    addUnsupported(
      unsupported,
      'transparency',
      `${node.name} has translucent ${field}; the rendered background is context-dependent.`,
      evidence
    );
    return;
  }
  const nodeBlendMode = 'blendMode' in node ? node.blendMode : 'NORMAL';
  if (nodeBlendMode !== 'NORMAL' && nodeBlendMode !== 'PASS_THROUGH') {
    addUnsupported(
      unsupported,
      'blend-mode',
      `${node.name} uses ${nodeBlendMode} blending for ${field}.`,
      evidence
    );
    return;
  }
  addSupportedUsage(
    supported,
    colorValue(resolvedColor, 1, profile),
    tokenId,
    mode,
    evidence,
    provableUsageContextEvidence(node, field)
  );
}

async function inspectNode(
  host: FigmaColorInventoryHost,
  variableLookupCache: Map<string, Promise<Variable | null>>,
  node: SceneNode,
  profile: SnapshotDocumentProfile,
  modeNameByCollectionModeId: ReadonlyMap<string, string>,
  ignoredAuditTokenIds: ReadonlySet<string>,
  auditDependencyCache: Map<string, Promise<boolean>>,
  supported: Map<string, UsageAccumulator>,
  unsupported: Map<string, UnsupportedAccumulator>
): Promise<void> {
  if ('fills' in node) {
    await inspectPaintField(
      host,
      variableLookupCache,
      node,
      'fills',
      node.fills,
      'fillStyleId' in node ? node.fillStyleId : undefined,
      profile,
      modeNameByCollectionModeId,
      ignoredAuditTokenIds,
      auditDependencyCache,
      supported,
      unsupported
    );
  }
  if ('strokes' in node) {
    await inspectPaintField(
      host,
      variableLookupCache,
      node,
      'strokes',
      node.strokes,
      'strokeStyleId' in node ? node.strokeStyleId : undefined,
      profile,
      modeNameByCollectionModeId,
      ignoredAuditTokenIds,
      auditDependencyCache,
      supported,
      unsupported
    );
  }
}

function childrenOf(node: BaseNode): readonly SceneNode[] {
  return 'children' in node ? node.children.filter(child => child.type !== 'PAGE') : [];
}

function isInsideAuditOutput(node: BaseNode): boolean {
  let current: BaseNode | null = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (isTeulColorSystemAuditOutput(current)) return true;
    current = current.parent;
  }
  return false;
}

function selectionRoots(selection: readonly SceneNode[]): SceneNode[] {
  const selectedIds = new Set(selection.map(node => node.id));
  return selection.filter(node => {
    let parent = node.parent;
    while (parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT') {
      if (selectedIds.has(parent.id)) return false;
      parent = parent.parent;
    }
    return true;
  });
}

/** Capture Analyze scope before any awaited Figma API call can yield. */
export function captureFigmaColorInventoryScope(
  host: FigmaColorInventoryHost,
  usageScope: Exclude<SnapshotUsageScope, 'not-applicable'>
): FigmaColorInventoryFrozenScope {
  const currentPage = host.currentPage;
  const selection = [...currentPage.selection];
  const pages = host.root.children.filter((node): node is PageNode => node.type === 'PAGE');
  return Object.freeze({
    usageScope,
    currentPage,
    currentPageId: currentPage.id,
    currentPageName: currentPage.name,
    selectedNodeIds: Object.freeze(
      usageScope === 'selection' ? selection.map(node => node.id).sort(compareText) : []
    ),
    selectionRoots: Object.freeze(selectionRoots(selection)),
    currentPageRoots: Object.freeze([...currentPage.children]),
    pages: Object.freeze([...pages]),
    pageIds: Object.freeze(pages.map(page => page.id).sort(compareText)),
  });
}

function resolvedFrozenScope(
  host: FigmaColorInventoryHost,
  options: Pick<FigmaColorInventoryOptions, 'usageScope' | 'frozenScope'>
): FigmaColorInventoryFrozenScope {
  const scope = options.frozenScope ?? captureFigmaColorInventoryScope(host, options.usageScope);
  if (scope.usageScope !== options.usageScope) {
    throw new Error('Frozen Figma inventory scope does not match the requested usage scope.');
  }
  return scope;
}

async function yieldToHost(host: FigmaColorInventoryHost): Promise<void> {
  // A Figma API round-trip yields the main-thread sandbox without relying on
  // browser timers, which are unavailable in the plugin main environment.
  await host.getNodeByIdAsync(host.root.id);
}

async function inspectRoots(
  host: FigmaColorInventoryHost,
  variableLookupCache: Map<string, Promise<Variable | null>>,
  roots: readonly SceneNode[],
  profile: SnapshotDocumentProfile,
  modeNameByCollectionModeId: ReadonlyMap<string, string>,
  ignoredAuditTokenIds: ReadonlySet<string>,
  auditDependencyCache: Map<string, Promise<boolean>>,
  supported: Map<string, UsageAccumulator>,
  unsupported: Map<string, UnsupportedAccumulator>,
  progress: { completed: number; total: number },
  pageName: string,
  onProgress?: (progress: ColorSystemAuditProgress) => void,
  isCancelled?: () => boolean
): Promise<{ cancelled: boolean; scanned: number }> {
  const stack = [...roots].reverse();
  let scanned = 0;
  while (stack.length > 0) {
    if (isCancelled?.()) return { cancelled: true, scanned };
    const batch = stack.splice(Math.max(0, stack.length - TRAVERSAL_BATCH_SIZE)).reverse();
    for (const node of batch) {
      if (progress.completed >= MAX_FIGMA_COLOR_TRAVERSED_NODES) {
        throw new Error(
          `Figma node traversal exceeds the capacity of ${MAX_FIGMA_COLOR_TRAVERSED_NODES} nodes; select a narrower usage scope.`
        );
      }
      progress.completed += 1;
      if (isInsideAuditOutput(node)) continue;
      await inspectNode(
        host,
        variableLookupCache,
        node,
        profile,
        modeNameByCollectionModeId,
        ignoredAuditTokenIds,
        auditDependencyCache,
        supported,
        unsupported
      );
      scanned += 1;
      const children = childrenOf(node);
      for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
    }
    progress.total = Math.max(progress.total, progress.completed + stack.length);
    onProgress?.({
      phase: 'usage',
      completed: progress.completed,
      total: progress.total,
      pageName,
      message: `Scanning ${pageName} (${progress.completed} nodes read)`,
    });
    await yieldToHost(host);
  }
  return { cancelled: false, scanned };
}

async function inventoryUsage(
  host: FigmaColorInventoryHost,
  variableLookupCache: Map<string, Promise<Variable | null>>,
  scope: FigmaColorInventoryFrozenScope,
  profile: SnapshotDocumentProfile,
  modeNameByCollectionModeId: ReadonlyMap<string, string>,
  ignoredAuditTokenIds: ReadonlySet<string>,
  supported: Map<string, UsageAccumulator>,
  unsupported: Map<string, UnsupportedAccumulator>,
  onProgress?: (progress: ColorSystemAuditProgress) => void,
  isCancelled?: () => boolean
): Promise<{ cancelled: boolean; scannedNodeCount: number }> {
  const progress = { completed: 0, total: 0 };
  const auditDependencyCache = new Map<string, Promise<boolean>>();
  let scannedNodeCount = 0;
  if (scope.usageScope === 'selection') {
    const result = await inspectRoots(
      host,
      variableLookupCache,
      scope.selectionRoots,
      profile,
      modeNameByCollectionModeId,
      ignoredAuditTokenIds,
      auditDependencyCache,
      supported,
      unsupported,
      progress,
      scope.currentPageName,
      onProgress,
      isCancelled
    );
    return { cancelled: result.cancelled, scannedNodeCount: result.scanned };
  }
  if (scope.usageScope === 'current-page') {
    const result = await inspectRoots(
      host,
      variableLookupCache,
      scope.currentPageRoots,
      profile,
      modeNameByCollectionModeId,
      ignoredAuditTokenIds,
      auditDependencyCache,
      supported,
      unsupported,
      progress,
      scope.currentPageName,
      onProgress,
      isCancelled
    );
    return { cancelled: result.cancelled, scannedNodeCount: result.scanned };
  }

  if (isCancelled?.()) return { cancelled: true, scannedNodeCount };
  await host.loadAllPagesAsync();
  if (isCancelled?.()) return { cancelled: true, scannedNodeCount };
  for (const page of scope.pages) {
    if (isCancelled?.()) return { cancelled: true, scannedNodeCount };
    const result = await inspectRoots(
      host,
      variableLookupCache,
      page.children,
      profile,
      modeNameByCollectionModeId,
      ignoredAuditTokenIds,
      auditDependencyCache,
      supported,
      unsupported,
      progress,
      page.name,
      onProgress,
      isCancelled
    );
    scannedNodeCount += result.scanned;
    if (result.cancelled) return { cancelled: true, scannedNodeCount };
  }
  return { cancelled: false, scannedNodeCount };
}

async function inventoryEnabledLibraryDescriptors(
  host: FigmaColorInventoryHost,
  onProgress?: (progress: ColorSystemAuditProgress) => void,
  isCancelled?: () => boolean
): Promise<{
  descriptors: EnabledLibraryVariableDescriptor[];
  cancelled: boolean;
  truncated: boolean;
}> {
  if (isCancelled?.()) return { descriptors: [], cancelled: true, truncated: false };
  if (!host.teamLibrary) return { descriptors: [], cancelled: false, truncated: false };
  const collections = await host.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  const descriptors: EnabledLibraryVariableDescriptor[] = [];
  let truncated = collections.length > MAX_ENABLED_LIBRARY_COLLECTIONS;
  let includedVariableCount = 0;
  const boundedCollections = collections.slice(0, MAX_ENABLED_LIBRARY_COLLECTIONS);
  for (let index = 0; index < boundedCollections.length; index += 1) {
    if (isCancelled?.()) return { descriptors, cancelled: true, truncated };
    if (includedVariableCount >= MAX_ENABLED_LIBRARY_VARIABLES_TOTAL) {
      truncated = true;
      break;
    }
    const collection = boundedCollections[index];
    const variables = await host.teamLibrary.getVariablesInLibraryCollectionAsync(collection.key);
    const remainingVariables = MAX_ENABLED_LIBRARY_VARIABLES_TOTAL - includedVariableCount;
    const boundedVariableCount = Math.min(MAX_ENABLED_LIBRARY_VARIABLES, remainingVariables);
    if (variables.length > boundedVariableCount) truncated = true;
    const boundedVariables = variables.slice(0, boundedVariableCount);
    includedVariableCount += boundedVariables.length;
    descriptors.push({
      collectionKey: collection.key,
      collectionName: collection.name,
      libraryName: collection.libraryName,
      variables: boundedVariables.map(variable => ({
        key: variable.key,
        name: variable.name,
        resolvedType: variable.resolvedType,
      })),
    });
    onProgress?.({
      phase: 'libraries',
      completed: index + 1,
      total: boundedCollections.length,
      message: `Reading enabled-library descriptors (${index + 1}/${boundedCollections.length})`,
    });
  }
  return { descriptors, cancelled: isCancelled?.() ?? false, truncated };
}

function sortedSupportedUsage(accumulator: Map<string, UsageAccumulator>): UsageAccumulator[] {
  return [...accumulator.values()].sort((left, right) => {
    const leftKey = `${left.tokenId ?? ''}\u0000${left.mode}\u0000${left.value.colorSpace}\u0000${left.value.components.join(',')}\u0000${left.value.alpha}\u0000${usageContextSignature(left.contextEvidence)}`;
    const rightKey = `${right.tokenId ?? ''}\u0000${right.mode}\u0000${right.value.colorSpace}\u0000${right.value.components.join(',')}\u0000${right.value.alpha}\u0000${usageContextSignature(right.contextEvidence)}`;
    return compareText(leftKey, rightKey);
  });
}

function finalizeSupported(accumulator: Map<string, UsageAccumulator>): SourceColorUsage[] {
  return sortedSupportedUsage(accumulator).map((item, index) => ({
    id: `usage-${index + 1}`,
    ...(item.tokenId ? { tokenId: item.tokenId } : {}),
    mode: item.mode,
    value: item.value,
    count: item.count,
    evidence: item.evidence,
  }));
}

function finalizeUsageContexts(
  accumulator: Map<string, UsageAccumulator>
): FigmaColorInventoryUsageContextEvidence[] {
  return sortedSupportedUsage(accumulator).flatMap((item, index) =>
    [...item.contextEvidence.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([contextKind, evidence]) => ({
        usageId: `usage-${index + 1}`,
        contextKind,
        evidence,
      }))
  );
}

export function materializeObservedLiteralSourceCandidates(
  usage: readonly SourceColorUsage[]
): SourceColorToken[] {
  const byExactVariant = new Map<
    string,
    {
      mode: string;
      value: SourceColorValue;
      count: number;
      evidence: SourceEvidenceLocator[];
    }
  >();
  for (const item of usage) {
    if (item.value.colorSpace !== 'srgb' || item.value.alpha !== 1 || !item.value.hex) continue;
    const key = JSON.stringify([
      item.mode,
      item.value.colorSpace,
      item.value.hex.toLowerCase(),
      item.value.components,
      item.value.alpha,
    ]);
    const current = byExactVariant.get(key);
    if (current) {
      current.count += item.count;
      addEvidence(current.evidence, item.evidence);
    } else {
      byExactVariant.set(key, {
        mode: item.mode,
        value: item.value,
        count: item.count,
        evidence: boundedEvidence(item.evidence),
      });
    }
  }
  const eligible = [...byExactVariant.values()];
  if (eligible.length > MAX_OBSERVED_LITERAL_SOURCE_CANDIDATES) {
    throw new Error(
      `Observed literal source candidates exceed the snapshot token capacity of ${MAX_OBSERVED_LITERAL_SOURCE_CANDIDATES}; select a narrower usage scope or author local color tokens before analyzing.`
    );
  }
  return eligible
    .sort((left, right) => {
      const byCount = right.count - left.count;
      if (byCount !== 0) return byCount;
      const byHex = compareText(
        left.value.hex?.toLowerCase() ?? '',
        right.value.hex?.toLowerCase() ?? ''
      );
      if (byHex !== 0) return byHex;
      return compareText(
        `${left.mode}:${left.value.components.join(',')}`,
        `${right.mode}:${right.value.components.join(',')}`
      );
    })
    .map((item, index) => {
      const hex = item.value.hex as string;
      const exactComponents = item.value.components.join(', ');
      const identity = observedLiteralCandidateIdentity(item.mode, item.value);
      if (!identity)
        throw new Error('Observed literal candidate requires an exact sRGB hex value.');
      return {
        id: identity.id,
        name: `Observed ${hex.toUpperCase()} · ${item.mode} · [${exactComponents}]`,
        path: identity.path,
        description: `Observed in ${item.count} exact opaque resolved Figma canvas paint use${item.count === 1 ? '' : 's'}. Exact sRGB components [${exactComponents}] quantize to ${hex.toUpperCase()}; this records canvas output only and does not identify or import a bound variable.`,
        sourceRepresentation: 'observed-literal' as const,
        observedUsageCount: item.count,
        observedUsageRank: index + 1,
        modeGroupId: OBSERVED_LITERAL_MODE_GROUP_ID,
        valuesByMode: { [item.mode]: item.value },
        evidence: [...item.evidence],
        roleEvidence: [],
      };
    });
}

/**
 * Keeps explicitly structured brand swatches usable as proposal anchors when
 * unrelated authored resources disable the all-literal fallback. These are
 * exact source-section values, not variables, styles, or inferred roles.
 */
export function materializeStructuredSourceCandidates(
  sections: readonly SourceColorSection[],
  existingTokens: readonly SourceColorToken[]
): SourceColorToken[] {
  const exactValueKey = (value: SourceColorValue): string | null =>
    value.colorSpace === 'srgb' && value.alpha === 1 && value.hex
      ? `${value.hex.toUpperCase()}\u0000${value.components.join(',')}\u0000${value.alpha}`
      : null;
  const existingValues = new Set(
    existingTokens.flatMap(token =>
      Object.values(token.valuesByMode).flatMap(value => {
        const key = exactValueKey(value);
        return key ? [key] : [];
      })
    )
  );
  const candidates = new Map<
    string,
    {
      name: string;
      value: SourceColorValue;
      evidence: SourceEvidenceLocator[];
      hex: string;
      sectionKinds: Set<SourceColorSectionKind>;
    }
  >();
  for (const section of sections.filter(section =>
    SOURCE_COLOR_SECTION_KINDS.includes(section.kind)
  )) {
    for (const entry of [...section.entries].sort((first, second) => first.order - second.order)) {
      if (entry.value.colorSpace !== 'srgb' || entry.value.alpha !== 1 || !entry.value.hex) {
        continue;
      }
      const hex = entry.value.hex.toUpperCase();
      const valueKey = exactValueKey(entry.value);
      if (!valueKey || existingValues.has(valueKey)) continue;
      const current = candidates.get(valueKey);
      if (current) {
        addEvidence(current.evidence, [...section.evidence, ...entry.evidence]);
        current.sectionKinds.add(section.kind);
      } else {
        candidates.set(valueKey, {
          name: entry.name,
          value: entry.value,
          evidence: boundedEvidence([...section.evidence, ...entry.evidence]),
          hex,
          sectionKinds: new Set([section.kind]),
        });
      }
    }
  }
  const variantCountByHex = new Map<string, number>();
  for (const candidate of candidates.values()) {
    variantCountByHex.set(candidate.hex, (variantCountByHex.get(candidate.hex) ?? 0) + 1);
  }
  return [...candidates.entries()]
    .sort(([first], [second]) => compareText(first, second))
    .map(([valueKey, candidate]) => {
      const sectionKinds = SOURCE_COLOR_SECTION_KINDS.filter(kind =>
        candidate.sectionKinds.has(kind)
      );
      const identitySuffix =
        (variantCountByHex.get(candidate.hex) ?? 0) > 1
          ? `:${deterministicContentHash({ valueKey }).slice('sha256:'.length, 'sha256:'.length + 16)}`
          : '';
      return {
        id: `structured-source:srgb:${candidate.hex.slice(1).toLowerCase()}${identitySuffix}`,
        name: candidate.name,
        path: ['Structured source', sectionKinds.join('+'), candidate.name, candidate.hex],
        description: `Exact opaque swatch from authorized ${sectionKinds.join(', ')} source section${sectionKinds.length === 1 ? '' : 's'}. This is source evidence, not an authored Figma variable or paint style.`,
        sourceRepresentation: 'structured-source' as const,
        modeGroupId: STRUCTURED_SOURCE_MODE_GROUP_ID,
        valuesByMode: { Source: candidate.value },
        evidence: candidate.evidence,
        roleEvidence: [],
      };
    });
}

function finalizeUnsupported(
  accumulator: Map<string, UnsupportedAccumulator>
): UnsupportedColorUsage[] {
  return [...accumulator.values()]
    .sort((left, right) =>
      compareText(`${left.reason}:${left.detail}`, `${right.reason}:${right.detail}`)
    )
    .map((item, index) => ({ id: `unsupported-${index + 1}`, ...item }));
}

/**
 * Reads only Figma document state. It never creates, updates, imports, or removes
 * nodes, styles, collections, or variables.
 */
export async function inventoryFigmaColorSystem(
  host: FigmaColorInventoryHost,
  options: FigmaColorInventoryOptions
): Promise<FigmaColorInventoryResult> {
  if (options.usageScope === 'whole-file' && !options.confirmWholeFile) {
    throw new Error('Whole-file analysis requires explicit confirmation.');
  }
  // This runs before the first await in this async function. Every later
  // usage/palette phase consumes this same receipt rather than live UI state.
  const frozenScope = resolvedFrozenScope(host, options);

  const supported = new Map<string, UsageAccumulator>();
  const unsupported = new Map<string, UnsupportedAccumulator>();
  const variableLookupCache = new Map<string, Promise<Variable | null>>();
  const variableInventory = await inventoryVariables(
    host,
    options.documentProfile,
    unsupported,
    variableLookupCache,
    options.onProgress,
    options.isCancelled
  );
  if (variableInventory.cancelled) {
    return {
      snapshotInput: {
        sourceKind: 'figma-document',
        sourceLocator: options.sourceLocator,
        authorization: options.authorization,
        documentProfile: options.documentProfile,
        resourceScope: {
          kind: 'all-local-resources',
          localVariableCount: variableInventory.variableCount,
          localStyleCount: 0,
        },
        usageScope: options.usageScope,
        capturedAt: options.capturedAt ?? new Date().toISOString(),
        modes: variableInventory.modes,
        tokens: variableInventory.tokens,
        sourceSections: [],
        supportedUsage: [],
        unsupportedUsage: finalizeUnsupported(unsupported),
        declaredPairs: [],
      },
      cancelled: true,
      partial: true,
      scannedNodeCount: 0,
      enabledLibraryDescriptors: [],
      libraryBoundaryNote: 'Enabled-library metadata was not read because analysis was cancelled.',
      rawEvidence: {
        variableCollections: variableInventory.rawCollections,
        colorVariables: variableInventory.rawVariables,
        paintStyles: [],
        usageContexts: [],
      },
    };
  }

  const existingTokenIds = new Set(variableInventory.tokens.map(token => token.id));
  const styleInventory = await inventoryStyles(
    host,
    options.documentProfile,
    unsupported,
    existingTokenIds,
    variableInventory.variableCount,
    options.onProgress,
    options.isCancelled
  );
  if (styleInventory.cancelled) {
    return {
      snapshotInput: {
        sourceKind: 'figma-document',
        sourceLocator: options.sourceLocator,
        authorization: options.authorization,
        documentProfile: options.documentProfile,
        resourceScope: {
          kind: 'all-local-resources',
          localVariableCount: variableInventory.variableCount,
          localStyleCount: styleInventory.styleCount,
        },
        usageScope: options.usageScope,
        capturedAt: options.capturedAt ?? new Date().toISOString(),
        modes: variableInventory.modes,
        tokens: [...variableInventory.tokens, ...styleInventory.tokens],
        sourceSections: [],
        supportedUsage: [],
        unsupportedUsage: finalizeUnsupported(unsupported),
        declaredPairs: [],
      },
      cancelled: true,
      partial: true,
      scannedNodeCount: 0,
      enabledLibraryDescriptors: [],
      libraryBoundaryNote: 'Enabled-library metadata was not read because analysis was cancelled.',
      rawEvidence: {
        variableCollections: variableInventory.rawCollections,
        colorVariables: variableInventory.rawVariables,
        paintStyles: styleInventory.rawStyles,
        usageContexts: [],
      },
    };
  }
  const usage = await inventoryUsage(
    host,
    variableLookupCache,
    frozenScope,
    options.documentProfile,
    variableInventory.modeNameByCollectionModeId,
    new Set([
      ...variableInventory.excludedAuditVariableIds,
      ...styleInventory.excludedAuditStyleTokenIds,
    ]),
    supported,
    unsupported,
    options.onProgress,
    options.isCancelled
  );

  let enabledLibraryDescriptors: EnabledLibraryVariableDescriptor[] = [];
  let libraryInventoryCancelled = false;
  let libraryBoundaryNote =
    'Enabled-library variables are metadata descriptors only; Teul does not import them or claim complete remote-system coverage.';
  if (!usage.cancelled && options.includeEnabledLibraryDescriptors) {
    try {
      const libraryInventory = await inventoryEnabledLibraryDescriptors(
        host,
        options.onProgress,
        options.isCancelled
      );
      enabledLibraryDescriptors = libraryInventory.descriptors;
      libraryInventoryCancelled = libraryInventory.cancelled;
      if (libraryInventoryCancelled) {
        libraryBoundaryNote =
          'Enabled-library metadata enumeration was cancelled; returned descriptors are partial and were not imported.';
      } else if (libraryInventory.truncated) {
        libraryBoundaryNote = `Enabled-library metadata was bounded to ${MAX_ENABLED_LIBRARY_COLLECTIONS} collections, ${MAX_ENABLED_LIBRARY_VARIABLES} variables per collection, and ${MAX_ENABLED_LIBRARY_VARIABLES_TOTAL} variables total; descriptors remain metadata only and were not imported.`;
      }
    } catch (error) {
      libraryBoundaryNote = `Enabled-library descriptors were unavailable: ${
        error instanceof Error ? error.message : 'host permission or plan limitation'
      }`;
    }
  }

  const supportedUsage = finalizeSupported(supported);
  const usageContexts = finalizeUsageContexts(supported);
  const authoredTokens = [...variableInventory.tokens, ...styleInventory.tokens];
  const hasNoLocalColorResources =
    variableInventory.variableCount === 0 && styleInventory.styleCount === 0;
  const observedLiteralCandidates = hasNoLocalColorResources
    ? materializeObservedLiteralSourceCandidates(supportedUsage)
    : [];
  const sourceSections = usage.cancelled
    ? []
    : extractStructuredSourceColorSections(host, { ...options, frozenScope });
  assertCombinedDeclarationCapacity(
    variableInventory.variableCount,
    styleInventory.styleCount,
    sourceSections.reduce((total, section) => total + section.entries.length, 0)
  );
  const structuredSourceCandidates = hasNoLocalColorResources
    ? []
    : materializeStructuredSourceCandidates(sourceSections, authoredTokens);
  if (
    authoredTokens.length + observedLiteralCandidates.length + structuredSourceCandidates.length >
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  ) {
    throw new Error(
      `Source candidates exceed the snapshot token capacity of ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources}; select a narrower usage scope.`
    );
  }
  const sourceExtractionCancelled = !usage.cancelled && (options.isCancelled?.() ?? false);
  const snapshotInput: SourceSystemSnapshotInput = {
    sourceKind: 'figma-document',
    sourceLocator: options.sourceLocator,
    authorization: options.authorization,
    documentProfile: options.documentProfile,
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: variableInventory.variableCount,
      localStyleCount: styleInventory.styleCount,
    },
    usageScope: options.usageScope,
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    modes: [
      ...new Set([
        ...variableInventory.modes,
        ...(styleInventory.tokens.length > 0 ? ['Default'] : []),
        ...observedLiteralCandidates.flatMap(token => Object.keys(token.valuesByMode)),
        ...structuredSourceCandidates.flatMap(token => Object.keys(token.valuesByMode)),
      ]),
    ].sort(),
    tokens: [...authoredTokens, ...observedLiteralCandidates, ...structuredSourceCandidates],
    sourceSections,
    supportedUsage,
    unsupportedUsage: finalizeUnsupported(unsupported),
    declaredPairs: [],
  };
  options.onProgress?.({
    phase: 'complete',
    completed: usage.scannedNodeCount,
    total: usage.scannedNodeCount,
    message:
      usage.cancelled || libraryInventoryCancelled || sourceExtractionCancelled
        ? 'Analysis cancelled with a partial report.'
        : 'Analysis complete.',
  });
  return {
    snapshotInput,
    cancelled: usage.cancelled || libraryInventoryCancelled || sourceExtractionCancelled,
    partial: usage.cancelled || libraryInventoryCancelled || sourceExtractionCancelled,
    scannedNodeCount: usage.scannedNodeCount,
    enabledLibraryDescriptors,
    libraryBoundaryNote,
    rawEvidence: {
      variableCollections: variableInventory.rawCollections,
      colorVariables: variableInventory.rawVariables,
      paintStyles: styleInventory.rawStyles,
      usageContexts,
    },
  };
}
