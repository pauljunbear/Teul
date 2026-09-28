import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { log } from 'node:console';
import { cpus } from 'node:os';
import path from 'node:path';
import { gradientFidelityFixtures } from './fixtures.mjs';
import { gradientExperimentSources } from './source-files.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const margins = [0.0025, 0.001];
// Shared construction returns separate candidate stops at each supported threshold.
// They are never serialized as modified V1 designs.
const server = await createServer({
  root,
  configFile: false,
  server: { watch: null, hmr: false },
});

try {
  const { assessGradientPaintCandidateForExperiment: assess } = await server.ssrLoadModule(
    '/src/lib/colorSystemGradientFidelityV2.ts'
  );
  const { compileGradientV1: baseline } = await server.ssrLoadModule(
    '/src/lib/colorSystemGradientV1.ts'
  );
  const { buildColorSystemSrgbValueV1: color } = await server.ssrLoadModule(
    '/src/lib/colorSystemSrgbValueV1.ts'
  );
  const { compileGradientSampledPaintV1: compile } = await server.ssrLoadModule(
    '/src/lib/colorSystemGradientConstructionV1.ts'
  );
  const results = [];
  for (const margin of margins) {
    for (const [name, colors, route] of gradientFidelityFixtures) {
      const input = {
        sourceModelHash: `sha256:${'1'.repeat(64)}`,
        briefHash: `sha256:${'2'.repeat(64)}`,
        angleDegrees: 120,
        route,
        stops: colors.map(([r, g, b], index) => ({
          position: index / (colors.length - 1),
          value: color({ r, g, b }),
          sourceColorId: `source-${index}`,
          locked: true,
        })),
      };
      const original = baseline(input);
      const start = performance.now();
      try {
        const candidate = compile(input, margin),
          compilationMs = performance.now() - start;
        const assessment = assess(original, candidate.stops, {
          maximumMappingStatesPerInterval: 32,
        });
        const row = {
          name,
          margin,
          colors,
          route,
          compilationMs,
          totalMs: performance.now() - start,
          compiledStops: candidate.stops.length,
          sampledMaximum: candidate.maximumObserved,
          assessment,
        };
        results.push(row);
        log(
          `${margin} / ${name}: ${assessment.status}, ${row.compiledStops} stops, ${row.totalMs.toFixed(1)} ms`
        );
      } catch (error) {
        results.push({
          name,
          margin,
          colors,
          route,
          totalMs: performance.now() - start,
          error: error.message,
        });
        log(`${margin} / ${name}: failed (${error.message})`);
      }
    }
  }
  const files = [
    'scripts/experiments/gradient-fidelity/margin-benchmark.mjs',
    'scripts/experiments/gradient-fidelity/fixtures.mjs',
    ...gradientExperimentSources,
  ];
  const sources = Object.fromEntries(
    await Promise.all(
      files.map(async name => [
        name,
        createHash('sha256')
          .update(await readFile(path.join(root, name)))
          .digest('hex'),
      ])
    )
  );
  const report = {
    schemaVersion: 'teul.gradient-margin-experiment.v2',
    qualified: false,
    referenceModel: 'exact-source-real-arithmetic-v2',
    renderingQualified: false,
    node: process.version,
    machine: {
      platform: process.platform,
      architecture: process.arch,
      cpu: cpus()[0]?.model ?? 'unknown',
    },
    measurement:
      'One run per case in listed order, including compilation and assessment. No p95 or browser responsiveness claim.',
    sources,
    results,
  };
  const directory = path.join(root, 'release/gradient-fidelity');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, `margin-node${process.versions.node.split('.')[0]}.json`),
    `${JSON.stringify(report, null, 2)}\n`
  );
} finally {
  await server.close();
}
