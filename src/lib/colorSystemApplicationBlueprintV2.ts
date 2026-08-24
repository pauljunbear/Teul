import { getRelativeLuminance, getWCAGContrast } from './accessibility';
import { simulateCVD, type CVDType } from './colorBlindness';
import { canonicalJson, deterministicContentHash } from './colorSystemAudit';
import {
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_SECTION_BLUEPRINT_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_SECTION_ROLES_V2,
  type ColorSystemApplicationColorRefV2,
  type ColorSystemApprovedColorRefV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemDataVisualizationMarkV2,
  type ColorSystemJobV2,
  type ColorSystemProductGraphicsJobV2,
  type ColorSystemRoleFrameRecipeV2,
  type ColorSystemSecondaryFamilyV2,
  type ColorSystemSectionRatingV2,
  type ColorSystemStrategyCandidateV2,
  type ColorSystemTypographyUseCategoryV2,
} from './colorSystemBuilderV2Contracts';
import {
  assertColorSystemBuilderBriefV2Integrity,
  assertColorSystemStrategyCandidateV2Integrity,
} from './colorSystemBuilderV2Integrity';
import { compareText, hexToRgb, rgbToOklab, type RGB } from './utils';

export const COLOR_SYSTEM_APPLICATION_BLUEPRINT_V2_SCHEMA_VERSION =
  'teul-application-system-v2' as const;
export const COLOR_SYSTEM_APPLICATION_COMPILER_V2_POLICY_VERSION =
  'teul-application-system-compiler/v2' as const;
export const COLOR_SYSTEM_APPLICATION_WCAG_POLICY_VERSION = 'wcag-2.2-srgb-rendered-pairs' as const;
export const COLOR_SYSTEM_APPLICATION_CVD_POLICY_VERSION =
  'machado-2009-severity-1-advisory' as const;
export const COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK = 0.08;
export const COLOR_SYSTEM_APPLICATION_SEQUENTIAL_POLICY_VERSION =
  'teul-sequential-perceptual-separation/v1' as const;
export const COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK = 0.03;
export const COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK = 0.03;
export const COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION =
  'teul-governed-diverging-semantics/v1' as const;
export const COLOR_SYSTEM_APPLICATION_GENERATED_DIVERGING_SEMANTICS_POLICY_VERSION =
  'teul-owner-confirmed-generated-diverging-semantics/v1' as const;

export const COLOR_SYSTEM_PRODUCT_GRAPHICS_JOBS_V2 = [
  'product-graphic',
  'functional-iconography',
  'product-ui-surface',
] as const satisfies readonly ColorSystemProductGraphicsJobV2[];

const PRODUCT_GRAPHICS_ELIGIBILITY_JOBS: Readonly<
  Record<ColorSystemProductGraphicsJobV2, ColorSystemJobV2>
> = {
  'product-graphic': 'product-graphics',
  'functional-iconography': 'functional-iconography',
  'product-ui-surface': 'product-ui-surface',
};

export const COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2 = [
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

export type ColorSystemProductSemanticRoleNameV2 =
  (typeof COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2)[number];

const MEANING_BEARING_SEMANTIC_ROLES = new Set<ColorSystemProductSemanticRoleNameV2>([
  'focus',
  'disabled',
  'success',
  'warning',
  'error',
  'information',
  'destructive',
  'link',
  'selected',
]);

const REQUIRED_TYPOGRAPHY_CATEGORIES = [
  'primary-body',
  'supporting-body',
  'large-heading',
  'reverse-body',
] as const satisfies readonly ColorSystemTypographyUseCategoryV2[];

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const HEX_PATTERN = /^#[0-9A-F]{6}$/;
const MONOTONIC_EPSILON = 1e-12;

export type ColorSystemApplicationBlueprintV2ErrorCode =
  | 'INVALID_APPLICATION_INPUT'
  | 'ORPHAN_APPLICATION_REFERENCE'
  | 'MISSING_PRODUCT_GRAPHICS_JOB'
  | 'MISSING_PRODUCT_SEMANTIC_ROLE'
  | 'MISSING_NON_COLOR_CUE'
  | 'INVALID_DATA_VISUALIZATION_POLICY'
  | 'INVALID_TYPOGRAPHY_SPECIMEN'
  | 'APPLICATION_BLUEPRINT_INTEGRITY';

export class ColorSystemApplicationBlueprintV2Error extends Error {
  constructor(
    readonly code: ColorSystemApplicationBlueprintV2ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ColorSystemApplicationBlueprintV2Error';
  }
}

export interface ColorSystemResolvedApplicationColorV2 {
  ref: ColorSystemApplicationColorRefV2;
  ownership: 'approved-secondary' | 'preserved-source';
  value: ColorSystemColorValueV2;
}

export interface ColorSystemProductGraphicsSpecimenInputV2 {
  derivationId: string;
  job: ColorSystemProductGraphicsJobV2;
  order: number;
  mode: string;
  intendedUse: string;
  excludedUses: readonly string[];
  assessment: 'informative' | 'decorative';
  pairEvidenceIds: readonly string[];
  nonColorCue: string | null;
  evidenceIds: readonly string[];
  sourceRefs: readonly ColorSystemApprovedColorRefV2[];
  transform:
    | { kind: 'identity' }
    | {
        kind: 'alpha';
        alpha: number;
      };
}

export interface ColorSystemProductGraphicsColorUseV2 extends ColorSystemResolvedApplicationColorV2 {
  appliedValue: ColorSystemColorValueV2;
}

export interface ColorSystemProductGraphicsSpecimenV2 extends ColorSystemProductGraphicsSpecimenInputV2 {
  colors: readonly ColorSystemProductGraphicsColorUseV2[];
  accessibilityStatus: 'pass' | 'exempt' | 'blocked';
}

export interface ColorSystemProductSemanticRoleInputV2 {
  role: ColorSystemProductSemanticRoleNameV2;
  mode: string;
  ref: ColorSystemApplicationColorRefV2;
  pairEvidenceIds: readonly string[];
  nonColorCue: string | null;
  intendedUse: string;
  evidenceIds: readonly string[];
}

export interface ColorSystemProductSemanticRoleV2 extends ColorSystemProductSemanticRoleInputV2 {
  resolved: ColorSystemResolvedApplicationColorV2;
  accessibilityStatus: 'pass' | 'inactive-exempt' | 'blocked';
}

export type ColorSystemRenderedPairCategoryV2 = 'normal-text' | 'large-text' | 'non-text';
export type ColorSystemRenderedPairBackdropKindV2 =
  | 'solid'
  | 'unknown'
  | 'image'
  | 'gradient'
  | 'blend-mode';
export type ColorSystemRenderedPairAssessmentV2 = 'required' | 'inactive-exempt';
export type ColorSystemRenderedPairStatusV2 = 'pass' | 'fail' | 'unassessed' | 'inactive-exempt';
export type ColorSystemRenderedPairUnassessedReasonV2 =
  | 'UNKNOWN_UNDERLAY'
  | 'UNKNOWN_BACKDROP'
  | 'IMAGE_BACKDROP'
  | 'GRADIENT_BACKDROP'
  | 'BLEND_MODE_CONTEXT';

export interface ColorSystemRenderedPairContextV2 {
  id: string;
  mode: string;
  foreground: ColorSystemApplicationColorRefV2;
  background: ColorSystemApplicationColorRefV2;
  underlay: ColorSystemApplicationColorRefV2 | null;
  backdropKind: ColorSystemRenderedPairBackdropKindV2;
  category: ColorSystemRenderedPairCategoryV2;
  assessment: ColorSystemRenderedPairAssessmentV2;
  fontSizePx: number | null;
  fontWeight: number | null;
  useCase: string;
  evidenceIds: readonly string[];
}

export interface ColorSystemRenderedPairEvidenceV2 {
  context: ColorSystemRenderedPairContextV2;
  foreground: ColorSystemResolvedApplicationColorV2;
  background: ColorSystemResolvedApplicationColorV2;
  underlay: ColorSystemResolvedApplicationColorV2 | null;
  renderedForeground: RGB | null;
  renderedBackground: RGB | null;
  requiredRatio: 3 | 4.5;
  ratio: number | null;
  passesThreshold: boolean | null;
  status: ColorSystemRenderedPairStatusV2;
  unassessedReason: ColorSystemRenderedPairUnassessedReasonV2 | null;
  limitation: string;
}

interface ColorSystemVisualizationContextBaseV2 {
  selectionId: string;
  marks: readonly ColorSystemDataVisualizationMarkV2[];
  surface: ColorSystemApplicationColorRefV2;
  evidenceIds: readonly string[];
}

export interface ColorSystemCategoricalContextV2 extends ColorSystemVisualizationContextBaseV2 {
  adjacency: 'separated' | 'touching';
  boundary: ColorSystemApplicationColorRefV2 | null;
  markPairEvidenceIds: readonly string[];
  directLabels: true;
  nonColorCue: 'shape' | 'pattern';
}

export interface ColorSystemSequentialContextV2 extends ColorSystemVisualizationContextBaseV2 {
  direction: 'light-to-dark' | 'dark-to-light';
  axisLabel: string;
  endpointLabels: readonly [string, string];
  nonColorCue: 'axis-and-endpoint-labels';
}

export type ColorSystemDivergingPolarityV2 =
  | {
      policyVersion: typeof COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION;
      negativeSourceColorId: string;
      positiveSourceColorId: string;
      negativeContributionId?: never;
      positiveContributionId?: never;
      authority: 'governed-source';
      evidenceIds: readonly string[];
    }
  | {
      policyVersion: typeof COLOR_SYSTEM_APPLICATION_GENERATED_DIVERGING_SEMANTICS_POLICY_VERSION;
      negativeContributionId: string;
      positiveContributionId: string;
      negativeSourceColorId?: never;
      positiveSourceColorId?: never;
      authority: 'owner-confirmed';
      evidenceIds: readonly string[];
    };

export interface ColorSystemDivergingContextV2 extends ColorSystemVisualizationContextBaseV2 {
  polarity: ColorSystemDivergingPolarityV2;
  midpointOrder: number;
  midpointMeaning: string;
  midpointPolarity: 'light' | 'dark';
  zeroReferenceLine: true;
  negativeLabel: string;
  positiveLabel: string;
  nonColorCue: 'zero-line-and-sign-labels';
}

export interface ColorSystemVisualizationMarkEvidenceV2 {
  order: number;
  label: string;
  ref: ColorSystemApplicationColorRefV2;
  resolved: ColorSystemResolvedApplicationColorV2;
  renderedRgb: RGB;
  renderedHex: string;
  oklabLightness: number;
  relativeLuminance: number;
}

export interface ColorSystemCvdAdvisoryEvidenceV2 {
  policyVersion: typeof COLOR_SYSTEM_APPLICATION_CVD_POLICY_VERSION;
  minimumDeltaEOK: typeof COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK;
  normal: number;
  protan: number;
  deutan: number;
  severeTritan: number;
  status: 'pass' | 'fail';
  limitation: string;
}

export interface ColorSystemSequentialPerceptualEvidenceV2 {
  policyVersion: typeof COLOR_SYSTEM_APPLICATION_SEQUENTIAL_POLICY_VERSION;
  minimumAdjacentDeltaEOK: typeof COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK;
  minimumSurfaceDeltaEOK: typeof COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK;
  adjacent: readonly {
    fromOrder: number;
    toOrder: number;
    deltaEOK: number;
  }[];
  surface: readonly {
    order: number;
    deltaEOK: number;
  }[];
  observedMinimumAdjacentDeltaEOK: number;
  observedMinimumSurfaceDeltaEOK: number;
  status: 'pass';
  limitation: string;
}

export type ColorSystemCategoricalSelectionV2 = Omit<ColorSystemCategoricalContextV2, 'marks'> & {
  kind: 'categorical';
  marks: readonly ColorSystemVisualizationMarkEvidenceV2[];
  surfaceResolved: ColorSystemResolvedApplicationColorV2;
  boundaryResolved: ColorSystemResolvedApplicationColorV2 | null;
  cvdAdvisory: ColorSystemCvdAdvisoryEvidenceV2;
};

export type ColorSystemSequentialSelectionV2 = Omit<ColorSystemSequentialContextV2, 'marks'> & {
  kind: 'sequential';
  marks: readonly ColorSystemVisualizationMarkEvidenceV2[];
  surfaceResolved: ColorSystemResolvedApplicationColorV2;
  perceptualEvidence: ColorSystemSequentialPerceptualEvidenceV2;
};

export type ColorSystemDivergingSelectionV2 = Omit<ColorSystemDivergingContextV2, 'marks'> & {
  kind: 'diverging';
  marks: readonly ColorSystemVisualizationMarkEvidenceV2[];
  surfaceResolved: ColorSystemResolvedApplicationColorV2;
  cvdAdvisory: ColorSystemCvdAdvisoryEvidenceV2;
};

export interface ColorSystemTypographySpecimenInputV2 {
  specimenId: string;
  useCategory: ColorSystemTypographyUseCategoryV2;
  mode: string;
  pairEvidenceId: string;
  fontSizePx: 16 | 24;
  fontWeight: 400;
  intendedUse: string;
  evidenceIds: readonly string[];
}

export interface ColorSystemTypographySpecimenV2 extends ColorSystemTypographySpecimenInputV2 {
  useCategory: ColorSystemTypographyUseCategoryV2;
  mode: string;
  foreground: ColorSystemApplicationColorRefV2;
  background: ColorSystemApplicationColorRefV2;
  underlay: ColorSystemApplicationColorRefV2 | null;
  ratio: number | null;
  threshold: 3 | 4.5;
  status: ColorSystemRenderedPairStatusV2;
}

export type ColorSystemApplicationBlockerCodeV2 =
  | 'PAIR_THRESHOLD_FAILED'
  | 'PAIR_CONTEXT_UNASSESSED'
  | 'CVD_ADVISORY_SEPARATION_FAILED';

export interface ColorSystemApplicationBlockerV2 {
  code: ColorSystemApplicationBlockerCodeV2;
  evidenceId: string;
  message: string;
}

export interface ColorSystemApplicationPolicyVersionsV2 {
  compiler: typeof COLOR_SYSTEM_APPLICATION_COMPILER_V2_POLICY_VERSION;
  wcag: typeof COLOR_SYSTEM_APPLICATION_WCAG_POLICY_VERSION;
  cvdAdvisory: typeof COLOR_SYSTEM_APPLICATION_CVD_POLICY_VERSION;
  sequentialPerceptual: typeof COLOR_SYSTEM_APPLICATION_SEQUENTIAL_POLICY_VERSION;
  divergingSemantics: typeof COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION;
  sourcePolicy: string;
}

export interface ColorSystemApplicationSystemBlueprintV2 {
  schemaVersion: typeof COLOR_SYSTEM_APPLICATION_BLUEPRINT_V2_SCHEMA_VERSION;
  sourceHash: string;
  sourcePackageHash: string;
  briefHash: string;
  candidateId: string;
  candidateHash: string;
  brandFitProfileHash: string;
  profile: 'srgb';
  compilerVersion: string;
  modes: readonly string[];
  status: 'ready' | 'blocked';
  productGraphics: readonly ColorSystemProductGraphicsSpecimenV2[];
  productSemantics: readonly ColorSystemProductSemanticRoleV2[];
  visualization: {
    categorical: ColorSystemCategoricalSelectionV2;
    sequential: ColorSystemSequentialSelectionV2;
    diverging: ColorSystemDivergingSelectionV2;
  };
  typography: readonly ColorSystemTypographySpecimenV2[];
  pairEvidence: readonly ColorSystemRenderedPairEvidenceV2[];
  limitations: readonly string[];
  policyVersions: ColorSystemApplicationPolicyVersionsV2;
  ratings: readonly ColorSystemSectionRatingV2[];
  blockers: readonly ColorSystemApplicationBlockerV2[];
  applicationEvidenceHash: string;
  applicationBlueprintHash: string;
}

export interface ColorSystemApplicationSystemBlueprintV2Input {
  compilerVersion: string;
  modes: readonly string[];
  productGraphics: readonly ColorSystemProductGraphicsSpecimenInputV2[];
  productSemantics: readonly ColorSystemProductSemanticRoleInputV2[];
  visualization: {
    categorical: ColorSystemCategoricalContextV2;
    sequential: ColorSystemSequentialContextV2;
    diverging: ColorSystemDivergingContextV2;
  };
  typography: readonly ColorSystemTypographySpecimenInputV2[];
  pairContexts: readonly ColorSystemRenderedPairContextV2[];
  limitations: readonly string[];
}

type BlueprintContent = Omit<ColorSystemApplicationSystemBlueprintV2, 'applicationBlueprintHash'>;

interface Resolver {
  brief: ColorSystemBuilderBriefV2;
  candidate: ColorSystemStrategyCandidateV2;
  modes: Set<string>;
}

const STANDARD_LIMITATIONS = [
  'Only exact rendered pairs receive WCAG 2.2 contrast results; palettes and families are not AA or AAA by themselves.',
  'Sequential heatmap visibility uses exact rendered Delta E OK separation on the declared surface; WCAG text and non-text contrast ratios are not claimed for the continuous ramp.',
  'Machado simulations and Delta E OK separation are advisory Teul policy evidence, not WCAG conformance, diagnosis, or a colorblind-safe claim.',
  'sRGB values do not guarantee identical appearance across monitors, calibration, brightness, ambient light, operating systems, or application color management.',
] as const;

function fail(code: ColorSystemApplicationBlueprintV2ErrorCode, message: string): never {
  throw new ColorSystemApplicationBlueprintV2Error(code, message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value: unknown, expected: readonly string[], label: string): void {
  if (!isObject(value)) fail('INVALID_APPLICATION_INPUT', `${label} must be an object.`);
  const actual = Object.keys(value).sort(compareText);
  const wanted = [...expected].sort(compareText);
  if (canonicalJson(actual) !== canonicalJson(wanted)) {
    fail('INVALID_APPLICATION_INPUT', `${label} contains unexpected or missing fields.`);
  }
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) fail('INVALID_APPLICATION_INPUT', `${label} must not be empty.`);
  return trimmed;
}

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    fail('INVALID_APPLICATION_INPUT', `${label} must be finite.`);
  }
  return value;
}

