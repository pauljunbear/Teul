import { canonicalJson, deterministicContentHash } from '../lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../lib/colorSystemInertJsonV1';
import { utf8ByteLength } from '../lib/utf8';

export const COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS = Object.freeze({
  maximumActiveRecipes: 8,
  maximumDataRevisions: 64,
  maximumAggregateBytes: 4 * 1024 * 1024,
  // Leave room to acknowledge tombstones before removing any color-bearing data.
  deletionReserveBytes: 64 * 1024,
  maximumStoredEntries: 16384,
});
export const COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX = 'teul:color-system-recipes:';
const REVISION_VERSION = 'teul.recipe-storage.revision.v1';
const TOMBSTONE_VERSION = 'teul.recipe-storage.tombstone.v1';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const LIMITS = COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS;

export interface ColorSystemRecipeClientStorageV1 {
  getAsync(key: string): Promise<unknown>;
  setAsync(key: string, value: unknown): Promise<void>;
  deleteAsync(key: string): Promise<void>;
  keysAsync(): Promise<string[]>;
}

export interface ColorSystemRecipeStorageDependenciesV1 {
  clientStorage: ColorSystemRecipeClientStorageV1;
  /** Program-owned schema/identity/authority validation. Reject unknown recipe versions. */
  validateRecipeJsonForSave(recipeJson: string, recipeId: string): void | Promise<void>;
}

export interface ColorSystemRecipeRevisionV1 {
  schemaVersion: typeof REVISION_VERSION;
  kind: 'recipe';
  recipeId: string;
  mutationId: string;
  parentRevisionHashes: string[];
  /** Original JSON, including its whitespace and native numeric spelling. */
  recipeJson: string;
  revisionHash: string;
}

export interface ColorSystemRecipeTombstoneV1 {
  schemaVersion: typeof TOMBSTONE_VERSION;
  kind: 'tombstone';
  recipeId: string;
  mutationId: string;
  expectedHeadRevisionHashes: string[];
  tombstoneHash: string;
}

export interface ColorSystemRecipeStoredEntryV1 {
  key: string;
  /** Exact stored bytes when clientStorage contains a string. Never rewritten on read. */
  rawStorageJson: string | null;
  /** Inert non-string legacy data can be exported, but has no original JSON byte spelling. */
  legacyExportJson: string | null;
  storedBytes: number;
  kind: 'revision' | 'tombstone' | 'read-only';
  recipeId: string | null;
  revision?: ColorSystemRecipeRevisionV1;
  tombstone?: ColorSystemRecipeTombstoneV1;
  reason?: string;
}

export interface ColorSystemStoredRecipeV1 {
  recipeId: string;
  status: 'ready' | 'conflict' | 'read-only' | 'deleted';
  headRevisionHashes: string[];
  revisions: ColorSystemRecipeStoredEntryV1[];
  tombstones: ColorSystemRecipeStoredEntryV1[];
  readOnlyEntries: ColorSystemRecipeStoredEntryV1[];
  cleanupPending: boolean;
}

export interface ColorSystemRecipeStorageSnapshotV1 {
  recipes: ColorSystemStoredRecipeV1[];
  unscopedReadOnlyEntries: ColorSystemRecipeStoredEntryV1[];
  usage: {
    activeRecipes: number;
    dataRevisions: number;
    aggregateBytes: number;
    storedEntries: number;
    omittedEntries: number;
    overCapacity: boolean;
  };
  /** clientStorage offers neither an atomic snapshot nor compare-and-set. */
  consistency: 'observed-non-atomic';
}

export type ColorSystemRecipeStorageFailureV1 = {
  status: 'invalid-input' | 'storage-error';
  error: string;
};
export type ColorSystemRecipeStorageListResultV1 =
  | { status: 'listed'; snapshot: ColorSystemRecipeStorageSnapshotV1 }
  | ColorSystemRecipeStorageFailureV1;
export type ColorSystemRecipeStorageGetResultV1 =
  | {
      status: 'found' | 'not-found';
      recipe: ColorSystemStoredRecipeV1 | null;
      snapshot: ColorSystemRecipeStorageSnapshotV1;
    }
  | ColorSystemRecipeStorageFailureV1;
