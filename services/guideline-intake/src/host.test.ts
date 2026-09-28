import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { get as httpGet } from 'node:http';
import { promisify } from 'node:util';
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  truncate,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startIntakeHost, type IntakeHostOptions } from './host.js';
import { intakeHash, type IntakeProcessor } from './service.js';
import { INTAKE_VERSION } from './protocol.js';
import { loadHostAssets } from './hostAssets.js';

const origin = 'https://studio.example.test';
const profile = {
  id: 'synthetic-host',
  version: '1',
  kind: 'pdf' as const,
  operation: 'interpret' as const,
  destination: 'Synthetic local host check',
  consentPolicyVersion: '1',
  maximumAttemptCostMicros: 150_000,
  maximumJobCostMicros: 300_000,
};
const payload = { text: 'SYNTHETIC_PRIVATE_SOURCE_49127' };
const input = {
  schemaVersion: INTAKE_VERSION,
  profileId: profile.id,
  profileVersion: profile.version,
  kind: 'pdf',
  binding: { workspaceId: 'host-test', sourceRevision: intakeHash('source') },
  captureHash: intakeHash('capture'),
  scope: ['page:1'],
  parserVersion: 'test-1',
  payload,
  consent: {
    destination: profile.destination,
    policyVersion: profile.consentPolicyVersion,
    evidenceHash: intakeHash(payload),
  },
};
const headers = { Cookie: 'test-owner=alice', Origin: origin, 'Content-Type': 'application/json' };
async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'teul-host-')));
  const studio = join(directory, 'studio');
  await mkdir(studio);
  await writeFile(
    join(studio, 'index.html'),
    '<!doctype html><title>Host fixture</title><script src="/app.js"></script>'
  );
  await writeFile(join(studio, 'app.js'), 'document.documentElement.dataset.loaded="yes";');
  const options: IntakeHostOptions = {
    stateDirectory: join(directory, 'state'),
    studioDirectory: studio,
    ownerKey: new Uint8Array(32).fill(2),
    assetKey: new Uint8Array(32).fill(4),
    authenticate: async request =>
      request.headers.cookie === 'test-owner=alice'
        ? 'alice'
        : request.headers.cookie === 'test-owner=bob'
          ? 'bob'
          : null,
    allowedOrigins: [origin],
    listen: { host: '127.0.0.1', port: 0 },
    shutdownTimeoutMs: 1000,
  };
  return { directory, options, clean: () => rm(directory, { recursive: true, force: true }) };
}
function url(host: Awaited<ReturnType<typeof startIntakeHost>>) {
  assert.ok(host.address && typeof host.address === 'object');
  return `http://127.0.0.1:${host.address.port}`;
}
async function until<T>(get: () => Promise<T>, accept: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 5000;
  do {
    const value = await get();
    if (accept(value)) return value;
    await delay(20);
  } while (Date.now() < deadline);
  throw new Error('Host fixture did not reach expected state');
}

