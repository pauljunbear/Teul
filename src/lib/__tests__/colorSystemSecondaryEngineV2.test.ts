import { describe, expect, it, vi } from 'vitest';
import { canonicalJson, canonicalNumber, deterministicContentHash } from '../colorSystemHashing';
import {
  COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemJobV2,
} from '../colorSystemBuilderV2Contracts';
import {
  assertColorSystemBuilderBriefV2Integrity,
  assertColorSystemStrategySetV2Integrity,
  buildColorSystemBrandFitProfileV2,
  buildColorSystemBuilderBriefV2,
  buildColorSystemExactPrimaryLockV2,
  buildColorSystemStrategyCandidateV2,
} from '../colorSystemBuilderV2Integrity';
import { generateColorScale } from '../colorScale';
import {
  COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK,
  COLOR_SYSTEM_SECONDARY_NEUTRAL_ANCHOR_SEPARATION_DELTA_E_OK,
  COLOR_SYSTEM_SECONDARY_STRATEGY_MINIMUM_MEAN_DELTA_E_OK,
  buildColorSystemSecondaryStrategySetV2,
  canonicalizeColorSystemSecondaryOklchV2,
  type ColorSystemSecondaryFamilySeedV2,
} from '../colorSystemSecondaryEngineV2';
import {
  COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3,
  colorSystemSecondaryDeltaEOKV3,
  colorSystemSecondaryOklchFromHexV3,
  colorSystemSecondaryOklchFromValueV3,
  realizeColorSystemSecondaryAnchorV3,
} from '../colorSystemSecondaryStrategyV3';
import { hexToOklch, hexToRgb } from '../utils';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';

const REQUIRED_JOBS = [
  'marketing-accent',
  'product-graphics',
  'functional-iconography',
  'product-ui-surface',
  'product-semantics',
  'categorical-data',
  'sequential-data',
  'diverging-data',
] as const satisfies readonly ColorSystemJobV2[];

const GENERIC_SECONDARY_REFERENCES = [
  '#3366CC',
  '#6699FF',
  '#CC3366',
  '#663399',
  '#2E8B57',
  '#00695C',
  '#8AA399',
  '#7A6A00',
  '#D4B942',
  '#E76F51',
  // Dark red rather than a sienna brown: every fixture pair must stay at or above
  // the enforced ΔEOK 0.08 anchor separation under all three direction recipes.
  '#8B0000',
] as const;

function hash(label: string): string {
  return deterministicContentHash(label);
}

function colorValue(hex: string): ColorSystemColorValueV2 {
  const rgb = hexToRgb(hex);
  return {
    colorSpace: 'srgb',
    hex: hex.toUpperCase(),
    components: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 },
    alpha: 1,
  };
}

function buildBrief(
  target: number,
  sourceReferences: readonly string[] = GENERIC_SECONDARY_REFERENCES
): ColorSystemBuilderBriefV2 {
  const primary = colorValue('#3366CC');
  const brandFitProfile = buildColorSystemBrandFitProfileV2({
    version: 'teul-brand-fit-profile/v2',
    territories: [
      {
        territoryId: 'reviewed-secondary',
        label: 'Reviewed Secondary territory',
        status: 'allowed',
        allowedJobs: REQUIRED_JOBS,
        allowedProminence: ['supporting', 'accent', 'leading'],
        appliesToProminence: ['supporting', 'accent', 'leading'],
        perceptualBounds: {
          hueRanges: [{ minimum: 0, maximum: 360 }],
          chroma: { minimum: 0, maximum: 0.5 },
          lightness: { minimum: 0, maximum: 1 },
        },
        evidenceIds: ['reviewed-secondary-territory'],
      },
      {
        territoryId: 'accent-band',
        label: 'Accent anchors in a mid-lightness band',
        status: 'allowed',
        allowedJobs: REQUIRED_JOBS,
        allowedProminence: ['accent'],
        appliesToProminence: ['accent'],
        perceptualBounds: {
          hueRanges: [{ minimum: 0, maximum: 360 }],
          chroma: { minimum: 0.04, maximum: 0.5 },
          lightness: { minimum: 0.3, maximum: 0.85 },
        },
        evidenceIds: ['accent-band-territory'],
      },
      {
        territoryId: 'unsupported-pink-leading',
        label: 'Unsupported pink leadership',
        status: 'excluded',
        allowedJobs: [],
        allowedProminence: [],
        appliesToProminence: ['leading'],
        perceptualBounds: {
          hueRanges: [{ minimum: 315, maximum: 355 }],
          chroma: { minimum: 0.04, maximum: 0.5 },
          lightness: { minimum: 0.15, maximum: 0.9 },
        },
        evidenceIds: ['owner-rejected-pink-leading'],
      },
    ],
    evidenceIds: ['generic-brand-fit-evidence'],
  });
  const contributions = Array.from({ length: target }, (_, index) => `assembly-${index + 1}`);
  return buildColorSystemBuilderBriefV2({
    version: COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    sourceHash: hash(`source-${target}`),
    sourcePackageHash: hash(`source-package-${target}`),
    brandFitProfileHash: brandFitProfile.profileHash,
    brandFitProfile,
    presentationProfileHash: hash(`presentation-${target}`),
    sections: [
      {
        role: 'primary',
        order: 1,
        disposition: 'preserve',
        jobs: ['brand-primary'],
        guidance: 'Preserve Primary exactly.',
        evidenceIds: ['primary-frame'],
        confirmation: 'source-evidenced',
      },
      {
        role: 'secondary',
        order: 2,
        disposition: 'rebuild',
        jobs: ['marketing-accent', 'product-semantics'],
        guidance: 'Rebuild Secondary from reviewed evidence.',
        evidenceIds: ['secondary-frame'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'product-graphics',
        order: 3,
        disposition: 'derive',
        jobs: ['product-graphics', 'functional-iconography', 'product-ui-surface'],
        guidance: 'Expose eligibility without selecting applications.',
        evidenceIds: ['product-graphics-frame'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'data-visualization',
        order: 4,
        disposition: 'derive',
        jobs: ['categorical-data', 'sequential-data', 'diverging-data'],
        guidance: 'Expose eligibility without selecting chart marks.',
        evidenceIds: ['data-visualization-frame'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'typography',
        order: 5,
        disposition: 'preserve',
        jobs: ['rendered-text-pair'],
        guidance: 'Keep contextual typography evaluation downstream.',
        evidenceIds: ['typography-frame'],
        confirmation: 'source-evidenced',
      },
    ],
    preservedColors: [
      {
        stableColorId: 'source-primary-blue',
        displayName: 'Primary Blue',
        section: 'primary',
        order: 1,
        valuesByMode: { Light: primary },
        evidenceIds: ['primary-blue-source'],
      },
      {
        stableColorId: 'source-black',
        displayName: 'Black',
        section: 'typography',
        order: 1,
        valuesByMode: { Light: colorValue('#000000') },
        evidenceIds: ['black-source'],
      },
      {
        stableColorId: 'source-white',
        displayName: 'White',
        section: 'typography',
        order: 2,
        valuesByMode: { Light: colorValue('#FFFFFF') },
        evidenceIds: ['white-source'],
      },
    ],
    sourceReferenceColors: sourceReferences.slice(0, target).map((hex, index) => ({
      stableColorId: `old-secondary-${index + 1}`,
      displayName: `Old Secondary ${index + 1}`,
      sourceSection: 'secondary' as const,
      sourceOrder: index + 1,
      valuesByMode: { Light: colorValue(hex) },
      evidenceIds: [`old-secondary-${index + 1}-source-evidence`],
    })),
    primaryLocks: [
      buildColorSystemExactPrimaryLockV2({
        version: 'teul-exact-primary-lock/v2',
        lockId: 'primary-blue-lock',
        stableColorId: 'source-primary-blue',
        sourcePath: 'Primary/Blue',
        mode: 'Light',
        expectedValue: primary,
        evidenceIds: ['primary-blue-source', 'primary-blue-lock-evidence'],
      }),
    ],
    primaryLockIds: ['primary-blue-lock'],
    secondaryTargetPolicy: {
      version: 'teul-secondary-target-policy/v2',
      derivationRule: 'max-retained-groups-and-job-minima-clamped',
      retainedSourceFamilyGroupIds: contributions.map(id => `retained-${id}`),
      assemblyContributionIds: contributions,
      jobMinimums: REQUIRED_JOBS.map((job, index) => ({
        job,
        minimumFamilies: index === 0 ? target : 1,
        authority: 'teul-policy-evidence' as const,
        evidenceIds: [`${job}-minimum-evidence`],
      })),
      evidenceIds: ['source-family-taxonomy', 'job-minimum-policy'],
    },
    secondaryTargetFamilyCount: target,
    requiredSecondaryJobs: REQUIRED_JOBS,
  });
}

function buildSeeds(
  brief: ColorSystemBuilderBriefV2,
  count = brief.secondaryTargetFamilyCount
): ColorSystemSecondaryFamilySeedV2[] {
  return brief.secondaryTargetPolicy.assemblyContributionIds.slice(0, count).map((id, index) => ({
    version: 'teul-secondary-family-seed/v2',
    authority: 'teul-proposal',
    seedId: `source-seed-${index + 1}`,
    displayName: `Secondary ${index + 1}`,
    contributionId: id,
    sourceColorId: `old-secondary-${index + 1}`,
    sourceMode: 'Light',
    baseHueOffsetDegrees: ((index % 3) - 1) * 3,
    baseChromaScale: 0.86 + (index % 3) * 0.04,
    baseLightnessShift: ((index % 3) - 1) * 0.025,
    territoryId: 'reviewed-secondary',
    prominence: index === 0 ? 'accent' : 'supporting',
    directionRecipes: [
      {
        direction: 'close-harmony',
        authority: 'teul-proposal',
        hueOffsetDegrees: 0,
        chromaScale: 0.92,
        lightnessShift: 0,
        evidenceIds: [`seed-${index + 1}-close-evidence`],
      },
      {
        direction: 'balanced-contrast',
        authority: 'teul-proposal',
        hueOffsetDegrees: 18,
        chromaScale: 0.84,
        lightnessShift: 0.01,
        evidenceIds: [`seed-${index + 1}-balanced-evidence`],
      },
      {
        direction: 'wide-spectrum',
        authority: 'teul-proposal',
        hueOffsetDegrees: 43,
        chromaScale: 0.76,
        lightnessShift: -0.01,
        evidenceIds: [`seed-${index + 1}-wide-evidence`],
      },
    ],
    eligibilityEvidence: [
      {
        modes: ['Light', 'Dark'],
        steps: [9],
        jobs: index === 0 ? REQUIRED_JOBS : ['marketing-accent'],
        authority: 'teul-policy-evidence',
        evidenceIds: [`seed-${index + 1}-job-evidence`],
      },
    ],
    evidenceIds: [`seed-${index + 1}-source-evidence`],
  }));
}

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function clone<T>(value: T): Mutable<T> {
  return JSON.parse(JSON.stringify(value)) as Mutable<T>;
}

/** Applies `perturb` to every non-integer number in a JSON-like structure. */
function perturbNumbers(value: unknown, perturb: (value: number) => number): unknown {
  if (typeof value === 'number') return Number.isInteger(value) ? value : perturb(value);
  if (Array.isArray(value)) return value.map(item => perturbNumbers(item, perturb));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, perturbNumbers(item, perturb)])
    );
  }
  return value;
}

