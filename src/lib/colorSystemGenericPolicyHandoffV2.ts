import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import type { ColorSystemBrandConstraintsV1 } from './colorSystemBrandConstraintsV1';
import type {
  ColorSystemAgentAdoptionV1,
  ColorSystemJobV2,
  ColorSystemSectionDispositionV2,
  ColorSystemSectionRoleV2,
} from './colorSystemBuilderV2Contracts';
import {
  assertColorSystemGenericSourceSnapshotV2Integrity,
  type ColorSystemGenericSourceSnapshotV2,
  type GenericModeRefV2,
  type GenericSourceGapV2,
} from './colorSystemGenericSourceAdapterV2';
import {
  assertColorSystemGenericIntentProposalV2Integrity,
  assertColorSystemGenericPolicyDecisionV2Integrity,
  type GenericAgentAdoptionV1,
  type GenericAgentAdoptedSectionDecisionV1,
  type GenericConfirmedSectionDecisionV2,
  type GenericGeneratedPolarityDecisionV2,
  type GenericIntakeProposalV2,
  type GenericOwnerConfirmationV2,
  type GenericPolicyDecisionV2,
  type GenericSectionDecisionsV2,
  type GenericRuleV2,
} from './colorSystemGenericIntentPolicyV2';
import { compareText } from './utils';

export const COLOR_SYSTEM_GENERIC_POLICY_HANDOFF_V2_VERSION =
  'teul-color-system-generic-policy-handoff/v2.0' as const;
export const COLOR_SYSTEM_GENERIC_SOURCE_COMPILER_POLICY_V2_VERSION =
  'teul-color-system-generic-source-compiler-policy/v2.0' as const;
export const COLOR_SYSTEM_GENERIC_CONSTRAINED_HANDOFF_V2_VERSION =
  'teul-color-system-generic-policy-handoff/v2.1' as const;
export const COLOR_SYSTEM_GENERIC_CONSTRAINED_COMPILER_POLICY_V2_VERSION =
  'teul-color-system-generic-source-compiler-policy/v2.1' as const;
export const COLOR_SYSTEM_GENERIC_AGENT_HANDOFF_V1_VERSION =
  'teul-color-system-generic-agent-policy-handoff/v1' as const;
export const COLOR_SYSTEM_GENERIC_AGENT_COMPILER_POLICY_V1_VERSION =
  'teul-color-system-generic-agent-source-compiler-policy/v1' as const;

const HASH = /^sha256:[0-9a-f]{64}$/;

export interface GenericSourceLockV2 {
  lockId: string;
  role: ColorSystemSectionRoleV2;
  sourceRefId: string;
  valueHash: string;
  authority: 'observed';
  observedRuleIds: readonly string[];
  ownerDecisionRuleId?: string;
  policyDecisionRuleId?: string;
  evidenceIds: readonly string[];
}

export interface GenericBrandConstraintV2 {
  constraintId: string;
  role: ColorSystemSectionRoleV2;
  kind: 'protected-source' | 'allowed-jobs' | 'omitted-section';
  disposition: ColorSystemSectionDispositionV2;
  sourceRefIds: readonly string[];
  jobs: readonly ColorSystemJobV2[];
  authority: 'owner-confirmed' | 'agent-adopted';
  adoption?: ColorSystemAgentAdoptionV1;
  evidenceIds: readonly string[];
}

export interface GenericProfileSupportV2 {
  documentProfile: ColorSystemGenericSourceSnapshotV2['documentProfile'];
  engine: 'srgb-color-system-v2';
  status: 'supported' | 'blocked';
}

