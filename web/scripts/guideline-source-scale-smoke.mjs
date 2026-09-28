import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preview } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chooseGuidelineTask } from './guideline-task-navigation.mjs';

const runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/guideline-source-scale');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = { status: 'running', node: process.version, checks: [], scans: [], errors: [] };
await mkdir(output, { recursive: true });
let production, browser;
try {
  receipt.scriptSha256 = digest(await readFile(new URL(import.meta.url)));
  receipt.buildHashes = Object.fromEntries(
    await Promise.all(
      [
        'index.html',
        ...(await readdir('dist/assets'))
          .filter(n => /\.(js|css)$/.test(n))
          .map(n => `assets/${n}`),
      ].map(async name => [name, digest(await readFile(`dist/${name}`))])
    )
  );
  production = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  const url = production.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
  });
  await context.route('**/*', route => {
    const target = new URL(route.request().url());
    if (target.origin === new URL(url).origin) return route.continue();
    receipt.errors.push(`Unexpected remote request: ${target.href}`);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => receipt.errors.push(error.message));
  const taskName = 'What would you like to make?';
  const task = scope => scope.getByRole('combobox', { name: taskName, exact: true });
  const region = (scope, name) => scope.getByRole('region', { name, exact: true });
  const scan = async name => {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const text = JSON.stringify(result, null, 2);
    const file = `${runtime}-${name}.json`;
    await writeFile(path.join(output, file), text);
    receipt.scans.push({
      name,
      file,
      sha256: digest(text),
      violations: result.violations,
      incomplete: result.incomplete,
    });
    expect(result.violations).toEqual([]);
  };
  const download = async (scope, name) => {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      scope.getByRole('button', { name, exact: true }).click(),
    ]);
    await expect(scope.getByRole('button', { name, exact: true })).toBeEnabled();
    await expect
      .poll(() =>
        scope
          .getByRole('button', { name, exact: true })
          .evaluate(button => getComputedStyle(button).opacity)
      )
      .toBe('1');
    return readFile(await file.path(), 'utf8');
  };
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .getByLabel('Choose guideline PDF', { exact: true })
    .setInputFiles('fixtures/guidelines/harbor-native.pdf');
  await page.getByRole('button', { name: 'Read selected pages', exact: true }).click();
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'extension');
  const extension = region(page, 'Source scale extension');
  await expect(extension.getByLabel('Scale task', { exact: true })).toHaveValue('new-scale');
  const anchorSelect = extension.getByLabel('Brand color', { exact: true });
  const anchorId = await anchorSelect
    .locator('option')
    .filter({ hasText: '#126E78' })
    .getAttribute('value');
  await anchorSelect.selectOption(anchorId);
  await extension.getByLabel('Scale name', { exact: true }).fill('Harbor product scale');
  await extension.getByLabel('Use', { exact: true }).selectOption('product');
  await extension.getByRole('button', { name: 'Make scale', exact: true }).click();
  await expect(extension.locator('[data-origin="teul-generated"]')).toHaveCount(11);
  await expect(extension.locator('[data-origin="source"]')).toHaveCount(1);
  const scaleJson = await download(page, 'Download project');
  const scaleBundle = JSON.parse(scaleJson);
  expect(scaleBundle.schemaVersion).toBe('teul.guideline-workspace.v8');
  const source = JSON.parse(scaleBundle.sourceProjectJson);
  expect(source.review.model.scales).toEqual([]);
  const proposed = scaleBundle.outputs.extension.preview;
  expect(proposed.request.familyId).toBeNull();
  for (const color of source.review.model.colors)
    expect(proposed.workingModel.colors.find(c => c.id === color.id)).toEqual(color);
  expect(proposed.workingModel.modes).toEqual(source.review.model.modes);
  await scan('derived-scale');
  await extension.screenshot({ path: path.join(output, `${runtime}-scale.png`) });
  receipt.checks.push(
    'Four imported PDF swatches create a proposed 12-position scale with one exact original anchor, no invented source scale or mode, and eleven new shades.'
  );
  await chooseGuidelineTask(page, 'application');
  const app = region(page, 'Color applications');
  await app.getByLabel('Application colors', { exact: true }).selectOption('extension');
  await app.getByLabel('Application anchor', { exact: true }).selectOption(anchorId);
  const choose = async (label, text) => {
    const select = app.getByLabel(label, { exact: true });
    await select.selectOption(
      await select.locator('option').filter({ hasText: text }).getAttribute('value')
    );
  };
  for (const [label, color] of [
    ['Canvas', '#F4EFE6'],
    ['Continue label', '#F4EFE6'],
    ['View details link', '#182E34'],
    ['Focus ring', '#182E34'],
  ])
    await choose(label, color);
  await app
    .getByLabel('Rest action', { exact: true })
    .selectOption(proposed.generatedBindings.find(b => b.slotId === 'step:10').colorId);
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(app.getByRole('status')).toContainText('Source and paint checks passed');
  const svg = await download(app, 'Download rest SVG');
  const css = await download(app, 'Application CSS');
  const application = await download(app, 'Save application');
  expect(JSON.parse(application).schemaVersion).toBe('teul.guideline-application.v2');
  const saved = await download(page, 'Download project');
  await writeFile(path.join(output, `${runtime}-project.json`), saved);
  await writeFile(path.join(output, `${runtime}-rest.svg`), svg);
  await writeFile(path.join(output, `${runtime}-application.css`), css);
  await scan('derived-application');
  await app.screenshot({ path: path.join(output, `${runtime}-application.png`) });
  await page.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.getByText('Saved PDF projects on this device', { exact: false }).click();
  await page.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect(task(page)).toHaveValue('application');
  expect(await download(app, 'Download rest SVG')).toBe(svg);
  expect(await download(app, 'Application CSS')).toBe(css);
  expect(await download(app, 'Save application')).toBe(application);
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'derived.json',
    mimeType: 'application/json',
    buffer: Buffer.from(saved),
  });
  await expect(task(page)).toHaveValue('application');
  expect(await download(app, 'Download rest SVG')).toBe(svg);
  receipt.checks.push(
    'The derived scale reaches five assessed product-state samples, SVG/CSS/application JSON export, actual IndexedDB save/reload and file reopen with identical output bytes.'
  );
  await chooseGuidelineTask(page, 'extension');
  await expect(extension.getByLabel('Brand color', { exact: true })).toHaveValue(anchorId);
  await expect(extension.getByLabel('Scale name', { exact: true })).toHaveValue(
    'Harbor product scale'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await scan('derived-scale-mobile');
  await extension.screenshot({ path: path.join(output, `${runtime}-mobile.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await extension.getByLabel('Scale name', { exact: true }).fill('Revised scale');
  await expect(extension.locator('[data-origin="teul-generated"]')).toHaveCount(0);
  await chooseGuidelineTask(page, 'application');
  await expect(app.getByRole('button', { name: 'Save application', exact: true })).toHaveCount(0);
  receipt.checks.push(
    'Editing a reopened scale invalidates the old generated and applied output; the new controls have no desktop/mobile automated accessibility violations.'
  );
  expect(receipt.errors).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  const closed = await Promise.allSettled([
    browser?.close(),
    production
      ? new Promise((resolve, reject) => {
          production.httpServer.close(error => (error ? reject(error) : resolve()));
          production.httpServer.closeAllConnections();
        })
      : undefined,
  ]);
  receipt.cleanupErrors = closed
    .filter(result => result.status === 'rejected')
    .map(result => String(result.reason));
  if (receipt.cleanupErrors.length) {
    receipt.status = 'failed';
    process.exitCode = 1;
  }
  await writeFile(path.join(output, `${runtime}-checks.json`), JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify(
      { status: receipt.status, checks: receipt.checks, failure: receipt.failure },
      null,
      2
    )
  );
}
