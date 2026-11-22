import { isGuidelineNativeGradient } from './nativeGradientSelection';
import {
  readGuidelineEditableGradient,
  type GuidelineEditableGradientSelection,
} from './gradientExport';
import { readGuidelineAuthoringDraft } from './authoringDraft';
import { readGuidelineDesignBrief } from './designBrief';
import { readGuidelineRefreshLineage, type GuidelineRefreshLineage } from './refreshLineage';
import {
  readGuidelineSupportingDirection,
  storedGuidelineSupportingSelection,
} from './supportingDirections';
import { readSourceProject, type OpenedSourceProject } from './sourceProjectCodec';
import {
  ASSESSED_GRADIENT_VERSION,
  CATALOG_GRADIENT_VERSION,
  CONTINUOUS_GRADIENT_VERSION,
} from './authoredGradient';
import { utf8ByteLength } from '../../../../src/lib/utf8';
import { PROJECT_BYTES } from './project';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { canonicalIntakeJson, record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { guidelineHash } from './review';
import { readGuidelineAssistanceReceipt, type AssistanceReceipt } from './assistance';
import { readNativeAssistanceReceipt, type NativeAssistanceReceipt } from './nativeAssistance';
import {
  readGuidelineNativeGradientComparison,
  singleNativeGradientSources,
  type GuidelineNativeGradientComparison,
} from './nativeGradientWorkspace';
import {
  EMPTY_GUIDELINE_OUTPUTS,
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
  GUIDELINE_WORKSPACE_LIMITS,
  readGuidelineSelectedOutputs,
  storedGuidelineOutputs,
  type GuidelineSelectedOutputs,
} from './selectedOutputs';

export type GuidelineProjectKind = 'pdf' | 'figma' | 'website';
export type OpenedGuidelineProject = OpenedSourceProject & {
  outputs: GuidelineSelectedOutputs;
  assistanceReceipt: AssistanceReceipt | NativeAssistanceReceipt | null;
  refreshLineage: GuidelineRefreshLineage | null;
  gradientSelection: GuidelineEditableGradientSelection | null;
  gradientComparison?: GuidelineNativeGradientComparison | null;
};
export type GuidelineProjectRead =
  { status: 'opened'; value: OpenedGuidelineProject } | { status: 'read-only'; version: string };

const WORKSPACE_VERSION = 'teul.guideline-workspace.v1';
const REFRESH_WORKSPACE_VERSION = 'teul.guideline-workspace.v2';
const AUTHORED_WORKSPACE_VERSION = 'teul.guideline-workspace.v3';
const SUPPORTING_WORKSPACE_VERSION = 'teul.guideline-workspace.v4';
const ASSESSED_WORKSPACE_VERSION = 'teul.guideline-workspace.v5';
const CATALOG_WORKSPACE_VERSION = 'teul.guideline-workspace.v6';
const CONTINUOUS_WORKSPACE_VERSION = 'teul.guideline-workspace.v7';
const NEW_SCALE_WORKSPACE_VERSION = 'teul.guideline-workspace.v8';
const BRIEF_WORKSPACE_VERSION = 'teul.guideline-workspace.v9';
const NATIVE_ASSISTANCE_WORKSPACE_VERSION = 'teul.guideline-workspace.v10';
const DERIVED_WORKSPACE_VERSION = 'teul.guideline-workspace.v12';
const COMPARISON_WORKSPACE_VERSION = 'teul.guideline-workspace.v13';
const PANEL_WORKSPACE_VERSION = 'teul.guideline-workspace.v14';
const COMPOSITION_WORKSPACE_VERSION = 'teul.guideline-workspace.v15';
const QUANTITATIVE_WORKSPACE_VERSION = 'teul.guideline-workspace.v16';
const REPORT_WORKSPACE_VERSION = 'teul.guideline-workspace.v19';
const CAPACITY_WORKSPACE_VERSION = 'teul.guideline-workspace.v18';
const NATIVE_WORKSPACE_VERSION = 'teul.guideline-workspace.v17';
const NATIVE_WORKSPACES = [
  NATIVE_WORKSPACE_VERSION,
  CAPACITY_WORKSPACE_VERSION,
  REPORT_WORKSPACE_VERSION,
];
const QUANTITATIVE_WORKSPACES = [QUANTITATIVE_WORKSPACE_VERSION, ...NATIVE_WORKSPACES];
const COMPOSITION_WORKSPACES = [COMPOSITION_WORKSPACE_VERSION, ...QUANTITATIVE_WORKSPACES];
const PANEL_WORKSPACES = [PANEL_WORKSPACE_VERSION, ...COMPOSITION_WORKSPACES];
const COMPARISON_WORKSPACES = [COMPARISON_WORKSPACE_VERSION, ...PANEL_WORKSPACES];
const DERIVED_WORKSPACES = [DERIVED_WORKSPACE_VERSION, ...COMPARISON_WORKSPACES];
const CONTEXT_WORKSPACES = ['teul.guideline-workspace.v11', ...DERIVED_WORKSPACES];
const CONTEXT_WORKSPACE_VERSION = 'teul.guideline-workspace.v11';
const NATIVE_ASSISTANCE_WORKSPACES = [NATIVE_ASSISTANCE_WORKSPACE_VERSION, ...CONTEXT_WORKSPACES];
const BRIEF_WORKSPACES = [BRIEF_WORKSPACE_VERSION, ...NATIVE_ASSISTANCE_WORKSPACES];
const NEW_SCALE_WORKSPACES = [NEW_SCALE_WORKSPACE_VERSION, ...BRIEF_WORKSPACES];
const CONTINUOUS_WORKSPACES = [CONTINUOUS_WORKSPACE_VERSION, ...NEW_SCALE_WORKSPACES];
const CATALOG_WORKSPACES = [CATALOG_WORKSPACE_VERSION, ...CONTINUOUS_WORKSPACES];
const ASSESSED_WORKSPACES = [ASSESSED_WORKSPACE_VERSION, ...CATALOG_WORKSPACES];
const AUTHORED_WORKSPACES = [
  AUTHORED_WORKSPACE_VERSION,
  SUPPORTING_WORKSPACE_VERSION,
  ASSESSED_WORKSPACE_VERSION,
  ...CATALOG_WORKSPACES,
];
const SUPPORTING_WORKSPACES = [SUPPORTING_WORKSPACE_VERSION, ...ASSESSED_WORKSPACES];
// One bounded, immutable validation receipt avoids immediately replaying a just-serialized
// workspace when local storage admits those exact bytes. Any other input still replays.
let preparedSerialization: { json: string; result: GuidelineProjectRead } | null = null;

/** The inner project bytes retain their own format, hashes and strict replay contract. */
export async function readAnyGuidelineProject(
  json: string,
  signal?: AbortSignal
): Promise<GuidelineProjectRead> {
  signal?.throwIfAborted();
  if (typeof json !== 'string' || utf8ByteLength(json) > PROJECT_BYTES)
    throw new Error('Choose a project smaller than 16 MiB.');
  const prepared = preparedSerialization;
  preparedSerialization = null;
  if (prepared?.json === json) return prepared.result;
  const raw = snapshotColorSystemInertJsonV1(JSON.parse(json), GUIDELINE_WORKSPACE_LIMITS);
  const version =
    raw && typeof raw === 'object' && 'schemaVersion' in raw ? raw.schemaVersion : null;
  if (typeof version !== 'string' || !version.startsWith('teul.guideline-workspace.')) {
    const source = await readSourceProject(json);
    signal?.throwIfAborted();
    return source.status === 'read-only'
      ? source
      : {
          status: 'opened',
          value: {
            ...source.value,
            outputs: EMPTY_GUIDELINE_OUTPUTS,
            assistanceReceipt: null,
            refreshLineage: null,
            gradientSelection: null,
          },
        };
  }
  if (
    ![
      WORKSPACE_VERSION,
      REFRESH_WORKSPACE_VERSION,
      AUTHORED_WORKSPACE_VERSION,
      SUPPORTING_WORKSPACE_VERSION,
      ASSESSED_WORKSPACE_VERSION,
      ...CATALOG_WORKSPACES,
    ].includes(version)
  )
    return { status: 'read-only', version };
  record(raw, [
    'schemaVersion',
    'sourceProjectJson',
    'outputs',
    'assistanceReceipt',
    'bundleHash',
    ...(version !== WORKSPACE_VERSION ? ['refreshLineage'] : []),
    ...(AUTHORED_WORKSPACES.includes(version) ? ['gradientSelection'] : []),
    ...(SUPPORTING_WORKSPACES.includes(version) ? ['supportingSelection'] : []),
    ...(BRIEF_WORKSPACES.includes(version) ? ['designBrief', 'authoring'] : []),
    ...(COMPARISON_WORKSPACES.includes(version) ? ['gradientComparison'] : []),
  ]);
  const { bundleHash, ...content } = raw;
  if (guidelineHash(content) !== bundleHash || typeof raw.sourceProjectJson !== 'string')
    throw new Error('Workspace bundle integrity check failed.');
  const source = await readSourceProject(raw.sourceProjectJson);
  signal?.throwIfAborted();
  if (source.status === 'read-only') return source;
  const nativeSources =
    NATIVE_WORKSPACES.includes(version) &&
    source.value.kind === 'figma' &&
    source.value.project.review
      ? singleNativeGradientSources(source.value.inventory, source.value.project.review)
      : [];
  const outputs = await readGuidelineSelectedOutputs(
    raw.outputs,
    source.value.project.review,
    signal,
    NEW_SCALE_WORKSPACES.includes(version),
    BRIEF_WORKSPACES.includes(version),
    CONTEXT_WORKSPACES.includes(version),
    DERIVED_WORKSPACES.includes(version),
    PANEL_WORKSPACES.includes(version),
    COMPOSITION_WORKSPACES.includes(version),
    QUANTITATIVE_WORKSPACES.includes(version),
    NATIVE_WORKSPACES.includes(version),
    nativeSources,
    version === CAPACITY_WORKSPACE_VERSION || version === REPORT_WORKSPACE_VERSION,
    version === REPORT_WORKSPACE_VERSION
  );
  let assistanceReceipt: OpenedGuidelineProject['assistanceReceipt'] = null;
  if (raw.assistanceReceipt !== null) {
    const opened = source.value;
    if (opened.kind === 'pdf') {
      assistanceReceipt = await readGuidelineAssistanceReceipt(
        raw.assistanceReceipt,
        opened.project.capture
      );
    } else {
      if (!NATIVE_ASSISTANCE_WORKSPACES.includes(version))
        throw new Error('Native assistance provenance requires workspace V10.');
      assistanceReceipt = await readNativeAssistanceReceipt(
        raw.assistanceReceipt,
        opened.kind === 'figma'
          ? { kind: opened.kind, inventory: opened.inventory, draft: opened.project.draft }
          : { kind: opened.kind, inventory: opened.inventory, draft: opened.project.draft }
      );
    }
  }
  if (
    version === NATIVE_ASSISTANCE_WORKSPACE_VERSION &&
    (!assistanceReceipt || assistanceReceipt.schemaVersion !== 'teul.native-assistance-receipt.v1')
  )
    throw new Error('Workspace V10 requires retained native assistance provenance.');
  signal?.throwIfAborted();
  const refreshLineage =
    version !== WORKSPACE_VERSION && raw.refreshLineage !== null
      ? await readGuidelineRefreshLineage(raw.refreshLineage, source.value, signal)
      : null;
  if (
    version === REFRESH_WORKSPACE_VERSION &&
    (!refreshLineage || refreshLineage.schemaVersion !== 'teul.guideline-refresh-lineage.v1')
  )
    throw new Error('Workspace V2 requires its original refresh-history format.');
  if (
    !SUPPORTING_WORKSPACES.includes(version) &&
    refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v3'
  )
    throw new Error('Supporting refresh history requires workspace V4.');
  if (
    !ASSESSED_WORKSPACES.includes(version) &&
    refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v4'
  )
    throw new Error('Assessed gradient history requires workspace V5.');
  const gradientSelection = AUTHORED_WORKSPACES.includes(version)
    ? readGuidelineEditableGradient(
        source.value.project.review,
        raw.gradientSelection,
        nativeSources,
        NATIVE_WORKSPACES.includes(version)
      )
    : null;
  if (
    !ASSESSED_WORKSPACES.includes(version) &&
    gradientSelection?.schemaVersion === ASSESSED_GRADIENT_VERSION
  )
    throw new Error('Declared gradient use requires workspace V5.');
  if (
    !CATALOG_WORKSPACES.includes(version) &&
    (gradientSelection?.schemaVersion === CATALOG_GRADIENT_VERSION ||
      refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v5')
  )
    throw new Error('Catalog gradient work requires workspace V6.');
  if (
    !CONTINUOUS_WORKSPACES.includes(version) &&
    (gradientSelection?.schemaVersion === CONTINUOUS_GRADIENT_VERSION ||
      refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v6')
  )
    throw new Error('The continuous gradient format requires workspace V7.');
  if (
    !NEW_SCALE_WORKSPACES.includes(version) &&
    refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v7'
  )
    throw new Error('Source-derived scale history requires workspace V8.');
  if (
    !BRIEF_WORKSPACES.includes(version) &&
    refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v8'
  )
    throw new Error('Saved brief history requires workspace V9.');
  if (gradientSelection && source.value.project.selection)
    throw new Error('A workspace cannot contain two selected gradients.');
  let supporting;
  if (SUPPORTING_WORKSPACES.includes(version) && raw.supportingSelection !== null) {
    if (!source.value.project.review || typeof raw.supportingSelection !== 'string')
      throw new Error('Supporting colors require their retained source review.');
    supporting = await readGuidelineSupportingDirection(
      raw.supportingSelection,
      source.value.project.review,
      signal
    );
  }
  const designBrief =
    BRIEF_WORKSPACES.includes(version) && raw.designBrief !== null
      ? readGuidelineDesignBrief(raw.designBrief, source.value.project.review)
      : null;
  const authoring =
    BRIEF_WORKSPACES.includes(version) && raw.authoring !== null
      ? readGuidelineAuthoringDraft(raw.authoring, source.value.project.review)
      : null;
  if (
    !CONTEXT_WORKSPACES.includes(version) &&
    (hasGuidelineContextPaints({ ...outputs, authoring, designBrief }) ||
      refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v9')
  )
    throw new Error('Authored context paints and history require workspace V11.');
  if (
    !DERIVED_WORKSPACES.includes(version) &&
    (hasGuidelineDerivedConstruction({ ...outputs, authoring }) ||
      refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v10')
  )
    throw new Error('V2 construction and history require workspace V12.');
  if (
    !PANEL_WORKSPACES.includes(version) &&
    (hasGuidelinePanel({ ...outputs, authoring }) ||
      refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v11')
  )
    throw new Error('Information panels and history require workspace V14.');
  if (
    !COMPOSITION_WORKSPACES.includes(version) &&
    (hasGuidelineComposition({ ...outputs, authoring, designBrief }) ||
      refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v12')
  )
    throw new Error('Mixed compositions and history require workspace V15.');
  if (
    !QUANTITATIVE_WORKSPACES.includes(version) &&
    (hasGuidelineQuantitative({ ...outputs, authoring, designBrief }) ||
      refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v13')
  )
    throw new Error('Quantitative compositions and history require workspace V16.');
  if (
    !NATIVE_WORKSPACES.includes(version) &&
    (hasGuidelineNativeEdits({ ...outputs, authoring }) ||
      refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v14')
  )
    throw new Error('Native edits require workspace V17.');
  if (
    version !== REPORT_WORKSPACE_VERSION &&
    (hasGuidelineReport({ ...outputs, authoring, designBrief }) ||
      refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v16')
  )
    throw new Error('Report compositions and history require workspace V19.');
  if (
    version !== REPORT_WORKSPACE_VERSION &&
    version !== CAPACITY_WORKSPACE_VERSION &&
    (hasGuidelineCapacity({ ...outputs, authoring, designBrief }) ||
      refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v15')
  )
    throw new Error('Capacity compositions and history require workspace V18.');
  const gradientComparison = COMPARISON_WORKSPACES.includes(version)
    ? readGuidelineNativeGradientComparison(
        raw.gradientComparison,
        source.value.project.review,
        gradientSelection ?? source.value.project.selection,
        source.value.kind === 'figma' ? singleNativeGradientSources(source.value.inventory) : []
      )
    : null;
  if (version === COMPARISON_WORKSPACE_VERSION && !gradientComparison)
    throw new Error('Workspace V13 requires its retained native-gradient comparison.');
  return {
    status: 'opened',
    value: {
      ...source.value,
      outputs: {
        ...outputs,
        ...(supporting ? { supporting } : {}),
        ...(designBrief ? { designBrief } : {}),
        ...(authoring ? { authoring } : {}),
      },
      assistanceReceipt,
      refreshLineage,
      gradientSelection,
      ...(gradientComparison ? { gradientComparison } : {}),
    },
  };
}

export async function serializeGuidelineWorkspace(
  sourceProjectJson: string,
  outputs: GuidelineSelectedOutputs,
  assistanceReceipt: OpenedGuidelineProject['assistanceReceipt'] = null,
  signal?: AbortSignal,
  refreshLineage: GuidelineRefreshLineage | null = null,
  gradientSelection: GuidelineEditableGradientSelection | null = null,
  gradientComparison: GuidelineNativeGradientComparison | null = null
): Promise<string> {
  const version =
    hasGuidelineReport(outputs) ||
    refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v16'
      ? REPORT_WORKSPACE_VERSION
      : hasGuidelineCapacity(outputs) ||
          refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v15'
        ? CAPACITY_WORKSPACE_VERSION
        : isGuidelineNativeGradient(gradientSelection) ||
            hasGuidelineNativeEdits(outputs) ||
            refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v14'
          ? NATIVE_WORKSPACE_VERSION
          : hasGuidelineQuantitative(outputs) ||
              refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v13'
            ? QUANTITATIVE_WORKSPACE_VERSION
            : hasGuidelineComposition(outputs) ||
                refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v12'
              ? COMPOSITION_WORKSPACE_VERSION
              : hasGuidelinePanel(outputs) ||
                  refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v11'
                ? PANEL_WORKSPACE_VERSION
                : gradientComparison
                  ? COMPARISON_WORKSPACE_VERSION
                  : hasGuidelineDerivedConstruction(outputs) ||
                      refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v10'
                    ? DERIVED_WORKSPACE_VERSION
                    : hasGuidelineContextPaints(outputs) ||
                        refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v9'
                      ? CONTEXT_WORKSPACE_VERSION
                      : assistanceReceipt?.schemaVersion === 'teul.native-assistance-receipt.v1'
                        ? NATIVE_ASSISTANCE_WORKSPACE_VERSION
                        : hasGuidelineChart(outputs) ||
                            outputs.designBrief ||
                            outputs.authoring ||
                            refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v8'
                          ? BRIEF_WORKSPACE_VERSION
                          : hasGuidelineNewScale(outputs) ||
                              refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v7'
                            ? NEW_SCALE_WORKSPACE_VERSION
                            : gradientSelection?.schemaVersion === CONTINUOUS_GRADIENT_VERSION ||
                                refreshLineage?.schemaVersion ===
                                  'teul.guideline-refresh-lineage.v6'
                              ? CONTINUOUS_WORKSPACE_VERSION
                              : gradientSelection?.schemaVersion === CATALOG_GRADIENT_VERSION ||
                                  refreshLineage?.schemaVersion ===
                                    'teul.guideline-refresh-lineage.v5'
                                ? CATALOG_WORKSPACE_VERSION
                                : gradientSelection?.schemaVersion === ASSESSED_GRADIENT_VERSION ||
                                    refreshLineage?.schemaVersion ===
                                      'teul.guideline-refresh-lineage.v4'
                                  ? ASSESSED_WORKSPACE_VERSION
                                  : outputs.supporting ||
                                      refreshLineage?.schemaVersion ===
                                        'teul.guideline-refresh-lineage.v3'
                                    ? SUPPORTING_WORKSPACE_VERSION
                                    : gradientSelection ||
                                        refreshLineage?.schemaVersion ===
                                          'teul.guideline-refresh-lineage.v2'
                                      ? AUTHORED_WORKSPACE_VERSION
                                      : refreshLineage
                                        ? REFRESH_WORKSPACE_VERSION
                                        : WORKSPACE_VERSION;
  const content = snapshotColorSystemInertJsonV1(
    {
      schemaVersion: version,
      sourceProjectJson,
      outputs: storedGuidelineOutputs(outputs),
      ...(BRIEF_WORKSPACES.includes(version)
        ? { designBrief: outputs.designBrief ?? null, authoring: outputs.authoring ?? null }
        : {}),
      assistanceReceipt:
        assistanceReceipt?.schemaVersion === 'teul.native-assistance-receipt.v1'
          ? JSON.parse(canonicalIntakeJson(assistanceReceipt, 8 * 1024 * 1024))
          : assistanceReceipt,
      ...(version !== WORKSPACE_VERSION ? { refreshLineage } : {}),
      ...(AUTHORED_WORKSPACES.includes(version) ? { gradientSelection } : {}),
      ...(COMPARISON_WORKSPACES.includes(version) ? { gradientComparison } : {}),
      ...(SUPPORTING_WORKSPACES.includes(version)
        ? {
            supportingSelection: outputs.supporting
              ? storedGuidelineSupportingSelection(outputs.supporting)
              : null,
          }
        : {}),
    },
    GUIDELINE_WORKSPACE_LIMITS
  );
  record(content, [
    'schemaVersion',
    'sourceProjectJson',
    'outputs',
    'assistanceReceipt',
    ...(version !== WORKSPACE_VERSION ? ['refreshLineage'] : []),
    ...(AUTHORED_WORKSPACES.includes(version) ? ['gradientSelection'] : []),
    ...(SUPPORTING_WORKSPACES.includes(version) ? ['supportingSelection'] : []),
    ...(BRIEF_WORKSPACES.includes(version) ? ['designBrief', 'authoring'] : []),
    ...(COMPARISON_WORKSPACES.includes(version) ? ['gradientComparison'] : []),
  ]);
  const json =
    outputs.authoring ||
    hasGuidelineChart(outputs) ||
    outputs.designBrief ||
    outputs.extension ||
    outputs.application ||
    outputs.supporting ||
    assistanceReceipt ||
    refreshLineage ||
    gradientSelection ||
    gradientComparison
      ? JSON.stringify({ ...content, bundleHash: guidelineHash(content) })
      : sourceProjectJson;
  const reopened = await readAnyGuidelineProject(json, signal);
  if (reopened.status !== 'opened') throw new Error('A future workspace cannot be rewritten.');
  preparedSerialization = { json, result: freeze(reopened) };
  return json;
}

export function guidelineProjectName(opened: OpenedGuidelineProject): string {
  const name = (
    opened.kind === 'pdf'
      ? opened.project.capture.identity.label
      : opened.kind === 'figma'
        ? opened.project.capture.file.name
        : new URL(opened.project.capture.finalUrl).hostname
  )
    .trim()
    .slice(0, 80);
  return name || `Untitled ${opened.kind} project`;
}
export function guidelineProjectPdfHash(opened: OpenedGuidelineProject): string | null {
  return opened.kind === 'pdf' ? opened.project.capture.identity.sha256 : null;
}
