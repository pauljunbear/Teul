import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import {
  readGuidelineModeGradientSelection,
  type GuidelineModeGradientSelection,
} from './modeGradient';
import { guidelineHash } from './review';
import { PROJECT_BYTES } from './project';

import type { SourceReviewDraft, SourceReviewedSource } from './sourceReviewContracts';

export interface SourceProjectInput<P, D extends string, R extends string> {
  capture: P;
  draft: SourceReviewDraft<D>;
  review: SourceReviewedSource<D, R> | null;
  selection: GuidelineModeGradientSelection | null;
}
export interface SourceProject<
  P,
  D extends string,
  R extends string,
  V extends string,
> extends SourceProjectInput<P, D, R> {
  schemaVersion: V;
  projectHash: string;
}
export function createSourceProjectCompiler<
  I extends { packet: unknown },
  D extends string,
  R extends string,
  V extends string,
>(adapter: {
  schemaVersion: V;
  versionPrefix: string;
  label: string;
  inventory: (raw: unknown) => Promise<I>;
  parseDraft: (inventory: I, raw: unknown) => SourceReviewDraft<D>;
  compileReview: (
    inventory: I,
    draft: SourceReviewDraft<D>,
    actor: SourceReviewedSource<D, R>['decision']['actor'],
    reviewedAt: string
  ) => SourceReviewedSource<D, R>;
}) {
  type P = I['packet'];
  const policy = {
    maximumBytes: PROJECT_BYTES,
    maximumNodes: 800000,
    maximumDepth: 48,
    maximumObjectKeys: 10000,
  };

  /** Replay source and decisions. Embedded models and selected paint never grant authority. */
  async function build(input: SourceProjectInput<P, D, R>): Promise<SourceProject<P, D, R, V>> {
    return (await compileProject(input)).project;
  }
  async function compileProject(input: SourceProjectInput<P, D, R>) {
    const raw = snapshotColorSystemInertJsonV1(input, policy);
    record(raw, ['capture', 'draft', 'review', 'selection']);
    const inventory = await adapter.inventory(raw.capture);
    const draft = adapter.parseDraft(inventory, raw.draft);
    let review: SourceReviewedSource<D, R> | null = null;
    if (raw.review !== null) {
      const saved = raw.review;
      record(saved, ['schemaVersion', 'captureHash', 'model', 'decision', 'reviewHash']);
      record(saved.decision, ['actor', 'reviewedAt', 'draft']);
      review = adapter.compileReview(
        inventory,
        saved.decision.draft as SourceReviewDraft<D>,
        saved.decision.actor as SourceReviewedSource<D, R>['decision']['actor'],
        saved.decision.reviewedAt as string
      );
      if (
        canonicalJson(review) !== canonicalJson(saved) ||
        canonicalJson(draft) !== canonicalJson(review.decision.draft)
      )
        throw new Error(
          'Saved source review differs from its captured evidence or current decisions. Apply the current review before retaining a result.'
        );
    }
    const selection = readGuidelineModeGradientSelection(review, raw.selection);
    const content = {
      schemaVersion: adapter.schemaVersion,
      capture: inventory.packet,
      draft,
      review,
      selection,
    };
    snapshotColorSystemInertJsonV1(content, policy);
    return { project: freeze({ ...content, projectHash: guidelineHash(content) }), inventory };
  }

  async function read(
    raw: unknown
  ): Promise<
    | { status: 'opened'; project: SourceProject<P, D, R, V>; inventory: I }
    | { status: 'read-only'; version: string }
  > {
    const value = snapshotColorSystemInertJsonV1(raw, policy);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Expected a ${adapter.label} project.`);
    const version = (value as Record<string, unknown>).schemaVersion;
    if (
      typeof version === 'string' &&
      version.startsWith(adapter.versionPrefix) &&
      version !== adapter.schemaVersion
    )
      return { status: 'read-only', version };
    record(value, ['schemaVersion', 'capture', 'draft', 'review', 'selection', 'projectHash']);
    if (version !== adapter.schemaVersion) throw new Error(`Unsupported ${adapter.label} project.`);
    const { project, inventory } = await compileProject({
      capture: value.capture as P,
      draft: value.draft as SourceReviewDraft<D>,
      review: value.review as SourceReviewedSource<D, R> | null,
      selection: value.selection as GuidelineModeGradientSelection | null,
    });
    if (canonicalJson(value) !== canonicalJson(project))
      throw new Error('Source project hash or content does not match its replay.');
    return { status: 'opened', project, inventory };
  }

  return { build, read };
}
