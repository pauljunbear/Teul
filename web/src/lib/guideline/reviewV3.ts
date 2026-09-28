import { parseCaptureV2, type GuidelineCaptureV2 } from './evidenceV2';
import { guidelineHash, suggestGuidelineReviewFromCapture } from './review';
import {
  compileGuidelineStructureModel,
  parseGuidelineStructureDraft,
  upgradeGuidelineDraftV2,
  type GuidelineReviewDraftV2,
  type ReviewedGuidelineV2,
} from './reviewV2';

export const REVIEW_V3_VERSION = 'teul.guideline-review.v3' as const;
export interface ReviewedGuidelineV3 extends Omit<ReviewedGuidelineV2, 'schemaVersion'> {
  schemaVersion: typeof REVIEW_V3_VERSION;
}

export function suggestGuidelineReviewV3(capture: GuidelineCaptureV2): GuidelineReviewDraftV2 {
  return upgradeGuidelineDraftV2(suggestGuidelineReviewFromCapture(parseCaptureV2(capture)));
}

/** Numeric source values change the capture contract; source structure and its engine stay shared. */
export function compileGuidelineReviewV3(
  rawCapture: GuidelineCaptureV2,
  rawDraft: GuidelineReviewDraftV2,
  actor: ReviewedGuidelineV2['decision']['actor'],
  reviewedAt = new Date().toISOString()
): ReviewedGuidelineV3 {
  const capture = parseCaptureV2(rawCapture);
  const draft = parseGuidelineStructureDraft(capture, rawDraft);
  const model = compileGuidelineStructureModel(capture, draft, actor, reviewedAt);
  const content = {
    schemaVersion: REVIEW_V3_VERSION,
    captureHash: capture.captureHash,
    model,
    decision: { actor: { ...actor }, reviewedAt, draft },
  };
  return { ...content, reviewHash: guidelineHash(content) };
}
