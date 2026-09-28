import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, realpath, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SealedAssetStore } from './assets.js';
import { IntakeJobStore } from './store.js';
import {
  IntakeService,
  ProcessorFailure,
  intakeHash,
  intakeOwnerKey,
  type IntakeProcessor,
  type IntakeEvent,
} from './service.js';
import {
  INTAKE_VERSION,
  INTAKE_LIMITS,
  IntakeError,
  type IntakeProfile,
  type IntakeSubmission,
  type JsonValue,
} from './protocol.js';

const source = `sha256:${'a'.repeat(64)}`;
const profile = {
  id: 'synthetic',
  version: '1',
  kind: 'pdf' as const,
  operation: 'interpret' as const,
  destination: 'Local synthetic processor',
  consentPolicyVersion: '1',
  maximumAttemptCostMicros: 150000,
  maximumJobCostMicros: 300000,
};
function submission(
  payload: JsonValue = { text: 'PRIVATE_SOURCE_DO_NOT_LOG_519736' }
): IntakeSubmission {
  return {
    schemaVersion: INTAKE_VERSION,
    profileId: profile.id,
    profileVersion: profile.version,
    kind: 'pdf',
    binding: { workspaceId: 'workspace-1', sourceRevision: source },
    captureHash: source,
    scope: ['page:1'],
    parserVersion: 'native-1',
    payload,
    consent: {
      destination: profile.destination,
      policyVersion: '1',
      evidenceHash: intakeHash(payload),
    },
  };
}
async function setup(
  execute: IntakeProcessor['execute'],
  validateOutput: IntakeProcessor['validateOutput'] = () => {},
  selectedProfile: IntakeProfile = profile,
  maximumTotalBytes?: number
) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'teul-intake-service-')));
  let now = Date.now();
  const store = new IntakeJobStore(join(directory, 'jobs.sqlite'), { now: () => now });
  const assets = new SealedAssetStore({
    directory: join(directory, 'assets'),
    key: new Uint8Array(32).fill(4),
    maximumTotalBytes,
  });
  const events: IntakeEvent[] = [];
  const service = new IntakeService({
    store,
    assets,
    ownerKey: new Uint8Array(32).fill(2),
    now: () => now,
    processors: [{ profile: selectedProfile, execute, validateInput: () => {}, validateOutput }],
    onEvent: event => events.push(event),
  });
  return {
    directory,
    store,
    assets,
    service,
    events,
    advance: (ms: number) => {
      now += ms;
    },
    close: async () => {
      await service.stop();
      store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('a full queue is a rate-limit error and does not dispatch or retain extra evidence', async () => {
  let dispatched = 0;
  const env = await setup(async () => {
    dispatched++;
    return { value: {}, actualCostMicros: 0 };
  });
  try {
    for (let index = 0; index < 10; index++)
      await env.service.submit('alice', submission({ index }));
    const before = await readdir(join(env.directory, 'assets'));
    await assert.rejects(
      env.service.submit('alice', submission({ index: 10 })),
      error =>
        error instanceof IntakeError && error.code === 'QUEUE_FULL' && error.httpStatus === 429
    );
    assert.equal(dispatched, 0);
    assert.deepEqual(await readdir(join(env.directory, 'assets')), before);
  } finally {
    await env.close();
  }
});

test('scheduled maintenance finishes before stop resolves and no second tick overtakes it', async () => {
  const env = await setup(async () => ({ value: {}, actualCostMicros: 0 }));
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => {
    entered = resolve;
  });
  const finish = new Promise<void>(resolve => {
    release = resolve;
  });
  let sweeps = 0;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const original = env.assets.sweepBefore.bind(env.assets);
  env.assets.sweepBefore = async before => {
    sweeps++;
    entered();
    await finish;
    return original(before);
  };
  try {
    env.service.start();
    await Promise.race([
      waiting,
      new Promise<never>((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('Maintenance did not start')), 5000);
      }),
    ]);
    clearTimeout(watchdog);
    let stopped = false;
    const stop = env.service.stop().then(() => {
      stopped = true;
    });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(stopped, false);
    assert.equal(sweeps, 1);
    assert.equal(env.service.isAvailable(), false);
    release();
    await stop;
  } finally {
    clearTimeout(watchdog);
    release();
    await env.close();
  }
});

