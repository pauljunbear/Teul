import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
/** Production Studio click-to-displayed-result workload; Worker wrapping observes only. */
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gradientFidelityFixtures } from '../../scripts/experiments/gradient-fidelity/fixtures.mjs';

const web = fileURLToPath(new URL('../', import.meta.url));
const repo = path.resolve(web, '..');
const output = path.join(repo, 'release/guideline-gradient-performance');
const runtime = `node${process.versions.node.split('.')[0]}`;
const repetitions = Number(process.env.GUIDELINE_GRADIENT_REPETITIONS ?? 30);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 30)
  throw new Error('Use 1 to 30 repetitions. Only 30 satisfies the declared workload.');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const failures = [],
  errors = [],
  unexpectedRequests = [],
  corpus = [];
const receipt = {
  schemaVersion: 'teul.studio-gradient-performance.v1',
  recordedAt: new Date().toISOString(),
  node: process.version,
  machine: { platform: process.platform, architecture: process.arch, cpu: cpus()[0]?.model },
  repetitions,
  measurementClass: repetitions === 30 ? 'declared-workload' : 'smoke-only',
  fullDeclaredWorkload: false,
  scope:
    'Actual built Studio Figma project import and UI generation with synthetic exact source channels; no renderer or visual-quality qualification.',
  method:
    'One browser page and fresh real application Worker per generation. Capture trusted UI click time; finish after the current worker result is accepted, its preview and enabled SVG/CSS controls appear, and two animation frames elapse. Includes worker startup, source validation, compilation, fidelity, final-paint checks, client validation and UI rendering. Source import/control setup and observer flush are outside timing. First attempt per fixture is retained; assets use local production preview, with no internet-latency or slower-device claim. Nearest-rank p95 per fixture.',
  limits: {
    fixtureP95Ms: 2000,
    compiledStops: 64,
    fidelityTolerance: '1/200',
    mainThreadTaskMs: 50,
  },
  scriptSha256: digest(await readFile(fileURLToPath(import.meta.url))),
  fixtureSha256: digest(
    await readFile(path.join(repo, 'scripts/experiments/gradient-fidelity/fixtures.mjs'))
  ),
  corpus,
  failures,
  errors,
  unexpectedRequests,
};
let server, production, browser, page;
await mkdir(output, { recursive: true });
const builtFiles = [
  'index.html',
  ...(await readdir(path.join(web, 'dist/assets')))
    .filter(name => /\.(js|css)$/.test(name))
    .map(name => `assets/${name}`),
];
receipt.builtFiles = Object.fromEntries(
  await Promise.all(
    builtFiles
      .sort()
      .map(async name => [name, digest(await readFile(path.join(web, 'dist', name)))])
  )
);

