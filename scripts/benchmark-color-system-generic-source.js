'use strict';

/* global require, __dirname, Buffer, process */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

require('./register-typescript');

const {
  inventoryColorSystemGenericSourceV2,
} = require('../src/backend/colorSystemGenericSourceInventoryV2.ts');

const ROOT = path.resolve(__dirname, '..');
const RECEIPT_PATH = path.join(
  ROOT,
  'release',
  'color-system-generic-source-benchmark-v2.json'
);
const BENCHMARK_VERSION = 'teul.generic-source-benchmark/v2.0.0';
const RUN_COUNT = 20;
const NORMAL_NODE_COUNT = 10_000;
const NORMAL_VARIABLE_COUNT = 2_000;
const NORMAL_STYLE_COUNT = 500;
const LARGE_NODE_COUNT = 100_000;
const RESOURCE_CAPACITY_OVERFLOW = 50_001;
const NORMAL_P95_LIMIT_MS = 3_000;
const LARGE_P95_LIMIT_MS = 10_000;
const MAX_POST_CANCEL_VISITS = 250;
const CAPTURED_AT = '2026-08-21T12:00:00.000Z';

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function fileHash(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  return fs.existsSync(absolutePath) ? sha256(fs.readFileSync(absolutePath)) : null;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 'null' : serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .filter(key => value[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function rounded(value) {
  return Math.round(value * 1_000) / 1_000;
}

function statusCounts(results) {
  const counts = Object.create(null);
  for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
  return counts;
}

function solid(red, green, blue, extras = {}) {
  return {
    type: 'SOLID',
    color: { r: red, g: green, b: blue },
    ...extras,
  };
}

function createBenchmarkHost({ nodeCount, variableCount, styleCount, sparseVariableCount = 0 }) {
  let mutationCalls = 0;
  let yieldCalls = 0;
  let latestVisited = 0;
  let cancelAfterYield = Number.POSITIVE_INFINITY;
  let cancelled = false;
  let cancelObservedAtVisited = null;

  const recordMutation = () => {
    mutationCalls += 1;
  };
  const usagePaint = solid(0.2, 0.4, 0.6);
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index}`,
    name: `Node ${index}`,
    type: 'RECTANGLE',
    fills: [usagePaint],
    strokes: [],
    fillStyleId: '',
    strokeStyleId: '',
    opacity: 1,
    blendMode: 'NORMAL',
    visible: true,
    parent: null,
    remove: recordMutation,
    setPluginData: recordMutation,
    setSharedPluginData: recordMutation,
  }));
  const page = {
    id: 'page-benchmark',
    name: 'Benchmark page',
    type: 'PAGE',
    children: nodes,
    selection: [],
    parent: null,
    appendChild: recordMutation,
    setPluginData: recordMutation,
  };
  for (const node of nodes) node.parent = page;
  const root = {
    id: 'document-benchmark',
    name: 'Generic source benchmark',
    type: 'DOCUMENT',
    children: [page],
    appendChild: recordMutation,
    setPluginData: recordMutation,
  };
  page.parent = root;

  const collection = {
    id: 'collection-benchmark',
    name: 'Benchmark colors',
    defaultModeId: 'mode-default',
    modes: [{ modeId: 'mode-default', name: 'Default' }],
  };
  const variables = sparseVariableCount > 0
    ? new Array(sparseVariableCount)
    : Array.from({ length: variableCount }, (_, index) => ({
        id: `variable-${index}`,
        key: `variable-key-${index}`,
        name: `Color/${index}`,
        description: '',
        resolvedType: 'COLOR',
        variableCollectionId: collection.id,
        scopes: ['ALL_FILLS'],
        valuesByMode: {
          'mode-default': {
            r: (index % 251) / 250,
            g: (index % 127) / 126,
            b: (index % 61) / 60,
            a: 1,
          },
        },
      }));
  const styles = Array.from({ length: styleCount }, (_, index) => ({
    id: `style-${index}`,
    key: `style-key-${index}`,
    name: `Style/${index}`,
    description: '',
    paints: [solid((index % 251) / 250, (index % 127) / 126, (index % 61) / 60)],
  }));

  const getLocalVariablesAsync = async () => variables;
  const getLocalVariableCollectionsAsync = async () =>
    sparseVariableCount > 0 || variableCount > 0 ? [collection] : [];
  const getVariableByIdAsync = async id =>
    sparseVariableCount > 0 ? null : variables.find(variable => variable.id === id) ?? null;

  class PrototypeBackedBenchmarkHost {
    constructor() {
      this.root = root;
      this.currentPage = page;
      this.variables = {
        getLocalVariablesAsync,
        getLocalVariableCollectionsAsync,
        getVariableByIdAsync,
        createVariable: recordMutation,
        createVariableCollection: recordMutation,
        importVariableByKeyAsync: recordMutation,
      };
    }

    async getLocalPaintStylesAsync() {
      return styles;
    }

    async getNodeByIdAsync(id) {
      yieldCalls += 1;
      if (yieldCalls >= cancelAfterYield && !cancelled) {
        cancelled = true;
        cancelObservedAtVisited = latestVisited;
      }
      return id === root.id ? root : null;
    }

    async loadAllPagesAsync() {}

    createPaintStyle() {
      recordMutation();
    }
  }

  const host = new PrototypeBackedBenchmarkHost();
  return {
    host,
    onProgress(progress) {
      if (progress.phase === 'usage') latestVisited = progress.completed;
    },
    isCancelled() {
      return cancelled;
    },
    cancelOnYield(number) {
      cancelAfterYield = number;
    },
    reset() {
      yieldCalls = 0;
      latestVisited = 0;
      cancelAfterYield = Number.POSITIVE_INFINITY;
      cancelled = false;
      cancelObservedAtVisited = null;
    },
    receipt() {
      return {
        mutationCalls,
        yieldCalls,
        latestVisited,
        cancelObservedAtVisited,
      };
    },
  };
}

function options(instrumentation) {
  return {
    usageScope: 'current-page',
    documentProfile: 'srgb',
    sourceLocator: 'figma://synthetic-generic-source-benchmark',
    authorization: { status: 'user-authorized' },
    includeEnabledLibraryDescriptors: false,
    confirmWholeFile: false,
    capturedAt: CAPTURED_AT,
    onProgress: progress => instrumentation.onProgress(progress),
    isCancelled: () => instrumentation.isCancelled(),
  };
}

async function runOnce(instrumentation) {
  const started = performance.now();
  const result = await inventoryColorSystemGenericSourceV2(
    instrumentation.host,
    options(instrumentation)
  );
  const durationMs = performance.now() - started;
  const instrument = instrumentation.receipt();
  return {
    status: result.status,
    durationMs,
    scannedNodeCount: result.snapshot?.scannedNodeCount ?? 0,
    snapshotBytes: result.snapshot
      ? Buffer.byteLength(JSON.stringify(result.snapshot), 'utf8')
      : 0,
    sourceSnapshotHash: result.snapshot?.sourceSnapshotHash ?? null,
    message: result.message,
    ...instrument,
  };
}

async function benchmarkFixture(instrumentation, runs) {
  instrumentation.reset();
  await runOnce(instrumentation);
  const results = [];
  for (let index = 0; index < runs; index += 1) {
    instrumentation.reset();
    results.push(await runOnce(instrumentation));
  }
  const durations = results.map(result => result.durationMs);
  return {
    runCount: runs,
    durationsMs: durations.map(rounded),
    p95Ms: rounded(percentile95(durations)),
    maxMs: rounded(Math.max(...durations)),
    statuses: statusCounts(results),
    scannedNodeCounts: [...new Set(results.map(result => result.scannedNodeCount))],
    yieldCounts: [...new Set(results.map(result => result.yieldCalls))],
    maxSnapshotBytes: Math.max(...results.map(result => result.snapshotBytes)),
    sourceSnapshotHashes: [...new Set(results.map(result => result.sourceSnapshotHash))],
  };
}

function implementationHash() {
  const files = [
    'src/backend/colorSystemAuditInventory.ts',
    'src/backend/colorSystemGenericSourceInventoryV2.ts',
    'src/lib/colorSystemGenericSourceAdapterV2.ts',
  ];
  return sha256(
    files
      .map(relativePath => `${relativePath}\n${fs.readFileSync(path.join(ROOT, relativePath), 'utf8')}`)
      .join('\n')
  );
}

async function main() {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const normal = createBenchmarkHost({
    nodeCount: NORMAL_NODE_COUNT,
    variableCount: NORMAL_VARIABLE_COUNT,
    styleCount: NORMAL_STYLE_COUNT,
  });
  const large = createBenchmarkHost({
    nodeCount: LARGE_NODE_COUNT,
    variableCount: 0,
    styleCount: 0,
  });

  const normalResults = await benchmarkFixture(normal, RUN_COUNT);
  const largeResults = await benchmarkFixture(large, RUN_COUNT);

  const cancellation = createBenchmarkHost({
    nodeCount: LARGE_NODE_COUNT,
    variableCount: 0,
    styleCount: 0,
  });
  cancellation.cancelOnYield(1);
  const cancelled = await runOnce(cancellation);
  const postCancelVisits = Math.max(
    0,
    cancelled.scannedNodeCount - (cancelled.cancelObservedAtVisited ?? cancelled.scannedNodeCount)
  );
  cancellation.reset();
  const retry = await runOnce(cancellation);

  const capacity = createBenchmarkHost({
    nodeCount: 0,
    variableCount: 0,
    styleCount: 0,
    sparseVariableCount: RESOURCE_CAPACITY_OVERFLOW,
  });
  const capacityResult = await runOnce(capacity);

  const gates = {
    normalReady:
      normalResults.statuses.ready === RUN_COUNT &&
      normalResults.scannedNodeCounts.length === 1 &&
      normalResults.scannedNodeCounts[0] === NORMAL_NODE_COUNT,
    normalP95: normalResults.p95Ms <= NORMAL_P95_LIMIT_MS,
    largeReadyOrCapacity:
      largeResults.statuses.ready === RUN_COUNT || largeResults.statuses.capacity === RUN_COUNT,
    largeP95: largeResults.p95Ms <= LARGE_P95_LIMIT_MS,
    cancellation:
      cancelled.status === 'cancelled' && postCancelVisits <= MAX_POST_CANCEL_VISITS,
    retry: retry.status === 'ready' && retry.scannedNodeCount === LARGE_NODE_COUNT,
    resourceCapacity: capacityResult.status === 'capacity',
    zeroMutation:
      normal.receipt().mutationCalls === 0 &&
      large.receipt().mutationCalls === 0 &&
      cancellation.receipt().mutationCalls === 0 &&
      capacity.receipt().mutationCalls === 0,
  };
  const pass = Object.values(gates).every(Boolean);
  const corpusDefinition = {
    normal: {
      nodes: NORMAL_NODE_COUNT,
      variables: NORMAL_VARIABLE_COUNT,
      styles: NORMAL_STYLE_COUNT,
      modes: 1,
    },
    large: { nodes: LARGE_NODE_COUNT, variables: 0, styles: 0 },
    capacity: { localVariables: RESOURCE_CAPACITY_OVERFLOW },
    cancellation: { nodes: LARGE_NODE_COUNT, cancelAfterYield: 1 },
  };
  const receipt = {
    schemaVersion: 'teul.color-system.generic-source-benchmark-receipt.v2',
    benchmarkVersion: BENCHMARK_VERSION,
    status: pass ? 'pass' : 'fail',
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: rounded(performance.now() - started),
    authority: 'synthetic-local-engineering-evidence',
    releaseBoundary: {
      localAdapterPerformance: 'measured',
      liveFigmaPerformance: 'pending',
      assistiveTechnology: 'not-assessed',
      domainExpertJudgment: 'not-assessed',
      ownerAcceptance: 'not-assessed',
      publication: 'not-performed',
    },
    environment: {
      platform: process.platform,
      architecture: process.arch,
      osRelease: os.release(),
      node: process.version,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      figmaRuntime: 'synthetic-host; live Figma Desktop pending',
    },
    thresholds: {
      runCount: RUN_COUNT,
      normalP95Ms: NORMAL_P95_LIMIT_MS,
      largeP95Ms: LARGE_P95_LIMIT_MS,
      maxPostCancelVisits: MAX_POST_CANCEL_VISITS,
      resourceCapacity: 50_000,
      evidenceRegistryBytes: 16 * 1024 * 1024,
    },
    corpus: corpusDefinition,
    hashes: {
      corpusDefinitionHash: sha256(canonicalJson(corpusDefinition)),
      corpusManifestHash: fileHash('fixtures/color-builder/generic-source-v2/manifest.json'),
      implementationHash: implementationHash(),
      benchmarkScriptHash: fileHash('scripts/benchmark-color-system-generic-source.js'),
      packageLockHash: fileHash('package-lock.json'),
      productionCodeBundleHash: fileHash('dist/code.js'),
    },
    results: {
      normal10k2k500: normalResults,
      large100k: largeResults,
      cancellation100k: {
        ...cancelled,
        postCancelVisits,
        persistedHandoff: false,
        persistedConfirmation: false,
      },
      retry100k: retry,
      resourceCapacity: capacityResult,
    },
    gates,
  };

  fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
  fs.writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${pass ? 'PASS' : 'FAIL'} ${BENCHMARK_VERSION}\n` +
      `10k+2k+500 p95 ${normalResults.p95Ms} ms; 100k p95 ${largeResults.p95Ms} ms; ` +
      `cancel additional visits ${postCancelVisits}; receipt ${path.relative(ROOT, RECEIPT_PATH)}\n`
  );
  if (!pass) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
