import { describe, expect, it } from 'vitest';
import type { TextObservation } from './evidence';
import {
  bindCaptureV2,
  parseCaptureV2,
  CAPTURE_V2_VERSION,
  joinAdjacentPdfText,
} from './evidenceV2';
import {
  findPdfTableColors,
  PDF_TABLE_EXTRACTION_VERSION,
  PDF_TABLE_LEGACY_EXTRACTION_VERSION,
} from './pdfTableEvidence';
import { parseSingleStatedDigitalColor } from './numericEvidence';

const cell = (
  id: string,
  text: string,
  x: number,
  y = 20,
  width = 60,
  height = 8,
  page = 1
): TextObservation => ({
  id,
  kind: 'text',
  text,
  locator: { kind: 'pdf', page, bounds: [x, y, width, height] },
});
const source = () => [
  cell('rgb-label', 'RGB', 20, 20, 18),
  cell('hex-label', 'HEX', 20, 36, 18),
  cell('hex-value', '#126E78', 78, 36),
  cell('rgb-value', '19 / 110 / 120', 78),
];
const input = (texts = source()) => ({
  schemaVersion: CAPTURE_V2_VERSION,
  id: 'table',
  kind: 'pdf' as const,
  identity: {
    label: 'Fictional table',
    locator: null,
    revision: null,
    sha256: `sha256:${'a'.repeat(64)}`,
  },
  capturedAt: '2026-09-26T00:00:00Z',
  scope: { total: 1, requested: ['page:1'], inspected: ['page:1'], gaps: [] },
  observations: [
    ...texts,
    ...findPdfTableColors(texts).colors.map(color => ({
      id: 'color',
      kind: 'color' as const,
      method: 'stated-digital' as const,
      ...color,
    })),
  ],
  extractionVersion: PDF_TABLE_EXTRACTION_VERSION,
});

const fragments = (parts = ['019', '-', '110', '-', '120']) => [
  cell('rgb-label', 'RGB:', 20, 20, 24),
  cell('hex-label', 'HEX', 20, 36, 18),
  cell('hex-value', '#126E78', 78, 36),
  ...parts.map((part, index) => cell(`part:${index}`, part, 78 + index * 30, 20, 26)),
];

