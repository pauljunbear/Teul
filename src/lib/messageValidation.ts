import type { PluginToUIMessage, UIToPluginMessage } from '../types/messages';
import { calculateContrastRatio, getLuminance, hexToOklch, hexToRgb } from './utils';
import { isExactTeulGeneratedScale } from './colorScale';
import { isSemanticColorPolicyCurrent } from './semanticColorPolicy';
import { doesRadixSourceInputMatchFamily, isExactRadixScale } from './radixColors';
import { parseGridConstructionV2 } from './gridConstructionV2';
import { COLOR_SYSTEM_INTENDED_SURFACES } from './colorSystemIntendedSurfaces';
import { utf8ByteLength } from './utf8';
import {
  COLOR_SYSTEM_REVIEW_ASSIGNABLE_ROLES,
  MAX_COLOR_SYSTEM_REVIEWER_ROLE_ASSIGNMENTS,
} from '../types/colorSystemAudit';
import {
  validateColorSystemBuilderV2PluginMessage,
  validateColorSystemBuilderV2UIMessage,
} from './colorSystemBuilderV2MessageValidation';
import {
  validateHistoricalColorDataRequest,
  validateHistoricalColorDataResult,
} from './historicalColorDataBridge';

type UnknownRecord = Record<string, unknown>;

export type MessageValidationResult =
  | { valid: true; message: UIToPluginMessage }
  | { valid: false; error: string };

export type PluginMessageValidationResult =
  | { valid: true; message: PluginToUIMessage }
  | { valid: false; error: string };

const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;
const GRID_ALIGNMENTS = ['MIN', 'CENTER', 'MAX', 'STRETCH'] as const;
const GRID_UNITS = ['px', 'percent'] as const;
const GRID_APPLICATION_MODES = [
  'fixed',
  'scale-from-reference',
  'responsive-width',
  'canonical-only',
] as const;
const GRID_ENTRY_KEYS = ['columns', 'rows', 'baseline'] as const;
const GRID_LINKED_RESOURCE_POLICIES = ['preserve-if-available', 'replace-with-values'] as const;
const GRADIENT_TYPES = ['LINEAR', 'RADIAL', 'ANGULAR', 'DIAMOND'] as const;
const DETAIL_LEVELS = ['minimal', 'detailed', 'presentation'] as const;
const SCALE_METHODS = ['custom', 'radix-match', 'wcag-constrained'] as const;
const COLOR_SCALE_METHODS = ['Teul OKLCH v3', 'Radix Colors'] as const;
const COLOR_ROLES = ['primary', 'secondary', 'tertiary', 'accent'] as const;
const COLOR_COLLISION_POLICIES = ['cancel', 'update-local', 'create-copy'] as const;
const NEUTRAL_FAMILIES = ['auto', 'gray', 'mauve', 'slate', 'sage', 'olive', 'sand'] as const;
const DOCUMENT_COLOR_PROFILES = ['legacy', 'srgb', 'display-p3', 'unknown'] as const;
const AUDIT_USAGE_SCOPES = ['selection', 'current-page', 'whole-file'] as const;
const PROPOSAL_STRATEGIES = ['exact-radix', 'brand-preserving', 'hybrid'] as const;
const COLOR_SYSTEM_STRATEGY_DIRECTIONS = [
  'close-harmony',
  'balanced-contrast',
  'wide-spectrum',
] as const;
const SCALE_KEY = /^(neutral|(primary|secondary|tertiary|accent)([2-9]\d*)?)$/;
const SERIALIZED_HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SERIALIZED_CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;
const SCALE_EPSILON = 0.00001;

const MAX_TEXT_LENGTH = 512;
const MAX_NOTIFICATION_LENGTH = 2000;
const MAX_GRADIENT_COLORS = 64;
const MAX_COLOR_SCALES = 400;
const MAX_GRID_COUNT = 1000;
const MAX_GRID_TARGETS = 1000;
const MAX_TARGET_ID_LENGTH = 256;
const MAX_DIMENSION = 100000;
const MAX_GRID_MEASUREMENT = 100000;
// Figma clientStorage has a 5 MB per-plugin quota. Keep a small envelope for
// other plugin preferences and let setAsync report the authoritative quota error.
const MAX_GRID_STORAGE_STRING_LENGTH = 4 * 1024 * 1024;
const MAX_WORKSPACE_STORAGE_STRING_LENGTH = 256 * 1024;
const MAX_AUDIT_ANCHORS = 32;
const MAX_PROPOSAL_ANCHORS = 4;
const MAX_AUDIT_SURFACES = 32;
const MAX_AUDIT_RESOURCE_ITEMS = 50_000;
const MAX_AUDIT_USAGE_ITEMS = 100_000;
const MAX_AUDIT_DIAGNOSTICS = 5_000;
const MAX_AUDIT_EVIDENCE_ITEMS = 1_000;
const MAX_AUDIT_EVIDENCE_STRING_LENGTH = 16 * 1024;
const MAX_AUDIT_PROPOSAL_ITEMS = 5_000;
const MAX_AUDIT_MODES = 128;
const MAX_AUDIT_PATH_SEGMENTS = 64;
const _MAX_LIBRARY_COLLECTIONS = 1_000;
const MAX_LIBRARY_VARIABLES = 50_000;
const MAX_STRUCTURED_COLOR_IMPORT_TEXT = 2 * 1024 * 1024;
const _MAX_COLOR_SYSTEM_EXPORT_TEXT = 8 * 1024 * 1024;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumberInRange(value, min, max) && Number.isInteger(value);
}

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === 'string' && options.includes(value);
}

function invalid(error: string): MessageValidationResult {
  return { valid: false, error };
}

function valid(message: UnknownRecord): MessageValidationResult {
  return { valid: true, message: message as unknown as UIToPluginMessage };
}

function validateColor(value: unknown): value is { hex: string; name: string } {
  return (
    isRecord(value) &&
    typeof value.hex === 'string' &&
    HEX_COLOR.test(value.hex) &&
    isBoundedString(value.name)
  );
}

function validateColorOperation(message: UnknownRecord): string | null {
  if (!isBoundedString(message.requestId, 128)) {
    return 'requestId must be a non-empty bounded string';
  }
  if (!validateColor(message)) return 'color payload must include a valid hex color and name';
  if (Object.keys(message).some(key => !['type', 'requestId', 'hex', 'name'].includes(key))) {
    return 'color payload contains unsupported fields';
  }
  return null;
}

function validateGradient(message: UnknownRecord): string | null {
  if (!isBoundedString(message.requestId, 128)) {
    return 'requestId must be a non-empty bounded string';
  }
  if (!isOneOf(message.gradientType, GRADIENT_TYPES)) return 'gradientType is invalid';
  if (
    !Array.isArray(message.colors) ||
    message.colors.length < 2 ||
    message.colors.length > MAX_GRADIENT_COLORS ||
    !message.colors.every(validateColor)
  ) {
    return `colors must contain 2-${MAX_GRADIENT_COLORS} valid colors`;
  }
  return null;
}

function validateGridColor(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumberInRange(value.r, 0, 1) &&
    isFiniteNumberInRange(value.g, 0, 1) &&
    isFiniteNumberInRange(value.b, 0, 1) &&
    isFiniteNumberInRange(value.a, 0, 1)
  );
}

function validateGridBoundVariables(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || Object.keys(value).length > 16) return false;
  return Object.entries(value).every(
    ([field, alias]) =>
      field.length > 0 &&
      field.length <= 64 &&
      isRecord(alias) &&
      alias.type === 'VARIABLE_ALIAS' &&
      isBoundedString(alias.id, 256)
  );
}

function validateGridNativeResources(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.gridStyleId === undefined || isBoundedString(value.gridStyleId, 256)) &&
    (value.sourceFileKey === undefined || isBoundedString(value.sourceFileKey, 256)) &&
    Array.isArray(value.boundVariableIds) &&
    value.boundVariableIds.length <= 64 &&
    value.boundVariableIds.every(id => isBoundedString(id, 256)) &&
    new Set(value.boundVariableIds).size === value.boundVariableIds.length
  );
}

function validateFigmaRowsOrColumnsGrid(value: unknown, pattern: 'COLUMNS' | 'ROWS'): boolean {
  if (
    !isRecord(value) ||
    value.pattern !== pattern ||
    !isOneOf(value.alignment, GRID_ALIGNMENTS) ||
    !isFiniteNumberInRange(value.gutterSize, 0, MAX_GRID_MEASUREMENT) ||
    !isIntegerInRange(value.count, 1, MAX_GRID_COUNT) ||
    !isFiniteNumberInRange(value.offset, 0, MAX_GRID_MEASUREMENT) ||
    typeof value.visible !== 'boolean' ||
    !validateGridColor(value.color) ||
    !validateGridBoundVariables(value.boundVariables)
  ) {
    return false;
  }

  return value.alignment === 'STRETCH'
    ? value.sectionSize === undefined ||
        isFiniteNumberInRange(value.sectionSize, 1, MAX_GRID_MEASUREMENT)
    : isFiniteNumberInRange(value.sectionSize, 1, MAX_GRID_MEASUREMENT);
}

function validateFigmaUniformGrid(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.pattern === 'GRID' &&
    isFiniteNumberInRange(value.sectionSize, 1, MAX_GRID_MEASUREMENT) &&
    typeof value.visible === 'boolean' &&
    validateGridColor(value.color) &&
    validateGridBoundVariables(value.boundVariables)
  );
}

function validateFigmaGridConfig(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.columns === undefined || validateFigmaRowsOrColumnsGrid(value.columns, 'COLUMNS')) &&
    (value.rows === undefined || validateFigmaRowsOrColumnsGrid(value.rows, 'ROWS')) &&
    (value.baseline === undefined || validateFigmaUniformGrid(value.baseline))
  );
}

function validateSourceRowsOrColumnsGrid(value: unknown): boolean {
  return (
    isRecord(value) &&
    isIntegerInRange(value.count, 1, MAX_GRID_COUNT) &&
    isFiniteNumberInRange(value.gutterSize, 0, MAX_GRID_MEASUREMENT) &&
    isOneOf(value.gutterUnit, GRID_UNITS) &&
    isFiniteNumberInRange(value.margin, 0, MAX_GRID_MEASUREMENT) &&
    isOneOf(value.marginUnit, GRID_UNITS) &&
    isOneOf(value.alignment, GRID_ALIGNMENTS) &&
    typeof value.visible === 'boolean' &&
    validateGridColor(value.color) &&
    validateGridBoundVariables(value.boundVariables)
  );
}

function validateSourceBaselineGrid(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumberInRange(value.height, 1, MAX_GRID_MEASUREMENT) &&
    isFiniteNumberInRange(value.offset, 0, MAX_GRID_MEASUREMENT) &&
    typeof value.visible === 'boolean' &&
    validateGridColor(value.color) &&
    validateGridBoundVariables(value.boundVariables)
  );
}

function validateSourceGridConfig(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.columns === undefined || validateSourceRowsOrColumnsGrid(value.columns)) &&
    (value.rows === undefined || validateSourceRowsOrColumnsGrid(value.rows)) &&
    (value.baseline === undefined || validateSourceBaselineGrid(value.baseline))
  );
}

function hasGridEntry(value: unknown): boolean {
  return isRecord(value) && GRID_ENTRY_KEYS.some(key => value[key] !== undefined);
}

function validateDimensions(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumberInRange(value.width, 1, MAX_DIMENSION) &&
    isFiniteNumberInRange(value.height, 1, MAX_DIMENSION)
  );
}

function validateResponsiveWidth(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isFiniteNumberInRange(value.min, 1, MAX_DIMENSION) ||
    (value.max !== undefined && !isFiniteNumberInRange(value.max, value.min, MAX_DIMENSION)) ||
    (value.maxContentWidth !== undefined &&
      !isFiniteNumberInRange(value.maxContentWidth, 1, MAX_DIMENSION)) ||
    (value.contentInset !== undefined &&
      !isFiniteNumberInRange(value.contentInset, 0, MAX_DIMENSION))
  ) {
    return false;
  }

  return Object.keys(value).every(key =>
    ['min', 'max', 'maxContentWidth', 'contentInset'].includes(key)
  );
}

