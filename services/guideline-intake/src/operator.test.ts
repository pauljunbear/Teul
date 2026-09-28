import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startIntakeHost, type IntakeHostOptions } from './host.js';
import { operateIntakeState, parseOperatorCommand } from './operator.js';
import { IntakeJobStore, type JobSpec } from './store.js';
import { SealedAssetStore } from './assets.js';
import { intakeHash } from './service.js';
import { INTAKE_VERSION } from './protocol.js';

const origin = 'https://studio.example.test';
const owner = 'a'.repeat(64);
const profile = {
  id: 'synthetic',
  version: '1',
  kind: 'pdf' as const,
  operation: 'interpret' as const,
  destination: 'Synthetic operator test',
  consentPolicyVersion: '1',
  maximumAttemptCostMicros: 10,
  maximumJobCostMicros: 20,
};
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'teul-operator-')));
  await mkdir(join(root, 'studio'));
  await writeFile(join(root, 'studio/index.html'), '<!doctype html><title>Fixture</title>');
  let executions = 0;
  const options: IntakeHostOptions = {
    stateDirectory: join(root, 'state'),
    studioDirectory: join(root, 'studio'),
    ownerKey: new Uint8Array(32).fill(2),
    assetKey: new Uint8Array(32).fill(4),
    authenticate: async () => 'synthetic-owner',
    allowedOrigins: [origin],
    listen: { host: '127.0.0.1', port: 0 },
    configureAdapters: async () => ({
      processors: [
        {
          profile,
          validateInput: () => {},
          validateOutput: () => {},
          execute: async () => {
            executions++;
            return { value: {}, actualCostMicros: 1 };
          },
        },
      ],
    }),
  };
  const host = await startIntakeHost(options);
  await host.stop();
  return {
    root,
    options,
    executions: () => executions,
    clean: () => rm(root, { recursive: true, force: true }),
  };
}
function spec(index: number): JobSpec {
  return {
    kind: 'pdf',
    workspaceId: 'test',
    sourceRevision: owner,
    captureHash: owner,
    requestHash: String(index).padStart(64, '0'),
    parserVersion: 'test',
    processorVersion: '1',
    processor: profile.id,
    budgetMicros: 20,
  };
}

test('operator refuses a live or stale lease and disabled state blocks submissions after restart', async t => {
  const f = await fixture();
  t.after(f.clean);
  const disabled = await operateIntakeState(f.options, ['disable', profile.id, 'OPERATOR_REVIEW']);
  assert.equal(disabled.disabledProcessorCount, 1);
  let host = await startIntakeHost(f.options);
  try {
    await assert.rejects(operateIntakeState(f.options, ['status']), /HOST_STATE_LOCKED/);
    await assert.rejects(
      operateIntakeState(f.options, ['enable', profile.id, '--reconciled']),
      /HOST_STATE_LOCKED/
    );
    assert.ok(host.address && typeof host.address === 'object');
    const payload = { text: 'synthetic evidence' };
    const response = await fetch(
      `http://127.0.0.1:${host.address.port}/api/guideline-intake/jobs`,
      {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schemaVersion: INTAKE_VERSION,
          profileId: profile.id,
          profileVersion: '1',
          kind: 'pdf',
          binding: { workspaceId: 'test', sourceRevision: intakeHash('source') },
          captureHash: intakeHash('capture'),
          scope: ['page:1'],
          parserVersion: 'test',
          payload,
          consent: {
            destination: profile.destination,
            policyVersion: '1',
            evidenceHash: intakeHash(payload),
          },
        }),
      }
    );
    assert.equal(response.status, 409);
    assert.equal(f.executions(), 0);
  } finally {
    await host.stop();
  }
  assert.throws(() => parseOperatorCommand(['enable', profile.id]), /OPERATOR_COMMAND_INVALID/);
  const enabled = await operateIntakeState(f.options, ['enable', profile.id, '--reconciled']);
  assert.equal(enabled.disabledProcessorCount, 0);
  host = await startIntakeHost(f.options);
  await host.stop();
  assert.equal((await operateIntakeState(f.options, ['status'])).disabledProcessorCount, 0);
  await writeFile(join(f.options.stateDirectory, 'worker.lock'), 'unverified previous worker', {
    mode: 0o600,
  });
  await assert.rejects(operateIntakeState(f.options, ['maintain']), /HOST_STATE_LOCKED/);
  assert.equal(
    await readFile(join(f.options.stateDirectory, 'worker.lock'), 'utf8'),
    'unverified previous worker'
  );
});

