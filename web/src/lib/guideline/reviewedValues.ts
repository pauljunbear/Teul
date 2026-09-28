import type { ColorSystemColorValueV2 } from '../../../../src/lib/colorSystemBuilderV2Contracts';
import { canonicalJson, deterministicContentHash } from '../../../../src/lib/colorSystemHashing';
import {
  snapshotColorSystemInertJsonV1,
  serializeColorSystemInertJsonV1,
} from '../../../../src/lib/colorSystemInertJsonV1';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { parseCaptureAny, type GuidelineCaptureAny } from './evidenceV2';
import { parseSingleStatedDigitalColor } from './numericEvidence';

export const REVIEWED_VALUE_LIMITS = Object.freeze({
  witnesses: 16,
  candidates: 256,
  rasterDimension: 256,
  bytes: 6 * 1024 * 1024,
});
export const PDF_REGION_VERSION = 'teul.pdf-region.v1' as const;
export const REVIEWED_VALUE_VERSION = 'teul.reviewed-value.v1' as const;
export interface PdfRegionWitness {
  schemaVersion: 'teul.pdf-region.v1';
  captureHash: string;
  sourceDigest: string;
  page: number;
  pageSize: { width: number; height: number; rotation: number };
  bounds: [number, number, number, number];
  render: {
    engine: 'pdfjs';
    version: '6.3.289';
    scale: number;
    width: number;
    height: number;
    colorSpace: 'srgb';
    background: '#FFFFFF';
    sampling: 'nearest-center';
  };
  raster: { width: number; height: number; rgbaBase64: string };
  witnessHash: string;
}
export type PdfRegionWitnessInput = Omit<PdfRegionWitness, 'witnessHash'>;
type CandidateBase = {
  schemaVersion: 'teul.reviewed-value.v1';
  id: string;
  captureHash: string;
  sourceDigest: string;
  witnessHash: string;
  replacesId: string | null;
  value: ColorSystemColorValueV2;
  candidateHash: string;
};
export type ReviewedValueCandidate = CandidateBase &
  (
    | { method: 'transcribed-digital'; literal: string }
    | { method: 'rendered-srgb-sample'; pixel: { x: number; y: number } }
  );
