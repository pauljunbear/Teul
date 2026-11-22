/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { capturePdfPages, openGuidelinePdf } from './pdf';

const fixture = async (name: string) =>
  new Uint8Array(await readFile(new URL(`../../../fixtures/guidelines/${name}`, import.meta.url)));

describe('bounded PDF source capture', () => {
  it('retains printed values and source positions without reading unselected pages', async () => {
    const bytes = await fixture('harbor-native.pdf');
    const originalLength = bytes.byteLength;
    const pdf = await openGuidelinePdf(bytes, 'Harbor fixture');
    try {
      expect(pdf.pageCount).toBe(3);
      const capture = await capturePdfPages(pdf, [2, 1, 1]);
      expect(bytes.byteLength).toBe(originalLength);
      const colors = capture.observations.filter(item => item.kind === 'color');
      expect(colors.map(item => item.value)).toEqual(['#126E78', '#ECBF74', '#F4EFE6', '#182E34']);
      expect(capture.scope.inspected).toEqual(['page:1', 'page:2']);
      expect(capture.scope.gaps).toContainEqual(expect.objectContaining({ code: 'NOT_INSPECTED' }));
      expect(
        capture.observations.some(
          item => item.kind === 'text' && item.text.includes('Do not use gradients')
        )
      ).toBe(true);
      for (const color of colors) {
        expect(color.locator.kind).toBe('pdf');
        expect(
          color.evidenceRefs.every(id => capture.observations.some(item => item.id === id))
        ).toBe(true);
      }
      const repeat = await capturePdfPages(pdf, [1]);
      expect(
        repeat.observations.filter(item => item.kind === 'color').map(item => item.id)
      ).toEqual(colors.map(item => item.id));
      await expect(capturePdfPages(pdf, [0])).rejects.toThrow('Select between');
    } finally {
      await pdf.close();
    }
  });

  it('does not present sampled image colors as exact tokens on a scanned page', async () => {
    const pdf = await openGuidelinePdf(await fixture('harbor-scanned.pdf'), 'Scanned fixture');
    try {
      const capture = await capturePdfPages(pdf, [1]);
      expect(capture.observations.filter(item => item.kind === 'color')).toEqual([]);
      expect(capture.scope.gaps).toContainEqual(expect.objectContaining({ code: 'NO_TEXT' }));
    } finally {
      await pdf.close();
    }
  });

  it('rejects non-PDF data and pre-cancelled input before parsing', async () => {
    await expect(
      openGuidelinePdf(new TextEncoder().encode('hello world'), 'invalid')
    ).rejects.toThrow('not a PDF');
    const controller = new AbortController();
    controller.abort();
    await expect(
      openGuidelinePdf(await fixture('harbor-native.pdf'), 'cancelled', {
        signal: controller.signal,
      })
    ).rejects.toThrow();
  });
});