test('host serves one immutable build and authenticated owner API, retains exact results across restart', async () => {
  const f = await fixture();
  let calls = 0;
  const processor: IntakeProcessor = {
    profile,
    validateInput: () => {},
    validateOutput: () => {},
    execute: async () => {
      calls++;
      return { value: { labels: ['source'] }, actualCostMicros: 123 };
    },
  };
  f.options.configureAdapters = async () => ({ processors: [processor] });
  let host = await startIntakeHost(f.options);
  try {
    let base = url(host);
    assert.equal((await fetch(base + '/')).status, 401);
    assert.equal(
      (await fetch(base + '/', { headers: { 'X-Forwarded-Email': 'alice' } })).status,
      401
    );
    assert.equal((await fetch(base + '/readyz')).status, 200);
    assert.equal((await fetch(base + '/', { headers })).status, 200);
    assert.equal(
      (await fetch(base + '/app.js', { headers })).headers.get('content-type'),
      'text/javascript; charset=utf-8'
    );
    const initial = await (await fetch(base + '/app.js', { headers })).text();
    await writeFile(join(f.options.studioDirectory, 'app.js'), 'changed after start');
    assert.equal(await (await fetch(base + '/app.js', { headers })).text(), initial);
    assert.equal(
      (await fetch(base + '/app.js', { method: 'HEAD', headers })).headers.get('content-length'),
      String(Buffer.byteLength(initial))
    );
    for (const path of ['/.env', '/state/jobs.sqlite', '/%2e%2e/state/worker.lock', '/api/unknown'])
      assert.equal((await fetch(base + path, { headers })).status, 404);
    assert.equal(
      (await fetch(base + '/', { headers: { ...headers, Origin: 'https://evil.example.test' } }))
        .status,
      403
    );
    const submission = await fetch(base + '/api/guideline-intake/jobs', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    assert.equal(submission.status, 202);
    const created = (await submission.json()) as { job: { id: string } };
    const id = created.job.id;
    const result = await until(
      async () => {
        const response = await fetch(base + `/api/guideline-intake/jobs/${id}/result`, { headers });
        return { status: response.status, body: await response.json() };
      },
      result => result.status === 200
    );
    assert.deepEqual((result.body as { value: unknown }).value, { labels: ['source'] });
    assert.equal(
      (
        await fetch(base + `/api/guideline-intake/jobs/${id}`, {
          headers: { ...headers, Cookie: 'test-owner=bob' },
        })
      ).status,
      404
    );
    await assert.rejects(startIntakeHost(f.options), /HOST_STATE_LOCKED/);
    assert.equal((await fetch(base + '/readyz')).status, 200);
    await Promise.all([host.stop(), host.stop()]);
    host = await startIntakeHost(f.options);
    base = url(host);
    const reopened = await (
      await fetch(base + `/api/guideline-intake/jobs/${id}/result`, { headers })
    ).json();
    assert.deepEqual(reopened, result.body);
    const duplicate = (await (
      await fetch(base + '/api/guideline-intake/jobs', {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      })
    ).json()) as { reused: boolean; job: { id: string } };
    assert.equal(duplicate.reused, true);
    assert.equal(duplicate.job.id, id);
    assert.equal(calls, 1);
  } finally {
    await host.stop();
    await f.clean();
  }
});

test('failed startup releases its own lock; invalid auth/keys, overlapping and unsafe builds never start', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      startIntakeHost({ ...f.options, ownerKey: f.options.assetKey }),
      /HOST_CONFIGURATION_INVALID/
    );
    await assert.rejects(
      startIntakeHost({ ...f.options, stateDirectory: f.options.studioDirectory }),
      /HOST_DIRECTORIES_OVERLAP/
    );
    await assert.rejects(
      startIntakeHost({ ...f.options, allowedOrigins: ['http://untrusted.example.test'] }),
      /INVALID_ORIGIN_CONFIGURATION/
    );
    const host = await startIntakeHost(f.options);
    assert.deepEqual(
      await (await fetch(url(host) + '/api/guideline-intake/profiles', { headers })).json(),
      { profiles: [] }
    );
    await host.stop();
    await symlink(
      join(f.options.stateDirectory, 'jobs.sqlite'),
      join(f.options.studioDirectory, 'private.json')
    );
    await assert.rejects(loadHostAssets(f.options.studioDirectory), /INVALID_STUDIO_ASSET/);
    await unlink(join(f.options.studioDirectory, 'private.json'));
    await writeFile(join(f.options.studioDirectory, '.env'), 'SECRET_NOT_SERVED');
    await assert.rejects(loadHostAssets(f.options.studioDirectory), /INVALID_STUDIO_ASSET/);
    await unlink(join(f.options.studioDirectory, '.env'));
    await truncate(join(f.options.studioDirectory, 'app.js'), 17 * 1024 * 1024);
    await assert.rejects(loadHostAssets(f.options.studioDirectory), /INVALID_STUDIO_ASSET/);
  } finally {
    await f.clean();
  }
});

