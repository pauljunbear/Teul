import { buildFigmaNativeModel, parseFigmaProfileDecision } from './figmaModel';
import { assertFigmaNativeInventory, figmaNativeId } from './figmaInventory';
import { figmaSourceStatements } from './figmaStatements';
import { createSourceReviewCompiler } from './sourceReview';
import type {
  SourceReviewColor,
  SourceReviewDraft,
  SourceReviewedSource,
  SourceReviewScale,
  SourceReviewStatement,
} from './sourceReviewContracts';
export { figmaSourceStatements, type FigmaSourceStatement } from './figmaStatements';

export const FIGMA_DRAFT_VERSION = 'teul.figma-review-draft.v1' as const;
export const FIGMA_REVIEW_VERSION = 'teul.figma-reviewed.v1' as const;
export type FigmaReviewColor = SourceReviewColor;
export type FigmaReviewStatement = SourceReviewStatement;
export type FigmaReviewScale = SourceReviewScale;
export type FigmaReviewDraft = SourceReviewDraft<typeof FIGMA_DRAFT_VERSION>;
export type FigmaReviewedSource = SourceReviewedSource<
  typeof FIGMA_DRAFT_VERSION,
  typeof FIGMA_REVIEW_VERSION
>;
const compiler = createSourceReviewCompiler({
  draftVersion: FIGMA_DRAFT_VERSION,
  reviewVersion: FIGMA_REVIEW_VERSION,
  assertInventory: assertFigmaNativeInventory,
  statements: figmaSourceStatements,
  parseProfileDecision: parseFigmaProfileDecision,
  buildModel: buildFigmaNativeModel,
  id: figmaNativeId,
  pendingClaimKey: 'native-review-pending',
  scaleModeDescription: 'native mode identities',
});
export const suggestFigmaReview = compiler.suggest;
export const parseFigmaReviewDraft = compiler.parse;
export const compileFigmaReview = compiler.compile;
