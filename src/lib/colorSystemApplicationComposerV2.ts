import { getRelativeLuminance, getWCAGContrast } from './accessibility';
import { simulateCVD, type CVDType } from './colorBlindness';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import {
  normalizeColorSystemInteractionRequirementsV1,
  type ColorSystemInteractionRequirementsV1,
  type ColorSystemInteractionRequirementV1,
  type ColorSystemInteractionStatePlanInputV1,
} from './colorSystemInteractionPlanV1';
import { selectColorSystemInteractionStatesV1 } from './colorSystemInteractionStatesV1';
import {
  colorSystemProductGraphicsCandidateAllowedV1,
  colorSystemProductGraphicsPairContextsV1,
  normalizeColorSystemProductGraphicsRequirementsV1,
  type ColorSystemProductGraphicsRequirementsV1,
} from './colorSystemProductGraphicsPlanV1';
import {
  colorSystemSrgbToOklchV1,
  colorSystemSrgbToRgbV1 as rgb,
  compositeColorSystemRgbV1 as composite,
  colorSystemRgbDeltaEOKV1,
} from './colorSystemSrgbValueV1';
import {
  type ColorSystemApplicationColorRefV2,
  type ColorSystemApprovedColorRefV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemFamilyMemberV2,
  type ColorSystemJobV2,
  type ColorSystemPreservedColorV2,
  type ColorSystemProductGraphicsJobV2,
  type ColorSystemSecondaryFamilyV2,
  type ColorSystemStrategyCandidateV2,
  type ColorSystemTypographyUseCategoryV2,
} from './colorSystemBuilderV2Contracts';
import {
  COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_DIVERGING_MINIMUM_MIDPOINT_SURFACE_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION,
  COLOR_SYSTEM_APPLICATION_MEANING_FILL_MINIMUM_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_GENERATED_DIVERGING_SEMANTICS_POLICY_VERSION,
  COLOR_SYSTEM_APPLICATION_RECORDED_DIVERGING_SEMANTICS_POLICY_VERSION,
  COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK,
  COLOR_SYSTEM_PRODUCT_GRAPHICS_JOBS_V2,
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ON_ROLE_PARENTS_V2,
  COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2,
  buildColorSystemApplicationBlueprintV2,
  createColorSystemRenderedPairAssessorV2,
  colorSystemCoefficientOfVariationV2,
  colorSystemHueDistanceToRangeV2,
  colorSystemHueDistanceV2,
  colorSystemHueWithinRangeV2,
  type ColorSystemApplicationSystemBlueprintV2,
  type ColorSystemApplicationSystemBlueprintV2Input,
  type ColorSystemCategoricalContextV2,
  type ColorSystemChartOrderSourceV2,
  type ColorSystemDivergingPolarityV2,
  type ColorSystemHueRangeV2,
  type ColorSystemProductSemanticOnRoleNameV2,
  type ColorSystemProductSemanticRoleNameV2,
  type ColorSystemRenderedPairAssessmentV2,
  type ColorSystemRenderedPairCategoryV2,
  type ColorSystemRenderedPairContextV2,
  type ColorSystemRenderedPairEvidenceV2,
  type ColorSystemSemanticHueRangeRoleV2,
  type ColorSystemSemanticMeaningBasisV2,
  type ColorSystemSemanticMeaningInputV2,
  type ColorSystemSemanticMeaningRoleV2,
  type ColorSystemSemanticMeaningSourceV2,
  type ColorSystemStructuralGroundSourceV2,
} from './colorSystemApplicationBlueprintV2';
import {
  assertColorSystemBuilderBriefV2Integrity,
  assertColorSystemStrategyCandidateV2Integrity,
} from './colorSystemBuilderV2Integrity';
import {
  paletteDivergingClaimV3,
  paletteGroundClaimV3,
  paletteOrderClaimV3,
  paletteTextClaimV3,
  type PaletteDivergingClaimV3,
  type PaletteGroundClaimV3,
  type PaletteTextClaimV3,
} from './colorSystemPaletteAnalysisV3';
import { compareText, hexToRgb, rgbToOklab, type RGB } from './utils';

export const COLOR_SYSTEM_APPLICATION_COMPOSER_V2_VERSION =
  'teul-application-composer/v3.1' as const;
export const COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2 = 0.04 as const;
export const COLOR_SYSTEM_APPLICATION_PRODUCT_GRAPHICS_POLICY_VERSION =
  'teul-product-graphics-specimen-selection/v2' as const;
/**
 * Measured neutral rule shared with the Secondary engine: a family whose Light
 * step-9 (or base) member has OKLCH chroma below this ceiling is a neutral ramp.
 * Neutrals are detected by this measurement, never by display name.
 */
export const COLOR_SYSTEM_APPLICATION_NEUTRAL_RAMP_CHROMA_CEILING_V2 = 0.03 as const;
/**
 * p3-J: OKLCH chroma the most chromatic opaque Primary lock must reach to give
 * the brand a hue. Below it the Primary board is neutral (Black, White, grays):
 * no family is the brand's own, and focus and selected take the composer's
 * fallback rather than following a hue the brand does not have.
 */
export const COLOR_SYSTEM_APPLICATION_BRAND_HUE_CHROMA_FLOOR_V2 = 0.04 as const;
/**
 * The composer's own defaults match the Builder UI defaults so a direct caller and
 * the plugin compose the same system when no counts are requested.
 */
export const COLOR_SYSTEM_APPLICATION_COMPOSER_DEFAULT_MARK_COUNTS_V2 = {
  categorical: 6,
  sequential: 5,
  diverging: 3,
} as const;
/** A family counts as "the brand family" when its anchor hue is within this many degrees of the Primary. */
export const COLOR_SYSTEM_APPLICATION_BRAND_FAMILY_HUE_TOLERANCE_DEGREES_V2 = 15 as const;
/** Categorical marks are compared hue-first only among candidates within this OKLab lightness band. */
export const COLOR_SYSTEM_APPLICATION_CATEGORICAL_LIGHTNESS_TOLERANCE_V2 = 0.1 as const;
/**
 * A raised surface stays close to its page background: Radix steps 1 and 2 differ
 * by a few hundredths of OKLab lightness. A preserved neutral farther than this
 * from the background is not a surface, so the background doubles as the surface.
 */
export const COLOR_SYSTEM_APPLICATION_SURFACE_LIGHTNESS_BAND_V2 = 0.15 as const;
/**
 * p3-I: OKLab lightness a recorded color must reach to serve as a page ground.
 * Radix step 1 sits near L 0.99 in a light scale and 0.18 in a dark one; these
 * bounds admit off-whites, papers and near-blacks and refuse mid-tones, which
 * are never a page background whatever their names claim.
 */
export const COLOR_SYSTEM_APPLICATION_GROUND_LIGHTNESS_BOUNDS_V2 = {
  light: 0.85,
  dark: 0.35,
} as const;
/**
 * p3-I: observed opaque neutrals in one mode form a usable gray ramp for the
 * border and disabled roles from this many distinct values; below it the
 * generated ramp (when one exists) supplies those roles.
 */
export const COLOR_SYSTEM_APPLICATION_OBSERVED_GRAY_RAMP_MINIMUM_V2 = 4 as const;
/**
 * p3-I: evidence id the composer records on a categorical selection that
 * follows the brand's recorded chart order. The review surface reads it back.
 */
export const COLOR_SYSTEM_APPLICATION_RECORDED_ORDER_EVIDENCE_ID_V2 =
  'composer:categorical:recorded-order' as const;
/**
 * p3-B: the planner names conventional status-reserve families by this
 * contribution prefix. The composer keeps them for status fills only: never
 * link, focus, selected, product graphics, marketing, or data roles, whatever
 * eligibility they were granted.
 */
export const COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2 =
  'generic-status-reserve-' as const;
/** p3-B: how a family relates to the brand; feeds `meaningSource` on every meaning role. */
export type ColorSystemFamilyDerivationV2 = 'brand' | 'reserve' | 'generated';

export type ColorSystemApplicationComposerBlockerCodeV2 =
  | 'INVALID_COMPOSITION_REQUEST'
  | 'MODE_NOT_AVAILABLE'
  | 'MISSING_JOB_ELIGIBILITY'
  | 'MISSING_PRESERVED_NEUTRAL'
  | 'SURFACE_CONTEXT_UNAVAILABLE'
  | 'CATEGORICAL_BOUNDARY_UNAVAILABLE'
  | 'PAIR_THRESHOLD_UNSATISFIED'
  | 'SEMANTIC_ROLE_UNSATISFIED'
  | 'CATEGORICAL_SYSTEM_UNDERFILLED'
  | 'SEQUENTIAL_SYSTEM_UNDERFILLED'
  | 'DIVERGING_SYSTEM_UNDERFILLED'
  | 'DIVERGING_POLARITY_UNRESOLVED'
  | 'APPLICATION_BLUEPRINT_BLOCKED';

export interface ColorSystemApplicationComposerBlockerV2 {
  code: ColorSystemApplicationComposerBlockerCodeV2;
  scope: string;
  message: string;
}

export interface ColorSystemApplicationComposerOptionsV2 {
  modes?: readonly string[];
  applicationMode?: 'Light' | 'Dark';
  surfaceContext?: 'light' | 'dark';
  categoricalMarkCount?: number;
  sequentialMarkCount?: number;
  divergingMarkCount?: number;
  categoricalAdjacency?: 'separated' | 'touching';
  divergingMidpointMeaning?: string;
  interactionRequirements?: ColorSystemInteractionRequirementsV1;
  productGraphicsRequirements?: ColorSystemProductGraphicsRequirementsV1;
}

export type ColorSystemApplicationComposerResultV2 =
  | {
      status: 'ready';
      blueprint: ColorSystemApplicationSystemBlueprintV2;
      compositionHash: string;
      blockers: readonly [];
    }
  | {
      status: 'blocked';
      blueprint: ColorSystemApplicationSystemBlueprintV2 | null;
      compositionHash: string;
      blockers: readonly ColorSystemApplicationComposerBlockerV2[];
    };

type Polarity = 'light' | 'dark';

interface ApprovedOption {
  ref: ColorSystemApprovedColorRefV2;
  value: ColorSystemColorValueV2;
  jobs: Set<ColorSystemJobV2>;
  identity: string;
  prominence: 'supporting' | 'accent' | 'leading';
  contributionId: string;
  order: number;
  sourceColorIds: readonly string[];
  eligibilityEvidenceIds: readonly string[];
  brandFitEvidenceIds: readonly string[];
}

interface PreservedOption {
  ref: ColorSystemApplicationColorRefV2;
  value: ColorSystemColorValueV2;
  identity: string;
}

type Option = PreservedOption | ApprovedOption;

interface RenderedOption {
  /** p4-B: an approved member or, for a recorded chart color no member carries, the preserved color. */
  option: Option;
  rgb: RGB;
  lightness: number;
  luminance: number;
  chroma: number;
  hue: number;
}

interface PairChoice {
  foreground: Option;
  background: Option;
  underlay: Option | null;
  ratio: number;
}

interface ProductGraphicsChoice {
  job: ColorSystemProductGraphicsJobV2;
  pair: PairChoice;
  option: ApprovedOption;
  renderedRgb: RGB;
  chroma: number;
  sourceContext: boolean;
  sourceDistance: number | null;
  pairContexts?: readonly ColorSystemRenderedPairContextV2[];
}

interface FamilyProfile {
  familyId: string;
  anchorMemberId: string;
  anchorHex: string;
  hue: number;
  chroma: number;
  neutral: boolean;
  /** p3-B: brand-derived, planner status reserve, or generated accent. */
  derivation: ColorSystemFamilyDerivationV2;
}

interface ModeTypography {
  normal: PairChoice;
  supporting: PairChoice;
  heading: PairChoice;
  reverse: PairChoice;
}

/** p3-I: the five product roles that come from grounds and grays rather than from a hue. */
type StructuralRole = 'background' | 'surface' | 'text' | 'border' | 'disabled';

interface ModeNeutrals {
  mode: string;
  polarity: Polarity;
  background: Option;
  surface: Option;
  text: Option;
  border: Option;
  disabled: Option;
  textPair: PairChoice;
  surfacePair: PairChoice;
  borderPair: PairChoice;
  disabledPair: PairChoice;
  /** p3-I: where each structural role came from, recorded on the blueprint role. */
  groundSources: Readonly<Record<StructuralRole, ColorSystemStructuralGroundSourceV2>>;
  /** p3-I: the rule that chose each structural role, printed in its intended use. */
  groundReasons: Readonly<Record<StructuralRole, string>>;
  typography: ModeTypography;
  typographySource: 'neutral-ramp' | 'preserved';
  onForegroundCandidates: readonly Option[];
  graphicsSurfaces: readonly Option[];
  chartSurfaces: readonly Option[];
  preserved: readonly PreservedOption[];
}

interface MeaningChoice {
  role: ColorSystemSemanticMeaningRoleV2;
  familyId: string;
  pair: PairChoice;
  option: ApprovedOption;
  basis: ColorSystemSemanticMeaningBasisV2;
  /** p3-B: which kind of family carries the role; `nearest` exactly when it left its range. */
  meaningSource: ColorSystemSemanticMeaningSourceV2;
  targetHueRange: ColorSystemHueRangeV2 | null;
  category: ColorSystemRenderedPairCategoryV2;
  warning: string | null;
  /** `destructive` intentionally sharing the `error` fill (at most one red family). */
  sharedFill: ColorSystemSemanticMeaningRoleV2 | null;
  /** Set after every fill is placed: this fill sits within the distinctness floor of another. */
  collision: string | null;
}

class CompositionBlocked extends Error {
  constructor(readonly blocker: ColorSystemApplicationComposerBlockerV2) {
    super(blocker.message);
  }
}

const PRODUCT_GRAPHICS_JOB_MAP: Readonly<
  Record<ColorSystemProductGraphicsJobV2, ColorSystemJobV2>
> = {
  'product-graphic': 'product-graphics',
  'functional-iconography': 'functional-iconography',
  'product-ui-surface': 'product-ui-surface',
};

/**
 * These preferences only resolve otherwise valid measured choices. They never
 * make a member eligible or allow it to bypass the exact 3:1 rendered-pair gate.
 */
const PRODUCT_GRAPHICS_PROMINENCE_PREFERENCE: Readonly<
  Record<ColorSystemProductGraphicsJobV2, Readonly<Record<ApprovedOption['prominence'], number>>>
> = {
  'product-graphic': { supporting: 0, accent: 1, leading: 2 },
  'functional-iconography': { supporting: 0, leading: 1, accent: 2 },
  'product-ui-surface': { leading: 0, accent: 1, supporting: 2 },
};

const TYPOGRAPHY_CATEGORIES = [
  'primary-body',
  'supporting-body',
  'large-heading',
  'reverse-body',
] as const satisfies readonly ColorSystemTypographyUseCategoryV2[];

const MEANING_ROLES = new Set<ColorSystemProductSemanticRoleNameV2>([
  'focus',
  'success',
  'warning',
  'error',
  'information',
  'destructive',
  'selected',
]);

/**
 * Hue-band fills are resolved in this order (roles with an in-range family first,
 * then the rest) so `information` can anchor `link`, `focus` and `selected`, and
 * an in-range role always keeps its fill when a nearest-hue role would collide.
 * `destructive` is placed last, relative to `error`.
 */
const HUE_RANGE_ROLE_ORDER = [
  'information',
  'success',
  'warning',
  'error',
] as const satisfies readonly ColorSystemSemanticHueRangeRoleV2[];

/** Fills judged for pairwise distinctness, in the order collisions are reported. */
const MEANING_FILL_ROLES = [
  'success',
  'warning',
  'error',
  'destructive',
  'information',
] as const satisfies readonly ColorSystemSemanticMeaningRoleV2[];

const HUE_RANGE_LABELS: Readonly<Record<ColorSystemSemanticHueRangeRoleV2, string>> = {
  success: 'green',
  warning: 'amber',
  error: 'red',
  destructive: 'red',
  information: 'blue',
};

const ON_ROLES = Object.keys(
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ON_ROLE_PARENTS_V2
) as ColorSystemProductSemanticOnRoleNameV2[];

const DATA_JOBS = ['categorical-data', 'sequential-data', 'diverging-data'] as const;

/** Radix-style positions on a 12-step neutral ramp, expressed as 1-based steps. */
const RAMP_STEPS = {
  background: 1,
  surface: 2,
  border: 7,
  disabled: 8,
  secondaryText: 11,
  text: 12,
} as const;

function block(
  code: ColorSystemApplicationComposerBlockerCodeV2,
  scope: string,
  message: string
): never {
  throw new CompositionBlocked({ code, scope, message });
}

function isApproved(option: Option): option is ApprovedOption {
  return 'jobs' in option;
}

function approvedRef(option: ApprovedOption): ColorSystemApplicationColorRefV2 {
  return { kind: 'approved-family-member', ref: option.ref };
}

function refOf(option: Option): ColorSystemApplicationColorRefV2 {
  return isApproved(option) ? approvedRef(option) : option.ref;
}

/** p4-B: the family an option belongs to; null for a preserved source color. */
function familyIdOf(option: Option): string | null {
  return isApproved(option) ? option.ref.familyId : null;
}

function isOpaque(option: Option): boolean {
  return option.value.alpha === 1;
}

function luminanceOf(option: Option): number {
  const value = rgb(option.value);
  return getRelativeLuminance(value.r, value.g, value.b);
}

function lightnessOf(option: Option): number {
  const value = rgb(option.value);
  return rgbToOklab(value.r, value.g, value.b).L;
}

function renderBackground(background: Option, underlay: Option | null): RGB | null {
  if (background.value.alpha === 1) return rgb(background.value);
  if (!underlay || underlay.value.alpha !== 1) return null;
  return composite(rgb(background.value), background.value.alpha, rgb(underlay.value));
}

function contrast(choice: Omit<PairChoice, 'ratio'>): number | null {
  const background = renderBackground(choice.background, choice.underlay);
  if (!background) return null;
  const foreground = composite(
    rgb(choice.foreground.value),
    choice.foreground.value.alpha,
    background
  );
  return getWCAGContrast(foreground, background);
}

export function meetsColorSystemApplicationComposerThresholdV2(
  ratio: number,
  threshold: 3 | 4.5
): boolean {
  return Number.isFinite(ratio) && ratio >= threshold;
}

/**
 * Mode polarity drives which end of the neutral range is the surface. A mode whose
 * name contains "dark" (any case) is composed as light text on dark surfaces; every
 * other mode is composed as dark text on light surfaces.
 */
export function colorSystemApplicationModePolarityV2(mode: string): Polarity {
  return /dark/i.test(mode) ? 'dark' : 'light';
}

function anchorMember(family: ColorSystemSecondaryFamilyV2): ColorSystemFamilyMemberV2 {
  const shape = family.shape;
  return (
    family.members.find(member => member.role === 'step-9') ??
    family.members.find(member => member.order === 9) ??
    (shape.kind === 'named-base-light-pair'
      ? family.members.find(member => member.stableMemberId === shape.baseMemberId)
      : undefined) ??
    family.members[0]
  );
}

function anchorValue(member: ColorSystemFamilyMemberV2): ColorSystemColorValueV2 {
  const modes = Object.keys(member.valuesByMode).sort(compareText);
  return member.valuesByMode.Light ?? member.valuesByMode[modes[0]];
}

/** The actual Light step-9 (or base) value, including native source precision. */
export function colorSystemFamilyAnchorValueV2(
  family: ColorSystemSecondaryFamilyV2
): ColorSystemColorValueV2 {
  return anchorValue(anchorMember(family));
}

/** Six-digit display representation of the family anchor. */
export function colorSystemFamilyAnchorHexV2(family: ColorSystemSecondaryFamilyV2): string {
  return colorSystemFamilyAnchorValueV2(family).hex;
}

/** Shared by ranking and review so native source precision yields one measurement. */
export function colorSystemMeanAnchorSeparationDeltaEOKV2(
  candidate: ColorSystemStrategyCandidateV2
): number {
  const anchors = candidate.families.map(family => rgb(colorSystemFamilyAnchorValueV2(family)));
  if (anchors.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let left = 0; left < anchors.length; left += 1) {
    for (let right = left + 1; right < anchors.length; right += 1) {
      total += colorSystemRgbDeltaEOKV1(anchors[left], anchors[right]);
      pairs += 1;
    }
  }
  return total / pairs;
}

/** Measured neutral rule; see COLOR_SYSTEM_APPLICATION_NEUTRAL_RAMP_CHROMA_CEILING_V2. */
export function isColorSystemNeutralFamilyV2(family: ColorSystemSecondaryFamilyV2): boolean {
  return (
    colorSystemSrgbToOklchV1(anchorValue(anchorMember(family))).c <
    COLOR_SYSTEM_APPLICATION_NEUTRAL_RAMP_CHROMA_CEILING_V2
  );
}

/** p3-B: a family the planner added as a conventional status reserve. */
export function isColorSystemStatusReserveFamilyV2(
  family: Pick<ColorSystemSecondaryFamilyV2, 'contributionId'>
): boolean {
  return family.contributionId.startsWith(COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2);
}

/**
 * p3-I: mean ΔEOK from each chromatic family anchor (its Light step 9) to the
 * nearest source anchor. Source anchors are the Primary locks, every
 * evidence-only source reference, every preserved Secondary, product-graphics or
 * chart color (base and tints; p3-J added the graphics and chart colors) and
 * every tint pinned into a family's scale. Measured neutral ramps are
 * generated by policy and never source-derived, so they stay out of the mean: a
 * brand whose hues all come back exact reads 0. Null when there are no source
 * anchors or no chromatic families.
 */
