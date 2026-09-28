/** Real production browser timings over the built lazy authoring API, independent of UI selectors. */
import { chromium } from '@playwright/test';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.STUDIO_URL || 'http://127.0.0.1:5180';
const evidence = path.resolve(
  process.env.STUDIO_EVIDENCE || path.join(web, '../release/studio-authoring-performance')
);
const assets = path.join(web, 'dist/assets');
const files = await readdir(assets);
const filename = files.find(name => /^authoring-[\w-]+\.js$/.test(name));
if (!filename)
  throw new Error(
    'Build the production Studio with its lazy authoring import before running this check.'
  );
const assetBytes = await readFile(path.join(assets, filename));
const allJs = await Promise.all(
  files.filter(name => name.endsWith('.js')).map(name => readFile(path.join(assets, name)))
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
});
const errors = [];
let measurements;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(url);
  if (response?.status() !== 200)
    throw new Error('The configured production preview did not return HTTP200.');
  await page.waitForLoadState('networkidle');
  if (await page.locator('[data-agentation-toolbar]').count())
    throw new Error('Use a production preview, not the development feedback server.');
  measurements = await page.evaluate(
    async asset => {
      const api = await import(asset);
      if (typeof api.generateStudioAuthoring !== 'function')
        throw new Error(
          `The production chunk has no public authoring API: ${Object.keys(api).join(', ')}`
        );
      if (!PerformanceObserver.supportedEntryTypes.includes('longtask'))
        throw new Error('This browser cannot measure main-thread long tasks.');
      const longTasks = [];
      const observer = new PerformanceObserver(list =>
        longTasks.push(
          ...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration }))
        )
      );
      observer.observe({ entryTypes: ['longtask'] });
      const corpus = [
        { id: 'blue', colors: ['#3257DC', '#CB7252'], expected: 'ready' },
        {
          id: 'solar-with-endpoints',
          colors: ['#E4F222', '#FFFFFF', '#000000'],
          expected: 'ready',
        },
        {
          id: 'recorded-four-colors',
          colors: ['#0093A5', '#719D85', '#98A9A0', '#0DC55F'],
          expected: 'ready',
        },
        { id: 'dark-blue', colors: ['#123C7A', '#FAFAF9', '#141414'], expected: 'ready' },
        { id: 'neutral-midtone', colors: ['#777777', '#FFFFFF', '#000000'], expected: 'ready' },
        {
          id: 'six-sources',
          colors: ['#FFFF00', '#FFFF66', '#3257DC', '#CB7252', '#FFFFFF', '#000000'],
          expected: 'ready',
        },
        { id: 'endpoint-only', colors: ['#FFFFFF', '#000000'], expected: 'blocked' },
      ];
      const results = [];
      for (const fixture of corpus) {
        const settings = {
          name: `Performance ${fixture.id}`,
          colors: fixture.colors,
          anchorIndex: 0,
          purpose: 'product-ui',
          neutrals: 'neutral',
        };
        const attempts = [];
        for (let repetition = 0; repetition < 2; repetition++) {
          const start = performance.now();
          const result = await api.generateStudioAuthoring(settings);
          const end = performance.now();
          // Give the observer its next delivery turn before reading this interval.
          await new Promise(resolve => setTimeout(resolve, 50));
          attempts.push({
            status: result.status,
            durationMs: end - start,
            maxLongTaskMs: Math.max(
              0,
              ...longTasks
                .filter(entry => entry.start + entry.duration > start && entry.start < end)
                .map(entry => entry.duration)
            ),
            contentHashes: result.directions.map(direction => direction.contentHash),
            directionCount: result.directions.length,
          });
        }
        results.push({
          id: fixture.id,
          expected: fixture.expected,
          deterministic:
            JSON.stringify(attempts[0].contentHashes) === JSON.stringify(attempts[1].contentHashes),
          attempts,
        });
      }
      const controller = new AbortController();
      let requestedAt = 0;
      const startedAt = performance.now();
      const scheduledAt = startedAt;
      setTimeout(() => {
        requestedAt = performance.now();
        controller.abort();
      }, 0);
      const cancelling = api.generateStudioAuthoring(
        {
          name: 'Cancel active generation',
          colors: corpus[2].colors,
          anchorIndex: 0,
          purpose: 'product-ui',
          neutrals: 'neutral',
        },
        controller.signal
      );
      const cancelled = await cancelling;
      const endedAt = performance.now();
      observer.disconnect();
      return {
        corpus: results,
        cancellation: {
          status: cancelled.status,
          directionCount: cancelled.directions.length,
          elapsedMs: endedAt - startedAt,
          requestDelayMs: requestedAt - scheduledAt,
          responseMs: endedAt - requestedAt,
          requestedDuringWork: requestedAt > startedAt && requestedAt <= endedAt,
        },
      };
    },
    new URL(`assets/${filename}`, `${url.replace(/\/$/, '')}/`).href
  );
} finally {
  await browser.close();
}
const failures = [];
for (const item of measurements.corpus) {
  if (!item.deterministic) failures.push(`${item.id}: repeated output changed`);
  for (const attempt of item.attempts) {
    if (attempt.status !== item.expected)
      failures.push(`${item.id}: ${attempt.status}, expected ${item.expected}`);
    if (attempt.durationMs > 2000) failures.push(`${item.id}: generation exceeded2000ms`);
    if (attempt.maxLongTaskMs >= 200) failures.push(`${item.id}: a main-thread task reached200ms`);
  }
}
if (
  measurements.cancellation.status !== 'cancelled' ||
  measurements.cancellation.directionCount ||
  !measurements.cancellation.requestedDuringWork ||
  measurements.cancellation.responseMs >= 500
)
  failures.push('Active cancellation did not settle empty within500ms of the scheduled request.');
if (errors.length) failures.push(...errors);
const receipt = {
  recordedAt: new Date().toISOString(),
  environment: {
    url,
    browser: process.env.STUDIO_CHROME || 'Playwright Chromium',
    asset: filename,
    assetSha256: createHash('sha256').update(assetBytes).digest('hex'),
  },
  method:
    'Import the actual minified lazy production chunk after the production UI is idle; run seven frozen inputs twice, observe main-thread long tasks, then request cancellation with a zero-delay timer while generation is active. Module download/parse is excluded from generation duration. Full-page responsiveness and visual behavior are covered by separate UI checks.',
  limits: { generationMs: 2000, maxMainThreadTaskMs: 200, cancellationResponseMs: 500 },
  bundle: {
    authoringChunkBytes: assetBytes.length,
    authoringChunkGzipBytes: gzipSync(assetBytes).length,
    allJavaScriptBytes: allJs.reduce((total, bytes) => total + bytes.length, 0),
    allJavaScriptGzipBytes: allJs.reduce((total, bytes) => total + gzipSync(bytes).length, 0),
    note: 'Authoring chunk may reuse shared loaded modules; these figures do not claim it is the full dependency cost or initial-download size.',
  },
  ...measurements,
  status: failures.length ? 'failed' : 'passed',
  failures,
};
await mkdir(evidence, { recursive: true });
await writeFile(path.join(evidence, 'performance.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      status: receipt.status,
      timings: receipt.corpus.map(item => ({
        id: item.id,
        ms: item.attempts.map(attempt => Math.round(attempt.durationMs)),
        maxTaskMs: Math.max(...item.attempts.map(attempt => attempt.maxLongTaskMs)),
        deterministic: item.deterministic,
      })),
      cancellation: receipt.cancellation,
      bundle: receipt.bundle,
      failures,
    },
    null,
    2
  )
);
if (failures.length) process.exitCode = 1;
