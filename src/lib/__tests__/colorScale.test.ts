import { describe, expect, it } from 'vitest';
import wadaColors from '../../colors.json';
import wernerColors from '../../wernerColors.json';
import {
  buildColorScale,
  generateColorScale,
  isOklchInSrgbGamut,
  mapOklchToSrgb,
} from '../colorScale';

describe('mapOklchToSrgb', () => {
  it('reduces chroma rather than clipping out-of-gamut channels', () => {
    const result = mapOklchToSrgb({ l: 0.7, c: 0.5, h: 30 });

    expect(result.mapped).toBe(true);
    expect(result.oklch.c).toBeLessThan(0.5);
    expect(isOklchInSrgbGamut(result.oklch)).toBe(true);
    expect(result.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('rejects non-finite input', () => {
    expect(() => mapOklchToSrgb({ l: Number.NaN, c: 0.1, h: 20 })).toThrow(/finite/);
  });
});

describe('generateColorScale', () => {
  it('preserves the normalized source color exactly at step 9', () => {
    const scale = generateColorScale('#3366CC', 'light');

    expect(scale.baseHex).toBe('#3366cc');
    expect(scale.steps[8].hex).toBe('#3366cc');
    expect(scale.validation.anchorPreserved).toBe(true);
  });

  it('reports structural guarantees and exact contrast checks', () => {
    const scale = generateColorScale('#3366cc', 'light');

    expect(scale.profile).toBe('sRGB');
    expect(scale.method).toBe('Teul OKLCH v2');
    expect(scale.validation.contrast).toHaveLength(3);
    expect(scale.validation.contrast.map(check => check.foregroundStep)).toEqual([9, 11, 12]);
    expect(scale.validation.contrast.map(check => check.required)).toEqual([false, true, true]);
  });

  it('produces finite in-gamut colors in both modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const scale = generateColorScale('#ff0066', mode);
      expect(scale.validation.finite).toBe(true);
      expect(scale.validation.inSrgbGamut).toBe(true);
      expect(scale.steps).toHaveLength(12);
    }
  });

  it('returns a clear validation result for every bundled historical source color', () => {
    const sourceHexes = [
      ...wadaColors.map(color => color.hex),
      ...wernerColors.map(color => color.hex),
    ];

    for (const hex of sourceHexes) {
      for (const mode of ['light', 'dark'] as const) {
        const scale = generateColorScale(hex, mode);
        expect(scale.validation.anchorPreserved, `${hex} ${mode}`).toBe(true);
        expect(scale.validation.finite, `${hex} ${mode}`).toBe(true);
        expect(scale.validation.inSrgbGamut, `${hex} ${mode}`).toBe(true);
        if (!scale.validation.valid) {
          expect(
            scale.validation.issues.length,
            `${hex} ${mode} must explain why generation is structurally invalid`
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('pins the current bundled historical-source generation results', () => {
    const sources = [
      ...wadaColors.map(color => ({ collection: 'Wada', name: color.name, hex: color.hex })),
      ...wernerColors.map(color => ({ collection: 'Werner', name: color.name, hex: color.hex })),
    ];
    const results = sources.flatMap(source =>
      (['light', 'dark'] as const).map(mode => ({
        ...source,
        mode,
        result: buildColorScale(source.hex, mode),
      }))
    );
    const failures = results.filter(({ result }) => !result.ok);

    expect(sources).toHaveLength(269);
    expect(results).toHaveLength(538);
    expect(results.filter(({ result }) => result.ok)).toHaveLength(536);
    expect(failures.map(({ collection, name, mode }) => ({ collection, name, mode }))).toEqual([
      { collection: 'Wada', name: 'White', mode: 'light' },
      { collection: 'Wada', name: 'White', mode: 'dark' },
    ]);
  });

  it('returns explicit build failures for impossible exact anchors', () => {
    const whiteLight = buildColorScale('#ffffff', 'light');
    const blackDark = buildColorScale('#000000', 'dark');

    expect(whiteLight.ok).toBe(false);
    expect(blackDark.ok).toBe(false);
  });

  it('returns an explicit validated result for a viable source color', () => {
    const result = buildColorScale('#3366cc', 'light');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scale.validation.valid).toBe(true);
    }
  });

  it('independently verifies final relative luminance ordering for valid scales', () => {
    const scale = generateColorScale('#3366cc', 'light');
    const luminance = scale.steps.map(step => {
      const value = parseInt(step.hex.slice(1), 16);
      const r = (value >> 16) & 255;
      const g = (value >> 8) & 255;
      const b = value & 255;
      const linear = [r, g, b].map(channel => {
        const srgb = channel / 255;
        return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    });

    for (let index = 1; index < luminance.length; index++) {
      expect(luminance[index]).toBeLessThan(luminance[index - 1]);
    }
  });
});
