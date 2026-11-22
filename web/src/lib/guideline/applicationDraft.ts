import {
  applyGroupedReportEdits,
  readGroupedReportEdits,
  type GroupedReportEdits,
} from './groupedReportControls';
import { groupedReportUseIds } from './groupedReportGeometry';
import {
  readGuidelineCompositionGradient,
  type GuidelineCompositionGradient,
} from './compositionGradient';
import {
  applyCapacityBarsEdits,
  readCapacityBarsEdits,
  type CapacityBarsEdits,
} from './capacityBarsControls';
import { capacityBarsUseIds } from './capacityBarsGeometry';
import {
  applyQuantitativeMatrixEdits,
  readQuantitativeMatrixEdits,
  type QuantitativeMatrixEdits,
} from './quantitativeMatrixDraft';
import { validateGuidelineChartControls, type GuidelineChartControls } from './chartGeometry';
import type {
  GuidelineApplicationLayoutInput,
  GuidelinePanelLayoutInput,
} from './applicationGeometry';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import {
  applicationChoiceKey,
  buildGuidelineApplicationLayout,
  GUIDELINE_PRODUCT_STATES,
} from './applicationGeometry';
export { applicationChoiceKey } from './applicationGeometry';
import { guidelineHash, type ReviewedGuideline } from './review';
import {
  previewGuidelineExtension,
  reviewGuidelineExtension,
  readGuidelineExtensionRequest,
  readGuidelineExtensionReview,
  type GuidelineExtensionRequest,
  type GuidelineExtensionReview,
} from './extension';
import type { GuidelineAvailableExtension } from './selectedOutputs';
import type { GuidelineApplicationRequest } from './application';
import type { GuidelineRuleDecisions } from './extensionRuleReview';
import {
  readGuidelineContextPaints,
  guidelineContextPaintsForMode,
  type GuidelineContextPaints,
} from './contextPaints';

export interface GuidelineDraftExtension {
  request: GuidelineExtensionRequest;
  decision: GuidelineExtensionReview | null;
  previewHash: string;
}
export interface GuidelineApplicationDraft {
  contextPaints?: GuidelineContextPaints;
  contextReview?: GuidelineApplicationRequest['contextReview'];
  contextRuleChoices?: GuidelineRuleDecisions;
  kind: 'brand' | 'product' | 'chart' | 'panel' | 'composition';
  decorativeGradient?: GuidelineCompositionGradient;
  panel?: Omit<GuidelinePanelLayoutInput, 'kind' | 'modeId'>;
  chart?: GuidelineChartControls;
  matrixEdits?: QuantitativeMatrixEdits;
  capacityEdits?: CapacityBarsEdits;
  reportEdits?: GroupedReportEdits;
  modeId: string;
  layoutName: 'split' | 'frame' | 'stack';
  primaryShare: number;
  useExtension: boolean;
  extension: GuidelineDraftExtension | null;
  choices: Record<string, string>;
  anchorColorId: string;
  brandPurpose: 'brand-primary' | 'marketing-accent';
  ruleChoices: GuidelineRuleDecisions;
}
export const applicationChoice = (
  choices: Record<string, string>,
  applicationId: string,
  useId: string
) =>
  (applicationId === 'capacity-bars' && useId.startsWith('booked-')
    ? choices[applicationChoiceKey(applicationId, useId.replace('booked-', 'category-'))]
    : choices[applicationChoiceKey(applicationId, useId)]) ||
  choices[applicationChoiceKey('all', useId)] ||
  (useId === 'action' ? choices[applicationChoiceKey('rest', 'action')] : '') ||
  '';
