const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const uiPath = path.join(rootDir, process.env.TEUL_DIST_DIR || 'dist', 'ui.html');
// Preserve at least 8 KB of headroom below the former 400 KB ceiling.
const improvementBudgetBytes = 392_000;

if (!fs.existsSync(uiPath)) {
  console.error('UI bundle check failed: dist/ui.html does not exist. Run npm run build first.');
  process.exit(1);
}

const uiBytes = fs.statSync(uiPath).size;
if (uiBytes > improvementBudgetBytes) {
  console.error(
    `UI bundle check failed: dist/ui.html is ${uiBytes} bytes; improvement budget is ${improvementBudgetBytes} bytes.`
  );
  process.exit(1);
}

console.log(`UI bundle verified: dist/ui.html is ${uiBytes}/${improvementBudgetBytes} bytes.`);
