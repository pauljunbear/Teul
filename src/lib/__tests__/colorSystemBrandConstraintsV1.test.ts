import { describe, expect, it } from 'vitest';
import type { ColorSystemBrandTerritoryV2 } from '../colorSystemBuilderV2Contracts';
import { buildColorSystemBrandFitProfileV2 } from '../colorSystemBuilderV2Integrity';
import { deterministicContentHash } from '../colorSystemHashing';
import {
  buildColorSystemBrandConstraintsV1,
  COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_LIMITS,
  COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_SCHEMA_VERSION,
  ColorSystemBrandConstraintsV1Error,
  colorSystemBrandTerritoryMatchesSourceV1,
  hashColorSystemBrandTerritoryRuleV1,
  lowerColorSystemBrandConstraintsV1,
  normalizeColorSystemBrandRulesV1,
  parseColorSystemBrandConstraintsV1,
  type ColorSystemBrandConstraintDecisionV1,
  type ColorSystemBrandConstraintsV1,
  type ColorSystemBrandTerritoryRuleV1,
} from '../colorSystemBrandConstraintsV1';

const SOURCE_HASH = deterministicContentHash('synthetic-source');
const FULL_BOUNDS = {
  hueRanges: [{ minimum: 0, maximum: 360 }],
  chroma: { minimum: 0, maximum: 0.5 },
  lightness: { minimum: 0, maximum: 1 },
};

type RestrictionRule = Extract<ColorSystemBrandTerritoryRuleV1, { effect: 'restrict-to' }>;

function rule(overrides: Partial<RestrictionRule> = {}): RestrictionRule {
  return {
    id: 'cool-support',
    label: 'Cool supporting families',
    kind: 'brand-territory',
    scope: { kind: 'generated-families', prominence: ['supporting'], modes: 'all', jobs: 'all' },
    bounds: {
      hueRanges: [{ minimum: 180, maximum: 270 }],
      chroma: { minimum: 0.02, maximum: 0.2 },
      lightness: { minimum: 0.2, maximum: 0.9 },
    },
    origin: 'inferred',
    evidenceRefs: ['source:sample'],
    effect: 'restrict-to',
    allowedJobs: ['marketing-accent', 'product-graphics'],
    ...overrides,
  };
}

function exclusion(id = 'excluded-leading'): ColorSystemBrandTerritoryRuleV1 {
  const { allowedJobs: _allowedJobs, ...rest } = rule();
  return { ...rest, id, effect: 'exclude', scope: { ...rest.scope, prominence: ['leading'] } };
}

function decision(
  selectedRule: ColorSystemBrandTerritoryRuleV1,
  status: 'accepted' | 'rejected' = 'accepted'
): ColorSystemBrandConstraintDecisionV1 {
  return {
    ruleId: selectedRule.id,
    ruleHash: hashColorSystemBrandTerritoryRuleV1(selectedRule),
    status,
    actor: { kind: 'agent', ref: 'agent:synthetic' },
    authorityRef: 'delegation:synthetic',
  };
}

function content(
  rules: readonly ColorSystemBrandTerritoryRuleV1[] = [rule()],
  decisions: readonly ColorSystemBrandConstraintDecisionV1[] = []
): Omit<ColorSystemBrandConstraintsV1, 'fragmentHash'> {
  return {
    schemaVersion: COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_SCHEMA_VERSION,
    sourceSnapshotHash: SOURCE_HASH,
    rules,
    decisions,
  };
}

function reviewed(
  rules: readonly ColorSystemBrandTerritoryRuleV1[] = [rule()]
): ColorSystemBrandConstraintsV1 {
  return buildColorSystemBrandConstraintsV1(
    content(
      rules,
      rules.map(item => decision(item))
    )
  );
}

