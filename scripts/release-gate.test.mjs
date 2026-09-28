import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EVIDENCE_DIRECTORY,
  RECEIPT_ARTIFACTS,
  RECEIPT_SCHEMA_VERSION,
  RELEASE_GATE_STEPS,
  receiptDirectoryName,
  renderReceiptMarkdown,
  runReleaseGate,
} from './release-gate.mjs';

const ENVIRONMENT = {
  node: 'v22.23.1',
  npm: '10.9.8',
  platform: 'darwin',
  arch: 'arm64',
  commit: 'abc1234abc1234abc1234abc1234abc1234abc12',
  shortCommit: 'abc1234',
  branch: 'test-branch',
  dirty: false,
  packageVersion: '1.0.0',
};

function makeRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teul-release-gate-test-'));
  mkdirSync(path.join(root, 'dist'), { recursive: true });
  mkdirSync(path.join(root, 'figma-candidate', 'dist'), { recursive: true });
  writeFileSync(path.join(root, 'dist', 'code.js'), 'console.log("code");\n');
  writeFileSync(path.join(root, 'dist', 'ui.html'), '<html></html>\n');
  writeFileSync(
    path.join(root, 'dist', 'GENERIC_COLOR_BUILDER_CHANNEL.json'),
    JSON.stringify({ channel: 'disabled', qualified: false })
  );
  writeFileSync(
    path.join(root, 'figma-candidate', 'dist', 'code.js'),
    'console.log("candidate");\n'
  );
  return root;
}

function clock(startMs = Date.UTC(2026, 8, 7, 13, 45, 12)) {
  let current = startMs;
  return () => {
    const value = new Date(current);
    current += 1500;
    return value;
  };
}

test('the step list matches the former workflow order and excludes report:bundle', () => {
  assert.deepEqual(
    RELEASE_GATE_STEPS.map(step => step.script),
    [
      'audit',
      'lint',
      'typecheck',
      'test:coverage',
      'build',
      'check:ui-bundle',
      'test:production-ui',
      'report:dead-code',
      'verify:wada',
      'verify:color-foundations',
      'assert:artifacts',
      'verify:generic-sanitization',
      'build:generic-candidate',
      'check:generic-candidate-ui-bundle',
      'test:generic-candidate-ui',
      'assert:generic-candidate-artifacts',
      'verify:generic-source-benchmark',
    ]
  );
  assert.equal(
    RELEASE_GATE_STEPS.some(step => step.script === 'report:bundle'),
    false
  );
  assert.equal(EVIDENCE_DIRECTORY, 'docs/evidence/gates');
});

test('receipt directories are UTC timestamp plus short sha, filesystem safe', () => {
  assert.equal(
    receiptDirectoryName('2026-09-07T13:45:12.123Z', 'abc1234'),
    '2026-09-07T13-45-12Z-abc1234'
  );
  assert.equal(
    receiptDirectoryName('2026-09-07T13:45:12.000Z', null),
    '2026-09-07T13-45-12Z-unknown'
  );
});