export function colorSystemSourceContinuityDeltaEOKV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2
): number | null {
  const sourceAnchors = [
    ...brief.primaryLocks.map(lock => lock.expectedValue),
    ...brief.sourceReferenceColors.flatMap(color => Object.values(color.valuesByMode)),
    ...brief.preservedColors
      .filter(
        color =>
          color.section === 'secondary' ||
          color.section === 'product-graphics' ||
          color.section === 'data-visualization'
      )
      .flatMap(color => Object.values(color.valuesByMode)),
    ...candidate.families.flatMap(family =>
      (family.pinnedMembers ?? []).flatMap(pin => {
        const value = family.members.find(member => member.stableMemberId === pin.stableMemberId)
          ?.valuesByMode[pin.mode];
        return value ? [value] : [];
      })
    ),
  ];
  const chromatic = candidate.families.filter(family => !isColorSystemNeutralFamilyV2(family));
  if (sourceAnchors.length === 0 || chromatic.length === 0) return null;
  const distances = chromatic.map(family => {
    const anchor = rgb(anchorValue(anchorMember(family)));
    return Math.min(...sourceAnchors.map(source => delta(anchor, rgb(source), 'normal')));
  });
  return distances.reduce((sum, value) => sum + value, 0) / distances.length;
}

/** Every hex the reviewed source owns, in any mode, upper-cased for exact comparison. */
function sourceValueIdentities(brief: ColorSystemBuilderBriefV2): Set<string> {
  return new Set(
    [...brief.preservedColors, ...brief.sourceReferenceColors].flatMap(color =>
      Object.values(color.valuesByMode).map(value => canonicalJson(value))
    )
  );
}

function familyProfiles(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2
): FamilyProfile[] {
  const owned = sourceValueIdentities(brief);
  return [...candidate.families]
    .map(family => {
      const member = anchorMember(family);
      const hex = anchorValue(member).hex;
      const oklch = colorSystemSrgbToOklchV1(anchorValue(member));
      return {
        familyId: family.stableFamilyId,
        anchorMemberId: member.stableMemberId,
        anchorHex: hex,
        hue: oklch.c < 1e-6 ? 0 : oklch.h,
        chroma: oklch.c,
        neutral: oklch.c < COLOR_SYSTEM_APPLICATION_NEUTRAL_RAMP_CHROMA_CEILING_V2,
        // A family that reproduces a reviewed source hex exactly is brand-derived,
        // matching the review model's reading; the reserve prefix wins over that.
        derivation: isColorSystemStatusReserveFamilyV2(family)
          ? 'reserve'
          : owned.has(canonicalJson(anchorValue(member)))
            ? 'brand'
            : 'generated',
      } satisfies FamilyProfile;
    })
    .sort((left, right) => compareText(left.familyId, right.familyId));
}

interface FamilyReadings {
  profiles: FamilyProfile[];
  brand: FamilyProfile | null;
  brandHueDegrees: number | null;
}

/**
 * Profiles every family once. The Primary-hue family reads as brand-derived
 * even when its anchor is not an exact source hex, because focus and selected
 * follow it as the brand's own.
 */
function readFamilies(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2
): FamilyReadings {
  const profiles = familyProfiles(brief, candidate);
  const brandHueDegrees = brandHue(brief);
  const brand = brandFamily(profiles, brandHueDegrees);
  if (brand) brand.derivation = 'brand';
  return { profiles, brand, brandHueDegrees };
}

/** p3-B: the family the composer treats as the brand's own (anchor hue within tolerance of the Primary), if any. */
export function colorSystemBrandFamilyIdV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2
): string | null {
  return readFamilies(brief, candidate).brand?.familyId ?? null;
}

/** p3-B: how one family relates to the brand, as the composer reads it; null for an unknown family. */
export function colorSystemFamilyDerivationV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  familyId: string
): ColorSystemFamilyDerivationV2 | null {
  return (
    readFamilies(brief, candidate).profiles.find(profile => profile.familyId === familyId)
      ?.derivation ?? null
  );
}

function approvedOptions(candidate: ColorSystemStrategyCandidateV2): ApprovedOption[] {
  const families = new Map(candidate.families.map(family => [family.stableFamilyId, family]));
  return candidate.jobEligibility
    .map(entry => {
      const family = families.get(entry.ref.familyId);
      const member = family?.members.find(item => item.stableMemberId === entry.ref.memberId);
      const value = member?.valuesByMode[entry.ref.mode];
      if (!family || !member || !value) return null;
      return {
        ref: { ...entry.ref },
        value,
        // p3-B: a status reserve may serve product semantics only, whatever it was granted.
        jobs: new Set(
          isColorSystemStatusReserveFamilyV2(family)
            ? entry.jobs.filter(job => job === 'product-semantics')
            : entry.jobs
        ),
        identity: `${entry.ref.familyId}\u0000${entry.ref.memberId}\u0000${entry.ref.mode}`,
        prominence: family.brandFit.prominence,
        contributionId: family.contributionId,
        order: member.order,
        sourceColorIds: member.provenance.sourceColorIds,
        eligibilityEvidenceIds: entry.evidenceIds,
        brandFitEvidenceIds: family.brandFit.evidenceIds,
      } satisfies ApprovedOption;
    })
    .filter((option): option is ApprovedOption => option !== null)
    .sort((left, right) => compareText(left.identity, right.identity));
}

/**
 * p3-I: a preserved neutral read together with what its recorded name claims.
 * Claims come from the palette-analysis vocabulary, so the composer and the
 * intent policy read a name the same way.
 */
interface ObservedNeutral {
  option: PreservedOption;
  displayName: string;
  groundClaim: PaletteGroundClaimV3 | null;
  textClaim: PaletteTextClaimV3 | null;
  lightness: number;
  luminance: number;
}

/**
 * Preserved colors that can serve neutral roles in `mode`: every Typography
 * color, plus any Primary-board color whose sRGB channel spread reads as a
 * neutral. A preserved Secondary (or chart) color is a hue-family member even
 * when it is a pale tint, so it joins only when its name claims a ground.
 */
function observedNeutrals(brief: ColorSystemBuilderBriefV2, mode: string): ObservedNeutral[] {
  return brief.preservedColors
    .flatMap(color => {
      const value = color.valuesByMode[mode];
      if (!value) return [];
      const channels = [value.components.r, value.components.g, value.components.b];
      const nearNeutral = Math.max(...channels) - Math.min(...channels) <= 0.08;
      if (color.section !== 'typography' && !nearNeutral) return [];
      if (
        color.section !== 'typography' &&
        color.section !== 'primary' &&
        paletteGroundClaimV3(color.displayName) === null
      ) {
        return [];
      }
      const option: PreservedOption = {
        ref: { kind: 'preserved-source-color', stableColorId: color.stableColorId, mode },
        value,
        identity: `${color.stableColorId}\u0000${mode}`,
      };
      return [
        {
          option,
          displayName: color.displayName,
          groundClaim: paletteGroundClaimV3(color.displayName),
          textClaim: paletteTextClaimV3(color.displayName),
          lightness: lightnessOf(option),
          luminance: luminanceOf(option),
        } satisfies ObservedNeutral,
      ];
    })
    .sort((left, right) => compareText(left.option.identity, right.option.identity));
}

function eligible(
  options: readonly ApprovedOption[],
  mode: string,
  job: ColorSystemJobV2
): ApprovedOption[] {
  return options.filter(option => option.ref.mode === mode && option.jobs.has(job));
}

function surfaceCandidates(options: readonly Option[], context: Polarity): Option[] {
  return options
    .filter(isOpaque)
    .filter(option =>
      context === 'light' ? luminanceOf(option) >= 0.5 : luminanceOf(option) < 0.5
    )
    .sort((left, right) => {
      const leftLuminance = luminanceOf(left);
      const rightLuminance = luminanceOf(right);
      return (
        (context === 'light' ? rightLuminance - leftLuminance : leftLuminance - rightLuminance) ||
        compareText(left.identity, right.identity)
      );
    });
}

function exactBoundary(options: readonly Option[], surface: Option): Option | null {
  const surfaceRgb = rgb(surface.value);
  return (
    options
      .filter(option => isOpaque(option) && ['#000000', '#FFFFFF'].includes(option.value.hex))
      .sort((left, right) => {
        const leftRatio = getWCAGContrast(rgb(left.value), surfaceRgb);
        const rightRatio = getWCAGContrast(rgb(right.value), surfaceRgb);
        return rightRatio - leftRatio || compareText(left.identity, right.identity);
      })[0] ?? null
  );
}

interface PairPreference {
  preferAlphaBackground?: boolean;
  /** `lowest` picks the least contrast that still passes: the rule for subtle-but-compliant borders. */
  rank?: 'highest' | 'lowest';
}

function choosePair(
  foregrounds: readonly Option[],
  backgrounds: readonly Option[],
  threshold: 3 | 4.5,
  orientation: 'any' | 'dark-on-light' | 'light-on-dark',
  preference: PairPreference = {}
): PairChoice | null {
  const preferAlphaBackground = preference.preferAlphaBackground ?? false;
  const rank = preference.rank ?? 'highest';
  const opaqueUnderlays = backgrounds.filter(isOpaque);
  const choices: PairChoice[] = [];
  for (const foreground of foregrounds) {
    for (const background of backgrounds) {
      if (foreground.identity === background.identity) continue;
      const underlays = background.value.alpha === 1 ? [null] : opaqueUnderlays;
      for (const underlay of underlays) {
        const base = { foreground, background, underlay };
        const ratio = contrast(base);
        if (ratio === null || !meetsColorSystemApplicationComposerThresholdV2(ratio, threshold)) {
          continue;
        }
        const renderedBackground = renderBackground(background, underlay);
        if (!renderedBackground) continue;
        const renderedForeground = composite(
          rgb(foreground.value),
          foreground.value.alpha,
          renderedBackground
        );
        const foregroundLuminance = getRelativeLuminance(
          renderedForeground.r,
          renderedForeground.g,
          renderedForeground.b
        );
        const backgroundLuminance = getRelativeLuminance(
          renderedBackground.r,
          renderedBackground.g,
          renderedBackground.b
        );
        if (
          (orientation === 'dark-on-light' && foregroundLuminance >= backgroundLuminance) ||
          (orientation === 'light-on-dark' && foregroundLuminance <= backgroundLuminance)
        ) {
          continue;
        }
        choices.push({ ...base, ratio });
      }
    }
  }
  return (
    choices.sort((left, right) => {
      const leftAlpha = left.background.value.alpha < 1 ? 1 : 0;
      const rightAlpha = right.background.value.alpha < 1 ? 1 : 0;
      if (preferAlphaBackground && leftAlpha !== rightAlpha) return rightAlpha - leftAlpha;
      if (!preferAlphaBackground && leftAlpha !== rightAlpha) return leftAlpha - rightAlpha;
      return (
        (rank === 'highest' ? right.ratio - left.ratio : left.ratio - right.ratio) ||
        compareText(left.foreground.identity, right.foreground.identity) ||
        compareText(left.background.identity, right.background.identity)
      );
    })[0] ?? null
  );
}

/** A measured pair with no threshold, for inactive-exempt roles such as `disabled`. */
function measuredPair(foreground: Option, background: Option): PairChoice | null {
  const base = { foreground, background, underlay: null };
  const ratio = contrast(base);
  return ratio === null ? null : { ...base, ratio };
}

function pairContext(
  id: string,
  mode: string,
  choice: PairChoice,
  category: ColorSystemRenderedPairCategoryV2,
  assessment: ColorSystemRenderedPairAssessmentV2,
  useCase: string
): ColorSystemRenderedPairContextV2 {
  return {
    id,
    mode,
    foreground: refOf(choice.foreground),
    background: refOf(choice.background),
    underlay: choice.underlay ? refOf(choice.underlay) : null,
    backdropKind: 'solid',
    category,
    assessment,
    fontSizePx: category === 'normal-text' ? 16 : category === 'large-text' ? 24 : null,
    fontWeight: category === 'non-text' ? null : 400,
    useCase,
    evidenceIds: [`composer:${id}:exact-rendered-pair`],
  };
}

function rendered(option: Option, surface: Option, underlay: Option | null = null): RenderedOption {
  const surfaceRgb = renderBackground(surface, underlay) ?? rgb(surface.value);
  const renderedRgb = composite(rgb(option.value), option.value.alpha, surfaceRgb);
  const renderedLab = rgbToOklab(renderedRgb.r, renderedRgb.g, renderedRgb.b);
  const chroma = Math.hypot(renderedLab.a, renderedLab.b);
  const hue = chroma < 1e-6 ? 0 : (Math.atan2(renderedLab.b, renderedLab.a) * 180) / Math.PI;
  return {
    option,
    rgb: renderedRgb,
    lightness: renderedLab.L,
    luminance: getRelativeLuminance(renderedRgb.r, renderedRgb.g, renderedRgb.b),
    chroma,
    hue: hue < 0 ? hue + 360 : hue,
  };
}

function delta(first: RGB, second: RGB, type: CVDType): number {
  const left = type === 'normal' ? first : simulateCVD(first, { type, severity: 1 });
  const right = type === 'normal' ? second : simulateCVD(second, { type, severity: 1 });
  return colorSystemRgbDeltaEOKV1(left, right);
}

function minimumModeledDelta(first: RGB, second: RGB): number {
  return Math.min(
    delta(first, second, 'normal'),
    delta(first, second, 'protanopia'),
    delta(first, second, 'deuteranopia'),
    delta(first, second, 'tritanopia')
  );
}

function identityKey(marks: readonly RenderedOption[]): string {
  return marks.map(mark => mark.option.identity).join('|');
}

// ---------------------------------------------------------------------------
// Neutral roles: the brand's recorded grounds first, then its recorded neutrals,
// then the generated neutral ramp (p3-I)
// ---------------------------------------------------------------------------

/**
 * Members of the lowest-chroma neutral family that are eligible for `job` in this
 * mode, ranked so index 0 is the surface end for the mode's polarity (lightest in a
 * light mode, darkest in a dark mode) and the last index is the text end. Ranking by
 * measured lightness rather than by step number keeps the polarity right even when a
 * Dark scale is not a true inversion.
 */
/** Structural neutral roles answer to the product UI surface job or to product semantics. */
const STRUCTURAL_JOBS = [
  'product-ui-surface',
  'product-semantics',
] as const satisfies readonly ColorSystemJobV2[];

function neutralRamp(
  allApproved: readonly ApprovedOption[],
  profiles: readonly FamilyProfile[],
  mode: string,
  jobs: readonly ColorSystemJobV2[],
  polarity: Polarity
): ApprovedOption[] | null {
  const neutralIds = profiles
    .filter(profile => profile.neutral)
    .sort((left, right) => left.chroma - right.chroma || compareText(left.familyId, right.familyId))
    .map(profile => profile.familyId);
  for (const familyId of neutralIds) {
    const ranked = allApproved
      .filter(
        option =>
          option.ref.mode === mode &&
          jobs.some(job => option.jobs.has(job)) &&
          option.ref.familyId === familyId &&
          isOpaque(option)
      )
      .sort(
        (left, right) =>
          (polarity === 'light'
            ? lightnessOf(right) - lightnessOf(left)
            : lightnessOf(left) - lightnessOf(right)) || compareText(left.identity, right.identity)
      )
      .filter(
        (option, index, list) =>
          index === 0 || Math.abs(lightnessOf(option) - lightnessOf(list[index - 1])) > 1e-9
      );
    if (ranked.length >= 4) return ranked;
  }
  return null;
}

function rampIndex(ramp: readonly ApprovedOption[], step: number): number {
  return Math.round(((step - 1) * (ramp.length - 1)) / 11);
}

function rampAt(ramp: readonly ApprovedOption[], step: number): ApprovedOption {
  return ramp[rampIndex(ramp, step)];
}

interface NeutralRoles {
  background: Option;
  surface: Option;
  text: Option;
  border: Option;
  disabled: Option;
  textPair: PairChoice;
  surfacePair: PairChoice;
  borderPair: PairChoice;
  disabledPair: PairChoice;
}

interface GroundRoles extends NeutralRoles {
  sources: Readonly<Record<StructuralRole, ColorSystemStructuralGroundSourceV2>>;
  reasons: Readonly<Record<StructuralRole, string>>;
}

interface GroundChoice {
  option: Option;
  source: ColorSystemStructuralGroundSourceV2;
  reason: string;
}

function describeGroundClaim(neutral: ObservedNeutral): string {
  const claim = neutral.groundClaim!;
  return `your recorded ground “${neutral.displayName}” (${claim.kind === 'named-ground' ? 'named' : 'plain'} “${claim.term}” claim)`;
}

/**
 * Structural roles from the brand's own neutrals first (p3-I).
 *
 * background: the recorded ground claimed for this polarity — a named ground
 *   (surface, background, paper …) before a plain white or black, the lightest
 *   in a light mode and the darkest in a dark mode — else the lightest or
 *   darkest recorded neutral inside the ground lightness bounds, else the
 *   generated ramp's background step.
 * surface: the next claimed ground within the surface lightness band, else the
 *   ramp step nearest the background moved one step toward the text end, else a
 *   recorded neutral within the band, else the background itself.
 * text: the recorded color that claims text (ink, text, primary text before a
 *   typography prefix; a plain black or white counts between the two) and passes
 *   4.5:1 on both the background and the surface, else the ramp's text end,
 *   else any recorded neutral that passes.
 * border and disabled: the recorded gray ramp when the mode records at least
 *   COLOR_SYSTEM_APPLICATION_OBSERVED_GRAY_RAMP_MINIMUM_V2 distinct opaque
 *   neutrals, else the generated ramp, else the recorded neutrals: the least
 *   contrast that still passes 3:1 for the border, one step toward the text end
 *   for disabled.
 *
 * Returns null only when no candidate background can carry a 4.5:1 text pair;
 * the caller then falls back to the preserved-pair search.
 */
