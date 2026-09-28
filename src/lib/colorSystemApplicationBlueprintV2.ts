import {
  COLOR_SYSTEM_STRUCTURAL_GROUND_SOURCES_V2,
  COLOR_SYSTEM_CHART_ORDER_SOURCES_V2,
  COLOR_SYSTEM_VISUALIZATION_MARK_ORIGINS_V2,
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2,
  COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2,
  COLOR_SYSTEM_SEMANTIC_MEANING_SOURCES_V2,
} from './colorSystemApplicationVocabularyV2';
export {
  COLOR_SYSTEM_STRUCTURAL_GROUND_SOURCES_V2,
  COLOR_SYSTEM_CHART_ORDER_SOURCES_V2,
  COLOR_SYSTEM_VISUALIZATION_MARK_ORIGINS_V2,
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2,
  COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2,
  COLOR_SYSTEM_SEMANTIC_MEANING_SOURCES_V2,
} from './colorSystemApplicationVocabularyV2';
import { getAPCAContrast, getRelativeLuminance, getWCAGContrast } from './accessibility';
import { simulateCVD, type CVDType } from './colorBlindness';
import { canonicalJson, canonicalNumber, deterministicContentHash } from './colorSystemHashing';
import {
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_SECTION_BLUEPRINT_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_SECTION_ROLES_V2,
  COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2,
  type ColorSystemApplicationColorRefV2,
  type ColorSystemApprovedColorRefV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
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
import { compareText, hexToOklch, rgbToOklab, type RGB } from './utils';
import {
  buildColorSystemSrgbValueV1,
  colorSystemRgbDeltaEOKV1 as deltaEOK,
  colorSystemSrgbToOklchV1,
  colorSystemSrgbToRgbV1 as colorRgb,
  compositeColorSystemRgbV1 as composite,
  normalizeColorSystemSrgbValueV1,
} from './colorSystemSrgbValueV1';
import {
  COLOR_SYSTEM_INTERACTION_PLAN_V1_LIMITS,
  normalizeColorSystemInteractionRequirementsV1,
  type ColorSystemInteractionApplicationInputV1,
  type ColorSystemInteractionApplicationV1,
  type ColorSystemInteractionStatePlanV1,
} from './colorSystemInteractionPlanV1';
import { selectColorSystemInteractionStatesV1 } from './colorSystemInteractionStatesV1';
import {
  buildColorSystemProductGraphicsRenderingV1,
  colorSystemProductGraphicsCandidateAllowedV1,
  normalizeColorSystemProductGraphicsRequirementsV1,
  type ColorSystemProductGraphicsRequirementsV1,
  type ColorSystemProductGraphicsRenderingV1,
} from './colorSystemProductGraphicsPlanV1';

export const COLOR_SYSTEM_APPLICATION_BLUEPRINT_V2_SCHEMA_VERSION =
  'teul-application-system-v2' as const;
export const COLOR_SYSTEM_APPLICATION_COMPILER_V2_POLICY_VERSION =
  'teul-application-system-compiler/v2' as const;
export const COLOR_SYSTEM_APPLICATION_WCAG_POLICY_VERSION = 'wcag-2.2-srgb-rendered-pairs' as const;
/**
 * APCA (Accessible Perceptual Contrast Algorithm, apca-w3 0.1.9) Lc values are
 * recorded beside every assessed rendered pair as supplementary evidence. Teul
 * never gates on Lc; WCAG 2.2 ratios remain the only pass/fail authority.
 */
export const COLOR_SYSTEM_APPLICATION_APCA_POLICY_VERSION =
  'apca-w3-0.1.9-supplementary-lc' as const;
export const COLOR_SYSTEM_APPLICATION_CVD_POLICY_VERSION =
  'machado-2009-severity-1-advisory' as const;
export const COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK = 0.08;
export const COLOR_SYSTEM_APPLICATION_SEQUENTIAL_POLICY_VERSION =
  'teul-sequential-perceptual-separation/v2' as const;
export const COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK = 0.04;
export const COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK = 0.03;
export const COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION =
  'teul-governed-diverging-semantics/v1' as const;
export const COLOR_SYSTEM_APPLICATION_GENERATED_DIVERGING_SEMANTICS_POLICY_VERSION =
  'teul-owner-confirmed-generated-diverging-semantics/v1' as const;
/**
 * p3-I: a recorded chart set (a `data-visualization` section the brief carries
 * with an order) is used in its recorded order. The 3:1 and modeled-CVD gates
 * are measured and reported as warnings on that order; they never re-order or
 * replace a recorded color.
 */
export const COLOR_SYSTEM_APPLICATION_RECORDED_ORDER_POLICY_VERSION =
  'teul-recorded-chart-order/v1' as const;
/** p3-I: diverging arms taken from recorded chart colors (by polarity claim or hue separation). */
export const COLOR_SYSTEM_APPLICATION_RECORDED_DIVERGING_SEMANTICS_POLICY_VERSION =
  'teul-recorded-order-diverging-semantics/v1' as const;
/** p3-I: where a structural product role (background, surface, text, border, disabled) came from. */
export type ColorSystemStructuralGroundSourceV2 =
  (typeof COLOR_SYSTEM_STRUCTURAL_GROUND_SOURCES_V2)[number];
/** p3-I: whether a chart selection follows the brand's recorded order or Teul's generated selection. */
export type ColorSystemChartOrderSourceV2 = (typeof COLOR_SYSTEM_CHART_ORDER_SOURCES_V2)[number];
/**
 * p4-B: a chart mark that reproduces one of the brief's recorded chart colors
 * exactly — through the family member that carries the value or, when no
 * family does, through the preserved color itself. Absent on Teul's own marks.
 */
export type ColorSystemVisualizationMarkOriginV2 =
  (typeof COLOR_SYSTEM_VISUALIZATION_MARK_ORIGINS_V2)[number];
/**
 * A diverging midpoint that cannot be told apart from its chart surface reads as
 * "no data" rather than "zero". The midpoint must therefore keep at least this
 * Delta E OK against the declared surface, and each arm must be as uniform as a
 * sequential ramp (same adjacent-step floor).
 */
export const COLOR_SYSTEM_APPLICATION_DIVERGING_MIDPOINT_POLICY_VERSION =
  'teul-diverging-midpoint-visibility/v1' as const;
export const COLOR_SYSTEM_APPLICATION_DIVERGING_MINIMUM_MIDPOINT_SURFACE_DELTA_E_OK = 0.05;
export const COLOR_SYSTEM_APPLICATION_SEMANTIC_HUE_POLICY_VERSION =
  'teul-semantic-hue-meaning/v1' as const;

export interface ColorSystemHueRangeV2 {
  /** OKLCH hue in degrees, 0 through 360. A minimum above the maximum wraps through 0. */
  minimum: number;
  maximum: number;
}

/**
 * Meaning-bearing hue ranges in OKLCH degrees. OKLCH places pure sRGB red near
 * 29 degrees, orange near 53, yellow near 110, green near 142, blue near 264 and
 * magenta near 328, so these bands describe the conventional status colors:
 * green for success, amber for warning, red for error and destructive, blue for
 * information. `link` follows the information family unless the brand Primary
 * sits in a distinct hue, and `focus` plus `selected` follow the brand family.
 */
export const COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2 = {
  success: { minimum: 120, maximum: 170 },
  warning: { minimum: 55, maximum: 95 },
  error: { minimum: 15, maximum: 45 },
  destructive: { minimum: 15, maximum: 45 },
  information: { minimum: 230, maximum: 275 },
} as const satisfies Readonly<Record<string, ColorSystemHueRangeV2>>;

export type ColorSystemSemanticHueRangeRoleV2 = keyof typeof COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2;

function normalizeHueDegrees(hue: number): number {
  const wrapped = hue % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Shortest circular distance between two OKLCH hues, in degrees (0 through 180). */
export function colorSystemHueDistanceV2(first: number, second: number): number {
  const difference = Math.abs(normalizeHueDegrees(first) - normalizeHueDegrees(second));
  return Math.min(difference, 360 - difference);
}

export function colorSystemHueWithinRangeV2(hue: number, range: ColorSystemHueRangeV2): boolean {
  const value = normalizeHueDegrees(hue);
  const minimum = normalizeHueDegrees(range.minimum);
  const maximum = normalizeHueDegrees(range.maximum);
  if (minimum <= maximum) return value >= minimum && value <= maximum;
  return value >= minimum || value <= maximum;
}

/** Zero inside the range; otherwise the circular distance to the nearer bound. */
export function colorSystemHueDistanceToRangeV2(hue: number, range: ColorSystemHueRangeV2): number {
  if (colorSystemHueWithinRangeV2(hue, range)) return 0;
  return Math.min(
    colorSystemHueDistanceV2(hue, range.minimum),
    colorSystemHueDistanceV2(hue, range.maximum)
  );
}

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

export type ColorSystemProductSemanticRoleNameV2 =
  (typeof COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2)[number];

/**
 * `on-<role>` roles are the foreground placed on the solid `<role>` fill. Their
 * pair evidence must therefore be normal text whose background is the parent
 * role's own reference in the same mode.
 */
export const COLOR_SYSTEM_PRODUCT_SEMANTIC_ON_ROLE_PARENTS_V2 = {
  'on-success': 'success',
  'on-warning': 'warning',
  'on-error': 'error',
  'on-information': 'information',
  'on-destructive': 'destructive',
  'on-selected': 'selected',
} as const satisfies Readonly<
  Partial<Record<ColorSystemProductSemanticRoleNameV2, ColorSystemProductSemanticRoleNameV2>>
>;

export type ColorSystemProductSemanticOnRoleNameV2 =
  keyof typeof COLOR_SYSTEM_PRODUCT_SEMANTIC_ON_ROLE_PARENTS_V2;

export function isColorSystemProductSemanticOnRoleV2(
  role: ColorSystemProductSemanticRoleNameV2
): role is ColorSystemProductSemanticOnRoleNameV2 {
  return role in COLOR_SYSTEM_PRODUCT_SEMANTIC_ON_ROLE_PARENTS_V2;
}

/** Roles that carry a measured hue-meaning record in `semanticMeaning`. */
export type ColorSystemSemanticMeaningRoleV2 =
  (typeof COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2)[number];

/**
 * Meaning-bearing fills must be pairwise distinct: two status colors that read as
 * the same swatch make the status system unusable. Distinctness is measured as
 * Delta E OK between the resolved fills in one mode. `error` and `destructive`
 * may intentionally share a fill (declared through `sharedFill`) when the brand
 * has at most one red family; every other collision must be declared through
 * `collision` on both roles.
 */
export const COLOR_SYSTEM_SEMANTIC_FILL_ROLES_V2 = [
  'success',
  'warning',
  'error',
  'destructive',
  'information',
] as const satisfies readonly ColorSystemSemanticMeaningRoleV2[];
export const COLOR_SYSTEM_APPLICATION_MEANING_FILL_MINIMUM_DELTA_E_OK = 0.08;

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
  rendering?: ColorSystemProductGraphicsRenderingV1;
}

export interface ColorSystemProductSemanticRoleInputV2 {
  role: ColorSystemProductSemanticRoleNameV2;
  mode: string;
  ref: ColorSystemApplicationColorRefV2;
  pairEvidenceIds: readonly string[];
  nonColorCue: string | null;
  intendedUse: string;
  evidenceIds: readonly string[];
  /**
   * p3-I: present on the structural roles only. `observed-claim` and
   * `observed-neutral` resolve to a preserved source color; `generated-ramp`
   * resolves to an approved neutral-family member.
   */
  groundSource?: ColorSystemStructuralGroundSourceV2;
}

export interface ColorSystemProductSemanticRoleV2 extends ColorSystemProductSemanticRoleInputV2 {
  resolved: ColorSystemResolvedApplicationColorV2;
  accessibilityStatus: 'pass' | 'inactive-exempt' | 'blocked';
}

export type ColorSystemRenderedPairCategoryV2 = 'normal-text' | 'large-text' | 'non-text';
export type ColorSystemRenderedPairBackdropKindV2 =
  'solid' | 'unknown' | 'image' | 'gradient' | 'blend-mode';
/**
 * `required` pairs must pass and block when they fail; `inactive-exempt` pairs
 * are measured only. p3-I: `recorded-advisory` pairs belong to a chart mark the
 * brand recorded in a fixed order: they are measured against the same
 * threshold, a failure is reported as a warning on the selection, and they are
 * counted neither as required pairs nor as blockers.
 */
export type ColorSystemRenderedPairAssessmentV2 =
  'required' | 'inactive-exempt' | 'recorded-advisory';
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
  /**
   * Supplementary APCA Lc for the rendered text-on-background polarity: positive
   * for dark text on a light background, negative for light text on dark. Null
   * when the pair is unassessed. Never used as a gate.
   */
  apcaLc: number | null;
  status: ColorSystemRenderedPairStatusV2;
  unassessedReason: ColorSystemRenderedPairUnassessedReasonV2 | null;
  limitation: string;
}

