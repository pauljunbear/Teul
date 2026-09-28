/** Recompute generation and complete applications before assessing an unqualified direction. */
import { COLOR_SYSTEM_MODEL_V1_LIMITS, captureColorSystemModelV1 } from './colorSystemModelV1';
import {
  buildColorSystemProposalV1,
  type ColorSystemProposalRequestV1,
  type ColorSystemProposalV1,
} from './colorSystemProposalV1';
import {
  buildColorSystemConstructionProposalV1,
  type ColorSystemConstructionProposalIntentV1,
  type ColorSystemConstructionProposalResultV1,
} from './colorSystemConstructionProposalV1';
import type { ColorSystemConstructionBriefV1 } from './colorSystemConstructionV1';
import {
  compileColorSystemCatalogProposalV1,
  type ColorSystemCatalogProposalIntentV1,
  type ColorSystemCatalogProposalMaterializedV1,
  type ColorSystemCatalogProposalRequestV1,
} from './colorSystemCatalogProposalV1';
import {
  buildColorSystemApplicationRequirementsV1,
  type ColorSystemApplicationRequirementsV1,
} from './colorSystemApplicationRequirementsV1';
import {
  compileColorSystemModelCompositionV1,
  COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS,
  type ColorSystemModelCompositionExecutionV1,
  type ColorSystemModelCompositionRequestV1,
} from './colorSystemModelCompositionV1';
import {
  compileColorSystemAuthoredCandidatesV1,
  type ColorSystemAuthoredCandidateAssessmentV1,
  type ColorSystemGeneratedUnitV1,
} from './colorSystemAuthoredCandidatesV1';
import {
  selectColorSystemModelInteractionsV1,
  enumerateColorSystemModelInteractionsV1,
  type ColorSystemModelInteractionsRequestV1,
  type ColorSystemModelInteractionsResultV1,
  type ColorSystemModelInteractionSelectionV1,
} from './colorSystemModelInteractionsV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';
import { utf8ByteLength } from './utf8';
import {
  buildColorSystemOverlayProposalV1,
  type ColorSystemOverlayProposalRequestV1,
  type ColorSystemOverlayProposalResultV1,
} from './colorSystemOverlayProposalV1';
import {
  parseColorSystemAuthoringRuleReviewPolicyV1,
  reviewColorSystemAuthoringSourceRulesV1,
  type ColorSystemAuthoringRuleReviewPolicyV1,
  type ColorSystemAuthoringRuleReviewV1,
} from './colorSystemAuthoringRuleReviewV1';

export const COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION = 'teul.authoring-direction.v1' as const;
export const COLOR_SYSTEM_AUTHORING_INTERACTION_ALTERNATIVES_V1_LIMIT = 64;
/** Explicitly defer the model identity until generation; never silently repair a supplied hash. */
export type ColorSystemAuthoringModelBindingV1<T extends { readonly modelHash: string }> =
  T | (Omit<T, 'modelHash'> & { readonly modelBinding: 'generated-model' });
