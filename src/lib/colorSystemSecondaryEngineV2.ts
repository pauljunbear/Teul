import { canonicalJson, deterministicContentHash } from './colorSystemAudit';
import {
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
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
} from './colorSystemBuilderV2Integrity';
import { generateColorScale, mapOklchToSrgb } from './colorScale';
import { compareText, hexToOklch, hexToRgb, rgbToHex, rgbToOklab } from './utils';

export const COLOR_SYSTEM_SECONDARY_ENGINE_V2_POLICY_VERSION = 'teul-secondary-engine/v2' as const;

export const COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS = [
  'close-harmony',
  'balanced-contrast',
  'wide-spectrum',
] as const;

export type ColorSystemSecondaryDirectionV2 =
  (typeof COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS)[number];

export type ColorSystemSecondaryScaleModeV2 = 'Light' | 'Dark';

/**
 * Cross-strategy threshold only. It prevents tiny quantization differences
 * from being presented as a meaningfully different direction; it is not an
 * accessibility or universal perceptual-conformance claim.
 */
export const COLOR_SYSTEM_SECONDARY_STRATEGY_MINIMUM_MEAN_DELTA_E_OK = 0.02;

export interface ColorSystemSecondaryDirectionRecipeV2 {
  direction: ColorSystemSecondaryDirectionV2;
  hueOffsetDegrees: number;
  chromaScale: number;
  lightnessShift: number;
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
}

const HASH_PREFIX = 'sha256:';
const MODES: readonly ColorSystemSecondaryScaleModeV2[] = ['Light', 'Dark'];
const MAXIMUM_RAW_FAMILY_EVALUATIONS = 648;
const MAXIMUM_PREQUALIFIED_FAMILIES = 64;

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
] as const;

const KNOWN_RECIPE_KEYS = [
  'direction',
  'hueOffsetDegrees',
  'chromaScale',
  'lightnessShift',
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

function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360;
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

function deltaEOK(firstHex: string, secondHex: string): number {
  const first = hexToRgb(firstHex);
  const second = hexToRgb(secondHex);
  const firstLab = rgbToOklab(first.r, first.g, first.b);
  const secondLab = rgbToOklab(second.r, second.g, second.b);
  return Math.sqrt(
    Math.pow(firstLab.L - secondLab.L, 2) +
      Math.pow(firstLab.a - secondLab.a, 2) +
      Math.pow(firstLab.b - secondLab.b, 2)
  );
}

function hueInRanges(
  hue: number,
  ranges: readonly Readonly<{ minimum: number; maximum: number }>[]
): boolean {
  return ranges.some(range => hue >= range.minimum && hue <= range.maximum);
}

function territoryContainsHex(
  territory: ColorSystemBuilderBriefV2['brandFitProfile']['territories'][number],
  hex: string
): boolean {
  const color = hexToOklch(hex);
  return (
    hueInRanges(color.h, territory.perceptualBounds.hueRanges) &&
    color.c >= territory.perceptualBounds.chroma.minimum &&
    color.c <= territory.perceptualBounds.chroma.maximum &&
    color.l >= territory.perceptualBounds.lightness.minimum &&
    color.l <= territory.perceptualBounds.lightness.maximum
  );
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
          0.05,
          2,
          `${seedId}/${recipe.direction} chromaScale`
        ),
        lightnessShift: requireFiniteRange(
          recipe.lightnessShift,
          -0.25,
          0.25,
          `${seedId}/${recipe.direction} lightnessShift`
        ),
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
    baseChromaScale: requireFiniteRange(seed.baseChromaScale, 0.05, 2, `${seedId} baseChromaScale`),
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
  };
}

function exactSourceAnchor(brief: ColorSystemBuilderBriefV2, seed: NormalizedSeed): string {
  const source = [...brief.preservedColors, ...brief.sourceReferenceColors].find(
    color => color.stableColorId === seed.sourceColorId
  );
  const value = source?.valuesByMode[seed.sourceMode];
  if (!value) fail(`${seed.seedId} source anchor disappeared after validation.`);
  return value.hex;
}

function generatedAnchor(
  brief: ColorSystemBuilderBriefV2,
  seed: NormalizedSeed,
  recipe: ColorSystemSecondaryDirectionRecipeV2
): { requested: ReturnType<typeof hexToOklch>; hex: string } {
  const source = hexToOklch(exactSourceAnchor(brief, seed));
  const requested = {
    l: Math.max(0.05, Math.min(0.95, source.l + seed.baseLightnessShift + recipe.lightnessShift)),
    c: Math.max(0, Math.min(0.5, source.c * seed.baseChromaScale * recipe.chromaScale)),
    h: normalizeHue(source.h + seed.baseHueOffsetDegrees + recipe.hueOffsetDegrees),
  };
  const mapped = mapOklchToSrgb(requested);
  return { requested, hex: normalizeHex(mapped.hex) };
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
        }))
    )
  );
}

