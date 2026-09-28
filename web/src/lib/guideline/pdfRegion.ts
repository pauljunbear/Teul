import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseCaptureAny, type GuidelineCaptureAny } from './evidenceV2';
import type { GuidelinePdf } from './pdf';
import { bindPdfRegionWitness, type PdfRegionWitness } from './reviewedValues';

export const PDF_REGION_DEADLINE_MS = 30_000;
const PAGE_PIXELS = 1600;
const REGION_PIXELS = 256;

/** PDF.js page acquisition is not cancellable; dispose a page that arrives after cancellation. */
function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  late?: (value: T) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(
      value => {
        if (settled) {
          late?.(value);
          return;
        }
        settled = true;
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      error => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
  });
}
function base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(chunks.join(''));
}

/** A rendered appearance witness carries pixels and rendering context, never exact brand authority. */
export async function renderPdfRegion(
  pdf: GuidelinePdf,
  rawCapture: GuidelineCaptureAny,
  number: number,
  boundsPercent: [number, number, number, number],
  options: { signal?: AbortSignal } = {}
): Promise<PdfRegionWitness> {
  return renderRegion(pdf, rawCapture, number, boundsPercent, null, options);
}

/** Render current PDF bytes at a retained region's exact pixel edges. Never reuse old pixels. */
export function renderPreviousPdfRegion(
  pdf: GuidelinePdf,
  capture: GuidelineCaptureAny,
  previous: PdfRegionWitness,
  options: { signal?: AbortSignal } = {}
): Promise<PdfRegionWitness> {
  const geometry = {
    pageSize: { ...previous.pageSize },
    bounds: [...previous.bounds] as PdfRegionWitness['bounds'],
    render: { ...previous.render },
  };
  return renderRegion(pdf, capture, previous.page, null, geometry, options);
}