function validateCreateGridFrame(message: UnknownRecord): string | null {
  if (!isBoundedString(message.requestId, 128)) {
    return 'requestId must be a non-empty bounded string';
  }
  if (!validateFigmaGridConfig(message.config)) return 'config must be a valid Figma grid config';
  const construction =
    message.construction === undefined ? null : parseGridConstructionV2(message.construction);
  const generatedConstruction =
    construction?.realization.kind === 'generated-geometry' ||
    construction?.realization.kind === 'approximation';
  if (!hasGridEntry(message.config) && !generatedConstruction) {
    return 'config must include at least one grid entry';
  }
  if (!isBoundedString(message.frameName)) return 'frameName must be a non-empty bounded string';
  if (!isFiniteNumberInRange(message.width, 1, MAX_DIMENSION)) return 'width is out of range';
  if (!isFiniteNumberInRange(message.height, 1, MAX_DIMENSION)) return 'height is out of range';
  if (
    message.positionNearSelection !== undefined &&
    typeof message.positionNearSelection !== 'boolean'
  ) {
    return 'positionNearSelection must be a boolean';
  }
  if (message.construction !== undefined && !construction) {
    return 'construction must be a valid Grid Construction v2 record';
  }
  return null;
}

function validateApplyGrid(message: UnknownRecord): string | null {
  if (!isBoundedString(message.requestId, 128)) {
    return 'requestId must be a non-empty bounded string';
  }
  if (!validateSourceGridConfig(message.sourceConfig)) {
    return 'sourceConfig must be a valid source grid config';
  }
  const construction =
    message.construction === undefined ? null : parseGridConstructionV2(message.construction);
  const generatedConstruction =
    construction?.realization.kind === 'generated-geometry' ||
    construction?.realization.kind === 'approximation';
  if (!hasGridEntry(message.sourceConfig) && !generatedConstruction) {
    return 'sourceConfig must include at least one grid entry';
  }
  if (message.sourceDimensions !== undefined && !validateDimensions(message.sourceDimensions)) {
    return 'sourceDimensions must contain valid positive dimensions';
  }
  if (!isOneOf(message.applicationMode, GRID_APPLICATION_MODES)) {
    return 'applicationMode must be fixed, scale-from-reference, responsive-width, or canonical-only';
  }
  if (
    (message.applicationMode === 'scale-from-reference' ||
      message.applicationMode === 'canonical-only') &&
    message.sourceDimensions === undefined
  ) {
    return `${message.applicationMode} requires sourceDimensions`;
  }
  if (
    message.applicationMode === 'responsive-width' &&
    !validateResponsiveWidth(message.responsiveWidth)
  ) {
    return 'responsive-width requires a valid responsiveWidth contract';
  }
  if (message.applicationMode !== 'responsive-width' && message.responsiveWidth !== undefined) {
    return 'responsiveWidth is only supported for responsive-width application';
  }
  if (
    !Array.isArray(message.expectedTargetIds) ||
    message.expectedTargetIds.length < 1 ||
    message.expectedTargetIds.length > MAX_GRID_TARGETS ||
    !message.expectedTargetIds.every(id => isBoundedString(id, MAX_TARGET_ID_LENGTH)) ||
    new Set(message.expectedTargetIds).size !== message.expectedTargetIds.length
  ) {
    return `expectedTargetIds must contain 1-${MAX_GRID_TARGETS} unique target IDs`;
  }
  if (typeof message.replaceExisting !== 'boolean') return 'replaceExisting must be a boolean';
  if (!isOneOf(message.linkedResourcePolicy, GRID_LINKED_RESOURCE_POLICIES)) {
    return 'linkedResourcePolicy must preserve links or replace them with numeric values';
  }
  if (
    message.nativeResources !== undefined &&
    !validateGridNativeResources(message.nativeResources)
  ) {
    return 'nativeResources must contain valid style and variable identifiers';
  }
  if (
    message.linkedResourcePolicy === 'preserve-if-available' &&
    message.nativeResources === undefined
  ) {
    return 'preserve-if-available requires nativeResources';
  }
  if (message.construction !== undefined && !construction) {
    return 'construction must be a valid Grid Construction v2 record';
  }
  return null;
}

function validateGetSelectionForGrid(message: UnknownRecord): string | null {
  return message.requestId === undefined || isBoundedString(message.requestId, 128)
    ? null
    : 'requestId must be a non-empty bounded string';
}

function validateClearGrid(message: UnknownRecord): string | null {
  if (!isBoundedString(message.requestId, 128)) {
    return 'requestId must be a non-empty bounded string';
  }
  if (
    !Array.isArray(message.expectedTargetIds) ||
    message.expectedTargetIds.length === 0 ||
    message.expectedTargetIds.length > MAX_GRID_TARGETS ||
    !message.expectedTargetIds.every(id => isBoundedString(id, MAX_TARGET_ID_LENGTH)) ||
    new Set(message.expectedTargetIds).size !== message.expectedTargetIds.length
  ) {
    return 'expectedTargetIds must be a non-empty bounded list of unique target IDs';
  }
  return null;
}

function validateGridStorageRequest(message: UnknownRecord): string | null {
  if (!isBoundedString(message.requestId, 128)) {
    return 'requestId must be a non-empty bounded string';
  }

  if (message.type === 'set-grid-storage') {
    if (
      typeof message.value !== 'string' ||
      message.value.length === 0 ||
      message.value.length > MAX_GRID_STORAGE_STRING_LENGTH
    ) {
      return `value must be a non-empty string no longer than ${MAX_GRID_STORAGE_STRING_LENGTH} characters`;
    }
  }

  return null;
}

function validateWorkspaceStorageRequest(message: UnknownRecord): string | null {
  if (!isBoundedString(message.requestId, 128)) {
    return 'requestId must be a non-empty bounded string';
  }
  if (
    message.type === 'set-workspace-storage' &&
    (typeof message.value !== 'string' ||
      message.value.length === 0 ||
      message.value.length > MAX_WORKSPACE_STORAGE_STRING_LENGTH)
  ) {
    return `value must be a non-empty string no longer than ${MAX_WORKSPACE_STORAGE_STRING_LENGTH} characters`;
  }
  return null;
}

function validateSnapshotAuthorization(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['status', 'rightsNote', 'receiptLocator']) &&
    isOneOf(value.status, ['user-authorized', 'public-reference', 'unknown'] as const) &&
    optionalBoundedString(value.rightsNote, MAX_NOTIFICATION_LENGTH) &&
    optionalBoundedString(value.receiptLocator, MAX_NOTIFICATION_LENGTH)
  );
}

function validateUniqueBoundedStrings(value: unknown, maxItems: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every(item => isBoundedString(item, 256)) &&
    new Set(value).size === value.length
  );
}

function hasOnlyKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function validateIntendedSurfaces(value: unknown): value is string[] {
  return (
    validateUniqueBoundedStrings(value, MAX_AUDIT_SURFACES) &&
    value.length > 0 &&
    value.every(surface => (COLOR_SYSTEM_INTENDED_SURFACES as readonly string[]).includes(surface))
  );
}

function validateRoleDecisions(value: unknown): boolean {
  if (
    !validBoundedArray(
      value,
      MAX_AUDIT_PROPOSAL_ITEMS,
      decision =>
        isRecord(decision) &&
        hasOnlyKeys(decision, ['tokenId', 'role', 'disposition', 'assignmentSource']) &&
        isBoundedString(decision.tokenId, 256) &&
        isBoundedString(decision.role, 256) &&
        isOneOf(decision.disposition, ['confirmed', 'rejected'] as const) &&
        (decision.assignmentSource === undefined ||
          isOneOf(decision.assignmentSource, ['source-evidence', 'reviewer-assigned'] as const)) &&
        (decision.assignmentSource !== 'reviewer-assigned' ||
          (decision.disposition === 'confirmed' &&
            isOneOf(decision.role, COLOR_SYSTEM_REVIEW_ASSIGNABLE_ROLES)))
    )
  ) {
    return false;
  }
  const reviewerAssignments = value.filter(
    decision => (decision as UnknownRecord).assignmentSource === 'reviewer-assigned'
  );
  if (reviewerAssignments.length > MAX_COLOR_SYSTEM_REVIEWER_ROLE_ASSIGNMENTS) return false;
  const keys = value.map(decision => {
    const record = decision as UnknownRecord;
    return `${record.tokenId}\u0000${String(record.role).toLowerCase()}`;
  });
  return new Set(keys).size === keys.length;
}

function validateConfirmedAnchors(value: unknown): boolean {
  if (
    !validBoundedArray(
      value,
      MAX_PROPOSAL_ANCHORS,
      anchor =>
        isRecord(anchor) &&
        hasOnlyKeys(anchor, ['tokenId', 'mode', 'hex']) &&
        isBoundedString(anchor.tokenId, 256) &&
        isBoundedString(anchor.mode, 256) &&
        typeof anchor.hex === 'string' &&
        SERIALIZED_HEX_COLOR.test(anchor.hex)
    )
  ) {
    return false;
  }
  const tokenIds = value.map(anchor => (anchor as UnknownRecord).tokenId as string);
  return new Set(tokenIds).size === tokenIds.length;
}

function anchorIdsMatch(anchorIds: unknown, confirmedAnchors: unknown): boolean {
  if (!Array.isArray(anchorIds) || !Array.isArray(confirmedAnchors)) return false;
  const confirmedIds = confirmedAnchors.map(anchor => (anchor as UnknownRecord).tokenId);
  return (
    anchorIds.length === confirmedIds.length && anchorIds.every(id => confirmedIds.includes(id))
  );
}

function generatedAnchorsMatchConfirmed(
  proposalRequest: unknown,
  confirmedAnchors: unknown
): boolean {
  if (!isRecord(proposalRequest) || !Array.isArray(confirmedAnchors)) return false;
  if (proposalRequest.strategy === 'exact-radix') return true;
  const scales =
    proposalRequest.strategy === 'brand-preserving'
      ? proposalRequest.scales
      : proposalRequest.generatedScales;
  if (!Array.isArray(scales)) return false;
  return scales.every(scale => {
    if (!isRecord(scale) || !isRecord(scale.anchor)) return false;
    const sourceTokenId = scale.anchor.sourceTokenId;
    const sourceMode = scale.anchor.sourceMode;
    const sourceHex = scale.anchor.hex;
    if (
      typeof sourceTokenId !== 'string' ||
      typeof sourceMode !== 'string' ||
      typeof sourceHex !== 'string'
    ) {
      return false;
    }
    return confirmedAnchors.some(candidate => {
      if (!isRecord(candidate)) return false;
      return (
        candidate.tokenId === sourceTokenId &&
        candidate.mode === sourceMode &&
        typeof candidate.hex === 'string' &&
        candidate.hex.toLowerCase() === sourceHex.toLowerCase()
      );
    });
  });
}

function validateAnalyzeColorSystem(message: UnknownRecord): string | null {
  if (
    !hasOnlyKeys(message, [
      'type',
      'requestId',
      'usageScope',
      'confirmWholeFile',
      'includeEnabledLibraryDescriptors',
      'authorization',
    ])
  ) {
    return 'analysis request contains unsupported fields';
  }
  if (!isBoundedString(message.requestId, 128)) return 'requestId must be bounded';
  if (!isOneOf(message.usageScope, AUDIT_USAGE_SCOPES)) return 'usageScope is invalid';
  if (typeof message.confirmWholeFile !== 'boolean') return 'confirmWholeFile must be boolean';
  if (message.usageScope === 'whole-file' && message.confirmWholeFile !== true) {
    return 'whole-file scope requires explicit confirmation';
  }
  if (typeof message.includeEnabledLibraryDescriptors !== 'boolean') {
    return 'includeEnabledLibraryDescriptors must be boolean';
  }
  if (!validateSnapshotAuthorization(message.authorization)) return 'authorization is invalid';
  if ((message.authorization as UnknownRecord).status !== 'user-authorized') {
    return 'open-document analysis requires explicit user authorization';
  }
  return null;
}

function validateImportStructuredColorSystem(message: UnknownRecord): string | null {
  if (!hasOnlyKeys(message, ['type', 'requestId', 'fileName', 'content', 'authorization'])) {
    return 'structured import contains unsupported fields';
  }
  if (!isBoundedString(message.requestId, 128)) return 'requestId must be bounded';
  if (!isBoundedString(message.fileName, 512)) return 'fileName must be bounded';
  if (!isBoundedString(message.content, MAX_STRUCTURED_COLOR_IMPORT_TEXT)) {
    return 'content must be non-empty and no more than 2 MiB';
  }
  if (!validateSnapshotAuthorization(message.authorization)) return 'authorization is invalid';
  if ((message.authorization as UnknownRecord).status !== 'user-authorized') {
    return 'structured import requires explicit user authorization';
  }
  return null;
}

