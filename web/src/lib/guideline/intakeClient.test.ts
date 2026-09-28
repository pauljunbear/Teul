import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  INTAKE_LIMITS,
  INTAKE_VERSION,
  canonicalIntakeJson,
  type IntakeJobSnapshot,
  type IntakeProfile,
  type IntakeResult,
} from '../../../../services/guideline-intake/src/protocol.ts';
import {
  GuidelineIntakeClient,
  IntakeResultGuard,
  prepareIntakeSubmission,
  intakeRequestHash,
  intakeJobGone,
  type IntakeExpectedJob,
  type IntakeFetch,
  type IntakeSubmissionEvidence,
} from './intakeClient';

const hash = (input: unknown) =>
  `sha256:${createHash('sha256').update(canonicalIntakeJson(input)).digest('hex')}`;
const profile: IntakeProfile = {
  id: 'synthetic-public-pages',
  version: '1',
  kind: 'pdf',
  operation: 'interpret',
  destination: 'Local synthetic processor',
  consentPolicyVersion: '1',
  maximumAttemptCostMicros: 100,
  maximumJobCostMicros: 200,
};
const expected: IntakeExpectedJob = {
  binding: { workspaceId: 'workspace.one', sourceRevision: hash('revision:one') },
  captureHash: hash('capture:one'),
  profileId: profile.id,
  profileVersion: profile.version,
};
const source = () => ({ binding: { ...expected.binding }, captureHash: expected.captureHash });
const id = 'd6d586dd-6f93-45ae-9203-72156cdb82c5';
function job(overrides: Partial<IntakeJobSnapshot> = {}): IntakeJobSnapshot {
  return {
    id,
    status: 'queued',
    ...expected,
    binding: { ...expected.binding },
    createdAt: 1000,
    updatedAt: 1000,
    expiresAt: 2000,
    deadlineAt: null,
    errorCode: null,
    budgetMicros: 200,
    outputHash: null,
    ...overrides,
  };
}
function result(): IntakeResult {
  const value = {
    schemaVersion: 'synthetic-interpretation.v1',
    observations: [{ text: 'Blue #123456' }],
  };
  return { job: job({ status: 'needs-review', outputHash: hash(value) }), value };
}
function evidence(): IntakeSubmissionEvidence {
  return {
    ...expected,
    binding: { ...expected.binding },
    kind: 'pdf',
    scope: ['page:1'],
    parserVersion: 'pdf.1',
    payload: { text: 'Exact original source' },
  };
}
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function mockClient(...responses: Response[]) {
  const fetcher = vi.fn<IntakeFetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('Unexpected extra request');
    return next;
  });
  return { fetcher, client: new GuidelineIntakeClient(fetcher) };
}
const clone = <T>(input: T): T => JSON.parse(JSON.stringify(input));

