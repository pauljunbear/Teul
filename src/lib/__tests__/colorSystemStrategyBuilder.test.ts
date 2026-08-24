import { describe, expect, it } from 'vitest';
import { createSourceSystemSnapshot } from '../colorSystemAudit';
import {
  COLOR_SYSTEM_STRATEGY_BUILDER_GAMUT_MAPPING,
  COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION,
  COLOR_SYSTEM_STRATEGY_RECOMMENDATION_POLICY_VERSION,
  buildColorSystemStrategySet,
  collapseDuplicateColorSystemStrategyCandidates,
  colorSystemStrategyActualSystemHash,
  resolveConfirmedColorSystemPrimary,
  type ColorSystemStrategyBuilderInput,
  type ColorSystemStrategyCandidate,
} from '../colorSystemStrategyBuilder';
import { hexToOklch } from '../utils';

const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SOURCE_ANCHORS = [
  ['Sky', '#B2C7EB'],
  ['Spring', '#5683D2'],
  ['Magnolia', '#DEB1B9'],
  ['Eggplant', '#684162'],
  ['Green', '#5AB570'],
  ['Smolder', '#17332D'],
  ['Mist', '#AABCA3'],
  ['Terrace', '#5E540E'],
  ['Mustard', '#D6CA67'],
  ['Blaze', '#E96516'],
  ['Rust', '#924F35'],
] as const;
const SOURCE_REFERENCES: NonNullable<ColorSystemStrategyBuilderInput['sourceReferences']> = {
  secondary: SOURCE_ANCHORS.map(([name, hex], index) => ({
    section: 'secondary',
    sectionTitle: 'Example Brand - Colors (Secondary)',
    sourceNodeId: 'secondary-frame',
    entryId: `secondary-${index + 1}`,
    name,
    order: index + 1,
    hex,
  })),
  dataVisualization: SOURCE_ANCHORS.map(([name, hex], index) => ({
    section: 'data-visualization',
    sectionTitle: 'Example Brand - Colors (Data Viz)',
    sourceNodeId: 'data-viz-frame',
    entryId: `data-viz-${index + 1}`,
    name,
    order: index + 1,
    hex,
  })),
};
const EXISTING_SOURCE_HEXES = [
  '#E4F222',
  ...SOURCE_ANCHORS.map(([, hex]) => hex),
  '#FFFFFF',
  '#111111',
];

function hueDistance(firstHex: string, secondHex: string): number {
  const distance = Math.abs(hexToOklch(firstHex).h - hexToOklch(secondHex).h) % 360;
  return Math.min(distance, 360 - distance);
}

function input(
  overrides: Partial<ColorSystemStrategyBuilderInput> = {}
): ColorSystemStrategyBuilderInput {
  return {
    sourceHash: SOURCE_HASH,
    primary: {
      tokenId: 'structured-source:primary-solar',
      name: 'Solar',
      mode: 'rendered',
      hex: '#E4F222',
    },
    visualizationSettings: {
      mode: 'light',
      surfaceHex: '#FFFFFF',
      chartType: 'brand-product-categorical-overview',
      categoryCount: 4,
      nonColorCue: 'direct labels and shapes',
      markType: 'bar',
      adjacency: 'separated-marks',
      divergingMidpoint: 'zero',
      sequentialCount: 3,
      divergingCount: 3,
    },
    sourceReferences: SOURCE_REFERENCES,
    existingSourceHexes: EXISTING_SOURCE_HEXES,
    ...overrides,
  };
}

