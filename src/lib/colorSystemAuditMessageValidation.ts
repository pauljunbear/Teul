import {
  COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
  COLOR_SYSTEM_APPLY_FAILURE_RECEIPT_VERSION,
  COLOR_SYSTEM_AUDIT_EVIDENCE_TEXT_LIMIT,
  type ColorSystemAuditProgressMessage,
  type ColorSystemAuditResultMessage,
  type ColorSystemDeclaredPairsUpdateResultMessage,
  type ColorSystemExportKind,
  type ColorSystemExportResultMessage,
  type ColorSystemProposalApplyResultMessage,
  type ColorSystemProposalApprovalResultMessage,
  type ColorSystemProposalConfirmationResultMessage,
  type ColorSystemStrategySetResultMessage,
  type ColorSystemBuilderPackageImportResultMessage,
} from '../types/messages';
import {
  OBSERVED_LITERAL_EVIDENCE_LIMIT,
  OBSERVED_LITERAL_MODE_GROUP_ID,
  SOURCE_COLOR_SECTION_KINDS,
  STRUCTURED_SOURCE_MODE_GROUP_ID,
  type SourceColorSection,
  type SourceColorValue,
} from '../types/colorSystemAudit';
import { deterministicContentHash, observedLiteralCandidateIdentity } from './colorSystemAudit';
import { generateColorScale } from './colorScale';
import { evaluateVisualizationPalette } from './colorSystemVisualization';
import { COLOR_SYSTEM_INTENDED_SURFACES } from './colorSystemIntendedSurfaces';
import { RADIX_COLORS_VERSION, radixColors } from './radixColors';
import {
  isValidSourceSectionCollectionProvenance,
  isValidSourceSectionProvenance,
} from './colorSystemSourceSectionPolicy';
import { compareText } from './utils';
import {
  COLOR_SYSTEM_STRATEGY_SOURCE_TERRITORY_THRESHOLD_DELTA_E_OK,
  type ColorSystemStrategyCandidate,
} from './colorSystemStrategyBuilder';
import {
  buildColorSystemStrategyRecommendation,
  colorSystemStrategyActualSystemHash,
} from './colorSystemStrategyReceipts';

type UnknownRecord = Record<string, unknown>;

export type ColorSystemAuditPluginMessage =
  | ColorSystemAuditProgressMessage
  | ColorSystemAuditResultMessage
  | ColorSystemDeclaredPairsUpdateResultMessage
  | ColorSystemProposalApprovalResultMessage
  | ColorSystemProposalConfirmationResultMessage
  | ColorSystemStrategySetResultMessage
  | ColorSystemProposalApplyResultMessage
  | ColorSystemExportResultMessage
  | ColorSystemBuilderPackageImportResultMessage;

export interface ColorSystemAuditMessageExpectation {
  requestId?: string;
  sourceHash?: string;
  auditHash?: string;
  proposalHash?: string;
  reviewHash?: string;
  approvalHash?: string;
  exportKind?: ColorSystemExportKind;
}

export type ColorSystemAuditMessageValidationResult =
  | { valid: true; message: ColorSystemAuditPluginMessage }
  | { valid: false; error: string };

const HASH = /^sha256:[0-9a-f]{64}$/;
const REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const JSON_FILE = /^[^/\\]{1,256}\.json$/i;
const MODULES = [
  'brand-marketing',
  'product-primitives',
  'product-semantics',
  'data-visualization',
  'illustration',
] as const;
const STRATEGIES = ['exact-radix', 'brand-preserving', 'hybrid'] as const;
const CANDIDATE_STATUSES = [
  'suitable-candidate',
  'closest-candidate-outside-approved-tolerance',
] as const;
const STRATEGY_DIRECTIONS = ['close-harmony', 'balanced-contrast', 'wide-spectrum'] as const;
const PREVIEW_PRODUCT_SEMANTIC_ROLES = [
  'background',
  'surface',
  'text',
  'border',
  'focus',
  'disabled',
  'success',
  'warning',
  'error',
  'information',
  'destructive',
  'link',
  'selected',
] as const;
const APPLY_FAILURE_STAGES = [
  'preflight',
  'source-revalidation',
  'variable-creation',
  'style-creation',
  'overview-library-rendering',
  'verification',
  'journal-clear',
  'commit',
  'recovery',
] as const;
const STRATEGY_FAILURE_BLOCKER_CODES = [
  'INVALID_SOURCE_HASH',
  'INVALID_PRIMARY',
  'UNSUPPORTED_VISUALIZATION_CONTEXT',
  'PRIMARY_HUE_UNSTABLE',
  'SOURCE_REFERENCE_TERRITORY_UNAVAILABLE',
  'SOURCE_TERRITORY_MISMATCH',
  'NO_DISTINCT_SECONDARY_STRATEGY',
  'INVALID_GENERATED_SCALE',
  'NO_SUITABLE_CATEGORICAL_PALETTE',
  'NO_SUITABLE_SEQUENTIAL_PALETTE',
  'NO_SUITABLE_DIVERGING_PALETTE',
  'VISUALIZATION_EVALUATION_LIMIT_REACHED',
  'INCOMPLETE_STRATEGY_SET',
  'DUPLICATE_STRATEGY_COLLAPSED',
  'INVALID_CONFIRMATION',
  'TOKEN_NOT_FOUND',
  'MODE_NOT_FOUND',
  'UNSUPPORTED_VALUE',
  'HEX_MISMATCH',
  'PRIMARY_CONFIRMATION_REQUIRED',
] as const;
const STRATEGY_CATEGORICAL_RADIX_FAMILIES = [
  'blue',
  'red',
  'green',
  'purple',
  'orange',
  'cyan',
] as const;
const MAX_TEXT = 2_000;
const MAX_EVIDENCE_TEXT = COLOR_SYSTEM_AUDIT_EVIDENCE_TEXT_LIMIT;
const MAX_EXPORT_BYTES = 8 * 1024 * 1024;
const MAX_RESOURCES = 50_000;
const MAX_USAGE = 100_000;
const MAX_ITEMS = 5_000;
const MAX_MODES = 128;
// Covers the combined declared-capacity producer shape: 100k supported-usage
// records with two detailed locators and token references, plus 50k variable
// tokens with source/role evidence and optional scale positions. Field-specific
// validators below remain the authority for every collection.
const MAX_MESSAGE_TREE_NODES = MAX_USAGE * 32 + MAX_RESOURCES * 40 + 500_000;

function record(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function only(value: UnknownRecord, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function oneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === 'string' && options.includes(value);
}

function string(value: unknown, maximum = 256): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function optionalString(value: unknown, maximum = 256): boolean {
  return value === undefined || string(value, maximum);
}

function hash(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value);
}

function number(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isInteger(value) && number(value, minimum, maximum);
}

function oklchReceipt(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['l', 'c', 'h']) &&
    number(value.l, 0, 1) &&
    typeof value.c === 'number' &&
    Number.isFinite(value.c) &&
    value.c >= 0 &&
    typeof value.h === 'number' &&
    Number.isFinite(value.h) &&
    value.h >= 0 &&
    value.h < 360
  );
}

function array(
  value: unknown,
  maximum: number,
  validator: (entry: unknown) => boolean = () => true
): value is unknown[] {
  return Array.isArray(value) && value.length <= maximum && value.every(validator);
}

function strings(
  value: unknown,
  maximum: number,
  unique = false,
  maximumString = 256
): value is string[] {
  return (
    array(value, maximum, entry => string(entry, maximumString)) &&
    (!unique || new Set(value as string[]).size === (value as string[]).length)
  );
}

function boundedTree(root: unknown, maximumString: number): boolean {
  let nodes = 0;
  const active = new WeakSet<object>();
  const visit = (value: unknown, depth: number): boolean => {
    if (++nodes > MAX_MESSAGE_TREE_NODES || depth > 20) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'string') return value.length <= maximumString;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'object' || active.has(value)) return false;
    active.add(value);
    const valid = Array.isArray(value)
      ? value.length <= MAX_USAGE && value.every(entry => visit(entry, depth + 1))
      : Object.entries(value as UnknownRecord).every(
          ([key, entry]) => key.length > 0 && key.length <= 256 && visit(entry, depth + 1)
        );
    active.delete(value);
    return valid;
  };
  return visit(root, 0);
}

function stringRecord(
  value: unknown,
  maximum: number,
  validator: (entry: unknown) => boolean,
  requireEntry = false
): value is UnknownRecord {
  if (!record(value)) return false;
  const entries = Object.entries(value);
  return (
    (!requireEntry || entries.length > 0) &&
    entries.length <= maximum &&
    entries.every(([key, entry]) => string(key) && validator(entry))
  );
}

function normalizedComponents(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) && value.length === 3 && value.every(component => number(component, 0, 1))
  );
}

