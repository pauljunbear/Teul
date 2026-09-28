import {
  IntakeError,
  canonicalIntakeJson,
  digest,
  parseIntakeProfile,
  parseIntakeSubmission,
  record,
  type IntakeJobSnapshot,
  type IntakeProfile,
  type IntakeSubmission,
} from '../../../../services/guideline-intake/src/protocol';
import { parseFigmaCaptureRequest } from '../../../../services/guideline-intake/src/figmaProtocol';
import { parseWebsiteCaptureRequest } from '../../../../services/guideline-intake/src/websiteProtocol';
import { readGuidelineAssistanceInput } from './assistance';
import { digestSource } from './evidence';
import { hashCanonical, intakeRequestHash, readIntakeJobSnapshot } from './intakeClient';
import { readAnyGuidelineProject, type OpenedGuidelineProject } from './projectCodec';
import { guidelineHash } from './review';
import { upgradeGuidelineDraftV2 } from './reviewV2';

export const RECOVERY_LIMITS = Object.freeze({
  entries: 8,
  entryBytes: 32 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
  retentionMs: 24 * 60 * 60_000,
});
export const RECOVERY_VERSION = 'teul.guideline-job-recovery.v1';
export type RecoveryKind = 'pdf' | 'figma' | 'website';
export interface RecoveryPayload {
  submission: IntakeSubmission;
  profile: IntakeProfile;
  requestHash: string;
  projectJson: string | null;
  job: IntakeJobSnapshot | null;
}
export interface RecoveryMetadata {
  schemaVersion: typeof RECOVERY_VERSION;
  id: string;
  ownerBinding: string;
  kind: RecoveryKind;
  revision: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  bytes: number;
  contentHash: string;
  job: IntakeJobSnapshot | null;
}
export interface RecoveryReference {
  id: string;
  token: string;
}
export interface RecoveryHandle {
  reference: RecoveryReference;
  metadata: RecoveryMetadata;
  payload: RecoveryPayload;
  project: Extract<OpenedGuidelineProject, { kind: 'pdf' }> | null;
}
export function recoveryId(ownerBinding: string, requestHash: string): string {
  digest(ownerBinding);
  digest(requestHash);
  return `${ownerBinding.slice(7)}.${requestHash.slice(7)}`;
}
export function recoveryExpected(submission: IntakeSubmission) {
  return {
    binding: submission.binding,
    captureHash: submission.captureHash,
    profileId: submission.profileId,
    profileVersion: submission.profileVersion,
  };
}
export function assistanceContext(
  workspaceId: string,
  sourceCaptureHash: string,
  draftHash: string
): string {
  return guidelineHash({ workspaceId, sourceCaptureHash, draftHash });
}
export function recoveryContext(handle: RecoveryHandle): string {
  if (!handle.project) throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
  const { capture, draft } = handle.project.project;
  return assistanceContext(
    handle.payload.submission.binding.workspaceId,
    capture.captureHash,
    guidelineHash('scales' in draft ? draft : upgradeGuidelineDraftV2(draft))
  );
}
export function readRecoveryMetadata(raw: unknown): RecoveryMetadata {
  const value: unknown = JSON.parse(canonicalIntakeJson(raw, 4096));
  record(value, [
    'schemaVersion',
    'id',
    'ownerBinding',
    'kind',
    'revision',
    'createdAt',
    'updatedAt',
    'expiresAt',
    'bytes',
    'contentHash',
    'job',
  ]);
  digest(value.ownerBinding);
  digest(value.contentHash);
  if (
    value.schemaVersion !== RECOVERY_VERSION ||
    typeof value.id !== 'string' ||
    !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value.id) ||
    !value.id.startsWith(`${value.ownerBinding.slice(7)}.`) ||
    !['pdf', 'figma', 'website'].includes(String(value.kind)) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    !Number.isSafeInteger(value.createdAt) ||
    Number(value.createdAt) < 0 ||
    !Number.isSafeInteger(value.updatedAt) ||
    Number(value.updatedAt) < Number(value.createdAt) ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt !== Number(value.createdAt) + RECOVERY_LIMITS.retentionMs ||
    !Number.isSafeInteger(value.bytes) ||
    Number(value.bytes) < 1 ||
    Number(value.bytes) > RECOVERY_LIMITS.entryBytes
  )
    throw new IntakeError('RECOVERY_RECORD_INVALID');
  if (value.job !== null) {
    const job = readIntakeJobSnapshot(value.job, value.job as IntakeJobSnapshot);
    Object.freeze(job.binding);
    Object.freeze(job);
  }
  return Object.freeze(value as unknown as RecoveryMetadata);
}

