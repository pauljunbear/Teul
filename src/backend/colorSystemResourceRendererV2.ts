import {
  runColorSystemResourceTransactionV1,
  ColorSystemResourceTransactionPreflightErrorV1,
} from './colorSystemResourceTransactionV1';
import { canonicalJson, deterministicContentHash } from '../lib/colorSystemHashing';
import {
  COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION,
  estimateColorSystemResourceNodesV2,
  type ColorSystemComponentRecipeV2,
  type ColorSystemPrimitiveCollectionRecipeV2,
  type ColorSystemPrimitiveVariableRecipeV2,
  type ColorSystemResourceBlueprintCountsV2,
  type ColorSystemResourceBlueprintV2,
  type ColorSystemRoleFrameResourceRecipeV2,
  type ColorSystemSemanticCollectionRecipeV2,
} from '../lib/colorSystemResourceBlueprintV2';
import { COLOR_SYSTEM_SECTION_ROLES_V2 } from '../lib/colorSystemBuilderV2Contracts';
import { compareText } from '../lib/utils';
import { readColorSystemProductGraphicsRenderingV1 } from '../lib/colorSystemProductGraphicsPlanV1';
import {
  colorSystemProductGraphicsComponentSizeV1,
  layoutColorSystemProductGraphicsComponentsV1,
} from '../lib/colorSystemProductGraphicsLayoutV1';
import type {
  BeginColorSystemCreateJournalV2Input,
  ColorSystemCreateJournalReconciliationV2,
  ColorSystemCreateJournalRuntimeV2,
  ColorSystemCreateJournalV2,
} from './colorSystemCreateJournalV2';
import { COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION } from './colorSystemResourceOwnershipV2';

// p4-DE: owner-supplied spot colors ride into Variable descriptions.
import {
  COLOR_SYSTEM_OWNER_SPOT_COLOR_LIMITS_V2,
  colorSystemOwnerSpotColorLabelV2,
} from '../types/colorSystemBuilderV2Messages';

export const COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION =
  'teul-color-resource-renderer-receipt/v2' as const;
export { COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION } from './colorSystemResourceOwnershipV2';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export type ColorSystemHostResourceKindV2 =
  'collection' | 'variable' | 'style' | 'component' | 'frame' | 'page';

export interface ColorSystemHostResourceRefV2 {
  id: string;
  kind: ColorSystemHostResourceKindV2;
  recipeId: string;
}

export interface ColorSystemRendererHostContextV2 {
  documentType: 'figma-design' | 'figjam' | 'slides' | 'unknown';
  editable: boolean;
  colorProfile: 'srgb' | 'display-p3' | 'unknown';
  currentFileIdentityHash: string;
  capabilities: {
    colorVariables: boolean;
    variableAliases: boolean;
    variableBoundPaintStyles: boolean;
    components: boolean;
    frames: boolean;
  };
}

export interface ColorSystemRendererFontV2 {
  family: string;
  style: string;
}

/** p4-DE: one spot reference the owner typed; written verbatim, never looked up. */
export interface ColorSystemRendererOwnerSpotColorV2 {
  system: 'pantone' | 'other';
  name: string;
  finish: 'coated' | 'uncoated' | 'none';
}

/** p4-DE: the owner's spot references for one Create, dated for the descriptions. */
export interface ColorSystemRendererOwnerSpotColorsV2 {
  /** UTC calendar date (YYYY-MM-DD) the owner supplied them; printed in each description. */
  suppliedOn: string;
  /** Keyed by the family's stable id, exactly as the review's brand surfaces list it. */
  byFamilyId: Readonly<Record<string, ColorSystemRendererOwnerSpotColorV2>>;
}

export interface ColorSystemRendererOwnershipMetadataV2 {
  version: typeof COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION;
  transactionId: string;
  systemId: string;
  recipeId: string;
  resourceBlueprintHash: string;
  sectionBlueprintHash: string;
}

export interface ColorSystemRendererCollectionResultV2 {
  ref: ColorSystemHostResourceRefV2;
  modeIds: Readonly<Record<string, string>>;
}

export interface ColorSystemRendererPrimitiveVariableRequestV2 {
  collectionId: string;
  recipeId: string;
  name: string;
  description: string;
  scopes: readonly string[];
  values: readonly {
    modeName: string;
    modeId: string;
    rgba: { r: number; g: number; b: number; a: number };
  }[];
  metadata: ColorSystemRendererOwnershipMetadataV2;
}

export interface ColorSystemRendererAliasVariableRequestV2 {
  collectionId: string;
  recipeId: string;
  name: string;
  description: string;
  scopes: readonly string[];
  aliases: readonly {
    modeName: string;
    modeId: string;
    targetVariableId: string;
  }[];
  metadata: ColorSystemRendererOwnershipMetadataV2;
}

export interface ColorSystemRendererStyleRequestV2 {
  recipeId: string;
  name: string;
  description: string;
  variableId: string;
  metadata: ColorSystemRendererOwnershipMetadataV2;
}

export interface ColorSystemRendererComponentRequestV2 {
  recipe: ColorSystemComponentRecipeV2;
  name: string;
  paintBindings: readonly {
    purpose: string;
    mode: string;
    variableId: string;
  }[];
  metadata: ColorSystemRendererOwnershipMetadataV2;
}

export interface ColorSystemRendererFrameRequestV2 {
  recipe: ColorSystemRoleFrameResourceRecipeV2;
  name: string;
  componentIds: readonly string[];
  systemVariableIds: readonly string[];
  geometry: ColorSystemRoleFrameResourceRecipeV2['presentationContent']['frame'];
  metadata: ColorSystemRendererOwnershipMetadataV2;
}

export interface ColorSystemRendererHostInventoryV2 {
  counts: {
    collections: number;
    variables: number;
    styles: number;
    components: number;
    frames: number;
  };
  collectionRoles: readonly ['primitives', 'semantics'];
  frameRoles: readonly string[];
  resourceBlueprintHashes: readonly string[];
  sectionBlueprintHashes: readonly string[];
  unresolvedAliasCount: number;
  hiddenLiteralPaintCount: number;
  boundaryViolationCount: number;
}