test('duplicates reuse one owned result and source bytes stay out of metadata and events', async () => {
  let calls = 0;
  const env = await setup(async () => {
    calls++;
    return { value: { labels: ['Color A'] }, actualCostMicros: 100000 };
  });
  try {
    const first = await env.service.submit('alice@example.test', submission());
    const same = await env.service.submit('alice@example.test', submission());
    assert.equal(same.reused, true);
    assert.equal(first.job.id, same.job.id);
    await env.service.runQueued();
    await env.service.idle();
    const result = await env.service.result('alice@example.test', first.job.id);
    assert.equal(result.job.status, 'needs-review');
    assert.equal(result.job.outputHash, intakeHash(result.value));
    assert.equal(
      (await env.service.submit('alice@example.test', submission())).job.id,
      first.job.id
    );
    await env.service.runQueued();
    assert.equal(calls, 1);
    assert.throws(() => env.service.get('bob@example.test', first.job.id), /NOT_FOUND/);
    await assert.rejects(env.service.result('bob@example.test', first.job.id), /NOT_FOUND/);
    assert.notEqual(
      (await env.service.submit('bob@example.test', submission())).job.id,
      first.job.id
    );
    for (const name of await readdir(env.directory)) {
      if (name === 'assets') continue;
      const data = await readFile(join(env.directory, name));
      assert.equal(data.includes(Buffer.from('PRIVATE_SOURCE_DO_NOT_LOG_519736')), false);
      assert.equal(data.includes(Buffer.from('alice@example.test')), false);
    }
    assert.doesNotMatch(JSON.stringify(env.events), /PRIVATE_SOURCE|example.test/);
    const changed = submission();
    (changed.payload as { text: string }).text = 'Changed without consent';
    await assert.rejects(env.service.submit('alice', changed), /CONSENT_OR_PROFILE_CHANGED/);
    await env.service.remove('alice@example.test', first.job.id);
    await assert.rejects(env.service.result('alice@example.test', first.job.id), /NOT_FOUND/);
    await assert.rejects(env.service.submit('alice@example.test', submission()), /JOB_DELETED/);
  } finally {
    await env.close();
  }
});

test('hash-only recovery is owner-bound and never creates, reserves or dispatches work', async () => {
  let calls = 0;
  const env = await setup(async () => {
    calls++;
    return { value: { recovered: true }, actualCostMicros: 100000 };
  });
  try {
    const input = submission();
    const lookup = { requestHash: intakeHash({ input, profile }) };
    const session = env.service.session('alice');
    assert.match(session.ownerBinding, /^sha256:[a-f0-9]{64}$/);
    assert.equal(session.ownerBinding, env.service.session('alice').ownerBinding);
    assert.notEqual(session.ownerBinding, env.service.session('bob').ownerBinding);
    assert.notEqual(
      session.ownerBinding.slice(7),
      intakeOwnerKey(new Uint8Array(32).fill(2), 'alice')
    );
    assert.throws(() => env.service.session(''), /UNAUTHENTICATED/);
    assert.equal(env.service.lookup('alice', lookup), null);
    assert.equal(calls, 0);
    assert.equal(env.events.length, 0);
    const { job } = await env.service.submit('alice', input);
    const before = env.store.get(intakeOwnerKey(new Uint8Array(32).fill(2), 'alice'), job.id);
    for (let i = 0; i < 3; i++) assert.deepEqual(env.service.lookup('alice', lookup), job);
    assert.equal(env.service.lookup('bob', lookup), null);
    assert.deepEqual(env.store.get(before.ownerKey, job.id), before);
    assert.equal(env.events.length, 1);
    assert.equal(calls, 0);
    assert.throws(
      () => env.service.lookup('alice', { ...lookup, payload: input.payload }),
      /INVALID_FIELDS/
    );
    assert.throws(() => env.service.lookup('alice', { requestHash: 'wrong' }), /INVALID_DIGEST/);
    await env.service.runQueued();
    await env.service.idle();
    await env.service.stop();
    // A restarted service need not have the original provider configured to return old results.
    const reopened = new IntakeJobStore(join(env.directory, 'jobs.sqlite'), { now: Date.now });
    const reader = new IntakeService({
      store: reopened,
      assets: env.assets,
      ownerKey: new Uint8Array(32).fill(2),
      processors: [],
    });
    try {
      assert.deepEqual(reader.session('alice'), session);
      assert.equal(reader.profiles('alice').length, 0);
      assert.equal(reader.lookup('alice', lookup)?.status, 'needs-review');
      assert.deepEqual((await reader.result('alice', job.id)).value, { recovered: true });
      assert.equal(calls, 1);
      await reader.remove('alice', job.id);
      assert.throws(() => reader.lookup('alice', lookup), /JOB_DELETED/);
      assert.equal(reader.lookup('bob', lookup), null);
    } finally {
      await reader.stop();
      reopened.close();
    }
  } finally {
    await env.close();
  }
});

