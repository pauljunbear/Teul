import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  truncate,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { AssetStoreError, SealedAssetStore, type AssetStoreErrorCode } from './assets.js';

const OWNER_A = 'a'.repeat(64);
const OWNER_B = 'b'.repeat(64);
const JOB_A = '12345678-1234-4123-8123-123456789abc';
const JOB_B = '12345678-1234-4123-8123-123456789abd';
const TEXT = Buffer.from(
  'Private guideline #E4F222: only this source owner may read this evidence.'
);

async function fixture(
  t: TestContext,
  options: { maximumBytesPerAsset?: number; maximumTotalBytes?: number } = {}
) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'teul-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'sealed');
  const key = randomBytes(32);
  const store = new SealedAssetStore({ directory, key, ...options });
  const path = (owner = OWNER_A, job = JOB_A, slot = 'input') =>
    join(directory, `${owner}-${job}-${slot}.sealed`);
  return { root, directory, key, store, path };
}

function failure(code: AssetStoreErrorCode) {
  return (error: unknown) => {
    assert.ok(error instanceof AssetStoreError);
    assert.equal(error.code, code);
    assert.equal(error.message, `Evidence storage: ${code}`);
    return true;
  };
}

test('encrypted evidence reopens with a fresh store and preserves restrictive permissions', async t => {
  const { store, directory, key, path } = await fixture(t);
  await store.put(OWNER_A, JOB_A, 'input', TEXT);
  assert.deepEqual(await store.read(OWNER_A, JOB_A, 'input'), TEXT);
  const reopened = new SealedAssetStore({ directory, key });
  assert.deepEqual(await reopened.read(OWNER_A, JOB_A, 'input'), TEXT);
  const sealed = await readFile(path());
  assert.equal(sealed.includes(TEXT), false);
  assert.equal(sealed.length, TEXT.length + 36);
  assert.equal((await lstat(directory)).mode & 0o777, 0o700);
  assert.equal((await lstat(path())).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(directory), [`${OWNER_A}-${JOB_A}-input.sealed`]);
});

test('random nonces change ciphertext on replacement and empty assets round-trip', async t => {
  const { store, path } = await fixture(t);
  await store.put(OWNER_A, JOB_A, 'input', TEXT);
  const first = await readFile(path());
  await store.put(OWNER_A, JOB_A, 'input', TEXT);
  assert.notDeepEqual(await readFile(path()), first);
  await store.put(OWNER_A, JOB_A, 'input', new Uint8Array());
  assert.equal((await store.read(OWNER_A, JOB_A, 'input')).length, 0);
});

test('owner, job and slot are authenticated, including copied ciphertext attacks', async t => {
  const { store, path } = await fixture(t);
  await store.put(OWNER_A, JOB_A, 'input', TEXT);
  await assert.rejects(store.read(OWNER_B, JOB_A, 'input'), failure('missing'));
  for (const [owner, job, slot] of [
    [OWNER_B, JOB_A, 'input'],
    [OWNER_A, JOB_B, 'input'],
    [OWNER_A, JOB_A, 'result'],
  ] as const) {
    await copyFile(path(), path(owner, job, slot));
    await assert.rejects(store.read(owner, job, slot), failure('invalid-asset'));
  }
  assert.deepEqual(await store.read(OWNER_A, JOB_A, 'input'), TEXT);
});

test('wrong key and changes to every sealed section fail authentication', async t => {
  const { store, directory, path } = await fixture(t);
  await store.put(OWNER_A, JOB_A, 'input', TEXT);
  const wrongKey = new SealedAssetStore({ directory, key: randomBytes(32) });
  await assert.rejects(wrongKey.read(OWNER_A, JOB_A, 'input'), failure('invalid-asset'));
  const sealed = await readFile(path());
  for (const position of [0, 8, 20, 36]) {
    const changed = Buffer.from(sealed);
    changed[position] = changed[position]! ^ 1;
    await writeFile(path(), changed);
    await assert.rejects(store.read(OWNER_A, JOB_A, 'input'), failure('invalid-asset'));
  }
});

test('caller cannot change a queued payload or constructor key after invocation', async t => {
  const { store, key } = await fixture(t);
  const bytes = Buffer.from(TEXT);
  const saving = store.put(OWNER_A, JOB_A, 'input', bytes);
  bytes.fill(0);
  key.fill(0);
  await saving;
  assert.deepEqual(await store.read(OWNER_A, JOB_A, 'input'), TEXT);
});

