import { describe, expect, it } from 'vitest';
import { createSourceSystemSnapshot } from '../colorSystemAudit';
import { buildColorSystemStrategySet } from '../colorSystemStrategyBuilder';
import {
  COLOR_SYSTEM_PREVIEW_PRODUCT_SEMANTIC_ROLES,
  projectColorSystemStrategyBlocker,
  projectColorSystemStrategyPreview,
} from '../colorSystemStrategyPreview';

describe('projectColorSystemStrategyPreview', () => {
  it('preserves every rendered swatch and selection receipt while omitting canonical internals', () => {
    const snapshot = createSourceSystemSnapshot({
      sourceKind: 'figma-document',
      sourceLocator: 'figma-file:preview-test',
      authorization: { status: 'user-authorized' },
      documentProfile: 'srgb',
      resourceScope: { kind: 'all-local-resources', localVariableCount: 1, localStyleCount: 0 },
      usageScope: 'selection',
      capturedAt: '2026-08-03T12:00:00.000Z',
      modes: ['Light'],
      tokens: [
        {
          id: 'brand.primary',
          name: 'Solar',
          path: ['brand', 'primary'],
          valuesByMode: {
            Light: {
              colorSpace: 'srgb',
              hex: '#e4f222',
              components: [228 / 255, 242 / 255, 34 / 255],
              alpha: 1,
            },
          },
          evidence: [{ kind: 'figma-resource', locator: 'variable:brand-primary' }],
          roleEvidence: [],
        },
      ],
      supportedUsage: [],
      unsupportedUsage: [],
      declaredPairs: [],
    });
    const built = buildColorSystemStrategySet({
      sourceHash: snapshot.sourceHash,
      primary: {
        tokenId: 'brand.primary',
        name: 'Solar',
        mode: 'Light',
        hex: '#E4F222',
      },
      visualizationSettings: {
        mode: 'light',
        surfaceHex: '#FFFFFF',
        chartType: 'generic-review-bar-chart',
        categoryCount: 4,
        nonColorCue: 'direct labels and shapes',
        markType: 'bar',
        adjacency: 'separated-marks',
        divergingMidpoint: 'neutral reference for review',
        sequentialCount: 3,
        divergingCount: 3,
      },
      existingSourceHexes: ['#E4F222'],
    });
    expect(built.status).toBe('ready');
    if (built.status !== 'ready') return;

    const preview = projectColorSystemStrategyPreview(built.strategySet, snapshot);
    expect(preview.strategySetHash).toBe(built.strategySet.strategySetHash);
    expect(preview.recommendation).toEqual({
      policyVersion: built.strategySet.recommendation.policyVersion,
      recommendedCandidateId: built.strategySet.recommendation.recommendedCandidateId,
      statement: built.strategySet.recommendation.statement,
    });
    for (const [index, candidate] of built.strategySet.candidates.entries()) {
      const projected = preview.candidates[index];
      expect(projected).toMatchObject({
        id: candidate.id,
        candidateHash: candidate.candidateHash,
        label: candidate.label,
        rationale: candidate.rationale,
        primary: candidate.primary,
      });
      expect(projected.secondaryFamilies.map(family => family.lightSteps)).toEqual(
        candidate.secondaryFamilies.map(family => family.modes.light.steps.map(step => step.hex))
      );
      expect(projected.secondaryFamilies.map(family => family.darkSteps)).toEqual(
        candidate.secondaryFamilies.map(family => family.modes.dark.steps.map(step => step.hex))
      );
      expect(projected.productSemantics.map(mapping => mapping.role)).toEqual(
        COLOR_SYSTEM_PREVIEW_PRODUCT_SEMANTIC_ROLES
      );
      expect(
        projected.productSemantics.every(
          mapping =>
            mapping.light.targetTokenId.length > 0 &&
            mapping.dark.targetTokenId.length > 0 &&
            /^#[0-9a-f]{6}$/.test(mapping.light.hex) &&
            /^#[0-9a-f]{6}$/.test(mapping.dark.hex)
        )
      ).toBe(true);
      expect(projected.visualization).toEqual({
        categorical: candidate.visualization.categorical.colors.map(color => color.hex),
        sequential: candidate.visualization.sequential.colors.map(color => color.hex),
        diverging: candidate.visualization.diverging.colors.map(color => color.hex),
      });
      expect(projected).not.toHaveProperty('modelHash');
      expect(projected).not.toHaveProperty('measurements');
      expect(projected).not.toHaveProperty('searchEvidence');
    }
  });

  it('projects exact blocker counts without generated values', () => {
    const built = buildColorSystemStrategySet({
      sourceHash: `sha256:${'a'.repeat(64)}`,
      primary: { tokenId: 'brand.primary', name: 'Solar', mode: 'Light', hex: '#E4F222' },
      visualizationSettings: {
        mode: 'light',
        surfaceHex: '#FFFFFF',
        chartType: 'generic-review-bar-chart',
        categoryCount: 6,
        nonColorCue: 'direct labels and shapes',
        markType: 'bar',
        adjacency: 'separated-marks',
        divergingMidpoint: 'neutral reference for review',
        sequentialCount: 3,
        divergingCount: 3,
      },
      existingSourceHexes: ['#E4F222'],
    });
    expect(built.status).toBe('no-solution');
    if (built.status !== 'no-solution') return;
    const blocker = built.blockers[0];
    const projected = projectColorSystemStrategyBlocker(blocker);
    expect(projected).toEqual({
      code: blocker.code,
      message: blocker.message,
      direction: blocker.direction,
      searchEvidence: blocker.searchEvidence,
      alternatives: blocker.alternatives,
    });
    expect(projected.searchEvidence).not.toHaveProperty('generatedHexes');
  });
});
