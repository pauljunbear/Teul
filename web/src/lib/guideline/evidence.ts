import { canonicalJson, deterministicContentHash } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';

export const CAPTURE_VERSION = 'teul.guideline-capture.v1' as const;
const trustedCaptures = new WeakSet<object>();
export const CAPTURE_LIMITS = Object.freeze({
  pdfBytes: 50 * 1024 * 1024,
  pdfPages: 500,
  selectedPages: 20,
  textItemsPerPage: 20_000,
  textCharactersPerPage: 100_000,
  observations: 20_000,
  captureBytes: 8 * 1024 * 1024,
});

/** A locator describes evidence; it is never executable fetch or host authority. */
export type EvidenceLocator =
  | { kind: 'pdf'; page: number; bounds: [number, number, number, number] }
  | { kind: 'figma'; nodeId: string; property: string }
  | { kind: 'website'; selector: string; property: string; viewport: [number, number] };

export interface TextObservation {
  id: string;
  kind: 'text';
  text: string;
  locator: EvidenceLocator;
}

export interface ColorObservation {
  id: string;
  kind: 'color';
  literal: string;
  /** An exact transcription of a stated code is not necessarily an approved brand token. */
  method: 'stated-hex';
  value: string;
  evidenceRefs: string[];
  locator: EvidenceLocator;
}

export interface CaptureGap {
  scope: string;
  code: 'NO_TEXT' | 'TEXT_LIMIT' | 'EXTRACTION_FAILED' | 'NOT_INSPECTED';
  message: string;
}

export interface GuidelineCapture {
  schemaVersion: typeof CAPTURE_VERSION;
  id: string;
  kind: 'pdf' | 'figma' | 'website';
  identity: { label: string; locator: string | null; revision: string | null; sha256: string };
  capturedAt: string;
  scope: { total: number; requested: string[]; inspected: string[]; gaps: CaptureGap[] };
  observations: (TextObservation | ColorObservation)[];
  extractionVersion: string;
  captureHash: string;
}

