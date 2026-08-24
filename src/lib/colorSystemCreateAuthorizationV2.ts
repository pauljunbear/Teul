import { canonicalJson, deterministicContentHash } from './colorSystemAudit';
import type {
  ColorSystemBuilderBriefV2,
  ColorSystemStrategyCandidateV2,
  ColorSystemStrategySetV2,
} from './colorSystemBuilderV2Contracts';
import {
  assertColorSystemBuilderBriefV2Integrity,
  assertColorSystemStrategyCandidateV2Integrity,
  assertColorSystemStrategySetV2Integrity,
} from './colorSystemBuilderV2Integrity';
import {
  assertColorSystemApplicationBlueprintV2Integrity,
  assertColorSystemSectionBlueprintV2Integrity,
  type ColorSystemApplicationSystemBlueprintV2,
  type ColorSystemSectionBlueprintV2,
} from './colorSystemApplicationBlueprintV2';
import {
  assertColorSystemResourceBlueprintV2Integrity,
  type ColorSystemResourceBlueprintV2,
} from './colorSystemResourceBlueprintV2';
import type { ColorSystemPresentationProfileV2 } from './colorSystemPresentationProfileV2';

export const COLOR_SYSTEM_SOURCE_REVALIDATION_V2_SCHEMA_VERSION =
  'teul-color-source-revalidation/v2' as const;
export const COLOR_SYSTEM_REVIEWED_SELECTION_V2_SCHEMA_VERSION =
  'teul-color-reviewed-selection/v2' as const;
export const COLOR_SYSTEM_CREATE_APPROVAL_V2_SCHEMA_VERSION =
  'teul-color-create-approval/v2' as const;
export const COLOR_SYSTEM_CREATE_AUTHORIZATION_V2_SCHEMA_VERSION =
  'teul-color-create-authorization/v2' as const;

export const COLOR_SYSTEM_CREATE_AUTHORIZATION_V2_MAX_LIFETIME_MS = 5 * 60 * 1000;

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export type ColorSystemCreateActionV2 = 'create-new' | 'create-copy' | 'update-owned';

export type ColorSystemCreateAuthorizationV2ErrorCode =
  | 'INVALID_CONTRACT'
  | 'UPSTREAM_INTEGRITY'
  | 'AUTHORITY_MISMATCH'
  | 'FUTURE_TIMESTAMP'
  | 'STALE_SOURCE'
  | 'INCOMPLETE_CANDIDATE'
  | 'APPLICATION_BLOCKED'
  | 'UNREVIEWED_SELECTION'
  | 'INVALID_APPROVAL'
  | 'SESSION_MISMATCH'
  | 'FILE_MISMATCH'
  | 'PROFILE_UNSUPPORTED'
  | 'BOUNDARY_UNACKNOWLEDGED'
  | 'AUTHORIZATION_EXPIRED'
  | 'AUTHORIZATION_REPLAYED';

export class ColorSystemCreateAuthorizationV2Error extends Error {
  constructor(
    readonly code: ColorSystemCreateAuthorizationV2ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ColorSystemCreateAuthorizationV2Error';
  }
}

/**
 * Backend evidence that the currently open file was re-read after review.
 * This is deliberately separate from the durable source-authority package:
 * it binds that authority to one live file, source hash, and short freshness
 * window without pretending Figma exposes an immutable document revision.
 */
export interface ColorSystemFreshSourceAuthorityV2 {
  version: typeof COLOR_SYSTEM_SOURCE_REVALIDATION_V2_SCHEMA_VERSION;
  status: 'fresh';
  sourceAuthorityHash: string;
  liveSourceHash: string;
  sourcePackageHash: string;
  currentFileIdentityHash: string;
  revalidatedAt: string;
  validUntil: string;
  revalidationHash: string;
}

export interface ColorSystemReviewedSelectionV2 {
  version: typeof COLOR_SYSTEM_REVIEWED_SELECTION_V2_SCHEMA_VERSION;
  state: 'reviewed-for-create';
  sessionId: string;
  sourceAuthorityHash: string;
  liveSourceHash: string;
  briefHash: string;
  strategySetHash: string;
  candidateId: string;
  candidateHash: string;
  actualSystemHash: string;
  applicationBlueprintHash: string;
  applicationEvidenceHash: string;
  sectionBlueprintHash: string;
  resourceBlueprintHash: string;
  reviewedAt: string;
  reviewHash: string;
}