function generatedSourceColorIds(family: Candidate['families'][number]): readonly string[] {
  const member = family.members[0];
  if (!member || member.provenance.kind !== 'teul-generated') {
    throw new Error(`${family.stableFamilyId} is not a generated family`);
  }
  return member.provenance.sourceColorIds;
}

type Candidate = ReturnType<typeof buildColorSystemSecondaryStrategySetV2>['candidates'][number];

function anchorHex(family: Candidate['families'][number]): string {
  const step = family.members.find(member => member.role === 'step-9');
  if (!step) throw new Error(`${family.stableFamilyId} lacks step 9`);
  return step.valuesByMode.Light.hex;
}

function measure(candidate: Candidate, id: string) {
  return candidate.measures.find(entry => entry.id === id);
}

/** Mean anchor distance over the contributions both candidates realized. */
function candidateMeanDeltaEOK(first: Candidate, second: Candidate): number {
  const secondByContribution = new Map(
    second.families.map(family => [family.contributionId, anchorHex(family)])
  );
  const common = first.families.filter(family => secondByContribution.has(family.contributionId));
  return (
    common.reduce(
      (total, family) =>
        total +
        colorSystemSecondaryDeltaEOKV3(
          anchorHex(family),
          secondByContribution.get(family.contributionId)!
        ),
      0
    ) / common.length
  );
}

function candidateById(
  strategy: ReturnType<typeof buildColorSystemSecondaryStrategySetV2>,
  id: string
) {
  const candidate = strategy.candidates.find(entry => entry.id === id);
  if (!candidate) throw new Error(`Missing candidate ${id}`);
  return candidate;
}

