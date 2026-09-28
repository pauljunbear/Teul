/** Child-only synthetic crash drill. No credentials, providers, sockets, or production listeners. */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { open, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { SealedAssetStore } from './assets.js';
import { IntakeJobStore } from './store.js';
import { IntakeService, intakeHash, type IntakeProcessor } from './service.js';
import { INTAKE_VERSION, type IntakeSubmission } from './protocol.js';

const [, , directory, phase, clock, recoveryJobId] = process.argv;
assert.ok(process.send && directory && ['dispatch', 'recover'].includes(phase));
const now = Number(clock);
assert.ok(Number.isSafeInteger(now));
// Public, synthetic test constants deliberately shared by both independent processes.
const ownerKey = new Uint8Array(32).fill(2);
const assetKey = new Uint8Array(32).fill(4);
const userId = 'restart-owner@example.test';
const owner = createHmac('sha256', ownerKey).update(userId).digest('hex');
const otherOwner = createHmac('sha256', ownerKey).update('other-owner@example.test').digest('hex');
const profile = {
  id: 'synthetic-restart',
  version: '1',
  kind: 'pdf' as const,
  operation: 'interpret' as const,
  destination: 'Synthetic local crash drill',
  consentPolicyVersion: '1',
  maximumAttemptCostMicros: 150_000,
  maximumJobCostMicros: 300_000,
};
const payload = { text: 'Synthetic restart evidence. This is not a real brand source.' };
const input: IntakeSubmission = {
  schemaVersion: INTAKE_VERSION,
  profileId: profile.id,
  profileVersion: profile.version,
  kind: 'pdf',
  binding: { workspaceId: 'restart-workspace', sourceRevision: intakeHash('source-revision') },
  captureHash: intakeHash('capture'),
  scope: ['page:1'],
  parserVersion: 'synthetic-1',
  payload,
  consent: {
    destination: profile.destination,
    policyVersion: profile.consentPolicyVersion,
    evidenceHash: intakeHash(payload),
  },
};
const store = new IntakeJobStore(join(directory, 'jobs.sqlite'), { now: () => now });
const assets = new SealedAssetStore({ directory: join(directory, 'assets'), key: assetKey });
let jobId = recoveryJobId;
let invocations = 0;
function send(message: unknown): Promise<void> {
  return new Promise((resolve, reject) =>
    process.send!(message, error => (error ? reject(error) : resolve()))
  );
}
const execute: IntakeProcessor['execute'] = async (_submission, context) => {
  invocations++;
  const durable = store.get(owner, jobId);
  assert.equal(durable.currentAttemptId, context.attemptId);
  assert.equal(durable.status, 'interpreting');
  assert.equal(durable.attempts[0].status, 'dispatched');
  assert.equal(durable.committedMicros, profile.maximumAttemptCostMicros);
  // Represents the provider invocation after reservation. fsync before IPC prevents a timing-only proof.
  const marker = await open(join(directory, 'invocations.jsonl'), 'a', 0o600);
  try {
    await marker.writeFile(
      `${JSON.stringify({ jobId, attemptId: context.attemptId, pid: process.pid })}\n`
    );
    await marker.sync();
  } finally {
    await marker.close();
  }
  await send({
    type: 'dispatched',
    jobId,
    attemptId: context.attemptId,
    reservedMicros: durable.committedMicros,
  });
  if (phase === 'dispatch') return new Promise(() => {});
  // Recovery must never reach this branch; return promptly so the parent observes an assertion failure.
  return { value: { unexpectedRedispatch: true }, actualCostMicros: 1 };
};
const service = new IntakeService({
  store,
  assets,
  ownerKey,
  now: () => now,
  processors: [{ profile, execute, validateInput: () => {}, validateOutput: () => {} }],
});

async function main() {
  if (phase === 'dispatch') {
    // Keep this process alive while the synthetic processor never resolves. The parent owns SIGKILL.
    process.on('message', () => {});
    jobId = (await service.submit(userId, input)).job.id;
    await service.runQueued();
    return;
  }
  try {
    const before = store.get(owner, jobId);
    assert.equal(before.status, 'interpreting');
    assert.equal(before.attempts.length, 1);
    assert.equal(before.attempts[0].status, 'dispatched');
    assert.equal(before.attempts[0].actualCostMicros, null);
    assert.equal(before.committedMicros, profile.maximumAttemptCostMicros);
    // An independently constructed sealed store must recover and authenticate the original bytes.
    assert.deepEqual(
      JSON.parse(Buffer.from(await assets.read(owner, jobId, 'input')).toString('utf8')),
      input
    );
    await assert.rejects(assets.read(otherOwner, jobId, 'input'), /missing/);
    assert.equal(service.recoverStoppedWorker(), 1);
    assert.equal(service.recoverStoppedWorker(), 0);
    const recovered = store.get(owner, jobId);
    assert.equal(recovered.status, 'failed');
    assert.equal(recovered.failureCode, 'WORKER_RESTART_UNKNOWN');
    assert.equal(recovered.attempts[0].status, 'unknown');
    assert.equal(recovered.attempts[0].reservedMicros, profile.maximumAttemptCostMicros);
    assert.equal(recovered.attempts[0].actualCostMicros, null);
    assert.equal(recovered.committedMicros, profile.maximumAttemptCostMicros);
    assert.equal(recovered.retryCount, 0);
    assert.throws(() => service.retry(userId, jobId), /RETRY_NOT_ALLOWED/);
    await assert.rejects(service.result(userId, jobId), /RESULT_NOT_READY/);
    assert.throws(() => service.get('other-owner@example.test', jobId), /NOT_FOUND/);
    assert.throws(() => service.retry('other-owner@example.test', jobId), /NOT_FOUND/);
    await assert.rejects(service.result('other-owner@example.test', jobId), /NOT_FOUND/);
    await assert.rejects(service.cancel('other-owner@example.test', jobId), /NOT_FOUND/);
    await assert.rejects(service.remove('other-owner@example.test', jobId), /NOT_FOUND/);
    const duplicate = await service.submit(userId, input);
    assert.equal(duplicate.reused, true);
    assert.equal(duplicate.job.id, jobId);
    assert.equal(duplicate.job.status, 'failed');
    await service.runQueued();
    await service.idle();
    await service.maintain();
    await service.runQueued();
    await service.idle();
    assert.equal(invocations, 0);
    assert.equal(store.get(owner, jobId).attempts.length, 1);
    const markers = (await readFile(join(directory, 'invocations.jsonl'), 'utf8'))
      .trim()
      .split('\n');
    assert.equal(markers.length, 1);
    assert.equal(JSON.parse(markers[0]).attemptId, before.currentAttemptId);
    assert.ok(
      (await readdir(join(directory, 'assets'))).some(name => name.endsWith('-input.sealed'))
    );
    await service.remove(userId, jobId);
    assert.throws(() => service.get(userId, jobId), /NOT_FOUND/);
    await assert.rejects(service.result(userId, jobId), /NOT_FOUND/);
    await assert.rejects(assets.read(owner, jobId, 'input'), /missing/);
    assert.deepEqual(await readdir(join(directory, 'assets')), []);
    assert.deepEqual(store.pendingCleanup(), []);
    await assert.rejects(service.submit(userId, input), /JOB_DELETED/);
    assert.deepEqual(await readdir(join(directory, 'assets')), []);
    await send({
      type: 'recovered',
      jobId,
      attemptId: before.currentAttemptId,
      committedMicros: recovered.committedMicros,
      invocations,
      assetsDeleted: true,
    });
  } finally {
    await service.stop();
    store.close();
    process.disconnect();
  }
}

void main().catch(error => {
  // Fixture assertions contain synthetic values only. Exit forcibly if an intentionally hung processor exists.
  console.error(error);
  process.exit(1);
});
