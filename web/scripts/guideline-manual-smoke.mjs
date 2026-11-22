import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { guidelineProjectView } from './guideline-project-view.mjs';
import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { preview } from 'vite';

// Exercise the shipped browser flow and its downloaded artifacts, not an internal parser API.
const output = path.resolve('../release/guideline-manual');
const runtime = `node${process.versions.node.split('.')[0]}`;
const receiptPath = path.join(output, `browser-receipt-${runtime}.json`);
await mkdir(output, { recursive: true });
const startedAt = new Date().toISOString();
const checks = [];
const failures = [];
const diagnostics = [];
const externalRequests = [];
const artifacts = [];
const fixtureHashes = {};
for (const name of ['harbor-scanned.pdf', 'harbor-native.pdf']) {
  fixtureHashes[name] = createHash('sha256')
    .update(await readFile(path.resolve('fixtures/guidelines', name)))
    .digest('hex');
}
const buildHashes = {};
for (const name of [
  'index.html',
  ...(await readdir('dist/assets')).filter(n => /\.(js|css)$/.test(n)).map(n => `assets/${n}`),
])
  buildHashes[name] = createHash('sha256')
    .update(await readFile(`dist/${name}`))
    .digest('hex');
const baseReceipt = { startedAt, node: process.version, fixtureHashes, buildHashes };
await writeFile(receiptPath, JSON.stringify({ ...baseReceipt, status: 'running' }, null, 2));
const server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
let browser;
let page;
let url;
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
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === new URL(url).origin) return route.continue();
    externalRequests.push(requestUrl.href);
    return route.abort('blockedbyclient');
  });
  page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) diagnostics.push(message.text());
  });
  const save = async (name, contents) => {
    const filename = `${runtime}-${name}`;
    await writeFile(path.join(output, filename), contents);
    artifacts.push({
      file: filename,
      sha256: createHash('sha256').update(contents).digest('hex'),
    });
  };
  const screenshot = async name => {
    await save(name, await page.screenshot({ fullPage: true }));
  };
  let nextDownloadAt = 0;
  const download = async name => {
    // Chromium suppresses rapid download bursts; each click must produce a distinct artifact.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextDownloadAt - Date.now())));
    nextDownloadAt = Date.now() + 150;
    const [artifact] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await artifact.path(), 'utf8');
  };
  const importProject = async (text, name = 'manual-project.json') => {
    await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
  };
  const read = () => page.getByRole('button', { name: 'Read selected pages', exact: true });
  const extract = async pages => {
    await expect(read()).toBeEnabled();
    await page.getByLabel('Pages to read', { exact: true }).fill(pages);
    await read().click();
    await expect(read()).toBeEnabled();
  };
  const panel = page.getByRole('region', { name: 'Add and review source values' });
  const add = () => panel.getByRole('button', { name: 'Add a color from this page', exact: true });
  const apply = () => page.getByRole('button', { name: 'Apply my review', exact: true });
  const entry = name =>
    panel
      .locator('.guideline-manual-entry')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
  const region = async values => {
    for (const [index, label] of ['Left (%)', 'Top (%)', 'Width (%)', 'Height (%)'].entries())
      await panel.getByLabel(label, { exact: true }).fill(String(values[index]));
    await panel.getByRole('button', { name: 'Prepare source region', exact: true }).click();
    await expect(
      panel.getByRole('button', { name: 'Prepare source region', exact: true })
    ).toBeEnabled();
    await expect(
      panel.getByRole('img', { name: 'Retained source region on page 1' })
    ).toBeVisible();
  };
  const assertUnchangedCapture = project => {
    expect(project.capture.observations).toHaveLength(0);
    expect(project.capture.scope.gaps.some(item => /text/i.test(item.message))).toBe(true);
    expect(project.capture.identity.sha256).toBe(`sha256:${fixtureHashes['harbor-scanned.pdf']}`);
  };
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-scanned.pdf');
  await extract('1');
  await expect(page.getByText('0 stated colors', { exact: true })).toBeVisible();
  await expect(apply()).toBeDisabled();
  const initialProject = await download('Download project');
  assertUnchangedCapture(JSON.parse(initialProject));
  checks.push(
    'A real scanned PDF has zero extracted text/color observations and an explicit coverage gap; adding user evidence is a separate action.'
  );

  await add().focus();
  await add().press('Enter');
  await expect(panel.getByRole('heading', { name: 'New source value · page 1' })).toBeFocused();
  await panel.getByLabel('Printed value', { exact: true }).fill('rgb(256 0 0)');
  await expect(panel.getByLabel('Printed value', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true'
  );
  await panel.getByLabel('Color name', { exact: true }).fill('Ocean');
  await expect(
    panel.getByRole('button', { name: 'Confirm transcription', exact: true })
  ).toBeDisabled();
  await panel.getByLabel('Printed value', { exact: true }).fill('#126E79');
  await expect(
    panel.getByRole('button', { name: 'Confirm transcription', exact: true })
  ).toBeDisabled();
  await region([5, 56, 55, 14]);
  await expect(
    panel.getByText('Transcribed from source · opacity 1', { exact: true })
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Confirm transcription', exact: true }).click();
  await expect(entry('Ocean')).toContainText('Transcribed from source · page 1 · Accepted');
  const typedProject = JSON.parse(await download('Download project'));
  expect(typedProject.schemaVersion).toBe('teul.guideline-project.v4');
  assertUnchangedCapture(typedProject);
  expect(typedProject.draft.reviewedValues.candidates).toHaveLength(1);
  expect(typedProject.draft.reviewedValues.candidates[0].literal).toBe('#126E79');
  expect(typedProject.draft.reviewedValues.candidates[0].method).toBe('transcribed-digital');
  expect(typedProject.review).toBeNull();
  checks.push(
    'Invalid values and values lacking retained source evidence cannot be confirmed. A user-confirmed transcription retains its crop and literal without rewriting the native capture.'
  );

  const beforeDecline = await download('Download project');
  await add().click();
  await panel.getByLabel('Sample rendered color', { exact: true }).check();
  await region([10, 28, 15, 15]);
  await panel.getByLabel('Color name', { exact: true }).fill('Declined sample');
  await expect(panel.getByText(/Rendered sample · approximate · opacity/)).toBeVisible();
  await panel.getByRole('button', { name: 'Accept approximate sample', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(add()).toBeFocused();
  expect(await download('Download project')).toBe(beforeDecline);
  checks.push(
    'Preparing a sample does not accept it. Escape declines the sample, restores keyboard focus, and leaves the saved project byte-for-byte unchanged.'
  );

  await add().click();
  await panel.getByLabel('Sample rendered color', { exact: true }).check();
  await panel.getByLabel('Left (%)', { exact: true }).fill('95');
  await expect(
    panel.getByRole('button', { name: 'Prepare source region', exact: true })
  ).toBeDisabled();
  await region([10, 28, 15, 15]);
  await panel.getByLabel('Color name', { exact: true }).fill('Ocean sample');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await panel.getByLabel('Left (%)', { exact: true }).focus();
  await expect(panel.getByLabel('Left (%)', { exact: true })).toBeFocused();
  await save('manual-mobile-keyboard.png', await page.screenshot());
  const sizes = await panel.locator('button, input[type=number]').evaluateAll(nodes =>
    nodes
      .filter(node => node.checkVisibility())
      .map(node => ({
        name: node.textContent || node.getAttribute('type'),
        height: node.getBoundingClientRect().height,
      }))
  );
  expect(sizes.filter(item => item.height < 44)).toEqual([]);
  await panel.locator('.guideline-manual-preview').scrollIntoViewIfNeeded();
  await save('manual-mobile-sample.png', await page.screenshot());
  await panel.getByRole('button', { name: 'Accept approximate sample', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(entry('Ocean sample')).toContainText(
    'Rendered sample · approximate · page 1 · Accepted'
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  const sampleProject = JSON.parse(await download('Download project'));
  const sample = sampleProject.draft.reviewedValues.candidates.find(
    item => item.method === 'rendered-srgb-sample'
  );
  expect(sample.value.hex).toBe('#126E78');
  expect(sample.value.alpha).toBe(1);
  const sampleWitness = sampleProject.draft.reviewedValues.witnesses.find(
    item => item.witnessHash === sample.witnessHash
  );
  expect(sampleWitness.render.colorSpace).toBe('srgb');
  expect(sampleWitness.render.background).toBe('#FFFFFF');
  const rgba = Buffer.from(sampleWitness.raster.rgbaBase64, 'base64');
  const offset = (sample.pixel.y * sampleWitness.raster.width + sample.pixel.x) * 4;
  expect([...rgba.subarray(offset, offset + 4)]).toEqual([18, 110, 120, 255]);
  expect(
    sampleProject.draft.reviewedValues.confirmations.find(item => item.candidateId === sample.id)
      .revoked
  ).toBeNull();
  assertUnchangedCapture(sampleProject);
  checks.push(
    'Explicit sample acceptance records the exact retained center pixel as an opaque, approximate rendered sRGB value. Bounds validation, 44px controls and keyboard acceptance work at 390px without overflow.'
  );

  await apply().click();
  await chooseGuidelineTask(page, 'gradient');
  await page.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  const sourceReviewJson = await download('Download source review');
  const sourceReview = JSON.parse(sourceReviewJson);
  expect(sourceReview.review.schemaVersion).toBe('teul.guideline-review.v4');
  expect(sourceReview.review.model.colors).toHaveLength(2);
  const css = await download('CSS');
  expect(css).toContain('Accepted rendered sRGB approximation');
  expect(css).toContain('User-confirmed transcription');
  await expect(page.getByRole('button', { name: 'Make gradient', exact: true })).toBeEnabled();
  const projectJson = await download('Download project');
  const project = guidelineProjectView(projectJson);
  expect(project.selection).not.toBeNull();
  await save('accepted-source-review.json', sourceReviewJson);
  await save('accepted-project.json', projectJson);
  await save('accepted-gradient.css', css);
  await screenshot('manual-desktop.png');
  checks.push(
    'Both accepted methods feed the shared review and gradient compiler; the review and CSS export preserve their distinct provenance notices.'
  );

  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await expect(page.getByLabel('Open guideline project', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await importProject(projectJson);
  await expect(page.getByText('Source preview is closed', { exact: true })).toBeVisible();
  await expect(add()).toBeDisabled();
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  expect(await download('Download project')).toBe(projectJson);
  expect(await download('Download source review')).toBe(sourceReviewJson);
  expect(await download('CSS')).toBe(css);
  await entry('Ocean').locator('summary').click();
  await expect(
    entry('Ocean').getByRole('img', { name: 'Retained source region on page 1' })
  ).toBeVisible();
  await expect(
    entry('Ocean').getByRole('button', { name: 'View source region', exact: true })
  ).toBeDisabled();
  await save('manual-offline-crop.png', await page.screenshot());
  checks.push(
    'V4 project, selected gradient and provenance exports reopen byte-for-byte offline without the PDF. Recorded crops remain inspectable; preparing new regions is unavailable.'
  );

  await entry('Ocean').getByRole('button', { name: 'Correct', exact: true }).click();
  await panel.getByLabel('Printed value', { exact: true }).fill('#126E78');
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await download('Download project')).toBe(projectJson);
  await entry('Ocean').getByRole('button', { name: 'Correct', exact: true }).click();
  await panel.getByLabel('Printed value', { exact: true }).fill('#126E78');
  await panel.getByLabel('Color name', { exact: true }).fill('Ocean corrected');
  await expect(
    panel.getByRole('button', { name: 'Prepare source region', exact: true })
  ).toBeDisabled();
  await expect(
    panel.getByRole('button', { name: 'Confirm transcription', exact: true })
  ).toBeEnabled();
  await panel.getByRole('button', { name: 'Confirm transcription', exact: true }).click();
  await expect(page.locator('.guideline-gradient-preview')).toHaveCount(0);
  await expect(entry('Ocean')).toContainText('Replaced');
  await expect(entry('Ocean').getByRole('button', { name: 'Correct', exact: true })).toBeDisabled();
  const correctedJson = await download('Download project');
  const corrected = JSON.parse(correctedJson);
  expect(corrected.review).toBeNull();
  expect(corrected.selection).toBeNull();
  expect(corrected.draft.reviewedValues.candidates).toHaveLength(3);
  const original = corrected.draft.reviewedValues.candidates.find(
    item => item.literal === '#126E79'
  );
  const replacement = corrected.draft.reviewedValues.candidates.find(
    item => item.replacesId === original.id
  );
  expect(replacement.literal).toBe('#126E78');
  expect(replacement.witnessHash).toBe(original.witnessHash);
  expect(corrected.draft.colors.find(item => item.observationId === original.id).include).toBe(
    false
  );
  expect(
    corrected.draft.reviewedValues.confirmations.find(item => item.candidateId === original.id)
      .revoked.reason
  ).toMatch(/corrected/);
  assertUnchangedCapture(corrected);
  await save('corrected-project.json', correctedJson);
  checks.push(
    'Canceling a correction preserves all work. Confirming a wrong-digit correction works from the saved crop offline, appends a replacement, revokes/excludes its predecessor, and clears reviewed/generated results.'
  );

  await apply().click();
  await chooseGuidelineTask(page, 'gradient');
  await page.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  await entry('Ocean sample').getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(page.locator('.guideline-gradient-preview')).toHaveCount(0);
  await expect(entry('Ocean sample')).toContainText('Revoked');
  await expect(
    entry('Ocean sample').getByRole('button', { name: 'Revoke', exact: true })
  ).toBeDisabled();
  const revokedJson = await download('Download project');
  const revoked = JSON.parse(revokedJson);
  expect(revoked.selection).toBeNull();
  expect(revoked.review).toBeNull();
  expect(revoked.draft.colors.find(item => item.observationId === sample.id).include).toBe(false);
  expect(
    revoked.draft.reviewedValues.confirmations.find(item => item.candidateId === sample.id).revoked
  ).not.toBeNull();
  await apply().click();
  const revokedReview = JSON.parse(await download('Download source review'));
  expect(revokedReview.review.model.colors).toHaveLength(1);
  expect(revokedReview.review.model.colors[0].valuesByMode.Source.hex).toBe('#126E78');
  await context.setOffline(false);
  checks.push(
    'Revocation clears a selected design and excludes the sample from the next compiled review while keeping its evidence and acceptance history.'
  );

  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-native.pdf');
  await extract('1');
  await expect(add()).toBeEnabled();
  await add().click();
  await panel.getByLabel('Printed value', { exact: true }).fill('#126E78');
  await page.getByRole('button', { name: 'Next source page', exact: true }).click();
  await expect(add()).toBeDisabled();
  await expect(
    panel.getByText('Read this page before adding source evidence.', { exact: true })
  ).toBeVisible();
  await expect(panel.getByLabel('Printed value', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous source page', exact: true }).click();
  await expect(add()).toBeEnabled();
  const scoped = JSON.parse(await download('Download project'));
  expect(scoped.capture.scope.requested).toEqual(['page:1']);
  expect(scoped.draft.reviewedValues?.candidates ?? []).toEqual([]);
  checks.push(
    'Moving to an unselected page discards the pending form and disables adding source evidence. Returning to a selected page re-enables preparation without committing the discarded value.'
  );

  await importProject(revokedJson);
  await expect(page.getByText('Source preview is closed', { exact: true })).toBeVisible();
  expect(await download('Download project')).toBe(revokedJson);
  await expect(entry('Ocean')).toContainText('Replaced');
  await expect(entry('Ocean sample')).toContainText('Revoked');
  await expect(entry('Ocean corrected')).toContainText('Accepted');
  checks.push(
    'Corrected and revoked history survives a later project reopen with exact source and acceptance state.'
  );
  expect(externalRequests).toEqual([]);
  expect(failures).toEqual([]);
  const receipt = {
    ...baseReceipt,
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
        ...baseReceipt,
        status: 'failed',
        finishedAt: new Date().toISOString(),
        url,
        checks,
        failures,
        diagnostics,
        externalRequests,
        artifacts,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
