import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const sanitizer = require('./verify-generic-candidate-sanitization.js');
const SCRIPT_PATH = new URL('./verify-generic-candidate-sanitization.js', import.meta.url);

// Synthetic identifiers for the tests only. None of them is a real rejected value.
const SYNTHETIC = {
  name: 'Quartz Atelier',
  handle: '@quartzco',
  fileKey: 'Qz7Kp2Lm9Nv4Rt6Wy8Xa1B',
  nodeId: '4321:987',
};
const SYNTHETIC_DENY_LIST = [
  sanitizer.createDenyEntry('synthetic studio name', { names: [SYNTHETIC.name] }),
  sanitizer.createDenyEntry('synthetic handle', { handles: [SYNTHETIC.handle] }),
  sanitizer.createDenyEntry('synthetic Figma file key', { fileKeys: [SYNTHETIC.fileKey] }),
  sanitizer.createDenyEntry('synthetic Figma node ID', { nodeIds: [SYNTHETIC.nodeId] }),
];

function makeTree(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teul-sanitizer-test-'));
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return root;
}

function labelsFor(result, file) {
  return result.violations.filter(violation => violation.file === file).map(v => v.label);
}

test('catches a synthetic identifier of every kind, in content and in paths', () => {
  const root = makeTree({
    'notes.md': `Line one\nThe ${SYNTHETIC.name} logo\n`,
    'camel.ts': `const owner = '${SYNTHETIC.name.replace(' ', '')}';\n`,
    'hyphen.json': `{"source":"${SYNTHETIC.name.toLowerCase().replace(' ', '-')}"}\n`,
    'mail.txt': `contact: someone${SYNTHETIC.handle}.example\n`,
    'keys.mts': `export const a = '${SYNTHETIC.fileKey}';\nexport const b = 'prefix${SYNTHETIC.fileKey}suffix';\n`,
    'nodes.svg': `<a href="?node-id=${SYNTHETIC.nodeId.replace(':', '-')}"/>\n<b>${SYNTHETIC.nodeId}</b>\n`,
    [`${SYNTHETIC.name.toLowerCase().replace(' ', '-')}-fixture.json`]: '{}\n',
  });
  try {
    const result = sanitizer.scanRepository({ root, denyList: SYNTHETIC_DENY_LIST, allowList: [] });

    assert.deepEqual(
      result.violations.filter(v => v.file === 'notes.md'),
      [{ file: 'notes.md', line: 2, label: 'synthetic studio name' }]
    );
    assert.deepEqual(labelsFor(result, 'camel.ts'), ['synthetic studio name']);
    assert.deepEqual(labelsFor(result, 'hyphen.json'), ['synthetic studio name']);
    assert.deepEqual(labelsFor(result, 'mail.txt'), ['synthetic handle']);
    assert.deepEqual(
      result.violations.filter(v => v.file === 'keys.mts').map(v => v.line),
      [1, 2],
      'a key embedded in a longer alphanumeric run is still found'
    );
    assert.deepEqual(
      result.violations.filter(v => v.file === 'nodes.svg').map(v => v.line),
      [1, 2],
      'both the URL hyphen form and the colon form are found'
    );
    const pathHit = result.violations.find(v => v.line === null);
    assert.equal(pathHit?.label, 'synthetic studio name');
    assert.match(pathHit.file, /-fixture\.json$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('normalises NFKC compatibility characters and case before hashing', () => {
  const fullwidth = 'Ｑｕａｒｔｚ　Ａｔｅｌｉｅｒ';
  const root = makeTree({ 'wide.md': `${fullwidth}\n` });
  try {
    const result = sanitizer.scanRepository({ root, denyList: SYNTHETIC_DENY_LIST, allowList: [] });
    assert.deepEqual(labelsFor(result, 'wide.md'), ['synthetic studio name']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('splits camel-case compounds so an embedded name is still found', () => {
  const root = makeTree({
    'compound.ts': `export const ${SYNTHETIC.name.replace(' ', '')}Fixture = {};\n`,
    'lower.ts': `const key = '${SYNTHETIC.fileKey}';\n`,
  });
  try {
    const result = sanitizer.scanRepository({ root, denyList: SYNTHETIC_DENY_LIST, allowList: [] });
    assert.deepEqual(labelsFor(result, 'compound.ts'), ['synthetic studio name']);
    assert.deepEqual(
      labelsFor(result, 'lower.ts'),
      ['synthetic Figma file key'],
      'camel-case splitting must not break mixed-case file keys'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('passes a clean tree against the real deny list', () => {
  const root = makeTree({
    'README.md': 'Teul keeps source, approximation, and generated output separate.\n',
    'src/lib/example.ts':
      "export const digest = 'ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12';\n",
    'docs/receipt.json': '{"finishedAt":"2026-09-07T13:45:12Z","time":"12:30","nodeLike":"1-2"}\n',
    'fixtures/key-shaped.txt': 'ABCDEFGHIJKLMNOPQRSTUV zzzzzzzzzzzzzzzzzzzzzz\n',
    'dist/ui.html': '<html><script>const x="Quartz";</script></html>\n',
  });
  try {
    const result = sanitizer.scanRepository({ root });
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.allowed, []);
    assert.equal(result.scannedTextFiles, 5);
    assert.deepEqual(result.artifactDirectories, ['dist']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('skips ignored directories and binaries but scans built artifacts', () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const root = makeTree({
    'node_modules/dep/index.js': `${SYNTHETIC.name}\n`,
    'out/preview/index.html': `${SYNTHETIC.name}\n`,
    'coverage/report.txt': `${SYNTHETIC.name}\n`,
    'release/notes.md': `${SYNTHETIC.name}\n`,
    '.husky/_/h': `${SYNTHETIC.name}\n`,
    '.claude/worktrees/x/README.md': `${SYNTHETIC.name}\n`,
    'docs/shot.png': Buffer.concat([pngHeader, Buffer.from(SYNTHETIC.name)]),
    'docs/binary.bin': Buffer.concat([Buffer.from([0]), Buffer.from(SYNTHETIC.name)]),
    'dist/code.js': `var owner="${SYNTHETIC.name}";\n`,
    'figma-candidate/dist/ui.html': `<b>${SYNTHETIC.nodeId}</b>\n`,
  });
  try {
    const result = sanitizer.scanRepository({ root, denyList: SYNTHETIC_DENY_LIST, allowList: [] });
    assert.deepEqual(result.violations.map(v => `${v.file}:${v.label}`).sort(), [
      'dist/code.js:synthetic studio name',
      'figma-candidate/dist/ui.html:synthetic Figma node ID',
    ]);
    assert.deepEqual(result.artifactDirectories, ['dist', 'figma-candidate/dist']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the allow list suppresses only the listed label for the listed file', () => {
  const root = makeTree({
    'docs/HISTORY.md': `${SYNTHETIC.name} was rejected.\nAlso ${SYNTHETIC.handle} was rejected.\n`,
    'docs/OTHER.md': `${SYNTHETIC.name}\n`,
  });
  try {
    const result = sanitizer.scanRepository({
      root,
      denyList: SYNTHETIC_DENY_LIST,
      allowList: [
        { file: 'docs/HISTORY.md', labels: ['synthetic studio name'], reason: 'historical record' },
      ],
    });
    assert.deepEqual(
      result.violations.map(v => `${v.file}:${v.line}:${v.label}`),
      ['docs/HISTORY.md:2:synthetic handle', 'docs/OTHER.md:1:synthetic studio name']
    );
    assert.deepEqual(result.allowed, [
      {
        file: 'docs/HISTORY.md',
        label: 'synthetic studio name',
        reason: 'historical record',
        lines: [1],
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the gate script stores digests only, never an identifier or fragment', () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8');
  assert.equal(
    /(?<![A-Za-z0-9])[A-Za-z0-9]{22}(?![A-Za-z0-9])/.test(source),
    false,
    'no 22-character key-shaped token'
  );
  assert.equal(/\d+:\d+/.test(source), false, 'no node-ID-shaped digit pair');
  assert.equal(
    /\[\s*'[^']*'\s*,\s*'[^']*'\s*\]\s*\.join\(/.test(source),
    false,
    'no string-fragment arrays joined into an identifier'
  );

  const digests = sanitizer.DENY_LIST.flatMap(entry => Object.values(entry.digests).flat());
  assert.equal(digests.length, 16);
  assert.equal(new Set(digests).size, digests.length);
  for (const value of digests) assert.match(value, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    sanitizer.DENY_LIST.map(entry => entry.label),
    [
      'private personal-lab name',
      'private corporate brand name',
      'private account or fixture identifier',
      'private pilot host name',
      'private Figma file key',
      'private Figma node ID',
    ]
  );
  for (const entry of sanitizer.ALLOW_LIST) {
    assert.match(entry.file, /^docs\//, 'allowances are limited to historical docs');
    assert.ok(entry.labels.length > 0 && entry.reason.length > 0);
  }
});

test('candidate extraction covers each documented shape', () => {
  const candidates = sanitizer.extractCandidates(
    `See Alpha Beta Gamma, mail x@Omega-Labs.example, run ${SYNTHETIC.fileKey}ZZ and 12-34.`
  );
  assert.ok(candidates.name.has('alpha beta'));
  assert.ok(candidates.name.has('alphabeta'));
  assert.ok(candidates.name.has('alpha beta gamma'));
  assert.ok(candidates.name.has('alphabetagamma'));
  assert.ok(candidates.handle.has('@omega-labs'));
  assert.ok(candidates.handle.has('@omega'));
  assert.ok(candidates['file-key'].has(SYNTHETIC.fileKey.toLowerCase()));
  assert.equal(candidates['file-key'].size, 3, 'sliding windows over a 24-character run');
  assert.deepEqual([...candidates['node-id']], ['12:34']);
});
