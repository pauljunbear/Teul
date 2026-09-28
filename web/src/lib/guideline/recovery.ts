import { IntakeError } from '../../../../services/guideline-intake/src/protocol';
import type { PendingCapture } from './captureJob';
import type { GuidelineIntakeClient } from './intakeClient';
import type { RecoveryHandle, RecoveryReference } from './recoveryRecord';
import { guidelineRecoveryStore } from './recoveryStore';

export function recoveryMessage(reason: unknown): string {
  if (reason instanceof IntakeError) {
    const messages: Record<string, string> = {
      RECOVERY_ALREADY_SAVED:
        'This request is already saved. Open it from Saved requests, or remove its local copy before starting it again.',
      RECOVERY_CAPACITY:
        'Saved requests are full. Remove a saved request before starting another; your existing work is unchanged.',
      RECOVERY_CONFLICT:
        'This saved request changed in another tab. Check saved requests again before opening it.',
      RECOVERY_EXPIRED: 'This saved request expired. Your separately saved projects are unchanged.',
      RECOVERY_OWNER_CHANGED:
        'This request belongs to a different account. Check saved requests after signing into its original account.',
      OWNER_CHANGED:
        'The signed-in account changed. Check saved requests again for the current account.',
      UNAUTHENTICATED: 'Sign in to the intake service to check saved requests.',
    };
    if (messages[reason.code]) return messages[reason.code];
  }
  return 'The saved request could not be verified or stored. Check saved requests again; your existing projects are unchanged.';
}
export function recoveryNeedsReopen(reason: unknown): boolean {
  return (
    reason instanceof IntakeError && ['RECOVERY_CONFLICT', 'RECOVERY_EXPIRED'].includes(reason.code)
  );
}
export async function openOwnedRecovery(
  client: GuidelineIntakeClient,
  ownerBinding: string,
  reference: RecoveryReference,
  signal: AbortSignal
) {
  const bound = client.forOwner(ownerBinding);
  await bound.session(signal);
  const handle = await guidelineRecoveryStore.open(ownerBinding, reference, signal);
  await bound.session(signal);
  await guidelineRecoveryStore.assertCurrent(handle, signal);
  signal.throwIfAborted();
  return handle;
}
export type RecoverableCapture = PendingCapture & { recovery: RecoveryHandle };
export function captureFromRecovery(recovery: RecoveryHandle): RecoverableCapture {
  const { submission: prepared, profile, requestHash, job } = recovery.payload;
  if (prepared.kind === 'pdf') throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
  return {
    prepared,
    profile,
    requestHash,
    job,
    ownerBinding: recovery.metadata.ownerBinding,
    recovery,
  };
}
