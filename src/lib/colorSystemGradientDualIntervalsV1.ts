/**
 * First-derivative enclosures for one shared real parameter. Experimental only.
 * Values and derivatives both use the existing outward interval primitives.
 * A derivative enclosure covers a differentiable branch (and clamp's bounded
 * one-sided slopes). Transfer discontinuities and unbounded root slopes throw;
 * the caller must fall back to a direct value enclosure for those cells.
 */
import {
  type IntervalV1,
  intervalV1,
  pointIntervalV1 as point,
  addIntervalsV1 as add,
  subtractIntervalsV1 as subtract,
  multiplyIntervalsV1 as multiply,
  scaleIntervalV1 as scale,
  dividePositiveIntervalV1 as divide,
  squareIntervalV1 as square,
  cubeIntervalV1 as cube,
  positivePowerIntervalV1 as power,
  cbrtIntervalV1 as cbrt,
  sinCosIntervalsV1,
} from './colorSystemGradientIntervalsV1';

export interface DualIntervalV1 {
  readonly value: IntervalV1;
  readonly derivative: IntervalV1;
}
export interface DualSrgbBoxV1 {
  r: DualIntervalV1;
  g: DualIntervalV1;
  b: DualIntervalV1;
}
export interface DualOklabBoxV1 {
  L: DualIntervalV1;
  a: DualIntervalV1;
  b: DualIntervalV1;
}

const ZERO: IntervalV1 = [0, 0];
const ONE: IntervalV1 = [1, 1];
const stationary = (a: DualIntervalV1) => a.derivative[0] === 0 && a.derivative[1] === 0;

/** The derivative's unit is chosen by the caller, usually normalized authored t. */
export function dualVariableV1(value: IntervalV1, derivative: IntervalV1 = ONE): DualIntervalV1 {
  return {
    value: intervalV1(value[0], value[1]),
    derivative: intervalV1(derivative[0], derivative[1]),
  };
}

export function dualConstantV1(value: IntervalV1): DualIntervalV1 {
  return dualVariableV1(value, ZERO);
}

export function addDualV1(a: DualIntervalV1, b: DualIntervalV1): DualIntervalV1 {
  return { value: add(a.value, b.value), derivative: add(a.derivative, b.derivative) };
}

export function subtractDualV1(a: DualIntervalV1, b: DualIntervalV1): DualIntervalV1 {
  return {
    value: subtract(a.value, b.value),
    derivative: subtract(a.derivative, b.derivative),
  };
}

export function multiplyDualV1(a: DualIntervalV1, b: DualIntervalV1): DualIntervalV1 {
  return {
    value: multiply(a.value, b.value),
    derivative: add(multiply(a.derivative, b.value), multiply(a.value, b.derivative)),
  };
}

export function scaleDualV1(a: DualIntervalV1, factor: number): DualIntervalV1 {
  return { value: scale(a.value, factor), derivative: scale(a.derivative, factor) };
}

export function dividePositiveDualV1(a: DualIntervalV1, b: DualIntervalV1): DualIntervalV1 {
  return {
    value: divide(a.value, b.value),
    derivative: divide(
      subtract(multiply(a.derivative, b.value), multiply(a.value, b.derivative)),
      square(b.value)
    ),
  };
}

export function squareDualV1(a: DualIntervalV1): DualIntervalV1 {
  return { value: square(a.value), derivative: multiply(scale(a.value, 2), a.derivative) };
}

export function cubeDualV1(a: DualIntervalV1): DualIntervalV1 {
  return {
    value: cube(a.value),
    derivative: multiply(scale(square(a.value), 3), a.derivative),
  };
}

export function positivePowerDualV1(
  a: DualIntervalV1,
  numerator: number,
  denominator: number
): DualIntervalV1 {
  const value = power(a.value, numerator, denominator);
  if (stationary(a)) return { value, derivative: ZERO };
  if (numerator === denominator) return { value, derivative: a.derivative };
  // p/q * x^(p/q - 1). Form p/q with outward division, not a rounded scalar.
  const factor =
    numerator > denominator
      ? power(a.value, numerator - denominator, denominator)
      : divide(ONE, power(a.value, denominator - numerator, denominator));
  return {
    value,
    derivative: multiply(divide(scale(factor, numerator), point(denominator)), a.derivative),
  };
}

export function sqrtDualV1(a: DualIntervalV1): DualIntervalV1 {
  return positivePowerDualV1(a, 1, 2);
}

