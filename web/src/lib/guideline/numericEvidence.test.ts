import { describe, expect, it } from 'vitest';
import { colorSystemSrgbToCssV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import {
  parseSingleStatedDigitalColor,
  statedDigitalColorOccurrences,
  statedDigitalColors,
} from './numericEvidence';

describe('stated digital color numeric evidence', () => {
  it('returns exact lexer offsets without rescuing an earlier identical nested literal', () => {
    const prefix = '🎨 color(display-p3 #ABC); ';
    const source = `${prefix}#ABC; #ABC; rgb(18 110 120 / 75%)`;
    const occurrences = statedDigitalColorOccurrences(source);
    const first = prefix.length;
    const second = first + '#ABC; '.length;
    const third = second + '#ABC; '.length;
    expect(occurrences.map(({ literal, start, end }) => ({ literal, start, end }))).toEqual([
      { literal: '#ABC', start: first, end: first + 4 },
      { literal: '#ABC', start: second, end: second + 4 },
      { literal: 'rgb(18 110 120 / 75%)', start: third, end: source.length },
    ]);
    expect(occurrences.every(item => source.slice(item.start, item.end) === item.literal)).toBe(
      true
    );
    expect(occurrences.map(({ start: _start, end: _end, ...color }) => color)).toEqual(
      statedDigitalColors(source)
    );
    expect(statedDigitalColors(source).every(item => !('start' in item) && !('end' in item))).toBe(
      true
    );
  });

  it('keeps source ranges exact for labeled notation, whitespace and unsupported atomic functions', () => {
    const prefix = 'ignored color-mix(in srgb, #ABC, rgb(0 0 0));\n';
    const first = 'HEX code = #AbC';
    const middle = '; RGB 18 / 110 / 120; ';
    const last = 'color(srgb .123456789012341 .5 .75 / .3333333333333333)';
    const source = prefix + first + middle + last;
    const occurrences = statedDigitalColorOccurrences(source);
    expect(occurrences.map(item => [item.start, item.end])).toEqual([
      [prefix.length, prefix.length + first.length],
      [prefix.length + first.length + 2, prefix.length + first.length + middle.length - 2],
      [source.length - last.length, source.length],
    ]);
    expect(occurrences.every(item => source.slice(item.start, item.end) === item.literal)).toBe(
      true
    );
    expect(statedDigitalColorOccurrences('color(display-p3 #ABC')).toEqual([]);
  });

  it('retains supported legacy hex markers, source order and duplicate occurrences', () => {
    const values = statedDigitalColors(
      'HEX: 123ABC and #abc; hex code = 987654; HEX #aBc; #123ABC'
    );
    expect(values.map(item => [item.literal, item.syntax, item.value.hex])).toEqual([
      ['HEX: 123ABC', 'hex', '#123ABC'],
      ['#abc', 'hex', '#AABBCC'],
      ['hex code = 987654', 'hex', '#987654'],
      ['HEX #aBc', 'hex', '#AABBCC'],
      ['#123ABC', 'hex', '#123ABC'],
    ]);
    expect(statedDigitalColors('decade cafe deadbeef abc1234 #12345678 #abcd')).toEqual([]);
  });

  it.each(['RGB: 18, 110, 120', 'RGB 18 / 110 / 120', 'rgb = 18,110,120'])(
    'reads explicitly labeled byte channels: %s',
    literal => {
      const parsed = parseSingleStatedDigitalColor(literal);
      expect(parsed.literal).toBe(literal);
      expect(parsed.syntax).toBe('rgb');
      const expected = [18, 110, 120];
      expect(parsed.value.components).toEqual({
        r: expected[0] / 255,
        g: expected[1] / 255,
        b: expected[2] / 255,
      });
      expect(statedDigitalColors(`Primary: ${literal}; supporting examples.`)).toEqual([parsed]);
    }
  );

  it.each([
    ['rgb(18,110,120)', [18 / 255, 110 / 255, 120 / 255], 1],
    [
      'rgba(18.25,110.5,120.75,.3333333333333333)',
      [18.25 / 255, 110.5 / 255, 120.75 / 255],
      0.3333333333333333,
    ],
    ['rgb(10%,20%,30%,25%)', [0.1, 0.2, 0.3], 0.25],
    ['rgba(10% 20% 30% / 25%)', [0.1, 0.2, 0.3], 0.25],
    ['rgb(10% 20 30% / .5)', [0.1, 20 / 255, 0.3], 0.5],
    ['rgb(+18 1.1e2 1.20E2)', [18 / 255, 110 / 255, 120 / 255], 1],
    ['rgba(0,0,0)', [0, 0, 0], 1],
    [
      'color(srgb .123456789012341 .5 .75 / .3333333333333333)',
      [0.123456789012341, 0.5, 0.75],
      0.3333333333333333,
    ],
    ['color(srgb 10% .5 75% / 33.3%)', [0.1, 0.5, 0.75], 33.3 / 100],
    ['RGB(18\n110\t120 / 100%)', [18 / 255, 110 / 255, 120 / 255], 1],
  ] as const)('preserves supported CSS numeric syntax %s', (literal, channels, alpha) => {
    const parsed = parseSingleStatedDigitalColor(literal);
    expect(parsed.literal).toBe(literal);
    expect(parsed.value.components).toEqual({ r: channels[0], g: channels[1], b: channels[2] });
    expect(parsed.value.alpha).toBe(alpha);
    expect(statedDigitalColors(`Swatch ${literal}.`)).toEqual([parsed]);
  });

  it('keeps same-display-hex native values and their precision identities distinct', () => {
    const a = parseSingleStatedDigitalColor(
      'color(srgb .123456789012341 .5 .75 / .3333333333333333)'
    );
    const b = parseSingleStatedDigitalColor(
      'color(srgb .123456789012342 .5 .75 / .3333333333333334)'
    );
    expect(a.value.hex).toBe(b.value.hex);
    expect(a.value.components.r).not.toBe(b.value.components.r);
    expect(a.value.alpha).not.toBe(b.value.alpha);
    expect(a.value.representation?.exactValueHash).not.toBe(b.value.representation?.exactValueHash);
    expect(colorSystemSrgbToCssV1(a.value)).toBe(
      'color(srgb 0.123456789012341 0.5 0.75 / 0.3333333333333333)'
    );
    expect(statedDigitalColors(`${a.literal}; ${b.literal}`)).toHaveLength(2);
  });

  it.each([
    '18,110,120',
    '18 / 110 / 120',
    'RGB18,110,120',
    'sRGB 0.1 0.2 0.3',
    'RGB: 18,110,120,0.5',
    'RGB: 18/110/120/.5',
    'RGB: 18,110,120 / .5',
    'RGB: 18%,110%,120%',
    'RGB: 18,110/120',
    'RGB: 18 110 120',
    'RGB 0.1 / 0.4 / 0.5',
    'rgb: 18.25 / 110.5 / 120.75',
    'RGB: 18.0,110,120',
    'RGB: 18,1.1e2,120',
    'rgb(256 0 0)',
    'rgb(-.1 0 0)',
    'rgb(0 0 0 / 1.01)',
    'rgb(0 0 0 / -1%)',
    'rgba(0,0,0,101%)',
    'rgb(10%,20,30%)',
    'rgb(10%,20%,30% / .5)',
    'rgb(0 0 0 .5)',
    'rgb(0 0 / .5)',
    'rgb(0 0 0 / .5 / .4)',
    'rgb(0 0 0 /)',
    'rgb(0 0 0, .5)',
    'rgb(0,,0)',
    'rgb(0 0 0 / 50 %)',
    'rgb(none 0 0)',
    'rgb(from #123456 r g b)',
    'rgb(calc(10 + 20) 0 0)',
    'rgb(0x10 0 0)',
    'rgb(NaN 0 0)',
    'rgb(Infinity 0 0)',
    'rgb(1e999 0 0)',
    'rgb(1e-999 0 0)',
    'rgb(5e-324 0 0)',
    'rgb(1. 0 0)',
    'rgb (0 0 0)',
    'rgb(\u00a00 0 0)',
    'rgb(0 0 0 / \u00a0.5)',
    'color(srgb 1.001 .5 .5)',
    'color(srgb .1 .2 .3 / 1.001)',
    'color(srgb .1,.2,.3)',
    'color(srgb .1 .2 .3 .4)',
    'color(display-p3 .1 .2 .3)',
    'CMYK: 1,2,3,4',
    'Pantone 2020 C',
    '#12345678',
    '#ABCZ',
    'hexabc',
    'hex codeabc',
  ])('does not reinterpret unsupported or malformed notation: %s', literal => {
    expect(() => parseSingleStatedDigitalColor(literal)).toThrow();
    expect(statedDigitalColors(literal)).toEqual([]);
  });

  it('never rescues embedded codes or nested function fragments from malformed expressions', () => {
    for (const literal of [
      'rgb(256,0,0,#123456)',
      'rgba(rgb(0 0 0),.5)',
      'color(display-p3 rgb(0 0 0))',
      'color-mix(in srgb, #123456, rgb(0 0 0))',
      'rgb(0 0 0 #abc',
      'rgb(0 0 0)extra',
      'brand-rgb(0 0 0)',
      '漢rgb(0 0 0)',
      'url(#abcdef)',
      'https://example.test/#abcdef',
      'token#abcdef',
      '#abcdef_suffix',
      'RGB: 18,110,120px',
      'RGB: 18,110,120 %',
      'RGB: 18,110,120 alpha .5',
    ])
      expect(statedDigitalColors(literal)).toEqual([]);
    expect(
      statedDigitalColors('rgb(256 0 0); #ABC; color(display-p3 1 0 0); RGB: 18,110,120')
    ).toHaveLength(2);
  });

  it('single-value confirmation requires the entire trimmed input and preserves its literal', () => {
    expect(parseSingleStatedDigitalColor(' \n RGB: 18, 110, 120 \t').literal).toBe(
      'RGB: 18, 110, 120'
    );
    for (const literal of [
      'Primary #123456',
      '#123456 #123456',
      '#123456.',
      'rgb(0 0 0) note',
      'RGB: 18,110,120;',
    ])
      expect(() => parseSingleStatedDigitalColor(literal)).toThrow();
  });

  it('finds explicitly marked parenthetical swatches and sentence-final labeled RGB', () => {
    expect(
      statedDigitalColors('Primary (#ABC); secondary (RGB: 18,110,120). RGB: 0,0,0.').map(
        item => item.value.hex
      )
    ).toEqual(['#AABBCC', '#126E78', '#000000']);
    expect(statedDigitalColors('a'.repeat(99_980) + ' #ABC').map(item => item.value.hex)).toEqual([
      '#AABBCC',
    ]);
  });

  it('bounds hostile inputs without invoking object coercion and returns independent values', () => {
    expect(() => statedDigitalColors('a'.repeat(100001))).toThrow('bounded text');
    expect(() => statedDigitalColors('\0#123456')).toThrow('bounded text');
    const poison = {
      toString() {
        throw new Error('coerced');
      },
    };
    expect(() => statedDigitalColors(poison as unknown as string)).toThrow('bounded text');
    const duplicate = statedDigitalColors('#ABC #ABC');
    (duplicate[0].value.components as { r: number }).r = 0;
    expect(duplicate[1].value.components.r).toBe(170 / 255);
  });
});