function groundRoles(
  observed: readonly ObservedNeutral[],
  ramp: readonly ApprovedOption[] | null,
  polarity: Polarity
): GroundRoles | null {
  const opaque = observed.filter(neutral => isOpaque(neutral.option));
  const inPolarity = (neutral: ObservedNeutral): boolean =>
    polarity === 'light' ? neutral.luminance >= 0.5 : neutral.luminance < 0.5;
  const inGroundBounds = (neutral: ObservedNeutral): boolean =>
    polarity === 'light'
      ? neutral.lightness >= COLOR_SYSTEM_APPLICATION_GROUND_LIGHTNESS_BOUNDS_V2.light
      : neutral.lightness <= COLOR_SYSTEM_APPLICATION_GROUND_LIGHTNESS_BOUNDS_V2.dark;
  const towardSurface = (left: ObservedNeutral, right: ObservedNeutral): number =>
    (polarity === 'light' ? right.lightness - left.lightness : left.lightness - right.lightness) ||
    compareText(left.option.identity, right.option.identity);
  const grounds = opaque.filter(neutral => inPolarity(neutral) && inGroundBounds(neutral));
  const claimedGrounds = [
    ...grounds.filter(neutral => neutral.groundClaim?.kind === 'named-ground').sort(towardSurface),
    ...grounds.filter(neutral => neutral.groundClaim?.kind === 'plain-extreme').sort(towardSurface),
  ];
  const unclaimedGrounds = grounds
    .filter(neutral => neutral.groundClaim === null)
    .sort(towardSurface);
  const backgroundChoices: GroundChoice[] = [
    ...claimedGrounds.map(neutral => ({
      option: neutral.option,
      source: 'observed-claim' as const,
      reason: describeGroundClaim(neutral),
    })),
    ...unclaimedGrounds.map(neutral => ({
      option: neutral.option,
      source: 'observed-neutral' as const,
      reason: `your ${polarity === 'light' ? 'lightest' : 'darkest'} recorded neutral “${neutral.displayName}” (no recorded ground claims this polarity)`,
    })),
    ...(ramp
      ? [
          {
            option: rampAt(ramp, RAMP_STEPS.background),
            source: 'generated-ramp' as const,
            reason: 'the generated neutral ramp (no recorded neutral qualifies as this ground)',
          },
        ]
      : []),
  ];

  // Text candidates sit in the opposite polarity. Tier 0 named text claims, tier 1
  // a plain black or white, tier 2 a typography-prefixed name, tier 3 the ramp's
  // text end, tier 4 any other recorded neutral; within a tier, the higher contrast.
  const textTier = (neutral: ObservedNeutral): number =>
    neutral.textClaim?.kind === 'named-text'
      ? 0
      : neutral.groundClaim?.kind === 'plain-extreme'
        ? 1
        : neutral.textClaim?.kind === 'section-prefix'
          ? 2
          : 4;
  const observedText = opaque.filter(
    neutral => !inPolarity(neutral) && neutral.groundClaim?.kind !== 'named-ground'
  );
  const textReason = (neutral: ObservedNeutral): string =>
    textTier(neutral) === 0
      ? `your recorded text color “${neutral.displayName}” (named “${neutral.textClaim!.term}” claim)`
      : textTier(neutral) === 1
        ? `your recorded “${neutral.displayName}”`
        : textTier(neutral) === 2
          ? `your recorded Typography color “${neutral.displayName}”`
          : `your recorded neutral “${neutral.displayName}” (highest contrast that passes)`;

  const observedGrayRamp =
    new Set(opaque.map(neutral => neutral.option.value.hex.toUpperCase())).size >=
    COLOR_SYSTEM_APPLICATION_OBSERVED_GRAY_RAMP_MINIMUM_V2;

  for (const backgroundChoice of backgroundChoices) {
    const background = backgroundChoice.option;
    const backgroundLightness = lightnessOf(background);
    const textChoices: GroundChoice[] = [
      ...observedText
        .filter(neutral => textTier(neutral) < 3)
        .map(neutral => ({ neutral, pair: choosePair([neutral.option], [background], 4.5, 'any') }))
        .filter(
          (entry): entry is { neutral: ObservedNeutral; pair: PairChoice } => entry.pair !== null
        )
        .sort(
          (left, right) =>
            textTier(left.neutral) - textTier(right.neutral) ||
            right.pair.ratio - left.pair.ratio ||
            compareText(left.neutral.option.identity, right.neutral.option.identity)
        )
        .map(entry => ({
          option: entry.neutral.option,
          source: 'observed-claim' as const,
          reason: textReason(entry.neutral),
        })),
      ...(ramp
        ? [
            {
              option: rampAt(ramp, RAMP_STEPS.text),
              source: 'generated-ramp' as const,
              reason: 'the generated neutral ramp’s text end (no recorded text color passes 4.5:1)',
            },
          ]
        : []),
      ...observedText
        .filter(neutral => textTier(neutral) === 4)
        .map(neutral => ({ neutral, pair: choosePair([neutral.option], [background], 4.5, 'any') }))
        .filter(
          (entry): entry is { neutral: ObservedNeutral; pair: PairChoice } => entry.pair !== null
        )
        .sort(
          (left, right) =>
            right.pair.ratio - left.pair.ratio ||
            compareText(left.neutral.option.identity, right.neutral.option.identity)
        )
        .map(entry => ({
          option: entry.neutral.option,
          source: 'observed-neutral' as const,
          reason: textReason(entry.neutral),
        })),
    ];
    const withinBand = (option: Option): boolean =>
      option.identity !== background.identity &&
      Math.abs(lightnessOf(option) - backgroundLightness) <=
        COLOR_SYSTEM_APPLICATION_SURFACE_LIGHTNESS_BAND_V2;
    const rampSurface = (): ApprovedOption | null => {
      if (!ramp) return null;
      let nearest = 0;
      ramp.forEach((step, index) => {
        if (
          Math.abs(lightnessOf(step) - backgroundLightness) <
          Math.abs(lightnessOf(ramp[nearest]) - backgroundLightness)
        ) {
          nearest = index;
        }
      });
      return ramp[Math.min(nearest + 1, ramp.length - 1)];
    };
    const rampSurfaceOption = rampSurface();
    const surfaceChoices: GroundChoice[] = [
      ...claimedGrounds
        .filter(neutral => withinBand(neutral.option))
        .map(neutral => ({
          option: neutral.option,
          source: 'observed-claim' as const,
          reason: `${describeGroundClaim(neutral)}, the next recorded ground`,
        })),
      // The ramp step is adjacent to the background's nearest step by construction,
      // so it needs no band check; only that it is not the background itself.
      ...(rampSurfaceOption && rampSurfaceOption.identity !== background.identity
        ? [
            {
              option: rampSurfaceOption,
              source: 'generated-ramp' as const,
              reason:
                'the generated neutral ramp, one step from the background toward the text end',
            },
          ]
        : []),
      ...unclaimedGrounds
        .filter(neutral => withinBand(neutral.option))
        .map(neutral => ({
          option: neutral.option,
          source: 'observed-neutral' as const,
          reason: `your recorded neutral “${neutral.displayName}” within the surface band`,
        })),
      {
        option: background,
        source: backgroundChoice.source,
        reason: 'the background itself; no distinct surface stays within the surface band',
      },
    ];
    let textPair: PairChoice | null = null;
    let textChoice: GroundChoice | null = null;
    let surfacePair: PairChoice | null = null;
    let surfaceChoice: GroundChoice | null = null;
    for (const candidateText of textChoices) {
      const pair = choosePair([candidateText.option], [background], 4.5, 'any');
      if (!pair) continue;
      const surface = surfaceChoices
        .map(choice => ({
          choice,
          pair: choosePair([candidateText.option], [choice.option], 4.5, 'any'),
        }))
        .find((entry): entry is { choice: GroundChoice; pair: PairChoice } => entry.pair !== null);
      if (!surface) continue;
      textPair = pair;
      textChoice = candidateText;
      surfacePair = surface.pair;
      surfaceChoice = surface.choice;
      break;
    }
    if (!textPair || !textChoice || !surfacePair || !surfaceChoice) continue;

    // Border and disabled from the recorded gray ramp, else the generated ramp,
    // else the recorded neutrals: the least contrast that still passes 3:1.
    let borderPair: PairChoice | null = null;
    let disabledPair: PairChoice | null = null;
    let graySource: ColorSystemStructuralGroundSourceV2 = 'observed-neutral';
    let grayLabel = 'your recorded grays';
    if (observedGrayRamp || !ramp) {
      const candidates = opaque.map(neutral => neutral.option);
      borderPair = choosePair(candidates, [background], 3, 'any', { rank: 'lowest' });
      if (borderPair) {
        const border = borderPair;
        const ranked = candidates
          .map(option => measuredPair(option, background))
          .filter((pair): pair is PairChoice => pair !== null && pair.ratio > border.ratio)
          .sort(
            (left, right) =>
              left.ratio - right.ratio ||
              compareText(left.foreground.identity, right.foreground.identity)
          );
        disabledPair = ranked[0] ?? border;
      }
      grayLabel = observedGrayRamp ? 'your recorded gray ramp' : 'your recorded neutrals';
    } else {
      graySource = 'generated-ramp';
      grayLabel = 'the generated neutral ramp';
      // Radix places subtle borders at steps 6-7; Teul requires 3:1 for a border, so
      // walk from step 7 toward the text end and take the least contrast that passes.
      borderPair = choosePair(
        ramp.slice(rampIndex(ramp, RAMP_STEPS.border)),
        [background],
        3,
        'any',
        { rank: 'lowest' }
      );
      disabledPair = measuredPair(rampAt(ramp, RAMP_STEPS.disabled), background);
    }
    if (!borderPair || !disabledPair) continue;
    return {
      background,
      surface: surfaceChoice.option,
      text: textChoice.option,
      border: borderPair.foreground,
      disabled: disabledPair.foreground,
      textPair,
      surfacePair,
      borderPair,
      disabledPair,
      sources: {
        background: backgroundChoice.source,
        surface: surfaceChoice.source,
        text: textChoice.source,
        border: graySource,
        disabled: graySource,
      },
      reasons: {
        background: backgroundChoice.reason,
        surface: surfaceChoice.reason,
        text: textChoice.reason,
        border: `${grayLabel}: the least contrast that still passes 3:1 on the background`,
        disabled: `${grayLabel}: one step toward the text end from the border`,
      },
    };
  }
  return null;
}

function preservedNeutralRoles(
  preserved: readonly PreservedOption[],
  polarity: Polarity,
  mode: string
): NeutralRoles {
  const orientation = polarity === 'light' ? 'dark-on-light' : 'light-on-dark';
  const textPair = choosePair(preserved, preserved, 4.5, orientation);
  if (!textPair) {
    block(
      'PAIR_THRESHOLD_UNSATISFIED',
      `semantic/${mode}`,
      `${mode} cannot close an exact ${polarity === 'light' ? 'dark-on-light' : 'light-on-dark'} 4.5:1 text pair from its preserved neutrals.`
    );
  }
  const background = textPair.background;
  const text = textPair.foreground;
  const backgroundLightness = lightnessOf(background);
  const surfacePair =
    surfaceCandidates(preserved, polarity)
      .filter(
        option =>
          option.identity !== background.identity &&
          Math.abs(lightnessOf(option) - backgroundLightness) <=
            COLOR_SYSTEM_APPLICATION_SURFACE_LIGHTNESS_BAND_V2
      )
      .map(option => choosePair([text], [option], 4.5, 'any'))
      .find((choice): choice is PairChoice => choice !== null) ??
    choosePair([text], [background], 4.5, 'any');
  if (!surfacePair) {
    block(
      'PAIR_THRESHOLD_UNSATISFIED',
      `semantic/${mode}/surface`,
      `${mode} cannot close an exact 4.5:1 text pair on a preserved surface.`
    );
  }
  const borderPair = choosePair(preserved.filter(isOpaque), [background], 3, 'any', {
    rank: 'lowest',
  });
  if (!borderPair) {
    block(
      'PAIR_THRESHOLD_UNSATISFIED',
      `semantic/${mode}/border`,
      `${mode} cannot close an exact 3:1 border pair from its preserved neutrals.`
    );
  }
  const supporting =
    choosePair(preserved, preserved, 4.5, orientation, { preferAlphaBackground: true }) ?? textPair;
  const disabledPair = measuredPair(supporting.foreground, background) ?? textPair;
  return {
    background,
    surface: surfacePair.background,
    text,
    border: borderPair.foreground,
    disabled: disabledPair.foreground,
    textPair,
    surfacePair,
    borderPair,
    disabledPair,
  };
}

function rampTypography(ramp: readonly ApprovedOption[]): ModeTypography | null {
  const background = rampAt(ramp, RAMP_STEPS.background);
  const text = rampAt(ramp, RAMP_STEPS.text);
  const normal = choosePair([text], [background], 4.5, 'any');
  const heading = choosePair([text], [background], 3, 'any');
  const reverse = choosePair([background], [text], 4.5, 'any');
  if (!normal || !heading || !reverse) return null;
  const supporting =
    choosePair([rampAt(ramp, RAMP_STEPS.secondaryText)], [background], 4.5, 'any') ?? normal;
  return { normal, supporting, heading, reverse };
}

function preservedTypography(
  preserved: readonly PreservedOption[],
  polarity: Polarity,
  mode: string
): ModeTypography {
  const orientation = polarity === 'light' ? 'dark-on-light' : 'light-on-dark';
  const reverseOrientation = polarity === 'light' ? 'light-on-dark' : 'dark-on-light';
  const normal = choosePair(preserved, preserved, 4.5, orientation);
  const supporting =
    choosePair(preserved, preserved, 4.5, orientation, { preferAlphaBackground: true }) ?? normal;
  const heading = choosePair(preserved, preserved, 3, orientation);
  const reverse = choosePair(preserved, preserved, 4.5, reverseOrientation);
  if (!normal || !supporting || !heading || !reverse) {
    block(
      'PAIR_THRESHOLD_UNSATISFIED',
      `typography/${mode}`,
      `${mode} cannot close all four exact Typography rendered pairs.`
    );
  }
  return { normal, supporting, heading, reverse };
}

function resolveModeNeutrals(
  brief: ColorSystemBuilderBriefV2,
  allApproved: readonly ApprovedOption[],
  profiles: readonly FamilyProfile[],
  mode: string
): ModeNeutrals {
  const polarity = colorSystemApplicationModePolarityV2(mode);
  const observed = observedNeutrals(brief, mode);
  const preserved = observed.map(neutral => neutral.option);
  if (preserved.filter(isOpaque).length < 2) {
    block(
      'MISSING_PRESERVED_NEUTRAL',
      mode,
      `${mode} requires at least two opaque preserved neutral or Typography colors.`
    );
  }
  const semanticRamp = neutralRamp(allApproved, profiles, mode, STRUCTURAL_JOBS, polarity);
  // p3-I: the brand's recorded grounds and neutrals come first; the generated ramp
  // fills only the roles they cannot. The preserved-pair search remains the last
  // resort for a brand whose neutrals are all mid-tones.
  const grounded = groundRoles(observed, semanticRamp, polarity);
  const fallback = grounded ? null : preservedNeutralRoles(preserved, polarity, mode);
  const roles: NeutralRoles = grounded ?? fallback!;
  const groundSources: ModeNeutrals['groundSources'] = grounded
    ? grounded.sources
    : {
        background: 'observed-neutral',
        surface: 'observed-neutral',
        text: 'observed-neutral',
        border: 'observed-neutral',
        disabled: 'observed-neutral',
      };
  const groundReasons: ModeNeutrals['groundReasons'] = grounded
    ? grounded.reasons
    : {
        background:
          'the recorded neutral pair with the highest 4.5:1 contrast (no recorded ground or ramp qualifies)',
        surface:
          'a recorded neutral within the surface band of the background, else the background itself',
        text: 'the recorded neutral pair with the highest 4.5:1 contrast',
        border:
          'your recorded neutrals: the least contrast that still passes 3:1 on the background',
        disabled: 'your recorded supporting neutral, measured without a threshold',
      };
  const textRamp = neutralRamp(allApproved, profiles, mode, ['rendered-text-pair'], polarity);
  const rampType = textRamp ? rampTypography(textRamp) : null;
  const typography = rampType ?? preservedTypography(preserved, polarity, mode);
  const rampExtremes = semanticRamp ? [semanticRamp[0], semanticRamp[semanticRamp.length - 1]] : [];
  const chartRamp = (semanticRamp ?? []).filter(option =>
    DATA_JOBS.every(job => option.jobs.has(job))
  );
  return {
    mode,
    polarity,
    ...roles,
    groundSources,
    groundReasons,
    typography,
    typographySource: rampType ? 'neutral-ramp' : 'preserved',
    onForegroundCandidates: [...preserved.filter(isOpaque), ...rampExtremes],
    graphicsSurfaces: preserved.filter(isOpaque),
    chartSurfaces: [...preserved.filter(isOpaque), ...chartRamp],
    preserved,
  };
}

// ---------------------------------------------------------------------------
// Meaning-bearing roles: hue ranges, brand family, on-<role> foregrounds
// ---------------------------------------------------------------------------

/**
 * p3-J: the brand's hue is the most chromatic opaque Primary lock (OKLCH chroma;
 * ties by the recorded name, then lock id), so a Primary board that records
 * Black, White and one bright hue yields that hue rather than whichever lock
 * sorts first. Without locks the preserved Primary colors are read the same way,
 * Light first. Chroma under the floor is no brand hue at all.
 */
function brandHue(brief: ColorSystemBuilderBriefV2): number | null {
  const nameById = new Map(
    brief.preservedColors.map(color => [color.stableColorId, color.displayName] as const)
  );
  const candidates =
    brief.primaryLocks.length > 0
      ? brief.primaryLocks.map(lock => ({
          id: lock.lockId,
          name: nameById.get(lock.stableColorId) ?? lock.lockId,
          value: lock.expectedValue,
        }))
      : brief.preservedColors
          .filter(color => color.section === 'primary')
          .flatMap(color => {
            const value =
              color.valuesByMode.Light ??
              color.valuesByMode[Object.keys(color.valuesByMode).sort(compareText)[0]];
            return value ? [{ id: color.stableColorId, name: color.displayName, value }] : [];
          });
  const mostChromatic = candidates
    .filter(candidate => candidate.value.alpha === 1)
    .map(candidate => ({ ...candidate, oklch: colorSystemSrgbToOklchV1(candidate.value) }))
    .sort(
      (left, right) =>
        right.oklch.c - left.oklch.c ||
        compareText(left.name, right.name) ||
        compareText(left.id, right.id)
    )[0];
  if (
    !mostChromatic ||
    mostChromatic.oklch.c < COLOR_SYSTEM_APPLICATION_BRAND_HUE_CHROMA_FLOOR_V2
  ) {
    return null;
  }
  return mostChromatic.oklch.h;
}

function brandFamily(profiles: readonly FamilyProfile[], hue: number | null): FamilyProfile | null {
  if (hue === null) return null;
  // p3-B: a status reserve is never the brand's own family, however close its hue.
  const nearest = profiles
    .filter(profile => !profile.neutral && profile.derivation !== 'reserve')
    .map(profile => ({ profile, distance: colorSystemHueDistanceV2(profile.hue, hue) }))
    .sort(
      (left, right) =>
        left.distance - right.distance || compareText(left.profile.familyId, right.profile.familyId)
    )[0];
  return nearest &&
    nearest.distance <= COLOR_SYSTEM_APPLICATION_BRAND_FAMILY_HUE_TOLERANCE_DEGREES_V2
    ? nearest.profile
    : null;
}

function rangeCenter(range: ColorSystemHueRangeV2): number {
  const minimum = range.minimum % 360;
  const span = (((range.maximum - range.minimum) % 360) + 360) % 360;
  return (minimum + span / 2) % 360;
}

function stepPreference(target: number) {
  return (left: ApprovedOption, right: ApprovedOption): number =>
    Math.abs(left.order - target) - Math.abs(right.order - target) ||
    right.order - left.order ||
    compareText(left.identity, right.identity);
}

/**
 * Solid fills use step 9, sliding to neighbours only when 9 cannot pass 3:1 on the
 * background or, for fills that carry an `on-<role>` foreground, when no white,
 * black or neutral-end foreground reaches 4.5:1 on it. A brand whose lightest
 * neutral is warm paper rather than white needs the second rule: paper reaches
 * only 4.3:1 on a mid-lightness terracotta, so the fill steps down until it does.
 */
function closeFill(
  options: readonly ApprovedOption[],
  familyId: string,
  background: Option,
  onForegrounds: readonly Option[] | null
): PairChoice | null {
  const members = options
    .filter(option => option.ref.familyId === familyId)
    .sort(stepPreference(9));
  let fallback: PairChoice | null = null;
  for (const member of members) {
    const pair = choosePair([member], [background], 3, 'any');
    if (!pair) continue;
    if (onForegrounds === null || choosePair(onForegrounds, [member], 4.5, 'any')) return pair;
    fallback ??= pair;
  }
  return fallback;
}

function fillDeltaEOK(left: ApprovedOption, right: ApprovedOption): number {
  return delta(rgb(left.value), rgb(right.value), 'normal');
}

function separatedFromAll(option: ApprovedOption, assigned: readonly ApprovedOption[]): boolean {
  return assigned.every(
    other => fillDeltaEOK(option, other) >= COLOR_SYSTEM_APPLICATION_MEANING_FILL_MINIMUM_DELTA_E_OK
  );
}

/**
 * Any step of the family (9 first, then 10, 8, 11, ...) that passes 3:1 on the
 * background and keeps the distinctness floor from every fill already placed;
 * members that also host an on-foreground at 4.5:1 win over those that do not.
 */
function closeFillSeparated(
  options: readonly ApprovedOption[],
  familyId: string,
  background: Option,
  onForegrounds: readonly Option[] | null,
  assigned: readonly ApprovedOption[]
): PairChoice | null {
  const members = options
    .filter(option => option.ref.familyId === familyId)
    .sort(stepPreference(9));
  let fallback: PairChoice | null = null;
  for (const member of members) {
    if (!separatedFromAll(member, assigned)) continue;
    const pair = choosePair([member], [background], 3, 'any');
    if (!pair) continue;
    if (onForegrounds === null || choosePair(onForegrounds, [member], 4.5, 'any')) return pair;
    fallback ??= pair;
  }
  return fallback;
}

/** Text-on-surface variants use step 11, sliding to neighbours only when 11 cannot pass 4.5:1. */
function closeText(
  options: readonly ApprovedOption[],
  familyId: string,
  background: Option
): PairChoice | null {
  const members = options
    .filter(option => option.ref.familyId === familyId)
    .sort(stepPreference(11));
  for (const member of members) {
    const pair = choosePair([member], [background], 4.5, 'any');
    if (pair) return pair;
  }
  return null;
}

function rankFamiliesForRange(
  profiles: readonly FamilyProfile[],
  range: ColorSystemHueRangeV2,
  brand: FamilyProfile | null,
  used: ReadonlySet<string>
): FamilyProfile[] {
  const center = rangeCenter(range);
  const brandInRange = brand !== null && colorSystemHueWithinRangeV2(brand.hue, range);
  return (
    profiles
      .filter(profile => !profile.neutral)
      .map(profile => {
        const inRange = colorSystemHueWithinRangeV2(profile.hue, range);
        return {
          profile,
          inRange: inRange ? 1 : 0,
          isBrand: brandInRange && brand !== null && profile.familyId === brand.familyId ? 1 : 0,
          unused: used.has(profile.familyId) ? 0 : 1,
          // p3-B: inside the range, brand-derived families win, then reserves, then generated accents.
          tier: inRange ? DERIVATION_RANK[profile.derivation] : 0,
          distance: colorSystemHueDistanceToRangeV2(profile.hue, range),
          centerDistance: colorSystemHueDistanceV2(profile.hue, center),
        };
      })
      // p3-B: a reserve serves only the range it was added for; it is never another role's nearest hue.
      .filter(entry => entry.inRange === 1 || entry.profile.derivation !== 'reserve')
      .sort(
        (left, right) =>
          right.inRange - left.inRange ||
          right.isBrand - left.isBrand ||
          right.unused - left.unused ||
          left.tier - right.tier ||
          left.distance - right.distance ||
          left.centerDistance - right.centerDistance ||
          right.profile.chroma - left.profile.chroma ||
          compareText(left.profile.familyId, right.profile.familyId)
      )
      .map(entry => entry.profile)
  );
}

const DERIVATION_RANK: Readonly<Record<ColorSystemFamilyDerivationV2, number>> = {
  brand: 0,
  reserve: 1,
  generated: 2,
};

