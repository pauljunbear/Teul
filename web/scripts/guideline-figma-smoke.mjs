import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { IntakeService, intakeHash } from '../../services/guideline-intake/dist/service.js';
import { IntakeJobStore } from '../../services/guideline-intake/dist/store.js';
import { SealedAssetStore } from '../../services/guideline-intake/dist/assets.js';
import { createIntakeHttpServer } from '../../services/guideline-intake/dist/http.js';
import { FigmaConnectionStore } from '../../services/guideline-intake/dist/figmaConnectionStore.js';
import {
  FigmaConnections,
  figmaOAuthBinding,
} from '../../services/guideline-intake/dist/figmaConnection.js';
import {
  FigmaReadClient,
  createFigmaCaptureProcessor,
} from '../../services/guideline-intake/dist/figmaRead.js';

// Actual browser/session/HTTP/job/credential modules; synthetic Figma transport only.
const fixture = JSON.parse(await readFile('fixtures/guidelines/figma-native.json', 'utf8'));
const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'teul-figma-browser-')));
const output = path.resolve('../release/guideline-figma');
await mkdir(output, { recursive: true });
const runtime = `node${process.versions.node.split('.')[0]}`;
const checks = [],
  failures = [],
  requests = [],
  providerRequests = [],
  submissions = [];
let api,
  service,
  connections,
  connectionStore,
  jobStore,
  browser,
  page,
  authenticated = true,
  behavior = 'valid',
  revision = fixture.version,
  dropSubmission = false,
  releaseCompletion = null;
const key = new Uint8Array(32).fill(41),
  ownerKey = new Uint8Array(32).fill(42);
const server = await createServer({
  mode: 'guideline-proof',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  plugins: [
    {
      name: 'synthetic-figma-http',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (!request.url?.startsWith('/api/guideline-intake')) return next();
          requests.push({ method: request.method, path: request.url.split('?')[0] });
          if (request.url.endsWith('/cancel') && releaseCompletion) {
            releaseCompletion();
            releaseCompletion = null;
            void service.idle().then(() => api.emit('request', request, response));
            return;
          }
          if (dropSubmission && request.method === 'POST' && request.url.endsWith('/jobs')) {
            dropSubmission = false;
            response.end = () => {
              response.flushHeaders();
              response.write('{"job":');
              setImmediate(() => response.destroy());
              return response;
            };
          }
          api.emit('request', request, response);
        });
      },
    },
  ],
});
await server.listen();
const url = server.resolvedUrls.local[0],
  origin = new URL(url).origin;