function sortedUniqueStrings(values: readonly string[], label: string): string[] {
  const normalized = values.map((value, index) => requireNonEmpty(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail('INVALID_APPLICATION_INPUT', `${label} must not contain duplicates.`);
  }
  return normalized.sort(compareText);
}

function uniqueStringsInDeclaredOrder(values: readonly string[], label: string): string[] {
  const normalized = values.map((value, index) => requireNonEmpty(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail('INVALID_APPLICATION_INPUT', `${label} must not contain duplicates.`);
  }
  return normalized;
}

function sameRef(
  first: ColorSystemApplicationColorRefV2,
  second: ColorSystemApplicationColorRefV2
): boolean {
  return canonicalJson(first) === canonicalJson(second);
}

function normalizeRef(
  ref: ColorSystemApplicationColorRefV2,
  label: string
): ColorSystemApplicationColorRefV2 {
  if (!isObject(ref)) {
    fail('ORPHAN_APPLICATION_REFERENCE', `${label} must be an approved reference.`);
  }
  if (ref.kind === 'approved-family-member') {
    assertExactKeys(ref, ['kind', 'ref'], label);
    assertExactKeys(ref.ref, ['familyId', 'memberId', 'mode'], `${label}.ref`);
    return {
      kind: 'approved-family-member',
      ref: {
        familyId: requireNonEmpty(ref.ref.familyId, `${label}.ref.familyId`),
        memberId: requireNonEmpty(ref.ref.memberId, `${label}.ref.memberId`),
        mode: requireNonEmpty(ref.ref.mode, `${label}.ref.mode`),
      },
    };
  }
  if (ref.kind === 'preserved-source-color') {
    assertExactKeys(ref, ['kind', 'stableColorId', 'mode'], label);
    return {
      kind: 'preserved-source-color',
      stableColorId: requireNonEmpty(ref.stableColorId, `${label}.stableColorId`),
      mode: requireNonEmpty(ref.mode, `${label}.mode`),
    };
  }
  fail(
    'ORPHAN_APPLICATION_REFERENCE',
    `${label} may use only an approved family member or preserved source color.`
  );
}

function refMode(ref: ColorSystemApplicationColorRefV2): string {
  return ref.kind === 'approved-family-member' ? ref.ref.mode : ref.mode;
}

function resolveRef(
  resolver: Resolver,
  inputRef: ColorSystemApplicationColorRefV2,
  label: string
): ColorSystemResolvedApplicationColorV2 {
  const ref = normalizeRef(inputRef, label);
  const mode = refMode(ref);
  if (!resolver.modes.has(mode)) {
    fail('ORPHAN_APPLICATION_REFERENCE', `${label} uses undeclared mode "${mode}".`);
  }
  if (ref.kind === 'approved-family-member') {
    const family = resolver.candidate.families.find(
      item => item.stableFamilyId === ref.ref.familyId
    );
    const member = family?.members.find(item => item.stableMemberId === ref.ref.memberId);
    const value = member?.valuesByMode[mode];
    if (!family || !member || !value) {
      fail(
        'ORPHAN_APPLICATION_REFERENCE',
        `${label} does not resolve to an approved candidate family, member, and mode.`
      );
    }
    assertSrgbValue(value, `${label} value`);
    return { ref, ownership: 'approved-secondary', value };
  }
  const preserved = resolver.brief.preservedColors.find(
    color => color.stableColorId === ref.stableColorId
  );
  const value = preserved?.valuesByMode[mode];
  if (!preserved || !value) {
    fail(
      'ORPHAN_APPLICATION_REFERENCE',
      `${label} does not resolve to an admitted preserved source color and mode.`
    );
  }
  assertSrgbValue(value, `${label} value`);
  return { ref, ownership: 'preserved-source', value };
}

function approvedRefIdentity(ref: ColorSystemApprovedColorRefV2): string {
  return `${ref.familyId}\u0000${ref.memberId}\u0000${ref.mode}`;
}

function assertRefEligibleForJob(
  resolver: Resolver,
  inputRef: ColorSystemApplicationColorRefV2,
  job: ColorSystemJobV2,
  label: string
): void {
  const ref = normalizeRef(inputRef, label);
  if (ref.kind === 'preserved-source-color') return;
  const identity = approvedRefIdentity(ref.ref);
  const eligibility = resolver.candidate.jobEligibility.find(
    entry => approvedRefIdentity(entry.ref) === identity
  );
  if (!eligibility) {
    fail(
      'ORPHAN_APPLICATION_REFERENCE',
      `${label} has no reviewed member/mode job eligibility receipt.`
    );
  }
  if (!eligibility.jobs.includes(job)) {
    fail('ORPHAN_APPLICATION_REFERENCE', `${label} is not eligible for application job ${job}.`);
  }
}

function assertEvidenceEligibleForJob(
  resolver: Resolver,
  evidence: ColorSystemRenderedPairEvidenceV2,
  job: ColorSystemJobV2,
  label: string
): void {
  assertRefEligibleForJob(resolver, evidence.context.foreground, job, `${label}.foreground`);
  assertRefEligibleForJob(resolver, evidence.context.background, job, `${label}.background`);
  if (evidence.context.underlay !== null) {
    assertRefEligibleForJob(resolver, evidence.context.underlay, job, `${label}.underlay`);
  }
}

function assertSrgbValue(value: ColorSystemColorValueV2, label: string): void {
  const expected = hexToRgb(value.hex);
  const components = value.components;
  if (
    value.colorSpace !== 'srgb' ||
    !HEX_PATTERN.test(value.hex) ||
    !components ||
    !Number.isFinite(components.r) ||
    !Number.isFinite(components.g) ||
    !Number.isFinite(components.b) ||
    components.r < 0 ||
    components.r > 1 ||
    components.g < 0 ||
    components.g > 1 ||
    components.b < 0 ||
    components.b > 1 ||
    Math.abs(components.r - expected.r / 255) > 1e-12 ||
    Math.abs(components.g - expected.g / 255) > 1e-12 ||
    Math.abs(components.b - expected.b / 255) > 1e-12 ||
    !Number.isFinite(value.alpha) ||
    value.alpha < 0 ||
    value.alpha > 1
  ) {
    fail(
      'ORPHAN_APPLICATION_REFERENCE',
      `${label} must preserve an exact six-digit sRGB value and alpha from zero through one.`
    );
  }
}

function colorRgb(value: ColorSystemColorValueV2): RGB {
  return {
    r: value.components.r * 255,
    g: value.components.g * 255,
    b: value.components.b * 255,
  };
}

function composite(foreground: RGB, alpha: number, background: RGB): RGB {
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
  };
}

function canonicalHex(rgb: RGB): string {
  const channel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`.toUpperCase();
}

function renderedOnSurface(
  color: ColorSystemResolvedApplicationColorV2,
  surface: ColorSystemResolvedApplicationColorV2,
  label: string
): RGB {
  if (surface.value.alpha !== 1) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${label} surface must be opaque or supply a separately assessed underlay context.`
    );
  }
  return composite(colorRgb(color.value), color.value.alpha, colorRgb(surface.value));
}

