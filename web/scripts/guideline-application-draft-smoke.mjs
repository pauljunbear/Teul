import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preview, createServer } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chooseGuidelineTask } from './guideline-task-navigation.mjs';

const runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/guideline-application-draft');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = { status: 'running', node: process.version, checks: [], scans: [], errors: [] };
await mkdir(output, { recursive: true });
let production, browser, modules;
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
  expect(scaleBundle.schemaVersion).toBe('teul.guideline-workspace.v9');
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

  const savedA = await download(page, 'Download project');
  const originalPaint = await app.locator('svg[aria-label="rest color preview"]').innerHTML();
  await choose('Continue label', '#126E78');
  await expect(
    app.getByText(
      'Showing the last checked application. Your current edits have not been checked.',
      { exact: true }
    )
  ).toBeVisible();
  expect(await app.locator('svg[aria-label="rest color preview"]').innerHTML()).toBe(originalPaint);
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(app.getByText('Latest attempt needs changes', { exact: true })).toBeVisible();
  expect(await app.locator('svg[aria-label="rest color preview"]').first().innerHTML()).toBe(
    originalPaint
  );
  expect(await download(app, 'Download rest SVG')).toBe(svg);
  expect(await download(app, 'Application CSS')).toBe(css);
  expect(await download(app, 'Save application')).toBe(application);
  await scan('retained-failed-attempt');
  receipt.checks.push(
    'Editing and a failed replacement retain the original checked paint and byte-identical SVG, CSS and application JSON; failed paints remain separately inspectable.'
  );
  const savedDraft = await download(page, 'Download project');
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  const reopen = async text => {
    await page.reload();
    await page.getByRole('tab', {name:'Guidelines',exact:true}).click();
    await page
      .getByLabel('Open guideline project', { exact: true })
      .setInputFiles({
        name: 'application-draft.json',
        mimeType: 'application/json',
        buffer: Buffer.from(text),
      });
    await expect(task(page)).toHaveValue(JSON.parse(text).authoring.activeTask);
  };
  await reopen(savedDraft);
  await expect(app.getByLabel('Continue label', { exact: true })).toHaveValue(
    JSON.parse(savedDraft).authoring.application.choices['all/label']
  );
  expect(await download(app, 'Save application')).toBe(application);
  await app.getByText('Change canvas, label or link in a specific state', { exact: true }).click();
  const override = app.getByLabel('hover label', { exact: true });
  await override.selectOption(
    await override.locator('option').filter({ hasText: '#182E34' }).getAttribute('value')
  );
  const explicitOverride = await override.inputValue();
  await expect(app.getByLabel('Pressed action', { exact: true })).toHaveValue('');
  await chooseGuidelineTask(page, 'extension');
  await extension.getByLabel('Scale name', { exact: true }).fill('New standalone B');
  await extension.getByLabel('Shade order', { exact: true }).selectOption('dark');
  await extension.getByRole('button', { name: 'Make scale', exact: true }).click();
  await expect(extension.getByRole('status')).toContainText('11 proposed shades');
  await chooseGuidelineTask(page, 'application');
  await expect(
    app.getByRole('button', { name: 'Use latest proposed scale', exact: true })
  ).toBeVisible();
  expect(await download(app, 'Save application')).toBe(application);
  const independent = await download(page, 'Download project');
  const packet = JSON.parse(independent);
  expect(packet.outputs.extension.preview.request.label).toBe('New standalone B');
  expect(packet.authoring.application.extension.request.label).toBe('Harbor product scale');
  expect(packet.authoring.application.choices['hover/label']).toBe(explicitOverride);
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await reopen(independent);
  await app.getByText('Change canvas, label or link in a specific state', { exact: true }).click();
  await expect(app.getByLabel('hover label', { exact: true })).toHaveValue(explicitOverride);
  await expect(app.getByLabel('Pressed action', { exact: true })).toHaveValue('');
  expect(await download(app, 'Save application')).toBe(application);
  receipt.checks.push(
    'Cold file reopen preserves explicit state overrides and blank inheritance; standalone scale B does not replace the application draft or checked result using A.'
  );
  // Remove the checked application so the draft must reconstruct A independently of standalone B.
  modules = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const codec = await modules.ssrLoadModule('/src/lib/guideline/projectCodec.ts');
  const drafts = await modules.ssrLoadModule('/src/lib/guideline/authoringDraft.ts');
  const opened = await codec.readAnyGuidelineProject(independent);
  expect(opened.status).toBe('opened');
  const review = opened.value.project.review;
  const input = {
    activeTask: 'application',
    extension: packet.authoring.extension,
    supporting: packet.authoring.supporting,
    gradient: packet.authoring.gradient,
    application: packet.authoring.application,
  };
  const draftOnly = await codec.serializeGuidelineWorkspace(packet.sourceProjectJson, {
    ...opened.value.outputs,
    application: null,
    authoring: drafts.createGuidelineAuthoringDraft(review, input),
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await reopen(draftOnly);
  await expect(app.getByRole('button', { name: 'Check application', exact: true })).toBeEnabled();
  await expect(app.getByLabel('Rest action', { exact: true })).toHaveValue(
    packet.authoring.application.choices['rest/action']
  );
  expect(
    await app.getByLabel('Rest action', { exact: true }).locator('option:checked').textContent()
  ).not.toContain('Unavailable');
  await expect(app.getByRole('button', { name: 'Save application', exact: true })).toHaveCount(0);
  receipt.checks.push(
    'A draft-only project reconstructs its own exact scale A even when B is the saved standalone scale; this creates no checked application or export authority.'
  );
  const tamperedInput = structuredClone(input);
  tamperedInput.application.extension.previewHash = `sha256:${'0'.repeat(64)}`;
  const tampered = await codec.serializeGuidelineWorkspace(packet.sourceProjectJson, {
    ...opened.value.outputs,
    application: null,
    authoring: drafts.createGuidelineAuthoringDraft(review, tamperedInput),
  });
  await reopen(tampered);
  await expect(app.getByRole('alert')).toContainText('proposed shades changed');
  await expect(app.getByRole('button', { name: 'Check application', exact: true })).toBeDisabled();
  await expect(app.getByLabel('Rest action', { exact: true })).toHaveValue(
    packet.authoring.application.choices['rest/action']
  );
  const blankInput = structuredClone(input);
  blankInput.application.modeId = '';
  blankInput.application.useExtension = false;
  blankInput.application.extension = null;
  const blank = await codec.serializeGuidelineWorkspace(packet.sourceProjectJson, {
    ...opened.value.outputs,
    application: null,
    authoring: drafts.createGuidelineAuthoringDraft(review, blankInput),
  });
  await reopen(blank);
  await expect(app.getByLabel('Application mode', { exact: true })).toHaveValue('');
  await expect(app.getByRole('button', { name: 'Check application', exact: true })).toBeDisabled();
  receipt.checks.push(
    'An altered reconstruction hash stops checking while retaining raw choices; an unfinished mode cold-opens without a render crash.'
  );
  await reopen(savedA);
  await chooseGuidelineTask(page, 'gradient');
  const gradient = region(page, 'Gradient proof');
  const search = gradient.locator('details.guideline-gradient-suggestions');
  await search.getByText('Explore complementary gradients', { exact: true }).click();
  await search.getByLabel('Gradient library', { exact: true }).selectOption('radix');
  await search.getByLabel('Gradient library scheme', { exact: true }).selectOption('dark');
  await search.getByLabel('Gradient exploration', { exact: true }).selectOption('expressive');
  const permission = search.getByRole('checkbox', {
    name: 'Allow proposed colors from this library for this gradient',
    exact: true,
  });
  await permission.check();
  const referencesBefore = await search
    .getByRole('checkbox')
    .evaluateAll(inputs =>
      inputs.filter(i => i.checked).map(i => i.parentElement.textContent.trim())
    );
  await gradient.getByLabel('Angle', { exact: true }).fill('73');
  await search.getByText('Explore complementary gradients', { exact: true }).click();
  await expect(search.getByLabel('Gradient library scheme', { exact: true })).toHaveValue('dark');
  await expect(permission).toBeChecked();
  expect(
    await search
      .getByRole('checkbox')
      .evaluateAll(inputs =>
        inputs.filter(i => i.checked).map(i => i.parentElement.textContent.trim())
      )
  ).toEqual(referencesBefore);
  const savedSearch = await download(page, 'Download project');
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await reopen(savedSearch);
  await search.getByText('Explore complementary gradients', { exact: true }).click();
  await expect(search.getByLabel('Gradient exploration', { exact: true })).toHaveValue(
    'expressive'
  );
  await expect(search.getByLabel('Gradient library', { exact: true })).toHaveValue('radix');
  await expect(search.getByLabel('Gradient library scheme', { exact: true })).toHaveValue('dark');
  await expect(permission).toBeChecked();
  await search.getByLabel('Gradient library', { exact: true }).selectOption('werner');
  await expect(permission).not.toBeChecked();
  await permission.check();
  await expect(search.locator('input[type=checkbox]:checked')).toHaveCount(2);
  await search.locator('input[type=checkbox]:checked').first().uncheck();
  await expect(permission).not.toBeChecked();
  receipt.checks.push(
    'Gradient search references, library, scheme, exploration and permission survive angle remounts and cold reopen; changing library or references clears permission.'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseGuidelineTask(page, 'application');
  await expect(app.getByRole('button',{name:'Download rest SVG',exact:true})).toBeEnabled();
  await scan('application-draft-mobile');
  await app.screenshot({ path: path.join(output, `${runtime}-application-draft.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(receipt.errors).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  const closed = await Promise.allSettled([
    browser?.close(),
    modules?.close(),
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
