import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { guidelineProjectView } from './guideline-project-view.mjs';
import { assertGradientReplay } from './assert-gradient-replay.mjs';
import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, preview } from 'vite';
import { IntakeService } from '../../services/guideline-intake/dist/service.js';
import { IntakeJobStore } from '../../services/guideline-intake/dist/store.js';
import { SealedAssetStore } from '../../services/guideline-intake/dist/assets.js';
import { createIntakeHttpServer } from '../../services/guideline-intake/dist/http.js';
import { createWebsiteCaptureProcessor } from '../../services/guideline-intake/dist/websiteCapture.js';
import { IntakeError } from '../../services/guideline-intake/dist/protocol.js';

// Real local capture/service/browser modules with authored HTML only; no live website or host qualification.
const fixtureUrl = 'https://fixture.example/brand';
const html = Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><style>
:root{--accent:#2146ff;--link:#2146ff;--ink:#141e28}body{margin:24px;background:#fff;color:var(--ink);font:16px sans-serif}button{background:var(--accent);color:white;padding:12px;border:0}</style></head><body><main id="brand"><h1>Fixture colors</h1><p>Do not use gradients in product.</p><button>Continue</button></main></body></html>`);
const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'teul-website-browser-')));
const output = path.resolve('../release/guideline-website-review');
await mkdir(output, { recursive: true });
const runtime = `node${process.versions.node.split('.')[0]}`;
const checks = [],
  failures = [],
  requests = [],
  outbound = [],
  replayDifferences = [],
  jobs = [],
  artifacts = [];
const processes = new Set();
let api,
  production,
  service,
  store,
  browser,
  page,
  authenticated = true,
  drop = false,
  hold = false;
