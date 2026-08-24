import {
  auditColorSystem,
  canonicalJson,
  createSourceSystemSnapshot,
  deterministicContentHash,
} from './colorSystemAudit';
import type {
  ColorSystemAudit,
  ColorSystemProposal,
  ProposalBlocker,
  ProposalCandidateStatus,
  ProposalStrategy,
  SourceSystemSnapshot,
} from '../types/colorSystemAudit';
import { COLOR_SYSTEM_REVIEW_ASSIGNABLE_ROLES } from '../types/colorSystemAudit';
import type { EnabledLibraryVariableDescriptorMessage } from '../types/messages';
import { compareText } from './utils';

export const COLOR_SYSTEM_AUDIT_EXPORT_SCHEMA_VERSION = 'teul-color-system-audit/v1' as const;

export interface ColorSystemAuditReviewerDecision {
  kind: 'anchor' | 'intended-surface' | 'role' | 'omission';
  subjectId: string;
  disposition: 'confirmed' | 'rejected' | 'omitted';
  assignmentSource?: 'source-evidence' | 'reviewer-assigned';
  note?: string;
}

/** Hash-bound statement of whether the exported analysis covered its requested scope. */
export interface ColorSystemAuditExportCompleteness {
  partial: boolean;
  cancelled: boolean;
  scannedNodeCount: number;
}

export interface ColorSystemAuditExportInput {
  snapshot: SourceSystemSnapshot;
  audit: ColorSystemAudit;
  proposal?: ColorSystemProposal;
  proposalOutcome?: {
    status: ProposalCandidateStatus;
    strategy: ProposalStrategy;
    blockers?: readonly ProposalBlocker[];
  };
  enabledLibraryDescriptors?: readonly EnabledLibraryVariableDescriptorMessage[];
  reviewerDecisions?: readonly ColorSystemAuditReviewerDecision[];
  libraryBoundaryNote?: string;
  completeness?: ColorSystemAuditExportCompleteness;
  exportedAt?: string;
}

export interface ColorSystemAuditExportDocument {
  schemaVersion: typeof COLOR_SYSTEM_AUDIT_EXPORT_SCHEMA_VERSION;
  sourceHash: string;
  auditHash: string;
  proposalHash?: string;
  outputHash: string;
  exportedAt: string;
  snapshot: SourceSystemSnapshot;
  audit: ColorSystemAudit;
  proposal?: ColorSystemProposal;
  proposalOutcome?: {
    status: ProposalCandidateStatus;
    strategy: ProposalStrategy;
    blockers: readonly ProposalBlocker[];
  };
  enabledLibraryDescriptors: readonly EnabledLibraryVariableDescriptorMessage[];
  reviewerDecisions: readonly ColorSystemAuditReviewerDecision[];
  libraryBoundaryNote?: string;
  completeness: ColorSystemAuditExportCompleteness;
  policies: {
    snapshotSchemaVersion: string;
    auditEngineVersion: string;
    diagnosticPolicyVersion: string;
    proposalSchemaVersion?: string;
    proposalStrategyVersion?: string;
  };
}

function canonicalCompleteness(
  completeness: ColorSystemAuditExportCompleteness | undefined
): ColorSystemAuditExportCompleteness {
  const result = completeness ?? {
    partial: false,
    cancelled: false,
    scannedNodeCount: 0,
  };
  if (typeof result.partial !== 'boolean' || typeof result.cancelled !== 'boolean') {
    throw new Error('Export completeness flags must be booleans.');
  }
  if (!Number.isSafeInteger(result.scannedNodeCount) || result.scannedNodeCount < 0) {
    throw new Error('Export scannedNodeCount must be a non-negative safe integer.');
  }
  if (result.cancelled && !result.partial) {
    throw new Error('A cancelled retained audit export must be marked partial.');
  }
  return {
    partial: result.partial,
    cancelled: result.cancelled,
    scannedNodeCount: result.scannedNodeCount,
  };
}