/** Full validation occurs before initial dispatch and on explicit reopen, never during polling. */
export async function readRecoveryPayload(
  raw: unknown,
  signal?: AbortSignal
): Promise<{ payload: RecoveryPayload; project: RecoveryHandle['project'] }> {
  signal?.throwIfAborted();
  const value: unknown = JSON.parse(canonicalIntakeJson(raw, RECOVERY_LIMITS.entryBytes));
  record(value, ['submission', 'profile', 'requestHash', 'projectJson', 'job']);
  const submission = parseIntakeSubmission(value.submission);
  const profile = parseIntakeProfile(value.profile);
  digest(value.requestHash);
  if ((await intakeRequestHash(submission, profile)) !== value.requestHash)
    throw new IntakeError('RECOVERY_REQUEST_CHANGED');
  let project: RecoveryHandle['project'] = null;
  if (submission.kind === 'pdf') {
    if (profile.operation !== 'interpret' || typeof value.projectJson !== 'string')
      throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
    const result = await readAnyGuidelineProject(value.projectJson, signal);
    if (result.status !== 'opened') throw new IntakeError('RECOVERY_FORMAT_UNSUPPORTED');
    const opened = result.value;
    if (opened.kind !== 'pdf' || 'reviewedValues' in opened.project.draft)
      throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
    project = opened;
    const input = readGuidelineAssistanceInput(submission.payload, opened.project.capture);
    if (
      submission.parserVersion !== 'assisted-review-1' ||
      submission.binding.sourceRevision !== opened.project.capture.identity.sha256 ||
      submission.captureHash !== (await hashCanonical(canonicalIntakeJson(input))) ||
      canonicalIntakeJson(submission.scope) !== canonicalIntakeJson(input.source.scope)
    )
      throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
    for (const image of input.images) {
      const bytes = Uint8Array.from(atob(image.base64), character => character.charCodeAt(0));
      if ((await digestSource(bytes)) !== image.sha256)
        throw new IntakeError('RECOVERY_IMAGE_CHANGED');
      signal?.throwIfAborted();
    }
  } else {
    if (value.projectJson !== null || profile.operation !== 'capture')
      throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
    const request =
      submission.kind === 'figma'
        ? parseFigmaCaptureRequest(submission.payload)
        : parseWebsiteCaptureRequest(submission.payload);
    const requestHash = await hashCanonical(canonicalIntakeJson(request));
    const scope = 'nodeIds' in request ? request.nodeIds : [request.selector];
    if (
      submission.captureHash !== requestHash ||
      submission.binding.sourceRevision !== requestHash ||
      canonicalIntakeJson(submission.scope) !== canonicalIntakeJson(scope) ||
      submission.parserVersion !==
        (submission.kind === 'figma' ? 'figma-native-1' : 'website-capture-1')
    )
      throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
  }
  const job =
    value.job === null ? null : readIntakeJobSnapshot(value.job, recoveryExpected(submission));
  if (job) Object.freeze(job.binding);
  signal?.throwIfAborted();
  return {
    payload: Object.freeze({
      submission,
      profile,
      requestHash: value.requestHash,
      projectJson: value.projectJson as string | null,
      job: job ? Object.freeze(job) : null,
    }),
    project,
  };
}
