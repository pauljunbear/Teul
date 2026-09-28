import { describe, expect, it, vi } from 'vitest';
import { canonicalJson, deterministicContentHash } from '../../lib/colorSystemHashing';
import {
  COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS,
  COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX,
  createColorSystemRecipeStorageV1,
  type ColorSystemRecipeClientStorageV1,
  type ColorSystemRecipeSaveResultV1,
  type ColorSystemRecipeStorageSnapshotV1,
} from '../colorSystemRecipeStorageV1';

class MemoryStorage implements ColorSystemRecipeClientStorageV1 {
  values = new Map<string, unknown>();
  events: string[] = [];
  beforeSet: ((key: string, value: unknown) => Promise<void>) | null = null;
  afterSet: ((key: string, value: unknown) => Promise<void>) | null = null;
  failDelete = false;
  async keysAsync() {
    this.events.push('keys');
    return [...this.values.keys()];
  }
  async getAsync(key: string) {
    this.events.push(`get:${key}`);
    return structuredClone(this.values.get(key));
  }
  async setAsync(key: string, value: unknown) {
    this.events.push(`set:${key}`);
    await this.beforeSet?.(key, value);
    this.values.set(key, structuredClone(value));
    await this.afterSet?.(key, value);
  }
  async deleteAsync(key: string) {
    this.events.push(`delete:${key}`);
    if (this.failDelete) throw new Error('delete failed');
    this.values.delete(key);
  }
}

function validate(recipeJson: string, recipeId: string) {
  const recipe = JSON.parse(recipeJson);
  if (recipe.version !== 'test.recipe.v1' || recipe.id !== recipeId)
    throw new Error('Unknown recipe version or mismatched recipe identity.');
  if (recipe.authorization) throw new Error('Runtime authorization cannot be persisted.');
}
const create = (clientStorage: MemoryStorage, validateRecipeJsonForSave = validate) =>
  createColorSystemRecipeStorageV1({ clientStorage, validateRecipeJsonForSave });
const json = (recipeId = 'recipe-a', value: number | string = '0.12345678901234567') =>
  ` { "version": "test.recipe.v1", "id": "${recipeId}", "native": ${value} }\n`;
const saveRequest = (
  recipeId = 'recipe-a',
  mutationId = 'save-1',
  parents: string[] = [],
  recipeJson = json(recipeId)
) => ({
  recipeId,
  mutationId,
  parentRevisionHashes: parents,
  recipeJson,
});
function acknowledged(result: ColorSystemRecipeSaveResultV1): string {
  expect(result.status).toBe('saved');
  if (result.status !== 'saved' || result.acknowledgedRevisionHash === null)
    throw new Error('Not saved.');
  return result.acknowledgedRevisionHash;
}
function snapshot(result: { status: string; snapshot?: ColorSystemRecipeStorageSnapshotV1 }) {
  if (!result.snapshot) throw new Error('Missing storage snapshot.');
  return result.snapshot;
}
function barrier(count = 2) {
  let arrived = 0;
  let release!: () => void;
  const done = new Promise<void>(resolve => {
    release = resolve;
  });
  return async () => {
    if (++arrived === count) release();
    await done;
  };
}
function storedRevision(recipeId: string, recipeJson: string, mutationId = 'save-1') {
  const content = {
    schemaVersion: 'teul.recipe-storage.revision.v1',
    kind: 'recipe',
    recipeId,
    mutationId,
    parentRevisionHashes: [],
    recipeJson,
  };
  const revisionHash = deterministicContentHash(content);
  return {
    key: `${COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX}revision:${revisionHash}`,
    raw: canonicalJson({ ...content, revisionHash }),
  };
}

