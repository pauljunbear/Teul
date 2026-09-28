import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preview } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chooseGuidelineTask } from './guideline-task-navigation.mjs';

const runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/guideline-task-flow');
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
  await expect(task(page)).toHaveValue('');
  for (const name of ['Gradient proof', 'Supporting colors', 'Color applications'])
    await expect(region(page, name)).toHaveCount(0);
  await scan('choose-task');
  await chooseGuidelineTask(page, 'extension');
  await expect(page.getByRole('button', { name: 'Make scale', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Preview extension', exact: true })).toHaveCount(0);
  receipt.checks.push(
    'New PDF review starts with a task choice and offers a derived scale without inventing source structure.'
  );
  await chooseGuidelineTask(page, 'gradient');
  const pdfGradient = region(page, 'Gradient proof');
  await pdfGradient.getByLabel('Angle', { exact: true }).fill('73');
  await chooseGuidelineTask(page, 'supporting');
  const supporting = region(page, 'Supporting colors');
  await supporting.getByLabel('Supporting library', { exact: true }).selectOption('werner');
  await chooseGuidelineTask(page, 'application');
  const application = region(page, 'Color applications');
  await application.getByLabel('Application type', { exact: true }).selectOption('brand');
  await application.getByLabel('Main panel share', { exact: true }).fill('65');
  await chooseGuidelineTask(page, 'gradient');
  await expect(pdfGradient.getByLabel('Angle', { exact: true })).toHaveValue('73');
  await pdfGradient.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(pdfGradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  const svg = await download(pdfGradient, 'SVG');
  const saved = await download(page, 'Download project');
  await chooseGuidelineTask(page, 'supporting');
  await expect(supporting.getByLabel('Supporting library', { exact: true })).toHaveValue('werner');
  await chooseGuidelineTask(page, 'application');
  await expect(application.getByLabel('Application type', { exact: true })).toHaveValue('brand');
  await expect(application.getByLabel('Main panel share', { exact: true })).toHaveValue('65');
  expect(await download(page, 'Download project')).toBe(saved);
  await chooseGuidelineTask(page, 'gradient');
  expect(await download(pdfGradient, 'SVG')).toBe(svg);
  // All mounted but inactive form controls must be absent from keyboard navigation.
  await task(page).focus();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('[hidden]'))).toBe(false);
    expect(
      await page.evaluate(() => !!document.activeElement.closest('[aria-label="Gradient proof"]'))
    ).toBe(true);
  }
  await scan('gradient-task');
  await page.setViewportSize({ width: 390, height: 844 });
  await scan('gradient-task-mobile');
  await region(page, 'Design with reviewed colors').screenshot({
    path: path.join(output, `${runtime}-mobile.png`),
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  receipt.checks.push(
    'Switching retains gradient, supporting and layout drafts; selected exports and project bytes stay exact; inactive controls stay out of Tab navigation.'
  );
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(saved),
  });
  await expect(task(page)).toHaveValue('gradient');
  expect(await download(pdfGradient, 'SVG')).toBe(svg);
  await page.getByLabel('Include #126E78', { exact: true }).uncheck();
  await expect(task(page)).toHaveCount(0);
  await expect(pdfGradient).toHaveCount(0);
  receipt.checks.push(
    'Reopening displays a retained result; changing source review removes authoring and stale exports.'
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await page
    .getByLabel('Open Figma capture', { exact: true })
    .setInputFiles('fixtures/guidelines/figma-project-v1.json');
  const figma = region(page, 'Figma guideline capture');
  await chooseGuidelineTask(figma, 'extension');
  const extension = region(figma, 'Source scale extension');
  await extension.getByLabel('New shade 1 name', { exact: true }).fill('Unfinished shade');
  await extension.getByLabel('New shade 1 position', { exact: true }).fill('0.75');
  await chooseGuidelineTask(figma, 'application');
  await expect(extension).toHaveCount(0);
  await chooseGuidelineTask(figma, 'extension');
  await expect(extension.getByLabel('New shade 1 name', { exact: true })).toHaveValue(
    'Unfinished shade'
  );
  await expect(extension.getByLabel('New shade 1 position', { exact: true })).toHaveValue('0.75');
  await region(figma, 'Design with reviewed colors').screenshot({
    path: path.join(output, `${runtime}-desktop.png`),
  });
  receipt.checks.push(
    'The shared Figma workspace retains ungenerated scale inputs across task switches. Website and combined-source paths use the same selector and run in their existing regression journeys.'
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
