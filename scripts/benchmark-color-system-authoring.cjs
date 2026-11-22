'use strict';

// Compile with the repository's existing Webpack/TypeScript toolchain, outside dist/.
// Preparation verifies the frozen synthetic source/witnesses. A fresh worker then
// measures real analysis; no prepared proposal, score, or working model replaces it.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { spawn, execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const RUNS = 30;
const WARMUPS = 3;
const P95_LIMIT_MS = 2000;
const CANCEL_LIMIT_MS = 250;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = filename => hash(fs.readFileSync(filename));
const timer = () => new Promise(resolve => setTimeout(resolve, 0));
const assert = require('node:assert/strict');

function writeJsonExclusive(filename, value) {
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}

function reserveBenchmarkEvidence(receiptFile) {
  fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
  if (fs.existsSync(receiptFile))
    throw new Error('Use a new receipt path; previous measurements are retained.');
  const directory = `${receiptFile}.artifacts`;
  // Exclusive directory creation also prevents two concurrent runs sharing one receipt path.
  fs.mkdirSync(directory);
  return {
    directory,
    bundleFile: path.join(directory, 'benchmark.cjs'),
    payloadFile: path.join(directory, 'input.json'),
    sourceManifestFile: path.join(directory, 'sources.json'),
    fallbackInputFile: path.join(directory, 'fallback-input.json'),
  };
}

function retainedFile(filename, receiptFile) {
  const bytes = fs.readFileSync(filename);
  return {
    path: path.relative(path.dirname(receiptFile), filename).split(path.sep).join('/'),
    sizeBytes: bytes.length,
    sha256: hash(bytes),
  };
}

function captureExistingDistributionArtifacts(root = ROOT) {
  return {
    rebuiltForBenchmark: false,
    sourceCurrent: 'not-verified',
    note: 'Existing files observed before measurement; this benchmark does not rebuild or qualify production or candidate artifacts.',
    artifacts: [
      'dist/code.js',
      'dist/ui.html',
      'figma-candidate/dist/code.js',
      'figma-candidate/dist/ui.html',
    ].map(relativePath => {
      try {
        const bytes = fs.readFileSync(path.join(root, relativePath));
        return {
          path: relativePath,
          status: 'present',
          sizeBytes: bytes.length,
          sha256: hash(bytes),
        };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return { path: relativePath, status: 'missing', sizeBytes: null, sha256: null };
      }
    }),
  };
}