describe('acknowledged recipe storage v1', () => {
  it('requires a program-owned validator', () => {
    expect(() =>
      createColorSystemRecipeStorageV1({ clientStorage: new MemoryStorage() } as never)
    ).toThrow('program-owned');
  });

  it('retains exact JSON and reopens after more than five minutes without renewed authority', async () => {
    const memory = new MemoryStorage(),
      validator = vi.fn(validate),
      store = create(memory, validator);
    const raw = json();
    const revisionHash = acknowledged(await store.save(saveRequest()));
    expect(validator).toHaveBeenCalledWith(raw, 'recipe-a');
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 600_001);
    try {
      const reopened = await create(memory).get('recipe-a');
      expect(reopened.status).toBe('found');
      const recipe = snapshot(reopened).recipes[0];
      expect(recipe.status).toBe('ready');
      expect(recipe.headRevisionHashes).toEqual([revisionHash]);
      expect(recipe.revisions[0].revision?.recipeJson).toBe(raw);
      expect(recipe.revisions[0].rawStorageJson).toBe(memory.values.get(recipe.revisions[0].key));
      expect(snapshot(reopened).consistency).toBe('observed-non-atomic');
      expect([...memory.values.values()].join('')).not.toContain('authorization');
    } finally {
      now.mockRestore();
    }
  });

  it('detaches requests before any callback or storage hook and rejects non-inert inputs', async () => {
    const memory = new MemoryStorage(),
      validator = vi.fn(validate),
      store = create(memory, validator);
    let getterReads = 0;
    const accessor = { ...saveRequest() };
    Object.defineProperty(accessor, 'recipeJson', {
      enumerable: true,
      get() {
        getterReads++;
        return json();
      },
    });
    const sparse = { ...saveRequest(), parentRevisionHashes: new Array(1) };
    const inherited = Object.assign(Object.create({ extra: true }), saveRequest());
    const hidden = { ...saveRequest() };
    Object.defineProperty(hidden, 'hidden', { value: true });
    for (const input of [accessor, sparse, inherited, hidden, { ...saveRequest(), score: 1 }])
      expect((await store.save(input)).status).toBe('invalid-input');
    expect(getterReads).toBe(0);
    expect(validator).not.toHaveBeenCalled();
    expect(memory.events).toEqual([]);
    const input = saveRequest();
    const pending = store.save(input);
    input.recipeJson = 'changed after dispatch';
    acknowledged(await pending);
    expect(snapshot(await store.list()).recipes[0].revisions[0].revision?.recipeJson).toBe(json());
  });

  it('rejects unknown recipe schemas, identity mismatches, and persisted runtime authorization before writes', async () => {
    const memory = new MemoryStorage(),
      store = create(memory);
    for (const recipeJson of [
      '{"version":"future","id":"recipe-a"}',
      json('other'),
      '{"version":"test.recipe.v1","id":"recipe-a","authorization":true}',
    ]) {
      expect((await store.save({ ...saveRequest(), recipeJson })).status).toBe('invalid-input');
    }
    expect(memory.events).toEqual([]);
  });

  it('retries the exact mutation idempotently and refuses different data under the same mutation ID', async () => {
    const memory = new MemoryStorage(),
      store = create(memory),
      input = saveRequest();
    const hash = acknowledged(await store.save(input));
    const retry = await store.save(input);
    expect(retry).toMatchObject({
      status: 'saved',
      idempotent: true,
      acknowledgedRevisionHash: hash,
    });
    expect(memory.values.size).toBe(1);
    expect((await store.save({ ...input, recipeJson: json('recipe-a', 0.25) })).status).toBe(
      'conflict'
    );
    expect((await store.save({ ...input, parentRevisionHashes: [hash] })).status).toBe('conflict');
    expect(memory.values.size).toBe(1);
  });

  it('reports stale heads and serializes same-instance mutations without overwriting', async () => {
    const memory = new MemoryStorage(),
      store = create(memory);
    const [first, stale] = await Promise.all([
      store.save(saveRequest()),
      store.save(saveRequest('recipe-a', 'save-2')),
    ]);
    const firstHash = acknowledged(first);
    expect(stale).toMatchObject({
      status: 'conflict',
      acknowledgedRevisionHash: null,
      headRevisionHashes: [firstHash],
    });
    const secondHash = acknowledged(
      await store.save(saveRequest('recipe-a', 'save-2', [firstHash]))
    );
    expect(secondHash).not.toBe(firstHash);
    expect((await store.save(saveRequest())).status).toBe('conflict');
    expect(snapshot(await store.list()).recipes[0].headRevisionHashes).toEqual([secondHash]);
    expect(memory.values.size).toBe(2);
  });

  it('keeps concurrent branches and requires both observed heads for an explicit merge', async () => {
    const memory = new MemoryStorage();
    const firstHash = acknowledged(await create(memory).save(saveRequest()));
    memory.beforeSet = barrier();
    const [left, right] = await Promise.all([
      create(memory).save(saveRequest('recipe-a', 'left', [firstHash], json('recipe-a', 0.2))),
      create(memory).save(saveRequest('recipe-a', 'right', [firstHash], json('recipe-a', 0.3))),
    ]);
    expect(left.status).toBe('conflict');
    expect(right.status).toBe('conflict');
    const state = snapshot(await create(memory).list());
    expect(state.recipes[0].status).toBe('conflict');
    expect(state.recipes[0].revisions).toHaveLength(3);
    expect(state.recipes[0].headRevisionHashes).toHaveLength(2);
    memory.beforeSet = null;
    const merged = await create(memory).save(
      saveRequest('recipe-a', 'merge', state.recipes[0].headRevisionHashes)
    );
    acknowledged(merged);
    expect(snapshot(merged).recipes[0].revisions).toHaveLength(4);
  });

  it('surfaces concurrent mutation-ID reuse without deleting either payload', async () => {
    const memory = new MemoryStorage();
    memory.beforeSet = barrier();
    const outputs = await Promise.all([
      create(memory).save(saveRequest('recipe-a', 'same', [], json('recipe-a', 0.2))),
      create(memory).save(saveRequest('recipe-a', 'same', [], json('recipe-a', 0.3))),
    ]);
    expect(outputs.map(result => result.status)).toEqual(['conflict', 'conflict']);
    expect(memory.values.size).toBe(2);
    memory.beforeSet = null;
    expect(
      (await create(memory).save(saveRequest('recipe-a', 'same', [], json('recipe-a', 0.2)))).status
    ).toBe('conflict');
  });

  it.each(['revision', 'tombstone'] as const)(
    'refreshes an idempotent acknowledgment when a concurrent %s arrives during readback',
    async change => {
      const memory = new MemoryStorage(),
        store = create(memory);
      const head = acknowledged(await store.save(saveRequest()));
      const key = [...memory.values.keys()][0],
        originalGet = memory.getAsync.bind(memory);
      let reads = 0;
      vi.spyOn(memory, 'getAsync').mockImplementation(async requestedKey => {
        const raw = await originalGet(requestedKey);
        if (requestedKey === key && ++reads === 2) {
          if (change === 'revision')
            acknowledged(await create(memory).save(saveRequest('recipe-a', 'concurrent', [head])));
          else
            expect(
              (
                await create(memory).delete({
                  recipeId: 'recipe-a',
                  mutationId: 'delete',
                  expectedHeadRevisionHashes: [head],
                })
              ).status
            ).toBe('deleted');
        }
        return raw;
      });
      const retry = await store.save(saveRequest());
      expect(retry).toMatchObject({
        status: change === 'revision' ? 'conflict' : 'deleted',
        idempotent: true,
      });
      expect(snapshot(retry).recipes[0].status).toBe(change === 'revision' ? 'ready' : 'deleted');
    }
  );

  it('returns a typed failure when the post-acknowledgment refresh fails', async () => {
    const memory = new MemoryStorage();
    const originalKeys = memory.keysAsync.bind(memory);
    let reads = 0;
    vi.spyOn(memory, 'keysAsync').mockImplementation(async () => {
      if (++reads === 2) throw new Error('refresh unavailable');
      return originalKeys();
    });
    expect(await create(memory).save(saveRequest())).toMatchObject({
      status: 'storage-error',
      error: 'refresh unavailable',
    });
    expect(memory.values.size).toBe(1);
  });

  it('does not report Saved for failed writes or dropped readback, and retries a write whose acknowledgment failed', async () => {
    const memory = new MemoryStorage(),
      store = create(memory);
    memory.beforeSet = async () => {
      throw new Error('write denied');
    };
    expect((await store.save(saveRequest())).status).toBe('storage-error');
    expect(memory.values.size).toBe(0);
    memory.beforeSet = null;
    memory.afterSet = async () => {
      throw new Error('ack lost');
    };
    expect((await store.save(saveRequest())).status).toBe('storage-error');
    expect(memory.values.size).toBe(1);
    memory.afterSet = null;
    expect(await store.save(saveRequest())).toMatchObject({ status: 'saved', idempotent: true });
    const dropped = new MemoryStorage();
    dropped.afterSet = async key => {
      dropped.values.delete(key);
    };
    expect(await create(dropped).save(saveRequest())).toMatchObject({
      status: 'conflict',
      acknowledgedRevisionHash: null,
    });
  });

  it('reports read failures without treating cached data as an acknowledgment', async () => {
    const memory = new MemoryStorage(),
      store = create(memory);
    vi.spyOn(memory, 'keysAsync').mockRejectedValue(new Error('keys unavailable'));
    expect((await store.list()).status).toBe('storage-error');
    expect((await store.get('recipe-a')).status).toBe('storage-error');
    expect((await store.save(saveRequest())).status).toBe('storage-error');
    expect(memory.values.size).toBe(0);
  });

  it('retains unknown envelope and recipe versions as exact read-only exports', async () => {
    const memory = new MemoryStorage();
    const unknownEnvelope =
      ' {"schemaVersion":"future","recipeId":"future-a","payload":"keep original"}\n';
    memory.values.set(`${COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX}future:a`, unknownEnvelope);
    const futureRecipe = storedRevision(
      'future-b',
      '{"version":"future","id":"future-b","native":0.12345678901234567}'
    );
    memory.values.set(futureRecipe.key, futureRecipe.raw);
    const store = create(memory),
      state = snapshot(await store.list());
    expect(state.recipes.map(recipe => recipe.status)).toEqual(['read-only', 'read-only']);
    expect(state.recipes[0].readOnlyEntries[0].rawStorageJson).toBe(unknownEnvelope);
    expect(state.recipes[1].readOnlyEntries[0].rawStorageJson).toBe(futureRecipe.raw);
    expect((await store.save(saveRequest('future-a'))).status).toBe('read-only');
    expect(
      (
        await store.delete({
          recipeId: 'future-b',
          mutationId: 'delete',
          expectedHeadRevisionHashes: [],
        })
      ).status
    ).toBe('read-only');
    expect(memory.values.size).toBe(2);
    expect(memory.values.get(futureRecipe.key)).toBe(futureRecipe.raw);
  });

  it('retains malformed and non-string legacy records without reading getters or changing unrelated keys', async () => {
    const memory = new MemoryStorage();
    memory.values.set('unrelated', 'leave');
    memory.values.set(`${COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX}broken`, '{broken');
    memory.values.set(`${COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX}legacy`, {
      version: 0,
      value: '#AABBCC',
    });
    const store = create(memory),
      state = snapshot(await store.list());
    expect(state.unscopedReadOnlyEntries).toHaveLength(2);
    expect(state.unscopedReadOnlyEntries[0].rawStorageJson).toBe('{broken');
    expect(state.unscopedReadOnlyEntries[1].legacyExportJson).toBe(
      '{"value":"#AABBCC","version":0}'
    );
    expect((await store.save(saveRequest())).status).toBe('read-only');
    expect(memory.values.get('unrelated')).toBe('leave');
  });

  it('does not alias returned revisions, heads, or raw records into storage', async () => {
    const memory = new MemoryStorage(),
      store = create(memory);
    const result = await store.save(saveRequest());
    acknowledged(result);
    const state = snapshot(result);
    state.recipes[0].revisions[0].revision!.recipeJson = 'mutated';
    state.recipes[0].headRevisionHashes.length = 0;
    const reopened = snapshot(await store.list()).recipes[0];
    expect(reopened.revisions[0].revision!.recipeJson).toBe(json());
    expect(reopened.headRevisionHashes).toHaveLength(1);
  });

  it('enforces eight active recipes without eviction and allows a new ID after acknowledged deletion', async () => {
    const memory = new MemoryStorage(),
      store = create(memory);
    for (let i = 0; i < 8; i++) acknowledged(await store.save(saveRequest(`recipe-${i}`)));
    expect((await store.save(saveRequest('ninth'))).status).toBe('capacity');
    expect(memory.values.size).toBe(8);
    const first = snapshot(await store.list()).recipes[0];
    expect(
      (
        await store.delete({
          recipeId: first.recipeId,
          mutationId: 'delete-1',
          expectedHeadRevisionHashes: first.headRevisionHashes,
        })
      ).status
    ).toBe('deleted');
    expect((await store.save(saveRequest(first.recipeId, 'new-save'))).status).toBe('deleted');
    acknowledged(await store.save(saveRequest('ninth')));
    expect(snapshot(await store.list()).usage.activeRecipes).toBe(8);
    const tombstones = [...memory.values.values()].filter(value =>
      String(value).includes('tombstone.v1')
    );
    expect(tombstones).toHaveLength(1);
    expect(String(tombstones[0])).not.toContain('native');
    expect(String(tombstones[0])).not.toContain('recipeJson');
  });

  it('enforces 64 data revisions, preserves history, and frees color-bearing revisions on delete', async () => {
    const memory = new MemoryStorage(),
      store = create(memory);
    let parents: string[] = [];
    for (let i = 0; i < 64; i++)
      parents = [acknowledged(await store.save(saveRequest('recipe-a', `save-${i}`, parents)))];
    expect((await store.save(saveRequest('recipe-a', 'overflow', parents))).status).toBe(
      'capacity'
    );
    expect(snapshot(await store.list()).usage.dataRevisions).toBe(64);
    expect(
      (
        await store.delete({
          recipeId: 'recipe-a',
          mutationId: 'delete',
          expectedHeadRevisionHashes: parents,
        })
      ).status
    ).toBe('deleted');
    const state = snapshot(await store.list());
    expect(state.usage.dataRevisions).toBe(0);
    expect(state.usage.aggregateBytes).toBeLessThan(1000);
  });

  it('keeps an oversized recipe exportable without writing or evicting anything', async () => {
    const memory = new MemoryStorage(),
      store = create(memory);
    const recipeJson = JSON.stringify({
      version: 'test.recipe.v1',
      id: 'recipe-a',
      retained: 'x'.repeat(COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS.maximumAggregateBytes),
    });
    const result = await store.save(saveRequest('recipe-a', 'large', [], recipeJson));
    expect(result).toMatchObject({
      status: 'capacity',
      recipeJson,
      acknowledgedRevisionHash: null,
    });
    expect(memory.values.size).toBe(0);
  });

  it('surfaces a simultaneous quota race without claiming global atomic admission', async () => {
    const memory = new MemoryStorage();
    for (let i = 0; i < 7; i++) acknowledged(await create(memory).save(saveRequest(`recipe-${i}`)));
    memory.beforeSet = barrier();
    const result = await Promise.all([
      create(memory).save(saveRequest('eighth')),
      create(memory).save(saveRequest('ninth')),
    ]);
    expect(result.map(item => item.status)).toEqual(['capacity', 'capacity']);
    const state = snapshot(await create(memory).list());
    expect(state.usage.activeRecipes).toBe(9);
    expect(state.usage.overCapacity).toBe(true);
    expect(state.recipes.every(recipe => recipe.revisions[0].revision?.recipeJson)).toBe(true);
  });

  it('requires current heads and a durable tombstone before removing color-bearing data', async () => {
    const memory = new MemoryStorage(),
      store = create(memory);
    const head = acknowledged(await store.save(saveRequest()));
    expect(
      (
        await store.delete({
          recipeId: 'recipe-a',
          mutationId: 'delete',
          expectedHeadRevisionHashes: [],
        })
      ).status
    ).toBe('conflict');
    memory.beforeSet = async key => {
      if (key.includes('tombstone:')) throw new Error('tombstone denied');
    };
    expect(
      (
        await store.delete({
          recipeId: 'recipe-a',
          mutationId: 'delete',
          expectedHeadRevisionHashes: [head],
        })
      ).status
    ).toBe('storage-error');
    expect(memory.events.filter(event => event.startsWith('delete:'))).toEqual([]);
    expect(memory.values.size).toBe(1);
    memory.beforeSet = null;
    memory.afterSet = async key => {
      if (key.includes('tombstone:')) memory.values.delete(key);
    };
    expect(
      (
        await store.delete({
          recipeId: 'recipe-a',
          mutationId: 'delete',
          expectedHeadRevisionHashes: [head],
        })
      ).status
    ).toBe('delete-incomplete');
    expect(memory.events.filter(event => event.startsWith('delete:'))).toEqual([]);
    expect(memory.values.size).toBe(1);
  });

  it('keeps deletion visible during partial cleanup and safely retries after reopening', async () => {
    const memory = new MemoryStorage(),
      store = create(memory);
    const head = acknowledged(await store.save(saveRequest()));
    const input = {
      recipeId: 'recipe-a',
      mutationId: 'delete',
      expectedHeadRevisionHashes: [head],
    };
    memory.failDelete = true;
    expect(await store.delete(input)).toMatchObject({
      status: 'delete-incomplete',
      acknowledgedTombstoneHash: expect.stringMatching(/^sha256:/),
    });
    const reopened = create(memory),
      state = snapshot(await reopened.list());
    expect(state.recipes[0]).toMatchObject({ status: 'deleted', cleanupPending: true });
    expect((await reopened.save(saveRequest('recipe-a', 'after-delete', [head]))).status).toBe(
      'deleted'
    );
    expect((await reopened.delete({ ...input, expectedHeadRevisionHashes: [] })).status).toBe(
      'conflict'
    );
    memory.failDelete = false;
    expect((await reopened.delete(input)).status).toBe('deleted');
    expect((await reopened.delete(input)).status).toBe('deleted');
    expect(memory.values.size).toBe(1);
  });

  it('prevents a writer paused before its write from resurrecting an acknowledged deletion', async () => {
    const memory = new MemoryStorage(),
      initial = create(memory);
    const head = acknowledged(await initial.save(saveRequest()));
    let release!: () => void, arrived!: () => void;
    const written = new Promise<void>(resolve => {
      arrived = resolve;
    });
    const paused = new Promise<void>(resolve => {
      release = resolve;
    });
    memory.beforeSet = async key => {
      if (key.includes('revision:')) {
        arrived();
        await paused;
      }
    };
    const late = create(memory).save(
      saveRequest('recipe-a', 'late', [head], json('recipe-a', 0.5))
    );
    await written;
    expect(
      (
        await create(memory).delete({
          recipeId: 'recipe-a',
          mutationId: 'delete',
          expectedHeadRevisionHashes: [head],
        })
      ).status
    ).toBe('deleted');
    release();
    expect((await late).status).toBe('deleted');
    const state = snapshot(await create(memory).list());
    expect(state.recipes[0].status).toBe('deleted');
    expect(state.usage.dataRevisions).toBe(0);
  });

  it('retains a stored envelope with a forged content hash as read-only', async () => {
    const memory = new MemoryStorage(),
      entry = storedRevision('recipe-a', json());
    const corrupted = JSON.parse(entry.raw);
    corrupted.recipeJson += ' ';
    memory.values.set(entry.key, JSON.stringify(corrupted));
    const state = snapshot(await create(memory).list());
    expect(state.recipes[0].status).toBe('read-only');
    expect(state.recipes[0].readOnlyEntries[0].rawStorageJson).toBe(JSON.stringify(corrupted));
  });
});
