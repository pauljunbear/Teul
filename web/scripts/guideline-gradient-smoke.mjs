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
const output = path.resolve('../release/guideline-gradients');
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
  if (
    r.url().includes('/api/guideline-intake') ||
    (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(url).origin)
  )
    requests.push(r.url());
});
let nextDownload = 0;
async function download(scope, name) {
  await new Promise(resolve => setTimeout(resolve, Math.max(0, nextDownload - Date.now())));
  nextDownload = Date.now() + 160;
  const pending = page.waitForEvent('download');
  await scope.getByRole('button', { name, exact: true }).click();
  return readFile(await (await pending).path(), 'utf8');
}
async function open(label, json) {
  await page.getByLabel(label, { exact: true }).setInputFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
}
const make = region => region.getByRole('button', { name: 'Make gradient', exact: true });
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
  const pdf = page.getByRole('region', { name: 'Gradient proof', exact: true });
  const rows = pdf.locator('.guideline-authored-stops > li');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('select')).toBeDisabled();
  await expect(pdf.getByLabel('Stop 1 position', { exact: true })).toBeDisabled();
  for (let i = 0; i < 3; i++)
    await pdf.getByRole('button', { name: 'Add stop', exact: true }).click();
  await expect(rows).toHaveCount(5);
  await expect(pdf.getByRole('button', { name: 'Add stop', exact: true })).toBeDisabled();
  await pdf.getByLabel('Stop 2 position', { exact: true }).fill('20');
  await pdf.getByLabel('Lock stop 2', { exact: true }).check();
  await expect(pdf.getByLabel('Stop 2 position', { exact: true })).toBeDisabled();
  await expect(rows.nth(1).locator('select')).toBeDisabled();
  await expect(pdf.getByRole('button', { name: 'Remove stop 2', exact: true })).toBeDisabled();
  await pdf.getByLabel('Angle', { exact: true }).fill('167.5');
  await pdf.getByLabel('Interpolation', { exact: true }).selectOption('longer');
  const stopValues = () =>
    rows.evaluateAll(items =>
      items.map(item => ({
        color: item.querySelector('select').value,
        position: item.querySelector('input[type=number]').value,
        locked: item.querySelector('input[type=checkbox]').checked,
      }))
    );
  const beforeScope = await stopValues();
  await pdf.getByLabel('Use', { exact: true }).selectOption('product');
  await expect(make(pdf)).toBeEnabled();
  expect(await stopValues()).toEqual(beforeScope);
  await pdf.getByLabel('Use', { exact: true }).selectOption('brand');
  expect(await stopValues()).toEqual(beforeScope);
  await make(pdf).click();
  await expect(pdf.locator('.guideline-gradient-preview')).toBeVisible();
  const artifacts = {};
  for (const format of ['SVG', 'CSS', 'JSON']) {
    artifacts[format] = await download(pdf, format);
    await writeFile(
      path.join(output, `${runtime}-five-stop.${format.toLowerCase()}`),
      artifacts[format]
    );
  }
  const design = JSON.parse(artifacts.JSON).design;
  expect(design.stops).toHaveLength(5);
  expect(design.angleDegrees).toBe(167.5);
  expect(design.route).toEqual({ space: 'oklch', huePath: 'longer' });
  expect(design.stops[1].position).toBe(0.2);
  expect(design.stops[1].locked).toBe(true);
  checks.push(
    'Actual PDF review supplies five exact source stops; positions, angle, hue route, stop locks, limits and scoped restrictions are enforced without resetting intent.'
  );
  const json = await download(page, 'Download project'),
    saved = JSON.parse(json);
  expect(saved.schemaVersion).toBe('teul.guideline-workspace.v7');
  expect(JSON.parse(saved.sourceProjectJson).selection).toBeNull();
  expect(saved.gradientSelection.design).toEqual(design);
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await expect(page.getByLabel('Open guideline project', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await open('Open guideline project', json);
  await expect(pdf.locator('.guideline-gradient-preview')).toBeVisible();
  expect(await stopValues()).toEqual(beforeScope);
  for (const format of ['SVG', 'CSS', 'JSON'])
    expect(await download(pdf, format)).toBe(artifacts[format]);
  const codec = await server.ssrLoadModule('/src/lib/guideline/projectCodec.ts');
  const exporter = await server.ssrLoadModule('/src/lib/guideline/gradientExport.ts');
  const reopened = await codec.readAnyGuidelineProject(json);
  expect(reopened.status).toBe('opened');
  const nodeExports = exporter.guidelineAuthoredGradientExports(
    reopened.value.project.review,
    reopened.value.gradientSelection
  );
  expect(nodeExports.svg).toBe(artifacts.SVG);
  expect(nodeExports.css).toBe(artifacts.CSS);
  replayDifferences.push(...assertGradientReplay(nodeExports.json, artifacts.JSON));
  await context.setOffline(false);
  const render = await context.newPage();
  await render.setViewportSize({ width: 800, height: 480 });
  await render.setContent(
    `<style>body{margin:0}.gradient{width:800px;height:480px}${artifacts.CSS}</style><div class="gradient"></div>`
  );
  const cssPixels = await render.screenshot({ path: path.join(output, `${runtime}-css.png`) });
  await render.setContent(`<style>body{margin:0}</style>${artifacts.SVG}`);
  const svgPixels = await render.screenshot({ path: path.join(output, `${runtime}-svg.png`) });
  const pixelDifference = await render.evaluate(
    async encoded => {
      const pixels = await Promise.all(
        encoded.map(async data => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, canvas.width, canvas.height).data;
        })
      );
      let maximum = 0,
        sum = 0;
      for (let i = 0; i < pixels[0].length; i++) {
        const difference = Math.abs(pixels[0][i] - pixels[1][i]);
        maximum = Math.max(maximum, difference);
        sum += difference;
      }
      return { maximum, mean: sum / pixels[0].length };
    },
    [cssPixels.toString('base64'), svgPixels.toString('base64')]
  );
  expect(pixelDifference.maximum).toBeLessThanOrEqual(2);
  await writeFile(
    path.join(output, `${runtime}-pixels.json`),
    JSON.stringify(pixelDifference, null, 2)
  );
  await render.close();
  checks.push(
    'Workspace V7, offline reopen and independent Node replay preserve exact paint, controls, locks and CSS/SVG bytes, with independently passing receipt bounds; CSS/SVG renders differ by at most 2/255 per channel.'
  );
  await pdf.screenshot({ path: path.join(output, `${runtime}-desktop.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await pdf.getByLabel('Lock stop 2', { exact: true }).focus();
  await expect(pdf.getByLabel('Lock stop 2', { exact: true })).toBeFocused();
  await pdf.screenshot({ path: path.join(output, `${runtime}-mobile.png`) });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await pdf.getByLabel('Lock stop 2', { exact: true }).uncheck();
  await expect(pdf.locator('.guideline-gradient-preview')).toHaveCount(0);
  await expect(pdf.getByRole('button', { name: 'SVG', exact: true })).toHaveCount(0);
  await pdf.getByLabel('Stop 2 position', { exact: true }).fill('0');
  await make(pdf).click();
  await expect(pdf.getByRole('alert')).toBeVisible();
  await expect(pdf.locator('.guideline-gradient-preview')).toHaveCount(0);
  await pdf.getByLabel('Stop 2 position', { exact: true }).fill('20');
  for (let i = 0; i < 3; i++) {
    const checkbox = pdf.getByLabel('Lock stop 2', { exact: true });
    if (await checkbox.isChecked()) await checkbox.uncheck();
    await pdf.getByRole('button', { name: 'Remove stop 2', exact: true }).click();
  }
  await expect(rows).toHaveCount(2);
  await expect(pdf.getByRole('button', { name: /Remove stop/ })).toHaveCount(0);
  checks.push(
    'Controls fit at 390px with keyboard focus; edits remove stale exports, duplicate positions fail closed, and removal preserves two endpoints.'
  );

  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  const legacy = await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8');
  await open('Open Figma capture', legacy);
  const native = page.getByRole('region', { name: 'Figma guideline capture', exact: true });
  const gradient = native.getByRole('region', { name: 'Mode-aware gradient editor', exact: true });
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  expect(JSON.parse(await download(native, 'Save Figma project'))).toEqual(JSON.parse(legacy));
  await gradient.getByLabel('Use', { exact: true }).selectOption('product');
  await expect(make(gradient)).toBeDisabled();
  await open('Open Figma capture', legacy);
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  await native.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    native.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeVisible();
  await native
    .locator('summary')
    .filter({ hasText: 'Saved Figma projects on this device' })
    .click();
  const library = native.locator('.guideline-local');
  await library.locator('summary').filter({ hasText: 'Saved revisions' }).click();
  for (const action of ['Open saved project', 'Open revision 1']) {
    await gradient.getByLabel('Angle', { exact: true }).fill('43');
    await holdGradientResults(page);
    await make(gradient).click();
    await expect.poll(() => page.evaluate(() => window.gradientResultHold.held.length)).toBe(1);
    await page.evaluate(() => window.gradientResultHold.restore());
    await library.getByRole('button', { name: action, exact: true }).click();
    await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
    expect(await page.evaluate(() => window.gradientResultHold.release())).toBe(1);
    await expect(gradient.getByLabel('Angle', { exact: true })).toHaveValue(
      String(JSON.parse(legacy).selection.design.angleDegrees)
    );
    await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
    expect(JSON.parse(await download(native, 'Save Figma project'))).toEqual(JSON.parse(legacy));
  }
  checks.push(
    'Legacy projects open/save without migration. A held real-worker reply cannot replace a newer local open or historical-revision open.'
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
