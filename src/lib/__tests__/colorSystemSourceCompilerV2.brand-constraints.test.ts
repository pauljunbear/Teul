import { describe, expect, it } from 'vitest';
import {
  buildColorSystemBrandConstraintsV1,
  type ColorSystemBrandTerritoryRuleV1,
} from '../colorSystemBrandConstraintsV1';
import {
  COLOR_SYSTEM_BUILDER_RECOMMENDATION_POLICY_V2_VERSION,
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
} from '../colorSystemBuilderOrchestratorV2';
import { buildColorSystemGenericOwnerConfirmationV2 } from '../colorSystemGenericIntentPolicyV2';
import { compileColorSystemGenericPolicyHandoffV2 } from '../colorSystemGenericPolicyHandoffV2';
import { buildColorSystemSecondaryStrategySetV2 } from '../colorSystemSecondaryEngineV2';
import { compileColorSystemGenericPolicyHandoffSourceV2 } from '../colorSystemSourceCompilerV2';
import { hexToOklch } from '../utils';
import { exportColorSystemTokensV2 } from '../colorSystemTokenExportV2';
import { generateColorScale } from '../colorScale';
import { deterministicContentHash } from '../colorSystemHashing';
import {
  BRAND_B,
  chainFromInput,
  GENERIC_BRAND,
  genericBrandSourceInput,
  orchestrateGenericBrand,
  orchestrateGenericSourceInput,
} from './helpers/colorSystemGenericBrandPipelineV2';

const source = genericBrandSourceInput(GENERIC_BRAND);
const ALL_GENERATED_JOBS = [
  'marketing-accent',
  'product-semantics',
  'product-graphics',
  'functional-iconography',
  'product-ui-surface',
  'categorical-data',
  'sequential-data',
  'diverging-data',
] as const;

function rejectedRuleChain(rule: ColorSystemBrandTerritoryRuleV1, input = source) {
  const chain = chainFromInput(input, [rule]);
  const reviewed = chain.confirmation.reviewedBrandConstraints!;
  const confirmation = buildColorSystemGenericOwnerConfirmationV2(chain.snapshot, chain.proposal, {
    ...chain.confirmation,
    reviewedBrandConstraints: buildColorSystemBrandConstraintsV1({
      schemaVersion: reviewed.schemaVersion,
      sourceSnapshotHash: reviewed.sourceSnapshotHash,
      rules: reviewed.rules,
      decisions: reviewed.decisions.map(decision => ({ ...decision, status: 'rejected' })),
    }),
  });
  return {
    ...chain,
    confirmation,
    handoff: compileColorSystemGenericPolicyHandoffV2(chain.snapshot, chain.proposal, confirmation),
  };
}

function orchestrateChain(chain: ReturnType<typeof chainFromInput>) {
  return buildColorSystemGenericBuilderOrchestratorV2(
    buildColorSystemGenericBuilderOrchestratorV2Input(
      chain.snapshot,
      chain.proposal,
      chain.confirmation,
      chain.handoff,
      {
        application: {
          applicationMode: 'Light',
          surfaceContext: 'light',
          categoricalMarkCount: 5,
          sequentialMarkCount: 5,
          divergingMarkCount: 3,
        },
        recommendation: {
          version: COLOR_SYSTEM_BUILDER_RECOMMENDATION_POLICY_V2_VERSION,
          objective: 'general-product-system',
          authority: 'owner-confirmed',
          evidenceIds: ['owner-decision:recommendation-objective'],
        },
      }
    )
  );
}