function rangeWarning(
  role: ColorSystemSemanticHueRangeRoleV2,
  range: ColorSystemHueRangeV2,
  hue: number
): string {
  return `No family in the ${HUE_RANGE_LABELS[role]} range (${range.minimum}–${range.maximum}°); ${role} uses the nearest hue at ${Math.round(hue)}°.`;
}

function measuredHue(option: Option): number {
  const oklch = colorSystemSrgbToOklchV1(option.value);
  return oklch.c < 1e-6 ? 0 : oklch.h;
}

interface FillResolution {
  pair: PairChoice;
  familyId: string;
  /** True when every family and step collided and the nearest fill was kept anyway. */
  collided: boolean;
}

/**
 * Resolve one meaning fill against the fills already placed: (A) the preferred
 * fill of the nearest-ranked family that keeps the distinctness floor; (B) another
 * step of a ranked family that keeps 3:1 and the floor; (C) the nearest fill
 * regardless, flagged as a collision so the direction stays ready but visibly so.
 */
function resolveDistinctFill(
  semanticOptions: readonly ApprovedOption[],
  ranked: readonly FamilyProfile[],
  range: ColorSystemHueRangeV2,
  background: Option,
  onForegrounds: readonly Option[],
  assigned: readonly ApprovedOption[]
): FillResolution | null {
  // p3-I: families inside the range exhaust (A) and (B) before any out-of-range
  // family is tried, so a recorded ground that nudges one fill down a step cannot
  // push a role out of its band while an in-range step still clears every gate.
  const inRange = ranked.filter(profile => colorSystemHueWithinRangeV2(profile.hue, range));
  const outOfRange = ranked.filter(profile => !colorSystemHueWithinRangeV2(profile.hue, range));
  for (const group of [inRange, outOfRange]) {
    for (const profile of group) {
      const pair = closeFill(semanticOptions, profile.familyId, background, onForegrounds);
      if (pair && separatedFromAll(pair.foreground as ApprovedOption, assigned)) {
        return { pair, familyId: profile.familyId, collided: false };
      }
    }
    for (const profile of group) {
      const pair = closeFillSeparated(
        semanticOptions,
        profile.familyId,
        background,
        onForegrounds,
        assigned
      );
      if (pair) return { pair, familyId: profile.familyId, collided: false };
    }
  }
  for (const profile of ranked) {
    const pair = closeFill(semanticOptions, profile.familyId, background, onForegrounds);
    if (pair) return { pair, familyId: profile.familyId, collided: true };
  }
  return null;
}

function collisionWarning(
  role: ColorSystemSemanticMeaningRoleV2,
  partner: ColorSystemSemanticMeaningRoleV2,
  hex: string,
  outOfRange: (role: ColorSystemSemanticMeaningRoleV2) => boolean
): string {
  const bandRole = (
    outOfRange(role) ? role : outOfRange(partner) ? partner : role
  ) as ColorSystemSemanticHueRangeRoleV2;
  return `${role} and ${partner} would share ${hex}; assign a second status hue or add a ${HUE_RANGE_LABELS[bandRole]} family.`;
}

function chooseMeaningRoles(
  semanticOptions: readonly ApprovedOption[],
  profiles: readonly FamilyProfile[],
  brand: FamilyProfile | null,
  brandHueDegrees: number | null,
  background: Option,
  onForegrounds: readonly Option[],
  mode: string,
  functionalChoices: ReadonlyMap<string, MeaningChoice> = new Map()
): MeaningChoice[] {
  const choices: MeaningChoice[] = [];
  const used = new Set<string>();
  const closedRange = new Map<ColorSystemSemanticMeaningRoleV2, MeaningChoice>();
  const assignedFills = (): ApprovedOption[] =>
    [...closedRange.values()].map(choice => choice.option);
  const derivationOf = (familyId: string): ColorSystemFamilyDerivationV2 =>
    profiles.find(profile => profile.familyId === familyId)?.derivation ?? 'generated';
  const familyInBand = (role: ColorSystemSemanticHueRangeRoleV2): boolean =>
    profiles.some(
      profile =>
        !profile.neutral &&
        colorSystemHueWithinRangeV2(profile.hue, COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2[role])
    );
  const placeFill = (
    role: ColorSystemSemanticHueRangeRoleV2,
    range: ColorSystemHueRangeV2
  ): MeaningChoice => {
    const ranked = rankFamiliesForRange(profiles, range, brand, used);
    const resolution = resolveDistinctFill(
      semanticOptions,
      ranked,
      range,
      background,
      onForegrounds,
      assignedFills()
    );
    if (!resolution) {
      block(
        'SEMANTIC_ROLE_UNSATISFIED',
        `product-semantics/${mode}/${role}`,
        `${mode} has no product-semantics eligible family that closes an exact 3:1 ${role} fill on its background.`
      );
    }
    const option = resolution.pair.foreground as ApprovedOption;
    const hue = measuredHue(option);
    const inRange = colorSystemHueWithinRangeV2(hue, range);
    const choice: MeaningChoice = {
      role,
      familyId: resolution.familyId,
      pair: resolution.pair,
      option,
      basis: inRange ? 'hue-range' : 'nearest-hue',
      meaningSource: inRange ? derivationOf(resolution.familyId) : 'nearest',
      targetHueRange: { ...range },
      category: 'non-text',
      warning: inRange ? null : rangeWarning(role, range, hue),
      sharedFill: null,
      collision: null,
    };
    used.add(choice.familyId);
    closedRange.set(role, choice);
    choices.push(choice);
    return choice;
  };

  // Roles with an in-range family are placed first so they keep their fills; the
  // nearest-hue roles then have to find room around them.
  const order = [
    ...HUE_RANGE_ROLE_ORDER.filter(role => familyInBand(role)),
    ...HUE_RANGE_ROLE_ORDER.filter(role => !familyInBand(role)),
  ];
  for (const role of order) placeFill(role, COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2[role]);

  // destructive: a second red family gives it its own fill; otherwise it shares
  // the error fill exactly, and says so.
  const error = closedRange.get('error')!;
  const redFamilies = profiles.filter(
    profile =>
      !profile.neutral &&
      colorSystemHueWithinRangeV2(profile.hue, COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2.destructive)
  );
  if (redFamilies.length >= 2) {
    placeFill('destructive', COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2.destructive);
  } else {
    const shared: MeaningChoice = { ...error, role: 'destructive', sharedFill: 'error' };
    closedRange.set('destructive', shared);
    choices.push(shared);
  }

  // Record every collision left after resolution, on both roles, naming the hue.
  const outOfRange = (role: ColorSystemSemanticMeaningRoleV2): boolean =>
    closedRange.get(role)?.basis === 'nearest-hue';
  MEANING_FILL_ROLES.forEach((role, position) => {
    MEANING_FILL_ROLES.slice(position + 1).forEach(partner => {
      const left = closedRange.get(role)!;
      const right = closedRange.get(partner)!;
      const declaredShare =
        role === 'error' && partner === 'destructive' && right.sharedFill === 'error';
      if (
        declaredShare ||
        fillDeltaEOK(left.option, right.option) >=
          COLOR_SYSTEM_APPLICATION_MEANING_FILL_MINIMUM_DELTA_E_OK
      ) {
        return;
      }
      left.collision = [
        left.collision,
        collisionWarning(role, partner, left.option.value.hex, outOfRange),
      ]
        .filter((text): text is string => text !== null)
        .join(' ');
      right.collision = [
        right.collision,
        collisionWarning(partner, role, right.option.value.hex, outOfRange),
      ]
        .filter((text): text is string => text !== null)
        .join(' ');
    });
  });
  const information = closedRange.get('information')!;
  const informationRange = COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2.information;
  const brandIsDistinct =
    brand !== null &&
    brandHueDegrees !== null &&
    !colorSystemHueWithinRangeV2(brandHueDegrees, informationRange);
  // p3-B: link, focus and selected never follow a status reserve; when the
  // information fill is a reserve they take the nearest non-reserve family.
  const followFamilies = (preferred: string): string[] => {
    const ranked = rankFamiliesForRange(profiles, informationRange, brand, new Set())
      .map(profile => profile.familyId)
      .filter(familyId => derivationOf(familyId) !== 'reserve');
    return derivationOf(preferred) === 'reserve'
      ? ranked
      : [preferred, ...ranked.filter(familyId => familyId !== preferred)];
  };

  // link: the information family, unless the brand Primary sits in a distinct hue.
  const linkFamilies = followFamilies(
    brandIsDistinct && brand ? brand.familyId : information.familyId
  );
  let link: MeaningChoice | null = functionalChoices.get('link') ?? null;
  for (const familyId of link ? [] : linkFamilies) {
    const pair = closeText(semanticOptions, familyId, background);
    if (!pair) continue;
    const option = pair.foreground as ApprovedOption;
    const followsBrand = brandIsDistinct && brand !== null && familyId === brand.familyId;
    const hue = measuredHue(option);
    const inRange = followsBrand || colorSystemHueWithinRangeV2(hue, informationRange);
    link = {
      role: 'link',
      familyId,
      pair,
      option,
      basis: followsBrand ? 'brand-primary-hue' : 'information-family',
      meaningSource: followsBrand ? 'brand' : inRange ? derivationOf(familyId) : 'nearest',
      targetHueRange: followsBrand ? null : { ...informationRange },
      category: 'normal-text',
      warning: inRange
        ? null
        : derivationOf(information.familyId) === 'reserve'
          ? `No brand-derived or generated family in the blue range (${informationRange.minimum}–${informationRange.maximum}°); link uses the nearest hue at ${Math.round(hue)}° because the conventional blue reserve is kept for status only.`
          : rangeWarning('information', informationRange, hue),
      sharedFill: null,
      collision: null,
    };
    break;
  }
  if (!link) {
    block(
      'SEMANTIC_ROLE_UNSATISFIED',
      `product-semantics/${mode}/link`,
      `${mode} has no product-semantics eligible family that closes an exact 4.5:1 link text pair on its background.`
    );
  }
  choices.push(link);

  // focus and selected: the brand family when one exists, otherwise the information family.
  // A focus ring carries no text, so only `selected` must also host an on-foreground.
  const accentFamilies = followFamilies(brand ? brand.familyId : information.familyId);
  for (const role of ['focus', 'selected'] as const) {
    const functional = functionalChoices.get(role);
    if (functional) {
      choices.push(functional);
      continue;
    }
    let choice: MeaningChoice | null = null;
    for (const familyId of accentFamilies) {
      const pair = closeFill(
        semanticOptions,
        familyId,
        background,
        role === 'selected' ? onForegrounds : null
      );
      if (!pair) continue;
      const followsBrand = brand !== null && familyId === brand.familyId;
      choice = {
        role,
        familyId,
        pair,
        option: pair.foreground as ApprovedOption,
        basis: followsBrand ? 'brand-primary-hue' : 'information-family',
        meaningSource: followsBrand ? 'brand' : derivationOf(familyId),
        targetHueRange: null,
        category: 'non-text',
        warning: null,
        sharedFill: null,
        collision: null,
      };
      break;
    }
    if (!choice) {
      block(
        'SEMANTIC_ROLE_UNSATISFIED',
        `product-semantics/${mode}/${role}`,
        `${mode} has no product-semantics eligible family that closes an exact 3:1 ${role} fill on its background.`
      );
    }
    choices.push(choice);
  }
  return choices;
}

// ---------------------------------------------------------------------------
// Product graphics
// ---------------------------------------------------------------------------

function chooseProductGraphics(
  approved: readonly ApprovedOption[],
  mode: string,
  surfaces: readonly Option[],
  brief: ColorSystemBuilderBriefV2,
  requirements?: ColorSystemProductGraphicsRequirementsV1,
  assess?: (context: ColorSystemRenderedPairContextV2) => ColorSystemRenderedPairEvidenceV2
): ProductGraphicsChoice[] {
  const sources = new Map(
    [...brief.sourceReferenceColors, ...brief.preservedColors].map(source => [
      source.stableColorId,
      source,
    ])
  );
  const sourceFit = new Map(
    approved
      .filter(option => option.ref.mode === mode)
      .map(option => {
        const recorded = option.sourceColorIds.flatMap(id => {
          const source = sources.get(id);
          const value = source?.valuesByMode[mode];
          return source && value
            ? [{ section: 'section' in source ? source.section : source.sourceSection, value }]
            : [];
        });
        return [
          option.identity,
          {
            graphicsContext: recorded.some(source => source.section === 'product-graphics'),
            values: recorded.map(source => source.value),
          },
        ] as const;
      })
  );
  const compareSourceFit = (left: ProductGraphicsChoice, right: ProductGraphicsChoice): number => {
    const contextOrder = Number(right.sourceContext) - Number(left.sourceContext);
    if (contextOrder !== 0) return contextOrder;
    if (left.sourceDistance === right.sourceDistance) return 0;
    return (left.sourceDistance ?? Infinity) - (right.sourceDistance ?? Infinity);
  };
  const compareRepresentative = (
    left: ProductGraphicsChoice,
    right: ProductGraphicsChoice
  ): number =>
    compareSourceFit(left, right) ||
    Number(right.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2) -
      Number(left.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2) ||
    right.chroma - left.chroma ||
    compareText(left.option.identity, right.option.identity) ||
    compareText(left.pair.background.identity, right.pair.background.identity);
  const selected: ProductGraphicsChoice[] = [];
  for (const job of COLOR_SYSTEM_PRODUCT_GRAPHICS_JOBS_V2) {
    const context = requirements?.contexts.find(context => context.job === job);
    const fixed = (ref: ColorSystemApplicationColorRefV2): PreservedOption => {
      if (ref.kind !== 'preserved-source-color')
        throw new Error('Graphics fixed paint is not a preserved source.');
      return {
        ref,
        value: brief.preservedColors.find(color => color.stableColorId === ref.stableColorId)!
          .valuesByMode[mode],
        identity: `${ref.stableColorId}\u0000${mode}`,
      };
    };
    const candidates = eligible(approved, mode, PRODUCT_GRAPHICS_JOB_MAP[job]).flatMap(option => {
      let contexts: readonly ColorSystemRenderedPairContextV2[] | undefined;
      let choices: PairChoice[];
      if (context) {
        if (
          !colorSystemProductGraphicsCandidateAllowedV1(
            context,
            option.value,
            ref => fixed(ref).value
          )
        )
          return [];
        contexts = colorSystemProductGraphicsPairContextsV1(context, refOf(option));
        if (
          option.value.alpha === 1 &&
          contexts.some(
            item => item.background.kind === 'approved-family-member' && item.underlay !== null
          )
        )
          return [];
        const evidence = contexts.map(item => assess!(item));
        if (evidence.some(pair => pair.status !== 'pass')) return [];
        const primary = evidence.find(
          pair =>
            pair.context.category === 'non-text' &&
            canonicalJson(pair.context.foreground) === canonicalJson(refOf(option))
        );
        if (!primary || primary.ratio === null) return [];
        choices = [
          {
            foreground: option,
            background: fixed(primary.context.background),
            underlay: primary.context.underlay ? fixed(primary.context.underlay) : null,
            ratio: primary.ratio,
          },
        ];
      } else {
        choices = surfaces.flatMap(surface => {
          const pair = choosePair([option], [surface], 3, 'any');
          return pair ? [pair] : [];
        });
      }
      return choices.map(pair => {
        const surface = pair.background;
        const renderedOption = rendered(option, surface, pair.underlay);
        const source = sourceFit.get(option.identity)!;
        return {
          job,
          pair,
          option,
          renderedRgb: renderedOption.rgb,
          chroma: renderedOption.chroma,
          sourceContext: source.graphicsContext,
          sourceDistance:
            source.values.length === 0
              ? null
              : Math.min(
                  ...source.values.map(value =>
                    colorSystemRgbDeltaEOKV1(
                      renderedOption.rgb,
                      composite(rgb(value), value.alpha, renderBackground(surface, pair.underlay)!)
                    )
                  )
                ),
          ...(contexts ? { pairContexts: contexts } : {}),
        } satisfies ProductGraphicsChoice;
      });
    });
    if (candidates.length === 0) {
      block(
        'MISSING_JOB_ELIGIBILITY',
        job,
        `${mode} cannot close the ${job} job with an eligible exact 3:1 pair.`
      );
    }

    // Contrast gates candidates. Recorded context and distance to the family's
    // source then select its representative, so a chromatic darkened endpoint
    // cannot displace an eligible authored color merely by being more vivid.
    const familyRepresentatives = new Map<string, ProductGraphicsChoice>();
    candidates.forEach(candidateChoice => {
      const familyId = candidateChoice.option.ref.familyId;
      const current = familyRepresentatives.get(familyId);
      if (!current || compareRepresentative(candidateChoice, current) < 0) {
        familyRepresentatives.set(familyId, candidateChoice);
      }
    });

    const usedFamilies = new Set(selected.map(choice => choice.option.ref.familyId));
    const usedMembers = new Set(selected.map(choice => choice.option.identity));
    const choice = [...familyRepresentatives.values()].sort((left, right) => {
      const sourceOrder = compareSourceFit(left, right);
      if (sourceOrder !== 0) return sourceOrder;
      const leftNewFamily = usedFamilies.has(left.option.ref.familyId) ? 0 : 1;
      const rightNewFamily = usedFamilies.has(right.option.ref.familyId) ? 0 : 1;
      if (leftNewFamily !== rightNewFamily) return rightNewFamily - leftNewFamily;

      const leftNewMember = usedMembers.has(left.option.identity) ? 0 : 1;
      const rightNewMember = usedMembers.has(right.option.identity) ? 0 : 1;
      if (leftNewMember !== rightNewMember) return rightNewMember - leftNewMember;

      const leftChromatic = left.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2 ? 1 : 0;
      const rightChromatic = right.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2 ? 1 : 0;
      if (leftChromatic !== rightChromatic) return rightChromatic - leftChromatic;

      const leftSeparation =
        selected.length === 0
          ? 0
          : Math.min(
              ...selected.map(previous =>
                minimumModeledDelta(left.renderedRgb, previous.renderedRgb)
              )
            );
      const rightSeparation =
        selected.length === 0
          ? 0
          : Math.min(
              ...selected.map(previous =>
                minimumModeledDelta(right.renderedRgb, previous.renderedRgb)
              )
            );
      if (leftSeparation !== rightSeparation) return rightSeparation - leftSeparation;

      const leftProminence = PRODUCT_GRAPHICS_PROMINENCE_PREFERENCE[job][left.option.prominence];
      const rightProminence = PRODUCT_GRAPHICS_PROMINENCE_PREFERENCE[job][right.option.prominence];
      if (leftProminence !== rightProminence) return rightProminence - leftProminence;
      return (
        right.chroma - left.chroma ||
        compareText(left.option.identity, right.option.identity) ||
        compareText(left.pair.background.identity, right.pair.background.identity)
      );
    })[0];
    selected.push(choice);
  }
  return selected;
}

// ---------------------------------------------------------------------------
// Categorical: hue-first among similar-lightness candidates, then the CVD gate
// ---------------------------------------------------------------------------

interface CategoricalResult {
  surface: Option;
  marks: RenderedOption[];
  minimumHueSeparation: number;
  minimumModeledSeparation: number;
  meanChroma: number;
  strategy: 'hue-first' | 'separation-greedy';
}

/** Members of a family considered for one lightness target: the nearest few, so two close hues can still part by lightness. */
const CATEGORICAL_MEMBERS_PER_FAMILY = 3;

function betterCategorical(left: CategoricalResult, right: CategoricalResult): boolean {
  return (
    (left.minimumHueSeparation - right.minimumHueSeparation ||
      left.minimumModeledSeparation - right.minimumModeledSeparation ||
      left.meanChroma - right.meanChroma ||
      -compareText(identityKey(left.marks), identityKey(right.marks))) > 0
  );
}

function orderByHue(marks: readonly RenderedOption[]): RenderedOption[] {
  return [...marks].sort(
    (left, right) =>
      left.hue - right.hue || compareText(left.option.identity, right.option.identity)
  );
}

function categoricalCandidates(
  options: readonly ApprovedOption[],
  surface: Option
): RenderedOption[] {
  return options
    .map(option => rendered(option, surface))
    .filter(
      item =>
        meetsColorSystemApplicationComposerThresholdV2(
          getWCAGContrast(item.rgb, rgb(surface.value)),
          3
        ) && item.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2
    )
    .sort((left, right) => compareText(left.option.identity, right.option.identity));
}

function modeledDeltaCache(candidates: readonly RenderedOption[]) {
  const index = new Map(candidates.map((item, position) => [item.option.identity, position]));
  const cache: (number | undefined)[][] = candidates.map(() => []);
  return (left: RenderedOption, right: RenderedOption): number => {
    const first = index.get(left.option.identity)!;
    const second = index.get(right.option.identity)!;
    const [low, high] = first < second ? [first, second] : [second, first];
    const cached = cache[low][high];
    if (cached !== undefined) return cached;
    const value = minimumModeledDelta(candidates[low].rgb, candidates[high].rgb);
    cache[low][high] = value;
    return value;
  };
}

function summarizeCategorical(
  surface: Option,
  chosen: readonly RenderedOption[],
  modeledDelta: (left: RenderedOption, right: RenderedOption) => number,
  strategy: CategoricalResult['strategy']
): CategoricalResult {
  let minimumHue = Number.POSITIVE_INFINITY;
  let minimumModeled = Number.POSITIVE_INFINITY;
  chosen.forEach((item, position) => {
    chosen.slice(position + 1).forEach(other => {
      minimumHue = Math.min(minimumHue, colorSystemHueDistanceV2(item.hue, other.hue));
      minimumModeled = Math.min(minimumModeled, modeledDelta(item, other));
    });
  });
  return {
    surface,
    marks: orderByHue(chosen),
    minimumHueSeparation: minimumHue,
    minimumModeledSeparation: minimumModeled,
    meanChroma: chosen.reduce((sum, item) => sum + item.chroma, 0) / chosen.length,
    strategy,
  };
}

