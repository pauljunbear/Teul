import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import {
  INTAKE_JOB_LIMITS,
  IntakeJobStore,
  jobAssetRefs,
  StoreError,
  type JobSpec,
} from './store.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const OWNER = hash('owner-a');
const OTHER = hash('owner-b');
const START = Date.UTC(2026, 8, 25, 12);

function spec(sequence = 0, overrides: Partial<JobSpec> = {}): JobSpec {
  return {
    kind: 'pdf',
    workspaceId: 'workspace-a',
    sourceRevision: 'revision-1',
    captureHash: hash('selected-evidence'),
    requestHash: hash(`request-${sequence}`),
    parserVersion: 'pdf-1',
    processorVersion: 'model-prompt-1',
    processor: 'test-processor',
    budgetMicros: 500_000,
    ...overrides,
  };
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'teul-intake-store-'));
  const path = join(dir, 'jobs.sqlite');
  let now = START;
  const stores: IntakeJobStore[] = [];
  const open = () => {
    const store = new IntakeJobStore(path, { now: () => now });
    stores.push(store);
    return store;
  };
  const store = open();
  return {
    store,
    path,
    open,
    advance: (ms: number) => {
      now += ms;
    },
    cleanup: () => {
      for (const connection of stores) connection.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function code(expected: string): (error: unknown) => boolean {
  return error => error instanceof StoreError && error.code === expected;
}

test('request hash recovery is bounded, fail-closed and preserves expired/deleted identities', t => {
  const f = fixture();
  t.after(f.cleanup);
  assert.equal(f.store.lookupRequest(OWNER, spec().requestHash), null);
  const { job } = f.store.create(OWNER, spec());
  assert.equal(f.store.lookupRequest(OTHER, spec().requestHash), null);
  assert.equal(f.open().lookupRequest(OWNER, spec().requestHash)?.id, job.id);
  assert.throws(() => f.store.lookupRequest('bad-owner', spec().requestHash), code('INVALID_HASH'));
  f.advance(INTAKE_JOB_LIMITS.assetRetentionMs + 1);
  assert.equal(f.store.lookupRequest(OWNER, spec().requestHash)?.status, 'expired');
  f.store.delete(OWNER, job.id);
  assert.throws(() => f.store.lookupRequest(OWNER, spec().requestHash), code('JOB_DELETED'));
  f.advance(INTAKE_JOB_LIMITS.metadataRetentionMs + 1);
  assert.equal(f.store.lookupRequest(OWNER, spec().requestHash), null);
  f.store.create(OWNER, spec());
  f.store.create(OWNER, spec(0, { workspaceId: 'different' }));
  assert.throws(() => f.store.lookupRequest(OWNER, spec().requestHash), code('AMBIGUOUS_REQUEST'));
});

test('owner-scoped dedup binds source, workspace, request and processing version; raw extra fields are dropped', t => {
  const f = fixture();
  t.after(f.cleanup);
  const id = randomUUID();
  const first = f.store.create(
    OWNER,
    { ...spec(), raw: 'PRIVATE SOURCE NAME https://private.example/token' } as JobSpec,
    { id }
  );
  assert.equal(first.job.id, id);
  assert.equal(first.reused, false);
  const duplicate = f.store.create(OWNER, spec(), { id: randomUUID() });
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.job.id, id);
  for (const change of [
    { sourceRevision: 'revision-2' },
    { workspaceId: 'workspace-b' },
    { processorVersion: 'model-prompt-2' },
    { parserVersion: 'pdf-2' },
    { captureHash: hash('new-capture') },
  ]) {
    assert.notEqual(f.store.create(OWNER, spec(0, change)).job.id, id);
  }
  assert.notEqual(f.store.create(OTHER, spec()).job.id, id);
  assert.throws(() => f.store.create(OWNER, spec(5), { id }), code('JOB_ID_CONFLICT'));
  assert.equal(JSON.stringify(first.job).includes('PRIVATE SOURCE'), false);
  for (const suffix of ['', '-wal'])
    assert.equal(readFileSync(f.path + suffix).includes(Buffer.from('PRIVATE SOURCE')), false);
});

test('every job/result/cancel/delete/retry and cost operation checks the authenticated owner', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const started = f.store.claim(OWNER, job.id, { reservationMicros: 200_000 });
  assert.ok(started);
  const calls = [
    () => f.store.get(OTHER, job.id),
    () => f.store.result(OTHER, job.id),
    () => f.store.claim(OTHER, job.id, { reservationMicros: 1 }),
    () => f.store.markInterpreting(OTHER, job.id, started.attempt.id),
    () =>
      f.store.complete(OTHER, job.id, started.attempt.id, {
        outputHash: hash('output'),
        actualCostMicros: 0,
      }),
    () => f.store.fail(OTHER, job.id, started.attempt.id, { code: 'FAILURE', outcome: 'unknown' }),
    () => f.store.retry(OTHER, job.id, { reservationMicros: 100_000 }),
    () => f.store.cancel(OTHER, job.id),
    () => f.store.delete(OTHER, job.id),
    () => f.store.settleCost(OTHER, job.id, started.attempt.id, 0),
  ];
  for (const call of calls) assert.throws(call, code('NOT_FOUND'));
  assert.equal(f.store.get(OWNER, job.id).status, 'capturing');
  assert.equal(f.store.get(OWNER, job.id).committedMicros, 200_000);
  assert.throws(() => f.store.get(OWNER, '../not-an-id'), code('NOT_FOUND'));
});