function validateCancelColorSystemAnalysis(message: UnknownRecord): string | null {
  if (!hasOnlyKeys(message, ['type', 'targetRequestId', 'preservePartial'])) {
    return 'cancel request contains unsupported fields';
  }
  if (!isBoundedString(message.targetRequestId, 128)) return 'targetRequestId must be bounded';
  if (typeof message.preservePartial !== 'boolean') return 'preservePartial must be boolean';
  return null;
}

function validateUpdateColorSystemDeclaredPairs(message: UnknownRecord): string | null {
  if (!hasOnlyKeys(message, ['type', 'requestId', 'sourceHash', 'declaredPairs'])) {
    return 'declared-pair update contains unsupported fields';
  }
  if (!isBoundedString(message.requestId, 128)) return 'requestId must be bounded';
  if (!isBoundedString(message.sourceHash, 256)) return 'sourceHash must be bounded';
  if (!validBoundedArray(message.declaredPairs, MAX_AUDIT_PROPOSAL_ITEMS, validDeclaredPair)) {
    return 'declaredPairs must contain bounded WCAG pair declarations';
  }
  const pairIds = message.declaredPairs.map(pair => (pair as UnknownRecord).id as string);
  if (new Set(pairIds).size !== pairIds.length) return 'declaredPairs IDs must be unique';
  return null;
}

function validateExactAnchor(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['sourceTokenId', 'hex', 'referenceMode', 'referenceStep', 'weight']) &&
    isBoundedString(value.sourceTokenId, 256) &&
    typeof value.hex === 'string' &&
    SERIALIZED_HEX_COLOR.test(value.hex) &&
    (value.referenceMode === undefined ||
      isOneOf(value.referenceMode, ['light', 'dark'] as const)) &&
    (value.referenceStep === undefined || isIntegerInRange(value.referenceStep, 1, 12)) &&
    (value.weight === undefined || isFiniteNumberInRange(value.weight, 0.000001, 1_000_000))
  );
}

function validateGeneratedScaleRequest(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['id', 'name', 'anchor', 'includeDarkMode']) &&
    isBoundedString(value.id, 256) &&
    isBoundedString(value.name, 256) &&
    typeof value.includeDarkMode === 'boolean' &&
    isRecord(value.anchor) &&
    hasOnlyKeys(value.anchor, ['sourceTokenId', 'sourceMode', 'name', 'hex', 'step']) &&
    isBoundedString(value.anchor.sourceTokenId, 256) &&
    isBoundedString(value.anchor.sourceMode, 256) &&
    isBoundedString(value.anchor.name, 256) &&
    typeof value.anchor.hex === 'string' &&
    SERIALIZED_HEX_COLOR.test(value.anchor.hex) &&
    isIntegerInRange(value.anchor.step, 1, 12)
  );
}

function validateExactProposalRequest(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['strategy', 'anchors', 'approvedTolerance']) &&
    value.strategy === 'exact-radix' &&
    Array.isArray(value.anchors) &&
    value.anchors.length > 0 &&
    value.anchors.length <= MAX_PROPOSAL_ANCHORS &&
    value.anchors.every(validateExactAnchor) &&
    new Set(value.anchors.map(anchor => (anchor as UnknownRecord).sourceTokenId as string)).size ===
      value.anchors.length &&
    (value.approvedTolerance === undefined || isFiniteNumberInRange(value.approvedTolerance, 0, 10))
  );
}

function validateBrandProposalRequest(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['strategy', 'scales']) &&
    value.strategy === 'brand-preserving' &&
    Array.isArray(value.scales) &&
    value.scales.length > 0 &&
    value.scales.length <= MAX_PROPOSAL_ANCHORS &&
    value.scales.every(validateGeneratedScaleRequest) &&
    new Set(
      value.scales.map(scale => ((scale as UnknownRecord).anchor as UnknownRecord).sourceTokenId)
    ).size === value.scales.length
  );
}

function validateProposalRequest(value: unknown): boolean {
  if (!isRecord(value) || !isOneOf(value.strategy, PROPOSAL_STRATEGIES)) return false;
  if (value.strategy === 'exact-radix') return validateExactProposalRequest(value);
  if (value.strategy === 'brand-preserving') return validateBrandProposalRequest(value);
  return (
    hasOnlyKeys(value, ['strategy', 'exact', 'generatedScales']) &&
    isRecord(value.exact) &&
    validateExactProposalRequest(value.exact) &&
    Array.isArray(value.generatedScales) &&
    value.generatedScales.length <= MAX_PROPOSAL_ANCHORS &&
    value.generatedScales.every(validateGeneratedScaleRequest) &&
    new Set(
      value.generatedScales.map(
        scale => ((scale as UnknownRecord).anchor as UnknownRecord).sourceTokenId
      )
    ).size === value.generatedScales.length
  );
}

function validateVisualizationSettings(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const normalizedBoundary =
    typeof value.boundaryHex === 'string' ? value.boundaryHex.toLowerCase() : undefined;
  const boundaryIsBlackOrWhite =
    normalizedBoundary === '#000000' || normalizedBoundary === '#ffffff';
  const effectiveAdjacency = value.adjacency ?? 'separated-marks';
  return (
    hasOnlyKeys(value, [
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
    isOneOf(value.mode, ['light', 'dark'] as const) &&
    typeof value.surfaceHex === 'string' &&
    SERIALIZED_HEX_COLOR.test(value.surfaceHex) &&
    (value.boundaryHex === undefined ||
      (typeof value.boundaryHex === 'string' && SERIALIZED_HEX_COLOR.test(value.boundaryHex))) &&
    (value.boundaryHex === undefined || boundaryIsBlackOrWhite) &&
    isBoundedString(value.chartType, 256) &&
    isIntegerInRange(value.categoryCount, 2, 8) &&
    isBoundedString(value.nonColorCue, MAX_TEXT_LENGTH) &&
    (value.markType === undefined ||
      isOneOf(value.markType, ['bar', 'line', 'area', 'point', 'region'] as const)) &&
    (value.adjacency === undefined ||
      isOneOf(value.adjacency, ['separated-marks', 'touching-regions'] as const)) &&
    (effectiveAdjacency !== 'separated-marks' || value.boundaryHex === undefined) &&
    (effectiveAdjacency !== 'touching-regions' || boundaryIsBlackOrWhite) &&
    (value.divergingMidpoint === undefined || isBoundedString(value.divergingMidpoint, 256)) &&
    (value.sequentialCount === undefined || isIntegerInRange(value.sequentialCount, 3, 9)) &&
    (value.divergingCount === undefined ||
      (isIntegerInRange(value.divergingCount, 3, 9) && value.divergingCount % 2 === 1))
  );
}

function validateGenerateColorSystemStrategies(message: UnknownRecord): string | null {
  if (
    !hasOnlyKeys(message, [
      'type',
      'requestId',
      'sourceHash',
      'visualizationSettings',
      'confirmedPrimary',
    ])
  ) {
    return 'strategy generation contains unsupported fields';
  }
  if (!isBoundedString(message.requestId, 128)) return 'requestId must be bounded';
  if (typeof message.sourceHash !== 'string' || !SERIALIZED_CONTENT_HASH.test(message.sourceHash)) {
    return 'sourceHash must be a canonical SHA-256 content hash';
  }
  if (
    !validateVisualizationSettings(message.visualizationSettings) ||
    !isRecord(message.visualizationSettings) ||
    !isOneOf(message.visualizationSettings.markType, [
      'bar',
      'line',
      'area',
      'point',
      'region',
    ] as const) ||
    !isOneOf(message.visualizationSettings.adjacency, [
      'separated-marks',
      'touching-regions',
    ] as const) ||
    !isBoundedString(message.visualizationSettings.divergingMidpoint, 256) ||
    !isIntegerInRange(message.visualizationSettings.sequentialCount, 3, 9) ||
    !isIntegerInRange(message.visualizationSettings.divergingCount, 3, 9) ||
    message.visualizationSettings.divergingCount % 2 !== 1 ||
    (message.visualizationSettings.adjacency === 'touching-regions' &&
      message.visualizationSettings.boundaryHex === undefined)
  ) {
    return 'visualizationSettings must declare mark type, adjacency, midpoint, and supported palette counts';
  }
  if (message.confirmedPrimary !== undefined) {
    if (
      !isRecord(message.confirmedPrimary) ||
      !hasOnlyKeys(message.confirmedPrimary, ['tokenId', 'mode', 'hex']) ||
      !isBoundedString(message.confirmedPrimary.tokenId, 256) ||
      !isBoundedString(message.confirmedPrimary.mode, 256) ||
      typeof message.confirmedPrimary.hex !== 'string' ||
      !SERIALIZED_HEX_COLOR.test(message.confirmedPrimary.hex)
    ) {
      return 'confirmedPrimary is invalid';
    }
  }
  return null;
}

function validateSelectColorSystemStrategy(message: UnknownRecord): string | null {
  if (
    !hasOnlyKeys(message, [
      'type',
      'requestId',
      'sourceHash',
      'strategySetHash',
      'candidateId',
      'candidateHash',
    ])
  ) {
    return 'strategy selection contains unsupported fields';
  }
  if (!isBoundedString(message.requestId, 128)) return 'requestId must be bounded';
  if (typeof message.sourceHash !== 'string' || !SERIALIZED_CONTENT_HASH.test(message.sourceHash)) {
    return 'sourceHash must be a canonical SHA-256 content hash';
  }
  if (
    typeof message.strategySetHash !== 'string' ||
    !SERIALIZED_CONTENT_HASH.test(message.strategySetHash)
  ) {
    return 'strategySetHash must be a canonical SHA-256 content hash';
  }
  if (!isOneOf(message.candidateId, COLOR_SYSTEM_STRATEGY_DIRECTIONS)) {
    return 'candidateId is invalid';
  }
  if (
    typeof message.candidateHash !== 'string' ||
    !SERIALIZED_CONTENT_HASH.test(message.candidateHash)
  ) {
    return 'candidateHash must be a canonical SHA-256 content hash';
  }
  return null;
}

function validateApproveColorSystemProposal(message: UnknownRecord): string | null {
  if (
    !hasOnlyKeys(message, [
      'type',
      'requestId',
      'sourceHash',
      'proposalRequest',
      'confirmedAnchorTokenIds',
      'confirmedAnchors',
      'intendedSurfaces',
      'roleDecisions',
      'visualizationSettings',
    ])
  ) {
    return 'proposal review contains unsupported fields';
  }
  if (!isBoundedString(message.requestId, 128)) return 'requestId must be bounded';
  if (!isBoundedString(message.sourceHash, 256)) return 'sourceHash must be bounded';
  if (!validateProposalRequest(message.proposalRequest)) return 'proposalRequest is invalid';
  if (!validateUniqueBoundedStrings(message.confirmedAnchorTokenIds, MAX_PROPOSAL_ANCHORS)) {
    return 'confirmedAnchorTokenIds is invalid';
  }
  if (
    !validateConfirmedAnchors(message.confirmedAnchors) ||
    !anchorIdsMatch(message.confirmedAnchorTokenIds, message.confirmedAnchors)
  ) {
    return 'confirmedAnchors is invalid or does not match confirmedAnchorTokenIds';
  }
  if (!generatedAnchorsMatchConfirmed(message.proposalRequest, message.confirmedAnchors)) {
    return 'generated anchors do not match confirmed token, mode, and hex evidence';
  }
  if (!validateIntendedSurfaces(message.intendedSurfaces)) {
    return 'intendedSurfaces is invalid';
  }
  if (!validateRoleDecisions(message.roleDecisions)) return 'roleDecisions is invalid';
  const needsVisualization =
    Array.isArray(message.intendedSurfaces) &&
    message.intendedSurfaces.includes('data-visualization');
  if (needsVisualization !== (message.visualizationSettings !== undefined)) {
    return needsVisualization
      ? 'visualizationSettings is required for data-visualization'
      : 'visualizationSettings requires data-visualization';
  }
  if (
    message.visualizationSettings !== undefined &&
    !validateVisualizationSettings(message.visualizationSettings)
  ) {
    return 'visualizationSettings is invalid';
  }
  return null;
}

function validateConfirmColorSystemProposal(message: UnknownRecord): string | null {
  if (
    !hasOnlyKeys(message, [
      'type',
      'requestId',
      'sourceHash',
      'proposalHash',
      'reviewHash',
      'confirmedAnchorTokenIds',
      'confirmedAnchors',
      'intendedSurfaces',
      'roleDecisions',
    ])
  ) {
    return 'proposal confirmation contains unsupported fields';
  }
  if (!isBoundedString(message.requestId, 128)) return 'requestId must be bounded';
  if (!isBoundedString(message.sourceHash, 256)) return 'sourceHash must be bounded';
  if (!isBoundedString(message.proposalHash, 256)) return 'proposalHash must be bounded';
  if (!isBoundedString(message.reviewHash, 256)) return 'reviewHash must be bounded';
  if (!validateUniqueBoundedStrings(message.confirmedAnchorTokenIds, MAX_PROPOSAL_ANCHORS)) {
    return 'confirmedAnchorTokenIds is invalid';
  }
  if (
    !validateConfirmedAnchors(message.confirmedAnchors) ||
    !anchorIdsMatch(message.confirmedAnchorTokenIds, message.confirmedAnchors)
  ) {
    return 'confirmedAnchors is invalid or does not match confirmedAnchorTokenIds';
  }
  if (!validateIntendedSurfaces(message.intendedSurfaces)) {
    return 'intendedSurfaces is invalid';
  }
  if (!validateRoleDecisions(message.roleDecisions)) return 'roleDecisions is invalid';
  return null;
}

function validateApplyColorSystemProposal(message: UnknownRecord): string | null {
  if (
    !hasOnlyKeys(message, [
      'type',
      'requestId',
      'sourceHash',
      'proposalHash',
      'approvalHash',
      'systemName',
      'collisionPolicy',
      'createVariables',
      'createStyles',
      'confirmedAnchorTokenIds',
      'confirmedAnchors',
      'confirmedIntendedSurfaces',
    ])
  ) {
    return 'proposal apply contains unsupported fields';
  }
  if (!isBoundedString(message.requestId, 128)) return 'requestId must be bounded';
  if (!isBoundedString(message.sourceHash, 256)) return 'sourceHash must be bounded';
  if (!isBoundedString(message.proposalHash, 256)) return 'proposalHash must be bounded';
  if (!isBoundedString(message.approvalHash, 256)) return 'approvalHash must be bounded';
  if (!isBoundedString(message.systemName, 128)) return 'systemName must be bounded';
  if (!isOneOf(message.collisionPolicy, ['cancel', 'create-copy'] as const)) {
    return 'collisionPolicy must be cancel or create-copy';
  }
  if (typeof message.createVariables !== 'boolean' || typeof message.createStyles !== 'boolean') {
    return 'createVariables and createStyles must be boolean';
  }
  if (!message.createVariables && !message.createStyles) return 'at least one output is required';
  if (!validateUniqueBoundedStrings(message.confirmedAnchorTokenIds, MAX_PROPOSAL_ANCHORS)) {
    return 'confirmedAnchorTokenIds is invalid';
  }
  if (
    !validateConfirmedAnchors(message.confirmedAnchors) ||
    !anchorIdsMatch(message.confirmedAnchorTokenIds, message.confirmedAnchors)
  ) {
    return 'confirmedAnchors is invalid or does not match confirmedAnchorTokenIds';
  }
  if (!validateIntendedSurfaces(message.confirmedIntendedSurfaces)) {
    return 'confirmedIntendedSurfaces is invalid';
  }
  return null;
}

function validateImportColorSystemBuilderPackage(message: UnknownRecord): string | null {
  if (!hasOnlyKeys(message, ['type', 'requestId', 'fileName', 'content'])) {
    return 'builder package import contains unsupported fields';
  }
  if (!isBoundedString(message.requestId, 128)) return 'requestId must be bounded';
  if (
    !isBoundedString(message.fileName, 256) ||
    /[/\\]/.test(message.fileName) ||
    !message.fileName.toLowerCase().endsWith('.json')
  ) {
    return 'fileName must be a local JSON basename';
  }
  if (
    typeof message.content !== 'string' ||
    message.content.length === 0 ||
    utf8ByteLength(message.content) > _MAX_COLOR_SYSTEM_EXPORT_TEXT
  ) {
    return 'builder package content exceeds the 8 MiB import limit';
  }
  return null;
}

function validateRebuildColorSystemBuilderPackage(message: UnknownRecord): string | null {
  if (
    !hasOnlyKeys(message, [
      'type',
      'requestId',
      'receiptId',
      'packageHash',
      'systemName',
      'collisionPolicy',
      'createVariables',
      'createStyles',
      'acknowledgeOpenFileBoundary',
    ])
  ) {
    return 'builder package rebuild contains unsupported fields';
  }
  if (!isBoundedString(message.requestId, 128)) return 'requestId must be bounded';
  if (!isBoundedString(message.receiptId, 256)) return 'receiptId must be bounded';
  if (
    typeof message.packageHash !== 'string' ||
    !SERIALIZED_CONTENT_HASH.test(message.packageHash)
  ) {
    return 'packageHash must be a canonical SHA-256 content hash';
  }
  if (!isBoundedString(message.systemName, 128)) return 'systemName must be bounded';
  if (!isOneOf(message.collisionPolicy, ['cancel', 'create-copy'] as const)) {
    return 'collisionPolicy must be cancel or create-copy';
  }
  if (typeof message.createVariables !== 'boolean' || typeof message.createStyles !== 'boolean') {
    return 'createVariables and createStyles must be boolean';
  }
  if (!message.createVariables && !message.createStyles) return 'at least one output is required';
  if (message.acknowledgeOpenFileBoundary !== true) {
    return 'open-file rebuild boundary must be acknowledged';
  }
  return null;
}

function validAuditReviewerDecision(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['kind', 'subjectId', 'disposition', 'assignmentSource', 'note']) &&
    isOneOf(value.kind, ['anchor', 'intended-surface', 'role', 'omission'] as const) &&
    isBoundedString(value.subjectId, 512) &&
    isOneOf(value.disposition, ['confirmed', 'rejected', 'omitted'] as const) &&
    (value.kind === 'role'
      ? value.assignmentSource === undefined ||
        isOneOf(value.assignmentSource, ['source-evidence', 'reviewer-assigned'] as const)
      : value.assignmentSource === undefined) &&
    (value.assignmentSource !== 'reviewer-assigned' || value.disposition === 'confirmed') &&
    optionalBoundedString(value.note, MAX_NOTIFICATION_LENGTH)
  );
}

