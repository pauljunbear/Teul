export const SOURCE_SET_REPORT_PROJECT_VERSION = 'teul.source-set-project.v13';
import { isGuidelineNativeGradient } from './nativeGradientSelection';
import {
  readGuidelineEditableGradient,
  type GuidelineEditableGradientSelection,
} from './gradientExport';
import { readGuidelineAuthoringDraft } from './authoringDraft';
import { readGuidelineDesignBrief } from './designBrief';
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
  hasGuidelineNativeEdits,
  hasGuidelinePanel,
  hasGuidelineComposition,
  hasGuidelineQuantitative,
  hasGuidelineCapacity,
  hasGuidelineReport,
  hasGuidelineChart,
  hasGuidelineContextPaints,
  hasGuidelineDerivedConstruction,
  readGuidelineSelectedOutputs,
  storedGuidelineOutputs,
  type GuidelineSelectedOutputs,
} from './selectedOutputs';
import {
  readGuidelineSupportingDirection,
  storedGuidelineSupportingSelection,
} from './supportingDirections';

import { readSourceSetRefresh, type SourceSetRefreshLineage } from './sourceSetRefresh';
import {
  readGuidelineNativeGradientComparison,
  sourceSetNativeGradientSources,
  type GuidelineNativeGradientComparison,
} from './nativeGradientWorkspace';

