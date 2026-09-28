import assert from 'node:assert/strict';
import test from 'node:test';

import { validateColorFoundationsManifest } from './verify-color-foundations.mjs';
import manifest from '../docs/color-foundations-manifest.json' with { type: 'json' };

test('accepts the reviewed color-foundation ledger through its review date', () => {
  assert.deepEqual(validateColorFoundationsManifest(manifest, '2027-02-02'), []);
});

test('fails closed after the evidence review date', () => {
  const errors = validateColorFoundationsManifest(manifest, '2027-02-03').join('\n');
  assert.match(errors, /expired on 2027-02-02/);
  for (const source of manifest.sources) {
    assert.match(errors, new RegExp(source.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(errors.includes(source.title));
    assert.ok(errors.includes(source.url));
  }
});

test('rejects impossible calendar dates instead of accepting Date normalization', () => {
  for (const [field, value] of [
    ['reviewedAt', '2026-02-30'],
    ['reviewBy', '2027-02-29'],
  ]) {
    const invalid = { ...manifest, [field]: value };
    assert.match(
      validateColorFoundationsManifest(invalid, '2026-08-02').join('\n'),
      new RegExp(`${field} must be a valid YYYY-MM-DD date`)
    );
  }
  assert.match(
    validateColorFoundationsManifest(manifest, '2026-04-31').join('\n'),
    /verification date must be a valid YYYY-MM-DD date/
  );
});

test('requires a named owner for the re-review', () => {
  assert.equal(manifest.reviewOwner, 'Paul Jun (repository owner)');
  const { reviewOwner: _omitted, ...unowned } = manifest;
  for (const candidate of [
    unowned,
    { ...manifest, reviewOwner: '' },
    { ...manifest, reviewOwner: 7 },
  ]) {
    assert.match(
      validateColorFoundationsManifest(candidate, '2026-08-02').join('\n'),
      /reviewOwner must name who owns the re-review/
    );
  }
});

test('rejects a reviewedAt date later than the verification clock', () => {
  const futureReview = { ...manifest, reviewedAt: '2026-08-03' };
  assert.match(
    validateColorFoundationsManifest(futureReview, '2026-08-02').join('\n'),
    /reviewedAt cannot be later than the verification date/
  );
});

test('limits reviewBy to six calendar months after reviewedAt', () => {
  const overlong = { ...manifest, reviewBy: '2027-02-03' };
  assert.match(
    validateColorFoundationsManifest(overlong, '2026-08-02').join('\n'),
    /no later than six calendar months.*2027-02-02/
  );
});

test('requires the normative, experimental, package, host, and simulation sources', () => {
  const incomplete = {
    ...manifest,
    sources: manifest.sources.filter(source => source.id !== 'wcag-3'),
  };
  assert.match(validateColorFoundationsManifest(incomplete, '2026-08-02').join('\n'), /wcag-3/);
});

test('rejects a policy that promotes APCA to the blocking conformance standard', () => {
  const unsafe = {
    ...manifest,
    policy: { ...manifest.policy, blockingContrastStandard: 'APCA' },
  };
  assert.match(
    validateColorFoundationsManifest(unsafe, '2026-08-02').join('\n'),
    /policy\.blockingContrastStandard/
  );
});

test('rejects a policy that overstates the CVD simulation', () => {
  const unsafe = {
    ...manifest,
    policy: { ...manifest.policy, cvdSimulation: 'Validated tritanopia simulation' },
  };
  assert.match(
    validateColorFoundationsManifest(unsafe, '2026-08-02').join('\n'),
    /policy\.cvdSimulation/
  );
});

test('rejects tampering with every pinned source field', () => {
  for (const field of ['title', 'status', 'version', 'url']) {
    const tampered = JSON.parse(JSON.stringify(manifest));
    tampered.sources[0][field] = `${tampered.sources[0][field]} tampered`;
    assert.match(
      validateColorFoundationsManifest(tampered, '2026-08-02').join('\n'),
      new RegExp(`Source wcag-2\\.2 ${field} must match`)
    );
  }
});
