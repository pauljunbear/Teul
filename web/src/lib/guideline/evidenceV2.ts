import type { ColorSystemColorValueV2 } from '../../../../src/lib/colorSystemBuilderV2Contracts';
import { canonicalJson, deterministicContentHash } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import {
  buildColorSystemSrgbValueV1,
  colorSystemSrgbToCssV1,
} from '../../../../src/lib/colorSystemSrgbValueV1';
import { hexToRgb } from '../../../../src/lib/utils';
import {
  CAPTURE_LIMITS,
  CAPTURE_VERSION,
  parseCapture,
  validateCapture,
  validateEvidenceLocator,
  type ColorObservation,
  type EvidenceLocator,
  type GuidelineCapture,
  type TextObservation,
} from './evidence';
import {
  parseSingleStatedDigitalColor,
  statedDigitalColors,
  statedDigitalColorOccurrences,
} from './numericEvidence';
import { findPdfTableColors, unavailablePdfTablePages } from './pdfTableEvidence';

export const CAPTURE_V2_VERSION = 'teul.guideline-capture.v2' as const;
export interface ColorObservationV2 {
  id: string;
  kind: 'color';
  literal: string;
  method: 'stated-digital';
  syntax: 'hex' | 'rgb' | 'srgb';
  value: ColorSystemColorValueV2;
  evidenceRefs: string[];
  locator: EvidenceLocator;
}
export interface GuidelineCaptureV2 extends Omit<
  GuidelineCapture,
  'schemaVersion' | 'observations'
> {
  schemaVersion: typeof CAPTURE_V2_VERSION;
  observations: (TextObservation | ColorObservationV2)[];
}
export type GuidelineCaptureAny = GuidelineCapture | GuidelineCaptureV2;
export type ColorObservationAny = ColorObservation | ColorObservationV2;
const trustedCaptures = new WeakSet<object>();
const INPUT_FIELDS = [
  'schemaVersion',
  'id',
  'kind',
  'identity',
  'capturedAt',
  'scope',
  'observations',
  'extractionVersion',
];
const COLOR_FIELDS = [
  'id',
  'kind',
  'literal',
  'method',
  'syntax',
  'value',
  'evidenceRefs',
  'locator',
];

function fields(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some(key => !keys.includes(key))
  )
    throw new Error('Capture contains missing or unsupported fields.');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function snapshot(raw: unknown) {
  return snapshotColorSystemInertJsonV1(raw, {
    maximumBytes: CAPTURE_LIMITS.captureBytes,
    maximumNodes: 500_000,
    maximumArrayLength: CAPTURE_LIMITS.observations,
  });
}

/** Adjacent source items must share a baseline, height and a small horizontal gap. */
export function areAdjacentPdfText(left: TextObservation, right: TextObservation): boolean {
  if (
    left.locator.kind !== 'pdf' ||
    right.locator.kind !== 'pdf' ||
    left.locator.page !== right.locator.page
  )
    return false;
  const [x, y, width, height] = left.locator.bounds;
  const [nextX, nextY, nextWidth, nextHeight] = right.locator.bounds;
  const tolerance = Math.min(height, nextHeight) * 0.1;
  const gap = nextX - (x + width);
  return (
    width > 0 &&
    height > 0 &&
    nextWidth > 0 &&
    nextHeight > 0 &&
    Math.abs(y - nextY) <= tolerance &&
    Math.abs(y + height - nextY - nextHeight) <= tolerance &&
    gap >= -0.5 &&
    gap <= Math.min(height, nextHeight) * 0.75
  );
}

/** A neighboring numeric suffix can change an otherwise complete-looking color expression. */
export function hasAdjacentColorContinuation(
  source: TextObservation,
  next: TextObservation | undefined,
  literal: string
): boolean {
  return Boolean(
    next &&
    source.text.trimEnd().endsWith(literal) &&
    areAdjacentPdfText(source, next) &&
    /^\s*(?:[,/%)]|[+-]?(?:\d|\.\d)|\(\s*[+-]?(?:\d|\.\d)|(?:alpha|opacity|deg|rad|turn|px)\b)/i.test(
      next.text
    )
  );
}