/**
 * Choose one member from each of `count` families so the minimum pairwise OKLCH
 * hue separation is as large as possible, subject to the fixed modeled-CVD Delta E
 * OK gate on every pair. `perFamily` lists each family's admissible members.
 */
function bestHueSeparatedSet(
  perFamily: readonly (readonly RenderedOption[])[],
  surface: Option,
  count: number,
  modeledDelta: (left: RenderedOption, right: RenderedOption) => number,
  best: CategoricalResult | null
): CategoricalResult | null {
  let current = best;
  const chosen: RenderedOption[] = [];
  const visit = (familyPosition: number, minimumHue: number): void => {
    if (chosen.length === count) {
      const result = summarizeCategorical(surface, chosen, modeledDelta, 'hue-first');
      if (!current || betterCategorical(result, current)) current = result;
      return;
    }
    if (perFamily.length - familyPosition < count - chosen.length) return;
    // Option A: skip this family entirely.
    visit(familyPosition + 1, minimumHue);
    // Option B: take one of its admissible members.
    for (const item of perFamily[familyPosition]) {
      let nextHue = minimumHue;
      let admissible = true;
      for (const previous of chosen) {
        if (modeledDelta(item, previous) < COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK) {
          admissible = false;
          break;
        }
        nextHue = Math.min(nextHue, colorSystemHueDistanceV2(item.hue, previous.hue));
      }
      // Branch and bound: a partial set can only lose hue separation as it grows.
      if (!admissible || (current && nextHue < current.minimumHueSeparation)) continue;
      chosen.push(item);
      visit(familyPosition + 1, nextHue);
      chosen.pop();
    }
  };
  visit(0, Number.POSITIVE_INFINITY);
  return current;
}

/**
 * Hue-first pass: for each lightness target, every family offers its few nearest
 * members inside the tolerance band, and the subset of `count` families that
 * maximises the minimum pairwise OKLCH hue separation wins.
 */
function chooseCategoricalHueFirst(
  candidates: readonly RenderedOption[],
  surface: Option,
  count: number,
  modeledDelta: (left: RenderedOption, right: RenderedOption) => number
): CategoricalResult | null {
  const families = [
    ...new Set(candidates.map(item => familyIdOf(item.option) ?? item.option.identity)),
  ].sort(compareText);
  if (families.length < count) return null;
  const targets = [...new Set(candidates.map(item => Math.round(item.lightness * 50) / 50))].sort(
    (left, right) => left - right
  );
  let best: CategoricalResult | null = null;
  for (const target of targets) {
    const perFamily = families
      .map(familyId =>
        candidates
          .filter(
            item =>
              familyIdOf(item.option) === familyId &&
              Math.abs(item.lightness - target) <=
                COLOR_SYSTEM_APPLICATION_CATEGORICAL_LIGHTNESS_TOLERANCE_V2
          )
          .sort(
            (left, right) =>
              Math.abs(left.lightness - target) - Math.abs(right.lightness - target) ||
              right.chroma - left.chroma ||
              compareText(left.option.identity, right.option.identity)
          )
          .slice(0, CATEGORICAL_MEMBERS_PER_FAMILY)
      )
      .filter(members => members.length > 0);
    if (perFamily.length < count) continue;
    best = bestHueSeparatedSet(perFamily, surface, count, modeledDelta, best);
  }
  return best;
}

/**
 * Second hue-first pass without the lightness band: each family offers its most
 * chromatic passing members, so two close hues can part by lightness while the
 * set still maximises hue separation.
 */
function chooseCategoricalHueAnyLightness(
  candidates: readonly RenderedOption[],
  surface: Option,
  count: number,
  modeledDelta: (left: RenderedOption, right: RenderedOption) => number
): CategoricalResult | null {
  const families = [
    ...new Set(candidates.map(item => familyIdOf(item.option) ?? item.option.identity)),
  ].sort(compareText);
  if (families.length < count) return null;
  const membersPerFamily = families.length > 8 ? 2 : CATEGORICAL_MEMBERS_PER_FAMILY;
  const perFamily = families.map(familyId =>
    candidates
      .filter(item => familyIdOf(item.option) === familyId)
      .sort(
        (left, right) =>
          right.chroma - left.chroma || compareText(left.option.identity, right.option.identity)
      )
      .slice(0, membersPerFamily)
  );
  return bestHueSeparatedSet(perFamily, surface, count, modeledDelta, null);
}

/**
 * Second pass when no similar-lightness set clears the CVD gate: seed on each
 * candidate and grow by the largest minimum modeled separation, one member per
 * family. Marks are still ordered by hue afterwards.
 */
function chooseCategoricalGreedy(
  candidates: readonly RenderedOption[],
  surface: Option,
  count: number,
  modeledDelta: (left: RenderedOption, right: RenderedOption) => number
): CategoricalResult | null {
  let best: CategoricalResult | null = null;
  for (const seed of candidates) {
    const chosen = [seed];
    while (chosen.length < count) {
      const chosenFamilies = new Set(chosen.map(item => familyIdOf(item.option)));
      const next = candidates
        .filter(item => !chosenFamilies.has(familyIdOf(item.option)))
        .map(item => ({
          item,
          separation: Math.min(...chosen.map(selected => modeledDelta(item, selected))),
        }))
        .filter(entry => entry.separation >= COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK)
        .sort(
          (left, right) =>
            right.separation - left.separation ||
            right.item.chroma - left.item.chroma ||
            compareText(left.item.option.identity, right.item.option.identity)
        )[0];
      if (!next) break;
      chosen.push(next.item);
    }
    if (chosen.length !== count) continue;
    const result = summarizeCategorical(surface, chosen, modeledDelta, 'separation-greedy');
    if (
      !best ||
      (result.minimumModeledSeparation - best.minimumModeledSeparation ||
        result.minimumHueSeparation - best.minimumHueSeparation ||
        result.meanChroma - best.meanChroma ||
        -compareText(identityKey(result.marks), identityKey(best.marks))) > 0
    ) {
      best = result;
    }
  }
  return best;
}

function chooseCategorical(
  options: readonly ApprovedOption[],
  surfaces: readonly Option[],
  count: number
): CategoricalResult | null {
  const opaqueSurfaces = surfaces.filter(isOpaque);
  for (const strategy of [
    chooseCategoricalHueFirst,
    chooseCategoricalHueAnyLightness,
    chooseCategoricalGreedy,
  ]) {
    let best: CategoricalResult | null = null;
    for (const surface of opaqueSurfaces) {
      const candidates = categoricalCandidates(options, surface);
      const result = strategy(candidates, surface, count, modeledDeltaCache(candidates));
      if (result && (!best || betterCategorical(result, best))) best = result;
    }
    if (best) return best;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sequential: even adjacent steps (minimum coefficient of variation)
// ---------------------------------------------------------------------------

interface RampPath {
  marks: RenderedOption[];
  coefficientOfVariation: number;
  span: number;
}

function adjacentDeltas(marks: readonly RenderedOption[]): number[] {
  return marks
    .slice(0, -1)
    .map((mark, position) => delta(mark.rgb, marks[position + 1].rgb, 'normal'));
}

function betterRamp(left: RampPath, right: RampPath): boolean {
  return (
    (right.coefficientOfVariation - left.coefficientOfVariation ||
      left.span - right.span ||
      -compareText(identityKey(left.marks), identityKey(right.marks))) > 0
  );
}

function bestUniformPath(
  options: readonly RenderedOption[],
  count: number,
  surface: Option,
  mustInclude: RenderedOption | null = null
): RampPath | null {
  const surfaceRgb = rgb(surface.value);
  const candidates = [...options]
    .filter(
      mark =>
        delta(mark.rgb, surfaceRgb, 'normal') >=
        COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK
    )
    .sort(
      (left, right) =>
        right.lightness - left.lightness ||
        right.luminance - left.luminance ||
        compareText(left.option.identity, right.option.identity)
    );
  let best: RampPath | null = null;
  const path: RenderedOption[] = [];
  const visit = (start: number): void => {
    if (path.length === count) {
      // p4-B: a ramp anchored on a recorded color must pass through it.
      if (mustInclude && !path.some(mark => mark.option.identity === mustInclude.option.identity)) {
        return;
      }
      const candidate: RampPath = {
        marks: [...path],
        coefficientOfVariation: colorSystemCoefficientOfVariationV2(adjacentDeltas(path)),
        span: path[0].lightness - path[path.length - 1].lightness,
      };
      if (!best || betterRamp(candidate, best)) best = candidate;
      return;
    }
    for (
      let position = start;
      position <= candidates.length - (count - path.length);
      position += 1
    ) {
      const mark = candidates[position];
      const previous = path[path.length - 1];
      if (
        previous &&
        (previous.lightness <= mark.lightness ||
          previous.luminance <= mark.luminance ||
          delta(previous.rgb, mark.rgb, 'normal') <
            COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK)
      ) {
        continue;
      }
      path.push(mark);
      visit(position + 1);
      path.pop();
    }
  };
  visit(0);
  return best;
}

function chooseSequential(
  options: readonly RenderedOption[],
  count: number,
  allowCrossFamilyFallback: boolean,
  surface: Option
): RenderedOption[] | null {
  const byFamily = new Map<string, RenderedOption[]>();
  options.forEach(option => {
    const familyId = familyIdOf(option.option) ?? option.option.identity;
    const family = byFamily.get(familyId) ?? [];
    family.push(option);
    byFamily.set(familyId, family);
  });
  const familyPaths = [...byFamily.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, family]) => bestUniformPath(family, count, surface))
    .filter((path): path is RampPath => path !== null)
    .sort((left, right) => (betterRamp(left, right) ? -1 : 1));
  if (familyPaths[0]) return familyPaths[0].marks;
  if (!allowCrossFamilyFallback) return null;
  return bestUniformPath(options, count, surface)?.marks ?? null;
}

/**
 * p4-B: the most even ramp within one family that passes through `anchor` — the
 * recorded chart color itself (its exact member, or the preserved color when no
 * member carries it). Null when no monotonic path of `count` marks contains it.
 */
function chooseSequentialAnchored(
  familyOptions: readonly RenderedOption[],
  anchor: RenderedOption,
  count: number,
  surface: Option
): RenderedOption[] | null {
  const pool = [
    ...familyOptions.filter(option => option.option.identity !== anchor.option.identity),
    anchor,
  ];
  return bestUniformPath(pool, count, surface, anchor)?.marks ?? null;
}

// ---------------------------------------------------------------------------
// Diverging: visible midpoint, two uniform arms
// ---------------------------------------------------------------------------

interface ArmPath {
  /** Ordered from the mark nearest the midpoint outward. */
  marks: RenderedOption[];
  coefficientOfVariation: number;
  span: number;
  endChroma: number;
}

function armPaths(
  options: readonly RenderedOption[],
  count: number,
  midpoint: RenderedOption,
  polarity: Polarity,
  endpoint: RenderedOption | null = null
): ArmPath[] {
  // p4-B: a recorded endpoint is fixed as the outermost mark; the family supplies the
  // steps between the midpoint and it, and every step, the endpoint included, must
  // still move away from the midpoint and clear the adjacent floor.
  const innerCount = endpoint ? count - 1 : count;
  const candidates = [...options]
    .filter(option => !endpoint || option.option.identity !== endpoint.option.identity)
    .sort(
      (left, right) =>
        (polarity === 'light'
          ? right.lightness - left.lightness || right.luminance - left.luminance
          : left.lightness - right.lightness || left.luminance - right.luminance) ||
        compareText(left.option.identity, right.option.identity)
    );
  const paths: ArmPath[] = [];
  const path: RenderedOption[] = [];
  const movesAway = (previous: RenderedOption, next: RenderedOption): boolean =>
    polarity === 'light'
      ? next.lightness < previous.lightness && next.luminance < previous.luminance
      : next.lightness > previous.lightness && next.luminance > previous.luminance;
  const visit = (start: number): void => {
    if (path.length === innerCount) {
      if (endpoint) {
        const previous = path[path.length - 1] ?? midpoint;
        if (
          !movesAway(previous, endpoint) ||
          delta(previous.rgb, endpoint.rgb, 'normal') <
            COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK
        ) {
          return;
        }
      }
      const arm = endpoint ? [...path, endpoint] : [...path];
      const steps = adjacentDeltas([midpoint, ...arm]);
      paths.push({
        marks: arm,
        coefficientOfVariation: colorSystemCoefficientOfVariationV2(steps),
        span: Math.abs(midpoint.lightness - arm[arm.length - 1].lightness),
        endChroma: arm[arm.length - 1].chroma,
      });
      return;
    }
    for (
      let position = start;
      position <= candidates.length - (innerCount - path.length);
      position += 1
    ) {
      const mark = candidates[position];
      const previous = path[path.length - 1] ?? midpoint;
      if (
        !movesAway(previous, mark) ||
        delta(previous.rgb, mark.rgb, 'normal') <
          COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK
      ) {
        continue;
      }
      path.push(mark);
      visit(position + 1);
      path.pop();
    }
  };
  visit(0);
  return paths
    .sort(
      (left, right) =>
        left.coefficientOfVariation - right.coefficientOfVariation ||
        right.endChroma - left.endChroma ||
        right.span - left.span ||
        compareText(identityKey(left.marks), identityKey(right.marks))
    )
    .slice(0, 3);
}

/** p4-B: the recorded colors a diverging system must end on, when the brand recorded them. */
interface DivergingEndpoints {
  negative: RenderedOption | null;
  positive: RenderedOption | null;
}

function chooseDiverging(
  options: readonly RenderedOption[],
  count: number,
  isNegative: (option: Option) => boolean,
  isPositive: (option: Option) => boolean,
  midpointPolarity: Polarity,
  surface: Option,
  endpoints: DivergingEndpoints = { negative: null, positive: null }
): RenderedOption[] | null {
  const half = (count - 1) / 2;
  const surfaceRgb = rgb(surface.value);
  const negative = options.filter(
    option =>
      isNegative(option.option) && option.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2
  );
  const positive = options.filter(
    option =>
      isPositive(option.option) && option.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2
  );
  const midpoints = options
    .filter(option => !isNegative(option.option) && !isPositive(option.option))
    .filter(
      option =>
        delta(option.rgb, surfaceRgb, 'normal') >=
        COLOR_SYSTEM_APPLICATION_DIVERGING_MINIMUM_MIDPOINT_SURFACE_DELTA_E_OK
    )
    .sort((left, right) => compareText(left.option.identity, right.option.identity));
  let best: {
    marks: RenderedOption[];
    variation: number;
    imbalance: number;
    span: number;
    endChroma: number;
  } | null = null;
  for (const midpoint of midpoints) {
    for (const negativeArm of armPaths(
      negative,
      half,
      midpoint,
      midpointPolarity,
      endpoints.negative
    )) {
      for (const positiveArm of armPaths(
        positive,
        half,
        midpoint,
        midpointPolarity,
        endpoints.positive
      )) {
        const marks = [...[...negativeArm.marks].reverse(), midpoint, ...positiveArm.marks];
        if (
          minimumModeledDelta(marks[0].rgb, marks[marks.length - 1].rgb) <
          COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK
        ) {
          continue;
        }
        const candidate = {
          marks,
          variation: negativeArm.coefficientOfVariation + positiveArm.coefficientOfVariation,
          imbalance: Math.abs(negativeArm.span - positiveArm.span),
          span: negativeArm.span + positiveArm.span,
          endChroma: negativeArm.endChroma + positiveArm.endChroma,
        };
        if (
          !best ||
          (best.variation - candidate.variation ||
            best.imbalance - candidate.imbalance ||
            candidate.endChroma - best.endChroma ||
            candidate.span - best.span ||
            -compareText(identityKey(candidate.marks), identityKey(best.marks))) > 0
        ) {
          best = candidate;
        }
      }
    }
  }
  return best?.marks ?? null;
}

// ---------------------------------------------------------------------------
// Recorded chart order (p3-I)
// ---------------------------------------------------------------------------

interface RecordedChartColor {
  stableColorId: string;
  displayName: string;
  /** 1-based position in the recorded order after sorting. */
  position: number;
  orderClaim: number | null;
  /** Upper-cased hex per mode. */
  hexByMode: Readonly<Record<string, string>>;
  polarity: PaletteDivergingClaimV3 | null;
  /** p4-B: the brief's preserved entry, when the color rides the brief as one (null for an evidence-only reference). */
  preserved: ColorSystemPreservedColorV2 | null;
}

/**
 * The brand's recorded chart set: every data-visualization color the brief
 * carries (preserved or evidence-only), in the order its names record (`01`,
 * `02` …) and otherwise in file order. Empty when the brief records none.
 */
function recordedChartColors(brief: ColorSystemBuilderBriefV2): RecordedChartColor[] {
  const entries = [
    ...brief.preservedColors
      .filter(color => color.section === 'data-visualization')
      .map(color => ({
        id: color.stableColorId,
        name: color.displayName,
        fileOrder: color.order,
        values: color.valuesByMode,
        preserved: color as ColorSystemPreservedColorV2 | null,
      })),
    ...brief.sourceReferenceColors
      .filter(color => color.sourceSection === 'data-visualization')
      .map(color => ({
        id: color.stableColorId,
        name: color.displayName,
        fileOrder: color.sourceOrder,
        values: color.valuesByMode,
        preserved: null as ColorSystemPreservedColorV2 | null,
      })),
  ];
  return entries
    .map(entry => ({ entry, orderClaim: paletteOrderClaimV3(entry.name) }))
    .sort(
      (left, right) =>
        (left.orderClaim ?? Number.POSITIVE_INFINITY) -
          (right.orderClaim ?? Number.POSITIVE_INFINITY) ||
        left.entry.fileOrder - right.entry.fileOrder ||
        compareText(left.entry.id, right.entry.id)
    )
    .map(({ entry, orderClaim }, index) => ({
      stableColorId: entry.id,
      displayName: entry.name,
      position: index + 1,
      orderClaim,
      hexByMode: Object.fromEntries(
        Object.entries(entry.values).map(([mode, value]) => [mode, value.hex.toUpperCase()])
      ),
      polarity: paletteDivergingClaimV3(entry.name),
      preserved: entry.preserved,
    }));
}

function recordedHex(color: RecordedChartColor, mode: string): string | null {
  const modes = Object.keys(color.hexByMode).sort(compareText);
  return color.hexByMode[mode] ?? (modes.length > 0 ? color.hexByMode[modes[0]] : null);
}

/**
 * p4-B: the recorded color itself as an opaque option in `mode` — the exact mark
 * for a recorded chart color that no family member reproduces. Null for an
 * evidence-only reference (nothing preserved to point at) or a mode it lacks.
 */
function preservedRecordedOption(color: RecordedChartColor, mode: string): PreservedOption | null {
  const value = color.preserved?.valuesByMode[mode];
  if (!color.preserved || !value || value.alpha !== 1) return null;
  return {
    ref: { kind: 'preserved-source-color', stableColorId: color.stableColorId, mode },
    value,
    identity: `${color.stableColorId}\u0000${mode}`,
  };
}

interface NearestFamily {
  familyId: string;
  displayName: string;
  anchorHex: string;
  deltaEOK: number;
}

/** A family's name without its section prefix or direction suffix: “Primary / Teal — close-harmony” → “Teal”. */
function shortFamilyName(displayName: string): string {
  const head = displayName.split(' — ')[0];
  const parts = head.split(' / ');
  return (parts[parts.length - 1] ?? head).trim() || displayName;
}

/** p4-B: what the composer needs to relate a recorded color to the candidate's families. */
interface RecordedChartContext {
  profiles: readonly FamilyProfile[];
  candidate: ColorSystemStrategyCandidateV2;
}

/**
 * p4-B: the chromatic family whose anchor sits nearest a recorded color, among
 * the families in `allowed` (those with eligible members for the job in hand).
 * Ties break by family id. Null when no such family exists.
 */
function nearestChromaticFamily(
  hex: string,
  context: RecordedChartContext,
  allowed: ReadonlySet<string>
): NearestFamily | null {
  const target = hexToRgb(hex);
  return (
    context.profiles
      .filter(profile => !profile.neutral && allowed.has(profile.familyId))
      .map(profile => ({
        familyId: profile.familyId,
        displayName: shortFamilyName(
          context.candidate.families.find(family => family.stableFamilyId === profile.familyId)
            ?.displayName ?? profile.familyId
        ),
        anchorHex: profile.anchorHex.toUpperCase(),
        deltaEOK: delta(hexToRgb(profile.anchorHex), target, 'normal'),
      }))
      .sort(
        (left, right) =>
          left.deltaEOK - right.deltaEOK || compareText(left.familyId, right.familyId)
      )[0] ?? null
  );
}

/** The eligible opaque member that reproduces a recorded color exactly in `mode`; step 9 first. */
function exactRecordedMember(
  options: readonly ApprovedOption[],
  color: RecordedChartColor,
  mode: string
): ApprovedOption | null {
  const hex = recordedHex(color, mode);
  if (!hex) return null;
  return (
    options
      .filter(
        option =>
          option.ref.mode === mode && isOpaque(option) && option.value.hex.toUpperCase() === hex
      )
      .sort(stepPreference(9))[0] ?? null
  );
}

