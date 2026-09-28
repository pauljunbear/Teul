import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const oldCodecSource = execFileSync(
  'git',
  ['show', '1368d09:web/src/lib/guideline/sourceSetProject.ts'],
  { encoding: 'utf8' }
).replace(
  /from '(\.[^']+)'/g,
  (_match, relative) => `from '/@fs/${path.resolve('src/lib/guideline', relative)}.ts'`
);
const fixtureServer = await createServer({
  plugins: [
    {
      name: 'prior-source-set-codec',
      enforce: 'pre',
      resolveId: id => (id === '/__source-set-v1.ts' ? id : undefined),
      load: id => (id === '/__source-set-v1.ts' ? oldCodecSource : undefined),
    },
  ],
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
});
const { sourceSetPdf, sourceSetPdfRevision } = await fixtureServer.ssrLoadModule(
  '/fixtures/guidelines/source-set-fixture.ts'
);
const codec = await fixtureServer.ssrLoadModule('/src/lib/guideline/sourceSetProject.ts');
const oldCodec = await fixtureServer.ssrLoadModule('/__source-set-v1.ts');
const pdfA = JSON.stringify(sourceSetPdf()),
  pdfB = JSON.stringify(sourceSetPdf('PDF B', '#334455'));
const output = path.resolve('../release/guideline-source-set'),
  runtime = `node${process.versions.node.split('.')[0]}`;
await mkdir(output, { recursive: true });
const checks = [],
  errors = [],
  requests = [],
  digest = value => createHash('sha256').update(value).digest('hex');
const receipt = {
  node: process.version,
  scriptSha256: digest(await readFile(new URL(import.meta.url))),
  buildHashes: {},
  checks,
  errors,
  requests,
};
for (const name of [
  'index.html',
  ...(await readdir('dist/assets')).filter(n => /\.(js|css)$/.test(n)).map(n => `assets/${n}`),
])
  receipt.buildHashes[name] = digest(await readFile(`dist/${name}`));
