/* global window, PerformanceObserver, performance, setTimeout, AbortController */
import { build, preview } from 'vite';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { log } from 'node:console';
import { cpus } from 'node:os';
import { gradientFidelityFixtures } from './fixtures.mjs';
import { gradientExperimentSources } from './source-files.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const experiment = path.join(root, 'scripts/experiments/gradient-fidelity');
const output = path.join(root, 'release/gradient-fidelity/worker');
const { chromium } = createRequire(path.join(root, 'web/package.json'))('@playwright/test');
const repetitions = Number(process.env.GRADIENT_WORKER_REPETITIONS ?? 30);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 30)
  throw new Error('Use 1 to 30 repetitions; only 30 supports the declared feasibility workload.');
await build({
  root: experiment,
  configFile: false,
  worker: { format: 'es' },
  build: {
    outDir: output,
    emptyOutDir: true,
    minify: true,
    rolldownOptions: { input: path.join(experiment, 'browser.html') },
  },
});
const server = await preview({
  root: experiment,
  configFile: false,
  build: { outDir: output },
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
});
let browser;
let measurements;
let browserVersion;
const errors = [];
try {
  browser = await chromium.launch({ headless: true });
  browserVersion = browser.version();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string')
    throw new Error('Preview did not bind a local port.');
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('reportGradientProgress', message => log(message));
  const response = await page.goto(`http://127.0.0.1:${address.port}/browser.html`);
  if (response?.status() !== 200) throw new Error('Worker fixture page did not load.');
  await page.waitForFunction(() => window.gradientWorkerExperiment);
  measurements = await page.evaluate(
    async ({ cases, repetitions }) => {
      if (!PerformanceObserver.supportedEntryTypes.includes('longtask'))
        throw new Error('Long-task observation is unavailable.');
      const api = window.gradientWorkerExperiment;
      const longTasks = [];
      const observer = new PerformanceObserver(list =>
        longTasks.push(
          ...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration }))
        )
      );
      observer.observe({ entryTypes: ['longtask'] });
      const corpus = [];
      for (const [name, colors, route] of cases) {
        const attempts = [];
        for (let iteration = 0; iteration < repetitions; iteration++) {
          const start = performance.now();
          const result = await api.run({ colors, route });
          const end = performance.now();
          await new Promise(resolve => setTimeout(resolve, 50));
          attempts.push({
            ...result,
            maxLongTaskMs: Math.max(
              0,
              ...longTasks
                .filter(entry => entry.start + entry.duration > start && entry.start < end)
                .map(entry => entry.duration)
            ),
          });
          if (
            result.status !== 'complete' ||
            result.assessment?.status !== 'pass' ||
            !Number.isFinite(result.assessment.maximumDeltaEOKUpperBound)
          ) {
            corpus.push({ name, colors, route, attempts });
            observer.disconnect();
            return {
              corpus,
              incomplete: true,
              fatalFailures: [
                `${name}/${iteration + 1}: ${result.message ?? result.status}; timing stopped after a hard failure.`,
              ],
            };
          }
          if ((iteration + 1) % 5 === 0 || iteration === repetitions - 1)
            await window.reportGradientProgress(`${name}: ${iteration + 1}/${repetitions}`);
        }
        corpus.push({ name, colors, route, attempts });
      }
      const [, colors, route] = cases.find(([name]) => name === 'longer');
      const controller = new AbortController();
      let requestedAt = null;
      const cancelled = await api.run({ colors, route }, controller.signal, () => {
        requestedAt = performance.now();
        controller.abort();
      });
      const cancellation = {
        ...cancelled,
        startedObserved: requestedAt !== null,
        acknowledgementMs: requestedAt === null ? null : performance.now() - requestedAt,
      };
      const [, recoveryColors, recoveryRoute] = cases[0];
      const recovery = await api.run({ colors: recoveryColors, route: recoveryRoute });
      const malformed = await api.run({ colors: [], route });
      const uncloneable = await api.run({ colors, route, unsupported: () => {} });
      const OriginalWorker = window.Worker;
      let unavailable, preAborted;
      window.Worker = class {
        constructor() {
          throw new Error('Injected worker unavailable.');
        }
      };
      try {
        unavailable = await api.run({ colors, route });
        const aborted = new AbortController();
        aborted.abort();
        preAborted = await api.run({ colors, route }, aborted.signal);
      } finally {
        window.Worker = OriginalWorker;
        observer.disconnect();
      }
      return {
        corpus,
        cancellation,
        recovery,
        malformed,
        uncloneable,
        unavailable,
        preAborted,
        fatalFailures: [],
        incomplete: false,
      };
    },
    { cases: gradientFidelityFixtures, repetitions }
  );
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}

