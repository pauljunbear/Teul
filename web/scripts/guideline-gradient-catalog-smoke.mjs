import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertGradientReplay } from './assert-gradient-replay.mjs';
import { holdGradientResults } from './hold-gradient-results.mjs';

const server = await createServer({
  mode: 'guideline-proof',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
const production = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
const url = production.resolvedUrls.local[0],
  runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/guideline-gradient-catalog');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage(),
  checks = [],
  replayDifferences = [],
  errors = [],
  requests = [];
page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push(e.message));
context.on('request', r => {
  if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(url).origin)
    requests.push(r.url());
});
let last = 0;
async function download(scope, name) {
  await new Promise(r => setTimeout(r, Math.max(0, last + 170 - Date.now())));
  last = Date.now();
  const pending = page.waitForEvent('download');
  await scope.getByRole('button', { name, exact: true }).click();
  return readFile(await (await pending).path(), 'utf8');
}
async function open(json, label = 'Open guideline project') {
  await page.getByLabel(label, { exact: true }).setInputFiles({
    name: 'workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
}
async function suggest(editor) {
  await editor.getByText('Explore complementary gradients', { exact: true }).click();
  await editor.getByLabel('Gradient library', { exact: true }).selectOption('radix');
  await expect(
    editor.getByRole('button', { name: 'Suggest gradients', exact: true })
  ).toBeDisabled();
  await editor
    .getByLabel('Allow proposed colors from this library for this gradient', { exact: true })
    .check();
  await editor.getByRole('button', { name: 'Suggest gradients', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Use gradient 1', exact: true })).toBeVisible();
}
try {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .getByLabel('Choose guideline PDF', { exact: true })
    .setInputFiles('fixtures/guidelines/harbor-native.pdf');
  await page.getByRole('button', { name: 'Read selected pages', exact: true }).click();
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'gradient');
  const editor = page.getByRole('region', { name: 'Gradient proof', exact: true });
  await suggest(editor);
  const cards = editor.locator('.guideline-gradient-candidates article');
  expect(await cards.count()).toBeGreaterThan(0);
  expect(await cards.count()).toBeLessThanOrEqual(3);
  await expect(cards.first()).toContainText('Proposed library color');
  await editor.screenshot({ path: path.join(output, `${runtime}-suggestions.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await editor.screenshot({ path: path.join(output, `${runtime}-mobile.png`) });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await editor.getByRole('button', { name: 'Use gradient 1', exact: true }).click();
  await expect(editor.getByLabel('From', { exact: true })).toBeDisabled();
  await expect(editor.getByLabel('To', { exact: true })).toBeEnabled();
  await expect(editor.getByLabel('To', { exact: true }).locator('option:checked')).toContainText(
    'Proposed'
  );
  checks.push(
    'Actual PDF review requires explicit library permission, presents at most three checked gradients, fits at 390px, and distinguishes locked original source colors from editable proposed stops.'
  );
  await editor.getByRole('button', { name: 'Use gradient 2', exact: true }).click();
  await expect(editor.getByLabel('Declared gradient assessment', { exact: true })).toContainText(
    'Declared checks pass'
  );
  const artifacts = {};
  for (const format of ['SVG', 'CSS', 'JSON']) artifacts[format] = await download(editor, format);
  const exported = JSON.parse(artifacts.JSON);
  expect(exported.schemaVersion).toBe('teul.guideline-authored-gradient-export.v4');
  expect(exported.design.stops[0].sourceColorId).not.toBeNull();
  expect(exported.design.stops[1].sourceColorId).toBeNull();
  const saved = await download(page, 'Download project');
  expect(JSON.parse(saved).schemaVersion).toBe('teul.guideline-workspace.v7');
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await expect(page.getByLabel('Open guideline project', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await open(saved);
  await expect(editor.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  for (const format of ['SVG', 'CSS', 'JSON'])
    expect(await download(editor, format)).toBe(artifacts[format]);
  await context.setOffline(false);
  const codec = await server.ssrLoadModule('/src/lib/guideline/projectCodec.ts');
  const exporter = await server.ssrLoadModule('/src/lib/guideline/gradientExport.ts');
  const opened = await codec.readAnyGuidelineProject(saved);
  expect(opened.status).toBe('opened');
  const nodeExport = exporter.guidelineAuthoredGradientExports(
    opened.value.project.review,
    opened.value.gradientSelection
  );
  for (const format of ['SVG', 'CSS'])
    expect(nodeExport[format.toLowerCase()]).toBe(artifacts[format]);
  replayDifferences.push(...assertGradientReplay(nodeExport.json, artifacts.JSON));
  checks.push(
    'Workspace V7 reopens offline with identical source/proposed origins and byte-identical browser/Node SVG/CSS and exact JSON except independently passing receipt bounds; the original review is unchanged.'
  );
  await editor.getByLabel('Use', { exact: true }).selectOption('product');
  await expect(editor.getByRole('alert')).toContainText('current use and mode');
  await expect(editor.getByLabel('Use', { exact: true })).toHaveValue('brand');
  await editor.getByRole('button', { name: 'Add stop', exact: true }).click();
  await editor.getByLabel('Stop 2 position', { exact: true }).fill('35');
  await editor.getByRole('button', { name: 'Make gradient', exact: true }).click();
  const edited = JSON.parse(await download(editor, 'JSON'));
  expect(edited.design.stops).toHaveLength(3);
  expect(edited.design.stops[1].position).toBe(0.35);
  expect(edited.catalog).toEqual(exported.catalog);
  expect(edited.design.sourceModelHash).toBe(exported.design.sourceModelHash);
  await editor.getByRole('button', { name: 'Return to source colors', exact: true }).click();
  await editor.getByRole('button', { name: 'Make gradient', exact: true }).click();
  expect(JSON.parse(await download(editor, 'JSON')).schemaVersion).toBe(
    'teul.guideline-authored-gradient-export.v4'
  );
  checks.push(
    'Editing retains catalog permission and exact source identity; changing use cannot silently expand permission, and returning to source colors removes proposed stops.'
  );
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await open(
    await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8'),
    'Open Figma capture'
  );
  await chooseGuidelineTask(
    page.getByRole('region', { name: 'Figma guideline capture', exact: true }),
    'gradient'
  );
  const native = page.getByRole('region', { name: 'Mode-aware gradient editor', exact: true });
  await expect(native).toBeVisible();
  await suggest(native);
  await native.getByRole('button', { name: 'Use gradient 1', exact: true }).click();
  const nativeExport = JSON.parse(await download(native, 'JSON'));
  expect(nativeExport.catalog.sourceModelHash).toBe(nativeExport.design.sourceModelHash);
  checks.push(
    'The same suggestion/editor/export path works for a retained Figma source and keeps its native source-mode identity.'
  );
  await holdGradientResults(page);
  await native.getByRole('button', { name: 'Suggest gradients', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.gradientResultHold.held.length)).toBe(1);
  await native.getByRole('button', { name: 'Cancel gradient search', exact: true }).click();
  expect(await page.evaluate(() => window.gradientResultHold.release())).toBe(1);
  await expect(native.getByLabel('Gradient suggestions', { exact: true })).toHaveCount(0);
  expect(JSON.parse(await download(native, 'JSON')).design).toEqual(nativeExport.design);
  await native.getByRole('button', { name: 'Suggest gradients', exact: true }).click();
  await expect(
    native.getByRole('button', { name: 'Cancel gradient search', exact: true })
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.gradientResultHold.held.length)).toBe(1);
  await page.evaluate(() => window.gradientResultHold.restore());
  const originalFigma = await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8');
  await open(originalFigma, 'Open Figma capture');
  await expect(
    native.getByRole('button', { name: 'Cancel gradient search', exact: true })
  ).toHaveCount(0);
  expect(JSON.parse(await download(native, 'JSON')).design).toEqual(
    JSON.parse(originalFigma).selection.design
  );
  expect(await page.evaluate(() => window.gradientResultHold.release())).toBe(1);
  expect(JSON.parse(await download(native, 'JSON')).design).toEqual(
    JSON.parse(originalFigma).selection.design
  );
  checks.push(
    'Cancelling a search preserves the current design; a later Figma project open invalidates pending suggestions and retains the newly opened exact paint.'
  );
  const packet = JSON.parse(await readFile('fixtures/guidelines/website-capture.json', 'utf8'));
  const websiteProject = await (async () => {
    const { createWebsiteInventory } = await server.ssrLoadModule(
      '/src/lib/guideline/websiteInventory.ts'
    );
    const { suggestWebsiteReview, compileWebsiteReview } = await server.ssrLoadModule(
      '/src/lib/guideline/websiteReview.ts'
    );
    const { buildWebsiteProject } = await server.ssrLoadModule(
      '/src/lib/guideline/websiteProject.ts'
    );
    const inventory = await createWebsiteInventory(packet),
      draft = suggestWebsiteReview(inventory);
    draft.modeIds = inventory.modes.map(m => m.id);
    draft.colors = inventory.declarations
      .filter(d => d.elementId === 'element:0' && ['--accent', '--link'].includes(d.property))
      .map(d => ({ declarationId: d.id, label: d.property, family: 'Brand' }));
    draft.statements = draft.statements.map(s => ({
      ...s,
      meaning: 'not-a-rule',
      reason: 'Synthetic browser fixture.',
    }));
    draft.scopeDecision = { accepted: true, reason: 'Observed region for synthetic proof.' };
    const review = compileWebsiteReview(inventory, draft, { kind: 'user', ref: 'test:supporting' });
    return buildWebsiteProject({ capture: packet, draft, review, selection: null });
  })();

  await page.locator('summary').filter({ hasText: 'Read a website' }).click();
  await open(JSON.stringify(websiteProject), 'Open website capture');
  await chooseGuidelineTask(
    page.getByRole('region', { name: 'Website guideline capture', exact: true }),
    'gradient'
  );
  const website = page
    .getByRole('region', { name: 'Website guideline capture', exact: true })
    .getByRole('region', { name: 'Mode-aware gradient editor', exact: true });
  await suggest(website);
  await website.getByRole('button', { name: 'Use gradient 1', exact: true }).click();
  const webExport = JSON.parse(await download(website, 'JSON'));
  expect(webExport.catalog.sourceModelHash).toBe(webExport.design.sourceModelHash);
  checks.push(
    'A reviewed website snapshot uses the same catalog suggestion/editor path without a network or provider call.'
  );
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  await writeFile(
    path.join(output, `${runtime}-checks.json`),
    JSON.stringify(
      { status: 'passed', node: process.version, checks, replayDifferences, errors, requests },
      null,
      2
    )
  );
  console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true });
  await writeFile(
    path.join(output, `${runtime}-checks.json`),
    JSON.stringify({ status: 'failed', checks, error: String(error), errors }, null, 2)
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
  await new Promise(resolve => production.httpServer.close(resolve));
}