test('lookup shares normalized create identity, isolates owners and changed specs, and preserves terminal states and tombstones', t => {
  const f = fixture();
  t.after(f.cleanup);
  assert.equal(f.store.lookup(OWNER, spec()), null);
  const job = f.store.create(OWNER, spec()).job;
  assert.deepEqual(f.store.lookup(OWNER, { ...spec(), ignored: 'not persisted' } as JobSpec), job);
  assert.equal(f.store.lookup(OTHER, spec()), null);
  assert.throws(() => f.store.lookup('invalid-owner', spec()), code('INVALID_HASH'));
  for (const change of [
    { kind: 'figma' as const },
    { workspaceId: 'workspace-b' },
    { sourceRevision: 'revision-2' },
    { captureHash: hash('new-capture') },
    { requestHash: hash('new-request') },
    { parserVersion: 'pdf-2' },
    { processorVersion: 'model-prompt-2' },
    { processor: 'other-processor' },
    { budgetMicros: 250_000 },
  ]) {
    assert.equal(f.store.lookup(OWNER, spec(0, change)), null);
  }
  const other = f.store.create(OTHER, spec()).job;
  assert.equal(f.store.lookup(OTHER, spec())?.id, other.id);
  const attempt = f.store.claim(OWNER, job.id, { reservationMicros: 100_000 });
  assert.ok(attempt);
  f.store.fail(OWNER, job.id, attempt.attempt.id, {
    code: 'FINAL_FAILURE',
    outcome: 'confirmed-final',
    actualCostMicros: 50_000,
  });
  assert.equal(f.store.lookup(OWNER, spec())?.status, 'failed');
  f.advance(INTAKE_JOB_LIMITS.assetRetentionMs);
  assert.equal(f.store.lookup(OWNER, spec())?.status, 'expired');
  assert.equal(f.store.create(OWNER, spec()).job.status, 'expired');
  f.store.delete(OWNER, job.id);
  assert.throws(() => f.store.lookup(OWNER, spec()), code('JOB_DELETED'));
  assert.throws(() => f.store.create(OWNER, spec()), code('JOB_DELETED'));
  assert.equal(f.store.lookup(OTHER, spec())?.id, other.id);
});