export interface ColorSystemRendererHostV2 {
  setCreatedResourceObserver?(observer: ((ref: ColorSystemHostResourceRefV2) => void) | null): void;
  getContext(): Promise<ColorSystemRendererHostContextV2>;
  findNameCollisions(names: readonly string[]): Promise<readonly string[]>;
  loadFonts(fonts: readonly ColorSystemRendererFontV2[]): Promise<void>;
  createCollection(request: {
    recipe: ColorSystemPrimitiveCollectionRecipeV2 | ColorSystemSemanticCollectionRecipeV2;
    name: string;
    metadata: ColorSystemRendererOwnershipMetadataV2;
  }): Promise<ColorSystemRendererCollectionResultV2>;
  createPrimitiveVariable(
    request: ColorSystemRendererPrimitiveVariableRequestV2
  ): Promise<ColorSystemHostResourceRefV2>;
  createAliasVariable(
    request: ColorSystemRendererAliasVariableRequestV2
  ): Promise<ColorSystemHostResourceRefV2>;
  createPaintStyle(
    request: ColorSystemRendererStyleRequestV2
  ): Promise<ColorSystemHostResourceRefV2>;
  createComponent(
    request: ColorSystemRendererComponentRequestV2
  ): Promise<ColorSystemHostResourceRefV2>;
  createFrame(request: ColorSystemRendererFrameRequestV2): Promise<ColorSystemHostResourceRefV2>;
  inspectCreatedSystem(request: {
    transactionId: string;
    refs: readonly ColorSystemHostResourceRefV2[];
  }): Promise<ColorSystemRendererHostInventoryV2>;
  removeResource(ref: ColorSystemHostResourceRefV2): Promise<void>;
  commitUndo(): Promise<void>;
  revealCreatedSystem(request: {
    transactionId: string;
    frameRefs: readonly ColorSystemHostResourceRefV2[];
  }): Promise<void>;
}

export interface RenderColorSystemResourceBlueprintV2Options {
  transactionId: string;
  expectedCurrentFileIdentityHash: string;
  currentFileAcknowledged: boolean;
  collisionPolicy: 'cancel' | 'create-copy';
  copyName?: string;
  /** Revalidates the exact open document, source, and profile after all
   * collision/font awaits and immediately before the first document mutation. */
  finalMutationFence: () => Promise<void>;
  journal?: {
    runtime: ColorSystemCreateJournalRuntimeV2;
    input: Omit<
      BeginColorSystemCreateJournalV2Input,
      'transactionId' | 'outputAction' | 'outputName' | 'outputPageName' | 'counts'
    >;
  };
  /**
   * p4-DE: appended to the description of each named family's anchor Variable
   * and of every `source/…` Variable that anchor derives from. Checked in
   * preflight; a malformed or unknown entry blocks before any mutation.
   */
  ownerSpotColors?: ColorSystemRendererOwnerSpotColorsV2;
}

export type ColorSystemRendererBlockedCodeV2 =
  | 'INVALID_BLUEPRINT'
  | 'INVALID_SPOT_COLOR'
  | 'CURRENT_FILE_REQUIRED'
  | 'UNSUPPORTED_HOST'
  | 'READ_ONLY'
  | 'UNSUPPORTED_PROFILE'
  | 'CAPABILITY_MISSING'
  | 'COLLISION_CANCELLED'
  | 'COPY_NAME_REQUIRED'
  | 'COPY_NAME_COLLISION'
  | 'FONT_UNAVAILABLE'
  | 'FINAL_FENCE_FAILED'
  | 'PREFLIGHT_FAILED'
  | 'RECOVERY_REQUIRED'
  | 'JOURNAL_UNAVAILABLE';

export type ColorSystemRendererReceiptV2 =
  | {
      version: typeof COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION;
      status: 'created';
      transactionId: string;
      currentFileOnly: true;
      action: 'create-new' | 'create-copy';
      outputName: string;
      resourceBlueprintHash: string;
      sectionBlueprintHash: string;
      counts: ColorSystemResourceBlueprintCountsV2;
      createdRefs: readonly ColorSystemHostResourceRefV2[];
      undoBoundaryCount: 1;
      warnings: readonly string[];
      /** p4-DE: present when the Create carried owner spot colors; descriptions written. */
      spotDescriptionsWritten?: number;
      receiptHash: string;
    }
  | {
      version: typeof COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION;
      status: 'verified-no-op';
      transactionId: string;
      currentFileOnly: true;
      action: 'verified-no-op';
      outputName: string;
      resourceBlueprintHash: string;
      sectionBlueprintHash: string;
      counts: ColorSystemResourceBlueprintCountsV2;
      existingRefs: readonly ColorSystemHostResourceRefV2[];
      undoBoundaryCount: 0;
      warnings: readonly string[];
      receiptHash: string;
    }
  | {
      version: typeof COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION;
      status: 'blocked';
      transactionId: string;
      code: ColorSystemRendererBlockedCodeV2;
      message: string;
      mutationCount: 0;
      receiptHash: string;
    }
  | {
      version: typeof COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION;
      status: 'rolled-back' | 'cleanup-incomplete';
      transactionId: string;
      failedPhase: ColorSystemRendererMutationPhaseV2;
      message: string;
      resourceBlueprintHash: string;
      createdCount: number;
      removedCount: number;
      unresolvedRefs: readonly ColorSystemHostResourceRefV2[];
      receiptHash: string;
    };

export type ColorSystemRendererMutationPhaseV2 =
  | 'reconciliation'
  | 'collections'
  | 'primitive-variables'
  | 'alias-variables'
  | 'styles'
  | 'components'
  | 'frames'
  | 'verification'
  | 'undo-boundary'
  | 'completion-acknowledgement';