export interface ColorSystemCreateApprovalV2 {
  version: typeof COLOR_SYSTEM_CREATE_APPROVAL_V2_SCHEMA_VERSION;
  state: 'approved-for-create';
  actorId: string;
  sessionId: string;
  reviewHash: string;
  action: ColorSystemCreateActionV2;
  outputName: string;
  currentFileIdentityHash: string;
  documentProfile: 'srgb';
  currentFileAcknowledged: true;
  manualPublicationAcknowledged: true;
  approvedAt: string;
  approvalHash: string;
}

export interface ColorSystemCreateAuthorizationV2 {
  version: typeof COLOR_SYSTEM_CREATE_AUTHORIZATION_V2_SCHEMA_VERSION;
  receiptId: string;
  oneUse: true;
  approvalState: 'approved-for-create';
  sessionId: string;
  actorId: string;
  action: ColorSystemCreateActionV2;
  outputName: string;
  currentFileIdentityHash: string;
  documentProfile: 'srgb';
  currentFileAcknowledged: true;
  manualPublicationAcknowledged: true;
  sourceAuthorityHash: string;
  liveSourceHash: string;
  sourcePackageHash: string;
  sourceRevalidationHash: string;
  briefHash: string;
  strategySetHash: string;
  candidateId: string;
  candidateHash: string;
  actualSystemHash: string;
  applicationBlueprintHash: string;
  applicationEvidenceHash: string;
  sectionBlueprintHash: string;
  resourceBlueprintHash: string;
  reviewHash: string;
  approvalHash: string;
  issuedAt: string;
  expiresAt: string;
  createAuthorizationHash: string;
}

export interface ColorSystemFreshSourceAuthorityV2Input {
  sourceAuthorityHash: string;
  liveSourceHash: string;
  sourcePackageHash: string;
  currentFileIdentityHash: string;
  revalidatedAt: string;
  validUntil: string;
}

export interface ColorSystemReviewedSelectionV2Input {
  sourceAuthority: ColorSystemFreshSourceAuthorityV2;
  brief: ColorSystemBuilderBriefV2;
  strategySet: ColorSystemStrategySetV2;
  candidate: ColorSystemStrategyCandidateV2;
  applicationBlueprint: ColorSystemApplicationSystemBlueprintV2;
  sectionBlueprint: ColorSystemSectionBlueprintV2;
  presentationProfile: ColorSystemPresentationProfileV2;
  resourceBlueprint: ColorSystemResourceBlueprintV2;
  sessionId: string;
  reviewedAt: string;
  now: string;
}

export interface ColorSystemCreateApprovalV2Input {
  review: ColorSystemReviewedSelectionV2;
  actorId: string;
  sessionId: string;
  action: ColorSystemCreateActionV2;
  outputName: string;
  currentFileIdentityHash: string;
  documentProfile: string;
  currentFileAcknowledged: boolean;
  manualPublicationAcknowledged: boolean;
  approvedAt: string;
  now: string;
}

export interface ColorSystemCreateAuthorizationV2Input {
  sourceAuthority: ColorSystemFreshSourceAuthorityV2;
  brief: ColorSystemBuilderBriefV2;
  strategySet: ColorSystemStrategySetV2;
  candidate: ColorSystemStrategyCandidateV2;
  applicationBlueprint: ColorSystemApplicationSystemBlueprintV2;
  sectionBlueprint: ColorSystemSectionBlueprintV2;
  presentationProfile: ColorSystemPresentationProfileV2;
  resourceBlueprint: ColorSystemResourceBlueprintV2;
  review: ColorSystemReviewedSelectionV2;
  approval: ColorSystemCreateApprovalV2;
  sessionId: string;
  currentFileIdentityHash: string;
  documentProfile: string;
  issuedAt: string;
  expiresAt: string;
  now: string;
  consumedReceiptIds?: readonly string[];
}

export interface ColorSystemCreateAuthorizationV2LiveContext extends Omit<
  ColorSystemCreateAuthorizationV2Input,
  'issuedAt' | 'expiresAt'
> {
  consumedReceiptIds: readonly string[];
}

export type ColorSystemCreateEligibilityV2 =
  | {
      eligible: true;
      authorization: ColorSystemCreateAuthorizationV2;
      reasons: readonly [];
    }
  | {
      eligible: false;
      authorization: null;
      reasons: readonly [
        Readonly<{
          code: ColorSystemCreateAuthorizationV2ErrorCode;
          message: string;
        }>,
      ];
    };

type SourceRevalidationContent = Omit<ColorSystemFreshSourceAuthorityV2, 'revalidationHash'>;
type ReviewedSelectionContent = Omit<ColorSystemReviewedSelectionV2, 'reviewHash'>;
type CreateApprovalContent = Omit<ColorSystemCreateApprovalV2, 'approvalHash'>;
type CreateAuthorizationContent = Omit<
  ColorSystemCreateAuthorizationV2,
  'receiptId' | 'createAuthorizationHash'
