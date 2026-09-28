import { colorSystemBrandTerritoryMatchesSourceV1 } from './colorSystemBrandConstraintsV1';
import {
  getColorSystemProductGraphicsRenderingV1,
  type ColorSystemProductGraphicsRenderingV1,
} from './colorSystemProductGraphicsPlanV1';
import type {
  ColorSystemApplicationSystemBlueprintV2,
  ColorSystemCategoricalSelectionV2,
  ColorSystemProductSemanticRoleNameV2, // p4-DE
  ColorSystemRenderedPairStatusV2,
  ColorSystemReviewChartOrderFactV2,
  ColorSystemReviewSurfacesFactV2,
  ColorSystemSectionBlueprintV2,
  ColorSystemSemanticHueRangeRoleV2,
  ColorSystemSemanticMeaningEvidenceV2,
  ColorSystemSemanticMeaningRoleV2,
  ColorSystemSemanticMeaningSourceV2,
} from './colorSystemApplicationBlueprintV2';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { getWCAGContrastHex } from './accessibility'; // p6
import { paletteHueFamilyV3 } from './colorSystemPaletteAnalysisV3'; // p6
import {
  COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2, // p6
  type ColorSystemAgentAdoptionV1,
  type ColorSystemApplicationColorRefV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemJobV2,
  type ColorSystemProductGraphicsJobV2,
  type ColorSystemReplaceableSectionRoleV2,
  type ColorSystemSectionDispositionV2,
  type ColorSystemSectionRatingV2,
  type ColorSystemSectionRoleV2,
  type ColorSystemStrategyCandidateV2,
  type ColorSystemTypographyUseCategoryV2,
} from './colorSystemBuilderV2Contracts';
import {
  COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK,
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2, // p4-DE
  COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2,
  assertColorSystemSectionBlueprintV2Integrity,
  colorSystemHueWithinRangeV2,
  colorSystemReviewChartOrderFactV2, // p3-I
  colorSystemReviewSurfacesFactV2, // p3-I
} from './colorSystemApplicationBlueprintV2';
import {
  colorSystemBrandFamilyIdV2,
  colorSystemFamilyAnchorHexV2,
  colorSystemMeanAnchorSeparationDeltaEOKV2,
  colorSystemSourceContinuityDeltaEOKV2, // p3-I
  isColorSystemStatusReserveFamilyV2,
} from './colorSystemApplicationComposerV2';
import {
  COLOR_SYSTEM_SECONDARY_ACCENT_KIND_LABEL_V3,
  COLOR_SYSTEM_SECONDARY_ANALOGOUS_RANGE_DEGREES_V3,
  COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3,
  COLOR_SYSTEM_SECONDARY_STRATEGY_KIND_BY_DIRECTION_V3,
  COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3, // p6
  classifyColorSystemSecondaryLightnessV3,
  describeColorSystemSecondaryDirectionV3,
  describeColorSystemSecondaryFamilyV3,
  describeColorSystemSecondaryHueTemperatureV3, // p6
  normalizeColorSystemSecondaryHexV3,
  pickColorSystemSecondaryHeroV3,
  readColorSystemSecondaryFamilyV3,
  type ColorSystemSecondaryFamilyKindV3,
  type ColorSystemSecondaryFamilyReadingV3,
  type ColorSystemSecondaryLightnessClassV3,
  type ColorSystemSecondaryStrategyKindV3,
} from './colorSystemSecondaryStrategyV3';
import {
  CMYK_UNPROFILED_DISCLAIMER,
  COLOR_SYSTEM_PROPORTION_RULE_V3,
  COLOR_SYSTEM_SURFACE_ADVISORIES_V3_SCHEMA_VERSION,
  buildSurfaceAdvisoriesV3,
  printTriplet,
  surfacesForJobs,
  totalInkCoverage,
  type ColorSystemProportionRuleV3,
  type ColorSystemSurfaceV3,
  type HeroDisciplineBindingV3,
  type HeroDisciplineColorV3,
  type OwnerSuppliedSpotColor,
  type SurfaceAdvisoryCodeV3,
  type SurfaceAdvisorySeverityV3,
} from './colorSystemSurfaceAdvisoriesV3';
import { compareText, hexToOklch, rgbToHex, type RGB } from './utils';

export const COLOR_SYSTEM_REVIEW_MODEL_V2_SCHEMA_VERSION =
  'teul-color-system-review-model/v2' as const;
export const COLOR_SYSTEM_REVIEW_EVIDENCE_ID_LIMIT_V2 = 64 as const;

export interface ColorSystemReviewColorV2 {
  id: string;
  name: string;
  mode: string;
  hex: string;
  alpha: number;
  /** Exact native channels; hex remains a display approximation. Absent for byte-based colors. */
  nativeValue?: ColorSystemColorValueV2;
  origin: 'existing' | 'suggested';
  jobs: readonly string[];
}

export interface ColorSystemReviewFamilyV2 {
  id: string;
  name: string;
  prominence: 'supporting' | 'accent' | 'leading';
  reason: string;
  jobs: readonly ColorSystemJobV2[];
  colors: readonly ColorSystemReviewColorV2[];
  /**
   * wave2-UI: how the family reads from its realized colors. `derived` reproduces
   * a confirmed source hue exactly, `accent` is a new hue, `neutral` is a gray ramp.
   */
  kind?: ColorSystemSecondaryFamilyKindV3;
  /** wave2-UI: the exact Light step-9 anchor (named base for base-light pairs). */
  anchorHex?: string;
  /**
   * p3-B: present when the planner added this family as a conventional status
   * reserve; names the status range its anchor sits in.
   */
  statusReserve?: ColorSystemReviewStatusReserveRoleV2;
  /** p3-H: recorded tints pinned byte-identical into this family's scale. */
  pinnedMembers?: readonly ColorSystemReviewPinnedMemberV2[];
  /** p3-H: recorded tints of this family that could not be pinned, with the reason. */
  pinSkips?: readonly ColorSystemReviewPinSkipV2[];
}

/** p3-H: one exact tint pinned at a scale step; `memberId` is the member whose value in `mode` is the tint. */
export interface ColorSystemReviewPinnedMemberV2 {
  memberId: string;
  step: number;
  mode: string;
  sourceName: string;
  hex: string;
}

/** p3-H: a tint that stays a source token because its pin failed; `nearestStep` is where it would have sat. */
export interface ColorSystemReviewPinSkipV2 {
  sourceName: string;
  hex: string;
  mode: string;
  nearestStep: number | null;
  reason: string;
}

/** p3-H: a status reserve the planner needed and could not add, with the sentence the review prints. */
export interface ColorSystemReviewSkippedStatusReserveV2 {
  role: ColorSystemReviewStatusReserveRoleV2;
  hue: number;
  realizedHex: string;
  nearestHex: string;
  nearestName: string;
  deltaEOK: number;
  cause: 'separation' | 'family-limit';
  statement: string;
}

/** p3-B: the status ranges a planner reserve can stand in for (error covers destructive). */
export type ColorSystemReviewStatusReserveRoleV2 = Exclude<
  ColorSystemSemanticHueRangeRoleV2,
  'destructive'
>;

/** p3-B: where one meaning role's family came from, with the sentence the Why block prints. */
export interface ColorSystemReviewMeaningSourceV2 {
  role: ColorSystemSemanticMeaningRoleV2;
  mode: string;
  source: ColorSystemSemanticMeaningSourceV2;
  /** Review name of the family that carries the role. */
  family: string;
  statement: string;
}

/** p3-B: the declared proportion rule; a Teul policy default carried on every review. */
export type ColorSystemReviewProportionRuleV2 = ColorSystemProportionRuleV3;

/** wave2-UI: one rendered typography pair with its WCAG ratio and supplementary APCA Lc. */
export interface ColorSystemReviewTextPairV2 {
  id: string;
  useCategory: ColorSystemTypographyUseCategoryV2;
  mode: string;
  foreground: ColorSystemReviewColorV2;
  background: ColorSystemReviewColorV2;
  ratio: number | null;
  threshold: 3 | 4.5;
  status: ColorSystemRenderedPairStatusV2;
  /** Supplementary APCA Lc for the rendered pair; never a gate. Null when unassessed. */
  apcaLc: number | null;
}

/** wave2-UI: what the adaptive categorical composer could deliver per mode, when it reports it. */
export interface ColorSystemReviewCategoricalCapacityV2 {
  mode: string;
  requestedMarkCount: number;
  achievedMarkCount: number;
  limitation: string | null;
}

/** wave2-UI: the measured facts behind a direction, one number per ranking criterion. */
export interface ColorSystemReviewWhyV2 {
  /** Minimum ΔEOK between chromatic family anchors, against the engine's threshold. */
  familyAnchorSeparation: { minimum: number | null; threshold: number };
  /** Mean ΔEOK each generated anchor moved from the source color it came from. */
  meanSourceAdjustment: number | null;
  /** Light and Dark steps that fell outside sRGB and were mapped back. */
  gamutMappedSteps: number | null;
  requiredPairs: { passing: number; total: number };
  /** Hue-band meaning roles whose resolved value sits inside its band. */
  meaningRoles: { inRange: number; total: number };
  /** Coefficient of variation of the sequential ramp's adjacent ΔEOK steps; 0 is perfectly even. */
  sequentialAdjacentCoefficientOfVariation: number | null;
  /** Minimum modeled ΔEOK across chart selections, overall and per simulated color vision. */
  chartSeparation: {
    minimum: number;
    threshold: number;
    normal: number;
    protan: number;
    deutan: number;
    tritan: number;
  };
  /** Mean pairwise ΔEOK between family anchors. */
  meanAnchorSeparation: number;
  /** Mean ΔEOK from each anchor to its nearest governed source anchor; null without sources. */
  sourceContinuity: number | null;
  /** The measured statements the recommendation ranks on, printed for this direction. */
  basisStatements: readonly string[];
  /** p3-B: one entry per meaning role and mode, saying which kind of family carries it. */
  meaningSources?: readonly ColorSystemReviewMeaningSourceV2[];
  /** p3-H: present when the planner needed a status reserve it could not add. */
  skippedStatusReserves?: readonly ColorSystemReviewSkippedStatusReserveV2[];
  /** p3-I: “Surfaces: your recorded grounds (Surface Gray, Surface Black)” or “Surfaces: generated neutral ramp”. */
  surfaces?: ColorSystemReviewSurfacesFactV2;
  /** p3-I: “Chart order: your recorded order (6 colors)” or “Chart order: generated”, with the recorded order's gate warnings. */
  chartOrder?: ColorSystemReviewChartOrderFactV2;
}

export interface ColorSystemReviewFamilySurfacesV2 {
  id: string;
  name: string;
  hex: string;
  surfaces: readonly ColorSystemSurfaceV3[];
}

export interface ColorSystemReviewSurfaceAdvisoryV2 {
  id: string;
  surface: ColorSystemSurfaceV3;
  severity: SurfaceAdvisorySeverityV3;
  code: SurfaceAdvisoryCodeV3;
  message: string;
}

export interface ColorSystemReviewPrintTripletV2 {
  colorId: string;
  name: string;
  screenHex: string;
  /** Whole-percentage unprofiled estimate; see `cmykDisclaimer` on the parent. */
  cmyk: { c: number; m: number; y: number; k: number; totalInk: number };
  /** Only ever an owner-supplied reference; Teul never looks one up. */
  spot: OwnerSuppliedSpotColor | null;
  canonical: 'screen' | 'spot';
  note: string;
}

/**
 * wave2-UI: where each family can travel and the print / out-of-home checks
 * that follow. Per-surface counts are derivable from `advisories` and are not
 * repeated on the wire.
 */
export interface ColorSystemReviewBrandSurfacesV2 {
  version: typeof COLOR_SYSTEM_SURFACE_ADVISORIES_V3_SCHEMA_VERSION;
  surfaces: readonly ColorSystemSurfaceV3[];
  families: readonly ColorSystemReviewFamilySurfacesV2[];
  advisories: readonly ColorSystemReviewSurfaceAdvisoryV2[];
  printTriplets: readonly ColorSystemReviewPrintTripletV2[];
  cmykDisclaimer: typeof CMYK_UNPROFILED_DISCLAIMER;
}

/**
 * p4-DE: one resolved product role per mode, named as the semantic collection
 * aliases it (`semantic/<role>`). The preview boards are built from these and
 * from nothing else; `color` is the same review color the sections show.
 */
export interface ColorSystemReviewSemanticRoleV2 {
  role: ColorSystemProductSemanticRoleNameV2;
  mode: string;
  /** The alias token path the resource blueprint compiles for this role. */
  tokenName: string;
  color: ColorSystemReviewColorV2;
}

