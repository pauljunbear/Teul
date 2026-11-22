/** Shared Create lifecycle. Adapters are program-owned; serialized input cannot select hooks. */
import type {
  ColorSystemHostResourceRefV2,
  ColorSystemRendererBlockedCodeV2,
  ColorSystemRendererMutationPhaseV2,
} from './colorSystemResourceRendererV2';

export interface ColorSystemResourceTransactionPlanV1 {
  transactionId: string;
  action: 'create-new' | 'create-copy';
  outputName: string;
}
export interface ColorSystemResourceTransactionJournalV1 {
  state: 'creating' | 'verified';
  resources: readonly ColorSystemHostResourceRefV2[];
}
export interface ColorSystemResourceTransactionRecoveryV1 {
  status:
    | 'none'
    | 'cleaned-interrupted-output'
    | 'verified-existing-output'
    | 'released-completed-output'
    | 'preserved-unacknowledged-output';
  removedResourceCount: number;
  blocksNewMutation: boolean;
}
export interface ColorSystemResourceTransactionHostV1 {
  setCreatedResourceObserver?(observer: ((ref: ColorSystemHostResourceRefV2) => void) | null): void;
  removeResource(ref: ColorSystemHostResourceRefV2): Promise<void>;
  commitUndo(): Promise<void>;
}
export class ColorSystemResourceTransactionPreflightErrorV1 extends Error {
  constructor(
    readonly code: ColorSystemRendererBlockedCodeV2,
    message: string
  ) {
    super(message);
    this.name = 'ColorSystemResourceTransactionPreflightErrorV1';
  }
}
export interface ColorSystemResourceTransactionFailureV1 {
  status: 'rolled-back' | 'cleanup-incomplete';
  transactionId: string;
  failedPhase: ColorSystemRendererMutationPhaseV2;
  message: string;
  createdCount: number;
  removedCount: number;
  unresolvedRefs: readonly ColorSystemHostResourceRefV2[];
}
export interface ColorSystemResourceTransactionJournalOperationsV1<
  Plan extends ColorSystemResourceTransactionPlanV1,
  Journal extends ColorSystemResourceTransactionJournalV1,
  Recovery extends ColorSystemResourceTransactionRecoveryV1,
> {
  read(): Journal | null;
  matchesTarget(journal: Journal): boolean;
  reconcile(beforeMutation?: () => Promise<void>): Promise<Recovery>;
  begin(plan: Plan): Journal;
  record(journal: Journal, ref: ColorSystemHostResourceRefV2): Journal;
  markVerified(journal: Journal): Journal;
  acknowledgeCommitted(journal: Journal): Promise<void>;
}
export interface ColorSystemResourceTransactionJournalPortV1<
  Plan extends ColorSystemResourceTransactionPlanV1,
  Journal extends ColorSystemResourceTransactionJournalV1,
  Recovery extends ColorSystemResourceTransactionRecoveryV1,
> {
  /** Returns privately leased operations; release always runs in finally. */
  acquire():
    | (ColorSystemResourceTransactionJournalOperationsV1<Plan, Journal, Recovery> & {
        release(): void;
      })
    | null;
}
export interface ColorSystemResourceTransactionAdapterV1<
  Plan extends ColorSystemResourceTransactionPlanV1,
  Journal extends ColorSystemResourceTransactionJournalV1,
  Recovery extends ColorSystemResourceTransactionRecoveryV1,
  Receipt,
  Created,
> {
  contractKind: 'legacy-v2' | 'authored-v1';
  transactionId: string;
  journal?: ColorSystemResourceTransactionJournalPortV1<Plan, Journal, Recovery>;
  preflight(deferCollisionFailure: boolean): Promise<Plan>;
  finalMutationFence(): Promise<void>;
  mutate(
    plan: Plan,
    context: {
      remember(ref: ColorSystemHostResourceRefV2): void;
      refsByRecipe: ReadonlyMap<string, ColorSystemHostResourceRefV2>;
      setPhase(phase: ColorSystemRendererMutationPhaseV2): void;
    }
  ): Promise<Created>;
  verify(plan: Plan, refs: readonly ColorSystemHostResourceRefV2[]): Promise<void>;
  reveal?(plan: Plan, refs: readonly ColorSystemHostResourceRefV2[]): Promise<readonly string[]>;
  blocked(transactionId: string, code: ColorSystemRendererBlockedCodeV2, message: string): Receipt;
  reconciliation(plan: Plan, recovery: Recovery): Receipt | null;
  failed(failure: ColorSystemResourceTransactionFailureV1): Receipt;
  created(
    plan: Plan,
    refs: readonly ColorSystemHostResourceRefV2[],
    warnings: readonly string[],
    created: Created
  ): Receipt;
}

