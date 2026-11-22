import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  CAPTURE_LIMITS,
  CAPTURE_VERSION,
  bindCapture,
  digestSource,
  observationId,
  statedHexCodes,
  type GuidelineCapture,
  type CaptureGap,
  type TextObservation,
  type ColorObservation,
} from './evidence';

export const PDF_EXTRACTION_VERSION = 'teul.pdf-evidence.v1/pdfjs-6.3.289';
export interface GuidelinePdf {
  name: string;
  sha256: string;
  pageCount: number;
  document: PDFDocumentProxy;
  close: () => Promise<void>;
}

async function* streamItems(page: PDFPageProxy, signal?: AbortSignal) {
  const reader = page.streamTextContent().getReader();
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) return;
      const content = chunk.value as Awaited<ReturnType<PDFPageProxy['getTextContent']>>;
      for (const item of content.items) yield item;
    }
  } finally {
    // PDF.js requires an Error reason to mark the worker-side stream closed before late chunks.
    await reader.cancel(new Error('Selected-page text capture stopped.')).catch(() => {});
    reader.releaseLock();
  }
}

/** The caller owns the original bytes. PDF.js receives a disposable transferred copy. */
export async function openGuidelinePdf(
  bytes: Uint8Array,
  name: string,
  options: { workerSrc?: string; standardFontDataUrl?: string; signal?: AbortSignal } = {}
): Promise<GuidelinePdf> {
  options.signal?.throwIfAborted();
  if (bytes.byteLength > CAPTURE_LIMITS.pdfBytes)
    throw new Error('Choose a PDF smaller than 50 MiB.');
  if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-')
    throw new Error('This file is not a PDF.');
  if (options.workerSrc) GlobalWorkerOptions.workerSrc = options.workerSrc;
  const sha256 = await digestSource(bytes);
  options.signal?.throwIfAborted();
  const task = getDocument({
    data: bytes.slice(),
    standardFontDataUrl: options.standardFontDataUrl,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: true,
    maxImageSize: 16_000_000,
  });
  const abort = () => {
    void task.destroy();
  };
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void task.destroy();
  }, 30_000);
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const document = await task.promise;
    if (timedOut)
      throw new Error('Opening this PDF took too long. Export a smaller section and try again.');
    options.signal?.throwIfAborted();
    if (document.numPages > CAPTURE_LIMITS.pdfPages)
      throw new Error('Choose a PDF with at most 500 pages or export the relevant sections.');
    return {
      name: name.slice(0, 160),
      sha256,
      pageCount: document.numPages,
      document,
      close: async () => {
        options.signal?.removeEventListener('abort', abort);
        await task.destroy();
      },
    };
  } catch (error) {
    options.signal?.removeEventListener('abort', abort);
    await task.destroy();
    options.signal?.throwIfAborted();
    if (timedOut)
      throw new Error('Opening this PDF took too long. Export a smaller section and try again.');
    if (error instanceof Error && error.name === 'PasswordException')
      throw new Error(
        'This PDF is encrypted. Upload an unlocked copy; passwords are not sent or stored.'
      );
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

/** Extract only selected page text. Colors from a render are deliberately not promoted to tokens. */
export async function capturePdfPages(
  pdf: GuidelinePdf,
  pages: readonly number[],
  options: {
    signal?: AbortSignal;
    onProgress?: (complete: number, total: number) => void;
    reportSpatialLimitations?: boolean;
  } = {}
): Promise<GuidelineCapture> {
  const selected = [...new Set(pages)].sort((a, b) => a - b);
  if (
    !selected.length ||
    selected.length > CAPTURE_LIMITS.selectedPages ||
    selected.some(n => !Number.isInteger(n) || n < 1 || n > pdf.pageCount)
  )
    throw new Error('Select between 1 and 20 valid PDF pages.');
  const observations: (TextObservation | ColorObservation)[] = [];
  const gaps: CaptureGap[] = [];
  const inspected: string[] = [];
  const abort = () => {
    void pdf.close();
  };
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void pdf.close();
  }, 60_000);
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    for (const [index, number] of selected.entries()) {
      options.signal?.throwIfAborted();
      if (timedOut)
        throw new Error('Capture took too long. Select fewer pages and reopen the PDF.');
      const scope = `page:${number}`;
      const pageStart = observations.length;
      let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | undefined;
      try {
        page = await pdf.document.getPage(number);
        options.signal?.throwIfAborted();
        const viewport = page.getViewport({ scale: 1 });
        let characters = 0;
        let hasText = false;
        let spatialLimitation = false;
        let itemIndex = -1;
        for await (const item of streamItems(page, options.signal)) {
          itemIndex++;
          if (!('str' in item) || !item.str.trim()) continue;
          hasText = true;
          characters += item.str.length;
          if (
            itemIndex >= CAPTURE_LIMITS.textItemsPerPage ||
            characters > CAPTURE_LIMITS.textCharactersPerPage ||
            observations.length >= CAPTURE_LIMITS.observations - 1
          ) {
            gaps.push({
              scope,
              code: 'TEXT_LIMIT',
              message: 'This page exceeds the text limit; only preceding items were inspected.',
            });
            break;
          }
          const [a, b, c, d, x, y] = item.transform;
          const horizontal = Math.hypot(a, b) || 1;
          const vertical = Math.hypot(c, d) || 1;
          const points = [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ].map(([u, v]) =>
            viewport.convertToViewportPoint(
              x + (u * item.width * a) / horizontal + (v * item.height * c) / vertical,
              y + (u * item.width * b) / horizontal + (v * item.height * d) / vertical
            )
          );
          const xs = points.map(point => point[0]);
          const ys = points.map(point => point[1]);
          if (options.reportSpatialLimitations && !spatialLimitation) {
            const tolerance = Math.max(item.width, item.height, 1) * 1e-6;
            if (
              points[1][0] <= points[0][0] ||
              points[2][1] >= points[0][1] ||
              Math.abs(points[1][1] - points[0][1]) > tolerance ||
              Math.abs(points[2][0] - points[0][0]) > tolerance
            ) {
              spatialLimitation = true;
              gaps.push({
                scope,
                code: 'EXTRACTION_FAILED',
                message: `Page ${number} includes rotated, skewed or reversed text. Its text is retained, but separate table cells require manual confirmation.`,
              });
            }
          }
          const bounds: [number, number, number, number] = [
            Math.min(...xs),
            Math.min(...ys),
            Math.max(...xs) - Math.min(...xs),
            Math.max(...ys) - Math.min(...ys),
          ];
          const locator = { kind: 'pdf' as const, page: number, bounds };
          const id = observationId(pdf.sha256, number, itemIndex, 'text');
          observations.push({ id, kind: 'text', text: item.str, locator });
          for (const [codeIndex, code] of statedHexCodes(item.str).entries()) {
            if (observations.length >= CAPTURE_LIMITS.observations) break;
            observations.push({
              id: observationId(pdf.sha256, number, itemIndex, `hex:${codeIndex}`),
              kind: 'color',
              literal: code.literal,
              value: code.hex,
              method: 'stated-hex',
              locator,
              evidenceRefs: [id],
            });
          }
        }
        if (!hasText)
          gaps.push({
            scope,
            code: 'NO_TEXT',
            message:
              'No readable text; this page needs visual interpretation or manual transcription.',
          });
        inspected.push(scope);
      } catch (error) {
        options.signal?.throwIfAborted();
        if (timedOut)
          throw new Error('Capture took too long. Select fewer pages and reopen the PDF.');
        if (observations.length > pageStart) inspected.push(scope);
        gaps.push({
          scope,
          code: 'EXTRACTION_FAILED',
          message: error instanceof Error ? error.message.slice(0, 200) : 'Page extraction failed.',
        });
      } finally {
        page?.cleanup();
      }
      options.onProgress?.(index + 1, selected.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (selected.length < pdf.pageCount)
      gaps.push({
        scope: 'document',
        code: 'NOT_INSPECTED',
        message: `${pdf.pageCount - selected.length} pages were not selected. No claim is made about their contents.`,
      });
    return bindCapture({
      schemaVersion: CAPTURE_VERSION,
      id: `pdf:${pdf.sha256.slice(7, 23)}:pages:${selected.join(',')}`,
      kind: 'pdf',
      identity: { label: pdf.name, locator: null, revision: null, sha256: pdf.sha256 },
      capturedAt: new Date().toISOString(),
      scope: { total: pdf.pageCount, requested: selected.map(n => `page:${n}`), inspected, gaps },
      observations,
      extractionVersion: PDF_EXTRACTION_VERSION,
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