export interface ColorSystemReviewDirectionDecisionV2 {
  promise: string;
  bestFor: string;
  tradeoff: string;
  authority: 'teul-recommendation';
  ownerAcceptance: false;
}

/** p5-A: one recorded color the owner chose to replace, per recorded mode. */
export interface ColorSystemReviewReplacedColorV2 {
  id: string;
  name: string;
  section: ColorSystemReplaceableSectionRoleV2;
  mode: string;
  hex: string;
}

/**
 * p5-A: what a Replace plan did not carry, listed so nothing disappears silently.
 * `statements` holds one sentence per replaced section (“Secondary: replaced; 22
 * recorded colors are not carried into the new system.”); `colors` lists every
 * recorded value by name and exact hex.
 */
export interface ColorSystemReviewReplacedV2 {
  statements: readonly string[];
  colors: readonly ColorSystemReviewReplacedColorV2[];
}

/** p6: where a first-screen color came from; written out on the card, never signalled by color alone. */
export type ColorSystemReviewSystemOriginV2 = 'kept-exactly' | 'new' | 'from-brand';

/** p6: one value of a card part in one mode. */
export interface ColorSystemReviewSystemValueV2 {
  mode: string;
  hex: string;
  nativeValue?: ColorSystemColorValueV2;
}

/** p6: a labelled value inside a card (“Fill”, “Text on it”, “Hover”), one value per mode. */
export interface ColorSystemReviewSystemPartV2 {
  label: string;
  values: readonly ColorSystemReviewSystemValueV2[];
}

/**
 * p6: one color card on the recommendation screen: a plain name, an origin tag,
 * one line beginning “Used for:” and its parts. Nothing else belongs on the card.
 */
export interface ColorSystemReviewSystemCardV2 {
  id: string;
  name: string;
  origin: ColorSystemReviewSystemOriginV2 | null;
  usedFor: string;
  parts: readonly ColorSystemReviewSystemPartV2[];
}

/**
 * p6: the plain UI name of one family (“Violet accent”, “Success green”, “Neutral
 * ramp”) and its `color/<slug>` token path. The data names and the created
 * token paths are unchanged; only what the screen prints differs.
 */
export interface ColorSystemReviewSystemFamilyNameV2 {
  familyId: string;
  name: string;
  tokenPath: string;
}

/**
 * p6: the recommendation view, grouped by use rather than by derivation. Every
 * string here is first-screen prose: no measures, no hue degrees, no derivation
 * vocabulary; the numbers stay on `why` and in the sections.
 */
export interface ColorSystemReviewRecommendedSystemV2 {
  /** The primary, the neutral ramp, every new accent and every status color, counted once each. */
  colorCount: number;
  /** “7 colors: Primary / Brand kept exactly, a cool neutral ramp, 2 new accents, 3 status colors.” */
  summary: string;
  /** How this direction places its new accents, as a predicate: “keeps its new accents close to your primary hue”. */
  accentPlacement: string;
  /** The one sentence shown when this direction is listed under “Also considered”. */
  alsoConsidered: string;
  brand: readonly ColorSystemReviewSystemCardV2[];
  productUi: readonly ColorSystemReviewSystemCardV2[];
  status: readonly ColorSystemReviewSystemCardV2[];
  /** “Three of five series are distinguishable in Light and Dark.”; null when every request was met. */
  chartCapacity: string | null;
  /** What was kept, what was added and why, what the tool did not do; the direction comparison is composed by the screen. */
  why: { kept: string; added: string; notDone: string };
  familyNames: readonly ColorSystemReviewSystemFamilyNameV2[];
}

export interface ColorSystemReviewVisualizationMarkV2 {
  order: number;
  label: string;
  color: ColorSystemReviewColorV2;
  /** Exact sRGB mark value after the application blueprint composites it on its declared surface. */
  renderedHex: string;
}

interface ColorSystemReviewVisualizationSpecimenBaseV2 {
  selectionId: string;
  marks: readonly ColorSystemReviewVisualizationMarkV2[];
  surface: ColorSystemReviewColorV2;
  evidenceIds: readonly string[];
}

export interface ColorSystemReviewCategoricalSpecimenV2 extends ColorSystemReviewVisualizationSpecimenBaseV2 {
  kind: 'categorical';
  adjacency: 'separated' | 'touching';
  boundary: ColorSystemReviewColorV2 | null;
  directLabels: true;
  nonColorCue: 'shape' | 'pattern';
}

export interface ColorSystemReviewSequentialSpecimenV2 extends ColorSystemReviewVisualizationSpecimenBaseV2 {
  kind: 'sequential';
  direction: 'light-to-dark' | 'dark-to-light';
  axisLabel: string;
  endpointLabels: readonly [string, string];
  nonColorCue: 'axis-and-endpoint-labels';
}

export interface ColorSystemReviewDivergingSpecimenV2 extends ColorSystemReviewVisualizationSpecimenBaseV2 {
  kind: 'diverging';
  midpointOrder: number;
  midpointMeaning: string;
  midpointPolarity: 'light' | 'dark';
  zeroReferenceLine: true;
  negativeLabel: string;
  positiveLabel: string;
  nonColorCue: 'zero-line-and-sign-labels';
}

export interface ColorSystemReviewVisualizationSpecimensV2 {
  categorical: ColorSystemReviewCategoricalSpecimenV2;
  sequential: ColorSystemReviewSequentialSpecimenV2 | null;
  diverging: ColorSystemReviewDivergingSpecimenV2 | null;
  /** wave2-UI: present only when the composer reports requested versus achieved marks per mode. */
  categoricalCapacity?: readonly ColorSystemReviewCategoricalCapacityV2[];
}

export interface ColorSystemReviewProductGraphicsSpecimenV2 {
  derivationId: string;
  job: ColorSystemProductGraphicsJobV2;
  order: number;
  mode: string;
  intendedUse: string;
  excludedUses: readonly string[];
  assessment: 'informative' | 'decorative';
  colors: readonly ColorSystemReviewColorV2[];
  surface: ColorSystemReviewColorV2 | null;
  underlay: ColorSystemReviewColorV2 | null;
  contrast: {
    ratio: number | null;
    requiredRatio: 3 | 4.5;
    status: 'pass' | 'fail' | 'unassessed' | 'inactive-exempt';
    limitation: string;
    /** wave2-UI: supplementary APCA Lc for the same rendered pair; never a gate. */
    apcaLc?: number | null;
  } | null;
  accessibilityStatus: 'pass' | 'exempt' | 'blocked';
  nonColorCue: string | null;
  pairEvidenceIds: readonly string[];
  evidenceIds: readonly string[];
  rendering?: ColorSystemReviewProductGraphicsRenderingV1 | null;
  renderingLimitation?: string | null;
}

export interface ColorSystemReviewProductGraphicsRenderingV1 extends Omit<
  ColorSystemProductGraphicsRenderingV1,
  'uses' | 'pairs'
> {
  uses: readonly (Omit<ColorSystemProductGraphicsRenderingV1['uses'][number], 'ref'> & {
    color: ColorSystemReviewColorV2;
  })[];
  pairs: readonly (ColorSystemProductGraphicsRenderingV1['pairs'][number] & {
    contrast: NonNullable<ColorSystemReviewProductGraphicsSpecimenV2['contrast']>;
  })[];
}

export interface ColorSystemReviewSectionV2 {
  role: ColorSystemSectionRoleV2;
  title: string;
  changeLabel: string;
  disposition: ColorSystemSectionDispositionV2;
  guidance: string;
  colors: readonly ColorSystemReviewColorV2[];
  exampleLabels: readonly string[];
  ratings: ColorSystemSectionRatingV2 | null;
  cardBoundary: 'none' | 'black-inside-1px' | 'white-inside-1px';
  productGraphicsSpecimens: readonly ColorSystemReviewProductGraphicsSpecimenV2[] | null;
  visualizationSpecimens: ColorSystemReviewVisualizationSpecimensV2 | null;
  /** wave2-UI: the rendered typography pairs; set on the Typography section only. */
  textPairs?: readonly ColorSystemReviewTextPairV2[];
}

export interface ColorSystemReviewModelV2 {
  schemaVersion: typeof COLOR_SYSTEM_REVIEW_MODEL_V2_SCHEMA_VERSION;
  directionId: string;
  directionLabel: string;
  directionDecision: ColorSystemReviewDirectionDecisionV2;
  status: 'ready-to-create' | 'ready-to-review';
  adoption?: ColorSystemAgentAdoptionV1;
  headline: string;
  summary: string;
  unchanged: readonly string[];
  proposed: readonly string[];
  importantLimitations: readonly string[];
  families: readonly ColorSystemReviewFamilyV2[];
  sections: readonly [
    ColorSystemReviewSectionV2,
    ColorSystemReviewSectionV2,
    ColorSystemReviewSectionV2,
    ColorSystemReviewSectionV2,
    ColorSystemReviewSectionV2,
  ];
  technicalReceipt: {
    sourceHash: string;
    candidateHash: string;
    applicationBlueprintHash: string;
    sectionBlueprintHash: string;
  };
  /** wave2-UI: the numbers behind the direction; see ColorSystemReviewWhyV2. */
  why?: ColorSystemReviewWhyV2;
  /** wave2-UI: surface reach plus print and out-of-home advisories. */
  brandSurfaces?: ColorSystemReviewBrandSurfacesV2;
  /** p3-B: the proportion rule Teul honours, with the sources it compared. */
  proportionRule?: ColorSystemReviewProportionRuleV2;
  /** p4-DE: every product role per mode, for the marketing and out-of-home preview boards. */
  semanticRoles?: readonly ColorSystemReviewSemanticRoleV2[];
  /** p5-A: present only when the plan replaced a section that had recorded colors. */
  replaced?: ColorSystemReviewReplacedV2;
  /** p6: the system grouped by use for the recommendation screen; see ColorSystemReviewRecommendedSystemV2. */
  recommendedSystem?: ColorSystemReviewRecommendedSystemV2;
  reviewModelHash: string;
}

type ReviewModelContent = Omit<ColorSystemReviewModelV2, 'reviewModelHash'>;

function candidateStrategyKind(
  candidate: ColorSystemStrategyCandidateV2
): ColorSystemSecondaryStrategyKindV3 {
  const direction = candidate.id.replace(/^secondary-/, '');
  const kind = (
    COLOR_SYSTEM_SECONDARY_STRATEGY_KIND_BY_DIRECTION_V3 as Readonly<
      Record<string, ColorSystemSecondaryStrategyKindV3 | undefined>
    >
  )[direction];
  if (!kind) {
    throw new Error(`Review model does not recognize Secondary direction ${candidate.id}.`);
  }
  return kind;
}

function familyAnchorValue(
  family: ColorSystemStrategyCandidateV2['families'][number],
  modes?: readonly string[]
): ColorSystemColorValueV2 {
  const shape = family.shape;
  const representative =
    shape.kind === 'named-base-light-pair'
      ? family.members.find(member => member.stableMemberId === shape.baseMemberId)
      : family.members.find(member => member.role === 'step-9');
  const member = representative ?? family.members[0];
  const mode = orderModes(modes ?? Object.keys(member.valuesByMode)).find(
    mode => member.valuesByMode[mode]
  );
  if (!mode) throw new Error(`Review family ${family.stableFamilyId} has no requested mode.`);
  const value = member.valuesByMode[mode];
  return value;
}

interface CandidateReadings {
  kind: ColorSystemSecondaryStrategyKindV3;
  heroLightnessClass: ColorSystemSecondaryLightnessClassV3 | null;
  byFamilyId: ReadonlyMap<string, ColorSystemSecondaryFamilyReadingV3>;
}

/**
 * Every family is read from its realized colors: a family whose exact step 9
 * equals a confirmed source color is derived; a step 9 below the measured
 * neutral chroma rule is a neutral ramp; everything else is a new accent whose
 * hue, lightness, and separation are measured, not asserted.
 */
