import { canonicalDerivedNumberV2 } from '../../../src/lib/colorSystemHashing';
import { colorSystemSrgbToOklchV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import type { ColorSystemColorValueV2 } from '../../../src/lib/colorSystemBuilderV2Contracts';

/** Studio's established policy: keep the exact source at its lightness position. */
export function sourceScaleAnchorPosition(
  value: ColorSystemColorValueV2,
  polarity: 'light' | 'dark',
  numericVersion?: 2
): number {
  const rawLightness = colorSystemSrgbToOklchV1(value).l;
  const lightness = numericVersion === 2 ? canonicalDerivedNumberV2(rawLightness) : rawLightness;
  return Math.max(
    2,
    Math.min(11, Math.round((polarity === 'light' ? 1 - lightness : lightness) * 11) + 1)
  );
}
