import { canonicalJson, deterministicContentHash } from './colorSystemAudit';
import {
  createColorSystemAuditExport,
  type ColorSystemAuditExportCompleteness,
} from './colorSystemAuditExport';
import { createColorSystemApprovalHash, createColorSystemReviewHash } from './colorSystemApproval';
import { composeColorSystemObjectiveModules } from './colorSystemObjectiveModules';
import {
  buildColorSystemOutputBlueprint,
  type ColorSystemOutputBlueprint,
} from './colorSystemOutputBlueprint';
import type {
  ColorSystemStrategyCandidate,
  ColorSystemStrategyDirection,
  ColorSystemStrategySet,
} from './colorSystemStrategyBuilder';
import { compileColorSystemStrategyProposal } from './colorSystemStrategyProposal';
import { compareText } from './utils';
import { utf8ByteLength } from './utf8';
import { validateColorSystemBuilderPackageCore } from './colorSystemAuditMessageValidation';
import type {
  ColorSystemAudit,
  ColorSystemProposal,
  ColorSystemVisualizationSettings,
  ConfirmedColorSystemAnchor,
  ProposalReviewerRoleDecision,
  SourceSystemSnapshot,
} from '../types/colorSystemAudit';

export const COLOR_SYSTEM_BUILDER_PACKAGE_SCHEMA_VERSION =
  'teul-color-system-builder-package/v1' as const;
export const COLOR_SYSTEM_BUILDER_SELECTION_RECEIPT_VERSION =
  'teul-color-system-builder-selection/v1' as const;
export const MAX_COLOR_SYSTEM_BUILDER_PACKAGE_BYTES = 8 * 1024 * 1024;

const COMPOSED_OBJECTIVES = ['product-primitives', 'product-semantics'] as const;
const REVIEWED_SURFACES = [
  'data-visualization',
  'product-primitives',
  'product-semantics',
] as const;

export interface ColorSystemBuilderPackageDecision {
  reviewHash: string;
  confirmedAnchorTokenIds: readonly string[];
  confirmedAnchors: readonly ConfirmedColorSystemAnchor[];
  intendedSurfaces: readonly string[];
  roleDecisions: readonly ProposalReviewerRoleDecision[];
  visualizationSettings: ColorSystemVisualizationSettings;
  approvalHash?: string;
}

export interface ColorSystemBuilderPackageInput {
  snapshot: SourceSystemSnapshot;
  audit: ColorSystemAudit;
  completeness: ColorSystemAuditExportCompleteness;
  strategySet: ColorSystemStrategySet;
  candidateId: ColorSystemStrategyDirection;
  candidateHash: string;
  proposal: ColorSystemProposal;
  decision: ColorSystemBuilderPackageDecision;
}

export interface ColorSystemBuilderSelectionReceipt {
  version: typeof COLOR_SYSTEM_BUILDER_SELECTION_RECEIPT_VERSION;
  lifecycle: 'compiled' | 'approved';
  sourceHash: string;
  auditHash: string;
  strategySetHash: string;
  briefHash: string;
  candidateId: ColorSystemStrategyDirection;
  candidateHash: string;
  modelHash: string;
  proposalHash: string;
  reviewHash: string;
  approvalHash?: string;
  outputBlueprintHash: string;
  receiptHash: string;
}

export interface ColorSystemBuilderPackageDocument {
  schemaVersion: typeof COLOR_SYSTEM_BUILDER_PACKAGE_SCHEMA_VERSION;
  packageHash: string;
  hashes: {
    sourceHash: string;
    auditHash: string;
    briefHash: string;
    strategySetHash: string;
    candidateHash: string;
    modelHash: string;
    proposalHash: string;
    reviewHash: string;
    approvalHash?: string;
    outputBlueprintHash: string;
    selectionReceiptHash: string;
  };
  source: {
    snapshot: SourceSystemSnapshot;
    audit: ColorSystemAudit;
    completeness: ColorSystemAuditExportCompleteness;
  };
  strategy: {
    set: ColorSystemStrategySet;
    selectedCandidate: Pick<
      ColorSystemStrategyCandidate,
      'id' | 'direction' | 'label' | 'modelHash' | 'candidateHash' | 'primary'
    >;
    receipt: ColorSystemBuilderSelectionReceipt;
  };
  review: {
    confirmedAnchorTokenIds: readonly string[];
    confirmedAnchors: readonly ConfirmedColorSystemAnchor[];
    intendedSurfaces: readonly string[];
    roleDecisions: readonly ProposalReviewerRoleDecision[];
    visualizationSettings: ColorSystemVisualizationSettings;
    reviewHash: string;
    approvalHash?: string;
  };
  proposal: ColorSystemProposal;
  outputBlueprint: ColorSystemOutputBlueprint;
  handoffBoundary: {
    purpose: 'reviewable-color-system-handoff';
    createsSeparateFigmaFile: false;
    publishesFigmaLibrary: false;
    notes: readonly string[];
  };
}

