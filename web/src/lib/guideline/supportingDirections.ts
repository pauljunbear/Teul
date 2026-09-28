import { captureColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import {
  compileColorSystemCatalogProposalV1,
  type ColorSystemCatalogProposalRequestV1,
  type ColorSystemCatalogProposalMaterializedV1,
  type ColorSystemCatalogProposalIntentV1,
} from '../../../../src/lib/colorSystemCatalogProposalV1';
import type { ColorSystemCatalogCandidateV1 } from '../../../../src/lib/colorSystemCatalogCandidatesV1';
import {
  executeColorSystemAuthoringRunV1,
  type ColorSystemAuthoringRunV1,
} from '../../../../src/lib/colorSystemAuthoringRunV1';
import type { ColorSystemAuthoringDirectionV1 } from '../../../../src/lib/colorSystemAuthoringExecutionV1';
import {
  colorSystemExactSrgbValueHashV1,
  colorSystemRgbDeltaEOKV1,
  colorSystemSrgbToRgbV1,
} from '../../../../src/lib/colorSystemSrgbValueV1';
import { buildColorSystemDesignContentV1 } from '../../../../src/lib/colorSystemDesignContentV1';
import {
  parseColorSystemRecipeV1,
  type ColorSystemRecipeV1,
} from '../../../../src/lib/colorSystemRecipeV1';
import {
  compileColorSystemAuthoredDeliveryV1,
  exportColorSystemAuthoredDeliveryV1,
} from '../../../../src/lib/colorSystemAuthoringDeliveryV1';
import {
  snapshotColorSystemInertJsonV1,
  serializeColorSystemInertJsonV1,
} from '../../../../src/lib/colorSystemInertJsonV1';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { guidelineHash, type ReviewedGuideline } from './review';
import { guidelineGenerationIssues } from './generationReview';
import {
  buildGuidelineApplicationLayout,
  assessGuidelineApplicationGeometry,
  exportGuidelineApplicationSvgs,
  type GuidelineApplicationLayoutInput,
  type GuidelineApplicationLayout,
} from './applicationGeometry';
import { compareText } from '../../../../src/lib/utils';
import { COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1 } from '../../../../src/lib/colorSystemAuthoredCandidatesV1';
import { canonicalNumber } from '../../../../src/lib/colorSystemHashing';
import { utf8ByteLength } from '../../../../src/lib/utf8';

const VERSION = 'teul.guideline-supporting-directions.v1' as const;
type Review = Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
export interface GuidelineSupportingRequest {
  readonly layout: GuidelineApplicationLayoutInput;
  readonly provider: 'wada' | 'werner' | 'radix';
  readonly scheme: 'light' | 'dark' | null;
  readonly relationship: 'nearby' | 'companion';
  readonly anchorColorIds: readonly string[];
  readonly excludedCandidateIds: readonly string[];
  /** Fixed source paints, shared across states. The secondary/action paint is proposed. */
  readonly sourcePaints: Readonly<Record<string, string>>;
}
export interface GuidelineSupportingDirection {
  readonly id: string;
  readonly catalogCandidateId: string;
  readonly provenance: ColorSystemCatalogCandidateV1['provenance'];
  readonly sourceMatches: ColorSystemCatalogCandidateV1['matches'];
  readonly recipe: ColorSystemRecipeV1;
  readonly geometry: ReturnType<typeof assessGuidelineApplicationGeometry>;
}
export interface GuidelineSupportingResult {
  readonly schemaVersion: typeof VERSION;
  readonly status: 'ready' | 'blocked' | 'cancelled';
  readonly qualified: false;
  readonly sourceModelHash: string;
  readonly reviewHash: string;
  readonly requestHash: string;
  readonly request: GuidelineSupportingRequest;
  readonly layout: GuidelineApplicationLayout;
  readonly issues: readonly { code: string; message: string }[];
  readonly proposals: readonly {
    candidateId: string;
    proposalHash: string;
    provenance: ColorSystemCatalogCandidateV1['provenance'];
    sourceMatches: ColorSystemCatalogCandidateV1['matches'];
    addedColorIds: readonly string[];
    pendingRuleIds: readonly string[];
    status: string;
  }[];
  readonly run: ColorSystemAuthoringRunV1 | null;
  readonly directions: readonly GuidelineSupportingDirection[];
}
export interface GuidelineSupportingSelection {
  readonly result: GuidelineSupportingResult;
  readonly directionId: string;
}
const captures = new WeakSet<GuidelineSupportingResult>();
const recoverableDirections = new WeakMap<
  GuidelineSupportingResult,
  (id: string) => GuidelineSupportingDirection | undefined
>();
const recoverablePaint = new WeakMap<
  GuidelineSupportingResult,
  (previous: GuidelineSupportingDirection) => GuidelineSupportingDirection | undefined
>();
function paintedSelection(recipe: ColorSystemRecipeV1) {
  return recipe.selection?.applications.map(application => ({
    id: application.id,
    contextId: application.contextId,
    pairs: application.pairs,
    uses: application.uses.map(({ colorId, ...use }) => {
      const color = recipe.selection!.model.colors.find(c => c.id === colorId)!;
      return { ...use, label: color.label, value: color.valuesByMode[application.modeId] };
    }),
  }));
}
const LIMITS = { maximumBytes: 16 * 1024 * 1024, maximumDepth: 48, maximumNodes: 800000 };
function fail(reason: string): never {
  throw new Error(`Supporting colors: ${reason}`);
}
const exact = (value: unknown) => serializeColorSystemInertJsonV1(value, LIMITS);
const runtime = (signal?: AbortSignal) => ({
  isCancelled: () => signal?.aborted ?? false,
  yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
});
function ids(value: unknown, minimum: number, maximum: number): string[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum ||
    value.some(v => typeof v !== 'string' || !v.trim() || v.length > 128) ||
    new Set(value).size !== value.length
  )
    fail('Choose unique bounded source or candidate identities.');
  return [...value].sort();
}
function parseRequest(raw: GuidelineSupportingRequest): GuidelineSupportingRequest {
  const value = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 32768 });
  record(value, [
    'layout',
    'provider',
    'scheme',
    'relationship',
    'anchorColorIds',
    'excludedCandidateIds',
    'sourcePaints',
  ]);
  const layout = buildGuidelineApplicationLayout(
    value.layout as GuidelineApplicationLayoutInput
  ).request;
  if (typeof value.provider !== 'string' || !['wada', 'werner', 'radix'].includes(value.provider))
    fail('Choose a supported color library.');
  if (
    value.provider === 'radix'
      ? value.scheme !== 'light' && value.scheme !== 'dark'
      : value.scheme !== null
  )
    fail('Map Radix to an explicit published scheme; historical values use no scheme mapping.');
  if (value.relationship !== 'nearby' && value.relationship !== 'companion')
    fail('Choose a declared source relationship.');
  if (value.relationship === 'companion' && value.provider !== 'wada')
    fail('Documented companion relationships currently use Wada combinations.');
  if (layout.kind === 'product' && value.provider !== 'radix')
    fail(
      'Automatic control states currently require an exact Radix scale. Historical colors remain available for brand compositions and manual applications.'
    );
  const roles =
    layout.kind === 'brand'
      ? ['ground', 'primary', 'accent']
      : ['ground', 'label', 'partner', 'focus-ring', 'disabled-action', 'disabled-label'];
  record(value.sourcePaints, roles);
  const sourcePaints = value.sourcePaints as Record<string, string>;
  for (const role of roles) ids([sourcePaints[role]], 1, 1);
  return {
    layout,
    provider: value.provider as GuidelineSupportingRequest['provider'],
    scheme: value.scheme as GuidelineSupportingRequest['scheme'],
    relationship: value.relationship,
    anchorColorIds: ids(value.anchorColorIds, 1, 8),
    excludedCandidateIds: ids(value.excludedCandidateIds, 0, 24),
    sourcePaints,
  };
}