export interface ColorSystemAuthoringDirectionV1 {
  readonly version: typeof COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION;
  readonly id: string;
  readonly generation:
    | { readonly kind: 'apply'; readonly proposal: ColorSystemProposalRequestV1 }
    | {
        readonly kind: 'construction';
        readonly brief: ColorSystemConstructionBriefV1;
        readonly intent: ColorSystemConstructionProposalIntentV1;
        readonly structureProposal?: ColorSystemProposalRequestV1;
      }
    | {
        readonly kind: 'catalog';
        readonly query: ColorSystemCatalogProposalRequestV1;
        readonly candidateId: string;
        readonly intent: ColorSystemCatalogProposalIntentV1;
      }
    | { readonly kind: 'overlay'; readonly proposal: ColorSystemOverlayProposalRequestV1 };
  readonly requirements: ColorSystemApplicationRequirementsV1;
  readonly composition: ColorSystemAuthoringModelBindingV1<ColorSystemModelCompositionRequestV1>;
  readonly units: readonly ColorSystemGeneratedUnitV1[];
  readonly provisionalRuleReview?: ColorSystemAuthoringRuleReviewPolicyV1;
  readonly interactionGroups?: readonly {
    readonly id: string;
    readonly request: ColorSystemAuthoringModelBindingV1<ColorSystemModelInteractionsRequestV1>;
    readonly bindings: readonly {
      readonly applicationId: string;
      readonly useId: string;
      readonly selection: 'rest' | 'hover' | 'pressed' | 'on-foreground';
    }[];
  }[];
}
type Generation =
  | { readonly kind: 'apply'; readonly proposal: ColorSystemProposalV1 }
  | { readonly kind: 'construction'; readonly result: ColorSystemConstructionProposalResultV1 }
  | { readonly kind: 'catalog'; readonly result: ColorSystemCatalogProposalMaterializedV1 }
  | { readonly kind: 'overlay'; readonly result: ColorSystemOverlayProposalResultV1 };
type Composition = Awaited<
  ReturnType<ReturnType<typeof compileColorSystemModelCompositionV1>['compose']>
>;
type Status = 'ready' | 'blocked' | 'incomplete' | 'infeasible' | 'search-limited' | 'cancelled';
interface InteractionAlternativesV1 {
  readonly maximumSelectionsPerGroup: number;
  readonly reason: 'preferred-states-rejected';
  readonly initialCompositionHash: string;
  readonly groups: readonly {
    readonly id: string;
    readonly request: ColorSystemModelInteractionsRequestV1;
    readonly result: Awaited<ReturnType<typeof enumerateColorSystemModelInteractionsV1>>;
  }[];
}
export interface ColorSystemAuthoringExecutionV1 {
  readonly version: typeof COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION;
  readonly id: string;
  readonly status: Status;
  readonly qualified: false;
  /** Local replay is evidence of execution, never source authority, approval or qualification. */
  readonly derivationStatus: 'recomputed-locally';
  readonly generation: Generation | null;
  /** Separate from the retained original generation and any human review. */
  readonly ruleReview?: ColorSystemAuthoringRuleReviewV1;
  readonly composition: Composition | null;
  readonly compositionRequest: ColorSystemModelCompositionRequestV1 | null;
  /** Initial preferred selections. Actual painted choices are in the final composition. */
  readonly interactions: readonly {
    readonly id: string;
    readonly request: ColorSystemModelInteractionsRequestV1;
    readonly result: ColorSystemModelInteractionsResultV1;
  }[];
  readonly interactionAlternatives?: InteractionAlternativesV1;
  readonly assessments: readonly ColorSystemAuthoredCandidateAssessmentV1[];
  readonly candidates: readonly ColorSystemAuthoredCandidateAssessmentV1[];
  readonly diagnostics: readonly {
    readonly stage: 'generation' | 'review' | 'interaction';
    readonly code: string;
    readonly reason: string;
  }[];
  readonly receipt: {
    readonly sourceModelHash: string;
    readonly requestHash: string;
    readonly requirementsHash: string;
    readonly generationHash: string | null;
    readonly ruleReviewHash?: string;
    readonly compositionHash: string | null;
    readonly compositionRequestHash: string | null;
    readonly interactionHashes: readonly string[];
    readonly interactionAlternativesHash?: string;
    readonly assessmentHashes: readonly string[];
    readonly status: Status;
    readonly receiptHash: string;
  };
}

const exactHash = (input: unknown) => deterministicContentHash(canonicalJson(input));
const limits = COLOR_SYSTEM_MODEL_V1_LIMITS;

