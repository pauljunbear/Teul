import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import wadaColors from '../../colors.json';
import wernerColors from '../../wernerColors.json';
import {
  generateColorScale,
  generateColorScaleFromSrgbV1,
  isOklchInSrgbGamut,
  mapOklchToSrgb,
  pinColorScaleStep,
  pinColorScaleStepFromSrgbV1,
  pinColorScaleStepWithSourceAnchorsV1,
} from '../colorScale';
import { buildColorSystemSrgbValueV1, colorSystemSrgbToOklchV1 } from '../colorSystemSrgbValueV1';
import { getLuminance, hexToOklch, hexToRgb } from '../utils';

// p3-H: pinning an exact recorded tint into a generated scale reuses the generator's validator.
describe('pinColorScaleStep', () => {
  it('replaces one generated step with an exact hex and revalidates with the same rules', () => {
    const light = generateColorScale('#4777D2', 'light', 'Cobalt');
    const pinned = pinColorScaleStep(light, 2, '#DFE8F9');
    expect(pinned.steps[1].hex).toBe('#dfe8f9');
    expect(pinned.steps[1].gamutMapped).toBe(false);
    expect(pinned.steps[8].hex).toBe(light.steps[8].hex);
    expect(pinned.validation.valid).toBe(true);
    expect(pinned.validation.anchorPreserved).toBe(true);
    expect(pinned.validation.monotonicLightness).toBe(true);
    expect(pinned.validation.monotonicRelativeLuminance).toBe(true);
    // The input scale is untouched and every other step is the same object.
    expect(light.steps[1].hex).not.toBe('#dfe8f9');
    expect(pinned.steps.filter((step, index) => step === light.steps[index])).toHaveLength(11);
  });

  it('reports an out-of-order pin as invalid instead of accepting it', () => {
    const light = generateColorScale('#4777D2', 'light', 'Cobalt');
    const pinned = pinColorScaleStep(light, 2, light.steps[4].hex);
    expect(pinned.validation.valid).toBe(false);
    expect(pinned.validation.monotonicLightness).toBe(false);
    expect(pinned.validation.issues.map(issue => issue.code)).toContain('non-monotonic-lightness');
  });

  it('reports a mis-hued pale tint on a bright base as invalid through relative luminance', () => {
    // Bright lime base: Light steps 1–8 sit about 0.011 apart in OKLCH L, so a pale pink at
    // L 0.939 lands nearest step 6 but its relative luminance breaks the strict order.
    const light = generateColorScale('#D6F20F', 'light', 'Beacon');
    const pinned = pinColorScaleStep(light, 6, '#FDE3EA');
    expect(pinned.validation.valid).toBe(false);
    expect(pinned.validation.issues.map(issue => issue.code)).toEqual([
      'non-monotonic-relative-luminance',
    ]);
  });

  it('refuses the anchor step and steps outside 1 through 12', () => {
    const light = generateColorScale('#4777D2', 'light', 'Cobalt');
    expect(() => pinColorScaleStep(light, 9, '#DFE8F9')).toThrow(RangeError);
    expect(() => pinColorScaleStep(light, 0, '#DFE8F9')).toThrow(RangeError);
    expect(() => pinColorScaleStep(light, 13, '#DFE8F9')).toThrow(RangeError);
  });
});