/** Catalog identity plus actual application checks; neither retrieval distance nor contrast is a taste score. */
export async function generateGuidelineSupportingDirections(
  review: Review,
  raw: GuidelineSupportingRequest,
  signal?: AbortSignal
): Promise<GuidelineSupportingResult> {
  const source = captureColorSystemModelV1(review.model),
    reviewHash = review.reviewHash;
  if (!/^sha256:[a-f0-9]{64}$/.test(reviewHash)) fail('An applied source review is required.');
  const request = parseRequest(raw),
    layout = buildGuidelineApplicationLayout(request.layout);
  const requestHash = guidelineHash({
    schemaVersion: VERSION,
    sourceModelHash: source.modelHash,
    reviewHash,
    request,
  });
  const scope = request.layout.kind,
    modeId = request.layout.modeId;
  if (!source.contexts.find(c => c.id === scope)?.modeIds.includes(modeId))
    fail('The requested source context and mode do not exist.');
  const sourceColor = (id: string, opaque = false) => {
    const color = source.colors.find(c => c.id === id),
      value = color?.valuesByMode[modeId];
    if (!color || !value || value.alpha <= 0 || (opaque && value.alpha !== 1))
      fail(
        'Every fixed paint and anchor must be an available source value; anchors and the ground must be opaque.'
      );
    return color!;
  };
  request.anchorColorIds.forEach(id => sourceColor(id, true));
  Object.entries(request.sourcePaints).forEach(([role, id]) => sourceColor(id, role === 'ground'));
  // The complete application engine scopes missing evidence and rule decisions to actual
  // consumers. Only the source-wide closed-palette restriction needs an earlier gate.
  const issues = guidelineGenerationIssues(source, scope, modeId, 'application');
  let proposals: GuidelineSupportingResult['proposals'][number][] = [],
    run: ColorSystemAuthoringRunV1 | null = null;
  const finish = (
    status: GuidelineSupportingResult['status'],
    directions: GuidelineSupportingDirection[] = []
  ) => {
    const result = freeze({
      schemaVersion: VERSION,
      status,
      qualified: false as const,
      sourceModelHash: source.modelHash,
      reviewHash,
      requestHash,
      request,
      layout,
      issues,
      proposals: status === 'cancelled' ? [] : proposals,
      run: status === 'cancelled' ? null : run,
      directions,
    });
    captures.add(result);
    return result;
  };
  if (signal?.aborted) return finish('cancelled');
  if (issues.length) return finish('blocked');
  const query: ColorSystemCatalogProposalRequestV1 = {
    version: 'teul.catalog-proposal.v1',
    sourceModelHash: source.modelHash,
    contextId: scope,
    anchorRefs: request.anchorColorIds.map(colorId => {
      const value = sourceColor(colorId).valuesByMode[modeId];
      return {
        colorId,
        modeId,
        valueHash: colorSystemExactSrgbValueHashV1(value.components, value.alpha),
      };
    }),
    providers: [request.provider],
    limitPerProvider: 8,
    ...(request.provider === 'radix'
      ? { radix: { category: 'accent' as const, modes: [{ modeId, scheme: request.scheme! }] } }
      : { historicalModes: [{ modeId, sourceMode: 'static' as const }] }),
  };
  const session = await compileColorSystemCatalogProposalV1(source, query, runtime(signal));
  if (session.status === 'cancelled' || signal?.aborted) return finish('cancelled');
  if (session.status !== 'ready') fail(session.message);
  const brief: ColorSystemCatalogProposalIntentV1['brief'] = {
    briefHash: requestHash,
    operation: 'extend',
    contextIds: [scope],
    modeIds: [modeId],
    permissions: {
      addColors: true,
      addFamilies: true,
      addScales: request.provider === 'radix',
      addRules: false,
      editFamilyIds: [],
      editScaleIds: [],
      replaceRuleIds: [],
    },
  };
  const planned: {
    candidate: ColorSystemCatalogCandidateV1;
    materialized: ColorSystemCatalogProposalMaterializedV1;
    direction: ColorSystemAuthoringDirectionV1;
  }[] = [];
  const sourceRgb = new Map(
    source.colors
      .filter(color => color.valuesByMode[modeId]?.alpha === 1)
      .map(color => [color.id, colorSystemSrgbToRgbV1(color.valuesByMode[modeId])])
  );
  const anchorValues = request.anchorColorIds.map(id => sourceRgb.get(id)!);
  const sourceValues = [...sourceRgb.values()];
  const nearest = (
    value: ReturnType<typeof colorSystemSrgbToRgbV1>,
    references: typeof sourceValues
  ) =>
    Math.min(
      ...references.map(reference => canonicalNumber(colorSystemRgbDeltaEOKV1(value, reference)))
    );
  const execution = runtime(signal);
  for (const candidate of session.retrieval.candidates) {
    await execution.yield();
    if (signal?.aborted) return finish('cancelled');
    if (request.excludedCandidateIds.includes(candidate.id)) continue;
    const intent: ColorSystemCatalogProposalIntentV1 = {
      version: 'teul.catalog-proposal.v1',
      id: `gs:${requestHash.slice(7, 31)}:${candidate.id}`,
      sourceModelHash: source.modelHash,
      brief,
    };
    const materialized = session.materialize(candidate.id, intent);
    // Catalog additions use separate families and sources. A future broader mutation must
    // explicitly support renewed rule review; this path cannot silently renew decisions.
    if (exact(materialized.proposal.workingModel.adoptions) !== exact(source.adoptions))
      fail('Adding this family changed a source rule decision; return to source review.');
    const model = materialized.proposal.workingModel;
    const workingColors = new Map(model.colors.map(color => [color.id, color]));
    const distances = new Map(
      materialized.binding.members.map(member => {
        const value = colorSystemSrgbToRgbV1(
          workingColors.get(member.colorId)!.valuesByMode[modeId]
        );
        return [
          member.colorId,
          { reference: nearest(value, anchorValues), source: nearest(value, sourceValues) },
        ];
      })
    );
    const members = [...materialized.binding.members].sort(
      (a, b) =>
        distances.get(a.colorId)!.reference - distances.get(b.colorId)!.reference ||
        compareText(a.colorId, b.colorId)
    );
    const matched = new Set(candidate.matches.map(m => m.memberId));
    const allowed = members.filter(
      m =>
        distances.get(m.colorId)!.source >=
          COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1.minimumChangedPaintDeltaEOK &&
        (request.relationship !== 'companion' ||
          m.modes.every(mode => !matched.has(mode.catalogMemberId)))
    );
    if (!allowed.length) continue;
    const scale = model.scales.find(s => s.id === materialized.binding.scaleId);
    const scaleMode = scale?.modes.find(mode => mode.modeId === modeId);
    const representative =
      scope === 'brand'
        ? allowed[0].colorId
        : scaleMode?.anchors.find(anchor => anchor.slotId === 'step:9')?.colorId;
    if (!representative || !allowed.some(member => member.colorId === representative)) continue;
    const assignments = layout.roles
      .filter(role => role.useId !== (scope === 'brand' ? 'secondary' : 'action'))
      .map(role => ({
        applicationId: role.applicationId,
        useId: role.useId,
        colorId:
          request.sourcePaints[
            role.applicationId === 'disabled' && role.useId === 'label'
              ? 'disabled-label'
              : role.useId
          ],
      }));
    if (scope === 'product')
      assignments.push({
        applicationId: 'disabled',
        useId: 'action',
        colorId: request.sourcePaints['disabled-action'],
      });
    const direction: ColorSystemAuthoringDirectionV1 = {
      version: 'teul.authoring-direction.v1',
      id: intent.id,
      generation: { kind: 'catalog', query, candidateId: candidate.id, intent },
      requirements: layout.requirements,
      composition: {
        version: 'teul.model-composition.v1',
        modelBinding: 'generated-model',
        requirementsHash: guidelineHash(layout.requirements),
        maximumNodes: 256,
        maximumSolutions: 3,
        groups: [
          {
            id: 'complete-applications',
            options:
              scope === 'brand'
                ? allowed.slice(0, 1).map(member => ({
                    id: member.colorId,
                    assignments: [
                      ...assignments,
                      { applicationId: 'brand', useId: 'secondary', colorId: member.colorId },
                    ],
                  }))
                : [{ id: 'fixed-source-paints', assignments }],
          },
        ],
      },
      units: [
        {
          id: 'supporting-family',
          contextId: scope,
          familyId: materialized.binding.familyId,
          ...(materialized.binding.scaleId ? { scaleId: materialized.binding.scaleId } : {}),
          prominence: 'supporting',
          jobs: [scope === 'brand' ? 'marketing-accent' : 'product-semantics'],
          anchors: [{ modeId, colorId: representative }],
        },
      ],
      ...(scope === 'product'
        ? {
            interactionGroups: [
              {
                id: 'action-states',
                request: {
                  version: 'teul.model-interactions.v1' as const,
                  modelBinding: 'generated-model' as const,
                  contextId: scope,
                  modeId,
                  role: 'selected' as const,
                  scales: [
                    {
                      scaleId: materialized.binding.scaleId!,
                      slotIds: scale!.slots.map(s => s.id),
                      preference: 0,
                      preferredSlotIds: { rest: 'step:9', hover: 'step:10', pressed: 'step:11' },
                      lockedSlotIds: { rest: 'step:9' },
                      stateOrder: 'ascending' as const,
                    },
                  ],
                  surfaceColorIds: [request.sourcePaints.ground],
                  onForegroundColorIds: [request.sourcePaints.label],
                },
                bindings: layout.requirements.templates
                  .filter(template => template.id !== 'disabled')
                  .map(template => ({
                    applicationId: template.id,
                    useId: 'action',
                    selection:
                      template.id === 'hover' || template.id === 'pressed'
                        ? template.id
                        : ('rest' as const),
                  })),
              },
            ],
          }
        : {}),
    };
    planned.push({ candidate, materialized, direction });
  }
  if (!planned.length) {
    issues.push({
      code: 'NO_RETRIEVED_SUPPORT',
      message:
        'None of the eight retrieved families supplied a permitted new supporting paint under this request. Change the reference, library or exclusions; this is not a search of every possible color.',
    });
    return finish('blocked');
  }
  run = await executeColorSystemAuthoringRunV1(
    source,
    {
      version: 'teul.authoring-run.v1',
      id: `gs:${requestHash.slice(7, 55)}`,
      brief,
      requirements: layout.requirements,
      directions: planned.map(({ direction }) => ({
        version: direction.version,
        id: direction.id,
        generation: direction.generation,
        composition: direction.composition,
        units: direction.units,
        ...(direction.interactionGroups ? { interactionGroups: direction.interactionGroups } : {}),
      })),
    },
    runtime(signal)
  );
  if (run.status === 'cancelled' || signal?.aborted) return finish('cancelled');
  if (run.status === 'blocked')
    issues.push({
      code: 'NO_ELIGIBLE_SUPPORT',
      message:
        'The bounded search found no supporting direction that passes the actual application and source restrictions. Review the application diagnostics or change its fixed paints, source reference or library.',
    });
  proposals = planned.map(p => {
    const execution = run!.executions.find(e => e.id === p.direction.id)!;
    const pending =
      execution.composition && execution.composition.status !== 'cancelled'
        ? (execution.composition.diagnostics.pendingRuleIds ?? [])
        : [];
    return {
      candidateId: p.candidate.id,
      proposalHash: p.materialized.proposal.proposalHash,
      provenance: p.candidate.provenance,
      sourceMatches: p.candidate.matches,
      addedColorIds: p.materialized.binding.members.map(m => m.colorId),
      pendingRuleIds: pending.filter(id => p.materialized.proposal.pendingRuleIds.includes(id)),
      status: execution.status,
    };
  });
  const contentId = (
    candidate: NonNullable<GuidelineSupportingResult['run']>['directions'][number]
  ) =>
    `support:${buildColorSystemDesignContentV1(
      candidate.proposal.workingModel,
      candidate.applications.applications.map(a => a.application)
    ).contentHash.slice(7)}`;
  const builtDirections = new Map<string, GuidelineSupportingDirection>();
  const buildDirection = (
    candidate: NonNullable<GuidelineSupportingResult['run']>['directions'][number]
  ): GuidelineSupportingDirection => {
    const existing = builtDirections.get(candidate.id);
    if (existing) return existing;
    const execution = run!.executions.find(e => e.candidates.some(c => c.id === candidate.id))!;
    const plan = planned.find(p => p.direction.id === execution.id)!;
    const model = candidate.proposal.workingModel,
      applications = candidate.applications.applications.map(a => a.application);
    const recipe = parseColorSystemRecipeV1({
      schemaVersion: 'teul.color-system-recipe.v1',
      id: contentId(candidate),
      label: `Supporting ${plan.candidate.id}`,
      source: { model: source, intake: 'guideline-json' },
      direction: plan.direction,
      selection: {
        model,
        applications,
        contentHash: buildColorSystemDesignContentV1(model, applications).contentHash,
        executionReceiptHash: execution.receipt.receiptHash,
      },
      locks: [],
    });
    const direction = freeze({
      id: recipe.id,
      catalogCandidateId: plan.candidate.id,
      provenance: plan.candidate.provenance,
      sourceMatches: plan.candidate.matches,
      recipe,
      geometry: assessGuidelineApplicationGeometry(model, applications, layout),
    });
    builtDirections.set(candidate.id, direction);
    return direction;
  };
  const result = finish(run.status, run.directions.map(buildDirection));
  recoverableDirections.set(result, id => {
    const candidate = run!.ranking?.assessments.find(
      candidate => candidate.eligible && contentId(candidate) === id
    );
    return candidate ? buildDirection(candidate) : undefined;
  });
  recoverablePaint.set(result, previous => {
    for (const candidate of run!.ranking?.assessments ?? []) {
      if (!candidate.eligible) continue;
      const execution = run!.executions.find(e => e.candidates.some(c => c.id === candidate.id))!;
      const plan = planned.find(p => p.direction.id === execution.id)!;
      if (
        plan.candidate.id !== previous.catalogCandidateId ||
        exact(plan.candidate.provenance) !== exact(previous.provenance)
      )
        continue;
      const direction = buildDirection(candidate);
      if (exact(paintedSelection(direction.recipe)) === exact(paintedSelection(previous.recipe)))
        return direction;
    }
  });
  return result;
}