>;

function fail(code: ColorSystemCreateAuthorizationV2ErrorCode, message: string): never {
  throw new ColorSystemCreateAuthorizationV2Error(code, message);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_CONTRACT', `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireKnownKeys(value: unknown, allowed: readonly string[], label: string): void {
  const record = requireRecord(value, label);
  const unsupported = Object.keys(record)
    .filter(key => !allowed.includes(key))
    .sort();
  if (unsupported.length > 0) {
    fail('INVALID_CONTRACT', `${label} contains unsupported fields: ${unsupported.join(', ')}.`);
  }
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('INVALID_CONTRACT', `${label} must not be empty.`);
  }
  return value.trim();
}

function requireHash(value: string, label: string): string {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail('INVALID_CONTRACT', `${label} must be a canonical SHA-256 content hash.`);
  }
  return value;
}

function timestampMs(value: string, label: string): number {
  if (typeof value !== 'string') fail('INVALID_CONTRACT', `${label} must be an ISO timestamp.`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail('INVALID_CONTRACT', `${label} must be a canonical ISO-8601 UTC timestamp.`);
  }
  return parsed;
}

function requireNotFuture(value: string, now: string, label: string): number {
  const valueMs = timestampMs(value, label);
  const nowMs = timestampMs(now, 'now');
  if (valueMs > nowMs) fail('FUTURE_TIMESTAMP', `${label} cannot be in the future.`);
  return valueMs;
}

function requireAction(value: string): ColorSystemCreateActionV2 {
  if (value !== 'create-new' && value !== 'create-copy' && value !== 'update-owned') {
    fail('INVALID_CONTRACT', 'Create action is unsupported.');
  }
  return value;
}

function assertCanonical<T>(actual: T, rebuilt: T, label: string): void {
  if (canonicalJson(actual) !== canonicalJson(rebuilt)) {
    fail('AUTHORITY_MISMATCH', `${label} failed canonical hash integrity validation.`);
  }
}

function callUpstreamIntegrity(assertion: () => void, label: string): void {
  try {
    assertion();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail('UPSTREAM_INTEGRITY', `${label} failed integrity validation: ${message}`);
  }
}

export function buildColorSystemFreshSourceAuthorityV2(
  input: ColorSystemFreshSourceAuthorityV2Input
): ColorSystemFreshSourceAuthorityV2 {
  requireKnownKeys(
    input,
    [
      'sourceAuthorityHash',
      'liveSourceHash',
      'sourcePackageHash',
      'currentFileIdentityHash',
      'revalidatedAt',
      'validUntil',
    ],
    'Source revalidation input'
  );
  const revalidatedAtMs = timestampMs(input.revalidatedAt, 'revalidatedAt');
  const validUntilMs = timestampMs(input.validUntil, 'validUntil');
  if (validUntilMs <= revalidatedAtMs) {
    fail('INVALID_CONTRACT', 'Source freshness must end after revalidation.');
  }
  const content: SourceRevalidationContent = {
    version: COLOR_SYSTEM_SOURCE_REVALIDATION_V2_SCHEMA_VERSION,
    status: 'fresh',
    sourceAuthorityHash: requireHash(input.sourceAuthorityHash, 'sourceAuthorityHash'),
    liveSourceHash: requireHash(input.liveSourceHash, 'liveSourceHash'),
    sourcePackageHash: requireHash(input.sourcePackageHash, 'sourcePackageHash'),
    currentFileIdentityHash: requireHash(input.currentFileIdentityHash, 'currentFileIdentityHash'),
    revalidatedAt: input.revalidatedAt,
    validUntil: input.validUntil,
  };
  return { ...content, revalidationHash: deterministicContentHash(content) };
}

export function assertColorSystemFreshSourceAuthorityV2Integrity(
  authority: ColorSystemFreshSourceAuthorityV2
): void {
  requireKnownKeys(
    authority,
    [
      'version',
      'status',
      'sourceAuthorityHash',
      'liveSourceHash',
      'sourcePackageHash',
      'currentFileIdentityHash',
      'revalidatedAt',
      'validUntil',
      'revalidationHash',
    ],
    'Source revalidation'
  );
  if (
    authority.version !== COLOR_SYSTEM_SOURCE_REVALIDATION_V2_SCHEMA_VERSION ||
    authority.status !== 'fresh'
  ) {
    fail('INVALID_CONTRACT', 'Source revalidation is not the supported fresh v2 contract.');
  }
  requireHash(authority.revalidationHash, 'revalidationHash');
  const rebuilt = buildColorSystemFreshSourceAuthorityV2({
    sourceAuthorityHash: authority.sourceAuthorityHash,
    liveSourceHash: authority.liveSourceHash,
    sourcePackageHash: authority.sourcePackageHash,
    currentFileIdentityHash: authority.currentFileIdentityHash,
    revalidatedAt: authority.revalidatedAt,
    validUntil: authority.validUntil,
  });
  assertCanonical(authority, rebuilt, 'Source revalidation');
}

