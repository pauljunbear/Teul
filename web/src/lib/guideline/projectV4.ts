import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { utf8ByteLength } from '../../../../src/lib/utf8';
import { parseCaptureAny, type GuidelineCaptureAny } from './evidenceV2';
import { guidelineHash } from './review';
import { readGuidelineSelection, PROJECT_BYTES, type GuidelineSelection } from './project';
import { parseGuidelineDraftV4, type GuidelineReviewDraftV4 } from './reviewV4';
import { compileGuidelineReviewV4, REVIEW_V4_VERSION, type ReviewedGuidelineV4 } from './reviewV4';
import {
  readGuidelineProjectLatest as readEarlierProject,
  type GuidelineProjectLatestReadResult as EarlierReadResult,
} from './projectV3';

export const PROJECT_V4_VERSION = 'teul.guideline-project.v4' as const;
export interface GuidelineProjectInputV4 {
  capture: GuidelineCaptureAny;
  draft: GuidelineReviewDraftV4;
  review: ReviewedGuidelineV4 | null;
  selection: GuidelineSelection | null;
}
export interface GuidelineProjectV4 extends GuidelineProjectInputV4 {
  schemaVersion: typeof PROJECT_V4_VERSION;
  projectHash: string;
}
export type ProjectReadResultV4 =
  | { status: 'opened'; format: 'project' | 'legacy-review'; project: GuidelineProjectV4 }
  | { status: 'read-only'; version: string };
export type GuidelineProjectLatestReadResult = EarlierReadResult | ProjectReadResultV4;

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
function readReview(
  capture: GuidelineCaptureAny,
  raw: unknown,
  expectedDraft?: GuidelineReviewDraftV4
): ReviewedGuidelineV4 {
  fields(raw, ['schemaVersion', 'captureHash', 'model', 'decision', 'reviewHash']);
  fields(raw.decision, ['actor', 'reviewedAt', 'draft']);
  fields(raw.decision.actor, ['kind', 'ref']);
  if (expectedDraft && canonicalJson(raw.decision.draft) !== canonicalJson(expectedDraft))
    throw new Error(
      'The draft changed after review. Apply it again before retaining a selected design.'
    );
  const review = compileGuidelineReviewV4(
    capture,
    expectedDraft ?? (raw.decision.draft as GuidelineReviewDraftV4),
    raw.decision.actor as ReviewedGuidelineV4['decision']['actor'],
    raw.decision.reviewedAt as string
  );
  if (canonicalJson(raw) !== canonicalJson(review))
    throw new Error('Saved review no longer matches its source and decisions.');
  return review;
}

/** V4 preserves confirmed transcriptions and rendered samples with their witnesses; original PDF bytes stay separate and no locator is fetched. */
export function buildGuidelineProjectV4(input: GuidelineProjectInputV4): GuidelineProjectV4 {
  const raw = snapshotColorSystemInertJsonV1(input, policy);
  fields(raw, ['capture', 'draft', 'review', 'selection']);
  const capture = parseCaptureAny(Object.getOwnPropertyDescriptor(input, 'capture')!.value);
  return buildDetachedProject(
    raw,
    capture,
    parseGuidelineDraftV4(capture, Object.getOwnPropertyDescriptor(input, 'draft')!.value)
  );
}
function buildDetachedProject(
  raw: Record<string, unknown>,
  capture = parseCaptureAny(raw.capture),
  validatedDraft?: GuidelineReviewDraftV4
): GuidelineProjectV4 {
  if (capture.kind !== 'pdf') throw new Error('This project version supports PDF captures only.');
  if (
    capture.scope.requested.some(
      scope => !/^page:[1-9]\d*$/.test(scope) || Number(scope.slice(5)) > capture.scope.total
    )
  )
    throw new Error('Project contains an invalid PDF page range.');
  const draft = validatedDraft ?? parseGuidelineDraftV4(capture, raw.draft);
  const review = raw.review === null ? null : readReview(capture, raw.review, draft);
  const selection = readGuidelineSelection(review, raw.selection);
  const content = { schemaVersion: PROJECT_V4_VERSION, capture, draft, review, selection };
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
    record?.schemaVersion !== PROJECT_V4_VERSION &&
    legacyReview?.schemaVersion !== REVIEW_V4_VERSION
  )
    return readEarlierProject(text);
  const raw = snapshotColorSystemInertJsonV1(parsed, policy);
  if (legacyReview) {
    fields(raw, ['capture', 'review']);
    const capture = parseCaptureAny(raw.capture);
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
