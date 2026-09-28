import { beforeAll, describe, expect, it, vi } from 'vitest';
import { syntheticColorSystemAuthoringDeliveryV1Fixture } from '../../lib/__tests__/fixtures/colorSystemAuthoringDeliveryV1Fixture';
import {
  COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1,
  isColorSystemAuthoringResultV1,
} from '../../lib/colorSystemAuthoringBridgeV1';
import { readColorSystemAuthoringViewV1 } from '../../lib/colorSystemAuthoringViewV1';
import { deterministicContentHash as hash } from '../../lib/colorSystemHashing';
import { serializeColorSystemInertJsonV1 } from '../../lib/colorSystemInertJsonV1';
import {
  parseColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
} from '../../lib/colorSystemRecipeV1';
import { utf8ByteLength } from '../../lib/utf8';
import type {
  ColorSystemAuthoringActionV1,
  ColorSystemAuthoringResultV1,
} from '../../types/colorSystemAuthoringMessagesV1';
import { createColorSystemAuthoringControllerV1 } from '../colorSystemAuthoringControllerV1';
import type { ColorSystemAuthoredDeliveryDestinationV1 } from '../colorSystemAuthoredDeliverySessionV1';
import type { ColorSystemAuthoredRendererHostV1 } from '../colorSystemAuthoredRendererV1';
import {
  createColorSystemCreateJournalRuntimeV2,
  type ColorSystemCreateJournalHostV2,
  type ColorSystemCreateJournalResolvedResourceV2,
} from '../colorSystemCreateJournalV2';
import type { ColorSystemModelFreshCheckV1 } from '../colorSystemModelControllerV1';
import { COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION } from '../colorSystemResourceOwnershipV2';
import type { ColorSystemHostResourceRefV2 } from '../colorSystemResourceRendererV2';