type UnknownRecord = Record<string, unknown>;

function importedRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactImportedKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function assertSafeImportedTree(root: unknown): void {
  let nodeCount = 0;
  const visit = (value: unknown, depth: number): void => {
    nodeCount += 1;
    if (nodeCount > 1_000_000 || depth > 32) {
      throw new Error('Builder package exceeds structural limits.');
    }
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('Builder package contains a non-finite number.');
      return;
    }
    if (typeof value === 'string') {
      if (value.length > 16 * 1024) throw new Error('Builder package contains an oversized field.');
      return;
    }
    if (typeof value !== 'object')
      throw new Error('Builder package contains an unsupported value.');
    if (Array.isArray(value)) {
      if (value.length > 100_000) throw new Error('Builder package contains an oversized array.');
      value.forEach(entry => visit(entry, depth + 1));
      return;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error('Builder package objects must use the plain JSON prototype.');
    }
    for (const [key, entry] of Object.entries(value as UnknownRecord)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new Error('Builder package contains a prohibited object key.');
      }
      if (key.length === 0 || key.length > 256) {
        throw new Error('Builder package contains an invalid object key.');
      }
      visit(entry, depth + 1);
    }
  };
  visit(root, 0);
}

function assertImportedReviewShape(
  review: unknown
): asserts review is ColorSystemBuilderPackageDocument['review'] {
  if (
    !importedRecord(review) ||
    !exactImportedKeys(review, [
      'confirmedAnchorTokenIds',
      'confirmedAnchors',
      'intendedSurfaces',
      'roleDecisions',
      'visualizationSettings',
      'reviewHash',
      'approvalHash',
    ]) ||
    !Array.isArray(review.confirmedAnchorTokenIds) ||
    !Array.isArray(review.confirmedAnchors) ||
    !Array.isArray(review.intendedSurfaces) ||
    !Array.isArray(review.roleDecisions) ||
    typeof review.reviewHash !== 'string' ||
    typeof review.approvalHash !== 'string'
  ) {
    throw new Error('Builder package review record does not match the approved v1 schema.');
  }
  if (
    !review.confirmedAnchors.every(
      anchor =>
        importedRecord(anchor) &&
        exactImportedKeys(anchor, ['tokenId', 'mode', 'hex']) &&
        typeof anchor.tokenId === 'string' &&
        typeof anchor.mode === 'string' &&
        typeof anchor.hex === 'string'
    ) ||
    !review.roleDecisions.every(
      decision =>
        importedRecord(decision) &&
        Object.keys(decision).every(key =>
          ['tokenId', 'role', 'disposition', 'assignmentSource'].includes(key)
        ) &&
        typeof decision.tokenId === 'string' &&
        typeof decision.role === 'string' &&
        (decision.disposition === 'confirmed' || decision.disposition === 'rejected')
    )
  ) {
    throw new Error('Builder package reviewer decisions do not match the approved v1 schema.');
  }
}

/**
 * Parses an approved v1 handoff as inert JSON, then reconstructs every derived
 * artifact. The returned document is the reconstruction, never the parsed
 * object. Hashes establish integrity only; the controller assigns session
 * identity separately.
 */
