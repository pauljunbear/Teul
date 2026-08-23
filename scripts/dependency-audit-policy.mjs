#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LEDGER_URL = new URL('../docs/dependency-audit-exceptions.json', import.meta.url);
const REVIEWED_ON = '2026-08-23';
const SEVERITY_RANK = Object.freeze({
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
});

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validateReport(report, label) {
  const errors = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return [`${label} audit did not return a JSON object.`];
  }
  if (report.error) {
    const detail =
      report.error.summary || report.error.detail || report.message || JSON.stringify(report.error);
    errors.push(`${label} audit returned an npm error: ${String(detail)}`);
  }
  if (report.auditReportVersion !== 2) {
    errors.push(
      `${label} audit report version must be 2; received ${String(report.auditReportVersion)}.`
    );
  }
  if (!report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
    errors.push(`${label} audit report is missing its vulnerabilities map.`);
  }
  return errors;
}

function validateLedger(ledger) {
  const errors = [];
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    return ['Dependency-audit exception ledger must be a JSON object.'];
  }
  if (ledger.schemaVersion !== 1) {
    errors.push(
      `Exception ledger schemaVersion must be 1; received ${String(ledger.schemaVersion)}.`
    );
  }
  if (!isIsoDate(ledger.reviewedOn) || ledger.reviewedOn !== REVIEWED_ON) {
    errors.push(`Exception ledger reviewedOn must remain ${REVIEWED_ON}.`);
  }
  if (!Array.isArray(ledger.exceptions) || ledger.exceptions.length !== 0) {
    errors.push('Dependency audit is fail-closed: the exception ledger must remain empty.');
  }
  return errors;
}

export function evaluateAuditReports({ productionReport, allReport, ledger }) {
  const errors = [
    ...validateReport(productionReport, 'Production'),
    ...validateReport(allReport, 'All-dependency'),
    ...validateLedger(ledger),
  ];

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  for (const [name, vulnerability] of Object.entries(productionReport.vulnerabilities)) {
    if (!vulnerability || typeof vulnerability !== 'object') {
      errors.push(`Production dependency ${name} has a malformed vulnerability record.`);
      continue;
    }
    const rank = SEVERITY_RANK[vulnerability.severity];
    if (rank === undefined || rank >= SEVERITY_RANK.moderate) {
      errors.push(
        `Production dependency ${name} has ${String(vulnerability.severity)} severity; production must be clean at moderate or higher.`
      );
    }
  }

  const allEntries = Object.entries(allReport.vulnerabilities);
  for (const [name, vulnerability] of allEntries) {
    if (!vulnerability || typeof vulnerability !== 'object') {
      errors.push(`All-dependency vulnerability ${name} has a malformed record.`);
      continue;
    }
    errors.push(`Unexpected all-dependency vulnerability: ${name} (${String(vulnerability.severity)}).`);
  }

  return {
    ok: errors.length === 0,
    errors,
    exceptionUsed: false,
  };
}

function runNpmAudit(args, label) {
  const result = spawnSync('npm', ['audit', ...args, '--json'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`${label} audit could not start: ${result.error.message}`);
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `${label} audit exited ${String(result.status)}: ${(result.stderr || result.stdout || 'no output').trim()}`
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} audit did not return valid JSON.`);
  }
}

export function runAuditPolicy() {
  const ledger = JSON.parse(readFileSync(LEDGER_URL, 'utf8'));
  const productionReport = runNpmAudit(['--omit=dev', '--audit-level=moderate'], 'Production');
  const allReport = runNpmAudit(['--audit-level=moderate'], 'All-dependency');
  return evaluateAuditReports({ productionReport, allReport, ledger });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = runAuditPolicy();
    if (!result.ok) {
      console.error('Dependency audit policy failed:');
      for (const error of result.errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else {
      console.log('Dependency audit policy passed: production and development dependencies are clean; no exceptions are allowed.');
    }
  } catch (error) {
    console.error(
      `Dependency audit policy failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
