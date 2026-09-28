import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  LOCAL_GATE_STEPS,
  GUIDELINE_GATE_STEPS,
  runCommand,
  runLocalVerification,
  startStudioServer,
} from './verify-local.mjs';

const environment = {
  node: process.version,
  npm: '10.x',
  commit: 'fixture',
  shortCommit: 'fixture',
  dirty: false,
};
const quiet = () => {};
const makeRoot = () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'teul-local-verification-'));
  mkdirSync(path.join(rootDir, 'web/dist/assets'), { recursive: true });
  writeFileSync(path.join(rootDir, 'web/dist/index.html'), '<title>Production fixture</title>');
  writeFileSync(path.join(rootDir, 'web/dist/assets/app.js'), 'console.log("fixture");');
  return rootDir;
};

test('combined default path includes the plugin gate and every Studio browser suite', () => {
  assert.deepEqual(
    LOCAL_GATE_STEPS.map(step => step.script),
    [
      'test:scripts',
      'release-gate',
      'audit',
      'lint',
      'test',
      'build',
      'test:browser',
      'test:feedback',
      'test:authoring',
      'test:authoring-performance',
      'test:storage',
    ]
  );
  assert.equal(LOCAL_GATE_STEPS.find(step => step.script === 'test:storage').server, 'development');
});

test('dry runs enumerate the selected scope without processes, servers or receipts', async () => {
  const commands = [];
  const unexpected = () => assert.fail('Dry run executed work');
  const result = await runLocalVerification({
    rootDir: '/does-not-exist',
    studioOnly: true,
    dryRun: true,
    runner: unexpected,
    serverFactory: unexpected,
    log: command => commands.push(command),
  });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.receipt, null);
  assert.ok(commands.every(command => command.startsWith('npm --prefix web')));
  assert.ok(commands.some(command => command.includes('test:storage')));
});

test('the opt-in guideline profile covers the existing scripts without adding plugin dependence', async () => {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const web = JSON.parse(readFileSync(path.join(repoRoot, 'web/package.json')));
  const expected = Object.keys(web.scripts).filter(name => /^test:guideline/.test(name));
  const actual = GUIDELINE_GATE_STEPS.filter(s => s.scope === 'studio').map(s => s.script);
  for (const name of expected) assert.ok(actual.includes(name), `Missing ${name}`);
  assert.equal(new Set(actual).size, actual.length);
  const commands = [];
  await runLocalVerification({
    guidelines: true,
    studioOnly: true,
    dryRun: true,
    log: c => commands.push(c),
  });
  assert.ok(commands.some(c => c.includes('test:intake')));
  assert.ok(commands.some(c => c.includes('test:guideline-source-set')));
  assert.ok(!commands.some(c => c.includes('release-gate')));
  assert.equal(commands.filter(c => c.startsWith('npm --prefix web run build')).length, 2);
});

