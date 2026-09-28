import { colorSystemSrgbToOklchV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { sourceScaleAnchorPosition } from '../sourceScalePlacement';
import { planColorSystemSourceScaleV1 } from '../../../../src/lib/colorSystemScalePlanningV1';
import { guidelineGenerationIssues } from './generationReview';
/** Source-bound scale authoring. Preview never grants application approval. */
import {
  captureColorSystemModelV1,
  COLOR_SYSTEM_MODEL_V1_LIMITS,
  type ColorSystemModelV1,
  type ColorSystemRuleAdoptionV1,
  type ColorSystemRuleAdoptionDecisionV1,
} from '../../../../src/lib/colorSystemModelV1';
import {
  buildColorSystemProposalV1,
  type ColorSystemProposalRequestV1,
} from '../../../../src/lib/colorSystemProposalV1';
import {
  buildColorSystemConstructionProposalV1,
  type ColorSystemConstructionProposalResultV1,
  type ColorSystemConstructionProposalBindingV1,
} from '../../../../src/lib/colorSystemConstructionProposalV1';
import type {
  ColorSystemConstructionBriefV1,
  ColorSystemConstructionExecutionV1,
} from '../../../../src/lib/colorSystemConstructionV1';
import type { ColorSystemAuthoringDirectionV1 } from '../../../../src/lib/colorSystemAuthoringExecutionV1';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { guidelineHash, type ReviewedGuideline } from './review';

export interface GuidelineInteriorExtensionRequest {
  readonly context: 'brand' | 'product';
  readonly scaleId: string;
  readonly modeId: string;
  readonly additions: readonly { readonly slotId: string; readonly position: number }[];
  readonly lightnessOrder: 'increasing' | 'decreasing' | 'none';
}
export interface GuidelineNewScaleRequest {
  readonly kind: 'new-scale';
  readonly context: 'brand' | 'product';
  readonly scaleId: string;
  readonly modeId: string;
  readonly familyId: string | null;
  readonly anchorColorId: string;
  readonly label: string;
  readonly polarity: 'light' | 'dark';
}
export type GuidelineExtensionRequest =
  GuidelineInteriorExtensionRequest | GuidelineNewScaleRequest;
export function isGuidelineNewScale(
  request: GuidelineExtensionRequest
): request is GuidelineNewScaleRequest {
  return 'kind' in request && request.kind === 'new-scale';
}
export interface GuidelineExtensionReview {
  readonly reviewedProposalHash: string;
  readonly decisions: readonly (Omit<ColorSystemRuleAdoptionDecisionV1, 'actor'> & {
    readonly actor: { readonly kind: 'user'; readonly ref: string };
  })[];
}
export interface GuidelineExtensionResult {
  readonly status: 'proposed' | 'blocked' | 'incomplete' | 'infeasible' | 'cancelled';
  readonly qualified: false;
  readonly sourceModelHash: string;
  readonly reviewHash: string;
  readonly requestHash: string;
  readonly request: GuidelineExtensionRequest;
  readonly issues: readonly { readonly code: string; readonly message: string }[];
  /** Canonical declaration for actual engine replay, never a cached eligibility grant. */
  readonly generation: Extract<
    ColorSystemAuthoringDirectionV1['generation'],
    { kind: 'construction' }
  > | null;
  readonly construction: ColorSystemConstructionProposalResultV1 | null;
  readonly workingModel: ColorSystemModelV1 | null;
  readonly generatedBindings: readonly ColorSystemConstructionProposalBindingV1[];
  readonly pendingRuleIds: readonly string[];
  readonly adoptionChanges: readonly {
    readonly ruleId: string;
    readonly status: 'retained' | 'needs-review' | 'reviewed';
    readonly before: ColorSystemRuleAdoptionV1 | null;
    readonly after: ColorSystemRuleAdoptionV1 | null;
  }[];
}
type Review = Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
const VERSION = 'teul.guideline-source-extension.v1';
const hashPattern = /^sha256:[a-f0-9]{64}$/;
function fail(message: string): never {
  throw new Error(`Guideline extension: ${message}`);
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected a record.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== keys.length || keys.some(key => !(key in input)))
    fail('Missing or unsupported request fields.');
  return input;
}
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumId
  )
    fail('Expected a bounded, nonblank identifier.');
  return value;
}
function parseRequest(value: GuidelineExtensionRequest): GuidelineExtensionRequest {
  const snapshot = snapshotColorSystemInertJsonV1(value, { maximumBytes: 32768 });
  if (snapshot && typeof snapshot === 'object' && 'kind' in snapshot) {
    const input = object(snapshot, [
      'kind',
      'context',
      'scaleId',
      'modeId',
      'familyId',
      'anchorColorId',
      'label',
      'polarity',
    ]);
    if (input.kind !== 'new-scale' || (input.context !== 'brand' && input.context !== 'product'))
      fail('Choose a supported scale operation and use.');
    if (input.polarity !== 'light' && input.polarity !== 'dark')
      fail('Choose light or dark ordering.');
    return {
      kind: 'new-scale',
      context: input.context,
      scaleId: text(input.scaleId),
      modeId: text(input.modeId),
      familyId: input.familyId === null ? null : text(input.familyId),
      anchorColorId: text(input.anchorColorId),
      label: text(input.label),
      polarity: input.polarity,
    };
  }
  const input = object(snapshot, ['context', 'scaleId', 'modeId', 'additions', 'lightnessOrder']);
  if (input.context !== 'brand' && input.context !== 'product') fail('Choose brand or product.');
  if (!['increasing', 'decreasing', 'none'].includes(input.lightnessOrder as string))
    fail('Declare the lightness order explicitly.');
  if (
    !Array.isArray(input.additions) ||
    !input.additions.length ||
    input.additions.length > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumSlots
  )
    fail('Request between one and 64 intermediate positions.');
  const additions = input.additions
    .map(value => {
      const item = object(value, ['slotId', 'position']);
      if (typeof item.position !== 'number' || !Number.isFinite(item.position))
        fail('Positions must be finite numbers.');
      return { slotId: text(item.slotId), position: item.position };
    })
    .sort((a, b) => a.position - b.position);
  if (
    new Set(additions.map(item => item.slotId)).size !== additions.length ||
    new Set(additions.map(item => item.position)).size !== additions.length
  )
    fail('Requested slot IDs and positions must be unique.');
  return {
    context: input.context,
    scaleId: text(input.scaleId),
    modeId: text(input.modeId),
    additions,
    lightnessOrder: input.lightnessOrder as GuidelineInteriorExtensionRequest['lightnessOrder'],
  };
}

