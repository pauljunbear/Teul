import { describe, expect, it, vi } from 'vitest';
import { canonicalJson, deterministicContentHash } from '../colorSystemAudit';
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
} from '../colorSystemBuilderV2Integrity';
import {
  buildColorSystemSecondaryStrategySetV2,
  type ColorSystemSecondaryFamilySeedV2,
} from '../colorSystemSecondaryEngineV2';
import { hexToOklch, hexToRgb } from '../utils';

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
  '#8D4E35',
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

describe('deterministic v2 Secondary engine', () => {
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
    expect(strategy.strategySetHash).toBe(
      'sha256:6573e79dacc69ce45f2c506ebb2cdbaf5d94dee6d7ed41fa53324602ee023f1f'
    );
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
});