function canonicalDecisions(
  decisions: readonly ColorSystemAuditReviewerDecision[]
): ColorSystemAuditReviewerDecision[] {
  return [...decisions]
    .map(decision => ({ ...decision }))
    .sort((left, right) =>
      compareText(
        `${left.kind}:${left.subjectId}:${left.disposition}:${left.assignmentSource ?? ''}:${left.note ?? ''}`,
        `${right.kind}:${right.subjectId}:${right.disposition}:${right.assignmentSource ?? ''}:${right.note ?? ''}`
      )
    );
}

function canonicalLibraries(
  descriptors: readonly EnabledLibraryVariableDescriptorMessage[]
): EnabledLibraryVariableDescriptorMessage[] {
  return [...descriptors]
    .map(descriptor => ({
      ...descriptor,
      variables: [...descriptor.variables].sort((left, right) =>
        compareText(`${left.name}:${left.key}`, `${right.name}:${right.key}`)
      ),
    }))
    .sort((left, right) =>
      compareText(
        `${left.libraryName}:${left.collectionName}:${left.collectionKey}`,
        `${right.libraryName}:${right.collectionName}:${right.collectionKey}`
      )
    );
}

function assertReviewerDecisions(input: ColorSystemAuditExportInput): void {
  const tokenById = new Map(input.snapshot.tokens.map(token => [token.id, token]));
  const intendedSurfaces = new Set([
    'product-primitives',
    'product-semantics',
    'marketing',
    'data-visualization',
    'illustration',
  ]);
  const omissionSubjects = new Set([
    ...input.audit.moduleCoverage.map(item => item.module),
    ...input.audit.unresolvedQuestions,
  ]);
  const seen = new Set<string>();
  for (const decision of input.reviewerDecisions ?? []) {
    const key = `${decision.kind}\u0000${decision.subjectId}`;
    if (seen.has(key)) {
      throw new Error(`Reviewer decision ${decision.kind}:${decision.subjectId} is duplicated.`);
    }
    seen.add(key);
    if (decision.kind !== 'role' && decision.assignmentSource !== undefined) {
      throw new Error(
        `Reviewer decision ${decision.kind}:${decision.subjectId} cannot declare a role assignment source.`
      );
    }
    let supported = false;
    if (decision.kind === 'anchor') {
      supported = tokenById.has(decision.subjectId);
    } else if (decision.kind === 'intended-surface') {
      supported = intendedSurfaces.has(decision.subjectId);
    } else if (decision.kind === 'omission') {
      supported = omissionSubjects.has(decision.subjectId);
    } else {
      const separator = decision.subjectId.lastIndexOf(':');
      const tokenId = separator > 0 ? decision.subjectId.slice(0, separator) : '';
      const role =
        separator > 0
          ? decision.subjectId
              .slice(separator + 1)
              .trim()
              .toLowerCase()
          : '';
      const token = tokenById.get(tokenId);
      if (decision.assignmentSource === 'reviewer-assigned') {
        supported =
          decision.disposition === 'confirmed' &&
          Boolean(token) &&
          (COLOR_SYSTEM_REVIEW_ASSIGNABLE_ROLES as readonly string[]).includes(role);
      } else {
        supported = Boolean(
          token?.roleEvidence.some(evidence => evidence.role.trim().toLowerCase() === role)
        );
      }
    }
    if (!supported) {
      throw new Error(
        `Reviewer decision ${decision.kind}:${decision.subjectId} is not present in the audited source or policy.`
      );
    }
  }
}

function exportHashPayload(
  input: ColorSystemAuditExportInput,
  completeness: ColorSystemAuditExportCompleteness
): unknown {
  const { capturedAt: _capturedAt, authorization, ...stableSnapshot } = input.snapshot;
  return {
    schemaVersion: COLOR_SYSTEM_AUDIT_EXPORT_SCHEMA_VERSION,
    sourceHash: input.snapshot.sourceHash,
    auditHash: input.audit.auditHash,
    ...(input.proposal ? { proposalHash: input.proposal.proposalHash } : {}),
    snapshot: {
      ...stableSnapshot,
      authorization: {
        status: authorization.status,
        ...(authorization.rightsNote ? { rightsNote: authorization.rightsNote } : {}),
      },
    },
    audit: input.audit,
    ...(input.proposal ? { proposal: input.proposal } : {}),
    ...(input.proposalOutcome
      ? {
          proposalOutcome: {
            ...input.proposalOutcome,
            blockers: [...(input.proposalOutcome.blockers ?? [])],
          },
        }
      : {}),
    enabledLibraryDescriptors: canonicalLibraries(input.enabledLibraryDescriptors ?? []),
    reviewerDecisions: canonicalDecisions(input.reviewerDecisions ?? []),
    ...(input.libraryBoundaryNote ? { libraryBoundaryNote: input.libraryBoundaryNote } : {}),
    completeness,
  };
}

