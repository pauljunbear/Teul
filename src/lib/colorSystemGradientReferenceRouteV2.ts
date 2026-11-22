/** A real-arithmetic reference, independent of the native V1 compiler's angle calculations. */
import type { GradientDesignV1, GradientStopV1 } from './colorSystemGradientV1';
import {
  type IntervalV1 as Interval,
  type OklabIntervalBoxV1 as LabBox,
  intervalV1,
  pointIntervalV1 as point,
  addIntervalsV1 as add,
  subtractIntervalsV1 as subtract,
  multiplyIntervalsV1 as multiply,
  dividePositiveIntervalV1 as divide,
  scaleIntervalV1 as scale,
  squareIntervalV1 as square,
  sqrtIntervalV1 as sqrt,
  srgbToOklabIntervalsV1 as toLab,
  sinCosIntervalsV1,
} from './colorSystemGradientIntervalsV1';
import {
  type DualOklabBoxV1 as DualLab,
  dualVariableV1,
  multiplyDualV1,
  sinCosDualV1,
} from './colorSystemGradientDualIntervalsV1';

export { GRADIENT_REFERENCE_V2 } from './colorSystemGradientDesignV2';
// Mathematical pi lies between these adjacent binary64 values.
export const PI_INTERVAL_V2: Interval = Object.freeze([3.141592653589793, 3.1415926535897936]);
const PI = PI_INTERVAL_V2;
const ZERO: Interval = [0, 0];
const ONE: Interval = [1, 1];
const norm = (a: Interval, b: Interval) => sqrt(add(square(a), square(b)));
const mix = (a: Interval, b: Interval, t: Interval) => add(a, multiply(subtract(b, a), t));

function atanUnit(a: Interval): Interval {
  // Two half-angle reductions put |z| below .2. All operations enclose their exact values.
  let z = a;
  for (let i = 0; i < 2; i++) z = divide(z, add(ONE, sqrt(add(ONE, square(z)))));
  if (Math.max(Math.abs(z[0]), Math.abs(z[1])) >= 0.2)
    throw new Error('Unresolved atan range reduction.');
  const z2 = square(z);
  let power = z,
    sum = z;
  for (let i = 1; i <= 16; i++) {
    power = multiply(power, z2);
    sum = add(sum, scale(divide(power, point(2 * i + 1)), i % 2 ? -1 : 1));
  }
  // Alternating Taylor series through z^33/33: remainder <= |z|^35/35.
  const next = divide(multiply(power, z2), point(35));
  const remainder = Math.max(Math.abs(next[0]), Math.abs(next[1]));
  return scale(add(sum, [-remainder, remainder]), 4);
}

/** Monotonic endpoints; no Math.atan/atan2 or assumed transcendental error padding. */
export function atanIntervalV2(value: Interval): Interval {
  intervalV1(...value);
  const endpoint = (x: number): Interval => {
    if (x === 0) return ZERO;
    const magnitude = Math.abs(x);
    const positive =
      magnitude <= 1
        ? atanUnit(point(magnitude))
        : subtract(scale(PI, 0.5), atanUnit(divide(ONE, point(magnitude))));
    return x < 0 ? scale(positive, -1) : positive;
  };
  return intervalV1(endpoint(value[0])[0], endpoint(value[1])[1]);
}

/** One continuous, possibly unwrapped angle for a rectangle excluding the origin. */
export function atan2IntervalV2(y: Interval, x: Interval): Interval {
  intervalV1(...x);
  intervalV1(...y);
  const minimumMagnitude = (a: Interval) =>
    a[0] <= 0 && a[1] >= 0 ? 0 : Math.min(Math.abs(a[0]), Math.abs(a[1]));
  const xMinimum = minimumMagnitude(x),
    yMinimum = minimumMagnitude(y);
  if (xMinimum === 0 && yMinimum === 0)
    throw new Error('Hue is unresolved for a box containing the origin.');
  // Choose the safer denominator; the sign checks below establish its validity.
  if (xMinimum >= yMinimum) {
    if (x[0] > 0) return atanIntervalV2(divide(y, x));
    return subtract(PI, atanIntervalV2(divide(y, scale(x, -1))));
  }
  if (y[0] > 0) return subtract(scale(PI, 0.5), atanIntervalV2(divide(x, y)));
  return add(scale(PI, -0.5), atanIntervalV2(divide(x, scale(y, -1))));
}

