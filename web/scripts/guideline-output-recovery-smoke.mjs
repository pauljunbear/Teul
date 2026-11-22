import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
const server = await createServer({
  mode: 'guideline-proof',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
await server.listen();
const url = server.resolvedUrls.local[0],
  output = path.resolve('../release/guideline-output-recovery');
await mkdir(output, { recursive: true });
const runtime = `node${process.versions.node.split('.')[0]}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage(),
  errors = [],
  requests = [],
  checks = [];
page.on('pageerror', e => errors.push(e.message));
context.on('request', r => {
  if (
    r.url().includes('/api/guideline-intake') ||
    (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(url).origin)
  )
    requests.push(r.url());
});
const download = async (scope, name) => {
  const pending = page.waitForEvent('download');
  await scope.getByRole('button', { name, exact: true }).click();
  return readFile(await (await pending).path(), 'utf8');
};
const openFile = async json =>
  page.getByLabel('Open Figma capture', { exact: true }).setInputFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
try {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await openFile(await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8'));
  const source = page.getByRole('region', { name: 'Figma guideline capture', exact: true });
  await chooseGuidelineTask(source, 'extension');
  const extension = source.getByRole('region', { name: 'Source scale extension', exact: true });
  const app = source.getByRole('region', { name: 'Color applications', exact: true });
  await extension.getByLabel('New shade 1 name', { exact: true }).fill('500');
  await extension.getByLabel('New shade 1 position', { exact: true }).fill('1');
  await extension.getByRole('button', { name: 'Preview extension', exact: true }).click();
  await expect(extension.locator('[data-origin="teul-generated"]')).toHaveCount(1);
  const choose = async (label, color) => {
    const select = app.getByLabel(label, { exact: true });
    await select.selectOption(
      await select.locator('option').filter({ hasText: color }).getAttribute('value')
    );
  };
  await chooseGuidelineTask(source, 'application');
  for (const [label, color] of [
    ['Canvas', 'Light'],
    ['Continue label', 'Light'],
    ['View details link', 'Dark'],
    ['Focus ring', 'Dark'],
    ['Rest action', 'Dark'],
  ])
    await choose(label, color);
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(app.getByRole('status')).toContainText('Source and paint checks passed');
  const svg = await download(app, 'Download rest SVG');
  const json = await download(source, 'Save Figma project'),
    bundle = JSON.parse(json);
  expect(bundle.schemaVersion).toBe('teul.guideline-workspace.v1');
  expect(bundle.outputs.extension.preview.generatedBindings).toHaveLength(1);
  expect(bundle.outputs.application.exportable).toBe(true);
  await writeFile(path.join(output, `${runtime}-browser-project.json`), json);
  const codec = await server.ssrLoadModule('/src/lib/guideline/projectCodec.ts');
  const reopened = await codec.readAnyGuidelineProject(json);
  const { storedGuidelineOutputs } = await server.ssrLoadModule(
    '/src/lib/guideline/selectedOutputs.ts'
  );
  expect(storedGuidelineOutputs(reopened.value.outputs)).toEqual(bundle.outputs);
  const nodeJson = await codec.serializeGuidelineWorkspace(
    bundle.sourceProjectJson,
    reopened.value.outputs
  );
  await openFile(nodeJson);
  await chooseGuidelineTask(source, 'extension');
  await expect(extension.getByLabel('New shade 1 name', { exact: true })).toHaveValue('500');
  await chooseGuidelineTask(source, 'application');
  await expect(app.getByRole('button', { name: 'Download rest SVG', exact: true })).toBeEnabled();
  await chooseGuidelineTask(source, 'application');
  expect(await download(app, 'Download rest SVG')).toBe(svg);
  checks.push('Browser/Node bundle replay preserves extension, gradient and exact component SVG');
  await source.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    source.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await page.getByText('Saved Figma projects on this device', { exact: false }).click();
  await source.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await chooseGuidelineTask(source, 'extension');
  await expect(extension.getByLabel('New shade 1 name', { exact: true })).toHaveValue('500');
  await chooseGuidelineTask(source, 'application');
  expect(await download(app, 'Download rest SVG')).toBe(svg);
  checks.push(
    'Actual IndexedDB save, reload and reopen restores selected controls and checked exports'
  );
  await openFile(JSON.stringify({ ...bundle, bundleHash: 'sha256:' + '0'.repeat(64) }));
  await expect(source.getByRole('alert')).toContainText('integrity');
  await chooseGuidelineTask(source, 'application');
  expect(await download(app, 'Download rest SVG')).toBe(svg);
  await openFile('{"schemaVersion":"teul.guideline-workspace.v999"}');
  await expect(source.getByText(/cannot edit teul.guideline-workspace.v999/)).toBeVisible();
  await chooseGuidelineTask(source, 'application');
  expect(await download(app, 'Download rest SVG')).toBe(svg);
  checks.push('Corrupt and future bundles leave the selected application and source intact');
  await choose('Continue label', 'Dark');
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(app.getByRole('status')).toContainText('needs changes');
  const failed = await download(source, 'Save Figma project');
  expect(JSON.parse(failed).outputs.application.exportable).toBe(false);
  await openFile(failed);
  await chooseGuidelineTask(source, 'application');
  await expect(app.getByText('Needs changes', { exact: true }).first()).toBeVisible();
  await chooseGuidelineTask(source, 'application');
  await expect(app.getByRole('button', { name: 'Save application', exact: true })).toHaveCount(0);
  checks.push('Completed failed paint assessment restores visibly and remains nonexportable');
  await source.getByRole('button', { name: 'Apply Figma review', exact: true }).click();
  await expect(extension.locator('[data-origin="teul-generated"]')).toHaveCount(0);
  expect(JSON.parse(await download(source, 'Save Figma project')).schemaVersion).toBe(
    'teul.figma-project.v1'
  );
  await openFile(json);
  await chooseGuidelineTask(source, 'extension');
  await expect(extension.getByLabel('New shade 1 name', { exact: true })).toHaveValue('500');
  await extension.getByLabel('New shade 1 position', { exact: true }).fill('0.5');
  await chooseGuidelineTask(source, 'application');
  await expect(app.getByRole('button', { name: 'Save application', exact: true })).toHaveCount(0);
  expect(JSON.parse(await download(source, 'Save Figma project')).schemaVersion).toBe(
    'teul.figma-project.v1'
  );
  checks.push(
    'Re-applying source review and editing extension controls invalidate visible and retained results'
  );
  const cancelled = await page.evaluate(async json => {
    const { createGuidelineProjectStore } = await import('/src/lib/guideline/projectStore.ts');
    const store = createGuidelineProjectStore({ databaseName: 'cancelled-output-save' });
    const controller = new AbortController();
    const pending = store.save({ json, workspaceId: 'cancel-proof' }, undefined, controller.signal);
    setTimeout(() => controller.abort(), 0);
    let aborted = false;
    try {
      await pending;
    } catch (e) {
      aborted = e.name === 'AbortError';
    }
    const count = (await store.list()).entries.length;
    await store.close();
    return { aborted, count };
  }, json);
  expect(cancelled).toEqual({ aborted: true, count: 0 });
  checks.push('Cancelling replay prevents the subsequent local write');
  await openFile(json);
  await source.screenshot({ path: path.join(output, `${runtime}-desktop.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseGuidelineTask(source, 'application');
  await app.screenshot({ path: path.join(output, `${runtime}-mobile.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  checks.push(
    'Desktop and 390px restored composition render without page errors or source/provider requests'
  );
  await writeFile(
    path.join(output, `${runtime}-checks.json`),
    JSON.stringify({ status: 'passed', node: process.version, checks }, null, 2)
  );
  console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
