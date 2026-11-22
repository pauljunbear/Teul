import type { TextObservation, EvidenceLocator, CaptureGap } from './evidence';
import { parseSingleStatedDigitalColor, type StatedDigitalColor } from './numericEvidence';

export const PDF_TABLE_LEGACY_EXTRACTION_VERSION = 'teul.pdf-evidence.v2-table-1/pdfjs-6.3.289';
export const PDF_TABLE_FRAGMENT_EXTRACTION_VERSION = 'teul.pdf-evidence.v2-table-2/pdfjs-6.3.289';
export const PDF_TABLE_HORIZONTAL_EXTRACTION_VERSION = 'teul.pdf-evidence.v2-table-3/pdfjs-6.3.289';
export const PDF_TABLE_VERTICAL_EXTRACTION_VERSION = 'teul.pdf-evidence.v2-table-4/pdfjs-6.3.289';
export const PDF_TABLE_EXTRACTION_VERSION = 'teul.pdf-evidence.v2-table-5/pdfjs-6.3.289';
const MAXIMUM_INSPECTIONS = 250_000;

export function unavailablePdfTablePages(gaps: readonly CaptureGap[]): Set<number> {
  return new Set(
    gaps.flatMap(gap => {
      const page = /^page:(\d+)$/.exec(gap.scope);
      return page && ['TEXT_LIMIT', 'EXTRACTION_FAILED'].includes(gap.code)
        ? [Number(page[1])]
        : [];
    })
  );
}

export interface PdfTableColorEvidence extends StatedDigitalColor {
  evidenceRefs: string[];
  locator: Extract<EvidenceLocator, { kind: 'pdf' }>;
}

