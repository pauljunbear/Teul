import { describe, expect, it } from 'vitest';
import {
  findClosestRadixFamily,
  matchRadixFamily,
  RADIX_COLORS_VERSION,
  RADIX_FAMILY_MATCH_METHOD,
  radixColors,
} from '../radixColors';

describe('Radix color source integrity', () => {
  it('pins exact Match data to @radix-ui/colors 3.0.0', () => {
    expect(RADIX_COLORS_VERSION).toBe('3.0.0');
  });

  it('matches the corrected @radix-ui/colors 3.0.0 values', () => {
    expect(radixColors.sand.dark[12]).toBe('#eeeeec');
    expect(radixColors.pink.dark[8]).toBe('#a84885');
    expect(radixColors.violet.dark[5]).toBe('#3c2e69');
    expect(radixColors.violet.dark[6]).toBe('#473876');
    expect(radixColors.violet.dark[7]).toBe('#56468b');
    expect(radixColors.violet.dark[8]).toBe('#6958ad');
  });

  it.each([
    ['#f9c1ce', 'ruby'],
    ['#ffefae', 'yellow'],
    ['#0000ff', 'indigo'],
  ] as const)('matches %s to the reviewed %s family with Delta E OK', (input, family) => {
    const match = matchRadixFamily(input);

    expect(match.family.name).toBe(family);
    expect(findClosestRadixFamily(input).name).toBe(family);
    expect(match.inputHex).toBe(input);
    expect(match.matchedHex).toBe(
      match.family[match.matchedMode][match.matchedStep as keyof typeof match.family.light]
    );
    expect(match.deltaEOK).toBeGreaterThanOrEqual(0);
    expect(matchRadixFamily(input)).toEqual(match);
    expect(RADIX_FAMILY_MATCH_METHOD).toContain('Delta E OK');
  });

  it('uses stable match evidence for an exact published value', () => {
    const match = matchRadixFamily(radixColors.ruby.light[6]);

    expect(match).toMatchObject({
      family: radixColors.ruby,
      matchedMode: 'light',
      matchedStep: 6,
      matchedHex: radixColors.ruby.light[6],
      deltaEOK: 0,
    });
  });

  it('uses the documented light-before-dark tie break for a duplicated exact value', () => {
    const match = matchRadixFamily(radixColors.blue.light[9]);

    expect(match).toMatchObject({
      family: radixColors.blue,
      matchedMode: 'light',
      matchedStep: 9,
      matchedHex: radixColors.blue.light[9],
      deltaEOK: 0,
    });
  });
});
