import type {
  SnapshotDocumentProfile,
  SnapshotUsageScope,
  SourceColorSectionKind,
} from '../types/colorSystemAudit';
import { COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS } from './colorSystemAudit';
import { canonicalHashJson, canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { colorSystemSrgbNeedsNativeRepresentationV1 } from './colorSystemSrgbValueV1';
import { COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2 } from './colorSystemGenericLimitsV2';
import { utf8ByteLength } from './utf8';

export const COLOR_SYSTEM_GENERIC_SOURCE_SCHEMA_VERSION =
  'teul.color-system.generic-source.v2' as const;
export const COLOR_SYSTEM_GENERIC_SOURCE_ADAPTER_VERSION =
  'teul-generic-source-adapter-v2.0.0' as const;
export const COLOR_SYSTEM_GENERIC_SOURCE_EVIDENCE_MAX_BYTES = 16 * 1024 * 1024;

const HASH = /^sha256:[0-9a-f]{64}$/;
const MAX_JSON_DEPTH = 16;
const SECTION_ORDER: readonly SourceColorSectionKind[] = [
  'primary',
  'secondary',
  'product-graphics',
  'data-visualization',
  'typography',
];

export type GenericJsonValueV2 =
  null | boolean | number | string | readonly GenericJsonValueV2[] | GenericJsonObjectV2;
export interface GenericJsonObjectV2 {
  readonly [key: string]: GenericJsonValueV2;
}

export type GenericEvidenceKindV2 =
  | 'figma-resource'
  | 'figma-node'
  | 'token-path'
  | 'document-page'
  | 'manual'
  | 'audit-observation'
  | 'enabled-library-descriptor';

export interface GenericEvidenceRefV2 {
  evidenceId: string;
  kind: GenericEvidenceKindV2;
  locator: string;
  detail?: string;
}

export interface GenericModeRefV2 {
  collectionId: string;
  modeId: string;
  name: string;
  /** One-based Figma collection mode order. */
  order: number;
}

export interface GenericColorCollectionV2 {
  collectionId: string;
  name: string;
  defaultModeId: string;
  modes: readonly GenericModeRefV2[];
}

export interface GenericColorValueV2 {
  /** `unverified` preserves Legacy/unknown-profile channels but blocks color math. */
  colorSpace: 'srgb' | 'display-p3' | 'unverified';
  components: readonly [number, number, number];
  alpha: number;
}

export type GenericRawVariableValueV2 =
  | { kind: 'color'; value: GenericColorValueV2 }
  | { kind: 'alias'; targetVariableId: string }
  | { kind: 'missing' };

export interface GenericVariableModeValueV2 {
  modeId: string;
  modeName: string;
  rawValue: GenericRawVariableValueV2;
  resolvedValue?: GenericColorValueV2;
  resolution: 'literal' | 'resolved-alias' | 'unresolved-alias' | 'unsupported-profile' | 'missing';
}

export interface GenericColorVariableV2 {
  variableId: string;
  name: string;
  description: string;
  collectionId: string;
  scopes: readonly string[];
  valuesByMode: readonly GenericVariableModeValueV2[];
  evidenceIds: readonly string[];
}

export interface GenericPaintRecordV2 {
  /** One-based native Paint Style paint order. */
  order: number;
  type: string;
  visible: boolean;
  opacity: number;
  blendMode: string;
  boundVariableId?: string;
  solidValue?: GenericColorValueV2;
  /** Exact bounded serializable paint properties, including gradient stops/transform. */
  payload: GenericJsonObjectV2;
}

export type GenericPaintDirectDeclarationV2 =
  { kind: 'literal'; value: GenericColorValueV2 } | { kind: 'alias'; targetVariableId: string };

export interface GenericPaintStyleV2 {
  styleId: string;
  name: string;
  description: string;
  paints: readonly GenericPaintRecordV2[];
  directDeclaration: GenericPaintDirectDeclarationV2 | null;
  governingEligibility: 'eligible' | 'context-dependent' | 'unsupported';
  evidenceIds: readonly string[];
}

export interface GenericPaletteEntryV2 {
  entryId: string;
  name: string;
  order: number;
  value: GenericColorValueV2;
  evidenceIds: readonly string[];
}

export interface GenericPaletteStructureV2 {
  structureId: string;
  sectionKind: SourceColorSectionKind;
  title: string;
  sourceNodeId: string;
  extractionMethod: 'explicit-heading';
  entries: readonly GenericPaletteEntryV2[];
  evidenceIds: readonly string[];
}

export type GenericUsageContextKindV2 =
  'product-ui' | 'text' | 'chart' | 'product-graphic' | 'unknown';

export interface GenericColorUsageV2 {
  usageId: string;
  tokenId?: string;
  mode: string;
  value: GenericColorValueV2;
  count: number;
  /** Only contexts directly proven by inventory may be named; otherwise `unknown`. */
  contextKinds: readonly GenericUsageContextKindV2[];
  evidenceIds: readonly string[];
}

export type GenericSourceGapKindV2 =
  | 'unsupported-profile'
  | 'partial-inventory'
  | 'cancelled'
  | 'empty'
  | 'capacity'
  | 'missing-alias-target'
  | 'alias-cycle'
  | 'alias-depth'
  | 'cross-collection-alias'
  | 'duplicate-mode-name'
  | 'unsupported-paint'
  | 'context-dependent-color'
  | 'remote-descriptor-only'
  | 'insufficient-context'
  | 'semantic-role-conflict'
  | 'primary-not-found'
  | 'section-not-found';

export interface GenericSourceGapV2 {
  gapId: string;
  kind: GenericSourceGapKindV2;
  status: 'unsupported' | 'contradicted';
  summary: string;
  evidenceIds: readonly string[];
  consumerIds: readonly string[];
}

export interface GenericEnabledLibraryVariableDescriptorV2 {
  key: string;
  name: string;
  resolvedType: string;
}

export interface GenericEnabledLibraryDescriptorV2 {
  collectionKey: string;
  collectionName: string;
  libraryName: string;
  variables: readonly GenericEnabledLibraryVariableDescriptorV2[];
  evidenceIds: readonly string[];
}

export interface GenericSourceScopeV2 {
  kind: 'selection' | 'current-file';
  usageScope: Exclude<SnapshotUsageScope, 'not-applicable'>;
  selectedNodeIds: readonly string[];
  loadedPageIds: readonly string[];
  excludedPageIds: readonly string[];
  coverage: 'complete-supported-scope' | 'partial' | 'capacity-blocked';
}

export interface ColorSystemGenericSourceSnapshotInputV2 {
  schemaVersion?: typeof COLOR_SYSTEM_GENERIC_SOURCE_SCHEMA_VERSION;
  adapterVersion?: typeof COLOR_SYSTEM_GENERIC_SOURCE_ADAPTER_VERSION;
  capturedAt: string;
  scope: GenericSourceScopeV2;
  documentProfile: SnapshotDocumentProfile;
  collections: readonly GenericColorCollectionV2[];
  variables: readonly GenericColorVariableV2[];
  paintStyles: readonly GenericPaintStyleV2[];
  paletteStructures: readonly GenericPaletteStructureV2[];
  usageEvidence: readonly GenericColorUsageV2[];
  unsupported: readonly GenericSourceGapV2[];
  evidence: readonly GenericEvidenceRefV2[];
  enabledLibraryDescriptors: readonly GenericEnabledLibraryDescriptorV2[];
  libraryBoundaryNote: string;
  scannedNodeCount: number;
  cancelled: boolean;
  partial: boolean;
}

export interface ColorSystemGenericSourceSnapshotV2 extends Omit<
  ColorSystemGenericSourceSnapshotInputV2,
  'schemaVersion' | 'adapterVersion'
> {
  schemaVersion: typeof COLOR_SYSTEM_GENERIC_SOURCE_SCHEMA_VERSION;
  adapterVersion: typeof COLOR_SYSTEM_GENERIC_SOURCE_ADAPTER_VERSION;
  currentFileContentHash: string;
  sourceSnapshotHash: string;
  /** Exact serialized identity for native color values and preserved paint numerics. */
  exactNativeValueHash?: string;
}

function fail(message: string): never {
  throw new Error(`Invalid generic color source: ${message}`);
}

function compareText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} must be a plain object.`);
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string
): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length > 0) fail(`${label} has unsupported fields: ${unknown.sort().join(', ')}.`);
  const missing = required.filter(key => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing.length > 0) fail(`${label} is missing fields: ${missing.join(', ')}.`);
}

function textValue(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string') fail(`${label} must be text.`);
  const normalized = value.normalize('NFC');
  if (
    (!allowEmpty && normalized.trim().length === 0) ||
    normalized.length > COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2
  ) {
    fail(`${label} must be ${allowEmpty ? 'bounded' : 'non-empty bounded'} text.`);
  }
  return normalized;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} must be boolean.`);
  return value;
}

function finiteNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${label} must be a finite number from ${minimum} through ${maximum}.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  const normalized = finiteNumber(value, label, minimum, maximum);
  if (!Number.isInteger(normalized)) fail(`${label} must be an integer.`);
  return normalized;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    fail(`${label} is unsupported.`);
  }
  return value as T[number];
}

function arrayValue(value: unknown, label: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    fail(`${label} must be an array with at most ${maximum} items.`);
  }
  return value;
}

function uniqueSortedText(
  value: unknown,
  label: string,
  maximum: number,
  allowEmpty = true
): string[] {
  const values = arrayValue(value, label, maximum).map((item, index) =>
    textValue(item, `${label}[${index}]`)
  );
  if (!allowEmpty && values.length === 0) fail(`${label} must not be empty.`);
  if (new Set(values).size !== values.length) fail(`${label} must not contain duplicates.`);
  return values.sort(compareText);
}

function normalizeJson(value: unknown, label: string, depth = 0): GenericJsonValueV2 {
  if (depth > MAX_JSON_DEPTH) fail(`${label} exceeds JSON depth ${MAX_JSON_DEPTH}.`);
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return typeof value === 'string' ? textValue(value, label, true) : value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${label} contains a non-finite number.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (value.length > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.evidenceItems) {
      fail(`${label} exceeds the bounded JSON array size.`);
    }
    return value.map((item, index) => normalizeJson(item, `${label}[${index}]`, depth + 1));
  }
  const source = record(value, label);
  const output: Record<string, GenericJsonValueV2> = Object.create(null);
  const keys = Object.keys(source).sort(compareText);
  if (keys.length > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.evidenceItems) {
    fail(`${label} exceeds the bounded JSON object size.`);
  }
  for (const key of keys) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      fail(`${label} contains a prototype-bearing key.`);
    }
    output[textValue(key, `${label} key`)] = normalizeJson(
      source[key],
      `${label}.${key}`,
      depth + 1
    );
  }
  return output;
}

function normalizeColorValue(value: unknown, label: string): GenericColorValueV2 {
  const source = record(value, label);
  exactKeys(source, ['colorSpace', 'components', 'alpha'], [], label);
  const components = arrayValue(source.components, `${label}.components`, 3);
  if (components.length !== 3) fail(`${label}.components must contain exactly three channels.`);
  return {
    colorSpace: enumValue(
      source.colorSpace,
      ['srgb', 'display-p3', 'unverified'] as const,
      `${label}.colorSpace`
    ),
    components: [
      finiteNumber(components[0], `${label}.components[0]`, 0, 1),
      finiteNumber(components[1], `${label}.components[1]`, 0, 1),
      finiteNumber(components[2], `${label}.components[2]`, 0, 1),
    ],
    alpha: finiteNumber(source.alpha, `${label}.alpha`, 0, 1),
  };
}

