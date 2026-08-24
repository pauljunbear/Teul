import { deterministicContentHash } from './colorSystemAudit';
import type {
  ColorSystemProposal,
  ColorSystemVisualizationSettings,
  ConfirmedColorSystemAnchor,
  ProposalReviewerRoleDecision,
  SourceSystemSnapshot,
} from '../types/colorSystemAudit';
import {
  COLOR_SYSTEM_APPROVAL_POLICY_VERSION,
  COLOR_SYSTEM_REVIEW_POLICY_VERSION,
} from '../types/colorSystemAudit';
import { compareText } from './utils';

export interface ColorSystemDecisionReceiptInput {
  snapshot: Pick<SourceSystemSnapshot, 'sourceHash'>;
  proposal: Pick<
    ColorSystemProposal,
    'engineVersion' | 'schemaVersion' | 'strategyVersion' | 'proposalHash'
  >;
  confirmedAnchors: readonly ConfirmedColorSystemAnchor[];
  intendedSurfaces: readonly string[];
  roleDecisions: readonly ProposalReviewerRoleDecision[];
  visualizationSettings?: ColorSystemVisualizationSettings;
}

function canonicalAnchor(anchor: ConfirmedColorSystemAnchor): string {
  return `${anchor.tokenId}\u0000${anchor.mode}\u0000${anchor.hex.toLowerCase()}`;
}

function decisionHash(
  policyVersion:
    | typeof COLOR_SYSTEM_REVIEW_POLICY_VERSION
    | typeof COLOR_SYSTEM_APPROVAL_POLICY_VERSION,
  input: ColorSystemDecisionReceiptInput
): string {
  return deterministicContentHash({
    policyVersion,
    engineVersion: input.proposal.engineVersion,
    proposalSchemaVersion: input.proposal.schemaVersion,
    strategyVersion: input.proposal.strategyVersion,
    sourceHash: input.snapshot.sourceHash,
    proposalHash: input.proposal.proposalHash,
    confirmedAnchors: input.confirmedAnchors
      .map(anchor => ({
        tokenId: anchor.tokenId,
        mode: anchor.mode,
        hex: anchor.hex.toLowerCase(),
      }))
      .sort((left, right) => compareText(canonicalAnchor(left), canonicalAnchor(right))),
    intendedSurfaces: [...new Set(input.intendedSurfaces)].sort(),
    roleDecisions: [...input.roleDecisions]
      .map(decision => ({
        tokenId: decision.tokenId,
        role: decision.role.toLowerCase(),
        disposition: decision.disposition,
        assignmentSource: decision.assignmentSource ?? 'source-evidence',
      }))
      .sort((left, right) =>
        compareText(
          `${left.tokenId}\u0000${left.role}\u0000${left.disposition}\u0000${left.assignmentSource}`,
          `${right.tokenId}\u0000${right.role}\u0000${right.disposition}\u0000${right.assignmentSource}`
        )
      ),
    visualizationSettings: input.visualizationSettings
      ? {
          ...input.visualizationSettings,
          surfaceHex: input.visualizationSettings.surfaceHex.toLowerCase(),
          ...(input.visualizationSettings.boundaryHex
            ? { boundaryHex: input.visualizationSettings.boundaryHex.toLowerCase() }
            : {}),
        }
      : null,
  });
}

export function createColorSystemReviewHash(input: ColorSystemDecisionReceiptInput): string {
  return decisionHash(COLOR_SYSTEM_REVIEW_POLICY_VERSION, input);
}

export function createColorSystemApprovalHash(input: ColorSystemDecisionReceiptInput): string {
  return decisionHash(COLOR_SYSTEM_APPROVAL_POLICY_VERSION, input);
}