test('asset limit rejects before writes and stat bounds reject oversized sparse files', async t => {
  const { store, directory, path } = await fixture(t, { maximumBytesPerAsset: 32 });
  await assert.rejects(store.put(OWNER_A, JOB_A, 'input', TEXT), failure('limit-exceeded'));
  await assert.rejects(lstat(directory), { code: 'ENOENT' });
  await store.put(OWNER_A, JOB_A, 'input', Buffer.alloc(32));
  await truncate(path(), 1024 * 1024 * 1024);
  await assert.rejects(store.read(OWNER_A, JOB_A, 'input'), failure('invalid-asset'));
  await truncate(path(), 10);
  await assert.rejects(store.read(OWNER_A, JOB_A, 'input'), failure('invalid-asset'));
});

test('failed replacement preserves previous ciphertext and reserves peak disk usage', async t => {
  const { store, directory, path } = await fixture(t, { maximumTotalBytes: TEXT.length + 36 });
  await store.put(OWNER_A, JOB_A, 'input', TEXT);
  const original = await readFile(path());
  await assert.rejects(
    store.put(OWNER_A, JOB_A, 'input', Buffer.from('replacement')),
    failure('limit-exceeded')
  );
  assert.deepEqual(await readFile(path()), original);
  assert.deepEqual(await store.read(OWNER_A, JOB_A, 'input'), TEXT);
  assert.equal((await readdir(directory)).length, 1);
});

test('instances share quota ordering and concurrent replacements are atomic', async t => {
  const { store, directory, key } = await fixture(t, { maximumTotalBytes: 200 });
  const second = new SealedAssetStore({ directory, key, maximumTotalBytes: 200 });
  const writes = await Promise.allSettled([
    store.put(OWNER_A, JOB_A, 'input', TEXT),
    second.put(OWNER_B, JOB_B, 'input', TEXT),
  ]);
  assert.equal(writes.filter(entry => entry.status === 'fulfilled').length, 1);
  const largeStore = new SealedAssetStore({ directory, key });
  const results = await Promise.all([
    largeStore.put(OWNER_A, JOB_A, 'input', Buffer.from('first')),
    largeStore.read(OWNER_A, JOB_A, 'input'),
    largeStore.put(OWNER_A, JOB_A, 'input', Buffer.from('second')),
    largeStore.read(OWNER_A, JOB_A, 'input'),
  ]);
  assert.deepEqual(results[1], Buffer.from('first'));
  assert.deepEqual(results[3], Buffer.from('second'));
});

test('invalid references and configuration cannot create filesystem paths', async t => {
  const { store, directory, key } = await fixture(t);
  for (const owner of ['../outside', OWNER_A.toUpperCase(), '', 'a'.repeat(63), `${OWNER_A}/x`]) {
    await assert.rejects(store.put(owner, JOB_A, 'input', TEXT), failure('invalid-reference'));
  }
  for (const job of ['../outside', '', `${JOB_A}/x`, JOB_A.toUpperCase()]) {
    await assert.rejects(store.read(OWNER_A, job, 'input'), failure('invalid-reference'));
    await assert.rejects(store.deleteJob(OWNER_A, job), failure('invalid-reference'));
  }
  await assert.rejects(
    store.read(OWNER_A, JOB_A, '../input' as 'input'),
    failure('invalid-reference')
  );
  for (const maximumBytesPerAsset of [0, -1, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => new SealedAssetStore({ directory, key, maximumBytesPerAsset }),
      failure('invalid-configuration')
    );
  }
  assert.throws(
    () => new SealedAssetStore({ directory: 'relative', key }),
    failure('invalid-configuration')
  );
  assert.throws(
    () => new SealedAssetStore({ directory: '/', key }),
    failure('invalid-configuration')
  );
  assert.throws(
    () => new SealedAssetStore({ directory, key: randomBytes(31) }),
    failure('invalid-configuration')
  );
  await assert.rejects(lstat(directory), { code: 'ENOENT' });
});

test('store and ancestor symlinks are rejected without reading or writing their targets', async t => {
  const { store, directory, root, key } = await fixture(t);
  const outside = join(root, 'outside');
  await mkdir(outside, { mode: 0o700 });
  await symlink(outside, directory);
  await assert.rejects(store.put(OWNER_A, JOB_A, 'input', TEXT), failure('unsafe-path'));
  await assert.rejects(store.read(OWNER_A, JOB_A, 'input'), failure('unsafe-path'));
  await assert.rejects(store.deleteJob(OWNER_A, JOB_A), failure('unsafe-path'));
  const nested = new SealedAssetStore({ directory: join(directory, 'nested'), key });
  await assert.rejects(nested.put(OWNER_A, JOB_A, 'input', TEXT), failure('unsafe-path'));
  assert.deepEqual(await readdir(outside), []);
});

