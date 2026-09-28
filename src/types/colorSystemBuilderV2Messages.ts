import type { ColorSystemReviewModelV2 } from '../lib/colorSystemReviewModelV2';
import type {
  ColorSystemBrandConstraintsV1,
  ColorSystemBrandTerritoryRuleV1,
} from '../lib/colorSystemBrandConstraintsV1';
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

/**
 * p4-DE: bounds for an owner-supplied spot color. The name is the reference
 * exactly as the owner typed it; Teul validates its shape and never its content.
 */
export const COLOR_SYSTEM_OWNER_SPOT_COLOR_LIMITS_V2 = {
  maximumNameLength: 40,
  /** One entry per family at most; mirrors the 24-family ceiling. */
  maximumEntries: 24,
} as const;

/**
 * p4-DE: a spot reference the owner typed for one brand-surface family. Spot
 * references are licensed data, so the only accepted source is the owner.
 */
export interface ColorSystemBuilderV2OwnerSpotColorMessage {
  system: 'pantone' | 'other';
  /** Trimmed, 1–40 characters, no control characters. */
  name: string;
  finish: 'coated' | 'uncoated' | 'none';
  source: 'owner-supplied';
}

/** p4-DE: keyed by the review's `brandSurfaces.families[].id` (the family's stable id). */
export type ColorSystemBuilderV2OwnerSpotColorsMessage = Readonly<
  Record<string, ColorSystemBuilderV2OwnerSpotColorMessage>
>;

/**
 * p4-DE: how a spot reference prints everywhere Teul shows it: the system word
 * once, then the owner's text verbatim. Shared by the review, the Variable
 * descriptions and the success receipt so the three never disagree.
 */
export function colorSystemOwnerSpotColorLabelV2(
  spot: Pick<ColorSystemBuilderV2OwnerSpotColorMessage, 'system' | 'name'>
): string {
  return spot.system === 'pantone' && !/^pantone\b/i.test(spot.name)
    ? `Pantone ${spot.name}`
    : spot.name;
}

export interface CreateIntelligentColorSystemV2Message {
  type: 'create-intelligent-color-system-v2';
  requestId: string;
  sessionId: string;
  directionId: string;
  collisionPolicy: 'create-copy';
  currentFileAcknowledged: true;
  manualPublicationAcknowledged: true;
  /** p4-DE: present only when the owner typed at least one spot reference. */
  ownerSpotColors?: ColorSystemBuilderV2OwnerSpotColorsMessage;
}

export type ColorSystemGenericV2SourceScope =
  'automatic' | 'selection' | 'current-page' | 'whole-file';

export interface AnalyzeGenericColorSystemV2Message {
  type: 'analyze-generic-color-system-v2';
  requestId: string;
  sourceScope: ColorSystemGenericV2SourceScope;
  confirmWholeFile: boolean;
  dataVisualization: ColorSystemBuilderV2DataVisualizationRequest;
  /** Unadopted source or working rules, bound to the fresh snapshot by the backend. */
  brandConstraintRules?: readonly ColorSystemBrandTerritoryRuleV1[];
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
  reviewedBrandConstraints?: ColorSystemBrandConstraintsV1;
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
  ColorSystemGenericV2ConfirmedReadyMessage | ColorSystemGenericV2ConfirmationFailureMessage;

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

/**
 * p3-C: portable token texts derived from the created (or verified) resource
 * blueprint. Optional so older backends and export failures degrade to a
 * success without copy actions.
 */
export interface ColorSystemBuilderV2TokenExportMessage {
  format: 'dtcg-2025.10';
  defaultMode: string;
  modes: readonly string[];
  tokenCount: number;
  aliasCount: number;
  /** W3C Design Tokens (DTCG 2025.10) JSON document. */
  dtcgJson: string;
  /** Flat CSS custom properties, one `:root` block per mode. */
  cssText: string;
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
  /** p3-C: present when the backend could derive the token exports. */
  tokens?: ColorSystemBuilderV2TokenExportMessage;
  /**
   * p4-DE: present when the Create request carried owner spot colors. `supplied`
   * counts the request entries; `descriptionsWritten` counts the Variable
   * descriptions the renderer wrote (anchor step and matching source token).
   */
  ownerSpotColors?: {
    supplied: number;
    descriptionsWritten: number;
  };
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