/**
 * p4-B: a chart mark as the composer submits it. `ref` is an approved member
 * (bare or kinded) or, for a recorded chart color no member reproduces, the
 * preserved color itself; a preserved-color mark must carry `origin: 'recorded'`.
 */
export interface ColorSystemVisualizationMarkInputV2 {
  order: number;
  label: string;
  ref: ColorSystemApprovedColorRefV2 | ColorSystemApplicationColorRefV2;
  origin?: ColorSystemVisualizationMarkOriginV2;
}

interface ColorSystemVisualizationContextBaseV2 {
  selectionId: string;
  marks: readonly ColorSystemVisualizationMarkInputV2[];
  surface: ColorSystemApplicationColorRefV2;
  evidenceIds: readonly string[];
}

export interface ColorSystemCategoricalContextV2 extends ColorSystemVisualizationContextBaseV2 {
  adjacency: 'separated' | 'touching';
  boundary: ColorSystemApplicationColorRefV2 | null;
  markPairEvidenceIds: readonly string[];
  directLabels: true;
  nonColorCue: 'shape' | 'pattern';
  /** Marks the owner asked for in this mode (2 through 8). */
  requestedMarkCount: number;
  /**
   * Marks that actually pass 3:1 on the surface and the modeled-CVD gate; equals
   * `marks.length`. A shortfall is recorded, not hidden: `limitation` is set
   * exactly when this is below the request.
   */
  achievedMarkCount: number;
  limitation: string | null;
  /**
   * p3-I: `recorded` when the marks follow the brand's recorded chart order
   * (see COLOR_SYSTEM_APPLICATION_RECORDED_ORDER_POLICY_VERSION); absent or
   * `generated` for Teul's own hue-first selection.
   */
  orderSource?: ColorSystemChartOrderSourceV2;
  /**
   * p3-I: the 3:1 and modeled-CVD findings on a recorded order, one sentence
   * each, naming the marks; empty when every gate passes or the order is generated.
   * p4-B: also the note for a recorded color reproduced from its own value because
   * no family carries it (it names the nearest family and the distance).
   */
  orderWarnings?: readonly string[];
}

export interface ColorSystemSequentialContextV2 extends ColorSystemVisualizationContextBaseV2 {
  direction: 'light-to-dark' | 'dark-to-light';
  axisLabel: string;
  endpointLabels: readonly [string, string];
  nonColorCue: 'axis-and-endpoint-labels';
  /** p3-I: `recorded` when the ramp is drawn from the first recorded chart color's family. */
  orderSource?: ColorSystemChartOrderSourceV2;
}

export type ColorSystemDivergingPolarityV2 =
  | {
      policyVersion: typeof COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION;
      negativeSourceColorId: string;
      positiveSourceColorId: string;
      negativeContributionId?: never;
      positiveContributionId?: never;
      negativeColorId?: never;
      positiveColorId?: never;
      authority: 'governed-source';
      evidenceIds: readonly string[];
    }
  | {
      policyVersion: typeof COLOR_SYSTEM_APPLICATION_GENERATED_DIVERGING_SEMANTICS_POLICY_VERSION;
      negativeContributionId: string;
      positiveContributionId: string;
      negativeSourceColorId?: never;
      positiveSourceColorId?: never;
      negativeColorId?: never;
      positiveColorId?: never;
      authority: 'owner-confirmed';
      evidenceIds: readonly string[];
    }
  | {
      /**
       * p3-I: arms drawn from the brand's recorded chart set. Each arm is the
       * family whose members reproduce a recorded color exactly; the recorded
       * color's name claimed the polarity, or the two most separated recorded
       * hues were taken when no name did.
       */
      policyVersion: typeof COLOR_SYSTEM_APPLICATION_RECORDED_DIVERGING_SEMANTICS_POLICY_VERSION;
      negativeFamilyId: string;
      positiveFamilyId: string;
      /**
       * p4-B: present when the recorded color on that side has no family member
       * of its own: the arm's outermost mark is then the preserved color itself
       * (`origin: 'recorded'`) and the family named above is the nearest one,
       * which supplies the steps toward the midpoint.
       */
      negativeColorId?: string;
      positiveColorId?: string;
      negativeContributionId?: never;
      positiveContributionId?: never;
      negativeSourceColorId?: never;
      positiveSourceColorId?: never;
      authority: 'recorded-order';
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
  /** p3-I: `recorded` when both arms come from recorded chart colors. */
  orderSource?: ColorSystemChartOrderSourceV2;
}

export interface ColorSystemVisualizationMarkEvidenceV2 {
  order: number;
  label: string;
  ref: ColorSystemApplicationColorRefV2;
  /** p4-B: present exactly when the mark reproduces a recorded chart color; hashed with the selection. */
  origin?: ColorSystemVisualizationMarkOriginV2;
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
  /**
   * Coefficient of variation (population standard deviation divided by the mean)
   * of the adjacent Delta E OK steps. Zero is a perfectly even ramp. Recorded as
   * evidence for ranking; the composer minimises it but the blueprint does not
   * gate on it.
   */
  adjacentDeltaEOKCoefficientOfVariation: number;
  status: 'pass';
  limitation: string;
}

export interface ColorSystemDivergingMidpointEvidenceV2 {
  policyVersion: typeof COLOR_SYSTEM_APPLICATION_DIVERGING_MIDPOINT_POLICY_VERSION;
  minimumSurfaceDeltaEOK: typeof COLOR_SYSTEM_APPLICATION_DIVERGING_MINIMUM_MIDPOINT_SURFACE_DELTA_E_OK;
  observedSurfaceDeltaEOK: number;
  status: 'pass';
  limitation: string;
}

export interface ColorSystemDivergingArmEvidenceV2 {
  adjacent: readonly {
    fromOrder: number;
    toOrder: number;
    deltaEOK: number;
  }[];
  observedMinimumAdjacentDeltaEOK: number;
  adjacentDeltaEOKCoefficientOfVariation: number;
}

export interface ColorSystemDivergingArmUniformityEvidenceV2 {
  minimumAdjacentDeltaEOK: typeof COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK;
  negative: ColorSystemDivergingArmEvidenceV2;
  positive: ColorSystemDivergingArmEvidenceV2;
  status: 'pass';
}

export type ColorSystemSemanticMeaningBasisV2 =
  'hue-range' | 'nearest-hue' | 'brand-primary-hue' | 'information-family' | 'functional-fit';

/**
 * p3-B: where the family behind a meaning role came from. `brand` reproduces a
 * confirmed brand color or sits on the Primary hue; `reserve` is a conventional
 * status family the planner added because the palette owned no hue in that
 * range; `generated` is any other proposed family inside the range; `nearest`
 * is the out-of-range fallback that carries the range warning.
 */
export type ColorSystemSemanticMeaningSourceV2 =
  (typeof COLOR_SYSTEM_SEMANTIC_MEANING_SOURCES_V2)[number];

export interface ColorSystemSemanticMeaningInputV2 {
  role: ColorSystemSemanticMeaningRoleV2;
  mode: string;
  /** Null when the role follows a family rather than a hue band (focus, selected, brand link). */
  targetHueRange: ColorSystemHueRangeV2 | null;
  basis: ColorSystemSemanticMeaningBasisV2;
  /** p3-B: `nearest` exactly when the role left its range; `reserve` only on status fills. */
  meaningSource: ColorSystemSemanticMeaningSourceV2;
  familyId: string;
  memberId: string;
  /** OKLCH hue of the resolved role value; recomputed and verified by the blueprint. */
  measuredHueDegrees: number;
  measuredChroma: number;
  inRange: boolean;
  /** Present exactly when a hue-band role landed outside its band. */
  warning: string | null;
  /** `destructive` may declare that it intentionally shares the `error` fill. */
  sharedFill: ColorSystemSemanticMeaningRoleV2 | null;
  /** Present exactly when this fill sits within the distinctness floor of another meaning fill. */
  collision: string | null;
  evidenceIds: readonly string[];
}

export interface ColorSystemSemanticMeaningEvidenceV2 extends ColorSystemSemanticMeaningInputV2 {
  policyVersion: typeof COLOR_SYSTEM_APPLICATION_SEMANTIC_HUE_POLICY_VERSION;
}

export type ColorSystemCategoricalSelectionV2 = Omit<
  ColorSystemCategoricalContextV2,
  'marks' | 'orderSource' | 'orderWarnings'
> & {
  kind: 'categorical';
  marks: readonly ColorSystemVisualizationMarkEvidenceV2[];
  surfaceResolved: ColorSystemResolvedApplicationColorV2;
  boundaryResolved: ColorSystemResolvedApplicationColorV2 | null;
  cvdAdvisory: ColorSystemCvdAdvisoryEvidenceV2;
  /** p3-I: always recorded on the selection; `generated` when the input omitted it. */
  orderSource: ColorSystemChartOrderSourceV2;
  orderWarnings: readonly string[];
};

export type ColorSystemSequentialSelectionV2 = Omit<
  ColorSystemSequentialContextV2,
  'marks' | 'orderSource'
> & {
  kind: 'sequential';
  marks: readonly ColorSystemVisualizationMarkEvidenceV2[];
  surfaceResolved: ColorSystemResolvedApplicationColorV2;
  perceptualEvidence: ColorSystemSequentialPerceptualEvidenceV2;
  orderSource: ColorSystemChartOrderSourceV2;
};

export type ColorSystemDivergingSelectionV2 = Omit<
  ColorSystemDivergingContextV2,
  'marks' | 'orderSource'