function validateExportColorSystemArtifact(message: UnknownRecord): string | null {
  if (
    !hasOnlyKeys(message, [
      'type',
      'requestId',
      'sourceHash',
      'kind',
      'proposalStrategy',
      'proposalHash',
      'builderPackageReceipt',
      'reviewerDecisions',
    ])
  ) {
    return 'color-system export contains unsupported fields';
  }
  if (!isBoundedString(message.requestId, 128)) return 'requestId must be bounded';
  if (!isBoundedString(message.sourceHash, 256)) return 'sourceHash must be bounded';
  if (
    !isOneOf(message.kind, [
      'audit',
      'source-teul',
      'source-dtcg',
      'proposal-teul',
      'builder-package',
    ] as const)
  ) {
    return 'export kind is invalid';
  }
  if (
    message.proposalStrategy !== undefined &&
    !isOneOf(message.proposalStrategy, PROPOSAL_STRATEGIES)
  ) {
    return 'proposalStrategy is invalid';
  }
  if (message.proposalHash !== undefined && !isBoundedString(message.proposalHash, 256)) {
    return 'proposalHash must be bounded when provided';
  }
  if (message.builderPackageReceipt !== undefined) {
    if (
      !isRecord(message.builderPackageReceipt) ||
      !hasOnlyKeys(message.builderPackageReceipt, [
        'schemaVersion',
        'proposalHash',
        'reviewHash',
        'approvalHash',
      ]) ||
      message.builderPackageReceipt.schemaVersion !== 'teul-color-system-builder-package/v1' ||
      typeof message.builderPackageReceipt.proposalHash !== 'string' ||
      !SERIALIZED_CONTENT_HASH.test(message.builderPackageReceipt.proposalHash) ||
      typeof message.builderPackageReceipt.reviewHash !== 'string' ||
      !SERIALIZED_CONTENT_HASH.test(message.builderPackageReceipt.reviewHash) ||
      (message.builderPackageReceipt.approvalHash !== undefined &&
        (typeof message.builderPackageReceipt.approvalHash !== 'string' ||
          !SERIALIZED_CONTENT_HASH.test(message.builderPackageReceipt.approvalHash)))
    ) {
      return 'builderPackageReceipt is invalid';
    }
  }
  if (
    !validBoundedArray(
      message.reviewerDecisions,
      MAX_AUDIT_PROPOSAL_ITEMS,
      validAuditReviewerDecision
    )
  ) {
    return 'reviewerDecisions is invalid';
  }
  if (message.kind === 'proposal-teul' && (!message.proposalStrategy || !message.proposalHash)) {
    return 'proposal export requires proposalStrategy and proposalHash';
  }
  if (
    message.kind === 'builder-package' &&
    (!message.builderPackageReceipt ||
      message.proposalStrategy !== undefined ||
      message.proposalHash !== undefined ||
      (Array.isArray(message.reviewerDecisions) && message.reviewerDecisions.length !== 0))
  ) {
    return 'builder package export requires only its immutable receipt';
  }
  if (message.kind !== 'builder-package' && message.builderPackageReceipt !== undefined) {
    return 'builderPackageReceipt is only valid for builder package export';
  }
  if (
    message.kind === 'builder-package' &&
    (typeof message.sourceHash !== 'string' || !SERIALIZED_CONTENT_HASH.test(message.sourceHash))
  ) {
    return 'builder package sourceHash must be a canonical SHA-256 content hash';
  }
  if (
    message.kind !== 'audit' &&
    message.proposalStrategy !== undefined &&
    message.proposalHash === undefined
  ) {
    return 'proposalStrategy requires proposalHash';
  }
  if (message.proposalHash !== undefined && message.proposalStrategy === undefined) {
    return 'proposalHash requires proposalStrategy';
  }
  if (
    (message.kind === 'source-teul' || message.kind === 'source-dtcg') &&
    (message.proposalStrategy !== undefined || message.proposalHash !== undefined)
  ) {
    return 'source token exports cannot include proposal fields';
  }
  return null;
}

function validateScaleStep(value: unknown): value is { step: number; hex: string } {
  return (
    isRecord(value) &&
    isIntegerInRange(value.step, 1, 12) &&
    typeof value.hex === 'string' &&
    SERIALIZED_HEX_COLOR.test(value.hex)
  );
}

function validateScaleValidation(value: unknown, steps: { step: number; hex: string }[]): boolean {
  if (
    !isRecord(value) ||
    value.valid !== true ||
    value.anchorPreserved !== true ||
    value.finite !== true ||
    value.inSrgbGamut !== true ||
    value.monotonicLightness !== true ||
    value.monotonicRelativeLuminance !== true ||
    value.uniqueAdjacentSteps !== true ||
    value.requiredContrastPass !== true ||
    !Array.isArray(value.gamutMappedSteps) ||
    !value.gamutMappedSteps.every(step => isIntegerInRange(step, 1, 12)) ||
    new Set(value.gamutMappedSteps).size !== value.gamutMappedSteps.length ||
    !Array.isArray(value.issues) ||
    value.issues.length !== 0 ||
    !Array.isArray(value.contrast) ||
    value.contrast.length !== 3
  ) {
    return false;
  }

  const expectedChecks = [
    { foregroundStep: 9, backgroundStep: 1, minimumRatio: 3, required: false },
    { foregroundStep: 11, backgroundStep: 1, minimumRatio: 4.5, required: true },
    { foregroundStep: 12, backgroundStep: 1, minimumRatio: 7, required: true },
  ];

  return value.contrast.every((check, index) => {
    if (!isRecord(check)) return false;
    const expected = expectedChecks[index];
    const ratio = calculateContrastRatio(
      steps[expected.foregroundStep - 1].hex,
      steps[expected.backgroundStep - 1].hex
    );
    return (
      check.foregroundStep === expected.foregroundStep &&
      check.backgroundStep === expected.backgroundStep &&
      check.minimumRatio === expected.minimumRatio &&
      check.required === expected.required &&
      isBoundedString(check.useCase) &&
      isFiniteNumberInRange(check.ratio, 1, 21) &&
      Math.abs(check.ratio - ratio) < 0.001 &&
      check.pass === ratio >= expected.minimumRatio
    );
  });
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return getLuminance(r, g, b);
}