test('cancellation wins a late processor response while its actual cost is retained', async () => {
  let finish!: (value: { value: JsonValue; actualCostMicros: number }) => void;
  let aborted = false;
  const env = await setup(
    (_input, context) =>
      new Promise(resolve => {
        finish = resolve;
        context.signal.addEventListener('abort', () => {
          aborted = true;
        });
      })
  );
  try {
    const { job } = await env.service.submit('alice', submission());
    await env.service.runQueued();
    const start = performance.now();
    assert.equal((await env.service.cancel('alice', job.id)).status, 'cancelled');
    assert.ok(performance.now() - start < 250);
    assert.equal(aborted, true);
    finish({ value: { ignored: true }, actualCostMicros: 120000 });
    await env.service.idle();
    assert.equal(env.service.get('alice', job.id).status, 'cancelled');
    await assert.rejects(env.service.result('alice', job.id), /RESULT_NOT_READY/);
    assert.deepEqual(await readdir(join(env.directory, 'assets')), []);
  } finally {
    await env.close();
  }
});

test('unknown failures never retry; confirmed retries share the original ceiling', async () => {
  let calls = 0;
  const env = await setup(async () => {
    calls++;
    if (calls === 1) throw new ProcessorFailure('RETRY_LATER', 'confirmed-retryable', 20000);
    return { value: { ok: true }, actualCostMicros: 100000 };
  });
  try {
    const { job } = await env.service.submit('alice', submission());
    await env.service.runQueued();
    await env.service.idle();
    assert.equal(env.service.get('alice', job.id).errorCode, 'RETRY_LATER');
    assert.equal(env.service.retry('alice', job.id).status, 'queued');
    await env.service.runQueued();
    await env.service.idle();
    assert.equal((await env.service.result('alice', job.id)).job.budgetMicros, 300000);
    assert.throws(() => env.service.retry('alice', job.id), /RETRY_LIMIT/);
    assert.equal(calls, 2);
  } finally {
    await env.close();
  }
  const unknown = await setup(async () => {
    throw new Error('PRIVATE token=secret');
  });
  try {
    const { job } = await unknown.service.submit('alice', submission());
    await unknown.service.runQueued();
    await unknown.service.idle();
    assert.equal(unknown.service.get('alice', job.id).errorCode, 'PROCESSOR_OUTCOME_UNKNOWN');
    assert.throws(() => unknown.service.retry('alice', job.id), /RETRY_NOT_ALLOWED/);
    assert.doesNotMatch(JSON.stringify(unknown.events), /PRIVATE|secret/);
  } finally {
    await unknown.close();
  }
});

test('cost overrun disables future dispatch; malformed output never becomes reviewed data', async () => {
  const env = await setup(async () => ({ value: { ok: true }, actualCostMicros: 150001 }));
  try {
    const { job } = await env.service.submit('alice', submission());
    await env.service.runQueued();
    await env.service.idle();
    assert.equal(env.service.get('alice', job.id).errorCode, 'COST_OVERRUN');
    assert.deepEqual(env.service.profiles('alice'), []);
    await assert.rejects(env.service.submit('bob', submission()), /PROCESSOR_DISABLED/);
  } finally {
    await env.close();
  }
  const invalid = await setup(
    async () => ({ value: { unsupported: 'claim' }, actualCostMicros: 1000 }),
    () => {
      throw new Error('private validation detail');
    }
  );
  try {
    const { job } = await invalid.service.submit('alice', submission());
    await invalid.service.runQueued();
    await invalid.service.idle();
    assert.equal(invalid.service.get('alice', job.id).errorCode, 'INVALID_PROCESSOR_OUTPUT');
    await assert.rejects(invalid.service.result('alice', job.id), /RESULT_NOT_READY/);
  } finally {
    await invalid.close();
  }
});

