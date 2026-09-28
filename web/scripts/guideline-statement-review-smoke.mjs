import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, preview } from 'vite';
import { guidelineProjectView } from './guideline-project-view.mjs';

const runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/guideline-statement-review');
const hash = value => createHash('sha256').update(value).digest('hex');
const jsonValue = value => JSON.parse(JSON.stringify(value));
await mkdir(output, { recursive: true });
const receipt = {
  status: 'running',
  node: process.version,
  scope:
    'Authored PDF observations and synthetic native capture; no real-source accuracy or designer qualification.',
  checks: [],
  errors: [],
  externalRequests: [],
  artifacts: [],
};
const receiptPath = path.join(output, `browser-${runtime}.json`);
await writeFile(receiptPath, JSON.stringify(receipt));
let fixtures, server, browser;
try {
  fixtures = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
  const { statementReviewFixture } = await fixtures.ssrLoadModule(
    '/fixtures/guidelines/statement-review.ts'
  );
  const pdf = jsonValue(statementReviewFixture());
  const load = name => fixtures.ssrLoadModule(`/src/lib/guideline/${name}.ts`);
  const [figmaInventory, figmaReview, figmaProject, protocol] = await Promise.all([
    load('figmaInventory'),
    load('figmaReview'),
    load('figmaProject'),
    fixtures.ssrLoadModule('/@fs/' + path.resolve('../services/guideline-intake/src/protocol.ts')),
  ]);
  const legacy = JSON.parse(await readFile('fixtures/guidelines/figma-project-v1.json'));
  const { contentHash: _oldHash, ...nativeSource } = legacy.capture;
  nativeSource.roots[0].document.children = [
    {
      id: '90:1',
      type: 'RECTANGLE',
      name: 'Example blue',
      fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.6 } }],
    },
    ...['a', 'b', 'reviewed', 'c'].map((name, i) => ({
      id: `90:${i + 2}`,
      type: 'TEXT',
      name,
      characters: 'For internal use only.',
    })),
    {
      id: '90:9',
      type: 'TEXT',
      name: 'Long authored statement',
      characters: 'Only an authored multiline test.\n'.repeat(100),
    },
  ];
  const capture = {
    ...nativeSource,
    contentHash: `sha256:${hash(protocol.canonicalIntakeJson(nativeSource))}`,
  };
  const inventory = await figmaInventory.createFigmaNativeInventory(capture);
  const nativeDraft = figmaReview.suggestFigmaReview(inventory);
  nativeDraft.modeIds = [inventory.modes[0].id];
  nativeDraft.statements[1].modeIds = [inventory.modes[0].id];
  nativeDraft.statements[1].scope = 'brand';
  nativeDraft.statements[2] = {
    ...nativeDraft.statements[2],
    meaning: 'no-gradients',
    scope: 'product',
    reason: 'Preserved deliberately different fixture decision.',
  };
  const nativeProject = await figmaProject.buildFigmaProject({
    capture,
    draft: nativeDraft,
    review: null,
    selection: null,
  });
  receipt.fixtureHashes = {
    pdfProject: hash(JSON.stringify(pdf.project)),
    nativeProject: hash(JSON.stringify(nativeProject)),
    fixtureModule: hash(await readFile('fixtures/guidelines/statement-review.ts')),
  };
  await fixtures.close();
  fixtures = null;
  receipt.buildHashes = Object.fromEntries(
    await Promise.all(
      [
        'index.html',
        ...(await readdir('dist/assets'))
          .filter(f => /\.(js|css)$/.test(f))
          .map(f => `assets/${f}`),
      ]
        .sort()
        .map(async f => [f, hash(await readFile(`dist/${f}`))])
    )
  );
  server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
    serviceWorkers: 'block',
  });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
    receipt.externalRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => receipt.errors.push(error.message));
  const enter = async () => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  };
  const openPdf = async value =>
    page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
      name: 'authored-review.studio.json',
      mimeType: 'application/json',
      buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
    });
  let lastDownload = 0;
  const download = async name => {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, lastDownload + 180 - Date.now())));
    const [f] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name, exact: true }).click(),
    ]);
    lastDownload = Date.now();
    return readFile(await f.path(), 'utf8');
  };
  const screenshot = async name => {
    const bytes = await page.screenshot({ fullPage: true });
    const file = `${name}-${runtime}.png`;
    await writeFile(path.join(output, file), bytes);
    receipt.artifacts.push({ file, sha256: hash(bytes) });
  };
  const scan = async name => {
    const result = await new AxeBuilder({ page }).include('.guideline-statement-group').analyze();
    assert.deepEqual(result.violations, [], name);
    receipt.checks.push(`${name}: no automated accessibility violations in statement groups`);
  };
  await enter();
  await openPdf(pdf.project);
  const groups = page.locator('.guideline-statement-group');
  await expect(groups).toHaveCount(3);
  assert.deepEqual(guidelineProjectView(await download('Download project')), pdf.project);
  const repeated = groups.filter({
    has: page.locator('blockquote', { hasText: /^For internal use only\.$/ }),
  });
  await expect(repeated).toHaveCount(1);
  const occurrence = repeated.getByLabel('Statement occurrence', { exact: true });
  await expect(occurrence.locator('option')).toHaveCount(4);
  await repeated.getByLabel('Meaning', { exact: true }).selectOption('relationship');
  await expect(occurrence.locator('option:checked')).toContainText('relationship draft');
  await expect(repeated.getByRole('button', { name: /Exclude .*other matching/ })).toHaveCount(0);
  await repeated.getByLabel('Meaning', { exact: true }).selectOption('not-a-rule');
  const copy = repeated.getByRole('button', {
    name: 'Exclude 2 other matching statements',
    exact: true,
  });
  await expect(copy).toBeDisabled();
  await repeated
    .getByPlaceholder('Why does this not govern color use?')
    .fill('Document access notice; all original source restrictions remain retained.');
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  assert.ok(guidelineProjectView(await download('Download project')).review);
  await copy.focus();
  await copy.press('Enter');
  await expect(occurrence).toBeFocused();
  const editedBytes = await download('Download project'),
    edited = guidelineProjectView(editedBytes);
  assert.deepEqual(edited.capture, pdf.capture);
  assert.equal(edited.draft.rules.length, 6);
  assert.deepEqual(
    edited.draft.rules.slice(0, 3).map(r => r.meaning),
    ['not-a-rule', 'not-a-rule', 'not-a-rule']
  );
  assert.deepEqual(edited.draft.rules.slice(3), pdf.draft.rules.slice(3));
  assert.equal(edited.review, null);
  assert.equal(edited.selection, null);
  const restriction = groups.filter({
    has: page.locator('blockquote', { hasText: 'Never use white in backgrounds.' }),
  });
  await expect(restriction.locator('.guideline-statement-context')).toContainText(
    'Except on monochrome logo applications.'
  );
  await expect(restriction.locator('.guideline-statement-context')).not.toContainText(
    'Unrelated adjacent column.'
  );
  await expect(restriction.locator('.guideline-statement-context')).not.toContainText(
    'separate paragraph'
  );
  await scan('PDF grouped decisions');
  await screenshot('pdf-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await scan('PDF 390px');
  await screenshot('pdf-mobile');
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await context.setOffline(true);
  await openPdf(editedBytes);
  await expect(groups).toHaveCount(3);
  assert.equal(await download('Download project'), editedBytes);
  await context.setOffline(false);
  receipt.checks.push(
    'PDF grouping leaves initial project unchanged; explicit keyboard exclusion updates two unresolved copies, invalidates an applied review, preserves other decisions and evidence, and reopens byte-exactly offline'
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  await enter();
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await page.getByLabel('Open Figma capture', { exact: true }).setInputFiles({
    name: 'native-review.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(nativeProject)),
  });
  await expect(groups).toHaveCount(2);
  const nativeRepeated = groups.filter({
    has: page.locator('blockquote', { hasText: /^For internal use only\.$/ }),
  });
  await nativeRepeated
    .getByLabel('Native statement meaning', { exact: true })
    .selectOption('not-a-rule');
  await nativeRepeated
    .getByLabel('Reason or qualification', { exact: true })
    .fill('Access notice retained as source evidence.');
  const nativeCopy = nativeRepeated.getByRole('button', {
    name: 'Exclude 2 other matching statements',
    exact: true,
  });
  await nativeCopy.focus();
  await nativeCopy.press('Enter');
  await expect(nativeRepeated.getByLabel('Statement occurrence', { exact: true })).toBeFocused();
  const nativeEdited = guidelineProjectView(await download('Save Figma project'));
  assert.deepEqual(nativeEdited.capture, capture);
  assert.equal(nativeEdited.draft.statements.length, 5);
  assert.deepEqual(nativeEdited.draft.statements[2], nativeDraft.statements[2]);
  assert.deepEqual(nativeEdited.draft.statements[1].modeIds, nativeDraft.statements[1].modeIds);
  assert.equal(nativeEdited.draft.statements[1].scope, 'brand');
  assert.equal(nativeEdited.draft.statements[1].meaning, 'not-a-rule');
  assert.equal(nativeEdited.draft.statements[3].meaning, 'not-a-rule');
  const longText = groups
    .filter({ hasText: 'Only an authored multiline test.' })
    .locator('blockquote');
  const geometry = await longText.evaluate(node => ({
    height: node.getBoundingClientRect().height,
    scroll: node.scrollHeight,
    client: node.clientHeight,
  }));
  assert.ok(geometry.height <= 221 && geometry.scroll > geometry.client);
  await longText.focus();
  await expect(longText).toBeFocused();
  await longText.press('End');
  await expect.poll(() => longText.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await scan('Native grouped decisions');
  await screenshot('native-desktop');
  receipt.checks.push(
    'Shared native grouping preserves source statements, existing differing decisions and mode scope; long text remains bounded and scrolls with the keyboard'
  );
  assert.deepEqual(receipt.errors, []);
  assert.deepEqual(receipt.externalRequests, []);
  receipt.status = 'passed';
  receipt.browser = browser.version();
} catch (error) {
  receipt.status = 'failed';
  receipt.error = String(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await server.httpServer.close();
  if (fixtures) await fixtures.close();
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(
    JSON.stringify(
      { status: receipt.status, checks: receipt.checks, error: receipt.error },
      null,
      2
    )
  );
}
