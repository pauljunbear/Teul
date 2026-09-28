/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { capturePdfPages, openGuidelinePdf, type GuidelinePdf } from './pdf';
import { capturePdfPagesV2 } from './pdfV2';
import { parseCaptureV2 } from './evidenceV2';

const fixture = async (name: string) =>
  new Uint8Array(await readFile(new URL(`../../../fixtures/guidelines/${name}`, import.meta.url)));

function pdfFromTextPieces(pieces: readonly string[]): GuidelinePdf {
  return {
    name: 'Split source',
    sha256: `sha256:${'b'.repeat(64)}`,
    pageCount: 1,
    close: async () => {},
    document: {
      getPage: async () => ({
        getViewport: () => ({ convertToViewportPoint: (x: number, y: number) => [x, y] }),
        cleanup: () => {},
        streamTextContent: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue({
                items: pieces.map((str, index) => ({
                  str,
                  width: 120,
                  height: 12,
                  transform: [12, 0, 0, 12, 10 + index * 124, 20],
                })),
              });
              controller.close();
            },
          }),
      }),
    },
  } as unknown as GuidelinePdf;
}

describe('native numeric PDF capture', () => {
  it('reads actual spaced-hyphen and comma fragments, preserves conflicts and warns on malformed rows', async () => {
    const pdf = await openGuidelinePdf(await fixture('harbor-fragments.pdf'), 'Fragment source');
    try {
      const capture = await capturePdfPagesV2(pdf, [1, 2]);
      const colors = capture.observations.filter(item => item.kind === 'color');
      const rgb = colors.filter(item => item.syntax === 'rgb');
      expect(rgb.map(item => item.literal)).toEqual([
        'RGB: 018 - 110 - 120',
        'RGB: 019 - 110 - 120',
        'RGB: 018 , 110 , 120',
      ]);
      expect(rgb.map(item => item.value.hex)).toEqual(['#126E78', '#136E78', '#126E78']);
      expect(rgb.map(item => item.evidenceRefs.length)).toEqual([6, 6, 6]);
      expect(colors.filter(item => item.syntax === 'hex')).toHaveLength(8);
      expect(capture.scope.gaps).toEqual([
        expect.objectContaining({ scope: 'page:2:table-values', code: 'EXTRACTION_FAILED' }),
      ]);
      expect(parseCaptureV2(JSON.parse(JSON.stringify(capture)))).toEqual(capture);
    } finally {
      await pdf.close();
    }
  });

  it('recovers nonconsecutive native table cells, preserves conflicts and reports unsafe rows', async () => {
    const pdf = await openGuidelinePdf(await fixture('harbor-table.pdf'), 'Table source');
    try {
      const capture = await capturePdfPagesV2(pdf, [1, 2, 3]);
      const colors = capture.observations.filter(item => item.kind === 'color');
      const table = colors.filter(item => item.id.endsWith(':digital:table'));
      expect(table.map(item => item.literal)).toEqual(['RGB 18 / 110 / 120', 'RGB 19 / 110 / 120']);
      expect(table.map(item => item.value.hex)).toEqual(['#126E78', '#136E78']);
      expect(colors.filter(item => item.syntax === 'hex').map(item => item.value.hex)).toEqual([
        '#126E78',
        '#126E78',
        '#126E78',
      ]);
      const texts = capture.observations.filter(item => item.kind === 'text');
      for (const color of table) {
        const indices = color.evidenceRefs.map(ref => texts.findIndex(item => item.id === ref));
        expect(indices[1] - indices[0]).toBeGreaterThan(1);
        expect(color.locator).toMatchObject({ kind: 'pdf', page: 1 });
      }
      expect(capture.scope.gaps).toEqual([
        expect.objectContaining({
          scope: 'page:3',
          code: 'EXTRACTION_FAILED',
          message: expect.stringContaining('rotated'),
        }),
        expect.objectContaining({ scope: 'page:2:table-values', code: 'EXTRACTION_FAILED' }),
      ]);
      expect(parseCaptureV2(JSON.parse(JSON.stringify(capture)))).toEqual(capture);
    } finally {
      await pdf.close();
    }
  });

  it('captures selected pages with precision, alpha and conservatively joined source evidence', async () => {
    const pdf = await openGuidelinePdf(await fixture('harbor-numeric.pdf'), 'Numeric source');
    try {
      const capture = await capturePdfPagesV2(pdf, [3, 1, 2, 1]);
      const colors = capture.observations.filter(item => item.kind === 'color');
      expect(colors).toHaveLength(9);
      expect(colors.map(item => item.syntax)).toEqual([
        'rgb',
        'rgb',
        'rgb',
        'rgb',
        'srgb',
        'srgb',
        'rgb',
        'hex',
        'rgb',
      ]);
      expect(colors[1].value.components.r).toBe(12.5 / 255);
      expect(colors.slice(0, 4).map(item => item.value.alpha)).toEqual([1, 0.75, 0.5, 0.25]);
      expect(colors[4].value.components.r).toBe(0.123456789012345);
      expect(colors[5].value.components.r).toBe(0.123456789012346);
      expect(colors[4].value.hex).toBe(colors[5].value.hex);
      expect(colors[4].value.representation?.exactValueHash).not.toBe(
        colors[5].value.representation?.exactValueHash
      );
      const joined = colors[6];
      expect(joined.literal).toBe('RGB 18, 110, 120');
      expect(joined.evidenceRefs).toHaveLength(4);
      const refs = capture.observations.filter(item => joined.evidenceRefs.includes(item.id));
      expect(refs.map(item => (item.kind === 'text' ? item.text : null))).toEqual([
        'RGB',
        '18,',
        '110,',
        '120',
      ]);
      if (joined.locator.kind !== 'pdf') throw new Error('Expected PDF locator');
      expect(joined.locator.page).toBe(2);
      expect(joined.locator.bounds[0]).toBe(40);
      expect(joined.locator.bounds[2]).toBeCloseTo(102.016);
      expect(parseCaptureV2(JSON.parse(JSON.stringify(capture)))).toEqual(capture);
      expect(capture.scope.inspected).toEqual(['page:1', 'page:2', 'page:3']);
      expect(capture.scope.gaps).toContainEqual(expect.objectContaining({ code: 'NOT_INSPECTED' }));
      const retained = capture.observations
        .filter(item => item.kind === 'text')
        .map(item => item.text)
        .join('\n');
      expect(retained).toContain('CMYK 85, 25, 35, 10');
      expect(retained).toContain('PANTONE 7716 C');
      expect(retained).toContain('color(display-p3 0.1 0.8 0.3)');
      expect(retained).not.toContain('UNSELECTED_NUMERIC_SENTINEL');
      expect(colors.some(item => /cmyk|pantone|display-p3/i.test(item.literal))).toBe(false);
    } finally {
      await pdf.close();
    }
  });

  it('retains invalid and ambiguous expressions only as source text', async () => {
    const pdf = await openGuidelinePdf(await fixture('harbor-numeric.pdf'), 'Invalid expressions');
    try {
      const capture = await capturePdfPagesV2(pdf, [4]);
      expect(capture.observations.filter(item => item.kind === 'color')).toEqual([]);
      expect(
        capture.observations.some(item => item.kind === 'text' && item.text === 'rgb(256 110 120)')
      ).toBe(true);
      await expect(capturePdfPagesV2(pdf, [0])).rejects.toThrow('Select between');
    } finally {
      await pdf.close();
    }
  });

  it('preserves V1 hex identities and never promotes scanned pixels', async () => {
    const pdf = await openGuidelinePdf(await fixture('harbor-native.pdf'), 'Original fixture');
    try {
      const old = await capturePdfPages(pdf, [1]);
      const capture = await capturePdfPagesV2(pdf, [1]);
      expect(
        capture.observations.filter(item => item.kind === 'color').map(item => item.id)
      ).toEqual(old.observations.filter(item => item.kind === 'color').map(item => item.id));
      expect(capture.observations.filter(item => item.kind === 'text')).toEqual(
        old.observations.filter(item => item.kind === 'text')
      );
    } finally {
      await pdf.close();
    }
    const scanned = await openGuidelinePdf(await fixture('harbor-scanned.pdf'), 'Scanned');
    try {
      const capture = await capturePdfPagesV2(scanned, [1]);
      expect(capture.observations.filter(item => item.kind === 'color')).toEqual([]);
      expect(capture.scope.gaps).toContainEqual(expect.objectContaining({ code: 'NO_TEXT' }));
    } finally {
      await scanned.close();
    }
  });

  it.each([
    [false, ', 99'],
    [false, '/ 0.5'],
    [false, '42'],
    [false, '%'],
    [true, ', 99'],
    [true, '/ 0.5'],
    [true, '42'],
    [true, '%'],
    [true, 'Ocean'],
  ] as const)(
    'checks adjacent suffixes for complete item %s and suffix %s',
    async (complete, suffix) => {
      const pieces = complete
        ? ['RGB 18, 110, 120', suffix]
        : ['RGB', '18,', '110,', '120', suffix];
      const mockPdf = pdfFromTextPieces(pieces);
      const capture = await capturePdfPagesV2(mockPdf, [1]);
      expect(capture.observations.filter(item => item.kind === 'color')).toHaveLength(
        suffix === 'Ocean' ? 1 : 0
      );
      expect(capture.observations.filter(item => item.kind === 'text')).toHaveLength(pieces.length);
    }
  );

  it.each([
    [['color(display-p3', 'rgb(18 110 120)'], 0],
    [['rgb(256 0 0', '#123456'], 0],
    [['color(display-p3', '#123456'], 0],
    [['url(', '#abcdef'], 0],
    [['Accent: color(display-p3', '#123456'], 0],
    [['#123456', 'color(display-p3', '#123456'], 1],
    [['rgb(18 110 120)', 'color(display-p3', 'rgb(18 110 120)'], 1],
    [['Ocean', 'rgb(18 110 120)'], 1],
    [['url(', 'a', 'b', 'c', 'd', 'e', 'f', 'g', '#123456'], 0],
  ] as const)('retains scanner atomicity across adjacent fragments %j', async (pieces, count) => {
    const capture = await capturePdfPagesV2(pdfFromTextPieces(pieces), [1]);
    const colors = capture.observations.filter(item => item.kind === 'color');
    expect(colors).toHaveLength(count);
    expect(parseCaptureV2(JSON.parse(JSON.stringify(capture)))).toEqual(capture);
    if (count === 1 && pieces.length > 2) expect(colors[0].evidenceRefs[0]).toContain(':1:0:text');
  });

  it('rejects encrypted, malformed and cancelled PDFs through the existing parser boundary', async () => {
    await expect(
      openGuidelinePdf(await fixture('harbor-encrypted.pdf'), 'Encrypted')
    ).rejects.toThrow('encrypted');
    await expect(openGuidelinePdf(new TextEncoder().encode('hello'), 'Invalid')).rejects.toThrow(
      'not a PDF'
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      openGuidelinePdf(await fixture('harbor-numeric.pdf'), 'Cancelled', {
        signal: controller.signal,
      })
    ).rejects.toThrow();
  });
});