describe('source-bound PDF table values', () => {
  it('recovers fragmented spaced-hyphen values in spatial order and retains their original witnesses', () => {
    const texts = fragments();
    const result = findPdfTableColors([...texts].reverse());
    expect(result.unresolvedPages.size).toBe(0);
    expect(result.colors).toHaveLength(1);
    expect(result.colors[0]).toMatchObject({
      literal: 'RGB: 019 - 110 - 120',
      value: { hex: '#136E78' },
      evidenceRefs: ['rgb-label', 'part:0', 'part:1', 'part:2', 'part:3', 'part:4'],
      locator: { kind: 'pdf', page: 1, bounds: [20, 20, 204, 8] },
    });
    const captured = bindCaptureV2(input(texts));
    expect(parseCaptureV2(JSON.parse(JSON.stringify(captured)))).toEqual(captured);
    // The new notation belongs only to the versioned spatial witness, not legacy/manual CSS parsing.
    expect(() => parseSingleStatedDigitalColor('RGB: 019 - 110 - 120')).toThrow();
    expect(
      findPdfTableColors(texts, new Set(), PDF_TABLE_LEGACY_EXTRACTION_VERSION).colors
    ).toEqual([]);
    expect(() =>
      bindCaptureV2({ ...input(texts), extractionVersion: PDF_TABLE_LEGACY_EXTRACTION_VERSION })
    ).toThrow();
    expect(() =>
      bindCaptureV2({
        ...input(texts),
        extractionVersion: `${PDF_TABLE_EXTRACTION_VERSION}-future`,
      })
    ).toThrow();
    expect(
      bindCaptureV2({ ...input(), extractionVersion: PDF_TABLE_LEGACY_EXTRACTION_VERSION })
    ).toBeDefined();
  });

  it.each([['019', ',', '110', ',', '120'], ['019 /', '110 /', '120'], ['019 - 110 - 120']])(
    'accepts one complete expression across supported fragment boundaries: %j',
    (...parts) => {
      expect(findPdfTableColors(fragments(parts)).colors[0]?.value.hex).toBe('#136E78');
    }
  );

  it.each([
    ['019', '-', '110'],
    ['019', '-', '110', '-', '120', '-', '25'],
    ['019', '-', '110', '-', '120', 'alpha', '.5'],
    ['019', '-', '110', '-', '120', '/ 50%'],
    ['0.1', '-', '0.4', '-', '0.5'],
    ['-019', '-', '110', '-', '120'],
    ['256', '-', '110', '-', '120'],
    ['019', '-', '110', '/', '120'],
    ['019-110-120'],
    ['019', '-', '110', '-', '120', 'px'],
    ['019', '-', '110', '-', '120', 'a', 'b', 'c'],
    ['019 - 110 - 120 / calc(.5)'],
    ['url(', '019', '-', '110', '-', '120', ')'],
  ])(
    'reports incomplete or unsupported labeled expressions without rescuing a prefix: %j',
    (...parts) => {
      expect(findPdfTableColors(fragments(parts))).toEqual({
        colors: [],
        unresolvedPages: new Set([1]),
      });
    }
  );

  it('rejects fragment witness tampering and ambiguous or interrupted geometry', () => {
    for (const extra of [
      cell('prefix', 'url(', 2, 20, 16),
      cell('overlap', '110', 138, 20, 26),
      cell('suffix', '/ 50%', 226, 18, 35, 6),
      cell('second-label', 'RGB', 46, 20, 18),
    ])
      expect(findPdfTableColors([...fragments(), extra]).colors).toEqual([]);
    for (const change of [
      (draft: ReturnType<typeof input>) => {
        draft.observations = draft.observations.filter(item => item.id !== 'part:3');
      },
      (draft: ReturnType<typeof input>) => {
        const c = draft.observations.at(-1)!;
        if (c.kind === 'color') c.literal = 'RGB: 19 - 110 - 120';
      },
      (draft: ReturnType<typeof input>) => {
        const c = draft.observations.at(-1)!;
        if (c.kind === 'color')
          c.value = { ...c.value, components: { ...c.value.components, r: 20 / 255 } };
      },
      (draft: ReturnType<typeof input>) => {
        const c = draft.observations.at(-1)!;
        if (c.kind === 'color') c.evidenceRefs.reverse();
      },
      (draft: ReturnType<typeof input>) => {
        const c = draft.observations.at(-1)!;
        if (c.kind === 'color') c.locator.bounds[2]--;
      },
    ]) {
      const draft = input(fragments());
      change(draft);
      expect(() => bindCaptureV2(draft)).toThrow();
    }
    const zero = input(fragments(['000', '-', '110', '-', '120']));
    const last = zero.observations.at(-1)!;
    if (last.kind === 'color')
      last.value = { ...last.value, components: { ...last.value.components, r: -0 } };
    expect(() => bindCaptureV2(zero)).toThrow();
  });

  it('keeps tightly stacked nonoverlapping rows separate while retaining overlapping obstructions', () => {
    const texts = fragments();
    texts[1] = cell('hex-label', 'HEX', 20, 28.5, 24);
    texts[2] = cell('hex-value', '#126E78', 78, 28.5);
    expect(findPdfTableColors(texts).colors[0]?.value.hex).toBe('#136E78');
    expect(findPdfTableColors([...texts, cell('extra', '/ 50%', 226, 27.9, 30)]).colors).toEqual(
      []
    );
  });

  it('recovers the explicit label/value cells without changing text order or other specifications', () => {
    const texts = source();
    const result = findPdfTableColors(texts);
    expect(texts.map(item => item.id)).toEqual([
      'rgb-label',
      'hex-label',
      'hex-value',
      'rgb-value',
    ]);
    expect(result.unresolvedPages.size).toBe(0);
    expect(result.colors).toHaveLength(1);
    expect(result.colors[0]).toMatchObject({
      literal: 'RGB 19 / 110 / 120',
      syntax: 'rgb',
      value: { hex: '#136E78', components: { r: 19 / 255, g: 110 / 255, b: 120 / 255 } },
      evidenceRefs: ['rgb-label', 'rgb-value'],
      locator: { kind: 'pdf', page: 1, bounds: [20, 20, 118, 8] },
    });
    const captured = bindCaptureV2(input());
    expect(parseCaptureV2(JSON.parse(JSON.stringify(captured)))).toEqual(captured);
  });

  it.each([
    ['intervening label', cell('other', 'CMYK', 40, 20, 25)],
    ['overlapping copy', cell('other', 'RGB', 20, 20, 18)],
    ['second value', cell('other', '18 / 110 / 120', 95, 20, 60)],
    ['near prefix', cell('other', 'url(', 2, 20, 16)],
    ['extra channel', cell('other', '/ 50%', 140, 20, 30)],
    ['raised suffix', cell('other', '/ .5', 140, 18, 20, 6)],
  ])('does not rescue a value through %s', (_name, obstruction) => {
    const result = findPdfTableColors([...source(), obstruction]);
    expect(result.colors).toEqual([]);
    expect(result.unresolvedPages.has(1)).toBe(true);
  });

  it.each(['0.1 / 0.4 / 0.5', '256 / 0 / 0', '19 / 110 / 120 / 50', '19, 110 / 120'])(
    'retains unsupported cell notation as unresolved: %s',
    text => {
      const texts = source();
      texts[3].text = text;
      expect(findPdfTableColors(texts)).toEqual({ colors: [], unresolvedPages: new Set([1]) });
    }
  );

  it('requires a supported label, nearby aligned cell, matching boxes and the same page', () => {
    for (const changed of [
      cell('rgb-label', 'CMYK', 20, 20, 18),
      cell('rgb-value', '19 / 110 / 120', 400),
      cell('rgb-value', '19 / 110 / 120', 78, 38),
      cell('rgb-value', '19 / 110 / 120', 78, 20, 60, 14),
      cell('rgb-value', '19 / 110 / 120', 78, 20, 60, 8, 2),
    ]) {
      const texts = source().map(item => (item.id === changed.id ? changed : item));
      expect(findPdfTableColors(texts).colors).toEqual([]);
    }
    expect(findPdfTableColors([cell('heading', 'RGB', 20, 20, 18)])).toEqual({
      colors: [],
      unresolvedPages: new Set(),
    });
  });

  it('keeps existing and future extraction versions on the old strict path', () => {
    for (const extractionVersion of [
      'teul.pdf-evidence.v2/pdfjs-6.3.289',
      `${PDF_TABLE_EXTRACTION_VERSION}-future`,
    ])
      expect(() => bindCaptureV2({ ...input(), extractionVersion })).toThrow('cited source text');
  });

  it('rederives the full spatial witness and rejects changed references, values, bounds and context', () => {
    for (const mutate of [
      (draft: ReturnType<typeof input>) => {
        const color = draft.observations.at(-1)!;
        if (color.kind === 'color') color.evidenceRefs.reverse();
      },
      (draft: ReturnType<typeof input>) => {
        const color = draft.observations.at(-1)!;
        if (color.kind === 'color') color.locator.bounds[0]++;
      },
      (draft: ReturnType<typeof input>) => {
        const text = draft.observations[3];
        if (text.kind === 'text') text.text = '20 / 110 / 120';
      },
      (draft: ReturnType<typeof input>) => {
        draft.observations.push(cell('suffix', '/ 0.5', 140));
      },
    ]) {
      const draft = input();
      mutate(draft);
      expect(() => bindCaptureV2(draft)).toThrow();
    }
  });

  it('does not admit spatial colors from incomplete or nonhorizontal pages', () => {
    expect(findPdfTableColors(source(), new Set([1])).colors).toEqual([]);
    for (const code of ['TEXT_LIMIT', 'EXTRACTION_FAILED'] as const)
      expect(() =>
        bindCaptureV2({
          ...input(),
          scope: {
            ...input().scope,
            gaps: [{ scope: 'page:1', code, message: 'Spatial evidence unavailable.' }],
          },
        })
      ).toThrow('cited source text');
  });

  it('rejects overflowing cell edges or union bounds, including forged null JSON locators', () => {
    const max = Number.MAX_VALUE;
    for (const texts of [
      [
        cell('rgb-label', 'RGB', -max, max, 18, max),
        cell('rgb-value', '19 / 110 / 120', -max, max, 60, max),
      ],
      [cell('rgb-label', 'RGB', -max, 20, max), cell('rgb-value', '19 / 110 / 120', 0, 20, max)],
    ]) {
      expect(findPdfTableColors(texts).colors).toEqual([]);
      expect(joinAdjacentPdfText(texts)).toBeNull();
      const draft = input();
      draft.observations = [...texts, draft.observations.at(-1)!];
      const color = draft.observations.at(-1)!;
      const label = texts[0].locator;
      const value = texts[1].locator;
      if (color.kind === 'color' && label.kind === 'pdf' && value.kind === 'pdf')
        color.locator.bounds = [
          label.bounds[0],
          label.bounds[1],
          value.bounds[0] + value.bounds[2] - label.bounds[0],
          Math.max(label.bounds[1] + label.bounds[3], value.bounds[1] + value.bounds[3]) -
            label.bounds[1],
        ];
      expect(() => bindCaptureV2(JSON.parse(JSON.stringify(draft)))).toThrow();
    }
  });

  it('fails closed for the whole page when the bounded search cannot establish all label owners', () => {
    const texts = [
      ...source(),
      ...Array.from({ length: 1000 }, (_, i) => cell(`heading:${i}`, 'RGB', 20, 100 + i * 20, 18)),
    ];
    const result = findPdfTableColors(texts);
    expect(result.colors).toEqual([]);
    expect(result.unresolvedPages).toEqual(new Set([1]));
  });
});
