import {
  IntakeError,
  canonicalIntakeJson,
  type IntakeSubmission,
  type IntakeJobSnapshot,
  type IntakeProfile,
} from '../../../../services/guideline-intake/src/protocol';
import type { GuidelineIntakeClient } from './intakeClient';

export type PendingCapture = {
  prepared: IntakeSubmission;
  profile: IntakeProfile;
  requestHash: string;
  ownerBinding: string;
  job: IntakeJobSnapshot | null;
};
export function expectedCaptureJob(prepared: IntakeSubmission) {
  return {
    binding: prepared.binding,
    captureHash: prepared.captureHash,
    profileId: prepared.profileId,
    profileVersion: prepared.profileVersion,
  };
}
function wait(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new IntakeError('REQUEST_ABORTED'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 500);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
/** Explicit recovery can only read existing work, including after an uncertain submit response. */
export async function readCaptureJob(
  client: GuidelineIntakeClient,
  item: PendingCapture,
  signal: AbortSignal,
  changed: (item: PendingCapture) => void | Promise<void>,
  action: 'submit' | 'recover'
) {
  const { prepared } = item;
  client = client.forOwner(item.ownerBinding);
  let job =
    action === 'submit'
      ? (await client.submit(prepared, signal)).job
      : item.job
        ? await client.get(item.job.id, expectedCaptureJob(prepared), signal)
        : await client.lookup(item.requestHash, expectedCaptureJob(prepared), signal);
  if (!job) throw new IntakeError('JOB_NOT_FOUND', 404);
  if (signal.aborted) throw new IntakeError('REQUEST_ABORTED');
  await changed({ ...item, job });
  let notified = canonicalIntakeJson(job);
  const until = Date.now() + 150_000;
  while (['queued', 'capturing'].includes(job.status)) {
    await wait(signal);
    job = await client.get(job.id, expectedCaptureJob(prepared), signal);
    if (signal.aborted) throw new IntakeError('REQUEST_ABORTED');
    const next = canonicalIntakeJson(job);
    if (next !== notified) {
      await changed({ ...item, job });
      notified = next;
    }
    if (Date.now() > until) throw new IntakeError('REQUEST_OUTCOME_UNKNOWN');
  }
  if (!['needs-review', 'complete'].includes(job.status))
    throw new IntakeError(job.errorCode ?? 'CAPTURE_UNAVAILABLE');
  return client.result(job.id, expectedCaptureJob(prepared), signal);
}
