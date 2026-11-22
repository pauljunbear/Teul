/** Numerical tolerance shared with the existing data-visualization blueprint. */
const MONOTONIC_EPSILON = 1e-12;

export function strictlyMonotonicColorMetricV1(
  values: readonly number[],
  direction: 1 | -1
): boolean {
  if (values.length < 2 || !values.every(Number.isFinite)) return false;
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] - values[index - 1]) * direction <= MONOTONIC_EPSILON) return false;
  }
  return true;
}