async function bundle(directory) {
  const webpack = require('webpack');
  const entry = path.join(directory, 'entry.cjs');
  const exports = {
    fixture: 'src/lib/__tests__/fixtures/colorSystemAuthoringPerformanceV1Fixture.ts',
    run: 'src/lib/colorSystemAuthoringRunV1.ts',
    catalogFixture: 'src/lib/__tests__/fixtures/colorSystemCatalogAblationV1Fixture.ts',
    execute: 'src/lib/colorSystemAuthoringExecutionV1.ts',
    model: 'src/lib/colorSystemModelV1.ts',
    requirements: 'src/lib/colorSystemApplicationRequirementsV1.ts',
    hashing: 'src/lib/colorSystemHashing.ts',
  };
  fs.writeFileSync(
    entry,
    `module.exports={${Object.entries(exports)
      .map(([name, filename]) => `${name}:require(${JSON.stringify(path.join(ROOT, filename))})`)
      .join(',')}};\n`,
    { flag: 'wx' }
  );
  const compiler = webpack({
    mode: 'production',
    target: 'node',
    devtool: false,
    entry,
    output: { path: directory, filename: 'benchmark.cjs', library: { type: 'commonjs2' } },
    resolve: { extensions: ['.ts', '.tsx', '.js', '.json'] },
    resolveLoader: { modules: [path.join(ROOT, 'node_modules')] },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          loader: 'ts-loader',
          options: { transpileOnly: true, configFile: path.join(ROOT, 'tsconfig.json') },
        },
      ],
    },
    // Retain function names for independently inspectable cancellation phase stacks.
    // This is a Node source benchmark, not a claim about Figma-host timing.
    optimization: { minimize: false },
    performance: { hints: false },
  });
  await new Promise((resolve, reject) =>
    compiler.run((error, stats) =>
      compiler.close(() => {
        if (error) reject(error);
        else if (!stats || stats.hasErrors())
          reject(new Error(stats?.toString({ all: false, errors: true }) || 'No bundle stats'));
        else {
          try {
            const files = [...stats.compilation.fileDependencies]
              .map(filename => ({ filename, relativePath: path.relative(ROOT, filename) }))
              .filter(
                ({ relativePath }) =>
                  !path.isAbsolute(relativePath) &&
                  relativePath !== '..' &&
                  !relativePath.startsWith(`..${path.sep}`) &&
                  !relativePath.startsWith(`node_modules${path.sep}`)
              )
              .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
              .flatMap(({ filename, relativePath }) => {
                let bytes;
                try {
                  bytes = fs.readFileSync(filename);
                } catch (error) {
                  // Webpack's dependency set also includes resolution directories.
                  if (error.code === 'EISDIR') return [];
                  throw error;
                }
                return [
                  {
                    path: relativePath.split(path.sep).join('/'),
                    sizeBytes: bytes.length,
                    sha256: hash(bytes),
                  },
                ];
              });
            writeJsonExclusive(path.join(directory, 'sources.json'), {
              version: 'teul.authoring-benchmark-sources.v1',
              note: 'Repository dependency bytes observed after compilation; the retained bundle is the exact executable authority.',
              files,
              filesHash: hash(JSON.stringify(files)),
            });
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      })
    )
  );
  return path.join(directory, 'benchmark.cjs');
}

function verifyOutcome(result, payload) {
  assert.equal(result.status, 'ready');
  assert.equal(result.qualified, false);
  assert.equal(result.executions.length, 3);
  assert.equal(result.directions.length, 3);
  const applicable = new Set();
  for (const executed of result.executions) {
    assert.equal(executed.status, 'ready');
    assert.equal(executed.candidates.length, 1);
    assert.equal(executed.interactions.length, 4);
    assert.equal(executed.composition.solutions.length, 1);
    assert.equal(executed.composition.stopped, null);
    for (const [key, expected] of Object.entries({
      visitedNodes: 34,
      contrastRejectedNodes: 4,
      completeAssignments: 6,
      requirementsRejectedAssignments: 5,
    }))
      assert.equal(
        executed.composition.diagnostics[key],
        expected,
        `Frozen search work changed: ${key}`
      );
    for (const interaction of executed.interactions) {
      assert.equal(interaction.result.status, 'ready');
      assert.deepEqual(
        ['rest', 'hover', 'pressed'].map(
          state => interaction.result.selection.states[state].slotId
        ),
        ['pin:4', 'gap:4-5', 'gap:5-6']
      );
    }
    assert.deepEqual(
      executed.composition.solutions[0].choices
        .filter(choice => choice.groupId === 'complete-paint-profile')
        .map(choice => choice.optionId),
      ['profile:0']
    );
    const assessed = executed.candidates[0];
    assert.equal(assessed.eligible, true);
    assert.equal(assessed.applications.applications.length, 6);
    assert.equal(assessed.proposal.request.colors.length, 2);
    assert.deepEqual(
      assessed.proposal.workingModel.colors.filter(color =>
        payload.source.colors.some(source => source.id === color.id)
      ),
      payload.source.colors
    );
    for (const color of assessed.proposal.request.colors)
      for (const mode of ['Day', 'Night'])
        assert(
          assessed.applications.applications.some(
            a =>
              a.application.modeId === mode &&
              a.application.uses.some(use => use.colorId === color.id)
          )
        );
    for (const application of assessed.applications.applications)
      for (const rule of application.rules)
        if (rule.status === 'pass' && rule.satisfied === true) applicable.add(rule.ruleId);
  }
  assert.equal(applicable.size, 50);
}

function assertCancelledOutput(result) {
  assert.equal(result.status, 'cancelled');
  assert.equal(result.qualified, false);
  for (const key of ['executions', 'assessments', 'directions', 'candidates', 'interactions'])
    if (key in result) assert.deepEqual(result[key], []);
  for (const key of ['ranking', 'generation', 'composition', 'compositionRequest'])
    if (key in result) assert.equal(result[key], null);
  assert.equal('interactionAlternatives' in result, false);
}

async function cancellationFromStartProbe(name, execute) {
  let cancelled = false,
    handledAt = null,
    observedYields = 0;
  const evidenceStack = new Error('Cancellation queued before execution begins').stack || '';
  const requestedAt = performance.now();
  const pending = setTimeout(() => {
    cancelled = true;
    handledAt = performance.now();
  }, 0);
  let result, completedAt;
  try {
    // No await precedes execute: initial synchronous validation runs while the event is pending.
    result = await execute({
      isCancelled: () => cancelled,
      yield: async () => {
        observedYields++;
        await timer();
      },
    });
    completedAt = performance.now();
  } finally {
    clearTimeout(pending);
  }
  assert.notEqual(handledAt, null, 'The cancellation event was not handled during execution.');
  assertCancelledOutput(result);
  return {
    stage: name,
    trigger: 'before-execution-call',
    includesInitialValidation: true,
    observedYields,
    requestedAtMs: requestedAt,
    handledAtMs: handledAt,
    completedAtMs: completedAt,
    durationMs: completedAt - requestedAt,
    targetMs: CANCEL_LIMIT_MS,
    pass: completedAt - requestedAt <= CANCEL_LIMIT_MS,
    evidenceStack,
    status: result.status,
    noPartialOutput: true,
  };
}

async function cancellationProbe(name, execute, stackPattern, occurrence) {
  let cancelled = false,
    count = 0,
    requestedAt = null,
    handledAt = null,
    evidenceStack = null;
  const result = await execute({
    isCancelled: () => cancelled,
    yield: async () => {
      const stack = new Error().stack || '';
      if (stackPattern.test(stack) && ++count === occurrence) {
        // Resume this yield first, then queue the event and return immediately.
        // The caller's next CPU chunk runs in the Promise continuation before the
        // timer can be handled. Request-to-result latency therefore includes that
        // non-yielding work, rather than measuring only a cooperative boundary.
        await timer();
        requestedAt = performance.now();
        evidenceStack = stack;
        setTimeout(() => {
          cancelled = true;
          handledAt = performance.now();
        }, 0);
        return;
      }
      await timer();
    },
  });
  const completedAt = performance.now();
  assert.notEqual(requestedAt, null, `Cancellation stage not reached: ${name}`);
  assert.notEqual(handledAt, null, 'The cancellation event was not handled during execution.');
  assertCancelledOutput(result);
  return {
    stage: name,
    observedMatchingYields: count,
    requestedAtMs: requestedAt,
    handledAtMs: handledAt,
    completedAtMs: completedAt,
    durationMs: completedAt - requestedAt,
    targetMs: CANCEL_LIMIT_MS,
    pass: completedAt - requestedAt <= CANCEL_LIMIT_MS,
    evidenceStack,
    status: result.status,
    noPartialOutput: true,
  };
}

function fallbackEnumerationInput(api, payload) {
  const direction = structuredClone(payload.request.directions[0]);
  const group = direction.interactionGroups.find(
    item => item.request.role === 'selected' && item.request.modeId === 'Day'
  );
  assert(group, 'The frozen first direction must have its Day selected-state group.');
  const binding = group.bindings.find(item => item.selection === 'hover');
  assert(binding, 'The selected group must bind an actual hover use.');
  const scale = payload.source.scales.find(item => item.id === group.request.scales[0].scaleId);
  const slotId = 'pin:6';
  const slot = scale?.slots.find(item => item.id === slotId);
  const preferred = scale?.slots.find(
    item => item.id === group.request.scales[0].preferredSlotIds.hover
  );
  const anchor = scale?.modes
    .find(mode => mode.modeId === group.request.modeId)
    ?.anchors.find(item => item.slotId === slotId);
  assert(slot && preferred && slot.position > preferred.position && anchor);
  assert(group.request.scales[0].slotIds.includes(slotId));
  const lock = {
    applicationId: binding.applicationId,
    useId: binding.useId,
    colorId: anchor.colorId,
  };
  const requirements = structuredClone(payload.request.requirements);
  assert(
    !requirements.locks.some(
      item => item.applicationId === lock.applicationId && item.useId === lock.useId
    ),
    'The cancellation-only probe must not replace a frozen lock.'
  );
  requirements.locks.push(lock);
  direction.requirements = api.requirements.buildColorSystemApplicationRequirementsV1(requirements);
  const exactHash = value => api.hashing.deterministicContentHash(api.hashing.canonicalJson(value));
  const originalRequirementsHash = direction.composition.requirementsHash;
  direction.composition.requirementsHash = exactHash(direction.requirements);
  assert.notEqual(direction.composition.requirementsHash, originalRequirementsHash);
  return {
    direction,
    evidence: {
      purpose: 'cancellation-only; excluded from all cold/warm analysis samples',
      sourceModelHash: payload.source.modelHash,
      originalDirectionId: direction.id,
      originalRequirementsHash,
      requirementsHash: direction.composition.requirementsHash,
      lock,
      slotId,
      preferredHoverSlotId: group.request.scales[0].preferredSlotIds.hover,
      directionHash: exactHash(direction),
      retainedGenerationHash: exactHash(direction.generation),
    },
  };
}

async function fallbackEnumerationCancellationProbe(api, source, input) {
  return {
    ...(await cancellationProbe(
      'interaction-fallback-enumeration-after-first-chunk',
      runtime =>
        api.execute.executeColorSystemAuthoringDirectionV1(source, input.direction, runtime),
      /at enumerateColorSystemAuthoredInteractionStatesV1 /,
      2
    )),
    variant: input.evidence,
  };
}

async function worker(bundleFile, payloadFile, receiptFile) {
  const start = performance.now();
  const api = require(bundleFile);
  const moduleLoadMs = performance.now() - start;
  const setupStart = performance.now();
  const payload = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));
  api.model.parseColorSystemModelV1(payload.source);
  const validatedInputSetupMs = performance.now() - setupStart;
  const retainedEvidence = {
    bundle: retainedFile(bundleFile, receiptFile),
    input: retainedFile(payloadFile, receiptFile),
    sources: retainedFile(path.join(path.dirname(bundleFile), 'sources.json'), receiptFile),
  };
  const execute = runtime =>
    api.run.executeColorSystemAuthoringRunV1(payload.source, payload.request, runtime);
  const attempts = [];
  const warmups = [],
    samples = [],
    cancellations = [];
  let first = null;
  const timed = async () => {
    const started = performance.now();
    const result = await execute();
    const durationMs = performance.now() - started;
    const attempt = {
      durationMs,
      receiptHash: result.receipt.receiptHash,
      outputSha256: hash(JSON.stringify(result)),
      verified: false,
    };
    attempts.push(attempt);
    verifyOutcome(result, payload); // Outcome assertions are outside timing; all returned receipts are inside it.
    attempt.verified = true;
    return {
      durationMs,
      receiptHash: result.receipt.receiptHash,
      outputSha256: attempt.outputSha256,
    };
  };
  try {
    first = await timed();
    for (let index = 0; index < WARMUPS; index++) warmups.push(await timed());
    for (let index = 0; index < RUNS; index++) {
      samples.push(await timed());
      if ((index + 1) % 5 === 0)
        process.stdout.write(`Authoring benchmark: ${index + 1}/${RUNS} samples collected.\n`);
    }
    cancellations.push(
      await cancellationFromStartProbe('run-from-start-including-validation', execute)
    );
    for (const [stage, pattern, occurrence] of [
      ['construction-during-first-mode', /at Object\.construct /, 1],
      [
        'interaction-kernel-after-initial-setup',
        /at selectColorSystemAuthoredInteractionStatesV1 /,
        2,
      ],
      ['composition-after-search-start', /at visit /, 2],
      ['ranking-during-first-assessment', /at Object\.rankAsync /, 1],
    ])
      cancellations.push(await cancellationProbe(stage, execute, pattern, occurrence));
    const catalog = await api.catalogFixture.catalogAblationFixtureV1();
    cancellations.push(
      await cancellationProbe(
        'catalog-enumeration-after-first-chunk',
        runtime =>
          api.execute.executeColorSystemAuthoringDirectionV1(
            catalog.model,
            catalog.cases[0].direction,
            runtime
          ),
        /at buildColorSystemCatalogCandidatesV1 /,
        1
      )
    );
    const fallback = fallbackEnumerationInput(api, payload);
    const fallbackInputFile = path.join(path.dirname(bundleFile), 'fallback-input.json');
    writeJsonExclusive(fallbackInputFile, fallback);
    retainedEvidence.fallbackInput = retainedFile(fallbackInputFile, receiptFile);
    cancellations.push(await fallbackEnumerationCancellationProbe(api, payload.source, fallback));
    const values = samples.map(sample => sample.durationMs).sort((a, b) => a - b);
    const p95Ms = values[Math.ceil(RUNS * 0.95) - 1];
    const receipt = {
      ...payload.identity,
      version: 'teul.authoring-performance-receipt.v1',
      runtime: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        os: os.release(),
        cpu: os.cpus()[0]?.model,
        memoryBytes: os.totalmem(),
      },
      bundleSha256: fileHash(bundleFile),
      payloadSha256: fileHash(payloadFile),
      sourceModelHash: payload.source.modelHash,
      retainedEvidence,
      scheduler: 'default setTimeout(resolve, 0); custom same-timer cancellation probes only',
      timingBoundary:
        'validated source plus frozen three-direction input through recomputed generation, selectors, composition, complete source/working gates, final diversity ranking and receipts',
      cold: {
        moduleLoadMs,
        validatedInputSetupMs,
        firstAnalysis: first,
        note: 'Fresh worker; no generation or preparation in this process before the first analysis. Compilation and independent fixture/witness preparation excluded.',
      },
      warmups,
      samples,
      medianMs: (values[14] + values[15]) / 2,
      p95Ms,
      percentileMethod: 'nearest rank, sorted sample 29 of 30',
      targetP95Ms: P95_LIMIT_MS,
      cancellations,
      status: p95Ms <= P95_LIMIT_MS && cancellations.every(item => item.pass) ? 'pass' : 'fail',
      qualification: false,
      hostTimingObserved: false,
    };
    writeJsonExclusive(receiptFile, receipt);
    process.stdout.write(
      JSON.stringify(
        {
          status: receipt.status,
          p95Ms,
          medianMs: receipt.medianMs,
          maxCancellationMs: Math.max(...cancellations.map(item => item.durationMs)),
          receiptFile,
        },
        null,
        2
      ) + '\n'
    );
    if (receipt.status !== 'pass') process.exitCode = 1;
  } catch (error) {
    writeJsonExclusive(receiptFile, {
      ...payload.identity,
      version: 'teul.authoring-performance-receipt.v1',
      status: 'measurement-error',
      error: error instanceof Error ? error.message : String(error),
      runtime: process.version,
      bundleSha256: fileHash(bundleFile),
      payloadSha256: fileHash(payloadFile),
      sourceModelHash: payload.source.modelHash,
      retainedEvidence,
      cold: { moduleLoadMs, validatedInputSetupMs, firstAnalysis: first },
      warmups,
      samples,
      attempts,
      cancellations,
      qualification: false,
      hostTimingObserved: false,
      note: 'Incomplete measurement retained. No p95 or cancellation pass is claimed.',
    });
    throw error;
  }
}

