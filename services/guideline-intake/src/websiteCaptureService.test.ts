import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserServer } from 'playwright-core';
import { SealedAssetStore } from './assets.js';
import { IntakeJobStore } from './store.js';
import { createIntakeHttpServer } from './http.js';
import { IntakeService, intakeHash, intakeOwnerKey, type IntakeProcessor } from './service.js';
import {
  INTAKE_VERSION,
  IntakeError,
  canonicalIntakeJson,
  type IntakeSubmission,
  type JsonValue,
  type IntakeResult,
} from './protocol.js';
import { createWebsiteCaptureProcessor, type WebsiteCaptureHost } from './websiteCapture.js';
import type { WebsiteNetwork } from './websiteNetwork.js';
import {
  WEBSITE_REQUEST_VERSION,
  parseWebsiteCapturePacket,
  type WebsiteCaptureRequest,
} from './websiteProtocol.js';

const fixtureUrl = 'https://fixture.example/guidelines';
const fixtureHtml = Buffer.from(`<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/colors.css"></head><body><main id="guide">
<h1>Harbor color guide</h1><p>Only this selected region is captured.</p>
<div class="swatch">Harbor teal</div></main></body></html>`);
const fixtureCss = Buffer.from(`:root{--harbor:rgb(17,96,101)}
body{margin:20px;background:#fff;color:#123;font:16px sans-serif}
.swatch{background:var(--harbor);color:#fff;width:180px;height:80px;padding:12px}`);
const ownerSecret = new Uint8Array(32).fill(7);

function request(): WebsiteCaptureRequest {
  return {
    schemaVersion: WEBSITE_REQUEST_VERSION,
    url: fixtureUrl,
    selector: '#guide',
    viewport: { width: 640, height: 480 },
    colorScheme: 'light',
    excludedSelectors: [],
    includedIncidentalSelectors: [],
  };
}
function submission(processor: IntakeProcessor): IntakeSubmission {
  const payload = request();
  return {
    schemaVersion: INTAKE_VERSION,
    profileId: processor.profile.id,
    profileVersion: processor.profile.version,
    kind: 'website',
    binding: { workspaceId: 'website-fixture', sourceRevision: intakeHash(payload) },
    captureHash: intakeHash(payload),
    scope: [payload.selector],
    parserVersion: 'website-capture-1',
    payload: payload as unknown as JsonValue,
    consent: {
      destination: processor.profile.destination,
      policyVersion: processor.profile.consentPolicyVersion,
      evidenceHash: intakeHash(payload),
    },
  };
}
function errorCode(code: string) {
  return (error: unknown) => error instanceof IntakeError && error.code === code;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, failed) => {
    resolve = done;
    reject = failed;
  });
  return { promise, resolve, reject };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Fixture capture did not settle within 10 seconds.')),
          10_000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Authored fixtures only: this launcher is not a production isolation qualification. */
