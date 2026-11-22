import { beforeAll, describe, expect, it } from 'vitest';
import { syntheticColorSystemAuthoringDeliveryV1Fixture } from '../../lib/__tests__/fixtures/colorSystemAuthoringDeliveryV1Fixture';
import { deterministicContentHash as hash } from '../../lib/colorSystemHashing';
import { serializeColorSystemInertJsonV1 } from '../../lib/colorSystemInertJsonV1';
import {
  parseColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
} from '../../lib/colorSystemRecipeV1';
import {
  createColorSystemAuthoredDeliverySessionV1,
  type ColorSystemAuthoredDeliveryDestinationV1,
} from '../colorSystemAuthoredDeliverySessionV1';
import { type ColorSystemAuthoredRendererHostV1 } from '../colorSystemAuthoredRendererV1';
import {
  createColorSystemCreateJournalRuntimeV2,
  type ColorSystemCreateJournalHostV2,
  type ColorSystemCreateJournalResolvedResourceV2,
} from '../colorSystemCreateJournalV2';
import { COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION } from '../colorSystemResourceOwnershipV2';
import type { ColorSystemHostResourceRefV2 } from '../colorSystemResourceRendererV2';
import type { ColorSystemModelFreshCheckV1 } from '../colorSystemModelControllerV1';

type Fixture = Awaited<ReturnType<typeof syntheticColorSystemAuthoringDeliveryV1Fixture>>;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}
function harness(fixture: Fixture, currentFile = false) {
  let recipe = parseColorSystemRecipeV1({
    ...structuredClone(fixture.recipe),
    source: {
      ...structuredClone(fixture.recipe.source),
      intake: currentFile ? 'current-file' : 'guideline-json',
    },
  });
  let time = 1000,
    sourceStatus: ColorSystemModelFreshCheckV1['status'] = 'same',
    sourceHash: string | null = recipe.source.model.modelHash;
  let destination: ColorSystemAuthoredDeliveryDestinationV1 = {
    name: 'Invented destination',
    currentFileIdentityHash: hash('synthetic session file'),
    documentType: 'figma-design',
    colorProfile: 'srgb',
    editable: true,
  };
  const data = new Map<string, string>(),
    completion = new Map<string, unknown>(),
    resources = new Map<string, ColorSystemCreateJournalResolvedResourceV2>();
  const events: string[] = [];
  let observer: ((ref: ColorSystemHostResourceRefV2) => void) | null = null;
  const host: ColorSystemAuthoredRendererHostV1 = {
    async getContext() {
      events.push('context');
      return {
        ...destination,
        documentType: destination.documentType as 'figma-design',
        colorProfile: destination.colorProfile as 'srgb',
        geometryVectors: true,
        capabilities: {
          colorVariables: true,
          variableAliases: true,
          variableBoundPaintStyles: true,
          components: true,
          frames: true,
        },
      };
    },
    async findNameCollisions() {
      return [];
    },
    async loadFonts() {
      events.push('fonts');
    },
    setCreatedResourceObserver(next) {
      observer = next;
    },
    async createOutput(plan, progress) {
      events.push('mutate');
      const add = (kind: ColorSystemHostResourceRefV2['kind'], recipeId: string) => {
        const ref = { kind, id: `${kind}:${resources.size}`, recipeId };
        resources.set(ref.id, {
          id: ref.id,
          kind,
          name: recipeId,
          ownership: {
            ...plan.identity,
            version: COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION,
            transactionId: plan.transactionId,
            systemId: plan.systemId,
            recipeId,
            resourceKind: kind,
          },
          remove: () => host.removeResource(ref),
        });
        observer?.(ref);
        if (kind !== 'page') progress.remember(ref);
      };
      add('page', 'documentation/page');
      for (const item of plan.blueprint.collections) add('collection', item.recipeId);
      for (const item of [...plan.blueprint.primitives, ...plan.blueprint.aliases])
        add('variable', item.recipeId);
      for (const item of plan.blueprint.styles) add('style', item.recipeId);
      for (const item of plan.blueprint.boards) add('frame', item.recipeId);
      add('frame', 'documentation/summary');
      for (const rule of plan.blueprint.documentation.rules)
        add('frame', `documentation/rule/${rule.id}`);
    },
    async verifyOutput(plan, refs) {
      events.push('verify');
      const c = plan.blueprint.counts;
      expect(refs).toHaveLength(c.collections + c.variables + c.styles + c.components + c.frames);
    },
    async removeResource(ref) {
      events.push('remove');
      resources.delete(ref.id);
    },
    async commitUndo() {
      events.push('undo');
    },
  };
  const journalHost: ColorSystemCreateJournalHostV2 = {
    transactionScope: {},
    getRootPluginData: key => data.get(key) ?? '',
    setRootPluginData: (key, value) => {
      if (value) data.set(key, value);
      else data.delete(key);
    },
    getRootPluginDataKeys: () => [...data.keys()],
    getCompletionAcknowledgement: async file => completion.get(file),
    setCompletionAcknowledgement: async (file, value) => {
      events.push('ack');
      completion.set(file, value);
    },
    clearCompletionAcknowledgement: async file => {
      completion.delete(file);
    },
    fingerprintResources: async refs =>
      hash(
        serializeColorSystemInertJsonV1(
          refs.map(ref => ({ ref, owner: resources.get(ref.id)?.ownership }))
        )
      ),
    loadAllPages: async () => {},
    resolveResource: async ref => resources.get(ref.id) ?? null,
  };
  const journal = createColorSystemCreateJournalRuntimeV2(journalHost);
  const dependencies = {
    sessionId: 'synthetic-delivery-session',
    recipe: () => recipe,
    checkSource: async (): Promise<ColorSystemModelFreshCheckV1> => {
      events.push('source-check');
      return {
        status: sourceStatus,
        code: 'synthetic',
        message: 'synthetic source observation',
        sourceModelHash: sourceHash,
      };
    },
    destination: async () => {
      events.push('destination');
      return structuredClone(destination);
    },
    host: () => host,
    journal,
    now: () => time,
    yield: async () => {},
  };
  const session = createColorSystemAuthoredDeliverySessionV1(dependencies);
  return {
    session,
    dependencies,
    host,
    journal,
    journalHost,
    events,
    resources,
    get recipe() {
      return recipe;
    },
    set recipe(value) {
      recipe = value;
    },
    setTime(value: number) {
      time = value;
    },
    setSource(status: typeof sourceStatus, modelHash = sourceHash) {
      sourceStatus = status;
      sourceHash = modelHash;
    },
    setDestination(value: Partial<ColorSystemAuthoredDeliveryDestinationV1>) {
      destination = { ...destination, ...value };
    },
  };
}
function createIntent(reviewHash: string) {
  return {
    reviewHash,
    requestId: 'create-synthetic-authored',
    acknowledgeDestination: true,
    acknowledgeCandidate: true,
    acknowledgeSnapshot: true,
    collisionPolicy: 'cancel' as const,
  };
}
async function prepare(h: ReturnType<typeof harness>, fixture: Fixture) {
  await h.session.prepare(fixture.geometry);
  return h.session.getView().review!;
}

