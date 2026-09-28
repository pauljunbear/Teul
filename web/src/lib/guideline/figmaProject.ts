import type { FigmaCapturePacket } from '../../../../services/guideline-intake/src/figmaProtocol';
import { createFigmaNativeInventory } from './figmaInventory';
import {
  compileFigmaReview,
  parseFigmaReviewDraft,
  FIGMA_DRAFT_VERSION,
  FIGMA_REVIEW_VERSION,
} from './figmaReview';
import {
  createSourceProjectCompiler,
  type SourceProjectInput,
  type SourceProject,
} from './sourceProject';
export const FIGMA_PROJECT_VERSION = 'teul.figma-project.v1' as const;
export type FigmaProjectInput = SourceProjectInput<
  FigmaCapturePacket,
  typeof FIGMA_DRAFT_VERSION,
  typeof FIGMA_REVIEW_VERSION
>;
export type FigmaProject = SourceProject<
  FigmaCapturePacket,
  typeof FIGMA_DRAFT_VERSION,
  typeof FIGMA_REVIEW_VERSION,
  typeof FIGMA_PROJECT_VERSION
>;
const compiler = createSourceProjectCompiler({
  schemaVersion: FIGMA_PROJECT_VERSION,
  versionPrefix: 'teul.figma-project.',
  label: 'native Figma',
  inventory: createFigmaNativeInventory,
  parseDraft: parseFigmaReviewDraft,
  compileReview: compileFigmaReview,
});
export const buildFigmaProject = compiler.build;
export const readFigmaProject = compiler.read;
