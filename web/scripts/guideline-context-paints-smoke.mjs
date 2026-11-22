import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, preview } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chooseGuidelineTask } from './guideline-task-navigation.mjs';

const output = path.resolve('../release/guideline-context-paints');
const runtime = `node${process.versions.node.split('.')[0]}`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = { status: 'running', node: process.version, checks: [], scans: [], errors: [] };
await mkdir(output, { recursive: true });
let modules, production, browser, page;
try {
  modules = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const fixtureModule = await modules.ssrLoadModule(
    '/fixtures/guidelines/context-paints-fixture.ts'
  );
  const geometry = await modules.ssrLoadModule('/src/lib/guideline/applicationGeometry.ts');
  const fixture = fixtureModule.contextPaintsFixture(true);
  const expected = fixtureModule.contextApplicationRequest(fixture.review);
  const roles = geometry.buildGuidelineApplicationLayout(expected.layout).roles;
  const { sourceSetPdf } = await modules.ssrLoadModule(
    '/fixtures/guidelines/source-set-fixture.ts'
  );
  const { previewGuidelineExtension } = await modules.ssrLoadModule(
    '/src/lib/guideline/extension.ts'
  );
  const { serializeGuidelineWorkspace } = await modules.ssrLoadModule(
    '/src/lib/guideline/projectCodec.ts'
  );
  const legacyProject = sourceSetPdf('Public legacy upgrade', '#126E78');
  const legacyScale = legacyProject.review.model.scales[0];
  const legacyPreview = await previewGuidelineExtension(legacyProject.review, {
    context: 'brand',
    modeId: legacyScale.modes[0].modeId,
    scaleId: legacyScale.id,
    additions: [{ slotId: 'middle', position: 1 }],
    lightnessOrder: 'none',
  });
  const legacyJson = await serializeGuidelineWorkspace(JSON.stringify(legacyProject), {
    extension: { preview: legacyPreview, decision: null },
    application: null,
  });

  const { constructionPortabilityArtifacts } = await modules.ssrLoadModule(
    '/fixtures/guidelines/construction-portability-artifacts.ts'
  );
  const legacyFailure = await constructionPortabilityArtifacts(1);
  await modules.close();
  modules = null;
  receipt.scriptSha256 = digest(await readFile(new URL(import.meta.url)));
  receipt.sourceSha256 = digest(fixture.sourceJson);
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
  const newContext = async () => {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1100 },
    });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
      receipt.errors.push('Unexpected remote request');
      return route.abort('blockedbyclient');
    });
    return context;
  };
  let context = await newContext();
  const open = async json => {
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => receipt.errors.push(error.message));
    await page.goto(url);
    await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
    await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
      name: 'context.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
    await chooseGuidelineTask(page, 'application');
    return page.getByRole('region', { name: 'Color applications', exact: true });
  };
  const download = async (scope, name) => {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      scope.getByRole('button', { name, exact: true }).click(),
    ]);
    const text = await readFile(await file.path(), 'utf8');
    await expect(scope.getByRole('button', { name, exact: true })).toBeEnabled();
    return text;
  };
  const scan = async name => {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const text = JSON.stringify(result, null, 2),
      file = `${runtime}-${name}.json`;
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
  await open(legacyJson);
  await chooseGuidelineTask(page, 'extension');
  const legacyPanel = page.getByRole('region', { name: 'Source scale extension', exact: true });
  await expect(
    legacyPanel.getByRole('button', { name: 'Use updated calculation', exact: true })
  ).toBeVisible();
  const untouched = JSON.parse(await download(page, 'Download project'));
  expect(untouched.outputs.extension.preview.request.numericVersion).toBeUndefined();
  expect(untouched.outputs.extension.preview.requestHash).toBe(legacyPreview.requestHash);
  await legacyPanel.getByRole('button', { name: 'Use updated calculation', exact: true }).click();
  await expect(
    legacyPanel.getByRole('button', { name: 'Use updated calculation', exact: true })
  ).toHaveCount(0);
  await legacyPanel.getByRole('button', { name: 'Preview extension', exact: true }).click();
  await expect(legacyPanel.getByRole('status')).toContainText('1 proposed shade');
  const upgraded = JSON.parse(await download(page, 'Download project'));
  expect(upgraded.outputs.extension.preview.request.numericVersion).toBe(2);
  expect(upgraded.outputs.extension.preview.requestHash).not.toBe(legacyPreview.requestHash);
  expect(upgraded.outputs.extension.decision).toBeNull();
  expect(upgraded.sourceProjectJson).toBe(JSON.stringify(legacyProject));
  receipt.checks.push(
    'A cold legacy file retains its V1 request and source; explicit updated calculation creates a distinct V2 proposal without carrying an approval.'
  );
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'reviewed-legacy-gray.json',
    mimeType: 'application/json',
    buffer: Buffer.from(legacyFailure.workspace),
  });
  await expect(
    page.getByText(
      'This file could not be opened. Its original bytes are retained read-only; your open work is unchanged.',
      { exact: true }
    )
  ).toBeVisible();
  expect(await download(page, 'Download original imported file')).toBe(legacyFailure.workspace);
  expect(JSON.parse(await download(page, 'Download project'))).toEqual(upgraded);
  receipt.checks.push(
    'An actual reviewed neutral V1 file fails cross-runtime replay, stays read-only with byte-identical recovery, and cannot replace the current V2 project or acquire its approval.'
  );
  await context.close();
  context = await newContext();
  let app = await open(fixture.sourceJson);
  await chooseGuidelineTask(page, 'extension');
  const extension = page.getByRole('region', { name: 'Source scale extension', exact: true });
  await extension.getByLabel('Scale task', { exact: true }).selectOption('interior');
  await extension.getByLabel('Use', { exact: true }).selectOption('brand');
  await extension.getByLabel('New shade 1 name', { exact: true }).fill('Middle');
  await extension.getByLabel('New shade 1 position', { exact: true }).fill('1');
  await extension.getByLabel('Lightness order', { exact: true }).selectOption('increasing');
  await extension.getByRole('button', { name: 'Preview extension', exact: true }).click();
  await extension.getByRole('combobox', { name: /^Decision for / }).selectOption('accepted');
  await extension
    .getByRole('button', { name: 'Apply extension rule decisions', exact: true })
    .click();
  await expect(extension.getByRole('combobox', { name: /^Decision for / })).toHaveCount(0);
  await chooseGuidelineTask(page, 'application');

  await app.getByLabel('Application type', { exact: true }).selectOption('chart');
  await app.getByLabel('Chart count', { exact: true }).selectOption('2');
  await app.getByLabel('Application colors', { exact: true }).selectOption('extension');
  await app
    .getByLabel('Application anchor', { exact: true })
    .selectOption(expected.assignments.find(a => a.useId === 'mark-1').colorId);
  await app.locator('.guideline-context-paints > summary').focus();
  await page.keyboard.press('Enter');
  await app.getByRole('button', { name: 'Add canvas color', exact: true }).click();
  await app.getByRole('button', { name: 'Add label color', exact: true }).click();
  const setRgb = async (index, values) => {
    let row = app.locator('.guideline-context-paint').nth(index);
    await row.locator('summary').click();
    for (const [channel, value] of Object.entries(values))
      await row.getByLabel(new RegExp(` ${channel}$`)).fill(String(value));
    await row.getByRole('button', { name: 'Set RGB', exact: true }).click();
  };
  await setRgb(0, { r: 0.0000123456789, g: 0, b: 0 });
  await setRgb(1, { r: 0.999987654321, g: 1, b: 1 });
  for (const role of roles) {
    const select = app.getByLabel(role.label, { exact: true });
    const customLabel =
      role.useId === 'ground'
        ? 'Custom canvas 1'
        : role.useId.startsWith('label')
          ? 'Custom label 2'
          : null;
    await select.selectOption(
      customLabel
        ? await select.locator('option').filter({ hasText: customLabel }).getAttribute('value')
        : expected.assignments.find(item => item.useId === role.useId).colorId
    );
    if (role.useId.startsWith('mark'))
      expect(await select.locator('option').filter({ hasText: 'Custom' }).count()).toBe(0);
  }
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  const renew = app.getByRole('button', {
    name: 'Apply rules and recheck custom colors',
    exact: true,
  });
  await expect(renew).toBeDisabled();
  const decisions = app.getByRole('combobox', { name: /^Decision for / });
  await expect(decisions).toHaveCount(1);
  await decisions.selectOption('accepted');
  await renew.click();
  await expect(app.getByRole('status')).toContainText('Source and paint checks passed');
  const svg = await download(app, 'Download chart SVG');
  const css = await download(app, 'Application CSS');
  const application = await download(app, 'Save application');
  const saved = await download(page, 'Download project');
  const parsed = JSON.parse(application);
  expect(parsed.schemaVersion).toBe('teul.guideline-application.v5');
  expect(JSON.parse(saved).schemaVersion).toBe('teul.guideline-workspace.v12');
  expect(parsed.request.contextPaints.paints.map(paint => paint.value)).toEqual(
    expected.contextPaints.paints.map(paint => paint.value)
  );
  expect(JSON.parse(JSON.parse(saved).sourceProjectJson)).toEqual(fixture.project);
  expect(svg).toContain('0.0000123456789');
  expect(css).toContain('0.999987654321');
  receipt.checks.push(
    'Real controls add exact native canvas and label values; mark controls exclude them. The combined proposal exposes an explicit source-rule review bound to these values.'
  );
  await app.getByRole('button', { name: 'Compare with original colors', exact: true }).click();
  await expect(
    app.getByText('Source colors + custom context · unchecked', { exact: true })
  ).toBeVisible();
  const compare = app.locator('.guideline-chart-comparison');
  const paintValues = await compare.evaluate(node =>
    [...node.querySelectorAll('figure svg')].map(svg =>
      [...svg.querySelectorAll('[fill]')].map(shape => shape.getAttribute('fill'))
    )
  );
  expect(paintValues).toHaveLength(2);
  expect(paintValues[0]).toEqual(paintValues[1]);
  await scan('desktop');
  await app.screenshot({ path: path.join(output, `${runtime}-desktop.png`) });
  await page.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.getByText('Saved PDF projects on this device', { exact: false }).click();
  await page.getByRole('button', { name: 'Open saved project', exact: true }).click();
  app = page.getByRole('region', { name: 'Color applications', exact: true });
  expect(await download(app, 'Save application')).toBe(application);
  await context.close();
  context = await newContext();
  app = await open(saved);
  expect(await download(app, 'Download chart SVG')).toBe(svg);
  expect(await download(app, 'Application CSS')).toBe(css);
  expect(await download(app, 'Save application')).toBe(application);
  receipt.checks.push(
    'Native values, source identity, reviewed application and all export bytes survive device reload and a fresh browser context file reopen without external requests.'
  );
  await app.getByLabel('Open saved application', { exact: true }).setInputFiles({
    name: 'reviewed-legacy-application.json',
    mimeType: 'application/json',
    buffer: Buffer.from(legacyFailure.exports.applicationJson),
  });
  await expect(app.getByRole('alert')).toContainText('original file is retained read-only');
  expect(await download(app, 'Download original application file')).toBe(
    legacyFailure.exports.applicationJson
  );
  expect(await download(app, 'Save application')).toBe(application);
  for (const [kind, summary, button] of [
    [
      'Figma',
      'details.guideline-figma:not(.guideline-website) > summary',
      'Download original Figma file',
    ],
    ['website', 'details.guideline-website > summary', 'Download original website file'],
  ]) {
    await page.locator(summary).click();
    const raw = `{ \"invalid-${kind}\": true }\n`;
    await page.getByLabel(`Open ${kind} capture`, { exact: true }).setInputFiles({
      name: `invalid-${kind}.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(raw),
    });
    const capture = page.getByRole('region', {
      name: `${kind === 'Figma' ? 'Figma' : 'Website'} guideline capture`,
      exact: true,
    });
    await expect(capture.getByText(/Its original bytes are retained read-only/)).toBeVisible();
    expect(await download(capture, button)).toBe(raw);
    await page.locator(summary).click();
  }
  expect(await download(app, 'Save application')).toBe(application);
  receipt.checks.push(
    'A rejected legacy application and invalid native imports preserve original file bytes and the last checked application; Figma and Website panels offer explicit read-only downloads.'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await scan('mobile');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await app.screenshot({ path: path.join(output, `${runtime}-mobile.png`) });
  await app.getByLabel('Custom label 2 hex', { exact: true }).fill('#000000');
  await app
    .locator('.guideline-context-paint')
    .nth(1)
    .getByRole('button', { name: 'Set color', exact: true })
    .click();
  await expect(
    app.getByText(
      'Showing the last checked application. Your current edits have not been checked.',
      { exact: true }
    )
  ).toBeVisible();
  expect(await download(app, 'Save application')).toBe(application);
  await app.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(
    app.getByRole('button', { name: 'Apply rules and recheck custom colors', exact: true })
  ).toBeDisabled();
  await app.getByRole('combobox', { name: /^Decision for / }).selectOption('accepted');
  await app
    .getByRole('button', { name: 'Apply rules and recheck custom colors', exact: true })
    .click();
  await expect(app.getByRole('status')).toContainText('needs changes');
  expect(await download(app, 'Save application')).toBe(application);
  await app.getByRole('button', { name: 'Remove Custom canvas 1', exact: true }).click();
  await expect(app.getByRole('button', { name: 'Check application', exact: true })).toBeDisabled();
  expect(await download(app, 'Save application')).toBe(application);
  receipt.checks.push(
    'Editing invalidates the review; a freshly reviewed contrast failure and removing an assigned paint retain the last valid export and prevent an unchecked replacement.'
  );
  for (const [name, data] of Object.entries({
    'project.json': saved,
    'chart.svg': svg,
    'application.css': css,
    'application.json': application,
  })) {
    await writeFile(path.join(output, `${runtime}-${name}`), data);
  }
  expect(receipt.errors).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.errors.push(error.stack ?? String(error));
  if (page)
    await page
      .screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  await modules?.close();
  await browser?.close();
  await production?.close();
  await writeFile(
    path.join(output, `${runtime}-receipt.json`),
    JSON.stringify(receipt, null, 2) + '\n'
  );
  console.log(
    JSON.stringify(
      { status: receipt.status, checks: receipt.checks, errors: receipt.errors },
      null,
      2
    )
  );
}