function baseProfile(
  overrides: Partial<ColorSystemBrandTerritoryV2> = {},
  extra: readonly ColorSystemBrandTerritoryV2[] = []
) {
  return buildColorSystemBrandFitProfileV2({
    version: 'teul-brand-fit-profile/v2',
    evidenceIds: ['base:profile'],
    territories: [
      {
        territoryId: 'base',
        label: 'Original allowed range',
        status: 'allowed',
        allowedJobs: ['marketing-accent', 'product-graphics', 'functional-iconography'],
        allowedProminence: ['leading', 'supporting', 'accent'],
        appliesToProminence: ['leading', 'supporting', 'accent'],
        perceptualBounds: FULL_BOUNDS,
        evidenceIds: ['base:territory'],
        ...overrides,
      },
      ...extra,
    ],
  });
}

function expectCode(
  operation: () => unknown,
  code: ColorSystemBrandConstraintsV1Error['code']
): void {
  expect(operation).toThrow(ColorSystemBrandConstraintsV1Error);
  expect(operation).toThrow(expect.objectContaining({ code }));
}

describe('brand constraint content and review identity', () => {
  it('canonicalizes equivalent interval subdivisions and input order without changing the hash', () => {
    const first = rule({
      bounds: {
        ...FULL_BOUNDS,
        hueRanges: [
          { minimum: 200, maximum: 250 },
          { minimum: 180, maximum: 210 },
        ],
      },
      evidenceRefs: ['source:b', 'source:a'],
    });
    const second = exclusion();
    const built = reviewed([first, second]);
    const equivalent = {
      ...first,
      bounds: { ...FULL_BOUNDS, hueRanges: [{ minimum: 180, maximum: 250 }] },
      evidenceRefs: ['source:a', 'source:b'],
    };
    expect(reviewed([second, equivalent])).toEqual(built);
    expect(hashColorSystemBrandTerritoryRuleV1(first)).toBe(
      deterministicContentHash(built.rules.find(item => item.id === first.id))
    );
    expect(
      parseColorSystemBrandConstraintsV1({
        ...built,
        rules: [...built.rules].reverse(),
        decisions: [...built.decisions].reverse(),
      })
    ).toEqual(built);
  });

  it('keeps evidence origin separate from adoption and records the actual decision actor', () => {
    const built = reviewed();
    expect(built.rules[0].origin).toBe('inferred');
    expect(built.decisions[0]).toMatchObject({
      status: 'accepted',
      actor: { kind: 'agent' },
      authorityRef: 'delegation:synthetic',
    });
    const selectedRule = rule();
    const userDecision = {
      ...decision(selectedRule),
      actor: { kind: 'user', ref: 'local-plugin-user' },
      authorityRef: `confirmed-plan:${'a'.repeat(128)}`,
    };
    const ownerReviewed = buildColorSystemBrandConstraintsV1(
      content([selectedRule], [userDecision as ColorSystemBrandConstraintDecisionV1])
    );
    expect(ownerReviewed.fragmentHash).not.toBe(built.fragmentHash);
    expect(ownerReviewed.rules[0].origin).toBe('inferred');
  });

  it('accepts an unreviewed draft but cannot lower it as accepted policy', () => {
    const built = buildColorSystemBrandConstraintsV1(content());
    expect(parseColorSystemBrandConstraintsV1(built)).toEqual(built);
    expect(lowerColorSystemBrandConstraintsV1(built, baseProfile())).toMatchObject({
      status: 'infeasible',
      issues: [{ code: 'UNREVIEWED_RULE', ruleIds: ['cool-support'] }],
    });
  });

  it('rejects adoption decisions attached to changed rules', () => {
    const original = rule();
    const changed = { ...original, origin: 'source-stated' as const };
    expectCode(
      () => buildColorSystemBrandConstraintsV1(content([changed], [decision(original)])),
      'STALE_BRAND_CONSTRAINT_DECISION'
    );
  });

  it.each(['sourceSnapshotHash', 'fragmentHash', 'decisions'] as const)(
    'rejects changed %s on serialized content',
    field => {
      const built = reviewed();
      const changed =
        field === 'decisions'
          ? {
              ...built,
              decisions: [{ ...built.decisions[0], authorityRef: 'different-authority' }],
            }
          : { ...built, [field]: deterministicContentHash('different') };
      expectCode(
        () => parseColorSystemBrandConstraintsV1(changed),
        'BRAND_CONSTRAINT_HASH_MISMATCH'
      );
    }
  );

  it('separates building content from verifying a serialized hash', () => {
    expectCode(() => buildColorSystemBrandConstraintsV1(reviewed()), 'INVALID_BRAND_CONSTRAINTS');
    expectCode(() => parseColorSystemBrandConstraintsV1(content()), 'INVALID_BRAND_CONSTRAINTS');
  });

  it('does not mutate caller-owned input when sorting and lowering', () => {
    const input = content([exclusion(), rule()], [decision(rule()), decision(exclusion())]);
    const before = JSON.stringify(input);
    const built = buildColorSystemBrandConstraintsV1(input);
    const base = baseProfile();
    const baseBefore = JSON.stringify(base);
    lowerColorSystemBrandConstraintsV1(built, base);
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(base)).toBe(baseBefore);
  });
});

