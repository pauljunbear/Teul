/** One common brief, bounded independent replay, then the shared feasibility/diversity ranking. */
import { captureColorSystemModelV1 } from './colorSystemModelV1';
import {
  executeColorSystemAuthoringDirectionV1,
  COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
  type ColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringExecutionV1,
} from './colorSystemAuthoringExecutionV1';
import {
  compileColorSystemAuthoredCandidatesV1,
  type ColorSystemAuthoredCandidateExecutionV1,
} from './colorSystemAuthoredCandidatesV1';
import {
  buildColorSystemApplicationRequirementsV1,
  type ColorSystemApplicationRequirementsV1,
} from './colorSystemApplicationRequirementsV1';
import {
  buildColorSystemProposalV1,
  COLOR_SYSTEM_PROPOSAL_V1_VERSION,
  type ColorSystemProposalRequestV1,
} from './colorSystemProposalV1';
import {
  snapshotColorSystemInertJsonV1,
  COLOR_SYSTEM_INERT_JSON_V1_LIMITS,
} from './colorSystemInertJsonV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';

export const COLOR_SYSTEM_AUTHORING_RUN_V1_VERSION = 'teul.authoring-run.v1' as const;
export const COLOR_SYSTEM_AUTHORING_RUN_V1_LIMITS = Object.freeze({
  directions: 8,
  rawSolutions: 24,
});
export interface ColorSystemAuthoringRunRequestV1 {
  readonly version: typeof COLOR_SYSTEM_AUTHORING_RUN_V1_VERSION;
  readonly id: string;
  readonly requirements: ColorSystemApplicationRequirementsV1;
  readonly brief: ColorSystemProposalRequestV1['brief'];
  readonly directions: readonly Omit<ColorSystemAuthoringDirectionV1, 'requirements'>[];
}
type Ranking = Awaited<
  ReturnType<ReturnType<typeof compileColorSystemAuthoredCandidatesV1>['rankAsync']>
>;
export interface ColorSystemAuthoringRunV1 {
  readonly version: typeof COLOR_SYSTEM_AUTHORING_RUN_V1_VERSION;
  readonly id: string;
  readonly status: 'ready' | 'blocked' | 'cancelled';
  readonly qualified: false;
  readonly executions: readonly ColorSystemAuthoringExecutionV1[];
  readonly ranking: Ranking | null;
  readonly directions: Ranking['directions'];
  readonly receipt: {
    readonly sourceModelHash: string;
    readonly requestHash: string;
    readonly requirementsHash: string;
    readonly briefHash: string;
    readonly briefContractHash: string;
    readonly executionReceiptHashes: readonly string[];
    readonly rankingHash: string | null;
    readonly status: 'ready' | 'blocked' | 'cancelled';
    readonly receiptHash: string;
  };
}
const exactHash = (value: unknown) => deterministicContentHash(canonicalJson(value));
function record(
  input: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Authoring run requires a data record.');
  const result = input as Record<string, unknown>;
  if (
    Object.keys(result).some(key => !required.includes(key) && !optional.includes(key)) ||
    required.some(key => !Object.prototype.hasOwnProperty.call(result, key))
  )
    throw new Error('Authoring run has missing or unknown fields.');
  return result;
}
function id(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 128)
    throw new Error('Authoring run identity must be bounded nonblank text.');
  return input;
}

