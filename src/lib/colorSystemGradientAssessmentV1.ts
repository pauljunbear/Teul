/** Continuous checks of canonical opaque sRGB paint; this does not certify the ideal design path. */
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import { parseGradientV1, type GradientDesignV1 } from './colorSystemGradientV1';
import { parseGradientDesignV2, type GradientDesignV2 } from './colorSystemGradientDesignV2';
import {
  normalizeColorSystemSrgbValueV1,
  colorSystemSrgbToOklchV1,
} from './colorSystemSrgbValueV1';
import { getLuminance } from './utils';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';

export const GRADIENT_ASSESSMENT_V1 = 'teul.gradient-assessment.v1' as const;
export const GRADIENT_RENDER_ALLOWANCE_V1 = 2 / 255;
type Status = 'pass' | 'fail' | 'unassessed';
type RGB = ColorSystemColorValueV2['components'];
type Interval = readonly [number, number];
type Box = { r: Interval; g: Interval; b: Interval };
export interface GradientBoundsV1 {
  lightness: { minimum: number; maximum: number };
  chroma: { minimum: number; maximum: number };
  hueRanges: readonly { minimum: number; maximum: number }[];
}
export interface GradientLimitV1 {
  id: string;
  scope: 'authored-stops' | 'rendered-paint';
  effect: 'restrict-to' | 'exclude';
  bounds: GradientBoundsV1;
}
export interface GradientAssessmentPolicyV1 {
  use:
    | { kind: 'decorative' }
    | {
        kind: 'text';
        foreground: ColorSystemColorValueV2;
        minimumRatio: number;
        footprint: { start: number; end: number };
      };
  limits: readonly GradientLimitV1[];
}
export interface GradientAssessmentV1 {
  schemaVersion: typeof GRADIENT_ASSESSMENT_V1;
  designHash: string;
  policyHash: string;
  status: Status;
  profile: 'canonical-opaque-srgb';
  renderingChannelAllowance: number;
  idealPath: 'not-certified';
  limits: readonly {
    id: string;
    status: Status;
    witnessPosition: number | null;
    intervals: number;
  }[];
  contrast: null | {
    status: Status;
    minimumRatioLowerBound: number;
    minimumRatioObserved: number;
    intervals: number;
  };
}
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const EPS = 1e-12;
const MAX_CELLS = 8192,
  MAX_DEPTH = 16;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const mix = (a: RGB, b: RGB, t: number): RGB => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Gradient assessment requires records.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== keys.length || keys.some(key => !(key in data)))
    throw new Error('Unknown or missing gradient assessment field.');
  return data;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error('Gradient assessment number is outside its supported range.');
  return value;
}
function range(value: unknown, max: number) {
  const raw = record(value, ['minimum', 'maximum']);
  const minimum = number(raw.minimum, 0, max),
    maximum = number(raw.maximum, 0, max);
  if (minimum > maximum)
    throw new Error('Gradient limit ranges must increase. Split a hue range at 360 degrees.');
  return { minimum, maximum };
}
export function parseGradientAssessmentPolicyV1(raw: unknown): GradientAssessmentPolicyV1 {
  const data = record(snapshotColorSystemInertJsonV1(raw, { maximumBytes: 32768 }), [
    'use',
    'limits',
  ]);
  const kind = (data.use as { kind?: unknown })?.kind;
  const use = record(
    data.use,
    kind === 'decorative' ? ['kind'] : ['kind', 'foreground', 'minimumRatio', 'footprint']
  );
  let parsedUse: GradientAssessmentPolicyV1['use'];
  if (kind === 'decorative') parsedUse = { kind };
  else if (kind === 'text') {
    const foreground = normalizeColorSystemSrgbValueV1(use.foreground as ColorSystemColorValueV2);
    if (foreground.alpha !== 1) throw new Error('Gradient text requires an opaque foreground.');
    const footprint = record(use.footprint, ['start', 'end']);
    const start = number(footprint.start, 0, 1),
      end = number(footprint.end, 0, 1);
    if (start >= end)
      throw new Error(
        'The text footprint must cover an increasing, nonzero portion of the gradient line.'
      );
    parsedUse = {
      kind,
      foreground,
      minimumRatio: number(use.minimumRatio, 1, 21),
      footprint: { start, end },
    };
  } else throw new Error('Declare decorative or text use.');
  if (!Array.isArray(data.limits) || data.limits.length > 8)
    throw new Error('Use at most eight gradient limits.');
  const ids = new Set<string>();
  const limits = data.limits.map(value => {
    const item = record(value, ['id', 'scope', 'effect', 'bounds']);
    if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 128 || ids.has(item.id))
      throw new Error('Gradient limits need unique bounded identities.');
    ids.add(item.id);
    if (item.scope !== 'authored-stops' && item.scope !== 'rendered-paint')
      throw new Error('Declare whether a limit covers stops or rendered paint.');
    if (item.effect !== 'restrict-to' && item.effect !== 'exclude')
      throw new Error('Declare an allowed or excluded color region.');
    const bounds = record(item.bounds, ['lightness', 'chroma', 'hueRanges']);
    if (
      !Array.isArray(bounds.hueRanges) ||
      bounds.hueRanges.length < 1 ||
      bounds.hueRanges.length > 8
    )
      throw new Error('Use one through eight non-wrapping hue ranges.');
    return {
      id: item.id,
      scope: item.scope,
      effect: item.effect,
      bounds: {
        lightness: range(bounds.lightness, 1),
        chroma: range(bounds.chroma, 0.5),
        hueRanges: bounds.hueRanges.map(r => range(r, 360)),
      },
    } as GradientLimitV1;
  });
  return { use: parsedUse, limits };
}
// Outward padding covers floating arithmetic in these normalized, bounded transforms.
const pad = (low: number, high: number): Interval => [low - EPS, high + EPS];
const sum = (values: readonly Interval[], weights: readonly number[]): Interval =>
  pad(
    values.reduce((total, r, i) => total + r[weights[i] < 0 ? 1 : 0] * weights[i], 0),
    values.reduce((total, r, i) => total + r[weights[i] < 0 ? 0 : 1] * weights[i], 0)
  );
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function box(a: RGB, b: RGB, allowance: number): Box {
  const channel = (key: keyof RGB): Interval => [
    clamp(Math.min(a[key], b[key]) - allowance),
    clamp(Math.max(a[key], b[key]) + allowance),
  ];
  return { r: channel('r'), g: channel('g'), b: channel('b') };
}
function labBounds(rgb: Box): { l: Interval; c: Interval; hue: readonly Interval[] } {
  const channels = [rgb.r, rgb.g, rgb.b].map(r => pad(linear(r[0]), linear(r[1])));
  const roots = [
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
  ].map(weights => {
    const r = sum(channels, weights);
    return pad(Math.cbrt(r[0]), Math.cbrt(r[1]));
  });
  const l = sum(roots, [0.2104542553, 0.793617785, -0.0040720468]);
  const a = sum(roots, [1.9779984951, -2.428592205, 0.4505937099]);
  const b = sum(roots, [0.0259040371, 0.7827717662, -0.808675766]);
  const absMin = (r: Interval) =>
    r[0] <= 0 && r[1] >= 0 ? 0 : Math.min(Math.abs(r[0]), Math.abs(r[1]));
  const absMax = (r: Interval) => Math.max(Math.abs(r[0]), Math.abs(r[1]));
  const c: Interval = [
    Math.max(0, Math.hypot(absMin(a), absMin(b)) - EPS),
    Math.hypot(absMax(a), absMax(b)) + EPS,
  ];
  if (c[0] <= 0.000004) return { l, c, hue: [[0, 360]] };
  const center = (Math.atan2((b[0] + b[1]) / 2, (a[0] + a[1]) / 2) * 180) / Math.PI;
  const angles = a.flatMap(x =>
    b.map(y => {
      const angle = (Math.atan2(y, x) * 180) / Math.PI;
      return center + ((angle - center + 540) % 360) - 180;
    })
  );
  let low = Math.min(...angles) - EPS,
    high = Math.max(...angles) + EPS;
  while (low < 0) {
    low += 360;
    high += 360;
  }
  while (low >= 360) {
    low -= 360;
    high -= 360;
  }
  return {
    l,
    c,
    hue:
      high > 360
        ? [
            [low, 360],
            [0, high - 360],
          ]
        : [[low, high]],
  };
}
function mergedHues(bounds: GradientBoundsV1): Interval[] {
  const result: [number, number][] = [];
  for (const r of [...bounds.hueRanges].sort((a, b) => a.minimum - b.minimum)) {
    const last = result[result.length - 1];
    if (last && last[1] >= r.minimum) last[1] = Math.max(last[1], r.maximum);
    else result.push([r.minimum, r.maximum]);
  }
  return result;
}
const contained = (r: Interval, bound: { minimum: number; maximum: number }) =>
  r[0] >= bound.minimum && r[1] <= bound.maximum;