test('queue, active and daily limits are owner scoped and deletion cannot reset quota', t => {
  const f = fixture();
  t.after(f.cleanup);
  const jobs = [0, 1].map(i => f.store.create(OWNER, spec(i)).job);
  for (const job of jobs) assert.ok(f.store.claim(OWNER, job.id, { reservationMicros: 100 }));
  for (let i = 2; i < 12; i++) jobs.push(f.store.create(OWNER, spec(i)).job);
  assert.throws(() => f.store.create(OWNER, spec(12)), code('QUEUE_FULL'));
  assert.equal(f.store.claim(OWNER, jobs[2].id, { reservationMicros: 100 }), null);
  assert.equal(f.store.listQueued(3).length, 0);
  for (const job of jobs) f.store.delete(OWNER, job.id);
  assert.throws(() => f.store.create(OWNER, spec()), code('JOB_DELETED'));
  for (let i = 12; i < 20; i++) f.store.delete(OWNER, f.store.create(OWNER, spec(i)).job.id);
  assert.throws(() => f.store.create(OWNER, spec(20)), code('DAILY_QUOTA'));
  assert.ok(f.store.create(OTHER, spec(20)));
  f.advance(86_400_000);
  assert.ok(f.store.create(OWNER, spec(20)));
});

test('two database connections never duplicate an attempt or its reservation', t => {
  const f = fixture();
  t.after(f.cleanup);
  const second = f.open();
  const job = f.store.create(OWNER, spec()).job;
  assert.ok(f.store.claim(OWNER, job.id, { reservationMicros: 200_000 }));
  assert.equal(second.claim(OWNER, job.id, { reservationMicros: 200_000 }), null);
  const current = second.get(OWNER, job.id);
  assert.equal(current.attempts.length, 1);
  assert.equal(current.committedMicros, 200_000);
});

test('queue listing skips saturated owners and returns only the available slots per owner', t => {
  const f = fixture();
  t.after(f.cleanup);
  const busy = [0, 1].map(i => f.store.create(OWNER, spec(i)).job);
  for (const job of busy) assert.ok(f.store.claim(OWNER, job.id, { reservationMicros: 100 }));
  for (let i = 2; i < 6; i++) f.store.create(OWNER, spec(i));
  const other = [0, 1, 2].map(i => f.store.create(OTHER, spec(i)).job);
  const eligible = f.store.listQueued(2);
  assert.equal(eligible.length, 2);
  assert.ok(eligible.every(job => job.ownerKey === OTHER));
  assert.ok(f.store.claim(OTHER, eligible[0].id, { reservationMicros: 100 }));
  assert.deepEqual(
    f.store.listQueued().map(job => job.id),
    [eligible[1].id]
  );
  f.store.cancel(OWNER, busy[0].id);
  const afterSlotOpens = f.store.listQueued();
  assert.equal(afterSlotOpens.filter(job => job.ownerKey === OWNER).length, 1);
  assert.equal(afterSlotOpens.filter(job => job.ownerKey === OTHER).length, 1);
  assert.equal(other.length, 3);
});

test('polling with no due maintenance remains read-only while another connection holds the write lock', t => {
  const f = fixture();
  t.after(f.cleanup);
  const complete = f.store.create(OWNER, spec()).job;
  const attempt = f.store.claim(OWNER, complete.id, { reservationMicros: 100 });
  assert.ok(attempt);
  f.store.complete(OWNER, complete.id, attempt.attempt.id, {
    outputHash: hash('result'),
    actualCostMicros: 50,
  });
  const queued = f.store.create(OWNER, spec(1)).job;
  const blocker = new DatabaseSync(f.path);
  try {
    blocker.exec('BEGIN IMMEDIATE');
    assert.deepEqual(
      f.store.listQueued().map(job => job.id),
      [queued.id]
    );
    assert.equal(f.store.get(OWNER, complete.id).status, 'complete');
    assert.equal(f.store.lookup(OWNER, spec())?.id, complete.id);
    assert.equal(f.store.lookup(OTHER, spec()), null);
    assert.equal(f.store.result(OWNER, complete.id)?.outputHash, hash('result'));
    assert.deepEqual(f.store.maintenance(), []);
  } finally {
    blocker.exec('ROLLBACK');
    blocker.close();
  }
  f.advance(INTAKE_JOB_LIMITS.assetRetentionMs);
  assert.equal(f.store.result(OWNER, complete.id), null);
  assert.equal(f.store.get(OWNER, queued.id).status, 'expired');
  assert.equal(f.store.pendingCleanup().length, 2);
});

