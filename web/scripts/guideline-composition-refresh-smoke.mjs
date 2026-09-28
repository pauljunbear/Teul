import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Fixture construction runs in Node. The browser uses only the production bundle and public UI.
const fixtureServer = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
});
const load = name => fixtureServer.ssrLoadModule(`/src/lib/guideline/${name}.ts`);
const { createFigmaNativeInventory } = await load('figmaInventory');
const { suggestFigmaReview, compileFigmaReview } = await load('figmaReview');
const { buildFigmaProject } = await load('figmaProject');
const { previewGuidelineExtension, reviewGuidelineExtension } = await load('extension');
const { createGuidelineExtensionDecision } = await load('extensionRuleReview');
const { assessGuidelineApplication } = await load('application');
const { buildGuidelineApplicationLayout } = await load('applicationGeometry');
const { serializeGuidelineWorkspace, readAnyGuidelineProject } = await load('projectCodec');
const { canonicalIntakeJson } = await fixtureServer.ssrLoadModule(
  '/@fs' + path.resolve('../services/guideline-intake/src/protocol.ts')
);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const seal = raw => {
  const { contentHash: _, ...content } = raw;
  return { ...content, contentHash: `sha256:${digest(canonicalIntakeJson(content))}` };
};
const actor = { kind: 'user', ref: 'test:composition-refresh' };
const raw = JSON.parse(await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8')).capture;
raw.roots[0].document.children[2].characters = 'Use Primary together with Light.';
raw.roots[0].document.children.push({
  id: '1:8',
  type: 'RECTANGLE',
  name: 'Accent',
  fills: [{ type: 'SOLID', color: { r: 0.8, g: 0.1, b: 0.3 } }],
});
const inventory = await createFigmaNativeInventory(seal(raw)),
  draft = suggestFigmaReview(inventory);
draft.modeIds = inventory.modes.map(m => m.id);
draft.colors = inventory.declarations.map(c => ({
  declarationId: c.id,
  label: c.label.split(' / ')[0],
  family: c.locator.includes('1:8/') ? 'Accent' : 'Primary',
}));
const first = draft.colors.find(c => c.label === 'Light').declarationId,
  last = draft.colors.find(c => c.label === 'Dark').declarationId,
  mode = draft.modeIds[0];
draft.profileDecision = {
  captureHash: inventory.packet.contentHash,
  interpretation: 'srgb',
  actor,
  decidedAt: '2026-09-26T04:00:00.000Z',
};
draft.scopeDecision = { accepted: true, reason: 'Synthetic refresh fixture only.' };
draft.statements = draft.statements.map(s => ({
  ...s,
  meaning: 'relationship',
  scope: 'brand',
  definition: {
    kind: 'required-partner',
    force: 'requirement',
    operands: {
      subject: [{ kind: 'family', id: 'Primary' }],
      partner: [{ kind: 'color', id: first }],
    },
  },
}));
draft.scales = [
  {
    id: 'scale:primary',
    label: 'Primary',
    family: 'Primary',
    evidenceRefs: [first, last],
    slots: [
      { id: '100', position: 0 },
      { id: '900', position: 2 },
    ],
    modes: [
      {
        modeId: mode,
        anchors: [
          { slotId: '100', declarationId: first },
          { slotId: '900', declarationId: last },
        ],
      },
    ],
  },
];
const review = compileFigmaReview(inventory, draft, actor, '2026-09-26T04:00:00.000Z');
const source = await buildFigmaProject({
  capture: inventory.packet,
  draft,
  review,
  selection: null,
});
const request = {
  context: 'brand',
  modeId: mode,
  scaleId: 'scale:primary',
  additions: [{ slotId: '350', position: 0.5 }],
  lightnessOrder: 'none',
};
const proposal = await previewGuidelineExtension(review, request);
const decision = createGuidelineExtensionDecision(
  review.reviewHash,
  proposal,
  Object.fromEntries(proposal.pendingRuleIds.map(id => [id, 'accepted']))
);
const accepted = await reviewGuidelineExtension(review, request, decision);
const extension = {
  preview: await previewGuidelineExtension(review, {
    ...request,
    additions: [{ slotId: '500', position: 1 }],
  }),
  decision: null,
};
const layout = { kind: 'brand', modeId: mode, layout: 'split', primaryShare: 60 };
const application = await assessGuidelineApplication(review, {
  layout,
  extension: { preview: accepted, decision, anchorColorId: first, purpose: 'brand-primary' },
  assignments: buildGuidelineApplicationLayout(layout).roles.map(role => ({
    applicationId: role.applicationId,
    useId: role.useId,
    colorId: role.useId === 'ground' ? accepted.generatedBindings[0].colorId : first,
  })),
});
expect(application.recipe).toBeTruthy();
const original = await serializeGuidelineWorkspace(JSON.stringify(source, null, 2), {
  extension,
  application,
});
const changed = structuredClone(raw);
changed.roots[0].document.children[3].fills[0].color.r = 0.5;
const output = path.resolve('../release/guideline-composition-refresh');
await mkdir(output, { recursive: true });
const checks = [],
  errors = [],
  requests = [],
  runtime = `node${process.versions.node.split('.')[0]}`;
const receipt = {
  scope:
    'Production Studio UI, synthetic Figma source, shared composition restoration and rule renewal. No live source or visual acceptance claimed.',
  node: process.version,
  scriptSha256: digest(await readFile(new URL(import.meta.url))),
  checks,
  errors,
  requests,
  buildHashes: {},
};
for (const name of [
  'index.html',
  ...(await readdir('dist/assets')).filter(n => /\.(js|css)$/.test(n)).map(n => `assets/${n}`),
])
  receipt.buildHashes[name] = digest(await readFile(`dist/${name}`));
let production, browser;
try {
  production = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  const url = production.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
  });
  context.on('request', r => {
    if (
      r.url().includes('/api/') ||
      (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(url).origin)
    )
      requests.push(r.url());
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(15000);
  const open = async value =>
    page.getByLabel('Open Figma capture', { exact: true }).setInputFiles({
      name: 'composition.json',
      mimeType: 'application/json',
      buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
    });
  const sourcePanel = page.getByRole('region', { name: 'Figma guideline capture', exact: true });
  const app = sourcePanel.getByRole('region', { name: 'Color applications', exact: true });
  const download = async (scope, name) => {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      scope.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await file.path(), 'utf8');
  };
  const save = () => download(sourcePanel, 'Save Figma project');
  const paints = () =>
    app.locator('svg [fill]').evaluateAll(nodes => nodes.map(n => n.getAttribute('fill')));
  const response = await page.goto(url);
  expect(response?.status()).toBe(200);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await open(original);
  const svg = await download(app, 'Download brand SVG');
  const originalPaint = await paints();
  expect(originalPaint.length).toBeGreaterThan(0);
  await open(seal(changed));
  await sourcePanel.getByRole('button', { name: 'Compare updated capture', exact: true }).click();
  await sourcePanel
    .getByRole('button', { name: 'Save current project and accept update', exact: true })
    .click();
  await expect(
    sourcePanel.getByRole('region', { name: 'Figma source comparison', exact: true })
  ).toHaveCount(0);
  await sourcePanel
    .getByLabel('Use the recorded channels as an sRGB working interpretation.', { exact: false })
    .check();
  await sourcePanel.getByLabel('I reviewed this partial source scope', { exact: false }).check();
  await sourcePanel.getByRole('button', { name: 'Apply Figma review', exact: true }).click();
  await sourcePanel.getByRole('button', { name: 'Check previous designs', exact: true }).click();
  await expect(
    sourcePanel.getByText('application · review required', { exact: true })
  ).toBeVisible();
  await sourcePanel.getByRole('button', { name: 'Restore available designs', exact: true }).click();
  const renew = app.getByRole('button', {
    name: 'Apply rules and recheck composition',
    exact: true,
  });
  await expect(renew).toBeDisabled();
  expect(await paints()).toEqual(originalPaint);
  await expect(app.getByRole('button', { name: 'Download brand SVG', exact: true })).toHaveCount(0);
  const pendingJson = await save();
  const pending = JSON.parse(pendingJson);
  expect(pending.outputs.application.status).toBe('blocked');
  expect(pending.outputs.application.request.extension.decision).toBeNull();
  expect(pending.outputs.application.request.extension.preview.request.additions[0].slotId).toBe(
    '350'
  );
  expect(pending.outputs.extension.preview.request.additions[0].slotId).toBe('500');
  checks.push(
    'Real source comparison, acceptance, renewed source review and restore retain exact paint and distinct embedded extension, with no old approval.'
  );
  await open(pendingJson);
  await expect(renew).toBeDisabled();
  const choose = app.getByRole('combobox', { name: /^Decision for / });
  await choose.selectOption('rejected');
  await expect(renew).toBeDisabled();
  await expect(app.getByText(/This extension remains unapproved/)).toBeVisible();
  await choose.selectOption('accepted');
  await expect(renew).toBeEnabled();
  checks.push(
    'Pending work reopens exactly; missing and rejected decisions cannot enable renewal or export.'
  );

  // Hold one real cooperative engine yield, then exercise cancellation and a newer project open.
  const holdYield = async () =>
    page.evaluate(() => {
      const native = window.setTimeout;
      window.setTimeout = function (callback, delay, ...args) {
        if (delay === 0) {
          window.setTimeout = native;
          window.releaseApplicationYield = () => callback(...args);
          return -1;
        }
        return native(callback, delay, ...args);
      };
    });
  await holdYield();
  await renew.click();
  await expect
    .poll(() => page.evaluate(() => typeof window.releaseApplicationYield))
    .toBe('function');
  await app.getByRole('button', { name: 'Cancel application check', exact: true }).click();
  await page.evaluate(() => {
    window.releaseApplicationYield();
    delete window.releaseApplicationYield;
  });
  expect(digest(await save())).toBe(digest(pendingJson));
  await holdYield();
  await renew.click();
  await expect
    .poll(() => page.evaluate(() => typeof window.releaseApplicationYield))
    .toBe('function');
  expect(digest(await save())).toBe(digest(pendingJson));
  await page.evaluate(() => {
    window.releaseApplicationYield();
    delete window.releaseApplicationYield;
  });
  await expect(app.getByRole('status')).toContainText('Application check stopped');
  await expect(app.getByRole('button', { name: 'Download brand SVG', exact: true })).toHaveCount(0);
  checks.push(
    'Saving during renewal preserves pending work, suppresses late approval and clears the checking status.'
  );
  await holdYield();
  await renew.click();
  await expect
    .poll(() => page.evaluate(() => typeof window.releaseApplicationYield))
    .toBe('function');
  await open(original);
  await expect(app.getByRole('button', { name: 'Download brand SVG', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    window.releaseApplicationYield();
    delete window.releaseApplicationYield;
  });
  expect(digest(await save())).toBe(digest(original));
  checks.push(
    'Cancelling renewal preserves pending composition; opening another project prevents late publication.'
  );
  await open(pendingJson);
  await choose.selectOption('accepted');
  await renew.click();
  await expect(app.getByRole('status')).toContainText('Source and paint checks passed');
  expect(await paints()).toEqual(originalPaint);
  expect(await download(app, 'Download brand SVG')).toBe(svg);
  const renewedJson = await save(),
    renewed = JSON.parse(renewedJson);
  expect(renewed.outputs.application.exportable).toBe(true);
  expect(renewed.outputs.application.request.extension.decision.reviewedProposalHash).not.toBe(
    decision.reviewedProposalHash
  );
  expect(renewed.outputs.extension).toEqual(pending.outputs.extension);
  const parsed = await readAnyGuidelineProject(renewedJson);
  expect(parsed.status).toBe('opened');
  await open(renewedJson);
  expect(await download(app, 'Download brand SVG')).toBe(svg);
  checks.push(
    'Explicit decisions target current proposal; full reassessment enables exact original SVG, leaves standalone extension intact, and reopens across browser/Node.'
  );
  await open(pendingJson);
  await app.screenshot({ path: path.join(output, `${runtime}-desktop.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  await app.screenshot({ path: path.join(output, `${runtime}-mobile.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  checks.push('Pending rules, controls and retained composition fit desktop and 390px viewport.');
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = String(error.stack ?? error);
  throw error;
} finally {
  await writeFile(
    path.join(output, `${runtime}-checks.json`),
    JSON.stringify(receipt, null, 2) + '\n'
  );
  await browser?.close();
  await production?.close();
  await fixtureServer.close();
}
console.log(
  JSON.stringify(
    { status: receipt.status, checks, node: receipt.node, browser: receipt.browser },
    null,
    2
  )
);