function normalizeEvidenceRef(value: unknown, index: number): GenericEvidenceRefV2 {
  const label = `evidence[${index}]`;
  const source = record(value, label);
  exactKeys(source, ['evidenceId', 'kind', 'locator'], ['detail'], label);
  return {
    evidenceId: textValue(source.evidenceId, `${label}.evidenceId`),
    kind: enumValue(
      source.kind,
      [
        'figma-resource',
        'figma-node',
        'token-path',
        'document-page',
        'manual',
        'audit-observation',
        'enabled-library-descriptor',
      ] as const,
      `${label}.kind`
    ),
    locator: textValue(source.locator, `${label}.locator`),
    ...(source.detail === undefined
      ? {}
      : { detail: textValue(source.detail, `${label}.detail`, true) }),
  };
}

function normalizeScope(value: unknown): GenericSourceScopeV2 {
  const source = record(value, 'scope');
  exactKeys(
    source,
    ['kind', 'usageScope', 'selectedNodeIds', 'loadedPageIds', 'excludedPageIds', 'coverage'],
    [],
    'scope'
  );
  const selectedNodeIds = uniqueSortedText(
    source.selectedNodeIds,
    'scope.selectedNodeIds',
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  );
  const loadedPageIds = uniqueSortedText(
    source.loadedPageIds,
    'scope.loadedPageIds',
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources,
    false
  );
  const excludedPageIds = uniqueSortedText(
    source.excludedPageIds,
    'scope.excludedPageIds',
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  );
  if (loadedPageIds.some(id => excludedPageIds.includes(id))) {
    fail('scope loaded and excluded page IDs must not overlap.');
  }
  const kind = enumValue(source.kind, ['selection', 'current-file'] as const, 'scope.kind');
  const usageScope = enumValue(
    source.usageScope,
    ['selection', 'current-page', 'whole-file'] as const,
    'scope.usageScope'
  );
  if (kind === 'selection' && usageScope !== 'selection') {
    fail('Selection scope must use selection audit evidence.');
  }
  if (usageScope === 'selection' && kind !== 'selection') {
    fail('Selection audit evidence must use selection scope.');
  }
  if (usageScope !== 'selection' && selectedNodeIds.length > 0) {
    fail('Non-selection scope must not include selected node IDs.');
  }
  return {
    kind,
    usageScope,
    selectedNodeIds,
    loadedPageIds,
    excludedPageIds,
    coverage: enumValue(
      source.coverage,
      ['complete-supported-scope', 'partial', 'capacity-blocked'] as const,
      'scope.coverage'
    ),
  };
}

function normalizeMode(value: unknown, collectionId: string, index: number): GenericModeRefV2 {
  const label = `collections.${collectionId}.modes[${index}]`;
  const source = record(value, label);
  exactKeys(source, ['collectionId', 'modeId', 'name', 'order'], [], label);
  if (source.collectionId !== collectionId)
    fail(`${label}.collectionId must match its collection.`);
  return {
    collectionId,
    modeId: textValue(source.modeId, `${label}.modeId`),
    name: textValue(source.name, `${label}.name`),
    order: integer(source.order, `${label}.order`, 1, COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.modes),
  };
}

function normalizeCollection(value: unknown, index: number): GenericColorCollectionV2 {
  const label = `collections[${index}]`;
  const source = record(value, label);
  exactKeys(source, ['collectionId', 'name', 'defaultModeId', 'modes'], [], label);
  const collectionId = textValue(source.collectionId, `${label}.collectionId`);
  const modes = arrayValue(
    source.modes,
    `${label}.modes`,
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.modes
  )
    .map((mode, modeIndex) => normalizeMode(mode, collectionId, modeIndex))
    .sort((left, right) => left.order - right.order || compareText(left.modeId, right.modeId));
  if (modes.length === 0) fail(`${label}.modes must not be empty.`);
  if (new Set(modes.map(mode => mode.modeId)).size !== modes.length) {
    fail(`${label}.modes must have unique mode IDs.`);
  }
  modes.forEach((mode, modeIndex) => {
    if (mode.order !== modeIndex + 1) fail(`${label}.modes must use contiguous native order.`);
  });
  const defaultModeId = textValue(source.defaultModeId, `${label}.defaultModeId`);
  if (!modes.some(mode => mode.modeId === defaultModeId)) {
    fail(`${label}.defaultModeId must identify a collection mode.`);
  }
  return {
    collectionId,
    name: textValue(source.name, `${label}.name`),
    defaultModeId,
    modes,
  };
}

function normalizeRawVariableValue(value: unknown, label: string): GenericRawVariableValueV2 {
  const source = record(value, label);
  const kind = enumValue(source.kind, ['color', 'alias', 'missing'] as const, `${label}.kind`);
  if (kind === 'color') {
    exactKeys(source, ['kind', 'value'], [], label);
    return { kind, value: normalizeColorValue(source.value, `${label}.value`) };
  }
  if (kind === 'alias') {
    exactKeys(source, ['kind', 'targetVariableId'], [], label);
    return {
      kind,
      targetVariableId: textValue(source.targetVariableId, `${label}.targetVariableId`),
    };
  }
  exactKeys(source, ['kind'], [], label);
  return { kind };
}