test('simultaneous worker claims serialize the active limit and duplicate reservation', async t => {
  const f = fixture();
  t.after(f.cleanup);
  const jobs = [0, 1, 2].map(i => f.store.create(OWNER, spec(i)).job.id);
  const shared = new SharedArrayBuffer(4);
  const barrier = new Int32Array(shared);
  const source = `
    const { workerData, parentPort } = require('node:worker_threads');
    import(workerData.module).then(({IntakeJobStore}) => {
      const store = new IntakeJobStore(workerData.path, {now: () => workerData.now});
      parentPort.postMessage('ready');
      Atomics.wait(new Int32Array(workerData.shared), 0, 0);
      try {
        const claimed = store.claim(workerData.owner, workerData.job, {reservationMicros: 100000});
        parentPort.postMessage({accepted: claimed !== null});
      } catch (error) { parentPort.postMessage({error: error.message}); }
      store.close();
    });`;
  const workers = [jobs[0], jobs[0], jobs[1], jobs[2]].map(
    job =>
      new Worker(source, {
        eval: true,
        workerData: {
          module: new URL('./store.js', import.meta.url).href,
          path: f.path,
          owner: OWNER,
          job,
          now: START,
          shared,
        },
      })
  );
  t.after(async () => {
    await Promise.all(workers.map(worker => worker.terminate()));
  });
  const completions: Array<Promise<{ accepted: boolean; error?: string }>> = [];
  await Promise.all(
    workers.map(
      worker =>
        new Promise<void>((resolve, reject) => {
          worker.once('error', reject);
          worker.once('message', ready => {
            assert.equal(ready, 'ready');
            completions.push(
              new Promise((done, failure) => {
                worker.once('message', done);
                worker.once('error', failure);
              })
            );
            resolve();
          });
        })
    )
  );
  Atomics.store(barrier, 0, 1);
  Atomics.notify(barrier, 0);
  const results = await Promise.all(completions);
  assert.equal(
    results.some(result => result.error),
    false
  );
  assert.equal(results.filter(result => result.accepted).length, 2);
  const records = jobs.map(id => f.store.get(OWNER, id));
  assert.equal(
    records.reduce((n, job) => n + job.attempts.length, 0),
    2
  );
  assert.equal(
    records.reduce((n, job) => n + job.committedMicros, 0),
    200_000
  );
});

test('one explicit confirmed retry shares the original ceiling and deadline', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const first = f.store.claim(OWNER, job.id, { reservationMicros: 300_000 });
  assert.ok(first);
  f.advance(10_000);
  f.store.fail(OWNER, job.id, first.attempt.id, {
    code: 'RATE_LIMITED',
    outcome: 'confirmed-retryable',
    actualCostMicros: 100_000,
  });
  assert.equal(f.store.retry(OWNER, job.id, { reservationMicros: 400_000 }).retryCount, 1);
  assert.throws(
    () => f.store.claim(OWNER, job.id, { reservationMicros: 400_001 }),
    code('BUDGET_EXHAUSTED')
  );
  const second = f.store.claim(OWNER, job.id, { reservationMicros: 400_000 });
  assert.ok(second);
  assert.equal(second.job.deadlineAt, START + 120_000);
  assert.equal(second.job.committedMicros, 500_000);
  f.store.fail(OWNER, job.id, second.attempt.id, {
    code: 'RATE_LIMITED',
    outcome: 'confirmed-retryable',
    actualCostMicros: 20_000,
  });
  assert.throws(
    () => f.store.retry(OWNER, job.id, { reservationMicros: 400_000 }),
    code('RETRY_LIMIT')
  );
  assert.equal(f.store.get(OWNER, job.id).committedMicros, 120_000);
});