interface PreparedRenderPlan {
  transactionId: string;
  action: 'create-new' | 'create-copy';
  outputName: string;
  primitiveCollectionName: string;
  semanticCollectionName: string;
  styleNames: ReadonlyMap<string, string>;
  componentNames: ReadonlyMap<string, string>;
  frameNames: ReadonlyMap<string, string>;
  fonts: readonly ColorSystemRendererFontV2[];
}

class RendererPreflightError extends ColorSystemResourceTransactionPreflightErrorV1 {
  constructor(
    readonly code: ColorSystemRendererBlockedCodeV2,
    message: string
  ) {
    super(code, message);
    this.name = 'RendererPreflightError';
  }
}

function printable(value: string, label: string, maximum = 160): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maximum ||
    [...normalized].some(character => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    throw new RendererPreflightError(
      'PREFLIGHT_FAILED',
      `${label} must be bounded printable text.`
    );
  }
  return normalized;
}

function hashReceipt<T extends object>(content: T): T & { receiptHash: string } {
  return { ...content, receiptHash: deterministicContentHash(content) };
}

function blockedReceipt(
  transactionId: string,
  code: ColorSystemRendererBlockedCodeV2,
  message: string
): ColorSystemRendererReceiptV2 {
  return hashReceipt({
    version: COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION,
    status: 'blocked' as const,
    transactionId,
    code,
    message,
    mutationCount: 0 as const,
  });
}

function reconciliationReceipt(
  transactionId: string,
  blueprint: ColorSystemResourceBlueprintV2,
  recovery: ColorSystemCreateJournalReconciliationV2
): ColorSystemRendererReceiptV2 | null {
  if (recovery.status === 'verified-existing-output') {
    return hashReceipt({
      version: COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION,
      status: 'verified-no-op' as const,
      transactionId,
      currentFileOnly: true as const,
      action: 'verified-no-op' as const,
      outputName: recovery.outputName,
      resourceBlueprintHash: recovery.resourceBlueprintHash,
      sectionBlueprintHash: recovery.sectionBlueprintHash,
      counts: blueprint.counts,
      existingRefs: recovery.resources,
      undoBoundaryCount: 0 as const,
      warnings: [
        'An identical Teul-owned system was verified in this file, so no resource was changed.',
      ],
    });
  }
  if (recovery.status === 'preserved-unacknowledged-output') {
    return blockedReceipt(
      transactionId,
      'RECOVERY_REQUIRED',
      `Teul found a complete verified output "${recovery.outputName}", but its post-commit completion acknowledgement is missing. The output was preserved; inspect it before creating another copy.`
    );
  }
  return null;
}

function modeRecordEqual(left: readonly string[], right: readonly string[]): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function assertNormalizedColor(
  variable: ColorSystemPrimitiveVariableRecipeV2,
  mode: string,
  outputModes: ReadonlySet<string>
): void {
  const value = variable.valuesByMode[mode];
  const channels = [value.components.r, value.components.g, value.components.b, value.alpha];
  if (
    !outputModes.has(mode) ||
    value.colorSpace !== 'srgb' ||
    !/^#[0-9A-F]{6}$/.test(value.hex) ||
    channels.some(channel => !Number.isFinite(channel) || channel < 0 || channel > 1)
  ) {
    throw new RendererPreflightError(
      'INVALID_BLUEPRINT',
      `${variable.recipeId}/${mode} is not exact normalized sRGB RGBA.`
    );
  }
}

function uniqueRecipeIds(values: readonly { recipeId: string }[], label: string): Set<string> {
  const ids = new Set(values.map(value => value.recipeId));
  if (ids.size !== values.length) {
    throw new RendererPreflightError('INVALID_BLUEPRINT', `${label} recipe IDs are not unique.`);
  }
  return ids;
}

function assertBoundaryRules(frame: ColorSystemRoleFrameResourceRecipeV2): void {
  const boundary = frame.sectionContent.cardBoundary;
  const policy = frame.presentationContent.cardBoundaryPolicy;
  if (
    (boundary.kind !== 'none' &&
      (boundary.kind !== 'monochrome-inside-1px' ||
        !['#000000', '#FFFFFF'].includes(boundary.color))) ||
    policy.kind !== 'none-or-monochrome-inside-1px' ||
    canonicalJson(policy.allowedColors) !== canonicalJson(['#000000', '#FFFFFF']) ||
    !policy.forbidden.includes('nested-inside-outside-outline') ||
    !policy.forbidden.includes('double-outline') ||
    frame.documentationChrome.classification !== 'documentation-chrome-not-system-color' ||
    frame.documentationChrome.backgroundHex !== '#FFFFFF'
  ) {
    throw new RendererPreflightError(
      'INVALID_BLUEPRINT',
      `${frame.recipeId} violates the monochrome inside-boundary policy.`
    );
  }
}

function forbiddenVolatileKey(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = forbiddenVolatileKey(item);
      if (nested) return nested;
    }
    return null;
  }
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (
      /^(figmaId|nodeId|sourceNodeId|headerNodeId|paletteNodeId|timestamp|createdAt|updatedAt|reviewHash|approvalHash)$/i.test(
        key
      )
    ) {
      return key;
    }
    const nested = forbiddenVolatileKey(nestedValue);
    if (nested) return nested;
  }
  return null;
}

