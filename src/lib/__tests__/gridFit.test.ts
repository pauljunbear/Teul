import { describe, expect, it } from 'vitest';
import type { GridConfig, GridPreset } from '../../types/grid';
import {
  GRID_FIT_FRAME_MATRIX,
  aggregateGridFitAnalyses,
  analyzeGridFit,
  analyzePresetAcrossFrameMatrix,
  analyzePresetFit,
  analyzePresetsAcrossFrameMatrix,
  analyzeResolvedGridFit,
  analyzeResolvedPresetFits,
  recommendGridPresets,
} from '../gridFit';
import { GRID_CATEGORIES, GRID_PRESETS, getPresetsByCategory } from '../gridPresets';

const TEST_COLOR = { r: 1, g: 0, b: 0, a: 0.1 };

function createColumnGrid(overrides: Partial<NonNullable<GridConfig['columns']>> = {}): GridConfig {
  return {
    columns: {
      count: 4,
      gutterSize: 16,
      gutterUnit: 'px',
      margin: 16,
      marginUnit: 'px',
      alignment: 'STRETCH',
      visible: true,
      color: TEST_COLOR,
      ...overrides,
    },
  };
}

describe('GRID_FIT_FRAME_MATRIX', () => {
  it('matches the documented required frame matrix', () => {
    expect(GRID_FIT_FRAME_MATRIX.map(({ width, height }) => [width, height])).toEqual([
      [320, 568],
      [390, 844],
      [768, 1024],
      [1024, 768],
      [1280, 720],
      [1440, 900],
      [1920, 1080],
      [1080, 1080],
      [1080, 1350],
      [1080, 1920],
      [794, 1123],
      [100, 100],
    ]);
  });
});