/** The common input is detached before hooks; no returned partial run can qualify or be displayed. */
export async function executeColorSystemAuthoringRunV1(
  sourceInput: unknown,
  input: unknown,
  execution?: ColorSystemAuthoredCandidateExecutionV1
): Promise<ColorSystemAuthoringRunV1> {
  const source = captureColorSystemModelV1(sourceInput);
  const root = record(
    snapshotColorSystemInertJsonV1(input, {
      maximumBytes:
        COLOR_SYSTEM_AUTHORING_RUN_V1_LIMITS.directions *
        COLOR_SYSTEM_INERT_JSON_V1_LIMITS.maximumBytes,
      maximumNodes:
        COLOR_SYSTEM_AUTHORING_RUN_V1_LIMITS.directions *
        COLOR_SYSTEM_INERT_JSON_V1_LIMITS.maximumNodes,
    }),
    ['version', 'id', 'requirements', 'brief', 'directions']
  );
  if (root.version !== COLOR_SYSTEM_AUTHORING_RUN_V1_VERSION)
    throw new Error('Unsupported authoring run version.');
  const runId = id(root.id);
  const requirements = buildColorSystemApplicationRequirementsV1(root.requirements);
  const normalizeBrief = (brief: unknown) =>
    buildColorSystemProposalV1(source, {
      version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
      id: 'run-brief-validation',
      sourceModelHash: source.modelHash,
      brief,
      derivation: {
        algorithmId: 'teul.run-brief-validation',
        algorithmVersion: COLOR_SYSTEM_AUTHORING_RUN_V1_VERSION,
        policyHash: exactHash(COLOR_SYSTEM_AUTHORING_RUN_V1_VERSION),
        inputHash: exactHash(brief),
        sourceColorIds: [],
        sourceScaleIds: [],
      },
      colors: [],
      families: [],
      scales: [],
      rules: [],
      exceptions: [],
    }).request.brief;
  const brief = normalizeBrief(root.brief);
  const briefContractHash = exactHash(brief);
  // Each child carries this exact authored contract, so one semantic validation suffices.
  const declaredBrief = canonicalJson(root.brief);
  if (
    !Array.isArray(root.directions) ||
    !root.directions.length ||
    root.directions.length > COLOR_SYSTEM_AUTHORING_RUN_V1_LIMITS.directions
  )
    throw new Error('Authoring run requires one through eight directions.');
  const directions = root.directions.map(item => {
    const direction = record(
      item,
      ['version', 'id', 'generation', 'composition', 'units'],
      ['interactionGroups', 'provisionalRuleReview']
    );
    if (direction.version !== COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION)
      throw new Error('Unsupported direction version.');
    id(direction.id);
    const generation = record(
      direction.generation,
      ['kind'],
      ['proposal', 'brief', 'intent', 'structureProposal', 'query', 'candidateId']
    );
    let nested: Record<string, unknown>;
    if (generation.kind === 'apply' || generation.kind === 'overlay') {
      record(generation, ['kind', 'proposal']);
      nested = generation.proposal as Record<string, unknown>;
    } else if (generation.kind === 'construction') {
      record(generation, ['kind', 'brief', 'intent'], ['structureProposal']);
      nested = generation.intent as Record<string, unknown>;
    } else if (generation.kind === 'catalog') {
      record(generation, ['kind', 'query', 'candidateId', 'intent']);
      nested = generation.intent as Record<string, unknown>;
    } else throw new Error('Unsupported run generation kind.');
    if (!nested || typeof nested !== 'object' || nested.sourceModelHash !== source.modelHash)
      throw new Error('Every direction must bind the same current source model.');
    if (canonicalJson(nested.brief) !== declaredBrief)
      throw new Error('Directions must share the complete common brief and change permissions.');
    if (
      generation.kind === 'catalog' &&
      (!generation.query ||
        typeof generation.query !== 'object' ||
        (generation.query as Record<string, unknown>).sourceModelHash !== source.modelHash)
    )
      throw new Error('Every catalog query must bind the same current source model.');
    if (generation.structureProposal !== undefined) {
      const structure = generation.structureProposal as Record<string, unknown>;
      if (
        !structure ||
        typeof structure !== 'object' ||
        structure.sourceModelHash !== source.modelHash ||
        canonicalJson(structure.brief) !== declaredBrief
      )
        throw new Error('Structure drafts must share the source and common brief.');
    }
    return { ...direction, requirements } as unknown as ColorSystemAuthoringDirectionV1;
  });
  if (new Set(directions.map(direction => direction.id)).size !== directions.length)
    throw new Error('Authoring direction IDs must be unique.');
  const requestHash = exactHash(root),
    requirementsHash = exactHash(requirements);
  const runtime = execution ?? {
    isCancelled: () => false,
    yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
  };
  const executions: ColorSystemAuthoringExecutionV1[] = [];
  let ranking: Ranking | null = null;
  const finish = (status: ColorSystemAuthoringRunV1['status']): ColorSystemAuthoringRunV1 => {
    const cancelled = status === 'cancelled';
    const receipt = {
      sourceModelHash: source.modelHash,
      requestHash,
      requirementsHash,
      briefHash: brief.briefHash,
      briefContractHash,
      executionReceiptHashes: executions.map(item => item.receipt.receiptHash),
      rankingHash: ranking ? exactHash(ranking) : null,
      status,
    };
    return {
      version: COLOR_SYSTEM_AUTHORING_RUN_V1_VERSION,
      id: runId,
      status,
      qualified: false,
      executions: cancelled ? [] : executions,
      ranking: cancelled ? null : ranking,
      directions: cancelled ? [] : (ranking?.directions ?? []),
      receipt: { ...receipt, receiptHash: exactHash(receipt) },
    };
  };
  for (const direction of directions) {
    if (runtime.isCancelled()) return finish('cancelled');
    await runtime.yield();
    if (runtime.isCancelled()) return finish('cancelled');
    const result = await executeColorSystemAuthoringDirectionV1(source, direction, runtime);
    if (runtime.isCancelled() || result.status === 'cancelled') return finish('cancelled');
    executions.push(result);
  }
  const candidates = executions.flatMap(result =>
    result.assessments.map(assessment => ({
      id: assessment.id,
      proposal: assessment.proposal.request,
      units: assessment.units,
      applications: assessment.applications.applications.map(item => item.application),
    }))
  );
  if (candidates.length > COLOR_SYSTEM_AUTHORING_RUN_V1_LIMITS.rawSolutions)
    throw new Error('Authoring run exceeds twenty-four complete solutions.');
  ranking = await compileColorSystemAuthoredCandidatesV1(source, requirements).rankAsync(
    candidates,
    runtime
  );
  if (runtime.isCancelled() || ranking.status === 'cancelled') return finish('cancelled');
  return finish(ranking.status === 'ready' ? 'ready' : 'blocked');
}
