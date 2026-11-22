#!/usr/bin/env node

// One local path for both shipping surfaces. The existing plugin gate retains
// its own checks and receipts; Studio checks run against this run's build.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectEnvironment, describeArtifact, receiptDirectoryName } from './release-gate.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const LOCAL_GATE_STEPS = Object.freeze([
  { scope: 'plugin', script: 'test:scripts' },
  { scope: 'plugin', script: 'release-gate' },
  { scope: 'studio', script: 'audit' },
  { scope: 'studio', script: 'lint' },
  { scope: 'studio', script: 'test' },
  { scope: 'studio', script: 'build' },
  { scope: 'studio', script: 'test:browser', server: 'preview' },
  { scope: 'studio', script: 'test:feedback', server: 'preview' },
  { scope: 'studio', script: 'test:authoring', server: 'preview' },
  { scope: 'studio', script: 'test:authoring-performance', server: 'preview' },
  { scope: 'studio', script: 'test:storage', server: 'development' },
]);
export const GUIDELINE_GATE_STEPS = Object.freeze(
  [
    ...['audit:intake', 'lint:intake', 'test:intake'].map(script => ({ scope: 'intake', script })),
    { scope: 'studio', script: 'build' },
    { scope: 'studio', script: 'test:guidelines', server: 'preview' },
    ...[
      'test:guideline-host',
      'test:guideline-host-integration',
      'test:guideline-assistance',
      'test:guideline-numeric',
      'test:guideline-statement-review',
      'test:guideline-task-flow',
      'test:guideline-source-scale',
      'test:guideline-manual',
      'test:guideline-figma',
      'test:figma-library',
      'test:guideline-figma-review',
      'test:guideline-website',
      'test:guideline-cross-format',
      'test:guideline-source-set',
      'test:guideline-output-recovery',
      'test:guideline-storage',
      'test:guideline-recovery-storage',
      'test:guideline-source-set-storage',
      'test:guideline-refresh',
      'test:guideline-native-refresh',
      'test:guideline-manual-refresh',
      'test:guideline-composition-refresh',
      'test:guideline-supporting',
      'test:guideline-gradients',
      'test:guideline-gradient-assessment',
      'test:guideline-gradient-catalog',
      'test:guideline-gradient-worker',
      'test:guideline-accessibility',
      'test:guideline-capacity',
      'test:guideline-gradient-performance',
    ].map(script => ({ scope: 'studio', script })),
  ].map(step => ({ ...step, guidelines: true }))
);

export function runCommand(command, args, { cwd, env, signal } = {}) {
  return new Promise(resolve => {
    if (signal?.aborted) {
      resolve(130);
      return;
    }
    // On POSIX, an owned process group lets interruption also stop npm's child
    // browser. Never search for or kill a process by port or executable name.
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    });
    const abort = () => {
      try {
        if (process.platform === 'win32') child.kill('SIGTERM');
        else if (child.pid) process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', error => {
      console.error(error.message);
      resolve(1);
    });
    child.once('close', code => {
      signal?.removeEventListener('abort', abort);
      resolve(signal?.aborted ? 130 : (code ?? 1));
    });
  });
}

export async function startStudioServer(kind, rootDir, { guidelines = false } = {}) {
  // Keep Vite in this process so close() owns exactly the server we created.
  // Port zero asks the OS for a free port and avoids all existing previews.
  const vite = await import(
    pathToFileURL(path.join(rootDir, 'web/node_modules/vite/dist/node/index.js')).href
  );
  const common = {
    root: path.join(rootDir, 'web'),
    configFile: path.join(rootDir, 'web/vite.config.ts'),
    logLevel: 'warn',
    define: { 'import.meta.env.VITE_GUIDELINE_IMPORT': JSON.stringify(String(guidelines)) },
  };
  const server =
    kind === 'preview'
      ? await vite.preview({
          ...common,
          preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
        })
      : await vite.createServer({
          ...common,
          server: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
        });
  try {
    if (kind === 'development') await server.listen();
    const address = server.httpServer.address();
    if (!address || typeof address === 'string')
      throw new Error('Vite did not bind a TCP address.');
    return {
      url: `http://127.0.0.1:${address.port}`,
      close: async () => {
        if (kind === 'development') await server.close();
        else
          await new Promise((resolve, reject) => {
            server.httpServer.close(error => (error ? reject(error) : resolve()));
            server.httpServer.closeAllConnections();
          });
      },
    };
  } catch (error) {
    if (kind === 'development') await server.close();
    else server.httpServer.close();
    throw error;
  }
}

