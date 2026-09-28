import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createIntakeHttpServer } from './http.js';
import { IntakeService, intakeHash } from './service.js';
import { IntakeJobStore } from './store.js';
import { SealedAssetStore } from './assets.js';
import { INTAKE_VERSION } from './protocol.js';

test('HTTP authenticates ownership, validates origin and consent, redacts failures and returns only bounded reviewed output', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'teul-intake-http-')));
  const store = new IntakeJobStore(join(directory, 'jobs.sqlite'), { now: Date.now });
  const assets = new SealedAssetStore({
    directory: join(directory, 'assets'),
    key: new Uint8Array(32).fill(1),
  });
  const profile = {
    id: 'local-test',
    version: '1',
    kind: 'pdf' as const,
    operation: 'interpret' as const,
    destination: 'Synthetic local processor',
    consentPolicyVersion: '1',
    maximumAttemptCostMicros: 0,
    maximumJobCostMicros: 0,
  };
  const service = new IntakeService({
    store,
    assets,
    ownerKey: new Uint8Array(32).fill(2),
    processors: [
      {
        profile,
        validateInput: () => {},
        validateOutput: () => {},
        execute: async () => ({ value: { labels: [] }, actualCostMicros: 0 }),
      },
    ],
  });
  const server = createIntakeHttpServer({
    api: service,
    allowedOrigins: ['https://studio.example.test'],
    authenticate: async request =>
      request.headers.authorization === 'Bearer alice'
        ? 'alice'
        : request.headers.authorization === 'Bearer bob'
          ? 'bob'
          : null,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api/guideline-intake`;
  const headers = {
    Authorization: 'Bearer alice',
    Origin: 'https://studio.example.test',
    'Content-Type': 'application/json',
  };
  const hash = `sha256:${'a'.repeat(64)}`;
  const payload = { text: 'Private source data' };
  const input = {
    schemaVersion: INTAKE_VERSION,
    profileId: profile.id,
    profileVersion: '1',
    kind: 'pdf',
    binding: { workspaceId: 'w1', sourceRevision: hash },
    captureHash: hash,
    scope: ['page:1'],
    parserVersion: '1',
    payload,
    consent: {
      destination: profile.destination,
      policyVersion: '1',
      evidenceHash: intakeHash(payload),
    },
  };
  try {
    assert.equal((await fetch(`${base}/profiles`)).status, 401);
    assert.equal((await fetch(`${base}/session`)).status, 401);
    const sessionResponse = await fetch(`${base}/session`, { headers });
    assert.equal(sessionResponse.headers.get('cache-control'), 'no-store');
    const { ownerBinding } = (await sessionResponse.json()) as { ownerBinding: string };
    assert.match(ownerBinding, /^sha256:[a-f0-9]{64}$/);
    const lookup = { requestHash: intakeHash({ input, profile }) };
    assert.deepEqual(
      await (
        await fetch(`${base}/jobs/lookup`, {
          method: 'POST',
          headers,
          body: JSON.stringify(lookup),
        })
      ).json(),
      { job: null }
    );
    const wrongOwner = {
      ...headers,
      Authorization: 'Bearer bob',
      'X-Teul-Owner-Binding': ownerBinding,
    };
    const blockedSubmit = await fetch(`${base}/jobs`, {
      method: 'POST',
      headers: wrongOwner,
      body: JSON.stringify(input),
    });
    assert.equal(blockedSubmit.status, 409);
    assert.deepEqual(await blockedSubmit.json(), { error: { code: 'OWNER_CHANGED' } });
    assert.equal(service.lookup('bob', lookup), null);
    assert.equal(
      (
        await fetch(`${base}/jobs/lookup`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...lookup, payload: 'private' }),
        })
      ).status,
      400
    );
    assert.equal(
      (
        await fetch(`${base}/jobs/lookup`, {
          method: 'POST',
          headers,
          body: ' '.repeat(1024) + JSON.stringify(lookup),
        })
      ).status,
      413
    );
    assert.equal(
      (
        await fetch(`${base}/jobs`, {
          method: 'POST',
          headers: { ...headers, Origin: 'https://attacker.test' },
          body: JSON.stringify(input),
        })
      ).status,
      403
    );
    assert.equal(
      (
        await fetch(`${base}/jobs`, {
          method: 'POST',
          headers: { Authorization: 'Bearer alice', 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
      ).status,
      403
    );
    const forged = await fetch(`${base}/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...input, ownerId: 'bob' }),
    });
    assert.equal(forged.status, 400);
    const malformed = await fetch(`${base}/jobs`, {
      method: 'POST',
      headers,
      body: '{"payload":"RAW PRIVATE SECRET"',
    });
    assert.equal(malformed.status, 400);
    assert.doesNotMatch(await malformed.text(), /PRIVATE|SECRET/);
    const response = await fetch(`${base}/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    assert.equal(response.status, 202);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const submitted = (await response.json()) as { job: { id: string } };
    const id = submitted.job.id;
    const boundHeaders = { ...headers, 'X-Teul-Owner-Binding': ownerBinding };
    const recovered = await fetch(`${base}/jobs/lookup`, {
      method: 'POST',
      headers: boundHeaders,
      body: JSON.stringify(lookup),
    });
    assert.equal(recovered.status, 200);
    assert.equal(((await recovered.json()) as { job: { id: string } }).job.id, id);
    for (const [path, method] of [
      ['/session', 'GET'],
      ['/jobs/lookup', 'POST'],
      [`/jobs/${id}`, 'GET'],
      [`/jobs/${id}/result`, 'GET'],
      [`/jobs/${id}/cancel`, 'POST'],
      [`/jobs/${id}/retry`, 'POST'],
      [`/jobs/${id}`, 'DELETE'],
    ]) {
      const denied = await fetch(`${base}${path}`, {
        method,
        headers: wrongOwner,
        ...(path === '/jobs/lookup' ? { body: JSON.stringify(lookup) } : {}),
      });
      assert.equal(denied.status, 409, path);
      assert.deepEqual(await denied.json(), { error: { code: 'OWNER_CHANGED' } });
    }
    assert.equal(service.get('alice', id).status, 'queued');
    assert.equal(
      (await fetch(`${base}/jobs/${id}`, { headers: { ...headers, Authorization: 'Bearer bob' } }))
        .status,
      404
    );
    assert.equal((await fetch(`${base}/jobs/${id}/result`, { headers })).status, 409);
    await service.runQueued();
    await service.idle();
    const completed = await fetch(`${base}/jobs/${id}/result`, { headers });
    assert.equal(completed.status, 200);
    const result = (await completed.json()) as {
      job: { status: string; binding: unknown };
      value: unknown;
    };
    assert.equal(result.job.status, 'needs-review');
    assert.deepEqual(result.job.binding, input.binding);
    assert.deepEqual(result.value, { labels: [] });
    assert.equal(
      (
        await fetch(`${base}/jobs/${id}`, {
          method: 'DELETE',
          headers: { ...headers, Authorization: 'Bearer bob' },
        })
      ).status,
      404
    );
    assert.equal((await fetch(`${base}/jobs/${id}`, { method: 'DELETE', headers })).status, 200);
    assert.equal((await fetch(`${base}/jobs/${id}`, { headers })).status, 404);
  } finally {
    await service.stop();
    server.close();
    server.closeAllConnections();
    await once(server, 'close');
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