function assertUpstreamChain(input: {
  sourceAuthority: ColorSystemFreshSourceAuthorityV2;
  brief: ColorSystemBuilderBriefV2;
  strategySet: ColorSystemStrategySetV2;
  candidate: ColorSystemStrategyCandidateV2;
  applicationBlueprint: ColorSystemApplicationSystemBlueprintV2;
  sectionBlueprint: ColorSystemSectionBlueprintV2;
  presentationProfile: ColorSystemPresentationProfileV2;
  resourceBlueprint: ColorSystemResourceBlueprintV2;
}): void {
  assertColorSystemFreshSourceAuthorityV2Integrity(input.sourceAuthority);
  callUpstreamIntegrity(
    () => assertColorSystemBuilderBriefV2Integrity(input.brief),
    'Builder brief'
  );
  callUpstreamIntegrity(
    () => assertColorSystemStrategyCandidateV2Integrity(input.brief, input.candidate),
    'Selected candidate'
  );
  callUpstreamIntegrity(
    () => assertColorSystemStrategySetV2Integrity(input.brief, input.strategySet),
    'Strategy set'
  );
  callUpstreamIntegrity(
    () =>
      assertColorSystemApplicationBlueprintV2Integrity(
        input.brief,
        input.candidate,
        input.applicationBlueprint
      ),
    'Application blueprint'
  );
  callUpstreamIntegrity(
    () =>
      assertColorSystemSectionBlueprintV2Integrity(
        input.brief,
        input.candidate,
        input.sectionBlueprint
      ),
    'Section blueprint'
  );
  callUpstreamIntegrity(
    () =>
      assertColorSystemResourceBlueprintV2Integrity(
        input.brief,
        input.strategySet,
        input.candidate,
        input.applicationBlueprint,
        input.sectionBlueprint,
        input.presentationProfile,
        input.resourceBlueprint
      ),
    'Resource blueprint'
  );

  if (
    input.sourceAuthority.sourceAuthorityHash !== input.brief.sourceHash ||
    input.sourceAuthority.sourcePackageHash !== input.brief.sourcePackageHash ||
    input.strategySet.sourceHash !== input.brief.sourceHash ||
    input.strategySet.sourcePackageHash !== input.brief.sourcePackageHash ||
    input.strategySet.briefHash !== input.brief.briefHash
  ) {
    fail('AUTHORITY_MISMATCH', 'Live source, brief, and strategy authority do not match.');
  }
  const selected = input.strategySet.candidates.find(
    candidate => candidate.id === input.candidate.id
  );
  if (!selected || canonicalJson(selected) !== canonicalJson(input.candidate)) {
    fail('AUTHORITY_MISMATCH', 'Selected candidate is not the exact strategy-set candidate.');
  }
  if (
    input.candidate.status !== 'complete' ||
    input.candidate.actualFamilyCount !== input.candidate.targetFamilyCount ||
    input.candidate.missingJobs.length > 0 ||
    input.candidate.blockers.length > 0
  ) {
    fail('INCOMPLETE_CANDIDATE', 'Only a complete, fully filled, unblocked candidate can create.');
  }
  if (
    input.applicationBlueprint.status !== 'ready' ||
    input.applicationBlueprint.blockers.length > 0
  ) {
    fail('APPLICATION_BLOCKED', 'Application evidence is blocked and cannot authorize Create.');
  }
  if (
    input.applicationBlueprint.sourceHash !== input.brief.sourceHash ||
    input.applicationBlueprint.sourcePackageHash !== input.brief.sourcePackageHash ||
    input.applicationBlueprint.briefHash !== input.brief.briefHash ||
    input.applicationBlueprint.candidateId !== input.candidate.id ||
    input.applicationBlueprint.candidateHash !== input.candidate.candidateHash ||
    input.applicationBlueprint.profile !== 'srgb'
  ) {
    fail('AUTHORITY_MISMATCH', 'Application blueprint does not match the selected v2 chain.');
  }
  if (
    input.sectionBlueprint.sourceHash !== input.brief.sourceHash ||
    input.sectionBlueprint.sourcePackageHash !== input.brief.sourcePackageHash ||
    input.sectionBlueprint.briefHash !== input.brief.briefHash ||
    input.sectionBlueprint.candidateId !== input.candidate.id ||
    input.sectionBlueprint.candidateHash !== input.candidate.candidateHash ||
    input.sectionBlueprint.applicationBlueprintHash !==
      input.applicationBlueprint.applicationBlueprintHash ||
    input.sectionBlueprint.applicationEvidenceHash !==
      input.applicationBlueprint.applicationEvidenceHash
  ) {
    fail('AUTHORITY_MISMATCH', 'Section blueprint does not match application evidence.');
  }
  if (
    input.resourceBlueprint.sourceHash !== input.brief.sourceHash ||
    input.resourceBlueprint.sourcePackageHash !== input.brief.sourcePackageHash ||
    input.resourceBlueprint.briefHash !== input.brief.briefHash ||
    input.resourceBlueprint.strategySetHash !== input.strategySet.strategySetHash ||
    input.resourceBlueprint.candidateId !== input.candidate.id ||
    input.resourceBlueprint.candidateHash !== input.candidate.candidateHash ||
    input.resourceBlueprint.applicationBlueprintHash !==
      input.applicationBlueprint.applicationBlueprintHash ||
    input.resourceBlueprint.sectionBlueprintHash !== input.sectionBlueprint.sectionBlueprintHash ||
    input.resourceBlueprint.presentationProfileHash !== input.presentationProfile.profileHash
  ) {
    fail('AUTHORITY_MISMATCH', 'Resource blueprint does not match the reviewed v2 chain.');
  }
}

