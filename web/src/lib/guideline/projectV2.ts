import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { utf8ByteLength } from '../../../../src/lib/utf8';
import { parseCapture, type GuidelineCapture } from './evidence';
import { guidelineHash } from './review';
import {
  readGuidelineSelection,
  PROJECT_BYTES,
  readGuidelineProject,
  type GuidelineSelection,
  type ProjectReadResult,
} from './project';
import {
  compileGuidelineReviewV2,
  parseGuidelineDraftV2,
  REVIEW_V2_VERSION,
  type GuidelineReviewDraftV2,
  type ReviewedGuidelineV2,
} from './reviewV2';

export const PROJECT_V2_VERSION = 'teul.guideline-project.v2' as const;
export interface GuidelineProjectInputV2 {
  capture: GuidelineCapture;
  draft: GuidelineReviewDraftV2;
  review: ReviewedGuidelineV2 | null;
  selection: GuidelineSelection | null;
}
export interface GuidelineProjectV2 extends GuidelineProjectInputV2 {
  schemaVersion: typeof PROJECT_V2_VERSION;
  projectHash: string;
}
export type ProjectReadResultV2 =
  | { status: 'opened'; format: 'project' | 'legacy-review'; project: GuidelineProjectV2 }
  | { status: 'read-only'; version: string };
export type GuidelineProjectReadResult = ProjectReadResult | ProjectReadResultV2;

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
function readReview(capture: GuidelineCapture, raw: unknown): ReviewedGuidelineV2 {
  fields(raw, ['schemaVersion', 'captureHash', 'model', 'decision', 'reviewHash']);
  fields(raw.decision, ['actor', 'reviewedAt', 'draft']);
  fields(raw.decision.actor, ['kind', 'ref']);
  const review = compileGuidelineReviewV2(
    capture,
    raw.decision.draft as GuidelineReviewDraftV2,
    raw.decision.actor as ReviewedGuidelineV2['decision']['actor'],
    raw.decision.reviewedAt as string
  );
  if (canonicalJson(raw) !== canonicalJson(review))
    throw new Error('Saved review no longer matches its source and decisions.');
  return review;
}

/** V2 adds source structure; original PDF bytes remain separate and no locator is fetched. */
export function buildGuidelineProjectV2(input: GuidelineProjectInputV2): GuidelineProjectV2 {
  const raw = snapshotColorSystemInertJsonV1(input, policy);
  fields(raw, ['capture', 'draft', 'review', 'selection']);
  const capture = parseCapture(Object.getOwnPropertyDescriptor(input, 'capture')!.value);
  return buildDetachedProject(raw, capture);
}
function buildDetachedProject(
  raw: Record<string, unknown>,
  capture = parseCapture(raw.capture)
): GuidelineProjectV2 {
  if (capture.kind !== 'pdf') throw new Error('This project version supports PDF captures only.');
  if (
    capture.scope.requested.some(
      scope => !/^page:[1-9]\d*$/.test(scope) || Number(scope.slice(5)) > capture.scope.total
    )
  )
    throw new Error('Project contains an invalid PDF page range.');
  const draft = parseGuidelineDraftV2(capture, raw.draft);
  const review = raw.review === null ? null : readReview(capture, raw.review);
  if (review && canonicalJson(review.decision.draft) !== canonicalJson(draft))
    throw new Error(
      'The draft changed after review. Apply it again before retaining a selected design.'
    );
  const selection = readGuidelineSelection(review, raw.selection);
  const content = { schemaVersion: PROJECT_V2_VERSION, capture, draft, review, selection };
  const result = { ...content, projectHash: guidelineHash(content) };
  if (utf8ByteLength(JSON.stringify(result)) > PROJECT_BYTES)
    throw new Error('Project exceeds the 16 MiB file limit.');
  return freeze(result);
}

/** V1 goes through its original codec unchanged; only an explicit edit should upgrade its draft. */
export function readGuidelineProjectAny(text: string): GuidelineProjectReadResult {
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
    record?.schemaVersion !== PROJECT_V2_VERSION &&
    legacyReview?.schemaVersion !== REVIEW_V2_VERSION
  )
    return readGuidelineProject(text);
  const raw = snapshotColorSystemInertJsonV1(parsed, policy);
  if (legacyReview) {
    fields(raw, ['capture', 'review']);
    const capture = parseCapture(raw.capture);
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
