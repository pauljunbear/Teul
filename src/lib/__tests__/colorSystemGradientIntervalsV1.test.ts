import { describe, expect, it, vi } from 'vitest';
import {
  type IntervalV1,
  intervalV1,
  pointIntervalV1,
  nextUpV1,
  nextDownV1,
  addIntervalsV1,
  subtractIntervalsV1,
  multiplyIntervalsV1,
  scaleIntervalV1,
  dividePositiveIntervalV1,
  squareIntervalV1,
  cubeIntervalV1,
  positivePowerIntervalV1,
  sqrtIntervalV1,
  cbrtIntervalV1,
  sinIntervalV1,
  cosIntervalV1,
  srgbToOklabIntervalsV1,
  oklabToSrgbIntervalsV1,
} from '../colorSystemGradientIntervalsV1';

const inside = (value: number, interval: IntervalV1) => {
  expect(value).toBeGreaterThanOrEqual(interval[0]);
  expect(value).toBeLessThanOrEqual(interval[1]);
};
type Rational = { n: bigint; d: bigint };
// Exact binary64-to-rational oracle, independent of production rounding helpers.
function rational(value: number): Rational {
  const data = new DataView(new ArrayBuffer(8));
  data.setFloat64(0, value);
  const raw = data.getBigUint64(0);
  const exponent = Number((raw >> 52n) & 2047n);
  const fraction = raw & ((1n << 52n) - 1n);
  const sign = raw >> 63n ? -1n : 1n;
  const mantissa = exponent ? fraction + (1n << 52n) : fraction;
  const shift = exponent ? exponent - 1023 - 52 : -1074;
  return shift >= 0
    ? { n: sign * (mantissa << BigInt(shift)), d: 1n }
    : { n: sign * mantissa, d: 1n << BigInt(-shift) };
}
const plus = (a: Rational, b: Rational): Rational => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const times = (a: Rational, b: Rational): Rational => ({ n: a.n * b.n, d: a.d * b.d });
const power = (a: Rational, p: number): Rational => ({ n: a.n ** BigInt(p), d: a.d ** BigInt(p) });
const le = (a: Rational, b: Rational) => a.n * b.d <= b.n * a.d;
function containsExact(result: IntervalV1, expected: Rational) {
  expect(le(rational(result[0]), expected)).toBe(true);
  expect(le(expected, rational(result[1]))).toBe(true);
}

// Direct scalar reference using native Math is a regression oracle, not proof.
function lab(rgb: readonly number[]) {
  const x = rgb.map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const roots = [
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
  ].map(row => Math.cbrt(row.reduce((sum, value, i) => sum + value * x[i], 0)));
  return [
    [0.2104542553, 0.793617785, -0.0040720468],
    [1.9779984951, -2.428592205, 0.4505937099],
    [0.0259040371, 0.7827717662, -0.808675766],
  ].map(row => row.reduce((sum, value, i) => sum + value * roots[i], 0));
}
function rgb(value: readonly number[]) {
  const cubes = [
    [1, 0.3963377774, 0.2158037573],
    [1, -0.1055613458, -0.0638541728],
    [1, -0.0894841775, -1.291485548],
  ].map(row => row.reduce((sum, coefficient, i) => sum + coefficient * value[i], 0) ** 3);
  return [
    [4.0767416621, -3.3077115913, 0.2309699292],
    [-1.2684380046, 2.6097574011, -0.3413193965],
    [-0.0041960863, -0.7034186147, 1.707614701],
  ].map(row => {
    const x = row.reduce((sum, coefficient, i) => sum + coefficient * cubes[i], 0);
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  });
}