test('stop drains admitted HTTP work and adapter cancellation before closing credential stores', async () => {
  const f = await fixture();
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => {
    started = resolve;
  });
  const wait = new Promise<void>(resolve => {
    release = resolve;
  });
  const original = f.options.authenticate;
  f.options.authenticate = async request => {
    if (request.url === '/app.js') {
      started();
      await wait;
    }
    return original(request);
  };
  const order: string[] = [];
  f.options.configureAdapters = async () => ({
    stop: async () => {
      order.push('stop');
    },
    close: () => {
      order.push('close');
    },
  });
  const host = await startIntakeHost(f.options);
  try {
    const request = fetch(url(host) + '/app.js', { headers });
    await entered;
    const stopping = host.stop();
    await delay(30);
    assert.deepEqual(order, ['stop']);
    release();
    assert.equal((await request).status, 503);
    await stopping;
    assert.deepEqual(order, ['stop', 'close']);
  } finally {
    release();
    await host.stop();
    await f.clean();
  }
});

test('disconnected authentication requests retain bounded admission until their work settles', async () => {
  const f = await fixture();
  let entered = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  f.options.authenticate = async () => {
    entered++;
    await held;
    return 'alice';
  };
  const host = await startIntakeHost(f.options);
  try {
    for (let count = 1; count <= 32; count++) {
      const pending = httpGet(url(host) + '/', { agent: false });
      pending.on('error', () => {});
      const closed = new Promise<void>(resolve => pending.once('close', resolve));
      await until(
        async () => entered,
        current => current === count
      );
      pending.destroy();
      await closed;
    }
    const refused = await fetch(url(host) + '/', { headers });
    assert.equal(refused.status, 503);
    assert.deepEqual(await refused.json(), { status: 'HOST_REQUEST_CAPACITY' });
    assert.equal(entered, 32);
    release();
    await until(
      async () => (await fetch(url(host) + '/', { headers })).status,
      status => status === 200
    );
  } finally {
    release();
    await host.stop();
    await f.clean();
  }
});

test('oversized static directory stops at its bounded entry count', async () => {
  const f = await fixture();
  try {
    for (let offset = 0; offset < 1000; offset += 50)
      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          writeFile(join(f.options.studioDirectory, `extra-${offset + i}.txt`), '')
        )
      );
    await assert.rejects(loadHostAssets(f.options.studioDirectory), /STUDIO_BUILD_LIMIT/);
  } finally {
    await f.clean();
  }
});

test('CLI refuses an operator module in the publicly served Studio build', async () => {
  const f = await fixture();
  try {
    const config = join(f.options.studioDirectory, 'operator.mjs');
    await writeFile(
      config,
      `export default async () => ({ studioDirectory: ${JSON.stringify(f.options.studioDirectory)} });`
    );
    await assert.rejects(
      promisify(execFile)(
        process.execPath,
        [fileURLToPath(new URL('./start.js', import.meta.url)), config],
        { timeout: 5000 }
      ),
      error => {
        assert.ok(error instanceof Error && 'stderr' in error);
        assert.match(String(error.stderr), /HOST_CONFIG_IN_STUDIO/);
        return true;
      }
    );
    await assert.rejects(readFile(join(f.options.stateDirectory, 'worker.lock')), {
      code: 'ENOENT',
    });
  } finally {
    await f.clean();
  }
});

test('CLI retains its lease and does not close adapter resources when draining rejects', async () => {
  const f = await fixture();
  const closed = join(f.directory, 'closed.txt');
  const config = join(f.directory, 'operator.mjs');
  await writeFile(
    config,
    `import { writeFileSync } from 'node:fs';
    export default async () => ({
      stateDirectory:${JSON.stringify(f.options.stateDirectory)}, studioDirectory:${JSON.stringify(f.options.studioDirectory)},
      ownerKey:new Uint8Array(32).fill(2), assetKey:new Uint8Array(32).fill(4), allowedOrigins:[${JSON.stringify(origin)}],
      listen:{host:'127.0.0.1',port:0}, authenticate:async()=>null,
      configureAdapters:async()=>({
        stop:async()=>{throw new Error('PRIVATE_ADAPTER_DETAIL');},
        close:()=>writeFileSync(${JSON.stringify(closed)},'closed')
      })
    });`
  );
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./start.js', import.meta.url)), config],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout = (stdout + chunk.toString()).slice(-16384);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-16384);
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  try {
    await until(async () => stdout.includes('"listening"'), Boolean);
    child.kill('SIGTERM');
    assert.equal(
      await until(
        async () => child.exitCode,
        code => code !== null
      ),
      1
    );
    assert.match(stderr, /HOST_SHUTDOWN_FAILED/);
    assert.ok(!stderr.includes('PRIVATE_ADAPTER_DETAIL'));
    await assert.rejects(readFile(closed), { code: 'ENOENT' });
    await assert.rejects(startIntakeHost(f.options), /HOST_STATE_LOCKED/);
  } finally {
    child.kill('SIGKILL');
    await exited;
    await f.clean();
  }
});