function normalizeVariableMode(
  value: unknown,
  variableId: string,
  index: number
): GenericVariableModeValueV2 {
  const label = `variables.${variableId}.valuesByMode[${index}]`;
  const source = record(value, label);
  exactKeys(source, ['modeId', 'modeName', 'rawValue', 'resolution'], ['resolvedValue'], label);
  const rawValue = normalizeRawVariableValue(source.rawValue, `${label}.rawValue`);
  const resolution = enumValue(
    source.resolution,
    ['literal', 'resolved-alias', 'unresolved-alias', 'unsupported-profile', 'missing'] as const,
    `${label}.resolution`
  );
  if (
    rawValue.kind === 'color' &&
    resolution !== 'literal' &&
    resolution !== 'unsupported-profile'
  ) {
    fail(`${label} literal raw values must use literal or unsupported-profile resolution.`);
  }
  if (rawValue.kind === 'alias' && resolution === 'literal') {
    fail(`${label} alias raw values cannot use literal resolution.`);
  }
  if (rawValue.kind === 'missing' && resolution !== 'missing') {
    fail(`${label} missing raw values must use missing resolution.`);
  }
  const resolvedValue =
    source.resolvedValue === undefined
      ? undefined
      : normalizeColorValue(source.resolvedValue, `${label}.resolvedValue`);
  if (resolution === 'resolved-alias' && resolvedValue === undefined) {
    fail(`${label} resolved aliases require resolvedValue.`);
  }
  if (
    (resolution === 'unresolved-alias' ||
      resolution === 'unsupported-profile' ||
      resolution === 'missing') &&
    resolvedValue
  ) {
    fail(`${label} blocked resolutions cannot retain resolvedValue.`);
  }
  return {
    modeId: textValue(source.modeId, `${label}.modeId`),
    modeName: textValue(source.modeName, `${label}.modeName`),
    rawValue,
    ...(resolvedValue ? { resolvedValue } : {}),
    resolution,
  };
}

function normalizeVariable(value: unknown, index: number): GenericColorVariableV2 {
  const label = `variables[${index}]`;
  const source = record(value, label);
  exactKeys(
    source,
    ['variableId', 'name', 'description', 'collectionId', 'scopes', 'valuesByMode', 'evidenceIds'],
    [],
    label
  );
  const variableId = textValue(source.variableId, `${label}.variableId`);
  return {
    variableId,
    name: textValue(source.name, `${label}.name`),
    description: textValue(source.description, `${label}.description`, true),
    collectionId: textValue(source.collectionId, `${label}.collectionId`),
    scopes: uniqueSortedText(source.scopes, `${label}.scopes`, 64),
    valuesByMode: arrayValue(
      source.valuesByMode,
      `${label}.valuesByMode`,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.modes
    ).map((mode, modeIndex) => normalizeVariableMode(mode, variableId, modeIndex)),
    evidenceIds: uniqueSortedText(
      source.evidenceIds,
      `${label}.evidenceIds`,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.evidenceItems,
      false
    ),
  };
}

function normalizePaint(value: unknown, styleId: string, index: number): GenericPaintRecordV2 {
  const label = `paintStyles.${styleId}.paints[${index}]`;
  const source = record(value, label);
  exactKeys(
    source,
    ['order', 'type', 'visible', 'opacity', 'blendMode', 'payload'],
    ['boundVariableId', 'solidValue'],
    label
  );
  const payload = normalizeJson(source.payload, `${label}.payload`);
  if (!isRecord(payload)) fail(`${label}.payload must be an object.`);
  const type = textValue(source.type, `${label}.type`);
  const solidValue =
    source.solidValue === undefined
      ? undefined
      : normalizeColorValue(source.solidValue, `${label}.solidValue`);
  if (type === 'SOLID' && !solidValue) fail(`${label} solid paint requires solidValue.`);
  if (type !== 'SOLID' && solidValue) fail(`${label} non-solid paint cannot expose solidValue.`);
  return {
    order: integer(
      source.order,
      `${label}.order`,
      1,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
    ),
    type,
    visible: booleanValue(source.visible, `${label}.visible`),
    opacity: finiteNumber(source.opacity, `${label}.opacity`, 0, 1),
    blendMode: textValue(source.blendMode, `${label}.blendMode`),
    ...(source.boundVariableId === undefined
      ? {}
      : { boundVariableId: textValue(source.boundVariableId, `${label}.boundVariableId`) }),
    ...(solidValue ? { solidValue } : {}),
    payload,
  };
}

function normalizeDirectDeclaration(
  value: unknown,
  label: string
): GenericPaintDirectDeclarationV2 | null {
  if (value === null) return null;
  const source = record(value, label);
  const kind = enumValue(source.kind, ['literal', 'alias'] as const, `${label}.kind`);
  if (kind === 'literal') {
    exactKeys(source, ['kind', 'value'], [], label);
    return { kind, value: normalizeColorValue(source.value, `${label}.value`) };
  }
  exactKeys(source, ['kind', 'targetVariableId'], [], label);
  return {
    kind,
    targetVariableId: textValue(source.targetVariableId, `${label}.targetVariableId`),
  };
}

