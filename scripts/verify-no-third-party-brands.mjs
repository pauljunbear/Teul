#!/usr/bin/env node

/**
 * Third-party brand guard.
 *
 * Teul's development notes and fixtures once named eleven real companies whose
 * published brand guidelines were used as development and test sources for the
 * guideline import work. Those names were replaced by neutral stand-ins
 * ("Brand A" to "Brand K") or removed with the records that held them. This
 * guard fails when one of them comes back.
 *
 * Three of the names are also ordinary English words (a lifting machine, a
 * size, a flake of snow), and a fourth is an ordinary two-word phrase. The
 * rules below are case-aware so that ordinary prose passes:
 *
 * - `brand-word`: names that are not English words, in any case, as a word or
 *   as a segment of an identifier (`loadNameX`, `name-development`, `NAME_ID`).
 * - `brand-capitalised`: the two names that are also lower-case nouns, only in
 *   their capitalised or all-caps form, or as a segment of an identifier or a
 *   hyphen, underscore, colon or slash compound. The lower-case noun in prose
 *   passes; a sentence that opens with the noun must be written another way.
 * - `brand-phrase`: the two-word company name in title case or joined; the
 *   lower-case phrase passes.
 * - `brand-domain`: any of the companies' web domains, any case. Binary files
 *   are checked for this rule only.
 * - `brand-id`: the publishing company that shares its name with a size is
 *   caught only by its domain and by id forms (`project:<name>`,
 *   `"brand": "<Name>"`), because the capitalised word is an ordinary label
 *   (a font weight, a severity).
 *
 * Limits, stated plainly: a name inside an image, or a lower-case use of an
 * ordinary-word name that only meaning separates, cannot be caught by pattern;
 * review those by eye. The guard scans every tracked or untracked-but-not-
 * ignored text file and path, plus the built `dist/` and `figma-candidate/dist/`
 * when present.
 *
 * The names are assembled from fragments below so this file is not itself a hit.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const join = parts => parts.join('');

/**
 * Names that are not English words: matched in any case. `true` marks names
 * made of two real words, which are also caught split by case or a separator
 * (`twoWords`, `TwoWords`, `two-words`, `Two_Words`).
 */
const PLAIN_PARTS = Object.freeze([
  [['Robin', 'hood'], true],
  [['Kat', 'alon'], false],
  [['Sweet', 'green'], true],
  [['Coin', 'base'], true],
  [['Open', 'Web'], true],
  [['In', 'nit'], false],
  [['Ok', 'ta'], false],
]);
export const PLAIN_NAMES = Object.freeze(PLAIN_PARTS.map(([parts]) => join(parts)));

/** Names that are also lower-case nouns: matched capitalised or in identifiers. */
export const NOUN_NAMES = Object.freeze([join(['Cr', 'ane']), join(['Snow', 'flake'])]);

/** The two-word company name. */
export const PHRASE = Object.freeze([join(['Op', 'en']), join(['W', 'eb'])]);

/** The publishing company that shares its name with a size. */
export const SIZE_NAME = join(['Med', 'ium']);

/** The public-sector design system, written with a dot. */
export const DOTTED_NAME = join(['GO', 'V.', 'UK']);

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const L = '\\p{L}';
const N = '\\p{N}';
const NOT_WORD_BEFORE = `(?<![${L}${N}_$])`;
const NOT_LOWER_AFTER = '(?![\\p{Ll}])';
const SEP = '[-_:/]';

/** Case variants of a name: as written, lower, UPPER and Capitalised. */
const variants = name => {
  const lower = name.toLowerCase();
  return [...new Set([name, lower, name.toUpperCase(), lower[0].toUpperCase() + lower.slice(1)])];
};
const capital = value => value[0].toUpperCase() + value.slice(1).toLowerCase();
const splitForms = ([head, tail]) => {
  const [a, b] = [head.toLowerCase(), tail.toLowerCase()];
  return [
    capital(a) + capital(b),
    a + capital(b),
    ...['-', '_'].flatMap(sep => [a + sep + b, capital(a) + sep + capital(b)]),
  ];
};
const plainAlternation = PLAIN_PARTS.flatMap(([parts, split]) => [
  ...variants(join(parts)),
  ...(split ? splitForms(parts) : []),
])
  .sort((x, y) => y.length - x.length)
  .map(escape)
  .join('|');
const nounAlternation = NOUN_NAMES.map(escape).join('|');
const nounLower = NOUN_NAMES.map(name => escape(name.toLowerCase())).join('|');
const nounUpper = NOUN_NAMES.map(name => escape(name.toUpperCase())).join('|');
const [dottedHead, dottedTail] = DOTTED_NAME.split('.');
const dottedForms = variants(dottedHead)
  .flatMap(head =>
    variants(dottedTail).flatMap(tail => ['.', '-', '_', ''].map(sep => `${head}${sep}${tail}`))
  )
  .concat([`${dottedHead} ${dottedTail}`]);
const dottedAlternation = dottedForms.map(escape).join('|');
const domains = [
  ...PLAIN_NAMES,
  ...NOUN_NAMES,
  SIZE_NAME,
  `${NOUN_NAMES[1]}${join(['comp', 'uting'])}`,
].map(name => escape(name.toLowerCase()));
const sizeLower = escape(SIZE_NAME.toLowerCase());