export const SOURCE_SET_CAPACITY_PROJECT_VERSION = 'teul.source-set-project.v12';
export const SOURCE_SET_NATIVE_PROJECT_VERSION = 'teul.source-set-project.v11';
export const SOURCE_SET_PROJECT_VERSION = 'teul.source-set-project.v1';
export const SOURCE_SET_REFRESH_PROJECT_VERSION = 'teul.source-set-project.v2';
export const SOURCE_SET_NEW_SCALE_PROJECT_VERSION = 'teul.source-set-project.v3';
export const SOURCE_SET_BRIEF_PROJECT_VERSION = 'teul.source-set-project.v4';
export const SOURCE_SET_DERIVED_PROJECT_VERSION = 'teul.source-set-project.v6';
export const SOURCE_SET_COMPARISON_PROJECT_VERSION = 'teul.source-set-project.v7';
export const SOURCE_SET_COMPOSITION_PROJECT_VERSION = 'teul.source-set-project.v9';
export const SOURCE_SET_QUANTITATIVE_PROJECT_VERSION = 'teul.source-set-project.v10';
export const SOURCE_SET_PANEL_PROJECT_VERSION = 'teul.source-set-project.v8';
export const SOURCE_SET_CONTEXT_PROJECT_VERSION = 'teul.source-set-project.v5';
export interface SourceSetWorkspace {
  draft: SourceSetDraft;
  review: SourceSetReview | null;
  outputs: GuidelineSelectedOutputs;
  gradientSelection: GuidelineEditableGradientSelection | null;
  gradientComparison?: GuidelineNativeGradientComparison | null;
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
  const report = raw.schemaVersion === SOURCE_SET_REPORT_PROJECT_VERSION;
  const capacity = report || raw.schemaVersion === SOURCE_SET_CAPACITY_PROJECT_VERSION;
  const native = capacity || raw.schemaVersion === SOURCE_SET_NATIVE_PROJECT_VERSION;
  const quantitative = native || raw.schemaVersion === SOURCE_SET_QUANTITATIVE_PROJECT_VERSION;
  const compositions = quantitative || raw.schemaVersion === SOURCE_SET_COMPOSITION_PROJECT_VERSION;
  const panels = raw.schemaVersion === SOURCE_SET_PANEL_PROJECT_VERSION || compositions;
  const hasComparison = raw.schemaVersion === SOURCE_SET_COMPARISON_PROJECT_VERSION || panels;
  const derivedConstruction =
    raw.schemaVersion === SOURCE_SET_DERIVED_PROJECT_VERSION || hasComparison;
  const contextPaints =
    raw.schemaVersion === SOURCE_SET_CONTEXT_PROJECT_VERSION || derivedConstruction;
  const hasBrief = raw.schemaVersion === SOURCE_SET_BRIEF_PROJECT_VERSION || contextPaints;
  const newScales = raw.schemaVersion === SOURCE_SET_NEW_SCALE_PROJECT_VERSION || hasBrief;
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
    ...(hasBrief ? ['designBrief', 'authoring'] : []),
    ...(hasComparison ? ['gradientComparison'] : []),
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
  const nativeSources =
    native && review ? await sourceSetNativeGradientSources(draft, signal, review) : [];
  const outputs = await readGuidelineSelectedOutputs(
    raw.outputs,
    review,
    signal,
    newScales,
    hasBrief,
    contextPaints,
    derivedConstruction,
    panels,
    compositions,
    quantitative,
    native,
    nativeSources,
    capacity,
    report
  );
  const gradientSelection = readGuidelineEditableGradient(
    review,
    raw.gradientSelection,
    nativeSources,
    native
  );
  const gradientComparison =
    hasComparison && raw.gradientComparison !== null
      ? readGuidelineNativeGradientComparison(
          raw.gradientComparison,
          review,
          gradientSelection,
          await sourceSetNativeGradientSources(draft, signal)
        )
      : null;
  if (
    raw.schemaVersion === SOURCE_SET_COMPARISON_PROJECT_VERSION &&
    !gradientComparison &&
    refresh?.schemaVersion !== 'teul.source-set-refresh.v6'
  )
    throw new Error(
      'Source-set project V7 requires a native-gradient comparison or its retained history.'
    );
  if (!hasComparison && refresh?.schemaVersion === 'teul.source-set-refresh.v6')
    throw new Error('Native-gradient comparison history requires source-set project V7.');
  if (!newScales && refresh?.schemaVersion === 'teul.source-set-refresh.v2')
    throw new Error('Source-derived scale history requires source-set project V3.');
  if (!hasBrief && refresh?.schemaVersion === 'teul.source-set-refresh.v3')
    throw new Error('Saved brief history requires source-set project V4.');
  let supporting = null;
  if (raw.supportingSelection !== null) {
    if (!review || typeof raw.supportingSelection !== 'string')
      throw new Error('Supporting colors require their reviewed source set.');
    supporting = await readGuidelineSupportingDirection(raw.supportingSelection, review, signal);
  }
  const designBrief =
    hasBrief && raw.designBrief !== null ? readGuidelineDesignBrief(raw.designBrief, review) : null;
  const authoring =
    hasBrief && raw.authoring !== null ? readGuidelineAuthoringDraft(raw.authoring, review) : null;
  if (
    !contextPaints &&
    (hasGuidelineContextPaints({ ...outputs, authoring, designBrief }) ||
      refresh?.schemaVersion === 'teul.source-set-refresh.v4')
  )
    throw new Error('Authored context paints and history require source-set project V5.');
  if (
    !derivedConstruction &&
    (hasGuidelineDerivedConstruction({ ...outputs, authoring }) ||
      refresh?.schemaVersion === 'teul.source-set-refresh.v5')
  )
    throw new Error('V2 construction and history require source-set project V6.');
  if (
    !panels &&
    (hasGuidelinePanel({ ...outputs, authoring }) ||
      refresh?.schemaVersion === 'teul.source-set-refresh.v7')
  )
    throw new Error('Information panels and history require source-set project V8.');
  if (
    !compositions &&
    (hasGuidelineComposition({ ...outputs, authoring, designBrief }) ||
      refresh?.schemaVersion === 'teul.source-set-refresh.v8')
  )
    throw new Error('Mixed compositions and history require source-set project V9.');
  if (
    !quantitative &&
    (hasGuidelineQuantitative({ ...outputs, authoring, designBrief }) ||
      refresh?.schemaVersion === 'teul.source-set-refresh.v9')
  )
    throw new Error('Quantitative compositions and history require source-set project V10.');
  if (
    !native &&
    (hasGuidelineNativeEdits({ ...outputs, authoring }) ||
      refresh?.schemaVersion === 'teul.source-set-refresh.v10')
  )
    throw new Error('Native edits require source-set project V11.');
  if (
    !report &&
    (hasGuidelineReport({ ...outputs, authoring, designBrief }) ||
      refresh?.schemaVersion === 'teul.source-set-refresh.v12')
  )
    throw new Error('Report compositions and history require source-set project V13.');
  if (
    !capacity &&
    (hasGuidelineCapacity({ ...outputs, authoring, designBrief }) ||
      refresh?.schemaVersion === 'teul.source-set-refresh.v11')
  )
    throw new Error('Capacity compositions and history require source-set project V12.');
  signal?.throwIfAborted();
  return freeze({
    status: 'opened' as const,
    value: {
      draft,
      review,
      outputs: {
        ...outputs,
        ...(supporting ? { supporting } : {}),
        ...(designBrief ? { designBrief } : {}),
        ...(authoring ? { authoring } : {}),
      },
      gradientSelection,
      ...(gradientComparison ? { gradientComparison } : {}),
      ...(refresh ? { refresh } : {}),
    },
  });
}
export async function serializeSourceSetProject(
  workspace: SourceSetWorkspace,
  signal?: AbortSignal
) {
  const report =
    hasGuidelineReport(workspace.outputs) ||
    workspace.refresh?.schemaVersion === 'teul.source-set-refresh.v12';
  const capacity =
    report ||
    hasGuidelineCapacity(workspace.outputs) ||
    workspace.refresh?.schemaVersion === 'teul.source-set-refresh.v11';
  const native =
    capacity ||
    isGuidelineNativeGradient(workspace.gradientSelection) ||
    hasGuidelineNativeEdits(workspace.outputs) ||
    workspace.refresh?.schemaVersion === 'teul.source-set-refresh.v10';
  const quantitative =
    native ||
    hasGuidelineQuantitative(workspace.outputs) ||
    workspace.refresh?.schemaVersion === 'teul.source-set-refresh.v9';
  const compositions =
    quantitative ||
    hasGuidelineComposition(workspace.outputs) ||
    workspace.refresh?.schemaVersion === 'teul.source-set-refresh.v8';
  const panels =
    compositions ||
    hasGuidelinePanel(workspace.outputs) ||
    workspace.refresh?.schemaVersion === 'teul.source-set-refresh.v7';
  const hasComparison =
    panels ||
    !!workspace.gradientComparison ||
    workspace.refresh?.schemaVersion === 'teul.source-set-refresh.v6';
  const derivedConstruction =
    hasComparison ||
    hasGuidelineDerivedConstruction(workspace.outputs) ||
    workspace.refresh?.schemaVersion === 'teul.source-set-refresh.v5';
  const contextPaints =
    derivedConstruction ||
    hasGuidelineContextPaints(workspace.outputs) ||
    workspace.refresh?.schemaVersion === 'teul.source-set-refresh.v4';
  const hasBrief = !!(
    contextPaints ||
    workspace.outputs.designBrief ||
    workspace.outputs.authoring ||
    hasGuidelineChart(workspace.outputs) ||
    workspace.refresh?.schemaVersion === 'teul.source-set-refresh.v3'
  );
  const newScales =
    hasBrief ||
    hasGuidelineNewScale(workspace.outputs) ||
    workspace.refresh?.schemaVersion === 'teul.source-set-refresh.v2';
  const content = {
    schemaVersion: report
      ? SOURCE_SET_REPORT_PROJECT_VERSION
      : capacity
        ? SOURCE_SET_CAPACITY_PROJECT_VERSION
        : native
          ? SOURCE_SET_NATIVE_PROJECT_VERSION
          : quantitative
            ? SOURCE_SET_QUANTITATIVE_PROJECT_VERSION
            : compositions
              ? SOURCE_SET_COMPOSITION_PROJECT_VERSION
              : panels
                ? SOURCE_SET_PANEL_PROJECT_VERSION
                : hasComparison
                  ? SOURCE_SET_COMPARISON_PROJECT_VERSION
                  : derivedConstruction
                    ? SOURCE_SET_DERIVED_PROJECT_VERSION
                    : contextPaints
                      ? SOURCE_SET_CONTEXT_PROJECT_VERSION
                      : hasBrief
                        ? SOURCE_SET_BRIEF_PROJECT_VERSION
                        : newScales
                          ? SOURCE_SET_NEW_SCALE_PROJECT_VERSION
                          : workspace.refresh
                            ? SOURCE_SET_REFRESH_PROJECT_VERSION
                            : SOURCE_SET_PROJECT_VERSION,
    draft: workspace.draft,
    review: workspace.review,
    outputs: storedGuidelineOutputs(workspace.outputs),
    ...(hasBrief
      ? {
          designBrief: workspace.outputs.designBrief ?? null,
          authoring: workspace.outputs.authoring ?? null,
        }
      : {}),
    gradientSelection: workspace.gradientSelection,
    ...(hasComparison ? { gradientComparison: workspace.gradientComparison ?? null } : {}),
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
