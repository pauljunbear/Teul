import { utf8ByteLength } from '../../../../src/lib/utf8';
import { indexedDbTransaction } from '../indexedDbTransaction';
import { CAPTURE_LIMITS, digestSource } from './evidence';
import {
  PROJECT_RECORD_V1,
  SOURCE_SET_SNAPSHOT_V1,
  MAX_PROJECT_REVISIONS,
  appendProjectRecord,
  readProjectRecord,
  validProjectHash as validHash,
  validProjectId as validId,
  type LibrarySnapshot,
} from './projectRecord';
import {
  readLibraryProject,
  libraryProjectName,
  libraryProjectPdfHash,
  type LibraryProjectKind,
  type OpenedLibraryProject,
} from './libraryProjectCodec';

export const GUIDELINE_DATABASE = 'teul-studio:guideline-projects:v1';
export const GUIDELINE_STORAGE_LIMITS = Object.freeze({
  projects: 24,
  projectBytes: 8 * 1024 * 1024,
  assetBytes: 100 * 1024 * 1024,
});
const MAX_RECOVERY_ROWS = 128;
const encoder = new TextEncoder();
const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const hashText = (text: string) => digestSource(encoder.encode(text));

export class GuidelineStorageError extends Error {
  constructor(
    public readonly code: 'conflict' | 'capacity' | 'invalid' | 'storage',
    message: string
  ) {
    super(message);
  }
}
const conflict = () =>
  new GuidelineStorageError(
    'conflict',
    'This project changed or was deleted in another tab. Reopen it, or save your current work as a new copy.'
  );
const capacity = () =>
  new GuidelineStorageError(
    'capacity',
    'The local library is full. Your previous save and current work are unchanged. Download the project, or delete a saved copy to make space.'
  );
export interface GuidelineProjectReference {
  id: string;
  token: string;
}
interface PdfAsset {
  hash: string;
  name: string;
  bytes: number;
  blob: Blob;
}
export interface GuidelineLibraryEntry {
  reference: GuidelineProjectReference;
  kind: LibraryProjectKind | null;
  name: string;
  revision: number | null;
  updatedAt: number | null;
  retained: boolean;
  bytes: number;
  pdfHash: string | null;
  pdfHashes: string[];
  revisions: { revision: number; updatedAt: number; kind: LibraryProjectKind }[];
}
export interface GuidelineLibrarySnapshot {
  entries: GuidelineLibraryEntry[];
  projectBytes: number;
  assets: { hash: string; name: string; bytes: number; valid: boolean; projects: string[] }[];
  assetBytes: number;
}
export interface LocalGuidelineProject {
  reference: GuidelineProjectReference;
  workspaceId: string;
  json: string;
  value: OpenedLibraryProject;
  pdf: File | null;
  assetNotice: string;
  revision: number;
  latestRevision: number;
}
async function verifiedRecord(value: unknown) {
  const parsed = readProjectRecord(value);
  if (!parsed) return null;
  const valid = await Promise.all(
    [...parsed.history, parsed.head].map(
      async item => (await hashText(item.projectJson)) === item.payloadHash
    )
  );
  return valid.every(Boolean) ? parsed : null;
}
function asset(value: unknown): PdfAsset {
  if (
    !plain(value) ||
    !validHash(value.hash) ||
    typeof value.name !== 'string' ||
    value.name.length > 200 ||
    !(value.blob instanceof Blob) ||
    value.bytes !== value.blob.size ||
    value.blob.size > CAPTURE_LIMITS.pdfBytes ||
    value.blob.size < 5
  )
    throw new GuidelineStorageError(
      'invalid',
      'A saved source file has invalid metadata. Existing projects are retained.'
    );
  return value as unknown as PdfAsset;
}
function assetSummary(value: unknown) {
  let valid = true;
  try {
    asset(value);
  } catch {
    valid = false;
  }
  const raw = plain(value) ? value : {};
  return {
    hash: typeof raw.hash === 'string' ? raw.hash : '',
    name: typeof raw.name === 'string' ? raw.name.slice(0, 200) : 'Unavailable original PDF',
    bytes: raw.blob instanceof Blob ? raw.blob.size : 0,
    valid,
  };
}
// Recovery is JSON-only. Never silently drop a future binary value during a backup or CAS comparison.
function rawJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype
    )
      throw new GuidelineStorageError(
        'invalid',
        'A future storage format needs a newer Studio to recover. Its original record is unchanged.'
      );
    if (typeof item === 'number' && !Number.isFinite(item))
      throw new GuidelineStorageError(
        'invalid',
        'Unsupported storage value; the original record is unchanged.'
      );
    if (item === undefined || typeof item === 'bigint')
      throw new GuidelineStorageError(
        'invalid',
        'Unsupported storage value; the original record is unchanged.'
      );
    return item;
  });
}
async function checkPdf(blob: Blob, expected: string): Promise<void> {
  if (
    blob.size > CAPTURE_LIMITS.pdfBytes ||
    blob.size < 5 ||
    (await blob.slice(0, 5).text()) !== '%PDF-' ||
    (await digestSource(new Uint8Array(await blob.arrayBuffer()))) !== expected
  )
    throw new GuidelineStorageError(
      'invalid',
      'The original PDF does not match this project. Save the project without that file, or choose its original PDF.'
    );
}

