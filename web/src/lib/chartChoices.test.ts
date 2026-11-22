import { describe, expect, it } from 'vitest';
import {
  chartChoicesMatch,
  chooseChartStep,
  createChartChoices,
  exportChartChoices,
  isChartChoices,
  keepChartChoices,
} from './chartChoices';
import { generateStudioSystem } from './teul';
import { exampleChartStudy } from './exampleChartStudy';
import { hexToOklch } from '../../../src/lib/utils';
import { mapOklchToSrgb } from '../../../src/lib/colorScale';

const system = await generateStudioSystem({
  name: 'Chart choices',
  colors: ['#5385C3', '#B96C49'],
  method: 'authored',
});

describe('contextual chart choices', () => {
  it('keeps multiple choices, invalidates only a changed choice, and separates modes', () => {
    const initial = createChartChoices(system);
    const kept = keepChartChoices(initial, 'light', ['brand-1', 'brand-2']);
    expect(kept.light.every(row => row.kept)).toBe(true);
    expect(kept.dark.every(row => !row.kept)).toBe(true);
    const changed = chooseChartStep(kept, 'light', 'brand-1', 8);
    expect(changed.light).toEqual([
      { familyId: 'brand-1', step: 8, kept: false },
      { familyId: 'brand-2', step: 9, kept: true },
    ]);
    expect(chooseChartStep(kept, 'light', 'brand-1', 9).light[0].kept).toBe(true);
    expect(chooseChartStep(kept, 'light', 'brand-1', 9)).toBe(kept);
    expect(keepChartChoices(kept, 'light', ['brand-1', 'brand-2'])).toBe(kept);
    expect(initial.light.every(row => !row.kept)).toBe(true);
    expect(keepChartChoices(kept, 'light', ['brand-1'], false).light[0].kept).toBe(false);
  });

  it('rejects malformed data and decision replay on changed values even with the same system ID', () => {
    const choices = createChartChoices(system);
    expect(chartChoicesMatch(system, JSON.parse(JSON.stringify(choices)))).toBe(true);
    for (const step of [0, 13, 1.5, NaN, '9']) {
      const malformed = structuredClone(choices) as unknown as { light: { step: unknown }[] };
      malformed.light[0].step = step;
      expect(isChartChoices(malformed)).toBe(false);
    }
    const duplicate = structuredClone(choices);
    duplicate.light[1].familyId = 'brand-1';
    expect(isChartChoices(duplicate)).toBe(false);
    expect(isChartChoices({ ...choices, officialApproval: true })).toBe(false);
    const changed = structuredClone(system);
    changed.families[0].light[7] = '#FFFFFF';
    expect(chartChoicesMatch(changed, choices)).toBe(false);
    expect(() => exportChartChoices(changed, choices, 'light', 'json')).toThrow('no longer match');
    const reordered = structuredClone(choices);
    reordered.light.reverse();
    reordered.dark.reverse();
    expect(chartChoicesMatch(system, reordered)).toBe(false);
  });

  it('exports exact visible values, numbered variables, provenance and actual decisions', () => {
    const choices = keepChartChoices(
      chooseChartStep(createChartChoices(system), 'light', 'brand-1', 8),
      'light',
      ['brand-1']
    );
    const json = JSON.parse(exportChartChoices(system, choices, 'light', 'json'));
    expect(json.choices[0]).toMatchObject({
      step: 8,
      hex: system.families[0].light[7],
      variable: '--teul-brand-1-light-8',
      kept: true,
    });
    expect(json.choices[1].kept).toBe(false);
    expect(json.choices[0].provenance).toContain('Teul');
    const css = exportChartChoices(system, choices, 'light', 'css');
    expect(css).toContain(`--teul-brand-1-light-8: ${system.families[0].light[7]}`);
    expect(css).toContain('--chart-series-1: var(--teul-brand-1-light-8)');
    expect(css).toContain('Custom Teul authored scales');
    expect(
      JSON.parse(exportChartChoices(system, choices, 'dark', 'json')).choices.every(
        (row: { kept: boolean }) => !row.kept
      )
    ).toBe(true);
  });

  it('softens only the named study and preserves its exact new anchors in both modes', async () => {
    const softer = await generateStudioSystem({
      name: 'Softer study',
      colors: exampleChartStudy.softer,
      method: 'authored',
    });
    for (const [index, original] of exampleChartStudy.original.entries()) {
      const base = hexToOklch(original);
      expect(exampleChartStudy.softer[index]).toBe(
        mapOklchToSrgb({ ...base, l: base.l + 0.06 }).hex.toUpperCase()
      );
      expect(hexToOklch(exampleChartStudy.softer[index]).l).toBeGreaterThan(base.l);
      expect(softer.families[index].light[8]).toBe(exampleChartStudy.softer[index]);
      expect(softer.families[index].dark[8]).toBe(exampleChartStudy.softer[index]);
      expect(softer.families[index].radixFamily).toBeUndefined();
    }
  });

  it('initializes a Radix match at the same numbered step in its matching mode', async () => {
    const radix = await generateStudioSystem({
      name: 'Matched palette',
      colors: ['#FDFDFE'],
      method: 'radix',
    });
    const match = radix.families[0].radixMatch!;
    expect(match.step).not.toBe(9);
    const choices = createChartChoices(radix);
    expect(choices[match.mode][0].step).toBe(match.step);
    expect(exportChartChoices(radix, choices, match.mode, 'css')).toContain(
      'Exact published Radix values'
    );
  });
});
