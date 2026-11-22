import { indexedDbTransaction } from '../indexedDbTransaction';
import {
  IntakeError,
  canonicalIntakeJson,
  digest,
  type IntakeJobSnapshot,
} from '../../../../services/guideline-intake/src/protocol';
import { hashCanonical, readIntakeJobSnapshot } from './intakeClient';
import {
  RECOVERY_LIMITS,
  RECOVERY_VERSION,
  readRecoveryMetadata,
  readRecoveryPayload,
  recoveryExpected,
  recoveryId,
  type RecoveryHandle,
  type RecoveryMetadata,
  type RecoveryPayload,
  type RecoveryReference,
} from './recoveryRecord';

export const RECOVERY_DATABASE = 'teul-studio:guideline-recovery:v1';
const MAX_METADATA = 128;
const text = (value: unknown) => canonicalIntakeJson(value, RECOVERY_LIMITS.entryBytes);
const metadataText = (value: unknown) => canonicalIntakeJson(value, 4096);
const conflict = () => new IntakeError('RECOVERY_CONFLICT', 409);
const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export interface RecoveryListEntry {
  reference: RecoveryReference;
  kind: RecoveryMetadata['kind'] | null;
  createdAt: number | null;
  expiresAt: number | null;
  supported: boolean;
}

/** Separate temporary cache. Metadata lists never read retained private project/image payloads. */
export function createRecoveryStore(options: { name?: string; now?: () => number } = {}) {
  const name = options.name ?? RECOVERY_DATABASE;
  const now = options.now ?? Date.now;
  let opening: Promise<IDBDatabase> | undefined;
  const trusted = new WeakSet<RecoveryHandle>();
  async function database() {
    if (!opening)
      opening = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        let rejected = false;
        request.onupgradeneeded = () => {
          request.result.createObjectStore('metadata', { keyPath: 'id' });
          request.result.createObjectStore('payloads', { keyPath: 'id' });
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
          rejected = true;
          reject(new IntakeError('RECOVERY_STORAGE_UNAVAILABLE'));
        };
        request.onsuccess = () => {
          const db = request.result;
          if (rejected) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            opening = undefined;
          };
          resolve(db);
        };
      }).catch(error => {
        opening = undefined;
        throw error;
      });
    return opening;
  }
  async function metadataRows() {
    return indexedDbTransaction<unknown[]>(
      await database(),
      ['metadata'],
      'readonly',
      (tx, finish) => {
        const request = tx.objectStore('metadata').getAll(undefined, MAX_METADATA + 1);
        request.onsuccess = () => finish(request.result);
      }
    );
  }
  const bounded = (rows: unknown[]) => {
    if (rows.length > MAX_METADATA) throw new IntakeError('RECOVERY_CAPACITY');
  };
  function owned(raw: unknown, ownerBinding: string) {
    digest(ownerBinding);
    if (
      !plain(raw) ||
      raw.ownerBinding !== ownerBinding ||
      typeof raw.id !== 'string' ||
      !raw.id.startsWith(`${ownerBinding.slice(7)}.`)
    )
      throw new IntakeError('RECOVERY_OWNER_CHANGED');
  }
  async function reference(raw: unknown): Promise<RecoveryReference> {
    if (!plain(raw) || typeof raw.id !== 'string') throw new IntakeError('RECOVERY_RECORD_INVALID');
    return Object.freeze({ id: raw.id, token: await hashCanonical(metadataText(raw)) });
  }
  async function handle(
    metadata: RecoveryMetadata,
    payload: RecoveryPayload,
    project: RecoveryHandle['project']
  ) {
    const value = Object.freeze({
      metadata,
      payload,
      project,
      reference: await reference(metadata),
    });
    trusted.add(value);
    return value;
  }
  async function cleanup() {
    const db = await database();
    let failure: unknown;
    try {
      await indexedDbTransaction<void>(db, ['metadata', 'payloads'], 'readwrite', (tx, finish) => {
        const metadata = tx.objectStore('metadata'),
          payloads = tx.objectStore('payloads');
        const request = metadata.getAll(undefined, MAX_METADATA + 1);
        request.onsuccess = () => {
          try {
            bounded(request.result);
            for (const raw of request.result) {
              let item: RecoveryMetadata;
              try {
                item = readRecoveryMetadata(raw);
              } catch {
                continue;
              }
              if (item.expiresAt > now()) continue;
              metadata.delete(item.id);
              payloads.delete(item.id);
            }
            finish();
          } catch (error) {
            failure = error;
            tx.abort();
          }
        };
      });
    } catch (error) {
      throw failure ?? error;
    }
  }
  async function list(ownerBinding: string): Promise<RecoveryListEntry[]> {
    digest(ownerBinding);
    await cleanup();
    const rows = await metadataRows();
    bounded(rows);
    const entries = await Promise.all(
      rows
        .filter(raw => plain(raw) && raw.ownerBinding === ownerBinding)
        .map(async raw => {
          owned(raw, ownerBinding);
          const ref = await reference(raw);
          let item: RecoveryMetadata | null = null;
          try {
            item = readRecoveryMetadata(raw);
          } catch {
            /* Future metadata remains removable, never executable. */
          }
          return {
            reference: ref,
            kind: item?.kind ?? null,
            createdAt: item?.createdAt ?? null,
            expiresAt: item?.expiresAt ?? null,
            supported: !!item,
          };
        })
    );
    return entries.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }
  async function readRaw(ownerBinding: string, ref: RecoveryReference, includePayload = false) {
    digest(ownerBinding);
    digest(ref.token);
    if (
      !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(ref.id) ||
      !ref.id.startsWith(`${ownerBinding.slice(7)}.`)
    )
      throw new IntakeError('RECOVERY_OWNER_CHANGED');
    const raw = await indexedDbTransaction<{ metadata: unknown; payload?: unknown }>(
      await database(),
      includePayload ? ['metadata', 'payloads'] : ['metadata'],
      'readonly',
      (tx, finish) => {
        const metadata = tx.objectStore('metadata').get(ref.id);
        if (includePayload) {
          const payload = tx.objectStore('payloads').get(ref.id);
          payload.onsuccess = () => finish({ metadata: metadata.result, payload: payload.result });
        } else metadata.onsuccess = () => finish({ metadata: metadata.result });
      }
    );
    if (raw.metadata === undefined) throw conflict();
    owned(raw.metadata, ownerBinding);
    if ((await hashCanonical(metadataText(raw.metadata))) !== ref.token) throw conflict();
    return raw;
  }
  async function open(
    ownerBinding: string,
    ref: RecoveryReference,
    signal?: AbortSignal
  ): Promise<RecoveryHandle> {
    signal?.throwIfAborted();
    const raw = await readRaw(ownerBinding, ref, true);
    const metadata = readRecoveryMetadata(raw.metadata);
    if (metadata.expiresAt <= now()) throw new IntakeError('RECOVERY_EXPIRED');
    if (
      !plain(raw.payload) ||
      raw.payload.id !== metadata.id ||
      typeof raw.payload.json !== 'string'
    )
      throw new IntakeError('RECOVERY_RECORD_INVALID');
    const json = raw.payload.json;
    if (
      new TextEncoder().encode(json).length !== metadata.bytes ||
      (await hashCanonical(json)) !== metadata.contentHash
    )
      throw new IntakeError('RECOVERY_RECORD_CHANGED');
    const parsed = await readRecoveryPayload(JSON.parse(json), signal);
    if (parsed.payload.job !== null) throw new IntakeError('RECOVERY_RECORD_INVALID');
    if (
      metadata.kind !== parsed.payload.submission.kind ||
      metadata.id !== recoveryId(ownerBinding, parsed.payload.requestHash)
    )
      throw new IntakeError('RECOVERY_RECORD_CHANGED');
    const job =
      metadata.job === null
        ? null
        : readIntakeJobSnapshot(metadata.job, recoveryExpected(parsed.payload.submission));
    // Another tab may have updated/deleted this record while its project was being verified.
    await readRaw(ownerBinding, ref);
    signal?.throwIfAborted();
    return handle(metadata, Object.freeze({ ...parsed.payload, job }), parsed.project);
  }
  async function write(
    metadata: RecoveryMetadata,
    json: string | undefined,
    previous?: RecoveryHandle,
    signal?: AbortSignal
  ) {
    let failure: unknown;
    signal?.throwIfAborted();
    try {
      await indexedDbTransaction<void>(
        await database(),
        json === undefined ? ['metadata'] : ['metadata', 'payloads'],
        'readwrite',
        (tx, finish) => {
          const rows = tx.objectStore('metadata');
          const request = rows.getAll(undefined, MAX_METADATA + 1);
          request.onsuccess = () => {
            try {
              signal?.throwIfAborted();
              bounded(request.result);
              const existing = request.result.find(
                (raw: unknown) => plain(raw) && raw.id === metadata.id
              );
              if (!previous && existing) throw new IntakeError('RECOVERY_ALREADY_SAVED', 409);
              if (
                previous &&
                (!existing || metadataText(existing) !== metadataText(previous.metadata))
              )
                throw conflict();
              const remaining = request.result.filter((raw: unknown) => raw !== existing);
              const used = remaining.reduce((sum: number, raw: unknown) => {
                // Unknown formats must not be silently overwritten or excluded from capacity accounting.
                return sum + readRecoveryMetadata(raw).bytes;
              }, 0);
              if (
                remaining.length >= RECOVERY_LIMITS.entries ||
                used + metadata.bytes > RECOVERY_LIMITS.totalBytes
              )
                throw new IntakeError('RECOVERY_CAPACITY');
              rows.put(metadata);
              if (json !== undefined) tx.objectStore('payloads').put({ id: metadata.id, json });
              finish();
            } catch (error) {
              failure = error;
              tx.abort();
            }
          };
        }
      );
    } catch (error) {
      throw failure ?? error;
    }
  }
  async function create(
    ownerBinding: string,
    raw: RecoveryPayload,
    signal?: AbortSignal
  ): Promise<RecoveryHandle> {
    digest(ownerBinding);
    const parsed = await readRecoveryPayload(raw, signal);
    if (parsed.payload.job !== null) throw new IntakeError('RECOVERY_RECORD_INVALID');
    const json = text(parsed.payload),
      time = now();
    const metadata = readRecoveryMetadata({
      schemaVersion: RECOVERY_VERSION,
      id: recoveryId(ownerBinding, parsed.payload.requestHash),
      ownerBinding,
      kind: parsed.payload.submission.kind,
      revision: 1,
      createdAt: time,
      updatedAt: time,
      expiresAt: time + RECOVERY_LIMITS.retentionMs,
      bytes: new TextEncoder().encode(json).length,
      contentHash: await hashCanonical(json),
      job: null,
    });
    await cleanup();
    await write(metadata, json, undefined, signal);
    return handle(metadata, parsed.payload, parsed.project);
  }
  async function update(
    previous: RecoveryHandle,
    rawJob: IntakeJobSnapshot,
    signal?: AbortSignal
  ): Promise<RecoveryHandle> {
    if (!trusted.has(previous)) throw new IntakeError('RECOVERY_RECORD_INVALID');
    if (previous.metadata.expiresAt <= now()) throw new IntakeError('RECOVERY_EXPIRED');
    const job = readIntakeJobSnapshot(
      JSON.parse(canonicalIntakeJson(rawJob)),
      recoveryExpected(previous.payload.submission),
      previous.payload.job?.id
    );
    if (previous.payload.job && job.updatedAt < previous.payload.job.updatedAt) throw conflict();
    Object.freeze(job.binding);
    const payload = Object.freeze({ ...previous.payload, job: Object.freeze(job) });
    const metadata = readRecoveryMetadata({
      ...previous.metadata,
      job,
      revision: previous.metadata.revision + 1,
      updatedAt: Math.max(now(), previous.metadata.updatedAt),
    });
    await write(metadata, undefined, previous, signal);
    return handle(metadata, payload, previous.project);
  }
  async function assertCurrent(value: RecoveryHandle, signal?: AbortSignal) {
    if (!trusted.has(value)) throw new IntakeError('RECOVERY_RECORD_INVALID');
    signal?.throwIfAborted();
    const raw = await indexedDbTransaction<unknown>(
      await database(),
      ['metadata'],
      'readonly',
      (tx, finish) => {
        const request = tx.objectStore('metadata').get(value.metadata.id);
        request.onsuccess = () => finish(request.result);
      }
    );
    signal?.throwIfAborted();
    if (!raw || metadataText(raw) !== metadataText(value.metadata)) throw conflict();
    if (value.metadata.expiresAt <= now()) throw new IntakeError('RECOVERY_EXPIRED');
  }
  async function remove(ownerBinding: string, ref: RecoveryReference, signal?: AbortSignal) {
    const before = await readRaw(ownerBinding, ref);
    let failure: unknown;
    signal?.throwIfAborted();
    try {
      await indexedDbTransaction<void>(
        await database(),
        ['metadata', 'payloads'],
        'readwrite',
        (tx, finish) => {
          const rows = tx.objectStore('metadata'),
            values = tx.objectStore('payloads');
          const request = rows.get(ref.id);
          request.onsuccess = () => {
            try {
              signal?.throwIfAborted();
              if (!request.result || metadataText(request.result) !== metadataText(before.metadata))
                throw conflict();
              rows.delete(ref.id);
              values.delete(ref.id);
              finish();
            } catch (error) {
              failure = error;
              tx.abort();
            }
          };
        }
      );
    } catch (error) {
      throw failure ?? error;
    }
  }
  return {
    create,
    list,
    open,
    update,
    assertCurrent,
    remove,
    cleanup,
    close: async () => {
      (await opening)?.close();
      opening = undefined;
    },
  };
}
export const guidelineRecoveryStore = createRecoveryStore();