test('an unaffordable retry preserves the failed job and retry allowance until an affordable reservation is supplied', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const first = f.store.claim(OWNER, job.id, { reservationMicros: 300_000 });
  assert.ok(first);
  f.store.fail(OWNER, job.id, first.attempt.id, {
    code: 'RATE_LIMITED',
    outcome: 'confirmed-retryable',
    actualCostMicros: 250_000,
  });
  const before = f.store.get(OWNER, job.id);
  assert.throws(
    () => f.store.retry(OWNER, job.id, { reservationMicros: 300_000 }),
    code('BUDGET_EXHAUSTED')
  );
  assert.deepEqual(f.store.get(OWNER, job.id), before);
  assert.equal(before.status, 'failed');
  assert.equal(before.retryCount, 0);
  assert.equal(before.committedMicros, 250_000);
  assert.equal(before.attempts.length, 1);
  assert.equal(f.store.listQueued().length, 0);
  for (const reservationMicros of [-1, 0.5, 500_001]) {
    assert.throws(() => f.store.retry(OWNER, job.id, { reservationMicros }), code('INVALID_COST'));
  }
  const retried = f.store.retry(OWNER, job.id, { reservationMicros: 250_000 });
  assert.equal(retried.status, 'queued');
  assert.equal(retried.retryCount, 1);
  assert.equal(retried.committedMicros, 250_000);
  assert.equal(f.store.listQueued().length, 1);
  const second = f.store.claim(OWNER, job.id, { reservationMicros: 250_000 });
  assert.ok(second);
  assert.equal(second.job.committedMicros, 500_000);
  assert.equal(second.job.attempts.length, 2);
});

test('unknown provider outcome retains its reservation and cannot be retried even after cost reconciliation', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const attempt = f.store.claim(OWNER, job.id, { reservationMicros: 500_000 });
  assert.ok(attempt);
  f.store.fail(OWNER, job.id, attempt.attempt.id, { code: 'CONNECTION_LOST', outcome: 'unknown' });
  assert.equal(f.store.get(OWNER, job.id).committedMicros, 500_000);
  assert.throws(
    () => f.store.retry(OWNER, job.id, { reservationMicros: 400_000 }),
    code('RETRY_NOT_ALLOWED')
  );
  f.store.settleCost(OWNER, job.id, attempt.attempt.id, 0);
  assert.throws(
    () => f.store.retry(OWNER, job.id, { reservationMicros: 400_000 }),
    code('RETRY_NOT_ALLOWED')
  );
  assert.equal(
    f.store.complete(OWNER, job.id, attempt.attempt.id, {
      outputHash: hash('late'),
      actualCostMicros: 0,
    }).accepted,
    false
  );
  assert.equal(f.store.result(OWNER, job.id), null);
});

test('confirmed failure with unknown cost cannot free its original reservation', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const attempt = f.store.claim(OWNER, job.id, { reservationMicros: 500_000 });
  assert.ok(attempt);
  f.store.fail(OWNER, job.id, attempt.attempt.id, {
    code: 'RATE_LIMITED',
    outcome: 'confirmed-retryable',
  });
  assert.throws(
    () => f.store.retry(OWNER, job.id, { reservationMicros: 400_000 }),
    code('BUDGET_EXHAUSTED')
  );
  f.store.settleCost(OWNER, job.id, attempt.attempt.id, 0);
  assert.equal(f.store.retry(OWNER, job.id, { reservationMicros: 400_000 }).status, 'queued');
});

