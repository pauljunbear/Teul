'use strict';

/**
 * Generic candidate sanitization gate.
 *
 * Teul's public tree must never carry the donor programme's private
 * identifiers: private Figma file keys, six private Figma node IDs, a
 * personal-lab name, a corporate brand phrase, a private pilot host name, and
 * a private account or fixture identifier. This gate scans every text file in
 * the repository, including the built `dist/` and `figma-candidate/dist/`
 * when present, and fails on a hit.
 *
 * The identifiers are not stored here, not even as fragments. The deny list
 * holds SHA-256 digests of their normalised forms. The scanner extracts
 * candidates from each file by shape, normalises and hashes them, and compares
 * digests:
 *
 * - `file-key`: every 22-character window of an alphanumeric run, lower-cased.
 * - `node-id`: digits, a colon or hyphen, digits, bounded by non-alphanumerics
 *   and normalised to the colon form.
 * - `name`: NFKC-normalised, lower-cased words and runs of two or three
 *   adjacent words, both space-separated and concatenated.
 * - `handle`: `@` followed by a label, plus the label's leading alphanumeric run.
 *
 * Trade-off: the digests hide the identifiers from readers of this file, but a
 * short node ID can be recovered by enumeration. The deny list is a hygiene
 * measure for the public tree, not a secret store.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const KEY_LENGTH = 22;
const MIN_CANDIDATE_LENGTH = 3;
const MAX_CANDIDATE_LENGTH = 64;
const BINARY_PROBE_BYTES = 8000;
const CANDIDATE_KINDS = Object.freeze(['name', 'handle', 'file-key', 'node-id']);

/** SHA-256 digests of the normalised rejected identifiers, grouped by kind. */
const DENY_LIST = Object.freeze([
  {
    label: 'private personal-lab name',
    digests: {
      name: [
        '6f298f657699c507d0cec7af3ee00e088b775fbd8e0b982bf69b0ed677dccb4f',
        '236b0c400b5335188f0f2eea9e03288b7ced3da3910e15b7817a9ccadc3cf9da',
      ],
    },
  },
  {
    label: 'private corporate brand name',
    digests: {
      name: [
        '0cab0bd28498373b1e0540b12ca667848936ffa3ec7891290c9da274dfc6259e',
        '64d8687cd59d7475f604359940c63576cf8a0c9260d42b2c8c902ad97afd9b93',
      ],
    },
  },
  {
    label: 'private account or fixture identifier',
    digests: {
      name: [
        '4762a7370cb04338e324691ce6e9184b167730dcd58903967ddfb81725fd24a0',
        'd132fc01acbc89341f9934394c3ed123969abaa2160eff2abb2210cbd076d3a4',
      ],
      handle: ['2439eaf09465573f2e68109057ef3ca9879e45b11038aacb792db3310d2d11a4'],
    },
  },
  {
    label: 'private pilot host name',
    digests: {
      name: ['ff153a38665afec38c9fa6aa3261bd94afb485098db10a21d257729711578ff3'],
    },
  },
  {
    label: 'private Figma file key',
    digests: {
      'file-key': [
        'd33941c3dbf9cec2497df3ca31b395f50378987156341ed277168b7452641157',
        'fe443c598fcde645966c6246cf9bae09422026df5405b88185fbf96029db1a1c',
      ],
    },
  },
  {
    label: 'private Figma node ID',
    digests: {
      'node-id': [
        '4c2a374f473b7c6e2ec8f5eb3a8d1d2e85a59901854e8cac91bf4e49d0efe8c7',
        '2110cc3d911622934f0c59fb78c1d3ad602f4abde4211705a823eebf04262a62',
        'd1245f0cc4dfd49ec3b9fdce55877cf0422d6ab490c3b6bc1c503549bacaee07',
        'a1fc391f503b2dbec04f63fb10321781f1c20c188fac7093f4d5ed48612b8d0b',
        '377e6681ad94fb52834ac43f0b3afffa955ebf5ad30a964cf49e4853be884219',
        'cf7b2d544448a4312b6f59a86e55d0e450f1af06ab329978675da2221cbbb5ca',
      ],
    },
  },
]);

/**
 * Historical governance records may name a rejected private source only to
 * record its exclusion (see REQ-900 in
 * docs/prds/2026-09-02-teul-current-reconciliation.md). Each entry suppresses
 * one label for one exact file; every other label still fails on that file.
 */
const ALLOW_LIST = Object.freeze([
  {
    // 2026-08-23 donor review: one line lists the rejected private fixture
    // names in order to record that they were excluded. Preserved as history.
    file: 'docs/DONOR_RECONCILIATION_2026-08-23.md',
    labels: ['private personal-lab name'],
    reason:
      'Historical donor-review record names the rejected source only to document its exclusion.',
  },
  {
    // 2026-09-02 reconciliation PRD: one non-goal line names the rejected
    // private evidence that must not be imported. Preserved as history.
    file: 'docs/prds/2026-09-02-teul-current-reconciliation.md',
    labels: ['private personal-lab name'],
    reason: 'Historical PRD non-goal names the rejected source only to document its exclusion.',
  },
]);