let releaseHeld;
const key = new Uint8Array(32).fill(39);
function attachFixtureApi(vite) {
  vite.middlewares.use((request, response, next) => {
    if (!request.url?.startsWith('/api/guideline-intake')) return next();
    requests.push({ method: request.method, path: request.url });
    if (drop && request.method === 'POST' && request.url.endsWith('/jobs')) {
      drop = false;
      response.end = () => {
        response.flushHeaders();
        response.write('{"job":');
        setImmediate(() => response.destroy());
        return response;
      };
    }
    api.emit('request', request, response);
  });
}
const server = await createServer({
  mode: 'guideline-proof',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  plugins: [{ name: 'website-proof-service', configureServer: attachFixtureApi }],
});
const save = async (name, contents) => {
  const file = `${runtime}-${name}`;
  await writeFile(path.join(output, file), contents);
  artifacts.push({ file, sha256: createHash('sha256').update(contents).digest('hex') });
};
try {
  await server.listen();
  production = await preview({
    plugins: [{ name: 'website-proof-service', configurePreviewServer: attachFixtureApi }],
    preview: {
      host: '127.0.0.1',
      port: 0,
      strictPort: true,
    },
  });
  const url = production.resolvedUrls.local[0],
    origin = new URL(url).origin;
  const processor = createWebsiteCaptureProcessor({
    network: () => ({
      async get(target, signal) {
        signal.throwIfAborted();
        if (target !== fixtureUrl) throw new IntakeError('UNEXPECTED_FIXTURE_URL');
        if (hold)
          await new Promise((resolve, reject) => {
            const abort = () => reject(new IntakeError('WEBSITE_CAPTURE_ABORTED'));
            releaseHeld = () => {
              signal.removeEventListener('abort', abort);
              resolve();
            };
            signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) abort();
          });
        return {
          url: target,
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
          body: html,
        };
      },
    }),
    async launch(signal) {
      signal.throwIfAborted();
      const instance = await chromium.launchServer({
        headless: true,
        host: '127.0.0.1',
        args: [
          '--disable-background-networking',
          '--no-proxy-server',
          '--host-resolver-rules=MAP * ~NOTFOUND',
        ],
        ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
      });
      processes.add(instance);
      try {
        return {
          browser: await chromium.connect(instance.wsEndpoint()),
          terminate: () => instance.process().kill('SIGKILL'),
        };
      } catch (error) {
        await instance.kill();
        throw error;
      }
    },
  });
  store = new IntakeJobStore(path.join(directory, 'jobs.sqlite'), { now: Date.now });
  service = new IntakeService({
    store,
    assets: new SealedAssetStore({ directory: path.join(directory, 'assets'), key }),
    ownerKey: key,
    processors: [processor],
  });
  const submit = service.submit.bind(service);
  service.submit = async (...args) => {
    const result = await submit(...args);
    jobs.push(result.job.id);
    return result;
  };
  api = createIntakeHttpServer({
    api: service,
    allowedOrigins: [origin],
    authenticate: async request =>
      authenticated && request.headers.cookie?.includes('fixture-session=alice')
        ? 'website-proof-alice'
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
  await context.addCookies([{ name: 'fixture-session', value: 'alice', url }]);
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    outbound.push(route.request().url());
    return route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => failures.push(error.message));
  const panel = () => page.getByRole('region', { name: 'Website guideline capture', exact: true });
  const button = name => panel().getByRole('button', { name, exact: true });
  let nextDownloadAt = 0;
  const download = async (scope, name) => {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextDownloadAt - Date.now())));
    nextDownloadAt = Date.now() + 200;
    const [artifact] = await Promise.all([
      page.waitForEvent('download'),
      scope.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await artifact.path(), 'utf8');
  };
  const open = value =>
    panel()
      .getByLabel('Open website capture', { exact: true })
      .setInputFiles({
        name: 'website-project.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(value)),
      });
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .locator('summary')
    .filter({ hasText: /^Read a website/ })
    .click();
  expect(requests).toHaveLength(0);
  authenticated = false;
  await button('Check website capture service').click();
  await expect(panel().getByRole('alert')).toContainText('Sign in');
  authenticated = true;
  await button('Check website capture service').click();
  await panel().getByLabel('Public website URL', { exact: true }).fill(fixtureUrl);
  await panel().locator('summary').filter({ hasText: 'Capture scope' }).click();
  await panel().getByLabel('Region selector', { exact: true }).fill('#brand');
  await button('Capture website').click();
  await expect(button('Download Website capture')).toBeVisible();
  const captured = JSON.parse(await download(panel(), 'Download Website capture'));
  expect(captured.request.url).toBe(fixtureUrl);
  expect(captured.request.selector).toBe('#brand');
  expect(captured.request.viewport).toEqual({ width: 1280, height: 800 });
  expect(captured.customProperties.some(item => item.name === '--link')).toBe(true);
  checks.push(
    'Explicit host/session check and capture produce rendered evidence through the real owned job service; no ambient requests or user browser credentials.'
  );
  await button('Review captured colors').focus();
  await button('Review captured colors').press('Enter');
  const candidates = panel().locator('.guideline-native-candidates');
  for (const name of ['--accent', '--ink']) {
    await panel().getByLabel('Find a captured color', { exact: true }).fill(name);
    await candidates.getByRole('checkbox').first().check();
  }
  await panel()
    .getByRole('checkbox', { name: /Observed light preference/ })
    .check();
  expect(
    await panel()
      .getByRole('checkbox', { name: /Use the recorded channels/ })
      .count()
  ).toBe(0);
  const colors = panel().locator('.guideline-native-color');
  for (const [index, label] of ['Accent', 'Ink'].entries()) {
    await colors.nth(index).getByLabel('Color name', { exact: true }).fill(label);
    await colors.nth(index).getByLabel('Family', { exact: true }).fill('Working');
  }
  const apply = button('Apply Website review');
  await apply.click();
  await expect(panel().getByRole('alert')).toContainText(/scope/i);
  await panel()
    .getByRole('checkbox', { name: /I reviewed this partial source scope/ })
    .check();
  await panel()
    .getByLabel('Why this scope is sufficient', { exact: true })
    .fill('Selected synthetic guideline region; observed values, no corporate approval.');
  await apply.click();
  await chooseGuidelineTask(panel(), 'gradient');
  const gradient = panel().getByRole('region', { name: 'Mode-aware gradient editor', exact: true });
  await expect(gradient.getByRole('button', { name: 'Make gradient', exact: true })).toBeDisabled();
  for (const statement of await panel().locator('.guideline-statement-group').all()) {
    const restriction = (await statement.locator('blockquote').innerText()).includes(
      'Do not use gradients'
    );
    await statement
      .getByLabel('Website statement meaning', { exact: true })
      .selectOption(restriction ? 'no-gradients' : 'not-a-rule');
    await statement
      .getByLabel('Reason or qualification', { exact: true })
      .fill(
        restriction
          ? 'Retain the stated restriction for product use.'
          : 'A label in this synthetic source.'
      );
    if (restriction)
      await statement.getByLabel('Website statement use', { exact: true }).selectOption('product');
  }
  await panel().getByRole('button', { name: 'Add scale', exact: true }).click();
  const scale = panel().locator('.guideline-source-scale');
  await scale.getByLabel('Scale name', { exact: true }).fill('Working');
  await scale.getByLabel('Color family', { exact: true }).selectOption('Working');
  for (const [index, label] of ['Accent', 'Ink'].entries()) {
    await scale.getByRole('button', { name: 'Add slot', exact: true }).click();
    const slot = scale.locator('.guideline-scale-slot').nth(index);
    await slot.getByLabel('Slot name', { exact: true }).fill(index ? '900' : '100');
    await slot.getByLabel('Position', { exact: true }).fill(index ? '2' : '0');
    const source = slot.getByLabel('Source color', { exact: true });
    await source.selectOption(
      await source
        .locator('option')
        .filter({ hasText: new RegExp(`^${label}`) })
        .getAttribute('value')
    );
  }
  await apply.click();
  await chooseGuidelineTask(panel(), 'extension');
  const extension = panel().getByRole('region', { name: 'Source scale extension', exact: true });
  await extension.getByLabel('New shade 1 name', { exact: true }).fill('500');
  await extension.getByLabel('New shade 1 position', { exact: true }).fill('1');
  await extension.getByRole('button', { name: 'Preview extension', exact: true }).click();
  await expect(extension).toContainText(/1 (new|proposed|generated)/i);
  await chooseGuidelineTask(panel(), 'gradient');
  await gradient.getByRole('combobox', { name: /^Use/ }).selectOption('product');
  await expect(gradient.getByRole('button', { name: 'Make gradient', exact: true })).toBeDisabled();
  await gradient.getByRole('combobox', { name: /^Use/ }).selectOption('brand');
  await gradient.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  await expect(gradient).toContainText('Observed website CSS value');
  checks.push(
    'Keyboard review preserves named CSS observations, requires scope/text decisions, extends a source scale, and enforces the product gradient restriction.'
  );
  const exports = {};
  for (const format of ['SVG', 'CSS', 'JSON']) {
    exports[format] = await download(gradient, format);
    await save(`gradient.${format.toLowerCase()}`, exports[format]);
  }
  const projectText = await download(panel(), 'Save Website project'),
    workspace = JSON.parse(projectText),
    project = guidelineProjectView(workspace);
  expect(project.capture).toEqual(captured);
  expect(project.review.model.colors).toHaveLength(2);
  await save('project.json', projectText);
  await save('gradient.png', await gradient.screenshot());
  await save('desktop.png', await page.screenshot({ fullPage: true }));
  await colors.first().getByLabel('Color name', { exact: true }).fill('Changed');
  await expect(gradient).toHaveCount(0);
  const changed = JSON.parse(await download(panel(), 'Save Website project'));
  expect(changed.review).toBeNull();
  expect(changed.selection).toBeNull();
  const before = requests.length;
  await context.setOffline(true);
  await open(workspace);
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  for (const format of ['SVG', 'CSS', 'JSON'])
    expect(await download(gradient, format)).toBe(exports[format]);
  expect(await download(panel(), 'Save Website project')).toBe(projectText);
  await context.setOffline(false);
  expect(requests).toHaveLength(before);
  const { readAnyGuidelineProject } = await server.ssrLoadModule(
    '/src/lib/guideline/projectCodec.ts'
  );
  const { guidelineModeGradientExports, guidelineAuthoredGradientExports } =
    await server.ssrLoadModule('/src/lib/guideline/gradientExport.ts');
  const reopened = await readAnyGuidelineProject(projectText);
  expect(reopened.status).toBe('opened');
  expect(reopened.value.project).toEqual(JSON.parse(workspace.sourceProjectJson));
  const nodeExports = reopened.value.gradientSelection
    ? guidelineAuthoredGradientExports(
        reopened.value.project.review,
        reopened.value.gradientSelection
      )
    : guidelineModeGradientExports(reopened.value.project.review, reopened.value.project.selection);
  expect(nodeExports.svg).toBe(exports.SVG);
  expect(nodeExports.css).toBe(exports.CSS);
  replayDifferences.push(...assertGradientReplay(nodeExports.json, exports.JSON));
  await save('node-replayed-exports.json', JSON.stringify(nodeExports, null, 2));
  checks.push(
    'Changing decisions removes stale results; offline browser and Node reopen retain exact source/model/paint and SVG/CSS bytes. Browser JSON replays exactly; separately recomputed Node receipt bounds remain within the declared tolerance.'
  );
  const corrupt = structuredClone(reopened.value.project);
  corrupt.review.model.colors[0].label = 'Injected';
  await open(corrupt);
  await expect(panel().getByRole('alert')).toContainText(/differs/);
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  const future = { schemaVersion: 'teul.website-project.v999', untouched: 'future payload' };
  await open(future);
  await expect(panel()).toContainText('cannot edit teul.website-project.v999');
  expect(JSON.parse(await download(panel(), 'Download original website file'))).toEqual(future);
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  checks.push(
    'Invalid and future input retain the prior usable result; future original bytes remain downloadable.'
  );
  // Changed capture scope forces a new idempotency envelope; a lost response must recover that same job.
  await panel().getByLabel('Browser color preference', { exact: true }).selectOption('dark');
  drop = true;
  await button('Capture website').click();
  await expect(button('Check website capture')).toBeVisible();
  const submittedBeforeRecovery = jobs.length;
  const lostJob = jobs.at(-1);
  authenticated = false;
  await button('Check website capture').click();
  await expect(panel().getByRole('alert')).toContainText('Sign in');
  await expect(button('Check website capture')).toBeVisible();
  authenticated = true;
  await button('Check website capture').click();
  await expect(button('Capture website')).toBeEnabled();
  await expect(button('Check website capture')).toHaveCount(0);
  await expect(button('Keep current source')).toBeVisible();
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  await button('Compare updated capture').click();
  await button('Save current project and accept update').click();
  await expect(button('Keep current source')).toHaveCount(0);
  const recovered = JSON.parse(await download(panel(), 'Download Website capture'));
  expect(recovered.request.colorScheme).toBe('dark');
  expect(jobs).toHaveLength(submittedBeforeRecovery);
  expect(jobs.at(-1)).toBe(lostJob);
  expect(requests.filter(item => item.path.endsWith('/jobs/lookup')).length).toBeGreaterThan(0);
  checks.push(
    'Lost submission response and a later 401 retain the same recovery envelope; reconciliation returns the existing job without duplicate capture.'
  );
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .locator('summary')
    .filter({ hasText: /^Read a website/ })
    .click();
  await panel().getByText('Saved website requests', { exact: true }).click();
  const savedRequests = panel().locator('.guideline-recovery');
  await savedRequests.getByRole('button', { name: 'Check saved requests', exact: true }).click();
  await savedRequests
    .getByRole('button', { name: 'Open saved request', exact: true })
    .first()
    .click();
  await expect(button('Download Website capture')).toBeVisible();
  expect(JSON.parse(await download(panel(), 'Download Website capture'))).toEqual(recovered);
  expect(jobs).toHaveLength(submittedBeforeRecovery);
  checks.push(
    'Completed website capture reopens after reload without another submission or page capture.'
  );
  await button('Check website capture service').click();
  await panel().getByLabel('Public website URL', { exact: true }).fill(fixtureUrl);
  await panel().locator('summary').filter({ hasText: 'Capture scope' }).click();
  await panel().getByLabel('Region selector', { exact: true }).fill('#brand');
  await panel().getByLabel('Browser color preference', { exact: true }).selectOption('dark');
  hold = true;
  await panel().getByLabel('Viewport', { exact: true }).selectOption('390x844');
  await button('Capture website').click();
  await expect.poll(() => !!releaseHeld).toBe(true);
  await button('Cancel website request').click();
  await expect(
    panel()
      .getByRole('status')
      .filter({ hasText: /cancelled/i })
  ).toBeVisible();
  expect(JSON.parse(await download(panel(), 'Download Website capture'))).toEqual(recovered);
  hold = false;
  releaseHeld?.();
  checks.push('Cancellation reaches the owned job and retains the previous completed evidence.');
  await panel().getByLabel('Viewport', { exact: true }).selectOption('1280x800');
  const beforeDuplicate = jobs.length;
  await button('Capture website').click();
  await expect(panel().getByRole('alert')).toContainText('already saved');
  expect(jobs).toHaveLength(beforeDuplicate);
  await expect(button('Capture website')).toBeEnabled();
  checks.push(
    'Repeating the exact retained request directs the user to its saved copy without replacing it or submitting again.'
  );
  await panel().getByLabel('Region selector', { exact: true }).fill('body');
  await page.route('**/api/guideline-intake/jobs', async route => {
    const response = await route.fetch();
    const { job } = await response.json();
    await service.remove('website-proof-alice', job.id);
    await route.abort('failed');
  });
  await button('Capture website').click();
  await expect(button('Check website capture')).toBeVisible();
  await page.unroute('**/api/guideline-intake/jobs');
  const beforeDeletedRecovery = jobs.length;
  await button('Check website capture').click();
  await expect(panel().getByRole('alert')).toContainText('no longer available');
  await expect(button('Capture website')).toBeEnabled();
  await expect(button('Check website capture')).toHaveCount(0);
  expect(jobs).toHaveLength(beforeDeletedRecovery);
  expect(JSON.parse(await download(panel(), 'Download Website capture'))).toEqual(recovered);
  checks.push(
    'Deleted unknown submission releases capture controls without resubmitting or replacing prior evidence.'
  );
  await open(workspace);
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await gradient.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await save('mobile.png', await page.screenshot());
  const corePath = `/@fs/${path.resolve('../src/lib/colorSystemGradientV1.ts')}`;
  const valuesPath = `/@fs/${path.resolve('../src/lib/colorSystemSrgbValueV1.ts')}`;
  const core = await server.ssrLoadModule(corePath);
  const { buildColorSystemSrgbValueV1 } = await server.ssrLoadModule(valuesPath);
  let seed = 7183;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const recipes = Array.from({ length: 65 }, (_, index) => ({
    sourceModelHash: `sha256:${'1'.repeat(64)}`,
    briefHash: `sha256:${'2'.repeat(64)}`,
    angleDegrees: index * 5.1,
    route:
      index % 3
        ? { space: 'oklab' }
        : { space: 'oklch', huePath: index % 2 ? 'shorter' : 'longer' },
    stops: Array.from({ length: index % 5 === 0 ? 3 : 2 }, (_, stop) => {
      const count = index % 5 === 0 ? 3 : 2;
      const grey = random();
      const components =
        index < 6 ? { r: grey, g: grey, b: grey } : { r: random(), g: random(), b: random() };
      return {
        position: stop / (count - 1),
        value: buildColorSystemSrgbValueV1(components),
        sourceColorId: `source:${stop}`,
        locked: true,
      };
    }),
  }));
  const nodeDesigns = recipes.map(input => core.compileGradientV1(input));
  const comparisonContext = await browser.newContext();
  const comparisonOrigin = new URL(server.resolvedUrls.local[0]).origin;
  await comparisonContext.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/^https?:$/.test(url.protocol) && url.origin !== comparisonOrigin) {
      outbound.push(url.href);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const comparisonPage = await comparisonContext.newPage();
  comparisonPage.on('pageerror', error => failures.push(error.message));
  let browserProof;
  try {
    await comparisonPage.goto(server.resolvedUrls.local[0]);
    browserProof = await comparisonPage.evaluate(
      async ({ recipes, nodeDesigns, corePath }) => {
        const core = await import(corePath);
        return {
          designs: recipes.map(input => core.compileGradientV1(input)),
          replayed: nodeDesigns.map(design => {
            const saved = core.parseGradientV1(design);
            return {
              design: saved,
              css: core.gradientCssV1(saved),
              svg: core.gradientSvgV1(saved),
            };
          }),
        };
      },
      { recipes, nodeDesigns, corePath }
    );
  } finally {
    await comparisonContext.close();
  }
  let independentDifferences = 0;
  for (const [index, browserDesign] of browserProof.designs.entries()) {
    const parsed = core.parseGradientV1(browserDesign);
    expect(parsed).toEqual(browserDesign);
    expect(browserProof.replayed[index].design).toEqual(nodeDesigns[index]);
    expect(browserProof.replayed[index].css).toBe(core.gradientCssV1(nodeDesigns[index]));
    expect(browserProof.replayed[index].svg).toBe(core.gradientSvgV1(nodeDesigns[index]));
    if (nodeDesigns[index].designHash !== browserDesign.designHash) independentDifferences++;
  }
  await save(
    'gradient-portability.json',
    JSON.stringify(
      {
        recipes: 65,
        independentDifferences,
        node: process.version,
        browser: browser.version(),
        result: 'Both directions preserve original paint; CSS/SVG match for the same saved design.',
      },
      null,
      2
    )
  );
  checks.push(
    '65 gradient recipes replay in both Chromium/Node directions with exact saved values and matching CSS/SVG; independent generation hashes may differ.'
  );
  expect(outbound).toEqual([]);
  expect(failures).toEqual([]);
  checks.push(
    'Review and export fit a 390px viewport; no external requests or browser errors occurred.'
  );
} catch (error) {
  failures.push(error.stack ?? String(error));
  process.exitCode = 1;
  if (page) {
    await page
      .screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true })
      .catch(() => {});
    await writeFile(
      path.join(output, `${runtime}-failure.txt`),
      await page
        .locator('body')
        .innerText()
        .catch(() => 'unavailable')
    );
  }
} finally {
  releaseHeld?.();
  await browser?.close();
  await service?.stop();
  await Promise.all([...processes].map(instance => instance.kill().catch(() => {})));
  await server.close();
  if (production) await new Promise(resolve => production.httpServer.close(resolve));
  store?.close();
  await rm(directory, { recursive: true, force: true });
  await writeFile(
    path.join(output, `${runtime}-receipt.json`),
    JSON.stringify(
      {
        node: process.version,
        status: failures.length ? 'failed' : 'passed',
        checks,
        failures,
        artifacts,
        requests,
        outbound,
        replayDifferences,
        boundary:
          'Local authored HTML, real capture/job modules and built Studio UI; separate development-module comparison checks V1 runtime parity. No live website, deployment, provider or production isolation qualification.',
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ checks: checks.length, failures, output }));
}
