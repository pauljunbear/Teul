import { guidelineHash } from './review';
import type { GuidelineExtensionResult, GuidelineExtensionReview } from './extension';

export type GuidelineRuleDecisions = Record<string, 'accepted' | 'rejected' | ''>;

/** Bind explicit decisions to this exact proposal; never carry an older approval forward. */
export function createGuidelineExtensionDecision(
  reviewHash: string,
  preview: GuidelineExtensionResult,
  decisions: GuidelineRuleDecisions
): GuidelineExtensionReview {
  if (preview.construction?.status !== 'proposed') throw new Error('Preview the extension first.');
  return createGuidelineRuleDecision(
    reviewHash,
    {
      proposalHash: preview.construction.proposal.proposalHash,
      pendingRuleIds: preview.pendingRuleIds,
    },
    decisions
  );
}

export function createGuidelineRuleDecision(
  reviewHash: string,
  proposal: { proposalHash: string; pendingRuleIds: readonly string[] },
  decisions: GuidelineRuleDecisions,
  actorRef = 'studio:extension-rule-review'
): GuidelineExtensionReview {
  const proposalHash = proposal.proposalHash;
  return {
    reviewedProposalHash: proposalHash,
    decisions: proposal.pendingRuleIds.map(ruleId => {
      const status = decisions[ruleId];
      if (status !== 'accepted')
        throw new Error('This extension remains unapproved. Source rules are unchanged.');
      return {
        ruleId,
        status,
        actor: { kind: 'user', ref: actorRef },
        authorityRef: reviewHash,
        decisionRef: guidelineHash({ proposalHash, ruleId, status }),
      };
    }),
  };
}
