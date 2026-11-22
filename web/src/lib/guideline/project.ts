import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import {
  compileGradientV1,
  parseGradientV1,
  type GradientDesignV1,
  type GradientInputV1,
  GRADIENT_V1,
} from '../../../../src/lib/colorSystemGradientV1';
import { utf8ByteLength } from '../../../../src/lib/utf8';
import { parseCapture, type GuidelineCapture } from './evidence';
import {
  compileGuidelineReview,
  guidelineHash,
  guidelineOperationIssues,
  parseGuidelineDraft,
  type GuidelineReviewDraft,
  type ReviewedGuideline,
} from './review';

export const PROJECT_VERSION = 'teul.guideline-project.v1' as const;
export const PROJECT_BYTES = 16 * 1024 * 1024;
export interface GuidelineSelection {
  kind: 'gradient';
  scope: 'brand' | 'product';
  design: GradientDesignV1;
}
export interface GuidelineProjectInput {
  capture: GuidelineCapture;
  draft: GuidelineReviewDraft;
  review: ReviewedGuideline | null;
  selection: GuidelineSelection | null;
}
export interface GuidelineProject extends GuidelineProjectInput {
  schemaVersion: typeof PROJECT_VERSION;
  projectHash: string;
}
export type ProjectReadResult =
  | { status: 'opened'; format: 'project' | 'legacy-review'; project: GuidelineProject }
  | { status: 'read-only'; version: string };