function expectSuitablePreview(candidate: ColorSystemStrategyCandidate): void {
  expect(candidate.visualization.categorical.evaluation.status).toBe('suitable-candidate');
  expect(candidate.visualization.sequential.evaluation.status).toBe('suitable-candidate');
  expect(candidate.visualization.diverging.evaluation.status).toBe('suitable-candidate');
  expect(candidate.visualization.categorical.colors).toHaveLength(4);
  expect(candidate.visualization.sequential.colors).toHaveLength(
    candidate.visualization.settings.sequentialCount
  );
  expect(candidate.visualization.diverging.colors).toHaveLength(
    candidate.visualization.settings.divergingCount
  );
  for (const artifact of [
    candidate.visualization.categorical,
    candidate.visualization.sequential,
    candidate.visualization.diverging,
  ]) {
    expect(
      artifact.colors.every(color => Object.keys(color).sort().join(',') === 'hex,source')
    ).toBe(true);
  }

  const categoricalFamilies = new Set(
    candidate.visualization.categorical.colors.flatMap(color =>
      color.source.kind === 'secondary-scale' ? [color.source.familyIndex] : []
    )
  );
  expect(categoricalFamilies).toEqual(new Set([1, 2]));
  expect(
    candidate.visualization.sequential.colors.every(
      color => color.source.kind === 'secondary-scale' && color.source.familyIndex === 1
    )
  ).toBe(true);
  expect(
    candidate.visualization.diverging.colors.some(
      color => color.source.kind === 'secondary-scale' && color.source.familyIndex === 1
    )
  ).toBe(true);
  expect(
    candidate.visualization.diverging.colors.some(
      color => color.source.kind === 'secondary-scale' && color.source.familyIndex === 2
    )
  ).toBe(true);
  expect(candidate.visualization.searchEvidence.categoricalEvaluationCount).toBeLessThanOrEqual(
    candidate.visualization.searchEvidence.categoricalMaximumEvaluations
  );
  expect(candidate.visualization.searchEvidence.categoricalCandidateCount).toBeLessThanOrEqual(18);
}

