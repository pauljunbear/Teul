import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  REPO_DIST,
  CANDIDATE_DIST,
  createReportConfig,
  summarize,
} = require('./report-bundle-composition.js');
const createConfig = require('../webpack.config');

test('the report build targets a fresh temporary directory, never dist/', () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'teul-bundle-report-test-'));
  try {
    const config = createReportConfig({}, temporaryRoot);
    assert.ok(config.output.path.startsWith(temporaryRoot));
    assert.ok(existsSync(config.output.path));
    assert.notEqual(config.output.path, REPO_DIST);
    assert.notEqual(config.output.path, CANDIDATE_DIST);
    assert.equal(config.output.clean, true);

    const production = createConfig({}, { mode: 'production' });
    assert.equal(production.output.path, REPO_DIST, 'the normal build still targets dist/');
    assert.deepEqual(config.entry, production.entry);
    assert.equal(config.mode, 'production');
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('summarize sorts assets and the twenty largest modules by size', () => {
  const stats = {
    toJson: () => ({
      assets: [{ name: 'ui.html', size: 10 }, { name: 'code.js', size: 30 }, { size: 5 }],
      modules: [
        ...Array.from({ length: 25 }, (_, index) => ({ name: `m${index}`, size: index })),
        { name: 'ignored', size: Number.NaN },
        { size: 999 },
      ],
    }),
  };
  const { assets, modules } = summarize(stats);
  assert.deepEqual(assets, [
    { name: 'code.js', size: 30 },
    { name: 'ui.html', size: 10 },
    { name: 'unknown', size: 5 },
  ]);
  assert.equal(modules.length, 20);
  assert.deepEqual(modules[0], { name: 'm24', size: 24 });
  assert.equal(
    modules.some(module => module.name === 'ignored'),
    false
  );
});