export function bindCapture(input: Omit<GuidelineCapture, 'captureHash'>): GuidelineCapture {
  const detached = snapshotColorSystemInertJsonV1(input, {
    maximumBytes: CAPTURE_LIMITS.captureBytes,
    maximumNodes: 500_000,
    maximumArrayLength: CAPTURE_LIMITS.observations,
  }) as Omit<GuidelineCapture, 'captureHash'>;
  validateCapture(detached);
  const { capturedAt: _time, ...content } = detached;
  const result = freeze({
    ...detached,
    captureHash: deterministicContentHash(canonicalJson(content)),
  });
  trustedCaptures.add(result);
  return result;
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

type RecordData = Record<string, unknown>;
function fields(value: unknown, keys: string[]): asserts value is RecordData {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some(key => !keys.includes(key))
  )
    throw new Error('Capture contains missing or unsupported fields.');
}
function text(value: unknown, max = 4096): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > max)
    throw new Error('Invalid capture text.');
}
function list(value: unknown, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error('Capture exceeds its list bound.');
}
export function validateEvidenceLocator(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Missing evidence locator.');
  const data = value as RecordData;
  if (data.kind === 'pdf') {
    fields(data, ['kind', 'page', 'bounds']);
    if (
      !Number.isSafeInteger(data.page) ||
      (data.page as number) < 1 ||
      (data.page as number) > CAPTURE_LIMITS.pdfPages
    )
      throw new Error('Invalid evidence page.');
    if (
      !Array.isArray(data.bounds) ||
      data.bounds.length !== 4 ||
      data.bounds.some(n => typeof n !== 'number' || !Number.isFinite(n)) ||
      data.bounds[2] < 0 ||
      data.bounds[3] < 0
    )
      throw new Error('Invalid evidence bounds.');
  } else if (data.kind === 'figma') {
    fields(data, ['kind', 'nodeId', 'property']);
    text(data.nodeId, 128);
    text(data.property, 256);
  } else if (data.kind === 'website') {
    fields(data, ['kind', 'selector', 'property', 'viewport']);
    text(data.selector);
    text(data.property, 256);
    if (
      !Array.isArray(data.viewport) ||
      data.viewport.length !== 2 ||
      data.viewport.some(n => !Number.isSafeInteger(n) || n < 1 || n > 10000)
    )
      throw new Error('Invalid evidence viewport.');
  } else throw new Error('Unsupported evidence locator.');
}
export function validateCapture(
  raw: unknown
): asserts raw is Omit<GuidelineCapture, 'captureHash'> {
  fields(raw, [
    'schemaVersion',
    'id',
    'kind',
    'identity',
    'capturedAt',
    'scope',
    'observations',
    'extractionVersion',
  ]);
  if (
    raw.schemaVersion !== CAPTURE_VERSION ||
    !['pdf', 'figma', 'website'].includes(raw.kind as string)
  )
    throw new Error('Unsupported capture version or source.');
  text(raw.id, 128);
  text(raw.capturedAt, 64);
  text(raw.extractionVersion, 128);
  if (!Number.isFinite(Date.parse(raw.capturedAt))) throw new Error('Invalid capture date.');
  fields(raw.identity, ['label', 'locator', 'revision', 'sha256']);
  text(raw.identity.label, 160);
  text(raw.identity.sha256, 71);
  if (!/^sha256:[a-f0-9]{64}$/.test(raw.identity.sha256)) throw new Error('Invalid source digest.');
  for (const key of ['locator', 'revision'])
    if (raw.identity[key] !== null) text(raw.identity[key]);
  fields(raw.scope, ['total', 'requested', 'inspected', 'gaps']);
  if (!Number.isSafeInteger(raw.scope.total) || (raw.scope.total as number) < 1)
    throw new Error('Invalid source size.');
  for (const key of ['requested', 'inspected']) {
    list(raw.scope[key], CAPTURE_LIMITS.selectedPages);
    (raw.scope[key] as unknown[]).forEach(item => text(item, 256));
    if (new Set(raw.scope[key] as unknown[]).size !== (raw.scope[key] as unknown[]).length)
      throw new Error('Duplicate capture scope.');
  }
  const requested = raw.scope.requested as string[];
  const inspected = raw.scope.inspected as string[];
  if (!requested.length || inspected.some(scope => !requested.includes(scope)))
    throw new Error('Unrequested capture scope.');
  list(raw.scope.gaps, 100);
  raw.scope.gaps.forEach(gap => {
    fields(gap, ['scope', 'code', 'message']);
    text(gap.scope, 256);
    text(gap.message);
    if (
      !['NO_TEXT', 'TEXT_LIMIT', 'EXTRACTION_FAILED', 'NOT_INSPECTED'].includes(gap.code as string)
    )
      throw new Error('Unknown capture gap.');
  });
  list(raw.observations, CAPTURE_LIMITS.observations);
  const ids = new Map<string, unknown>();
  for (const observation of raw.observations) {
    if (!observation || typeof observation !== 'object') throw new Error('Invalid observation.');
    const item = observation as RecordData;
    fields(
      item,
      item.kind === 'text'
        ? ['id', 'kind', 'text', 'locator']
        : ['id', 'kind', 'literal', 'method', 'value', 'evidenceRefs', 'locator']
    );
    text(item.id, 128);
    validateEvidenceLocator(item.locator);
    const location = item.locator as RecordData;
    if (
      location.kind !== raw.kind ||
      (location.kind === 'pdf' && !inspected.includes(`page:${location.page}`))
    )
      throw new Error('Evidence is outside inspected scope.');
    if (ids.has(item.id)) throw new Error('Duplicate observation.');
    ids.set(item.id, item);
    if (item.kind === 'text') text(item.text, CAPTURE_LIMITS.textCharactersPerPage);
    else if (item.kind === 'color') {
      text(item.literal, 128);
      text(item.value, 7);
      if (
        item.method !== 'stated-hex' ||
        !/^#[A-F0-9]{6}$/.test(item.value) ||
        !statedHexCodes(item.literal).some(code => code.hex === item.value)
      )
        throw new Error('Unsupported numeric authority.');
      list(item.evidenceRefs, 8);
      if (!item.evidenceRefs.length) throw new Error('A stated color needs text evidence.');
      item.evidenceRefs.forEach(ref => text(ref, 128));
    } else throw new Error('Unknown observation kind.');
  }
  for (const item of raw.observations as GuidelineCapture['observations']) {
    if (
      item.kind === 'color' &&
      item.evidenceRefs.some(ref => (ids.get(ref) as RecordData | undefined)?.kind !== 'text')
    )
      throw new Error('Color refers to missing text evidence.');
    if (
      item.kind === 'color' &&
      !item.evidenceRefs.some(ref => {
        const evidence = ids.get(ref) as unknown as TextObservation;
        return (
          canonicalJson(evidence.locator) === canonicalJson(item.locator) &&
          statedHexCodes(evidence.text).some(
            code => code.hex === item.value && code.literal === item.literal
          )
        );
      })
    )
      throw new Error('The stated value does not occur in its cited source text.');
  }
}

/** Untrusted reopen/model boundary: detach, validate, then compare the content digest. */
export function parseCapture(raw: unknown): GuidelineCapture {
  if (raw && typeof raw === 'object' && trustedCaptures.has(raw)) return raw as GuidelineCapture;
  const detached = snapshotColorSystemInertJsonV1(raw, {
    maximumBytes: CAPTURE_LIMITS.captureBytes,
    maximumNodes: 500_000,
    maximumArrayLength: CAPTURE_LIMITS.observations,
  });
  fields(detached, [
    'schemaVersion',
    'id',
    'kind',
    'identity',
    'capturedAt',
    'scope',
    'observations',
    'extractionVersion',
    'captureHash',
  ]);
  const { captureHash, ...input } = detached;
  const result = bindCapture(input as unknown as Omit<GuidelineCapture, 'captureHash'>);
  if (captureHash !== result.captureHash)
    throw new Error('Capture content changed; review the new revision.');
  return result;
}

/** Stable within one source revision, even when it is selected in another batch. */
export function observationId(sourceHash: string, page: number, item: number, suffix: string) {
  return `pdf:${sourceHash.slice(7, 23)}:${page}:${item}:${suffix}`;
}

export function statedHexCodes(text: string): { literal: string; hex: string }[] {
  // Require a printed # or HEX label. Bare six-letter words are not color evidence.
  const pattern = /(?:#|\bhex\s*(?:code\s*)?[:=]?\s*)([\da-f]{6}|[\da-f]{3})(?![a-z\d])/gi;
  return [...text.matchAll(pattern)].map(match => ({
    literal: match[0],
    hex: `#${(match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1]).toUpperCase()}`,
  }));
}

export async function digestSource(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return `sha256:${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')}`;
}
