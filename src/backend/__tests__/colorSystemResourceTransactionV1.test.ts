import { describe, expect, it } from 'vitest';
import { deterministicContentHash as hash } from '../../lib/colorSystemHashing';
import {
  COLOR_SYSTEM_AUTHORED_CREATE_JOURNAL_V1_VERSION,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY,
  colorSystemCreateJournalHeaderKeyV2,
  createColorSystemCreateJournalRuntimeV2,
  createFigmaColorSystemCreateJournalHostV2,
  type BeginColorSystemAuthoredCreateJournalV1Input,
  type ColorSystemAuthoredCreateJournalReconciliationV1,
  type ColorSystemAuthoredCreateJournalV1,
  type ColorSystemCreateJournalHostV2,
  type ColorSystemCreateJournalResolvedResourceV2,
  type ColorSystemCreateJournalResourceRefV2,
} from '../colorSystemCreateJournalV2';
import {
  COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION,
  COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION,
  COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA,
} from '../colorSystemResourceOwnershipV2';
import {
  runColorSystemResourceTransactionV1,
  type ColorSystemResourceTransactionAdapterV1,
  type ColorSystemResourceTransactionFailureV1,
  type ColorSystemResourceTransactionPlanV1,
} from '../colorSystemResourceTransactionV1';

const identity = {
  authoringRecipeId: 'recipe/without-primary',
  recipeHash: hash('recipe'),
  sourceModelHash: hash('source'),
  designContentHash: hash('design'),
  deliveryBlueprintHash: hash('delivery'),
  geometryHash: hash('geometry'),
  assessmentHash: hash('assessment'),
  reviewHash: hash('review'),
  approvalHash: hash('approval'),
  createAuthorizationHash: hash('authorization'),
};
const input: BeginColorSystemAuthoredCreateJournalV1Input = {
  ...identity,
  transactionId: `teul-authored-create-v1:${identity.createAuthorizationHash.slice(7)}`,
  requestId: 'request',
  sessionId: 'session',
  currentFileIdentityHash: hash('file'),
  outputAction: 'create-new',
  outputName: 'Authored system',
  outputPageName: 'Authored documentation',
  systemId: 'authored-system',
  counts: { collections: 3, variables: 2, styles: 0, components: 0, frames: 1, pages: 1 },
};
const target = {
  authoringRecipeId: identity.authoringRecipeId,
  recipeHash: identity.recipeHash,
  sourceModelHash: identity.sourceModelHash,
  designContentHash: identity.designContentHash,
  deliveryBlueprintHash: identity.deliveryBlueprintHash,
  geometryHash: identity.geometryHash,
  assessmentHash: identity.assessmentHash,
  systemId: input.systemId,
};
const refs: ColorSystemCreateJournalResourceRefV2[] = [
  { kind: 'page', id: 'page', recipeId: 'documentation' },
  ...Array.from({ length: 3 }, (_, index) => ({
    kind: 'collection' as const,
    id: `collection${index}`,
    recipeId: `mode-domain/${index}`,
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    kind: 'variable' as const,
    id: `variable${index}`,
    recipeId: `native-value/${index}`,
  })),
  { kind: 'frame', id: 'frame', recipeId: 'application/brochure' },
];
function fixture() {
  const root = new Map<string, string>();
  const completion = new Map<string, unknown>();
  const resources = new Map<string, ColorSystemCreateJournalResolvedResourceV2>();
  const events: string[] = [];
  let failAck = false;
  let failUndo = false;
  let observer: ((ref: ColorSystemCreateJournalResourceRefV2) => void) | null = null;
  const host: ColorSystemCreateJournalHostV2 = {
    transactionScope: {},
    getRootPluginData: key => root.get(key) ?? '',
    setRootPluginData: (key, value) => {
      events.push(`write:${key}`);
      if (value) root.set(key, value);
      else root.delete(key);
    },
    getRootPluginDataKeys: () => [...root.keys()],
    getCompletionAcknowledgement: async file => completion.get(file),
    setCompletionAcknowledgement: async (file, value) => {
      events.push('ack');
      if (failAck) throw new Error('ack failure');
      completion.set(file, value);
    },
    clearCompletionAcknowledgement: async file => {
      completion.delete(file);
    },
    fingerprintResources: async entries =>
      hash(
        entries.map(ref => ({
          ref,
          ownership: resources.get(ref.id)?.ownership,
          name: resources.get(ref.id)?.name,
        }))
      ),
    loadAllPages: async () => {
      events.push('load-pages');
    },
    resolveResource: async ref => resources.get(ref.id) ?? null,
  };
  const rendererHost = {
    setCreatedResourceObserver(next: typeof observer) {
      observer = next;
    },
    async removeResource(ref: ColorSystemCreateJournalResourceRefV2) {
      events.push(`remove:${ref.id}`);
      resources.delete(ref.id);
    },
    async commitUndo() {
      events.push('undo');
      if (failUndo) throw new Error('undo failure');
    },
  };
  function add(ref: ColorSystemCreateJournalResourceRefV2, notify = false) {
    resources.set(ref.id, {
      id: ref.id,
      kind: ref.kind,
      name: ref.recipeId,
      ownership: {
        ...identity,
        version: COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION,
        transactionId: input.transactionId,
        systemId: input.systemId,
        recipeId: ref.recipeId,
        resourceKind: ref.kind,
      },
      remove: () => rendererHost.removeResource(ref),
    });
    if (notify) observer?.(ref);
  }
  const runtime = createColorSystemCreateJournalRuntimeV2(host);
  function completed() {
    let journal = runtime.authored.begin(input);
    for (const ref of refs) {
      add(ref);
      journal = runtime.authored.record(journal, ref);
    }
    return runtime.authored.markVerified(journal);
  }
  return {
    root,
    completion,
    resources,
    events,
    host,
    rendererHost,
    runtime,
    add,
    completed,
    setFailAck(value: boolean) {
      failAck = value;
    },
    setFailUndo(value: boolean) {
      failUndo = value;
    },
  };
}
type State = ReturnType<typeof fixture>;
type Receipt =
  | { status: 'created'; refs: readonly ColorSystemCreateJournalResourceRefV2[] }
  | { status: 'blocked'; code: string; message: string }
  | ColorSystemResourceTransactionFailureV1
  | ColorSystemAuthoredCreateJournalReconciliationV1;