function requiredRatio(category: ColorSystemRenderedPairCategoryV2): 3 | 4.5 {
  return category === 'normal-text' ? 4.5 : 3;
}

export function meetsApplicationContrastThreshold(ratio: number, threshold: 3 | 4.5): boolean {
  requireFinite(ratio, 'contrast ratio');
  return ratio >= threshold;
}

function validateTextCategory(context: ColorSystemRenderedPairContextV2): void {
  if (context.category === 'non-text') {
    if (context.fontSizePx !== null || context.fontWeight !== null) {
      fail(
        'INVALID_APPLICATION_INPUT',
        `${context.id} non-text context cannot declare font size or weight.`
      );
    }
    return;
  }
  if (
    context.fontSizePx === null ||
    context.fontWeight === null ||
    !Number.isFinite(context.fontSizePx) ||
    !Number.isInteger(context.fontWeight)
  ) {
    fail(
      'INVALID_APPLICATION_INPUT',
      `${context.id} text context requires an exact CSS pixel size and integer weight.`
    );
  }
  const isLarge =
    context.fontSizePx >= 24 || (context.fontWeight >= 700 && context.fontSizePx >= 18.66);
  if (
    (context.category === 'large-text' && !isLarge) ||
    (context.category === 'normal-text' && isLarge)
  ) {
    fail(
      'INVALID_APPLICATION_INPUT',
      `${context.id} text category does not match its exact size and weight.`
    );
  }
}

function unassessedReason(
  context: ColorSystemRenderedPairContextV2,
  background: ColorSystemResolvedApplicationColorV2,
  underlay: ColorSystemResolvedApplicationColorV2 | null
): ColorSystemRenderedPairUnassessedReasonV2 | null {
  if (context.backdropKind === 'unknown') return 'UNKNOWN_BACKDROP';
  if (context.backdropKind === 'image') return 'IMAGE_BACKDROP';
  if (context.backdropKind === 'gradient') return 'GRADIENT_BACKDROP';
  if (context.backdropKind === 'blend-mode') return 'BLEND_MODE_CONTEXT';
  if (background.value.alpha !== 1 && (!underlay || underlay.value.alpha !== 1)) {
    return 'UNKNOWN_UNDERLAY';
  }
  return null;
}

function normalizePairContext(
  resolver: Resolver,
  context: ColorSystemRenderedPairContextV2
): ColorSystemRenderedPairEvidenceV2 {
  assertExactKeys(
    context,
    [
      'id',
      'mode',
      'foreground',
      'background',
      'underlay',
      'backdropKind',
      'category',
      'assessment',
      'fontSizePx',
      'fontWeight',
      'useCase',
      'evidenceIds',
    ],
    'pair context'
  );
  const id = requireNonEmpty(context.id, 'pair context id');
  const mode = requireNonEmpty(context.mode, `${id}.mode`);
  if (!resolver.modes.has(mode)) {
    fail('INVALID_APPLICATION_INPUT', `${id} uses an undeclared mode.`);
  }
  if (
    !['solid', 'unknown', 'image', 'gradient', 'blend-mode'].includes(context.backdropKind) ||
    !['normal-text', 'large-text', 'non-text'].includes(context.category) ||
    !['required', 'inactive-exempt'].includes(context.assessment)
  ) {
    fail('INVALID_APPLICATION_INPUT', `${id} has an unsupported pair policy value.`);
  }
  const normalizedContext: ColorSystemRenderedPairContextV2 = {
    ...context,
    id,
    mode,
    foreground: normalizeRef(context.foreground, `${id}.foreground`),
    background: normalizeRef(context.background, `${id}.background`),
    underlay: context.underlay === null ? null : normalizeRef(context.underlay, `${id}.underlay`),
    useCase: requireNonEmpty(context.useCase, `${id}.useCase`),
    evidenceIds: sortedUniqueStrings(context.evidenceIds, `${id}.evidenceIds`),
  };
  if (
    refMode(normalizedContext.foreground) !== mode ||
    refMode(normalizedContext.background) !== mode ||
    (normalizedContext.underlay !== null && refMode(normalizedContext.underlay) !== mode)
  ) {
    fail('INVALID_APPLICATION_INPUT', `${id} references must all use the declared mode.`);
  }
  validateTextCategory(normalizedContext);
  const foreground = resolveRef(resolver, normalizedContext.foreground, `${id}.foreground`);
  const background = resolveRef(resolver, normalizedContext.background, `${id}.background`);
  const underlay = normalizedContext.underlay
    ? resolveRef(resolver, normalizedContext.underlay, `${id}.underlay`)
    : null;
  if (background.value.alpha === 1 && underlay !== null) {
    fail(
      'INVALID_APPLICATION_INPUT',
      `${id} cannot declare an underlay behind a fully opaque background.`
    );
  }
  const reason = unassessedReason(normalizedContext, background, underlay);
  const threshold = requiredRatio(normalizedContext.category);
  if (reason !== null) {
    return {
      context: normalizedContext,
      foreground,
      background,
      underlay,
      renderedForeground: null,
      renderedBackground: null,
      requiredRatio: threshold,
      ratio: null,
      passesThreshold: null,
      status: normalizedContext.assessment === 'inactive-exempt' ? 'inactive-exempt' : 'unassessed',
      unassessedReason: reason,
      limitation:
        'Contrast is unassessed because the exact rendered backdrop cannot be composited from approved sRGB values.',
    };
  }
  const renderedBackground =
    background.value.alpha === 1
      ? colorRgb(background.value)
      : composite(colorRgb(background.value), background.value.alpha, colorRgb(underlay!.value));
  const renderedForeground = composite(
    colorRgb(foreground.value),
    foreground.value.alpha,
    renderedBackground
  );
  const ratio = getWCAGContrast(renderedForeground, renderedBackground);
  const passesThreshold = meetsApplicationContrastThreshold(ratio, threshold);
  return {
    context: normalizedContext,
    foreground,
    background,
    underlay,
    renderedForeground,
    renderedBackground,
    requiredRatio: threshold,
    ratio,
    passesThreshold: normalizedContext.assessment === 'inactive-exempt' ? null : passesThreshold,
    status:
      normalizedContext.assessment === 'inactive-exempt'
        ? 'inactive-exempt'
        : passesThreshold
          ? 'pass'
          : 'fail',
    unassessedReason: null,
    limitation:
      normalizedContext.assessment === 'inactive-exempt'
        ? 'Inactive controls are exempt and are not counted as passing required pairs.'
        : 'This result applies only to this exact rendered sRGB pair, alpha, underlay, size, weight, and use case.',
  };
}

function pairContainsRef(
  evidence: ColorSystemRenderedPairEvidenceV2,
  ref: ColorSystemApplicationColorRefV2
): boolean {
  return (
    sameRef(evidence.context.foreground, ref) ||
    sameRef(evidence.context.background, ref) ||
    (evidence.context.underlay !== null && sameRef(evidence.context.underlay, ref))
  );
}

function requireEvidence(
  evidenceById: ReadonlyMap<string, ColorSystemRenderedPairEvidenceV2>,
  id: string,
  label: string
): ColorSystemRenderedPairEvidenceV2 {
  const evidence = evidenceById.get(requireNonEmpty(id, label));
  if (!evidence) fail('INVALID_APPLICATION_INPUT', `${label} references unknown pair evidence.`);
  return evidence;
}