function detach(input: unknown): unknown {
  try {
    return snapshotColorSystemInertJsonV1(input, {
      maximumBytes: limits.maximumBytes,
      maximumDepth: limits.maximumDepth,
      maximumNodes: limits.maximumNodes,
      maximumObjectKeys: limits.maximumEvidence,
      maximumArrayLength: COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS.assignments,
    });
  } catch (error) {
    throw new Error(
      `Invalid authoring input: ${error instanceof Error ? error.message : 'Unsupported inert input.'}`
    );
  }
}
function record(
  input: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Authoring expects a record.');
  const data = input as Record<string, unknown>;
  if (
    Object.keys(data).some(key => !required.includes(key) && !optional.includes(key)) ||
    required.some(key => !Object.prototype.hasOwnProperty.call(data, key))
  )
    throw new Error('Authoring has missing or unknown fields.');
  return data;
}
function list(input: unknown, maximum: number): unknown[] {
  if (!Array.isArray(input) || input.length > maximum)
    throw new Error('Authoring array exceeds its bound.');
  return input;
}

/** Structural/inert validation only; execution still verifies every source, scope and stage binding. */
export function parseColorSystemAuthoringDirectionV1(
  input: unknown
): ColorSystemAuthoringDirectionV1 {
  const root = record(
    detach(input),
    ['version', 'id', 'generation', 'requirements', 'composition', 'units'],
    ['interactionGroups', 'provisionalRuleReview']
  );
  if (
    root.version !== COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION ||
    typeof root.id !== 'string' ||
    !root.id.trim() ||
    root.id.length > limits.maximumId
  )
    throw new Error('Unsupported authoring version or invalid identity.');
  const generation = record(
    root.generation,
    ['kind'],
    ['proposal', 'brief', 'intent', 'structureProposal', 'query', 'candidateId']
  );
  if (generation.kind === 'apply' || generation.kind === 'overlay')
    record(generation, ['kind', 'proposal']);
  else if (generation.kind === 'construction') {
    record(generation, ['kind', 'brief', 'intent'], ['structureProposal']);
    record(generation.intent, ['version', 'id', 'sourceModelHash', 'brief'], ['review']);
  } else if (generation.kind === 'catalog') {
    record(generation, ['kind', 'query', 'candidateId', 'intent']);
    record(
      generation.intent,
      ['version', 'id', 'sourceModelHash', 'brief'],
      ['review', 'targetFamilyId']
    );
    if (
      typeof generation.candidateId !== 'string' ||
      !generation.candidateId.trim() ||
      generation.candidateId.length > limits.maximumId
    )
      throw new Error('Catalog candidate identity is invalid.');
  } else throw new Error('Unsupported authoring generation kind.');
  if (root.provisionalRuleReview !== undefined)
    root.provisionalRuleReview = parseColorSystemAuthoringRuleReviewPolicyV1(
      root.provisionalRuleReview
    );
  const compositionBinding = record(
    root.composition,
    [],
    [
      'version',
      'modelHash',
      'modelBinding',
      'requirementsHash',
      'groups',
      'maximumNodes',
      'maximumSolutions',
    ]
  );
  const composition = record(compositionBinding, [
    'version',
    'modelBinding' in compositionBinding ? 'modelBinding' : 'modelHash',
    'requirementsHash',
    'groups',
    'maximumNodes',
    'maximumSolutions',
  ]);
  if ('modelBinding' in composition && composition.modelBinding !== 'generated-model')
    throw new Error('Unknown composition model binding.');
  if (
    typeof composition.maximumSolutions !== 'number' ||
    !Number.isInteger(composition.maximumSolutions) ||
    composition.maximumSolutions < 1 ||
    composition.maximumSolutions > COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS.solutions
  )
    throw new Error('Authoring permits at most three complete solutions.');
  for (const item of list(composition.groups, COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS.groups)) {
    const group = record(item, ['id', 'options']);
    for (const item of list(
      group.options,
      COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS.optionsPerGroup
    )) {
      const option = record(item, ['id', 'assignments']);
      for (const item of list(
        option.assignments,
        COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS.assignments
      ))
        record(item, ['applicationId', 'useId', 'colorId']);
    }
  }
  for (const item of list(root.units, limits.maximumScales)) {
    const unit = record(
      item,
      ['id', 'contextId', 'familyId', 'prominence', 'jobs', 'anchors'],
      ['scaleId']
    );
    for (const anchor of list(unit.anchors, limits.maximumModes))
      record(anchor, ['modeId', 'colorId']);
  }
  for (const item of list(root.interactionGroups ?? [], 16)) {
    const group = record(item, ['id', 'request', 'bindings']);
    const interaction = record(
      group.request,
      [],
      [
        'version',
        'modelHash',
        'modelBinding',
        'contextId',
        'modeId',
        'role',
        'scales',
        'surfaceColorIds',
        'onForegroundColorIds',
      ]
    );
    record(interaction, [
      'version',
      'modelBinding' in interaction ? 'modelBinding' : 'modelHash',
      'contextId',
      'modeId',
      'role',
      'scales',
      'surfaceColorIds',
      'onForegroundColorIds',
    ]);
    if ('modelBinding' in interaction && interaction.modelBinding !== 'generated-model')
      throw new Error('Unknown interaction model binding.');
    if (typeof group.id !== 'string' || !group.id.trim() || group.id.length > limits.maximumId)
      throw new Error('Interaction group identity is invalid.');
    const bindings = list(group.bindings, COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS.assignments);
    if (!bindings.length) throw new Error('Interaction groups require explicit use bindings.');
    for (const item of bindings) {
      const binding = record(item, ['applicationId', 'useId', 'selection']);
      if (!['rest', 'hover', 'pressed', 'on-foreground'].includes(binding.selection as string))
        throw new Error('Unknown interaction selection binding.');
    }
  }
  return root as unknown as ColorSystemAuthoringDirectionV1;
}

