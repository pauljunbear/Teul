import type { PluginToUIMessage, UIToPluginMessage } from '../types/messages';
import { calculateContrastRatio, getLuminance, hexToOklch, hexToRgb } from './utils';
import { isSemanticColorPolicyCurrent } from './semanticColorPolicy';
import { doesRadixSourceInputMatchFamily, isExactRadixScale } from './radixColors';
import { parseGridConstructionV2 } from './gridConstructionV2';

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
const COLOR_SCALE_METHODS = ['Teul OKLCH v2', 'Radix Colors'] as const;
const COLOR_ROLES = ['primary', 'secondary', 'tertiary', 'accent'] as const;
const COLOR_COLLISION_POLICIES = ['cancel', 'update-local', 'create-copy'] as const;
const NEUTRAL_FAMILIES = ['auto', 'gray', 'mauve', 'slate', 'sage', 'olive', 'sand'] as const;
const DOCUMENT_COLOR_PROFILES = ['legacy', 'srgb', 'display-p3', 'unknown'] as const;
const SCALE_KEY = /^(neutral|(primary|secondary|tertiary|accent)([2-9]\d*)?)$/;
const SERIALIZED_HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
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
      : 'Teul OKLCH v2';
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
    validateFinalCustomScale(value.steps, expectedMode)
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
      if (!isRecord(scale) || scale.method !== 'Teul OKLCH v2') return true;
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
    case 'accessibility-selection-result':
      validMessage =
        validResultEnvelope(message) &&
        isOneOf(message.profile, DOCUMENT_COLOR_PROFILES) &&
        optionalBoundedString(message.foreground) &&
        optionalBoundedString(message.background) &&
        optionalBoundedString(message.foregroundSource) &&
        optionalBoundedString(message.backgroundSource) &&
        optionalBoundedString(message.error, MAX_NOTIFICATION_LENGTH);
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