async function main() {
  if (process.argv[2] === '--worker') return worker(...process.argv.slice(3));
  const supplied = process.env.TEUL_AUTHORING_BENCHMARK_RECEIPT_PATH;
  if (!supplied)
    throw new Error(
      'Set TEUL_AUTHORING_BENCHMARK_RECEIPT_PATH to retain the complete measurement receipt.'
    );
  const receipt = path.resolve(supplied);
  const evidence = reserveBenchmarkEvidence(receipt);
  const bundleFile = await bundle(evidence.directory);
  const api = require(bundleFile);
  const prepared = await api.fixture.prepareColorSystemAuthoringPerformanceV1Fixture();
  const first = prepared.directions[0].generation;
  assert.equal(first.kind, 'construction');
  const request = {
    version: 'teul.authoring-run.v1',
    id: prepared.manifest.version,
    requirements: prepared.requirements,
    brief: first.intent.brief,
    directions: prepared.directions.map(
      ({ requirements: _requirements, ...direction }) => direction
    ),
  };
  const payload = {
    source: prepared.source,
    request,
    identity: {
      workloadHash: prepared.workloadHash,
      workloadManifest: prepared.manifest,
      fixtureSha256: fileHash(
        path.join(ROOT, 'src/lib/__tests__/fixtures/colorSystemAuthoringPerformanceV1Fixture.ts')
      ),
      driverSha256: fileHash(__filename),
      existingDistributionArtifacts: captureExistingDistributionArtifacts(),
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
      workingTreeStatus: execFileSync('git', ['status', '--short'], {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim(),
      npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
      capturedAt: new Date().toISOString(),
    },
  };
  const payloadFile = evidence.payloadFile;
  writeJsonExclusive(payloadFile, payload);
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [__filename, '--worker', bundleFile, payloadFile, receipt],
      { cwd: ROOT, stdio: 'inherit' }
    );
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) process.exitCode = code ?? 1;
      resolve();
    });
  });
}
module.exports = {
  cancellationProbe,
  cancellationFromStartProbe,
  captureExistingDistributionArtifacts,
  reserveBenchmarkEvidence,
  retainedFile,
  writeJsonExclusive,
  fallbackEnumerationInput,
  fallbackEnumerationCancellationProbe,
  bundle,
  verifyOutcome,
};
if (require.main === module)
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
