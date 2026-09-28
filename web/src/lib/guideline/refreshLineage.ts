import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import {
  readGuidelineSupportingDirection,
  storedGuidelineSupportingSelection,
} from './supportingDirections';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { readSourceProject, type OpenedSourceProject } from './sourceProjectCodec';
import {
  readGuidelineAuthoredGradient,
  ASSESSED_GRADIENT_VERSION,
  CATALOG_GRADIENT_VERSION,
  CONTINUOUS_GRADIENT_VERSION,
  type GuidelineAuthoredGradientSelection,
} from './authoredGradient';
import { proposePdfRefresh } from './pdfRefresh';
import { preparePdfReviewedContinuity } from './pdfReviewedContinuity';
import { proposeFigmaRefresh, proposeWebsiteRefresh } from './nativeRefreshSources';
import { figmaSourceStatements } from './figmaReview';
import { websiteSourceStatements } from './websiteModel';
import { upgradeGuidelineDraftV2 } from './reviewV2';
import { guidelineHash } from './review';
import {
  GUIDELINE_WORKSPACE_LIMITS,
  hasGuidelineNewScale,
  readGuidelineSelectedOutputs,
  storedGuidelineOutputs,
  type GuidelineSelectedOutputs,
} from './selectedOutputs';

const VERSION = 'teul.guideline-refresh-lineage.v1' as const;
export const NEW_SCALE_LINEAGE_VERSION = 'teul.guideline-refresh-lineage.v7' as const;
export type GuidelineRefreshLineage = {
  previousSourceProjectJson: string;
  previousOutputs: ReturnType<typeof storedGuidelineOutputs>;
  nextCaptureHash: string;
  comparisonHash: string;
  lineageHash: string;
} & (
  | { schemaVersion: typeof VERSION }
  | {
      schemaVersion: typeof NEW_SCALE_LINEAGE_VERSION;
      previousGradient: GuidelineAuthoredGradientSelection | null;
      previousSupporting: string | null;
    }
  | {
      schemaVersion: 'teul.guideline-refresh-lineage.v2';
      previousGradient: GuidelineAuthoredGradientSelection;
    }
  | {
      schemaVersion: 'teul.guideline-refresh-lineage.v3';
      previousGradient: GuidelineAuthoredGradientSelection | null;
      previousSupporting: string;
    }
  | {
      schemaVersion:
        | 'teul.guideline-refresh-lineage.v4'
        | 'teul.guideline-refresh-lineage.v5'
        | 'teul.guideline-refresh-lineage.v6';
      previousGradient: GuidelineAuthoredGradientSelection;
      previousSupporting: string | null;
    }
);
export interface GuidelineRefreshContext {
  previous: OpenedSourceProject;
  outputs: GuidelineSelectedOutputs;
  gradient: GuidelineAuthoredGradientSelection | null;
  colorPairs: ReadonlyMap<string, string>;
  modePairs: ReadonlyMap<string, string>;
  evidencePairs: ReadonlyMap<string, string>;
  scaleIds: ReadonlySet<string>;
  metadataChanges: readonly string[];
}
const validated = new WeakMap<GuidelineRefreshLineage, GuidelineRefreshContext>();
export const sourceCaptureHash = (source: OpenedSourceProject) =>
  source.kind === 'pdf' ? source.project.capture.captureHash : source.project.capture.contentHash;
