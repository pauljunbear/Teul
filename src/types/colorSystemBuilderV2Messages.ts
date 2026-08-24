import type { ColorSystemReviewModelV2 } from '../lib/colorSystemReviewModelV2';
import type {
  ColorSystemGenericPlanConfirmationDraftV2,
  ColorSystemGenericPlanGapV2,
  ColorSystemGenericPlanOutcomeKindV2,
  ColorSystemGenericPlanProposalV2,
  ColorSystemGenericPlanRoleV2,
  ColorSystemGenericPlanStateV2,
} from '../components/ColorSystemGenericPlanReviewV2';
import type { SnapshotUsageScope } from './colorSystemAudit';

export type ColorSystemBuilderV2UsageScope = Exclude<SnapshotUsageScope, 'not-applicable'>;

export interface ColorSystemBuilderV2DataVisualizationRequest {
  mode: 'Light' | 'Dark';
  surfaceContext: 'light' | 'dark';
  categoricalMarkCount: number;
  sequentialMarkCount: number;
  divergingMarkCount: 3 | 5 | 7 | 9;
  adjacency: 'separated' | 'touching';
  midpointMeaning: string;
}

export interface AnalyzeIntelligentColorSystemV2Message {
  type: 'analyze-intelligent-color-system-v2';
  requestId: string;
  sourceScopeMode: 'auto' | 'manual';
  usageScope: ColorSystemBuilderV2UsageScope;
  confirmWholeFile: boolean;
  dataVisualization: ColorSystemBuilderV2DataVisualizationRequest;
}

export interface CreateIntelligentColorSystemV2Message {
  type: 'create-intelligent-color-system-v2';
  requestId: string;
  sessionId: string;
  directionId: string;
  collisionPolicy: 'create-copy';
  currentFileAcknowledged: true;
  manualPublicationAcknowledged: true;
}

export type ColorSystemGenericV2SourceScope =
  | 'automatic'
  | 'selection'
  | 'current-page'
  | 'whole-file';

export interface AnalyzeGenericColorSystemV2Message {
  type: 'analyze-generic-color-system-v2';
  requestId: string;
  sourceScope: ColorSystemGenericV2SourceScope;
  confirmWholeFile: boolean;
  dataVisualization: ColorSystemBuilderV2DataVisualizationRequest;
}

export interface CancelGenericColorSystemV2Message {
  type: 'cancel-generic-color-system-v2';
  requestId: string;
  targetRequestId: string;
}

export interface ConfirmGenericColorSystemPlanV2Message {
  type: 'confirm-generic-color-system-plan-v2';
  requestId: string;
  analysisId: string;
  snapshotHash: string;
  proposalId: string;
  draft: ColorSystemGenericPlanConfirmationDraftV2;
}

export type ColorSystemBuilderV2UIMessage =
  | AnalyzeIntelligentColorSystemV2Message
  | CreateIntelligentColorSystemV2Message
  | AnalyzeGenericColorSystemV2Message
  | CancelGenericColorSystemV2Message
  | ConfirmGenericColorSystemPlanV2Message;

export interface ColorSystemBuilderV2ProgressMessage {
  type: 'intelligent-color-system-v2-progress';
  requestId: string;
  phase: 'reading-source' | 'building-directions' | 'revalidating' | 'creating';
  message: string;
}

export interface ColorSystemBuilderV2BlockerMessage {
  code: string;
  message: string;
  recovery: string;
}

export interface ColorSystemGenericV2ProgressMessage {
  type: 'generic-color-system-v2-progress';
  requestId: string;
  analysisId: string | null;
  phase:
    | 'reading-source'
    | 'loading-pages'
    | 'classifying-evidence'
    | 'building-plan'
    | 'revalidating'
    | 'confirming';
  message: string;
  loadedPageCount: number;
  discoveredResourceCount: number;
  visitedNodeCount: number;
  cancellable: boolean;
}

type ColorSystemGenericV2ReviewablePlanState =
  | (ColorSystemGenericPlanStateV2 & {
      kind: 'ready' | 'partial';
      firstBlockerId?: never;
    })
  | (ColorSystemGenericPlanStateV2 & {
      kind: 'ambiguous';
      firstBlockerId: string;
    });

type ColorSystemGenericV2BlockedPlanState = ColorSystemGenericPlanStateV2 & {
  kind: Exclude<ColorSystemGenericPlanOutcomeKindV2, 'ready' | 'partial' | 'ambiguous'>;
  firstBlockerId: string;
};

export type ColorSystemGenericV2PlanResultMessage =
  | {
      type: 'generic-color-system-v2-plan-result';
      requestId: string;
      analysisId: string;
      snapshotHash: string;
      state: ColorSystemGenericV2ReviewablePlanState;
      proposal: ColorSystemGenericPlanProposalV2;
    }
  | {
      type: 'generic-color-system-v2-plan-result';
      requestId: string;
      analysisId: string | null;
      snapshotHash: string | null;
      state: ColorSystemGenericV2BlockedPlanState;
      proposal: ColorSystemGenericPlanProposalV2 | null;
      gaps: readonly ColorSystemGenericPlanGapV2[];
    };