test('expiry deletes source and output assets; disabling an adapter prevents queued dispatch', async () => {
  let calls = 0;
  const env = await setup(async () => {
    calls++;
    return { value: { ok: true }, actualCostMicros: 1000 };
  });
  try {
    const { job } = await env.service.submit('alice', submission());
    await env.service.runQueued();
    await env.service.idle();
    env.advance(24 * 60 * 60 * 1000);
    await env.service.maintain();
    assert.equal(env.service.get('alice', job.id).status, 'expired');
    assert.deepEqual(await readdir(join(env.directory, 'assets')), []);
    const newer = submission({ text: 'new source' });
    const queued = await env.service.submit('alice', newer);
    env.store.disableProvider(profile.id, 'OPERATOR_DISABLED');
    await env.service.runQueued();
    await env.service.idle();
    assert.equal(calls, 1);
    assert.equal(env.service.get('alice', queued.job.id).status, 'cancelled');
  } finally {
    await env.close();
  }
});

test('model and token-bound mismatches quarantine the provider even below its monetary reservation', async () => {
  for (const code of ['PROVIDER_MODEL_CHANGED', 'PROVIDER_BUDGET_OVERRUN']) {
    const changedModel = code === 'PROVIDER_MODEL_CHANGED';
    const env = await setup(async () => {
      throw new ProcessorFailure(
        code,
        changedModel ? 'unknown' : 'confirmed-final',
        changedModel ? undefined : 10
      );
    });
    try {
      const { job } = await env.service.submit('alice', submission());
      await env.service.runQueued();
      await env.service.idle();
      const result = env.service.get('alice', job.id);
      assert.equal(result.errorCode, code);
      assert.equal(
        env.events.filter(event => event.event === 'settled').at(-1)?.committedMicros,
        changedModel ? profile.maximumAttemptCostMicros : 10
      );
      assert.equal(env.store.providerState(profile.id).disabled, true);
      assert.equal(env.service.profiles('bob').length, 0);
      await assert.rejects(env.service.submit('bob', submission()), { code: 'PROCESSOR_DISABLED' });
      await assert.rejects(env.service.result('alice', job.id), { code: 'RESULT_NOT_READY' });
    } finally {
      await env.close();
    }
  }
});

test('shutdown waits for an in-flight input read and prevents later dispatch', async () => {
  let calls = 0;
  const env = await setup(async () => {
    calls++;
    return { value: { ok: true }, actualCostMicros: 1 };
  });
  let release!: () => void, entered!: () => void;
  const barrier = new Promise<void>(resolve => {
    release = resolve;
  });
  const reading = new Promise<void>(resolve => {
    entered = resolve;
  });
  const read = env.assets.read.bind(env.assets);
  env.assets.read = async (...args) => {
    entered();
    await barrier;
    return read(...args);
  };
  try {
    const { job } = await env.service.submit('alice', submission());
    const cycle = env.service.runQueued();
    await reading;
    let stopped = false;
    const stop = env.service.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    assert.equal(stopped, false);
    release();
    await Promise.all([cycle, stop]);
    assert.equal(stopped, true);
    assert.equal(calls, 0);
    assert.equal(env.service.get('alice', job.id).status, 'queued');
    await env.service.runQueued();
    assert.equal(calls, 0);
  } finally {
    release();
    await env.close();
  }
});

test('default asset composition accepts a maximum-size protocol payload and its envelope', async () => {
  const env = await setup(async input => ({
    value: { length: (input.payload as string).length },
    actualCostMicros: 0,
  }));
  try {
    const payload = 'x'.repeat(INTAKE_LIMITS.payloadBytes - 2);
    const { job } = await env.service.submit('alice', submission(payload));
    await env.service.runQueued();
    await env.service.idle();
    assert.deepEqual((await env.service.result('alice', job.id)).value, { length: payload.length });
    await assert.rejects(env.service.submit('alice', submission(payload + 'x')), /PAYLOAD_LIMIT/);
  } finally {
    await env.close();
  }
});

