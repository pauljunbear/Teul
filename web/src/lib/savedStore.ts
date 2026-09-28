import { MAX_SAVED, SAVED_KEY, isSavedPalette, readLegacySaved, type SavedPalette } from './saved';
import type { StudioAuthoringSettings } from './authoring';
import { indexedDbTransaction } from './indexedDbTransaction';

export const SAVED_DATABASE = 'teul-studio:saved:v2';
export const MAX_SAVED_BYTES = 8 * 1024 * 1024;
const RECORD_VERSION = 'teul.studio-saved.v2';
const MIGRATION_KEY = 'legacy-v1';
const encoder = new TextEncoder();

export interface SavedPaletteInput extends Omit<SavedPalette, 'id'> {
  recipeJson?: string;
  applicationSettings?: StudioAuthoringSettings;
}
export interface StoredSavedPalette extends SavedPaletteInput {
  id: string;
  revision: number;
  updatedAt: number;
}
export interface SavedPaletteSnapshot {
  palettes: StoredSavedPalette[];
  retainedCount: number;
  storedBytes: number;
}
export interface SavedPaletteReference {
  id: string;
  revision: number;
}
export type SavedStoreFailure = {
  status: 'conflict' | 'capacity' | 'invalid' | 'storage-error';
  message: string;
};
export type SavedListResult =
  { status: 'listed'; snapshot: SavedPaletteSnapshot } | SavedStoreFailure;
export type SavedSaveResult =
  | { status: 'saved'; palette: StoredSavedPalette; snapshot: SavedPaletteSnapshot }
  | SavedStoreFailure;
export type SavedDeleteResult =
  { status: 'deleted'; snapshot: SavedPaletteSnapshot } | SavedStoreFailure;

interface StoredEnvelope {
  schemaVersion: typeof RECORD_VERSION;
  id: string;
  revision: number;
  updatedAt: number;
  input: SavedPaletteInput;
}
interface MigrationArchive {
  key: typeof MIGRATION_KEY;
  raw: string | null;
  retainedCount: number;
}
interface RawSnapshot {
  records: unknown[];
  archive: MigrationArchive;
}
const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const bytes = (value: unknown) => {
  try {
    return encoder.encode(JSON.stringify(value)).length;
  } catch {
    return MAX_SAVED_BYTES + 1;
  }
};
const hasOnly = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every(key => keys.includes(key));
const referenceValid = (value: SavedPaletteReference) =>
  typeof value.id === 'string' &&
  value.id.length > 0 &&
  value.id.length <= 200 &&
  Number.isSafeInteger(value.revision) &&
  value.revision > 0;
const storageError = (): SavedStoreFailure => ({
  status: 'storage-error',
  message:
    'This browser could not save or read your palettes. Your current design is still available; download it to keep a copy.',
});
const conflict = (): SavedStoreFailure => ({
  status: 'conflict',
  message:
    'This saved palette changed or was deleted in another tab. Reopen the latest version, or save your current design as a new copy.',
});