function normalizePaintStyle(value: unknown, index: number): GenericPaintStyleV2 {
  const label = `paintStyles[${index}]`;
  const source = record(value, label);
  exactKeys(
    source,
    [
      'styleId',
      'name',
      'description',
      'paints',
      'directDeclaration',
      'governingEligibility',
      'evidenceIds',
    ],
    [],
    label
  );
  const styleId = textValue(source.styleId, `${label}.styleId`);
  const paints = arrayValue(
    source.paints,
    `${label}.paints`,
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  ).map((paint, paintIndex) => normalizePaint(paint, styleId, paintIndex));
  paints.forEach((paint, paintIndex) => {
    if (paint.order !== paintIndex + 1)
      fail(`${label}.paints must retain contiguous native order.`);
  });
  const directDeclaration = normalizeDirectDeclaration(
    source.directDeclaration,
    `${label}.directDeclaration`
  );
  const governingEligibility = enumValue(
    source.governingEligibility,
    ['eligible', 'context-dependent', 'unsupported'] as const,
    `${label}.governingEligibility`
  );
  const visiblePaints = paints.filter(paint => paint.visible);
  const soleSolid =
    visiblePaints.length === 1 && visiblePaints[0].type === 'SOLID' ? visiblePaints[0] : null;
  const expectedEligibility = !soleSolid
    ? 'unsupported'
    : soleSolid.blendMode !== 'NORMAL' ||
        soleSolid.opacity < 1 ||
        (soleSolid.solidValue?.alpha ?? 1) < 1
      ? 'context-dependent'
      : 'eligible';
  if (governingEligibility !== expectedEligibility) {
    fail(`${label}.governingEligibility does not match its exact paint evidence.`);
  }
  if (governingEligibility !== 'eligible' && directDeclaration !== null) {
    fail(`${label} blocked styles cannot expose a direct declaration.`);
  }
  if (governingEligibility === 'eligible') {
    if (!soleSolid?.solidValue || directDeclaration === null) {
      fail(`${label} eligible styles require one exact direct declaration.`);
    }
    if (
      soleSolid.boundVariableId &&
      (directDeclaration.kind !== 'alias' ||
        directDeclaration.targetVariableId !== soleSolid.boundVariableId)
    ) {
      fail(`${label} direct alias must match its bound Variable.`);
    }
    if (
      !soleSolid.boundVariableId &&
      (directDeclaration.kind !== 'literal' ||
        canonicalJson(directDeclaration.value) !== canonicalJson(soleSolid.solidValue))
    ) {
      fail(`${label} direct literal must match its solid paint.`);
    }
  }
  return {
    styleId,
    name: textValue(source.name, `${label}.name`),
    description: textValue(source.description, `${label}.description`, true),
    paints,
    directDeclaration,
    governingEligibility,
    evidenceIds: uniqueSortedText(
      source.evidenceIds,
      `${label}.evidenceIds`,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.evidenceItems,
      false
    ),
  };
}

function normalizePaletteEntry(
  value: unknown,
  structureId: string,
  index: number
): GenericPaletteEntryV2 {
  const label = `paletteStructures.${structureId}.entries[${index}]`;
  const source = record(value, label);
  exactKeys(source, ['entryId', 'name', 'order', 'value', 'evidenceIds'], [], label);
  return {
    entryId: textValue(source.entryId, `${label}.entryId`),
    name: textValue(source.name, `${label}.name`),
    order: integer(
      source.order,
      `${label}.order`,
      1,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
    ),
    value: normalizeColorValue(source.value, `${label}.value`),
    evidenceIds: uniqueSortedText(
      source.evidenceIds,
      `${label}.evidenceIds`,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.evidenceItems,
      false
    ),
  };
}

function normalizePalette(value: unknown, index: number): GenericPaletteStructureV2 {
  const label = `paletteStructures[${index}]`;
  const source = record(value, label);
  exactKeys(
    source,
    [
      'structureId',
      'sectionKind',
      'title',
      'sourceNodeId',
      'extractionMethod',
      'entries',
      'evidenceIds',
    ],
    [],
    label
  );
  const structureId = textValue(source.structureId, `${label}.structureId`);
  const entries = arrayValue(
    source.entries,
    `${label}.entries`,
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  ).map((entry, entryIndex) => normalizePaletteEntry(entry, structureId, entryIndex));
  if (entries.length === 0) fail(`${label}.entries must not be empty.`);
  entries.forEach((entry, entryIndex) => {
    if (entry.order !== entryIndex + 1)
      fail(`${label}.entries must retain contiguous native order.`);
  });
  return {
    structureId,
    sectionKind: enumValue(source.sectionKind, SECTION_ORDER, `${label}.sectionKind`),
    title: textValue(source.title, `${label}.title`),
    sourceNodeId: textValue(source.sourceNodeId, `${label}.sourceNodeId`),
    extractionMethod: enumValue(
      source.extractionMethod,
      ['explicit-heading'] as const,
      `${label}.extractionMethod`
    ),
    entries,
    evidenceIds: uniqueSortedText(
      source.evidenceIds,
      `${label}.evidenceIds`,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.evidenceItems,
      false
    ),
  };
}

function normalizeUsage(value: unknown, index: number): GenericColorUsageV2 {
  const label = `usageEvidence[${index}]`;
  const source = record(value, label);
  exactKeys(
    source,
    ['usageId', 'mode', 'value', 'count', 'contextKinds', 'evidenceIds'],
    ['tokenId'],
    label
  );
  const contextKinds = uniqueSortedText(source.contextKinds, `${label}.contextKinds`, 5, false).map(
    item =>
      enumValue(
        item,
        ['product-ui', 'text', 'chart', 'product-graphic', 'unknown'] as const,
        `${label}.contextKinds`
      )
  );
  if (contextKinds.includes('unknown') && contextKinds.length > 1) {
    fail(`${label}.contextKinds cannot mix unknown with proven contexts.`);
  }
  return {
    usageId: textValue(source.usageId, `${label}.usageId`),
    ...(source.tokenId === undefined
      ? {}
      : { tokenId: textValue(source.tokenId, `${label}.tokenId`) }),
    mode: textValue(source.mode, `${label}.mode`),
    value: normalizeColorValue(source.value, `${label}.value`),
    count: integer(source.count, `${label}.count`, 1, Number.MAX_SAFE_INTEGER),
    contextKinds,
    evidenceIds: uniqueSortedText(
      source.evidenceIds,
      `${label}.evidenceIds`,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.evidenceItems,
      false
    ),
  };
}

