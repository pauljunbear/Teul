import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('../release/guideline-gradient-worker');
const runtime = `node${process.versions.node.split('.')[0]}`;
const checks = [],
  errors = [],
  unexpectedRequests = [];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let production, browser, page;
await mkdir(output, { recursive: true });
const builtFiles = [
  'index.html',
  ...(await readdir('dist/assets'))
    .filter(name => /\.(js|css)$/.test(name))
    .map(name => `assets/${name}`),
];
const buildHashes = Object.fromEntries(
  await Promise.all(
    builtFiles.sort().map(async name => [name, digest(await readFile(`dist/${name}`))])
  )
);
const receipt = {
  scope:
    'Built Studio worker lifecycle regression; synthetic local sources and fault injection. No workload p95 or rendering qualification is claimed.',
  node: process.version,
  builtFiles: buildHashes,
  scriptSha256: digest(await readFile(new URL(import.meta.url))),
  checks,
  errors,
  unexpectedRequests,
};

try {
  production = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  const url = production.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
  });
  // Intercept delivery at the real Worker boundary, without replacing its numerical execution.
  // Holding results makes races deterministic; no application module or saved proof is injected.
  await context.addInitScript(() => {
    const NativeWorker = window.Worker;
    const trace = (window.gradientWorkerSmoke = {
      mode: 'pass',
      records: [],
      held: [],
      cancellations: [],
      longTasks: [],
      observing: false,
    });
    let cancelAt = null;
    document.addEventListener(
      'click',
      event => {
        if (event.target.closest('button')?.textContent.trim() === 'Cancel gradient check')
          cancelAt = performance.now();
      },
      true
    );
    new PerformanceObserver(list => {
      if (trace.observing)
        trace.longTasks.push(
          ...list
            .getEntries()
            .map(entry => ({ startTime: entry.startTime, duration: entry.duration }))
        );
    }).observe({ type: 'longtask', buffered: false });
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        if (trace.mode === 'fail-construction')
          throw new Error('Injected worker construction failure');
        super(...args);
        this.entry = {
          index: trace.records.length,
          mode: trace.mode,
          createdAt: performance.now(),
          operation: null,
          startedAt: null,
          resultAt: null,
          terminatedAt: null,
        };
        trace.records.push(this.entry);
      }
      postMessage(message, ...args) {
        if (message?.version === 'teul.gradient-worker.v1') {
          this.entry.operation = message.request.operation;
          this.entry.requestId = message.id;
          this.entry.requestHash = message.requestHash;
        }
        return super.postMessage(message, ...args);
      }
      set onmessage(handler) {
        super.onmessage =
          handler === null
            ? null
            : event => {
                const data = event.data;
                if (data?.version === 'teul.gradient-worker.v1') {
                  if (data.type === 'started') this.entry.startedAt = performance.now();
                  if (data.type === 'result') {
                    this.entry.resultAt = performance.now();
                    this.entry.resultKind = data.result.kind;
                    this.entry.fidelityStatus =
                      data.result.value?.portable?.fidelity?.status ?? null;
                    if (this.entry.mode === 'hold-results') {
                      trace.held.push({ index: this.entry.index, deliver: () => handler(event) });
                      return;
                    }
                  }
                }
                handler(event);
              };
      }
      get onmessage() {
        return super.onmessage;
      }
      terminate() {
        this.entry.terminatedAt = performance.now();
        if (cancelAt !== null && this.entry.operation) {
          trace.cancellations.push({
            operation: this.entry.operation,
            acknowledgementMs: this.entry.terminatedAt - cancelAt,
            resultArrivedBeforeCancellation: this.entry.resultAt !== null,
          });
          cancelAt = null;
        }
        return super.terminate();
      }
    };
    trace.release = () => {
      const held = trace.held.splice(0);
      for (const item of held) item.deliver();
      return held.length;
    };
  });
  context.on('request', request => {
    if (
      /^https?:/.test(request.url()) &&
      (new URL(request.url()).origin !== new URL(url).origin ||
        new URL(request.url()).pathname.startsWith('/src/') ||
        request.url().includes('/api/guideline-intake'))
    )
      unexpectedRequests.push(request.url());
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  let nextDownload = 0;
  async function download(scope, name) {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextDownload - Date.now())));
    nextDownload = Date.now() + 170;
    const [event] = await Promise.all([
      page.waitForEvent('download'),
      scope.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await event.path(), 'utf8');
  }
  async function open(label, json) {
    await page.getByLabel(label, { exact: true }).setInputFiles({
      name: 'project.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
  }
  async function mode(value) {
    return page.evaluate(value => {
      window.gradientWorkerSmoke.mode = value;
      return window.gradientWorkerSmoke.records.length;
    }, value);
  }
  async function started(index, operation) {
    await expect
      .poll(() =>
        page.evaluate(
          ({ index, operation }) =>
            window.gradientWorkerSmoke.records
              .slice(index)
              .some(record => record.operation === operation && record.startedAt !== null),
          { index, operation }
        )
      )
      .toBe(true);
  }
  const make = editor => editor.getByRole('button', { name: 'Make gradient', exact: true });
  const cancel = editor =>
    editor.getByRole('button', { name: 'Cancel gradient check', exact: true });

  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .getByLabel('Choose guideline PDF', { exact: true })
    .setInputFiles('fixtures/guidelines/harbor-native.pdf');
  await page.getByRole('button', { name: 'Read selected pages', exact: true }).click();
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'gradient');
  const pdf = page.getByRole('region', { name: 'Gradient proof', exact: true });
  await pdf.getByLabel('Interpolation', { exact: true }).selectOption('longer');
  const generationStart = await mode('pass');
  await page.evaluate(() => {
    window.gradientWorkerSmoke.observing = true;
  });
  await make(pdf).click();
  await expect(pdf.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  await page.waitForTimeout(60);
  await page.evaluate(() => {
    window.gradientWorkerSmoke.observing = false;
  });
  await started(generationStart, 'generate');
  const originalExport = await download(pdf, 'JSON');
  const parsed = JSON.parse(originalExport);
  expect(parsed.schemaVersion).toBe('teul.guideline-authored-gradient-export.v4');
  expect(parsed.design.schemaVersion).toBe('teul.gradient-design.v2');
  expect(parsed.fidelity.status).toBe('pass');
  expect(parsed.fidelity.designHash).toBe(parsed.design.designHash);
  expect(parsed.fidelity.candidatePaintHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(parsed.fidelity.numericalProfile.nativeCoordinateAllowance).toBe(0);
  expect(parsed.fidelity.maximumDeltaEOKUpperBound).toBeLessThanOrEqual(
    parsed.fidelity.toleranceDeltaEOK
  );
  const originalProject = await download(page, 'Download project');
  expect(JSON.parse(originalProject).gradientSelection.design).toEqual(parsed.design);
  checks.push(
    'The production PDF flow generated a V2 design with a current passing mathematical receipt and Workspace V7; no saved success was supplied.'
  );

  const cancellationStart = await mode('hold-results');
  await make(pdf).click();
  await started(cancellationStart, 'generate');
  await cancel(pdf).click();
  await expect(make(pdf)).toBeEnabled();
  await page.evaluate(() => window.gradientWorkerSmoke.release());
  expect(await download(pdf, 'JSON')).toBe(originalExport);
  expect(await download(page, 'Download project')).toBe(originalProject);
  const cancellation = await page.evaluate(() => window.gradientWorkerSmoke.cancellations.at(-1));
  expect(cancellation.operation).toBe('generate');
  expect(cancellation.acknowledgementMs).toBeLessThan(250);
  receipt.cancellation = cancellation;
  checks.push(
    'Cancelling a dispatched regeneration terminates its worker in under 250 ms and preserves the exact unsaved selected paint, export JSON and project bytes. Result delivery is held for a deterministic race.'
  );

  await mode('fail-construction');
  await make(pdf).click();
  await expect(pdf.getByRole('alert')).toContainText('workers are unavailable');
  expect(await download(pdf, 'JSON')).toBe(originalExport);
  expect(await download(page, 'Download project')).toBe(originalProject);
  await mode('pass');
  await make(pdf).click();
  await expect(cancel(pdf)).toHaveCount(0);
  await expect(pdf.getByRole('alert')).toHaveCount(0);
  expect(await download(pdf, 'JSON')).toBe(originalExport);
  checks.push(
    'An injected Worker constructor failure preserves current unsaved bytes; a fresh real-worker retry succeeds and returns the same selected design.'
  );
  const beforeStorage = await page.evaluate(() => window.gradientWorkerSmoke.records.length);
  await page.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  expect(await download(pdf, 'JSON')).toBe(originalExport);
  expect(await download(page, 'Download project')).toBe(originalProject);
  await page.getByRole('button', { name: 'Update saved project', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  expect(await download(pdf, 'JSON')).toBe(originalExport);
  expect(await download(page, 'Download project')).toBe(originalProject);
  expect(await page.evaluate(() => window.gradientWorkerSmoke.records.length)).toBe(beforeStorage);
  checks.push(
    'Saving on this device, updating its saved revision, and project downloads preserve the admitted receipt and exact export/project bytes without a replacement verification job.'
  );
  const savedLibrary = page.locator('.guideline-local[aria-label="PDF local projects"]');
  await savedLibrary
    .locator('summary')
    .filter({ hasText: 'Saved PDF projects on this device' })
    .click();
  await expect(savedLibrary.locator('small').first()).toContainText('Revision 2');
  const saveRaceStart = await mode('hold-results');
  await make(pdf).click();
  await started(saveRaceStart, 'generate');
  await expect.poll(() => page.evaluate(() => window.gradientWorkerSmoke.held.length)).toBe(1);
  await page.getByRole('button', { name: 'Update saved project', exact: true }).click();
  await expect(savedLibrary.locator('small').first()).toContainText('Revision 3');
  await expect
    .poll(() =>
      page.evaluate(
        index =>
          window.gradientWorkerSmoke.records
            .slice(index)
            .some(record => record.operation === 'generate' && record.terminatedAt !== null),
        saveRaceStart
      )
    )
    .toBe(true);
  await expect(cancel(pdf)).toHaveCount(0);
  expect(await page.evaluate(() => window.gradientWorkerSmoke.release())).toBe(1);
  expect(await download(pdf, 'JSON')).toBe(originalExport);
  expect(await download(page, 'Download project')).toBe(originalProject);
  expect(await download(savedLibrary, 'Download saved project')).toBe(originalProject);
  checks.push(
    'A newer local update saves revision 3 and terminates the older pending regeneration. Delivering its held real result cannot cancel or replace the save; current exports, project bytes and the stored download remain exact.'
  );
  receipt.beforeReload = await page.evaluate(() => ({
    records: window.gradientWorkerSmoke.records,
    longTasks: window.gradientWorkerSmoke.longTasks,
  }));

  // A reload removes all admitted in-memory objects. Hold the new verification result offline.
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await expect(page.getByLabel('Open guideline project', { exact: true })).toBeVisible();
  await context.setOffline(true);
  const reopenStart = await mode('hold-results');
  await open('Open guideline project', originalProject);
  await started(reopenStart, 'verify');
  await expect(pdf.getByRole('button', { name: 'SVG', exact: true })).toHaveCount(0);
  await expect(pdf.getByRole('button', { name: 'CSS', exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.gradientWorkerSmoke.held.length)).toBe(1);
  await page.evaluate(() => window.gradientWorkerSmoke.release());
  await expect(pdf.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  expect(await download(pdf, 'JSON')).toBe(originalExport);
  expect(await download(page, 'Download project')).toBe(originalProject);
  await context.setOffline(false);
  checks.push(
    'After reload, saved V2 work reopens offline through the bundled worker and offers no CSS/SVG export until a new verification returns; exact paint and project bytes survive.'
  );

  await mode('pass');
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  const figmaSource = await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8');
  await open('Open Figma capture', figmaSource);
  const figma = page.getByRole('region', { name: 'Figma guideline capture', exact: true });
  const editor = figma.getByRole('region', { name: 'Mode-aware gradient editor', exact: true });
  await expect(editor.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  await make(editor).click();
  await expect(cancel(editor)).toHaveCount(0);
  const nativeExport = await download(editor, 'JSON');
  expect(JSON.parse(nativeExport).design.schemaVersion).toBe('teul.gradient-design.v2');
  const beforeExtension = await page.evaluate(() => window.gradientWorkerSmoke.records.length);
  await chooseGuidelineTask(figma, 'extension');
  const extension = figma.getByRole('region', { name: 'Source scale extension', exact: true });
  await extension.getByLabel('New shade 1 name', { exact: true }).fill('500');
  await extension.getByLabel('New shade 1 position', { exact: true }).fill('1');
  await extension.getByRole('button', { name: 'Preview extension', exact: true }).click();
  await expect(extension.locator('[data-origin="teul-generated"]')).toHaveCount(1);
  await chooseGuidelineTask(figma, 'gradient');
  expect(await download(editor, 'JSON')).toBe(nativeExport);
  expect(await page.evaluate(() => window.gradientWorkerSmoke.records.length)).toBe(
    beforeExtension
  );
  const nativeProject = await download(figma, 'Save Figma project');
  await open(
    'Open Figma capture',
    JSON.stringify({ ...JSON.parse(nativeProject), bundleHash: 'sha256:' + '0'.repeat(64) })
  );
  await expect(figma.getByRole('alert')).toContainText('integrity');
  await chooseGuidelineTask(figma, 'gradient');
  expect(await download(editor, 'JSON')).toBe(nativeExport);
  await open('Open Figma capture', '{"schemaVersion":"teul.guideline-workspace.v999"}');
  await expect(figma.getByText(/cannot edit teul.guideline-workspace.v999/)).toBeVisible();
  await chooseGuidelineTask(figma, 'gradient');
  expect(await download(editor, 'JSON')).toBe(nativeExport);
  expect(await download(figma, 'Save Figma project')).toBe(nativeProject);
  expect(await page.evaluate(() => window.gradientWorkerSmoke.records.length)).toBe(
    beforeExtension
  );
  checks.push(
    'A native source keeps its completed V2 gradient proof and exact exports through a separate scale extension and rejected or read-only project imports, without re-verifying unchanged source paint.'
  );
  await open('Open Figma capture', figmaSource);
  await expect(editor.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  await editor.getByLabel('Angle', { exact: true }).fill('43');
  const replacedStart = await mode('hold-results');
  await make(editor).click();
  await started(replacedStart, 'generate');
  await expect.poll(() => page.evaluate(() => window.gradientWorkerSmoke.held.length)).toBe(1);
  await mode('pass');
  await open('Open Figma capture', figmaSource);
  await expect(editor.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();
  await expect(editor.getByLabel('Angle', { exact: true })).toHaveValue(
    String(JSON.parse(figmaSource).selection.design.angleDegrees)
  );
  expect(await page.evaluate(() => window.gradientWorkerSmoke.release())).toBe(1);
  await page.waitForTimeout(60);
  expect(JSON.parse(await download(editor, 'JSON')).design).toEqual(
    JSON.parse(figmaSource).selection.design
  );
  expect(JSON.parse(await download(figma, 'Save Figma project'))).toEqual(JSON.parse(figmaSource));
  checks.push(
    'A later Figma project open terminates a pending generation; explicitly delivering its held stale reply cannot replace the newly opened legacy paint or project.'
  );
  expect(errors).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
  receipt.observations = await page.evaluate(() => ({
    records: window.gradientWorkerSmoke.records,
    longTasks: window.gradientWorkerSmoke.longTasks,
  }));
  receipt.status = 'passed';
  await page.screenshot({ path: path.join(output, `${runtime}-complete.png`), fullPage: true });
  console.log(JSON.stringify({ status: receipt.status, checks, cancellation }, null, 2));
} catch (error) {
  receipt.status = 'failed';
  receipt.error = String(error);
  if (page) {
    await page
      .screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true })
      .catch(() => {});
    receipt.observations = await page
      .evaluate(() => ({
        records: window.gradientWorkerSmoke?.records,
        held: window.gradientWorkerSmoke?.held.length,
      }))
      .catch(() => null);
    receipt.failureUi = await page
      .locator('body')
      .innerText()
      .then(text => text.slice(0, 32000))
      .catch(() => null);
  }
  throw error;
} finally {
  try {
    await writeFile(path.join(output, `${runtime}-checks.json`), JSON.stringify(receipt, null, 2));
  } finally {
    await Promise.allSettled([
      browser?.close(),
      production && new Promise(resolve => production.httpServer.close(resolve)),
    ]);
  }
}
