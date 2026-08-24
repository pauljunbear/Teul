'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  'src',
  'fixtures',
  'scripts',
  'manifest.json',
  'figma-candidate/manifest.json',
  'webpack.config.js',
  'package.json',
];
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.ts',
  '.tsx',
]);

const privateFileKey = ['AeK5', 'Hs4G4zupYK5ogVtNJE'].join('');
const privateNodeIds = [
  ['76', '148'].join(':'),
  ['96', '82'].join(':'),
  ['96', '136'].join(':'),
  ['96', '216'].join(':'),
  ['96', '283'].join(':'),
  ['96', '328'].join(':'),
];
const rules = [
  {
    label: 'private personal-lab name',
    pattern: new RegExp(['pa', 'ul', '[ -]?', 'lab'].join(''), 'i'),
  },
  {
    label: 'private corporate brand name',
    pattern: new RegExp(['ra', 'mp', '\\s+brand'].join(''), 'i'),
  },
  {
    label: 'private account or fixture identifier',
    pattern: new RegExp(['pa', 'ul-jun_', 'ra', 'mp|@', 'ra', 'mp'].join(''), 'i'),
  },
  { label: 'private Figma file key', pattern: new RegExp(privateFileKey, 'i') },
  ...privateNodeIds.map(nodeId => ({
    label: `private Figma node ${nodeId}`,
    pattern: new RegExp(nodeId.replace(':', '\\:'), 'i'),
  })),
];

function activeFiles(target) {
  const absolute = path.join(ROOT, target);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [absolute];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '.codex-private-quarantine') return [];
    return activeFiles(path.relative(ROOT, path.join(absolute, entry.name)));
  });
}

const violations = [];
for (const file of TARGETS.flatMap(activeFiles)) {
  if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;
  const contents = fs.readFileSync(file, 'utf8');
  for (const rule of rules) {
    if (rule.pattern.test(contents)) {
      violations.push(`${path.relative(ROOT, file)}: ${rule.label}`);
    }
  }
}

if (violations.length > 0) {
  console.error('Generic candidate sanitization failed:');
  violations.forEach(violation => console.error(`- ${violation}`));
  process.exit(1);
}

console.log(`Generic candidate sanitization passed across ${TARGETS.join(', ')}.`);
