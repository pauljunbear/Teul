import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('../release/guideline-brief');
const receipt = { status: 'running', node: process.version, checks: [], errors: [] };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(output, { recursive: true });
let server, browser;
try {
  receipt.scriptSha256 = hash(await readFile(new URL(import.meta.url)));
  receipt.buildHashes = Object.fromEntries(
    await Promise.all(
      [
        'index.html',
        ...(await readdir('dist/assets'))
          .filter(n => /\.(js|css)$/.test(n))
          .map(n => `assets/${n}`),
      ].map(async name => [name, hash(await readFile(`dist/${name}`))])
    )
  );
  server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
  });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
    receipt.errors.push(`Unexpected remote request: ${route.request().url()}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => receipt.errors.push(error.message));
  const region = name => page.getByRole('region', { name, exact: true });
  const download = async (scope, name) => {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      scope.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await file.path(), 'utf8');
  };
  const reopen = async json => {
    await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
      name: 'drafts.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
    await expect(
      page.getByText(
        'Project reopened. Recorded decisions are retained; this file does not authenticate its source or reviewer.',
        { exact: true }
      )
    ).toBeVisible();
  };
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .getByLabel('Choose guideline PDF', { exact: true })
    .setInputFiles('fixtures/guidelines/harbor-native.pdf');
  await page.getByRole('button', { name: 'Read selected pages', exact: true }).click();
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  const task = page.getByRole('combobox', { name: 'What would you like to make?', exact: true });
  const scale = region('Source scale extension');
  const supporting = region('Supporting colors');
  const gradient = region('Gradient proof');
  await task.selectOption('extension');
  await scale.getByLabel('Scale name', { exact: true }).fill('Saved unfinished scale');
  await scale.getByLabel('Shade order', { exact: true }).selectOption('dark');
  await task.selectOption('supporting');
  await supporting.getByLabel('Supporting library', { exact: true }).selectOption('werner');
  await task.selectOption('gradient');
  await gradient.getByLabel('Angle', { exact: true }).fill('73');
  const unfinished = await download(page, 'Download project');
  const packet = JSON.parse(unfinished);
  expect(packet.schemaVersion).toBe('teul.guideline-workspace.v9');
  expect(packet.outputs).toEqual({ extension: null, application: null });
  expect(packet.gradientSelection).toBeNull();
  expect(packet.authoring.extension.scaleLabel).toBe('Saved unfinished scale');
  expect(packet.authoring.supporting.provider).toBe('werner');
  expect(packet.authoring.gradient.controls.angle).toBe(73);
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await reopen(unfinished);
  await expect(task).toHaveValue('gradient');
  await expect(gradient.getByLabel('Angle', { exact: true })).toHaveValue('73');
  await task.selectOption('supporting');
  await expect(supporting.getByLabel('Supporting library', { exact: true })).toHaveValue('werner');
  await task.selectOption('extension');
  await expect(scale.getByLabel('Scale name', { exact: true })).toHaveValue(
    'Saved unfinished scale'
  );
  await expect(scale.getByLabel('Shade order', { exact: true })).toHaveValue('dark');
  await scale.getByRole('button', { name: 'Make scale', exact: true }).click();
  await expect(scale.locator('[data-origin="teul-generated"]')).toHaveCount(11);
  const generated = JSON.parse(await download(page, 'Download project'));
  expect(generated.outputs.extension.preview.request.label).toBe('Saved unfinished scale');
  expect(generated.outputs.extension.preview.request.polarity).toBe('dark');
  await scale.getByLabel('Scale name', { exact: true }).fill('Next ungenerated scale');
  const edited = await download(page, 'Download project');
  expect(JSON.parse(edited).outputs.extension).toEqual(generated.outputs.extension);
  await scale.getByLabel('Scale name', { exact: true }).fill('Throwaway edit');
  await reopen(edited);
  await expect(scale.getByLabel('Scale name', { exact: true })).toHaveValue(
    'Next ungenerated scale'
  );
  await expect(
    scale.getByText(
      'Showing the last generated scale. Your current edits have not been generated.',
      { exact: true }
    )
  ).toBeVisible();
  receipt.checks.push(
    'PDF controls for all three outputs survive a cold reopen before generation; the scale generator consumes the exact saved name and polarity; later edits preserve the previous verified scale.'
  );
  await task.selectOption('gradient');
  await gradient.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  await expect(
    gradient.getByText(
      'Showing the last generated gradient. Your current edits have not been generated.',
      { exact: true }
    )
  ).toHaveCount(0);
  const svg = await download(gradient, 'SVG');
  await gradient.getByLabel('Angle', { exact: true }).fill('91');
  const editedGradient = await download(page, 'Download project');
  await gradient.getByLabel('Angle', { exact: true }).fill('133');
  await reopen(editedGradient);
  await expect(gradient.getByLabel('Angle', { exact: true })).toHaveValue('91');
  expect(await download(gradient, 'SVG')).toBe(svg);
  await expect(
    gradient.getByText(
      'Showing the last generated gradient. Your current edits have not been generated.',
      { exact: true }
    )
  ).toBeVisible();
  await gradient.screenshot({ path: path.join(output, 'gradient-draft-and-retained-result.png') });
  receipt.checks.push(
    'Gradient edits reopen separately from the last checked gradient; its SVG remains byte-identical until a new result is generated.'
  );
  const passingGradient = JSON.parse(editedGradient).gradientSelection;
  await gradient
    .getByRole('checkbox', { name: 'Assess a specific use or color limit', exact: true })
    .check();
  await gradient.getByLabel('Placement', { exact: true }).selectOption('text');
  await gradient.getByLabel('Minimum contrast ratio', { exact: true }).fill('21');
  await gradient.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(gradient.getByText('New gradient failed its checks', { exact: true })).toBeVisible();
  const failedFile = await download(page, 'Download project');
  expect(JSON.parse(failedFile).gradientSelection).toEqual(passingGradient);
  expect(await download(gradient, 'SVG')).toBe(svg);
  receipt.checks.push(
    'A failed replacement gradient remains inspectable and cannot replace the last passing selection or its export.'
  );
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await page
    .getByLabel('Open Figma capture', { exact: true })
    .setInputFiles('fixtures/guidelines/figma-project-v1.json');
  const native = region('Figma guideline capture');
  const nativeTask = native.getByRole('combobox', {
    name: 'What would you like to make?',
    exact: true,
  });
  const nativeScale = native.getByRole('region', { name: 'Source scale extension', exact: true });
  await nativeTask.selectOption('extension');
  await nativeScale.getByLabel('New shade 1 name', { exact: true }).fill('Unfinished native shade');
  await nativeScale.getByLabel('New shade 1 position', { exact: true }).fill('');
  await nativeScale.getByRole('button', { name: 'Preview extension', exact: true }).click();
  await expect(nativeScale.getByRole('alert')).toContainText('enter its position');
  const nativeFile = await download(native, 'Save Figma project');
  await nativeScale.getByLabel('New shade 1 name', { exact: true }).fill('Throwaway native edit');
  await page.getByLabel('Open Figma capture', { exact: true }).setInputFiles({
    name: 'native-draft.json',
    mimeType: 'application/json',
    buffer: Buffer.from(nativeFile),
  });
  await expect(nativeScale.getByLabel('New shade 1 name', { exact: true })).toHaveValue(
    'Unfinished native shade'
  );
  await expect(nativeScale.getByLabel('New shade 1 position', { exact: true })).toHaveValue('');
  expect(JSON.parse(nativeFile).outputs.extension).toBeNull();
  receipt.checks.push(
    'A failed native scale request preserves unfinished text and an empty position through save/reopen without creating a result.'
  );
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await task.selectOption('supporting');
  await supporting.getByRole('button', { name: 'Find supporting colors', exact: true }).click();
  await expect(supporting.getByRole('article')).toHaveCount(3);
  await supporting.getByLabel('Supporting use', { exact: true }).selectOption('product');
  await expect(supporting.getByRole('article')).toHaveCount(3);
  await expect(
    supporting.getByText(
      'Showing the last generated directions. Your current edits have not been generated.',
      { exact: true }
    )
  ).toBeVisible();
  receipt.checks.push(
    'Changing supporting use preserves and renders the previous result under its original use without relabeling its checks.'
  );
  expect(receipt.errors).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server)
    await new Promise(resolve => {
      server.httpServer.close(resolve);
      server.httpServer.closeAllConnections();
    });
  await writeFile(path.join(output, 'node22-checks.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
}

process.exit(process.exitCode ?? 0);
