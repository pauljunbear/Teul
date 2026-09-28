/** A retained candidate paint. Structural validity never authorizes a fidelity or accessibility pass. */
import type { GradientInputV1, GradientPaintStopV1 } from './colorSystemGradientV1';
import { normalizeGradientInputV1 } from './colorSystemGradientConstructionV1';
import { normalizeColorSystemSrgbValueV1 } from './colorSystemSrgbValueV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';

export const GRADIENT_V2 = 'teul.gradient-design.v2' as const;
export const GRADIENT_COMPILER_V2 = 'teul.opaque-srgb-gradient.v2' as const;
export const GRADIENT_REFERENCE_V2 = 'teul.gradient-reference-route.v2' as const;
export interface GradientDesignV2 extends GradientInputV1 {
  schemaVersion: typeof GRADIENT_V2;
  referenceVersion: typeof GRADIENT_REFERENCE_V2;
  compiledPaint: {
    version: typeof GRADIENT_COMPILER_V2;
    interpolation: 'srgb';
    stops: readonly GradientPaintStopV1[];
  };
  designHash: string;
}
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const structurallyValid = new WeakSet<object>();
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Used for construction and source-refresh rebinding. It deliberately carries no cached success. */
export function retainGradientPaintV2(
  raw: GradientInputV1,
  rawPaint: readonly GradientPaintStopV1[]
): GradientDesignV2 {
  const input = normalizeGradientInputV1(raw);
  const paint = snapshotColorSystemInertJsonV1(rawPaint, { maximumBytes: 96_000 }) as
    GradientPaintStopV1[] | null;
  if (!Array.isArray(paint) || paint.length < 2 || paint.length > 64)
    throw new Error('Gradient paint requires two to 64 stops.');
  const stops = paint.map((stop, index) => {
    if (!stop || typeof stop !== 'object') throw new Error('Invalid gradient paint stop.');
    const value = normalizeColorSystemSrgbValueV1(stop.value);
    if (
      !Number.isFinite(stop.position) ||
      stop.position < 0 ||
      stop.position > 1 ||
      value.alpha !== 1 ||
      (index > 0 && stop.position <= paint[index - 1].position)
    )
      throw new Error('Gradient paint requires increasing positions and opaque values.');
    const normalized = { position: stop.position, value };
    if (canonicalJson(normalized) !== canonicalJson(stop))
      throw new Error('Gradient paint contains altered values or unknown fields.');
    return normalized;
  });
  for (const anchor of input.stops) {
    const found = stops.find(stop => stop.position === anchor.position);
    if (!found || canonicalJson(found.value) !== canonicalJson(anchor.value))
      throw new Error('Gradient paint must preserve every authored anchor exactly.');
  }
  const content = {
    ...input,
    schemaVersion: GRADIENT_V2,
    referenceVersion: GRADIENT_REFERENCE_V2,
    compiledPaint: { version: GRADIENT_COMPILER_V2, interpolation: 'srgb' as const, stops },
  };
  const result = freeze({ ...content, designHash: hash(content) });
  structurallyValid.add(result);
  return result;
}

/** Fast, strict saved-data reader. A valid hash is integrity evidence, never an assessment. */
export function parseGradientDesignV2(raw: unknown): GradientDesignV2 {
  if (raw && typeof raw === 'object' && structurallyValid.has(raw)) return raw as GradientDesignV2;
  const data = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 128_000 }) as GradientDesignV2;
  if (!data || data.schemaVersion !== GRADIENT_V2)
    throw new Error('Unsupported V2 gradient design.');
  const result = retainGradientPaintV2(
    {
      sourceModelHash: data.sourceModelHash,
      briefHash: data.briefHash,
      angleDegrees: data.angleDegrees,
      route: data.route,
      stops: data.stops,
    },
    data.compiledPaint?.stops
  );
  if (canonicalJson(result) !== canonicalJson(data))
    throw new Error('Gradient design, reference, paint or digest changed.');
  return result;
}

export function gradientPaintHashV2(raw: GradientDesignV2): string {
  const design = parseGradientDesignV2(raw);
  return hash({
    referenceVersion: GRADIENT_REFERENCE_V2,
    designHash: design.designHash,
    stops: design.compiledPaint.stops,
  });
}