export interface ColorSystemRecipeSaveRequestV1 {
  recipeId: string;
  /** Idempotency is scoped to this recipe ID, not a global mutation registry. */
  mutationId: string;
  parentRevisionHashes: string[];
  recipeJson: string;
}
export interface ColorSystemRecipeDeleteRequestV1 {
  recipeId: string;
  mutationId: string;
  expectedHeadRevisionHashes: string[];
}
export type ColorSystemRecipeSaveResultV1 =
  | {
      status: 'saved' | 'conflict' | 'capacity' | 'read-only' | 'deleted';
      /** Non-null only after an exact revision has been read back from storage. */
      acknowledgedRevisionHash: string | null;
      recipeJson: string;
      headRevisionHashes: string[];
      idempotent: boolean;
      snapshot: ColorSystemRecipeStorageSnapshotV1;
      reason: string;
    }
  | ColorSystemRecipeStorageFailureV1;
export type ColorSystemRecipeDeleteResultV1 =
  | {
      status: 'deleted' | 'delete-incomplete' | 'conflict' | 'read-only' | 'not-found';
      acknowledgedTombstoneHash: string | null;
      headRevisionHashes: string[];
      snapshot: ColorSystemRecipeStorageSnapshotV1;
      reason: string;
    }
  | ColorSystemRecipeStorageFailureV1;

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fields(value: RecordValue, names: string[]): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === names.length &&
    names.every(name => Object.prototype.hasOwnProperty.call(value, name))
  );
}
function id(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}
function hashes(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= LIMITS.maximumDataRevisions &&
    value.every(hash => typeof hash === 'string' && HASH.test(hash)) &&
    new Set(value).size === value.length
  );
}
function sameHashes(first: string[], second: string[]): boolean {
  const expected = [...second].sort();
  return (
    first.length === second.length && [...first].sort().every((hash, i) => hash === expected[i])
  );
}
function message(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1000) : 'Recipe storage operation failed.';
}
function snapshotInput(value: unknown): unknown {
  return snapshotColorSystemInertJsonV1(value, {
    maximumBytes: LIMITS.maximumAggregateBytes * 2 + 65536,
    maximumArrayLength: LIMITS.maximumDataRevisions,
    maximumObjectKeys: 32,
  });
}
type RequestFor<Operation extends 'save' | 'delete'> = Operation extends 'save'
  ? ColorSystemRecipeSaveRequestV1
  : ColorSystemRecipeDeleteRequestV1;
function request<Operation extends 'save' | 'delete'>(
  value: unknown,
  operation: Operation
): RequestFor<Operation> {
  const data = snapshotInput(value);
  const parentField = operation === 'save' ? 'parentRevisionHashes' : 'expectedHeadRevisionHashes';
  if (
    !record(data) ||
    !fields(data, [
      'recipeId',
      'mutationId',
      parentField,
      ...(operation === 'save' ? ['recipeJson'] : []),
    ]) ||
    !id(data.recipeId) ||
    !id(data.mutationId) ||
    !hashes(data[parentField]) ||
    (operation === 'save' && (typeof data.recipeJson !== 'string' || !data.recipeJson.trim()))
  )
    throw new Error('Invalid recipe storage request.');
  (data[parentField] as string[]).sort();
  return data as unknown as RequestFor<Operation>;
}
function keyFor(kind: 'revision' | 'tombstone', hash: string): string {
  return `${COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX}${kind}:${hash}`;
}

/**
 * Immutable revision keys avoid lost updates without claiming CAS. Operations in one
 * factory are serialized; each operation refreshes storage. A later independent writer
 * can still add a branch after an acknowledgment, which the next list/get exposes.
 * A tombstoned recipe ID is never reusable, including by a delayed writer.
 */