const disjoint = (r: Interval, bound: { minimum: number; maximum: number }) =>
  r[1] < bound.minimum || r[0] > bound.maximum;
function proveLimit(rgb: Box, limit: GradientLimitV1, hues: readonly Interval[]) {
  const observed = labBounds(rgb),
    bounds = limit.bounds;
  if (limit.effect === 'restrict-to')
    return (
      contained(observed.l, bounds.lightness) &&
      contained(observed.c, bounds.chroma) &&
      observed.hue.every(r => hues.some(h => r[0] >= h[0] && r[1] <= h[1]))
    );
  return (
    disjoint(observed.l, bounds.lightness) ||
    disjoint(observed.c, bounds.chroma) ||
    observed.hue.every(r => hues.every(h => r[1] < h[0] || r[0] > h[1]))
  );
}
function violates(rgb: RGB, limit: GradientLimitV1) {
  const c = colorSystemSrgbToOklchV1({ components: rgb });
  const b = limit.bounds,
    hue = c.h % 360;
  const inside =
    c.l >= b.lightness.minimum &&
    c.l <= b.lightness.maximum &&
    c.c >= b.chroma.minimum &&
    c.c <= b.chroma.maximum &&
    (c.c <= 0.000004 ||
      b.hueRanges.some(
        h => (hue >= h.minimum && hue <= h.maximum) || (hue === 0 && h.maximum === 360)
      ));
  return limit.effect === 'restrict-to' ? !inside : inside;
}
const combine = (a: Status, b: Status): Status =>
  a === 'fail' || b === 'fail'
    ? 'fail'
    : a === 'unassessed' || b === 'unassessed'
      ? 'unassessed'
      : 'pass';