for (const signal of ['SIGKILL', 'SIGTERM'] as const) {
  test(`CLI ${signal} preserves unknown cost and requires confirmed stopped-worker lock recovery`, async () => {
    const f = await fixture();
    const marker = join(f.directory, 'calls.txt');
    const config = join(f.directory, 'operator.mjs');
    await writeFile(
      config,
      `import { appendFile } from 'node:fs/promises';
      export default async () => ({
        stateDirectory:${JSON.stringify(f.options.stateDirectory)}, studioDirectory:${JSON.stringify(f.options.studioDirectory)},
        ownerKey:new Uint8Array(32).fill(2), assetKey:new Uint8Array(32).fill(4), allowedOrigins:[${JSON.stringify(origin)}],
        listen:{host:'127.0.0.1',port:0},shutdownTimeoutMs:200,
        authenticate:async request=>request.headers.cookie==='test-owner=alice'?'alice':null,
        configureAdapters:async()=>({processors:[{profile:${JSON.stringify(profile)},validateInput:()=>{},validateOutput:()=>{},
          execute:async()=>{await appendFile(${JSON.stringify(marker)},'dispatch\\n'); return new Promise(()=>{});}}]})
      });`
    );
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./start.js', import.meta.url)), config],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-16_384);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-16_384);
    });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        child.once('exit', (code, signal) => resolve({ code, signal }));
        child.once('error', reject);
      }
    );
    try {
      const line = await until(
        async () => stdout.split('\n').find(line => line.includes('"listening"')),
        Boolean
      );
      const address = JSON.parse(line!).address as { port: number };
      const base = `http://127.0.0.1:${address.port}`;
      const created = (await (
        await fetch(base + '/api/guideline-intake/jobs', {
          method: 'POST',
          headers,
          body: JSON.stringify(input),
        })
      ).json()) as { job: { id: string } };
      await until(
        async () => {
          try {
            return await readFile(marker, 'utf8');
          } catch {
            return '';
          }
        },
        text => text === 'dispatch\n'
      );
      child.kill(signal);
      const result = await Promise.race([
        exited,
        delay(5000).then(() => {
          throw new Error('CLI failed to terminate');
        }),
      ]);
      if (signal === 'SIGTERM') {
        assert.equal(result.code, 1);
        assert.match(stderr, /HOST_SHUTDOWN_TIMEOUT/);
      } else assert.equal(result.signal, 'SIGKILL');
      assert.ok(!stderr.includes(payload.text));
      await assert.rejects(startIntakeHost(f.options), /HOST_STATE_LOCKED/);
      // The parent observed this exact process terminate before releasing its stale lease.
      await unlink(join(f.options.stateDirectory, 'worker.lock'));
      const host = await startIntakeHost(f.options);
      try {
        const response = (await (
          await fetch(url(host) + `/api/guideline-intake/jobs/${created.job.id}`, { headers })
        ).json()) as { job: { status: string; errorCode: string } };
        assert.equal(response.job.status, 'failed');
        assert.equal(
          response.job.errorCode,
          signal === 'SIGKILL' ? 'WORKER_RESTART_UNKNOWN' : 'WORKER_STOPPED_UNKNOWN'
        );
        assert.equal(await readFile(marker, 'utf8'), 'dispatch\n');
        const { IntakeJobStore } = await import('./store.js');
        const { intakeOwnerKey } = await import('./service.js');
        const store = new IntakeJobStore(join(f.options.stateDirectory, 'jobs.sqlite'), {
          now: Date.now,
        });
        try {
          assert.equal(
            store.get(intakeOwnerKey(f.options.ownerKey, 'alice'), created.job.id).committedMicros,
            150_000
          );
        } finally {
          store.close();
        }
      } finally {
        await host.stop();
      }
    } finally {
      child.kill('SIGKILL');
      await exited;
      await f.clean();
    }
  });
}