function bindModel<T extends { readonly modelHash: string }>(
  request: ColorSystemAuthoringModelBindingV1<T>,
  modelHash: string
): T {
  if (!('modelBinding' in request)) return request;
  const { modelBinding: _binding, ...content } = request;
  return { ...content, modelHash } as unknown as T;
}

/** All caller data is inert and detached before the first execution hook. Stage hashes are checked, never repaired. */
export async function executeColorSystemAuthoringDirectionV1(
  sourceInput: unknown,
  inputValue: unknown,
  execution?: ColorSystemModelCompositionExecutionV1
): Promise<ColorSystemAuthoringExecutionV1> {
  const source = captureColorSystemModelV1(sourceInput);
  const request = parseColorSystemAuthoringDirectionV1(inputValue);
  const requirements = buildColorSystemApplicationRequirementsV1(request.requirements);
  const requestHash = exactHash(request),
    requirementsHash = exactHash(requirements);
  const runtime = execution ?? {
    isCancelled: () => false,
    yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
  };
  let generation: Generation | null = null;
  let composition: Composition | null = null;
  let compositionRequest: ColorSystemModelCompositionRequestV1 | null = null;
  let compositionRequestHash: string | null = null;
  const interactions: ColorSystemAuthoringExecutionV1['interactions'][number][] = [];
  let interactionAlternatives: InteractionAlternativesV1 | undefined;
  let generationHash: string | null = null;
  let ruleReview: ColorSystemAuthoringRuleReviewV1 | undefined;
  const assessments: ColorSystemAuthoredCandidateAssessmentV1[] = [];
  const diagnostics: ColorSystemAuthoringExecutionV1['diagnostics'][number][] = [];
  const finish = (status: Status): ColorSystemAuthoringExecutionV1 => {
    const cancelled = status === 'cancelled';
    const keptAssessments = cancelled ? [] : assessments;
    const receipt = {
      sourceModelHash: source.modelHash,
      requestHash,
      requirementsHash,
      generationHash,
      ...(ruleReview ? { ruleReviewHash: exactHash(ruleReview) } : {}),
      compositionHash: composition ? exactHash(composition) : null,
      compositionRequestHash,
      interactionHashes: interactions.map(item => exactHash(item)),
      ...(interactionAlternatives
        ? { interactionAlternativesHash: exactHash(interactionAlternatives) }
        : {}),
      assessmentHashes: keptAssessments.map(item => item.assessmentHash),
      status,
    };
    return {
      version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
      id: request.id,
      status,
      qualified: false,
      derivationStatus: 'recomputed-locally',
      generation: cancelled ? null : generation,
      ...(!cancelled && ruleReview ? { ruleReview } : {}),
      composition: cancelled ? null : composition,
      compositionRequest: cancelled ? null : compositionRequest,
      interactions: cancelled ? [] : interactions,
      ...(!cancelled && interactionAlternatives ? { interactionAlternatives } : {}),
      assessments: keptAssessments,
      candidates: cancelled ? [] : assessments.filter(item => item.eligible),
      diagnostics,
      receipt: { ...receipt, receiptHash: exactHash(receipt) },
    };
  };
  if (runtime.isCancelled()) return finish('cancelled');
  let proposal: ColorSystemProposalV1;
  const selected = request.generation;
  if (selected.kind === 'apply') {
    proposal = buildColorSystemProposalV1(source, selected.proposal);
    if (proposal.request.brief.operation !== 'apply')
      throw new Error('Apply generation requires the unchanged apply operation.');
    generation = { kind: 'apply', proposal };
  } else if (selected.kind === 'construction') {
    const result = await buildColorSystemConstructionProposalV1(
      source,
      selected.brief,
      selected.intent,
      runtime,
      selected.structureProposal
    );
    generation = { kind: 'construction', result };
    generationHash = exactHash(generation);
    if (result.status !== 'proposed') return finish(result.status);
    proposal = result.proposal;
  } else if (selected.kind === 'overlay') {
    const result = await buildColorSystemOverlayProposalV1(source, selected.proposal, runtime);
    generation = { kind: 'overlay', result };
    generationHash = exactHash(generation);
    if (result.status !== 'proposed' || !result.proposal)
      return finish(result.status === 'proposed' ? 'blocked' : result.status);
    proposal = result.proposal;
  } else {
    const session = await compileColorSystemCatalogProposalV1(source, selected.query, runtime);
    if (session.status === 'cancelled') return finish('cancelled');
    if (session.status === 'invalid-query') {
      diagnostics.push({
        stage: 'generation',
        code: 'CATALOG_QUERY_BLOCKED',
        reason: session.message,
      });
      generationHash = exactHash(session);
      return finish('blocked');
    }
    if (!session.retrieval.candidates.some(candidate => candidate.id === selected.candidateId)) {
      diagnostics.push({
        stage: 'generation',
        code: 'CATALOG_CANDIDATE_UNAVAILABLE',
        reason: 'The selected candidate is absent from the enabled, recomputed provider results.',
      });
      generationHash = exactHash({ catalog: session.catalog, candidateId: selected.candidateId });
      return finish('blocked');
    }
    const result = session.materialize(selected.candidateId, selected.intent);
    generation = { kind: 'catalog', result };
    proposal = result.proposal;
  }
  generationHash ??= exactHash(generation);
  if (runtime.isCancelled()) return finish('cancelled');
  if (request.provisionalRuleReview) {
    try {
      ruleReview = reviewColorSystemAuthoringSourceRulesV1(
        source,
        proposal,
        request.generation,
        request.provisionalRuleReview
      );
      proposal = ruleReview.proposal;
    } catch (error) {
      diagnostics.push({
        stage: 'review',
        code: 'PROVISIONAL_RULE_REVIEW_BLOCKED',
        reason: error instanceof Error ? error.message : 'The provisional rule review failed.',
      });
      return finish('blocked');
    }
    if (runtime.isCancelled()) return finish('cancelled');
  }
  const workingModel = captureColorSystemModelV1(proposal.workingModel);
  const recordPendingRuleReview = () => {
    if (!composition || composition.status === 'cancelled') return false;
    const pending = (composition.diagnostics.pendingRuleIds ?? []).filter(ruleId =>
      proposal.pendingRuleIds.includes(ruleId)
    );
    if (!pending.length) return false;
    diagnostics.push({
      stage: 'review',
      code: 'SOURCE_RULE_REVIEW_REQUIRED',
      reason: `Actual attempted applications were blocked by pending decisions for these predicates: ${pending.join(', ')}. Review them before interpreting the remaining search results.`,
    });
    return true;
  };
  const baseComposition = bindModel(request.composition, workingModel.modelHash);
  const interactionGroups = request.interactionGroups?.map(group => ({
    ...group,
    request: bindModel(group.request, workingModel.modelHash),
  }));
  const addedGroups: ColorSystemModelCompositionRequestV1['groups'][number][] = [];
  const assignmentsFor = (
    group: NonNullable<ColorSystemAuthoringDirectionV1['interactionGroups']>[number],
    selection: ColorSystemModelInteractionSelectionV1
  ) => {
    const assignments: ColorSystemModelCompositionRequestV1['groups'][number]['options'][number]['assignments'][number][] =
      [];
    for (const binding of group.bindings) {
      const color =
        binding.selection === 'on-foreground'
          ? selection.onForeground
          : selection.states[binding.selection];
      if (!color) return null;
      assignments.push({
        applicationId: binding.applicationId,
        useId: binding.useId,
        colorId: color.colorId,
      });
    }
    return assignments;
  };
  for (const group of interactionGroups ?? []) {
    for (const binding of group.bindings) {
      const application = requirements.templates.find(item => item.id === binding.applicationId);
      if (
        !application?.uses.some(use => use.id === binding.useId) ||
        application.contextId !== group.request.contextId ||
        application.modeId !== group.request.modeId
      )
        throw new Error(
          'Interaction bindings require an actual use in the same explicit context and mode.'
        );
    }
    await runtime.yield();
    if (runtime.isCancelled()) return finish('cancelled');
    const result = await selectColorSystemModelInteractionsV1(workingModel, group.request, runtime);
    interactions.push({ id: group.id, request: group.request, result });
    if (runtime.isCancelled() || result.status === 'cancelled') return finish('cancelled');
    if (result.status !== 'ready') return finish(result.status);
    const assignments = assignmentsFor(group, result.selection);
    if (!assignments) {
      diagnostics.push({
        stage: 'interaction',
        code: 'INTERACTION_BINDING_UNAVAILABLE',
        reason: 'This selector produced no on-foreground color for the requested actual use.',
      });
      return finish('infeasible');
    }
    addedGroups.push({ id: group.id, options: [{ id: 'selected', assignments }] });
  }
  const compiled = compileColorSystemModelCompositionV1(workingModel, requirements, {
    ...baseComposition,
    groups: [...baseComposition.groups, ...addedGroups],
  });
  compositionRequest = compiled.request;
  compositionRequestHash = compiled.requestHash;
  composition = await compiled.compose(runtime);
  if (runtime.isCancelled() || composition.status === 'cancelled') return finish('cancelled');
  // Preferences order the initial attempt. They are not permission to discard other
  // admitted state sets when complete source/application constraints reject that attempt.
  if (
    (composition.status === 'infeasible' || composition.status === 'search-limited') &&
    interactionGroups?.length
  ) {
    const expanded: ColorSystemModelCompositionRequestV1['groups'][number][] = [];
    const groups: InteractionAlternativesV1['groups'][number][] = [];
    // Keep the expanded product inside the composer's existing assignment bound.
    // A reduced retention cap remains explicit in each enumeration receipt.
    const baseAssignments = baseComposition.groups.reduce(
      (count, group) =>
        count + group.options.reduce((sum, option) => sum + option.assignments.length, 0),
      0
    );
    const longestColorId = Math.max(...workingModel.colors.map(color => color.id.length));
    let fixedBytes = utf8ByteLength(canonicalJson(baseComposition));
    let bytesPerOptionSet = 0;
    for (const group of interactionGroups) {
      fixedBytes += utf8ByteLength(canonicalJson({ id: group.id, options: [] })) + 1;
      bytesPerOptionSet +=
        utf8ByteLength(
          canonicalJson({
            id: 'alternative:63',
            assignments: group.bindings.map(binding => ({
              applicationId: binding.applicationId,
              useId: binding.useId,
              colorId: 'x'.repeat(longestColorId),
            })),
          })
        ) + 1;
    }
    const maximumSelections = Math.min(
      COLOR_SYSTEM_AUTHORING_INTERACTION_ALTERNATIVES_V1_LIMIT,
      Math.floor(
        (COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS.maximumBytes - fixedBytes) / bytesPerOptionSet
      ),
      Math.floor(
        (COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS.assignments - baseAssignments) /
          interactionGroups.reduce((count, group) => count + group.bindings.length, 0)
      )
    );
    if (maximumSelections < 1) {
      recordPendingRuleReview();
      diagnostics.push({
        stage: 'interaction',
        code: 'INTERACTION_SEARCH_LIMITED',
        reason:
          'The preferred states failed the complete application; expanding their alternatives would exceed the composition size bound.',
      });
      return finish('search-limited');
    }
    interactionAlternatives = {
      maximumSelectionsPerGroup: maximumSelections,
      reason: 'preferred-states-rejected',
      initialCompositionHash: exactHash(composition),
      groups,
    };
    for (const group of interactionGroups) {
      const result = await enumerateColorSystemModelInteractionsV1(
        workingModel,
        group.request,
        maximumSelections,
        runtime
      );
      groups.push({ id: group.id, request: group.request, result });
      if (runtime.isCancelled() || result.status === 'cancelled') return finish('cancelled');
      if (result.status !== 'ready') {
        recordPendingRuleReview();
        return finish(result.status);
      }
      const paintedOptions = new Set<string>();
      const options = result.selections.flatMap((selection, index) => {
        const assignments = assignmentsFor(group, selection);
        if (!assignments) return [];
        const paintHash = exactHash(assignments);
        if (paintedOptions.has(paintHash)) return [];
        paintedOptions.add(paintHash);
        return [{ id: `alternative:${index}`, assignments }];
      });
      expanded.push({ id: group.id, options });
    }
    const fallback = compileColorSystemModelCompositionV1(workingModel, requirements, {
      ...baseComposition,
      groups: [...baseComposition.groups, ...expanded],
    });
    compositionRequest = fallback.request;
    compositionRequestHash = fallback.requestHash;
    composition = await fallback.compose(runtime);
    if (runtime.isCancelled() || composition.status === 'cancelled') return finish('cancelled');
    if (composition.status === 'infeasible' && groups.some(group => group.result.truncated)) {
      recordPendingRuleReview();
      diagnostics.push({
        stage: 'interaction',
        code: 'INTERACTION_SEARCH_LIMITED',
        reason:
          'The retained state alternatives did not satisfy the complete application. Additional mathematically feasible choices remain beyond the recorded limit.',
      });
      return finish('search-limited');
    }
  }
  if (composition.status !== 'ready') {
    // Keep genuine bounded/incomplete search status; observed gaps cannot prove every alternative blocked.
    if (recordPendingRuleReview() && composition.exhausted) return finish('blocked');
    return finish(composition.status);
  }
  const assessor = compileColorSystemAuthoredCandidatesV1(source, requirements);
  for (const solution of composition.solutions) {
    await runtime.yield();
    if (runtime.isCancelled()) return finish('cancelled');
    assessments.push(
      assessor.assess({
        id: `direction:${exactHash([request.id, solution.solutionHash]).slice(7)}`,
        proposal: proposal.request,
        units: request.units,
        applications: solution.applications,
      })
    );
  }
  if (runtime.isCancelled()) return finish('cancelled');
  return finish(
    assessments.some(item => item.eligible)
      ? 'ready'
      : composition.stopped === 'search-limit'
        ? 'search-limited'
        : 'blocked'
  );
}