async function execute(
  review: Review,
  input: GuidelineExtensionRequest,
  execution?: ColorSystemConstructionExecutionV1,
  decision?: GuidelineExtensionReview
): Promise<GuidelineExtensionResult> {
  const source = captureColorSystemModelV1(review.model);
  const reviewHash = review.reviewHash;
  if (!hashPattern.test(reviewHash)) fail('The review must have an exact content hash.');
  const request = parseRequest(input);
  const requestHash = guidelineHash({
    version: isGuidelineNewScale(request) ? 'teul.guideline-new-scale.v1' : VERSION,
    reviewHash,
    modelHash: source.modelHash,
    request,
  });
  const issues: { code: string; message: string }[] = [];
  let generation: GuidelineExtensionResult['generation'] = null;
  const result = (
    construction: ColorSystemConstructionProposalResultV1 | null
  ): GuidelineExtensionResult => {
    const proposal = construction?.status === 'proposed' ? construction.proposal : null;
    const workingModel = proposal?.workingModel ?? null;
    return {
      status: construction?.status ?? 'blocked',
      qualified: false,
      sourceModelHash: source.modelHash,
      reviewHash,
      requestHash,
      request,
      issues,
      construction,
      generation,
      workingModel,
      generatedBindings: construction?.generatedBindings ?? [],
      pendingRuleIds: proposal?.pendingRuleIds ?? [],
      adoptionChanges: workingModel
        ? source.rules.map(rule => {
            const before = source.adoptions.find(item => item.ruleId === rule.id) ?? null;
            const after = workingModel.adoptions.find(item => item.ruleId === rule.id) ?? null;
            return {
              ruleId: rule.id,
              before,
              after,
              status: !after
                ? 'needs-review'
                : guidelineHash(before) === guidelineHash(after)
                  ? 'retained'
                  : 'reviewed',
            };
          })
        : [],
    };
  };
  if (isGuidelineNewScale(request)) {
    issues.push(...guidelineGenerationIssues(source, request.context, request.modeId));
    const memberships = source.families.filter(item =>
      item.colorIds.includes(request.anchorColorId)
    );
    const family =
      request.familyId === null && memberships.length === 0
        ? {
            id: `gnf:${guidelineHash(request.scaleId).slice(7, 55)}`,
            label: request.label,
            colorIds: [request.anchorColorId],
          }
        : memberships.find(item => item.id === request.familyId);
    const anchor = source.colors.find(item => item.id === request.anchorColorId);
    const value = anchor?.valuesByMode[request.modeId];
    if (
      !source.contexts.find(item => item.id === request.context)?.modeIds.includes(request.modeId)
    )
      issues.push({
        code: 'SOURCE_MODE_REQUIRED',
        message: 'Choose a source mode available for this use.',
      });
    if (!family?.colorIds.includes(request.anchorColorId))
      issues.push({
        code: 'SOURCE_FAMILY_REQUIRED',
        message: 'Choose an anchor in its existing source family.',
      });
    if (!value || value.alpha !== 1)
      issues.push({
        code: 'OPAQUE_SOURCE_REQUIRED',
        message:
          'Creating a scale requires an exact opaque source color. Transparent colors are not flattened.',
      });
    if (issues.length || !family || !value) return result(null);
    const brief: ColorSystemProposalRequestV1['brief'] = {
      briefHash: requestHash,
      operation: 'extend',
      contextIds: [request.context],
      modeIds: [request.modeId],
      permissions: {
        addColors: true,
        addFamilies: request.familyId === null,
        addScales: true,
        addRules: false,
        editFamilyIds: request.familyId === null ? [] : [family.id],
        editScaleIds: [],
        replaceRuleIds: [],
      },
    };
    const plan = planColorSystemSourceScaleV1(source, {
      version: 'teul.source-scale-planning.v1',
      id: `gn:${requestHash.slice(7, 55)}`,
      sourceModelHash: source.modelHash,
      contextId: request.context,
      family: { id: family.id, label: family.label },
      scale: { id: request.scaleId, label: request.label },
      brief,
      decision: {
        actor: { kind: 'user', ref: 'studio:local-new-scale-request' },
        authorityRef: reviewHash,
        decisionRef: requestHash,
      },
      modes: [
        {
          modeId: request.modeId,
          polarity: request.polarity,
          anchorColorId: request.anchorColorId,
        },
      ],
    });
    if (plan.status !== 'planned') {
      issues.push({
        code: 'SOURCE_VALUE_REQUIRED',
        message: 'Resolve the source anchor before creating a scale.',
      });
      return result(null);
    }
    const lightness = colorSystemSrgbToOklchV1(value).l;
    const endpoints = plan.constructionBrief.scales[0].endpoints;
    const first = endpoints.find(endpoint => endpoint.slotId === 'step:1')!.oklch.l;
    const last = endpoints.find(endpoint => endpoint.slotId === 'step:12')!.oklch.l;
    // Near-white/black sources replace the outer endpoint, rather than forcing an
    // exact source outside the monotonic range into an interior slot.
    const position = (request.polarity === 'light' ? lightness >= first : lightness <= first)
      ? 1
      : (request.polarity === 'light' ? lightness <= last : lightness >= last)
        ? 12
        : sourceScaleAnchorPosition(value, request.polarity);
    const slotId = `step:${position}`;
    const structureProposal: ColorSystemProposalRequestV1 = {
      ...plan.structureProposal,
      derivation: {
        ...plan.structureProposal.derivation,
        algorithmId: 'teul.guideline-source-scale-placement',
        algorithmVersion: '1',
        policyHash: guidelineHash(
          'exact-source-lightness-position-v1:12-slots:source-outside-endpoints-replaces-endpoint:otherwise-interior-clamp-2-11'
        ),
        inputHash: guidelineHash({
          sourcePlan: plan.structureProposal.derivation,
          slotId,
          polarity: request.polarity,
        }),
      },
      scales: plan.structureProposal.scales.map(scale => ({
        ...scale,
        modes: scale.modes.map(mode => ({
          ...mode,
          anchors: mode.anchors.map(anchor => ({ ...anchor, slotId })),
        })),
      })),
    };
    const structure = buildColorSystemProposalV1(source, structureProposal);
    generation = {
      kind: 'construction',
      structureProposal,
      brief: {
        ...plan.constructionBrief,
        modelHash: structure.workingModel.modelHash,
        scales: plan.constructionBrief.scales.map(scale => ({
          ...scale,
          fillSlotIds: scale.requiredSlotIds.filter(id => id !== slotId),
          endpoints: scale.endpoints.filter(endpoint => endpoint.slotId !== slotId),
        })),
      },
      intent: { ...plan.constructionIntent, ...(decision ? { review: decision } : {}) },
    };
    return result(
      await buildColorSystemConstructionProposalV1(
        source,
        generation.brief,
        generation.intent,
        execution,
        structureProposal
      )
    );
  }
  const context = source.contexts.find(item => item.id === request.context);
  const scale = source.scales.find(item => item.id === request.scaleId);
  const mode = scale?.modes.find(item => item.modeId === request.modeId);
  if (!scale)
    issues.push({
      code: 'SOURCE_SCALE_REQUIRED',
      message: 'Select an authored source scale before adding intermediate positions.',
    });
  if (!context?.modeIds.includes(request.modeId) || !mode)
    issues.push({
      code: 'SOURCE_MODE_REQUIRED',
      message: 'The selected source mode must exist in both the scale and usage context.',
    });
  if (!scale || !mode || issues.length) return result(null);
  if (scale.slots.length + request.additions.length > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumSlots)
    fail('The extended scale would exceed 64 slots.');
  for (const addition of request.additions) {
    if (
      scale.slots.some(slot => slot.id === addition.slotId || slot.position === addition.position)
    )
      fail('An addition cannot reuse or replace a source slot ID or position.');
    if (
      addition.position <= scale.slots[0].position ||
      addition.position >= scale.slots[scale.slots.length - 1].position
    )
      fail('Only positions strictly inside the authored scale can be added.');
  }
  issues.push(...guidelineGenerationIssues(source, request.context, request.modeId));
  if (issues.length) return result(null);
  const brief: ColorSystemProposalRequestV1['brief'] = {
    briefHash: requestHash,
    operation: 'extend',
    contextIds: [request.context],
    modeIds: [request.modeId],
    permissions: {
      addColors: true,
      addFamilies: false,
      addScales: false,
      addRules: false,
      editFamilyIds: [scale.familyId],
      editScaleIds: [scale.id],
      replaceRuleIds: [],
    },
  };
  const slots = [
    ...scale.slots,
    ...request.additions.map(item => ({ id: item.slotId, position: item.position })),
  ].sort((a, b) => a.position - b.position);
  const structureProposal: ColorSystemProposalRequestV1 = {
    version: 'teul.color-system-proposal.v1',
    id: `gs:${requestHash.slice(7, 55)}`,
    sourceModelHash: source.modelHash,
    brief,
    derivation: {
      algorithmId: VERSION,
      algorithmVersion: '1',
      policyHash: guidelineHash(
        'Keep every source slot and anchor; declare only requested interior slots.'
      ),
      inputHash: requestHash,
      sourceColorIds: mode.anchors.map(item => item.colorId),
      sourceScaleIds: [scale.id],
    },
    colors: [],
    families: [],
    scales: [
      { id: scale.id, familyId: scale.familyId, label: scale.label, slots, modes: scale.modes },
    ],
    rules: [],
    exceptions: [],
  };
  const structure = buildColorSystemProposalV1(source, structureProposal);
  const constructionBrief: ColorSystemConstructionBriefV1 = {
    schemaVersion: 'teul.scale-construction-brief.v1',
    modelHash: structure.workingModel.modelHash,
    contextId: request.context,
    changeMode: 'extend',
    decision: {
      actor: { kind: 'user', ref: 'studio:local-extension-request' },
      authorityRef: reviewHash,
      decisionRef: requestHash,
    },
    scales: [
      {
        scaleId: scale.id,
        modeId: request.modeId,
        requiredSlotIds: slots.map(item => item.id),
        fillSlotIds: request.additions.map(item => item.slotId),
        lightnessOrder: request.lightnessOrder,
        endpoints: [],
      },
    ],
  };
  generation = {
    kind: 'construction',
    brief: constructionBrief,
    intent: {
      version: 'teul.construction-proposal.v1',
      id: `ge:${requestHash.slice(7, 55)}`,
      sourceModelHash: source.modelHash,
      brief,
      ...(decision ? { review: decision } : {}),
    },
    structureProposal,
  };
  return result(
    await buildColorSystemConstructionProposalV1(
      source,
      generation.brief,
      generation.intent,
      execution,
      generation.structureProposal
    )
  );
}