export interface ColorSystemGenericV2ConfirmationReceiptMessage {
  sourceSnapshotHash: string;
  proposalHash: string;
  displayedPlanHash: string;
  displayedPlanJson: string;
  sectionDecisions: ColorSystemGenericPlanConfirmationDraftV2['sectionDecisions'];
  ownerEditedRoles: readonly ColorSystemGenericPlanRoleV2[];
  generatedPolarity: {
    policyVersion: 'teul-color-system-generic-secondary-generation/v1';
    negativeContributionId: string;
    positiveContributionId: string;
    status: 'owner-confirmed';
    evidenceIds: readonly string[];
  } | null;
  acknowledgedGapIds: readonly string[];
  adapterVersion: string;
  inferencePolicyVersion: string;
  confirmationPolicyVersion: string;
  confirmedAt: string;
  confirmationHash: string;
  handoffHash: string;
}

export interface ColorSystemGenericV2ConfirmedReadyMessage {
  type: 'generic-color-system-v2-confirmation-result';
  requestId: string;
  success: true;
  status: 'confirmed-ready';
  analysisId: string;
  snapshotHash: string;
  proposalId: string;
  receipt: ColorSystemGenericV2ConfirmationReceiptMessage;
  sessionId: string;
  sourceColorCount: number;
  scannedNodeCount: number;
  resolvedUsageScope: ColorSystemBuilderV2UsageScope;
  recommendedDirectionId: string;
  selectedDirectionId: string;
  reviews: readonly ColorSystemReviewModelV2[];
  limitations: readonly string[];
}

export type ColorSystemGenericV2ConfirmationFailureKind = Exclude<
  ColorSystemGenericPlanOutcomeKindV2,
  'ready' | 'partial' | 'empty'
>;

export interface ColorSystemGenericV2ConfirmationFailureMessage {
  type: 'generic-color-system-v2-confirmation-result';
  requestId: string;
  success: false;
  analysisId: string;
  snapshotHash: string | null;
  state: ColorSystemGenericPlanStateV2 & {
    kind: ColorSystemGenericV2ConfirmationFailureKind;
    firstBlockerId: string;
  };
  gaps: readonly ColorSystemGenericPlanGapV2[];
  error: string;
}

export type ColorSystemGenericV2ConfirmationResultMessage =
  | ColorSystemGenericV2ConfirmedReadyMessage
  | ColorSystemGenericV2ConfirmationFailureMessage;

export type ColorSystemBuilderV2AnalysisResultMessage =
  | {
      type: 'intelligent-color-system-v2-analysis-result';
      requestId: string;
      success: true;
      sessionId: string;
      sourceColorCount: number;
      scannedNodeCount: number;
      resolvedUsageScope: ColorSystemBuilderV2UsageScope;
      recommendedDirectionId: string;
      selectedDirectionId: string;
      reviews: readonly ColorSystemReviewModelV2[];
      limitations: readonly string[];
    }
  | {
      type: 'intelligent-color-system-v2-analysis-result';
      requestId: string;
      success: false;
      blockers: readonly ColorSystemBuilderV2BlockerMessage[];
      error: string;
    };

export interface ColorSystemBuilderV2CleanupReceiptMessage {
  attempted: boolean;
  complete: boolean;
  removedResourceCount: number;
  errors: readonly string[];
}

interface ColorSystemBuilderV2CreateSuccessBase {
  type: 'intelligent-color-system-v2-create-result';
  requestId: string;
  success: true;
  sessionId: string;
  directionId: string;
  outputName: string;
  pageName: string;
  resourceBlueprintHash: string;
  createAuthorizationHash: string;
  manualPublicationRequired: true;
  warnings: readonly string[];
}

export type ColorSystemBuilderV2CreateResultMessage =
  | (ColorSystemBuilderV2CreateSuccessBase & {
      action: 'created';
      created: {
        collections: 2;
        variables: number;
        styles: number;
        components: number;
        frames: 5;
      };
    })
  | (ColorSystemBuilderV2CreateSuccessBase & {
      action: 'verified-no-op';
      created: {
        collections: 0;
        variables: 0;
        styles: 0;
        components: 0;
        frames: 0;
      };
    })
  | {
      type: 'intelligent-color-system-v2-create-result';
      requestId: string;
      success: false;
      failureStage: 'preflight' | 'revalidation' | 'authorization' | 'creation' | 'verification';
      cleanup: ColorSystemBuilderV2CleanupReceiptMessage;
      error: string;
    };

export type ColorSystemBuilderV2PluginMessage =
  | ColorSystemBuilderV2ProgressMessage
  | ColorSystemBuilderV2AnalysisResultMessage
  | ColorSystemBuilderV2CreateResultMessage
  | ColorSystemGenericV2ProgressMessage
  | ColorSystemGenericV2PlanResultMessage
  | ColorSystemGenericV2ConfirmationResultMessage;