describe('bounded, explicit supported scope', () => {
  it('normalizes jobs without altering evidence text and rejects collisions after native trimming', () => {
    const imported = rule({
      allowedJobs: [' product-graphics ', ' marketing-accent '] as never,
      evidenceRefs: [' source:sample '],
    });
    const [normalized] = normalizeColorSystemBrandRulesV1([imported]);
    expect(normalized).toMatchObject({
      allowedJobs: ['marketing-accent', 'product-graphics'],
      evidenceRefs: [' source:sample '],
    });
    for (const collision of [
      { allowedJobs: ['product-graphics', ' product-graphics '] as never },
      { evidenceRefs: ['source:sample', ' source:sample '] },
    ]) {
      expectCode(
        () => normalizeColorSystemBrandRulesV1([rule(collision)]),
        'INVALID_BRAND_CONSTRAINTS'
      );
    }
  });

  it.each([
    { contextIds: ['marketing'] },
    { modes: ['Light'] },
    { jobs: ['marketing-accent'] },
    { kind: 'source-colors' },
    { prominence: ['background'] },
  ])('rejects unsupported scope %j', overrides => {
    const selectedRule = rule();
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(
          content([
            {
              ...selectedRule,
              scope: { ...selectedRule.scope, ...overrides },
            } as ColorSystemBrandTerritoryRuleV1,
          ])
        ),
      'UNSUPPORTED_BRAND_CONSTRAINT_SCOPE'
    );
  });

  it('rejects job-specific exclusions rather than applying them globally', () => {
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(
          content([
            {
              ...exclusion(),
              allowedJobs: ['marketing-accent'],
            } as ColorSystemBrandTerritoryRuleV1,
          ])
        ),
      'UNSUPPORTED_BRAND_CONSTRAINT_SCOPE'
    );
  });

  it.each([
    { hueRanges: [{ minimum: 330, maximum: 20 }] },
    { hueRanges: [{ minimum: 0, maximum: 361 }] },
    { hueRanges: [] },
    { chroma: { minimum: 0.3, maximum: 0.2 } },
    { chroma: { minimum: 0, maximum: 0.500000000000001 } },
    { lightness: { minimum: -0.000000000000001, maximum: 1 } },
    { lightness: { minimum: 0, maximum: Number.POSITIVE_INFINITY } },
    { lightness: { minimum: Number.NaN, maximum: 1 } },
  ])('uses native bounds validation before canonical rounding for %j', bounds => {
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(
          content([rule({ bounds: { ...FULL_BOUNDS, ...bounds } })])
        ),
      'INVALID_BRAND_CONSTRAINTS'
    );
  });

  it.each(['has spaces', '_starts-with-symbol', 'a'.repeat(129)])(
    'rejects non-message-compatible rule id %s',
    id => {
      expectCode(
        () => buildColorSystemBrandConstraintsV1(content([rule({ id })])),
        'INVALID_BRAND_CONSTRAINTS'
      );
    }
  );

  it('rejects unknown fields and values rather than silently dropping unimplemented policy', () => {
    const selectedRule = rule();
    expectCode(
      () => buildColorSystemBrandConstraintsV1({ ...content(), sourceContext: 'screen' }),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(
          content([{ ...selectedRule, minimumArea: 0.5 } as ColorSystemBrandTerritoryRuleV1])
        ),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(
          content([
            rule({
              bounds: {
                ...FULL_BOUNDS,
                colorSpace: 'hsl',
              } as ColorSystemBrandTerritoryRuleV1['bounds'],
            }),
          ])
        ),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(
          content([rule({ allowedJobs: ['unimplemented-job'] as never })])
        ),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(content([rule({ origin: 'owner-confirmed' as never })])),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(
          content(
            [selectedRule],
            [
              {
                ...decision(selectedRule),
                acceptedAsOrigin: 'source-stated',
              } as ColorSystemBrandConstraintDecisionV1,
            ]
          )
        ),
      'INVALID_BRAND_CONSTRAINTS'
    );
  });

  it('rejects duplicate rules, decisions, evidence, and missing decision authority', () => {
    const selectedRule = rule();
    const adopted = decision(selectedRule);
    expectCode(
      () => buildColorSystemBrandConstraintsV1(content([selectedRule, selectedRule])),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () => buildColorSystemBrandConstraintsV1(content([selectedRule], [adopted, adopted])),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () => buildColorSystemBrandConstraintsV1(content([rule({ evidenceRefs: ['same', 'same'] })])),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(
          content([selectedRule], [{ ...adopted, authorityRef: '' }])
        ),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(
          content([selectedRule], [{ ...adopted, ruleId: 'missing-rule' }])
        ),
      'INVALID_BRAND_CONSTRAINTS'
    );
  });

  it('accepts at most 50 rules and enforces per-rule input bounds', () => {
    const maximumRules = COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_LIMITS.maximumRules;
    expect(maximumRules).toBe(50);
    const rules = Array.from({ length: maximumRules }, (_, index) => rule({ id: `rule-${index}` }));
    expect(buildColorSystemBrandConstraintsV1(content(rules)).rules).toHaveLength(50);
    expectCode(
      () => buildColorSystemBrandConstraintsV1(content([...rules, rule({ id: 'extra' })])),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () => buildColorSystemBrandConstraintsV1(content([rule({ label: 'a'.repeat(513) })])),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(
          content([
            rule({ evidenceRefs: Array.from({ length: 33 }, (_, index) => `source-${index}`) }),
          ])
        ),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(
          content([
            rule({
              bounds: {
                ...FULL_BOUNDS,
                hueRanges: Array.from({ length: 33 }, () => ({ minimum: 0, maximum: 360 })),
              },
            }),
          ])
        ),
      'INVALID_BRAND_CONSTRAINTS'
    );
  });

  it('rejects sparse arrays before they can omit a rule or a numeric range', () => {
    const sparseRules = new Array<ColorSystemBrandTerritoryRuleV1>(1);
    expectCode(
      () => buildColorSystemBrandConstraintsV1(content(sparseRules)),
      'INVALID_BRAND_CONSTRAINTS'
    );
    expectCode(
      () =>
        buildColorSystemBrandConstraintsV1(
          content([
            rule({
              bounds: {
                ...FULL_BOUNDS,
                hueRanges: new Array<{ minimum: number; maximum: number }>(1),
              },
            }),
          ])
        ),
      'INVALID_BRAND_CONSTRAINTS'
    );
  });
});

