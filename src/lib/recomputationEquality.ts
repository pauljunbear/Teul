/**
 * Compares a record the UI sent with the backend's own recomputation of it.
 *
 * In Figma the UI runs in the browser's JavaScript engine and the plugin code in a
 * different one, so a floating-point result such as a WCAG contrast ratio can differ
 * in its last digit between the two (observed: 16.6164899971249 against
 * 16.616489997124905 for the same pair of hex colors). Exact JSON equality refused
 * such legitimate requests.
 *
 * Rule: every value must match exactly (strings, booleans, integers, step numbers,
 * hex values, thresholds, every `pass` and `valid` verdict, array lengths and key
 * sets), except a number under a key named `ratio`, which may differ by at most
 * RATIO_TOLERANCE. Because each verdict must equal the recomputed verdict, a sent
 * ratio within tolerance of a threshold can never change pass or fail: the
 * recomputation decides.
 */
export const RATIO_TOLERANCE = 1e-9;

const TOLERANT_NUMBER_KEYS = new Set(['ratio']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keys whose values JSON would serialize (undefined-valued keys are absent in JSON). */
function presentKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value)
    .filter(key => value[key] !== undefined)
    .sort();
}

function matches(sent: unknown, recomputed: unknown, key: string | null): boolean {
  if (typeof recomputed === 'number') {
    if (typeof sent !== 'number' || !Number.isFinite(sent) || !Number.isFinite(recomputed)) {
      return false;
    }
    return key !== null && TOLERANT_NUMBER_KEYS.has(key)
      ? Math.abs(sent - recomputed) <= RATIO_TOLERANCE
      : sent === recomputed;
  }
  if (Array.isArray(recomputed)) {
    return (
      Array.isArray(sent) &&
      sent.length === recomputed.length &&
      recomputed.every((item, index) => matches(sent[index], item, null))
    );
  }
  if (isPlainObject(recomputed)) {
    if (!isPlainObject(sent)) return false;
    const sentKeys = presentKeys(sent);
    const recomputedKeys = presentKeys(recomputed);
    return (
      sentKeys.length === recomputedKeys.length &&
      recomputedKeys.every(
        (name, index) => sentKeys[index] === name && matches(sent[name], recomputed[name], name)
      )
    );
  }
  return sent === recomputed;
}

export function matchesRecomputation(sent: unknown, recomputed: unknown): boolean {
  return matches(sent, recomputed, null);
}