function validateFinalCustomScale(
  steps: { step: number; hex: string }[],
  mode: 'light' | 'dark'
): boolean {
  const direction = mode === 'light' ? -1 : 1;

  for (let index = 1; index < steps.length; index++) {
    const previous = steps[index - 1];
    const current = steps[index];
    if (previous.hex.toLowerCase() === current.hex.toLowerCase()) return false;

    const lightnessChange = hexToOklch(current.hex).l - hexToOklch(previous.hex).l;
    const luminanceChange = relativeLuminance(current.hex) - relativeLuminance(previous.hex);
    if (
      lightnessChange * direction <= SCALE_EPSILON ||
      luminanceChange * direction <= SCALE_EPSILON
    ) {
      return false;
    }
  }

  return (
    calculateContrastRatio(steps[10].hex, steps[0].hex) >= 4.5 &&
    calculateContrastRatio(steps[11].hex, steps[0].hex) >= 7
  );
}

function validateScale(
  value: unknown,
  expectedMode: 'light' | 'dark',
  systemScaleMethod: 'custom' | 'radix-match' | 'wcag-constrained',
  scaleKey: string
): boolean {
  if (
    !isRecord(value) ||
    !isBoundedString(value.name) ||
    !isBoundedString(value.role) ||
    !Array.isArray(value.steps) ||
    value.steps.length !== 12 ||
    !value.steps.every(validateScaleStep) ||
    value.steps.some((step, index) => step.step !== index + 1) ||
    value.profile !== 'sRGB' ||
    value.mode !== expectedMode ||
    !isOneOf(value.method, COLOR_SCALE_METHODS) ||
    (value.sourceVersion !== undefined && !isBoundedString(value.sourceVersion)) ||
    (value.sourceFamily !== undefined && !isBoundedString(value.sourceFamily)) ||
    (value.sourceInputHex !== undefined &&
      (typeof value.sourceInputHex !== 'string' ||
        !SERIALIZED_HEX_COLOR.test(value.sourceInputHex)))
  ) {
    return false;
  }

  const expectedMethod =
    systemScaleMethod === 'radix-match' || scaleKey === 'neutral'
      ? 'Radix Colors'
      : 'Teul OKLCH v3';
  if (value.method !== expectedMethod) return false;

  const hasRadixSourceMetadata =
    value.sourceVersion !== undefined ||
    value.sourceFamily !== undefined ||
    value.sourceInputHex !== undefined;

  if (value.method === 'Radix Colors') {
    return (
      value.validation === undefined &&
      isExactRadixScale(value.sourceVersion, value.sourceFamily, value.mode, value.steps) &&
      (systemScaleMethod !== 'radix-match' ||
        (scaleKey === 'neutral'
          ? value.sourceInputHex === undefined
          : doesRadixSourceInputMatchFamily(value.sourceInputHex, value.sourceFamily)))
    );
  }

  if (hasRadixSourceMetadata) return false;

  return (
    validateScaleValidation(value.validation, value.steps) &&
    validateFinalCustomScale(value.steps, expectedMode) &&
    isExactTeulGeneratedScale(value)
  );
}

function validateScaleMap(
  value: unknown,
  expectedMode: 'light' | 'dark',
  systemScaleMethod: 'custom' | 'radix-match' | 'wcag-constrained'
): boolean {
  if (!isRecord(value)) return false;

  const entries = Object.entries(value);
  if (
    entries.length === 0 ||
    entries.length > MAX_COLOR_SCALES ||
    !Object.prototype.hasOwnProperty.call(value, 'neutral')
  ) {
    return false;
  }

  return (
    entries.every(
      ([key, scale]) =>
        isBoundedString(key) &&
        SCALE_KEY.test(key) &&
        (scale === undefined || validateScale(scale, expectedMode, systemScaleMethod, key))
    ) && validateScale(value.neutral, expectedMode, systemScaleMethod, 'neutral')
  );
}

function validateScalesContainer(
  value: unknown,
  includeDarkMode: boolean,
  systemScaleMethod: 'custom' | 'radix-match' | 'wcag-constrained'
): boolean {
  return (
    isRecord(value) &&
    validateScaleMap(value.light, 'light', systemScaleMethod) &&
    (value.dark === undefined || validateScaleMap(value.dark, 'dark', systemScaleMethod)) &&
    (!includeDarkMode || validateScaleMap(value.dark, 'dark', systemScaleMethod))
  );
}

function validateCreateStylesData(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.systemName) &&
    typeof value.includeDarkMode === 'boolean' &&
    isOneOf(value.scaleMethod, SCALE_METHODS) &&
    validateScalesContainer(value.scales, value.includeDarkMode, value.scaleMethod)
  );
}

function validateColorSystemData(value: unknown): boolean {
  return (
    validateCreateStylesData(value) &&
    isRecord(value) &&
    isOneOf(value.detailLevel, DETAIL_LEVELS) &&
    isOneOf(value.scaleMethod, SCALE_METHODS) &&
    (value.documentColorProfile === undefined ||
      isOneOf(value.documentColorProfile, DOCUMENT_COLOR_PROFILES)) &&
    (value.multiSelectMode === undefined || typeof value.multiSelectMode === 'boolean') &&
    (value.colorCounts === undefined || validateColorCounts(value.colorCounts)) &&
    validateSemanticColorPolicy(value)
  );
}

function validateSemanticColorPolicy(value: UnknownRecord): boolean {
  if (value.scaleMethod !== 'wcag-constrained') return value.semanticPolicy === undefined;
  if (
    !isRecord(value.scales) ||
    !isRecord(value.scales.light) ||
    value.semanticPolicy === undefined
  ) {
    return false;
  }

  return isSemanticColorPolicyCurrent(
    value.scales.light as Parameters<typeof isSemanticColorPolicyCurrent>[0],
    value.scales.dark as Parameters<typeof isSemanticColorPolicyCurrent>[1],
    value.semanticPolicy
  );
}

function validateColorCounts(value: unknown): boolean {
  return (
    isRecord(value) && COLOR_ROLES.every(role => isIntegerInRange(value[role], 0, MAX_COLOR_SCALES))
  );
}

function validateColorSystemConfig(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !Array.isArray(value.sourceColors) ||
    value.sourceColors.length > MAX_COLOR_SCALES ||
    !value.sourceColors.every(validateColor) ||
    !Array.isArray(value.roleAssignments) ||
    value.roleAssignments.length > MAX_COLOR_SCALES ||
    !isOneOf(value.scaleMethod, SCALE_METHODS) ||
    !isOneOf(value.neutralFamily, NEUTRAL_FAMILIES) ||
    !isOneOf(value.detailLevel, DETAIL_LEVELS) ||
    typeof value.includeDarkMode !== 'boolean' ||
    !isBoundedString(value.systemName) ||
    !isOneOf(value.documentColorProfile, DOCUMENT_COLOR_PROFILES)
  ) {
    return false;
  }

  const sourceColors = new Set(
    value.sourceColors.map(source => {
      const record = source as UnknownRecord;
      return `${String(record.hex).toLowerCase()}\u0000${String(record.name)}`;
    })
  );

  return value.roleAssignments.every(assignment => {
    const record = assignment as UnknownRecord;
    if (
      !validateColor(assignment) ||
      !isRecord(assignment) ||
      (record.role !== null && !isOneOf(record.role, COLOR_ROLES))
    ) {
      return false;
    }
    return (
      sourceColors.has(`${String(record.hex).toLowerCase()}\u0000${String(record.name)}`) &&
      (record.roles === undefined ||
        (Array.isArray(record.roles) &&
          record.roles.length <= COLOR_ROLES.length &&
          record.roles.every(role => isOneOf(role, COLOR_ROLES)) &&
          new Set(record.roles).size === record.roles.length))
    );
  });
}

function validateCustomScaleAnchors(config: UnknownRecord, scalesData: UnknownRecord): boolean {
  if (
    !Array.isArray(config.roleAssignments) ||
    !isRecord(scalesData.scales) ||
    !isRecord(scalesData.scales.light)
  ) {
    return false;
  }

  const roleAssignments = config.roleAssignments.filter(isRecord);
  const validateMapAnchors = (scaleMap: unknown) => {
    if (!isRecord(scaleMap)) return false;

    return Object.entries(scaleMap).every(([key, scale]) => {
      if (!isRecord(scale) || scale.method !== 'Teul OKLCH v3') return true;
      if (!Array.isArray(scale.steps) || !isRecord(scale.steps[8])) return false;
      const role = /^(primary|secondary|tertiary|accent)/.exec(key)?.[1];
      if (!role || typeof scale.steps[8].hex !== 'string') return false;
      const anchorHex = scale.steps[8].hex.toLowerCase();

      return roleAssignments.some(assignment => {
        const roles = Array.isArray(assignment.roles) ? assignment.roles : [];
        return (
          typeof assignment.hex === 'string' &&
          assignment.hex.toLowerCase() === anchorHex &&
          (assignment.role === role || roles.includes(role))
        );
      });
    });
  };

  return (
    validateMapAnchors(scalesData.scales.light) &&
    (scalesData.scales.dark === undefined || validateMapAnchors(scalesData.scales.dark))
  );
}

function validateGenerateColorSystem(message: UnknownRecord): string | null {
  if (!isBoundedString(message.requestId, 128)) {
    return 'requestId must be a non-empty bounded string';
  }
  if (typeof message.createStyles !== 'boolean') return 'createStyles must be a boolean';
  if (typeof message.createVariables !== 'boolean') return 'createVariables must be a boolean';
  if (
    message.collisionPolicy !== undefined &&
    !isOneOf(message.collisionPolicy, COLOR_COLLISION_POLICIES)
  ) {
    return 'collisionPolicy must be cancel, update-local, or create-copy';
  }
  if (!validateColorSystemConfig(message.config)) {
    return 'config must be valid color system configuration';
  }
  if (!validateColorSystemData(message.scales)) return 'scales must be valid color system data';
  if (
    !isRecord(message.config) ||
    !isRecord(message.scales) ||
    message.config.systemName !== message.scales.systemName ||
    message.config.scaleMethod !== message.scales.scaleMethod ||
    message.config.detailLevel !== message.scales.detailLevel ||
    message.config.includeDarkMode !== message.scales.includeDarkMode ||
    message.config.documentColorProfile !== message.scales.documentColorProfile
  ) {
    return 'config must match scales';
  }
  if (!validateCustomScaleAnchors(message.config, message.scales)) {
    return 'custom scale anchors must match assigned source colors';
  }
  return null;
}

export function validateUIToPluginMessage(message: unknown): MessageValidationResult {
  if (!isRecord(message)) return invalid('message must be an object');
  if (!isBoundedString(message.type, 64)) return invalid('message type must be a bounded string');

  let error: string | null;

  switch (message.type) {
    case 'apply-fill':
    case 'apply-stroke':
    case 'create-style':
      error = validateColorOperation(message);
      break;
    case 'get-selection-for-grid':
      error = validateGetSelectionForGrid(message);
      break;
    case 'capture-selected-grid':
      error = isBoundedString(message.requestId, 128)
        ? null
        : 'requestId must be a non-empty bounded string';
      break;
    case 'get-document-color-profile':
      error = null;
      break;
    case 'get-historical-color-data': {
      const historicalValidation = validateHistoricalColorDataRequest(message);
      error = historicalValidation.valid ? null : historicalValidation.error;
      break;
    }
    case 'get-selection-for-accessibility':
      error = isBoundedString(message.requestId, 128)
        ? null
        : 'requestId must be a non-empty bounded string';
      break;
    case 'get-grid-storage':
    case 'set-grid-storage':
    case 'delete-grid-storage':
      error = validateGridStorageRequest(message);
      break;
    case 'get-workspace-storage':
    case 'set-workspace-storage':
      error = validateWorkspaceStorageRequest(message);
      break;
    case 'apply-gradient':
      error = validateGradient(message);
      break;
    case 'notify':
      error = isBoundedString(message.text, MAX_NOTIFICATION_LENGTH)
        ? null
        : 'text must be a non-empty bounded string';
      break;
    case 'generate-color-system':
      error = validateGenerateColorSystem(message);
      break;
    case 'analyze-color-system':
      error = validateAnalyzeColorSystem(message);
      break;
    case 'generate-color-system-strategies':
      error = validateGenerateColorSystemStrategies(message);
      break;
    case 'select-color-system-strategy':
      error = validateSelectColorSystemStrategy(message);
      break;
    case 'import-structured-color-system':
      error = validateImportStructuredColorSystem(message);
      break;
    case 'import-color-system-builder-package':
      error = validateImportColorSystemBuilderPackage(message);
      break;
    case 'rebuild-color-system-builder-package':
      error = validateRebuildColorSystemBuilderPackage(message);
      break;
    case 'cancel-color-system-analysis':
      error = validateCancelColorSystemAnalysis(message);
      break;
    case 'clear-color-system-audit-session':
      error =
        hasOnlyKeys(message, ['type', 'sourceHash']) &&
        (message.sourceHash === undefined || isBoundedString(message.sourceHash, 256))
          ? null
          : 'sourceHash must be a bounded string when provided';
      break;
    case 'update-color-system-declared-pairs':
      error = validateUpdateColorSystemDeclaredPairs(message);
      break;
    case 'approve-color-system-proposal':
      error = validateApproveColorSystemProposal(message);
      break;
    case 'confirm-color-system-proposal':
      error = validateConfirmColorSystemProposal(message);
      break;
    case 'apply-color-system-proposal':
      error = validateApplyColorSystemProposal(message);
      break;
    case 'export-color-system-artifact':
      error = validateExportColorSystemArtifact(message);
      break;
    case 'analyze-intelligent-color-system-v2':
    case 'create-intelligent-color-system-v2':
    case 'analyze-generic-color-system-v2':
    case 'cancel-generic-color-system-v2':
    case 'confirm-generic-color-system-plan-v2': {
      const result = validateColorSystemBuilderV2UIMessage(message);
      if (!result.valid) return invalid(result.error);
      return valid(result.message as unknown as UnknownRecord);
    }
    case 'create-grid-frame':
      error = validateCreateGridFrame(message);
      break;
    case 'apply-grid':
      error = validateApplyGrid(message);
      break;
    case 'clear-grid':
      error = validateClearGrid(message);
      break;
    default:
      return invalid(`unsupported message type: ${message.type}`);
  }

  return error ? invalid(`${message.type}: ${error}`) : valid(message);
}

