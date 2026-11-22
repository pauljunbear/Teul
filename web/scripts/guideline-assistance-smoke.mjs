import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { IntakeService } from '../../services/guideline-intake/dist/service.js';
import { IntakeJobStore } from '../../services/guideline-intake/dist/store.js';
import { SealedAssetStore } from '../../services/guideline-intake/dist/assets.js';
import { createIntakeHttpServer } from '../../services/guideline-intake/dist/http.js';
import { createOpenAiInterpretationProcessor } from '../../services/guideline-intake/dist/openaiInterpretation.js';
import { INTERPRETATION_VERSION } from '../../services/guideline-intake/dist/interpretation.js';

// The complete browser -> HTTP -> durable job -> provider adapter path uses synthetic transport.
// No provider credentials, live provider calls or deployment authentication are exercised here.
const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'teul-assistance-browser-')));
const output = path.resolve('../release/guideline-assistance');
await mkdir(output, { recursive: true });
const store = new IntakeJobStore(path.join(directory, 'jobs.sqlite'), { now: Date.now });
const requests = [],
  providerRequests = [],
  checks = [],
  failures = [],
  events = [];
let behavior = 'valid',
  authenticated = true,
  abortedCalls = 0;
let signedInOwner = 'browser-alice';
let releaseCompletion = null;
const processor = createOpenAiInterpretationProcessor({
  apiKey: 'synthetic-browser-test-not-a-credential',
  model: 'synthetic-browser-model',
  modelRevision: 'synthetic-browser-model',
  pricing: {
    inputMicrosPerMillionTokens: 1_000_000,
    outputMicrosPerMillionTokens: 3_000_000,
    reviewedAt: new Date().toISOString(),
    sourceUrl: 'https://developers.openai.com/api/docs/pricing',
    imageTokenSourceUrl: 'https://developers.openai.com/api/docs/guides/images-vision',
    framingTokenSourceUrl: 'https://developers.openai.com/api/docs/guides/counting-tokens',
  },
  limits: {
    maximumTextBytes: 131072,
    maximumImages: 20,
    maximumImageTokens: 1000,
    maximumOutputTokens: 8192,
    maximumResponseBytes: 524288,
    requestOverheadTokens: 1000,
  },
  consentPolicyVersion: 'browser-synthetic-1',
  fetch: async (url, options) => {
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    const input = JSON.parse(body.input[0].content[0].text);
    providerRequests.push({ body, input });
    if (behavior === 'slow' || behavior === 'complete-at-cancel')
      await new Promise((resolve, reject) => {
        const abort = () => {
          abortedCalls++;
          reject(new DOMException('Cancelled', 'AbortError'));
        };
        options.signal.addEventListener('abort', abort, { once: true });
        if (behavior === 'complete-at-cancel')
          releaseCompletion = () => {
            options.signal.removeEventListener('abort', abort);
            resolve();
          };
        if (options.signal.aborted) abort();
      });
    const colors = input.observations.filter(item => item.kind === 'color');
    const result = {
      schemaVersion: INTERPRETATION_VERSION,
      sourceDigest: input.source.digest,
      sourceCaptureHash: input.source.captureHash,
      colors: colors.slice(0, 1).map(item => ({
        observationId: behavior === 'forged' ? 'invented-color' : item.id,
        label: 'Harbor teal',
        family: 'Harbor',
        basis: 'source-text',
        evidenceRefs: [item.id, ...item.evidenceRefs],
        reason: 'Synthetic evidence-linked label for browser verification.',
      })),
      scales: [],
      rules: [],
      issues: [
        {
          kind: 'unverified-value',
          scope: input.source.scope[0],
          observationIds: [],
          imageIds: [],
          note: 'An unverified extra color must remain a note.',
        },
      ],
    };
    return Response.json({
      model: 'synthetic-browser-model',
      status: 'completed',
      error: null,
      incomplete_details: null,
      output: [
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: JSON.stringify(result) }],
        },
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 150,
        total_tokens: 250,
        output_tokens_details: { reasoning_tokens: 0 },
      },
    });
  },
});
const service = new IntakeService({
  store,
  assets: new SealedAssetStore({
    directory: path.join(directory, 'assets'),
    key: new Uint8Array(32).fill(3),
  }),
  ownerKey: new Uint8Array(32).fill(4),
  processors: [processor],
  onEvent: event => events.push(event),
});
let api;
const server = await createServer({
  mode: 'guideline-proof',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  plugins: [
    {
      name: 'synthetic-intake-browser-test',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (!request.url?.startsWith('/api/guideline-intake')) return next();
          requests.push({ method: request.method, url: request.url });
          if (request.url.endsWith('/cancel') && releaseCompletion) {
            releaseCompletion();
            releaseCompletion = null;
            // Force the real service to commit before it handles this cancellation.
            void service.idle().then(() => api.emit('request', request, response));
            return;
          }
          api.emit('request', request, response);
        });
      },
    },
  ],
});
await server.listen();
const url = server.resolvedUrls.local[0];
api = createIntakeHttpServer({
  api: service,
  allowedOrigins: [new URL(url).origin],
  authenticate: async request =>
    authenticated && request.headers.cookie?.includes('synthetic-session=alice')
      ? signedInOwner
      : null,
});
service.start();
let browser, page;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  await context.addCookies([{ name: 'synthetic-session', value: 'alice', url }]);
  await context.route('**/*', route =>
    new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort()
  );
  page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  const panel = () => page.getByRole('region', { name: 'Assisted review', exact: true });
  const load = async () => {
    await page.goto(url);
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase('teul-studio:guideline-recovery:v1');
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('Recovery cache still open'));
        })
    );
    await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
    await page
      .getByLabel('Choose guideline PDF')
      .setInputFiles('fixtures/guidelines/harbor-native.pdf');
    await page.getByRole('button', { name: 'Read selected pages', exact: true }).click();
    await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  };
  const prepare = async (images = false) => {
    await panel().getByRole('button', { name: 'Check assistance', exact: true }).click();
    if (images) await panel().getByLabel('Include selected page previews').check();
    await panel().getByRole('button', { name: 'Prepare evidence', exact: true }).click();
    await expect(
      panel().getByRole('button', { name: 'Send selected evidence', exact: true })
    ).toBeVisible();
    await expect(
      panel().getByText('Evidence is ready for your review. Nothing has been uploaded.', {
        exact: true,
      })
    ).toBeVisible();
  };
  const send = async () => {
    await panel()
      .getByRole('checkbox', { name: /I agree to send/ })
      .check();
    await panel().getByRole('button', { name: 'Send selected evidence', exact: true }).click();
  };
  await load();
  expect(requests).toHaveLength(0);
  await prepare(true);
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(0);
  await expect(
    panel().getByRole('button', { name: 'Send selected evidence', exact: true })
  ).toBeDisabled();
  await panel().getByText('Inspect selected page previews', { exact: true }).click();
  await expect(panel().getByAltText('Selected guideline page 1')).toBeVisible();
  await panel().getByText('Inspect all text and metadata to be sent', { exact: true }).click();
  await expect(panel().locator('pre').first()).toContainText('NOT_INSPECTED');
  checks.push(
    'No service request before explicit discovery; local preparation previews selected evidence; consent required before POST'
  );
  await send();
  await expect(
    panel().getByRole('heading', { name: 'Suggested interpretation', exact: true })
  ).toBeVisible();
  expect(providerRequests).toHaveLength(1);
  const sent = providerRequests[0];
  expect(sent.input.source.scope).toEqual(['page:1']);
  expect(sent.input.images.map(item => item.scope)).toEqual(['page:1']);
  expect(sent.body.store).toBe(false);
  expect(sent.body.tools).toEqual([]);
  expect(sent.body.input[0].content.filter(item => item.type === 'input_image')).toHaveLength(1);
  expect(JSON.stringify(sent.body)).not.toContain('synthetic-browser-test-not-a-credential');
  await panel().locator('summary').filter({ hasText: 'Color names and families' }).click();
  await expect(panel().getByRole('heading', { name: 'Harbor teal Harbor' })).toBeVisible();
  await panel().getByRole('button', { name: 'Page 1 · #126E78', exact: true }).click();
  await expect(page.locator('.guideline-highlight')).toBeVisible();
  await page.screenshot({ path: path.join(output, 'suggestions-desktop.png'), fullPage: true });
  checks.push(
    'Actual HTTP service and provider adapter return source-linked suggestions; only selected PNG and text are dispatched'
  );
  await panel().getByRole('button', { name: 'Use suggestions in draft', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Download last assistance receipt', exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('Name for #126E78')).toHaveValue('Harbor teal');
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await expect(page.locator('.guideline-gradient-preview')).not.toBeVisible();
  const [receiptDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download last assistance receipt', exact: true }).click(),
  ]);
  const receipt = JSON.parse(await readFile(await receiptDownload.path(), 'utf8'));
  expect(receipt.result.issues).toHaveLength(1);
  expect(receipt.beforeDraftHash).not.toBe(receipt.afterDraftHash);
  expect(receipt.origin.outputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'gradient');
  await page.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  checks.push(
    'Explicit suggestion adoption changes editable labels only; final manual review still required; generated gradient and downloadable provenance follow'
  );

  await load();
  behavior = 'forged';
  await prepare();
  await send();
  await expect(panel().getByRole('alert')).toContainText('could not return verified suggestions');
  await expect(
    panel().getByRole('button', { name: 'Use suggestions in draft', exact: true })
  ).not.toBeVisible();
  await expect(page.getByLabel('Name for #126E78')).toHaveValue('Color 1');
  checks.push('Fabricated model observation IDs fail closed without changing the manual draft');

  await load();
  behavior = 'slow';
  await prepare();
  await send();
  await expect.poll(() => providerRequests.length).toBe(3);
  await page.getByLabel('Name for #126E78').fill('My own teal');
  expect(abortedCalls).toBe(0);
  await panel().getByRole('button', { name: 'Cancel submitted request', exact: true }).click();
  await expect.poll(() => abortedCalls).toBe(1);
  await expect(
    panel().getByRole('heading', { name: 'Suggested interpretation', exact: true })
  ).not.toBeVisible();
  await expect(page.getByLabel('Name for #126E78')).toHaveValue('My own teal');
  checks.push(
    'Editing source review detaches local polling and preserves the request; explicit cancellation stops its job, and late output cannot overwrite the new draft'
  );

  await load();
  behavior = 'valid';
  await prepare();
  let drop = true;
  await page.route('**/api/guideline-intake/jobs', async route => {
    if (route.request().method() !== 'POST' || !drop) return route.continue();
    drop = false;
    await route.fetch();
    await route.abort('failed');
  });
  await send();
  await expect(
    panel().getByRole('button', { name: 'Recover submitted request', exact: true })
  ).toBeVisible();
  const submitsBeforeRecovery = requests.filter(request => request.url.endsWith('/jobs')).length;
  await panel().getByRole('button', { name: 'Recover submitted request', exact: true }).click();
  await expect(
    panel().getByRole('heading', { name: 'Suggested interpretation', exact: true })
  ).toBeVisible();
  expect(providerRequests).toHaveLength(4);
  expect(requests.filter(request => request.url.endsWith('/jobs'))).toHaveLength(
    submitsBeforeRecovery
  );
  expect(requests.filter(request => request.url.endsWith('/jobs/lookup')).length).toBeGreaterThan(
    0
  );
  await page.unroute('**/api/guideline-intake/jobs');
  checks.push(
    'Lost POST response recovers the identical persisted job without a second provider invocation'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await panel().locator('summary').filter({ hasText: 'Color names and families' }).click();
  await panel().getByRole('button', { name: 'Use suggestions in draft', exact: true }).focus();
  await expect(
    panel().getByRole('button', { name: 'Use suggestions in draft', exact: true })
  ).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await panel().screenshot({ path: path.join(output, 'suggestions-mobile.png') });
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Name for #126E78')).toHaveValue('Harbor teal');
  checks.push('390px view has no horizontal overflow; keyboard activation applies suggestions');

  await load();
  authenticated = false;
  await panel().getByRole('button', { name: 'Check assistance', exact: true }).click();
  await expect(panel().getByRole('alert')).toContainText('Sign in');
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'gradient');
  await page.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  expect(providerRequests).toHaveLength(4);
  checks.push(
    'Unavailable authentication leaves the complete local review and deterministic generation path usable'
  );

  authenticated = true;
  for (const change of ['draft', 'source']) {
    await load();
    await prepare();
    const before = providerRequests.length;
    let lose = true;
    await page.route('**/api/guideline-intake/jobs', async route => {
      if (route.request().method() !== 'POST' || !lose) return route.continue();
      lose = false;
      await route.fetch();
      await route.abort('failed');
    });
    await send();
    await expect(
      panel().getByRole('button', { name: 'Recover submitted request', exact: true })
    ).toBeVisible();
    // Wait for one completed call so recovery proves deduplication, not merely queued cancellation.
    await expect.poll(() => providerRequests.length).toBe(before + 1);
    await service.idle();
    if (change === 'draft') await page.getByLabel('Name for #126E78').fill('My edited source');
    else {
      await page
        .getByLabel('Choose guideline PDF')
        .setInputFiles('fixtures/guidelines/harbor-scale.pdf');
      await expect(page.getByText('4 stated colors', { exact: true })).not.toBeVisible();
      await page.getByRole('button', { name: 'Read selected pages', exact: true }).click();
      await expect(page.getByText('3 stated colors', { exact: true })).toBeVisible();
    }
    await panel().getByRole('button', { name: 'Recover submitted request', exact: true }).click();
    await expect(
      panel().getByRole('button', { name: 'Recover submitted request', exact: true })
    ).not.toBeVisible();
    await expect(
      panel().getByRole('button', { name: 'Use suggestions in draft', exact: true })
    ).not.toBeVisible();
    await panel().getByRole('button', { name: 'Keep request for later', exact: true }).click();
    await expect(
      panel().getByRole('button', { name: 'Check assistance', exact: true })
    ).toBeEnabled();
    if (change === 'draft')
      await expect(page.getByLabel('Name for #126E78')).toHaveValue('My edited source');
    expect(providerRequests).toHaveLength(before + 1);
    await page.unroute('**/api/guideline-intake/jobs');
    checks.push(
      `Uncertain request survives ${change} replacement; explicit recovery reuses the old job and cannot adopt stale suggestions`
    );
  }
  await load();
  behavior = 'complete-at-cancel';
  await prepare();
  await send();
  await expect.poll(() => typeof releaseCompletion).toBe('function');
  await panel().getByRole('button', { name: 'Cancel assistance', exact: true }).click();
  await expect(
    panel().getByText(
      'The request finished before cancellation. Its suggestions were not applied.',
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    panel().getByRole('button', { name: 'Use suggestions in draft', exact: true })
  ).not.toBeVisible();
  await expect(page.getByLabel('Name for #126E78')).toHaveValue('Color 1');
  checks.push(
    'Completion winning the cancellation race is reported accurately and does not apply suggestions'
  );
  // Build this fixture through the same strict codecs as Studio; no prior ignored artifact is required.
  const [{ bindCaptureV2 }, values, { suggestGuidelineReviewV4 }, { buildGuidelineProjectV4 }] =
    await Promise.all([
      server.ssrLoadModule('/src/lib/guideline/evidenceV2.ts'),
      server.ssrLoadModule('/src/lib/guideline/reviewedValues.ts'),
      server.ssrLoadModule('/src/lib/guideline/reviewV4.ts'),
      server.ssrLoadModule('/src/lib/guideline/projectV4.ts'),
    ]);
  const manualCapture = bindCaptureV2({
    schemaVersion: 'teul.guideline-capture.v2',
    id: 'synthetic:manual-recovery',
    kind: 'pdf',
    identity: {
      label: 'Synthetic manual recovery source',
      locator: null,
      revision: null,
      sha256: `sha256:${'7'.repeat(64)}`,
    },
    capturedAt: '2026-09-25T00:00:00Z',
    scope: {
      total: 1,
      requested: ['page:1'],
      inspected: ['page:1'],
      gaps: [{ scope: 'page:1', code: 'NO_TEXT', message: 'Synthetic scan without text' }],
    },
    observations: [],
    extractionVersion: 'synthetic:manual-recovery',
  });
  const witness = values.bindPdfRegionWitness(manualCapture, {
    schemaVersion: 'teul.pdf-region.v1',
    captureHash: manualCapture.captureHash,
    sourceDigest: manualCapture.identity.sha256,
    page: 1,
    pageSize: { width: 100, height: 100, rotation: 0 },
    bounds: [0, 0, 1, 1],
    render: {
      engine: 'pdfjs',
      version: '6.3.289',
      scale: 1,
      width: 100,
      height: 100,
      colorSpace: 'srgb',
      background: '#FFFFFF',
      sampling: 'nearest-center',
    },
    raster: {
      width: 1,
      height: 1,
      rgbaBase64: Buffer.from([18, 110, 120, 255]).toString('base64'),
    },
  });
  const manualCandidate = values.sampleRenderedValue(manualCapture, witness);
  const manualDraft = suggestGuidelineReviewV4(manualCapture);
  manualDraft.reviewedValues = {
    witnesses: [witness],
    candidates: [manualCandidate],
    confirmations: [
      values.confirmReviewedValue(
        manualCandidate,
        { kind: 'user', ref: 'synthetic:manual-recovery' },
        '2026-09-25T01:00:00Z'
      ),
    ],
  };
  manualDraft.colors.push({
    observationId: manualCandidate.id,
    include: true,
    label: 'Retained manual sample',
    family: 'Ocean',
  });
  const manualProjectJson = JSON.stringify(
    buildGuidelineProjectV4({
      capture: manualCapture,
      draft: manualDraft,
      review: null,
      selection: null,
    })
  );

  await load();
  behavior = 'slow';
  await prepare();
  const beforeManualProvider = providerRequests.length;
  const beforeManualAbort = abortedCalls;
  let loseManualSubmission = true;
  await page.route('**/api/guideline-intake/jobs', async route => {
    if (route.request().method() !== 'POST' || !loseManualSubmission) return route.continue();
    loseManualSubmission = false;
    await route.fetch();
    await route.abort('failed');
  });
  await send();
  await expect(
    panel().getByRole('button', { name: 'Recover submitted request', exact: true })
  ).toBeVisible();
  await expect.poll(() => providerRequests.length).toBe(beforeManualProvider + 1);
  await page.unroute('**/api/guideline-intake/jobs');
  let failedManualCancellations = 0;
  await page.route('**/api/guideline-intake/jobs/*/cancel', async route => {
    failedManualCancellations++;
    await route.abort('failed');
  });
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'synthetic-manual-recovery.json',
    mimeType: 'application/json',
    buffer: Buffer.from(manualProjectJson),
  });
  await expect(
    page.getByRole('heading', { name: 'Retained manual sample', exact: true })
  ).toBeVisible();
  await expect(
    panel().getByRole('button', { name: 'Recover submitted request', exact: true })
  ).toBeEnabled();
  await expect(panel()).toContainText('An earlier request belongs to a previous review.');
  await panel().getByRole('button', { name: 'Recover submitted request', exact: true }).click();
  await panel().getByRole('button', { name: 'Cancel submitted request', exact: true }).click();
  await expect.poll(() => failedManualCancellations).toBeGreaterThan(0);
  await expect(
    panel().getByRole('button', { name: 'Check submitted request', exact: true })
  ).toBeEnabled();
  await expect(
    panel().getByRole('button', { name: 'Cancel submitted request', exact: true })
  ).toBeEnabled();
  await expect(panel().getByRole('alert')).toBeVisible();
  await expect(
    panel().getByRole('button', { name: 'Use suggestions in draft', exact: true })
  ).not.toBeVisible();
  await expect(page.getByLabel('Name for #126E78')).toHaveValue('Retained manual sample');
  expect(abortedCalls).toBe(beforeManualAbort);
  expect(providerRequests).toHaveLength(beforeManualProvider + 1);
  await panel().screenshot({
    path: path.join(output, `manual-recovery-node${process.versions.node.split('.')[0]}.png`),
  });
  await page.unroute('**/api/guideline-intake/jobs/*/cancel');
  await panel().getByRole('button', { name: 'Cancel submitted request', exact: true }).click();
  await expect.poll(() => abortedCalls).toBe(beforeManualAbort + 1);
  await expect(panel()).toHaveCount(0);
  const [manualDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download project', exact: true }).click(),
  ]);
  expect(await readFile(await manualDownload.path(), 'utf8')).toBe(manualProjectJson);
  expect(providerRequests).toHaveLength(beforeManualProvider + 1);
  checks.push(
    'An unknown submitted request survives opening a V4 manual-value project. Failed cancellation retains recover/check/cancel controls; explicit retry cancels the same service job without provider retry, suggestion adoption or any project mutation.'
  );
  for (const outcome of ['never-submitted', 'deleted']) {
    await load();
    behavior = 'valid';
    await prepare();
    const callsBefore = providerRequests.length;
    await page.route('**/api/guideline-intake/jobs', async route => {
      if (outcome === 'deleted') {
        const response = await route.fetch();
        const { job } = await response.json();
        await service.remove('browser-alice', job.id);
      }
      await route.abort('failed');
    });
    await send();
    await expect(
      panel().getByRole('button', { name: 'Recover submitted request', exact: true })
    ).toBeVisible();
    await page.unroute('**/api/guideline-intake/jobs');
    const submitsBefore = requests.filter(request => request.url.endsWith('/jobs')).length;
    await panel().getByRole('button', { name: 'Recover submitted request', exact: true }).click();
    await expect(panel().getByRole('alert')).toContainText('no longer available');
    await expect(
      panel().getByRole('button', { name: 'Prepare evidence', exact: true })
    ).toBeEnabled();
    await expect(
      panel().getByRole('button', { name: 'Send selected evidence', exact: true })
    ).toHaveCount(0);
    expect(requests.filter(request => request.url.endsWith('/jobs'))).toHaveLength(submitsBefore);
    if (outcome === 'never-submitted') expect(providerRequests).toHaveLength(callsBefore);
    checks.push(
      `${outcome} recovery performs lookup only, releases controls, and requires fresh preparation/consent`
    );
  }
  await load();
  await prepare();
  const createdBeforeAccountChange = events.filter(event => event.event === 'created').length;
  signedInOwner = 'browser-bob';
  await send();
  await expect(panel().getByRole('alert')).toContainText('account changed');
  expect(events.filter(event => event.event === 'created')).toHaveLength(
    createdBeforeAccountChange
  );
  signedInOwner = 'browser-alice';
  checks.push(
    'Account change after preparation rejects submission before creating a job for the new principal'
  );
  // Recovery survives a full document reload, including an unknown POST outcome.
  await load();
  behavior = 'valid';
  await page.getByLabel('Name for #126E78').fill('My retained source');
  await prepare(true);
  const recoveryCalls = providerRequests.length;
  await page.route('**/api/guideline-intake/jobs', async route => {
    await route.fetch();
    await route.abort('failed');
  });
  await send();
  await expect(
    panel().getByRole('button', { name: 'Recover submitted request', exact: true })
  ).toBeVisible();
  await page.unroute('**/api/guideline-intake/jobs');
  await service.idle();
  const recoverySubmits = requests.filter(request => request.url.endsWith('/jobs')).length;
  const reloadSaved = async () => {
    await page.reload();
    await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
    await page.getByText('Saved assistance requests', { exact: true }).click();
    return page.locator('.guideline-recovery').filter({ hasText: 'Saved assistance requests' });
  };
  let savedRequests = await reloadSaved();
  await expect(page.getByText('4 stated colors', { exact: true })).not.toBeVisible();
  signedInOwner = 'browser-bob';
  await savedRequests.getByRole('button', { name: 'Check saved requests', exact: true }).click();
  await expect(savedRequests).toContainText('No saved requests for this account and source.');
  signedInOwner = 'browser-alice';
  await savedRequests.getByRole('button', { name: 'Check saved requests', exact: true }).click();
  await savedRequests.getByRole('button', { name: 'Open saved request', exact: true }).click();
  await expect(page.getByLabel('Name for #126E78')).toHaveValue('My retained source');
  await expect(
    panel().getByRole('button', { name: 'Send selected evidence', exact: true })
  ).toHaveCount(0);
  await panel().getByRole('button', { name: 'Recover submitted request', exact: true }).click();
  await expect(
    panel().getByRole('button', { name: 'Use suggestions in draft', exact: true })
  ).toBeVisible();
  await panel().getByRole('button', { name: 'Use suggestions in draft', exact: true }).click();
  await expect(page.getByLabel('Name for #126E78')).toHaveValue('Harbor teal');
  // Applying suggestions retains the original record and its completed remote identity.
  savedRequests = await reloadSaved();
  await savedRequests.getByRole('button', { name: 'Check saved requests', exact: true }).click();
  await savedRequests.getByRole('button', { name: 'Open saved request', exact: true }).click();
  await expect(page.getByLabel('Name for #126E78')).toHaveValue('My retained source');
  await panel().getByRole('button', { name: 'Check submitted request', exact: true }).click();
  await expect(
    panel().getByRole('button', { name: 'Use suggestions in draft', exact: true })
  ).toBeVisible();
  expect(providerRequests).toHaveLength(recoveryCalls + 1);
  expect(requests.filter(request => request.url.endsWith('/jobs'))).toHaveLength(recoverySubmits);
  checks.push(
    'PDF source, edited draft and selected images survive reload/account partitioning; unknown and completed requests reopen without another submission or provider call, including after applying suggestions.'
  );
  await panel().getByRole('button', { name: 'Keep request for later', exact: true }).click();
  // Delete the journal while the final account check is in flight. The current draft must survive.
  await page.getByLabel('Name for #126E78').fill('Keep my newer draft');
  let releaseSession,
    sessionCalls = 0;
  await page.route('**/api/guideline-intake/session', async route => {
    const response = await route.fetch();
    if (++sessionCalls === 3)
      await new Promise(resolve => {
        releaseSession = resolve;
      });
    await route.fulfill({ response });
  });
  await savedRequests.getByRole('button', { name: 'Open saved request', exact: true }).click();
  await expect.poll(() => typeof releaseSession).toBe('function');
  const otherTab = await context.newPage();
  await otherTab.goto(url);
  await otherTab.evaluate(async () => {
    const { guidelineRecoveryStore: store } = await import('/src/lib/guideline/recoveryStore.ts');
    const { GuidelineIntakeClient } = await import('/src/lib/guideline/intakeClient.ts');
    const { ownerBinding } = await new GuidelineIntakeClient().session();
    const [record] = await store.list(ownerBinding);
    await store.remove(ownerBinding, record.reference);
  });
  releaseSession();
  await expect(page.getByLabel('Name for #126E78')).toHaveValue('Keep my newer draft');
  await expect(
    savedRequests.getByRole('button', { name: 'Check saved requests', exact: true })
  ).toBeEnabled();
  await expect(
    page.getByText(
      'This saved request changed in another tab. Check saved requests again before opening it.',
      { exact: true }
    )
  ).toBeVisible();
  await page.unroute('**/api/guideline-intake/session');
  await otherTab.close();
  expect(providerRequests).toHaveLength(recoveryCalls + 1);
  checks.push(
    'Deleting a request in another tab during the final account check prevents stale PDF restoration and retains the newer draft.'
  );
  await prepare();
  const beforeQuotaSubmits = requests.filter(request => request.url.endsWith('/jobs')).length;
  await page.evaluate(() => {
    window.originalRecoveryPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'payloads')
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return window.originalRecoveryPut.apply(this, args);
    };
  });
  await send();
  await expect(panel().getByRole('alert')).toBeVisible();
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.originalRecoveryPut;
  });
  expect(requests.filter(request => request.url.endsWith('/jobs'))).toHaveLength(
    beforeQuotaSubmits
  );
  expect(providerRequests).toHaveLength(recoveryCalls + 1);
  await expect(page.getByLabel('Name for #126E78')).toHaveValue('Keep my newer draft');
  checks.push(
    'An actual browser storage quota failure prevents submission before any provider work and preserves the current draft.'
  );
  expect(failures).toEqual([]);
} catch (error) {
  failures.push(error.stack ?? String(error));
  await page
    ?.screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
    .catch(() => {});
} finally {
  await browser?.close();
  await server.close();
  await service.stop();
  store.close();
  await rm(directory, { recursive: true, force: true });
  const receiptJson = JSON.stringify(
    {
      status: failures.length ? 'failed' : 'passed',
      node: process.version,
      provider: 'synthetic transport only; no real model calls or auth qualification',
      checks,
      failures,
      providerCalls: providerRequests.length,
      abortedCalls,
      serviceRequests: requests.length,
      events,
    },
    null,
    2
  );
  await Promise.all([
    writeFile(path.join(output, 'browser-receipt.json'), receiptJson),
    writeFile(
      path.join(output, `browser-receipt-node${process.versions.node.split('.')[0]}.json`),
      receiptJson
    ),
  ]);
}
console.log(JSON.stringify({ checks: checks.length, failures, output }, null, 2));
if (failures.length) process.exitCode = 1;
