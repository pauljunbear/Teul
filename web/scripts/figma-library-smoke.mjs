import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { guidelineProjectView } from './guideline-project-view.mjs';

const runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/figma-library');
await mkdir(output, { recursive: true });
const receipt = { status: 'running', node: process.version, checks: [], errors: [] };
const raw = JSON.parse(
  await readFile('fixtures/guidelines/harbor-cross-format-figma.json', 'utf8')
);
const fixture = structuredClone(raw);
fixture.nodes['1:2'].document.children = raw.nodes['1:2'].document.children.filter(
  node => node.type === 'RECTANGLE'
);
const outline = {
  name: fixture.name,
  version: fixture.version,
  document: {
    type: 'DOCUMENT',
    children: [
      {
        id: '0:1',
        name: 'Library',
        type: 'CANVAS',
        children: [{ id: '1:2', name: 'Harbor colors', type: 'FRAME' }],
      },
    ],
  },
};
const token = 'synthetic-personal-token-never-persist';
const calls = [];
let browser, page, releaseHeld;
let behavior = 'valid';
const server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
try {
  receipt.scriptSha256 = createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex');
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
  });
  await context.route('**/*', async route => {
    const request = route.request(),
      target = new URL(request.url());
    if (target.origin === new URL(url).origin) {
      if (target.pathname.startsWith('/api/')) receipt.errors.push('Unexpected Studio API request');
      return route.continue();
    }
    if (target.origin !== 'https://api.figma.com') {
      receipt.errors.push(`Unexpected destination ${target.origin}`);
      return route.abort();
    }
    calls.push({ path: target.pathname, query: target.search });
    expect(request.method()).toBe('GET');
    expect(request.headers()['x-figma-token']).toBe(token);
    expect(request.headers().authorization).toBeUndefined();
    expect(request.headers().referer).toBeUndefined();
    if (behavior === 'denied')
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ err: 'Token expired' }),
      });
    if (behavior === 'held')
      await new Promise(resolve => {
        releaseHeld = resolve;
      });
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(target.pathname.endsWith('/nodes') ? fixture : outline),
      })
      .catch(() => {});
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => receipt.errors.push(error.message));
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  const library = page.getByRole('region', { name: 'Add a Figma library', exact: true });
  await expect(library).toBeVisible();
  await page
    .getByLabel('Figma library link', { exact: true })
    .fill('https://www.figma.com/design/Library123/Colors?node-id=1-2');
  await page.getByLabel('Read-only Figma token', { exact: true }).fill(token);
  await library.getByRole('button', { name: 'Find library pages', exact: true }).click();
  await expect(library.getByText(/pages and frames found/)).toBeVisible();
  expect(calls).toHaveLength(1);
  await expect(library.getByRole('checkbox', { name: /Harbor colors/ })).toBeChecked();
  await library.getByRole('button', { name: 'Read library colors', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Captured Figma evidence', exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('Read-only Figma token', { exact: true })).toHaveValue('');
  expect(calls).toHaveLength(2);
  expect(calls[1].query).toContain(`version=${fixture.version}`);
  const download = async (scope, name) => {
    const [item] = await Promise.all([
      page.waitForEvent('download'),
      scope.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await item.path(), 'utf8');
  };
  const capture = JSON.parse(await download(page, 'Download Figma capture'));
  expect(capture.roots[0].document).toEqual(fixture.nodes['1:2'].document);
  expect(JSON.stringify(capture)).not.toContain(token);
  receipt.checks.push(
    'Production browser discovers the selected frame and reads exact native colors directly; version and selection are pinned, and the token clears after capture.'
  );
  await page.getByRole('button', { name: 'Review captured colors', exact: true }).click();
  const candidates = page.locator('.guideline-native-candidates');
  for (const label of ['Ocean', 'Ink'])
    await candidates.getByRole('checkbox', { name: new RegExp(label) }).check();
  await page.getByRole('checkbox', { name: /Captured node paints/ }).check();
  await page.getByRole('checkbox', { name: /Use the recorded channels/ }).check();
  await page.getByRole('checkbox', { name: /I reviewed this partial source scope/ }).check();
  await page
    .getByLabel('Why this scope is sufficient', { exact: true })
    .fill('Synthetic color frames for direct library import verification.');
  await page.getByRole('button', { name: 'Apply Figma review', exact: true }).click();
  await chooseGuidelineTask(page, 'gradient');
  const gradient = page.getByRole('region', { name: 'Mode-aware gradient editor', exact: true });
  await gradient.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  const svg = await download(gradient, 'SVG');
  expect(svg).toContain('<linearGradient');
  const projectText = await download(page, 'Save Figma project');
  expect(projectText).not.toContain(token);
  expect(guidelineProjectView(JSON.parse(projectText)).capture).toEqual(capture);
  await writeFile(path.join(output, `${runtime}-project.json`), projectText);
  const reopened = await context.newPage();
  await reopened.goto(url);
  await reopened.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await reopened.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await reopened.getByLabel('Open Figma capture', { exact: true }).setInputFiles({
    name: 'library-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(projectText),
  });
  await expect(
    reopened.getByText(
      'Opened a saved Figma project offline. Source decisions and selected paint were replayed; no Figma request was made.',
      { exact: true }
    )
  ).toBeVisible();
  const restoredGradient = reopened.getByRole('region', {
    name: 'Mode-aware gradient editor',
    exact: true,
  });
  await expect(restoredGradient.locator('.guideline-gradient-preview')).toBeVisible();
  const [restoredDownload] = await Promise.all([
    reopened.waitForEvent('download'),
    restoredGradient.getByRole('button', { name: 'SVG', exact: true }).click(),
  ]);
  expect(await readFile(await restoredDownload.path(), 'utf8')).toBe(svg);
  await reopened.close();
  expect(calls).toHaveLength(2);
  receipt.checks.push(
    'Captured library colors enter source review, generate an exportable gradient and reopen the exact project offline with no credential in the capture or project.'
  );

  const before = calls.length;
  await page
    .getByLabel('Figma library link', { exact: true })
    .fill('https://example.com/design/Library123/Colors');
  await page.getByLabel('Read-only Figma token', { exact: true }).fill(token);
  await library.getByRole('button', { name: 'Find library pages', exact: true }).click();
  await expect(library.getByRole('alert')).toContainText('Paste a Figma');
  expect(calls).toHaveLength(before);
  await page
    .getByLabel('Figma library link', { exact: true })
    .fill('https://www.figma.com/design/Library123/Colors?node-id=1-2');
  behavior = 'denied';
  await library.getByRole('button', { name: 'Find library pages', exact: true }).click();
  await expect(library.getByRole('alert')).toContainText('Figma denied access');
  await expect(page.getByLabel('Read-only Figma token', { exact: true })).toHaveValue('');
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  behavior = 'held';
  await page.getByLabel('Read-only Figma token', { exact: true }).fill(token);
  await library.getByRole('button', { name: 'Find library pages', exact: true }).click();
  await expect.poll(() => typeof releaseHeld).toBe('function');
  await library.getByRole('button', { name: 'Cancel and forget token', exact: true }).click();
  releaseHeld();
  releaseHeld = null;
  await expect(page.getByLabel('Read-only Figma token', { exact: true })).toHaveValue('');
  await expect(library.getByRole('status')).toContainText('Token forgotten');
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  const after = JSON.parse(await download(page, 'Download Figma capture'));
  expect(after).toEqual(capture);
  const storage = await page.evaluate(async () => {
    const values = [JSON.stringify(localStorage), JSON.stringify(sessionStorage)];
    for (const { name } of await indexedDB.databases()) {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        for (const name of db.objectStoreNames)
          values.push(
            await new Promise((resolve, reject) => {
              const r = db.transaction(name).objectStore(name).getAll();
              r.onsuccess = () => resolve(JSON.stringify(r.result));
              r.onerror = () => reject(r.error);
            })
          );
      } finally {
        db.close();
      }
    }
    return values.join('\n');
  });
  expect(storage).not.toContain(token);
  receipt.checks.push(
    'Invalid URLs send nothing; permission denial and cancellation clear the token, discard late results and preserve the current project. Browser stores contain no token.'
  );
  const scans = [];
  for (const viewport of [
    { width: 1440, height: 1100 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const scan = await new AxeBuilder({ page })
      .include('.guideline-figma-library')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    scans.push({ viewport, violations: scan.violations, incomplete: scan.incomplete });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  }
  receipt.accessibility = scans;
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.getByLabel('Figma library link', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, `${runtime}-library.png`) });
  receipt.checks.push(
    'The direct-library controls pass scoped automated accessibility scans at desktop and mobile sizes; no page overflow.'
  );
  if (receipt.errors.length) throw new Error('Browser errors recorded');
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.errors.push(error.message);
  process.exitCode = 1;
  await page?.screenshot({ path: path.join(output, `${runtime}-failure.png`) }).catch(() => {});
} finally {
  releaseHeld?.();
  const cleanup = await Promise.allSettled([
    browser?.close(),
    new Promise((resolve, reject) => {
      server.httpServer.close(error => (error ? reject(error) : resolve()));
      server.httpServer.closeAllConnections();
    }),
  ]);
  for (const result of cleanup)
    if (result.status === 'rejected')
      receipt.errors.push(`Cleanup failed: ${String(result.reason)}`);
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
