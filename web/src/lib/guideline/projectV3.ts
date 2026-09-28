import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { utf8ByteLength } from '../../../../src/lib/utf8';
import { parseCaptureV2, type GuidelineCaptureV2 } from './evidenceV2';
import { guidelineHash } from './review';
import { readGuidelineSelection, PROJECT_BYTES, type GuidelineSelection } from './project';
import { parseGuidelineStructureDraft, type GuidelineReviewDraftV2 } from './reviewV2';
import { compileGuidelineReviewV3, REVIEW_V3_VERSION, type ReviewedGuidelineV3 } from './reviewV3';
import { readGuidelineProjectAny, type GuidelineProjectReadResult } from './projectV2';

export const PROJECT_V3_VERSION = 'teul.guideline-project.v3' as const;
export interface GuidelineProjectInputV3 {
  capture: GuidelineCaptureV2;
  draft: GuidelineReviewDraftV2;
  review: ReviewedGuidelineV3 | null;
  selection: GuidelineSelection | null;
}
export interface GuidelineProjectV3 extends GuidelineProjectInputV3 {
  schemaVersion: typeof PROJECT_V3_VERSION;
  projectHash: string;
}
export type ProjectReadResultV3 =
  | { status: 'opened'; format: 'project' | 'legacy-review'; project: GuidelineProjectV3 }
  | { status: 'read-only'; version: string };
export type GuidelineProjectLatestReadResult = GuidelineProjectReadResult | ProjectReadResultV3;

const policy = { maximumBytes: PROJECT_BYTES, maximumNodes: 800_000 };
function fields(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    throw new Error('Project contains missing or unsupported fields.');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function readReview(capture: GuidelineCaptureV2, raw: unknown): ReviewedGuidelineV3 {
  fields(raw, ['schemaVersion', 'captureHash', 'model', 'decision', 'reviewHash']);
  fields(raw.decision, ['actor', 'reviewedAt', 'draft']);
  fields(raw.decision.actor, ['kind', 'ref']);
  const review = compileGuidelineReviewV3(
    capture,
    raw.decision.draft as GuidelineReviewDraftV2,
    raw.decision.actor as ReviewedGuidelineV3['decision']['actor'],
    raw.decision.reviewedAt as string
  );
  if (canonicalJson(raw) !== canonicalJson(review))
    throw new Error('Saved review no longer matches its source and decisions.');
  return review;
}

/** V3 preserves native source channels; original PDF bytes stay separate and no locator is fetched. */
export function buildGuidelineProjectV3(input: GuidelineProjectInputV3): GuidelineProjectV3 {
  const raw = snapshotColorSystemInertJsonV1(input, policy);
  fields(raw, ['capture', 'draft', 'review', 'selection']);
  const capture = parseCaptureV2(Object.getOwnPropertyDescriptor(input, 'capture')!.value);
  return buildDetachedProject(raw, capture);
}
function buildDetachedProject(
  raw: Record<string, unknown>,
  capture = parseCaptureV2(raw.capture)
): GuidelineProjectV3 {
  if (capture.kind !== 'pdf') throw new Error('This project version supports PDF captures only.');
  if (
    capture.scope.requested.some(
      scope => !/^page:[1-9]\d*$/.test(scope) || Number(scope.slice(5)) > capture.scope.total
    )
  )
    throw new Error('Project contains an invalid PDF page range.');
  const draft = parseGuidelineStructureDraft(capture, raw.draft);
  const review = raw.review === null ? null : readReview(capture, raw.review);
  if (review && canonicalJson(review.decision.draft) !== canonicalJson(draft))
    throw new Error(
      'The draft changed after review. Apply it again before retaining a selected design.'
    );
  const selection = readGuidelineSelection(review, raw.selection);
  const content = { schemaVersion: PROJECT_V3_VERSION, capture, draft, review, selection };
  const result = { ...content, projectHash: guidelineHash(content) };
  if (utf8ByteLength(JSON.stringify(result)) > PROJECT_BYTES)
    throw new Error('Project exceeds the 16 MiB file limit.');
  return freeze(result);
}

/** Earlier projects retain their original strict codecs, review hashes and serialized values. */
export function readGuidelineProjectLatest(text: string): GuidelineProjectLatestReadResult {
  if (utf8ByteLength(text) > PROJECT_BYTES)
    throw new Error('Choose a project smaller than 16 MiB.');
  const parsed: unknown = JSON.parse(text);
  const record =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  const legacyReview =
    record &&
    !('schemaVersion' in record) &&
    record.review &&
    typeof record.review === 'object' &&
    !Array.isArray(record.review)
      ? (record.review as Record<string, unknown>)
      : null;
  if (
    record?.schemaVersion !== PROJECT_V3_VERSION &&
    legacyReview?.schemaVersion !== REVIEW_V3_VERSION
  )
    return readGuidelineProjectAny(text);
  const raw = snapshotColorSystemInertJsonV1(parsed, policy);
  if (legacyReview) {
    fields(raw, ['capture', 'review']);
    const capture = parseCaptureV2(raw.capture);
    const review = readReview(capture, raw.review);
    return {
      status: 'opened',
      format: 'legacy-review',
      project: buildDetachedProject(
        { capture, draft: review.decision.draft, review, selection: null },
        capture
      ),
    };
  }
  fields(raw, ['schemaVersion', 'capture', 'draft', 'review', 'selection', 'projectHash']);
  const project = buildDetachedProject(raw);
  if (project.projectHash !== raw.projectHash) throw new Error('Project content changed.');
  return { status: 'opened', format: 'project', project };
}
