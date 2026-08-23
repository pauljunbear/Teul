import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { evaluateAuditReports } from './dependency-audit-policy.mjs';

const ledger = JSON.parse(
  readFileSync(new URL('../docs/dependency-audit-exceptions.json', import.meta.url), 'utf8')
);

function report(vulnerabilities = {}) {
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: {} },
  };
}

test('passes only when production and development dependencies are clean', () => {
  const result = evaluateAuditReports({
    productionReport: report(),
    allReport: report(),
    ledger,
  });

  assert.equal(result.ok, true);
  assert.equal(result.exceptionUsed, false);
});

test('rejects any all-dependency vulnerability', () => {
  const result = evaluateAuditReports({
    productionReport: report(),
    allReport: report({ surprise: { severity: 'low' } }),
    ledger,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /Unexpected all-dependency vulnerability: surprise/);
});

test('rejects a moderate-or-higher production vulnerability', () => {
  const result = evaluateAuditReports({
    productionReport: report({ runtime: { severity: 'moderate' } }),
    allReport: report(),
    ledger,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /Production dependency runtime has moderate severity/);
});

test('rejects any attempted exception', () => {
  const changedLedger = { ...ledger, exceptions: [{ package: 'brace-expansion' }] };
  const result = evaluateAuditReports({
    productionReport: report(),
    allReport: report(),
    ledger: changedLedger,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /exception ledger must remain empty/);
});

test('rejects malformed audit output', () => {
  const result = evaluateAuditReports({
    productionReport: { error: { summary: 'registry unavailable' } },
    allReport: report(),
    ledger,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /Production audit returned an npm error/);
});