/** Caller first verifies source correspondence; this adds exact library identity and paint checks. */
export function restoreGuidelineSupportingSelection(
  previous: GuidelineSupportingSelection,
  fresh: GuidelineSupportingResult
): GuidelineSupportingSelection | null {
  if (!captures.has(previous.result) || !captures.has(fresh))
    fail('Recompute both supporting requests before restoring.');
  const prior = previous.result.directions.find(d => d.id === previous.directionId);
  if (!prior || exact(previous.result.layout.boards) !== exact(fresh.layout.boards)) return null;
  const direction = recoverablePaint.get(fresh)?.(prior);
  if (!direction) return null;
  if (fresh.directions.some(d => d.id === direction.id))
    return freeze({ result: fresh, directionId: direction.id });
  const result = freeze({ ...fresh, directions: [direction] });
  captures.add(result);
  return freeze({ result, directionId: direction.id });
}

/** Re-execution, exact selected values and existing delivery checks precede every export. */
export function storedGuidelineSupportingSelection({
  result,
  directionId,
}: GuidelineSupportingSelection): string {
  if (!captures.has(result)) fail('Recompute the supporting request before saving.');
  const direction = result.directions.find(d => d.id === directionId);
  if (!direction?.recipe.selection) fail('Choose an eligible displayed direction.');
  return exact({
    schemaVersion: VERSION,
    sourceModelHash: result.sourceModelHash,
    reviewHash: result.reviewHash,
    request: result.request,
    directionId,
    recipe: direction.recipe,
    provenance: direction.provenance,
  });
}