test('maintenance cleans retained evidence, preserves unknown cost and never dispatches queued work', async t => {
  const f = await fixture();
  t.after(f.clean);
  const database = join(f.options.stateDirectory, 'jobs.sqlite');
  const store = new IntakeJobStore(database, { now: Date.now });
  const assets = new SealedAssetStore({
    directory: join(f.options.stateDirectory, 'assets'),
    key: f.options.assetKey,
  });
  const active = store.create(owner, spec(1)).job;
  const deleted = store.create(owner, spec(2)).job;
  const queued = store.create(owner, spec(3)).job;
  await assets.put(owner, active.id, 'input', Buffer.from('PRIVATE_TEST_EVIDENCE'));
  await assets.put(owner, deleted.id, 'input', Buffer.from('PRIVATE_TEST_EVIDENCE'));
  store.claim(owner, active.id, { reservationMicros: 10 });
  store.delete(owner, deleted.id);
  store.close();
  const before = await operateIntakeState(f.options, ['status']);
  assert.equal(before.cleanup.pending, 1);
  assert.doesNotMatch(JSON.stringify(before), /PRIVATE_TEST_EVIDENCE|ownerKey|inputRef|resultRef/);
  const after = await operateIntakeState(f.options, ['maintain']);
  assert.equal(after.recoveredUnknownJobs, 1);
  assert.equal(after.cleanup.pending, 0);
  assert.equal(f.executions(), 0);
  const reopened = new IntakeJobStore(database, { now: Date.now });
  try {
    assert.equal(reopened.get(owner, active.id).failureCode, 'WORKER_RESTART_UNKNOWN');
    assert.equal(reopened.get(owner, active.id).committedMicros, 10);
    assert.equal(reopened.get(owner, queued.id).status, 'queued');
  } finally {
    reopened.close();
  }
  await assert.rejects(assets.read(owner, deleted.id, 'input'));
});

test('operator rejects missing state, missing database, unsafe arguments and shared keys without bootstrapping', async t => {
  const f = await fixture();
  t.after(f.clean);
  const missing = join(f.root, 'missing');
  await assert.rejects(operateIntakeState({ ...f.options, stateDirectory: missing }, ['status']));
  await assert.rejects(readFile(join(missing, 'jobs.sqlite')));
  await mkdir(missing, { mode: 0o700 });
  await assert.rejects(
    operateIntakeState({ ...f.options, stateDirectory: missing }, ['disable', profile.id, 'REVIEW'])
  );
  await assert.rejects(readFile(join(missing, 'jobs.sqlite')));
  await assert.rejects(readFile(join(missing, 'worker.lock')));
  for (const args of [
    [],
    ['status', 'extra'],
    ['disable', '../id', 'REVIEW'],
    ['disable', 'id', 'source text'],
    ['enable', 'id', '--force'],
  ])
    assert.throws(() => parseOperatorCommand(args), /OPERATOR_COMMAND_INVALID/);
  await assert.rejects(
    operateIntakeState({ ...f.options, assetKey: f.options.ownerKey }, ['status']),
    /HOST_CONFIGURATION_INVALID/
  );
});

test('operator executable redacts configuration failures and reads existing state without loading adapters', async t => {
  const f = await fixture();
  t.after(f.clean);
  const config = join(f.root, 'config.mjs');
  await writeFile(
    config,
    `export default async () => ({
    stateDirectory: ${JSON.stringify(f.options.stateDirectory)},
    studioDirectory: ${JSON.stringify(f.options.studioDirectory)},
    ownerKey: new Uint8Array(32).fill(2), assetKey: new Uint8Array(32).fill(4),
    configureAdapters: () => { throw new Error('must not register adapters'); }
  });`
  );
  const cli = fileURLToPath(new URL('./operatorCli.js', import.meta.url));
  const run = promisify(execFile);
  const result = await run(process.execPath, [cli, config, 'status']);
  assert.equal(JSON.parse(result.stdout).incidentCount, 0);
  await writeFile(
    config,
    "export default async () => { throw new Error('PRIVATE_TEST_SECRET'); };"
  );
  await assert.rejects(run(process.execPath, [cli, config, 'status']), error => {
    const result = error as Error & { stderr: string; stdout: string };
    assert.match(result.stderr, /OPERATOR_FAILED/);
    assert.doesNotMatch(result.stderr + result.stdout, /PRIVATE_TEST_SECRET/);
    return true;
  });
});