function normalizeProductGraphics(
  resolver: Resolver,
  inputs: readonly ColorSystemProductGraphicsSpecimenInputV2[],
  evidenceById: ReadonlyMap<string, ColorSystemRenderedPairEvidenceV2>
): ColorSystemProductGraphicsSpecimenV2[] {
  const normalized = [...inputs]
    .sort(
      (left, right) =>
        left.order - right.order || compareText(left.derivationId, right.derivationId)
    )
    .map((input, index) => {
      assertExactKeys(
        input,
        [
          'derivationId',
          'job',
          'order',
          'mode',
          'intendedUse',
          'excludedUses',
          'assessment',
          'pairEvidenceIds',
          'nonColorCue',
          'evidenceIds',
          'sourceRefs',
          'transform',
        ],
        `productGraphics[${index}]`
      );
      const derivationId = requireNonEmpty(input.derivationId, 'Product Graphics derivationId');
      if (input.order !== index + 1 || input.job !== COLOR_SYSTEM_PRODUCT_GRAPHICS_JOBS_V2[index]) {
        fail(
          'MISSING_PRODUCT_GRAPHICS_JOB',
          'Product Graphics must contain product graphic, functional iconography, and product UI surface in canonical order.'
        );
      }
      const mode = requireNonEmpty(input.mode, `${derivationId}.mode`);
      if (input.sourceRefs.length === 0) {
        fail('INVALID_APPLICATION_INPUT', `${derivationId} requires at least one source ref.`);
      }
      if (!['identity', 'alpha'].includes(input.transform.kind)) {
        fail('INVALID_APPLICATION_INPUT', `${derivationId} transform is unsupported.`);
      }
      if (
        input.transform.kind === 'alpha' &&
        (!Number.isFinite(input.transform.alpha) ||
          input.transform.alpha < 0 ||
          input.transform.alpha > 1)
      ) {
        fail('INVALID_APPLICATION_INPUT', `${derivationId} alpha must be from zero through one.`);
      }
      const sourceRefs = input.sourceRefs.map(ref => ({ ...ref }));
      const colors = sourceRefs.map((approvedRef, refIndex) => {
        const ref: ColorSystemApplicationColorRefV2 = {
          kind: 'approved-family-member',
          ref: approvedRef,
        };
        if (approvedRef.mode !== mode) {
          fail(
            'INVALID_APPLICATION_INPUT',
            `${derivationId} source refs must use its declared mode.`
          );
        }
        assertRefEligibleForJob(
          resolver,
          ref,
          PRODUCT_GRAPHICS_ELIGIBILITY_JOBS[input.job],
          `${derivationId}.sourceRefs[${refIndex}]`
        );
        const resolved = resolveRef(resolver, ref, `${derivationId}.sourceRefs[${refIndex}]`);
        const appliedValue =
          input.transform.kind === 'identity'
            ? resolved.value
            : {
                ...resolved.value,
                alpha: resolved.value.alpha * input.transform.alpha,
              };
        return { ...resolved, appliedValue };
      });
      const pairEvidenceIds = sortedUniqueStrings(
        input.pairEvidenceIds,
        `${derivationId}.pairEvidenceIds`
      );
      if (input.assessment === 'decorative') {
        if (pairEvidenceIds.length !== 0 || input.nonColorCue !== null) {
          fail(
            'INVALID_APPLICATION_INPUT',
            `${derivationId} decorative specimen must be explicitly exempt without a pass claim.`
          );
        }
      } else {
        if (input.transform.kind !== 'identity') {
          fail(
            'INVALID_APPLICATION_INPUT',
            `${derivationId} informative alpha transforms need a first-class approved identity before pair assessment.`
          );
        }
        requireNonEmpty(input.nonColorCue ?? '', `${derivationId}.nonColorCue`);
        if (pairEvidenceIds.length === 0) {
          fail(
            'INVALID_APPLICATION_INPUT',
            `${derivationId} requires exact non-text pair evidence.`
          );
        }
        for (const color of colors) {
          if (
            !pairEvidenceIds.some(pairId => {
              const evidence = requireEvidence(
                evidenceById,
                pairId,
                `${derivationId}.pairEvidenceIds`
              );
              assertEvidenceEligibleForJob(
                resolver,
                evidence,
                PRODUCT_GRAPHICS_ELIGIBILITY_JOBS[input.job],
                `${derivationId}.pairEvidenceIds`
              );
              return (
                evidence.context.category === 'non-text' &&
                evidence.context.mode === mode &&
                pairContainsRef(evidence, color.ref)
              );
            })
          ) {
            fail(
              'INVALID_APPLICATION_INPUT',
              `${derivationId} must assess every informative color in its exact context.`
            );
          }
        }
      }
      const pairStatuses = pairEvidenceIds.map(
        pairId => requireEvidence(evidenceById, pairId, `${derivationId}.pairEvidenceIds`).status
      );
      const specimen: ColorSystemProductGraphicsSpecimenV2 = {
        ...input,
        derivationId,
        mode,
        intendedUse: requireNonEmpty(input.intendedUse, `${derivationId}.intendedUse`),
        excludedUses: sortedUniqueStrings(input.excludedUses, `${derivationId}.excludedUses`),
        pairEvidenceIds,
        evidenceIds: sortedUniqueStrings(input.evidenceIds, `${derivationId}.evidenceIds`),
        sourceRefs,
        transform: input.transform,
        colors,
        accessibilityStatus:
          input.assessment === 'decorative'
            ? 'exempt'
            : pairStatuses.every(status => status === 'pass')
              ? 'pass'
              : 'blocked',
      };
      return specimen;
    });
  if (normalized.length !== 3) {
    fail('MISSING_PRODUCT_GRAPHICS_JOB', 'Exactly three Product Graphics jobs are required.');
  }
  return normalized;
}

function semanticRoleRank(role: ColorSystemProductSemanticRoleNameV2): number {
  return COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.indexOf(role);
}

function normalizeProductSemantics(
  resolver: Resolver,
  inputs: readonly ColorSystemProductSemanticRoleInputV2[],
  modes: readonly string[],
  evidenceById: ReadonlyMap<string, ColorSystemRenderedPairEvidenceV2>
): ColorSystemProductSemanticRoleV2[] {
  const normalized = [...inputs]
    .sort(
      (left, right) =>
        compareText(left.mode, right.mode) ||
        semanticRoleRank(left.role) - semanticRoleRank(right.role)
    )
    .map((input, index) => {
      assertExactKeys(
        input,
        ['role', 'mode', 'ref', 'pairEvidenceIds', 'nonColorCue', 'intendedUse', 'evidenceIds'],
        `productSemantics[${index}]`
      );
      if (semanticRoleRank(input.role) < 0) {
        fail('MISSING_PRODUCT_SEMANTIC_ROLE', `Unknown product semantic role "${input.role}".`);
      }
      const ref = normalizeRef(input.ref, `${input.mode}/${input.role}.ref`);
      if (refMode(ref) !== input.mode) {
        fail(
          'ORPHAN_APPLICATION_REFERENCE',
          `${input.mode}/${input.role} reference mode does not match the role mode.`
        );
      }
      assertRefEligibleForJob(
        resolver,
        ref,
        'product-semantics',
        `${input.mode}/${input.role}.ref`
      );
      const pairEvidenceIds = sortedUniqueStrings(
        input.pairEvidenceIds,
        `${input.mode}/${input.role}.pairEvidenceIds`
      );
      if (pairEvidenceIds.length === 0) {
        fail(
          'INVALID_APPLICATION_INPUT',
          `${input.mode}/${input.role} requires exact pair evidence.`
        );
      }
      const pairEvidence = pairEvidenceIds.map(pairId => {
        const evidence = requireEvidence(
          evidenceById,
          pairId,
          `${input.mode}/${input.role}.pairEvidenceIds`
        );
        if (evidence.context.mode !== input.mode || !pairContainsRef(evidence, ref)) {
          fail(
            'INVALID_APPLICATION_INPUT',
            `${input.mode}/${input.role} pair evidence must include the role reference and mode.`
          );
        }
        assertEvidenceEligibleForJob(
          resolver,
          evidence,
          'product-semantics',
          `${input.mode}/${input.role}.pairEvidenceIds`
        );
        return evidence;
      });
      if (MEANING_BEARING_SEMANTIC_ROLES.has(input.role)) {
        requireNonEmpty(input.nonColorCue ?? '', `${input.mode}/${input.role}.nonColorCue`);
      } else if (input.nonColorCue !== null) {
        requireNonEmpty(input.nonColorCue, `${input.mode}/${input.role}.nonColorCue`);
      }
      if (input.role === 'link' && !input.nonColorCue?.toLowerCase().includes('underline')) {
        fail('MISSING_NON_COLOR_CUE', `${input.mode}/link requires a persistent underline cue.`);
      }
      const accessibilityStatus =
        input.role === 'disabled'
          ? pairEvidence.every(evidence => evidence.status === 'inactive-exempt')
            ? 'inactive-exempt'
            : 'blocked'
          : pairEvidence.every(evidence => evidence.status === 'pass')
            ? 'pass'
            : 'blocked';
      const semanticRole: ColorSystemProductSemanticRoleV2 = {
        ...input,
        ref,
        pairEvidenceIds,
        intendedUse: requireNonEmpty(input.intendedUse, `${input.mode}/${input.role}.intendedUse`),
        evidenceIds: sortedUniqueStrings(
          input.evidenceIds,
          `${input.mode}/${input.role}.evidenceIds`
        ),
        resolved: resolveRef(resolver, ref, `${input.mode}/${input.role}.ref`),
        accessibilityStatus,
      };
      return semanticRole;
    });
  const expectedCount = modes.length * COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.length;
  if (normalized.length !== expectedCount) {
    fail(
      'MISSING_PRODUCT_SEMANTIC_ROLE',
      `Product semantics require exactly 13 roles per mode; expected ${expectedCount}.`
    );
  }
  for (const mode of modes) {
    const roles = normalized.filter(role => role.mode === mode).map(role => role.role);
    if (canonicalJson(roles) !== canonicalJson(COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2)) {
      fail(
        'MISSING_PRODUCT_SEMANTIC_ROLE',
        `${mode} must contain every product semantic role exactly once in canonical order.`
      );
    }
  }
  return normalized;
}

interface VisualizationSelectionInput {
  id: string;
  kind: 'categorical' | 'sequential' | 'diverging';
  marks: readonly ColorSystemDataVisualizationMarkV2[];
}

function deltaEOK(first: RGB, second: RGB): number {
  const left = rgbToOklab(first.r, first.g, first.b);
  const right = rgbToOklab(second.r, second.g, second.b);
  return Math.hypot(left.L - right.L, left.a - right.a, left.b - right.b);
}

function simulated(rgb: RGB, type: CVDType): RGB {
  return type === 'normal' ? rgb : simulateCVD(rgb, { type, severity: 1 });
}

function minimumPairwiseDelta(colors: readonly RGB[], type: CVDType): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let first = 0; first < colors.length; first += 1) {
    for (let second = first + 1; second < colors.length; second += 1) {
      minimum = Math.min(
        minimum,
        deltaEOK(simulated(colors[first], type), simulated(colors[second], type))
      );
    }
  }
  return minimum;
}

function opposingDelta(colors: readonly RGB[], type: CVDType): number {
  return deltaEOK(simulated(colors[0], type), simulated(colors[colors.length - 1], type));
}

function cvdAdvisory(
  colors: readonly RGB[],
  comparison: 'all-pairs' | 'opposing-arms'
): ColorSystemCvdAdvisoryEvidenceV2 {
  const measure = (type: CVDType): number =>
    comparison === 'all-pairs' ? minimumPairwiseDelta(colors, type) : opposingDelta(colors, type);
  const evidence: Omit<ColorSystemCvdAdvisoryEvidenceV2, 'status' | 'limitation'> = {
    policyVersion: COLOR_SYSTEM_APPLICATION_CVD_POLICY_VERSION,
    minimumDeltaEOK: COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK,
    normal: measure('normal'),
    protan: measure('protanopia'),
    deutan: measure('deuteranopia'),
    severeTritan: measure('tritanopia'),
  };
  const status = Object.values({
    normal: evidence.normal,
    protan: evidence.protan,
    deutan: evidence.deutan,
    severeTritan: evidence.severeTritan,
  }).every(value => value >= COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK)
    ? 'pass'
    : 'fail';
  return {
    ...evidence,
    status,
    limitation:
      'Machado severity-1 simulation is advisory policy evidence, not diagnosis, individual perception, WCAG conformance, or a colorblind-safe guarantee.',
  };
}

function visualizationMarks(
  resolver: Resolver,
  selection: VisualizationSelectionInput,
  surface: ColorSystemResolvedApplicationColorV2,
  job: ColorSystemJobV2
): ColorSystemVisualizationMarkEvidenceV2[] {
  const identities = new Set<string>();
  const hexes = new Set<string>();
  return selection.marks.map((mark, index) => {
    if (mark.order !== index + 1 || !mark.label.trim()) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        `${selection.id} marks require contiguous order and direct labels.`
      );
    }
    const ref: ColorSystemApplicationColorRefV2 = {
      kind: 'approved-family-member',
      ref: mark.ref,
    };
    assertRefEligibleForJob(resolver, ref, job, `${selection.id}.marks[${index}]`);
    const resolved = resolveRef(resolver, ref, `${selection.id}.marks[${index}]`);
    const identity = `${mark.ref.familyId}\u0000${mark.ref.memberId}\u0000${mark.ref.mode}`;
    if (identities.has(identity)) {
      fail('INVALID_DATA_VISUALIZATION_POLICY', `${selection.id} mark identities must be unique.`);
    }
    identities.add(identity);
    const renderedRgb = renderedOnSurface(resolved, surface, `${selection.id}.marks[${index}]`);
    const renderedHex = canonicalHex(renderedRgb);
    if (hexes.has(renderedHex)) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        `${selection.id} marks must remain unique after sRGB quantization.`
      );
    }
    hexes.add(renderedHex);
    return {
      order: mark.order,
      label: mark.label.trim(),
      ref,
      resolved,
      renderedRgb,
      renderedHex,
      oklabLightness: rgbToOklab(renderedRgb.r, renderedRgb.g, renderedRgb.b).L,
      relativeLuminance: getRelativeLuminance(renderedRgb.r, renderedRgb.g, renderedRgb.b),
    };
  });
}

