import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { log } from 'node:console';
import path from 'node:path';
import { gradientFidelityFixtures } from './fixtures.mjs';
import { gradientExperimentSources } from './source-files.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { watch: null, hmr: false } });
const cases = gradientFidelityFixtures;

try {
  const { assessGradientFidelityV2: assess } = await server.ssrLoadModule(
    '/src/lib/colorSystemGradientFidelityV2.ts'
  );
  const { compileGradientV1: compile } = await server.ssrLoadModule(
    '/src/lib/colorSystemGradientV1.ts'
  );
  const { buildColorSystemSrgbValueV1: color } = await server.ssrLoadModule(
    '/src/lib/colorSystemSrgbValueV1.ts'
  );
  const results = [];
  for (const [name, colors, route] of cases) {
    const design = compile({
      sourceModelHash: `sha256:${'1'.repeat(64)}`,
      briefHash: `sha256:${'2'.repeat(64)}`,
      angleDegrees: 120,
      route,
      stops: colors.map(([r, g, b], i) => ({
        position: i / (colors.length - 1),
        value: color({ r, g, b }),
        sourceColorId: `source-${i}`,
        locked: true,
      })),
    });
    const start = performance.now();
    const assessment = assess(design);
    const row = {
      name,
      colors,
      route,
      elapsedMs: performance.now() - start,
      compiledStops: design.compiledPaint.stops.length,
      sampledMaximum: design.compiledPaint.approximation.maxObservedDeltaEOK,
      assessment,
    };
    results.push(row);
    log(`${name}: ${assessment.status} (${assessment.reason}), ${row.elapsedMs.toFixed(1)} ms`);
  }
  const sources = [
    'scripts/experiments/gradient-fidelity/benchmark.mjs',
    'scripts/experiments/gradient-fidelity/fixtures.mjs',
    ...gradientExperimentSources,
  ];
  const hashes = Object.fromEntries(
    await Promise.all(
      sources.map(async name => [
        name,
        createHash('sha256')
          .update(await readFile(path.join(root, name)))
          .digest('hex'),
      ])
    )
  );
  const report = {
    schemaVersion: 'teul.gradient-fidelity-experiment.v2',
    node: process.version,
    measuredAt: new Date().toISOString(),
    qualified: false,
    sources: hashes,
    results,
  };
  const output = path.join(root, 'release/gradient-fidelity');
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, `node${process.versions.node.split('.')[0]}.json`),
    `${JSON.stringify(report, null, 2)}\n`
  );
} finally {
  await server.close();
}
