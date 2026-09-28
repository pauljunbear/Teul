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
  type GuidelineAuthoredGradientSelection,
} from './authoredGradient';

export interface GuidelineRefreshReplay {
  kind: OpenedSourceProject['kind'];
  captureHash: string;
  reviewHash: string;
  lineageHash: string;
  selection:
    GuidelineSelection | GuidelineModeGradientSelection | GuidelineAuthoredGradientSelection | null;
  outputs: GuidelineSelectedOutputs;
  items: {
    kind: 'gradient' | 'extension' | 'application' | 'supporting';
    status: 'restorable' | 'needs-review' | 'stale' | 'absent';
    reason: string;
  }[];
  replayHash: string;
}
export interface ReviewedDesignRefreshContext {
  previousModel: ColorSystemModelV1 | null;
  previousSelection: GuidelineSelection | GuidelineModeGradientSelection | null;
  legacyGradientKind: 'pdf' | 'native';
  outputs: GuidelineSelectedOutputs;
  gradient: GuidelineAuthoredGradientSelection | null;
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
  const operands = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(operands);
    if (value && typeof value === 'object') {
      const item = value as Record<string, unknown>;
      if (['color', 'family', 'scale'].includes(String(item.kind)) && typeof item.id === 'string')
        return selector(item as unknown as ColorSystemSelectorV1);
      return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, operands(value)]));
    }
    return value;
  };
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
  return { mode, color, scale, family, checkRules };
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
  await attempt('gradient', !!context.previousSelection || !!context.gradient, async () => {
    if (context.gradient) {
      const old = context.gradient;
      const dep = dependencies(context, review.model, old.modeId, `gradient:${old.scope}`);
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
      selection = fresh;
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
      dep = dependencies(context, review.model, request.layout.modeId, request.layout.kind);
    const embedded = request.extension
      ? await replayExtension(request.extension, 'application')
      : null;
    const color = (id: string) => embedded?.generated.get(id) ?? dep.color(id);
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
        layout: { ...request.layout, modeId: dep.mode },
        assignments,
        extension: restoredExtension,
      },
      signal
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
      const dep = dependencies(context, review.model, request.layout.modeId, request.layout.kind);
      const fresh = await generateGuidelineSupportingDirections(
        review,
        {
          ...request,
          layout: { ...request.layout, modeId: dep.mode },
          anchorColorIds: request.anchorColorIds.map(dep.color),
          sourcePaints: Object.fromEntries(
            Object.entries(request.sourcePaints).map(([role, id]) => [role, dep.color(id)])
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
  const outputs = {
    ...EMPTY_GUIDELINE_OUTPUTS,
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
      previousModel: context.previous.project.review?.model ?? null,
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
    ...(supporting ? { supportingSelection: storedGuidelineSupportingSelection(supporting) } : {}),
    items: result.items,
  };
  return freeze({ ...content, outputs: result.outputs, replayHash: guidelineHash(content) });
}