/** Validate inert design data; a stored recipe does not restore execution or export authority. */
async function validateInput(value: unknown): Promise<SavedPaletteInput> {
  if (
    !plain(value) ||
    !hasOnly(value, [
      'name',
      'colors',
      'method',
      'radixFamily',
      'recipeJson',
      'applicationSettings',
    ])
  )
    throw new Error('Unsupported saved palette fields.');
  const { recipeJson, applicationSettings, ...metadata } = value;
  if (!isSavedPalette({ id: 'validation', ...metadata }))
    throw new Error(
      'A saved palette needs a name of at most 80 characters and one to six valid colors.'
    );
  if ((recipeJson === undefined) !== (applicationSettings === undefined))
    throw new Error('A product system requires its recipe and editing settings together.');
  const input: SavedPaletteInput = {
    name: metadata.name as string,
    colors: [...(metadata.colors as string[])],
    method: metadata.method as SavedPaletteInput['method'],
    ...(metadata.radixFamily === undefined
      ? {}
      : { radixFamily: metadata.radixFamily as SavedPaletteInput['radixFamily'] }),
  };
  if (recipeJson !== undefined) {
    if (
      !plain(applicationSettings) ||
      !hasOnly(applicationSettings, ['name', 'colors', 'anchorIndex', 'purpose', 'neutrals'])
    )
      throw new Error('Unsupported product-system editing settings.');
    if (typeof recipeJson !== 'string' || encoder.encode(recipeJson).length > MAX_SAVED_BYTES)
      throw new Error('The product recipe exceeds the saved-data limit.');
    const [
      { readColorSystemRecipeJsonV1 },
      { normalizeStudioAuthoringSettings, validateStudioAuthoringRecipeSettings },
    ] = await Promise.all([import('../../../src/lib/colorSystemRecipeV1'), import('./authoring')]);
    const parsed = readColorSystemRecipeJsonV1(recipeJson);
    if (parsed.status !== 'supported' || !parsed.recipe.selection)
      throw new Error('Only a recognized recipe with a selected complete system can be saved.');
    const settings = normalizeStudioAuthoringSettings(applicationSettings);
    if (
      settings.name !== input.name ||
      settings.colors.length !== input.colors.length ||
      settings.colors.some((color, index) => color !== input.colors[index])
    )
      throw new Error(
        'The saved name and colors do not match this product system’s editing settings.'
      );
    validateStudioAuthoringRecipeSettings(parsed.recipe, settings);
    input.recipeJson = recipeJson;
    input.applicationSettings = settings;
  }
  return input;
}

