import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectStatus,
  daysUntil,
  findNewestReceipt,
  renderStatus,
  writeStatus,
} from './write-status.mjs';

function makeRoot({ withReceipts = true, withCandidate = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teul-status-test-'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(
    path.join(root, 'docs', 'color-foundations-manifest.json'),
    JSON.stringify({
      reviewedAt: '2026-08-02',
      reviewBy: '2027-02-02',
      reviewOwner: 'Paul Jun (repository owner)',
    })
  );
  mkdirSync(path.join(root, 'dist'), { recursive: true });
  writeFileSync(
    path.join(root, 'dist', 'GENERIC_COLOR_BUILDER_CHANNEL.json'),
    JSON.stringify({ channel: 'disabled', qualified: false })
  );
  if (withCandidate) {
    mkdirSync(path.join(root, 'figma-candidate', 'dist'), { recursive: true });
    writeFileSync(
      path.join(root, 'figma-candidate', 'dist', 'GENERIC_COLOR_BUILDER_CHANNEL.json'),
      JSON.stringify({ channel: 'candidate', qualified: false })
    );
  }
  if (withReceipts) {
    for (const [name, status, node] of [
      ['2026-09-06T10-00-00Z-1111111', 'failed', 'v24.0.0'],
      ['2026-09-07T13-45-12Z-abc1234', 'passed', 'v22.23.1'],
      ['2026-09-07T14-00-00Z-broken', null, null],
    ]) {
      const directory = path.join(root, 'docs', 'evidence', 'gates', name);
      mkdirSync(directory, { recursive: true });
      if (status) {
        writeFileSync(
          path.join(directory, 'receipt.json'),
          JSON.stringify({
            status,
            finishedAt: `${name.slice(0, 20).replace(/-/g, (match, offset) => (offset > 10 ? ':' : '-'))}`,
            environment: { node, npm: '10.9.8', shortCommit: name.slice(-7), dirty: false },
            steps: [{ status: 'passed' }, { status: status === 'passed' ? 'passed' : 'failed' }],
          })
        );
      }
    }
  }
  return root;
}

