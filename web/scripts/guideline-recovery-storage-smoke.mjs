import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const server = await createServer({
  mode: 'guideline-proof',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
await server.listen();
const url = server.resolvedUrls.local[0],
  output = path.resolve('../release/guideline-job-recovery');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
});
const context = await browser.newContext();
const first = await context.newPage(),
  second = await context.newPage();
const checks = [],
  errors = [],
  network = [];
for (const page of [first, second]) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().includes('/api/guideline-intake')) network.push(request.url());
  });
}
const legacy = JSON.parse(await readFile('fixtures/guidelines/legacy-projects.json', 'utf8'));
const projectJson = ` \n${JSON.stringify(legacy.project)}\n `;
const base = `recovery-proof-${Date.now()}`;
const start = Date.now();
async function attach(page, name) {
  await page.evaluate(
    async ({ name, start }) => {
      const { createRecoveryStore } = await import('/src/lib/guideline/recoveryStore.ts');
      await window.recoveryStore?.close();
      window.recoveryNow = start;
      window.recoveryName = name;
      window.recoveryStore = createRecoveryStore({ name, now: () => window.recoveryNow });
      window.recoveryHandles = {};
      window.recoveryOwner = `sha256:${'a'.repeat(64)}`;
      window.recoveryFixture = async (tag, projectJson) => {
        const { prepareWebsiteCapture } = await import('/src/lib/guideline/websiteCapture.ts');
        const { prepareGuidelineAssistance } = await import('/src/lib/guideline/assistance.ts');
        const { prepareIntakeSubmission, intakeRequestHash } =
          await import('/src/lib/guideline/intakeClient.ts');
        const profile = {
          id: projectJson ? 'synthetic-assistance' : 'website-capture',
          version: '1',
          kind: projectJson ? 'pdf' : 'website',
          operation: projectJson ? 'interpret' : 'capture',
          destination: 'Synthetic fixture',
          consentPolicyVersion: '1',
          maximumAttemptCostMicros: 0,
          maximumJobCostMicros: 0,
        };
        let submission;
        if (projectJson) {
          const evidence = await prepareGuidelineAssistance(JSON.parse(projectJson).capture, {
            workspaceId: `w-${tag}`,
          });
          submission = await prepareIntakeSubmission(
            {
              profileId: profile.id,
              profileVersion: '1',
              kind: 'pdf',
              binding: evidence.binding,
              captureHash: evidence.captureHash,
              scope: evidence.input.source.scope,
              parserVersion: 'assisted-review-1',
              payload: evidence.input,
            },
            profile
          );
        } else
          submission = await prepareWebsiteCapture(
            {
              schemaVersion: 'teul.website-request.v1',
              url: `https://example.com/${tag}`,
              selector: 'main',
              viewport: { width: 1280, height: 800 },
              colorScheme: 'light',
              excludedSelectors: [],
              includedIncidentalSelectors: [],
            },
            `w-${tag}`,
            profile
          );
        return {
          submission,
          profile,
          requestHash: await intakeRequestHash(submission, profile),
          job: null,
          projectJson: projectJson ?? null,
        };
      };
      window.recoveryJob = (handle, status = 'queued') => ({
        id: 'd6d586dd-6f93-45ae-9203-72156cdb82c5',
        status,
        binding: handle.payload.submission.binding,
        captureHash: handle.payload.submission.captureHash,
        profileId: handle.payload.profile.id,
        profileVersion: handle.payload.profile.version,
        createdAt: start,
        updatedAt: window.recoveryNow,
        expiresAt: start + 86400000,
        deadlineAt: null,
        errorCode: null,
        budgetMicros: 0,
        outputHash: status === 'complete' ? `sha256:${'b'.repeat(64)}` : null,
      });
    },
    { name, start }
  );
}
async function create(page, tag, json) {
  return page.evaluate(
    async ({ tag, json }) => {
      try {
        const handle = await window.recoveryStore.create(
          window.recoveryOwner,
          await window.recoveryFixture(tag, json)
        );
        window.recoveryHandles[tag] = handle;
        return { status: 'created', reference: handle.reference, metadata: handle.metadata };
      } catch (error) {
        return { status: error.code ?? error.name };
      }
    },
    { tag, json }
  );
}
async function raw(page, store, id, replacement) {
  return page.evaluate(
    async ({ store, id, replacement }) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open(window.recoveryName, 1);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction(store, replacement === undefined ? 'readonly' : 'readwrite');
          const request =
            replacement === undefined
              ? tx.objectStore(store).get(id)
              : tx.objectStore(store).put(replacement);
          tx.oncomplete = () => {
            const result = request.result;
            db.close();
            resolve(result);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { store, id, replacement }
  );
}
try {
  await Promise.all([first.goto(url), second.goto(url)]);
  await Promise.all([attach(first, base), attach(second, base)]);
  const initial = await create(first, 'pdf', projectJson);
  expect(initial.status).toBe('created');
  expect(
    await second.evaluate(async ref => {
      const handle = await window.recoveryStore.open(window.recoveryOwner, ref);
      window.recoveryHandles.pdf = handle;
      return handle.payload.projectJson;
    }, initial.reference)
  ).toBe(projectJson);
  expect(
    await second.evaluate(() => window.recoveryStore.list(`sha256:${'c'.repeat(64)}`))
  ).toEqual([]);
  expect(
    await second.evaluate(async ref => {
      try {
        await window.recoveryStore.open(`sha256:${'c'.repeat(64)}`, ref);
        return 'opened';
      } catch (error) {
        return error.code;
      }
    }, initial.reference)
  ).toBe('RECOVERY_OWNER_CHANGED');
  checks.push(
    'Two browser tabs reopen exact legacy project/input bytes; another owner cannot list or open them.'
  );

  const beforePayload = await raw(first, 'payloads', initial.reference.id);
  const updated = await first.evaluate(async () => {
    const handle = window.recoveryHandles.pdf;
    const originalPut = IDBObjectStore.prototype.put;
    let payloadWrites = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'payloads') payloadWrites++;
      return originalPut.apply(this, args);
    };
    try {
      const next = await window.recoveryStore.update(handle, window.recoveryJob(handle));
      window.recoveryHandles.pdf = next;
      return { reference: next.reference, payloadWrites, hash: next.metadata.contentHash };
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }
  });
  expect(updated.payloadWrites).toBe(0);
  expect(updated.hash).toBe(initial.metadata.contentHash);
  expect(await raw(first, 'payloads', initial.reference.id)).toEqual(beforePayload);
  expect(
    await second.evaluate(async () => {
      const stale = window.recoveryHandles.pdf;
      try {
        await window.recoveryStore.update(stale, window.recoveryJob(stale));
        return 'updated';
      } catch (error) {
        return error.code;
      }
    })
  ).toBe('RECOVERY_CONFLICT');
  expect(
    await second.evaluate(async ref => {
      try {
        await window.recoveryStore.remove(window.recoveryOwner, ref);
        return 'removed';
      } catch (error) {
        return error.code;
      }
    }, initial.reference)
  ).toBe('RECOVERY_CONFLICT');
  checks.push(
    'Job updates write metadata only; stale update/removal cannot overwrite another tab or alter retained evidence.'
  );

  const reopened = await second.evaluate(async ref => {
    const value = await window.recoveryStore.open(window.recoveryOwner, ref);
    window.recoveryHandles.pdf = value;
    return { job: value.payload.job, projectJson: value.payload.projectJson };
  }, updated.reference);
  expect(reopened.job.status).toBe('queued');
  expect(reopened.projectJson).toBe(projectJson);
  const completed = await second.evaluate(async () => {
    window.recoveryNow++;
    const handle = window.recoveryHandles.pdf;
    const next = await window.recoveryStore.update(handle, window.recoveryJob(handle, 'complete'));
    window.recoveryHandles.pdf = next;
    return next.reference;
  });
  await second.reload();
  await attach(second, base);
  expect(
    await second.evaluate(
      async ref => (await window.recoveryStore.open(window.recoveryOwner, ref)).payload.job.status,
      completed
    )
  ).toBe('complete');
  checks.push(
    'Completed job status and exact workspace survive a full browser reload without any service request.'
  );

  await first.evaluate(async ref => {
    window.recoveryHandles.latest = await window.recoveryStore.open(window.recoveryOwner, ref);
  }, completed);
  await second.evaluate(ref => window.recoveryStore.remove(window.recoveryOwner, ref), completed);
  expect(
    await first.evaluate(async () => {
      try {
        await window.recoveryStore.assertCurrent(window.recoveryHandles.latest);
        return 'current';
      } catch (error) {
        return error.code;
      }
    })
  ).toBe('RECOVERY_CONFLICT');
  expect(await raw(first, 'payloads', completed.id)).toBeUndefined();
  checks.push(
    'Deletion removes payload and metadata atomically; a late publication check rejects the old handle.'
  );

  const kept = await create(first, 'kept');
  const failed = await first.evaluate(async () => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'payloads')
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
    try {
      await window.recoveryStore.create(
        window.recoveryOwner,
        await window.recoveryFixture('quota')
      );
      return 'created';
    } catch (error) {
      return error.name;
    } finally {
      IDBObjectStore.prototype.put = original;
    }
  });
  expect(failed).toBe('QuotaExceededError');
  expect(await first.evaluate(() => window.recoveryStore.list(window.recoveryOwner))).toHaveLength(
    1
  );
  expect((await raw(first, 'metadata', kept.reference.id)).contentHash).toBe(
    kept.metadata.contentHash
  );
  expect(
    await first.evaluate(async () => {
      const controller = new AbortController();
      controller.abort();
      try {
        await window.recoveryStore.create(
          window.recoveryOwner,
          await window.recoveryFixture('aborted'),
          controller.signal
        );
        return 'created';
      } catch (error) {
        return error.name;
      }
    })
  ).toBe('AbortError');
  expect(await first.evaluate(() => window.recoveryStore.list(window.recoveryOwner))).toHaveLength(
    1
  );
  checks.push(
    'Quota failure after metadata put rolls back both stores; pre-aborted creation leaves previous records intact.'
  );

  for (let i = 0; i < 7; i++) expect((await create(first, `capacity-${i}`)).status).toBe('created');
  expect((await create(first, 'overflow')).status).toBe('RECOVERY_CAPACITY');
  expect(await first.evaluate(() => window.recoveryStore.list(window.recoveryOwner))).toHaveLength(
    8
  );
  expect((await create(first, 'kept')).status).toBe('RECOVERY_ALREADY_SAVED');
  checks.push(
    'Eight-entry capacity and duplicate identity fail without evicting or resubmitting existing requests.'
  );

  const future = {
    ...(await raw(first, 'metadata', kept.reference.id)),
    schemaVersion: 'teul.guideline-job-recovery.v99',
  };
  await raw(first, 'metadata', kept.reference.id, future);
  expect(
    (await first.evaluate(() => window.recoveryStore.list(window.recoveryOwner))).filter(
      row => !row.supported
    )
  ).toHaveLength(1);
  await first.evaluate(() => {
    window.recoveryNow += 86400001;
    return window.recoveryStore.cleanup();
  });
  const afterExpiry = await first.evaluate(() => window.recoveryStore.list(window.recoveryOwner));
  expect(afterExpiry).toHaveLength(1);
  expect(await raw(first, 'metadata', kept.reference.id)).toEqual(future);
  await first.evaluate(
    ref => window.recoveryStore.remove(window.recoveryOwner, ref),
    afterExpiry[0].reference
  );
  expect(await first.evaluate(() => window.recoveryStore.list(window.recoveryOwner))).toEqual([]);
  checks.push(
    'Expiry deletes only known-format temporary entries; future records remain unchanged until explicit removal.'
  );

  await attach(first, `${base}-bytes`);
  const byteEntries = [await create(first, 'bytes-a'), await create(first, 'bytes-b')];
  for (const item of byteEntries) {
    const metadata = await raw(first, 'metadata', item.reference.id);
    // Capacity decisions read small metadata rather than loading 64 MiB of private evidence.
    await raw(first, 'metadata', item.reference.id, { ...metadata, bytes: 32 * 1024 * 1024 });
  }
  expect((await create(first, 'byte-overflow')).status).toBe('RECOVERY_CAPACITY');
  expect(await first.evaluate(() => window.recoveryStore.list(window.recoveryOwner))).toHaveLength(
    2
  );
  checks.push(
    'The 64 MiB total budget rejects another record below the count limit, without loading or evicting existing payloads.'
  );

  await attach(first, `${base}-corrupt`);
  const corrupt = await create(first, 'corrupt');
  const payload = await raw(first, 'payloads', corrupt.reference.id);
  await raw(first, 'payloads', corrupt.reference.id, { ...payload, json: `${payload.json} ` });
  expect(
    await first.evaluate(async ref => {
      try {
        await window.recoveryStore.open(window.recoveryOwner, ref);
        return 'opened';
      } catch (error) {
        return error.code;
      }
    }, corrupt.reference)
  ).toBe('RECOVERY_RECORD_CHANGED');
  expect(await raw(first, 'payloads', corrupt.reference.id)).toEqual({
    ...payload,
    json: `${payload.json} `,
  });
  checks.push('Corrupt retained evidence is rejected without rewriting its original bytes.');
  expect(network).toEqual([]);
  expect(errors).toEqual([]);
} catch (error) {
  errors.push(error.stack ?? String(error));
} finally {
  await context.close();
  await browser.close();
  await server.close();
  await writeFile(
    path.join(output, `storage-node${process.versions.node.split('.')[0]}.json`),
    JSON.stringify(
      {
        node: process.version,
        status: errors.length ? 'failed' : 'passed',
        checks,
        errors,
        network,
      },
      null,
      2
    )
  );
  process.stdout.write(`${JSON.stringify({ checks: checks.length, errors, output })}\n`);
  if (errors.length) process.exitCode = 1;
}
