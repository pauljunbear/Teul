/**
 * Type-safe message protocol between UI and Figma plugin backend
 */

import type {
  ColorSystemConfig,
  ColorSystemData,
  NormalizedDocumentColorProfile,
} from './colorSystem';
import type {
  ConfirmedColorSystemAnchor,
  ColorSystemAudit,
  ColorSystemProposalRequest,
  ColorSystemVisualizationSettings,
  DeclaredAccessibilityPair,
  ProposalReviewerRoleDecision,
  ProposalBundle,
  ProductSemanticRole,
  SnapshotAuthorization,
  SnapshotUsageScope,
  SourceSystemSnapshot,
} from './colorSystemAudit';
import type {
  ColorSystemConfirmedPrimaryMismatchCode,
  ColorSystemStrategyBuilderBlockerCode,
  ColorSystemStrategyDirection,
  ColorSystemStrategyPrimary,
  ColorSystemStrategySearchEvidence,
  ColorSystemStrategyVisualizationSettings,
} from '../lib/colorSystemStrategyBuilder';
import type {
  FigmaRowsColsLayoutGrid,
  FigmaUniformLayoutGrid,
  GridApplicationMode,
  GridResponsiveWidth,
  GridConfig,
  GridConstructionV2,
  GridLinkedResourcePolicy,
  GridNativeResources,
  GridSelectionTarget,
} from './grid';
import type {
  ColorSystemBuilderV2PluginMessage,
  ColorSystemBuilderV2UIMessage,
} from './colorSystemBuilderV2Messages';
import type {
  GetHistoricalColorDataMessage,
  HistoricalColorDataResultMessage,
} from './historicalColorData';

/** Shared per-string ceiling for detailed audit evidence and rollback diagnostics. */
export const COLOR_SYSTEM_AUDIT_EVIDENCE_TEXT_LIMIT = 16 * 1024;

// ============================================
// Color Message Types
// ============================================

export interface GradientColor {
  hex: string;
  name: string;
}

export interface FigmaGridConfig {
  columns?: FigmaRowsColsLayoutGrid;
  rows?: FigmaRowsColsLayoutGrid;
  baseline?: FigmaUniformLayoutGrid;
}

export type { NormalizedDocumentColorProfile } from './colorSystem';

export function isNormalizedDocumentColorProfile(
  value: unknown
): value is NormalizedDocumentColorProfile {
  return value === 'legacy' || value === 'srgb' || value === 'display-p3' || value === 'unknown';
}

// ============================================
// UI → Plugin Messages
// ============================================

export interface ApplyFillMessage {
  type: 'apply-fill';
  requestId: string;
  hex: string;
  name: string;
}

export interface ApplyStrokeMessage {
  type: 'apply-stroke';
  requestId: string;
  hex: string;
  name: string;
}

export interface CreateStyleMessage {
  type: 'create-style';
  requestId: string;
  hex: string;
  name: string;
}

export interface GetSelectionForGridMessage {
  type: 'get-selection-for-grid';
  requestId?: string;
}

export interface GetDocumentColorProfileMessage {
  type: 'get-document-color-profile';
}

export interface GetAccessibilitySelectionMessage {
  type: 'get-selection-for-accessibility';
  requestId: string;
}

export interface ApplyGradientMessage {
  type: 'apply-gradient';
  requestId: string;
  gradientType: 'LINEAR' | 'RADIAL' | 'ANGULAR' | 'DIAMOND';
  colors: GradientColor[];
}

export interface NotifyMessage {
  type: 'notify';
  text: string;
}

export interface GenerateColorSystemMessage {
  type: 'generate-color-system';
  requestId: string;
  createStyles: boolean;
  createVariables: boolean;
  collisionPolicy?: 'cancel' | 'update-local' | 'create-copy';
  config: ColorSystemConfig;
  scales: ColorSystemData;
}

export interface AnalyzeColorSystemMessage {
  type: 'analyze-color-system';
  requestId: string;
  usageScope: Exclude<SnapshotUsageScope, 'not-applicable'>;
  confirmWholeFile: boolean;
  includeEnabledLibraryDescriptors: boolean;
  authorization: SnapshotAuthorization;
}

