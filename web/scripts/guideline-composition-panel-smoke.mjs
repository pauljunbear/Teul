import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chooseGuidelineTask } from './guideline-task-navigation.mjs';

const output = path.resolve('../release/composition-application-2026-09-28');
const receipt = { status: 'running', node: process.version, checks: [], errors: [] };
await mkdir(output, { recursive: true });
let modules, production, browser, page;
try {
  modules = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const { nativeGradientComparisonFixture } = await modules.ssrLoadModule(
    '/fixtures/guidelines/native-gradient-comparison-fixture.ts'
  );
  const { buildFigmaProject } = await modules.ssrLoadModule('/src/lib/guideline/figmaProject.ts');
  const f = await nativeGradientComparisonFixture(false);
  const project = await buildFigmaProject({
    capture: f.inventory.packet,
    draft: f.review.decision.draft,
    review: f.review,
    selection: null,
  });
  const source = JSON.stringify(project),
    mode = f.review.model.modes[0].id;
  const white = f.review.model.colors.find(c => c.valuesByMode[mode]?.hex === '#FFFFFF').id;
  const black = f.review.model.colors.find(c => c.valuesByMode[mode]?.hex === '#000000').id;
  await modules.close();
  modules = null;
  production = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  const url = production.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const newContext = async () => {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1280, height: 1000 },
    });
    await context.route('**/*', route =>
      new URL(route.request().url()).origin === new URL(url).origin
        ? route.continue()
        : route.abort()
    );
    return context;
  };
  let context = await newContext();
  const open = async json => {
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => receipt.errors.push(error.message));
    await page.goto(url);
    await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
    await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
    await page.getByLabel('Open Figma capture', { exact: true }).setInputFiles({
      name: 'panel.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
    await chooseGuidelineTask(page, 'application');
    return page.getByRole('region', { name: 'Color applications', exact: true });
  };
  const download = async (scope, name) => {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      scope.getByRole('button', { name, exact: true }).click(),
    ]);
    const text = await readFile(await file.path(), 'utf8');
    await expect(scope.getByRole('button', { name, exact: true })).toBeEnabled();
    return text;
  };
  let app = await open(source);
  await app.getByLabel('Application type', { exact: true }).selectOption('panel');
  await app.getByLabel('Panel heading', { exact: true }).fill('A useful product panel');
  await app
    .getByLabel('Panel body', { exact: true })
    .fill('Source colors and real copy.\nKeep the decision visible.');
  await app.getByLabel('Canvas', { exact: true }).selectOption(white);
  await app.getByLabel('Heading', { exact: true }).selectOption(black);
  await app.getByLabel('Body', { exact: true }).selectOption(black);
  await app.getByLabel('Map panel regions to guideline roles').check();
  for (const [region, role] of [
    ['ground', 'ground'],
    ['heading', 'text-1'],
    ['body', 'text-2'],
  ])
    await app.getByLabel(`Panel ${region} source role`, { exact: true }).selectOption(role);
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(app.getByRole('status')).toContainText('Source and paint checks passed');
  const svg = await download(app, 'Download panel SVG');
  const application = await download(app, 'Save application');
  expect(JSON.parse(application).request.layout.sourceRoles.heading).toBe('text-1');
  expect(svg).toContain('<title>A useful product panel</title>');
  receipt.checks.push(
    'Production controls assess authored copy and source-role mappings and export the checked SVG/application.'
  );
  await app.getByLabel('Panel heading', { exact: true }).fill('');
  await expect(app.getByRole('button', { name: 'Check application', exact: true })).toBeDisabled();
  expect(await download(app, 'Download panel SVG')).toBe(svg);
  await app.getByLabel('Panel heading', { exact: true }).fill('W'.repeat(256));
  await expect(app.getByRole('button', { name: 'Check application', exact: true })).toBeDisabled();
  expect(await download(app, 'Save application')).toBe(application);
  const unfinished = await download(page, 'Save Figma project');
  expect(JSON.parse(unfinished).authoring.application.panel.heading).toBe('W'.repeat(256));
  receipt.checks.push(
    'Blank and overflowing copy disable checking, keep prior exports exact, and remain saveable as unfinished controls.'
  );
  await context.close();
  context = await newContext();
  app = await open(unfinished);
  await expect(app.getByLabel('Panel heading', { exact: true })).toHaveValue('W'.repeat(256));
  expect(await download(app, 'Download panel SVG')).toBe(svg);
  await app.getByLabel('Panel heading', { exact: true }).fill('A useful product panel');
  await app.getByLabel('Body', { exact: true }).selectOption(white);
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(app.getByRole('status')).toContainText('last checked application');
  await expect(app.getByText('Latest attempt needs changes', { exact: true })).toBeVisible();
  expect(await download(app, 'Save application')).toBe(application);
  receipt.checks.push(
    'Cold reopening retains both unfinished edits and the checked output; failed contrast cannot replace the checked selection.'
  );
  await app.getByLabel('Body', { exact: true }).selectOption(black);
  await app.getByText('Custom canvas and label colors', { exact: true }).click();
  await app.getByRole('button', { name: 'Add canvas color', exact: true }).click();
  await app.getByRole('button', { name: 'Add label color', exact: true }).click();
  const custom = async label =>
    app
      .getByLabel(label, { exact: true })
      .locator('option')
      .evaluateAll(options => options.find(o => o.textContent.includes(' · custom')).value);
  await app.getByLabel('Canvas', { exact: true }).selectOption(await custom('Canvas'));
  for (const label of ['Heading', 'Body'])
    await app.getByLabel(label, { exact: true }).selectOption(await custom(label));
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(app.getByRole('status')).toContainText('Source and paint checks passed');
  const saved = await download(page, 'Save Figma project');
  const customApplication = await download(app, 'Save application');
  await page
    .getByRole('region', { name: 'Figma guideline capture', exact: true })
    .getByRole('button', { name: 'Save on this device', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  receipt.checks.push(
    'Custom solid canvas/foreground paints pass through the normal application overlay and local project library.'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(output, 'studio-panel-mobile.png'), fullPage: true });
  await writeFile(path.join(output, 'studio-panel-axe.json'), JSON.stringify(scan, null, 2));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await app.screenshot({ path: path.join(output, 'studio-panel-desktop.png') });
  receipt.checks.push(
    '390px viewport has no horizontal overflow and zero automated axe violations; this is not a screen-reader observation.'
  );
  await context.close();
  context = await newContext();
  app = await open(saved);
  expect(await download(app, 'Save application')).toBe(customApplication);
  await context.setOffline(true);
  expect(await download(app, 'Save application')).toBe(customApplication);
  receipt.checks.push(
    'A fresh browser context rechecks exact custom paint and project state; export works after the retained project is opened and the browser goes offline.'
  );
  await writeFile(path.join(output, 'studio-panel-project.json'), saved);
  receipt.projectSha256 = createHash('sha256').update(saved).digest('hex');
  expect(receipt.errors).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.errors.push(String(error));
  process.exitCode = 1;
  if (page)
    await page
      .screenshot({ path: path.join(output, 'studio-panel-failure.png'), fullPage: true })
      .catch(() => {});
} finally {
  await browser?.close();
  await production?.httpServer.close();
  await modules?.close();
  await writeFile(
    path.join(output, 'studio-panel-smoke.json'),
    JSON.stringify(receipt, null, 2) + '\n'
  );
  console.log(JSON.stringify(receipt, null, 2));
}
