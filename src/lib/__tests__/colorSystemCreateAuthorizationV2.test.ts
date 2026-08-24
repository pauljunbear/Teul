import { describe, expect, it, vi } from 'vitest';

vi.mock('../colorSystemBuilderV2Integrity', () => ({
  assertColorSystemBuilderBriefV2Integrity: vi.fn(),
  assertColorSystemStrategyCandidateV2Integrity: vi.fn(),
  assertColorSystemStrategySetV2Integrity: vi.fn(),
}));

vi.mock('../colorSystemApplicationBlueprintV2', () => ({
  assertColorSystemApplicationBlueprintV2Integrity: vi.fn(),
  assertColorSystemSectionBlueprintV2Integrity: vi.fn(),
}));

vi.mock('../colorSystemResourceBlueprintV2', () => ({
  assertColorSystemResourceBlueprintV2Integrity: vi.fn(),
}));

import { deterministicContentHash } from '../colorSystemAudit';
import type {
  ColorSystemBuilderBriefV2,
  ColorSystemStrategyCandidateV2,
  ColorSystemStrategySetV2,
} from '../colorSystemBuilderV2Contracts';
import type {
  ColorSystemApplicationSystemBlueprintV2,
  ColorSystemSectionBlueprintV2,
} from '../colorSystemApplicationBlueprintV2';
import type { ColorSystemPresentationProfileV2 } from '../colorSystemPresentationProfileV2';
import type { ColorSystemResourceBlueprintV2 } from '../colorSystemResourceBlueprintV2';
import {
  COLOR_SYSTEM_CREATE_AUTHORIZATION_V2_SCHEMA_VERSION,
  ColorSystemCreateAuthorizationV2Error,
  assertColorSystemCreateAuthorizationV2Integrity,
  assertColorSystemFreshSourceAuthorityV2Integrity,
  buildColorSystemCreateApprovalV2,
  buildColorSystemCreateAuthorizationV2,
  buildColorSystemFreshSourceAuthorityV2,
  buildColorSystemReviewedSelectionV2,
  getColorSystemCreateEligibilityV2,
  type ColorSystemCreateAuthorizationV2,
  type ColorSystemCreateAuthorizationV2ErrorCode,
  type ColorSystemCreateAuthorizationV2Input,
  type ColorSystemCreateAuthorizationV2LiveContext,
} from '../colorSystemCreateAuthorizationV2';

const NOW = '2026-08-04T12:00:00.000Z';
const REVALIDATED_AT = '2026-08-04T11:59:00.000Z';
const REVIEWED_AT = '2026-08-04T11:59:10.000Z';
const APPROVED_AT = '2026-08-04T11:59:20.000Z';
const ISSUED_AT = '2026-08-04T11:59:30.000Z';
const EXPIRES_AT = '2026-08-04T12:04:30.000Z';
const SOURCE_VALID_UNTIL = '2026-08-04T12:05:00.000Z';