export function assertColorSystemResourceBlueprintV2StandaloneIntegrity(
  blueprint: ColorSystemResourceBlueprintV2
): void {
  const { resourceBlueprintHash, ...content } = blueprint;
  if (
    blueprint.version !== COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION ||
    !HASH_PATTERN.test(resourceBlueprintHash) ||
    resourceBlueprintHash !== deterministicContentHash(content) ||
    blueprint.sectionBlueprint.sectionBlueprintHash !== blueprint.sectionBlueprintHash ||
    blueprint.sectionBlueprint.applicationBlueprintHash !== blueprint.applicationBlueprintHash ||
    blueprint.sectionBlueprint.presentationProfileHash !== blueprint.presentationProfileHash
  ) {
    throw new RendererPreflightError(
      'INVALID_BLUEPRINT',
      'Resource blueprint identity is stale, forged, or disconnected from its section authority.'
    );
  }
  const volatile = forbiddenVolatileKey(content);
  if (volatile) {
    throw new RendererPreflightError(
      'INVALID_BLUEPRINT',
      `Resource blueprint contains forbidden volatile field ${volatile}.`
    );
  }
  if (
    blueprint.collections.length !== 2 ||
    blueprint.collections[0].role !== 'primitives' ||
    blueprint.collections[1].role !== 'semantics' ||
    !modeRecordEqual(blueprint.collections[0].modes, blueprint.output.modes) ||
    !modeRecordEqual(blueprint.collections[1].modes, blueprint.output.modes)
  ) {
    throw new RendererPreflightError(
      'INVALID_BLUEPRINT',
      'Resource blueprint must contain exactly the primitive and semantic collections.'
    );
  }
  const outputModes = new Set(blueprint.output.modes);
  if (outputModes.size === 0 || outputModes.size !== blueprint.output.modes.length) {
    throw new RendererPreflightError(
      'INVALID_BLUEPRINT',
      'Output modes are missing or duplicated.'
    );
  }
  const primitiveIds = uniqueRecipeIds(blueprint.collections[0].variables, 'Primitive Variable');
  const aliasIds = uniqueRecipeIds(blueprint.collections[1].variables, 'Alias Variable');
  if ([...aliasIds].some(id => primitiveIds.has(id))) {
    throw new RendererPreflightError(
      'INVALID_BLUEPRINT',
      'Primitive and alias Variable recipe IDs overlap.'
    );
  }
  for (const variable of blueprint.collections[0].variables) {
    const modes = Object.keys(variable.valuesByMode);
    if (modes.length === 0) {
      throw new RendererPreflightError(
        'INVALID_BLUEPRINT',
        `${variable.recipeId} has no exact value.`
      );
    }
    modes.forEach(mode => assertNormalizedColor(variable, mode, outputModes));
  }
  for (const variable of blueprint.collections[1].variables) {
    const aliases = Object.entries(variable.aliasesByMode);
    if (
      aliases.length === 0 ||
      aliases.some(
        ([mode, alias]) =>
          !outputModes.has(mode) ||
          alias.kind !== 'variable-alias' ||
          !primitiveIds.has(alias.targetVariableRecipeId)
      )
    ) {
      throw new RendererPreflightError(
        'INVALID_BLUEPRINT',
        `${variable.recipeId} has an unresolved or literal alias.`
      );
    }
  }
  const variableIds = new Set([...primitiveIds, ...aliasIds]);
  uniqueRecipeIds(blueprint.styles, 'Paint Style');
  uniqueRecipeIds(blueprint.components, 'Component');
  uniqueRecipeIds(blueprint.frames, 'Frame');
  if (
    blueprint.styles.some(
      style => style.binding.kind !== 'variable' || !variableIds.has(style.binding.variableRecipeId)
    ) ||
    blueprint.components.some(component =>
      component.paintBindings.some(binding => !variableIds.has(binding.variableRecipeId))
    )
  ) {
    throw new RendererPreflightError(
      'INVALID_BLUEPRINT',
      'Style or component paint bindings do not close over approved Variables.'
    );
  }
  const componentIds = new Set(blueprint.components.map(component => component.recipeId));
  for (const component of blueprint.components.filter(
    component => component.kind === 'product-graphics'
  )) {
    try {
      const content = component.content as { mode?: unknown; rendering?: unknown };
      const rendering = readColorSystemProductGraphicsRenderingV1(content.rendering);
      const mode = content.mode;
      if (
        typeof mode !== 'string' ||
        !outputModes.has(mode) ||
        component.paintBindings.length !== rendering.uses.length ||
        new Set(component.paintBindings.map(binding => binding.purpose)).size !==
          rendering.uses.length
      )
        throw new Error('Graphic paint bindings are incomplete or duplicated.');
      for (const use of rendering.uses) {
        const binding = component.paintBindings.find(
          binding => binding.purpose === `use:${use.id}`
        );
        if (!binding || binding.mode !== mode)
          throw new Error('Graphic paint mode differs from its declared context.');
        const alias = blueprint.collections[1].variables.find(
          variable => variable.recipeId === binding.variableRecipeId
        );
        const primitiveId = alias
          ? alias.aliasesByMode[mode]?.targetVariableRecipeId
          : binding.variableRecipeId;
        const primitive = blueprint.collections[0].variables.find(
          variable => variable.recipeId === primitiveId
        );
        const origin = primitive?.origin;
        if (
          !primitive?.valuesByMode[mode] ||
          (use.ref.kind === 'preserved-source-color'
            ? use.ref.mode !== mode ||
              origin?.kind !== 'preserved-source' ||
              origin.stableColorId !== use.ref.stableColorId
            : use.ref.ref.mode !== mode ||
              origin?.kind !== 'approved-secondary' ||
              origin.familyId !== use.ref.ref.familyId ||
              origin.memberId !== use.ref.ref.memberId)
        )
          throw new Error('Graphic paint binding changes the declared exact reference.');
      }
    } catch (error) {
      throw new RendererPreflightError(
        'INVALID_BLUEPRINT',
        error instanceof Error ? error.message : 'Invalid graphic rendering plan.'
      );
    }
  }
  for (const frame of blueprint.frames.filter(frame => frame.role === 'product-graphics')) {
    try {
      layoutColorSystemProductGraphicsComponentsV1({
        components: [...frame.componentRecipeIds]
          .sort((left, right) => {
            const a = blueprint.components.find(component => component.recipeId === left)!;
            const b = blueprint.components.find(component => component.recipeId === right)!;
            const order = (component: ColorSystemComponentRecipeV2) => {
              const value = (component.content as { order?: unknown }).order;
              return typeof value === 'number' ? value : Number.MAX_SAFE_INTEGER;
            };
            return order(a) - order(b) || a.name.localeCompare(b.name);
          })
          .map(id => {
            const component = blueprint.components.find(component => component.recipeId === id);
            const rendering = readColorSystemProductGraphicsRenderingV1(
              (component?.content as { rendering?: unknown })?.rendering
            );
            return { id, ...colorSystemProductGraphicsComponentSizeV1(rendering) };
          }),
        frame: frame.presentationContent.frame,
        palette: frame.presentationContent.frame.palette,
        rows: frame.presentationContent.section.rows,
        systemVariableCount: frame.systemVariableRecipeIds.length,
      });
    } catch (error) {
      throw new RendererPreflightError(
        'INVALID_BLUEPRINT',
        error instanceof Error
          ? error.message
          : 'Graphic board does not fit its declared presentation.'
      );
    }
  }
  if (
    blueprint.frames.length !== 5 ||
    blueprint.frames.some(
      (frame, index) =>
        frame.role !== COLOR_SYSTEM_SECTION_ROLES_V2[index] ||
        frame.order !== index + 1 ||
        frame.componentRecipeIds.some(id => !componentIds.has(id)) ||
        frame.systemVariableRecipeIds.some(id => !variableIds.has(id))
    )
  ) {
    throw new RendererPreflightError(
      'INVALID_BLUEPRINT',
      'Exactly five ordered, reference-closed role frames are required.'
    );
  }
  blueprint.frames.forEach(assertBoundaryRules);
  const expectedCounts: ColorSystemResourceBlueprintCountsV2 = {
    primitiveVariables: blueprint.collections[0].variables.length,
    aliasVariables: blueprint.collections[1].variables.length,
    variables:
      blueprint.collections[0].variables.length + blueprint.collections[1].variables.length,
    styles: blueprint.styles.length,
    components: blueprint.components.length,
    frames: 5,
    familyModeComponentVariants: blueprint.counts.familyModeComponentVariants,
    estimatedNodes: blueprint.counts.estimatedNodes,
  };
  if (
    canonicalJson(expectedCounts) !== canonicalJson(blueprint.counts) ||
    blueprint.counts.variables > blueprint.limits.maximumVariables ||
    blueprint.counts.aliasVariables > blueprint.limits.maximumAliases ||
    blueprint.counts.styles > blueprint.limits.maximumStyles ||
    blueprint.counts.familyModeComponentVariants >
      blueprint.limits.maximumFamilyModeComponentVariants ||
    blueprint.counts.estimatedNodes > blueprint.limits.maximumEstimatedNodes ||
    estimateColorSystemResourceNodesV2(
      expectedCounts.variables,
      blueprint.styles,
      blueprint.components,
      blueprint.frames
    ) > blueprint.limits.maximumEstimatedNodes
  ) {
    throw new RendererPreflightError(
      'INVALID_BLUEPRINT',
      'Resource counts are stale or exceed a declared cap.'
    );
  }
}

