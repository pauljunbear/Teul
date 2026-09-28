import { chromium, expect } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { startIntakeHost } from '../../services/guideline-intake/dist/host.js';
import { loadHostAssets } from '../../services/guideline-intake/dist/hostAssets.js';
import { chooseGuidelineTask } from './guideline-task-navigation.mjs';

const output = path.resolve('../release/guideline-host');
const runtime = `node${process.versions.node.split('.')[0]}`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = { status: 'running', node: process.version, checks: [], errors: [] };
const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'teul-host-browser-')));
await mkdir(output, { recursive: true });
let host, browser, page;
try {
  const studioDirectory = await realpath('dist');
  receipt.scriptSha256 = digest(await readFile(new URL(import.meta.url)));
  receipt.buildHashes = Object.fromEntries(
    [...(await loadHostAssets(studioDirectory))].map(([name, asset]) => [name, digest(asset.body)])
  );
  // Explicit synthetic session for this loopback test only. Runtime has no default identity.
  const session = randomBytes(32).toString('hex');
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve, reject) =>
    reservation.close(error => (error ? reject(error) : resolve()))
  );
  const url = `http://127.0.0.1:${port}`;
  host = await startIntakeHost({
    stateDirectory: path.join(temporary, 'state'),
    studioDirectory,
    ownerKey: randomBytes(32),
    assetKey: randomBytes(32),
    authenticate: async request =>
      request.headers.cookie === `test-session=${session}` ? 'test-user' : null,
    allowedOrigins: [url],
    listen: { host: '127.0.0.1', port },
  });
  expect((await fetch(url)).status).toBe(401);
  expect((await fetch(`${url}/readyz`)).status).toBe(200);
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
  });
  await context.addCookies([
    { name: 'test-session', value: session, url, httpOnly: true, sameSite: 'Strict' },
  ]);
  await context.route('**/*', route => {
    const target = new URL(route.request().url());
    if (target.origin === new URL(url).origin) return route.continue();
    receipt.errors.push(`Unexpected external request: ${target.origin}`);
    return route.abort('blockedbyclient');
  });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => receipt.errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400)
      receipt.errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
  });
  expect(await (await context.request.get(`${url}/api/guideline-intake/profiles`)).json()).toEqual({
    profiles: [],
  });
  const owner = await (await context.request.get(`${url}/api/guideline-intake/session`)).json();
  expect(typeof owner.ownerBinding).toBe('string');
  await page.goto(url);
  const lookup = await page.evaluate(
    async requestHash => {
      const response = await fetch('/api/guideline-intake/jobs/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestHash }),
      });
      return { status: response.status, body: await response.json() };
    },
    `sha256:${'a'.repeat(64)}`
  );
  expect(lookup).toEqual({ status: 200, body: { job: null } });
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .getByLabel('Choose guideline PDF', { exact: true })
    .setInputFiles('fixtures/guidelines/harbor-native.pdf');
  await page.getByRole('button', { name: 'Read selected pages', exact: true }).click();
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View #126E78 in source', exact: true }).click();
  await expect(page.locator('.guideline-highlight')).toBeVisible();
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'gradient');
  await page.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Gradient proof', exact: true })).toContainText(
    'Continuous route fidelity: pass.'
  );
  for (const [label, extension] of [
    ['SVG', 'svg'],
    ['CSS', 'css'],
    ['JSON', 'json'],
  ]) {
    const [artifact] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: label, exact: true }).click(),
    ]);
    const bytes = await readFile(await artifact.path());
    expect(bytes.length).toBeGreaterThan(0);
    await writeFile(path.join(output, `${runtime}-gradient.${extension}`), bytes);
    if (extension === 'json') {
      const value = JSON.parse(bytes);
      expect(value.design.schemaVersion).toBe('teul.gradient-design.v2');
      expect(value.fidelity.status).toBe('pass');
      expect(value.assessment.status).toBe('pass');
    }
  }
  await page.screenshot({ path: path.join(output, `${runtime}-studio.png`), fullPage: true });
  receipt.checks.push(
    'Unauthenticated Studio access is refused; explicit synthetic session opens the same-origin API and static build.',
    'The production Studio reads and renders a native PDF, locates source evidence, adopts four colors and generates a checked gradient through the host.',
    'SVG, CSS and assessed JSON download through the real browser; no remote processor is registered and no external request is made.'
  );
  expect(receipt.errors).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.errors.push(error instanceof Error ? error.message : String(error));
  await page
    ?.screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  const cleanupErrors = [];
  await browser?.close().catch(error => cleanupErrors.push(`Browser close: ${error.message}`));
  let hostStopped = false;
  try {
    await host?.stop();
    hostStopped = true;
  } catch (error) {
    cleanupErrors.push(`Host stop: ${error.message}`);
  }
  if (hostStopped)
    await rm(temporary, { recursive: true, force: true }).catch(error =>
      cleanupErrors.push(`Temporary cleanup: ${error.message}`)
    );
  if (cleanupErrors.length) {
    receipt.status = 'failed';
    receipt.errors.push(...cleanupErrors);
  }
  await writeFile(
    path.join(output, `${runtime}-checks.json`),
    JSON.stringify(receipt, null, 2) + '\n'
  );
  console.log(
    JSON.stringify({
      status: receipt.status,
      node: receipt.node,
      checks: receipt.checks,
      errors: receipt.errors,
    })
  );
  if (cleanupErrors.length) throw new Error('Host browser cleanup failed; see receipt.');
}