export function compareGuidelineSourceProjects(
  previous: OpenedSourceProject,
  next: OpenedSourceProject
) {
  const colors = new Map<string, string>(),
    modes = new Map<string, string>(),
    evidence = new Map<string, string>();
  if (previous.kind === 'pdf' && next.kind === 'pdf') {
    const oldDraft = previous.project.draft;
    const prepared =
      'reviewedValues' in oldDraft && 'reviewedValues' in next.project.draft
        ? preparePdfReviewedContinuity(previous.project.capture, oldDraft, next.project.capture)
        : null;
    const proposal =
      prepared?.proposal ??
      proposePdfRefresh(
        previous.project.capture,
        'scales' in oldDraft ? oldDraft : upgradeGuidelineDraftV2(oldDraft),
        next.project.capture
      );
    const manual =
      prepared && 'reviewedValues' in next.project.draft
        ? prepared.compare(next.project.draft)
        : null;
    if (!proposal.metadataChanges.length) {
      for (const change of proposal.changes)
        if (change.status === 'unchanged' && change.beforeId && change.afterId) {
          evidence.set(change.beforeId, change.afterId);
          if (change.kind === 'color') {
            // V1 used ordinal color IDs; later PDFs use observation-derived IDs. Both retain evidence links.
            const left =
              previous.project.review?.model.colors.filter(c =>
                c.evidenceRefs.includes(change.beforeId!)
              ) ?? [];
            const right =
              next.project.review?.model.colors.filter(c =>
                c.evidenceRefs.includes(change.afterId!)
              ) ?? [];
            if (left.length === 1 && right.length === 1) colors.set(left[0].id, right[0].id);
          }
        }
      for (const [beforeId, afterId] of manual?.candidatePairs ?? []) {
        const left =
          previous.project.review?.model.colors.filter(c => c.evidenceRefs.includes(beforeId)) ??
          [];
        const right =
          next.project.review?.model.colors.filter(c => c.evidenceRefs.includes(afterId)) ?? [];
        if (left.length === 1 && right.length === 1) colors.set(left[0].id, right[0].id);
      }
      for (const [beforeId, afterId] of manual?.evidencePairs ?? [])
        evidence.set(beforeId, afterId);
      modes.set('Source', 'Source');
    }
    return { proposal, colors, modes, evidence, scales: manual?.scales ?? proposal.draft.scales };
  }
  const native =
    previous.kind === 'figma' && next.kind === 'figma'
      ? {
          proposal: proposeFigmaRefresh(previous.inventory, previous.project.draft, next.inventory),
          before: figmaSourceStatements(previous.inventory),
          after: figmaSourceStatements(next.inventory),
        }
      : previous.kind === 'website' && next.kind === 'website'
        ? {
            proposal: proposeWebsiteRefresh(
              previous.inventory,
              previous.project.draft,
              next.inventory
            ),
            before: websiteSourceStatements(previous.inventory),
            after: websiteSourceStatements(next.inventory),
          }
        : null;
  if (!native) throw new Error('A source refresh cannot change its input format.');
  if (!native.proposal.metadataChanges.length) {
    const before = new Map(native.before.map(s => [s.id, s.evidenceId])),
      after = new Map(native.after.map(s => [s.id, s.evidenceId]));
    for (const change of native.proposal.changes)
      if (change.status === 'unchanged' && change.beforeId && change.afterId) {
        if (change.kind === 'color') colors.set(change.beforeId, change.afterId);
        if (change.kind === 'mode') modes.set(change.beforeId, change.afterId);
        if (change.kind === 'statement')
          evidence.set(before.get(change.beforeId)!, after.get(change.afterId)!);
      }
  }
  return { ...native, colors, modes, evidence, scales: native.proposal.draft.scales };
}
async function inspect(
  raw: unknown,
  next: OpenedSourceProject,
  signal?: AbortSignal,
  verified?: {
    previous: OpenedSourceProject;
    mapped: ReturnType<typeof compareGuidelineSourceProjects>;
  }
) {
  signal?.throwIfAborted();
  const input = snapshotColorSystemInertJsonV1(raw, GUIDELINE_WORKSPACE_LIMITS);
  const isV2 =
    input &&
    typeof input === 'object' &&
    'schemaVersion' in input &&
    input.schemaVersion === 'teul.guideline-refresh-lineage.v2';
  const isV3 =
    input &&
    typeof input === 'object' &&
    'schemaVersion' in input &&
    input.schemaVersion === 'teul.guideline-refresh-lineage.v3';
  const isV4 =
    input &&
    typeof input === 'object' &&
    'schemaVersion' in input &&
    input.schemaVersion === 'teul.guideline-refresh-lineage.v4';
  const isV5 =
    input &&
    typeof input === 'object' &&
    'schemaVersion' in input &&
    input.schemaVersion === 'teul.guideline-refresh-lineage.v5';
  const isV6 =
    input &&
    typeof input === 'object' &&
    'schemaVersion' in input &&
    input.schemaVersion === 'teul.guideline-refresh-lineage.v6';
  const isV7 =
    input &&
    typeof input === 'object' &&
    'schemaVersion' in input &&
    input.schemaVersion === NEW_SCALE_LINEAGE_VERSION;
  record(input, [
    'schemaVersion',
    'previousSourceProjectJson',
    'previousOutputs',
    'nextCaptureHash',
    'comparisonHash',
    'lineageHash',
    ...(isV2 || isV3 || isV4 || isV5 || isV6 || isV7 ? ['previousGradient'] : []),
    ...(isV3 || isV4 || isV5 || isV6 || isV7 ? ['previousSupporting'] : []),
  ]);
  const { lineageHash, ...content } = input;
  if (
    (input.schemaVersion !== VERSION && !isV2 && !isV3 && !isV4 && !isV5 && !isV6 && !isV7) ||
    guidelineHash(content) !== lineageHash ||
    typeof input.previousSourceProjectJson !== 'string' ||
    input.nextCaptureHash !== sourceCaptureHash(next)
  )
    throw new Error('Refresh history does not bind this source capture.');
  // The source-only dispatcher rejects workspace envelopes, preventing recursive history expansion.
  const previous = verified
    ? { status: 'opened' as const, value: verified.previous }
    : await readSourceProject(input.previousSourceProjectJson);
  if (previous.status !== 'opened')
    throw new Error('Refresh history requires a supported previous source project.');
  const gradient =
    isV2 || isV3 || isV4 || isV5 || isV6 || isV7
      ? readGuidelineAuthoredGradient(previous.value.project.review, input.previousGradient)
      : null;
  if (!isV4 && !isV5 && !isV7 && gradient?.schemaVersion === ASSESSED_GRADIENT_VERSION)
    throw new Error('Declared gradient use requires refresh history V4.');
  if (isV4 && gradient?.schemaVersion !== ASSESSED_GRADIENT_VERSION)
    throw new Error('Refresh history V4 requires an assessed gradient.');
  if (!isV5 && !isV7 && gradient?.schemaVersion === CATALOG_GRADIENT_VERSION)
    throw new Error('Catalog gradient history requires V5.');
  if (isV5 && gradient?.schemaVersion !== CATALOG_GRADIENT_VERSION)
    throw new Error('Refresh history V5 requires a catalog gradient.');
  if (!isV6 && !isV7 && gradient?.schemaVersion === CONTINUOUS_GRADIENT_VERSION)
    throw new Error('The continuous gradient format requires refresh history V6.');
  if (isV6 && gradient?.schemaVersion !== CONTINUOUS_GRADIENT_VERSION)
    throw new Error('Refresh history V6 requires the continuous gradient format.');
  if (gradient && previous.value.project.selection)
    throw new Error('Refresh history cannot contain two selected gradients.');
  if (isV2 && (!gradient || previous.value.project.selection))
    throw new Error('Refresh history requires one selected gradient.');
  const outputs = await readGuidelineSelectedOutputs(
    input.previousOutputs,
    previous.value.project.review,
    signal,
    !!isV7
  );
  let supporting;
  if (isV3 || ((isV4 || isV5 || isV6 || isV7) && input.previousSupporting !== null)) {
    if (typeof input.previousSupporting !== 'string' || !previous.value.project.review)
      throw new Error('Supporting history requires a source review and chosen direction.');
    supporting = await readGuidelineSupportingDirection(
      input.previousSupporting,
      previous.value.project.review,
      signal
    );
    if (gradient && previous.value.project.selection)
      throw new Error('Refresh history cannot contain two selected gradients.');
  }
  const mapped = verified?.mapped ?? compareGuidelineSourceProjects(previous.value, next);
  if (input.comparisonHash !== mapped.proposal.proposalHash)
    throw new Error('Refresh history differs from its source comparison.');
  signal?.throwIfAborted();
  const lineage = freeze(input as unknown as GuidelineRefreshLineage);
  const context: GuidelineRefreshContext = {
    previous: previous.value,
    outputs: supporting ? { ...outputs, supporting } : outputs,
    gradient,
    colorPairs: mapped.colors,
    modePairs: mapped.modes,
    evidencePairs: mapped.evidence,
    scaleIds: retainedScaleIds(mapped.scales, next.project.draft),
    metadataChanges: mapped.proposal.metadataChanges,
  };
  validated.set(lineage, context);
  return { lineage, context };
}
export async function createGuidelineRefreshLineage(
  previousSourceProjectJson: string,
  previousOutputs: GuidelineSelectedOutputs,
  next: OpenedSourceProject,
  signal?: AbortSignal,
  previousGradient: GuidelineAuthoredGradientSelection | null = null
): Promise<GuidelineRefreshLineage> {
  signal?.throwIfAborted();
  const previous = await readSourceProject(previousSourceProjectJson);
  if (previous.status !== 'opened') throw new Error('The previous source is read-only.');
  const comparison = compareGuidelineSourceProjects(previous.value, next);
  const newScales = hasGuidelineNewScale(previousOutputs);
  const content = {
    schemaVersion: newScales
      ? NEW_SCALE_LINEAGE_VERSION
      : previousGradient?.schemaVersion === CONTINUOUS_GRADIENT_VERSION
        ? ('teul.guideline-refresh-lineage.v6' as const)
        : previousGradient?.schemaVersion === CATALOG_GRADIENT_VERSION
          ? ('teul.guideline-refresh-lineage.v5' as const)
          : previousGradient?.schemaVersion === ASSESSED_GRADIENT_VERSION
            ? ('teul.guideline-refresh-lineage.v4' as const)
            : previousOutputs.supporting
              ? ('teul.guideline-refresh-lineage.v3' as const)
              : previousGradient
                ? ('teul.guideline-refresh-lineage.v2' as const)
                : VERSION,
    previousSourceProjectJson,
    previousOutputs: storedGuidelineOutputs(previousOutputs),
    nextCaptureHash: sourceCaptureHash(next),
    comparisonHash: comparison.proposal.proposalHash,
    ...(newScales || previousGradient || previousOutputs.supporting ? { previousGradient } : {}),
    ...(newScales ||
    previousOutputs.supporting ||
    previousGradient?.schemaVersion === ASSESSED_GRADIENT_VERSION ||
    previousGradient?.schemaVersion === CATALOG_GRADIENT_VERSION ||
    previousGradient?.schemaVersion === CONTINUOUS_GRADIENT_VERSION
      ? {
          previousSupporting: previousOutputs.supporting
            ? storedGuidelineSupportingSelection(previousOutputs.supporting)
            : null,
        }
      : {}),
  };
  return (
    await inspect({ ...content, lineageHash: guidelineHash(content) }, next, signal, {
      previous: previous.value,
      mapped: comparison,
    })
  ).lineage;
}
export async function readGuidelineRefreshLineage(
  raw: unknown,
  next: OpenedSourceProject,
  signal?: AbortSignal
): Promise<GuidelineRefreshLineage> {
  return (await inspect(raw, next, signal)).lineage;
}
export async function guidelineRefreshContext(
  lineage: GuidelineRefreshLineage,
  next: OpenedSourceProject,
  signal?: AbortSignal
): Promise<GuidelineRefreshContext> {
  signal?.throwIfAborted();
  // Current reviewed choices determine PDF model IDs; always recompute correspondence against them.
  const cached = validated.get(lineage);
  if (cached && lineage.nextCaptureHash === sourceCaptureHash(next)) {
    const mapped = compareGuidelineSourceProjects(cached.previous, next);
    if (mapped.proposal.proposalHash !== lineage.comparisonHash)
      throw new Error('Refresh comparison changed.');
    return {
      ...cached,
      colorPairs: mapped.colors,
      modePairs: mapped.modes,
      evidencePairs: mapped.evidence,
      scaleIds: retainedScaleIds(mapped.scales, next.project.draft),
    };
  }
  return (await inspect(lineage, next, signal)).context;
}

/** Equality used after remapping references, never to infer source identity from equal paint. */
export const sameRefreshValue = (left: unknown, right: unknown) =>
  canonicalJson(left) === canonicalJson(right);

export function retainedScaleIds(
  proposed: readonly { id: string; evidenceRefs: readonly string[] }[],
  current: OpenedSourceProject['project']['draft']
) {
  // Use declared evidence, not the first compiled color ref: a renewed profile
  // decision can change which ref sorts first without changing the source scale.
  return new Set(
    proposed
      .filter(scale => {
        const actual =
          'scales' in current ? current.scales.find(s => s.id === scale.id) : undefined;
        return (
          actual &&
          sameRefreshValue([...scale.evidenceRefs].sort(), [...actual.evidenceRefs].sort())
        );
      })
      .map(s => s.id)
  );
}
