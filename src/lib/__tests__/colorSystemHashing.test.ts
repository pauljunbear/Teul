import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_NUMBER_SIGNIFICANT_DIGITS,
  canonicalHashJson,
  canonicalJson,
  canonicalNumber,
  deterministicContentHash,
} from '../colorSystemHashing';

describe('color-system deterministic hashing', () => {
  it('matches an independent SHA-256 oracle over canonical JSON', () => {
    const value = { zebra: ['틀', 2], alpha: { enabled: true } };
    const expected = createHash('sha256').update(canonicalJson(value)).digest('hex');

    expect(deterministicContentHash(value)).toBe(`sha256:${expected}`);
  });

  it.each(['\ud800', '\udc00', `left\ud800right`, `left\udc00right`])(
    'matches the UTF-8 replacement behavior for unmatched surrogate %j',
    value => {
      const canonical = canonicalJson({ description: value });
      const contentOracle = createHash('sha256').update(canonical, 'utf8').digest('hex');

      expect(deterministicContentHash({ description: value })).toBe(`sha256:${contentOracle}`);
    }
  );

  it('matches the independent oracle across padding boundaries, UTF-8 and large repeated calls', () => {
    const messages: unknown[] = [
      '',
      '틀·🌈·日本語',
      '\u0000\t\n"\\\ud800🌈\udc00',
      ...[55, 56, 63, 64, 119, 120, 127, 128, 129, 4096, 2 * 1024 * 1024].map(bytes =>
        'a'.repeat(bytes - 2)
      ),
    ];
    let seed = 42;
    for (let index = 0; index < 100; index++) {
      messages.push(
        String.fromCharCode(
          ...Array.from({ length: index * 13 }, () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed & 0xffff;
          })
        )
      );
    }
    const expected = messages.map(
      message => `sha256:${createHash('sha256').update(canonicalHashJson(message)).digest('hex')}`
    );
    for (const index of [
      ...messages.map((_, index) => index),
      ...messages.map((_, index) => messages.length - index - 1),
    ])
      expect(deterministicContentHash(messages[index])).toBe(expected[index]);
  });
});

describe('canonicalNumber: the one numeric canonicalization policy', () => {
  it('keeps twelve significant digits and is idempotent', () => {
    expect(CANONICAL_NUMBER_SIGNIFICANT_DIGITS).toBe(12);
    expect(canonicalNumber(0.512345678901)).toBe(0.512345678901);
    expect(canonicalNumber(0.51234567890124)).toBe(0.512345678901);
    expect(canonicalNumber(0.51234567890176)).toBe(0.512345678902);
    expect(canonicalNumber(29.123456789)).toBe(29.123456789);
    expect(canonicalNumber(241.0000000000004)).toBe(241);
    expect(canonicalNumber(0.00000400001)).toBe(0.00000400001);
    for (const value of [0.512345678901, 29.123456789, 0.00000400001, 359.999999999]) {
      expect(canonicalNumber(canonicalNumber(value))).toBe(canonicalNumber(value));
    }
  });

  it('passes integers through exactly, including ones wider than twelve digits', () => {
    expect(canonicalNumber(0)).toBe(0);
    expect(canonicalNumber(12)).toBe(12);
    expect(canonicalNumber(255)).toBe(255);
    expect(canonicalNumber(1757300000123)).toBe(1757300000123);
    expect(canonicalNumber(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(canonicalNumber(-1757300000123)).toBe(-1757300000123);
  });

  it('canonicalizes negative zero to zero', () => {
    expect(Object.is(canonicalNumber(-0), -0)).toBe(false);
    expect(canonicalNumber(-0)).toBe(0);
    expect(canonicalHashJson({ c: -0 })).toBe('{"c":0}');
  });

  it('rejects non-finite numbers instead of hashing them as null', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => canonicalNumber(value)).toThrow(TypeError);
      expect(() => canonicalHashJson({ value })).toThrow(TypeError);
      expect(() => deterministicContentHash({ value })).toThrow(TypeError);
    }
    // Raw canonical JSON keeps JSON semantics; only the hash layer rejects.
    expect(canonicalJson({ value: Number.NaN })).toBe('{"value":null}');
  });

  it('absorbs relative noise of 1e-13 and exposes a relative change of 1e-9 across magnitudes', () => {
    // Magnitudes spanning what the builder serializes: OKLCH chroma and
    // lightness, hue in degrees, ΔEOK measures, and sRGB channels in [0, 1].
    const samples = [
      0.00392156862745, 0.0123456789012, 0.0800000000001, 0.512345678901, 1.5, 29.123456789,
      241.000000000001, 359.999999999,
    ];
    for (const value of samples) {
      const canonical = canonicalNumber(value);
      expect(canonicalNumber(canonical * (1 + 1e-13))).toBe(canonical);
      expect(canonicalNumber(canonical * (1 - 1e-13))).toBe(canonical);
      expect(canonicalNumber(canonical * (1 + 1e-9))).not.toBe(canonical);
      expect(canonicalNumber(canonical * (1 - 1e-9))).not.toBe(canonical);
    }
  });

  it('stabilizes generated floating-point evidence without changing raw canonical JSON', () => {
    const first = { l: 0.51234567890124, c: -0, h: 241.0000000000004 };
    const equivalent = { l: 0.51234567890126, c: 0, h: 241.0000000000002 };

    expect(canonicalJson(first)).not.toBe(canonicalJson(equivalent));
    expect(canonicalHashJson(first)).toBe(canonicalHashJson(equivalent));
    expect(canonicalHashJson(first)).toBe('{"c":0,"h":241,"l":0.512345678901}');
    expect(deterministicContentHash(first)).toBe(deterministicContentHash(equivalent));
    expect(deterministicContentHash({ l: 0.512345679 })).not.toBe(
      deterministicContentHash({ l: 0.512345678 })
    );
  });

  it('applies the policy at every depth of a hashed structure', () => {
    const value = { list: [0.51234567890124, { nested: 241.0000000000004 }], count: 3 };
    expect(canonicalHashJson(value)).toBe('{"count":3,"list":[0.512345678901,{"nested":241}]}');
  });
});