/** Builds three deterministic, read-only directions from the audited source. */
export interface GenerateColorSystemStrategiesMessage {
  type: 'generate-color-system-strategies';
  requestId: string;
  sourceHash: string;
  /** Explicit review context; Teul never invents meaning-bearing chart intent. */
  visualizationSettings: ColorSystemStrategyVisualizationSettings;
  /** Optional only when Teul cannot resolve an exact Primary from source structure. */
  confirmedPrimary?: ConfirmedColorSystemAnchor;
}

/** Selects the exact preview candidate that should enter the guarded approval pipeline. */
export interface SelectColorSystemStrategyMessage {
  type: 'select-color-system-strategy';
  requestId: string;
  sourceHash: string;
  strategySetHash: string;
  candidateId: ColorSystemStrategyDirection;
  candidateHash: string;
}

/** Bounded local text import. The UI reads the user-selected file; parsing remains backend-owned. */
export interface ImportStructuredColorSystemMessage {
  type: 'import-structured-color-system';
  requestId: string;
  fileName: string;
  content: string;
  authorization: SnapshotAuthorization;
}

/** Imports one inert, versioned builder package for a guarded rebuild in the open Design file. */
export interface ImportColorSystemBuilderPackageMessage {
  type: 'import-color-system-builder-package';
  requestId: string;
  fileName: string;
  content: string;
}

/** Rebuilds only a backend-retained, fully revalidated approved builder package. */
export interface RebuildColorSystemBuilderPackageMessage {
  type: 'rebuild-color-system-builder-package';
  requestId: string;
  receiptId: string;
  packageHash: string;
  systemName: string;
  collisionPolicy: 'cancel' | 'create-copy';
  createVariables: boolean;
  createStyles: boolean;
  /** Explicit acknowledgement that Teul writes only to the currently open file. */
  acknowledgeOpenFileBoundary: true;
}

export interface CancelColorSystemAnalysisMessage {
  type: 'cancel-color-system-analysis';
  targetRequestId: string;
  preservePartial: boolean;
}

export interface ClearColorSystemAuditSessionMessage {
  type: 'clear-color-system-audit-session';
  sourceHash?: string;
}

/** Replaces the reviewer-declared accessibility contexts on a complete session snapshot. */
export interface UpdateColorSystemDeclaredPairsMessage {
  type: 'update-color-system-declared-pairs';
  requestId: string;
  sourceHash: string;
  declaredPairs: DeclaredAccessibilityPair[];
}

export interface ApproveColorSystemProposalMessage {
  type: 'approve-color-system-proposal';
  requestId: string;
  sourceHash: string;
  proposalRequest: ColorSystemProposalRequest;
  confirmedAnchorTokenIds: string[];
  confirmedAnchors: ConfirmedColorSystemAnchor[];
  intendedSurfaces: string[];
  roleDecisions: ProposalReviewerRoleDecision[];
  visualizationSettings?: ColorSystemVisualizationSettings;
}

export interface ConfirmColorSystemProposalMessage {
  type: 'confirm-color-system-proposal';
  requestId: string;
  sourceHash: string;
  proposalHash: string;
  /** Immutable receipt for the exact proposal inputs presented during review. */
  reviewHash: string;
  confirmedAnchorTokenIds: string[];
  confirmedAnchors: ConfirmedColorSystemAnchor[];
  intendedSurfaces: string[];
  roleDecisions: ProposalReviewerRoleDecision[];
}

export interface ApplyColorSystemProposalMessage {
  type: 'apply-color-system-proposal';
  requestId: string;
  sourceHash: string;
  proposalHash: string;
  /** Immutable receipt created only after the reviewed proposal is explicitly confirmed. */
  approvalHash: string;
  systemName: string;
  collisionPolicy: 'cancel' | 'create-copy';
  createVariables: boolean;
  createStyles: boolean;
  confirmedAnchorTokenIds: string[];
  confirmedAnchors: ConfirmedColorSystemAnchor[];
  confirmedIntendedSurfaces: string[];
}

export interface ColorSystemAuditReviewerDecisionMessage {
  kind: 'anchor' | 'intended-surface' | 'role' | 'omission';
  subjectId: string;
  disposition: 'confirmed' | 'rejected' | 'omitted';
  /** Distinguishes source-backed role evidence from a bounded reviewer assignment. */
  assignmentSource?: 'source-evidence' | 'reviewer-assigned';
  note?: string;
}

export type ColorSystemExportKind =
  | 'audit'
  | 'source-teul'
  | 'source-dtcg'
  | 'proposal-teul'
  | 'builder-package';

