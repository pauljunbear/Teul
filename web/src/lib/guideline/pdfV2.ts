import {
  CAPTURE_LIMITS,
  type CaptureGap,
  type ColorObservation,
  type TextObservation,
} from './evidence';
import {
  CAPTURE_V2_VERSION,
  bindCaptureV2,
  areAdjacentPdfText,
  hasAdjacentColorContinuation,
  createAdjacentColorWitness,
  joinAdjacentPdfText,
  type ColorObservationV2,
  type GuidelineCaptureV2,
} from './evidenceV2';
import { parseSingleStatedDigitalColor, statedDigitalColors } from './numericEvidence';
import { capturePdfPages, type GuidelinePdf } from './pdf';
import {
  findPdfTableColors,
  unavailablePdfTablePages,
  PDF_TABLE_EXTRACTION_VERSION,
} from './pdfTableEvidence';

export const PDF_V2_EXTRACTION_VERSION = PDF_TABLE_EXTRACTION_VERSION;

/** Reuse bounded PDF text capture; printed digital notation alone supplies numeric authority. */
export async function capturePdfPagesV2(
  pdf: GuidelinePdf,
  pages: readonly number[],
  options: { signal?: AbortSignal; onProgress?: (complete: number, total: number) => void } = {}
): Promise<GuidelineCaptureV2> {
  const captured = await capturePdfPages(pdf, pages, {
    ...options,
    reportSpatialLimitations: true,
  });
  options.signal?.throwIfAborted();
  const texts = captured.observations.filter(
    (item): item is TextObservation => item.kind === 'text'
  );
  const oldHexByText = new Map<string, ColorObservation[]>();
  for (const item of captured.observations) {
    if (item.kind !== 'color') continue;
    const key = item.evidenceRefs[0];
    const existing = oldHexByText.get(key) ?? [];
    existing.push(item);
    oldHexByText.set(key, existing);
  }
  const observations: GuidelineCaptureV2['observations'] = [];
  const admittedInContext = createAdjacentColorWitness(texts);
  const gaps: CaptureGap[] = [...captured.scope.gaps];
  const limitedPages = new Set<number>();
  let remainingColors = CAPTURE_LIMITS.observations - texts.length;
  const add = (color: ColorObservationV2) => {
    if (remainingColors > 0) {
      observations.push(color);
      remainingColors--;
    } else if (color.locator.kind === 'pdf') limitedPages.add(color.locator.page);
  };
  for (const [index, text] of texts.entries()) {
    // Let cancellation run during a large local transcription batch.
    if (index % 250 === 249) await new Promise(resolve => setTimeout(resolve, 0));
    options.signal?.throwIfAborted();
    observations.push(text);
    const codes = statedDigitalColors(text.text).filter(
      code =>
        !hasAdjacentColorContinuation(text, texts[index + 1], code.literal) &&
        admittedInContext([text], code.literal)
    );
    const previousHex = new Map<string, { ids: string[]; next: number }>();
    for (const old of oldHexByText.get(text.id) ?? []) {
      const entry = previousHex.get(old.value) ?? { ids: [], next: 0 };
      entry.ids.push(old.id);
      previousHex.set(old.value, entry);
    }
    for (const [codeIndex, code] of codes.entries()) {
      const previous = code.syntax === 'hex' ? previousHex.get(code.value.hex) : undefined;
      const oldId = previous?.ids[previous.next++];
      add({
        id: oldId ?? `${text.id.replace(/:text$/, '')}:digital:${codeIndex}`,
        kind: 'color',
        method: 'stated-digital',
        ...code,
        evidenceRefs: [text.id],
        locator: text.locator,
      });
    }
    // Only incomplete expressions can consume adjacent source items. No sorting across lines.
    if (codes.length || !/^\s*(?:rgba?|color)\b/i.test(text.text)) continue;
    let joined: ReturnType<typeof joinAdjacentPdfText> = null;
    let refs: TextObservation[] = [];
    for (let length = 2; length <= 9 && index + length <= texts.length; length++) {
      const candidate = texts.slice(index, index + length);
      // A ninth adjacent item exceeds the bound; never accept the eight-item prefix.
      if (length === 9) {
        if (areAdjacentPdfText(candidate[7], candidate[8])) joined = null;
        break;
      }
      const line = joinAdjacentPdfText(candidate);
      if (!line) break;
      joined = line;
      refs = candidate;
    }
    if (!joined) continue;
    try {
      const code = parseSingleStatedDigitalColor(joined.text);
      if (code.syntax === 'hex' || !admittedInContext(refs, code.literal)) continue;
      add({
        id: `${text.id.replace(/:text$/, '')}:digital:joined`,
        kind: 'color',
        method: 'stated-digital',
        ...code,
        evidenceRefs: refs.map(item => item.id),
        locator: joined.locator,
      });
    } catch {
      // A partial, unsupported or ambiguous line remains text evidence only.
    }
  }
  const table = findPdfTableColors(texts, unavailablePdfTablePages(gaps));
  const existingRefs = new Set(
    observations.filter(item => item.kind === 'color').map(item => item.evidenceRefs.join('\0'))
  );
  for (const color of table.colors) {
    if (existingRefs.has(color.evidenceRefs.join('\0'))) continue;
    add({
      id: `${color.evidenceRefs[0].replace(/:text$/, '')}:digital:table`,
      kind: 'color',
      method: 'stated-digital',
      ...color,
    });
  }
  for (const page of table.unresolvedPages)
    gaps.push({
      scope: `page:${page}:table-values`,
      code: 'EXTRACTION_FAILED',
      message: `Page ${page}: Some labeled RGB table values could not be associated safely or exceed the inspection limit. Their original text is retained; confirm them from the source page.`,
    });
  for (const page of limitedPages)
    if (!gaps.some(gap => gap.scope === `page:${page}` && gap.code === 'TEXT_LIMIT'))
      gaps.push({
        scope: `page:${page}:color-values`,
        code: 'TEXT_LIMIT',
        message:
          'This page exceeds the color observation limit; remaining source text is retained for manual review.',
      });
  options.signal?.throwIfAborted();
  return bindCaptureV2({
    schemaVersion: CAPTURE_V2_VERSION,
    id: captured.id,
    kind: captured.kind,
    identity: captured.identity,
    capturedAt: captured.capturedAt,
    scope: { ...captured.scope, gaps },
    observations,
    extractionVersion: PDF_V2_EXTRACTION_VERSION,
  });
}
