/** Opaque linear gradient proof. Source permission is checked by the reviewed-guideline caller. */
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { normalizeColorSystemSrgbValueV1 } from './colorSystemSrgbValueV1';
import { getLuminance } from './utils';
import { compileGradientSampledPaintV1 } from './colorSystemGradientConstructionV1';
import { serializeGradientCssV1, serializeGradientSvgV1 } from './colorSystemGradientPaintV1';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';

export const GRADIENT_V1 = 'teul.gradient-design.v1' as const;
export const GRADIENT_COMPILER_V1 = 'teul.opaque-srgb-gradient.v1' as const;
const CHANNELS = ['r', 'g', 'b'] as const;
type RGB = ColorSystemColorValueV2['components'];
export interface GradientStopV1 {
  position: number;
  value: ColorSystemColorValueV2;
  sourceColorId: string | null;
  locked: boolean;
}
export interface GradientInputV1 {
  sourceModelHash: string;
  briefHash: string;
  angleDegrees: number;
  stops: readonly GradientStopV1[];
  route: { space: 'oklab' } | { space: 'oklch'; huePath: 'shorter' | 'longer' };
}
export interface GradientPaintStopV1 {
  position: number;
  value: ColorSystemColorValueV2;
}
export interface GradientDesignV1 extends GradientInputV1 {
  schemaVersion: typeof GRADIENT_V1;
  compiledPaint: {
    version: typeof GRADIENT_COMPILER_V1;
    interpolation: 'srgb';
    stops: readonly GradientPaintStopV1[];
    /** Observed approximation error; deliberately not a continuous fidelity certificate. */
    approximation: {
      method: 'uniform-oracle';
      intervalsPerAuthoredSegment: 4096;
      maxObservedDeltaEOK: number;
    };
  };
  designHash: string;
}
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const trusted = new WeakSet<object>();
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRgb = (a: RGB, b: RGB, t: number): RGB => ({
  r: mix(a.r, b.r, t),
  g: mix(a.g, b.g, t),
  b: mix(a.b, b.b, t),
});

/** Legacy compiler: its construction target, saved bytes and parser remain unchanged. */
export function compileGradientV1(raw: GradientInputV1): GradientDesignV1 {
  const { input, stops, maximumObserved } = compileGradientSampledPaintV1(raw, 0.005);
  const content = {
    ...input,
    schemaVersion: GRADIENT_V1,
    compiledPaint: {
      version: GRADIENT_COMPILER_V1,
      interpolation: 'srgb' as const,
      stops,
      approximation: {
        method: 'uniform-oracle' as const,
        intervalsPerAuthoredSegment: 4096 as const,
        maxObservedDeltaEOK: maximumObserved,
      },
    },
  };
  const result = freeze({ ...content, designHash: hash(content) });
  trusted.add(result);
  return result;
}

/** Reopen checks compiler replay as well as the digest. No supplied cached assessment is trusted. */
export function parseGradientV1(raw: unknown): GradientDesignV1 {
  if (raw && typeof raw === 'object' && trusted.has(raw)) return raw as GradientDesignV1;
  const data = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 128_000 }) as GradientDesignV1;
  if (!data || data.schemaVersion !== GRADIENT_V1) throw new Error('Unsupported gradient design.');
  const result = compileGradientV1({
    sourceModelHash: data.sourceModelHash,
    briefHash: data.briefHash,
    angleDegrees: data.angleDegrees,
    stops: data.stops,
    route: data.route,
  });
  if (canonicalJson(result) === canonicalJson(data)) return result;
  // The original compiler uses transcendental math, whose last bits vary across JS engines.
  // Preserve the exact saved paint after verifying its digest, recipe and narrow derived drift.
  const { designHash, ...content } = data;
  if (designHash !== hash(content) || !equivalentGeneratedPaint(data, result))
    throw new Error('Gradient recipe or compiled paint changed.');
  const preserved = freeze(data);
  trusted.add(preserved);
  return preserved;
}

