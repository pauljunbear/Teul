import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  canonicalIntakeJson,
  type IntakeJobSnapshot,
  type IntakeProfile,
} from '../../../../services/guideline-intake/src/protocol';
import {
  GuidelineIntakeClient,
  intakeRequestHash,
  prepareIntakeSubmission,
  type IntakeFetch,
} from './intakeClient';
import { readCaptureJob, type PendingCapture } from './captureJob';

const hash = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalIntakeJson(value)).digest('hex')}`;
async function fixture() {
  const profile: IntakeProfile = {
    id: 'capture-test',
    version: '1',
    kind: 'website',
    operation: 'capture',
    destination: 'Synthetic local capture',
    consentPolicyVersion: '1',
    maximumAttemptCostMicros: 0,
    maximumJobCostMicros: 0,
  };
  const prepared = await prepareIntakeSubmission(
    {
      kind: 'website',
      profileId: profile.id,
      profileVersion: profile.version,
      binding: { workspaceId: 'w1', sourceRevision: hash('source') },
      captureHash: hash('capture'),
      scope: ['main'],
      parserVersion: '1',
      payload: { selected: 'evidence' },
    },
    profile
  );
  const item: PendingCapture = {
    prepared,
    profile,
    requestHash: await intakeRequestHash(prepared, profile),
    ownerBinding: hash('owner'),
    job: null,
  };
  const value = { evidence: 'original result' };
  const job: IntakeJobSnapshot = {
    id: 'd6d586dd-6f93-45ae-9203-72156cdb82c5',
    status: 'complete',
    binding: prepared.binding,
    captureHash: prepared.captureHash,
    profileId: profile.id,
    profileVersion: profile.version,
    createdAt: 1000,
    updatedAt: 1001,
    expiresAt: 2000,
    deadlineAt: null,
    errorCode: null,
    budgetMicros: 0,
    outputHash: hash(value),
  };
  return { item, job, value };
}
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

it('recovers an unknown capture by hash only and never resubmits', async () => {
  const { item, job, value } = await fixture();
  const fetcher = vi.fn<IntakeFetch>(async path =>
    response(path.endsWith('/lookup') ? { job } : { job, value })
  );
  const changed = vi.fn();
  expect(
    await readCaptureJob(
      new GuidelineIntakeClient(fetcher),
      item,
      new AbortController().signal,
      changed,
      'recover'
    )
  ).toEqual({ job, value });
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
    '/api/guideline-intake/jobs/lookup',
    `/api/guideline-intake/jobs/${job.id}/result`,
  ]);
  expect(changed).toHaveBeenCalledWith({ ...item, job });
  for (const [, init] of fetcher.mock.calls)
    expect(new Headers(init.headers).get('X-Teul-Owner-Binding')).toBe(item.ownerBinding);
});

it('missing recovery stays missing without upload, dispatch or publication', async () => {
  const { item } = await fixture();
  const fetcher = vi.fn<IntakeFetch>(async () => response({ job: null }));
  const changed = vi.fn();
  await expect(
    readCaptureJob(
      new GuidelineIntakeClient(fetcher),
      item,
      new AbortController().signal,
      changed,
      'recover'
    )
  ).rejects.toThrow('JOB_NOT_FOUND');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/guideline-intake/jobs/lookup');
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual({
    requestHash: item.requestHash,
  });
  expect(changed).not.toHaveBeenCalled();
});

it('refreshes a known job before using its status and aborts late publication', async () => {
  const { item, job, value } = await fixture();
  const fetcher = vi.fn<IntakeFetch>(async path =>
    response(path.endsWith('/result') ? { job, value } : { job })
  );
  await readCaptureJob(
    new GuidelineIntakeClient(fetcher),
    { ...item, job: { ...job, status: 'failed', outputHash: null } },
    new AbortController().signal,
    () => {},
    'recover'
  );
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
    `/api/guideline-intake/jobs/${job.id}`,
    `/api/guideline-intake/jobs/${job.id}/result`,
  ]);
  const abort = new AbortController();
  const late = new GuidelineIntakeClient(async () => {
    abort.abort();
    return response({ job });
  });
  const changed = vi.fn();
  await expect(readCaptureJob(late, item, abort.signal, changed, 'recover')).rejects.toThrow(
    'REQUEST_ABORTED'
  );
  expect(changed).not.toHaveBeenCalled();
});

it('only the explicit submit action uploads the envelope', async () => {
  const { item, job, value } = await fixture();
  const fetcher = vi.fn<IntakeFetch>(async path =>
    response(path.endsWith('/result') ? { job, value } : { job, reused: false })
  );
  await readCaptureJob(
    new GuidelineIntakeClient(fetcher),
    item,
    new AbortController().signal,
    () => {},
    'submit'
  );
  expect(fetcher.mock.calls[0][0]).toBe('/api/guideline-intake/jobs');
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual(item.prepared);
  expect(fetcher.mock.calls.filter(([path]) => path === '/api/guideline-intake/jobs')).toHaveLength(
    1
  );
});
