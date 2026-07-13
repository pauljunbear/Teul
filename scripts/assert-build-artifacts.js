const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, process.env.TEUL_DIST_DIR || 'dist');
const uiPath = path.join(distDir, 'ui.html');
const maxUiBytes = 440 * 1024;

function fail(message) {
  console.error(`Build artifact assertion failed: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(uiPath)) {
  fail('dist/ui.html does not exist. Run the production build first.');
} else {
  const uiHtml = fs.readFileSync(uiPath, 'utf8');
  const uiBytes = fs.statSync(uiPath).size;
  const scripts = Array.from(new JSDOM(uiHtml).window.document.querySelectorAll('script'));
  const externalScripts = scripts.filter(script => script.hasAttribute('src'));
  const inlineScripts = scripts.filter(script => !script.hasAttribute('src'));

  if (uiBytes > maxUiBytes) {
    fail(`dist/ui.html is ${uiBytes} bytes; limit is ${maxUiBytes} bytes.`);
  }

  if (inlineScripts.length !== 1) {
    fail(`dist/ui.html must contain exactly one inline script; found ${inlineScripts.length}.`);
  }

  if (externalScripts.length !== 0) {
    fail(`dist/ui.html must contain no external scripts; found ${externalScripts.length}.`);
  }

  if (/ui\.js(?:\.LICENSE\.txt)?/i.test(uiHtml)) {
    fail('dist/ui.html contains a ui.js or ui.js.LICENSE.txt reference.');
  }
}

if (!fs.existsSync(path.join(distDir, 'code.js'))) {
  fail('dist/code.js is missing.');
}

const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
if (manifest.documentAccess !== 'dynamic-page') {
  fail('manifest.json must use dynamic-page document access.');
}
if (
  !manifest.networkAccess ||
  manifest.networkAccess.allowedDomains?.length !== 1 ||
  manifest.networkAccess.allowedDomains[0] !== 'none'
) {
  fail('manifest.json must explicitly deny network access.');
}

const packageMetadata = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
if (packageMetadata.license !== 'SEE LICENSE IN LICENSE') {
  fail('package.json must defer to the mixed-license project LICENSE file.');
}

const distributedDocuments = [
  { source: 'LICENSE', output: 'LICENSE' },
  { source: 'THIRD_PARTY_NOTICES.md', output: 'THIRD_PARTY_NOTICES.md' },
  { source: 'APCA_LICENSE.md', output: 'APCA_LICENSE.md' },
  { source: 'docs/SOURCE_PROVENANCE.md', output: 'SOURCE_PROVENANCE.md' },
];

for (const document of distributedDocuments) {
  const sourcePath = path.join(rootDir, document.source);
  const outputPath = path.join(distDir, document.output);

  if (!fs.existsSync(outputPath)) {
    fail(`dist/${document.output} is missing.`);
    continue;
  }

  if (!fs.readFileSync(outputPath).equals(fs.readFileSync(sourcePath))) {
    fail(`dist/${document.output} does not match ${document.source}.`);
  }
}

if (fs.existsSync(path.join(distDir, 'ui.js'))) {
  fail('dist/ui.js must not exist because the UI runtime is inlined.');
}

if (!process.exitCode) {
  const uiBytes = fs.statSync(uiPath).size;
  console.log(
    `Build artifacts verified: ui.html ${uiBytes}/${maxUiBytes} bytes, one inline script, no external scripts, legal and provenance documents match their sources.`
  );
}