type Fixture = Awaited<ReturnType<typeof syntheticColorSystemAuthoringDeliveryV1Fixture>>;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Program-owned fake document; compilation, source gates, storage, session and journal stay real. */
function harness(fixture: Fixture, currentFile = false, defaultLayout = true) {
  const recipe = parseColorSystemRecipeV1({
    ...structuredClone(fixture.recipe),
    source: {
      ...structuredClone(fixture.recipe.source),
      intake: currentFile ? 'current-file' : 'guideline-json',
    },
  });
  let sourceStatus: ColorSystemModelFreshCheckV1['status'] = 'same';
  let destination: ColorSystemAuthoredDeliveryDestinationV1 = {
    name: 'Invented destination',
    currentFileIdentityHash: hash('controller synthetic destination'),
    documentType: 'figma-design',
    colorProfile: 'srgb',
    editable: true,
  };
  let yieldHook = async () => {},
    createHook = async () => {},
    time = 1000;
  const values = new Map<string, unknown>(),
    data = new Map<string, string>(),
    completion = new Map<string, unknown>();
  const resources = new Map<string, ColorSystemCreateJournalResolvedResourceV2>();
  const events: string[] = [],
    messages: ColorSystemAuthoringResultV1[] = [];
  let observer: ((ref: ColorSystemHostResourceRefV2) => void) | null = null;
  const host: ColorSystemAuthoredRendererHostV1 = {
    async getContext() {
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
      await createHook();
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
      expect(refs.every(ref => resources.has(ref.id))).toBe(true);
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
    getCompletionAcknowledgement: async key => completion.get(key),
    setCompletionAcknowledgement: async (key, value) => {
      events.push('ack');
      completion.set(key, value);
    },
    clearCompletionAcknowledgement: async key => {
      completion.delete(key);
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
  const checkSource = vi.fn(async (): Promise<ColorSystemModelFreshCheckV1> => ({
    status: sourceStatus,
    code: 'synthetic',
    message: 'Synthetic source check',
    sourceModelHash: recipe.source.model.modelHash,
  }));
  const defaultGeometry = vi.fn(() => structuredClone(fixture.geometry));
  const setAsync = vi.fn(async (key: string, value: unknown) => {
    values.set(key, structuredClone(value));
  });
  const controller = createColorSystemAuthoringControllerV1({
    clientStorage: {
      keysAsync: async () => [...values.keys()],
      getAsync: async key => structuredClone(values.get(key)),
      setAsync,
      deleteAsync: async key => {
        values.delete(key);
      },
    },
    checkSource,
    yield: () => yieldHook(),
    postMessage: message => {
      messages.push(message);
    },
    ...(defaultLayout ? { defaultGeometry } : {}),
    delivery: {
      sessionId: 'synthetic-controller-session',
      journal,
      host: () => host,
      now: () => time,
      destination: async () => structuredClone(destination),
    },
  });
  let sequence = 0;
  const message = (
    action: ColorSystemAuthoringActionV1,
    body: unknown = {},
    requestId = `delivery:${++sequence}`
  ) => ({
    type: 'color-system-authoring-v1' as const,
    requestId,
    action,
    payloadJson:
      action === 'import' && typeof body === 'string'
        ? body
        : serializeColorSystemInertJsonV1(body),
  });
  const send = async (action: ColorSystemAuthoringActionV1, body: unknown = {}) => {
    const request = message(action, body);
    await controller.handle(request);
    const response = messages.find(item => item.requestId === request.requestId);
    if (!response) throw new Error(`No response for ${request.requestId}`);
    expect(isColorSystemAuthoringResultV1(response)).toBe(true);
    return response;
  };
  return {
    controller,
    messages,
    send,
    message,
    recipe,
    journal,
    completion,
    resources,
    events,
    checkSource,
    defaultGeometry,
    setAsync,
    setYield: (hook: () => Promise<void>) => {
      yieldHook = hook;
    },
    setCreate: (hook: () => Promise<void>) => {
      createHook = hook;
    },
    setSourceStatus: (value: typeof sourceStatus) => {
      sourceStatus = value;
    },
    setDestination: (value: Partial<typeof destination>) => {
      destination = { ...destination, ...value };
    },
    setTime: (value: number) => {
      time = value;
    },
  };
}
type Harness = ReturnType<typeof harness>;
function view(response: ColorSystemAuthoringResultV1) {
  if (!response.success) throw new Error(response.error);
  if (!('dataJson' in response)) throw new Error('Expected a view response.');
  return readColorSystemAuthoringViewV1(response.dataJson);
}
function artifact(response: ColorSystemAuthoringResultV1) {
  if (!response.success) throw new Error(response.error);
  if (!('artifactText' in response)) throw new Error('Expected a scalar artifact.');
  expect(Object.keys(response).sort()).toEqual([
    'artifactText',
    'fileName',
    'requestId',
    'success',
    'type',
  ]);
  return response;
}
function intent(reviewHash: string) {
  return {
    reviewHash,
    acknowledgeDestination: true,
    acknowledgeCandidate: true,
    acknowledgeSnapshot: true,
    collisionPolicy: 'cancel',
  };
}
async function imported(h: Harness) {
  const result = view(await h.send('import', serializeColorSystemRecipeV1(h.recipe)));
  expect(result.status).toBe('ready');
  expect(result.recipe!.applications).toHaveLength(4);
  return result;
}
async function prepared(h: Harness) {
  await imported(h);
  const result = view(await h.send('prepare-delivery'));
  expect(result.status).toBe('delivery-review');
  expect(result.delivery!.review).not.toBeNull();
  return result;
}

describe('authored delivery Controller transport with the actual engine and journal', () => {
  let fixture: Fixture;
  beforeAll(async () => {
    fixture = await syntheticColorSystemAuthoringDeliveryV1Fixture();
  });

  it('prepares actual boards and exports each single raw artifact before acknowledged Create and durable recovery', async () => {
    const h = harness(fixture),
      result = await prepared(h),
      review = result.delivery!.review!;
    expect(review.preview.boards).toHaveLength(4);
    expect(review.destination).toMatchObject({
      name: 'Invented destination',
      documentType: 'figma-design',
      colorProfile: 'srgb',
      editable: true,
    });
    expect(review.counts).toMatchObject({ variables: 19, styles: 8, frames: 5, pages: 1 });
    expect(h.defaultGeometry).toHaveBeenCalledOnce();
    expect(h.defaultGeometry.mock.calls[0]).toHaveLength(1);
    for (const [format, fileName] of [
      ['recipe', 'teul-authored.recipe.json'],
      ['tokens', 'teul-authored.tokens.json'],
      ['css', 'teul-authored.css'],
      ['geometry', 'teul-authored.geometry.json'],
    ]) {
      const output = artifact(
        await h.send('export-delivery', { reviewHash: review.reviewHash, format })
      );
      expect(output.fileName).toBe(fileName);
      expect(utf8ByteLength(output.artifactText)).toBeLessThanOrEqual(
        COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1
      );
      if (format === 'recipe')
        expect(output.artifactText).toBe(serializeColorSystemRecipeV1(h.recipe));
      if (format === 'geometry')
        expect(output.artifactText).toContain(fixture.geometry.applicationsHash);
    }
    expect(h.events).not.toContain('mutate');
    expect(h.checkSource).not.toHaveBeenCalled();
    const created = view(await h.send('create-delivery', intent(review.reviewHash)));
    expect(created.status).toBe('created');
    expect(created.delivery!.review).toBeNull();
    expect(created.delivery!.receipt).toMatchObject({ status: 'created', qualified: false });
    expect(h.events.slice(-3)).toEqual(['verify', 'undo', 'ack']);
    expect(h.journal.authored.read()).toMatchObject({
      reviewHash: review.reviewHash,
      recipeHash: review.recipeHash,
      state: 'verified',
    });
    expect(h.completion.size).toBe(1);
    expect(h.setAsync).not.toHaveBeenCalled();
    expect(await h.send('create-delivery', intent(review.reviewHash))).toMatchObject({
      success: false,
    });
    const again = view(await h.send('prepare-delivery')).delivery!.review!;
    expect(again.reviewHash).not.toBe(review.reviewHash);
    expect(view(await h.send('create-delivery', intent(again.reviewHash))).status).toBe(
      'verified-existing-output'
    );
    expect(h.events.filter(event => event === 'mutate')).toHaveLength(1);
  });

  it('requires all imported-snapshot acknowledgements and exact action fields without consuming review on rejection', async () => {
    const h = harness(fixture),
      review = (await prepared(h)).delivery!.review!;
    for (const field of ['acknowledgeDestination', 'acknowledgeCandidate', 'acknowledgeSnapshot']) {
      expect(
        await h.send('create-delivery', { ...intent(review.reviewHash), [field]: false })
      ).toMatchObject({ success: false });
      expect(h.controller.getView().delivery!.review?.reviewHash).toBe(review.reviewHash);
    }
    for (const body of [
      { ...intent(review.reviewHash), trusted: true },
      { ...intent(review.reviewHash), acknowledgeCandidate: 'true' },
    ])
      expect(await h.send('create-delivery', body)).toMatchObject({ success: false });
    expect(h.resources.size).toBe(0);
    expect(view(await h.send('create-delivery', intent(review.reviewHash))).status).toBe('created');
  });

  it('retains review after invalid copy names and creates a 160-character native copy', async () => {
    const h = harness(fixture);
    const review = (await prepared(h)).delivery!.review!;
    for (const copyName of ['N'.repeat(161), ' copy', 'copy ', 'copy\nname', 'copy\u007fname']) {
      expect(
        await h.send('create-delivery', {
          ...intent(review.reviewHash),
          collisionPolicy: 'create-copy',
          copyName,
        })
      ).toMatchObject({ success: false });
      expect(h.controller.getView().delivery!.review?.reviewHash).toBe(review.reviewHash);
      expect(h.resources.size).toBe(0);
    }
    const copyName = 'N'.repeat(160);
    const created = view(
      await h.send('create-delivery', {
        ...intent(review.reviewHash),
        collisionPolicy: 'create-copy',
        copyName,
      })
    );
    expect(created.status).toBe('created');
    expect(h.journal.authored.read()).toMatchObject({
      outputName: copyName,
      outputPageName: `${copyName} — Authored Color System`,
      state: 'verified',
    });
  });

  it('requires supported explicit geometry when no default adapter exists, and validates custom geometry', async () => {
    const h = harness(fixture, false, false);
    await imported(h);
    expect(await h.send('prepare-delivery')).toMatchObject({
      success: false,
      error: expect.stringMatching(/supported application layout/),
    });
    expect(
      await h.send('prepare-delivery', {
        geometry: { ...fixture.geometry, modelHash: hash('wrong model') },
      })
    ).toMatchObject({ success: false });
    const result = view(await h.send('prepare-delivery', { geometry: fixture.geometry }));
    expect(result.delivery!.review!.preview.boards).toHaveLength(4);
    expect(h.defaultGeometry).not.toHaveBeenCalled();
  });

  it('invalidates review on recipe locks and exact source replacement, retaining the selected recipe', async () => {
    const h = harness(fixture),
      before = await prepared(h),
      review = before.delivery!.review!;
    const locked = view(await h.send('lock', { kind: 'family', id: 'pigments' }));
    expect(locked.delivery!.review).toBeNull();
    expect(locked.recipe!.recipeHash).not.toBe(before.recipe!.recipeHash);
    expect(await h.send('create-delivery', intent(review.reviewHash))).toMatchObject({
      success: false,
    });
    const fresh = view(await h.send('prepare-delivery')).delivery!.review!;
    h.controller.setSource({ ...h.recipe.source, currentFileReadScopeJson: '{}' });
    expect(h.controller.getView().delivery!.review).toBeNull();
    expect(h.controller.getView().recipe!.recipeHash).toBe(locked.recipe!.recipeHash);
    expect(
      await h.send('export-delivery', { reviewHash: fresh.reviewHash, format: 'css' })
    ).toMatchObject({ success: false });
    expect(await h.send('prepare-delivery')).toMatchObject({ success: false });
    expect(h.resources.size).toBe(0);
  });

  it('checks live source at prepare and final fence, while imported snapshots need no runtime claim', async () => {
    const h = harness(fixture, true),
      review = (await prepared(h)).delivery!.review!;
    expect(review.sourceKind).toBe('current-file');
    expect(h.checkSource).toHaveBeenCalledOnce();
    h.setSourceStatus('changed');
    const blocked = view(
      await h.send('create-delivery', { ...intent(review.reviewHash), acknowledgeSnapshot: false })
    );
    expect(blocked.status).toBe('blocked');
    expect(h.checkSource).toHaveBeenCalledTimes(2);
    expect(h.resources.size).toBe(0);
  });

  it.each([{ colorProfile: 'display-p3' }, { documentType: 'figjam' }, { editable: false }])(
    'retains actual unsupported destination facts and fails closed: %j',
    async destination => {
      const h = harness(fixture);
      h.setDestination(destination);
      const review = (await prepared(h)).delivery!.review!;
      expect(review.destination).toMatchObject(destination);
      expect(view(await h.send('create-delivery', intent(review.reviewHash))).status).toBe(
        'blocked'
      );
      expect(h.resources.size).toBe(0);
    }
  );

  it('rejects expired reviews and changed destination identity without starting output', async () => {
    const h = harness(fixture),
      review = (await prepared(h)).delivery!.review!;
    h.setTime(review.expiresAt);
    expect(await h.send('create-delivery', intent(review.reviewHash))).toMatchObject({
      success: false,
    });
    const again = view(await h.send('prepare-delivery')).delivery!.review!;
    h.setDestination({ currentFileIdentityHash: hash('replacement destination') });
    expect(view(await h.send('create-delivery', intent(again.reviewHash))).status).toBe('blocked');
    expect(h.resources.size).toBe(0);
  });

  it.each(['cancel', 'replacement'] as const)(
    'suppresses unfinished preparation after %s and keeps the exact selection',
    async kind => {
      const h = harness(fixture),
        initial = await imported(h),
        entered = deferred(),
        resume = deferred();
      h.setYield(async () => {
        entered.resolve();
        await resume.promise;
      });
      const request = h.message('prepare-delivery');
      const running = h.controller.handle(request);
      await entered.promise;
      expect(h.controller.getView().delivery!.review).toBeNull();
      if (kind === 'cancel')
        await h.controller.handle({
          type: 'cancel-color-system-authoring-v1',
          requestId: 'cancel:delivery',
          targetRequestId: request.requestId,
        });
      else
        expect(view(await h.send('inspect')).recipe!.recipeHash).toBe(initial.recipe!.recipeHash);
      resume.resolve();
      await running;
      expect(h.messages.some(message => message.requestId === request.requestId)).toBe(false);
      expect(h.controller.getView().delivery!.review).toBeNull();
      expect(h.controller.getView().recipe!.recipeHash).toBe(initial.recipe!.recipeHash);
      expect(h.resources.size).toBe(0);
    }
  );

  it('retains the original Create response while rejecting concurrent edits, repeated Create and source replacement', async () => {
    const h = harness(fixture),
      review = (await prepared(h)).delivery!.review!,
      entered = deferred(),
      resume = deferred();
    h.setCreate(async () => {
      entered.resolve();
      await resume.promise;
    });
    const request = h.message('create-delivery', intent(review.reviewHash));
    const running = h.controller.handle(request);
    await entered.promise;
    expect(h.controller.getView().delivery!.creating).toBe(true);
    for (const action of ['create-delivery', 'new', 'inspect', 'import'] as const)
      expect(
        await h.send(
          action,
          action === 'import' ? serializeColorSystemRecipeV1(h.recipe) : intent(review.reviewHash)
        )
      ).toMatchObject({ success: false, code: 'CREATE_IN_PROGRESS' });
    expect(() => h.controller.setSource(h.recipe.source)).toThrow(/Create/);
    await h.controller.handle({
      type: 'cancel-color-system-authoring-v1',
      requestId: 'cancel:create',
      targetRequestId: request.requestId,
    });
    resume.resolve();
    await running;
    const result = h.messages.find(message => message.requestId === request.requestId)!;
    expect(view(result).status).toBe('created');
    expect(h.events.filter(event => event === 'mutate')).toHaveLength(1);
    expect(h.controller.getView().delivery!.creating).toBe(false);
  });

  it('detaches returned view and submitted geometry before async compilation', async () => {
    const h = harness(fixture),
      preparedView = await prepared(h),
      review = preparedView.delivery!.review!;
    const detached = h.controller.getView();
    (detached.delivery!.review!.destination as { name: string }).name = 'forged destination';
    expect(view(await h.send('inspect')).delivery!.review!.destination.name).toBe(
      'Invented destination'
    );
    expect(
      artifact(await h.send('export-delivery', { reviewHash: review.reviewHash, format: 'recipe' }))
        .artifactText
    ).toBe(serializeColorSystemRecipeV1(h.recipe));
    const entered = deferred(),
      resume = deferred();
    h.setYield(async () => {
      entered.resolve();
      await resume.promise;
    });
    const request = h.message('prepare-delivery', { geometry: fixture.geometry });
    const running = h.controller.handle(request);
    await entered.promise;
    request.payloadJson = '{}';
    resume.resolve();
    await running;
    const result = view(h.messages.find(message => message.requestId === request.requestId)!);
    expect(result.delivery!.review!.preview.boards).toHaveLength(4);
  });

  it('rejects active or external SVG content while preserving hostile labels as inert text', async () => {
    const h = harness(fixture),
      actual = await prepared(h);
    const hostile = [
      '<script>alert(1)</script>',
      '<image href="https://example.invalid/a.svg"></image>',
      '<foreignObject>test</foreignObject>',
      '<path d="M0 0 L1 1 Z" fill="url(https://example.invalid)" fill-rule="evenodd"></path>',
      '<path d="M0 0 L1 1 Z" fill="#FFFFFF" fill-rule="evenodd" onclick="alert(1)"></path>',
    ];
    for (const payload of hostile) {
      const altered = JSON.parse(JSON.stringify(actual));
      altered.delivery.review.preview.boards[0].svg =
        altered.delivery.review.preview.boards[0].svg.replace('</svg>', `${payload}</svg>`);
      expect(() => readColorSystemAuthoringViewV1(JSON.stringify(altered))).toThrow(
        /unsupported authoring view/
      );
    }
    const label = '</title><script>alert(1)</script> https://example.invalid';
    const altered = JSON.parse(JSON.stringify(actual));
    altered.delivery.review.preview.boards[0].name = label;
    expect(
      readColorSystemAuthoringViewV1(JSON.stringify(altered)).delivery!.review!.preview.boards[0]
        .name
    ).toBe(label);
  });

  it('keeps artifact bytes bounded before JSON nesting and rejects mixed variants, paths and accessors', () => {
    const maximum = COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1;
    const body = '"\\'.repeat((maximum - 4) / 2) + '😀';
    expect(utf8ByteLength(body)).toBe(maximum);
    expect(utf8ByteLength(JSON.stringify({ artifactText: body }))).toBeGreaterThan(maximum);
    const result = {
      type: 'color-system-authoring-result-v1',
      requestId: 'artifact:boundary',
      success: true,
      artifactText: body,
      fileName: 'teul-authored.tokens.json',
    };
    expect(isColorSystemAuthoringResultV1(result)).toBe(true);
    expect(isColorSystemAuthoringResultV1({ ...result, artifactText: body + 'x' })).toBe(false);
    expect(isColorSystemAuthoringResultV1({ ...result, dataJson: '{}' })).toBe(false);
    expect(
      isColorSystemAuthoringResultV1({ ...result, fileName: '../teul-authored.tokens.json' })
    ).toBe(false);
    for (const field of Object.keys(result)) {
      const getter = vi.fn(() => {
        throw new Error('Must remain inert');
      });
      const hostile = Object.defineProperty({ ...result }, field, {
        enumerable: true,
        get: getter,
      });
      expect(isColorSystemAuthoringResultV1(hostile)).toBe(false);
      expect(getter).not.toHaveBeenCalled();
    }
  });
});
