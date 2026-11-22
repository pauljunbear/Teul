import * as React from 'react';
import { ColorSystemBrandRulesImportV1 } from './ColorSystemBrandRulesImportV1';
import type { ColorSystemBrandTerritoryRuleV1 } from '../lib/colorSystemBrandConstraintsV1';
import { buildColorSystemBrandConstraintsV1 } from '../lib/colorSystemBrandConstraintsV1';
import { copyToClipboard } from '../lib/clipboard';
import { validatePluginToUIMessage } from '../lib/messageValidation';
import { consumeRequestId, createRequestId } from '../lib/requestId';
import type { ColorSystemReviewModelV2 } from '../lib/colorSystemReviewModelV2';
import type {
  AnalyzeGenericColorSystemV2Message,
  CancelGenericColorSystemV2Message,
  ColorSystemBuilderV2AnalysisResultMessage,
  ColorSystemBuilderV2CreateResultMessage,
  ColorSystemBuilderV2DataVisualizationRequest,
  ColorSystemBuilderV2OwnerSpotColorsMessage, // p4-DE
  ColorSystemBuilderV2UsageScope,
  ColorSystemGenericV2ConfirmedReadyMessage,
  ColorSystemGenericV2PlanResultMessage,
  ConfirmGenericColorSystemPlanV2Message,
  CreateIntelligentColorSystemV2Message,
} from '../types/colorSystemBuilderV2Messages';
import {
  ColorSystemBuilderV2Review,
  themeFor as reviewThemeFor,
  type ColorSystemBuilderV2CreateAcknowledgements,
} from './ColorSystemBuilderV2Review';
import {
  ColorSystemGenericPlanReviewV2,
  splitErrorReference,
  type ColorSystemGenericPlanConfirmationDraftV2,
  type ColorSystemGenericPlanGapV2,
  type ColorSystemGenericPlanProposalV2,
  type ColorSystemGenericPlanRecoveryActionV2,
  type ColorSystemGenericPlanStateV2,
} from './ColorSystemGenericPlanReviewV2';

export interface ColorSystemBuilderV2TabProps {
  isDark: boolean;
  isActive?: boolean;
  releaseChannel?: 'candidate' | 'qualified';
}

type UsageScope = ColorSystemBuilderV2UsageScope;
type SourceScopeChoice = 'auto' | UsageScope;
type Stage =
  'idle' | 'analyzing' | 'plan' | 'confirming' | 'review' | 'creating' | 'blocked' | 'success';
type RecoveryAction = 'retry-analysis' | 'reanalyze' | 'return-to-review' | null;

const DEFAULT_DATA_VISUALIZATION_REQUEST: ColorSystemBuilderV2DataVisualizationRequest = {
  mode: 'Light',
  surfaceContext: 'light',
  categoricalMarkCount: 5,
  sequentialMarkCount: 5,
  divergingMarkCount: 3,
  adjacency: 'separated',
  midpointMeaning: 'Zero or neutral midpoint',
};

/** Longest silence Teul tolerates from the plugin sandbox before it stops waiting. */
export const COLOR_SYSTEM_BUILDER_V2_RESPONSE_TIMEOUT_MS = 30_000;
/** Analysis, cancel, and plan confirmation are read-only, so nothing changed. */
export const RESPONSE_TIMEOUT_MESSAGE =
  'Teul did not hear back from Figma in 30 seconds. Nothing was changed. Try again or start over.';
/** Create mutates the file, so a silent host cannot be described as "nothing changed". */
export const CREATE_RESPONSE_TIMEOUT_MESSAGE =
  'Teul did not hear back from Figma in 30 seconds. Teul cannot confirm whether the system was created. Check the file, then analyze again or start over.';
export const UNDO_NOTE = 'One native Undo (⌘Z) removes everything Teul just created.';

const DATA_COUNT_CONTROLS = [
  {
    label: 'Categorical colors',
    id: 'teul-v2-categorical-count',
    key: 'categoricalMarkCount',
    options: [2, 3, 4, 5, 6, 7, 8],
  },
  {
    label: 'Sequential steps',
    id: 'teul-v2-sequential-count',
    key: 'sequentialMarkCount',
    options: [3, 4, 5, 6, 7, 8, 9],
  },
  {
    label: 'Diverging steps',
    id: 'teul-v2-diverging-count',
    key: 'divergingMarkCount',
    options: [3, 5, 7, 9],
  },
] as const;

interface PendingAnalyze {
  requestId: string;
  brandConstraintRules?: readonly ColorSystemBrandTerritoryRuleV1[];
}

interface PendingCancel {
  requestId: string;
  targetRequestId: string;
}

interface PendingConfirmation {
  requestId: string;
  analysisId: string;
  snapshotHash: string;
  proposalId: string;
  draft: ColorSystemGenericPlanConfirmationDraftV2;
}

interface PendingCreate {
  requestId: string;
  sessionId: string;
  directionId: string;
}

interface AnalysisReceipt {
  sessionId: string;
  recommendedDirectionId: string;
  reviews: readonly ColorSystemReviewModelV2[];
  sourceColorCount: number;
  scannedNodeCount: number;
  resolvedUsageScope: UsageScope;
  limitations: readonly string[];
}

interface GenericPlanView {
  analysisId: string | null;
  snapshotHash: string | null;
  state: ColorSystemGenericPlanStateV2;
  proposal: ColorSystemGenericPlanProposalV2 | null;
  outcomeGaps: readonly ColorSystemGenericPlanGapV2[];
}

type CreateSuccess = Extract<ColorSystemBuilderV2CreateResultMessage, { success: true }>;

interface TabTheme {
  background: string;
  panel: string;
  raised: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  danger: string;
  success: string;
}

/** Same palette as the review; only the key names differ. */
function themeFor(isDark: boolean): TabTheme {
  const review = reviewThemeFor(isDark);
  return {
    background: review.canvas,
    panel: review.panel,
    raised: review.raised,
    text: review.text,
    muted: review.muted,
    border: review.border,
    accent: review.accent,
    accentText: review.accentText,
    danger: review.danger,
    success: review.positive,
  };
}

function postPluginMessage(message: unknown): void {
  window.parent.postMessage({ pluginMessage: message }, '*');
}

function scopeLabel(scope: UsageScope): string {
  if (scope === 'selection') return 'Current selection';
  if (scope === 'current-page') return 'Current page';
  return 'Whole open file';
}

