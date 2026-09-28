import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { startIntakeHost } from '../../services/guideline-intake/dist/host.js';
import { operateIntakeState } from '../../services/guideline-intake/dist/operator.js';
import { intakeHash } from '../../services/guideline-intake/dist/service.js';
import { INTAKE_VERSION } from '../../services/guideline-intake/dist/protocol.js';
import { createOpenAiInterpretationProcessor } from '../../services/guideline-intake/dist/openaiInterpretation.js';
import {
  INTERPRETATION_VERSION,
  INTERPRETATION_INPUT_VERSION,
} from '../../services/guideline-intake/dist/interpretation.js';
import {
  createFigmaCaptureProcessor,
  FigmaReadClient,
} from '../../services/guideline-intake/dist/figmaRead.js';
import {
  FigmaConnections,
  figmaOAuthBinding,
} from '../../services/guideline-intake/dist/figmaConnection.js';
import { FigmaConnectionStore } from '../../services/guideline-intake/dist/figmaConnectionStore.js';
import { createWebsiteCaptureProcessor } from '../../services/guideline-intake/dist/websiteCapture.js';
import { WEBSITE_REQUEST_VERSION } from '../../services/guideline-intake/dist/websiteProtocol.js';

// Authored fixtures and injected transports only. The launcher is not qualified OS isolation.
const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'teul-host-integration-')));
const output = path.resolve('../release/guideline-host-integration');
await mkdir(output, { recursive: true });
const runtime = `node${process.versions.node.split('.')[0]}`;
const receipt = {
  status: 'running',
  node: process.version,
  checks: [],
  errors: [],
  timingsMs: [],
  sourceTraffic: 'synthetic only',
};
const origin = 'https://studio.example.test';
const pageUrl = 'https://fixture.example/brand';
const fixture = JSON.parse(await readFile('fixtures/guidelines/figma-native.json', 'utf8'));
const processes = new Set();
const calls = { pdf: 0, figma: 0, website: 0 };
let host,
  base,
  connections,
  hold = null;
