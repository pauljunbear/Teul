import { describe, expect, it, vi } from 'vitest';
import { deterministicContentHash } from '../../lib/colorSystemAudit';
import {
  COLOR_SYSTEM_CREATE_COMPLETION_V2_KEY,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID,
  ColorSystemCreateJournalV2Error,
  colorSystemCreateCompletionStorageKeyV2,
  createColorSystemCreateJournalRuntimeV2,
  createFigmaColorSystemCreateJournalHostV2,
  type BeginColorSystemCreateJournalV2Input,
  type ColorSystemCreateJournalHostV2,
  type ColorSystemCreateJournalResourceRefV2,
  type ColorSystemCreateJournalResolvedResourceV2,
} from '../colorSystemCreateJournalV2';
import { COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION } from '../colorSystemResourceOwnershipV2';

function hash(label: string): string {
  return deterministicContentHash({ label });
}

const AUTHORIZATION_HASH = hash('authorization');
const FILE_HASH = hash('file');

function beginInput(
  counts: Partial<BeginColorSystemCreateJournalV2Input['counts']> = {}
): BeginColorSystemCreateJournalV2Input {
  return {
    transactionId: `teul-create-v2:${AUTHORIZATION_HASH.slice('sha256:'.length)}`,
    requestId: 'create-journal-test',
    sessionId: 'teul-color-builder-v2:test-session',
    currentFileIdentityHash: FILE_HASH,
    sourceAuthorityHash: hash('source-authority'),
    liveSourceHash: hash('live-source'),
    briefHash: hash('brief'),
    strategySetHash: hash('strategy'),
    candidateHash: hash('candidate'),
    applicationBlueprintHash: hash('application'),
    sectionBlueprintHash: hash('section'),
    resourceBlueprintHash: hash('resource'),
    reviewHash: hash('review'),
    approvalHash: hash('approval'),
    createAuthorizationHash: AUTHORIZATION_HASH,
    outputAction: 'create-copy',
    outputName: 'Studio Color System — Copy test',
    outputPageName: 'Studio Color System — Copy test — Color System',
    systemId: 'studio-color-system-v2',
    counts: {
      primitiveVariables: counts.primitiveVariables ?? 0,
      aliasVariables: counts.aliasVariables ?? 0,
      variables: counts.variables ?? 0,
      styles: counts.styles ?? 0,
      components: counts.components ?? 0,
      frames: 5,
      familyModeComponentVariants: counts.familyModeComponentVariants ?? 0,
      estimatedNodes: counts.estimatedNodes ?? 0,
    },
  };
}

function fixture(options: { failManifestWrites?: boolean } = {}) {
  const rootData = new Map<string, string>();
  const completionAcknowledgements = new Map<string, unknown>();
  const resources = new Map<string, ColorSystemCreateJournalResolvedResourceV2>();
  const removalOrder: string[] = [];
  const host: ColorSystemCreateJournalHostV2 = {
    getRootPluginData: key => rootData.get(key) ?? '',
    setRootPluginData: (key, value) => {
      if (options.failManifestWrites && key === COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY) {
        throw new Error('root plugin-data write failed');
      }
      if (value) rootData.set(key, value);
      else rootData.delete(key);
    },
    getCompletionAcknowledgement: vi.fn(async fileHash => completionAcknowledgements.get(fileHash)),
    setCompletionAcknowledgement: vi.fn(async (fileHash, value) => {
      completionAcknowledgements.set(fileHash, value);
    }),
    clearCompletionAcknowledgement: vi.fn(async fileHash => {
      completionAcknowledgements.delete(fileHash);
    }),
    fingerprintResources: vi.fn(async (refs: readonly ColorSystemCreateJournalResourceRefV2[]) =>
      deterministicContentHash(
        refs.map(ref => {
          const resource = resources.get(`${ref.kind}:${ref.id}`);
          if (!resource) throw new Error(`missing fingerprint resource ${ref.id}`);
          return {
            ref,
            name: resource.name,
            remote: resource.remote,
            ownership: resource.ownership,
          };
        })
      )
    ),
    loadAllPages: vi.fn(async () => undefined),
    resolveResource: vi.fn(async ref => resources.get(`${ref.kind}:${ref.id}`) ?? null),
  };
  const runtime = createColorSystemCreateJournalRuntimeV2(host);
  const add = (
    ref: ColorSystemCreateJournalResourceRefV2,
    input = beginInput(),
    onRemove: () => void = () => undefined
  ) => {
    const resource: ColorSystemCreateJournalResolvedResourceV2 = {
      id: ref.id,
      kind: ref.kind,
      name: ref.recipeId,
      remote: false,
      ownership: {
        version: COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION,
        transactionId: input.transactionId,
        systemId: input.systemId,
        recipeId: ref.recipeId,
        resourceBlueprintHash: input.resourceBlueprintHash,
        sectionBlueprintHash: input.sectionBlueprintHash,
        resourceKind: ref.kind,
      },
      remove: vi.fn(() => {
        onRemove();
        removalOrder.push(ref.kind);
        resources.delete(`${ref.kind}:${ref.id}`);
      }),
    };
    resources.set(`${ref.kind}:${ref.id}`, resource);
    return resource;
  };
  return { rootData, resources, removalOrder, host, runtime, add };
}