function destinationNames(
  blueprint: ColorSystemResourceBlueprintV2,
  outputName: string
): Omit<PreparedRenderPlan, 'transactionId' | 'action' | 'fonts'> {
  const styleNames = new Map(
    blueprint.styles.map(style => [style.recipeId, `${outputName} / ${style.name}`] as const)
  );
  const componentNames = new Map(
    blueprint.components.map(
      component => [component.recipeId, `${outputName} / ${component.name}`] as const
    )
  );
  const frameNames = new Map(
    blueprint.frames.map(
      frame => [frame.recipeId, `${outputName} / ${frame.sectionContent.title}`] as const
    )
  );
  return {
    outputName,
    primitiveCollectionName: `${outputName} / Primitives and derivations`,
    semanticCollectionName: `${outputName} / Semantic applications`,
    styleNames,
    componentNames,
    frameNames,
  };
}

function allNames(plan: ReturnType<typeof destinationNames>): string[] {
  return [
    plan.outputName,
    plan.primitiveCollectionName,
    plan.semanticCollectionName,
    ...plan.styleNames.values(),
    ...plan.componentNames.values(),
    ...plan.frameNames.values(),
  ];
}

// ============================================
// p4-DE: owner-supplied spot colors → Variable descriptions
// ============================================

const SPOT_SUPPLIED_ON = /^\d{4}-\d{2}-\d{2}$/;
/** True when any character is a C0 control (below 0x20) or DEL (0x7F). */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
const SPOT_FINISHES = ['coated', 'uncoated', 'none'] as const;

/**
 * The sentence appended to a Variable description for an owner-supplied spot
 * color, for example “Spot: Pantone 123 C, coated (owner-supplied, 2026-09-08)”.
 * The reference text is the owner's; the date is when they supplied it.
 */
export function colorSystemSpotDescriptionV2(
  spot: ColorSystemRendererOwnerSpotColorV2,
  suppliedOn: string
): string {
  const finish = spot.finish === 'none' ? '' : `, ${spot.finish}`;
  return `Spot: ${colorSystemOwnerSpotColorLabelV2(spot)}${finish} (owner-supplied, ${suppliedOn})`;
}

/** Fails closed before any host call: every entry must name a family in this system and be well formed. */
function assertOwnerSpotColors(
  blueprint: ColorSystemResourceBlueprintV2,
  spots: ColorSystemRendererOwnerSpotColorsV2 | undefined
): void {
  if (spots === undefined) return;
  if (typeof spots.suppliedOn !== 'string' || !SPOT_SUPPLIED_ON.test(spots.suppliedOn)) {
    throw new RendererPreflightError(
      'INVALID_SPOT_COLOR',
      'Owner spot colors need the calendar date they were supplied on.'
    );
  }
  const families = new Map(blueprint.tokenNaming.families.map(plan => [plan.familyId, plan]));
  for (const [familyId, spot] of Object.entries(spots.byFamilyId)) {
    const plan = families.get(familyId);
    if (!plan || plan.anchorVariableRecipeId === null) {
      throw new RendererPreflightError(
        'INVALID_SPOT_COLOR',
        `A spot color names a family that is not in this system: ${familyId.slice(0, 120)}.`
      );
    }
    if (
      (spot.system !== 'pantone' && spot.system !== 'other') ||
      typeof spot.name !== 'string' ||
      spot.name !== spot.name.trim() ||
      spot.name.length === 0 ||
      spot.name.length > COLOR_SYSTEM_OWNER_SPOT_COLOR_LIMITS_V2.maximumNameLength ||
      hasControlCharacter(spot.name) ||
      !SPOT_FINISHES.includes(spot.finish)
    ) {
      throw new RendererPreflightError(
        'INVALID_SPOT_COLOR',
        `The spot color for ${plan.sourceName} is malformed; Teul writes only what the owner typed.`
      );
    }
  }
}