function candidateReadings(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  modes: readonly string[]
): CandidateReadings {
  const hero = pickColorSystemSecondaryHeroV3(
    brief.preservedColors.map(color => ({
      stableColorId: color.stableColorId,
      displayName: color.displayName,
      section: color.section,
      valuesByMode: Object.fromEntries(
        Object.entries(color.valuesByMode).filter(([mode]) => modes.includes(mode))
      ),
      retention: 'preserved' as const,
      evidenceIds: color.evidenceIds,
    }))
  );
  const heroOklch = hero?.oklch ?? null;
  const sourceById = new Map(
    [...brief.preservedColors, ...brief.sourceReferenceColors].map(color => [
      color.stableColorId,
      color,
    ])
  );
  const anchors = candidate.families.map(family => ({
    family,
    anchorHex: familyAnchorValue(family, modes).hex,
    anchorValue: familyAnchorValue(family, modes),
  }));
  const byFamilyId = new Map(
    anchors.map(entry => {
      const sourceColorIds = entry.family.members[0]?.provenance.sourceColorIds ?? [];
      const source = sourceColorIds
        .map(id => sourceById.get(id))
        .find(color => color !== undefined);
      const sourceValue =
        source === undefined
          ? null
          : (Object.values(source.valuesByMode).find(
              value => canonicalJson(value) === canonicalJson(entry.anchorValue)
            ) ?? null);
      const sourceHex = sourceValue?.hex ?? null;
      return [
        entry.family.stableFamilyId,
        readColorSystemSecondaryFamilyV3({
          displayName: reviewFamilyName(entry.family.displayName),
          contributionId: entry.family.contributionId,
          anchorHex: entry.anchorHex,
          anchorValue: entry.anchorValue,
          sourceHex,
          sourceValue: sourceValue ?? undefined,
          sourceDisplayName: source?.displayName ?? null,
          heroOklch,
          otherAnchorHexes: anchors
            .filter(other => other.family.stableFamilyId !== entry.family.stableFamilyId)
            .map(other => other.anchorHex),
          otherAnchorValues: anchors
            .filter(other => other.family.stableFamilyId !== entry.family.stableFamilyId)
            .map(other => other.anchorValue),
        }),
      ] as const;
    })
  );
  return {
    kind: candidateStrategyKind(candidate),
    heroLightnessClass: heroOklch ? classifyColorSystemSecondaryLightnessV3(heroOklch.l) : null,
    byFamilyId,
  };
}

function measureValue(candidate: ColorSystemStrategyCandidateV2, id: string): number | null {
  return candidate.measures.find(measure => measure.id === id)?.measuredValue ?? null;
}

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function directionDecision(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  modes: readonly string[]
): ColorSystemReviewDirectionDecisionV2 {
  const readings = candidateReadings(brief, candidate, modes);
  const all = [...readings.byFamilyId.values()];
  const derived = all.filter(reading => reading.kind === 'derived');
  const accents = all.filter(reading => reading.kind === 'accent');
  const separation = measureValue(candidate, 'minimum-family-anchor-separation');
  const mappedSteps = measureValue(candidate, 'gamut-mapped-mode-steps');
  const skips = measureValue(candidate, 'family-anchor-separation-skips') ?? 0;
  const accentKind = COLOR_SYSTEM_SECONDARY_ACCENT_KIND_LABEL_V3[readings.kind];
  const existingHues = countNoun(derived.length, 'existing hue');
  const bestFor =
    readings.kind === 'derived'
      ? `Product surfaces and brand work that must stay inside your ${existingHues}${
          accents.length > 0
            ? `, with ${countNoun(accents.length, 'analogous accent')} within ${COLOR_SYSTEM_SECONDARY_ANALOGOUS_RANGE_DEGREES_V3}° of the primary hue`
            : ''
        }.`
      : readings.kind === 'complementary'
        ? `A general-purpose Secondary system: your ${existingHues} plus ${countNoun(accents.length, 'complementary accent')} across product graphics, interface roles, and data visualization.`
        : `Categorical data and expressive moments that need ${countNoun(accents.length, 'hue-spaced accent')} beyond your ${existingHues}.`;
  const accentTradeoff =
    accents.length === 0
      ? 'No new hue is proposed, so categorical needs beyond your existing hues are not covered by this direction.'
      : `${countNoun(accents.length, `new ${accentKind} hue`)} at ${accents
          .map(reading => `${Math.round(reading.anchor.h)}°`)
          .join(', ')}${
          readings.kind === 'derived'
            ? ` stay within ${COLOR_SYSTEM_SECONDARY_ANALOGOUS_RANGE_DEGREES_V3}° of the primary, so categorical separation leans on lightness as much as hue.`
            : readings.kind === 'complementary'
              ? ' sit opposite the primary, so product UI needs restraint where they meet it.'
              : ' spread around the wheel, so they read less closely related to the existing palette.'
        }`;
  const tradeoff = [
    accentTradeoff,
    separation === null
      ? null
      : `Minimum chromatic anchor separation ΔEOK ${separation.toFixed(2)} (threshold ${COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3}).`,
    mappedSteps === null ? null : `${countNoun(mappedSteps, 'Light and Dark step')} gamut-mapped.`,
    skips > 0
      ? `${countNoun(skips, 'generated family', 'generated families')} skipped for separation.`
      : null,
    // p3-H: a status role without its conventional reserve says why, here and in the why block.
    ...reviewSkippedStatusReserves(candidate).map(entry => entry.statement),
  ]
    .filter((sentence): sentence is string => sentence !== null)
    .join(' ');
  const measuredPromise = describeColorSystemSecondaryDirectionV3({
    strategyKind: readings.kind,
    readings: all,
    heroLightnessClass: readings.heroLightnessClass,
    minimumSeparationDeltaEOK: separation,
    countReason:
      brief.secondaryTargetFamilyCountReasonByDirection?.[
        candidate.id.replace(/^secondary-/, '') as keyof NonNullable<
          typeof brief.secondaryTargetFamilyCountReasonByDirection
        >
      ] ?? null,
  });
  // p5-A: a Replace plan says first that it is a new system and what it did not carry.
  const replacedPhrase = replacedCountsPhrase(brief);
  return {
    promise: replacedPhrase
      ? `A new system from your Primary and grays: ${replacedPhrase} not carried. ${measuredPromise}`
      : measuredPromise,
    bestFor,
    tradeoff,
    authority: 'teul-recommendation',
    ownerAcceptance: false,
  };
}

/** p5-A: the section names the replaced-colour sentences use. */
const REPLACED_SECTION_LABELS: Readonly<Record<ColorSystemReplaceableSectionRoleV2, string>> = {
  secondary: 'Secondary',
  'product-graphics': 'Product Graphics',
  'data-visualization': 'Data Visualization',
};
const REPLACED_SECTION_NOUNS: Readonly<Record<ColorSystemReplaceableSectionRoleV2, string>> = {
  secondary: 'recorded Secondary',
  'product-graphics': 'recorded Product Graphics',
  'data-visualization': 'recorded chart',
};
const REPLACED_SECTION_ORDER: readonly ColorSystemReplaceableSectionRoleV2[] = [
  'secondary',
  'product-graphics',
  'data-visualization',
];

/** p5-A: the replaced sections of the brief in section order, each with its recorded count. */
function replacedSectionCounts(
  brief: ColorSystemBuilderBriefV2
): { section: ColorSystemReplaceableSectionRoleV2; count: number }[] {
  const replaced = brief.replacedColors ?? [];
  return REPLACED_SECTION_ORDER.map(section => ({
    section,
    count: replaced.filter(color => color.section === section).length,
  })).filter(entry => entry.count > 0);
}

