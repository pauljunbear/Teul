import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { utf8ByteLength } from '../../../../src/lib/utf8';
import { guidelineHash } from './review';
import { PROJECT_BYTES } from './project';
import {
  applySourceSetReview,
  inspectSourceSet,
  parseSourceSetDraft,
  SourceSetFutureVersion,
  type SourceSetDraft,
  type SourceSetReview,
} from './sourceSet';
import {
  GUIDELINE_WORKSPACE_LIMITS,
  hasGuidelineNewScale,
  readGuidelineSelectedOutputs,
  storedGuidelineOutputs,
  type GuidelineSelectedOutputs,
} from './selectedOutputs';
import {
  readGuidelineAuthoredGradient,
  type GuidelineAuthoredGradientSelection,
} from './authoredGradient';
import {
  readGuidelineSupportingDirection,
  storedGuidelineSupportingSelection,
} from './supportingDirections';

import { readSourceSetRefresh, type SourceSetRefreshLineage } from './sourceSetRefresh';

export const SOURCE_SET_PROJECT_VERSION = 'teul.source-set-project.v1';
export const SOURCE_SET_REFRESH_PROJECT_VERSION = 'teul.source-set-project.v2';
export const SOURCE_SET_NEW_SCALE_PROJECT_VERSION = 'teul.source-set-project.v3';
export interface SourceSetWorkspace {
  draft: SourceSetDraft;
  review: SourceSetReview | null;
  outputs: GuidelineSelectedOutputs;
  gradientSelection: GuidelineAuthoredGradientSelection | null;
  refresh?: SourceSetRefreshLineage;
}
/** Original projects remain immutable strings; saved approvals and outputs are always rebuilt. */
export async function readSourceSetProject(
  json: string,
  signal?: AbortSignal
): Promise<
  { status: 'opened'; value: SourceSetWorkspace } | { status: 'read-only'; version: string }
> {
  signal?.throwIfAborted();
  if (typeof json !== 'string' || utf8ByteLength(json) > PROJECT_BYTES)
    throw new Error('Choose a source set smaller than 16 MiB.');
  const raw = snapshotColorSystemInertJsonV1(
    JSON.parse(json),
    GUIDELINE_WORKSPACE_LIMITS
  ) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || typeof raw.schemaVersion !== 'string')
    throw new Error('Choose a Teul source-set project.');
  const newScales = raw.schemaVersion === SOURCE_SET_NEW_SCALE_PROJECT_VERSION;
  const hasRefresh = raw.schemaVersion === SOURCE_SET_REFRESH_PROJECT_VERSION || newScales;
  if (raw.schemaVersion !== SOURCE_SET_PROJECT_VERSION && !hasRefresh)
    return { status: 'read-only', version: raw.schemaVersion };
  record(raw, [
    'schemaVersion',
    'draft',
    'review',
    'outputs',
    'gradientSelection',
    'supportingSelection',
    'projectHash',
    ...(hasRefresh ? ['refresh'] : []),
  ]);
  const { projectHash, ...content } = raw;
  if (projectHash !== guidelineHash(content)) throw new Error('Source-set integrity check failed.');
  const draft = parseSourceSetDraft(raw.draft);
  let review: SourceSetReview | null = null;
  try {
    if (raw.review !== null) {
      record(raw.review, ['model', 'reviewHash', 'decision']);
      record(raw.review.decision, ['actor', 'reviewedAt', 'draftHash']);
      const saved = raw.review as unknown as SourceSetReview;
      review = await applySourceSetReview(
        draft,
        { actor: saved.decision.actor, reviewedAt: saved.decision.reviewedAt },
        signal
      );
      if (canonicalJson(review) !== canonicalJson(saved))
        throw new Error('Saved source-set review differs from its sources or decisions.');
    } else if (draft.entries.length) await inspectSourceSet(draft, signal);
  } catch (error) {
    if (error instanceof SourceSetFutureVersion)
      return { status: 'read-only', version: error.version };
    throw error;
  }
  const refresh =
    raw.schemaVersion === SOURCE_SET_REFRESH_PROJECT_VERSION || (newScales && raw.refresh !== null)
      ? await readSourceSetRefresh(raw.refresh, draft, signal)
      : undefined;
  const outputs = await readGuidelineSelectedOutputs(raw.outputs, review, signal, newScales);
  const gradientSelection = readGuidelineAuthoredGradient(review, raw.gradientSelection);
  if (!newScales && refresh?.schemaVersion === 'teul.source-set-refresh.v2')
    throw new Error('Source-derived scale history requires source-set project V3.');
  let supporting = null;
  if (raw.supportingSelection !== null) {
    if (!review || typeof raw.supportingSelection !== 'string')
      throw new Error('Supporting colors require their reviewed source set.');
    supporting = await readGuidelineSupportingDirection(raw.supportingSelection, review, signal);
  }
  signal?.throwIfAborted();
  return freeze({
    status: 'opened' as const,
    value: {
      draft,
      review,
      outputs: supporting ? { ...outputs, supporting } : outputs,
      gradientSelection,
      ...(refresh ? { refresh } : {}),
    },
  });
}
export async function serializeSourceSetProject(
  workspace: SourceSetWorkspace,
  signal?: AbortSignal
) {
  const newScales =
    hasGuidelineNewScale(workspace.outputs) ||
    workspace.refresh?.schemaVersion === 'teul.source-set-refresh.v2';
  const content = {
    schemaVersion: newScales
      ? SOURCE_SET_NEW_SCALE_PROJECT_VERSION
      : workspace.refresh
        ? SOURCE_SET_REFRESH_PROJECT_VERSION
        : SOURCE_SET_PROJECT_VERSION,
    draft: workspace.draft,
    review: workspace.review,
    outputs: storedGuidelineOutputs(workspace.outputs),
    gradientSelection: workspace.gradientSelection,
    ...(newScales
      ? { refresh: workspace.refresh ?? null }
      : workspace.refresh
        ? { refresh: workspace.refresh }
        : {}),
    supportingSelection: workspace.outputs.supporting
      ? storedGuidelineSupportingSelection(workspace.outputs.supporting)
      : null,
  };
  const json = JSON.stringify({ ...content, projectHash: guidelineHash(content) });
  const reopened = await readSourceSetProject(json, signal);
  if (reopened.status !== 'opened') throw new Error('A read-only source set cannot be rewritten.');
  return json;
}