const luminance = (rgb: RGB) => getLuminance(rgb.r * 255, rgb.g * 255, rgb.b * 255);
const luminanceBounds = (rgb: Box): Interval =>
  pad(
    luminance({ r: rgb.r[0], g: rgb.g[0], b: rgb.b[0] }),
    luminance({ r: rgb.r[1], g: rgb.g[1], b: rgb.b[1] })
  );
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const ratioLower = (a: Interval, b: Interval) =>
  a[0] <= b[1] && b[0] <= a[1]
    ? 1
    : Math.max(1, Math.min(ratio(a[0], b[1]), ratio(a[1], b[0])) - EPS);

export function assessGradientPaintV1(
  raw: GradientDesignV1,
  input: GradientAssessmentPolicyV1
): GradientAssessmentV1 {
  return assessValidatedPaint(parseGradientV1(raw), input);
}

/** Same final-paint policy and rendering allowance, applied to a distinct V2 design. */
export function assessGradientPaintV2(
  raw: GradientDesignV2,
  input: GradientAssessmentPolicyV1
): GradientAssessmentV1 {
  return assessValidatedPaint(parseGradientDesignV2(raw), input);
}

function assessValidatedPaint(
  design: GradientDesignV1 | GradientDesignV2,
  input: GradientAssessmentPolicyV1
): GradientAssessmentV1 {
  const policy = parseGradientAssessmentPolicyV1(input);
  const segments = design.compiledPaint.stops
    .slice(1)
    .map((right, i) => ({ left: design.compiledPaint.stops[i], right }));
  const limits = policy.limits.map(limit => {
    let intervals = 0,
      witnessPosition: number | null = null;
    if (limit.scope === 'authored-stops') {
      const witness = design.stops.find(stop => violates(stop.value.components, limit));
      return {
        id: limit.id,
        status: witness ? ('fail' as const) : ('pass' as const),
        witnessPosition: witness?.position ?? null,
        intervals: design.stops.length,
      };
    }
    // Inspect all coarse intervals first so an uncertain margin at the start cannot
    // exhaust the proof budget before a clear violation later in the gradient.
    for (const { left, right } of segments) {
      for (const [paint, position] of [
        [left.value.components, left.position],
        [
          mix(left.value.components, right.value.components, 0.5),
          (left.position + right.position) / 2,
        ],
        [right.value.components, right.position],
      ] as const) {
        if (violates(paint, limit))
          return { id: limit.id, status: 'fail' as const, witnessPosition: position, intervals: 0 };
      }
    }
    const hues = mergedHues(limit.bounds);
    const visit = (a: RGB, b: RGB, start: number, end: number, depth: number): Status => {
      intervals++;
      if (proveLimit(box(a, b, GRADIENT_RENDER_ALLOWANCE_V1), limit, hues)) return 'pass';
      const mid = mix(a, b, 0.5),
        pos = (start + end) / 2;
      for (const [paint, position] of [
        [a, start],
        [mid, pos],
        [b, end],
      ] as const)
        if (violates(paint, limit)) {
          witnessPosition ??= position;
          return 'fail';
        }
      if (
        depth === MAX_DEPTH ||
        intervals >= MAX_CELLS ||
        (a.r === b.r && a.g === b.g && a.b === b.b)
      )
        return 'unassessed';
      const left = visit(a, mid, start, pos, depth + 1);
      if (left === 'fail') return left;
      if (intervals >= MAX_CELLS) return 'unassessed';
      return combine(left, visit(mid, b, pos, end, depth + 1));
    };
    let status: Status = 'pass';
    for (const { left, right } of segments) {
      if (intervals >= MAX_CELLS) {
        status = combine(status, 'unassessed');
        break;
      }
      status = combine(
        status,
        visit(left.value.components, right.value.components, left.position, right.position, 0)
      );
      if (status === 'fail') break;
    }
    return { id: limit.id, status, witnessPosition, intervals };
  });
  let contrast: GradientAssessmentV1['contrast'] = null;
  if (policy.use.kind === 'text') {
    const use = policy.use,
      fg = luminance(use.foreground.components),
      fgRange = luminanceBounds(
        box(use.foreground.components, use.foreground.components, GRADIENT_RENDER_ALLOWANCE_V1)
      );
    let lower = 21,
      observed = 21,
      intervals = 0;
    const clipped = segments.flatMap(({ left, right }) => {
      const start = Math.max(left.position, use.footprint.start),
        end = Math.min(right.position, use.footprint.end);
      if (start >= end) return [];
      const at = (position: number) =>
        mix(
          left.value.components,
          right.value.components,
          (position - left.position) / (right.position - left.position)
        );
      const a = at(start),
        b = at(end);
      observed = Math.min(
        observed,
        ...[a, mix(a, b, 0.5), b].map(rgb => ratio(fg, luminance(rgb)))
      );
      return [{ a, b }];
    });
    const visit = (a: RGB, b: RGB, depth: number): Status => {
      intervals++;
      const bound = ratioLower(fgRange, luminanceBounds(box(a, b, GRADIENT_RENDER_ALLOWANCE_V1))),
        mid = mix(a, b, 0.5);
      const sample = Math.min(
        ratio(fg, luminance(a)),
        ratio(fg, luminance(mid)),
        ratio(fg, luminance(b))
      );
      observed = Math.min(observed, sample);
      if (
        bound >= use.minimumRatio ||
        sample < use.minimumRatio ||
        depth === MAX_DEPTH ||
        intervals >= MAX_CELLS ||
        (a.r === b.r && a.g === b.g && a.b === b.b)
      ) {
        lower = Math.min(lower, bound);
        return bound >= use.minimumRatio
          ? 'pass'
          : sample < use.minimumRatio
            ? 'fail'
            : 'unassessed';
      }
      const first = visit(a, mid, depth + 1);
      if (intervals >= MAX_CELLS) {
        lower = 1;
        return combine(first, 'unassessed');
      }
      return combine(first, visit(mid, b, depth + 1));
    };
    let status: Status = observed < use.minimumRatio ? 'fail' : 'pass';
    for (const { a, b } of clipped) {
      if (status === 'fail') {
        lower = 1;
        break;
      }
      if (intervals >= MAX_CELLS) {
        lower = 1;
        status = combine(status, 'unassessed');
        break;
      }
      status = combine(status, visit(a, b, 0));
    }
    contrast = { status, minimumRatioLowerBound: lower, minimumRatioObserved: observed, intervals };
  }
  const status = limits.reduce(
    (status, item) => combine(status, item.status),
    contrast?.status ?? 'pass'
  );
  return {
    schemaVersion: GRADIENT_ASSESSMENT_V1,
    designHash: design.designHash,
    policyHash: hash(policy),
    status,
    profile: 'canonical-opaque-srgb',
    renderingChannelAllowance: GRADIENT_RENDER_ALLOWANCE_V1,
    idealPath: 'not-certified',
    limits,
    contrast,
  };
}
