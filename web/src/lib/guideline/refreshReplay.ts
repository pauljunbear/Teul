import {
  isGuidelineNativeGradient,
  readGuidelineNativeGradient,
  createGuidelineNativeGradient,
  nativeGradientControls,
} from './nativeGradientSelection';
import type { GuidelineEditableGradientSelection } from './gradientExport';
import {
  singleNativeGradientSources,
  bindGuidelineNativeGradientSource,
  type GuidelineNativeGradientSourceBinding,
  resolveGuidelineNativeGradientSource,
  type GuidelineNativeGradientSource,
} from './nativeGradientWorkspace';
import { isNativeLinearPaintV1 } from '../../../../src/lib/colorSystemFinalGradientPaintV1';
import type { GuidelineCompositionGradient } from './compositionGradient';
import { guidelineContextPaintChoices, refreshGuidelineContextPaints } from './contextPaints';
import { guidelineApplicationContext } from './applicationGeometry';
import { refreshGuidelineMatrixControls } from './quantitativeMatrixBinding';
import { captureGuidelineDraftExtension, restoreGuidelineDraftExtension } from './applicationDraft';
import { captureColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import {
  refreshGuidelineBrief,
  mapRefreshRuleOperands,
  reviewReceiptPairs,
  type RefreshReceiptPair,
} from './briefRefresh';
import {
  createGuidelineAuthoringDraft,
  readGuidelineAuthoringDraft,
  EMPTY_GUIDELINE_AUTHORING,
  type GuidelineAuthoringInputs,
  type GuidelineAuthoringDraft,
} from './authoringDraft';
import type { GuidelineDesignBrief } from './designBrief';
import { createGuidelineGradientCatalog } from './gradientCatalog';
import { scopedRefreshRules, type GuidelineRefreshRuleScope } from './refreshRuleScope';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import {
  generateGuidelineSupportingDirections,
  restoreGuidelineSupportingSelection,
  storedGuidelineSupportingSelection,
  type GuidelineSupportingSelection,
} from './supportingDirections';
import type {
  ColorSystemModelV1,
  ColorSystemSelectorV1,
  ColorSystemScopedRuleV1,
} from '../../../../src/lib/colorSystemModelV1';
import { guidelineHash } from './review';
import { createGuidelineGradient, type GuidelineSelection } from './project';
import { createGuidelineModeGradient, type GuidelineModeGradientSelection } from './modeGradient';
import { isGuidelineNewScale, previewGuidelineExtension } from './extension';
import { assessGuidelineApplication, type GuidelineApplicationResult } from './application';
import {
  EMPTY_GUIDELINE_OUTPUTS,
  storedGuidelineOutputs,
  type GuidelineAvailableExtension,
  type GuidelineSelectedOutputs,
} from './selectedOutputs';
import {
  guidelineRefreshContext,
  sameRefreshValue as equal,
  sourceCaptureHash,
  type GuidelineRefreshLineage,
} from './refreshLineage';
import type { OpenedSourceProject } from './sourceProjectCodec';
import {
  authoredGradientControls,
  createGuidelineAuthoredGradient,
  createGuidelineContinuousGradient,
  guidelineGradientCatalogPermission,
  AUTHORED_GRADIENT_VERSION,
  CONTINUOUS_GRADIENT_VERSION,
} from './authoredGradient';

export interface GuidelineRefreshReplay {
  kind: OpenedSourceProject['kind'];
  captureHash: string;
  reviewHash: string;
  lineageHash: string;
  selection:
    GuidelineSelection | GuidelineModeGradientSelection | GuidelineEditableGradientSelection | null;
  outputs: GuidelineSelectedOutputs;
  items: {
    kind:
      | 'gradient'
      | 'extension'
      | 'application'
      | 'supporting'
      | 'scale-draft'
      | 'supporting-draft'
      | 'gradient-draft'
      | 'native-gradient-draft'
      | 'application-draft'
      | 'brief';
    status: 'restorable' | 'needs-review' | 'stale' | 'absent';
    reason: string;
    previousChoices?: { label: string; value: string }[];
  }[];
  replayHash: string;
}
export interface ReviewedDesignRefreshContext {
  previousModel: ColorSystemModelV1 | null;
  previousNativeSources?: readonly GuidelineNativeGradientSource[];
  nativeSources?: readonly GuidelineNativeGradientSource[];
  previousReviewHash?: string | null;
  receiptPairs?: readonly RefreshReceiptPair[];
  previousSelection: GuidelineSelection | GuidelineModeGradientSelection | null;
  legacyGradientKind: 'pdf' | 'native';
  outputs: GuidelineSelectedOutputs;
  gradient: GuidelineEditableGradientSelection | null;
  colorPairs: ReadonlyMap<string, string>;
  modePairs: ReadonlyMap<string, string>;
  evidencePairs: ReadonlyMap<string, string>;
  scaleIds: ReadonlySet<string>;
  familyPairs?: ReadonlyMap<string, string>;
  metadataChanges: readonly string[];
}
export type ReviewedDesignRefreshResult = Pick<
  GuidelineRefreshReplay,
  'selection' | 'outputs' | 'items'
>;
/** Applying a partial restoration must preserve unrelated work already made in the new review. */
export function mergeRestoredGuidelineOutputs(
  review: { model: ColorSystemModelV1; reviewHash: string },
  current: GuidelineSelectedOutputs,
  restored: GuidelineSelectedOutputs
): GuidelineSelectedOutputs {
  const incoming = restored.authoring;
  return {
    ...current,
    extension: restored.extension ?? current.extension,
    application: restored.application ?? current.application,
    supporting: restored.supporting ?? current.supporting,
    designBrief: restored.designBrief ?? current.designBrief,
    authoring: incoming
      ? createGuidelineAuthoringDraft(review, {
          activeTask: incoming.activeTask,
          extension: incoming.extension ?? current.authoring?.extension ?? null,
          supporting: incoming.supporting ?? current.authoring?.supporting ?? null,
          gradient: incoming.gradient ?? current.authoring?.gradient ?? null,
          ...((incoming.nativeGradient ?? current.authoring?.nativeGradient) !== undefined
            ? { nativeGradient: incoming.nativeGradient ?? current.authoring?.nativeGradient }
            : {}),
          application: incoming.application ?? current.authoring?.application ?? null,
          // Current notes include explicit removals. Older notes remain in the retained source history.
          ...((current.authoring?.supportingFeedback ?? incoming.supportingFeedback) !== undefined
            ? {
                supportingFeedback:
                  current.authoring?.supportingFeedback ?? incoming.supportingFeedback,
              }
            : {}),
        })
      : current.authoring,
  };
}
const sorted = (values: readonly string[]) => [...values].sort();
function fail(message: string): never {
  throw new Error(message);
}

/** Compare only the actual output's dependency scope, retaining immutable source correspondence. */
function dependencies(
  context: ReviewedDesignRefreshContext,
  next: ColorSystemModelV1,
  oldMode: string,
  contextId: string
) {
  const old = context.previousModel;
  if (!old) fail('The previous project had no applied source review.');
  if (context.metadataChanges.length)
    fail(`Source context changed: ${context.metadataChanges.join(', ')}.`);
  const mode = context.modePairs.get(oldMode);
  if (!mode || !next.contexts.find(c => c.id === contextId)?.modeIds.includes(mode))
    fail('The source mode or use context changed.');
  const beforeColors = new Map(old.colors.map(c => [c.id, c])),
    afterColors = new Map(next.colors.map(c => [c.id, c]));
  const checkedColors = new Map<string, string>(),
    checkedScales = new Map<string, string>(),
    checkedFamilies = new Map<string, string>();
  const evidence = new Map(context.evidencePairs);
  for (const [left, right] of context.colorPairs) {
    const a = beforeColors.get(left),
      b = afterColors.get(right);
    if (a && b && a.evidenceRefs.length === b.evidenceRefs.length)
      a.evidenceRefs.forEach((ref, i) => evidence.set(ref, b.evidenceRefs[i]));
  }
  const color = (id: string): string => {
    const cached = checkedColors.get(id);
    if (cached) return cached;
    const mapped = context.colorPairs.get(id),
      a = beforeColors.get(id),
      b = mapped ? afterColors.get(mapped) : null;
    if (!a || !b || !mapped)
      fail('A used source color changed, was removed or has ambiguous correspondence.');
    const families = (model: ColorSystemModelV1, id: string) =>
      sorted(model.families.filter(f => f.colorIds.includes(id)).map(f => f.label));
    if (
      !a.valuesByMode[oldMode] ||
      !b.valuesByMode[mode] ||
      !equal(a.valuesByMode[oldMode], b.valuesByMode[mode]) ||
      a.label !== b.label ||
      !equal(families(old, id), families(next, mapped))
    )
      fail(`The reviewed value, name or family of ${a.label} changed.`);
    checkedColors.set(id, mapped);
    return mapped;
  };
  const scale = (id: string): string => {
    const cached = checkedScales.get(id);
    if (cached) return cached;
    if (!context.scaleIds.has(id)) fail('A used source scale or its evidence changed.');
    const a = old.scales.find(s => s.id === id),
      b = next.scales.find(s => s.id === id),
      am = a?.modes.find(m => m.modeId === oldMode),
      bm = b?.modes.find(m => m.modeId === mode);
    if (!a || !b || !am || !bm) fail('A used source scale or mode was removed.');
    const mappedAnchors = am.anchors.map(anchor => ({ ...anchor, colorId: color(anchor.colorId) }));
    if (
      a.label !== b.label ||
      !equal(a.slots, b.slots) ||
      old.families.find(f => f.id === a.familyId)?.label !==
        next.families.find(f => f.id === b.familyId)?.label ||
      !equal(mappedAnchors, bm.anchors)
    )
      fail(`The reviewed structure of ${a.label} changed.`);
    checkedScales.set(id, id);
    return id;
  };
  const family = (id: string): string => {
    const cached = checkedFamilies.get(id);
    if (cached) return cached;
    const a = old.families.find(f => f.id === id),
      matches = next.families.filter(f =>
        context.familyPairs ? f.id === context.familyPairs.get(id) : f.label === a?.label
      );
    if (!a || matches.length !== 1) fail('A rule refers to a changed source family.');
    const b = matches[0];
    if (a.label !== b.label || !equal(sorted(a.colorIds.map(color)), sorted(b.colorIds)))
      fail(`Membership of ${a.label} changed.`);
    checkedFamilies.set(id, b.id);
    return b.id;
  };
  const selector = (s: ColorSystemSelectorV1) => ({
    ...s,
    id: s.kind === 'color' ? color(s.id) : s.kind === 'scale' ? scale(s.id) : family(s.id),
  });
  const operands = (value: unknown) => mapRefreshRuleOperands(value, selector);
  const projection = (rule: ColorSystemScopedRuleV1, before: boolean) => ({
    kind: rule.kind,
    label: rule.label,
    force: rule.force,
    origin: rule.origin,
    evidenceRefs: before
      ? rule.evidenceRefs.map(
          ref => evidence.get(ref) ?? fail('A governing rule has changed source evidence.')
        )
      : rule.evidenceRefs,
    operands: before ? operands(rule.operands) : rule.operands,
  });
  const checkRules = (before?: GuidelineRefreshRuleScope, after?: GuidelineRefreshRuleScope) => {
    const oldRules = scopedRefreshRules(old, contextId, oldMode, before).map(r =>
      guidelineHash(projection(r, true))
    );
    const newRules = scopedRefreshRules(next, contextId, mode, after).map(r =>
      guidelineHash(projection(r, false))
    );
    if (!equal(sorted(oldRules), sorted(newRules)))
      fail('The source rules governing this design changed.');
  };
  return { mode, color, scale, family, checkRules, evidencePairs: evidence };
}

type ExtensionReplay = (
  pair: GuidelineAvailableExtension,
  scope?: 'scale' | 'application'
) => Promise<{
  value: GuidelineAvailableExtension;
  dep: ReturnType<typeof dependencies>;
  generated: Map<string, string>;
}>;
type GradientReplay = (
  old: GuidelineEditableGradientSelection
) => GuidelineEditableGradientSelection;

function refreshCompositionGradient(
  old: GuidelineCompositionGradient,
  replay: GradientReplay
): GuidelineCompositionGradient {
  const selection = replay(old.selection);
  if (
    !isGuidelineNativeGradient(selection) &&
    selection.schemaVersion !== CONTINUOUS_GRADIENT_VERSION
  )
    fail('A mixed composition requires its retained continuous gradient.');
  return { ...old, selection };
}
function refreshedNativeSource(
  context: ReviewedDesignRefreshContext,
  binding: GuidelineNativeGradientSourceBinding
) {
  if (!context.previousModel || !context.previousReviewHash)
    fail('The previous native review is missing.');
  const previous = resolveGuidelineNativeGradientSource(
    binding,
    { model: context.previousModel, reviewHash: context.previousReviewHash },
    context.previousNativeSources ?? []
  );
  const matches = (context.nativeSources ?? []).filter(
    item =>
      item.sourceEntryId === previous.sourceEntryId &&
      item.sourceEntryModeId === previous.sourceEntryModeId &&
      item.capture.request.fileKey === previous.capture.request.fileKey &&
      item.evidence.nodeId === previous.evidence.nodeId &&
      item.evidence.locator === previous.evidence.locator &&
      equal(item.evidence.paint, previous.evidence.paint) &&
      equal(item.evidence.context, previous.evidence.context) &&
      equal(item.evidence.limitations, previous.evidence.limitations)
  );
  if (matches.length !== 1) fail('The native paint evidence or selected member mode changed.');
  return matches[0];
}
async function replayDrafts(
  context: ReviewedDesignRefreshContext,
  review: { model: ColorSystemModelV1; reviewHash: string },
  replayExtension: ExtensionReplay,
  replayGradient: GradientReplay,
  signal?: AbortSignal
) {
  const items: GuidelineRefreshReplay['items'] = [];
  if (!context.outputs.authoring && !context.outputs.designBrief) return { items };
  if (!context.previousModel || !context.previousReviewHash)
    fail('Previous draft review identity is missing.');
  const checkpoint = async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    signal?.throwIfAborted();
  };
  await checkpoint();
  const previous = {
    model: captureColorSystemModelV1(context.previousModel),
    reviewHash: context.previousReviewHash,
  };
  await checkpoint();
  review = { ...review, model: captureColorSystemModelV1(review.model) };
  await checkpoint();
  const refresh = (brief: GuidelineDesignBrief, retainedComposition = false) => {
    const dep = dependencies(
      context,
      review.model,
      brief.input.modeId,
      brief.input.sourceContextId
    );
    const fresh = refreshGuidelineBrief(
      previous,
      review,
      brief,
      {
        ...dep,
        ...(retainedComposition && brief.input.applicationCompositionHash
          ? { applicationCompositionHash: brief.input.applicationCompositionHash }
          : {}),
        ...(retainedComposition && brief.input.capacityCompositionHash
          ? { capacityCompositionHash: brief.input.capacityCompositionHash }
          : {}),
        ...(retainedComposition && brief.input.reportCompositionHash
          ? { reportCompositionHash: brief.input.reportCompositionHash }
          : {}),
        ...(retainedComposition && brief.input.quantitativeCompositionHash
          ? { quantitativeCompositionHash: brief.input.quantitativeCompositionHash }
          : {}),
      },
      context.receiptPairs
    );
    return { dep, fresh };
  };
  const colorName = (id: string) =>
    previous.model.colors.find(c => c.id === id)?.label ?? (id || 'Not chosen');
  let designBrief: GuidelineDesignBrief | undefined;
  if (context.outputs.designBrief) {
    try {
      designBrief = refresh(context.outputs.designBrief).fresh;
      items.push({
        kind: 'brief',
        status: 'restorable',
        reason: 'Source meaning is unchanged. The brief is rebound to the current review.',
      });
    } catch (error) {
      items.push({
        kind: 'brief',
        status: 'needs-review',
        reason:
          error instanceof Error
            ? error.message
            : 'Review the previous brief against the new source.',
      });
    }
  }
  let authoring: GuidelineAuthoringDraft | undefined;
  if (context.outputs.authoring) {
    const old = readGuidelineAuthoringDraft(context.outputs.authoring, previous);
    const inputs: GuidelineAuthoringInputs = {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: old.activeTask,
      ...(old.supportingFeedback ? { supportingFeedback: old.supportingFeedback } : {}),
    };
    for (const task of ['extension', 'supporting', 'gradient', 'application'] as const) {
      await checkpoint();
      const controls = old[task];
      if (!controls) continue;
      const kind =
        task === 'extension'
          ? 'scale-draft'
          : task === 'supporting'
            ? 'supporting-draft'
            : task === 'gradient'
              ? 'gradient-draft'
              : 'application-draft';
      const previousChoices =
        task === 'extension'
          ? [
              { label: 'Scale name', value: old.extension!.scaleLabel || 'Not named' },
              { label: 'Task', value: old.extension!.operation },
              { label: 'Use', value: old.extension!.context },
              { label: 'Anchor', value: colorName(old.extension!.anchorColorId) },
              {
                label: 'Unfinished shades',
                value: old
                  .extension!.additions.map(
                    a => `${a.slotId || '(unnamed)'}: ${a.position || '(no position)'}`
                  )
                  .join('; '),
              },
            ]
          : task === 'supporting'
            ? [
                { label: 'Use', value: old.supporting!.layout.kind },
                { label: 'Library', value: old.supporting!.provider },
                { label: 'Relationship', value: old.supporting!.relationship },
                {
                  label: 'References',
                  value: old.supporting!.anchorColorIds.map(colorName).join(', '),
                },
                { label: 'Background', value: colorName(old.supporting!.sourcePaints.ground) },
              ]
            : task === 'application'
              ? [
                  { label: 'Use', value: old.application!.kind },
                  ...(old.application!.panel
                    ? [
                        {
                          label: 'Panel size',
                          value: `${old.application!.panel.width} × ${old.application!.panel.height}`,
                        },
                        { label: 'Heading', value: old.application!.panel.heading },
                        { label: 'Body', value: old.application!.panel.body },
                        ...(old.application!.panel.sourceRoles
                          ? [
                              {
                                label: 'Source roles',
                                value: Object.entries(old.application!.panel.sourceRoles)
                                  .map(([region, role]) => `${region}: ${role}`)
                                  .join('; '),
                              },
                            ]
                          : []),
                      ]
                    : [{ label: 'Composition', value: old.application!.layoutName }]),
                  {
                    label: 'Paint choices',
                    value: Object.entries(old.application!.choices)
                      .map(([role, id]) => `${role}: ${colorName(id)}`)
                      .join('; '),
                  },
                ]
              : [
                  { label: 'Use', value: old.gradient!.controls.scope },
                  { label: 'Angle', value: `${old.gradient!.controls.angle}°` },
                  {
                    label: 'Stops',
                    value: old
                      .gradient!.controls.stops.map(
                        s =>
                          `${colorName(s.colorId)} at ${s.position * 100}%${s.locked ? ' (locked)' : ''}`
                      )
                      .join('; '),
                  },
                ];
      const cleared: string[] = [];
      try {
        const oldBrief = old.briefs[task];
        if (!oldBrief)
          fail(
            'These unfinished choices did not yet bind a source mode and references. Review the previous choices before restoring them.'
          );
        const { dep } = refresh(oldBrief, task === 'application');
        if (task === 'extension') {
          const draft = old.extension!;
          // Dormant source selectors stay inspectable in history; do not silently attach them to a new member.
          const dormant = (id: string, map: (id: string) => string, label: string) => {
            if (!id) return '';
            try {
              return map(id);
            } catch {
              cleared.push(label);
              return '';
            }
          };
          inputs.extension = {
            ...draft,
            modeId: dep.mode,
            anchorColorId:
              draft.operation === 'new-scale'
                ? dep.color(draft.anchorColorId)
                : dormant(draft.anchorColorId, dep.color, 'inactive anchor'),
            familyId: !draft.familyId
              ? ''
              : draft.operation === 'new-scale'
                ? dep.family(draft.familyId)
                : dormant(draft.familyId, dep.family, 'inactive family'),
            scaleId:
              draft.operation === 'interior'
                ? dep.scale(draft.scaleId)
                : dormant(draft.scaleId, dep.scale, 'inactive scale'),
          };
        } else if (task === 'supporting') {
          const draft = old.supporting!;
          inputs.supporting = {
            ...draft,
            layout: { ...draft.layout, modeId: dep.mode },
            anchorColorIds: draft.anchorColorIds.map(dep.color),
            sourcePaints: Object.fromEntries(
              Object.entries(draft.sourcePaints).map(([role, id]) => [
                role,
                id ? dep.color(id) : '',
              ])
            ),
          };
        } else if (task === 'gradient') {
          const draft = old.gradient!;
          const catalog = draft.catalog
            ? createGuidelineGradientCatalog(review, {
                ...draft.catalog,
                modeId: dep.mode,
                sourceAnchorIds: draft.catalog.sourceAnchorIds.map(dep.color),
              })
            : null;
          if (
            draft.catalog &&
            (!catalog ||
              !equal(draft.catalog.memberIds, catalog.memberIds) ||
              draft.catalog.catalogHash !== catalog.catalogHash ||
              draft.catalog.referenceHash !== catalog.referenceHash)
          )
            fail('The pinned library or its members changed.');
          inputs.gradient = {
            ...('search' in draft
              ? {
                  search: draft.search
                    ? {
                        ...draft.search,
                        sourceAnchorIds: draft.search.sourceAnchorIds.map(dep.color),
                      }
                    : null,
                }
              : {}),
            controls: {
              ...draft.controls,
              modeId: dep.mode,
              stops: draft.controls.stops.map(stop => ({
                ...stop,
                colorId: stop.colorId.startsWith('@catalog/')
                  ? stop.colorId
                  : dep.color(stop.colorId),
              })),
            },
            catalog,
            policy:
              draft.policy?.use.kind === 'text'
                ? {
                    ...draft.policy,
                    use: {
                      ...draft.policy.use,
                      foregroundColorId: dep.color(draft.policy.use.foregroundColorId),
                    },
                  }
                : draft.policy,
          };
        } else {
          const draft = old.application!;
          let embedded: Awaited<ReturnType<ExtensionReplay>> | null = null;
          if (draft.extension) {
            try {
              const pair = await restoreGuidelineDraftExtension(previous, draft.extension, signal);
              embedded = await replayExtension(pair, 'application');
            } catch (error) {
              signal?.throwIfAborted();
              if (draft.useExtension) throw error;
              cleared.push('inactive proposed scale');
            }
          } else if (draft.useExtension)
            fail('Choose the proposed scale for these unfinished application controls.');
          const customIds = new Set(
            guidelineContextPaintChoices(draft.contextPaints).map(paint => paint.id)
          );
          const color = (id: string) =>
            id ? (customIds.has(id) ? id : (embedded?.generated.get(id) ?? dep.color(id))) : '';
          const {
            contextReview: _contextReview,
            contextRuleChoices: _contextChoices,
            ...unreviewedDraft
          } = draft;
          inputs.application = {
            ...unreviewedDraft,
            modeId: dep.mode,
            ...(draft.chart?.report
              ? {
                  chart: {
                    ...draft.chart,
                    report: {
                      ...draft.chart.report,
                      input: { ...draft.chart.report.input, modeId: dep.mode },
                    },
                  },
                }
              : {}),
            ...(draft.chart?.capacity
              ? {
                  chart: {
                    ...draft.chart,
                    capacity: {
                      ...draft.chart.capacity,
                      input: { ...draft.chart.capacity.input, modeId: dep.mode },
                    },
                  },
                }
              : {}),
            ...(draft.chart?.matrix
              ? {
                  chart: {
                    ...draft.chart,
                    matrix: refreshGuidelineMatrixControls(
                      draft.chart.matrix,
                      dep.mode,
                      draft.useExtension && embedded
                        ? embedded.value.preview.request.scaleId
                        : dep.scale(draft.chart.matrix.scaleId),
                      color
                    ),
                  },
                }
              : {}),
            ...(draft.decorativeGradient
              ? {
                  decorativeGradient: refreshCompositionGradient(
                    draft.decorativeGradient,
                    replayGradient
                  ),
                }
              : {}),
            ...(draft.contextPaints
              ? {
                  contextPaints: refreshGuidelineContextPaints(
                    draft.contextPaints,
                    draft.modeId,
                    dep.mode
                  ),
                }
              : {}),
            choices: Object.fromEntries(
              Object.entries(draft.choices).map(([role, id]) => [role, color(id)])
            ),
            anchorColorId: draft.anchorColorId ? dep.color(draft.anchorColorId) : '',
            extension: captureGuidelineDraftExtension(embedded?.value ?? null),
            ruleChoices: {},
          };
        }
        items.push({
          kind,
          status: 'restorable',
          reason:
            'Unfinished controls keep their source meaning. No result or previous approval is created.' +
            (cleared.length
              ? ` Cleared ${cleared.join(', ')} because the source changed; the previous choices remain in history.`
              : ''),
          previousChoices,
        });
      } catch (error) {
        items.push({
          kind,
          status: 'needs-review',
          reason:
            error instanceof Error
              ? error.message
              : 'Review these choices against the updated source.',
          previousChoices,
        });
      }
    }
    if (old.nativeGradient) {
      await checkpoint();
      const draft = old.nativeGradient;
      const previousChoices = [
        { label: 'Method', value: 'Captured native gradient' },
        { label: 'Use', value: draft.scope },
        { label: 'Rotation', value: draft.rotationDegrees || '(unfinished)' },
        {
          label: 'Stop positions',
          value: draft.positions.map(value => value || '(unfinished)').join(', '),
        },
      ];
      try {
        if (!draft.source) fail('Choose a captured gradient before restoring these controls.');
        const source = refreshedNativeSource(context, draft.source);
        const dep = dependencies(context, review.model, draft.modeId, `gradient:${draft.scope}`);
        dep.checkRules({ kind: 'gradient' }, { kind: 'gradient' });
        inputs.nativeGradient = {
          ...draft,
          source: bindGuidelineNativeGradientSource(source, review),
          modeId: dep.mode,
        };
        items.push({
          kind: 'native-gradient-draft',
          status: 'restorable',
          reason:
            'Captured paint and source rules are unchanged. Unfinished native controls are retained.',
          previousChoices,
        });
      } catch (error) {
        items.push({
          kind: 'native-gradient-draft',
          status: 'needs-review',
          reason:
            error instanceof Error
              ? error.message
              : 'Review these native controls against the updated source.',
          previousChoices,
        });
      }
    }
    // An empty workspace still retains its task choice; failed drafts remain in immutable history.
    if (
      (!old.extension &&
        !old.supporting &&
        !old.gradient &&
        !old.application &&
        !old.nativeGradient) ||
      inputs.extension ||
      inputs.supporting ||
      inputs.gradient ||
      inputs.nativeGradient ||
      inputs.application ||
      inputs.supportingFeedback?.length
    )
      authoring = createGuidelineAuthoringDraft(review, inputs);
  }
  if (
    (context.outputs.designBrief?.input.applicationCompositionHash ||
      context.outputs.designBrief?.input.quantitativeCompositionHash ||
      context.outputs.designBrief?.input.capacityCompositionHash ||
      context.outputs.designBrief?.input.reportCompositionHash) &&
    equal(context.outputs.designBrief, context.outputs.authoring?.briefs.application ?? null) &&
    authoring?.briefs.application
  ) {
    designBrief = authoring.briefs.application;
    const index = items.findIndex(item => item.kind === 'brief');
    const restored = {
      kind: 'brief' as const,
      status: 'restorable' as const,
      reason:
        'The retained composition controls and paint references rebound the brief to the current source review.',
    };
    if (index >= 0) items[index] = restored;
    else items.push(restored);
  }
  await checkpoint();
  return { items, authoring, designBrief };
}