function validPlugin(message: UnknownRecord): PluginMessageValidationResult {
  return { valid: true, message: message as unknown as PluginToUIMessage };
}

function invalidPlugin(error: string): PluginMessageValidationResult {
  return { valid: false, error };
}

function optionalBoundedString(value: unknown, maxLength = MAX_TEXT_LENGTH): boolean {
  return value === undefined || isBoundedString(value, maxLength);
}

function validResultEnvelope(message: UnknownRecord): boolean {
  return isBoundedString(message.requestId, 128) && typeof message.success === 'boolean';
}

function validSelectionTarget(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.id, MAX_TARGET_ID_LENGTH) &&
    isBoundedString(value.name) &&
    isFiniteNumberInRange(value.width, 0, MAX_DIMENSION) &&
    isFiniteNumberInRange(value.height, 0, MAX_DIMENSION) &&
    isIntegerInRange(value.layoutGridCount, 0, MAX_GRID_COUNT) &&
    (value.teulConstructionCount === undefined ||
      isIntegerInRange(value.teulConstructionCount, 0, MAX_GRID_COUNT))
  );
}

function validNonNegativeCount(value: unknown): boolean {
  return isIntegerInRange(value, 0, MAX_COLOR_SCALES * MAX_GRID_TARGETS);
}

function validBoundedArray(
  value: unknown,
  maximum: number,
  validator: (item: unknown) => boolean
): value is unknown[] {
  return Array.isArray(value) && value.length <= maximum && value.every(validator);
}

function validBoundedStringArray(value: unknown, maximum: number): value is string[] {
  return validBoundedArray(value, maximum, item => isBoundedString(item, 256));
}

function validEvidenceLocator(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(value.kind, [
      'figma-resource',
      'figma-node',
      'token-path',
      'document-page',
      'manual',
    ] as const) &&
    isBoundedString(value.locator, MAX_NOTIFICATION_LENGTH) &&
    optionalBoundedString(value.detail, MAX_NOTIFICATION_LENGTH)
  );
}

function validEvidenceList(value: unknown): boolean {
  return validBoundedArray(value, MAX_AUDIT_EVIDENCE_ITEMS, validEvidenceLocator);
}

function validNormalizedComponents(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(component => isFiniteNumberInRange(component, 0, 1))
  );
}