function fixtureHost() {
  const servers = new Set<BrowserServer>();
  const calls: string[] = [];
  let launches = 0,
    terminations = 0;
  const host: WebsiteCaptureHost = {
    network: () => ({
      async get(url, signal): ReturnType<WebsiteNetwork['get']> {
        signal.throwIfAborted();
        calls.push(url);
        if (url === fixtureUrl)
          return {
            url,
            status: 200,
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'content-security-policy': "default-src 'self'; script-src 'none'; style-src 'self'",
            },
            body: fixtureHtml,
          };
        if (url === 'https://fixture.example/colors.css')
          return { url, status: 200, headers: { 'content-type': 'text/css' }, body: fixtureCss };
        throw new IntakeError('WEBSITE_FIXTURE_UNEXPECTED_REQUEST');
      },
    }),
    async launch(signal) {
      signal.throwIfAborted();
      launches++;
      const server = await chromium.launchServer({
        headless: true,
        host: '127.0.0.1',
        ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
        args: [
          '--disable-background-networking',
          '--no-proxy-server',
          '--host-resolver-rules=MAP * ~NOTFOUND',
        ],
      });
      servers.add(server);
      try {
        const browser = await chromium.connect(server.wsEndpoint());
        let terminated = false;
        return {
          browser,
          terminate() {
            if (terminated) return;
            terminated = true;
            terminations++;
            server.process().kill('SIGKILL');
          },
        };
      } catch (error) {
        await server.kill();
        throw error;
      }
    },
  };
  return {
    host,
    calls,
    get launches() {
      return launches;
    },
    get terminations() {
      return terminations;
    },
    close: async () => {
      await Promise.all([...servers].map(server => server.kill().catch(() => {})));
    },
  };
}
async function setup(processor: IntakeProcessor) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'teul-website-service-')));
  const store = new IntakeJobStore(join(directory, 'jobs.sqlite'), { now: Date.now });
  const assets = new SealedAssetStore({ directory: join(directory, 'assets'), key: ownerSecret });
  const service = new IntakeService({
    store,
    assets,
    ownerKey: ownerSecret,
    processors: [processor],
  });
  return {
    service,
    assets,
    close: async () => {
      await service.stop();
      store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('website intake requires exact consent and binding before any browser or source access', async () => {
  const fixture = fixtureHost();
  const processor = createWebsiteCaptureProcessor(fixture.host);
  const env = await setup(processor);
  try {
    for (const patch of [
      { captureHash: `sha256:${'a'.repeat(64)}` },
      { binding: { workspaceId: 'website-fixture', sourceRevision: `sha256:${'b'.repeat(64)}` } },
      { parserVersion: 'forged-parser' },
      { scope: ['body'] },
    ])
      await assert.rejects(
        env.service.submit('alice', { ...submission(processor), ...patch }),
        errorCode('WEBSITE_CAPTURE_BINDING_MISMATCH')
      );
    for (const field of ['destination', 'policyVersion', 'evidenceHash'] as const) {
      const input = submission(processor);
      input.consent[field] = field === 'evidenceHash' ? `sha256:${'c'.repeat(64)}` : 'unapproved';
      await assert.rejects(
        env.service.submit('alice', input),
        errorCode('CONSENT_OR_PROFILE_CHANGED')
      );
    }
    const changed = submission(processor);
    (changed.payload as Record<string, JsonValue>).selector = 'body';
    await assert.rejects(
      env.service.submit('alice', changed),
      errorCode('CONSENT_OR_PROFILE_CHANGED')
    );
    await env.service.runQueued();
    await env.service.idle();
    assert.equal(fixture.launches, 0);
    assert.deepEqual(fixture.calls, []);
  } finally {
    await env.close();
    await fixture.close();
  }
});

test('authenticated website jobs reuse one real fixture capture, isolate owners and reject altered hashes', async () => {
  const fixture = fixtureHost();
  const processor = createWebsiteCaptureProcessor(fixture.host);
  const env = await setup(processor);
  const server = createIntakeHttpServer({
    api: env.service,
    allowedOrigins: ['https://studio.example'],
    authenticate: async req =>
      req.headers.authorization === 'Bearer local-alice'
        ? 'alice'
        : req.headers.authorization === 'Bearer local-bob'
          ? 'bob'
          : null,
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const send = (path: string, owner: string, method = 'GET', body?: unknown) =>
    fetch(`http://127.0.0.1:${address.port}/api/guideline-intake${path}`, {
      method,
      headers: {
        Origin: 'https://studio.example',
        Authorization: `Bearer local-${owner}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    assert.equal((await send('/profiles', 'unknown')).status, 401);
    const first = await send('/jobs', 'alice', 'POST', submission(processor));
    assert.equal(first.status, 202);
    const created = (await first.json()) as { job: { id: string }; reused: boolean };
    const duplicate = await send('/jobs', 'alice', 'POST', submission(processor));
    assert.deepEqual(await duplicate.json(), { ...created, reused: true });
    await env.service.runQueued();
    await bounded(env.service.idle());
    assert.equal(
      env.service.get('alice', created.job.id).status,
      'needs-review',
      JSON.stringify(env.service.get('alice', created.job.id))
    );
    const output = await send(`/jobs/${created.job.id}/result`, 'alice');
    assert.equal(output.status, 200);
    const result = (await output.json()) as IntakeResult;
    const packet = parseWebsiteCapturePacket(result.value);
    assert.equal(result.job.outputHash, intakeHash(result.value));
    assert.equal(
      packet.documentHash,
      `sha256:${createHash('sha256').update(fixtureHtml).digest('hex')}`
    );
    assert.ok(packet.elements.some(item => item.text === 'Harbor teal'));
    assert.ok(
      packet.usages.some(
        item => item.property === 'background-color' && item.value === 'rgb(17, 96, 101)'
      )
    );
    assert.ok(
      packet.gaps.some(item => item.code === 'WEBSITE_OBSERVED_USAGE_NOT_OFFICIAL_BRAND_RULES')
    );
    assert.equal(packet.screenshot.width, 640);
    assert.equal(fixture.launches, 1);
    assert.equal(fixture.terminations, 1);
    assert.deepEqual(fixture.calls, [fixtureUrl, 'https://fixture.example/colors.css']);
    assert.equal((await send(`/jobs/${created.job.id}/result`, 'bob')).status, 404);
    assert.equal((await send(`/jobs/${created.job.id}/cancel`, 'bob', 'POST')).status, 404);
    const reused = await send('/jobs', 'alice', 'POST', submission(processor));
    assert.equal(((await reused.json()) as { job: { id: string } }).job.id, created.job.id);
    await env.service.runQueued();
    await env.service.idle();
    assert.equal(fixture.launches, 1);
    const separate = await send('/jobs', 'bob', 'POST', submission(processor));
    const other = (await separate.json()) as { job: { id: string } };
    assert.notEqual(other.job.id, created.job.id);
    await env.service.cancel('bob', other.job.id);

    const forged = { ...packet, contentHash: `sha256:${'d'.repeat(64)}` } as unknown as JsonValue;
    assert.throws(
      () => processor.validateOutput(forged),
      errorCode('WEBSITE_CAPTURE_HASH_MISMATCH')
    );
    const invalid = await setup({
      ...processor,
      execute: async () => ({ value: forged, actualCostMicros: 0 }),
    });
    try {
      const rejected = await invalid.service.submit('alice', submission(processor));
      await invalid.service.runQueued();
      await invalid.service.idle();
      const job = invalid.service.get('alice', rejected.job.id);
      assert.equal(job.status, 'failed');
      assert.equal(job.errorCode, 'INVALID_PROCESSOR_OUTPUT');
      assert.equal(job.outputHash, null);
      await assert.rejects(invalid.service.result('alice', job.id), errorCode('RESULT_NOT_READY'));
    } finally {
      await invalid.close();
    }

    await env.assets.put(
      intakeOwnerKey(ownerSecret, 'alice'),
      created.job.id,
      'result',
      Buffer.from(canonicalIntakeJson(forged))
    );
    const corrupted = await send(`/jobs/${created.job.id}/result`, 'alice');
    assert.equal(corrupted.status, 409);
    assert.deepEqual(await corrupted.json(), { error: { code: 'RESULT_CHANGED' } });
  } finally {
    await env.close();
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
    await fixture.close();
  }
});

test('cancellation wins a completed website capture held before publication', async () => {
  const fixture = fixtureHost();
  const processor = createWebsiteCaptureProcessor(fixture.host);
  type Output = Awaited<ReturnType<IntakeProcessor['execute']>>;
  const completed = deferred<Output>();
  const release = deferred<void>();
  const env = await setup({
    ...processor,
    execute: async (input, context) => {
      try {
        const result = await processor.execute(input, context);
        completed.resolve(result);
        await release.promise;
        return result;
      } catch (error) {
        completed.reject(error);
        throw error;
      }
    },
  });
  try {
    const { job } = await env.service.submit('alice', submission(processor));
    await env.service.runQueued();
    const late = await bounded(completed.promise);
    processor.validateOutput(late.value);
    assert.equal(fixture.launches, 1);
    assert.equal((await env.service.cancel('alice', job.id)).status, 'cancelled');
    release.resolve();
    await bounded(env.service.idle());
    assert.equal(env.service.get('alice', job.id).status, 'cancelled');
    assert.equal(env.service.get('alice', job.id).outputHash, null);
    await assert.rejects(env.service.result('alice', job.id), errorCode('RESULT_NOT_READY'));
    await assert.rejects(env.assets.read(intakeOwnerKey(ownerSecret, 'alice'), job.id, 'result'));
    assert.equal(fixture.terminations, 1);
  } finally {
    release.resolve();
    await env.close();
    await fixture.close();
  }
});