describe('buildColorSystemStrategySet', () => {
  it('returns the complete bounded strategy frontier while preserving the exact Primary', () => {
    const result = buildColorSystemStrategySet(input());

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    const { strategySet } = result;
    expect(strategySet.primary).toEqual({
      tokenId: 'structured-source:primary-solar',
      name: 'Solar',
      mode: 'rendered',
      hex: '#e4f222',
    });
    expect(strategySet.candidates.map(candidate => candidate.id)).toEqual([
      'close-harmony',
      'balanced-contrast',
      'wide-spectrum',
    ]);
    expect(strategySet.briefHash).toMatch(HASH_PATTERN);
    expect(strategySet.strategySetHash).toMatch(HASH_PATTERN);
    expect(strategySet.recommendation).toMatchObject({
      policyVersion: COLOR_SYSTEM_STRATEGY_RECOMMENDATION_POLICY_VERSION,
      recommendedCandidateId: strategySet.recommendation.ranking[0].candidateId,
    });
    expect(strategySet.recommendation.ranking).toHaveLength(3);

    const sourceSeedHexes = new Set(EXISTING_SOURCE_HEXES.map(hex => hex.toLowerCase()));
    const allGeneratedSeeds = new Set<string>();
    for (const candidate of strategySet.candidates) {
      expect(candidate.primary).toEqual(strategySet.primary);
      expect(candidate.secondaryFamilies).toHaveLength(2);
      expect(candidate.modelHash).toMatch(HASH_PATTERN);
      expect(candidate.candidateHash).toMatch(HASH_PATTERN);
      expect(candidate.actualSystemHash).toMatch(HASH_PATTERN);
      expect(candidate.modelHash).not.toBe(candidate.candidateHash);
      expect(candidate.searchEvidence).toMatchObject({
        rawPoolCandidateCount: 648,
        rawPoolMaximumCandidates: 648,
        maximumPrequalifiedFamilies: 64,
        pairMaximumEvaluations: 25_000,
        pairMaximumBeamWidth: 32,
      });
      expect(
        candidate.searchEvidence.uniquePoolCandidateCount +
          candidate.searchEvidence.quantizationCollapseCount +
          candidate.searchEvidence.sourceDuplicateRejectionCount
      ).toBe(candidate.searchEvidence.rawPoolCandidateCount);
      expect(candidate.searchEvidence.prequalifiedFamilyCount).toBeLessThanOrEqual(64);
      expect(
        candidate.searchEvidence.generatedScaleFamilyCount +
          candidate.searchEvidence.invalidScaleRejectionCount
      ).toBe(candidate.searchEvidence.prequalifiedFamilyCount);
      expect(candidate.searchEvidence.pairEvaluationCount).toBeLessThanOrEqual(25_000);
      expect(candidate.searchEvidence.pairFrontierCount).toBeLessThanOrEqual(32);
      expect(candidate.searchEvidence.pairArtifactEvaluationCount).toBeGreaterThan(0);
      expect(candidate.searchEvidence.pairArtifactEvaluationCount).toBeLessThanOrEqual(
        candidate.searchEvidence.pairFrontierCount
      );
      expect(candidate.searchEvidence.visualizationEvaluationCount).toBeLessThanOrEqual(8_192);
      expect(candidate.searchEvidence.visualizationMaximumEvaluations).toBe(8_192);
      expectSuitablePreview(candidate);
      expect(candidate.rationale).toContain(
        '11 observed Secondary colors and 11 observed Data Viz colors'
      );
      expect(candidate.rationale).toContain(
        'The family closest in hue to Sky (#B2C7EB) leads sequential charts and Product accents'
      );
      expect(candidate.rationale).toContain('Tradeoff:');
      expect(candidate.rationale).not.toMatch(/ΔE|sha256|policy limit|internal/i);
      expect(candidate.evidence.sourceTerritory).toMatchObject({
        status: 'passed',
        method: 'ordered-source-sections',
        secondaryReferenceCount: 11,
        dataVisualizationReferenceCount: 11,
        thresholdDeltaEOK: 0.22,
        leadReference: {
          section: 'data-visualization',
          name: 'Sky',
          order: 1,
          hex: '#b2c7eb',
        },
      });
      expect(
        candidate.evidence.sourceTerritory.maximumNearestReferenceDeltaEOK
      ).toBeLessThanOrEqual(0.22);
      expect(hueDistance(candidate.secondaryFamilies[0].seedHex, '#b2c7eb')).toBeLessThanOrEqual(
        hueDistance(candidate.secondaryFamilies[1].seedHex, '#b2c7eb')
      );
      expect(candidate.measurements).toEqual(
        expect.objectContaining({
          sourceColorCount: 14,
          referenceColorCount: 11,
          generatedSeedDuplicateCount: 0,
          functionalArtifactCoverage: 1,
          meanNearestSourceDeltaEOK: expect.any(Number),
          maximumNearestReferenceDeltaEOK: expect.any(Number),
          sourceTerritoryThresholdDeltaEOK: 0.22,
          meanPrimaryRelatednessDeltaEOK: expect.any(Number),
          minimumSetSeparationDeltaEOK: expect.any(Number),
          minimumCategoricalSeparationDeltaEOK: expect.any(Number),
          gamutMappedStepCount: expect.any(Number),
          gamutMappedStepRate: expect.any(Number),
          maximumStep9ModeDeltaEOK: 0,
        })
      );
      expect(Object.values(candidate.measurements).every(Number.isFinite)).toBe(true);

      for (const family of candidate.secondaryFamilies) {
        expect(sourceSeedHexes).not.toContain(family.seedHex);
        expect(allGeneratedSeeds).not.toContain(family.seedHex);
        allGeneratedSeeds.add(family.seedHex);
        for (const mode of ['light', 'dark'] as const) {
          const scale = family.modes[mode];
          expect(scale.validation.valid).toBe(true);
          expect(scale.steps).toHaveLength(12);
          expect(scale.steps.map(step => step.step)).toEqual([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
          ]);
          for (const step of scale.steps) {
            expect(step.provenance).toMatchObject({
              kind: 'teul-harmony-generated',
              policyVersion: COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION,
              scaleAlgorithmVersion: 'Teul OKLCH v3',
              gamutMapping: COLOR_SYSTEM_STRATEGY_BUILDER_GAMUT_MAPPING,
              sourceTokenId: strategySet.primary.tokenId,
              sourceMode: strategySet.primary.mode,
              sourceHex: strategySet.primary.hex,
              direction: candidate.direction,
              familyIndex: family.familyIndex,
              hueOffsetDegrees: family.hueOffsetDegrees,
              seedHex: family.seedHex,
              mode,
              step: step.step,
              requestedOklch: {
                l: expect.any(Number),
                c: expect.any(Number),
                h: expect.any(Number),
              },
              mappedOklch: {
                l: expect.any(Number),
                c: expect.any(Number),
                h: expect.any(Number),
              },
            });
            expect(Object.values(step.provenance.requestedOklch).every(Number.isFinite)).toBe(true);
            expect(Object.values(step.provenance.mappedOklch).every(Number.isFinite)).toBe(true);
          }
        }
      }
    }

    expect(new Set(strategySet.candidates.map(candidate => candidate.modelHash)).size).toBe(3);
    expect(new Set(strategySet.candidates.map(candidate => candidate.candidateHash)).size).toBe(3);
    expect(new Set(strategySet.candidates.map(candidate => candidate.actualSystemHash)).size).toBe(
      3
    );
    expect(strategySet.blockers).toEqual([]);
    expect(allGeneratedSeeds.size).toBe(6);
    for (const entry of strategySet.recommendation.ranking) {
      expect(entry.ordinalRankSum).toBe(
        entry.sourceContinuityRank +
          entry.categoricalSeparationRank +
          entry.gamutRetentionRank +
          entry.setSeparationRank +
          entry.functionalCoverageRank
      );
      expect(entry.tieBreakHash).toBe(
        strategySet.candidates.find(candidate => candidate.id === entry.candidateId)?.candidateHash
      );
    }
    expect(strategySet.recommendation.ranking.map(entry => entry.aggregateRank)).toEqual([1, 2, 3]);
    expect(strategySet.recommendation.statement).toContain('not a universal quality score');
  });

  it('describes a Secondary lead as Secondary when no Data Viz source order exists', () => {
    const result = buildColorSystemStrategySet(
      input({
        sourceReferences: {
          secondary: SOURCE_REFERENCES.secondary,
          dataVisualization: [],
        },
      })
    );

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.strategySet.candidates.length).toBeGreaterThan(0);
    for (const candidate of result.strategySet.candidates) {
      expect(candidate.rationale).toContain('appears first in the source Secondary order');
      expect(candidate.rationale).not.toContain('appears first in the source Data Viz order');
    }
  });

  it('is deterministic, canonical, and does not mutate its input', () => {
    const request = input();
    const before = structuredClone(request);
    const first = buildColorSystemStrategySet(request);
    const second = buildColorSystemStrategySet(request);
    const canonicalEquivalent = buildColorSystemStrategySet(
      input({
        primary: { ...request.primary, hex: '#e4f222' },
        sourceReferences: {
          secondary: [...SOURCE_REFERENCES.secondary].reverse(),
          dataVisualization: [...SOURCE_REFERENCES.dataVisualization].reverse(),
        },
        existingSourceHexes: [...EXISTING_SOURCE_HEXES].reverse(),
      })
    );

    expect(request).toEqual(before);
    expect(second).toEqual(first);
    expect(canonicalEquivalent).toEqual(first);
  });

  it('uses an explicit black boundary only for a declared touching-region context', () => {
    const result = buildColorSystemStrategySet(
      input({
        visualizationSettings: {
          ...input().visualizationSettings,
          categoryCount: 6,
          adjacency: 'touching-regions',
          boundaryHex: '#000000',
        },
      })
    );

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.strategySet.candidates.map(candidate => candidate.id)).toEqual([
      'close-harmony',
      'balanced-contrast',
      'wide-spectrum',
    ]);
    expect(result.strategySet.blockers).toEqual([]);
    expect(result.strategySet.visualizationSettings).toMatchObject({
      adjacency: 'touching-regions',
      boundaryHex: '#000000',
    });
    expect(result.strategySet.recommendation.ranking).toHaveLength(3);
  });

  it('rejects a legacy boundary on separated marks instead of changing review intent', () => {
    const result = buildColorSystemStrategySet(
      input({
        visualizationSettings: {
          ...input().visualizationSettings,
          boundaryHex: '#202020',
          adjacency: 'separated-marks',
        },
      })
    );

    expect(result.status).toBe('no-solution');
    if (result.status !== 'no-solution') return;
    expect(result.blockers.map(blocker => blocker.code)).toContain(
      'UNSUPPORTED_VISUALIZATION_CONTEXT'
    );
  });

  it('collapses identical rendered family systems deterministically instead of relabeling them', () => {
    const result = buildColorSystemStrategySet(input());
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const retained = result.strategySet.candidates[0];
    const duplicate: ColorSystemStrategyCandidate = {
      ...retained,
      id: 'balanced-contrast',
      direction: 'balanced-contrast',
      label: 'Balanced contrast',
      modelHash: `sha256:${'b'.repeat(64)}`,
      candidateHash: `sha256:${'c'.repeat(64)}`,
    };
    const collapsed = collapseDuplicateColorSystemStrategyCandidates([duplicate, retained]);
    const permuted = collapseDuplicateColorSystemStrategyCandidates([retained, duplicate]);

    expect(collapsed).toEqual(permuted);
    expect(collapsed.candidates.map(candidate => candidate.id)).toEqual(['close-harmony']);
    expect(collapsed.blockers).toEqual([
      expect.objectContaining({
        code: 'DUPLICATE_STRATEGY_COLLAPSED',
        direction: 'balanced-contrast',
        duplicateOfDirection: 'close-harmony',
      }),
    ]);
    expect(
      colorSystemStrategyActualSystemHash({
        secondaryFamilies: [retained.secondaryFamilies[1], retained.secondaryFamilies[0]],
      })
    ).toBe(retained.actualSystemHash);
  });

  it('changes its hashes when the exact Primary or declared chart context changes', () => {
    const original = buildColorSystemStrategySet(input());
    const changedPrimary = buildColorSystemStrategySet(
      input({
        primary: {
          tokenId: 'structured-source:primary-cyan',
          name: 'Cyan',
          mode: 'rendered',
          hex: '#0EA5E9',
        },
      })
    );
    const changedContext = buildColorSystemStrategySet(
      input({
        visualizationSettings: {
          ...input().visualizationSettings,
          chartType: 'product-finance-breakdown',
        },
      })
    );

    expect(original.status).toBe('ready');
    expect(changedPrimary.status).toBe('ready');
    expect(changedContext.status).toBe('ready');
    if (
      original.status !== 'ready' ||
      changedPrimary.status !== 'ready' ||
      changedContext.status !== 'ready'
    ) {
      return;
    }
    expect(changedPrimary.strategySet.briefHash).not.toBe(original.strategySet.briefHash);
    expect(changedPrimary.strategySet.strategySetHash).not.toBe(
      original.strategySet.strategySetHash
    );
    expect(changedContext.strategySet.briefHash).not.toBe(original.strategySet.briefHash);
    expect(changedContext.strategySet.strategySetHash).not.toBe(
      original.strategySet.strategySetHash
    );
  });

  it('builds the same complete contract for a declared dark chart surface', () => {
    const result = buildColorSystemStrategySet(
      input({
        visualizationSettings: {
          mode: 'dark',
          surfaceHex: '#111111',
          chartType: 'product-finance-breakdown',
          categoryCount: 4,
          nonColorCue: 'direct labels and shapes',
          markType: 'bar',
          adjacency: 'separated-marks',
          divergingMidpoint: 'zero',
          sequentialCount: 5,
          divergingCount: 5,
        },
      })
    );

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    for (const candidate of result.strategySet.candidates) {
      expectSuitablePreview(candidate);
      expect(candidate.visualization.settings.mode).toBe('dark');
      expect(candidate.visualization.sequential.evaluation.orderedDirection).toBe('dark-to-light');
      expect(
        candidate.visualization.sequential.colors.every(
          color => color.source.kind === 'secondary-scale' && color.source.mode === 'dark'
        )
      ).toBe(true);
    }
  });

  it.each([
    [3, 3],
    [9, 9],
  ])(
    'honors explicit %i-step sequential and %i-step diverging cardinality',
    (sequentialCount, divergingCount) => {
      const result = buildColorSystemStrategySet(
        input({
          visualizationSettings: {
            ...input().visualizationSettings,
            sequentialCount,
            divergingCount,
            ...(sequentialCount === 9
              ? { adjacency: 'touching-regions' as const, boundaryHex: '#000000' }
              : {}),
          },
        })
      );

      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      expect(result.strategySet.candidates.length).toBeGreaterThan(0);
      for (const candidate of result.strategySet.candidates) {
        expect(candidate.visualization.sequential.colors).toHaveLength(sequentialCount);
        expect(candidate.visualization.diverging.colors).toHaveLength(divergingCount);
        expect(candidate.visualization.diverging.evaluation.midpointIndex).toBe(
          (divergingCount - 1) / 2
        );
        expect(candidate.searchEvidence.visualizationEvaluationCount).toBeLessThanOrEqual(8_192);
      }
    }
  );

  it('returns typed no-solution evidence instead of inventing a hue for a neutral Primary', () => {
    const result = buildColorSystemStrategySet(
      input({
        primary: {
          tokenId: 'structured-source:primary-neutral',
          name: 'Neutral',
          mode: 'rendered',
          hex: '#777777',
        },
      })
    );

    expect(result.status).toBe('no-solution');
    if (result.status !== 'no-solution') return;
    expect(result.sourceHash).toBe(SOURCE_HASH);
    expect(result.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'PRIMARY_HUE_UNSTABLE' })])
    );
  });

  it.each([
    ['invalid source identity', input({ sourceHash: 'not-a-hash' }), 'INVALID_SOURCE_HASH'],
    [
      'incomplete visualization context',
      input({
        visualizationSettings: {
          ...input().visualizationSettings,
          categoryCount: 9,
          nonColorCue: '',
        },
      }),
      'UNSUPPORTED_VISUALIZATION_CONTEXT',
    ],
    [
      'touching regions without an adjoining boundary',
      input({
        visualizationSettings: {
          ...input().visualizationSettings,
          adjacency: 'touching-regions',
          boundaryHex: undefined,
        },
      }),
      'UNSUPPORTED_VISUALIZATION_CONTEXT',
    ],
    [
      'touching regions with a non-black-or-white boundary',
      input({
        visualizationSettings: {
          ...input().visualizationSettings,
          adjacency: 'touching-regions',
          boundaryHex: '#202020',
        },
      }),
      'UNSUPPORTED_VISUALIZATION_CONTEXT',
    ],
    [
      'unsupported source color',
      input({ existingSourceHexes: ['color(display-p3 1 0 0)'] }),
      'INVALID_PRIMARY',
    ],
  ])('returns a typed blocker for %s', (_label, request, code) => {
    const result = buildColorSystemStrategySet(request);
    expect(result.status).toBe('no-solution');
    if (result.status !== 'no-solution') return;
    expect(result.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  });

  it('resolves an explicit Primary only when token, mode, and hex all match exactly', () => {
    const snapshot = createSourceSystemSnapshot({
      sourceKind: 'figma-document',
      sourceLocator: 'figma-file:strict-primary-fixture',
      authorization: { status: 'user-authorized' },
      documentProfile: 'srgb',
      resourceScope: { kind: 'all-local-resources', localVariableCount: 1, localStyleCount: 0 },
      usageScope: 'selection',
      capturedAt: '2026-08-03T12:00:00.000Z',
      modes: ['Alternate', 'Source'],
      tokens: [
        {
          id: 'brand.primary',
          name: 'Solar',
          path: ['brand', 'primary', 'solar'],
          valuesByMode: {
            Source: {
              colorSpace: 'srgb',
              hex: '#E4F222',
              components: [228 / 255, 242 / 255, 34 / 255],
              alpha: 1,
            },
            Alternate: {
              colorSpace: 'srgb',
              hex: '#E4F222',
              components: [228 / 255, 242 / 255, 34 / 255],
              alpha: 1,
            },
          },
          aliasTargetsByMode: { Source: 'brand.solar.source' },
          evidence: [{ kind: 'figma-resource', locator: 'variable:brand.primary' }],
          roleEvidence: [],
        },
      ],
      sourceSections: [],
      supportedUsage: [],
      unsupportedUsage: [],
      declaredPairs: [],
    });

    expect(
      resolveConfirmedColorSystemPrimary(snapshot, {
        tokenId: 'brand.primary',
        mode: 'Source',
        hex: '#e4f222',
      })
    ).toMatchObject({
      status: 'ready',
      primary: { tokenId: 'brand.primary', mode: 'Source', hex: '#e4f222' },
      lock: {
        path: ['brand', 'primary', 'solar'],
        exactComponents: [228 / 255, 242 / 255, 34 / 255],
        aliasTargetId: 'brand.solar.source',
      },
    });
    expect(
      resolveConfirmedColorSystemPrimary(snapshot, {
        tokenId: 'brand.primary',
        mode: 'Missing',
        hex: '#e4f222',
      })
    ).toMatchObject({ status: 'mismatch', code: 'MODE_NOT_FOUND' });
    expect(
      resolveConfirmedColorSystemPrimary(snapshot, {
        tokenId: 'brand.primary',
        mode: 'Source',
        hex: '#000000',
      })
    ).toMatchObject({ status: 'mismatch', code: 'HEX_MISMATCH' });
    expect(
      resolveConfirmedColorSystemPrimary(snapshot, {
        tokenId: 'missing-token',
        mode: 'Source',
        hex: '#e4f222',
      })
    ).toMatchObject({ status: 'mismatch', code: 'TOKEN_NOT_FOUND' });
  });
});
