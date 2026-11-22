import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { parseCaptureAny, type GuidelineCaptureAny } from './evidenceV2';
import { guidelineHash, suggestGuidelineReviewFromCapture } from './review';
import {
  compileGuidelineStructureInventoryModel,
  parseGuidelineStructureDraftFromInventory,
  upgradeGuidelineDraftV2,
  type GuidelineReviewDraftV2,
  type ReviewedGuidelineV2,
} from './reviewV2';
import { parseReviewedValueDraft, type ReviewedValueDraft } from './reviewedValues';
import { createGuidelineSourceInventory } from './sourceInventory';

export const REVIEW_V4_VERSION = 'teul.guideline-review.v4' as const;
export interface GuidelineReviewDraftV4 extends GuidelineReviewDraftV2 {
  reviewedValues: ReviewedValueDraft;
}
export interface ReviewedGuidelineV4 extends Omit<
  ReviewedGuidelineV2,
  'schemaVersion' | 'decision'
> {
  schemaVersion: typeof REVIEW_V4_VERSION;
  decision: Omit<ReviewedGuidelineV2['decision'], 'draft'> & { draft: GuidelineReviewDraftV4 };
}
export function suggestGuidelineReviewV4(capture: GuidelineCaptureAny): GuidelineReviewDraftV4 {
  return {
    ...upgradeGuidelineDraftV2(suggestGuidelineReviewFromCapture(parseCaptureAny(capture))),
    reviewedValues: { witnesses: [], candidates: [], confirmations: [] },
  };
}
export function parseGuidelineDraftV4(
  capture: GuidelineCaptureAny,
  raw: unknown
): GuidelineReviewDraftV4 {
  const source = parseCaptureAny(capture);
  // Inspect only own data descriptors before splitting the small editable structure from
  // the detached, frozen overlay. Keeping its identity avoids decoding saved crops on edits.
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(raw))
  )
    throw new Error('Reviewed draft requires an inert record.');
  const keys = Reflect.ownKeys(raw);
  if (
    keys.length !== 5 ||
    keys.some(
      key =>
        typeof key !== 'string' ||
        !['captureHash', 'colors', 'reviewedValues', 'rules', 'scales'].includes(key)
    )
  )
    throw new Error('Reviewed draft contains missing or unsupported fields.');
  const fields: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)!;
    if (!descriptor.enumerable || !('value' in descriptor))
      throw new Error('Reviewed draft rejects accessors and hidden fields.');
    fields[key as string] = descriptor.value;
  }
  const { reviewedValues: rawValues, ...rawStructure } = fields;
  // A structure is bounded to 2 MiB and the overlay to 6 MiB independently.
  const structure = snapshotColorSystemInertJsonV1(rawStructure);
  const reviewedValues = parseReviewedValueDraft(source, rawValues);
  const inventory = createGuidelineSourceInventory(source, reviewedValues);
  return { ...parseGuidelineStructureDraftFromInventory(inventory, structure), reviewedValues };
}
/** Explicit numeric decisions feed the same relationship/compiler path as captured source values. */
export function compileGuidelineReviewV4(
  capture: GuidelineCaptureAny,
  rawDraft: GuidelineReviewDraftV4,
  actor: ReviewedGuidelineV2['decision']['actor'],
  reviewedAt = new Date().toISOString()
): ReviewedGuidelineV4 {
  const source = parseCaptureAny(capture);
  const draft = parseGuidelineDraftV4(source, rawDraft);
  const { reviewedValues, ...structure } = draft;
  const inventory = createGuidelineSourceInventory(source, reviewedValues);
  const model = compileGuidelineStructureInventoryModel(
    inventory,
    structure,
    actor,
    reviewedAt,
    guidelineHash(draft)
  );
  const content = {
    schemaVersion: REVIEW_V4_VERSION,
    captureHash: source.captureHash,
    model,
    decision: { actor: { ...actor }, reviewedAt, draft },
  };
  return { ...content, reviewHash: guidelineHash(content) };
}