export interface ColorSystemBuilderPackageReceiptMessage {
  schemaVersion: 'teul-color-system-builder-package/v1';
  proposalHash: string;
  reviewHash: string;
  approvalHash?: string;
}

/** Requests inert JSON from backend-owned snapshots, proposals, and structured source documents. */
export interface ExportColorSystemArtifactMessage {
  type: 'export-color-system-artifact';
  requestId: string;
  sourceHash: string;
  kind: ColorSystemExportKind;
  proposalStrategy?: 'exact-radix' | 'brand-preserving' | 'hybrid';
  proposalHash?: string;
  /** Correlation receipts only; all export authority and package content remain backend-owned. */
  builderPackageReceipt?: ColorSystemBuilderPackageReceiptMessage;
  reviewerDecisions: ColorSystemAuditReviewerDecisionMessage[];
}

export interface CreateGridFrameMessage {
  type: 'create-grid-frame';
  requestId: string;
  config: FigmaGridConfig;
  frameName: string;
  width: number;
  height: number;
  positionNearSelection?: boolean;
  construction?: GridConstructionV2;
}

export interface ApplyGridMessage {
  type: 'apply-grid';
  requestId: string;
  sourceConfig: GridConfig;
  sourceDimensions?: { width: number; height: number };
  applicationMode: GridApplicationMode;
  responsiveWidth?: GridResponsiveWidth;
  expectedTargetIds: string[];
  replaceExisting: boolean;
  nativeResources?: GridNativeResources;
  linkedResourcePolicy?: GridLinkedResourcePolicy;
  construction?: GridConstructionV2;
}

export interface ClearGridMessage {
  type: 'clear-grid';
  requestId: string;
  expectedTargetIds: string[];
}

export interface CaptureSelectedGridMessage {
  type: 'capture-selected-grid';
  requestId: string;
}

export interface GetGridStorageMessage {
  type: 'get-grid-storage';
  requestId: string;
}

export interface SetGridStorageMessage {
  type: 'set-grid-storage';
  requestId: string;
  value: string;
}

export interface DeleteGridStorageMessage {
  type: 'delete-grid-storage';
  requestId: string;
}

export interface GetWorkspaceStorageMessage {
  type: 'get-workspace-storage';
  requestId: string;
}

export interface SetWorkspaceStorageMessage {
  type: 'set-workspace-storage';
  requestId: string;
  value: string;
}

/**
 * All messages that can be sent from UI to Plugin
 */
export type UIToPluginMessage =
  | ApplyFillMessage
  | ApplyStrokeMessage
  | CreateStyleMessage
  | GetSelectionForGridMessage
  | GetDocumentColorProfileMessage
  | GetHistoricalColorDataMessage
  | GetAccessibilitySelectionMessage
  | ApplyGradientMessage
  | NotifyMessage
  | GenerateColorSystemMessage
  | AnalyzeColorSystemMessage
  | GenerateColorSystemStrategiesMessage
  | SelectColorSystemStrategyMessage
  | ImportStructuredColorSystemMessage
  | ImportColorSystemBuilderPackageMessage
  | RebuildColorSystemBuilderPackageMessage
  | CancelColorSystemAnalysisMessage
  | ClearColorSystemAuditSessionMessage
  | UpdateColorSystemDeclaredPairsMessage
  | ApproveColorSystemProposalMessage
  | ConfirmColorSystemProposalMessage
  | ApplyColorSystemProposalMessage
  | ExportColorSystemArtifactMessage
  | CreateGridFrameMessage
  | ApplyGridMessage
  | ClearGridMessage
  | CaptureSelectedGridMessage
  | GetGridStorageMessage
  | SetGridStorageMessage
  | DeleteGridStorageMessage
  | GetWorkspaceStorageMessage
  | SetWorkspaceStorageMessage
  | ColorSystemBuilderV2UIMessage;

// ============================================
// Plugin → UI Messages
// ============================================

export interface SelectionInfoMessage {
  type: 'selection-info';
  requestId?: string;
  hasSelection: boolean;
  isFrame: boolean;
  selectedCount: number;
  eligibleTargets: GridSelectionTarget[];
  ineligibleCount: number;
  width?: number;
  height?: number;
  name?: string;
}

export interface DocumentColorProfileMessage {
  type: 'document-color-profile';
  profile: NormalizedDocumentColorProfile;
}

interface AccessibilitySelectionResultBase {
  type: 'accessibility-selection-result';
  requestId: string;
}

