import { describe, expect, it, vi } from 'vitest';
import { canonicalJson, deterministicContentHash } from '../../lib/colorSystemHashing';
import { utf8ByteLength } from '../../lib/utf8';
import {
  COLOR_SYSTEM_CREATE_COMPLETION_V2_KEY,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_CHECKPOINT_INTERVAL,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_LEGACY_MANIFEST_VERSION,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_MANIFEST_VERSION,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_ENTRY_BYTES,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION,
  ColorSystemCreateJournalV2Error,
  colorSystemCreateCompletionStorageKeyV2,
  colorSystemCreateJournalEntryKeyV2,
  colorSystemCreateJournalHeaderKeyV2,
  createColorSystemCreateJournalRuntimeV2,
  createFigmaColorSystemCreateJournalHostV2,
  type BeginColorSystemCreateJournalV2Input,
  type ColorSystemCreateJournalHostV2,
  type ColorSystemCreateJournalResourceRefV2,
  type ColorSystemCreateJournalResolvedResourceV2,
  type ColorSystemCreateJournalV2,
} from '../colorSystemCreateJournalV2';
import { COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION } from '../colorSystemResourceOwnershipV2';

function hash(label: string): string {
  return deterministicContentHash({ label });
}

const AUTHORIZATION_HASH = hash('authorization');
const FILE_HASH = hash('file');
const HEADER_KEY = colorSystemCreateJournalHeaderKeyV2();

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

interface FixtureOptions {
  failManifestWrites?: boolean;
  /** Throws on the n-th (1-based) manifest write to simulate an interrupted checkpoint. */
  failManifestWriteAt?: number;
  enumerateKeys?: boolean;
}

