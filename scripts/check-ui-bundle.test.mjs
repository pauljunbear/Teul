import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const {
  PRODUCTION_IMPROVEMENT_BUDGET_BYTES,
  CANDIDATE_BUDGET_BYTES,
  budgetForDistDir,
} = require('./check-ui-bundle.js');

test('budgets are reconciled: production ratchet below the candidate budget, both below the ceiling', () => {
  assert.equal(PRODUCTION_IMPROVEMENT_BUDGET_BYTES, 392_000);
  assert.equal(CANDIDATE_BUDGET_BYTES, 430_080);
  assert.ok(PRODUCTION_IMPROVEMENT_BUDGET_BYTES < CANDIDATE_BUDGET_BYTES);
  assert.ok(CANDIDATE_BUDGET_BYTES < 450_560);
});

test('the candidate dist directory selects the candidate budget; everything else the improvement budget', () => {
  assert.deepEqual(budgetForDistDir('figma-candidate/dist'), {
    label: 'candidate budget',
    bytes: CANDIDATE_BUDGET_BYTES,
  });
  assert.deepEqual(budgetForDistDir('figma-candidate/dist/'), {
    label: 'candidate budget',
    bytes: CANDIDATE_BUDGET_BYTES,
  });
  assert.deepEqual(budgetForDistDir('dist'), {
    label: 'improvement budget',
    bytes: PRODUCTION_IMPROVEMENT_BUDGET_BYTES,
  });
});

function runCheck(relativeDistDir, uiBytes) {
  const root = mkdtempSync(join(tmpdir(), 'teul-ui-budget-'));
  try {
    const dist = join(root, relativeDistDir);
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'ui.html'), Buffer.alloc(uiBytes, 0x20));
    // TEUL_DIST_DIR may be absolute; the script resolves it against the repo root.
    const result = spawnSync(process.execPath, [new URL('./check-ui-bundle.js', import.meta.url).pathname], {
      env: { ...process.env, TEUL_DIST_DIR: join(root, relativeDistDir) },
      encoding: 'utf8',
    });
    return result;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('a production ui.html over 392,000 bytes fails and a candidate ui.html under 430,080 passes', () => {
  const overProduction = runCheck('dist', PRODUCTION_IMPROVEMENT_BUDGET_BYTES + 1);
  assert.equal(overProduction.status, 1);
  assert.match(overProduction.stderr, /improvement budget is 392000 bytes/);
  const candidateOk = runCheck('figma-candidate/dist', CANDIDATE_BUDGET_BYTES - 1);
  assert.equal(candidateOk.status, 0, candidateOk.stderr);
  assert.match(candidateOk.stdout, /candidate budget/);
  const candidateOver = runCheck('figma-candidate/dist', CANDIDATE_BUDGET_BYTES + 1);
  assert.equal(candidateOver.status, 1);
  assert.match(candidateOver.stderr, /candidate budget is 430080 bytes/);
});
