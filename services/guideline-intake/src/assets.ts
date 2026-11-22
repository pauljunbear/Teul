import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, opendir, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { INTAKE_LIMITS } from './protocol.js';

export type AssetSlot = 'input' | 'result';
export type AssetStoreErrorCode =
  | 'invalid-reference'
  | 'invalid-configuration'
  | 'limit-exceeded'
  | 'missing'
  | 'unsafe-path'
  | 'invalid-asset'
  | 'storage-failure';

/** Stable, deliberately redacted errors: never include an owner, pathname or payload. */
export class AssetStoreError extends Error {
  constructor(readonly code: AssetStoreErrorCode) {
    super(`Evidence storage: ${code}`);
    this.name = 'AssetStoreError';
  }
}

export interface SealedAssetStoreOptions {
  /** Absolute path with an existing parent; every path component must be real, not a symlink. */
  directory: string;
  key: Uint8Array;
  maximumBytesPerAsset?: number;
  /** Includes ciphertext headers and temporary files; replacement reserves its peak disk usage. */
  maximumTotalBytes?: number;
}

const MAGIC = Buffer.from('TEULAS01');
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + NONCE_BYTES + TAG_BYTES;
const OWNER = '[0-9a-f]{64}';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const OWNER_PATTERN = new RegExp(`^${OWNER}$`);
const UUID_PATTERN = new RegExp(`^${UUID}$`);
const STORED_NAME = new RegExp(
  `^(?:${OWNER}-${UUID}-(?:input|result)\\.sealed|\\.${OWNER}-${UUID}-(?:input|result)\\.${UUID}\\.tmp)$`
);

// Multiple store instances in this process share ordering and quota accounting.
// The deployment must have one writer process; this is not a distributed lock.
const queues = new Map<string, Promise<void>>();

function errno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function reference(ownerKey: string, jobId: string, slot: AssetSlot): string {
  if (
    typeof ownerKey !== 'string' ||
    !OWNER_PATTERN.test(ownerKey) ||
    typeof jobId !== 'string' ||
    !UUID_PATTERN.test(jobId) ||
    (slot !== 'input' && slot !== 'result')
  ) {
    throw new AssetStoreError('invalid-reference');
  }
  return `${ownerKey}-${jobId}-${slot}`;
}

function aad(ownerKey: string, jobId: string, slot: AssetSlot): Buffer {
  return Buffer.from(`teul.guideline-assets.v1\n${ownerKey}\n${jobId}\n${slot}`, 'utf8');
}

function bound(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new AssetStoreError('invalid-configuration');
  return value;
}

function assertPrivateRegularFile(stat: Stats): void {
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== 0o600 ||
    (typeof process.getuid === 'function' && stat.uid !== process.getuid())
  ) {
    throw new AssetStoreError('unsafe-path');
  }
}

/**
 * Encrypted temporary evidence, not an authorization or retention service.
 * Callers authenticate owners, expire/delete jobs and exclude this directory from backups.
 * A dedicated service UID protects the 0700 directory: portable Node filesystem APIs
 * cannot defend ancestor replacement races by another process with the same OS UID.
 * The host filesystem must support atomic rename and fsync (not a network share).
 */
export class SealedAssetStore {
  private readonly directory: string;
  private readonly key: Buffer;
  private readonly maximumBytesPerAsset: number;
  private readonly maximumTotalBytes: number;

  constructor(options: SealedAssetStoreOptions) {
    if (
      !options ||
      typeof options.directory !== 'string' ||
      !isAbsolute(options.directory) ||
      !(options.key instanceof Uint8Array) ||
      options.key.length !== 32
    ) {
      throw new AssetStoreError('invalid-configuration');
    }
    this.directory = resolve(options.directory);
    if (this.directory === parse(this.directory).root)
      throw new AssetStoreError('invalid-configuration');
    this.key = Buffer.from(options.key);
    this.maximumBytesPerAsset = bound(options.maximumBytesPerAsset ?? INTAKE_LIMITS.requestBytes);
    this.maximumTotalBytes = bound(options.maximumTotalBytes ?? 100 * 1024 * 1024);
  }

