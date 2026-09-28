import { describe, expect, it } from 'vitest';
import {
  type IntervalV1 as Interval,
  intervalV1,
  pointIntervalV1,
  nextUpV1,
  nextDownV1,
  addIntervalsV1,
  subtractIntervalsV1,
  multiplyIntervalsV1,
  dividePositiveIntervalV1,
  squareIntervalV1,
  cubeIntervalV1,
  positivePowerIntervalV1,
  sqrtIntervalV1,
  cbrtIntervalV1,
} from '../colorSystemGradientIntervalsV1';

const SIGN = 1n << 63n;
const MASK = (1n << 64n) - 1n;
const POSITIVE_INFINITY = 0x7ff0000000000000n;
const NEGATIVE_INFINITY = POSITIVE_INFINITY | SIGN;
const view = new DataView(new ArrayBuffer(8));
function bits(value: number): bigint {
  view.setFloat64(0, value);
  return view.getBigUint64(0);
}
function number(raw: bigint): number {
  view.setBigUint64(0, raw);
  return view.getFloat64(0);
}

// Independent whole-word BigInt reference. The kernel under test instead uses
// separate Uint32 words, so carry/borrow defects cannot share this implementation.
function neighborBits(value: number, direction: 'up' | 'down'): bigint {
  const raw = bits(value);
  if (Number.isNaN(value)) throw new Error('No ordered NaN neighbor.');
  if (value === 0) return direction === 'up' ? 1n : SIGN | 1n;
  if (direction === 'up') {
    if (raw === POSITIVE_INFINITY) return raw;
    return value > 0 ? raw + 1n : raw - 1n;
  }
  if (raw === NEGATIVE_INFINITY) return raw;
  return value > 0 ? raw - 1n : raw + 1n;
}

type Rational = { n: bigint; d: bigint };
function rational(value: number): Rational {
  if (!Number.isFinite(value)) throw new Error('The exact oracle requires a finite input.');
  const raw = bits(value);
  const exponent = Number((raw >> 52n) & 2047n);
  const fraction = raw & ((1n << 52n) - 1n);
  const sign = raw & SIGN ? -1n : 1n;
  const mantissa = exponent ? fraction + (1n << 52n) : fraction;
  const shift = exponent ? exponent - 1023 - 52 : -1074;
  return shift >= 0
    ? { n: sign * (mantissa << BigInt(shift)), d: 1n }
    : { n: sign * mantissa, d: 1n << BigInt(-shift) };
}
const power = (a: Rational, exponent: number): Rational => ({
  n: a.n ** BigInt(exponent),
  d: a.d ** BigInt(exponent),
});
const lessOrEqual = (a: Rational, b: Rational) => a.n * b.d <= b.n * a.d;

function checkPowerResidual(input: Interval, p: number, q: number): void {
  const output = positivePowerIntervalV1(input, p, q);
  expect(output[0]).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(output[1])).toBe(true);
  expect(output[0]).toBeLessThanOrEqual(output[1]);
  // q is positive and the output is nonnegative, so these exact rational
  // inequalities establish coverage without a native root/power truth value.
  expect(lessOrEqual(power(rational(output[0]), q), power(rational(input[0]), p))).toBe(true);
  expect(lessOrEqual(power(rational(input[1]), p), power(rational(output[1]), q))).toBe(true);
  if (p === q) expect(output).toEqual(input);
}