const CVD_VIEW_LABELS: Readonly<Record<string, string>> = {
  normal: 'typical vision',
  protanopia: 'protanopia',
  deuteranopia: 'deuteranopia',
  tritanopia: 'tritanopia',
};

interface RecordedMark {
  color: RecordedChartColor;
  rendered: RenderedOption;
}

/**
 * The 3:1 and modeled-CVD gates, run on the recorded order and reported rather
 * than enforced: one sentence per failing mark or pair, naming the marks.
 */
function recordedOrderWarnings(recordedMarks: readonly RecordedMark[], surface: Option): string[] {
  const warnings: string[] = [];
  const surfaceRgb = rgb(surface.value);
  const surfaceHex = surface.value.hex.toUpperCase();
  recordedMarks.forEach((mark, index) => {
    const ratio = getWCAGContrast(mark.rendered.rgb, surfaceRgb);
    if (!meetsColorSystemApplicationComposerThresholdV2(ratio, 3)) {
      warnings.push(
        `Mark ${index + 1} (“${mark.color.displayName}” ${mark.rendered.option.value.hex.toUpperCase()}) measures ${ratio.toFixed(2)}:1 on ${surfaceHex}, below the 3:1 non-text floor.`
      );
    }
  });
  recordedMarks.forEach((left, first) => {
    recordedMarks.slice(first + 1).forEach((right, offset) => {
      const second = first + 1 + offset;
      const failing = (['normal', 'protanopia', 'deuteranopia', 'tritanopia'] as const)
        .map(type => ({ type, value: delta(left.rendered.rgb, right.rendered.rgb, type) }))
        .filter(entry => entry.value < COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK);
      if (failing.length === 0) return;
      warnings.push(
        `Marks ${first + 1} and ${second + 1} (“${left.color.displayName}” and “${right.color.displayName}”) fall below the ${COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK} ΔEOK floor under ${failing
          .map(entry => `${CVD_VIEW_LABELS[entry.type]} (${entry.value.toFixed(3)})`)
          .join(' and ')}.`
      );
    });
  });
  return warnings;
}

interface RecordedArm {
  color: RecordedChartColor;
  familyId: string;
  hue: number;
  /** p4-B: the recorded color itself — its exact member, or the preserved color when no member carries it. */
  exact: Option;
  /** p4-B: set when `familyId` is the nearest family rather than the color's own. */
  nearest: NearestFamily | null;
}

/**
 * Diverging arms from the recorded chart set: one family per recorded color
 * that an eligible member reproduces exactly (neutral ramps excluded). The
 * colors whose names claim negative and positive win; otherwise the two most
 * separated recorded hues, the one nearer the red (error) range as negative.
 */
function recordedDivergingArms(
  recorded: readonly RecordedChartColor[],
  options: readonly ApprovedOption[],
  mode: string,
  neutralFamilyIds: ReadonlySet<string>,
  context: RecordedChartContext
): {
  negative: RecordedArm;
  positive: RecordedArm;
  basis: 'polarity-claims' | 'hue-separation';
} | null {
  const arms: RecordedArm[] = [];
  const allowed = new Set(
    options
      .filter(option => !neutralFamilyIds.has(option.ref.familyId))
      .map(option => option.ref.familyId)
  );
  for (const color of recorded) {
    const member = exactRecordedMember(options, color, mode);
    if (member) {
      if (neutralFamilyIds.has(member.ref.familyId)) continue;
      if (arms.some(arm => arm.familyId === member.ref.familyId)) continue;
      arms.push({
        color,
        familyId: member.ref.familyId,
        hue: measuredHue(member),
        exact: member,
        nearest: null,
      });
      continue;
    }
    // p4-B: a recorded color no family carries still defines an arm: it is the arm's
    // exact endpoint and the nearest family supplies the steps toward the midpoint.
    const hex = recordedHex(color, mode);
    const preserved = preservedRecordedOption(color, mode);
    if (!hex || !preserved) continue;
    const nearest = nearestChromaticFamily(hex, context, allowed);
    if (!nearest || arms.some(arm => arm.familyId === nearest.familyId)) continue;
    arms.push({
      color,
      familyId: nearest.familyId,
      hue: measuredHue(preserved),
      exact: preserved,
      nearest,
    });
  }
  if (arms.length < 2) return null;
  const negative = arms.find(arm => arm.color.polarity === 'negative');
  const positive = arms.find(
    arm => arm.color.polarity === 'positive' && arm.familyId !== negative?.familyId
  );
  if (negative && positive) return { negative, positive, basis: 'polarity-claims' };
  let bestDistance = -1;
  let first = arms[0];
  let second = arms[1];
  for (let left = 0; left < arms.length; left += 1) {
    for (let right = left + 1; right < arms.length; right += 1) {
      const distance = colorSystemHueDistanceV2(arms[left].hue, arms[right].hue);
      if (distance > bestDistance) {
        bestDistance = distance;
        first = arms[left];
        second = arms[right];
      }
    }
  }
  const errorCenter = rangeCenter(COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2.error);
  const firstIsNegative =
    colorSystemHueDistanceV2(first.hue, errorCenter) <=
    colorSystemHueDistanceV2(second.hue, errorCenter);
  return {
    negative: firstIsNegative ? first : second,
    positive: firstIsNegative ? second : first,
    basis: 'hue-separation',
  };
}

interface RecordedCategoricalResult {
  surface: Option;
  /** Recorded marks in recorded order, then any generated fill. */
  marks: RenderedOption[];
  recordedCount: number;
  /** p4-B: the recorded color behind each of the first `recordedCount` marks. */
  recordedColors: RecordedChartColor[];
  warnings: string[];
}

/** p4-B: one recorded color placed in one mode, before any surface is chosen. */
interface RecordedPlacement {
  color: RecordedChartColor;
  option: Option;
  /** p4-B: the near-duplicate note for a color reproduced from its own value. */
  note: string | null;
}

/**
 * p4-B: where each recorded color is reproduced in `mode`: its exact approved
 * member when a family carries the value, otherwise the preserved color itself —
 * a recorded chart color is always an exact mark. An evidence-only reference
 * with no member, a repeat of a value already placed, or a color without a
 * value in this mode is skipped with a sentence. Independent of the surface.
 */
function placeRecordedColors(
  options: readonly ApprovedOption[],
  recorded: readonly RecordedChartColor[],
  mode: string,
  context: RecordedChartContext
): { placements: RecordedPlacement[]; skipped: string[] } {
  const placements: RecordedPlacement[] = [];
  const skipped: string[] = [];
  const allowed = new Set(options.map(option => option.ref.familyId));
  for (const color of recorded) {
    const hex = recordedHex(color, mode);
    const member = exactRecordedMember(options, color, mode);
    const option: Option | null = member ?? preservedRecordedOption(color, mode);
    if (!option || !hex) {
      skipped.push(
        `Recorded color ${color.position} (“${color.displayName}” ${hex ?? '—'}) has no approved family member with that exact value in ${mode}; the recorded order continues without it.`
      );
      continue;
    }
    const duplicate = placements.find(
      placed =>
        placed.option.identity === option.identity ||
        placed.option.value.hex.toUpperCase() === option.value.hex.toUpperCase()
    );
    if (duplicate) {
      skipped.push(
        `Recorded color ${color.position} (“${color.displayName}”) repeats ${option.value.hex.toUpperCase()} already placed as mark ${placements.indexOf(duplicate) + 1}; skipped.`
      );
      continue;
    }
    let note: string | null = null;
    if (!member) {
      const nearest = nearestChromaticFamily(hex, context, allowed);
      note = nearest
        ? `Recorded color ${color.position} (“${color.displayName}” ${hex}) is reproduced exactly from your recorded value: it sits ${nearest.deltaEOK.toFixed(3)} ΔEOK from ${nearest.displayName} (${nearest.anchorHex}), so it has no scale of its own.`
        : `Recorded color ${color.position} (“${color.displayName}” ${hex}) is reproduced exactly from your recorded value; no family carries it, so it has no scale of its own.`;
    }
    placements.push({ color, option, note });
  }
  return { placements, skipped };
}

/**
 * Recorded order first: each recorded color exactly (its member, or its preserved
 * value), in the recorded order, on the admitted surface where the most of them
 * pass 3:1 (ties: the larger minimum modeled separation, then the surface
 * order). Generated families fill only beyond the recorded count, each fill
 * keeping the CVD floor from every mark already placed. Nothing recorded is
 * re-ordered or replaced.
 */
