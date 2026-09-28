import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { guidelineProjectView } from './guideline-project-view.mjs';
import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { preview } from 'vite';
import { canonicalIntakeJson } from '../../services/guideline-intake/dist/protocol.js';

const source = {
  schemaVersion: 'teul.figma-rest-capture.v1',
  request: {
    schemaVersion: 'teul.figma-rest-request.v1',
    fileKey: 'ABC',
    version: 'revision-7',
    nodeIds: ['1:2'],
    includeVariables: false,
  },
  capturedAt: '2026-09-25T13:00:00.000Z',
  file: { name: 'Native scale', requestedVersion: 'revision-7', returnedVersion: 'revision-7' },
  profile: 'unverified',
  roots: [
    {
      id: '1:2',
      styles: {},
      document: {
        id: '1:2',
        name: 'Primary ramp',
        type: 'FRAME',
        children: [
          {
            id: '1:3',
            name: 'Light',
            type: 'RECTANGLE',
            fills: [{ type: 'SOLID', color: { r: 0.85, g: 0.9, b: 0.95 } }],
          },
          {
            id: '1:4',
            name: 'Dark',
            type: 'RECTANGLE',
            fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3 } }],
          },
          {
            id: '1:5',
            name: 'Restriction',
            type: 'TEXT',
            characters: 'Never use gradients in product.',
          },
        ],
      },
    },
  ],
  variables: {
    status: 'not-requested',
    revision: null,
    relationship: 'unversioned-current-read',
    values: {},
    collections: {},
  },
  gaps: [{ scope: 'document', code: 'FIGMA_PROFILE_UNVERIFIED', retryAfterSeconds: null }],
};
const hash = value => createHash('sha256').update(value).digest('hex');
const capture = { ...source, contentHash: `sha256:${hash(canonicalIntakeJson(source))}` };
const output = path.resolve('../release/guideline-figma-review');
const runtime = `node${process.versions.node.split('.')[0]}`;
const receiptPath = path.join(output, `browser-receipt-${runtime}.json`);
await mkdir(output, { recursive: true });
const base = {
  startedAt: new Date().toISOString(),
  node: process.version,
  captureHash: capture.contentHash,
};
const checks = [],
  failures = [],
  diagnostics = [],
  externalRequests = [],
  artifacts = [];