function componentsMatchHex(components: [number, number, number], hex: string): boolean {
  const expected = `#${components
    .map(component =>
      Math.round(component * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
  return expected === hex.toLowerCase();
}

function colorValue(value: unknown): boolean {
  const valid =
    record(value) &&
    only(value, ['colorSpace', 'hex', 'components', 'alpha']) &&
    oneOf(value.colorSpace, ['srgb', 'display-p3'] as const) &&
    (value.hex === undefined || (typeof value.hex === 'string' && HEX.test(value.hex))) &&
    normalizedComponents(value.components) &&
    number(value.alpha, 0, 1);
  return Boolean(
    valid &&
    (value.colorSpace !== 'srgb' ||
      value.hex === undefined ||
      componentsMatchHex(value.components as [number, number, number], value.hex as string))
  );
}

function sourceEvidence(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['kind', 'locator', 'detail']) &&
    oneOf(value.kind, [
      'figma-resource',
      'figma-node',
      'token-path',
      'document-page',
      'manual',
    ] as const) &&
    string(value.locator, MAX_TEXT) &&
    optionalString(value.detail, MAX_EVIDENCE_TEXT)
  );
}

function sourceUsage(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['id', 'tokenId', 'mode', 'value', 'count', 'evidence']) &&
    string(value.id) &&
    (value.tokenId === undefined || string(value.tokenId)) &&
    string(value.mode) &&
    colorValue(value.value) &&
    integer(value.count, 1) &&
    array(value.evidence, 1_000, sourceEvidence)
  );
}

function sourceSections(value: unknown, sourceLocator: string): boolean {
  if (value === undefined) return true;
  if (!array(value, SOURCE_COLOR_SECTION_KINDS.length)) return false;
  const kinds = new Set<string>();
  const nodeIds = new Set<string>();
  const entryIds = new Set<string>();
  let entryCount = 0;
  for (const section of value) {
    if (
      !record(section) ||
      !only(section, [
        'kind',
        'title',
        'sourceNodeId',
        'extractionMethod',
        'entries',
        'evidence',
      ]) ||
      !oneOf(section.kind, SOURCE_COLOR_SECTION_KINDS) ||
      !string(section.title, MAX_TEXT) ||
      !string(section.sourceNodeId) ||
      !oneOf(section.extractionMethod, ['explicit-heading'] as const) ||
      !array(section.entries, MAX_RESOURCES) ||
      section.entries.length === 0 ||
      !array(section.evidence, 1_000, sourceEvidence) ||
      section.evidence.length === 0 ||
      !isValidSourceSectionProvenance(sourceLocator, section as unknown as SourceColorSection) ||
      kinds.has(section.kind) ||
      nodeIds.has(section.sourceNodeId)
    ) {
      return false;
    }
    kinds.add(section.kind);
    nodeIds.add(section.sourceNodeId);
    entryCount += section.entries.length;
    if (entryCount > MAX_RESOURCES) return false;
    const orders = new Set<number>();
    for (const entry of section.entries) {
      if (
        !record(entry) ||
        !only(entry, ['id', 'name', 'order', 'value', 'evidence']) ||
        !string(entry.id) ||
        !string(entry.name, MAX_TEXT) ||
        !integer(entry.order, 1, section.entries.length) ||
        !colorValue(entry.value) ||
        !array(entry.evidence, 1_000, sourceEvidence) ||
        entry.evidence.length === 0 ||
        entryIds.has(entry.id) ||
        orders.has(entry.order)
      ) {
        return false;
      }
      entryIds.add(entry.id);
      orders.add(entry.order);
    }
  }
  return isValidSourceSectionCollectionProvenance(
    sourceLocator,
    value as unknown as SourceColorSection[]
  );
}

function roleEvidence(value: unknown): boolean {
  return (
    record(value) &&
    only(value, [
      'role',
      'status',
      'confidence',
      'evidence',
      'reviewerDisposition',
      'protectedAnchor',
    ]) &&
    string(value.role) &&
    oneOf(value.status, ['verified', 'inferred', 'unresolved'] as const) &&
    (value.confidence === null || number(value.confidence, 0, 1)) &&
    array(value.evidence, 1_000, record) &&
    oneOf(value.reviewerDisposition, ['confirmed', 'rejected', 'pending'] as const) &&
    (value.protectedAnchor === undefined || typeof value.protectedAnchor === 'boolean')
  );
}

function sourceToken(value: unknown): boolean {
  if (!record(value)) return false;
  if (
    !only(value, [
      'id',
      'name',
      'path',
      'description',
      'sourceRepresentation',
      'observedUsageCount',
      'observedUsageRank',
      'modeGroupId',
      'valuesByMode',
      'aliasTargetsByMode',
      'aliasTargetId',
      'evidence',
      'roleEvidence',
      'scalePosition',
    ])
  ) {
    return false;
  }
  const representationValid =
    value.sourceRepresentation === undefined ||
    oneOf(value.sourceRepresentation, [
      'authored-token',
      'observed-literal',
      'structured-source',
    ] as const);
  const observedEntries = record(value.valuesByMode) ? Object.entries(value.valuesByMode) : [];
  const observedValues = observedEntries.map(entry => entry[1]);
  const observedIdentity =
    observedEntries.length === 1 && colorValue(observedEntries[0]?.[1])
      ? observedLiteralCandidateIdentity(
          observedEntries[0][0],
          observedEntries[0][1] as SourceColorValue
        )
      : null;
  const observedLiteralValid =
    value.sourceRepresentation === 'observed-literal'
      ? typeof value.id === 'string' &&
        observedIdentity !== null &&
        value.id === observedIdentity.id &&
        Array.isArray(value.path) &&
        value.path.length === observedIdentity.path.length &&
        value.path.every((segment, index) => segment === observedIdentity.path[index]) &&
        integer(value.observedUsageCount, 1) &&
        integer(value.observedUsageRank, 1) &&
        observedValues.length === 1 &&
        observedValues.every(
          entry =>
            record(entry) &&
            entry.colorSpace === 'srgb' &&
            entry.alpha === 1 &&
            typeof entry.hex === 'string' &&
            HEX.test(entry.hex)
        ) &&
        Array.isArray(value.roleEvidence) &&
        value.roleEvidence.length === 0 &&
        value.modeGroupId === OBSERVED_LITERAL_MODE_GROUP_ID &&
        value.scalePosition === undefined &&
        value.aliasTargetId === undefined &&
        value.aliasTargetsByMode === undefined
      : value.observedUsageCount === undefined && value.observedUsageRank === undefined;
  const structuredSourceValid =
    value.sourceRepresentation === 'structured-source'
      ? typeof value.id === 'string' &&
        value.id.startsWith('structured-source:') &&
        observedValues.length === 1 &&
        observedValues.every(
          entry =>
            record(entry) &&
            entry.colorSpace === 'srgb' &&
            entry.alpha === 1 &&
            typeof entry.hex === 'string' &&
            HEX.test(entry.hex)
        ) &&
        Array.isArray(value.roleEvidence) &&
        value.roleEvidence.length === 0 &&
        value.modeGroupId === STRUCTURED_SOURCE_MODE_GROUP_ID &&
        value.scalePosition === undefined &&
        value.aliasTargetId === undefined &&
        value.aliasTargetsByMode === undefined
      : true;
  return (
    representationValid &&
    observedLiteralValid &&
    structuredSourceValid &&
    string(value.id) &&
    string(value.name) &&
    strings(value.path, 64) &&
    optionalString(value.description, MAX_EVIDENCE_TEXT) &&
    (value.observedUsageCount === undefined || integer(value.observedUsageCount, 1)) &&
    (value.observedUsageRank === undefined || integer(value.observedUsageRank, 1)) &&
    optionalString(value.modeGroupId) &&
    stringRecord(value.valuesByMode, MAX_MODES, colorValue) &&
    (value.aliasTargetsByMode === undefined ||
      stringRecord(value.aliasTargetsByMode, MAX_MODES, entry => string(entry))) &&
    optionalString(value.aliasTargetId) &&
    array(value.evidence, 1_000, sourceEvidence) &&
    array(value.roleEvidence, 128, roleEvidence) &&
    (value.scalePosition === undefined ||
      (record(value.scalePosition) &&
        only(value.scalePosition, ['scaleId', 'step']) &&
        string(value.scalePosition.scaleId) &&
        integer(value.scalePosition.step, 1)))
  );
}

function sourceTokens(value: unknown): boolean {
  if (!array(value, MAX_RESOURCES, sourceToken)) return false;
  const tokens = value as UnknownRecord[];
  const observed = tokens.filter(token => token.sourceRepresentation === 'observed-literal');
  if (observed.length === 0) return true;
  if (observed.length !== tokens.length) return false;
  const ranks = new Set(observed.map(token => token.observedUsageRank as number));
  return (
    ranks.size === observed.length &&
    Array.from({ length: observed.length }, (_, index) => index + 1).every(rank => ranks.has(rank))
  );
}

function sourceUsageVariantKey(mode: string, value: UnknownRecord): string {
  return JSON.stringify([
    mode,
    value.colorSpace,
    typeof value.hex === 'string' ? value.hex.toLowerCase() : null,
    value.components,
    value.alpha,
  ]);
}

function sourceEvidenceKeys(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(sourceEvidence)) return null;
  return value
    .map(item => {
      const locator = item as UnknownRecord;
      return JSON.stringify([locator.kind, locator.locator, locator.detail ?? null]);
    })
    .sort(compareText);
}

function sourceEvidenceMatches(first: unknown, second: unknown): boolean {
  const firstKeys = sourceEvidenceKeys(first);
  const secondKeys = sourceEvidenceKeys(second);
  return Boolean(
    firstKeys &&
    secondKeys &&
    firstKeys.length === secondKeys.length &&
    firstKeys.every((key, index) => key === secondKeys[index])
  );
}

function boundedObservedSourceEvidence(value: unknown): UnknownRecord[] | null {
  if (!Array.isArray(value) || !value.every(sourceEvidence)) return null;
  const byLocatorAndDetail = new Map<string, UnknownRecord>();
  for (const entry of value) {
    const item = entry as UnknownRecord;
    const key = JSON.stringify([item.locator, item.detail ?? '']);
    const current = byLocatorAndDetail.get(key);
    if (!current || compareText(item.kind as string, current.kind as string) < 0) {
      byLocatorAndDetail.set(key, item);
    }
  }
  return [...byLocatorAndDetail.values()]
    .sort((left, right) => {
      const byLocator = compareText(left.locator as string, right.locator as string);
      if (byLocator !== 0) return byLocator;
      const byDetail = compareText(
        (left.detail as string | undefined) ?? '',
        (right.detail as string | undefined) ?? ''
      );
      if (byDetail !== 0) return byDetail;
      return compareText(left.kind as string, right.kind as string);
    })
    .slice(0, OBSERVED_LITERAL_EVIDENCE_LIMIT);
}

function observedTokenRankCompare(first: UnknownRecord, second: UnknownRecord): number {
  const byCount = (second.observedUsageCount as number) - (first.observedUsageCount as number);
  if (byCount !== 0) return byCount;
  const [firstEntry] = Object.entries(first.valuesByMode as UnknownRecord);
  const [secondEntry] = Object.entries(second.valuesByMode as UnknownRecord);
  const firstValue = firstEntry?.[1] as UnknownRecord;
  const secondValue = secondEntry?.[1] as UnknownRecord;
  const byHex = compareText(
    (firstValue.hex as string).toLowerCase(),
    (secondValue.hex as string).toLowerCase()
  );
  if (byHex !== 0) return byHex;
  const byVariant = compareText(
    `${firstEntry?.[0] ?? ''}:${(firstValue.components as number[]).join(',')}`,
    `${secondEntry?.[0] ?? ''}:${(secondValue.components as number[]).join(',')}`
  );
  if (byVariant !== 0) return byVariant;
  return compareText(first.id as string, second.id as string);
}

function observedSnapshotContract(snapshot: UnknownRecord): boolean {
  const tokens = snapshot.tokens as UnknownRecord[];
  const observed = tokens.filter(token => token.sourceRepresentation === 'observed-literal');
  if (observed.length === 0) return true;
  const resourceScope = snapshot.resourceScope as UnknownRecord;
  if (
    snapshot.sourceKind !== 'figma-document' ||
    resourceScope.kind !== 'all-local-resources' ||
    resourceScope.localVariableCount !== 0 ||
    resourceScope.localStyleCount !== 0 ||
    observed.length !== tokens.length
  ) {
    return false;
  }
  const eligibleUsageByVariant = new Map<string, { count: number; evidence: UnknownRecord[] }>();
  const supportedUsage = snapshot.supportedUsage as UnknownRecord[];
  for (const usage of supportedUsage) {
    const value = usage.value as UnknownRecord;
    if (value.colorSpace !== 'srgb' || value.alpha !== 1 || typeof value.hex !== 'string') {
      continue;
    }
    const key = sourceUsageVariantKey(usage.mode as string, value);
    const usageEvidence = boundedObservedSourceEvidence(usage.evidence);
    if (!usageEvidence) return false;
    const current = eligibleUsageByVariant.get(key);
    if (current) {
      const combinedEvidence = boundedObservedSourceEvidence([
        ...current.evidence,
        ...usageEvidence,
      ]);
      if (!combinedEvidence) return false;
      current.count += usage.count as number;
      current.evidence = combinedEvidence;
    } else {
      eligibleUsageByVariant.set(key, {
        count: usage.count as number,
        evidence: usageEvidence,
      });
    }
  }
  if (eligibleUsageByVariant.size !== observed.length) return false;
  const matchedVariants = new Set<string>();
  for (const token of observed) {
    const [entry] = Object.entries(token.valuesByMode as UnknownRecord);
    if (!entry) return false;
    const [mode, value] = entry as [string, UnknownRecord];
    const variantKey = sourceUsageVariantKey(mode, value);
    const usage = eligibleUsageByVariant.get(variantKey);
    if (
      !usage ||
      matchedVariants.has(variantKey) ||
      token.observedUsageCount !== usage.count ||
      !sourceEvidenceMatches(token.evidence, usage.evidence)
    ) {
      return false;
    }
    matchedVariants.add(variantKey);
  }
  if (matchedVariants.size !== eligibleUsageByVariant.size) return false;
  return [...observed]
    .sort(observedTokenRankCompare)
    .every((token, index) => token.observedUsageRank === index + 1);
}

function structuredSourceSnapshotContract(snapshot: UnknownRecord): boolean {
  const tokens = snapshot.tokens as UnknownRecord[];
  const structured = tokens.filter(token => token.sourceRepresentation === 'structured-source');
  if (structured.length === 0) return true;
  if (snapshot.sourceKind !== 'figma-document' || !Array.isArray(snapshot.sourceSections)) {
    return false;
  }
  const sourceHexes = new Set<string>();
  for (const section of snapshot.sourceSections as UnknownRecord[]) {
    for (const entry of section.entries as UnknownRecord[]) {
      const value = entry.value as UnknownRecord;
      if (value.colorSpace === 'srgb' && value.alpha === 1 && typeof value.hex === 'string') {
        sourceHexes.add(value.hex.toLowerCase());
      }
    }
  }
  return structured.every(token => {
    const [value] = Object.values(token.valuesByMode as UnknownRecord) as UnknownRecord[];
    return typeof value?.hex === 'string' && sourceHexes.has(value.hex.toLowerCase());
  });
}

function colorReference(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['tokenId', 'alpha']) &&
    string(value.tokenId) &&
    (value.alpha === undefined || number(value.alpha, 0, 1))
  );
}

function pairDeclaration(value: unknown): boolean {
  return (
    record(value) &&
    only(value, [
      'id',
      'foreground',
      'background',
      'underlayHex',
      'mode',
      'useCase',
      'category',
      'requiredLevel',
      'textSizePt',
      'textWeight',
    ]) &&
    string(value.id) &&
    colorReference(value.foreground) &&
    colorReference(value.background) &&
    (value.underlayHex === undefined ||
      (typeof value.underlayHex === 'string' && HEX.test(value.underlayHex))) &&
    string(value.mode) &&
    string(value.useCase, MAX_TEXT) &&
    oneOf(value.category, ['normal-text', 'large-text', 'non-text'] as const) &&
    oneOf(value.requiredLevel, ['AA', 'AAA'] as const) &&
    (value.textSizePt === undefined || number(value.textSizePt, 0, 10_000)) &&
    (value.textWeight === undefined || integer(value.textWeight, 1, 1_000))
  );
}

function sourceSnapshot(value: unknown): value is UnknownRecord {
  if (
    !record(value) ||
    !(
      only(value, [
        'schemaVersion',
        'sourceKind',
        'sourceLocator',
        'authorization',
        'documentProfile',
        'resourceScope',
        'usageScope',
        'capturedAt',
        'modes',
        'tokens',
        'sourceSections',
        'supportedUsage',
        'unsupportedUsage',
        'declaredPairs',
        'sourceHash',
      ]) &&
      value.schemaVersion === '1.0.0' &&
      hash(value.sourceHash) &&
      oneOf(value.sourceKind, [
        'figma-document',
        'dtcg-tokens',
        'teul-json',
        'guideline-draft',
      ] as const) &&
      string(value.sourceLocator, MAX_TEXT) &&
      record(value.authorization) &&
      only(value.authorization, ['status', 'rightsNote', 'receiptLocator']) &&
      oneOf(value.authorization.status, [
        'user-authorized',
        'public-reference',
        'unknown',
      ] as const) &&
      optionalString(value.authorization.rightsNote, MAX_TEXT) &&
      optionalString(value.authorization.receiptLocator, MAX_TEXT) &&
      oneOf(value.documentProfile, ['srgb', 'display-p3', 'legacy', 'unknown'] as const) &&
      record(value.resourceScope) &&
      only(value.resourceScope, ['kind', 'localVariableCount', 'localStyleCount']) &&
      oneOf(value.resourceScope.kind, ['all-local-resources', 'structured-input'] as const) &&
      integer(value.resourceScope.localVariableCount, 0, MAX_RESOURCES) &&
      integer(value.resourceScope.localStyleCount, 0, MAX_RESOURCES) &&
      oneOf(value.usageScope, [
        'selection',
        'current-page',
        'whole-file',
        'not-applicable',
      ] as const) &&
      string(value.capturedAt, 128) &&
      strings(value.modes, MAX_MODES, true) &&
      sourceTokens(value.tokens) &&
      sourceSections(value.sourceSections, value.sourceLocator as string) &&
      array(value.supportedUsage, MAX_USAGE, sourceUsage) &&
      array(
        value.unsupportedUsage,
        MAX_USAGE,
        item =>
          record(item) &&
          only(item, ['id', 'reason', 'count', 'detail', 'evidence']) &&
          string(item.id) &&
          oneOf(item.reason, [
            'gradient',
            'image',
            'video',
            'mixed-paint',
            'blend-mode',
            'unknown-background',
            'transparency',
            'unsupported-color-space',
            'unresolved-alias',
            'other',
          ] as const) &&
          integer(item.count, 1) &&
          string(item.detail, MAX_EVIDENCE_TEXT) &&
          array(item.evidence, 1_000, sourceEvidence)
      ) &&
      array(value.declaredPairs, MAX_ITEMS, pairDeclaration)
    )
  ) {
    return false;
  }
  if (
    Array.isArray(value.sourceSections) &&
    value.sourceSections.length > 0 &&
    (value.sourceKind !== 'figma-document' ||
      (value.authorization as UnknownRecord).status !== 'user-authorized')
  ) {
    return false;
  }
  return observedSnapshotContract(value) && structuredSourceSnapshotContract(value);
}

function pairEndpoint(value: unknown, tested: boolean): boolean {
  if (
    !record(value) ||
    !only(value, [
      'sourceHex',
      'sourceComponents',
      'alpha',
      'compositedComponents',
      'compositedHex',
    ]) ||
    !number(value.alpha, 0, 1)
  ) {
    return false;
  }
  const sourceHexValid = typeof value.sourceHex === 'string' && HEX.test(value.sourceHex);
  const sourceComponentsValid = normalizedComponents(value.sourceComponents);
  const compositeHexValid =
    typeof value.compositedHex === 'string' && HEX.test(value.compositedHex);
  const compositeComponentsValid = normalizedComponents(value.compositedComponents);
  if (
    tested &&
    (!sourceHexValid || !sourceComponentsValid || !compositeHexValid || !compositeComponentsValid)
  ) {
    return false;
  }
  if (value.sourceHex !== undefined && !sourceHexValid) return false;
  if (value.sourceComponents !== undefined && !sourceComponentsValid) return false;
  if (value.compositedHex !== undefined && !compositeHexValid) return false;
  if (value.compositedComponents !== undefined && !compositeComponentsValid) return false;
  if (
    sourceHexValid &&
    sourceComponentsValid &&
    !componentsMatchHex(
      value.sourceComponents as [number, number, number],
      value.sourceHex as string
    )
  ) {
    return false;
  }
  return !(
    compositeHexValid &&
    compositeComponentsValid &&
    !componentsMatchHex(
      value.compositedComponents as [number, number, number],
      value.compositedHex as string
    )
  );
}

function pairEvidence(value: unknown): boolean {
  return (
    record(value) &&
    only(value, [
      'id',
      'status',
      'foreground',
      'background',
      'underlayHex',
      'mode',
      'useCase',
      'category',
      'requiredLevel',
      'textSizePt',
      'textWeight',
      'method',
      'ratio',
      'threshold',
      'pass',
      'unsupportedReason',
    ]) &&
    string(value.id) &&
    oneOf(value.status, ['tested', 'unsupported'] as const) &&
    pairEndpoint(value.foreground, value.status === 'tested') &&
    pairEndpoint(value.background, value.status === 'tested') &&
    string(value.mode) &&
    string(value.useCase, MAX_TEXT) &&
    oneOf(value.category, ['normal-text', 'large-text', 'non-text'] as const) &&
    oneOf(value.requiredLevel, ['AA', 'AAA'] as const) &&
    (value.underlayHex === undefined ||
      (typeof value.underlayHex === 'string' && HEX.test(value.underlayHex))) &&
    (value.textSizePt === undefined || number(value.textSizePt, 0, 10_000)) &&
    (value.textWeight === undefined || integer(value.textWeight, 1, 1_000)) &&
    value.method === 'WCAG 2.2 sRGB contrast ratio' &&
    (value.status === 'tested'
      ? number(value.ratio, 1, 21) &&
        number(value.threshold, 0, 21) &&
        typeof value.pass === 'boolean'
      : string(value.unsupportedReason, MAX_TEXT))
  );
}

function moduleCoverage(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['module', 'coveredRoles', 'missingRoles', 'status']) &&
    oneOf(value.module, MODULES) &&
    strings(value.coveredRoles, MAX_ITEMS) &&
    strings(value.missingRoles, MAX_ITEMS) &&
    oneOf(value.status, ['covered', 'partial', 'unknown'] as const)
  );
}

function colorAudit(value: unknown, sourceHash: string): value is UnknownRecord {
  return (
    record(value) &&
    only(value, [
      'schemaVersion',
      'engineVersion',
      'diagnosticPolicyVersion',
      'sourceHash',
      'diagnostics',
      'moduleCoverage',
      'declaredPairTests',
      'unresolvedQuestions',
      'auditHash',
    ]) &&
    value.schemaVersion === '1.0.0' &&
    value.engineVersion === '1.0.0' &&
    value.diagnosticPolicyVersion === 'teul-color-diagnostics-v1' &&
    value.sourceHash === sourceHash &&
    hash(value.auditHash) &&
    array(
      value.diagnostics,
      MAX_ITEMS,
      entry =>
        record(entry) &&
        only(entry, [
          'id',
          'code',
          'severity',
          'classification',
          'message',
          'tokenIds',
          'mode',
          'evidence',
        ]) &&
        string(entry.id) &&
        string(entry.code) &&
        oneOf(entry.severity, ['info', 'warning', 'blocking'] as const) &&
        oneOf(entry.classification, [
          'observation',
          'potential-gap',
          'confirmed-defect',
          'unsupported',
        ] as const) &&
        string(entry.message, MAX_TEXT) &&
        strings(entry.tokenIds, 128, true) &&
        optionalString(entry.mode) &&
        array(entry.evidence, 1_000, sourceEvidence)
    ) &&
    array(value.moduleCoverage, MODULES.length, moduleCoverage) &&
    array(value.declaredPairTests, MAX_ITEMS, pairEvidence) &&
    strings(value.unresolvedQuestions, MAX_ITEMS)
  );
}

function blocker(value: unknown): boolean {
  return (
    record(value) &&
    string(value.code) &&
    string(value.message, MAX_TEXT) &&
    strings(value.sourceTokenIds, 32) &&
    strings(value.alternatives, 128)
  );
}

function provenance(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.kind === 'source-preserved') {
    return (
      strings(value.sourceTokenIds, 1) &&
      value.sourceTokenIds.length === 1 &&
      string(value.sourceTokenId) &&
      value.sourceTokenIds[0] === value.sourceTokenId &&
      string(value.sourceMode) &&
      typeof value.sourceHex === 'string' &&
      HEX.test(value.sourceHex) &&
      ((value.sourceComponents === undefined && value.sourceAlpha === undefined) ||
        (normalizedComponents(value.sourceComponents) && number(value.sourceAlpha, 0, 1)))
    );
  }
  if (value.kind === 'teul-harmony-generated') {
    return (
      value.policyVersion === 'teul-secondary-strategy-v1' &&
      value.scaleAlgorithmVersion === 'Teul OKLCH v3' &&
      value.gamutMapping === 'CSS Color 4 Local MINDE' &&
      string(value.sourceTokenId) &&
      string(value.sourceMode) &&
      typeof value.sourceHex === 'string' &&
      HEX.test(value.sourceHex) &&
      oneOf(value.direction, ['close-harmony', 'balanced-contrast', 'wide-spectrum'] as const) &&
      integer(value.familyIndex, 1, 2) &&
      number(value.hueOffsetDegrees, -360, 360) &&
      typeof value.seedHex === 'string' &&
      HEX.test(value.seedHex) &&
      oneOf(value.mode, ['light', 'dark'] as const) &&
      integer(value.step, 1, 12) &&
      typeof value.gamutMapped === 'boolean' &&
      oklchReceipt(value.requestedOklch) &&
      oklchReceipt(value.mappedOklch)
    );
  }
  return oneOf(value.kind, ['exact-radix', 'teul-generated'] as const);
}

function builderEvidence(value: unknown): boolean {
  return (
    record(value) &&
    value.policyVersion === 'teul-secondary-strategy-v1' &&
    hash(value.strategySetHash) &&
    hash(value.briefHash) &&
    oneOf(value.candidateId, ['close-harmony', 'balanced-contrast', 'wide-spectrum'] as const) &&
    hash(value.candidateHash) &&
    hash(value.modelHash) &&
    record(value.primary) &&
    string(value.primary.tokenId) &&
    string(value.primary.name) &&
    string(value.primary.mode) &&
    typeof value.primary.hex === 'string' &&
    HEX.test(value.primary.hex) &&
    record(value.visualizationSettings)
  );
}

function proposedToken(value: unknown): boolean {
  if (
    !record(value) ||
    !(
      string(value.id) &&
      string(value.name) &&
      strings(value.path, 64) &&
      oneOf(value.namespace, MODULES) &&
      stringRecord(
        value.valuesByMode,
        MAX_MODES,
        entry => typeof entry === 'string' && HEX.test(entry),
        true
      ) &&
      stringRecord(value.provenanceByMode, MAX_MODES, provenance, true) &&
      (value.exactSourceValuesByMode === undefined ||
        stringRecord(
          value.exactSourceValuesByMode,
          MAX_MODES,
          entry => colorValue(entry) && (entry as UnknownRecord).colorSpace === 'srgb'
        )) &&
      (value.sourceAliasTargetsByMode === undefined ||
        stringRecord(value.sourceAliasTargetsByMode, MAX_MODES, target => string(target))) &&
      strings(value.sourceRelationships, 32) &&
      typeof value.accessibilityConstrained === 'boolean'
    )
  ) {
    return false;
  }
  const modes = Object.keys(value.valuesByMode as UnknownRecord);
  const exactValues = (value.exactSourceValuesByMode ?? {}) as UnknownRecord;
  const aliasTargets = (value.sourceAliasTargetsByMode ?? {}) as UnknownRecord;
  if (
    ![
      ...Object.keys((value.exactSourceValuesByMode ?? {}) as UnknownRecord),
      ...Object.keys((value.sourceAliasTargetsByMode ?? {}) as UnknownRecord),
    ].every(mode => modes.includes(mode))
  ) {
    return false;
  }
  const provenances = value.provenanceByMode as UnknownRecord;
  for (const [mode, exactUnknown] of Object.entries(exactValues)) {
    const exact = exactUnknown as UnknownRecord;
    const item = provenances[mode];
    if (
      !record(exact) ||
      !record(item) ||
      item.kind !== 'source-preserved' ||
      typeof exact.hex !== 'string' ||
      typeof item.sourceHex !== 'string' ||
      exact.hex.toLowerCase() !== item.sourceHex.toLowerCase() ||
      (item.sourceComponents !== undefined &&
        !sameDeterministicContent(item.sourceComponents, exact.components)) ||
      (item.sourceAlpha !== undefined && item.sourceAlpha !== exact.alpha)
    ) {
      return false;
    }
  }
  return Object.keys(aliasTargets).every(mode => exactValues[mode] !== undefined);
}

function proposalModule(value: unknown): boolean {
  return (
    record(value) &&
    oneOf(value.namespace, MODULES) &&
    array(value.tokens, MAX_ITEMS, proposedToken) &&
    array(
      value.aliases,
      MAX_ITEMS,
      alias =>
        record(alias) && string(alias.id) && string(alias.role) && string(alias.targetTokenId)
    ) &&
    array(value.pairEvidence, MAX_ITEMS, pairEvidence) &&
    strings(value.warnings, 128, false, MAX_EVIDENCE_TEXT)
  );
}

function exactCandidate(value: unknown): boolean {
  return (
    record(value) &&
    string(value.family) &&
    array(
      value.anchorMatches,
      4,
      match =>
        record(match) &&
        string(match.sourceTokenId) &&
        string(match.family) &&
        string(match.packageVersion, 128) &&
        number(match.deltaEOK, 0, 10)
    ) &&
    number(value.maximumDeltaEOK, 0, 10) &&
    number(value.weightedMeanDeltaEOK, 0, 10) &&
    integer(value.unintendedFamilyCollisions, 0, MAX_ITEMS)
  );
}

function proposal(value: unknown, sourceHash: string): value is UnknownRecord {
  return (
    record(value) &&
    only(value, [
      'schemaVersion',
      'engineVersion',
      'strategy',
      'strategyVersion',
      'status',
      'sourceHash',
      'lockedAnchorTokenIds',
      'exactCandidates',
      'generatedScales',
      'modules',
      'moduleCoverage',
      'pairEvidence',
      'unresolvedBlockers',
      'warnings',
      'builderEvidence',
      'proposalHash',
    ]) &&
    value.schemaVersion === '1.0.0' &&
    oneOf(value.strategy, STRATEGIES) &&
    oneOf(value.status, CANDIDATE_STATUSES) &&
    value.sourceHash === sourceHash &&
    strings(value.lockedAnchorTokenIds, 4, true) &&
    array(value.exactCandidates, 256, exactCandidate) &&
    array(
      value.generatedScales,
      4,
      entry => record(entry) && string(entry.id) && record(entry.modes)
    ) &&
    array(value.modules, 16, proposalModule) &&
    array(value.moduleCoverage, MODULES.length, moduleCoverage) &&
    array(value.pairEvidence, MAX_ITEMS, pairEvidence) &&
    array(value.unresolvedBlockers, 128, blocker) &&
    strings(value.warnings, MAX_ITEMS, false, MAX_EVIDENCE_TEXT) &&
    (value.builderEvidence === undefined || builderEvidence(value.builderEvidence)) &&
    hash(value.proposalHash)
  );
}

function proposalBundle(value: unknown, sourceHash: string): value is UnknownRecord {
  if (!record(value)) return false;
  if (value.status === 'no-solution') {
    return (
      only(value, ['status', 'strategy', 'sourceHash', 'blockers']) &&
      oneOf(value.strategy, STRATEGIES) &&
      value.sourceHash === sourceHash &&
      array(value.blockers, 128, blocker) &&
      value.blockers.length > 0
    );
  }
  return (
    only(value, ['status', 'proposal']) &&
    oneOf(value.status, CANDIDATE_STATUSES) &&
    proposal(value.proposal, sourceHash) &&
    value.proposal.status === value.status
  );
}

function failure(value: UnknownRecord, extra: readonly string[] = []): boolean {
  return (
    only(value, ['type', 'requestId', 'success', 'error', ...extra]) &&
    value.success === false &&
    string(value.error, MAX_TEXT)
  );
}

function validateProgress(message: UnknownRecord): boolean {
  return (
    only(message, ['type', 'requestId', 'phase', 'completed', 'total', 'pageName', 'message']) &&
    oneOf(message.phase, ['resources', 'usage', 'libraries', 'complete'] as const) &&
    integer(message.completed) &&
    integer(message.total) &&
    message.completed <= message.total &&
    optionalString(message.pageName, MAX_TEXT) &&
    string(message.message, MAX_TEXT)
  );
}

function validateAuditResult(message: UnknownRecord): boolean {
  if (message.success === false) {
    return (
      failure(message, ['cancelled', 'partial']) &&
      typeof message.cancelled === 'boolean' &&
      message.partial === false
    );
  }
  if (
    message.success !== true ||
    !only(message, [
      'type',
      'requestId',
      'success',
      'cancelled',
      'partial',
      'scannedNodeCount',
      'snapshot',
      'audit',
      'enabledLibraryDescriptors',
      'libraryBoundaryNote',
    ]) ||
    typeof message.cancelled !== 'boolean' ||
    typeof message.partial !== 'boolean' ||
    !integer(message.scannedNodeCount) ||
    !sourceSnapshot(message.snapshot)
  ) {
    return false;
  }
  return (
    colorAudit(message.audit, message.snapshot.sourceHash as string) &&
    array(
      message.enabledLibraryDescriptors,
      1_000,
      descriptor =>
        record(descriptor) &&
        string(descriptor.collectionKey) &&
        string(descriptor.collectionName) &&
        string(descriptor.libraryName) &&
        array(descriptor.variables, MAX_RESOURCES, record)
    ) &&
    string(message.libraryBoundaryNote, MAX_TEXT)
  );
}

function validateDeclaredPairResult(message: UnknownRecord): boolean {
  if (message.success === false) return failure(message);
  return (
    message.success === true &&
    only(message, [
      'type',
      'requestId',
      'success',
      'previousSourceHash',
      'sourceHash',
      'snapshot',
      'audit',
    ]) &&
    hash(message.previousSourceHash) &&
    hash(message.sourceHash) &&
    sourceSnapshot(message.snapshot) &&
    message.snapshot.sourceHash === message.sourceHash &&
    colorAudit(message.audit, message.sourceHash)
  );
}

function validateProposalReview(message: UnknownRecord): boolean {
  if (message.success === false) return failure(message);
  if (
    message.success !== true ||
    !only(message, [
      'type',
      'requestId',
      'success',
      'sourceHash',
      'bundle',
      'reviewHash',
      'confirmedAnchorTokenIds',
      'intendedSurfaces',
    ]) ||
    !hash(message.sourceHash) ||
    !proposalBundle(message.bundle, message.sourceHash) ||
    !strings(message.confirmedAnchorTokenIds, 4, true) ||
    !strings(message.intendedSurfaces, COLOR_SYSTEM_INTENDED_SURFACES.length, true) ||
    message.intendedSurfaces.length === 0 ||
    !message.intendedSurfaces.every(surface => oneOf(surface, COLOR_SYSTEM_INTENDED_SURFACES))
  ) {
    return false;
  }
  if (message.bundle.status === 'suitable-candidate') {
    if (message.reviewHash !== undefined && !hash(message.reviewHash)) return false;
  } else if (message.reviewHash !== undefined) return false;
  if (message.bundle.status !== 'no-solution') {
    const locked = (message.bundle.proposal as UnknownRecord).lockedAnchorTokenIds as string[];
    const confirmed = message.confirmedAnchorTokenIds as string[];
    if (locked.length !== confirmed.length || !locked.every(id => confirmed.includes(id))) {
      return false;
    }
  }
  return true;
}

function validateConfirmation(message: UnknownRecord): boolean {
  if (message.success === false) return failure(message);
  return (
    message.success === true &&
    only(message, [
      'type',
      'requestId',
      'success',
      'sourceHash',
      'proposalHash',
      'reviewHash',
      'approvalHash',
    ]) &&
    hash(message.sourceHash) &&
    hash(message.proposalHash) &&
    hash(message.reviewHash) &&
    hash(message.approvalHash) &&
    message.reviewHash !== message.approvalHash
  );
}

function strategyPrimary(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['tokenId', 'name', 'mode', 'hex']) &&
    string(value.tokenId) &&
    string(value.name, MAX_TEXT) &&
    string(value.mode) &&
    typeof value.hex === 'string' &&
    HEX.test(value.hex) &&
    value.hex === value.hex.toLowerCase()
  );
}

function strategyVisualizationSettings(value: unknown): value is UnknownRecord {
  const normalizedBoundary =
    record(value) && typeof value.boundaryHex === 'string'
      ? value.boundaryHex.toLowerCase()
      : undefined;
  const boundaryIsBlackOrWhite =
    normalizedBoundary === '#000000' || normalizedBoundary === '#ffffff';
  return (
    record(value) &&
    only(value, [
      'mode',
      'surfaceHex',
      'boundaryHex',
      'chartType',
      'categoryCount',
      'nonColorCue',
      'markType',
      'adjacency',
      'divergingMidpoint',
      'sequentialCount',
      'divergingCount',
    ]) &&
    oneOf(value.mode, ['light', 'dark'] as const) &&
    typeof value.surfaceHex === 'string' &&
    HEX.test(value.surfaceHex) &&
    value.surfaceHex === value.surfaceHex.toLowerCase() &&
    (value.boundaryHex === undefined ||
      (typeof value.boundaryHex === 'string' &&
        HEX.test(value.boundaryHex) &&
        value.boundaryHex === value.boundaryHex.toLowerCase())) &&
    string(value.chartType) &&
    integer(value.categoryCount, 2, 8) &&
    string(value.nonColorCue, MAX_TEXT) &&
    oneOf(value.markType, ['bar', 'line', 'area', 'point', 'region'] as const) &&
    oneOf(value.adjacency, ['separated-marks', 'touching-regions'] as const) &&
    (value.adjacency !== 'separated-marks' || value.boundaryHex === undefined) &&
    (value.adjacency !== 'touching-regions' || boundaryIsBlackOrWhite) &&
    string(value.divergingMidpoint, MAX_TEXT) &&
    integer(value.sequentialCount, 3, 9) &&
    integer(value.divergingCount, 3, 9) &&
    (value.divergingCount as number) % 2 === 1
  );
}

function sameDeterministicContent(left: unknown, right: unknown): boolean {
  try {
    return deterministicContentHash(left) === deterministicContentHash(right);
  } catch {
    return false;
  }
}

function strategyScaleProvenance(
  value: unknown,
  expected: {
    primary: UnknownRecord;
    direction: (typeof STRATEGY_DIRECTIONS)[number];
    familyIndex: 1 | 2;
    hueOffsetDegrees: number;
    seedHex: string;
    mode: 'light' | 'dark';
    step: number;
    gamutMapped: boolean;
    requestedOklch: unknown;
    mappedOklch: unknown;
  }
): boolean {
  return (
    record(value) &&
    only(value, [
      'kind',
      'policyVersion',
      'scaleAlgorithmVersion',
      'gamutMapping',
      'sourceTokenId',
      'sourceMode',
      'sourceHex',
      'direction',
      'familyIndex',
      'hueOffsetDegrees',
      'seedHex',
      'mode',
      'step',
      'gamutMapped',
      'requestedOklch',
      'mappedOklch',
    ]) &&
    value.kind === 'teul-harmony-generated' &&
    value.policyVersion === 'teul-secondary-strategy-v1' &&
    value.scaleAlgorithmVersion === 'Teul OKLCH v3' &&
    value.gamutMapping === 'CSS Color 4 Local MINDE' &&
    value.sourceTokenId === expected.primary.tokenId &&
    value.sourceMode === expected.primary.mode &&
    value.sourceHex === expected.primary.hex &&
    value.direction === expected.direction &&
    value.familyIndex === expected.familyIndex &&
    value.hueOffsetDegrees === expected.hueOffsetDegrees &&
    value.seedHex === expected.seedHex &&
    value.mode === expected.mode &&
    value.step === expected.step &&
    value.gamutMapped === expected.gamutMapped &&
    sameDeterministicContent(value.requestedOklch, expected.requestedOklch) &&
    sameDeterministicContent(value.mappedOklch, expected.mappedOklch) &&
    oklchReceipt(value.requestedOklch) &&
    oklchReceipt(value.mappedOklch)
  );
}

function strategyScaleMode(
  value: unknown,
  expected: {
    primary: UnknownRecord;
    direction: (typeof STRATEGY_DIRECTIONS)[number];
    familyIndex: 1 | 2;
    familyName: string;
    hueOffsetDegrees: number;
    seedHex: string;
    mode: 'light' | 'dark';
  }
): boolean {
  if (
    !record(value) ||
    !only(value, ['mode', 'steps', 'validation']) ||
    value.mode !== expected.mode ||
    !Array.isArray(value.steps) ||
    value.steps.length !== 12
  ) {
    return false;
  }
  const regenerated = generateColorScale(expected.seedHex, expected.mode, expected.familyName);
  if (!regenerated.validation.valid) return false;
  const stepsValid = value.steps.every((step, index) => {
    const regeneratedStep = regenerated.steps[index];
    return (
      record(step) &&
      only(step, ['step', 'hex', 'provenance']) &&
      step.step === index + 1 &&
      step.hex === regeneratedStep.hex &&
      strategyScaleProvenance(step.provenance, {
        primary: expected.primary,
        direction: expected.direction,
        familyIndex: expected.familyIndex,
        hueOffsetDegrees: expected.hueOffsetDegrees,
        seedHex: expected.seedHex,
        mode: expected.mode,
        step: index + 1,
        gamutMapped: regeneratedStep.gamutMapped,
        requestedOklch: regeneratedStep.requestedOklch,
        mappedOklch: regeneratedStep.mappedOklch,
      })
    );
  });
  return stepsValid && sameDeterministicContent(value.validation, regenerated.validation);
}

function strategySecondaryFamily(
  value: unknown,
  primary: UnknownRecord,
  direction: (typeof STRATEGY_DIRECTIONS)[number],
  familyIndex: 1 | 2
): value is UnknownRecord {
  if (
    !record(value) ||
    !only(value, ['id', 'name', 'familyIndex', 'hueOffsetDegrees', 'seedHex', 'modes']) ||
    value.id !== `${direction}.secondary-${familyIndex}` ||
    !string(value.name, MAX_TEXT) ||
    value.familyIndex !== familyIndex ||
    !number(value.hueOffsetDegrees, -360, 360) ||
    typeof value.seedHex !== 'string' ||
    !HEX.test(value.seedHex) ||
    value.seedHex !== value.seedHex.toLowerCase() ||
    value.seedHex === primary.hex ||
    !record(value.modes) ||
    !only(value.modes, ['light', 'dark'])
  ) {
    return false;
  }
  const modes = value.modes as UnknownRecord;
  return (['light', 'dark'] as const).every(mode =>
    strategyScaleMode(modes[mode], {
      primary,
      direction,
      familyIndex,
      familyName: value.name as string,
      hueOffsetDegrees: value.hueOffsetDegrees as number,
      seedHex: value.seedHex as string,
      mode,
    })
  );
}

function strategyPaletteColorHex(
  value: unknown,
  candidate: UnknownRecord,
  settings: UnknownRecord,
  kind: 'categorical' | 'sequential' | 'diverging',
  index: number
): string | null {
  if (!record(value) || !only(value, ['hex', 'source']) || typeof value.hex !== 'string') {
    return null;
  }
  if (!HEX.test(value.hex) || value.hex !== value.hex.toLowerCase() || !record(value.source)) {
    return null;
  }
  const source = value.source;
  const mode = settings.mode as 'light' | 'dark';
  let expectedHex: string | undefined;
  if (source.kind === 'secondary-scale') {
    if (
      !only(source, ['kind', 'familyIndex', 'mode', 'step']) ||
      !integer(source.familyIndex, 1, 2) ||
      source.mode !== mode ||
      !integer(source.step, 1, 12)
    ) {
      return null;
    }
    const familyIndex = source.familyIndex as 1 | 2;
    if (kind === 'sequential' && familyIndex !== 1) return null;
    const divergingMidpointIndex = ((settings.divergingCount as number) - 1) / 2;
    if (
      kind === 'diverging' &&
      ((index < divergingMidpointIndex && familyIndex !== 1) ||
        (index > divergingMidpointIndex && familyIndex !== 2) ||
        index === divergingMidpointIndex)
    ) {
      return null;
    }
    const family = (candidate.secondaryFamilies as UnknownRecord[])[familyIndex - 1];
    const modes = family.modes as UnknownRecord;
    const scale = modes[mode] as UnknownRecord;
    expectedHex = ((scale.steps as UnknownRecord[])[(source.step as number) - 1] as UnknownRecord)
      .hex as string;
  } else if (source.kind === 'primary-scale') {
    if (
      kind !== 'categorical' ||
      !only(source, ['kind', 'mode', 'step', 'sourceTokenId']) ||
      source.mode !== mode ||
      !integer(source.step, 1, 12) ||
      source.sourceTokenId !== (candidate.primary as UnknownRecord).tokenId
    ) {
      return null;
    }
    expectedHex = generateColorScale(
      (candidate.primary as UnknownRecord).hex as string,
      mode,
      (candidate.primary as UnknownRecord).name as string
    ).steps[(source.step as number) - 1].hex;
  } else if (source.kind === 'exact-radix-support') {
    if (
      !only(source, ['kind', 'packageVersion', 'family', 'mode', 'step']) ||
      source.packageVersion !== RADIX_COLORS_VERSION ||
      source.mode !== mode ||
      !string(source.family) ||
      !integer(source.step, 1, 12)
    ) {
      return null;
    }
    const family = source.family as string;
    if (
      (kind === 'categorical' &&
        !STRATEGY_CATEGORICAL_RADIX_FAMILIES.includes(
          family as (typeof STRATEGY_CATEGORICAL_RADIX_FAMILIES)[number]
        )) ||
      (kind === 'diverging' &&
        (index !== ((settings.divergingCount as number) - 1) / 2 || family !== 'gray')) ||
      kind === 'sequential'
    ) {
      return null;
    }
    const radixFamily = (radixColors as unknown as Record<string, UnknownRecord>)[family];
    const radixMode = radixFamily?.[mode];
    if (!record(radixMode)) return null;
    expectedHex = radixMode[String(source.step)] as string | undefined;
  } else {
    return null;
  }
  return expectedHex === value.hex ? value.hex : null;
}

function strategyVisualizationArtifact(
  value: unknown,
  candidate: UnknownRecord,
  settings: UnknownRecord,
  kind: 'categorical' | 'sequential' | 'diverging'
): boolean {
  const expectedLength =
    kind === 'categorical'
      ? (settings.categoryCount as number)
      : kind === 'sequential'
        ? (settings.sequentialCount as number)
        : (settings.divergingCount as number);
  if (
    !record(value) ||
    !only(value, ['id', 'kind', 'colors', 'evaluation']) ||
    value.id !== kind ||
    value.kind !== kind ||
    !Array.isArray(value.colors) ||
    value.colors.length !== expectedLength
  ) {
    return false;
  }
  const colors = value.colors.map((color, index) =>
    strategyPaletteColorHex(color, candidate, settings, kind, index)
  );
  if (colors.some(color => color === null)) return false;
  if (kind === 'categorical') {
    const families = new Set(
      (value.colors as UnknownRecord[]).flatMap(color => {
        const source = color.source as UnknownRecord;
        return source.kind === 'secondary-scale' ? [source.familyIndex] : [];
      })
    );
    if (!families.has(1) || !families.has(2)) return false;
  }
  const evaluation = evaluateVisualizationPalette({
    id: kind,
    kind,
    mode: settings.mode as 'light' | 'dark',
    colors: colors as string[],
    surfaceHex: settings.surfaceHex as string,
    ...(typeof settings.boundaryHex === 'string'
      ? { boundaryHex: settings.boundaryHex as string }
      : {}),
    adjacency: settings.adjacency as 'separated-marks' | 'touching-regions',
    chartType: settings.chartType as string,
    ...(kind === 'categorical' ? { categoryCount: settings.categoryCount as number } : {}),
    ...(kind === 'sequential'
      ? { orderedDirection: settings.mode === 'light' ? 'light-to-dark' : 'dark-to-light' }
      : {}),
    ...(kind === 'diverging'
      ? { midpointIndex: ((settings.divergingCount as number) - 1) / 2 }
      : {}),
    nonColorCue: settings.nonColorCue as string,
  });
  return (
    evaluation.status === 'suitable-candidate' &&
    sameDeterministicContent(value.evaluation, evaluation)
  );
}

function strategyVisualization(
  value: unknown,
  candidate: UnknownRecord,
  settings: UnknownRecord
): boolean {
  if (
    !record(value) ||
    !only(value, ['settings', 'categorical', 'sequential', 'diverging', 'searchEvidence']) ||
    !strategyVisualizationSettings(value.settings) ||
    !sameDeterministicContent(value.settings, settings) ||
    !record(value.searchEvidence) ||
    !only(value.searchEvidence, [
      'categoricalCandidateCount',
      'categoricalEvaluationCount',
      'categoricalMaximumEvaluations',
      'categoricalMaximumBeamWidth',
    ]) ||
    !integer(
      value.searchEvidence.categoricalCandidateCount,
      settings.categoryCount as number,
      18
    ) ||
    !integer(value.searchEvidence.categoricalEvaluationCount, 1, 8_192) ||
    value.searchEvidence.categoricalMaximumEvaluations !== 8_192 ||
    value.searchEvidence.categoricalMaximumBeamWidth !== 64
  ) {
    return false;
  }
  return (['categorical', 'sequential', 'diverging'] as const).every(kind =>
    strategyVisualizationArtifact(value[kind], candidate, settings, kind)
  );
}

function strategySourceReference(
  value: unknown,
  expectedSection?: 'secondary' | 'data-visualization'
): value is UnknownRecord {
  return (
    record(value) &&
    only(value, ['section', 'sectionTitle', 'sourceNodeId', 'entryId', 'name', 'order', 'hex']) &&
    (value.section === 'secondary' || value.section === 'data-visualization') &&
    (expectedSection === undefined || value.section === expectedSection) &&
    string(value.sectionTitle, MAX_TEXT) &&
    string(value.sourceNodeId, MAX_TEXT) &&
    string(value.entryId, MAX_TEXT) &&
    string(value.name, MAX_TEXT) &&
    integer(value.order, 1, MAX_RESOURCES) &&
    typeof value.hex === 'string' &&
    HEX.test(value.hex)
  );
}

function strategySourceTerritoryEvidence(value: unknown): value is UnknownRecord {
  if (
    !record(value) ||
    !only(value, [
      'status',
      'method',
      'references',
      'secondaryReferenceCount',
      'dataVisualizationReferenceCount',
      'thresholdDeltaEOK',
      'maximumNearestReferenceDeltaEOK',
      'lightnessRange',
      'chromaRange',
      'leadReference',
    ]) ||
    (value.status !== 'passed' && value.status !== 'not-assessed') ||
    (value.method !== 'ordered-source-sections' && value.method !== 'legacy-source-colors') ||
    (value.method === 'ordered-source-sections' && value.status !== 'passed') ||
    (value.method === 'legacy-source-colors' && value.status !== 'not-assessed') ||
    !Array.isArray(value.references) ||
    value.references.length < 1 ||
    value.references.length > MAX_RESOURCES ||
    !value.references.every(reference => strategySourceReference(reference)) ||
    !integer(value.secondaryReferenceCount, 0, value.references.length) ||
    !integer(value.dataVisualizationReferenceCount, 0, value.references.length) ||
    (value.secondaryReferenceCount as number) +
      (value.dataVisualizationReferenceCount as number) !==
      value.references.length ||
    value.thresholdDeltaEOK !== COLOR_SYSTEM_STRATEGY_SOURCE_TERRITORY_THRESHOLD_DELTA_E_OK ||
    !number(value.maximumNearestReferenceDeltaEOK, 0, 4) ||
    (value.status === 'passed' &&
      (value.maximumNearestReferenceDeltaEOK as number) >
        COLOR_SYSTEM_STRATEGY_SOURCE_TERRITORY_THRESHOLD_DELTA_E_OK) ||
    !Array.isArray(value.lightnessRange) ||
    value.lightnessRange.length !== 2 ||
    !value.lightnessRange.every(entry => number(entry, 0, 1)) ||
    (value.lightnessRange[0] as number) > (value.lightnessRange[1] as number) ||
    !Array.isArray(value.chromaRange) ||
    value.chromaRange.length !== 2 ||
    !value.chromaRange.every(entry => number(entry, 0, 1)) ||
    (value.chromaRange[0] as number) > (value.chromaRange[1] as number) ||
    !strategySourceReference(value.leadReference)
  ) {
    return false;
  }
  const references = value.references as UnknownRecord[];
  const secondaryCount = references.filter(reference => reference.section === 'secondary').length;
  const dataVisualizationCount = references.length - secondaryCount;
  const expectedLead =
    references.find(reference => reference.section === 'data-visualization') ?? references[0];
  return (
    value.secondaryReferenceCount === secondaryCount &&
    value.dataVisualizationReferenceCount === dataVisualizationCount &&
    sameDeterministicContent(value.leadReference, expectedLead) &&
    (['secondary', 'data-visualization'] as const).every(section => {
      const entries = references.filter(reference => reference.section === section);
      return entries.every(
        (entry, index) =>
          strategySourceReference(entry, section) &&
          (index === 0 ||
            (entries[index - 1].order as number) < (entry.order as number) ||
            ((entries[index - 1].order as number) === (entry.order as number) &&
              compareText(entries[index - 1].entryId as string, entry.entryId as string) < 0))
      );
    })
  );
}

function strategyMeasurements(value: unknown, candidate: UnknownRecord): boolean {
  if (
    !record(value) ||
    !only(value, [
      'sourceColorCount',
      'referenceColorCount',
      'generatedSeedDuplicateCount',
      'meanNearestSourceDeltaEOK',
      'maximumNearestReferenceDeltaEOK',
      'sourceTerritoryThresholdDeltaEOK',
      'meanPrimaryRelatednessDeltaEOK',
      'minimumSetSeparationDeltaEOK',
      'minimumCategoricalSeparationDeltaEOK',
      'gamutMappedStepCount',
      'gamutMappedStepRate',
      'maximumStep9ModeDeltaEOK',
      'functionalArtifactCoverage',
    ]) ||
    !integer(value.sourceColorCount, 1, MAX_RESOURCES) ||
    !integer(value.referenceColorCount, 1, MAX_RESOURCES) ||
    value.generatedSeedDuplicateCount !== 0 ||
    !number(value.meanNearestSourceDeltaEOK, 0, 4) ||
    !number(value.maximumNearestReferenceDeltaEOK, 0, 4) ||
    value.sourceTerritoryThresholdDeltaEOK !==
      COLOR_SYSTEM_STRATEGY_SOURCE_TERRITORY_THRESHOLD_DELTA_E_OK ||
    !number(value.meanPrimaryRelatednessDeltaEOK, 0, 4) ||
    !number(value.minimumSetSeparationDeltaEOK, 0, 4) ||
    !number(value.minimumCategoricalSeparationDeltaEOK, 0, 4) ||
    !integer(value.gamutMappedStepCount, 0, 48) ||
    !number(value.gamutMappedStepRate, 0, 1) ||
    !number(value.maximumStep9ModeDeltaEOK, 0, 4) ||
    value.functionalArtifactCoverage !== 1
  ) {
    return false;
  }
  const families = candidate.secondaryFamilies as UnknownRecord[];
  const gamutMappedStepCount = families.reduce((familyTotal, family) => {
    const modes = family.modes as UnknownRecord;
    return (
      familyTotal +
      (['light', 'dark'] as const).reduce((modeTotal, mode) => {
        const scale = modes[mode] as UnknownRecord;
        return (
          modeTotal +
          (scale.steps as UnknownRecord[]).filter(
            step => (step.provenance as UnknownRecord).gamutMapped === true
          ).length
        );
      }, 0)
    );
  }, 0);
  const categorical = ((candidate.visualization as UnknownRecord).categorical as UnknownRecord)
    .evaluation as UnknownRecord;
  const evidence = candidate.evidence as UnknownRecord;
  const territory = evidence.sourceTerritory as UnknownRecord;
  const territoryReferences = territory.references as UnknownRecord[];
  const separations = categorical.separationEvidence as UnknownRecord[];
  const minimumCategoricalSeparation = Number(
    Math.min(...separations.map(evidence => evidence.minimumDeltaEOK as number)).toFixed(6)
  );
  return (
    value.gamutMappedStepCount === gamutMappedStepCount &&
    value.referenceColorCount ===
      new Set(territoryReferences.map(reference => reference.hex as string)).size &&
    value.maximumNearestReferenceDeltaEOK === territory.maximumNearestReferenceDeltaEOK &&
    value.sourceTerritoryThresholdDeltaEOK === territory.thresholdDeltaEOK &&
    value.gamutMappedStepRate === Number((gamutMappedStepCount / 48).toFixed(6)) &&
    value.minimumCategoricalSeparationDeltaEOK === minimumCategoricalSeparation &&
    families.every(family => {
      const modes = family.modes as UnknownRecord;
      const light = modes.light as UnknownRecord;
      const dark = modes.dark as UnknownRecord;
      return (
        ((light.steps as UnknownRecord[])[8] as UnknownRecord).hex ===
        ((dark.steps as UnknownRecord[])[8] as UnknownRecord).hex
      );
    }) &&
    value.maximumStep9ModeDeltaEOK === 0
  );
}

function strategySearchEvidence(value: unknown, requireArtifactEvaluation: boolean): boolean {
  if (
    !record(value) ||
    !only(value, [
      'rawPoolCandidateCount',
      'rawPoolMaximumCandidates',
      'uniquePoolCandidateCount',
      'quantizationCollapseCount',
      'sourceDuplicateRejectionCount',
      'directionEligibleCandidateCount',
      'prequalifiedFamilyCount',
      'maximumPrequalifiedFamilies',
      'generatedScaleFamilyCount',
      'invalidScaleRejectionCount',
      'pairEvaluationCount',
      'pairMaximumEvaluations',
      'pairFrontierCount',
      'pairArtifactEvaluationCount',
      'pairMaximumBeamWidth',
      'visualizationEvaluationCount',
      'visualizationMaximumEvaluations',
    ]) ||
    value.rawPoolCandidateCount !== 648 ||
    value.rawPoolMaximumCandidates !== 648 ||
    !integer(value.uniquePoolCandidateCount, 0, 648) ||
    !integer(value.quantizationCollapseCount, 0, 648) ||
    !integer(value.sourceDuplicateRejectionCount, 0, 648) ||
    (value.uniquePoolCandidateCount as number) +
      (value.quantizationCollapseCount as number) +
      (value.sourceDuplicateRejectionCount as number) !==
      648 ||
    !integer(value.directionEligibleCandidateCount, 0, value.uniquePoolCandidateCount as number) ||
    !integer(
      value.prequalifiedFamilyCount,
      0,
      Math.min(64, value.directionEligibleCandidateCount as number)
    ) ||
    value.maximumPrequalifiedFamilies !== 64 ||
    !integer(value.generatedScaleFamilyCount, 0, value.prequalifiedFamilyCount as number) ||
    !integer(value.invalidScaleRejectionCount, 0, value.prequalifiedFamilyCount as number) ||
    (value.generatedScaleFamilyCount as number) + (value.invalidScaleRejectionCount as number) !==
      value.prequalifiedFamilyCount ||
    !integer(value.pairEvaluationCount, 0, 25_000) ||
    value.pairMaximumEvaluations !== 25_000 ||
    !integer(value.pairFrontierCount, 0, Math.min(32, value.pairEvaluationCount as number)) ||
    !integer(
      value.pairArtifactEvaluationCount,
      requireArtifactEvaluation ? 1 : 0,
      value.pairFrontierCount as number
    ) ||
    value.pairMaximumBeamWidth !== 32 ||
    !integer(value.visualizationEvaluationCount, 0, 8_192) ||
    value.visualizationMaximumEvaluations !== 8_192
  ) {
    return false;
  }
  return true;
}

function strategyCandidate(
  value: unknown,
  direction: (typeof STRATEGY_DIRECTIONS)[number],
  sourceHash: string,
  briefHash: string,
  primary: UnknownRecord,
  settings: UnknownRecord
): value is UnknownRecord {
  if (
    !record(value) ||
    !only(value, [
      'id',
      'direction',
      'label',
      'rationale',
      'primary',
      'secondaryFamilies',
      'visualization',
      'searchEvidence',
      'measurements',
      'evidence',
      'warnings',
      'actualSystemHash',
      'modelHash',
      'candidateHash',
    ]) ||
    value.id !== direction ||
    value.direction !== direction ||
    !string(value.label, MAX_TEXT) ||
    !string(value.rationale, MAX_TEXT) ||
    !strategyPrimary(value.primary) ||
    !sameDeterministicContent(value.primary, primary) ||
    !Array.isArray(value.secondaryFamilies) ||
    value.secondaryFamilies.length !== 2 ||
    !strategySecondaryFamily(value.secondaryFamilies[0], primary, direction, 1) ||
    !strategySecondaryFamily(value.secondaryFamilies[1], primary, direction, 2) ||
    value.secondaryFamilies[0].seedHex === value.secondaryFamilies[1].seedHex ||
    !strategySearchEvidence(value.searchEvidence, true) ||
    !record(value.evidence) ||
    !only(value.evidence, [
      'primaryPreserved',
      'validLightAndDarkScales',
      'visualizationSuitableForDeclaredContext',
      'accessibilityBoundary',
      'sourceTerritory',
    ]) ||
    value.evidence.primaryPreserved !== true ||
    value.evidence.validLightAndDarkScales !== true ||
    value.evidence.visualizationSuitableForDeclaredContext !== true ||
    !string(value.evidence.accessibilityBoundary, MAX_TEXT) ||
    !strategySourceTerritoryEvidence(value.evidence.sourceTerritory) ||
    !strings(value.warnings, 128, true, MAX_EVIDENCE_TEXT) ||
    value.warnings.length === 0 ||
    !hash(value.actualSystemHash) ||
    !hash(value.modelHash) ||
    !hash(value.candidateHash)
  ) {
    return false;
  }
  if (!strategyVisualization(value.visualization, value, settings)) return false;
  if (!strategyMeasurements(value.measurements, value)) return false;
  if (
    value.actualSystemHash !==
    colorSystemStrategyActualSystemHash(value as unknown as ColorSystemStrategyCandidate)
  ) {
    return false;
  }
  const { modelHash, candidateHash, ...candidate } = value;
  const expectedModelHash = deterministicContentHash({
    policyVersion: 'teul-secondary-strategy-v1',
    sourceHash,
    briefHash,
    candidate,
  });
  if (modelHash !== expectedModelHash) return false;
  return (
    candidateHash ===
    deterministicContentHash({
      policyVersion: 'teul-secondary-strategy-v1',
      sourceHash,
      briefHash,
      modelHash,
      preview: candidate,
    })
  );
}

function strategyRecommendation(value: unknown, candidates: readonly UnknownRecord[]): boolean {
  const candidateCount = candidates.length;
  if (
    !record(value) ||
    !only(value, ['policyVersion', 'recommendedCandidateId', 'ranking', 'statement']) ||
    value.policyVersion !== 'teul-strategy-recommendation-v1' ||
    !oneOf(value.recommendedCandidateId, STRATEGY_DIRECTIONS) ||
    !Array.isArray(value.ranking) ||
    value.ranking.length !== candidateCount ||
    !string(value.statement, MAX_TEXT)
  ) {
    return false;
  }
  const candidateById = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const seen = new Set<string>();
  const rankingValid = value.ranking.every((entry, index) => {
    if (
      !record(entry) ||
      !only(entry, [
        'candidateId',
        'sourceContinuityRank',
        'categoricalSeparationRank',
        'gamutRetentionRank',
        'setSeparationRank',
        'functionalCoverageRank',
        'ordinalRankSum',
        'aggregateRank',
        'tieBreakHash',
      ]) ||
      !oneOf(entry.candidateId, STRATEGY_DIRECTIONS) ||
      seen.has(entry.candidateId) ||
      !integer(entry.sourceContinuityRank, 1, candidateCount) ||
      !integer(entry.categoricalSeparationRank, 1, candidateCount) ||
      !integer(entry.gamutRetentionRank, 1, candidateCount) ||
      !integer(entry.setSeparationRank, 1, candidateCount) ||
      !integer(entry.functionalCoverageRank, 1, candidateCount) ||
      entry.aggregateRank !== index + 1 ||
      !hash(entry.tieBreakHash)
    ) {
      return false;
    }
    seen.add(entry.candidateId);
    const expectedRankSum =
      (entry.sourceContinuityRank as number) +
      (entry.categoricalSeparationRank as number) +
      (entry.gamutRetentionRank as number) +
      (entry.setSeparationRank as number) +
      (entry.functionalCoverageRank as number);
    const candidate = candidateById.get(entry.candidateId);
    return (
      entry.ordinalRankSum === expectedRankSum && entry.tieBreakHash === candidate?.candidateHash
    );
  });
  return (
    rankingValid &&
    seen.size === candidateCount &&
    (value.ranking[0] as UnknownRecord).candidateId === value.recommendedCandidateId &&
    sameDeterministicContent(
      value,
      buildColorSystemStrategyRecommendation(
        candidates as unknown as readonly ColorSystemStrategyCandidate[]
      )
    )
  );
}

function strategyBuilderBlocker(value: unknown): boolean {
  if (
    !record(value) ||
    !only(value, [
      'code',
      'message',
      'direction',
      'duplicateOfDirection',
      'searchEvidence',
      'alternatives',
    ]) ||
    !oneOf(value.code, [
      'SOURCE_REFERENCE_TERRITORY_UNAVAILABLE',
      'SOURCE_TERRITORY_MISMATCH',
      'NO_DISTINCT_SECONDARY_STRATEGY',
      'INVALID_GENERATED_SCALE',
      'NO_SUITABLE_CATEGORICAL_PALETTE',
      'NO_SUITABLE_SEQUENTIAL_PALETTE',
      'NO_SUITABLE_DIVERGING_PALETTE',
      'VISUALIZATION_EVALUATION_LIMIT_REACHED',
      'DUPLICATE_STRATEGY_COLLAPSED',
    ] as const) ||
    !string(value.message, MAX_TEXT) ||
    !strings(value.alternatives, 32, true, MAX_TEXT)
  ) {
    return false;
  }
  if (value.code === 'SOURCE_REFERENCE_TERRITORY_UNAVAILABLE') {
    return (
      value.direction === undefined &&
      value.duplicateOfDirection === undefined &&
      value.searchEvidence === undefined
    );
  }
  if (
    !oneOf(value.direction, STRATEGY_DIRECTIONS) ||
    !strategySearchEvidence(value.searchEvidence, false)
  ) {
    return false;
  }
  return value.code === 'DUPLICATE_STRATEGY_COLLAPSED'
    ? oneOf(value.duplicateOfDirection, STRATEGY_DIRECTIONS) &&
        value.duplicateOfDirection !== value.direction
    : value.duplicateOfDirection === undefined;
}

function strategySet(value: unknown, sourceHash: string): boolean {
  if (
    !record(value) ||
    !only(value, [
      'schemaVersion',
      'policyVersion',
      'sourceHash',
      'briefHash',
      'strategySetHash',
      'primary',
      'visualizationSettings',
      'recommendation',
      'candidates',
      'blockers',
    ]) ||
    value.schemaVersion !== '1.0.0' ||
    value.policyVersion !== 'teul-secondary-strategy-v1' ||
    value.sourceHash !== sourceHash ||
    !hash(value.briefHash) ||
    !hash(value.strategySetHash) ||
    !strategyPrimary(value.primary) ||
    !strategyVisualizationSettings(value.visualizationSettings) ||
    !array(value.candidates, 3) ||
    value.candidates.length < 1 ||
    !array(value.blockers, 3, strategyBuilderBlocker)
  ) {
    return false;
  }
  const primary = value.primary as UnknownRecord;
  const settings = value.visualizationSettings as UnknownRecord;
  const candidates = value.candidates as UnknownRecord[];
  const blockers = value.blockers as UnknownRecord[];
  const directions = candidates.map(candidate => candidate.id);
  if (
    new Set(directions).size !== candidates.length ||
    !directions.every(direction => oneOf(direction, STRATEGY_DIRECTIONS)) ||
    directions.some(
      (direction, index) =>
        index > 0 &&
        STRATEGY_DIRECTIONS.indexOf(direction as (typeof STRATEGY_DIRECTIONS)[number]) <=
          STRATEGY_DIRECTIONS.indexOf(directions[index - 1] as (typeof STRATEGY_DIRECTIONS)[number])
    ) ||
    !blockers.every(blocker => oneOf(blocker.direction, STRATEGY_DIRECTIONS)) ||
    !candidates.every(candidate =>
      strategyCandidate(
        candidate,
        candidate.id as (typeof STRATEGY_DIRECTIONS)[number],
        sourceHash,
        value.briefHash as string,
        primary,
        settings
      )
    )
  ) {
    return false;
  }
  const actualHashes = candidates.map(candidate => candidate.actualSystemHash);
  if (new Set(actualHashes).size !== actualHashes.length) return false;
  const failedDirections = new Set(blockers.map(item => item.direction as string));
  if (
    candidates.some(candidate => failedDirections.has(candidate.id as string)) ||
    candidates.length + failedDirections.size < STRATEGY_DIRECTIONS.length
  ) {
    return false;
  }
  if (!strategyRecommendation(value.recommendation, candidates)) return false;
  return (
    value.strategySetHash ===
    deterministicContentHash({
      schemaVersion: '1.0.0',
      policyVersion: 'teul-secondary-strategy-v1',
      sourceHash,
      briefHash: value.briefHash,
      primary: value.primary,
      visualizationSettings: value.visualizationSettings,
      recommendation: value.recommendation,
      blockers: value.blockers,
      candidates: candidates.map(candidate => ({
        id: candidate.id,
        modelHash: candidate.modelHash,
        candidateHash: candidate.candidateHash,
      })),
    })
  );
}

function strategyPreviewHexes(value: unknown, minimum: number, maximum: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.every(
      entry => typeof entry === 'string' && HEX.test(entry) && entry === entry.toLowerCase()
    )
  );
}

function strategyPreviewFamily(
  value: unknown,
  direction: (typeof STRATEGY_DIRECTIONS)[number],
  familyIndex: 1 | 2
): boolean {
  return (
    record(value) &&
    only(value, ['id', 'name', 'familyIndex', 'lightSteps', 'darkSteps']) &&
    value.id === `${direction}.secondary-${familyIndex}` &&
    string(value.name, MAX_TEXT) &&
    value.familyIndex === familyIndex &&
    strategyPreviewHexes(value.lightSteps, 12, 12) &&
    strategyPreviewHexes(value.darkSteps, 12, 12)
  );
}

function strategyPreviewSemanticTarget(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['targetTokenId', 'targetName', 'hex']) &&
    string(value.targetTokenId, MAX_TEXT) &&
    string(value.targetName, MAX_TEXT) &&
    typeof value.hex === 'string' &&
    HEX.test(value.hex) &&
    value.hex === value.hex.toLowerCase()
  );
}

function strategyPreviewProductSemantics(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === PREVIEW_PRODUCT_SEMANTIC_ROLES.length &&
    value.every(
      (mapping, index) =>
        record(mapping) &&
        only(mapping, ['role', 'light', 'dark']) &&
        mapping.role === PREVIEW_PRODUCT_SEMANTIC_ROLES[index] &&
        strategyPreviewSemanticTarget(mapping.light) &&
        strategyPreviewSemanticTarget(mapping.dark)
    )
  );
}

function strategyPreviewCandidate(value: unknown, primary: UnknownRecord): value is UnknownRecord {
  if (
    !record(value) ||
    !only(value, [
      'id',
      'candidateHash',
      'label',
      'rationale',
      'primary',
      'secondaryFamilies',
      'visualization',
      'productSemantics',
    ]) ||
    !oneOf(value.id, STRATEGY_DIRECTIONS) ||
    !hash(value.candidateHash) ||
    !string(value.label, MAX_TEXT) ||
    !string(value.rationale, MAX_TEXT) ||
    !strategyPrimary(value.primary) ||
    !record(value.primary) ||
    value.primary.tokenId !== primary.tokenId ||
    value.primary.name !== primary.name ||
    value.primary.mode !== primary.mode ||
    value.primary.hex !== primary.hex ||
    !Array.isArray(value.secondaryFamilies) ||
    value.secondaryFamilies.length !== 2 ||
    !strategyPreviewFamily(value.secondaryFamilies[0], value.id, 1) ||
    !strategyPreviewFamily(value.secondaryFamilies[1], value.id, 2) ||
    !record(value.visualization) ||
    !only(value.visualization, ['categorical', 'sequential', 'diverging']) ||
    !strategyPreviewProductSemantics(value.productSemantics)
  ) {
    return false;
  }
  return (
    strategyPreviewHexes(value.visualization.categorical, 2, 8) &&
    strategyPreviewHexes(value.visualization.sequential, 3, 9) &&
    strategyPreviewHexes(value.visualization.diverging, 3, 9) &&
    (value.visualization.diverging as unknown[]).length % 2 === 1
  );
}

function strategyPreviewBlocker(value: unknown): value is UnknownRecord {
  if (
    !record(value) ||
    !only(value, [
      'code',
      'message',
      'direction',
      'duplicateOfDirection',
      'searchEvidence',
      'alternatives',
    ]) ||
    !oneOf(value.code, [
      'SOURCE_REFERENCE_TERRITORY_UNAVAILABLE',
      'SOURCE_TERRITORY_MISMATCH',
      'NO_DISTINCT_SECONDARY_STRATEGY',
      'INVALID_GENERATED_SCALE',
      'NO_SUITABLE_CATEGORICAL_PALETTE',
      'NO_SUITABLE_SEQUENTIAL_PALETTE',
      'NO_SUITABLE_DIVERGING_PALETTE',
      'VISUALIZATION_EVALUATION_LIMIT_REACHED',
      'DUPLICATE_STRATEGY_COLLAPSED',
    ] as const) ||
    !string(value.message, MAX_TEXT) ||
    !strings(value.alternatives, 32, true, MAX_TEXT)
  ) {
    return false;
  }
  if (value.code === 'SOURCE_REFERENCE_TERRITORY_UNAVAILABLE') {
    return (
      value.direction === undefined &&
      value.duplicateOfDirection === undefined &&
      value.searchEvidence === undefined
    );
  }
  if (
    !oneOf(value.direction, STRATEGY_DIRECTIONS) ||
    (value.searchEvidence !== undefined && !strategySearchEvidence(value.searchEvidence, false)) ||
    (value.code === 'SOURCE_TERRITORY_MISMATCH' && value.searchEvidence === undefined)
  ) {
    return false;
  }
  return value.code === 'DUPLICATE_STRATEGY_COLLAPSED'
    ? oneOf(value.duplicateOfDirection, STRATEGY_DIRECTIONS) &&
        value.duplicateOfDirection !== value.direction
    : value.duplicateOfDirection === undefined;
}

function strategyFailureBlocker(value: unknown): boolean {
  if (
    !record(value) ||
    !only(value, ['code', 'message', 'direction', 'searchEvidence', 'alternatives']) ||
    !oneOf(value.code, STRATEGY_FAILURE_BLOCKER_CODES) ||
    !string(value.message, MAX_TEXT) ||
    (value.direction !== undefined && !oneOf(value.direction, STRATEGY_DIRECTIONS)) ||
    (value.searchEvidence !== undefined &&
      (!oneOf(value.direction, STRATEGY_DIRECTIONS) ||
        !strategySearchEvidence(value.searchEvidence, false))) ||
    !strings(value.alternatives, 32, true, MAX_TEXT)
  ) {
    return false;
  }
  if (value.code === 'VISUALIZATION_EVALUATION_LIMIT_REACHED') {
    return (
      record(value.searchEvidence) &&
      value.searchEvidence.visualizationEvaluationCount ===
        value.searchEvidence.visualizationMaximumEvaluations
    );
  }
  return true;
}

function strategyPreviewSet(value: unknown, sourceHash: string): boolean {
  if (
    !record(value) ||
    !only(value, [
      'schemaVersion',
      'policyVersion',
      'sourceHash',
      'strategySetHash',
      'primary',
      'recommendation',
      'candidates',
      'blockers',
    ]) ||
    value.schemaVersion !== '1.0.0' ||
    value.policyVersion !== 'teul-secondary-strategy-v1' ||
    value.sourceHash !== sourceHash ||
    !hash(value.strategySetHash) ||
    !strategyPrimary(value.primary) ||
    !record(value.recommendation) ||
    !only(value.recommendation, ['policyVersion', 'recommendedCandidateId', 'statement']) ||
    value.recommendation.policyVersion !== 'teul-strategy-recommendation-v1' ||
    !oneOf(value.recommendation.recommendedCandidateId, STRATEGY_DIRECTIONS) ||
    !string(value.recommendation.statement, MAX_TEXT) ||
    !array(value.candidates, 3) ||
    value.candidates.length < 1 ||
    !array(value.blockers, 3, strategyPreviewBlocker)
  ) {
    return false;
  }
  const primary = value.primary as UnknownRecord;
  const candidates = value.candidates as UnknownRecord[];
  const blockers = value.blockers as UnknownRecord[];
  const directions = candidates.map(candidate => candidate.id);
  const failedDirections = new Set(blockers.map(blocker => blocker.direction));
  return (
    new Set(directions).size === candidates.length &&
    new Set(candidates.map(candidate => candidate.candidateHash)).size === candidates.length &&
    directions.every(direction => oneOf(direction, STRATEGY_DIRECTIONS)) &&
    directions.every(
      (direction, index) =>
        index === 0 ||
        STRATEGY_DIRECTIONS.indexOf(direction as (typeof STRATEGY_DIRECTIONS)[number]) >
          STRATEGY_DIRECTIONS.indexOf(directions[index - 1] as (typeof STRATEGY_DIRECTIONS)[number])
    ) &&
    candidates.every(candidate => strategyPreviewCandidate(candidate, primary)) &&
    blockers.every(blocker => oneOf(blocker.direction, STRATEGY_DIRECTIONS)) &&
    candidates.every(candidate => !failedDirections.has(candidate.id)) &&
    candidates.length + failedDirections.size >= STRATEGY_DIRECTIONS.length &&
    directions.includes(value.recommendation.recommendedCandidateId)
  );
}

function validateStrategySetResult(message: UnknownRecord): boolean {
  if (message.success === false) {
    return failure(message, ['blockers']) && array(message.blockers, 32, strategyFailureBlocker);
  }
  return (
    message.success === true &&
    only(message, [
      'type',
      'requestId',
      'success',
      'sourceHash',
      'strategySet',
      'primaryResolution',
      'primaryNote',
    ]) &&
    hash(message.sourceHash) &&
    strategyPreviewSet(message.strategySet, message.sourceHash) &&
    oneOf(message.primaryResolution, [
      'structured-source',
      'verified-role',
      'user-confirmed',
    ] as const) &&
    string(message.primaryNote, MAX_TEXT)
  );
}

function validateApply(message: UnknownRecord): boolean {
  if (message.success === false) {
    const cleanup = message.cleanupReceipt;
    const cleanupValid =
      record(cleanup) &&
      only(cleanup, [
        'version',
        'attempted',
        'removedResourceCount',
        'complete',
        'failureCount',
        'failureMessages',
      ]) &&
      cleanup.version === COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION &&
      typeof cleanup.attempted === 'boolean' &&
      (cleanup.removedResourceCount === null || integer(cleanup.removedResourceCount, 0)) &&
      typeof cleanup.complete === 'boolean' &&
      integer(cleanup.failureCount, 0, MAX_ITEMS) &&
      strings(cleanup.failureMessages, 128, false, MAX_EVIDENCE_TEXT) &&
      (cleanup.failureMessages as string[]).length <= (cleanup.failureCount as number) &&
      ((cleanup.attempted === false &&
        cleanup.removedResourceCount === 0 &&
        cleanup.complete === true &&
        cleanup.failureCount === 0 &&
        (cleanup.failureMessages as string[]).length === 0) ||
        (cleanup.attempted === true &&
          ((cleanup.complete === true &&
            typeof cleanup.removedResourceCount === 'number' &&
            cleanup.failureCount === 0 &&
            (cleanup.failureMessages as string[]).length === 0) ||
            (cleanup.complete === false &&
              cleanup.failureCount > 0 &&
              (cleanup.failureMessages as string[]).length > 0))));
    return (
      cleanupValid &&
      failure(message, [
        'failureReceiptVersion',
        'failureStage',
        'cleanupReceipt',
        'rollbackFailures',
      ]) &&
      message.failureReceiptVersion === COLOR_SYSTEM_APPLY_FAILURE_RECEIPT_VERSION &&
      oneOf(message.failureStage, APPLY_FAILURE_STAGES) &&
      strings(message.rollbackFailures, 128, false, MAX_EVIDENCE_TEXT) &&
      (message.rollbackFailures as string[]).length ===
        (cleanup.failureMessages as string[]).length &&
      (message.rollbackFailures as string[]).every(
        (entry, index) => entry === (cleanup.failureMessages as string[])[index]
      )
    );
  }
  return (
    message.success === true &&
    only(message, [
      'type',
      'requestId',
      'success',
      'sourceHash',
      'proposalHash',
      'approvalHash',
      'outputName',
      'collectionName',
      'variableCount',
      'aliasCount',
      'styleCount',
      'overviewFrameName',
      'overviewScaleCount',
      'overviewSwatchCount',
      'outputBlueprintHash',
      'libraryPageName',
      'componentCount',
      'componentSetCount',
      'chartSpecimenCount',
      'boundPaintCount',
      'createdNodeCount',
      'publicationStatus',
      'rebuildSource',
      'builderPackageHash',
      'blueprintParity',
      'warnings',
      'undoBoundaryCommitted',
    ]) &&
    hash(message.sourceHash) &&
    hash(message.proposalHash) &&
    hash(message.approvalHash) &&
    string(message.outputName) &&
    optionalString(message.collectionName) &&
    integer(message.variableCount) &&
    integer(message.aliasCount) &&
    integer(message.styleCount) &&
    string(message.overviewFrameName) &&
    integer(message.overviewScaleCount) &&
    integer(message.overviewSwatchCount) &&
    (message.outputBlueprintHash === undefined || hash(message.outputBlueprintHash)) &&
    optionalString(message.libraryPageName) &&
    (message.componentCount === undefined || integer(message.componentCount)) &&
    (message.componentSetCount === undefined || integer(message.componentSetCount)) &&
    (message.chartSpecimenCount === undefined || integer(message.chartSpecimenCount)) &&
    (message.boundPaintCount === undefined || integer(message.boundPaintCount)) &&
    (message.createdNodeCount === undefined || integer(message.createdNodeCount)) &&
    (message.publicationStatus === undefined ||
      message.publicationStatus === 'manual-review-required') &&
    ((message.rebuildSource === undefined &&
      message.builderPackageHash === undefined &&
      message.blueprintParity === undefined) ||
      (message.rebuildSource === 'builder-package' &&
        hash(message.builderPackageHash) &&
        message.blueprintParity === 'exact')) &&
    strings(message.warnings, MAX_ITEMS) &&
    message.undoBoundaryCommitted === true
  );
}

function validateBuilderPackageImport(message: UnknownRecord): boolean {
  if (message.success === false) return failure(message);
  return (
    message.success === true &&
    only(message, [
      'type',
      'requestId',
      'success',
      'receiptId',
      'packageHash',
      'sourceHash',
      'proposalHash',
      'approvalHash',
      'outputBlueprintHash',
      'lifecycle',
      'candidateId',
      'candidateLabel',
      'systemSummary',
      'boundary',
    ]) &&
    string(message.receiptId) &&
    hash(message.packageHash) &&
    hash(message.sourceHash) &&
    hash(message.proposalHash) &&
    hash(message.approvalHash) &&
    hash(message.outputBlueprintHash) &&
    message.lifecycle === 'approved' &&
    oneOf(message.candidateId, STRATEGY_DIRECTIONS) &&
    string(message.candidateLabel, MAX_TEXT) &&
    record(message.systemSummary) &&
    only(message.systemSummary, [
      'primitiveCount',
      'aliasCount',
      'componentVariantCount',
      'chartSpecimenCount',
    ]) &&
    integer(message.systemSummary.primitiveCount, 1, 512) &&
    integer(message.systemSummary.aliasCount, 0, 128) &&
    integer(message.systemSummary.componentVariantCount, 0, 24) &&
    integer(message.systemSummary.chartSpecimenCount, 0, 3) &&
    record(message.boundary) &&
    only(message.boundary, [
      'buildsInOpenFileOnly',
      'createsSeparateFigmaFile',
      'publishesFigmaLibrary',
    ]) &&
    message.boundary.buildsInOpenFileOnly === true &&
    message.boundary.createsSeparateFigmaFile === false &&
    message.boundary.publishesFigmaLibrary === false
  );
}

function validateExport(message: UnknownRecord): boolean {
  if (message.success === false) return failure(message);
  if (
    message.success !== true ||
    !hash(message.sourceHash) ||
    typeof message.fileName !== 'string' ||
    !JSON_FILE.test(message.fileName) ||
    message.mimeType !== 'application/json' ||
    !string(message.content, MAX_EXPORT_BYTES) ||
    new TextEncoder().encode(message.content).byteLength > MAX_EXPORT_BYTES
  ) {
    return false;
  }
  if (message.kind !== 'builder-package') {
    return (
      only(message, [
        'type',
        'requestId',
        'success',
        'sourceHash',
        'kind',
        'fileName',
        'mimeType',
        'content',
      ]) && oneOf(message.kind, ['audit', 'source-teul', 'source-dtcg', 'proposal-teul'] as const)
    );
  }
  if (
    !only(message, [
      'type',
      'requestId',
      'success',
      'sourceHash',
      'kind',
      'artifactVersion',
      'artifactHash',
      'fileName',
      'mimeType',
      'content',
    ]) ||
    message.artifactVersion !== 'teul-color-system-builder-package/v1' ||
    !hash(message.artifactHash)
  ) {
    return false;
  }
  try {
    const parsed = JSON.parse(message.content);
    if (
      !record(parsed) ||
      parsed.schemaVersion !== message.artifactVersion ||
      parsed.packageHash !== message.artifactHash ||
      !record(parsed.hashes) ||
      parsed.hashes.sourceHash !== message.sourceHash
    ) {
      return false;
    }
    const { packageHash: _packageHash, ...payload } = parsed;
    return deterministicContentHash(payload) === message.artifactHash;
  } catch {
    return false;
  }
}

function matchesExpectation(
  message: UnknownRecord,
  expected: ColorSystemAuditMessageExpectation
): boolean {
  if (expected.requestId !== undefined && message.requestId !== expected.requestId) return false;
  if (expected.exportKind !== undefined && message.kind !== expected.exportKind) return false;
  for (const field of [
    'sourceHash',
    'auditHash',
    'proposalHash',
    'reviewHash',
    'approvalHash',
  ] as const) {
    if (expected[field] !== undefined && field in message && message[field] !== expected[field]) {
      return false;
    }
  }
  return true;
}

/**
 * Backend-only structural gate for builder-package reconstruction. Hash and
 * compiler revalidation remain the authority; this rejects unknown v1 shapes
 * before typed code receives the parsed document.
 */
export function validateColorSystemBuilderPackageCore(input: {
  snapshot: unknown;
  audit: unknown;
  completeness: unknown;
  strategySet: unknown;
  proposal: unknown;
}): boolean {
  if (!boundedTree(input, MAX_EXPORT_BYTES)) return false;
  if (!sourceSnapshot(input.snapshot)) return false;
  const snapshot = input.snapshot as UnknownRecord;
  if (!colorAudit(input.audit, snapshot.sourceHash as string)) return false;
  if (
    !record(input.completeness) ||
    !only(input.completeness, ['partial', 'cancelled', 'scannedNodeCount']) ||
    typeof input.completeness.partial !== 'boolean' ||
    typeof input.completeness.cancelled !== 'boolean' ||
    !integer(input.completeness.scannedNodeCount) ||
    (input.completeness.cancelled === true && input.completeness.partial !== true)
  ) {
    return false;
  }
  return (
    strategySet(input.strategySet, snapshot.sourceHash as string) &&
    proposal(input.proposal, snapshot.sourceHash as string)
  );
}

/** Validates only backend messages consumed by the color-system audit tab. */
export function validateColorSystemAuditPluginMessage(
  value: unknown,
  expected: ColorSystemAuditMessageExpectation = {}
): ColorSystemAuditMessageValidationResult {
  if (!record(value)) return { valid: false, error: 'Audit message must be an object.' };
  const maximumString =
    value.type === 'color-system-export-result' ? MAX_EXPORT_BYTES : MAX_EVIDENCE_TEXT;
  if (!boundedTree(value, maximumString)) {
    return { valid: false, error: 'Audit message exceeds structural limits.' };
  }
  if (!REQUEST_ID.test(String(value.requestId ?? ''))) {
    return { valid: false, error: 'Audit message requestId is invalid.' };
  }

  const validators: Record<string, (message: UnknownRecord) => boolean> = {
    'color-system-audit-progress': validateProgress,
    'color-system-audit-result': validateAuditResult,
    'color-system-declared-pairs-update-result': validateDeclaredPairResult,
    'color-system-strategy-set-result': validateStrategySetResult,
    'color-system-proposal-approval-result': validateProposalReview,
    'color-system-proposal-confirmation-result': validateConfirmation,
    'color-system-proposal-apply-result': validateApply,
    'color-system-export-result': validateExport,
    'color-system-builder-package-import-result': validateBuilderPackageImport,
  };
  const validator = typeof value.type === 'string' ? validators[value.type] : undefined;
  if (!validator) {
    return { valid: false, error: 'Message is not for the color-system audit tab.' };
  }
  if (!validator(value)) {
    return { valid: false, error: `Invalid ${String(value.type)} payload.` };
  }
  if (!matchesExpectation(value, expected)) {
    return { valid: false, error: 'Audit message does not match the pending request receipts.' };
  }
  return { valid: true, message: value as ColorSystemAuditPluginMessage };
}
