const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = process.env.TEUL_DIST_DIR || 'dist';
const uiPath = path.join(path.resolve(rootDir, distDir), 'ui.html');

// Two budgets, one ceiling (reconciled 2026-09-07):
// - Production (`dist`): the improvement budget, at least 8 KB below the former
//   400 KiB product budget. The production UI must never regress past it.
// - Candidate (`figma-candidate/dist`): 420 KiB (2026-09-08; was the former 400 KiB
//   product budget). The candidate UI carries the side-by-side review, measured
//   evidence, brand surfaces, the print sheet with an owner-supplied spot color and
//   the marketing / out-of-home preview boards, so it is allowed the headroom the
//   production UI gave up, while staying 20 KiB under the hard ceiling.
// - `scripts/assert-build-artifacts.js` keeps the hard 450,560-byte ceiling for both.
const PRODUCTION_IMPROVEMENT_BUDGET_BYTES = 392_000;
const CANDIDATE_BUDGET_BYTES = 430_080;

function budgetForDistDir(dir) {
  const normalized = dir.split(path.sep).join('/').replace(/\/+$/, '');
  return normalized.endsWith('figma-candidate/dist')
    ? { label: 'candidate budget', bytes: CANDIDATE_BUDGET_BYTES }
    : { label: 'improvement budget', bytes: PRODUCTION_IMPROVEMENT_BUDGET_BYTES };
}

if (require.main === module) {
  if (!fs.existsSync(uiPath)) {
    console.error(`UI bundle check failed: ${distDir}/ui.html does not exist. Run the build first.`);
    process.exit(1);
  }
  const budget = budgetForDistDir(distDir);
  const uiBytes = fs.statSync(uiPath).size;
  if (uiBytes > budget.bytes) {
    console.error(
      `UI bundle check failed: ${distDir}/ui.html is ${uiBytes} bytes; ${budget.label} is ${budget.bytes} bytes.`
    );
    process.exit(1);
  }
  console.log(`UI bundle verified: ${distDir}/ui.html is ${uiBytes}/${budget.bytes} bytes (${budget.label}).`);
}

module.exports = {
  PRODUCTION_IMPROVEMENT_BUDGET_BYTES,
  CANDIDATE_BUDGET_BYTES,
  budgetForDistDir,
};
