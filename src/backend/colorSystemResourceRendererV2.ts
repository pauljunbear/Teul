import { canonicalJson, deterministicContentHash } from '../lib/colorSystemAudit';
import {
  COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION,
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
import type {
  BeginColorSystemCreateJournalV2Input,
  ColorSystemCreateJournalReconciliationV2,
  ColorSystemCreateJournalRuntimeV2,
  ColorSystemCreateJournalV2,
} from './colorSystemCreateJournalV2';
import { COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION } from './colorSystemResourceOwnershipV2';

export const COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION =
  'teul-color-resource-renderer-receipt/v2' as const;
export { COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION } from './colorSystemResourceOwnershipV2';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export type ColorSystemHostResourceKindV2 =
  | 'collection'
  | 'variable'
  | 'style'
  | 'component'
  | 'frame'
  | 'page';

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
}

export type ColorSystemRendererBlockedCodeV2 =
  | 'INVALID_BLUEPRINT'
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

class RendererPreflightError extends Error {
  constructor(
    readonly code: ColorSystemRendererBlockedCodeV2,
    message: string
  ) {
    super(message);
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
    blueprint.counts.estimatedNodes > blueprint.limits.maximumEstimatedNodes
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

async function preflight(
  host: ColorSystemRendererHostV2,
  blueprint: ColorSystemResourceBlueprintV2,
  options: RenderColorSystemResourceBlueprintV2Options,
  deferCollisionFailure = false
): Promise<PreparedRenderPlan> {
  assertColorSystemResourceBlueprintV2StandaloneIntegrity(blueprint);
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
  const safeTransactionId =
    typeof options.transactionId === 'string' && options.transactionId.trim().length > 0
      ? options.transactionId.trim().slice(0, 100)
      : 'invalid-transaction';
  let journal: ColorSystemCreateJournalV2 | null = null;
  let recoveryRan = false;
  let completedRecovery: Extract<
    ColorSystemCreateJournalReconciliationV2,
    { status: 'cleaned-interrupted-output' }
  > | null = null;
  const journalTarget = {
    systemId: blueprint.output.systemId,
    resourceBlueprintHash: blueprint.resourceBlueprintHash,
    sectionBlueprintHash: blueprint.sectionBlueprintHash,
  };

  if (options.journal) {
    if (!host.setCreatedResourceObserver) {
      return blockedReceipt(
        safeTransactionId,
        'JOURNAL_UNAVAILABLE',
        'The Figma host cannot persist exact v2 Create resource ownership.'
      );
    }
    let persisted: ColorSystemCreateJournalV2 | null;
    try {
      persisted = options.journal.runtime.read();
    } catch (error) {
      return blockedReceipt(
        safeTransactionId,
        'RECOVERY_REQUIRED',
        error instanceof Error ? error.message : 'The v2 Create journal could not be read safely.'
      );
    }
    const exactPersistedTarget =
      persisted?.state === 'verified' &&
      persisted.systemId === journalTarget.systemId &&
      persisted.resourceBlueprintHash === journalTarget.resourceBlueprintHash &&
      persisted.sectionBlueprintHash === journalTarget.sectionBlueprintHash;
    const needsRecoveryBeforeCollisionDecision =
      persisted?.state === 'creating' || exactPersistedTarget;
    if (needsRecoveryBeforeCollisionDecision) {
      let recoveryPlan: PreparedRenderPlan;
      try {
        recoveryPlan = await preflight(host, blueprint, options, true);
      } catch (error) {
        if (error instanceof RendererPreflightError) {
          return blockedReceipt(safeTransactionId, error.code, error.message);
        }
        return blockedReceipt(
          safeTransactionId,
          'PREFLIGHT_FAILED',
          error instanceof Error ? error.message : 'Recovery preflight failed.'
        );
      }
      try {
        const recovery = await options.journal.runtime.reconcile(
          options.expectedCurrentFileIdentityHash,
          journalTarget,
          () => assertFinalMutationFence(host, options)
        );
        recoveryRan = true;
        const receipt = reconciliationReceipt(recoveryPlan.transactionId, blueprint, recovery);
        if (receipt) return receipt;
        if (recovery.status === 'cleaned-interrupted-output') completedRecovery = recovery;
      } catch (error) {
        if (error instanceof RendererPreflightError) {
          return blockedReceipt(recoveryPlan.transactionId, error.code, error.message);
        }
        return blockedReceipt(
          recoveryPlan.transactionId,
          'RECOVERY_REQUIRED',
          error instanceof Error
            ? error.message
            : 'V2 Create recovery could not be completed safely.'
        );
      }
    }
  }

  let plan: PreparedRenderPlan;
  try {
    plan = await preflight(host, blueprint, options);
  } catch (error) {
    if (completedRecovery) {
      return hashReceipt({
        version: COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION,
        status: 'rolled-back' as const,
        transactionId: safeTransactionId,
        failedPhase: 'reconciliation' as const,
        message: `Teul safely removed ${completedRecovery.removedResourceCount} resource(s) from the earlier interrupted Create, but the new Create preflight is blocked: ${error instanceof Error ? error.message : 'preflight failed.'}`,
        resourceBlueprintHash: blueprint.resourceBlueprintHash,
        createdCount: 0,
        removedCount: completedRecovery.removedResourceCount,
        unresolvedRefs: [],
      });
    }
    if (error instanceof RendererPreflightError) {
      return blockedReceipt(safeTransactionId, error.code, error.message);
    }
    return blockedReceipt(
      safeTransactionId,
      'PREFLIGHT_FAILED',
      error instanceof Error ? error.message : 'Preflight failed.'
    );
  }

  if (options.journal) {
    try {
      if (!recoveryRan) {
        const recovery = await options.journal.runtime.reconcile(
          options.expectedCurrentFileIdentityHash,
          journalTarget,
          () => assertFinalMutationFence(host, options)
        );
        const receipt = reconciliationReceipt(plan.transactionId, blueprint, recovery);
        if (receipt) return receipt;
      }
      await assertFinalMutationFence(host, options);
      journal = options.journal.runtime.begin({
        ...options.journal.input,
        transactionId: plan.transactionId,
        outputAction: plan.action,
        outputName: plan.outputName,
        outputPageName: `${plan.outputName} — Color System`,
        counts: blueprint.counts,
      });
    } catch (error) {
      if (error instanceof RendererPreflightError) {
        return blockedReceipt(plan.transactionId, error.code, error.message);
      }
      return blockedReceipt(
        plan.transactionId,
        'RECOVERY_REQUIRED',
        error instanceof Error ? error.message : 'V2 Create recovery could not be completed safely.'
      );
    }
  } else {
    try {
      await assertFinalMutationFence(host, options);
    } catch (error) {
      if (error instanceof RendererPreflightError) {
        return blockedReceipt(plan.transactionId, error.code, error.message);
      }
      return blockedReceipt(
        plan.transactionId,
        'FINAL_FENCE_FAILED',
        error instanceof Error ? error.message : 'The final mutation fence failed.'
      );
    }
  }

  const created: ColorSystemHostResourceRefV2[] = [];
  const refsByRecipe = new Map<string, ColorSystemHostResourceRefV2>();
  let phase: ColorSystemRendererMutationPhaseV2 = 'collections';
  const remember = (ref: ColorSystemHostResourceRefV2) => {
    if (refsByRecipe.has(ref.recipeId)) {
      throw new Error(`Host returned duplicate recipe ref ${ref.recipeId}.`);
    }
    created.push(ref);
    refsByRecipe.set(ref.recipeId, ref);
  };

  if (journal && options.journal && host.setCreatedResourceObserver) {
    host.setCreatedResourceObserver(ref => {
      if (!journal || !options.journal) {
        throw new Error('The v2 Create journal observer lost its transaction state.');
      }
      journal = options.journal.runtime.record(journal, {
        kind: ref.kind,
        id: ref.id,
        recipeId: ref.recipeId,
      });
    });
  }

  try {
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

    phase = 'primitive-variables';
    for (const variable of blueprint.collections[0].variables) {
      const ref = await host.createPrimitiveVariable({
        collectionId: primitiveCollection.ref.id,
        recipeId: variable.recipeId,
        name: variable.name,
        description: variable.description,
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

    phase = 'alias-variables';
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

    phase = 'styles';
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

    phase = 'components';
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

    phase = 'frames';
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

    phase = 'verification';
    const inventory = await host.inspectCreatedSystem({
      transactionId: plan.transactionId,
      refs: created,
    });
    assertHostInventory(blueprint, inventory);

    const warnings: string[] = [];
    try {
      await host.revealCreatedSystem({
        transactionId: plan.transactionId,
        frameRefs: created.filter(ref => ref.kind === 'frame'),
      });
    } catch {
      warnings.push(
        `The system was created, but Figma could not show the new page automatically. Open "${plan.outputName} — Color System" from Pages.`
      );
    }
    phase = 'undo-boundary';
    if (journal && options.journal) {
      journal = options.journal.runtime.markVerified(journal);
    }
    await host.commitUndo();
    if (journal && options.journal) {
      phase = 'completion-acknowledgement';
      await options.journal.runtime.acknowledgeCommitted(journal);
    }
    host.setCreatedResourceObserver?.(null);
    return hashReceipt({
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
    });
  } catch (error) {
    host.setCreatedResourceObserver?.(null);
    if (journal?.state === 'verified' && options.journal) {
      return hashReceipt({
        version: COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION,
        status: 'cleanup-incomplete' as const,
        transactionId: plan.transactionId,
        failedPhase: phase,
        message:
          phase === 'completion-acknowledgement'
            ? 'The complete output and final undo boundary succeeded, but Teul could not durably acknowledge completion. The verified recovery marker was preserved and new Create mutations remain blocked until it is reconciled.'
            : 'The complete output was verified, but Teul could not confirm its final undo boundary. The durable recovery marker was preserved and new Create mutations remain blocked until it is reconciled.',
        resourceBlueprintHash: blueprint.resourceBlueprintHash,
        createdCount: journal.resources.length,
        removedCount: 0,
        unresolvedRefs: journal.resources,
      });
    }
    const unresolved: ColorSystemHostResourceRefV2[] = [];
    let durableReconciliationBlocked = false;
    let removedCount = 0;
    for (const ref of [...created].reverse()) {
      try {
        await host.removeResource(ref);
        removedCount += 1;
      } catch {
        unresolved.push(ref);
      }
    }
    if (journal && options.journal) {
      try {
        const recovery = await options.journal.runtime.reconcile(
          options.expectedCurrentFileIdentityHash,
          {
            systemId: blueprint.output.systemId,
            resourceBlueprintHash: blueprint.resourceBlueprintHash,
            sectionBlueprintHash: blueprint.sectionBlueprintHash,
          }
        );
        if (recovery.status === 'cleaned-interrupted-output') {
          removedCount = Math.max(removedCount, recovery.removedResourceCount);
        }
        durableReconciliationBlocked = recovery.blocksNewMutation;
      } catch {
        // The persistent journal intentionally remains as the restart blocker.
        durableReconciliationBlocked = true;
      }
    }
    const durableRefs = durableReconciliationBlocked
      ? (journal?.resources.map(ref => ({ ...ref })) ?? [])
      : [];
    const unresolvedReceipt = [...unresolved];
    for (const ref of durableRefs) {
      if (!unresolvedReceipt.some(item => item.kind === ref.kind && item.id === ref.id)) {
        unresolvedReceipt.push(ref);
      }
    }
    const status =
      unresolvedReceipt.length === 0 && !durableReconciliationBlocked
        ? 'rolled-back'
        : 'cleanup-incomplete';
    return hashReceipt({
      version: COLOR_SYSTEM_RESOURCE_RENDERER_V2_RECEIPT_VERSION,
      status,
      transactionId: plan.transactionId,
      failedPhase: phase,
      message: `${error instanceof Error ? error.message : 'Resource rendering failed.'}${
        durableReconciliationBlocked
          ? ' Durable journal reconciliation remains blocked; cleanup is incomplete.'
          : ''
      }`,
      resourceBlueprintHash: blueprint.resourceBlueprintHash,
      createdCount: created.length,
      removedCount,
      unresolvedRefs: unresolvedReceipt,
    });
  }
}