export interface GradientReferenceCellV2 {
  lab: LabBox;
  chroma: Interval;
}
export interface GradientReferenceRouteV2 {
  cell(t: Interval): GradientReferenceCellV2;
  dual(t: Interval): DualLab;
}

export function sourceLabV2(stop: GradientStopV1): LabBox {
  const rgb = stop.value.components;
  return toLab({ r: point(rgb.r), g: point(rgb.g), b: point(rgb.b) });
}

function neutral(chroma: Interval): boolean {
  if (chroma[1] < 1e-6) return true;
  if (chroma[0] >= 1e-6) return false;
  throw new Error('Source chroma straddles the neutral threshold.');
}

/** Ambiguous wrap/deadband decisions cannot silently choose a different hue path. */
export function referenceHueDeltaV2(left: Interval, right: Interval, longer: boolean): Interval {
  const raw = subtract(right, left);
  let shortest: Interval | undefined;
  for (let turns = -2; turns <= 2; turns++) {
    const candidate = subtract(raw, scale(PI, 2 * turns));
    if (candidate[0] >= -PI[0] && candidate[1] < PI[0]) {
      shortest = candidate;
      break;
    }
  }
  if (!shortest) throw new Error('Hue path straddles the half-turn decision.');
  if (!longer) return shortest;
  const epsilon = divide(scale(PI, 1e-9), point(180));
  if (shortest[0] >= -epsilon[0] && shortest[1] <= epsilon[0]) return shortest;
  if (shortest[0] > epsilon[1]) return subtract(shortest, scale(PI, 2));
  if (shortest[1] < -epsilon[1]) return add(shortest, scale(PI, 2));
  throw new Error('Hue path straddles the longer-path deadband.');
}

export function createGradientReferenceRouteV2(
  a: GradientStopV1,
  b: GradientStopV1,
  design: Pick<GradientDesignV1, 'route'>
): GradientReferenceRouteV2 {
  const left = sourceLabV2(a),
    right = sourceLabV2(b);
  const channel = (key: keyof LabBox, t: Interval) => mix(left[key], right[key], t);
  if (design.route.space === 'oklab') {
    return {
      cell: t => {
        const lab = { L: channel('L', t), a: channel('a', t), b: channel('b', t) };
        return { lab, chroma: norm(lab.a, lab.b) };
      },
      dual: t => ({
        L: dualVariableV1(channel('L', t), subtract(right.L, left.L)),
        a: dualVariableV1(channel('a', t), subtract(right.a, left.a)),
        b: dualVariableV1(channel('b', t), subtract(right.b, left.b)),
      }),
    };
  }
  const leftC = norm(left.a, left.b),
    rightC = norm(right.a, right.b);
  const leftNeutral = neutral(leftC),
    rightNeutral = neutral(rightC);
  const leftHue = leftNeutral ? null : atan2IntervalV2(left.b, left.a),
    rightHue = rightNeutral ? null : atan2IntervalV2(right.b, right.a);
  const hue = leftHue ?? rightHue ?? ZERO;
  const identical = (['r', 'g', 'b'] as const).every(
    key => a.value.components[key] === b.value.components[key]
  );
  const delta =
    leftNeutral || rightNeutral || identical
      ? ZERO
      : referenceHueDeltaV2(hue, rightHue!, design.route.huePath === 'longer');
  const angle = (t: Interval) => add(hue, multiply(delta, t));
  return {
    cell: t => {
      const chroma = mix(leftC, rightC, t);
      const { sin, cos } = sinCosIntervalsV1(angle(t));
      return {
        chroma,
        lab: { L: channel('L', t), a: multiply(chroma, cos), b: multiply(chroma, sin) },
      };
    },
    dual: t => {
      const chroma = dualVariableV1(mix(leftC, rightC, t), subtract(rightC, leftC));
      const { sin, cos } = sinCosDualV1(dualVariableV1(angle(t), delta));
      return {
        L: dualVariableV1(channel('L', t), subtract(right.L, left.L)),
        a: multiplyDualV1(chroma, cos),
        b: multiplyDualV1(chroma, sin),
      };
    },
  };
}