describe('bounded guideline intake browser client', () => {
  it('keeps recovery pending on older hosts without lookup while recognizing deleted jobs', async () => {
    const { client } = mockClient(
      response({ error: { code: 'NOT_FOUND' } }, 404),
      response({ error: { code: 'JOB_DELETED' } }, 409)
    );
    try {
      await client.lookup(hash('request'), expected);
      expect.fail('old-host lookup should fail');
    } catch (error) {
      expect(error).toHaveProperty('code', 'RECOVERY_UNAVAILABLE');
      expect(intakeJobGone(error)).toBe(false);
    }
    try {
      await client.lookup(hash('request'), expected);
      expect.fail('deleted lookup should fail');
    } catch (error) {
      expect(intakeJobGone(error)).toBe(true);
    }
  });
  it('hashes the exact original profile/envelope and rejects mismatched or altered consent', async () => {
    const input = await prepareIntakeSubmission(evidence(), profile);
    const expectedHash = hash({ input, profile });
    const pending = intakeRequestHash(input, profile);
    expect(await pending).toBe(expectedHash);
    await expect(intakeRequestHash(input, { ...profile, version: '2' })).rejects.toThrow(
      'CONSENT_OR_PROFILE_CHANGED'
    );
    await expect(intakeRequestHash({ ...input, payload: {} }, profile)).rejects.toThrow(
      'CONSENT_OR_PROFILE_CHANGED'
    );
  });

  it('binds every job request to a session owner and only looks up existing identity', async () => {
    const ownerBinding = hash('opaque-owner-binding');
    const ready = result();
    const { client, fetcher } = mockClient(
      response({ ownerBinding }),
      response({ job: null }),
      response({ job: job() }),
      response({ job: job(), reused: true }),
      response({ job: job() }),
      response(ready),
      response({ job: job({ status: 'cancelled' }) }),
      response({ job: job() }),
      response({ deleted: true })
    );
    expect(await client.session()).toEqual({ ownerBinding });
    const bound = client.forOwner(ownerBinding);
    const input = await prepareIntakeSubmission(evidence(), profile);
    const requestHash = await intakeRequestHash(input, profile);
    expect(await bound.lookup(requestHash, expected)).toBe(null);
    expect(await bound.lookup(requestHash, expected)).toEqual(job());
    await bound.submit(input);
    await bound.get(id, expected);
    await bound.result(id, expected);
    await bound.cancel(id, expected);
    await bound.retry(id, expected);
    await bound.delete(id);
    for (const [, init] of fetcher.mock.calls.slice(1))
      expect(new Headers(init.headers).get('X-Teul-Owner-Binding')).toBe(ownerBinding);
    expect(fetcher.mock.calls[1][0]).toBe('/api/guideline-intake/jobs/lookup');
    expect(JSON.parse(fetcher.mock.calls[1][1].body as string)).toEqual({ requestHash });
    expect(() => bound.forOwner(hash('other-owner'))).toThrow('OWNER_CHANGED');
    expect(() => client.forOwner('alice@example.test')).toThrow('INVALID_DIGEST');
  });

  it('rejects forged recovery snapshots, malformed identity, and changed account without submitting', async () => {
    const ownerBinding = hash('owner');
    const { client, fetcher } = mockClient(
      response({ ownerBinding: hash('other') }),
      response({ job: job({ binding: { ...expected.binding, workspaceId: 'other' } }) }),
      response({ error: { code: 'OWNER_CHANGED' } }, 409)
    );
    await expect(client.forOwner(ownerBinding).session()).rejects.toThrow('OWNER_CHANGED');
    await expect(client.lookup(hash('request'), expected)).rejects.toThrow(
      'RESULT_BINDING_CHANGED'
    );
    await expect(client.lookup('invalid', expected)).rejects.toThrow('INVALID_DIGEST');
    await expect(client.forOwner(ownerBinding).lookup(hash('request'), expected)).rejects.toThrow(
      'OWNER_CHANGED'
    );
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      '/api/guideline-intake/session',
      '/api/guideline-intake/jobs/lookup',
      '/api/guideline-intake/jobs/lookup',
    ]);
  });

  it('treats failed lookup as a read failure and honors abort without a submission', async () => {
    const fetcher = vi.fn<IntakeFetch>(async () => {
      throw new Error('offline');
    });
    const client = new GuidelineIntakeClient(fetcher);
    await expect(client.lookup(hash('request'), expected)).rejects.toThrow('NETWORK_UNAVAILABLE');
    const abort = new AbortController();
    abort.abort();
    await expect(client.lookup(hash('request'), expected, abort.signal)).rejects.toThrow(
      'REQUEST_ABORTED'
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/guideline-intake/jobs/lookup');
  });

  it('prepares detached exact-payload consent with the same canonical SHA-256 as the service, without uploading', async () => {
    const input = evidence();
    const before = clone(input);
    const selected = { ...profile };
    const pending = prepareIntakeSubmission(input, selected);
    input.payload = { text: 'Replaced after preparation began' };
    input.binding.workspaceId = 'workspace.other';
    selected.destination = 'Different provider';
    const prepared = await pending;
    expect(prepared).toEqual({
      ...before,
      schemaVersion: INTAKE_VERSION,
      consent: {
        destination: profile.destination,
        policyVersion: profile.consentPolicyVersion,
        evidenceHash: hash(before.payload),
      },
    });
  });

  it('uses only explicit same-origin methods and validates every returned binding', async () => {
    const ready = result();
    const { client, fetcher } = mockClient(
      response({ profiles: [profile] }),
      response({ job: job(), reused: false }, 202),
      response({ job: job() }),
      response(ready),
      response({ job: job({ status: 'cancelled' }) }),
      response({ job: job() }, 202),
      response({ deleted: true })
    );
    expect(await client.profiles()).toEqual([profile]);
    expect(await client.submit(await prepareIntakeSubmission(evidence(), profile))).toEqual({
      job: job(),
      reused: false,
    });
    expect(await client.get(id, expected)).toEqual(job());
    expect(await client.result(id, expected)).toEqual(ready);
    expect((await client.cancel(id, expected)).status).toBe('cancelled');
    expect((await client.retry(id, expected)).status).toBe('queued');
    await client.delete(id);
    expect(fetcher.mock.calls.map(([path, init]) => [path, init.method])).toEqual([
      ['/api/guideline-intake/profiles', 'GET'],
      ['/api/guideline-intake/jobs', 'POST'],
      [`/api/guideline-intake/jobs/${id}`, 'GET'],
      [`/api/guideline-intake/jobs/${id}/result`, 'GET'],
      [`/api/guideline-intake/jobs/${id}/cancel`, 'POST'],
      [`/api/guideline-intake/jobs/${id}/retry`, 'POST'],
      [`/api/guideline-intake/jobs/${id}`, 'DELETE'],
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({
        credentials: 'same-origin',
        mode: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
      });
      expect(new Headers(init.headers).has('Authorization')).toBe(false);
      expect(new Headers(init.headers).has('Cookie')).toBe(false);
    }
  });

  it('never submits changed evidence and detaches the submitted body before asynchronous crypto', async () => {
    const input = clone(await prepareIntakeSubmission(evidence(), profile));
    const { client, fetcher } = mockClient(response({ job: job(), reused: false }, 202));
    const exact = clone(input);
    const pending = client.submit(input);
    input.payload = { changed: true };
    input.consent.destination = 'Wrong destination';
    input.binding.sourceRevision = hash('other');
    await pending;
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toEqual(exact);
    await expect(client.submit({ ...exact, payload: { changed: true } })).rejects.toMatchObject({
      code: 'CONSENT_OR_PROFILE_CHANGED',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reports authentication failure without retry and rejects unstructured errors', async () => {
    const { client, fetcher } = mockClient(
      response({ error: { code: 'UNAUTHENTICATED' } }, 401),
      response({ error: { code: 'Provider error with sensitive source text' } }, 500)
    );
    await expect(client.profiles()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(client.profiles()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reports unknown mutation outcome without automatically retrying or polling', async () => {
    const fetcher = vi.fn<IntakeFetch>(async () => {
      throw new Error('Connection closed after server may have accepted');
    });
    const client = new GuidelineIntakeClient(fetcher);
    await expect(
      client.submit(await prepareIntakeSubmission(evidence(), profile))
    ).rejects.toMatchObject({ code: 'REQUEST_OUTCOME_UNKNOWN' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('bounds an unresponsive request and cleans the deadline after an ordinary response', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<IntakeFetch>(
        async (_input, init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
              once: true,
            });
          })
      );
      const pending = new GuidelineIntakeClient(fetcher).profiles();
      const rejected = expect(pending).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
      await vi.advanceTimersByTimeAsync(30_000);
      await rejected;
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      const { client } = mockClient(response({ profiles: [] }));
      await client.profiles();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects oversized declared and streamed bodies and cancels the reader', async () => {
    const declaredCancel = vi.fn();
    const declared = new Response(new ReadableStream({ cancel: declaredCancel }), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(INTAKE_LIMITS.resultBytes * 2),
      },
    });
    const streamCancel = vi.fn();
    const streamed = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(65_537));
        },
        cancel: streamCancel,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    const { client } = mockClient(declared, streamed);
    await expect(client.result(id, expected)).rejects.toMatchObject({ code: 'RESPONSE_LIMIT' });
    await expect(client.profiles()).rejects.toMatchObject({ code: 'RESPONSE_LIMIT' });
    expect(declaredCancel).toHaveBeenCalledTimes(1);
    expect(streamCancel).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown envelopes, unknown statuses, invalid metadata, and unknown submission schemas', async () => {
    const { client, fetcher } = mockClient(
      response({ profiles: [], schemaVersion: 'future' }),
      response({ job: { ...job(), status: 'future-status' } }),
      response({ job: { ...job(), status: ['queued'] } }),
      response({ job: job({ updatedAt: 999 }) }),
      response({ job: job({ status: 'complete' }) })
    );
    await expect(client.profiles()).rejects.toMatchObject({ code: 'INVALID_FIELDS' });
    await expect(client.get(id, expected)).rejects.toMatchObject({ code: 'INVALID_JOB_STATUS' });
    await expect(client.get(id, expected)).rejects.toMatchObject({ code: 'INVALID_JOB_STATUS' });
    await expect(client.get(id, expected)).rejects.toMatchObject({ code: 'INVALID_JOB_METADATA' });
    await expect(client.get(id, expected)).rejects.toMatchObject({ code: 'INVALID_JOB_METADATA' });
    const input = await prepareIntakeSubmission(evidence(), profile);
    await expect(
      client.submit({ ...input, schemaVersion: 'future' } as never)
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_INTAKE' });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it.each([
    { binding: { ...expected.binding, workspaceId: 'workspace.other' } },
    { binding: { ...expected.binding, sourceRevision: hash('different-revision') } },
    { captureHash: hash('different-capture') },
    { profileVersion: 'other' },
    { profileId: 'other' },
    { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' },
  ])('rejects result from a mismatched source, profile, or job: %j', async overrides => {
    const ready = result();
    const { client } = mockClient(response({ ...ready, job: { ...ready.job, ...overrides } }));
    await expect(client.result(id, expected)).rejects.toMatchObject({
      code: 'RESULT_BINDING_CHANGED',
    });
  });

  it('verifies the full output value against outputHash before delivery', async () => {
    const ready = result();
    const { client } = mockClient(
      response(ready),
      response({ ...ready, value: { changed: true } })
    );
    expect(await client.result(id, expected)).toEqual(ready);
    await expect(client.result(id, expected)).rejects.toMatchObject({ code: 'RESULT_CHANGED' });
  });

  it('aborts before fetch or during streaming and removes the stream listener', async () => {
    const signal = new AbortController();
    signal.abort();
    const { client, fetcher } = mockClient();
    await expect(client.get(id, expected, signal.signal)).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
    });
    expect(fetcher).not.toHaveBeenCalled();
    const streamingSignal = new AbortController();
    const removed = vi.spyOn(streamingSignal.signal, 'removeEventListener');
    let entered!: () => void;
    const started = new Promise<void>(resolve => {
      entered = resolve;
    });
    const cancelled = vi.fn();
    const streamingClient = new GuidelineIntakeClient(
      async () =>
        new Response(
          new ReadableStream({
            pull() {
              entered();
            },
            cancel: cancelled,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
    );
    const pending = streamingClient.result(id, expected, streamingSignal.signal);
    await started;
    streamingSignal.abort();
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('guideline intake result guard', () => {
  it('invalidates a late result when a newer request has the exact same capture', () => {
    const guard = new IntakeResultGuard(source());
    const old = guard.begin();
    const current = guard.begin();
    expect(old.signal.aborted).toBe(true);
    expect(() => old.accept(result())).toThrow('STALE_RESULT');
    expect(current.accept(result())).toEqual(result());
    old.dispose();
    expect(current.accept(result())).toEqual(result());
    current.dispose();
    expect(() => current.accept(result())).toThrow('STALE_RESULT');
  });

  it.each(['workspaceId', 'sourceRevision'] as const)(
    'rejects late completion after the current %s changes',
    field => {
      const guard = new IntakeResultGuard(source());
      const old = guard.begin();
      const changed = source();
      changed.binding[field] =
        field === 'workspaceId' ? 'workspace.other' : hash('different-revision');
      guard.setSource(changed);
      changed.binding[field] = expected.binding[field];
      expect(() => old.accept(result())).toThrow('STALE_RESULT');
      const current = guard.begin();
      expect(() => current.accept(result())).toThrow('RESULT_BINDING_CHANGED');
      guard.dispose();
    }
  );

  it('preserves an unchanged source and cleans external abort listeners when superseded or disposed', () => {
    const guard = new IntakeResultGuard(source());
    const external = new AbortController();
    const removed = vi.spyOn(external.signal, 'removeEventListener');
    const request = guard.begin(external.signal);
    guard.setSource(source());
    expect(request.accept(result())).toEqual(result());
    external.abort();
    expect(() => request.accept(result())).toThrow('REQUEST_ABORTED');
    guard.begin();
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
    guard.dispose();
  });
});