function chooseCategoricalRecorded(
  options: readonly ApprovedOption[],
  surfaces: readonly Option[],
  recorded: readonly RecordedChartColor[],
  count: number,
  mode: string,
  context: RecordedChartContext
): RecordedCategoricalResult | null {
  const { placements, skipped } = placeRecordedColors(options, recorded, mode, context);
  const placed = placements.slice(0, count);
  if (placed.length === 0) return null;
  const notes = placed.flatMap(placement => (placement.note ? [placement.note] : []));
  let best: {
    surface: Option;
    recordedMarks: RecordedMark[];
    passing: number;
    separation: number;
  } | null = null;
  for (const surface of surfaces.filter(isOpaque)) {
    const surfaceRgb = rgb(surface.value);
    const recordedMarks: RecordedMark[] = placed.map(placement => ({
      color: placement.color,
      rendered: rendered(placement.option, surface),
    }));
    const passing = recordedMarks.filter(mark =>
      meetsColorSystemApplicationComposerThresholdV2(
        getWCAGContrast(mark.rendered.rgb, surfaceRgb),
        3
      )
    ).length;
    let separation = Number.POSITIVE_INFINITY;
    recordedMarks.forEach((left, index) => {
      recordedMarks.slice(index + 1).forEach(right => {
        separation = Math.min(
          separation,
          minimumModeledDelta(left.rendered.rgb, right.rendered.rgb)
        );
      });
    });
    if (
      !best ||
      passing > best.passing ||
      (passing === best.passing && separation > best.separation)
    ) {
      best = { surface, recordedMarks, passing, separation };
    }
  }
  if (!best) return null;
  const chosen: RecordedCategoricalResult = {
    surface: best.surface,
    marks: best.recordedMarks.map(mark => mark.rendered),
    recordedCount: best.recordedMarks.length,
    recordedColors: best.recordedMarks.map(mark => mark.color),
    warnings: [...skipped, ...notes, ...recordedOrderWarnings(best.recordedMarks, best.surface)],
  };
  // Fill beyond the recorded count from families not yet used, keeping the CVD
  // floor against every placed mark and never repeating a placed value.
  const usedFamilies = new Set(
    chosen.marks.flatMap(mark => {
      const familyId = familyIdOf(mark.option);
      return familyId === null ? [] : [familyId];
    })
  );
  const placedHexes = new Set(chosen.marks.map(mark => mark.option.value.hex.toUpperCase()));
  const candidates = categoricalCandidates(
    options.filter(option => !usedFamilies.has(option.ref.familyId)),
    chosen.surface
  );
  while (chosen.marks.length < count) {
    const placedMarks = chosen.marks;
    const next = candidates
      .filter(item => {
        const familyId = familyIdOf(item.option);
        return (
          familyId !== null &&
          !usedFamilies.has(familyId) &&
          !placedHexes.has(item.option.value.hex.toUpperCase())
        );
      })
      .map(item => ({
        item,
        separation: Math.min(...placedMarks.map(mark => minimumModeledDelta(item.rgb, mark.rgb))),
      }))
      .filter(entry => entry.separation >= COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK)
      .sort(
        (left, right) =>
          right.separation - left.separation ||
          right.item.chroma - left.item.chroma ||
          compareText(left.item.option.identity, right.item.option.identity)
      )[0];
    if (!next) break;
    chosen.marks.push(next.item);
    usedFamilies.add(familyIdOf(next.item.option) ?? next.item.option.identity);
    placedHexes.add(next.item.option.value.hex.toUpperCase());
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Request normalisation
// ---------------------------------------------------------------------------

function requestedCounts(options: ColorSystemApplicationComposerOptionsV2): {
  categorical: number;
  sequential: number;
  diverging: number;
} {
  const categorical =
    options.categoricalMarkCount ??
    COLOR_SYSTEM_APPLICATION_COMPOSER_DEFAULT_MARK_COUNTS_V2.categorical;
  const sequential =
    options.sequentialMarkCount ??
    COLOR_SYSTEM_APPLICATION_COMPOSER_DEFAULT_MARK_COUNTS_V2.sequential;
  const diverging =
    options.divergingMarkCount ??
    COLOR_SYSTEM_APPLICATION_COMPOSER_DEFAULT_MARK_COUNTS_V2.diverging;
  if (
    !Number.isInteger(categorical) ||
    categorical < 2 ||
    categorical > 8 ||
    !Number.isInteger(sequential) ||
    sequential < 3 ||
    sequential > 9 ||
    ![3, 5, 7, 9].includes(diverging)
  ) {
    block(
      'INVALID_COMPOSITION_REQUEST',
      'data-visualization',
      'Requested marks must be categorical 2-8, sequential 3-9, and diverging 3, 5, 7, or 9.'
    );
  }
  return { categorical, sequential, diverging };
}

function modeList(
  approved: readonly ApprovedOption[],
  options: ColorSystemApplicationComposerOptionsV2,
  brief: ColorSystemBuilderBriefV2
): string[] {
  const modes = options.modes
    ? [...options.modes]
    : [...new Set(approved.map(option => option.ref.mode))].filter(mode =>
        brief.preservedColors.every(color => color.valuesByMode[mode] !== undefined)
      );
  const normalized = modes.map(mode => mode.trim()).sort(compareText);
  if (
    normalized.length === 0 ||
    normalized.some(mode => !mode) ||
    new Set(normalized).size !== normalized.length
  ) {
    block(
      'INVALID_COMPOSITION_REQUEST',
      'modes',
      'Application modes must be non-empty and unique.'
    );
  }
  return normalized;
}

function cue(role: ColorSystemProductSemanticRoleNameV2): string | null {
  if (role === 'link') return 'persistent underline';
  if (role === 'disabled') return 'disabled state plus inactive control affordance';
  if (!MEANING_ROLES.has(role)) return null;
  if (role === 'focus') return 'focus ring geometry plus focus state label';
  if (role === 'selected') return 'checkmark plus selected state label';
  return `${role} icon plus direct text label`;
}

function compositionHash(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  options: ColorSystemApplicationComposerOptionsV2,
  blueprint: ColorSystemApplicationSystemBlueprintV2 | null,
  blockers: readonly ColorSystemApplicationComposerBlockerV2[]
): string {
  return deterministicContentHash({
    composerVersion: COLOR_SYSTEM_APPLICATION_COMPOSER_V2_VERSION,
    briefHash: brief.briefHash,
    candidateHash: candidate.candidateHash,
    options,
    applicationBlueprintHash: blueprint?.applicationBlueprintHash ?? null,
    blockers,
  });
}

// ---------------------------------------------------------------------------
// Per-mode composition
// ---------------------------------------------------------------------------

interface InteractionComposition {
  choices: Map<string, MeaningChoice>;
  onSelected: Option | null;
  statePlans: ColorSystemInteractionStatePlanInputV1[];
  pairs: ColorSystemRenderedPairContextV2[];
  singlePairs: Map<string, string[]>;
}

function interactionSurfaces(
  brief: ColorSystemBuilderBriefV2,
  use: ColorSystemInteractionRequirementV1
): PreservedOption[] {
  return use.surfaces.map(ref => {
    const value = brief.preservedColors.find(color => color.stableColorId === ref.stableColorId)
      ?.valuesByMode[ref.mode];
    if (!value || value.alpha !== 1) {
      block(
        'INVALID_COMPOSITION_REQUEST',
        `interaction/${use.mode}/${use.role}`,
        'Interaction surfaces must resolve to opaque preserved colors in the requested mode.'
      );
    }
    return { ref, value, identity: canonicalJson(ref) };
  });
}

/** Complete every declared state/surface pairing before a role can prefer a family. */
function composeInteractions(
  brief: ColorSystemBuilderBriefV2,
  approved: readonly ApprovedOption[],
  profiles: readonly FamilyProfile[],
  brand: FamilyProfile | null,
  neutrals: ModeNeutrals,
  requirements: ColorSystemInteractionRequirementsV1 | undefined,
  mode: string
): InteractionComposition {
  const output: InteractionComposition = {
    choices: new Map(),
    onSelected: null,
    statePlans: [],
    pairs: [],
    singlePairs: new Map(),
  };
  const uses = requirements?.uses.filter(use => use.mode === mode) ?? [];
  if (uses.length === 0) return output;
  const semantic = eligible(approved, mode, 'product-semantics');
  const allowed = semantic.filter(
    option => !option.contributionId.startsWith(COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2)
  );
  const ranked = rankFamiliesForRange(
    profiles,
    COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2.information,
    brand,
    new Set()
  ).filter(profile => profile.derivation !== 'reserve');
  const preference = [
    ...new Set([
      ...(brand ? [brand.familyId] : []),
      ...ranked.map(profile => profile.familyId),
      ...profiles
        .filter(profile => profile.derivation !== 'reserve')
        .map(profile => profile.familyId),
    ]),
  ];
  const choice = (
    role: 'selected' | 'link' | 'focus',
    option: ApprovedOption,
    surface: Option
  ): MeaningChoice => {
    const pair = measuredPair(option, surface);
    if (!pair)
      block(
        'PAIR_THRESHOLD_UNSATISFIED',
        `interaction/${mode}/${role}`,
        'The interaction pair could not be rendered.'
      );
    return {
      role,
      familyId: option.ref.familyId,
      option,
      pair,
      basis: 'functional-fit',
      meaningSource:
        profiles.find(profile => profile.familyId === option.ref.familyId)?.derivation === 'brand'
          ? 'brand'
          : 'generated',
      targetHueRange: null,
      category: role === 'link' ? 'normal-text' : 'non-text',
      warning: null,
      sharedFill: null,
      collision: null,
    };
  };
  for (const role of ['selected', 'link'] as const) {
    const use = uses.find(entry => entry.role === role);
    if (!use) continue;
    const surfaces = interactionSurfaces(brief, use);
    const result = selectColorSystemInteractionStatesV1({
      role,
      mode,
      families: preference.flatMap((familyId, index) => {
        const members = allowed.filter(option => option.ref.familyId === familyId);
        return members.length
          ? [
              {
                familyId,
                contributionId: members[0].contributionId,
                preference: index,
                members: members.map(option => ({
                  ref: option.ref,
                  value: option.value,
                  step: option.order,
                  eligibleJob: 'product-semantics' as const,
                })),
              },
            ]
          : [];
      }),
      surfaces: surfaces.map(surface => ({
        ref: surface.ref as Extract<
          ColorSystemApplicationColorRefV2,
          { kind: 'preserved-source-color' }
        >,
        value: surface.value,
      })),
      onForegrounds: neutrals.onForegroundCandidates.map(option => ({
        ref: refOf(option),
        value: option.value,
      })),
    });
    if (result.status !== 'ready') {
      block(
        'SEMANTIC_ROLE_UNSATISFIED',
        `interaction/${mode}/${role}`,
        `${mode} ${role} has no complete distinct default, hover and pressed set on every required surface (${result.diagnostics.feasibleTriples}/${result.diagnostics.evaluatedTriples} feasible triples).`
      );
    }
    const selected = result.selection;
    const selectedOptions = Object.fromEntries(
      (['rest', 'hover', 'pressed'] as const).map(state => {
        const option = allowed.find(
          item => canonicalJson(item.ref) === canonicalJson(selected.states[state].ref)
        )!;
        return [state, option];
      })
    ) as Record<'rest' | 'hover' | 'pressed', ApprovedOption>;
    output.choices.set(role, choice(role, selectedOptions.rest, surfaces[0]));
    const foreground =
      selected.onForeground === null
        ? null
        : neutrals.onForegroundCandidates.find(
            option => canonicalJson(refOf(option)) === canonicalJson(selected.onForeground!.ref)
          )!;
    if (role === 'selected') output.onSelected = foreground;
    const pairBindings: ColorSystemInteractionStatePlanInputV1['pairs'][number][] = [];
    for (const state of ['rest', 'hover', 'pressed'] as const) {
      surfaces.forEach((surface, index) => {
        const id = `composer:interaction:${mode}:${role}:${state}:${index + 1}`;
        const pair = measuredPair(selectedOptions[state], surface)!;
        output.pairs.push(
          pairContext(
            id,
            mode,
            pair,
            role === 'link' ? 'normal-text' : 'non-text',
            'required',
            `${role} ${state} on required surface ${index + 1}`
          )
        );
        const onId = foreground === null ? null : `${id}:label`;
        if (foreground && onId) {
          const base = {
            foreground,
            background: selectedOptions[state],
            underlay: selectedOptions[state].value.alpha === 1 ? null : surface,
          };
          output.pairs.push(
            pairContext(
              onId,
              mode,
              { ...base, ratio: contrast(base)! },
              'normal-text',
              'required',
              `${role} ${state} common label on required surface ${index + 1}`
            )
          );
        }
        pairBindings.push({
          state,
          surface: surface.ref as Extract<
            ColorSystemApplicationColorRefV2,
            { kind: 'preserved-source-color' }
          >,
          surfacePairEvidenceId: id,
          onForegroundPairEvidenceId: onId,
        });
      });
    }
    output.statePlans.push({
      role,
      mode,
      states: {
        rest: selectedOptions.rest.ref,
        hover: selectedOptions.hover.ref,
        pressed: selectedOptions.pressed.ref,
      },
      onForeground: foreground ? refOf(foreground) : null,
      pairs: pairBindings,
    });
  }
  for (const role of ['text', 'border', 'focus'] as const) {
    const use = uses.find(entry => entry.role === role);
    if (!use) continue;
    const surfaces = interactionSurfaces(brief, use);
    const threshold = role === 'text' ? 4.5 : 3;
    const selectedFamily = output.choices.get('selected')?.familyId;
    const ordered = [...allowed].sort(
      (a, b) =>
        Number(b.ref.familyId === selectedFamily) - Number(a.ref.familyId === selectedFamily) ||
        preference.indexOf(a.ref.familyId) - preference.indexOf(b.ref.familyId) ||
        Math.abs(a.order - 9) - Math.abs(b.order - 9) ||
        compareText(a.identity, b.identity)
    );
    const candidates: Option[] =
      role === 'focus'
        ? ordered
        : [
            neutrals[role],
            ...neutrals.onForegroundCandidates,
            ...ordered.filter(
              option => profiles.find(profile => profile.familyId === option.ref.familyId)?.neutral
            ),
          ];
    const requiredSurfaces =
      role === 'text'
        ? [...surfaces, neutrals.background, neutrals.surface]
        : role === 'border'
          ? [...surfaces, neutrals.background]
          : surfaces;
    const option = candidates.find(candidate =>
      requiredSurfaces.every(surface => {
        const ratio = contrast({ foreground: candidate, background: surface, underlay: null });
        return ratio !== null && ratio >= threshold;
      })
    );
    if (!option)
      block(
        'SEMANTIC_ROLE_UNSATISFIED',
        `interaction/${mode}/${role}`,
        `${mode} ${role} cannot meet ${threshold}:1 on every required surface.`
      );
    if (role === 'focus')
      output.choices.set(role, choice(role, option as ApprovedOption, surfaces[0]));
    else {
      neutrals[role] = option;
      neutrals[role === 'text' ? 'textPair' : 'borderPair'] = measuredPair(
        option,
        neutrals.background
      )!;
      if (role === 'text') neutrals.surfacePair = measuredPair(option, neutrals.surface)!;
      neutrals.groundReasons = {
        ...neutrals.groundReasons,
        [role]: 'measured on every declared interaction surface',
      };
    }
    const ids: string[] = [];
    surfaces.forEach((surface, index) => {
      const id = `composer:interaction:${mode}:${role}:${index + 1}`;
      output.pairs.push(
        pairContext(
          id,
          mode,
          measuredPair(option, surface)!,
          role === 'text' ? 'normal-text' : 'non-text',
          'required',
          `${role} on required surface ${index + 1}`
        )
      );
      ids.push(id);
    });
    output.singlePairs.set(role, ids);
  }
  return output;
}

interface ModeComposition {
  neutrals: ModeNeutrals;
  pairs: ColorSystemRenderedPairContextV2[];
  typography: ColorSystemApplicationSystemBlueprintV2Input['typography'][number][];
  semantics: ColorSystemApplicationSystemBlueprintV2Input['productSemantics'][number][];
  semanticMeaning: ColorSystemSemanticMeaningInputV2[];
  limitations: string[];
  statePlans: ColorSystemInteractionStatePlanInputV1[];
}

function composeMode(
  brief: ColorSystemBuilderBriefV2,
  allApproved: readonly ApprovedOption[],
  profiles: readonly FamilyProfile[],
  brand: FamilyProfile | null,
  brandHueDegrees: number | null,
  mode: string,
  interactionRequirements?: ColorSystemInteractionRequirementsV1
): ModeComposition {
  const neutrals = resolveModeNeutrals(brief, allApproved, profiles, mode);
  const interaction = composeInteractions(
    brief,
    allApproved,
    profiles,
    brand,
    neutrals,
    interactionRequirements,
    mode
  );
  const pairs: ColorSystemRenderedPairContextV2[] = [...interaction.pairs];
  const typography: ModeComposition['typography'] = [];
  const semantics: ModeComposition['semantics'] = [];
  const semanticMeaning: ColorSystemSemanticMeaningInputV2[] = [];
  const limitations: string[] = [];

  const typeChoices = [
    neutrals.typography.normal,
    neutrals.typography.supporting,
    neutrals.typography.heading,
    neutrals.typography.reverse,
  ] as const;
  TYPOGRAPHY_CATEGORIES.forEach((category, index) => {
    const pairId = `composer:type:${mode}:${category}`;
    const pairCategory = category === 'large-heading' ? 'large-text' : 'normal-text';
    pairs.push(
      pairContext(
        pairId,
        mode,
        typeChoices[index],
        pairCategory,
        'required',
        `${category} Typography specimen`
      )
    );
    typography.push({
      specimenId: `composer:${mode}:${category}`,
      useCategory: category,
      mode,
      pairEvidenceId: pairId,
      fontSizePx: category === 'large-heading' ? 24 : 16,
      fontWeight: 400,
      intendedUse: `${category} on its exact ${neutrals.typographySource === 'neutral-ramp' ? 'neutral-ramp' : 'preserved'} ${mode} surface`,
      evidenceIds: [`composer:${mode}:${category}:selection`],
    });
  });

  const pushRole = (
    role: ColorSystemProductSemanticRoleNameV2,
    choice: PairChoice,
    ref: ColorSystemApplicationColorRefV2,
    category: ColorSystemRenderedPairCategoryV2,
    assessment: 'required' | 'inactive-exempt',
    intendedUse: string,
    extraEvidence: readonly string[] = [],
    groundSource?: ColorSystemStructuralGroundSourceV2
  ): void => {
    const pairId = `composer:semantic:${mode}:${role}`;
    pairs.push(pairContext(pairId, mode, choice, category, assessment, `${role} semantic role`));
    semantics.push({
      role,
      mode,
      ref,
      pairEvidenceIds: [pairId, ...(interaction.singlePairs.get(role) ?? [])],
      nonColorCue: cue(role),
      intendedUse,
      evidenceIds: [`composer:${mode}:${role}:selection`, ...extraEvidence],
      ...(groundSource === undefined ? {} : { groundSource }),
    });
  };

  // p3-I: every structural role names the rule that chose it and records its
  // ground source, so the review can say whose grounds these are.
  const structural: readonly {
    role: StructuralRole;
    choice: PairChoice;
    option: Option;
    category: ColorSystemRenderedPairCategoryV2;
    assessment: 'required' | 'inactive-exempt';
    use: string;
  }[] = [
    {
      role: 'background',
      choice: neutrals.textPair,
      option: neutrals.background,
      category: 'normal-text',
      assessment: 'required',
      use: `${mode} page background (${neutrals.polarity} polarity): ${neutrals.groundReasons.background}`,
    },
    {
      role: 'surface',
      choice: neutrals.surfacePair,
      option: neutrals.surface,
      category: 'normal-text',
      assessment: 'required',
      use: `${mode} raised surface: ${neutrals.groundReasons.surface}; text keeps 4.5:1 on it`,
    },
    {
      role: 'text',
      choice: neutrals.textPair,
      option: neutrals.text,
      category: 'normal-text',
      assessment: 'required',
      use: `${mode} high-contrast text on the background: ${neutrals.groundReasons.text}`,
    },
    {
      role: 'border',
      choice: neutrals.borderPair,
      option: neutrals.border,
      category: 'non-text',
      assessment: 'required',
      use: `${mode} border: ${neutrals.groundReasons.border}`,
    },
    {
      role: 'disabled',
      choice: neutrals.disabledPair,
      option: neutrals.disabled,
      category: 'non-text',
      assessment: 'inactive-exempt',
      use: `${mode} disabled control tone: ${neutrals.groundReasons.disabled}; inactive controls are exempt from contrast`,
    },
  ];
  for (const entry of structural) {
    pushRole(
      entry.role,
      entry.choice,
      refOf(entry.option),
      entry.category,
      entry.assessment,
      entry.use,
      [`composer:${mode}:${entry.role}:ground-source:${neutrals.groundSources[entry.role]}`],
      neutrals.groundSources[entry.role]
    );
  }

  const semanticOptions = eligible(allApproved, mode, 'product-semantics');
  const meaning = chooseMeaningRoles(
    semanticOptions,
    profiles,
    brand,
    brandHueDegrees,
    neutrals.background,
    neutrals.onForegroundCandidates,
    mode,
    interaction.choices
  );
  const meaningByRole = new Map(meaning.map(choice => [choice.role, choice]));
  for (const choice of meaning) {
    const hueEvidence = `composer:${mode}:${choice.role}:hue-meaning`;
    pushRole(
      choice.role,
      choice.pair,
      approvedRef(choice.option),
      choice.category,
      'required',
      `${mode} ${choice.role}: ${choice.basis} from ${choice.familyId} step ${choice.option.order}`,
      [hueEvidence]
    );
    const oklch = colorSystemSrgbToOklchV1(choice.option.value);
    const measuredHueDegrees = oklch.c < 1e-6 ? 0 : oklch.h;
    semanticMeaning.push({
      role: choice.role,
      mode,
      targetHueRange: choice.targetHueRange,
      basis: choice.basis,
      meaningSource: choice.meaningSource,
      familyId: choice.familyId,
      memberId: choice.option.ref.memberId,
      measuredHueDegrees,
      measuredChroma: oklch.c,
      inRange:
        choice.targetHueRange === null
          ? true
          : colorSystemHueWithinRangeV2(measuredHueDegrees, choice.targetHueRange),
      warning: choice.warning,
      sharedFill: choice.sharedFill,
      collision: choice.collision,
      evidenceIds: [hueEvidence],
    });
  }

  for (const onRole of ON_ROLES) {
    const parent = meaningByRole.get(COLOR_SYSTEM_PRODUCT_SEMANTIC_ON_ROLE_PARENTS_V2[onRole]);
    if (!parent) continue;
    const stateForeground = onRole === 'on-selected' ? interaction.onSelected : null;
    const statePair = stateForeground
      ? {
          foreground: stateForeground,
          background: parent.option,
          underlay: parent.option.value.alpha === 1 ? null : parent.pair.background,
        }
      : null;
    const pair = statePair
      ? { ...statePair, ratio: contrast(statePair)! }
      : choosePair(neutrals.onForegroundCandidates, [parent.option], 4.5, 'any');
    if (!pair) {
      block(
        'PAIR_THRESHOLD_UNSATISFIED',
        `product-semantics/${mode}/${onRole}`,
        `${mode} has no white, black, or neutral foreground that reaches 4.5:1 on the ${parent.role} fill.`
      );
    }
    pushRole(
      onRole,
      pair,
      refOf(pair.foreground),
      'normal-text',
      'required',
      `${mode} text and icons placed on the ${parent.role} fill; highest rendered contrast among white, black, and neutral ends`
    );
  }

  const warnings = semanticMeaning.filter(item => item.warning !== null);
  if (warnings.length > 0) {
    const ranged = semanticMeaning.filter(item => item.targetHueRange !== null).length;
    limitations.push(
      `${mode}: ${warnings.length} of ${ranged} hue-meaning roles fall outside their range — ${warnings
        .map(item => item.warning)
        .join(' ')}`
    );
  }
  const collisions = semanticMeaning.filter(item => item.collision !== null);
  if (collisions.length > 0) {
    const sentences = [
      ...new Set(collisions.flatMap(item => item.collision!.split(/(?<=\.) /).filter(Boolean))),
    ];
    limitations.push(
      `${mode}: ${collisions.length} meaning roles share a fill — ${sentences.join(' ')}`
    );
  }
  return {
    neutrals,
    pairs,
    typography,
    semantics,
    semanticMeaning,
    limitations,
    statePlans: interaction.statePlans,
  };
}

interface CategoricalComposition {
  context: ColorSystemCategoricalContextV2;
  surface: Option;
  /** Present when fewer marks than requested were achievable; also mirrored into blueprint limitations. */
  limitation: string | null;
  /** p3-I: sentences for the blueprint limitations, such as a recorded order that could not be reproduced in a mode. */
  notes: readonly string[];
}

/** The smallest categorical system Teul will still call a system. */
const MINIMUM_CATEGORICAL_MARKS = 2;

/**
 * Adaptive categorical count: ask for N, accept the largest K (N ≥ K ≥ 2) whose
 * marks all pass 3:1 on the surface and the modeled-CVD separation gate. A
 * shortfall is recorded on the selection and as a blueprint limitation naming the
 * direction and the measured counts; only K < 2 blocks the direction.
 */
function composeCategorical(
  allApproved: readonly ApprovedOption[],
  neutrals: ModeNeutrals,
  surfaces: readonly Option[],
  requestedCount: number,
  adjacency: 'separated' | 'touching',
  pairs: ColorSystemRenderedPairContextV2[],
  selectionId: string,
  directionLabel: string,
  recorded: readonly RecordedChartColor[],
  context: RecordedChartContext
): CategoricalComposition {
  const mode = neutrals.mode;
  const options = eligible(allApproved, mode, 'categorical-data');
  let surface: Option;
  let marks: RenderedOption[];
  let recordedCount = 0;
  let warnings: string[] = [];
  let evidenceIds: string[];
  let labels: string[];
  const notes: string[] = [];
  // p3-I: the brand recorded a chart order; use it, fill beyond it, warn on it. A mode
  // in which no recorded color has an exact approved member falls back to Teul's own
  // selection and says so, rather than blocking the direction.
  const result =
    recorded.length > 0
      ? chooseCategoricalRecorded(options, surfaces, recorded, requestedCount, mode, context)
      : null;
  if (recorded.length > 0 && result === null) {
    notes.push(
      `${mode}: none of your recorded chart colors is reproduced exactly by an approved member in this mode, so the ${mode} categorical selection is generated.`
    );
  }
  if (result) {
    if (result.marks.length < MINIMUM_CATEGORICAL_MARKS) {
      block(
        'CATEGORICAL_SYSTEM_UNDERFILLED',
        `categorical-data/${mode}`,
        `Your recorded chart colors do not reproduce even ${MINIMUM_CATEGORICAL_MARKS} approved members in ${mode}, and no generated fill keeps the advisory separation threshold.`
      );
    }
    surface = result.surface;
    marks = result.marks;
    recordedCount = result.recordedCount;
    warnings = result.warnings;
    evidenceIds = [
      `${selectionId}:measured-selection`,
      COLOR_SYSTEM_APPLICATION_RECORDED_ORDER_EVIDENCE_ID_V2,
    ];
    labels = marks.map((_, index) =>
      index < recordedCount
        ? `Category ${index + 1} (${result.recordedColors[index].displayName})`
        : `Category ${index + 1}`
    );
  } else {
    let categorical: CategoricalResult | null = null;
    for (let count = requestedCount; count >= MINIMUM_CATEGORICAL_MARKS; count -= 1) {
      categorical = chooseCategorical(options, surfaces, count);
      if (categorical) break;
    }
    if (!categorical) {
      block(
        'CATEGORICAL_SYSTEM_UNDERFILLED',
        `categorical-data/${mode}`,
        `No categorical system of even ${MINIMUM_CATEGORICAL_MARKS} marks in ${mode} closes 3:1 surface pairs and the fixed advisory separation threshold.`
      );
    }
    surface = categorical.surface;
    marks = categorical.marks;
    evidenceIds = [
      `${selectionId}:measured-selection`,
      `composer:categorical:${categorical.strategy}`,
      'composer:categorical:hue-ordered-marks',
    ];
    labels = marks.map((_, index) => `Category ${index + 1}`);
  }
  const achievedCount = marks.length;
  const limitation =
    achievedCount < requestedCount
      ? `${directionLabel} supports ${achievedCount} distinguishable categorical series in ${mode}; you asked for ${requestedCount}.`
      : null;
  const boundary =
    adjacency === 'touching'
      ? exactBoundary([...neutrals.preserved, ...neutrals.chartSurfaces], surface)
      : null;
  if (adjacency === 'touching' && !boundary) {
    block(
      'CATEGORICAL_BOUNDARY_UNAVAILABLE',
      `categorical-data/${mode}`,
      'Touching categorical marks require an admitted exact black or white boundary.'
    );
  }
  const chartSurface = surface;
  const markPairEvidenceIds = marks.map((mark, index) => {
    const id = `composer:categorical:${mode}:${index + 1}`;
    if (index < recordedCount) {
      // A recorded mark keeps its place; its pair is measured and reported.
      const choice = measuredPair(mark.option, chartSurface);
      if (!choice) {
        block(
          'PAIR_THRESHOLD_UNSATISFIED',
          `categorical/${mode}/${index + 1}`,
          'A recorded categorical mark could not be measured on its surface.'
        );
      }
      pairs.push(
        pairContext(
          id,
          mode,
          choice,
          'non-text',
          'recorded-advisory',
          `Categorical mark ${index + 1} in your recorded order`
        )
      );
      return id;
    }
    const choice = choosePair([mark.option], [chartSurface], 3, 'any');
    if (!choice) {
      block(
        'PAIR_THRESHOLD_UNSATISFIED',
        `categorical/${mode}/${index + 1}`,
        'A selected categorical mark lost its exact 3:1 pair.'
      );
    }
    pairs.push(
      pairContext(id, mode, choice, 'non-text', 'required', `Categorical mark ${index + 1}`)
    );
    return id;
  });
  return {
    surface,
    limitation,
    context: {
      selectionId,
      marks: marks.map((mark, index) => ({
        order: index + 1,
        label: labels[index],
        ref: refOf(mark.option),
        // p4-B: a recorded mark reproduces a recorded chart color exactly.
        ...(index < recordedCount ? { origin: 'recorded' as const } : {}),
      })),
      surface: refOf(surface),
      evidenceIds,
      adjacency,
      boundary: boundary ? refOf(boundary) : null,
      markPairEvidenceIds,
      directLabels: true,
      nonColorCue: 'shape',
      requestedMarkCount: requestedCount,
      achievedMarkCount: achievedCount,
      limitation,
      orderSource: result ? 'recorded' : 'generated',
      orderWarnings: warnings,
    },
    notes,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function composeColorSystemApplicationBlueprintV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  options: ColorSystemApplicationComposerOptionsV2 = {}
): ColorSystemApplicationComposerResultV2 {
  assertColorSystemBuilderBriefV2Integrity(brief);
  assertColorSystemStrategyCandidateV2Integrity(brief, candidate);
  try {
    if (candidate.status !== 'complete') {
      block(
        'INVALID_COMPOSITION_REQUEST',
        'candidate',
        'Application composition requires a complete candidate.'
      );
    }
    const allApproved = approvedOptions(candidate);
    const modes = modeList(allApproved, options, brief);
    const applicationMode = (
      options.applicationMode ?? (modes.includes('Light') ? 'Light' : modes[0])
    ).trim();
    if (!modes.includes(applicationMode)) {
      block(
        'MODE_NOT_AVAILABLE',
        applicationMode,
        'The requested application mode is not in the composed mode set.'
      );
    }
    if (
      options.surfaceContext !== undefined &&
      !['light', 'dark'].includes(options.surfaceContext)
    ) {
      block(
        'INVALID_COMPOSITION_REQUEST',
        'surfaceContext',
        'Surface context must be light or dark.'
      );
    }
    if (
      options.categoricalAdjacency !== undefined &&
      !['separated', 'touching'].includes(options.categoricalAdjacency)
    ) {
      block(
        'INVALID_COMPOSITION_REQUEST',
        'categoricalAdjacency',
        'Categorical adjacency must be separated or touching.'
      );
    }
    if (
      options.divergingMidpointMeaning !== undefined &&
      (typeof options.divergingMidpointMeaning !== 'string' ||
        !options.divergingMidpointMeaning.trim() ||
        options.divergingMidpointMeaning.trim().length > 160)
    ) {
      block(
        'INVALID_COMPOSITION_REQUEST',
        'divergingMidpointMeaning',
        'Diverging midpoint meaning must be 1 through 160 visible characters.'
      );
    }
    const surfaceContext =
      options.surfaceContext ?? colorSystemApplicationModePolarityV2(applicationMode);
    const categoricalAdjacency = options.categoricalAdjacency ?? 'separated';
    const divergingMidpointMeaning =
      options.divergingMidpointMeaning?.trim() ?? 'Zero or neutral midpoint';
    const midpointPolarity: Polarity = surfaceContext === 'light' ? 'light' : 'dark';
    const counts = requestedCounts(options);
    const interactionRequirements =
      options.interactionRequirements === undefined
        ? undefined
        : normalizeColorSystemInteractionRequirementsV1(options.interactionRequirements, modes);
    const productGraphicsRequirements =
      options.productGraphicsRequirements === undefined
        ? undefined
        : normalizeColorSystemProductGraphicsRequirementsV1(
            options.productGraphicsRequirements,
            brief,
            applicationMode
          );
    const { profiles, brand, brandHueDegrees } = readFamilies(brief, candidate);
    // p3-I: the brand's recorded chart set, in its recorded order (empty when none).
    const recorded = recordedChartColors(brief);

    const pairs: ColorSystemRenderedPairContextV2[] = [];
    const typography: ColorSystemApplicationSystemBlueprintV2Input['typography'][number][] = [];
    const semantics: ColorSystemApplicationSystemBlueprintV2Input['productSemantics'][number][] =
      [];
    const semanticMeaning: ColorSystemSemanticMeaningInputV2[] = [];
    const statePlans: ColorSystemInteractionStatePlanInputV1[] = [];
    const limitations: string[] = [
      'Composer selections are deterministic measured choices from exact reviewed member and mode eligibility; they are not owner acceptance.',
    ];
    const neutralsByMode = new Map<string, ModeNeutrals>();
    for (const mode of modes) {
      const composed = composeMode(
        brief,
        allApproved,
        profiles,
        brand,
        brandHueDegrees,
        mode,
        interactionRequirements
      );
      neutralsByMode.set(mode, composed.neutrals);
      pairs.push(...composed.pairs);
      typography.push(...composed.typography);
      semantics.push(...composed.semantics);
      semanticMeaning.push(...composed.semanticMeaning);
      limitations.push(...composed.limitations);
      statePlans.push(...composed.statePlans);
    }

    const applicationNeutrals = neutralsByMode.get(applicationMode)!;
    const graphicsSurfaces = surfaceCandidates(
      applicationNeutrals.graphicsSurfaces,
      surfaceContext
    );
    const chartSurfaces = surfaceCandidates(applicationNeutrals.chartSurfaces, surfaceContext);
    if (
      (!productGraphicsRequirements && graphicsSurfaces.length === 0) ||
      chartSurfaces.length === 0
    ) {
      block(
        'SURFACE_CONTEXT_UNAVAILABLE',
        `data-visualization/${applicationMode}/${surfaceContext}`,
        `${applicationMode} has no admitted opaque preserved ${surfaceContext} surface.`
      );
    }
    const productGraphicsChoices = chooseProductGraphics(
      allApproved,
      applicationMode,
      graphicsSurfaces,
      brief,
      productGraphicsRequirements,
      productGraphicsRequirements
        ? createColorSystemRenderedPairAssessorV2(brief, candidate, modes)
        : undefined
    );
    const productGraphics = productGraphicsChoices.map((selection, index) => {
      const { job, pair: choice, option } = selection;
      const pairId = `composer:product-graphics:${job}`;
      const selectedPairs = selection.pairContexts ?? [
        pairContext(pairId, applicationMode, choice, 'non-text', 'required', `${job} specimen`),
      ];
      pairs.push(...selectedPairs);
      return {
        derivationId: `composer:${job}`,
        job,
        order: index + 1,
        mode: applicationMode,
        intendedUse: `${job} specimen using reviewed Secondary eligibility`,
        excludedUses: ['Color-only meaning', 'Unreviewed literal or fallback colors'],
        assessment: 'informative' as const,
        pairEvidenceIds: selectedPairs.map(pair => pair.id),
        nonColorCue: 'direct label plus distinct icon or geometry',
        evidenceIds: [
          ...new Set([
            `composer:${job}:selection`,
            COLOR_SYSTEM_APPLICATION_PRODUCT_GRAPHICS_POLICY_VERSION,
            ...option.eligibilityEvidenceIds,
            ...option.brandFitEvidenceIds,
          ]),
        ].sort(compareText),
        sourceRefs: [option.ref],
        transform: { kind: 'identity' as const },
      };
    });

    const categorical = composeCategorical(
      allApproved,
      applicationNeutrals,
      chartSurfaces,
      counts.categorical,
      categoricalAdjacency,
      pairs,
      'composer:categorical',
      candidate.label,
      recorded,
      { profiles, candidate }
    );
    if (categorical.limitation) limitations.push(categorical.limitation);
    limitations.push(...categorical.notes);
    const additionalCategorical = modes
      .filter(mode => mode !== applicationMode)
      .map(mode => {
        const neutrals = neutralsByMode.get(mode)!;
        const surfaces = surfaceCandidates(neutrals.chartSurfaces, neutrals.polarity);
        if (surfaces.length === 0) {
          block(
            'SURFACE_CONTEXT_UNAVAILABLE',
            `data-visualization/${mode}/${neutrals.polarity}`,
            `${mode} has no admitted opaque preserved ${neutrals.polarity} surface for its categorical system.`
          );
        }
        const composed = composeCategorical(
          allApproved,
          neutrals,
          surfaces,
          counts.categorical,
          categoricalAdjacency,
          pairs,
          `composer:categorical:${mode}`,
          candidate.label,
          recorded,
          { profiles, candidate }
        );
        if (composed.limitation) limitations.push(composed.limitation);
        limitations.push(...composed.notes);
        return composed.context;
      });

    const keepsCharts =
      brief.sections.find(section => section.role === 'data-visualization')?.disposition ===
      'preserve';
    // Measured neutral families never form a chart ramp or arm: a gray ramp would
    // trivially win the evenness objective. They may still serve as a diverging
    // midpoint, where a neutral zero is the conventional choice.
    const neutralFamilyIds = new Set(
      profiles.filter(profile => profile.neutral).map(profile => profile.familyId)
    );
    const chartSurface = categorical.surface;
    const sequential =
      ((): ColorSystemApplicationSystemBlueprintV2Input['visualization']['sequential'] => {
        if (keepsCharts && !brief.requiredSecondaryJobs.includes('sequential-data')) return null;
        const sequentialEligible = eligible(allApproved, applicationMode, 'sequential-data');
        const sequentialOptions = sequentialEligible
          .filter(option => !neutralFamilyIds.has(option.ref.familyId))
          .map(option => rendered(option, chartSurface));
        // p3-I: a recorded chart set draws the sequential ramp from its first color's family.
        // p4-B: that first color is reproduced exactly as one stop of the ramp; when no family
        // carries it, the ramp comes from the nearest family and the evidence says so.
        let sequentialOrderSource: ColorSystemChartOrderSourceV2 = 'generated';
        let sequential: RenderedOption[] | null = null;
        let sequentialAnchorIdentity: string | null = null;
        const sequentialEvidenceIds: string[] = [];
        if (recorded.length > 0) {
          const first = recorded[0];
          const firstHex = recordedHex(first, applicationMode);
          const member = exactRecordedMember(sequentialEligible, first, applicationMode);
          const nearest =
            member || !firstHex
              ? null
              : nearestChromaticFamily(
                  firstHex,
                  { profiles, candidate },
                  new Set(
                    sequentialOptions
                      .map(option => familyIdOf(option.option))
                      .filter((familyId): familyId is string => familyId !== null)
                  )
                );
          const familyId = member?.ref.familyId ?? nearest?.familyId ?? null;
          const anchorOption: Option | null =
            member ?? preservedRecordedOption(first, applicationMode);
          if (familyId !== null && !neutralFamilyIds.has(familyId)) {
            const familyName =
              nearest?.displayName ??
              shortFamilyName(
                candidate.families.find(family => family.stableFamilyId === familyId)
                  ?.displayName ?? familyId
              );
            const familyOptions = sequentialOptions.filter(
              option => familyIdOf(option.option) === familyId
            );
            const anchor = anchorOption ? rendered(anchorOption, chartSurface) : null;
            if (anchor) {
              sequential = chooseSequentialAnchored(
                familyOptions,
                anchor,
                counts.sequential,
                chartSurface
              );
              if (sequential) sequentialAnchorIdentity = anchor.option.identity;
            }
            if (!sequential) {
              sequential = chooseSequential(familyOptions, counts.sequential, false, chartSurface);
              if (sequential && anchor) {
                limitations.push(
                  `${applicationMode}: no ${counts.sequential}-mark ramp in the ${familyName} family could include your first recorded chart color “${first.displayName}” (${firstHex}) exactly, so the ramp uses the family's own steps.`
                );
              }
            }
            if (sequential) {
              sequentialOrderSource = 'recorded';
              sequentialEvidenceIds.push(
                nearest
                  ? 'composer:sequential:recorded-nearest-family'
                  : 'composer:sequential:recorded-first-family'
              );
              if (sequentialAnchorIdentity !== null) {
                sequentialEvidenceIds.push('composer:sequential:recorded-exact-stop');
              }
              if (nearest) {
                limitations.push(
                  `${applicationMode}: your first recorded chart color “${first.displayName}” (${firstHex}) has no scale of its own (${nearest.deltaEOK.toFixed(3)} ΔEOK from ${nearest.displayName}), so the sequential ramp is drawn from the ${nearest.displayName} family, the nearest to it${sequentialAnchorIdentity !== null ? `, with “${first.displayName}” as an exact stop` : ''}.`
                );
              }
            } else {
              limitations.push(
                `${applicationMode}: the sequential ramp could not be drawn from your first recorded chart color “${first.displayName}” at ${counts.sequential} marks; Teul chose the most even ramp among the other families.`
              );
            }
          }
        }
        sequential ??= chooseSequential(
          sequentialOptions,
          counts.sequential,
          candidate.systemShape !== 'full-light-dark-scales',
          chartSurface
        );
        if (!sequential) {
          block(
            'SEQUENTIAL_SYSTEM_UNDERFILLED',
            'sequential-data',
            `No exact ${counts.sequential}-mark system is strictly monotonic and meets the ${COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK} adjacent and ${COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK} surface Delta E OK policy.`
          );
        }

        if (
          new Set(
            sequential.flatMap(mark => {
              const familyId = familyIdOf(mark.option);
              return familyId === null ? [] : [familyId];
            })
          ).size > 1
        )
          limitations.push(
            'The source candidate supplies named pairs rather than a complete single-family sequential scale, so this monotonic cross-family sequence is limited preview evidence and not a production sequential palette.'
          );
        return {
          selectionId: 'composer:sequential',
          marks: sequential.map((mark, index) => ({
            order: index + 1,
            label: `Value ${index + 1}`,
            ref: refOf(mark.option),
            // p4-B: the stop that is the first recorded chart color exactly.
            ...(mark.option.identity === sequentialAnchorIdentity
              ? { origin: 'recorded' as const }
              : {}),
          })),
          surface: refOf(chartSurface),
          evidenceIds: [
            'composer:sequential:measured-selection',
            'composer:sequential:minimum-adjacent-variation',
            ...sequentialEvidenceIds,
          ],
          direction: 'light-to-dark',
          axisLabel: 'Value',
          endpointLabels: ['Low', 'High'],
          nonColorCue: 'axis-and-endpoint-labels',
          orderSource: sequentialOrderSource,
        };
      })();
    const diverging =
      ((): ColorSystemApplicationSystemBlueprintV2Input['visualization']['diverging'] => {
        if (keepsCharts && !brief.requiredSecondaryJobs.includes('diverging-data')) return null;
        const divergingEligible = eligible(allApproved, applicationMode, 'diverging-data');
        const divergingOptions = divergingEligible.map(option => rendered(option, chartSurface));
        let isNegative: (option: Option) => boolean = () => false;
        let isPositive: (option: Option) => boolean = () => false;
        let polarityEvidenceIds: readonly string[] = [];
        let divergingPolarity: ColorSystemDivergingPolarityV2 | null = null;
        let divergingOrderSource: ColorSystemChartOrderSourceV2 = 'generated';
        let diverging: RenderedOption[] | null = null;
        // p3-I: recorded chart colors decide the arms when the brief records a set:
        // the colors whose names claim negative and positive, else the two most
        // separated recorded hues (the one nearer red is negative).
        const recordedArms = recordedDivergingArms(
          recorded,
          divergingEligible,
          applicationMode,
          neutralFamilyIds,
          { profiles, candidate }
        );
        let divergingEndpoints: DivergingEndpoints = { negative: null, positive: null };
        if (recordedArms) {
          const negativeFamilyId = recordedArms.negative.familyId;
          const positiveFamilyId = recordedArms.positive.familyId;
          const recordedNegative = (option: Option): boolean =>
            familyIdOf(option) === negativeFamilyId;
          const recordedPositive = (option: Option): boolean =>
            familyIdOf(option) === positiveFamilyId;
          // p4-B: each arm ends on the recorded color itself — its exact member, or the
          // preserved color when no family carries it. Only arms with members of their
          // own may fall back to the family's free steps.
          const exactEndpoints: DivergingEndpoints = {
            negative: rendered(recordedArms.negative.exact, chartSurface),
            positive: rendered(recordedArms.positive.exact, chartSurface),
          };
          let attempt = chooseDiverging(
            divergingOptions,
            counts.diverging,
            recordedNegative,
            recordedPositive,
            midpointPolarity,
            chartSurface,
            exactEndpoints
          );
          const exact = attempt !== null;
          if (!attempt && !recordedArms.negative.nearest && !recordedArms.positive.nearest) {
            attempt = chooseDiverging(
              divergingOptions,
              counts.diverging,
              recordedNegative,
              recordedPositive,
              midpointPolarity,
              chartSurface
            );
            if (attempt) {
              limitations.push(
                `${applicationMode}: no ${counts.diverging}-mark diverging system could end on your recorded chart colors “${recordedArms.negative.color.displayName}” and “${recordedArms.positive.color.displayName}” exactly, so the arms use their families' own steps.`
              );
            }
          }
          if (attempt) {
            diverging = attempt;
            divergingOrderSource = 'recorded';
            isNegative = recordedNegative;
            isPositive = recordedPositive;
            if (exact) divergingEndpoints = exactEndpoints;
            polarityEvidenceIds = [
              `composer:diverging:recorded-order:${recordedArms.basis}`,
              ...(exact ? ['composer:diverging:recorded-exact-endpoints'] : []),
            ];
            divergingPolarity = {
              policyVersion: COLOR_SYSTEM_APPLICATION_RECORDED_DIVERGING_SEMANTICS_POLICY_VERSION,
              negativeFamilyId,
              positiveFamilyId,
              ...(exact && recordedArms.negative.nearest
                ? { negativeColorId: recordedArms.negative.color.stableColorId }
                : {}),
              ...(exact && recordedArms.positive.nearest
                ? { positiveColorId: recordedArms.positive.color.stableColorId }
                : {}),
              authority: 'recorded-order',
              evidenceIds: polarityEvidenceIds,
            };
            for (const arm of [recordedArms.negative, recordedArms.positive]) {
              if (!arm.nearest) continue;
              limitations.push(
                `${applicationMode}: your recorded chart color “${arm.color.displayName}” (${recordedHex(arm.color, applicationMode)}) has no scale of its own (${arm.nearest.deltaEOK.toFixed(3)} ΔEOK from ${arm.nearest.displayName}), so its diverging arm ends on the recorded value exactly and steps toward the midpoint through the ${arm.nearest.displayName} family, the nearest to it.`
              );
            }
          } else {
            limitations.push(
              `${applicationMode}: the diverging arms could not be drawn from your recorded chart colors “${recordedArms.negative.color.displayName}” (negative) and “${recordedArms.positive.color.displayName}” (positive) at ${counts.diverging} marks; Teul used the confirmed polarity instead.`
            );
          }
        }
        if (diverging === null && brief.divergingPolarity) {
          const confirmed = brief.divergingPolarity;
          polarityEvidenceIds = confirmed.evidenceIds;
          isNegative = option =>
            isApproved(option) && option.contributionId === confirmed.negativeContributionId;
          isPositive = option =>
            isApproved(option) && option.contributionId === confirmed.positiveContributionId;
          divergingPolarity = {
            policyVersion: COLOR_SYSTEM_APPLICATION_GENERATED_DIVERGING_SEMANTICS_POLICY_VERSION,
            negativeContributionId: confirmed.negativeContributionId,
            positiveContributionId: confirmed.positiveContributionId,
            authority: 'owner-confirmed',
            evidenceIds: confirmed.evidenceIds,
          };
        } else if (diverging === null) {
          const negativeSources = brief.sourceReferenceColors.filter(color =>
            color.applicationRoles?.includes('diverging-negative')
          );
          const positiveSources = brief.sourceReferenceColors.filter(color =>
            color.applicationRoles?.includes('diverging-positive')
          );
          if (negativeSources.length !== 1 || positiveSources.length !== 1) {
            block(
              'DIVERGING_POLARITY_UNRESOLVED',
              'diverging-data/polarity',
              'Diverging composition requires one governed source pair or two owner-confirmed generated contributions.'
            );
          }
          const negativeSource = negativeSources[0];
          const positiveSource = positiveSources[0];
          polarityEvidenceIds = negativeSource.evidenceIds.filter(evidenceId =>
            positiveSource.evidenceIds.includes(evidenceId)
          );
          if (polarityEvidenceIds.length === 0) {
            block(
              'DIVERGING_POLARITY_UNRESOLVED',
              'diverging-data/polarity-evidence',
              'Diverging polarity requires shared governed source evidence for negative and positive meanings.'
            );
          }
          isNegative = option =>
            isApproved(option) && option.sourceColorIds.includes(negativeSource.stableColorId);
          isPositive = option =>
            isApproved(option) && option.sourceColorIds.includes(positiveSource.stableColorId);
          divergingPolarity = {
            policyVersion: COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION,
            negativeSourceColorId: negativeSource.stableColorId,
            positiveSourceColorId: positiveSource.stableColorId,
            authority: 'governed-source',
            evidenceIds: polarityEvidenceIds,
          };
        }
        if (diverging === null) {
          if (
            !divergingOptions.some(option => isNegative(option.option)) ||
            !divergingOptions.some(option => isPositive(option.option))
          ) {
            block(
              'DIVERGING_POLARITY_UNRESOLVED',
              'diverging-data/eligible-arms',
              'Reviewed diverging eligibility does not contain both confirmed polarity identities.'
            );
          }
          diverging = chooseDiverging(
            divergingOptions,
            counts.diverging,
            option => isNegative(option) && !neutralFamilyIds.has(familyIdOf(option) ?? ''),
            option => isPositive(option) && !neutralFamilyIds.has(familyIdOf(option) ?? ''),
            midpointPolarity,
            chartSurface
          );
        }
        if (!diverging || !divergingPolarity) {
          block(
            'DIVERGING_SYSTEM_UNDERFILLED',
            'diverging-data',
            `No exact ${counts.diverging}-mark system closes governed negative and positive uniform arms around a ${midpointPolarity} midpoint that stays ${COLOR_SYSTEM_APPLICATION_DIVERGING_MINIMUM_MIDPOINT_SURFACE_DELTA_E_OK} Delta E OK from the surface while meeting the opposing-arm advisory threshold.`
          );
        }
        const divergingMarks = diverging;

        return {
          selectionId: 'composer:diverging',
          marks: divergingMarks.map((mark, index) => ({
            order: index + 1,
            label:
              index < Math.floor(divergingMarks.length / 2)
                ? `Negative ${index + 1}`
                : index === Math.floor(divergingMarks.length / 2)
                  ? 'Zero'
                  : `Positive ${index - Math.floor(divergingMarks.length / 2)}`,
            ref: refOf(mark.option),
            // p4-B: an arm's outermost mark that is the recorded chart color exactly.
            ...((index === 0 && divergingEndpoints.negative !== null) ||
            (index === divergingMarks.length - 1 && divergingEndpoints.positive !== null)
              ? { origin: 'recorded' as const }
              : {}),
          })),
          surface: refOf(chartSurface),
          evidenceIds: ['composer:diverging:measured-selection', ...polarityEvidenceIds],
          polarity: divergingPolarity,
          midpointOrder: (divergingMarks.length + 1) / 2,
          midpointMeaning: divergingMidpointMeaning,
          midpointPolarity,
          zeroReferenceLine: true,
          negativeLabel: 'Negative',
          positiveLabel: 'Positive',
          nonColorCue: 'zero-line-and-sign-labels',
          orderSource: divergingOrderSource,
        };
      })();
    if (sequential === null || diverging === null) {
      const omitted =
        sequential === null && diverging === null
          ? 'Sequential and diverging ramps were'
          : sequential === null
            ? 'Sequential ramps were'
            : 'Diverging ramps were';
      limitations.push(
        `The recorded chart palette is preserved. ${omitted} not requested and were not generated.`
      );
    }
    const visualization = { categorical: categorical.context, sequential, diverging };

    const input: ColorSystemApplicationSystemBlueprintV2Input = {
      compilerVersion: COLOR_SYSTEM_APPLICATION_COMPOSER_V2_VERSION,
      modes,
      productGraphics,
      productSemantics: semantics,
      semanticMeaning,
      ...(interactionRequirements
        ? { interaction: { requirements: interactionRequirements, statePlans } }
        : {}),
      ...(productGraphicsRequirements ? { productGraphicsRequirements } : {}),
      visualization,
      additionalCategorical,
      typography,
      pairContexts: pairs,
      limitations: [...new Set(limitations)],
    };
    const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
    if (blueprint.status === 'blocked') {
      const blockers: ColorSystemApplicationComposerBlockerV2[] = blueprint.blockers.map(item => ({
        code: 'APPLICATION_BLUEPRINT_BLOCKED',
        scope: item.evidenceId,
        message: item.message,
      }));
      return {
        status: 'blocked',
        blueprint,
        blockers,
        compositionHash: compositionHash(brief, candidate, options, blueprint, blockers),
      };
    }
    return {
      status: 'ready',
      blueprint,
      blockers: [],
      compositionHash: compositionHash(brief, candidate, options, blueprint, []),
    };
  } catch (error) {
    if (!(error instanceof CompositionBlocked)) throw error;
    const blockers = [error.blocker];
    return {
      status: 'blocked',
      blueprint: null,
      blockers,
      compositionHash: compositionHash(brief, candidate, options, null, blockers),
    };
  }
}

export function colorSystemApplicationComposerInputIdentityV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  options: ColorSystemApplicationComposerOptionsV2 = {}
): string {
  return deterministicContentHash({
    composerVersion: COLOR_SYSTEM_APPLICATION_COMPOSER_V2_VERSION,
    briefHash: brief.briefHash,
    candidateHash: candidate.candidateHash,
    options: canonicalJson(options),
  });
}