// Replay equivalence is not a source-color rounding policy or a visual similarity threshold.
const REPLAY_NUMERIC_TOLERANCE = 1e-11;
function equivalentGeneratedPaint(saved: GradientDesignV1, replayed: GradientDesignV1): boolean {
  const paint = saved.compiledPaint;
  if (
    !paint ||
    !Array.isArray(paint.stops) ||
    paint.stops.length !== replayed.compiledPaint.stops.length
  )
    return false;
  const error = paint.approximation?.maxObservedDeltaEOK;
  if (
    !Number.isFinite(error) ||
    error < 0 ||
    error > 0.005 ||
    Math.abs(error - replayed.compiledPaint.approximation.maxObservedDeltaEOK) >
      REPLAY_NUMERIC_TOLERANCE
  )
    return false;
  const compared = paint.stops.map((stop, index) => {
    const expected = replayed.compiledPaint.stops[index];
    const value = normalizeColorSystemSrgbValueV1(stop.value);
    // Reject altered display values, representations, extra properties and forged native hashes.
    if (canonicalJson(value) !== canonicalJson(stop.value))
      throw new Error('Gradient recipe or compiled paint changed.');
    if (replayed.stops.some(authored => authored.position === expected.position)) return stop;
    if (
      value.alpha !== 1 ||
      CHANNELS.some(
        channel =>
          Math.abs(value.components[channel] - expected.value.components[channel]) >
          REPLAY_NUMERIC_TOLERANCE
      )
    )
      throw new Error('Gradient recipe or compiled paint changed.');
    return { ...stop, value: expected.value };
  });
  // Only generated color values, numerical error and the already-verified digest differ.
  // Source bindings, authored values, stop positions/topology and all other metadata stay exact.
  const comparison = {
    ...saved,
    designHash: replayed.designHash,
    compiledPaint: {
      ...paint,
      stops: compared,
      approximation: {
        ...paint.approximation,
        maxObservedDeltaEOK: replayed.compiledPaint.approximation.maxObservedDeltaEOK,
      },
    },
  };
  return canonicalJson(comparison) === canonicalJson(replayed);
}

const luminance = (v: RGB) => getLuminance(v.r * 255, v.g * 255, v.b * 255);

/** Each channel is monotone along an sRGB segment. Channel bounds give conservative luminance bounds. */
function segmentBounds(a: RGB, b: RGB): [number, number] {
  return [
    luminance({ r: Math.min(a.r, b.r), g: Math.min(a.g, b.g), b: Math.min(a.b, b.b) }),
    luminance({ r: Math.max(a.r, b.r), g: Math.max(a.g, b.g), b: Math.max(a.b, b.b) }),
  ];
}
function ratioFor(lum: number, background: number) {
  return (Math.max(lum, background) + 0.05) / (Math.min(lum, background) + 0.05);
}

export interface GradientContrastV1 {
  scope: 'entire-compiled-gradient';
  foreground: ColorSystemColorValueV2;
  minimumRequired: number;
  minimumRatioLowerBound: number;
  minimumRatioObserved: number;
  status: 'pass' | 'fail' | 'unresolved';
  profile: 'opaque-srgb';
  designHash: string;
}
/** Continuous conservative bound. A fixed sampling pass can never authorize a passing badge. */
export function assessGradientContrastV1(
  design: GradientDesignV1,
  foreground: ColorSystemColorValueV2,
  minimum = 4.5
): GradientContrastV1 {
  design = parseGradientV1(design);
  const fg = normalizeColorSystemSrgbValueV1(foreground);
  if (fg.alpha !== 1 || !Number.isFinite(minimum) || minimum < 1 || minimum > 21)
    throw new Error('Contrast needs opaque foreground text and a threshold from 1 to 21.');
  const light = luminance(fg.components);
  let observed = 21;
  let lower = 21;
  const visit = (a: RGB, b: RGB, depth: number) => {
    const [low, high] = segmentBounds(a, b);
    const bound =
      light >= low && light <= high ? 1 : Math.min(ratioFor(light, low), ratioFor(light, high));
    const mid = mixRgb(a, b, 0.5);
    const sampled = Math.min(
      ratioFor(light, luminance(a)),
      ratioFor(light, luminance(b)),
      ratioFor(light, luminance(mid))
    );
    observed = Math.min(observed, sampled);
    if (depth === 14 || sampled - bound < 0.0001) {
      lower = Math.min(lower, Math.max(1, bound - 1e-10));
      return;
    }
    visit(a, mid, depth + 1);
    visit(mid, b, depth + 1);
  };
  const stops = design.compiledPaint.stops;
  for (let i = 0; i < stops.length - 1; i++)
    visit(stops[i].value.components, stops[i + 1].value.components, 0);
  return {
    scope: 'entire-compiled-gradient',
    foreground: fg,
    minimumRequired: minimum,
    minimumRatioLowerBound: lower,
    minimumRatioObserved: observed,
    status: lower >= minimum ? 'pass' : observed < minimum ? 'fail' : 'unresolved',
    profile: 'opaque-srgb',
    designHash: design.designHash,
  };
}

export function gradientCssV1(design: GradientDesignV1): string {
  return serializeGradientCssV1(parseGradientV1(design));
}
export function gradientSvgV1(design: GradientDesignV1, width = 800, height = 480): string {
  return serializeGradientSvgV1(parseGradientV1(design), width, height);
}