/**
 * Which primitive Variables receive the spot sentence: the family's anchor step
 * (step 9 or the named base, per the token naming) and every preserved
 * `source/…` Variable the anchor member derives from. Preflight has already
 * rejected unknown families; entries are visited in family-id order.
 */
function spotDescriptionsByRecipeId(
  blueprint: ColorSystemResourceBlueprintV2,
  spots: ColorSystemRendererOwnerSpotColorsV2 | undefined
): ReadonlyMap<string, string> {
  const sentences = new Map<string, string>();
  if (spots === undefined) return sentences;
  const primitives = blueprint.collections[0].variables;
  const entries = Object.entries(spots.byFamilyId).sort(([left], [right]) =>
    compareText(left, right)
  );
  for (const [familyId, spot] of entries) {
    const plan = blueprint.tokenNaming.families.find(item => item.familyId === familyId);
    if (!plan?.anchorVariableRecipeId) continue;
    const sentence = colorSystemSpotDescriptionV2(spot, spots.suppliedOn);
    sentences.set(plan.anchorVariableRecipeId, sentence);
    const anchor = primitives.find(variable => variable.recipeId === plan.anchorVariableRecipeId);
    const sourceIds = new Set(
      anchor?.origin.kind === 'approved-secondary' ? anchor.origin.provenance.sourceColorIds : []
    );
    for (const variable of primitives) {
      if (
        variable.origin.kind === 'preserved-source' &&
        sourceIds.has(variable.origin.stableColorId)
      ) {
        sentences.set(variable.recipeId, sentence);
      }
    }
  }
  return sentences;
}

function withSpotSentence(description: string, sentence: string | undefined): string {
  if (sentence === undefined) return description;
  return description.trim().length === 0 ? sentence : `${description}\n${sentence}`;
}

async function preflight(
  host: ColorSystemRendererHostV2,
  blueprint: ColorSystemResourceBlueprintV2,
  options: RenderColorSystemResourceBlueprintV2Options,
  deferCollisionFailure = false
): Promise<PreparedRenderPlan> {
  assertColorSystemResourceBlueprintV2StandaloneIntegrity(blueprint);
  assertOwnerSpotColors(blueprint, options.ownerSpotColors); // p4-DE
  const transactionId = printable(options.transactionId, 'transactionId', 100);
  const expectedFile = printable(
    options.expectedCurrentFileIdentityHash,
    'expectedCurrentFileIdentityHash',
    100
  );
  if (!HASH_PATTERN.test(expectedFile) || !options.currentFileAcknowledged) {
    throw new RendererPreflightError(
      'CURRENT_FILE_REQUIRED',
      'Create requires explicit acknowledgement of the current Figma Design file.'
    );
  }
  const context = await host.getContext();
  if (context.documentType !== 'figma-design') {
    throw new RendererPreflightError('UNSUPPORTED_HOST', 'Only Figma Design is supported.');
  }
  if (!context.editable) {
    throw new RendererPreflightError('READ_ONLY', 'The current Figma file is not editable.');
  }
  if (context.colorProfile !== 'srgb') {
    throw new RendererPreflightError(
      'UNSUPPORTED_PROFILE',
      'The v2 renderer supports sRGB files only.'
    );
  }
  if (context.currentFileIdentityHash !== expectedFile) {
    throw new RendererPreflightError(
      'CURRENT_FILE_REQUIRED',
      'The open Figma file changed after authorization.'
    );
  }
  if (Object.values(context.capabilities).some(value => value !== true)) {
    throw new RendererPreflightError(
      'CAPABILITY_MISSING',
      'The current host cannot create the complete governed resource system.'
    );
  }

  let action: 'create-new' | 'create-copy' = 'create-new';
  let planNames = destinationNames(blueprint, blueprint.output.name);
  const collisions = await host.findNameCollisions(allNames(planNames));
  if (collisions.length > 0) {
    if (options.collisionPolicy === 'cancel') {
      if (deferCollisionFailure) {
        // A persisted partial or completed journal may own the collision. Recovery
        // runs only after this collision/font preflight and its final mutation fence.
      } else {
        throw new RendererPreflightError(
          'COLLISION_CANCELLED',
          'Existing local resources use one or more intended names; nothing was changed.'
        );
      }
    } else if (options.copyName === undefined) {
      throw new RendererPreflightError(
        'COPY_NAME_REQUIRED',
        'A reviewed copy name is required for collision-safe creation.'
      );
    } else {
      const copyName = printable(options.copyName, 'copyName', 120);
      if (copyName === blueprint.output.name) {
        throw new RendererPreflightError(
          'COPY_NAME_REQUIRED',
          'The copy name must differ from the colliding output name.'
        );
      }
      planNames = destinationNames(blueprint, copyName);
      const copyCollisions = await host.findNameCollisions(allNames(planNames));
      if (copyCollisions.length > 0 && !deferCollisionFailure) {
        throw new RendererPreflightError(
          'COPY_NAME_COLLISION',
          'The reviewed copy name also collides with current-file resources.'
        );
      }
      action = 'create-copy';
    }
  }

  const fontMap = new Map<string, ColorSystemRendererFontV2>();
  for (const frame of blueprint.frames) {
    for (const role of frame.presentationContent.typography) {
      const key = `${role.fontFamily}\u0000${role.fontStyle}`;
      fontMap.set(key, { family: role.fontFamily, style: role.fontStyle });
    }
  }
  const fonts = [...fontMap.values()].sort(
    (left, right) => compareText(left.family, right.family) || compareText(left.style, right.style)
  );
  try {
    await host.loadFonts(fonts);
  } catch (error) {
    throw new RendererPreflightError(
      'FONT_UNAVAILABLE',
      error instanceof Error ? error.message : 'A required font could not be loaded.'
    );
  }
  return { transactionId, action, ...planNames, fonts };
}

