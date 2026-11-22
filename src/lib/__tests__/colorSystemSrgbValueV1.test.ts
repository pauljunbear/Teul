import { describe, expect, it } from 'vitest';
import type { ColorSystemColorValueV2 } from '../colorSystemBuilderV2Contracts';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import {
  buildColorSystemSrgbValueV1,
  colorSystemExactSrgbValueHashV1,
  colorSystemSrgbToCssV1,
  colorSystemSrgbToOklchV1,
  normalizeColorSystemSrgbValueV1,
} from '../colorSystemSrgbValueV1';
import { hexToOklch } from '../utils';

describe('native sRGB value identity and representation', () => {
  it('retains legacy byte values and CSS exactly', () => {
    const components = { r: 51 / 255, g: 102 / 255, b: 204 / 255 };
    const value = buildColorSystemSrgbValueV1(components);
    expect(value).toEqual({ colorSpace: 'srgb', hex: '#3366CC', components, alpha: 1 });
    expect(normalizeColorSystemSrgbValueV1(value)).toEqual(value);
    expect(colorSystemSrgbToCssV1(value)).toBe('#3366CC');
    expect(colorSystemSrgbToCssV1({ ...value, alpha: 0.5 })).toBe('rgb(51 102 204 / 0.5)');
  });

  it('retains fractional channels and their exact CSS serialization', () => {
    const components = { r: 0.20000000298023224, g: 0.4000000059604645, b: 0.800000011920929 };
    const value = buildColorSystemSrgbValueV1(components, 0.75);
    expect(value.components).toEqual(components);
    expect(value.hex).toBe('#3366CC');
    expect(value.representation?.kind).toBe('native-srgb');
    expect(normalizeColorSystemSrgbValueV1(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(colorSystemSrgbToCssV1(value)).toBe(
      'color(srgb 0.20000000298023224 0.4000000059604645 0.800000011920929 / 0.75)'
    );
    expect(colorSystemSrgbToOklchV1(value)).not.toEqual(hexToOklch(value.hex));
  });

  it('distinguishes source changes below the perceptual hash rounding precision', () => {
    const first = { r: 0.123456789012341, g: 0.5, b: 0.75 };
    const second = { ...first, r: 0.123456789012342 };
    expect(deterministicContentHash(first)).toBe(deterministicContentHash(second));
    expect(colorSystemExactSrgbValueHashV1(first, 1)).not.toBe(
      colorSystemExactSrgbValueHashV1(second, 1)
    );
    const a = buildColorSystemSrgbValueV1(first);
    const b = buildColorSystemSrgbValueV1(second);
    expect(a.hex).toBe(b.hex);
    expect(deterministicContentHash(a)).not.toBe(deterministicContentHash(b));
    expect(() => normalizeColorSystemSrgbValueV1({ ...a, components: second })).toThrow(
      'exact channels'
    );
  });

  it('binds fractional alpha identity even when the RGB channels are bytes', () => {
    const a = buildColorSystemSrgbValueV1({ r: 0, g: 0, b: 0 }, 0.3333333333333333);
    const b = buildColorSystemSrgbValueV1(a.components, 0.3333333333333334);
    expect(a.representation?.exactValueHash).not.toBe(b.representation?.exactValueHash);
    expect(colorSystemSrgbToCssV1(a)).toContain('/ 0.3333333333333333)');
  });

  it('rejects a false display hex or a removed native marker', () => {
    const value = buildColorSystemSrgbValueV1({ r: 0.2, g: 0.3, b: 0.8 });
    expect(() => normalizeColorSystemSrgbValueV1({ ...value, hex: '#FF0000' })).toThrow(
      'display approximation'
    );
    const { representation: _representation, ...stripped } = value;
    expect(() => normalizeColorSystemSrgbValueV1(stripped)).toThrow(
      'bound native-srgb representation'
    );
  });

  it.each([
    [{ r: 51 / 255 + 1e-15, g: 102 / 255, b: 204 / 255 }, 1],
    [{ r: 51 / 255 + 2e-15, g: 102 / 255, b: 204 / 255 }, 1],
    [{ r: 0, g: 0, b: 0 }, 0.3333333333333333],
    [{ r: 0, g: 0, b: 0 }, 0.3333333333333334],
  ] as const)(
    'rejects stripped native metadata for exact source %j at alpha %s',
    (components, alpha) => {
      const value = buildColorSystemSrgbValueV1(components, alpha);
      expect(value.representation?.kind).toBe('native-srgb');
      expect(normalizeColorSystemSrgbValueV1(value)).toEqual(value);
      const { representation: _representation, ...stripped } = value;
      expect(() => normalizeColorSystemSrgbValueV1(stripped)).toThrow(
        'bound native-srgb representation'
      );
    }
  );

  it('preserves every exact byte channel and canonical alpha without native metadata', () => {
    for (let channel = 0; channel <= 255; channel += 1) {
      const legacy: ColorSystemColorValueV2 = {
        colorSpace: 'srgb',
        hex: `#${channel.toString(16).padStart(2, '0').repeat(3).toUpperCase()}`,
        components: { r: channel / 255, g: channel / 255, b: channel / 255 },
        alpha: 0.5,
      };
      expect(buildColorSystemSrgbValueV1(legacy.components, legacy.alpha)).toEqual(legacy);
      const normalized = normalizeColorSystemSrgbValueV1(legacy);
      expect(normalized).toEqual(legacy);
      expect(deterministicContentHash(normalized)).toBe(deterministicContentHash(legacy));
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.00001, 1.00001])(
    'rejects invalid source channel %s',
    bad => {
      expect(() => buildColorSystemSrgbValueV1({ r: bad, g: 0.5, b: 0.5 })).toThrow('finite');
      expect(() => buildColorSystemSrgbValueV1({ r: 0.5, g: 0.5, b: 0.5 }, bad)).toThrow('finite');
    }
  );

  it('rejects inherited representation metadata', () => {
    const value = buildColorSystemSrgbValueV1({ r: 0.2, g: 0.3, b: 0.8 });
    const inherited = Object.create(value.representation!);
    expect(() => normalizeColorSystemSrgbValueV1({ ...value, representation: inherited })).toThrow(
      'representation'
    );
  });

  it('rejects unsupported encodings and extra representation fields', () => {
    const value = buildColorSystemSrgbValueV1({ r: 0.2, g: 0.3, b: 0.8 });
    for (const representation of [
      { ...value.representation, extra: true },
      { ...value.representation, kind: 'display-p3' },
    ]) {
      expect(() =>
        normalizeColorSystemSrgbValueV1({ ...value, representation } as ColorSystemColorValueV2)
      ).toThrow('representation');
    }
    expect(canonicalJson(value)).toContain('native-srgb');
  });
});