const config = {
  clientId: 'synthetic-browser-client',
  clientSecret: 'synthetic-browser-secret',
  callbackUrl: `${origin}/api/guideline-intake/figma/callback`,
  returnUrl: url,
  allowVariables: true,
};
const transport = async (raw, options) => {
  const endpoint = new URL(raw);
  providerRequests.push(endpoint.pathname);
  if (endpoint.pathname === '/v1/oauth/token')
    return Response.json({
      access_token: 'synthetic-access',
      refresh_token: 'synthetic-refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user_id_string: '123456',
    });
  if (endpoint.pathname.endsWith('/variables/local'))
    return Response.json({
      error: false,
      meta: {
        variables: {
          'VariableID:1': {
            id: 'VariableID:1',
            name: 'Harbor',
            variableCollectionId: 'Collection:1',
            resolvedType: 'COLOR',
            valuesByMode: { 'mode-a': { r: 0.123456789012345, g: 0.6, b: 0.7, a: 0.8 } },
          },
        },
        variableCollections: {
          'Collection:1': {
            id: 'Collection:1',
            name: 'Brand',
            defaultModeId: 'mode-a',
            modes: [{ modeId: 'mode-a', name: 'Light' }],
          },
        },
      },
    });
  if (endpoint.pathname.endsWith('/nodes')) {
    if (behavior === 'denied') return new Response('private', { status: 403 });
    if (behavior === 'slow' || behavior === 'complete-at-cancel')
      await new Promise((resolve, reject) => {
        const abort = () => reject(new Error('aborted'));
        options.signal.addEventListener('abort', abort, { once: true });
        if (behavior === 'complete-at-cancel')
          releaseCompletion = () => {
            options.signal.removeEventListener('abort', abort);
            resolve();
          };
        if (options.signal.aborted) reject(new Error('aborted'));
      });
    const result = structuredClone(fixture);
    result.version = revision;
    return Response.json(result);
  }
  return Response.json({
    name: fixture.name,
    version: revision,
    document: {
      type: 'DOCUMENT',
      children: [
        {
          id: '0:1',
          name: 'Guidelines',
          type: 'CANVAS',
          children: [{ id: '1:2', name: 'Brand colors', type: 'FRAME' }],
        },
      ],
    },
  });
};
try {
  connectionStore = new FigmaConnectionStore({
    directory: path.join(directory, 'connections'),
    key,
    appBinding: figmaOAuthBinding(config),
  });
  connections = new FigmaConnections({
    config,
    store: connectionStore,
    ownerKey,
    fetch: transport,
  });
  jobStore = new IntakeJobStore(path.join(directory, 'jobs.sqlite'), { now: Date.now });
  const processor = createFigmaCaptureProcessor({
    client: new FigmaReadClient({ fetch: transport }),
    connection: (owner, signal) => connections.lease(owner, signal),
  });
  service = new IntakeService({
    store: jobStore,
    assets: new SealedAssetStore({ directory: path.join(directory, 'assets'), key }),
    ownerKey,
    processors: [processor],
  });
  const submit = service.submit.bind(service);
  service.submit = async (...args) => {
    const result = await submit(...args);
    submissions.push(result.job.id);
    return result;
  };
  api = createIntakeHttpServer({
    api: service,
    figma: connections,
    allowedOrigins: [origin],
    authenticate: async request =>
      authenticated && request.headers.cookie?.includes('synthetic-session=alice')
        ? 'browser-alice'
        : null,
  });
  service.start();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  await context.addCookies([{ name: 'synthetic-session', value: 'alice', url }]);
  await context.route('**/*', route =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort()
  );
  page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  const panel = () => page.getByRole('region', { name: 'Figma guideline capture', exact: true });
  const button = name => panel().getByRole('button', { name, exact: true });
  const load = async () => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
    await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
    await page.getByText('Managed Figma connection', { exact: true }).click();
  };
  await load();
  expect(requests).toHaveLength(0);
  authenticated = false;
  await button('Check connection').click();
  await expect(panel().getByRole('alert')).toContainText('Sign in');
  await expect(page.getByLabel('Choose guideline PDF')).toBeEnabled();
  authenticated = true;
  checks.push('No ambient service/provider requests; missing session leaves PDF fallback enabled');
  await button('Check connection').click();
  await expect(button('Connect Figma')).toBeVisible();
  await panel()
    .getByRole('checkbox', { name: /Include related variables/ })
    .check();
  await button('Connect Figma').click();
  const link = panel().getByRole('link', { name: 'Authorize Figma in your browser' });
  await expect(link).toBeVisible();
  const authorization = new URL(await link.getAttribute('href'));
  expect(authorization.searchParams.get('scope')).toBe('file_content:read file_variables:read');
  await page.goto(
    `${config.callbackUrl}?state=${encodeURIComponent(authorization.searchParams.get('state'))}&code=synthetic-code`
  );
  expect(new URL(page.url()).searchParams.get('figma')).toBe('connected');
  expect(page.url()).not.toContain('state=');
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await page.getByText('Managed Figma connection', { exact: true }).click();
  await button('Check connection').click();
  await expect(panel().getByLabel('Figma file or frame link')).toBeVisible();
  checks.push(
    'PKCE browser link and authenticated cookie callback connect the real server manager without exposing credentials'
  );
  const discover = async () => {
    await panel()
      .getByLabel('Figma file or frame link')
      .fill('https://www.figma.com/design/ABC/Guide?node-id=1-2');
    await button('Find frames').click();
    await expect(button('Read selected frames')).toBeEnabled();
  };
  await discover();
  expect(providerRequests.filter(value => value.endsWith('/nodes'))).toHaveLength(0);
  const acceptUpdate = async () => {
    await expect(button('Keep current source')).toBeVisible();
    if (await button('Review captured colors').count())
      await button('Review captured colors').click();
    await button('Compare updated capture').click();
    await button('Save current project and accept update').click();
    await expect(button('Keep current source')).toHaveCount(0);
  };
  await button('Read selected frames').click();
  await expect(panel().getByRole('region', { name: 'Captured Figma evidence' })).toBeVisible();
  await expect(panel()).toContainText('4 native nodes');
  await expect(panel()).toContainText('Do not use gradients. <img src=x');
  expect(await panel().locator('img').count()).toBe(0);
  await expect(panel()).toContainText('source color profile is unverified');
  await panel().getByText('Native paint properties', { exact: true }).first().click();
  await expect(panel().locator('pre').first()).toContainText('0.123456789012345');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    button('Download Figma capture').click(),
  ]);
  const saved = await readFile(await download.path(), 'utf8'),
    packet = JSON.parse(saved);
  const { contentHash, ...content } = packet;
  expect(contentHash).toBe(intakeHash(content));
  expect(packet.variables.relationship).toBe('unversioned-current-read');
  expect(saved).not.toContain('synthetic-access');
  expect(packet.roots[0].document.children[0].fills[0].color.r).toBe(0.123456789012345);
  await writeFile(path.join(output, `${runtime}-capture.json`), saved);
  checks.push(
    'Explicit selection dispatches one native job; full-precision paints, gradients, text, modes and gaps survive download; source text stays inert'
  );
  await page.screenshot({ path: path.join(output, `${runtime}-capture.png`), fullPage: true });
  revision = 'revision-lost-response';
  await discover();
  dropSubmission = true;
  await button('Read selected frames').click();
  await expect(panel().getByRole('alert')).toContainText('may have reached');
  const submittedBeforeRecovery = submissions.length;
  const lostJob = submissions.at(-1);
  authenticated = false;
  await button('Check capture').click();
  await expect(panel().getByRole('alert')).toContainText('Sign in');
  await expect(button('Check capture')).toBeEnabled();
  authenticated = true;
  await button('Check capture').click();
  await expect(button('Keep current source')).toBeVisible();
  await acceptUpdate();
  await expect(panel()).toContainText('Node revision revision-lost-response');
  expect(submissions).toHaveLength(submittedBeforeRecovery);
  expect(submissions.at(-1)).toBe(lostJob);
  expect(requests.filter(item => item.path.endsWith('/jobs/lookup')).length).toBeGreaterThan(0);
  checks.push(
    'Lost submission response retains its recovery record through a later 401 and reconciles the exact existing job after an explicit Check capture action'
  );
  const callsBeforeReload = providerRequests.length;
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await page.getByText('Managed Figma connection', { exact: true }).click();
  await panel().getByText('Saved Figma requests', { exact: true }).click();
  const savedRequests = panel().locator('.guideline-recovery');
  await savedRequests.getByRole('button', { name: 'Check saved requests', exact: true }).click();
  await savedRequests
    .getByRole('button', { name: 'Open saved request', exact: true })
    .first()
    .click();
  await expect(panel()).toContainText('Node revision revision-lost-response');
  expect(submissions).toHaveLength(submittedBeforeRecovery);
  expect(providerRequests).toHaveLength(callsBeforeReload);
  checks.push(
    'Completed native capture reopens after reload using the saved job, without rediscovery, submission, or another Figma API request.'
  );
  await button('Check connection').click();
  behavior = 'denied';
  revision = 'revision-denied';
  await discover();
  await button('Read selected frames').click();
  await expect(panel().getByRole('alert')).toContainText('cannot read that file');
  await expect(panel()).toContainText('Node revision revision-lost-response');
  checks.push(
    'File access failure retains prior capture and allows recovery without substituting empty evidence'
  );
  behavior = 'slow';
  revision = 'revision-slow';
  await discover();
  const before = providerRequests.filter(value => value.endsWith('/nodes')).length;
  await button('Read selected frames').click();
  await expect
    .poll(() => providerRequests.filter(value => value.endsWith('/nodes')).length)
    .toBe(before + 1);
  await button('Cancel Figma request').click();
  await expect(panel()).toContainText('Capture cancelled');
  await expect(panel()).toContainText('Node revision revision-lost-response');
  behavior = 'valid';
  checks.push('Cancel reaches the owned server job and retains the previous completed capture');
  revision = 'revision-admission';
  await discover();
  authenticated = false;
  await button('Read selected frames').click();
  await expect(panel().getByRole('alert')).toContainText('Sign in');
  await expect(button('Check connection')).toBeEnabled();
  await expect(panel().getByLabel('Open Figma capture')).toBeEnabled();
  authenticated = true;
  jobStore.disableProvider('figma-native-capture', 'SYNTHETIC_TEST');
  await button('Read selected frames').click();
  await expect(panel().getByRole('alert')).toContainText('disabled Figma capture');
  await expect(button('Disconnect Figma')).toBeEnabled();
  jobStore.enableProvider('figma-native-capture');
  checks.push(
    'Confirmed authentication and disabled-processor rejections release pending state and leave recovery controls enabled'
  );
  behavior = 'complete-at-cancel';
  revision = 'revision-completion-race';
  await discover();
  const callsBeforeRace = providerRequests.filter(value => value.endsWith('/nodes')).length;
  await button('Read selected frames').click();
  await expect
    .poll(() => providerRequests.filter(value => value.endsWith('/nodes')).length)
    .toBe(callsBeforeRace + 1);
  await button('Cancel Figma request').click();
  await expect(panel()).toContainText('finished before cancellation');
  await button('Check capture').click();
  await acceptUpdate();
  await expect(panel()).toContainText('Node revision revision-completion-race');
  behavior = 'valid';
  checks.push(
    'Completion winning cancellation remains recoverable and is never reported as cancelled'
  );
  revision = 'revision-deleted-recovery';
  await discover();
  await page.route('**/api/guideline-intake/jobs', async route => {
    const response = await route.fetch();
    const { job } = await response.json();
    await service.remove('browser-alice', job.id);
    await route.abort('failed');
  });
  await button('Read selected frames').click();
  await expect(button('Check capture')).toBeVisible();
  await page.unroute('**/api/guideline-intake/jobs');
  const beforeDeletedRecovery = submissions.length;
  await button('Check capture').click();
  await expect(panel().getByRole('alert')).toContainText('no longer available');
  await expect(button('Read selected frames')).toBeEnabled();
  await expect(button('Check capture')).toHaveCount(0);
  expect(submissions).toHaveLength(beforeDeletedRecovery);
  await expect(panel()).toContainText('Node revision revision-completion-race');
  checks.push(
    'Deleted unknown capture releases controls without another submission or replacing prior evidence.'
  );
  await button('Disconnect Figma').click();
  await expect(panel()).toContainText('Disconnected from Studio');
  await load();
  const requestsBefore = requests.length;
  await panel()
    .getByLabel('Open Figma capture')
    .setInputFiles({
      name: 'saved-capture.json',
      mimeType: 'application/json',
      buffer: Buffer.from(saved),
    });
  await expect(panel()).toContainText('Opened a saved capture offline');
  expect(requests).toHaveLength(requestsBefore);
  const conflicting = JSON.parse(saved);
  conflicting.roots[0].document.children.push({
    ...conflicting.roots[0].document.children[1],
    characters: 'Conflicting source restriction',
  });
  conflicting.contentHash = intakeHash((({ contentHash: _, ...rest }) => rest)(conflicting));
  await panel()
    .getByLabel('Open Figma capture')
    .setInputFiles({
      name: 'conflicting.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(conflicting)),
    });
  await expect(panel().getByRole('alert')).toContainText('FIGMA_CONFLICTING_NODE');
  await expect(panel()).toContainText('Do not use gradients. <img src=x');
  checks.push(
    'Offline packet with a valid hash but conflicting repeated node identity is rejected without hiding a source restriction'
  );
  await load();
  const large = JSON.parse(saved);
  large.roots[0].document.children[1].characters = 'x'.repeat(6000) + 'END OF SOURCE TEXT';
  large.gaps = Array.from({ length: 1000 }, (_, index) => ({
    scope: `node:${index}`,
    code: 'FIGMA_PROFILE_UNVERIFIED',
    retryAfterSeconds: null,
  }));
  large.contentHash = intakeHash((({ contentHash: _, ...rest }) => rest)(large));
  await panel()
    .getByLabel('Open Figma capture')
    .setInputFiles({
      name: 'large.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(large)),
    });
  await expect(panel()).toContainText('Characters 1–2048 of 6018');
  expect((await panel().innerText()).length).toBeLessThan(12000);
  await button('Next text').click();
  await button('Next text').click();
  await expect(panel()).toContainText('END OF SOURCE TEXT');
  await panel().getByText('1000 source gaps', { exact: true }).click();
  expect((await panel().innerText()).length).toBeLessThan(28000);
  await panel().getByText('Saved Figma requests', { exact: true }).click();
  const recoveryList = panel().locator('.guideline-recovery');
  await recoveryList.getByRole('button', { name: 'Check saved requests', exact: true }).click();
  let releaseResult;
  await page.route('**/api/guideline-intake/jobs/*/result', async route => {
    const response = await route.fetch();
    await new Promise(resolve => {
      releaseResult = resolve;
    });
    await route.fulfill({ response });
  });
  await recoveryList
    .getByRole('button', { name: 'Open saved request', exact: true })
    .last()
    .click();
  await expect.poll(() => typeof releaseResult).toBe('function');
  const otherTab = await context.newPage();
  await otherTab.goto(url);
  await otherTab.evaluate(async () => {
    const { guidelineRecoveryStore: store } = await import('/src/lib/guideline/recoveryStore.ts');
    const { GuidelineIntakeClient } = await import('/src/lib/guideline/intakeClient.ts');
    const { ownerBinding } = await new GuidelineIntakeClient().session();
    const records = await store.list(ownerBinding);
    await store.remove(ownerBinding, records.at(-1).reference);
  });
  releaseResult();
  await expect(panel().getByRole('alert')).toContainText('changed in another tab');
  await expect(panel()).toContainText('END OF SOURCE TEXT');
  await expect(
    recoveryList.getByRole('button', { name: 'Check saved requests', exact: true })
  ).toBeEnabled();
  await page.unroute('**/api/guideline-intake/jobs/*/result');
  await otherTab.close();
  checks.push(
    'Deleting a saved capture in another tab while its result is arriving prevents stale publication and releases recovery controls.'
  );
  await panel()
    .getByLabel('Open Figma capture')
    .setInputFiles({
      name: 'saved-capture.json',
      mimeType: 'application/json',
      buffer: Buffer.from(saved),
    });
  await acceptUpdate();
  await expect(panel()).toContainText('Do not use gradients. <img src=x');
  checks.push(
    'Large source text is paged and gap/property previews are bounded; complete source data remains in the packet'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await button('Check connection').focus();
  await page.keyboard.press('Enter');
  await expect(button('Connect Figma')).toBeVisible();
  await page.screenshot({ path: path.join(output, `${runtime}-mobile.png`), fullPage: true });
  checks.push(
    'Disconnect preserves portable evidence; offline reopen makes no request; 390px viewport and keyboard connection control work'
  );
  expect(failures).toEqual([]);
} catch (error) {
  if (page) {
    await writeFile(
      path.join(output, `${runtime}-failure.txt`),
      await page.locator('body').innerText()
    );
    await page.screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true });
  }
  failures.push(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await service?.stop();
  await connections?.close();
  await server.close();
  jobStore?.close();
  connectionStore?.close();
  await rm(directory, { recursive: true, force: true });
  await writeFile(
    path.join(output, `${runtime}-receipt.json`),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        node: process.version,
        status: failures.length ? 'failed' : 'passed',
        checks,
        failures,
        providerRequests: providerRequests.length,
        boundary:
          'Synthetic Figma transport, actual local browser/HTTP/session/job modules; no live OAuth app or deployment',
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ checks: checks.length, failures, output }));
}
