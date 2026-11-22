import type {
  IntakeJobSnapshot,
  IntakeProfile,
  IntakeSubmission,
} from '../../../../services/guideline-intake/src/protocol';
import { IntakeError } from '../../../../services/guideline-intake/src/protocol';
import type { PreparedGuidelineAssistance } from './assistance';
import { assistanceContext, readRecoveryAssistance, type RecoveryHandle } from './recoveryRecord';

export interface PreparedAssistance extends PreparedGuidelineAssistance {
  profile: IntakeProfile;
  submission: IntakeSubmission;
  requestHash: string;
  ownerBinding: string;
}
export interface AssistanceRecovery {
  prepared: PreparedAssistance;
  job: IntakeJobSnapshot | null;
  context: string;
  epoch: number;
  sourceCaptureHash: string;
  draftHash: string;
  invalidated: boolean;
  journal: RecoveryHandle;
}
export function sameAssistance(
  left: PreparedAssistance | undefined | null,
  right: PreparedAssistance
): boolean {
  return left?.requestHash === right.requestHash && left.ownerBinding === right.ownerBinding;
}
export function assistanceFromRecovery(journal: RecoveryHandle, epoch: number): AssistanceRecovery {
  if (!journal.project || journal.payload.profile.operation !== 'interpret')
    throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
  const { submission, profile, requestHash, job } = journal.payload;
  const { input, sourceCaptureHash, draftHash, modeId } = readRecoveryAssistance(
    journal.project,
    submission.payload
  );
  return {
    journal,
    epoch,
    job,
    invalidated: false,
    context: assistanceContext(
      submission.binding.workspaceId,
      sourceCaptureHash,
      draftHash,
      modeId
    ),
    sourceCaptureHash,
    draftHash,
    prepared: {
      input,
      binding: submission.binding,
      captureHash: submission.captureHash,
      submission,
      profile,
      requestHash,
      ownerBinding: journal.metadata.ownerBinding,
    },
  };
}