export function createColorSystemAuditExport(
  input: ColorSystemAuditExportInput
): ColorSystemAuditExportDocument {
  assertReviewerDecisions(input);
  const completeness = canonicalCompleteness(input.completeness);
  if (createSourceSystemSnapshot(input.snapshot).sourceHash !== input.snapshot.sourceHash) {
    throw new Error('Exported snapshot failed deterministic source-hash revalidation.');
  }
  if (input.audit.sourceHash !== input.snapshot.sourceHash) {
    throw new Error('Audit source hash does not match the exported snapshot.');
  }
  const { auditHash: _auditHash, ...auditContent } = input.audit;
  if (deterministicContentHash(auditContent) !== input.audit.auditHash) {
    throw new Error('Exported audit failed deterministic audit-hash revalidation.');
  }
  if (auditColorSystem(input.snapshot).auditHash !== input.audit.auditHash) {
    throw new Error('Exported audit failed deterministic audit-hash revalidation.');
  }
  if (input.proposal && input.proposal.sourceHash !== input.snapshot.sourceHash) {
    throw new Error('Proposal source hash does not match the exported snapshot.');
  }
  if (input.proposal) {
    const { proposalHash: _proposalHash, ...proposalContent } = input.proposal;
    if (deterministicContentHash(proposalContent) !== input.proposal.proposalHash) {
      throw new Error('Exported proposal failed deterministic proposal-hash revalidation.');
    }
  }
  if (input.proposalOutcome) {
    if (input.proposalOutcome.status === 'no-solution' && !input.proposalOutcome.blockers?.length) {
      throw new Error('A no-solution export must retain at least one typed blocker.');
    }
    if (
      input.proposal &&
      (input.proposalOutcome.status !== input.proposal.status ||
        input.proposalOutcome.strategy !== input.proposal.strategy)
    ) {
      throw new Error('Proposal outcome does not match the exported proposal.');
    }
  }
  return {
    schemaVersion: COLOR_SYSTEM_AUDIT_EXPORT_SCHEMA_VERSION,
    sourceHash: input.snapshot.sourceHash,
    auditHash: input.audit.auditHash,
    ...(input.proposal ? { proposalHash: input.proposal.proposalHash } : {}),
    outputHash: deterministicContentHash(exportHashPayload(input, completeness)),
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    snapshot: input.snapshot,
    audit: input.audit,
    ...(input.proposal ? { proposal: input.proposal } : {}),
    ...(input.proposalOutcome
      ? {
          proposalOutcome: {
            ...input.proposalOutcome,
            blockers: [...(input.proposalOutcome.blockers ?? [])],
          },
        }
      : {}),
    enabledLibraryDescriptors: canonicalLibraries(input.enabledLibraryDescriptors ?? []),
    reviewerDecisions: canonicalDecisions(input.reviewerDecisions ?? []),
    ...(input.libraryBoundaryNote ? { libraryBoundaryNote: input.libraryBoundaryNote } : {}),
    completeness,
    policies: {
      snapshotSchemaVersion: input.snapshot.schemaVersion,
      auditEngineVersion: input.audit.engineVersion,
      diagnosticPolicyVersion: input.audit.diagnosticPolicyVersion,
      ...(input.proposal
        ? {
            proposalSchemaVersion: input.proposal.schemaVersion,
            proposalStrategyVersion: input.proposal.strategyVersion,
          }
        : {}),
    },
  };
}

/** Safe JSON for download, clipboard, or inert text rendering. */
export function serializeColorSystemAuditExport(document: ColorSystemAuditExportDocument): string {
  return canonicalJson(document)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