function reviewedSelectionContent(
  input: ColorSystemReviewedSelectionV2Input
): ReviewedSelectionContent {
  assertUpstreamChain(input);
  const reviewedAt = requireNotFuture(input.reviewedAt, input.now, 'reviewedAt');
  const revalidatedAt = requireNotFuture(
    input.sourceAuthority.revalidatedAt,
    input.now,
    'source revalidatedAt'
  );
  if (revalidatedAt > reviewedAt) {
    fail('UNREVIEWED_SELECTION', 'Selection review cannot precede live source revalidation.');
  }
  const validUntil = timestampMs(input.sourceAuthority.validUntil, 'source validUntil');
  if (timestampMs(input.now, 'now') >= validUntil) {
    fail('STALE_SOURCE', 'Source revalidation expired before the selection was reviewed.');
  }
  return {
    version: COLOR_SYSTEM_REVIEWED_SELECTION_V2_SCHEMA_VERSION,
    state: 'reviewed-for-create',
    sessionId: requireNonEmpty(input.sessionId, 'sessionId'),
    sourceAuthorityHash: input.sourceAuthority.sourceAuthorityHash,
    liveSourceHash: input.sourceAuthority.liveSourceHash,
    briefHash: input.brief.briefHash,
    strategySetHash: input.strategySet.strategySetHash,
    candidateId: input.candidate.id,
    candidateHash: input.candidate.candidateHash,
    actualSystemHash: input.candidate.actualSystemHash,
    applicationBlueprintHash: input.applicationBlueprint.applicationBlueprintHash,
    applicationEvidenceHash: input.applicationBlueprint.applicationEvidenceHash,
    sectionBlueprintHash: input.sectionBlueprint.sectionBlueprintHash,
    resourceBlueprintHash: input.resourceBlueprint.resourceBlueprintHash,
    reviewedAt: input.reviewedAt,
  };
}

export function buildColorSystemReviewedSelectionV2(
  input: ColorSystemReviewedSelectionV2Input
): ColorSystemReviewedSelectionV2 {
  requireKnownKeys(
    input,
    [
      'sourceAuthority',
      'brief',
      'strategySet',
      'candidate',
      'applicationBlueprint',
      'sectionBlueprint',
      'presentationProfile',
      'resourceBlueprint',
      'sessionId',
      'reviewedAt',
      'now',
    ],
    'Reviewed selection input'
  );
  const content = reviewedSelectionContent(input);
  return { ...content, reviewHash: deterministicContentHash(content) };
}

