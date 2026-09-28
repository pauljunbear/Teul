import { createSourceReviewCompiler } from './sourceReview';
import type { SourceReviewDraft, SourceReviewedSource } from './sourceReviewContracts';
import { assertWebsiteInventory, websiteId } from './websiteInventory';
import {
  buildWebsiteModel,
  parseWebsiteProfileDecision,
  websiteSourceStatements,
} from './websiteModel';

export const WEBSITE_DRAFT_VERSION = 'teul.website-review-draft.v1' as const;
export const WEBSITE_REVIEW_VERSION = 'teul.website-reviewed.v1' as const;
export type WebsiteReviewDraft = SourceReviewDraft<typeof WEBSITE_DRAFT_VERSION>;
export type WebsiteReviewedSource = SourceReviewedSource<
  typeof WEBSITE_DRAFT_VERSION,
  typeof WEBSITE_REVIEW_VERSION
>;
const compiler = createSourceReviewCompiler({
  draftVersion: WEBSITE_DRAFT_VERSION,
  reviewVersion: WEBSITE_REVIEW_VERSION,
  assertInventory: assertWebsiteInventory,
  statements: websiteSourceStatements,
  buildModel: buildWebsiteModel,
  parseProfileDecision: parseWebsiteProfileDecision,
  id: websiteId,
  pendingClaimKey: 'website-review-pending',
  scaleModeDescription: 'the captured environment',
});
export const suggestWebsiteReview = compiler.suggest;
export const parseWebsiteReviewDraft = compiler.parse;
export const compileWebsiteReview = compiler.compile;
