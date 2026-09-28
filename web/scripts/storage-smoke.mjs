import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Native IndexedDB behavior is tested in real tabs, without an in-memory database substitute.
// This import needs Vite's development server; production UI parity has separate browser checks.
const url = process.env.STUDIO_DEV_URL || 'http://127.0.0.1:5179';
const evidence = path.resolve(
  process.env.STUDIO_EVIDENCE ||
    fileURLToPath(new URL('../../release/teul-storage-verification', import.meta.url))
);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
});
const checks = [];
const errors = [];
const timings = [];
const databaseName = `teul-storage-proof-${Date.now()}`;
const legacyKey = `${databaseName}:legacy`;
const palette = { name: 'Blue', colors: ['#3257DC'], method: 'authored' };
const context = await browser.newContext();
const [first, second] = await Promise.all([context.newPage(), context.newPage()]);
for (const page of [first, second]) page.on('pageerror', error => errors.push(error.message));
async function attach(page, options = { databaseName, legacyKey }) {
  await page.evaluate(async options => {
    const { createSavedPaletteStore } = await import('/src/lib/savedStore.ts');
    window.testStore = createSavedPaletteStore(options);
  }, options);
}
async function list(page) {
  return page.evaluate(() => window.testStore.list());
}
async function save(page, input = palette, previous) {
  return page.evaluate(({ input, previous }) => window.testStore.save(input, previous), {
    input,
    previous,
  });
}
async function remove(page, row) {
  return page.evaluate(row => window.testStore.delete(row.id, row.revision), row);
}
async function rawPut(page, database, value) {
  return page.evaluate(
    ({ database, value }) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open(database, 1);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('palettes', 'readwrite');
          tx.objectStore('palettes').put(value);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    { database, value }
  );
}
try {
  await Promise.all([first.goto(url), second.goto(url)]);
  const legacyRaw = ` [\n${JSON.stringify({ id: 'old-blue', ...palette })},\n${JSON.stringify({ id: 'future', schemaVersion: 'teul.future', payload: 'retain exactly' })}\n] `;
  await first.evaluate(({ legacyKey, legacyRaw }) => localStorage.setItem(legacyKey, legacyRaw), {
    legacyKey,
    legacyRaw,
  });
  await Promise.all([attach(first), attach(second)]);
  const initial = await Promise.all([list(first), list(second)]);
  for (const result of initial) {
    expect(result.status).toBe('listed');
    expect(result.snapshot.palettes).toHaveLength(1);
    expect(result.snapshot.retainedCount).toBe(1);
  }
  expect(await first.evaluate(key => localStorage.getItem(key), legacyKey)).toBe(legacyRaw);
  const archive = await first.evaluate(() => window.testStore.exportRecovery());
  expect(archive.status).toBe('exported');
  expect(JSON.parse(archive.json).archive.raw).toBe(legacyRaw);
  checks.push('Concurrent first access migrates once and preserves exact legacy/future bytes');

  const initialRow = initial[0].snapshot.palettes[0];
  expect((await remove(second, initialRow)).status).toBe('deleted');
  expect((await save(first, palette, initialRow)).status).toBe('conflict');
  await attach(second);
  expect((await list(second)).snapshot.palettes).toHaveLength(0);
  checks.push('Deleted legacy rows cannot return through a stale save or repeated migration');

  await first.evaluate(() => {
    window.storageNotifications = 0;
    window.stopStore = window.testStore.subscribe(() => window.storageNotifications++);
  });
  const pair = await Promise.all([
    save(first, { ...palette, name: 'First tab' }),
    save(second, { ...palette, name: 'Second tab' }),
  ]);
  expect(pair.map(result => result.status)).toEqual(['saved', 'saved']);
  expect((await list(first)).snapshot.palettes.map(row => row.name).sort()).toEqual([
    'First tab',
    'Second tab',
  ]);
  await expect
    .poll(() => first.evaluate(() => window.storageNotifications))
    .toBeGreaterThanOrEqual(2);
  checks.push('Concurrent tab inserts preserve both palettes and broadcast a refresh');

  const current = pair[0].palette;
  const updates = await Promise.all([
    save(first, { ...palette, name: 'Edit A' }, current),
    save(second, { ...palette, name: 'Edit B' }, current),
  ]);
  expect(updates.map(result => result.status).sort()).toEqual(['conflict', 'saved']);
  expect((await remove(first, current)).status).toBe('conflict');
  const updated = updates.find(result => result.status === 'saved').palette;
  const deletionRace = await Promise.all([
    remove(first, updated),
    save(second, { ...palette, name: 'Delayed write' }, updated),
  ]);
  expect(deletionRace.filter(result => result.status === 'conflict')).toHaveLength(1);
  const afterRace = (await list(first)).snapshot.palettes.find(row => row.id === updated.id);
  if (afterRace) expect((await remove(first, afterRace)).status).toBe('deleted');
  expect((await save(second, palette, updated)).status).toBe('conflict');
  checks.push(
    'Concurrent updates and update/delete races reject stale revisions without resurrection'
  );

  const capacityDb = `${databaseName}:capacity`;
  await Promise.all([
    attach(first, { databaseName: capacityDb, legacyKey: `${capacityDb}:legacy` }),
    attach(second, { databaseName: capacityDb, legacyKey: `${capacityDb}:legacy` }),
  ]);
  for (let index = 0; index < 23; index++)
    expect((await save(first, { ...palette, name: `Palette ${index}` })).status).toBe('saved');
  const limitRace = await Promise.all([save(first), save(second)]);
  expect(limitRace.map(result => result.status).sort()).toEqual(['capacity', 'saved']);
  expect((await list(first)).snapshot.palettes).toHaveLength(24);
  checks.push('Two tabs racing for the final slot enforce the 24-palette limit atomically');

  const unknownDb = `${databaseName}:unknown`;
  await attach(first, { databaseName: unknownDb, legacyKey: `${unknownDb}:legacy` });
  await list(first);
  const unknown = {
    id: 'future-envelope',
    schemaVersion: 'teul.studio-saved.v99',
    payload: 'future native data',
  };
  await rawPut(first, unknownDb, unknown);
  expect((await list(first)).snapshot).toMatchObject({ palettes: [], retainedCount: 1 });
  expect((await save(first)).status).toBe('saved');
  expect((await remove(first, { id: unknown.id, revision: 1 })).status).toBe('conflict');
  let recovery = await first.evaluate(() => window.testStore.exportRecovery());
  expect(JSON.parse(recovery.json).records).toContainEqual(unknown);
  await rawPut(first, unknownDb, {
    id: 'large-unknown',
    schemaVersion: 'future',
    raw: 'x'.repeat(8 * 1024 * 1024),
  });
  expect((await save(first)).status).toBe('capacity');
  expect((await list(first)).snapshot.retainedCount).toBe(2);
  checks.push(
    'Unknown envelopes remain recoverable and aggregate byte limits fail without eviction'
  );

  const failureDb = `${databaseName}:failure`;
  await attach(first, { databaseName: failureDb, legacyKey: `${failureDb}:legacy` });
  await list(first);
  const aborted = await first.evaluate(async input => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      if (this.name === 'palettes')
        request.addEventListener('success', () => request.transaction.abort());
      return request;
    };
    try {
      return await window.testStore.save(input);
    } finally {
      IDBObjectStore.prototype.put = original;
    }
  }, palette);
  expect(aborted.status).toBe('storage-error');
  expect((await list(first)).snapshot.palettes).toHaveLength(0);
  const unavailable = await first.evaluate(async input => {
    const own = Object.getOwnPropertyDescriptor(window, 'indexedDB');
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: {
        open() {
          throw new DOMException('Unavailable', 'SecurityError');
        },
      },
    });
    try {
      const { createSavedPaletteStore } = await import('/src/lib/savedStore.ts');
      return await createSavedPaletteStore({ databaseName: 'unavailable' }).save(input);
    } finally {
      if (own) Object.defineProperty(window, 'indexedDB', own);
      else delete window.indexedDB;
    }
  }, palette);
  expect(unavailable.status).toBe('storage-error');
  checks.push(
    'Aborted transactions and unavailable IndexedDB return failure without claiming a save'
  );
  const recipeDb = `${databaseName}:recipe`;
  await Promise.all([
    attach(first, { databaseName: recipeDb, legacyKey: `${recipeDb}:legacy` }),
    attach(second, { databaseName: recipeDb, legacyKey: `${recipeDb}:legacy` }),
  ]);
  const selected = await first.evaluate(async () => {
    const { generateStudioAuthoring, serializeStudioAuthoring } =
      await import('/src/lib/authoring.ts');
    const settings = {
      name: 'Complete product',
      colors: ['#3257DC', '#CB7252'],
      anchorIndex: 0,
      purpose: 'product-ui',
      neutrals: 'neutral',
    };
    const generated = await generateStudioAuthoring(settings);
    if (generated.status !== 'ready')
      throw new Error('Expected a feasible product recipe for storage proof.');
    const direction = generated.directions.at(-1);
    const input = {
      name: settings.name,
      colors: settings.colors,
      method: 'authored',
      recipeJson: serializeStudioAuthoring(direction.recipe),
      applicationSettings: settings,
    };
    window.completeRecipeInput = input;
    return {
      result: await window.testStore.save(input),
      contentHash: direction.contentHash,
      recipeJson: input.recipeJson,
    };
  });
  expect(selected.result.status).toBe('saved');
  const stored = (await list(second)).snapshot.palettes[0];
  expect(stored.recipeJson).toBe(selected.recipeJson);
  const reopened = await second.evaluate(async raw => {
    const { reopenStudioAuthoring } = await import('/src/lib/authoring.ts');
    const result = await reopenStudioAuthoring(raw);
    return { status: result.status, hash: result.direction?.contentHash };
  }, stored.recipeJson);
  expect(reopened).toEqual({ status: 'ready', hash: selected.contentHash });
  const invalid = await first.evaluate(async () => {
    const input = window.completeRecipeInput;
    const recipe = JSON.parse(input.recipeJson);
    recipe.selection.contentHash = `sha256:${'0'.repeat(64)}`;
    return [
      await window.testStore.save({ ...input, recipeJson: JSON.stringify(recipe) }),
      await window.testStore.save({
        ...input,
        applicationSettings: { ...input.applicationSettings, neutrals: 'warm' },
      }),
      await window.testStore.save({
        ...input,
        recipeJson: JSON.stringify({
          ...JSON.parse(input.recipeJson),
          schemaVersion: 'teul.recipe.future',
        }),
      }),
    ].map(result => result.status);
  });
  expect(invalid).toEqual(['invalid', 'invalid', 'invalid']);
  expect((await list(first)).snapshot.palettes).toHaveLength(1);
  const corruptStored = {
    schemaVersion: 'teul.studio-saved.v2',
    id: 'corrupt-stored-recipe',
    revision: 1,
    updatedAt: Date.now(),
    input: {
      name: stored.name,
      colors: stored.colors,
      method: stored.method,
      recipeJson: '{malformed',
      applicationSettings: stored.applicationSettings,
    },
  };
  await rawPut(first, recipeDb, corruptStored);
  expect((await list(second)).snapshot).toMatchObject({ retainedCount: 1 });
  recovery = await second.evaluate(() => window.testStore.exportRecovery());
  expect(JSON.parse(recovery.json).records).toContainEqual(corruptStored);
  checks.push(
    'Full selected recipe survives exact-byte save/replay; malformed, mismatched and future inputs never replace valid work'
  );
  const fullDb = `${databaseName}:full-recipes`;
  await attach(first, { databaseName: fullDb, legacyKey: `${fullDb}:legacy` });
  await list(first);
  const responsiveness = await first.evaluate(async database => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(database, 1);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction('palettes', 'readwrite');
        for (let index = 0; index < 24; index++)
          tx.objectStore('palettes').put({
            schemaVersion: 'teul.studio-saved.v2',
            id: `full-${index}`,
            revision: 1,
            updatedAt: Date.now() + index,
            input: window.completeRecipeInput,
          });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
    const tasks = [];
    const observer = new PerformanceObserver(list =>
      tasks.push(...list.getEntries().map(entry => entry.duration))
    );
    observer.observe({ entryTypes: ['longtask'] });
    const start = performance.now();
    const result = await window.testStore.list();
    const elapsedMs = performance.now() - start;
    await new Promise(resolve => setTimeout(resolve, 50));
    observer.disconnect();
    let notified;
    const unsubscribe = window.testStore.subscribe(snapshot => {
      notified = snapshot;
    });
    const changed = await window.testStore.save(
      window.completeRecipeInput,
      result.snapshot.palettes[0]
    );
    unsubscribe();
    return {
      status: result.status,
      count: result.snapshot?.palettes.length,
      elapsedMs,
      maximumLongTaskMs: Math.max(0, ...tasks),
      updated: changed.status,
      notificationRevision: notified?.palettes.find(row => row.id === changed.palette?.id)
        ?.revision,
    };
  }, fullDb);
  expect(responsiveness).toMatchObject({
    status: 'listed',
    count: 24,
    updated: 'saved',
    notificationRevision: 2,
  });
  expect(responsiveness.maximumLongTaskMs).toBeLessThan(200);
  timings.push(responsiveness);
  checks.push(
    'A full library of product recipes validates in responsive batches and local subscribers receive the committed snapshot'
  );
  expect(errors).toEqual([]);
} finally {
  await writeFile(
    path.join(evidence, 'storage-browser.json'),
    JSON.stringify({ checkedAt: new Date().toISOString(), checks, errors, timings }, null, 2)
  );
  await browser.close();
}
console.log(JSON.stringify({ checks, errors, evidence }, null, 2));