test('the newest readable receipt wins, skipping directories without receipt.json', () => {
  const root = makeRoot();
  try {
    const newest = findNewestReceipt(root);
    assert.equal(newest.directory, 'docs/evidence/gates/2026-09-07T13-45-12Z-abc1234');
    assert.equal(newest.receipt.status, 'passed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('collects channels, receipt, and standards dates; git fields are null outside a repository', () => {
  const root = makeRoot({ withCandidate: true });
  try {
    const status = collectStatus({ rootDir: root, asOf: '2026-09-08' });
    assert.equal(status.version, '1.0.0');
    assert.deepEqual(
      status.channels.map(channel => [channel.present, channel.channel, channel.qualified]),
      [
        [true, 'disabled', false],
        [true, 'candidate', false],
      ]
    );
    assert.deepEqual(status.standards, {
      reviewedAt: '2026-08-02',
      reviewBy: '2027-02-02',
      reviewOwner: 'Paul Jun (repository owner)',
      asOf: '2026-09-08',
      daysRemaining: 147,
    });
    assert.equal(status.receipt.receipt.environment.node, 'v22.23.1');
    assert.ok(status.describe === null || typeof status.describe === 'string');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('renders a stable Markdown status with every section', () => {
  const markdown = renderStatus({
    describe: '8e68cad',
    branch: 'main',
    version: '1.0.0',
    channels: [
      {
        label: 'Production build',
        path: 'dist/GENERIC_COLOR_BUILDER_CHANNEL.json',
        present: true,
        channel: 'disabled',
        qualified: false,
      },
      {
        label: 'Candidate build',
        path: 'figma-candidate/dist/GENERIC_COLOR_BUILDER_CHANNEL.json',
        present: false,
        channel: null,
        qualified: null,
      },
    ],
    receipt: {
      directory: 'docs/evidence/gates/2026-09-07T13-45-12Z-8e68cad',
      receipt: {
        status: 'passed',
        finishedAt: '2026-09-07T13:45:12.000Z',
        environment: { node: 'v22.23.1', npm: '10.9.8', shortCommit: '8e68cad', dirty: false },
        steps: new Array(17).fill({ status: 'passed' }),
      },
    },
    standards: {
      reviewedAt: '2026-08-02',
      reviewBy: '2027-02-02',
      reviewOwner: 'Paul Jun (repository owner)',
      asOf: '2026-09-08',
      daysRemaining: 147,
    },
  });

  assert.match(markdown, /^# Teul status\n/);
  assert.match(markdown, /- Version: `1\.0\.0` \(`package\.json`\)/);
  assert.match(markdown, /- Commit: `8e68cad` \(`git describe --always`\), branch `main`/);
  assert.match(markdown, /Shipping line: `main` on the owner’s private repository/);
  assert.match(markdown, /`github\.com\/pauljunbear\/Teul` is the Community-facing mirror/);
  assert.match(
    markdown,
    /Production build \(`dist\/GENERIC_COLOR_BUILDER_CHANNEL\.json`\): channel `disabled`, qualified `false`/
  );
  assert.match(
    markdown,
    /Candidate build \(`figma-candidate\/dist\/GENERIC_COLOR_BUILDER_CHANNEL\.json`\): not built on this machine/
  );
  assert.match(
    markdown,
    /Newest receipt: `docs\/evidence\/gates\/2026-09-07T13-45-12Z-8e68cad\/receipt\.md`/
  );
  assert.match(
    markdown,
    /Result: `passed` \(17 of 17 steps passed\), finished 2026-09-07T13:45:12\.000Z/
  );
  assert.match(markdown, /Runtime: Node v22\.23\.1, npm 10\.9\.8, commit `8e68cad`/);
  assert.match(markdown, /reviewed 2026-08-02, review by 2027-02-02/);
  assert.match(
    markdown,
    /- Standards re-review: due 2027-02-02, owner Paul Jun \(repository owner\), 147 days remaining \(as of 2026-09-08\)\./
  );
  assert.ok(markdown.endsWith('\n'));
  assert.equal(markdown.includes('[TK]'), false);
});

test('counts days to the standards re-review from the generation date, including overdue', () => {
  assert.equal(daysUntil('2027-02-02', '2026-09-08'), 147);
  assert.equal(daysUntil('2027-02-02', '2027-02-02'), 0);
  assert.equal(daysUntil('2027-02-02', '2027-02-05'), -3);
  assert.equal(daysUntil('not-a-date', '2026-09-08'), null);

  const overdue = renderStatus({
    describe: null,
    branch: null,
    version: null,
    channels: [],
    receipt: null,
    standards: {
      reviewedAt: '2026-08-02',
      reviewBy: '2027-02-02',
      reviewOwner: 'Paul Jun (repository owner)',
      asOf: '2027-02-05',
      daysRemaining: -3,
    },
  });
  assert.match(
    overdue,
    /Standards re-review: due 2027-02-02, owner Paul Jun \(repository owner\), overdue by 3 days \(as of 2027-02-05\)\./
  );

  const unowned = renderStatus({
    describe: null,
    branch: null,
    version: null,
    channels: [],
    receipt: null,
    standards: {
      reviewedAt: '2026-08-02',
      reviewBy: '2027-02-02',
      reviewOwner: null,
      asOf: '2026-09-08',
      daysRemaining: 147,
    },
  });
  assert.match(unowned, /owner \[TK\], 147 days remaining/);
});

test('renders the no-receipt state and marks missing values with [TK]', () => {
  const markdown = renderStatus({
    describe: null,
    branch: null,
    version: null,
    channels: [],
    receipt: null,
    standards: null,
  });
  assert.match(markdown, /No receipts under `docs\/evidence\/gates\/` yet/);
  assert.match(markdown, /Version: `\[TK\]`/);
  assert.match(markdown, /color-foundations-manifest\.json`\): missing\./);
});

test('writeStatus writes STATUS.md at the root', () => {
  const root = makeRoot({ withReceipts: false });
  try {
    const markdown = writeStatus({ rootDir: root });
    assert.match(markdown, /No receipts under/);
    assert.match(markdown, /Candidate build .*: not built on this machine/);
    assert.ok(existsSync(path.join(root, 'STATUS.md')));
    assert.equal(readFileSync(path.join(root, 'STATUS.md'), 'utf8'), markdown);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