export const RULES = Object.freeze([
  {
    // Any case, standing alone or as the start or a segment of an identifier.
    // Case-insensitive match on the word, then the next letter must not be a
    // lower-case continuation, so longer ordinary words do not match.
    id: 'brand-word',
    binary: false,
    pattern: new RegExp(
      `(?:${NOT_WORD_BEFORE}|(?<=[\\p{Ll}${N}_$]))(?:${plainAlternation})${NOT_LOWER_AFTER}`,
      'u'
    ),
    // A camelCase segment must start with a capital to count (`loadNameX`).
    accept: (line, match) => {
      const before = line[match.index - 1];
      if (before && /[\p{Ll}\p{N}]/u.test(before)) return /\p{Lu}/u.test(match[0][0]);
      return true;
    },
  },
  {
    id: 'brand-capitalised',
    binary: false,
    pattern: new RegExp(
      [
        // Capitalised or all-caps word, or a camelCase segment.
        `(?:${NOT_WORD_BEFORE}|(?<=[\\p{Ll}${N}]))(?:${nounAlternation}|${nounUpper})${NOT_LOWER_AFTER}`,
        // Lower-case segment of a compound or identifier: name-x, x_name, x:name, nameX.
        `${NOT_WORD_BEFORE}(?:${nounLower})(?=${SEP}[${L}${N}]|\\p{Lu})`,
        `(?<=[${L}${N}]${SEP})(?:${nounLower})(?![${L}${N}])`,
        // A quoted id or a file name: "name", 'name', name.pdf.
        `(?<=["'\`])(?:${nounLower})(?=["'\`])`,
        `${NOT_WORD_BEFORE}(?:${nounLower})(?=\\.(?:pdf|json|md|png|jpe?g|svg|html?|txt|m?js|ts|zip)\\b)`,
      ].join('|'),
      'u'
    ),
  },
  {
    id: 'brand-phrase',
    binary: false,
    pattern: new RegExp(`${NOT_WORD_BEFORE}${PHRASE[0]}[ \\t]+${PHRASE[1]}(?![\\p{Ll}])`, 'u'),
  },
  {
    id: 'brand-dotted',
    binary: false,
    pattern: new RegExp(`${NOT_WORD_BEFORE}(?:${dottedAlternation})(?![\\p{Ll}${N}])`, 'u'),
  },
  {
    id: 'brand-domain',
    binary: true,
    pattern: new RegExp(`(?<![\\w-])(?:${domains.join('|')})\\.(?:com|co|io|net|org)\\b`, 'i'),
  },
  {
    id: 'brand-id',
    binary: false,
    pattern: new RegExp(
      [
        `\\b(?:project|asset|source|brand|case|evidence|system|development|candidate|held-out):${sizeLower}\\b`,
        `"(?:brand|systemId|system|id)"\\s*:\\s*"(?:${escape(SIZE_NAME)}|${sizeLower})"`,
        `\\bdev-\\d+-${sizeLower}-`,
        `\\bundated-${sizeLower}-`,
        `\\b${sizeLower}-brand-guidelines\\b`,
      ].join('|'),
      'i'
    ),
  },
]);

/** Scan one line. Returns the ids of the rules it breaks. */
export function scanLine(line, { binary = false } = {}) {
  const hits = [];
  for (const rule of RULES) {
    if (binary && !rule.binary) continue;
    const global = new RegExp(rule.pattern.source, `${rule.pattern.flags}g`);
    for (const match of line.matchAll(global)) {
      if (!rule.accept || rule.accept(line, match)) {
        hits.push(rule.id);
        break;
      }
    }
  }
  return hits;
}

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

function listRepositoryFiles(root) {
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
  );
  const files = new Set(output.split('\0').filter(Boolean));
  for (const directory of ARTIFACT_DIRECTORIES) {
    const absolute = path.join(root, directory);
    if (!fs.existsSync(absolute)) continue;
    const visit = relative => {
      for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
        const child = `${relative}/${entry.name}`;
        if (entry.isDirectory()) visit(child);
        else if (entry.isFile()) files.add(child);
      }
    };
    visit(directory);
  }
  return [...files].filter(file => fs.existsSync(path.join(root, file))).sort();
}

function isBinary(file, buffer) {
  if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) return true;
  return buffer.subarray(0, 8000).includes(0);
}

/** Scan a repository root. Returns `{ files, violations }`. */
export function scanRepository({ root = ROOT, files = listRepositoryFiles(root) } = {}) {
  const violations = [];
  for (const file of files) {
    for (const rule of scanLine(file)) violations.push({ file, line: null, rule });
    const absolute = path.join(root, file);
    if (!fs.statSync(absolute).isFile()) continue;
    const buffer = fs.readFileSync(absolute);
    const binary = isBinary(file, buffer);
    const text = buffer.toString(binary ? 'latin1' : 'utf8');
    text.split(/\r?\n/).forEach((line, index) => {
      for (const rule of scanLine(line, { binary })) {
        violations.push({ file, line: binary ? null : index + 1, rule });
      }
    });
  }
  return { files: files.length, violations };
}

export function runCli({ root = ROOT, log = console.log, error = console.error } = {}) {
  const started = Date.now();
  const result = scanRepository({ root });
  if (result.violations.length > 0) {
    error(`Third-party brand guard failed with ${result.violations.length} hit(s):`);
    for (const violation of result.violations) {
      const location = violation.line === null ? '' : `:${violation.line}`;
      error(`- ${violation.file}${location} (${violation.rule})`);
    }
    return 1;
  }
  log(
    `Third-party brand guard passed: ${result.files} files and paths scanned in ${Date.now() - started} ms.`
  );
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runCli();
}
