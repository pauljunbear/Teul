import { describe, expect, it } from 'vitest';
import {
  layoutCompositionText,
  placeCompositionText,
  type CompositionTextInput,
} from './compositionText';
import { measureColorSystemApplicationGeometryBoardsV1 } from '../../../../src/lib/colorSystemApplicationGeometryV1';
import atlas from './compositionGlyphsV1.json';

const input: CompositionTextInput = {
  text: 'A clearer direction',
  fontSize: 28,
  weight: 600,
  lineHeight: 38,
  width: 300,
  maximumLines: 3,
};
const measured = (value: ReturnType<typeof layoutCompositionText>) =>
  measureColorSystemApplicationGeometryBoardsV1([
    {
      applicationId: 'panel',
      width: value.width + 48,
      height: value.height + 48,
      root: {
        id: 'ground',
        useId: 'ground',
        shape: { kind: 'rect', x: 0, y: 0, width: value.width + 48, height: value.height + 48 },
        children: [
          {
            id: 'copy',
            useId: 'text',
            textAlternative: value.input.text,
            shape: placeCompositionText(value, 24, 24),
            children: [],
          },
        ],
      },
    },
  ]);

describe('composition text artwork', () => {
  it.each(['YYYY', '1⁄2', 'ÎÎ', 'ÝÝ', 'office effectiveness coffee', 'B8@&'])(
    'preserves overlapping glyph ink in %s without changing letter spacing',
    text => {
      const result = layoutCompositionText({ ...input, text, width: 1000 });
      expect(result.input.text).toBe(text);
      expect(() => measured(result)).not.toThrow();
      expect(layoutCompositionText(result.input)).toEqual(result);
    }
  );
  it('measures every supported visible glyph at both size bounds and weights', () => {
    for (const weight of [400, 600] as const)
      for (const fontSize of [14, 48])
        for (const codepoint of Object.keys(atlas.faces[String(weight) as '400' | '600'].glyphs)) {
          const text = String.fromCodePoint(Number(codepoint));
          if (!text.trim()) continue;
          expect(
            () =>
              measured(
                layoutCompositionText({
                  ...input,
                  text,
                  weight,
                  fontSize,
                  lineHeight: Math.ceil(fontSize * 1.4),
                  width: 200,
                })
              ),
            `${weight}/${fontSize}/U+${Number(codepoint).toString(16)}`
          ).not.toThrow();
        }
  });
  it('reconstructs authored copy deterministically into the existing measured geometry', () => {
    const first = layoutCompositionText(input);
    expect(layoutCompositionText(JSON.parse(JSON.stringify(input)))).toEqual(first);
    expect(first.artwork.font.family).toBe('Geist');
    expect(first.artwork.compilation.disclosure).toContain('not exact font curves');
    expect(measured(first).areas.find(area => area.useId === 'text')!.area).toBeGreaterThan(0);
    expect(Object.isFrozen(first.shape)).toBe(true);
  });
  it('wraps actual copy without losing characters, including hard breaks and punctuation', () => {
    const text = 'A new direction.  Clearer choices.\nRead the evidence — then decide.';
    const result = layoutCompositionText({
      ...input,
      text,
      fontSize: 16,
      weight: 400,
      lineHeight: 24,
      width: 160,
      maximumLines: 8,
    });
    expect(result.input.text).toBe(text);
    expect(result.lines.map(line => line.text).join('')).toBe(text.replaceAll('\n', ''));
    expect(result.lines.length).toBeGreaterThan(2);
    expect(result.lines.every(line => line.inkWidth <= 160)).toBe(true);
    expect(measured(result).boards[0].root.children[0].textAlternative).toBe(text);
    expect(result.minimumContrast).toBe(4.5);
  });
  it.each([14, 16, 18, 24, 28, 32, 48])(
    'keeps %ipx regular and semibold glyphs on the measured grid',
    fontSize => {
      for (const weight of [400, 600] as const) {
        const result = layoutCompositionText({
          ...input,
          text: 'Agj 0123 £€ @& —',
          fontSize,
          weight,
          lineHeight: Math.ceil(fontSize * 1.4),
          width: 1000,
        });
        expect(measured(result).areas.length).toBe(2);
        if (result.shape.kind !== 'compound-polygon') throw new Error('Expected paths');
        expect(
          result.shape.contours
            .flat()
            .every(point => Number.isInteger(point.x * 64) && Number.isInteger(point.y * 64))
        ).toBe(true);
        expect(result.minimumContrast).toBe(fontSize >= 24 ? 3 : 4.5);
      }
    }
  );
  it.each([
    { text: 'Text\twith tabs' },
    { text: 'Missing 中文' },
    { text: 'Combining a\u0301' },
    { text: ' ' },
    { text: 'x'.repeat(257) },
    { fontSize: 13 },
    { weight: 700 },
    { width: 15 },
    { width: 1.1 },
    { maximumLines: 0 },
    { lineHeight: 28 },
    { maximumLines: 1, width: 30 },
    { text: 'unbreakableword', width: 20 },
    { unknown: true },
  ])('refuses unsupported or overflowing input without substituting copy: %j', mutation => {
    expect(() =>
      layoutCompositionText({ ...input, ...mutation } as CompositionTextInput)
    ).toThrow();
  });
  it('preserves blank lines and refuses overflow instead of silently hiding text', () => {
    const result = layoutCompositionText({ ...input, text: 'First\n\nLast' });
    expect(result.lines).toHaveLength(3);
    expect(result.height).toBe(114);
    expect(() =>
      layoutCompositionText({ ...input, text: 'First\n\nLast', maximumLines: 2 })
    ).toThrow('line count');
  });
  it('binds copy, box, weight and size to different artwork identities', () => {
    const base = layoutCompositionText(input).textHash;
    for (const mutation of [
      { text: 'A clearer result' },
      { width: 320 },
      { weight: 400 },
      { fontSize: 27 },
    ])
      expect(
        layoutCompositionText({ ...input, ...mutation } as CompositionTextInput).textHash
      ).not.toBe(base);
  });
  it('refuses invalid placement and cannot silently change the retained text', () => {
    const result = layoutCompositionText(input);
    expect(() => placeCompositionText(result, 0.01, 0)).toThrow('1/64');
    expect(() => placeCompositionText(result, -1, 0)).toThrow('nonnegative');
    expect(() => {
      (result.input as { text: string }).text = 'Changed';
    }).toThrow();
  });
});