export async function exportGuidelineSupportingDirection(
  result: GuidelineSupportingResult,
  directionId: string,
  signal?: AbortSignal
) {
  if (!captures.has(result)) fail('Recompute the supporting request before exporting.');
  const direction = result.directions.find(d => d.id === directionId);
  if (!direction?.recipe.selection) fail('Choose an eligible displayed direction.');
  const delivery = await compileColorSystemAuthoredDeliveryV1(
    direction.recipe,
    direction.geometry.plan,
    runtime(signal)
  );
  signal?.throwIfAborted();
  return freeze({
    ...exportColorSystemAuthoredDeliveryV1(delivery),
    json: storedGuidelineSupportingSelection({ result, directionId }),
    svgs: exportGuidelineApplicationSvgs(
      direction.recipe.selection.model,
      direction.recipe.selection.applications,
      result.layout
    ),
  });
}

/** Reopen against its retained source review, replaying eligibility and exact selected paints. */
export async function readGuidelineSupportingDirection(
  raw: string,
  review: Review,
  signal?: AbortSignal
) {
  signal?.throwIfAborted();
  if (typeof raw !== 'string' || utf8ByteLength(raw) > LIMITS.maximumBytes)
    fail('Supporting color file exceeds its bound.');
  const saved = snapshotColorSystemInertJsonV1(JSON.parse(raw), LIMITS);
  record(saved, [
    'schemaVersion',
    'sourceModelHash',
    'reviewHash',
    'request',
    'directionId',
    'recipe',
    'provenance',
  ]);
  const source = captureColorSystemModelV1(review.model);
  const stable = { model: source, reviewHash: review.reviewHash };
  if (
    saved.schemaVersion !== VERSION ||
    saved.sourceModelHash !== source.modelHash ||
    saved.reviewHash !== stable.reviewHash
  )
    fail('Unsupported file or changed source review.');
  ids([saved.directionId], 1, 1);
  const recipe = parseColorSystemRecipeV1(saved.recipe);
  const result = await generateGuidelineSupportingDirections(
    stable,
    saved.request as unknown as GuidelineSupportingRequest,
    signal
  );
  signal?.throwIfAborted();
  const direction = recoverableDirections.get(result)?.(saved.directionId as string);
  // Arithmetic receipts can differ between JS runtimes; all authored inputs, selected colors,
  // applications and content hashes must still match. The current execution grants eligibility.
  const comparable = (value: ColorSystemRecipeV1) => ({
    ...value,
    selection: value.selection ? { ...value.selection, executionReceiptHash: null } : null,
  });
  if (
    !direction ||
    exact(comparable(recipe)) !== exact(comparable(direction.recipe)) ||
    exact(saved.provenance) !== exact(direction.provenance)
  )
    fail('Saved supporting colors differ from their freshly checked source and intent.');
  if (result.directions.some(item => item.id === direction.id))
    return freeze({ result, directionId: direction.id });
  // A reopened selection is one explicit choice, even when it is outside the current comparison.
  const restored = freeze({ ...result, directions: [direction] });
  captures.add(restored);
  return freeze({ result: restored, directionId: direction.id });
}