await writeFile(receiptPath, JSON.stringify({ ...base, status: 'running' }, null, 2));
const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
});
let browser, page, url;
try {
  url = server.resolvedUrls.local[0];
  browser = await chromium.launch({
    headless: true,
    ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) diagnostics.push(message.text());
  });
  const save = async (name, contents) => {
    const file = `${runtime}-${name}`;
    await writeFile(path.join(output, file), contents);
    artifacts.push({ file, sha256: hash(contents) });
  };
  let nextDownloadAt = 0;
  const download = async (scope, name) => {
    // Chromium suppresses rapid download bursts even with separate user clicks.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextDownloadAt - Date.now())));
    nextDownloadAt = Date.now() + 150;
    const [artifact] = await Promise.all([
      page.waitForEvent('download'),
      scope.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await artifact.path(), 'utf8');
  };
  const open = async value =>
    page.getByLabel('Open Figma capture', { exact: true }).setInputFiles({
      name: 'native-project.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(value)),
    });
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await open(capture);
  const enter = page.getByRole('button', { name: 'Review captured colors', exact: true });
  await enter.focus();
  await expect(enter).toBeFocused();
  await enter.press('Enter');
  const candidates = page.locator('.guideline-native-candidates');
  await candidates.getByRole('checkbox', { name: /Light/ }).check();
  await candidates.getByRole('checkbox', { name: /Dark/ }).check();
  await page.getByRole('checkbox', { name: /Captured node paints/ }).check();
  await page.getByRole('checkbox', { name: /Use the recorded channels/ }).check();
  const colors = page.locator('.guideline-native-color');
  for (const [index, label] of ['Light', 'Dark'].entries()) {
    await colors.nth(index).getByLabel('Color name', { exact: true }).fill(label);
    await colors.nth(index).getByLabel('Family', { exact: true }).fill('Primary');
  }
  const apply = page.getByRole('button', { name: 'Apply Figma review', exact: true });
  await apply.click();
  await expect(page.getByRole('alert')).toContainText(/scope/i);
  await page.getByRole('checkbox', { name: /I reviewed this partial source scope/ }).check();
  await page
    .getByLabel('Why this scope is sufficient', { exact: true })
    .fill('Synthetic selected primary scale for this proposal.');
  await apply.click();
  await chooseGuidelineTask(page, 'gradient');
  const gradient = page.getByRole('region', { name: 'Mode-aware gradient editor', exact: true });
  await expect(gradient.getByRole('button', { name: 'Make gradient', exact: true })).toBeDisabled();
  checks.push(
    'Keyboard entry opens native review; partial scope requires an explicit reason and unresolved captured text blocks generation.'
  );

  await page.getByLabel('Native statement meaning', { exact: true }).selectOption('no-gradients');
  await expect(gradient).toHaveCount(0);
  await page.getByLabel('Native statement use', { exact: true }).selectOption('product');
  await page.getByRole('button', { name: 'Add scale', exact: true }).click();
  const scale = page.locator('.guideline-source-scale');
  await scale.getByLabel('Scale name', { exact: true }).fill('Primary');
  await scale.getByLabel('Color family', { exact: true }).selectOption('Primary');
  for (const [index, label] of ['Light', 'Dark'].entries()) {
    await scale.getByRole('button', { name: 'Add slot', exact: true }).click();
    const slot = scale.locator('.guideline-scale-slot').nth(index);
    await slot.getByLabel('Slot name', { exact: true }).fill(index ? '900' : '100');
    await slot.getByLabel('Position', { exact: true }).fill(index ? '2' : '0');
    const sourceColor = slot.getByLabel('Source color', { exact: true });
    const option = await sourceColor
      .locator('option')
      .filter({ hasText: new RegExp(`^${label}`) })
      .getAttribute('value');
    await sourceColor.selectOption(option);
  }
  await apply.click();
  await chooseGuidelineTask(page, 'extension');
  const extension = page.getByRole('region', { name: 'Source scale extension', exact: true });
  await extension.getByLabel('New shade 1 name', { exact: true }).fill('500');
  await extension.getByLabel('New shade 1 position', { exact: true }).fill('1');
  await extension.getByRole('button', { name: 'Preview extension', exact: true }).click();
  await expect(extension).toContainText(/1 (new|proposed|generated)/i);
  checks.push(
    'A native scale with source anchors at positions zero and two produces one proposed intermediate shade through the existing extension engine.'
  );

  await chooseGuidelineTask(page, 'gradient');
  await gradient.getByRole('combobox', { name: /^Use/ }).selectOption('product');
  await expect(gradient.getByRole('button', { name: 'Make gradient', exact: true })).toBeDisabled();
  await expect(gradient).toContainText('Never use gradients in product.');
  await gradient.getByRole('combobox', { name: /^Use/ }).selectOption('brand');
  await gradient.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  await expect(gradient).toContainText('source profile is unverified');
  const exports = {};
  for (const format of ['SVG', 'CSS', 'JSON']) {
    exports[format] = await download(gradient, format);
    await save(`gradient.${format.toLowerCase()}`, exports[format]);
  }
  expect(exports.CSS).toContain('linear-gradient');
  expect(exports.SVG).toContain('<linearGradient');
  checks.push(
    'The captured gradient restriction blocks product use while brand use generates the reviewed native anchors and exports qualified SVG, CSS and JSON.'
  );
  const projectText = await download(page, 'Save Figma project');
  const workspace = JSON.parse(projectText);
  const project = guidelineProjectView(workspace);
  expect(project.capture).toEqual(capture);
  expect(project.review.model.colors).toHaveLength(2);
  expect(project.draft.scales[0].slots.map(slot => slot.position)).toEqual([0, 2]);
  expect(project.selection.modeId).toBe(project.draft.modeIds[0]);
  await save('project.json', projectText);
  await save('gradient-editor.png', await gradient.screenshot());
  await save('desktop.png', await page.screenshot({ fullPage: true }));

  await colors.first().getByLabel('Color name', { exact: true }).fill('Edited Light');
  await expect(gradient).toHaveCount(0);
  const changed = JSON.parse(await download(page, 'Save Figma project'));
  expect(changed.review).toBeNull();
  expect(changed.selection).toBeNull();
  checks.push(
    'Changing a source decision immediately removes generated views and saved review/selection authority while retaining the draft.'
  );

  await context.setOffline(true);
  await open(workspace);
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  for (const format of ['SVG', 'CSS', 'JSON'])
    expect(await download(gradient, format)).toBe(exports[format]);
  expect(await download(page, 'Save Figma project')).toBe(projectText);
  await context.setOffline(false);
  checks.push(
    'Offline reopen replays the original capture, review, native mode and selected gradient; project and SVG/CSS/JSON bytes remain exact.'
  );

  const corrupt = structuredClone(project);
  corrupt.review.model.colors[0].label = 'Injected label';
  await open(corrupt);
  await expect(page.getByRole('alert')).toContainText(/differs|match/i);
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  await open({ schemaVersion: 'teul.figma-project.v999' });
  await expect(page.getByText(/This Studio cannot edit teul.figma-project.v999/)).toBeVisible();
  await expect(gradient.locator('.guideline-gradient-preview')).toBeVisible();
  checks.push(
    'Tampered saved models and future project versions do not replace the current reviewed source or result.'
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await gradient.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await save('mobile.png', await page.screenshot({ fullPage: true }));
  await save('mobile-viewport.png', await page.screenshot());
  checks.push(
    'Native review and generated output fit a 390px viewport without horizontal page overflow.'
  );
  const oversized = structuredClone(source);
  oversized.roots[0].document.children.push(
    ...Array.from({ length: 512 }, (_, i) => ({
      id: `2:${i}`,
      type: 'TEXT',
      name: `Statement ${i}`,
      characters: `Captured statement ${i}`,
    }))
  );
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await open({ ...oversized, contentHash: `sha256:${hash(canonicalIntakeJson(oversized))}` });
  await page.getByRole('button', { name: 'Review captured colors', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Narrow the captured source');
  await expect(
    page.getByRole('button', { name: 'Review captured colors', exact: true })
  ).toBeEnabled();
  await expect(page.getByRole('tab', { name: 'Guidelines', exact: true })).toBeVisible();
  checks.push(
    'A valid capture above the review statement limit displays a narrowing error without crashing Studio or losing the captured packet.'
  );

  const multimode = structuredClone(source);
  multimode.request.includeVariables = true;
  multimode.roots[0].document.children = [];
  multimode.variables = {
    status: 'captured',
    revision: null,
    relationship: 'unversioned-current-read',
    collections: {
      brand: {
        id: 'brand',
        name: 'Brand',
        defaultModeId: 'day',
        modes: [
          { modeId: 'day', name: 'Day' },
          { modeId: 'night', name: 'Night' },
        ],
      },
    },
    values: Object.fromEntries(
      ['Low', 'High'].map((name, i) => [
        name,
        {
          id: name,
          name,
          variableCollectionId: 'brand',
          resolvedType: 'COLOR',
          valuesByMode: {
            day: { r: i ? 0.1 : 0.9, g: i ? 0.2 : 0.9, b: i ? 0.3 : 0.9 },
            night: { r: i ? 0.2 : 0.7, g: i ? 0.3 : 0.8, b: i ? 0.4 : 0.9 },
          },
        },
      ])
    ),
  };
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await open({ ...multimode, contentHash: `sha256:${hash(canonicalIntakeJson(multimode))}` });
  await page.getByRole('button', { name: 'Review captured colors', exact: true }).click();
  for (const name of ['Low', 'High'])
    await candidates.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
  for (const name of ['Day', 'Night'])
    await page.getByRole('checkbox', { name: new RegExp(`\\b${name}\\b`) }).check();
  await page.getByRole('checkbox', { name: /Use the recorded channels/ }).check();
  for (let i = 0; i < 2; i++)
    await colors.nth(i).getByLabel('Family', { exact: true }).fill('Primary');
  const modeEditor = page.getByLabel('Native mode to edit', { exact: true });
  const modeOption = async name =>
    modeEditor.locator('option').filter({ hasText: name }).getAttribute('value');
  const day = await modeOption('Day'),
    night = await modeOption('Night');
  await modeEditor.selectOption(day);
  await page.getByRole('button', { name: 'Add scale', exact: true }).click();
  await scale.getByLabel('Scale name', { exact: true }).fill('Primary');
  await scale.getByLabel('Color family', { exact: true }).selectOption('Primary');
  const anchor = async (index, name) => {
    const select = scale
      .locator('.guideline-scale-slot')
      .nth(index)
      .getByLabel('Source color', { exact: true });
    await select.selectOption(
      await select
        .locator('option')
        .filter({ hasText: new RegExp(`^${name}`) })
        .getAttribute('value')
    );
  };
  for (const [i, name] of ['Low', 'High'].entries()) {
    await scale.getByRole('button', { name: 'Add slot', exact: true }).click();
    const slot = scale.locator('.guideline-scale-slot').nth(i);
    await slot.getByLabel('Slot name', { exact: true }).fill(i ? '900' : '100');
    await slot.getByLabel('Position', { exact: true }).fill(i ? '2' : '0');
    await anchor(i, name);
  }
  await modeEditor.selectOption(night);
  await anchor(0, 'Low');
  await anchor(1, 'High');
  const nightAnchor = await scale
    .locator('.guideline-scale-slot')
    .first()
    .getByLabel('Source color', { exact: true })
    .inputValue();
  await modeEditor.selectOption(day);
  await scale
    .locator('.guideline-scale-slot')
    .first()
    .getByLabel('Slot name', { exact: true })
    .fill('200');
  await scale
    .locator('.guideline-scale-slot')
    .first()
    .getByLabel('Slot name', { exact: true })
    .fill('900');
  await expect(
    scale.locator('.guideline-scale-slot').first().getByLabel('Slot name', { exact: true })
  ).toHaveValue('200');
  await expect(page.getByRole('alert')).toContainText('Use a distinct slot name');
  await modeEditor.selectOption(night);
  await expect(
    scale.locator('.guideline-scale-slot').first().getByLabel('Source color', { exact: true })
  ).toHaveValue(nightAnchor);
  await page.getByRole('checkbox', { name: /I reviewed this partial source scope/ }).check();
  await page
    .getByLabel('Why this scope is sufficient', { exact: true })
    .fill('Two selected native modes for a local scale proposal.');
  await apply.click();
  await chooseGuidelineTask(page, 'gradient');
  await expect(gradient).toBeVisible();
  const twoModeProject = JSON.parse(await download(page, 'Save Figma project'));
  expect(twoModeProject.review).not.toBeNull();
  for (const mode of twoModeProject.draft.scales[0].modes)
    expect(mode.anchors.map(item => item.slotId)).toEqual(['200', '900']);
  await open(twoModeProject);
  await modeEditor.selectOption(night);
  await expect(
    scale.locator('.guideline-scale-slot').first().getByLabel('Source color', { exact: true })
  ).toHaveValue(nightAnchor);
  await scale.getByRole('button', { name: 'Remove slot 200 from Primary', exact: true }).click();
  const deleted = JSON.parse(await download(page, 'Save Figma project'));
  for (const mode of deleted.draft.scales[0].modes)
    expect(mode.anchors.map(item => item.slotId)).toEqual(['900']);
  checks.push(
    'Renaming a shared scale slot preserves both native modes through save/reopen; removing it explicitly removes its anchors in both modes.'
  );
  expect(externalRequests).toEqual([]);
  expect(failures).toEqual([]);
  const receipt = {
    ...base,
    status: 'passed',
    finishedAt: new Date().toISOString(),
    url,
    checks,
    failures,
    diagnostics,
    externalRequests,
    artifacts,
  };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true })
      .catch(() => {});
    await writeFile(
      path.join(output, `${runtime}-failure-body.txt`),
      await page
        .locator('body')
        .innerText()
        .catch(() => 'Page unavailable.')
    );
  }
  await writeFile(
    receiptPath,
    JSON.stringify(
      {
        ...base,
        status: 'failed',
        finishedAt: new Date().toISOString(),
        url,
        checks,
        failures,
        diagnostics,
        externalRequests,
        artifacts,
        error: String(error),
      },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