export type AccessibilitySelectionResultMessage =
  | (AccessibilitySelectionResultBase & {
      success: true;
      profile: 'srgb';
      foreground: string;
      background: string;
      foregroundSource: string;
      backgroundSource: string;
      error?: never;
    })
  | (AccessibilitySelectionResultBase & {
      success: false;
      profile: NormalizedDocumentColorProfile;
      foreground?: never;
      background?: never;
      foregroundSource?: never;
      backgroundSource?: never;
      error: string;
    });

export interface ColorSystemOperationResultMessage {
  type: 'color-system-operation-result';
  requestId: string;
  success: boolean;
  message?: string;
  outputName?: string;
  modes?: string[];
  primitiveCount?: number;
  semanticAliasCount?: number;
  styleCount?: number;
  frameCount?: number;
  skippedCount?: number;
  warnings?: string[];
  error?: string;
}

export interface ColorSystemAuditProgressMessage {
  type: 'color-system-audit-progress';
  requestId: string;
  phase: 'resources' | 'usage' | 'libraries' | 'complete';
  completed: number;
  total: number;
  pageName?: string;
  message: string;
}

export interface EnabledLibraryVariableDescriptorMessage {
  collectionKey: string;
  collectionName: string;
  libraryName: string;
  variables: readonly {
    key: string;
    name: string;
    resolvedType: 'BOOLEAN' | 'COLOR' | 'FLOAT' | 'STRING';
  }[];
}

export type ColorSystemAuditResultMessage =
  | {
      type: 'color-system-audit-result';
      requestId: string;
      success: true;
      cancelled: boolean;
      partial: boolean;
      scannedNodeCount: number;
      snapshot: SourceSystemSnapshot;
      audit: ColorSystemAudit;
      enabledLibraryDescriptors: readonly EnabledLibraryVariableDescriptorMessage[];
      libraryBoundaryNote: string;
    }
  | {
      type: 'color-system-audit-result';
      requestId: string;
      success: false;
      cancelled: boolean;
      partial: false;
      error: string;
    };

export type ColorSystemDeclaredPairsUpdateResultMessage =
  | {
      type: 'color-system-declared-pairs-update-result';
      requestId: string;
      success: true;
      previousSourceHash: string;
      sourceHash: string;
      snapshot: SourceSystemSnapshot;
      audit: ColorSystemAudit;
    }
  | {
      type: 'color-system-declared-pairs-update-result';
      requestId: string;
      success: false;
      error: string;
    };

/**
 * Exact display projection of one backend-owned strategy candidate. The iframe
 * receives no generation provenance or canonical model authority; selection is
 * still resolved from the retained full set by id and candidate hash.
 */
export interface ColorSystemStrategyPreviewCandidate {
  id: ColorSystemStrategyDirection;
  candidateHash: string;
  label: string;
  rationale: string;
  primary: ColorSystemStrategyPrimary;
  secondaryFamilies: readonly [
    {
      id: string;
      name: string;
      familyIndex: 1;
      lightSteps: readonly string[];
      darkSteps: readonly string[];
    },
    {
      id: string;
      name: string;
      familyIndex: 2;
      lightSteps: readonly string[];
      darkSteps: readonly string[];
    },
  ];
  visualization: {
    categorical: readonly string[];
    sequential: readonly string[];
    diverging: readonly string[];
  };
  /** Every Product semantic alias that the selected system will create. */
  productSemantics: readonly {
    role: ProductSemanticRole;
    light: { targetTokenId: string; targetName: string; hex: string };
    dark: { targetTokenId: string; targetName: string; hex: string };
  }[];
}

export interface ColorSystemStrategyPreviewBlocker {
  code: ColorSystemStrategyBuilderBlockerCode;
  message: string;
  direction?: ColorSystemStrategyDirection;
  duplicateOfDirection?: ColorSystemStrategyDirection;
  /** Exact bounded search counts only; generated values remain backend-owned. */
  searchEvidence?: ColorSystemStrategySearchEvidence;
  alternatives: readonly string[];
}

export type ColorSystemStrategyFailureBlockerCode =
  | ColorSystemStrategyBuilderBlockerCode
  | ColorSystemConfirmedPrimaryMismatchCode
  | 'PRIMARY_CONFIRMATION_REQUIRED';

