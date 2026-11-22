import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DOTTED_NAME,
  NOUN_NAMES,
  PHRASE,
  PLAIN_NAMES,
  SIZE_NAME,
  scanLine,
  scanRepository,
} from './verify-no-third-party-brands.mjs';

// Built from the guard's own fragments so this file is not itself a hit.
const [first, second, third] = PLAIN_NAMES;
const [noun, flake] = NOUN_NAMES;
const lower = value => value.toLowerCase();
const capital = value => value[0].toUpperCase() + value.slice(1);

test('the eleven names are all covered', () => {
  assert.equal(new Set([...PLAIN_NAMES, ...NOUN_NAMES, SIZE_NAME, DOTTED_NAME]).size, 11);
});

test('company forms fail', () => {
  const cases = [];
  for (const name of PLAIN_NAMES) {
    cases.push(
      [`The ${name} guideline`, 'brand-word'],
      [`the ${lower(name)} case`, 'brand-word'],
      [`${name.toUpperCase()} FILE`, 'brand-word'],
      [`${name}'s palette`, 'brand-word'],
      [`${lower(name)}-development/check.mjs`, 'brand-word'],
      [`const load${capital(lower(name))}Pdf = 1;`, 'brand-word'],
      [`"${lower(name)}": {`, 'brand-word'],
      [`${name.toUpperCase()}_ID`, 'brand-word'],
      [`https://www.${lower(name)}.com/x`, 'brand-domain']
    );
  }
  for (const name of NOUN_NAMES) {
    cases.push(
      [`The ${name} guideline`, 'brand-capitalised'],
      [`${name}'s pairing page`, 'brand-capitalised'],
      [`${name.toUpperCase()} SOURCE`, 'brand-capitalised'],
      [`${lower(name)}-development/after.json`, 'brand-capitalised'],
      [`project:${lower(name)}:2019`, 'brand-capitalised'],
      [`check-${lower(name)}-table.mjs`, 'brand-capitalised'],
      [`${lower(name)}Fixture`, 'brand-capitalised'],
      [`historical${name}Bindings`, 'brand-capitalised'],
      [`${lower(name)}.com`, 'brand-domain']
    );
  }
  cases.push(
    [`${PHRASE[0]} ${PHRASE[1]} guideline`, 'brand-phrase'],
    [`the ${DOTTED_NAME} colour page`, 'brand-dotted'],
    [`https://design-system.service.${lower(DOTTED_NAME)}/styles/`, 'brand-dotted'],
    [`${lower(DOTTED_NAME).replace('.', '-')}-case`, 'brand-dotted'],
    [`${lower(DOTTED_NAME).replace('.', '')}`, 'brand-dotted'],
    [`https://${lower(SIZE_NAME)}.com/design`, 'brand-domain'],
    [`"projectId": "project:${lower(SIZE_NAME)}:2019"`, 'brand-id'],
    [`"brand": "${SIZE_NAME}",`, 'brand-id']
  );
  for (const [line, rule] of cases) assert.ok(scanLine(line).includes(rule), `${rule}: ${line}`);
});

test('ordinary words pass', () => {
  const lines = [
    `A tower ${lower(noun)} lifts the beam.`,
    `the first ${lower(flake)} of winter`,
    `${lower(noun)}s and ${lower(flake)}s`,
    `Severity: ${SIZE_NAME}`,
    `{ family: 'Inter', style: '${SIZE_NAME}' }`,
    `a ${lower(SIZE_NAME)} weight`,
    `the ${lower(PHRASE[0])} ${lower(PHRASE[1])} platform`,
    `${PHRASE[0]} website capture`,
    `aria-label="${PHRASE[0]} website capture"`,
    'Robin Hood and his band',
    'Brand A, Brand B and Brand K',
    'https://brand-d.example/brand-guidelines',
    'beginning',
    `B${lower(PLAIN_NAMES[6])}i`,
    `${PHRASE[0]}Webinar`,
  ];
  for (const line of lines) assert.deepEqual(scanLine(line), [], line);
  // Longer ordinary words that merely start with a name stay clear.
  assert.deepEqual(scanLine(`${lower(first)}s`), []);
  assert.deepEqual(scanLine(`x${lower(second)}y`), []);
  assert.deepEqual(scanLine(`${lower(third)}er`), []);
});

test('split, quoted, file-name and id forms fail', () => {
  const [open, web] = PHRASE;
  const sweet = PLAIN_NAMES[2].slice(0, 5);
  const green = PLAIN_NAMES[2].slice(5);
  const size = lower(SIZE_NAME);
  const cases = [
    [`const ${lower(open)}${web}Case = 1;`, 'brand-word'],
    [`${lower(open)}-${lower(web)}-development`, 'brand-word'],
    [`${open}-${web} guideline`, 'brand-word'],
    [`${sweet}${capital(green)} palette`, 'brand-word'],
    [`"systemId": "${lower(flake)}"`, 'brand-capitalised'],
    [`"${lower(noun)}": {`, 'brand-capitalised'],
    [`source: ${lower(noun)}.pdf`, 'brand-capitalised'],
    [`https://x.${lower(flake)}computing.com/`, 'brand-domain'],
    [`${DOTTED_NAME.replace('.', ' ')} colour page`, 'brand-dotted'],
    [`evidence:${size}:undated`, 'brand-id'],
    [`"caseId": "dev-04-${size}-interface-states"`, 'brand-id'],
    [`"systemId": "${size}"`, 'brand-id'],
    [`${capital(size)}-Brand-Guidelines.pdf`, 'brand-id'],
  ];
  for (const [line, rule] of cases) assert.ok(scanLine(line).includes(rule), `${rule}: ${line}`);
  for (const line of [
    `"role": "${size}"`,
    `"primaryAnchor": "Blue ${SIZE_NAME}"`,
    `"${lower(noun)} operator" is a job title`,
    `${lower(open)} web standards`,
  ]) {
    assert.deepEqual(scanLine(line), [], line);
  }
});

test('binary files are checked for domains only', () => {
  assert.deepEqual(scanLine(`\u0000${first}\u0000`, { binary: true }), []);
  assert.deepEqual(scanLine(`x ${lower(first)}.com x`, { binary: true }), ['brand-domain']);
});

test('a repository scan reports content and path hits', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teul-brand-guard-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(path.join(root, 'docs'));
    writeFileSync(path.join(root, 'docs', 'clean.md'), `A ${lower(noun)} lifts. Brand A.\n`);
    writeFileSync(path.join(root, 'docs', 'dirty.md'), `line one\nTested on ${noun}.\n`);
    writeFileSync(path.join(root, `${lower(first)}-development.md`), 'x\n');
    const result = scanRepository({ root });
    assert.deepEqual(
      result.violations.map(v => `${v.file}:${v.line}:${v.rule}`).sort(),
      ['docs/dirty.md:2:brand-capitalised', `${lower(first)}-development.md:null:brand-word`].sort()
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