type Adapter = ColorSystemResourceTransactionAdapterV1<
  ColorSystemResourceTransactionPlanV1,
  ColorSystemAuthoredCreateJournalV1,
  ColorSystemAuthoredCreateJournalReconciliationV1,
  Receipt,
  undefined
>;
function adapter(state: State): Adapter {
  return {
    contractKind: 'authored-v1',
    transactionId: input.transactionId,
    journal: {
      acquire() {
        const lease = state.runtime.acquireTransaction();
        if (!lease) return null;
        const runtime = lease.authored;
        return {
          release: lease.release,
          read: runtime.read,
          matchesTarget: j => j.deliveryBlueprintHash === target.deliveryBlueprintHash,
          reconcile: before => runtime.reconcile(input.currentFileIdentityHash, target, before),
          begin: () => runtime.begin(input),
          record: runtime.record,
          markVerified: runtime.markVerified,
          acknowledgeCommitted: runtime.acknowledgeCommitted,
        };
      },
    },
    async preflight(defer) {
      state.events.push(`preflight:${defer}`);
      return {
        transactionId: input.transactionId,
        action: 'create-new',
        outputName: input.outputName,
      };
    },
    async finalMutationFence() {
      state.events.push('fence');
    },
    async mutate(_plan, context) {
      for (const ref of refs) {
        state.add(ref, true);
        if (ref.kind !== 'page') context.remember(ref);
      }
      return undefined;
    },
    async verify() {
      state.events.push('verify');
      expect(state.resources.size).toBe(7);
    },
    async reveal() {
      state.events.push('reveal');
      return [];
    },
    blocked: (_id, code, message) => ({ status: 'blocked', code, message }),
    reconciliation: (_plan, recovery) =>
      ['verified-existing-output', 'preserved-unacknowledged-output'].includes(recovery.status)
        ? recovery
        : null,
    failed: failure => failure,
    created: (_plan, created) => ({ status: 'created', refs: created }),
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('authored resource transaction and shared journal', () => {
  it('creates truthful mode-domain inventory and replays exact acknowledged output without mutation', async () => {
    const state = fixture();
    const result = await runColorSystemResourceTransactionV1(state.rendererHost, adapter(state));
    expect(result.status).toBe('created');
    expect(state.runtime.getActiveContractKind()).toBe('authored-v1');
    expect(state.runtime.authored.read()).toMatchObject({
      version: COLOR_SYSTEM_AUTHORED_CREATE_JOURNAL_V1_VERSION,
      expectedCounts: input.counts,
      ...identity,
    });
    const persisted = state.root.get(colorSystemCreateJournalHeaderKeyV2())!;
    expect(persisted).not.toMatch(/strategySetHash|sectionBlueprintHash|resourceBlueprintHash/);
    expect(state.events.indexOf('verify')).toBeLessThan(state.events.indexOf('undo'));
    expect(state.events.indexOf('undo')).toBeLessThan(state.events.indexOf('ack'));
    const mutations = state.events.filter(e => e.startsWith('write:')).length;
    expect(
      (await runColorSystemResourceTransactionV1(state.rendererHost, adapter(state))).status
    ).toBe('verified-existing-output');
    expect(state.events.filter(e => e.startsWith('write:')).length).toBe(mutations);
  });
  it('rejects changed returned journal identities and refs instead of trusting their cached object identity', () => {
    for (const field of ['version', 'recipeHash', 'resource']) {
      const state = fixture();
      let journal = state.runtime.authored.begin(input);
      if (field === 'resource') journal = state.runtime.authored.record(journal, refs[0]);
      const writable = journal as unknown as Record<string, unknown>;
      if (field === 'version') writable.version = 'teul-color-system-create-journal/v2';
      else if (field === 'recipeHash') writable.recipeHash = hash('changed');
      else (journal.resources[0] as { id: string }).id = 'foreign';
      const before = [...state.root];
      if (field === 'version')
        expect(() => state.runtime.record(journal as never, refs[1])).toThrow(
          /changed after validation/
        );
      else
        expect(() => state.runtime.authored.record(journal, refs[1])).toThrow(
          /changed after validation/
        );
      expect([...state.root]).toEqual(before);
      expect(state.runtime.authored.read()?.recipeHash).toBe(identity.recipeHash);
    }
  });
  it('keeps completion identity detached while the fingerprint host is awaiting', async () => {
    const state = fixture();
    const journal = state.completed();
    const waiting = deferred();
    const entered = deferred();
    const fingerprint = state.host.fingerprintResources;
    state.host.fingerprintResources = async refs => {
      entered.resolve();
      await waiting.promise;
      return fingerprint(refs);
    };
    const acknowledging = state.runtime.authored.acknowledgeCommitted(journal);
    await entered.promise;
    journal.recipeHash = hash('caller changed');
    (journal.resources[0] as { id: string }).id = 'caller changed';
    waiting.resolve();
    await acknowledging;
    const completion = JSON.parse(state.completion.get(input.currentFileIdentityHash) as string);
    expect(completion.recipeHash).toBe(identity.recipeHash);
    expect(
      (await state.runtime.authored.reconcile(input.currentFileIdentityHash, target)).status
    ).toBe('verified-existing-output');
  });
  it('preserves a legacy active journal when called through the authored surface', async () => {
    const state = fixture();
    state.runtime.begin({
      transactionId: `teul-create-v2:${identity.createAuthorizationHash.slice(7)}`,
      requestId: 'legacy',
      sessionId: 'legacy',
      currentFileIdentityHash: input.currentFileIdentityHash,
      sourceAuthorityHash: hash('source'),
      liveSourceHash: hash('source'),
      briefHash: hash('brief'),
      strategySetHash: hash('strategy'),
      candidateHash: hash('candidate'),
      applicationBlueprintHash: hash('application'),
      sectionBlueprintHash: hash('section'),
      resourceBlueprintHash: hash('resource'),
      reviewHash: identity.reviewHash,
      approvalHash: identity.approvalHash,
      createAuthorizationHash: identity.createAuthorizationHash,
      outputAction: 'create-new',
      outputName: 'Legacy',
      outputPageName: 'Legacy page',
      systemId: 'legacy',
      counts: {
        variables: 0,
        primitiveVariables: 0,
        aliasVariables: 0,
        styles: 0,
        components: 0,
        frames: 5,
        familyModeComponentVariants: 0,
        estimatedNodes: 0,
      },
    });
    const before = [...state.root];
    expect(state.runtime.getActiveContractKind()).toBe('legacy-v2');
    expect(() => state.runtime.authored.read()).toThrow(/own recovery surface/);
    expect(() => state.runtime.authored.begin(input)).toThrow(/own recovery surface/);
    await expect(
      state.runtime.authored.reconcile(input.currentFileIdentityHash, target)
    ).rejects.toThrow(/own recovery surface/);
    expect([...state.root]).toEqual(before);
  });
  it('fingerprints exact authored native channels and vector geometry without changing legacy fingerprint policy', async () => {
    const keys = COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA;
    let version: string = COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION;
    const child = {
      id: 'contour',
      type: 'VECTOR',
      vectorPaths: [{ windingRule: 'EVENODD', data: 'M 0 0 L 10 0 L 10 10 Z' }],
      getPluginData: () => '',
      children: [],
    };
    const frame = {
      id: 'frame',
      type: 'FRAME',
      valuesByMode: { day: { r: 0.12345678901234, g: 0.2, b: 0.3, a: 1 } },
      children: [child],
      getPluginData: (key: string) => (key === keys.version ? version : ''),
    };
    const api = {
      root: {},
      loadAllPagesAsync: async () => undefined,
      getNodeByIdAsync: async () => frame,
    } as unknown as PluginAPI;
    const host = createFigmaColorSystemCreateJournalHostV2(api);
    const requested = [refs[6]];
    const first = await host.fingerprintResources(requested);
    frame.valuesByMode.day.r += 1e-12;
    expect(await host.fingerprintResources(requested)).not.toBe(first);
    const second = await host.fingerprintResources(requested);
    child.vectorPaths[0].data = 'M 0 0 L 11 0 L 10 10 Z';
    expect(await host.fingerprintResources(requested)).not.toBe(second);
    version = COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION;
    const legacy = await host.fingerprintResources(requested);
    child.vectorPaths[0].data = 'M 0 0 L 12 0 L 10 10 Z';
    expect(await host.fingerprintResources(requested)).toBe(legacy);
  });
  it('requires a journal and blocks oversized/inert-invalid input before a document mutation', async () => {
    const state = fixture();
    const request = adapter(state);
    delete request.journal;
    expect(await runColorSystemResourceTransactionV1(state.rendererHost, request)).toMatchObject({
      status: 'blocked',
      code: 'JOURNAL_UNAVAILABLE',
    });
    expect(state.events).toEqual([]);
    for (const invalid of [
      { ...input, counts: { ...input.counts, variables: 2048 } },
      { ...input, counts: { ...input.counts, pages: 0 } },
      { ...input, counts: { ...input.counts, collections: 2.5 } },
      { ...input, outputAction: 'update-owned' },
      { ...input, outputName: 'N'.repeat(161) },
      { ...input, outputName: ' leading' },
      { ...input, outputName: 'trailing ' },
      { ...input, outputName: 'control\u0000name' },
      { ...input, outputPageName: 'P'.repeat(185) },
      { ...input, outputPageName: 'page\u007fname' },
      { ...input, extra: true },
      { ...input, transactionId: 'wrong' },
    ])
      expect(() => state.runtime.authored.begin(invalid as typeof input)).toThrow();
    let reads = 0;
    const getter = { ...input };
    Object.defineProperty(getter, 'recipeHash', {
      enumerable: true,
      get() {
        reads++;
        return identity.recipeHash;
      },
    });
    expect(() => state.runtime.authored.begin(getter)).toThrow(/accessors/);
    expect(reads).toBe(0);
    expect(state.events).toEqual([]);
  });
  it('cleans an observed orphan page when the native call fails before returning it', async () => {
    const state = fixture();
    const request = adapter(state);
    request.mutate = async () => {
      state.add(refs[0], true);
      throw new Error('native failed after creation');
    };
    expect(await runColorSystemResourceTransactionV1(state.rendererHost, request)).toMatchObject({
      status: 'rolled-back',
      createdCount: 0,
      removedCount: 1,
    });
    expect(state.resources.size).toBe(0);
    expect(state.runtime.getActiveContractKind()).toBeNull();
  });
  it('recovers an interrupted authored journal through its own surface, never a legacy surface', async () => {
    const state = fixture();
    const journal = state.runtime.authored.begin(input);
    state.add(refs[0]);
    state.runtime.authored.record(journal, refs[0]);
    const reopened = createColorSystemCreateJournalRuntimeV2(state.host);
    const before = [...state.root];
    expect(() => reopened.read()).toThrow(/own recovery surface/);
    await expect(
      reopened.reconcile(input.currentFileIdentityHash, {
        systemId: input.systemId,
        resourceBlueprintHash: hash('x'),
        sectionBlueprintHash: hash('y'),
      })
    ).rejects.toThrow(/own recovery surface/);
    expect([...state.root]).toEqual(before);
    expect(state.resources.size).toBe(1);
    expect(await reopened.authored.reconcile(input.currentFileIdentityHash, target)).toMatchObject({
      status: 'cleaned-interrupted-output',
      removedResourceCount: 1,
    });
    expect(reopened.getActiveContractKind()).toBeNull();
  });
  it.each(Object.keys(identity))(
    'checks exact ownership field %s before removing any resource',
    async key => {
      const state = fixture();
      let journal = state.runtime.authored.begin(input);
      for (const ref of refs.slice(0, 2)) {
        state.add(ref);
        journal = state.runtime.authored.record(journal, ref);
      }
      const owner = state.resources.get(refs[1].id)!.ownership as unknown as Record<
        string,
        unknown
      >;
      owner[key] = 'changed';
      await expect(
        state.runtime.authored.reconcile(input.currentFileIdentityHash, target)
      ).rejects.toThrow(/ambiguous/);
      expect(state.resources.size).toBe(2);
      expect(state.events.some(e => e.startsWith('remove:'))).toBe(false);
    }
  );
  it('keeps verified output after failed Undo or acknowledgement and repairs acknowledgement only in the witnessing runtime', async () => {
    for (const failure of ['undo', 'ack'] as const) {
      const state = fixture();
      if (failure === 'undo') state.setFailUndo(true);
      else state.setFailAck(true);
      expect(
        await runColorSystemResourceTransactionV1(state.rendererHost, adapter(state))
      ).toMatchObject({ status: 'cleanup-incomplete', removedCount: 0 });
      expect(state.resources.size).toBe(7);
      expect(state.runtime.authored.read()?.state).toBe('verified');
      state.setFailUndo(false);
      state.setFailAck(false);
      const reopened = createColorSystemCreateJournalRuntimeV2(state.host);
      expect(
        await reopened.authored.reconcile(input.currentFileIdentityHash, target)
      ).toMatchObject({ status: 'preserved-unacknowledged-output' });
      expect(
        await state.runtime.authored.reconcile(input.currentFileIdentityHash, target)
      ).toMatchObject({
        status: failure === 'ack' ? 'verified-existing-output' : 'preserved-unacknowledged-output',
      });
    }
  });
  it('checks persisted header and completion hashes and rejects changed output on exact replay', async () => {
    const state = fixture();
    await state.runtime.authored.acknowledgeCommitted(state.completed());
    state.resources.get('frame')!.name = 'user edited';
    await expect(
      state.runtime.authored.reconcile(input.currentFileIdentityHash, target)
    ).rejects.toThrow(/changed after Create/);
    const header = JSON.parse(state.root.get(colorSystemCreateJournalHeaderKeyV2())!);
    header.geometryHash = hash('changed');
    state.root.set(colorSystemCreateJournalHeaderKeyV2(), JSON.stringify(header));
    expect(() => state.runtime.getActiveContractKind()).toThrow(/hash validation/);
  });
  it('preserves a complete old output when releasing it for a different explicit target', async () => {
    const state = fixture();
    await state.runtime.authored.acknowledgeCommitted(state.completed());
    expect(
      await state.runtime.authored.reconcile(input.currentFileIdentityHash, {
        ...target,
        geometryHash: hash('different'),
      })
    ).toMatchObject({ status: 'released-completed-output' });
    expect(state.resources.size).toBe(7);
    expect(state.root.has(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY)).toBe(false);
  });
  it('blocks competing kernels and direct recovery across wrappers even with the same caller transaction ID', async () => {
    const state = fixture();
    const waiting = deferred();
    const entered = deferred();
    const request = adapter(state);
    const mutate = request.mutate;
    request.mutate = async (plan, context) => {
      state.add(refs[0], true);
      entered.resolve();
      await waiting.promise;
      return mutate(plan, context);
    };
    const running = runColorSystemResourceTransactionV1(state.rendererHost, request);
    await entered.promise;
    const other = createColorSystemCreateJournalRuntimeV2({ ...state.host });
    expect(other.acquireTransaction()).toBeNull();
    await expect(other.authored.reconcile(input.currentFileIdentityHash, target)).rejects.toThrow(
      /active/
    );
    await expect(
      other.reconcile(input.currentFileIdentityHash, {
        systemId: 'x',
        resourceBlueprintHash: hash('x'),
        sectionBlueprintHash: hash('y'),
      })
    ).rejects.toThrow(/active/);
    expect(() => other.authored.clear(input.transactionId)).toThrow(/active/);
    expect(
      (await runColorSystemResourceTransactionV1(state.rendererHost, adapter(state))).status
    ).toBe('blocked');
    expect(state.resources.size).toBe(1);
    waiting.resolve();
    expect((await running).status).toBe('created');
    const lease = other.acquireTransaction()!;
    lease.release();
    expect(() => lease.authored.clear(input.transactionId)).toThrow(/active/);
  });
  it('holds a private lease during direct recovery host awaits, and always releases it after failure', async () => {
    const state = fixture();
    state.runtime.authored.begin(input);
    const entered = deferred();
    const waiting = deferred();
    state.host.loadAllPages = async () => {
      entered.resolve();
      await waiting.promise;
      throw new Error('host read failed');
    };
    const running = state.runtime.authored.reconcile(input.currentFileIdentityHash, target);
    await entered.promise;
    expect(
      (await runColorSystemResourceTransactionV1(state.rendererHost, adapter(state))).status
    ).toBe('blocked');
    waiting.resolve();
    await expect(running).rejects.toThrow(/host read failed/);
    const lease = state.runtime.acquireTransaction();
    expect(lease).not.toBeNull();
    lease!.release();
  });
});