function passesBrandFit(
  brief: ColorSystemBuilderBriefV2,
  seed: NormalizedSeed,
  family: ColorSystemSecondaryFamilyV2
): boolean {
  const claimed = brief.brandFitProfile.territories.find(
    territory => territory.territoryId === seed.territoryId
  );
  if (!claimed || claimed.status === 'excluded') return false;
  for (const member of family.members) {
    for (const value of Object.values(member.valuesByMode)) {
      if (!territoryContainsHex(claimed, value.hex)) return false;
      const excluded = brief.brandFitProfile.territories.some(
        territory =>
          territory.status === 'excluded' &&
          territory.appliesToProminence.includes(seed.prominence) &&
          territoryContainsHex(territory, value.hex)
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

function generateFamily(
  brief: ColorSystemBuilderBriefV2,
  seed: NormalizedSeed,
  direction: ColorSystemSecondaryDirectionV2,
  order: number
): GeneratedFamily | null {
  const recipe = seed.directionRecipes.find(candidate => candidate.direction === direction);
  if (!recipe) return null;
  const anchor = generatedAnchor(brief, seed, recipe);
  const light = generateColorScale(anchor.hex, 'light', seed.displayName);
  const dark = generateColorScale(anchor.hex, 'dark', seed.displayName);
  if (!light.validation.valid || !dark.validation.valid) return null;
  const identity = deterministicContentHash({
    seedId: seed.seedId,
    contributionId: seed.contributionId,
    direction,
    anchorHex: anchor.hex,
  }).slice(HASH_PREFIX.length, HASH_PREFIX.length + 12);
  const familyId = `secondary-${direction}-${identity}`;
  const sourceColorIds = [seed.sourceColorId];
  const provenanceEvidence = mergeEvidence(
    seed.evidenceIds,
    recipe.evidenceIds,
    brief.brandFitProfile.evidenceIds,
    brief.primaryLocks.flatMap(lock => lock.evidenceIds)
  );
  const members = light.steps.map((lightStep, index) => {
    const darkStep = dark.steps[index];
    const memberId = `${familyId}-step-${String(index + 1).padStart(2, '0')}`;
    return {
      stableMemberId: memberId,
      displayName: `${seed.displayName} ${index + 1}`,
      role: `step-${index + 1}`,
      order: index + 1,
      valuesByMode: {
        Light: colorValue(lightStep.hex),
        Dark: colorValue(darkStep.hex),
      },
      provenance: {
        kind: 'teul-generated' as const,
        authority: 'teul-proposal' as const,
        algorithmVersion: 'Teul OKLCH v3',
        seedId: seed.seedId,
        directionId: direction,
        hueOffsetDegrees:
          normalizeHue(seed.baseHueOffsetDegrees + recipe.hueOffsetDegrees + 180) - 180,
        requestedOklchByMode: {
          Light: lightStep.requestedOklch,
          Dark: darkStep.requestedOklch,
        },
        mappedOklchByMode: {
          // The final serialized sRGB value is authoritative after Local
          // MINDE plus channel quantization, so retain its exact round-trip
          // coordinate rather than the pre-quantization search coordinate.
          Light: hexToOklch(lightStep.hex),
          Dark: hexToOklch(darkStep.hex),
        },
        gamutMapping: 'local-minde-v1' as const,
        sourceColorIds,
        evidenceIds: provenanceEvidence,
      },
    };
  });
  const family: ColorSystemSecondaryFamilyV2 = {
    stableFamilyId: familyId,
    displayName: `${seed.displayName} — ${direction}`,
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
  };
  if (!passesBrandFit(brief, seed, family)) return null;
  return {
    family,
    jobEligibility: buildEligibility(seed, family),
    mappedStepCount:
      light.steps.filter(step => step.gamutMapped).length +
      dark.steps.filter(step => step.gamutMapped).length,
    sourceAdjustmentDeltaEOK: deltaEOK(exactSourceAnchor(brief, seed), anchor.hex),
    anchorHex: anchor.hex,
  };
}

function minimumFamilyAnchorSeparation(families: readonly GeneratedFamily[]): number {
  if (families.length < 2) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < families.length; left++) {
    for (let right = left + 1; right < families.length; right++) {
      minimum = Math.min(minimum, deltaEOK(families[left].anchorHex, families[right].anchorHex));
    }
  }
  return minimum;
}

function candidateAnchorMap(candidate: ColorSystemStrategyCandidateV2): Map<string, string> {
  return new Map(
    candidate.families.map(family => {
      const anchor = family.members.find(member => member.role === 'step-9');
      const value = anchor?.valuesByMode.Light;
      if (!value) fail(`${family.stableFamilyId} lacks its generated Light step-9 anchor.`);
      return [family.contributionId, value.hex];
    })
  );
}

function strategyMeanDeltaEOK(
  first: ColorSystemStrategyCandidateV2,
  second: ColorSystemStrategyCandidateV2
): number {
  const firstAnchors = candidateAnchorMap(first);
  const secondAnchors = candidateAnchorMap(second);
  const common = [...firstAnchors.keys()].filter(key => secondAnchors.has(key)).sort(compareText);
  if (common.length === 0) return 0;
  return (
    common.reduce(
      (total, key) => total + deltaEOK(firstAnchors.get(key)!, secondAnchors.get(key)!),
      0
    ) / common.length
  );
}

function buildDirectionCandidate(
  brief: ColorSystemBuilderBriefV2,
  seeds: readonly NormalizedSeed[],
  direction: ColorSystemSecondaryDirectionV2
): ColorSystemStrategyCandidateV2 | null {
  const generated: GeneratedFamily[] = [];
  const familyHashes = new Set<string>();
  let hasLeadingFamily = false;
  let rawEvaluations = 0;
  for (const seed of seeds) {
    if (rawEvaluations >= MAXIMUM_RAW_FAMILY_EVALUATIONS) break;
    rawEvaluations += 1;
    const result = generateFamily(brief, seed, direction, generated.length + 1);
    if (!result) continue;
    if (result.family.brandFit.prominence === 'leading') {
      if (hasLeadingFamily) continue;
      hasLeadingFamily = true;
    }
    const actualFamilyHash = familyValueHash(result.family);
    if (familyHashes.has(actualFamilyHash)) continue;
    familyHashes.add(actualFamilyHash);
    generated.push(result);
    if (
      generated.length >= brief.secondaryTargetFamilyCount ||
      generated.length >= MAXIMUM_PREQUALIFIED_FAMILIES
    ) {
      break;
    }
  }
  if (generated.length === 0) return null;
  const families = generated.map((entry, index) => ({ ...entry.family, order: index + 1 }));
  const jobEligibility = generated.flatMap(entry => entry.jobEligibility);
  const coveredJobs = new Set(jobEligibility.flatMap(entry => entry.jobs));
  const missingJobs = brief.requiredSecondaryJobs.filter(job => !coveredJobs.has(job));
  const blockers: ColorSystemStrategyCandidateV2['blockers'][number][] = [];
  if (families.length < brief.secondaryTargetFamilyCount) {
    blockers.push({
      code: 'FAMILY_TARGET_UNDERFILLED',
      message: `${direction} produced ${families.length} of ${brief.secondaryTargetFamilyCount} reviewed Secondary families.`,
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
    targetFamilyCount: brief.secondaryTargetFamilyCount,
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
        threshold: brief.secondaryTargetFamilyCount,
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
      {
        id: 'minimum-family-anchor-separation',
        label: 'Minimum exact family anchor separation',
        measuredValue: minimumFamilyAnchorSeparation(generated),
        unit: 'deltaEOK',
        evidenceIds,
      },
      {
        id: 'mean-source-adjustment',
        label: 'Mean exact source-to-generated anchor adjustment',
        measuredValue:
          generated.reduce((sum, entry) => sum + entry.sourceAdjustmentDeltaEOK, 0) /
          generated.length,
        unit: 'deltaEOK',
        evidenceIds,
      },
      {
        id: 'gamut-mapped-mode-steps',
        label: 'Light and Dark steps mapped through Local MINDE',
        measuredValue: generated.reduce((sum, entry) => sum + entry.mappedStepCount, 0),
        unit: 'mode-steps',
        evidenceIds,
      },
    ],
    explanation: {
      summary: `${direction} is a candidate under Teul policy, derived locally from reviewed source anchors and explicit job evidence.`,
      intendedUses: [
        'Secondary-family review',
        'Eligibility handoff to downstream application-system evaluation',
      ],
      excludedUses: [
        'Automatic chart ordering, semantic-role selection, or typography pairing',
        'A universal accessibility, harmony, or physical-screen-equivalence claim',
      ],
      tradeoffs: [
        `${families.length} of ${brief.secondaryTargetFamilyCount} family contributions survived exact scale, brand-territory, composition, and duplicate gates.`,
      ],
    },
    blockers,
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
  const candidates = COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS.map(direction =>
    buildDirectionCandidate(brief, normalizedSeeds, direction)
  )
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
          strategyMeanDeltaEOK(retained, candidate) <
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
