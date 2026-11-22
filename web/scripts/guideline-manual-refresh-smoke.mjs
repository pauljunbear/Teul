import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { guidelineProjectView } from './guideline-project-view.mjs';

// Node constructs the selected-design fixture only; actual PDF crops and confirmations come from the production UI.
const fixtureServer = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
});
const load = name => fixtureServer.ssrLoadModule(`/src/lib/guideline/${name}.ts`);
const { compileGuidelineReviewV4 } = await load('reviewV4');
const { buildGuidelineProjectV4 } = await load('projectV4');
const { previewGuidelineExtension } = await load('extension');
const { assessGuidelineApplication } = await load('application');
const { buildGuidelineApplicationLayout } = await load('applicationGeometry');
const { serializeGuidelineWorkspace, readAnyGuidelineProject } = await load('projectCodec');
const digest = value => createHash('sha256').update(value).digest('hex');
const output = path.resolve('../release/guideline-manual-refresh');
await mkdir(output, { recursive: true });
const runtime = `node${process.versions.node.split('.')[0]}`;
const originalPdf = await readFile('fixtures/guidelines/harbor-scanned.pdf');
// Legal PDF trailing comments change the file digest without changing the selected page raster.
const updatedPdf = Buffer.concat([originalPdf, Buffer.from('\n% unrelated metadata revision\n')]);
const checks = [],
  errors = [],
  requests = [];