  private async ordered<T>(operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(this.directory) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(done => {
      release = done;
    });
    queues.set(this.directory, current);
    await previous;
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AssetStoreError) throw error;
      if (errno(error, 'ELOOP') || errno(error, 'ENOTDIR'))
        throw new AssetStoreError('unsafe-path');
      throw new AssetStoreError('storage-failure');
    } finally {
      release();
      if (queues.get(this.directory) === current) queues.delete(this.directory);
    }
  }

  private async prepare(): Promise<void> {
    // Reject symlinks in parents before creating anything. The caller creates the parent.
    const parent = dirname(this.directory);
    if ((await realpath(parent)) !== parent) throw new AssetStoreError('unsafe-path');
    let cursor = parent;
    for (;;) {
      const stat = await lstat(cursor);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AssetStoreError('unsafe-path');
      const next = dirname(cursor);
      if (next === cursor) break;
      cursor = next;
    }
    try {
      await mkdir(this.directory, { mode: 0o700 });
    } catch (error) {
      if (!errno(error, 'EEXIST')) throw error;
    }
    const stat = await lstat(this.directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o777) !== 0o700 ||
      (typeof process.getuid === 'function' && stat.uid !== process.getuid())
    ) {
      throw new AssetStoreError('unsafe-path');
    }
  }

  private async existing(path: string): Promise<Stats | undefined> {
    try {
      const stat = await lstat(path);
      assertPrivateRegularFile(stat);
      return stat;
    } catch (error) {
      if (errno(error, 'ENOENT')) return undefined;
      throw error;
    }
  }

  private async usedBytes(): Promise<number> {
    let total = 0;
    const entries = await opendir(this.directory);
    for await (const entry of entries) {
      if (!STORED_NAME.test(entry.name)) throw new AssetStoreError('unsafe-path');
      const stat = await this.existing(join(this.directory, entry.name));
      if (!stat) continue;
      total += stat.size;
      if (!Number.isSafeInteger(total) || total > this.maximumTotalBytes)
        throw new AssetStoreError('limit-exceeded');
    }
    return total;
  }

  private async syncDirectory(): Promise<void> {
    const handle = await open(
      this.directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async put(ownerKey: string, jobId: string, slot: AssetSlot, bytes: Uint8Array): Promise<void> {
    const name = reference(ownerKey, jobId, slot);
    if (!(bytes instanceof Uint8Array)) throw new AssetStoreError('invalid-asset');
    if (bytes.byteLength > this.maximumBytesPerAsset) throw new AssetStoreError('limit-exceeded');
    // Detach caller-owned bytes before yielding to a queued operation.
    const plaintext = Buffer.from(bytes);
    try {
      await this.ordered(async () => {
        await this.prepare();
        const destination = join(this.directory, `${name}.sealed`);
        await this.existing(destination);
        if ((await this.usedBytes()) + plaintext.length + HEADER_BYTES > this.maximumTotalBytes)
          throw new AssetStoreError('limit-exceeded');
        const nonce = randomBytes(NONCE_BYTES);
        const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
        cipher.setAAD(aad(ownerKey, jobId, slot));
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const sealed = Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), ciphertext]);
        const temporary = join(this.directory, `.${name}.${randomUUID()}.tmp`);
        let created = false;
        try {
          const handle = await open(
            temporary,
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
            0o600
          );
          created = true;
          try {
            assertPrivateRegularFile(await handle.stat());
            await handle.writeFile(sealed);
            await handle.sync();
          } finally {
            await handle.close();
          }
          // Never follow a destination symlink; rename atomically replaces only a checked leaf.
          await this.existing(destination);
          await rename(temporary, destination);
          created = false;
          await this.syncDirectory();
        } catch (error) {
          if (created) {
            // Unlink the entry itself; no target is followed even if replaced by a symlink.
            try {
              await unlink(temporary);
            } catch (cleanupError) {
              if (!errno(cleanupError, 'ENOENT')) throw cleanupError;
            }
          }
          throw error;
        }
      });
    } finally {
      plaintext.fill(0);
    }
  }

  async read(ownerKey: string, jobId: string, slot: AssetSlot): Promise<Uint8Array> {
    const name = reference(ownerKey, jobId, slot);
    return this.ordered(async () => {
      await this.prepare();
      const path = join(this.directory, `${name}.sealed`);
      const before = await this.existing(path);
      if (!before) throw new AssetStoreError('missing');
      let handle;
      try {
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      } catch (error) {
        if (errno(error, 'ENOENT')) throw new AssetStoreError('missing');
        throw error;
      }
      let sealed: Buffer;
      try {
        const stat = await handle.stat();
        assertPrivateRegularFile(stat);
        if (stat.dev !== before.dev || stat.ino !== before.ino)
          throw new AssetStoreError('unsafe-path');
        if (stat.size < HEADER_BYTES || stat.size > this.maximumBytesPerAsset + HEADER_BYTES)
          throw new AssetStoreError('invalid-asset');
        sealed = Buffer.alloc(stat.size);
        let offset = 0;
        while (offset < sealed.length) {
          const { bytesRead } = await handle.read(sealed, offset, sealed.length - offset, offset);
          if (!bytesRead) throw new AssetStoreError('invalid-asset');
          offset += bytesRead;
        }
        const extra = await handle.read(Buffer.alloc(1), 0, 1, offset);
        if (extra.bytesRead) throw new AssetStoreError('invalid-asset');
      } finally {
        await handle.close();
      }
      if (!sealed.subarray(0, MAGIC.length).equals(MAGIC))
        throw new AssetStoreError('invalid-asset');
      try {
        const nonceEnd = MAGIC.length + NONCE_BYTES;
        const decipher = createDecipheriv(
          'aes-256-gcm',
          this.key,
          sealed.subarray(MAGIC.length, nonceEnd)
        );
        decipher.setAAD(aad(ownerKey, jobId, slot));
        decipher.setAuthTag(sealed.subarray(nonceEnd, HEADER_BYTES));
        return Buffer.concat([decipher.update(sealed.subarray(HEADER_BYTES)), decipher.final()]);
      } catch {
        throw new AssetStoreError('invalid-asset');
      }
    });
  }

  async deleteJob(ownerKey: string, jobId: string): Promise<void> {
    const input = reference(ownerKey, jobId, 'input');
    const result = reference(ownerKey, jobId, 'result');
    await this.ordered(async () => {
      await this.prepare();
      const names = [`${input}.sealed`, `${result}.sealed`];
      const temporaryPattern = new RegExp(`^\\.(?:${input}|${result})\\.${UUID}\\.tmp$`);
      const entries = await opendir(this.directory);
      for await (const entry of entries)
        if (temporaryPattern.test(entry.name)) names.push(entry.name);
      // Validate every matching entry before deletion, including leftovers from interrupted writes.
      for (const name of names) await this.existing(join(this.directory, name));
      for (const name of names) {
        try {
          await unlink(join(this.directory, name));
        } catch (error) {
          if (!errno(error, 'ENOENT')) throw error;
        }
      }
      await this.syncDirectory();
    });
  }

  /** Parent supplies the retention cutoff; includes encrypted orphans and crash temporary files. */
  async sweepBefore(cutoffMs: number): Promise<number> {
    if (!Number.isFinite(cutoffMs) || cutoffMs < 0) throw new AssetStoreError('invalid-reference');
    return this.ordered(async () => {
      await this.prepare();
      const expired: string[] = [];
      const entries = await opendir(this.directory);
      for await (const entry of entries) {
        if (!STORED_NAME.test(entry.name)) throw new AssetStoreError('unsafe-path');
        const stat = await this.existing(join(this.directory, entry.name));
        if (stat && stat.mtimeMs < cutoffMs) expired.push(entry.name);
      }
      let removed = 0;
      for (const name of expired) {
        const path = join(this.directory, name);
        // Recheck before unlink. Unlink never traverses the leaf even if it changes afterward.
        const stat = await this.existing(path);
        if (!stat || stat.mtimeMs >= cutoffMs) continue;
        try {
          await unlink(path);
          removed += 1;
        } catch (error) {
          if (!errno(error, 'ENOENT')) throw error;
        }
      }
      if (removed) await this.syncDirectory();
      return removed;
    });
  }
}
