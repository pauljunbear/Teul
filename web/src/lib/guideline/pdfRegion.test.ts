import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { bindCaptureV2, CAPTURE_V2_VERSION } from './evidenceV2';
import type { GuidelinePdf } from './pdf';
import { PDF_REGION_DEADLINE_MS, renderPdfRegion, renderPreviousPdfRegion } from './pdfRegion';
import { decodeWitnessRgba } from './reviewedValues';

function capture(inspected = ['page:1']) {
  return bindCaptureV2({
    schemaVersion: CAPTURE_V2_VERSION,
    id: 'region-source',
    kind: 'pdf',
    identity: {
      label: 'Source',
      locator: null,
      revision: null,
      sha256: `sha256:${'a'.repeat(64)}`,
    },
    capturedAt: '2026-09-25T00:00:00Z',
    scope: { total: 2, requested: ['page:1'], inspected, gaps: [] },
    observations: [],
    extractionVersion: 'test',
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(width = 800, height = 400, rotation = 90) {
  const context = {
    imageSmoothingEnabled: true,
    fillStyle: '',
    getContextAttributes: vi.fn(() => ({ colorSpace: 'srgb', alpha: false })),
    fillRect: vi.fn(),
    getImageData: vi.fn((x: number, y: number, w: number, h: number) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row++)
        for (let column = 0; column < w; column++) {
          const offset = (row * w + column) * 4;
          data[offset] = (x + column) % 256;
          data[offset + 1] = (y + row) % 256;
          data[offset + 2] = 77;
          data[offset + 3] = 255;
        }
      return { data, width: w, height: h, colorSpace: 'srgb' };
    }),
  };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) };
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  const cleanup = vi.fn();
  const page = {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: width * scale,
      height: height * scale,
      rotation,
    })),
    render,
    cleanup,
  } as unknown as PDFPageProxy;
  const getPage = vi.fn(async () => page);
  const pdf = {
    name: 'Source.pdf',
    sha256: capture().identity.sha256,
    pageCount: 2,
    close: vi.fn(),
    document: { getPage },
  } as unknown as GuidelinePdf;
  return { context, canvas, render, cleanup, page, getPage, pdf };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('bounded PDF region rendering', () => {
  it('binds exact source context and opaque sRGB pixels sampled at nearest centers', async () => {
    const f = fixture();
    const source = capture();
    const witness = await renderPdfRegion(f.pdf, source, 1, [10, 20, 40, 50]);
    expect(witness).toMatchObject({
      schemaVersion: 'teul.pdf-region.v1',
      captureHash: source.captureHash,
      sourceDigest: source.identity.sha256,
      page: 1,
      pageSize: { width: 800, height: 400, rotation: 90 },
      bounds: [80, 80, 320, 200],
      render: {
        engine: 'pdfjs',
        version: '6.3.289',
        scale: 2,
        width: 1600,
        height: 800,
        colorSpace: 'srgb',
        background: '#FFFFFF',
        sampling: 'nearest-center',
      },
      raster: { width: 256, height: 160 },
    });
    expect(witness.witnessHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    const bytes = decodeWitnessRgba(witness);
    expect(bytes).toHaveLength(256 * 160 * 4);
    expect([...bytes.slice(0, 4)]).toEqual([161, 161, 77, 255]);
    expect([...bytes.slice(-4)]).toEqual([(160 + 638) % 256, (160 + 398) % 256, 77, 255]);
    expect(f.canvas.getContext).toHaveBeenCalledWith('2d', {
      alpha: false,
      colorSpace: 'srgb',
      willReadFrequently: true,
    });
    expect(f.context.imageSmoothingEnabled).toBe(false);
    expect(f.context.fillStyle).toBe('#FFFFFF');
    expect(f.context.fillRect).toHaveBeenCalledWith(0, 0, 1600, 800);
    expect(f.render).toHaveBeenCalledWith(
      expect.objectContaining({ background: '#FFFFFF', canvasContext: f.context })
    );
    expect(f.context.getImageData).toHaveBeenCalledWith(160, 160, 640, 400, { colorSpace: 'srgb' });
    expect(f.cleanup).toHaveBeenCalledOnce();
    expect([f.canvas.width, f.canvas.height]).toEqual([0, 0]);
  });

  it('caps the full page and crop, preserving fractional source edge bounds', async () => {
    const large = fixture(4000, 2000, 0);
    const witness = await renderPdfRegion(large.pdf, capture(), 1, [0, 0, 100, 100]);
    expect(witness.render).toMatchObject({ scale: 0.4, width: 1600, height: 800 });
    expect(witness.raster).toMatchObject({ width: 256, height: 128 });
    const fractional = fixture(50.25, 30.25, 0);
    const edge = await renderPdfRegion(fractional.pdf, capture(), 1, [0, 0, 100, 100]);
    expect(edge.bounds).toEqual([0, 0, 50.25, 30.25]);
    expect(edge.render).toMatchObject({ width: 101, height: 61 });
    expect(edge.raster).toMatchObject({ width: 101, height: 61 });
  });

  it.each([
    [2079.1800000004023, 1000, 0],
    [50.25, 30.25, 90],
    [793.47, 1122.1, 270],
  ])(
    'renders retained pixel edges exactly on a fresh capture at %j dimensions',
    async (width, height, rotation) => {
      const f = fixture(width, height, rotation);
      for (const bounds of [
        [3.71, 17.39, 31.13, 22.17],
        [0, 0, 100, 100],
      ] as [number, number, number, number][]) {
        const old = await renderPdfRegion(f.pdf, capture(), 1, bounds);
        const { captureHash: _, ...input } = capture();
        const next = bindCaptureV2({
          ...input,
          id: 'updated',
          identity: { ...input.identity, sha256: `sha256:${'b'.repeat(64)}` },
        });
        const fresh = await renderPreviousPdfRegion(
          { ...f.pdf, sha256: next.identity.sha256 },
          next,
          old
        );
        expect(fresh.captureHash).toBe(next.captureHash);
        expect(fresh.witnessHash).not.toBe(old.witnessHash);
        expect(fresh.bounds).toEqual(old.bounds);
        expect(fresh.render).toEqual(old.render);
        expect(fresh.raster).toEqual(old.raster);
      }
    }
  );
  it('requires a fresh selection after page geometry or rendering context changes', async () => {
    const f = fixture(),
      old = await renderPdfRegion(f.pdf, capture(), 1, [10, 20, 30, 40]);
    const changed = fixture(800, 401, 90);
    await expect(renderPreviousPdfRegion(changed.pdf, capture(), old)).rejects.toThrow(
      'page or rendering'
    );
    expect(changed.render).not.toHaveBeenCalled();
    await expect(
      renderPreviousPdfRegion(f.pdf, capture(), { ...old, bounds: [80.01, 80, 240, 160] })
    ).rejects.toThrow('exactly');
  });

  it('rejects source mismatch and uninspected pages before acquiring any page', async () => {
    const f = fixture();
    await expect(
      renderPdfRegion(
        { ...f.pdf, sha256: `sha256:${'b'.repeat(64)}` },
        capture(),
        1,
        [0, 0, 50, 50]
      )
    ).rejects.toThrow('matching source');
    await expect(renderPdfRegion(f.pdf, capture(), 2, [0, 0, 50, 50])).rejects.toThrow(
      'already inspected'
    );
    await expect(renderPdfRegion(f.pdf, capture([]), 1, [0, 0, 50, 50])).rejects.toThrow(
      'already inspected'
    );
    expect(f.getPage).not.toHaveBeenCalled();
    expect(f.render).not.toHaveBeenCalled();
  });

  it.each([
    [0, 0, 0, 10],
    [90, 0, 11, 10],
    [0, 99, 10, 2],
    [-1, 0, 10, 10],
    [0, 0, Infinity, 10],
    [0, NaN, 10, 10],
    [100, 0, Number.MIN_VALUE, 10],
    [99, 0, Number.MIN_VALUE, 10],
  ])('rejects invalid percent bounds %j before rendering', async (...bounds) => {
    const f = fixture();
    await expect(
      renderPdfRegion(f.pdf, capture(), 1, bounds as [number, number, number, number])
    ).rejects.toThrow('positive region');
    expect(f.getPage).not.toHaveBeenCalled();
  });

  it('honors cancellation before acquisition and disposes a page that arrives after abort', async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      renderPdfRegion(f.pdf, capture(), 1, [0, 0, 10, 10], { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.getPage).not.toHaveBeenCalled();
    const pending = deferred<PDFPageProxy>();
    f.getPage.mockReturnValueOnce(pending.promise);
    const active = new AbortController();
    const work = renderPdfRegion(f.pdf, capture(), 1, [0, 0, 10, 10], { signal: active.signal });
    active.abort();
    await expect(work).rejects.toMatchObject({ name: 'AbortError' });
    pending.resolve(f.page);
    await Promise.resolve();
    expect(f.render).not.toHaveBeenCalled();
    expect(f.cleanup).toHaveBeenCalledOnce();
  });

  it('cancels active painting immediately and releases its canvas only after rendering settles', async () => {
    const f = fixture();
    const pending = deferred<void>();
    const cancel = vi.fn();
    f.render.mockReturnValueOnce({ promise: pending.promise, cancel });
    const controller = new AbortController();
    const work = renderPdfRegion(f.pdf, capture(), 1, [0, 0, 10, 10], {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(f.render).toHaveBeenCalled());
    controller.abort();
    await expect(work).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalled();
    expect(f.cleanup).not.toHaveBeenCalled();
    expect(f.canvas.width).toBe(1600);
    pending.reject(new Error('Cancelled paint'));
    await Promise.resolve();
    expect(f.cleanup).toHaveBeenCalledOnce();
    expect(f.canvas.width).toBe(0);
  });

  it('enforces the acquisition deadline and cleans up a late page', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const pending = deferred<PDFPageProxy>();
    f.getPage.mockReturnValueOnce(pending.promise);
    const work = renderPdfRegion(f.pdf, capture(), 1, [0, 0, 10, 10]);
    const rejected = expect(work).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(PDF_REGION_DEADLINE_MS);
    await rejected;
    pending.resolve(f.page);
    await Promise.resolve();
    expect(f.render).not.toHaveBeenCalled();
    expect(f.cleanup).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('enforces the active render deadline without releasing a still-painting canvas', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const pending = deferred<void>();
    const cancel = vi.fn();
    f.render.mockReturnValueOnce({ promise: pending.promise, cancel });
    const work = renderPdfRegion(f.pdf, capture(), 1, [0, 0, 10, 10]);
    const rejected = expect(work).rejects.toThrow('took too long');
    await Promise.resolve();
    await Promise.resolve();
    expect(f.render).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(PDF_REGION_DEADLINE_MS);
    await rejected;
    expect(cancel).toHaveBeenCalled();
    expect(f.cleanup).not.toHaveBeenCalled();
    pending.reject(new Error('Cancelled paint'));
    await Promise.resolve();
    expect(f.cleanup).toHaveBeenCalledOnce();
    expect(f.canvas.width).toBe(0);
  });

  it('detaches percentage input before asynchronous page work and preserves a fractional render edge', async () => {
    const f = fixture(2079.1800000004023, 1000, 0);
    const pending = deferred<PDFPageProxy>();
    f.getPage.mockReturnValueOnce(pending.promise);
    const bounds: [number, number, number, number] = [0, 0, 100, 100];
    const work = renderPdfRegion(f.pdf, capture(), 1, bounds);
    bounds[0] = 999;
    pending.resolve(f.page);
    const witness = await work;
    expect(witness.render.width).toBe(1601);
    expect(witness.bounds).toEqual([0, 0, 2079.1800000004023, 1000]);
    expect(witness.raster.width).toBe(256);
  });

  it('cleans up rendering failure and rejects nonopaque or unsupported canvas output', async () => {
    const broken = fixture();
    broken.render.mockReturnValueOnce({
      promise: Promise.reject(new Error('Paint failed')),
      cancel: vi.fn(),
    });
    await expect(renderPdfRegion(broken.pdf, capture(), 1, [0, 0, 10, 10])).rejects.toThrow(
      'Paint failed'
    );
    expect(broken.cleanup).toHaveBeenCalledOnce();
    expect(broken.canvas.width).toBe(0);
    const transparent = fixture();
    transparent.context.getImageData.mockReturnValueOnce({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
      colorSpace: 'srgb',
    });
    await expect(
      renderPdfRegion(transparent.pdf, capture(), 1, [0, 0, 0.01, 0.01])
    ).rejects.toThrow('opaque white');
    expect(transparent.cleanup).toHaveBeenCalledOnce();
    const unsupported = fixture();
    unsupported.context.getContextAttributes.mockReturnValueOnce({
      colorSpace: 'display-p3',
      alpha: false,
    });
    await expect(renderPdfRegion(unsupported.pdf, capture(), 1, [0, 0, 10, 10])).rejects.toThrow(
      'opaque sRGB'
    );
    expect(unsupported.render).not.toHaveBeenCalled();
    expect(unsupported.cleanup).toHaveBeenCalledOnce();
  });
});