let heldCalls = 0;
const holdUntilAborted = signal =>
  new Promise((resolve, reject) => {
    heldCalls++;
    const abort = () => reject(new DOMException('Synthetic cancellation', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
const config = {
  clientId: 'synthetic',
  clientSecret: 'synthetic-secret',
  callbackUrl: `${origin}/api/guideline-intake/figma/callback`,
  returnUrl: origin,
  allowVariables: false,
};
const figmaTransport = async (raw, init) => {
  const url = new URL(raw);
  if (url.pathname === '/v1/oauth/token')
    return Response.json({
      access_token: 'synthetic-access',
      refresh_token: 'synthetic-refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user_id_string:
        new URLSearchParams(init.body).get('code') === 'synthetic-bob' ? '234567' : '123456',
    });
  assert.equal(url.hostname, 'api.figma.com');
  assert.ok(url.pathname.endsWith('/nodes'));
  calls.figma++;
  if (hold === 'figma') await holdUntilAborted(init.signal);
  return Response.json(fixture);
};
const pdf = createOpenAiInterpretationProcessor({
  apiKey: 'synthetic-not-a-credential',
  model: 'synthetic',
  modelRevision: 'synthetic',
  pricing: {
    inputMicrosPerMillionTokens: 1_000_000,
    outputMicrosPerMillionTokens: 3_000_000,
    reviewedAt: new Date().toISOString(),
    sourceUrl: 'https://openai.com/api/pricing/',
    imageTokenSourceUrl: 'https://developers.openai.com/api/docs/guides/images-vision',
    framingTokenSourceUrl: 'https://developers.openai.com/api/docs/guides/counting-tokens',
  },
  limits: {
    maximumTextBytes: 65536,
    maximumImages: 0,
    maximumImageTokens: 1,
    maximumOutputTokens: 1000,
    maximumResponseBytes: 100000,
    requestOverheadTokens: 1000,
  },
  consentPolicyVersion: 'synthetic-1',
  fetch: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    calls.pdf++;
    if (hold === 'pdf') await holdUntilAborted(init.signal);
    const input = JSON.parse(JSON.parse(init.body).input[0].content[0].text);
    const result = {
      schemaVersion: INTERPRETATION_VERSION,
      sourceDigest: input.source.digest,
      sourceCaptureHash: input.source.captureHash,
      colors: [],
      scales: [],
      rules: [],
      issues: [],
    };
    return Response.json({
      model: 'synthetic',
      status: 'completed',
      error: null,
      incomplete_details: null,
      output: [
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: JSON.stringify(result) }],
        },
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    });
  },
});
const website = createWebsiteCaptureProcessor({
  network: () => ({
    get: async (url, signal) => {
      signal.throwIfAborted();
      assert.equal(url, pageUrl);
      calls.website++;
      return {
        url,
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: Buffer.from(
          '<!doctype html><style>:root{--brand:#126e78}body{color:#182e34;background:#fff}.swatch{background:var(--brand)}</style><main id="brand"><h1>Harbor</h1><p class="swatch">Brand teal</p></main>'
        ),
      };
    },
  }),
  launch: async signal => {
    signal.throwIfAborted();
    const process = await chromium.launchServer({
      headless: true,
      host: '127.0.0.1',
      args: [
        '--disable-background-networking',
        '--no-proxy-server',
        '--host-resolver-rules=MAP * ~NOTFOUND',
      ],
    });
    processes.add(process);
    try {
      return {
        browser: await chromium.connect(process.wsEndpoint()),
        terminate: () => process.process().kill('SIGKILL'),
      };
    } catch (error) {
      await process.kill();
      throw error;
    }
  },
});
const options = {
  stateDirectory: path.join(directory, 'state'),
  studioDirectory: await realpath('dist'),
  ownerKey: new Uint8Array(32).fill(23),
  assetKey: new Uint8Array(32).fill(24),
  allowedOrigins: [origin],
  maximumConcurrent: 2,
  listen: { host: '127.0.0.1', port: 0 },
  authenticate: async request =>
    ['alice', 'bob', 'saturation'].find(
      name => request.headers.cookie === `synthetic-owner=${name}`
    ) ?? null,
  configureAdapters: async ({ stateDirectory, ownerKey }) => {
    const store = new FigmaConnectionStore({
      directory: path.join(stateDirectory, 'connections'),
      key: new Uint8Array(32).fill(25),
      appBinding: figmaOAuthBinding(config),
    });
    connections = new FigmaConnections({ config, store, ownerKey, fetch: figmaTransport });
    return {
      figma: connections,
      stop: () => connections.close(),
      close: () => store.close(),
      processors: [
        pdf,
        website,
        createFigmaCaptureProcessor({
          client: new FigmaReadClient({ fetch: figmaTransport }),
          connection: (owner, signal) => connections.lease(owner, signal),
        }),
      ],
    };
  },
};
async function start() {
  host = await startIntakeHost(options);
  base = `http://127.0.0.1:${host.address.port}`;
}
async function api(owner, suffix, method = 'GET', body, signal = AbortSignal.timeout(5000)) {
  const response = await fetch(`${base}/api/guideline-intake${suffix}`, {
    method,
    signal,
    headers: {
      Cookie: `synthetic-owner=${owner}`,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
async function until(get, accepts, timeout = 15000) {
  const deadline = Date.now() + timeout;
  const signal = AbortSignal.timeout(timeout);
  while (Date.now() < deadline) {
    const value = await get(signal);
    if (accepts(value)) return value;
    await delay(20);
  }
  throw new Error('Synthetic host integration timed out');
}
function submission(profile, index) {
  let payload, scope, parserVersion;
  if (profile.kind === 'pdf') {
    payload = {
      schemaVersion: INTERPRETATION_INPUT_VERSION,
      source: {
        kind: 'pdf',
        label: 'Synthetic',
        digest: intakeHash('pdf'),
        captureHash: 'native-1',
        scope: ['page:1'],
        inspectedScopes: ['page:1'],
        gaps: [],
      },
      observations: [{ id: 'text-1', kind: 'text', scope: 'page:1', text: 'Harbor teal #126E78' }],
      images: [],
    };
    scope = ['page:1'];
    parserVersion = 'pdf-native-1';
  } else if (profile.kind === 'figma') {
    payload = {
      schemaVersion: 'teul.figma-rest-request.v1',
      fileKey: 'File123',
      version: fixture.version,
      nodeIds: ['1:2'],
      includeVariables: false,
    };
    scope = payload.nodeIds;
    parserVersion = 'figma-rest-1';
  } else {
    payload = {
      schemaVersion: WEBSITE_REQUEST_VERSION,
      url: pageUrl,
      selector: '#brand',
      viewport: { width: 640, height: 480 },
      colorScheme: 'light',
      excludedSelectors: [],
      includedIncidentalSelectors: [],
    };
    scope = [payload.selector];
    parserVersion = 'website-capture-1';
  }
  return {
    schemaVersion: INTAKE_VERSION,
    profileId: profile.id,
    profileVersion: profile.version,
    kind: profile.kind,
    binding: {
      workspaceId: `mixed-${index}`,
      sourceRevision: profile.kind === 'pdf' ? payload.source.digest : intakeHash(payload),
    },
    captureHash: intakeHash(payload),
    scope,
    parserVersion,
    payload,
    consent: {
      destination: profile.destination,
      policyVersion: profile.consentPolicyVersion,
      evidenceHash: intakeHash(payload),
    },
  };
}
try {
  receipt.scriptSha256 = createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex');
  await start();
  for (const owner of ['alice', 'bob']) {
    const url = new URL(connections.begin(owner, false).authorizationUrl);
    await connections.finish(
      owner,
      new URLSearchParams({ state: url.searchParams.get('state'), code: `synthetic-${owner}` }),
      new AbortController().signal
    );
  }
  const profiles = (await api('alice', '/profiles')).body.profiles;
  assert.equal(profiles.length, 3);
  const jobs = [];
  for (let batch = 0; batch < 5; batch++) {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, async (_, position) => {
        const index = batch * 6 + position,
          owner = position % 2 ? 'bob' : 'alice',
          profile = profiles[index % 3];
        const started = performance.now(),
          input = submission(profile, index);
        const submitted = await api(owner, '/jobs', 'POST', input);
        assert.equal(submitted.status, 202);
        const id = submitted.body.job.id;
        const result = await until(
          async signal => {
            const result = await api(owner, `/jobs/${id}/result`, 'GET', undefined, signal);
            if (result.status !== 200) {
              const state = await api(owner, `/jobs/${id}`, 'GET', undefined, signal);
              if (['failed', 'cancelled', 'expired'].includes(state.body.job.status))
                throw new Error(`${profile.kind}: ${state.body.job.failureCode}`);
            }
            return result;
          },
          result => result.status === 200
        );
        assert.equal((await api(owner === 'alice' ? 'bob' : 'alice', `/jobs/${id}`)).status, 404);
        jobs.push({ owner, id, input, result: result.body });
        receipt.timingsMs.push(performance.now() - started);
      })
    );
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) throw new Error(failures.map(result => String(result.reason)).join('; '));
  }
  assert.deepEqual(calls, { pdf: 10, figma: 10, website: 10 });
  receipt.checks.push(
    'Thirty mixed jobs use all three real processor implementations through startIntakeHost; two owners remain isolated.'
  );
  const before = { ...calls };
  await host.stop();
  host = null;
  await start();
  for (const job of jobs) {
    assert.deepEqual((await api(job.owner, `/jobs/${job.id}/result`)).body, job.result);
    assert.equal((await api(job.owner, '/jobs', 'POST', job.input)).body.reused, true);
  }
  assert.deepEqual(calls, before);
  receipt.checks.push(
    'Restart preserves exact results and request deduplication without another processor call.'
  );
  hold = 'pdf';
  const pdfProfile = profiles.find(p => p.kind === 'pdf');
  const waiting = [];
  for (let index = 0; index < 12; index++) {
    const submitted = await api(
      'saturation',
      '/jobs',
      'POST',
      submission(pdfProfile, `held-${index}`)
    );
    assert.equal(submitted.status, 202);
    waiting.push(submitted.body.job.id);
    if (index < 2)
      await until(
        async () => heldCalls,
        count => count >= index + 1
      );
  }
  assert.equal(
    (await api('saturation', '/jobs', 'POST', submission(pdfProfile, 'overflow'))).status,
    429
  );
  assert.equal(heldCalls, 2);
  for (const id of waiting)
    assert.equal((await api('saturation', `/jobs/${id}/cancel`, 'POST')).status, 200);
  hold = null;
  for (const id of waiting)
    assert.equal((await api('saturation', `/jobs/${id}`)).body.job.status, 'cancelled');
  receipt.checks.push(
    'Two active and ten queued jobs saturate the owner queue; extra submission is refused and cancellation retains terminal state.'
  );
  hold = 'figma';
  const heldBefore = heldCalls;
  const interrupted = await api(
    'bob',
    '/jobs',
    'POST',
    submission(
      profiles.find(p => p.kind === 'figma'),
      'disconnect'
    )
  );
  assert.equal(interrupted.status, 202);
  await until(
    async () => heldCalls,
    count => count > heldBefore
  );
  assert.equal((await api('bob', '/figma/connection', 'DELETE')).status, 200);
  await until(
    signal => api('bob', `/jobs/${interrupted.body.job.id}`, 'GET', undefined, signal),
    result => result.body.job.status === 'failed'
  );
  hold = null;
  assert.notEqual((await api('bob', `/jobs/${interrupted.body.job.id}/result`)).status, 200);
  receipt.checks.push(
    'Disconnecting Figma aborts its active lease and cannot publish a late capture.'
  );
  for (const job of jobs)
    assert.equal((await api(job.owner, `/jobs/${job.id}`, 'DELETE')).status, 200);
  await host.stop();
  host = null;
  const maintained = await operateIntakeState(options, ['maintain']);
  assert.equal(maintained.cleanup.pending, 0);
  await operateIntakeState(options, ['disable', pdfProfile.id, 'SYNTHETIC_DRILL']);
  await start();
  assert.equal(
    (await api('alice', '/jobs', 'POST', submission(pdfProfile, 'disabled'))).status,
    409
  );
  assert.equal((await api('alice', `/jobs/${jobs[0].id}/result`)).status, 404);
  await host.stop();
  host = null;
  await operateIntakeState(options, ['enable', pdfProfile.id, '--reconciled']);
  receipt.checks.push(
    'Deletion, offline maintenance and persistent processor disable work across restarts; re-enable requires explicit reconciliation.'
  );
  receipt.cost = 'Synthetic token pricing only; not provider billing or live cost qualification.';
  receipt.memory = process.memoryUsage();
  receipt.calls = calls;
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.errors.push(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  receipt.calls = calls;
  let stopped = false;
  try {
    await host?.stop();
    stopped = true;
  } catch (error) {
    receipt.errors.push(`Host cleanup: ${error.message}`);
  }
  for (const process of processes)
    await process.kill().catch(error => receipt.errors.push(`Renderer cleanup: ${error.message}`));
  if (stopped)
    await rm(directory, { recursive: true, force: true }).catch(error =>
      receipt.errors.push(`Fixture cleanup: ${error.message}`)
    );
  if (receipt.errors.length) {
    receipt.status = 'failed';
    process.exitCode = 1;
  }
  await writeFile(
    path.join(output, `${runtime}-checks.json`),
    JSON.stringify(receipt, null, 2) + '\n'
  );
  console.log(JSON.stringify(receipt, null, 2));
}
