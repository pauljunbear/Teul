import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { spawn, execFileSync } from 'node:child_process';
// Run the actual pre-history client against V2 storage to prove rollback cannot overwrite it.
const legacyStoreSource = execFileSync(
  'git',
  ['show', 'd1d818b:web/src/lib/guideline/projectStore.ts'],
  { encoding: 'utf8' }
).replace(
  /from '(\.[^']+)'/g,
  (_match, relative) => `from '/@fs/${path.resolve('src/lib/guideline', relative)}.ts'`
);
const server = await createServer({
  mode: 'guideline-proof',
  plugins: [
    {
      name: 'pinned-legacy-guideline-store',
      enforce: 'pre',
      resolveId(id) {
        if (id === '/__legacy-guideline-store.ts') return id;
      },
      load(id) {
        if (id === '/__legacy-guideline-store.ts') return legacyStoreSource;
      },
    },
  ],
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
await server.listen();
const url = server.resolvedUrls.local[0],
  output = path.resolve('../release/guideline-storage'),
  runtime = `node${process.versions.node.split('.')[0]}`;
await mkdir(output, { recursive: true });
const checks = [],
  errors = [];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
});
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1100 },
});
const sourceRequests = [];
context.on('request', request => {
  const target = request.url();
  if (
    target.includes('/api/guideline-intake') ||
    (/^https?:/.test(target) && new URL(target).origin !== new URL(url).origin)
  )
    sourceRequests.push(target);
});
const [first, second] = await Promise.all([context.newPage(), context.newPage()]);
const base = `guideline-storage-proof-${Date.now()}`;
const legacy = JSON.parse(await readFile('fixtures/guidelines/legacy-projects.json', 'utf8'));
const fixtures = [
  legacy.project,
  legacy.project2,
  JSON.parse(await readFile('fixtures/guidelines/legacy-project-v3.json', 'utf8')),
  JSON.parse(await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8')),
].map(value => ` \n${JSON.stringify(value)}\n `);
for (const page of [first, second]) page.on('pageerror', error => errors.push(error.message));
async function attach(page, name = base) {
  await page.evaluate(async name => {
    const m = await import('/src/lib/guideline/projectStore.ts');
    await window.storage?.close();
    window.storage = m.createGuidelineProjectStore({ databaseName: name });
  }, name);
}
async function save(page, json = fixtures[0], previous) {
  return page.evaluate(
    async ({ json, previous }) => {
      try {
        return {
          status: 'saved',
          reference: await window.storage.save({ json, workspaceId: 'workspace:proof' }, previous),
        };
      } catch (e) {
        return { status: e.code ?? 'storage-error', message: e.message };
      }
    },
    { json, previous }
  );
}
async function list(page = first) {
  return page.evaluate(() => window.storage.list());
}
async function rawPut(page, name, store, value) {
  await page.evaluate(
    async ({ name, store, value }) =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open(name, 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).put(value);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
        r.onerror = () => reject(r.error);
      }),
    { name, store, value }
  );
}
try {
  await Promise.all([first.goto(url), second.goto(url)]);
  await Promise.all([attach(first), attach(second)]);
  fixtures[2] = await first.evaluate(async json => {
    const input = JSON.parse(json);
    const { compileGuidelineReviewV3 } = await import('/src/lib/guideline/reviewV3.ts');
    const { buildGuidelineProjectV3 } = await import('/src/lib/guideline/projectV3.ts');
    const { createGuidelineGradient } = await import('/src/lib/guideline/project.ts');
    const draft = {
      ...input.draft,
      rules: input.draft.rules.map(rule => ({
        ...rule,
        meaning: 'not-a-rule',
        reason: 'Synthetic parser fixture text, not governing design policy.',
      })),
    };
    const review = compileGuidelineReviewV3(
      input.capture,
      draft,
      { kind: 'user', ref: 'test:storage' },
      '2026-09-25T01:00:00.000Z'
    );
    const colors = review.model.colors.filter(color => color.valuesByMode.Source.alpha === 1);
    const selection = createGuidelineGradient(review, 'brand', colors[0].id, colors[1].id, 120);
    return ` \n${JSON.stringify(buildGuidelineProjectV3({ capture: input.capture, draft, review, selection }))}\n `;
  }, fixtures[2]);
  for (const json of fixtures) {
    const r = await save(first, json);
    expect(r.status, r.message).toBe('saved');
    const p = await first.evaluate(async ref => {
      const p = await window.storage.open(ref);
      return { json: p.json, workspaceId: p.workspaceId, selection: p.value.project.selection };
    }, r.reference);
    expect(p.json).toBe(json);
    expect(p.workspaceId).toBe('workspace:proof');
    expect(p.selection).toEqual(JSON.parse(json).selection);
  }
  checks.push(
    'PDF V1/V2/V3 and Figma projects retain exact JSON bytes, selected values and stable workspace identity'
  );
  const website = await first.evaluate(async () => {
    const capture = (await import('/fixtures/guidelines/website-capture.json')).default;
    const { createWebsiteInventory } = await import('/src/lib/guideline/websiteInventory.ts');
    const { suggestWebsiteReview } = await import('/src/lib/guideline/websiteReview.ts');
    const { buildWebsiteProject } = await import('/src/lib/guideline/websiteProject.ts');
    const inventory = await createWebsiteInventory(capture),
      draft = suggestWebsiteReview(inventory);
    return JSON.stringify(
      await buildWebsiteProject({ capture, draft, review: null, selection: null })
    );
  });
  expect((await save(first, website)).status).toBe('saved');
  checks.push('Website capture and draft save through their existing strict project codec');
  const row = (await list()).entries[0];
  const results = await Promise.all([
    save(first, website, row.reference),
    save(second, website, row.reference),
  ]);
  expect(results.map(r => r.status).sort()).toEqual(['conflict', 'saved']);
  const winner = results.find(r => r.status === 'saved').reference;
  await first.evaluate(ref => window.storage.delete(ref), winner);
  expect((await save(second, website, winner)).status).toBe('conflict');
  checks.push(
    'Concurrent updates and deleted records reject stale saves across real IndexedDB tabs'
  );
  const unknown = {
    schemaVersion: 'teul.studio-guideline-project.v99',
    id: 'future',
    payload: { literal: 'retain exactly' },
  };
  await rawPut(first, base, 'projects', unknown);
  const retained = (await list()).entries.find(e => e.reference.id === 'future');
  expect(retained.retained).toBe(true);
  expect(
    JSON.parse(await first.evaluate(ref => window.storage.download(ref), retained.reference))
  ).toEqual(unknown);
  expect(
    JSON.parse(await first.evaluate(() => window.storage.exportRecovery())).projects
  ).toContainEqual(unknown);
  expect((await save(first, fixtures[0], retained.reference)).status).toBe('conflict');
  checks.push(
    'Future records remain visible and recoverable; writes cannot silently overwrite them'
  );
  const quotaRef = (await list()).entries.find(e => !e.retained).reference;
  const original = await first.evaluate(ref => window.storage.download(ref), quotaRef);
  const quota = await first.evaluate(
    async ({ json, ref }) => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'projects')
          throw new DOMException('Injected quota', 'QuotaExceededError');
        return put.apply(this, args);
      };
      try {
        await window.storage.save({ json, workspaceId: 'workspace:proof' }, ref);
        return false;
      } catch {
        return true;
      } finally {
        IDBObjectStore.prototype.put = put;
      }
    },
    { json: fixtures[1], ref: quotaRef }
  );
  expect(quota).toBe(true);
  expect(await first.evaluate(ref => window.storage.download(ref), quotaRef)).toBe(original);
  checks.push(
    'A failed transaction preserves the exact previous record and does not report success'
  );
  const capacityName = `${base}:capacity`;
  await Promise.all([attach(first, capacityName), attach(second, capacityName)]);
  for (let n = 0; n < 23; n++) expect((await save(first)).status).toBe('saved');
  expect((await Promise.all([save(first), save(second)])).map(r => r.status).sort()).toEqual([
    'capacity',
    'saved',
  ]);
  expect((await list()).entries.length).toBe(24);
  const byteName = `${base}:bytes`;
  await attach(first, byteName);
  await list();
  await rawPut(first, byteName, 'projects', {
    id: 'large-future',
    schemaVersion: 'future',
    data: 'x'.repeat(8 * 1024 * 1024 - 100),
  });
  expect((await save(first)).status).toBe('capacity');
  expect((await list()).entries.length).toBe(1);
  checks.push('Record-count race and aggregate byte capacity preserve existing records');
  const upgradeName = `${base}:upgrade`;
  await first.evaluate(async name => {
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = function (...args) {
      const r = original(...args);
      r.addEventListener('upgradeneeded', () => r.transaction.abort());
      return r;
    };
    const { createGuidelineProjectStore } = await import('/src/lib/guideline/projectStore.ts');
    try {
      await createGuidelineProjectStore({ databaseName: name }).list();
      throw new Error('Unexpected success');
    } catch (e) {
      if (e.message === 'Unexpected success') throw e;
    } finally {
      indexedDB.open = original;
    }
  }, upgradeName);
  await attach(first, upgradeName);
  expect((await list()).entries.length).toBe(0);
  expect((await save(first)).status).toBe('saved');
  checks.push(
    'Aborted database creation can be retried without touching the legacy palette database'
  );
  const assetName = `${base}:assets`;
  await attach(first, assetName);
  const pdfBytes = [...(await readFile('fixtures/guidelines/harbor-numeric.pdf'))];
  const assetResult = await first.evaluate(
    async ({ json, bytes }) => {
      const file = new File([new Uint8Array(bytes)], 'harbor-numeric.pdf', {
        type: 'application/pdf',
      });
      const ref = await window.storage.save({ json, workspaceId: 'pdf:proof', pdf: file });
      const p = await window.storage.open(ref);
      let rejected = false;
      try {
        await window.storage.save({
          json,
          workspaceId: 'pdf:proof',
          pdf: new File(['%PDF-wrong'], 'wrong.pdf'),
        });
      } catch {
        rejected = true;
      }
      return { ref, rejected, size: p.pdf?.size, hash: p.value.project.capture.identity.sha256 };
    },
    { json: fixtures[2], bytes: pdfBytes }
  );
  expect(assetResult.rejected).toBe(true);
  expect(assetResult.size).toBe(pdfBytes.length);
  await first.evaluate(
    async ({ json, bytes }) =>
      window.storage.save({
        json,
        workspaceId: 'pdf:copy',
        pdf: new File([new Uint8Array(bytes)], 'copy.pdf'),
      }),
    { json: fixtures[2], bytes: pdfBytes }
  );
  const assetSnapshot = await list();
  expect(assetSnapshot.assets).toHaveLength(1);
  expect(assetSnapshot.assets[0].projects.length).toBe(2);
  expect(
    await first.evaluate(async hash => {
      try {
        await window.storage.deletePdf(hash, []);
        return false;
      } catch (e) {
        return e.code === 'conflict';
      }
    }, assetResult.hash)
  ).toBe(true);
  await rawPut(first, assetName, 'projects', {
    id: 'future-dependent',
    schemaVersion: 'teul.studio-guideline-project.v99',
    pdfHash: assetResult.hash,
  });
  const dependencies = await list();
  expect(
    await first.evaluate(
      async ({ hash, refs }) => {
        try {
          await window.storage.deletePdf(hash, refs);
          return false;
        } catch (e) {
          return e.code === 'invalid';
        }
      },
      {
        hash: assetResult.hash,
        refs: dependencies.entries
          .filter(e => e.pdfHash === assetResult.hash)
          .map(e => e.reference),
      }
    )
  ).toBe(true);
  await first.evaluate(
    ref => window.storage.delete(ref),
    dependencies.entries.find(e => e.reference.id === 'future-dependent').reference
  );
  await first.evaluate(
    async ({ name, hash, bytes }) =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open(name, 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction('assets', 'readwrite');
          tx.objectStore('assets').put({
            hash,
            name: 'damaged.pdf',
            bytes: 1,
            blob: new Blob([new Uint8Array(bytes)]),
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
    { name: assetName, hash: assetResult.hash, bytes: pdfBytes }
  );
  expect((await list()).entries.length).toBe(2);
  expect((await list()).assets[0].valid).toBe(false);
  expect(
    (await first.evaluate(ref => window.storage.open(ref), assetResult.ref)).assetNotice
  ).toContain('could not be verified');
  expect((await save(first)).status).toBe('saved');
  expect(
    JSON.parse(await first.evaluate(() => window.storage.exportRecovery())).projects.length
  ).toBe(3);
  checks.push(
    'Corrupt optional PDFs cannot hide healthy projects or block project-only saves/recovery; retained future dependencies block source deletion'
  );
  await first.evaluate(({ hash, refs }) => window.storage.deletePdf(hash, refs), {
    hash: assetResult.hash,
    refs: assetSnapshot.entries.map(e => e.reference),
  });
  const missing = await first.evaluate(ref => window.storage.open(ref), assetResult.ref);
  expect(missing.pdf).toBe(null);
  expect(missing.assetNotice).toContain('missing');
  expect(missing.json).toBe(fixtures[2]);
  checks.push(
    'Optional PDF identity is verified, deduplicated and deleted separately; missing originals retain the reviewed design'
  );
  const assetCapacityName = `${base}:asset-capacity`;
  await attach(first, assetCapacityName);
  await list();
  await first.evaluate(
    async name =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open(name, 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction('assets', 'readwrite');
          for (const digit of ['a', 'b'])
            tx.objectStore('assets').put({
              hash: `sha256:${digit.repeat(64)}`,
              name: 'budget-fixture.pdf',
              bytes: 50 * 1024 * 1024,
              blob: new Blob([new Uint8Array(50 * 1024 * 1024)]),
            });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
    assetCapacityName
  );
  expect(
    await first.evaluate(
      async ({ json, bytes }) => {
        try {
          await window.storage.save({
            json,
            workspaceId: 'pdf:budget',
            pdf: new File([new Uint8Array(bytes)], 'original.pdf'),
          });
          return 'saved';
        } catch (e) {
          return e.code;
        }
      },
      { json: fixtures[2], bytes: pdfBytes }
    )
  ).toBe('capacity');
  expect((await list()).entries.length).toBe(0);
  expect((await list()).assets.length).toBe(2);
  expect((await save(first)).status).toBe('saved');
  checks.push(
    '100 MiB source-asset budget rejects an additional PDF atomically while allowing a project-only save'
  );
  const historyName = `${base}:history`;
  await Promise.all([attach(first, historyName), attach(second, historyName)]);
  const legacyHead = await first.evaluate(
    async ({ name, json }) => {
      const { createGuidelineProjectStore } = await import('/__legacy-guideline-store.ts');
      window.legacyStorage = createGuidelineProjectStore({ databaseName: name });
      let ref;
      for (let n = 0; n < 7; n++)
        ref = await window.legacyStorage.save(
          { json, workspaceId: 'workspace:legacy-history' },
          ref
        );
      return { ref, raw: JSON.parse(await window.legacyStorage.exportRecovery()).projects[0] };
    },
    { name: historyName, json: fixtures[0] }
  );
  const migrated = await save(first, fixtures[1], legacyHead.ref);
  expect(migrated.status).toBe('saved');
  let historyRow = (await list()).entries[0];
  expect(historyRow.revisions.map(item => item.revision)).toEqual([7, 8]);
  const migratedRaw = JSON.parse(await first.evaluate(() => window.storage.exportRecovery()))
    .projects[0];
  expect(migratedRaw.history).toEqual([legacyHead.raw]);
  const oldClient = await first.evaluate(async json => {
    const [entry] = (await window.legacyStorage.list()).entries;
    try {
      await window.legacyStorage.save({ json, workspaceId: 'older-client' }, entry.reference);
      return { retained: entry.retained, result: 'overwritten' };
    } catch (error) {
      return { retained: entry.retained, result: error.code };
    }
  }, fixtures[0]);
  expect(oldClient).toEqual({ retained: true, result: 'conflict' });
  expect(
    JSON.parse(await first.evaluate(() => window.storage.exportRecovery())).projects[0]
  ).toEqual(migratedRaw);
  checks.push(
    'Actual V1 client creates revision 7; V2 update retains its exact record and starts history at 7. The pinned old client lists V2 read-only and cannot overwrite it.'
  );

  const historical = await first.evaluate(
    ref => window.storage.openRevision(ref, 7),
    migrated.reference
  );
  expect(historical.json).toBe(fixtures[0]);
  expect(historical.latestRevision).toBe(8);
  expect(await first.evaluate(ref => window.storage.download(ref), migrated.reference)).toBe(
    fixtures[1]
  );
  const restored = await save(first, historical.json, migrated.reference);
  expect(restored.status).toBe('saved');
  expect((await list()).entries[0].revisions.map(item => item.revision)).toEqual([7, 8, 9]);
  for (const [revision, json] of [
    [7, fixtures[0]],
    [8, fixtures[1]],
    [9, fixtures[0]],
  ])
    expect(
      await first.evaluate(({ ref, revision }) => window.storage.downloadRevision(ref, revision), {
        ref: restored.reference,
        revision,
      })
    ).toBe(json);
  checks.push(
    'Opening history leaves the head untouched; restoration appends a new head and every revision downloads byte-exact original project JSON.'
  );

  await first.evaluate(ref => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let first = true;
    crypto.subtle.digest = async (...args) => {
      if (first) {
        first = false;
        await new Promise(resolve => {
          window.releaseHistoryRead = resolve;
        });
      }
      return digest(...args);
    };
    window.historyRead = window.storage
      .openRevision(ref, 7)
      .then(
        () => 'opened',
        error => error.code
      )
      .finally(() => {
        crypto.subtle.digest = digest;
      });
  }, restored.reference);
  await expect.poll(() => first.evaluate(() => typeof window.releaseHistoryRead)).toBe('function');
  const concurrent = await save(second, fixtures[1], restored.reference);
  expect(concurrent.status).toBe('saved');
  await first.evaluate(() => window.releaseHistoryRead());
  expect(await first.evaluate(() => window.historyRead)).toBe('conflict');
  checks.push(
    'An update in another tab during historical validation rejects the stale open before returning editor data.'
  );

  const beforeHistoryFailure = await first.evaluate(() => window.storage.exportRecovery());
  const historyQuota = await first.evaluate(
    async ({ json, ref }) => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const result = put.apply(this, args);
        if (this.name === 'projects')
          throw new DOMException('Injected after put', 'QuotaExceededError');
        return result;
      };
      try {
        await window.storage.save({ json, workspaceId: 'history-quota' }, ref);
        return 'saved';
      } catch (error) {
        return error.name;
      } finally {
        IDBObjectStore.prototype.put = put;
      }
    },
    { json: fixtures[0], ref: concurrent.reference }
  );
  expect(historyQuota).toBe('QuotaExceededError');
  expect(await first.evaluate(() => window.storage.exportRecovery())).toBe(beforeHistoryFailure);
  checks.push(
    'A failure after the combined head/history put rolls back the entire record, preserving exact preceding history.'
  );

  const corruptHistory = JSON.parse(beforeHistoryFailure).projects[0];
  corruptHistory.history[0].projectJson += ' ';
  await rawPut(first, historyName, 'projects', corruptHistory);
  historyRow = (await list()).entries[0];
  expect(historyRow.retained).toBe(true);
  expect(
    JSON.parse(await first.evaluate(ref => window.storage.download(ref), historyRow.reference))
  ).toEqual(corruptHistory);
  expect((await save(first, fixtures[0], historyRow.reference)).status).toBe('conflict');
  const futureHistory = JSON.parse(beforeHistoryFailure).projects[0];
  futureHistory.history[0].schemaVersion = 'teul.studio-guideline-project.v999';
  await rawPut(first, historyName, 'projects', futureHistory);
  historyRow = (await list()).entries[0];
  expect(historyRow.retained).toBe(true);
  expect(
    JSON.parse(await first.evaluate(ref => window.storage.download(ref), historyRow.reference))
  ).toEqual(futureHistory);
  checks.push(
    'Corrupt or future history retains the entire envelope for download and cannot be overwritten, including when its current project is healthy.'
  );

  await attach(first, `${base}:history-limit`);
  let limitRef = (await save(first)).reference;
  for (let n = 1; n < 32; n++) {
    const next = await save(first, fixtures[0], limitRef);
    expect(next.status).toBe('saved');
    limitRef = next.reference;
  }
  expect((await save(first, fixtures[0], limitRef)).status).toBe('capacity');
  expect((await list()).entries[0].revisions).toHaveLength(32);
  expect(await first.evaluate(ref => window.storage.downloadRevision(ref, 1), limitRef)).toBe(
    fixtures[0]
  );
  await attach(first, `${base}:history-bytes`);
  const padded = ' '.repeat(3 * 1024 * 1024) + fixtures[0];
  const paddedFirst = await save(first, padded);
  expect(paddedFirst.status).toBe('saved');
  const paddedSecond = await save(first, padded, paddedFirst.reference);
  expect(paddedSecond.status).toBe('saved');
  const beforeByteFailure = await first.evaluate(() => window.storage.exportRecovery());
  expect((await save(first, padded, paddedSecond.reference)).status).toBe('capacity');
  expect(await first.evaluate(() => window.storage.exportRecovery())).toBe(beforeByteFailure);
  checks.push(
    '32-revision and combined 8 MiB limits preserve the oldest snapshot and reject another append without silent eviction.'
  );

  await attach(first, `${base}:history-pdf`);
  const pdfStart = await first.evaluate(
    ({ json, bytes }) =>
      window.storage.save({
        json,
        workspaceId: 'history-pdf',
        pdf: new File([new Uint8Array(bytes)], 'original.pdf'),
      }),
    { json: fixtures[2], bytes: pdfBytes }
  );
  const pdfNewHead = await save(first, fixtures[0], pdfStart);
  const pdfHistory = await list();
  expect(pdfHistory.entries[0].pdfHash).toBe(null);
  expect(pdfHistory.entries[0].pdfHashes).toEqual([assetResult.hash]);
  expect(pdfHistory.assets[0].projects[0]).toContain('revision 1');
  const pdfRestore = await first.evaluate(
    ({ json, ref }) =>
      window.storage.save({ json, workspaceId: 'history-pdf', fromSavedRevision: 1 }, ref),
    { json: fixtures[2], ref: pdfNewHead.reference }
  );
  expect((await first.evaluate(ref => window.storage.open(ref), pdfRestore)).pdf).not.toBe(null);
  await first.evaluate(({ hash, ref }) => window.storage.deletePdf(hash, [ref]), {
    hash: assetResult.hash,
    ref: pdfRestore,
  });
  const missingHistoricalPdf = await first.evaluate(
    ref => window.storage.openRevision(ref, 1),
    pdfRestore
  );
  expect(missingHistoricalPdf.pdf).toBe(null);
  expect(missingHistoricalPdf.json).toBe(fixtures[2]);
  checks.push(
    'Historical PDF dependencies remain visible after a new source replaces the head; restoration reuses the original association, and explicit asset deletion preserves every reviewed snapshot.'
  );

  await first.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await first.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(fixtures[2]),
  });
  await expect(first.getByRole('button', { name: 'Download project', exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    first.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  const local = first.locator('[aria-label="PDF local projects"]');
  await first.reload();
  await first.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await first.getByText('Saved PDF projects on this device', { exact: false }).click();
  await local.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect(
    first.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  await expect(first.locator('.guideline-gradient-preview')).toBeVisible();
  const [download] = await Promise.all([
    first.waitForEvent('download'),
    first.getByRole('button', { name: 'Download project', exact: true }).click(),
  ]);
  expect(JSON.parse(await readFile(await download.path(), 'utf8'))).toEqual(
    JSON.parse(fixtures[2])
  );
  checks.push(
    'Actual PDF save, reload, local reopen and download preserve selected gradient and evidence'
  );
  await first.evaluate(async () => {
    const { guidelineProjectStore } = await import('/src/lib/guideline/projectStore.ts');
    const original = guidelineProjectStore.open;
    guidelineProjectStore.open = async (...args) => {
      const result = await original(...args);
      await new Promise(resolve => (window.releaseLocalOpen = resolve));
      return result;
    };
    window.restoreLocalOpen = () => {
      guidelineProjectStore.open = original;
    };
  });
  await local.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect(first.getByLabel(/^Name for /).first()).toBeDisabled();
  await expect.poll(() => first.evaluate(() => typeof window.releaseLocalOpen)).toBe('function');
  await first.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'replacement.json',
    mimeType: 'application/json',
    buffer: Buffer.from(fixtures[0]),
  });
  await expect(
    first.getByRole('button', { name: 'Save on this device', exact: true })
  ).toBeEnabled();
  await first.evaluate(() => {
    window.restoreLocalOpen();
    window.releaseLocalOpen();
  });
  const [replacement] = await Promise.all([
    first.waitForEvent('download'),
    first.getByRole('button', { name: 'Download project', exact: true }).click(),
  ]);
  expect(JSON.parse(await readFile(await replacement.path(), 'utf8'))).toEqual(
    JSON.parse(fixtures[0])
  );
  await local.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect(
    first.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  // Confirmation retains the original token even if another tab updates the listed record.
  await local.getByRole('button', { name: 'Delete saved copy', exact: true }).click();
  await second.evaluate(async () => {
    const { guidelineProjectStore } = await import('/src/lib/guideline/projectStore.ts');
    const row = (await guidelineProjectStore.list()).entries.find(item => item.kind === 'pdf');
    const opened = await guidelineProjectStore.open(row.reference);
    await guidelineProjectStore.save(
      { json: opened.json, workspaceId: opened.workspaceId },
      row.reference
    );
  });
  await expect(local.getByText(/Revision 2/)).toBeVisible();
  await local.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(local.getByRole('alert')).toContainText('changed or was deleted');
  await local.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect(
    first.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  checks.push(
    'Slow reopen disables editing, source replacement cancels publication, and stale delete confirmation preserves another tab’s newer revision'
  );
  await first
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-numeric.pdf');
  await expect(
    first.getByLabel('Keep original PDF on this device for page previews')
  ).toBeVisible();
  await first.getByLabel('Keep original PDF on this device for page previews').check();
  await first.getByRole('button', { name: 'Update saved project', exact: true }).click();
  await expect(local.getByText(/Saved a new revision/)).toBeVisible();
  await first.reload();
  await first.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await first.getByText('Saved PDF projects on this device', { exact: false }).click();
  await local.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect(first.getByRole('region', { name: 'Source document' })).toBeVisible();
  await expect(
    first.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  checks.push('Opt-in original PDF survives reload and restores full page previews');
  // Restore a historical PDF after the saved head has moved to another source.
  const historyUi = await first.evaluate(async json => {
    const { guidelineProjectStore: store } = await import('/src/lib/guideline/projectStore.ts');
    const [entry] = (await store.list()).entries;
    const current = await store.open(entry.reference);
    const ref = await store.save({ json, workspaceId: current.workspaceId }, entry.reference);
    await store.save({ json, workspaceId: 'unrelated-pdf-project' });
    return { ref, historyRevision: entry.revision, currentRevision: entry.revision + 1 };
  }, fixtures[0]);
  await local.getByText(`Saved revisions (${historyUi.currentRevision})`, { exact: true }).click();
  await local
    .getByRole('button', { name: `Open revision ${historyUi.historyRevision}`, exact: true })
    .click();
  await expect(first.locator('.guideline-gradient-preview')).toBeVisible();
  await expect(
    first.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  expect(
    await first.evaluate(
      async ref =>
        (await import('/src/lib/guideline/projectStore.ts')).guidelineProjectStore.download(ref),
      historyUi.ref
    )
  ).toBe(fixtures[0]);
  const [oldHeadDownload] = await Promise.all([
    first.waitForEvent('download'),
    local
      .getByRole('button', { name: `Download revision ${historyUi.currentRevision}`, exact: true })
      .click(),
  ]);
  expect(await readFile(await oldHeadDownload.path(), 'utf8')).toBe(fixtures[0]);
  const unrelated = local
    .locator('li')
    .filter({ has: first.getByText('Saved revisions (1)', { exact: true }) });
  await unrelated.getByRole('button', { name: 'Delete saved copy', exact: true }).click();
  await unrelated.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(local.getByText('Saved revisions (1)', { exact: true })).toHaveCount(0);
  await first.getByLabel('Keep original PDF on this device for page previews').uncheck();
  await first.getByRole('button', { name: 'Update saved project', exact: true }).click();
  await expect(
    local.getByText(`Saved revisions (${historyUi.currentRevision + 1})`, { exact: true })
  ).toBeVisible();
  const restoredUi = await first.evaluate(async () => {
    const { guidelineProjectStore: store } = await import('/src/lib/guideline/projectStore.ts');
    const [entry] = (await store.list()).entries;
    const current = await store.open(entry.reference);
    return { json: current.json, pdfBytes: current.pdf?.size, revisions: entry.revisions.length };
  });
  expect(JSON.parse(restoredUi.json)).toEqual(JSON.parse(fixtures[2]));
  expect(restoredUi.pdfBytes).toBe(pdfBytes.length);
  expect(restoredUi.revisions).toBe(historyUi.currentRevision + 1);
  await first.setViewportSize({ width: 390, height: 844 });
  await local.scrollIntoViewIfNeeded();
  expect(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await first.screenshot({ path: path.join(output, `${runtime}-history.png`), fullPage: true });
  await first.setViewportSize({ width: 1440, height: 1100 });
  checks.push(
    'Actual history controls preview/download without changing the saved head, then restore by append. Deleting an unrelated project preserves the historical PDF association; history controls fit 390px.'
  );
  await first.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await first
    .getByLabel('Open Figma capture')
    .setInputFiles('fixtures/guidelines/figma-project-v1.json');
  const figmaSection = first.getByRole('region', { name: 'Figma guideline capture' });
  await figmaSection.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    figmaSection.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  await first.reload();
  await first.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await first.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await first.getByText('Saved Figma projects on this device', { exact: false }).click();
  await figmaSection.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect(
    figmaSection.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  checks.push(
    'Figma project saves and reopens through actual controls without connection or plugin'
  );
  await first.locator('summary').filter({ hasText: 'Read a website' }).click();
  await first.getByLabel('Open website capture').setInputFiles({
    name: 'website.json',
    mimeType: 'application/json',
    buffer: Buffer.from(website),
  });
  const webSection = first.getByRole('region', { name: 'Website guideline capture' });
  await webSection.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    webSection.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  await first.reload();
  await first.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await first.locator('summary').filter({ hasText: 'Read a website' }).click();
  await first.getByText('Saved Website projects on this device', { exact: false }).click();
  await webSection.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect(
    webSection.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  checks.push(
    'Website project saves and reopens through actual controls without fetching the source'
  );
  await first.screenshot({ path: path.join(output, `${runtime}-desktop.png`), fullPage: true });
  await first.setViewportSize({ width: 390, height: 844 });
  expect(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await first.screenshot({ path: path.join(output, `${runtime}-mobile.png`), fullPage: true });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/storage-smoke.mjs'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        STUDIO_DEV_URL: url,
        STUDIO_EVIDENCE: path.join(output, `${runtime}-palette-regression`),
      },
    });
    child.on('error', reject);
    child.on('exit', code =>
      code === 0 ? resolve() : reject(new Error(`Palette regression failed: ${code}`))
    );
  });
  checks.push(
    'Existing saved-palette real-browser migration, conflicts and failure regression passes'
  );
  expect(sourceRequests).toEqual([]);
  checks.push(
    'No source or intake-service requests occurred while saving and reopening local projects'
  );
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
} catch (error) {
  errors.push(error.stack ?? String(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(
    path.join(output, `${runtime}-receipt.json`),
    JSON.stringify(
      { status: errors.length ? 'failed' : 'passed', node: process.version, checks, errors },
      null,
      2
    )
  );
  await browser.close();
  await server.close();
}