function strictlyMonotonic(values: readonly number[], direction: 1 | -1): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] - values[index - 1]) * direction <= MONOTONIC_EPSILON) {
      return false;
    }
  }
  return true;
}

function normalizeCategorical(
  resolver: Resolver,
  input: ColorSystemCategoricalContextV2,
  evidenceById: ReadonlyMap<string, ColorSystemRenderedPairEvidenceV2>
): ColorSystemCategoricalSelectionV2 {
  assertExactKeys(
    input,
    [
      'selectionId',
      'marks',
      'surface',
      'evidenceIds',
      'adjacency',
      'boundary',
      'markPairEvidenceIds',
      'directLabels',
      'nonColorCue',
    ],
    'visualization.categorical'
  );
  const selection: VisualizationSelectionInput = {
    id: requireNonEmpty(input.selectionId, 'categorical selectionId'),
    kind: 'categorical',
    marks: input.marks,
  };
  if (selection.marks.length < 2 || selection.marks.length > 8) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      'Categorical selections support exactly the requested 2 through 8 marks; nine is not truncated.'
    );
  }
  if (input.directLabels !== true || !['shape', 'pattern'].includes(input.nonColorCue)) {
    fail(
      'MISSING_NON_COLOR_CUE',
      'Categorical marks require direct labels plus a shape or pattern cue.'
    );
  }
  assertRefEligibleForJob(resolver, input.surface, 'categorical-data', `${selection.id}.surface`);
  const surface = resolveRef(resolver, input.surface, `${selection.id}.surface`);
  const marks = visualizationMarks(resolver, selection, surface, 'categorical-data');
  const pairEvidenceIds = uniqueStringsInDeclaredOrder(
    input.markPairEvidenceIds,
    `${selection.id}.markPairEvidenceIds`
  );
  if (pairEvidenceIds.length !== marks.length) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} requires one exact non-text pair for each categorical mark.`
    );
  }
  marks.forEach((mark, index) => {
    const evidence = requireEvidence(
      evidenceById,
      pairEvidenceIds[index],
      `${selection.id}.markPairEvidenceIds[${index}]`
    );
    assertEvidenceEligibleForJob(
      resolver,
      evidence,
      'categorical-data',
      `${selection.id}.markPairEvidenceIds[${index}]`
    );
    if (
      evidence.context.category !== 'non-text' ||
      evidence.status !== 'pass' ||
      !pairContainsRef(evidence, mark.ref) ||
      !pairContainsRef(evidence, surface.ref)
    ) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        `${selection.id} categorical marks must pass 3:1 against the declared surface.`
      );
    }
  });
  let boundaryResolved: ColorSystemResolvedApplicationColorV2 | null = null;
  if (input.adjacency === 'separated') {
    if (input.boundary !== null) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        'Separated categorical marks may not add a boundary fallback.'
      );
    }
  } else if (input.adjacency === 'touching') {
    if (input.boundary === null) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        'Touching categorical regions require one admitted black or white boundary identity.'
      );
    }
    boundaryResolved = resolveRef(resolver, input.boundary, `${selection.id}.boundary`);
    assertRefEligibleForJob(
      resolver,
      input.boundary,
      'categorical-data',
      `${selection.id}.boundary`
    );
    if (!['#000000', '#FFFFFF'].includes(boundaryResolved.value.hex)) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        'A touching-region boundary must resolve to an admitted black or white identity.'
      );
    }
  } else {
    fail('INVALID_DATA_VISUALIZATION_POLICY', 'Categorical adjacency is unsupported.');
  }
  return {
    ...input,
    selectionId: requireNonEmpty(input.selectionId, 'categorical selectionId'),
    surface: normalizeRef(input.surface, `${selection.id}.surface`),
    boundary:
      input.boundary === null ? null : normalizeRef(input.boundary, `${selection.id}.boundary`),
    markPairEvidenceIds: pairEvidenceIds,
    evidenceIds: sortedUniqueStrings(input.evidenceIds, `${selection.id}.evidenceIds`),
    kind: 'categorical',
    marks,
    surfaceResolved: surface,
    boundaryResolved,
    cvdAdvisory: cvdAdvisory(
      marks.map(mark => mark.renderedRgb),
      'all-pairs'
    ),
  };
}

function normalizeSequential(
  resolver: Resolver,
  input: ColorSystemSequentialContextV2
): ColorSystemSequentialSelectionV2 {
  assertExactKeys(
    input,
    [
      'selectionId',
      'marks',
      'surface',
      'evidenceIds',
      'direction',
      'axisLabel',
      'endpointLabels',
      'nonColorCue',
    ],
    'visualization.sequential'
  );
  const selection: VisualizationSelectionInput = {
    id: requireNonEmpty(input.selectionId, 'sequential selectionId'),
    kind: 'sequential',
    marks: input.marks,
  };
  if (selection.marks.length < 3 || selection.marks.length > 9) {
    fail('INVALID_DATA_VISUALIZATION_POLICY', 'Sequential selections require 3 through 9 marks.');
  }
  if (input.nonColorCue !== 'axis-and-endpoint-labels') {
    fail(
      'MISSING_NON_COLOR_CUE',
      'Sequential specimens require an axis plus direct endpoint and value labels.'
    );
  }
  requireNonEmpty(input.axisLabel, `${selection.id}.axisLabel`);
  if (
    !Array.isArray(input.endpointLabels) ||
    input.endpointLabels.length !== 2 ||
    input.endpointLabels.some(label => !label.trim())
  ) {
    fail('MISSING_NON_COLOR_CUE', `${selection.id} requires two direct endpoint labels.`);
  }
  assertRefEligibleForJob(resolver, input.surface, 'sequential-data', `${selection.id}.surface`);
  const surface = resolveRef(resolver, input.surface, `${selection.id}.surface`);
  const marks = visualizationMarks(resolver, selection, surface, 'sequential-data');
  const direction =
    input.direction === 'light-to-dark' ? -1 : input.direction === 'dark-to-light' ? 1 : 0;
  if (
    direction === 0 ||
    !strictlyMonotonic(
      marks.map(mark => mark.oklabLightness),
      direction
    ) ||
    !strictlyMonotonic(
      marks.map(mark => mark.relativeLuminance),
      direction
    )
  ) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} must be strictly monotonic in OKLab lightness and final sRGB luminance.`
    );
  }
  const adjacent = marks.slice(0, -1).map((mark, index) => ({
    fromOrder: mark.order,
    toOrder: marks[index + 1].order,
    deltaEOK: deltaEOK(mark.renderedRgb, marks[index + 1].renderedRgb),
  }));
  const surfaceRgb = colorRgb(surface.value);
  const surfaceVisibility = marks.map(mark => ({
    order: mark.order,
    deltaEOK: deltaEOK(mark.renderedRgb, surfaceRgb),
  }));
  const observedMinimumAdjacentDeltaEOK = Math.min(...adjacent.map(item => item.deltaEOK));
  const observedMinimumSurfaceDeltaEOK = Math.min(...surfaceVisibility.map(item => item.deltaEOK));
  if (
    observedMinimumAdjacentDeltaEOK <
      COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK ||
    observedMinimumSurfaceDeltaEOK < COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK
  ) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} falls below the Teul adjacent-step or declared-surface Delta E OK threshold.`
    );
  }
  const perceptualEvidence: ColorSystemSequentialPerceptualEvidenceV2 = {
    policyVersion: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_POLICY_VERSION,
    minimumAdjacentDeltaEOK: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK,
    minimumSurfaceDeltaEOK: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK,
    adjacent,
    surface: surfaceVisibility,
    observedMinimumAdjacentDeltaEOK,
    observedMinimumSurfaceDeltaEOK,
    status: 'pass',
    limitation:
      'Delta E OK evidence describes this exact rendered sRGB ramp on its declared surface. It is a Teul chart-legibility policy, not WCAG contrast conformance or a guarantee across displays and viewers.',
  };
  return {
    ...input,
    selectionId: requireNonEmpty(input.selectionId, 'sequential selectionId'),
    surface: normalizeRef(input.surface, `${selection.id}.surface`),
    axisLabel: input.axisLabel.trim(),
    endpointLabels: [input.endpointLabels[0].trim(), input.endpointLabels[1].trim()],
    evidenceIds: sortedUniqueStrings(input.evidenceIds, `${selection.id}.evidenceIds`),
    kind: 'sequential',
    marks,
    surfaceResolved: surface,
    perceptualEvidence,
  };
}

function armIsMonotonic(
  values: readonly number[],
  midpointIndex: number,
  polarity: 'light' | 'dark'
): boolean {
  const towardMidpoint: 1 | -1 = polarity === 'light' ? 1 : -1;
  return (
    strictlyMonotonic(values.slice(0, midpointIndex + 1), towardMidpoint) &&
    strictlyMonotonic(values.slice(midpointIndex), -towardMidpoint as 1 | -1)
  );
}

function normalizeDiverging(
  resolver: Resolver,
  input: ColorSystemDivergingContextV2
): ColorSystemDivergingSelectionV2 {
  assertExactKeys(
    input,
    [
      'selectionId',
      'marks',
      'surface',
      'evidenceIds',
      'polarity',
      'midpointOrder',
      'midpointMeaning',
      'midpointPolarity',
      'zeroReferenceLine',
      'negativeLabel',
      'positiveLabel',
      'nonColorCue',
    ],
    'visualization.diverging'
  );
  const selection: VisualizationSelectionInput = {
    id: requireNonEmpty(input.selectionId, 'diverging selectionId'),
    kind: 'diverging',
    marks: input.marks,
  };
  const usesGeneratedContributions = input.polarity.authority === 'owner-confirmed';
  assertExactKeys(
    input.polarity,
    usesGeneratedContributions
      ? [
          'policyVersion',
          'negativeContributionId',
          'positiveContributionId',
          'authority',
          'evidenceIds',
        ]
      : [
          'policyVersion',
          'negativeSourceColorId',
          'positiveSourceColorId',
          'authority',
          'evidenceIds',
        ],
    `${selection.id}.polarity`
  );
  if (
    usesGeneratedContributions
      ? input.polarity.policyVersion !==
          COLOR_SYSTEM_APPLICATION_GENERATED_DIVERGING_SEMANTICS_POLICY_VERSION ||
        input.polarity.authority !== 'owner-confirmed'
      : input.polarity.policyVersion !==
          COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION ||
        input.polarity.authority !== 'governed-source'
  ) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} requires a supported hash-bound diverging-semantics policy.`
    );
  }
  const polarityEvidenceIds = sortedUniqueStrings(
    input.polarity.evidenceIds,
    `${selection.id}.polarity.evidenceIds`
  );
  let negativeIdentity: string;
  let positiveIdentity: string;
  let normalizedPolarity: ColorSystemDivergingPolarityV2;
  if (input.polarity.authority === 'owner-confirmed') {
    const generatedPolarity = input.polarity;
    const negativeContributionId = requireNonEmpty(
      generatedPolarity.negativeContributionId,
      `${selection.id}.polarity.negativeContributionId`
    );
    const positiveContributionId = requireNonEmpty(
      generatedPolarity.positiveContributionId,
      `${selection.id}.polarity.positiveContributionId`
    );
    const confirmed = resolver.brief.divergingPolarity;
    if (
      negativeContributionId === positiveContributionId ||
      !confirmed ||
      confirmed.negativeContributionId !== negativeContributionId ||
      confirmed.positiveContributionId !== positiveContributionId ||
      polarityEvidenceIds.length === 0 ||
      polarityEvidenceIds.some(evidenceId => !confirmed.evidenceIds.includes(evidenceId)) ||
      !resolver.candidate.families.some(
        family => family.contributionId === negativeContributionId
      ) ||
      !resolver.candidate.families.some(family => family.contributionId === positiveContributionId)
    ) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        `${selection.id} generated polarity does not resolve to the exact owner-confirmed contribution IDs.`
      );
    }
    negativeIdentity = negativeContributionId;
    positiveIdentity = positiveContributionId;
    normalizedPolarity = {
      policyVersion: COLOR_SYSTEM_APPLICATION_GENERATED_DIVERGING_SEMANTICS_POLICY_VERSION,
      negativeContributionId,
      positiveContributionId,
      authority: 'owner-confirmed',
      evidenceIds: polarityEvidenceIds,
    };
  } else {
    const governedPolarity = input.polarity;
    const negativeSourceColorId = requireNonEmpty(
      governedPolarity.negativeSourceColorId,
      `${selection.id}.polarity.negativeSourceColorId`
    );
    const positiveSourceColorId = requireNonEmpty(
      governedPolarity.positiveSourceColorId,
      `${selection.id}.polarity.positiveSourceColorId`
    );
    const negativeSource = resolver.brief.sourceReferenceColors.find(
      color =>
        color.stableColorId === negativeSourceColorId &&
        color.applicationRoles?.includes('diverging-negative')
    );
    const positiveSource = resolver.brief.sourceReferenceColors.find(
      color =>
        color.stableColorId === positiveSourceColorId &&
        color.applicationRoles?.includes('diverging-positive')
    );
    if (
      negativeSourceColorId === positiveSourceColorId ||
      !negativeSource ||
      !positiveSource ||
      polarityEvidenceIds.length === 0 ||
      polarityEvidenceIds.some(
        evidenceId =>
          !negativeSource.evidenceIds.includes(evidenceId) ||
          !positiveSource.evidenceIds.includes(evidenceId)
      )
    ) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        `${selection.id} polarity does not resolve to governed source roles and shared evidence.`
      );
    }
    negativeIdentity = negativeSourceColorId;
    positiveIdentity = positiveSourceColorId;
    normalizedPolarity = {
      policyVersion: COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION,
      negativeSourceColorId,
      positiveSourceColorId,
      authority: 'governed-source',
      evidenceIds: polarityEvidenceIds,
    };
  }
  if (![3, 5, 7, 9].includes(selection.marks.length)) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      'Diverging selections require an odd 3, 5, 7, or 9 marks.'
    );
  }
  const expectedMidpointOrder = (selection.marks.length + 1) / 2;
  if (input.midpointOrder !== expectedMidpointOrder) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} midpoint must be the exact center mark.`
    );
  }
  if (
    input.zeroReferenceLine !== true ||
    input.nonColorCue !== 'zero-line-and-sign-labels' ||
    !input.midpointMeaning.trim() ||
    !input.negativeLabel.trim() ||
    !input.positiveLabel.trim()
  ) {
    fail(
      'MISSING_NON_COLOR_CUE',
      `${selection.id} requires a meaningful midpoint, zero line, and sign labels.`
    );
  }
  assertRefEligibleForJob(resolver, input.surface, 'diverging-data', `${selection.id}.surface`);
  const surface = resolveRef(resolver, input.surface, `${selection.id}.surface`);
  const marks = visualizationMarks(resolver, selection, surface, 'diverging-data');
  const midpointIndex = input.midpointOrder - 1;
  const markPolarityIdentities = marks.map(mark => {
    if (mark.ref.kind !== 'approved-family-member') return [];
    const approvedRef = mark.ref.ref;
    const family = resolver.candidate.families.find(
      candidate => candidate.stableFamilyId === approvedRef.familyId
    );
    if (!family) return [];
    return usesGeneratedContributions
      ? [family.contributionId]
      : (family.members.find(member => member.stableMemberId === approvedRef.memberId)?.provenance
          .sourceColorIds ?? []);
  });
  if (
    markPolarityIdentities
      .slice(0, midpointIndex)
      .some(identities => !identities.includes(negativeIdentity)) ||
    markPolarityIdentities
      .slice(midpointIndex + 1)
      .some(identities => !identities.includes(positiveIdentity)) ||
    markPolarityIdentities[midpointIndex].includes(negativeIdentity) ||
    markPolarityIdentities[midpointIndex].includes(positiveIdentity)
  ) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} must place governed negative colors before the midpoint and governed positive colors after it.`
    );
  }
  if (
    !armIsMonotonic(
      marks.map(mark => mark.oklabLightness),
      midpointIndex,
      input.midpointPolarity
    ) ||
    !armIsMonotonic(
      marks.map(mark => mark.relativeLuminance),
      midpointIndex,
      input.midpointPolarity
    )
  ) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} must contain two monotonic arms around the declared midpoint.`
    );
  }
  return {
    ...input,
    selectionId: requireNonEmpty(input.selectionId, 'diverging selectionId'),
    surface: normalizeRef(input.surface, `${selection.id}.surface`),
    midpointMeaning: input.midpointMeaning.trim(),
    negativeLabel: input.negativeLabel.trim(),
    positiveLabel: input.positiveLabel.trim(),
    evidenceIds: sortedUniqueStrings(input.evidenceIds, `${selection.id}.evidenceIds`),
    polarity: normalizedPolarity,
    kind: 'diverging',
    marks,
    surfaceResolved: surface,
    cvdAdvisory: cvdAdvisory(
      marks.map(mark => mark.renderedRgb),
      'opposing-arms'
    ),
  };
}

function typographyCategoryRank(category: ColorSystemTypographyUseCategoryV2): number {
  return REQUIRED_TYPOGRAPHY_CATEGORIES.indexOf(category);
}

function normalizeTypography(
  resolver: Resolver,
  inputs: readonly ColorSystemTypographySpecimenInputV2[],
  modes: readonly string[],
  evidenceById: ReadonlyMap<string, ColorSystemRenderedPairEvidenceV2>
): ColorSystemTypographySpecimenV2[] {
  const normalized = [...inputs]
    .map((input, index) => {
      assertExactKeys(
        input,
        [
          'specimenId',
          'useCategory',
          'mode',
          'pairEvidenceId',
          'fontSizePx',
          'fontWeight',
          'intendedUse',
          'evidenceIds',
        ],
        `typography[${index}]`
      );
      const specimenId = requireNonEmpty(input.specimenId, 'typography specimenId');
      if (!REQUIRED_TYPOGRAPHY_CATEGORIES.includes(input.useCategory)) {
        fail(
          'INVALID_TYPOGRAPHY_SPECIMEN',
          `${specimenId} has an unsupported Typography category.`
        );
      }
      const mode = requireNonEmpty(input.mode, `${specimenId}.mode`);
      const evidence = requireEvidence(
        evidenceById,
        input.pairEvidenceId,
        `${specimenId}.pairEvidenceId`
      );
      assertEvidenceEligibleForJob(
        resolver,
        evidence,
        'rendered-text-pair',
        `${specimenId}.pairEvidenceId`
      );
      const expectedSize = input.useCategory === 'large-heading' ? 24 : 16;
      const expectedCategory = input.useCategory === 'large-heading' ? 'large-text' : 'normal-text';
      if (
        input.fontSizePx !== expectedSize ||
        input.fontWeight !== 400 ||
        evidence.context.fontSizePx !== expectedSize ||
        evidence.context.fontWeight !== 400 ||
        evidence.context.category !== expectedCategory ||
        evidence.context.mode !== mode
      ) {
        fail(
          'INVALID_TYPOGRAPHY_SPECIMEN',
          `${specimenId} must use its exact 16 px or 24 px regular rendered-pair context.`
        );
      }
      return {
        ...input,
        specimenId,
        pairEvidenceId: evidence.context.id,
        intendedUse: requireNonEmpty(input.intendedUse, `${specimenId}.intendedUse`),
        evidenceIds: sortedUniqueStrings(input.evidenceIds, `${specimenId}.evidenceIds`),
        useCategory: input.useCategory,
        mode,
        foreground: evidence.context.foreground,
        background: evidence.context.background,
        underlay: evidence.context.underlay,
        ratio: evidence.ratio,
        threshold: evidence.requiredRatio,
        status: evidence.status,
      };
    })
    .sort(
      (left, right) =>
        compareText(left.mode, right.mode) ||
        typographyCategoryRank(left.useCategory) - typographyCategoryRank(right.useCategory)
    );
  if (normalized.length !== modes.length * REQUIRED_TYPOGRAPHY_CATEGORIES.length) {
    fail(
      'INVALID_TYPOGRAPHY_SPECIMEN',
      'Typography requires primary body, supporting body, large heading, and reverse body in every mode.'
    );
  }
  for (const mode of modes) {
    const categories = normalized
      .filter(specimen => specimen.mode === mode)
      .map(specimen => specimen.useCategory);
    if (canonicalJson(categories) !== canonicalJson(REQUIRED_TYPOGRAPHY_CATEGORIES)) {
      fail(
        'INVALID_TYPOGRAPHY_SPECIMEN',
        `${mode} requires exactly the four canonical Typography specimens.`
      );
    }
  }
  return normalized;
}

function blockersFromEvidence(
  evidence: readonly ColorSystemRenderedPairEvidenceV2[],
  categorical: ColorSystemCategoricalSelectionV2,
  diverging: ColorSystemDivergingSelectionV2
): ColorSystemApplicationBlockerV2[] {
  const blockers: ColorSystemApplicationBlockerV2[] = [];
  for (const pair of evidence) {
    if (pair.context.assessment !== 'required') continue;
    if (pair.status === 'fail') {
      blockers.push({
        code: 'PAIR_THRESHOLD_FAILED',
        evidenceId: pair.context.id,
        message: `${pair.context.id} fails its unrounded ${pair.requiredRatio}:1 rendered-pair threshold.`,
      });
    } else if (pair.status === 'unassessed') {
      blockers.push({
        code: 'PAIR_CONTEXT_UNASSESSED',
        evidenceId: pair.context.id,
        message: `${pair.context.id} is unassessed because its exact rendered backdrop is unavailable.`,
      });
    }
  }
  for (const selection of [categorical, diverging]) {
    if (selection.cvdAdvisory.status === 'fail') {
      blockers.push({
        code: 'CVD_ADVISORY_SEPARATION_FAILED',
        evidenceId: selection.selectionId,
        message: `${selection.selectionId} falls below the Teul advisory Delta E OK threshold in at least one modeled view.`,
      });
    }
  }
  return blockers.sort(
    (left, right) =>
      compareText(left.code, right.code) || compareText(left.evidenceId, right.evidenceId)
  );
}

function applicationRatings(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  productGraphics: readonly ColorSystemProductGraphicsSpecimenV2[],
  categorical: ColorSystemCategoricalSelectionV2,
  sequential: ColorSystemSequentialSelectionV2,
  diverging: ColorSystemDivergingSelectionV2,
  typography: readonly ColorSystemTypographySpecimenV2[]
): ColorSystemSectionRatingV2[] {
  const fraction = (passing: number, total: number): number => (total === 0 ? 0 : passing / total);
  const eligibleJobs = new Set(candidate.jobEligibility.flatMap(entry => entry.jobs));
  return [
    {
      section: 'primary',
      dimensions: [
        {
          id: 'primary-lock-coverage',
          label: 'Exact Primary lock coverage',
          measuredValue: brief.primaryLocks.length,
          threshold: brief.primaryLocks.length,
          unit: 'locks',
          evidenceIds: brief.primaryLocks.map(lock => lock.lockId),
        },
      ],
      limitation: 'This measures retained exact lock receipts, not subjective brand quality.',
    },
    {
      section: 'secondary',
      dimensions: [
        {
          id: 'secondary-job-eligibility-coverage',
          label: 'Reviewed Secondary job eligibility',
          measuredValue: fraction(
            brief.requiredSecondaryJobs.filter(job => eligibleJobs.has(job)).length,
            brief.requiredSecondaryJobs.length
          ),
          threshold: 1,
          unit: 'fraction',
          evidenceIds: candidate.jobEligibility.flatMap(entry => entry.evidenceIds),
        },
      ],
      limitation:
        'Eligibility is member-and-mode specific and does not imply every context passes.',
    },
    {
      section: 'product-graphics',
      dimensions: [
        {
          id: 'product-graphics-context-pass',
          label: 'Product Graphics context pass or exemption',
          measuredValue: fraction(
            productGraphics.filter(item => item.accessibilityStatus !== 'blocked').length,
            productGraphics.length
          ),
          threshold: 1,
          unit: 'fraction',
          evidenceIds: productGraphics.flatMap(item => item.evidenceIds),
        },
      ],
      limitation: 'Results apply only to the exact declared specimens and rendered pair evidence.',
    },
    {
      section: 'data-visualization',
      dimensions: [
        {
          id: 'data-visualization-policy-coverage',
          label: 'Required chart policy coverage',
          measuredValue: 3,
          threshold: 3,
          unit: 'chart-kinds',
          evidenceIds: [
            ...categorical.evidenceIds,
            ...sequential.evidenceIds,
            ...diverging.evidenceIds,
          ],
        },
        {
          id: 'data-visualization-cvd-advisory',
          label: 'Advisory CVD separation checks',
          measuredValue: fraction(
            [categorical.cvdAdvisory, diverging.cvdAdvisory].filter(
              evidence => evidence.status === 'pass'
            ).length,
            2
          ),
          threshold: 1,
          unit: 'fraction',
          evidenceIds: [categorical.selectionId, diverging.selectionId],
        },
      ],
      limitation: 'CVD simulation is advisory evidence and is not a colorblind-safe claim.',
    },
    {
      section: 'typography',
      dimensions: [
        {
          id: 'typography-rendered-pair-pass',
          label: 'Exact Typography pairs passing',
          measuredValue: fraction(
            typography.filter(item => item.status === 'pass').length,
            typography.length
          ),
          threshold: 1,
          unit: 'fraction',
          evidenceIds: typography.map(item => item.pairEvidenceId),
        },
      ],
      limitation: 'Only exact rendered text pairs receive WCAG contrast results.',
    },
  ];
}

function allReferencedEvidenceIds(
  productGraphics: readonly ColorSystemProductGraphicsSpecimenV2[],
  productSemantics: readonly ColorSystemProductSemanticRoleV2[],
  categorical: ColorSystemCategoricalSelectionV2,
  typography: readonly ColorSystemTypographySpecimenV2[]
): Set<string> {
  return new Set([
    ...productGraphics.flatMap(specimen => specimen.pairEvidenceIds),
    ...productSemantics.flatMap(role => role.pairEvidenceIds),
    ...categorical.markPairEvidenceIds,
    ...typography.map(specimen => specimen.pairEvidenceId),
  ]);
}

export function buildColorSystemApplicationBlueprintV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  input: ColorSystemApplicationSystemBlueprintV2Input
): ColorSystemApplicationSystemBlueprintV2 {
  assertColorSystemBuilderBriefV2Integrity(brief);
  assertColorSystemStrategyCandidateV2Integrity(brief, candidate);
  if (candidate.status !== 'complete') {
    fail(
      'INVALID_APPLICATION_INPUT',
      'Only a complete v2 strategy candidate can produce an application blueprint.'
    );
  }
  assertExactKeys(
    input,
    [
      'compilerVersion',
      'modes',
      'productGraphics',
      'productSemantics',
      'visualization',
      'typography',
      'pairContexts',
      'limitations',
    ],
    'application blueprint input'
  );
  assertExactKeys(
    input.visualization,
    ['categorical', 'sequential', 'diverging'],
    'application blueprint visualization input'
  );
  const modes = sortedUniqueStrings(input.modes, 'application modes');
  if (modes.length === 0)
    fail('INVALID_APPLICATION_INPUT', 'At least one application mode is required.');
  const foldedModes = modes.map(mode => mode.toLowerCase());
  if (new Set(foldedModes).size !== foldedModes.length) {
    fail('INVALID_APPLICATION_INPUT', 'Application modes cannot differ only by case.');
  }
  const resolver: Resolver = { brief, candidate, modes: new Set(modes) };
  const pairEvidence = [...input.pairContexts]
    .map(context => normalizePairContext(resolver, context))
    .sort((left, right) => compareText(left.context.id, right.context.id));
  if (new Set(pairEvidence.map(evidence => evidence.context.id)).size !== pairEvidence.length) {
    fail('INVALID_APPLICATION_INPUT', 'Rendered pair evidence IDs must be unique.');
  }
  const evidenceById = new Map(
    pairEvidence.map(evidence => [evidence.context.id, evidence] as const)
  );
  const productGraphics = normalizeProductGraphics(resolver, input.productGraphics, evidenceById);
  const productSemantics = normalizeProductSemantics(
    resolver,
    input.productSemantics,
    modes,
    evidenceById
  );
  const categorical = normalizeCategorical(resolver, input.visualization.categorical, evidenceById);
  const sequential = normalizeSequential(resolver, input.visualization.sequential);
  const diverging = normalizeDiverging(resolver, input.visualization.diverging);
  const typography = normalizeTypography(resolver, input.typography, modes, evidenceById);
  const referencedEvidenceIds = allReferencedEvidenceIds(
    productGraphics,
    productSemantics,
    categorical,
    typography
  );
  for (const evidence of pairEvidence) {
    if (!referencedEvidenceIds.has(evidence.context.id)) {
      fail(
        'INVALID_APPLICATION_INPUT',
        `${evidence.context.id} is orphan pair evidence and must be removed or bound to an application use.`
      );
    }
  }
  const suppliedLimitations = sortedUniqueStrings(input.limitations, 'application limitations');
  const limitations = [...new Set([...STANDARD_LIMITATIONS, ...suppliedLimitations])].sort(
    compareText
  );
  const policyVersions: ColorSystemApplicationPolicyVersionsV2 = {
    compiler: COLOR_SYSTEM_APPLICATION_COMPILER_V2_POLICY_VERSION,
    wcag: COLOR_SYSTEM_APPLICATION_WCAG_POLICY_VERSION,
    cvdAdvisory: COLOR_SYSTEM_APPLICATION_CVD_POLICY_VERSION,
    sequentialPerceptual: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_POLICY_VERSION,
    divergingSemantics: COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION,
    sourcePolicy: candidate.policyVersion,
  };
  const blockers = blockersFromEvidence(pairEvidence, categorical, diverging);
  const ratings = applicationRatings(
    brief,
    candidate,
    productGraphics,
    categorical,
    sequential,
    diverging,
    typography
  );
  const applicationEvidenceHash = deterministicContentHash({
    sourceHash: brief.sourceHash,
    briefHash: brief.briefHash,
    actualSystemHash: candidate.actualSystemHash,
    candidateHash: candidate.candidateHash,
    productGraphics,
    productSemantics,
    pairEvidence,
    visualization: {
      categorical,
      sequential,
      diverging,
    },
    typography,
    limitations,
    policyVersions,
    ratings,
    blockers,
  });
  const content: BlueprintContent = {
    schemaVersion: COLOR_SYSTEM_APPLICATION_BLUEPRINT_V2_SCHEMA_VERSION,
    sourceHash: brief.sourceHash,
    sourcePackageHash: brief.sourcePackageHash,
    briefHash: brief.briefHash,
    candidateId: candidate.id,
    candidateHash: candidate.candidateHash,
    brandFitProfileHash: brief.brandFitProfileHash,
    profile: 'srgb',
    compilerVersion: requireNonEmpty(input.compilerVersion, 'application compilerVersion'),
    modes,
    status: blockers.length === 0 ? 'ready' : 'blocked',
    productGraphics,
    productSemantics,
    visualization: { categorical, sequential, diverging },
    typography,
    pairEvidence,
    limitations,
    policyVersions,
    ratings,
    blockers,
    applicationEvidenceHash,
  };
  return {
    ...content,
    applicationBlueprintHash: deterministicContentHash(content),
  };
}

function inputFromBlueprint(
  blueprint: ColorSystemApplicationSystemBlueprintV2
): ColorSystemApplicationSystemBlueprintV2Input {
  return {
    compilerVersion: blueprint.compilerVersion,
    modes: blueprint.modes,
    productGraphics: blueprint.productGraphics.map(specimen => ({
      derivationId: specimen.derivationId,
      job: specimen.job,
      order: specimen.order,
      mode: specimen.mode,
      intendedUse: specimen.intendedUse,
      excludedUses: specimen.excludedUses,
      assessment: specimen.assessment,
      pairEvidenceIds: specimen.pairEvidenceIds,
      nonColorCue: specimen.nonColorCue,
      evidenceIds: specimen.evidenceIds,
      sourceRefs: specimen.sourceRefs,
      transform: specimen.transform,
    })),
    productSemantics: blueprint.productSemantics.map(role => ({
      role: role.role,
      mode: role.mode,
      ref: role.ref,
      pairEvidenceIds: role.pairEvidenceIds,
      nonColorCue: role.nonColorCue,
      intendedUse: role.intendedUse,
      evidenceIds: role.evidenceIds,
    })),
    visualization: {
      categorical: {
        selectionId: blueprint.visualization.categorical.selectionId,
        marks: blueprint.visualization.categorical.marks.map(mark => ({
          order: mark.order,
          label: mark.label,
          ref:
            mark.ref.kind === 'approved-family-member'
              ? mark.ref.ref
              : (() => {
                  throw new ColorSystemApplicationBlueprintV2Error(
                    'APPLICATION_BLUEPRINT_INTEGRITY',
                    'Visualization marks must retain approved Secondary references.'
                  );
                })(),
        })),
        surface: blueprint.visualization.categorical.surface,
        evidenceIds: blueprint.visualization.categorical.evidenceIds,
        adjacency: blueprint.visualization.categorical.adjacency,
        boundary: blueprint.visualization.categorical.boundary,
        markPairEvidenceIds: blueprint.visualization.categorical.markPairEvidenceIds,
        directLabels: blueprint.visualization.categorical.directLabels,
        nonColorCue: blueprint.visualization.categorical.nonColorCue,
      },
      sequential: {
        selectionId: blueprint.visualization.sequential.selectionId,
        marks: blueprint.visualization.sequential.marks.map(mark => ({
          order: mark.order,
          label: mark.label,
          ref:
            mark.ref.kind === 'approved-family-member'
              ? mark.ref.ref
              : (() => {
                  throw new ColorSystemApplicationBlueprintV2Error(
                    'APPLICATION_BLUEPRINT_INTEGRITY',
                    'Visualization marks must retain approved Secondary references.'
                  );
                })(),
        })),
        surface: blueprint.visualization.sequential.surface,
        evidenceIds: blueprint.visualization.sequential.evidenceIds,
        direction: blueprint.visualization.sequential.direction,
        axisLabel: blueprint.visualization.sequential.axisLabel,
        endpointLabels: blueprint.visualization.sequential.endpointLabels,
        nonColorCue: blueprint.visualization.sequential.nonColorCue,
      },
      diverging: {
        selectionId: blueprint.visualization.diverging.selectionId,
        marks: blueprint.visualization.diverging.marks.map(mark => ({
          order: mark.order,
          label: mark.label,
          ref:
            mark.ref.kind === 'approved-family-member'
              ? mark.ref.ref
              : (() => {
                  throw new ColorSystemApplicationBlueprintV2Error(
                    'APPLICATION_BLUEPRINT_INTEGRITY',
                    'Visualization marks must retain approved Secondary references.'
                  );
                })(),
        })),
        surface: blueprint.visualization.diverging.surface,
        evidenceIds: blueprint.visualization.diverging.evidenceIds,
        polarity: blueprint.visualization.diverging.polarity,
        midpointOrder: blueprint.visualization.diverging.midpointOrder,
        midpointMeaning: blueprint.visualization.diverging.midpointMeaning,
        midpointPolarity: blueprint.visualization.diverging.midpointPolarity,
        zeroReferenceLine: blueprint.visualization.diverging.zeroReferenceLine,
        negativeLabel: blueprint.visualization.diverging.negativeLabel,
        positiveLabel: blueprint.visualization.diverging.positiveLabel,
        nonColorCue: blueprint.visualization.diverging.nonColorCue,
      },
    },
    typography: blueprint.typography.map(specimen => ({
      specimenId: specimen.specimenId,
      useCategory: specimen.useCategory,
      mode: specimen.mode,
      pairEvidenceId: specimen.pairEvidenceId,
      fontSizePx: specimen.fontSizePx,
      fontWeight: specimen.fontWeight,
      intendedUse: specimen.intendedUse,
      evidenceIds: specimen.evidenceIds,
    })),
    pairContexts: blueprint.pairEvidence.map(evidence => evidence.context),
    limitations: blueprint.limitations,
  };
}

export function assertColorSystemApplicationBlueprintV2Integrity(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  blueprint: ColorSystemApplicationSystemBlueprintV2
): void {
  if (
    !HASH_PATTERN.test(blueprint.applicationEvidenceHash) ||
    !HASH_PATTERN.test(blueprint.applicationBlueprintHash) ||
    blueprint.schemaVersion !== COLOR_SYSTEM_APPLICATION_BLUEPRINT_V2_SCHEMA_VERSION ||
    blueprint.sourceHash !== brief.sourceHash ||
    blueprint.sourcePackageHash !== brief.sourcePackageHash ||
    blueprint.briefHash !== brief.briefHash ||
    blueprint.candidateId !== candidate.id ||
    blueprint.candidateHash !== candidate.candidateHash ||
    blueprint.brandFitProfileHash !== brief.brandFitProfileHash ||
    blueprint.profile !== 'srgb'
  ) {
    fail(
      'APPLICATION_BLUEPRINT_INTEGRITY',
      'Application blueprint authority does not match the complete v2 brief and candidate.'
    );
  }
  const rebuilt = buildColorSystemApplicationBlueprintV2(
    brief,
    candidate,
    inputFromBlueprint(blueprint)
  );
  if (canonicalJson(rebuilt) !== canonicalJson(blueprint)) {
    fail(
      'APPLICATION_BLUEPRINT_INTEGRITY',
      'Application blueprint failed canonical hash and evidence integrity validation.'
    );
  }
}

export type ColorSystemSectionBlueprintV2FrameTuple = readonly [
  ColorSystemRoleFrameRecipeV2,
  ColorSystemRoleFrameRecipeV2,
  ColorSystemRoleFrameRecipeV2,
  ColorSystemRoleFrameRecipeV2,
  ColorSystemRoleFrameRecipeV2,
];

export interface ColorSystemSectionBlueprintV2 {
  version: typeof COLOR_SYSTEM_SECTION_BLUEPRINT_V2_SCHEMA_VERSION;
  policyVersion: typeof COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION;
  sourceHash: string;
  sourcePackageHash: string;
  briefHash: string;
  candidateId: string;
  candidateHash: string;
  presentationProfileHash: string;
  applicationBlueprintHash: string;
  applicationEvidenceHash: string;
  compilerVersion: string;
  families: readonly ColorSystemSecondaryFamilyV2[];
  /** Full downstream authority; no application field is copied from the strategy candidate. */
  applicationBlueprint: ColorSystemApplicationSystemBlueprintV2;
  frames: ColorSystemSectionBlueprintV2FrameTuple;
  sectionBlueprintHash: string;
}

export interface ColorSystemSectionBlueprintV2Input {
  applicationBlueprint: ColorSystemApplicationSystemBlueprintV2;
  compilerVersion: string;
  frames: ColorSystemSectionBlueprintV2FrameTuple;
}

type SectionBlueprintContent = Omit<ColorSystemSectionBlueprintV2, 'sectionBlueprintHash'>;

const FRAME_ELIGIBILITY_JOBS: Readonly<
  Record<
    Exclude<(typeof COLOR_SYSTEM_SECTION_ROLES_V2)[number], 'primary'>,
    readonly ColorSystemJobV2[]
  >
> = {
  secondary: ['marketing-accent'],
  'product-graphics': ['product-graphics', 'functional-iconography', 'product-ui-surface'],
  'data-visualization': ['categorical-data', 'sequential-data', 'diverging-data'],
  typography: ['rendered-text-pair'],
};

function normalizeSectionFrames(
  brief: ColorSystemBuilderBriefV2,
  resolver: Resolver,
  frames: readonly ColorSystemRoleFrameRecipeV2[]
): ColorSystemSectionBlueprintV2FrameTuple {
  if (frames.length !== COLOR_SYSTEM_SECTION_ROLES_V2.length) {
    fail('INVALID_APPLICATION_INPUT', 'Section blueprint must contain exactly five frames.');
  }
  const normalized = frames.map((frame, index) => {
    const expectedRole = COLOR_SYSTEM_SECTION_ROLES_V2[index];
    const section = brief.sections[index];
    if (
      frame.role !== expectedRole ||
      frame.order !== index + 1 ||
      frame.disposition !== section.disposition ||
      frame.ratingSection !== expectedRole
    ) {
      fail(
        'INVALID_APPLICATION_INPUT',
        'Frame role, order, disposition, or rating identity does not match the brief.'
      );
    }
    const title = requireNonEmpty(frame.title, `${frame.role} frame title`);
    const guidance = requireNonEmpty(frame.guidance, `${frame.role} frame guidance`);
    const colorRefs = frame.colorRefs.map((ref, refIndex) => {
      const normalizedRef = normalizeRef(ref, `${frame.role}.colorRefs[${refIndex}]`);
      resolveRef(resolver, normalizedRef, `${frame.role}.colorRefs[${refIndex}]`);
      if (frame.role !== 'primary' && normalizedRef.kind === 'approved-family-member') {
        const allowedJobs = FRAME_ELIGIBILITY_JOBS[frame.role];
        const eligible = allowedJobs.some(job => {
          try {
            assertRefEligibleForJob(
              resolver,
              normalizedRef,
              job,
              `${frame.role}.colorRefs[${refIndex}]`
            );
            return true;
          } catch (error) {
            if (error instanceof ColorSystemApplicationBlueprintV2Error) return false;
            throw error;
          }
        });
        if (!eligible) {
          fail(
            'ORPHAN_APPLICATION_REFERENCE',
            `${frame.role}.colorRefs[${refIndex}] is not eligible for this section.`
          );
        }
      }
      return normalizedRef;
    });
    const exampleIds = sortedUniqueStrings(frame.exampleIds, `${frame.role} exampleIds`);
    if (
      frame.cardBoundary.kind !== 'none' &&
      (frame.cardBoundary.kind !== 'monochrome-inside-1px' ||
        !['#000000', '#FFFFFF'].includes(frame.cardBoundary.color))
    ) {
      fail(
        'INVALID_APPLICATION_INPUT',
        'Card boundaries may use only one inside black or white pixel.'
      );
    }
    return { ...frame, title, guidance, colorRefs, exampleIds };
  });
  return normalized as unknown as ColorSystemSectionBlueprintV2FrameTuple;
}

export function buildColorSystemSectionBlueprintV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  input: ColorSystemSectionBlueprintV2Input
): ColorSystemSectionBlueprintV2 {
  assertColorSystemBuilderBriefV2Integrity(brief);
  assertColorSystemStrategyCandidateV2Integrity(brief, candidate);
  assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, input.applicationBlueprint);
  if (candidate.status !== 'complete' || input.applicationBlueprint.status !== 'ready') {
    fail(
      'INVALID_APPLICATION_INPUT',
      'Only a complete candidate with a ready application blueprint can produce a section blueprint.'
    );
  }
  const compilerVersion = requireNonEmpty(input.compilerVersion, 'section compilerVersion');
  const resolver: Resolver = {
    brief,
    candidate,
    modes: new Set(input.applicationBlueprint.modes),
  };
  const frames = normalizeSectionFrames(brief, resolver, input.frames);
  const content: SectionBlueprintContent = {
    version: COLOR_SYSTEM_SECTION_BLUEPRINT_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    sourceHash: brief.sourceHash,
    sourcePackageHash: brief.sourcePackageHash,
    briefHash: brief.briefHash,
    candidateId: candidate.id,
    candidateHash: candidate.candidateHash,
    presentationProfileHash: brief.presentationProfileHash,
    applicationBlueprintHash: input.applicationBlueprint.applicationBlueprintHash,
    applicationEvidenceHash: input.applicationBlueprint.applicationEvidenceHash,
    compilerVersion,
    families: candidate.families,
    applicationBlueprint: input.applicationBlueprint,
    frames,
  };
  return { ...content, sectionBlueprintHash: deterministicContentHash(content) };
}

export function assertColorSystemSectionBlueprintV2Integrity(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  blueprint: ColorSystemSectionBlueprintV2
): void {
  if (
    !HASH_PATTERN.test(blueprint.sectionBlueprintHash) ||
    blueprint.version !== COLOR_SYSTEM_SECTION_BLUEPRINT_V2_SCHEMA_VERSION ||
    blueprint.policyVersion !== COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION ||
    blueprint.sourceHash !== brief.sourceHash ||
    blueprint.sourcePackageHash !== brief.sourcePackageHash ||
    blueprint.briefHash !== brief.briefHash ||
    blueprint.candidateId !== candidate.id ||
    blueprint.candidateHash !== candidate.candidateHash ||
    blueprint.presentationProfileHash !== brief.presentationProfileHash ||
    blueprint.applicationBlueprintHash !==
      blueprint.applicationBlueprint.applicationBlueprintHash ||
    blueprint.applicationEvidenceHash !== blueprint.applicationBlueprint.applicationEvidenceHash
  ) {
    fail(
      'APPLICATION_BLUEPRINT_INTEGRITY',
      'Section blueprint authority does not match the full reviewed v2 application inputs.'
    );
  }
  const rebuilt = buildColorSystemSectionBlueprintV2(brief, candidate, {
    applicationBlueprint: blueprint.applicationBlueprint,
    compilerVersion: blueprint.compilerVersion,
    frames: blueprint.frames,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(blueprint)) {
    fail(
      'APPLICATION_BLUEPRINT_INTEGRITY',
      'Section blueprint failed canonical full-application integrity validation.'
    );
  }
}