describe('optimized gradient interval kernel', () => {
  it('matches whole-word neighbors at signed zero, carry/borrow and floating-point boundaries', () => {
    const magnitudes = [
      0n,
      1n,
      2n,
      0x00000000ffffffffn,
      0x0000000100000000n,
      0x000ffffffffffffen,
      0x000fffffffffffffn,
      0x0010000000000000n,
      0x0010000000000001n,
      0x3fefffffffffffffn,
      0x3ff0000000000000n,
      0x3ff00000ffffffffn,
      0x3ff0000100000000n,
      0x7feffffffffffffen,
      0x7fefffffffffffffn,
      POSITIVE_INFINITY,
    ];
    for (const magnitude of magnitudes) {
      for (const sign of [0n, SIGN]) {
        const value = number(magnitude | sign);
        expect(bits(nextUpV1(value))).toBe(neighborBits(value, 'up'));
        expect(bits(nextDownV1(value))).toBe(neighborBits(value, 'down'));
      }
    }
    // These assertions explicitly distinguish signed zero, which numeric equality loses.
    expect(bits(nextUpV1(-Number.MIN_VALUE))).toBe(SIGN);
    expect(bits(nextDownV1(Number.MIN_VALUE))).toBe(0n);
    expect(bits(nextUpV1(-0))).toBe(1n);
    expect(bits(nextDownV1(0))).toBe(SIGN | 1n);
  });

  it('matches whole-word neighbors for deterministic finite patterns of both signs', () => {
    let state = 0x5eeda17c93b2046fn;
    for (let index = 0; index < 512; index++) {
      state = (state * 6364136223846793005n + 1442695040888963407n) & MASK;
      let magnitude = state & (SIGN - 1n);
      // Keep the entire random mantissa while excluding the NaN/infinity exponent.
      if ((magnitude & POSITIVE_INFINITY) === POSITIVE_INFINITY) magnitude ^= 1n << 52n;
      for (const sign of [0n, SIGN]) {
        const value = number(magnitude | sign);
        expect(Number.isFinite(value)).toBe(true);
        const up = nextUpV1(value),
          down = nextDownV1(value);
        expect(bits(up)).toBe(neighborBits(value, 'up'));
        expect(bits(down)).toBe(neighborBits(value, 'down'));
        expect(up).toBeGreaterThan(value);
        expect(down).toBeLessThan(value);
        if (value !== 0) {
          expect(bits(nextDownV1(up))).toBe(bits(value));
          expect(bits(nextUpV1(down))).toBe(bits(value));
        }
      }
    }
  });

  it('rejects NaNs regardless of payload or sign', () => {
    for (const raw of [
      0x7ff0000000000001n,
      0x7ff8000000000000n,
      0x7fffffffffffffffn,
      0xfff0000000000001n,
      0xfff8000000000000n,
      0xffffffffffffffffn,
    ]) {
      expect(() => nextUpV1(number(raw))).toThrow(/NaN/);
      expect(() => nextDownV1(number(raw))).toThrow(/NaN/);
    }
  });

  it('certifies every supported p/q using exact rational residuals', () => {
    const inputs: Interval[] = [
      [0, 0],
      [1e-20, 1e-20],
      [0.0031308, 0.0031308],
      [0.04045, 0.04045],
      [0.5, 0.5],
      [1, 1],
      [1.25, 1.25],
      [2, 2],
      [64, 64],
      [0, 0.125],
      [0.0031308, 0.04045],
      [0.125, 0.5],
      [1, 64],
    ];
    for (let p = 1; p <= 12; p++)
      for (let q = 1; q <= 12; q++) for (const input of inputs) checkPowerResidual(input, p, q);
  });

  it('validates malformed intervals even when arithmetic would return an exact zero', () => {
    const invalid: unknown[] = [
      null,
      undefined,
      {},
      { 0: 0, 1: 1, length: 2 },
      new Float64Array([0, 1]),
      [],
      [0],
      [0, 1, 2],
      [NaN, 1],
      [0, NaN],
      [-Infinity, 1],
      [0, Infinity],
      [1, 0],
      ['0', 1],
    ];
    for (const input of invalid) {
      const value = input as Interval;
      expect(() => addIntervalsV1([0, 0], value)).toThrow();
      expect(() => addIntervalsV1(value, [0, 0])).toThrow();
      expect(() => multiplyIntervalsV1([0, 0], value)).toThrow();
      expect(() => multiplyIntervalsV1(value, [0, 0])).toThrow();
      expect(() => subtractIntervalsV1([0, 0], value)).toThrow();
      expect(() => dividePositiveIntervalV1([0, 0], value)).toThrow();
      expect(() => squareIntervalV1(value)).toThrow();
      expect(() => cubeIntervalV1(value)).toThrow();
      expect(() => positivePowerIntervalV1(value, 3, 3)).toThrow();
      expect(() => cbrtIntervalV1(value)).toThrow();
    }
    const source = Object.freeze([-0, 0] as const);
    const result = addIntervalsV1(source, [0, 0]);
    expect(bits(source[0])).toBe(SIGN);
    expect(bits(result[0])).toBe(0n);
    expect(bits(result[1])).toBe(0n);
  });

  it('retains numerical domain, residual underflow and overflow rejection', () => {
    for (const exponent of [0, -1, 13, 1.5, NaN, Infinity]) {
      expect(() => positivePowerIntervalV1([0.25, 0.5], exponent, 2)).toThrow();
      expect(() => positivePowerIntervalV1([0.25, 0.5], 2, exponent)).toThrow();
    }
    expect(() => intervalV1(1, 0)).toThrow();
    expect(() => pointIntervalV1(Infinity)).toThrow();
    expect(() => positivePowerIntervalV1([-Number.MIN_VALUE, 1], 1, 2)).toThrow();
    expect(() => positivePowerIntervalV1([0, 65], 1, 2)).toThrow();
    expect(() => positivePowerIntervalV1([1e-100, 1e-100], 12, 5)).toThrow(/underflows/);
    expect(() => sqrtIntervalV1([-Number.MIN_VALUE, 0])).toThrow();
    expect(() => cbrtIntervalV1([-65, 0])).toThrow();
    expect(() => cbrtIntervalV1([0, 65])).toThrow();
    expect(() => dividePositiveIntervalV1([0, 0], [0, 1])).toThrow();
    expect(() => dividePositiveIntervalV1([1, 1], [Number.MIN_VALUE, Number.MIN_VALUE])).toThrow();
    expect(() => multiplyIntervalsV1([Number.MAX_VALUE, Number.MAX_VALUE], [2, 2])).toThrow();
    expect(() =>
      addIntervalsV1([Number.MAX_VALUE, Number.MAX_VALUE], [Number.MAX_VALUE, Number.MAX_VALUE])
    ).toThrow();
  });
});
