import { describe, expect, it, vi } from 'vitest';
import {
  assessGradientFidelityV2,
  encloseMappedRouteForExperiment,
  encloseGradientInteriorForExperiment,
  assessGradientPaintCandidateForExperiment,
  classifyGradientFidelityErrorV2,
} from '../colorSystemGradientFidelityV2';
import { mapOklchToNativeSrgbV1 } from '../colorScale';
import { oklchToOklab, rgbToOklab } from '../utils';
import {
  compileGradientV1,
  gradientCssV1,
  gradientSvgV1,
  type GradientInputV1,
} from '../colorSystemGradientV1';
import { buildColorSystemSrgbValueV1, colorSystemSrgbToOklchV1 } from '../colorSystemSrgbValueV1';
import { dividePositiveIntervalV1, nextUpV1 } from '../colorSystemGradientIntervalsV1';

const color = (r: number, g: number, b: number) => buildColorSystemSrgbValueV1({ r, g, b });
const fixture = (
  colors = [color(0.1, 0.2, 0.3), color(0.2, 0.3, 0.4)],
  route: GradientInputV1['route'] = { space: 'oklab' }
): GradientInputV1 => ({
  sourceModelHash: `sha256:${'1'.repeat(64)}`,
  briefHash: `sha256:${'2'.repeat(64)}`,
  angleDegrees: 120,
  route,
  stops: colors.map((value, index) => ({
    position: index / (colors.length - 1),
    value,
    sourceColorId: `source-${index}`,
    locked: true,
  })),
});

