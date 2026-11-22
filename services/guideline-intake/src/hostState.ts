import { randomUUID, timingSafeEqual } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

export class IntakeHostError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function independentHostKeys(ownerKey: unknown, assetKey: unknown): boolean {
  return (
    ownerKey instanceof Uint8Array &&
    ownerKey.length === 32 &&
    assetKey instanceof Uint8Array &&
    assetKey.length === 32 &&
    !timingSafeEqual(ownerKey, assetKey)
  );
}
function fail(code: string): never {
  throw new IntakeHostError(code);
}
function errno(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code;
}
function privateFile(stat: Stats) {
  return (
    stat.isFile() &&
    stat.nlink === 1 &&
    (stat.mode & 0o777) === 0o600 &&
    (typeof process.getuid !== 'function' || stat.uid === process.getuid())
  );
}
export async function claimState(directory: string, create = true) {
  if (!isAbsolute(directory) || (await realpath(dirname(directory))) !== dirname(directory))
    fail('HOST_STATE_UNSAFE');
  try {
    if (create) await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (!errno(error, 'EEXIST')) throw error;
  }
  const stat = await lstat(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o777) !== 0o700 ||
    (typeof process.getuid === 'function' && stat.uid !== process.getuid())
  )
    fail('HOST_STATE_UNSAFE');
  const path = join(directory, 'worker.lock');
  let file;
  try {
    file = await open(path, 'wx', 0o600);
  } catch (error) {
    if (errno(error, 'EEXIST')) fail('HOST_STATE_LOCKED');
    throw error;
  }
  const identity = await file.stat();
  const release = async () => {
    const current = await lstat(path);
    if (current.dev !== identity.dev || current.ino !== identity.ino) fail('HOST_LOCK_CHANGED');
    await unlink(path);
  };
  try {
    await file.writeFile(
      JSON.stringify({ pid: process.pid, hostname: hostname(), instance: randomUUID() })
    );
    await file.sync();
  } catch (error) {
    await file.close();
    await release();
    throw error;
  }
  await file.close();
  return release;
}
export async function prepareDatabase(directory: string, create = true) {
  const path = join(directory, 'jobs.sqlite');
  const file = await open(
    path,
    (create ? constants.O_CREAT : 0) | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600
  );
  try {
    if (!privateFile(await file.stat())) fail('HOST_STATE_UNSAFE');
  } finally {
    await file.close();
  }
  for (const suffix of ['-wal', '-shm']) {
    try {
      if (!privateFile(await lstat(path + suffix))) fail('HOST_STATE_UNSAFE');
    } catch (error) {
      if (!errno(error, 'ENOENT')) throw error;
    }
  }
  return path;
}