export function createColorSystemRecipeStorageV1(
  dependencies: ColorSystemRecipeStorageDependenciesV1
) {
  if (typeof dependencies.validateRecipeJsonForSave !== 'function')
    throw new Error('Recipe storage requires program-owned save validation.');
  const storage = dependencies.clientStorage;
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = queue.then(operation, operation);
    queue = pending.then(
      () => undefined,
      () => undefined
    );
    return pending;
  };

  async function parseEntry(key: string, raw: unknown): Promise<ColorSystemRecipeStoredEntryV1> {
    const entry: ColorSystemRecipeStoredEntryV1 = {
      key,
      rawStorageJson: typeof raw === 'string' ? raw : null,
      legacyExportJson: null,
      storedBytes: utf8ByteLength(key),
      kind: 'read-only',
      recipeId: null,
      reason: 'Unknown or invalid storage envelope; retained without migration.',
    };
    try {
      if (typeof raw !== 'string') {
        entry.legacyExportJson = canonicalJson(snapshotInput(raw));
        entry.storedBytes += utf8ByteLength(entry.legacyExportJson);
        return entry;
      }
      entry.storedBytes += utf8ByteLength(raw);
      if (utf8ByteLength(raw) > LIMITS.maximumAggregateBytes) return entry;
      const data = snapshotInput(JSON.parse(raw));
      if (!record(data)) return entry;
      if (id(data.recipeId)) entry.recipeId = data.recipeId;
      if (!id(data.recipeId) || !id(data.mutationId)) return entry;
      if (
        data.schemaVersion === REVISION_VERSION &&
        data.kind === 'recipe' &&
        fields(data, [
          'schemaVersion',
          'kind',
          'recipeId',
          'mutationId',
          'parentRevisionHashes',
          'recipeJson',
          'revisionHash',
        ]) &&
        hashes(data.parentRevisionHashes) &&
        typeof data.recipeJson === 'string'
      ) {
        const { revisionHash, ...content } = data;
        if (
          revisionHash !== deterministicContentHash(content) ||
          key !== keyFor('revision', String(revisionHash))
        )
          return entry;
        await dependencies.validateRecipeJsonForSave(data.recipeJson, data.recipeId);
        entry.kind = 'revision';
        entry.revision = data as unknown as ColorSystemRecipeRevisionV1;
        delete entry.reason;
      } else if (
        data.schemaVersion === TOMBSTONE_VERSION &&
        data.kind === 'tombstone' &&
        fields(data, [
          'schemaVersion',
          'kind',
          'recipeId',
          'mutationId',
          'expectedHeadRevisionHashes',
          'tombstoneHash',
        ]) &&
        hashes(data.expectedHeadRevisionHashes)
      ) {
        const { tombstoneHash, ...content } = data;
        if (
          tombstoneHash !== deterministicContentHash(content) ||
          key !== keyFor('tombstone', String(tombstoneHash))
        )
          return entry;
        entry.kind = 'tombstone';
        entry.tombstone = data as unknown as ColorSystemRecipeTombstoneV1;
        delete entry.reason;
      }
    } catch (error) {
      if (typeof raw !== 'string' && entry.legacyExportJson === null)
        entry.storedBytes = LIMITS.maximumAggregateBytes + 1;
      entry.reason = `Read-only stored data: ${message(error)}`;
    }
    return entry;
  }

  async function read(): Promise<ColorSystemRecipeStorageSnapshotV1> {
    const keys = (await storage.keysAsync())
      .filter(key => key.startsWith(COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX))
      .sort();
    const entries: ColorSystemRecipeStoredEntryV1[] = [];
    const entriesByRecipe = new Map<string, ColorSystemRecipeStoredEntryV1[]>();
    for (const key of keys.slice(0, LIMITS.maximumStoredEntries)) {
      const raw = await storage.getAsync(key);
      // A concurrent deletion between keysAsync and getAsync is not an unknown record.
      if (raw !== undefined) {
        const entry = await parseEntry(key, raw);
        entries.push(entry);
        if (entry.recipeId) {
          const own = entriesByRecipe.get(entry.recipeId);
          if (own) own.push(entry);
          else entriesByRecipe.set(entry.recipeId, [entry]);
        }
      }
    }
    const recipes: ColorSystemStoredRecipeV1[] = [];
    for (const recipeId of [...entriesByRecipe.keys()].sort()) {
      const own = entriesByRecipe.get(recipeId)!;
      const revisions = own.filter(entry => entry.kind === 'revision');
      const tombstones = own.filter(entry => entry.kind === 'tombstone');
      const readOnlyEntries = own.filter(entry => entry.kind === 'read-only');
      const referenced = new Set(revisions.flatMap(entry => entry.revision!.parentRevisionHashes));
      const allHashes = new Set(revisions.map(entry => entry.revision!.revisionHash));
      const headRevisionHashes = revisions
        .map(entry => entry.revision!.revisionHash)
        .filter(hash => !referenced.has(hash))
        .sort();
      const mutations = new Set(revisions.map(entry => entry.revision!.mutationId));
      const brokenParents = [...referenced].some(hash => !allHashes.has(hash));
      recipes.push({
        recipeId,
        status: tombstones.length
          ? 'deleted'
          : readOnlyEntries.length
            ? 'read-only'
            : headRevisionHashes.length !== 1 ||
                mutations.size !== revisions.length ||
                brokenParents
              ? 'conflict'
              : 'ready',
        headRevisionHashes,
        revisions,
        tombstones,
        readOnlyEntries,
        cleanupPending: tombstones.length > 0 && revisions.length > 0,
      });
    }
    const unscopedReadOnlyEntries = entries.filter(entry => entry.recipeId === null);
    const activeRecipes =
      recipes.filter(recipe => recipe.status !== 'deleted').length + unscopedReadOnlyEntries.length;
    const dataRevisions = entries.filter(entry => entry.kind !== 'tombstone').length;
    const aggregateBytes = entries.reduce((sum, entry) => sum + entry.storedBytes, 0);
    const omittedEntries = Math.max(0, keys.length - LIMITS.maximumStoredEntries);
    return {
      recipes,
      unscopedReadOnlyEntries,
      usage: {
        activeRecipes,
        dataRevisions,
        aggregateBytes,
        storedEntries: entries.length,
        omittedEntries,
        overCapacity:
          activeRecipes > LIMITS.maximumActiveRecipes ||
          dataRevisions > LIMITS.maximumDataRevisions ||
          aggregateBytes > LIMITS.maximumAggregateBytes ||
          omittedEntries > 0,
      },
      consistency: 'observed-non-atomic',
    };
  }
  const find = (state: ColorSystemRecipeStorageSnapshotV1, recipeId: string) =>
    state.recipes.find(recipe => recipe.recipeId === recipeId);
  const unreadable = (state: ColorSystemRecipeStorageSnapshotV1, recipeId: string) =>
    state.unscopedReadOnlyEntries.length > 0 ||
    (find(state, recipeId)?.readOnlyEntries.length ?? 0) > 0;

  async function cleanup(recipe: ColorSystemStoredRecipeV1): Promise<boolean> {
    if (!recipe.tombstones.length) return false;
    // Confirm the durable deletion marker before every cleanup attempt.
    const tombstone = recipe.tombstones[0];
    if ((await storage.getAsync(tombstone.key)) !== tombstone.rawStorageJson) return false;
    let complete = true;
    for (const entry of recipe.revisions) {
      try {
        if ((await storage.getAsync(entry.key)) !== entry.rawStorageJson) {
          complete = false;
          continue;
        }
        await storage.deleteAsync(entry.key);
        if ((await storage.getAsync(entry.key)) !== undefined) complete = false;
      } catch {
        complete = false;
      }
    }
    return complete;
  }

  return {
    list(): Promise<ColorSystemRecipeStorageListResultV1> {
      return serialize(async () => {
        try {
          return { status: 'listed' as const, snapshot: await read() };
        } catch (error) {
          return { status: 'storage-error' as const, error: message(error) };
        }
      });
    },
    get(recipeId: unknown): Promise<ColorSystemRecipeStorageGetResultV1> {
      if (!id(recipeId))
        return Promise.resolve({ status: 'invalid-input', error: 'Invalid recipe ID.' });
      return serialize(async () => {
        try {
          const snapshot = await read(),
            recipe = find(snapshot, recipeId) ?? null;
          return { status: recipe ? ('found' as const) : ('not-found' as const), recipe, snapshot };
        } catch (error) {
          return { status: 'storage-error' as const, error: message(error) };
        }
      });
    },
    save(input: unknown): Promise<ColorSystemRecipeSaveResultV1> {
      let data: ColorSystemRecipeSaveRequestV1;
      try {
        data = request(input, 'save');
      } catch (error) {
        return Promise.resolve({ status: 'invalid-input', error: message(error) });
      }
      return serialize(async () => {
        try {
          await dependencies.validateRecipeJsonForSave(data.recipeJson, data.recipeId);
        } catch (error) {
          return { status: 'invalid-input', error: message(error) };
        }
        try {
          let snapshot = await read();
          const content = { schemaVersion: REVISION_VERSION, kind: 'recipe' as const, ...data };
          const revisionHash = deterministicContentHash(content);
          const raw = canonicalJson({ ...content, revisionHash }),
            key = keyFor('revision', revisionHash);
          let acknowledgedRevisionHash: string | null = null;
          const result = (
            status: Exclude<
              ColorSystemRecipeSaveResultV1['status'],
              'invalid-input' | 'storage-error'
            >,
            reason: string,
            idempotent = false
          ): ColorSystemRecipeSaveResultV1 => ({
            status,
            acknowledgedRevisionHash,
            recipeJson: data.recipeJson,
            headRevisionHashes: find(snapshot, data.recipeId)?.headRevisionHashes ?? [],
            idempotent,
            snapshot,
            reason,
          });
          const confirm = async (idempotent: boolean): Promise<ColorSystemRecipeSaveResultV1> => {
            snapshot = await read();
            const after = find(snapshot, data.recipeId);
            if (after?.status === 'deleted') {
              await cleanup(after);
              snapshot = await read();
              return result(
                'deleted',
                'Deletion won the concurrent write; the recipe cannot be reopened.',
                idempotent
              );
            }
            if (snapshot.usage.overCapacity)
              return result(
                'capacity',
                'Concurrent storage writes exceeded capacity; the revision is retained for export.',
                idempotent
              );
            if (unreadable(snapshot, data.recipeId))
              return result(
                'read-only',
                'Storage changed to an unknown representation during save.',
                idempotent
              );
            if (after?.status !== 'ready' || !sameHashes(after.headRevisionHashes, [revisionHash]))
              return result(
                'conflict',
                'Concurrent revision heads require an explicit merged save.',
                idempotent
              );
            return result(
              'saved',
              'Exact revision bytes acknowledged; heads describe the observed storage snapshot.',
              idempotent
            );
          };
          const before = find(snapshot, data.recipeId);
          if (before?.status === 'deleted')
            return result('deleted', 'This recipe ID is permanently deleted; use a new ID.');
          if (unreadable(snapshot, data.recipeId))
            return result('read-only', 'Unknown stored data is retained; saving cannot change it.');
          if (snapshot.usage.overCapacity)
            return result(
              'capacity',
              'Storage is over capacity or its bounded scan is incomplete.'
            );
          const sameMutation =
            before?.revisions.filter(entry => entry.revision!.mutationId === data.mutationId) ?? [];
          if (sameMutation.some(entry => entry.revision!.revisionHash !== revisionHash))
            return result('conflict', 'The mutation ID already identifies different data.');
          if (sameMutation.length) {
            const existing = sameMutation[0];
            if ((await storage.getAsync(existing.key)) !== existing.rawStorageJson)
              return result('conflict', 'The saved revision changed during acknowledgment.');
            acknowledgedRevisionHash = revisionHash;
            return await confirm(true);
          }
          if (!sameHashes(data.parentRevisionHashes, before?.headRevisionHashes ?? []))
            return result('conflict', 'Expected revision heads are stale.');
          const addedRecipe = before ? 0 : 1;
          if (
            snapshot.usage.activeRecipes + addedRecipe > LIMITS.maximumActiveRecipes ||
            snapshot.usage.dataRevisions + 1 > LIMITS.maximumDataRevisions ||
            snapshot.usage.aggregateBytes + utf8ByteLength(key) + utf8ByteLength(raw) >
              LIMITS.maximumAggregateBytes - LIMITS.deletionReserveBytes ||
            snapshot.usage.storedEntries + 1 > LIMITS.maximumStoredEntries
          )
            return result(
              'capacity',
              'Recipe remains exportable; local storage capacity would be exceeded.'
            );
          // Never intentionally overwrite even an unrecognized entry at this content key.
          if ((await storage.getAsync(key)) !== undefined)
            return result('conflict', 'The revision key already contains unrecognized data.');
          await storage.setAsync(key, raw);
          if ((await storage.getAsync(key)) !== raw)
            return result('conflict', 'Storage did not acknowledge the exact revision bytes.');
          acknowledgedRevisionHash = revisionHash;
          return await confirm(false);
        } catch (error) {
          return { status: 'storage-error', error: message(error) };
        }
      });
    },
    delete(input: unknown): Promise<ColorSystemRecipeDeleteResultV1> {
      let data: ColorSystemRecipeDeleteRequestV1;
      try {
        data = request(input, 'delete');
      } catch (error) {
        return Promise.resolve({ status: 'invalid-input', error: message(error) });
      }
      return serialize(async () => {
        try {
          let snapshot = await read();
          let acknowledgedTombstoneHash: string | null = null;
          const result = (
            status: Exclude<
              ColorSystemRecipeDeleteResultV1['status'],
              'invalid-input' | 'storage-error'
            >,
            reason: string
          ): ColorSystemRecipeDeleteResultV1 => ({
            status,
            acknowledgedTombstoneHash,
            headRevisionHashes: find(snapshot, data.recipeId)?.headRevisionHashes ?? [],
            snapshot,
            reason,
          });
          const before = find(snapshot, data.recipeId);
          if (snapshot.usage.omittedEntries)
            return result('read-only', 'Storage exceeds the complete-scan bound.');
          if (!before) return result('not-found', 'Recipe does not exist.');
          if (unreadable(snapshot, data.recipeId))
            return result(
              'read-only',
              'Unknown stored data remains exportable and cannot be erased.'
            );
          let tombstone: ColorSystemRecipeStoredEntryV1 | undefined = before.tombstones[0];
          if (
            tombstone?.tombstone?.mutationId === data.mutationId &&
            !sameHashes(
              tombstone.tombstone.expectedHeadRevisionHashes,
              data.expectedHeadRevisionHashes
            )
          )
            return result(
              'conflict',
              'The mutation ID already identifies a different deletion request.'
            );
          if (!tombstone) {
            if (!sameHashes(data.expectedHeadRevisionHashes, before.headRevisionHashes))
              return result('conflict', 'Expected revision heads are stale.');
            if (before.revisions.some(entry => entry.revision!.mutationId === data.mutationId))
              return result('conflict', 'The mutation ID already identifies a save.');
            const content = {
              schemaVersion: TOMBSTONE_VERSION,
              kind: 'tombstone' as const,
              ...data,
            };
            const tombstoneHash = deterministicContentHash(content);
            const raw = canonicalJson({ ...content, tombstoneHash }),
              key = keyFor('tombstone', tombstoneHash);
            if ((await storage.getAsync(key)) !== undefined)
              return result('conflict', 'The tombstone key already contains unrecognized data.');
            await storage.setAsync(key, raw);
            if ((await storage.getAsync(key)) !== raw)
              return result(
                'delete-incomplete',
                'Deletion was not acknowledged; source revisions were retained.'
              );
            acknowledgedTombstoneHash = tombstoneHash;
            snapshot = await read();
            tombstone = find(snapshot, data.recipeId)?.tombstones.find(
              entry => entry.tombstone!.tombstoneHash === tombstoneHash
            );
            if (!tombstone)
              return result(
                'delete-incomplete',
                'The deletion marker could not be reread; revisions were retained.'
              );
          } else {
            if ((await storage.getAsync(tombstone.key)) !== tombstone.rawStorageJson)
              return result('delete-incomplete', 'The deletion marker changed before cleanup.');
            acknowledgedTombstoneHash = tombstone.tombstone!.tombstoneHash;
          }
          const current = find(snapshot, data.recipeId)!;
          const complete = await cleanup(current);
          snapshot = await read();
          const after = find(snapshot, data.recipeId);
          return complete &&
            after?.status === 'deleted' &&
            !after.cleanupPending &&
            !after.readOnlyEntries.length
            ? result(
                'deleted',
                'Deletion acknowledged and recognized color-bearing revisions removed.'
              )
            : result(
                'delete-incomplete',
                'Recipe is deleted; retained revisions need a cleanup retry.'
              );
        } catch (error) {
          return { status: 'storage-error', error: message(error) };
        }
      });
    },
  };
}