describe('analyzeGridFit', () => {
  it('resolves proportional measurements independently for each target frame', () => {
    const grid = createColumnGrid({
      count: 4,
      margin: 10,
      marginUnit: 'percent',
      gutterSize: 5,
      gutterUnit: 'percent',
    });

    const large = analyzeGridFit(grid, { width: 1000, height: 800 });
    const small = analyzeGridFit(grid, { width: 500, height: 800 });

    expect(large.columns).toMatchObject({
      marginSize: 100,
      gutterSize: 50,
      availableSize: 650,
      sectionSize: 162.5,
    });
    expect(small.columns).toMatchObject({
      marginSize: 50,
      gutterSize: 25,
      availableSize: 325,
      sectionSize: 81.25,
    });
  });

  it('returns actionable recommendations when dense columns do not fit', () => {
    const result = analyzeGridFit(createColumnGrid({ count: 12, gutterSize: 24, margin: 16 }), {
      width: 320,
      height: 568,
    });

    expect(result.status).toBe('fail');
    expect(result.fits).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'section-too-small', severity: 'error' }),
      ])
    );
    expect(result.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'reduce-count',
          axis: 'columns',
          suggestedCount: 8,
        }),
        expect.objectContaining({ action: 'increase-frame', axis: 'columns' }),
      ])
    );
  });

  it('fails invalid frames and empty grids with an actionable response', () => {
    const invalidFrame = analyzeGridFit(createColumnGrid(), { width: 0, height: 100 });
    const emptyGrid = analyzeGridFit({}, { width: 320, height: 568 });

    expect(invalidFrame.status).toBe('fail');
    expect(invalidFrame.recommendations[0].action).toBe('fix-frame');
    expect(emptyGrid.status).toBe('fail');
    expect(emptyGrid.recommendations[0].action).toBe('add-grid');
  });

  it('keeps uniform-grid intervals fixed across frame sizes', () => {
    const grid: GridConfig = {
      baseline: {
        height: 8,
        offset: 0,
        visible: true,
        color: TEST_COLOR,
      },
    };

    const phone = analyzeGridFit(grid, { width: 390, height: 844 });
    const desktop = analyzeGridFit(grid, { width: 1440, height: 900 });

    expect(phone.baseline?.interval).toBe(8);
    expect(desktop.baseline?.interval).toBe(8);
    expect(desktop.baseline?.estimatedLineCount).toBeGreaterThan(
      phone.baseline?.estimatedLineCount ?? 0
    );
  });

  it('warns that native Figma uniform grids ignore stored offsets', () => {
    const result = analyzeGridFit(
      {
        baseline: {
          height: 8,
          offset: 4,
          visible: true,
          color: TEST_COLOR,
        },
      },
      { width: 320, height: 568 }
    );

    expect(result.baseline?.offset).toBe(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'baseline-offset-ignored', severity: 'warning' })
    );
  });

  it('analyzes the same source-scaled geometry that application resolves', () => {
    const grid = createColumnGrid({ count: 12, gutterSize: 24, margin: 20 });
    const target = { width: 320, height: 568 };

    const result = analyzeResolvedGridFit(grid, target, { width: 1440, height: 900 });

    expect(result.columns).toMatchObject({
      frameSize: 320,
      gutterSize: 24 * (320 / 1440),
      marginSize: 20 * (320 / 1440),
    });
    expect(result.columns?.sectionSize).toBeCloseTo(21.03703704);
    expect(result.status).not.toBe('fail');
  });

  it('aggregates all target fits using the least-compatible target', () => {
    const preset: GridPreset = {
      id: 'dense',
      name: 'Dense',
      description: 'Dense test preset',
      category: 'custom',
      tags: [],
      config: createColumnGrid({ count: 12, gutterSize: 24, margin: 20 }),
      isCustom: true,
    };
    const targets = [
      { id: 'wide', name: 'Wide', width: 1440, height: 900 },
      { id: 'narrow', name: 'Narrow', width: 100, height: 100 },
    ];

    const aggregate = analyzeResolvedPresetFits(
      preset,
      targets,
      { width: 1440, height: 900 },
      { minimumSectionSize: 12 }
    );

    expect(aggregate.targetCount).toBe(2);
    expect(aggregate.failureCount).toBe(1);
    expect(aggregate.status).toBe('fail');
    expect(aggregate.fits).toBe(false);
    expect(aggregate.representative.frame.name).toBe('Narrow');
  });

  it('requires at least one analysis before aggregating', () => {
    expect(() => aggregateGridFitAnalyses([])).toThrow('At least one grid fit analysis');
  });
});

