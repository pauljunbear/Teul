import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chooseGuidelineTask } from './guideline-task-navigation.mjs';

const runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve(`../release/mixed-composition-studio-${runtime}`);
const digest = value => createHash('sha256').update(value).digest('hex');
const receipt = {
  status: 'running',
  node: process.version,
  scope:
    'Production Studio synthetic mixed composition workflow. No held-out sources, brand quality ratings, native Figma delivery, source refresh browser claim, or screen-reader claim.',
  checks: [],
  errors: [],
};
await mkdir(output, { recursive: true });
let modules, production, browser, page;
try {
  modules = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const { mixedCompositionStudioFixture } = await modules.ssrLoadModule(
    '/fixtures/guidelines/mixed-composition-studio-fixture.ts'
  );
  const f = await mixedCompositionStudioFixture();
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
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => receipt.errors.push(error.message));
    await page.goto(url);
    await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
    await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
    await page.getByLabel('Open Figma capture', { exact: true }).setInputFiles({
      name: 'composition.json',
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
  const check = async app => {
    await app.getByRole('button', { name: 'Check application', exact: true }).click();
    await expect(app.getByRole('status')).toContainText('Source and paint checks passed');
  };
  const verifySvg = async (app, svg) => {
    const preview = app.locator('.guideline-composition-preview > svg').first();
    await expect(preview).toBeVisible();
    const inline = await preview.evaluate(node => node.outerHTML);
    const normalized = await page.evaluate(value => {
      const host = document.createElement('div');
      host.innerHTML = value;
      return host.querySelector('svg').outerHTML;
    }, svg);
    expect(inline).toBe(normalized);
    expect(await preview.locator('linearGradient').count()).toBe(1);
    expect(await preview.locator('stop').count()).toBeGreaterThan(1);
    return inline;
  };
  let app = await open(f.json);
  await app.getByLabel('Application type', { exact: true }).selectOption('composition');
  await app.getByLabel('Composition source context', { exact: true }).selectOption('brand');
  await expect(app.getByRole('button', { name: 'Check application', exact: true })).toBeDisabled();
  await app.getByRole('button', { name: 'Use selected gradient', exact: true }).click();
  await app.getByLabel('Panel heading', { exact: true }).fill('A useful complete composition');
  await app
    .getByLabel('Panel body', { exact: true })
    .fill('Source colors, exact gradient, and readable copy.');
  await app.getByLabel('Canvas', { exact: true }).selectOption(f.white);
  await app.getByLabel('Heading', { exact: true }).selectOption(f.black);
  await app.getByLabel('Body', { exact: true }).selectOption(f.black);
  await app.getByLabel('Map panel regions to guideline roles').check();
  for (const [region, role] of [
    ['ground', 'ground'],
    ['heading', 'text-1'],
    ['body', 'text-2'],
  ])
    await app.getByLabel(`Panel ${region} source role`, { exact: true }).selectOption(role);
  const gradientRole = app.getByLabel('Gradient source role', { exact: true });
  if (await gradientRole.count()) await gradientRole.selectOption('decoration');
  await check(app);
  const svg = await download(app, 'Download composition SVG');
  const application = await download(app, 'Save application');
  const first = JSON.parse(application);
  expect(first.request.decorativeGradient.selection).toEqual(f.selection);
  expect(first.recipe.selection.applications[0].gradients[0].paint.compiledPaint).toEqual(
    f.selection.design.compiledPaint
  );
  await verifySvg(app, svg);
  await expect(app.getByRole('button', { name: 'Application CSS', exact: true })).toHaveCount(0);
  await expect(app.getByRole('button', { name: 'Application tokens', exact: true })).toHaveCount(0);
  receipt.checks.push(
    'Production controls attach a selected two-color continuous gradient, check the complete board, and export the exact inline SVG and retained compiled paint; no incomplete solid-only export is offered.'
  );

  await app.getByLabel('Panel heading', { exact: true }).fill('');
  await expect(app.getByRole('button', { name: 'Check application', exact: true })).toBeDisabled();
  expect(await download(app, 'Download composition SVG')).toBe(svg);
  await app.getByLabel('Panel heading', { exact: true }).fill('W'.repeat(256));
  await expect(app.getByRole('button', { name: 'Check application', exact: true })).toBeDisabled();
  const unfinished = await download(page, 'Save Figma project');
  expect(JSON.parse(unfinished).authoring.application.panel.heading).toBe('W'.repeat(256));
  expect(await download(app, 'Save application')).toBe(application);
  await context.close();
  context = await newContext();
  app = await open(unfinished);
  await expect(app.getByLabel('Panel heading', { exact: true })).toHaveValue('W'.repeat(256));
  expect(await download(app, 'Download composition SVG')).toBe(svg);
  await app.getByLabel('Panel heading', { exact: true }).fill('A useful complete composition');
  await app.getByLabel('Body', { exact: true }).selectOption(f.white);
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(app.getByText('Latest attempt needs changes', { exact: true })).toBeVisible();
  expect(await download(app, 'Save application')).toBe(application);
  receipt.checks.push(
    'Blank/overflowing text and failed contrast preserve the prior checked export. Cold reopening restores both unfinished edits and exact checked composition.'
  );

  await app.getByLabel('Body', { exact: true }).selectOption(f.black);
  await page.evaluate(() => {
    const native = window.setTimeout;
    window.setTimeout = function (callback, delay, ...args) {
      if (delay === 0) {
        window.setTimeout = native;
        window.releaseCompositionYield = () => callback(...args);
        return -1;
      }
      return native(callback, delay, ...args);
    };
  });
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof window.releaseCompositionYield))
    .toBe('function');
  await app.getByRole('button', { name: 'Cancel application check', exact: true }).click();
  await page.evaluate(() => {
    window.releaseCompositionYield();
    delete window.releaseCompositionYield;
  });
  await expect(app.getByRole('status')).toContainText('Application check cancelled');
  expect(await download(app, 'Save application')).toBe(application);
  receipt.checks.push(
    'Cancelling at a held real cooperative engine yield retains the checked composition and its exact export.'
  );

  await chooseGuidelineTask(page, 'gradient');
  const editor = page.getByRole('region', { name: 'Mode-aware gradient editor', exact: true });
  await editor.getByLabel('Angle', { exact: true }).fill('137');
  await editor.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Make gradient', exact: true })).toBeEnabled();
  const changedStandalone = JSON.parse(await download(page, 'Save Figma project'));
  expect(changedStandalone.gradientSelection.design.angleDegrees).toBe(137);
  expect(changedStandalone.outputs.application.request.decorativeGradient.selection).toEqual(
    f.selection
  );
  await chooseGuidelineTask(page, 'application');
  app = page.getByRole('region', { name: 'Color applications', exact: true });
  expect(await download(app, 'Save application')).toBe(application);
  receipt.checks.push(
    'Changing the standalone gradient through its own controls does not silently replace the composition’s embedded choice.'
  );

  await app.getByText('Custom canvas and label colors', { exact: true }).click();
  await app.getByRole('button', { name: 'Add canvas color', exact: true }).click();
  await app.getByRole('button', { name: 'Add label color', exact: true }).click();
  for (const [label, hex] of [
    ['Custom canvas 1', '#F5F1E8'],
    ['Custom label 2', '#202020'],
  ]) {
    const paint = app.locator('.guideline-context-paint').filter({ hasText: label });
    await paint.getByLabel(`${label} hex`, { exact: true }).fill(hex);
    await paint.getByRole('button', { name: 'Set color', exact: true }).click();
  }
  const custom = async label =>
    app
      .getByLabel(label, { exact: true })
      .locator('option')
      .evaluateAll(options => options.find(o => o.textContent.includes(' · custom')).value);
  await app.getByLabel('Canvas', { exact: true }).selectOption(await custom('Canvas'));
  for (const label of ['Heading', 'Body'])
    await app.getByLabel(label, { exact: true }).selectOption(await custom(label));
  await check(app);
  const customApplication = await download(app, 'Save application');
  const customSvg = await download(app, 'Download composition SVG');
  const customValue = JSON.parse(customApplication);
  expect(customValue.recipe.selection.model.modelHash).not.toBe(f.review.model.modelHash);
  const bound = customValue.recipe.selection.applications[0].gradients[0].paint;
  expect(bound.sourceModelHash).toBe(customValue.recipe.selection.model.modelHash);
  expect(bound.compiledPaint).toEqual(f.selection.design.compiledPaint);
  expect(bound.stops).toEqual(f.selection.design.stops);
  expect(customValue.request.decorativeGradient.selection).toEqual(f.selection);
  const customInline = await verifySvg(app, customSvg);
  const saved = await download(page, 'Save Figma project');
  await page
    .getByRole('region', { name: 'Figma guideline capture', exact: true })
    .getByRole('button', { name: 'Save on this device', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  receipt.checks.push(
    'Authored non-source canvas and label colors create a distinct working model while retaining the original gradient selection, exact anchors and exact compiled paint; complete project saves to file and device.'
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(output, 'composition-mobile.png'), fullPage: true });
  await writeFile(path.join(output, 'axe.json'), JSON.stringify(scan, null, 2));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await app.screenshot({ path: path.join(output, 'composition-desktop.png') });
  receipt.checks.push(
    'At 390px the full authoring page has no horizontal overflow and zero automated axe violations. This is not a screen-reader observation.'
  );

  await context.close();
  context = await newContext();
  app = await open(saved);
  expect(await download(app, 'Save application')).toBe(customApplication);
  await verifySvg(app, customSvg);
  await context.setOffline(true);
  expect(await download(app, 'Save application')).toBe(customApplication);
  expect(await download(app, 'Download composition SVG')).toBe(customSvg);
  receipt.checks.push(
    'A new browser context rechecks the retained custom composition. Once opened, both full application and SVG exports replay exactly with network disabled.'
  );

  // Two identical offscreen documents compare the real inline paint to the downloaded paint,
  // keeping viewport, doctype, size and placement identical to avoid spurious raster differences.
  const render = async (svg, name) => {
    const renderPage = await context.newPage();
    await renderPage.setContent(
      `<!doctype html><html lang="en"><title>Composition export proof</title><body style="margin:16px;background:#888"><main style="width:800px">${svg}</main></body></html>`
    );
    await renderPage.locator('main > svg').evaluate(node => {
      node.style.width = '800px';
      node.style.height = 'auto';
    });
    const png = await renderPage.locator('main > svg').screenshot();
    await writeFile(path.join(output, name), png);
    await renderPage.close();
    return digest(png);
  };
  expect(await render(customInline, 'inline-paint.png')).toBe(
    await render(customSvg, 'export-paint.png')
  );
  receipt.checks.push(
    'Actual preview DOM equals downloaded SVG; their rendered PNGs are byte-identical in matched document environments.'
  );

  await browser.close();
  browser = null;
  await production.httpServer.close();
  production = null;
  modules = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const { readGuidelineApplication, exportGuidelineApplication } = await modules.ssrLoadModule(
    '/src/lib/guideline/application.ts'
  );
  const { readAnyGuidelineProject } = await modules.ssrLoadModule(
    '/src/lib/guideline/projectCodec.ts'
  );
  const opened = await readAnyGuidelineProject(saved);
  expect(opened.status).toBe('opened');
  const nodeResult = await readGuidelineApplication(customApplication, opened.value.project.review);
  const nodeExport = await exportGuidelineApplication(nodeResult);
  expect(nodeExport.applicationJson).toBe(customApplication);
  expect(nodeExport.svgs[0].svg).toBe(customSvg);
  expect(nodeResult.decorativeGradient.exportable).toBe(true);
  receipt.checks.push(
    'Node reopens the browser-saved project and independently replays identical application JSON and complete SVG with passing gradient fidelity.'
  );
  await writeFile(path.join(output, 'project.json'), saved);
  await writeFile(path.join(output, 'application.json'), customApplication);
  await writeFile(path.join(output, 'composition.svg'), customSvg);
  receipt.projectSha256 = digest(saved);
  receipt.applicationSha256 = digest(customApplication);
  receipt.svgSha256 = digest(customSvg);
  expect(receipt.errors).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.errors.push(String(error));
  process.exitCode = 1;
  if (page)
    await page
      .screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
      .catch(() => {});
} finally {
  await browser?.close();
  await production?.httpServer.close();
  await modules?.close();
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
}