async function assertFinalMutationFence(
  host: ColorSystemRendererHostV2,
  options: RenderColorSystemResourceBlueprintV2Options
): Promise<void> {
  try {
    if (typeof options.finalMutationFence !== 'function') {
      throw new Error('The final document/source/profile fence is unavailable.');
    }
    await options.finalMutationFence();
    const context = await host.getContext();
    if (
      context.documentType !== 'figma-design' ||
      !context.editable ||
      context.colorProfile !== 'srgb' ||
      context.currentFileIdentityHash !== options.expectedCurrentFileIdentityHash ||
      Object.values(context.capabilities).some(value => value !== true)
    ) {
      throw new Error(
        'The open Figma Design file, source authority, profile, or renderer capability changed after preflight.'
      );
    }
  } catch (error) {
    throw new RendererPreflightError(
      'FINAL_FENCE_FAILED',
      error instanceof Error
        ? error.message
        : 'The final document/source/profile fence failed before mutation.'
    );
  }
}

function ownership(
  blueprint: ColorSystemResourceBlueprintV2,
  transactionId: string,
  recipeId: string
): ColorSystemRendererOwnershipMetadataV2 {
  return {
    version: COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION,
    transactionId,
    systemId: blueprint.output.systemId,
    recipeId,
    resourceBlueprintHash: blueprint.resourceBlueprintHash,
    sectionBlueprintHash: blueprint.sectionBlueprintHash,
  };
}

function requireModeId(
  collection: ColorSystemRendererCollectionResultV2,
  mode: string,
  recipeId: string
): string {
  const id = collection.modeIds[mode];
  if (!id) throw new Error(`${recipeId} uses unresolved host mode ${mode}.`);
  return id;
}

function requireHostId(
  refs: ReadonlyMap<string, ColorSystemHostResourceRefV2>,
  recipeId: string,
  label: string
): string {
  const ref = refs.get(recipeId);
  if (!ref) throw new Error(`${label} references unresolved host recipe ${recipeId}.`);
  return ref.id;
}

function assertHostInventory(
  blueprint: ColorSystemResourceBlueprintV2,
  inventory: ColorSystemRendererHostInventoryV2
): void {
  const expected = {
    collections: 2,
    variables: blueprint.counts.variables,
    styles: blueprint.counts.styles,
    components: blueprint.counts.components,
    frames: 5,
  };
  const mismatches: string[] = [];
  const compare = (label: string, actual: unknown, required: unknown): void => {
    if (canonicalJson(actual) !== canonicalJson(required)) {
      mismatches.push(
        `${label} expected ${canonicalJson(required)}, received ${canonicalJson(actual)}`
      );
    }
  };
  compare('counts', inventory.counts, expected);
  compare('collection roles', inventory.collectionRoles, ['primitives', 'semantics']);
  compare('frame roles', inventory.frameRoles, COLOR_SYSTEM_SECTION_ROLES_V2);
  compare(
    'resource blueprint ownership',
    [...new Set(inventory.resourceBlueprintHashes)],
    [blueprint.resourceBlueprintHash]
  );
  compare(
    'section blueprint ownership',
    [...new Set(inventory.sectionBlueprintHashes)],
    [blueprint.sectionBlueprintHash]
  );
  compare('unresolved aliases', inventory.unresolvedAliasCount, 0);
  compare('hidden literal paints', inventory.hiddenLiteralPaintCount, 0);
  compare('boundary violations', inventory.boundaryViolationCount, 0);
  if (mismatches.length > 0) {
    throw new Error(
      `Created host inventory does not match the exact resource blueprint: ${mismatches.join('; ')}.`
    );
  }
}

