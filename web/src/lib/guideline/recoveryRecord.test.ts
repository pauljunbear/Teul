import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalIntakeJson,
  type IntakeProfile,
} from '../../../../services/guideline-intake/src/protocol';
import { prepareGuidelineAssistance } from './assistance';
import { hashCanonical, intakeRequestHash, prepareIntakeSubmission } from './intakeClient';
import {
  readRecoveryPayload,
  readRecoveryMetadata,
  recoveryId,
  RECOVERY_LIMITS,
  RECOVERY_VERSION,
  type RecoveryPayload,
} from './recoveryRecord';
import { prepareWebsiteCapture } from './websiteCapture';
import { prepareFigmaCapture } from './figmaCapture';

const legacy = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/guidelines/legacy-projects.json', import.meta.url),
    'utf8'
  )
);
const hash = `sha256:${'a'.repeat(64)}`;
const profile: IntakeProfile = {
  id: 'synthetic-assistance',
  version: '1',
  kind: 'pdf',
  operation: 'interpret',
  destination: 'Synthetic local test',
  consentPolicyVersion: '1',
  maximumAttemptCostMicros: 0,
  maximumJobCostMicros: 0,
};
async function pdf(): Promise<RecoveryPayload> {
  const evidence = await prepareGuidelineAssistance(legacy.project.capture, {
    workspaceId: 'workspace-1',
  });
  const submission = await prepareIntakeSubmission(
    {
      profileId: profile.id,
      profileVersion: profile.version,
      kind: 'pdf',
      binding: evidence.binding,
      captureHash: evidence.captureHash,
      scope: evidence.input.source.scope,
      parserVersion: 'assisted-review-1',
      payload: JSON.parse(canonicalIntakeJson(evidence.input)),
    },
    profile
  );
  return {
    submission,
    profile,
    requestHash: await intakeRequestHash(submission, profile),
    projectJson: ` \n${JSON.stringify(legacy.project)}\n `,
    job: null,
  };
}

describe('durable recovery record', () => {
  it('retains exact old-format project bytes and the original submitted interpretation input', async () => {
    const raw = await pdf();
    const { payload, project } = await readRecoveryPayload(raw);
    expect(payload).toEqual(raw);
    expect(payload.projectJson).toBe(raw.projectJson);
    expect(project?.project.capture).toEqual(legacy.project.capture);
    expect(Object.isFrozen(payload)).toBe(true);
    expect(Object.isFrozen(payload.submission.payload)).toBe(true);
  });
  it('rejects rehashed changes that break source, parser, scope or profile semantics', async () => {
    const original = await pdf();
    for (const change of [
      { scope: ['page:99'] },
      { parserVersion: 'other' },
      { binding: { ...original.submission.binding, sourceRevision: hash } },
      { captureHash: hash },
    ]) {
      const submission = { ...original.submission, ...change };
      await expect(
        readRecoveryPayload({
          ...original,
          submission,
          requestHash: await intakeRequestHash(submission, profile),
        })
      ).rejects.toThrow('RECOVERY_CONTEXT_MISMATCH');
    }
    await expect(readRecoveryPayload({ ...original, projectJson: null })).rejects.toThrow(
      'RECOVERY_CONTEXT_MISMATCH'
    );
    await expect(readRecoveryPayload({ ...original, requestHash: hash })).rejects.toThrow(
      'RECOVERY_REQUEST_CHANGED'
    );
    await expect(readRecoveryPayload({ ...original, extra: true })).rejects.toThrow(
      'INVALID_FIELDS'
    );
  });
  it('validates native and website request bindings without current provider configuration', async () => {
    const figmaProfile: IntakeProfile = {
      ...profile,
      id: 'figma-native-capture',
      kind: 'figma',
      operation: 'capture',
    };
    const figma = await prepareFigmaCapture(
      {
        fileKey: 'abc123',
        version: '1',
        name: 'Synthetic',
        entries: [{ id: '1:2', name: 'Colors', type: 'FRAME', pageId: '1:1' }],
      },
      ['1:2'],
      false,
      'w1',
      figmaProfile
    );
    const websiteProfile: IntakeProfile = {
      ...profile,
      id: 'website-capture',
      kind: 'website',
      operation: 'capture',
    };
    const website = await prepareWebsiteCapture(
      {
        schemaVersion: 'teul.website-request.v1',
        url: 'https://example.com/',
        selector: 'main',
        viewport: { width: 1280, height: 800 },
        colorScheme: 'light',
        excludedSelectors: [],
        includedIncidentalSelectors: [],
      },
      'w2',
      websiteProfile
    );
    for (const [submission, selected] of [
      [figma, figmaProfile],
      [website, websiteProfile],
    ] as const) {
      const raw = {
        submission,
        profile: selected,
        requestHash: await intakeRequestHash(submission, selected),
        projectJson: null,
        job: null,
      };
      expect((await readRecoveryPayload(raw)).payload).toEqual(raw);
      const changed = { ...submission, scope: ['different'] };
      await expect(
        readRecoveryPayload({
          ...raw,
          submission: changed,
          requestHash: await intakeRequestHash(changed, selected),
        })
      ).rejects.toThrow('RECOVERY_CONTEXT_MISMATCH');
    }
  });
  it('honors abort before interpreting a retained project', async () => {
    const raw = await pdf();
    const controller = new AbortController();
    controller.abort();
    await expect(readRecoveryPayload(raw, controller.signal)).rejects.toThrow();
  });
  it('binds bounded metadata to its account, lifetime and exact payload size', async () => {
    const raw = await pdf();
    const json = canonicalIntakeJson(raw, RECOVERY_LIMITS.entryBytes);
    const metadata = {
      schemaVersion: RECOVERY_VERSION,
      id: recoveryId(hash, raw.requestHash),
      ownerBinding: hash,
      kind: 'pdf',
      revision: 1,
      createdAt: 1000,
      updatedAt: 1000,
      expiresAt: 1000 + RECOVERY_LIMITS.retentionMs,
      bytes: new TextEncoder().encode(json).length,
      contentHash: await hashCanonical(json),
      job: null,
    };
    expect(readRecoveryMetadata(metadata)).toEqual(metadata);
    for (const change of [
      { revision: 0 },
      { expiresAt: 1001 },
      { bytes: RECOVERY_LIMITS.entryBytes + 1 },
      { id: recoveryId(`sha256:${'b'.repeat(64)}`, raw.requestHash) },
      { schemaVersion: 'future' },
    ])
      expect(() => readRecoveryMetadata({ ...metadata, ...change })).toThrow(
        'RECOVERY_RECORD_INVALID'
      );
  });
});