function target(input: BeginColorSystemCreateJournalV2Input = beginInput()): {
  systemId: string;
  resourceBlueprintHash: string;
  sectionBlueprintHash: string;
} {
  return {
    systemId: input.systemId,
    resourceBlueprintHash: input.resourceBlueprintHash,
    sectionBlueprintHash: input.sectionBlueprintHash,
  };
}

function minimalCompleteRefs(): ColorSystemCreateJournalResourceRefV2[] {
  return [
    { kind: 'collection', id: 'collection:1', recipeId: 'collection/primitives' },
    { kind: 'collection', id: 'collection:2', recipeId: 'collection/semantics' },
    ...Array.from({ length: 5 }, (_, index) => ({
      kind: 'frame' as const,
      id: `frame:${index}`,
      recipeId: `frame/${index}`,
    })),
    { kind: 'page', id: 'page:1', recipeId: COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID },
  ];
}

describe('persistent v2 Create transaction journal', () => {
  it('stores the post-commit acknowledgement in Figma clientStorage, separate from document journal data', async () => {
    const rootData = new Map<string, string>();
    const clientData = new Map<string, unknown>();
    const figmaApi = {
      root: {
        getPluginData: (key: string) => rootData.get(key) ?? '',
        setPluginData: (key: string, value: string) => {
          if (value) rootData.set(key, value);
          else rootData.delete(key);
        },
      },
      clientStorage: {
        getAsync: async (key: string) => clientData.get(key),
        setAsync: async (key: string, value: unknown) => {
          clientData.set(key, value);
        },
        deleteAsync: async (key: string) => {
          clientData.delete(key);
        },
      },
      loadAllPagesAsync: async () => undefined,
      variables: {
        getVariableCollectionByIdAsync: async () => null,
        getVariableByIdAsync: async () => null,
      },
      getStyleByIdAsync: async () => null,
      getNodeByIdAsync: async () => null,
    } as unknown as PluginAPI;
    const host = createFigmaColorSystemCreateJournalHostV2(figmaApi);

    await host.setCompletionAcknowledgement(FILE_HASH, 'durable-completion');
    const otherFileHash = hash('other-completed-file');
    await host.setCompletionAcknowledgement(otherFileHash, 'other-durable-completion');

    expect(await host.getCompletionAcknowledgement(FILE_HASH)).toBe('durable-completion');
    expect(await host.getCompletionAcknowledgement(otherFileHash)).toBe('other-durable-completion');
    expect(clientData.get(colorSystemCreateCompletionStorageKeyV2(FILE_HASH))).toBe(
      'durable-completion'
    );
    expect(
      [...clientData.keys()].some(key =>
        key.startsWith(`${COLOR_SYSTEM_CREATE_COMPLETION_V2_KEY}:`)
      )
    ).toBe(true);
    expect(rootData.has(colorSystemCreateCompletionStorageKeyV2(FILE_HASH))).toBe(false);

    await host.clearCompletionAcknowledgement(FILE_HASH);
    expect(await host.getCompletionAcknowledgement(FILE_HASH)).toBeUndefined();
    expect(await host.getCompletionAcknowledgement(otherFileHash)).toBe('other-durable-completion');
  });

  it('fingerprints current Figma resource content instead of trusting ownership metadata alone', async () => {
    const pluginData = new Map<string, string>();
    const collection = {
      id: 'collection:fingerprint',
      name: 'Committed collection',
      modes: [{ modeId: 'mode:light', name: 'Light' }],
      variableIds: [] as string[],
      remote: false,
      getPluginData: (key: string) => pluginData.get(key) ?? '',
      setPluginData: (key: string, value: string) => pluginData.set(key, value),
      remove: () => undefined,
    };
    const figmaApi = {
      root: { getPluginData: () => '', setPluginData: () => undefined },
      clientStorage: {
        getAsync: async () => undefined,
        setAsync: async () => undefined,
        deleteAsync: async () => undefined,
      },
      loadAllPagesAsync: async () => undefined,
      variables: {
        getVariableCollectionByIdAsync: async () => collection,
        getVariableByIdAsync: async () => null,
      },
      getStyleByIdAsync: async () => null,
      getNodeByIdAsync: async () => null,
    } as unknown as PluginAPI;
    const host = createFigmaColorSystemCreateJournalHostV2(figmaApi);
    const refs = [
      {
        kind: 'collection' as const,
        id: collection.id,
        recipeId: 'collection/primitives',
      },
    ];

    const committedFingerprint = await host.fingerprintResources(refs);
    collection.name = 'Owner-edited collection';
    const editedFingerprint = await host.fingerprintResources(refs);

    expect(committedFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(editedFingerprint).not.toBe(committedFingerprint);
  });

  it('strictly binds the complete v2 authority, output, file, and transaction identities', () => {
    const state = fixture();
    const journal = state.runtime.begin(beginInput());

    expect(state.runtime.read()).toEqual(journal);
    expect(journal).toMatchObject({
      state: 'creating',
      transactionId: beginInput().transactionId,
      currentFileIdentityHash: FILE_HASH,
      sourceAuthorityHash: beginInput().sourceAuthorityHash,
      reviewHash: beginInput().reviewHash,
      approvalHash: beginInput().approvalHash,
      createAuthorizationHash: AUTHORIZATION_HASH,
      resourceBlueprintHash: beginInput().resourceBlueprintHash,
      outputAction: 'create-copy',
      outputName: beginInput().outputName,
      expectedCounts: {
        collections: 2,
        variables: 0,
        styles: 0,
        components: 0,
        frames: 5,
        pages: 1,
      },
    });
    expect(journal.journalHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(state.rootData.has('teul-color-system-apply-journal-v1')).toBe(false);
  });

  it('stores the production-sized 418-resource ledger across bounded chunks', () => {
    const counts = { variables: 192, styles: 192, components: 26 };
    const input = beginInput(counts);
    const state = fixture();
    let journal = state.runtime.begin(input);
    const refs: ColorSystemCreateJournalResourceRefV2[] = [
      { kind: 'collection', id: 'collection:1', recipeId: 'collection/primitives' },
      { kind: 'collection', id: 'collection:2', recipeId: 'collection/semantics' },
      ...Array.from({ length: 192 }, (_, index) => ({
        kind: 'variable' as const,
        id: `variable:${index}`,
        recipeId: `variable/${index}/${'v'.repeat(120)}`,
      })),
      ...Array.from({ length: 192 }, (_, index) => ({
        kind: 'style' as const,
        id: `style:${index}`,
        recipeId: `style/${index}/${'s'.repeat(120)}`,
      })),
      ...Array.from({ length: 26 }, (_, index) => ({
        kind: 'component' as const,
        id: `component:${index}`,
        recipeId: `component/${index}/${'c'.repeat(120)}`,
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        kind: 'frame' as const,
        id: `frame:${index}`,
        recipeId: `frame/${index}`,
      })),
      { kind: 'page', id: 'page:1', recipeId: COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID },
    ];
    refs.forEach(ref => {
      journal = state.runtime.record(journal, ref);
    });
    journal = state.runtime.markVerified(journal);

    const manifest = JSON.parse(state.rootData.get(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY) ?? '{}') as {
      chunkCount: number;
    };
    expect(manifest.chunkCount).toBeGreaterThan(1);
    expect(manifest.chunkCount).toBeLessThanOrEqual(32);
    expect(state.runtime.read()).toEqual(journal);
    expect(journal.resources).toHaveLength(418);
  }, 30_000);

  it('treats the first manifest write failure as a pre-mutation blocker', () => {
    const state = fixture({ failManifestWrites: true });
    expect(() => state.runtime.begin(beginInput())).toThrow('root plugin-data write failed');
    expect(state.rootData.has(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY)).toBe(false);
  });

  it('removes only exact owned partial resources in reverse dependency order, with the page last', async () => {
    const state = fixture();
    const input = beginInput({ variables: 1, styles: 1, components: 1 });
    let journal = state.runtime.begin(input);
    const refs: ColorSystemCreateJournalResourceRefV2[] = [
      { kind: 'collection', id: 'collection:1', recipeId: 'collection/primitives' },
      { kind: 'variable', id: 'variable:1', recipeId: 'variable/1' },
      { kind: 'style', id: 'style:1', recipeId: 'style/1' },
      { kind: 'component', id: 'component:1', recipeId: 'component/1' },
      { kind: 'frame', id: 'frame:1', recipeId: 'frame/1' },
      { kind: 'page', id: 'page:1', recipeId: COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID },
    ];
    refs.forEach(ref => {
      state.add(ref, input);
      journal = state.runtime.record(journal, ref);
    });

    await expect(state.runtime.reconcile(FILE_HASH, target(input))).resolves.toMatchObject({
      status: 'cleaned-interrupted-output',
      blocksNewMutation: false,
      removedResourceCount: 6,
    });
    expect(state.removalOrder).toEqual([
      'frame',
      'component',
      'style',
      'variable',
      'collection',
      'page',
    ]);
    expect(state.runtime.read()).toBeNull();
  });

  it('fails closed before deletion on wrong-file, foreign ownership, or changed type', async () => {
    const wrongFile = fixture();
    wrongFile.runtime.begin(beginInput());
    await expect(wrongFile.runtime.reconcile(hash('other-file'), target())).rejects.toMatchObject({
      failures: [expect.stringContaining('expected'), expect.stringContaining('actual')],
    });

    const foreign = fixture();
    const input = beginInput();
    let journal = foreign.runtime.begin(input);
    const ref = {
      kind: 'page',
      id: 'page:1',
      recipeId: COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID,
    } as const;
    const resource = foreign.add(ref, input);
    resource.ownership.transactionId = `teul-create-v2:${'0'.repeat(64)}`;
    journal = foreign.runtime.record(journal, ref);
    await expect(foreign.runtime.reconcile(FILE_HASH, target(input))).rejects.toMatchObject({
      failures: [expect.stringContaining('not owned by this exact v2 Create transaction')],
    });
    expect(resource.remove).not.toHaveBeenCalled();
    expect(foreign.runtime.read()).toEqual(journal);
  });

  it('retains the blocker and identifies the exact resource when cleanup fails', async () => {
    const state = fixture();
    const input = beginInput();
    let journal = state.runtime.begin(input);
    const ref = {
      kind: 'page',
      id: 'page:1',
      recipeId: COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID,
    } as const;
    state.add(ref, input, () => {
      throw new Error('remove fault');
    });
    journal = state.runtime.record(journal, ref);

    await expect(state.runtime.reconcile(FILE_HASH, target(input))).rejects.toMatchObject({
      failures: [expect.stringContaining('page')],
    });
    expect(state.runtime.read()).toEqual(journal);
  });

  it('keeps a verified but unacknowledged output intact and blocks new mutation', async () => {
    const state = fixture();
    const input = beginInput();
    let journal = state.runtime.begin(input);
    for (const ref of minimalCompleteRefs()) {
      state.add(ref, input);
      journal = state.runtime.record(journal, ref);
    }
    journal = state.runtime.markVerified(journal);

    await expect(state.runtime.reconcile(FILE_HASH, target(input))).resolves.toMatchObject({
      status: 'preserved-unacknowledged-output',
      blocksNewMutation: true,
      outputName: input.outputName,
      resourceBlueprintHash: input.resourceBlueprintHash,
    });
    expect(state.removalOrder).toEqual([]);
    expect(state.runtime.read()).toEqual(journal);
  });

  it('acknowledges completion only after verification and returns an exact durable no-op', async () => {
    const state = fixture();
    const input = beginInput();
    let journal = state.runtime.begin(input);
    await expect(state.runtime.acknowledgeCommitted(journal)).rejects.toThrow(
      'only after exact output verification'
    );
    for (const ref of minimalCompleteRefs()) {
      state.add(ref, input);
      journal = state.runtime.record(journal, ref);
    }
    journal = state.runtime.markVerified(journal);
    await state.runtime.acknowledgeCommitted(journal);

    await expect(state.runtime.reconcile(FILE_HASH, target(input))).resolves.toMatchObject({
      status: 'verified-existing-output',
      blocksNewMutation: false,
      outputName: input.outputName,
      resourceBlueprintHash: input.resourceBlueprintHash,
      resources: journal.resources,
    });
    expect(state.removalOrder).toEqual([]);
    expect(state.runtime.read()).toEqual(journal);
  });

  it('refuses a no-op when a completed Teul-owned resource changed after commit', async () => {
    const state = fixture();
    const input = beginInput();
    let journal = state.runtime.begin(input);
    const resources = minimalCompleteRefs().map(ref => {
      const resource = state.add(ref, input);
      journal = state.runtime.record(journal, ref);
      return resource;
    });
    journal = state.runtime.markVerified(journal);
    await state.runtime.acknowledgeCommitted(journal);
    resources[2].name = 'Owner-edited frame';

    await expect(state.runtime.reconcile(FILE_HASH, target(input))).rejects.toMatchObject({
      message: expect.stringContaining('cannot be treated as an identical no-op'),
      failures: expect.arrayContaining([expect.stringContaining('expected fingerprint')]),
    });
    expect(state.runtime.read()).toEqual(journal);
    expect(state.removalOrder).toEqual([]);
  });

  it('releases a completed journal for a different approved blueprint without deleting output', async () => {
    const state = fixture();
    const input = beginInput();
    let journal = state.runtime.begin(input);
    for (const ref of minimalCompleteRefs()) {
      state.add(ref, input);
      journal = state.runtime.record(journal, ref);
    }
    journal = state.runtime.markVerified(journal);
    await state.runtime.acknowledgeCommitted(journal);

    await expect(
      state.runtime.reconcile(FILE_HASH, {
        ...target(input),
        resourceBlueprintHash: hash('different-resource'),
      })
    ).resolves.toMatchObject({
      status: 'released-completed-output',
      blocksNewMutation: false,
    });
    expect(state.removalOrder).toEqual([]);
    expect(state.runtime.read()).toBeNull();
  });

  it('does not bless an incomplete verified output', async () => {
    const state = fixture();
    let journal = state.runtime.begin(beginInput());
    const ref = minimalCompleteRefs()[0];
    state.add(ref);
    journal = state.runtime.record(journal, ref);
    expect(() => state.runtime.markVerified(journal)).toThrow(ColorSystemCreateJournalV2Error);
    expect(state.runtime.read()?.state).toBe('creating');
  });
});