async function renderRegion(
  pdf: GuidelinePdf,
  rawCapture: GuidelineCaptureAny,
  number: number,
  boundsPercent: [number, number, number, number] | null,
  previous: Pick<PdfRegionWitness, 'bounds' | 'pageSize' | 'render'> | null,
  options: { signal?: AbortSignal }
): Promise<PdfRegionWitness> {
  options.signal?.throwIfAborted();
  const capture = parseCaptureAny(rawCapture);
  if (capture.kind !== 'pdf' || pdf.sha256 !== capture.identity.sha256)
    throw new Error('Reopen the matching source PDF before selecting a region.');
  const scope = `page:${number}`;
  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > pdf.pageCount ||
    number > capture.scope.total ||
    !capture.scope.requested.includes(scope) ||
    !capture.scope.inspected.includes(scope)
  )
    throw new Error('Select a page already inspected in this capture.');
  const percent = Array.isArray(boundsPercent) ? [...boundsPercent] : [];
  if (
    !previous &&
    (!Array.isArray(boundsPercent) ||
      percent.length !== 4 ||
      percent.some(
        value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100
      ) ||
      percent[2] <= 0 ||
      percent[3] <= 0 ||
      percent[0] + percent[2] <= percent[0] ||
      percent[1] + percent[3] <= percent[1] ||
      percent[0] + percent[2] > 100 ||
      percent[1] + percent[3] > 100)
  )
    throw new Error('Choose a positive region within the page using percentages from 0 to 100.');

  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const deadline = setTimeout(
    () =>
      controller.abort(
        new Error('PDF region rendering took too long. Reopen the PDF and try again.')
      ),
    PDF_REGION_DEADLINE_MS
  );
  const signal = controller.signal;
  let page: PDFPageProxy | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let task: RenderTask | undefined;
  let renderSettled = false;
  let disposed = false;
  const cancelRender = () => task?.cancel();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    page?.cleanup();
  };
  try {
    signal.throwIfAborted();
    page = await untilAborted(pdf.document.getPage(number), signal, late => {
      late.cleanup();
    });
    signal.throwIfAborted();
    const source = page.getViewport({ scale: 1 });
    if (
      ![source.width, source.height].every(
        size => Number.isFinite(size) && size > 0 && size <= 100_000
      ) ||
      ![0, 90, 180, 270].includes(source.rotation)
    )
      throw new Error('This PDF page has unsupported dimensions or rotation.');
    const scale = Math.min(2, PAGE_PIXELS / source.width, PAGE_PIXELS / source.height);
    if (!Number.isFinite(scale) || scale <= 0)
      throw new Error('This PDF page has unsupported dimensions.');
    // A floating-point product can exceed 1600 by one ulp; retain the recorded scale and ceil.
    const width = Math.ceil(source.width * scale);
    const height = Math.ceil(source.height * scale);
    if (width < 1 || height < 1 || width > PAGE_PIXELS + 1 || height > PAGE_PIXELS + 1)
      throw new Error('This PDF page exceeds the bounded render size.');
    const render: PdfRegionWitness['render'] = {
      engine: 'pdfjs',
      version: '6.3.289',
      scale,
      width,
      height,
      colorSpace: 'srgb',
      background: '#FFFFFF',
      sampling: 'nearest-center',
    };
    const pageSize = { width: source.width, height: source.height, rotation: source.rotation };
    if (
      previous &&
      (canonicalJson(previous.pageSize) !== canonicalJson(pageSize) ||
        canonicalJson(previous.render) !== canonicalJson(render))
    )
      throw new Error(
        'The page or rendering method changed. Select a new region for fresh review.'
      );
    const [x, y, w, h] = percent;
    const left = previous
      ? Math.round(previous.bounds[0] * scale)
      : Math.min(width - 1, Math.floor((source.width * scale * x) / 100));
    const top = previous
      ? Math.round(previous.bounds[1] * scale)
      : Math.min(height - 1, Math.floor((source.height * scale * y) / 100));
    const right = previous
      ? Math.min(width, Math.round((previous.bounds[0] + previous.bounds[2]) * scale))
      : Math.min(width, Math.ceil((source.width * scale * (x + w)) / 100));
    const bottom = previous
      ? Math.min(height, Math.round((previous.bounds[1] + previous.bounds[3]) * scale))
      : Math.min(height, Math.ceil((source.height * scale * (y + h)) / 100));
    // A fractional last pixel is clipped to the source page in saved bounds.
    const endX =
      previous && previous.bounds[2] === source.width - previous.bounds[0] ? width : right;
    const endY =
      previous && previous.bounds[3] === source.height - previous.bounds[1] ? height : bottom;
    const bounds: PdfRegionWitness['bounds'] = [
      left / scale,
      top / scale,
      Math.min(source.width, endX / scale) - left / scale,
      Math.min(source.height, endY / scale) - top / scale,
    ];
    if (
      previous &&
      (canonicalJson(previous.bounds) !== canonicalJson(bounds) ||
        ![left, top, endX, endY].every(Number.isSafeInteger) ||
        left < 0 ||
        top < 0 ||
        endX <= left ||
        endY <= top ||
        endX > width ||
        endY > height)
    )
      throw new Error(
        'The retained region cannot be rendered exactly. Select a new region for fresh review.'
      );
    const viewport = page.getViewport({ scale });
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', {
      alpha: false,
      colorSpace: 'srgb',
      willReadFrequently: true,
    });
    if (
      !context ||
      context.getContextAttributes().colorSpace !== 'srgb' ||
      context.getContextAttributes().alpha !== false
    )
      throw new Error('An opaque sRGB canvas is required to inspect this region.');
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, width, height);
    task = page.render({ canvas, canvasContext: context, viewport, background: '#FFFFFF' });
    signal.addEventListener('abort', cancelRender, { once: true });
    if (signal.aborted) cancelRender();
    const completion = task.promise.then(
      () => {
        renderSettled = true;
      },
      error => {
        renderSettled = true;
        throw error;
      }
    );
    await untilAborted(completion, signal);
    signal.throwIfAborted();

    const cropWidth = Math.max(1, endX - left);
    const cropHeight = Math.max(1, endY - top);
    const pixels = context.getImageData(left, top, cropWidth, cropHeight, { colorSpace: 'srgb' });
    if (pixels.colorSpace !== 'srgb' || pixels.data.length !== cropWidth * cropHeight * 4)
      throw new Error('Could not read an sRGB region from this page.');
    const shrink = Math.min(1, REGION_PIXELS / cropWidth, REGION_PIXELS / cropHeight);
    const rasterWidth = Math.max(1, Math.round(cropWidth * shrink));
    const rasterHeight = Math.max(1, Math.round(cropHeight * shrink));
    const rgba = new Uint8Array(rasterWidth * rasterHeight * 4);
    // Explicit pixel-center sampling avoids browser-dependent interpolation or color averaging.
    for (let row = 0; row < rasterHeight; row++) {
      const sourceY = Math.min(
        cropHeight - 1,
        Math.floor(((row + 0.5) * cropHeight) / rasterHeight)
      );
      for (let column = 0; column < rasterWidth; column++) {
        const sourceX = Math.min(
          cropWidth - 1,
          Math.floor(((column + 0.5) * cropWidth) / rasterWidth)
        );
        const from = (sourceY * cropWidth + sourceX) * 4;
        const to = (row * rasterWidth + column) * 4;
        if (pixels.data[from + 3] !== 255)
          throw new Error('The region did not render against an opaque white background.');
        rgba[to] = pixels.data[from];
        rgba[to + 1] = pixels.data[from + 1];
        rgba[to + 2] = pixels.data[from + 2];
        rgba[to + 3] = 255;
      }
    }
    signal.throwIfAborted();
    return bindPdfRegionWitness(capture, {
      schemaVersion: 'teul.pdf-region.v1',
      captureHash: capture.captureHash,
      sourceDigest: capture.identity.sha256,
      page: number,
      pageSize,
      bounds,
      render,
      raster: { width: rasterWidth, height: rasterHeight, rgbaBase64: base64(rgba) },
    });
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', abort);
    signal.removeEventListener('abort', cancelRender);
    if (task && !renderSettled) {
      task.cancel();
      // Cancelling PDF.js is asynchronous. Release its canvas only after painting has stopped.
      void task.promise.then(dispose, dispose);
    } else dispose();
  }
}