describe('lowering to existing engine territories', () => {
  it('retains naming identity for original and scoped IDs without matching another prominence or source', () => {
    const lowered = lowerColorSystemBrandConstraintsV1(reviewed(), baseProfile());
    if (lowered.status !== 'ready') throw new Error('Expected a supported profile.');
    for (const binding of lowered.territoryBindings) {
      expect(
        colorSystemBrandTerritoryMatchesSourceV1(
          binding.sourceTerritoryId,
          binding.sourceTerritoryId,
          binding.prominence
        )
      ).toBe(true);
      expect(
        colorSystemBrandTerritoryMatchesSourceV1(
          binding.territoryId,
          binding.sourceTerritoryId,
          binding.prominence
        )
      ).toBe(true);
      expect(
        colorSystemBrandTerritoryMatchesSourceV1(
          binding.territoryId,
          'another-source',
          binding.prominence
        )
      ).toBe(false);
      expect(
        colorSystemBrandTerritoryMatchesSourceV1(
          binding.territoryId,
          binding.sourceTerritoryId,
          binding.prominence === 'accent' ? 'supporting' : 'accent'
        )
      ).toBe(false);
    }
  });

  it('intersects union ranges, chroma, lightness, and jobs without constraining other prominence', () => {
    const first = rule({
      bounds: {
        hueRanges: [
          { minimum: 350, maximum: 360 },
          { minimum: 0, maximum: 40 },
          { minimum: 180, maximum: 270 },
        ],
        chroma: { minimum: 0.02, maximum: 0.2 },
        lightness: { minimum: 0.2, maximum: 0.9 },
      },
    });
    const second = rule({
      id: 'narrower-support',
      bounds: {
        hueRanges: [
          { minimum: 10, maximum: 30 },
          { minimum: 240, maximum: 300 },
        ],
        chroma: { minimum: 0.1, maximum: 0.3 },
        lightness: { minimum: 0, maximum: 0.8 },
      },
      allowedJobs: ['product-graphics'],
    });
    const fragment = reviewed([first, second]);
    const lowered = lowerColorSystemBrandConstraintsV1(fragment, baseProfile());
    expect(lowered.status).toBe('ready');
    if (lowered.status !== 'ready') throw new Error('Expected a supported profile.');
    expect(lowered.territoryBindings).toHaveLength(3);
    expect(lowered.profile.territories.find(item => item.territoryId === 'base')).toBeUndefined();
    const supportingId = lowered.territoryBindings.find(
      item => item.prominence === 'supporting'
    )?.territoryId;
    const supporting = lowered.profile.territories.find(item => item.territoryId === supportingId);
    expect(supporting).toMatchObject({
      allowedJobs: ['product-graphics'],
      allowedProminence: ['supporting'],
      appliesToProminence: ['supporting'],
      perceptualBounds: {
        hueRanges: [
          { minimum: 10, maximum: 30 },
          { minimum: 240, maximum: 270 },
        ],
        chroma: { minimum: 0.1, maximum: 0.2 },
        lightness: { minimum: 0.2, maximum: 0.8 },
      },
    });
    const leadingId = lowered.territoryBindings.find(
      item => item.prominence === 'leading'
    )?.territoryId;
    expect(
      lowered.profile.territories.find(item => item.territoryId === leadingId)?.perceptualBounds
    ).toEqual(FULL_BOUNDS);
    expect(supporting?.evidenceIds).toContain(fragment.fragmentHash);
    expect(lowered.profile.evidenceIds).toContain('source:sample');
  });

  it('preserves existing limited status and native exclusions, and adds scoped exclusions without job grants', () => {
    const existingExclusion: ColorSystemBrandTerritoryV2 = {
      territoryId: 'base-exclusion',
      label: 'Existing exclusion',
      status: 'excluded',
      allowedJobs: [],
      allowedProminence: [],
      appliesToProminence: ['accent'],
      perceptualBounds: FULL_BOUNDS,
      evidenceIds: ['base:exclusion'],
    };
    const fragment = reviewed([exclusion()]);
    const base = baseProfile({ status: 'limited' }, [existingExclusion]);
    const lowered = lowerColorSystemBrandConstraintsV1(fragment, base);
    if (lowered.status !== 'ready') throw new Error('Expected a supported profile.');
    expect(lowered.profile.territories.find(item => item.territoryId === 'base-exclusion')).toEqual(
      base.territories.find(item => item.territoryId === 'base-exclusion')
    );
    expect(lowered.profile.territories.filter(item => item.status === 'limited')).toHaveLength(3);
    expect(
      lowered.profile.territories.find(item => item.territoryId.startsWith('brand-exclusion:'))
    ).toMatchObject({
      status: 'excluded',
      allowedJobs: [],
      allowedProminence: [],
      appliesToProminence: ['leading'],
    });
  });

  it('keeps rejected restrictions in the fragment without applying them', () => {
    const rejected = rule();
    const fragment = buildColorSystemBrandConstraintsV1(
      content([rejected], [decision(rejected, 'rejected')])
    );
    const lowered = lowerColorSystemBrandConstraintsV1(fragment, baseProfile());
    if (lowered.status !== 'ready') throw new Error('Expected a supported profile.');
    expect(fragment.rules).toHaveLength(1);
    expect(
      lowered.profile.territories.every(
        item => JSON.stringify(item.perceptualBounds) === JSON.stringify(FULL_BOUNDS)
      )
    ).toBe(true);
  });

  it.each([
    { perceptualBounds: { ...FULL_BOUNDS, hueRanges: [{ minimum: 0, maximum: 100 }] } },
    { perceptualBounds: { ...FULL_BOUNDS, chroma: { minimum: 0.3, maximum: 0.4 } } },
    { perceptualBounds: { ...FULL_BOUNDS, lightness: { minimum: 0, maximum: 0.1 } } },
    { allowedJobs: ['functional-iconography'] as const },
  ])('returns an explicit empty intersection without relaxing constraints: %j', original => {
    const lowered = lowerColorSystemBrandConstraintsV1(reviewed(), baseProfile(original));
    expect(lowered).toMatchObject({
      status: 'infeasible',
      issues: [
        {
          code: 'EMPTY_ALLOWED_TERRITORY',
          sourceTerritoryId: 'base',
          prominence: 'supporting',
          ruleIds: ['cool-support'],
        },
      ],
    });
    expect(lowered).not.toHaveProperty('profile');
  });

  it('retains an exact shared boundary rather than treating it as an empty interval', () => {
    const lowered = lowerColorSystemBrandConstraintsV1(
      reviewed(),
      baseProfile({
        perceptualBounds: {
          hueRanges: [{ minimum: 90, maximum: 180 }],
          chroma: { minimum: 0.2, maximum: 0.3 },
          lightness: { minimum: 0.9, maximum: 1 },
        },
      })
    );
    if (lowered.status !== 'ready') throw new Error('Expected a supported profile.');
    const supporting = lowered.profile.territories.find(item =>
      item.allowedProminence.includes('supporting')
    );
    expect(supporting?.perceptualBounds).toEqual({
      hueRanges: [{ minimum: 180, maximum: 180 }],
      chroma: { minimum: 0.2, maximum: 0.2 },
      lightness: { minimum: 0.9, maximum: 0.9 },
    });
  });

  it('binds stable territory identities while the profile hash changes with accepted bounds', () => {
    const first = lowerColorSystemBrandConstraintsV1(reviewed(), baseProfile());
    const second = lowerColorSystemBrandConstraintsV1(
      reviewed([rule({ bounds: { ...FULL_BOUNDS, hueRanges: [{ minimum: 190, maximum: 220 }] } })]),
      baseProfile()
    );
    if (first.status !== 'ready' || second.status !== 'ready')
      throw new Error('Expected supported profiles.');
    expect(first.territoryBindings).toEqual(second.territoryBindings);
    expect(first.profile.profileHash).not.toBe(second.profile.profileHash);
  });

  it('rejects altered native profile content before deriving restrictions', () => {
    const base = baseProfile();
    expectCode(
      () =>
        lowerColorSystemBrandConstraintsV1(reviewed(), {
          ...base,
          profileHash: deterministicContentHash('stale-profile'),
        }),
      'BRAND_CONSTRAINT_HASH_MISMATCH'
    );
  });
});
