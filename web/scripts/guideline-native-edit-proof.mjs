import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

const output = process.argv[2] && path.resolve(process.argv[2]);
if (!output) throw new Error('Provide a new output directory for native-paint proof.');
await mkdir(output);
const hash = value => createHash('sha256').update(value).digest('hex');
const receipt = {
  status: 'running',
  node: process.version,
  checks: [],
  files: {},
  sourceFiles: {},
};
const repo = path.resolve('..');
const temporary = await mkdtemp(path.join(tmpdir(), 'teul-native-edit-'));
let server;
try {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  });
  const { nativeGradientEditFixture } = await server.ssrLoadModule(
    '/fixtures/guidelines/native-gradient-edit-fixture.ts'
  );
  const { nativeGradientComparisonFixture } = await server.ssrLoadModule(
    '/fixtures/guidelines/native-gradient-comparison-fixture.ts'
  );
  const edit = await server.ssrLoadModule('/src/lib/guideline/nativeGradientSelection.ts');
  const value = await nativeGradientEditFixture();
  for (const rotationDegrees of [0, 37.5, 90, -132.25]) {
    const selection = edit.createGuidelineNativeGradient(value.review, value.sources[0], {
      ...value.controls,
      rotationDegrees,
    });
    const cold = edit.readGuidelineNativeGradient(
      value.review,
      JSON.parse(JSON.stringify(selection)),
      value.sources
    );
    assert.deepEqual(cold, selection);
    const svgs = edit.guidelineNativeGradientSvgs(cold, 400, 200);
    for (const [suffix, bytes] of Object.entries({
      'selection.json': `${JSON.stringify(cold, null, 2)}\n`,
      'original.svg': svgs.originalSvg,
      'edited.svg': svgs.editedSvg,
    })) {
      const name = `${rotationDegrees}.${suffix}`;
      await writeFile(path.join(output, name), bytes);
      receipt.files[name] = { bytes: Buffer.byteLength(bytes), sha256: hash(bytes) };
    }
  }
  receipt.checks.push(
    'Four authored rotations cold replay with exact native paint, hard stops, alpha and non-square geometry.'
  );

  // Execute the unchanged pre-extraction renderer against the same validated synthetic capture.
  const sourcePath = 'web/src/lib/guideline/nativeGradient.ts';
  const baseline = execFileSync('git', ['show', `3a038dc:${sourcePath}`], {
    cwd: repo,
    encoding: 'utf8',
  });
  const legacyPath = path.join(temporary, 'legacy-native-gradient.ts');
  await writeFile(
    legacyPath,
    baseline.replace(
      /from '(\.[^']+)'/g,
      (_, relative) => `from '${path.resolve(repo, path.dirname(sourcePath), relative)}'`
    )
  );
  const legacy = await server.ssrLoadModule(legacyPath);
  const current = await server.ssrLoadModule('/src/lib/guideline/nativeGradient.ts');
  const comparison = await nativeGradientComparisonFixture();
  const legacyEvidence = legacy.figmaNativeGradients(comparison.inventory)[0];
  for (const [width, height] of [
    [400, 240],
    [240, 240],
  ]) {
    const frame = { interpretation: 'srgb', width, height };
    const before = legacy.renderFigmaNativeGradient(legacyEvidence, frame);
    const after = current.renderFigmaNativeGradient(comparison.evidence, frame);
    assert.deepEqual(after, before);
  }
  receipt.checks.push(
    'Legacy radial comparison SVG, notices and full rendering hash match pre-extraction revision 3a038dc at both frames.'
  );
  for (const file of [
    'src/lib/colorSystemNativeGradientGeometryV1.ts',
    'src/lib/colorSystemNativeGradientPaintV1.ts',
    sourcePath,
    'web/src/lib/guideline/nativeGradientSelection.ts',
    'web/src/lib/guideline/nativeGradientWorkspace.ts',
    'web/src/lib/guideline/sourceSet.ts',
    'web/fixtures/guidelines/native-gradient-edit-fixture.ts',
    'src/lib/__tests__/colorSystemNativeGradientPaintV1.test.ts',
    'web/src/lib/guideline/nativeGradientSelection.test.ts',
    'web/scripts/guideline-native-edit-proof.mjs',
  ])
    receipt.sourceFiles[file] = hash(await readFile(path.join(repo, file)));
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await server?.close();
  await rm(temporary, { recursive: true, force: true });
  await writeFile(path.join(output, 'verification.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}