test('reopening a database does not assume another worker stopped; explicit recovery marks running attempts unknown', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const attempt = f.store.claim(OWNER, job.id, { reservationMicros: 320_000 });
  assert.ok(attempt);
  const queued = f.store.create(OWNER, spec(1)).job;
  const reopened = f.open();
  assert.equal(reopened.get(OWNER, job.id).status, 'capturing');
  assert.equal(reopened.recoverDispatched(), 1);
  const recovered = f.store.get(OWNER, job.id);
  assert.equal(recovered.status, 'failed');
  assert.equal(recovered.failureCode, 'WORKER_RESTART_UNKNOWN');
  assert.equal(recovered.attempts[0].status, 'unknown');
  assert.equal(recovered.committedMicros, 320_000);
  assert.throws(
    () => reopened.retry(OWNER, job.id, { reservationMicros: 400_000 }),
    code('RETRY_NOT_ALLOWED')
  );
  assert.equal(reopened.get(OWNER, queued.id).status, 'queued');
  assert.equal(reopened.recoverDispatched(), 0);
});

test('completion is single-assignment, tied to the current attempt and source revision', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const first = f.store.claim(OWNER, job.id, { reservationMicros: 100_000 });
  assert.ok(first);
  f.store.fail(OWNER, job.id, first.attempt.id, {
    code: 'RETRYABLE',
    outcome: 'confirmed-retryable',
    actualCostMicros: 0,
  });
  f.store.retry(OWNER, job.id, { reservationMicros: 100_000 });
  const second = f.store.claim(OWNER, job.id, { reservationMicros: 100_000 });
  assert.ok(second);
  assert.equal(
    f.store.complete(OWNER, job.id, first.attempt.id, {
      outputHash: hash('old'),
      actualCostMicros: 0,
    }).accepted,
    false
  );
  assert.equal(f.store.markInterpreting(OWNER, job.id, second.attempt.id), true);
  const accepted = f.store.complete(OWNER, job.id, second.attempt.id, {
    outputHash: hash('accepted'),
    actualCostMicros: 80_000,
    needsReview: true,
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.job.status, 'needs-review');
  assert.equal(accepted.job.sourceRevision, 'revision-1');
  assert.equal(
    f.store.complete(OWNER, job.id, second.attempt.id, {
      outputHash: hash('different'),
      actualCostMicros: 80_000,
    }).accepted,
    false
  );
  assert.equal(f.store.cancel(OWNER, job.id).changed, false);
  assert.equal(f.store.result(OWNER, job.id)?.outputHash, hash('accepted'));
  assert.throws(
    () => f.store.settleCost(OWNER, job.id, second.attempt.id, 0),
    code('COST_ALREADY_SETTLED')
  );
});

test('cancellation/deletion invalidates access before physical cleanup; late cost settles without publishing', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const attempt = f.store.claim(OWNER, job.id, { reservationMicros: 300_000 });
  assert.ok(attempt);
  assert.equal(f.store.cancel(OWNER, job.id).changed, true);
  assert.equal(f.store.get(OWNER, job.id).inputRef, null);
  assert.equal(f.store.pendingCleanup().length, 1);
  f.store.acknowledgeCleanup(job.id);
  assert.equal(f.store.pendingCleanup().length, 0);
  const late = f.store.complete(OWNER, job.id, attempt.attempt.id, {
    outputHash: hash('late'),
    actualCostMicros: 100_000,
  });
  assert.equal(late.accepted, false);
  assert.equal(late.job.status, 'cancelled');
  assert.equal(late.job.committedMicros, 100_000);
  assert.equal(f.store.pendingCleanup().length, 1);
  const cleanup = f.store.delete(OWNER, job.id);
  assert.deepEqual(cleanup.refs, Object.values(jobAssetRefs(job.id)));
  assert.equal(cleanup.deadlineAt - cleanup.requestedAt, 15 * 60_000);
  assert.throws(() => f.store.get(OWNER, job.id), code('NOT_FOUND'));
  assert.throws(() => f.store.result(OWNER, job.id), code('NOT_FOUND'));
  assert.equal(
    f.store.settleCost(OWNER, job.id, attempt.attempt.id, 100_000).job.committedMicros,
    100_000
  );
  assert.throws(() => f.store.create(OWNER, spec()), code('JOB_DELETED'));
});