function artifactFiles(rootDir) {
  const directory = path.join(rootDir, 'web/dist');
  if (!fs.existsSync(directory)) return ['web/dist/index.html'];
  const visit = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? visit(file) : [path.relative(rootDir, file)];
    });
  return visit(directory).sort();
}

function writeReceipt(receipt, rootDir, directory) {
  fs.mkdirSync(path.join(rootDir, directory), { recursive: true });
  const lines = [
    '# Local verification receipt',
    '',
    `- Status: **${receipt.status.toUpperCase()}**`,
    `- Command: \`${receipt.command}\``,
    `- Runtime: Node ${receipt.environment.node}, npm ${receipt.environment.npm}`,
    `- Commit: \`${receipt.environment.commit}\`; worktree ${receipt.environment.dirty ? 'has uncommitted changes' : 'clean'}`,
    `- Started: ${receipt.startedAt}; finished: ${receipt.finishedAt}`,
    '',
    '## Checks',
    '',
    ...receipt.steps.map(
      step =>
        `- ${step.status.toUpperCase()} \`${step.command}\` (${step.durationMs} ms)${step.error ? ` — ${step.error}` : ''}`
    ),
    '',
    '## Studio builds',
    '',
    ...receipt.builds.flatMap(build => [
      `### ${build.id}`,
      '',
      ...build.artifacts.map(
        artifact =>
          `- \`${artifact.path}\`: ${artifact.bytes} bytes; SHA-256 \`${artifact.sha256}\``
      ),
      '',
    ]),
    '## Final Studio artifacts',
    '',
    ...receipt.artifacts.map(artifact =>
      artifact.present
        ? `- \`${artifact.path}\`: ${artifact.bytes} bytes; SHA-256 \`${artifact.sha256}\``
        : `- \`${artifact.path}\`: absent`
    ),
    '',
    'Plugin release receipts remain under `docs/evidence/gates/`. Browser evidence paths are recorded in the JSON receipt.',
    'Run on Node 22 and Node 24. This receipt verifies local operation; it is not a deployment receipt.',
    '',
  ];
  fs.writeFileSync(
    path.join(rootDir, directory, 'receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  fs.writeFileSync(path.join(rootDir, directory, 'receipt.md'), lines.join('\n'));
}

export async function runLocalVerification({
  rootDir = ROOT,
  guidelines = false,
  steps = guidelines ? [...LOCAL_GATE_STEPS, ...GUIDELINE_GATE_STEPS] : LOCAL_GATE_STEPS,
  studioOnly = false,
  dryRun = false,
  runner = runCommand,
  serverFactory = startStudioServer,
  environment,
  env = process.env,
  signal,
  now = () => new Date(),
  log = console.log,
} = {}) {
  const selected = steps.filter(step => !studioOnly || step.scope !== 'plugin');
  const commandFor = step =>
    `npm${step.scope === 'studio' ? ' --prefix web' : ''} run ${step.script}`;
  if (dryRun) {
    selected.forEach(step =>
      log(
        `${commandFor(step)}${step.guidelines ? ' [guidelines enabled]' : ''}${step.server ? ` [${step.server} server]` : ''}`
      )
    );
    return { status: 'dry-run', exitCode: 0, receipt: null, directory: null };
  }
  const resolvedEnvironment = environment ?? collectEnvironment(rootDir);
  const startedAt = now();
  const stamp = receiptDirectoryName(startedAt.toISOString(), resolvedEnvironment.shortCommit);
  const directory = `docs/evidence/local-gates/${stamp}`;
  const browserEvidence = `release/studio-gates/${stamp}`;
  const servers = new Map();
  const results = [];
  const builds = [];
  let currentBuild;
  let currentProfile;
  const snapshot = () => artifactFiles(rootDir).map(file => describeArtifact(rootDir, file));
  const assertBuildUnchanged = () => {
    if (currentBuild && JSON.stringify(currentBuild.artifacts) !== JSON.stringify(snapshot()))
      throw new Error(
        `Studio artifacts changed after ${currentBuild.id}; the candidate is no longer the tested build.`
      );
  };
  let exitCode = 0;
  try {
    for (const step of selected) {
      const command = commandFor(step);
      if (exitCode || signal?.aborted) {
        exitCode ||= 130;
        results.push({ ...step, command, status: 'skipped', exitCode: null, durationMs: 0 });
        continue;
      }
      const before = now();
      let error;
      let testedUrl;
      const childEnv = { ...env };
      const profile = step.guidelines ? 'guidelines' : 'normal';
      childEnv.VITE_GUIDELINE_IMPORT = String(!!step.guidelines);
      delete childEnv.STUDIO_URL;
      delete childEnv.STUDIO_DEV_URL;
      if (step.script === 'test:guideline-gradient-performance')
        childEnv.GUIDELINE_GRADIENT_REPETITIONS = '30';
      const evidence = step.server
        ? `${browserEvidence}/${step.script.replaceAll(':', '-')}`
        : undefined;
      try {
        if (profile !== currentProfile) {
          for (const [kind, server] of servers) {
            await server.close();
            servers.delete(kind);
          }
          currentProfile = profile;
        }
        const building = step.scope === 'studio' && step.script === 'build';
        if (building) currentBuild = undefined;
        else assertBuildUnchanged();
        if (step.server) {
          // A passing receipt must describe this checkout and this build. Manual
          // URL overrides belong to individual browser scripts, never this gate.
          const key = step.server === 'preview' ? 'STUDIO_URL' : 'STUDIO_DEV_URL';
          if (!servers.has(step.server))
            servers.set(
              step.server,
              await serverFactory(step.server, rootDir, { guidelines: !!step.guidelines })
            );
          testedUrl = servers.get(step.server).url;
          childEnv[key] = testedUrl;
          childEnv.STUDIO_EVIDENCE = path.join(rootDir, evidence);
        }
        log(`[verify-local] ${command}`);
        exitCode = await runner('npm', ['run', step.script], {
          cwd: step.scope === 'studio' ? path.join(rootDir, 'web') : rootDir,
          env: childEnv,
          signal,
        });
        if (!exitCode && building) {
          const artifacts = snapshot();
          if (!artifacts.some(a => a.path === 'web/dist/index.html' && a.present))
            throw new Error('The Studio build did not produce index.html.');
          currentBuild = { id: `${profile}-${builds.length + 1}`, profile, artifacts };
          builds.push(currentBuild);
        } else if (!exitCode) assertBuildUnchanged();
      } catch (failure) {
        error = failure instanceof Error ? failure.message : String(failure);
        exitCode = 1;
      }
      results.push({
        ...step,
        command,
        status: exitCode ? 'failed' : 'passed',
        exitCode,
        durationMs: now().getTime() - before.getTime(),
        ...(currentBuild ? { candidateBuildId: currentBuild.id } : {}),
        ...(evidence ? { evidence } : {}),
        ...(testedUrl ? { testedUrl } : {}),
        ...(error ? { error } : {}),
      });
    }
  } finally {
    for (const [kind, server] of servers) {
      try {
        await server.close();
      } catch (failure) {
        exitCode ||= 1;
        results.push({
          script: `close-${kind}`,
          command: `Close owned ${kind} server`,
          status: 'failed',
          exitCode: 1,
          durationMs: 0,
          error: failure instanceof Error ? failure.message : String(failure),
        });
      }
    }
  }
  const finishedAt = now();
  const receipt = {
    schemaVersion: 'teul.local-verification.v1',
    status: exitCode ? 'failed' : 'passed',
    command: `npm run verify:local${studioOnly || guidelines ? ' --' : ''}${studioOnly ? ' --studio-only' : ''}${guidelines ? ' --guidelines' : ''}`,
    environment: resolvedEnvironment,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    steps: results,
    builds,
    artifacts: artifactFiles(rootDir).map(file => describeArtifact(rootDir, file)),
  };
  writeReceipt(receipt, rootDir, directory);
  log(`[verify-local] ${receipt.status.toUpperCase()}: ${directory}/receipt.md`);
  return { status: receipt.status, exitCode, receipt, directory };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--dry-run', '--studio-only', '--guidelines'].includes(arg))) {
    console.error('Usage: npm run verify:local -- [--dry-run] [--studio-only] [--guidelines]');
    process.exitCode = 2;
  } else {
    const controller = new AbortController();
    const interrupt = () => controller.abort();
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    try {
      const result = await runLocalVerification({
        dryRun: args.includes('--dry-run'),
        studioOnly: args.includes('--studio-only'),
        guidelines: args.includes('--guidelines'),
        signal: controller.signal,
      });
      process.exitCode = result.exitCode;
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
  }
}