export function assertColorSystemReviewedSelectionV2Integrity(
  review: ColorSystemReviewedSelectionV2,
  input: ColorSystemReviewedSelectionV2Input
): void {
  requireKnownKeys(
    review,
    [
      'version',
      'state',
      'sessionId',
      'sourceAuthorityHash',
      'liveSourceHash',
      'briefHash',
      'strategySetHash',
      'candidateId',
      'candidateHash',
      'actualSystemHash',
      'applicationBlueprintHash',
      'applicationEvidenceHash',
      'sectionBlueprintHash',
      'resourceBlueprintHash',
      'reviewedAt',
      'reviewHash',
    ],
    'Reviewed selection'
  );
  if (
    review.version !== COLOR_SYSTEM_REVIEWED_SELECTION_V2_SCHEMA_VERSION ||
    review.state !== 'reviewed-for-create'
  ) {
    fail('UNREVIEWED_SELECTION', 'Selection is not reviewed for Create.');
  }
  requireHash(review.reviewHash, 'reviewHash');
  const rebuilt = buildColorSystemReviewedSelectionV2({ ...input, reviewedAt: review.reviewedAt });
  if (canonicalJson(review) !== canonicalJson(rebuilt)) {
    fail(
      'UNREVIEWED_SELECTION',
      'Reviewed selection is stale or does not match the current chain.'
    );
  }
}

function createApprovalContent(input: ColorSystemCreateApprovalV2Input): CreateApprovalContent {
  requireKnownKeys(
    input,
    [
      'review',
      'actorId',
      'sessionId',
      'action',
      'outputName',
      'currentFileIdentityHash',
      'documentProfile',
      'currentFileAcknowledged',
      'manualPublicationAcknowledged',
      'approvedAt',
      'now',
    ],
    'Create approval input'
  );
  requireNotFuture(input.approvedAt, input.now, 'approvedAt');
  if (
    timestampMs(input.approvedAt, 'approvedAt') < timestampMs(input.review.reviewedAt, 'reviewedAt')
  ) {
    fail('INVALID_APPROVAL', 'Create approval cannot precede selection review.');
  }
  const sessionId = requireNonEmpty(input.sessionId, 'approval sessionId');
  if (sessionId !== input.review.sessionId) {
    fail('SESSION_MISMATCH', 'Approval session does not match the reviewed selection.');
  }
  if (input.documentProfile !== 'srgb') {
    fail('PROFILE_UNSUPPORTED', 'Release one Create authorization supports sRGB only.');
  }
  if (!input.currentFileAcknowledged || !input.manualPublicationAcknowledged) {
    fail(
      'BOUNDARY_UNACKNOWLEDGED',
      'Create requires explicit current-file and manual-publication acknowledgement.'
    );
  }
  return {
    version: COLOR_SYSTEM_CREATE_APPROVAL_V2_SCHEMA_VERSION,
    state: 'approved-for-create',
    actorId: requireNonEmpty(input.actorId, 'approval actorId'),
    sessionId,
    reviewHash: requireHash(input.review.reviewHash, 'reviewHash'),
    action: requireAction(input.action),
    outputName: requireNonEmpty(input.outputName, 'outputName'),
    currentFileIdentityHash: requireHash(
      input.currentFileIdentityHash,
      'approval currentFileIdentityHash'
    ),
    documentProfile: 'srgb',
    currentFileAcknowledged: true,
    manualPublicationAcknowledged: true,
    approvedAt: input.approvedAt,
  };
}

export function buildColorSystemCreateApprovalV2(
  input: ColorSystemCreateApprovalV2Input
): ColorSystemCreateApprovalV2 {
  const content = createApprovalContent(input);
  return { ...content, approvalHash: deterministicContentHash(content) };
}

export function assertColorSystemCreateApprovalV2Integrity(
  approval: ColorSystemCreateApprovalV2,
  input: ColorSystemCreateApprovalV2Input
): void {
  requireKnownKeys(
    approval,
    [
      'version',
      'state',
      'actorId',
      'sessionId',
      'reviewHash',
      'action',
      'outputName',
      'currentFileIdentityHash',
      'documentProfile',
      'currentFileAcknowledged',
      'manualPublicationAcknowledged',
      'approvedAt',
      'approvalHash',
    ],
    'Create approval'
  );
  if (
    approval.version !== COLOR_SYSTEM_CREATE_APPROVAL_V2_SCHEMA_VERSION ||
    approval.state !== 'approved-for-create'
  ) {
    fail('INVALID_APPROVAL', 'Approval is not the supported approved-for-create v2 receipt.');
  }
  requireHash(approval.approvalHash, 'approvalHash');
  const rebuilt = buildColorSystemCreateApprovalV2({ ...input, approvedAt: approval.approvedAt });
  if (canonicalJson(approval) !== canonicalJson(rebuilt)) {
    fail('INVALID_APPROVAL', 'Create approval is stale or failed canonical hash validation.');
  }
}

