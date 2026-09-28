import { describe, expect, it } from 'vitest';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import {
  compileGradientV1,
  assessGradientContrastV1,
  gradientCssV1,
  gradientSvgV1,
  parseGradientV1,
  type GradientInputV1,
} from '../colorSystemGradientV1';

const color = (r: number, g: number, b: number) => buildColorSystemSrgbValueV1({ r, g, b });
const fixture = (values = [color(0, 0, 0), color(1, 1, 1)]): GradientInputV1 => ({
  sourceModelHash: `sha256:${'1'.repeat(64)}`,
  briefHash: `sha256:${'2'.repeat(64)}`,
  angleDegrees: 120,
  route: { space: 'oklab' },
  stops: values.map((value, i) => ({
    position: i / (values.length - 1),
    value,
    sourceColorId: `c:${i}`,
    locked: true,
  })),
});

describe('canonical opaque gradient proof', () => {
  it('retains exact native anchors, deterministic values and one paint across CSS/SVG', () => {
    const input = fixture([color(0.1234567890123456, 0.2, 0.4), color(0.8, 0.3, 0.12)]);
    const design = compileGradientV1(input);
    expect(design).toEqual(compileGradientV1(input));
    expect(design.compiledPaint.stops[0].value).toEqual(input.stops[0].value);
    expect(design.compiledPaint.stops[design.compiledPaint.stops.length - 1].value).toEqual(
      input.stops[1].value
    );
    expect(design.compiledPaint.stops.length).toBeLessThanOrEqual(64);
    expect(design.compiledPaint.approximation.maxObservedDeltaEOK).toBeLessThanOrEqual(0.005);
    const css = gradientCssV1(design);
    const svg = gradientSvgV1(design);
    for (const stop of design.compiledPaint.stops) {
      expect(css).toContain(`${stop.value.components.r * 100}%`);
      expect(svg).toContain(`${stop.value.components.r * 100}%`);
      expect(svg).toContain(`offset="${stop.position}"`);
    }
    expect(svg).not.toMatch(/script|href|foreignObject/);
    expect(JSON.parse(JSON.stringify(design))).toEqual(design);
    expect(parseGradientV1(JSON.parse(JSON.stringify(design)))).toEqual(design);
    expect(Object.isFrozen(design.compiledPaint.stops[0].value.components)).toBe(true);
  });

  it('rejects altered compiled paints, invented assessments and executable input on reopen', () => {
    const design = compileGradientV1(fixture());
    const altered = JSON.parse(JSON.stringify(design));
    altered.compiledPaint.stops[0].value = color(1, 0, 0);
    expect(() => parseGradientV1(altered)).toThrow('changed');
    expect(() => parseGradientV1({ ...design, qualified: true })).toThrow('changed');
    const hostile = Object.defineProperty({}, 'stops', {
      enumerable: true,
      get() {
        throw new Error('executed');
      },
    });
    expect(() => parseGradientV1(hostile)).toThrow('accessors');
  });

  it('makes hue routes explicit and retains all authored stops', () => {
    const input = fixture([color(0.8, 0.1, 0.2), color(0.1, 0.1, 0.8), color(0.8, 0.8, 0.8)]);
    const shorter = compileGradientV1({ ...input, route: { space: 'oklch', huePath: 'shorter' } });
    const longer = compileGradientV1({ ...input, route: { space: 'oklch', huePath: 'longer' } });
    expect(shorter.designHash).not.toBe(longer.designHash);
    for (const stop of input.stops) {
      expect(
        shorter.compiledPaint.stops.find(item => item.position === stop.position)?.value
      ).toEqual(stop.value);
      expect(
        longer.compiledPaint.stops.find(item => item.position === stop.position)?.value
      ).toEqual(stop.value);
    }
  });

  it('cannot pass when endpoints pass but an interior has the foreground luminance', () => {
    const text = color(0.46, 0.46, 0.46);
    const design = compileGradientV1(fixture());
    const assessment = assessGradientContrastV1(design, text, 4.5);
    expect(assessment.status).toBe('fail');
    expect(assessment.minimumRatioLowerBound).toBe(1);
    expect(assessment.minimumRatioObserved).toBeLessThan(1.001);
    // The same text separately passes both endpoints, which is insufficient.
    expect(
      assessGradientContrastV1(compileGradientV1(fixture([color(0, 0, 0), color(0, 0, 0)])), text)
        .status
    ).toBe('pass');
    expect(
      assessGradientContrastV1(compileGradientV1(fixture([color(1, 1, 1), color(1, 1, 1)])), text)
        .status
    ).toBe('pass');
  });

  it('bounds the entire compiled path against an independent dense oracle', () => {
    const design = compileGradientV1(fixture([color(1, 0, 0), color(0, 0.4, 0.8), color(0, 1, 0)]));
    const result = assessGradientContrastV1(design, color(1, 1, 1));
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    let oracle = 21;
    const stops = design.compiledPaint.stops;
    for (let s = 0; s < stops.length - 1; s++)
      for (let i = 0; i <= 1000; i++) {
        const a = stops[s].value.components;
        const b = stops[s + 1].value.components;
        const l =
          0.2126 * lin(a.r + ((b.r - a.r) * i) / 1000) +
          0.7152 * lin(a.g + ((b.g - a.g) * i) / 1000) +
          0.0722 * lin(a.b + ((b.b - a.b) * i) / 1000);
        oracle = Math.min(oracle, 1.05 / (l + 0.05));
      }
    expect(result.minimumRatioLowerBound).toBeLessThanOrEqual(oracle + 1e-12);
    expect(oracle - result.minimumRatioLowerBound).toBeLessThan(0.001);
  });

  it('rejects duplicate/reversed stops, alpha, unsupported routes and invalid dimensions', () => {
    const input = fixture();
    expect(() =>
      compileGradientV1({ ...input, stops: [input.stops[1], input.stops[0]] })
    ).toThrow();
    expect(() =>
      compileGradientV1({ ...input, stops: [input.stops[0], input.stops[0]] })
    ).toThrow();
    expect(() =>
      compileGradientV1({
        ...input,
        stops: [
          { ...input.stops[0], value: { ...input.stops[0].value, alpha: 0.5 } },
          input.stops[1],
        ],
      })
    ).toThrow('opaque');
    expect(() => gradientSvgV1(compileGradientV1(input), Number.NaN)).toThrow();
  });
});