function sourceChoiceLabel(choice: SourceScopeChoice): string {
  return choice === 'auto' ? 'Automatic source detection' : scopeLabel(choice);
}

function eventPluginMessage(event: MessageEvent): unknown {
  if (
    event.data !== null &&
    typeof event.data === 'object' &&
    'pluginMessage' in (event.data as Record<string, unknown>)
  ) {
    return (event.data as { pluginMessage: unknown }).pluginMessage;
  }
  return event.data;
}

function rawRequestId(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const requestId = (value as Record<string, unknown>).requestId;
  return typeof requestId === 'string' ? requestId : null;
}

function analysisReceipt(
  message:
    | Extract<ColorSystemBuilderV2AnalysisResultMessage, { success: true }>
    | ColorSystemGenericV2ConfirmedReadyMessage
): AnalysisReceipt {
  return {
    sessionId: message.sessionId,
    recommendedDirectionId: message.recommendedDirectionId,
    reviews: message.reviews,
    sourceColorCount: message.sourceColorCount,
    scannedNodeCount: message.scannedNodeCount,
    resolvedUsageScope: message.resolvedUsageScope,
    limitations: message.limitations,
  };
}

function genericPlanView(message: ColorSystemGenericV2PlanResultMessage): GenericPlanView {
  return {
    analysisId: message.analysisId,
    snapshotHash: message.snapshotHash,
    state: message.state,
    proposal: message.proposal,
    outcomeGaps: 'gaps' in message ? message.gaps : [],
  };
}

function receiptMatchesDraft(
  receipt: ColorSystemGenericV2ConfirmedReadyMessage['receipt'],
  draft: ColorSystemGenericPlanConfirmationDraftV2
): boolean {
  const sameMembers = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && left.every(value => right.includes(value));
  const constraints = receipt.reviewedBrandConstraints;
  const ruleDraft = draft.brandRuleDecisions;
  const rulesMatch =
    (!constraints && !ruleDraft) ||
    Boolean(
      constraints &&
      ruleDraft &&
      buildColorSystemBrandConstraintsV1({
        schemaVersion: constraints.schemaVersion,
        sourceSnapshotHash: constraints.sourceSnapshotHash,
        rules: constraints.rules,
        decisions: [],
      }).fragmentHash === ruleDraft.fragmentHash &&
      constraints.decisions.length === ruleDraft.decisions.length &&
      constraints.decisions.every(decision =>
        ruleDraft.decisions.some(
          expected => expected.ruleId === decision.ruleId && expected.status === decision.status
        )
      )
    );
  return (
    rulesMatch &&
    JSON.stringify(receipt.sectionDecisions) === JSON.stringify(draft.sectionDecisions) &&
    sameMembers(receipt.ownerEditedRoles, draft.ownerEditedRoles) &&
    sameMembers(receipt.acknowledgedGapIds, draft.acknowledgedGapIds)
  );
}

