const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, process.env.TEUL_DIST_DIR || 'dist');
const uiPath = path.join(distDir, 'ui.html');
const maxUiBytes = 440 * 1024;
const genericChannelArg = process.argv.find(argument => argument.startsWith('--generic-channel='));
const expectedGenericChannel = genericChannelArg?.slice('--generic-channel='.length) ?? 'disabled';

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

const genericChannelPath = path.join(distDir, 'GENERIC_COLOR_BUILDER_CHANNEL.json');
if (!fs.existsSync(genericChannelPath)) {
  fail('GENERIC_COLOR_BUILDER_CHANNEL.json is missing.');
} else {
  const genericChannel = JSON.parse(fs.readFileSync(genericChannelPath, 'utf8'));
  if (
    genericChannel.schemaVersion !== 'teul.color-system.generic-release-channel.v2' ||
    genericChannel.channel !== expectedGenericChannel ||
    genericChannel.qualified !== (expectedGenericChannel === 'qualified')
  ) {
    fail(
      `generic builder channel must be ${expectedGenericChannel}; received ${JSON.stringify(genericChannel)}.`
    );
  }
}

const productionManifestPath = path.join(rootDir, 'manifest.json');
const candidateManifestPath = path.join(rootDir, 'figma-candidate', 'manifest.json');
const productionManifest = JSON.parse(fs.readFileSync(productionManifestPath, 'utf8'));
const candidateManifest = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
const expectedManifestIdentity = {
  production: { name: 'Teul', id: '1289773781827405726' },
  candidate: { name: 'Teul Candidate', id: '1289773781827405727' },
};
const manifestPath =
  expectedGenericChannel === 'candidate' ? candidateManifestPath : productionManifestPath;
const manifest = expectedGenericChannel === 'candidate' ? candidateManifest : productionManifest;

function validateManifest(current, currentPath) {
  const label = path.relative(rootDir, currentPath);
  if (current.documentAccess !== 'dynamic-page') {
    fail(`${label} must use dynamic-page document access.`);
  }
  if (
    !current.networkAccess ||
    current.networkAccess.allowedDomains?.length !== 1 ||
    current.networkAccess.allowedDomains[0] !== 'none'
  ) {
    fail(`${label} must explicitly deny network access.`);
  }
  if (
    path.resolve(path.dirname(currentPath), current.main || '') !== path.join(distDir, 'code.js')
  ) {
    fail(`${label} main must resolve to the verified code.js artifact.`);
  }
  if (path.resolve(path.dirname(currentPath), current.ui || '') !== uiPath) {
    fail(`${label} ui must resolve to the verified ui.html artifact.`);
  }
}

validateManifest(manifest, manifestPath);
if (
  productionManifest.name !== expectedManifestIdentity.production.name ||
  productionManifest.id !== expectedManifestIdentity.production.id
) {
  fail('Production manifest name or plugin ID changed from the registered Teul identity.');
}
if (
  candidateManifest.name !== expectedManifestIdentity.candidate.name ||
  candidateManifest.id !== expectedManifestIdentity.candidate.id
) {
  fail('Candidate manifest name or plugin ID changed from the registered candidate identity.');
}
if (productionManifest.id === candidateManifest.id) {
  fail('Production and candidate manifests must use distinct plugin IDs.');
}
if (productionManifest.name === candidateManifest.name) {
  fail('Production and candidate manifests must use distinct plugin names.');
}

const packageMetadata = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
if (packageMetadata.license !== 'SEE LICENSE IN LICENSE') {
  fail('package.json must defer to the mixed-license project LICENSE file.');
}
if (
  packageMetadata.dependencies?.['apca-w3'] ||
  packageMetadata.dependencies?.colorparsley ||
  packageMetadata.devDependencies?.['apca-w3'] !== '0.1.9'
) {
  fail('apca-w3 0.1.9 must remain an exact development-only verification dependency.');
}

const apcaPackage = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'node_modules', 'apca-w3', 'package.json'), 'utf8')
);
const colorParsleyPackage = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'node_modules', 'colorparsley', 'package.json'), 'utf8')
);
if (apcaPackage.license !== 'Limited W3 License') {
  fail('The reviewed apca-w3 development dependency license changed.');
}
if (colorParsleyPackage.version !== '0.1.8' || colorParsleyPackage.license !== 'AGPL v3') {
  fail('The reviewed colorparsley development-only transitive license boundary changed.');
}

for (const artifactName of ['ui.html', 'code.js']) {
  const artifact = fs.readFileSync(path.join(distDir, artifactName), 'utf8');
  if (/colorparsley/i.test(artifact)) {
    fail(`dist/${artifactName} must not contain the development-only colorparsley oracle.`);
  }
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