describe('mapOklchToSrgb', () => {
  it('maps out-of-gamut colors to finite sRGB output', () => {
    const result = mapOklchToSrgb({ l: 0.7, c: 0.5, h: 30 });

    expect(result.mapped).toBe(true);
    expect(result.oklch.c).toBeLessThan(0.5);
    expect(isOklchInSrgbGamut(result.oklch)).toBe(true);
    expect(result.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('preserves in-gamut colors under relative colorimetric intent', () => {
    const source = { l: 0.6, c: 0.05, h: 240 };

    expect(isOklchInSrgbGamut(source)).toBe(true);
    expect(mapOklchToSrgb(source)).toMatchObject({ oklch: source, mapped: false });
  });

  it('preserves an already normalized fractional hue without reporting false mapping', () => {
    const source = { l: 0.6, c: 0.05, h: 29.123456789 };

    expect(isOklchInSrgbGamut(source)).toBe(true);
    expect(mapOklchToSrgb(source)).toMatchObject({ oklch: source, mapped: false });
  });

  it('canonicalizes negative-zero hue to positive zero', () => {
    const result = mapOklchToSrgb({ l: 0.6, c: 0.05, h: -0 });

    expect(result.oklch.h).toBe(0);
    expect(Object.is(result.oklch.h, -0)).toBe(false);
  });

  it('returns the specified white and black endpoints for out-of-range lightness', () => {
    expect(mapOklchToSrgb({ l: 1.2, c: 0.4, h: 120 })).toEqual({
      oklch: { l: 1, c: 0, h: 120 },
      hex: '#ffffff',
      mapped: true,
    });
    expect(mapOklchToSrgb({ l: -0.2, c: 0.4, h: -120 })).toEqual({
      oklch: { l: 0, c: 0, h: 240 },
      hex: '#000000',
      mapped: true,
    });
  });

  it('uses Local MINDE for the CSS Color 4 Display-P3 yellow example', () => {
    const result = mapOklchToSrgb({ l: 0.96476, c: 0.24503, h: 110.23 });

    expect(result).toMatchObject({ hex: '#feff00', mapped: true });
    expect(hexToOklch(result.hex).c).toBeGreaterThan(hexToOklch('#fdfe00').c);
    expect(Object.values(result.oklch).every(Number.isFinite)).toBe(true);
  });

  it('is deterministic and always emits an in-gamut six-digit sRGB value', () => {
    for (const l of [0, 0.02, 0.2, 0.5, 0.8, 0.98, 1]) {
      for (const c of [0, 0.01, 0.1, 0.3, 0.6]) {
        for (let h = 0; h < 360; h += 30) {
          const source = { l, c, h };
          const first = mapOklchToSrgb(source);
          const second = mapOklchToSrgb(source);

          expect(first, `${l} ${c} ${h}`).toEqual(second);
          expect(first.hex, `${l} ${c} ${h}`).toMatch(/^#[0-9a-f]{6}$/);
          expect(Object.values(first.oklch).every(Number.isFinite), `${l} ${c} ${h}`).toBe(true);
        }
      }
    }
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
    expect(scale.method).toBe('Teul OKLCH v3');
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
        result: generateColorScale(source.hex, mode),
      }))
    );
    const failures = results.filter(({ result }) => !result.validation.valid);

    expect(sources).toHaveLength(269);
    expect(results).toHaveLength(538);
    expect(results.filter(({ result }) => result.validation.valid)).toHaveLength(536);
    expect(failures.map(({ collection, name, mode }) => ({ collection, name, mode }))).toEqual([
      { collection: 'Wada', name: 'White', mode: 'light' },
      { collection: 'Wada', name: 'White', mode: 'dark' },
    ]);

    const repeatedResults = results.map(({ hex, mode }) => generateColorScale(hex, mode));
    expect(JSON.stringify(repeatedResults)).toBe(
      JSON.stringify(results.map(({ result }) => result))
    );

    const corpusEvidence = results.map(({ collection, name, hex, mode, result }) => ({
      collection,
      name,
      source: hex.toLowerCase(),
      mode,
      method: result.method,
      steps: result.steps.map(step => step.hex),
      valid: result.validation.valid,
      issues: result.validation.issues.map(issue => issue.code),
    }));
    const checksum = createHash('sha256').update(JSON.stringify(corpusEvidence)).digest('hex');

    expect(checksum).toBe('68485d2cc938988453c35fdb31992387c6079e24478377b6d7d9c78e92129050');
  });

  it('returns explicit build failures for impossible exact anchors', () => {
    const whiteLight = generateColorScale('#ffffff', 'light');
    const blackDark = generateColorScale('#000000', 'dark');

    expect(whiteLight.validation.valid).toBe(false);
    expect(blackDark.validation.valid).toBe(false);
  });

  it('returns an explicit validated result for a viable source color', () => {
    const result = generateColorScale('#3366cc', 'light');

    expect(result.validation.valid).toBe(true);
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

describe('native sRGB scales', () => {
  const source = buildColorSystemSrgbValueV1({ r: 0.201, g: 0.399, b: 0.801 });

  it.each(['light', 'dark'] as const)('preserves source channels at step 9 in %s mode', mode => {
    const scale = generateColorScaleFromSrgbV1(source, mode);
    expect(scale.validation.valid).toBe(true);
    expect(scale.baseValue).toEqual(source);
    expect(scale.steps[8].value).toEqual(source);
    expect(scale.steps[8].oklch).toEqual(colorSystemSrgbToOklchV1(source));
    expect(scale.steps[8].oklch).not.toEqual(hexToOklch(source.hex));
    const sourceLuminance = getLuminance(
      source.components.r * 255,
      source.components.g * 255,
      source.components.b * 255
    );
    const background = hexToRgb(scale.steps[0].hex);
    const backgroundLuminance = getLuminance(background.r, background.g, background.b);
    expect(scale.validation.contrast[0].ratio).toBe(
      (Math.max(sourceLuminance, backgroundLuminance) + 0.05) /
        (Math.min(sourceLuminance, backgroundLuminance) + 0.05)
    );
  });

  it('keeps legacy byte scales and pins byte-for-byte unchanged', () => {
    const byte = buildColorSystemSrgbValueV1({ r: 51 / 255, g: 102 / 255, b: 204 / 255 });
    for (const mode of ['light', 'dark'] as const) {
      expect(generateColorScaleFromSrgbV1(byte, mode)).toEqual(generateColorScale(byte.hex, mode));
    }
    const scale = generateColorScale(byte.hex);
    const tint = buildColorSystemSrgbValueV1({ r: 224 / 255, g: 234 / 255, b: 250 / 255 });
    expect(pinColorScaleStepFromSrgbV1(scale, 2, tint)).toEqual(
      pinColorScaleStep(scale, 2, tint.hex)
    );
    expect(pinColorScaleStepWithSourceAnchorsV1(scale, 2, tint, [])).toEqual(
      pinColorScaleStep(scale, 2, tint.hex)
    );
  });

  it('validates distinct native pins from their actual channels even when adjacent display hexes match', () => {
    const scale = generateColorScaleFromSrgbV1(source);
    const top = hexToRgb(scale.steps[0].hex);
    const tint = buildColorSystemSrgbValueV1({
      r: top.r / 255 - 0.0004,
      g: top.g / 255 - 0.0004,
      b: top.b / 255 - 0.0004,
    });
    expect(tint.hex.toLowerCase()).toBe(scale.steps[0].hex);
    const pinned = pinColorScaleStepFromSrgbV1(scale, 2, tint);
    expect(pinned.steps[1].value).toEqual(tint);
    expect(pinned.validation.valid).toBe(true);
    expect(pinned.validation.uniqueAdjacentSteps).toBe(true);
    expect(pinColorScaleStep(scale, 2, tint.hex).validation.valid).toBe(false);
    const reversed = buildColorSystemSrgbValueV1({
      r: top.r / 255 + 0.0004,
      g: top.g / 255 + 0.0004,
      b: top.b / 255 + 0.0004,
    });
    const invalid = pinColorScaleStepFromSrgbV1(scale, 2, reversed);
    expect(invalid.validation.monotonicRelativeLuminance).toBe(false);
    expect(invalid.validation.monotonicLightness).toBe(false);
  });

  it('rejects altered native channels, nonopaque sources, and anchor pins', () => {
    expect(() =>
      generateColorScaleFromSrgbV1({ ...source, components: { ...source.components, r: 0.202 } })
    ).toThrow();
    expect(() =>
      generateColorScaleFromSrgbV1(buildColorSystemSrgbValueV1(source.components, 0.5))
    ).toThrow(/opaque/);
    expect(() =>
      pinColorScaleStepFromSrgbV1(generateColorScaleFromSrgbV1(source), 9, source)
    ).toThrow(RangeError);
  });
});

describe('source-anchored native pin policy', () => {
  const source = buildColorSystemSrgbValueV1({ r: 0.76, g: 0.93, b: 0.04 });
  const tint = buildColorSystemSrgbValueV1({ r: 0.88, g: 0.97, b: 0.62 });
  const byteValue = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    return buildColorSystemSrgbValueV1({ r: r / 255, g: g / 255, b: b / 255 });
  };

  it('removes a tint chroma reversal while retaining exact anchors and lightness targets', () => {
    const scale = generateColorScaleFromSrgbV1(source);
    const replaced = pinColorScaleStepFromSrgbV1(scale, 5, tint);
    expect(replaced.validation.valid).toBe(true);
    expect(replaced.steps[4].oklch.c - replaced.steps[5].oklch.c).toBeGreaterThan(0.03);

    const pinned = pinColorScaleStepWithSourceAnchorsV1(scale, 5, tint, []);
    expect(pinned.sourcePinPolicy).toBe('source-anchored-oklch-v1');
    expect(pinned.validation.valid).toBe(true);
    expect(pinned.steps[4].value).toEqual(tint);
    expect(pinned.steps[3].sourceAnchorSteps).toEqual([1, 5]);
    expect(pinned.steps[5].sourceAnchorSteps).toEqual([5, 9]);
    expect(pinned.steps[8]).toBe(scale.steps[8]);
    expect(pinned.steps[8].value).toEqual(source);
    expect(pinned.steps[0]).toBe(scale.steps[0]);
    expect(pinned.steps.slice(9)).toEqual(scale.steps.slice(9));
    for (let index = 1; index < 9; index++) {
      expect(pinned.steps[index].oklch.c).toBeGreaterThan(pinned.steps[index - 1].oklch.c);
      if (index !== 4) {
        expect(pinned.steps[index].requestedOklch.l).toBe(scale.steps[index].requestedOklch.l);
      }
    }
    expect(scale.sourcePinPolicy).toBeUndefined();
    expect(scale.steps[4].value).toBeUndefined();
  });

  it('preserves a prior byte pin and a prior native pin while interpolating only bounded neighbors', () => {
    const scale = generateColorScaleFromSrgbV1(source);
    const first = pinColorScaleStepWithSourceAnchorsV1(scale, 3, byteValue(scale.steps[2].hex), []);
    const second = pinColorScaleStepWithSourceAnchorsV1(first, 5, tint, [3]);
    const third = pinColorScaleStepWithSourceAnchorsV1(
      second,
      7,
      byteValue(second.steps[6].hex),
      [3, 5]
    );
    expect(third.validation.valid).toBe(true);
    expect(first.steps[2].value).toBeUndefined();
    expect(second.steps[2]).toBe(first.steps[2]);
    expect(second.steps[1]).toBe(first.steps[1]);
    expect(third.steps[2]).toBe(first.steps[2]);
    expect(third.steps[4]).toBe(second.steps[4]);
    expect(third.steps[4].value).toEqual(tint);
    expect(third.steps[3].sourceAnchorSteps).toEqual([3, 5]);
    expect(third.steps[5].sourceAnchorSteps).toEqual([5, 7]);
    expect(third.steps[8]).toBe(scale.steps[8]);
    expect(third.steps.slice(9)).toEqual(scale.steps.slice(9));
  });

  it('interpolates hue across the short arc through zero', () => {
    const native = (l: number, c: number, h: number) => {
      const byte = byteValue(mapOklchToSrgb({ l, c, h }).hex);
      return buildColorSystemSrgbValueV1({ ...byte.components, r: byte.components.r + 0.0001 });
    };
    const scale = generateColorScaleFromSrgbV1(native(0.55, 0.1, 350));
    const pinned = pinColorScaleStepWithSourceAnchorsV1(scale, 4, native(0.82, 0.07, 10), []);
    expect(pinned.validation.valid).toBe(true);
    for (const step of pinned.steps.slice(4, 8)) {
      expect(step.requestedOklch.h < 11 || step.requestedOklch.h > 349).toBe(true);
    }
  });

  it('retains strict rejection for impossible source ordering and refuses replacing a prior pin', () => {
    const scale = generateColorScaleFromSrgbV1(source);
    const invalid = pinColorScaleStepWithSourceAnchorsV1(scale, 5, source, []);
    expect(invalid.validation.valid).toBe(false);
    expect(invalid.validation.monotonicLightness).toBe(false);
    expect(invalid.validation.monotonicRelativeLuminance).toBe(false);
    expect(invalid.steps[4].value).toEqual(source);
    expect(invalid.steps[8]).toBe(scale.steps[8]);
    expect(() => pinColorScaleStepWithSourceAnchorsV1(scale, 5, tint, [5])).toThrow(RangeError);
    expect(() => pinColorScaleStepWithSourceAnchorsV1(scale, 5, tint, [0])).toThrow(RangeError);
    expect(() => pinColorScaleStepWithSourceAnchorsV1(scale, 9, tint, [])).toThrow(RangeError);
    expect(() =>
      pinColorScaleStepWithSourceAnchorsV1(
        scale,
        5,
        { ...tint, components: { ...tint.components, r: 0.89 } },
        []
      )
    ).toThrow();
  });
});
