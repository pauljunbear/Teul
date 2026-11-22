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
import { parseInterpretationInput } from '../../../../services/guideline-intake/src/interpretation';
import {
  nativeAssistanceMode,
  readNativeAssistanceInput,
  NATIVE_ASSISTANCE_PARSER_VERSION,
} from './nativeAssistance';
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
  project: OpenedGuidelineProject | null;
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
  draftHash: string,
  modeId: string | null = null
): string {
  return guidelineHash({
    workspaceId,
    sourceCaptureHash,
    draftHash,
    ...(modeId !== null ? { modeId } : {}),
  });
}
export function readRecoveryAssistance(project: OpenedGuidelineProject, raw: unknown) {
  if (project.kind === 'pdf') {
    const { capture, draft } = project.project;
    if ('reviewedValues' in draft) throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
    return {
      input: readGuidelineAssistanceInput(raw, capture),
      sourceCaptureHash: capture.captureHash,
      draftHash: guidelineHash('scales' in draft ? draft : upgradeGuidelineDraftV2(draft)),
      modeId: null,
    };
  }
  const input = parseInterpretationInput(raw);
  const modeId = nativeAssistanceMode(input);
  const source =
    project.kind === 'figma'
      ? { kind: project.kind, inventory: project.inventory, draft: project.project.draft }
      : { kind: project.kind, inventory: project.inventory, draft: project.project.draft };
  return {
    input: readNativeAssistanceInput(input, source, modeId),
    sourceCaptureHash: project.project.capture.contentHash,
    draftHash: guidelineHash(project.project.draft),
    modeId,
  };
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
  if (profile.operation === 'interpret') {
    if (typeof value.projectJson !== 'string') throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
    const result = await readAnyGuidelineProject(value.projectJson, signal);
    if (result.status !== 'opened') throw new IntakeError('RECOVERY_FORMAT_UNSUPPORTED');
    const opened = result.value;
    if (opened.kind !== submission.kind) throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
    project = opened;
    const { input } = readRecoveryAssistance(opened, submission.payload);
    const sourceRevision =
      opened.kind === 'pdf'
        ? opened.project.capture.identity.sha256
        : opened.project.capture.contentHash;
    if (
      submission.parserVersion !==
        (opened.kind === 'pdf' ? 'assisted-review-1' : NATIVE_ASSISTANCE_PARSER_VERSION) ||
      submission.binding.sourceRevision !== sourceRevision ||
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
    if (value.projectJson !== null || profile.operation !== 'capture' || submission.kind === 'pdf')
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
