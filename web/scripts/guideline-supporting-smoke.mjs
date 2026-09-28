import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const server = await createServer({
  mode: 'guideline-proof',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
await server.listen();
const url = server.resolvedUrls.local[0],
  runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/guideline-supporting');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1100 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage(),
  checks = [],
  errors = [],
  requests = [];
page.setDefaultTimeout(20000);
page.on('pageerror', e => errors.push(e.message));
context.on('request', r => {
  if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(url).origin)
    requests.push(r.url());
});
async function download(scope, name) {
  const pending = page.waitForEvent('download');
  await scope.getByRole('button', { name, exact: true }).click();
  return readFile(await (await pending).path(), 'utf8');
}
async function open(label, json, scope = page) {
  await scope.getByLabel(label, { exact: true }).setInputFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
}
const support = scope => scope.getByRole('region', { name: 'Supporting colors', exact: true });
const cards = scope => scope.locator('.guideline-supporting-directions > article');
async function choose(scope) {
  await scope.getByRole('button', { name: 'Find supporting colors', exact: true }).click();
  await expect(cards(scope).first()).toBeVisible();
  expect(await cards(scope).count()).toBeLessThanOrEqual(3);
  await cards(scope)
    .first()
    .getByRole('button', { name: 'Keep this direction', exact: true })
    .click();
  await expect(cards(scope).first()).toHaveAttribute('data-selected', 'true');
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
  await chooseGuidelineTask(page, 'supporting');
  const pdf = support(page);
  await choose(pdf);
  const artifacts = {};
  for (const format of ['JSON', 'SVG', 'CSS']) {
    artifacts[format] = await download(pdf, `Download ${format}`);
    await writeFile(
      path.join(output, `${runtime}-brand.${format.toLowerCase()}`),
      artifacts[format]
    );
  }
  for (const format of ['SVG', 'CSS']) {
    await pdf.getByRole('button', { name: `Copy ${format}`, exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(artifacts[format]);
  }
  const json = await download(page, 'Download project'),
    saved = JSON.parse(json);
  expect(saved.schemaVersion).toBe('teul.guideline-workspace.v4');
  expect(Object.keys(saved.outputs).sort()).toEqual(['application', 'extension']);
  expect(saved.supportingSelection).toBe(artifacts.JSON);
  await pdf.screenshot({ path: path.join(output, `${runtime}-desktop.png`) });
  checks.push(
    'PDF import and explicit source review generate up to three measured brand compositions; keeping a direction enables exact SVG/CSS/JSON and clipboard delivery.'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await pdf.getByLabel('Supporting library', { exact: true }).focus();
  await expect(pdf.getByLabel('Supporting library', { exact: true })).toBeFocused();
  await pdf.screenshot({ path: path.join(output, `${runtime}-mobile.png`) });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await context.setOffline(true);
  await open('Open guideline project', json);
  await expect(pdf.locator('article[data-selected=true]')).toHaveCount(1);
  expect(await download(pdf, 'Download SVG')).toBe(artifacts.SVG);
  await page.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeVisible();
  await pdf.getByLabel('Supporting first color share', { exact: true }).fill('70');
  await expect(pdf.getByRole('button', { name: 'Download JSON', exact: true })).toHaveCount(0);
  await page.locator('summary').filter({ hasText: 'Saved PDF projects on this device' }).click();
  await page.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect(pdf.locator('article[data-selected=true]')).toHaveCount(1);
  expect(await download(pdf, 'Download SVG')).toBe(artifacts.SVG);
  await context.setOffline(false);
  checks.push(
    'Selected work survives offline workspace and browser-library reopen; editing removes stale export. Controls fit at 390px and receive keyboard focus.'
  );

  // A rejected direction file must preserve the selected, deliverable result.
  const forged = JSON.parse(artifacts.JSON);
  forged.reviewHash = 'sha256:' + '0'.repeat(64);
  await open('Open saved supporting direction', JSON.stringify(forged));
  await expect(pdf.getByRole('alert')).toBeVisible();
  expect(await download(pdf, 'Download SVG')).toBe(artifacts.SVG);
  await cards(pdf)
    .first()
    .getByRole('button', { name: 'Exclude this family', exact: true })
    .click();
  await expect(cards(pdf)).toHaveCount(0);
  await expect(
    pdf.getByRole('button', { name: 'Clear family exclusions (1/24)', exact: true })
  ).toBeVisible();
  await pdf.getByRole('button', { name: 'Clear family exclusions (1/24)', exact: true }).click();
  checks.push(
    'Wrong-source supporting files preserve current work; exclusions remain clearable after they invalidate the comparison.'
  );

  await pdf.getByLabel('Supporting use', { exact: true }).selectOption('product');
  await pdf.getByRole('checkbox', { name: 'Color 2', exact: true }).uncheck();
  await pdf.getByRole('checkbox', { name: 'Color 1', exact: true }).check();
  await pdf.getByRole('button', { name: 'Find supporting colors', exact: true }).click();
  await expect(pdf.getByText(/bounded search found no supporting direction/)).toBeVisible();
  await expect(pdf.getByRole('button', { name: 'Download JSON', exact: true })).toHaveCount(0);
  checks.push(
    'A product search with no feasible fixed source paints stays blocked and cannot export an unchecked direction.'
  );

  const packet = JSON.parse(await readFile('fixtures/guidelines/website-capture.json', 'utf8'));
  const websiteProject = await page.evaluate(async packet => {
    const { createWebsiteInventory } = await import('/src/lib/guideline/websiteInventory.ts');
    const { suggestWebsiteReview, compileWebsiteReview } =
      await import('/src/lib/guideline/websiteReview.ts');
    const { buildWebsiteProject } = await import('/src/lib/guideline/websiteProject.ts');
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
  }, packet);

  for (const kind of ['Figma', 'Website']) {
    const isFigma = kind === 'Figma';
    await page
      .locator('summary')
      .filter({ hasText: isFigma ? 'Read from Figma' : 'Read a website' })
      .click();
    const label = isFigma ? 'Open Figma capture' : 'Open website capture';
    const legacy = isFigma
      ? await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8')
      : JSON.stringify(websiteProject);
    await open(label, legacy);
    const native = page.getByRole('region', { name: `${kind} guideline capture`, exact: true });
    await chooseGuidelineTask(native, 'supporting');
    const panel = support(native);
    await choose(panel);
    const direction = await download(panel, 'Download JSON'),
      svg = await download(panel, 'Download SVG');
    const workspace = await download(native, `Save ${kind} project`);
    expect(JSON.parse(workspace).supportingSelection).toBe(direction);
    await open(label, workspace);
    await chooseGuidelineTask(native, 'supporting');
    await expect(panel.locator('article[data-selected=true]')).toHaveCount(1);
    expect(await download(panel, 'Download SVG')).toBe(svg);
    checks.push(
      `${kind} reviewed capture uses the same comparison and selected-direction save/reopen flow without a Figma plugin.`
    );
    if (isFigma) {
      await native.getByRole('button', { name: 'Save on this device', exact: true }).click();
      await expect(
        native.getByRole('button', { name: 'Update saved project', exact: true })
      ).toBeVisible();
      await native
        .locator('summary')
        .filter({ hasText: 'Saved Figma projects on this device' })
        .click();
      // Hold the next source-adapter yield while a later operation takes ownership.
      await page.evaluate(async () => {
        const store = (await import('/src/lib/guideline/projectStore.ts')).guidelineProjectStore;
        const originalOpen = store.open;
        store.open = async (...args) => {
          await new Promise(resolve => {
            window.releaseProjectRead = resolve;
          });
          return originalOpen.apply(store, args);
        };
        window.restoreProjectRead = () => {
          store.open = originalOpen;
        };
        const original = window.setTimeout;
        window.holdSupporting = true;
        window.setTimeout = (fn, delay, ...args) => {
          if (delay === 0 && window.holdSupporting) {
            window.holdSupporting = false;
            window.releaseSupporting = () => fn(...args);
            return -1;
          }
          return original(fn, delay, ...args);
        };
        window.restoreTimeout = () => {
          window.setTimeout = original;
        };
      });
      await open('Open saved supporting direction', direction, panel);
      await expect
        .poll(() => page.evaluate(() => typeof window.releaseSupporting))
        .toBe('function');
      await native.getByRole('button', { name: 'Open saved project', exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => typeof window.releaseProjectRead))
        .toBe('function');
      await page.evaluate(() => {
        window.restoreTimeout();
        window.releaseSupporting();
        window.releaseProjectRead();
        window.restoreProjectRead();
      });
      await expect(
        native.getByRole('button', { name: 'Save Figma project', exact: true })
      ).toBeEnabled();
      await chooseGuidelineTask(native, 'supporting');
      await expect(panel.locator('article[data-selected=true]')).toHaveCount(1);
      await expect(
        native.getByRole('button', { name: 'Save Figma project', exact: true })
      ).toBeEnabled();
      expect(await download(panel, 'Download SVG')).toBe(svg);
      checks.push(
        'An older supporting replay cannot cancel or overwrite a newer local project open.'
      );
      await page.evaluate(() => {
        const original = window.setTimeout;
        window.releaseSupporting = null;
        window.holdSupporting = true;
        window.setTimeout = (fn, delay, ...args) => {
          if (delay === 0 && window.holdSupporting) {
            window.holdSupporting = false;
            window.releaseSupporting = () => fn(...args);
            return -1;
          }
          return original(fn, delay, ...args);
        };
        window.restoreTimeout = () => {
          window.setTimeout = original;
        };
      });
      await open('Open saved supporting direction', direction, panel);
      await expect
        .poll(() => page.evaluate(() => typeof window.releaseSupporting))
        .toBe('function');
      const newerDownload = page.waitForEvent('download');
      await native.getByRole('button', { name: 'Save Figma project', exact: true }).click();
      await page.evaluate(() => {
        window.restoreTimeout();
        window.releaseSupporting();
      });
      expect(JSON.parse(await readFile(await (await newerDownload).path(), 'utf8'))).toEqual(
        JSON.parse(workspace)
      );
      await expect(
        panel.getByRole('button', { name: 'Cancel supporting operation', exact: true })
      ).toHaveCount(0);
      checks.push(
        'A newer native project download survives completion of an older supporting import.'
      );
    }
  }
  // A synthetic native source with suitable neutrals exercises the successful product path.
  const rawProduct = JSON.parse(
    await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8')
  ).capture;
  rawProduct.roots[0].document.children = [
    ['blue', [0.1, 0.25, 0.6]],
    ['orange', [0.9, 0.4, 0.1]],
    ['paper', [1, 1, 1]],
    ['ink', [0.05, 0.05, 0.05]],
    ['mist', [0.9, 0.9, 0.9]],
  ].map(([name, [r, g, b]], index) => ({
    id: `1:${index + 20}`,
    type: 'RECTANGLE',
    name,
    fills: [{ type: 'SOLID', color: { r, g, b } }],
  }));
  const { canonicalIntakeJson } = await server.ssrLoadModule(
    '/@fs/' + path.resolve('../services/guideline-intake/src/protocol.ts')
  );
  const { contentHash: _, ...productContent } = rawProduct;
  const productPacket = {
    ...productContent,
    contentHash:
      'sha256:' + createHash('sha256').update(canonicalIntakeJson(productContent)).digest('hex'),
  };
  const productProject = await page.evaluate(async packet => {
    const { createFigmaNativeInventory } = await import('/src/lib/guideline/figmaInventory.ts');
    const { suggestFigmaReview, compileFigmaReview } =
      await import('/src/lib/guideline/figmaReview.ts');
    const { buildFigmaProject } = await import('/src/lib/guideline/figmaProject.ts');
    const inventory = await createFigmaNativeInventory(packet),
      draft = suggestFigmaReview(inventory);
    draft.modeIds = inventory.modes.map(m => m.id);
    draft.colors = inventory.declarations.map(d => ({
      declarationId: d.id,
      label: d.label.split(' / ')[0],
      family: '',
    }));
    draft.scopeDecision = { accepted: true, reason: 'Synthetic product fixture.' };
    const actor = { kind: 'user', ref: 'test:supporting-product' };
    draft.profileDecision = {
      captureHash: packet.contentHash,
      interpretation: 'srgb',
      actor,
      decidedAt: '2026-09-26T04:00:00.000Z',
    };
    const review = compileFigmaReview(inventory, draft, actor);
    return buildFigmaProject({ capture: packet, draft, review, selection: null });
  }, productPacket);
  await open('Open Figma capture', JSON.stringify(productProject));
  await chooseGuidelineTask(
    page.getByRole('region', { name: 'Figma guideline capture', exact: true }),
    'supporting'
  );
  const product = support(
    page.getByRole('region', { name: 'Figma guideline capture', exact: true })
  );
  await product.getByLabel('Supporting use', { exact: true }).selectOption('product');
  for (const checkbox of await product.getByRole('checkbox').all()) await checkbox.uncheck();
  await product.getByRole('checkbox', { name: 'blue', exact: true }).check();
  for (const [control, label] of [
    ['background', 'paper'],
    ['action label', 'paper'],
    ['secondary link', 'ink'],
    ['focus ring', 'ink'],
    ['disabled fill', 'mist'],
    ['disabled label', 'ink'],
  ])
    await product.getByLabel(`Supporting ${control}`, { exact: true }).selectOption({ label });
  await choose(product);
  await expect(cards(product).first().locator('figure')).toHaveCount(5);
  await product.screenshot({ path: path.join(output, `${runtime}-product.png`) });
  const productJson = JSON.parse(await download(product, 'Download JSON'));
  expect(productJson.request.provider).toBe('radix');
  expect(productJson.recipe.selection.applications.map(a => a.id)).toEqual([
    'rest',
    'hover',
    'pressed',
    'focus',
    'disabled',
  ]);
  checks.push(
    'A suitable synthetic source yields exact Radix paints in five actual product states; selected JSON retains the complete application set.'
  );
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  await writeFile(
    path.join(output, `${runtime}-checks.json`),
    JSON.stringify({ status: 'passed', node: process.version, checks, errors, requests }, null, 2)
  );
  console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true });
  await writeFile(
    path.join(output, `${runtime}-failure.txt`),
    await page.locator('body').innerText()
  );
  await writeFile(
    path.join(output, `${runtime}-checks.json`),
    JSON.stringify({ status: 'failed', checks, error: String(error), errors }, null, 2)
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