function normalizedComponentsMatchHex(components: [number, number, number], hex: string): boolean {
  const expected = `#${components
    .map(component =>
      Math.round(component * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
  return expected === hex.toLowerCase();
}

function validSourceColorValue(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isOneOf(value.colorSpace, ['srgb', 'display-p3'] as const) ||
    (value.hex !== undefined &&
      (typeof value.hex !== 'string' || !SERIALIZED_HEX_COLOR.test(value.hex))) ||
    !validNormalizedComponents(value.components) ||
    !isFiniteNumberInRange(value.alpha, 0, 1)
  ) {
    return false;
  }
  return !(
    value.colorSpace === 'srgb' &&
    typeof value.hex === 'string' &&
    !normalizedComponentsMatchHex(value.components, value.hex)
  );
}

function validStringRecord(
  value: unknown,
  maximumKeys: number,
  validator: (entry: unknown) => boolean
): value is UnknownRecord {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= maximumKeys &&
    entries.every(([key, entry]) => isBoundedString(key, 256) && validator(entry))
  );
}

function validRoleEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.role, 256) &&
    isOneOf(value.status, ['verified', 'inferred', 'unresolved'] as const) &&
    (value.confidence === null || isFiniteNumberInRange(value.confidence, 0, 1)) &&
    validEvidenceList(value.evidence) &&
    isOneOf(value.reviewerDisposition, ['confirmed', 'rejected', 'pending'] as const) &&
    (value.protectedAnchor === undefined || typeof value.protectedAnchor === 'boolean')
  );
}

function validSourceColorToken(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isBoundedString(value.id, 256) ||
    !isBoundedString(value.name, 256) ||
    !validBoundedStringArray(value.path, MAX_AUDIT_PATH_SEGMENTS) ||
    !optionalBoundedString(value.description, MAX_NOTIFICATION_LENGTH) ||
    !optionalBoundedString(value.modeGroupId, 256) ||
    !validStringRecord(value.valuesByMode, MAX_AUDIT_MODES, validSourceColorValue) ||
    !validEvidenceList(value.evidence) ||
    !validBoundedArray(value.roleEvidence, 128, validRoleEvidence)
  ) {
    return false;
  }

  if (
    value.aliasTargetsByMode !== undefined &&
    !validStringRecord(value.aliasTargetsByMode, MAX_AUDIT_MODES, target =>
      isBoundedString(target, 256)
    )
  ) {
    return false;
  }

  return (
    optionalBoundedString(value.aliasTargetId, 256) &&
    (value.scalePosition === undefined ||
      (isRecord(value.scalePosition) &&
        isBoundedString(value.scalePosition.scaleId, 256) &&
        isIntegerInRange(value.scalePosition.step, 1, 10_000)))
  );
}

function validSourceColorUsage(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.id, 256) &&
    optionalBoundedString(value.tokenId, 256) &&
    isBoundedString(value.mode, 256) &&
    validSourceColorValue(value.value) &&
    isIntegerInRange(value.count, 0, Number.MAX_SAFE_INTEGER) &&
    validEvidenceList(value.evidence)
  );
}

function validUnsupportedColorUsage(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.id, 256) &&
    isOneOf(value.reason, [
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
    isIntegerInRange(value.count, 0, Number.MAX_SAFE_INTEGER) &&
    isBoundedString(value.detail, MAX_NOTIFICATION_LENGTH) &&
    validEvidenceList(value.evidence)
  );
}

function validDeclaredColorReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['tokenId', 'alpha']) &&
    isBoundedString(value.tokenId, 256) &&
    (value.alpha === undefined || isFiniteNumberInRange(value.alpha, 0, 1))
  );
}

function validDeclaredPair(value: unknown): boolean {
  if (
    !(
      isRecord(value) &&
      hasOnlyKeys(value, [
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
      isBoundedString(value.id, 256) &&
      validDeclaredColorReference(value.foreground) &&
      validDeclaredColorReference(value.background) &&
      (value.underlayHex === undefined ||
        (typeof value.underlayHex === 'string' && SERIALIZED_HEX_COLOR.test(value.underlayHex))) &&
      isBoundedString(value.mode, 256) &&
      isBoundedString(value.useCase, MAX_NOTIFICATION_LENGTH) &&
      isOneOf(value.category, ['normal-text', 'large-text', 'non-text'] as const) &&
      isOneOf(value.requiredLevel, ['AA', 'AAA'] as const) &&
      (value.textSizePt === undefined || isFiniteNumberInRange(value.textSizePt, 0, 10_000)) &&
      (value.textWeight === undefined || isFiniteNumberInRange(value.textWeight, 1, 1_000))
    )
  ) {
    return false;
  }
  if (value.category === 'non-text' && value.requiredLevel !== 'AA') return false;
  if (value.category === 'large-text') {
    if (typeof value.textSizePt !== 'number') return false;
    if (
      value.textSizePt < 18 &&
      !(value.textSizePt >= 14 && typeof value.textWeight === 'number' && value.textWeight >= 700)
    ) {
      return false;
    }
  }
  return true;
}

function _validSourceSystemSnapshot(value: unknown): value is UnknownRecord {
  return (
    isRecord(value) &&
    value.schemaVersion === '1.0.0' &&
    isBoundedString(value.sourceHash, 256) &&
    isOneOf(value.sourceKind, [
      'figma-document',
      'dtcg-tokens',
      'teul-json',
      'guideline-draft',
    ] as const) &&
    isBoundedString(value.sourceLocator, MAX_NOTIFICATION_LENGTH) &&
    validateSnapshotAuthorization(value.authorization) &&
    isOneOf(value.documentProfile, DOCUMENT_COLOR_PROFILES) &&
    isRecord(value.resourceScope) &&
    isOneOf(value.resourceScope.kind, ['all-local-resources', 'structured-input'] as const) &&
    isIntegerInRange(value.resourceScope.localVariableCount, 0, MAX_AUDIT_RESOURCE_ITEMS) &&
    isIntegerInRange(value.resourceScope.localStyleCount, 0, MAX_AUDIT_RESOURCE_ITEMS) &&
    isOneOf(value.usageScope, [...AUDIT_USAGE_SCOPES, 'not-applicable'] as const) &&
    isBoundedString(value.capturedAt, 128) &&
    validateUniqueBoundedStrings(value.modes, MAX_AUDIT_MODES) &&
    validBoundedArray(value.tokens, MAX_AUDIT_RESOURCE_ITEMS, validSourceColorToken) &&
    validBoundedArray(value.supportedUsage, MAX_AUDIT_USAGE_ITEMS, validSourceColorUsage) &&
    validBoundedArray(value.unsupportedUsage, MAX_AUDIT_USAGE_ITEMS, validUnsupportedColorUsage) &&
    validBoundedArray(value.declaredPairs, MAX_AUDIT_PROPOSAL_ITEMS, validDeclaredPair)
  );
}

function validAccessibilityPairEndpoint(value: unknown, allowUnresolved: boolean): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'sourceHex',
      'sourceComponents',
      'alpha',
      'compositedComponents',
      'compositedHex',
    ]) ||
    !isFiniteNumberInRange(value.alpha, 0, 1)
  ) {
    return false;
  }
  const sourceHexValid =
    typeof value.sourceHex === 'string' && SERIALIZED_HEX_COLOR.test(value.sourceHex);
  const sourceComponentsValid = validNormalizedComponents(value.sourceComponents);
  const compositeHexValid =
    typeof value.compositedHex === 'string' && SERIALIZED_HEX_COLOR.test(value.compositedHex);
  const compositeComponentsValid = validNormalizedComponents(value.compositedComponents);
  if (
    !allowUnresolved &&
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
    !normalizedComponentsMatchHex(
      value.sourceComponents as [number, number, number],
      value.sourceHex as string
    )
  ) {
    return false;
  }
  return !(
    compositeHexValid &&
    compositeComponentsValid &&
    !normalizedComponentsMatchHex(
      value.compositedComponents as [number, number, number],
      value.compositedHex as string
    )
  );
}

function validAccessibilityPairEvidence(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isBoundedString(value.id, 256) ||
    !isOneOf(value.status, ['tested', 'unsupported'] as const) ||
    !validAccessibilityPairEndpoint(value.foreground, value.status === 'unsupported') ||
    !validAccessibilityPairEndpoint(value.background, value.status === 'unsupported') ||
    (value.underlayHex !== undefined &&
      (typeof value.underlayHex !== 'string' || !SERIALIZED_HEX_COLOR.test(value.underlayHex))) ||
    !isBoundedString(value.mode, 256) ||
    !isBoundedString(value.useCase, MAX_NOTIFICATION_LENGTH) ||
    !isOneOf(value.category, ['normal-text', 'large-text', 'non-text'] as const) ||
    !isOneOf(value.requiredLevel, ['AA', 'AAA'] as const) ||
    value.method !== 'WCAG 2.2 sRGB contrast ratio' ||
    (value.textSizePt !== undefined && !isFiniteNumberInRange(value.textSizePt, 0, 10_000)) ||
    (value.textWeight !== undefined && !isFiniteNumberInRange(value.textWeight, 1, 1_000))
  ) {
    return false;
  }

  if (value.category === 'non-text' && value.requiredLevel !== 'AA') return false;
  if (value.category === 'large-text') {
    if (typeof value.textSizePt !== 'number') return false;
    if (
      value.textSizePt < 18 &&
      !(value.textSizePt >= 14 && typeof value.textWeight === 'number' && value.textWeight >= 700)
    ) {
      return false;
    }
  }

  return value.status === 'tested'
    ? isFiniteNumberInRange(value.ratio, 1, 21) &&
        isFiniteNumberInRange(value.threshold, 0, 21) &&
        typeof value.pass === 'boolean'
    : isBoundedString(value.unsupportedReason, MAX_NOTIFICATION_LENGTH);
}

function validModuleCoverage(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(value.module, [
      'brand-marketing',
      'product-primitives',
      'product-semantics',
      'data-visualization',
      'illustration',
    ] as const) &&
    validBoundedStringArray(value.coveredRoles, MAX_AUDIT_PROPOSAL_ITEMS) &&
    validBoundedStringArray(value.missingRoles, MAX_AUDIT_PROPOSAL_ITEMS) &&
    isOneOf(value.status, ['covered', 'partial', 'unknown'] as const)
  );
}

function validColorSystemDiagnostic(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.id, 256) &&
    isOneOf(value.code, [
      'DUPLICATE_COLOR',
      'NEAR_DUPLICATE_COLOR',
      'ALIAS_TARGET_MISSING',
      'ALIAS_CYCLE',
      'ALIAS_LITERAL_DIVERGENCE',
      'MISSING_MODE',
      'UNEVEN_SCALE',
      'UNCOVERED_ROLE',
      'INACCESSIBLE_DECLARED_PAIR',
      'CONTEXT_DEPENDENT_COLOR',
      'AUDIT_EVIDENCE_TRUNCATED',
      'UNSUPPORTED_PROFILE',
    ] as const) &&
    isOneOf(value.severity, ['info', 'warning', 'blocking'] as const) &&
    isOneOf(value.classification, [
      'observation',
      'potential-gap',
      'confirmed-defect',
      'unsupported',
    ] as const) &&
    isBoundedString(value.message, MAX_NOTIFICATION_LENGTH) &&
    validBoundedStringArray(value.tokenIds, MAX_AUDIT_PROPOSAL_ITEMS) &&
    optionalBoundedString(value.mode, 256) &&
    validEvidenceList(value.evidence)
  );
}

function _validColorSystemAudit(value: unknown): value is UnknownRecord {
  return (
    isRecord(value) &&
    value.schemaVersion === '1.0.0' &&
    isBoundedString(value.engineVersion, 128) &&
    value.diagnosticPolicyVersion === 'teul-color-diagnostics-v1' &&
    isBoundedString(value.sourceHash, 256) &&
    validBoundedArray(value.diagnostics, MAX_AUDIT_DIAGNOSTICS, validColorSystemDiagnostic) &&
    validBoundedArray(value.moduleCoverage, 5, validModuleCoverage) &&
    validBoundedArray(
      value.declaredPairTests,
      MAX_AUDIT_PROPOSAL_ITEMS,
      validAccessibilityPairEvidence
    ) &&
    validBoundedStringArray(value.unresolvedQuestions, MAX_AUDIT_DIAGNOSTICS) &&
    isBoundedString(value.auditHash, 256)
  );
}

function validProposalBlocker(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(value.code, [
      'NO_SUITABLE_EXACT_MATCH',
      'ROLE_CONFIRMATION_REQUIRED',
      'UNSUPPORTED_LOCKED_ANCHOR_POSITION',
      'CONFLICTING_LOCKED_ANCHORS',
      'INVALID_GENERATED_SCALE',
      'UNSUPPORTED_COLOR_PROFILE',
      'MISSING_PRODUCT_ROLE',
      'INACCESSIBLE_SEMANTIC_PAIR',
      'INACCESSIBLE_PROTECTED_ANCHOR',
      'NO_SUITABLE_VIZ_PALETTE',
      'AUDIT_EVIDENCE_TRUNCATED',
    ] as const) &&
    isBoundedString(value.message, MAX_NOTIFICATION_LENGTH) &&
    validBoundedStringArray(value.sourceTokenIds, MAX_AUDIT_ANCHORS) &&
    validBoundedStringArray(value.alternatives, 128)
  );
}

function validProposedTokenProvenance(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'source-preserved') {
    return (
      validBoundedStringArray(value.sourceTokenIds, MAX_AUDIT_ANCHORS) &&
      value.sourceTokenIds.length === 1 &&
      isBoundedString(value.sourceTokenId, 256) &&
      value.sourceTokenIds[0] === value.sourceTokenId &&
      isBoundedString(value.sourceMode, 256) &&
      typeof value.sourceHex === 'string' &&
      SERIALIZED_HEX_COLOR.test(value.sourceHex) &&
      ((value.sourceComponents === undefined && value.sourceAlpha === undefined) ||
        (Array.isArray(value.sourceComponents) &&
          value.sourceComponents.length === 3 &&
          value.sourceComponents.every(component => isFiniteNumberInRange(component, 0, 1)) &&
          isFiniteNumberInRange(value.sourceAlpha, 0, 1)))
    );
  }
  if (value.kind === 'exact-radix') {
    return (
      isBoundedString(value.packageVersion, 128) &&
      isBoundedString(value.family, 256) &&
      isOneOf(value.mode, ['light', 'dark'] as const) &&
      isIntegerInRange(value.step, 1, 12)
    );
  }
  if (value.kind === 'teul-harmony-generated') {
    return (
      value.policyVersion === 'teul-secondary-strategy-v1' &&
      value.scaleAlgorithmVersion === 'Teul OKLCH v3' &&
      value.gamutMapping === 'CSS Color 4 Local MINDE' &&
      isBoundedString(value.sourceTokenId, 256) &&
      isBoundedString(value.sourceMode, 256) &&
      typeof value.sourceHex === 'string' &&
      SERIALIZED_HEX_COLOR.test(value.sourceHex) &&
      isOneOf(value.direction, COLOR_SYSTEM_STRATEGY_DIRECTIONS) &&
      isIntegerInRange(value.familyIndex, 1, 2) &&
      isFiniteNumberInRange(value.hueOffsetDegrees, -360, 360) &&
      typeof value.seedHex === 'string' &&
      SERIALIZED_HEX_COLOR.test(value.seedHex) &&
      isOneOf(value.mode, ['light', 'dark'] as const) &&
      isIntegerInRange(value.step, 1, 12) &&
      typeof value.gamutMapped === 'boolean' &&
      validOklchReceipt(value.requestedOklch) &&
      validOklchReceipt(value.mappedOklch)
    );
  }
  return (
    value.kind === 'teul-generated' &&
    value.algorithmVersion === 'Teul OKLCH v3' &&
    validBoundedStringArray(value.sourceTokenIds, MAX_AUDIT_ANCHORS) &&
    value.anchorStep === 9
  );
}

function validOklchReceipt(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumberInRange(value.l, 0, 1) &&
    typeof value.c === 'number' &&
    Number.isFinite(value.c) &&
    value.c >= 0 &&
    typeof value.h === 'number' &&
    Number.isFinite(value.h) &&
    value.h >= 0 &&
    value.h < 360
  );
}

function validProposedColorToken(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isBoundedString(value.id, 256) ||
    !isBoundedString(value.name, 256) ||
    !validBoundedStringArray(value.path, MAX_AUDIT_PATH_SEGMENTS) ||
    !isOneOf(value.namespace, [
      'brand-marketing',
      'product-primitives',
      'product-semantics',
      'data-visualization',
      'illustration',
    ] as const) ||
    !validStringRecord(
      value.valuesByMode,
      MAX_AUDIT_MODES,
      entry => typeof entry === 'string' && SERIALIZED_HEX_COLOR.test(entry)
    ) ||
    !validStringRecord(value.provenanceByMode, MAX_AUDIT_MODES, validProposedTokenProvenance) ||
    (value.exactSourceValuesByMode !== undefined &&
      !validStringRecord(
        value.exactSourceValuesByMode,
        MAX_AUDIT_MODES,
        entry => validSourceColorValue(entry) && isRecord(entry) && entry.colorSpace === 'srgb'
      )) ||
    (value.sourceAliasTargetsByMode !== undefined &&
      !validStringRecord(value.sourceAliasTargetsByMode, MAX_AUDIT_MODES, target =>
        isBoundedString(target, 256)
      )) ||
    !validBoundedStringArray(value.sourceRelationships, MAX_AUDIT_ANCHORS) ||
    typeof value.accessibilityConstrained !== 'boolean'
  ) {
    return false;
  }

  const modes = Object.keys(value.valuesByMode as UnknownRecord).sort();
  if (
    modes.join('\u0000') !==
    Object.keys(value.provenanceByMode as UnknownRecord)
      .sort()
      .join('\u0000')
  ) {
    return false;
  }
  const exactValues = (value.exactSourceValuesByMode ?? {}) as UnknownRecord;
  const aliasTargets = (value.sourceAliasTargetsByMode ?? {}) as UnknownRecord;
  if (
    ![...Object.keys(exactValues), ...Object.keys(aliasTargets)].every(mode => modes.includes(mode))
  ) {
    return false;
  }
  const provenances = value.provenanceByMode as UnknownRecord;
  for (const [mode, exactUnknown] of Object.entries(exactValues)) {
    if (!isRecord(exactUnknown) || !isRecord(provenances[mode])) return false;
    const provenance = provenances[mode] as UnknownRecord;
    if (
      provenance.kind !== 'source-preserved' ||
      typeof exactUnknown.hex !== 'string' ||
      typeof provenance.sourceHex !== 'string' ||
      exactUnknown.hex.toLowerCase() !== provenance.sourceHex.toLowerCase()
    ) {
      return false;
    }
    if (
      provenance.sourceComponents !== undefined &&
      JSON.stringify(provenance.sourceComponents) !== JSON.stringify(exactUnknown.components)
    ) {
      return false;
    }
    if (provenance.sourceAlpha !== undefined && provenance.sourceAlpha !== exactUnknown.alpha) {
      return false;
    }
  }
  return Object.keys(aliasTargets).every(mode => exactValues[mode] !== undefined);
}

function validProposedAlias(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.id, 256) &&
    isBoundedString(value.role, 256) &&
    isBoundedString(value.mode, 256) &&
    optionalBoundedString(value.state, 256) &&
    isBoundedString(value.targetTokenId, 256)
  );
}

function validProposalModule(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(value.namespace, [
      'brand-marketing',
      'product-primitives',
      'product-semantics',
      'data-visualization',
      'illustration',
    ] as const) &&
    validBoundedArray(value.tokens, MAX_AUDIT_PROPOSAL_ITEMS, validProposedColorToken) &&
    validBoundedArray(value.aliases, MAX_AUDIT_PROPOSAL_ITEMS, validProposedAlias) &&
    validBoundedArray(
      value.pairEvidence,
      MAX_AUDIT_PROPOSAL_ITEMS,
      validAccessibilityPairEvidence
    ) &&
    validBoundedArray(value.warnings, 128, warning =>
      isBoundedString(warning, MAX_AUDIT_EVIDENCE_STRING_LENGTH)
    )
  );
}

function validRadixAnchorMatch(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.sourceTokenId, 256) &&
    isBoundedString(value.family, 256) &&
    isOneOf(value.mode, ['light', 'dark'] as const) &&
    isIntegerInRange(value.step, 1, 12) &&
    typeof value.hex === 'string' &&
    SERIALIZED_HEX_COLOR.test(value.hex) &&
    isBoundedString(value.packageVersion, 128) &&
    isFiniteNumberInRange(value.deltaEOK, 0, 10) &&
    typeof value.exact === 'boolean'
  );
}

function validExactRadixFamilyCandidate(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.family, 256) &&
    validBoundedArray(value.anchorMatches, MAX_PROPOSAL_ANCHORS, validRadixAnchorMatch) &&
    isFiniteNumberInRange(value.maximumDeltaEOK, 0, 10) &&
    isFiniteNumberInRange(value.weightedMeanDeltaEOK, 0, 10) &&
    isIntegerInRange(value.unintendedFamilyCollisions, 0, MAX_AUDIT_PROPOSAL_ITEMS)
  );
}

function validLockedAnchor(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.sourceTokenId, 256) &&
    isBoundedString(value.name, 256) &&
    typeof value.hex === 'string' &&
    SERIALIZED_HEX_COLOR.test(value.hex) &&
    isIntegerInRange(value.step, 1, 12)
  );
}

function validScaleValidationShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    [
      value.valid,
      value.anchorPreserved,
      value.finite,
      value.inSrgbGamut,
      value.monotonicLightness,
      value.monotonicRelativeLuminance,
      value.uniqueAdjacentSteps,
      value.requiredContrastPass,
    ].every(flag => typeof flag === 'boolean') &&
    validBoundedArray(value.gamutMappedSteps, 12, step => isIntegerInRange(step, 1, 12)) &&
    validBoundedArray(
      value.contrast,
      32,
      check =>
        isRecord(check) &&
        isIntegerInRange(check.foregroundStep, 1, 12) &&
        isIntegerInRange(check.backgroundStep, 1, 12) &&
        isBoundedString(check.useCase, MAX_NOTIFICATION_LENGTH) &&
        isFiniteNumberInRange(check.minimumRatio, 0, 21) &&
        typeof check.required === 'boolean' &&
        isFiniteNumberInRange(check.ratio, 0, 21) &&
        typeof check.pass === 'boolean'
    ) &&
    validBoundedArray(
      value.issues,
      128,
      issue =>
        isRecord(issue) &&
        isOneOf(issue.code, [
          'anchor-moved',
          'duplicate-adjacent',
          'non-finite',
          'non-monotonic-lightness',
          'non-monotonic-relative-luminance',
          'required-contrast-failure',
        ] as const) &&
        isBoundedString(issue.message, MAX_NOTIFICATION_LENGTH) &&
        (issue.steps === undefined ||
          validBoundedArray(issue.steps, 12, step => isIntegerInRange(step, 1, 12)))
    )
  );
}

function validGeneratedScaleEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.id, 256) &&
    isBoundedString(value.name, 256) &&
    validLockedAnchor(value.anchor) &&
    validStringRecord(
      value.modes,
      2,
      mode =>
        isRecord(mode) &&
        validBoundedArray(mode.steps, 12, validateScaleStep) &&
        validScaleValidationShape(mode.validation)
    )
  );
}

function validColorSystemProposal(value: unknown): value is UnknownRecord {
  return (
    isRecord(value) &&
    value.schemaVersion === '1.0.0' &&
    isBoundedString(value.engineVersion, 128) &&
    isOneOf(value.strategy, PROPOSAL_STRATEGIES) &&
    isBoundedString(value.strategyVersion, 256) &&
    isOneOf(value.status, [
      'suitable-candidate',
      'closest-candidate-outside-approved-tolerance',
    ] as const) &&
    isBoundedString(value.sourceHash, 256) &&
    validateUniqueBoundedStrings(value.lockedAnchorTokenIds, MAX_PROPOSAL_ANCHORS) &&
    validBoundedArray(value.exactCandidates, 256, validExactRadixFamilyCandidate) &&
    validBoundedArray(value.generatedScales, MAX_PROPOSAL_ANCHORS, validGeneratedScaleEvidence) &&
    validBoundedArray(value.modules, 16, validProposalModule) &&
    validBoundedArray(value.moduleCoverage, 5, validModuleCoverage) &&
    validBoundedArray(
      value.pairEvidence,
      MAX_AUDIT_PROPOSAL_ITEMS,
      validAccessibilityPairEvidence
    ) &&
    validBoundedArray(value.unresolvedBlockers, 128, validProposalBlocker) &&
    validBoundedStringArray(value.warnings, MAX_AUDIT_DIAGNOSTICS) &&
    isBoundedString(value.proposalHash, 256)
  );
}

function _validProposalBundle(value: unknown, sourceHash: unknown): boolean {
  if (
    !isRecord(value) ||
    !isOneOf(value.status, [
      'suitable-candidate',
      'closest-candidate-outside-approved-tolerance',
      'no-solution',
    ] as const)
  ) {
    return false;
  }
  if (value.status === 'no-solution') {
    return (
      isOneOf(value.strategy, PROPOSAL_STRATEGIES) &&
      value.sourceHash === sourceHash &&
      Array.isArray(value.blockers) &&
      value.blockers.length > 0 &&
      validBoundedArray(value.blockers, 128, validProposalBlocker)
    );
  }
  return (
    validColorSystemProposal(value.proposal) &&
    value.proposal.status === value.status &&
    value.proposal.sourceHash === sourceHash
  );
}

function _validEnabledLibraryDescriptor(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.collectionKey, 256) &&
    isBoundedString(value.collectionName, 256) &&
    isBoundedString(value.libraryName, 256) &&
    validBoundedArray(
      value.variables,
      MAX_LIBRARY_VARIABLES,
      variable =>
        isRecord(variable) &&
        isBoundedString(variable.key, 256) &&
        isBoundedString(variable.name, 256) &&
        isOneOf(variable.resolvedType, ['BOOLEAN', 'COLOR', 'FLOAT', 'STRING'] as const)
    )
  );
}

/** Runtime validation for every plugin-to-UI message before component routing. */
export function validatePluginToUIMessage(message: unknown): PluginMessageValidationResult {
  if (!isRecord(message)) return invalidPlugin('message must be an object');
  if (!isBoundedString(message.type, 64)) return invalidPlugin('message type must be bounded');

  let validMessage = false;
  switch (message.type) {
    case 'selection-info':
      validMessage =
        (message.requestId === undefined || isBoundedString(message.requestId, 128)) &&
        typeof message.hasSelection === 'boolean' &&
        typeof message.isFrame === 'boolean' &&
        isIntegerInRange(message.selectedCount, 0, MAX_GRID_TARGETS) &&
        Array.isArray(message.eligibleTargets) &&
        message.eligibleTargets.length <= MAX_GRID_TARGETS &&
        message.eligibleTargets.every(validSelectionTarget) &&
        isIntegerInRange(message.ineligibleCount, 0, MAX_GRID_TARGETS) &&
        (message.width === undefined || isFiniteNumberInRange(message.width, 0, MAX_DIMENSION)) &&
        (message.height === undefined || isFiniteNumberInRange(message.height, 0, MAX_DIMENSION)) &&
        optionalBoundedString(message.name);
      break;
    case 'document-color-profile':
      validMessage = isOneOf(message.profile, DOCUMENT_COLOR_PROFILES);
      break;
    case 'historical-color-data-result':
      validMessage = validateHistoricalColorDataResult(message).valid;
      break;
    case 'accessibility-selection-result':
      validMessage = validResultEnvelope(message);
      if (validMessage && message.success === true) {
        validMessage =
          message.profile === 'srgb' &&
          typeof message.foreground === 'string' &&
          SERIALIZED_HEX_COLOR.test(message.foreground) &&
          typeof message.background === 'string' &&
          SERIALIZED_HEX_COLOR.test(message.background) &&
          isBoundedString(message.foregroundSource) &&
          isBoundedString(message.backgroundSource) &&
          message.error === undefined;
      } else if (validMessage) {
        validMessage =
          isOneOf(message.profile, DOCUMENT_COLOR_PROFILES) &&
          isBoundedString(message.error, MAX_NOTIFICATION_LENGTH) &&
          message.foreground === undefined &&
          message.background === undefined &&
          message.foregroundSource === undefined &&
          message.backgroundSource === undefined;
      }
      break;
    case 'color-system-operation-result':
      validMessage =
        validResultEnvelope(message) &&
        optionalBoundedString(message.message, MAX_NOTIFICATION_LENGTH) &&
        optionalBoundedString(message.outputName) &&
        (message.modes === undefined ||
          (Array.isArray(message.modes) &&
            message.modes.length <= 2 &&
            message.modes.every(mode => mode === 'Light' || mode === 'Dark'))) &&
        [
          message.primitiveCount,
          message.semanticAliasCount,
          message.styleCount,
          message.frameCount,
          message.skippedCount,
        ].every(value => value === undefined || validNonNegativeCount(value)) &&
        (message.warnings === undefined ||
          (Array.isArray(message.warnings) &&
            message.warnings.length <= 100 &&
            message.warnings.every(warning =>
              isBoundedString(warning, MAX_NOTIFICATION_LENGTH)
            ))) &&
        optionalBoundedString(message.error, MAX_NOTIFICATION_LENGTH);
      break;
    case 'intelligent-color-system-v2-progress':
    case 'intelligent-color-system-v2-analysis-result':
    case 'intelligent-color-system-v2-create-result':
    case 'generic-color-system-v2-progress':
    case 'generic-color-system-v2-plan-result':
    case 'generic-color-system-v2-confirmation-result': {
      const result = validateColorSystemBuilderV2PluginMessage(message);
      if (!result.valid) return invalidPlugin(result.error);
      return validPlugin(result.message as unknown as UnknownRecord);
    }
    case 'mutation-operation-result':
      validMessage =
        validResultEnvelope(message) &&
        isOneOf(message.operation, [
          'apply-fill',
          'apply-stroke',
          'create-style',
          'apply-gradient',
          'create-grid-frame',
        ] as const) &&
        isBoundedString(message.message, MAX_NOTIFICATION_LENGTH) &&
        optionalBoundedString(message.error, MAX_NOTIFICATION_LENGTH);
      break;
    case 'grid-applied':
      validMessage =
        validResultEnvelope(message) &&
        validNonNegativeCount(message.appliedCount) &&
        validNonNegativeCount(message.skippedCount) &&
        validNonNegativeCount(message.failedCount) &&
        isBoundedString(message.message, MAX_NOTIFICATION_LENGTH) &&
        optionalBoundedString(message.frameName) &&
        (message.frameWidth === undefined ||
          isFiniteNumberInRange(message.frameWidth, 0, MAX_DIMENSION)) &&
        (message.frameHeight === undefined ||
          isFiniteNumberInRange(message.frameHeight, 0, MAX_DIMENSION)) &&
        optionalBoundedString(message.error, MAX_NOTIFICATION_LENGTH) &&
        (message.realization === undefined ||
          (isRecord(message.realization) &&
            isOneOf(message.realization.kind, [
              'native-guides',
              'multiple-native-layers',
              'generated-geometry',
              'approximation',
            ] as const)));
      break;
    case 'grid-storage-result':
      validMessage =
        validResultEnvelope(message) &&
        isOneOf(message.operation, ['get', 'set', 'delete'] as const) &&
        (message.value === undefined ||
          message.value === null ||
          typeof message.value === 'string') &&
        optionalBoundedString(message.error, MAX_NOTIFICATION_LENGTH);
      break;
    case 'workspace-storage-result':
      validMessage =
        validResultEnvelope(message) &&
        isOneOf(message.operation, ['get', 'set'] as const) &&
        (message.value === undefined ||
          message.value === null ||
          typeof message.value === 'string') &&
        optionalBoundedString(message.error, MAX_NOTIFICATION_LENGTH);
      break;
    case 'grid-capture-result':
      validMessage =
        validResultEnvelope(message) &&
        (message.config === undefined || validateSourceGridConfig(message.config)) &&
        optionalBoundedString(message.frameName) &&
        (message.dimensions === undefined ||
          (isRecord(message.dimensions) &&
            isFiniteNumberInRange(message.dimensions.width, 1, MAX_DIMENSION) &&
            isFiniteNumberInRange(message.dimensions.height, 1, MAX_DIMENSION))) &&
        (message.nativeResources === undefined ||
          validateGridNativeResources(message.nativeResources)) &&
        optionalBoundedString(message.error, MAX_NOTIFICATION_LENGTH);
      break;
    default:
      return invalidPlugin(`unsupported message type: ${message.type}`);
  }

  return validMessage
    ? validPlugin(message)
    : invalidPlugin(`${message.type}: invalid plugin-to-UI payload`);
}