const failures = [...errors, ...measurements.fatalFailures];
const passing = attempt => {
  const a = attempt?.assessment;
  return (
    attempt?.status === 'complete' &&
    a?.status === 'pass' &&
    Number.isInteger(attempt.stops) &&
    attempt.stops >= 2 &&
    attempt.stops <= 64 &&
    typeof a.candidatePaintHash === 'string' &&
    Number.isFinite(a.maximumDeltaEOKUpperBound) &&
    a.maximumDeltaEOKUpperBound >= 0 &&
    a.maximumDeltaEOKUpperBound <= a.toleranceDeltaEOK &&
    a.toleranceDeltaEOK <= 0.005 &&
    a.numericalProfile?.nativeCoordinateAllowance === 0 &&
    a.numericalProfile.referenceVersion === 'teul.gradient-reference-route.v2'
  );
};
const percentile = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
const summary = measurements.corpus.map(item => {
  const p95Ms = percentile(item.attempts.map(attempt => attempt.totalMs));
  const maxLongTaskMs = Math.max(...item.attempts.map(attempt => attempt.maxLongTaskMs));
  const hashes = item.attempts.map(attempt => attempt.assessment?.candidatePaintHash);
  const deterministic = hashes.every(hash => typeof hash === 'string' && hash === hashes[0]);
  if (!deterministic)
    failures.push(`${item.name}: repeated candidate paint changed or was absent.`);
  for (const attempt of item.attempts) {
    if (!passing(attempt)) failures.push(`${item.name}: candidate lacked a passing V2 bound.`);
  }
  if (p95Ms > 2000) failures.push(`${item.name}: measured p95 exceeded 2000 ms.`);
  if (maxLongTaskMs >= 50) failures.push(`${item.name}: main-thread task reached 50 ms.`);
  return {
    name: item.name,
    p95Ms,
    maxMs: Math.max(...item.attempts.map(a => a.totalMs)),
    maxLongTaskMs,
    deterministic,
  };
});
if (
  measurements.cancellation?.status !== 'cancelled' ||
  !measurements.cancellation.startedObserved ||
  measurements.cancellation.acknowledgementMs > 250 ||
  'assessment' in measurements.cancellation
)
  failures.push('Active cancellation did not settle empty within 250 ms.');
if (
  !passing(measurements.recovery) ||
  measurements.recovery.assessment.candidatePaintHash !==
    measurements.corpus[0].attempts[0].assessment?.candidatePaintHash
)
  failures.push('Fresh generation after cancellation did not recover the expected paint.');
if (
  measurements.malformed?.status !== 'failed' ||
  measurements.uncloneable?.status !== 'failed' ||
  measurements.uncloneable.totalMs > 250 ||
  measurements.unavailable?.status !== 'failed' ||
  measurements.preAborted?.status !== 'cancelled'
)
  failures.push('Invalid input, unavailable workers or pre-aborted requests did not fail safely.');

const sources = [
  'worker-benchmark.mjs',
  'browser.html',
  'gradient-worker.ts',
  'gradient-worker-client.ts',
  'fixtures.mjs',
].map(name => `scripts/experiments/gradient-fidelity/${name}`);
sources.push(...gradientExperimentSources);
const hashes = Object.fromEntries(
  await Promise.all(
    sources.map(async file => [
      file,
      createHash('sha256')
        .update(await readFile(path.join(root, file)))
        .digest('hex'),
    ])
  )
);
const bundle = [];
for (const name of [
  'browser.html',
  ...(await readdir(path.join(output, 'assets'))).map(name => `assets/${name}`),
]) {
  const bytes = await readFile(path.join(output, name));
  bundle.push({
    name,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const receipt = {
  schemaVersion: 'teul.gradient-worker-feasibility.v1',
  recordedAt: new Date().toISOString(),
  node: process.version,
  browser: browserVersion,
  machine: { platform: process.platform, architecture: process.arch, cpu: cpus()[0]?.model },
  scope: 'isolated minified browser worker; not Studio integration or rendering qualification',
  method:
    'Fresh worker per request, cached local assets; includes startup, baseline/candidate compilation and V2 assessment. Nearest-rank p95 per fixture; module downloads use local preview, not network performance. Long tasks observed on the page main thread.',
  repetitions,
  fullDeclaredWorkload: repetitions === 30 && !measurements.incomplete,
  qualified: false,
  status: failures.length ? 'failed' : 'passed',
  sources: hashes,
  bundle,
  summary,
  ...measurements,
  failures,
};
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
log(
  JSON.stringify(
    { status: receipt.status, repetitions, summary, cancellation: receipt.cancellation, failures },
    null,
    2
  )
);
if (failures.length) process.exitCode = 1;
