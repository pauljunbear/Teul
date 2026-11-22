import { describe, expect, it } from 'vitest';
import {
  type DualIntervalV1,
  dualConstantV1,
  dualVariableV1,
  addDualV1,
  subtractDualV1,
  multiplyDualV1,
  scaleDualV1,
  dividePositiveDualV1,
  squareDualV1,
  cubeDualV1,
  positivePowerDualV1,
  sqrtDualV1,
  cbrtDualV1,
  sinCosDualV1,
  clampDualV1,
  srgbToOklabDualV1,
  oklabToSrgbDualV1,
} from '../colorSystemGradientDualIntervalsV1';

const constant = (n: number) => dualConstantV1([n, n]);
const within = (actual: number, bounds: readonly [number, number]) => {
  expect(actual).toBeGreaterThanOrEqual(bounds[0]);
  expect(actual).toBeLessThanOrEqual(bounds[1]);
};
const checked = (dual: DualIntervalV1, value: number, derivative: number) => {
  within(value, dual.value);
  within(derivative, dual.derivative);
};
const dot = (row: number[], vector: number[]) => row.reduce((sum, a, i) => sum + a * vector[i], 0);

// Independent analytic chain-rule oracles using scalar native Math. These are
// regression checks; continuous enclosure follows from the interval formulas.
function forward(values: number[], slopes: number[]) {
  const linear = values.map(x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  const derivatives = values.map(
    (x, i) => slopes[i] * (x <= 0.04045 ? 1 / 12.92 : (2.4 / 1.055) * ((x + 0.055) / 1.055) ** 1.4)
  );
  const matrix = [
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
  ];
  const roots = matrix.map(row => Math.cbrt(dot(row, linear)));
  const rootSlopes = matrix.map((row, i) => dot(row, derivatives) / (3 * roots[i] ** 2));
  const output = [
    [0.2104542553, 0.793617785, -0.0040720468],
    [1.9779984951, -2.428592205, 0.4505937099],
    [0.0259040371, 0.7827717662, -0.808675766],
  ];
  return {
    value: output.map(row => dot(row, roots)),
    derivative: output.map(row => dot(row, rootSlopes)),
  };
}
function inverse(values: number[], slopes: number[]) {
  const matrix = [
    [1, 0.3963377774, 0.2158037573],
    [1, -0.1055613458, -0.0638541728],
    [1, -0.0894841775, -1.291485548],
  ];
  const valuesPrime = matrix.map(row => dot(row, values));
  const cubes = valuesPrime.map(v => v ** 3);
  const cubeSlopes = matrix.map((row, i) => 3 * valuesPrime[i] ** 2 * dot(row, slopes));
  const output = [
    [4.0767416621, -3.3077115913, 0.2309699292],
    [-1.2684380046, 2.6097574011, -0.3413193965],
    [-0.0041960863, -0.7034186147, 1.707614701],
  ];
  return {
    value: output.map(row => {
      const x = dot(row, cubes);
      return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    }),
    derivative: output.map(row => {
      const x = dot(row, cubes);
      return dot(row, cubeSlopes) * (x <= 0.0031308 ? 12.92 : (1.055 / 2.4) * x ** (-7 / 12));
    }),
  };
}

describe('experimental gradient dual intervals', () => {
  it('propagates polynomial and quotient derivatives over one shared parameter', () => {
    const t = dualVariableV1([-0.3, 0.6]);
    const numerator = addDualV1(
      addDualV1(scaleDualV1(squareDualV1(t), 2), scaleDualV1(t, 3)),
      constant(1)
    );
    const divided = dividePositiveDualV1(numerator, addDualV1(t, constant(2)));
    const cubed = cubeDualV1(t);
    const difference = subtractDualV1(numerator, squareDualV1(t));
    for (let i = 0; i <= 30; i++) {
      const x = -0.3 + i * 0.03;
      checked(cubed, x ** 3, 3 * x ** 2);
      checked(difference, x * x + 3 * x + 1, 2 * x + 3);
      const a = 2 * x * x + 3 * x + 1;
      checked(divided, a / (x + 2), ((4 * x + 3) * (x + 2) - a) / (x + 2) ** 2);
    }
    expect(dualConstantV1([0.2, 0.3]).derivative).toEqual([0, 0]);
  });

  it('encloses rational, signed-root and trig derivatives without finite-difference assumptions', () => {
    const t = dualVariableV1([0.2, 0.25], [0.5, 0.5]);
    const root = sqrtDualV1(t),
      cubic = cbrtDualV1(t),
      powered = positivePowerDualV1(t, 12, 5);
    const { sin, cos } = sinCosDualV1(t);
    const mixed = multiplyDualV1(cubeDualV1(t), sin);
    for (let i = 0; i <= 10; i++) {
      const x = 0.2 + i * 0.005;
      checked(root, Math.sqrt(x), 0.25 / Math.sqrt(x));
      checked(cubic, Math.cbrt(x), 0.5 / (3 * Math.cbrt(x) ** 2));
      checked(powered, x ** 2.4, 1.2 * x ** 1.4);
      checked(sin, Math.sin(x), 0.5 * Math.cos(x));
      checked(cos, Math.cos(x), -0.5 * Math.sin(x));
      checked(mixed, x ** 3 * Math.sin(x), 0.5 * (3 * x ** 2 * Math.sin(x) + x ** 3 * Math.cos(x)));
    }
    checked(cbrtDualV1(dualVariableV1([-8, -8], [3, 3])), -2, 0.25);
    expect(positivePowerDualV1(t, 3, 3).derivative).toEqual(t.derivative);
  });

  it('encloses clamp corner slopes and preserves exact stationary colors', () => {
    expect(clampDualV1(dualVariableV1([-2, -1], [-3, 4]))).toEqual({
      value: [0, 0],
      derivative: [0, 0],
    });
    expect(clampDualV1(dualVariableV1([2, 3], [-3, 4]))).toEqual({
      value: [1, 1],
      derivative: [0, 0],
    });
    expect(clampDualV1(dualVariableV1([-0.1, 0.2], [2, 3]))).toEqual({
      value: [0, 0.2],
      derivative: [0, 3],
    });
    expect(clampDualV1(dualVariableV1([0.8, 1.2], [-3, -2]))).toEqual({
      value: [0.8, 1],
      derivative: [-3, 0],
    });
    expect(clampDualV1(dualVariableV1([0.2, 0.8], [-2, 3])).derivative).toEqual([-2, 3]);
    expect(sqrtDualV1(constant(0))).toEqual({ value: [0, 0], derivative: [0, 0] });
    const black = srgbToOklabDualV1({ r: constant(0), g: constant(0), b: constant(0) });
    expect(black).toEqual({ L: constant(0), a: constant(0), b: constant(0) });
  });

  it('throws on unsupported derivative cells so a value-only enclosure can take over', () => {
    expect(() => sqrtDualV1(dualVariableV1([0, 0.1]))).toThrow(/positive/);
    expect(() => cbrtDualV1(dualVariableV1([-0.1, 0.1]))).toThrow(/positive/);
    expect(() => dividePositiveDualV1(constant(1), dualVariableV1([0, 1]))).toThrow();
    expect(() =>
      srgbToOklabDualV1({ r: dualVariableV1([0.04, 0.041]), g: constant(0.4), b: constant(0.6) })
    ).toThrow(/decoding.*discontinuity/);
    expect(() =>
      oklabToSrgbDualV1({ L: dualVariableV1([0.14, 0.15]), a: constant(0), b: constant(0) })
    ).toThrow(/encoding.*discontinuity/);
    expect(() =>
      srgbToOklabDualV1({ r: dualVariableV1([0, 0.01]), g: constant(0), b: constant(0) })
    ).toThrow(/positive/);
    expect(() => dualVariableV1([0, 1], [NaN, 1])).toThrow();
    expect(() => oklabToSrgbDualV1({ L: constant(3), a: constant(0), b: constant(0) })).toThrow(
      /bounded color/
    );
  });

  it('matches independent forward analytic derivatives across supported color branches', () => {
    for (const base of [
      [0.02, 0.025, 0.03],
      [0.2, 0.5, 0.7],
      [0.8, 0.2, 0.4],
    ]) {
      const slopes = [0.02, -0.01, 0.015];
      const channels = base.map((v, i) =>
        dualVariableV1(
          [v - Math.abs(slopes[i]) * 0.1, v + Math.abs(slopes[i]) * 0.1],
          [slopes[i], slopes[i]]
        )
      );
      const actual = srgbToOklabDualV1({ r: channels[0], g: channels[1], b: channels[2] });
      const outputs = [actual.L, actual.a, actual.b];
      for (let i = 0; i <= 10; i++) {
        const t = -0.1 + i * 0.02,
          values = base.map((v, j) => v + slopes[j] * t);
        const expected = forward(values, slopes);
        outputs.forEach((v, j) => checked(v, expected.value[j], expected.derivative[j]));
      }
      // Central differences only catch implementation regressions. Their error
      // tolerance is not used by the mathematical enclosure or its caller.
      const h = 1e-6;
      const left = forward(
        base.map((v, i) => v - slopes[i] * h),
        slopes
      ).value;
      const right = forward(
        base.map((v, i) => v + slopes[i] * h),
        slopes
      ).value;
      outputs.forEach((v, i) => {
        const finiteDifference = (right[i] - left[i]) / (2 * h);
        within(finiteDifference, [v.derivative[0] - 1e-8, v.derivative[1] + 1e-8]);
      });
    }
  });

  it('matches independent inverse analytic derivatives including unclipped negative channels', () => {
    for (const base of [
      [0.1, 0, 0],
      [0.5, 0.03, -0.02],
      [0.6, 0.4, 0.2],
    ]) {
      const slopes = [0.03, -0.01, 0.02];
      const channels = base.map((v, i) =>
        dualVariableV1(
          [v - Math.abs(slopes[i]) * 0.01, v + Math.abs(slopes[i]) * 0.01],
          [slopes[i], slopes[i]]
        )
      );
      const actual = oklabToSrgbDualV1({ L: channels[0], a: channels[1], b: channels[2] });
      const outputs = [actual.r, actual.g, actual.b];
      for (let i = 0; i <= 10; i++) {
        const t = -0.01 + i * 0.002,
          values = base.map((v, j) => v + slopes[j] * t);
        const expected = inverse(values, slopes);
        outputs.forEach((v, j) => checked(v, expected.value[j], expected.derivative[j]));
      }
      const h = 1e-6;
      const left = inverse(
        base.map((v, i) => v - slopes[i] * h),
        slopes
      ).value;
      const right = inverse(
        base.map((v, i) => v + slopes[i] * h),
        slopes
      ).value;
      outputs.forEach((v, i) =>
        within((right[i] - left[i]) / (2 * h), [v.derivative[0] - 1e-8, v.derivative[1] + 1e-8])
      );
    }
  });
});
