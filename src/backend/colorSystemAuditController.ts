import {
  auditColorSystem,
  createSourceSystemSnapshot,
  deterministicContentHash,
} from '../lib/colorSystemAudit';
import { createColorSystemProposal } from '../lib/colorSystemProposal';
import { composeColorSystemObjectiveModules } from '../lib/colorSystemObjectiveModules';
import {
  createColorSystemAuditExport,
  serializeColorSystemAuditExport,
  type ColorSystemAuditExportCompleteness,
} from '../lib/colorSystemAuditExport';
import {
  COLOR_SYSTEM_BUILDER_PACKAGE_SCHEMA_VERSION,
  createColorSystemBuilderPackage,
  parseApprovedColorSystemBuilderPackage,
  serializeColorSystemBuilderPackage,
  type ColorSystemBuilderPackageDocument,
} from '../lib/colorSystemBuilderPackage';
import { structuredDocumentToAuditSnapshot } from '../lib/colorSystemStructured';
import {
  MAX_COLOR_TOKEN_IMPORT_BYTES,
  importColorTokensFromJson,
} from '../lib/colorSystemTokenImport';
import { utf8ByteLength } from '../lib/utf8';
import {
  colorSystemProposalToStructuredTokens,
  exportColorTokensToDtcgJson,
  exportColorTokensToTeulJson,
} from '../lib/colorSystemTokenExport';
import {
  createColorSystemApprovalHash,
  createColorSystemReviewHash,
} from '../lib/colorSystemApproval';
import {
  buildColorSystemStrategySet,
  resolveConfirmedColorSystemPrimary,
  type ColorSystemStrategyPrimary,
  type ColorSystemStrategySourceReferences,
  type ColorSystemStrategySet,
} from '../lib/colorSystemStrategyBuilder';
import { compileColorSystemStrategyProposal } from '../lib/colorSystemStrategyProposal';
import {
  projectColorSystemStrategyBlocker,
  projectColorSystemStrategyPreview,
} from '../lib/colorSystemStrategyPreview';
import { compareText, hexToOklch } from '../lib/utils';
import {
  assertIntendedSurfaceCoverage,
  isColorSystemIntendedSurface,
} from '../lib/colorSystemIntendedSurfaces';
import {
  COLOR_SYSTEM_REVIEW_ASSIGNABLE_ROLES,
  MAX_COLOR_SYSTEM_REVIEWER_ROLE_ASSIGNMENTS,
} from '../types/colorSystemAudit';
import {
  COLOR_SYSTEM_APPLY_FAILURE_RECEIPT_VERSION,
  COLOR_SYSTEM_AUDIT_EVIDENCE_TEXT_LIMIT,
  type ColorSystemApplyCleanupReceipt,
  type ColorSystemApplyFailureStage,
} from '../types/messages';
import type {
  ConfirmedColorSystemAnchor,
  ColorSystemAudit,
  ProposalBundle,
  ProposalStrategy,
  ColorSystemProposalRequest,
  DeclaredAccessibilityPair,
  ExactRadixAnchor,
  GeneratedScaleRequest,
  ColorSystemProposal,
  SourceColorToken,
  SourceSystemSnapshot,
} from '../types/colorSystemAudit';
import type {
  AnalyzeColorSystemMessage,
  ApplyColorSystemProposalMessage,
  ApproveColorSystemProposalMessage,
  ColorSystemAuditProgressMessage,
  ColorSystemAuditResultMessage,
  ColorSystemDeclaredPairsUpdateResultMessage,
  ColorSystemExportResultMessage,
  EnabledLibraryVariableDescriptorMessage,
  ColorSystemProposalApplyResultMessage,
  ColorSystemProposalApprovalResultMessage,
  ColorSystemProposalConfirmationResultMessage,
  ConfirmColorSystemProposalMessage,
  ExportColorSystemArtifactMessage,
  GenerateColorSystemStrategiesMessage,
  ImportStructuredColorSystemMessage,
  ImportColorSystemBuilderPackageMessage,
  RebuildColorSystemBuilderPackageMessage,
  ColorSystemBuilderPackageImportResultMessage,
  SelectColorSystemStrategyMessage,
  ColorSystemStrategySetResultMessage,
  ColorSystemStrategyFailureBlockerCode,
  UpdateColorSystemDeclaredPairsMessage,
} from '../types/messages';
import type { StructuredColorTokenDocument } from '../types/structuredColorTokens';
import {
  applyApprovedColorSystemProposal,
  ColorSystemProposalApplyError,
  completeColorSystemApplyNoopCleanupReceipt,
  type ApprovedProposalRecord,
} from './colorSystemAuditApply';
import { inventoryFigmaColorSystem } from './colorSystemAuditInventory';

const MAX_SESSION_SNAPSHOTS = 12;
const MAX_SESSION_PROPOSALS = 32;
const MAX_COMPLETED_ANALYSIS_RESULTS = MAX_SESSION_SNAPSHOTS;
const MAX_COMPLETED_DECLARED_PAIR_RESULTS = MAX_SESSION_SNAPSHOTS;
const MAX_COMPLETED_STRATEGY_RESULTS = MAX_SESSION_PROPOSALS;
const MAX_COMPLETED_APPROVAL_RESULTS = MAX_SESSION_PROPOSALS;
const MAX_COMPLETED_CONFIRMATION_RESULTS = 100;
const MAX_COMPLETED_APPLY_RESULTS = 100;
const MAX_COMPLETED_EXPORT_RESULTS = 4;
const MAX_EXPORT_BYTES = 8 * 1024 * 1024;
const ROLLBACK_DIAGNOSTIC_TRUNCATION_MARKER = ' ... [middle truncated for transport] ... ';
const MAX_APPLY_CLEANUP_FAILURE_MESSAGES = 128;

interface ActiveAnalysis {
  cancelled: boolean;
  preservePartial: boolean;
  fingerprint: string;
}

interface CompletedOperation<T> {
  fingerprint: string;
  result: T;
  /** Retains source ownership even when the terminal result is a failure without a hash. */
  sourceHash?: string;
}

interface ActiveApply {
  fingerprint: string;
  sourceHash: string;
  cancelled: boolean;
}

interface ActiveStructuredImport {
  fingerprint: string;
  cancelled: boolean;
}

interface ActiveBuilderPackageImport {
  fingerprint: string;
  cancelled: boolean;
}

interface ActiveExport {
  fingerprint: string;
  sourceHash: string;
  cancelled: boolean;
}

interface ExportSessionRecord {
  snapshot: SourceSystemSnapshot;
  audit: ColorSystemAudit;
  completeness: ColorSystemAuditExportCompleteness;
  enabledLibraryDescriptors: readonly EnabledLibraryVariableDescriptorMessage[];
  libraryBoundaryNote: string;
  structuredDocument?: StructuredColorTokenDocument;
}

interface BuilderPackageSelectionRecord extends ApprovedProposalRecord {
  strategySetHash: string;
  candidateId: SelectColorSystemStrategyMessage['candidateId'];
  candidateHash: string;
}

interface ImportedBuilderPackageRecord {
  receiptId: string;
  document: ColorSystemBuilderPackageDocument;
  approvedRecord: ApprovedProposalRecord;
}

const activeAnalyses = new Map<string, ActiveAnalysis>();
const activeStructuredImports = new Map<string, ActiveStructuredImport>();
const activeBuilderPackageImports = new Map<string, ActiveBuilderPackageImport>();
const activeDeclaredPairUpdates = new Map<string, string>();
const activeStrategyGenerations = new Map<string, string>();
const activeStrategySelections = new Map<string, string>();
const activeApprovals = new Map<string, string>();
const activeConfirmations = new Map<string, string>();
const activeApplies = new Map<string, ActiveApply>();
const activeExports = new Map<string, ActiveExport>();
const snapshots = new Map<string, SourceSystemSnapshot>();
const exportSessions = new Map<string, ExportSessionRecord>();
const proposalBundles = new Map<string, ProposalBundle>();
const strategySets = new Map<string, ColorSystemStrategySet>();
const builderPackageSelections = new Map<string, BuilderPackageSelectionRecord>();
const reviewedProposals = new Map<string, ApprovedProposalRecord>();
const approvedProposals = new Map<string, ApprovedProposalRecord>();
const importedBuilderPackages = new Map<string, ImportedBuilderPackageRecord>();
let importedBuilderPackageSequence = 0;
const completedAnalysisResults = new Map<
  string,
  CompletedOperation<ColorSystemAuditResultMessage>
>();
const completedDeclaredPairUpdateResults = new Map<
  string,
  CompletedOperation<ColorSystemDeclaredPairsUpdateResultMessage>
>();
const completedStrategyResults = new Map<
  string,
  CompletedOperation<ColorSystemStrategySetResultMessage>
>();
const completedApprovalResults = new Map<
  string,
  CompletedOperation<ColorSystemProposalApprovalResultMessage>
>();
const completedConfirmationResults = new Map<
  string,
  CompletedOperation<ColorSystemProposalConfirmationResultMessage>
>();
const completedApplyResults = new Map<
  string,
  CompletedOperation<ColorSystemProposalApplyResultMessage>
>();
const completedExportResults = new Map<
  string,
  CompletedOperation<ColorSystemExportResultMessage>
>();
const completedBuilderPackageImportResults = new Map<
  string,
  CompletedOperation<ColorSystemBuilderPackageImportResultMessage>
>();

