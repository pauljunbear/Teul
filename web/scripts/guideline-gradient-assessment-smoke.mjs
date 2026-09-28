import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertGradientReplay } from './assert-gradient-replay.mjs';

const server = await createServer({
  mode: 'guideline-proof',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
const production = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
const url = production.resolvedUrls.local[0],
  runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/guideline-gradient-assessment');
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
  const make = () => editor.getByRole('button', { name: 'Make gradient', exact: true }).click();
  const assessment = editor.getByLabel('Declared gradient assessment', { exact: true });
  const getColor = async hex =>
    editor
      .getByLabel('From', { exact: true })
      .locator('option')
      .filter({ hasText: hex })
      .getAttribute('value');
  await editor.getByLabel('Assess a specific use or color limit', { exact: true }).check();
  await editor.getByLabel('Placement', { exact: true }).selectOption('text');
  await make();
  await expect(assessment).toContainText('Declared checks fail');
  await expect(editor.getByRole('button', { name: 'SVG', exact: true })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'CSS', exact: true })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Copy SVG code', exact: true })).toBeDisabled();
  const failed = JSON.parse(await download(editor, 'JSON'));
  expect(failed.assessment.status).toBe('fail');
  expect(failed.foreground).toEqual(failed.design.stops[0].value);
  const saved = await download(page, 'Download project');
  expect(JSON.parse(saved).schemaVersion).toBe('teul.guideline-workspace.v7');
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await expect(page.getByLabel('Open guideline project', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'saved.json',
    mimeType: 'application/json',
    buffer: Buffer.from(saved),
  });
  await expect(assessment).toContainText('Declared checks fail');
  expect(JSON.parse(await download(editor, 'JSON'))).toEqual(failed);
  await expect(editor.getByRole('button', { name: 'SVG', exact: true })).toBeDisabled();
  checks.push(
    'An actual PDF review retains failed text use in workspace V7; offline reopen recomputes the same failure, blocks SVG/CSS/clipboard, and preserves JSON recovery including exact foreground.'
  );
  await context.setOffline(false);
  const light = await getColor('#F4EFE6'),
    dark = await getColor('#182E34');
  await editor.getByLabel('Text color', { exact: true }).selectOption(light);
  await expect(assessment).toHaveCount(0);
  await make();
  await expect(assessment).toContainText('Declared checks pass');
  const artifacts = {};
  for (const type of ['SVG', 'CSS', 'JSON']) artifacts[type] = await download(editor, type);
  expect(artifacts.SVG).toContain('<svg');
  const pass = JSON.parse(artifacts.JSON);
  expect(pass.assessment.contrast.minimumRatioLowerBound).toBeGreaterThanOrEqual(4.5);
  expect(pass.foreground.hex).toBe('#F4EFE6');
  const codec = await server.ssrLoadModule('/src/lib/guideline/projectCodec.ts');
  const exporter = await server.ssrLoadModule('/src/lib/guideline/gradientExport.ts');
  const opened = await codec.readAnyGuidelineProject(await download(page, 'Download project'));
  expect(opened.status).toBe('opened');
  const exported = exporter.guidelineAuthoredGradientExports(
    opened.value.project.review,
    opened.value.gradientSelection
  );
  for (const type of ['SVG', 'CSS']) expect(exported[type.toLowerCase()]).toBe(artifacts[type]);
  replayDifferences.push(...assertGradientReplay(exported.json, artifacts.JSON));
  checks.push(
    'Correcting the foreground removes stale output, proves full-range contrast, and produces byte-identical browser/Node SVG/CSS, with exact JSON except independently passing receipt bounds.'
  );
  await editor.getByLabel('Lock stop 1', { exact: true }).uncheck();
  await editor.getByLabel('From', { exact: true }).selectOption(light);
  await make();
  await expect(assessment).toContainText('Declared checks fail');
  await editor.getByLabel('Text coverage start (%)', { exact: true }).fill('95');
  await make();
  await expect(assessment).toContainText('Declared checks pass');
  const clipped = JSON.parse(await download(editor, 'JSON'));
  expect(clipped.policy.use.footprint).toEqual({ start: 0.95, end: 1 });
  checks.push(
    'The same light-to-dark gradient fails with full text coverage and passes only when the actual foreground is scoped to its dark end.'
  );
  await editor.getByLabel('Placement', { exact: true }).selectOption('decorative');
  await editor.getByRole('button', { name: 'Add color limit', exact: true }).click();
  await editor.getByLabel('Applies to', { exact: true }).selectOption('authored-stops');
  await make();
  await expect(assessment).toContainText('Declared checks pass');
  await editor.getByLabel('Applies to', { exact: true }).selectOption('rendered-paint');
  await make();
  await expect(assessment).toContainText('Declared checks fail');
  expect(
    JSON.parse(await download(editor, 'JSON')).assessment.limits[0].witnessPosition
  ).toBeGreaterThan(0);
  checks.push(
    'The excluded middle-lightness region passes for source stops but fails across the gradient interior; the visible witness identifies where.'
  );
  await editor.getByLabel('From', { exact: true }).selectOption(dark);
  const colors = await server.ssrLoadModule(
    '/@fs' + path.resolve('../src/lib/colorSystemSrgbValueV1.ts')
  );
  const value = pass.design.stops.at(-1).value;
  const L = colors.colorSystemSrgbToOklchV1(value).l;
  await editor.getByLabel('Rule', { exact: true }).selectOption('restrict-to');
  await editor.getByLabel('Lightness minimum', { exact: true }).fill(String(L - 0.00001));
  await editor.getByLabel('Lightness maximum', { exact: true }).fill(String(L + 0.00001));
  await make();
  await expect(assessment).toContainText('Assessment unresolved');
  await expect(editor.getByRole('button', { name: 'SVG', exact: true })).toBeDisabled();
  checks.push(
    'A narrow rendered limit remains unresolved because of rendering allowance; uncertainty never becomes an exportable pass.'
  );
  await editor.screenshot({ path: path.join(output, `${runtime}-desktop.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await editor.getByLabel('Lightness minimum', { exact: true }).focus();
  await expect(editor.getByLabel('Lightness minimum', { exact: true })).toBeFocused();
  await editor.screenshot({ path: path.join(output, `${runtime}-mobile.png`) });
  await editor.getByLabel('Lightness minimum', { exact: true }).fill('0.9');
  await make();
  await expect(editor.getByRole('alert')).toContainText('ranges must increase');
  await expect(assessment).toHaveCount(0);
  checks.push(
    'Advanced controls fit at 390px, retain keyboard focus, and reject reversed limits without stale preview or export.'
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
