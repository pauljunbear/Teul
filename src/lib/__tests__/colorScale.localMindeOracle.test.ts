import { describe, expect, it } from 'vitest';
import oracle from './fixtures/colorjs-local-minde-oracle.json';
import { isOklchInSrgbGamut, mapOklchToSrgb } from '../colorScale';
import { oklchToOklab, type OKLCH } from '../utils';

function deltaEOK(first: OKLCH, second: readonly [number, number, number]): number {
  const firstLab = oklchToOklab(first.l, first.c, first.h);
  const secondLab = oklchToOklab(second[0], second[1], second[2]);

  return Math.sqrt(
    Math.pow(firstLab.L - secondLab.L, 2) +
      Math.pow(firstLab.a - secondLab.a, 2) +
      Math.pow(firstLab.b - secondLab.b, 2)
  );
}

describe('CSS Color 4 Local MINDE Color.js oracle', () => {
  it('pins the independent implementation and all required edge-case classes', () => {
    expect(oracle.oracle).toEqual({
      package: 'colorjs.io',
      version: '0.7.0',
      packageSha256: '9fcffedb8a1ba812bb695dc7ab100c1a3c77a52264cbd56050117e6c48fe453a',
      generatedOn: '2026-08-02',
      method: 'Color#toGamut({ space: "srgb", method: "css" })',
      upstream: 'https://github.com/color-js/color.js',
      specification: 'https://www.w3.org/TR/2026/CRD-css-color-4-20260728/#binsearch',
    });
    expect([...new Set(oracle.vectors.map(vector => vector.category))].sort()).toEqual([
      'deep-out-of-gamut',
      'gamut-boundary',
      'in-gamut-identity',
      'lightness-endpoint',
      'near-jnd',
      'shallow-concave-cyan',
      'shallow-concave-yellow',
    ]);
  });

  it('straddles the CSS JND and probes both sides of the sRGB boundary at epsilon scale', () => {
    const belowJnd = oracle.vectors.find(vector => vector.id === 'initial-clip-below-jnd');
    const aboveJnd = oracle.vectors.find(vector => vector.id === 'initial-clip-above-jnd');
    const boundaryInside = oracle.vectors.find(vector => vector.id === 'boundary-inside-epsilon');
    const boundaryOutside = oracle.vectors.find(vector => vector.id === 'boundary-outside-epsilon');

    expect(belowJnd).toBeDefined();
    expect(aboveJnd).toBeDefined();
    expect(boundaryInside).toBeDefined();
    expect(boundaryOutside).toBeDefined();
    expect(belowJnd!.initialClipDeltaEOK).toBeLessThan(oracle.constants.jnd);
    expect(oracle.constants.jnd - belowJnd!.initialClipDeltaEOK).toBeLessThan(
      oracle.constants.epsilon
    );
    expect(aboveJnd!.initialClipDeltaEOK).toBeGreaterThan(oracle.constants.jnd);
    expect(aboveJnd!.initialClipDeltaEOK - oracle.constants.jnd).toBeLessThan(
      oracle.constants.epsilon
    );
    expect(oracle.constants.boundaryChroma - boundaryInside!.input.c).toBeCloseTo(
      oracle.constants.epsilon / 2,
      12
    );
    expect(boundaryOutside!.input.c - oracle.constants.boundaryChroma).toBeCloseTo(
      oracle.constants.epsilon * 1.5,
      12
    );
  });

  it.each(oracle.vectors)('$id agrees with the pinned Color.js CSS mapping', vector => {
    const result = mapOklchToSrgb(vector.input);

    expect(isOklchInSrgbGamut(vector.input), vector.id).toBe(vector.inputInSrgb);
    expect(result.mapped, vector.id).toBe(vector.expectedMapped);
    expect(result.hex, vector.id).toBe(vector.expected.hex);

    const [lightness, chroma, hue] = vector.expected.oklch;
    if (lightness !== null && chroma !== null && hue !== null && chroma > 0) {
      const difference = deltaEOK(result.oklch, [lightness, chroma, hue]);
      expect(difference, `${vector.id} deltaEOK`).toBeLessThanOrEqual(
        oracle.constants.epsilon / 10
      );
    }
  });
});