> & {
  kind: 'diverging';
  marks: readonly ColorSystemVisualizationMarkEvidenceV2[];
  surfaceResolved: ColorSystemResolvedApplicationColorV2;
  cvdAdvisory: ColorSystemCvdAdvisoryEvidenceV2;
  midpointVisibility: ColorSystemDivergingMidpointEvidenceV2;
  armUniformity: ColorSystemDivergingArmUniformityEvidenceV2;
  orderSource: ColorSystemChartOrderSourceV2;
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
  'PAIR_THRESHOLD_FAILED' | 'PAIR_CONTEXT_UNASSESSED' | 'CVD_ADVISORY_SEPARATION_FAILED';

export interface ColorSystemApplicationBlockerV2 {
  code: ColorSystemApplicationBlockerCodeV2;
  evidenceId: string;
  message: string;
}

export interface ColorSystemApplicationPolicyVersionsV2 {
  compiler: typeof COLOR_SYSTEM_APPLICATION_COMPILER_V2_POLICY_VERSION;
  wcag: typeof COLOR_SYSTEM_APPLICATION_WCAG_POLICY_VERSION;
  apcaSupplementary: typeof COLOR_SYSTEM_APPLICATION_APCA_POLICY_VERSION;
  cvdAdvisory: typeof COLOR_SYSTEM_APPLICATION_CVD_POLICY_VERSION;
  sequentialPerceptual: typeof COLOR_SYSTEM_APPLICATION_SEQUENTIAL_POLICY_VERSION;
  divergingSemantics: typeof COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION;
  divergingMidpoint: typeof COLOR_SYSTEM_APPLICATION_DIVERGING_MIDPOINT_POLICY_VERSION;
  semanticHue: typeof COLOR_SYSTEM_APPLICATION_SEMANTIC_HUE_POLICY_VERSION;
  /** p3-I: how a recorded chart order is honoured and gated. */
  recordedOrder: typeof COLOR_SYSTEM_APPLICATION_RECORDED_ORDER_POLICY_VERSION;
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
  /** One measured hue-meaning record per mode for every meaning role. */
  semanticMeaning: readonly ColorSystemSemanticMeaningEvidenceV2[];
  visualization: {
    categorical: ColorSystemCategoricalSelectionV2;
    /** Null only for Keep when the corresponding derived chart job is not required. */
    sequential: ColorSystemSequentialSelectionV2 | null;
    diverging: ColorSystemDivergingSelectionV2 | null;
  };
  /**
   * Categorical systems composed for every declared mode other than the one in
   * `visualization`, each on that mode's own surface, sorted by mode.
   */
  additionalCategorical: readonly ColorSystemCategoricalSelectionV2[];
  typography: readonly ColorSystemTypographySpecimenV2[];
  pairEvidence: readonly ColorSystemRenderedPairEvidenceV2[];
  /** Present only when the caller declared required component uses and source surfaces. */
  interaction?: ColorSystemInteractionApplicationV1;
  productGraphicsRequirements?: ColorSystemProductGraphicsRequirementsV1;
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
  semanticMeaning: readonly ColorSystemSemanticMeaningInputV2[];
  visualization: {
    categorical: ColorSystemCategoricalContextV2;
    /** Explicit null requires a preserve disposition and no corresponding derived job. */
    sequential: ColorSystemSequentialContextV2 | null;
    diverging: ColorSystemDivergingContextV2 | null;
  };
  additionalCategorical: readonly ColorSystemCategoricalContextV2[];
  typography: readonly ColorSystemTypographySpecimenInputV2[];
  pairContexts: readonly ColorSystemRenderedPairContextV2[];
  interaction?: ColorSystemInteractionApplicationInputV1;
  productGraphicsRequirements?: ColorSystemProductGraphicsRequirementsV1;
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
  'APCA Lc values are recorded as supplementary evidence only; Teul gates rendered pairs on WCAG 2.2 ratios and never on Lc.',
] as const;

function fail(code: ColorSystemApplicationBlueprintV2ErrorCode, message: string): never {
  throw new ColorSystemApplicationBlueprintV2Error(code, message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Derive the nearby legend from normalized marks and their existing paints, without copying color values. */
export function buildColorSystemVisualizationLegendV2<Paint>(
  marks: unknown,
  paints: readonly { order: number; paint: Paint }[]
): { order: number; label: string; paint: Paint }[] {
  if (!Array.isArray(marks) || marks.length === 0 || paints.length !== marks.length) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      'Chart legend requires marks and a paint for every mark.'
    );
  }
  const byOrder = new Map<number, Paint>();
  for (const binding of paints) {
    if (
      !Number.isInteger(binding.order) ||
      binding.order < 1 ||
      binding.order > marks.length ||
      byOrder.has(binding.order) ||
      binding.paint == null
    ) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        'Chart legend paint orders must match the marks exactly.'
      );
    }
    byOrder.set(binding.order, binding.paint);
  }
  return marks.map((mark: unknown, index: number) => {
    if (
      !isObject(mark) ||
      mark.order !== index + 1 ||
      typeof mark.label !== 'string' ||
      !mark.label.trim()
    ) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        'Chart legend requires contiguous mark order and labels.'
      );
    }
    return { order: index + 1, label: mark.label, paint: byOrder.get(index + 1)! };
  });
}

function assertExactKeys(value: unknown, expected: readonly string[], label: string): void {
  if (!isObject(value)) fail('INVALID_APPLICATION_INPUT', `${label} must be an object.`);
  const actual = Object.keys(value).sort(compareText);
  const wanted = [...expected].sort(compareText);
  if (canonicalJson(actual) !== canonicalJson(wanted)) {
    fail('INVALID_APPLICATION_INPUT', `${label} contains unexpected or missing fields.`);
  }
}

/** p3-I: exact required keys plus a closed set of optional ones; any other key fails. */
function assertKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string
): void {
  if (!isObject(value)) fail('INVALID_APPLICATION_INPUT', `${label} must be an object.`);
  const actual = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some(key => !(key in value)) || actual.some(key => !allowed.has(key))) {
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

/** Like assertRefEligibleForJob, but any one of the listed jobs satisfies the reference. */
function assertRefEligibleForAnyJob(
  resolver: Resolver,
  inputRef: ColorSystemApplicationColorRefV2,
  jobs: readonly ColorSystemJobV2[],
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
  if (!jobs.some(job => eligibility.jobs.includes(job))) {
    fail(
      'ORPHAN_APPLICATION_REFERENCE',
      `${label} is not eligible for any of the application jobs ${jobs.join(', ')}.`
    );
  }
}

/**
 * Structural roles are the product UI surface system (page, raised surface,
 * border, disabled tone, and the text placed on them), so a member eligible for
 * `product-ui-surface` may serve them; that is the job a neutral ramp is reviewed
 * for. Meaning fills still require `product-semantics`. Surfaces and underlays
 * inside any semantic pair follow the structural rule.
 */
const STRUCTURAL_SEMANTIC_ROLES = new Set<ColorSystemProductSemanticRoleNameV2>([
  'background',
  'surface',
  'text',
  'border',
  'disabled',
]);
const STRUCTURAL_ROLE_JOBS: readonly ColorSystemJobV2[] = [
  'product-ui-surface',
  'product-semantics',
];
const MEANING_ROLE_JOBS: readonly ColorSystemJobV2[] = ['product-semantics'];

function semanticRoleJobs(role: ColorSystemProductSemanticRoleNameV2): readonly ColorSystemJobV2[] {
  return STRUCTURAL_SEMANTIC_ROLES.has(role) || isColorSystemProductSemanticOnRoleV2(role)
    ? STRUCTURAL_ROLE_JOBS
    : MEANING_ROLE_JOBS;
}

function assertSrgbValue(value: ColorSystemColorValueV2, label: string): void {
  try {
    if (!HEX_PATTERN.test(value.hex)) throw new Error('Display hex must be canonical.');
    normalizeColorSystemSrgbValueV1(value);
  } catch {
    fail(
      'ORPHAN_APPLICATION_REFERENCE',
      `${label} must preserve a valid exact sRGB value and alpha from zero through one.`
    );
  }
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
    !['required', 'inactive-exempt', 'recorded-advisory'].includes(context.assessment)
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
      apcaLc: null,
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
    apcaLc: getAPCAContrast(renderedForeground, renderedBackground),
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
        : normalizedContext.assessment === 'recorded-advisory'
          ? 'This chart color keeps its recorded order; a failed threshold is reported as a warning on the selection and is not counted as a required pair or a blocker.'
          : 'This result applies only to this exact rendered sRGB pair, alpha, underlay, size, weight, and use case.',
  };
}