test('a passing run writes a JSON and Markdown receipt with hashes and sizes', () => {
  const root = makeRoot();
  const executed = [];
  try {
    const result = runReleaseGate({
      rootDir: root,
      environment: ENVIRONMENT,
      now: clock(),
      log: () => undefined,
      runner: script => {
        executed.push(script);
        return 0;
      },
    });

    assert.equal(result.status, 'passed');
    assert.equal(result.exitCode, 0);
    assert.deepEqual(
      executed,
      RELEASE_GATE_STEPS.map(step => step.script)
    );

    const receipt = JSON.parse(readFileSync(path.join(root, result.written.jsonPath), 'utf8'));
    assert.equal(receipt.schemaVersion, RECEIPT_SCHEMA_VERSION);
    assert.equal(receipt.status, 'passed');
    assert.equal(receipt.environment.node, 'v22.23.1');
    assert.ok(receipt.steps.every(step => step.status === 'passed' && step.durationMs === 1500));
    assert.equal(receipt.durationMs, RELEASE_GATE_STEPS.length * 3000 + 1500);
    // 17 steps × 3 s of fake clock + 1.5 s = 52.5 s after the 13:45:12 start.
    assert.equal(receipt.finishedAt, '2026-09-07T13:46:04.500Z');
    assert.match(result.written.directory, /^docs\/evidence\/gates\/2026-09-07T13-46-04Z-abc1234$/);

    const code = readFileSync(path.join(root, 'dist', 'code.js'));
    const codeArtifact = receipt.artifacts.find(artifact => artifact.path === 'dist/code.js');
    assert.equal(codeArtifact.bytes, code.length);
    assert.equal(codeArtifact.sha256, crypto.createHash('sha256').update(code).digest('hex'));
    assert.deepEqual(
      receipt.artifacts.map(artifact => artifact.path),
      [...RECEIPT_ARTIFACTS]
    );
    assert.deepEqual(
      receipt.artifacts.find(artifact => artifact.path === 'figma-candidate/dist/ui.html'),
      { path: 'figma-candidate/dist/ui.html', present: false }
    );
    assert.deepEqual(receipt.channels[0], {
      path: 'dist/GENERIC_COLOR_BUILDER_CHANNEL.json',
      present: true,
      channel: 'disabled',
      qualified: false,
    });

    const markdown = readFileSync(path.join(root, result.written.markdownPath), 'utf8');
    assert.match(markdown, /^# Release gate receipt/);
    assert.match(markdown, /Status: \*\*PASSED\*\* \(17 of 17 steps passed\)/);
    assert.match(markdown, /Node v22\.23\.1, npm 10\.9\.8, darwin arm64/);
    assert.match(markdown, /1\. PASSED `npm run audit`/);
    assert.match(markdown, /`dist\/code\.js`: 21 bytes, SHA-256 `[0-9a-f]{64}`/);
    assert.match(markdown, /`figma-candidate\/dist\/ui\.html`: not present/);
    assert.match(markdown, /channel `disabled`, qualified `false`/);
    assert.ok(markdown.endsWith('\n'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the gate stops at the first failure, skips the rest, and still writes the receipt', () => {
  const root = makeRoot();
  const executed = [];
  try {
    const result = runReleaseGate({
      rootDir: root,
      environment: { ...ENVIRONMENT, dirty: true },
      now: clock(),
      log: () => undefined,
      runner: script => {
        executed.push(script);
        return script === 'typecheck' ? 2 : 0;
      },
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.exitCode, 1);
    assert.deepEqual(executed, ['audit', 'lint', 'typecheck']);

    const receipt = JSON.parse(readFileSync(path.join(root, result.written.jsonPath), 'utf8'));
    assert.deepEqual(
      receipt.steps.slice(0, 4).map(step => [step.script, step.status, step.exitCode]),
      [
        ['audit', 'passed', 0],
        ['lint', 'passed', 0],
        ['typecheck', 'failed', 2],
        ['test:coverage', 'skipped', null],
      ]
    );
    assert.equal(receipt.steps.filter(step => step.status === 'skipped').length, 14);

    const markdown = readFileSync(path.join(root, result.written.markdownPath), 'utf8');
    assert.match(markdown, /Status: \*\*FAILED\*\* \(2 of 17 steps passed\)/);
    assert.match(markdown, /3\. FAILED `npm run typecheck`/);
    assert.match(markdown, /4\. SKIPPED `npm run test:coverage` \(not run\)/);
    assert.match(markdown, /worktree has uncommitted changes/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dry run lists every step without executing or writing anything', () => {
  const root = makeRoot();
  const output = [];
  try {
    const result = runReleaseGate({
      rootDir: root,
      dryRun: true,
      environment: ENVIRONMENT,
      log: line => output.push(line),
      runner: () => {
        throw new Error('runner must not be called in a dry run');
      },
    });
    assert.equal(result.status, 'dry-run');
    assert.equal(result.exitCode, 0);
    assert.equal(result.receipt, null);
    assert.equal(existsSync(path.join(root, EVIDENCE_DIRECTORY)), false);
    const text = output.join('\n');
    for (const step of RELEASE_GATE_STEPS) assert.ok(text.includes(`npm run ${step.script}`));
    assert.match(text, /17 steps in order/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('markdown rendering tolerates unknown environment fields', () => {
  const markdown = renderReceiptMarkdown({
    status: 'passed',
    command: 'npm run release-gate',
    startedAt: '2026-09-07T13:45:12.000Z',
    finishedAt: '2026-09-07T13:45:13.000Z',
    durationMs: 1000,
    environment: {
      ...ENVIRONMENT,
      commit: null,
      shortCommit: null,
      branch: null,
      npm: null,
      dirty: null,
    },
    steps: [],
    artifacts: [],
    channels: [
      { path: 'dist/GENERIC_COLOR_BUILDER_CHANNEL.json', present: true, error: 'bad json' },
    ],
  });
  assert.match(markdown, /Commit: `unknown` \(`unknown`\), branch `unknown`, worktree unknown/);
  assert.match(markdown, /npm unknown/);
  assert.match(markdown, /unreadable \(bad json\)/);
});
