import { describe, expect, it, vi } from 'vitest';
import type { GradientStopV1 } from '../colorSystemGradientV1';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import { rgbToOklab } from '../utils';
import type { IntervalV1 as Interval } from '../colorSystemGradientIntervalsV1';
import {
  PI_INTERVAL_V2,
  atanIntervalV2,
  atan2IntervalV2,
  referenceHueDeltaV2,
  sourceLabV2,
  createGradientReferenceRouteV2,
} from '../colorSystemGradientReferenceRouteV2';

type Exact = { n: bigint; d: bigint };
type FixedBounds = readonly [bigint, bigint];
const SCALE = 10n ** 90n;
const exact = (value: number): Exact => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 2047n);
  const fraction = bits & ((1n << 52n) - 1n);
  const sign = bits >> 63n ? -1n : 1n;
  const mantissa = exponent ? fraction + (1n << 52n) : fraction;
  const shift = exponent ? exponent - 1023 - 52 : -1074;
  return shift >= 0
    ? { n: sign * (mantissa << BigInt(shift)), d: 1n }
    : { n: sign * mantissa, d: 1n << BigInt(-shift) };
};
const lessOrEqual = (a: Exact, b: Exact) => a.n * b.d <= b.n * a.d;
const containsFixed = (actual: Interval, expected: FixedBounds, denominator = 1n) => {
  expect(lessOrEqual(exact(actual[0]), { n: expected[0], d: SCALE * denominator })).toBe(true);
  expect(lessOrEqual({ n: expected[1], d: SCALE * denominator }, exact(actual[1]))).toBe(true);
};
const scaled = (bounds: FixedBounds, factor: bigint): FixedBounds =>
  factor >= 0 ? [bounds[0] * factor, bounds[1] * factor] : [bounds[1] * factor, bounds[0] * factor];
const minus = (a: FixedBounds, b: FixedBounds): FixedBounds => [a[0] - b[1], a[1] - b[0]];

// Independent fixed-point oracle: integer division rounds each Taylor term
// outward. The first omitted term bounds the alternating-series remainder.
// No production interval helper or native transcendental supplies this oracle.
function atanReciprocal(q: bigint): FixedBounds {
  let low = 0n,
    high = 0n,
    power = q;
  for (let index = 0; index < 200; index++) {
    const denominator = power * BigInt(2 * index + 1);
    const floor = SCALE / denominator;
    const ceil = floor + (SCALE % denominator === 0n ? 0n : 1n);
    if (index % 2) {
      low -= ceil;
      high -= floor;
    } else {
      low += floor;
      high += ceil;
    }
    power *= q * q;
  }
  const nextDenominator = power * 401n;
  // 200 terms end on a negative term, so the remaining alternating tail is positive.
  high += (SCALE + nextDenominator - 1n) / nextDenominator;
  return [low, high];
}
// Machin's identity: pi = 16 atan(1/5) - 4 atan(1/239).
const PI_ORACLE = minus(scaled(atanReciprocal(5n), 16n), scaled(atanReciprocal(239n), 4n));
const within = (value: number, range: Interval) => {
  expect(value).toBeGreaterThanOrEqual(range[0]);
  expect(value).toBeLessThanOrEqual(range[1]);
};
const stop = (r: number, g: number, b: number): GradientStopV1 => ({
  position: 0,
  value: buildColorSystemSrgbValueV1({ r, g, b }),
  sourceColorId: 'source',
  locked: true,
});
const nativeLab = (value: GradientStopV1) => {
  const { r, g, b } = value.value.components;
  return rgbToOklab(r * 255, g * 255, b * 255);
};
const keys = ['L', 'a', 'b'] as const;

