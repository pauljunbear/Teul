import { describe, expect, it, vi } from 'vitest';
import { createColorSystemAuthoringSessionV1 } from '../colorSystemAuthoringSessionV1';
import {
  createColorSystemRecipeStorageV1,
  COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX,
  type ColorSystemRecipeClientStorageV1,
} from '../colorSystemRecipeStorageV1';
import {
  parseColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
  type ColorSystemRecipeV1,
} from '../../lib/colorSystemRecipeV1';
import { buildColorSystemModelV1, type ColorSystemModelV1 } from '../../lib/colorSystemModelV1';
import { syntheticColorSystemModelInputV1 } from '../../lib/__tests__/fixtures/colorSystemModelV1Fixture';
import {
  COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
  type ColorSystemAuthoringDirectionV1,
} from '../../lib/colorSystemAuthoringExecutionV1';
import { COLOR_SYSTEM_PROPOSAL_V1_VERSION } from '../../lib/colorSystemProposalV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
} from '../../lib/colorSystemApplicationRequirementsV1';
import { COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION } from '../../lib/colorSystemModelCompositionV1';
import { canonicalJson, deterministicContentHash } from '../../lib/colorSystemHashing';
import type { ColorSystemModelFreshCheckV1 } from '../colorSystemModelControllerV1';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
function sourceModel(label = 'Original synthetic packet'): ColorSystemModelV1 {
  const input = syntheticColorSystemModelInputV1();
  return buildColorSystemModelV1({
    ...input,
    sources: input.sources.map(source => ({ ...source, label })),
    rules: [],
    adoptions: [],
    claims: input.claims.map(claim => ({ ...claim, ruleIds: [] })),
  });
}
/** Actual two-mode source apply, using public invented paints; no prepared engine result. */
function direction(
  model: ColorSystemModelV1,
  mark = 'ink',
  minimum = 3
): ColorSystemAuthoringDirectionV1 {
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: ['Day', 'Night'].map(modeId => ({
      id: modeId,
      contextId: 'interface',
      modeId,
      uses: [
        { id: 'ground', role: 'ground', area: 100 },
        { id: 'mark', role: 'action', area: 20 },
      ],
      pairs: [
        {
          id: 'mark-on-ground',
          foregroundUseId: 'mark',
          backgroundUseId: 'ground',
          contrast: { minimum, assessment: 'required' },
        },
      ],
    })),
    distinctions: [],
  });
  return {
    version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
    id: 'session-direction',
    generation: {
      kind: 'apply',
      proposal: {
        version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
        id: 'session-proposal',
        sourceModelHash: model.modelHash,
        brief: {
          briefHash: hash('fixed session brief'),
          operation: 'apply',
          contextIds: ['interface'],
          modeIds: ['Day', 'Night'],
          permissions: {
            addColors: false,
            addFamilies: false,
            addScales: false,
            addRules: false,
            editFamilyIds: [],
            editScaleIds: [],
            replaceRuleIds: [],
          },
        },
        derivation: {
          algorithmId: 'source-apply',
          algorithmVersion: '1',
          policyHash: hash('apply policy'),
          inputHash: hash('source'),
          sourceColorIds: ['paper', mark],
          sourceScaleIds: [],
        },
        colors: [],
        families: [],
        scales: [],
        rules: [],
        exceptions: [],
      },
    },
    requirements,
    composition: {
      version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
      modelHash: model.modelHash,
      requirementsHash: hash(requirements),
      maximumNodes: 64,
      maximumSolutions: 3,
      groups: [
        {
          id: 'applications',
          options: [
            {
              id: 'source-pair',
              assignments: requirements.templates.flatMap(template =>
                template.uses.map(use => ({
                  applicationId: template.id,
                  useId: use.id,
                  colorId: use.id === 'ground' ? 'paper' : mark,
                }))
              ),
            },
          ],
        },
      ],
    },
    units: [],
  };
}
class MemoryStorage implements ColorSystemRecipeClientStorageV1 {
  values = new Map<string, unknown>();
  beforeSet: (() => Promise<void>) | null = null;
  failSet = false;
  failDelete = false;
  async keysAsync() {
    return [...this.values.keys()];
  }
  async getAsync(key: string) {
    return structuredClone(this.values.get(key));
  }
  async setAsync(key: string, value: unknown) {
    await this.beforeSet?.();
    if (this.failSet) throw new Error('Synthetic storage failure');
    this.values.set(key, structuredClone(value));
  }
  async deleteAsync(key: string) {
    if (this.failDelete) throw new Error('Synthetic cleanup failure');
    this.values.delete(key);
  }
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
function harness(
  memory = new MemoryStorage(),
  intake: 'guideline-json' | 'current-file' = 'guideline-json'
) {
  let source: ColorSystemRecipeV1['source'] = {
    model: sourceModel(),
    intake,
    ...(intake === 'current-file'
      ? { currentFileReadScopeJson: '{"syntheticReadIntent":true}' }
      : {}),
  };
  let yieldHook = async () => {};
  let freshness: ColorSystemModelFreshCheckV1['status'] = 'same';
  const checkSource = vi.fn(
    async (
      retained: ColorSystemRecipeV1['source'],
      _cancelled: () => boolean
    ): Promise<ColorSystemModelFreshCheckV1> => ({
      status: freshness,
      code: 'SYNTHETIC_BACKEND_READ',
      message: 'Result of the separately invoked test host read.',
      sourceModelHash: retained.model.modelHash,
    })
  );
  const storage = createColorSystemRecipeStorageV1({
    clientStorage: memory,
    validateRecipeJsonForSave(raw, id) {
      const parsed = parseColorSystemRecipeV1(JSON.parse(raw));
      if (parsed.id !== id) throw new Error('Recipe identity mismatch');
    },
  });
  const session = createColorSystemAuthoringSessionV1({
    source: () => source,
    storage,
    checkSource,
    yield: () => yieldHook(),
  });
  return {
    memory,
    storage,
    session,
    checkSource,
    getSource: () => source,
    replaceSource: (value: ColorSystemRecipeV1['source']) => {
      source = value;
    },
    setYield: (value: () => Promise<void>) => {
      yieldHook = value;
    },
    setFreshness: (value: ColorSystemModelFreshCheckV1['status']) => {
      freshness = value;
    },
    analyze: (mark = 'ink', label = 'Two-mode recipe', minimum = 3, id = 'recipe-a') =>
      session.analyze({ id, label, direction: direction(source.model, mark, minimum) }),
  };
}
async function ready(test: ReturnType<typeof harness>, mark = 'ink') {
  const result = await test.analyze(mark);
  expect(result.status).toBe('ready');
  expect(result.snapshot.qualified).toBe(false);
  expect(result.snapshot.recipe?.selection?.applications).toHaveLength(2);
  return result;
}
async function save(test: ReturnType<typeof harness>, mutationId = 'save-1') {
  const result = await test.session.save(mutationId);
  expect(result.result.status).toBe('saved');
  if (result.result.status !== 'saved' || !result.result.acknowledgedRevisionHash)
    throw new Error('No acknowledged revision.');
  return result.result.acknowledgedRevisionHash;
}

describe('authoring session lifecycle with actual engine and storage', () => {
  it('does not join revision branches after the read was cancelled', async () => {
    const test = harness();
    await ready(test);
    const head = await save(test);
    const before = test.session.getSnapshot();
    const entered = deferred(),
      release = deferred();
    const get = test.storage.get.bind(test.storage);
    vi.spyOn(test.storage, 'get').mockImplementationOnce(async id => {
      const observed = await get(id);
      entered.resolve();
      await release.promise;
      return observed;
    });
    const resolving = test.session.resolveConflicts([head]);
    await entered.promise;
    test.session.cancel();
    release.resolve();
    await expect(resolving).rejects.toThrow(/branches changed/);
    expect(test.session.getSnapshot()).toEqual(before);
  });
  it('recomputes a saved intent-only draft into an unsaved selected revision', async () => {
    const test = harness();
    await ready(test);
    const selected = test.session.getSnapshot().recipe!;
    const raw = serializeColorSystemRecipeV1({ ...selected, selection: null, locks: [] });
    const stored = await test.storage.save({
      recipeId: selected.id,
      mutationId: 'draft',
      parentRevisionHashes: [],
      recipeJson: raw,
    });
    if (stored.status !== 'saved' || !stored.acknowledgedRevisionHash)
      throw new Error('Expected saved draft.');
    test.session.startNew();
    const opened = await test.session.open(selected.id, stored.acknowledgedRevisionHash);
    expect(opened.status).toBe('ready');
    expect(opened.snapshot.recipe?.selection?.contentHash).toBe(selected.selection!.contentHash);
    expect(opened.snapshot.saved).toBe(false);
    expect(opened.snapshot.revisionHeads).toEqual([stored.acknowledgedRevisionHash]);
    expect(test.memory.values.size).toBe(1);
    expect(test.checkSource).not.toHaveBeenCalled();
  });
  it('keeps the prior exact selection after failed, infeasible and cancelled refinements', async () => {
    const test = harness();
    await ready(test);
    const before = test.session.exportJson();
    await expect(
      test.session.analyze({ id: 'recipe-a', label: 'Invalid', direction: { version: 'unknown' } })
    ).rejects.toThrow();
    expect(test.session.exportJson()).toBe(before);
    expect((await test.analyze('ink', 'Impossible', 21)).status).toBe('blocked');
    expect(test.session.exportJson()).toBe(before);
    test.setYield(async () => {
      test.session.cancel();
    });
    expect((await test.analyze('blue-deep')).status).toBe('cancelled');
    expect(test.session.exportJson()).toBe(before);
    test.setYield(async () => {});
    const refined = await test.analyze('blue-deep');
    expect(refined.status).toBe('ready');
    expect(refined.diff?.changed.some(item => item.entity.kind === 'applicationUses')).toBe(true);
    expect(refined.snapshot.recipe!.selection!.contentHash).not.toBe(
      JSON.parse(before).selection.contentHash
    );
  });

  it('preserves locks through blocked refinement and permits a changed application after explicit unlock', async () => {
    const test = harness();
    await ready(test, 'blue-deep');
    test.session.lock({ kind: 'scale', id: 'blue-scale' });
    const before = test.session.exportJson();
    const blocked = await test.analyze('ink');
    expect(blocked.status).toBe('blocked');
    expect(blocked.message).toContain('scale blue-scale');
    expect(blocked.message).toContain('explicitly unlock');
    expect(test.session.exportJson()).toBe(before);
    expect(test.session.getSnapshot().recipe!.locks).toHaveLength(1);
    test.session.unlock({ kind: 'scale', id: 'blue-scale' });
    expect((await test.analyze('ink')).status).toBe('ready');
    expect(test.session.getSnapshot().recipe!.locks).toEqual([]);
  });

  it('marks saved only after exact storage acknowledgment and retains an edit made during save', async () => {
    const test = harness();
    await ready(test);
    const entered = deferred(),
      release = deferred();
    test.memory.beforeSet = async () => {
      entered.resolve();
      await release.promise;
    };
    const pending = test.session.save('save-1');
    await entered.promise;
    expect(test.session.getSnapshot().saved).toBe(false);
    test.session.lock({ kind: 'scale', id: 'blue-scale' });
    const edited = test.session.exportJson();
    release.resolve();
    const acknowledged = await pending;
    expect(acknowledged.result.status).toBe('saved');
    expect(acknowledged.snapshot.saved).toBe(false);
    expect(test.session.exportJson()).toBe(edited);
    expect(acknowledged.snapshot.revisionHeads).toHaveLength(1);
    test.memory.beforeSet = null;
    await save(test, 'save-2');
    expect(test.session.getSnapshot().saved).toBe(true);
  });

  it('retains the acknowledged parent when a completed refinement replaces state during save', async () => {
    const test = harness();
    await ready(test);
    const entered = deferred(),
      release = deferred();
    test.memory.beforeSet = async () => {
      entered.resolve();
      await release.promise;
    };
    const pending = test.session.save('save-1');
    await entered.promise;
    expect((await test.analyze('blue-deep')).status).toBe('ready');
    const refined = test.session.exportJson();
    release.resolve();
    const acknowledged = await pending;
    expect(acknowledged.result.status).toBe('saved');
    expect(acknowledged.snapshot.saved).toBe(false);
    expect(test.session.exportJson()).toBe(refined);
    expect(acknowledged.snapshot.revisionHeads).toHaveLength(1);
    test.memory.beforeSet = null;
    await save(test, 'save-2');
  });

  it.each(['start-new', 'import'] as const)(
    'does not attach a pending acknowledgment to a %s lineage with the same recipe ID',
    async reset => {
      const test = harness();
      await ready(test);
      const raw = test.session.exportJson();
      const entered = deferred(),
        release = deferred();
      test.memory.beforeSet = async () => {
        entered.resolve();
        await release.promise;
      };
      const pending = test.session.save('old-lineage');
      await entered.promise;
      if (reset === 'start-new') {
        test.session.startNew();
        await ready(test, 'blue-deep');
      } else {
        expect((await test.session.importJson(raw)).status).toBe('ready');
      }
      const replacement = test.session.exportJson();
      release.resolve();
      const acknowledged = await pending;
      expect(acknowledged.result.status).toBe('saved');
      expect(acknowledged.snapshot.saved).toBe(false);
      expect(acknowledged.snapshot.revisionHeads).toEqual([]);
      expect(test.session.exportJson()).toBe(replacement);
    }
  );

  it('rejects an overlapping save within one session before writing a second revision', async () => {
    const test = harness();
    await ready(test);
    const entered = deferred(),
      release = deferred();
    let writes = 0;
    test.memory.beforeSet = async () => {
      writes++;
      entered.resolve();
      await release.promise;
    };
    const pending = test.session.save('save-1');
    await entered.promise;
    await expect(test.session.save('save-2')).rejects.toThrow();
    expect(writes).toBe(1);
    release.resolve();
    expect((await pending).snapshot.saved).toBe(true);
    expect(test.memory.values.size).toBe(1);
  });

  it('preserves the last confirmed recipe when storage fails', async () => {
    const test = harness();
    await ready(test);
    await save(test);
    test.session.lock({ kind: 'scale', id: 'blue-scale' });
    const before = test.session.exportJson();
    test.memory.failSet = true;
    expect((await test.session.save('save-2')).result.status).toBe('storage-error');
    expect(test.session.exportJson()).toBe(before);
    expect(test.session.getSnapshot().saved).toBe(false);
    expect(test.memory.values.size).toBe(1);
  });

  it('reopens after more than five minutes without rewriting saved bytes or granting freshness', async () => {
    const first = harness(new MemoryStorage(), 'current-file');
    await ready(first);
    const revision = await save(first),
      raw = first.session.exportJson();
    const stored = [...first.memory.values.entries()];
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 600001);
    try {
      const next = harness(first.memory, 'current-file');
      const opened = await next.session.open('recipe-a', revision);
      expect(opened.status).toBe('ready');
      expect(opened.snapshot.saved).toBe(true);
      expect(opened.snapshot.sourceFreshness).toBe('not-checked');
      expect(opened.snapshot.qualified).toBe(false);
      expect(next.session.exportJson()).toBe(raw);
      expect([...first.memory.values.entries()]).toEqual(stored);
      expect(next.checkSource).not.toHaveBeenCalled();
      expect((await next.session.checkSource()).snapshot.sourceFreshness).toBe('same');
      expect(next.checkSource).toHaveBeenCalledTimes(1);
      expect(next.session.exportJson()).toBe(raw);
      expect([...first.memory.values.entries()]).toEqual(stored);
    } finally {
      now.mockRestore();
    }
  });

  it('distinguishes imported snapshots from actual backend source checks and invalidates source replacement', async () => {
    const imported = harness();
    await ready(imported);
    expect((await imported.session.checkSource()).snapshot.sourceFreshness).toBe(
      'imported-snapshot'
    );
    expect(imported.checkSource).not.toHaveBeenCalled();
    const live = harness(new MemoryStorage(), 'current-file');
    await ready(live);
    live.setFreshness('changed');
    expect((await live.session.checkSource()).snapshot.sourceFreshness).toBe('changed');
    expect(live.checkSource).toHaveBeenCalledTimes(1);
    const before = live.session.exportJson();
    live.replaceSource({ ...live.getSource(), model: sourceModel('Replacement packet') });
    live.session.invalidateSource();
    expect(live.session.getSnapshot().sourceFreshness).toBe('not-checked');
    expect((await live.analyze()).status).toBe('changed');
    expect(live.session.exportJson()).toBe(before);
    expect((await live.analyze('ink', 'New source recipe', 3, 'recipe-b')).status).toBe('ready');
  });

  it('rejects a source packet replaced while actual analysis is yielding', async () => {
    const test = harness();
    await ready(test);
    const before = test.session.exportJson();
    test.setYield(async () => {
      test.replaceSource({ ...test.getSource(), model: sourceModel('Changed during analysis') });
    });
    expect((await test.analyze('blue-deep')).status).toBe('changed');
    expect(test.session.exportJson()).toBe(before);
  });

  it('keeps the prior exact selection when replay changes or is cancelled', async () => {
    const test = harness();
    await ready(test);
    const before = test.session.exportJson();
    const changed = parseColorSystemRecipeV1({
      ...JSON.parse(before),
      direction: direction(test.getSource().model, 'blue-deep'),
    });
    expect((await test.session.importJson(serializeColorSystemRecipeV1(changed))).status).toBe(
      'changed'
    );
    expect(test.session.exportJson()).toBe(before);
    test.setYield(async () => test.session.cancel());
    expect((await test.session.importJson(before)).status).toBe('cancelled');
    expect(test.session.exportJson()).toBe(before);
  });

  it.each(['cancel', 'invalidate-source', 'start-new'] as const)(
    'does not apply a delayed freshness result after %s',
    async action => {
      const test = harness(new MemoryStorage(), 'current-file');
      await ready(test);
      const before = test.session.exportJson();
      const entered = deferred(),
        release = deferred();
      let cancelled: (() => boolean) | undefined;
      test.checkSource.mockImplementationOnce(async (retained, isCancelled) => {
        cancelled = isCancelled;
        entered.resolve();
        await release.promise;
        return {
          status: 'same',
          code: 'SYNTHETIC_DELAYED_READ',
          message: 'Delayed host response after a later session action.',
          sourceModelHash: retained.model.modelHash,
        };
      });
      const pending = test.session.checkSource();
      await entered.promise;
      expect(cancelled?.()).toBe(false);
      if (action === 'cancel') test.session.cancel();
      else if (action === 'invalidate-source') test.session.invalidateSource();
      else test.session.startNew();
      expect(cancelled?.()).toBe(true);
      release.resolve();
      const checked = await pending;
      expect(checked.snapshot.sourceFreshness).toBe('not-checked');
      if (action === 'start-new') expect(checked.snapshot.recipe).toBeNull();
      else expect(test.session.exportJson()).toBe(before);
    }
  );

  it('retains unsupported imported/storage data for exact read-only export', async () => {
    const test = harness();
    await ready(test);
    const raw = ' \n {"schemaVersion":"future.recipe.v9","payload":{"signed":-0}}\n ';
    expect((await test.session.importJson(raw)).status).toBe('read-only');
    expect(test.session.exportJson()).toBe(raw);
    expect(test.session.getSnapshot().saved).toBe(false);
    await expect(test.session.save('forbidden')).rejects.toThrow(/read-only/);
    expect(() => test.session.lock({ kind: 'scale', id: 'blue-scale' })).toThrow(/read-only/);
    test.session.startNew();
    const key = `${COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX}future:one`;
    test.memory.values.set(key, raw);
    expect((await test.session.openReadOnlyStorageEntry(key)).status).toBe('read-only');
    expect(test.session.exportJson()).toBe(raw);
    expect(test.memory.values.get(key)).toBe(raw);
  });

  it('requires explicit resolution of concurrent acknowledged revision branches', async () => {
    const first = harness();
    await ready(first);
    const revision = await save(first);
    const second = harness(first.memory);
    await second.session.open('recipe-a', revision);
    expect((await first.analyze('ink', 'Left label')).status).toBe('ready');
    expect((await second.analyze('ink', 'Right label')).status).toBe('ready');
    let entered = 0;
    const release = deferred();
    first.memory.beforeSet = async () => {
      if (++entered === 2) release.resolve();
      await release.promise;
    };
    const [left, right] = await Promise.all([
      first.session.save('left'),
      second.session.save('right'),
    ]);
    expect(left.result.status).toBe('conflict');
    expect(right.result.status).toBe('conflict');
    expect(left.snapshot.conflictHeads).toHaveLength(2);
    await expect(first.session.save('implicit-merge')).rejects.toThrow(/Resolve/);
    await expect(
      first.session.resolveConflicts(left.snapshot.conflictHeads.slice(0, 1))
    ).rejects.toThrow(/Revision branches changed/);
    first.memory.beforeSet = null;
    const resolved = await first.session.resolveConflicts(left.snapshot.conflictHeads);
    expect(resolved.saved).toBe(false);
    expect(resolved.conflictHeads).toEqual([]);
    expect(resolved.revisionHeads).toHaveLength(2);
    await save(first, 'explicit-merge');
    const listed = await first.storage.list();
    if (listed.status !== 'listed') throw new Error('Expected storage list');
    expect(listed.snapshot.recipes[0].status).toBe('ready');
    expect(listed.snapshot.recipes[0].revisions).toHaveLength(4);
  });

  it('reports incomplete deletion after a tombstone while retaining failure evidence', async () => {
    const test = harness();
    await ready(test);
    const revision = await save(test);
    test.memory.failSet = true;
    expect((await test.session.delete('recipe-a', 'failed-delete', [revision])).result.status).toBe(
      'storage-error'
    );
    expect(test.session.getSnapshot().recipe).not.toBeNull();
    test.memory.failSet = false;
    test.memory.failDelete = true;
    const deleted = await test.session.delete('recipe-a', 'delete', [revision]);
    expect(deleted.result.status).toBe('delete-incomplete');
    expect(deleted.snapshot.recipe).toBeNull();
    expect(deleted.snapshot.saved).toBe(false);
    const stored = await test.storage.get('recipe-a');
    if (stored.status !== 'found') throw new Error('Expected tombstone');
    expect(stored.recipe).toMatchObject({ status: 'deleted', cleanupPending: true });
    await expect(test.session.open('recipe-a', revision)).rejects.toThrow(/deleted/);
  });

  it('does not expose private recipe, selection or revision state through public snapshots', async () => {
    const test = harness();
    await ready(test);
    await save(test);
    const before = test.session.exportJson();
    const returned = test.session.getSnapshot() as Mutable<
      ReturnType<typeof test.session.getSnapshot>
    >;
    returned.recipe!.label = 'Public mutation';
    returned.recipe!.selection!.applications[0].uses[0].colorId = 'missing';
    returned.recipe!.source.model.colors[0].valuesByMode.Day.components.r = 0;
    returned.revisionHeads.length = 0;
    returned.conflictHeads.push(hash('fake'));
    expect(test.session.exportJson()).toBe(before);
    expect(test.session.getSnapshot().saved).toBe(true);
    expect(test.session.getSnapshot().revisionHeads).toHaveLength(1);
    expect(test.session.getSnapshot().conflictHeads).toEqual([]);
    expect(serializeColorSystemRecipeV1(test.session.getSnapshot().recipe)).toBe(before);
  });
});
