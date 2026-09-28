import { canonicalJson, canonicalNumber, deterministicContentHash } from './colorSystemHashing';
import {
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemFamilyMemberV2,
  type ColorSystemFamilyPinSkipV2,
  type ColorSystemFamilyPinnedMemberV2,
  type ColorSystemFamilyProminenceV2,
  type ColorSystemJobV2,
  type ColorSystemMemberModeJobEligibilityV2,
  type ColorSystemSecondaryFamilyV2,
  type ColorSystemStrategyCandidateV2,
  type ColorSystemStrategySetV2,
} from './colorSystemBuilderV2Contracts';
import {
  assertColorSystemBuilderBriefV2Integrity,
  buildColorSystemStrategyCandidateV2,
  buildColorSystemStrategySetV2,
  colorSystemBriefTargetFamilyCountV2,
} from './colorSystemBuilderV2Integrity';
import {
  generateColorScaleFromSrgbV1,
  pinColorScaleStepWithSourceAnchorsV1,
  type ColorScale,
} from './colorScale';
import {
  COLOR_SYSTEM_SECONDARY_DIRECTIONS_V3,
  COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3,
  COLOR_SYSTEM_SECONDARY_NEUTRAL_SEPARATION_DELTA_E_OK_V3,
  COLOR_SYSTEM_SECONDARY_STRATEGY_KIND_BY_DIRECTION_V3,
  canonicalizeColorSystemSecondaryOklchV3,
  classifyColorSystemSecondaryLightnessV3,
  colorSystemSecondaryDeltaEOKV3,
  colorSystemSecondaryColorIdentityV3,
  colorSystemSecondaryOklchFromValueV3,
  colorSystemSecondaryStatusReserveRoleV3,
  describeColorSystemSecondaryDirectionV3,
  COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3,
  normalizeColorSystemSecondaryHueV3,
  pickColorSystemSecondaryHeroV3,
  readColorSystemSecondaryFamilyV3,
  realizeColorSystemSecondaryAnchorV3,
  type ColorSystemSecondaryOklchV3,
  type ColorSystemSecondaryColorInputV3,
} from './colorSystemSecondaryStrategyV3';
import { compareText, hexToOklch, hexToRgb, rgbToHex } from './utils';
import { colorSystemTerritoryContainsOklchV1 } from './colorSystemPerceptualBoundsV1';

export const COLOR_SYSTEM_SECONDARY_ENGINE_V2_POLICY_VERSION = 'teul-secondary-engine/v2' as const;

export const COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS = COLOR_SYSTEM_SECONDARY_DIRECTIONS_V3;

export type ColorSystemSecondaryDirectionV2 =
  (typeof COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS)[number];

export type ColorSystemSecondaryScaleModeV2 = 'Light' | 'Dark';

/**
 * Cross-strategy threshold only. It prevents tiny quantization differences
 * from being presented as a meaningfully different direction; it is not an
 * accessibility or universal perceptual-conformance claim.
 */
export const COLOR_SYSTEM_SECONDARY_STRATEGY_MINIMUM_MEAN_DELTA_E_OK = 0.02;

/**
 * Enforced within one direction: a generated family whose Light step-9 anchor
 * sits closer than this to an already accepted family's anchor is skipped and
 * the skip is measured. Neutral anchors are compared at the lower threshold.
 */
export const COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK =
  COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3;
export const COLOR_SYSTEM_SECONDARY_NEUTRAL_ANCHOR_SEPARATION_DELTA_E_OK =
  COLOR_SYSTEM_SECONDARY_NEUTRAL_SEPARATION_DELTA_E_OK_V3;

export interface ColorSystemSecondaryDirectionRecipeV2 {
  direction: ColorSystemSecondaryDirectionV2;
  hueOffsetDegrees: number;
  chromaScale: number;
  lightnessShift: number;
  /** Optional per-direction family name; the seed displayName is the default. */
  displayName?: string;
  authority: 'teul-proposal';
  evidenceIds: readonly string[];
}

/**
 * Eligibility is evidence attached to explicit member steps and modes. Jobs
 * are never inferred from a family label, hue name, order, or visual score.
 */
export interface ColorSystemSecondaryEligibilityEvidenceV2 {
  modes: readonly ColorSystemSecondaryScaleModeV2[];
  steps: readonly number[];
  jobs: readonly ColorSystemJobV2[];
  authority: 'teul-policy-evidence';
  evidenceIds: readonly string[];
}

/**
 * A normalized backend seed. Its anchor must resolve to an exact color already
 * retained by the reviewed builder brief. Offset and eligibility evidence are
 * source/job inputs, not UI-authored generated colors.
 */
export interface ColorSystemSecondaryFamilySeedV2 {
  version: 'teul-secondary-family-seed/v2';
  authority: 'teul-proposal';
  seedId: string;
  displayName: string;
  contributionId: string;
  sourceColorId: string;
  sourceMode: string;
  baseHueOffsetDegrees: number;
  baseChromaScale: number;
  baseLightnessShift: number;
  territoryId: string;
  prominence: ColorSystemFamilyProminenceV2;
  directionRecipes: readonly ColorSystemSecondaryDirectionRecipeV2[];
  eligibilityEvidence: readonly ColorSystemSecondaryEligibilityEvidenceV2[];
  evidenceIds: readonly string[];
  /**
   * p3-H: preserved tints of this family's source color. Each pins into the Light
   * scale at the step whose lightness is nearest, only for a direction whose
   * anchor is the exact source and only when the pinned scale still validates;
   * every outcome is recorded on the family.
   */
  pinnedSources?: readonly ColorSystemSecondaryPinnedSourceV2[];
}

/** p3-H: a preserved color and mode a seed asks the engine to pin into its scale. */
export interface ColorSystemSecondaryPinnedSourceV2 {
  sourceColorId: string;
  sourceMode: string;
}

export class ColorSystemSecondaryEngineV2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ColorSystemSecondaryEngineV2Error';
  }
}

interface NormalizedSeed extends ColorSystemSecondaryFamilySeedV2 {
  directionRecipes: readonly ColorSystemSecondaryDirectionRecipeV2[];
  eligibilityEvidence: readonly ColorSystemSecondaryEligibilityEvidenceV2[];
  evidenceIds: readonly string[];
}

interface GeneratedFamily {
  family: ColorSystemSecondaryFamilyV2;
  jobEligibility: readonly ColorSystemMemberModeJobEligibilityV2[];
  mappedStepCount: number;
  sourceAdjustmentDeltaEOK: number;
  anchorHex: string;
  anchorValue: ColorSystemColorValueV2;
  sourceHex: string;
  sourceValue: ColorSystemColorValueV2;
  sourceDisplayName: string;
  displayName: string;
  /** Measured neutral rule: Light step-9 chroma below the shared threshold. */
  neutral: boolean;
}

