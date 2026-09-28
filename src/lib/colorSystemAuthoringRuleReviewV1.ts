/** Explicit provisional decisions over unchanged, previously accepted source predicates. */
import { COLOR_SYSTEM_MODEL_V1_LIMITS, type ColorSystemModelV1 } from './colorSystemModelV1';
import { buildColorSystemProposalV1, type ColorSystemProposalV1 } from './colorSystemProposalV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';

const VERSION = 'teul.provisional-source-rule-review.v1' as const;
export interface ColorSystemAuthoringRuleReviewPolicyV1 {
  readonly version: typeof VERSION;
  readonly sourceModelHash: string;
  /** Binds the exact generation request, so refinements cannot inherit this authorization. */
  readonly generationRequestHash: string;
  readonly briefContractHash: string;
  /** Decisions renew complete predicates, including source contexts/modes outside this application. */
  readonly decisionScope: 'whole-source-predicates';
  /** Exact application scope; these fields do not narrow the whole-predicate decision scope. */
  readonly contextIds: readonly string[];
  readonly modeIds: readonly string[];
  /** Whole existing source predicates, with their original scope and meaning unchanged. */
  readonly ruleIds: readonly string[];
  readonly actor: { readonly kind: 'agent'; readonly ref: string };
  readonly authorityRef: string;
  readonly decisionRef: string;
}
export interface ColorSystemAuthoringRuleReviewV1 {
  readonly version: typeof VERSION;
  readonly qualified: false;
  readonly policy: ColorSystemAuthoringRuleReviewPolicyV1;
  readonly policyHash: string;
  readonly originalProposalHash: string;
  readonly originalWorkingModelHash: string;
  /** Full decision coverage and fresh dependency bindings, separate from the application scope. */
  readonly renewedRules: readonly {
    readonly ruleId: string;
    readonly ruleHash: string;
    readonly dependencyHash: string;
    readonly contextIds: readonly string[];
    readonly modeIds: readonly string[];
  }[];
  /** Fresh review binds the actual generated proposal; generation itself remains untouched. */
  readonly proposal: ColorSystemProposalV1;
}
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
function fail(reason: string): never {
  throw new Error(`Provisional source-rule review: ${reason}`);
}
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Expected a record.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value)))
    fail('Missing or unsupported policy fields.');
  return value;
}
function text(value: unknown, maximum: number = COLOR_SYSTEM_MODEL_V1_LIMITS.maximumId): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    fail('Expected bounded nonblank identity.');
  return value as string;
}
function ids(value: unknown, maximum: number): readonly string[] {
  if (!Array.isArray(value) || !value.length || value.length > maximum)
    fail('A nonempty bounded identity list is required.');
  const items = (value as unknown[]).map(item => text(item));
  if (new Set(items).size !== items.length) fail('Repeated policy identities are unsupported.');
  return items;
}
const sameIds = (a: readonly string[], b: readonly string[]) =>
  canonicalJson([...a].sort()) === canonicalJson([...b].sort());

export function parseColorSystemAuthoringRuleReviewPolicyV1(
  input: unknown
): ColorSystemAuthoringRuleReviewPolicyV1 {
  const value = record(snapshotColorSystemInertJsonV1(input), [
    'version',
    'sourceModelHash',
    'generationRequestHash',
    'briefContractHash',
    'decisionScope',
    'contextIds',
    'modeIds',
    'ruleIds',
    'actor',
    'authorityRef',
    'decisionRef',
  ]);
  if (value.version !== VERSION) fail('Unsupported policy version.');
  if (value.decisionScope !== 'whole-source-predicates')
    fail('Explicit whole-source-predicate decision scope is required.');
  for (const key of ['sourceModelHash', 'generationRequestHash', 'briefContractHash'])
    if (!/^sha256:[0-9a-f]{64}$/.test(text(value[key]))) fail('Invalid policy hash.');
  ids(value.contextIds, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumContexts);
  ids(value.modeIds, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumModes);
  ids(value.ruleIds, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumRules);
  const actor = record(value.actor, ['kind', 'ref']);
  if (actor.kind !== 'agent') fail('This policy records agent decisions, never owner approval.');
  text(actor.ref);
  text(value.authorityRef, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumText);
  text(value.decisionRef, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumText);
  return value as unknown as ColorSystemAuthoringRuleReviewPolicyV1;
}

/** Rematerialization adds decisions only: no generation, selection, paint changes or rule edits. */
export function reviewColorSystemAuthoringSourceRulesV1(
  source: ColorSystemModelV1,
  original: ColorSystemProposalV1,
  generationRequest: unknown,
  policyInput: unknown
): ColorSystemAuthoringRuleReviewV1 {
  const policy = parseColorSystemAuthoringRuleReviewPolicyV1(policyInput);
  const brief = original.request.brief;
  if (policy.sourceModelHash !== source.modelHash || original.sourceModelHash !== source.modelHash)
    fail('The source changed; declare a new policy against the current source.');
  if (policy.generationRequestHash !== hash(generationRequest))
    fail('The generation request changed; its old review policy cannot be reused.');
  if (policy.briefContractHash !== hash(brief))
    fail('The complete brief or change permissions changed; declare a new review policy.');
  if (!sameIds(policy.contextIds, brief.contextIds) || !sameIds(policy.modeIds, brief.modeIds))
    fail('The policy must name the exact application context and mode scope.');
  if (original.request.review)
    fail('An existing proposal review cannot be overwritten by a provisional review policy.');
  if (original.request.rules.length || original.request.exceptions.length)
    fail('Changed, replaced or new predicates require a separate explicit proposal review.');
  const decisions = policy.ruleIds.map(ruleId => {
    const rule = source.rules.find(item => item.id === ruleId);
    const current = original.workingModel.rules.find(item => item.id === ruleId);
    if (!rule || !current || canonicalJson(rule) !== canonicalJson(current))
      fail('Every enumerated rule must retain its complete original predicate and scope.');
    if (source.adoptions.find(item => item.ruleId === ruleId)?.status !== 'accepted')
      fail('Only previously accepted source predicates may use this renewal policy.');
    if (
      !rule.contextIds.some(id => policy.contextIds.includes(id)) ||
      !rule.modeIds.some(id => policy.modeIds.includes(id))
    )
      fail('An enumerated rule is outside the declared application scope.');
    return {
      ruleId,
      status: 'accepted' as const,
      actor: policy.actor,
      authorityRef: policy.authorityRef,
      decisionRef: policy.decisionRef,
    };
  });
  const proposal = buildColorSystemProposalV1(source, {
    ...original.request,
    review: { reviewedProposalHash: original.proposalHash, decisions },
  });
  if (proposal.proposalHash !== original.proposalHash || proposal.reviewStatus !== 'current')
    fail('Fresh review did not bind the exact generated proposal.');
  const renewedRules = policy.ruleIds.map(ruleId => {
    const rule = proposal.workingModel.rules.find(item => item.id === ruleId)!;
    // The existing proposal builder computes these hashes against the unchanged whole rule
    // and its actual generated dependencies; do not manufacture a narrower adoption here.
    const adoption = proposal.workingModel.adoptions.find(item => item.ruleId === ruleId)!;
    return {
      ruleId,
      ruleHash: adoption.ruleHash,
      dependencyHash: adoption.dependencyHash,
      contextIds: [...rule.contextIds],
      modeIds: [...rule.modeIds],
    };
  });
  return {
    version: VERSION,
    qualified: false,
    policy,
    policyHash: hash(policy),
    originalProposalHash: original.proposalHash,
    originalWorkingModelHash: original.workingModel.modelHash,
    renewedRules,
    proposal,
  };
}