const receipt = {
  node: process.version,
  scriptSha256: digest(await readFile(new URL(import.meta.url))),
  fixtureSha256: digest(originalPdf),
  updatedSha256: digest(updatedPdf),
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
let browser, production, page;
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
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === new URL(url).origin) return route.continue();
    requests.push(requestUrl.href);
    return route.abort('blockedbyclient');
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  const panel = page.getByRole('region', { name: 'Add and review source values', exact: true });
  let downloadAt = 0;
  const download = async name => {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, downloadAt - Date.now())));
    downloadAt = Date.now() + 160;
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await file.path(), 'utf8');
  };
  const save = () => download('Download project');
  const open = async value => {
    await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
      name: 'manual.json',
      mimeType: 'application/json',
      buffer: Buffer.from(value),
    });
    await expect.poll(async () => digest(await save())).toBe(digest(value));
  };
  const pdfFile = bytes => ({ name: 'Brand.pdf', mimeType: 'application/pdf', buffer: bytes });
  const add = async (name, literal, bounds, sample = false) => {
    await panel.getByRole('button', { name: 'Add a color from this page', exact: true }).click();
    if (sample) await panel.getByLabel('Sample rendered color', { exact: true }).check();
    else await panel.getByLabel('Printed value', { exact: true }).fill(literal);
    await panel.getByLabel('Color name', { exact: true }).fill(name);
    for (const [index, label] of ['Left (%)', 'Top (%)', 'Width (%)', 'Height (%)'].entries())
      await panel.getByLabel(label, { exact: true }).fill(String(bounds[index]));
    await panel.getByRole('button', { name: 'Prepare source region', exact: true }).click();
    await expect(
      panel.getByRole('button', { name: 'Prepare source region', exact: true })
    ).toBeEnabled();
    await panel
      .getByRole('button', {
        name: sample ? 'Accept approximate sample' : 'Confirm transcription',
        exact: true,
      })
      .click();
  };
  const begin = async name => {
    await panel.getByRole('button', { name: `Review ${name} in updated PDF`, exact: true }).click();
    await expect(
      panel.getByRole('button', {
        name: name === 'Paper' ? 'Accept approximate sample' : 'Confirm transcription',
        exact: true,
      })
    ).toBeDisabled();
    await panel.getByRole('button', { name: 'Prepare source region', exact: true }).click();
    await expect(
      panel.getByRole('button', { name: 'Prepare source region', exact: true })
    ).toBeEnabled();
    await expect(
      panel.getByRole('img', { name: 'Retained source region on page 1', exact: true })
    ).toHaveCount(2);
  };
  const confirm = async name => {
    await begin(name);
    await panel
      .getByRole('button', {
        name: name === 'Paper' ? 'Accept approximate sample' : 'Confirm transcription',
        exact: true,
      })
      .click();
    await expect(
      panel.getByText(`${name} · unchanged region confirmed`, { exact: true })
    ).toBeVisible();
  };
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .getByLabel('Choose guideline PDF', { exact: true })
    .setInputFiles(pdfFile(originalPdf));
  await page.getByRole('button', { name: 'Read selected pages', exact: true }).click();
  await expect(page.getByText('0 stated colors', { exact: true })).toBeVisible();
  await add('Ocean', '#126E78', [5, 56, 55, 14]);
  const oceanDraft = JSON.parse(await save());
  const geometry = oceanDraft.draft.reviewedValues.witnesses[0];
  let edgeLeft;
  for (
    let pixel = Math.floor(geometry.render.width * 0.85);
    pixel < geometry.render.width;
    pixel++
  ) {
    const x = pixel / geometry.render.scale,
      width = geometry.pageSize.width - x;
    if ((x / geometry.pageSize.width) * 100 + (width / geometry.pageSize.width) * 100 > 100) {
      edgeLeft = ((pixel + 0.1) / (geometry.pageSize.width * geometry.render.scale)) * 100;
      break;
    }
  }
  expect(edgeLeft).toBeDefined();
  await add('Paper', '', [edgeLeft, 90, 100 - edgeLeft, 2], true);
  const source = JSON.parse(await save());
  const edgeWitness = source.draft.reviewedValues.witnesses[1];
  expect(
    (edgeWitness.bounds[0] / edgeWitness.pageSize.width) * 100 +
      (edgeWitness.bounds[2] / edgeWitness.pageSize.width) * 100
  ).toBeGreaterThan(100);
  source.draft.colors.forEach(c => {
    c.family = 'Ocean';
  });
  source.draft.scales = [
    {
      id: 'ocean',
      label: 'Ocean',
      family: 'Ocean',
      evidenceRefs: source.draft.colors.map(c => c.observationId),
      slots: source.draft.colors.map((c, i) => ({
        id: `anchor-${i}`,
        position: i * 2,
        observationId: c.observationId,
      })),
    },
  ];
  const review = compileGuidelineReviewV4(
    source.capture,
    source.draft,
    { kind: 'user', ref: 'test:manual-refresh' },
    '2026-09-26T09:00:00Z'
  );
  const selected = buildGuidelineProjectV4({
    capture: source.capture,
    draft: source.draft,
    review,
    selection: null,
  });
  const extension = {
    preview: await previewGuidelineExtension(review, {
      context: 'brand',
      modeId: 'Source',
      scaleId: 'ocean',
      additions: [{ slotId: 'middle', position: 1 }],
      lightnessOrder: 'none',
    }),
    decision: null,
  };
  expect(extension.preview.status).toBe('proposed');
  const first = review.model.colors.find(c => c.label === 'Paper').id;
  const layout = { kind: 'brand', modeId: 'Source', layout: 'split', primaryShare: 60 };
  const application = await assessGuidelineApplication(review, {
    layout,
    extension: null,
    assignments: buildGuidelineApplicationLayout(layout).roles.map(role => ({
      applicationId: role.applicationId,
      useId: role.useId,
      colorId:
        role.useId === 'ground' ? review.model.colors.find(c => c.label === 'Ocean').id : first,
    })),
  });
  expect(application.recipe).toBeTruthy();
  await open(
    await serializeGuidelineWorkspace(JSON.stringify(selected), { extension, application })
  );
  await chooseGuidelineTask(page, 'gradient');
  await page.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make gradient', exact: true })).toBeEnabled();
  const original = await save();
  await chooseGuidelineTask(page, 'application');
  const originalSvg = await download('Download brand SVG');
  const gradientPaint = guidelineProjectView(original).selection.design.compiledPaint.stops;
  await page.locator('.guideline-refresh summary').click();
  await page
    .getByLabel('Updated guideline PDF', { exact: true })
    .setInputFiles(pdfFile(updatedPdf));
  await page.getByRole('button', { name: 'Compare updated pages', exact: true }).click();
  await page
    .getByRole('button', { name: 'Save current project and accept update', exact: true })
    .click();
  await expect(
    panel.getByRole('button', { name: 'Review Ocean in updated PDF', exact: true })
  ).toBeEnabled();
  const pending = await save();
  expect(guidelineProjectView(pending).review).toBeNull();
  expect(guidelineProjectView(pending).draft.colors).toHaveLength(0);
  await begin('Ocean');
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await save()).toBe(pending);
  checks.push(
    'Updated PDF has a new digest, no carried confirmations; preparing and cancelling a fresh crop leaves the pending project byte-identical.'
  );
  await confirm('Ocean');
  expect(guidelineProjectView(await save()).draft.scales).toHaveLength(0);
  await confirm('Paper');
  checks.push(
    'An edge-touching region whose reconstructed percentages exceed 100 by floating-point rounding remains reviewable through exact saved pixel geometry.'
  );
  const fresh = guidelineProjectView(await save());
  for (let i = 0; i < 2; i++) {
    expect(fresh.draft.reviewedValues.candidates[i].id).not.toBe(
      source.draft.reviewedValues.candidates[i].id
    );
    expect(fresh.draft.reviewedValues.witnesses[i].captureHash).toBe(fresh.capture.captureHash);
    expect(fresh.draft.reviewedValues.witnesses[i].raster).toEqual(
      source.draft.reviewedValues.witnesses[i].raster
    );
    expect(fresh.draft.reviewedValues.confirmations[i].candidateHash).toBe(
      fresh.draft.reviewedValues.candidates[i].candidateHash
    );
  }
  await page.getByRole('button', { name: 'Restore related scales and rules', exact: true }).click();
  const restoredPending = await save();
  expect(guidelineProjectView(restoredPending).draft.scales).toHaveLength(1);
  expect(guidelineProjectView(restoredPending).review).toBeNull();
  await open(restoredPending);
  expect((await readAnyGuidelineProject(restoredPending)).status).toBe('opened');
  checks.push(
    'Both transcription and approximate sample require fresh confirmation; complete scale anchors restore only after both, and pending work reopens exactly in browser and Node.'
  );
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await page.getByRole('button', { name: 'Check previous designs', exact: true }).click();
  for (const kind of ['gradient', 'extension', 'application'])
    await expect(page.getByText(`${kind} · ready to restore`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore available designs', exact: true }).click();
  const recovered = await save();
  expect(guidelineProjectView(recovered).selection.design.compiledPaint.stops).toEqual(
    gradientPaint
  );
  const paints = json => {
    const preview = JSON.parse(json).outputs.extension.preview;
    return preview.generatedBindings.map(
      binding => preview.workingModel.colors.find(c => c.id === binding.colorId).valuesByMode
    );
  };
  expect(paints(recovered)).toEqual(paints(original));
  await chooseGuidelineTask(page, 'application');
  expect(await download('Download brand SVG')).toBe(originalSvg);
  await open(recovered);
  await chooseGuidelineTask(page, 'application');
  expect(await download('Download brand SVG')).toBe(originalSvg);
  checks.push(
    'Fresh source review restores the exact gradient stops, extension paint and composition SVG; recovered output reopens byte-identically.'
  );
  await open(pending);
  await page.getByLabel('Choose guideline PDF', { exact: true }).setInputFiles(pdfFile(updatedPdf));
  await begin('Ocean');
  await open(original);
  expect(await save()).toBe(original);
  await expect(
    panel.getByRole('button', { name: 'Confirm transcription', exact: true })
  ).toHaveCount(0);
  checks.push(
    'Opening another project discards the pending editor and prevents its prepared crop from publishing.'
  );
  await open(pending);
  await page.getByLabel('Choose guideline PDF', { exact: true }).setInputFiles(pdfFile(updatedPdf));
  await panel.getByRole('button', { name: 'Review Ocean in updated PDF', exact: true }).click();
  await page.evaluate(() => {
    const native = window.requestAnimationFrame;
    const held = new Map();
    let next = -1000;
    window.requestAnimationFrame = callback => {
      const id = next--;
      held.set(id, callback);
      return id;
    };
    window.heldPdfFrames = held;
    window.releasePdfFrames = () => {
      window.requestAnimationFrame = native;
      for (const callback of held.values()) native.call(window, callback);
      delete window.heldPdfFrames;
      delete window.releasePdfFrames;
    };
  });
  // Hold PDF.js paint scheduling; a DOM click avoids holding Playwright's own frame wait.
  await panel
    .getByRole('button', { name: 'Prepare source region', exact: true })
    .evaluate(button => button.click());
  await expect.poll(() => page.evaluate(() => window.heldPdfFrames.size)).toBeGreaterThan(0);
  await expect(
    panel.getByRole('button', { name: 'Preparing source region…', exact: true })
  ).toBeDisabled();
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'original.json',
    mimeType: 'application/json',
    buffer: Buffer.from(original),
  });
  await page.evaluate(() => window.releasePdfFrames());
  await expect.poll(async () => digest(await save())).toBe(digest(original));
  await expect(
    panel.getByRole('button', { name: 'Confirm transcription', exact: true })
  ).toHaveCount(0);
  checks.push(
    'Opening another project while a real PDF render is held cancels preparation; releasing the old paint cannot publish its crop or alter the new project.'
  );
  await open(pending);
  await page.getByLabel('Choose guideline PDF', { exact: true }).setInputFiles(pdfFile(updatedPdf));
  await begin('Ocean');
  await panel.screenshot({ path: path.join(output, `${runtime}-desktop.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.screenshot({ path: path.join(output, `${runtime}-mobile.png`) });
  await panel.getByLabel('Color name', { exact: true }).focus();
  await page.keyboard.press('Escape');
  expect(await save()).toBe(pending);
  checks.push(
    'Previous/fresh crops and confirmation controls fit a 390px viewport; Escape cancels without changing the saved source.'
  );
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = String(error.stack ?? error);
  if (page)
    await writeFile(
      path.join(output, `${runtime}-failure.txt`),
      await page.locator('body').innerText()
    ).catch(() => {});
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
console.log(JSON.stringify({ status: receipt.status, checks, node: receipt.node }, null, 2));
