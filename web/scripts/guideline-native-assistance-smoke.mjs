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
const output = path.resolve('../release/guideline-native-assistance');
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
const processors = ['figma', 'website'].map(sourceKind =>
  createOpenAiInterpretationProcessor({
    sourceKind,
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
  })
);
const service = new IntakeService({
  store,
  assets: new SealedAssetStore({
    directory: path.join(directory, 'assets'),
    key: new Uint8Array(32).fill(3),
  }),
  ownerKey: new Uint8Array(32).fill(4),
  processors,
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

let browser, lastPage;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
  });
  for (const kind of ['figma', 'website']) {
    const label = kind === 'figma' ? 'Figma' : 'Website';
    const inventoryModule = await server.ssrLoadModule(`/src/lib/guideline/${kind}Inventory.ts`);
    const reviewModule = await server.ssrLoadModule(`/src/lib/guideline/${kind}Review.ts`);
    const projectModule = await server.ssrLoadModule(`/src/lib/guideline/${kind}Project.ts`);
    const raw = JSON.parse(
      await readFile(
        `fixtures/guidelines/${kind === 'figma' ? 'figma-project-v1.json' : 'website-capture.json'}`,
        'utf8'
      )
    );
    const inventory = await inventoryModule[
      kind === 'figma' ? 'createFigmaNativeInventory' : 'createWebsiteInventory'
    ](kind === 'figma' ? raw.capture : raw);
    const draft = reviewModule[`suggest${label}Review`](inventory);
    draft.colors = inventory.declarations
      .filter(item => kind === 'figma' || item.value)
      .slice(0, 2)
      .map(item => ({ declarationId: item.id, label: item.label, family: '' }));
    draft.modeIds = inventory.modes.map(item => item.id);
    const project = await projectModule[`build${label}Project`]({
      capture: inventory.packet,
      draft,
      review: null,
      selection: null,
    });
    const projectJson = JSON.stringify(project);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      acceptDownloads: true,
    });
    await context.addCookies([{ name: 'synthetic-session', value: 'alice', url }]);
    await context.route('**/*', route =>
      new URL(route.request().url()).origin === new URL(url).origin
        ? route.continue()
        : route.abort()
    );
    const page = await context.newPage();
    lastPage = page;
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => failures.push(error.message));
    const review = () => page.getByRole('region', { name: `${label} color review`, exact: true });
    const panel = () => review().getByRole('region', { name: 'Assisted review', exact: true });
    const host = () =>
      kind === 'website'
        ? page.getByRole('region', { name: 'Website guideline capture', exact: true })
        : page.getByRole('region', { name: 'Figma guideline capture', exact: true });
    const open = async json => {
      await page.goto(url);
      await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
      await page
        .locator('summary')
        .filter({ hasText: kind === 'figma' ? 'Read from Figma' : 'Read a website' })
        .click();
      // Select the native panel by its own upload control rather than the PDF project control.
      await host()
        .getByLabel(kind === 'figma' ? 'Open Figma capture' : 'Open website capture', {
          exact: true,
        })
        .setInputFiles({
          name: `${kind}.json`,
          mimeType: 'application/json',
          buffer: Buffer.from(json),
        });
      await expect(
        review().getByRole('button', { name: `Save ${label} project`, exact: true })
      ).toBeVisible();
    };
    const download = async () => {
      const waiting = page.waitForEvent('download');
      await review()
        .getByRole('button', { name: `Save ${label} project`, exact: true })
        .click();
      return readFile(await (await waiting).path(), 'utf8');
    };
    const prepare = async () => {
      await panel()
        .getByLabel('Mode for assisted review', { exact: true })
        .selectOption(draft.modeIds[0]);
      await panel().getByRole('button', { name: 'Check assistance', exact: true }).click();
      await panel().getByRole('button', { name: 'Prepare evidence', exact: true }).click();
      await expect(
        panel().getByRole('button', { name: 'Send selected evidence', exact: true })
      ).toBeVisible();
      await expect(panel().locator('dl').getByText(inventory.modes[0].label, { exact: true })).toBeVisible();
    };
    const send = async () => {
      await panel()
        .getByRole('checkbox', { name: /I agree to send/ })
        .check();
      await panel().getByRole('button', { name: 'Send selected evidence', exact: true }).click();
    };
    await open(projectJson);
    let before = providerRequests.length;
    await prepare();
    expect(providerRequests.length).toBe(before);
    await expect(
      panel().getByRole('button', { name: 'Send selected evidence', exact: true })
    ).toBeDisabled();
    await expect(panel().getByLabel('Include selected page previews')).toHaveCount(0);
    await send();
    await expect(
      panel().getByRole('button', { name: 'Use suggestions in draft', exact: true })
    ).toBeEnabled();
    expect(providerRequests.length).toBe(before + 1);
    expect(providerRequests.at(-1).input.source.kind).toBe(kind);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await panel().screenshot({ path: path.join(output, `${kind}-assistance-mobile.png`) });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await panel().getByRole('button', { name: 'Use suggestions in draft', exact: true }).click();
    const saved = await download();
    const workspace = JSON.parse(saved);
    expect(workspace.schemaVersion).toBe('teul.guideline-workspace.v10');
    const savedProject = JSON.parse(workspace.sourceProjectJson);
    expect(savedProject.draft.colors[0].label).toBe('Harbor teal');
    expect(savedProject.draft.scopeDecision.accepted).toBe(false);
    expect(savedProject.capture).toEqual(project.capture);
    expect(savedProject.draft.profileDecision).toEqual(draft.profileDecision);
    await open(saved);
    expect(await download()).toBe(saved);
    expect(providerRequests.length).toBe(before + 1);
    checks.push(
      `${kind}: explicit mode and consent, source-bound provider result, draft-only application and byte-exact cold export`
    );
    await page.screenshot({ path: path.join(output, `${kind}-applied.png`), fullPage: true });

    // An unknown submission is recovered from saved identity after reload; consent is never replayed.
    await open(projectJson);
    await prepare();
    before = providerRequests.length;
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
    await page.unroute('**/api/guideline-intake/jobs');
    await page.reload();
    await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
    await page
      .locator('summary')
      .filter({ hasText: kind === 'figma' ? 'Read from Figma' : 'Read a website' })
      .click();
    const jobs = requests.filter(
      item => item.method === 'POST' && item.url.endsWith('/jobs')
    ).length;
    await host()
      .locator('summary')
      .filter({ hasText: /Saved.*requests/ })
      .click();
    await host().getByRole('button', { name: 'Check saved requests', exact: true }).click();
    await host().getByRole('button', { name: 'Open saved request', exact: true }).first().click();
    await expect(
      panel().getByRole('button', { name: 'Recover submitted request', exact: true })
    ).toBeVisible();
    expect(
      requests.filter(item => item.method === 'POST' && item.url.endsWith('/jobs')).length
    ).toBe(jobs);
    await panel().getByRole('button', { name: 'Recover submitted request', exact: true }).click();
    await expect(
      panel().getByRole('button', { name: 'Use suggestions in draft', exact: true })
    ).toBeEnabled();
    expect(providerRequests.length).toBe(before + 1);
    expect(
      requests.filter(item => item.method === 'POST' && item.url.endsWith('/jobs')).length
    ).toBe(jobs);
    checks.push(
      `${kind}: unknown outcome and cold recovery restore pre-request workspace without resubmitting`
    );

    // An existing request stays bound to its original signed-in owner.
    signedInOwner = 'browser-bob';
    await panel().getByRole('button', { name: 'Check submitted request', exact: true }).click();
    await expect(panel().getByRole('alert')).toContainText('signed-in account changed');
    expect(providerRequests.length).toBe(before + 1);
    signedInOwner = 'browser-alice';
    await panel().getByRole('button', { name: 'Check submitted request', exact: true }).click();
    await expect(
      panel().getByRole('button', { name: 'Use suggestions in draft', exact: true })
    ).toBeEnabled();
    checks.push(
      `${kind}: changed accounts cannot check another owner's request; original owner can resume without resubmission`
    );

    // A mode change invalidates an already returned result before it can alter the draft.
    await panel().getByLabel('Mode for assisted review', { exact: true }).selectOption('');
    await expect(
      panel().getByRole('button', { name: 'Use suggestions in draft', exact: true })
    ).toHaveCount(0);
    const unchanged = JSON.parse(await download());
    expect(unchanged.draft.colors[0].label).toBe(draft.colors[0].label);
    checks.push(`${kind}: changed mode invalidates suggestions and preserves manual source draft`);
    // Cancellation does not adopt a late response or alter the manual draft.
    await open(projectJson);
    await prepare();
    before = providerRequests.length;
    const priorAborts = abortedCalls;
    behavior = 'slow';
    await send();
    await expect.poll(() => providerRequests.length).toBe(before + 1);
    await expect(
      panel().getByText('Reading the selected evidence. You can cancel this request.', {
        exact: true,
      })
    ).toBeVisible();
    await panel().getByRole('button', { name: 'Cancel assistance', exact: true }).click();
    await expect(panel().getByRole('status')).toContainText('was cancelled');
    await expect.poll(() => abortedCalls).toBe(priorAborts + 1);
    behavior = 'valid';
    expect(JSON.parse(await download()).draft).toEqual(draft);
    checks.push(`${kind}: cancellation reaches provider transport and preserves the current draft`);

    // Expired temporary recovery copies are removed without rewriting the open source.
    await page.evaluate(async () => {
      const { guidelineRecoveryStore, createRecoveryStore } =
        await import('/src/lib/guideline/recoveryStore.ts');
      const { GuidelineIntakeClient } = await import('/src/lib/guideline/intakeClient.ts');
      const { ownerBinding } = await new GuidelineIntakeClient().session();
      await guidelineRecoveryStore.close();
      const future = createRecoveryStore({ now: () => Date.now() + 25 * 60 * 60 * 1000 });
      const entries = await future.list(ownerBinding);
      if (entries.length) throw new Error('Expired recovery copies remain');
      await future.close();
    });
    await host()
      .locator('summary')
      .filter({ hasText: /Saved.*requests/ })
      .click();
    await host().getByRole('button', { name: 'Check saved requests', exact: true }).click();
    await expect(
      host().getByText('No saved requests for this account and source.', { exact: true })
    ).toBeVisible();
    expect(JSON.parse(await download()).draft).toEqual(draft);
    checks.push(
      `${kind}: expired recovery evidence is removed while the open source draft remains intact`
    );
    await context.close();
    lastPage = null;
  }
  expect(failures).toEqual([]);
} catch (error) {
  failures.push(error.stack ?? String(error));
  if (lastPage && !lastPage.isClosed()) {
    await writeFile(
      path.join(output, 'failure-page.txt'),
      await lastPage.locator('body').innerText()
    );
    await lastPage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  }
  throw error;
} finally {
  await writeFile(
    path.join(output, 'browser-receipt.json'),
    JSON.stringify(
      {
        status: failures.length ? 'failed' : 'passed',
        node: process.version,
        checks,
        failures,
        requests: requests.length,
        providerCalls: providerRequests.length,
        syntheticTransport: true,
        deployed: false,
      },
      null,
      2
    )
  );
  await browser?.close();
  await server.close();
  await service.stop();
  store.close();
  await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify({ checks: checks.length, failures, output }, null, 2));