const SKIP_DIRECTORY_NAMES = new Set([
  '.git',
  '.claude',
  '.codex-private-quarantine',
  '.npm-cache',
  'coverage',
  'node_modules',
  'node_modules.generated',
  'node_modules.partial',
  'node_modules.shared',
  'out',
  'release',
]);
const SKIP_RELATIVE_PATHS = new Set(['.husky/_']);
const SKIP_FILE_NAME_PATTERNS = [/^\.env(?:\..+)?$/, /\.log(?:\..+)?$/, /^\.DS_Store$/];
const BINARY_EXTENSIONS = new Set([
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp4',
  '.otf',
  '.pdf',
  '.png',
  '.ttf',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
  '.zst',
]);
const ARTIFACT_DIRECTORIES = ['dist', 'figma-candidate/dist'];

const WORD_PATTERN = /[\p{L}\p{N}]+/gu;
const HANDLE_PATTERN = /@([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;
const LEADING_ALPHANUMERIC_PATTERN = /^[\p{L}\p{N}]+/u;
const KEY_RUN_PATTERN = new RegExp(`[A-Za-z0-9]{${KEY_LENGTH},}`, 'g');
const NODE_ID_PATTERN = /(?<![\p{L}\p{N}])(\d+)[:-](\d+)(?![\p{L}\p{N}])/gu;

function digest(candidate) {
  return crypto.createHash('sha256').update(candidate, 'utf8').digest('hex');
}

function normalizeText(text) {
  return text.normalize('NFKC').toLowerCase();
}

/** Split camel-case compounds so "AlphaBetaFixture" yields the words alpha, beta, fixture. */
function splitCamelCase(text) {
  return text.normalize('NFKC').replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2');
}

function addCandidate(sink, candidate) {
  if (candidate.length >= MIN_CANDIDATE_LENGTH && candidate.length <= MAX_CANDIDATE_LENGTH) {
    sink.add(candidate);
  }
}

/** Extract shape-based candidates from one line or path. Returns a Set per kind. */
function extractCandidates(rawText) {
  const text = normalizeText(rawText);
  const candidates = Object.fromEntries(CANDIDATE_KINDS.map(kind => [kind, new Set()]));

  // Words come from the camel-split text; keys, handles, and node IDs from the
  // plain normalised text, because splitting would break mixed-case keys.
  const words = normalizeText(splitCamelCase(rawText)).match(WORD_PATTERN) || [];
  for (let index = 0; index < words.length; index += 1) {
    let spaced = words[index];
    let joined = words[index];
    addCandidate(candidates.name, spaced);
    for (let extra = 1; extra <= 2 && index + extra < words.length; extra += 1) {
      spaced += ` ${words[index + extra]}`;
      joined += words[index + extra];
      addCandidate(candidates.name, spaced);
      addCandidate(candidates.name, joined);
    }
  }

  for (const match of text.matchAll(HANDLE_PATTERN)) {
    const label = match[1];
    addCandidate(candidates.handle, `@${label}`);
    const leading = label.match(LEADING_ALPHANUMERIC_PATTERN);
    if (leading) addCandidate(candidates.handle, `@${leading[0]}`);
  }

  for (const match of text.matchAll(KEY_RUN_PATTERN)) {
    const run = match[0];
    for (let start = 0; start + KEY_LENGTH <= run.length; start += 1) {
      candidates['file-key'].add(run.slice(start, start + KEY_LENGTH));
    }
  }

  for (const match of text.matchAll(NODE_ID_PATTERN)) {
    candidates['node-id'].add(`${match[1]}:${match[2]}`);
  }

  return candidates;
}

/** Build the plaintext-free deny entry for tests and future additions. */
function createDenyEntry(label, identifiers) {
  const digests = {};
  const add = (kind, values) => {
    if (!values || values.length === 0) return;
    digests[kind] = values.map(value => digest(value));
  };
  add(
    'name',
    (identifiers.names || []).flatMap(name => {
      const words = normalizeText(name).match(WORD_PATTERN) || [];
      return [words.join(' '), words.join('')];
    })
  );
  add(
    'handle',
    (identifiers.handles || []).map(handle => normalizeText(handle))
  );
  add(
    'file-key',
    (identifiers.fileKeys || []).map(key => normalizeText(key))
  );
  add(
    'node-id',
    (identifiers.nodeIds || []).map(nodeId => normalizeText(nodeId).replace('-', ':'))
  );
  return { label, digests };
}

function buildDenyIndex(denyList) {
  const index = new Map(CANDIDATE_KINDS.map(kind => [kind, new Map()]));
  for (const entry of denyList) {
    for (const [kind, digests] of Object.entries(entry.digests)) {
      if (!index.has(kind)) {
        throw new Error(`Unknown deny-list kind "${kind}" for ${entry.label}.`);
      }
      for (const value of digests) index.get(kind).set(value, entry.label);
    }
  }
  return index;
}

function matchCandidates(candidates, denyIndex, cache) {
  const labels = new Set();
  for (const kind of CANDIDATE_KINDS) {
    const kindIndex = denyIndex.get(kind);
    if (kindIndex.size === 0) continue;
    const kindCache = cache.get(kind);
    for (const candidate of candidates[kind]) {
      let label = kindCache.get(candidate);
      if (label === undefined) {
        label = kindIndex.get(digest(candidate)) || null;
        kindCache.set(candidate, label);
      }
      if (label) labels.add(label);
    }
  }
  return labels;
}

function createCache() {
  return new Map(CANDIDATE_KINDS.map(kind => [kind, new Map()]));
}

/** Scan one text. Returns `{ line, label }` hits with 1-based line numbers. */
function scanText(text, denyIndex, cache = createCache()) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].length === 0) continue;
    for (const label of matchCandidates(extractCandidates(lines[index]), denyIndex, cache)) {
      hits.push({ line: index + 1, label });
    }
  }
  return hits;
}