test('120-second total execution deadline rejects late results and includes time between retries', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const attempt = f.store.claim(OWNER, job.id, { reservationMicros: 100_000 });
  assert.ok(attempt);
  f.advance(120_000);
  const late = f.store.complete(OWNER, job.id, attempt.attempt.id, {
    outputHash: hash('late'),
    actualCostMicros: 10_000,
  });
  assert.equal(late.accepted, false);
  assert.equal(late.job.failureCode, 'EXECUTION_TIMEOUT_UNKNOWN');
  assert.equal(late.job.attempts[0].status, 'unknown');
  const retryJob = f.store.create(OWNER, spec(1)).job;
  const first = f.store.claim(OWNER, retryJob.id, { reservationMicros: 100_000 });
  assert.ok(first);
  f.store.fail(OWNER, retryJob.id, first.attempt.id, {
    code: 'RETRYABLE',
    outcome: 'confirmed-retryable',
    actualCostMicros: 0,
  });
  f.store.retry(OWNER, retryJob.id, { reservationMicros: 100_000 });
  f.advance(120_000);
  assert.equal(f.store.claim(OWNER, retryJob.id, { reservationMicros: 100_000 }), null);
  assert.equal(f.store.get(OWNER, retryJob.id).failureCode, 'EXECUTION_TIMEOUT');
  assert.equal(f.store.get(OWNER, retryJob.id).attempts.length, 1);
});

test('all assets expire at 24 hours and operational job metadata retires at 30 days', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const attempt = f.store.claim(OWNER, job.id, { reservationMicros: 100 });
  assert.ok(attempt);
  f.store.complete(OWNER, job.id, attempt.attempt.id, {
    outputHash: hash('result'),
    actualCostMicros: 50,
  });
  f.advance(INTAKE_JOB_LIMITS.assetRetentionMs - 1);
  assert.ok(f.store.result(OWNER, job.id));
  f.advance(1);
  assert.equal(f.store.result(OWNER, job.id), null);
  assert.equal(f.store.get(OWNER, job.id).status, 'expired');
  assert.equal(f.store.get(OWNER, job.id).inputRef, null);
  assert.equal(f.store.get(OWNER, job.id).resultRef, null);
  assert.equal(f.store.pendingCleanup().length, 1);
  f.store.acknowledgeCleanup(job.id);
  f.advance(INTAKE_JOB_LIMITS.metadataRetentionMs - INTAKE_JOB_LIMITS.assetRetentionMs);
  f.store.maintenance();
  assert.throws(() => f.store.get(OWNER, job.id), code('NOT_FOUND'));
  assert.equal(f.store.pendingCleanup().length, 0);
});

test('actual cost overrun creates a durable incident and disables that processor across owners', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const waiting = f.store.create(OTHER, spec(1)).job;
  const attempt = f.store.claim(OWNER, job.id, { reservationMicros: 100_000 });
  assert.ok(attempt);
  const result = f.store.complete(OWNER, job.id, attempt.attempt.id, {
    outputHash: hash('unsafe-result'),
    actualCostMicros: 100_001,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.job.failureCode, 'COST_OVERRUN');
  assert.equal(f.store.result(OWNER, job.id), null);
  assert.equal(f.store.providerState('test-processor').disabled, true);
  assert.throws(() => f.store.create(OTHER, spec(2)), code('PROVIDER_DISABLED'));
  assert.throws(
    () => f.store.claim(OTHER, waiting.id, { reservationMicros: 100 }),
    code('PROVIDER_DISABLED')
  );
  f.store.settleCost(OWNER, job.id, attempt.attempt.id, 100_001);
  assert.equal(f.store.incidents().length, 1);
  const reopened = f.open();
  assert.equal(reopened.providerState('test-processor').disabled, true);
  assert.equal(reopened.incidents().length, 1);
  assert.ok(f.store.create(OTHER, spec(3, { processor: 'other-processor' })));
  reopened.enableProvider('test-processor');
  assert.ok(f.store.claim(OTHER, waiting.id, { reservationMicros: 100 }));
});