const keys = new Set([
  ...groupedReportUseIds.map(useId => `grouped-report/${useId}`),
  ...capacityBarsUseIds.map(useId => `capacity-bars/${useId}`),
  ...[
    'ground',
    'text',
    ...Array.from({ length: 5 }, (_, i) => `bin-${i + 1}`),
    ...Array.from({ length: 12 }, (_, i) => `step-${i + 1}`),
    'original-1',
    'original-2',
  ].map(useId => `matrix-bars/${useId}`),
  'composition/ground',
  'composition/text-1',
  'composition/text-2',
  'panel/ground',
  'panel/text-1',
  'panel/text-2',
  'chart/ground',
  ...Array.from({ length: 9 }, (_, i) => [`chart/mark-${i + 1}`, `chart/label-${i + 1}`]).flat(),
  ...['split', 'frame', 'stack'].flatMap(layout =>
    buildGuidelineApplicationLayout({
      kind: 'brand',
      modeId: 'Draft',
      layout: layout as 'split' | 'frame' | 'stack',
      primaryShare: 60,
    }).roles.map(r => applicationChoiceKey(r.applicationId, r.useId))
  ),
  ...buildGuidelineApplicationLayout({ kind: 'product', modeId: 'Draft' }).roles.map(r =>
    applicationChoiceKey(r.applicationId, r.useId)
  ),
  ...['ground', 'label', 'partner'].map(role => applicationChoiceKey('all', role)),
]);
function fail(): never {
  throw new Error('Unsupported or oversized application controls.');
}
function text(value: unknown, maximum = 128): asserts value is string {
  if (typeof value !== 'string' || value.length > maximum) fail();
}
export function readGuidelineApplicationDraft(raw: unknown): GuidelineApplicationDraft {
  const value = snapshotColorSystemInertJsonV1(raw, {
    maximumBytes: 768 * 1024,
    maximumDepth: 30,
    maximumNodes: 240000,
  });
  record(value, [
    'kind',
    'modeId',
    'layoutName',
    'primaryShare',
    'useExtension',
    'extension',
    'choices',
    'anchorColorId',
    'brandPurpose',
    'ruleChoices',
    ...(value && typeof value === 'object' && 'chart' in value ? ['chart'] : []),
    ...(value && typeof value === 'object' && 'matrixEdits' in value ? ['matrixEdits'] : []),
    ...(value && typeof value === 'object' && 'capacityEdits' in value ? ['capacityEdits'] : []),
    ...(value && typeof value === 'object' && 'reportEdits' in value ? ['reportEdits'] : []),
    ...(value && typeof value === 'object' && 'panel' in value ? ['panel'] : []),
    ...(value && typeof value === 'object' && 'decorativeGradient' in value
      ? ['decorativeGradient']
      : []),
    ...(value && typeof value === 'object' && 'contextPaints' in value ? ['contextPaints'] : []),
    ...(value && typeof value === 'object' && 'contextReview' in value ? ['contextReview'] : []),
    ...(value && typeof value === 'object' && 'contextRuleChoices' in value
      ? ['contextRuleChoices']
      : []),
  ]);
  if ('contextPaints' in value) readGuidelineContextPaints(value.contextPaints);
  if ('contextReview' in value) {
    if (!('contextPaints' in value)) fail();
    readGuidelineExtensionReview(value.contextReview);
  }
  if ('contextRuleChoices' in value && !('contextPaints' in value)) fail();
  if (
    typeof value.kind !== 'string' ||
    typeof value.layoutName !== 'string' ||
    typeof value.brandPurpose !== 'string' ||
    !['brand', 'product', 'chart', 'panel', 'composition'].includes(value.kind as string) ||
    !['split', 'frame', 'stack'].includes(value.layoutName as string) ||
    !['brand-primary', 'marketing-accent'].includes(value.brandPurpose as string) ||
    typeof value.useExtension !== 'boolean' ||
    typeof value.primaryShare !== 'number' ||
    !Number.isInteger(value.primaryShare) ||
    value.primaryShare < 20 ||
    value.primaryShare > 80
  )
    fail();
  if (value.kind === 'chart') {
    record(value.chart, [
      'sourceContextId',
      'meaning',
      'count',
      'direction',
      ...(value.chart && typeof value.chart === 'object' && 'matrix' in value.chart
        ? ['matrix']
        : []),
      ...(value.chart && typeof value.chart === 'object' && 'capacity' in value.chart
        ? ['capacity']
        : []),
      ...(value.chart && typeof value.chart === 'object' && 'report' in value.chart
        ? ['report']
        : []),
    ]);
    if ('matrix' in value.chart && !value.chart.matrix) fail();
    if ('capacity' in value.chart && !value.chart.capacity) fail();
    if ('report' in value.chart && !value.chart.report) fail();
    validateGuidelineChartControls(value.chart as unknown as GuidelineChartControls);
  } else if ('chart' in value) fail();
  if ('matrixEdits' in value) {
    if (value.kind !== 'chart' || !(value.chart as GuidelineChartControls).matrix) fail();
    readQuantitativeMatrixEdits(value.matrixEdits);
  }
  if ('reportEdits' in value) {
    if (value.kind !== 'chart' || !(value.chart as GuidelineChartControls).report) fail();
    readGroupedReportEdits(value.reportEdits);
  }
  if ('capacityEdits' in value) {
    if (value.kind !== 'chart' || !(value.chart as GuidelineChartControls).capacity) fail();
    readCapacityBarsEdits(value.capacityEdits);
  }
  if (value.kind === 'panel' || value.kind === 'composition') {
    const panel = value.panel;
    record(panel, [
      'sourceContextId',
      'width',
      'height',
      'heading',
      'body',
      ...(panel && typeof panel === 'object' && 'sourceRoles' in panel ? ['sourceRoles'] : []),
    ]);
    if (
      !['brand', 'product'].includes(panel.sourceContextId as string) ||
      !Number.isInteger(panel.width) ||
      Number(panel.width) < 240 ||
      Number(panel.width) > 1200 ||
      !Number.isInteger(panel.height) ||
      Number(panel.height) < 160 ||
      Number(panel.height) > 1600
    )
      fail();
    text(panel.heading, 256);
    text(panel.body, 256);
    if ('sourceRoles' in panel) {
      record(panel.sourceRoles, ['ground', 'heading', 'body']);
      for (const role of Object.values(panel.sourceRoles)) text(role);
    }
  } else if ('panel' in value) fail();
  if ('decorativeGradient' in value) {
    if (value.kind !== 'composition') fail();
    readGuidelineCompositionGradient(value.decorativeGradient);
  }
  text(value.modeId);
  text(value.anchorColorId);
  if (value.extension !== null) {
    record(value.extension, ['request', 'decision', 'previewHash']);
    readGuidelineExtensionRequest(value.extension.request);
    if (value.extension.decision !== null) readGuidelineExtensionReview(value.extension.decision);
    if (
      typeof value.extension.previewHash !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(value.extension.previewHash)
    )
      fail();
  }
  if (!value.choices || typeof value.choices !== 'object' || Array.isArray(value.choices)) fail();
  for (const [key, color] of Object.entries(value.choices)) {
    if (!keys.has(key)) fail();
    text(color);
  }
  if (
    !value.ruleChoices ||
    typeof value.ruleChoices !== 'object' ||
    Array.isArray(value.ruleChoices) ||
    Object.keys(value.ruleChoices).length > 128
  )
    fail();
  if (
    'contextRuleChoices' in value &&
    (!value.contextRuleChoices ||
      typeof value.contextRuleChoices !== 'object' ||
      Array.isArray(value.contextRuleChoices) ||
      Object.keys(value.contextRuleChoices).length > 128)
  )
    fail();
  for (const [key, status] of [
    ...Object.entries(value.ruleChoices),
    ...Object.entries(value.contextRuleChoices ?? {}),
  ]) {
    text(key);
    if (typeof status !== 'string' || !['', 'accepted', 'rejected'].includes(status)) fail();
  }
  return freeze(value as unknown as GuidelineApplicationDraft);
}
const previewHashes = new WeakMap<GuidelineAvailableExtension['preview'], string>();
function previewHash(preview: GuidelineAvailableExtension['preview']) {
  const cached = previewHashes.get(preview);
  if (cached) return cached;
  const hash = guidelineHash(preview);
  if (Object.isFrozen(preview)) previewHashes.set(preview, hash);
  return hash;
}
export function captureGuidelineDraftExtension(
  value: GuidelineAvailableExtension | null
): GuidelineDraftExtension | null {
  return value
    ? freeze({
        request: value.preview.request,
        decision: value.decision,
        previewHash: previewHash(value.preview),
      })
    : null;
}
export function matchesGuidelineDraftExtension(
  capsule: GuidelineDraftExtension | null,
  value: GuidelineAvailableExtension | null
): boolean {
  return (
    !!capsule &&
    !!value &&
    guidelineHash(captureGuidelineDraftExtension(value)) === guidelineHash(capsule)
  );
}
export async function restoreGuidelineDraftExtension(
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>,
  capsule: GuidelineDraftExtension,
  signal?: AbortSignal
): Promise<GuidelineAvailableExtension> {
  signal?.throwIfAborted();
  const execution = {
    isCancelled: () => signal?.aborted ?? false,
    yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
  };
  const preview = capsule.decision
    ? await reviewGuidelineExtension(review, capsule.request, capsule.decision, execution)
    : await previewGuidelineExtension(review, capsule.request, execution);
  signal?.throwIfAborted();
  if (previewHash(preview) !== capsule.previewHash)
    throw new Error(
      'The draft’s proposed shades changed. Your choices remain saved; review the scale before checking this application.'
    );
  return freeze({ preview, decision: capsule.decision });
}
export function applicationChoices(request: GuidelineApplicationRequest): Record<string, string> {
  const choices = Object.fromEntries(
    request.assignments
      .filter(a => !(a.applicationId === 'capacity-bars' && a.useId.startsWith('booked-')))
      .map(a => [applicationChoiceKey(a.applicationId, a.useId), a.colorId])
  );
  if (request.layout.kind === 'product')
    for (const useId of ['ground', 'label', 'partner', 'action']) {
      const shared = choices[applicationChoiceKey('rest', useId)];
      if (useId !== 'action') choices[applicationChoiceKey('all', useId)] = shared;
      for (const state of GUIDELINE_PRODUCT_STATES) {
        const key = applicationChoiceKey(state, useId);
        if (choices[key] === shared && !(useId === 'action' && state === 'rest'))
          delete choices[key];
      }
    }
  return choices;
}
export function applicationDraftFromRequest(
  request: GuidelineApplicationRequest
): GuidelineApplicationDraft {
  return {
    ...(request.contextPaints ? { contextPaints: request.contextPaints } : {}),
    ...(request.contextReview ? { contextReview: request.contextReview } : {}),
    kind: request.layout.kind,
    ...(request.decorativeGradient ? { decorativeGradient: request.decorativeGradient } : {}),
    ...(request.layout.kind === 'panel' || request.layout.kind === 'composition'
      ? {
          panel: (() => {
            const { kind: _kind, modeId: _mode, ...panel } = request.layout;
            return panel;
          })(),
        }
      : {}),
    ...(request.layout.kind === 'chart'
      ? {
          chart: {
            ...(request.layout.matrix ? { matrix: request.layout.matrix } : {}),
            ...(request.layout.capacity ? { capacity: request.layout.capacity } : {}),
            ...(request.layout.report ? { report: request.layout.report } : {}),
            sourceContextId: request.layout.sourceContextId,
            meaning: request.layout.meaning,
            count: request.layout.count,
            direction: request.layout.direction,
          },
        }
      : {}),
    modeId: request.layout.modeId,
    layoutName: request.layout.kind === 'brand' ? request.layout.layout : 'split',
    primaryShare: request.layout.kind === 'brand' ? request.layout.primaryShare : 60,
    useExtension: !!request.extension,
    extension: captureGuidelineDraftExtension(request.extension),
    choices: applicationChoices(request),
    anchorColorId: request.extension?.anchorColorId ?? '',
    brandPurpose:
      request.extension?.purpose === 'marketing-accent' ? 'marketing-accent' : 'brand-primary',
    ruleChoices: {},
  };
}

