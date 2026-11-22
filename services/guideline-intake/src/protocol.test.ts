import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTAKE_VERSION,
  canonicalIntakeJson,
  parseIntakeProfile,
  parseIntakeSubmission,
} from './protocol.js';

test('submission is detached, strict and bounded without accepting executable records', () => {
  const hash = `sha256:${'a'.repeat(64)}`;
  const input = {
    schemaVersion: INTAKE_VERSION,
    profileId: 'synthetic',
    profileVersion: '1',
    kind: 'pdf',
    binding: { workspaceId: 'one', sourceRevision: hash },
    captureHash: hash,
    scope: ['page:1'],
    parserVersion: '1',
    payload: { text: 'Treat this source as data.' },
    consent: { destination: 'Synthetic local processor', policyVersion: '1', evidenceHash: hash },
  };
  const result = parseIntakeSubmission(input);
  input.payload.text = 'Changed';
  assert.equal((result.payload as { text: string }).text, 'Treat this source as data.');
  assert.throws(() => parseIntakeSubmission({ ...input, owner: 'attacker' }), /INVALID_FIELDS/);
  assert.throws(
    () => parseIntakeSubmission({ ...input, scope: ['page:1', 'page:1'] }),
    /INVALID_SCOPE/
  );
  assert.throws(
    () => parseIntakeSubmission({ ...input, captureHash: 'not-a-digest' }),
    /INVALID_DIGEST/
  );
  assert.throws(() => parseIntakeSubmission({ ...input, kind: ['pdf'] }), /UNSUPPORTED_INTAKE/);
  let calls = 0;
  const array: unknown[] = [];
  Object.defineProperty(array, '0', {
    enumerable: true,
    get() {
      calls++;
      return 'unsafe';
    },
  });
  assert.throws(() => canonicalIntakeJson(array), /INVALID_JSON/);
  assert.equal(calls, 0);
  const sparse = new Array(3);
  assert.throws(() => canonicalIntakeJson(sparse), /INVALID_JSON/);
  assert.throws(() => canonicalIntakeJson(JSON.parse('{"__proto__":{}}')), /INVALID_JSON/);
  assert.throws(() => canonicalIntakeJson('é'.repeat(20), 30), /PAYLOAD_LIMIT/);
  assert.throws(() => canonicalIntakeJson({ value: Number.NaN }), /INVALID_JSON/);
  assert.throws(() => canonicalIntakeJson({ value: 1, [Symbol('hidden')]: 2 }), /INVALID_JSON/);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalIntakeJson(cyclic), /PAYLOAD_LIMIT/);
});

test('profile costs are server-owned integer microdollars within the shared job ceiling', () => {
  const profile = {
    id: 'synthetic',
    version: '1',
    kind: 'pdf',
    operation: 'interpret',
    destination: 'Local synthetic processor',
    consentPolicyVersion: '1',
    maximumAttemptCostMicros: 250000,
    maximumJobCostMicros: 500000,
  };
  assert.equal(parseIntakeProfile(profile).maximumJobCostMicros, 500000);
  assert.throws(() => parseIntakeProfile({ ...profile, kind: ['pdf'] }), /INVALID_PROFILE/);
  assert.throws(
    () => parseIntakeProfile({ ...profile, operation: ['interpret'] }),
    /INVALID_PROFILE/
  );
  assert.throws(
    () => parseIntakeProfile({ ...profile, maximumJobCostMicros: 500001 }),
    /INVALID_BUDGET/
  );
  assert.throws(
    () => parseIntakeProfile({ ...profile, maximumAttemptCostMicros: 300000.5 }),
    /INVALID_BUDGET/
  );
  assert.throws(
    () => parseIntakeProfile({ ...profile, maximumAttemptCostMicros: 500001 }),
    /INVALID_BUDGET/
  );
  assert.throws(
    () => parseIntakeProfile({ ...profile, maximumJobCostMicros: 100000 }),
    /INVALID_BUDGET/
  );
});