/** One ordered lifecycle, with typed validation/mutation/readback supplied by each contract. */
export async function runColorSystemResourceTransactionV1<
  Plan extends ColorSystemResourceTransactionPlanV1,
  Journal extends ColorSystemResourceTransactionJournalV1,
  Recovery extends ColorSystemResourceTransactionRecoveryV1,
  Receipt,
  Created,
>(
  host: ColorSystemResourceTransactionHostV1,
  adapter: ColorSystemResourceTransactionAdapterV1<Plan, Journal, Recovery, Receipt, Created>
): Promise<Receipt> {
  const safeTransactionId =
    typeof adapter.transactionId === 'string' && adapter.transactionId.trim().length > 0
      ? adapter.transactionId.trim().slice(0, 100)
      : 'invalid-transaction';
  const journalPort = adapter.journal;
  const label = adapter.contractKind === 'legacy-v2' ? 'v2 Create' : 'authored Create';
  if (!journalPort && adapter.contractKind === 'authored-v1')
    return adapter.blocked(
      safeTransactionId,
      'JOURNAL_UNAVAILABLE',
      'Authored Create requires a durable transaction journal.'
    );
  const port = journalPort?.acquire();
  if (journalPort && !port)
    return adapter.blocked(
      safeTransactionId,
      'RECOVERY_REQUIRED',
      'Another Create transaction is active in this document; retry after it finishes.'
    );
  try {
    return await execute();
  } finally {
    port?.release();
  }

  async function execute(): Promise<Receipt> {
    let journal: Journal | null = null;
    let recoveryRan = false;
    let completedRecovery: Recovery | null = null;
    if (port) {
      if (!host.setCreatedResourceObserver)
        return adapter.blocked(
          safeTransactionId,
          'JOURNAL_UNAVAILABLE',
          `The Figma host cannot persist exact ${label} resource ownership.`
        );
      let persisted: Journal | null;
      try {
        persisted = port.read();
      } catch (error) {
        return adapter.blocked(
          safeTransactionId,
          'RECOVERY_REQUIRED',
          error instanceof Error ? error.message : `The ${label} journal could not be read safely.`
        );
      }
      if (
        persisted?.state === 'creating' ||
        (persisted?.state === 'verified' && port.matchesTarget(persisted))
      ) {
        let recoveryPlan: Plan;
        try {
          recoveryPlan = await adapter.preflight(true);
        } catch (error) {
          return adapter.blocked(
            safeTransactionId,
            error instanceof ColorSystemResourceTransactionPreflightErrorV1
              ? error.code
              : 'PREFLIGHT_FAILED',
            error instanceof Error ? error.message : 'Recovery preflight failed.'
          );
        }
        try {
          const recovery = await port.reconcile(adapter.finalMutationFence);
          recoveryRan = true;
          const receipt = adapter.reconciliation(recoveryPlan, recovery);
          if (receipt) return receipt;
          if (recovery.status === 'cleaned-interrupted-output') completedRecovery = recovery;
        } catch (error) {
          return adapter.blocked(
            recoveryPlan.transactionId,
            error instanceof ColorSystemResourceTransactionPreflightErrorV1
              ? error.code
              : 'RECOVERY_REQUIRED',
            error instanceof Error
              ? error.message
              : `${adapter.contractKind === 'legacy-v2' ? 'V2' : 'Authored'} Create recovery could not be completed safely.`
          );
        }
      }
    }
    let plan: Plan;
    try {
      plan = await adapter.preflight(false);
    } catch (error) {
      if (completedRecovery)
        return adapter.failed({
          status: 'rolled-back',
          transactionId: safeTransactionId,
          failedPhase: 'reconciliation',
          message: `Teul safely removed ${completedRecovery.removedResourceCount} resource(s) from the earlier interrupted Create, but the new Create preflight is blocked: ${error instanceof Error ? error.message : 'preflight failed.'}`,
          createdCount: 0,
          removedCount: completedRecovery.removedResourceCount,
          unresolvedRefs: [],
        });
      return adapter.blocked(
        safeTransactionId,
        error instanceof ColorSystemResourceTransactionPreflightErrorV1
          ? error.code
          : 'PREFLIGHT_FAILED',
        error instanceof Error ? error.message : 'Preflight failed.'
      );
    }
    if (port) {
      try {
        if (!recoveryRan) {
          const receipt = adapter.reconciliation(
            plan,
            await port.reconcile(adapter.finalMutationFence)
          );
          if (receipt) return receipt;
        }
        await adapter.finalMutationFence();
        journal = port.begin(plan);
      } catch (error) {
        return adapter.blocked(
          plan.transactionId,
          error instanceof ColorSystemResourceTransactionPreflightErrorV1
            ? error.code
            : 'RECOVERY_REQUIRED',
          error instanceof Error
            ? error.message
            : `${adapter.contractKind === 'legacy-v2' ? 'V2' : 'Authored'} Create recovery could not be completed safely.`
        );
      }
    } else {
      try {
        await adapter.finalMutationFence();
      } catch (error) {
        return adapter.blocked(
          plan.transactionId,
          error instanceof ColorSystemResourceTransactionPreflightErrorV1
            ? error.code
            : 'FINAL_FENCE_FAILED',
          error instanceof Error ? error.message : 'The final mutation fence failed.'
        );
      }
    }
    const created: ColorSystemHostResourceRefV2[] = [];
    const refsByRecipe = new Map<string, ColorSystemHostResourceRefV2>();
    let phase: ColorSystemRendererMutationPhaseV2 = 'collections';
    const remember = (ref: ColorSystemHostResourceRefV2) => {
      if (refsByRecipe.has(ref.recipeId))
        throw new Error(`Host returned duplicate recipe ref ${ref.recipeId}.`);
      created.push(ref);
      refsByRecipe.set(ref.recipeId, ref);
    };
    if (journal && port && host.setCreatedResourceObserver) {
      host.setCreatedResourceObserver(ref => {
        if (!journal) throw new Error(`The ${label} journal observer lost its transaction state.`);
        journal = port.record(journal, { kind: ref.kind, id: ref.id, recipeId: ref.recipeId });
      });
    }
    try {
      const extra = await adapter.mutate(plan, {
        remember,
        refsByRecipe,
        setPhase(next) {
          phase = next;
        },
      });
      phase = 'verification';
      await adapter.verify(plan, created);
      const warnings = adapter.reveal ? await adapter.reveal(plan, created) : [];
      phase = 'undo-boundary';
      if (journal && port) journal = port.markVerified(journal);
      await host.commitUndo();
      if (journal && port) {
        phase = 'completion-acknowledgement';
        await port.acknowledgeCommitted(journal);
      }
      host.setCreatedResourceObserver?.(null);
      return adapter.created(plan, created, warnings, extra);
    } catch (error) {
      host.setCreatedResourceObserver?.(null);
      if (journal?.state === 'verified' && port)
        return adapter.failed({
          status: 'cleanup-incomplete',
          transactionId: plan.transactionId,
          failedPhase: phase,
          message:
            phase === 'completion-acknowledgement'
              ? 'The complete output and final undo boundary succeeded, but Teul could not durably acknowledge completion. The verified recovery marker was preserved and new Create mutations remain blocked until it is reconciled.'
              : 'The complete output was verified, but Teul could not confirm its final undo boundary. The durable recovery marker was preserved and new Create mutations remain blocked until it is reconciled.',
          createdCount: journal.resources.length,
          removedCount: 0,
          unresolvedRefs: journal.resources,
        });
      const unresolved: ColorSystemHostResourceRefV2[] = [];
      let durableReconciliationBlocked = false;
      let removedCount = 0;
      for (const ref of [...created].reverse()) {
        try {
          await host.removeResource(ref);
          removedCount += 1;
        } catch {
          unresolved.push(ref);
        }
      }
      if (journal && port) {
        try {
          const recovery = await port.reconcile();
          if (recovery.status === 'cleaned-interrupted-output')
            removedCount = Math.max(removedCount, recovery.removedResourceCount);
          durableReconciliationBlocked = recovery.blocksNewMutation;
        } catch {
          durableReconciliationBlocked = true;
        }
      }
      const durableRefs = durableReconciliationBlocked
        ? (journal?.resources.map(ref => ({ ...ref })) ?? [])
        : [];
      const unresolvedReceipt = [...unresolved];
      for (const ref of durableRefs)
        if (!unresolvedReceipt.some(item => item.kind === ref.kind && item.id === ref.id))
          unresolvedReceipt.push(ref);
      return adapter.failed({
        status:
          unresolvedReceipt.length === 0 && !durableReconciliationBlocked
            ? 'rolled-back'
            : 'cleanup-incomplete',
        transactionId: plan.transactionId,
        failedPhase: phase,
        message: `${error instanceof Error ? error.message : 'Resource rendering failed.'}${durableReconciliationBlocked ? ' Durable journal reconciliation remains blocked; cleanup is incomplete.' : ''}`,
        createdCount: created.length,
        removedCount,
        unresolvedRefs: unresolvedReceipt,
      });
    }
  }
}
