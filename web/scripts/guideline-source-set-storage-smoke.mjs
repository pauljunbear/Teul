import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Pin both storage and its envelope reader to the pre-source-set client.
const prior = id =>
  execFileSync('git', ['show', `f9d4546:web/src/lib/guideline/${id}.ts`], {
    encoding: 'utf8',
  }).replace(/from '(\.[^']+)'/g, (_match, relative) =>
    relative === './projectRecord'
      ? "from '/__prior-record.ts'"
      : `from '/@fs/${path.resolve('src/lib/guideline', relative)}.ts'`
  );
const oldModules = {
  '/__prior-store.ts': prior('projectStore'),
  '/__prior-record.ts': prior('projectRecord'),
};
const server = await createServer({
  mode: 'guideline-proof',
  plugins: [
    {
      name: 'prior-source-set-storage',
      enforce: 'pre',
      resolveId: id => (id in oldModules ? id : undefined),
      load: id => oldModules[id],
    },
  ],
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
await server.listen();
const url = server.resolvedUrls.local[0];
const output = path.resolve('../release/guideline-source-set-storage');
await mkdir(output, { recursive: true });
const checks = [],
  errors = [],
  network = [];
const receipt = {
  node: process.version,
  scriptSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
  checks,
  errors,
  network,
};
let browser;
try {
  const fixture = await server.ssrLoadModule('/fixtures/guidelines/source-set-fixture.ts');
  const source = await server.ssrLoadModule('/src/lib/guideline/sourceSet.ts');
  const codec = await server.ssrLoadModule('/src/lib/guideline/sourceSetProject.ts');
  const gradient = await server.ssrLoadModule('/src/lib/guideline/authoredGradient.ts');
  const inputs = await Promise.all(
    ['A', 'B'].map((name, i) =>
      source.prepareSourceSetEntry(
        ` \n${JSON.stringify(fixture.sourceSetPdf(`PDF ${name}`))}\n `,
        `s${i}`
      )
    )
  );
  const draft = {
    entries: inputs.map(i => i.entry),
    subjects: inputs.flatMap(i => i.subjects),
    scope: 'brand',
    resolutions: [],
  };
  const workspace = {
    draft,
    review: null,
    outputs: { extension: null, application: null },
    gradientSelection: null,
  };
  const pending = await codec.serializeSourceSetProject(workspace);
  const review = await source.applySourceSetReview(draft, {
    actor: fixture.sourceSetActor,
    reviewedAt: fixture.sourceSetTime,
  });
  const selected = await codec.serializeSourceSetProject({
    ...workspace,
    review,
    gradientSelection: gradient.createGuidelineAuthoredGradient(review, {
      scope: 'brand',
      modeId: 'Working',
      angle: 120,
      route: { space: 'oklab' },
      stops: review.model.colors
        .slice(0, 2)
        .map((color, i) => ({ colorId: color.id, position: i, locked: true })),
    }),
  });
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
    network.push(route.request().url());
    return route.abort();
  });
  const first = await context.newPage(),
    second = await context.newPage();
  for (const page of [first, second]) page.on('pageerror', error => errors.push(error.message));
  await Promise.all([first.goto(url), second.goto(url)]);
  const dbName = `source-set-storage-${Date.now()}`;
  for (const page of [first, second])
    await page.evaluate(async name => {
      const m = await import('/src/lib/guideline/projectStore.ts');
      window.store = m.createGuidelineProjectStore({ databaseName: name });
    }, dbName);
  const save = (page, json, previous) =>
    page.evaluate(
      async ({ json, previous }) => {
        try {
          return {
            ref: await window.store.save({ json, workspaceId: 'source-set:proof' }, previous),
          };
        } catch (error) {
          return { code: error.code ?? error.name, message: error.message };
        }
      },
      { json, previous }
    );
  let result = await save(first, pending);
  expect(result.ref, result.message).toBeTruthy();
  const initial = result.ref;
  result = await save(first, selected, initial);
  expect(result.ref, result.message).toBeTruthy();
  let ref = result.ref;
  const before = await first.evaluate(async ref => {
    const head = await window.store.open(ref),
      history = await window.store.openRevision(ref, 1);
    return {
      head: head.json,
      history: history.json,
      pdf: head.pdf,
      assetNotice: head.assetNotice,
      kind: head.value.kind,
      entries: (await window.store.list()).entries,
    };
  }, ref);
  expect(before.head).toBe(selected);
  expect(before.history).toBe(pending);
  expect(before.pdf).toBeNull();
  expect(before.assetNotice).toBe('');
  expect(before.kind).toBe('source-set');
  expect(before.entries[0].pdfHashes).toEqual([]);
  checks.push(
    'Combined projects save/reopen exact pending and selected JSON, history and embedded original source strings without borrowing PDF assets'
  );
  expect((await save(second, pending, initial)).code).toBe('conflict');
  const cancelled = await first.evaluate(
    async ({ json, ref }) => {
      const controller = new AbortController();
      controller.abort();
      try {
        await window.store.save({ json, workspaceId: 'cancelled' }, ref, controller.signal);
        return false;
      } catch {
        return true;
      }
    },
    { json: pending, ref }
  );
  expect(cancelled).toBe(true);
  const unchanged = await first.evaluate(ref => window.store.download(ref), ref);
  expect(unchanged).toBe(selected);
  expect((await save(first, '{"schemaVersion":"teul.source-set-project.v999"}', ref)).code).toBe(
    'invalid'
  );
  const corrupt = JSON.parse(selected);
  corrupt.review.reviewHash = 'bad';
  expect((await save(first, JSON.stringify(corrupt), ref)).ref).toBeUndefined();
  expect(await first.evaluate(ref => window.store.download(ref), ref)).toBe(selected);
  checks.push(
    'Stale, cancelled, future and corrupt replacements preserve the prior saved selected design'
  );
  // Hold a read while another real tab advances its record.
  await first.evaluate(ref => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    let hold = true;
    crypto.subtle.digest = async (...args) => {
      if (hold) {
        hold = false;
        await new Promise(resolve => {
          window.releaseRead = resolve;
        });
      }
      return original(...args);
    };
    window.pendingRead = window.store
      .openRevision(ref, 1)
      .then(
        () => 'opened',
        e => e.code
      )
      .finally(() => {
        crypto.subtle.digest = original;
      });
  }, ref);
  await expect.poll(() => first.evaluate(() => typeof window.releaseRead)).toBe('function');
  result = await save(second, selected, ref);
  expect(result.ref, result.message).toBeTruthy();
  ref = result.ref;
  await first.evaluate(() => window.releaseRead());
  expect(await first.evaluate(() => window.pendingRead)).toBe('conflict');
  checks.push('Concurrent update during historical validation cannot publish an obsolete open');
  const rollback = await first.evaluate(
    async ({ name, json }) => {
      const m = await import('/__prior-store.ts');
      const old = m.createGuidelineProjectStore({ databaseName: name });
      try {
        const row = (await old.list()).entries[0];
        let rejected = false;
        try {
          await old.save({ json, workspaceId: 'prior-client' }, row.reference);
        } catch {
          rejected = true;
        }
        return {
          retained: row.retained,
          rejected,
          raw: JSON.parse(await old.download(row.reference)),
        };
      } finally {
        await old.close();
      }
    },
    { name: dbName, json: inputs[0].entry.projectJson }
  );
  expect(rollback.retained).toBe(true);
  expect(rollback.rejected).toBe(true);
  expect(rollback.raw.projectJson).toBe(selected);
  checks.push(
    'Pinned pre-change client keeps combined records read-only and downloadable; it cannot overwrite their history'
  );
  const fullBefore = await first.evaluate(() => window.store.exportRecovery());
  const quota = await first.evaluate(
    async ({ json, ref }) => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'projects')
          throw new DOMException('Injected quota', 'QuotaExceededError');
        return put.apply(this, args);
      };
      try {
        await window.store.save({ json, workspaceId: 'quota' }, ref);
        return false;
      } catch {
        return true;
      } finally {
        IDBObjectStore.prototype.put = put;
      }
    },
    { json: pending, ref }
  );
  expect(quota).toBe(true);
  expect(await first.evaluate(() => window.store.exportRecovery())).toBe(fullBefore);
  // A valid, padded project is below the project input bound but its appended envelope exceeds the shared budget.
  expect(
    (
      await save(
        first,
        `${pending}${' '.repeat(8 * 1024 * 1024 - Buffer.byteLength(pending) - 1)}`,
        ref
      )
    ).code
  ).toBe('capacity');
  expect(await first.evaluate(() => window.store.exportRecovery())).toBe(fullBefore);
  checks.push(
    'Injected IndexedDB quota and shared-byte capacity failures preserve every saved record and revision'
  );
  for (let n = 4; n <= 32; n++) {
    result = await save(first, pending, ref);
    expect(result.ref, result.message).toBeTruthy();
    ref = result.ref;
  }
  const bounded = await first.evaluate(() => window.store.exportRecovery());
  expect((await save(first, selected, ref)).code).toBe('capacity');
  expect(await first.evaluate(() => window.store.exportRecovery())).toBe(bounded);
  expect(await first.evaluate(ref => window.store.downloadRevision(ref, 2), ref)).toBe(selected);
  checks.push(
    'The 32-revision limit blocks new writes without eviction and retains the original selected design'
  );
  // Exercise editor cancellation separately from transaction-level conflict checks.
  await first.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await first.locator('.guideline-source-set > summary').click();
  const combined = first.getByRole('region', { name: 'Combined guidelines', exact: true });
  const local = combined.locator('[aria-label="combined guideline local projects"]');
  const openFile = json =>
    combined.getByLabel('Open source set', { exact: true }).setInputFiles({
      name: 'combined.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    });
  const downloadOpen = async () => {
    const [file] = await Promise.all([
      first.waitForEvent('download'),
      combined.getByRole('button', { name: 'Download source set', exact: true }).click(),
    ]);
    return readFile(await file.path(), 'utf8');
  };
  await openFile(selected);
  await combined.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    combined.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  await local
    .locator('summary')
    .filter({ hasText: 'Saved combined guideline projects on this device' })
    .click();
  await first.evaluate(async () => {
    const { guidelineProjectStore: store } = await import('/src/lib/guideline/projectStore.ts');
    const open = store.open;
    store.open = async (...args) => {
      const result = await open(...args);
      await new Promise(resolve => {
        window.releaseLocalSet = resolve;
      });
      return result;
    };
    window.restoreLocalSet = () => {
      store.open = open;
    };
  });
  await local.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect.poll(() => first.evaluate(() => typeof window.releaseLocalSet)).toBe('function');
  await expect(combined.getByLabel('Working use', { exact: true })).toBeDisabled();
  await combined.getByRole('button', { name: 'Cancel source-set operation', exact: true }).click();
  await openFile(pending);
  await first.evaluate(() => {
    window.restoreLocalSet();
    window.releaseLocalSet();
  });
  await expect(
    combined.getByRole('button', { name: 'Save on this device', exact: true })
  ).toBeEnabled();
  expect(await downloadOpen()).toBe(pending);
  await local.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect(
    combined.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  expect(await downloadOpen()).toBe(selected);
  await first.evaluate(async () => {
    const { guidelineProjectStore: store } = await import('/src/lib/guideline/projectStore.ts');
    const save = store.save;
    store.save = async (...args) => {
      await new Promise(resolve => {
        window.releaseLocalSave = resolve;
      });
      return save(...args);
    };
    window.restoreLocalSave = () => {
      store.save = save;
    };
  });
  await combined.getByRole('button', { name: 'Update saved project', exact: true }).click();
  await expect.poll(() => first.evaluate(() => typeof window.releaseLocalSave)).toBe('function');
  await combined.getByRole('button', { name: 'Cancel source-set operation', exact: true }).click();
  await openFile(pending);
  await first.evaluate(() => {
    window.restoreLocalSave();
    window.releaseLocalSave();
  });
  expect(await downloadOpen()).toBe(pending);
  await expect(local.getByText('Revision 1 ·', { exact: false })).toBeVisible();
  checks.push(
    'Delayed device open and save disable edits; cancellation and a replacement file prevent late publication or an abandoned revision write'
  );
  await local.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await chooseGuidelineTask(combined, 'extension');
  const extension = combined.getByRole('region', { name: 'Source scale extension', exact: true });
  await extension.getByLabel('New shade 1 name', { exact: true }).fill('500');
  await extension.getByLabel('New shade 1 position', { exact: true }).fill('1');
  // Hold only the extension's cooperative yield; other browser work continues normally.
  await first.evaluate(async () => {
    const timer = window.setTimeout;
    window.setTimeout = (callback, delay, ...args) => {
      if (delay === 0 && new Error().stack.includes('GuidelineExtensionPreview')) {
        window.setTimeout = timer;
        window.releaseExtension = () => {
          callback(...args);
        };
        return -1;
      }
      return timer(callback, delay, ...args);
    };
    const { guidelineProjectStore: store } = await import('/src/lib/guideline/projectStore.ts');
    const open = store.open;
    store.open = async (...args) => {
      const result = await open(...args);
      await new Promise(resolve => {
        window.releaseNewerOpen = resolve;
      });
      return result;
    };
    window.restoreNewerOpen = () => {
      store.open = open;
    };
  });
  await extension.getByRole('button', { name: 'Preview extension', exact: true }).click();
  await expect.poll(() => first.evaluate(() => typeof window.releaseExtension)).toBe('function');
  await local.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect.poll(() => first.evaluate(() => typeof window.releaseNewerOpen)).toBe('function');
  await first.evaluate(() => window.releaseExtension());
  await expect(extension.getByRole('status')).toContainText('interrupted');
  await expect(combined.getByLabel('Working use', { exact: true })).toBeDisabled();
  await first.evaluate(() => {
    window.restoreNewerOpen();
    window.releaseNewerOpen();
  });
  await expect(
    combined.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  expect(await downloadOpen()).toBe(selected);
  checks.push(
    'An extension finishing after device opening starts cannot cancel that open or publish results against its old workspace'
  );
  const conflicting = await source.prepareSourceSetEntry(
    JSON.stringify(fixture.sourceSetPdf('PDF B', '#445566')),
    's1'
  );
  const conflictJson = await codec.serializeSourceSetProject({
    ...workspace,
    draft: {
      ...draft,
      entries: [inputs[0].entry, conflicting.entry],
      subjects: [...inputs[0].subjects, ...conflicting.subjects],
    },
  });
  await openFile(conflictJson);
  await combined.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    combined.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeEnabled();
  const choice = combined.getByLabel('Working value for blue', { exact: true });
  await choice.selectOption('0');
  await combined.getByLabel('Reason for blue', { exact: true }).fill('Unsaved temporary choice');
  await local.getByRole('button', { name: 'Open saved project', exact: true }).first().click();
  await expect(choice).toHaveValue('');
  await expect(combined.getByLabel('Reason for blue', { exact: true })).toHaveValue('');
  checks.push(
    'Opening a saved pending source set clears unsaved value/reason fields even when the source member hashes match'
  );
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
  receipt.passed = true;
} finally {
  await writeFile(
    path.join(output, `node${process.versions.node.split('.')[0]}-receipt.json`),
    JSON.stringify(receipt, null, 2)
  );
  await browser?.close();
  await server.close();
}
console.log(JSON.stringify(receipt, null, 2));
