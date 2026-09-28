import type {
  IntakeJobSnapshot,
  IntakeProfile,
  IntakeSubmission,
} from '../../../../services/guideline-intake/src/protocol';
import { IntakeError } from '../../../../services/guideline-intake/src/protocol';
import { readGuidelineAssistanceInput, type PreparedGuidelineAssistance } from './assistance';
import { recoveryContext, type RecoveryHandle } from './recoveryRecord';
import { guidelineHash } from './review';
import { upgradeGuidelineDraftV2 } from './reviewV2';

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
  if (!journal.project) throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
  const { submission, profile, requestHash, job } = journal.payload;
  const { capture, draft } = journal.project.project;
  return {
    journal,
    epoch,
    job,
    invalidated: false,
    context: recoveryContext(journal),
    sourceCaptureHash: capture.captureHash,
    draftHash: guidelineHash('scales' in draft ? draft : upgradeGuidelineDraftV2(draft)),
    prepared: {
      input: readGuidelineAssistanceInput(submission.payload, capture),
      binding: submission.binding,
      captureHash: submission.captureHash,
      submission,
      profile,
      requestHash,
      ownerBinding: journal.metadata.ownerBinding,
    },
  };
}