export interface ColorSystemGenericPolicyHandoffV2 {
  schemaVersion: 'teul.color-system.generic-policy-handoff.v2';
  handoffPolicyVersion:
    | typeof COLOR_SYSTEM_GENERIC_POLICY_HANDOFF_V2_VERSION
    | typeof COLOR_SYSTEM_GENERIC_CONSTRAINED_HANDOFF_V2_VERSION
    | typeof COLOR_SYSTEM_GENERIC_AGENT_HANDOFF_V1_VERSION;
  sourceCompilerPolicyVersion:
    | typeof COLOR_SYSTEM_GENERIC_SOURCE_COMPILER_POLICY_V2_VERSION
    | typeof COLOR_SYSTEM_GENERIC_CONSTRAINED_COMPILER_POLICY_V2_VERSION
    | typeof COLOR_SYSTEM_GENERIC_AGENT_COMPILER_POLICY_V1_VERSION;
  adapterVersion: string;
  inferencePolicyVersion: GenericIntakeProposalV2['inferencePolicyVersion'];
  confirmationPolicyVersion: GenericPolicyDecisionV2['confirmationPolicyVersion'];
  adoption?: ColorSystemAgentAdoptionV1;
  sourceSnapshotHash: string;
  proposalHash: string;
  confirmationHash: string;
  readiness: 'ready' | 'blocked';
  sourceLocks: readonly GenericSourceLockV2[];
  sectionIntents: GenericSectionDecisionsV2;
  generatedPolarity: GenericGeneratedPolarityDecisionV2 | null;
  brandConstraints: readonly GenericBrandConstraintV2[];
  reviewedBrandConstraints?: ColorSystemBrandConstraintsV1;
  supportedModes: readonly GenericModeRefV2[];
  profileSupport: GenericProfileSupportV2;
  governingRules: readonly GenericRuleV2[];
  blockedConsumers: readonly GenericSourceGapV2[];
  insufficiencies: readonly GenericSourceGapV2[];
  handoffHash: string;
}

export type ColorSystemGenericPolicyHandoffV2ErrorCode =
  | 'INVALID_GENERIC_POLICY_HANDOFF'
  | 'GENERIC_SOURCE_STALE'
  | 'UNAUTHORIZED_GENERIC_GOVERNANCE'
  | 'GENERIC_POLICY_HANDOFF_HASH_MISMATCH';

export class ColorSystemGenericPolicyHandoffV2Error extends Error {
  constructor(
    readonly code: ColorSystemGenericPolicyHandoffV2ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ColorSystemGenericPolicyHandoffV2Error';
  }
}

