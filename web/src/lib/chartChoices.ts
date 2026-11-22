import { canonicalJson, deterministicContentHash } from '../../../src/lib/colorSystemHashing';
import type { StudioSystem } from './teul';

export type ChartMode = 'light' | 'dark';
export const chartSurfaces = {
  light: { background: '#FFFFFF', track: '#F4F3F0' },
  dark: { background: '#171715', track: '#30302B' },
};
export interface ChartChoice {
  familyId: string;
  step: number;
  kept: boolean;
}
export interface ChartChoices {
  version: 1;
  scaleHash: string;
  light: ChartChoice[];
  dark: ChartChoice[];
}

const scaleHash = (system: StudioSystem) =>
  deterministicContentHash(
    canonicalJson({
      id: system.id,
      families: system.families.map(({ id, sourceHex, light, dark }) => ({
        id,
        sourceHex,
        light,
        dark,
      })),
    })
  );

export function createChartChoices(system: StudioSystem): ChartChoices {
  const choices = (mode: ChartMode) =>
    system.families.map(family => ({
      familyId: family.id,
      step: family.radixMatch?.mode === mode ? family.radixMatch.step : 9,
      kept: false,
    }));
  return {
    version: 1,
    scaleHash: scaleHash(system),
    light: choices('light'),
    dark: choices('dark'),
  };
}

const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

/** Bounded inert data; exact generated-value binding is checked separately on reopen. */
export function isChartChoices(value: unknown): value is ChartChoices {
  if (
    !plain(value) ||
    !exactKeys(value, ['version', 'scaleHash', 'light', 'dark']) ||
    value.version !== 1 ||
    typeof value.scaleHash !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(value.scaleHash)
  )
    return false;
  const validRows = (rows: unknown): rows is ChartChoice[] =>
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.length <= 6 &&
    rows.every(
      row =>
        plain(row) &&
        exactKeys(row, ['familyId', 'step', 'kept']) &&
        typeof row.familyId === 'string' &&
        /^brand-[1-6]$/.test(row.familyId) &&
        Number.isInteger(row.step) &&
        Number(row.step) >= 1 &&
        Number(row.step) <= 12 &&
        typeof row.kept === 'boolean'
    ) &&
    new Set(rows.map(row => row.familyId)).size === rows.length;
  return (
    validRows(value.light) &&
    validRows(value.dark) &&
    value.light.length === value.dark.length &&
    value.light.every(
      (row, index) => row.familyId === (value.dark as ChartChoice[])[index].familyId
    )
  );
}

export function chartChoicesMatch(system: StudioSystem, choices: unknown): choices is ChartChoices {
  return (
    isChartChoices(choices) &&
    choices.scaleHash === scaleHash(system) &&
    choices.light.length === system.families.length &&
    system.families.every((family, i) => choices.light[i].familyId === family.id)
  );
}

export function chooseChartStep(
  choices: ChartChoices,
  mode: ChartMode,
  familyId: string,
  step: number
): ChartChoices {
  if (!Number.isInteger(step) || step < 1 || step > 12)
    throw new Error('Choose a step from 1 to 12.');
  if (!choices[mode].some(row => row.familyId === familyId && row.step !== step)) return choices;
  return {
    ...choices,
    [mode]: choices[mode].map(row =>
      row.familyId === familyId && row.step !== step ? { ...row, step, kept: false } : row
    ),
  };
}

export function keepChartChoices(
  choices: ChartChoices,
  mode: ChartMode,
  familyIds: string[],
  kept = true
): ChartChoices {
  if (!choices[mode].some(row => familyIds.includes(row.familyId) && row.kept !== kept))
    return choices;
  return {
    ...choices,
    [mode]: choices[mode].map(row =>
      familyIds.includes(row.familyId) && row.kept !== kept ? { ...row, kept } : row
    ),
  };
}

export function exportChartChoices(
  system: StudioSystem,
  choices: ChartChoices,
  mode: ChartMode,
  format: 'css' | 'json'
): string {
  if (!chartChoicesMatch(system, choices))
    throw new Error('The chart choices no longer match these scales.');
  const rows = choices[mode].map((choice, index) => {
    const family = system.families[index];
    return {
      ...choice,
      family: family.name,
      hex: family[mode][choice.step - 1],
      variable: `--teul-${family.id}-${mode}-${choice.step}`,
      provenance: family.provenance,
    };
  });
  if (format === 'json')
    return JSON.stringify(
      {
        schema: 'teul.chart-choices.v1',
        system: system.name,
        scaleHash: choices.scaleHash,
        mode,
        scope:
          'Designer choices for an illustrative chart; not brand approval or accessibility certification.',
        ...chartSurfaces[mode],
        choices: rows,
      },
      null,
      2
    );
  return [
    '/* Teul chart choices. Kept = designer choice, not accessibility certification. */',
    system.method === 'radix'
      ? '/* Exact published Radix values. Matching a reference to a family is a Teul proposal. */'
      : '/* Custom Teul authored scales. Originals stay at step 9; added shades are proposals, not published Radix colors. */',
    ':root {',
    ...rows.flatMap((row, index) => [
      `  /* Series ${index + 1}: step ${row.step}; ${row.kept ? 'kept' : 'draft'} */`,
      `  ${row.variable}: ${row.hex};`,
      `  --chart-series-${index + 1}: var(${row.variable});`,
    ]),
    '}',
    '',
  ].join('\n');
}
