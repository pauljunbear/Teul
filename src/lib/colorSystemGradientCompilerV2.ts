import type { GradientInputV1 } from './colorSystemGradientV1';
import { compileGradientSampledPaintV1 } from './colorSystemGradientConstructionV1';
import { retainGradientPaintV2, type GradientDesignV2 } from './colorSystemGradientDesignV2';

/** Native samples construct a candidate with margin. Revalidation independently decides fidelity. */
export function compileGradientV2(raw: GradientInputV1): GradientDesignV2 {
  const { input, stops } = compileGradientSampledPaintV1(raw, 0.0025);
  return retainGradientPaintV2(input, stops);
}
