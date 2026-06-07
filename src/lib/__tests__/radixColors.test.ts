import { describe, expect, it } from 'vitest';
import { RADIX_COLORS_VERSION, radixColors } from '../radixColors';

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
});