describe('deterministic v2 Secondary engine', () => {
  it('uses Teul numeric sentinels exactly at the CSS Color 4 powerless-hue boundary', () => {
    expect(canonicalizeColorSystemSecondaryOklchV2({ l: 0.5, c: 0.000004, h: 240 })).toEqual({
      l: 0.5,
      c: 0,
      h: 0,
    });
    expect(canonicalizeColorSystemSecondaryOklchV2({ l: 0.5, c: 0.00000400001, h: 240 })).toEqual({
      l: 0.5,
      c: 0.00000400001,
      h: 240,
    });
    expect(
      Object.is(canonicalizeColorSystemSecondaryOklchV2({ l: 0.5, c: 0.1, h: -0 }).h, -0)
    ).toBe(false);
  });

  it('builds a generic complete 11-family strategy without changing Primary', () => {
    const brief = buildBrief(11);
    const seeds = buildSeeds(brief);
    const before = canonicalJson(brief);
    const random = vi.spyOn(Math, 'random');
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);

    expect(strategy.status).toBe('ready');
    expect(strategy.candidates.length).toBeGreaterThanOrEqual(1);
    expect(strategy.candidates.length).toBeLessThanOrEqual(3);
    expect(strategy.candidates.every(candidate => candidate.status === 'complete')).toBe(true);
    expect(strategy.candidates[0].families).toHaveLength(11);
    expect(new Set(strategy.candidates[0].families.map(family => family.contributionId)).size).toBe(
      11
    );
    expect(strategy.candidates[0].families.every(family => family.members.length === 12)).toBe(
      true
    );
    expect(
      strategy.candidates[0].families.every(family =>
        family.members.every(
          member =>
            member.valuesByMode.Light &&
            member.valuesByMode.Dark &&
            member.provenance.kind === 'teul-generated' &&
            member.provenance.authority === 'teul-proposal' &&
            member.provenance.requestedOklchByMode.Light &&
            member.provenance.requestedOklchByMode.Dark &&
            member.provenance.mappedOklchByMode.Light &&
            member.provenance.mappedOklchByMode.Dark
        )
      )
    ).toBe(true);
    expect(
      strategy.candidates[0].jobEligibility.every(
        eligibility => eligibility.authority === 'teul-policy-evidence'
      )
    ).toBe(true);
    expect(strategy.candidates[0]).not.toHaveProperty('productGraphicsDerivations');
    expect(strategy.candidates[0]).not.toHaveProperty('dataVisualizationSelections');
    expect(strategy.candidates[0]).not.toHaveProperty('typographySpecimens');
    expect(strategy.candidates[0]).not.toHaveProperty('ratings');
    // Every direction keeps its chromatic anchors at least the enforced separation
    // apart, compares neutral anchors at the neutral threshold, skipped nothing, and
    // explains itself from measured hue, lightness, and separation numbers.
    for (const candidate of strategy.candidates) {
      const separation = measure(candidate, 'minimum-family-anchor-separation');
      expect(separation?.threshold).toBe(
        COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK
      );
      expect(separation?.measuredValue).toBeGreaterThanOrEqual(
        COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK
      );
      const neutralSeparation = measure(candidate, 'minimum-neutral-anchor-separation');
      expect(neutralSeparation?.threshold).toBe(
        COLOR_SYSTEM_SECONDARY_NEUTRAL_ANCHOR_SEPARATION_DELTA_E_OK
      );
      expect(neutralSeparation?.measuredValue).toBeGreaterThanOrEqual(
        COLOR_SYSTEM_SECONDARY_NEUTRAL_ANCHOR_SEPARATION_DELTA_E_OK
      );
      expect(measure(candidate, 'family-anchor-separation-skips')?.measuredValue).toBe(0);
      expect(candidate.explanation.summary).toMatch(/neutral ramp \(hue \d+°\)/);
      expect(candidate.explanation.summary).toMatch(
        /Adds 10 analogous accents|Adds 10 complementary accents|Adds 10 spectrum accents/
      );
      expect(candidate.explanation.summary).toMatch(/hue \d+°, L 0\.\d\d/);
      expect(candidate.explanation.summary).toMatch(/minimum family separation ΔEOK 0\.\d\d/);
      expect(candidate.explanation.tradeoffs.some(line => /gamut-mapped/.test(line))).toBe(true);
    }
    // This fixture's recipes differ by 18° and 43°, so directions must clear the
    // collapse threshold; the ≥ 0.05 expectation for compiler-planned directions
    // lives in the generic compiler strategy tests.
    for (let left = 0; left < strategy.candidates.length; left++) {
      for (let right = left + 1; right < strategy.candidates.length; right++) {
        expect(
          candidateMeanDeltaEOK(strategy.candidates[left], strategy.candidates[right])
        ).toBeGreaterThanOrEqual(COLOR_SYSTEM_SECONDARY_STRATEGY_MINIMUM_MEAN_DELTA_E_OK);
      }
    }
    // Every candidate names the direction it realizes, and its summary states its count.
    for (const candidate of strategy.candidates) {
      expect(candidate.direction).toBe(candidate.id.replace('secondary-', ''));
      expect(candidate.targetFamilyCount).toBe(brief.secondaryTargetFamilyCount);
      expect(candidate.explanation.summary).toMatch(/ 11 families in this direction\.$/);
    }
    // What the golden hash below protects, stated as properties. Every generated anchor
    // (Light step 9) is exactly the colour its seed transform and direction recipe realize
    // from the source reference, and its provenance states that transform's signed hue
    // offset; exactly one family per direction is neutral by the measured rule (Light
    // step-9 chroma below the shared maximum), and it is the one derived from the
    // low-chroma reference #8AA399, which is what the neutral-threshold measure compares.
    const seedsById = new Map(seeds.map(seed => [seed.seedId, seed]));
    for (const candidate of strategy.candidates) {
      for (const family of candidate.families) {
        const member = family.members.find(entry => entry.role === 'step-9');
        if (!member || member.provenance.kind !== 'teul-generated') {
          throw new Error(`${family.stableFamilyId} lacks a generated step 9`);
        }
        const seed = seedsById.get(member.provenance.seedId);
        const recipe = seed?.directionRecipes.find(
          entry => entry.direction === candidate.direction
        );
        const source = brief.sourceReferenceColors.find(
          color => color.stableColorId === seed?.sourceColorId
        );
        if (!seed || !recipe || !source) {
          throw new Error(`${family.stableFamilyId} lacks a seed, recipe, or source reference`);
        }
        const realized = realizeColorSystemSecondaryAnchorV3(
          source.valuesByMode.Light.hex,
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
        expect(member.valuesByMode.Light.hex).toBe(realized.hex);
        const signedOffset =
          ((((seed.baseHueOffsetDegrees + recipe.hueOffsetDegrees + 180) % 360) + 360) % 360) - 180;
        expect(member.provenance.hueOffsetDegrees).toBe(signedOffset);
      }
      const neutralFamilies = candidate.families.filter(
        family =>
          colorSystemSecondaryOklchFromHexV3(anchorHex(family)).c <
          COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3
      );
      expect(neutralFamilies.map(generatedSourceColorIds)).toEqual([['old-secondary-7']]);
    }
    // Re-based on 2026-09-08 when numeric canonicalization became one policy (twelve
    // significant digits at the hash layer, replacing nine decimal places) and the hue
    // wrapper canonicalized before wrapping; the properties above and the semantic
    // assertions earlier in this test are what the hash stands for. Earlier re-bases:
    // candidates carrying their direction and summaries their count; the fixture's
    // eleventh reference; anchor-separation enforcement.
    expect(strategy.strategySetHash).toBe(
      'sha256:01345cdf2ed146952ef04e23577f4e0bb7ff3c4350414532a1be1c21a1225009'
    );
    const serializedCoordinates = strategy.candidates.flatMap(candidate =>
      candidate.families.flatMap(family =>
        family.members.flatMap(member =>
          member.provenance.kind === 'teul-generated'
            ? [
                ...Object.values(member.provenance.requestedOklchByMode),
                ...Object.values(member.provenance.mappedOklchByMode),
              ]
            : []
        )
      )
    );
    expect(
      serializedCoordinates.every(
        value =>
          value !== undefined &&
          [value.l, value.c, value.h].every(
            component => component === Number(component.toPrecision(12))
          )
      )
    ).toBe(true);
    expect(serializedCoordinates.some(value => value?.c === 0 && value.h === 0)).toBe(true);
    expect(
      serializedCoordinates.every(
        value => value === undefined || value.c > 0.000004 || (value.c === 0 && value.h === 0)
      )
    ).toBe(true);
    const referenceIds = new Set(brief.sourceReferenceColors.map(color => color.stableColorId));
    expect(brief.preservedColors.every(color => !referenceIds.has(color.stableColorId))).toBe(true);
    expect(
      strategy.candidates[0].families.every(family =>
        family.members.every(
          member =>
            member.provenance.kind === 'teul-generated' &&
            member.provenance.sourceColorIds.every(sourceId => referenceIds.has(sourceId))
        )
      )
    ).toBe(true);
    expect(canonicalJson(brief)).toBe(before);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    assertColorSystemStrategySetV2Integrity(brief, strategy);
  });

  it('is byte-deterministic across source seed and nested recipe permutations', () => {
    const brief = buildBrief(6);
    const seeds = buildSeeds(brief);
    const first = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    const permuted = [...seeds].reverse().map(seed => ({
      ...seed,
      directionRecipes: [...seed.directionRecipes].reverse(),
      eligibilityEvidence: [...seed.eligibilityEvidence].reverse(),
    }));
    const second = buildColorSystemSecondaryStrategySetV2(brief, permuted);
    expect(canonicalJson(second)).toBe(canonicalJson(first));
  });

  it('hashes identically under sub-policy runtime noise and differently under a decision-relevant change', () => {
    const brief = buildBrief(11);
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, buildSeeds(brief));
    const { candidateHash, ...content } = strategy.candidates[0];
    const rehash = (candidate: unknown) =>
      deterministicContentHash({
        policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
        sourceHash: brief.sourceHash,
        sourcePackageHash: brief.sourcePackageHash,
        briefHash: brief.briefHash,
        candidate,
      });
    expect(rehash(content)).toBe(candidateHash);

    // The receipt hashes the canonical structure: every number passed through the one
    // policy. Stored values may be raw (an sRGB channel is n/255 to seventeen digits),
    // so the hash layer canonicalizes rather than trusting callers to have done so.
    let counted = 0;
    const canonical = perturbNumbers(content, value => {
      counted += 1;
      return canonicalNumber(value);
    });
    expect(counted).toBeGreaterThan(1000);
    expect(canonicalJson(canonical)).not.toBe(canonicalJson(content));
    expect(rehash(canonical)).toBe(candidateHash);

    // Cross-runtime stability as a rule, not an accident of routing: perturb every
    // canonical non-integer by 1e-13 relative, four orders of magnitude above 1-ulp
    // libm drift and three below the twelve-significant-digit policy (at most a tenth
    // of the last kept digit, so no value can reach a rounding boundary). The raw bytes
    // change; the receipt does not.
    const noisy = perturbNumbers(canonical, value => value * (1 + 1e-13));
    expect(canonicalJson(noisy)).not.toBe(canonicalJson(canonical));
    expect(rehash(noisy)).toBe(candidateHash);

    // A 1e-9 relative change on a decision-relevant value moves the receipt.
    const decision = clone(content);
    const separation = decision.measures.find(
      entry => entry.id === 'minimum-family-anchor-separation'
    );
    if (!separation || typeof separation.measuredValue !== 'number') {
      throw new Error('missing the anchor separation measure');
    }
    separation.measuredValue *= 1 + 1e-9;
    expect(rehash(decision)).not.toBe(candidateHash);
  });

  it('derives job eligibility only from explicit member/mode evidence', () => {
    const brief = buildBrief(4);
    const seeds = buildSeeds(brief);
    seeds.forEach(seed => {
      seed.displayName = 'Categorical sequential diverging product graphics';
      seed.eligibilityEvidence = [
        {
          modes: ['Dark'],
          steps: [12],
          jobs: ['marketing-accent'],
          authority: 'teul-policy-evidence',
          evidenceIds: [`${seed.seedId}-marketing-only`],
        },
      ];
    });
    const result = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(result.status).toBe('no-solution');
    expect(result.blockers.some(blocker => blocker.code === 'MISSING_REQUIRED_JOB')).toBe(true);
  });

  it('rejects unsupported pink leadership before assembly and reports target failure', () => {
    const brief = buildBrief(4);
    const seeds = buildSeeds(brief);
    const source = hexToOklch(GENERIC_SECONDARY_REFERENCES[0]);
    const pink = hexToOklch('#D946EF');
    seeds[0].prominence = 'leading';
    seeds[0].baseHueOffsetDegrees = pink.h - source.h;
    seeds[0].baseChromaScale = pink.c / source.c;
    seeds[0].baseLightnessShift = pink.l - source.l;
    seeds[0].directionRecipes = [
      {
        direction: 'close-harmony',
        authority: 'teul-proposal',
        hueOffsetDegrees: 0,
        chromaScale: 1,
        lightnessShift: 0,
        evidenceIds: ['pink-leading-direction-evidence'],
      },
    ];
    seeds.slice(1).forEach(seed => {
      seed.directionRecipes = seed.directionRecipes.filter(
        recipe => recipe.direction === 'close-harmony'
      );
    });
    const result = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(result.status).toBe('no-solution');
    expect(result.candidates).toEqual([]);
    expect(result.blockers.some(blocker => blocker.code === 'NO_VALID_FAMILY_SET')).toBe(true);
  });

  it('reports no solution when the evidence-derived target is underfilled', () => {
    const brief = buildBrief(6);
    const result = buildColorSystemSecondaryStrategySetV2(brief, buildSeeds(brief, 5));
    expect(result.status).toBe('no-solution');
    expect(result.candidates).toEqual([]);
    expect(result.blockers.some(blocker => blocker.code === 'NO_VALID_FAMILY_SET')).toBe(true);
  });

  it('collapses exact duplicate realized directions instead of presenting fake variety', () => {
    const brief = buildBrief(4);
    const seeds = buildSeeds(brief);
    seeds.forEach(seed => {
      seed.directionRecipes = seed.directionRecipes.map(recipe => ({
        ...recipe,
        hueOffsetDegrees: 0,
        chromaScale: 1,
        lightnessShift: 0,
      }));
    });
    const result = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(result.status).toBe('ready');
    expect(result.candidates).toHaveLength(1);
  });

  it('rejects hidden application selections and forged eligibility jobs at the seed boundary', () => {
    const brief = buildBrief(4);
    const hidden = clone(buildSeeds(brief));
    (
      hidden[0] as (typeof hidden)[number] & { dataVisualizationSelections?: unknown[] }
    ).dataVisualizationSelections = [];
    expect(() => buildColorSystemSecondaryStrategySetV2(brief, hidden)).toThrow(
      'unsupported fields'
    );

    const forged = clone(buildSeeds(brief));
    forged[0].eligibilityEvidence[0].jobs = ['brand-primary'];
    expect(() => buildColorSystemSecondaryStrategySetV2(brief, forged)).toThrow(
      'undeclared Secondary job'
    );

    const forgedSeedAuthority = clone(buildSeeds(brief));
    (forgedSeedAuthority[0] as { authority: string }).authority = 'governed-source';
    expect(() => buildColorSystemSecondaryStrategySetV2(brief, forgedSeedAuthority)).toThrow(
      'Teul proposals'
    );

    const forgedRecipeAuthority = clone(buildSeeds(brief));
    (forgedRecipeAuthority[0].directionRecipes[0] as { authority: string }).authority =
      'governed-source';
    expect(() => buildColorSystemSecondaryStrategySetV2(brief, forgedRecipeAuthority)).toThrow(
      'Teul proposal'
    );

    const forgedEligibilityAuthority = clone(buildSeeds(brief));
    (forgedEligibilityAuthority[0].eligibilityEvidence[0] as { authority: string }).authority =
      'governed-source';
    expect(() => buildColorSystemSecondaryStrategySetV2(brief, forgedEligibilityAuthority)).toThrow(
      'Teul policy evidence'
    );
  });

  it('binds evidence-only reference values into output hashes without preserving them', () => {
    const firstBrief = buildBrief(4);
    const changedReferences: string[] = [...GENERIC_SECONDARY_REFERENCES];
    changedReferences[0] = '#97B9EA';
    const secondBrief = buildBrief(4, changedReferences);
    const first = buildColorSystemSecondaryStrategySetV2(firstBrief, buildSeeds(firstBrief));
    const second = buildColorSystemSecondaryStrategySetV2(secondBrief, buildSeeds(secondBrief));

    expect(secondBrief.briefHash).not.toBe(firstBrief.briefHash);
    expect(second.strategySetHash).not.toBe(first.strategySetHash);
    expect(secondBrief.preservedColors.map(color => color.stableColorId)).toEqual(
      firstBrief.preservedColors.map(color => color.stableColorId)
    );
    expect(secondBrief.preservedColors).not.toContainEqual(
      expect.objectContaining({ stableColorId: 'old-secondary-1' })
    );
  });

  it('rejects unknown seed references and preserved/reference identity collisions', () => {
    const brief = buildBrief(4);
    const unknown = buildSeeds(brief);
    unknown[0].sourceColorId = 'unknown-old-secondary';
    expect(() => buildColorSystemSecondaryStrategySetV2(brief, unknown)).toThrow(
      'does not resolve to an exact preserved or evidence-only reference color'
    );

    const collision = clone(brief);
    collision.sourceReferenceColors[0].stableColorId = collision.preservedColors[0].stableColorId;
    expect(() =>
      assertColorSystemBuilderBriefV2Integrity(collision as unknown as ColorSystemBuilderBriefV2)
    ).toThrow('must not share stable identities');
  });

  it('reproduces an exact source color as step 9 in every direction when recipes are identity', () => {
    const brief = buildBrief(4);
    const seeds = buildSeeds(brief);
    seeds[0].baseHueOffsetDegrees = 0;
    seeds[0].baseChromaScale = 1;
    seeds[0].baseLightnessShift = 0;
    seeds[0].directionRecipes = seeds[0].directionRecipes.map(recipe => ({
      ...recipe,
      hueOffsetDegrees: 0,
      chromaScale: 1,
      lightnessShift: 0,
    }));
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(strategy.status).toBe('ready');
    expect(strategy.candidates.length).toBe(3);
    for (const candidate of strategy.candidates) {
      const derived = candidate.families.find(family => family.contributionId === 'assembly-1');
      expect(derived && anchorHex(derived)).toBe(GENERIC_SECONDARY_REFERENCES[0]);
      expect(derived?.order).toBe(1);
      expect(measure(candidate, 'mean-source-adjustment')?.measuredValue).toBeGreaterThan(0);
      expect(candidate.explanation.summary).toContain(
        '1 existing hue as full Light and Dark scale (Old Secondary 1)'
      );
    }
  });

  it('enforces anchor separation inside a direction and measures the skip', () => {
    const brief = buildBrief(4);
    const seeds = buildSeeds(brief);
    // Seed 4 lands on seed 3's close-harmony anchor (pink) in close-harmony only.
    const pink = hexToOklch(GENERIC_SECONDARY_REFERENCES[2]);
    const purple = hexToOklch(GENERIC_SECONDARY_REFERENCES[3]);
    const seedThreeCloseAnchor = {
      l: pink.l + 0.025,
      c: pink.c * 0.94 * 0.92,
      h: pink.h + 3,
    };
    seeds[3].directionRecipes = seeds[3].directionRecipes.map(recipe =>
      recipe.direction === 'close-harmony'
        ? {
            ...recipe,
            hueOffsetDegrees: seedThreeCloseAnchor.h - purple.h + 3 + 2,
            chromaScale: seedThreeCloseAnchor.c / (purple.c * 0.86),
            lightnessShift: seedThreeCloseAnchor.l - purple.l + 0.025,
          }
        : recipe
    );
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(strategy.status).toBe('ready');
    const close = candidateById(strategy, 'secondary-close-harmony');
    expect(close.status).toBe('underfilled');
    expect(close.actualFamilyCount).toBe(3);
    expect(close.families.map(family => family.contributionId)).not.toContain('assembly-4');
    expect(measure(close, 'family-anchor-separation-skips')?.measuredValue).toBe(1);
    expect(close.blockers.map(blocker => blocker.code)).toContain('FAMILY_TARGET_UNDERFILLED');
    expect(
      close.explanation.tradeoffs.some(line => /1 generated family was skipped/.test(line))
    ).toBe(true);
    for (const id of ['secondary-balanced-contrast', 'secondary-wide-spectrum']) {
      const candidate = candidateById(strategy, id);
      expect(candidate.status).toBe('complete');
      expect(measure(candidate, 'family-anchor-separation-skips')?.measuredValue).toBe(0);
      expect(
        measure(candidate, 'minimum-family-anchor-separation')?.measuredValue
      ).toBeGreaterThanOrEqual(COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK);
    }
  });

  it('compares neutral anchors at the neutral threshold and blocks near-identical neutrals', () => {
    const closeOnly = (seed: ColorSystemSecondaryFamilySeedV2) => ({
      ...seed,
      directionRecipes: seed.directionRecipes.filter(
        recipe => recipe.direction === 'close-harmony'
      ),
    });
    const brief = buildBrief(4);
    const seeds = buildSeeds(brief).map(closeOnly);
    // Seed 1 becomes a neutral ramp; seed 2 becomes a low-chroma blue at the same lightness,
    // closer than the chromatic threshold but not closer than the neutral threshold.
    seeds[0].baseHueOffsetDegrees = 0;
    seeds[0].baseChromaScale = 0.05;
    seeds[0].baseLightnessShift = 0;
    const blue = hexToOklch(GENERIC_SECONDARY_REFERENCES[0]);
    const lightBlue = hexToOklch(GENERIC_SECONDARY_REFERENCES[1]);
    seeds[1].baseHueOffsetDegrees = 0;
    seeds[1].baseChromaScale = 0.05 / (lightBlue.c * 0.92);
    seeds[1].baseLightnessShift = blue.l - lightBlue.l;
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(strategy.status).toBe('ready');
    const candidate = strategy.candidates[0];
    expect(candidate.status).toBe('complete');
    const neutralSeparation = measure(candidate, 'minimum-neutral-anchor-separation');
    expect(neutralSeparation?.threshold).toBe(
      COLOR_SYSTEM_SECONDARY_NEUTRAL_ANCHOR_SEPARATION_DELTA_E_OK
    );
    expect(neutralSeparation?.measuredValue).toBeGreaterThanOrEqual(
      COLOR_SYSTEM_SECONDARY_NEUTRAL_ANCHOR_SEPARATION_DELTA_E_OK
    );
    expect(neutralSeparation?.measuredValue).toBeLessThan(
      COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK
    );
    const neutral = candidate.families.find(family => family.contributionId === 'assembly-1');
    expect(neutral && hexToOklch(anchorHex(neutral)).c).toBeLessThan(0.03);
    // Neutral ramps are accepted last, so the family order shows chromatic families first.
    expect(candidate.families[candidate.families.length - 1]?.contributionId).toBe('assembly-1');
    expect(candidate.explanation.summary).toMatch(/plus a cool neutral ramp \(hue \d+°\)/);

    // Two neutrals closer than the neutral threshold collapse to one, leaving the target unmet.
    const duplicateNeutral = buildSeeds(brief).map(closeOnly);
    duplicateNeutral[0].baseChromaScale = 0.05;
    duplicateNeutral[0].baseHueOffsetDegrees = 0;
    duplicateNeutral[0].baseLightnessShift = 0;
    duplicateNeutral[1].baseChromaScale = 0.06;
    duplicateNeutral[1].baseHueOffsetDegrees = 0;
    duplicateNeutral[1].baseLightnessShift = blue.l - lightBlue.l;
    const collapsed = buildColorSystemSecondaryStrategySetV2(brief, duplicateNeutral);
    expect(collapsed.status).toBe('no-solution');
    expect(collapsed.blockers.some(blocker => blocker.code === 'NO_VALID_FAMILY_SET')).toBe(true);
  });

  it('checks the claimed territory on the anchor while excluded territories cover every step', () => {
    const brief = buildBrief(4);
    const seeds = buildSeeds(brief).map(seed => ({
      ...seed,
      prominence: 'accent' as const,
      territoryId: 'accent-band',
      directionRecipes: seed.directionRecipes.filter(
        recipe => recipe.direction === 'close-harmony'
      ),
    }));
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(strategy.status).toBe('ready');
    const candidate = strategy.candidates[0];
    expect(candidate.status).toBe('complete');
    // Every 12-step scale leaves the anchor band at its light and dark ends by construction.
    expect(
      candidate.families.every(family =>
        family.members.some(member => hexToOklch(member.valuesByMode.Light.hex).l > 0.85)
      )
    ).toBe(true);
    expect(
      candidate.families.every(family => {
        const anchor = hexToOklch(anchorHex(family));
        return anchor.l >= 0.3 && anchor.l <= 0.85 && anchor.c >= 0.04;
      })
    ).toBe(true);

    // An anchor pushed above the band is rejected even though its steps would not change class.
    const outOfBand = buildSeeds(brief).map(seed => ({
      ...seed,
      prominence: 'accent' as const,
      territoryId: 'accent-band',
      directionRecipes: seed.directionRecipes.filter(
        recipe => recipe.direction === 'close-harmony'
      ),
    }));
    outOfBand[1].baseLightnessShift = 0.25;
    const rejected = buildColorSystemSecondaryStrategySetV2(brief, outOfBand);
    expect(rejected.status).toBe('no-solution');
  });

  it('names a family per direction from the recipe and keeps member names aligned', () => {
    const brief = buildBrief(4);
    const seeds = buildSeeds(brief);
    seeds[0].directionRecipes = seeds[0].directionRecipes.map(recipe =>
      recipe.direction === 'balanced-contrast'
        ? { ...recipe, displayName: 'Complementary accent 1' }
        : recipe
    );
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    const balanced = candidateById(strategy, 'secondary-balanced-contrast');
    const family = balanced.families.find(entry => entry.contributionId === 'assembly-1');
    expect(family?.displayName).toBe('Complementary accent 1 — balanced-contrast');
    expect(family?.members[8]?.displayName).toBe('Complementary accent 1 9');
    const close = candidateById(strategy, 'secondary-close-harmony');
    expect(close.families.find(entry => entry.contributionId === 'assembly-1')?.displayName).toBe(
      'Secondary 1 — close-harmony'
    );

    const blank = clone(buildSeeds(brief));
    (blank[0].directionRecipes[0] as { displayName?: string }).displayName = '   ';
    expect(() => buildColorSystemSecondaryStrategySetV2(brief, blank)).toThrow('displayName');
  });

  it('sizes each direction by its own reviewed target and keeps smaller directions distinct', () => {
    // Six contributions; Derived keeps four, Complementary five, Spectrum all six.
    const byDirection = { 'close-harmony': 4, 'balanced-contrast': 5, 'wide-spectrum': 6 } as const;
    const uniform = buildBrief(6);
    const { briefHash: _hash, ...content } = uniform;
    const brief = buildColorSystemBuilderBriefV2({
      ...content,
      secondaryTargetFamilyCountByDirection: byDirection,
      secondaryTargetFamilyCountBand: { minimum: 4, maximum: 6 },
      secondaryTargetFamilyCountReasonByDirection: {
        'close-harmony': 'Derived: 4 families. No new accent: every confirmed job is covered.',
        'balanced-contrast': 'Complementary: 5 families. One complementary accent adds contrast.',
        'wide-spectrum': 'Spectrum: 6 families. Both accents are needed for 5 categorical series.',
      },
    });
    // Slots five and six exist only where the planner gave them a recipe.
    const seeds = buildSeeds(brief).map((seed, index) => ({
      ...seed,
      directionRecipes: seed.directionRecipes.filter(recipe =>
        index < 4
          ? true
          : index === 4
            ? recipe.direction !== 'close-harmony'
            : recipe.direction === 'wide-spectrum'
      ),
    }));
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(strategy.status).toBe('ready');
    expect(strategy.candidates.map(candidate => candidate.id)).toEqual([
      'secondary-close-harmony',
      'secondary-balanced-contrast',
      'secondary-wide-spectrum',
    ]);
    for (const candidate of strategy.candidates) {
      const direction = candidate.direction!;
      expect(candidate.status).toBe('complete');
      expect(candidate.targetFamilyCount).toBe(byDirection[direction]);
      expect(candidate.actualFamilyCount).toBe(byDirection[direction]);
      expect(candidate.families).toHaveLength(byDirection[direction]);
      expect(measure(candidate, 'family-target-coverage')?.threshold).toBe(byDirection[direction]);
      expect(candidate.explanation.summary).toContain(
        brief.secondaryTargetFamilyCountReasonByDirection![direction]
      );
      expect(candidate.explanation.summary).not.toMatch(/families in this direction/);
      expect(candidate.explanation.tradeoffs[0]).toBe(
        `${byDirection[direction]} of ${byDirection[direction]} family contributions survived exact scale, brand-territory, anchor-separation, composition, and duplicate gates.`
      );
    }
    const close = candidateById(strategy, 'secondary-close-harmony');
    expect(close.families.map(family => family.contributionId)).not.toContain('assembly-5');
    expect(close.families.map(family => family.contributionId)).not.toContain('assembly-6');
    // A direction that misses a slot it was given is underfilled against its own target only.
    const missing = seeds.map(seed =>
      seed.contributionId === 'assembly-4'
        ? {
            ...seed,
            directionRecipes: seed.directionRecipes.filter(
              recipe => recipe.direction !== 'balanced-contrast'
            ),
          }
        : seed
    );
    const partial = buildColorSystemSecondaryStrategySetV2(brief, missing);
    const balanced = candidateById(partial, 'secondary-balanced-contrast');
    expect(balanced.status).toBe('underfilled');
    expect(balanced.actualFamilyCount).toBe(4);
    expect(balanced.targetFamilyCount).toBe(5);
    expect(balanced.blockers.map(blocker => blocker.message)).toContain(
      'balanced-contrast produced 4 of 5 reviewed Secondary families.'
    );
    expect(candidateById(partial, 'secondary-close-harmony').status).toBe('complete');
    expect(candidateById(partial, 'secondary-wide-spectrum').status).toBe('complete');
  });

  it('builds no candidate and no underfilled blocker for a direction the brief omits', () => {
    // p4-A: the planner found no room for Spectrum's accent, so the brief omits it with the
    // reason in its place; Spectrum's target is Derived's and its reason is the omission.
    const reason = 'Spectrum is not offered: 23 owned hues leave no room within 24 families.';
    const uniform = buildBrief(6);
    const { briefHash: _hash, ...content } = uniform;
    const brief = buildColorSystemBuilderBriefV2({
      ...content,
      secondaryTargetFamilyCountByDirection: {
        'close-harmony': 4,
        'balanced-contrast': 6,
        'wide-spectrum': 4,
      },
      secondaryTargetFamilyCountBand: { minimum: 4, maximum: 6 },
      secondaryTargetFamilyCountReasonByDirection: {
        'close-harmony': 'Derived: 4 families. No new accent: every confirmed job is covered.',
        'balanced-contrast': 'Complementary: 6 families. A complementary pair of 2 adds contrast.',
        'wide-spectrum': reason,
      },
      secondaryOmittedDirections: [{ direction: 'wide-spectrum', cause: 'family-limit', reason }],
    });
    expect(brief.secondaryOmittedDirections).toEqual([
      { direction: 'wide-spectrum', cause: 'family-limit', reason },
    ]);
    // Slots five and six carry Complementary recipes only; the first four carry every
    // direction's recipe, Spectrum's included, so the engine must skip Spectrum by the
    // brief, not by a missing recipe.
    const seeds = buildSeeds(brief).map((seed, index) => ({
      ...seed,
      directionRecipes: seed.directionRecipes.filter(
        recipe => index < 4 || recipe.direction === 'balanced-contrast'
      ),
    }));
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(strategy.status).toBe('ready');
    expect(strategy.blockers).toEqual([]);
    expect(strategy.candidates.map(candidate => candidate.id)).toEqual([
      'secondary-close-harmony',
      'secondary-balanced-contrast',
    ]);
    for (const candidate of strategy.candidates) {
      expect(candidate.status).toBe('complete');
      expect(candidate.blockers).toEqual([]);
      expect(candidate.direction).not.toBe('wide-spectrum');
    }
    expect(
      strategy.candidates.some(candidate =>
        candidate.blockers.some(blocker => blocker.code === 'FAMILY_TARGET_UNDERFILLED')
      )
    ).toBe(false);
    // The set's own integrity accepts it, and a candidate that claims the omitted
    // direction is refused at the boundary.
    assertColorSystemStrategySetV2Integrity(brief, strategy);
    const derived = candidateById(strategy, 'secondary-close-harmony');
    const {
      actualSystemHash: _system,
      candidateHash: _candidate,
      compositionReceipt: _receipt,
      ...derivedContent
    } = derived;
    expect(() =>
      buildColorSystemStrategyCandidateV2(brief, {
        ...derivedContent,
        id: 'secondary-wide-spectrum',
        direction: 'wide-spectrum',
      })
    ).toThrow('does not offer');
    // Without the omission the same seeds would have produced a Spectrum candidate: the
    // omission, not the recipes, is what removes it.
    const offeredAll = buildColorSystemBuilderBriefV2({
      ...content,
      secondaryTargetFamilyCountByDirection: {
        'close-harmony': 4,
        'balanced-contrast': 6,
        'wide-spectrum': 4,
      },
      secondaryTargetFamilyCountBand: { minimum: 4, maximum: 6 },
    });
    const withSpectrum = buildColorSystemSecondaryStrategySetV2(
      offeredAll,
      buildSeeds(offeredAll).map((seed, index) => ({
        ...seed,
        directionRecipes: seed.directionRecipes.filter(
          recipe => index < 4 || recipe.direction === 'balanced-contrast'
        ),
      }))
    );
    expect(withSpectrum.candidates.map(candidate => candidate.id)).toContain(
      'secondary-wide-spectrum'
    );
  });

  it('reads a status reserve by its contribution identity, ranks it after accents, and treats it as structural', () => {
    // The fourth reference is a sea green (hue ≈ 155°) so the reserve family sits in the
    // success range it is named for.
    const withGreen = buildBrief(4, [...GENERIC_SECONDARY_REFERENCES.slice(0, 3), '#2E8B57']);
    const brief = buildColorSystemBuilderBriefV2({
      ...(({ briefHash: _hash, ...content }) => content)(withGreen),
      secondaryTargetPolicy: {
        ...withGreen.secondaryTargetPolicy,
        assemblyContributionIds: [
          'assembly-1',
          'assembly-2',
          'assembly-3',
          'generic-status-reserve-success',
        ],
        retainedSourceFamilyGroupIds: [
          'retained-assembly-1',
          'retained-assembly-2',
          'retained-assembly-3',
          'retained-reserve',
        ],
      },
    });
    const seeds = buildSeeds(brief).map(seed =>
      seed.contributionId === 'generic-status-reserve-success'
        ? {
            ...seed,
            displayName: 'Status reserve — success',
            prominence: 'supporting' as const,
            // Identity recipes in every direction: the reserve is the same family everywhere.
            directionRecipes: seed.directionRecipes.map(recipe => ({
              ...recipe,
              hueOffsetDegrees: 0,
              chromaScale: 1,
              lightnessShift: 0,
            })),
            eligibilityEvidence: seed.eligibilityEvidence.map(entry => ({
              ...entry,
              jobs: ['product-semantics' as const],
            })),
          }
        : seed
    );
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(strategy.status).toBe('ready');
    for (const candidate of strategy.candidates) {
      const reserve = candidate.families.find(
        family => family.contributionId === 'generic-status-reserve-success'
      );
      expect(reserve).toBeDefined();
      // Accents first, then the reserve, then nothing neutral in this fixture.
      expect(candidate.families[candidate.families.length - 1]?.contributionId).toBe(
        'generic-status-reserve-success'
      );
      expect(candidate.explanation.summary).toMatch(
        /Adds a conventional status reserve — green \(hue \d+°\) for success — because your palette has no hue in the 120°–170° range\./
      );
      expect(candidate.explanation.summary).not.toMatch(
        /Adds 4 (analogous|complementary|spectrum)/
      );
      const reserveJobs = new Set(
        candidate.jobEligibility
          .filter(entry => entry.ref.familyId === reserve!.stableFamilyId)
          .flatMap(entry => entry.jobs)
      );
      expect([...reserveJobs]).toEqual(['product-semantics']);
    }
    // The reserve anchor is identical in every direction and so is excluded from the
    // cross-direction distinctness measure: three directions remain.
    expect(strategy.candidates).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------------ */
/* p3-H: pinned tints, skipped status reserves, and the family ceiling        */
/* ------------------------------------------------------------------------ */

/** 24 hues at least ΔEOK 0.08 apart (see the strategy tests); fills the 24-family ceiling. */
const CEILING_REFERENCES = [
  '#7C0438',
  '#B84451',
  '#ED7666',
  '#FFB18F',
  '#702900',
  '#A95B00',
  '#D29000',
  '#F2C542',
  '#4E4300',
  '#737900',
  '#89AE37',
  '#9BE17D',
  '#00550D',
  '#008B54',
  '#00BB95',
  '#00E9D7',
  '#004F52',
  '#008395',
  '#00B2DF',
  '#70D8FF',
  '#004580',
  '#3070C7',
  '#7898FB',
  '#BEC3FF',
];

const SKIPPED_WARNING = {
  role: 'warning' as const,
  contributionId: 'generic-status-reserve-warning',
  hue: 75,
  realizedHex: '#CD8300',
  nearestHex: '#5E540E',
  nearestDisplayName: 'Old Secondary 8',
  deltaEOK: 0.06,
  cause: 'separation' as const,
  reason:
    'The conventional amber for warning (hue 75°) would sit ΔEOK 0.06 from Old Secondary 8 (#5E540E), below the 0.08 separation rule, so no reserve was added.',
};

/** The engine test brief plus preserved Secondary tints of the first source reference. */
function briefWithTints(
  references: readonly string[] = GENERIC_SECONDARY_REFERENCES,
  tints: readonly { id: string; name: string; hex: string }[]
): ColorSystemBuilderBriefV2 {
  const { briefHash: _briefHash, ...content } = buildBrief(4, references);
  return buildColorSystemBuilderBriefV2({
    ...content,
    // p5-A: recorded tints ride the brief only under Extend (`derive`); a replaced
    // (`rebuild`) Secondary carries none of them, so the pin fixture extends.
    sections: content.sections.map(section =>
      section.role === 'secondary' ? { ...section, disposition: 'derive' as const } : section
    ) as unknown as ColorSystemBuilderBriefV2['sections'],
    preservedColors: [
      ...content.preservedColors,
      ...tints.map((tint, index) => ({
        stableColorId: tint.id,
        displayName: tint.name,
        section: 'secondary' as const,
        order: index + 1,
        valuesByMode: { Light: colorValue(tint.hex) },
        evidenceIds: [`${tint.id}-evidence`],
      })),
    ],
  });
}

/** The first seed with an identity base and an identity Close Harmony recipe, pinning the given tints. */
function identitySeedWithPins(
  brief: ColorSystemBuilderBriefV2,
  pinnedSources: readonly { sourceColorId: string; sourceMode: string }[]
): ColorSystemSecondaryFamilySeedV2[] {
  const seeds = buildSeeds(brief);
  return [
    {
      ...seeds[0],
      baseHueOffsetDegrees: 0,
      baseChromaScale: 1,
      baseLightnessShift: 0,
      directionRecipes: seeds[0].directionRecipes.map(recipe =>
        recipe.direction === 'close-harmony'
          ? { ...recipe, hueOffsetDegrees: 0, chromaScale: 1, lightnessShift: 0 }
          : recipe
      ),
      pinnedSources: [...pinnedSources],
    },
    ...seeds.slice(1),
  ];
}

function nearestLightStep(baseHex: string, tintHex: string): number {
  const light = generateColorScale(baseHex, 'light', 'test');
  const target = hexToOklch(tintHex).l;
  let best = 1;
  let distance = Number.POSITIVE_INFINITY;
  for (const step of light.steps) {
    if (step.step >= 9) continue;
    const delta = Math.abs(step.oklch.l - target);
    if (delta < distance) {
      distance = delta;
      best = step.step;
    }
  }
  return best;
}

describe('deterministic v2 Secondary engine: p3-H pins, skipped reserves, and the ceiling', () => {
  it('pins a preserved tint at the nearest Light step of the exact-source scale and records every skip', () => {
    const brief = briefWithTints(GENERIC_SECONDARY_REFERENCES, [
      { id: 'source-tint-light', name: 'Old Secondary 1 Light', hex: '#E0EAFA' },
      { id: 'source-tint-twin', name: 'Old Secondary 1 Pale', hex: '#DCE6F8' },
      { id: 'source-tint-deep', name: 'Old Secondary 1 Deep', hex: '#1F3F80' },
    ]);
    const seeds = identitySeedWithPins(brief, [
      { sourceColorId: 'source-tint-light', sourceMode: 'Light' },
      { sourceColorId: 'source-tint-twin', sourceMode: 'Light' },
      { sourceColorId: 'source-tint-deep', sourceMode: 'Light' },
    ]);
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(strategy.status).toBe('ready');
    const step = nearestLightStep('#3366CC', '#E0EAFA');
    expect(step).toBeGreaterThanOrEqual(1);
    expect(step).toBeLessThanOrEqual(8);

    const exact = candidateById(strategy, 'secondary-close-harmony');
    const family = exact.families.find(item => item.contributionId === 'assembly-1')!;
    expect(anchorHex(family)).toBe('#3366CC');
    const member = family.members.find(item => item.order === step)!;
    expect(member.valuesByMode.Light.hex).toBe('#E0EAFA');
    expect(member.valuesByMode.Dark).toBeDefined();
    expect(member.provenance.kind).toBe('teul-generated');
    expect(member.provenance.sourceColorIds).toEqual(['old-secondary-1', 'source-tint-light']);
    if (member.provenance.kind === 'teul-generated') {
      expect(member.provenance.requestedOklchByMode.Light).toEqual(
        canonicalizeColorSystemSecondaryOklchV2(hexToOklch('#E0EAFA'))
      );
      expect(member.provenance.mappedOklchByMode.Light).toEqual(
        canonicalizeColorSystemSecondaryOklchV2(hexToOklch('#E0EAFA'))
      );
    }
    expect(family.pinnedMembers).toEqual([
      {
        stableMemberId: member.stableMemberId,
        step,
        mode: 'Light',
        sourceColorId: 'source-tint-light',
        sourceDisplayName: 'Old Secondary 1 Light',
        hex: '#E0EAFA',
      },
    ]);
    expect(family.pinSkips).toHaveLength(2);
    expect(family.pinSkips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceColorId: 'source-tint-twin',
          hex: '#DCE6F8',
          nearestStep: step,
          reason: expect.stringMatching(
            /^Step \d already holds Old Secondary 1 Light \(#E0EAFA\); Old Secondary 1 Pale is nearest the same step\.$/
          ),
        }),
        expect.objectContaining({
          sourceColorId: 'source-tint-deep',
          hex: '#1F3F80',
          nearestStep: null,
          reason: expect.stringMatching(/is not lighter than its base/),
        }),
      ])
    );
    // Every other member keeps generated provenance from the source alone.
    expect(
      family.members
        .filter(item => item.order !== step)
        .every(item => item.provenance.sourceColorIds.length === 1)
    ).toBe(true);
    // Families other than the pinned one carry no pin records at all.
    expect(
      exact.families
        .filter(item => item.contributionId !== 'assembly-1')
        .every(item => !item.pinnedMembers && !item.pinSkips)
    ).toBe(true);

    // A direction whose anchor is not the exact source pins nothing and says why.
    const shifted = candidateById(strategy, 'secondary-balanced-contrast');
    const shiftedFamily = shifted.families.find(item => item.contributionId === 'assembly-1')!;
    expect(shiftedFamily.pinnedMembers).toBeUndefined();
    expect(shiftedFamily.pinSkips).toHaveLength(3);
    expect(
      shiftedFamily.pinSkips!.every(skip =>
        /is not the exact source color \(#3366CC\), so the recorded tint is not pinned/.test(
          skip.reason
        )
      )
    ).toBe(true);

    // Byte-deterministic and canonical under the integrity assertion.
    expect(buildColorSystemSecondaryStrategySetV2(brief, seeds).strategySetHash).toBe(
      strategy.strategySetHash
    );
    assertColorSystemStrategySetV2Integrity(brief, strategy);
  });

  it('keeps the generated step and records the reason when a pin fails the scale validator', () => {
    // A pale pink recorded as the tint of a bright lime: nearest Light step 6, but its
    // relative luminance breaks the strict order the validator requires.
    const brief = briefWithTints(
      ['#D6F20F', ...GENERIC_SECONDARY_REFERENCES.slice(1)],
      [{ id: 'source-tint-pink', name: 'Beacon Light', hex: '#FDE3EA' }]
    );
    const seeds = identitySeedWithPins(brief, [
      { sourceColorId: 'source-tint-pink', sourceMode: 'Light' },
    ]);
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(strategy.status).toBe('ready');
    const exact = candidateById(strategy, 'secondary-close-harmony');
    const family = exact.families.find(item => item.contributionId === 'assembly-1')!;
    expect(anchorHex(family)).toBe('#D6F20F');
    expect(family.pinnedMembers).toBeUndefined();
    expect(family.pinSkips).toEqual([
      {
        sourceColorId: 'source-tint-pink',
        sourceDisplayName: 'Beacon Light',
        hex: '#FDE3EA',
        mode: 'Light',
        nearestStep: 6,
        reason:
          'Pinning Beacon Light (#FDE3EA) at step 6 fails the scale validator (non-monotonic-relative-luminance); the generated step stands.',
      },
    ]);
    const generated = generateColorScale('#D6F20F', 'light', 'x').steps[5].hex.toUpperCase();
    expect(family.members.find(item => item.order === 6)!.valuesByMode.Light.hex).toBe(generated);
    // The tint is still a preserved color of the brief.
    expect(brief.preservedColors.some(color => color.stableColorId === 'source-tint-pink')).toBe(
      true
    );
    assertColorSystemStrategySetV2Integrity(brief, strategy);
  });

  it('rejects pins that do not resolve to an opaque preserved color other than the anchor', () => {
    const brief = briefWithTints(GENERIC_SECONDARY_REFERENCES, [
      { id: 'source-tint-light', name: 'Old Secondary 1 Light', hex: '#E0EAFA' },
    ]);
    const build = (pins: readonly { sourceColorId: string; sourceMode: string }[]) =>
      buildColorSystemSecondaryStrategySetV2(brief, identitySeedWithPins(brief, pins));
    expect(() => build([{ sourceColorId: 'old-secondary-2', sourceMode: 'Light' }])).toThrow(
      'does not resolve to a preserved color and mode'
    );
    expect(() => build([{ sourceColorId: 'source-tint-light', sourceMode: 'Dark' }])).toThrow(
      'does not resolve to a preserved color and mode'
    );
    expect(() => build([{ sourceColorId: 'old-secondary-1', sourceMode: 'Light' }])).toThrow(
      'does not resolve to a preserved color and mode'
    );
    expect(() =>
      build([
        { sourceColorId: 'source-tint-light', sourceMode: 'Light' },
        { sourceColorId: 'source-tint-light', sourceMode: 'Light' },
      ])
    ).toThrow('must name each preserved color once');
    expect(() => build([])).toThrow('must not be empty when present');
  });

  it('carries the brief’s skipped status reserves onto every candidate and refuses any other list', () => {
    const { briefHash: _briefHash, ...content } = buildBrief(4);
    const brief = buildColorSystemBuilderBriefV2({
      ...content,
      skippedStatusReserves: [SKIPPED_WARNING],
    });
    expect(brief.skippedStatusReserves).toEqual([SKIPPED_WARNING]);
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, buildSeeds(brief));
    expect(strategy.status).toBe('ready');
    for (const candidate of strategy.candidates) {
      expect(candidate.skippedStatusReserves).toEqual([SKIPPED_WARNING]);
    }
    const {
      candidateHash: _candidateHash,
      actualSystemHash: _actualSystemHash,
      compositionReceipt: _receipt,
      skippedStatusReserves: _skipped,
      ...candidateContent
    } = strategy.candidates[0];
    expect(() => buildColorSystemStrategyCandidateV2(brief, candidateContent)).toThrow(
      'Candidate skipped status reserves must equal the reviewed builder brief.'
    );
    expect(() =>
      buildColorSystemStrategyCandidateV2(brief, {
        ...candidateContent,
        skippedStatusReserves: [{ ...SKIPPED_WARNING, deltaEOK: 0.07 }],
      })
    ).toThrow('Candidate skipped status reserves must equal the reviewed builder brief.');
    // Without skips on the brief, a candidate may not carry any.
    const plain = buildBrief(4);
    const plainStrategy = buildColorSystemSecondaryStrategySetV2(plain, buildSeeds(plain));
    expect(
      plainStrategy.candidates.every(candidate => candidate.skippedStatusReserves === undefined)
    ).toBe(true);
    assertColorSystemStrategySetV2Integrity(brief, strategy);
  });

  it('builds and validates a 24-family direction at the ceiling', () => {
    const brief = buildBrief(24, CEILING_REFERENCES);
    expect(brief.secondaryTargetFamilyCount).toBe(24);
    // Exact anchors in Close Harmony (identity base and recipe), as the compiler plans
    // owned hues; the references themselves sit at least ΔEOK 0.08 apart.
    const seeds = buildSeeds(brief).map(seed => ({
      ...seed,
      baseHueOffsetDegrees: 0,
      baseChromaScale: 1,
      baseLightnessShift: 0,
      directionRecipes: seed.directionRecipes.map(recipe =>
        recipe.direction === 'close-harmony'
          ? { ...recipe, hueOffsetDegrees: 0, chromaScale: 1, lightnessShift: 0 }
          : recipe
      ),
    }));
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(strategy.status).toBe('ready');
    const full = candidateById(strategy, 'secondary-close-harmony');
    expect(full.status).toBe('complete');
    expect(full.actualFamilyCount).toBe(24);
    expect(full.families.map(anchorHex)).toEqual(CEILING_REFERENCES);
    expect(full!.families.map(family => family.order)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1)
    );
    // 24 families × 12 steps = 288 primitives beside 3 preserved sources, under the 512 Variable ceiling.
    expect(
      brief.preservedColors.length +
        full!.families.reduce((count, family) => count + family.members.length, 0)
    ).toBe(291);
    assertColorSystemStrategySetV2Integrity(brief, strategy);
  });
});