function authorizationContent(
  input: ColorSystemCreateAuthorizationV2Input
): CreateAuthorizationContent {
  requireKnownKeys(
    input,
    [
      'sourceAuthority',
      'brief',
      'strategySet',
      'candidate',
      'applicationBlueprint',
      'sectionBlueprint',
      'presentationProfile',
      'resourceBlueprint',
      'review',
      'approval',
      'sessionId',
      'currentFileIdentityHash',
      'documentProfile',
      'issuedAt',
      'expiresAt',
      'now',
      'consumedReceiptIds',
    ],
    'Create authorization input'
  );
  assertUpstreamChain(input);
  const sessionId = requireNonEmpty(input.sessionId, 'authorization sessionId');
  if (sessionId !== input.review.sessionId || sessionId !== input.approval.sessionId) {
    fail('SESSION_MISMATCH', 'Authorization, review, and approval sessions do not match.');
  }
  const currentFileIdentityHash = requireHash(
    input.currentFileIdentityHash,
    'authorization currentFileIdentityHash'
  );
  if (
    currentFileIdentityHash !== input.sourceAuthority.currentFileIdentityHash ||
    currentFileIdentityHash !== input.approval.currentFileIdentityHash
  ) {
    fail('FILE_MISMATCH', 'Create is authorized only for the freshly revalidated current file.');
  }
  if (
    input.documentProfile !== 'srgb' ||
    input.applicationBlueprint.profile !== 'srgb' ||
    input.approval.documentProfile !== 'srgb'
  ) {
    fail('PROFILE_UNSUPPORTED', 'Release one Create authorization supports sRGB only.');
  }
  if (!input.approval.currentFileAcknowledged || !input.approval.manualPublicationAcknowledged) {
    fail(
      'BOUNDARY_UNACKNOWLEDGED',
      'Create requires explicit current-file and manual-publication acknowledgement.'
    );
  }
  if (input.approval.outputName !== input.resourceBlueprint.output.name) {
    fail(
      'AUTHORITY_MISMATCH',
      'Create output name must come from the exact reviewed resource blueprint.'
    );
  }

  assertColorSystemReviewedSelectionV2Integrity(input.review, {
    sourceAuthority: input.sourceAuthority,
    brief: input.brief,
    strategySet: input.strategySet,
    candidate: input.candidate,
    applicationBlueprint: input.applicationBlueprint,
    sectionBlueprint: input.sectionBlueprint,
    presentationProfile: input.presentationProfile,
    resourceBlueprint: input.resourceBlueprint,
    sessionId,
    reviewedAt: input.review.reviewedAt,
    now: input.now,
  });
  assertColorSystemCreateApprovalV2Integrity(input.approval, {
    review: input.review,
    actorId: input.approval.actorId,
    sessionId,
    action: input.approval.action,
    outputName: input.approval.outputName,
    currentFileIdentityHash,
    documentProfile: input.documentProfile,
    currentFileAcknowledged: input.approval.currentFileAcknowledged,
    manualPublicationAcknowledged: input.approval.manualPublicationAcknowledged,
    approvedAt: input.approval.approvedAt,
    now: input.now,
  });

  const nowMs = timestampMs(input.now, 'now');
  const issuedAtMs = requireNotFuture(input.issuedAt, input.now, 'issuedAt');
  const expiresAtMs = timestampMs(input.expiresAt, 'expiresAt');
  const sourceRevalidatedAtMs = requireNotFuture(
    input.sourceAuthority.revalidatedAt,
    input.now,
    'source revalidatedAt'
  );
  const sourceValidUntilMs = timestampMs(input.sourceAuthority.validUntil, 'source validUntil');
  const reviewedAtMs = requireNotFuture(input.review.reviewedAt, input.now, 'reviewedAt');
  const approvedAtMs = requireNotFuture(input.approval.approvedAt, input.now, 'approvedAt');
  if (
    sourceRevalidatedAtMs > reviewedAtMs ||
    reviewedAtMs > approvedAtMs ||
    approvedAtMs > issuedAtMs
  ) {
    fail(
      'INVALID_APPROVAL',
      'Revalidation, review, approval, and authorization timestamps must be ordered.'
    );
  }
  if (nowMs >= sourceValidUntilMs || expiresAtMs > sourceValidUntilMs) {
    fail('STALE_SOURCE', 'Source revalidation is stale for this authorization window.');
  }
  if (
    expiresAtMs <= issuedAtMs ||
    expiresAtMs - issuedAtMs > COLOR_SYSTEM_CREATE_AUTHORIZATION_V2_MAX_LIFETIME_MS
  ) {
    fail(
      'INVALID_CONTRACT',
      `Authorization lifetime must be greater than zero and at most ${COLOR_SYSTEM_CREATE_AUTHORIZATION_V2_MAX_LIFETIME_MS}ms.`
    );
  }
  if (nowMs >= expiresAtMs) {
    fail('AUTHORIZATION_EXPIRED', 'Create authorization has expired.');
  }

  return {
    version: COLOR_SYSTEM_CREATE_AUTHORIZATION_V2_SCHEMA_VERSION,
    oneUse: true,
    approvalState: 'approved-for-create',
    sessionId,
    actorId: input.approval.actorId,
    action: input.approval.action,
    outputName: input.approval.outputName,
    currentFileIdentityHash,
    documentProfile: 'srgb',
    currentFileAcknowledged: true,
    manualPublicationAcknowledged: true,
    sourceAuthorityHash: input.sourceAuthority.sourceAuthorityHash,
    liveSourceHash: input.sourceAuthority.liveSourceHash,
    sourcePackageHash: input.sourceAuthority.sourcePackageHash,
    sourceRevalidationHash: input.sourceAuthority.revalidationHash,
    briefHash: input.brief.briefHash,
    strategySetHash: input.strategySet.strategySetHash,
    candidateId: input.candidate.id,
    candidateHash: input.candidate.candidateHash,
    actualSystemHash: input.candidate.actualSystemHash,
    applicationBlueprintHash: input.applicationBlueprint.applicationBlueprintHash,
    applicationEvidenceHash: input.applicationBlueprint.applicationEvidenceHash,
    sectionBlueprintHash: input.sectionBlueprint.sectionBlueprintHash,
    resourceBlueprintHash: input.resourceBlueprint.resourceBlueprintHash,
    reviewHash: input.review.reviewHash,
    approvalHash: input.approval.approvalHash,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  };
}