export async function renderColorSystemResourceBlueprintV2(
  host: ColorSystemRendererHostV2,
  blueprint: ColorSystemResourceBlueprintV2,
  options: RenderColorSystemResourceBlueprintV2Options
): Promise<ColorSystemRendererReceiptV2> {
  const journalTarget = {
    systemId: blueprint.output.systemId,
    resourceBlueprintHash: blueprint.resourceBlueprintHash,
    sectionBlueprintHash: blueprint.sectionBlueprintHash,
  };
  const journalOptions = options.journal;
  return runColorSystemResourceTransactionV1<
    PreparedRenderPlan,
    ColorSystemCreateJournalV2,
    ColorSystemCreateJournalReconciliationV2,
    ColorSystemRendererReceiptV2,
    number
  >(host, {
    contractKind: 'legacy-v2',
    transactionId: options.transactionId,
    ...(journalOptions
      ? {
          journal: {
            acquire() {
              const lease = journalOptions.runtime.acquireTransaction();
              if (!lease) return null;
              const runtime = lease.legacy;
              return {
                release: lease.release,
                read: runtime.read,
                matchesTarget: (journal: ColorSystemCreateJournalV2) =>
                  journal.systemId === journalTarget.systemId &&
                  journal.resourceBlueprintHash === journalTarget.resourceBlueprintHash &&
                  journal.sectionBlueprintHash === journalTarget.sectionBlueprintHash,
                reconcile: (beforeMutation?: () => Promise<void>) =>
                  runtime.reconcile(
                    options.expectedCurrentFileIdentityHash,
                    journalTarget,
                    beforeMutation
                  ),
                begin: (plan: PreparedRenderPlan) =>
                  runtime.begin({
                    ...journalOptions.input,
                    transactionId: plan.transactionId,
                    outputAction: plan.action,
                    outputName: plan.outputName,
                    outputPageName: `${plan.outputName} — Color System`,
                    counts: blueprint.counts,
                  }),
                record: runtime.record,
                markVerified: runtime.markVerified,
                acknowledgeCommitted: runtime.acknowledgeCommitted,
              };
            },
          },
        }
      : {}),
    preflight: deferCollisionFailure => preflight(host, blueprint, options, deferCollisionFailure),
    finalMutationFence: () => assertFinalMutationFence(host, options),
    async mutate(plan, { remember, refsByRecipe, setPhase }) {
      const primitiveCollection = await host.createCollection({
        recipe: blueprint.collections[0],
        name: plan.primitiveCollectionName,
        metadata: ownership(blueprint, plan.transactionId, blueprint.collections[0].recipeId),
      });
      remember(primitiveCollection.ref);
      const semanticCollection = await host.createCollection({
        recipe: blueprint.collections[1],
        name: plan.semanticCollectionName,
        metadata: ownership(blueprint, plan.transactionId, blueprint.collections[1].recipeId),
      });
      remember(semanticCollection.ref);

      setPhase('primitive-variables');
      // p4-DE: the owner's spot sentence rides the description through the host adapter.
      const spotSentences = spotDescriptionsByRecipeId(blueprint, options.ownerSpotColors);
      let spotDescriptionsWritten = 0;
      for (const variable of blueprint.collections[0].variables) {
        const spotSentence = spotSentences.get(variable.recipeId);
        if (spotSentence !== undefined) spotDescriptionsWritten += 1;
        const ref = await host.createPrimitiveVariable({
          collectionId: primitiveCollection.ref.id,
          recipeId: variable.recipeId,
          name: variable.name,
          description: withSpotSentence(variable.description, spotSentence),
          scopes: variable.scopes,
          values: Object.entries(variable.valuesByMode).map(([modeName, value]) => ({
            modeName,
            modeId: requireModeId(primitiveCollection, modeName, variable.recipeId),
            rgba: {
              r: value.components.r,
              g: value.components.g,
              b: value.components.b,
              a: value.alpha,
            },
          })),
          metadata: ownership(blueprint, plan.transactionId, variable.recipeId),
        });
        remember(ref);
      }

      setPhase('alias-variables');
      for (const variable of blueprint.collections[1].variables) {
        const ref = await host.createAliasVariable({
          collectionId: semanticCollection.ref.id,
          recipeId: variable.recipeId,
          name: variable.name,
          description: variable.description,
          scopes: variable.scopes,
          aliases: Object.entries(variable.aliasesByMode).map(([modeName, alias]) => ({
            modeName,
            modeId: requireModeId(semanticCollection, modeName, variable.recipeId),
            targetVariableId: requireHostId(
              refsByRecipe,
              alias.targetVariableRecipeId,
              variable.recipeId
            ),
          })),
          metadata: ownership(blueprint, plan.transactionId, variable.recipeId),
        });
        remember(ref);
      }

      setPhase('styles');
      for (const style of blueprint.styles) {
        const ref = await host.createPaintStyle({
          recipeId: style.recipeId,
          name: plan.styleNames.get(style.recipeId) ?? style.name,
          description: style.description,
          variableId: requireHostId(refsByRecipe, style.binding.variableRecipeId, style.recipeId),
          metadata: ownership(blueprint, plan.transactionId, style.recipeId),
        });
        remember(ref);
      }

      setPhase('components');
      for (const component of blueprint.components) {
        const ref = await host.createComponent({
          recipe: component,
          name: plan.componentNames.get(component.recipeId) ?? component.name,
          paintBindings: component.paintBindings.map(binding => ({
            purpose: binding.purpose,
            mode: binding.mode,
            variableId: requireHostId(refsByRecipe, binding.variableRecipeId, component.recipeId),
          })),
          metadata: ownership(blueprint, plan.transactionId, component.recipeId),
        });
        remember(ref);
      }

      setPhase('frames');
      for (const frame of blueprint.frames) {
        const ref = await host.createFrame({
          recipe: frame,
          name: plan.frameNames.get(frame.recipeId) ?? frame.sectionContent.title,
          componentIds: frame.componentRecipeIds.map(id =>
            requireHostId(refsByRecipe, id, frame.recipeId)
          ),
          systemVariableIds: frame.systemVariableRecipeIds.map(id =>
            requireHostId(refsByRecipe, id, frame.recipeId)
          ),
          geometry: frame.presentationContent.frame,
          metadata: ownership(blueprint, plan.transactionId, frame.recipeId),
        });
        remember(ref);
      }

      return spotDescriptionsWritten;
    },
    async verify(plan, refs) {
      const inventory = await host.inspectCreatedSystem({
        transactionId: plan.transactionId,
        refs,
      });
      assertHostInventory(blueprint, inventory);
    },
    async reveal(plan, refs) {
      const warnings: string[] = [];
      try {
        await host.revealCreatedSystem({
          transactionId: plan.transactionId,
          frameRefs: refs.filter(ref => ref.kind === 'frame'),
        });
      } catch {
        warnings.push(
          `The system was created, but Figma could not show the new page automatically. Open "${plan.outputName} — Color System" from Pages.`
        );
      }
      return warnings;
    },
    blocked: blockedReceipt,
    reconciliation: (plan, recovery) =>
      reconciliationReceipt(plan.transactionId, blueprint, recovery),
    failed: failure =>
      hashReceipt({
        version: COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION,
        status: failure.status,
        transactionId: failure.transactionId,
        failedPhase: failure.failedPhase,
        message: failure.message,
        resourceBlueprintHash: blueprint.resourceBlueprintHash,
        createdCount: failure.createdCount,
        removedCount: failure.removedCount,
        unresolvedRefs: failure.unresolvedRefs,
      }),
    created: (plan, created, warnings, spotDescriptionsWritten) =>
      hashReceipt({
        version: COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION,
        status: 'created' as const,
        transactionId: plan.transactionId,
        currentFileOnly: true as const,
        action: plan.action,
        outputName: plan.outputName,
        resourceBlueprintHash: blueprint.resourceBlueprintHash,
        sectionBlueprintHash: blueprint.sectionBlueprintHash,
        counts: blueprint.counts,
        createdRefs: created,
        undoBoundaryCount: 1 as const,
        warnings,
        ...(options.ownerSpotColors ? { spotDescriptionsWritten } : {}),
      }),
  });
}
