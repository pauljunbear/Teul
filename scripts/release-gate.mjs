#!/usr/bin/env node

/**
 * Local release gate.
 *
 * Runs the verification steps that used to live in the GitHub Actions
 * workflow, in the same order, stops at the first failure, and writes a
 * receipt (JSON + Markdown) under docs/evidence/gates/<UTC timestamp>-<short sha>/.
 * The gate is meant to be run on Node 22 and on Node 24; each run writes its
 * own receipt and the receipts are committed. `--dry-run` lists the steps.
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export const RECEIPT_SCHEMA_VERSION = 'teul.release-gate.receipt.v1';
export const EVIDENCE_DIRECTORY = 'docs/evidence/gates';

export const RELEASE_GATE_STEPS = Object.freeze([
  { script: 'audit', purpose: 'Fail-closed dependency policy for the root and prototype graphs' },
  { script: 'lint', purpose: 'ESLint with zero warnings allowed' },
  { script: 'typecheck', purpose: 'TypeScript without emit' },
  { script: 'test:coverage', purpose: 'Vitest suite with coverage thresholds' },
  { script: 'build', purpose: 'Production plugin bundle (generic channel disabled)' },
  { script: 'check:ui-bundle', purpose: 'Inline UI bundle budget' },
  { script: 'test:production-ui', purpose: 'Production UI smoke test against dist/' },
  { script: 'report:dead-code', purpose: 'Exports without a production reference' },
  { script: 'verify:wada', purpose: 'Pinned Wada corpus matches upstream' },
  { script: 'verify:color-foundations', purpose: 'Color-foundation evidence ledger is current' },
  { script: 'assert:artifacts', purpose: 'Production artifacts, manifests, and licenses' },
  { script: 'verify:generic-sanitization', purpose: 'No rejected private identifier in the tree' },
  { script: 'build:generic-candidate', purpose: 'Candidate bundle (generic channel candidate)' },
  { script: 'check:generic-candidate-ui-bundle', purpose: 'Candidate UI bundle budget' },
  { script: 'test:generic-candidate-ui', purpose: 'Candidate UI smoke test' },
  { script: 'assert:generic-candidate-artifacts', purpose: 'Candidate artifacts and manifest' },
  { script: 'verify:generic-source-benchmark', purpose: 'Bounded generic source benchmark' },
]);

export const RECEIPT_ARTIFACTS = Object.freeze([
  'dist/code.js',
  'dist/ui.html',
  'figma-candidate/dist/code.js',
  'figma-candidate/dist/ui.html',
]);

export const RECEIPT_CHANNEL_FILES = Object.freeze([
  'dist/GENERIC_COLOR_BUILDER_CHANNEL.json',
  'figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json',
]);

function commandOutput(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

export function collectEnvironment(rootDir = ROOT) {
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const porcelain = commandOutput('git', ['status', '--porcelain'], rootDir);
  return {
    node: process.version,
    npm: commandOutput('npm', ['--version'], rootDir),
    platform: process.platform,
    arch: process.arch,
    commit: commandOutput('git', ['rev-parse', 'HEAD'], rootDir),
    shortCommit: commandOutput('git', ['rev-parse', '--short', 'HEAD'], rootDir),
    branch: commandOutput('git', ['rev-parse', '--abbrev-ref', 'HEAD'], rootDir),
    dirty: porcelain === null ? null : porcelain.length > 0,
    packageVersion: packageMetadata.version,
  };
}

export function describeArtifact(rootDir, relativePath) {
  const absolute = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolute)) return { path: relativePath, present: false };
  const buffer = fs.readFileSync(absolute);
  return {
    path: relativePath,
    present: true,
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

export function readChannel(rootDir, relativePath) {
  const absolute = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolute)) return { path: relativePath, present: false };
  try {
    const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    return {
      path: relativePath,
      present: true,
      channel: parsed.channel,
      qualified: parsed.qualified,
    };
  } catch (error) {
    return {
      path: relativePath,
      present: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function receiptDirectoryName(finishedAtIso, shortCommit) {
  const stamp = finishedAtIso.replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
  return `${stamp}-${shortCommit || 'unknown'}`;
}

export function buildReceipt({ environment, steps, artifacts, channels, startedAt, finishedAt }) {
  const failed = steps.some(step => step.status === 'failed');
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    status: failed ? 'failed' : 'passed',
    command: 'npm run release-gate',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    environment,
    steps,
    artifacts,
    channels,
  };
}

function formatDuration(durationMs) {
  if (durationMs < 1000) return `${durationMs} ms`;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
}

export function renderReceiptMarkdown(receipt) {
  const { environment } = receipt;
  const passed = receipt.steps.filter(step => step.status === 'passed').length;
  const worktree =
    environment.dirty === null
      ? 'unknown'
      : environment.dirty
        ? 'has uncommitted changes'
        : 'clean';
  const lines = [
    '# Release gate receipt',
    '',
    `- Status: **${receipt.status.toUpperCase()}** (${passed} of ${receipt.steps.length} steps passed)`,
    `- Command: \`${receipt.command}\``,
    `- Started: ${receipt.startedAt}`,
    `- Finished: ${receipt.finishedAt} (${formatDuration(receipt.durationMs)})`,
    `- Commit: \`${environment.commit ?? 'unknown'}\` (\`${environment.shortCommit ?? 'unknown'}\`), branch \`${environment.branch ?? 'unknown'}\`, worktree ${worktree}`,
    `- Runtime: Node ${environment.node}, npm ${environment.npm ?? 'unknown'}, ${environment.platform} ${environment.arch}`,
    `- Package version: ${environment.packageVersion}`,
    '',
    '## Steps',
    '',
  ];
  receipt.steps.forEach((step, index) => {
    const duration = step.status === 'skipped' ? 'not run' : formatDuration(step.durationMs);
    lines.push(
      `${index + 1}. ${step.status.toUpperCase()} \`${step.command}\` (${duration}) — ${step.purpose}`
    );
  });
  lines.push('', '## Artifacts', '');
  for (const artifact of receipt.artifacts) {
    lines.push(
      artifact.present
        ? `- \`${artifact.path}\`: ${artifact.bytes.toLocaleString('en-US')} bytes, SHA-256 \`${artifact.sha256}\``
        : `- \`${artifact.path}\`: not present`
    );
  }
  lines.push('', '## Generic color builder channels', '');
  for (const channel of receipt.channels) {
    if (!channel.present) {
      lines.push(`- \`${channel.path}\`: not present`);
    } else if (channel.error) {
      lines.push(`- \`${channel.path}\`: unreadable (${channel.error})`);
    } else {
      lines.push(
        `- \`${channel.path}\`: channel \`${channel.channel}\`, qualified \`${String(channel.qualified)}\``
      );
    }
  }
  lines.push(
    '',
    'Reproduce with `npm run release-gate` on Node 22 and again on Node 24; commit both receipts.',
    ''
  );
  return lines.join('\n');
}

export function writeReceipt(receipt, { rootDir = ROOT, evidenceDir = EVIDENCE_DIRECTORY } = {}) {
  const directoryName = receiptDirectoryName(receipt.finishedAt, receipt.environment.shortCommit);
  const directory = path.join(rootDir, evidenceDir, directoryName);
  fs.mkdirSync(directory, { recursive: true });
  const jsonPath = path.join(directory, 'receipt.json');
  const markdownPath = path.join(directory, 'receipt.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderReceiptMarkdown(receipt));
  return {
    directory: path.relative(rootDir, directory),
    jsonPath: path.relative(rootDir, jsonPath),
    markdownPath: path.relative(rootDir, markdownPath),
  };
}

function runNpmScript(script, cwd) {
  const result = spawnSync('npm', ['run', script], { cwd, stdio: 'inherit' });
  if (result.error) {
    console.error(`[release-gate] could not start npm run ${script}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

export function listSteps(steps = RELEASE_GATE_STEPS, log = console.log) {
  log(`Release gate: ${steps.length} steps in order (dry run, nothing executed).`);
  steps.forEach((step, index) => {
    log(`${String(index + 1).padStart(2, ' ')}. npm run ${step.script} — ${step.purpose}`);
  });
  log(
    `Receipts are written under ${EVIDENCE_DIRECTORY}/<UTC timestamp>-<short sha>/ on a real run.`
  );
}

export function runReleaseGate({
  rootDir = ROOT,
  steps = RELEASE_GATE_STEPS,
  dryRun = false,
  evidenceDir = EVIDENCE_DIRECTORY,
  runner = runNpmScript,
  environment,
  now = () => new Date(),
  log = console.log,
} = {}) {
  if (dryRun) {
    listSteps(steps, log);
    return { status: 'dry-run', exitCode: 0, receipt: null, written: null };
  }

  const resolvedEnvironment = environment ?? collectEnvironment(rootDir);
  const startedAt = now();
  const results = [];
  let failed = false;

  for (const step of steps) {
    const command = `npm run ${step.script}`;
    if (failed) {
      results.push({ ...step, command, status: 'skipped', exitCode: null, durationMs: 0 });
      continue;
    }
    log(`\n[release-gate] ${command}`);
    const stepStart = now();
    const exitCode = runner(step.script, rootDir);
    const durationMs = now().getTime() - stepStart.getTime();
    const status = exitCode === 0 ? 'passed' : 'failed';
    results.push({ ...step, command, status, exitCode, durationMs });
    if (exitCode !== 0) {
      failed = true;
      log(`[release-gate] ${command} failed with exit code ${exitCode}; stopping.`);
    }
  }

  const finishedAt = now();
  const receipt = buildReceipt({
    environment: resolvedEnvironment,
    steps: results,
    artifacts: RECEIPT_ARTIFACTS.map(artifact => describeArtifact(rootDir, artifact)),
    channels: RECEIPT_CHANNEL_FILES.map(channel => readChannel(rootDir, channel)),
    startedAt,
    finishedAt,
  });
  const written = writeReceipt(receipt, { rootDir, evidenceDir });
  log(
    `\n[release-gate] ${receipt.status.toUpperCase()} in ${formatDuration(receipt.durationMs)} on Node ${resolvedEnvironment.node}; receipt: ${written.markdownPath}`
  );
  return { status: receipt.status, exitCode: failed ? 1 : 0, receipt, written };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  const result = runReleaseGate({ dryRun });
  process.exitCode = result.exitCode;
}
