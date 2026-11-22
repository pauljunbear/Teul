import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createColorSystemAuthoringControllerV1 } from '../colorSystemAuthoringControllerV1';
import { syntheticColorSystemAuthoringRefinementFixtureV1 as authoringRefinementFixture } from '../../lib/__tests__/fixtures/colorSystemAuthoringRefinementV1Fixture';
import {
  readColorSystemRecipeJsonV1,
  serializeColorSystemRecipeV1,
  type ColorSystemRecipeV1,
} from '../../lib/colorSystemRecipeV1';
import {
  COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1,
  isColorSystemAuthoringResultV1,
} from '../../lib/colorSystemAuthoringBridgeV1';
import { readColorSystemAuthoringViewV1 } from '../../lib/colorSystemAuthoringViewV1';
import { serializeColorSystemInertJsonV1 } from '../../lib/colorSystemInertJsonV1';
import { buildColorSystemModelV1 } from '../../lib/colorSystemModelV1';
import { deterministicContentHash } from '../../lib/colorSystemHashing';
import { utf8ByteLength } from '../../lib/utf8';
import type {
  ColorSystemAuthoringActionV1,
  ColorSystemAuthoringResultV1,
} from '../../types/colorSystemAuthoringMessagesV1';
import type {
  ColorSystemAuthoringCatalogViewV1,
  ColorSystemAuthoringViewV1,
} from '../../types/colorSystemAuthoringViewV1';

let fixture: Awaited<ReturnType<typeof authoringRefinementFixture>>;
beforeAll(async () => {
  fixture = await authoringRefinementFixture();
});

function harness() {
  const values = new Map<string, unknown>();
  const setAsync = vi.fn(async (key: string, value: unknown) => {
    values.set(key, structuredClone(value));
  });
  const deleteAsync = vi.fn(async (key: string) => {
    values.delete(key);
  });
  const checkSource = vi.fn(async () => {
    throw new Error('Refinement must not grant runtime freshness.');
  });
  let yieldHook = async () => {};
  const messages: ColorSystemAuthoringResultV1[] = [];
  const controller = createColorSystemAuthoringControllerV1({
    clientStorage: {
      keysAsync: async () => [...values.keys()],
      getAsync: async key => structuredClone(values.get(key)),
      setAsync,
      deleteAsync,
    },
    checkSource,
    yield: () => yieldHook(),
    postMessage: message => {
      messages.push(message);
    },
  });
  let sequence = 0;
  const message = (action: ColorSystemAuthoringActionV1, body: unknown, requestId: string) => ({
    type: 'color-system-authoring-v1' as const,
    requestId,
    action,
    payloadJson:
      action === 'import' && typeof body === 'string'
        ? body
        : serializeColorSystemInertJsonV1(body),
  });
  const send = async (action: ColorSystemAuthoringActionV1, body: unknown = {}) => {
    const requestId = `refine:${++sequence}`;
    await controller.handle(message(action, body, requestId));
    const response = messages.find(item => item.requestId === requestId);
    if (!response) throw new Error(`Missing response for ${requestId}.`);
    expect(isColorSystemAuthoringResultV1(response)).toBe(true);
    return response;
  };
  return {
    controller,
    messages,
    setAsync,
    deleteAsync,
    checkSource,
    send,
    message,
    setYield: (hook: () => Promise<void>) => {
      yieldHook = hook;
    },
  };
}
type Harness = ReturnType<typeof harness>;
function view(response: ColorSystemAuthoringResultV1): ColorSystemAuthoringViewV1 {
  if (!response.success) throw new Error(response.error);
  if (!('dataJson' in response)) throw new Error('Expected a bounded authoring view.');
  return readColorSystemAuthoringViewV1(response.dataJson);
}
function raw(response: ColorSystemAuthoringResultV1): string {
  if (!response.success) throw new Error(response.error);
  if (!('exportJson' in response)) throw new Error('Expected exact raw export.');
  expect(Object.keys(response).sort()).toEqual(['exportJson', 'requestId', 'success', 'type']);
  return response.exportJson;
}
function recipe(json: string): ColorSystemRecipeV1 {
  const read = readColorSystemRecipeJsonV1(json);
  if (read.status !== 'supported') throw new Error('Expected supported synthetic recipe.');
  return read.recipe;
}
async function imported(test: Harness) {
  const result = view(await test.send('import', serializeColorSystemRecipeV1(fixture.recipe)));
  expect(result.status).toBe('ready');
  expect(result.recipe!.applications).toHaveLength(2);
  expect(result.refinement!.catalogs.map(item => item.id)).toEqual(['accent']);
  expect(result.refinement!.roles.map(item => item.id)).toEqual(['rule:control']);
  return result;
}
async function discover(test: Harness, current: ColorSystemAuthoringViewV1) {
  const result = view(
    await test.send('inspect', {
      kind: 'catalog',
      request: {
        recipeHash: current.recipe!.recipeHash,
        fragmentId: 'accent',
        provider: 'wada',
      },
    })
  );
  expect(result.catalog!.candidates.length).toBeGreaterThan(1);
  expect(result.catalog!.candidates.every(item => item.label.startsWith('Wada combination'))).toBe(
    true
  );
  return result.catalog!;
}
function selection(found: ColorSystemAuthoringCatalogViewV1) {
  const candidate = found.candidates[0];
  return {
    ...found.request,
    discoveryHash: found.discoveryHash,
    candidateId: candidate.id,
    candidateHash: candidate.hash,
    mappings: found.references.map(reference => {
      const target = candidate.targets.find(item => item.kind === reference.kind)!;
      return { kind: reference.kind, fromId: reference.id, toId: target.id };
    }),
  };
}
function roleRequest(current: ColorSystemAuthoringViewV1, memberId = 'blue-deep') {
  const original = current.refinement!.roles[0];
  return {
    recipeHash: current.recipe!.recipeHash,
    fragmentId: original.fragmentId,
    ruleId: original.id,
    contextIds: original.contextIds,
    modeIds: original.modeIds,
    members: [{ kind: 'color', id: memberId }],
  };
}
function reviewRequest(current: ColorSystemAuthoringViewV1) {
  return {
    kind: 'review',
    proposalHash: current.pendingReview!.proposalHash,
    ruleIds: current.pendingReview!.rules.map(rule => rule.id),
  };
}