function normalizeGap(value: unknown, index: number): GenericSourceGapV2 {
  const label = `unsupported[${index}]`;
  const source = record(value, label);
  exactKeys(
    source,
    ['gapId', 'kind', 'status', 'summary', 'evidenceIds', 'consumerIds'],
    [],
    label
  );
  return {
    gapId: textValue(source.gapId, `${label}.gapId`),
    kind: enumValue(
      source.kind,
      [
        'unsupported-profile',
        'partial-inventory',
        'cancelled',
        'empty',
        'capacity',
        'missing-alias-target',
        'alias-cycle',
        'alias-depth',
        'cross-collection-alias',
        'duplicate-mode-name',
        'unsupported-paint',
        'context-dependent-color',
        'remote-descriptor-only',
        'insufficient-context',
      ] as const,
      `${label}.kind`
    ),
    status: enumValue(source.status, ['unsupported', 'contradicted'] as const, `${label}.status`),
    summary: textValue(source.summary, `${label}.summary`),
    evidenceIds: uniqueSortedText(
      source.evidenceIds,
      `${label}.evidenceIds`,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.evidenceItems,
      false
    ),
    consumerIds: uniqueSortedText(
      source.consumerIds,
      `${label}.consumerIds`,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.evidenceItems,
      false
    ),
  };
}

function normalizeLibraryDescriptor(
  value: unknown,
  index: number
): GenericEnabledLibraryDescriptorV2 {
  const label = `enabledLibraryDescriptors[${index}]`;
  const source = record(value, label);
  exactKeys(
    source,
    ['collectionKey', 'collectionName', 'libraryName', 'variables', 'evidenceIds'],
    [],
    label
  );
  const variables = arrayValue(
    source.variables,
    `${label}.variables`,
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  )
    .map((item, variableIndex): GenericEnabledLibraryVariableDescriptorV2 => {
      const variableLabel = `${label}.variables[${variableIndex}]`;
      const variable = record(item, variableLabel);
      exactKeys(variable, ['key', 'name', 'resolvedType'], [], variableLabel);
      return {
        key: textValue(variable.key, `${variableLabel}.key`),
        name: textValue(variable.name, `${variableLabel}.name`),
        resolvedType: textValue(variable.resolvedType, `${variableLabel}.resolvedType`),
      };
    })
    .sort((left, right) => compareText(left.key, right.key));
  if (new Set(variables.map(variable => variable.key)).size !== variables.length) {
    fail(`${label}.variables must use unique keys.`);
  }
  return {
    collectionKey: textValue(source.collectionKey, `${label}.collectionKey`),
    collectionName: textValue(source.collectionName, `${label}.collectionName`),
    libraryName: textValue(source.libraryName, `${label}.libraryName`),
    variables,
    evidenceIds: uniqueSortedText(
      source.evidenceIds,
      `${label}.evidenceIds`,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.evidenceItems,
      false
    ),
  };
}

function requireUnique<T>(items: readonly T[], key: (item: T) => string, label: string): void {
  const values = items.map(key);
  if (new Set(values).size !== values.length) fail(`${label} must use unique identities.`);
}