describe('experimental real-arithmetic gradient reference route', () => {
  it('encloses independent Machin and alternating-series angle bounds', () => {
    containsFixed(PI_INTERVAL_V2, PI_ORACLE);
    expect(atanIntervalV2([0, 0])).toEqual([0, 0]);
    containsFixed(atanIntervalV2([1, 1]), PI_ORACLE, 4n);
    containsFixed(atanIntervalV2([-1, -1]), scaled(PI_ORACLE, -1n), 4n);
    for (const q of [2n, 4n, 8n]) {
      const x = 1 / Number(q); // These reciprocals have exact binary64 representations.
      containsFixed(atanIntervalV2([x, x]), atanReciprocal(q));
      containsFixed(atanIntervalV2([-x, -x]), scaled(atanReciprocal(q), -1n));
      containsFixed(
        atanIntervalV2([Number(q), Number(q)]),
        minus(PI_ORACLE, scaled(atanReciprocal(q), 2n)),
        2n
      );
    }
    const interval = atanIntervalV2([-2, 0.5]);
    containsFixed(interval, scaled(minus(PI_ORACLE, scaled(atanReciprocal(2n), 2n)), -1n), 2n);
    containsFixed(interval, atanReciprocal(2n));
    expect(atanIntervalV2([1, 1])[1] - atanIntervalV2([1, 1])[0]).toBeLessThan(1e-11);
  });

  it('handles axes and quadrants with continuous unwrapping across negative x', () => {
    const cases = [
      [0, 1, 0],
      [1, 0, 2],
      [0, -1, 4],
      [-1, 0, -2],
      [1, 1, 1],
      [1, -1, 3],
      [-1, -1, 5],
      [-1, 1, -1],
    ];
    for (const [y, x, quarters] of cases)
      containsFixed(atan2IntervalV2([y, y], [x, x]), scaled(PI_ORACLE, BigInt(quarters)), 4n);
    const wrapped = atan2IntervalV2([-0.125, 0.125], [-1, -1]);
    containsFixed(wrapped, minus(PI_ORACLE, atanReciprocal(8n)));
    containsFixed(wrapped, minus(PI_ORACLE, scaled(atanReciprocal(8n), -1n)));
    expect(wrapped[0]).toBeGreaterThan(3);
    expect(wrapped[1]).toBeLessThan(3.3);
    // Cross the other axis while keeping a positive, well-separated denominator.
    const top = atan2IntervalV2([1, 1], [-0.5, 0.5]);
    containsFixed(top, minus(PI_ORACLE, scaled(atanReciprocal(2n), 2n)), 2n);
    containsFixed(top, minus(PI_ORACLE, scaled(atanReciprocal(2n), -2n)), 2n);
    containsFixed(
      atan2IntervalV2([-2, -2], [-1, -1]),
      minus(scaled(PI_ORACLE, -1n), scaled(atanReciprocal(2n), 2n)),
      2n
    );
    containsFixed(
      atan2IntervalV2([-2, -2], [1, 1]),
      minus(scaled(PI_ORACLE, -1n), scaled(atanReciprocal(2n), -2n)),
      2n
    );
  });

  it('rejects invalid angle domains and unresolved origin, half-turn and deadband choices', () => {
    expect(() => atanIntervalV2([1, 0])).toThrow();
    expect(() => atanIntervalV2([0, Infinity])).toThrow();
    for (const [y, x] of [
      [
        [0, 0],
        [0, 0],
      ],
      [
        [-1, 1],
        [-1, 1],
      ],
      [
        [0, 1],
        [-1, 0],
      ],
    ] as const)
      expect(() => atan2IntervalV2(y, x)).toThrow(/origin/);
    expect(() => referenceHueDeltaV2([0, 0], PI_INTERVAL_V2, false)).toThrow(/half-turn/);
    expect(() =>
      referenceHueDeltaV2([0, 0], [-PI_INTERVAL_V2[1], -PI_INTERVAL_V2[0]], true)
    ).toThrow(/half-turn/);
    const epsilon = (Math.PI * 1e-9) / 180;
    expect(() => referenceHueDeltaV2([0, 0], [epsilon / 2, epsilon * 2], true)).toThrow(/deadband/);
    expect(referenceHueDeltaV2([0, 0], [0, 0], true)).toEqual([0, 0]);
    const shorter = referenceHueDeltaV2([2.9, 3], [-3, -2.9], false);
    const longer = referenceHueDeltaV2([2.9, 3], [-3, -2.9], true);
    expect(shorter[0]).toBeGreaterThan(0);
    expect(shorter[1]).toBeLessThan(0.5);
    expect(longer[0]).toBeGreaterThan(-6.1);
    expect(longer[1]).toBeLessThan(-5.7);
  });

  it('constructs angles and routes without native atan or atan2', () => {
    const a = stop(0.8, 0.1, 0.2),
      b = stop(0.1, 0.1, 0.8);
    const atan = vi.spyOn(Math, 'atan').mockImplementation(() => {
      throw new Error('native atan');
    });
    const atan2 = vi.spyOn(Math, 'atan2').mockImplementation(() => {
      throw new Error('native atan2');
    });
    try {
      containsFixed(atanIntervalV2([1, 1]), PI_ORACLE, 4n);
      containsFixed(atan2IntervalV2([1, 1], [-1, -1]), scaled(PI_ORACLE, 3n), 4n);
      const route = createGradientReferenceRouteV2(a, b, {
        route: { space: 'oklch', huePath: 'longer' },
      });
      expect(route.cell([0.2, 0.3]).chroma[0]).toBeGreaterThan(0);
      expect(route.dual([0.2, 0.3]).L.derivative.every(Number.isFinite)).toBe(true);
    } finally {
      atan.mockRestore();
      atan2.mockRestore();
    }
  });

  it('uses full native source channels, preserves input data, and encloses source endpoints', () => {
    const a = stop(0.1234567890123, 0.3456789012345, 0.5678901234567);
    const b = stop(0.1234577890123, 0.3456789012345, 0.5678901234567);
    expect(a.value.hex).toBe(b.value.hex);
    const before = JSON.stringify([a, b]);
    const left = sourceLabV2(a),
      right = sourceLabV2(b);
    expect(left.L[1]).toBeLessThan(right.L[0]);
    const route = createGradientReferenceRouteV2(a, b, { route: { space: 'oklab' } });
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const cell = route.cell([t, t]);
      const first = nativeLab(a),
        last = nativeLab(b);
      // Native transforms are regression samples; the rational interval formulas supply the enclosure.
      for (const key of keys) within(first[key] + (last[key] - first[key]) * t, cell.lab[key]);
    }
    expect(JSON.stringify([a, b])).toBe(before);
  });

  it('borrows neutral hue, retains exact stationary black, and avoids a longer turn for identical sources', () => {
    const black = stop(0, 0, 0),
      color = stop(0.3, 0.5, 0.6);
    for (const [a, b] of [
      [black, color],
      [color, black],
    ]) {
      const shorter = createGradientReferenceRouteV2(a, b, {
        route: { space: 'oklch', huePath: 'shorter' },
      });
      const longer = createGradientReferenceRouteV2(a, b, {
        route: { space: 'oklch', huePath: 'longer' },
      });
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const range = shorter.cell([t, t]);
        expect(longer.cell([t, t])).toEqual(range);
        const left = nativeLab(a),
          right = nativeLab(b);
        for (const key of keys) within(left[key] + (right[key] - left[key]) * t, range.lab[key]);
      }
    }
    const stationary = createGradientReferenceRouteV2(black, black, {
      route: { space: 'oklch', huePath: 'longer' },
    });
    expect(stationary.cell([0, 1])).toEqual({
      lab: { L: [0, 0], a: [0, 0], b: [0, 0] },
      chroma: [0, 0],
    });
    for (const key of keys) expect(stationary.dual([0, 1])[key].derivative).toEqual([0, 0]);
    const sameShort = createGradientReferenceRouteV2(color, color, {
      route: { space: 'oklch', huePath: 'shorter' },
    });
    const sameLong = createGradientReferenceRouteV2(color, color, {
      route: { space: 'oklch', huePath: 'longer' },
    });
    expect(sameLong.cell([0.1, 0.9])).toEqual(sameShort.cell([0.1, 0.9]));
  });

  it('fails closed when source chroma straddles the neutral classification threshold', () => {
    // The native transform locates a fixture only; the tested reference decides whether its
    // certified source enclosure straddles the threshold and must reject that decision.
    let low = 0.4,
      high = 0.4001;
    for (let index = 0; index < 50; index++) {
      const middle = low + (high - low) / 2;
      const lab = rgbToOklab(middle * 255, 0.4 * 255, 0.4 * 255);
      if (Math.hypot(lab.a, lab.b) < 1e-6) low = middle;
      else high = middle;
    }
    expect(() =>
      createGradientReferenceRouteV2(stop(low, 0.4, 0.4), stop(0.2, 0.5, 0.7), {
        route: { space: 'oklch', huePath: 'shorter' },
      })
    ).toThrow(/neutral threshold/);
  });

  it('encloses analytic route derivatives for shorter, longer and OKLab interpolation', () => {
    const a = stop(0.8, 0.1, 0.2),
      b = stop(0.1, 0.1, 0.8);
    const left = nativeLab(a),
      right = nativeLab(b);
    const c0 = Math.hypot(left.a, left.b),
      c1 = Math.hypot(right.a, right.b);
    const h0 = Math.atan2(left.b, left.a),
      h1 = Math.atan2(right.b, right.a);
    let shortest = h1 - h0;
    while (shortest < -Math.PI) shortest += 2 * Math.PI;
    while (shortest >= Math.PI) shortest -= 2 * Math.PI;
    const choices = [
      { space: 'oklab' },
      { space: 'oklch', huePath: 'shorter' },
      { space: 'oklch', huePath: 'longer' },
    ] as const;
    const midpoints: number[] = [];
    for (const choice of choices) {
      const route = createGradientReferenceRouteV2(a, b, { route: choice });
      for (const [t, endpoint] of [
        [0, left],
        [1, right],
      ] as const)
        for (const key of keys) within(endpoint[key], route.cell([t, t]).lab[key]);
      midpoints.push((route.cell([0.5, 0.5]).lab.a[0] + route.cell([0.5, 0.5]).lab.a[1]) / 2);
      for (const center of [0.2, 0.5, 0.8]) {
        const interval: Interval = [center - 0.01, center + 0.01];
        const dual = route.dual(interval),
          cell = route.cell(interval);
        for (const key of keys) expect(dual[key].value).toEqual(cell.lab[key]);
        for (let index = 0; index <= 10; index++) {
          const t = interval[0] + ((interval[1] - interval[0]) * index) / 10;
          let value, derivative;
          if (choice.space === 'oklab') {
            value = {
              L: left.L + (right.L - left.L) * t,
              a: left.a + (right.a - left.a) * t,
              b: left.b + (right.b - left.b) * t,
            };
            derivative = { L: right.L - left.L, a: right.a - left.a, b: right.b - left.b };
          } else {
            const delta =
              choice.huePath === 'shorter'
                ? shortest
                : shortest + (shortest > 0 ? -2 : 2) * Math.PI;
            const h = h0 + delta * t,
              c = c0 + (c1 - c0) * t;
            value = { L: left.L + (right.L - left.L) * t, a: c * Math.cos(h), b: c * Math.sin(h) };
            derivative = {
              L: right.L - left.L,
              a: (c1 - c0) * Math.cos(h) - c * Math.sin(h) * delta,
              b: (c1 - c0) * Math.sin(h) + c * Math.cos(h) * delta,
            };
          }
          // Independent analytic chain rules with native scalar values are regression
          // evidence, not a replacement for the continuous interval derivation.
          for (const key of keys) {
            within(value[key], dual[key].value);
            within(derivative[key], dual[key].derivative);
          }
        }
      }
    }
    expect(Math.abs(midpoints[1] - midpoints[2])).toBeGreaterThan(0.1);
  });
});
