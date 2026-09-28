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
  const proposalHash = preview.construction.proposal.proposalHash;
  return {
    reviewedProposalHash: proposalHash,
    decisions: preview.pendingRuleIds.map(ruleId => {
      const status = decisions[ruleId];
      if (status !== 'accepted')
        throw new Error('This extension remains unapproved. Source rules are unchanged.');
      return {
        ruleId,
        status,
        actor: { kind: 'user', ref: 'studio:extension-rule-review' },
        authorityRef: reviewHash,
        decisionRef: guidelineHash({ proposalHash, ruleId, status }),
      };
    }),
  };
}