const policy = { maximumBytes: PROJECT_BYTES, maximumNodes: 800_000 };
function fields(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== keys.sort().join(',')
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

/** Recompile decisions; cached models, adopted rules and claimed reviewer identity are not authority. */
function readReview(capture: GuidelineCapture, raw: unknown): ReviewedGuideline {
  fields(raw, ['schemaVersion', 'captureHash', 'model', 'decision', 'reviewHash']);
  fields(raw.decision, ['actor', 'reviewedAt', 'draft']);
  fields(raw.decision.actor, ['kind', 'ref']);
  const result = compileGuidelineReview(
    capture,
    raw.decision.draft as GuidelineReviewDraft,
    raw.decision.actor as ReviewedGuideline['decision']['actor'],
    raw.decision.reviewedAt as string
  );
  if (canonicalJson(raw) !== canonicalJson(result))
    throw new Error('Saved review no longer matches its source and decisions.');
  return result;
}

/** Shared by the current two-stop editor and replay; arbitrary embedded paint cannot bypass review. */
export function guidelineSourceGradientInput(
  review: Pick<ReviewedGuideline, 'model'>,
  options: { modeId: string; first: string; last: string; angle: number; briefHash: string }
): GradientInputV1 {
  return {
    sourceModelHash: review.model.modelHash,
    briefHash: options.briefHash,
    angleDegrees: options.angle,
    route: { space: 'oklab' },
    stops: [options.first, options.last].map((id, position) => {
      const color = review.model.colors.find(item => item.id === id);
      if (!color) throw new Error('A selected gradient anchor is missing from the source review.');
      const value = color.valuesByMode[options.modeId];
      if (!value) throw new Error('A selected gradient anchor has no reviewed value in this mode.');
      return { position, value, locked: true, sourceColorId: id };
    }),
  };
}

/** The legacy PDF selection retains its Source binding, envelope and brief hash. */
export function createGuidelineGradient(
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>,
  scope: 'brand' | 'product',
  first: string,
  last: string,
  angle: number
): GuidelineSelection {
  return {
    kind: 'gradient',
    scope,
    design: compileGradientV1(pdfGradientInput(review, scope, first, last, angle)),
  };
}
function pdfGradientInput(
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>,
  scope: 'brand' | 'product',
  first: string,
  last: string,
  angle: number
): GradientInputV1 {
  if (!['brand', 'product'].includes(scope)) throw new Error('Unsupported gradient use.');
  const issues = guidelineOperationIssues(review, 'gradient', scope);
  if (issues.length) throw new Error(issues[0]);
  return guidelineSourceGradientInput(review, {
    modeId: 'Source',
    briefHash: guidelineHash({ review: review.reviewHash, scope, first, last, angle }),
    first,
    last,
    angle,
  });
}
/** Validate exact source inputs once, then let the paint reader handle numerical compatibility. */
export function readGuidelineSourceGradient(
  saved: GradientDesignV1,
  input: GradientInputV1
): GradientDesignV1 {
  const expected = {
    ...input,
    schemaVersion: GRADIENT_V1,
    compiledPaint: saved.compiledPaint,
    designHash: saved.designHash,
  };
  if (canonicalJson(expected) !== canonicalJson(saved))
    throw new Error(
      'Selected gradient differs from its source anchors, mode, review or compiled paint.'
    );
  return parseGradientV1(saved);
}

/** Rebuild selected paint through the same source-bound compiler in every project version. */
export function readGuidelineSelection(
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'> | null,
  raw: unknown
): GuidelineSelection | null {
  let selection: GuidelineSelection | null = null;
  if (raw !== null) {
    if (!review) throw new Error('A selected design requires an applied source review.');
    fields(raw, ['kind', 'scope', 'design']);
    const saved = raw as unknown as GuidelineSelection;
    if (
      saved.kind !== 'gradient' ||
      !saved.design ||
      !Array.isArray(saved.design.stops) ||
      saved.design.stops.length !== 2
    )
      throw new Error('This project editor supports two source-anchored gradient stops.');
    const input = pdfGradientInput(
      review,
      saved.scope,
      saved.design.stops[0]?.sourceColorId ?? '',
      saved.design.stops[1]?.sourceColorId ?? '',
      saved.design.angleDegrees
    );
    selection = {
      kind: 'gradient',
      scope: saved.scope,
      design: readGuidelineSourceGradient(saved.design, input),
    };
  }
  return selection;
}

/** Original PDF bytes stay separate. This bounded envelope contains only inert local evidence. */
export function buildGuidelineProject(input: GuidelineProjectInput): GuidelineProject {
  const raw = snapshotColorSystemInertJsonV1(input, policy);
  fields(raw, ['capture', 'draft', 'review', 'selection']);
  // Detachment above rejects accessors. Preserve a locally captured immutable identity for replay.
  const capture = parseCapture(Object.getOwnPropertyDescriptor(input, 'capture')!.value);
  return buildDetachedProject(raw, capture);
}

function buildDetachedProject(
  raw: Record<string, unknown>,
  capture = parseCapture(raw.capture)
): GuidelineProject {
  if (capture.kind !== 'pdf') throw new Error('This project version supports PDF captures only.');
  if (
    capture.scope.requested.some(
      scope => !/^page:[1-9]\d*$/.test(scope) || Number(scope.slice(5)) > capture.scope.total
    )
  )
    throw new Error('Project contains an invalid PDF page range.');
  const draft = parseGuidelineDraft(capture, raw.draft);
  const review = raw.review === null ? null : readReview(capture, raw.review);
  if (review && canonicalJson(review.decision.draft) !== canonicalJson(draft))
    throw new Error(
      'The draft changed after review. Apply it again before retaining a selected design.'
    );
  const selection = readGuidelineSelection(review, raw.selection);
  const content = { schemaVersion: PROJECT_VERSION, capture, draft, review, selection };
  const result = { ...content, projectHash: guidelineHash(content) };
  if (utf8ByteLength(JSON.stringify(result)) > PROJECT_BYTES)
    throw new Error('Project exceeds the 16 MiB file limit.');
  return freeze(result);
}

/** Callers retain the original File, including future bytes; never activate a read-only result. */
export function readGuidelineProject(text: string): ProjectReadResult {
  if (utf8ByteLength(text) > PROJECT_BYTES)
    throw new Error('Choose a project smaller than 16 MiB.');
  const parsed: unknown = JSON.parse(text);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const version = (parsed as Record<string, unknown>).schemaVersion;
    if (
      typeof version === 'string' &&
      version.startsWith('teul.guideline-project.') &&
      version !== PROJECT_VERSION
    )
      return { status: 'read-only', version: version.slice(0, 128) };
  }
  const raw = snapshotColorSystemInertJsonV1(parsed, policy);
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && !('schemaVersion' in raw)) {
    fields(raw, ['capture', 'review']);
    const capture = parseCapture(raw.capture);
    const review = readReview(capture, raw.review);
    return {
      status: 'opened',
      format: 'legacy-review',
      project: buildDetachedProject(
        {
          capture,
          draft: review.decision.draft,
          review,
          selection: null,
        },
        capture
      ),
    };
  }
  fields(raw, ['schemaVersion', 'capture', 'draft', 'review', 'selection', 'projectHash']);
  if (raw.schemaVersion !== PROJECT_VERSION) throw new Error('Unsupported project format.');
  const result = buildDetachedProject(raw);
  if (result.projectHash !== raw.projectHash) throw new Error('Project content changed.');
  return { status: 'opened', format: 'project', project: result };
}