let browser, production;
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
    if (target.origin === new URL(url).origin) return route.continue();
    requests.push(target.href);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  const file = json => ({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  const combined = page.getByRole('region', { name: 'Combined guidelines', exact: true });
  const download = async (scope, name) => {
    const [result] = await Promise.all([
      page.waitForEvent('download'),
      scope.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await result.path(), 'utf8');
  };
  const save = () => download(combined, 'Download source set');
  const open = json =>
    combined.getByLabel('Open source set', { exact: true }).setInputFiles(file(json));
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  for (const [json, count] of [
    [pdfA, 1],
    [pdfB, 2],
  ]) {
    await page.getByLabel('Open guideline project', { exact: true }).setInputFiles(file(json));
    await page.getByRole('button', { name: 'Add reviewed source to set', exact: true }).click();
    await expect(page.locator('.guideline-source-set > summary')).toContainText(`${count} sources`);
  }
  await page.locator('.guideline-source-set > summary').click();
  await expect(
    combined.getByRole('heading', { name: 'blue · needs a value choice', exact: true })
  ).toBeVisible();
  const pending = await save();
  expect(JSON.parse(pending).review).toBeNull();
  await open(pending);
  await expect(combined.getByRole('status').first()).toHaveText('Source set reopened.');
  const value = combined.getByLabel('Working value for blue', { exact: true });
  await value.selectOption(
    await value.locator('option').filter({ hasText: 'PDF A · Blue' }).getAttribute('value')
  );
  await combined
    .getByLabel('Reason for blue', { exact: true })
    .fill('Use the approved PDF A blue for this working palette.');
  await combined.getByRole('button', { name: 'Use chosen value', exact: true }).click();
  await expect(
    combined.getByRole('heading', { name: 'blue · resolved', exact: true })
  ).toBeVisible();
  await combined.getByRole('checkbox').check();
  await combined.getByRole('button', { name: 'Apply source-set review', exact: true }).click();
  await expect(combined.getByRole('status').first()).toContainText('Applied source-set review');
  await chooseGuidelineTask(combined, 'extension');
  const extension = combined.getByRole('region', { name: 'Source scale extension', exact: true });
  await expect(extension.getByLabel('Use', { exact: true })).toHaveValue('brand');
  await extension.getByLabel('New shade 1 name', { exact: true }).fill('500');
  await extension.getByLabel('New shade 1 position', { exact: true }).fill('1');
  await extension.getByRole('button', { name: 'Preview extension', exact: true }).click();
  await expect(extension.locator('[data-origin="teul-generated"]')).toHaveCount(1);
  await chooseGuidelineTask(combined, 'gradient');
  const gradient = combined.getByRole('region', {
    name: 'Mode-aware gradient editor',
    exact: true,
  });
  await gradient.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  const svg = await download(gradient, 'SVG'),
    json = await save(),
    stored = JSON.parse(json);
  expect(stored.draft.entries.map(e => e.projectJson)).toEqual([pdfA, pdfB]);
  expect(stored.outputs.extension.preview.generatedBindings).toHaveLength(1);
  expect(stored.review.model.conflicts[0].status).toBe('resolved');
  const replayed = await codec.readSourceSetProject(json);
  expect(replayed.status).toBe('opened');
  checks.push(
    'Reviewed PDFs add directly; unresolved conflict survives download/reopen; explicit choice preserves both original projects and drives extension and gradient engines'
  );
  await open(json);
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  expect(await download(gradient, 'SVG')).toBe(svg);
  expect(JSON.parse(await save()).outputs.extension.preview.generatedBindings).toEqual(
    stored.outputs.extension.preview.generatedBindings
  );
  checks.push('Browser/Node strict replay preserves exact generated shades and gradient SVG');
  await open('{bad');
  await expect(combined.getByRole('alert')).toBeVisible();
  expect(JSON.parse(await save()).review.reviewHash).toBe(stored.review.reviewHash);
  await open('{"schemaVersion":"teul.source-set-project.v999"}');
  await expect(combined.getByText(/cannot edit teul.source-set-project.v999/)).toBeVisible();
  expect(await download(gradient, 'SVG')).toBe(svg);
  checks.push('Malformed and future imports retain current selected work and leave it exportable');
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== 'held-source-set.json') return original.call(this);
      return original.call(this).then(
        value =>
          new Promise(resolve => {
            window.releaseSourceSetFile = () => resolve(value);
          })
      );
    };
  });
  await combined
    .getByLabel('Open source set', { exact: true })
    .setInputFiles({ ...file(pending), name: 'held-source-set.json' });
  await expect.poll(() => page.evaluate(() => typeof window.releaseSourceSetFile)).toBe('function');
  await combined.getByRole('button', { name: 'Cancel source-set operation', exact: true }).click();
  await open(json);
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  await page.evaluate(() => window.releaseSourceSetFile());
  expect(JSON.parse(await save()).review.reviewHash).toBe(stored.review.reviewHash);
  expect(await download(gradient, 'SVG')).toBe(svg);
  checks.push(
    'Cancelled delayed file completion cannot replace a newer reviewed source set or invalidate its gradient'
  );
  await combined.getByLabel('Working use', { exact: true }).selectOption('product');
  await expect(
    combined.getByRole('region', { name: 'Design with reviewed colors', exact: true })
  ).toHaveCount(0);
  await expect(
    combined.getByRole('heading', { name: 'blue · needs a value choice', exact: true })
  ).toBeVisible();
  const productChoice = combined.getByLabel('Working value for blue', { exact: true });
  await productChoice.selectOption(
    await productChoice.locator('option').filter({ hasText: 'PDF A · Blue' }).getAttribute('value')
  );
  await combined
    .getByLabel('Reason for blue', { exact: true })
    .fill('Reviewed for the separate product use.');
  await combined.getByRole('button', { name: 'Use chosen value', exact: true }).click();
  await expect(
    combined.getByRole('heading', { name: 'blue · resolved', exact: true })
  ).toBeVisible();
  await combined.getByRole('checkbox').check();
  await combined.getByRole('button', { name: 'Apply source-set review', exact: true }).click();
  await chooseGuidelineTask(combined, 'extension');
  await expect(extension.getByLabel('Use', { exact: true })).toHaveValue('product');
  await chooseGuidelineTask(combined, 'gradient');
  await expect(gradient.getByLabel('Use', { exact: true })).toHaveValue('product');
  checks.push(
    'Changing use clears resolutions, approvals and outputs; authoring controls start in the only declared use'
  );
  await open(json);
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  await context.setOffline(true);
  await open(json);
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  expect(await download(gradient, 'SVG')).toBe(svg);
  checks.push(
    'Reviewed source-set recovery and bundled gradient replay work offline after Studio is loaded'
  );
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await page
    .getByLabel('Open Figma capture', { exact: true })
    .setInputFiles('fixtures/guidelines/figma-project-v1.json');
  const figma = page.getByRole('region', { name: 'Figma guideline capture', exact: true });
  await figma.getByRole('button', { name: 'Add reviewed source to set', exact: true }).click();
  await expect(page.locator('.guideline-source-set > summary')).toContainText('3 sources');
  checks.push('Native Figma reviewed source adds directly through the shared source review action');
  await open(json);
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  await context.setOffline(false);
  const local = combined.locator('[aria-label="combined guideline local projects"]');
  await combined.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    combined.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.locator('.guideline-source-set > summary').click();
  await local
    .locator('summary')
    .filter({ hasText: 'Saved combined guideline projects on this device' })
    .click();
  await local.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  expect(await download(gradient, 'SVG')).toBe(svg);
  expect(JSON.parse(await save())).toEqual(stored);
  await combined.getByLabel('Working use', { exact: true }).selectOption('product');
  await combined.getByRole('button', { name: 'Update saved project', exact: true }).click();
  await expect(local.getByText('Revision 2 ·', { exact: false })).toBeVisible();
  await local.locator('summary').filter({ hasText: 'Saved revisions (2)' }).click();
  await local.getByRole('button', { name: 'Open revision 1', exact: true }).click();
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  expect(await download(gradient, 'SVG')).toBe(svg);
  expect(JSON.parse(await save())).toEqual(stored);
  await combined.getByRole('button', { name: 'Update saved project', exact: true }).click();
  await expect(local.locator('small').filter({ hasText: 'Revision 3 ·' })).toBeVisible();
  await combined.getByRole('button', { name: 'Save a new copy', exact: true }).click();
  await expect(local.getByRole('button', { name: 'Open saved project', exact: true })).toHaveCount(
    2
  );
  // Opening a portable file detaches the device reference; it must not overwrite an unrelated save.
  await open(pending);
  await expect(
    combined.getByRole('button', { name: 'Save on this device', exact: true })
  ).toBeEnabled();
  await open(json);
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  expect(await download(gradient, 'SVG')).toBe(svg);
  checks.push(
    'Production save/reload reopens exact selected shades and SVG; edit/save and historical restoration append revisions, copy creates a separate record, and file-open detaches device identity'
  );
  const updatedPdf = JSON.stringify(sourceSetPdfRevision(sourceSetPdf(), { note: true }));
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles(file(updatedPdf));
  const sourceAction = page.locator('.guideline-source-set-add');
  const entryId = stored.draft.entries.find(e => e.label === 'PDF A').id;
  await sourceAction.getByLabel('Source to update in set', { exact: true }).selectOption(entryId);
  await sourceAction.getByRole('button', { name: 'Compare source update', exact: true }).click();
  const comparison = combined.getByRole('region', {
    name: 'Source update comparison',
    exact: true,
  });
  await expect(comparison).toBeVisible();
  await comparison.screenshot({ path: path.join(output, `${runtime}-refresh-desktop.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await comparison.screenshot({ path: path.join(output, `${runtime}-refresh-mobile.png`) });
  await page.setViewportSize({ width: 1440, height: 1100 });
  expect(JSON.parse(await save())).toEqual(stored);
  await comparison.getByRole('button', { name: 'Keep current source', exact: true }).click();
  expect(JSON.parse(await save())).toEqual(stored);
  checks.push(
    'Direct source-review comparison stages the update; rejection preserves the exact project and selected designs'
  );
  const compareFile = () =>
    combined
      .getByLabel('Compare updated project for PDF A', { exact: true })
      .setInputFiles(file(updatedPdf));
  await compareFile();
  await expect(comparison).toBeVisible();
  await comparison
    .getByRole('button', { name: 'Save current set and accept update', exact: true })
    .click();
  await expect(
    combined.getByRole('status').filter({ hasText: 'Previous set saved' })
  ).toBeVisible();
  const refreshedPending = JSON.parse(await save());
  expect(refreshedPending.schemaVersion).toBe('teul.source-set-project.v2');
  expect(refreshedPending.review).toBeNull();
  expect(JSON.parse(refreshedPending.refresh.previousProjectJson)).toEqual(stored);
  expect(refreshedPending.draft.entries.find(e => e.id === entryId).projectJson).toBe(updatedPdf);
  expect(refreshedPending.draft.entries.find(e => e.id !== entryId).projectJson).toBe(pdfB);
  expect(refreshedPending.draft.resolutions[0].reason).toBe(stored.draft.resolutions[0].reason);
  await open(JSON.stringify(refreshedPending));
  await combined.getByRole('checkbox').check();
  await combined.getByRole('button', { name: 'Apply source-set review', exact: true }).click();
  const restoration = combined.getByRole('region', {
    name: 'Previous source designs',
    exact: true,
  });
  await restoration.getByRole('button', { name: 'Check previous designs', exact: true }).click();
  await expect(restoration.getByText('gradient · ready to restore', { exact: true })).toBeVisible();
  await expect(
    restoration.getByText('extension · ready to restore', { exact: true })
  ).toBeVisible();
  await restoration.getByRole('button', { name: 'Restore available designs', exact: true }).click();
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  expect(await download(gradient, 'SVG')).toBe(svg);
  const restoredJson = await save();
  expect((await codec.readSourceSetProject(restoredJson)).status).toBe('opened');
  expect(await oldCodec.readSourceSetProject(restoredJson)).toEqual({
    status: 'read-only',
    version: 'teul.source-set-project.v2',
  });
  await open(restoredJson);
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  expect(await download(gradient, 'SVG')).toBe(svg);
  checks.push(
    'Accepted refresh saves its predecessor, retains other source bytes and editable choices, and reopens pending review and exactly restored gradient paint'
  );

  // A failed prerequisite save cannot accept the staged replacement.
  await open(json);
  await compareFile();
  await expect(comparison).toBeVisible();
  await page.evaluate(() => {
    window.originalSourceSetDigest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async () => {
      throw new DOMException('Synthetic unavailable storage digest', 'OperationError');
    };
  });
  await comparison
    .getByRole('button', { name: 'Save current set and accept update', exact: true })
    .click();
  await expect(local.getByRole('alert')).toBeVisible();
  await page.evaluate(() => {
    crypto.subtle.digest = window.originalSourceSetDigest;
  });
  expect(JSON.parse(await save())).toEqual(stored);
  await expect(comparison).toBeVisible();
  await page.evaluate(() => {
    crypto.subtle.digest = (...args) =>
      new Promise(resolve => {
        window.releaseRefreshSave = () => resolve(window.originalSourceSetDigest(...args));
      });
  });
  await comparison
    .getByRole('button', { name: 'Save current set and accept update', exact: true })
    .click();
  await expect.poll(() => page.evaluate(() => typeof window.releaseRefreshSave)).toBe('function');
  await combined.getByRole('button', { name: 'Cancel source-set operation', exact: true }).click();
  await page.evaluate(() => {
    crypto.subtle.digest = window.originalSourceSetDigest;
    window.releaseRefreshSave();
  });
  expect(JSON.parse(await save())).toEqual(stored);
  await comparison.getByRole('button', { name: 'Keep current source', exact: true }).click();
  await compareFile();
  await expect(comparison).toBeVisible();
  await combined.getByLabel('Working use', { exact: true }).selectOption('product');
  await expect(comparison).toHaveCount(0);
  checks.push(
    'Failed or cancelled prerequisite saves leave current work intact; subsequent edits discard stale staged comparisons'
  );
  await open(restoredJson);
  await expect(gradient.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  await combined
    .getByRole('heading', { name: 'Review working values', exact: true })
    .evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(output, `${runtime}-desktop.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  await combined
    .getByRole('heading', { name: 'Review working values', exact: true })
    .evaluate(el => el.scrollIntoView({ block: 'start' }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await page.screenshot({ path: path.join(output, `${runtime}-mobile.png`) });
  checks.push('Combined review remains within the mobile viewport');

  // Use the public UI to retain a B-only composition through an unrelated A rule edit.
  const { prepareSourceSetEntry, applySourceSetReview } = await fixtureServer.ssrLoadModule(
    '/src/lib/guideline/sourceSet.ts'
  );
  const { assessGuidelineApplication, exportGuidelineApplication } =
    await fixtureServer.ssrLoadModule('/src/lib/guideline/application.ts');
  const { buildGuidelineApplicationLayout } = await fixtureServer.ssrLoadModule(
    '/src/lib/guideline/applicationGeometry.ts'
  );
  const sourceA = sourceSetPdf('PDF A', '#123456', 'color');
  const A = await prepareSourceSetEntry(JSON.stringify(sourceA), 'A'),
    B = await prepareSourceSetEntry(pdfB, 'B');
  const ruleDraft = {
    entries: [A.entry, B.entry],
    subjects: [...A.subjects, ...B.subjects.map(s => ({ ...s, subject: `B ${s.subject}` }))],
    scope: 'brand',
    resolutions: [],
  };
  const ruleReview = await applySourceSetReview(ruleDraft, {
    actor: { kind: 'user', ref: 'test:rule-refresh' },
    reviewedAt: '2026-09-26T10:00:00.000Z',
  });
  const layout = { kind: 'brand', modeId: 'Working', layout: 'split', primaryShare: 60 };
  const ruleApplication = await assessGuidelineApplication(ruleReview, {
    layout,
    extension: null,
    assignments: buildGuidelineApplicationLayout(layout).roles.map(r => ({
      applicationId: r.applicationId,
      useId: r.useId,
      colorId: ruleReview.model.colors.find(
        c => c.label === (r.useId === 'ground' ? 'b light' : 'b blue')
      ).id,
    })),
  });
  expect(ruleApplication.status).toBe('ready');
  const ruleProject = await codec.serializeSourceSetProject({
    draft: ruleDraft,
    review: ruleReview,
    outputs: { extension: null, application: ruleApplication },
    gradientSelection: null,
  });
  const expectedPaint = (await exportGuidelineApplication(ruleApplication)).svgs[0];
  const originalRule = sourceA.draft.rules[0].definition;
  const revisions = [
    {
      text: 'Do not pair Blue and Light.',
      definition: {
        ...originalRule,
        operands: { ...originalRule.operands, right: [{ kind: 'color', id: 'color:1' }] },
      },
    },
    {
      text: 'Blue should occupy more area than Gold.',
      definition: {
        kind: 'prominence',
        force: 'requirement',
        operands: {
          kind: 'ordered-groups',
          groups: [[{ kind: 'color', id: 'color:0' }], [{ kind: 'color', id: 'color:2' }]],
        },
      },
    },
  ];
  await page.setViewportSize({ width: 1440, height: 1100 });
  const applicationView = combined.getByRole('region', {
    name: 'Color applications',
    exact: true,
  });
  const applicationSvg = `Download ${expectedPaint.applicationId} SVG`;
  for (const [index, rule] of revisions.entries()) {
    await open(ruleProject);
    await expect(
      applicationView.getByRole('button', { name: applicationSvg, exact: true })
    ).toBeEnabled();
    const update = JSON.stringify(sourceSetPdfRevision(sourceA, { rule, color: [0, '#223344'] }));
    await combined
      .getByLabel('Compare updated project for PDF A', { exact: true })
      .setInputFiles(file(update));
    await comparison
      .getByRole('button', { name: 'Save current set and accept update', exact: true })
      .click();
    await expect(comparison).toHaveCount(0);
    await combined
      .getByRole('checkbox', { name: 'I reviewed the source modes,', exact: false })
      .check();
    await combined.getByRole('button', { name: 'Apply source-set review', exact: true }).click();
    await restoration.getByRole('button', { name: 'Check previous designs', exact: true }).click();
    if (index === 0) {
      await expect(
        restoration.getByText('application · ready to restore', { exact: true })
      ).toBeVisible();
      await restoration
        .getByRole('button', { name: 'Restore available designs', exact: true })
        .click();
      expect(await download(applicationView, applicationSvg)).toBe(expectedPaint.svg);
      const portable = await save();
      expect((await codec.readSourceSetProject(portable)).status).toBe('opened');
      await open(portable);
      expect(await download(applicationView, applicationSvg)).toBe(expectedPaint.svg);
    } else {
      await expect(
        restoration.getByText('application · changed dependencies', { exact: true })
      ).toBeVisible();
      await expect(
        restoration.getByRole('button', { name: 'Restore available designs', exact: true })
      ).toBeDisabled();
      expect(JSON.parse(await save()).outputs.application).toBeNull();
    }
  }
  checks.push(
    'Changed A-only rules preserve B composition SVG exactly through restoration and portable reopen; a new global prominence rule prevents restoration'
  );
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  receipt.passed = true;
} finally {
  await writeFile(path.join(output, `${runtime}-receipt.json`), JSON.stringify(receipt, null, 2));
  await browser?.close();
  await new Promise(resolve => (production ? production.httpServer.close(resolve) : resolve()));
  await fixtureServer.close();
}
console.log(JSON.stringify(receipt, null, 2));