export interface ColorSystemStrategyFailureBlocker {
  code: ColorSystemStrategyFailureBlockerCode;
  message: string;
  /** Present only for a direction-specific bounded search failure. */
  direction?: ColorSystemStrategyDirection;
  /** Exact count receipt; it contains no generated colors or model values. */
  searchEvidence?: ColorSystemStrategySearchEvidence;
  alternatives: readonly string[];
}

/** Compact transport-only view of the full backend-owned strategy set. */
export interface ColorSystemStrategyPreviewSet {
  schemaVersion: '1.0.0';
  policyVersion: 'teul-secondary-strategy-v1';
  sourceHash: string;
  strategySetHash: string;
  primary: ColorSystemStrategyPrimary;
  recommendation: {
    policyVersion: 'teul-strategy-recommendation-v1';
    recommendedCandidateId: ColorSystemStrategyDirection;
    statement: string;
  };
  /** One to three complete, non-duplicate systems available for selection. */
  candidates: readonly ColorSystemStrategyPreviewCandidate[];
  /** Honest disclosures for directions that failed or collapsed as duplicates. */
  blockers: readonly ColorSystemStrategyPreviewBlocker[];
}

export type ColorSystemStrategySetResultMessage =
  | {
      type: 'color-system-strategy-set-result';
      requestId: string;
      success: true;
      sourceHash: string;
      strategySet: ColorSystemStrategyPreviewSet;
      primaryResolution: 'structured-source' | 'verified-role' | 'user-confirmed';
      primaryNote: string;
    }
  | {
      type: 'color-system-strategy-set-result';
      requestId: string;
      success: false;
      error: string;
      blockers: readonly ColorSystemStrategyFailureBlocker[];
    };

export type ColorSystemProposalApprovalResultMessage =
  | {
      type: 'color-system-proposal-approval-result';
      requestId: string;
      success: true;
      sourceHash: string;
      bundle: ProposalBundle;
      /** Present only when the returned bundle is eligible for explicit confirmation. */
      reviewHash?: string;
      confirmedAnchorTokenIds: readonly string[];
      intendedSurfaces: readonly string[];
    }
  | {
      type: 'color-system-proposal-approval-result';
      requestId: string;
      success: false;
      error: string;
    };

export type ColorSystemProposalConfirmationResultMessage =
  | {
      type: 'color-system-proposal-confirmation-result';
      requestId: string;
      success: true;
      sourceHash: string;
      proposalHash: string;
      reviewHash: string;
      approvalHash: string;
    }
  | {
      type: 'color-system-proposal-confirmation-result';
      requestId: string;
      success: false;
      error: string;
    };

export const COLOR_SYSTEM_APPLY_FAILURE_RECEIPT_VERSION =
  'teul-color-system-apply-failure/v1' as const;
export const COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION =
  'teul-color-system-apply-cleanup/v1' as const;

/** Backend-owned point at which an approved Apply stopped. */
export type ColorSystemApplyFailureStage =
  | 'preflight'
  | 'source-revalidation'
  | 'variable-creation'
  | 'style-creation'
  | 'overview-library-rendering'
  | 'verification'
  | 'journal-clear'
  | 'commit'
  | 'recovery';

/**
 * Bounded cleanup evidence for a failed Apply. A null removal count is an
 * explicit statement that a partial host failure prevented an exact count.
 */
export interface ColorSystemApplyCleanupReceipt {
  version: typeof COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION;
  attempted: boolean;
  removedResourceCount: number | null;
  complete: boolean;
  failureCount: number;
  failureMessages: readonly string[];
}

export type ColorSystemProposalApplyResultMessage =
  | {
      type: 'color-system-proposal-apply-result';
      requestId: string;
      success: true;
      sourceHash: string;
      proposalHash: string;
      approvalHash: string;
      outputName: string;
      collectionName?: string;
      variableCount: number;
      aliasCount: number;
      styleCount: number;
      overviewFrameName: string;
      overviewScaleCount: number;
      overviewSwatchCount: number;
      outputBlueprintHash?: string;
      libraryPageName?: string;
      componentCount?: number;
      componentSetCount?: number;
      chartSpecimenCount?: number;
      boundPaintCount?: number;
      createdNodeCount?: number;
      publicationStatus?: 'manual-review-required';
      rebuildSource?: 'builder-package';
      builderPackageHash?: string;
      blueprintParity?: 'exact';
      warnings: readonly string[];
      undoBoundaryCommitted: true;
    }
  | {
      type: 'color-system-proposal-apply-result';
      requestId: string;
      success: false;
      error: string;
      failureReceiptVersion: typeof COLOR_SYSTEM_APPLY_FAILURE_RECEIPT_VERSION;
      failureStage: ColorSystemApplyFailureStage;
      cleanupReceipt: ColorSystemApplyCleanupReceipt;
      /** Compatibility projection of cleanupReceipt.failureMessages. */
      rollbackFailures: readonly string[];
    };

