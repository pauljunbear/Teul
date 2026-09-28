import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { guidelineProjectView } from './guideline-project-view.mjs';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const server = await createServer({
  mode: 'guideline-proof',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
await server.listen();
const url = server.resolvedUrls.local[0],
  runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/guideline-refresh');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
});
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1100 },
});
const checks = [],
  errors = [],
  requests = [];
context.on('request', request => {
  if (
    request.url().includes('/api/guideline-intake') ||
    (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(url).origin)
  )
    requests.push(request.url());
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push(e.message));
const file = async variant => ({
  name: 'Brand.pdf',
  mimeType: 'application/pdf',
  buffer: await readFile(`fixtures/guidelines/refresh-${variant}.pdf`),
});
let downloadAt = 0;
async function download(name) {
  await new Promise(resolve => setTimeout(resolve, Math.max(0, downloadAt - Date.now())));
  downloadAt = Date.now() + 160;
  const [d] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name, exact: true }).click(),
  ]);
  return readFile(await d.path(), 'utf8');
}
const panel = () => page.locator('.guideline-refresh');
const compare = async variant => {
  if ((await panel().getAttribute('open')) === null) await panel().locator('summary').click();
  await page
    .getByLabel('Updated guideline PDF', { exact: true })
    .setInputFiles(await file(variant));
  await page.getByRole('button', { name: 'Compare updated pages', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Review source changes', exact: true })
  ).toBeVisible();
};
const accept = () =>
  page.getByRole('button', { name: 'Save current project and accept update', exact: true });
try {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .getByLabel('Choose guideline PDF', { exact: true })
    .setInputFiles(await file('initial'));
  await page.getByLabel('Pages to read', { exact: true }).fill('1-2');
  await page.getByRole('button', { name: 'Read selected pages', exact: true }).click();
  await expect(page.getByText('2 stated colors', { exact: true })).toBeVisible();
  await page.getByLabel('Name for #126E78', { exact: true }).fill('Ocean');
  await page.getByLabel('Name for #182E34', { exact: true }).fill('Ink');
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'gradient');
  await page.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make gradient', exact: true })).toBeEnabled();
  const original = await download('Download project');
  await compare('initial');
  await expect(accept()).toBeDisabled();
  await expect(panel()).toContainText('captured source and evidence are identical');
  await page.getByRole('button', { name: 'Keep current source', exact: true }).click();
  expect(await download('Download project')).toBe(original);
  checks.push(
    'Recapturing the same PDF/pages is a no-op even with a fresh capture timestamp; no revision or design reset occurs.'
  );
  await compare('note');
  const note = JSON.parse(await download('Download comparison'));
  expect(note.retained.colors).toBe(2);
  expect(note.metadataChanges).toEqual([]);
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Keep current source', exact: true }).click();
  expect(await download('Download project')).toBe(original);
  checks.push(
    'An unrelated selected-page edit retains both color decisions; rejecting preserves byte-exact project and gradient.'
  );
  await compare('color');
  await page.getByLabel('Name for #182E34', { exact: true }).fill('Deep Ink');
  await expect(
    page.getByRole('heading', { name: 'Review source changes', exact: true })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'gradient');
  const gradientEditor = page.getByRole('region', { name: 'Gradient proof', exact: true });
  for (let i = 0; i < 3; i++)
    await gradientEditor.getByRole('button', { name: 'Add stop', exact: true }).click();
  await gradientEditor.getByLabel('Stop 2 position', { exact: true }).fill('20');
  await gradientEditor.getByLabel('Lock stop 2', { exact: true }).check();
  await gradientEditor.getByLabel('Interpolation', { exact: true }).selectOption('shorter');
  await chooseGuidelineTask(page, 'gradient');
  await page.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make gradient', exact: true })).toBeEnabled();
  const current = await download('Download project');
  expect(guidelineProjectView(current).selection.design.stops).toHaveLength(5);
  checks.push(
    'Editing the current review discards its staged proposal, preventing acceptance against a stale draft.'
  );
  await compare('color');
  await page.evaluate(() => {
    window.originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'projects')
        throw new DOMException('fixture quota failure', 'QuotaExceededError');
      return window.originalPut.apply(this, args);
    };
  });
  await accept().click();
  await expect(panel().getByRole('alert')).toBeVisible();
  expect(await download('Download project')).toBe(current);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.originalPut;
  });
  checks.push(
    'A real IndexedDB save failure prevents source replacement and preserves the exact selected design.'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await panel().screenshot({ path: path.join(output, `${runtime}-comparison-mobile.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await accept().click();
  await expect(page.getByLabel('Include #136E78', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Name for #182E34', { exact: true })).toHaveValue('Deep Ink');
  await expect(page.locator('.guideline-gradient-preview')).toHaveCount(0);
  const preserved = await page.evaluate(async () => {
    const { guidelineProjectStore: s } = await import('/src/lib/guideline/projectStore.ts');
    const list = await s.list();
    return Promise.all(list.entries.map(e => s.download(e.reference)));
  });
  expect(preserved).toEqual([current]);
  const updated = await download('Download project');
  expect(updated).not.toBe(current);
  const envelope = JSON.parse(updated);
  const parsed = envelope.sourceProjectJson ? JSON.parse(envelope.sourceProjectJson) : envelope;
  expect(parsed.review).toBeNull();
  expect(parsed.selection).toBeNull();
  await page.getByRole('button', { name: 'Update saved project', exact: true }).click();
  await expect(
    page.getByText(
      'Saved a new revision on this device. Earlier revisions, selected designs and their recorded decisions are retained.',
      { exact: true }
    )
  ).toBeVisible();
  const historical = await page.evaluate(async () => {
    const { guidelineProjectStore: s } = await import('/src/lib/guideline/projectStore.ts');
    const e = (await s.list()).entries[0];
    return {
      head: await s.download(e.reference),
      old: await s.downloadRevision(e.reference, 1),
      count: e.revisions.length,
    };
  });
  expect(historical).toEqual({ head: updated, old: current, count: 2 });
  checks.push(
    'Acceptance preserves the exact prior design first, resets changed-color inclusion and applied results, and subsequent save appends the new source alongside the old revision.'
  );
  await page.getByLabel('Include #136E78', { exact: true }).check();
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  const restore = page.getByRole('region', { name: 'Previous source designs', exact: true });
  await restore.getByRole('button', { name: 'Check previous designs', exact: true }).click();
  await expect(restore).toContainText('gradient · changed dependencies');
  await expect(
    restore.getByRole('button', { name: 'Restore available designs', exact: true })
  ).toBeDisabled();
  checks.push(
    'A changed PDF anchor makes its previous gradient stale; restoration cannot silently substitute a new paint.'
  );
  // Restore the original file to compare an added source restriction through the actual capture UI.
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'current.json',
    mimeType: 'application/json',
    buffer: Buffer.from(current),
  });
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  await compare('rule');
  const rule = JSON.parse(await download('Download comparison'));
  expect(rule.draft.rules.some(item => item.meaning === 'needs-interpretation')).toBe(true);
  await page.getByRole('button', { name: 'Keep current source', exact: true }).click();
  expect(await download('Download project')).toBe(current);
  checks.push(
    'An added restriction enters the proposed draft unresolved; rejecting retains the preceding approved local review and gradient.'
  );
  await page.getByLabel('Updated guideline PDF', { exact: true }).setInputFiles({
    name: 'bad.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('not a PDF'),
  });
  await page.getByRole('button', { name: 'Compare updated pages', exact: true }).click();
  await expect(panel().getByRole('alert')).toContainText('not a PDF');
  expect(await download('Download project')).toBe(current);
  checks.push('Malformed updated input preserves the current source, review and output.');
  await page.getByLabel('Updated guideline PDF', { exact: true }).setInputFiles(await file('note'));
  await page.evaluate(() => {
    window.originalArrayBuffer = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      const value = window.originalArrayBuffer.call(this);
      return this.name === 'Brand.pdf'
        ? new Promise(resolve => {
            window.releaseRefreshRead = () => value.then(resolve);
          })
        : value;
    };
  });
  await page.getByRole('button', { name: 'Compare updated pages', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel comparison', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel comparison', exact: true }).click();
  await page.evaluate(async () => {
    File.prototype.arrayBuffer = window.originalArrayBuffer;
    await window.releaseRefreshRead();
  });
  await expect(
    page.getByRole('heading', { name: 'Review source changes', exact: true })
  ).toHaveCount(0);
  expect(await download('Download project')).toBe(current);
  checks.push(
    'Cancelling a delayed real File read prevents its late completion from publishing a comparison or changing the project.'
  );
  await compare('note');
  await page.evaluate(() => {
    window.originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = (...args) => {
      crypto.subtle.digest = window.originalDigest;
      return new Promise(resolve => {
        window.releaseRefreshSave = () => window.originalDigest(...args).then(resolve);
      });
    };
  });
  await accept().click();
  await expect.poll(() => page.evaluate(() => typeof window.releaseRefreshSave)).toBe('function');
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'new-editor.json',
    mimeType: 'application/json',
    buffer: Buffer.from(current),
  });
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  await page.evaluate(async () => {
    await window.releaseRefreshSave();
  });
  expect(await download('Download project')).toBe(current);
  await expect(
    page.getByRole('heading', { name: 'Review source changes', exact: true })
  ).toHaveCount(0);
  checks.push(
    'Opening another project while acceptance waits on storage cancels the stale save and prevents late source replacement.'
  );
  await compare('note');
  await accept().click();
  await expect(
    restore.getByRole('button', { name: 'Check previous designs', exact: true })
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await restore.getByRole('button', { name: 'Check previous designs', exact: true }).click();
  await expect(restore).toContainText('gradient · ready to restore');
  await restore.getByRole('button', { name: 'Restore available designs', exact: true }).click();
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  const restored = await download('Download project');
  const restoredSource = guidelineProjectView(restored);
  const paintStops = stops => stops.map(({ sourceColorId: _, ...stop }) => stop);
  expect(paintStops(restoredSource.selection.design.stops)).toEqual(
    paintStops(guidelineProjectView(current).selection.design.stops)
  );
  for (const stop of restoredSource.selection.design.stops) {
    const source = restoredSource.review.model.colors.find(
      color => color.id === stop.sourceColorId
    );
    expect(source.valuesByMode.Source).toEqual(stop.value);
  }
  expect(restoredSource.selection.design.compiledPaint).toEqual(
    guidelineProjectView(current).selection.design.compiledPaint
  );
  expect(restoredSource.selection.design.sourceModelHash).toBe(
    restoredSource.review.model.modelHash
  );
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'restored.json',
    mimeType: 'application/json',
    buffer: Buffer.from(restored),
  });
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  expect(await download('Download project')).toBe(restored);
  await restore.getByRole('button', { name: 'Check previous designs', exact: true }).click();
  await expect(restore).toContainText('gradient · ready to restore');
  await restore.screenshot({ path: path.join(output, `${runtime}-restore-mobile.png`) });
  await page.getByLabel('Name for #182E34', { exact: true }).fill('A revised role');
  await expect(
    restore.getByRole('button', { name: 'Restore available designs', exact: true })
  ).toHaveCount(0);
  checks.push(
    'An unrelated PDF change preserves exact gradient paint under the renewed review, survives portable reopen, and a later review edit invalidates restoration.'
  );
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  checks.push(
    '390px comparison fits, no browser errors and no source or service network requests.'
  );
  await writeFile(
    path.join(output, `${runtime}-checks.json`),
    JSON.stringify({ status: 'passed', node: process.version, checks, errors, requests }, null, 2)
  );
  console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true });
  await writeFile(
    path.join(output, `${runtime}-checks.json`),
    JSON.stringify(
      { status: 'failed', node: process.version, checks, error: String(error), errors, requests },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