export function previewGuidelineExtension(
  review: Review,
  request: GuidelineExtensionRequest,
  execution?: ColorSystemConstructionExecutionV1
): Promise<GuidelineExtensionResult> {
  return execute(review, request, execution);
}

/** Replays the exact proposal before applying explicit decisions; never renews rules automatically. */
export async function reviewGuidelineExtension(
  review: Review,
  request: GuidelineExtensionRequest,
  input: GuidelineExtensionReview,
  execution?: ColorSystemConstructionExecutionV1
): Promise<GuidelineExtensionResult> {
  const decision = object(snapshotColorSystemInertJsonV1(input, { maximumBytes: 131072 }), [
    'reviewedProposalHash',
    'decisions',
  ]);
  if (
    typeof decision.reviewedProposalHash !== 'string' ||
    !hashPattern.test(decision.reviewedProposalHash)
  )
    fail('Review requires the exact preview proposal hash.');
  if (
    !Array.isArray(decision.decisions) ||
    !decision.decisions.length ||
    decision.decisions.length > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumRules
  )
    fail('Provide explicit bounded per-rule user decisions.');
  const ids = new Set<string>();
  for (const value of decision.decisions) {
    const item = object(value, ['ruleId', 'status', 'actor', 'authorityRef', 'decisionRef']);
    const actor = object(item.actor, ['kind', 'ref']);
    if (actor.kind !== 'user') fail('Studio renewal requires explicit user decisions.');
    text(actor.ref);
    const id = text(item.ruleId);
    if (ids.has(id)) fail('A rule can be reviewed only once per decision.');
    ids.add(id);
  }
  // Keep both replays bound to one detached request, including across cancellation/yield hooks.
  const stableReview = {
    model: captureColorSystemModelV1(review.model),
    reviewHash: review.reviewHash,
  };
  const stableRequest = parseRequest(request);
  const preview = await execute(stableReview, stableRequest, execution);
  if (preview.status === 'cancelled') return preview;
  if (preview.construction?.status !== 'proposed')
    fail('Only an available extension proposal can be reviewed.');
  if (preview.construction.proposal.proposalHash !== decision.reviewedProposalHash)
    fail('The extension changed. Review its current proposal before renewing decisions.');
  return execute(
    stableReview,
    stableRequest,
    execution,
    decision as unknown as GuidelineExtensionReview
  );
}
