import { beforeAll, describe, expect, it, vi } from 'vitest';
import { syntheticColorSystemAuthoringDeliveryV1Fixture } from '../../lib/__tests__/fixtures/colorSystemAuthoringDeliveryV1Fixture';
import {
  compileColorSystemAuthoredDeliveryV1,
  type ColorSystemAuthoredDeliveryCaptureV1,
} from '../../lib/colorSystemAuthoringDeliveryV1';
import { deterministicContentHash as hash } from '../../lib/colorSystemHashing';
import { serializeColorSystemInertJsonV1 } from '../../lib/colorSystemInertJsonV1';
import {
  colorSystemAuthoredDeliveryIdentityV1,
  colorSystemAuthoredOutputNamesV1,
  renderColorSystemAuthoredDeliveryV1,
  type ColorSystemAuthoredRendererHostV1,
  type ColorSystemAuthoredRenderOptionsV1,
  type ColorSystemAuthoredRenderPlanV1,
} from '../colorSystemAuthoredRendererV1';
import {
  createColorSystemCreateJournalRuntimeV2,
  createFigmaColorSystemCreateJournalHostV2,
  type ColorSystemCreateJournalHostV2,
  type ColorSystemCreateJournalResolvedResourceV2,
} from '../colorSystemCreateJournalV2';
import { COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION } from '../colorSystemResourceOwnershipV2';
import type { ColorSystemHostResourceRefV2 } from '../colorSystemResourceRendererV2';
import { createColorSystemAuthoredFigmaHostV1 } from '../colorSystemAuthoredFigmaHostV1';
import { createInMemoryAuthoredFigmaPluginApiV1 } from './helpers/inMemoryAuthoredFigmaPluginApiV1';