test('leaf symlinks, hard links and directories are rejected; outside data is untouched', async t => {
  const { store, path, root } = await fixture(t);
  const outside = join(root, 'outside');
  await writeFile(outside, TEXT, { mode: 0o600 });
  await store.put(OWNER_A, JOB_A, 'input', TEXT);
  await rm(path());
  for (const kind of ['symlink', 'hardlink', 'directory']) {
    if (kind === 'symlink') await symlink(outside, path());
    else if (kind === 'hardlink') await link(outside, path());
    else await mkdir(path(), { mode: 0o700 });
    await assert.rejects(store.read(OWNER_A, JOB_A, 'input'), failure('unsafe-path'));
    await assert.rejects(store.put(OWNER_A, JOB_A, 'input', TEXT), failure('unsafe-path'));
    await assert.rejects(store.deleteJob(OWNER_A, JOB_A), failure('unsafe-path'));
    await rm(path(), { recursive: true });
  }
  assert.deepEqual(await readFile(outside), TEXT);
});

test('insecure store and asset modes fail closed instead of silently repairing permissions', async t => {
  const { store, directory, path } = await fixture(t);
  await store.put(OWNER_A, JOB_A, 'input', TEXT);
  await chmod(directory, 0o755);
  await assert.rejects(store.read(OWNER_A, JOB_A, 'input'), failure('unsafe-path'));
  await chmod(directory, 0o700);
  await chmod(path(), 0o644);
  await assert.rejects(store.read(OWNER_A, JOB_A, 'input'), failure('unsafe-path'));
  await assert.rejects(store.put(OWNER_A, JOB_B, 'input', TEXT), failure('unsafe-path'));
});

test('delete is idempotent, owner scoped and removes encrypted crash temporary files', async t => {
  const { store, directory, path } = await fixture(t);
  await store.put(OWNER_A, JOB_A, 'input', TEXT);
  await store.put(OWNER_A, JOB_A, 'result', TEXT);
  await store.put(OWNER_B, JOB_A, 'input', TEXT);
  const orphan = join(directory, `.${OWNER_A}-${JOB_A}-input.${JOB_B}.tmp`);
  await copyFile(path(), orphan);
  await store.deleteJob(OWNER_A, JOB_A);
  await store.deleteJob(OWNER_A, JOB_A);
  assert.deepEqual(await readdir(directory), [`${OWNER_B}-${JOB_A}-input.sealed`]);
  assert.deepEqual(await store.read(OWNER_B, JOB_A, 'input'), TEXT);
});

test('sweep removes only expired ciphertext and crash temporary files, including orphan jobs', async t => {
  const { store, directory, path } = await fixture(t);
  await store.put(OWNER_A, JOB_A, 'input', TEXT);
  await store.put(OWNER_B, JOB_B, 'result', TEXT);
  const orphan = join(directory, `.${OWNER_A}-${JOB_A}-input.${JOB_B}.tmp`);
  await copyFile(path(), orphan);
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
  await utimes(path(), old, old);
  await utimes(orphan, old, old);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  assert.equal(await store.sweepBefore(cutoff), 2);
  assert.equal(await store.sweepBefore(cutoff), 0);
  assert.deepEqual(await readdir(directory), [`${OWNER_B}-${JOB_B}-result.sealed`]);
  await assert.rejects(store.sweepBefore(NaN), failure('invalid-reference'));
});

test('sweep rejects unsafe entries before deleting any valid expired evidence', async t => {
  const { store, path, root } = await fixture(t);
  await store.put(OWNER_A, JOB_A, 'input', TEXT);
  const outside = join(root, 'outside');
  await writeFile(outside, TEXT, { mode: 0o600 });
  await symlink(outside, path(OWNER_B, JOB_B, 'result'));
  await assert.rejects(store.sweepBefore(Date.now() + 1000), failure('unsafe-path'));
  assert.deepEqual(await store.read(OWNER_A, JOB_A, 'input'), TEXT);
  assert.deepEqual(await readFile(outside), TEXT);
});