export type ReviewedValueUser = { kind: 'user'; ref: string };
export interface ReviewedValueConfirmation {
  candidateId: string;
  candidateHash: string;
  actor: ReviewedValueUser;
  acceptedAt: string;
  revoked: null | { actor: ReviewedValueUser; revokedAt: string; reason: string };
}
export interface ReviewedValueDraft {
  witnesses: PdfRegionWitness[];
  candidates: ReviewedValueCandidate[];
  confirmations: ReviewedValueConfirmation[];
}
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const digest = /^sha256:[a-f0-9]{64}$/;
const candidateId = /^reviewed-value:[a-f0-9]{64}$/;
const policy = { maximumBytes: REVIEWED_VALUE_LIMITS.bytes, maximumNodes: 100_000 };
const trustedCandidates = new WeakSet<object>();
const trustedDrafts = new WeakMap<object, GuidelineCaptureAny>();
const trustedWitnesses = new WeakMap<object, GuidelineCaptureAny>();
// Never expose the retained bytes: typed arrays cannot be deeply frozen.
const rasterBytes = new WeakMap<object, Uint8Array>();
function fields(raw: unknown, expected: readonly string[]): asserts raw is Record<string, unknown> {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).length !== expected.length ||
    Object.keys(raw).some(key => !expected.includes(key))
  )
    throw new Error('Reviewed value contains missing or unsupported fields.');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function finite(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    !Object.is(value, -0) &&
    value >= minimum &&
    value <= maximum
  );
}
function integer(value: unknown, minimum: number, maximum: number): value is number {
  return finite(value, minimum, maximum) && Number.isSafeInteger(value);
}
function date(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error('Value confirmation requires a valid date.');
}
function user(raw: unknown): asserts raw is ReviewedValueUser {
  fields(raw, ['kind', 'ref']);
  if (raw.kind !== 'user' || typeof raw.ref !== 'string' || !raw.ref.trim() || raw.ref.length > 128)
    throw new Error('A reviewed value requires an explicit user confirmation.');
}
function decodeRaster(raw: unknown): Uint8Array {
  fields(raw, ['width', 'height', 'rgbaBase64']);
  if (
    !integer(raw.width, 1, 256) ||
    !integer(raw.height, 1, 256) ||
    typeof raw.rgbaBase64 !== 'string'
  )
    throw new Error('Region raster exceeds its dimension bound.');
  const count = raw.width * raw.height * 4;
  if (
    raw.rgbaBase64.length !== 4 * Math.ceil(count / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.rgbaBase64)
  )
    throw new Error('Region raster must contain canonical base64 RGBA bytes.');
  const binary = atob(raw.rgbaBase64);
  if (binary.length !== count || btoa(binary) !== raw.rgbaBase64)
    throw new Error('Region raster byte length or base64 spelling changed.');
  const bytes = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    bytes[index] = binary.charCodeAt(index);
    if (index % 4 === 3 && bytes[index] !== 255)
      throw new Error('Rendered region pixels must be opaque on the declared white background.');
  }
  return bytes;
}
export function decodeWitnessRgba(witness: PdfRegionWitness): Uint8Array {
  if (trustedWitnesses.has(witness)) return rasterBytes.get(witness.raster)!.slice();
  const detached = snapshotColorSystemInertJsonV1(witness, policy) as PdfRegionWitness;
  return decodeRaster(detached.raster);
}
function validateWitness(
  capture: GuidelineCaptureAny,
  input: unknown
): asserts input is PdfRegionWitnessInput {
  fields(input, [
    'schemaVersion',
    'captureHash',
    'sourceDigest',
    'page',
    'pageSize',
    'bounds',
    'render',
    'raster',
  ]);
  if (
    input.schemaVersion !== 'teul.pdf-region.v1' ||
    input.captureHash !== capture.captureHash ||
    input.sourceDigest !== capture.identity.sha256 ||
    capture.kind !== 'pdf' ||
    !integer(input.page, 1, capture.scope.total) ||
    !capture.scope.requested.includes(`page:${input.page}`) ||
    !capture.scope.inspected.includes(`page:${input.page}`)
  )
    throw new Error('The source region belongs to a different or uninspected capture.');
  fields(input.pageSize, ['width', 'height', 'rotation']);
  if (
    !finite(input.pageSize.width, Number.MIN_VALUE, 100_000) ||
    !finite(input.pageSize.height, Number.MIN_VALUE, 100_000) ||
    !integer(input.pageSize.rotation, 0, 270) ||
    ![0, 90, 180, 270].includes(input.pageSize.rotation)
  )
    throw new Error('Invalid source page dimensions or rotation.');
  if (
    !Array.isArray(input.bounds) ||
    input.bounds.length !== 4 ||
    !finite(input.bounds[0], 0, input.pageSize.width) ||
    !finite(input.bounds[1], 0, input.pageSize.height) ||
    !finite(input.bounds[2], Number.MIN_VALUE, input.pageSize.width) ||
    !finite(input.bounds[3], Number.MIN_VALUE, input.pageSize.height) ||
    input.bounds[0] + input.bounds[2] > input.pageSize.width ||
    input.bounds[1] + input.bounds[3] > input.pageSize.height
  )
    throw new Error('Choose a nonempty region inside the selected page.');
  fields(input.render, [
    'engine',
    'version',
    'scale',
    'width',
    'height',
    'colorSpace',
    'background',
    'sampling',
  ]);
  const render = input.render;
  if (
    render.engine !== 'pdfjs' ||
    render.version !== '6.3.289' ||
    render.colorSpace !== 'srgb' ||
    render.background !== '#FFFFFF' ||
    render.sampling !== 'nearest-center' ||
    !finite(render.scale, Number.MIN_VALUE, 8) ||
    !integer(render.width, 1, 8192) ||
    !integer(render.height, 1, 8192) ||
    render.width * render.height > 16_777_216 ||
    render.width !== Math.ceil(input.pageSize.width * render.scale) ||
    render.height !== Math.ceil(input.pageSize.height * render.scale)
  )
    throw new Error('Unsupported or inconsistent PDF renderer metadata.');
  rasterBytes.set(input.raster as object, decodeRaster(input.raster));
}
function readWitness(
  capture: GuidelineCaptureAny,
  raw: unknown,
  alreadyDetached = false
): PdfRegionWitness {
  if (raw && typeof raw === 'object' && trustedWitnesses.get(raw) === capture)
    return raw as PdfRegionWitness;
  const detached = alreadyDetached ? raw : snapshotColorSystemInertJsonV1(raw, policy);
  fields(detached, [
    'schemaVersion',
    'captureHash',
    'sourceDigest',
    'page',
    'pageSize',
    'bounds',
    'render',
    'raster',
    'witnessHash',
  ]);
  const { witnessHash, ...input } = detached;
  validateWitness(capture, input);
  if (witnessHash !== hash(input)) throw new Error('Source region witness changed.');
  const result = freeze({ ...input, witnessHash: witnessHash as string });
  trustedWitnesses.set(result, capture);
  return result;
}
export function bindPdfRegionWitness(
  capture: GuidelineCaptureAny,
  input: PdfRegionWitnessInput
): PdfRegionWitness {
  const source = parseCaptureAny(capture);
  const detached = snapshotColorSystemInertJsonV1(input, policy);
  validateWitness(source, detached);
  const result = freeze({ ...detached, witnessHash: hash(detached) });
  trustedWitnesses.set(result, source);
  return result;
}
function replacement(value: unknown): asserts value is string | null {
  if (value !== null && (typeof value !== 'string' || !candidateId.test(value)))
    throw new Error('A replacement must reference a reviewed value candidate.');
}
function candidate(
  capture: GuidelineCaptureAny,
  witness: PdfRegionWitness,
  method: { method: 'transcribed-digital'; literal: string } | { method: 'rendered-srgb-sample' },
  replacesId: string | null
): ReviewedValueCandidate {
  replacement(replacesId);
  const source = parseCaptureAny(capture);
  const region = readWitness(source, witness);
  let specifics;
  if (method.method === 'transcribed-digital') {
    const code = parseSingleStatedDigitalColor(method.literal);
    specifics = { method: method.method, literal: code.literal, value: code.value };
  } else {
    const pixel = {
      x: Math.floor(region.raster.width / 2),
      y: Math.floor(region.raster.height / 2),
    };
    const bytes = rasterBytes.get(region.raster)!,
      offset = (pixel.y * region.raster.width + pixel.x) * 4;
    specifics = {
      method: method.method,
      pixel,
      value: buildColorSystemSrgbValueV1({
        r: bytes[offset] / 255,
        g: bytes[offset + 1] / 255,
        b: bytes[offset + 2] / 255,
      }),
    };
  }
  const content = {
    schemaVersion: 'teul.reviewed-value.v1' as const,
    captureHash: source.captureHash,
    sourceDigest: source.identity.sha256,
    witnessHash: region.witnessHash,
    replacesId,
    ...specifics,
  };
  const candidateHash = hash(content);
  const result = freeze({
    ...content,
    id: `reviewed-value:${candidateHash.slice(7)}`,
    candidateHash,
  });
  trustedCandidates.add(result);
  return result;
}
export function createTranscribedValue(
  capture: GuidelineCaptureAny,
  witness: PdfRegionWitness,
  literal: string,
  replacesId: string | null = null
): ReviewedValueCandidate {
  return candidate(capture, witness, { method: 'transcribed-digital', literal }, replacesId);
}
export function sampleRenderedValue(
  capture: GuidelineCaptureAny,
  witness: PdfRegionWitness,
  replacesId: string | null = null
): ReviewedValueCandidate {
  return candidate(capture, witness, { method: 'rendered-srgb-sample' }, replacesId);
}
export function confirmReviewedValue(
  value: ReviewedValueCandidate,
  actor: ReviewedValueUser,
  acceptedAt: string
): ReviewedValueConfirmation {
  if (!trustedCandidates.has(value))
    throw new Error('Validate the source value before confirming it.');
  const detached = snapshotColorSystemInertJsonV1(actor);
  user(detached);
  date(acceptedAt);
  return freeze({
    candidateId: value.id,
    candidateHash: value.candidateHash,
    actor: detached,
    acceptedAt,
    revoked: null,
  });
}
function validateConfirmation(raw: unknown): asserts raw is ReviewedValueConfirmation {
  fields(raw, ['candidateId', 'candidateHash', 'actor', 'acceptedAt', 'revoked']);
  if (
    typeof raw.candidateId !== 'string' ||
    !candidateId.test(raw.candidateId) ||
    typeof raw.candidateHash !== 'string' ||
    !digest.test(raw.candidateHash)
  )
    throw new Error('Invalid value confirmation identity.');
  user(raw.actor);
  date(raw.acceptedAt);
  if (raw.revoked !== null) {
    fields(raw.revoked, ['actor', 'revokedAt', 'reason']);
    user(raw.revoked.actor);
    date(raw.revoked.revokedAt);
    if (
      Date.parse(raw.revoked.revokedAt) < Date.parse(raw.acceptedAt) ||
      typeof raw.revoked.reason !== 'string' ||
      !raw.revoked.reason.trim() ||
      raw.revoked.reason.length > 4096
    )
      throw new Error('A revocation requires a reason and a date after acceptance.');
  }
}
export function revokeReviewedValue(
  confirmation: ReviewedValueConfirmation,
  actor: ReviewedValueUser,
  revokedAt: string,
  reason: string
): ReviewedValueConfirmation {
  const previous = snapshotColorSystemInertJsonV1(confirmation);
  validateConfirmation(previous);
  const raw = snapshotColorSystemInertJsonV1({
    ...previous,
    revoked: { actor, revokedAt, reason },
  });
  validateConfirmation(raw);
  return freeze(raw);
}
export function parseReviewedValueDraft(
  capture: GuidelineCaptureAny,
  raw: unknown
): ReviewedValueDraft {
  const source = parseCaptureAny(capture);
  if (raw && typeof raw === 'object' && trustedDrafts.get(raw) === source)
    return raw as ReviewedValueDraft;
  const input = snapshotColorSystemInertJsonV1(raw, policy);
  fields(input, ['witnesses', 'candidates', 'confirmations']);
  if (
    !Array.isArray(input.witnesses) ||
    input.witnesses.length > REVIEWED_VALUE_LIMITS.witnesses ||
    !Array.isArray(input.candidates) ||
    input.candidates.length > REVIEWED_VALUE_LIMITS.candidates ||
    !Array.isArray(input.confirmations) ||
    input.confirmations.length > REVIEWED_VALUE_LIMITS.candidates
  )
    throw new Error('Reviewed values exceed their witness or candidate limits.');
  const witnesses = input.witnesses.map(value => readWitness(source, value, true));
  const witnessByHash = new Map(witnesses.map(value => [value.witnessHash, value]));
  if (witnessByHash.size !== witnesses.length) throw new Error('Duplicate source region witness.');
  const candidates = input.candidates.map(raw => {
    const item = raw as ReviewedValueCandidate;
    if (!item || typeof item !== 'object') throw new Error('Invalid reviewed value candidate.');
    const witness = witnessByHash.get(item.witnessHash);
    if (!witness || !['transcribed-digital', 'rendered-srgb-sample'].includes(item.method))
      throw new Error('A value requires its retained source witness and method.');
    const rebuilt = candidate(
      source,
      witness,
      item.method === 'transcribed-digital'
        ? { method: item.method, literal: item.literal }
        : { method: item.method },
      item.replacesId
    );
    if (serializeColorSystemInertJsonV1(rebuilt) !== serializeColorSystemInertJsonV1(raw))
      throw new Error('Reviewed value differs from its literal, source region or sampled pixel.');
    return rebuilt;
  });
  const candidateById = new Map(candidates.map(value => [value.id, value]));
  if (
    candidateById.size !== candidates.length ||
    candidates.some(item => source.observations.some(observation => observation.id === item.id))
  )
    throw new Error('Duplicate or colliding reviewed value identity.');
  const replaced = new Set<string>();
  for (const item of candidates) {
    if (item.replacesId === null) continue;
    const previous = candidateById.get(item.replacesId);
    if (!previous || previous.id === item.id || replaced.has(previous.id))
      throw new Error('Invalid or ambiguous reviewed value replacement.');
    replaced.add(previous.id);
    const seen = new Set([item.id]);
    let next: ReviewedValueCandidate | undefined = previous;
    while (next) {
      if (seen.has(next.id)) throw new Error('Cyclic reviewed value replacement.');
      seen.add(next.id);
      next = next.replacesId === null ? undefined : candidateById.get(next.replacesId);
    }
  }
  const confirmationIds = new Set<string>();
  const confirmations = input.confirmations.map(raw => {
    validateConfirmation(raw);
    if (
      confirmationIds.has(raw.candidateId) ||
      candidateById.get(raw.candidateId)?.candidateHash !== raw.candidateHash
    )
      throw new Error('Value confirmation is duplicate or stale.');
    confirmationIds.add(raw.candidateId);
    return freeze(raw);
  });
  const result = freeze({ witnesses, candidates, confirmations });
  trustedDrafts.set(result, source);
  return result;
}

/** Call only with a parsed draft; the compiler still checks every included candidate. */
export function isReviewedValueAvailable(draft: ReviewedValueDraft, id: string): boolean {
  const value = draft.candidates.find(item => item.id === id);
  const confirmation = draft.confirmations.find(item => item.candidateId === id);
  return Boolean(
    value &&
    confirmation &&
    confirmation.candidateHash === value.candidateHash &&
    confirmation.revoked === null &&
    !draft.candidates.some(item => item.replacesId === id)
  );
}