/** Ignore inherited-versus-explicit control spelling when the actual requested paint is identical. */
export function applicationDraftMatchesRequest(
  draft: GuidelineApplicationDraft,
  request: GuidelineApplicationRequest
): boolean {
  const layout = applicationLayoutFromDraft(draft);
  if (
    canonicalJson(draft.decorativeGradient ?? null) !==
    canonicalJson(request.decorativeGradient ?? null)
  )
    return false;
  if (canonicalJson(draft.contextReview ?? null) !== canonicalJson(request.contextReview ?? null))
    return false;
  if (
    canonicalJson(guidelineContextPaintsForMode(draft.contextPaints, draft.modeId) ?? null) !==
    canonicalJson(request.contextPaints ?? null)
  )
    return false;
  if (canonicalJson(layout) !== canonicalJson(request.layout)) return false;
  if (
    !request.assignments.every(
      a => applicationChoice(draft.choices, a.applicationId, a.useId) === a.colorId
    )
  )
    return false;
  if (!draft.useExtension) return request.extension === null;
  return (
    !!request.extension &&
    matchesGuidelineDraftExtension(draft.extension, request.extension) &&
    draft.anchorColorId === request.extension.anchorColorId &&
    applicationExtensionPurpose(draft) === request.extension.purpose
  );
}