function listFiles(root) {
  const files = [];
  const visit = relativeDirectory => {
    const absolute = path.join(root, relativeDirectory);
    const entries = fs.readdirSync(absolute, { withFileTypes: true });
    entries.sort((first, second) => first.name.localeCompare(second.name));
    for (const entry of entries) {
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORY_NAMES.has(entry.name) || SKIP_RELATIVE_PATHS.has(relative)) continue;
        visit(relative);
        continue;
      }
      if (!entry.isFile()) continue;
      if (SKIP_FILE_NAME_PATTERNS.some(pattern => pattern.test(entry.name))) continue;
      files.push(relative);
    }
  };
  visit('');
  return files;
}

function readTextFile(absolutePath) {
  if (BINARY_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) return null;
  const buffer = fs.readFileSync(absolutePath);
  if (buffer.subarray(0, BINARY_PROBE_BYTES).includes(0)) return null;
  return buffer.toString('utf8');
}

/** Scan a repository root. Returns violations, allowed historical hits, and counts. */
function scanRepository({ root = ROOT, denyList = DENY_LIST, allowList = ALLOW_LIST } = {}) {
  const denyIndex = buildDenyIndex(denyList);
  const files = listFiles(root);
  const violations = [];
  const allowedByKey = new Map();
  let scannedTextFiles = 0;

  const record = (file, line, label) => {
    const allowance = allowList.find(entry => entry.file === file && entry.labels.includes(label));
    if (!allowance) {
      violations.push({ file, line, label });
      return;
    }
    const key = `${file} ${label}`;
    if (!allowedByKey.has(key)) {
      allowedByKey.set(key, { file, label, reason: allowance.reason, lines: [] });
    }
    if (line !== null) allowedByKey.get(key).lines.push(line);
  };

  for (const file of files) {
    const cache = createCache();
    for (const label of matchCandidates(extractCandidates(file), denyIndex, cache)) {
      record(file, null, label);
    }
    const text = readTextFile(path.join(root, file));
    if (text === null) continue;
    scannedTextFiles += 1;
    for (const hit of scanText(text, denyIndex, cache)) record(file, hit.line, hit.label);
  }

  return {
    root,
    listedFiles: files.length,
    scannedTextFiles,
    artifactDirectories: ARTIFACT_DIRECTORIES.filter(directory =>
      fs.existsSync(path.join(root, directory))
    ),
    violations,
    allowed: [...allowedByKey.values()],
  };
}

function runCli({ root = ROOT, log = console.log, error = console.error } = {}) {
  const started = Date.now();
  const result = scanRepository({ root });
  for (const entry of result.allowed) {
    log(
      `Allowed historical record: ${entry.file} (${entry.lines.length} line(s)) — ${entry.label}. ${entry.reason}`
    );
  }
  if (result.violations.length > 0) {
    error('Generic candidate sanitization failed:');
    for (const violation of result.violations) {
      const location = violation.line === null ? ' (path)' : ` line ${violation.line}`;
      error(`- ${violation.file}${location}: ${violation.label}`);
    }
    return 1;
  }
  const artifacts =
    result.artifactDirectories.length > 0 ? result.artifactDirectories.join(', ') : 'none present';
  log(
    `Generic candidate sanitization passed: ${result.scannedTextFiles} text files scanned of ${result.listedFiles} listed in ${Date.now() - started} ms; built artifacts scanned: ${artifacts}.`
  );
  return 0;
}

module.exports = {
  ALLOW_LIST,
  CANDIDATE_KINDS,
  DENY_LIST,
  KEY_LENGTH,
  buildDenyIndex,
  createDenyEntry,
  digest,
  extractCandidates,
  listFiles,
  normalizeText,
  runCli,
  scanRepository,
  scanText,
};

if (require.main === module) {
  process.exitCode = runCli();
}