/** p5-A: “22 recorded Secondary colors and 6 recorded chart colors”, or null when nothing was replaced. */
function replacedCountsPhrase(brief: ColorSystemBuilderBriefV2): string | null {
  const parts = replacedSectionCounts(brief).map(
    entry =>
      `${entry.count} ${REPLACED_SECTION_NOUNS[entry.section]} ${entry.count === 1 ? 'color' : 'colors'}`
  );
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * p5-A. The brief's replaced colors, listed so nothing disappears silently: one
 * sentence per replaced section with the count, and every recorded value by name,
 * mode and exact hex. Absent when the plan replaced nothing.
 */
function reviewReplaced(
  brief: ColorSystemBuilderBriefV2,
  modes: readonly string[]
): ColorSystemReviewReplacedV2 | null {
  const counts = replacedSectionCounts(brief);
  if (counts.length === 0) return null;
  return {
    statements: counts.map(
      entry =>
        `${REPLACED_SECTION_LABELS[entry.section]}: replaced; ${entry.count} recorded ${entry.count === 1 ? 'color is' : 'colors are'} not carried into the new system.`
    ),
    colors: (brief.replacedColors ?? []).flatMap(color =>
      Object.entries(color.hexByMode)
        .filter(([mode]) => modes.includes(mode))
        .map(([mode, hex]) => ({
          id: color.stableColorId,
          name: color.displayName,
          section: color.section,
          mode,
          hex,
        }))
    ),
  };
}

/**
 * p3-H. The candidate carries the brief's skipped status reserves; each becomes
 * one sentence a designer can act on: which role, which hue, what it collided
 * with (by name and value) or which limit dropped it, and what the role does instead.
 */
function reviewSkippedStatusReserves(
  candidate: ColorSystemStrategyCandidateV2
): ColorSystemReviewSkippedStatusReserveV2[] {
  return (candidate.skippedStatusReserves ?? []).map(entry => {
    const hue = `${Math.round(entry.hue)}°`;
    const article = /^[aeiou]/.test(entry.role) ? 'An' : 'A';
    const statement =
      entry.cause === 'separation'
        ? `${article} ${entry.role} reserve at hue ${hue} was skipped: it sits ${entry.deltaEOK.toFixed(2)} ΔEOK from ${entry.nearestDisplayName} (${entry.nearestHex}), inside the ${COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3} separation rule, so ${entry.role} falls back to the nearest brand hue.`
        : `${article} ${entry.role} reserve at hue ${hue} was dropped at the family limit: your owned hues and the neutral ramp come first, so ${entry.role} falls back to the nearest brand hue.`;
    return {
      role: entry.role,
      hue: entry.hue,
      realizedHex: entry.realizedHex,
      nearestHex: entry.nearestHex,
      nearestName: entry.nearestDisplayName,
      deltaEOK: entry.deltaEOK,
      cause: entry.cause,
      statement,
    };
  });
}

function reviewFamilyName(displayName: string): string {
  return displayName
    .replace(/\s+—\s+(?:close-harmony|balanced-contrast|wide-spectrum)$/i, '')
    .trim();
}

function valueForRef(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  ref: ColorSystemApplicationColorRefV2
): {
  id: string;
  name: string;
  mode: string;
  value: ColorSystemColorValueV2;
  jobs: ColorSystemJobV2[];
} {
  if (ref.kind === 'preserved-source-color') {
    const source = brief.preservedColors.find(color => color.stableColorId === ref.stableColorId);
    const value = source?.valuesByMode[ref.mode];
    if (!source || !value) throw new Error('Review model contains an unresolved preserved color.');
    return {
      id: source.stableColorId,
      name: source.displayName,
      mode: ref.mode,
      value,
      jobs: brief.sections.find(section => section.role === source.section)?.jobs.slice() ?? [],
    };
  }
  const family = candidate.families.find(item => item.stableFamilyId === ref.ref.familyId);
  const member = family?.members.find(item => item.stableMemberId === ref.ref.memberId);
  const value = member?.valuesByMode[ref.ref.mode];
  if (!family || !member || !value)
    throw new Error('Review model contains an unresolved suggestion.');
  const eligibility = candidate.jobEligibility.find(
    item => canonicalJson(item.ref) === canonicalJson(ref.ref)
  );
  return {
    id: member.stableMemberId,
    name: `${reviewFamilyName(family.displayName)} / ${member.displayName}`,
    mode: ref.ref.mode,
    value,
    jobs: eligibility?.jobs.slice() ?? [],
  };
}

function reviewColor(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  ref: ColorSystemApplicationColorRefV2
): ColorSystemReviewColorV2 {
  const resolved = valueForRef(brief, candidate, ref);
  return {
    id: resolved.id,
    name: resolved.name,
    mode: resolved.mode,
    hex: resolved.value.hex,
    alpha: resolved.value.alpha,
    ...(resolved.value.representation ? { nativeValue: resolved.value } : {}),
    origin: ref.kind === 'preserved-source-color' ? 'existing' : 'suggested',
    jobs: resolved.jobs,
  };
}

function dispositionLabel(disposition: ColorSystemSectionDispositionV2): string {
  if (disposition === 'preserve') return 'Kept exactly as supplied';
  if (disposition === 'rebuild') return 'New recommendation';
  if (disposition === 'derive') return 'Built from the recommended Secondary';
  return 'Intentionally omitted';
}

function jobLabel(job: ColorSystemJobV2): string {
  const labels: Record<ColorSystemJobV2, string> = {
    'brand-primary': 'brand Primary',
    'marketing-accent': 'marketing accents',
    'product-graphics': 'product graphics',
    'functional-iconography': 'functional iconography',
    'product-ui-surface': 'product UI surfaces',
    'product-semantics': 'product semantic roles',
    'categorical-data': 'categorical data',
    'sequential-data': 'sequential data',
    'diverging-data': 'diverging data',
    'rendered-text-pair': 'rendered text pairs',
  };
  return labels[job];
}

function sectionBoundary(
  boundary: ColorSystemSectionBlueprintV2['frames'][number]['cardBoundary']
): ColorSystemReviewSectionV2['cardBoundary'] {
  if (boundary.kind === 'none') return 'none';
  return boundary.color === '#000000' ? 'black-inside-1px' : 'white-inside-1px';
}

function approvedFamilyId(ref: ColorSystemApplicationColorRefV2): string | null {
  return ref.kind === 'approved-family-member' ? ref.ref.familyId : null;
}

function applicationJobsForFamily(
  application: ColorSystemApplicationSystemBlueprintV2,
  familyId: string
): ColorSystemJobV2[] {
  const jobs = new Set<ColorSystemJobV2>();
  const productJob: Readonly<Record<string, ColorSystemJobV2>> = {
    'product-graphic': 'product-graphics',
    'functional-iconography': 'functional-iconography',
    'product-ui-surface': 'product-ui-surface',
  };
  for (const specimen of application.productGraphics) {
    if (specimen.sourceRefs.some(ref => ref.familyId === familyId)) {
      const job = productJob[specimen.job];
      if (job) jobs.add(job);
    }
  }
  if (application.productSemantics.some(role => approvedFamilyId(role.ref) === familyId)) {
    jobs.add('product-semantics');
  }
  const visualizationJobs = [
    ['categorical-data', application.visualization.categorical.marks],
    ['sequential-data', application.visualization.sequential?.marks ?? []],
    ['diverging-data', application.visualization.diverging?.marks ?? []],
  ] as const;
  for (const [job, marks] of visualizationJobs) {
    if (marks.some(mark => approvedFamilyId(mark.ref) === familyId)) jobs.add(job);
  }
  return [...jobs].sort(compareText);
}

const MEANING_HUE_LABELS: Readonly<Record<ColorSystemSemanticHueRangeRoleV2, string>> = {
  success: 'green',
  warning: 'amber',
  error: 'red',
  destructive: 'red',
  information: 'blue',
};

const STATUS_RESERVE_ROLES = [
  'success',
  'warning',
  'error',
  'information',
] as const satisfies readonly ColorSystemReviewStatusReserveRoleV2[];

/** p3-B: the status range a planner reserve's anchor sits in; null for any other family. */
function statusReserveRole(
  family: ColorSystemStrategyCandidateV2['families'][number]
): ColorSystemReviewStatusReserveRoleV2 | null {
  if (!isColorSystemStatusReserveFamilyV2(family)) return null;
  const oklch = hexToOklch(colorSystemFamilyAnchorHexV2(family));
  const hue = oklch.c < 1e-6 ? 0 : oklch.h;
  return (
    STATUS_RESERVE_ROLES.find(role =>
      colorSystemHueWithinRangeV2(hue, COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2[role])
    ) ?? null
  );
}

function familyReview(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewFamilyV2[] {
  const readings = candidateReadings(brief, candidate, application.modes);
  return candidate.families.map(family => {
    const name = reviewFamilyName(family.displayName);
    const reading = readings.byFamilyId.get(family.stableFamilyId);
    if (!reading) throw new Error(`Review model could not read family ${family.stableFamilyId}.`);
    const eligibility = candidate.jobEligibility.filter(
      entry =>
        entry.ref.familyId === family.stableFamilyId && application.modes.includes(entry.ref.mode)
    );
    const jobs = applicationJobsForFamily(application, family.stableFamilyId);
    // p3-H: a pinned value is an existing recorded color, not a suggestion.
    const pinnedMembers = (family.pinnedMembers ?? []).filter(pin =>
      application.modes.includes(pin.mode)
    );
    const pinSkips = (family.pinSkips ?? []).filter(skip => application.modes.includes(skip.mode));
    const isPinned = (memberId: string, mode: string) =>
      pinnedMembers.some(pin => pin.stableMemberId === memberId && pin.mode === mode);
    const colors = family.members.flatMap(member =>
      Object.entries(member.valuesByMode)
        .filter(([mode]) => application.modes.includes(mode))
        .sort(([left], [right]) => compareText(left, right))
        .map(([mode, value]) => ({
          id: member.stableMemberId,
          name: member.displayName,
          mode,
          hex: value.hex,
          alpha: value.alpha,
          ...(value.representation ? { nativeValue: value } : {}),
          origin: isPinned(member.stableMemberId, mode)
            ? ('existing' as const)
            : ('suggested' as const),
          jobs:
            eligibility.find(
              entry => entry.ref.memberId === member.stableMemberId && entry.ref.mode === mode
            )?.jobs ?? [],
        }))
    );
    const pinSentences = [
      ...pinnedMembers.map(
        pin => `${pin.mode} step ${pin.step} is your exact ${pin.sourceDisplayName} (${pin.hex}).`
      ),
      ...pinSkips.map(
        skip =>
          `${skip.sourceDisplayName} (${skip.hex}) stays an exact source token but is not a step of this scale${
            skip.nearestStep === null ? '' : ` (nearest step ${skip.nearestStep})`
          }: ${skip.reason}`
      ),
    ];
    const intendedUses = jobs.map(jobLabel);
    const useList =
      intendedUses.length === 0
        ? 'the reviewed supporting uses'
        : intendedUses.length === 1
          ? intendedUses[0]
          : intendedUses.length === 2
            ? `${intendedUses[0]} and ${intendedUses[1]}`
            : `${intendedUses.slice(0, -1).join(', ')}, and ${intendedUses[intendedUses.length - 1]}`;
    const statusReserve = statusReserveRole(family);
    const reservePrefix = statusReserve
      ? `Status reserve for ${statusReserve}: a conventional ${MEANING_HUE_LABELS[statusReserve]} family added because your palette owns no hue in the ${MEANING_HUE_LABELS[statusReserve]} range (${COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2[statusReserve].minimum}–${COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2[statusReserve].maximum}°). `
      : '';
    return {
      id: family.stableFamilyId,
      name,
      prominence: family.brandFit.prominence,
      reason: `${reservePrefix}${describeColorSystemSecondaryFamilyV3(reading, {
        strategyKind: readings.kind,
        heroLightnessClass: readings.heroLightnessClass,
      })} ${
        jobs.length > 0
          ? `This direction uses it for ${useList}.`
          : 'It remains a reserve family and is not used by the generated examples in this direction.'
      }${pinSentences.length > 0 ? ` ${pinSentences.join(' ')}` : ''}`,
      jobs,
      colors,
      kind: reading.kind,
      anchorHex: familyAnchorValue(family, application.modes).hex,
      ...(statusReserve ? { statusReserve } : {}),
      ...(pinnedMembers.length > 0
        ? {
            pinnedMembers: pinnedMembers.map(pin => ({
              memberId: pin.stableMemberId,
              step: pin.step,
              mode: pin.mode,
              sourceName: pin.sourceDisplayName,
              hex: pin.hex,
            })),
          }
        : {}),
      ...(pinSkips.length > 0
        ? {
            pinSkips: pinSkips.map(skip => ({
              sourceName: skip.sourceDisplayName,
              hex: skip.hex,
              mode: skip.mode,
              nearestStep: skip.nearestStep,
              reason: skip.reason,
            })),
          }
        : {}),
    };
  });
}

function reviewRating(rating: ColorSystemSectionRatingV2): ColorSystemSectionRatingV2 {
  let omittedEvidenceCount = 0;
  const dimensions = rating.dimensions.map(dimension => {
    const evidenceIds = [...new Set(dimension.evidenceIds)].sort(compareText);
    omittedEvidenceCount += Math.max(
      0,
      evidenceIds.length - COLOR_SYSTEM_REVIEW_EVIDENCE_ID_LIMIT_V2
    );
    const isFraction = dimension.unit === 'fraction';
    const labelById: Readonly<Record<string, string>> = {
      'secondary-job-eligibility-coverage': 'Required Secondary uses covered',
      'product-graphics-context-pass': 'Product-graphics examples passing or exempt',
      'data-visualization-policy-coverage': 'Chart types included',
      'data-visualization-cvd-advisory':
        'Modeled color-vision separation checks passing (advisory)',
      'typography-rendered-pair-pass': 'Rendered text pairs passing WCAG checks',
    };
    return {
      ...dimension,
      label: labelById[dimension.id] ?? dimension.label.replace(/\bCVD\b/g, 'color-vision'),
      measuredValue: isFraction ? dimension.measuredValue * 100 : dimension.measuredValue,
      ...(dimension.threshold === undefined
        ? {}
        : { threshold: isFraction ? dimension.threshold * 100 : dimension.threshold }),
      unit: isFraction
        ? 'percent'
        : dimension.unit === 'chart-kinds'
          ? 'chart types'
          : dimension.unit,
      evidenceIds: evidenceIds.slice(0, COLOR_SYSTEM_REVIEW_EVIDENCE_ID_LIMIT_V2),
    };
  });
  const limitation = rating.limitation
    .replace(
      'Eligibility is member-and-mode specific and does not imply every context passes.',
      'Coverage means at least one reviewed color supports each required use; individual contexts still need their own checks.'
    )
    .replace(
      'CVD simulation is advisory evidence and is not a colorblind-safe claim.',
      'Modeled color-vision separation is advisory evidence; it does not prove that a palette is safe for every person or viewing condition.'
    );
  return {
    ...rating,
    dimensions,
    limitation:
      omittedEvidenceCount > 0
        ? `${limitation} This review summarizes the evidence references; the immutable application blueprint retains all ${omittedEvidenceCount + dimensions.reduce((sum, dimension) => sum + dimension.evidenceIds.length, 0)} references.`
        : limitation,
  };
}

function reviewVisualizationSpecimens(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewVisualizationSpecimensV2 {
  const common = <
    T extends NonNullable<
      | ColorSystemApplicationSystemBlueprintV2['visualization']['categorical']
      | ColorSystemApplicationSystemBlueprintV2['visualization']['sequential']
      | ColorSystemApplicationSystemBlueprintV2['visualization']['diverging']
    >,
  >(
    selection: T
  ) => ({
    selectionId: selection.selectionId,
    marks: selection.marks.map(mark => ({
      order: mark.order,
      label: mark.label,
      color: reviewColor(brief, candidate, mark.ref),
      renderedHex: mark.renderedHex,
    })),
    surface: reviewColor(brief, candidate, selection.surface),
    evidenceIds: selection.evidenceIds.slice(),
  });
  const categorical = application.visualization.categorical;
  const sequential = application.visualization.sequential;
  const diverging = application.visualization.diverging;
  const capacity = categoricalCapacity(application);
  return {
    ...(capacity.length > 0 ? { categoricalCapacity: capacity } : {}),
    categorical: {
      ...common(categorical),
      kind: 'categorical',
      adjacency: categorical.adjacency,
      boundary:
        categorical.boundary === null ? null : reviewColor(brief, candidate, categorical.boundary),
      directLabels: categorical.directLabels,
      nonColorCue: categorical.nonColorCue,
    },
    sequential:
      sequential === null
        ? null
        : {
            ...common(sequential),
            kind: 'sequential',
            direction: sequential.direction,
            axisLabel: sequential.axisLabel,
            endpointLabels: [sequential.endpointLabels[0], sequential.endpointLabels[1]],
            nonColorCue: sequential.nonColorCue,
          },
    diverging:
      diverging === null
        ? null
        : {
            ...common(diverging),
            kind: 'diverging',
            midpointOrder: diverging.midpointOrder,
            midpointMeaning: diverging.midpointMeaning,
            midpointPolarity: diverging.midpointPolarity,
            zeroReferenceLine: diverging.zeroReferenceLine,
            negativeLabel: diverging.negativeLabel,
            positiveLabel: diverging.positiveLabel,
            nonColorCue: diverging.nonColorCue,
          },
  };
}

function reviewProductGraphicsSpecimens(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewProductGraphicsSpecimenV2[] {
  return application.productGraphics.map(specimen => {
    let rendering: ColorSystemReviewProductGraphicsRenderingV1 | null = null;
    let renderingLimitation: string | null = null;
    try {
      const plan = getColorSystemProductGraphicsRenderingV1(specimen, application.pairEvidence);
      rendering = {
        ...plan,
        uses: plan.uses.map(({ ref, ...use }) => ({
          ...use,
          color: reviewColor(brief, candidate, ref),
        })),
        pairs: plan.pairs.map(pair => {
          const evidence = application.pairEvidence.find(
            evidence => evidence.context.id === pair.pairEvidenceId
          );
          if (!evidence) throw new Error('Graphic rendering lost an exact pair receipt.');
          return {
            ...pair,
            contrast: {
              ratio: evidence.ratio,
              requiredRatio: evidence.requiredRatio,
              status: evidence.status,
              limitation: evidence.limitation,
              apcaLc: evidence.apcaLc,
            },
          };
        }),
      };
      if (plan.provenance === 'legacy-pair-only')
        renderingLimitation =
          'Exact legacy pair display only; source-specific spatial permission is unassessed.';
    } catch (error) {
      if (specimen.rendering) throw error;
      renderingLimitation =
        error instanceof Error ? error.message : 'No unambiguous graphic rendering context.';
    }
    const selected = specimen.colors[0]?.ref;
    const pairEvidence = application.pairEvidence.find(
      evidence =>
        specimen.pairEvidenceIds.includes(evidence.context.id) &&
        evidence.context.category === 'non-text' &&
        canonicalJson(evidence.context.foreground) === canonicalJson(selected)
    );
    return {
      derivationId: specimen.derivationId,
      job: specimen.job,
      order: specimen.order,
      mode: specimen.mode,
      intendedUse: specimen.intendedUse,
      excludedUses: specimen.excludedUses.slice(),
      assessment: specimen.assessment,
      colors: specimen.colors.map(colorUse => ({
        ...reviewColor(brief, candidate, colorUse.ref),
        hex: colorUse.appliedValue.hex,
        alpha: colorUse.appliedValue.alpha,
        ...(colorUse.appliedValue.representation ? { nativeValue: colorUse.appliedValue } : {}),
      })),
      surface: pairEvidence ? reviewColor(brief, candidate, pairEvidence.context.background) : null,
      underlay:
        pairEvidence?.context.underlay === null || pairEvidence === undefined
          ? null
          : reviewColor(brief, candidate, pairEvidence.context.underlay),
      contrast: pairEvidence
        ? {
            ratio: pairEvidence.ratio,
            requiredRatio: pairEvidence.requiredRatio,
            status: pairEvidence.status,
            limitation: pairEvidence.limitation,
            apcaLc: pairEvidence.apcaLc,
          }
        : null,
      accessibilityStatus: specimen.accessibilityStatus,
      nonColorCue: specimen.nonColorCue,
      pairEvidenceIds: specimen.pairEvidenceIds.slice(),
      evidenceIds: specimen.evidenceIds.slice(),
      rendering,
      renderingLimitation,
    };
  });
}

function reviewSectionGuidance(
  role: ColorSystemSectionRoleV2,
  original: string,
  candidate: ColorSystemStrategyCandidateV2
): string {
  if (role !== 'secondary') return original;
  return `${candidate.actualFamilyCount} supporting color families are proposed alongside the unchanged Primary palette. Review their Light and Dark ranges and intended uses; this Teul recommendation still requires brand-owner approval.`;
}

function refMode(ref: ColorSystemApplicationColorRefV2): string {
  return ref.kind === 'preserved-source-color' ? ref.mode : ref.ref.mode;
}

/**
 * The adaptive categorical composer may report how many marks it was asked for
 * and how many it could separate, per mode. Those fields are optional on the
 * blueprint, so they are read structurally and omitted when absent.
 */
function categoricalCapacity(
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewCategoricalCapacityV2[] {
  const selections: readonly ColorSystemCategoricalSelectionV2[] = [
    application.visualization.categorical,
    ...application.additionalCategorical,
  ];
  return selections.flatMap(selection => {
    const reported = selection as ColorSystemCategoricalSelectionV2 & {
      requestedMarkCount?: unknown;
      achievedMarkCount?: unknown;
      limitation?: unknown;
    };
    const requested = reported.requestedMarkCount;
    const achieved = reported.achievedMarkCount;
    if (typeof requested !== 'number' || typeof achieved !== 'number') return [];
    if (!Number.isInteger(requested) || !Number.isInteger(achieved)) return [];
    return [
      {
        mode: refMode(selection.surface),
        requestedMarkCount: requested,
        achievedMarkCount: achieved,
        limitation:
          typeof reported.limitation === 'string' && reported.limitation.trim().length > 0
            ? reported.limitation
            : null,
      },
    ];
  });
}

function reviewTextPairs(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewTextPairV2[] {
  return application.typography.map(specimen => {
    const evidence = application.pairEvidence.find(
      item => item.context.id === specimen.pairEvidenceId
    );
    return {
      id: specimen.specimenId,
      useCategory: specimen.useCategory,
      mode: specimen.mode,
      foreground: reviewColor(brief, candidate, specimen.foreground),
      background: reviewColor(brief, candidate, specimen.background),
      ratio: specimen.ratio,
      threshold: specimen.threshold,
      status: specimen.status,
      apcaLc: evidence?.apcaLc ?? null,
    };
  });
}

function firstModeHex(
  valuesByMode: Readonly<Record<string, { hex: string }>>,
  modes: readonly string[]
): string | null {
  const mode = orderModes(modes).find(mode => valuesByMode[mode]);
  return mode ? valuesByMode[mode].hex : null;
}

/** Mean ΔEOK from each anchor to its nearest governed source anchor; null without sources. */
/**
 * p3-I: one measure shared with the orchestrator, so the Why block and the
 * recommendation evidence agree. Preserved Secondary colors and pinned tints are
 * source anchors; see colorSystemSourceContinuityDeltaEOKV2.
 */
function sourceContinuity(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2
): number | null {
  return colorSystemSourceContinuityDeltaEOKV2(brief, candidate);
}

function measured(value: number): string {
  return value.toFixed(3);
}

/** p3-B: the sentence the Why block prints for one meaning role, from its recorded source. */
function meaningSourceStatement(
  item: ColorSystemSemanticMeaningEvidenceV2,
  familyName: string
): string {
  const rangeRole: ColorSystemSemanticHueRangeRoleV2 | null =
    item.role === 'link'
      ? 'information'
      : item.role in MEANING_HUE_LABELS
        ? (item.role as ColorSystemSemanticHueRangeRoleV2)
        : null;
  const hue = rangeRole ? MEANING_HUE_LABELS[rangeRole] : null;
  const ranged = item.targetHueRange !== null && hue !== null;
  switch (item.meaningSource) {
    case 'reserve':
      return `${item.role}: conventional ${hue ?? 'status'} added because your palette has none.`;
    case 'brand':
      return ranged
        ? `${item.role}: your brand-derived ${hue} family “${familyName}”.`
        : `${item.role}: follows your brand family “${familyName}”.`;
    case 'generated':
      return ranged
        ? `${item.role}: the generated ${hue} family “${familyName}”.`
        : `${item.role}: follows the generated family “${familyName}”.`;
    case 'nearest':
      return `${item.role}: no family in the ${hue ?? 'meaning'} range; nearest hue “${familyName}” used (see warning).`;
  }
}

/** p3-B: one entry per recorded meaning role and mode, in the blueprint's order. */
function meaningSources(
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewMeaningSourceV2[] {
  const names = new Map(
    candidate.families.map(family => [family.stableFamilyId, reviewFamilyName(family.displayName)])
  );
  return application.semanticMeaning.map(item => {
    const family = names.get(item.familyId) ?? item.familyId;
    return {
      role: item.role,
      mode: item.mode,
      source: item.meaningSource,
      family,
      statement: meaningSourceStatement(item, family),
    };
  });
}

/**
 * The same measurements the orchestrator ranks directions on, computed here
 * for every direction so the review can print them; the orchestrator's own
 * evidence stays authoritative and a test pins the two against each other.
 */
function reviewWhy(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewWhyV2 {
  const separation = candidate.measures.find(
    measure => measure.id === 'minimum-family-anchor-separation'
  );
  const requiredPairs = application.pairEvidence.filter(
    evidence => evidence.context.assessment === 'required'
  );
  const rangedRoles = application.semanticMeaning.filter(item => item.targetHueRange !== null);
  const chartSelections = [
    application.visualization.categorical,
    ...(application.visualization.diverging ? [application.visualization.diverging] : []),
    ...application.additionalCategorical,
  ];
  const chartMinimum = (
    pick: (advisory: ColorSystemCategoricalSelectionV2['cvdAdvisory']) => number
  ) => Math.min(...chartSelections.map(selection => pick(selection.cvdAdvisory)));
  const chartSeparation = {
    normal: chartMinimum(advisory => advisory.normal),
    protan: chartMinimum(advisory => advisory.protan),
    deutan: chartMinimum(advisory => advisory.deutan),
    tritan: chartMinimum(advisory => advisory.severeTritan),
  };
  const requiredPairsPassing = requiredPairs.filter(evidence => evidence.status === 'pass').length;
  const meaningRolesInRange = rangedRoles.filter(item => item.inRange).length;
  const coefficientOfVariation =
    application.visualization.sequential?.perceptualEvidence
      .adjacentDeltaEOKCoefficientOfVariation ?? null;
  const anchors = colorSystemMeanAnchorSeparationDeltaEOKV2(candidate);
  const continuity = sourceContinuity(brief, candidate);
  const minimumChartSeparation = Math.min(
    chartSeparation.normal,
    chartSeparation.protan,
    chartSeparation.deutan,
    chartSeparation.tritan
  );
  return {
    familyAnchorSeparation: {
      minimum: separation?.measuredValue ?? null,
      threshold: separation?.threshold ?? COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3,
    },
    meanSourceAdjustment: measureValue(candidate, 'mean-source-adjustment'),
    gamutMappedSteps: measureValue(candidate, 'gamut-mapped-mode-steps'),
    requiredPairs: { passing: requiredPairsPassing, total: requiredPairs.length },
    meaningRoles: { inRange: meaningRolesInRange, total: rangedRoles.length },
    sequentialAdjacentCoefficientOfVariation: coefficientOfVariation,
    chartSeparation: {
      minimum: minimumChartSeparation,
      threshold: COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK,
      ...chartSeparation,
    },
    meanAnchorSeparation: anchors,
    sourceContinuity: continuity,
    // p3-I: whose grounds the surfaces are, and whether the chart order is recorded.
    surfaces: colorSystemReviewSurfacesFactV2(brief, application),
    chartOrder: colorSystemReviewChartOrderFactV2(application),
    meaningSources: meaningSources(candidate, application),
    ...(candidate.skippedStatusReserves && candidate.skippedStatusReserves.length > 0
      ? { skippedStatusReserves: reviewSkippedStatusReserves(candidate) }
      : {}),
    basisStatements: [
      `${requiredPairsPassing} of ${requiredPairs.length} required pairs pass.`,
      `${meaningRolesInRange} of ${rangedRoles.length} meaning roles sit inside their hue range.`,
      `Minimum modeled chart separation ${measured(minimumChartSeparation)} Delta E OK.`,
      coefficientOfVariation === null
        ? 'Sequential chart not requested; the source chart palette is kept.'
        : `Sequential adjacent-step variation ${measured(coefficientOfVariation)} (coefficient of variation; lower is more even).`,
      `Mean anchor separation ${measured(anchors)} Delta E OK across ${candidate.families.length} families.`,
      continuity === null
        ? 'No governed source anchors are available to measure continuity.'
        : `Mean distance from source anchors ${measured(continuity)} Delta E OK (lower keeps closer to the reviewed source).`,
      'These are this direction’s own measurements. Teul’s recommendation ranks every direction on them; it is not owner acceptance.',
    ],
  };
}

function hexFromRgb(rgb: RGB): string {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return normalizeColorSystemSecondaryHexV3(
    rgbToHex(channel(rgb.r), channel(rgb.g), channel(rgb.b))
  );
}

/** Every job the direction reaches: brief sections, required Secondary jobs, and member eligibility. */
function directionJobs(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  modes: readonly string[]
): ColorSystemJobV2[] {
  const jobs = new Set<ColorSystemJobV2>();
  for (const section of brief.sections) for (const job of section.jobs) jobs.add(job);
  for (const job of candidate.requiredJobs) jobs.add(job);
  for (const entry of candidate.jobEligibility)
    if (modes.includes(entry.ref.mode)) for (const job of entry.jobs) jobs.add(job);
  return [...jobs].sort(compareText);
}

/** Jobs a family may serve (eligibility) plus the jobs this direction actually applies it to. */
function familySurfaceJobs(
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2,
  familyId: string
): ColorSystemJobV2[] {
  const jobs = new Set<ColorSystemJobV2>(applicationJobsForFamily(application, familyId));
  for (const entry of candidate.jobEligibility) {
    if (entry.ref.familyId === familyId && application.modes.includes(entry.ref.mode))
      for (const job of entry.jobs) jobs.add(job);
  }
  return [...jobs].sort(compareText);
}

/**
 * p3-B: the hero-discipline input. The hero is the composer's brand family
 * (anchor hue within tolerance of the Primary) and the locked Primary itself;
 * every product role binding names the family or preserved color it resolves to.
 */
function heroDisciplineInput(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2,
  familyColors: readonly { id: string; hex: string; role: string }[]
): { colors: HeroDisciplineColorV3[]; bindings: HeroDisciplineBindingV3[] } {
  const brandFamilyId = colorSystemBrandFamilyIdV2(brief, candidate);
  const primaryIds = new Set([
    ...brief.primaryLocks.map(lock => lock.stableColorId),
    ...brief.preservedColors
      .filter(color => color.section === 'primary')
      .map(color => color.stableColorId),
  ]);
  const colors: HeroDisciplineColorV3[] = familyColors.map(color => ({
    id: color.id,
    hex: color.hex,
    role: color.role,
    hero: color.id === brandFamilyId,
    jobs: familySurfaceJobs(candidate, application, color.id),
  }));
  const seen = new Set(colors.map(color => color.id));
  const bindings: HeroDisciplineBindingV3[] = [];
  for (const role of application.productSemantics) {
    if (role.ref.kind === 'approved-family-member') {
      bindings.push({ role: role.role, mode: role.mode, colorId: role.ref.ref.familyId });
      continue;
    }
    const stableColorId = role.ref.stableColorId;
    bindings.push({ role: role.role, mode: role.mode, colorId: stableColorId });
    if (seen.has(stableColorId)) continue;
    const preserved = brief.preservedColors.find(color => color.stableColorId === stableColorId);
    if (!preserved) continue;
    seen.add(stableColorId);
    colors.push({
      id: stableColorId,
      hex: normalizeColorSystemSecondaryHexV3(
        firstModeHex(preserved.valuesByMode, application.modes) ?? role.resolved.value.hex
      ),
      role: preserved.displayName,
      hero: primaryIds.has(stableColorId),
      jobs: brief.sections.find(section => section.role === preserved.section)?.jobs ?? [],
    });
  }
  return { colors, bindings };
}

/**
 * Runs the surface advisories for the direction: every family anchor with the
 * direction's jobs, plus the rendered typography pairs for the out-of-home
 * text check. No spot color is ever supplied here, so every triplet is
 * screen-canonical and says so.
 */
function reviewBrandSurfaces(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewBrandSurfacesV2 {
  const colors = candidate.families.map(family => ({
    id: family.stableFamilyId,
    hex: familyAnchorValue(family, application.modes).hex,
    role: reviewFamilyName(family.displayName),
  }));
  // One out-of-home check per distinct rendered pair; specimens that share the
  // same foreground and background hexes would otherwise repeat the same advisory.
  const seenPairs = new Set<string>();
  const textPairs = application.typography.flatMap(specimen => {
    const evidence = application.pairEvidence.find(
      item => item.context.id === specimen.pairEvidenceId
    );
    if (!evidence?.renderedForeground || !evidence.renderedBackground) return [];
    const foregroundHex = hexFromRgb(evidence.renderedForeground);
    const backgroundHex = hexFromRgb(evidence.renderedBackground);
    const key = `${foregroundHex}:${backgroundHex}`;
    if (seenPairs.has(key)) return [];
    seenPairs.add(key);
    return [{ id: evidence.context.id, foregroundHex, backgroundHex }];
  });
  const result = buildSurfaceAdvisoriesV3({
    jobs: directionJobs(brief, candidate, application.modes),
    colors,
    textPairs,
    heroDiscipline: heroDisciplineInput(brief, candidate, application, colors),
  });
  return {
    version: result.version,
    surfaces: result.surfaces,
    families: candidate.families.map((family, index) => ({
      id: family.stableFamilyId,
      name: colors[index].role,
      hex: colors[index].hex,
      surfaces: surfacesForJobs(familySurfaceJobs(candidate, application, family.stableFamilyId)),
    })),
    advisories: result.advisories.map(advisory => ({
      id: advisory.id,
      surface: advisory.surface,
      severity: advisory.severity,
      code: advisory.code,
      message: advisory.message,
    })),
    printTriplets: result.surfaces.includes('print')
      ? colors.map(color => {
          const triplet = printTriplet(color.hex);
          return {
            colorId: color.id,
            name: color.role,
            screenHex: triplet.screen.hex,
            cmyk: {
              c: triplet.cmyk.c,
              m: triplet.cmyk.m,
              y: triplet.cmyk.y,
              k: triplet.cmyk.k,
              totalInk: totalInkCoverage(triplet.cmyk),
            },
            spot: triplet.spot,
            canonical: triplet.canonical,
            note: triplet.note,
          };
        })
      : [],
    cmykDisclaimer: CMYK_UNPROFILED_DISCLAIMER,
  };
}

/**
 * p4-DE: the resolved product roles in blueprint mode order, then declared role
 * order. Each color is read through the same resolver the sections use, so a
 * board built from these shows exactly the value the alias will carry.
 */
function reviewSemanticRoles(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewSemanticRoleV2[] {
  return application.modes.flatMap(mode =>
    COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.flatMap(roleName => {
      const role = application.productSemantics.find(
        item => item.mode === mode && item.role === roleName
      );
      if (!role) return [];
      const color = reviewColor(brief, candidate, role.ref);
      if (color.mode !== mode || color.hex !== role.resolved.value.hex) {
        throw new Error(`Review model resolved ${roleName} in ${mode} to a different value.`);
      }
      return [{ role: roleName, mode, tokenName: `semantic/${roleName}`, color }];
    })
  );
}

// ============================================
// p6: the recommendation view — the system grouped by use
// ============================================

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
] as const;

function numberWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function nonNull(value: string | null): value is string {
  return value !== null;
}

/** “a”, “a and b”, “a, b and c”. */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Clauses that carry their own lists: “a; b; and c”. */
function joinClauses(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join('; ')}; and ${items[items.length - 1]}`;
}

/** “sky and violet”; repeated words are counted: “two yellows and two oranges”. */
function joinHueWords(words: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return joinList(
    [...counts.entries()].map(([word, count]) =>
      count === 1 ? word : `${numberWord(count)} ${word}s`
    )
  );
}

function pluralCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Light first, then Dark, then any other mode by name: the order every card prints. */
function orderModes(modes: Iterable<string>): string[] {
  const priority = (mode: string) => (mode === 'Light' ? 0 : mode === 'Dark' ? 1 : 2);
  return [...new Set(modes)].sort(
    (left, right) => priority(left) - priority(right) || compareText(left, right)
  );
}

// Token slugs mirror the resource blueprint's p3-C naming rules
// (colorSystemResourceBlueprintV2.ts); a test pins the two against each other so
// the paths printed on the review are the paths Create writes.
function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function lastPathSegment(value: string): string {
  const segments = value
    .split('/')
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : value.trim();
}

function nameSlug(value: string, fallback: string): string {
  const slug = slugify(lastPathSegment(value));
  if (slug.length === 0) return fallback;
  return /^[0-9]/.test(slug) ? `${fallback}-${slug}` : slug;
}

function uniqueSlug(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

/** 12-sector OKLCH hue word of a hex, or null for an achromatic color. */
function hueWordOf(hex: string): string | null {
  const oklch = hexToOklch(hex);
  return paletteHueFamilyV3(oklch.h, oklch.c);
}

function memberStep(member: { role: string }): number | null {
  const match = /^step-(\d{1,2})$/.exec(member.role);
  return match ? Number(match[1]) : null;
}

interface FamilyPlainName {
  name: string;
  slug: string;
  hueWord: string | null;
}

/**
 * Plain UI names and token slugs, assigned in the blueprint's naming order.
 * Accents take their hue word (the word `color/<hue>/9` carries), status
 * reserves their role and hue word, the neutral ramp its name; brand-derived
 * families keep the recorded name.
 */
function familyPlainNames(
  candidate: ColorSystemStrategyCandidateV2,
  families: readonly ColorSystemReviewFamilyV2[]
): Map<string, FamilyPlainName> {
  const ordered = [...candidate.families].sort(
    (left, right) =>
      left.order - right.order || compareText(left.stableFamilyId, right.stableFamilyId)
  );
  const used = new Set<string>();
  const names = new Map<string, FamilyPlainName>();
  for (const family of ordered) {
    const review = families.find(item => item.id === family.stableFamilyId);
    const sourceName = reviewFamilyName(family.displayName);
    const hueWord = hueWordOf(review?.anchorHex ?? familyAnchorValue(family).hex);
    let base = nameSlug(sourceName, 'family');
    if (family.contributionId.startsWith(COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2)) {
      base = `status-${
        slugify(
          family.contributionId.slice(COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2.length)
        ) || 'reserve'
      }`;
    } else if (
      colorSystemBrandTerritoryMatchesSourceV1(
        family.brandFit.territoryId,
        COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.neutral,
        family.brandFit.prominence
      )
    ) {
      base = 'neutral';
    } else if (
      colorSystemBrandTerritoryMatchesSourceV1(
        family.brandFit.territoryId,
        COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.accent,
        family.brandFit.prominence
      )
    ) {
      base = hueWord ?? 'accent';
    }
    const slug = uniqueSlug(base, used);
    const ordinal = slug.length > base.length ? ` ${slug.slice(base.length + 1)}` : '';
    const kind = review?.kind;
    const name =
      kind === 'neutral'
        ? 'Neutral ramp'
        : kind === 'reserve'
          ? `${capitalize(review?.statusReserve ?? 'status')}${hueWord ? ` ${hueWord}` : ''}`
          : kind === 'accent'
            ? `${capitalize(hueWord ?? 'new')} accent${ordinal}`
            : sourceName;
    names.set(family.stableFamilyId, { name, slug, hueWord });
  }
  return names;
}

/** “Neutral ramp 2” for a family member; the recorded name for a preserved color. */
function plainColorName(
  color: ColorSystemReviewColorV2,
  families: readonly ColorSystemReviewFamilyV2[],
  names: ReadonlyMap<string, FamilyPlainName>
): string {
  for (const family of families) {
    const inMode = family.colors.filter(item => item.mode === color.mode);
    const index = inMode.findIndex(item => item.id === color.id);
    if (index >= 0) return `${names.get(family.id)?.name ?? family.name} ${index + 1}`;
  }
  return color.name;
}

function colorOrigin(
  color: ColorSystemReviewColorV2,
  families: readonly ColorSystemReviewFamilyV2[]
): ColorSystemReviewSystemOriginV2 {
  if (color.origin === 'existing') return 'kept-exactly';
  const family = families.find(item => item.colors.some(member => member.id === color.id));
  return family?.kind === 'derived' ? 'from-brand' : 'new';
}

interface CardPartInput {
  label: string;
  colors: readonly ColorSystemReviewColorV2[];
}

/**
 * A card from its parts; parts without a color are dropped, and a card with no
 * part is not made. The tag describes the card's own color, its first part
 * (a status fill, not the text set on it), and is omitted when its modes differ.
 */
function cardOf(
  id: string,
  name: string,
  usedFor: string,
  parts: readonly CardPartInput[],
  families: readonly ColorSystemReviewFamilyV2[]
): ColorSystemReviewSystemCardV2 | null {
  const present = parts.filter(part => part.colors.length > 0);
  if (present.length === 0) return null;
  const origins = new Set(present[0].colors.map(color => colorOrigin(color, families)));
  return {
    id,
    name,
    origin: origins.size === 1 ? [...origins][0] : null,
    usedFor,
    parts: present.map(part => {
      const byMode = new Map(part.colors.map(color => [color.mode, color]));
      return {
        label: part.label,
        values: orderModes(byMode.keys()).map(mode => ({
          mode,
          hex: byMode.get(mode)!.hex,
          ...(byMode.get(mode)!.nativeValue ? { nativeValue: byMode.get(mode)!.nativeValue } : {}),
        })),
      };
    }),
  };
}

/** The spec's job-to-use mapping; `categorical-data` becomes the numbered series when the family carries one. */
const JOB_USES: Readonly<Record<ColorSystemJobV2, string | null>> = {
  'marketing-accent': 'marketing highlights',
  'product-graphics': 'product illustrations',
  'functional-iconography': 'icons',
  'product-ui-surface': 'interface surfaces',
  'product-semantics': 'status and interface roles',
  'categorical-data': 'chart series',
  'sequential-data': 'sequential charts',
  'diverging-data': 'diverging charts',
  'brand-primary': null,
  'rendered-text-pair': null,
};
const JOB_USE_ORDER: readonly ColorSystemJobV2[] = [
  'marketing-accent',
  'product-graphics',
  'functional-iconography',
  'product-ui-surface',
  'product-semantics',
  'categorical-data',
  'sequential-data',
  'diverging-data',
];

function familyUsedFor(
  family: ColorSystemReviewFamilyV2,
  categoricalMarks: readonly ColorSystemReviewVisualizationMarkV2[]
): string {
  const memberIds = new Set(family.colors.map(color => color.id));
  const series = categoricalMarks
    .filter(mark => memberIds.has(mark.color.id))
    .map(mark => mark.order);
  const uses = JOB_USE_ORDER.flatMap(job => {
    if (!family.jobs.includes(job)) return [];
    if (job === 'categorical-data' && series.length > 0)
      return [`chart series ${series.join(', ')}`];
    const use = JOB_USES[job];
    return use ? [use] : [];
  });
  return uses.length > 0 ? `${uses.join('; ')}.` : 'no assigned use in this direction.';
}

/** The family's anchor member in every mode: the Light step-9 value's member, else the ninth step. */
function familyAnchorColors(family: ColorSystemReviewFamilyV2): ColorSystemReviewColorV2[] {
  const firstMode = orderModes(family.colors.map(color => color.mode))[0];
  const inMode = family.colors.filter(color => color.mode === firstMode);
  const anchor =
    inMode.find(color => color.hex === family.anchorHex) ?? inMode[Math.min(8, inMode.length - 1)];
  return anchor ? family.colors.filter(color => color.id === anchor.id) : [];
}

interface ProductUiCardSpec {
  id: string;
  name: string;
  usedFor: string;
  parts: readonly {
    label: string;
    role:
      | ColorSystemProductSemanticRoleNameV2
      | 'muted-text'
      | 'selected-hover'
      | 'selected-pressed'
      | 'link-hover'
      | 'link-pressed';
  }[];
}

/** The Product UI cards in the spec's order; a form field is surface + border + focus. */
const PRODUCT_UI_CARDS: readonly ProductUiCardSpec[] = [
  {
    id: 'background',
    name: 'Background',
    usedFor: 'page and app backgrounds.',
    parts: [{ label: 'Background', role: 'background' }],
  },
  {
    id: 'surface',
    name: 'Card surface',
    usedFor: 'cards, panels and sheets.',
    parts: [{ label: 'Surface', role: 'surface' }],
  },
  {
    id: 'text',
    name: 'Text',
    usedFor: 'headlines and body text.',
    parts: [{ label: 'Text', role: 'text' }],
  },
  {
    id: 'muted-text',
    name: 'Muted text',
    usedFor: 'supporting and secondary text.',
    parts: [{ label: 'Muted text', role: 'muted-text' }],
  },
  {
    id: 'disabled',
    name: 'Disabled text',
    usedFor: 'disabled labels and controls.',
    parts: [{ label: 'Disabled', role: 'disabled' }],
  },
  {
    id: 'border',
    name: 'Borders and dividers',
    usedFor: 'borders, dividers and input outlines.',
    parts: [{ label: 'Border', role: 'border' }],
  },
  {
    id: 'primary-button',
    name: 'Primary button',
    usedFor: 'the main action on a screen.',
    parts: [
      { label: 'Fill', role: 'selected' },
      { label: 'Text on it', role: 'on-selected' },
      { label: 'Hover', role: 'selected-hover' },
      { label: 'Pressed', role: 'selected-pressed' },
    ],
  },
  {
    id: 'form-field',
    name: 'Form field',
    usedFor: 'inputs, selects and text areas.',
    parts: [
      { label: 'Background', role: 'surface' },
      { label: 'Border', role: 'border' },
      { label: 'Focus ring', role: 'focus' },
    ],
  },
  {
    id: 'link',
    name: 'Links',
    usedFor: 'inline links.',
    parts: [{ label: 'Link', role: 'link' }],
  },
  {
    id: 'selected',
    name: 'Selected state',
    usedFor: 'selected rows, active tabs and checked controls.',
    parts: [
      { label: 'Fill', role: 'selected' },
      { label: 'Text on it', role: 'on-selected' },
    ],
  },
];

const STATUS_CARD_ROLES = ['success', 'warning', 'error', 'information'] as const;

/**
 * The hover and pressed steps the resource blueprint aliases for `selected`
 * (p3-C): 10 and 11 of the fill's own scale, stepping up when the fill already
 * sits there, and falling back toward the fill until the step keeps 3:1 against
 * the surface and background. Reproduced here so the button card shows the
 * values Create writes; a test pins it to the blueprint's state-token records.
 */
function selectedStateColors(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2,
  families: readonly ColorSystemReviewFamilyV2[],
  stateRole: 'selected' | 'link' = 'selected'
): { hover: ColorSystemReviewColorV2[]; pressed: ColorSystemReviewColorV2[] } {
  const hover: ColorSystemReviewColorV2[] = [];
  const pressed: ColorSystemReviewColorV2[] = [];
  for (const mode of application.modes) {
    const declared = application.interaction?.statePlans.find(
      plan => plan.role === stateRole && plan.mode === mode
    );
    if (declared) {
      hover.push(
        reviewColor(brief, candidate, {
          kind: 'approved-family-member',
          ref: declared.states.hover,
        })
      );
      pressed.push(
        reviewColor(brief, candidate, {
          kind: 'approved-family-member',
          ref: declared.states.pressed,
        })
      );
      continue;
    }
    if (stateRole === 'link') continue;
    const role = application.productSemantics.find(
      item => item.role === 'selected' && item.mode === mode
    );
    const ref = role?.ref;
    if (!ref || ref.kind !== 'approved-family-member') continue;
    const family = candidate.families.find(item => item.stableFamilyId === ref.ref.familyId);
    const reviewFamily = families.find(item => item.id === ref.ref.familyId);
    const base = family?.members.find(member => member.stableMemberId === ref.ref.memberId);
    const baseStep = base ? memberStep(base) : null;
    if (!family || !reviewFamily || baseStep === null) continue;
    const surfaces = (['surface', 'background'] as const).flatMap(surfaceRole => {
      const entry = application.productSemantics.find(
        item => item.role === surfaceRole && item.mode === mode
      );
      return entry ? [reviewColor(brief, candidate, entry.ref).hex] : [];
    });
    const memberAt = (step: number) => family.members.find(item => memberStep(item) === step);
    const choose = (preferred: number): number => {
      let fallback: number | null = null;
      for (let step = preferred; step >= Math.max(baseStep, 9); step -= 1) {
        const hex = memberAt(step)?.valuesByMode[mode]?.hex;
        if (!hex) continue;
        const contrast =
          surfaces.length === 0
            ? null
            : Math.round(
                Math.min(...surfaces.map(surface => getWCAGContrastHex(hex, surface))) * 100
              ) / 100;
        if (contrast === null || contrast >= 3) return step;
        fallback ??= step;
      }
      return fallback ?? preferred;
    };
    const stepped = baseStep >= 10;
    const stateColor = (step: number) => {
      const member = memberAt(step);
      return member
        ? (reviewFamily.colors.find(
            color => color.id === member.stableMemberId && color.mode === mode
          ) ?? null)
        : null;
    };
    const hoverColor = stateColor(choose(stepped ? Math.min(baseStep + 1, 12) : 10));
    const pressedColor = stateColor(choose(stepped ? Math.min(baseStep + 2, 12) : 11));
    if (hoverColor) hover.push(hoverColor);
    if (pressedColor) pressed.push(pressedColor);
  }
  return { hover, pressed };
}

/** Groups modes that fell short by the same amount: “Three of five series are distinguishable in Light and Dark.” */
function chartCapacitySentence(
  capacity: readonly ColorSystemReviewCategoricalCapacityV2[] | undefined
): string | null {
  const groups = capacityGroups(capacity);
  if (groups.length === 0) return null;
  return groups
    .map(
      group =>
        `${capitalize(numberWord(group.achieved))} of ${numberWord(group.requested)} series ${
          group.achieved === 1 ? 'is' : 'are'
        } distinguishable in ${orderModes(group.modes).join(' and ')}.`
    )
    .join(' ');
}

function capacityGroups(
  capacity: readonly ColorSystemReviewCategoricalCapacityV2[] | undefined
): { achieved: number; requested: number; modes: string[] }[] {
  const groups = new Map<string, { achieved: number; requested: number; modes: string[] }>();
  for (const item of capacity ?? []) {
    if (item.achievedMarkCount >= item.requestedMarkCount) continue;
    const key = `${item.achievedMarkCount}/${item.requestedMarkCount}`;
    const group = groups.get(key) ?? {
      achieved: item.achievedMarkCount,
      requested: item.requestedMarkCount,
      modes: [],
    };
    group.modes.push(item.mode);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** The chart clause of the “Also considered” sentence; null when the composer reported nothing. */
function capacityClause(
  capacity: readonly ColorSystemReviewCategoricalCapacityV2[] | undefined
): string | null {
  if (!capacity || capacity.length === 0) return null;
  const groups = capacityGroups(capacity);
  if (groups.length === 0) {
    return `all ${numberWord(capacity[0].requestedMarkCount)} chart series stay distinguishable`;
  }
  return groups
    .map(
      group =>
        `${numberWord(group.achieved)} of ${numberWord(group.requested)} chart series stay distinguishable in ${orderModes(group.modes).join(' and ')}`
    )
    .join('; ');
}

const ACCENT_PLACEMENT: Readonly<Record<ColorSystemSecondaryStrategyKindV3, [string, string]>> = {
  derived: ['keeps its new accents close to your primary hue', 'close to your primary hue'],
  complementary: ['sets its new accents opposite your primary hue', 'opposite your primary hue'],
  spectrum: ['spreads its new accents around the color wheel', 'spread around the color wheel'],
};

/**
 * p6. The review's colors regrouped by what they are for, in the words the
 * recommendation screen prints. Every card resolves to the same review colors
 * the sections show; nothing is measured again here.
 */
function reviewRecommendedSystem(input: {
  brief: ColorSystemBuilderBriefV2;
  candidate: ColorSystemStrategyCandidateV2;
  application: ColorSystemApplicationSystemBlueprintV2;
  families: readonly ColorSystemReviewFamilyV2[];
  sections: readonly ColorSystemReviewSectionV2[];
  semanticRoles: readonly ColorSystemReviewSemanticRoleV2[];
  visualizationSpecimens: ColorSystemReviewVisualizationSpecimensV2;
  textPairs: readonly ColorSystemReviewTextPairV2[];
  replaced: ColorSystemReviewReplacedV2 | null;
}): ColorSystemReviewRecommendedSystemV2 {
  const { families, semanticRoles } = input;
  const names = familyPlainNames(input.candidate, families);
  const derived = families.filter(family => family.kind === 'derived');
  const neutral = families.find(family => family.kind === 'neutral') ?? null;
  const accents = families.filter(family => family.kind === 'accent');
  const reserves = families.filter(family => family.kind === 'reserve');
  const primary = input.sections.find(section => section.role === 'primary');
  const primaryColors = primary?.colors ?? [];
  const primaryNames = [...new Set(primaryColors.map(color => color.name))];
  const primaryPhrase =
    primaryNames.length === 1
      ? primaryNames[0]
      : primaryNames.length > 1
        ? `${primaryNames.length} Primary colors`
        : null;
  const temperature = neutral
    ? describeColorSystemSecondaryHueTemperatureV3(
        hexToOklch(neutral.anchorHex ?? neutral.colors[0].hex).h
      )
    : null;
  const roleColors = (role: ColorSystemProductSemanticRoleNameV2) =>
    semanticRoles.filter(item => item.role === role).map(item => item.color);

  // Header: the count of colors and what they are, no other number.
  const colorCount = families.length + (derived.length === 0 ? primaryNames.length : 0);
  const summary = `${pluralCount(colorCount, 'color')}: ${[
    primaryPhrase ? `${primaryPhrase} kept exactly` : null,
    neutral ? `a ${temperature} neutral ramp` : null,
    accents.length > 0 ? pluralCount(accents.length, 'new accent') : null,
    reserves.length > 0 ? pluralCount(reserves.length, 'status color') : null,
  ]
    .filter(nonNull)
    .join(', ')}.`;

  // Source identity and measured product uses do not establish marketing authority.
  const categoricalMarks = input.visualizationSpecimens.categorical.marks;
  const grounds = roleColors('background');
  const groundPhrase = orderModes(grounds.map(color => color.mode))
    .map(mode => {
      const ground = grounds.find(color => color.mode === mode)!;
      return `${plainColorName(ground, families, names)} on ${mode.toLowerCase()}`;
    })
    .join(', ');
  const brand = [
    ...[...new Set(primaryColors.map(color => color.id))].flatMap(id => {
      const colors = primaryColors.filter(color => color.id === id);
      const testedRoles = [
        ...new Set(semanticRoles.filter(item => item.color.id === id).map(item => item.role)),
      ].sort(compareText);
      const card = cardOf(
        `primary:${id}`,
        colors[0].name,
        testedRoles.length > 0
          ? `Preserved source color. Tested in this proposal for ${testedRoles.map(role => role.replace(/-/g, ' ')).join(', ')}.`
          : 'Preserved source color; no tested product use assigned in this proposal.',
        [{ label: colors[0].name, colors }],
        families
      );
      return card ? [card] : [];
    }),
    ...accents.flatMap(family => {
      const card = cardOf(
        `accent:${family.id}`,
        names.get(family.id)?.name ?? family.name,
        familyUsedFor(family, categoricalMarks),
        [{ label: 'Accent', colors: familyAnchorColors(family) }],
        families
      );
      return card ? [card] : [];
    }),
    ...(grounds.length > 0
      ? [
          cardOf(
            'marketing-grounds',
            'Proposed surfaces and text',
            `tested product backgrounds and text; the backgrounds are ${groundPhrase}.`,
            [
              { label: 'Ground', colors: grounds },
              { label: 'Text on it', colors: roleColors('text') },
            ],
            families
          ),
        ].filter((card): card is ColorSystemReviewSystemCardV2 => card !== null)
      : []),
  ];

  // Product UI: the semantic roles by job, with the state aliases of the primary button.
  const states = selectedStateColors(input.brief, input.candidate, input.application, families);
  const linkStates = selectedStateColors(
    input.brief,
    input.candidate,
    input.application,
    families,
    'link'
  );
  const mutedByMode = new Map<string, ColorSystemReviewColorV2>();
  for (const pair of input.textPairs) {
    if (pair.useCategory === 'supporting-body' && !mutedByMode.has(pair.mode)) {
      mutedByMode.set(pair.mode, pair.foreground);
    }
  }
  const partColors = (role: ProductUiCardSpec['parts'][number]['role']) =>
    role === 'muted-text'
      ? [...mutedByMode.values()]
      : role === 'selected-hover'
        ? states.hover
        : role === 'selected-pressed'
          ? states.pressed
          : role === 'link-hover'
            ? linkStates.hover
            : role === 'link-pressed'
              ? linkStates.pressed
              : roleColors(role);
  const productUi = PRODUCT_UI_CARDS.flatMap(spec => {
    const card = cardOf(
      spec.id,
      spec.name,
      spec.usedFor,
      (spec.id === 'link' && linkStates.hover.length
        ? [
            ...spec.parts,
            { label: 'Hover', role: 'link-hover' as const },
            { label: 'Pressed', role: 'link-pressed' as const },
          ]
        : spec.parts
      ).map(part => ({ label: part.label, colors: partColors(part.role) })),
      families
    );
    return card ? [card] : [];
  });

  // Status: fill and the text on it, named by role and the hue the fill actually has.
  const differs = (
    left: readonly ColorSystemReviewColorV2[],
    right: readonly ColorSystemReviewColorV2[]
  ) => left.some(color => right.find(other => other.mode === color.mode)?.hex !== color.hex);
  const statusRoles: ColorSystemProductSemanticRoleNameV2[] = [...STATUS_CARD_ROLES];
  if (differs(roleColors('destructive'), roleColors('error'))) statusRoles.push('destructive');
  const status = statusRoles.flatMap(role => {
    const fill = roleColors(role);
    const firstMode = orderModes(fill.map(color => color.mode))[0];
    const hue = firstMode ? hueWordOf(fill.find(color => color.mode === firstMode)!.hex) : null;
    const card = cardOf(
      `status:${role}`,
      `${capitalize(role)}${hue ? ` ${hue}` : ''}`,
      'status messages, badges and validation.',
      [
        { label: 'Fill', colors: fill },
        {
          label: 'Text on it',
          colors: roleColors(`on-${role}` as ColorSystemProductSemanticRoleNameV2),
        },
      ],
      families
    );
    return card ? [card] : [];
  });

  // Also considered, and the why.
  const kind = candidateStrategyKind(input.candidate);
  const [placement, placementShort] = ACCENT_PLACEMENT[kind];
  const capacity = input.visualizationSpecimens.categoricalCapacity;
  const capacityShort = capacityClause(capacity);
  const accentNoun = accents.length === 1 ? 'accent' : 'accents';
  const statusNoun = reserves.length === 1 ? 'color' : 'colors';
  const alsoConsidered = `${
    accents.length === 0
      ? 'No new accent'
      : `${capitalize(numberWord(accents.length))} new ${accentNoun} ${placementShort}`
  }${reserves.length > 0 ? ` and ${numberWord(reserves.length)} status ${statusNoun}` : ''}${
    capacityShort ? `; ${capacityShort}` : ''
  }.`;
  const preserved = input.brief.preservedColors;
  const keptClauses = [
    primaryPhrase
      ? `${primaryPhrase} ${primaryNames.length === 1 ? 'stays' : 'stay'} exactly as recorded in every mode`
      : null,
    preserved.some(color => color.section === 'typography')
      ? 'your recorded text and surface colors stay as they are'
      : null,
    preserved.some(color => color.section !== 'typography' && color.section !== 'primary')
      ? 'your other recorded colors ship as exact tokens'
      : null,
  ].filter(nonNull);
  const accentUses = [
    ...new Set(
      accents.flatMap(family =>
        JOB_USE_ORDER.filter(job => family.jobs.includes(job))
          .map(job => JOB_USES[job])
          .filter(nonNull)
      )
    ),
  ];
  const addedClauses = [
    neutral
      ? `a ${temperature} neutral ramp for backgrounds, surfaces, borders and disabled text`
      : null,
    accents.length > 0
      ? `${numberWord(accents.length)} new ${accentNoun} (${joinHueWords(
          accents.map(family => names.get(family.id)?.hueWord ?? 'new')
        )})${accentUses.length > 0 ? ` for ${joinList(accentUses)}` : ''}`
      : null,
    reserves.length > 0
      ? `${numberWord(reserves.length)} status ${statusNoun} (${joinList(
          reserves.map(
            family =>
              `${names.get(family.id)?.hueWord ?? 'a conventional hue'} for ${family.statusReserve ?? 'status'}`
          )
        )}) because your palette owns no hue in ${reserves.length === 1 ? 'that range' : 'those ranges'}`
      : null,
  ].filter(nonNull);
  const notDoneClauses = [
    'did not change your recorded colors',
    'did not look up any spot color (the print values are unprofiled estimates)',
    input.replaced ? 'did not carry the recorded colors you chose to replace' : null,
  ].filter(nonNull);

  return {
    colorCount,
    summary,
    accentPlacement: accents.length === 0 ? 'adds no new accent' : placement,
    alsoConsidered,
    brand,
    productUi,
    status,
    chartCapacity: chartCapacitySentence(capacity),
    why: {
      kept:
        keptClauses.length > 0
          ? `${capitalize(joinList(keptClauses))}.`
          : 'Nothing from the recorded palette was changed.',
      added:
        addedClauses.length > 0
          ? `Teul added ${joinClauses(addedClauses)}.`
          : 'Teul added no new color; every role is filled from your recorded palette.',
      notDone: `Teul ${joinList(notDoneClauses)}; the recommendation is Teul’s and approval stays with the brand owner.`,
    },
    familyNames: families.map(family => ({
      familyId: family.id,
      name: names.get(family.id)?.name ?? family.name,
      tokenPath: `color/${names.get(family.id)?.slug ?? 'family'}`,
    })),
  };
}

/** Creates the plain-language, actual-color review payload. Technical hashes are
 * retained in one disclosure record and never become the default experience. */
export function buildColorSystemReviewModelV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  sectionBlueprint: ColorSystemSectionBlueprintV2
): ColorSystemReviewModelV2 {
  assertColorSystemSectionBlueprintV2Integrity(brief, candidate, sectionBlueprint);
  const application = sectionBlueprint.applicationBlueprint;
  const visualizationSpecimens = reviewVisualizationSpecimens(brief, candidate, application);
  const productGraphicsSpecimens = reviewProductGraphicsSpecimens(brief, candidate, application);
  const textPairs = reviewTextPairs(brief, candidate, application);
  const replaced = reviewReplaced(brief, application.modes); // p5-A
  const sections = sectionBlueprint.frames.map(frame => {
    const rating = application.ratings.find(item => item.section === frame.ratingSection);
    return {
      role: frame.role,
      title: frame.title,
      changeLabel: dispositionLabel(frame.disposition),
      disposition: frame.disposition,
      guidance: reviewSectionGuidance(frame.role, frame.guidance, candidate),
      colors: frame.colorRefs.map(ref => reviewColor(brief, candidate, ref)),
      exampleLabels: frame.exampleIds,
      ratings: rating ? reviewRating(rating) : null,
      cardBoundary: sectionBoundary(frame.cardBoundary),
      productGraphicsSpecimens: frame.role === 'product-graphics' ? productGraphicsSpecimens : null,
      visualizationSpecimens: frame.role === 'data-visualization' ? visualizationSpecimens : null,
      ...(frame.role === 'typography' ? { textPairs } : {}),
    };
  }) as unknown as ColorSystemReviewModelV2['sections'];
  const families = familyReview(brief, candidate, application);
  const semanticRoles = reviewSemanticRoles(brief, candidate, application);
  const content: ReviewModelContent = {
    schemaVersion: COLOR_SYSTEM_REVIEW_MODEL_V2_SCHEMA_VERSION,
    directionId: candidate.id,
    directionLabel: candidate.label,
    directionDecision: directionDecision(brief, candidate, application.modes),
    status: brief.adoption ? 'ready-to-review' : 'ready-to-create',
    ...(brief.adoption ? { adoption: brief.adoption } : {}),
    headline: `${candidate.label}: a complete Secondary system with application examples`,
    summary: `Primary stays unchanged. This direction proposes ${candidate.actualFamilyCount} Secondary families, then uses measured eligible members to build product graphics, product roles, data visualization, and typography examples.`,
    unchanged: [
      `${brief.primaryLocks.filter(lock => application.modes.includes(lock.mode)).length} Primary colors remain exact and locked.`,
      `${brief.preservedColors.filter(color => color.section === 'typography').length} Typography colors remain source-owned.`,
      // p3-H: recorded Secondary values ship byte-identical as source tokens.
      ...(brief.preservedColors.some(color => color.section === 'secondary')
        ? [
            `${brief.preservedColors.filter(color => color.section === 'secondary').length} recorded Secondary colors remain exact as source tokens.`,
          ]
        : []),
      // p3-J: so do recorded Product Graphics and chart colors.
      ...(brief.preservedColors.some(color => color.section === 'product-graphics')
        ? [
            `${brief.preservedColors.filter(color => color.section === 'product-graphics').length} recorded Product Graphics colors remain exact as source tokens.`,
          ]
        : []),
      ...(brief.preservedColors.some(color => color.section === 'data-visualization')
        ? [
            `${brief.preservedColors.filter(color => color.section === 'data-visualization').length} recorded chart colors remain exact as source tokens.`,
          ]
        : []),
    ],
    proposed: [
      `${candidate.actualFamilyCount} Secondary families with explicit ${orderModes(application.modes).join(' and ')} values.`,
      `${application.productGraphics.length} Product Graphics examples and ${application.productSemantics.length} product role assignments.`,
      application.visualization.sequential && application.visualization.diverging
        ? 'Categorical, sequential, and diverging data-visualization examples.'
        : application.visualization.sequential
          ? 'Categorical and sequential data-visualization examples; source chart palette kept.'
          : application.visualization.diverging
            ? 'Categorical and diverging data-visualization examples; source chart palette kept.'
            : 'Source chart palette kept; unrequested chart examples are omitted.',
      `${application.typography.length} exact rendered typography specimens.`,
    ],
    importantLimitations: application.limitations,
    families,
    sections,
    technicalReceipt: {
      sourceHash: brief.sourceHash,
      candidateHash: candidate.candidateHash,
      applicationBlueprintHash: application.applicationBlueprintHash,
      sectionBlueprintHash: sectionBlueprint.sectionBlueprintHash,
    },
    why: reviewWhy(brief, candidate, application),
    // p5-A: what a Replace plan did not carry, so nothing disappears silently.
    ...(replaced ? { replaced } : {}),
    brandSurfaces: reviewBrandSurfaces(brief, candidate, application),
    // p3-B: declared, never inferred from the file; the same rule on every direction.
    proportionRule: COLOR_SYSTEM_PROPORTION_RULE_V3,
    // p4-DE: the preview boards read their ground, text, primary and on-color from here.
    semanticRoles,
    // p6: the same colors grouped by what they are for, in the words the first screen prints.
    recommendedSystem: reviewRecommendedSystem({
      brief,
      candidate,
      application,
      families,
      sections,
      semanticRoles,
      visualizationSpecimens,
      textPairs,
      replaced,
    }),
  };
  return { ...content, reviewModelHash: deterministicContentHash(content) };
}

export function assertColorSystemReviewModelV2Integrity(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  sectionBlueprint: ColorSystemSectionBlueprintV2,
  review: ColorSystemReviewModelV2
): void {
  const rebuilt = buildColorSystemReviewModelV2(brief, candidate, sectionBlueprint);
  if (canonicalJson(rebuilt) !== canonicalJson(review)) {
    throw new Error('The color-system review model is stale or has been modified.');
  }
}