describe('authoring refinement controller with actual recipes, providers and engine', () => {
  it('replaces an accent using explicit identities while retaining an unrelated locked family and exact acceptance', async () => {
    const test = harness();
    await imported(test);
    const locked = view(await test.send('lock', { kind: 'family', id: 'pigments' }));
    expect(locked.recipe!.families.find(item => item.id === 'pigments')!.locked).toBe(true);
    const before = recipe(raw(await test.send('export')));
    const found = await discover(test, locked);
    expect(found.references.map(item => item.kind).sort()).toEqual(['color', 'family']);
    const request = selection(found);
    const changed = view(await test.send('analyze', { kind: 'catalog', request }));
    expect(changed.status).toBe('ready');
    expect(changed.pendingReview).toBeNull();
    expect(changed.catalog).toBeNull();
    expect(changed.recipe!.recipeHash).not.toBe(locked.recipe!.recipeHash);
    const after = recipe(raw(await test.send('export')));
    expect(after.locks).toEqual(before.locks);
    expect(after.source).toEqual(before.source);
    expect(after.selection!.model.adoptions).toEqual(before.selection!.model.adoptions);
    for (const mode of ['Day', 'Night']) {
      expect(
        after
          .selection!.applications.find(item => item.modeId === mode)!
          .uses.find(item => item.id === 'accent')!.colorId
      ).toBe(request.mappings.find(item => item.kind === 'color')!.toId);
    }
    const beforeGeneration = before.direction.generation,
      afterGeneration = after.direction.generation;
    if (beforeGeneration.kind !== 'overlay' || afterGeneration.kind !== 'overlay')
      throw new Error('Expected overlays.');
    for (const id of ['control', 'policy'])
      expect(afterGeneration.proposal.fragments.find(item => item.id === id)).toEqual(
        beforeGeneration.proposal.fragments.find(item => item.id === id)
      );
    expect(afterGeneration.proposal.brief).toEqual(beforeGeneration.proposal.brief);
    const familyId = request.mappings.find(item => item.kind === 'family')!.toId;
    expect(
      after
        .selection!.model.families.find(item => item.id === familyId)!
        .colorIds.slice()
        .sort()
    ).toEqual(found.candidates[0].colors.map(color => color.id).sort());
    expect(test.checkSource).not.toHaveBeenCalled();
    expect(test.setAsync).not.toHaveBeenCalled();
    expect(test.deleteAsync).not.toHaveBeenCalled();
  });

  it('leaves incomplete catalog mappings blocked without changing selected paints or locks', async () => {
    const test = harness();
    await imported(test);
    const locked = view(await test.send('lock', { kind: 'family', id: 'pigments' }));
    const before = raw(await test.send('export'));
    const found = await discover(test, locked);
    const request = selection(found);
    const blocked = view(
      await test.send('analyze', {
        kind: 'catalog',
        request: { ...request, mappings: request.mappings.filter(item => item.kind !== 'color') },
      })
    );
    expect(blocked.status).toBe('blocked');
    expect(blocked.changes.some(item => item.includes('explicit replacement'))).toBe(true);
    expect(raw(await test.send('export'))).toBe(before);
    expect(blocked.pendingReview).toBeNull();
  });

  it('stages a role edit, requires exact explicit review, and then reassesses the full application', async () => {
    const test = harness();
    const initial = await imported(test);
    const before = raw(await test.send('export'));
    const blocked = view(
      await test.send('analyze', { kind: 'role', request: roleRequest(initial) })
    );
    expect(blocked.status).toBe('blocked');
    expect(blocked.pendingReview!.rules.map(rule => rule.id)).toEqual(['rule:control']);
    expect(blocked.message).toBe(
      'Review the draft rules, then reassess the complete application. The previous selection remains available.'
    );
    expect(raw(await test.send('export'))).toBe(before);
    const invalid = await test.send('analyze', {
      ...reviewRequest(blocked),
      proposalHash: deterministicContentHash('stale draft'),
    });
    expect(invalid.success).toBe(false);
    const reviewed = view(await test.send('analyze', reviewRequest(blocked)));
    expect(reviewed.status).toBe('ready');
    expect(reviewed.pendingReview).toBeNull();
    const after = recipe(raw(await test.send('export')));
    expect(
      after.selection!.model.adoptions.find(item => item.ruleId === 'rule:control')
    ).toMatchObject({
      status: 'accepted',
      actor: { kind: 'user', ref: 'teul:designer' },
      authorityRef: 'teul:explicit-draft-rule-review',
      decisionRef: `proposal:${blocked.pendingReview!.proposalHash}`,
    });
    expect(after.selection!.model.rules.find(item => item.id === 'rule:control')!.operands).toEqual(
      { role: 'control', members: [{ kind: 'color', id: 'blue-deep' }] }
    );
    expect(after.source).toEqual(fixture.recipe.source);
    expect(test.checkSource).not.toHaveBeenCalled();
    expect(test.setAsync).not.toHaveBeenCalled();
  });

  it('keeps an explicitly accepted incompatible role blocking instead of selecting it', async () => {
    const test = harness();
    const initial = await imported(test);
    const before = raw(await test.send('export'));
    const pending = view(
      await test.send('analyze', { kind: 'role', request: roleRequest(initial, 'paper') })
    );
    expect(pending.pendingReview!.rules).toHaveLength(1);
    const reviewed = view(await test.send('analyze', reviewRequest(pending)));
    expect(reviewed.status).toBe('blocked');
    expect(reviewed.pendingReview).toBeNull();
    expect(reviewed.message).toContain('No selectable application was found for this request.');
    for (const mode of ['Day', 'Night'])
      expect(reviewed.message).toContain(
        `app:${mode}:rule:control: A required role is absent or uses an incompatible color.`
      );
    expect(reviewed.message).toContain(
      'A failing source requirement is not permission to waive it.'
    );
    expect(reviewed.message).toContain('Any previous selection remains available.');
    expect(raw(await test.send('export'))).toBe(before);
  });

  it.each(['recipeHash', 'discoveryHash', 'candidateHash'] as const)(
    'rejects a stale %s while preserving the selected recipe',
    async field => {
      const test = harness();
      const initial = await imported(test);
      const before = raw(await test.send('export'));
      const found = await discover(test, initial);
      const request = { ...selection(found), [field]: deterministicContentHash(`stale:${field}`) };
      const response = await test.send('analyze', { kind: 'catalog', request });
      expect(response.success).toBe(false);
      expect(raw(await test.send('export'))).toBe(before);
      expect(view(await test.send('inspect')).pendingReview).toBeNull();
    }
  );

  it('rejects a formerly valid discovery after a later lock changes the recipe identity', async () => {
    const test = harness();
    const initial = await imported(test);
    const found = await discover(test, initial);
    const locked = view(await test.send('lock', { kind: 'family', id: 'pigments' }));
    expect(locked.recipe!.recipeHash).not.toBe(found.recipeHash);
    const before = raw(await test.send('export'));
    expect(
      (await test.send('analyze', { kind: 'catalog', request: selection(found) })).success
    ).toBe(false);
    expect(raw(await test.send('export'))).toBe(before);
  });

  it.each(['native-model', 'same-model-intake'] as const)(
    'does not apply a catalog selection after source %s changes',
    async change => {
      const test = harness();
      const initial = await imported(test);
      const found = await discover(test, initial);
      const before = raw(await test.send('export'));
      const { modelHash: _hash, ...input } = fixture.source;
      const model = buildColorSystemModelV1({
        ...input,
        sources: input.sources.map(item => ({ ...item, label: `${item.label} changed` })),
      });
      const changed =
        change === 'native-model'
          ? { ...fixture.recipe.source, model }
          : { ...fixture.recipe.source, intake: 'current-file' as const };
      if (change === 'same-model-intake')
        expect(changed.model.modelHash).toBe(fixture.source.modelHash);
      test.controller.setSource(changed);
      const result = view(
        await test.send('analyze', { kind: 'catalog', request: selection(found) })
      );
      expect(result.status).toBe('changed');
      expect(result.refinement).toBeNull();
      expect(result.catalog).toBeNull();
      expect(raw(await test.send('export'))).toBe(before);
    }
  );

  it.each(['inspect', 'analyze'] as const)(
    'cancels actual catalog %s work without replacing the selected recipe',
    async action => {
      const test = harness();
      const initial = await imported(test);
      const found = await discover(test, initial);
      const before = raw(await test.send('export'));
      const requestId = `cancelled:${action}`;
      const cancelled = vi.fn(async () => {
        await test.controller.handle({
          type: 'cancel-color-system-authoring-v1',
          requestId: 'cancel:catalog',
          targetRequestId: requestId,
        });
      });
      test.setYield(cancelled);
      const body =
        action === 'inspect'
          ? { kind: 'catalog', request: found.request }
          : { kind: 'catalog', request: selection(found) };
      await test.controller.handle(test.message(action, body, requestId));
      expect(cancelled).toHaveBeenCalled();
      expect(test.messages.some(item => item.requestId === requestId)).toBe(false);
      test.setYield(async () => {});
      expect(raw(await test.send('export'))).toBe(before);
      expect(view(await test.send('inspect')).pendingReview).toBeNull();
    }
  );

  it('imports and exports exact 8 MiB unknown raw JSON with escaping that exceeded the former envelope cap', async () => {
    const test = harness();
    const empty = { schemaVersion: 'future.recipe.v9', payload: '' };
    const count = Math.floor(
      (COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1 - utf8ByteLength(JSON.stringify(empty))) / 4
    );
    const content = JSON.stringify({ ...empty, payload: '\\"'.repeat(count) });
    const json =
      content + '\n'.repeat(COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1 - utf8ByteLength(content));
    expect(utf8ByteLength(json)).toBe(COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1);
    expect(utf8ByteLength(JSON.stringify({ json }))).toBeGreaterThan(
      COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1
    );
    const result = view(await test.send('import', json));
    expect(result.status).toBe('read-only');
    expect(result.readOnly).toBe(true);
    expect(result.recipe).toBeNull();
    expect(result.refinement).toBeNull();
    expect(raw(await test.send('export'))).toBe(json);
    expect((await test.send('save')).success).toBe(false);
    expect(test.setAsync).not.toHaveBeenCalled();
    expect(test.deleteAsync).not.toHaveBeenCalled();
    expect(test.checkSource).not.toHaveBeenCalled();
  });
});
