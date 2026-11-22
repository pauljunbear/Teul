/** Final paint identity; capture authority and source rules are verified by the authoring caller. */
import { parseGradientDesignV2, type GradientDesignV2 } from './colorSystemGradientDesignV2';
import {
  NATIVE_LINEAR_PAINT_V1,
  parseNativeLinearPaintV1,
  type NativeLinearPaintV1,
} from './colorSystemNativeGradientPaintV1';

export type ColorSystemFinalGradientPaintV1 = GradientDesignV2 | NativeLinearPaintV1;

export function isNativeLinearPaintV1(raw: unknown): raw is NativeLinearPaintV1 {
  return (
    !!raw &&
    typeof raw === 'object' &&
    'schemaVersion' in raw &&
    raw.schemaVersion === NATIVE_LINEAR_PAINT_V1
  );
}

export function parseColorSystemFinalGradientPaintV1(
  raw: unknown
): ColorSystemFinalGradientPaintV1 {
  return isNativeLinearPaintV1(raw) ? parseNativeLinearPaintV1(raw) : parseGradientDesignV2(raw);
}