export function cbrtDualV1(a: DualIntervalV1): DualIntervalV1 {
  const value = cbrt(a.value);
  if (stationary(a)) return { value, derivative: ZERO };
  // A box reaching zero has an unbounded scalar slope, including signed roots.
  return { value, derivative: divide(a.derivative, scale(square(value), 3)) };
}

export function sinCosDualV1(a: DualIntervalV1): { sin: DualIntervalV1; cos: DualIntervalV1 } {
  const { sin, cos } = sinCosIntervalsV1(a.value);
  return {
    sin: { value: sin, derivative: multiply(cos, a.derivative) },
    cos: { value: cos, derivative: scale(multiply(sin, a.derivative), -1) },
  };
}

/** Continuous [0,1] clipping. At a corner include both possible one-sided slopes. */
export function clampDualV1(a: DualIntervalV1): DualIntervalV1 {
  const checked = dualVariableV1(a.value, a.derivative);
  const value: IntervalV1 = [
    Math.max(0, Math.min(1, checked.value[0])),
    Math.max(0, Math.min(1, checked.value[1])),
  ];
  if (checked.value[1] < 0 || checked.value[0] > 1) return { value, derivative: ZERO };
  if (checked.value[0] > 0 && checked.value[1] < 1)
    return { value, derivative: checked.derivative };
  return {
    value,
    derivative: [Math.min(0, checked.derivative[0]), Math.max(0, checked.derivative[1])],
  };
}

const constant = (value: number) => dualConstantV1(point(value));

function srgbLinear(a: DualIntervalV1): DualIntervalV1 {
  if (a.value[1] <= 0.04045) return dividePositiveDualV1(a, constant(12.92));
  if (a.value[0] > 0.04045)
    return positivePowerDualV1(
      dividePositiveDualV1(addDualV1(a, constant(0.055)), constant(1.055)),
      12,
      5
    );
  throw new Error('sRGB decoding cell crosses a transfer discontinuity.');
}

function linearSrgb(a: DualIntervalV1): DualIntervalV1 {
  if (a.value[1] <= 0.0031308) return scaleDualV1(a, 12.92);
  if (a.value[0] > 0.0031308)
    return subtractDualV1(scaleDualV1(positivePowerDualV1(a, 5, 12), 1.055), constant(0.055));
  throw new Error('sRGB encoding cell crosses a transfer discontinuity.');
}

function weighted(
  values: readonly DualIntervalV1[],
  coefficients: readonly number[]
): DualIntervalV1 {
  return values.reduce(
    (total, value, i) => addDualV1(total, scaleDualV1(value, coefficients[i])),
    constant(0)
  );
}

/** Same normalized sRGB domain and binary64 matrix constants as the value-only helper. */
export function srgbToOklabDualV1(rgb: DualSrgbBoxV1): DualOklabBoxV1 {
  const values = [rgb.r, rgb.g, rgb.b].map(value => {
    const checked = dualVariableV1(value.value, value.derivative);
    if (checked.value[0] < 0 || checked.value[1] > 1)
      throw new Error('sRGB dual channels must remain in [0,1].');
    return srgbLinear(checked);
  });
  const roots = [
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
  ].map(row => cbrtDualV1(weighted(values, row)));
  return {
    L: weighted(roots, [0.2104542553, 0.793617785, -0.0040720468]),
    a: weighted(roots, [1.9779984951, -2.428592205, 0.4505937099]),
    b: weighted(roots, [0.0259040371, 0.7827717662, -0.808675766]),
  };
}

/** Raw, unclipped sRGB. Caller owns mapping branches and subsequent clipping. */
export function oklabToSrgbDualV1(lab: DualOklabBoxV1): DualSrgbBoxV1 {
  const values = [lab.L, lab.a, lab.b].map(value => {
    const checked = dualVariableV1(value.value, value.derivative);
    if (checked.value[0] < -1 || checked.value[1] > 2)
      throw new Error('OKLab dual cell exceeds the bounded color domain.');
    return checked;
  });
  const cubes = [
    [1, 0.3963377774, 0.2158037573],
    [1, -0.1055613458, -0.0638541728],
    [1, -0.0894841775, -1.291485548],
  ].map(row => cubeDualV1(weighted(values, row)));
  return {
    r: linearSrgb(weighted(cubes, [4.0767416621, -3.3077115913, 0.2309699292])),
    g: linearSrgb(weighted(cubes, [-1.2684380046, 2.6097574011, -0.3413193965])),
    b: linearSrgb(weighted(cubes, [-0.0041960863, -0.7034186147, 1.707614701])),
  };
}
