import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preview, createServer } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chooseGuidelineTask } from './guideline-task-navigation.mjs';

const runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/guideline-chart-comparison');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = { status: 'running', node: process.version, checks: [], scans: [], errors: [] };
await mkdir(output, { recursive: true });
let production, browser, modules, page;
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
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => receipt.errors.push(error.message));
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
  await chooseGuidelineTask(page, 'application');
  const app = region(page, 'Color applications');
  await app.getByLabel('Application type', { exact: true }).selectOption('chart');
  await app.getByLabel('Chart count', { exact: true }).selectOption('2');
  await expect(
    page.getByRole('group', { name: 'Current design brief', exact: true })
  ).toContainText('Categorical chart');
  const choose = async (label, hex) => {
    const select = app.getByLabel(label, { exact: true });
    await select.selectOption(
      await select.locator('option').filter({ hasText: hex }).getAttribute('value')
    );
  };
  for (const [label, color] of [
    ['Canvas', '#F4EFE6'],
    ['Category A · 30', '#126E78'],
    ['Category B · 70', '#182E34'],
    ['Category A label', '#182E34'],
    ['Category B label', '#182E34'],
  ])
    await choose(label, color);
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(app.getByRole('status')).toContainText('Source and paint checks passed');
  const original = await download(app, 'Save application');
  const originalSvg = await download(app, 'Download chart SVG');
  const originalCss = await download(app, 'Application CSS');
  expect(JSON.parse(original).schemaVersion).toBe('teul.guideline-application.v3');
  const painted = () =>
    app
      .locator('.guideline-application-boards svg')
      .first()
      .locator('path')
      .evaluateAll(paths =>
        paths.map(p => ({ d: p.getAttribute('d'), fill: p.getAttribute('fill') }))
      );
  const originalPaint = await painted();
  expect(originalPaint).toHaveLength(5);
  for (const p of originalPaint) expect(originalSvg).toContain(`fill="${p.fill}"`);
  expect(originalSvg).toContain('Category A: 30');
  expect(originalSvg).not.toContain('<text');
  await app.getByText('Example data and chart checks', { exact: true }).first().click();
  await expect(app.getByRole('table', { name: 'Chart example data' })).toBeVisible();
  await expect(app.getByText(/Advisory CVD evidence/)).toBeVisible();
  await scan('categorical-desktop');
  await app.screenshot({ path: path.join(output, `${runtime}-categorical.png`) });
  receipt.checks.push(
    'Source-only categorical bars paint measured direct labels, example values, actual gaps and exact native colors; SVG, CSS and the accessible data table agree.'
  );
  await app.getByLabel('Chart count', { exact: true }).selectOption('3');
  await expect(
    app.getByText('Showing the last checked application. Your current edits have not been checked.')
  ).toBeVisible();
  expect(await painted()).toEqual(originalPaint);
  const retained = await download(page, 'Download project');
  expect(JSON.parse(retained).authoring.application.chart.count).toBe(3);
  expect(JSON.parse(retained).outputs.application.request.layout.count).toBe(2);
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'chart.json',
    mimeType: 'application/json',
    buffer: Buffer.from(retained),
  });
  await expect(app.getByLabel('Chart count', { exact: true })).toHaveValue('3');
  await expect(app.getByLabel('Category C · 40', { exact: true })).toHaveValue('');
  expect(await painted()).toEqual(originalPaint);
  expect(await download(app, 'Save application')).toBe(original);
  expect(await download(app, 'Application CSS')).toBe(originalCss);
  receipt.checks.push(
    'Cold project reopen preserves the checked two-category chart and its exports independently from the unfinished three-category draft.'
  );
  await chooseGuidelineTask(page, 'extension');
  const extension = region(page, 'Source scale extension');
  const anchor = extension.getByLabel('Brand color', { exact: true });
  const anchorId = await anchor
    .locator('option')
    .filter({ hasText: '#126E78' })
    .getAttribute('value');
  await anchor.selectOption(anchorId);
  await extension.getByLabel('Scale name', { exact: true }).fill('Chart sample');
  await extension.getByLabel('Use', { exact: true }).selectOption('product');
  await extension.getByRole('button', { name: 'Make scale', exact: true }).click();
  await expect(extension.getByRole('status')).toContainText('11 proposed shades');
  const bundle = JSON.parse(await download(page, 'Download project'));
  const scalePreview = bundle.outputs.extension.preview;
  await chooseGuidelineTask(page, 'application');
  await app.getByLabel('Chart meaning', { exact: true }).selectOption('sequential');
  await expect(
    page.getByRole('group', { name: 'Current design brief', exact: true })
  ).toContainText('Sequential chart');
  await app.getByLabel('Application colors', { exact: true }).selectOption('extension');
  await expect(app.getByLabel('Application type', { exact: true })).toHaveValue('chart');
  await app.getByLabel('Application anchor', { exact: true }).selectOption(anchorId);
  await choose('Canvas', '#F4EFE6');
  for (let i = 1; i <= 3; i++) {
    await choose(`Level ${i} label`, '#182E34');
    const binding = scalePreview.generatedBindings.find(b => b.slotId === `step:${i + 9}`);
    expect(binding).toBeTruthy();
    await app.getByLabel(`Level ${i} · ${i * 10}`, { exact: true }).selectOption(binding.colorId);
  }
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(app.getByRole('status')).toContainText('Source and paint checks passed');
  const sequential = await download(app, 'Save application');
  expect(JSON.parse(sequential).request.extension.purpose).toBe('sequential-data');
  const sequentialSvg = await download(app, 'Download chart SVG');
  const sequentialPaint = await painted();
  await app.getByRole('button', { name: 'Compare with original colors', exact: true }).click();
  const comparison = app.locator('.guideline-chart-comparison');
  const comparePaint = side =>
    comparison
      .locator(`[data-comparison-paint="${side}"] svg path`)
      .evaluateAll(paths =>
        paths.map(p => ({ d: p.getAttribute('d'), fill: p.getAttribute('fill') }))
      );
  for (let i = 1; i <= 3; i++)
    await expect(
      comparison.getByLabel(`Original Level ${i} · ${i * 10}`, { exact: true })
    ).toHaveValue('');
  await expect(comparison.locator('[data-comparison-paint="source"] svg')).toHaveCount(0);
  await expect(
    comparison.getByRole('button', { name: 'Check and use original colors', exact: true })
  ).toBeDisabled();
  for (const [label, hex] of [
    ['Original Level 1 · 10', '#126E78'],
    ['Original Level 2 · 20', '#182E34'],
    ['Original Level 3 · 30', '#182E34'],
  ])
    await choose(label, hex);
  const originalOptions = await comparison
    .locator('option')
    .evaluateAll(options => options.map(o => o.value));
  expect(scalePreview.generatedBindings.some(b => originalOptions.includes(b.colorId))).toBe(false);
  const originalComparison = await comparePaint('source');
  expect(originalComparison.map(p => p.d)).toEqual(sequentialPaint.map(p => p.d));
  expect(await comparePaint('proposal')).toEqual(sequentialPaint);
  expect(originalComparison.map(p => p.fill)).not.toEqual(sequentialPaint.map(p => p.fill));
  expect(await download(app, 'Save application')).toBe(sequential);
  await scan('comparison-desktop');
  await comparison.screenshot({ path: path.join(output, `${runtime}-comparison-desktop.png`) });
  await comparison
    .getByRole('button', { name: 'Check and use original colors', exact: true })
    .click();
  await expect(app.getByRole('status')).toContainText('Original colors need changes');
  expect(await painted()).toEqual(sequentialPaint);
  expect(await download(app, 'Save application')).toBe(sequential);
  expect(await comparePaint('source')).toEqual(originalComparison);
  receipt.checks.push(
    'Original chart comparison leaves generated roles unassigned, excludes generated choices, shares exact paths with the retained proposal, and preserves exports when original quantitative ordering fails.'
  );
  await page.evaluate(() => {
    const original = window.setTimeout;
    window.holdChartComparison = true;
    window.releaseChartComparison = null;
    window.setTimeout = (fn, delay, ...args) => {
      if (delay === 0 && window.holdChartComparison) {
        window.holdChartComparison = false;
        window.releaseChartComparison = () => fn(...args);
        return -1;
      }
      return original(fn, delay, ...args);
    };
    window.restoreChartClock = () => {
      window.setTimeout = original;
    };
  });
  await comparison
    .getByRole('button', { name: 'Check and use original colors', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => typeof window.releaseChartComparison))
    .toBe('function');
  await app.getByRole('button', { name: 'Cancel application check', exact: true }).click();
  await page.evaluate(() => {
    window.restoreChartClock();
    window.releaseChartComparison();
  });
  await expect(app.getByRole('status')).toContainText('Application check cancelled');
  expect(await download(app, 'Save application')).toBe(sequential);
  await app.getByLabel('Chart count', { exact: true }).selectOption('4');
  expect(await comparePaint('proposal')).toEqual(sequentialPaint);
  expect(await comparePaint('source')).toEqual(originalComparison);
  await app.getByLabel('Chart count', { exact: true }).selectOption('3');
  receipt.checks.push(
    'Cancelled original checks and unrelated unfinished chart-count edits cannot replace or repaint the compared selection.'
  );
  await app.getByText('Example data and chart checks', { exact: true }).first().click();
  await expect(app.getByText(/Sequential ordering: passes/)).toBeVisible();
  await app
    .getByLabel('Sequential lightness direction', { exact: true })
    .selectOption('dark-to-light');
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(app.getByRole('status')).toContainText(
    'last checked application and exports are retained'
  );
  await expect(app.getByText('Latest attempt needs changes', { exact: true })).toBeVisible();
  expect(await painted()).toEqual(sequentialPaint);
  expect(await download(app, 'Save application')).toBe(sequential);
  expect(await download(app, 'Download chart SVG')).toBe(sequentialSvg);
  receipt.checks.push(
    'A selected source-derived scale stays in the chart context, records sequential-data use, and passes real contrast/order checks; reversing order preserves the last exportable chart.'
  );
  const latest = await download(page, 'Download project');
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'sequential.json',
    mimeType: 'application/json',
    buffer: Buffer.from(latest),
  });
  await expect(app.getByLabel('Sequential lightness direction', { exact: true })).toHaveValue(
    'dark-to-light'
  );
  await expect(app.getByRole('button', { name: 'Save application', exact: true })).toBeEnabled();
  await context.setOffline(true);
  expect(await download(app, 'Save application')).toBe(sequential);
  expect(await download(app, 'Download chart SVG')).toBe(sequentialSvg);
  await context.setOffline(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await app.getByLabel('Chart count', { exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(app.getByLabel('Sequential lightness direction', { exact: true })).toBeFocused();
  await scan('sequential-mobile');
  await app.screenshot({ path: path.join(output, `${runtime}-sequential-mobile.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  receipt.checks.push(
    'Sequential project reopen and offline export reproduce the retained exact paints; keyboard controls, mobile layout and automated accessibility scans pass.'
  );
  // Build a source-bound two-mode fixture through the same native reader and review compiler.
  modules = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const inventoryModule = await modules.ssrLoadModule('/src/lib/guideline/figmaInventory.ts');
  const reviewModule = await modules.ssrLoadModule('/src/lib/guideline/figmaReview.ts');
  const projectModule = await modules.ssrLoadModule('/src/lib/guideline/figmaProject.ts');
  const extensionModule = await modules.ssrLoadModule('/src/lib/guideline/extension.ts');
  const codec = await modules.ssrLoadModule('/src/lib/guideline/projectCodec.ts');
  const authoringModule = await modules.ssrLoadModule('/src/lib/guideline/authoringDraft.ts');
  const draftModule = await modules.ssrLoadModule('/src/lib/guideline/applicationDraft.ts');
  const { canonicalIntakeJson } = await modules.ssrLoadModule(
    '../services/guideline-intake/src/protocol.ts'
  );
  const originalPacket = JSON.parse(
    await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8')
  ).capture;
  const { contentHash: ignoredHash, ...sourcePacket } = originalPacket;
  void ignoredHash;
  sourcePacket.request.includeVariables = true;
  sourcePacket.variables = {
    status: 'captured',
    revision: null,
    relationship: 'unversioned-current-read',
    values: Object.fromEntries(
      [
        ['paper', 'Variable paper', { r: 1, g: 1, b: 1, a: 1 }],
        ['ink', 'Variable ink', { r: 0.1, g: 0.2, b: 0.3, a: 1 }],
      ].map(([id, name, value]) => [
        id,
        {
          id,
          name,
          variableCollectionId: 'brand',
          resolvedType: 'COLOR',
          valuesByMode: { day: value, night: value },
        },
      ])
    ),
    collections: {
      brand: {
        id: 'brand',
        name: 'Brand',
        modes: [
          { modeId: 'day', name: 'Day' },
          { modeId: 'night', name: 'Night' },
        ],
        defaultModeId: 'day',
      },
    },
  };
  const inventory = await inventoryModule.createFigmaNativeInventory({
    ...sourcePacket,
    contentHash: `sha256:${digest(canonicalIntakeJson(sourcePacket))}`,
  });
  const draft = reviewModule.suggestFigmaReview(inventory);
  draft.modeIds = inventory.modes
    .filter(m => m.nativeModeId === 'day' || m.nativeModeId === 'night')
    .map(m => m.id);
  draft.colors = inventory.declarations
    .filter(d => d.kind === 'variable')
    .map(d => ({ declarationId: d.id, label: d.label, family: 'Primary' }));
  const actor = { kind: 'user', ref: 'test:multi-mode-chart' },
    at = '2026-09-27T12:00:00.000Z';
  draft.profileDecision = {
    captureHash: inventory.packet.contentHash,
    interpretation: 'srgb',
    actor,
    decidedAt: at,
  };
  draft.scopeDecision = { accepted: true, reason: 'Synthetic browser regression fixture.' };
  draft.statements = draft.statements.map(statement => ({
    ...statement,
    meaning: 'not-a-rule',
    reason: 'Synthetic fixture statement.',
  }));
  const review = reviewModule.compileFigmaReview(inventory, draft, actor, at);
  const secondMode = inventory.modes.find(m => m.nativeModeId === 'night').id;
  expect(review.model.contexts.find(c => c.id === 'product').modeIds[0]).not.toBe(secondMode);
  const ink = review.model.colors.find(c => c.label === 'Variable ink').id;
  const paper = review.model.colors.find(c => c.label === 'Variable paper').id;
  const nativeProject = await projectModule.buildFigmaProject({
    capture: inventory.packet,
    draft,
    review,
    selection: null,
  });
  const pair = {
    preview: await extensionModule.previewGuidelineExtension(review, {
      kind: 'new-scale',
      context: 'product',
      modeId: secondMode,
      familyId: review.model.families.find(f => f.colorIds.includes(ink))?.id ?? null,
      anchorColorId: ink,
      label: 'Second mode scale',
      scaleId: 'second-mode',
      polarity: 'light',
    }),
    decision: null,
  };
  expect(pair.preview.status, JSON.stringify(pair.preview)).toBe('proposed');
  const authoring = authoringModule.createGuidelineAuthoringDraft(review, {
    ...authoringModule.EMPTY_GUIDELINE_AUTHORING,
    activeTask: 'application',
    application: {
      kind: 'product',
      modeId: secondMode,
      layoutName: 'split',
      primaryShare: 60,
      useExtension: true,
      extension: draftModule.captureGuidelineDraftExtension(pair),
      choices: {},
      anchorColorId: ink,
      brandPurpose: 'brand-primary',
      ruleChoices: {},
    },
  });
  const twoModes = await codec.serializeGuidelineWorkspace(JSON.stringify(nativeProject), {
    extension: pair,
    application: null,
    authoring,
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  const figmaPanel = page.locator('.guideline-figma:not(.guideline-website)');
  await figmaPanel.locator(':scope > summary').click();
  const nativeApp = region(figmaPanel, 'Color applications');
  await figmaPanel.getByLabel('Open Figma capture', { exact: true }).setInputFiles({
    name: 'two-modes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(twoModes),
  });
  await expect(nativeApp.getByLabel('Application mode', { exact: true })).toHaveValue(secondMode);
  await nativeApp.getByLabel('Application type', { exact: true }).selectOption('chart');
  await expect(nativeApp.getByLabel('Application mode', { exact: true })).toHaveValue(secondMode);
  await expect(nativeApp.getByLabel('Application mode', { exact: true })).toBeDisabled();
  await expect(nativeApp.getByLabel('Application colors', { exact: true })).toHaveValue(
    'extension'
  );
  await nativeApp.getByLabel('Application anchor', { exact: true }).selectOption(ink);
  await nativeApp.getByLabel('Canvas', { exact: true }).selectOption(paper);
  for (const [i, name, value] of [
    [1, 'A', 30],
    [2, 'B', 70],
    [3, 'C', 40],
  ]) {
    await nativeApp.getByLabel(`Category ${name} label`, { exact: true }).selectOption(ink);
    await nativeApp
      .getByLabel(`Category ${name} · ${value}`, { exact: true })
      .selectOption(pair.preview.generatedBindings.find(b => b.slotId === `step:${i + 9}`).colorId);
  }
  await nativeApp.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(nativeApp.getByRole('status')).toContainText('Source and paint checks passed');
  const multi = JSON.parse(await download(nativeApp, 'Save application'));
  expect(multi.request.layout.modeId).toBe(secondMode);
  expect(multi.request.extension.purpose).toBe('categorical-data');
  receipt.checks.push(
    'A selected scale in the second source mode retains that mode when switching from product controls to Chart, then passes categorical assessment and export.'
  );
  const nativeComparison = nativeApp.locator('.guideline-chart-comparison');
  await nativeApp
    .getByRole('button', { name: 'Compare with original colors', exact: true })
    .click();
  for (const [name, value] of [
    ['A', 30],
    ['B', 70],
    ['C', 40],
  ]) {
    const control = nativeComparison.getByLabel(`Original Category ${name} · ${value}`, {
      exact: true,
    });
    await expect(control).toHaveValue('');
    await control.selectOption(ink);
  }
  const sourcePaints = await nativeComparison
    .locator('[data-comparison-paint="source"] svg path')
    .evaluateAll(paths =>
      paths.map(p => ({ d: p.getAttribute('d'), fill: p.getAttribute('fill') }))
    );
  await nativeComparison
    .getByRole('button', { name: 'Check and use original colors', exact: true })
    .click();
  await expect(nativeApp.getByRole('status')).toContainText('Original colors passed the checks');
  await expect(
    nativeApp.getByRole('heading', { name: 'Try the colors in use', exact: true })
  ).toBeFocused();
  await expect(nativeApp.getByLabel('Application colors', { exact: true })).toHaveValue('source');
  expect(
    await nativeApp
      .locator('.guideline-application-boards svg path')
      .evaluateAll(paths =>
        paths.map(p => ({ d: p.getAttribute('d'), fill: p.getAttribute('fill') }))
      )
  ).toEqual(sourcePaints);
  const chosenSource = await download(nativeApp, 'Save application');
  const chosenSvg = await download(nativeApp, 'Download chart SVG');
  expect(JSON.parse(chosenSource).request.extension).toBeNull();
  expect(
    JSON.parse(chosenSource).request.assignments.every(a => [paper, ink].includes(a.colorId))
  ).toBe(true);
  const originalWorkspace = await download(figmaPanel, 'Save Figma project');
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await figmaPanel.locator(':scope > summary').click();
  await figmaPanel.getByLabel('Open Figma capture', { exact: true }).setInputFiles({
    name: 'original-chart.json',
    mimeType: 'application/json',
    buffer: Buffer.from(originalWorkspace),
  });
  await expect(
    nativeApp.getByRole('button', { name: 'Save application', exact: true })
  ).toBeEnabled();
  await context.setOffline(true);
  expect(await download(nativeApp, 'Save application')).toBe(chosenSource);
  expect(await download(nativeApp, 'Download chart SVG')).toBe(chosenSvg);
  await context.setOffline(false);
  await nativeApp
    .getByRole('button', { name: 'Compare with original colors', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    nativeApp.getByRole('button', { name: 'Hide chart comparison', exact: true })
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(nativeComparison.getByLabel('Original Canvas', { exact: true })).toHaveValue(paper);
  await scan('comparison-mobile');
  await nativeComparison.screenshot({
    path: path.join(output, `${runtime}-comparison-mobile.png`),
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  receipt.checks.push(
    'A checked original native palette can replace the proposed categorical chart, retaining exact comparison paint, second source mode and focus; saved project and SVG reopen offline unchanged, with keyboard/mobile comparison accessibility checks.'
  );
  expect(receipt.errors).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  if (page)
    await writeFile(
      path.join(output, 'failure-ui.txt'),
      await page.locator('body').innerText()
    ).catch(() => {});
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