/** Recreate selected intent under a freshly reviewed model; never rewrite old approval hashes. */
export async function replayReviewedDesigns(
  context: ReviewedDesignRefreshContext,
  review: { model: ColorSystemModelV1; reviewHash: string },
  signal?: AbortSignal
): Promise<ReviewedDesignRefreshResult> {
  const items: GuidelineRefreshReplay['items'] = [];
  let selection: GuidelineRefreshReplay['selection'] = null;
  let extension: GuidelineAvailableExtension | null = null,
    application: GuidelineApplicationResult | null = null;
  let supporting: GuidelineSupportingSelection | null = null;
  const runtime = {
    isCancelled: () => signal?.aborted ?? false,
    yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
  };
  const attempt = async (
    kind: GuidelineRefreshReplay['items'][number]['kind'],
    present: boolean,
    run: () => Promise<'restorable' | 'needs-review'>
  ) => {
    signal?.throwIfAborted();
    if (!present) {
      items.push({ kind, status: 'absent', reason: 'No previous selection.' });
      return;
    }
    try {
      const status = await run();
      signal?.throwIfAborted();
      items.push({
        kind,
        status,
        reason:
          status === 'restorable'
            ? 'Unchanged source dependencies and identical selected paint.'
            : 'The inputs and paint remain, but extension rules require review against the new proposal.',
      });
    } catch (reason) {
      signal?.throwIfAborted();
      items.push({
        kind,
        status: 'stale',
        reason:
          reason instanceof Error ? reason.message : 'The previous design could not be verified.',
      });
    }
  };
  const replayExtension = async (
    pair: GuidelineAvailableExtension,
    ruleScope: 'scale' | 'application' = 'scale'
  ) => {
    const request = pair.preview.request,
      dep = dependencies(context, review.model, request.modeId, request.context);
    const preview = await previewGuidelineExtension(
      review,
      isGuidelineNewScale(request)
        ? {
            ...request,
            modeId: dep.mode,
            familyId: request.familyId === null ? null : dep.family(request.familyId),
            anchorColorId: dep.color(request.anchorColorId),
          }
        : { ...request, modeId: dep.mode, scaleId: dep.scale(request.scaleId) },
      runtime
    );
    signal?.throwIfAborted();
    if (
      preview.status !== pair.preview.status ||
      preview.status !== 'proposed' ||
      !preview.workingModel ||
      !pair.preview.workingModel
    )
      fail('The previous extension no longer has the same available outcome.');
    const generated = new Map<string, string>();
    for (const oldBinding of pair.preview.generatedBindings) {
      const found = preview.generatedBindings.filter(
        b =>
          b.scaleId === oldBinding.scaleId &&
          b.slotId === oldBinding.slotId &&
          b.modes.some(m => m.modeId === dep.mode)
      );
      if (found.length !== 1) fail('A generated scale position changed.');
      const before = pair.preview.workingModel.colors.find(c => c.id === oldBinding.colorId)
          ?.valuesByMode[request.modeId],
        after = preview.workingModel.colors.find(c => c.id === found[0].colorId)?.valuesByMode[
          dep.mode
        ];
      if (!before || !after || !equal(before, after))
        fail('Rechecking the extension would substitute a different generated paint.');
      generated.set(oldBinding.colorId, found[0].colorId);
    }
    if (generated.size !== preview.generatedBindings.length)
      fail('The generated color inventory changed.');
    // Embedded extensions are checked against the complete application below.
    if (ruleScope === 'scale')
      dep.checkRules(
        { kind: 'scale', model: pair.preview.workingModel, scaleId: request.scaleId },
        { kind: 'scale', model: preview.workingModel, scaleId: request.scaleId }
      );
    return { value: { preview, decision: null } as GuidelineAvailableExtension, dep, generated };
  };
  const replayGradient: GradientReplay = old => {
    const dep = dependencies(context, review.model, old.modeId, `gradient:${old.scope}`);
    if (isGuidelineNativeGradient(old)) {
      if (!context.previousModel || !context.previousReviewHash)
        fail('The previous native review is missing.');
      const previous = readGuidelineNativeGradient(
        { model: context.previousModel, reviewHash: context.previousReviewHash },
        old,
        context.previousNativeSources ?? []
      )!;
      const source = refreshedNativeSource(context, previous.source);
      const fresh = createGuidelineNativeGradient(review, source, {
        ...nativeGradientControls(previous),
        modeId: dep.mode,
      });
      if (!equal(previous.design.paint, fresh.design.paint))
        fail('The native paint or edited geometry changed.');
      dep.checkRules({ kind: 'gradient' }, { kind: 'gradient' });
      return fresh;
    }
    const controls = authoredGradientControls(old);
    const policy =
      old.schemaVersion !== AUTHORED_GRADIENT_VERSION
        ? {
            ...old.policy,
            use:
              old.policy.use.kind === 'text'
                ? {
                    ...old.policy.use,
                    foregroundColorId: dep.color(old.policy.use.foregroundColorId),
                  }
                : old.policy.use,
          }
        : undefined;
    const nextControls = {
      ...controls,
      modeId: dep.mode,
      stops: controls.stops.map((stop, index) => ({
        ...stop,
        colorId:
          old.design.stops[index].sourceColorId === null ? stop.colorId : dep.color(stop.colorId),
      })),
    };
    const oldCatalog = guidelineGradientCatalogPermission(old);
    const catalog = oldCatalog
      ? createGuidelineGradientCatalog(review, {
          scope: old.scope,
          modeId: dep.mode,
          sourceAnchorIds: oldCatalog.sourceAnchorIds.map(id => dep.color(id)),
          provider: oldCatalog.provider,
          scheme: oldCatalog.scheme,
          candidateId: oldCatalog.candidateId,
          memberIds: oldCatalog.memberIds,
        })
      : undefined;
    // Rebind the exact selected V2 paint. Verification belongs to the UI worker;
    // reopening source history never promotes a saved success receipt.
    const fresh =
      old.schemaVersion === CONTINUOUS_GRADIENT_VERSION
        ? createGuidelineContinuousGradient(
            review,
            nextControls,
            policy,
            catalog,
            old.design.compiledPaint.stops
          )
        : createGuidelineAuthoredGradient(review, nextControls, policy, catalog);
    const freshCatalog = guidelineGradientCatalogPermission(fresh);
    if (
      oldCatalog &&
      (!freshCatalog ||
        !equal(oldCatalog.memberIds, freshCatalog.memberIds) ||
        oldCatalog.catalogHash !== freshCatalog.catalogHash ||
        oldCatalog.referenceHash !== freshCatalog.referenceHash)
    )
      fail('The retained gradient catalog permission or pinned library changed.');
    if (!equal(old.design.compiledPaint, fresh.design.compiledPaint))
      fail('Rechecking the gradient would substitute a different compiled paint.');
    dep.checkRules({ kind: 'gradient' }, { kind: 'gradient' });
    return fresh;
  };
  await attempt('gradient', !!context.previousSelection || !!context.gradient, async () => {
    if (context.gradient) {
      selection = replayGradient(context.gradient);
      return 'restorable';
    }
    const old = context.previousSelection!;
    const oldMode = 'modeId' in old ? old.modeId : 'Source',
      dep = dependencies(context, review.model, oldMode, `gradient:${old.scope}`);
    if (old.design.stops.length !== 2)
      fail('This saved gradient needs an unsupported restoration adapter.');
    const anchors = old.design.stops.map(stop => dep.color(stop.sourceColorId ?? ''));
    const fresh =
      context.legacyGradientKind === 'pdf'
        ? createGuidelineGradient(
            review,
            old.scope,
            anchors[0],
            anchors[1],
            old.design.angleDegrees
          )
        : createGuidelineModeGradient(
            review,
            old.scope,
            dep.mode,
            anchors[0],
            anchors[1],
            old.design.angleDegrees
          );
    if (!equal(old.design.compiledPaint, fresh.design.compiledPaint))
      fail('Rechecking the gradient would substitute a different compiled paint.');
    dep.checkRules({ kind: 'gradient' }, { kind: 'gradient' });
    selection = fresh;
    return 'restorable';
  });
  await attempt('extension', !!context.outputs.extension, async () => {
    const fresh = await replayExtension(context.outputs.extension!);
    extension = fresh.value;
    return fresh.value.preview.pendingRuleIds.length ? 'needs-review' : 'restorable';
  });
  await attempt('application', !!context.outputs.application, async () => {
    const old = context.outputs.application!,
      request = old.request,
      dep = dependencies(
        context,
        review.model,
        request.layout.modeId,
        guidelineApplicationContext(request.layout)
      );
    const embedded = request.extension
      ? await replayExtension(request.extension, 'application')
      : null;
    const customIds = new Set(
      guidelineContextPaintChoices(request.contextPaints).map(paint => paint.id)
    );
    const color = (id: string) =>
      customIds.has(id) ? id : (embedded?.generated.get(id) ?? dep.color(id));
    const assignments = request.assignments.map(a => ({ ...a, colorId: color(a.colorId) }));
    const restoredExtension =
      request.extension && embedded
        ? {
            ...embedded.value,
            anchorColorId: dep.color(request.extension.anchorColorId),
            purpose: request.extension.purpose,
          }
        : null;
    const fresh = await assessGuidelineApplication(
      review,
      {
        layout: {
          ...request.layout,
          modeId: dep.mode,
          ...(request.layout.kind === 'chart' && request.layout.report
            ? {
                report: {
                  ...request.layout.report,
                  input: { ...request.layout.report.input, modeId: dep.mode },
                },
              }
            : {}),
          ...(request.layout.kind === 'chart' && request.layout.capacity
            ? {
                capacity: {
                  ...request.layout.capacity,
                  input: { ...request.layout.capacity.input, modeId: dep.mode },
                },
              }
            : {}),
          ...(request.layout.kind === 'chart' && request.layout.matrix
            ? {
                matrix: refreshGuidelineMatrixControls(
                  request.layout.matrix,
                  dep.mode,
                  embedded?.value.preview.request.scaleId ??
                    dep.scale(request.layout.matrix.scaleId),
                  color
                ),
              }
            : {}),
        },
        ...(request.decorativeGradient
          ? {
              decorativeGradient: refreshCompositionGradient(
                request.decorativeGradient,
                replayGradient
              ),
            }
          : {}),
        ...(request.contextPaints
          ? {
              contextPaints: refreshGuidelineContextPaints(
                request.contextPaints,
                request.layout.modeId,
                dep.mode
              ),
            }
          : {}),
        assignments,
        extension: restoredExtension,
      },
      signal,
      context.nativeSources
    );
    signal?.throwIfAborted();
    const needsReview = !!fresh.execution?.diagnostics.some(
      d => d.code === 'SOURCE_RULE_REVIEW_REQUIRED'
    );
    dep.checkRules(
      old.model
        ? { kind: 'applications', model: old.model, applications: old.applications }
        : undefined,
      fresh.model
        ? { kind: 'applications', model: fresh.model, applications: fresh.applications }
        : undefined
    );
    const paints = (result: GuidelineApplicationResult) =>
      result.applications.map(app => ({
        id: app.id,
        context: app.contextId,
        ...(app.gradients
          ? {
              gradients: app.gradients.map(({ paint, ...gradient }) => ({
                ...gradient,
                paint: {
                  ...(isNativeLinearPaintV1(paint)
                    ? { nativePaint: paint.paint }
                    : {
                        angleDegrees: paint.angleDegrees,
                        route: paint.route,
                        compiledPaint: paint.compiledPaint,
                      }),
                  stops: paint.stops.map(({ sourceColorId: _source, ...stop }) => stop),
                },
              })),
            }
          : {}),
        pairs: app.pairs,
        uses: app.uses.map(({ colorId, ...use }) => ({
          ...use,
          value: result.model?.colors.find(c => c.id === colorId)?.valuesByMode[app.modeId] ?? null,
        })),
      }));
    if (
      (needsReview
        ? fresh.status !== 'blocked' ||
          !!fresh.recipe ||
          !fresh.execution?.diagnostics.some(d => d.code === 'SOURCE_RULE_REVIEW_REQUIRED')
        : fresh.status !== old.status || !!fresh.recipe !== !!old.recipe) ||
      !equal(paints(old), paints(fresh)) ||
      !equal(old.layout.boards, fresh.layout.boards)
    )
      fail('The application paint, geometry or assessment outcome changed.');
    application = fresh;
    return needsReview ? 'needs-review' : 'restorable';
  });
  if (context.outputs.supporting)
    await attempt('supporting', true, async () => {
      const previous = context.outputs.supporting!,
        request = previous.result.request;
      const dep = dependencies(
        context,
        review.model,
        request.layout.modeId,
        guidelineApplicationContext(request.layout)
      );
      const fresh = await generateGuidelineSupportingDirections(
        review,
        {
          ...request,
          layout: { ...request.layout, modeId: dep.mode },
          anchorColorIds: request.anchorColorIds.map(dep.color),
          sourcePaints: Object.fromEntries(
            Object.entries(request.sourcePaints).map(([role, id]) => [
              role,
              id ? dep.color(id) : '',
            ])
          ),
        },
        signal
      );
      const restored = restoreGuidelineSupportingSelection(previous, fresh);
      if (!restored)
        fail(
          'The exact library direction and selected paint no longer pass under the updated source. The previous choice remains in refresh history.'
        );
      const before = previous.result.directions.find(d => d.id === previous.directionId)?.recipe
        .selection;
      const after = restored.result.directions.find(d => d.id === restored.directionId)?.recipe
        .selection;
      if (!before || !after) fail('The selected supporting direction has no retained application.');
      dep.checkRules(
        { kind: 'applications', model: before.model, applications: before.applications },
        { kind: 'applications', model: after.model, applications: after.applications }
      );
      supporting = restored;
      return 'restorable';
    });
  signal?.throwIfAborted();
  const drafts = await replayDrafts(context, review, replayExtension, replayGradient, signal);
  items.push(...drafts.items);
  const outputs = {
    ...EMPTY_GUIDELINE_OUTPUTS,
    ...(drafts.authoring ? { authoring: drafts.authoring } : {}),
    ...(drafts.designBrief ? { designBrief: drafts.designBrief } : {}),
    extension,
    application,
    ...(supporting ? { supporting } : {}),
  };
  return freeze({ selection, outputs, items });
}

