import type { UIToPluginMessage } from '../types/messages';
import { calculateContrastRatio, getLuminance, hexToOklch, hexToRgb } from './utils';
import { isSemanticColorPolicyCurrent } from './semanticColorPolicy';
import { doesRadixSourceInputMatchFamily, isExactRadixScale } from './radixColors';

type UnknownRecord = Record<string, unknown>;

export type MessageValidationResult =
  | { valid: true; message: UIToPluginMessage }
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
const GRADIENT_TYPES = ['LINEAR', 'RADIAL', 'ANGULAR', 'DIAMOND'] as const;
const DETAIL_LEVELS = ['minimal', 'detailed', 'presentation'] as const;
const SCALE_METHODS = ['custom', 'radix-match', 'wcag-constrained'] as const;
const COLOR_SCALE_METHODS = ['Teul OKLCH v2', 'Radix Colors'] as const;
const COLOR_ROLES = ['primary', 'secondary', 'tertiary', 'accent'] as const;
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
  if (!validateColor(message)) return 'color payload must include a valid hex color and name';
  if (Object.keys(message).some(key => !['type', 'hex', 'name'].includes(key))) {
    return 'color payload contains unsupported fields';
  }
  return null;
}

function validateGradient(message: UnknownRecord): string | null {
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

function validateFigmaRowsOrColumnsGrid(value: unknown, pattern: 'COLUMNS' | 'ROWS'): boolean {
  if (
    !isRecord(value) ||
    value.pattern !== pattern ||
    !isOneOf(value.alignment, GRID_ALIGNMENTS) ||
    !isFiniteNumberInRange(value.gutterSize, 0, MAX_GRID_MEASUREMENT) ||
    !isIntegerInRange(value.count, 1, MAX_GRID_COUNT) ||
    !isFiniteNumberInRange(value.offset, 0, MAX_GRID_MEASUREMENT) ||
    typeof value.visible !== 'boolean' ||
    !validateGridColor(value.color)
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
    validateGridColor(value.color)
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
    validateGridColor(value.color)
  );
}

function validateSourceBaselineGrid(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumberInRange(value.height, 1, MAX_GRID_MEASUREMENT) &&
    isFiniteNumberInRange(value.offset, 0, MAX_GRID_MEASUREMENT) &&
    typeof value.visible === 'boolean' &&
    validateGridColor(value.color)
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
  if (!validateFigmaGridConfig(message.config)) return 'config must be a valid Figma grid config';
  if (!hasGridEntry(message.config)) return 'config must include at least one grid entry';
  if (!isBoundedString(message.frameName)) return 'frameName must be a non-empty bounded string';
  if (!isFiniteNumberInRange(message.width, 1, MAX_DIMENSION)) return 'width is out of range';
  if (!isFiniteNumberInRange(message.height, 1, MAX_DIMENSION)) return 'height is out of range';
  if (
    message.positionNearSelection !== undefined &&
    typeof message.positionNearSelection !== 'boolean'
  ) {
    return 'positionNearSelection must be a boolean';
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
  if (!hasGridEntry(message.sourceConfig)) {
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
  return null;
}

function validateGetSelectionForGrid(message: UnknownRecord): string | null {
  return message.requestId === undefined || isBoundedString(message.requestId, 128)
    ? null
    : 'requestId must be a non-empty bounded string';
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

function validateUsageProportions(value: unknown): boolean {
  if (!isRecord(value)) return false;

  const proportions = [value.primary, value.secondary, value.tertiary, value.accent, value.neutral];

  return (
    proportions.every(proportion => isFiniteNumberInRange(proportion, 0, 100)) &&
    Math.abs(
      proportions.reduce<number>((total, proportion) => total + (proportion as number), 0) - 100
    ) < 0.001
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
    validateUsageProportions(value.usageProportions) &&
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
    case 'get-document-color-profile':
      error = null;
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
    default:
      return invalid(`unsupported message type: ${message.type}`);
  }

  return error ? invalid(`${message.type}: ${error}`) : valid(message);
}

export function isUIToPluginMessage(message: unknown): message is UIToPluginMessage {
  return validateUIToPluginMessage(message).valid;
}