describe('bundled preset provenance and matrix fit', () => {
  it('uses conservative user-visible labels for Swiss-inspired and square uniform grids', () => {
    expect(GRID_CATEGORIES.find(category => category.id === 'classic-swiss')?.name).toBe(
      'Swiss-Inspired'
    );
    expect(GRID_CATEGORIES.find(category => category.id === 'baseline')?.name).toBe('Uniform Grid');

    for (const preset of GRID_PRESETS.filter(item => item.config.baseline)) {
      expect(`${preset.name} ${preset.description}`, preset.id).not.toMatch(/\bbaseline\b/i);
      expect(`${preset.name} ${preset.description}`, preset.id).toMatch(/uniform grid|square/i);
    }
  });

  it('gives every bundled preset conservative provenance and adaptation notes', () => {
    expect(GRID_PRESETS).toHaveLength(34);
    expect(new Set(GRID_PRESETS.map(preset => preset.id)).size).toBe(GRID_PRESETS.length);

    for (const preset of GRID_PRESETS) {
      expect(preset.provenance, preset.id).toEqual({
        classification: 'teul-modern-adaptation',
        source: 'Teul preset catalog',
        evidence: 'unsourced',
        adaptationNotes: expect.any(String),
      });
      expect(preset.provenance?.adaptationNotes.length, preset.id).toBeGreaterThan(20);
    }

    expect(getPresetsByCategory('classic-swiss').every(preset => preset.provenance)).toBe(true);
  });

  it('produces a valid result or actionable failure for every preset and required frame', () => {
    const matrixResults = analyzePresetsAcrossFrameMatrix(GRID_PRESETS);

    expect(matrixResults).toHaveLength(GRID_PRESETS.length);

    for (const presetResult of matrixResults) {
      expect(presetResult.results).toHaveLength(GRID_FIT_FRAME_MATRIX.length);
      expect(presetResult.fitCount + presetResult.warningCount + presetResult.failureCount).toBe(
        GRID_FIT_FRAME_MATRIX.length
      );

      for (const result of presetResult.results) {
        expect(Number.isFinite(result.score), `${presetResult.presetId}: ${result.frame.id}`).toBe(
          true
        );
        expect(result.status, `${presetResult.presetId}: ${result.frame.id}`).toMatch(
          /^(fit|warning|fail)$/
        );

        if (result.status === 'fail') {
          expect(
            result.recommendations.length,
            `${presetResult.presetId}: ${result.frame.id}`
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('pins the current complete preset/frame matrix totals', () => {
    const matrixResults = analyzePresetsAcrossFrameMatrix(GRID_PRESETS);
    const totals = matrixResults.reduce(
      (result, preset) => ({
        fit: result.fit + preset.fitCount,
        warning: result.warning + preset.warningCount,
        fail: result.fail + preset.failureCount,
      }),
      { fit: 0, warning: 0, fail: 0 }
    );

    expect(GRID_PRESETS).toHaveLength(34);
    expect(GRID_FIT_FRAME_MATRIX).toHaveLength(12);
    expect(totals).toEqual({ fit: 375, warning: 14, fail: 19 });
    expect(totals.fit + totals.warning + totals.fail).toBe(408);
  });

  it('summarizes a single preset across the matrix', () => {
    const result = analyzePresetAcrossFrameMatrix(GRID_PRESETS[0]);

    expect(result.presetId).toBe(GRID_PRESETS[0].id);
    expect(result.results).toHaveLength(GRID_FIT_FRAME_MATRIX.length);
    expect(result.fitCount + result.warningCount + result.failureCount).toBe(
      GRID_FIT_FRAME_MATRIX.length
    );
  });
});

describe('recommendGridPresets', () => {
  it('excludes failed presets by default and ranks usable mobile geometry', () => {
    const frame = { width: 320, height: 568 };
    const recommendations = recommendGridPresets(GRID_PRESETS, frame, {
      limit: GRID_PRESETS.length,
    });

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.every(item => item.analysis.status !== 'fail')).toBe(true);
    expect(recommendations.some(item => item.preset.id === 'web-4col-mobile')).toBe(true);
    expect(recommendations.some(item => item.preset.id === 'web-16col')).toBe(false);

    for (let index = 1; index < recommendations.length; index++) {
      expect(recommendations[index - 1].score).toBeGreaterThanOrEqual(recommendations[index].score);
    }
  });

  it('uses geometry as the primary signal and aspect ratio only as a secondary signal', () => {
    const goodGeometry: GridPreset = {
      id: 'good-geometry',
      name: 'Good Geometry',
      description: 'Test',
      category: 'custom',
      tags: [],
      config: createColumnGrid({ count: 2, gutterSize: 16, margin: 16 }),
      isCustom: false,
    };
    const exactAspectButPoorGeometry: GridPreset = {
      id: 'poor-geometry',
      name: 'Poor Geometry',
      description: 'Test',
      category: 'custom',
      tags: [],
      aspectRatio: '16:9',
      config: createColumnGrid({ count: 24, gutterSize: 24, margin: 32 }),
      isCustom: false,
    };
    const frame = { width: 320, height: 180 };
    const recommendations = recommendGridPresets(
      [exactAspectButPoorGeometry, goodGeometry],
      frame,
      { includeFailures: true }
    );

    expect(recommendations[0].preset.id).toBe('good-geometry');
    expect(analyzePresetFit(exactAspectButPoorGeometry, frame).status).toBe('fail');
  });
});
