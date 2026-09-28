import type { ColorSystemBrandTerritoryV2 } from './colorSystemBuilderV2Contracts';
import { canonicalNumber } from './colorSystemHashing';
import { hexToOklch } from './utils';

/** CSS Color 4's OKLCH powerless-hue epsilon; numeric rounding is separate. */
const OKLCH_POWERLESS_HUE_CHROMA_EPSILON = 0.000004;

/** One representation for serialized evidence and every inclusive bounds check. */
export function canonicalizeColorSystemOklchV1(
  value: ReturnType<typeof hexToOklch>
): ReturnType<typeof hexToOklch> {
  const lightness = canonicalNumber(value.l);
  const chroma = canonicalNumber(value.c);
  if (chroma <= OKLCH_POWERLESS_HUE_CHROMA_EPSILON) {
    return { l: lightness, c: 0, h: 0 };
  }
  return { l: lightness, c: chroma, h: canonicalNumber(value.h) };
}

/** Native territories contain non-wrapping hue intervals, including 0–360. */
export function colorSystemTerritoryContainsHexV1(
  territory: ColorSystemBrandTerritoryV2,
  hex: string
): boolean {
  return colorSystemTerritoryContainsOklchV1(
    territory,
    canonicalizeColorSystemOklchV1(hexToOklch(hex))
  );
}

/** The caller canonicalizes once when testing one color against multiple territories. */
export function colorSystemTerritoryContainsOklchV1(
  territory: Pick<ColorSystemBrandTerritoryV2, 'perceptualBounds'>,
  color: ReturnType<typeof hexToOklch>
): boolean {
  const bounds = territory.perceptualBounds;
  return (
    bounds.hueRanges.some(range => color.h >= range.minimum && color.h <= range.maximum) &&
    color.c >= bounds.chroma.minimum &&
    color.c <= bounds.chroma.maximum &&
    color.l >= bounds.lightness.minimum &&
    color.l <= bounds.lightness.maximum
  );
}