/** Compare what is used and exported; adoption intentionally changes provenance hashes. */
function outputValues(result: ReturnType<typeof orchestrateGenericBrand>) {
  return JSON.parse(
    JSON.stringify(
      {
        recommendedDirectionId: result.recommendedDirection?.directionId,
        directions: result.directions.map(direction => {
          if (direction.status !== 'ready')
            throw new Error(`Blocked direction ${direction.directionId}`);
          const exported = exportColorSystemTokensV2(direction.resource);
          const dtcg = JSON.parse(exported.dtcgJson) as Record<string, unknown>;
          return {
            directionId: direction.directionId,
            families: direction.candidate.families.map(family => ({
              id: family.stableFamilyId,
              members: family.members.map(member => ({
                id: member.stableMemberId,
                role: member.role,
                valuesByMode: member.valuesByMode,
              })),
            })),
            application: {
              graphics: direction.application.productGraphics.map(specimen => ({
                job: specimen.job,
                mode: specimen.mode,
                colors: specimen.colors,
              })),
              semantics: direction.application.productSemantics.map(role => ({
                role: role.role,
                mode: role.mode,
                ref: role.ref,
                resolved: role.resolved,
              })),
              visualization: direction.application.visualization,
              additionalCategorical: direction.application.additionalCategorical,
              typography: direction.application.typography,
            },
            native: direction.resource.collections.map(collection =>
              collection.variables.map(variable => ({
                name: variable.name,
                values: variable.kind === 'alias' ? variable.aliasesByMode : variable.valuesByMode,
              }))
            ),
            dtcg: direction.resource.collections.flatMap(collection =>
              collection.variables.map(variable => {
                const token = variable.name
                  .split('/')
                  .reduce((node, key) => node[key] as Record<string, unknown>, dtcg);
                const extension = (token.$extensions as Record<string, Record<string, unknown>>)[
                  'com.teul'
                ];
                return { name: variable.name, value: token.$value, modes: extension.modes };
              })
            ),
            css: exported.cssText.replace(/\/\* resourceBlueprintHash [^*]+\*\//, ''),
          };
        }),
      },
      (key, value: unknown) => (key === 'evidenceIds' ? undefined : value)
    )
  ) as unknown;
}

function strategyValues(chain: ReturnType<typeof chainFromInput>, accentsOnly = false) {
  const compiled = compileColorSystemGenericPolicyHandoffSourceV2(chain);
  return buildColorSystemSecondaryStrategySetV2(compiled.brief, compiled.seeds).candidates.map(
    candidate => ({
      id: candidate.id,
      families: candidate.families
        .filter(family => !accentsOnly || family.brandFit.prominence === 'accent')
        .map(family => ({
          contributionId: family.contributionId,
          values: family.members.map(member => ({
            role: member.role,
            valuesByMode: member.valuesByMode,
          })),
        })),
    })
  );
}

function mutedAccents(): ColorSystemBrandTerritoryRuleV1 {
  return {
    id: 'muted-accents',
    label: 'Muted illustration accents',
    kind: 'brand-territory',
    scope: { kind: 'generated-families', prominence: ['accent'], modes: 'all', jobs: 'all' },
    bounds: {
      hueRanges: [{ minimum: 0, maximum: 360 }],
      chroma: { minimum: 0.04, maximum: 0.1 },
      lightness: { minimum: 0, maximum: 1 },
    },
    origin: 'owner-authored',
    evidenceRefs: ['synthetic-brief:muted-illustration-accents'],
    effect: 'restrict-to',
    allowedJobs: ['product-graphics', 'functional-iconography'],
  };
}

describe('reviewed brand constraints in generic source compilation', () => {
  it('preserves frozen byte-based candidate values while versioning application policy changes', () => {
    const result = orchestrateGenericBrand();
    // Replayed against detached 3fb73a6: every candidate ID, member and exact
    // value still matches. Its full 6bfdd69f… receipt is retained in TASK-003
    // evidence; graphics policy v2 and corrected review copy change that hash.
    // Later legend node estimates, explicit graphic projections and background
    // aliases change the delivery hash while preserving these candidate values.
    const values = result.directions.map(direction => ({
      id: direction.directionId,
      families: direction.candidate.families.map(family => ({
        id: family.stableFamilyId,
        members: family.members.map(member => ({
          id: member.stableMemberId,
          values: member.valuesByMode,
        })),
      })),
    }));
    expect(deterministicContentHash(values)).toBe(
      'sha256:38cc892126758e66e825f2cc40189d9555a652eb4988015b369cdddd40292d72'
    );
    expect(result.orchestratorHash).toBe(
      'sha256:91b1562c8614de06ca034134ada77b97d6d43658d115102331bc08fc2ff3c2a8'
    );
  });

  it.each(['empty', 'rejected'] as const)(
    'preserves every candidate, application, native value and exported value for %s rules',
    status => {
      const exclusion: ColorSystemBrandTerritoryRuleV1 = {
        id: 'exclude-all',
        label: 'Rejected exclusion',
        kind: 'brand-territory',
        effect: 'exclude',
        scope: { kind: 'generated-families', prominence: ['accent'], modes: 'all', jobs: 'all' },
        bounds: {
          hueRanges: [{ minimum: 0, maximum: 360 }],
          chroma: { minimum: 0, maximum: 0.5 },
          lightness: { minimum: 0, maximum: 1 },
        },
        origin: 'owner-authored',
        evidenceRefs: ['synthetic-brief:rejected-exclusion'],
      };
      const chain = status === 'empty' ? chainFromInput(source, []) : rejectedRuleChain(exclusion);
      const result = orchestrateChain(chain);
      const legacy = orchestrateGenericBrand();
      expect(result.status).toBe('ready');
      expect(result.orchestratorHash).not.toBe(legacy.orchestratorHash);
      expect(outputValues(result)).toEqual(outputValues(legacy));
    }
  );

  it('accepts an exact source anchor at singleton bounds in planning, generation, and integrity', () => {
    const color = hexToOklch(GENERIC_BRAND.primary);
    const rule: ColorSystemBrandTerritoryRuleV1 = {
      id: 'exact-leading-anchor',
      label: 'Exact leading anchor',
      kind: 'brand-territory',
      effect: 'restrict-to',
      allowedJobs: ALL_GENERATED_JOBS,
      scope: { kind: 'generated-families', prominence: ['leading'], modes: 'all', jobs: 'all' },
      bounds: {
        hueRanges: [{ minimum: color.h, maximum: color.h }],
        chroma: { minimum: color.c, maximum: color.c },
        lightness: { minimum: color.l, maximum: color.l },
      },
      origin: 'owner-authored',
      evidenceRefs: ['synthetic-brief:exact-leading-anchor'],
    };
    const compiled = compileColorSystemGenericPolicyHandoffSourceV2(chainFromInput(source, [rule]));
    const strategy = buildColorSystemSecondaryStrategySetV2(compiled.brief, compiled.seeds);
    expect(strategy.status).toBe('ready');
    for (const candidate of strategy.candidates) {
      const leading = candidate.families.find(family => family.brandFit.prominence === 'leading')!;
      const anchor = leading.members.find(member => member.role === 'step-9')!;
      expect(anchor.valuesByMode.Light.hex).toBe(GENERIC_BRAND.primary);
      expect(anchor.valuesByMode.Dark.hex).toBe(GENERIC_BRAND.primary);
    }
  });

  it.each(['empty', 'rejected'] as const)(
    'keeps legacy semantic-source exclusions in the engine for %s rules',
    status => {
      const semanticSource = genericBrandSourceInput({
        ...GENERIC_BRAND,
        primaryDark: GENERIC_BRAND.primary,
        secondaries: [{ name: 'Error', hex: '#CC2233' }],
      });
      const chain =
        status === 'empty'
          ? chainFromInput(semanticSource, [])
          : rejectedRuleChain(mutedAccents(), semanticSource);
      expect(strategyValues(chain)).toEqual(strategyValues(chainFromInput(semanticSource)));
    }
  );

  it.each(['leading', 'supporting'] as const)(
    'leaves accent enumeration unchanged when accepted restrictions affect only %s families',
    prominence => {
      const semanticSource = genericBrandSourceInput({
        ...GENERIC_BRAND,
        primaryDark: GENERIC_BRAND.primary,
        secondaries: [{ name: 'Error', hex: '#CC2233' }],
      });
      const rule: ColorSystemBrandTerritoryRuleV1 = {
        ...mutedAccents(),
        scope: { kind: 'generated-families', prominence: [prominence], modes: 'all', jobs: 'all' },
        effect: 'restrict-to',
        allowedJobs: ALL_GENERATED_JOBS,
        bounds: {
          hueRanges: [{ minimum: 0, maximum: 360 }],
          chroma: { minimum: 0, maximum: 0.4 },
          lightness: { minimum: 0, maximum: 1 },
        },
      };
      expect(strategyValues(chainFromInput(semanticSource, [rule]), true)).toEqual(
        strategyValues(chainFromInput(semanticSource), true)
      );
    }
  );

  it('searches inside adopted bounds, narrows jobs, and binds every seed to its scoped territory', () => {
    const legacy = compileColorSystemGenericPolicyHandoffSourceV2(chainFromInput(source));
    const chain = chainFromInput(source, [mutedAccents()]);
    const compiled = compileColorSystemGenericPolicyHandoffSourceV2(chain);
    const strategy = buildColorSystemSecondaryStrategySetV2(compiled.brief, compiled.seeds);
    expect(strategy.status).toBe('ready');
    const locks = (brief: typeof compiled.brief) =>
      brief.primaryLocks.map(lock => ({
        stableColorId: lock.stableColorId,
        mode: lock.mode,
        expectedValue: lock.expectedValue,
      }));
    const sources = (brief: typeof compiled.brief) =>
      brief.preservedColors.map(color => ({
        stableColorId: color.stableColorId,
        valuesByMode: color.valuesByMode,
      }));
    expect(locks(compiled.brief)).toEqual(locks(legacy.brief));
    expect(sources(compiled.brief)).toEqual(sources(legacy.brief));
    expect(compiled.compilationHash).not.toBe(legacy.compilationHash);
    expect(compiled.brief.brandFitProfile.evidenceIds).toContain(
      chain.handoff.reviewedBrandConstraints!.fragmentHash
    );
    expect(compiled.constraints).toHaveProperty(
      'reviewedBrandConstraintsHash',
      chain.handoff.reviewedBrandConstraints!.fragmentHash
    );

    for (const seed of compiled.seeds) {
      const territory = compiled.brief.brandFitProfile.territories.find(
        candidate => candidate.territoryId === seed.territoryId
      )!;
      expect(territory.allowedProminence).toEqual([seed.prominence]);
      expect(territory.appliesToProminence).toEqual([seed.prominence]);
      expect(seed.territoryId).toMatch(/^brand-scope:/);
      expect(
        legacy.brief.brandFitProfile.territories.some(
          candidate => candidate.territoryId === seed.territoryId
        )
      ).toBe(false);
      if (seed.prominence === 'accent') {
        expect(seed.eligibilityEvidence.flatMap(entry => entry.jobs).sort()).toEqual([
          'functional-iconography',
          'product-graphics',
        ]);
      }
    }
    const original = buildColorSystemSecondaryStrategySetV2(legacy.brief, legacy.seeds);
    const anchors = strategy.candidates.flatMap(candidate =>
      candidate.families
        .filter(family => family.brandFit.prominence === 'accent')
        .map(
          family => family.members.find(member => member.role === 'step-9')!.valuesByMode.Light.hex
        )
    );
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.every(hex => hexToOklch(hex).c <= 0.1)).toBe(true);
    expect(anchors).not.toEqual(
      original.candidates.flatMap(candidate =>
        candidate.families
          .filter(family => family.brandFit.prominence === 'accent')
          .map(
            family =>
              family.members.find(member => member.role === 'step-9')!.valuesByMode.Light.hex
          )
      )
    );
  });

  it('carries the changed candidate values through actual applications, native recipes, and token export', () => {
    const rule = mutedAccents();
    const result = orchestrateGenericSourceInput(source, 'general-product-system', {
      brandRules: [{ ...rule, effect: 'restrict-to', allowedJobs: ALL_GENERATED_JOBS }],
    });
    expect(result.status).toBe('ready');
    const direction = result.directions.find(
      entry => entry.directionId === result.recommendedDirection?.directionId
    )!;
    expect(direction.status).toBe('ready');
    if (direction.status !== 'ready')
      throw new Error('Expected a ready constrained recommendation.');
    expect(direction.application.candidateHash).toBe(direction.candidate.candidateHash);
    expect(direction.resource.candidateHash).toBe(direction.candidate.candidateHash);
    expect(direction.resource.applicationBlueprintHash).toBe(
      direction.application.applicationBlueprintHash
    );
    for (const family of direction.candidate.families) {
      const naming = direction.resource.tokenNaming.families.find(
        entry => entry.familyId === family.stableFamilyId
      )!;
      const reviewName = direction.review.recommendedSystem!.familyNames.find(
        entry => entry.familyId === family.stableFamilyId
      )!;
      expect(reviewName.tokenPath).toBe(`color/${naming.slug}`);
      if (family.brandFit.prominence === 'accent') {
        expect(naming.basis).toBe('hue-family');
        expect(naming.hueFamily).toBeTruthy();
        expect(naming.slug).toMatch(new RegExp(`^${naming.hueFamily}(?:-\\d+)?$`));
      }
      if (family.displayName.startsWith('Neutral')) {
        expect(naming.basis).toBe('neutral');
        expect(naming.slug).toBe('neutral');
      }
    }
    const usedAccents = new Set<string>();
    // Graphics now prefer recorded colors. Constrained accent values still reach
    // actual chart applications, whose larger series needs use those families.
    const applicationColors = [
      ...direction.application.productGraphics.flatMap(specimen => specimen.colors),
      ...direction.application.visualization.categorical.marks.map(mark => mark.resolved),
      ...(direction.application.visualization.diverging?.marks.map(mark => mark.resolved) ?? []),
    ];
    for (const color of applicationColors) {
      if (color.ref.kind !== 'approved-family-member') continue;
      const ref = color.ref.ref;
      const family = direction.candidate.families.find(
        entry => entry.stableFamilyId === ref.familyId
      )!;
      const member = family.members.find(entry => entry.stableMemberId === ref.memberId)!;
      expect(color.value).toEqual(member.valuesByMode[ref.mode]);
      if (family.brandFit.prominence === 'accent') usedAccents.add(family.stableFamilyId);
    }
    expect(usedAccents.size).toBeGreaterThan(0);
    const exported = exportColorSystemTokensV2(direction.resource);
    const json = JSON.parse(exported.dtcgJson) as Record<string, unknown>;
    for (const variable of direction.resource.collections[0].variables) {
      if (variable.origin.kind !== 'approved-secondary') continue;
      const origin = variable.origin;
      const family = direction.candidate.families.find(
        entry => entry.stableFamilyId === origin.familyId
      )!;
      const member = family.members.find(entry => entry.stableMemberId === origin.memberId)!;
      expect(variable.valuesByMode).toEqual(member.valuesByMode);
      const token = variable.name
        .split('/')
        .reduce((node, key) => node[key] as Record<string, unknown>, json);
      expect(token.$value).toMatchObject({ hex: member.valuesByMode.Light.hex });
    }
    expect(exported.tokenCount).toBe(direction.resource.counts.variables);
  });

  it('reports an impossible allowed envelope instead of retaining the broad base territory', () => {
    const rule = mutedAccents();
    const impossible = {
      ...rule,
      bounds: { ...rule.bounds, chroma: { minimum: 0, maximum: 0.03 } },
    };
    expect(() =>
      compileColorSystemGenericPolicyHandoffSourceV2(chainFromInput(source, [impossible]))
    ).toThrow(/Reviewed brand constraints are infeasible/);
  });

  it('rejects exclusions that hit only non-anchor members rather than accepting legal step-9 colors', () => {
    const exclusion: ColorSystemBrandTerritoryRuleV1 = {
      id: 'no-pale-accent-members',
      label: 'No pale members in generated accent families',
      kind: 'brand-territory',
      effect: 'exclude',
      scope: { kind: 'generated-families', prominence: ['accent'], modes: 'all', jobs: 'all' },
      bounds: {
        hueRanges: [{ minimum: 0, maximum: 360 }],
        chroma: { minimum: 0, maximum: 0.5 },
        lightness: { minimum: 0.9, maximum: 1 },
      },
      origin: 'owner-authored',
      evidenceRefs: ['synthetic-brief:no-pale-accent-members'],
    };
    // Every legal accent anchor is <= 0.85 L; the exclusion only intersects its scale.
    expect(() =>
      compileColorSystemGenericPolicyHandoffSourceV2(chainFromInput(source, [exclusion]))
    ).toThrow(/could not be filled.*reviewed brand constraints/);
  });

  it.each([
    { excludedHex: '#EBE6DD', expectedGold: true },
    { excludedHex: '#FFE8BC', expectedGold: false },
  ])(
    'checks the final pinned scale when supporting members exclude $excludedHex',
    ({ excludedHex, expectedGold }) => {
      const withTint = genericBrandSourceInput({
        ...BRAND_B,
        secondaries: [...BRAND_B.secondaries, { name: 'Gold Light', hex: '#FFE8BC' }],
      });
      const goldSource = BRAND_B.secondaries.find(color => color.name === 'Gold')!;
      expect(generateColorScale(goldSource.hex, 'light', 'Gold').steps[2].hex).toBe('#ebe6dd');
      const color = hexToOklch(excludedHex);
      const exclusion: ColorSystemBrandTerritoryRuleV1 = {
        id: 'excluded-supporting-step',
        label: 'Excluded supporting step',
        kind: 'brand-territory',
        effect: 'exclude',
        scope: {
          kind: 'generated-families',
          prominence: ['supporting'],
          modes: 'all',
          jobs: 'all',
        },
        bounds: {
          hueRanges: [{ minimum: color.h, maximum: color.h }],
          chroma: { minimum: color.c, maximum: color.c },
          lightness: { minimum: color.l, maximum: color.l },
        },
        origin: 'owner-authored',
        evidenceRefs: ['synthetic-brief:post-pin-exclusion'],
      };
      const compiled = compileColorSystemGenericPolicyHandoffSourceV2(
        chainFromInput(withTint, [exclusion])
      );
      const strategy = buildColorSystemSecondaryStrategySetV2(compiled.brief, compiled.seeds);
      if (!expectedGold) {
        expect(strategy.status).toBe('no-solution');
        expect(strategy.candidates).toEqual([]);
        expect(strategy.blockers).toEqual(
          expect.arrayContaining([expect.objectContaining({ code: 'NO_VALID_FAMILY_SET' })])
        );
        return;
      }
      expect(strategy.candidates).toHaveLength(3);
      expect(strategy.status).toBe('ready');
      for (const candidate of strategy.candidates) {
        const gold = candidate.families.find(family =>
          family.members.some(
            member => member.role === 'step-9' && member.valuesByMode.Light.hex === goldSource.hex
          )
        )!;
        expect(gold).toBeDefined();
        expect(gold.members.find(member => member.role === 'step-3')!.valuesByMode.Light.hex).toBe(
          '#FFE8BC'
        );
        expect(gold.pinnedMembers).toHaveLength(1);
        const supportingValues = candidate.families
          .filter(family => family.brandFit.prominence === 'supporting')
          .flatMap(family => family.members.flatMap(member => Object.values(member.valuesByMode)));
        expect(supportingValues.some(value => value.hex === excludedHex)).toBe(false);
      }
    }
  );
});
