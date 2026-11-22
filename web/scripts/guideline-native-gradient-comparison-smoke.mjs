import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, preview } from 'vite';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { holdGradientResults } from './hold-gradient-results.mjs';

// Node prepares synthetic source files; every browser action uses the production UI.
const fixtureServer = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
});
const fixtureModule = await fixtureServer.ssrLoadModule(
  '/fixtures/guidelines/native-gradient-workspace-fixture.ts'
);
const fixture = await fixtureModule.nativeGradientWorkspaceFixture();
const codec = await fixtureServer.ssrLoadModule('/src/lib/guideline/projectCodec.ts');
const combinedCodec = await fixtureServer.ssrLoadModule('/src/lib/guideline/sourceSetProject.ts');
const output = path.resolve('../release/guideline-native-gradient-studio');
await mkdir(output, { recursive: true });
const runtime = `node${process.versions.node.split('.')[0]}`;
try {
  const previous = JSON.parse(await readFile(path.join(output, `${runtime}-checks.json`), 'utf8'));
  if (previous.status === 'failed') {
    const stamp = previous.startedAt.replaceAll(':', '-');
    await copyFile(
      path.join(output, `${runtime}-checks.json`),
      path.join(output, `${runtime}-failure-${stamp}.json`)
    );
    for (const extension of ['png', 'txt'])
      await copyFile(
        path.join(output, `${runtime}-failure.${extension}`),
        path.join(output, `${runtime}-failure-${stamp}.${extension}`)
      ).catch(error => {
        if (error.code !== 'ENOENT') throw error;
      });
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const digest = value => createHash('sha256').update(value).digest('hex');
const receipt = {
  status: 'running',
  startedAt: new Date().toISOString(),
  node: process.version,
  scriptSha256: digest(await readFile(new URL(import.meta.url))),
  buildHashes: {},
  checks: [],
  axe: [],
  errors: [],
  requests: [],
  artifacts: {},
  qualification:
    'Production Studio UI with public synthetic native paints, fixed example artwork and local files. No actual Figma pixel equivalence, live credential flow, human design acceptance or deployment claim.',
};
for (const name of [
  'index.html',
  ...(await readdir('dist/assets'))
    .filter(name => /\.(js|css)$/.test(name))
    .map(name => `assets/${name}`),
])
  receipt.buildHashes[name] = digest(await readFile(`dist/${name}`));
let production, browser, page;
const saveReceipt = () =>
  writeFile(path.join(output, `${runtime}-checks.json`), JSON.stringify(receipt, null, 2) + '\n');
await saveReceipt();
try {
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
    if (
      target.origin === new URL(url).origin &&
      !target.pathname.startsWith('/api/guideline-intake')
    )
      return route.continue();
    receipt.requests.push(target.href);
    return route.abort('blockedbyclient');
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => receipt.errors.push(error.message));
  const native = page.getByRole('region', { name: 'Figma guideline capture', exact: true });
  const combined = page.getByRole('region', { name: 'Combined guidelines', exact: true });
  const file = json => ({
    name: 'synthetic-native-gradient.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  const openFigma = json =>
    page.getByLabel('Open Figma capture', { exact: true }).setInputFiles(file(json));
  const openSet = json =>
    combined.getByLabel('Open source set', { exact: true }).setInputFiles(file(json));
  let nextDownload = 0;
  async function download(scope, name) {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextDownload - Date.now())));
    nextDownload = Date.now() + 160;
    const [result] = await Promise.all([
      page.waitForEvent('download'),
      scope.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await result.path(), 'utf8');
  }
  async function artifact(name, bytes) {
    await writeFile(path.join(output, `${runtime}-${name}`), bytes);
    receipt.artifacts[name] = digest(bytes);
  }
  async function enter() {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  }
  async function expandFigma() {
    const panel = page.locator('.guideline-figma:not(.guideline-website)');
    if ((await panel.getAttribute('open')) === null)
      await panel.locator(':scope > summary').click();
  }
  async function expandSet() {
    const panel = page.locator('.guideline-source-set');
    if ((await panel.getAttribute('open')) === null)
      await panel.locator(':scope > summary').click();
  }
  async function comparison(scope, chooseTask = true) {
    if (chooseTask) await chooseGuidelineTask(scope, 'gradient');
    const details = scope.locator('.guideline-native-gradient-comparison');
    await expect(details).toBeVisible();
    if ((await details.getAttribute('open')) === null)
      await details.locator(':scope > summary').click();
    const region = details.getByRole('region', {
      name: 'Captured gradient comparison',
      exact: true,
    });
    await expect(region.getByLabel('Captured gradient', { exact: true })).toBeVisible();
    return region;
  }
  async function keep(region, width = 400, height = 240) {
    await region.getByLabel('Frame width', { exact: true }).fill(String(width));
    await region.getByLabel('Frame height', { exact: true }).fill(String(height));
    await region
      .getByLabel('Interpret captured channels and interpolation as sRGB', { exact: true })
      .check();
    await region.getByRole('button', { name: 'Compare and keep', exact: true }).click();
    await expect(region.locator('[data-native-comparison]')).toBeVisible();
    await expect(region.getByRole('status')).toContainText('Comparison retained');
  }
  async function parity(region, label) {
    const json = await download(region, 'Download comparison record');
    const saved = JSON.parse(json);
    expect(
      await region.locator('[data-native-comparison]').getAttribute('data-native-comparison')
    ).toBe(saved.comparison.comparisonHash);
    for (const side of ['source', 'proposal']) {
      const svg = await download(region, `Download ${side} comparison SVG`);
      expect(svg).toBe(saved.comparison[`${side}Svg`]);
      const src = await region.locator(`[data-native-comparison-side=${side}]`).getAttribute('src');
      expect(decodeURIComponent(src.slice(src.indexOf(',') + 1))).toBe(svg);
      expect(
        await region
          .locator(`[data-native-comparison-side=${side}]`)
          .evaluate(image => image.complete && image.naturalWidth > 0)
      ).toBe(true);
      await artifact(`${label}-${side}.svg`, svg);
    }
    await artifact(`${label}-comparison.json`, json);
    return json;
  }
  async function accessibility(region, label) {
    const results = await new AxeBuilder({ page })
      .include('.guideline-native-gradient-comparison')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    receipt.axe.push({ label, violations: results.violations });
    expect(results.violations).toEqual([]);
    await region.screenshot({ path: path.join(output, `${runtime}-${label}.png`) });
  }
  await enter();
  await expandFigma();
  await holdGradientResults(page);
  await openFigma(fixture.singleJson);
  await expect.poll(() => page.evaluate(() => window.gradientResultHold.held.length)).toBe(1);
  await chooseGuidelineTask(native, 'gradient');
  await page.evaluate(() => {
    window.gradientResultHold.restore();
    window.gradientResultHold.release();
  });
  let region = await comparison(native, false);
  receipt.checks.push(
    'A held real-worker verification of the retained gradient survives task-control publication and exposes comparison without a manual Check saved gradient retry.'
  );
  await expect(region.locator('[data-native-comparison]')).toHaveCount(0);
  await expect(
    region.getByRole('button', { name: 'Compare and keep', exact: true })
  ).toBeDisabled();
  await keep(region);
  const wide = await parity(region, 'single-wide');
  expect(JSON.parse(wide).comparison.content.kind).toBe('outlined-label');
  expect(JSON.parse(wide).comparison.source.paint.type).toBe('GRADIENT_RADIAL');
  await accessibility(region, 'single-wide');
  const wideProject = await download(native, 'Save Figma project');
  expect(JSON.parse(wideProject).schemaVersion).toBe('teul.guideline-workspace.v13');
  expect(JSON.parse(wideProject).sourceProjectJson).toBe(fixture.sourceProjectJson);
  expect(JSON.parse(wideProject).gradientComparison).toEqual(JSON.parse(wide));
  const reopened = await codec.readAnyGuidelineProject(wideProject);
  expect(reopened.status).toBe('opened');
  expect(reopened.value.gradientComparison).toEqual(JSON.parse(wide));
  receipt.checks.push(
    'Production UI creates a source-bound wide comparison; preview, downloaded SVG, comparison JSON, outer V13 workspace and independent Node replay agree exactly.'
  );
  const nativeDetails = native.locator('.guideline-native-gradient-comparison');
  await nativeDetails.locator(':scope > summary').click();
  await expect(region).toBeHidden();
  await nativeDetails.locator(':scope > summary').click();
  await expect(region.locator('[data-native-comparison]')).toBeVisible();
  expect(await download(region, 'Download comparison record')).toBe(wide);
  receipt.checks.push(
    'Collapsing and reopening the captured-gradient comparison retains its exact selected record.'
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await keep(region, 240, 240);
  const narrow = await parity(region, 'single-narrow');
  expect(JSON.parse(narrow).comparison.frame.width).toBe(240);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await accessibility(region, 'single-narrow');
  await region.getByLabel('Frame width', { exact: true }).focus();
  await expect(region.getByLabel('Frame width', { exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await region.getByLabel('Frame width', { exact: true }).fill('64');
  await region.getByLabel('Frame height', { exact: true }).fill('64');
  await region.getByRole('button', { name: 'Compare and keep', exact: true }).click();
  await expect(
    region.getByText('Captured paint is unsupported for this comparison', { exact: true })
  ).toBeVisible();
  expect(await download(region, 'Download comparison record')).toBe(narrow);
  const unsupported = JSON.parse(await download(region, 'Download comparison limitations'));
  expect(unsupported.status).toBe('unsupported');
  expect(unsupported.sourceSvg).toBeNull();
  receipt.checks.push(
    'Narrow comparison fits at 390 px, retains keyboard focus and passes scoped axe checks. A frame too small for the complete label reports limitations while retaining the prior comparison.'
  );

  await region.getByLabel('Frame width', { exact: true }).fill('400');
  await region.getByLabel('Frame height', { exact: true }).fill('240');
  await holdGradientResults(page);
  await region.getByRole('button', { name: 'Compare and keep', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.gradientResultHold.held.length)).toBe(1);
  await region.getByRole('button', { name: 'Cancel comparison', exact: true }).click();
  await page.evaluate(() => {
    window.gradientResultHold.restore();
    window.gradientResultHold.release();
  });
  expect(await download(region, 'Download comparison record')).toBe(narrow);
  receipt.checks.push(
    'Cancellation discards a held real-worker result and preserves the previously retained comparison.'
  );

  const saved = await download(native, 'Save Figma project');
  await artifact('single-workspace.json', saved);
  await native.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    native.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await expandFigma();
  await context.setOffline(true);
  await openFigma(saved);
  region = await comparison(native);
  expect(await parity(region, 'single-offline-reopen')).toBe(narrow);
  await context.setOffline(false);
  const localSummary = native
    .locator('summary')
    .filter({ hasText: 'Saved Figma projects on this device' });
  if (await localSummary.count()) await localSummary.click();
  await native.getByRole('button', { name: 'Open saved project', exact: true }).first().click();
  region = await comparison(native);
  expect(await download(region, 'Download comparison record')).toBe(narrow);
  receipt.checks.push(
    'Downloaded V13 opens cold and offline without changing SVG or comparison bytes; IndexedDB save and reopen retain the same comparison.'
  );

  await openFigma(fixture.changedCaptureJson);
  await native.getByRole('button', { name: 'Compare updated capture', exact: true }).click();
  expect(JSON.parse(await download(native, 'Save Figma project')).gradientComparison).toEqual(
    JSON.parse(narrow)
  );
  await native
    .getByRole('button', { name: 'Save current project and accept update', exact: true })
    .click();
  await expect(
    native.getByText(/Previous project saved|previous project.*saved|Review the updated/).first()
  ).toBeVisible();
  await expect(native.locator('[data-native-comparison]')).toHaveCount(0);
  const updated = JSON.parse(await download(native, 'Save Figma project'));
  expect(updated.gradientComparison ?? null).toBeNull();
  await openFigma(saved);
  region = await comparison(native);
  expect(await download(region, 'Download comparison record')).toBe(narrow);
  receipt.checks.push(
    'A gradient-handle-only source refresh invalidates the current comparison; the original downloaded workspace remains recoverable with exact prior output.'
  );

  const legacy = await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8');
  await openFigma(legacy);
  expect(JSON.parse(await download(native, 'Save Figma project'))).toEqual(JSON.parse(legacy));
  receipt.checks.push(
    'Legacy Figma project import and save retain the old format and content without introducing comparison fields.'
  );

  await expandSet();
  await openSet(fixture.combinedJson);
  region = await comparison(combined);
  await keep(region);
  const combinedComparison = await parity(region, 'combined-wide');
  const bound = JSON.parse(combinedComparison);
  expect(bound.sourceEntryId).toBe('native-member');
  expect(bound.sourceEntryModeId).toBe(fixture.sourceModeId);
  expect(bound.comparison.proposalModeId).toBe('Working');
  const savedSet = await download(combined, 'Download source set');
  await artifact('combined-workspace.json', savedSet);
  expect(JSON.parse(savedSet).schemaVersion).toBe('teul.source-set-project.v7');
  expect(JSON.parse(savedSet).draft.entries[0].projectJson).toBe(fixture.sourceProjectJson);
  const openedSet = await combinedCodec.readSourceSetProject(savedSet);
  expect(openedSet.status).toBe('opened');
  expect(openedSet.value.gradientComparison).toEqual(bound);
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await expandSet();
  await context.setOffline(true);
  await openSet(savedSet);
  region = await comparison(combined);
  expect(await parity(region, 'combined-offline-reopen')).toBe(combinedComparison);
  await context.setOffline(false);
  receipt.checks.push(
    'Combined source creation and offline cold replay retain native member/mode identity separately from Working, original member bytes, proposal paint and V7 comparison output.'
  );

  await expandFigma();
  await openFigma(fixture.changedSourceProjectJson);
  await native.getByLabel('Source to update in set', { exact: true }).selectOption('native-member');
  await native.getByRole('button', { name: 'Compare source update', exact: true }).click();
  const update = combined.getByRole('region', { name: 'Source update comparison', exact: true });
  await expect(update).toBeVisible();
  expect(JSON.parse(await download(combined, 'Download source set')).gradientComparison).toEqual(
    bound
  );
  await update
    .getByRole('button', { name: 'Save current set and accept update', exact: true })
    .click();
  await expect(combined.getByText(/Previous set saved on this device/)).toBeVisible();
  await expect(combined.locator('[data-native-comparison]')).toHaveCount(0);
  expect(
    JSON.parse(await download(combined, 'Download source set')).gradientComparison ?? null
  ).toBeNull();
  await openSet(savedSet);
  region = await comparison(combined);
  expect(await download(region, 'Download comparison record')).toBe(combinedComparison);
  receipt.checks.push(
    'Combined member refresh preserves the old set until acceptance, then removes the stale comparison and retains a recoverable original workspace.'
  );
  expect(receipt.errors).toEqual([]);
  expect(receipt.requests).toEqual([]);
  receipt.status = 'passed';
  await saveReceipt();
  console.log(
    JSON.stringify(
      { status: receipt.status, checks: receipt.checks, axeScans: receipt.axe.length },
      null,
      2
    )
  );
} catch (error) {
  receipt.status = 'failed';
  receipt.error = String(error);
  if (page)
    await writeFile(
      path.join(output, `${runtime}-failure.txt`),
      await page.locator('body').innerText()
    ).catch(() => {});
  await page
    ?.screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true })
    .catch(() => {});
  await saveReceipt();
  throw error;
} finally {
  await browser?.close();
  await fixtureServer.close();
  if (production) await new Promise(resolve => production.httpServer.close(resolve));
}
