import { colorSystemSrgbToOklchV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import type { ColorSystemColorValueV2 } from '../../../src/lib/colorSystemBuilderV2Contracts';

/** Studio's established policy: keep the exact source at its lightness position. */
export function sourceScaleAnchorPosition(
  value: ColorSystemColorValueV2,
  polarity: 'light' | 'dark'
): number {
  const lightness = colorSystemSrgbToOklchV1(value).l;
  return Math.max(
    2,
    Math.min(11, Math.round((polarity === 'light' ? 1 - lightness : lightness) * 11) + 1)
  );
}
