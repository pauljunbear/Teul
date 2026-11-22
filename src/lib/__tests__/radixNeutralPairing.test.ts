import { describe, expect, it } from 'vitest';
import {
  getNeutralForAccent,
  neutralFamilies,
  radixColors,
  type NeutralName,
  type RadixColorName,
} from '../radixColors';

/**
 * Source: Radix Colors, "Composing a palette", natural pairing chart.
 * https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette
 * (fetched 2026-09-07). The chart maps every accent below to one gray scale.
 */
const RADIX_DOCUMENTED_PAIRINGS: ReadonlyArray<readonly [RadixColorName, NeutralName]> = [
  ['tomato', 'mauve'],
  ['red', 'mauve'],
  ['ruby', 'mauve'],
  ['crimson', 'mauve'],
  ['pink', 'mauve'],
  ['plum', 'mauve'],
  ['purple', 'mauve'],
  ['violet', 'mauve'],
  ['iris', 'slate'],
  ['indigo', 'slate'],
  ['blue', 'slate'],
  ['sky', 'slate'],
  ['cyan', 'slate'],
  ['mint', 'sage'],
  ['teal', 'sage'],
  ['jade', 'sage'],
  ['green', 'sage'],
  ['grass', 'olive'],
  ['lime', 'olive'],
  ['yellow', 'sand'],
  ['amber', 'sand'],
  ['orange', 'sand'],
  ['brown', 'sand'],
];

/**
 * Bronze and gold are absent from the Radix pairing chart. Teul's own family
 * data pairs both metals with sand; the hue function must agree with that data.
 */
const TEUL_METAL_ACCENTS: ReadonlyArray<RadixColorName> = ['bronze', 'gold'];

describe('getNeutralForAccent', () => {
  it.each(RADIX_DOCUMENTED_PAIRINGS)(
    'pairs %s step 9 with %s, as Radix documents',
    (accent, neutral) => {
      const family = radixColors[accent];
      expect(getNeutralForAccent(family.light[9])).toBe(neutral);
      expect(getNeutralForAccent(family.dark[9])).toBe(neutral);
      expect(family.pairedNeutral).toBe(neutral);
    }
  );

  it.each(TEUL_METAL_ACCENTS)('pairs %s step 9 with its Teul family data', accent => {
    const family = radixColors[accent];
    expect(getNeutralForAccent(family.light[9])).toBe(family.pairedNeutral);
    expect(getNeutralForAccent(family.dark[9])).toBe(family.pairedNeutral);
  });

  it('covers every non-neutral Radix family exactly once', () => {
    const covered = [
      ...RADIX_DOCUMENTED_PAIRINGS.map(([accent]) => accent),
      ...TEUL_METAL_ACCENTS,
    ].sort();
    const accents = (Object.keys(radixColors) as RadixColorName[])
      .filter(name => !(neutralFamilies as string[]).includes(name))
      .sort();
    expect(covered).toEqual(accents);
    expect(new Set(covered).size).toBe(covered.length);
  });

  it('pairs near-neutral input with gray, including the gray scales themselves', () => {
    for (const neutral of neutralFamilies) {
      expect(getNeutralForAccent(radixColors[neutral].light[9])).toBe('gray');
    }
    expect(getNeutralForAccent('#808080')).toBe('gray');
    expect(getNeutralForAccent('#8a8886')).toBe('gray'); // HSL saturation 2%
  });

  it('places the documented boundaries between neighbouring families', () => {
    // Just inside each band, using saturated HSL-derived hexes.
    expect(getNeutralForAccent('#ff0000')).toBe('mauve'); // 0°
    expect(getNeutralForAccent('#ff8000')).toBe('sand'); // 30°
    expect(getNeutralForAccent('#80ff00')).toBe('olive'); // 90°
    expect(getNeutralForAccent('#00ff80')).toBe('sage'); // 150°
    expect(getNeutralForAccent('#0080ff')).toBe('slate'); // 210°
    expect(getNeutralForAccent('#8000ff')).toBe('mauve'); // 270°
  });
});
