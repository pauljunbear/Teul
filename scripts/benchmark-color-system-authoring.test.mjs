import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import benchmark from './benchmark-color-system-authoring.cjs';

const require = createRequire(import.meta.url);

test('authoring cancellation timing includes the CPU chunk after the event is queued', async () => {
  async function executeCalibration(runtime) {
    await runtime.yield();
    const until = performance.now() + 300;
    while (performance.now() < until) {
      /* Intentional calibration of an unyielding chunk. */
    }
    await runtime.yield();
    return {
      status: runtime.isCancelled() ? 'cancelled' : 'ready',
      qualified: false,
      directions: [],
    };
  }
  const measured = await benchmark.cancellationProbe(
    'calibration',
    executeCalibration,
    /executeCalibration/,
    1
  );
  assert.equal(measured.noPartialOutput, true);
  assert.equal(measured.status, 'cancelled');
  assert.equal(measured.pass, false);
  assert.ok(measured.durationMs >= 300);
  assert.ok(measured.handledAtMs - measured.requestedAtMs >= 300);
});

test('from-start cancellation includes blocking validation before the first yield', async () => {
  async function executeInitialValidation(runtime) {
    assert.equal(runtime.isCancelled(), false);
    const until = performance.now() + 300;
    while (performance.now() < until) {
      /* Simulate synchronous input parsing before the executor's first yield. */
    }
    await runtime.yield();
    return {
      status: runtime.isCancelled() ? 'cancelled' : 'ready',
      qualified: false,
      executions: [],
      directions: [],
    };
  }
  const measured = await benchmark.cancellationFromStartProbe(
    'initial-validation-calibration',
    executeInitialValidation
  );
  assert.equal(measured.includesInitialValidation, true);
  assert.equal(measured.trigger, 'before-execution-call');
  assert.equal(measured.observedYields, 1);
  assert.equal(measured.noPartialOutput, true);
  assert.equal(measured.status, 'cancelled');
  assert.equal(measured.pass, false);
  assert.ok(measured.durationMs >= 300);
  assert.ok(measured.handledAtMs - measured.requestedAtMs >= 300);
});

test('from-start cancellation requires an actual handled event and rejects partial output', async () => {
  await assert.rejects(
    benchmark.cancellationFromStartProbe('unhandled', async () => ({
      status: 'cancelled',
      qualified: false,
      directions: [],
    })),
    /event was not handled/
  );
  for (const partial of [
    { directions: [{ id: 'partial' }] },
    { directions: [], ranking: { directions: [{ id: 'partial' }] } },
    { candidates: [], generation: { proposal: 'partial' } },
    { candidates: [], interactionAlternatives: { groups: ['partial'] } },
  ])
    await assert.rejects(
      benchmark.cancellationFromStartProbe('partial', async runtime => {
        await runtime.yield();
        return { status: 'cancelled', qualified: false, ...partial };
      }),
      assert.AssertionError
    );
});