export function ColorSystemBuilderV2Tab({
  isDark,
  isActive = true,
  releaseChannel = 'candidate',
}: ColorSystemBuilderV2TabProps) {
  const theme = themeFor(isDark);
  const smallSecondaryButtonStyle: React.CSSProperties = {
    padding: '6px 9px',
    borderRadius: 6,
    color: theme.text,
    background: theme.raised,
    border: `1px solid ${theme.border}`,
    fontSize: 11,
  };
  /** Bold bordered secondary action; `quiet` drops the raised fill. */
  const actionButtonStyle = (
    minHeight: number,
    padding: string,
    extra: React.CSSProperties = {},
    quiet = false
  ): React.CSSProperties => ({
    minHeight,
    padding,
    borderRadius: 7,
    color: theme.text,
    background: quiet ? 'transparent' : theme.raised,
    border: `1px solid ${theme.border}`,
    fontWeight: 700,
    ...extra,
  });
  const dotStyle: React.CSSProperties = {
    width: 2,
    height: 2,
    borderRadius: '50%',
    background: 'currentColor',
  };
  /** The two full-width actions shown while analysis runs. */
  const analyzingButtonExtra: React.CSSProperties = {
    width: '100%',
    marginTop: 8,
    borderRadius: 8,
    fontSize: 12,
  };
  const dataFieldStyle: React.CSSProperties = {
    margin: 0,
    padding: 9,
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
  };
  const dataRadioRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'nowrap',
  };
  const dataRadioLabelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    whiteSpace: 'nowrap',
  };
  const dataCountLabelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 11 };
  const dataCountSelectStyle: React.CSSProperties = {
    minHeight: 34,
    color: theme.text,
    background: theme.raised,
    border: `1px solid ${theme.border}`,
    borderRadius: 7,
  };
  const [stage, setStage] = React.useState<Stage>('idle');
  const [sourceChoice, setSourceChoice] = React.useState<SourceScopeChoice>('auto');
  const [brandConstraintRules, setBrandConstraintRules] =
    React.useState<readonly ColorSystemBrandTerritoryRuleV1[]>();
  const [brandRulesReady, setBrandRulesReady] = React.useState(true);
  const [dataVisualization, setDataVisualization] =
    React.useState<ColorSystemBuilderV2DataVisualizationRequest>(
      DEFAULT_DATA_VISUALIZATION_REQUEST
    );
  const [progress, setProgress] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [recovery, setRecovery] = React.useState<string | null>(null);
  const [recoveryAction, setRecoveryAction] = React.useState<RecoveryAction>(null);
  const [analysis, setAnalysis] = React.useState<AnalysisReceipt | null>(null);
  const [selectedDirectionId, setSelectedDirectionId] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<CreateSuccess | null>(null);
  const [genericPlan, setGenericPlan] = React.useState<GenericPlanView | null>(null);
  const [genericSubmitError, setGenericSubmitError] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState(false);
  const pendingAnalyze = React.useRef<PendingAnalyze | null>(null);
  const pendingCancel = React.useRef<PendingCancel | null>(null);
  const pendingConfirmation = React.useRef<PendingConfirmation | null>(null);
  const pendingCreate = React.useRef<PendingCreate | null>(null);
  const previousStage = React.useRef<Stage>('idle');
  const analyzeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const progressRef = React.useRef<HTMLParagraphElement | null>(null);
  const reviewStageRef = React.useRef<HTMLDivElement | null>(null);
  const recoveryRef = React.useRef<HTMLDivElement | null>(null);
  const successRef = React.useRef<HTMLHeadingElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const responseTimers = React.useRef<Record<string, number>>({});

  const clearResponseTimer = React.useCallback((requestId: string) => {
    const timer = responseTimers.current[requestId];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete responseTimers.current[requestId];
    }
  }, []);

  const clearAllResponseTimers = React.useCallback(() => {
    for (const requestId of Object.keys(responseTimers.current)) clearResponseTimer(requestId);
  }, [clearResponseTimer]);

  const timeoutPendingRequest = React.useCallback(
    (requestId: string) => {
      const analyze = pendingAnalyze.current;
      const cancel = pendingCancel.current;
      const confirmation = pendingConfirmation.current;
      const create = pendingCreate.current;
      if (confirmation?.requestId === requestId) {
        consumeRequestId(requestId);
        pendingConfirmation.current = null;
        setProgress('');
        setGenericSubmitError(RESPONSE_TIMEOUT_MESSAGE);
        setStage('plan');
        return;
      }
      if (analyze?.requestId === requestId || cancel?.requestId === requestId) {
        if (analyze) {
          consumeRequestId(analyze.requestId);
          clearResponseTimer(analyze.requestId);
        }
        if (cancel) {
          consumeRequestId(cancel.requestId);
          clearResponseTimer(cancel.requestId);
        }
        pendingAnalyze.current = null;
        pendingCancel.current = null;
        setCancelling(false);
        setProgress('');
        setError(RESPONSE_TIMEOUT_MESSAGE);
        setRecovery(null);
        setRecoveryAction('retry-analysis');
        setStage('blocked');
        return;
      }
      if (create?.requestId === requestId) {
        consumeRequestId(requestId);
        pendingCreate.current = null;
        setProgress('');
        setError(CREATE_RESPONSE_TIMEOUT_MESSAGE);
        setRecovery(null);
        setRecoveryAction('reanalyze');
        setStage('blocked');
      }
    },
    [clearResponseTimer]
  );

  /** Progress replies re-arm the timer, so only real silence times out. */
  const armResponseTimer = React.useCallback(
    (requestId: string) => {
      clearResponseTimer(requestId);
      responseTimers.current[requestId] = window.setTimeout(() => {
        delete responseTimers.current[requestId];
        timeoutPendingRequest(requestId);
      }, COLOR_SYSTEM_BUILDER_V2_RESPONSE_TIMEOUT_MS);
    },
    [clearResponseTimer, timeoutPendingRequest]
  );

  const failPendingResponse = React.useCallback(
    (requestId: string, message: string) => {
      const analyze = pendingAnalyze.current;
      const cancel = pendingCancel.current;
      const confirmation = pendingConfirmation.current;
      const create = pendingCreate.current;
      if (
        analyze?.requestId !== requestId &&
        cancel?.requestId !== requestId &&
        confirmation?.requestId !== requestId &&
        create?.requestId !== requestId
      ) {
        return;
      }
      consumeRequestId(requestId);
      clearResponseTimer(requestId);
      if (confirmation?.requestId === requestId) {
        pendingConfirmation.current = null;
        setProgress('');
        setGenericSubmitError(message);
        setStage('plan');
        return;
      }
      if (analyze?.requestId === requestId) pendingAnalyze.current = null;
      if (cancel?.requestId === requestId) {
        pendingCancel.current = null;
        setCancelling(false);
        if (pendingAnalyze.current?.requestId === cancel.targetRequestId) {
          consumeRequestId(cancel.targetRequestId);
          clearResponseTimer(cancel.targetRequestId);
          pendingAnalyze.current = null;
        }
      }
      if (create?.requestId === requestId) pendingCreate.current = null;
      setCancelling(false);
      setProgress('');
      setError(message);
      setRecovery(
        analyze?.requestId === requestId || cancel?.requestId === requestId
          ? 'Retry analysis; no file changes were made.'
          : 'Create could not be verified. Analyze again before creating.'
      );
      setRecoveryAction(
        analyze?.requestId === requestId || cancel?.requestId === requestId
          ? 'retry-analysis'
          : 'reanalyze'
      );
      setStage('blocked');
    },
    [clearResponseTimer]
  );

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const showReview = (
        result:
          | Extract<ColorSystemBuilderV2AnalysisResultMessage, { success: true }>
          | ColorSystemGenericV2ConfirmedReadyMessage,
        directionId = result.selectedDirectionId
      ) => {
        const receipt = analysisReceipt(result);
        setAnalysis(receipt);
        setSelectedDirectionId(directionId);
        setGenericPlan(null);
        setGenericSubmitError(null);
        setError(null);
        setRecovery(null);
        setRecoveryAction(null);
        setCreated(null);
        setStage('review');
      };
      const raw = eventPluginMessage(event);
      const validation = validatePluginToUIMessage(raw);
      if (!validation.valid) {
        const requestId = rawRequestId(raw);
        if (requestId) failPendingResponse(requestId, validation.error);
        return;
      }
      const message = validation.message;

      if (message.type === 'intelligent-color-system-v2-progress') {
        if (
          pendingAnalyze.current?.requestId !== message.requestId &&
          pendingCreate.current?.requestId !== message.requestId
        ) {
          return;
        }
        armResponseTimer(message.requestId);
        setProgress(message.message);
        return;
      }

      if (message.type === 'generic-color-system-v2-progress') {
        if (
          pendingAnalyze.current?.requestId !== message.requestId &&
          pendingCancel.current?.requestId !== message.requestId &&
          pendingConfirmation.current?.requestId !== message.requestId
        ) {
          return;
        }
        armResponseTimer(message.requestId);
        setProgress(message.message);
        return;
      }

      if (message.type === 'generic-color-system-v2-plan-result') {
        const analyze = pendingAnalyze.current;
        const cancel = pendingCancel.current;
        const matchesAnalyze = analyze?.requestId === message.requestId;
        const matchesCancel =
          cancel?.requestId === message.requestId && analyze?.requestId === cancel.targetRequestId;
        if (!matchesAnalyze && !matchesCancel) return;

        if (message.proposal && analyze) {
          const returnedRules = message.proposal.reviewedBrandConstraints;
          const expectedRules = analyze.brandConstraintRules;
          const expectedFragment =
            expectedRules === undefined
              ? undefined
              : buildColorSystemBrandConstraintsV1({
                  schemaVersion: 'teul.brand-constraints.v1',
                  sourceSnapshotHash: message.snapshotHash,
                  rules: expectedRules,
                  decisions: [],
                });
          if (expectedFragment?.fragmentHash !== returnedRules?.fragmentHash) {
            failPendingResponse(
              message.requestId,
              'The plan changed or omitted the imported brand rules. Analyze again to review the exact rules.'
            );
            return;
          }
        }

        if (matchesCancel && cancel) {
          if (!consumeRequestId(cancel.requestId)) return;
          consumeRequestId(cancel.targetRequestId);
        } else if (analyze) {
          if (!consumeRequestId(analyze.requestId)) return;
          if (cancel?.targetRequestId === analyze.requestId) consumeRequestId(cancel.requestId);
        }
        if (analyze) clearResponseTimer(analyze.requestId);
        if (cancel) clearResponseTimer(cancel.requestId);
        pendingAnalyze.current = null;
        pendingCancel.current = null;
        setCancelling(false);
        setProgress('');
        setError(null);
        setRecovery(null);
        setRecoveryAction(null);
        setGenericSubmitError(null);
        if (message.state.kind === 'cancelled') {
          setGenericPlan(null);
          setProgress(
            message.state.message ??
              ('gaps' in message ? message.gaps[0]?.message : undefined) ??
              'Analysis cancelled. Nothing was changed.'
          );
          setStage('idle');
          return;
        }
        setGenericPlan(genericPlanView(message));
        setStage('plan');
        return;
      }

      if (message.type === 'generic-color-system-v2-confirmation-result') {
        const pending = pendingConfirmation.current;
        if (
          !pending ||
          pending.requestId !== message.requestId ||
          !consumeRequestId(message.requestId)
        ) {
          return;
        }
        pendingConfirmation.current = null;
        clearResponseTimer(message.requestId);
        setProgress('');

        if (!message.success) {
          if (message.analysisId !== pending.analysisId) {
            setGenericSubmitError('Confirmation did not match the reviewed plan.');
          } else {
            setGenericPlan(current => ({
              analysisId: message.analysisId,
              snapshotHash: message.snapshotHash,
              state: message.state,
              proposal: current?.proposal ?? null,
              outcomeGaps: message.gaps,
            }));
            setGenericSubmitError(message.error);
          }
          setStage('plan');
          return;
        }

        if (
          message.analysisId !== pending.analysisId ||
          message.snapshotHash !== pending.snapshotHash ||
          message.proposalId !== pending.proposalId ||
          !receiptMatchesDraft(message.receipt, pending.draft)
        ) {
          setGenericSubmitError('The receipt did not match the reviewed plan.');
          setStage('plan');
          return;
        }

        showReview(message);
        return;
      }

      if (message.type === 'intelligent-color-system-v2-analysis-result') {
        const pending = pendingAnalyze.current;
        if (
          !pending ||
          pending.requestId !== message.requestId ||
          !consumeRequestId(message.requestId)
        ) {
          return;
        }
        if (pendingCancel.current?.targetRequestId === message.requestId) {
          consumeRequestId(pendingCancel.current.requestId);
          clearResponseTimer(pendingCancel.current.requestId);
          pendingCancel.current = null;
        }
        setCancelling(false);
        pendingAnalyze.current = null;
        clearResponseTimer(message.requestId);
        setProgress('');
        if (!message.success) {
          setError(message.error);
          setRecovery(
            message.blockers[0] ? message.blockers[0].recovery : 'Adjust the source and try again.'
          );
          setRecoveryAction('retry-analysis');
          setStage('blocked');
          return;
        }
        showReview(message, message.recommendedDirectionId);
        return;
      }

      if (message.type !== 'intelligent-color-system-v2-create-result') return;

      const pending = pendingCreate.current;
      if (
        !pending ||
        pending.requestId !== message.requestId ||
        !consumeRequestId(message.requestId)
      ) {
        return;
      }
      pendingCreate.current = null;
      clearResponseTimer(message.requestId);
      setProgress('');
      if (!message.success) {
        const retryableFromReview =
          (message.failureStage === 'creation' || message.failureStage === 'verification') &&
          message.cleanup.complete;
        const cleanup = message.cleanup.attempted
          ? message.cleanup.complete
            ? `Cleanup completed and removed ${message.cleanup.removedResourceCount} temporary resources.`
            : 'Cleanup was incomplete. Inspect the current file before running a new analysis.'
          : 'Teul confirmed that no temporary resources need cleanup.';
        setError(message.error);
        setRecovery(
          retryableFromReview
            ? `${cleanup} Return to the reviewed direction and try Create again.`
            : `${cleanup} Analyze the current source again before creating.`
        );
        setRecoveryAction(retryableFromReview ? 'return-to-review' : 'reanalyze');
        setStage('blocked');
        return;
      }
      if (message.sessionId !== pending.sessionId || message.directionId !== pending.directionId) {
        setError('Create did not match the reviewed system.');
        setRecovery('Start over and analyze the current source again.');
        setRecoveryAction('reanalyze');
        setStage('blocked');
        return;
      }
      setCreated(message);
      setError(null);
      setRecovery(null);
      setRecoveryAction(null);
      setStage('success');
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [armResponseTimer, clearResponseTimer, failPendingResponse]);

  React.useEffect(
    () => () => {
      clearAllResponseTimers();
      if (pendingAnalyze.current) consumeRequestId(pendingAnalyze.current.requestId);
      if (pendingCancel.current) consumeRequestId(pendingCancel.current.requestId);
      if (pendingConfirmation.current) consumeRequestId(pendingConfirmation.current.requestId);
      if (pendingCreate.current) consumeRequestId(pendingCreate.current.requestId);
    },
    [clearAllResponseTimers]
  );

  React.useEffect(() => {
    if (!isActive || previousStage.current === stage) return;
    previousStage.current = stage;
    const target =
      stage === 'analyzing'
        ? progressRef.current
        : stage === 'plan' || stage === 'confirming'
          ? null
          : stage === 'review'
            ? reviewStageRef.current
            : stage === 'blocked'
              ? recoveryRef.current
              : stage === 'success'
                ? successRef.current
                : analyzeButtonRef.current;
    target?.focus();
  }, [isActive, stage]);

  const reset = React.useCallback(() => {
    clearAllResponseTimers();
    if (pendingAnalyze.current) consumeRequestId(pendingAnalyze.current.requestId);
    if (pendingCancel.current) consumeRequestId(pendingCancel.current.requestId);
    if (pendingConfirmation.current) consumeRequestId(pendingConfirmation.current.requestId);
    if (pendingCreate.current) consumeRequestId(pendingCreate.current.requestId);
    pendingAnalyze.current = null;
    pendingCancel.current = null;
    pendingConfirmation.current = null;
    pendingCreate.current = null;
    setAnalysis(null);
    setSelectedDirectionId(null);
    setCreated(null);
    setGenericPlan(null);
    setGenericSubmitError(null);
    setCancelling(false);
    setProgress('');
    setError(null);
    setRecovery(null);
    setRecoveryAction(null);
    setStage('idle');
  }, [clearAllResponseTimers]);

  const startAnalysis = React.useCallback(
    (scopeOverride?: SourceScopeChoice) => {
      if (
        !brandRulesReady ||
        stage === 'analyzing' ||
        stage === 'confirming' ||
        stage === 'creating'
      )
        return;
      clearAllResponseTimers();
      if (pendingAnalyze.current) consumeRequestId(pendingAnalyze.current.requestId);
      if (pendingCancel.current) consumeRequestId(pendingCancel.current.requestId);
      if (pendingConfirmation.current) consumeRequestId(pendingConfirmation.current.requestId);
      if (pendingCreate.current) consumeRequestId(pendingCreate.current.requestId);
      pendingAnalyze.current = null;
      pendingCancel.current = null;
      pendingConfirmation.current = null;
      pendingCreate.current = null;
      const requestedSourceChoice = scopeOverride ?? sourceChoice;
      if (scopeOverride) setSourceChoice(scopeOverride);
      setAnalysis(null);
      setSelectedDirectionId(null);
      setCreated(null);
      setGenericPlan(null);
      setGenericSubmitError(null);
      setCancelling(false);
      setError(null);
      setRecovery(null);
      setRecoveryAction(null);
      setProgress(
        requestedSourceChoice === 'auto'
          ? 'Reading supported colors from the open file…'
          : `Reading colors from ${scopeLabel(requestedSourceChoice).toLowerCase()}…`
      );

      const requestId = createRequestId('generic-color-builder-analyze');
      const automaticScope = requestedSourceChoice === 'auto';
      const message: AnalyzeGenericColorSystemV2Message = {
        type: 'analyze-generic-color-system-v2',
        requestId,
        sourceScope: automaticScope ? 'automatic' : requestedSourceChoice,
        confirmWholeFile: automaticScope || requestedSourceChoice === 'whole-file',
        dataVisualization,
        ...(brandConstraintRules !== undefined ? { brandConstraintRules } : {}),
      };
      pendingAnalyze.current = {
        requestId,
        ...(brandConstraintRules !== undefined ? { brandConstraintRules } : {}),
      };
      armResponseTimer(requestId);
      setStage('analyzing');
      postPluginMessage(message);
    },
    [
      armResponseTimer,
      clearAllResponseTimers,
      dataVisualization,
      sourceChoice,
      stage,
      brandConstraintRules,
      brandRulesReady,
    ]
  );

  const cancelAnalysis = React.useCallback(() => {
    const analyze = pendingAnalyze.current;
    if (stage !== 'analyzing' || !analyze || pendingCancel.current) return;
    const requestId = createRequestId('generic-color-builder-cancel');
    const message: CancelGenericColorSystemV2Message = {
      type: 'cancel-generic-color-system-v2',
      requestId,
      targetRequestId: analyze.requestId,
    };
    pendingCancel.current = { requestId, targetRequestId: analyze.requestId };
    armResponseTimer(requestId);
    setCancelling(true);
    setProgress('Cancelling analysis…');
    postPluginMessage(message);
  }, [armResponseTimer, stage]);

  const confirmGenericPlan = React.useCallback(
    (draft: ColorSystemGenericPlanConfirmationDraftV2) => {
      if (
        stage !== 'plan' ||
        !genericPlan ||
        !genericPlan.proposal ||
        !genericPlan.analysisId ||
        !genericPlan.snapshotHash ||
        draft.proposalId !== genericPlan.proposal.id
      ) {
        return;
      }
      const requestId = createRequestId('generic-color-builder-confirm');
      const message: ConfirmGenericColorSystemPlanV2Message = {
        type: 'confirm-generic-color-system-plan-v2',
        requestId,
        analysisId: genericPlan.analysisId,
        snapshotHash: genericPlan.snapshotHash,
        proposalId: genericPlan.proposal.id,
        draft,
      };
      pendingConfirmation.current = {
        requestId,
        analysisId: genericPlan.analysisId,
        snapshotHash: genericPlan.snapshotHash,
        proposalId: genericPlan.proposal.id,
        draft,
      };
      armResponseTimer(requestId);
      setGenericSubmitError(null);
      setProgress('Confirming the plan against the current source…');
      setStage('confirming');
      postPluginMessage(message);
    },
    [armResponseTimer, genericPlan, stage]
  );

  const recoverGenericPlan = React.useCallback(
    (action: ColorSystemGenericPlanRecoveryActionV2) => {
      if (action === 'choose-srgb-source') {
        setSourceChoice('selection');
        setGenericPlan(null);
        setGenericSubmitError(null);
        setProgress('');
        setStage('idle');
        return;
      }
      startAnalysis(action === 'analyze-selection' ? 'selection' : undefined);
    },
    [startAnalysis]
  );

  const createSystem = React.useCallback(
    (
      review: ColorSystemReviewModelV2,
      acknowledgements: ColorSystemBuilderV2CreateAcknowledgements,
      ownerSpotColors?: ColorSystemBuilderV2OwnerSpotColorsMessage // p4-DE
    ) => {
      if (!analysis || stage !== 'review' || review.directionId !== selectedDirectionId) return;
      if (
        !acknowledgements.currentFileAcknowledged ||
        !acknowledgements.manualPublicationAcknowledged
      ) {
        return;
      }
      const retained = analysis.reviews.find(
        candidate =>
          candidate.directionId === review.directionId &&
          candidate.reviewModelHash === review.reviewModelHash
      );
      if (!retained) {
        setError('The selected direction is stale.');
        setRecovery('Start over and analyze the current source again.');
        setRecoveryAction('reanalyze');
        setStage('blocked');
        return;
      }
      const requestId = createRequestId('intelligent-color-builder-create');
      const message: CreateIntelligentColorSystemV2Message = {
        type: 'create-intelligent-color-system-v2',
        requestId,
        sessionId: analysis.sessionId,
        directionId: retained.directionId,
        collisionPolicy: 'create-copy',
        currentFileAcknowledged: acknowledgements.currentFileAcknowledged,
        manualPublicationAcknowledged: acknowledgements.manualPublicationAcknowledged,
        // p4-DE: only when the owner typed at least one spot reference.
        ...(ownerSpotColors && Object.keys(ownerSpotColors).length > 0 ? { ownerSpotColors } : {}),
      };
      pendingCreate.current = {
        requestId,
        sessionId: analysis.sessionId,
        directionId: retained.directionId,
      };
      armResponseTimer(requestId);
      setError(null);
      setRecovery(null);
      setRecoveryAction(null);
      setProgress('Rechecking the source before creating…');
      setStage('creating');
      postPluginMessage(message);
    },
    [analysis, armResponseTimer, selectedDirectionId, stage]
  );

  const midpointMeaningValid = dataVisualization.midpointMeaning.trim().length > 0;
  const analysisDisabled = stage === 'analyzing' || !midpointMeaningValid || !brandRulesReady;
  const errorView = error ? splitErrorReference(error) : null;

  /**
   * Which screen the stage renders. Scroll resets only when the screen changes
   * (entry → plan → review → success), never on same-screen transitions such as
   * review → creating → blocked, so a failed Create keeps the user in place.
   */
  const screen: 'entry' | 'plan' | 'review' | 'success' =
    genericPlan && (stage === 'plan' || stage === 'confirming')
      ? 'plan'
      : stage === 'success' && created
        ? 'success'
        : analysis && (stage === 'review' || stage === 'creating' || stage === 'blocked')
          ? 'review'
          : 'entry';

  React.useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = 0;
  }, [screen]);

  if (!isActive) return null;

  let content: React.ReactNode;

  if (genericPlan && (stage === 'plan' || stage === 'confirming')) {
    content = (
      <div aria-label="Color system starting plan">
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '10px 16px',
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <button type="button" onClick={reset} style={smallSecondaryButtonStyle}>
            Start over
          </button>
        </div>
        {stage === 'confirming' && progress ? (
          <p
            role="status"
            aria-live="polite"
            style={{ margin: 0, padding: '10px 16px 0', color: theme.muted, fontSize: 11 }}
          >
            {progress}
          </p>
        ) : null}
        <ColorSystemGenericPlanReviewV2
          state={genericPlan.state}
          proposal={genericPlan.proposal}
          outcomeGaps={genericPlan.outcomeGaps}
          onUsePlan={confirmGenericPlan}
          onRecover={recoverGenericPlan}
          submitting={stage === 'confirming'}
          submitError={genericSubmitError}
          isDark={isDark}
        />
      </div>
    );
  } else if (stage === 'success' && created) {
    content = (
      <section
        aria-labelledby="teul-builder-success-title"
        style={{
          padding: 20,
        }}
      >
        <div
          role="status"
          style={{
            padding: 18,
            borderRadius: 10,
            border: `1px solid ${theme.success}`,
            background: theme.panel,
          }}
        >
          <p style={{ margin: 0, color: theme.success, fontSize: 11, fontWeight: 800 }}>
            {created.action === 'verified-no-op'
              ? 'Verified in the open file'
              : 'Created in the open file'}
          </p>
          <h2
            ref={successRef}
            id="teul-builder-success-title"
            tabIndex={-1}
            style={{ margin: '6px 0 0', fontSize: 21 }}
          >
            {created.action === 'verified-no-op'
              ? 'Already up to date—nothing duplicated'
              : `${created.outputName} is ready to review`}
          </h2>
          <p style={{ margin: '8px 0 0', color: theme.muted, fontSize: 12, lineHeight: 1.5 }}>
            {created.action === 'verified-no-op'
              ? `${created.outputName} matches the reviewed system on ${created.pageName}. No variables, styles, components, or frames were added.`
              : `Teul created five editable color-system frames on ${created.pageName}, plus ${created.created.variables} variables, ${created.created.styles} styles, and ${created.created.components} components.`}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5 }}>
            Publishing the library remains a separate manual step in Figma.
          </p>
          {created.action === 'created' ? (
            <p
              data-teul-undo-note="true"
              style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5 }}
            >
              {UNDO_NOTE}
            </p>
          ) : null}
          {created.ownerSpotColors ? (
            <p
              data-teul-spot-echo="true"
              style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5 }}
            >
              {`Spot colors: ${created.ownerSpotColors.supplied} owner-supplied reference${
                created.ownerSpotColors.supplied === 1 ? '' : 's'
              }; ${created.ownerSpotColors.descriptionsWritten} Variable description${
                created.ownerSpotColors.descriptionsWritten === 1 ? '' : 's'
              } written (each family’s anchor step and the exact source token it derives from).`}
            </p>
          ) : null}
          {created.warnings.length > 0 ? (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 11, lineHeight: 1.5 }}>
              {created.warnings.map(warning => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
        {created.tokens ? (
          <div data-teul-token-exports="true" style={{ marginTop: 14 }}>
            <p style={{ margin: 0, color: theme.muted, fontSize: 11, lineHeight: 1.5 }}>
              {`${created.tokens.tokenCount} tokens as W3C Design Tokens JSON (modes ride in “$extensions”) or as flat CSS custom properties.`}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(created.tokens?.dtcgJson ?? '', 'design tokens (DTCG JSON)')
                }
                style={actionButtonStyle(36, '7px 11px')}
              >
                Copy tokens (DTCG JSON)
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(created.tokens?.cssText ?? '', 'CSS variables')}
                style={actionButtonStyle(36, '7px 11px')}
              >
                Copy CSS variables
              </button>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={actionButtonStyle(40, '9px 14px', { marginTop: 14, borderRadius: 8 })}
        >
          Start over
        </button>
      </section>
    );
  } else if (analysis && (stage === 'review' || stage === 'creating' || stage === 'blocked')) {
    content = (
      <div ref={reviewStageRef} tabIndex={-1} aria-label="Color system review">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            alignItems: 'center',
            padding: '10px 18px',
            color: theme.text,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              color: theme.muted,
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            <span>{analysis.sourceColorCount} colors</span>
            <span aria-hidden="true" style={dotStyle} />
            <span>{scopeLabel(analysis.resolvedUsageScope)}</span>
            <span aria-hidden="true" style={dotStyle} />
            <span>{analysis.scannedNodeCount} layers</span>
          </span>
          <button
            type="button"
            onClick={reset}
            disabled={stage === 'creating'}
            style={{
              ...smallSecondaryButtonStyle,
              whiteSpace: 'nowrap',
            }}
          >
            Start over
          </button>
        </div>
        {progress ? (
          <p
            role="status"
            aria-live="polite"
            style={{ margin: 0, padding: '10px 18px', color: theme.muted, fontSize: 11 }}
          >
            {progress}
          </p>
        ) : null}
        {stage === 'blocked' && recoveryAction ? (
          <div
            ref={recoveryRef}
            tabIndex={-1}
            aria-label={`${errorView?.headline ?? 'Create could not continue.'} ${recovery ?? ''}`.trim()}
            style={{ padding: '10px 18px 0' }}
          >
            <button
              type="button"
              onClick={() => {
                if (recoveryAction === 'return-to-review') {
                  setError(null);
                  setRecovery(null);
                  setRecoveryAction(null);
                  setStage('review');
                  return;
                }
                startAnalysis();
              }}
              style={actionButtonStyle(36, '7px 11px')}
            >
              {recoveryAction === 'return-to-review' ? 'Return to review' : 'Analyze again'}
            </button>
          </div>
        ) : null}
        <ColorSystemBuilderV2Review
          models={analysis.reviews}
          recommendedDirectionId={analysis.recommendedDirectionId}
          selectedDirectionId={selectedDirectionId}
          onSelectDirection={directionId => {
            if (stage === 'review') setSelectedDirectionId(directionId);
          }}
          onCreate={createSystem}
          creating={stage === 'creating'}
          blocker={
            stage === 'blocked' && errorView
              ? {
                  title: 'Create could not continue',
                  message: [errorView.headline, recovery].filter(Boolean).join(' '),
                  reference: errorView.reference,
                }
              : null
          }
          isDark={isDark}
        />
      </div>
    );
  } else {
    content = (
      <section
        className="teul-v2-builder-tab"
        aria-labelledby="teul-v2-builder-title"
        aria-busy={stage === 'analyzing'}
        style={{
          minHeight: '100%',
          padding: 20,
          color: theme.text,
          background: theme.background,
          colorScheme: isDark ? 'dark' : 'light',
        }}
      >
        <style>{`.teul-v2-builder-tab *{box-sizing:border-box}.teul-v2-builder-tab button:focus-visible,.teul-v2-builder-tab select:focus-visible,.teul-v2-builder-tab input:focus-visible,.teul-v2-builder-tab summary:focus-visible{outline:3px solid ${theme.accent};outline-offset:3px}`}</style>
        <p
          style={{
            margin: 0,
            color: theme.muted,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Color system builder
        </p>
        <h2 id="teul-v2-builder-title" style={{ margin: '6px 0 0', fontSize: 23 }}>
          Build a color system from your palette
        </h2>
        <p style={{ margin: '9px 0 0', color: theme.muted, fontSize: 13, lineHeight: 1.55 }}>
          Teul looks for supported local Figma color evidence, shows what can stay fixed, then
          proposes Secondary, Product Graphics, Data Visualization, and Typography.
        </p>

        <div
          style={{
            marginTop: 18,
            padding: 15,
            borderRadius: 10,
            background: theme.panel,
            border: `1px solid ${theme.border}`,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>
            {sourceChoiceLabel(sourceChoice)}
          </p>
          <p style={{ margin: '5px 0 0', color: theme.muted, fontSize: 11, lineHeight: 1.45 }}>
            {sourceChoice === 'auto'
              ? 'Analyze authorizes a local, read-only scan of supported color evidence across the open file.'
              : `Analyze authorizes a local, read-only scan of ${scopeLabel(sourceChoice).toLowerCase()}.`}
          </p>
          <button
            ref={analyzeButtonRef}
            type="button"
            onClick={() => startAnalysis()}
            disabled={analysisDisabled}
            aria-busy={stage === 'analyzing'}
            aria-describedby="teul-v2-analyze-status"
            style={{
              width: '100%',
              minHeight: 46,
              marginTop: 13,
              padding: '10px 15px',
              border: 0,
              borderRadius: 8,
              cursor: stage === 'analyzing' ? 'wait' : analysisDisabled ? 'not-allowed' : 'pointer',
              color: theme.accentText,
              background: analysisDisabled ? theme.muted : theme.accent,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {stage === 'analyzing' ? 'Building suggestions…' : 'Analyze and build suggestions'}
          </button>
          {stage === 'analyzing' ? (
            <button
              type="button"
              onClick={cancelAnalysis}
              disabled={cancelling}
              aria-describedby="teul-v2-analyze-status"
              style={actionButtonStyle(38, '8px 12px', analyzingButtonExtra)}
            >
              {cancelling ? 'Cancelling…' : 'Cancel analysis'}
            </button>
          ) : null}
          {stage === 'analyzing' ? (
            <button
              type="button"
              onClick={reset}
              style={actionButtonStyle(38, '8px 12px', analyzingButtonExtra, true)}
            >
              Start over
            </button>
          ) : null}
          <p
            ref={progressRef}
            id="teul-v2-analyze-status"
            role="status"
            aria-live="polite"
            tabIndex={stage === 'analyzing' ? -1 : undefined}
            style={{ margin: '8px 0 0', color: theme.muted, fontSize: 11, lineHeight: 1.4 }}
          >
            {stage === 'analyzing'
              ? progress
              : progress ||
                (midpointMeaningValid
                  ? 'Review actual colors before Create.'
                  : 'Enter what the diverging midpoint means before analyzing.')}
          </p>
        </div>

        <details
          style={{
            marginTop: 12,
            padding: 11,
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
          }}
        >
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Advanced</summary>
          <div style={{ marginTop: 12 }}>
            <ColorSystemBrandRulesImportV1
              rules={brandConstraintRules}
              onChange={setBrandConstraintRules}
              onReadyChange={setBrandRulesReady}
              disabled={stage === 'analyzing'}
            />
            <label htmlFor="teul-v2-source-scope" style={{ display: 'block', fontSize: 11 }}>
              Source detection
            </label>
            <select
              id="teul-v2-source-scope"
              value={sourceChoice}
              onChange={event => {
                setSourceChoice(event.target.value as SourceScopeChoice);
                if (stage === 'blocked') {
                  setError(null);
                  setRecovery(null);
                  setRecoveryAction(null);
                  setStage('idle');
                }
              }}
              disabled={stage === 'analyzing'}
              style={{
                width: '100%',
                minHeight: 38,
                marginTop: 5,
                padding: '7px 9px',
                borderRadius: 7,
                color: theme.text,
                background: theme.raised,
                border: `1px solid ${theme.border}`,
              }}
            >
              <option value="auto">Automatic (recommended)</option>
              <option value="selection">Current selection</option>
              <option value="current-page">Current page</option>
              <option value="whole-file">Whole file</option>
            </select>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
              <h3 style={{ margin: 0, fontSize: 12 }}>Data Visualization request</h3>
              <p style={{ margin: '5px 0 0', color: theme.muted, fontSize: 11, lineHeight: 1.4 }}>
                These settings shape the chart palettes shown in review. The categorical count is a
                request: Teul will report how many distinguishable series each direction can
                actually support.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 10,
                  marginTop: 12,
                }}
              >
                <fieldset style={dataFieldStyle}>
                  <legend style={{ padding: '0 4px', fontSize: 11 }}>Mode</legend>
                  <div style={dataRadioRowStyle}>
                    {(['Light', 'Dark'] as const).map(mode => (
                      <label key={mode} style={dataRadioLabelStyle}>
                        <input
                          type="radio"
                          name="teul-v2-data-mode"
                          value={mode}
                          checked={dataVisualization.mode === mode}
                          onChange={() => setDataVisualization(current => ({ ...current, mode }))}
                          disabled={stage === 'analyzing'}
                        />
                        {mode}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset style={dataFieldStyle}>
                  <legend style={{ padding: '0 4px', fontSize: 11 }}>Chart surface</legend>
                  <div style={dataRadioRowStyle}>
                    {(['light', 'dark'] as const).map(surfaceContext => (
                      <label key={surfaceContext} style={dataRadioLabelStyle}>
                        <input
                          type="radio"
                          name="teul-v2-data-surface"
                          value={surfaceContext}
                          checked={dataVisualization.surfaceContext === surfaceContext}
                          onChange={() =>
                            setDataVisualization(current => ({ ...current, surfaceContext }))
                          }
                          disabled={stage === 'analyzing'}
                        />
                        {surfaceContext === 'light' ? 'Light' : 'Dark'}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {DATA_COUNT_CONTROLS.map(control => (
                  <label key={control.key} style={dataCountLabelStyle}>
                    {control.label}
                    <select
                      id={control.id}
                      value={dataVisualization[control.key]}
                      onChange={event =>
                        setDataVisualization(
                          current =>
                            ({
                              ...current,
                              [control.key]: Number(event.target.value),
                            }) as ColorSystemBuilderV2DataVisualizationRequest
                        )
                      }
                      disabled={stage === 'analyzing'}
                      style={dataCountSelectStyle}
                    >
                      {control.options.map(count => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}

                <fieldset style={dataFieldStyle}>
                  <legend style={{ padding: '0 4px', fontSize: 11 }}>Categorical adjacency</legend>
                  <div style={{ display: 'grid', gap: 5 }}>
                    {(['separated', 'touching'] as const).map(adjacency => (
                      <label
                        key={adjacency}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}
                      >
                        <input
                          type="radio"
                          name="teul-v2-data-adjacency"
                          value={adjacency}
                          checked={dataVisualization.adjacency === adjacency}
                          onChange={() =>
                            setDataVisualization(current => ({ ...current, adjacency }))
                          }
                          disabled={stage === 'analyzing'}
                        />
                        {adjacency === 'separated' ? 'Separated marks' : 'Touching regions'}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>

              <label
                htmlFor="teul-v2-midpoint-meaning"
                style={{ display: 'grid', gap: 5, marginTop: 10, fontSize: 11 }}
              >
                Diverging midpoint meaning
                <input
                  id="teul-v2-midpoint-meaning"
                  type="text"
                  value={dataVisualization.midpointMeaning}
                  onChange={event =>
                    setDataVisualization(current => ({
                      ...current,
                      midpointMeaning: event.target.value,
                    }))
                  }
                  disabled={stage === 'analyzing'}
                  maxLength={160}
                  aria-invalid={!midpointMeaningValid}
                  aria-describedby="teul-v2-midpoint-help"
                  style={{
                    minHeight: 34,
                    padding: '6px 8px',
                    color: theme.text,
                    background: theme.raised,
                    border: `1px solid ${!midpointMeaningValid ? theme.danger : theme.border}`,
                    borderRadius: 7,
                  }}
                />
              </label>
              <p
                id="teul-v2-midpoint-help"
                style={{
                  margin: '5px 0 0',
                  color: midpointMeaningValid ? theme.muted : theme.danger,
                  fontSize: 11,
                  lineHeight: 1.4,
                }}
              >
                {midpointMeaningValid
                  ? 'Example: zero, target, or neutral.'
                  : 'Describe what the center of the diverging scale represents.'}
              </p>
            </div>
          </div>
        </details>

        {errorView ? (
          <div
            ref={recoveryRef}
            role="alert"
            tabIndex={-1}
            aria-label={`${errorView.headline} ${recovery ?? ''}`.trim()}
            style={{
              marginTop: 13,
              padding: 12,
              borderRadius: 8,
              color: theme.danger,
              border: `1px solid ${theme.danger}`,
            }}
          >
            <strong style={{ display: 'block', fontSize: 12 }}>{errorView.headline}</strong>
            {recovery ? (
              <span style={{ display: 'block', marginTop: 4, fontSize: 11 }}>{recovery}</span>
            ) : null}
            {errorView.reference ? (
              <span
                data-teul-error-reference="true"
                style={{ display: 'block', marginTop: 6, color: theme.muted, fontSize: 11 }}
              >
                Reference: {errorView.reference}
              </span>
            ) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 9 }}>
              {recoveryAction === 'retry-analysis' ? (
                <button
                  type="button"
                  onClick={() => startAnalysis()}
                  style={actionButtonStyle(35, '6px 10px')}
                >
                  Retry analysis
                </button>
              ) : null}
              <button
                type="button"
                onClick={reset}
                style={actionButtonStyle(35, '6px 10px', {}, true)}
              >
                Start over
              </button>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div
      ref={scrollRef}
      data-teul-builder-scroll="true"
      style={{
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        color: theme.text,
        background: theme.background,
        colorScheme: isDark ? 'dark' : 'light',
      }}
    >
      {releaseChannel === 'candidate' ? (
        <aside
          role="status"
          style={{
            margin: 14,
            padding: '9px 11px',
            borderRadius: 8,
            border: `1px solid ${theme.accent}`,
            fontSize: 11,
          }}
        >
          Qualification build — testing only; not released.
        </aside>
      ) : null}
      {content}
    </div>
  );
}