/** Keep function atomicity across PDF item boundaries without searching unrelated lines. */
export function createAdjacentColorWitness(texts: readonly TextObservation[]) {
  type Context = {
    first: number;
    starts: number[];
    ends: number[];
    colors: Map<string, { start: number; end: number }[]>;
  };
  const indices = new Map(texts.map((item, index) => [item.id, index]));
  const contexts = new Map<number, Context | null>();
  const contextAt = (index: number): Context | null => {
    if (contexts.has(index)) return contexts.get(index)!;
    let first = index;
    let last = index;
    while (first > 0 && index - first < 8 && areAdjacentPdfText(texts[first - 1], texts[first]))
      first--;
    while (
      last + 1 < texts.length &&
      last - first < 8 &&
      areAdjacentPdfText(texts[last], texts[last + 1])
    )
      last++;
    if (last - first >= 8) {
      contexts.set(index, null);
      return null;
    }
    const rows = texts.slice(first, last + 1);
    const length = rows.reduce((size, item) => size + item.text.length, rows.length - 1);
    if (length > CAPTURE_LIMITS.textCharactersPerPage) {
      rows.forEach((_item, offset) => contexts.set(first + offset, null));
      return null;
    }
    let offset = 0;
    const starts: number[] = [];
    const ends: number[] = [];
    for (const item of rows) {
      starts.push(offset);
      ends.push(offset + item.text.length);
      offset += item.text.length + 1;
    }
    const colors = new Map<string, { start: number; end: number }[]>();
    for (const { start, end, literal } of statedDigitalColorOccurrences(
      rows.map(item => item.text).join(' ')
    )) {
      const ranges = colors.get(literal) ?? [];
      ranges.push({ start, end });
      colors.set(literal, ranges);
    }
    const context: Context = { first, starts, ends, colors };
    rows.forEach((_item, row) => contexts.set(first + row, context));
    return context;
  };
  return (refs: readonly TextObservation[], literal: string): boolean => {
    const first = indices.get(refs[0]?.id);
    const last = indices.get(refs.at(-1)?.id ?? '');
    if (first === undefined || last === undefined) return false;
    const context = contextAt(first);
    if (!context || last < first || last >= context.first + context.starts.length) return false;
    const start = first - context.first;
    const end = last - context.first;
    const ranges = context.colors.get(literal);
    if (!ranges) return false;
    // Offsets arrive in source order; lookup stays logarithmic for repeated literals in one run.
    const minimum = Math.max(context.starts[start], context.starts[end] - literal.length + 1);
    let low = 0;
    let high = ranges.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ranges[middle].start < minimum) low = middle + 1;
      else high = middle;
    }
    const found = ranges[low];
    return Boolean(
      found &&
      found.start < context.ends[start] &&
      found.end > context.starts[end] &&
      found.end <= context.ends[end]
    );
  };
}

/** Conservative line reconstruction shared by extraction and untrusted reopen validation.
 * The caller also verifies that these are consecutive source text observations.
 */
export function joinAdjacentPdfText(items: readonly TextObservation[]): {
  text: string;
  locator: Extract<EvidenceLocator, { kind: 'pdf' }>;
} | null {
  if (items.length < 2 || items.length > 8) return null;
  const first = items[0];
  if (first.locator.kind !== 'pdf' || !/^\s*(?:rgba?|color)\b/i.test(first.text)) return null;
  let [left, top, width, height] = first.locator.bounds;
  let right = left + width;
  let bottom = top + height;
  if (height <= 0 || width <= 0) return null;
  for (let index = 1; index < items.length; index++) {
    const current = items[index].locator;
    if (current.kind !== 'pdf' || !areAdjacentPdfText(items[index - 1], items[index])) return null;
    const [x, y, w, h] = current.bounds;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + w);
    bottom = Math.max(bottom, y + h);
  }
  width = right - left;
  height = bottom - top;
  if (![left, top, width, height, right, bottom].every(Number.isFinite)) return null;
  const text = items
    .map(item => item.text)
    .join(' ')
    .trim();
  if (text.length > 4096) return null;
  return {
    text,
    locator: { kind: 'pdf', page: first.locator.page, bounds: [left, top, width, height] },
  };
}