const HASH_PREFIX = 'sha256:';
const MODES: readonly ColorSystemSecondaryScaleModeV2[] = ['Light', 'Dark'];
const MAXIMUM_RAW_FAMILY_EVALUATIONS = 648;
const MAXIMUM_PREQUALIFIED_FAMILIES = 64;
/**
 * Seed chroma scale bounds. Neutral ramps request step-9 chroma 0.012 from
 * anchors that may reach the sRGB chroma ceiling (about 0.37), which needs a
 * scale as low as 0.032; the earlier 0.05 floor could not express that. A
 * low-chroma hero (chroma at or below the 0.08 accent floor) needs accents up
 * to chroma 0.12, which is 2.4× a chroma-0.05 hero; the earlier ceiling of 2
 * could not express that either.
 */
const MINIMUM_SEED_CHROMA_SCALE = 0.02;
const MAXIMUM_SEED_CHROMA_SCALE = 3;

const KNOWN_SEED_KEYS = [
  'version',
  'authority',
  'seedId',
  'displayName',
  'contributionId',
  'sourceColorId',
  'sourceMode',
  'baseHueOffsetDegrees',
  'baseChromaScale',
  'baseLightnessShift',
  'territoryId',
  'prominence',
  'directionRecipes',
  'eligibilityEvidence',
  'evidenceIds',
  'pinnedSources', // p3-H
] as const;

const KNOWN_RECIPE_KEYS = [
  'direction',
  'hueOffsetDegrees',
  'chromaScale',
  'lightnessShift',
  'displayName',
  'authority',
  'evidenceIds',
] as const;

const KNOWN_ELIGIBILITY_KEYS = ['modes', 'steps', 'jobs', 'authority', 'evidenceIds'] as const;

function fail(message: string): never {
  throw new ColorSystemSecondaryEngineV2Error(message);
}

function requireKnownKeys(value: object, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length > 0) {
    fail(`${label} contains unsupported fields: ${unknown.sort(compareText).join(', ')}.`);
  }
}

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) fail(`${label} must not be empty.`);
  return normalized;
}

function requireFiniteRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${label} must be finite from ${minimum} through ${maximum}.`);
  }
  return value;
}

function sortedUniqueStrings(values: readonly string[], label: string): string[] {
  const normalized = values.map((value, index) => requireNonEmpty(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail(`${label} must not contain duplicates.`);
  }
  return [...normalized].sort(compareText);
}

function sortedUniqueJobs(
  jobs: readonly ColorSystemJobV2[],
  brief: ColorSystemBuilderBriefV2,
  label: string
): ColorSystemJobV2[] {
  const normalized = sortedUniqueStrings(jobs, label) as ColorSystemJobV2[];
  for (const job of normalized) {
    if (!brief.requiredSecondaryJobs.includes(job)) {
      fail(`${label} contains undeclared Secondary job ${job}.`);
    }
  }
  return normalized;
}

/**
 * CSS uses a missing hue at the powerless-hue boundary; Teul's numeric receipt
 * schema stores the equivalent deterministic placeholder instead. The formula
 * is shared with the strategy planner so both sides canonicalize identically.
 */
export function canonicalizeColorSystemSecondaryOklchV2(
  value: ReturnType<typeof hexToOklch>
): ReturnType<typeof hexToOklch> {
  return canonicalizeColorSystemSecondaryOklchV3(value);
}

function normalizeHex(value: string): string {
  const { r, g, b } = hexToRgb(value);
  return rgbToHex(r, g, b).toUpperCase();
}

function colorValue(hex: string): ColorSystemColorValueV2 {
  const normalized = normalizeHex(hex);
  const { r, g, b } = hexToRgb(normalized);
  return {
    colorSpace: 'srgb',
    hex: normalized,
    components: { r: r / 255, g: g / 255, b: b / 255 },
    alpha: 1,
  };
}

function deltaEOK(
  firstHex: ColorSystemSecondaryColorInputV3,
  secondHex: ColorSystemSecondaryColorInputV3
): number {
  return colorSystemSecondaryDeltaEOKV3(firstHex, secondHex);
}

function normalizeSeed(
  brief: ColorSystemBuilderBriefV2,
  seed: ColorSystemSecondaryFamilySeedV2
): NormalizedSeed {
  requireKnownKeys(seed, KNOWN_SEED_KEYS, `Seed ${seed.seedId || '(missing id)'}`);
  if (seed.version !== 'teul-secondary-family-seed/v2') {
    fail('Secondary family seed is not the supported v2 schema.');
  }
  if (seed.authority !== 'teul-proposal') {
    fail('Secondary family seeds must identify their generated values as Teul proposals.');
  }
  const seedId = requireNonEmpty(seed.seedId, 'Seed id');
  const displayName = requireNonEmpty(seed.displayName, `${seedId} displayName`);
  const contributionId = requireNonEmpty(seed.contributionId, `${seedId} contributionId`);
  if (!brief.secondaryTargetPolicy.assemblyContributionIds.includes(contributionId)) {
    fail(`${seedId} contribution is not declared by the reviewed target policy.`);
  }
  const sourceColorId = requireNonEmpty(seed.sourceColorId, `${seedId} sourceColorId`);
  const sourceMode = requireNonEmpty(seed.sourceMode, `${seedId} sourceMode`);
  const source = [...brief.preservedColors, ...brief.sourceReferenceColors].find(
    color => color.stableColorId === sourceColorId
  );
  const sourceValue = source?.valuesByMode[sourceMode];
  if (!sourceValue) {
    fail(
      `${seedId} source anchor does not resolve to an exact preserved or evidence-only reference color and mode.`
    );
  }
  if (sourceValue.alpha !== 1) {
    fail(
      `${seedId} generation requires an opaque exact source anchor; alpha remains evidence-only.`
    );
  }
  const territoryId = requireNonEmpty(seed.territoryId, `${seedId} territoryId`);
  const territory = brief.brandFitProfile.territories.find(
    candidate => candidate.territoryId === territoryId
  );
  if (!territory || territory.status === 'excluded') {
    fail(`${seedId} references an excluded or unknown brand territory.`);
  }
  if (!territory.allowedProminence.includes(seed.prominence)) {
    fail(`${seedId} territory does not permit ${seed.prominence} prominence.`);
  }
  if (!territory.appliesToProminence.includes(seed.prominence)) {
    fail(`${seedId} territory is not scoped to ${seed.prominence} prominence.`);
  }
  const evidenceIds = sortedUniqueStrings(seed.evidenceIds, `${seedId} evidenceIds`);
  if (evidenceIds.length === 0) fail(`${seedId} requires source evidence.`);
  const directionRecipes = seed.directionRecipes
    .map(recipe => {
      requireKnownKeys(recipe, KNOWN_RECIPE_KEYS, `${seedId} direction recipe`);
      if (!COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS.includes(recipe.direction)) {
        fail(`${seedId} uses unsupported direction ${recipe.direction}.`);
      }
      if (recipe.authority !== 'teul-proposal') {
        fail(`${seedId}/${recipe.direction} must be labeled as a Teul proposal.`);
      }
      const recipeEvidence = sortedUniqueStrings(
        recipe.evidenceIds,
        `${seedId}/${recipe.direction} evidenceIds`
      );
      if (recipeEvidence.length === 0) {
        fail(`${seedId}/${recipe.direction} requires source evidence.`);
      }
      const recipeDisplayName =
        recipe.displayName === undefined
          ? undefined
          : requireNonEmpty(recipe.displayName, `${seedId}/${recipe.direction} displayName`);
      return {
        direction: recipe.direction,
        hueOffsetDegrees: requireFiniteRange(
          recipe.hueOffsetDegrees,
          -360,
          360,
          `${seedId}/${recipe.direction} hueOffsetDegrees`
        ),
        chromaScale: requireFiniteRange(
          recipe.chromaScale,
          MINIMUM_SEED_CHROMA_SCALE,
          MAXIMUM_SEED_CHROMA_SCALE,
          `${seedId}/${recipe.direction} chromaScale`
        ),
        lightnessShift: requireFiniteRange(
          recipe.lightnessShift,
          -0.25,
          0.25,
          `${seedId}/${recipe.direction} lightnessShift`
        ),
        ...(recipeDisplayName === undefined ? {} : { displayName: recipeDisplayName }),
        authority: 'teul-proposal' as const,
        evidenceIds: recipeEvidence,
      };
    })
    .sort(
      (left, right) =>
        COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS.indexOf(left.direction) -
        COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS.indexOf(right.direction)
    );
  if (directionRecipes.length === 0) fail(`${seedId} requires at least one direction recipe.`);
  if (new Set(directionRecipes.map(recipe => recipe.direction)).size !== directionRecipes.length) {
    fail(`${seedId} direction recipes must be unique.`);
  }
  const eligibilityEvidence = seed.eligibilityEvidence
    .map((entry, index) => {
      requireKnownKeys(entry, KNOWN_ELIGIBILITY_KEYS, `${seedId} eligibility[${index}]`);
      const modes = sortedUniqueStrings(
        entry.modes,
        `${seedId} eligibility[${index}].modes`
      ) as ColorSystemSecondaryScaleModeV2[];
      if (modes.length === 0 || modes.some(mode => !MODES.includes(mode))) {
        fail(`${seedId} eligibility[${index}] must declare Light and/or Dark mode.`);
      }
      const steps = [...entry.steps].sort((left, right) => left - right);
      if (
        steps.length === 0 ||
        new Set(steps).size !== steps.length ||
        steps.some(step => !Number.isInteger(step) || step < 1 || step > 12)
      ) {
        fail(`${seedId} eligibility[${index}] must declare unique steps from 1 through 12.`);
      }
      const jobs = sortedUniqueJobs(entry.jobs, brief, `${seedId} eligibility[${index}].jobs`);
      if (jobs.length === 0) fail(`${seedId} eligibility[${index}] requires a job.`);
      const unsupportedJob = jobs.find(job => !territory.allowedJobs.includes(job));
      if (unsupportedJob) {
        fail(`${seedId} territory does not permit explicit job ${unsupportedJob}.`);
      }
      const entryEvidenceIds = sortedUniqueStrings(
        entry.evidenceIds,
        `${seedId} eligibility[${index}].evidenceIds`
      );
      if (entryEvidenceIds.length === 0) {
        fail(`${seedId} eligibility[${index}] requires evidence.`);
      }
      if (entry.authority !== 'teul-policy-evidence') {
        fail(`${seedId} eligibility[${index}] must be labeled as Teul policy evidence.`);
      }
      return {
        modes,
        steps,
        jobs,
        authority: 'teul-policy-evidence' as const,
        evidenceIds: entryEvidenceIds,
      };
    })
    .sort((left, right) => compareText(canonicalJson(left), canonicalJson(right)));
  if (eligibilityEvidence.length === 0) {
    fail(`${seedId} requires explicit member/mode job eligibility evidence.`);
  }
  // p3-H: pins resolve only to preserved (never evidence-only) opaque colors other
  // than the seed's own anchor, one pin per color, in stable order.
  const pinnedSources =
    seed.pinnedSources === undefined
      ? undefined
      : [...seed.pinnedSources]
          .map((pin, index) => {
            requireKnownKeys(
              pin,
              ['sourceColorId', 'sourceMode'],
              `${seedId} pinnedSources[${index}]`
            );
            const pinSourceId = requireNonEmpty(
              pin.sourceColorId,
              `${seedId} pinnedSources[${index}].sourceColorId`
            );
            const pinMode = requireNonEmpty(
              pin.sourceMode,
              `${seedId} pinnedSources[${index}].sourceMode`
            );
            const preserved = brief.preservedColors.find(
              color => color.stableColorId === pinSourceId
            );
            const pinValue = preserved?.valuesByMode[pinMode];
            if (!preserved || !pinValue) {
              fail(
                `${seedId} pinnedSources[${index}] does not resolve to a preserved color and mode.`
              );
            }
            if (pinValue.alpha !== 1) {
              fail(`${seedId} pinnedSources[${index}] must be an opaque preserved color.`);
            }
            if (pinSourceId === sourceColorId) {
              fail(`${seedId} cannot pin its own anchor color.`);
            }
            return { sourceColorId: pinSourceId, sourceMode: pinMode };
          })
          .sort(
            (left, right) =>
              compareText(left.sourceColorId, right.sourceColorId) ||
              compareText(left.sourceMode, right.sourceMode)
          );
  if (pinnedSources && pinnedSources.length === 0)
    fail(`${seedId} pinnedSources must not be empty when present.`);
  if (
    pinnedSources &&
    new Set(pinnedSources.map(pin => pin.sourceColorId)).size !== pinnedSources.length
  ) {
    fail(`${seedId} pinnedSources must name each preserved color once.`);
  }
  return {
    version: 'teul-secondary-family-seed/v2',
    authority: 'teul-proposal',
    seedId,
    displayName,
    contributionId,
    sourceColorId,
    sourceMode,
    baseHueOffsetDegrees: requireFiniteRange(
      seed.baseHueOffsetDegrees,
      -360,
      360,
      `${seedId} baseHueOffsetDegrees`
    ),
    baseChromaScale: requireFiniteRange(
      seed.baseChromaScale,
      MINIMUM_SEED_CHROMA_SCALE,
      MAXIMUM_SEED_CHROMA_SCALE,
      `${seedId} baseChromaScale`
    ),
    baseLightnessShift: requireFiniteRange(
      seed.baseLightnessShift,
      -0.25,
      0.25,
      `${seedId} baseLightnessShift`
    ),
    territoryId,
    prominence: seed.prominence,
    directionRecipes,
    eligibilityEvidence,
    evidenceIds,
    ...(pinnedSources ? { pinnedSources } : {}),
  };
}

function exactSource(
  brief: ColorSystemBuilderBriefV2,
  seed: NormalizedSeed
): { hex: string; value: ColorSystemColorValueV2; displayName: string } {
  const source = [...brief.preservedColors, ...brief.sourceReferenceColors].find(
    color => color.stableColorId === seed.sourceColorId
  );
  const value = source?.valuesByMode[seed.sourceMode];
  if (!source || !value) fail(`${seed.seedId} source anchor disappeared after validation.`);
  return { hex: normalizeHex(value.hex), value, displayName: source.displayName };
}

function exactSourceAnchor(
  brief: ColorSystemBuilderBriefV2,
  seed: NormalizedSeed
): ColorSystemColorValueV2 {
  return exactSource(brief, seed).value;
}

/**
 * One clamp per channel on the exact source anchor, then Local MINDE gamut
 * mapping. The arithmetic lives in the strategy module so a planned recipe and
 * the generated family agree on the same six-digit anchor.
 */
function generatedAnchor(
  brief: ColorSystemBuilderBriefV2,
  seed: NormalizedSeed,
  recipe: ColorSystemSecondaryDirectionRecipeV2
): { requested: ColorSystemSecondaryOklchV3; hex: string; value: ColorSystemColorValueV2 } {
  const realized = realizeColorSystemSecondaryAnchorV3(
    exactSourceAnchor(brief, seed),
    {
      hueOffsetDegrees: seed.baseHueOffsetDegrees,
      chromaScale: seed.baseChromaScale,
      lightnessShift: seed.baseLightnessShift,
    },
    {
      hueOffsetDegrees: recipe.hueOffsetDegrees,
      chromaScale: recipe.chromaScale,
      lightnessShift: recipe.lightnessShift,
    }
  );
  return {
    requested: realized.requested,
    hex: realized.hex,
    value: realized.value ?? colorValue(realized.hex),
  };
}

function mergeEvidence(...sets: readonly (readonly string[])[]): string[] {
  return [...new Set(sets.flat())].sort(compareText);
}

function familyValueHash(family: ColorSystemSecondaryFamilyV2): string {
  return deterministicContentHash(
    family.members.flatMap(member =>
      Object.entries(member.valuesByMode)
        .sort(([left], [right]) => compareText(left, right))
        .map(([, value]) => ({
          colorSpace: value.colorSpace,
          hex: value.hex,
          components: value.components,
          alpha: value.alpha,
          ...(value.representation ? { representation: value.representation } : {}),
        }))
    )
  );
}

/**
 * The claimed territory bounds the family's anchor (its exact step 9, the same
 * representative the brief integrity check uses), because a 12-step scale by
 * construction spans lightness from near-white to near-black. Excluded
 * territories are checked against every member in every mode, so no step of a
 * generated family may enter a zone the owner or the planner reserved.
 */
function passesBrandFit(
  brief: ColorSystemBuilderBriefV2,
  seed: NormalizedSeed,
  family: ColorSystemSecondaryFamilyV2,
  anchorValue: ColorSystemColorValueV2
): boolean {
  const claimed = brief.brandFitProfile.territories.find(
    territory => territory.territoryId === seed.territoryId
  );
  if (!claimed || claimed.status === 'excluded') return false;
  if (
    !colorSystemTerritoryContainsOklchV1(claimed, colorSystemSecondaryOklchFromValueV3(anchorValue))
  )
    return false;
  for (const member of family.members) {
    for (const value of Object.values(member.valuesByMode)) {
      const actual = colorSystemSecondaryOklchFromValueV3(value);
      const excluded = brief.brandFitProfile.territories.some(
        territory =>
          territory.status === 'excluded' &&
          territory.appliesToProminence.includes(seed.prominence) &&
          colorSystemTerritoryContainsOklchV1(territory, actual)
      );
      if (excluded) return false;
    }
  }
  return true;
}

function buildEligibility(
  seed: NormalizedSeed,
  family: ColorSystemSecondaryFamilyV2
): ColorSystemMemberModeJobEligibilityV2[] {
  const collected = new Map<
    string,
    {
      ref: ColorSystemMemberModeJobEligibilityV2['ref'];
      jobs: Set<ColorSystemJobV2>;
      evidence: Set<string>;
    }
  >();
  for (const entry of seed.eligibilityEvidence) {
    for (const step of entry.steps) {
      const member = family.members[step - 1];
      if (!member) continue;
      for (const mode of entry.modes) {
        if (!member.valuesByMode[mode]) continue;
        const ref = { familyId: family.stableFamilyId, memberId: member.stableMemberId, mode };
        const identity = `${ref.familyId}\u0000${ref.memberId}\u0000${ref.mode}`;
        const current = collected.get(identity) ?? {
          ref,
          jobs: new Set<ColorSystemJobV2>(),
          evidence: new Set<string>(),
        };
        entry.jobs.forEach(job => current.jobs.add(job));
        mergeEvidence(seed.evidenceIds, entry.evidenceIds).forEach(evidenceId =>
          current.evidence.add(evidenceId)
        );
        collected.set(identity, current);
      }
    }
  }
  return [...collected.values()]
    .map(entry => ({
      ref: entry.ref,
      jobs: [...entry.jobs].sort(compareText),
      authority: 'teul-policy-evidence' as const,
      evidenceIds: [...entry.evidence].sort(compareText),
    }))
    .sort((left, right) =>
      compareText(
        `${left.ref.familyId}\u0000${left.ref.memberId}\u0000${left.ref.mode}`,
        `${right.ref.familyId}\u0000${right.ref.memberId}\u0000${right.ref.mode}`
      )
    );
}

/** The mode a recorded tint pins into: the Light scale, whose steps 1–8 are lighter than the anchor. */
const PIN_TARGET_MODE: ColorSystemSecondaryScaleModeV2 = 'Light';

interface PinnedStep {
  sourceColorId: string;
  sourceDisplayName: string;
  hex: string;
}

/**
 * p3-H. Pins each recorded tint into the Light scale at the step whose lightness
 * is nearest (steps 1 through 8, strictly lighter than the anchor), keeping the
 * pin only when the pinned scale still passes the generator's own validator.
 * Every tint that cannot be pinned is recorded with the step it was nearest to
 * and the reason; the generated step stands and the tint remains a source token.
 * Pins apply only where the direction's anchor is the exact source color.
 */
function applyPinnedSources(
  brief: ColorSystemBuilderBriefV2,
  seed: NormalizedSeed,
  direction: ColorSystemSecondaryDirectionV2,
  source: ColorSystemColorValueV2,
  anchor: ColorSystemColorValueV2,
  light: ColorScale
): {
  light: ColorScale;
  pinnedSteps: Map<number, PinnedStep>;
  pinSkips: ColorSystemFamilyPinSkipV2[];
} {
  const pinnedSteps = new Map<number, PinnedStep>();
  const pinSkips: ColorSystemFamilyPinSkipV2[] = [];
  const sourceHex = source.hex;
  const anchorHex = anchor.hex;
  let scale = light;
  for (const pin of seed.pinnedSources ?? []) {
    const preserved = brief.preservedColors.find(
      color => color.stableColorId === pin.sourceColorId
    );
    const value = preserved?.valuesByMode[pin.sourceMode];
    if (!preserved || !value) fail(`${seed.seedId} pinned source disappeared after validation.`);
    const hex = normalizeHex(value.hex);
    const skip = (nearestStep: number | null, reason: string) => {
      pinSkips.push({
        sourceColorId: pin.sourceColorId,
        sourceDisplayName: preserved.displayName,
        hex,
        mode: PIN_TARGET_MODE,
        nearestStep,
        reason,
      });
    };
    if (
      colorSystemSecondaryColorIdentityV3(anchor) !== colorSystemSecondaryColorIdentityV3(source)
    ) {
      skip(
        null,
        `The ${direction} anchor (${anchorHex}) is not the exact source color (${sourceHex}), so the recorded tint is not pinned into this scale.`
      );
      continue;
    }
    const tintLightness = value.representation
      ? colorSystemSecondaryOklchFromValueV3(value).l
      : hexToOklch(hex).l;
    const anchorLightness = anchor.representation
      ? colorSystemSecondaryOklchFromValueV3(anchor).l
      : hexToOklch(anchorHex).l;
    if (tintLightness <= anchorLightness) {
      skip(
        null,
        `${preserved.displayName} (L ${tintLightness.toFixed(2)}) is not lighter than its base (L ${anchorLightness.toFixed(2)}), so it cannot take a tint step.`
      );
      continue;
    }
    let nearestStep = 1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const step of scale.steps) {
      if (step.step >= scale.anchorStep) continue;
      const distance = Math.abs(step.oklch.l - tintLightness);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestStep = step.step;
      }
    }
    const holder = pinnedSteps.get(nearestStep);
    if (holder) {
      skip(
        nearestStep,
        `Step ${nearestStep} already holds ${holder.sourceDisplayName} (${holder.hex}); ${preserved.displayName} is nearest the same step.`
      );
      continue;
    }
    const pinned = pinColorScaleStepWithSourceAnchorsV1(scale, nearestStep, value, [
      ...pinnedSteps.keys(),
    ]);
    if (!pinned.validation.valid) {
      const codes = [...new Set(pinned.validation.issues.map(issue => issue.code))].sort(
        compareText
      );
      skip(
        nearestStep,
        `Pinning ${preserved.displayName} (${hex}) at step ${nearestStep} fails the scale validator (${codes.join(', ')}); the generated step stands.`
      );
      continue;
    }
    scale = pinned;
    pinnedSteps.set(nearestStep, {
      sourceColorId: pin.sourceColorId,
      sourceDisplayName: preserved.displayName,
      hex,
    });
  }
  return { light: scale, pinnedSteps, pinSkips };
}

function generateFamily(
  brief: ColorSystemBuilderBriefV2,
  seed: NormalizedSeed,
  direction: ColorSystemSecondaryDirectionV2,
  order: number
): GeneratedFamily | null {
  const recipe = seed.directionRecipes.find(candidate => candidate.direction === direction);
  if (!recipe) return null;
  const familyName = recipe.displayName ?? seed.displayName;
  const source = exactSource(brief, seed);
  const anchor = generatedAnchor(brief, seed, recipe);
  const generatedLight = generateColorScaleFromSrgbV1(anchor.value, 'light', familyName);
  const dark = generateColorScaleFromSrgbV1(anchor.value, 'dark', familyName);
  if (!generatedLight.validation.valid || !dark.validation.valid) return null;
  const { light, pinnedSteps, pinSkips } = applyPinnedSources(
    brief,
    seed,
    direction,
    source.value,
    anchor.value,
    generatedLight
  );
  const identity = deterministicContentHash({
    seedId: seed.seedId,
    contributionId: seed.contributionId,
    direction,
    anchorHex: anchor.hex,
    ...(anchor.value.representation
      ? { anchorValueHash: anchor.value.representation.exactValueHash }
      : {}),
  }).slice(HASH_PREFIX.length, HASH_PREFIX.length + 12);
  const familyId = `secondary-${direction}-${identity}`;
  const provenanceEvidence = mergeEvidence(
    seed.evidenceIds,
    recipe.evidenceIds,
    brief.brandFitProfile.evidenceIds,
    brief.primaryLocks.flatMap(lock => lock.evidenceIds)
  );
  const pinnedMembers: ColorSystemFamilyPinnedMemberV2[] = [];
  const members: ColorSystemFamilyMemberV2[] = light.steps.map((lightStep, index) => {
    const darkStep = dark.steps[index];
    const memberId = `${familyId}-step-${String(index + 1).padStart(2, '0')}`;
    const pinned = pinnedSteps.get(index + 1);
    const sourceColorIds = [seed.sourceColorId];
    if (pinned) sourceColorIds.push(pinned.sourceColorId);
    else {
      for (const step of lightStep.sourceAnchorSteps ?? []) {
        const boundaryPin = pinnedSteps.get(step);
        if (boundaryPin) sourceColorIds.push(boundaryPin.sourceColorId);
      }
    }
    if (pinned) {
      pinnedMembers.push({
        stableMemberId: memberId,
        step: index + 1,
        mode: PIN_TARGET_MODE,
        sourceColorId: pinned.sourceColorId,
        sourceDisplayName: pinned.sourceDisplayName,
        hex: pinned.hex,
      });
    }
    return {
      stableMemberId: memberId,
      displayName: `${familyName} ${index + 1}`,
      role: `step-${index + 1}`,
      order: index + 1,
      valuesByMode: {
        Light: lightStep.value ?? colorValue(lightStep.hex),
        Dark: darkStep.value ?? colorValue(darkStep.hex),
      },
      provenance: {
        kind: 'teul-generated' as const,
        authority: 'teul-proposal' as const,
        algorithmVersion: light.sourcePinPolicy
          ? `${light.method}; ${light.sourcePinPolicy}`
          : light.method,
        seedId: seed.seedId,
        directionId: direction,
        hueOffsetDegrees:
          normalizeColorSystemSecondaryHueV3(
            seed.baseHueOffsetDegrees + recipe.hueOffsetDegrees + 180
          ) - 180,
        requestedOklchByMode: {
          Light: canonicalizeColorSystemSecondaryOklchV2(lightStep.requestedOklch),
          Dark: canonicalizeColorSystemSecondaryOklchV2(darkStep.requestedOklch),
        },
        mappedOklchByMode: {
          // Measure the emitted channels: exact native sources or generated
          // byte values, rather than the pre-quantization search coordinate.
          Light: colorSystemSecondaryOklchFromValueV3(lightStep.value ?? lightStep.hex),
          Dark: colorSystemSecondaryOklchFromValueV3(darkStep.value ?? darkStep.hex),
        },
        gamutMapping: 'local-minde-v1' as const,
        sourceColorIds: sourceColorIds.sort(compareText),
        evidenceIds: provenanceEvidence,
      },
    };
  });
  const family: ColorSystemSecondaryFamilyV2 = {
    stableFamilyId: familyId,
    displayName: `${familyName} — ${direction}`,
    order,
    contributionId: seed.contributionId,
    shape: { kind: 'full-light-dark-scale', stepCount: 12 },
    brandFit: {
      territoryId: seed.territoryId,
      prominence: seed.prominence,
      evidenceIds: mergeEvidence(
        seed.evidenceIds,
        recipe.evidenceIds,
        brief.brandFitProfile.evidenceIds
      ),
    },
    members,
    ...(pinnedMembers.length > 0 ? { pinnedMembers } : {}),
    ...(pinSkips.length > 0 ? { pinSkips } : {}),
  };
  if (!passesBrandFit(brief, seed, family, anchor.value)) return null;
  return {
    family,
    jobEligibility: buildEligibility(seed, family),
    mappedStepCount:
      light.steps.filter(step => step.gamutMapped).length +
      dark.steps.filter(step => step.gamutMapped).length,
    sourceAdjustmentDeltaEOK: deltaEOK(source.value, anchor.value),
    anchorHex: anchor.hex,
    anchorValue: anchor.value,
    sourceHex: source.hex,
    sourceValue: source.value,
    sourceDisplayName: source.displayName,
    displayName: familyName,
    neutral:
      colorSystemSecondaryOklchFromValueV3(anchor.value).c <
      COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3,
  };
}

function minimumFamilyAnchorSeparation(families: readonly GeneratedFamily[]): number {
  if (families.length < 2) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < families.length; left++) {
    for (let right = left + 1; right < families.length; right++) {
      minimum = Math.min(
        minimum,
        deltaEOK(families[left].anchorValue, families[right].anchorValue)
      );
    }
  }
  return minimum;
}

interface CandidateAnchor {
  hex: string;
  value: ColorSystemColorValueV2;
  /** Exact source-derived or neutral: identical in every direction by construction. */
  structural: boolean;
}

function candidateAnchorMap(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2
): Map<string, CandidateAnchor> {
  const sourceById = new Map(
    [...brief.preservedColors, ...brief.sourceReferenceColors].map(color => [
      color.stableColorId,
      color,
    ])
  );
  return new Map(
    candidate.families.map(family => {
      const anchor = family.members.find(member => member.role === 'step-9');
      const value = anchor?.valuesByMode.Light;
      if (!value) fail(`${family.stableFamilyId} lacks its generated Light step-9 anchor.`);
      const hex = normalizeHex(value.hex);
      const sourceColorIds = family.members[0]?.provenance.sourceColorIds ?? [];
      const derived = sourceColorIds.some(sourceColorId =>
        Object.values(sourceById.get(sourceColorId)?.valuesByMode ?? {}).some(
          sourceValue =>
            colorSystemSecondaryColorIdentityV3(sourceValue) ===
            colorSystemSecondaryColorIdentityV3(value)
        )
      );
      return [
        family.contributionId,
        {
          hex,
          value,
          structural:
            derived ||
            colorSystemSecondaryOklchFromValueV3(value).c <
              COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3 ||
            colorSystemSecondaryStatusReserveRoleV3({ contributionId: family.contributionId }) !==
              null,
        },
      ];
    })
  );
}

/**
 * Mean anchor distance over the contributions two directions were free to
 * decide differently. Families that reproduce a source color exactly, neutral
 * ramps, and status reserves are identical in every direction by construction,
 * so they are excluded: a palette with many existing hues must not dilute a
 * real accent difference, and directions that differ in nothing else still collapse.
 */
function strategyMeanDeltaEOK(
  brief: ColorSystemBuilderBriefV2,
  first: ColorSystemStrategyCandidateV2,
  second: ColorSystemStrategyCandidateV2
): number {
  const firstAnchors = candidateAnchorMap(brief, first);
  const secondAnchors = candidateAnchorMap(brief, second);
  const openKeys = (anchors: Map<string, CandidateAnchor>) =>
    [...anchors.entries()]
      .filter(([, anchor]) => !anchor.structural)
      .map(([key]) => key)
      .sort(compareText);
  const firstOpen = openKeys(firstAnchors);
  const secondOpen = openKeys(secondAnchors);
  // Directions that realize different sets of open contributions (one adds an accent the
  // other does not) differ by construction; the threshold only guards against two
  // directions that decided the same slots almost identically.
  if (canonicalJson(firstOpen) !== canonicalJson(secondOpen)) return Number.POSITIVE_INFINITY;
  if (firstOpen.length === 0) return 0;
  return canonicalNumber(
    firstOpen.reduce(
      (total, key) => total + deltaEOK(firstAnchors.get(key)!.value, secondAnchors.get(key)!.value),
      0
    ) / firstOpen.length
  );
}

/**
 * Acceptance order inside one direction. Exact brand colors are accepted first
 * so a generated accent can never displace them under the separation gate;
 * generated accents follow, then status reserves (planned as fixed anchors the
 * accents already kept clear of); neutral ramps are accepted last because they
 * are compared at the lower neutral threshold.
 */
function acceptanceRank(entry: GeneratedFamily): number {
  if (entry.sourceAdjustmentDeltaEOK === 0) return 0;
  if (entry.neutral) return 3;
  return colorSystemSecondaryStatusReserveRoleV3({
    contributionId: entry.family.contributionId,
  }) !== null
    ? 2
    : 1;
}

function separationThreshold(left: GeneratedFamily, right: GeneratedFamily): number {
  return left.neutral || right.neutral
    ? COLOR_SYSTEM_SECONDARY_NEUTRAL_ANCHOR_SEPARATION_DELTA_E_OK
    : COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK;
}

function minimumNeutralAnchorSeparation(families: readonly GeneratedFamily[]): number | null {
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < families.length; left++) {
    for (let right = left + 1; right < families.length; right++) {
      if (!families[left].neutral && !families[right].neutral) continue;
      minimum = Math.min(
        minimum,
        deltaEOK(families[left].anchorValue, families[right].anchorValue)
      );
    }
  }
  return Number.isFinite(minimum) ? minimum : null;
}

/** The hero rule shared with the compiler and the review model: the most saturated preserved Primary. */
function heroOklchForExplanation(
  brief: ColorSystemBuilderBriefV2,
  seeds: readonly NormalizedSeed[]
): ColorSystemSecondaryOklchV3 | null {
  const hero = pickColorSystemSecondaryHeroV3(
    brief.preservedColors.map(color => ({
      stableColorId: color.stableColorId,
      displayName: color.displayName,
      section: color.section,
      valuesByMode: color.valuesByMode,
      retention: 'preserved' as const,
      evidenceIds: color.evidenceIds,
    }))
  );
  if (hero) return hero.oklch;
  const leading = seeds.find(seed => seed.prominence === 'leading');
  return leading ? colorSystemSecondaryOklchFromValueV3(exactSourceAnchor(brief, leading)) : null;
}

function buildDirectionCandidate(
  brief: ColorSystemBuilderBriefV2,
  seeds: readonly NormalizedSeed[],
  direction: ColorSystemSecondaryDirectionV2
): ColorSystemStrategyCandidateV2 | null {
  // The reviewed target for this direction: per direction when the brief carries
  // one, otherwise the single reviewed count.
  const directionTarget = colorSystemBriefTargetFamilyCountV2(brief, direction);
  const countReason = brief.secondaryTargetFamilyCountReasonByDirection?.[direction] ?? null;
  const evaluated: GeneratedFamily[] = [];
  let rawEvaluations = 0;
  for (const seed of seeds) {
    if (rawEvaluations >= MAXIMUM_RAW_FAMILY_EVALUATIONS) break;
    rawEvaluations += 1;
    const result = generateFamily(brief, seed, direction, 0);
    if (result) evaluated.push(result);
  }
  const ordered = evaluated
    .map((entry, index) => ({ entry, index }))
    .sort(
      (left, right) =>
        acceptanceRank(left.entry) - acceptanceRank(right.entry) || left.index - right.index
    )
    .map(item => item.entry);
  const generated: GeneratedFamily[] = [];
  const familyHashes = new Set<string>();
  let hasLeadingFamily = false;
  let separationSkips = 0;
  for (const result of ordered) {
    if (result.family.brandFit.prominence === 'leading' && hasLeadingFamily) continue;
    const actualFamilyHash = familyValueHash(result.family);
    if (familyHashes.has(actualFamilyHash)) continue;
    if (
      generated.some(
        accepted =>
          deltaEOK(accepted.anchorValue, result.anchorValue) < separationThreshold(accepted, result)
      )
    ) {
      separationSkips += 1;
      continue;
    }
    if (result.family.brandFit.prominence === 'leading') hasLeadingFamily = true;
    familyHashes.add(actualFamilyHash);
    generated.push(result);
    if (generated.length >= directionTarget || generated.length >= MAXIMUM_PREQUALIFIED_FAMILIES) {
      break;
    }
  }
  if (generated.length === 0) return null;
  const families = generated.map((entry, index) => ({ ...entry.family, order: index + 1 }));
  const chromaticFamilies = generated.filter(entry => !entry.neutral);
  const neutralSeparation = minimumNeutralAnchorSeparation(generated);
  const heroOklch = heroOklchForExplanation(brief, seeds);
  const heroLightnessClass = heroOklch
    ? classifyColorSystemSecondaryLightnessV3(heroOklch.l)
    : null;
  const readings = generated.map(entry =>
    readColorSystemSecondaryFamilyV3({
      displayName: entry.displayName,
      anchorHex: entry.anchorHex,
      anchorValue: entry.anchorValue,
      sourceHex: entry.sourceHex,
      sourceValue: entry.sourceValue,
      sourceDisplayName: entry.sourceDisplayName,
      heroOklch,
      otherAnchorHexes: generated.filter(other => other !== entry).map(other => other.anchorHex),
      otherAnchorValues: generated.filter(other => other !== entry).map(other => other.anchorValue),
      contributionId: entry.family.contributionId,
    })
  );
  const chromaticSeparation =
    chromaticFamilies.length >= 2
      ? canonicalNumber(minimumFamilyAnchorSeparation(chromaticFamilies))
      : null;
  const mappedSteps = generated.reduce((sum, entry) => sum + entry.mappedStepCount, 0);
  const jobEligibility = generated.flatMap(entry => entry.jobEligibility);
  const coveredJobs = new Set(jobEligibility.flatMap(entry => entry.jobs));
  const missingJobs = brief.requiredSecondaryJobs.filter(job => !coveredJobs.has(job));
  const blockers: ColorSystemStrategyCandidateV2['blockers'][number][] = [];
  if (families.length < directionTarget) {
    blockers.push({
      code: 'FAMILY_TARGET_UNDERFILLED',
      message: `${direction} produced ${families.length} of ${directionTarget} reviewed Secondary families.`,
    });
  }
  missingJobs.forEach(job =>
    blockers.push({
      code: 'MISSING_REQUIRED_JOB',
      job,
      message: `${direction} has no evidence-backed eligible member for ${job}.`,
    })
  );
  const status = blockers.length === 0 ? 'complete' : 'underfilled';
  const evidenceIds = mergeEvidence(
    brief.secondaryTargetPolicy.evidenceIds,
    ...seeds.map(seed => seed.evidenceIds)
  );
  return buildColorSystemStrategyCandidateV2(brief, {
    version: COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    id: `secondary-${direction}`,
    label: direction
      .split('-')
      .map(word => `${word[0].toUpperCase()}${word.slice(1)}`)
      .join(' '),
    status,
    direction,
    targetFamilyCount: directionTarget,
    actualFamilyCount: families.length,
    systemShape: 'full-light-dark-scales',
    requiredJobs: brief.requiredSecondaryJobs,
    missingJobs,
    families,
    jobEligibility,
    measures: [
      {
        id: 'family-target-coverage',
        label: 'Secondary family target coverage',
        measuredValue: families.length,
        threshold: directionTarget,
        unit: 'families',
        evidenceIds,
      },
      {
        id: 'job-eligibility-coverage',
        label: 'Required jobs with at least one eligible member and mode',
        measuredValue: brief.requiredSecondaryJobs.length - missingJobs.length,
        threshold: brief.requiredSecondaryJobs.length,
        unit: 'jobs',
        evidenceIds,
      },
      ...(chromaticSeparation === null
        ? []
        : [
            {
              id: 'minimum-family-anchor-separation',
              label: 'Minimum exact chromatic family anchor separation',
              measuredValue: chromaticSeparation,
              threshold: COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK,
              unit: 'deltaEOK',
              evidenceIds,
            },
          ]),
      ...(neutralSeparation === null
        ? []
        : [
            {
              id: 'minimum-neutral-anchor-separation',
              label: 'Minimum neutral-to-family anchor separation',
              measuredValue: canonicalNumber(neutralSeparation),
              threshold: COLOR_SYSTEM_SECONDARY_NEUTRAL_ANCHOR_SEPARATION_DELTA_E_OK,
              unit: 'deltaEOK',
              evidenceIds,
            },
          ]),
      {
        id: 'family-anchor-separation-skips',
        label: 'Generated families skipped for anchor separation below threshold',
        measuredValue: separationSkips,
        unit: 'families',
        evidenceIds,
      },
      {
        id: 'mean-source-adjustment',
        label: 'Mean exact source-to-generated anchor adjustment',
        measuredValue: canonicalNumber(
          generated.reduce((sum, entry) => sum + entry.sourceAdjustmentDeltaEOK, 0) /
            generated.length
        ),
        unit: 'deltaEOK',
        evidenceIds,
      },
      {
        id: 'gamut-mapped-mode-steps',
        label: 'Light and Dark steps mapped through Local MINDE',
        measuredValue: mappedSteps,
        unit: 'mode-steps',
        evidenceIds,
      },
    ],
    explanation: {
      summary: describeColorSystemSecondaryDirectionV3({
        strategyKind: COLOR_SYSTEM_SECONDARY_STRATEGY_KIND_BY_DIRECTION_V3[direction],
        readings,
        heroLightnessClass,
        minimumSeparationDeltaEOK: chromaticSeparation,
        countReason,
      }),
      intendedUses: [
        'Secondary-family review',
        'Eligibility handoff to downstream application-system evaluation',
      ],
      excludedUses: [
        'Automatic chart ordering, semantic-role selection, or typography pairing',
        'A universal accessibility, harmony, or physical-screen-equivalence claim',
      ],
      tradeoffs: [
        `${families.length} of ${directionTarget} family contributions survived exact scale, brand-territory, anchor-separation, composition, and duplicate gates.`,
        ...(separationSkips > 0
          ? [
              `${separationSkips} generated ${separationSkips === 1 ? 'family was' : 'families were'} skipped because the anchor sat closer than ΔEOK ${COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK} (neutral ${COLOR_SYSTEM_SECONDARY_NEUTRAL_ANCHOR_SEPARATION_DELTA_E_OK}) to an accepted family.`,
            ]
          : []),
        `${mappedSteps} of ${families.length * 24} Light and Dark steps were gamut-mapped through Local MINDE.`,
      ],
    },
    blockers,
    // p3-H: the brief's skipped status reserves ride on every candidate so the review
    // and the composer can say why a status role has no reserve.
    ...(brief.skippedStatusReserves ? { skippedStatusReserves: brief.skippedStatusReserves } : {}),
  });
}

/**
 * Builds a deterministic, local, read-only Secondary strategy set. The
 * function performs no Figma mutation, persistence, network access, inference,
 * or random search.
 */
export function buildColorSystemSecondaryStrategySetV2(
  brief: ColorSystemBuilderBriefV2,
  inputSeeds: readonly ColorSystemSecondaryFamilySeedV2[]
): ColorSystemStrategySetV2 {
  assertColorSystemBuilderBriefV2Integrity(brief);
  if (inputSeeds.length === 0) {
    return buildColorSystemStrategySetV2(brief, {
      status: 'no-solution',
      candidates: [],
      blockers: [
        {
          code: 'NO_VALID_FAMILY_SET',
          message: 'No reviewed source/job-derived Secondary family seeds were supplied.',
        },
      ],
    });
  }
  if (inputSeeds.length > brief.secondaryTargetFamilyCount) {
    fail('Secondary seed count cannot exceed the reviewed family target.');
  }
  const normalizedSeeds = inputSeeds.map(seed => normalizeSeed(brief, seed));
  if (new Set(normalizedSeeds.map(seed => seed.seedId)).size !== normalizedSeeds.length) {
    fail('Secondary seed identities must be unique.');
  }
  if (new Set(normalizedSeeds.map(seed => seed.contributionId)).size !== normalizedSeeds.length) {
    fail('Every Secondary seed must satisfy a unique assembly contribution.');
  }
  const contributionOrder = new Map(
    brief.secondaryTargetPolicy.assemblyContributionIds.map((id, index) => [id, index])
  );
  normalizedSeeds.sort(
    (left, right) =>
      contributionOrder.get(left.contributionId)! - contributionOrder.get(right.contributionId)! ||
      compareText(left.seedId, right.seedId)
  );
  // p4-A: a direction the brief omits (it would repeat Derived's family set) gets no
  // candidate at all, so it raises no underfilled blocker and cannot collapse into
  // another direction; the brief carries its stated reason.
  const omittedDirections = new Set(
    (brief.secondaryOmittedDirections ?? []).map(entry => entry.direction)
  );
  const candidates = COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS.filter(
    direction => !omittedDirections.has(direction)
  )
    .map(direction => buildDirectionCandidate(brief, normalizedSeeds, direction))
    .filter((candidate): candidate is ColorSystemStrategyCandidateV2 => candidate !== null)
    .sort(
      (left, right) =>
        Number(right.status === 'complete') - Number(left.status === 'complete') ||
        COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS.indexOf(
          left.id.replace('secondary-', '') as ColorSystemSecondaryDirectionV2
        ) -
          COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS.indexOf(
            right.id.replace('secondary-', '') as ColorSystemSecondaryDirectionV2
          )
    );
  const distinct: ColorSystemStrategyCandidateV2[] = [];
  for (const candidate of candidates) {
    if (distinct.some(retained => retained.actualSystemHash === candidate.actualSystemHash)) {
      continue;
    }
    if (
      distinct.some(
        retained =>
          strategyMeanDeltaEOK(brief, retained, candidate) <
          COLOR_SYSTEM_SECONDARY_STRATEGY_MINIMUM_MEAN_DELTA_E_OK
      )
    ) {
      continue;
    }
    distinct.push(candidate);
    if (distinct.length === 3) break;
  }
  if (!distinct.some(candidate => candidate.status === 'complete')) {
    const missingJobs = brief.requiredSecondaryJobs.filter(
      job => !candidates.some(candidate => !candidate.missingJobs.includes(job))
    );
    return buildColorSystemStrategySetV2(brief, {
      status: 'no-solution',
      candidates: [],
      blockers: [
        {
          code: 'NO_VALID_FAMILY_SET',
          message:
            candidates.length === 0
              ? 'No source-derived family survived exact scale and brand-fit gates.'
              : 'No direction satisfied the reviewed family target and all required jobs.',
        },
        ...missingJobs.map(job => ({
          code: 'MISSING_REQUIRED_JOB' as const,
          job,
          message: `No generated direction retained evidence-backed eligibility for ${job}.`,
        })),
      ],
    });
  }
  return buildColorSystemStrategySetV2(brief, {
    status: 'ready',
    candidates: distinct,
    blockers: [],
  });
}