function hash(label: string): string {
  return deterministicContentHash(label);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface Fixture {
  input: ColorSystemCreateAuthorizationV2Input;
  authorization: ColorSystemCreateAuthorizationV2;
  context: ColorSystemCreateAuthorizationV2LiveContext;
}

function fixture(): Fixture {
  const liveSourceHash = hash('live-source');
  const sourceHash = hash('source-authority');
  const sourcePackageHash = hash('source-package');
  const fileHash = hash('current-file');
  const briefHash = hash('brief');
  const candidateHash = hash('candidate');
  const actualSystemHash = hash('actual-system');
  const applicationEvidenceHash = hash('application-evidence');

  const sourceAuthority = buildColorSystemFreshSourceAuthorityV2({
    sourceAuthorityHash: sourceHash,
    liveSourceHash,
    sourcePackageHash,
    currentFileIdentityHash: fileHash,
    revalidatedAt: REVALIDATED_AT,
    validUntil: SOURCE_VALID_UNTIL,
  });
  const brief = {
    sourceHash,
    sourcePackageHash,
    sourceReferenceColors: [],
    briefHash,
  } as unknown as ColorSystemBuilderBriefV2;
  const candidate = {
    id: 'candidate-balanced',
    status: 'complete',
    targetFamilyCount: 4,
    actualFamilyCount: 4,
    missingJobs: [],
    blockers: [],
    actualSystemHash,
    candidateHash,
  } as unknown as ColorSystemStrategyCandidateV2;
  const strategySet = {
    sourceHash,
    sourcePackageHash,
    briefHash,
    status: 'ready',
    candidates: [candidate],
    blockers: [],
    strategySetHash: hash('strategy-set'),
  } as unknown as ColorSystemStrategySetV2;
  const applicationBlueprint = {
    schemaVersion: 'teul-application-system-v2',
    sourceHash,
    sourcePackageHash,
    briefHash,
    candidateId: candidate.id,
    candidateHash,
    profile: 'srgb',
    status: 'ready',
    blockers: [],
    applicationEvidenceHash,
    applicationBlueprintHash: hash('application-blueprint'),
  } as unknown as ColorSystemApplicationSystemBlueprintV2;
  const sectionBlueprint = {
    version: 'teul-color-output/v2',
    sourceHash,
    sourcePackageHash,
    briefHash,
    candidateId: candidate.id,
    candidateHash,
    applicationBlueprintHash: applicationBlueprint.applicationBlueprintHash,
    applicationEvidenceHash,
    sectionBlueprintHash: hash('section-blueprint'),
  } as unknown as ColorSystemSectionBlueprintV2;
  const presentationProfile = {
    profileHash: hash('presentation-profile'),
  } as unknown as ColorSystemPresentationProfileV2;
  const resourceBlueprint = {
    sourceHash,
    sourcePackageHash,
    briefHash,
    strategySetHash: strategySet.strategySetHash,
    candidateId: candidate.id,
    candidateHash,
    applicationBlueprintHash: applicationBlueprint.applicationBlueprintHash,
    sectionBlueprintHash: sectionBlueprint.sectionBlueprintHash,
    presentationProfileHash: presentationProfile.profileHash,
    output: {
      systemId: 'ramp-color-system-v2',
      name: 'Ramp color system v2',
      modes: ['Light', 'Dark'],
    },
    resourceBlueprintHash: hash('resource-blueprint'),
  } as unknown as ColorSystemResourceBlueprintV2;
  const review = buildColorSystemReviewedSelectionV2({
    sourceAuthority,
    brief,
    strategySet,
    candidate,
    applicationBlueprint,
    sectionBlueprint,
    presentationProfile,
    resourceBlueprint,
    sessionId: 'session-1',
    reviewedAt: REVIEWED_AT,
    now: NOW,
  });
  const approval = buildColorSystemCreateApprovalV2({
    review,
    actorId: 'user-paul',
    sessionId: 'session-1',
    action: 'create-copy',
    outputName: 'Ramp color system v2',
    currentFileIdentityHash: fileHash,
    documentProfile: 'srgb',
    currentFileAcknowledged: true,
    manualPublicationAcknowledged: true,
    approvedAt: APPROVED_AT,
    now: NOW,
  });
  const input: ColorSystemCreateAuthorizationV2Input = {
    sourceAuthority,
    brief,
    strategySet,
    candidate,
    applicationBlueprint,
    sectionBlueprint,
    presentationProfile,
    resourceBlueprint,
    review,
    approval,
    sessionId: 'session-1',
    currentFileIdentityHash: fileHash,
    documentProfile: 'srgb',
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    now: NOW,
    consumedReceiptIds: [],
  };
  const authorization = buildColorSystemCreateAuthorizationV2(input);
  const { issuedAt: _issuedAt, expiresAt: _expiresAt, ...context } = input;
  return {
    input,
    authorization,
    context: { ...context, consumedReceiptIds: [] },
  };
}

function expectCode(run: () => unknown, code: ColorSystemCreateAuthorizationV2ErrorCode): void {
  try {
    run();
    throw new Error(`Expected ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(ColorSystemCreateAuthorizationV2Error);
    expect((error as ColorSystemCreateAuthorizationV2Error).code).toBe(code);
  }
}

describe('colorSystemCreateAuthorizationV2', () => {
  it('builds one deterministic, current-file-only authorization through the resource hash', () => {
    const first = fixture();
    const second = fixture();

    expect(first.authorization).toEqual(second.authorization);
    expect(first.authorization.version).toBe(COLOR_SYSTEM_CREATE_AUTHORIZATION_V2_SCHEMA_VERSION);
    expect(first.authorization.oneUse).toBe(true);
    expect(first.authorization.documentProfile).toBe('srgb');
    expect(first.authorization.currentFileAcknowledged).toBe(true);
    expect(first.authorization.manualPublicationAcknowledged).toBe(true);
    expect(first.authorization.receiptId).toBe(
      `teul-create-v2:${first.authorization.createAuthorizationHash.slice('sha256:'.length)}`
    );
    expect(first.authorization.resourceBlueprintHash).toBe(
      first.input.resourceBlueprint.resourceBlueprintHash
    );
    expect(() =>
      assertColorSystemCreateAuthorizationV2Integrity(first.authorization, first.context)
    ).not.toThrow();
    expect(getColorSystemCreateEligibilityV2(first.input)).toEqual({
      eligible: true,
      authorization: first.authorization,
      reasons: [],
    });
  });

  it.each([
    [
      'source authority',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.sourceAuthority.sourceAuthorityHash = hash('changed-source-authority');
      },
    ],
    [
      'live source',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.sourceAuthority.liveSourceHash = hash('changed-live-source');
      },
    ],
    [
      'source package',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.sourceAuthority.sourcePackageHash = hash('changed-source-package');
      },
    ],
    [
      'source revalidation',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.sourceAuthority.revalidationHash = hash('changed-revalidation');
      },
    ],
    [
      'brief',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.brief.briefHash = hash('changed-brief');
      },
    ],
    [
      'strategy set',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.strategySet.strategySetHash = hash('changed-strategy-set');
      },
    ],
    [
      'candidate',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.candidate.candidateHash = hash('changed-candidate');
      },
    ],
    [
      'actual system',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.candidate.actualSystemHash = hash('changed-actual-system');
      },
    ],
    [
      'application blueprint',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.applicationBlueprint.applicationBlueprintHash = hash('changed-application');
      },
    ],
    [
      'application evidence',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.applicationBlueprint.applicationEvidenceHash = hash('changed-evidence');
      },
    ],
    [
      'section blueprint',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.sectionBlueprint.sectionBlueprintHash = hash('changed-section');
      },
    ],
    [
      'resource blueprint',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.resourceBlueprint.resourceBlueprintHash = hash('changed-resource');
      },
    ],
    [
      'review',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.review.reviewHash = hash('changed-review');
      },
    ],
    [
      'approval',
      (context: ColorSystemCreateAuthorizationV2LiveContext) => {
        context.approval.approvalHash = hash('changed-approval');
      },
    ],
  ])('invalidates when the %s hash boundary drifts', (_label, mutate) => {
    const { authorization, context } = fixture();
    const changed = clone(context);
    mutate(changed);
    expect(() => assertColorSystemCreateAuthorizationV2Integrity(authorization, changed)).toThrow(
      ColorSystemCreateAuthorizationV2Error
    );
  });

  it('rejects a different session, current file, replay, and expiration', () => {
    const baseline = fixture();

    expectCode(
      () =>
        assertColorSystemCreateAuthorizationV2Integrity(baseline.authorization, {
          ...baseline.context,
          sessionId: 'different-session',
        }),
      'SESSION_MISMATCH'
    );
    expectCode(
      () =>
        assertColorSystemCreateAuthorizationV2Integrity(baseline.authorization, {
          ...baseline.context,
          currentFileIdentityHash: hash('different-file'),
        }),
      'FILE_MISMATCH'
    );
    expectCode(
      () =>
        assertColorSystemCreateAuthorizationV2Integrity(baseline.authorization, {
          ...baseline.context,
          consumedReceiptIds: [baseline.authorization.receiptId],
        }),
      'AUTHORIZATION_REPLAYED'
    );
    expectCode(
      () =>
        assertColorSystemCreateAuthorizationV2Integrity(baseline.authorization, {
          ...baseline.context,
          now: EXPIRES_AT,
        }),
      'AUTHORIZATION_EXPIRED'
    );
  });

  it('rejects an output name that is not owned by the reviewed resource blueprint', () => {
    const changed = fixture();
    changed.input.approval = buildColorSystemCreateApprovalV2({
      review: changed.input.review,
      actorId: 'user-paul',
      sessionId: 'session-1',
      action: 'create-copy',
      outputName: 'A different system name',
      currentFileIdentityHash: changed.input.currentFileIdentityHash,
      documentProfile: 'srgb',
      currentFileAcknowledged: true,
      manualPublicationAcknowledged: true,
      approvedAt: APPROVED_AT,
      now: NOW,
    });
    expectCode(() => buildColorSystemCreateAuthorizationV2(changed.input), 'AUTHORITY_MISMATCH');
  });

  it('fails closed for non-sRGB documents and missing publication boundaries', () => {
    const baseline = fixture();
    const profileResult = getColorSystemCreateEligibilityV2({
      ...baseline.input,
      documentProfile: 'display-p3',
    });
    expect(profileResult).toMatchObject({
      eligible: false,
      reasons: [{ code: 'PROFILE_UNSUPPORTED' }],
    });

    expectCode(
      () =>
        buildColorSystemCreateApprovalV2({
          review: baseline.input.review,
          actorId: 'user-paul',
          sessionId: 'session-1',
          action: 'create-copy',
          outputName: 'Ramp color system v2',
          currentFileIdentityHash: baseline.input.currentFileIdentityHash,
          documentProfile: 'srgb',
          currentFileAcknowledged: true,
          manualPublicationAcknowledged: false,
          approvedAt: APPROVED_AT,
          now: NOW,
        }),
      'BOUNDARY_UNACKNOWLEDGED'
    );
  });

  it('rejects stale source authority and future review, approval, source, or issue times', () => {
    const baseline = fixture();
    const stale = clone(baseline.input);
    stale.now = SOURCE_VALID_UNTIL;
    expectCode(() => buildColorSystemCreateAuthorizationV2(stale), 'STALE_SOURCE');

    const futureReview = clone(baseline.input);
    futureReview.review.reviewedAt = '2026-08-04T12:00:01.000Z';
    expectCode(() => buildColorSystemCreateAuthorizationV2(futureReview), 'FUTURE_TIMESTAMP');

    const futureApproval = clone(baseline.input);
    futureApproval.approval.approvedAt = '2026-08-04T12:00:01.000Z';
    expectCode(() => buildColorSystemCreateAuthorizationV2(futureApproval), 'FUTURE_TIMESTAMP');

    const futureIssue = clone(baseline.input);
    futureIssue.issuedAt = '2026-08-04T12:00:01.000Z';
    expectCode(() => buildColorSystemCreateAuthorizationV2(futureIssue), 'FUTURE_TIMESTAMP');

    const futureSource = clone(baseline.input);
    futureSource.sourceAuthority = buildColorSystemFreshSourceAuthorityV2({
      sourceAuthorityHash: futureSource.sourceAuthority.sourceAuthorityHash,
      liveSourceHash: futureSource.sourceAuthority.liveSourceHash,
      sourcePackageHash: futureSource.sourceAuthority.sourcePackageHash,
      currentFileIdentityHash: futureSource.sourceAuthority.currentFileIdentityHash,
      revalidatedAt: '2026-08-04T12:00:01.000Z',
      validUntil: '2026-08-04T12:05:01.000Z',
    });
    expectCode(() => buildColorSystemCreateAuthorizationV2(futureSource), 'FUTURE_TIMESTAMP');
  });

  it('rejects underfilled, blocked, and unreviewed selection states', () => {
    const underfilled = fixture();
    underfilled.input.candidate.status = 'underfilled';
    underfilled.input.candidate.actualFamilyCount = 3;
    expectCode(
      () => buildColorSystemCreateAuthorizationV2(underfilled.input),
      'INCOMPLETE_CANDIDATE'
    );

    const blocked = fixture();
    blocked.input.applicationBlueprint.status = 'blocked';
    blocked.input.applicationBlueprint.blockers = [
      {
        code: 'PAIR_THRESHOLD_FAILED',
        evidenceId: 'pair-1',
        message: 'Rendered pair fails its threshold.',
      },
    ];
    expect(getColorSystemCreateEligibilityV2(blocked.input)).toMatchObject({
      eligible: false,
      reasons: [{ code: 'APPLICATION_BLOCKED' }],
    });

    const unreviewed = fixture();
    unreviewed.input.review.state = 'reviewed-for-create-v1' as 'reviewed-for-create';
    expectCode(
      () => buildColorSystemCreateAuthorizationV2(unreviewed.input),
      'UNREVIEWED_SELECTION'
    );
  });

  it('rejects v1 versions and unknown fields at new contract boundaries', () => {
    const baseline = fixture();
    const v1 = {
      ...baseline.authorization,
      version: 'teul-color-create-authorization/v1',
    } as unknown as ColorSystemCreateAuthorizationV2;
    expectCode(
      () => assertColorSystemCreateAuthorizationV2Integrity(v1, baseline.context),
      'INVALID_CONTRACT'
    );

    const unknown = {
      ...baseline.authorization,
      futureResourceReceipt: hash('not-authorized'),
    } as unknown as ColorSystemCreateAuthorizationV2;
    expectCode(
      () => assertColorSystemCreateAuthorizationV2Integrity(unknown, baseline.context),
      'INVALID_CONTRACT'
    );

    const unknownSource = {
      ...baseline.input.sourceAuthority,
      futureField: true,
    } as unknown as typeof baseline.input.sourceAuthority;
    expectCode(
      () => assertColorSystemFreshSourceAuthorityV2Integrity(unknownSource),
      'INVALID_CONTRACT'
    );
  });
});