function fixture(options: FixtureOptions = {}) {
  const rootData = new Map<string, string>();
  const completionAcknowledgements = new Map<string, unknown>();
  const resources = new Map<string, ColorSystemCreateJournalResolvedResourceV2>();
  const removalOrder: string[] = [];
  const writes: Array<{ key: string; value: string }> = [];
  let manifestWrites = 0;
  const host: ColorSystemCreateJournalHostV2 = {
    getRootPluginData: key => rootData.get(key) ?? '',
    setRootPluginData: (key, value) => {
      if (key === COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY && value) {
        manifestWrites += 1;
        if (options.failManifestWrites || options.failManifestWriteAt === manifestWrites) {
          throw new Error('root plugin-data write failed');
        }
      }
      writes.push({ key, value });
      if (value) rootData.set(key, value);
      else rootData.delete(key);
    },
    ...(options.enumerateKeys === false
      ? {}
      : { getRootPluginDataKeys: () => [...rootData.keys()] }),
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
  const journalKeys = () =>
    [...rootData.keys()].filter(key => key.startsWith(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY)).sort();
  return { rootData, resources, removalOrder, writes, host, runtime, add, journalKeys };
}

type Fixture = ReturnType<typeof fixture>;

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

function manyRefs(variables: number): ColorSystemCreateJournalResourceRefV2[] {
  return [
    { kind: 'collection', id: 'collection:1', recipeId: 'collection/primitives' },
    { kind: 'collection', id: 'collection:2', recipeId: 'collection/semantics' },
    ...Array.from({ length: variables }, (_, index) => ({
      kind: 'variable' as const,
      id: `VariableID:${index}:${index * 3}`,
      recipeId: `variable/primitive/secondary/family-${index % 7}/step-${index}`,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      kind: 'frame' as const,
      id: `frame:${index}`,
      recipeId: `frame/${index}`,
    })),
    { kind: 'page', id: 'page:1', recipeId: COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID },
  ];
}

function recordAll(
  state: Fixture,
  input: BeginColorSystemCreateJournalV2Input,
  refs: readonly ColorSystemCreateJournalResourceRefV2[],
  register = true
): ColorSystemCreateJournalV2 {
  let journal = state.runtime.begin(input);
  for (const ref of refs) {
    if (register) state.add(ref, input);
    journal = state.runtime.record(journal, ref);
  }
  return journal;
}

function verifiedFixture() {
  const state = fixture();
  const input = beginInput();
  const journal = state.runtime.markVerified(recordAll(state, input, minimalCompleteRefs()));
  return { ...state, input, journal };
}

function parseManifest(state: Fixture): {
  version: string;
  state: string;
  resourceCount: number;
  chainHash: string;
  headerHash: string;
} {
  return JSON.parse(state.rootData.get(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY) ?? '{}');
}

/** Writes a journal in the pre-remediation two-generation chunk layout. */
function seedLegacyJournal(
  state: Fixture,
  input: BeginColorSystemCreateJournalV2Input,
  refs: readonly ColorSystemCreateJournalResourceRefV2[],
  options: { generation?: 0 | 1; chunkChars?: number; state?: 'creating' | 'verified' } = {}
): string {
  const content = {
    version: COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION,
    state: options.state ?? 'creating',
    transactionId: input.transactionId,
    requestId: input.requestId,
    sessionId: input.sessionId,
    currentFileIdentityHash: input.currentFileIdentityHash,
    sourceAuthorityHash: input.sourceAuthorityHash,
    liveSourceHash: input.liveSourceHash,
    briefHash: input.briefHash,
    strategySetHash: input.strategySetHash,
    candidateHash: input.candidateHash,
    applicationBlueprintHash: input.applicationBlueprintHash,
    sectionBlueprintHash: input.sectionBlueprintHash,
    resourceBlueprintHash: input.resourceBlueprintHash,
    reviewHash: input.reviewHash,
    approvalHash: input.approvalHash,
    createAuthorizationHash: input.createAuthorizationHash,
    outputAction: input.outputAction,
    outputName: input.outputName,
    outputPageName: input.outputPageName,
    systemId: input.systemId,
    expectedCounts: {
      collections: 2,
      variables: input.counts.variables,
      styles: input.counts.styles,
      components: input.counts.components,
      frames: 5,
      pages: 1,
    },
    resources: refs,
  };
  const journalHash = deterministicContentHash(content);
  const raw = canonicalJson({ ...content, journalHash });
  const generation = options.generation ?? 1;
  const chunkChars = options.chunkChars ?? raw.length;
  const chunks: string[] = [];
  for (let start = 0; start < raw.length; start += chunkChars) {
    chunks.push(raw.slice(start, start + chunkChars));
  }
  chunks.forEach((chunk, index) =>
    state.rootData.set(`${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-g${generation}-chunk-${index}`, chunk)
  );
  const manifestContent = {
    version: COLOR_SYSTEM_CREATE_JOURNAL_V2_LEGACY_MANIFEST_VERSION,
    generation,
    chunkCount: chunks.length,
    byteLength: utf8ByteLength(raw),
    journalHash,
  };
  state.rootData.set(
    COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY,
    canonicalJson({ ...manifestContent, manifestHash: deterministicContentHash(manifestContent) })
  );
  return journalHash;
}

describe('persistent v2 Create transaction journal', () => {
  it('retains legacy name limits of 128 characters and page-name limits of 180', () => {
    const input = {
      ...beginInput(),
      outputName: 'N'.repeat(128),
      outputPageName: 'P'.repeat(180),
    };
    const state = fixture();
    state.runtime.begin(input);
    expect(createColorSystemCreateJournalRuntimeV2(state.host).read()).toMatchObject({
      outputName: input.outputName,
      outputPageName: input.outputPageName,
    });
    for (const invalid of [
      { ...input, outputName: 'N'.repeat(129) },
      { ...input, outputPageName: 'P'.repeat(181) },
    ]) {
      const rejected = fixture();
      rejected.runtime.begin(invalid);
      expect(() => createColorSystemCreateJournalRuntimeV2(rejected.host).read()).toThrow();
    }
  });

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
        getPluginDataKeys: () => [...rootData.keys()],
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

    rootData.set(`${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-r-0`, 'entry');
    expect(host.getRootPluginDataKeys?.()).toEqual([`${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-r-0`]);
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
    expect(state.journalKeys()).toEqual([COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY, HEADER_KEY].sort());
    expect(parseManifest(state)).toMatchObject({
      version: COLOR_SYSTEM_CREATE_JOURNAL_V2_MANIFEST_VERSION,
      state: 'creating',
      resourceCount: 0,
    });
  });

  it('stores the production-sized 418-resource ledger as one bounded entry per resource', () => {
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
        recipeId: `variable/${index}/${'é'.repeat(120)}`,
      })),
      ...Array.from({ length: 192 }, (_, index) => ({
        kind: 'style' as const,
        id: `style:${index}`,
        recipeId: `style/${index}/${'한'.repeat(120)}`,
      })),
      ...Array.from({ length: 26 }, (_, index) => ({
        kind: 'component' as const,
        id: `component:${index}`,
        recipeId: `component/${index}/${'🎨'.repeat(60)}`,
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

    const keys = state.journalKeys();
    expect(keys).toHaveLength(418 + 2);
    expect(
      keys.filter(key => key.startsWith(`${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-r-`))
    ).toHaveLength(418);
    for (const key of keys) {
      expect(utf8ByteLength(state.rootData.get(key) ?? '')).toBeLessThanOrEqual(
        COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_ENTRY_BYTES
      );
    }
    expect(parseManifest(state)).toMatchObject({ state: 'verified', resourceCount: 418 });
    expect(state.runtime.read()).toEqual(journal);
    expect(journal.resources).toHaveLength(418);
    expect(journal.resources).toEqual(refs);
  }, 30_000);

  it('treats the first manifest write failure as a pre-mutation blocker and leaves no header behind', () => {
    const state = fixture({ failManifestWrites: true });
    expect(() => state.runtime.begin(beginInput())).toThrow('root plugin-data write failed');
    expect(state.rootData.has(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY)).toBe(false);
    expect(state.journalKeys()).toEqual([]);
  });

  it('detects header and tail-entry tampering before the cached record fast path can mutate', () => {
    const tamperedHeader = fixture();
    const journal = tamperedHeader.runtime.begin(beginInput());
    const header = tamperedHeader.rootData.get(HEADER_KEY);
    expect(header).toContain('Studio');
    tamperedHeader.rootData.set(HEADER_KEY, header?.replace('Studio', 'Tamper') ?? '');
    expect(() =>
      tamperedHeader.runtime.record(journal, {
        kind: 'collection',
        id: 'collection:1',
        recipeId: 'collection/primitives',
      })
    ).toThrow('hash validation');

    const tamperedTail = fixture();
    const input = beginInput({ variables: 3 });
    const tailJournal = recordAll(tamperedTail, input, manyRefs(3).slice(0, 4), false);
    const tailKey = colorSystemCreateJournalEntryKeyV2(3);
    const entry = tamperedTail.rootData.get(tailKey) ?? '';
    expect(entry).toContain('VariableID:1:3');
    tamperedTail.rootData.set(tailKey, entry.replace('VariableID:1:3', 'VariableID:9:9'));
    expect(() =>
      tamperedTail.runtime.record(tailJournal, {
        kind: 'frame',
        id: 'frame:0',
        recipeId: 'frame/0',
      })
    ).toThrow('entry 3 failed hash validation');
  });

  it('fails closed on a tampered or deleted checkpointed entry before any deletion or verification', async () => {
    const input = beginInput({ variables: 40 });
    const refs = manyRefs(40);
    const tampered = fixture();
    const journal = recordAll(tampered, input, refs);
    expect(parseManifest(tampered).resourceCount).toBeGreaterThanOrEqual(
      COLOR_SYSTEM_CREATE_JOURNAL_V2_CHECKPOINT_INTERVAL
    );
    const checkpointedKey = colorSystemCreateJournalEntryKeyV2(2);
    const entry = tampered.rootData.get(checkpointedKey) ?? '';
    tampered.rootData.set(checkpointedKey, entry.replace('VariableID:0:0', 'VariableID:8:8'));

    expect(() => tampered.runtime.markVerified(journal)).toThrow('entry 2 failed hash validation');
    await expect(tampered.runtime.reconcile(FILE_HASH, target(input))).rejects.toThrow(
      'entry 2 failed hash validation'
    );
    expect(tampered.removalOrder).toEqual([]);

    const deleted = fixture();
    recordAll(deleted, input, refs);
    deleted.rootData.delete(colorSystemCreateJournalEntryKeyV2(5));
    await expect(deleted.runtime.reconcile(FILE_HASH, target(input))).rejects.toThrow(
      'entry 5 is missing'
    );
    expect(deleted.removalOrder).toEqual([]);
  });

  it('fails closed when a verified journal carries entries beyond its verified checkpoint', () => {
    const state = fixture();
    const input = beginInput();
    let journal = recordAll(state, input, minimalCompleteRefs());
    journal = state.runtime.markVerified(journal);
    const extraKey = colorSystemCreateJournalEntryKeyV2(journal.resources.length);
    state.rootData.set(extraKey, state.rootData.get(colorSystemCreateJournalEntryKeyV2(0)) ?? '');

    expect(() => state.runtime.read()).toThrow('beyond its verified checkpoint');
  });

  it('does not rewrite anything when the same resource is recorded twice', () => {
    const state = fixture();
    const input = beginInput({ variables: 2 });
    const refs = manyRefs(2);
    let journal = state.runtime.begin(input);
    journal = state.runtime.record(journal, refs[0]);
    const writesBefore = state.writes.length;
    const replayed = state.runtime.record(journal, refs[0]);
    expect(replayed).toBe(journal);
    expect(state.writes).toHaveLength(writesBefore);
  });

  it('recovers entries written after an interrupted checkpoint and reconciles them exactly', async () => {
    // Manifest writes: 1 = begin, 2 = first group checkpoint (when entry 16 opens the next group).
    const state = fixture({ failManifestWriteAt: 2 });
    const input = beginInput({ variables: 40 });
    const refs = manyRefs(40);
    let journal = state.runtime.begin(input);
    let failure: unknown = null;
    let recorded = 0;
    for (const ref of refs) {
      state.add(ref, input);
      try {
        journal = state.runtime.record(journal, ref);
        recorded += 1;
      } catch (error) {
        failure = error;
        break;
      }
    }
    expect(failure).toBeInstanceOf(Error);
    expect(recorded).toBe(COLOR_SYSTEM_CREATE_JOURNAL_V2_CHECKPOINT_INTERVAL);
    // The interrupted record still persisted its entry before the checkpoint failed.
    expect(state.rootData.has(colorSystemCreateJournalEntryKeyV2(recorded))).toBe(true);
    expect(parseManifest(state).resourceCount).toBe(0);

    const restarted = createColorSystemCreateJournalRuntimeV2(state.host);
    const recovered = restarted.read();
    expect(recovered?.resources).toEqual(refs.slice(0, recorded + 1));
    await expect(restarted.reconcile(FILE_HASH, target(input))).resolves.toMatchObject({
      status: 'cleaned-interrupted-output',
      removedResourceCount: recorded + 1,
    });
    expect(state.journalKeys()).toEqual([]);
    // Every resource registered before the interruption was journaled and removed.
    expect(state.removalOrder).toHaveLength(recorded + 1);
    expect(state.resources.size).toBe(0);
  });

  it('clear deletes every journal key of both layouts, with and without key enumeration', async () => {
    for (const enumerateKeys of [true, false]) {
      const state = fixture({ enumerateKeys });
      const input = beginInput({ variables: 20 });
      // Orphans from the pre-remediation layout survive in real files.
      for (let index = 0; index < 3; index += 1) {
        state.rootData.set(`${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-g0-chunk-${index}`, 'stale-g0');
      }
      state.rootData.set(`${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-g1-chunk-0`, 'stale-g1');
      state.rootData.set('teul-unrelated-key', 'keep');
      let journal = recordAll(state, input, manyRefs(20));
      journal = state.runtime.markVerified(journal);
      expect(state.journalKeys().length).toBeGreaterThan(20);

      state.runtime.clear(journal.transactionId);

      expect(state.host.getRootPluginDataKeys?.() ?? [...state.rootData.keys()]).toEqual([
        'teul-unrelated-key',
      ]);
      expect(state.runtime.read()).toBeNull();
    }
  });

  it('clear refuses a different transaction and reconcile cleanup leaves no journal key', async () => {
    const state = fixture();
    const input = beginInput({ variables: 5 });
    recordAll(state, input, manyRefs(5));
    expect(() => state.runtime.clear(`teul-create-v2:${'0'.repeat(64)}`)).toThrow(
      'Refused to clear a different v2 Create journal.'
    );
    await expect(state.runtime.reconcile(FILE_HASH, target(input))).resolves.toMatchObject({
      status: 'cleaned-interrupted-output',
      removedResourceCount: 13,
    });
    expect(state.journalKeys()).toEqual([]);
  });

  it('begin sweeps stale payload keys that no manifest describes', () => {
    const state = fixture({ enumerateKeys: false });
    state.rootData.set(HEADER_KEY, 'stale-header');
    state.rootData.set(colorSystemCreateJournalEntryKeyV2(0), 'stale-entry');
    state.rootData.set(colorSystemCreateJournalEntryKeyV2(1), 'stale-entry');
    state.rootData.set(`${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-g1-chunk-0`, 'stale-chunk');

    const journal = state.runtime.begin(beginInput());

    expect(state.journalKeys()).toEqual([COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY, HEADER_KEY].sort());
    expect(state.runtime.read()).toEqual(journal);
  });

  it('reads a legacy two-generation journal, reconciles it, and removes every legacy key', async () => {
    const state = fixture();
    const input = beginInput({ variables: 3 });
    const refs = manyRefs(3);
    refs.forEach(ref => state.add(ref, input));
    const legacyHash = seedLegacyJournal(state, input, refs, { generation: 1, chunkChars: 200 });

    const legacy = state.runtime.read();
    expect(legacy).toMatchObject({
      state: 'creating',
      transactionId: input.transactionId,
      journalHash: legacyHash,
      resources: refs,
    });
    expect(() =>
      state.runtime.record(legacy as ColorSystemCreateJournalV2, {
        kind: 'style',
        id: 'style:new',
        recipeId: 'style/new',
      })
    ).toThrow('legacy-format');

    await expect(state.runtime.reconcile(FILE_HASH, target(input))).resolves.toMatchObject({
      status: 'cleaned-interrupted-output',
      removedResourceCount: refs.length,
    });
    expect(state.removalOrder.slice(0, 5)).toEqual(['frame', 'frame', 'frame', 'frame', 'frame']);
    expect(state.removalOrder[state.removalOrder.length - 1]).toBe('page');
    expect(state.journalKeys()).toEqual([]);
  });

  it('rejects a legacy journal whose chunks were altered', () => {
    const state = fixture();
    const input = beginInput();
    seedLegacyJournal(state, input, minimalCompleteRefs(), { generation: 0, chunkChars: 150 });
    const key = `${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-g0-chunk-1`;
    state.rootData.set(key, `${state.rootData.get(key)}x`);
    expect(() => state.runtime.read()).toThrow('byte length is inconsistent');
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

    // A fresh runtime (plugin restart) reaches the same verified no-op from disk alone.
    const restarted = createColorSystemCreateJournalRuntimeV2(state.host);
    await expect(restarted.reconcile(FILE_HASH, target(input))).resolves.toMatchObject({
      status: 'verified-existing-output',
      resources: journal.resources,
    });
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

  it('retries failed completion persistence with the original fingerprint and exact completion', async () => {
    const state = verifiedFixture();
    vi.mocked(state.host.setCompletionAcknowledgement).mockRejectedValueOnce(
      new Error('save failed')
    );
    await expect(state.runtime.acknowledgeCommitted(state.journal)).rejects.toThrow('save failed');
    const firstCompletion = vi.mocked(state.host.setCompletionAcknowledgement).mock.calls[0];

    await expect(state.runtime.reconcile(FILE_HASH, target(state.input))).resolves.toMatchObject({
      status: 'verified-existing-output',
      resources: state.journal.resources,
    });
    expect(vi.mocked(state.host.setCompletionAcknowledgement).mock.calls[1]).toEqual(
      firstCompletion
    );
    expect(state.runtime.read()).toEqual(state.journal);
    expect(state.removalOrder).toEqual([]);
  });

  it('preserves changed output after a failed save without replacing the original completion', async () => {
    const state = verifiedFixture();
    vi.mocked(state.host.setCompletionAcknowledgement).mockRejectedValueOnce(
      new Error('save failed')
    );
    await expect(state.runtime.acknowledgeCommitted(state.journal)).rejects.toThrow('save failed');
    state.resources.get('frame:frame:0')!.name = 'Edited after the failed acknowledgement';

    await expect(state.runtime.acknowledgeCommitted(state.journal)).rejects.toThrow(
      /changed after Create/
    );
    await expect(state.runtime.reconcile(FILE_HASH, target(state.input))).resolves.toMatchObject({
      status: 'preserved-unacknowledged-output',
      blocksNewMutation: true,
    });
    expect(state.host.setCompletionAcknowledgement).toHaveBeenCalledTimes(1);
    expect(state.runtime.read()).toEqual(state.journal);
    expect(state.removalOrder).toEqual([]);
  });

  it.each(['unavailable', 'invalid'] as const)(
    'keeps the output blocked when its first committed fingerprint is %s',
    async failure => {
      const state = verifiedFixture();
      const fingerprint = vi.mocked(state.host.fingerprintResources);
      if (failure === 'unavailable') fingerprint.mockRejectedValueOnce(new Error('lookup failed'));
      else fingerprint.mockResolvedValueOnce('invalid fingerprint');
      await expect(state.runtime.acknowledgeCommitted(state.journal)).rejects.toThrow();

      await expect(state.runtime.acknowledgeCommitted(state.journal)).rejects.toThrow(
        /original.*unavailable/
      );
      await expect(state.runtime.reconcile(FILE_HASH, target(state.input))).resolves.toMatchObject({
        status: 'preserved-unacknowledged-output',
        blocksNewMutation: true,
      });
      expect(fingerprint).toHaveBeenCalledTimes(1);
      expect(state.host.setCompletionAcknowledgement).not.toHaveBeenCalled();
      expect(state.runtime.read()).toEqual(state.journal);
      expect(state.removalOrder).toEqual([]);
    }
  );

  it.each([false, true])(
    'retains the first fingerprint after failed completion readback (edited: %s)',
    async edited => {
      const state = verifiedFixture();
      vi.mocked(state.host.getCompletionAcknowledgement).mockResolvedValueOnce(undefined);
      await expect(state.runtime.acknowledgeCommitted(state.journal)).rejects.toThrow(
        /read back exactly/
      );
      const firstCompletion = vi.mocked(state.host.setCompletionAcknowledgement).mock.calls[0];
      if (edited) state.resources.get('frame:frame:0')!.name = 'Edited after failed readback';
      // Simulate a retry where the acknowledgement is still unavailable to the reader.
      vi.mocked(state.host.getCompletionAcknowledgement).mockResolvedValueOnce(undefined);
      await expect(state.runtime.reconcile(FILE_HASH, target(state.input))).resolves.toMatchObject({
        status: edited ? 'preserved-unacknowledged-output' : 'verified-existing-output',
        blocksNewMutation: edited,
      });
      expect(state.host.setCompletionAcknowledgement).toHaveBeenCalledTimes(edited ? 1 : 2);
      if (!edited)
        expect(vi.mocked(state.host.setCompletionAcknowledgement).mock.calls[1]).toEqual(
          firstCompletion
        );
      expect(state.runtime.read()).toEqual(state.journal);
      expect(state.removalOrder).toEqual([]);
    }
  );

  it('rejects an edit during acknowledgement persistence even when write and readback succeed', async () => {
    const state = verifiedFixture();
    const set = state.host.setCompletionAcknowledgement;
    vi.mocked(state.host.getCompletionAcknowledgement).mockImplementationOnce(async file => {
      state.resources.get('frame:frame:0')!.name = 'Edited during readback';
      return vi.mocked(set).mock.calls.find(([savedFile]) => savedFile === file)?.[1];
    });
    await expect(state.runtime.acknowledgeCommitted(state.journal)).rejects.toThrow(
      /changed after Create/
    );
    await expect(state.runtime.reconcile(FILE_HASH, target(state.input))).rejects.toThrow(
      /changed after Create/
    );
    expect(state.host.setCompletionAcknowledgement).toHaveBeenCalledTimes(1);
    expect(state.runtime.read()).toEqual(state.journal);
    expect(state.removalOrder).toEqual([]);
  });

  it('rechecks journal identity after fingerprint awaits before persisting completion', async () => {
    const state = verifiedFixture();
    const fingerprint = state.host.fingerprintResources;
    state.host.fingerprintResources = async refs => {
      const original = await fingerprint(refs);
      state.rootData.delete(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY);
      return original;
    };
    await expect(state.runtime.acknowledgeCommitted(state.journal)).rejects.toThrow(
      /journal changed/
    );
    expect(state.host.setCompletionAcknowledgement).not.toHaveBeenCalled();
    expect(state.removalOrder).toEqual([]);
  });

  it('clears unavailable runtime evidence when the owning journal is explicitly cleared', async () => {
    const state = verifiedFixture();
    vi.mocked(state.host.fingerprintResources).mockRejectedValueOnce(new Error('lookup failed'));
    await expect(state.runtime.acknowledgeCommitted(state.journal)).rejects.toThrow(
      'lookup failed'
    );
    state.runtime.clear(state.journal.transactionId);
    const next = state.runtime.markVerified(recordAll(state, state.input, minimalCompleteRefs()));
    await expect(state.runtime.acknowledgeCommitted(next)).resolves.toBeUndefined();
    await expect(state.runtime.reconcile(FILE_HASH, target(state.input))).resolves.toMatchObject({
      status: 'verified-existing-output',
    });
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
    expect(state.journalKeys()).toEqual([]);
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
