import type { WebsiteCapturePacket } from '../../../../services/guideline-intake/src/websiteProtocol';
import { createWebsiteInventory } from './websiteInventory';
import {
  compileWebsiteReview,
  parseWebsiteReviewDraft,
  WEBSITE_DRAFT_VERSION,
  WEBSITE_REVIEW_VERSION,
} from './websiteReview';
import {
  createSourceProjectCompiler,
  type SourceProjectInput,
  type SourceProject,
} from './sourceProject';
export const WEBSITE_PROJECT_VERSION = 'teul.website-project.v1' as const;
export type WebsiteProjectInput = SourceProjectInput<
  WebsiteCapturePacket,
  typeof WEBSITE_DRAFT_VERSION,
  typeof WEBSITE_REVIEW_VERSION
>;
export type WebsiteProject = SourceProject<
  WebsiteCapturePacket,
  typeof WEBSITE_DRAFT_VERSION,
  typeof WEBSITE_REVIEW_VERSION,
  typeof WEBSITE_PROJECT_VERSION
>;
const compiler = createSourceProjectCompiler({
  schemaVersion: WEBSITE_PROJECT_VERSION,
  versionPrefix: 'teul.website-project.',
  label: 'website',
  inventory: createWebsiteInventory,
  parseDraft: parseWebsiteReviewDraft,
  compileReview: compileWebsiteReview,
});
export const buildWebsiteProject = compiler.build;
export const readWebsiteProject = compiler.read;