export function buildColorSystemCreateAuthorizationV2(
  input: ColorSystemCreateAuthorizationV2Input
): ColorSystemCreateAuthorizationV2 {
  const content = authorizationContent(input);
  const createAuthorizationHash = deterministicContentHash(content);
  return {
    ...content,
    receiptId: `teul-create-v2:${createAuthorizationHash.slice('sha256:'.length)}`,
    createAuthorizationHash,
  };
}

export function assertColorSystemCreateAuthorizationV2Integrity(
  authorization: ColorSystemCreateAuthorizationV2,
  context: ColorSystemCreateAuthorizationV2LiveContext
): void {
  requireKnownKeys(
    authorization,
    [
      'version',
      'receiptId',
      'oneUse',
      'approvalState',
      'sessionId',
      'actorId',
      'action',
      'outputName',
      'currentFileIdentityHash',
      'documentProfile',
      'currentFileAcknowledged',
      'manualPublicationAcknowledged',
      'sourceAuthorityHash',
      'liveSourceHash',
      'sourcePackageHash',
      'sourceRevalidationHash',
      'briefHash',
      'strategySetHash',
      'candidateId',
      'candidateHash',
      'actualSystemHash',
      'applicationBlueprintHash',
      'applicationEvidenceHash',
      'sectionBlueprintHash',
      'resourceBlueprintHash',
      'reviewHash',
      'approvalHash',
      'issuedAt',
      'expiresAt',
      'createAuthorizationHash',
    ],
    'Create authorization'
  );
  if (
    authorization.version !== COLOR_SYSTEM_CREATE_AUTHORIZATION_V2_SCHEMA_VERSION ||
    authorization.oneUse !== true ||
    authorization.approvalState !== 'approved-for-create'
  ) {
    fail('INVALID_CONTRACT', 'Create authorization is not the supported one-use v2 contract.');
  }
  requireHash(authorization.createAuthorizationHash, 'createAuthorizationHash');
  if (context.consumedReceiptIds.includes(authorization.receiptId)) {
    fail('AUTHORIZATION_REPLAYED', 'Create authorization receipt has already been consumed.');
  }
  const rebuilt = buildColorSystemCreateAuthorizationV2({
    ...context,
    issuedAt: authorization.issuedAt,
    expiresAt: authorization.expiresAt,
  });
  assertCanonical(authorization, rebuilt, 'Create authorization');
}

export function getColorSystemCreateEligibilityV2(
  input: ColorSystemCreateAuthorizationV2Input
): ColorSystemCreateEligibilityV2 {
  try {
    return {
      eligible: true,
      authorization: buildColorSystemCreateAuthorizationV2(input),
      reasons: [],
    };
  } catch (error) {
    if (error instanceof ColorSystemCreateAuthorizationV2Error) {
      return {
        eligible: false,
        authorization: null,
        reasons: [{ code: error.code, message: error.message }],
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      eligible: false,
      authorization: null,
      reasons: [{ code: 'UPSTREAM_INTEGRITY', message }],
    };
  }
}
