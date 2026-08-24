import { describe, expect, it } from 'vitest';
import { simulateCVDHex } from '../colorBlindness';
import { evaluateVisualizationPalette, VISUALIZATION_POLICY } from '../colorSystemVisualization';

describe('versioned visualization policy', () => {
  it('emits advisory normal and Machado evidence without claiming tritanopia', () => {
    const result = evaluateVisualizationPalette({
      id: 'categories',
      kind: 'categorical',
      mode: 'light',
      colors: ['#000000', '#777777', '#ffffff'],
      surfaceHex: '#ffffff',
      boundaryHex: '#000000',
      chartType: 'bar',
      categoryCount: 3,
      nonColorCue: 'Direct labels and distinct bar patterns',
    });

    expect(result.status).toBe('suitable-candidate');
    expect(result.policyVersion).toBe('teul-visualization-v1');
    expect(result.simulator).toBe('Machado 2009 severity 1.0 advisory');
    expect(result.separationEvidence.map(evidence => evidence.condition)).toEqual([
      'normal',
      'protan condition',
      'deutan condition',
      'severe tritanomaly approximation',
    ]);
    expect(result.separationEvidence.every(evidence => evidence.advisory)).toBe(true);
    expect(result.separationEvidence[1].simulatedColors).toEqual(
      result.colors.map(color => simulateCVDHex(color, { type: 'protanopia', severity: 1 }))
    );
    expect(result.surfaceEvidence.every(evidence => evidence.mode === 'light')).toBe(true);
    expect(JSON.stringify(result).toLowerCase()).not.toContain('tritanopia');
  });

  it('fails closed for duplicates, unsupported counts, missing cues, and weak separation', () => {
    const result = evaluateVisualizationPalette({
      id: 'invalid-categories',
      kind: 'categorical',
      mode: 'dark',
      colors: Array.from({ length: 9 }, () => '#777777'),
      surfaceHex: '#ffffff',
      chartType: 'pie',
      categoryCount: 9,
    });

    expect(result.status).toBe('no-solution');
    expect(result.uniqueAfterQuantization).toBe(false);
    expect(result.blockers.every(blocker => blocker.code === 'NO_SUITABLE_VIZ_PALETTE')).toBe(true);
    expect(result.blockers.map(blocker => blocker.message).join(' ')).toMatch(
      /category-count|non-color|not unique|separation/i
    );
    expect(result.surfaceEvidence.every(evidence => evidence.mode === 'dark')).toBe(true);
  });

  it('does not let a page-contrasting boundary falsely rescue a touching region', () => {
    const result = evaluateVisualizationPalette({
      id: 'touching-regions',
      kind: 'categorical',
      mode: 'light',
      colors: ['#aaaaaa', '#000000'],
      surfaceHex: '#ffffff',
      boundaryHex: '#888888',
      adjacency: 'touching-regions',
      chartType: 'region-map',
      categoryCount: 2,
      nonColorCue: 'Direct labels and region patterns',
    });

    expect(result.status).toBe('no-solution');
    expect(result.surfaceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'touching-regions.boundary-on-surface', pass: true }),
        expect.objectContaining({ id: 'touching-regions.boundary-against-mark-1', pass: false }),
      ])
    );
    expect(result.blockers.map(blocker => blocker.message).join(' ')).toMatch(
      /boundary.*touching region/i
    );
  });

  it('rejects a near-white separated mark when no boundary is declared', () => {
    const result = evaluateVisualizationPalette({
      id: 'separated-near-white',
      kind: 'categorical',
      mode: 'light',
      colors: ['#f6fbf7', '#000000'],
      surfaceHex: '#ffffff',
      adjacency: 'separated-marks',
      chartType: 'bar',
      categoryCount: 2,
      nonColorCue: 'Direct labels and distinct shapes',
    });

    expect(result.status).toBe('no-solution');
    expect(result.surfaceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'separated-near-white.mark-1-on-surface', pass: false }),
      ])
    );
    expect(result.surfaceEvidence.some(evidence => evidence.id.includes('boundary'))).toBe(false);
  });

  it('validates sequential direction and blocks a reversed ordered palette', () => {
    const valid = evaluateVisualizationPalette({
      id: 'sequential-valid',
      kind: 'sequential',
      mode: 'light',
      colors: ['#ffffff', '#777777', '#000000'],
      surfaceHex: '#ffffff',
      boundaryHex: '#000000',
      chartType: 'heatmap',
      orderedDirection: 'light-to-dark',
      nonColorCue: 'Printed values',
    });
    const reversed = evaluateVisualizationPalette({
      id: 'sequential-reversed',
      kind: 'sequential',
      mode: 'light',
      colors: ['#000000', '#777777', '#ffffff'],
      surfaceHex: '#ffffff',
      boundaryHex: '#000000',
      chartType: 'heatmap',
      orderedDirection: 'light-to-dark',
      nonColorCue: 'Printed values',
    });

    expect(valid).toMatchObject({ status: 'suitable-candidate', orderingPass: true });
    expect(reversed).toMatchObject({ status: 'no-solution', orderingPass: false });
  });

  it('requires both diverging arms to be monotonic away from the midpoint', () => {
    const valid = evaluateVisualizationPalette({
      id: 'diverging-valid',
      kind: 'diverging',
      mode: 'dark',
      colors: ['#3b0764', '#a855f7', '#ffffff', '#22c55e', '#052e16'],
      surfaceHex: '#ffffff',
      boundaryHex: '#000000',
      chartType: 'difference-map',
      midpointIndex: 2,
      nonColorCue: 'Signed values and directional labels',
    });
    const invalid = evaluateVisualizationPalette({
      id: 'diverging-invalid',
      kind: 'diverging',
      mode: 'dark',
      colors: ['#000000', '#777777', '#ffffff', '#333333', '#777777'],
      surfaceHex: '#ffffff',
      boundaryHex: '#000000',
      chartType: 'difference-map',
      midpointIndex: 2,
      nonColorCue: 'Signed values and directional labels',
    });
    const collapsedArms = evaluateVisualizationPalette({
      id: 'diverging-collapsed-arms',
      kind: 'diverging',
      mode: 'dark',
      colors: ['#000000', '#777777', '#ffffff', '#777777', '#000000'],
      surfaceHex: '#ffffff',
      boundaryHex: '#000000',
      chartType: 'difference-map',
      midpointIndex: 2,
      nonColorCue: 'Signed values and directional labels',
    });

    expect(valid).toMatchObject({ status: 'suitable-candidate', orderingPass: true });
    expect(invalid).toMatchObject({ status: 'no-solution', orderingPass: false });
    expect(collapsedArms).toMatchObject({ status: 'no-solution', orderingPass: true });
    expect(collapsedArms.separationEvidence.some(evidence => !evidence.pass)).toBe(true);
    expect(collapsedArms.blockers.map(blocker => blocker.message).join(' ')).toMatch(
      /opposing arms/i
    );
    expect(VISUALIZATION_POLICY.maximumCategoricalCount).toBe(8);
  });
});
