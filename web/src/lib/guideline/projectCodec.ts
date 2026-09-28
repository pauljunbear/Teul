import { readGuidelineRefreshLineage, type GuidelineRefreshLineage } from './refreshLineage';
import {
  readGuidelineSupportingDirection,
  storedGuidelineSupportingSelection,
} from './supportingDirections';
import { readSourceProject, type OpenedSourceProject } from './sourceProjectCodec';
import {
  readGuidelineAuthoredGradient,
  ASSESSED_GRADIENT_VERSION,
  CATALOG_GRADIENT_VERSION,
  CONTINUOUS_GRADIENT_VERSION,
  type GuidelineAuthoredGradientSelection,
} from './authoredGradient';
import { utf8ByteLength } from '../../../../src/lib/utf8';
import { PROJECT_BYTES } from './project';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { guidelineHash } from './review';
import { readGuidelineAssistanceReceipt, type AssistanceReceipt } from './assistance';
import {
  EMPTY_GUIDELINE_OUTPUTS,
  hasGuidelineNewScale,
  GUIDELINE_WORKSPACE_LIMITS,
  readGuidelineSelectedOutputs,
  storedGuidelineOutputs,
  type GuidelineSelectedOutputs,
} from './selectedOutputs';

export type GuidelineProjectKind = 'pdf' | 'figma' | 'website';
export type OpenedGuidelineProject = OpenedSourceProject & {
  outputs: GuidelineSelectedOutputs;
  assistanceReceipt: AssistanceReceipt | null;
  refreshLineage: GuidelineRefreshLineage | null;
  gradientSelection: GuidelineAuthoredGradientSelection | null;
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
const CONTINUOUS_WORKSPACES = [CONTINUOUS_WORKSPACE_VERSION, NEW_SCALE_WORKSPACE_VERSION];
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
  ]);
  const { bundleHash, ...content } = raw;
  if (guidelineHash(content) !== bundleHash || typeof raw.sourceProjectJson !== 'string')
    throw new Error('Workspace bundle integrity check failed.');
  const source = await readSourceProject(raw.sourceProjectJson);
  signal?.throwIfAborted();
  if (source.status === 'read-only') return source;
  const outputs = await readGuidelineSelectedOutputs(
    raw.outputs,
    source.value.project.review,
    signal,
    version === NEW_SCALE_WORKSPACE_VERSION
  );
  let assistanceReceipt: AssistanceReceipt | null = null;
  if (raw.assistanceReceipt !== null) {
    if (source.value.kind !== 'pdf')
      throw new Error('Assistance receipts currently require a PDF source.');
    assistanceReceipt = await readGuidelineAssistanceReceipt(
      raw.assistanceReceipt,
      source.value.project.capture
    );
  }
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
    ? readGuidelineAuthoredGradient(source.value.project.review, raw.gradientSelection)
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
    version !== NEW_SCALE_WORKSPACE_VERSION &&
    refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v7'
  )
    throw new Error('Source-derived scale history requires workspace V8.');
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
  return {
    status: 'opened',
    value: {
      ...source.value,
      outputs: supporting ? { ...outputs, supporting } : outputs,
      assistanceReceipt,
      refreshLineage,
      gradientSelection,
    },
  };
}

export async function serializeGuidelineWorkspace(
  sourceProjectJson: string,
  outputs: GuidelineSelectedOutputs,
  assistanceReceipt: AssistanceReceipt | null = null,
  signal?: AbortSignal,
  refreshLineage: GuidelineRefreshLineage | null = null,
  gradientSelection: GuidelineAuthoredGradientSelection | null = null
): Promise<string> {
  const version =
    hasGuidelineNewScale(outputs) ||
    refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v7'
      ? NEW_SCALE_WORKSPACE_VERSION
      : gradientSelection?.schemaVersion === CONTINUOUS_GRADIENT_VERSION ||
          refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v6'
        ? CONTINUOUS_WORKSPACE_VERSION
        : gradientSelection?.schemaVersion === CATALOG_GRADIENT_VERSION ||
            refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v5'
          ? CATALOG_WORKSPACE_VERSION
          : gradientSelection?.schemaVersion === ASSESSED_GRADIENT_VERSION ||
              refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v4'
            ? ASSESSED_WORKSPACE_VERSION
            : outputs.supporting ||
                refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v3'
              ? SUPPORTING_WORKSPACE_VERSION
              : gradientSelection ||
                  refreshLineage?.schemaVersion === 'teul.guideline-refresh-lineage.v2'
                ? AUTHORED_WORKSPACE_VERSION
                : refreshLineage
                  ? REFRESH_WORKSPACE_VERSION
                  : WORKSPACE_VERSION;
  const content = snapshotColorSystemInertJsonV1(
    {
      schemaVersion: version,
      sourceProjectJson,
      outputs: storedGuidelineOutputs(outputs),
      assistanceReceipt,
      ...(version !== WORKSPACE_VERSION ? { refreshLineage } : {}),
      ...(AUTHORED_WORKSPACES.includes(version) ? { gradientSelection } : {}),
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
  ]);
  const json =
    outputs.extension ||
    outputs.application ||
    outputs.supporting ||
    assistanceReceipt ||
    refreshLineage ||
    gradientSelection
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