test('normal and enabled builds have separate receipts and owned servers; inherited overrides cannot qualify a run', async () => {
  const rootDir = makeRoot(),
    calls = [],
    closes = [],
    starts = [];
  const env = {
    VITE_GUIDELINE_IMPORT: 'true',
    STUDIO_URL: 'https://wrong.test',
    STUDIO_DEV_URL: 'https://wrong-dev.test',
    GUIDELINE_GRADIENT_REPETITIONS: '1',
  };
  const steps = [
    { scope: 'studio', script: 'build' },
    { scope: 'studio', script: 'test:browser', server: 'preview' },
    { scope: 'intake', script: 'test:intake', guidelines: true },
    { scope: 'studio', script: 'build', guidelines: true },
    { scope: 'studio', script: 'test:guidelines', server: 'preview', guidelines: true },
    { scope: 'studio', script: 'test:guideline-gradient-performance', guidelines: true },
  ];
  try {
    const result = await runLocalVerification({
      rootDir,
      environment,
      env,
      guidelines: true,
      studioOnly: true,
      steps,
      log: quiet,
      serverFactory: async (_kind, _root, options) => {
        const flag = options.guidelines;
        starts.push(flag);
        return {
          url: `http://127.0.0.1:${flag ? 12002 : 12001}`,
          close: async () => {
            closes.push(flag);
          },
        };
      },
      runner: async (_command, args, options) => {
        const script = args[1];
        calls.push(script);
        assert.equal(options.env.VITE_GUIDELINE_IMPORT, String(calls.length > 2));
        assert.equal(options.env.STUDIO_DEV_URL, undefined);
        if (script === 'test:intake') {
          assert.deepEqual(closes, [false]);
          assert.equal(options.cwd, rootDir);
        } else assert.equal(options.cwd, path.join(rootDir, 'web'));
        if (script === 'build') {
          assert.equal(options.env.STUDIO_URL, undefined);
          writeFileSync(
            path.join(rootDir, 'web/dist/assets/app.js'),
            options.env.VITE_GUIDELINE_IMPORT
          );
        }
        if (script === 'test:guideline-gradient-performance') {
          assert.equal(options.env.STUDIO_URL, undefined);
          assert.equal(options.env.GUIDELINE_GRADIENT_REPETITIONS, '30');
        }
        return 0;
      },
    });
    assert.equal(result.status, 'passed');
    assert.deepEqual(starts, [false, true]);
    assert.deepEqual(closes, [false, true]);
    assert.deepEqual(
      result.receipt.builds.map(b => b.profile),
      ['normal', 'guidelines']
    );
    assert.notDeepEqual(result.receipt.builds[0].artifacts, result.receipt.builds[1].artifacts);
    assert.equal(result.receipt.steps[1].candidateBuildId, 'normal-1');
    assert.equal(result.receipt.steps[4].candidateBuildId, 'guidelines-2');
    assert.equal(env.GUIDELINE_GRADIENT_REPETITIONS, '1');
    assert.equal(env.STUDIO_URL, 'https://wrong.test');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('a changed candidate fails the responsible check and cannot qualify downstream work', async () => {
  const rootDir = makeRoot();
  try {
    const calls = [];
    const result = await runLocalVerification({
      rootDir,
      environment,
      env: {},
      log: quiet,
      steps: [
        { scope: 'studio', script: 'build' },
        { scope: 'studio', script: 'browser' },
        { scope: 'studio', script: 'later' },
      ],
      runner: async (_command, args) => {
        calls.push(args[1]);
        if (args[1] === 'browser')
          writeFileSync(path.join(rootDir, 'web/dist/assets/app.js'), 'substituted');
        return 0;
      },
    });
    assert.equal(result.exitCode, 1);
    assert.deepEqual(calls, ['build', 'browser']);
    assert.match(result.receipt.steps[1].error, /artifacts changed/);
    assert.equal(result.receipt.steps[2].status, 'skipped');
    assert.notDeepEqual(result.receipt.builds[0].artifacts, result.receipt.artifacts);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('a real nonzero subprocess result stops downstream checks and is retained in the receipt', async () => {
  const rootDir = makeRoot();
  const calls = [];
  try {
    const result = await runLocalVerification({
      rootDir,
      environment,
      env: {},
      log: quiet,
      steps: [
        { scope: 'plugin', script: 'release-gate' },
        { scope: 'studio', script: 'build' },
      ],
      runner: async (command, args, options) => {
        calls.push(args);
        return runCommand(process.execPath, ['-e', 'process.exit(17)'], options);
      },
      serverFactory: () => assert.fail('Server started after failed gate'),
    });
    assert.equal(result.exitCode, 17);
    assert.deepEqual(calls, [['run', 'release-gate']]);
    assert.deepEqual(
      result.receipt.steps.map(step => [step.status, step.exitCode]),
      [
        ['failed', 17],
        ['skipped', null],
      ]
    );
    const receipt = JSON.parse(readFileSync(path.join(rootDir, result.directory, 'receipt.json')));
    assert.equal(receipt.status, 'failed');
    assert.match(
      receipt.artifacts.find(file => file.path.endsWith('app.js')).sha256,
      /^[a-f0-9]{64}$/
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('failed browser checks close only the owned server and skip subsequent work', async () => {
  const rootDir = makeRoot();
  const started = [],
    closed = [];
  try {
    const result = await runLocalVerification({
      rootDir,
      environment,
      env: {},
      log: quiet,
      steps: LOCAL_GATE_STEPS.filter(step => step.server),
      serverFactory: async kind => {
        started.push(kind);
        return {
          url: 'http://127.0.0.1:12345',
          close: async () => {
            closed.push(kind);
          },
        };
      },
      runner: async (command, args, options) => {
        assert.equal(options.env.STUDIO_URL, 'http://127.0.0.1:12345');
        assert.ok(
          options.env.STUDIO_EVIDENCE.startsWith(path.join(rootDir, 'release/studio-gates/'))
        );
        return 9;
      },
    });
    assert.equal(result.exitCode, 9);
    assert.deepEqual(started, ['preview']);
    assert.deepEqual(closed, ['preview']);
    assert.deepEqual(
      result.receipt.steps.map(step => step.status),
      ['failed', 'skipped', 'skipped', 'skipped', 'skipped']
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('inherited URLs cannot substitute stale servers and the caller environment is unchanged', async () => {
  const rootDir = makeRoot();
  const env = { STUDIO_URL: 'http://127.0.0.1:5180', STUDIO_DEV_URL: 'http://127.0.0.1:5179' };
  const started = [];
  const closed = [];
  const urls = { preview: 'http://127.0.0.1:12345', development: 'http://127.0.0.1:12346' };
  try {
    const result = await runLocalVerification({
      rootDir,
      environment,
      env,
      log: quiet,
      steps: LOCAL_GATE_STEPS.filter(step => step.server),
      serverFactory: async kind => {
        started.push(kind);
        return {
          url: urls[kind],
          close: async () => {
            closed.push(kind);
          },
        };
      },
      runner: async (command, args, options) => {
        if (args[1] === 'test:storage') {
          assert.equal(options.env.STUDIO_DEV_URL, urls.development);
          assert.equal(options.env.STUDIO_URL, undefined);
        } else {
          assert.equal(options.env.STUDIO_URL, urls.preview);
          assert.equal(options.env.STUDIO_DEV_URL, undefined);
        }
        return 0;
      },
    });
    assert.equal(result.status, 'passed');
    assert.deepEqual(started, ['preview', 'development']);
    assert.deepEqual(closed, ['preview', 'development']);
    for (const step of result.receipt.steps) assert.equal(step.testedUrl, urls[step.server]);
    assert.deepEqual(env, {
      STUDIO_URL: 'http://127.0.0.1:5180',
      STUDIO_DEV_URL: 'http://127.0.0.1:5179',
    });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('startup errors fail the responsible step, close earlier servers and still write evidence', async () => {
  const rootDir = makeRoot();
  let closed = 0;
  try {
    const result = await runLocalVerification({
      rootDir,
      environment,
      env: {},
      log: quiet,
      steps: [LOCAL_GATE_STEPS[6], LOCAL_GATE_STEPS.find(step => step.script === 'test:storage')],
      serverFactory: async kind => {
        if (kind === 'development') throw new Error('Cannot start development fixture');
        return {
          url: 'http://127.0.0.1:12345',
          close: async () => {
            closed++;
          },
        };
      },
      runner: async () => 0,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(closed, 1);
    assert.match(result.receipt.steps[1].error, /Cannot start development fixture/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('interruption stops an owned subprocess and cannot report a passing run', async () => {
  const rootDir = makeRoot();
  const controller = new AbortController();
  let closed = 0;
  const timer = setTimeout(() => controller.abort(), 100);
  try {
    const result = await runLocalVerification({
      rootDir,
      environment,
      env: {},
      log: quiet,
      signal: controller.signal,
      steps: [LOCAL_GATE_STEPS[6], LOCAL_GATE_STEPS[7]],
      serverFactory: async () => ({
        url: 'http://127.0.0.1:12345',
        close: async () => {
          closed++;
        },
      }),
      runner: (command, args, options) =>
        runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options),
    });
    assert.equal(result.exitCode, 130);
    assert.equal(result.status, 'failed');
    assert.equal(closed, 1);
  } finally {
    clearTimeout(timer);
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('owned Vite servers receive different free ports, serve their surface and close cleanly', async () => {
  const rootDir = makeRoot();
  const servers = [];
  try {
    const repoRoot = fileURLToPath(new URL('..', import.meta.url));
    symlinkSync(
      path.join(repoRoot, 'web/node_modules'),
      path.join(rootDir, 'web/node_modules'),
      'dir'
    );
    writeFileSync(path.join(rootDir, 'web/package.json'), '{"type":"module"}');
    writeFileSync(path.join(rootDir, 'web/vite.config.ts'), 'export default {};');
    writeFileSync(path.join(rootDir, 'web/index.html'), '<title>Development fixture</title>');
    servers.push(await startStudioServer('preview', rootDir));
    servers.push(await startStudioServer('development', rootDir));
    assert.notEqual(servers[0].url, servers[1].url);
    assert.match(await (await fetch(servers[0].url)).text(), /Production fixture/);
    assert.match(await (await fetch(servers[1].url)).text(), /Development fixture/);
    await Promise.all(servers.map(server => server.close()));
    const closed = servers.splice(0);
    for (const server of closed)
      await assert.rejects(fetch(server.url, { signal: AbortSignal.timeout(1000) }));
  } finally {
    await Promise.all(servers.map(server => server.close()));
    rmSync(rootDir, { recursive: true, force: true });
  }
});