/** One request builder for saved controls, the UI and derived source-bound briefs. */
export function applicationLayoutFromDraft(
  draft: GuidelineApplicationDraft
): GuidelineApplicationLayoutInput {
  if (draft.kind === 'panel' || draft.kind === 'composition') {
    if (!draft.panel) fail();
    return { kind: draft.kind, modeId: draft.modeId, ...draft.panel };
  }
  if (draft.kind === 'chart') {
    if (!draft.chart) fail();
    return {
      kind: 'chart',
      modeId: draft.modeId,
      ...draft.chart,
      ...(draft.chart.report && draft.reportEdits
        ? {
            report: {
              ...draft.chart.report,
              input: applyGroupedReportEdits(draft.chart.report.input, draft.reportEdits),
            },
          }
        : {}),
      ...(draft.chart.capacity && draft.capacityEdits
        ? {
            capacity: {
              ...draft.chart.capacity,
              input: applyCapacityBarsEdits(draft.chart.capacity.input, draft.capacityEdits),
            },
          }
        : {}),
      ...(draft.chart.matrix && draft.matrixEdits
        ? {
            matrix: {
              ...draft.chart.matrix,
              input: applyQuantitativeMatrixEdits(draft.chart.matrix.input, draft.matrixEdits),
            },
          }
        : {}),
    };
  }
  return draft.kind === 'product'
    ? { kind: draft.kind, modeId: draft.modeId }
    : {
        kind: draft.kind,
        modeId: draft.modeId,
        layout: draft.layoutName,
        primaryShare: draft.primaryShare,
      };
}
export function applicationExtensionPurpose(
  draft: GuidelineApplicationDraft
): NonNullable<GuidelineApplicationRequest['extension']>['purpose'] {
  return draft.kind === 'chart'
    ? `${draft.chart!.meaning}-data`
    : draft.kind === 'product' ||
        ((draft.kind === 'panel' || draft.kind === 'composition') &&
          draft.panel?.sourceContextId === 'product')
      ? 'product-semantics'
      : draft.brandPurpose;
}