function fail(code: ColorSystemGenericPolicyHandoffV2ErrorCode, message: string): never {
  throw new ColorSystemGenericPolicyHandoffV2Error(code, message);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function ownerDecisionRule(
  decision: GenericConfirmedSectionDecisionV2,
  confirmation: GenericOwnerConfirmationV2
): GenericRuleV2 {
  return {
    ruleId: `generic-rule:owner-confirmed:${decision.role}:${confirmation.confirmationHash}`,
    statement: `The owner confirmed the ${decision.role} disposition, source selection, and bounded jobs for this exact proposal.`,
    status: 'owner-confirmed',
    evidenceIds: uniqueSorted([...decision.evidenceIds, confirmation.confirmationHash]),
    counterevidenceIds: [],
    consumerIds: uniqueSorted([decision.role, ...decision.jobs]),
    confidence: 'not-applicable',
    sourceRefIds: uniqueSorted(decision.sourceRefIds),
  };
}

function ownerPolarityRule(
  polarity: GenericGeneratedPolarityDecisionV2,
  confirmation: GenericOwnerConfirmationV2
): GenericRuleV2 {
  return {
    ruleId: `generic-rule:owner-confirmed:generated-polarity:${confirmation.confirmationHash}`,
    statement:
      'The owner confirmed distinct generated Secondary contribution identities for negative and positive diverging meanings.',
    status: 'owner-confirmed',
    evidenceIds: uniqueSorted([...polarity.evidenceIds, confirmation.confirmationHash]),
    counterevidenceIds: [],
    consumerIds: ['data-visualization', 'diverging-data'],
    confidence: 'not-applicable',
    sourceRefIds: [],
  };
}

function agentDecisionRule(
  decision: GenericAgentAdoptedSectionDecisionV1,
  adoption: GenericAgentAdoptionV1
): GenericRuleV2 {
  return {
    ruleId: `generic-rule:agent-adopted:${decision.role}:${adoption.confirmationHash}`,
    statement: `The agent adopted the ${decision.role} disposition, source selection, and bounded jobs for generation, review, and export of this exact proposal. Owner acceptance and document creation remain separate.`,
    status: 'agent-adopted',
    adoption: adoption.adoption,
    evidenceIds: uniqueSorted([...decision.evidenceIds, adoption.confirmationHash]),
    counterevidenceIds: [],
    consumerIds: uniqueSorted([decision.role, ...decision.jobs]),
    confidence: 'not-applicable',
    sourceRefIds: uniqueSorted(decision.sourceRefIds),
  };
}

function activeConsumers(decisions: GenericSectionDecisionsV2): ReadonlySet<string> {
  return new Set(
    decisions
      .filter(decision => decision.disposition !== 'omit')
      .flatMap(decision => [decision.role, ...decision.jobs])
  );
}

function blockedByGap(gap: GenericSourceGapV2, active: ReadonlySet<string>): boolean {
  return gap.consumerIds.some(
    consumerId =>
      active.has(consumerId) ||
      ['all', 'source-compiler', 'color-system-builder'].includes(consumerId)
  );
}

function dedupeGaps(gaps: readonly GenericSourceGapV2[]): GenericSourceGapV2[] {
  const byId = new Map<string, GenericSourceGapV2>();
  gaps.forEach(gap => {
    const existing = byId.get(gap.gapId);
    if (existing && canonicalJson(existing) !== canonicalJson(gap)) {
      fail(
        'INVALID_GENERIC_POLICY_HANDOFF',
        `Gap ${gap.gapId} has contradictory payloads in the confirmed proposal.`
      );
    }
    byId.set(gap.gapId, gap);
  });
  return [...byId.values()].sort((left, right) => compareText(left.gapId, right.gapId));
}

function sourceLocks(
  proposal: GenericIntakeProposalV2,
  decisions: GenericSectionDecisionsV2,
  ownerRules: readonly GenericRuleV2[]
): GenericSourceLockV2[] {
  const refs = new Map(proposal.observedSourceRefs.map(ref => [ref.sourceRefId, ref]));
  const observedRulesByRef = new Map<string, string[]>();
  proposal.ruleLedger
    .filter(rule => rule.status === 'observed')
    .forEach(rule => {
      rule.sourceRefIds.forEach(sourceRefId => {
        const ruleIds = observedRulesByRef.get(sourceRefId) ?? [];
        ruleIds.push(rule.ruleId);
        observedRulesByRef.set(sourceRefId, ruleIds);
      });
    });
  return decisions
    .filter(decision => decision.disposition === 'preserve')
    .flatMap(decision => {
      const ownerRule = ownerRules.find(rule => rule.consumerIds.includes(decision.role));
      if (!ownerRule || ownerRule.status !== decision.status) {
        fail(
          'UNAUTHORIZED_GENERIC_GOVERNANCE',
          `${decision.role} has no exact ${decision.status} decision rule.`
        );
      }
      return decision.sourceRefIds.map(sourceRefId => {
        const ref = refs.get(sourceRefId);
        const observedRuleIds = uniqueSorted(observedRulesByRef.get(sourceRefId) ?? []);
        if (!ref || observedRuleIds.length === 0) {
          fail(
            'UNAUTHORIZED_GENERIC_GOVERNANCE',
            `${decision.role} source lock ${sourceRefId} is not backed by an observed source fact.`
          );
        }
        return {
          lockId: `generic-lock:${decision.role}:${sourceRefId}`,
          role: decision.role,
          sourceRefId,
          valueHash: ref.valueHash,
          authority: 'observed' as const,
          observedRuleIds,
          ...(decision.status === 'owner-confirmed'
            ? { ownerDecisionRuleId: ownerRule.ruleId }
            : { policyDecisionRuleId: ownerRule.ruleId }),
          evidenceIds: uniqueSorted([...ref.evidenceIds, ...decision.evidenceIds]),
        };
      });
    })
    .sort((left, right) => compareText(left.lockId, right.lockId));
}

function brandConstraints(
  decisions: GenericSectionDecisionsV2,
  ownerRules: readonly GenericRuleV2[]
): GenericBrandConstraintV2[] {
  return decisions.map(decision => {
    const ownerRule = ownerRules.find(rule => rule.consumerIds.includes(decision.role));
    if (!ownerRule || ownerRule.status !== decision.status) {
      fail(
        'UNAUTHORIZED_GENERIC_GOVERNANCE',
        `${decision.role} constraint has no ${decision.status} rule.`
      );
    }
    return {
      constraintId: `generic-constraint:${decision.role}`,
      role: decision.role,
      kind:
        decision.disposition === 'omit'
          ? 'omitted-section'
          : decision.disposition === 'preserve'
            ? 'protected-source'
            : 'allowed-jobs',
      disposition: decision.disposition,
      sourceRefIds: uniqueSorted(decision.sourceRefIds),
      jobs: uniqueSorted(decision.jobs) as ColorSystemJobV2[],
      authority: decision.status,
      ...(ownerRule.adoption ? { adoption: ownerRule.adoption } : {}),
      evidenceIds: [ownerRule.ruleId],
    };
  });
}

function supportedModes(snapshot: ColorSystemGenericSourceSnapshotV2): GenericModeRefV2[] {
  const modes = snapshot.collections.flatMap(collection => collection.modes);
  const identities = modes.map(mode => `${mode.collectionId}\u0000${mode.modeId}`);
  if (new Set(identities).size !== identities.length) {
    fail('INVALID_GENERIC_POLICY_HANDOFF', 'Collection-local mode identities must be unique.');
  }
  return [...modes].sort(
    (left, right) =>
      compareText(left.collectionId, right.collectionId) ||
      left.order - right.order ||
      compareText(left.modeId, right.modeId)
  );
}

function validateGoverningRules(
  rules: readonly GenericRuleV2[],
  adoption?: ColorSystemAgentAdoptionV1
): void {
  if (
    rules.some(rule =>
      rule.status === 'observed'
        ? rule.adoption !== undefined
        : adoption
          ? rule.status !== 'agent-adopted' ||
            canonicalJson(rule.adoption) !== canonicalJson(adoption)
          : rule.status !== 'owner-confirmed' || rule.adoption !== undefined
    )
  ) {
    fail(
      'UNAUTHORIZED_GENERIC_GOVERNANCE',
      'Governing rules must preserve observed facts and the exact decision authority; owner and agent decisions cannot be mixed.'
    );
  }
  if (new Set(rules.map(rule => rule.ruleId)).size !== rules.length) {
    fail('INVALID_GENERIC_POLICY_HANDOFF', 'Governing rule identities must be unique.');
  }
}

/**
 * Pure policy handoff. This function has no Figma, network, storage, clock, or
 * company-specific branch and cannot create colors; it only carries observed
 * locks and exact decisions forward. Agent adoption grants no creation authority.
 */
export function compileColorSystemGenericPolicyHandoffV2(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  proposal: GenericIntakeProposalV2,
  confirmation: GenericPolicyDecisionV2
): ColorSystemGenericPolicyHandoffV2 {
  assertColorSystemGenericSourceSnapshotV2Integrity(snapshot);
  assertColorSystemGenericIntentProposalV2Integrity(snapshot, proposal);
  assertColorSystemGenericPolicyDecisionV2Integrity(snapshot, proposal, confirmation);
  if (
    confirmation.sourceSnapshotHash !== snapshot.sourceSnapshotHash ||
    confirmation.proposalHash !== proposal.proposalHash
  ) {
    fail(
      'GENERIC_SOURCE_STALE',
      'The confirmed generic policy does not bind the exact current source and proposal hashes.'
    );
  }

  const adoption =
    confirmation.schemaVersion === 'teul.color-system.generic-agent-adoption.v1'
      ? confirmation.adoption
      : undefined;
  const ownerRules =
    confirmation.schemaVersion === 'teul.color-system.generic-agent-adoption.v1'
      ? confirmation.sectionDecisions.map(decision => agentDecisionRule(decision, confirmation))
      : confirmation.sectionDecisions.map(decision => ownerDecisionRule(decision, confirmation));
  const generatedPolarityRule = confirmation.generatedPolarity
    ? ownerPolarityRule(confirmation.generatedPolarity, confirmation)
    : null;
  const selectedRefs = new Set(
    confirmation.sectionDecisions.flatMap(decision => decision.sourceRefIds)
  );
  const observedRules = proposal.ruleLedger.filter(
    rule =>
      rule.status === 'observed' &&
      rule.sourceRefIds.some(sourceRefId => selectedRefs.has(sourceRefId))
  );
  const governingRules = [
    ...observedRules,
    ...ownerRules,
    ...(generatedPolarityRule ? [generatedPolarityRule] : []),
  ].sort((left, right) => compareText(left.ruleId, right.ruleId));
  validateGoverningRules(governingRules, adoption);

  const active = activeConsumers(confirmation.sectionDecisions);
  const blockedConsumers = dedupeGaps([
    ...snapshot.unsupported,
    ...proposal.contradictions.filter(gap => !gap.gapId.startsWith('generic-intent-conflict:')),
  ]);
  const profileSupport: GenericProfileSupportV2 = {
    documentProfile: snapshot.documentProfile,
    engine: 'srgb-color-system-v2',
    status: snapshot.documentProfile === 'srgb' ? 'supported' : 'blocked',
  };
  const readiness: ColorSystemGenericPolicyHandoffV2['readiness'] =
    profileSupport.status === 'blocked' || blockedConsumers.some(gap => blockedByGap(gap, active))
      ? 'blocked'
      : 'ready';
  const sectionIntents = confirmation.sectionDecisions;
  const content = {
    schemaVersion: 'teul.color-system.generic-policy-handoff.v2' as const,
    handoffPolicyVersion: adoption
      ? COLOR_SYSTEM_GENERIC_AGENT_HANDOFF_V1_VERSION
      : confirmation.reviewedBrandConstraints
        ? COLOR_SYSTEM_GENERIC_CONSTRAINED_HANDOFF_V2_VERSION
        : COLOR_SYSTEM_GENERIC_POLICY_HANDOFF_V2_VERSION,
    sourceCompilerPolicyVersion: adoption
      ? COLOR_SYSTEM_GENERIC_AGENT_COMPILER_POLICY_V1_VERSION
      : confirmation.reviewedBrandConstraints
        ? COLOR_SYSTEM_GENERIC_CONSTRAINED_COMPILER_POLICY_V2_VERSION
        : COLOR_SYSTEM_GENERIC_SOURCE_COMPILER_POLICY_V2_VERSION,
    adapterVersion: snapshot.adapterVersion,
    inferencePolicyVersion: confirmation.inferencePolicyVersion,
    confirmationPolicyVersion: confirmation.confirmationPolicyVersion,
    ...(adoption ? { adoption } : {}),
    sourceSnapshotHash: snapshot.sourceSnapshotHash,
    proposalHash: proposal.proposalHash,
    confirmationHash: confirmation.confirmationHash,
    readiness,
    sourceLocks: sourceLocks(proposal, sectionIntents, ownerRules),
    sectionIntents,
    generatedPolarity: confirmation.generatedPolarity,
    brandConstraints: brandConstraints(sectionIntents, ownerRules),
    ...(confirmation.reviewedBrandConstraints
      ? { reviewedBrandConstraints: confirmation.reviewedBrandConstraints }
      : {}),
    supportedModes: supportedModes(snapshot),
    profileSupport,
    governingRules,
    blockedConsumers,
    insufficiencies: proposal.insufficiencies,
  };
  return { ...content, handoffHash: deterministicContentHash(content) };
}

export function assertColorSystemGenericPolicyHandoffV2Integrity(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  proposal: GenericIntakeProposalV2,
  confirmation: GenericPolicyDecisionV2,
  handoff: ColorSystemGenericPolicyHandoffV2
): void {
  if (!HASH.test(handoff.handoffHash)) {
    fail('GENERIC_POLICY_HANDOFF_HASH_MISMATCH', 'Generic handoff hash is invalid.');
  }
  validateGoverningRules(handoff.governingRules, handoff.adoption);
  const rebuilt = compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, confirmation);
  if (canonicalJson(rebuilt) !== canonicalJson(handoff)) {
    fail(
      'GENERIC_POLICY_HANDOFF_HASH_MISMATCH',
      'Generic handoff is stale, mutated, or not derived from the exact hash chain.'
    );
  }
}