describe('continuous gradient fidelity', () => {
  it('keeps both sides of the exact tolerance rounding band unassessed', () => {
    const [low, high] = dividePositiveIntervalV1([1, 1], [200, 200]);
    expect(classifyGradientFidelityErrorV2([low, low])).toBe('pass');
    expect(classifyGradientFidelityErrorV2([nextUpV1(low), nextUpV1(low)])).toBe('unassessed');
    expect(classifyGradientFidelityErrorV2([high, high])).toBe('unassessed');
    expect(classifyGradientFidelityErrorV2([nextUpV1(high), nextUpV1(high)])).toBe('fail');
  });

  it('binds the mathematical reference and does not trust native angle functions', () => {
    const design = compileGradientV1(
      fixture([color(0.12, 0.5, 0.6), color(0.35, 0.45, 0.7)], {
        space: 'oklch',
        huePath: 'shorter',
      })
    );
    const baseline = assessGradientFidelityV2(design);
    expect(baseline.status).toBe('pass');
    expect(baseline.schemaVersion).toBe('teul.gradient-fidelity.v2');
    expect(baseline.numericalProfile.nativeCoordinateAllowance).toBe(0);
    expect(baseline.numericalProfile.referenceVersion).toBe('teul.gradient-reference-route.v2');
    expect(baseline.toleranceDeltaEOK).toBeLessThan(0.005);
    const atan = vi.spyOn(Math, 'atan').mockImplementation(() => Number.NaN);
    const atan2 = vi.spyOn(Math, 'atan2').mockImplementation(() => Number.NaN);
    const sin = vi.spyOn(Math, 'sin').mockImplementation(() => Number.NaN);
    const cos = vi.spyOn(Math, 'cos').mockImplementation(() => Number.NaN);
    try {
      expect(assessGradientFidelityV2(design)).toEqual(baseline);
    } finally {
      atan.mockRestore();
      atan2.mockRestore();
      sin.mockRestore();
      cos.mockRestore();
    }
  });

  it('binds candidate paint separately and preserves every authored anchor', () => {
    const design = compileGradientV1(fixture());
    const result = assessGradientPaintCandidateForExperiment(design, design.compiledPaint.stops);
    expect(result.status).toBe('pass');
    expect(result.designHash).toBe(design.designHash);
    expect(result.candidatePaintHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(assessGradientFidelityV2(design).candidatePaintHash).toBeNull();
    const changed = [...design.compiledPaint.stops];
    changed[0] = { ...changed[0], value: color(0.2, 0.2, 0.2) };
    expect(() => assessGradientPaintCandidateForExperiment(design, changed)).toThrow('anchor');
    expect(() =>
      assessGradientPaintCandidateForExperiment(design, [...design.compiledPaint.stops].reverse())
    ).toThrow('increasing');
    expect(() =>
      assessGradientPaintCandidateForExperiment(
        design,
        Array(65).fill(design.compiledPaint.stops[0])
      )
    ).toThrow('64');
  });

  it('covers native interior values across narrow mapper intervals', () => {
    for (const colors of [
      [color(0.8, 0.1, 0.2), color(0.1, 0.1, 0.8)],
      [
        color(0.16032589599490166, 0.6980988865252584, 0.28516142861917615),
        color(0.5630403070244938, 0.9031179184094071, 0.5892083912622184),
      ],
    ]) {
      const design = compileGradientV1(fixture(colors, { space: 'oklch', huePath: 'longer' }));
      const left = colorSystemSrgbToOklchV1(colors[0]),
        right = colorSystemSrgbToOklchV1(colors[1]);
      let delta = ((right.h - left.h + 540) % 360) - 180;
      delta += delta > 0 ? -360 : 360;
      for (const center of [0.17, 0.267181396484375, 0.51, 0.89]) {
        const interval = [center - 1e-7, center + 1e-7] as const;
        const enclosed = encloseGradientInteriorForExperiment(design, 0, interval);
        expect(enclosed.box).not.toBeNull();
        for (let index = 0; index <= 16; index++) {
          const t = interval[0] + ((interval[1] - interval[0]) * index) / 16;
          const actual = mapOklchToNativeSrgbV1({
            l: left.l + (right.l - left.l) * t,
            c: left.c + (right.c - left.c) * t,
            h: (((left.h + delta * t) % 360) + 360) % 360,
          }).components;
          for (const key of ['r', 'g', 'b'] as const) {
            expect(actual[key]).toBeGreaterThanOrEqual(enclosed.box![key][0]);
            expect(actual[key]).toBeLessThanOrEqual(enclosed.box![key][1]);
          }
        }
      }
    }
  });

  it('exercises centered JND pruning and still encloses native interior values', () => {
    const colors = [color(0.8, 0.1, 0.2), color(0.1, 0.1, 0.8)];
    const design = compileGradientV1(fixture(colors, { space: 'oklch', huePath: 'longer' }));
    const left = colorSystemSrgbToOklchV1(colors[0]),
      right = colorSystemSrgbToOklchV1(colors[1]);
    let delta = ((right.h - left.h + 540) % 360) - 180;
    delta += delta > 0 ? -360 : 360;
    for (const interval of [
      [0.16999, 0.17001],
      [0.267181396484375 - 0.001, 0.267181396484375 + 0.001],
    ] as const) {
      const enclosed = encloseGradientInteriorForExperiment(design, 0, interval);
      expect(enclosed.centeredTightenings).toBeGreaterThan(0);
      expect(enclosed.box).not.toBeNull();
      for (let index = 0; index <= 16; index++) {
        const t = interval[0] + ((interval[1] - interval[0]) * index) / 16;
        const actual = mapOklchToNativeSrgbV1({
          l: left.l + (right.l - left.l) * t,
          c: left.c + (right.c - left.c) * t,
          h: (((left.h + delta * t) % 360) + 360) % 360,
        }).components;
        for (const key of ['r', 'g', 'b'] as const) {
          expect(actual[key]).toBeGreaterThanOrEqual(enclosed.box![key][0]);
          expect(actual[key]).toBeLessThanOrEqual(enclosed.box![key][1]);
        }
      }
    }
  });

  it('retains a real between-sample failure as a regression against false certification', () => {
    const colors = [
      color(0.16032589599490166, 0.6980988865252584, 0.28516142861917615),
      color(0.5630403070244938, 0.9031179184094071, 0.5892083912622184),
    ];
    const design = compileGradientV1(fixture(colors, { space: 'oklch', huePath: 'longer' }));
    const position = 0.267181396484375;
    expect(position * 4096).not.toBe(Math.round(position * 4096));
    const left = colorSystemSrgbToOklchV1(colors[0]),
      right = colorSystemSrgbToOklchV1(colors[1]);
    let delta = ((right.h - left.h + 540) % 360) - 180;
    delta += delta > 0 ? -360 : 360;
    const mapped = mapOklchToNativeSrgbV1({
      l: left.l + (right.l - left.l) * position,
      c: left.c + (right.c - left.c) * position,
      h: (((left.h + delta * position) % 360) + 360) % 360,
    }).components;
    const p = design.compiledPaint.stops.findIndex(
      (stop, i, all) => stop.position <= position && all[i + 1]?.position > position
    );
    const a = design.compiledPaint.stops[p],
      b = design.compiledPaint.stops[p + 1];
    const t = (position - a.position) / (b.position - a.position);
    const channels = (['r', 'g', 'b'] as const).map(
      key =>
        (a.value.components[key] + (b.value.components[key] - a.value.components[key]) * t) * 255
    );
    const actual = rgbToOklab(channels[0], channels[1], channels[2]);
    const wanted = rgbToOklab(mapped.r * 255, mapped.g * 255, mapped.b * 255);
    const error = Math.hypot(actual.L - wanted.L, actual.a - wanted.a, actual.b - wanted.b);
    expect(design.compiledPaint.approximation.maxObservedDeltaEOK).toBeLessThan(0.005);
    expect(error).toBeGreaterThan(0.005);
    expect(error).toBeCloseTo(0.005002123153076152, 12);
    const assessment = assessGradientFidelityV2(design);
    expect(assessment.status).toBe('fail');
    expect(assessment.reason).toBe('witness-exceeds-tolerance');
    expect(assessment.witness!.deltaEOKLowerBound).toBeGreaterThan(0.005);
  });

  it('bounds a restrained route without changing its saved paint, CSS or SVG', () => {
    const design = compileGradientV1(fixture());
    const before = {
      json: JSON.stringify(design),
      css: gradientCssV1(design),
      svg: gradientSvgV1(design),
    };
    const result = assessGradientFidelityV2(design);
    expect(result.status).toBe('pass');
    expect(result.maximumDeltaEOKUpperBound).toBeLessThanOrEqual(0.005);
    expect(result.boundedIntervals).toBeGreaterThan(1);
    expect(result.designHash).toBe(design.designHash);
    expect(result.numericalProfile.renderingQualification).toBe('not-qualified');
    expect({
      json: JSON.stringify(design),
      css: gradientCssV1(design),
      svg: gradientSvgV1(design),
    }).toEqual(before);
  });

  it('never converts an exhausted interval or depth budget into a pass', () => {
    const design = compileGradientV1(fixture([color(0, 0, 0), color(1, 1, 1)]));
    for (const budget of [{ maximumIntervals: 1 }, { maximumDepth: 1 }]) {
      const result = assessGradientFidelityV2(design, budget);
      expect(result.status).toBe('unassessed');
      expect(result.maximumDeltaEOKUpperBound).toBeNull();
      expect(result.witness).toBeNull();
    }
  });

  it('rejects forged saved paint and unsupported budgets before numerical assessment', () => {
    const design = compileGradientV1(fixture());
    expect(() =>
      assessGradientFidelityV2({ ...design, designHash: `sha256:${'f'.repeat(64)}` })
    ).toThrow('changed');
    for (const maximumIntervals of [0, -1, 8193, NaN, Infinity, 1.5])
      expect(() => assessGradientFidelityV2(design, { maximumIntervals })).toThrow('bounds');
    expect(() => assessGradientFidelityV2(design, JSON.parse('{"constructor":1}'))).toThrow(
      'Unknown'
    );
  });

  it('encloses native mapping across clipped, reduced-chroma and near-neutral colors', () => {
    for (const l of [0.05, 0.5, 0.95]) {
      for (const c of [0, 0.05, 0.2, 0.4]) {
        for (const h of [0, 45, 90, 135, 180, 225, 270, 315]) {
          const lab = oklchToOklab(l, c, h);
          const enclosed = encloseMappedRouteForExperiment(
            { lab: { L: [lab.L, lab.L], a: [lab.a, lab.a], b: [lab.b, lab.b] }, chroma: [c, c] },
            256
          );
          const expected = mapOklchToNativeSrgbV1({ l, c, h }).components;
          expect(enclosed.box).not.toBeNull();
          for (const key of ['r', 'g', 'b'] as const) {
            expect(expected[key]).toBeGreaterThanOrEqual(enclosed.box![key][0]);
            expect(expected[key]).toBeLessThanOrEqual(enclosed.box![key][1]);
          }
        }
      }
    }
    const lab = oklchToOklab(0.5, 0.4, 120);
    expect(
      encloseMappedRouteForExperiment(
        { lab: { L: [lab.L, lab.L], a: [lab.a, lab.a], b: [lab.b, lab.b] }, chroma: [0.4, 0.4] },
        1
      ).box
    ).toBeNull();
  });

  it.each([
    ['black-white', [color(0, 0, 0), color(1, 1, 1)], { space: 'oklab' }],
    [
      'shorter',
      [color(0.12, 0.5, 0.6), color(0.35, 0.45, 0.7)],
      { space: 'oklch', huePath: 'shorter' },
    ],
    ['longer', [color(0.8, 0.1, 0.2), color(0.1, 0.1, 0.8)], { space: 'oklch', huePath: 'longer' }],
    [
      'neutral-borrow',
      [color(0.4, 0.4, 0.4), color(0.3, 0.5, 0.6)],
      { space: 'oklch', huePath: 'longer' },
    ],
    [
      'five-stops',
      [
        color(0.1, 0.2, 0.3),
        color(0.12, 0.24, 0.36),
        color(0.18, 0.3, 0.4),
        color(0.2, 0.35, 0.45),
        color(0.3, 0.4, 0.5),
      ],
      { space: 'oklab' },
    ],
  ] as const)('measures the bounded verifier on %s', (name, colors, route) => {
    const design = compileGradientV1(fixture([...colors], route));
    const result = assessGradientFidelityV2(design);
    expect(result.visitedIntervals).toBeLessThanOrEqual(8192);
    expect(result.mappingStates).toBeLessThanOrEqual(65536);
    expect(result.reason).not.toBe('numerical-domain');
    expect(result.status).toBe(name === 'longer' ? 'unassessed' : 'pass');
    if (name === 'black-white') {
      expect(result.centeredIntervals).toBeGreaterThan(0);
      expect(result.visitedIntervals).toBeLessThan(1000);
    }
    if (name === 'longer') expect(result.reason).toBe('mapping-budget');
    if (result.status === 'pass')
      expect(result.maximumDeltaEOKUpperBound).toBeLessThanOrEqual(0.005);
    else expect(result.maximumDeltaEOKUpperBound).toBeNull();
  });
});