/** Independent of the legacy palette database. Async replay and hashing happen before short atomic writes. */
export function createGuidelineProjectStore(options: { databaseName?: string } = {}) {
  const name = options.databaseName ?? GUIDELINE_DATABASE;
  let opening: Promise<IDBDatabase> | undefined;
  const listeners = new Set<() => void>();
  let channel: BroadcastChannel | undefined;
  const notify = () =>
    listeners.forEach(listener => {
      try {
        listener();
      } catch {
        /* Committed data is independent of observers. */
      }
    });
  let listing: Promise<GuidelineLibrarySnapshot> | undefined;
  const refreshListeners = () => {
    listing = undefined;
    notify();
  };
  const publish = () => {
    refreshListeners();
    try {
      const sender = channel ?? new BroadcastChannel(name);
      sender.postMessage('changed');
      if (!channel) sender.close();
    } catch {
      /* Focus refresh remains available. */
    }
  };
  async function database() {
    if (!opening)
      opening = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        let rejected = false;
        request.onupgradeneeded = () => {
          try {
            request.result.createObjectStore('projects', { keyPath: 'id' });
            request.result.createObjectStore('assets', { keyPath: 'hash' });
          } catch (error) {
            reject(error);
            try {
              request.transaction?.abort();
            } catch {
              /* The upgrade may already be aborted. */
            }
          }
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
          rejected = true;
          reject(
            new GuidelineStorageError(
              'storage',
              'Close older Studio tabs and try again. Your saved projects are unchanged.'
            )
          );
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
  async function rows() {
    const db = await database();
    return indexedDbTransaction<{ projects: unknown[]; assets: unknown[] }>(
      db,
      ['projects', 'assets'],
      'readonly',
      (tx, finish) => {
        const projects = tx.objectStore('projects').getAll(undefined, MAX_RECOVERY_ROWS + 1);
        const assets = tx.objectStore('assets').getAll(undefined, MAX_RECOVERY_ROWS + 1);
        assets.onsuccess = () => finish({ projects: projects.result, assets: assets.result });
      }
    );
  }
  function bounded(raw: { projects: unknown[]; assets: unknown[] }) {
    if (raw.projects.length > MAX_RECOVERY_ROWS || raw.assets.length > MAX_RECOVERY_ROWS)
      throw new GuidelineStorageError(
        'capacity',
        'This library exceeds the supported recovery size. No records were changed.'
      );
  }
  async function checked(reference: GuidelineProjectReference) {
    if (!validId(reference.id) || !validHash(reference.token)) throw conflict();
    const db = await database();
    const raw = await indexedDbTransaction<unknown>(db, ['projects'], 'readonly', (tx, finish) => {
      const request = tx.objectStore('projects').get(reference.id);
      request.onsuccess = () => finish(request.result);
    });
    if (!raw || (await hashText(rawJson(raw))) !== reference.token) throw conflict();
    return { raw, serialized: rawJson(raw) };
  }
  async function readList(): Promise<GuidelineLibrarySnapshot> {
    const raw = await rows();
    bounded(raw);
    const entries = await Promise.all(
      raw.projects.map(async value => {
        if (!plain(value) || !validId(value.id))
          throw new GuidelineStorageError(
            'invalid',
            'A saved record has an unsupported identifier. No records were changed.'
          );
        const serialized = rawJson(value),
          decoded = await verifiedRecord(value),
          parsed = decoded?.head;
        const good = !!parsed;
        const revisions = decoded ? [...decoded.history, decoded.head] : [];
        return {
          reference: { id: value.id, token: await hashText(serialized) },
          kind: good ? parsed.kind : null,
          name: good ? parsed.name : 'Retained project (read-only)',
          revision: good ? parsed.revision : null,
          updatedAt: good ? parsed.updatedAt : null,
          retained: !good,
          bytes: utf8ByteLength(serialized),
          pdfHash: good ? parsed.pdfHash : validHash(value.pdfHash) ? value.pdfHash : null,
          pdfHashes: [...new Set(revisions.flatMap(item => (item.pdfHash ? [item.pdfHash] : [])))],
          revisions: revisions.map(item => ({
            revision: item.revision,
            updatedAt: item.updatedAt,
            kind: item.kind,
          })),
        };
      })
    );
    const assets = raw.assets.map(value => {
      const item = assetSummary(value);
      return {
        ...item,
        projects: entries
          .filter(entry => entry.pdfHashes.includes(item.hash))
          .map(entry => {
            const decoded = readProjectRecord(
              raw.projects.find(value => plain(value) && value.id === entry.reference.id)
            );
            const revisions = decoded
              ? [...decoded.history, decoded.head]
                  .filter(revision => revision.pdfHash === item.hash)
                  .map(revision => revision.revision)
              : [];
            return `${entry.name} (revision${revisions.length === 1 ? '' : 's'} ${revisions.join(', ')})`;
          }),
      };
    });
    return {
      entries: entries.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
      projectBytes: entries.reduce((n, item) => n + item.bytes, 0),
      assets,
      assetBytes: assets.reduce((n, item) => n + item.bytes, 0),
    };
  }
  function list(): Promise<GuidelineLibrarySnapshot> {
    if (!listing) {
      const pending = readList().finally(() => {
        if (listing === pending) listing = undefined;
      });
      listing = pending;
    }
    return listing;
  }
  async function save(
    input: { json: string; workspaceId: string; pdf?: File; fromSavedRevision?: number },
    previous?: GuidelineProjectReference,
    signal?: AbortSignal
  ) {
    signal?.throwIfAborted();
    if (!validId(input.workspaceId))
      throw new GuidelineStorageError('invalid', 'Invalid project workspace.');
    if (utf8ByteLength(input.json) > GUIDELINE_STORAGE_LIMITS.projectBytes) throw capacity();
    const opened = await readLibraryProject(input.json, signal);
    if (opened.status !== 'opened')
      throw new GuidelineStorageError(
        'invalid',
        'This project format is read-only in this Studio. Keep its original download.'
      );
    const before = previous ? await checked(previous) : null;
    const prior = before ? await verifiedRecord(before.raw) : null;
    const old = prior?.head ?? null;
    if (before && (!old || old.revision >= Number.MAX_SAFE_INTEGER)) throw conflict();
    if (prior && prior.history.length + 1 >= MAX_PROJECT_REVISIONS)
      throw new GuidelineStorageError(
        'capacity',
        'This project has 32 saved revisions. Its history is unchanged. Download your work or save a new copy to continue.'
      );
    if (old && (await readLibraryProject(old.projectJson, signal)).status !== 'opened')
      throw conflict();
    const sourceHash = libraryProjectPdfHash(opened.value);
    if (input.pdf) {
      if (!sourceHash)
        throw new GuidelineStorageError('invalid', 'Only PDF projects can retain an original PDF.');
      await checkPdf(input.pdf, sourceHash);
    }
    const sourceSnapshot =
      input.fromSavedRevision === undefined
        ? old
        : prior &&
          [...prior.history, prior.head].find(item => item.revision === input.fromSavedRevision);
    if (input.fromSavedRevision !== undefined && !sourceSnapshot) throw conflict();
    const pdfHash = input.pdf
      ? sourceHash
      : sourceSnapshot?.pdfHash === sourceHash
        ? sourceHash
        : null;
    const metadata = {
      id: old?.id ?? crypto.randomUUID(),
      revision: (old?.revision ?? 0) + 1,
      updatedAt: Math.max(Date.now(), old?.updatedAt ?? 0),
      workspaceId: input.workspaceId,
      name: libraryProjectName(opened.value),
      projectJson: input.json,
      payloadHash: await hashText(input.json),
    };
    const head: LibrarySnapshot =
      opened.value.kind === 'source-set'
        ? { ...metadata, schemaVersion: SOURCE_SET_SNAPSHOT_V1, kind: 'source-set', pdfHash: null }
        : { ...metadata, schemaVersion: PROJECT_RECORD_V1, kind: opened.value.kind, pdfHash };
    const value = appendProjectRecord(head, prior);
    const serialized = rawJson(value),
      token = await hashText(serialized);
    const nextAsset: PdfAsset | null =
      input.pdf && sourceHash
        ? {
            hash: sourceHash,
            name: input.pdf.name.slice(0, 200),
            bytes: input.pdf.size,
            blob: input.pdf,
          }
        : null;
    const db = await database();
    let failure: unknown;
    signal?.throwIfAborted();
    try {
      await indexedDbTransaction<void>(db, ['projects', 'assets'], 'readwrite', (tx, finish) => {
        const projects = tx.objectStore('projects'),
          assets = tx.objectStore('assets');
        const pr = projects.getAll(undefined, MAX_RECOVERY_ROWS + 1),
          ar = assets.getAll(undefined, MAX_RECOVERY_ROWS + 1);
        ar.onsuccess = () => {
          try {
            signal?.throwIfAborted();
            const raw = { projects: pr.result as unknown[], assets: ar.result as unknown[] };
            bounded(raw);
            const existing = raw.projects.find(item => plain(item) && item.id === value.id);
            if (before ? !existing || rawJson(existing) !== before.serialized : !!existing)
              throw conflict();
            const remaining = raw.projects.filter(item => item !== existing);
            if (
              remaining.length + 1 > GUIDELINE_STORAGE_LIMITS.projects ||
              remaining.reduce<number>((n, item) => n + utf8ByteLength(rawJson(item)), 0) +
                utf8ByteLength(serialized) >
                GUIDELINE_STORAGE_LIMITS.projectBytes
            )
              throw capacity();
            const keptAssets = (nextAsset ? raw.assets : [])
              .map(asset)
              .filter(item => item.hash !== nextAsset?.hash);
            if (
              nextAsset &&
              (keptAssets.length >= MAX_RECOVERY_ROWS ||
                keptAssets.reduce((n, item) => n + item.bytes, 0) + nextAsset.bytes >
                  GUIDELINE_STORAGE_LIMITS.assetBytes)
            )
              throw capacity();
            projects.put(value);
            if (nextAsset) assets.put(nextAsset);
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
    publish();
    return { id: value.id, token };
  }
  async function open(
    reference: GuidelineProjectReference,
    signal?: AbortSignal,
    revision?: number
  ): Promise<LocalGuidelineProject> {
    signal?.throwIfAborted();
    const { raw } = await checked(reference),
      decoded = await verifiedRecord(raw);
    const parsed =
      revision === undefined
        ? decoded?.head
        : decoded && [...decoded.history, decoded.head].find(item => item.revision === revision);
    if (!parsed)
      throw new GuidelineStorageError(
        'invalid',
        'This retained record cannot be opened. Download its original data for recovery; your current work is unchanged.'
      );
    const result = await readLibraryProject(parsed.projectJson, signal);
    if (result.status !== 'opened' || result.value.kind !== parsed.kind)
      throw new GuidelineStorageError(
        'invalid',
        'This project format is read-only in this Studio. Download the original data to keep it.'
      );
    let pdf: File | null = null,
      assetNotice = '';
    if (parsed.pdfHash) {
      const db = await database();
      const rawAsset = await indexedDbTransaction<unknown>(
        db,
        ['assets'],
        'readonly',
        (tx, finish) => {
          const request = tx.objectStore('assets').get(parsed.pdfHash!);
          request.onsuccess = () => finish(request.result);
        }
      );
      try {
        if (parsed.pdfHash !== libraryProjectPdfHash(result.value))
          throw new Error('Source mismatch');
        const item = asset(rawAsset);
        await checkPdf(item.blob, parsed.pdfHash);
        pdf = new File([item.blob], item.name, { type: 'application/pdf' });
      } catch {
        assetNotice =
          'The original PDF is missing or could not be verified. Your reviewed evidence and selected design are retained; choose the matching PDF to restore full page previews.';
      }
    }
    // Validation and PDF reads may yield while another tab updates/deletes the saved head.
    await checked(reference);
    signal?.throwIfAborted();
    return {
      reference,
      revision: parsed.revision,
      latestRevision: decoded!.head.revision,
      workspaceId: parsed.workspaceId,
      json: parsed.projectJson,
      value: result.value,
      pdf,
      assetNotice,
    };
  }
  async function remove(reference: GuidelineProjectReference) {
    const before = await checked(reference),
      db = await database();
    let failure: unknown;
    try {
      await indexedDbTransaction<void>(db, ['projects'], 'readwrite', (tx, finish) => {
        const store = tx.objectStore('projects'),
          request = store.get(reference.id);
        request.onsuccess = () => {
          try {
            if (!request.result || rawJson(request.result) !== before.serialized) {
              throw conflict();
            }
            store.delete(reference.id);
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
    publish();
  }
  async function deletePdf(hash: string, affected: GuidelineProjectReference[]) {
    if (!validHash(hash)) throw new GuidelineStorageError('invalid', 'Invalid PDF reference.');
    // The UI first displays all affected projects. Bind deletion to that exact list, including edits.
    const before = await list();
    if (before.entries.some(entry => entry.retained))
      throw new GuidelineStorageError(
        'invalid',
        'A retained project may still depend on this PDF. Recover or remove retained records before deleting source files.'
      );
    const expected = before.entries
      .filter(item => item.pdfHashes.includes(hash))
      .map(item => item.reference);
    if (
      JSON.stringify([...affected].sort((a, b) => a.id.localeCompare(b.id))) !==
      JSON.stringify(expected.sort((a, b) => a.id.localeCompare(b.id)))
    )
      throw conflict();
    const db = await database();
    const originals = await Promise.all(before.entries.map(entry => checked(entry.reference)));
    const serializedOriginals = new Set(originals.map(item => item.serialized));
    let failure: unknown;
    try {
      await indexedDbTransaction<void>(db, ['projects', 'assets'], 'readwrite', (tx, finish) => {
        const request = tx.objectStore('projects').getAll(undefined, MAX_RECOVERY_ROWS + 1);
        request.onsuccess = () => {
          try {
            const rows = request.result as unknown[];
            if (
              rows.length !== originals.length ||
              rows.some(item => !serializedOriginals.has(rawJson(item)))
            ) {
              throw conflict();
            }
            tx.objectStore('assets').delete(hash);
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
    publish();
  }
  async function download(reference: GuidelineProjectReference) {
    const { raw, serialized } = await checked(reference),
      parsed = await verifiedRecord(raw);
    return parsed ? parsed.head.projectJson : serialized;
  }
  return {
    list,
    save,
    open,
    openRevision: (reference: GuidelineProjectReference, revision: number, signal?: AbortSignal) =>
      open(reference, signal, revision),
    async downloadRevision(reference: GuidelineProjectReference, revision: number) {
      const { raw } = await checked(reference),
        decoded = await verifiedRecord(raw);
      const item =
        decoded && [...decoded.history, decoded.head].find(item => item.revision === revision);
      if (!item)
        throw new GuidelineStorageError(
          'invalid',
          'This saved revision cannot be verified. Download library recovery data to retain the original record.'
        );
      await checked(reference);
      return item.projectJson;
    },
    delete: remove,
    deletePdf,
    download,
    async exportRecovery() {
      const raw = await rows();
      bounded(raw);
      return rawJson({
        schemaVersion: 'teul.guideline-library-recovery.v1',
        projects: raw.projects,
        assets: raw.assets.map(assetSummary),
        notice:
          'Original PDFs are excluded. Project JSON retains any selected source crops. Records are inert recovery data, not authenticated approvals.',
      });
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        window.addEventListener('focus', refreshListeners);
        try {
          channel = new BroadcastChannel(name);
          channel.onmessage = refreshListeners;
        } catch {
          /* Optional notifications. */
        }
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          window.removeEventListener('focus', refreshListeners);
          channel?.close();
          channel = undefined;
        }
      };
    },
    async close() {
      const db = await opening;
      db?.close();
      opening = undefined;
      channel?.close();
      channel = undefined;
      window.removeEventListener('focus', refreshListeners);
      listeners.clear();
    },
  };
}
export const guidelineProjectStore = createGuidelineProjectStore();