test('cleanup records retain the first deletion deadline and do not retain owner metadata indefinitely', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const first = f.store.delete(OWNER, job.id);
  f.advance(20 * 60_000);
  const repeated = f.store.delete(OWNER, job.id);
  assert.equal(repeated.requestedAt, first.requestedAt);
  assert.equal(repeated.deadlineAt, first.deadlineAt);
  f.advance(INTAKE_JOB_LIMITS.metadataRetentionMs);
  f.store.maintenance();
  assert.equal(f.store.pendingCleanup().length, 0);
  assert.throws(() => f.store.get(OWNER, job.id), code('NOT_FOUND'));
});

test('targeted host cleanup returns only the requested job without enumerating unrelated owners', t => {
  const f = fixture();
  t.after(f.cleanup);
  const own = f.store.create(OWNER, spec()).job;
  const other = f.store.create(OTHER, spec()).job;
  f.store.delete(OWNER, own.id);
  f.store.delete(OTHER, other.id);
  assert.equal(f.store.pendingCleanup().length, 2);
  assert.deepEqual(
    f.store.pendingCleanup(own.id).map(item => [item.jobId, item.ownerKey]),
    [[own.id, OWNER]]
  );
  assert.deepEqual(f.store.pendingCleanup(randomUUID()), []);
  assert.throws(() => f.store.pendingCleanup('../invalid'), code('NOT_FOUND'));
  f.store.acknowledgeCleanup(own.id);
  assert.deepEqual(f.store.pendingCleanup(own.id), []);
  assert.deepEqual(
    f.store.pendingCleanup().map(item => item.jobId),
    [other.id]
  );
});

test('a late overrun after cancellation still disables the provider without changing the cancelled state', t => {
  const f = fixture();
  t.after(f.cleanup);
  const job = f.store.create(OWNER, spec()).job;
  const attempt = f.store.claim(OWNER, job.id, { reservationMicros: 10 });
  assert.ok(attempt);
  f.store.cancel(OWNER, job.id);
  const settlement = f.store.settleCost(OWNER, job.id, attempt.attempt.id, 20);
  assert.equal(settlement.overrun, true);
  assert.equal(settlement.job.status, 'cancelled');
  assert.equal(f.store.providerState('test-processor').disabled, true);
});

test('strict numeric and identifier boundaries reject invalid or unbounded reservations without creating attempts', t => {
  const f = fixture();
  t.after(f.cleanup);
  for (const amount of [-1, 0.1, NaN, Infinity, 500_001])
    assert.throws(
      () => f.store.create(OWNER, spec(0, { budgetMicros: amount })),
      code('INVALID_COST')
    );
  assert.throws(() => f.store.create('not-a-pseudonym', spec()), code('INVALID_HASH'));
  assert.throws(
    () => f.store.create(OWNER, spec(0, { workspaceId: 'https://private.example/key' })),
    code('INVALID_IDENTIFIER')
  );
  const job = f.store.create(OWNER, spec()).job;
  assert.throws(
    () => f.store.claim(OWNER, job.id, { reservationMicros: 500_001 }),
    code('INVALID_COST')
  );
  assert.equal(f.store.get(OWNER, job.id).attempts.length, 0);
  assert.throws(() => f.store.listQueued(1_001), code('INVALID_LIMIT'));
});