function validate(raw: unknown): asserts raw is Omit<GuidelineCaptureV2, 'captureHash'> {
  fields(raw, INPUT_FIELDS);
  if (
    raw.schemaVersion !== CAPTURE_V2_VERSION ||
    !Array.isArray(raw.observations) ||
    raw.observations.length > CAPTURE_LIMITS.observations
  )
    throw new Error('Unsupported capture version or observation count.');
  const texts = raw.observations.filter(item => item?.kind === 'text') as TextObservation[];
  // Reuse the original metadata, scope and text validator. Numeric colors never pass through V1.
  validateCapture({ ...raw, schemaVersion: CAPTURE_VERSION, observations: texts });
  const textById = new Map(texts.map((item, index) => [item.id, { item, index }]));
  const ids = new Set<string>();
  const sourceColors = new Map<string, Set<string>>();
  const admittedInContext = createAdjacentColorWitness(texts);
  const colorKey = (code: { literal: string; syntax: unknown; value: unknown }) =>
    canonicalJson([code.literal, code.syntax, code.value]);
  const tableColors = new Map(
    findPdfTableColors(
      texts,
      unavailablePdfTablePages((raw.scope as GuidelineCaptureV2['scope']).gaps),
      raw.extractionVersion as string
    ).colors.map(color => [canonicalJson(color.evidenceRefs), color])
  );
  for (const item of raw.observations) {
    if (!item || typeof item !== 'object') throw new Error('Invalid observation.');
    if (typeof item.id !== 'string' || !item.id.length || item.id.length > 128 || ids.has(item.id))
      throw new Error('Invalid or duplicate observation identity.');
    ids.add(item.id);
    if (item.kind === 'text') continue;
    fields(item, COLOR_FIELDS);
    validateEvidenceLocator(item.locator);
    if (
      item.kind !== 'color' ||
      item.method !== 'stated-digital' ||
      !['hex', 'rgb', 'srgb'].includes(item.syntax as string) ||
      typeof item.literal !== 'string' ||
      !item.literal.length ||
      item.literal.length > 4096
    )
      throw new Error('Unsupported numeric authority.');
    if (
      !Array.isArray(item.evidenceRefs) ||
      !item.evidenceRefs.length ||
      item.evidenceRefs.length > 8 ||
      new Set(item.evidenceRefs).size !== item.evidenceRefs.length ||
      item.evidenceRefs.some(ref => typeof ref !== 'string' || !textById.has(ref))
    )
      throw new Error('Color refers to missing or duplicate text evidence.');
    const refs = item.evidenceRefs.map(ref => textById.get(ref)!);
    if (
      Object.is((item.value as ColorObservationV2['value']).alpha, -0) ||
      Object.values((item.value as ColorObservationV2['value']).components).some(channel =>
        Object.is(channel, -0)
      )
    )
      throw new Error('The native color value does not match its stated literal.');
    const table = tableColors.get(canonicalJson(item.evidenceRefs));
    if (
      table &&
      colorKey(table) ===
        colorKey({ literal: item.literal, syntax: item.syntax, value: item.value }) &&
      canonicalJson(table.locator) === canonicalJson(item.locator)
    )
      continue;
    const parsed = parseSingleStatedDigitalColor(item.literal);
    if (
      parsed.literal !== item.literal ||
      parsed.syntax !== item.syntax ||
      canonicalJson(parsed.value) !== canonicalJson(item.value)
    )
      throw new Error('The native color value does not match its stated literal.');
    const source =
      refs.length === 1
        ? { text: refs[0].item.text, locator: refs[0].item.locator }
        : refs.every((ref, index) => ref.index === refs[0].index + index)
          ? joinAdjacentPdfText(refs.map(ref => ref.item))
          : null;
    const next = texts[refs[refs.length - 1].index + 1];
    const truncatedLine =
      refs.length > 1 && next && areAdjacentPdfText(refs[refs.length - 1].item, next);
    const sourceKey = canonicalJson(item.evidenceRefs);
    let values = sourceColors.get(sourceKey);
    if (source && !values) {
      values = new Set(statedDigitalColors(source.text).map(colorKey));
      sourceColors.set(sourceKey, values);
    }
    if (
      !source ||
      !admittedInContext(
        refs.map(ref => ref.item),
        item.literal
      ) ||
      truncatedLine ||
      (refs.length === 1 && hasAdjacentColorContinuation(refs[0].item, next, item.literal)) ||
      canonicalJson(source.locator) !== canonicalJson(item.locator) ||
      (refs.length > 1 && source.text !== item.literal) ||
      !values?.has(colorKey({ literal: item.literal, syntax: item.syntax, value: item.value }))
    )
      throw new Error('The stated value does not occur in its cited source text.');
  }
}

function bindDetached(detached: unknown): GuidelineCaptureV2 {
  validate(detached);
  const { capturedAt: _time, ...content } = detached;
  const result = freeze({
    ...detached,
    captureHash: deterministicContentHash(canonicalJson(content)),
  });
  trustedCaptures.add(result);
  return result;
}
export function bindCaptureV2(input: Omit<GuidelineCaptureV2, 'captureHash'>): GuidelineCaptureV2 {
  return bindDetached(snapshot(input));
}
export function parseCaptureV2(raw: unknown): GuidelineCaptureV2 {
  if (raw && typeof raw === 'object' && trustedCaptures.has(raw)) return raw as GuidelineCaptureV2;
  const detached = snapshot(raw);
  fields(detached, [...INPUT_FIELDS, 'captureHash']);
  const { captureHash, ...input } = detached;
  const result = bindDetached(input);
  if (captureHash !== result.captureHash)
    throw new Error('Capture content changed; review the new revision.');
  return result;
}
export function parseCaptureAny(raw: unknown): GuidelineCaptureAny {
  // Dispatch only on an own data descriptor; never execute a source object's getter.
  const version =
    raw && typeof raw === 'object'
      ? Object.getOwnPropertyDescriptor(raw, 'schemaVersion')
      : undefined;
  if (version && !('value' in version)) throw new Error('Capture rejects accessors.');
  return version?.value === CAPTURE_V2_VERSION ? parseCaptureV2(raw) : parseCapture(raw);
}
export function observationColorValue(item: ColorObservationAny): ColorSystemColorValueV2 {
  if (item.method === 'stated-digital') return item.value;
  const rgb = hexToRgb(item.value);
  return buildColorSystemSrgbValueV1({ r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 });
}
export function observationColorCss(item: ColorObservationAny): string {
  return item.method === 'stated-hex' ? item.value : colorSystemSrgbToCssV1(item.value);
}
export function observationColorDescription(item: ColorObservationAny): string {
  return `${item.literal} → ${observationColorCss(item)}; stated digital notation`;
}