function remember<T>(map: Map<string, T>, key: string, value: T, maximum: number): void {
  map.set(key, value);
  while (map.size > maximum) {
    const oldestKey = map.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

function proposalBundleKey(sourceHash: string, strategy: ProposalStrategy): string {
  return `${sourceHash}\u0000${strategy}`;
}

function proposalBundleStrategy(bundle: ProposalBundle): ProposalStrategy {
  return bundle.status === 'no-solution' ? bundle.strategy : bundle.proposal.strategy;
}

function removeProposalBundlesForSource(sourceHash: string): void {
  for (const key of proposalBundles.keys()) {
    if (key.startsWith(`${sourceHash}\u0000`)) proposalBundles.delete(key);
  }
}

function removeBuilderPackageSelectionsForSource(sourceHash: string): void {
  for (const [proposalHash, record] of builderPackageSelections) {
    if (record.snapshot.sourceHash === sourceHash) builderPackageSelections.delete(proposalHash);
  }
}

function isSupportedStructuredFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.tokens') || lower.endsWith('.tokens.json') || lower.endsWith('.json');
}

function assertExportSize(content: string): void {
  if (utf8ByteLength(content) > MAX_EXPORT_BYTES) {
    throw new Error(`Color-system export exceeds the ${MAX_EXPORT_BYTES}-byte limit.`);
  }
}

function assertExportActive(active: ActiveExport): void {
  if (active.cancelled) {
    throw new Error('Color-system export was cancelled because its source session was cleared.');
  }
}

function post(
  message:
    | ColorSystemAuditResultMessage
    | ColorSystemDeclaredPairsUpdateResultMessage
    | ColorSystemProposalApprovalResultMessage
    | ColorSystemProposalConfirmationResultMessage
    | ColorSystemProposalApplyResultMessage
    | ColorSystemExportResultMessage
    | ColorSystemBuilderPackageImportResultMessage
    | ColorSystemStrategySetResultMessage
    | ColorSystemAuditProgressMessage
): void {
  figma.ui.postMessage(message);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function boundedRollbackDiagnostic(value: string): string {
  if (value.length <= COLOR_SYSTEM_AUDIT_EVIDENCE_TEXT_LIMIT) return value;
  // Preserve both resource identity at the start and the rollback outcome at
  // the end; dropping either would make a safety-critical warning ambiguous.
  const retainedLength =
    COLOR_SYSTEM_AUDIT_EVIDENCE_TEXT_LIMIT - ROLLBACK_DIAGNOSTIC_TRUNCATION_MARKER.length;
  const prefixLength = Math.ceil(retainedLength / 2);
  const suffixLength = retainedLength - prefixLength;
  return `${value.slice(0, prefixLength)}${ROLLBACK_DIAGNOSTIC_TRUNCATION_MARKER}${value.slice(
    -suffixLength
  )}`;
}

function applyFailureDetails(
  error: unknown,
  fallbackStage: ColorSystemApplyFailureStage = 'preflight'
): {
  failureReceiptVersion: typeof COLOR_SYSTEM_APPLY_FAILURE_RECEIPT_VERSION;
  failureStage: ColorSystemApplyFailureStage;
  cleanupReceipt: ColorSystemApplyCleanupReceipt;
  rollbackFailures: readonly string[];
} {
  const cleanup =
    error instanceof ColorSystemProposalApplyError
      ? error.cleanupReceipt
      : completeColorSystemApplyNoopCleanupReceipt();
  const failureMessages = cleanup.failureMessages
    .slice(0, MAX_APPLY_CLEANUP_FAILURE_MESSAGES)
    .map(boundedRollbackDiagnostic);
  return {
    failureReceiptVersion: COLOR_SYSTEM_APPLY_FAILURE_RECEIPT_VERSION,
    failureStage:
      error instanceof ColorSystemProposalApplyError ? error.failureStage : fallbackStage,
    cleanupReceipt: {
      ...cleanup,
      failureMessages,
    },
    rollbackFailures: failureMessages,
  };
}

function safeFingerprint(value: unknown): string | null {
  try {
    return deterministicContentHash(value);
  } catch {
    return null;
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(left);
  return expected.size === left.length && right.every(value => expected.has(value));
}

function canonicalConfirmedAnchor(anchor: ConfirmedColorSystemAnchor): string {
  return `${anchor.tokenId}\u0000${anchor.mode}\u0000${anchor.hex.toLowerCase()}`;
}

function sameConfirmedAnchors(
  left: readonly ConfirmedColorSystemAnchor[],
  right: readonly ConfirmedColorSystemAnchor[]
): boolean {
  return sameStringSet(left.map(canonicalConfirmedAnchor), right.map(canonicalConfirmedAnchor));
}

function canonicalRoleDecisions(
  decisions: readonly ApproveColorSystemProposalMessage['roleDecisions'][number][]
): string[] {
  return decisions
    .map(
      decision =>
        `${decision.tokenId}\u0000${decision.role.toLowerCase()}\u0000${decision.disposition}\u0000${
          decision.assignmentSource ?? 'source-evidence'
        }`
    )
    .sort();
}

function cloneDeclaredPairs(
  declaredPairs: readonly DeclaredAccessibilityPair[]
): DeclaredAccessibilityPair[] {
  return declaredPairs.map(pair => ({
    ...pair,
    foreground: { ...pair.foreground },
    background: { ...pair.background },
  }));
}

function assertDeclaredPairsMatchSnapshot(
  snapshot: SourceSystemSnapshot,
  declaredPairs: readonly DeclaredAccessibilityPair[]
): void {
  const tokenIds = new Set(snapshot.tokens.map(token => token.id));
  const modes = new Set(snapshot.modes);
  for (const pair of declaredPairs) {
    if (!modes.has(pair.mode)) {
      throw new Error(`Declared pair ${pair.id} references unknown mode ${pair.mode}.`);
    }
    if (!tokenIds.has(pair.foreground.tokenId)) {
      throw new Error(
        `Declared pair ${pair.id} references unknown foreground token ${pair.foreground.tokenId}.`
      );
    }
    if (!tokenIds.has(pair.background.tokenId)) {
      throw new Error(
        `Declared pair ${pair.id} references unknown background token ${pair.background.tokenId}.`
      );
    }
  }
}

function removeStrategyStateForSource(sourceHash: string): void {
  for (const [strategySetHash, strategySet] of strategySets) {
    if (strategySet.sourceHash === sourceHash) strategySets.delete(strategySetHash);
  }
  for (const [requestId, completed] of completedStrategyResults) {
    if (
      completed.sourceHash === sourceHash ||
      (completed.result.success && completed.result.sourceHash === sourceHash)
    ) {
      completedStrategyResults.delete(requestId);
    }
  }
}

function invalidateProposalsForSourceHash(sourceHash: string): void {
  for (const active of activeApplies.values()) {
    if (active.sourceHash === sourceHash) active.cancelled = true;
  }
  for (const [approvalHash, record] of approvedProposals) {
    if (record.snapshot.sourceHash === sourceHash) approvedProposals.delete(approvalHash);
  }
  for (const [reviewHash, record] of reviewedProposals) {
    if (record.snapshot.sourceHash === sourceHash) reviewedProposals.delete(reviewHash);
  }
  for (const [requestId, completed] of completedApprovalResults) {
    if (completed.result.success && completed.result.sourceHash === sourceHash) {
      completedApprovalResults.delete(requestId);
    }
  }
  for (const [requestId, completed] of completedConfirmationResults) {
    if (completed.result.success && completed.result.sourceHash === sourceHash) {
      completedConfirmationResults.delete(requestId);
    }
  }
  for (const [requestId, completed] of completedApplyResults) {
    if (completed.result.success && completed.result.sourceHash === sourceHash) {
      completedApplyResults.delete(requestId);
    }
  }
  removeProposalBundlesForSource(sourceHash);
  removeBuilderPackageSelectionsForSource(sourceHash);
  removeStrategyStateForSource(sourceHash);
}

function sourceLocator(): string {
  return figma.fileKey ? `figma-file:${figma.fileKey}` : 'figma-file:open-document';
}

function documentProfile(): SourceSystemSnapshot['documentProfile'] {
  try {
    const profile = (figma.root as DocumentNode & { readonly documentColorProfile?: unknown })
      .documentColorProfile;
    if (profile === 'SRGB') return 'srgb';
    if (profile === 'DISPLAY_P3') return 'display-p3';
    if (profile === 'LEGACY') return 'legacy';
  } catch {
    // Unknown profiles remain inventory-only and fail closed for proposal math.
  }
  return 'unknown';
}

interface ResolvedBuilderPrimary {
  primary: ColorSystemStrategyPrimary;
  resolution: 'structured-source' | 'verified-role' | 'user-confirmed';
  note: string;
}

class StrategyGenerationError extends Error {
  constructor(
    readonly code: ColorSystemStrategyFailureBlockerCode,
    message: string,
    readonly alternatives: readonly string[]
  ) {
    super(message);
  }
}

function normalizedOpaqueSrgbValues(token: SourceColorToken): Array<{
  mode: string;
  hex: string;
  components: readonly [number, number, number];
}> {
  return Object.entries(token.valuesByMode)
    .flatMap(([mode, value]) =>
      value.colorSpace === 'srgb' && value.alpha === 1 && value.hex
        ? [{ mode, hex: value.hex.toLowerCase(), components: value.components }]
        : []
    )
    .sort((left, right) => compareText(left.mode, right.mode));
}

const STRATEGY_REFERENCE_MINIMUM_CHROMA = 0.035;
const SIX_DIGIT_SRGB_HEX = /^#[0-9a-f]{6}$/i;

function normalizedReferenceName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

function explicitLightCompanionBase(name: string): string | null {
  const match = normalizedReferenceName(name).match(/^(.*?) light$/);
  return match?.[1]?.trim() || null;
}

/**
 * Projects only ordered, opaque chromatic Secondary and Data Viz section
 * evidence into the strategy engine. Alpha values, neutrals, and explicit
 * Secondary "Light" companions remain in the audit but do not steer anchors.
 */
export function deriveColorSystemStrategySourceReferences(
  snapshot: SourceSystemSnapshot
): ColorSystemStrategySourceReferences | undefined {
  const projectSection = (sectionKind: 'secondary' | 'data-visualization') => {
    const section = snapshot.sourceSections?.find(candidate => candidate.kind === sectionKind);
    if (!section) return [];
    const normalizedNames = new Set(
      section.entries.map(entry => normalizedReferenceName(entry.name))
    );
    return [...section.entries]
      .sort((left, right) => left.order - right.order || compareText(left.id, right.id))
      .flatMap(entry => {
        const { value } = entry;
        if (
          value.colorSpace !== 'srgb' ||
          value.alpha !== 1 ||
          !value.hex ||
          !SIX_DIGIT_SRGB_HEX.test(value.hex) ||
          hexToOklch(value.hex).c < STRATEGY_REFERENCE_MINIMUM_CHROMA
        ) {
          return [];
        }
        const companionBase = explicitLightCompanionBase(entry.name);
        if (sectionKind === 'secondary' && companionBase && normalizedNames.has(companionBase)) {
          return [];
        }
        return [
          {
            section: sectionKind,
            sectionTitle: section.title,
            sourceNodeId: section.sourceNodeId,
            entryId: entry.id,
            name: entry.name,
            order: entry.order,
            hex: value.hex.toLowerCase(),
          },
        ];
      });
  };
  const secondary = projectSection('secondary');
  const dataVisualization = projectSection('data-visualization');
  return secondary.length > 0 || dataVisualization.length > 0
    ? { secondary, dataVisualization }
    : undefined;
}

function resolveBuilderPrimary(
  snapshot: SourceSystemSnapshot,
  confirmedPrimary?: ConfirmedColorSystemAnchor
): ResolvedBuilderPrimary | null {
  if (confirmedPrimary) {
    const confirmed = resolveConfirmedColorSystemPrimary(snapshot, confirmedPrimary);
    if (confirmed.status === 'mismatch') {
      throw new StrategyGenerationError(confirmed.code, confirmed.message, [
        'Choose an exact opaque sRGB token value from the current audit.',
        'Analyze the source again if the token, mode, or value changed.',
      ]);
    }
    return {
      primary: confirmed.primary,
      resolution: 'user-confirmed',
      note: 'Primary was explicitly confirmed from one exact audited token, mode, and value.',
    };
  }

  const protectedRoleValues = snapshot.tokens
    .filter(token =>
      token.roleEvidence.some(
        evidence =>
          evidence.role.trim().toLowerCase() === 'primary' &&
          evidence.protectedAnchor === true &&
          (evidence.status === 'verified' || evidence.reviewerDisposition === 'confirmed')
      )
    )
    .flatMap(token =>
      normalizedOpaqueSrgbValues(token).map(value => ({
        token,
        mode: value.mode,
        hex: value.hex,
      }))
    )
    .sort(
      (left, right) =>
        compareText(left.token.id, right.token.id) ||
        compareText(left.mode, right.mode) ||
        compareText(left.hex, right.hex)
    );
  if (protectedRoleValues.length === 1) {
    const [{ token, mode, hex }] = protectedRoleValues;
    return {
      primary: { tokenId: token.id, name: token.name, mode, hex },
      resolution: 'verified-role',
      note: 'Primary is protected from one exact verified protected-role value.',
    };
  }

  const primarySection = snapshot.sourceSections?.find(section => section.kind === 'primary');
  const structuredEntries = (primarySection?.entries ?? [])
    .filter(
      entry =>
        entry.value.colorSpace === 'srgb' && entry.value.alpha === 1 && Boolean(entry.value.hex)
    )
    .sort((left, right) => left.order - right.order || compareText(left.id, right.id));
  if (structuredEntries.length === 1 && structuredEntries[0].value.hex) {
    const entry = structuredEntries[0];
    const matches = snapshot.tokens
      .flatMap(token =>
        normalizedOpaqueSrgbValues(token)
          .filter(
            value =>
              value.hex === entry.value.hex?.toLowerCase() &&
              value.components.every(
                (component, index) => component === entry.value.components[index]
              )
          )
          .map(value => ({ token, mode: value.mode, hex: value.hex }))
      )
      .sort(
        (left, right) =>
          Number(right.token.sourceRepresentation === 'structured-source') -
            Number(left.token.sourceRepresentation === 'structured-source') ||
          compareText(left.token.id, right.token.id) ||
          compareText(left.mode, right.mode)
      );
    const structuredMatches = matches.filter(
      match => match.token.sourceRepresentation === 'structured-source'
    );
    const exact =
      structuredMatches.length === 1
        ? structuredMatches[0]
        : matches.length === 1
          ? matches[0]
          : null;
    if (exact) {
      return {
        primary: {
          tokenId: exact.token.id,
          name: entry.name,
          mode: exact.mode,
          hex: exact.hex,
        },
        resolution: 'structured-source',
        note: `Primary is protected from the single exact source value in “${primarySection?.title ?? 'Primary'}”.`,
      };
    }
  }
  return null;
}

function primaryConfirmationAlternatives(snapshot: SourceSystemSnapshot): string[] {
  const exactValueCount = snapshot.tokens.reduce(
    (count, token) => count + normalizedOpaqueSrgbValues(token).length,
    0
  );
  return exactValueCount > 0
    ? [`Search and confirm one of ${exactValueCount} exact opaque sRGB source values.`]
    : ['Add or select an exact opaque sRGB source color before generating strategies.'];
}

function requestedExactAnchors(request: ColorSystemProposalRequest): readonly ExactRadixAnchor[] {
  if (request.strategy === 'brand-preserving') return [];
  if (request.strategy === 'hybrid') return request.exact.anchors;
  return request.anchors;
}

function requestedGeneratedScales(
  request: ColorSystemProposalRequest
): readonly GeneratedScaleRequest[] {
  if (request.strategy === 'exact-radix') return [];
  return request.strategy === 'hybrid' ? request.generatedScales : request.scales;
}

function requestedAnchorIds(request: ColorSystemProposalRequest): string[] {
  return [
    ...requestedExactAnchors(request).map(anchor => anchor.sourceTokenId),
    ...requestedGeneratedScales(request).map(scale => scale.anchor.sourceTokenId),
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function assertProposalRequestMatchesSnapshot(
  snapshot: SourceSystemSnapshot,
  request: ColorSystemProposalRequest,
  confirmedAnchorTokenIds: readonly string[],
  confirmedAnchors: readonly ConfirmedColorSystemAnchor[],
  intendedSurfaces: readonly string[],
  roleDecisions: ApproveColorSystemProposalMessage['roleDecisions'],
  visualizationSettings: ApproveColorSystemProposalMessage['visualizationSettings']
): void {
  if (snapshot.documentProfile !== 'srgb') {
    throw new Error(
      `${snapshot.documentProfile} snapshots are inventory-only; proposal math is blocked.`
    );
  }
  if (intendedSurfaces.length === 0) {
    throw new Error('Confirm at least one intended surface before creating a proposal.');
  }
  if (!intendedSurfaces.every(isColorSystemIntendedSurface)) {
    throw new Error('One or more intended surfaces are unsupported.');
  }
  const needsVisualization = intendedSurfaces.includes('data-visualization');
  if (needsVisualization !== Boolean(visualizationSettings)) {
    throw new Error(
      needsVisualization
        ? 'Data visualization requires explicit mode, surface, chart, count, and non-color-cue settings.'
        : 'Visualization settings are only valid when data visualization is selected.'
    );
  }
  const tokenById = new Map(snapshot.tokens.map(token => [token.id, token]));
  if (
    !sameStringSet(
      confirmedAnchorTokenIds,
      confirmedAnchors.map(anchor => anchor.tokenId)
    )
  ) {
    throw new Error('Confirmed anchor identifiers do not match their mode and value evidence.');
  }
  for (const anchor of confirmedAnchors) {
    const token = tokenById.get(anchor.tokenId);
    const value = token?.valuesByMode[anchor.mode];
    if (
      !value?.hex ||
      value.colorSpace !== 'srgb' ||
      value.alpha !== 1 ||
      value.hex.toLowerCase() !== anchor.hex.toLowerCase()
    ) {
      throw new Error(
        `Confirmed anchor ${anchor.tokenId} must match an opaque sRGB value in mode ${anchor.mode}.`
      );
    }
  }
  const decisionKeys = new Set<string>();
  let reviewerAssignmentCount = 0;
  for (const decision of roleDecisions) {
    const normalizedRole = decision.role.trim().toLowerCase();
    const key = `${decision.tokenId}\u0000${normalizedRole}`;
    if (decisionKeys.has(key)) throw new Error(`Role ${decision.role} has duplicate decisions.`);
    decisionKeys.add(key);
    const token = tokenById.get(decision.tokenId);
    if (!token) throw new Error(`Role decision references unknown token ${decision.tokenId}.`);
    if (decision.assignmentSource === 'reviewer-assigned') {
      reviewerAssignmentCount += 1;
      if (
        decision.disposition !== 'confirmed' ||
        decision.role !== normalizedRole ||
        !(COLOR_SYSTEM_REVIEW_ASSIGNABLE_ROLES as readonly string[]).includes(normalizedRole)
      ) {
        throw new Error(
          `Reviewer-assigned role ${decision.role} is not a supported canonical role.`
        );
      }
    } else if (
      !token.roleEvidence.some(role => role.role.trim().toLowerCase() === normalizedRole)
    ) {
      throw new Error(`Role ${decision.role} is not declared for token ${decision.tokenId}.`);
    }
  }
  if (reviewerAssignmentCount > MAX_COLOR_SYSTEM_REVIEWER_ROLE_ASSIGNMENTS) {
    throw new Error(
      `A review may add at most ${MAX_COLOR_SYSTEM_REVIEWER_ROLE_ASSIGNMENTS} token roles.`
    );
  }
  const requiredAnchorIds = requestedAnchorIds(request);
  for (const tokenId of requiredAnchorIds) {
    const token = tokenById.get(tokenId);
    if (!token) throw new Error(`Anchor ${tokenId} is not present in the approved snapshot.`);
    if (!confirmedAnchorTokenIds.includes(tokenId)) {
      throw new Error(`Anchor ${tokenId} must be explicitly confirmed.`);
    }
  }
  for (const anchor of requestedExactAnchors(request)) {
    const confirmed = confirmedAnchors.find(item => item.tokenId === anchor.sourceTokenId);
    if (!confirmed || confirmed.hex.toLowerCase() !== anchor.hex.toLowerCase()) {
      throw new Error(
        `Exact anchor ${anchor.sourceTokenId} does not match its confirmed mode value.`
      );
    }
    if (
      anchor.referenceMode &&
      confirmed.mode.toLowerCase() !== anchor.referenceMode.toLowerCase()
    ) {
      throw new Error(
        `Exact anchor ${anchor.sourceTokenId} reference mode does not match its confirmed source mode.`
      );
    }
  }
  for (const scale of requestedGeneratedScales(request)) {
    const confirmed = confirmedAnchors.find(
      item => item.tokenId === scale.anchor.sourceTokenId && item.mode === scale.anchor.sourceMode
    );
    if (!confirmed || confirmed.hex.toLowerCase() !== scale.anchor.hex.toLowerCase()) {
      throw new Error(
        `Generated anchor ${scale.anchor.sourceTokenId} does not match its confirmed ${scale.anchor.sourceMode} mode value.`
      );
    }
  }
}

export function cancelColorSystemAnalysis(
  targetRequestId: string,
  preservePartial: boolean
): boolean {
  const active = activeAnalyses.get(targetRequestId);
  if (!active) return false;
  active.cancelled = true;
  active.preservePartial = preservePartial;
  return true;
}

export function clearColorSystemAuditSession(sourceHash?: string): void {
  for (const active of activeApplies.values()) {
    if (!sourceHash || active.sourceHash === sourceHash) active.cancelled = true;
  }
  for (const active of activeExports.values()) {
    if (!sourceHash || active.sourceHash === sourceHash) active.cancelled = true;
  }
  for (const active of activeBuilderPackageImports.values()) active.cancelled = true;
  if (!sourceHash) {
    for (const active of activeAnalyses.values()) {
      active.cancelled = true;
      active.preservePartial = false;
    }
    for (const active of activeStructuredImports.values()) active.cancelled = true;
    snapshots.clear();
    exportSessions.clear();
    proposalBundles.clear();
    strategySets.clear();
    builderPackageSelections.clear();
    reviewedProposals.clear();
    approvedProposals.clear();
    importedBuilderPackages.clear();
    activeStrategyGenerations.clear();
    activeStrategySelections.clear();
    completedAnalysisResults.clear();
    completedDeclaredPairUpdateResults.clear();
    completedStrategyResults.clear();
    completedApprovalResults.clear();
    completedConfirmationResults.clear();
    completedApplyResults.clear();
    completedExportResults.clear();
    completedBuilderPackageImportResults.clear();
    return;
  }
  snapshots.delete(sourceHash);
  exportSessions.delete(sourceHash);
  removeProposalBundlesForSource(sourceHash);
  removeBuilderPackageSelectionsForSource(sourceHash);
  removeStrategyStateForSource(sourceHash);
  for (const [approvalHash, record] of approvedProposals) {
    if (record.snapshot.sourceHash === sourceHash) approvedProposals.delete(approvalHash);
  }
  for (const [reviewHash, record] of reviewedProposals) {
    if (record.snapshot.sourceHash === sourceHash) reviewedProposals.delete(reviewHash);
  }
  for (const [receiptId, record] of importedBuilderPackages) {
    if (record.document.hashes.sourceHash === sourceHash) importedBuilderPackages.delete(receiptId);
  }
  for (const [requestId, completed] of completedBuilderPackageImportResults) {
    if (completed.sourceHash === sourceHash) completedBuilderPackageImportResults.delete(requestId);
  }
  for (const [requestId, completed] of completedAnalysisResults) {
    if (completed.result.success && completed.result.snapshot.sourceHash === sourceHash) {
      completedAnalysisResults.delete(requestId);
    }
  }
  for (const [requestId, completed] of completedApprovalResults) {
    if (completed.result.success && completed.result.sourceHash === sourceHash) {
      completedApprovalResults.delete(requestId);
    }
  }
  for (const [requestId, completed] of completedConfirmationResults) {
    if (completed.result.success && completed.result.sourceHash === sourceHash) {
      completedConfirmationResults.delete(requestId);
    }
  }
  for (const [requestId, completed] of completedApplyResults) {
    if (completed.result.success && completed.result.sourceHash === sourceHash) {
      completedApplyResults.delete(requestId);
    }
  }
  for (const [requestId, completed] of completedDeclaredPairUpdateResults) {
    if (
      completed.result.success &&
      (completed.result.previousSourceHash === sourceHash ||
        completed.result.sourceHash === sourceHash)
    ) {
      completedDeclaredPairUpdateResults.delete(requestId);
    }
  }
  for (const [requestId, completed] of completedExportResults) {
    if (
      completed.sourceHash === sourceHash ||
      (completed.result.success && completed.result.sourceHash === sourceHash)
    ) {
      completedExportResults.delete(requestId);
    }
  }
}

export async function handleAnalyzeColorSystem(message: AnalyzeColorSystemMessage): Promise<void> {
  const fingerprint = safeFingerprint(message);
  if (!fingerprint) {
    post({
      type: 'color-system-audit-result',
      requestId: message.requestId,
      success: false,
      cancelled: false,
      partial: false,
      error: 'Analyze payload could not be canonicalized safely.',
    });
    return;
  }
  const replay = completedAnalysisResults.get(message.requestId);
  if (replay) {
    post(
      replay.fingerprint === fingerprint
        ? replay.result
        : {
            type: 'color-system-audit-result',
            requestId: message.requestId,
            success: false,
            cancelled: false,
            partial: false,
            error: 'requestId was already used with a different analyze payload.',
          }
    );
    return;
  }
  const existingActive = activeAnalyses.get(message.requestId);
  if (existingActive) {
    if (existingActive.fingerprint !== fingerprint) {
      console.warn('Ignored analyze payload drift for an active requestId.');
    }
    return;
  }

  const active: ActiveAnalysis = { cancelled: false, preservePartial: true, fingerprint };
  activeAnalyses.set(message.requestId, active);
  let result: ColorSystemAuditResultMessage;
  try {
    const inventory = await inventoryFigmaColorSystem(figma, {
      usageScope: message.usageScope,
      documentProfile: documentProfile(),
      sourceLocator: sourceLocator(),
      authorization: message.authorization,
      includeEnabledLibraryDescriptors: message.includeEnabledLibraryDescriptors,
      confirmWholeFile: message.confirmWholeFile,
      isCancelled: () => active.cancelled,
      onProgress: progress =>
        post({
          type: 'color-system-audit-progress',
          requestId: message.requestId,
          ...progress,
        }),
    });
    if (inventory.cancelled && !active.preservePartial) {
      result = {
        type: 'color-system-audit-result',
        requestId: message.requestId,
        success: false,
        cancelled: true,
        partial: false,
        error: 'Color-system analysis was cancelled; the partial report was discarded.',
      };
    } else {
      const snapshot = createSourceSystemSnapshot(inventory.snapshotInput);
      const audit = auditColorSystem(snapshot);
      remember(
        exportSessions,
        snapshot.sourceHash,
        {
          snapshot,
          audit,
          completeness: {
            partial: inventory.partial,
            cancelled: inventory.cancelled,
            scannedNodeCount: inventory.scannedNodeCount,
          },
          enabledLibraryDescriptors: inventory.enabledLibraryDescriptors,
          libraryBoundaryNote: inventory.libraryBoundaryNote,
        },
        MAX_SESSION_SNAPSHOTS
      );
      if (!inventory.partial && !inventory.cancelled) {
        remember(snapshots, snapshot.sourceHash, snapshot, MAX_SESSION_SNAPSHOTS);
      }
      result = {
        type: 'color-system-audit-result',
        requestId: message.requestId,
        success: true,
        cancelled: inventory.cancelled,
        partial: inventory.partial,
        scannedNodeCount: inventory.scannedNodeCount,
        snapshot,
        audit,
        enabledLibraryDescriptors: inventory.enabledLibraryDescriptors,
        libraryBoundaryNote: inventory.libraryBoundaryNote,
      };
    }
  } catch (error) {
    result = {
      type: 'color-system-audit-result',
      requestId: message.requestId,
      success: false,
      cancelled: active.cancelled,
      partial: false,
      error: errorMessage(error, 'Color-system analysis failed.'),
    };
  } finally {
    activeAnalyses.delete(message.requestId);
  }
  remember(
    completedAnalysisResults,
    message.requestId,
    { fingerprint, result },
    MAX_COMPLETED_ANALYSIS_RESULTS
  );
  post(result);
}

export async function handleImportStructuredColorSystem(
  message: ImportStructuredColorSystemMessage
): Promise<void> {
  const fingerprint = safeFingerprint(message);
  if (!fingerprint) {
    post({
      type: 'color-system-audit-result',
      requestId: message.requestId,
      success: false,
      cancelled: false,
      partial: false,
      error: 'Structured import payload could not be canonicalized safely.',
    });
    return;
  }
  const replay = completedAnalysisResults.get(message.requestId);
  if (replay) {
    post(
      replay.fingerprint === fingerprint
        ? replay.result
        : {
            type: 'color-system-audit-result',
            requestId: message.requestId,
            success: false,
            cancelled: false,
            partial: false,
            error: 'requestId was already used with a different structured import payload.',
          }
    );
    return;
  }
  const existingActive = activeStructuredImports.get(message.requestId);
  if (existingActive) {
    if (existingActive.fingerprint !== fingerprint) {
      console.warn('Ignored structured-import payload drift for an active requestId.');
    }
    return;
  }
  const active: ActiveStructuredImport = { fingerprint, cancelled: false };
  activeStructuredImports.set(message.requestId, active);

  let result: ColorSystemAuditResultMessage;
  try {
    if (!isSupportedStructuredFileName(message.fileName)) {
      throw new Error('Color token files must use .tokens, .tokens.json, or .json.');
    }
    if (utf8ByteLength(message.content) > MAX_COLOR_TOKEN_IMPORT_BYTES) {
      throw new Error(`Color token input exceeds the ${MAX_COLOR_TOKEN_IMPORT_BYTES}-byte limit.`);
    }
    const structuredDocument = await importColorTokensFromJson(message.content);
    if (active.cancelled) throw new Error('Structured color token import was cleared.');
    const snapshot = structuredDocumentToAuditSnapshot(
      structuredDocument,
      message.fileName,
      new Date().toISOString(),
      message.authorization
    );
    const audit = auditColorSystem(snapshot);
    if (active.cancelled) throw new Error('Structured color token import was cleared.');
    const libraryBoundaryNote =
      'Local structured import only; no enabled-library lookup, upload, or Figma mutation was performed.';
    remember(snapshots, snapshot.sourceHash, snapshot, MAX_SESSION_SNAPSHOTS);
    remember(
      exportSessions,
      snapshot.sourceHash,
      {
        snapshot,
        audit,
        completeness: {
          partial: false,
          cancelled: false,
          scannedNodeCount: 0,
        },
        enabledLibraryDescriptors: [],
        libraryBoundaryNote,
        structuredDocument,
      },
      MAX_SESSION_SNAPSHOTS
    );
    result = {
      type: 'color-system-audit-result',
      requestId: message.requestId,
      success: true,
      cancelled: false,
      partial: false,
      scannedNodeCount: 0,
      snapshot,
      audit,
      enabledLibraryDescriptors: [],
      libraryBoundaryNote,
    };
  } catch (error) {
    result = {
      type: 'color-system-audit-result',
      requestId: message.requestId,
      success: false,
      cancelled: active.cancelled,
      partial: false,
      error: errorMessage(error, 'Structured color token import failed.'),
    };
  } finally {
    activeStructuredImports.delete(message.requestId);
  }
  remember(
    completedAnalysisResults,
    message.requestId,
    { fingerprint, result },
    MAX_COMPLETED_ANALYSIS_RESULTS
  );
  post(result);
}

function nextImportedBuilderReceiptId(requestId: string, packageHash: string): string {
  importedBuilderPackageSequence += 1;
  return `builder-rebuild:${importedBuilderPackageSequence}:${deterministicContentHash({
    requestId,
    sequence: importedBuilderPackageSequence,
    packageHash,
  }).slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

export async function handleImportColorSystemBuilderPackage(
  message: ImportColorSystemBuilderPackageMessage
): Promise<void> {
  const fingerprint = safeFingerprint(message);
  if (!fingerprint) {
    post({
      type: 'color-system-builder-package-import-result',
      requestId: message.requestId,
      success: false,
      error: 'Builder package import payload could not be canonicalized safely.',
    });
    return;
  }
  const replay = completedBuilderPackageImportResults.get(message.requestId);
  if (replay) {
    post(
      replay.fingerprint === fingerprint
        ? replay.result
        : {
            type: 'color-system-builder-package-import-result',
            requestId: message.requestId,
            success: false,
            error: 'requestId was already used with a different builder package.',
          }
    );
    return;
  }
  const existing = activeBuilderPackageImports.get(message.requestId);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      console.warn('Ignored builder-package payload drift for an active requestId.');
    }
    return;
  }
  const active: ActiveBuilderPackageImport = { fingerprint, cancelled: false };
  activeBuilderPackageImports.set(message.requestId, active);

  let result: ColorSystemBuilderPackageImportResultMessage;
  try {
    if (!message.fileName.toLowerCase().endsWith('.json')) {
      throw new Error('Builder packages must use a .json file.');
    }
    if (utf8ByteLength(message.content) > MAX_EXPORT_BYTES) {
      throw new Error(`Builder package exceeds the ${MAX_EXPORT_BYTES}-byte import limit.`);
    }
    // Yield so a session clear issued immediately after selection can cancel
    // before parsing or retaining the imported document.
    await Promise.resolve();
    if (active.cancelled) throw new Error('Builder package import was cleared.');
    const document = parseApprovedColorSystemBuilderPackage(message.content);
    if (active.cancelled) throw new Error('Builder package import was cleared.');
    const receiptId = nextImportedBuilderReceiptId(message.requestId, document.packageHash);
    const approvedRecord: ApprovedProposalRecord = {
      snapshot: document.source.snapshot,
      proposal: document.proposal,
      reviewHash: document.review.reviewHash,
      approvalHash: document.review.approvalHash!,
      confirmedAnchorTokenIds: [...document.review.confirmedAnchorTokenIds],
      confirmedAnchors: document.review.confirmedAnchors.map(anchor => ({ ...anchor })),
      intendedSurfaces: [...document.review.intendedSurfaces],
      roleDecisions: document.review.roleDecisions.map(decision => ({ ...decision })),
      visualizationSettings: { ...document.review.visualizationSettings },
      rebuildAuthority: {
        kind: 'builder-package',
        packageHash: document.packageHash,
        outputBlueprintHash: document.outputBlueprint.outputBlueprintHash,
      },
    };
    remember(
      importedBuilderPackages,
      receiptId,
      { receiptId, document, approvedRecord },
      MAX_SESSION_SNAPSHOTS
    );
    result = {
      type: 'color-system-builder-package-import-result',
      requestId: message.requestId,
      success: true,
      receiptId,
      packageHash: document.packageHash,
      sourceHash: document.hashes.sourceHash,
      proposalHash: document.hashes.proposalHash,
      approvalHash: document.hashes.approvalHash!,
      outputBlueprintHash: document.hashes.outputBlueprintHash,
      lifecycle: 'approved',
      candidateId: document.strategy.selectedCandidate.id,
      candidateLabel: document.strategy.selectedCandidate.label,
      systemSummary: {
        primitiveCount: document.outputBlueprint.counts.tokenCount,
        aliasCount: document.outputBlueprint.counts.aliasCount,
        componentVariantCount: document.outputBlueprint.counts.scaleComponentVariantCount,
        chartSpecimenCount: document.outputBlueprint.counts.chartSpecimenCount,
      },
      boundary: {
        buildsInOpenFileOnly: true,
        createsSeparateFigmaFile: false,
        publishesFigmaLibrary: false,
      },
    };
  } catch (error) {
    result = {
      type: 'color-system-builder-package-import-result',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error, 'Builder package import failed.'),
    };
  } finally {
    activeBuilderPackageImports.delete(message.requestId);
  }
  remember(
    completedBuilderPackageImportResults,
    message.requestId,
    {
      fingerprint,
      result,
      ...(result.success ? { sourceHash: result.sourceHash } : {}),
    },
    MAX_COMPLETED_ANALYSIS_RESULTS
  );
  post(result);
}

export async function handleUpdateColorSystemDeclaredPairs(
  message: UpdateColorSystemDeclaredPairsMessage
): Promise<void> {
  const fingerprint = safeFingerprint(message);
  if (!fingerprint) {
    post({
      type: 'color-system-declared-pairs-update-result',
      requestId: message.requestId,
      success: false,
      error: 'Declared-pair update payload could not be canonicalized safely.',
    });
    return;
  }
  const replay = completedDeclaredPairUpdateResults.get(message.requestId);
  if (replay) {
    post(
      replay.fingerprint === fingerprint
        ? replay.result
        : {
            type: 'color-system-declared-pairs-update-result',
            requestId: message.requestId,
            success: false,
            error: 'requestId was already used with a different declared-pair payload.',
          }
    );
    return;
  }
  const activeFingerprint = activeDeclaredPairUpdates.get(message.requestId);
  if (activeFingerprint) {
    if (activeFingerprint !== fingerprint) {
      console.warn('Ignored declared-pair payload drift for an active requestId.');
    }
    return;
  }
  activeDeclaredPairUpdates.set(message.requestId, fingerprint);

  let result: ColorSystemDeclaredPairsUpdateResultMessage;
  try {
    const snapshot = snapshots.get(message.sourceHash);
    if (!snapshot) {
      throw new Error(
        'The complete source snapshot is not available in this plugin session. Analyze again.'
      );
    }
    assertDeclaredPairsMatchSnapshot(snapshot, message.declaredPairs);
    const { sourceHash: previousSourceHash, ...snapshotInput } = snapshot;
    const revisedSnapshot = createSourceSystemSnapshot({
      ...snapshotInput,
      declaredPairs: cloneDeclaredPairs(message.declaredPairs),
    });
    const audit = auditColorSystem(revisedSnapshot);
    const previousExportSession = exportSessions.get(previousSourceHash);

    invalidateProposalsForSourceHash(previousSourceHash);
    snapshots.delete(previousSourceHash);
    exportSessions.delete(previousSourceHash);
    remember(snapshots, revisedSnapshot.sourceHash, revisedSnapshot, MAX_SESSION_SNAPSHOTS);
    if (previousExportSession) {
      remember(
        exportSessions,
        revisedSnapshot.sourceHash,
        { ...previousExportSession, snapshot: revisedSnapshot, audit },
        MAX_SESSION_SNAPSHOTS
      );
    }
    for (const [requestId, completed] of completedAnalysisResults) {
      if (completed.result.success && completed.result.snapshot.sourceHash === previousSourceHash) {
        completedAnalysisResults.delete(requestId);
      }
    }
    for (const [requestId, completed] of completedDeclaredPairUpdateResults) {
      if (
        completed.result.success &&
        (completed.result.previousSourceHash === previousSourceHash ||
          completed.result.sourceHash === previousSourceHash)
      ) {
        completedDeclaredPairUpdateResults.delete(requestId);
      }
    }
    result = {
      type: 'color-system-declared-pairs-update-result',
      requestId: message.requestId,
      success: true,
      previousSourceHash,
      sourceHash: revisedSnapshot.sourceHash,
      snapshot: revisedSnapshot,
      audit,
    };
  } catch (error) {
    result = {
      type: 'color-system-declared-pairs-update-result',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error, 'Declared accessibility pair update failed.'),
    };
  } finally {
    activeDeclaredPairUpdates.delete(message.requestId);
  }
  remember(
    completedDeclaredPairUpdateResults,
    message.requestId,
    { fingerprint, result },
    MAX_COMPLETED_DECLARED_PAIR_RESULTS
  );
  post(result);
}

export async function handleGenerateColorSystemStrategies(
  message: GenerateColorSystemStrategiesMessage
): Promise<void> {
  const fingerprint = safeFingerprint(message);
  if (!fingerprint) {
    post({
      type: 'color-system-strategy-set-result',
      requestId: message.requestId,
      success: false,
      error: 'Strategy request could not be canonicalized safely.',
      blockers: [],
    });
    return;
  }
  const replay = completedStrategyResults.get(message.requestId);
  if (replay) {
    post(
      replay.fingerprint === fingerprint
        ? replay.result
        : {
            type: 'color-system-strategy-set-result',
            requestId: message.requestId,
            success: false,
            error: 'requestId was already used with a different strategy request.',
            blockers: [],
          }
    );
    return;
  }
  const activeFingerprint = activeStrategyGenerations.get(message.requestId);
  if (activeFingerprint) {
    if (activeFingerprint !== fingerprint) {
      console.warn('Ignored strategy payload drift for an active requestId.');
    }
    return;
  }
  activeStrategyGenerations.set(message.requestId, fingerprint);

  let result: ColorSystemStrategySetResultMessage;
  try {
    const snapshot = snapshots.get(message.sourceHash);
    if (!snapshot) throw new Error('Analyze this source again before generating strategies.');
    if (snapshot.sourceKind !== 'figma-document') {
      throw new Error('Imported token files are review-and-export only in this builder release.');
    }
    if (snapshot.documentProfile !== 'srgb') {
      throw new Error(
        `${snapshot.documentProfile} files are inventory-only; strategy generation currently requires sRGB.`
      );
    }
    const resolved = resolveBuilderPrimary(snapshot, message.confirmedPrimary);
    if (!resolved) {
      throw new StrategyGenerationError(
        'PRIMARY_CONFIRMATION_REQUIRED',
        'Teul found no structural or verified Primary. Choose one exact audited token value before generating strategies.',
        primaryConfirmationAlternatives(snapshot)
      );
    }
    const existingSourceHexes = snapshot.tokens.flatMap(token =>
      normalizedOpaqueSrgbValues(token).map(value => value.hex)
    );
    const sourceReferences = deriveColorSystemStrategySourceReferences(snapshot);
    const built = buildColorSystemStrategySet({
      sourceHash: snapshot.sourceHash,
      primary: resolved.primary,
      visualizationSettings: message.visualizationSettings,
      ...(sourceReferences ? { sourceReferences } : {}),
      existingSourceHexes,
    });
    if (built.status === 'no-solution') {
      result = {
        type: 'color-system-strategy-set-result',
        requestId: message.requestId,
        success: false,
        error:
          built.blockers[0]?.message ??
          'Teul could not produce a defensible strategy for this source.',
        blockers: built.blockers.map(projectColorSystemStrategyBlocker),
      };
    } else {
      remember(
        strategySets,
        built.strategySet.strategySetHash,
        built.strategySet,
        MAX_SESSION_PROPOSALS
      );
      result = {
        type: 'color-system-strategy-set-result',
        requestId: message.requestId,
        success: true,
        sourceHash: snapshot.sourceHash,
        strategySet: projectColorSystemStrategyPreview(built.strategySet, snapshot),
        primaryResolution: resolved.resolution,
        primaryNote: resolved.note,
      };
    }
  } catch (error) {
    result = {
      type: 'color-system-strategy-set-result',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error, 'Color-system strategy generation failed.'),
      blockers:
        error instanceof StrategyGenerationError
          ? [
              {
                code: error.code,
                message: error.message,
                alternatives: error.alternatives,
              },
            ]
          : [],
    };
  } finally {
    activeStrategyGenerations.delete(message.requestId);
  }
  remember(
    completedStrategyResults,
    message.requestId,
    { fingerprint, result, sourceHash: message.sourceHash },
    MAX_COMPLETED_STRATEGY_RESULTS
  );
  post(result);
}

export async function handleSelectColorSystemStrategy(
  message: SelectColorSystemStrategyMessage
): Promise<void> {
  const fingerprint = safeFingerprint(message);
  if (!fingerprint) {
    post({
      type: 'color-system-proposal-approval-result',
      requestId: message.requestId,
      success: false,
      error: 'Strategy selection could not be canonicalized safely.',
    });
    return;
  }
  const replay = completedApprovalResults.get(message.requestId);
  if (replay) {
    post(
      replay.fingerprint === fingerprint
        ? replay.result
        : {
            type: 'color-system-proposal-approval-result',
            requestId: message.requestId,
            success: false,
            error: 'requestId was already used with a different strategy selection.',
          }
    );
    return;
  }
  const activeFingerprint = activeStrategySelections.get(message.requestId);
  if (activeFingerprint) {
    if (activeFingerprint !== fingerprint) {
      console.warn('Ignored strategy-selection payload drift for an active requestId.');
    }
    return;
  }
  activeStrategySelections.set(message.requestId, fingerprint);

  let result: ColorSystemProposalApprovalResultMessage;
  try {
    const snapshot = snapshots.get(message.sourceHash);
    const strategySet = strategySets.get(message.strategySetHash);
    if (!snapshot || !strategySet) {
      throw new Error('The reviewed strategy is no longer in this session. Analyze again.');
    }
    if (strategySet.sourceHash !== snapshot.sourceHash) {
      throw new Error('The strategy set does not belong to the audited source.');
    }
    const compiled = compileColorSystemStrategyProposal(snapshot, strategySet, {
      candidateId: message.candidateId,
      candidateHash: message.candidateHash,
    });
    if (compiled.status === 'no-solution') {
      throw new Error(
        compiled.blockers[0]?.message ?? 'The selected strategy could not be compiled safely.'
      );
    }
    const baseProposal: ColorSystemProposal = {
      ...compiled.draft.content,
      proposalHash: compiled.draft.proposalHash,
    };
    const composed = composeColorSystemObjectiveModules(snapshot, baseProposal, [
      'product-primitives',
      'product-semantics',
    ]);
    const intendedSurfaces = ['product-primitives', 'product-semantics', 'data-visualization'];
    const confirmedAnchors: ConfirmedColorSystemAnchor[] = [
      {
        tokenId: strategySet.primary.tokenId,
        mode: strategySet.primary.mode,
        hex: strategySet.primary.hex,
      },
    ];
    const confirmedAnchorTokenIds = [strategySet.primary.tokenId];
    remember(
      proposalBundles,
      proposalBundleKey(snapshot.sourceHash, proposalBundleStrategy(composed)),
      composed,
      MAX_SESSION_PROPOSALS
    );
    let reviewHash: string | undefined;
    if (composed.status !== 'no-solution') {
      const decisionRecord = {
        snapshot,
        proposal: composed.proposal,
        confirmedAnchorTokenIds,
        confirmedAnchors,
        intendedSurfaces,
        roleDecisions: [],
        visualizationSettings: { ...strategySet.visualizationSettings },
      };
      const candidateReviewHash = createColorSystemReviewHash(decisionRecord);
      const approvalHash = createColorSystemApprovalHash(decisionRecord);
      if (composed.proposal.unresolvedBlockers.length === 0) {
        reviewHash = candidateReviewHash;
        const reviewedRecord: ApprovedProposalRecord = {
          ...decisionRecord,
          reviewHash: candidateReviewHash,
          approvalHash,
        };
        remember(reviewedProposals, candidateReviewHash, reviewedRecord, MAX_SESSION_PROPOSALS);
        remember(
          builderPackageSelections,
          composed.proposal.proposalHash,
          {
            ...reviewedRecord,
            strategySetHash: strategySet.strategySetHash,
            candidateId: message.candidateId,
            candidateHash: message.candidateHash,
          },
          MAX_SESSION_PROPOSALS
        );
      }
    }
    result = {
      type: 'color-system-proposal-approval-result',
      requestId: message.requestId,
      success: true,
      sourceHash: snapshot.sourceHash,
      bundle: composed,
      ...(reviewHash ? { reviewHash } : {}),
      confirmedAnchorTokenIds,
      intendedSurfaces,
    };
  } catch (error) {
    result = {
      type: 'color-system-proposal-approval-result',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error, 'Color-system strategy selection failed.'),
    };
  } finally {
    activeStrategySelections.delete(message.requestId);
  }
  remember(
    completedApprovalResults,
    message.requestId,
    { fingerprint, result },
    MAX_COMPLETED_APPROVAL_RESULTS
  );
  post(result);
}

export async function handleApproveColorSystemProposal(
  message: ApproveColorSystemProposalMessage
): Promise<void> {
  const fingerprint = safeFingerprint(message);
  if (!fingerprint) {
    post({
      type: 'color-system-proposal-approval-result',
      requestId: message.requestId,
      success: false,
      error: 'Proposal review payload could not be canonicalized safely.',
    });
    return;
  }
  const replay = completedApprovalResults.get(message.requestId);
  if (replay) {
    post(
      replay.fingerprint === fingerprint
        ? replay.result
        : {
            type: 'color-system-proposal-approval-result',
            requestId: message.requestId,
            success: false,
            error: 'requestId was already used with a different approval payload.',
          }
    );
    return;
  }
  const activeFingerprint = activeApprovals.get(message.requestId);
  if (activeFingerprint) {
    if (activeFingerprint !== fingerprint) {
      console.warn('Ignored proposal payload drift for an active requestId.');
    }
    return;
  }
  activeApprovals.set(message.requestId, fingerprint);

  let result: ColorSystemProposalApprovalResultMessage;
  try {
    const snapshot = snapshots.get(message.sourceHash);
    if (!snapshot) {
      throw new Error(
        'The source snapshot is not available in this plugin session. Analyze again.'
      );
    }
    assertProposalRequestMatchesSnapshot(
      snapshot,
      message.proposalRequest,
      message.confirmedAnchorTokenIds,
      message.confirmedAnchors,
      message.intendedSurfaces,
      message.roleDecisions,
      message.visualizationSettings
    );
    const baseBundle = createColorSystemProposal(
      snapshot,
      message.proposalRequest,
      message.roleDecisions
    );
    const bundle =
      baseBundle.status === 'no-solution'
        ? baseBundle
        : composeColorSystemObjectiveModules(
            snapshot,
            baseBundle,
            message.intendedSurfaces,
            message.visualizationSettings,
            message.roleDecisions
          );
    remember(
      proposalBundles,
      proposalBundleKey(snapshot.sourceHash, proposalBundleStrategy(bundle)),
      bundle,
      MAX_SESSION_PROPOSALS
    );
    let reviewHash: string | undefined;
    if (snapshot.sourceKind === 'figma-document' && bundle.status === 'suitable-candidate') {
      const decisionRecord = {
        snapshot,
        proposal: bundle.proposal,
        confirmedAnchorTokenIds: [...message.confirmedAnchorTokenIds],
        confirmedAnchors: message.confirmedAnchors.map(anchor => ({ ...anchor })),
        intendedSurfaces: [...message.intendedSurfaces],
        roleDecisions: [...message.roleDecisions],
        ...(message.visualizationSettings
          ? { visualizationSettings: { ...message.visualizationSettings } }
          : {}),
      };
      const candidateReviewHash = createColorSystemReviewHash(decisionRecord);
      const approvalHash = createColorSystemApprovalHash(decisionRecord);
      if (bundle.proposal.unresolvedBlockers.length === 0) {
        reviewHash = candidateReviewHash;
        remember(
          reviewedProposals,
          candidateReviewHash,
          {
            ...decisionRecord,
            reviewHash: candidateReviewHash,
            approvalHash,
          },
          MAX_SESSION_PROPOSALS
        );
      }
    }
    result = {
      type: 'color-system-proposal-approval-result',
      requestId: message.requestId,
      success: true,
      sourceHash: snapshot.sourceHash,
      bundle,
      ...(reviewHash ? { reviewHash } : {}),
      confirmedAnchorTokenIds: message.confirmedAnchorTokenIds,
      intendedSurfaces: message.intendedSurfaces,
    };
  } catch (error) {
    result = {
      type: 'color-system-proposal-approval-result',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error, 'Color-system proposal approval failed.'),
    };
  } finally {
    activeApprovals.delete(message.requestId);
  }
  remember(
    completedApprovalResults,
    message.requestId,
    { fingerprint, result },
    MAX_COMPLETED_APPROVAL_RESULTS
  );
  post(result);
}

export async function handleConfirmColorSystemProposal(
  message: ConfirmColorSystemProposalMessage
): Promise<void> {
  const fingerprint = safeFingerprint(message);
  if (!fingerprint) {
    post({
      type: 'color-system-proposal-confirmation-result',
      requestId: message.requestId,
      success: false,
      error: 'Proposal confirmation payload could not be canonicalized safely.',
    });
    return;
  }
  const replay = completedConfirmationResults.get(message.requestId);
  if (replay) {
    post(
      replay.fingerprint === fingerprint
        ? replay.result
        : {
            type: 'color-system-proposal-confirmation-result',
            requestId: message.requestId,
            success: false,
            error: 'requestId was already used with a different confirmation payload.',
          }
    );
    return;
  }
  const activeFingerprint = activeConfirmations.get(message.requestId);
  if (activeFingerprint) {
    if (activeFingerprint !== fingerprint) {
      console.warn('Ignored confirmation payload drift for an active requestId.');
    }
    return;
  }
  activeConfirmations.set(message.requestId, fingerprint);

  let result: ColorSystemProposalConfirmationResultMessage;
  try {
    const record = reviewedProposals.get(message.reviewHash);
    if (!record) throw new Error('Review this proposal again before approval.');
    if (record.reviewHash !== message.reviewHash) {
      throw new Error('The immutable review receipt does not match this approval request.');
    }
    if (record.proposal.proposalHash !== message.proposalHash) {
      throw new Error('The reviewed proposal hash does not match this approval request.');
    }
    if (record.snapshot.sourceHash !== message.sourceHash) {
      throw new Error('The reviewed source hash does not match this approval request.');
    }
    if (!sameStringSet(record.confirmedAnchorTokenIds, message.confirmedAnchorTokenIds)) {
      throw new Error('The reviewed anchors changed before approval.');
    }
    if (!sameConfirmedAnchors(record.confirmedAnchors, message.confirmedAnchors)) {
      throw new Error('The reviewed anchor modes or values changed before approval.');
    }
    if (!sameStringSet(record.intendedSurfaces, message.intendedSurfaces)) {
      throw new Error('The reviewed intended surfaces changed before approval.');
    }
    if (
      !sameStringSet(
        canonicalRoleDecisions(record.roleDecisions),
        canonicalRoleDecisions(message.roleDecisions)
      )
    ) {
      throw new Error('The reviewed role decisions changed before approval.');
    }
    if (
      createColorSystemReviewHash(record) !== message.reviewHash ||
      createColorSystemApprovalHash(record) !== record.approvalHash
    ) {
      throw new Error('The immutable proposal decision receipt failed revalidation.');
    }
    assertIntendedSurfaceCoverage(record.proposal, message.intendedSurfaces);
    remember(approvedProposals, record.approvalHash, record, MAX_SESSION_PROPOSALS);
    result = {
      type: 'color-system-proposal-confirmation-result',
      requestId: message.requestId,
      success: true,
      sourceHash: message.sourceHash,
      proposalHash: message.proposalHash,
      reviewHash: message.reviewHash,
      approvalHash: record.approvalHash,
    };
  } catch (error) {
    result = {
      type: 'color-system-proposal-confirmation-result',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error, 'Color-system proposal confirmation failed.'),
    };
  } finally {
    activeConfirmations.delete(message.requestId);
  }
  remember(
    completedConfirmationResults,
    message.requestId,
    { fingerprint, result },
    MAX_COMPLETED_CONFIRMATION_RESULTS
  );
  post(result);
}

export async function handleApplyColorSystemProposal(
  message: ApplyColorSystemProposalMessage
): Promise<void> {
  const fingerprint = safeFingerprint(message);
  if (!fingerprint) {
    post({
      type: 'color-system-proposal-apply-result',
      requestId: message.requestId,
      success: false,
      error: 'Proposal apply payload could not be canonicalized safely.',
      ...applyFailureDetails(null),
    });
    return;
  }
  const replay = completedApplyResults.get(message.requestId);
  if (replay) {
    post(
      replay.fingerprint === fingerprint
        ? replay.result
        : {
            type: 'color-system-proposal-apply-result',
            requestId: message.requestId,
            success: false,
            error: 'requestId was already used with a different apply payload.',
            ...applyFailureDetails(null),
          }
    );
    return;
  }
  const activeApply = activeApplies.get(message.requestId);
  if (activeApply) {
    if (activeApply.fingerprint !== fingerprint) {
      console.warn('Ignored apply payload drift for an active requestId.');
    }
    return;
  }
  const active: ActiveApply = {
    fingerprint,
    sourceHash: message.sourceHash,
    cancelled: false,
  };
  activeApplies.set(message.requestId, active);

  let result: ColorSystemProposalApplyResultMessage;
  try {
    const record = approvedProposals.get(message.approvalHash);
    if (!record) {
      throw new Error(
        'The approved proposal is not available in this plugin session. Review it again.'
      );
    }
    if (record.approvalHash !== message.approvalHash) {
      throw new Error('The immutable approval receipt does not match this apply request.');
    }
    const report = await applyApprovedColorSystemProposal(record, message, () => active.cancelled);
    result = {
      type: 'color-system-proposal-apply-result',
      requestId: message.requestId,
      success: true,
      ...report,
    };
    try {
      figma.notify(
        report.libraryPageName
          ? `Created “${report.libraryPageName}” with its color collection, components, and chart specimens.`
          : `Created "${report.overviewFrameName}" on the canvas with its new color collection and styles.`
      );
    } catch (notificationError) {
      console.warn(
        'Color proposal applied but the success notification failed.',
        notificationError
      );
    }
  } catch (error) {
    result = {
      type: 'color-system-proposal-apply-result',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error, 'Approved color-system proposal apply failed.'),
      ...applyFailureDetails(error),
    };
    try {
      figma.notify('Color-system proposal was not applied.');
    } catch (notificationError) {
      console.warn(
        'Color proposal failed and the failure notification also failed.',
        notificationError
      );
    }
  } finally {
    activeApplies.delete(message.requestId);
  }
  remember(
    completedApplyResults,
    message.requestId,
    { fingerprint, result },
    MAX_COMPLETED_APPLY_RESULTS
  );
  post(result);
}

export async function handleRebuildColorSystemBuilderPackage(
  message: RebuildColorSystemBuilderPackageMessage
): Promise<void> {
  const fingerprint = safeFingerprint(message);
  if (!fingerprint) {
    post({
      type: 'color-system-proposal-apply-result',
      requestId: message.requestId,
      success: false,
      error: 'Builder package rebuild payload could not be canonicalized safely.',
      ...applyFailureDetails(null),
    });
    return;
  }
  const replay = completedApplyResults.get(message.requestId);
  if (replay) {
    post(
      replay.fingerprint === fingerprint
        ? replay.result
        : {
            type: 'color-system-proposal-apply-result',
            requestId: message.requestId,
            success: false,
            error: 'requestId was already used with a different rebuild payload.',
            ...applyFailureDetails(null),
          }
    );
    return;
  }
  const existing = activeApplies.get(message.requestId);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      console.warn('Ignored builder-package rebuild payload drift for an active requestId.');
    }
    return;
  }
  const retained = importedBuilderPackages.get(message.receiptId);
  const active: ActiveApply = {
    fingerprint,
    sourceHash: retained?.document.hashes.sourceHash ?? 'builder-package:unresolved',
    cancelled: false,
  };
  activeApplies.set(message.requestId, active);

  let result: ColorSystemProposalApplyResultMessage;
  try {
    if (!retained) {
      throw new Error('This builder package is no longer available. Open it again.');
    }
    if (retained.receiptId !== message.receiptId) {
      throw new Error('The backend builder package receipt does not match this rebuild.');
    }
    if (retained.document.packageHash !== message.packageHash) {
      throw new Error('The builder package changed after it was opened. Open it again.');
    }
    if (active.cancelled) throw new Error('Builder package rebuild was cleared.');
    // Reparse a canonical backend-owned serialization on every rebuild. This
    // repeats schema, approval, compiler, and output-blueprint verification;
    // the imported document is never treated as executable instructions.
    const document = parseApprovedColorSystemBuilderPackage(
      serializeColorSystemBuilderPackage(retained.document)
    );
    if (
      document.packageHash !== retained.document.packageHash ||
      document.hashes.outputBlueprintHash !== retained.document.hashes.outputBlueprintHash
    ) {
      throw new Error('The retained builder package failed deterministic revalidation.');
    }
    const applyMessage: ApplyColorSystemProposalMessage = {
      type: 'apply-color-system-proposal',
      requestId: message.requestId,
      sourceHash: document.hashes.sourceHash,
      proposalHash: document.hashes.proposalHash,
      approvalHash: document.hashes.approvalHash!,
      systemName: message.systemName,
      collisionPolicy: message.collisionPolicy,
      createVariables: message.createVariables,
      createStyles: message.createStyles,
      confirmedAnchorTokenIds: [...document.review.confirmedAnchorTokenIds],
      confirmedAnchors: document.review.confirmedAnchors.map(anchor => ({ ...anchor })),
      confirmedIntendedSurfaces: [...document.review.intendedSurfaces],
    };
    const report = await applyApprovedColorSystemProposal(
      retained.approvedRecord,
      applyMessage,
      () => active.cancelled
    );
    if (report.outputBlueprintHash !== document.hashes.outputBlueprintHash) {
      throw new Error('Created output did not retain exact builder-package blueprint parity.');
    }
    result = {
      type: 'color-system-proposal-apply-result',
      requestId: message.requestId,
      success: true,
      ...report,
      rebuildSource: 'builder-package',
      builderPackageHash: document.packageHash,
      blueprintParity: 'exact',
    };
    try {
      figma.notify(
        report.libraryPageName
          ? `Built “${report.libraryPageName}” in this open file. Publication remains manual.`
          : `Built “${report.overviewFrameName}” in this open file.`
      );
    } catch (notificationError) {
      console.warn('Builder package rebuilt but notification failed.', notificationError);
    }
  } catch (error) {
    result = {
      type: 'color-system-proposal-apply-result',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error, 'Builder package rebuild failed.'),
      ...applyFailureDetails(error),
    };
  } finally {
    activeApplies.delete(message.requestId);
  }
  remember(
    completedApplyResults,
    message.requestId,
    { fingerprint, result, sourceHash: active.sourceHash },
    MAX_COMPLETED_APPLY_RESULTS
  );
  post(result);
}

export async function handleExportColorSystemArtifact(
  message: ExportColorSystemArtifactMessage
): Promise<void> {
  const fingerprint = safeFingerprint(message);
  if (!fingerprint) {
    post({
      type: 'color-system-export-result',
      requestId: message.requestId,
      success: false,
      error: 'Color-system export payload could not be canonicalized safely.',
    });
    return;
  }
  const replay = completedExportResults.get(message.requestId);
  if (replay) {
    post(
      replay.fingerprint === fingerprint
        ? replay.result
        : {
            type: 'color-system-export-result',
            requestId: message.requestId,
            success: false,
            error: 'requestId was already used with a different export payload.',
          }
    );
    return;
  }
  const existingActive = activeExports.get(message.requestId);
  if (existingActive) {
    if (existingActive.fingerprint !== fingerprint) {
      console.warn('Ignored color-system export payload drift for an active requestId.');
    }
    return;
  }
  const active: ActiveExport = {
    fingerprint,
    sourceHash: message.sourceHash,
    cancelled: false,
  };
  activeExports.set(message.requestId, active);

  let result: ColorSystemExportResultMessage;
  try {
    const session = exportSessions.get(message.sourceHash);
    if (!session) {
      throw new Error('The source snapshot is not available for export in this plugin session.');
    }
    assertExportActive(active);
    const bundle = message.proposalStrategy
      ? proposalBundles.get(proposalBundleKey(message.sourceHash, message.proposalStrategy))
      : undefined;
    if (message.proposalStrategy && !message.proposalHash) {
      if (message.kind !== 'audit' || !bundle || bundle.status !== 'no-solution') {
        throw new Error('A proposal strategy must be bound to an explicit proposal hash.');
      }
    }
    if (message.proposalHash && !message.proposalStrategy) {
      throw new Error('A proposal hash must be bound to its proposal strategy.');
    }
    if (message.proposalHash) {
      if (!bundle || bundle.status === 'no-solution') {
        throw new Error('The requested proposal is not available for export.');
      }
      if (bundle.proposal.proposalHash !== message.proposalHash) {
        throw new Error('The requested proposal hash does not match the session proposal.');
      }
    }

    let content: string;
    let fileName: string;
    let builderPackageHash: string | undefined;
    if (message.kind === 'audit') {
      const proposal = bundle && bundle.status !== 'no-solution' ? bundle.proposal : undefined;
      const proposalOutcome = bundle
        ? bundle.status === 'no-solution'
          ? {
              status: bundle.status,
              strategy: bundle.strategy,
              blockers: bundle.blockers,
            }
          : {
              status: bundle.status,
              strategy: bundle.proposal.strategy,
              blockers: [],
            }
        : undefined;
      content = serializeColorSystemAuditExport(
        createColorSystemAuditExport({
          snapshot: session.snapshot,
          audit: session.audit,
          ...(proposal ? { proposal } : {}),
          ...(proposalOutcome ? { proposalOutcome } : {}),
          enabledLibraryDescriptors: session.enabledLibraryDescriptors,
          reviewerDecisions: message.reviewerDecisions,
          libraryBoundaryNote: session.libraryBoundaryNote,
          completeness: session.completeness,
          exportedAt: new Date().toISOString(),
        })
      );
      fileName = `teul-color-audit-${message.sourceHash.replace(/[^a-z0-9]+/gi, '-')}.json`;
    } else if (message.kind === 'source-teul') {
      if (!session.structuredDocument) {
        throw new Error('A normalized source-token export requires a structured source import.');
      }
      content = await exportColorTokensToTeulJson(session.structuredDocument);
      assertExportActive(active);
      fileName = 'teul-color-tokens.json';
    } else if (message.kind === 'source-dtcg') {
      if (!session.structuredDocument) {
        throw new Error('A DTCG source export requires a structured source import.');
      }
      content = exportColorTokensToDtcgJson(session.structuredDocument);
      fileName = 'design-tokens.tokens.json';
    } else if (message.kind === 'builder-package') {
      const receipt = message.builderPackageReceipt;
      if (!receipt) throw new Error('A builder package receipt is required for export.');
      const selection = builderPackageSelections.get(receipt.proposalHash);
      if (!selection) {
        throw new Error(
          'The selected builder proposal is no longer in this session. Select it again.'
        );
      }
      if (
        selection.snapshot.sourceHash !== message.sourceHash ||
        selection.proposal.proposalHash !== receipt.proposalHash ||
        selection.reviewHash !== receipt.reviewHash
      ) {
        throw new Error(
          'The builder package receipt does not match the selected session proposal.'
        );
      }
      const strategySet = strategySets.get(selection.strategySetHash);
      if (!strategySet || strategySet.sourceHash !== message.sourceHash) {
        throw new Error(
          'The selected strategy set is stale. Analyze and select a direction again.'
        );
      }
      if (receipt.approvalHash !== undefined) {
        const approved = approvedProposals.get(receipt.approvalHash);
        if (
          !approved ||
          approved.snapshot.sourceHash !== message.sourceHash ||
          approved.proposal.proposalHash !== receipt.proposalHash ||
          approved.reviewHash !== receipt.reviewHash ||
          approved.approvalHash !== receipt.approvalHash
        ) {
          throw new Error('The builder approval receipt is missing, stale, or does not match.');
        }
      }
      const document = createColorSystemBuilderPackage({
        snapshot: session.snapshot,
        audit: session.audit,
        completeness: session.completeness,
        strategySet,
        candidateId: selection.candidateId,
        candidateHash: selection.candidateHash,
        proposal: selection.proposal,
        decision: {
          reviewHash: selection.reviewHash,
          confirmedAnchorTokenIds: selection.confirmedAnchorTokenIds,
          confirmedAnchors: selection.confirmedAnchors,
          intendedSurfaces: selection.intendedSurfaces,
          roleDecisions: selection.roleDecisions,
          visualizationSettings:
            selection.visualizationSettings ?? strategySet.visualizationSettings,
          ...(receipt.approvalHash ? { approvalHash: receipt.approvalHash } : {}),
        },
      });
      content = serializeColorSystemBuilderPackage(document);
      builderPackageHash = document.packageHash;
      await Promise.resolve();
      assertExportActive(active);
      fileName = `teul-color-system-${selection.candidateId}-${receipt.proposalHash.slice(7, 19)}.json`;
    } else {
      if (
        !message.proposalStrategy ||
        !message.proposalHash ||
        !bundle ||
        bundle.status === 'no-solution'
      ) {
        throw new Error('A suitable or ranked session proposal is required for token export.');
      }
      if (message.proposalHash && message.proposalHash !== bundle.proposal.proposalHash) {
        throw new Error('The requested proposal hash does not match the session proposal.');
      }
      const document = colorSystemProposalToStructuredTokens(bundle.proposal);
      content = await exportColorTokensToTeulJson(document);
      assertExportActive(active);
      fileName = `teul-proposal-${bundle.proposal.proposalHash.replace(/[^a-z0-9]+/gi, '-')}.json`;
    }
    assertExportSize(content);
    assertExportActive(active);
    result =
      message.kind === 'builder-package'
        ? {
            type: 'color-system-export-result',
            requestId: message.requestId,
            success: true,
            sourceHash: message.sourceHash,
            kind: message.kind,
            artifactVersion: COLOR_SYSTEM_BUILDER_PACKAGE_SCHEMA_VERSION,
            artifactHash: builderPackageHash!,
            fileName,
            mimeType: 'application/json',
            content,
          }
        : {
            type: 'color-system-export-result',
            requestId: message.requestId,
            success: true,
            sourceHash: message.sourceHash,
            kind: message.kind,
            fileName,
            mimeType: 'application/json',
            content,
          };
  } catch (error) {
    result = {
      type: 'color-system-export-result',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error, 'Color-system artifact export failed.'),
    };
  } finally {
    activeExports.delete(message.requestId);
  }
  if (active.cancelled) {
    post(result);
    return;
  }
  remember(
    completedExportResults,
    message.requestId,
    { fingerprint, result, sourceHash: message.sourceHash },
    MAX_COMPLETED_EXPORT_RESULTS
  );
  post(result);
}