type Cell = {
  source: TextObservation;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

/** Explicit labels establish channel units; spatial proximity alone never establishes a color.
 * Original text order is retained. Reopening recomputes the same witnesses from the whole page.
 */
export function findPdfTableColors(
  texts: readonly TextObservation[],
  excludedPages: ReadonlySet<number> = new Set(),
  extractionVersion = PDF_TABLE_EXTRACTION_VERSION
): {
  colors: PdfTableColorEvidence[];
  unresolvedPages: Set<number>;
} {
  if (
    ![
      PDF_TABLE_EXTRACTION_VERSION,
      PDF_TABLE_VERTICAL_EXTRACTION_VERSION,
      PDF_TABLE_HORIZONTAL_EXTRACTION_VERSION,
      PDF_TABLE_FRAGMENT_EXTRACTION_VERSION,
      PDF_TABLE_LEGACY_EXTRACTION_VERSION,
    ].includes(extractionVersion)
  )
    return { colors: [], unresolvedPages: new Set() };
  const fragmented = extractionVersion !== PDF_TABLE_LEGACY_EXTRACTION_VERSION;
  const vertical = [PDF_TABLE_VERTICAL_EXTRACTION_VERSION, PDF_TABLE_EXTRACTION_VERSION].includes(
    extractionVersion
  );
  const pages = new Map<number, Cell[]>();
  const labels: Cell[] = [];
  for (const source of texts) {
    if (
      source.locator.kind !== 'pdf' ||
      excludedPages.has(source.locator.page) ||
      !source.text.trim()
    )
      continue;
    const [x, y, width, height] = source.locator.bounds;
    const right = x + width;
    const bottom = y + height;
    if (width <= 0 || height <= 0 || ![x, y, width, height, right, bottom].every(Number.isFinite))
      continue;
    const cell = {
      source,
      page: source.locator.page,
      x,
      y,
      width,
      height,
      right,
      bottom,
    };
    const page = pages.get(cell.page) ?? [];
    page.push(cell);
    pages.set(cell.page, page);
    if (/^RGB\s*[:=]?$/i.test(source.text.trim())) labels.push(cell);
  }

  const unresolved = new Set<Cell>();
  const ambiguousOrientations = new Set<Cell>();
  const limitedPages = new Set<number>();
  const proposals: { label: Cell; values: Cell[]; evidence: PdfTableColorEvidence }[] = [];
  const possibleOwners = new Map<string, number>();
  let inspected = 0;
  for (const label of labels) {
    const page = pages.get(label.page)!;
    // Inspect a whole page before accepting any pair; a truncated search cannot prove uniqueness.
    if (inspected + page.length > MAXIMUM_INSPECTIONS) {
      unresolved.add(label);
      limitedPages.add(label.page);
      continue;
    }
    inspected += page.length;
    let verticalAttempted = false;
    if (vertical) {
      // A punctuated RGB field must not disappear silently when its value cannot be read.
      if (/[:=]\s*$/.test(label.source.text)) unresolved.add(label);
      const below = verticalValueFragments(page, label);
      verticalAttempted = below.attempted;
      if (below.attempted) unresolved.add(label);
      if (below.values.length) {
        for (const value of below.values)
          possibleOwners.set(value.source.id, (possibleOwners.get(value.source.id) ?? 0) + 1);
        const evidence = tableEvidence(label, below.values, fragmented);
        if (evidence) proposals.push({ label, values: below.values, evidence });
      }
    }
    // Fragment rows can be tightly stacked. Keep the legacy search band unchanged, but
    // do not let a neighboring nonoverlapping row become part of a new expression.
    const padding = fragmented ? 0 : label.height * 0.1;
    const row = page.filter(
      cell => cell !== label && cell.bottom > label.y - padding && cell.y < label.bottom + padding
    );
    const candidates = row.filter(cell => {
      const gap = cell.x - label.right;
      return (
        gap >= 0 &&
        gap <= Math.min(label.height * 8, 128) &&
        (fragmented ||
          (/^[+-]?(?:\d|\.\d)/.test(cell.source.text.trim()) && /[,/]/.test(cell.source.text)))
      );
    });
    // Count plausible orientations before clearance rejects one of them. Otherwise
    // a horizontal value can hide its competing vertical value and appear unique.
    if (
      verticalAttempted &&
      candidates.some(cell => /^\s*[+-]?(?:\d|\.\d)/.test(cell.source.text))
    ) {
      ambiguousOrientations.add(label);
      continue;
    }
    if (!fragmented)
      for (const value of candidates)
        possibleOwners.set(value.source.id, (possibleOwners.get(value.source.id) ?? 0) + 1);
    if (!candidates.length) continue; // A standalone RGB section heading need not name a value.
    unresolved.add(label);
    if (!fragmented && candidates.length !== 1) continue;
    const values = fragmented ? valueFragments(row, label.right) : candidates;
    if (!values.length || values.length > 7) continue;
    if (fragmented && candidates.some(cell => !values.includes(cell))) continue;
    if (fragmented)
      for (const value of values)
        possibleOwners.set(value.source.id, (possibleOwners.get(value.source.id) ?? 0) + 1);
    const value = values.at(-1)!;
    if (
      values.some(cell => {
        const tolerance = Math.min(label.height, cell.height) * 0.1;
        return (
          Math.abs(label.y - cell.y) > tolerance || Math.abs(label.bottom - cell.bottom) > tolerance
        );
      })
    )
      continue;
    // Include near prefixes/suffixes regardless of source order or font height. An unsupported
    // expression, extra channel, overlapping label or intervening cell must not be dropped.
    const margin = Math.min(label.height, value.height) * 0.75;
    if (
      row.some(
        cell =>
          !values.includes(cell) && cell.right > label.x - margin && cell.x < value.right + margin
      )
    )
      continue;
    const evidence = tableEvidence(label, values, fragmented);
    if (evidence) proposals.push({ label, values, evidence });
  }
  const colors: PdfTableColorEvidence[] = [];
  for (const proposal of proposals) {
    if (
      limitedPages.has(proposal.label.page) ||
      ambiguousOrientations.has(proposal.label) ||
      proposal.values.some(value => possibleOwners.get(value.source.id) !== 1)
    )
      continue;
    colors.push(proposal.evidence);
    unresolved.delete(proposal.label);
  }
  return { colors, unresolvedPages: new Set([...unresolved].map(label => label.page)) };
}

function valueFragments(row: readonly Cell[], startX: number): Cell[] {
  const ordered = row.filter(cell => cell.x >= startX).sort((a, b) => a.x - b.x);
  const values: Cell[] = [];
  for (const cell of ordered) {
    const previous = values.at(-1);
    if (previous) {
      const gap = cell.x - previous.right;
      if (gap < 0) return []; // Overlapping alternatives cannot form one expression.
      if (gap > Math.min(previous.height, cell.height) * 0.75) break;
    }
    values.push(cell);
    if (values.length > 7) break; // Never accept a truncated seven-fragment prefix.
  }
  return values;
}

function verticalValueFragments(page: readonly Cell[], label: Cell) {
  const starts = page.filter(cell => {
    const unit = Math.min(label.height, cell.height);
    return (
      cell !== label &&
      cell.y >= label.bottom &&
      cell.y - label.bottom <= unit * 0.75 &&
      Math.abs(cell.x - label.x) <= unit * 0.1
    );
  });
  const rejected = {
    attempted: starts.some(cell => /^\s*[+-]?(?:\d|\.\d)/.test(cell.source.text)),
    values: [] as Cell[],
  };
  if (starts.length !== 1) return rejected;
  const first = starts[0];
  if (first.height < label.height * 0.5 || first.height > label.height * 2) return rejected;
  const row = page.filter(cell => cell.bottom > first.y && cell.y < first.bottom);
  const values = valueFragments(row, first.x);
  if (
    !values.length ||
    values.length > 7 ||
    values.some(cell => {
      const tolerance = Math.min(first.height, cell.height) * 0.1;
      return (
        Math.abs(cell.y - first.y) > tolerance || Math.abs(cell.bottom - first.bottom) > tolerance
      );
    })
  )
    return rejected;
  const margin = Math.min(label.height, first.height) * 0.75;
  const left = Math.min(label.x, first.x);
  const right = Math.max(label.right, values.at(-1)!.right);
  const bottom = Math.max(...values.map(value => value.bottom));
  // The full column and both rows must be clear: never skip a prefix, suffix,
  // competing field or intervening text merely because the channels parse.
  if (
    page.some(
      cell =>
        cell !== label &&
        !values.includes(cell) &&
        cell.right > left - margin &&
        cell.x < right + margin &&
        cell.bottom > label.y &&
        cell.y < bottom
    )
  )
    return rejected;
  return { attempted: rejected.attempted, values };
}

function tableEvidence(
  label: Cell,
  values: Cell[],
  fragmented: boolean
): PdfTableColorEvidence | null {
  const cells = [label, ...values];
  const literal = cells.map(cell => cell.source.text.trim()).join(' ');
  if (literal.length > 4096) return null;
  // Spaced hyphens are table notation, not CSS or a general RGB grammar change.
  const hyphen =
    fragmented && /^RGB\s*[:=]?\s*(\d{1,3})\s+-\s+(\d{1,3})\s+-\s+(\d{1,3})$/i.exec(literal);
  try {
    const parsed = parseSingleStatedDigitalColor(
      hyphen ? `RGB ${hyphen.slice(1).join(', ')}` : literal
    );
    if (parsed.syntax !== 'rgb') return null;
    const left = Math.min(...cells.map(cell => cell.x));
    const top = Math.min(...cells.map(cell => cell.y));
    const bounds: [number, number, number, number] = [
      left,
      top,
      Math.max(...cells.map(cell => cell.right)) - left,
      Math.max(...cells.map(cell => cell.bottom)) - top,
    ];
    if (!bounds.every(Number.isFinite)) return null;
    return {
      ...parsed,
      literal,
      evidenceRefs: cells.map(cell => cell.source.id),
      locator: { kind: 'pdf', page: label.page, bounds },
    };
  } catch {
    // Out-of-range, partial and ambiguous-unit notation remains text for review.
    return null;
  }
}
