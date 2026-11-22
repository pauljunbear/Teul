import type { TextObservation } from './evidence';
import {
  areAdjacentPdfText,
  observationColorValue,
  parseCaptureAny,
  type GuidelineCaptureAny,
} from './evidenceV2';
import { unavailablePdfTablePages } from './pdfTableEvidence';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { COLOR_SYSTEM_MODEL_V1_LIMITS as LIMITS } from '../../../../src/lib/colorSystemModelV1';
import { guidelineHash } from './review';
import {
  parseGuidelineStructureDraft,
  type GuidelineReviewDraftV2,
  type SourceScaleV2,
} from './reviewV2';
import { parseGuidelineDraftV4, type GuidelineReviewDraftV4 } from './reviewV4';
import type { ReviewedValueDraft } from './reviewedValues';

export const PDF_REVIEW_SUGGESTIONS_VERSION = 'teul.pdf-review-suggestions.v1';
type Draft = GuidelineReviewDraftV2 | GuidelineReviewDraftV4;
type Cell = {
  source: TextObservation;
  x: number;
  y: number;
  right: number;
  bottom: number;
  h: number;
};
export interface PdfNameSuggestion {
  observationId: string;
  label: string;
  family: string | null;
  evidenceRefs: string[];
  basis: 'printed-row' | 'printed-card';
  previousLabel: string;
  previousFamily: string;
}
export interface PdfReviewSuggestions {
  version: typeof PDF_REVIEW_SUGGESTIONS_VERSION;
  captureHash: string;
  draftHash: string;
  names: PdfNameSuggestion[];
  scales: SourceScaleV2[];
  capturedOccurrences: number;
  namedOccurrences: number;
  limited: boolean;
}
type NameEvidence = Pick<PdfNameSuggestion, 'label' | 'evidenceRefs' | 'basis'>;
type NameInference = { names: Map<string, NameEvidence>; limited: boolean };
const namesByCapture = new WeakMap<GuidelineCaptureAny, NameInference>();
const overlayHashes = new WeakMap<ReviewedValueDraft, string>();
const fieldLabel = /^(?:hex|rgb|srgb|cmyk|pms|pantone|coated|uncoated|neon)\s*[:=]?$/i;
const technical = (text: string) =>
  /^(?:hex|rgb|srgb|cmyk|pms|pantone|coated|uncoated|neon)\b/i.test(text) ||
  /^[#\d\s,./%+()\-A-Fa-f]+$/.test(text) ||
  /^[\d][\dA-Z\s,./-]*$/.test(text);
function sourceName(text: string): string | null {
  const name = text.trim().replace(/:$/, '').trim();
  if (
    !/^[\p{L}][\p{L}\p{N}'’\- ]{0,79}$/u.test(name) ||
    name.split(/\s+/).length > 5 ||
    /\b(use|using|the|these|this|should|must|only|never|avoid|do|not|when|colors?|colours?|palette|pantone|primary|secondary|tints?|shades?|main|hue|example|text|background|foreground|contrast|accessibility|pass|fail)\b/i.test(
      name
    ) ||
    fieldLabel.test(name)
  )
    return null;
  return name;
}
function cells(texts: TextObservation[]): Cell[] {
  return texts.flatMap(source => {
    if (source.locator.kind !== 'pdf') return [];
    const [x, y, w, h] = source.locator.bounds;
    return w > 0 && h > 0 && source.text.trim()
      ? [{ source, x, y, right: x + w, bottom: y + h, h }]
      : [];
  });
}
const overlaps = (a: Cell, b: { x: number; right: number }) => a.right > b.x && a.x < b.right;

/** Geometry proposes an association; it never establishes color values or usage permission. */
function inferNames(capture: GuidelineCaptureAny): NameInference {
  const cached = namesByCapture.get(capture);
  if (cached) return cached;
  const result = new Map<string, NameEvidence>();
  const pages = new Map<number, Cell[]>();
  const excluded = unavailablePdfTablePages(capture.scope.gaps);
  let limited = excluded.size > 0;
  for (const cell of cells(capture.observations.filter(item => item.kind === 'text'))) {
    if (cell.source.locator.kind !== 'pdf' || excluded.has(cell.source.locator.page)) continue;
    const page = pages.get(cell.source.locator.page) ?? [];
    page.push(cell);
    pages.set(cell.source.locator.page, page);
  }
  let inspections = 0;
  for (const color of capture.observations) {
    if (color.kind !== 'color' || color.locator.kind !== 'pdf') continue;
    const page = pages.get(color.locator.page);
    if (!page) continue;
    if (inspections + page.length * 10 > 1_000_000) {
      limited = true;
      continue;
    }
    inspections += page.length * 10;
    const witnesses = page.filter(cell => color.evidenceRefs.includes(cell.source.id));
    if (!witnesses.length) continue;
    const anchor = {
      x: Math.min(...witnesses.map(c => c.x)),
      right: Math.max(...witnesses.map(c => c.right)),
      y: Math.min(...witnesses.map(c => c.y)),
      bottom: Math.max(...witnesses.map(c => c.bottom)),
      h: Math.max(...witnesses.map(c => c.h)),
    };
    // Standalone HEX fragments may have a separate field label to their left.
    const fields = page.filter(
      c =>
        fieldLabel.test(c.source.text.trim()) &&
        c.right <= anchor.x &&
        anchor.x - c.right <= anchor.h * 8 &&
        Math.abs(c.y - anchor.y) <= anchor.h * 0.3
    );
    fields.sort((a, b) => b.right - a.right);
    if (fields[0]) anchor.x = fields[0].x;
    const possible = page.flatMap(c => {
      const label = sourceName(c.source.text);
      if (!label || c.h < anchor.h * 0.45 || c.h > anchor.h * 2.5) return [];
      const row =
        c.right <= anchor.x &&
        anchor.x - c.right <= anchor.h * 32 &&
        Math.abs(c.bottom - anchor.bottom) <= Math.max(c.h, anchor.h) * 0.35;
      const card =
        c.bottom <= anchor.y + anchor.h * 0.3 &&
        anchor.y - c.bottom <= anchor.h * 12 &&
        overlaps(c, anchor);
      return row || card ? [{ cell: c, label, row, card }] : [];
    });
    const rows = possible.filter(c => c.row).sort((a, b) => b.cell.right - a.cell.right);
    const cards = possible.filter(c => c.card).sort((a, b) => b.cell.bottom - a.cell.bottom);
    // Check only the nearest title in each orientation. Farther titles have an intervening name.
    if (
      (rows[1] && rows[0].cell.right - rows[1].cell.right < anchor.h * 0.5) ||
      (cards[1] && cards[0].cell.bottom - cards[1].cell.bottom < anchor.h * 0.5)
    )
      continue;
    const candidates = [...new Set([rows[0], cards[0]].filter(Boolean))].flatMap(candidate => {
      const { cell: c, label, row } = candidate;
      if (
        possible.some(
          other =>
            other !== candidate &&
            overlaps(c, other.cell) &&
            c.bottom > other.cell.y &&
            c.y < other.cell.bottom
        )
      )
        return [];
      // A named print specification is a field value, not the palette color's title.
      if (
        page.some(
          other =>
            fieldLabel.test(other.source.text.trim()) &&
            Math.abs(other.x - c.x) <= Math.max(other.h, c.h) * 0.4 &&
            c.y >= other.bottom - c.h * 0.1 &&
            c.y - other.bottom <= Math.max(other.h, c.h) * 2
        )
      )
        return [];

      // A split name is not a complete name. Do not accept only its final fragment.
      if (
        page.some(
          other =>
            other !== c &&
            !fieldLabel.test(other.source.text.trim()) &&
            (areAdjacentPdfText(c.source, other.source) ||
              areAdjacentPdfText(other.source, c.source))
        )
      )
        return [];
      const intervenes = page.some(other => {
        if (other === c || witnesses.includes(other) || technical(other.source.text.trim()))
          return false;
        return row
          ? other.right > c.right &&
              other.x < anchor.x &&
              Math.abs(other.bottom - anchor.bottom) <= anchor.h * 0.5
          : other.y >= c.bottom && other.bottom <= anchor.y && overlaps(other, anchor);
      });
      return intervenes
        ? []
        : [{ cell: c, label, basis: row ? ('printed-row' as const) : ('printed-card' as const) }];
    });
    // Competing orientations or overlapping titles are ambiguous, even if one is closer.
    if (candidates.length !== 1) continue;
    const candidate = candidates[0];
    result.set(color.id, {
      label: candidate.label,
      basis: candidate.basis,
      evidenceRefs: [
        ...new Set([
          candidate.cell.source.id,
          ...color.evidenceRefs,
          ...fields.slice(0, 1).map(c => c.source.id),
        ]),
      ],
    });
  }
  const inference = { names: result, limited };
  namesByCapture.set(capture, inference);
  return inference;
}
function validatedDraft(capture: GuidelineCaptureAny, draft: Draft): Draft {
  return 'reviewedValues' in draft
    ? parseGuidelineDraftV4(capture, draft)
    : parseGuidelineStructureDraft(capture, draft);
}
function previewDraftHash(draft: Draft): string {
  if (!('reviewedValues' in draft)) return guidelineHash(draft);
  const { reviewedValues, ...structure } = draft;
  // The validator detaches and freezes overlays; edits retain that safe identity.
  let reviewedValuesHash = overlayHashes.get(reviewedValues);
  if (!reviewedValuesHash) {
    reviewedValuesHash = guidelineHash(reviewedValues);
    overlayHashes.set(reviewedValues, reviewedValuesHash);
  }
  return guidelineHash({ structure, reviewedValuesHash });
}

/** Additive preview only. Legacy draft defaults and replay compilers stay unchanged. */
export function preparePdfReviewSuggestions(
  rawCapture: GuidelineCaptureAny,
  rawDraft: Draft
): PdfReviewSuggestions {
  const capture = parseCaptureAny(rawCapture);
  const draft = validatedDraft(capture, rawDraft);
  const { names: inferred, limited } = inferNames(capture);
  const names: PdfNameSuggestion[] = [];
  for (const [index, color] of draft.colors.entries()) {
    const name = inferred.get(color.observationId);
    if (
      !name ||
      (color.label.trim() && color.label !== `Color ${index + 1}` && color.label !== name.label)
    )
      continue;
    names.push({
      observationId: color.observationId,
      ...name,
      family: null,
      previousLabel: color.label,
      previousFamily: color.family,
    });
  }
  const scales: SourceScaleV2[] = [];
  const groups = new Map<string, { name: PdfNameSuggestion; position: number; slot: string }[]>();
  for (const name of names) {
    const series = /^(.*\p{L}) (\d{1,6})$/u.exec(name.label);
    if (!series) continue;
    const group = groups.get(series[1]) ?? [];
    group.push({ name, position: Number(series[2]), slot: series[2] });
    groups.set(series[1], group);
  }
  const sourceColors = new Map(
    capture.observations.filter(o => o.kind === 'color').map(o => [o.id, o])
  );
  const draftColors = new Map(draft.colors.map(c => [c.observationId, c]));
  for (const [family, members] of groups) {
    if (limited) break;
    const allMembers = draft.colors.filter(c => {
      const name = inferred.get(c.observationId)?.label;
      return name && /^(.*\p{L}) (\d{1,6})$/u.exec(name)?.[1] === family;
    });
    if (allMembers.length !== members.length) continue;
    const positions = new Map<number, typeof members>();
    for (const member of members) {
      const at = positions.get(member.position) ?? [];
      at.push(member);
      positions.set(member.position, at);
    }
    if (
      positions.size < 3 ||
      positions.size > LIMITS.maximumSlots ||
      members.some(m => {
        const current = draftColors.get(m.name.observationId)!;
        return !current.include || (current.family.trim() && current.family !== family);
      })
    )
      continue;
    if (
      [...positions.values()].some(
        at =>
          new Set(at.map(m => m.slot)).size !== 1 ||
          new Set(
            at.map(m =>
              canonicalJson(observationColorValue(sourceColors.get(m.name.observationId)!))
            )
          ).size !== 1
      )
    )
      continue;
    const refs = [...new Set(members.flatMap(m => [m.name.observationId, ...m.name.evidenceRefs]))];
    if (refs.length > LIMITS.maximumRefs) continue;
    members.forEach(m => {
      m.name.family = family;
    });
    if (draft.scales.length) continue;
    scales.push({
      id: `local-series:${guidelineHash([capture.captureHash, family]).slice(7)}`,
      label: family,
      family,
      slots: [...positions.entries()]
        .sort(([a], [b]) => a - b)
        .map(([position, at]) => ({
          id: at[0].slot,
          position,
          observationId: [...at].sort((a, b) =>
            a.name.observationId.localeCompare(b.name.observationId)
          )[0].name.observationId,
        })),
      evidenceRefs: refs,
    });
  }
  return {
    version: PDF_REVIEW_SUGGESTIONS_VERSION,
    captureHash: capture.captureHash,
    draftHash: previewDraftHash(draft),
    names: names.filter(
      n => n.label !== n.previousLabel || (n.family !== null && n.family !== n.previousFamily)
    ),
    scales,
    capturedOccurrences: sourceColors.size,
    namedOccurrences: inferred.size,
    limited,
  };
}

export function applyPdfReviewSuggestions<T extends Draft>(
  capture: GuidelineCaptureAny,
  draft: T,
  preview: PdfReviewSuggestions
): T {
  const current = preparePdfReviewSuggestions(capture, draft);
  if (guidelineHash(current) !== guidelineHash(preview))
    throw new Error(
      'The source or review changed. Inspect the current suggestions before applying them.'
    );
  if (!current.names.length && !current.scales.length) return draft;
  const changes = new Map(current.names.map(n => [n.observationId, n]));
  const next = {
    ...draft,
    colors: draft.colors.map(color => {
      const change = changes.get(color.observationId);
      return change
        ? { ...color, label: change.label, family: change.family ?? color.family }
        : color;
    }),
    scales: [...draft.scales, ...current.scales],
  };
  validatedDraft(capture, next);
  return next;
}