describe('native sRGB engine preservation', () => {
  it('keeps exact native source anchors in both modes and pins full native tints with actual provenance', () => {
    const native = buildColorSystemSrgbValueV1({ r: 0.201, g: 0.399, b: 0.801 });
    const tint = buildColorSystemSrgbValueV1({
      r: 224 / 255 + 0.0003,
      g: 234 / 255 - 0.0004,
      b: 250 / 255 - 0.0002,
    });
    const { briefHash: _briefHash, ...content } = briefWithTints(GENERIC_SECONDARY_REFERENCES, [
      { id: 'source-tint-native', name: 'Old Secondary 1 Light', hex: tint.hex },
    ]);
    const brief = buildColorSystemBuilderBriefV2({
      ...content,
      sourceReferenceColors: content.sourceReferenceColors.map(color =>
        color.stableColorId === 'old-secondary-1'
          ? { ...color, valuesByMode: { Light: native } }
          : color
      ),
      preservedColors: content.preservedColors.map(color =>
        color.stableColorId === 'source-tint-native'
          ? { ...color, valuesByMode: { Light: tint } }
          : color
      ),
    });
    const seeds = identitySeedWithPins(brief, [
      { sourceColorId: 'source-tint-native', sourceMode: 'Light' },
    ]);
    seeds[0] = {
      ...seeds[0],
      directionRecipes: seeds[0].directionRecipes.map(recipe => ({
        ...recipe,
        hueOffsetDegrees: 0,
        chromaScale: 1,
        lightnessShift: 0,
      })),
    };
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    expect(strategy.status).toBe('ready');
    expect(strategy.candidates).toHaveLength(3);
    for (const candidate of strategy.candidates) {
      const family = candidate.families.find(item => item.contributionId === 'assembly-1')!;
      const anchor = family.members.find(member => member.order === 9)!;
      expect(anchor.valuesByMode).toEqual({ Light: native, Dark: native });
      expect(anchor.provenance.kind).toBe('teul-generated');
      if (anchor.provenance.kind === 'teul-generated') {
        expect(anchor.provenance.algorithmVersion).toBe('Teul OKLCH v3; source-anchored-oklch-v1');
        expect(anchor.provenance.mappedOklchByMode).toEqual({
          Light: colorSystemSecondaryOklchFromValueV3(native),
          Dark: colorSystemSecondaryOklchFromValueV3(native),
        });
      }
      expect(family.pinnedMembers).toHaveLength(1);
      const pinned = family.members.find(
        member => member.stableMemberId === family.pinnedMembers![0].stableMemberId
      )!;
      expect(pinned.valuesByMode.Light).toEqual(tint);
      if (pinned.provenance.kind === 'teul-generated') {
        expect(pinned.provenance.mappedOklchByMode.Light).toEqual(
          colorSystemSecondaryOklchFromValueV3(tint)
        );
      }
      expect(
        colorSystemSecondaryOklchFromValueV3(family.members[2].valuesByMode.Light).c
      ).toBeGreaterThan(colorSystemSecondaryOklchFromValueV3(tint).c);
    }
    expect(() => assertColorSystemStrategySetV2Integrity(brief, strategy)).not.toThrow();
  });

  it('keeps an earlier byte pin when a later native tint activates source-anchored interpolation', () => {
    const byteHex = generateColorScale('#3366CC').steps[3].hex.toUpperCase();
    const tint = buildColorSystemSrgbValueV1({ r: 0.88, g: 0.919, b: 0.981 });
    const { briefHash: _briefHash, ...content } = briefWithTints(GENERIC_SECONDARY_REFERENCES, [
      { id: 'source-a-byte', name: 'Recorded byte tint', hex: byteHex },
      { id: 'source-b-native', name: 'Recorded native tint', hex: tint.hex },
    ]);
    const brief = buildColorSystemBuilderBriefV2({
      ...content,
      preservedColors: content.preservedColors.map(color =>
        color.stableColorId === 'source-b-native'
          ? { ...color, valuesByMode: { Light: tint } }
          : color
      ),
    });
    const seeds = identitySeedWithPins(brief, [
      { sourceColorId: 'source-a-byte', sourceMode: 'Light' },
      { sourceColorId: 'source-b-native', sourceMode: 'Light' },
    ]);
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, seeds);
    const family = candidateById(strategy, 'secondary-close-harmony').families.find(
      item => item.contributionId === 'assembly-1'
    )!;
    expect(family.pinnedMembers).toHaveLength(2);
    expect(family.pinSkips).toBeUndefined();
    expect(family.members[3].valuesByMode.Light).toEqual(colorValue(byteHex));
    expect(family.members[1].valuesByMode.Light).toEqual(tint);
    expect(family.members[8].valuesByMode.Light).toEqual(colorValue('#3366CC'));
    expect(family.members[2].provenance.sourceColorIds).toEqual([
      'old-secondary-1',
      'source-a-byte',
      'source-b-native',
    ]);
    expect(family.members[4].provenance.sourceColorIds).toEqual(['old-secondary-1']);
    for (const member of family.members) {
      expect(member.provenance).toMatchObject({
        algorithmVersion: 'Teul OKLCH v3; source-anchored-oklch-v1',
      });
    }
    expect(() => assertColorSystemStrategySetV2Integrity(brief, strategy)).not.toThrow();

    const changedTint = buildColorSystemSrgbValueV1({ ...tint.components, r: 0.89 });
    const { briefHash: _originalHash, ...original } = brief;
    const changedBrief = buildColorSystemBuilderBriefV2({
      ...original,
      preservedColors: brief.preservedColors.map(color =>
        color.stableColorId === 'source-b-native'
          ? { ...color, valuesByMode: { Light: changedTint } }
          : color
      ),
    });
    const changed = buildColorSystemSecondaryStrategySetV2(
      changedBrief,
      identitySeedWithPins(changedBrief, seeds[0].pinnedSources!)
    );
    const changedFamily = candidateById(changed, 'secondary-close-harmony').families.find(
      item => item.contributionId === 'assembly-1'
    )!;
    expect(deterministicContentHash(changedFamily.members[2])).not.toBe(
      deterministicContentHash(family.members[2])
    );
    expect(changedFamily.members[2].valuesByMode.Light).not.toEqual(
      family.members[2].valuesByMode.Light
    );
    expect(changedFamily.members[2].provenance.sourceColorIds).toEqual(
      family.members[2].provenance.sourceColorIds
    );
    expect(changedFamily.members[3]).toEqual(family.members[3]);
    expect(changedFamily.members.slice(4)).toEqual(family.members.slice(4));
    expect(() => assertColorSystemStrategySetV2Integrity(changedBrief, changed)).not.toThrow();
  });
});