const FILE = hash('synthetic native destination');
const resourceCount = (capture: ColorSystemAuthoredDeliveryCaptureV1) => {
  const c = capture.blueprint.counts;
  return c.collections + c.variables + c.styles + c.components + c.frames + c.pages;
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}
function harness(capture: ColorSystemAuthoredDeliveryCaptureV1) {
  const events: string[] = [];
  const data = new Map<string, string>();
  const completion = new Map<string, unknown>();
  const resources = new Map<string, ColorSystemCreateJournalResolvedResourceV2>();
  const names = new Set<string>();
  const plans: ColorSystemAuthoredRenderPlanV1[] = [];
  let observer: ((ref: ColorSystemHostResourceRefV2) => void) | null = null;
  let failure: '' | 'create' | 'verify' | 'undo' | 'ack' | 'remove' = '';
  const context: Awaited<ReturnType<ColorSystemAuthoredRendererHostV1['getContext']>> = {
    documentType: 'figma-design',
    editable: true,
    colorProfile: 'srgb',
    currentFileIdentityHash: FILE,
    geometryVectors: true,
    capabilities: {
      colorVariables: true,
      variableAliases: true,
      variableBoundPaintStyles: true,
      components: true,
      frames: true,
    },
  };
  const host: ColorSystemAuthoredRendererHostV1 = {
    async getContext() {
      events.push('context');
      return structuredClone(context);
    },
    async findNameCollisions(requested) {
      events.push('collisions');
      return requested.filter(name => names.has(name));
    },
    async loadFonts() {
      events.push('fonts');
    },
    setCreatedResourceObserver(next) {
      observer = next;
    },
    async createOutput(plan, progress) {
      plans.push(plan);
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
      add('page', 'page');
      if (failure === 'create') throw new Error('create failed after page');
      for (const collection of plan.blueprint.collections) add('collection', collection.recipeId);
      progress.setPhase('primitive-variables');
      for (const item of plan.blueprint.primitives) add('variable', item.recipeId);
      progress.setPhase('alias-variables');
      for (const item of plan.blueprint.aliases) add('variable', item.recipeId);
      progress.setPhase('styles');
      for (const item of plan.blueprint.styles) add('style', item.recipeId);
      progress.setPhase('frames');
      for (const item of plan.blueprint.boards) add('frame', item.recipeId);
      add('frame', 'documentation/summary');
      for (const rule of plan.blueprint.documentation.rules)
        add('frame', `documentation/rule/${rule.id}`);
      for (const name of colorSystemAuthoredOutputNamesV1(plan.blueprint, plan.outputName))
        names.add(name);
    },
    async verifyOutput(plan, refs) {
      events.push('verify');
      if (failure === 'verify') throw new Error('readback mismatch');
      expect(refs).toHaveLength(
        plan.blueprint.counts.collections +
          plan.blueprint.counts.variables +
          plan.blueprint.counts.styles +
          plan.blueprint.counts.components +
          plan.blueprint.counts.frames
      );
    },
    async removeResource(ref) {
      events.push(`remove:${ref.kind}`);
      if (failure === 'remove') throw new Error('remove failed');
      resources.delete(ref.id);
    },
    async commitUndo() {
      events.push('undo');
      if (failure === 'undo') throw new Error('undo failed');
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
      if (failure === 'ack') throw new Error('ack failed');
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
  const { systemId: _systemId, ...identity } = colorSystemAuthoredDeliveryIdentityV1(capture);
  const createAuthorizationHash = hash('synthetic authorization');
  const options: ColorSystemAuthoredRenderOptionsV1 = {
    transactionId: `teul-authored-create-v1:${createAuthorizationHash.slice(7)}`,
    requestId: 'synthetic-render',
    sessionId: 'synthetic-session',
    currentFileIdentityHash: FILE,
    currentFileAcknowledged: true,
    collisionPolicy: 'cancel',
    identity: {
      ...identity,
      reviewHash: hash('review'),
      approvalHash: hash('approval'),
      createAuthorizationHash,
    },
    journal,
    finalMutationFence: async () => {
      events.push('fence');
    },
  };
  return {
    host,
    context,
    events,
    resources,
    names,
    plans,
    journal,
    journalHost,
    options,
    data,
    setFailure(value: typeof failure) {
      failure = value;
    },
  };
}

function nativeHarness(capture: ColorSystemAuthoredDeliveryCaptureV1) {
  const { figma, document } = createInMemoryAuthoredFigmaPluginApiV1();
  const host = createColorSystemAuthoredFigmaHostV1(figma, FILE);
  const journalHost = createFigmaColorSystemCreateJournalHostV2(figma);
  const journal = createColorSystemCreateJournalRuntimeV2(journalHost);
  const { systemId, ...identity } = colorSystemAuthoredDeliveryIdentityV1(capture);
  const createAuthorizationHash = hash('synthetic native authorization');
  const options: ColorSystemAuthoredRenderOptionsV1 = {
    transactionId: `teul-authored-create-v1:${createAuthorizationHash.slice(7)}`,
    requestId: 'synthetic-native-render',
    sessionId: 'synthetic-native-session',
    currentFileIdentityHash: FILE,
    currentFileAcknowledged: true,
    collisionPolicy: 'cancel',
    identity: {
      ...identity,
      reviewHash: hash('review'),
      approvalHash: hash('approval'),
      createAuthorizationHash,
    },
    journal,
    finalMutationFence: async () => {},
  };
  const plan: ColorSystemAuthoredRenderPlanV1 = {
    transactionId: options.transactionId,
    action: 'create-new',
    outputName: capture.blueprint.name,
    systemId,
    identity: options.identity,
    blueprint: capture.blueprint,
  };
  const verify = host.verifyOutput.bind(host);
  const verification = vi.spyOn(host, 'verifyOutput');
  const persistAcknowledgement = figma.clientStorage.setAsync.bind(figma.clientStorage);
  const acknowledgement = vi.spyOn(figma.clientStorage, 'setAsync');
  return {
    figma,
    document,
    host,
    journalHost,
    journal,
    options,
    plan,
    verify,
    verification,
    persistAcknowledgement,
    acknowledgement,
  };
}

describe('authored renderer with actual compiled synthetic delivery and durable transaction', () => {
  let capture: ColorSystemAuthoredDeliveryCaptureV1;
  let fixture: Awaited<ReturnType<typeof syntheticColorSystemAuthoringDeliveryV1Fixture>>;
  beforeAll(async () => {
    fixture = await syntheticColorSystemAuthoringDeliveryV1Fixture({ applicationCount: 8 });
    capture = await compileColorSystemAuthoredDeliveryV1(fixture.recipe, fixture.geometry, {
      isCancelled: () => false,
      yield: async () => {},
    });
  });
  it('materializes sparse four-mode domains with exact identity and truthful counts, then recovers identical output', async () => {
    const h = harness(capture);
    const created = await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options);
    expect(created.status, JSON.stringify(created)).toBe('created');
    expect(created.qualified).toBe(false);
    expect(h.plans).toHaveLength(1);
    const stored = h.journal.authored.read()!;
    expect(stored.expectedCounts.collections).toBe(capture.blueprint.collections.length);
    expect(stored.expectedCounts.frames).toBe(9);
    expect(stored.expectedCounts.collections).toBeGreaterThan(2);
    expect(stored.resources).toHaveLength(resourceCount(capture));
    expect(stored).toMatchObject({ ...h.options.identity });
    expect(JSON.stringify(stored)).not.toMatch(/sectionBlueprintHash|strategySetHash/);
    const sparse = h.plans[0].blueprint.primitives.find(item => item.colorId === 'sparse-day')!;
    expect(Object.keys(sparse.valuesByMode)).toEqual(['Day']);
    const native = h.plans[0].blueprint.primitives.find(
      item => item.colorId === 'unused-native-alpha'
    )!.valuesByMode.Day;
    expect(Object.is(native.components.r, -0)).toBe(true);
    expect(native.components.g).toBe(0.12345678901234566);
    expect(h.events.indexOf('fonts')).toBeLessThan(h.events.indexOf('fence'));
    expect(h.events.indexOf('fence')).toBeLessThan(h.events.indexOf('mutate'));
    expect(h.events.lastIndexOf('context')).toBeGreaterThan(h.events.indexOf('fence'));
    expect(h.events.lastIndexOf('context')).toBeLessThan(h.events.indexOf('mutate'));
    expect(h.events.indexOf('verify')).toBeLessThan(h.events.indexOf('undo'));
    expect(h.events.indexOf('undo')).toBeLessThan(h.events.indexOf('ack'));
    const replay = await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options);
    expect(replay.status).toBe('verified-existing-output');
    expect(h.plans).toHaveLength(1);
  });
  it.each(['profile', 'destination', 'editable', 'document', 'vectors', 'variables'] as const)(
    'blocks unsupported initial %s before mutation',
    async kind => {
      const h = harness(capture);
      if (kind === 'profile') h.context.colorProfile = 'display-p3';
      if (kind === 'destination') h.context.currentFileIdentityHash = hash('other file');
      if (kind === 'editable') h.context.editable = false;
      if (kind === 'document') h.context.documentType = 'figjam';
      if (kind === 'vectors') h.context.geometryVectors = false;
      if (kind === 'variables') h.context.capabilities.colorVariables = false;
      expect((await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).status).toBe(
        'blocked'
      );
      expect(h.resources.size).toBe(0);
      expect(h.events).not.toContain('mutate');
    }
  );
  it('blocks missing destination acknowledgement, wrong identity, fonts and a rejected final source fence', async () => {
    for (const reason of ['acknowledgement', 'identity', 'font', 'fence']) {
      const h = harness(capture);
      if (reason === 'acknowledgement') h.options.currentFileAcknowledged = false;
      if (reason === 'identity') h.options.identity.geometryHash = hash('changed');
      if (reason === 'font')
        h.host.loadFonts = async () => {
          throw new Error('font missing');
        };
      if (reason === 'fence')
        h.options.finalMutationFence = async () => {
          h.events.push('fence-rejected');
          throw new Error('source changed');
        };
      expect((await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).status).toBe(
        'blocked'
      );
      expect(h.resources.size).toBe(0);
      expect(h.journal.getActiveContractKind()).toBeNull();
    }
  });
  it('detaches options and nested identity before a preflight await', async () => {
    const h = harness(capture),
      waiting = deferred(),
      entered = deferred();
    const originalIdentity = { ...h.options.identity };
    h.host.loadFonts = async () => {
      entered.resolve();
      await waiting.promise;
    };
    const pending = renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options);
    await entered.promise;
    h.options.identity.recipeHash = hash('later change');
    h.options.currentFileIdentityHash = hash('later file');
    h.options.copyName = 'later copy';
    h.options.collisionPolicy = 'create-copy';
    h.options.finalMutationFence = async () => {
      throw new Error('replacement callback');
    };
    waiting.resolve();
    expect((await pending).status).toBe('created');
    expect(h.plans[0].identity).toEqual(originalIdentity);
    expect(h.plans[0].outputName).toBe(capture.blueprint.name);
  });
  it('blocks a stale host after fonts and the source fence, before the first mutation', async () => {
    for (const change of ['profile', 'file', 'read-only'] as const) {
      const h = harness(capture);
      h.host.loadFonts = async () => {
        if (change === 'profile') h.context.colorProfile = 'display-p3';
        if (change === 'file') h.context.currentFileIdentityHash = hash('different');
        if (change === 'read-only') h.context.editable = false;
      };
      const result = await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options);
      expect(result.status).toBe('blocked');
      expect(h.resources.size).toBe(0);
    }
  });
  it('rechecks host capabilities after the final source callback itself awaits', async () => {
    const h = harness(capture);
    h.options.finalMutationFence = async () => {
      await Promise.resolve();
      h.context.geometryVectors = false;
    };
    expect(await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).toMatchObject({
      status: 'blocked',
      code: 'CAPABILITY_MISSING',
    });
    expect(h.resources.size).toBe(0);
  });
  it('supports a distinct collision copy while never overwriting the existing names', async () => {
    const h = harness(capture);
    for (const name of colorSystemAuthoredOutputNamesV1(capture.blueprint, capture.blueprint.name))
      h.names.add(name);
    expect(await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).toMatchObject({
      status: 'blocked',
      code: 'COLLISION_CANCELLED',
    });
    const result = await renderColorSystemAuthoredDeliveryV1(capture, h.host, {
      ...h.options,
      collisionPolicy: 'create-copy',
      copyName: 'A separate native copy',
    });
    expect(result).toMatchObject({ status: 'created', outputName: 'A separate native copy' });
    expect(h.plans[0].action).toBe('create-copy');
  });
  it.each([128, 129, 156, 157, 160])(
    'creates and recovers a %i-character name through a reopened journal',
    async length => {
      const h = harness(capture);
      const copyName = 'N'.repeat(length);
      const options = { ...h.options, collisionPolicy: 'create-copy' as const, copyName };
      expect(await renderColorSystemAuthoredDeliveryV1(capture, h.host, options)).toMatchObject({
        status: 'created',
        outputName: copyName,
      });
      const reopened = createColorSystemCreateJournalRuntimeV2(h.journalHost);
      expect(reopened.authored.read()).toMatchObject({
        outputName: copyName,
        outputPageName: `${copyName} — Authored Color System`,
        state: 'verified',
      });
      expect(
        await renderColorSystemAuthoredDeliveryV1(capture, h.host, {
          ...options,
          journal: reopened,
        })
      ).toMatchObject({ status: 'verified-existing-output', outputName: copyName });
      expect(h.plans).toHaveLength(1);
    }
  );
  it.each(['N'.repeat(161), '', ' copy', 'copy ', 'copy\nname', 'copy\u007fname'])(
    'blocks an invalid copy name before journal creation: %j',
    async copyName => {
      const h = harness(capture);
      expect(
        await renderColorSystemAuthoredDeliveryV1(capture, h.host, {
          ...h.options,
          collisionPolicy: 'create-copy',
          copyName,
        })
      ).toMatchObject({ status: 'blocked', code: 'COPY_NAME_REQUIRED' });
      expect(h.data.size).toBe(0);
      expect(h.resources.size).toBe(0);
    }
  );
  it.each(['I'.repeat(256), 'Imported\nlabel'])(
    'preserves an incompatible imported label when creating a valid native copy: %j',
    async label => {
      const imported = await compileColorSystemAuthoredDeliveryV1(
        { ...fixture.recipe, label },
        fixture.geometry,
        { isCancelled: () => false, yield: async () => {} }
      );
      const h = harness(imported);
      expect(await renderColorSystemAuthoredDeliveryV1(imported, h.host, h.options)).toMatchObject({
        status: 'blocked',
        code: 'INVALID_BLUEPRINT',
      });
      expect(h.resources.size).toBe(0);
      const result = await renderColorSystemAuthoredDeliveryV1(imported, h.host, {
        ...h.options,
        collisionPolicy: 'create-copy',
        copyName: 'A valid native copy',
      });
      expect(result).toMatchObject({ status: 'created', outputName: 'A valid native copy' });
      expect(imported.recipe.label).toBe(label);
      expect(h.plans[0].blueprint.name).toBe(label);
      expect(h.journal.authored.read()?.recipeHash).toBe(imported.blueprint.identity.recipeHash);
    }
  );
  it('cleans interrupted resources and retains a verified failed-ack output for safe recovery', async () => {
    for (const phase of ['create', 'verify', 'undo', 'ack'] as const) {
      const h = harness(capture);
      h.setFailure(phase);
      const result = await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options);
      expect(result.status).toBe(
        phase === 'create' || phase === 'verify' ? 'rolled-back' : 'cleanup-incomplete'
      );
      if (phase === 'create' || phase === 'verify') {
        expect(h.resources.size).toBe(0);
        expect(h.journal.getActiveContractKind()).toBeNull();
      } else {
        expect(h.resources.size).toBe(resourceCount(capture));
        expect(h.journal.authored.read()?.state).toBe('verified');
        h.setFailure('');
        expect((await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).status).toBe(
          phase === 'ack' ? 'verified-existing-output' : 'blocked'
        );
      }
    }
  });
  it.each(['name', 'paint', 'geometry'] as const)(
    'preserves a native %s edit after failed acknowledgement and recovers only the original output',
    async edit => {
      const h = nativeHarness(capture);
      h.acknowledgement.mockRejectedValueOnce(new Error('completion save failed'));
      expect(await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).toMatchObject({
        status: 'cleanup-incomplete',
        failedPhase: 'completion-acknowledgement',
      });
      const journal = h.journal.authored.read()!;
      expect(journal.resources).toHaveLength(resourceCount(capture));
      const firstCompletion = h.acknowledgement.mock.calls[0];
      const createdCount = h.document.createdCount;
      const frame = h.document.nodes.get(
        journal.resources.find(ref => ref.recipeId === capture.blueprint.boards[0].recipeId)!.id
      )!;
      const before = {
        name: frame.name,
        x: frame.x,
        fills: structuredClone(frame.children[0].fills),
      };
      if (edit === 'name') frame.name = 'Edited after failed completion acknowledgement';
      if (edit === 'geometry') frame.x += 13;
      if (edit === 'paint')
        frame.children[0].fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];

      expect(await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).toMatchObject({
        status: 'blocked',
        code: 'RECOVERY_REQUIRED',
      });
      expect(h.verification).toHaveBeenCalledTimes(1);
      await expect(h.verify(h.plan, journal.resources)).rejects.toThrow();
      expect(h.acknowledgement).toHaveBeenCalledTimes(1);
      expect(h.document.createdCount).toBe(createdCount);
      expect(h.document.commitUndoCount).toBe(1);
      expect(h.journal.authored.read()).toEqual(journal);

      frame.name = before.name;
      frame.x = before.x;
      frame.children[0].fills = before.fills;
      await expect(h.verify(h.plan, journal.resources)).resolves.toBeUndefined();
      expect(await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).toMatchObject({
        status: 'verified-existing-output',
        resources: journal.resources,
      });
      expect(h.acknowledgement.mock.calls[1]).toEqual(firstCompletion);
      expect(h.verification).toHaveBeenCalledTimes(1);
      expect(h.document.createdCount).toBe(createdCount);
      expect(h.document.commitUndoCount).toBe(1);
    }
  );
  it('recovers unchanged native output after failed acknowledgement without repeating mutation or Undo', async () => {
    const h = nativeHarness(capture);
    h.acknowledgement.mockRejectedValueOnce(new Error('completion save failed'));
    expect((await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).status).toBe(
      'cleanup-incomplete'
    );
    const journal = h.journal.authored.read()!;
    const createdCount = h.document.createdCount;
    expect(await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).toMatchObject({
      status: 'verified-existing-output',
      resources: journal.resources,
    });
    expect(h.acknowledgement.mock.calls[1]).toEqual(h.acknowledgement.mock.calls[0]);
    expect(h.verification).toHaveBeenCalledTimes(1);
    expect(h.document.createdCount).toBe(createdCount);
    expect(h.document.commitUndoCount).toBe(1);
    expect(h.journal.authored.read()).toEqual(journal);
  });
  it.each(['unavailable', 'invalid'] as const)(
    'preserves native output when the first committed fingerprint is %s',
    async failure => {
      const h = nativeHarness(capture);
      const fingerprint = vi.spyOn(h.journalHost, 'fingerprintResources');
      if (failure === 'unavailable')
        fingerprint.mockRejectedValueOnce(new Error('fingerprint unavailable'));
      else fingerprint.mockResolvedValueOnce('invalid fingerprint');
      expect(await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).toMatchObject({
        status: 'cleanup-incomplete',
        failedPhase: 'completion-acknowledgement',
      });
      const journal = h.journal.authored.read()!;
      const createdCount = h.document.createdCount;
      expect(journal.resources).toHaveLength(resourceCount(capture));
      expect(await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).toMatchObject({
        status: 'blocked',
        code: 'RECOVERY_REQUIRED',
      });
      expect(fingerprint).toHaveBeenCalledTimes(1);
      expect(h.acknowledgement).not.toHaveBeenCalled();
      expect(h.verification).toHaveBeenCalledTimes(1);
      expect(h.document.createdCount).toBe(createdCount);
      expect(h.document.commitUndoCount).toBe(1);
      expect(h.journal.authored.read()).toEqual(journal);
      await expect(h.verify(h.plan, journal.resources)).resolves.toBeUndefined();
    }
  );
  it.each([false, true])(
    'uses the original native fingerprint after acknowledgement readback fails (edited: %s)',
    async edited => {
      const h = nativeHarness(capture);
      vi.spyOn(h.figma.clientStorage, 'getAsync').mockRejectedValueOnce(
        new Error('readback unavailable')
      );
      expect(await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).toMatchObject({
        status: 'cleanup-incomplete',
        failedPhase: 'completion-acknowledgement',
      });
      const journal = h.journal.authored.read()!;
      const createdCount = h.document.createdCount;
      if (edited)
        h.document.nodes.get(journal.resources.find(ref => ref.kind === 'frame')!.id)!.name =
          'Edited after failed readback';
      expect((await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).status).toBe(
        edited ? 'blocked' : 'verified-existing-output'
      );
      expect(h.acknowledgement).toHaveBeenCalledTimes(1);
      expect(h.verification).toHaveBeenCalledTimes(1);
      expect(h.document.createdCount).toBe(createdCount);
      expect(h.document.commitUndoCount).toBe(1);
      expect(h.journal.authored.read()).toEqual(journal);
    }
  );
  it('does not report native success when the output changes during acknowledgement storage', async () => {
    const h = nativeHarness(capture);
    h.acknowledgement.mockImplementationOnce(async (key, value) => {
      await h.persistAcknowledgement(key, value);
      const journal = h.journal.authored.read()!;
      h.document.nodes.get(journal.resources.find(ref => ref.kind === 'frame')!.id)!.name =
        'Edited while completion storage awaited';
    });
    expect(await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).toMatchObject({
      status: 'cleanup-incomplete',
      failedPhase: 'completion-acknowledgement',
    });
    const journal = h.journal.authored.read()!;
    expect(
      h.document.nodes.get(journal.resources.find(ref => ref.kind === 'frame')!.id)!.name
    ).toBe('Edited while completion storage awaited');
    const createdCount = h.document.createdCount;
    expect(await renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options)).toMatchObject({
      status: 'blocked',
      code: 'RECOVERY_REQUIRED',
    });
    expect(h.acknowledgement).toHaveBeenCalledTimes(1);
    expect(h.verification).toHaveBeenCalledTimes(1);
    expect(h.document.createdCount).toBe(createdCount);
    expect(h.document.commitUndoCount).toBe(1);
    expect(h.journal.authored.read()).toEqual(journal);
  });
  it('blocks another renderer and direct cleanup while native mutation awaits', async () => {
    const h = harness(capture),
      waiting = deferred(),
      entered = deferred();
    const create = h.host.createOutput;
    h.host.createOutput = async (plan, progress) => {
      entered.resolve();
      await waiting.promise;
      return create(plan, progress);
    };
    const pending = renderColorSystemAuthoredDeliveryV1(capture, h.host, h.options);
    await entered.promise;
    const other = createColorSystemCreateJournalRuntimeV2({ ...h.journalHost });
    const target = colorSystemAuthoredDeliveryIdentityV1(capture);
    await expect(other.authored.reconcile(FILE, target)).rejects.toThrow(/active/);
    expect(
      await renderColorSystemAuthoredDeliveryV1(capture, h.host, { ...h.options, journal: other })
    ).toMatchObject({ status: 'blocked', code: 'RECOVERY_REQUIRED' });
    expect(h.resources.size).toBe(0);
    waiting.resolve();
    expect((await pending).status).toBe('created');
  });
  it('requires a genuine local delivery capture and a durable journal', async () => {
    const h = harness(capture);
    await expect(
      renderColorSystemAuthoredDeliveryV1(structuredClone(capture), h.host, h.options)
    ).rejects.toThrow(/Recompute/);
    await expect(
      renderColorSystemAuthoredDeliveryV1(capture, h.host, {
        ...h.options,
        journal: undefined,
      } as unknown as ColorSystemAuthoredRenderOptionsV1)
    ).rejects.toThrow();
    expect(h.resources.size).toBe(0);
  });
});