test('artifact metadata identifies existing bytes without claiming rebuild or source freshness', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teul-artifact-metadata-test-'));
  try {
    fs.mkdirSync(path.join(root, 'dist'));
    const bytes = Buffer.from('existing artifact: é\u0000');
    fs.writeFileSync(path.join(root, 'dist/code.js'), bytes);
    const captured = benchmark.captureExistingDistributionArtifacts(root);
    assert.equal(captured.rebuiltForBenchmark, false);
    assert.equal(captured.sourceCurrent, 'not-verified');
    assert.deepEqual(captured.artifacts[0], {
      path: 'dist/code.js',
      status: 'present',
      sizeBytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
    assert.deepEqual(
      captured.artifacts.slice(1),
      ['dist/ui.html', 'figma-candidate/dist/code.js', 'figma-candidate/dist/ui.html'].map(
        file => ({ path: file, status: 'missing', sizeBytes: null, sha256: null })
      )
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('retained benchmark evidence is receipt-specific, hash-bound and never overwritten', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teul-benchmark-evidence-test-'));
  try {
    const receipt = path.join(root, 'attempt.json');
    const files = benchmark.reserveBenchmarkEvidence(receipt);
    const bundle = Buffer.from('module.exports={native:0.1234567890123456};\n');
    fs.writeFileSync(files.bundleFile, bundle, { flag: 'wx' });
    benchmark.writeJsonExclusive(files.payloadFile, { source: 'synthetic', request: [1, 2, 3] });
    const observed = benchmark.retainedFile(files.bundleFile, receipt);
    assert.deepEqual(observed, {
      path: 'attempt.json.artifacts/benchmark.cjs',
      sizeBytes: bundle.length,
      sha256: crypto.createHash('sha256').update(bundle).digest('hex'),
    });
    const originalInput = fs.readFileSync(files.payloadFile);
    assert.throws(() => benchmark.writeJsonExclusive(files.payloadFile, { changed: true }), {
      code: 'EEXIST',
    });
    assert.deepEqual(fs.readFileSync(files.payloadFile), originalInput);
    assert.throws(() => benchmark.reserveBenchmarkEvidence(receipt), { code: 'EEXIST' });
    assert.deepEqual(fs.readFileSync(files.bundleFile), bundle);
    benchmark.writeJsonExclusive(receipt, { retainedEvidence: observed });
    const originalReceipt = fs.readFileSync(receipt);
    assert.throws(() => benchmark.reserveBenchmarkEvidence(receipt), /new receipt path/);
    assert.throws(() => benchmark.writeJsonExclusive(receipt, { status: 'replacement' }), {
      code: 'EEXIST',
    });
    assert.deepEqual(fs.readFileSync(receipt), originalReceipt);
    const next = benchmark.reserveBenchmarkEvidence(path.join(root, 'attempt-next.json'));
    assert.notEqual(next.directory, files.directory);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the separate locked-hover probe reaches real fallback enumeration without changing the warm fixture', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teul-fallback-probe-test-'));
  try {
    const receipt = path.join(root, 'probe.json');
    const files = benchmark.reserveBenchmarkEvidence(receipt);
    const bundleFile = await benchmark.bundle(files.directory);
    assert.equal(bundleFile, files.bundleFile);
    const sourceManifest = JSON.parse(fs.readFileSync(files.sourceManifestFile, 'utf8'));
    for (const relative of [
      'src/lib/colorSystemAuthoringExecutionV1.ts',
      'src/lib/colorSystemInteractionStatesV1.ts',
      'src/lib/__tests__/fixtures/colorSystemAuthoringPerformanceV1Fixture.ts',
    ]) {
      const recorded = sourceManifest.files.find(file => file.path === relative);
      const bytes = fs.readFileSync(new URL(`../${relative}`, import.meta.url));
      assert.equal(recorded.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
      assert.equal(recorded.sizeBytes, bytes.length);
    }
    const api = require(bundleFile);
    // The original builder uses native transcendental math. Recreating its
    // source on another supported runtime can produce different exact values,
    // which correctly invalidates its frozen review. Replay the identical
    // Node22-prepared synthetic input on both runtimes instead; the measured
    // benchmark still uses the unchanged builder.
    const fixtureBytes = fs.readFileSync(
      new URL('./fixtures/color-system-authoring-cancellation-v1.json', import.meta.url)
    );
    assert.equal(
      crypto.createHash('sha256').update(fixtureBytes).digest('hex'),
      '33078acb2202d991479da6e8dc9adf92dc230496485d4bafbb8eef5a68b2aaca'
    );
    const prepared = JSON.parse(fixtureBytes);
    assert.equal(prepared.provenance.classification, 'public-synthetic');
    assert.equal(
      prepared.provenance.sourceFixtureSha256,
      sourceManifest.files.find(file => file.path === prepared.provenance.sourceFixturePath).sha256
    );
    assert.equal(
      prepared.provenance.workloadHash,
      api.fixture.COLOR_SYSTEM_AUTHORING_PERFORMANCE_V1_FREEZE.workloadHash
    );
    assert.equal(prepared.source.modelHash, prepared.provenance.sourceModelHash);
    assert.equal(
      api.hashing.deterministicContentHash(api.hashing.canonicalJson(prepared.direction)),
      prepared.provenance.directionHash
    );
    const { requirements, ...direction } = prepared.direction;
    const payload = {
      source: prepared.source,
      request: {
        requirements,
        directions: [direction],
      },
    };
    const before = JSON.stringify(payload);
    const input = benchmark.fallbackEnumerationInput(api, payload);
    const original = prepared.direction;
    assert.deepEqual(input.direction.generation, original.generation);
    assert.deepEqual(input.direction.interactionGroups, original.interactionGroups);
    assert.deepEqual(input.direction.units, original.units);
    assert.deepEqual(
      { ...input.direction.composition, requirementsHash: original.composition.requirementsHash },
      original.composition
    );
    assert.deepEqual(
      { ...input.direction.requirements, locks: input.direction.requirements.locks.slice(0, -1) },
      original.requirements
    );
    assert.deepEqual(input.direction.requirements.locks.at(-1), input.evidence.lock);
    assert.equal(input.evidence.lock.applicationId, 'controls:Day');
    assert.equal(input.evidence.lock.useId, 'action-hover');
    assert.equal(input.evidence.slotId, 'pin:6');
    assert.equal(input.evidence.preferredHoverSlotId, 'gap:4-5');
    benchmark.writeJsonExclusive(files.payloadFile, payload);
    benchmark.writeJsonExclusive(files.fallbackInputFile, input);
    const measured = await benchmark.fallbackEnumerationCancellationProbe(
      api,
      payload.source,
      input
    );
    assert.equal(measured.status, 'cancelled');
    assert.equal(measured.noPartialOutput, true);
    assert.ok(measured.observedMatchingYields >= 2);
    assert.match(measured.evidenceStack, /enumerateColorSystemAuthoredInteractionStatesV1/);
    assert.ok(measured.handledAtMs >= measured.requestedAtMs);
    assert.ok(measured.completedAtMs >= measured.handledAtMs);
    assert.equal(measured.targetMs, 250);
    assert.equal(JSON.stringify(payload), before);
    assert.equal(
      benchmark.retainedFile(files.fallbackInputFile, receipt).sha256,
      crypto.createHash('sha256').update(fs.readFileSync(files.fallbackInputFile)).digest('hex')
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