export function parseApprovedColorSystemBuilderPackage(
  content: string
): ColorSystemBuilderPackageDocument {
  if (utf8ByteLength(content) > MAX_COLOR_SYSTEM_BUILDER_PACKAGE_BYTES) {
    throw new Error(
      `Color-system builder package exceeds the ${MAX_COLOR_SYSTEM_BUILDER_PACKAGE_BYTES}-byte limit.`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Builder package is not valid JSON.');
  }
  assertSafeImportedTree(parsed);
  if (
    !importedRecord(parsed) ||
    !exactImportedKeys(parsed, [
      'schemaVersion',
      'packageHash',
      'hashes',
      'source',
      'strategy',
      'review',
      'proposal',
      'outputBlueprint',
      'handoffBoundary',
    ]) ||
    parsed.schemaVersion !== COLOR_SYSTEM_BUILDER_PACKAGE_SCHEMA_VERSION ||
    typeof parsed.packageHash !== 'string' ||
    !importedRecord(parsed.source) ||
    !exactImportedKeys(parsed.source, ['snapshot', 'audit', 'completeness']) ||
    !importedRecord(parsed.strategy) ||
    !exactImportedKeys(parsed.strategy, ['set', 'selectedCandidate', 'receipt']) ||
    !importedRecord(parsed.strategy.receipt) ||
    !importedRecord(parsed.hashes)
  ) {
    throw new Error('Builder package does not match the exact v1 document schema.');
  }
  if (
    !importedRecord(parsed.review) ||
    parsed.strategy.receipt.lifecycle !== 'approved' ||
    typeof parsed.strategy.receipt.approvalHash !== 'string' ||
    typeof parsed.review.approvalHash !== 'string'
  ) {
    throw new Error('Only a complete, explicitly approved builder package may be rebuilt.');
  }
  assertImportedReviewShape(parsed.review);
  if (
    parsed.review.approvalHash !== parsed.strategy.receipt.approvalHash ||
    parsed.hashes.approvalHash !== parsed.review.approvalHash ||
    (importedRecord(parsed.source.completeness) &&
      (parsed.source.completeness.partial !== false ||
        parsed.source.completeness.cancelled !== false))
  ) {
    throw new Error('Only a complete, explicitly approved builder package may be rebuilt.');
  }
  if (
    !validateColorSystemBuilderPackageCore({
      snapshot: parsed.source.snapshot,
      audit: parsed.source.audit,
      completeness: parsed.source.completeness,
      strategySet: parsed.strategy.set,
      proposal: parsed.proposal,
    })
  ) {
    throw new Error(
      'Builder package failed strict source, audit, strategy, or proposal validation.'
    );
  }

  const strategy = parsed.strategy as unknown as ColorSystemBuilderPackageDocument['strategy'];
  const source = parsed.source as unknown as ColorSystemBuilderPackageDocument['source'];
  const proposal = parsed.proposal as ColorSystemProposal;
  const review = parsed.review;
  const reconstructed = createColorSystemBuilderPackage({
    snapshot: source.snapshot,
    audit: source.audit,
    completeness: source.completeness,
    strategySet: strategy.set,
    candidateId: strategy.receipt.candidateId,
    candidateHash: strategy.receipt.candidateHash,
    proposal,
    decision: {
      reviewHash: review.reviewHash,
      confirmedAnchorTokenIds: review.confirmedAnchorTokenIds,
      confirmedAnchors: review.confirmedAnchors,
      intendedSurfaces: review.intendedSurfaces,
      roleDecisions: review.roleDecisions,
      visualizationSettings: review.visualizationSettings,
      approvalHash: review.approvalHash,
    },
  });
  if (canonicalJson(parsed) !== canonicalJson(reconstructed)) {
    throw new Error('Builder package is not the exact canonical reconstruction of its inputs.');
  }
  if (
    reconstructed.outputBlueprint.outputBlueprintHash !==
      reconstructed.hashes.outputBlueprintHash ||
    reconstructed.outputBlueprint.outputBlueprintHash !== strategy.receipt.outputBlueprintHash
  ) {
    throw new Error('Builder package output-blueprint parity failed.');
  }
  return reconstructed;
}

function sameHash(left: unknown, right: unknown): boolean {
  return deterministicContentHash(left) === deterministicContentHash(right);
}

function canonicalAnchors(
  anchors: readonly ConfirmedColorSystemAnchor[]
): ConfirmedColorSystemAnchor[] {
  return [...anchors]
    .map(anchor => ({ ...anchor, hex: anchor.hex.toLowerCase() }))
    .sort((left, right) =>
      compareText(
        `${left.tokenId}\u0000${left.mode}\u0000${left.hex}`,
        `${right.tokenId}\u0000${right.mode}\u0000${right.hex}`
      )
    );
}

function canonicalRoleDecisions(
  decisions: readonly ProposalReviewerRoleDecision[]
): ProposalReviewerRoleDecision[] {
  return [...decisions]
    .map(
      decision =>
        ({ ...decision, role: decision.role.toLowerCase() }) as ProposalReviewerRoleDecision
    )
    .sort((left, right) =>
      compareText(
        `${left.tokenId}\u0000${left.role}\u0000${left.disposition}\u0000${left.assignmentSource ?? ''}`,
        `${right.tokenId}\u0000${right.role}\u0000${right.disposition}\u0000${right.assignmentSource ?? ''}`
      )
    );
}

function canonicalVisualizationSettings(
  settings: ColorSystemVisualizationSettings
): ColorSystemVisualizationSettings {
  return {
    ...settings,
    surfaceHex: settings.surfaceHex.toLowerCase(),
    ...(settings.boundaryHex ? { boundaryHex: settings.boundaryHex.toLowerCase() } : {}),
  };
}

function assertExactStringSet(
  actual: readonly string[],
  expected: readonly string[],
  label: string
): string[] {
  const canonical = [...new Set(actual)].sort(compareText);
  const canonicalExpected = [...new Set(expected)].sort(compareText);
  if (!sameHash(canonical, canonicalExpected)) {
    throw new Error(`${label} no longer matches the compiled builder selection.`);
  }
  return canonical;
}

function assertProposalHash(proposal: ColorSystemProposal): void {
  const { proposalHash: _proposalHash, ...content } = proposal;
  if (deterministicContentHash(content) !== proposal.proposalHash) {
    throw new Error('Builder proposal failed deterministic proposal-hash revalidation.');
  }
}

function selectionReceipt(
  input: ColorSystemBuilderPackageInput,
  candidate: ColorSystemStrategyCandidate,
  output: ColorSystemOutputBlueprint
): ColorSystemBuilderSelectionReceipt {
  const content: Omit<ColorSystemBuilderSelectionReceipt, 'receiptHash'> = {
    version: COLOR_SYSTEM_BUILDER_SELECTION_RECEIPT_VERSION,
    lifecycle: input.decision.approvalHash ? 'approved' : 'compiled',
    sourceHash: input.snapshot.sourceHash,
    auditHash: input.audit.auditHash,
    strategySetHash: input.strategySet.strategySetHash,
    briefHash: input.strategySet.briefHash,
    candidateId: candidate.id,
    candidateHash: candidate.candidateHash,
    modelHash: candidate.modelHash,
    proposalHash: input.proposal.proposalHash,
    reviewHash: input.decision.reviewHash,
    ...(input.decision.approvalHash ? { approvalHash: input.decision.approvalHash } : {}),
    outputBlueprintHash: output.outputBlueprintHash,
  };
  return { ...content, receiptHash: deterministicContentHash(content) };
}

function packageHashPayload(
  document: Omit<ColorSystemBuilderPackageDocument, 'packageHash'>
): unknown {
  return document;
}

/**
 * Reconstructs and verifies one selected builder direction before producing an
 * inert handoff package. It creates no Figma nodes, files, or library state.
 */
export function createColorSystemBuilderPackage(
  input: ColorSystemBuilderPackageInput
): ColorSystemBuilderPackageDocument {
  createColorSystemAuditExport({
    snapshot: input.snapshot,
    audit: input.audit,
    completeness: input.completeness,
    exportedAt: input.snapshot.capturedAt,
  });
  if (
    input.strategySet.sourceHash !== input.snapshot.sourceHash ||
    input.proposal.sourceHash !== input.snapshot.sourceHash
  ) {
    throw new Error('Builder package source relationships no longer match.');
  }

  const candidate = input.strategySet.candidates.find(item => item.id === input.candidateId);
  if (!candidate || candidate.candidateHash !== input.candidateHash) {
    throw new Error('The selected candidate identity is missing or stale.');
  }
  const compiled = compileColorSystemStrategyProposal(input.snapshot, input.strategySet, {
    candidateId: input.candidateId,
    candidateHash: input.candidateHash,
  });
  if (compiled.status !== 'ready') {
    throw new Error(
      compiled.blockers[0]?.message ?? 'The selected candidate failed compilation revalidation.'
    );
  }
  const baseProposal: ColorSystemProposal = {
    ...compiled.draft.content,
    proposalHash: compiled.draft.proposalHash,
  };
  const recomposed = composeColorSystemObjectiveModules(
    input.snapshot,
    baseProposal,
    COMPOSED_OBJECTIVES
  );
  if (recomposed.status === 'no-solution') {
    throw new Error(
      recomposed.blockers[0]?.message ?? 'The selected builder proposal no longer composes.'
    );
  }
  assertProposalHash(input.proposal);
  if (
    recomposed.proposal.proposalHash !== input.proposal.proposalHash ||
    !sameHash(recomposed.proposal, input.proposal)
  ) {
    throw new Error('The proposal no longer matches the selected strategy compiler output.');
  }

  const confirmedAnchors = canonicalAnchors(input.decision.confirmedAnchors);
  const confirmedAnchorTokenIds = assertExactStringSet(
    input.decision.confirmedAnchorTokenIds,
    confirmedAnchors.map(anchor => anchor.tokenId),
    'Confirmed anchors'
  );
  const intendedSurfaces = assertExactStringSet(
    input.decision.intendedSurfaces,
    REVIEWED_SURFACES,
    'Intended surfaces'
  );
  const roleDecisions = canonicalRoleDecisions(input.decision.roleDecisions);
  const visualizationSettings = canonicalVisualizationSettings(
    input.decision.visualizationSettings
  );
  if (!sameHash(visualizationSettings, input.strategySet.visualizationSettings)) {
    throw new Error('Visualization settings no longer match the selected strategy set.');
  }
  const decisionRecord = {
    snapshot: input.snapshot,
    proposal: input.proposal,
    confirmedAnchors,
    intendedSurfaces,
    roleDecisions,
    visualizationSettings,
  };
  if (createColorSystemReviewHash(decisionRecord) !== input.decision.reviewHash) {
    throw new Error('The builder review receipt failed deterministic revalidation.');
  }
  const expectedApprovalHash = createColorSystemApprovalHash(decisionRecord);
  if (
    input.decision.approvalHash !== undefined &&
    input.decision.approvalHash !== expectedApprovalHash
  ) {
    throw new Error('The builder approval receipt failed deterministic revalidation.');
  }

  const outputBlueprint = buildColorSystemOutputBlueprint(input.proposal, visualizationSettings);
  const receipt = selectionReceipt(input, candidate, outputBlueprint);
  const content: Omit<ColorSystemBuilderPackageDocument, 'packageHash'> = {
    schemaVersion: COLOR_SYSTEM_BUILDER_PACKAGE_SCHEMA_VERSION,
    hashes: {
      sourceHash: input.snapshot.sourceHash,
      auditHash: input.audit.auditHash,
      briefHash: input.strategySet.briefHash,
      strategySetHash: input.strategySet.strategySetHash,
      candidateHash: candidate.candidateHash,
      modelHash: candidate.modelHash,
      proposalHash: input.proposal.proposalHash,
      reviewHash: input.decision.reviewHash,
      ...(input.decision.approvalHash ? { approvalHash: input.decision.approvalHash } : {}),
      outputBlueprintHash: outputBlueprint.outputBlueprintHash,
      selectionReceiptHash: receipt.receiptHash,
    },
    source: {
      snapshot: input.snapshot,
      audit: input.audit,
      completeness: { ...input.completeness },
    },
    strategy: {
      set: input.strategySet,
      selectedCandidate: {
        id: candidate.id,
        direction: candidate.direction,
        label: candidate.label,
        modelHash: candidate.modelHash,
        candidateHash: candidate.candidateHash,
        primary: { ...candidate.primary },
      },
      receipt,
    },
    review: {
      confirmedAnchorTokenIds,
      confirmedAnchors,
      intendedSurfaces,
      roleDecisions,
      visualizationSettings,
      reviewHash: input.decision.reviewHash,
      ...(input.decision.approvalHash ? { approvalHash: input.decision.approvalHash } : {}),
    },
    proposal: input.proposal,
    outputBlueprint,
    handoffBoundary: {
      purpose: 'reviewable-color-system-handoff',
      createsSeparateFigmaFile: false,
      publishesFigmaLibrary: false,
      notes: [
        'This package is inert JSON for review and downstream handoff.',
        'Creating a separate Figma file and publishing a Figma library remain explicit manual workflows.',
      ],
    },
  };
  return {
    ...content,
    packageHash: deterministicContentHash(packageHashPayload(content)),
  };
}

/** Canonical and script-safe JSON with a hard transport ceiling. */
export function serializeColorSystemBuilderPackage(
  document: ColorSystemBuilderPackageDocument
): string {
  const content = canonicalJson(document)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  if (utf8ByteLength(content) > MAX_COLOR_SYSTEM_BUILDER_PACKAGE_BYTES) {
    throw new Error(
      `Color-system builder package exceeds the ${MAX_COLOR_SYSTEM_BUILDER_PACKAGE_BYTES}-byte limit.`
    );
  }
  return content;
}