async function decodeEnvelope(value: unknown): Promise<StoredSavedPalette | null> {
  if (
    !plain(value) ||
    !hasOnly(value, ['schemaVersion', 'id', 'revision', 'updatedAt', 'input']) ||
    value.schemaVersion !== RECORD_VERSION ||
    !referenceValid(value as unknown as SavedPaletteReference) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  )
    return null;
  try {
    const input = await validateInput(value.input);
    return {
      ...input,
      id: value.id as string,
      revision: value.revision as number,
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}

function transaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (records: IDBObjectStore, metadata: IDBObjectStore, finish: (result: T) => void) => void
): Promise<T> {
  return indexedDbTransaction(db, ['palettes', 'metadata'], mode, (tx, finish) =>
    run(tx.objectStore('palettes'), tx.objectStore('metadata'), finish)
  );
}

/** IndexedDB serializes writes across tabs. Notifications refresh the UI; they are not the lock. */
export function createSavedPaletteStore(
  options: { databaseName?: string; legacyKey?: string } = {}
) {
  const databaseName = options.databaseName ?? SAVED_DATABASE;
  const legacyKey = options.legacyKey ?? SAVED_KEY;
  let opening: Promise<IDBDatabase> | undefined;
  const listeners = new Set<(snapshot?: SavedPaletteSnapshot) => void>();
  let channel: BroadcastChannel | undefined;
  const notify = (snapshot?: SavedPaletteSnapshot) =>
    listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch {
        /* A subscriber cannot invalidate a committed save. */
      }
    });
  const refresh = () => notify();
  const publish = (snapshot: SavedPaletteSnapshot) => {
    notify(snapshot);
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const sender = channel ?? new BroadcastChannel(databaseName);
        sender.postMessage('changed');
        if (!channel) sender.close();
      }
    } catch {
      /* Focus refresh still works if messaging is unavailable. */
    }
  };

  async function database(): Promise<IDBDatabase> {
    if (!opening) {
      opening = (async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(databaseName, 1);
          let blocked = false;
          request.onupgradeneeded = () => {
            request.result.createObjectStore('palettes', { keyPath: 'id' });
            request.result.createObjectStore('metadata', { keyPath: 'key' });
          };
          request.onsuccess = () => {
            if (blocked) {
              request.result.close();
              return;
            }
            resolve(request.result);
          };
          request.onerror = () => reject(request.error);
          request.onblocked = () => {
            blocked = true;
            reject(new Error('Close an older Studio tab and try again.'));
          };
        });
        db.onversionchange = () => {
          db.close();
          opening = undefined;
        };
        try {
          await transaction<void>(db, 'readwrite', (records, metadata, finish) => {
            const lookup = metadata.get(MIGRATION_KEY);
            lookup.onsuccess = () => {
              if (lookup.result !== undefined) {
                finish();
                return;
              }
              try {
                // The transaction commits the archive, all recognized rows and marker together.
                // Original v1 bytes remain unchanged, including unknown or malformed records.
                const raw = localStorage.getItem(legacyKey);
                const recovered = readLegacySaved(raw);
                const updatedAt = Date.now();
                recovered.palettes.forEach((palette, index) => {
                  const { id: _legacyId, ...input } = palette;
                  records.add({
                    schemaVersion: RECORD_VERSION,
                    id: crypto.randomUUID(),
                    revision: 1,
                    updatedAt: updatedAt - index,
                    input,
                  } satisfies StoredEnvelope);
                });
                metadata.add({
                  key: MIGRATION_KEY,
                  raw,
                  retainedCount: recovered.retainedCount,
                } satisfies MigrationArchive);
                finish();
              } catch {
                records.transaction.abort();
              }
            };
          });
          return db;
        } catch (error) {
          db.close();
          throw error;
        }
      })().catch(error => {
        opening = undefined;
        throw error;
      });
    }
    return opening;
  }

  async function readRaw(): Promise<RawSnapshot> {
    return transaction(await database(), 'readonly', (records, metadata, finish) => {
      const all = records.getAll();
      const archive = metadata.get(MIGRATION_KEY);
      archive.onsuccess = () => finish({ records: all.result, archive: archive.result });
    });
  }

  async function snapshot(raw: RawSnapshot): Promise<SavedPaletteSnapshot> {
    const decoded: (StoredSavedPalette | null)[] = [];
    // Full recipes need core validation. Bound each uninterrupted batch so a full
    // saved library still lets the browser paint and handle input during refresh.
    for (let index = 0; index < raw.records.length; index += 4) {
      if (index) await new Promise<void>(resolve => setTimeout(resolve, 0));
      decoded.push(...(await Promise.all(raw.records.slice(index, index + 4).map(decodeEnvelope))));
    }
    return {
      palettes: decoded
        .filter((item): item is StoredSavedPalette => item !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)),
      retainedCount:
        (Number.isSafeInteger(raw.archive?.retainedCount) ? raw.archive.retainedCount : 1) +
        decoded.filter(item => item === null).length,
      storedBytes: bytes(raw.records) + bytes(raw.archive),
    };
  }

  async function list(): Promise<SavedListResult> {
    try {
      return { status: 'listed', snapshot: await snapshot(await readRaw()) };
    } catch {
      return storageError();
    }
  }

  async function save(
    value: SavedPaletteInput,
    previous?: SavedPaletteReference
  ): Promise<SavedSaveResult> {
    let input: SavedPaletteInput;
    try {
      input = await validateInput(value);
      if (previous && !referenceValid(previous)) throw new Error('Invalid saved palette revision.');
    } catch (error) {
      return {
        status: 'invalid',
        message: error instanceof Error ? error.message : 'Invalid palette.',
      };
    }
    try {
      // Validate the actual previous payload before opening the short write transaction.
      // Exact-envelope comparison below also catches unrecognized data injected without a revision bump.
      const before = previous
        ? (await readRaw()).records.find(item => plain(item) && item.id === previous.id)
        : undefined;
      if (
        previous &&
        (!(await decodeEnvelope(before)) ||
          (before as StoredEnvelope).revision !== previous.revision)
      )
        return conflict();
      const envelope: StoredEnvelope = {
        schemaVersion: RECORD_VERSION,
        id: previous?.id ?? crypto.randomUUID(),
        revision: (previous?.revision ?? 0) + 1,
        updatedAt: Date.now(),
        input,
      };
      const result = await transaction<'saved' | SavedStoreFailure>(
        await database(),
        'readwrite',
        (records, metadata, finish) => {
          const all = records.getAll();
          const archive = metadata.get(MIGRATION_KEY);
          archive.onsuccess = () => {
            const entries = all.result as unknown[];
            const existing = entries.find(item => plain(item) && item.id === envelope.id);
            if (previous && JSON.stringify(existing) !== JSON.stringify(before)) {
              finish(conflict());
              return;
            }
            if (!previous && entries.length >= MAX_SAVED) {
              finish({
                status: 'capacity',
                message: `Saved storage has ${entries.length} palettes or retained records. Remove a palette in Library → Saved to stay within the ${MAX_SAVED}-palette limit.`,
              });
              return;
            }
            const next = [
              ...entries.filter(item => !plain(item) || item.id !== envelope.id),
              envelope,
            ];
            if (bytes(next) + bytes(archive.result) > MAX_SAVED_BYTES) {
              finish({
                status: 'capacity',
                message:
                  'Saved palettes have reached the 8 MB limit. Export and remove a palette before adding more.',
              });
              return;
            }
            records.put(envelope);
            finish('saved');
          };
        }
      );
      if (result !== 'saved') return result;
      const savedSnapshot = await snapshot(await readRaw());
      publish(savedSnapshot);
      return {
        status: 'saved',
        palette: {
          ...input,
          id: envelope.id,
          revision: envelope.revision,
          updatedAt: envelope.updatedAt,
        },
        snapshot: savedSnapshot,
      };
    } catch {
      return storageError();
    }
  }

  async function remove(id: string, revision: number): Promise<SavedDeleteResult> {
    if (!referenceValid({ id, revision }))
      return { status: 'invalid', message: 'Invalid saved palette revision.' };
    try {
      const before = (await readRaw()).records.find(item => plain(item) && item.id === id);
      if (!(await decodeEnvelope(before)) || (before as StoredEnvelope).revision !== revision)
        return conflict();
      const result = await transaction<'deleted' | SavedStoreFailure>(
        await database(),
        'readwrite',
        (records, _metadata, finish) => {
          const request = records.get(id);
          request.onsuccess = () => {
            if (JSON.stringify(request.result) !== JSON.stringify(before)) {
              finish(conflict());
              return;
            }
            records.delete(id);
            finish('deleted');
          };
        }
      );
      if (result !== 'deleted') return result;
      const deletedSnapshot = await snapshot(await readRaw());
      publish(deletedSnapshot);
      return { status: 'deleted', snapshot: deletedSnapshot };
    } catch {
      return storageError();
    }
  }

  function subscribe(listener: (snapshot?: SavedPaletteSnapshot) => void): () => void {
    listeners.add(listener);
    if (listeners.size === 1) {
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          channel = new BroadcastChannel(databaseName);
          channel.onmessage = refresh;
        }
      } catch {
        /* Focus refresh still works when cross-tab messaging is unavailable. */
      }
      window.addEventListener('focus', refresh);
    }
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        channel?.close();
        channel = undefined;
        window.removeEventListener('focus', refresh);
      }
    };
  }

  async function exportRecovery(): Promise<
    { status: 'exported'; json: string } | SavedStoreFailure
  > {
    try {
      return {
        status: 'exported',
        json: JSON.stringify(
          { schemaVersion: 'teul.studio-saved-recovery.v1', ...(await readRaw()) },
          null,
          2
        ),
      };
    } catch {
      return storageError();
    }
  }

  return { list, save, delete: remove, subscribe, exportRecovery };
}

export const savedPaletteStore = createSavedPaletteStore();