function referencedEvidenceIds(
  snapshot: Omit<
    ColorSystemGenericSourceSnapshotV2,
    'sourceSnapshotHash' | 'currentFileContentHash'
  >
): string[] {
  return [
    ...snapshot.variables.flatMap(item => item.evidenceIds),
    ...snapshot.paintStyles.flatMap(item => item.evidenceIds),
    ...snapshot.paletteStructures.flatMap(item => [
      ...item.evidenceIds,
      ...item.entries.flatMap(entry => entry.evidenceIds),
    ]),
    ...snapshot.usageEvidence.flatMap(item => item.evidenceIds),
    ...snapshot.unsupported.flatMap(item => item.evidenceIds),
    ...snapshot.enabledLibraryDescriptors.flatMap(item => item.evidenceIds),
  ];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/**
 * Strictly normalizes backend-owned source facts. Non-semantic resource arrays
 * are sorted; Figma-owned mode, paint, and palette-card order is retained.
 */
export function buildColorSystemGenericSourceSnapshotV2(
  input: unknown
): ColorSystemGenericSourceSnapshotV2 {
  const source = record(input, 'snapshot input');
  exactKeys(
    source,
    [
      'capturedAt',
      'scope',
      'documentProfile',
      'collections',
      'variables',
      'paintStyles',
      'paletteStructures',
      'usageEvidence',
      'unsupported',
      'evidence',
      'enabledLibraryDescriptors',
      'libraryBoundaryNote',
      'scannedNodeCount',
      'cancelled',
      'partial',
    ],
    ['schemaVersion', 'adapterVersion'],
    'snapshot input'
  );
  if (
    source.schemaVersion !== undefined &&
    source.schemaVersion !== COLOR_SYSTEM_GENERIC_SOURCE_SCHEMA_VERSION
  ) {
    fail('snapshot input schemaVersion is unsupported.');
  }
  if (
    source.adapterVersion !== undefined &&
    source.adapterVersion !== COLOR_SYSTEM_GENERIC_SOURCE_ADAPTER_VERSION
  ) {
    fail('snapshot input adapterVersion is unsupported.');
  }

  const collections = arrayValue(
    source.collections,
    'collections',
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  )
    .map(normalizeCollection)
    .sort((left, right) => compareText(left.collectionId, right.collectionId));
  const rawVariables = arrayValue(
    source.variables,
    'variables',
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  );
  const rawPaintStyles = arrayValue(
    source.paintStyles,
    'paintStyles',
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  );
  const rawPaletteStructures = arrayValue(
    source.paletteStructures,
    'paletteStructures',
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  );
  let paletteEntryCount = 0;
  rawPaletteStructures.forEach((palette, index) => {
    const paletteSource = record(palette, `paletteStructures[${index}]`);
    const entries = arrayValue(
      paletteSource.entries,
      `paletteStructures[${index}].entries`,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
    );
    paletteEntryCount += entries.length;
    if (
      rawVariables.length + rawPaintStyles.length + paletteEntryCount >
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
    ) {
      fail(
        `Variables, Paint Styles, and palette entries exceed ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources} combined declarations.`
      );
    }
  });
  if (
    rawVariables.length + rawPaintStyles.length + paletteEntryCount >
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  ) {
    fail(
      `Variables, Paint Styles, and palette entries exceed ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources} combined declarations.`
    );
  }
  let variables = rawVariables
    .map(normalizeVariable)
    .sort((left, right) => compareText(left.variableId, right.variableId));
  const paintStyles = rawPaintStyles
    .map(normalizePaintStyle)
    .sort((left, right) => compareText(left.styleId, right.styleId));
  const paletteStructures = rawPaletteStructures
    .map(normalizePalette)
    .sort(
      (left, right) =>
        SECTION_ORDER.indexOf(left.sectionKind) - SECTION_ORDER.indexOf(right.sectionKind) ||
        compareText(left.sourceNodeId, right.sourceNodeId)
    );
  const usageEvidence = arrayValue(
    source.usageEvidence,
    'usageEvidence',
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.usage
  )
    .map(normalizeUsage)
    .sort((left, right) => compareText(left.usageId, right.usageId));
  const unsupported = arrayValue(
    source.unsupported,
    'unsupported',
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.diagnostics
  )
    .map(normalizeGap)
    .sort((left, right) => compareText(left.gapId, right.gapId));
  const evidence = arrayValue(
    source.evidence,
    'evidence',
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  )
    .map(normalizeEvidenceRef)
    .sort((left, right) => compareText(left.evidenceId, right.evidenceId));
  if (utf8ByteLength(canonicalJson(evidence)) > COLOR_SYSTEM_GENERIC_SOURCE_EVIDENCE_MAX_BYTES) {
    fail(
      `evidence exceeds the ${COLOR_SYSTEM_GENERIC_SOURCE_EVIDENCE_MAX_BYTES}-byte serialized capacity.`
    );
  }
  const enabledLibraryDescriptors = arrayValue(
    source.enabledLibraryDescriptors,
    'enabledLibraryDescriptors',
    COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  )
    .map(normalizeLibraryDescriptor)
    .sort((left, right) => compareText(left.collectionKey, right.collectionKey));

  requireUnique(collections, item => item.collectionId, 'collections');
  requireUnique(variables, item => item.variableId, 'variables');
  requireUnique(paintStyles, item => item.styleId, 'paintStyles');
  requireUnique(paletteStructures, item => item.structureId, 'paletteStructures');
  requireUnique(usageEvidence, item => item.usageId, 'usageEvidence');
  requireUnique(unsupported, item => item.gapId, 'unsupported');
  requireUnique(evidence, item => item.evidenceId, 'evidence');
  requireUnique(enabledLibraryDescriptors, item => item.collectionKey, 'enabledLibraryDescriptors');

  const collectionById = new Map(collections.map(item => [item.collectionId, item]));
  variables = variables.map(variable => {
    const collection = collectionById.get(variable.collectionId);
    if (!collection) fail(`Variable ${variable.variableId} references a missing collection.`);
    const modeById = new Map(collection.modes.map(mode => [mode.modeId, mode]));
    if (variable.valuesByMode.length !== collection.modes.length) {
      fail(`Variable ${variable.variableId} must preserve every collection mode.`);
    }
    const seenModes = new Set<string>();
    variable.valuesByMode.forEach(value => {
      const mode = modeById.get(value.modeId);
      if (!mode || mode.name !== value.modeName) {
        fail(`Variable ${variable.variableId} has a mode that does not match its collection.`);
      }
      if (seenModes.has(value.modeId)) fail(`Variable ${variable.variableId} repeats a mode.`);
      seenModes.add(value.modeId);
    });
    return {
      ...variable,
      valuesByMode: [...variable.valuesByMode].sort(
        (left, right) =>
          (modeById.get(left.modeId)?.order ?? 0) - (modeById.get(right.modeId)?.order ?? 0)
      ),
    };
  });

  const documentProfile = enumValue(
    source.documentProfile,
    ['srgb', 'display-p3', 'legacy', 'unknown'] as const,
    'documentProfile'
  );
  const expectedColorSpace =
    documentProfile === 'srgb'
      ? 'srgb'
      : documentProfile === 'display-p3'
        ? 'display-p3'
        : 'unverified';
  const allValues = [
    ...variables.flatMap(item =>
      item.valuesByMode.flatMap(value => [
        ...(value.rawValue.kind === 'color' ? [value.rawValue.value] : []),
        ...(value.resolvedValue ? [value.resolvedValue] : []),
      ])
    ),
    ...paintStyles.flatMap(item =>
      item.paints.flatMap(paint => (paint.solidValue ? [paint.solidValue] : []))
    ),
    ...paletteStructures.flatMap(item => item.entries.map(entry => entry.value)),
    ...usageEvidence.map(item => item.value),
  ];
  if (allValues.some(value => value.colorSpace !== expectedColorSpace)) {
    fail(`Color channels must retain the declared ${documentProfile} document profile.`);
  }
  const paintNumerics = paintStyles.map(style => ({
    styleId: style.styleId,
    paints: style.paints.map(paint => ({
      order: paint.order,
      opacity: paint.opacity,
      payload: paint.payload,
    })),
  }));
  // These numbers were captured from the document. They are not results of
  // perceptual calculations, including when the paint itself is unsupported.
  const needsExactPaintIdentity = canonicalJson(paintNumerics) !== canonicalHashJson(paintNumerics);
  const needsExactColorIdentity = allValues.some(value =>
    colorSystemSrgbNeedsNativeRepresentationV1(
      { r: value.components[0], g: value.components[1], b: value.components[2] },
      value.alpha
    )
  );
  const exactNativeValueHash =
    needsExactColorIdentity || needsExactPaintIdentity
      ? deterministicContentHash(canonicalJson({ values: allValues, paintNumerics }))
      : undefined;

  const base = {
    schemaVersion: COLOR_SYSTEM_GENERIC_SOURCE_SCHEMA_VERSION,
    adapterVersion: COLOR_SYSTEM_GENERIC_SOURCE_ADAPTER_VERSION,
    capturedAt: textValue(source.capturedAt, 'capturedAt'),
    scope: normalizeScope(source.scope),
    documentProfile,
    ...(exactNativeValueHash === undefined ? {} : { exactNativeValueHash }),
    collections,
    variables,
    paintStyles,
    paletteStructures,
    usageEvidence,
    unsupported,
    evidence,
    enabledLibraryDescriptors,
    libraryBoundaryNote: textValue(source.libraryBoundaryNote, 'libraryBoundaryNote', true),
    scannedNodeCount: integer(
      source.scannedNodeCount,
      'scannedNodeCount',
      0,
      COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.usage
    ),
    cancelled: booleanValue(source.cancelled, 'cancelled'),
    partial: booleanValue(source.partial, 'partial'),
  } as const;

  if (base.cancelled && !base.partial) fail('Cancelled snapshots must be partial.');
  if (base.partial && base.scope.coverage === 'complete-supported-scope') {
    fail('Partial snapshots cannot claim complete supported-scope coverage.');
  }
  const knownEvidenceIds = new Set(evidence.map(item => item.evidenceId));
  const missingEvidence = referencedEvidenceIds(base).filter(id => !knownEvidenceIds.has(id));
  if (missingEvidence.length > 0) {
    fail(`Referenced evidence is missing: ${[...new Set(missingEvidence)].sort().join(', ')}.`);
  }

  const currentFileContentHash = deterministicContentHash({
    ...(exactNativeValueHash === undefined ? {} : { exactNativeValueHash }),
    scope: base.scope,
    documentProfile: base.documentProfile,
    collections: base.collections,
    variables: base.variables,
    paintStyles: base.paintStyles,
    paletteStructures: base.paletteStructures,
    usageEvidence: base.usageEvidence,
    unsupported: base.unsupported,
    evidence: base.evidence,
    scannedNodeCount: base.scannedNodeCount,
    cancelled: base.cancelled,
    partial: base.partial,
  });
  const sourceSnapshotHash = deterministicContentHash({
    schemaVersion: base.schemaVersion,
    adapterVersion: base.adapterVersion,
    currentFileContentHash,
    enabledLibraryDescriptors: base.enabledLibraryDescriptors,
    libraryBoundaryNote: base.libraryBoundaryNote,
  });
  return deepFreeze({ ...base, currentFileContentHash, sourceSnapshotHash });
}

export function parseColorSystemGenericSourceSnapshotV2(
  value: unknown
): ColorSystemGenericSourceSnapshotV2 {
  const source = record(value, 'snapshot');
  exactKeys(
    source,
    [
      'schemaVersion',
      'adapterVersion',
      'capturedAt',
      'scope',
      'documentProfile',
      'collections',
      'variables',
      'paintStyles',
      'paletteStructures',
      'usageEvidence',
      'unsupported',
      'evidence',
      'enabledLibraryDescriptors',
      'libraryBoundaryNote',
      'scannedNodeCount',
      'cancelled',
      'partial',
      'currentFileContentHash',
      'sourceSnapshotHash',
    ],
    ['exactNativeValueHash'],
    'snapshot'
  );
  const suppliedContentHash = textValue(source.currentFileContentHash, 'currentFileContentHash');
  const suppliedSnapshotHash = textValue(source.sourceSnapshotHash, 'sourceSnapshotHash');
  if (!HASH.test(suppliedContentHash) || !HASH.test(suppliedSnapshotHash)) {
    fail('Snapshot hashes must be canonical SHA-256 values.');
  }
  const rebuilt = buildColorSystemGenericSourceSnapshotV2({
    schemaVersion: source.schemaVersion,
    adapterVersion: source.adapterVersion,
    capturedAt: source.capturedAt,
    scope: source.scope,
    documentProfile: source.documentProfile,
    collections: source.collections,
    variables: source.variables,
    paintStyles: source.paintStyles,
    paletteStructures: source.paletteStructures,
    usageEvidence: source.usageEvidence,
    unsupported: source.unsupported,
    evidence: source.evidence,
    enabledLibraryDescriptors: source.enabledLibraryDescriptors,
    libraryBoundaryNote: source.libraryBoundaryNote,
    scannedNodeCount: source.scannedNodeCount,
    cancelled: source.cancelled,
    partial: source.partial,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(value)) {
    fail('Snapshot is not canonical or its content hashes do not match.');
  }
  return rebuilt;
}

export function assertColorSystemGenericSourceSnapshotV2Integrity(
  snapshot: ColorSystemGenericSourceSnapshotV2
): void {
  parseColorSystemGenericSourceSnapshotV2(snapshot);
}