describe('authored delivery review session with actual replay, renderer and journal', () => {
  let fixture: Fixture;
  beforeAll(async () => {
    fixture = await syntheticColorSystemAuthoringDeliveryV1Fixture();
  });
  it('prepares a detached exact review, exports native values, consumes Create and then recovers the same output through a new review', async () => {
    const h = harness(fixture),
      review = await prepare(h, fixture);
    expect(review.sourceKind).toBe('imported-snapshot');
    expect(review.destination.name).toBe('Invented destination');
    expect(review.counts.frames).toBe(5);
    expect(h.session.export(review.reviewHash, 'recipe').text).toBe(
      serializeColorSystemRecipeV1(h.recipe)
    );
    expect(h.session.export(review.reviewHash, 'tokens').text).toContain('0.12345678901234566');
    expect(h.session.export(review.reviewHash, 'css').text).toContain('--');
    expect(h.session.export(review.reviewHash, 'geometry').text).toContain(
      fixture.geometry.applicationsHash
    );
    const created = await h.session.create(createIntent(review.reviewHash));
    expect(created.status, JSON.stringify(created)).toBe('created');
    expect(created.qualified).toBe(false);
    expect(h.session.getView().review).toBeNull();
    expect(h.session.isCreating()).toBe(false);
    const stored = h.journal.authored.read()!;
    expect(stored.transactionId).toMatch(/^teul-authored-create-v1:/);
    expect(stored.recipeHash).toBe(review.recipeHash);
    expect(stored.reviewHash).toBe(review.reviewHash);
    await expect(h.session.create(createIntent(review.reviewHash))).rejects.toThrow(/consumed/);
    const again = await prepare(h, fixture);
    expect(again.reviewHash).not.toBe(review.reviewHash);
    expect((await h.session.create(createIntent(again.reviewHash))).status).toBe(
      'verified-existing-output'
    );
    expect(h.events.filter(event => event === 'mutate')).toHaveLength(1);
    expect(h.events.filter(event => event === 'undo')).toHaveLength(1);
  });
  it('requires every acknowledgement for imported data without calling current-file source authority', async () => {
    const h = harness(fixture),
      review = await prepare(h, fixture);
    for (const key of [
      'acknowledgeDestination',
      'acknowledgeCandidate',
      'acknowledgeSnapshot',
    ] as const) {
      await expect(
        h.session.create({ ...createIntent(review.reviewHash), [key]: false })
      ).rejects.toThrow(/Acknowledge/);
      expect(h.session.getView().review?.reviewHash).toBe(review.reviewHash);
    }
    expect(h.events).not.toContain('source-check');
    expect(h.resources.size).toBe(0);
    expect((await h.session.create(createIntent(review.reviewHash))).status).toBe('created');
    expect(h.events).not.toContain('source-check');
  });
  it('checks a current-file source at prepare and again immediately before Create', async () => {
    const h = harness(fixture, true),
      review = await prepare(h, fixture);
    expect(review.sourceKind).toBe('current-file');
    expect(h.events.filter(event => event === 'source-check')).toHaveLength(1);
    expect(
      (await h.session.create({ ...createIntent(review.reviewHash), acknowledgeSnapshot: false }))
        .status
    ).toBe('created');
    expect(h.events.filter(event => event === 'source-check')).toHaveLength(2);
    expect(h.events.lastIndexOf('source-check')).toBeLessThan(h.events.indexOf('mutate'));
  });
  it.each(['changed', 'unsupported', 'wrong-model'] as const)(
    'blocks %s source after review without creating output',
    async failure => {
      const h = harness(fixture, true),
        review = await prepare(h, fixture);
      h.setSource(
        failure === 'wrong-model' ? 'same' : failure,
        failure === 'wrong-model' ? hash('different model') : h.recipe.source.model.modelHash
      );
      const result = await h.session.create(createIntent(review.reviewHash));
      expect(result.status).toBe('blocked');
      expect(h.resources.size).toBe(0);
      expect(h.journal.getActiveContractKind()).toBeNull();
      expect(h.session.getView().review).toBeNull();
    }
  );
  it.each(['identity', 'profile', 'name', 'read-only'] as const)(
    'blocks changed destination %s at the final fence',
    async change => {
      const h = harness(fixture),
        review = await prepare(h, fixture);
      h.host.loadFonts = async () => {
        h.setDestination(
          change === 'identity'
            ? { currentFileIdentityHash: hash('other') }
            : change === 'profile'
              ? { colorProfile: 'display-p3' }
              : change === 'name'
                ? { name: 'renamed document' }
                : { editable: false }
        );
      };
      expect((await h.session.create(createIntent(review.reviewHash))).status).toBe('blocked');
      expect(h.resources.size).toBe(0);
    }
  );
  it('rejects missing, forged, expired or stale-recipe reviews and cannot import a saved review as authority', async () => {
    const h = harness(fixture);
    await expect(h.session.create(createIntent(hash('posted review')))).rejects.toThrow(/missing/);
    const review = await prepare(h, fixture);
    const other = harness(fixture);
    await expect(other.session.create(createIntent(review.reviewHash))).rejects.toThrow(/missing/);
    h.recipe = parseColorSystemRecipeV1({ ...h.recipe, label: 'New recipe label' });
    await expect(h.session.create(createIntent(review.reviewHash))).rejects.toThrow(
      /recipe changed/
    );
    expect(h.resources.size).toBe(0);
    const current = await prepare(h, fixture);
    h.setTime(current.expiresAt);
    await expect(h.session.create(createIntent(current.reviewHash))).rejects.toThrow(/expired/);
    expect(h.session.getView().review).toBeNull();
    expect(() => h.session.export(current.reviewHash, 'recipe')).toThrow(/missing/);
  });
  it('checks expiry and recipe replacement again after asynchronous font preflight', async () => {
    for (const change of ['expiry', 'recipe']) {
      const h = harness(fixture),
        review = await prepare(h, fixture);
      h.host.loadFonts = async () => {
        if (change === 'expiry') h.setTime(review.expiresAt);
        else
          h.recipe = parseColorSystemRecipeV1({ ...h.recipe, label: 'changed while loading font' });
      };
      expect((await h.session.create(createIntent(review.reviewHash))).status).toBe('blocked');
      expect(h.resources.size).toBe(0);
      expect(h.session.isCreating()).toBe(false);
    }
  });
  it('detaches create intent across awaits and rejects concurrent Create or invalidation', async () => {
    const h = harness(fixture),
      review = await prepare(h, fixture),
      waiting = deferred(),
      entered = deferred();
    h.host.loadFonts = async () => {
      entered.resolve();
      await waiting.promise;
    };
    const intent = createIntent(review.reviewHash);
    const pending = h.session.create(intent);
    await entered.promise;
    expect(h.session.isCreating()).toBe(true);
    intent.requestId = 'caller changed';
    intent.acknowledgeCandidate = false;
    intent.reviewHash = hash('changed');
    await expect(h.session.create(createIntent(review.reviewHash))).rejects.toThrow(/in progress/);
    expect(() => h.session.invalidate()).toThrow(/in progress/);
    waiting.resolve();
    expect((await pending).status).toBe('created');
    expect(h.journal.authored.read()?.requestId).toBe('create-synthetic-authored');
  });
  it('keeps private review and receipt state isolated from returned mutations', async () => {
    const h = harness(fixture),
      review = await prepare(h, fixture);
    const view = h.session.getView();
    (view.review!.destination as { name: string }).name = 'outside mutation';
    (view.review! as { reviewHash: string }).reviewHash = hash('forged');
    expect(h.session.getView().review?.reviewHash).toBe(review.reviewHash);
    expect(h.session.getView().review?.destination.name).toBe('Invented destination');
    const result = await h.session.create(createIntent(review.reviewHash));
    (result as { status: string }).status = 'forged';
    expect(h.session.getView().receipt?.status).toBe('created');
  });
  it('rejects accessor intent before evaluating it or consuming the reviewed delivery', async () => {
    const h = harness(fixture),
      review = await prepare(h, fixture);
    let calls = 0;
    const intent = createIntent(review.reviewHash);
    Object.defineProperty(intent, 'acknowledgeCandidate', {
      enumerable: true,
      get() {
        calls++;
        return true;
      },
    });
    await expect(h.session.create(intent)).rejects.toThrow(/accessors/);
    expect(calls).toBe(0);
    expect(h.session.getView().review?.reviewHash).toBe(review.reviewHash);
    expect(h.resources.size).toBe(0);
  });
  it('cancels or supersedes preparation without a stale review or native mutation', async () => {
    const h = harness(fixture);
    await expect(h.session.prepare(fixture.geometry, () => true)).rejects.toThrow(/cancel/i);
    expect(h.session.getView().review).toBeNull();
    const waiting = deferred(),
      entered = deferred();
    let first = true;
    h.dependencies.yield = async () => {
      if (first) {
        first = false;
        entered.resolve();
        await waiting.promise;
      }
    };
    const stale = h.session.prepare(fixture.geometry);
    await entered.promise;
    await h.session.prepare(fixture.geometry);
    const latest = h.session.getView().review!;
    waiting.resolve();
    await expect(stale).rejects.toThrow(/cancel/i);
    expect(h.session.getView().review?.reviewHash).toBe(latest.reviewHash);
    expect(h.resources.size).toBe(0);
  });
  it('detaches geometry before the first replay yield and invalidates preparation explicitly', async () => {
    const h = harness(fixture),
      waiting = deferred(),
      entered = deferred();
    let first = true;
    h.dependencies.yield = async () => {
      if (first) {
        first = false;
        entered.resolve();
        await waiting.promise;
      }
    };
    const geometry = structuredClone(fixture.geometry);
    const pending = h.session.prepare(geometry);
    await entered.promise;
    (geometry.boards[0] as { width: number }).width += 500;
    waiting.resolve();
    await pending;
    const review = h.session.getView().review!;
    const exported = JSON.parse(h.session.export(review.reviewHash, 'geometry').text);
    expect(exported.boards[0].width).toBe(fixture.geometry.boards[0].width);
    h.session.invalidate();
    expect(h.session.getView().review).toBeNull();
    await expect(h.session.create(createIntent(review.reviewHash))).rejects.toThrow(/missing/);
  });
  it('preserves verified output after acknowledgement failure and resolves it only through a new reviewed request', async () => {
    const h = harness(fixture),
      review = await prepare(h, fixture);
    const write = h.journalHost.setCompletionAcknowledgement;
    h.journalHost.setCompletionAcknowledgement = async () => {
      throw new Error('storage unavailable');
    };
    expect((await h.session.create(createIntent(review.reviewHash))).status).toBe(
      'cleanup-incomplete'
    );
    expect(h.resources.size).toBeGreaterThan(0);
    expect(h.journal.authored.read()?.state).toBe('verified');
    h.journalHost.setCompletionAcknowledgement = write;
    await expect(h.session.create(createIntent(review.reviewHash))).rejects.toThrow(/consumed/);
    const again = await prepare(h, fixture);
    expect((await h.session.create(createIntent(again.reviewHash))).status).toBe(
      'verified-existing-output'
    );
    expect(h.events.filter(event => event === 'mutate')).toHaveLength(1);
  });
});