try {
  server = await createServer({
    root: web,
    mode: 'guideline-proof',
    server: { watch: null, hmr: false },
  });
  const { createFigmaNativeInventory } = await server.ssrLoadModule(
    '/src/lib/guideline/figmaInventory.ts'
  );
  const { suggestFigmaReview, compileFigmaReview } = await server.ssrLoadModule(
    '/src/lib/guideline/figmaReview.ts'
  );
  const { buildFigmaProject } = await server.ssrLoadModule('/src/lib/guideline/figmaProject.ts');
  const { hashCanonical } = await server.ssrLoadModule('/src/lib/guideline/intakeClient.ts');
  const { canonicalIntakeJson } = await server.ssrLoadModule(
    `/@fs${path.join(repo, 'services/guideline-intake/src/protocol.ts')}`
  );
  const seed = JSON.parse(
    await readFile(path.join(web, 'fixtures/guidelines/figma-project-v1.json'), 'utf8')
  );
  const projects = [];
  for (const [name, colors, route] of gradientFidelityFixtures) {
    const capture = structuredClone(seed.capture);
    capture.file.name = `Gradient performance: ${name}`;
    capture.roots[0].document.name = 'Exact synthetic gradient sources';
    capture.roots[0].document.children = colors.map(([r, g, b], index) => ({
      id: `1:${index + 3}`,
      name: `Source ${index + 1}`,
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: { r, g, b } }],
    }));
    const { contentHash: _old, ...content } = capture;
    capture.contentHash = await hashCanonical(canonicalIntakeJson(content));
    const inventory = await createFigmaNativeInventory(capture);
    const draft = suggestFigmaReview(inventory);
    draft.modeIds = inventory.modes.map(mode => mode.id);
    draft.colors = inventory.declarations.map((declaration, index) => ({
      declarationId: declaration.id,
      label: `Source ${index + 1}`,
      family: 'Fixture',
    }));
    const actor = { kind: 'user', ref: 'test:studio-gradient-performance' };
    const reviewedAt = '2026-09-27T04:00:00.000Z';
    draft.profileDecision = {
      captureHash: capture.contentHash,
      interpretation: 'srgb',
      actor,
      decidedAt: reviewedAt,
    };
    draft.scopeDecision = {
      accepted: true,
      reason: 'Synthetic exact sRGB input for the declared performance workload.',
    };
    const review = compileFigmaReview(inventory, draft, actor, reviewedAt);
    const modeId = draft.modeIds[0];
    const colorIds = draft.colors.map(color => color.declarationId);
    const actual = colorIds.map(
      id => review.model.colors.find(color => color.id === id)?.valuesByMode[modeId]?.components
    );
    if (JSON.stringify(actual) !== JSON.stringify(colors.map(([r, g, b]) => ({ r, g, b }))))
      throw new Error(`${name}: review changed exact source channels.`);
    const project = await buildFigmaProject({ capture, draft, review, selection: null });
    projects.push({
      name,
      colors,
      route,
      colorIds,
      modeId,
      modelHash: review.model.modelHash,
      reviewHash: review.reviewHash,
      json: JSON.stringify(project),
    });
  }
  await server.close();
  server = null;
  production = await preview({
    root: web,
    preview: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  const url = production.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(() => {
    if (!PerformanceObserver.supportedEntryTypes.includes('longtask'))
      throw new Error('Long-task observation is unavailable.');
    const trace = (window.gradientPerformance = { active: null, longTasks: [] });
    const editor = () => document.querySelector('[aria-label="Mode-aware gradient editor"]');
    const button = (root, label) =>
      [...root.querySelectorAll('button')].find(node => node.textContent.trim() === label);
    const inspect = () => {
      const active = trace.active,
        root = editor();
      if (
        !active ||
        active.startedAt === null ||
        active.endedAt !== null ||
        active.framePending ||
        !active.result ||
        !root
      )
        return;
      const make = button(root, 'Make gradient');
      if (!make || make.disabled) return;
      const preview = root.querySelector('.guideline-gradient-preview');
      const svg = button(root, 'SVG'),
        css = button(root, 'CSS');
      const alert = root.querySelector('[role="alert"]');
      if (alert) {
        active.failure = alert.textContent || 'The current result was rejected.';
        active.endedAt = performance.now();
        return;
      }
      const displayed =
        preview &&
        getComputedStyle(preview).display !== 'none' &&
        preview.getBoundingClientRect().height > 0;
      if (!displayed || !svg || !css || svg.disabled || css.disabled) {
        if (alert || active.result.portable.exportable === false) {
          active.failure = alert?.textContent || 'The returned gradient was not exportable.';
          active.endedAt = performance.now();
        }
        return;
      }
      active.framePending = true;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (trace.active !== active || button(root, 'Make gradient')?.disabled) return;
          active.endedAt = performance.now();
          active.previewBackground = preview.style.background;
          active.exportControlsEnabled = !svg.disabled && !css.disabled;
        })
      );
    };
    new MutationObserver(inspect).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    new PerformanceObserver(list =>
      trace.longTasks.push(
        ...list
          .getEntries()
          .map(entry => ({ startTime: entry.startTime, duration: entry.duration }))
      )
    ).observe({ type: 'longtask', buffered: false });
    document.addEventListener(
      'click',
      event => {
        const target = event.target.closest('button');
        if (
          trace.active &&
          target?.textContent.trim() === 'Make gradient' &&
          editor()?.contains(target)
        )
          trace.active.startedAt = performance.now();
      },
      true
    );
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.observation = { createdAt: performance.now(), operation: null, requestId: null };
        this.addEventListener('message', event => {
          const data = event.data;
          if (data?.version !== 'teul.gradient-worker.v1' || !this.attempt) return;
          if (data.type === 'started') this.attempt.workerStartedAt = performance.now();
          if (data.type === 'error') {
            this.attempt.failure = data.message;
            this.attempt.endedAt = performance.now();
          }
          if (data.type === 'result' && data.result.kind === 'gradient') {
            this.attempt.resultAt = performance.now();
            this.attempt.result = data.result.value;
          }
        });
      }
      postMessage(message, ...args) {
        if (message?.version === 'teul.gradient-worker.v1') {
          this.observation.operation = message.request.operation;
          this.observation.requestId = message.id;
          if (message.request.operation === 'generate' && trace.active) {
            this.attempt = trace.active;
            this.attempt.workerCreatedAt = this.observation.createdAt;
            this.attempt.requestHash = message.requestHash;
            this.attempt.controls = message.request.controls;
            this.attempt.sourceModelHash = message.request.review.model.modelHash;
            this.attempt.reviewHash = message.request.review.reviewHash;
          }
        }
        return super.postMessage(message, ...args);
      }
      terminate() {
        this.observation.terminatedAt = performance.now();
        if (this.attempt) this.attempt.workerTerminatedAt = this.observation.terminatedAt;
        return super.terminate();
      }
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
  page.setDefaultTimeout(35000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  const editor = page.getByRole('region', { name: 'Mode-aware gradient editor', exact: true });
  for (const project of projects) {
    await page.getByLabel('Open Figma capture', { exact: true }).setInputFiles({
      name: `${project.name}.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(project.json),
    });
    await chooseGuidelineTask(page, 'gradient');
    await expect(editor.getByRole('button', { name: 'Make gradient', exact: true })).toBeEnabled();
    for (let count = 2; count < project.colors.length; count++)
      await editor.getByRole('button', { name: 'Add stop', exact: true }).click();
    for (let index = 0; index < project.colors.length; index++) {
      await editor.getByLabel(`Lock stop ${index + 1}`, { exact: true }).uncheck();
      const label =
        index === 0
          ? 'From'
          : index === project.colors.length - 1
            ? 'To'
            : `Stop ${index + 1} color`;
      await editor.getByLabel(label, { exact: true }).selectOption(project.colorIds[index]);
      if (index > 0 && index < project.colors.length - 1)
        await editor
          .getByLabel(`Stop ${index + 1} position`, { exact: true })
          .fill(String((100 * index) / (project.colors.length - 1)));
      await editor.getByLabel(`Lock stop ${index + 1}`, { exact: true }).check();
    }
    await editor.getByLabel('Angle', { exact: true }).fill('120');
    await editor
      .getByLabel('Interpolation', { exact: true })
      .selectOption(project.route.space === 'oklab' ? 'oklab' : project.route.huePath);
    const item = {
      name: project.name,
      colors: project.colors,
      route: project.route,
      sourceModelHash: project.modelHash,
      reviewHash: project.reviewHash,
      projectSha256: digest(project.json),
      attempts: [],
    };
    corpus.push(item);
    for (let iteration = 0; iteration < repetitions; iteration++) {
      await page.evaluate(
        ({ name, iteration }) => {
          const trace = window.gradientPerformance;
          trace.active = {
            name,
            iteration,
            startedAt: null,
            endedAt: null,
            result: null,
            failure: null,
          };
        },
        { name: project.name, iteration }
      );
      await editor.getByRole('button', { name: 'Make gradient', exact: true }).click();
      await page.waitForFunction(() => window.gradientPerformance.active.endedAt !== null);
      await page.waitForTimeout(60);
      const attempt = await page.evaluate(() => {
        const trace = window.gradientPerformance,
          a = trace.active;
        const value = a.result,
          design = value?.selection?.design;
        return {
          durationMs: a.endedAt - a.startedAt,
          startedAt: a.startedAt,
          endedAt: a.endedAt,
          workerStartupMs: a.workerStartedAt - a.workerCreatedAt,
          workerResultMs: a.resultAt - a.startedAt,
          workerTerminated: typeof a.workerTerminatedAt === 'number',
          requestHash: a.requestHash,
          controls: a.controls,
          sourceModelHash: a.sourceModelHash,
          reviewHash: a.reviewHash,
          exportControlsEnabled: a.exportControlsEnabled === true,
          previewMatchesResult: (() => {
            const probe = document.createElement('div');
            probe.style.background = value?.portable?.previewCss ?? '';
            return !!probe.style.background && probe.style.background === a.previewBackground;
          })(),
          design,
          fidelity: value?.portable?.fidelity,
          assessment: value?.portable?.assessment,
          exportable: value?.portable?.exportable,
          failure: a.failure,
          maxLongTaskMs: Math.max(
            0,
            ...trace.longTasks
              .filter(
                entry =>
                  entry.startTime + entry.duration > a.startedAt && entry.startTime < a.endedAt
              )
              .map(entry => entry.duration)
          ),
        };
      });
      item.attempts.push(attempt);
      const expectedStops = project.colors.map(([r, g, b], index) => ({
        position: index / (project.colors.length - 1),
        components: { r, g, b },
        sourceColorId: project.colorIds[index],
        locked: true,
      }));
      const actualStops = attempt.design?.stops.map(stop => ({
        position: stop.position,
        components: stop.value.components,
        sourceColorId: stop.sourceColorId,
        locked: stop.locked,
      }));
      const proof = attempt.fidelity;
      const valid =
        !attempt.failure &&
        attempt.sourceModelHash === project.modelHash &&
        attempt.reviewHash === project.reviewHash &&
        attempt.design?.schemaVersion === 'teul.gradient-design.v2' &&
        attempt.design.referenceVersion === 'teul.gradient-reference-route.v2' &&
        attempt.design.compiledPaint.version === 'teul.opaque-srgb-gradient.v2' &&
        attempt.design.compiledPaint.interpolation === 'srgb' &&
        attempt.design.angleDegrees === 120 &&
        JSON.stringify(attempt.design.route) === JSON.stringify(project.route) &&
        JSON.stringify(actualStops) === JSON.stringify(expectedStops) &&
        attempt.design.compiledPaint.stops.length >= 2 &&
        attempt.design.compiledPaint.stops.length <= 64 &&
        proof?.schemaVersion === 'teul.gradient-fidelity.v2' &&
        proof.status === 'pass' &&
        proof.reason === 'bounded' &&
        proof.witness === null &&
        proof.designHash === attempt.design.designHash &&
        /^sha256:[a-f0-9]{64}$/.test(proof.candidatePaintHash) &&
        Number.isFinite(proof.maximumDeltaEOKUpperBound) &&
        proof.maximumDeltaEOKUpperBound >= 0 &&
        proof.maximumDeltaEOKUpperBound <= proof.toleranceDeltaEOK &&
        proof.toleranceDeltaEOK < 0.005 &&
        proof.numericalProfile.nativeCoordinateAllowance === 0 &&
        proof.numericalProfile.arithmetic === 'outward-intervals' &&
        proof.numericalProfile.renderingQualification === 'not-qualified' &&
        proof.numericalProfile.referenceVersion === 'teul.gradient-reference-route.v2' &&
        attempt.assessment?.status === 'pass' &&
        attempt.assessment.designHash === attempt.design.designHash &&
        attempt.exportable &&
        attempt.exportControlsEnabled &&
        attempt.previewMatchesResult &&
        attempt.workerTerminated &&
        Number.isFinite(attempt.durationMs) &&
        attempt.durationMs > 0;
      if (!valid)
        throw new Error(
          `${project.name}/${iteration + 1}: current exact input, worker proof or displayed output failed verification.`
        );
      if ((iteration + 1) % 5 === 0 || iteration === repetitions - 1)
        console.log(`${project.name}: ${iteration + 1}/${repetitions}`);
    }
    const durations = item.attempts.map(a => a.durationMs).sort((a, b) => a - b);
    item.p95Ms = durations[Math.ceil(durations.length * 0.95) - 1];
    item.maxMs = Math.max(...durations);
    item.maxLongTaskMs = Math.max(...item.attempts.map(a => a.maxLongTaskMs));
    item.deterministic = item.attempts.every(
      a =>
        a.design.designHash === item.attempts[0].design.designHash &&
        a.fidelity.candidatePaintHash === item.attempts[0].fidelity.candidatePaintHash
    );
    if (item.p95Ms > 2000)
      failures.push(`${project.name}: p95 ${item.p95Ms.toFixed(1)} ms exceeded 2000 ms.`);
    if (item.maxLongTaskMs >= 50)
      failures.push(
        `${project.name}: main-thread task ${item.maxLongTaskMs.toFixed(1)} ms reached 50 ms.`
      );
    if (!item.deterministic) failures.push(`${project.name}: repeated exact paint changed.`);
  }
  receipt.fullDeclaredWorkload =
    repetitions === 30 &&
    corpus.length === gradientFidelityFixtures.length &&
    corpus.every(item => item.attempts.length === 30);
  if (errors.length || unexpectedRequests.length)
    failures.push('Browser errors or unexpected external/development requests occurred.');
} catch (error) {
  failures.push(String(error));
  if (page) {
    receipt.failureUi = await page
      .locator('body')
      .innerText()
      .then(text => text.slice(0, 32000))
      .catch(() => null);
    receipt.pendingObservation = await page
      .evaluate(() => window.gradientPerformance?.active)
      .catch(() => null);
  }
} finally {
  receipt.status = failures.length ? 'failed' : 'passed';
  try {
    await writeFile(
      path.join(output, `${runtime}-checks.json`),
      `${JSON.stringify(receipt, null, 2)}\n`
    );
  } finally {
    await Promise.allSettled([
      browser?.close(),
      server?.close(),
      production && new Promise(resolve => production.httpServer.close(resolve)),
    ]);
  }
}
console.log(
  JSON.stringify(
    {
      status: receipt.status,
      repetitions,
      fullDeclaredWorkload: receipt.fullDeclaredWorkload,
      summary: corpus.map(({ name, p95Ms, maxMs, maxLongTaskMs, deterministic }) => ({
        name,
        p95Ms,
        maxMs,
        maxLongTaskMs,
        deterministic,
      })),
      failures,
    },
    null,
    2
  )
);
if (failures.length) process.exitCode = 1;