export type ColorSystemBuilderPackageImportResultMessage =
  | {
      type: 'color-system-builder-package-import-result';
      requestId: string;
      success: true;
      receiptId: string;
      packageHash: string;
      sourceHash: string;
      proposalHash: string;
      approvalHash: string;
      outputBlueprintHash: string;
      lifecycle: 'approved';
      candidateId: ColorSystemStrategyDirection;
      candidateLabel: string;
      systemSummary: {
        primitiveCount: number;
        aliasCount: number;
        componentVariantCount: number;
        chartSpecimenCount: number;
      };
      boundary: {
        buildsInOpenFileOnly: true;
        createsSeparateFigmaFile: false;
        publishesFigmaLibrary: false;
      };
    }
  | {
      type: 'color-system-builder-package-import-result';
      requestId: string;
      success: false;
      error: string;
    };

export type ColorSystemExportResultMessage =
  | {
      type: 'color-system-export-result';
      requestId: string;
      success: true;
      sourceHash: string;
      kind: Exclude<ColorSystemExportKind, 'builder-package'>;
      fileName: string;
      mimeType: 'application/json';
      content: string;
    }
  | {
      type: 'color-system-export-result';
      requestId: string;
      success: true;
      sourceHash: string;
      kind: 'builder-package';
      artifactVersion: 'teul-color-system-builder-package/v1';
      artifactHash: string;
      fileName: string;
      mimeType: 'application/json';
      content: string;
    }
  | {
      type: 'color-system-export-result';
      requestId: string;
      success: false;
      error: string;
    };

export type MutationOperation =
  | 'apply-fill'
  | 'apply-stroke'
  | 'create-style'
  | 'apply-gradient'
  | 'create-grid-frame';

export interface MutationOperationResultMessage {
  type: 'mutation-operation-result';
  requestId: string;
  operation: MutationOperation;
  success: boolean;
  message: string;
  error?: string;
}

export interface GridAppliedMessage {
  type: 'grid-applied';
  requestId: string;
  success: boolean;
  appliedCount: number;
  skippedCount: number;
  failedCount: number;
  message: string;
  frameName?: string;
  frameWidth?: number;
  frameHeight?: number;
  error?: string;
  realization?: GridConstructionV2['realization'];
}

export interface GridStorageResultMessage {
  type: 'grid-storage-result';
  requestId: string;
  operation: 'get' | 'set' | 'delete';
  success: boolean;
  value?: string | null;
  error?: string;
}

export interface WorkspaceStorageResultMessage {
  type: 'workspace-storage-result';
  requestId: string;
  operation: 'get' | 'set';
  success: boolean;
  value?: string | null;
  error?: string;
}

export interface GridCaptureResultMessage {
  type: 'grid-capture-result';
  requestId: string;
  success: boolean;
  config?: GridConfig;
  frameName?: string;
  dimensions?: { width: number; height: number };
  nativeResources?: GridNativeResources;
  error?: string;
}

/** All messages that can be sent from the plugin sandbox to the UI iframe. */
export type PluginToUIMessage =
  | SelectionInfoMessage
  | DocumentColorProfileMessage
  | HistoricalColorDataResultMessage
  | AccessibilitySelectionResultMessage
  | ColorSystemOperationResultMessage
  | ColorSystemAuditProgressMessage
  | ColorSystemAuditResultMessage
  | ColorSystemDeclaredPairsUpdateResultMessage
  | ColorSystemStrategySetResultMessage
  | ColorSystemProposalApprovalResultMessage
  | ColorSystemProposalConfirmationResultMessage
  | ColorSystemProposalApplyResultMessage
  | ColorSystemBuilderPackageImportResultMessage
  | ColorSystemExportResultMessage
  | MutationOperationResultMessage
  | GridAppliedMessage
  | GridStorageResultMessage
  | WorkspaceStorageResultMessage
  | GridCaptureResultMessage
  | ColorSystemBuilderV2PluginMessage;