test('retry rejects the unaffordable registered attempt without consuming a retry', async () => {
  let calls = 0;
  const env = await setup(
    async () => {
      calls++;
      throw new ProcessorFailure('RETRY_LATER', 'confirmed-retryable', 250000);
    },
    () => {},
    { ...profile, maximumAttemptCostMicros: 300000, maximumJobCostMicros: 500000 }
  );
  try {
    const { job } = await env.service.submit('alice', submission());
    await env.service.runQueued();
    await env.service.idle();
    const before = env.service.get('alice', job.id);
    assert.throws(() => env.service.retry('alice', job.id), /BUDGET_EXHAUSTED/);
    assert.deepEqual(env.service.get('alice', job.id), before);
    await env.service.runQueued();
    assert.equal(calls, 1);
  } finally {
    await env.close();
  }
});

test('cancellation cleans only its job; maintenance continues past unrelated deletion failures', async () => {
  const env = await setup(async () => ({ value: null, actualCostMicros: 0 }));
  const owner = (user: string) =>
    createHmac('sha256', new Uint8Array(32).fill(2)).update(user).digest('hex');
  const remove = env.assets.deleteJob.bind(env.assets);
  const deletions: string[] = [];
  try {
    const older = await env.service.submit('bob', submission());
    env.store.delete(owner('bob'), older.job.id);
    const target = await env.service.submit('alice', submission());
    env.assets.deleteJob = async (key, id) => {
      deletions.push(id);
      if (id === older.job.id) throw new Error('Synthetic storage failure');
      await remove(key, id);
    };
    assert.equal((await env.service.cancel('alice', target.job.id)).status, 'cancelled');
    assert.deepEqual(deletions, [target.job.id]);
    env.advance(1);
    const another = await env.service.submit('carol', submission());
    env.store.delete(owner('carol'), another.job.id);
    await assert.rejects(env.service.maintain(), /EVIDENCE_CLEANUP_PENDING/);
    assert.deepEqual(deletions, [target.job.id, older.job.id, another.job.id]);
    assert.deepEqual(
      env.store.pendingCleanup().map(item => item.jobId),
      [older.job.id]
    );
    await assert.rejects(env.service.submit('dave', submission()), /INTAKE_UNAVAILABLE/);
    env.assets.deleteJob = remove;
    await env.service.maintain();
    assert.deepEqual(env.store.pendingCleanup(), []);
    assert.equal((await env.service.submit('dave', submission())).job.status, 'queued');
  } finally {
    env.assets.deleteJob = remove;
    await env.close();
  }
});

test('exact resubmission recovers an owned completed job without allocating storage, even after provider disable', async () => {
  let calls = 0;
  const env = await setup(
    async () => {
      calls++;
      return { value: { ok: true }, actualCostMicros: 1 };
    },
    () => {},
    profile,
    2500
  );
  try {
    const input = submission('x'.repeat(1024));
    const first = await env.service.submit('alice', input);
    await env.service.runQueued();
    await env.service.idle();
    const completed = env.service.get('alice', first.job.id);
    const existingFiles = await readdir(join(env.directory, 'assets'));
    await assert.rejects(env.service.submit('bob', input), /INTAKE_UNAVAILABLE/);
    assert.deepEqual(await env.service.submit('alice', input), { job: completed, reused: true });
    env.store.disableProvider(profile.id, 'OPERATOR_DISABLED');
    assert.deepEqual(await env.service.submit('alice', input), { job: completed, reused: true });
    assert.deepEqual((await env.service.result('alice', first.job.id)).value, { ok: true });
    assert.deepEqual(await readdir(join(env.directory, 'assets')), existingFiles);
    assert.equal(calls, 1);
  } finally {
    await env.close();
  }
});

test('validation cannot rewrite a result, and later validator references cannot alter committed output identity', async () => {
  const env = await setup(
    async () => ({ value: { n: 1 }, actualCostMicros: 0 }),
    value => {
      (value as { n: number }).n = 2;
    }
  );
  try {
    const { job } = await env.service.submit('alice', submission());
    await env.service.runQueued();
    await env.service.idle();
    assert.equal(env.service.get('alice', job.id).errorCode, 'INVALID_PROCESSOR_OUTPUT');
  } finally {
    await env.close();
  }
  const late = await setup(
    async () => ({ value: { n: 1 }, actualCostMicros: 0 }),
    value => {
      queueMicrotask(() => {
        (value as { n: number }).n = 2;
      });
    }
  );
  try {
    const { job } = await late.service.submit('alice', submission());
    await late.service.runQueued();
    await late.service.idle();
    assert.deepEqual((await late.service.result('alice', job.id)).value, { n: 1 });
  } finally {
    await late.close();
  }
});