describe('bounded gradient interval arithmetic', () => {
  it('steps across signed zero, subnormals and finite neighbors', () => {
    expect(nextUpV1(0)).toBe(Number.MIN_VALUE);
    expect(nextUpV1(-0)).toBe(Number.MIN_VALUE);
    expect(nextDownV1(0)).toBe(-Number.MIN_VALUE);
    expect(nextDownV1(Number.MIN_VALUE)).toBe(0);
    expect(nextUpV1(-Number.MIN_VALUE)).toBe(-0);
    for (const x of [-10, -0.1, 0.1, 1, 10]) {
      expect(nextDownV1(nextUpV1(x))).toBe(x);
      expect(nextUpV1(x)).toBeGreaterThan(x);
      expect(nextDownV1(x)).toBeLessThan(x);
    }
    expect(nextUpV1(Number.MAX_VALUE)).toBe(Infinity);
    expect(nextDownV1(Infinity)).toBe(Number.MAX_VALUE);
    expect(() => nextUpV1(NaN)).toThrow();
  });

  it('encloses exact rational point arithmetic, including cancellation and underflow', () => {
    const numbers = [-1, -0.9, -0.1, -Number.MIN_VALUE, 0, Number.MIN_VALUE, 0.1, 0.3, 1];
    for (const x of numbers)
      for (const y of numbers) {
        containsExact(addIntervalsV1([x, x], [y, y]), plus(rational(x), rational(y)));
        containsExact(subtractIntervalsV1([x, x], [y, y]), plus(rational(x), rational(-y)));
        containsExact(multiplyIntervalsV1([x, x], [y, y]), times(rational(x), rational(y)));
        if (y > 0.01) {
          const a = rational(x),
            b = rational(y);
          containsExact(dividePositiveIntervalV1([x, x], [y, y]), { n: a.n * b.d, d: a.d * b.n });
        }
      }
  });

  it('handles signs, squares, cubes and exact zero without a negative square-root input', () => {
    const square = squareIntervalV1([-0.2, 0.4]);
    expect(square[0]).toBe(0);
    inside(0.16, square);
    const cube = cubeIntervalV1([-0.2, 0.4]);
    containsExact(cube, power(rational(-0.2), 3));
    containsExact(cube, power(rational(0.4), 3));
    const sum = addIntervalsV1(squareIntervalV1([0, 0]), squareIntervalV1([0, 0]));
    expect(sum).toEqual([0, 0]);
    expect(sqrtIntervalV1(sum)).toEqual([0, 0]);
    const tiny = addIntervalsV1(squareIntervalV1([-1e-170, 1e-170]), [0, 0]);
    expect(tiny[0]).toBe(0);
    expect(scaleIntervalV1([2, 3], -2)).toEqual(multiplyIntervalsV1([2, 3], [-2, -2]));
  });

  it('preserves scalar-product enclosures across signed zero, underflow and both interval signs', () => {
    const values = [-2, -0.1, -Number.MIN_VALUE, -0, 0, Number.MIN_VALUE, 0.1, 2];
    for (const low of values)
      for (const high of values) {
        if (low > high) continue;
        for (const factor of values) {
          const actual = scaleIntervalV1([low, high], factor);
          expect(actual).toEqual(multiplyIntervalsV1([low, high], pointIntervalV1(factor)));
          containsExact(actual, times(rational(low), rational(factor)));
          containsExact(actual, times(rational(high), rational(factor)));
        }
      }
    for (const factor of [NaN, Infinity, -Infinity])
      expect(() => scaleIntervalV1([0, 1], factor)).toThrow();
    expect(() => scaleIntervalV1([Number.MAX_VALUE, Number.MAX_VALUE], 2)).toThrow();
    expect(() => scaleIntervalV1([2, 1], 0)).toThrow();
  });

  it('certifies rational powers with exact algebraic residuals', () => {
    for (const x of [1e-20, 0.0001, 0.0031308, 0.09, 0.5, 1, 2, 64]) {
      for (const [p, q] of [
        [1, 2],
        [1, 3],
        [5, 12],
        [12, 5],
      ]) {
        const result = positivePowerIntervalV1([x, x], p, q);
        const target = power(rational(x), p);
        expect(le(power(rational(result[0]), q), target)).toBe(true);
        expect(le(target, power(rational(result[1]), q))).toBe(true);
        expect(result[1] - result[0]).toBeLessThan(Math.max(1e-30, result[1] * 1e-12));
      }
    }
    const signed = cbrtIntervalV1([-8, 0.125]);
    inside(-2, signed);
    inside(0.5, signed);
    inside(Math.sqrt(0.6), sqrtIntervalV1([0.2, 0.6]));
  });

  it('rejects unsupported numbers or uncertifiable Math seeds', () => {
    expect(() => intervalV1(1, 0)).toThrow();
    expect(() => pointIntervalV1(Infinity)).toThrow();
    expect(() => dividePositiveIntervalV1([1, 2], [0, 1])).toThrow();
    expect(() => sqrtIntervalV1([-Number.MIN_VALUE, 1])).toThrow();
    expect(() => positivePowerIntervalV1([0, 65], 1, 2)).toThrow();
    expect(() => positivePowerIntervalV1([0.1, 1], 13, 2)).toThrow();
    expect(() => positivePowerIntervalV1([1e-100, 1e-100], 12, 5)).toThrow(/underflows/);
    expect(() => multiplyIntervalsV1([Number.MAX_VALUE, Number.MAX_VALUE], [2, 2])).toThrow();
    const seed = vi.spyOn(Math, 'pow').mockReturnValue(42);
    try {
      expect(() => positivePowerIntervalV1([0.1, 0.1], 5, 12)).toThrow(/widening budget/);
    } finally {
      seed.mockRestore();
    }
  });

  it('covers trig extrema, wrapping, broad ranges and narrow neutral intervals', () => {
    for (const center of [
      -8 * Math.PI,
      -2 * Math.PI,
      -Math.PI,
      -Math.PI / 2,
      0,
      1e-12,
      Math.PI / 2,
      Math.PI,
      2 * Math.PI,
      8 * Math.PI,
    ]) {
      for (const width of [0, 1e-12, 0.04, 0.7]) {
        const input: IntervalV1 = [center - width, center + width];
        const sin = sinIntervalV1(input),
          cos = cosIntervalV1(input);
        for (let i = 0; i <= 16; i++) {
          const x = input[0] + ((input[1] - input[0]) * i) / 16;
          inside(Math.sin(x), sin);
          inside(Math.cos(x), cos);
        }
      }
    }
    expect(sinIntervalV1([0, 2 * Math.PI])).toEqual([-1, 1]);
    expect(() => cosIntervalV1([100, 100])).toThrow(/bounded gradient hue/);
    expect(sinIntervalV1([0, 0])).toEqual([0, 0]);
    expect(cosIntervalV1([0, 0])).toEqual([1, 1]);
  });

  it('encloses forward RGB transforms near transfer thresholds, black and saturated colors', () => {
    const inputs = [0, 1e-12, 0.04045 - 1e-10, 0.04045, 0.04045 + 1e-10, 0.1, 0.5, 1];
    for (const r of inputs)
      for (const g of inputs) {
        const b = 1 - g;
        const actual = srgbToOklabIntervalsV1({ r: [r, r], g: [g, g], b: [b, b] });
        const expected = lab([r, g, b]);
        [actual.L, actual.a, actual.b].forEach((bound, i) => inside(expected[i], bound));
      }
    const black = srgbToOklabIntervalsV1({ r: [0, 0], g: [0, 0], b: [0, 0] });
    expect(black).toEqual({ L: [0, 0], a: [0, 0], b: [0, 0] });
    const box = srgbToOklabIntervalsV1({ r: [0.04044, 0.04046], g: [0.2, 0.21], b: [0.6, 0.61] });
    for (let i = 0; i <= 10; i++) {
      const expected = lab([0.04044 + 0.000002 * i, 0.21 - 0.001 * i, 0.6 + 0.001 * i]);
      [box.L, box.a, box.b].forEach((bound, j) => inside(expected[j], bound));
    }
    expect(() => srgbToOklabIntervalsV1({ r: [-0.1, 0], g: [0, 0], b: [0, 0] })).toThrow();
  });

  it('encloses raw inverse transforms, including out-of-gamut and transfer-crossing boxes', () => {
    for (const L of [0, 0.1, 0.146, 0.5, 1])
      for (const a of [-0.25, 0, 0.25]) {
        const b = a / 2;
        const actual = oklabToSrgbIntervalsV1({ L: [L, L], a: [a, a], b: [b, b] });
        const expected = rgb([L, a, b]);
        [actual.r, actual.g, actual.b].forEach((bound, i) => inside(expected[i], bound));
      }
    const box = oklabToSrgbIntervalsV1({ L: [0.14, 0.15], a: [-0.001, 0.001], b: [-0.001, 0.001] });
    for (let i = 0; i <= 10; i++) {
      const expected = rgb([0.14 + 0.001 * i, -0.001 + 0.0002 * i, 0.001 - 0.0002 * i]);
      [box.r, box.g, box.b].forEach((bound, j) => inside(expected[j], bound));
    }
    const red = oklabToSrgbIntervalsV1({ L: [0.5, 0.5], a: [0.4, 0.4], b: [0.2, 0.2] });
    expect(red.g[1]).toBeLessThan(0);
  });
});