/** Existing single-source lineage and saved format remain unchanged. */
export async function replayGuidelineRefresh(
  lineage: GuidelineRefreshLineage,
  next: OpenedSourceProject,
  signal?: AbortSignal
): Promise<GuidelineRefreshReplay> {
  const review = next.project.review;
  if (!review) fail('Apply the updated source review before checking previous designs.');
  const context = await guidelineRefreshContext(lineage, next, signal);
  const result = await replayReviewedDesigns(
    {
      ...context,
      nativeSources:
        next.kind === 'figma' && next.project.review
          ? singleNativeGradientSources(next.inventory, next.project.review)
          : [],
      previousModel: context.previous.project.review?.model ?? null,
      previousReviewHash: context.previous.project.review?.reviewHash ?? null,
      receiptPairs: reviewReceiptPairs(context.previous.project.review, review),
      previousSelection: context.previous.project.selection,
      legacyGradientKind: next.kind === 'pdf' ? 'pdf' : 'native',
    },
    review,
    signal
  );
  const supporting = result.outputs.supporting;
  const content = {
    kind: next.kind,
    captureHash: sourceCaptureHash(next),
    reviewHash: review.reviewHash,
    lineageHash: lineage.lineageHash,
    selection: result.selection,
    outputs: storedGuidelineOutputs(result.outputs),
    ...(result.outputs.authoring ? { authoring: result.outputs.authoring } : {}),
    ...(result.outputs.designBrief ? { designBrief: result.outputs.designBrief } : {}),
    ...(supporting ? { supportingSelection: storedGuidelineSupportingSelection(supporting) } : {}),
    items: result.items,
  };
  return freeze({ ...content, outputs: result.outputs, replayHash: guidelineHash(content) });
}
