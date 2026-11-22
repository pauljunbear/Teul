/** Exact native stops with authored geometry. Integrity does not grant source-use approval. */
import {
  canonicalDerivedNumberV2,
  canonicalJson,
  deterministicContentHash,
} from './colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';
import { buildColorSystemSrgbValueV1 } from './colorSystemSrgbValueV1';
import type { GradientStopV1 } from './colorSystemGradientV1';
import {
  inspectNativeGradientPaintV1,
  type NativeGradientPointV1,
} from './colorSystemNativeGradientGeometryV1';

export const NATIVE_LINEAR_PAINT_V1 = 'teul.native-linear-paint.v1' as const;
export const NATIVE_LINEAR_PAINT_LIMITS_V1 = /* @__PURE__ */ Object.freeze({
  maximumBytes: 512_000,
  maximumDepth: 24,
  maximumNodes: 220_000,
});
export interface NativeLinearPaintInputV1 {
  readonly sourceModelHash: string;
  readonly briefHash: string;
  readonly sourceEvidenceHash: string;
  readonly originalPaint: Readonly<Record<string, unknown>>;
  /** Clockwise rotation in normalized source coordinates about the first two handles' midpoint. */
  readonly rotationDegrees: number;
  /** Indexed by original stop order. Positions may coincide; source colors never move between indices. */
  readonly positions: readonly number[];
}
export interface NativeLinearPaintV1 extends NativeLinearPaintInputV1 {
  readonly schemaVersion: typeof NATIVE_LINEAR_PAINT_V1;
  readonly interpretation: 'srgb';
  readonly paint: Readonly<Record<string, unknown>>;
  /** These are native gradient-stop values, not admitted solid-palette members. */
  readonly stops: readonly GradientStopV1[];
  readonly designHash: string;
}
const trusted = /* @__PURE__ */ new WeakSet<object>();
const hash = (raw: unknown) => deterministicContentHash(canonicalJson(raw));
const digest = (raw: unknown) => typeof raw === 'string' && /^sha256:[a-f0-9]{64}$/.test(raw);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function retainNativeLinearPaintV1(raw: NativeLinearPaintInputV1): NativeLinearPaintV1 {
  const input = snapshotColorSystemInertJsonV1(raw, {
    maximumBytes: 128_000,
  }) as NativeLinearPaintInputV1;
  const keys = [
    'sourceModelHash',
    'briefHash',
    'sourceEvidenceHash',
    'originalPaint',
    'rotationDegrees',
    'positions',
  ];
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length !== keys.length ||
    keys.some(key => !(key in input)) ||
    ![input.sourceModelHash, input.briefHash, input.sourceEvidenceHash].every(digest)
  )
    throw new Error('A native edit requires exact model, brief and source-evidence bindings.');
  const original = input.originalPaint;
  if (
    !original ||
    typeof original !== 'object' ||
    Array.isArray(original) ||
    original.type !== 'GRADIENT_LINEAR'
  )
    throw new Error('Only captured linear gradients support native geometry editing.');
  const parsed = inspectNativeGradientPaintV1(original, true);
  if (parsed.issues.length) throw new Error(parsed.issues[0]);
  if (
    !Number.isFinite(input.rotationDegrees) ||
    input.rotationDegrees < -360 ||
    input.rotationDegrees > 360
  )
    throw new Error('Native gradient rotation must be finite and between -360 and 360 degrees.');
  if (
    !Array.isArray(input.positions) ||
    input.positions.length !== parsed.stops.length ||
    input.positions.some(
      (position, i) =>
        !Number.isFinite(position) ||
        position < 0 ||
        position > 1 ||
        (i > 0 && position < input.positions[i - 1])
    )
  )
    throw new Error('Keep one ordered position from zero to one for every captured stop.');
  const turn = input.rotationDegrees;
  let handles = parsed.handles;
  if (turn !== 0 && Math.abs(turn) !== 360) {
    // Exact quarter-turns avoid tiny trigonometric residuals; only authored geometry is canonicalized.
    const quarter = turn / 90;
    const cardinal = Number.isInteger(quarter) ? ((quarter % 4) + 4) % 4 : null;
    const cosine = cardinal === null ? Math.cos((turn * Math.PI) / 180) : [1, 0, -1, 0][cardinal];
    const sine = cardinal === null ? Math.sin((turn * Math.PI) / 180) : [0, 1, 0, -1][cardinal];
    const cx = (handles[0].x + handles[1].x) / 2;
    const cy = (handles[0].y + handles[1].y) / 2;
    handles = handles.map((point): NativeGradientPointV1 => ({
      x: canonicalDerivedNumberV2(cx + (point.x - cx) * cosine - (point.y - cy) * sine),
      y: canonicalDerivedNumberV2(cy + (point.x - cx) * sine + (point.y - cy) * cosine),
    }));
  }
  const originalStops = original.gradientStops as Readonly<Record<string, unknown>>[];
  const paint = {
    ...original,
    gradientHandlePositions: handles,
    gradientStops: originalStops.map((stop, i) => ({ ...stop, position: input.positions[i] })),
  };
  const changed = inspectNativeGradientPaintV1(paint, true);
  if (changed.issues.length) throw new Error(changed.issues[0]);
  const stops = parsed.stops.map((stop, i): GradientStopV1 => ({
    position: input.positions[i],
    sourceColorId: null,
    locked: true,
    value: buildColorSystemSrgbValueV1(
      { r: stop.color.r, g: stop.color.g, b: stop.color.b },
      stop.color.a
    ),
  }));
  const content = {
    ...input,
    schemaVersion: NATIVE_LINEAR_PAINT_V1,
    interpretation: 'srgb' as const,
    paint,
    stops,
  };
  const value = freeze(
    snapshotColorSystemInertJsonV1(
      { ...content, designHash: hash(content) },
      NATIVE_LINEAR_PAINT_LIMITS_V1
    ) as NativeLinearPaintV1
  );
  trusted.add(value);
  return value;
}

/** Rebuild geometry and exact indexed colors, rejecting even self-consistently rehashed output changes. */
export function parseNativeLinearPaintV1(raw: unknown): NativeLinearPaintV1 {
  if (raw && typeof raw === 'object' && trusted.has(raw)) return raw as NativeLinearPaintV1;
  const input = snapshotColorSystemInertJsonV1(
    raw,
    NATIVE_LINEAR_PAINT_LIMITS_V1
  ) as NativeLinearPaintV1;
  if (!input || input.schemaVersion !== NATIVE_LINEAR_PAINT_V1)
    throw new Error('Unsupported native linear paint.');
  const result = retainNativeLinearPaintV1({
    sourceModelHash: input.sourceModelHash,
    briefHash: input.briefHash,
    sourceEvidenceHash: input.sourceEvidenceHash,
    originalPaint: input.originalPaint,
    rotationDegrees: input.rotationDegrees,
    positions: input.positions,
  });
  if (canonicalJson(result) !== canonicalJson(input))
    throw new Error('Native source paint, edited geometry or retained identity changed.');
  return result;
}