/** Reuses the final exact-pair gate during bounded candidate filtering. */
export function createColorSystemRenderedPairAssessorV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  modes: readonly string[]
): (context: ColorSystemRenderedPairContextV2) => ColorSystemRenderedPairEvidenceV2 {
  const resolver: Resolver = { brief, candidate, modes: new Set(modes) };
  return context => normalizePairContext(resolver, context);
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
  evidenceById: ReadonlyMap<string, ColorSystemRenderedPairEvidenceV2>,
  requirements?: ColorSystemProductGraphicsRequirementsV1
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
            : buildColorSystemSrgbValueV1(
                resolved.value.components,
                resolved.value.alpha * input.transform.alpha
              );
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
      if (requirements) {
        const context = requirements.contexts[index];
        if (
          input.assessment !== 'informative' ||
          input.transform.kind !== 'identity' ||
          colors.length !== 1 ||
          context.job !== input.job ||
          context.mode !== mode ||
          !colorSystemProductGraphicsCandidateAllowedV1(
            context,
            colors[0].appliedValue,
            ref => resolveRef(resolver, ref, context.id).value
          )
        ) {
          fail(
            'INVALID_APPLICATION_INPUT',
            `${derivationId} does not fulfill its declared graphics context.`
          );
        }
        const rendering = buildColorSystemProductGraphicsRenderingV1(
          requirements,
          context,
          colors[0].ref,
          [...evidenceById.values()]
        );
        if (
          canonicalJson([...rendering.pairs.map(pair => pair.pairEvidenceId)].sort(compareText)) !==
          canonicalJson(pairEvidenceIds)
        ) {
          fail(
            'INVALID_APPLICATION_INPUT',
            `${derivationId} must retain every declared graphic pair exactly.`
          );
        }
        specimen.rendering = rendering;
      }
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
      assertKeys(
        input,
        ['role', 'mode', 'ref', 'pairEvidenceIds', 'nonColorCue', 'intendedUse', 'evidenceIds'],
        ['groundSource'], // p3-I
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
      // p3-I: a ground source is a claim about where a structural role came from,
      // so it must agree with the reference kind: observed sources are preserved
      // source colors, the generated ramp is an approved family member.
      if (input.groundSource !== undefined) {
        if (
          !STRUCTURAL_SEMANTIC_ROLES.has(input.role) ||
          !COLOR_SYSTEM_STRUCTURAL_GROUND_SOURCES_V2.includes(input.groundSource) ||
          (input.groundSource === 'generated-ramp') !== (ref.kind === 'approved-family-member')
        ) {
          fail(
            'INVALID_APPLICATION_INPUT',
            `${input.mode}/${input.role} ground source must name a structural role and agree with its reference kind.`
          );
        }
      }
      const roleJobs = semanticRoleJobs(input.role);
      assertRefEligibleForAnyJob(resolver, ref, roleJobs, `${input.mode}/${input.role}.ref`);
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
        // The role's own reference answers to the role's jobs; every other member
        // of the pair is a surface or underlay and answers to the structural jobs.
        const pairRefs: [string, ColorSystemApplicationColorRefV2][] = [
          ['foreground', evidence.context.foreground],
          ['background', evidence.context.background],
          ...(evidence.context.underlay !== null
            ? ([['underlay', evidence.context.underlay]] as [
                string,
                ColorSystemApplicationColorRefV2,
              ][])
            : []),
        ];
        pairRefs.forEach(([position, pairRef]) =>
          assertRefEligibleForAnyJob(
            resolver,
            pairRef,
            sameRef(pairRef, ref) ? roleJobs : STRUCTURAL_ROLE_JOBS,
            `${input.mode}/${input.role}.pairEvidenceIds.${position}`
          )
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
      if (isColorSystemProductSemanticOnRoleV2(input.role)) {
        const parentRole = COLOR_SYSTEM_PRODUCT_SEMANTIC_ON_ROLE_PARENTS_V2[input.role];
        const parent = inputs.find(item => item.mode === input.mode && item.role === parentRole);
        if (!parent) {
          fail(
            'MISSING_PRODUCT_SEMANTIC_ROLE',
            `${input.mode}/${input.role} requires its parent role ${parentRole} in the same mode.`
          );
        }
        const parentRef = normalizeRef(parent.ref, `${input.mode}/${parentRole}.ref`);
        pairEvidence.forEach(evidence => {
          if (
            evidence.context.category !== 'normal-text' ||
            !sameRef(evidence.context.foreground, ref) ||
            !sameRef(evidence.context.background, parentRef)
          ) {
            fail(
              'INVALID_APPLICATION_INPUT',
              `${input.mode}/${input.role} must be assessed as normal text on the ${parentRole} fill.`
            );
          }
        });
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
      `Product semantics require exactly ${COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.length} roles per mode; expected ${expectedCount}.`
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
  marks: readonly ColorSystemVisualizationMarkInputV2[];
}

/**
 * Population coefficient of variation of a set of step sizes: standard deviation
 * over mean. Zero when every step is identical or when there is nothing to vary.
 */
export function colorSystemCoefficientOfVariationV2(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function adjacentDeltas(
  marks: readonly ColorSystemVisualizationMarkEvidenceV2[]
): { fromOrder: number; toOrder: number; deltaEOK: number }[] {
  return marks.slice(0, -1).map((mark, index) => ({
    fromOrder: mark.order,
    toOrder: marks[index + 1].order,
    deltaEOK: deltaEOK(mark.renderedRgb, marks[index + 1].renderedRgb),
  }));
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

/** p4-B: a mark's reference as submitted — a bare approved ref or a kinded application ref. */
function normalizeMarkRef(ref: unknown, label: string): ColorSystemApplicationColorRefV2 {
  if (!isObject(ref)) {
    fail('ORPHAN_APPLICATION_REFERENCE', `${label} must be an approved reference.`);
  }
  if (typeof ref.kind === 'string') {
    return normalizeRef(ref as ColorSystemApplicationColorRefV2, label);
  }
  assertExactKeys(ref, ['familyId', 'memberId', 'mode'], label);
  const field = (key: 'familyId' | 'memberId' | 'mode'): string => {
    const value = ref[key];
    return requireNonEmpty(typeof value === 'string' ? value : '', `${label}.${key}`);
  };
  return {
    kind: 'approved-family-member',
    ref: { familyId: field('familyId'), memberId: field('memberId'), mode: field('mode') },
  };
}

/**
 * p4-B: every hex the brief records for its data-visualization section in
 * `mode`, upper-cased; a color without a value in that mode contributes the
 * value of its first mode, as the composer reads it.
 */
function recordedChartHexesForMode(brief: ColorSystemBuilderBriefV2, mode: string): Set<string> {
  const entries = [
    ...brief.preservedColors
      .filter(color => color.section === 'data-visualization')
      .map(color => color.valuesByMode),
    ...brief.sourceReferenceColors
      .filter(color => color.sourceSection === 'data-visualization')
      .map(color => color.valuesByMode),
  ];
  return new Set(
    entries.flatMap(values => {
      const modes = Object.keys(values).sort(compareText);
      const value = values[mode] ?? (modes.length > 0 ? values[modes[0]] : undefined);
      return value ? [value.hex.toUpperCase()] : [];
    })
  );
}

/**
 * Resolves and measures a selection's marks. p4-B: a mark may reference a
 * preserved color only when it is a recorded chart color (`origin: 'recorded'`,
 * section `data-visualization`); any recorded mark must reproduce a recorded
 * hex in its mode and may appear only on a recorded order.
 */
function visualizationMarks(
  resolver: Resolver,
  selection: VisualizationSelectionInput,
  surface: ColorSystemResolvedApplicationColorV2,
  job: ColorSystemJobV2,
  orderSource: ColorSystemChartOrderSourceV2
): ColorSystemVisualizationMarkEvidenceV2[] {
  const identities = new Set<string>();
  const hexes = new Set<string>();
  const recordedByMode = new Map<string, Set<string>>();
  return selection.marks.map((mark, index) => {
    const label = `${selection.id}.marks[${index}]`;
    assertKeys(mark, ['order', 'label', 'ref'], ['origin'], label);
    if (mark.order !== index + 1 || !mark.label.trim()) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        `${selection.id} marks require contiguous order and direct labels.`
      );
    }
    const origin = mark.origin;
    if (origin !== undefined && !COLOR_SYSTEM_VISUALIZATION_MARK_ORIGINS_V2.includes(origin)) {
      fail('INVALID_DATA_VISUALIZATION_POLICY', `${label} has an unsupported mark origin.`);
    }
    const ref = normalizeMarkRef(mark.ref, label);
    if (ref.kind === 'preserved-source-color') {
      const preserved = resolver.brief.preservedColors.find(
        color => color.stableColorId === ref.stableColorId
      );
      if (origin !== 'recorded' || preserved?.section !== 'data-visualization') {
        fail(
          'INVALID_DATA_VISUALIZATION_POLICY',
          `${label} may reference a preserved color only as a recorded chart color (a data-visualization color with origin recorded).`
        );
      }
    }
    if (origin === 'recorded' && orderSource !== 'recorded') {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        `${label} carries a recorded mark on a generated order.`
      );
    }
    assertRefEligibleForJob(resolver, ref, job, label);
    const resolved = resolveRef(resolver, ref, label);
    if (origin === 'recorded') {
      const mode = refMode(ref);
      const recorded =
        recordedByMode.get(mode) ??
        recordedByMode.set(mode, recordedChartHexesForMode(resolver.brief, mode)).get(mode)!;
      if (!recorded.has(resolved.value.hex.toUpperCase())) {
        fail(
          'INVALID_DATA_VISUALIZATION_POLICY',
          `${label} claims a recorded origin but ${resolved.value.hex} is not a recorded chart color in ${mode}.`
        );
      }
    }
    const identity = canonicalJson(ref);
    if (identities.has(identity)) {
      fail('INVALID_DATA_VISUALIZATION_POLICY', `${selection.id} mark identities must be unique.`);
    }
    identities.add(identity);
    const renderedRgb = renderedOnSurface(resolved, surface, label);
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
      ...(origin === undefined ? {} : { origin }),
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
  assertKeys(
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
      'requestedMarkCount',
      'achievedMarkCount',
      'limitation',
    ],
    ['orderSource', 'orderWarnings'], // p3-I
    'visualization.categorical'
  );
  const selection: VisualizationSelectionInput = {
    id: requireNonEmpty(input.selectionId, 'categorical selectionId'),
    kind: 'categorical',
    marks: input.marks,
  };
  const orderSource = orderSourceOf(input.orderSource, selection.id);
  const orderWarnings = uniqueStringsInDeclaredOrder(
    input.orderWarnings ?? [],
    `${selection.id}.orderWarnings`
  );
  if (orderSource === 'generated' && orderWarnings.length > 0) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} may carry order warnings only on a recorded order.`
    );
  }
  if (selection.marks.length < 2 || selection.marks.length > 8) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      'Categorical selections support exactly the requested 2 through 8 marks; nine is not truncated.'
    );
  }
  if (
    !Number.isInteger(input.requestedMarkCount) ||
    input.requestedMarkCount < 2 ||
    input.requestedMarkCount > 8 ||
    input.achievedMarkCount !== selection.marks.length ||
    input.achievedMarkCount > input.requestedMarkCount
  ) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} must record the requested mark count (2 through 8) and an achieved count equal to its marks and never above the request.`
    );
  }
  if ((input.limitation === null) !== (input.achievedMarkCount === input.requestedMarkCount)) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} must carry a limitation exactly when it achieves fewer marks than requested.`
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
  const marks = visualizationMarks(resolver, selection, surface, 'categorical-data', orderSource);
  // p4-B: a recorded order reproduces at least one recorded chart color, and recorded
  // marks correspond one for one with the selection's recorded-advisory pairs (below).
  if (orderSource === 'recorded' && !marks.some(mark => mark.origin === 'recorded')) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} claims a recorded order but reproduces no recorded chart color.`
    );
  }
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
  let failingRecordedPairs = 0;
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
    // p3-I: a recorded mark is judged by the same 3:1 rule but kept in its
    // recorded place; its pair is `recorded-advisory` and may record a failure.
    const recordedPair = evidence.context.assessment === 'recorded-advisory';
    if (recordedPair !== (mark.origin === 'recorded')) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        `${selection.id} mark ${mark.order} must carry a recorded-advisory pair exactly when it reproduces a recorded chart color.`
      );
    }
    if (
      evidence.context.category !== 'non-text' ||
      !pairContainsRef(evidence, mark.ref) ||
      !pairContainsRef(evidence, surface.ref) ||
      (recordedPair
        ? orderSource !== 'recorded' || (evidence.status !== 'pass' && evidence.status !== 'fail')
        : evidence.status !== 'pass')
    ) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        `${selection.id} categorical marks must pass 3:1 against the declared surface.`
      );
    }
    if (recordedPair && evidence.status === 'fail') failingRecordedPairs += 1;
  });
  if (failingRecordedPairs > 0 && orderWarnings.length === 0) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} keeps ${failingRecordedPairs} recorded marks below 3:1 and must say so in its order warnings.`
    );
  }
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
    requestedMarkCount: input.requestedMarkCount,
    achievedMarkCount: input.achievedMarkCount,
    limitation:
      input.limitation === null
        ? null
        : requireNonEmpty(input.limitation, `${selection.id}.limitation`),
    kind: 'categorical',
    marks,
    surfaceResolved: surface,
    boundaryResolved,
    cvdAdvisory: cvdAdvisory(
      marks.map(mark => mark.renderedRgb),
      'all-pairs'
    ),
    orderSource,
    orderWarnings,
  };
}

/** p3-I: an omitted order source is Teul's own generated selection. */
function orderSourceOf(
  value: ColorSystemChartOrderSourceV2 | undefined,
  label: string
): ColorSystemChartOrderSourceV2 {
  if (value === undefined) return 'generated';
  if (!COLOR_SYSTEM_CHART_ORDER_SOURCES_V2.includes(value)) {
    fail('INVALID_DATA_VISUALIZATION_POLICY', `${label} has an unsupported order source.`);
  }
  return value;
}

/** p3-I: every hex the brief records for its data-visualization section, in any mode, upper-cased. */
function recordedChartHexes(brief: ColorSystemBuilderBriefV2): Set<string> {
  return new Set(
    [
      ...brief.preservedColors.filter(color => color.section === 'data-visualization'),
      ...brief.sourceReferenceColors.filter(color => color.sourceSection === 'data-visualization'),
    ].flatMap(color => Object.values(color.valuesByMode).map(value => value.hex.toUpperCase()))
  );
}

function normalizeSequential(
  resolver: Resolver,
  input: ColorSystemSequentialContextV2
): ColorSystemSequentialSelectionV2 {
  assertKeys(
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
    ['orderSource'], // p3-I
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
  const orderSource = orderSourceOf(input.orderSource, selection.id);
  const marks = visualizationMarks(resolver, selection, surface, 'sequential-data', orderSource);
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
  const adjacent = adjacentDeltas(marks);
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
    adjacentDeltaEOKCoefficientOfVariation: colorSystemCoefficientOfVariationV2(
      adjacent.map(item => item.deltaEOK)
    ),
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
    orderSource,
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
  assertKeys(
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
    ['orderSource'], // p3-I
    'visualization.diverging'
  );
  const selection: VisualizationSelectionInput = {
    id: requireNonEmpty(input.selectionId, 'diverging selectionId'),
    kind: 'diverging',
    marks: input.marks,
  };
  const polarityAuthority = input.polarity.authority;
  const polarityKeysByAuthority = {
    'owner-confirmed': ['negativeContributionId', 'positiveContributionId'],
    'governed-source': ['negativeSourceColorId', 'positiveSourceColorId'],
    // p3-I
    'recorded-order': ['negativeFamilyId', 'positiveFamilyId'],
  } as const;
  const polarityVersionByAuthority = {
    'owner-confirmed': COLOR_SYSTEM_APPLICATION_GENERATED_DIVERGING_SEMANTICS_POLICY_VERSION,
    'governed-source': COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION,
    'recorded-order': COLOR_SYSTEM_APPLICATION_RECORDED_DIVERGING_SEMANTICS_POLICY_VERSION,
  } as const;
  if (!(polarityAuthority in polarityKeysByAuthority)) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} requires a supported hash-bound diverging-semantics policy.`
    );
  }
  assertKeys(
    input.polarity,
    ['policyVersion', ...polarityKeysByAuthority[polarityAuthority], 'authority', 'evidenceIds'],
    // p4-B: a recorded arm whose color has no family names the preserved color as its endpoint.
    polarityAuthority === 'recorded-order' ? ['negativeColorId', 'positiveColorId'] : [],
    `${selection.id}.polarity`
  );
  if (input.polarity.policyVersion !== polarityVersionByAuthority[polarityAuthority]) {
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
  // p4-B: set only by a recorded-order polarity whose side ends on the preserved color.
  let negativeColorId: string | undefined = undefined;
  let positiveColorId: string | undefined = undefined;
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
  } else if (input.polarity.authority === 'recorded-order') {
    // p3-I: each arm is a family that reproduces one of the brief's recorded
    // chart colors exactly; the composer chose them by polarity claim or hue.
    const recordedPolarity = input.polarity;
    const negativeFamilyId = requireNonEmpty(
      recordedPolarity.negativeFamilyId,
      `${selection.id}.polarity.negativeFamilyId`
    );
    const positiveFamilyId = requireNonEmpty(
      recordedPolarity.positiveFamilyId,
      `${selection.id}.polarity.positiveFamilyId`
    );
    const recordedHexes = recordedChartHexes(resolver.brief);
    const reproducesRecorded = (familyId: string): boolean =>
      resolver.candidate.families.some(
        family =>
          family.stableFamilyId === familyId &&
          family.members.some(member =>
            Object.values(member.valuesByMode).some(value =>
              recordedHexes.has(value.hex.toUpperCase())
            )
          )
      );
    // p4-B: a side may instead name the recorded color itself as its endpoint when no
    // family reproduces it; the family named for that side is then the nearest one and
    // need not reproduce a recorded value. The endpoint mark is checked with the arms.
    const endpointColorId = (value: unknown, label: string): string | undefined => {
      if (value === undefined) return undefined;
      const colorId = requireNonEmpty(typeof value === 'string' ? value : '', label);
      const preserved = resolver.brief.preservedColors.find(
        color => color.stableColorId === colorId
      );
      if (preserved?.section !== 'data-visualization') {
        fail(
          'INVALID_DATA_VISUALIZATION_POLICY',
          `${label} must name a preserved data-visualization color.`
        );
      }
      return colorId;
    };
    negativeColorId = endpointColorId(
      recordedPolarity.negativeColorId,
      `${selection.id}.polarity.negativeColorId`
    );
    positiveColorId = endpointColorId(
      recordedPolarity.positiveColorId,
      `${selection.id}.polarity.positiveColorId`
    );
    if (
      negativeFamilyId === positiveFamilyId ||
      polarityEvidenceIds.length === 0 ||
      (negativeColorId === undefined && !reproducesRecorded(negativeFamilyId)) ||
      (positiveColorId === undefined && !reproducesRecorded(positiveFamilyId)) ||
      (negativeColorId !== undefined && negativeColorId === positiveColorId)
    ) {
      fail(
        'INVALID_DATA_VISUALIZATION_POLICY',
        `${selection.id} recorded polarity must name two distinct families that reproduce recorded chart colors, or the recorded colors themselves as endpoints.`
      );
    }
    negativeIdentity = negativeFamilyId;
    positiveIdentity = positiveFamilyId;
    normalizedPolarity = {
      policyVersion: COLOR_SYSTEM_APPLICATION_RECORDED_DIVERGING_SEMANTICS_POLICY_VERSION,
      negativeFamilyId,
      positiveFamilyId,
      ...(negativeColorId === undefined ? {} : { negativeColorId }),
      ...(positiveColorId === undefined ? {} : { positiveColorId }),
      authority: 'recorded-order',
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
  const orderSource = orderSourceOf(input.orderSource, selection.id);
  const marks = visualizationMarks(resolver, selection, surface, 'diverging-data', orderSource);
  const midpointIndex = input.midpointOrder - 1;
  const markPolarityIdentities = marks.map(mark => {
    if (mark.ref.kind !== 'approved-family-member') return [];
    const approvedRef = mark.ref.ref;
    const family = resolver.candidate.families.find(
      candidate => candidate.stableFamilyId === approvedRef.familyId
    );
    if (!family) return [];
    if (polarityAuthority === 'owner-confirmed') return [family.contributionId];
    if (polarityAuthority === 'recorded-order') return [family.stableFamilyId]; // p3-I
    return (
      family.members.find(member => member.stableMemberId === approvedRef.memberId)?.provenance
        .sourceColorIds ?? []
    );
  });
  // p4-B: a recorded endpoint is the preserved color itself, carried as a recorded mark
  // at the outermost position of its arm; the rest of the arm belongs to the named family.
  const isRecordedEndpoint = (index: number, colorId: string | undefined): boolean => {
    const mark = marks[index];
    return (
      colorId !== undefined &&
      mark.ref.kind === 'preserved-source-color' &&
      mark.ref.stableColorId === colorId &&
      mark.origin === 'recorded'
    );
  };
  const lastIndex = marks.length - 1;
  const negativeArmOk = markPolarityIdentities
    .slice(0, midpointIndex)
    .every(
      (identities, index) =>
        identities.includes(negativeIdentity) ||
        (index === 0 && isRecordedEndpoint(0, negativeColorId))
    );
  const positiveArmOk = markPolarityIdentities
    .slice(midpointIndex + 1)
    .every(
      (identities, offset) =>
        identities.includes(positiveIdentity) ||
        (midpointIndex + 1 + offset === lastIndex && isRecordedEndpoint(lastIndex, positiveColorId))
    );
  if (
    !negativeArmOk ||
    !positiveArmOk ||
    (negativeColorId !== undefined && !isRecordedEndpoint(0, negativeColorId)) ||
    (positiveColorId !== undefined && !isRecordedEndpoint(lastIndex, positiveColorId)) ||
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
  const observedMidpointSurfaceDeltaEOK = deltaEOK(
    marks[midpointIndex].renderedRgb,
    colorRgb(surface.value)
  );
  if (
    observedMidpointSurfaceDeltaEOK <
    COLOR_SYSTEM_APPLICATION_DIVERGING_MINIMUM_MIDPOINT_SURFACE_DELTA_E_OK
  ) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} midpoint falls below the ${COLOR_SYSTEM_APPLICATION_DIVERGING_MINIMUM_MIDPOINT_SURFACE_DELTA_E_OK} Delta E OK midpoint-visibility threshold against its declared surface.`
    );
  }
  const armEvidence = (
    armMarks: readonly ColorSystemVisualizationMarkEvidenceV2[]
  ): ColorSystemDivergingArmEvidenceV2 => {
    const adjacent = adjacentDeltas(armMarks);
    return {
      adjacent,
      observedMinimumAdjacentDeltaEOK: Math.min(...adjacent.map(item => item.deltaEOK)),
      adjacentDeltaEOKCoefficientOfVariation: colorSystemCoefficientOfVariationV2(
        adjacent.map(item => item.deltaEOK)
      ),
    };
  };
  // Each arm includes its step into the midpoint so the zero mark is measured as
  // part of the ramp rather than as a free-floating swatch.
  const negativeArm = armEvidence(marks.slice(0, midpointIndex + 1));
  const positiveArm = armEvidence(marks.slice(midpointIndex));
  if (
    negativeArm.observedMinimumAdjacentDeltaEOK <
      COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK ||
    positiveArm.observedMinimumAdjacentDeltaEOK <
      COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK
  ) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      `${selection.id} arms fall below the ${COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK} adjacent-step Delta E OK threshold.`
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
    orderSource,
    cvdAdvisory: cvdAdvisory(
      marks.map(mark => mark.renderedRgb),
      'opposing-arms'
    ),
    midpointVisibility: {
      policyVersion: COLOR_SYSTEM_APPLICATION_DIVERGING_MIDPOINT_POLICY_VERSION,
      minimumSurfaceDeltaEOK:
        COLOR_SYSTEM_APPLICATION_DIVERGING_MINIMUM_MIDPOINT_SURFACE_DELTA_E_OK,
      observedSurfaceDeltaEOK: observedMidpointSurfaceDeltaEOK,
      status: 'pass',
      limitation:
        'Midpoint visibility is measured as Delta E OK against the exact declared surface; it is a Teul chart-legibility policy, not WCAG conformance.',
    },
    armUniformity: {
      minimumAdjacentDeltaEOK: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK,
      negative: negativeArm,
      positive: positiveArm,
      status: 'pass',
    },
  };
}

function normalizeAdditionalCategorical(
  resolver: Resolver,
  inputs: readonly ColorSystemCategoricalContextV2[],
  primary: ColorSystemCategoricalSelectionV2,
  evidenceById: ReadonlyMap<string, ColorSystemRenderedPairEvidenceV2>
): ColorSystemCategoricalSelectionV2[] {
  if (!Array.isArray(inputs)) {
    fail('INVALID_APPLICATION_INPUT', 'additionalCategorical must be an array.');
  }
  const normalized = inputs
    .map(input => normalizeCategorical(resolver, input, evidenceById))
    .sort((left, right) => compareText(refMode(left.surface), refMode(right.surface)));
  const primaryMode = refMode(primary.surface);
  const modes = normalized.map(selection => refMode(selection.surface));
  if (
    modes.includes(primaryMode) ||
    new Set(modes).size !== modes.length ||
    normalized.some(selection => selection.selectionId === primary.selectionId)
  ) {
    fail(
      'INVALID_DATA_VISUALIZATION_POLICY',
      'Additional categorical systems must cover distinct modes other than the primary visualization mode.'
    );
  }
  return normalized;
}

function semanticMeaningRoleRank(role: ColorSystemSemanticMeaningRoleV2): number {
  return COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2.indexOf(role);
}

function normalizeSemanticMeaning(
  inputs: readonly ColorSystemSemanticMeaningInputV2[],
  productSemantics: readonly ColorSystemProductSemanticRoleV2[],
  modes: readonly string[]
): ColorSystemSemanticMeaningEvidenceV2[] {
  if (!Array.isArray(inputs)) {
    fail('INVALID_APPLICATION_INPUT', 'semanticMeaning must be an array.');
  }
  const normalized = inputs
    .map((input, index) => {
      assertExactKeys(
        input,
        [
          'role',
          'mode',
          'targetHueRange',
          'basis',
          'meaningSource',
          'familyId',
          'memberId',
          'measuredHueDegrees',
          'measuredChroma',
          'inRange',
          'warning',
          'sharedFill',
          'collision',
          'evidenceIds',
        ],
        `semanticMeaning[${index}]`
      );
      const label = `semanticMeaning[${index}]`;
      if (
        input.sharedFill !== null &&
        (input.role !== 'destructive' || input.sharedFill !== 'error')
      ) {
        fail(
          'INVALID_APPLICATION_INPUT',
          `${label} may only declare destructive sharing the error fill.`
        );
      }
      if (semanticMeaningRoleRank(input.role) < 0) {
        fail('INVALID_APPLICATION_INPUT', `${label} names a role without hue meaning.`);
      }
      if (
        ![
          'hue-range',
          'nearest-hue',
          'brand-primary-hue',
          'information-family',
          'functional-fit',
        ].includes(input.basis)
      ) {
        fail('INVALID_APPLICATION_INPUT', `${label} has an unsupported meaning basis.`);
      }
      if (
        input.basis === 'functional-fit' &&
        (!['selected', 'link', 'focus'].includes(input.role) || input.targetHueRange !== null)
      ) {
        fail(
          'INVALID_APPLICATION_INPUT',
          `${label} functional fit is limited to selected, link, or focus without a hue-range claim.`
        );
      }
      // p3-B: the source is a closed vocabulary; its consistency with the range verdict is checked below.
      if (
        !(COLOR_SYSTEM_SEMANTIC_MEANING_SOURCES_V2 as readonly string[]).includes(
          input.meaningSource
        )
      ) {
        fail('INVALID_APPLICATION_INPUT', `${label} has an unsupported meaning source.`);
      }
      if (
        input.meaningSource === 'reserve' &&
        !(COLOR_SYSTEM_SEMANTIC_FILL_ROLES_V2 as readonly string[]).includes(input.role)
      ) {
        fail(
          'INVALID_APPLICATION_INPUT',
          `${label} may not draw ${input.role} from a status reserve; reserves serve status fills only.`
        );
      }
      const mode = requireNonEmpty(input.mode, `${label}.mode`);
      const role = productSemantics.find(item => item.mode === mode && item.role === input.role);
      if (!role) {
        fail('INVALID_APPLICATION_INPUT', `${label} does not match a composed product role.`);
      }
      if (
        role.ref.kind !== 'approved-family-member' ||
        role.ref.ref.familyId !== input.familyId ||
        role.ref.ref.memberId !== input.memberId
      ) {
        fail(
          'INVALID_APPLICATION_INPUT',
          `${label} must cite the approved family member that the ${input.role} role resolves to.`
        );
      }
      const measured =
        role.resolved.value.representation?.kind === 'native-srgb'
          ? colorSystemSrgbToOklchV1(role.resolved.value)
          : hexToOklch(role.resolved.value.hex);
      const measuredHueDegrees = measured.c < 1e-6 ? 0 : measured.h;
      if (
        Math.abs(
          requireFinite(input.measuredHueDegrees, `${label}.measuredHueDegrees`) -
            measuredHueDegrees
        ) > 1e-9 ||
        Math.abs(requireFinite(input.measuredChroma, `${label}.measuredChroma`) - measured.c) > 1e-9
      ) {
        fail(
          'INVALID_APPLICATION_INPUT',
          `${label} hue and chroma must match the resolved ${input.role} value in ${mode}.`
        );
      }
      let targetHueRange: ColorSystemHueRangeV2 | null = null;
      if (input.targetHueRange !== null) {
        assertExactKeys(input.targetHueRange, ['minimum', 'maximum'], `${label}.targetHueRange`);
        targetHueRange = {
          minimum: requireFinite(input.targetHueRange.minimum, `${label}.targetHueRange.minimum`),
          maximum: requireFinite(input.targetHueRange.maximum, `${label}.targetHueRange.maximum`),
        };
      }
      const inRange =
        targetHueRange === null
          ? true
          : colorSystemHueWithinRangeV2(measuredHueDegrees, targetHueRange);
      if (input.inRange !== inRange) {
        fail(
          'INVALID_APPLICATION_INPUT',
          `${label} inRange must be recomputed from the resolved hue and its target range.`
        );
      }
      if ((input.warning === null) === !inRange) {
        fail(
          'INVALID_APPLICATION_INPUT',
          `${label} must carry a warning exactly when the role leaves its hue range.`
        );
      }
      if ((input.meaningSource === 'nearest') !== !inRange) {
        fail(
          'INVALID_APPLICATION_INPUT',
          `${label} meaningSource must be nearest exactly when the role leaves its hue range.`
        );
      }
      return {
        role: input.role,
        mode,
        policyVersion: COLOR_SYSTEM_APPLICATION_SEMANTIC_HUE_POLICY_VERSION,
        targetHueRange,
        basis: input.basis,
        meaningSource: input.meaningSource,
        familyId: requireNonEmpty(input.familyId, `${label}.familyId`),
        memberId: requireNonEmpty(input.memberId, `${label}.memberId`),
        measuredHueDegrees,
        measuredChroma: measured.c,
        inRange,
        warning: input.warning === null ? null : requireNonEmpty(input.warning, `${label}.warning`),
        sharedFill: input.sharedFill,
        collision:
          input.collision === null ? null : requireNonEmpty(input.collision, `${label}.collision`),
        evidenceIds: sortedUniqueStrings(input.evidenceIds, `${label}.evidenceIds`),
      } satisfies ColorSystemSemanticMeaningEvidenceV2;
    })
    .sort(
      (left, right) =>
        compareText(left.mode, right.mode) ||
        semanticMeaningRoleRank(left.role) - semanticMeaningRoleRank(right.role)
    );
  for (const mode of modes) {
    const roles = normalized.filter(item => item.mode === mode).map(item => item.role);
    if (canonicalJson(roles) !== canonicalJson(COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2)) {
      fail(
        'INVALID_APPLICATION_INPUT',
        `${mode} must record hue meaning for every meaning role exactly once.`
      );
    }
    // Recompute fill distinctness from the resolved values: every pair inside the
    // floor must be either the declared error/destructive share or a collision
    // declared on both roles, and no role may claim a collision it does not have.
    const fills = COLOR_SYSTEM_SEMANTIC_FILL_ROLES_V2.map(role => {
      const entry = normalized.find(item => item.mode === mode && item.role === role)!;
      const resolved = productSemantics.find(item => item.mode === mode && item.role === role)!;
      return { role, entry, rgb: colorRgb(resolved.resolved.value) };
    });
    const undeclaredPartners = new Map<ColorSystemSemanticMeaningRoleV2, number>(
      fills.map(fill => [fill.role, 0])
    );
    fills.forEach((left, position) => {
      fills.slice(position + 1).forEach(right => {
        const distance = deltaEOK(left.rgb, right.rgb);
        const declaredShare =
          left.role === 'error' &&
          right.role === 'destructive' &&
          right.entry.sharedFill === 'error';
        if (declaredShare && distance >= COLOR_SYSTEM_APPLICATION_MEANING_FILL_MINIMUM_DELTA_E_OK) {
          fail(
            'INVALID_APPLICATION_INPUT',
            `${mode}/destructive declares a shared error fill but the two fills are distinct.`
          );
        }
        if (distance < COLOR_SYSTEM_APPLICATION_MEANING_FILL_MINIMUM_DELTA_E_OK && !declaredShare) {
          undeclaredPartners.set(left.role, undeclaredPartners.get(left.role)! + 1);
          undeclaredPartners.set(right.role, undeclaredPartners.get(right.role)! + 1);
        }
      });
    });
    fills.forEach(fill => {
      if ((fill.entry.collision === null) !== (undeclaredPartners.get(fill.role) === 0)) {
        fail(
          'INVALID_APPLICATION_INPUT',
          `${mode}/${fill.role} must declare a fill collision exactly when another meaning fill sits within ${COLOR_SYSTEM_APPLICATION_MEANING_FILL_MINIMUM_DELTA_E_OK} Delta E OK of it.`
        );
      }
    });
  }
  if (normalized.length !== modes.length * COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2.length) {
    fail('INVALID_APPLICATION_INPUT', 'semanticMeaning must cover only the declared modes.');
  }
  return normalized;
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
  diverging: ColorSystemDivergingSelectionV2 | null,
  additionalCategorical: readonly ColorSystemCategoricalSelectionV2[]
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
  for (const selection of [
    categorical,
    ...(diverging === null ? [] : [diverging]),
    ...additionalCategorical,
  ]) {
    // p3-I: a recorded order is never re-ordered or replaced; its modeled-CVD
    // finding is a warning on the selection, not a blocker.
    if (selection.orderSource === 'recorded') continue;
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
  sequential: ColorSystemSequentialSelectionV2 | null,
  diverging: ColorSystemDivergingSelectionV2 | null,
  additionalCategorical: readonly ColorSystemCategoricalSelectionV2[],
  typography: readonly ColorSystemTypographySpecimenV2[]
): ColorSystemSectionRatingV2[] {
  const fraction = (passing: number, total: number): number => (total === 0 ? 0 : passing / total);
  const eligibleJobs = new Set(candidate.jobEligibility.flatMap(entry => entry.jobs));
  const cvdSelections = [
    categorical,
    ...(diverging === null ? [] : [diverging]),
    ...additionalCategorical,
  ];
  const chartKindCount = 1 + Number(sequential !== null) + Number(diverging !== null);
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
          measuredValue: chartKindCount,
          threshold: chartKindCount,
          unit: 'chart-kinds',
          evidenceIds: [
            ...categorical.evidenceIds,
            ...(sequential?.evidenceIds ?? []),
            ...(diverging?.evidenceIds ?? []),
          ],
        },
        {
          id: 'data-visualization-cvd-advisory',
          label: 'Advisory CVD separation checks',
          measuredValue: fraction(
            cvdSelections.filter(selection => selection.cvdAdvisory.status === 'pass').length,
            cvdSelections.length
          ),
          threshold: 1,
          unit: 'fraction',
          evidenceIds: cvdSelections.map(selection => selection.selectionId),
        },
      ],
      limitation: `CVD simulation is advisory evidence and is not a colorblind-safe claim.${
        chartKindCount === 3
          ? ''
          : ' Only present chart kinds are assessed; absent charts are not generated under Keep.'
      }`,
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

const INTERACTION_STATES = ['rest', 'hover', 'pressed'] as const;

function normalizeInteraction(
  resolver: Resolver,
  input: ColorSystemInteractionApplicationInputV1,
  roles: readonly ColorSystemProductSemanticRoleV2[],
  evidenceById: ReadonlyMap<string, ColorSystemRenderedPairEvidenceV2>
): ColorSystemInteractionApplicationV1 {
  assertExactKeys(input, ['requirements', 'statePlans'], 'interaction');
  let requirements: ColorSystemInteractionApplicationV1['requirements'];
  try {
    requirements = normalizeColorSystemInteractionRequirementsV1(input.requirements, [
      ...resolver.modes,
    ]);
  } catch (error) {
    fail(
      'INVALID_APPLICATION_INPUT',
      error instanceof Error ? error.message : 'Invalid interaction requirements.'
    );
  }
  const limits = COLOR_SYSTEM_INTERACTION_PLAN_V1_LIMITS;
  const boundedArray = (value: unknown, maximum: number, label: string): void => {
    if (
      !Array.isArray(value) ||
      value.length > maximum ||
      Array.from({ length: value.length }, (_, index) =>
        Object.prototype.hasOwnProperty.call(value, index)
      ).includes(false)
    )
      fail('INVALID_APPLICATION_INPUT', `${label} must be a bounded dense array.`);
  };
  boundedArray(input.statePlans, limits.maximumUses, 'Interaction state plans');
  const useKey = (mode: string, role: string): string => canonicalJson([mode, role]);
  const uses = requirements.uses.map(use => ({
    ...use,
    resolvedSurfaces: use.surfaces.map(ref => {
      const resolved = resolveRef(resolver, ref, `${use.mode}/${use.role} required surface`);
      if (resolved.value.alpha !== 1)
        fail(
          'INVALID_APPLICATION_INPUT',
          'Required interaction surfaces must be opaque preserved colors.'
        );
      return resolved;
    }),
  }));
  const usesByKey = new Map(uses.map(use => [useKey(use.mode, use.role), use]));
  const roleFor = (mode: string, role: string): ColorSystemProductSemanticRoleV2 => {
    const value = roles.find(entry => entry.mode === mode && entry.role === role);
    if (!value) fail('INVALID_APPLICATION_INPUT', `${mode}/${role} has no semantic role.`);
    return value;
  };
  const assertNotReserve = (ref: ColorSystemApplicationColorRefV2): void => {
    if (ref.kind !== 'approved-family-member') return;
    const family = resolver.candidate.families.find(
      entry => entry.stableFamilyId === ref.ref.familyId
    );
    if (family?.contributionId.startsWith(COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2))
      fail('INVALID_APPLICATION_INPUT', 'Status reserves cannot serve required interaction uses.');
  };
  const requirePair = (
    id: string,
    foreground: ColorSystemApplicationColorRefV2,
    background: ColorSystemApplicationColorRefV2,
    underlay: ColorSystemApplicationColorRefV2 | null,
    category: ColorSystemRenderedPairCategoryV2
  ): ColorSystemRenderedPairEvidenceV2 => {
    if (typeof id !== 'string' || id.length > limits.maximumTextLength)
      fail('INVALID_APPLICATION_INPUT', 'Interaction pair evidence ID must be bounded text.');
    const evidence = requireEvidence(evidenceById, id, 'Interaction pair evidence');
    const context = evidence.context;
    if (
      !sameRef(context.foreground, foreground) ||
      !sameRef(context.background, background) ||
      (underlay === null
        ? context.underlay !== null
        : context.underlay === null || !sameRef(context.underlay, underlay)) ||
      context.category !== category ||
      context.assessment !== 'required' ||
      context.backdropKind !== 'solid' ||
      evidence.status !== 'pass'
    )
      fail(
        'INVALID_APPLICATION_INPUT',
        `${id} must prove the exact required interaction pair and pass its unrounded threshold.`
      );
    return evidence;
  };
  for (const use of uses) {
    const role = roleFor(use.mode, use.role);
    assertNotReserve(role.ref);
    if (use.role === 'selected' || use.role === 'link') continue;
    for (const surface of use.surfaces) {
      const id = role.pairEvidenceIds.find(id => {
        const context = evidenceById.get(id)?.context;
        return (
          context && sameRef(context.foreground, role.ref) && sameRef(context.background, surface)
        );
      });
      if (!id)
        fail(
          'INVALID_APPLICATION_INPUT',
          `${use.mode}/${use.role} is missing a required source surface pair.`
        );
      requirePair(id, role.ref, surface, null, use.role === 'text' ? 'normal-text' : 'non-text');
    }
  }
  const statePlans: ColorSystemInteractionStatePlanV1[] = input.statePlans
    .map((plan, index) => {
      const label = `interaction.statePlans[${index}]`;
      assertExactKeys(plan, ['role', 'mode', 'states', 'onForeground', 'pairs'], label);
      if (plan.role !== 'selected' && plan.role !== 'link')
        fail('INVALID_APPLICATION_INPUT', `${label} has an unsupported state role.`);
      const use = usesByKey.get(useKey(plan.mode, plan.role));
      if (!use) fail('INVALID_APPLICATION_INPUT', `${label} has no declared requirement.`);
      assertExactKeys(plan.states, INTERACTION_STATES, `${label}.states`);
      const members = INTERACTION_STATES.map(state => {
        const wrapped = normalizeRef(
          { kind: 'approved-family-member', ref: plan.states[state] },
          `${label}.${state}`
        );
        if (wrapped.kind !== 'approved-family-member' || wrapped.ref.mode !== plan.mode)
          fail(
            'INVALID_APPLICATION_INPUT',
            `${label} state must use an approved member in the required mode.`
          );
        assertRefEligibleForJob(resolver, wrapped, 'product-semantics', `${label}.${state}`);
        assertNotReserve(wrapped);
        const family = resolver.candidate.families.find(
          entry => entry.stableFamilyId === wrapped.ref.familyId
        )!;
        const member = family.members.find(entry => entry.stableMemberId === wrapped.ref.memberId)!;
        if (family.shape.kind !== 'full-light-dark-scale')
          fail('INVALID_APPLICATION_INPUT', `${label} requires a complete scale family.`);
        return {
          ref: wrapped.ref,
          value: resolveRef(resolver, wrapped, `${label}.${state}`).value,
          step: member.order,
          eligibleJob: 'product-semantics' as const,
        };
      });
      const family = resolver.candidate.families.find(
        entry => entry.stableFamilyId === members[0].ref.familyId
      )!;
      const restRole = roleFor(plan.mode, plan.role);
      if (!sameRef(restRole.ref, { kind: 'approved-family-member', ref: members[0].ref }))
        fail('INVALID_APPLICATION_INPUT', `${label} rest must equal its semantic role reference.`);
      const onForeground =
        plan.onForeground === null
          ? null
          : normalizeRef(plan.onForeground, `${label}.onForeground`);
      if (plan.role === 'selected') {
        if (!onForeground || !sameRef(onForeground, roleFor(plan.mode, 'on-selected').ref))
          fail('INVALID_APPLICATION_INPUT', `${label} must use the common on-selected foreground.`);
        assertRefEligibleForAnyJob(
          resolver,
          onForeground,
          STRUCTURAL_ROLE_JOBS,
          `${label}.onForeground`
        );
        assertNotReserve(onForeground);
      } else if (onForeground !== null) {
        fail('INVALID_APPLICATION_INPUT', `${label} link states cannot declare an on-foreground.`);
      }
      const foreground =
        onForeground === null ? null : resolveRef(resolver, onForeground, `${label}.onForeground`);
      let selection: ReturnType<typeof selectColorSystemInteractionStatesV1>;
      try {
        selection = selectColorSystemInteractionStatesV1({
          role: plan.role,
          mode: plan.mode,
          families: [
            {
              familyId: family.stableFamilyId,
              contributionId: family.contributionId,
              preference: 0,
              members,
            },
          ],
          surfaces: use.resolvedSurfaces.map((surface, surfaceIndex) => ({
            ref: use.surfaces[surfaceIndex],
            value: surface.value,
          })),
          onForegrounds:
            foreground === null ? [] : [{ ref: foreground.ref, value: foreground.value }],
        });
      } catch (error) {
        fail(
          'INVALID_APPLICATION_INPUT',
          error instanceof Error ? error.message : `${label} is invalid.`
        );
      }
      if (selection.status !== 'ready')
        fail(
          'INVALID_APPLICATION_INPUT',
          `${label} is infeasible: ${selection.diagnostics.failures[0]?.code ?? 'no complete states'}.`
        );
      for (let state = 0; state < INTERACTION_STATES.length; state++) {
        if (
          canonicalJson(selection.selection.states[INTERACTION_STATES[state]].ref) !==
          canonicalJson(members[state].ref)
        )
          fail('INVALID_APPLICATION_INPUT', `${label} states must follow increasing scale steps.`);
      }
      boundedArray(plan.pairs, limits.maximumSurfacesPerUse * 3, `${label}.pairs`);
      if (plan.pairs.length !== use.surfaces.length * 3)
        fail('INVALID_APPLICATION_INPUT', `${label} must cover every state and required surface.`);
      const pairs = plan.pairs
        .map(binding => {
          assertExactKeys(
            binding,
            ['state', 'surface', 'surfacePairEvidenceId', 'onForegroundPairEvidenceId'],
            `${label}.pairs`
          );
          if (!(INTERACTION_STATES as readonly string[]).includes(binding.state))
            fail('INVALID_APPLICATION_INPUT', `${label} has an unknown state pair.`);
          const surface = normalizeRef(binding.surface, `${label}.surface`);
          if (
            surface.kind !== 'preserved-source-color' ||
            !use.surfaces.some(ref => sameRef(ref, surface))
          )
            fail('INVALID_APPLICATION_INPUT', `${label} pair must use a required source surface.`);
          const member = selection.selection.states[binding.state];
          const stateRef: ColorSystemApplicationColorRefV2 = {
            kind: 'approved-family-member',
            ref: member.ref,
          };
          requirePair(
            binding.surfacePairEvidenceId,
            stateRef,
            surface,
            null,
            plan.role === 'link' ? 'normal-text' : 'non-text'
          );
          if (onForeground !== null) {
            if (binding.onForegroundPairEvidenceId === null)
              fail('INVALID_APPLICATION_INPUT', `${label} is missing common foreground evidence.`);
            requirePair(
              binding.onForegroundPairEvidenceId,
              onForeground,
              stateRef,
              member.value.alpha === 1 ? null : surface,
              'normal-text'
            );
          } else if (binding.onForegroundPairEvidenceId !== null) {
            fail(
              'INVALID_APPLICATION_INPUT',
              `${label} link evidence cannot include an on-foreground.`
            );
          }
          return { ...binding, surface };
        })
        .sort(
          (left, right) =>
            INTERACTION_STATES.indexOf(left.state) - INTERACTION_STATES.indexOf(right.state) ||
            compareText(canonicalJson(left.surface), canonicalJson(right.surface))
        );
      if (
        new Set(pairs.map(pair => canonicalJson([pair.state, pair.surface]))).size !== pairs.length
      )
        fail('INVALID_APPLICATION_INPUT', `${label} repeats a state and surface pair.`);
      return {
        role: plan.role,
        mode: plan.mode,
        states: { rest: members[0].ref, hover: members[1].ref, pressed: members[2].ref },
        onForeground,
        pairs,
        selectionPolicyVersion: selection.policyVersion,
        resolvedStates: selection.selection.states,
        resolvedOnForeground: selection.selection.onForeground,
        measurements: selection.selection.pairs,
        distinction: selection.selection.distinction,
      };
    })
    .sort(
      (left, right) => compareText(left.mode, right.mode) || compareText(left.role, right.role)
    );
  const expectedStateUses = uses.filter(use => use.role === 'selected' || use.role === 'link');
  if (
    statePlans.length !== expectedStateUses.length ||
    new Set(statePlans.map(plan => useKey(plan.mode, plan.role))).size !== statePlans.length
  )
    fail(
      'INVALID_APPLICATION_INPUT',
      'Every required selected or link use needs exactly one complete state plan.'
    );
  return {
    requirements,
    requirementsHash: deterministicContentHash({
      requirements,
      sourceHash: resolver.brief.sourceHash,
      briefHash: resolver.brief.briefHash,
      candidateHash: resolver.candidate.candidateHash,
      surfaces: uses.map(use => ({
        mode: use.mode,
        role: use.role,
        surfaces: use.resolvedSurfaces,
      })),
    }),
    statePlans,
  };
}

function allReferencedEvidenceIds(
  productGraphics: readonly ColorSystemProductGraphicsSpecimenV2[],
  productSemantics: readonly ColorSystemProductSemanticRoleV2[],
  categorical: ColorSystemCategoricalSelectionV2,
  additionalCategorical: readonly ColorSystemCategoricalSelectionV2[],
  typography: readonly ColorSystemTypographySpecimenV2[],
  interaction?: ColorSystemInteractionApplicationV1
): Set<string> {
  return new Set([
    ...productGraphics.flatMap(specimen => specimen.pairEvidenceIds),
    ...productSemantics.flatMap(role => role.pairEvidenceIds),
    ...categorical.markPairEvidenceIds,
    ...additionalCategorical.flatMap(selection => selection.markPairEvidenceIds),
    ...typography.map(specimen => specimen.pairEvidenceId),
    ...(interaction?.statePlans.flatMap(plan =>
      plan.pairs.flatMap(pair =>
        pair.onForegroundPairEvidenceId === null
          ? [pair.surfacePairEvidenceId]
          : [pair.surfacePairEvidenceId, pair.onForegroundPairEvidenceId]
      )
    ) ?? []),
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
  assertKeys(
    input,
    [
      'compilerVersion',
      'modes',
      'productGraphics',
      'productSemantics',
      'semanticMeaning',
      'visualization',
      'additionalCategorical',
      'typography',
      'pairContexts',
      'limitations',
    ],
    ['interaction', 'productGraphicsRequirements'],
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
  const productGraphicsRequirements =
    input.productGraphicsRequirements === undefined
      ? undefined
      : normalizeColorSystemProductGraphicsRequirementsV1(
          input.productGraphicsRequirements,
          brief,
          input.productGraphics[0]?.mode ?? ''
        );
  const productGraphics = normalizeProductGraphics(
    resolver,
    input.productGraphics,
    evidenceById,
    productGraphicsRequirements
  );
  const productSemantics = normalizeProductSemantics(
    resolver,
    input.productSemantics,
    modes,
    evidenceById
  );
  const semanticMeaning = normalizeSemanticMeaning(input.semanticMeaning, productSemantics, modes);
  const categorical = normalizeCategorical(resolver, input.visualization.categorical, evidenceById);
  const keepsCharts = brief.sections.some(
    section => section.role === 'data-visualization' && section.disposition === 'preserve'
  );
  for (const [kind, job] of [
    ['sequential', 'sequential-data'],
    ['diverging', 'diverging-data'],
  ] as const) {
    if (
      input.visualization[kind] === null &&
      (!keepsCharts || brief.requiredSecondaryJobs.includes(job))
    ) {
      fail(
        'INVALID_APPLICATION_INPUT',
        `${kind} may be null only when Data Visualization is preserved and ${job} is not required.`
      );
    }
  }
  const sequential =
    input.visualization.sequential === null
      ? null
      : normalizeSequential(resolver, input.visualization.sequential);
  const diverging =
    input.visualization.diverging === null
      ? null
      : normalizeDiverging(resolver, input.visualization.diverging);
  const additionalCategorical = normalizeAdditionalCategorical(
    resolver,
    input.additionalCategorical,
    categorical,
    evidenceById
  );
  const typography = normalizeTypography(resolver, input.typography, modes, evidenceById);
  const interaction =
    input.interaction === undefined
      ? undefined
      : normalizeInteraction(resolver, input.interaction, productSemantics, evidenceById);
  for (const meaning of semanticMeaning) {
    if (
      meaning.basis === 'functional-fit' &&
      !interaction?.requirements.uses.some(
        use => use.mode === meaning.mode && use.role === meaning.role
      )
    )
      fail(
        'INVALID_APPLICATION_INPUT',
        'Functional fit requires a declared and validated interaction use.'
      );
  }
  const referencedEvidenceIds = allReferencedEvidenceIds(
    productGraphics,
    productSemantics,
    categorical,
    additionalCategorical,
    typography,
    interaction
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
    apcaSupplementary: COLOR_SYSTEM_APPLICATION_APCA_POLICY_VERSION,
    cvdAdvisory: COLOR_SYSTEM_APPLICATION_CVD_POLICY_VERSION,
    sequentialPerceptual: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_POLICY_VERSION,
    divergingSemantics: COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION,
    divergingMidpoint: COLOR_SYSTEM_APPLICATION_DIVERGING_MIDPOINT_POLICY_VERSION,
    semanticHue: COLOR_SYSTEM_APPLICATION_SEMANTIC_HUE_POLICY_VERSION,
    recordedOrder: COLOR_SYSTEM_APPLICATION_RECORDED_ORDER_POLICY_VERSION,
    sourcePolicy: candidate.policyVersion,
  };
  const blockers = blockersFromEvidence(
    pairEvidence,
    categorical,
    diverging,
    additionalCategorical
  );
  const ratings = applicationRatings(
    brief,
    candidate,
    productGraphics,
    categorical,
    sequential,
    diverging,
    additionalCategorical,
    typography
  );
  const applicationEvidenceHash = deterministicContentHash({
    sourceHash: brief.sourceHash,
    briefHash: brief.briefHash,
    actualSystemHash: candidate.actualSystemHash,
    candidateHash: candidate.candidateHash,
    productGraphics,
    productSemantics,
    semanticMeaning,
    pairEvidence,
    visualization: {
      categorical,
      sequential,
      diverging,
    },
    additionalCategorical,
    typography,
    limitations,
    policyVersions,
    ratings,
    blockers,
    ...(interaction === undefined ? {} : { interaction }),
    ...(productGraphicsRequirements === undefined ? {} : { productGraphicsRequirements }),
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
    semanticMeaning,
    visualization: { categorical, sequential, diverging },
    additionalCategorical,
    typography,
    pairEvidence,
    ...(interaction === undefined ? {} : { interaction }),
    ...(productGraphicsRequirements === undefined ? {} : { productGraphicsRequirements }),
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

/**
 * p4-B: a mark as the composer submitted it, rebuilt from its evidence: the
 * approved member's bare ref, or the preserved recorded color with its origin.
 */
function markInputFromEvidence(
  mark: ColorSystemVisualizationMarkEvidenceV2
): ColorSystemVisualizationMarkInputV2 {
  return {
    order: mark.order,
    label: mark.label,
    ref: mark.ref.kind === 'approved-family-member' ? mark.ref.ref : mark.ref,
    ...(mark.origin === undefined ? {} : { origin: mark.origin }),
  };
}

function categoricalContextFromSelection(
  selection: ColorSystemCategoricalSelectionV2
): ColorSystemCategoricalContextV2 {
  return {
    selectionId: selection.selectionId,
    marks: selection.marks.map(markInputFromEvidence),
    surface: selection.surface,
    evidenceIds: selection.evidenceIds,
    adjacency: selection.adjacency,
    boundary: selection.boundary,
    markPairEvidenceIds: selection.markPairEvidenceIds,
    directLabels: selection.directLabels,
    nonColorCue: selection.nonColorCue,
    requestedMarkCount: selection.requestedMarkCount,
    achievedMarkCount: selection.achievedMarkCount,
    limitation: selection.limitation,
    orderSource: selection.orderSource,
    orderWarnings: selection.orderWarnings,
  };
}

export function colorSystemApplicationInputFromBlueprintV2(
  blueprint: ColorSystemApplicationSystemBlueprintV2
): ColorSystemApplicationSystemBlueprintV2Input {
  const { sequential, diverging } = blueprint.visualization;
  return {
    compilerVersion: blueprint.compilerVersion,
    modes: blueprint.modes,
    ...(blueprint.productGraphicsRequirements === undefined
      ? {}
      : { productGraphicsRequirements: blueprint.productGraphicsRequirements }),
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
      ...(role.groundSource === undefined ? {} : { groundSource: role.groundSource }),
    })),
    semanticMeaning: blueprint.semanticMeaning.map(item => ({
      role: item.role,
      mode: item.mode,
      targetHueRange: item.targetHueRange,
      basis: item.basis,
      meaningSource: item.meaningSource,
      familyId: item.familyId,
      memberId: item.memberId,
      measuredHueDegrees: item.measuredHueDegrees,
      measuredChroma: item.measuredChroma,
      inRange: item.inRange,
      warning: item.warning,
      sharedFill: item.sharedFill,
      collision: item.collision,
      evidenceIds: item.evidenceIds,
    })),
    visualization: {
      categorical: categoricalContextFromSelection(blueprint.visualization.categorical),
      sequential:
        sequential === null
          ? null
          : {
              selectionId: sequential.selectionId,
              marks: sequential.marks.map(markInputFromEvidence),
              surface: sequential.surface,
              evidenceIds: sequential.evidenceIds,
              direction: sequential.direction,
              axisLabel: sequential.axisLabel,
              endpointLabels: sequential.endpointLabels,
              nonColorCue: sequential.nonColorCue,
              orderSource: sequential.orderSource,
            },
      diverging:
        diverging === null
          ? null
          : {
              selectionId: diverging.selectionId,
              marks: diverging.marks.map(markInputFromEvidence),
              surface: diverging.surface,
              evidenceIds: diverging.evidenceIds,
              polarity: diverging.polarity,
              midpointOrder: diverging.midpointOrder,
              midpointMeaning: diverging.midpointMeaning,
              midpointPolarity: diverging.midpointPolarity,
              zeroReferenceLine: diverging.zeroReferenceLine,
              negativeLabel: diverging.negativeLabel,
              positiveLabel: diverging.positiveLabel,
              nonColorCue: diverging.nonColorCue,
              orderSource: diverging.orderSource,
            },
    },
    additionalCategorical: blueprint.additionalCategorical.map(categoricalContextFromSelection),
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
    ...(blueprint.interaction === undefined
      ? {}
      : {
          interaction: {
            requirements: blueprint.interaction.requirements,
            statePlans: blueprint.interaction.statePlans.map(plan => ({
              role: plan.role,
              mode: plan.mode,
              states: plan.states,
              onForeground: plan.onForeground,
              pairs: plan.pairs,
            })),
          },
        }),
    limitations: blueprint.limitations,
  };
}

/**
 * p3-I: the review's one-line fact about where the surfaces came from. `mixed`
 * when the modes disagree. `groundNames` lists the recorded grounds that serve
 * as page backgrounds, in mode order, without repeats.
 */
export interface ColorSystemReviewSurfacesFactV2 {
  source: ColorSystemStructuralGroundSourceV2 | 'mixed';
  groundNames: readonly string[];
  statement: string;
}

/** p3-I: the review's one-line fact about whether the chart order is the brand's own. */
export interface ColorSystemReviewChartOrderFactV2 {
  source: ColorSystemChartOrderSourceV2;
  /** Marks that reproduce recorded chart colors in the recorded order. */
  recordedCount: number;
  /** The recorded order's 3:1 and modeled-CVD findings, verbatim from the selection. */
  warnings: readonly string[];
  statement: string;
}

function joinNames(names: readonly string[]): string {
  return names.join(', ');
}

function relativeLuminanceOf(role: ColorSystemProductSemanticRoleV2): number {
  const rgb = colorRgb(role.resolved.value);
  return getRelativeLuminance(rgb.r, rgb.g, rgb.b);
}

/**
 * p3-I: reads the background roles' ground sources and, for recorded grounds,
 * the recorded names from the brief. The statement is the sentence the review
 * prints; both are derived, never stored.
 */
export function colorSystemReviewSurfacesFactV2(
  brief: ColorSystemBuilderBriefV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewSurfacesFactV2 {
  // Light grounds first, then dark, so the sentence reads page-then-night whatever the
  // modes are called; ties keep the declared mode order.
  const backgrounds = application.modes
    .flatMap(mode =>
      application.productSemantics.filter(role => role.mode === mode && role.role === 'background')
    )
    .map((role, index) => ({ role, index, luminance: relativeLuminanceOf(role) }))
    .sort(
      (left, right) =>
        Number(right.luminance >= 0.5) - Number(left.luminance >= 0.5) || left.index - right.index
    )
    .map(entry => entry.role);
  const sourceOf = (role: ColorSystemProductSemanticRoleV2): ColorSystemStructuralGroundSourceV2 =>
    role.groundSource ??
    (role.ref.kind === 'preserved-source-color' ? 'observed-neutral' : 'generated-ramp');
  // A recorded name is shown without its board or section prefix: “Primary / Surface
  // Gray” prints as “Surface Gray”. The last path segment is the color's own name.
  const shortName = (name: string): string =>
    name
      .split('/')
      .map(segment => segment.trim())
      .filter(segment => segment.length > 0)
      .pop() ?? name;
  const nameOf = (role: ColorSystemProductSemanticRoleV2): string | null => {
    if (role.ref.kind !== 'preserved-source-color') return null;
    const stableColorId = role.ref.stableColorId;
    const source = brief.preservedColors.find(color => color.stableColorId === stableColorId);
    return source ? shortName(source.displayName) : null;
  };
  const sources = new Set(backgrounds.map(sourceOf));
  const groundNames = [
    ...new Set(backgrounds.map(nameOf).filter((name): name is string => name !== null)),
  ];
  if (sources.size === 1) {
    const [source] = [...sources];
    return {
      source,
      groundNames,
      statement:
        source === 'generated-ramp'
          ? 'Surfaces: generated neutral ramp'
          : source === 'observed-claim'
            ? `Surfaces: your recorded grounds (${joinNames(groundNames)})`
            : `Surfaces: your recorded neutrals (${joinNames(groundNames)})`,
    };
  }
  const perMode = backgrounds.map(role => {
    const source = sourceOf(role);
    const name = nameOf(role);
    return source === 'generated-ramp'
      ? `generated neutral ramp in ${role.mode}`
      : `your recorded ${source === 'observed-claim' ? 'ground' : 'neutral'} in ${role.mode}${name ? ` (${name})` : ''}`;
  });
  return { source: 'mixed', groundNames, statement: `Surfaces: ${perMode.join('; ')}` };
}

/** p3-I: reads the primary categorical selection's order source, recorded count and warnings. */
export function colorSystemReviewChartOrderFactV2(
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewChartOrderFactV2 {
  const categorical = application.visualization.categorical;
  // p4-B: recorded marks carry `origin: 'recorded'`; the blueprint holds them one for
  // one with the selection's recorded-advisory pairs.
  const recordedCount = categorical.marks.filter(mark => mark.origin === 'recorded').length;
  return {
    source: categorical.orderSource,
    recordedCount,
    warnings: categorical.orderWarnings,
    statement:
      categorical.orderSource === 'recorded'
        ? `Chart order: your recorded order (${recordedCount} ${recordedCount === 1 ? 'color' : 'colors'})`
        : 'Chart order: generated',
  };
}

function applicationIntegrityComparison(blueprint: ColorSystemApplicationSystemBlueprintV2) {
  const measurement = (value: number | null) => (value === null ? null : canonicalNumber(value));
  const contrast = (ratio: number | null, threshold: 3 | 4.5) => ({
    ratio: measurement(ratio),
    // Rounding may preserve measurement identity, but cannot cross a pass/fail boundary.
    meetsThreshold: ratio === null ? null : meetsApplicationContrastThreshold(ratio, threshold),
  });
  const chart = (
    selection:
      | ColorSystemCategoricalSelectionV2
      | ColorSystemSequentialSelectionV2
      | ColorSystemDivergingSelectionV2
      | null
  ) => {
    if (selection === null) return null;
    const monotonic = (metric: 'oklabLightness' | 'relativeLuminance') => {
      const values = selection.marks.map(mark => mark[metric]);
      if (selection.kind === 'sequential')
        return strictlyMonotonic(values, selection.direction === 'light-to-dark' ? -1 : 1);
      if (selection.kind === 'diverging')
        return armIsMonotonic(values, selection.midpointOrder - 1, selection.midpointPolarity);
      return null;
    };
    return {
      selection: {
        ...selection,
        marks: selection.marks.map(mark => ({
          ...mark,
          oklabLightness: canonicalNumber(mark.oklabLightness),
          relativeLuminance: canonicalNumber(mark.relativeLuminance),
        })),
      },
      monotonic: {
        oklabLightness: monotonic('oklabLightness'),
        relativeLuminance: monotonic('relativeLuminance'),
      },
    };
  };

  // Only recomputed diagnostics use the shared numeric policy. Spreading the full
  // records keeps exact paints, geometry, thresholds, decisions and authority in the comparison.
  return {
    ...blueprint,
    pairEvidence: blueprint.pairEvidence.map(pair => ({
      ...pair,
      ratio: contrast(pair.ratio, pair.requiredRatio),
      apcaLc: measurement(pair.apcaLc),
    })),
    typography: blueprint.typography.map(specimen => ({
      ...specimen,
      ratio: contrast(specimen.ratio, specimen.threshold),
    })),
    visualization: {
      ...blueprint.visualization,
      categorical: chart(blueprint.visualization.categorical),
      sequential: chart(blueprint.visualization.sequential),
      diverging: chart(blueprint.visualization.diverging),
    },
    additionalCategorical: blueprint.additionalCategorical.map(chart),
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
    colorSystemApplicationInputFromBlueprintV2(blueprint)
  );
  if (
    canonicalJson(applicationIntegrityComparison(rebuilt)) !==
    canonicalJson(applicationIntegrityComparison(blueprint))
  ) {
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
  secondary: ['marketing-accent', 'product-semantics'],
  'product-graphics': [
    'product-graphics',
    'functional-iconography',
    'product-ui-surface',
    'product-semantics',
  ],
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
