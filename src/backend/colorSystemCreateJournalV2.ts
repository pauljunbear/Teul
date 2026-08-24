import { canonicalJson, deterministicContentHash } from '../lib/colorSystemAudit';
import { utf8ByteLength } from '../lib/utf8';
import type { ColorSystemCreateActionV2 } from '../lib/colorSystemCreateAuthorizationV2';
import type { ColorSystemResourceBlueprintCountsV2 } from '../lib/colorSystemResourceBlueprintV2';
import {
  COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA,
  COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION,
} from './colorSystemResourceOwnershipV2';

export const COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY = 'teul-color-system-create-journal-v2';
export const COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION =
  'teul-color-system-create-journal/v2' as const;
export const COLOR_SYSTEM_CREATE_JOURNAL_V2_MANIFEST_VERSION =
  'teul-color-system-create-journal-manifest/v2' as const;
export const COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_CHUNKS = 32;
export const COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_CHUNK_BYTES = 64 * 1024;
export const COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID = 'resource/documentation-page' as const;
export const COLOR_SYSTEM_CREATE_COMPLETION_V2_KEY =
  'teul-color-system-create-completion-v2' as const;
export const COLOR_SYSTEM_CREATE_COMPLETION_V2_VERSION =
  'teul-color-system-create-completion/v2' as const;

const HASH = /^sha256:[0-9a-f]{64}$/;
const RECEIPT_ID = /^teul-create-v2:[0-9a-f]{64}$/;
const MAX_TEXT = 256;
const MAX_RESOURCES = 2_048;

export function colorSystemCreateCompletionStorageKeyV2(currentFileIdentityHash: string): string {
  if (!HASH.test(currentFileIdentityHash)) {
    throw new ColorSystemCreateJournalV2Error(
      'A valid current-file identity is required for durable completion storage.'
    );
  }
  return `${COLOR_SYSTEM_CREATE_COMPLETION_V2_KEY}:${currentFileIdentityHash.slice('sha256:'.length)}`;
}

export type ColorSystemCreateJournalResourceKindV2 =
  | 'collection'
  | 'variable'
  | 'style'
  | 'component'
  | 'frame'
  | 'page';

export interface ColorSystemCreateJournalResourceRefV2 {
  kind: ColorSystemCreateJournalResourceKindV2;
  id: string;
  recipeId: string;
}

export interface ColorSystemCreateJournalExpectedCountsV2 {
  collections: number;
  variables: number;
  styles: number;
  components: number;
  frames: number;
  pages: 1;
}

interface ColorSystemCreateJournalContentV2 {
  version: typeof COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION;
  state: 'creating' | 'verified';
  transactionId: string;
  requestId: string;
  sessionId: string;
  currentFileIdentityHash: string;
  sourceAuthorityHash: string;
  liveSourceHash: string;
  briefHash: string;
  strategySetHash: string;
  candidateHash: string;
  applicationBlueprintHash: string;
  sectionBlueprintHash: string;
  resourceBlueprintHash: string;
  reviewHash: string;
  approvalHash: string;
  createAuthorizationHash: string;
  outputAction: ColorSystemCreateActionV2;
  outputName: string;
  outputPageName: string;
  systemId: string;
  expectedCounts: ColorSystemCreateJournalExpectedCountsV2;
  resources: readonly ColorSystemCreateJournalResourceRefV2[];
}

export interface ColorSystemCreateJournalV2 extends ColorSystemCreateJournalContentV2 {
  journalHash: string;
}

export interface BeginColorSystemCreateJournalV2Input {
  transactionId: string;
  requestId: string;
  sessionId: string;
  currentFileIdentityHash: string;
  sourceAuthorityHash: string;
  liveSourceHash: string;
  briefHash: string;
  strategySetHash: string;
  candidateHash: string;
  applicationBlueprintHash: string;
  sectionBlueprintHash: string;
  resourceBlueprintHash: string;
  reviewHash: string;
  approvalHash: string;
  createAuthorizationHash: string;
  outputAction: ColorSystemCreateActionV2;
  outputName: string;
  outputPageName: string;
  systemId: string;
  counts: ColorSystemResourceBlueprintCountsV2;
}

interface JournalManifestV2 {
  version: typeof COLOR_SYSTEM_CREATE_JOURNAL_V2_MANIFEST_VERSION;
  generation: 0 | 1;
  chunkCount: number;
  byteLength: number;
  journalHash: string;
  manifestHash: string;
}

export interface ColorSystemCreateJournalResolvedResourceV2 {
  id: string;
  kind: ColorSystemCreateJournalResourceKindV2;
  name?: string;
  remote?: boolean;
  ownership: {
    version: string;
    transactionId: string;
    systemId: string;
    recipeId: string;
    resourceBlueprintHash: string;
    sectionBlueprintHash: string;
    resourceKind: string;
  };
  remove(): void | Promise<void>;
}

export interface ColorSystemCreateJournalHostV2 {
  getRootPluginData(key: string): string;
  setRootPluginData(key: string, value: string): void;
  getCompletionAcknowledgement(currentFileIdentityHash: string): Promise<unknown>;
  setCompletionAcknowledgement(currentFileIdentityHash: string, value: string): Promise<void>;
  clearCompletionAcknowledgement(currentFileIdentityHash: string): Promise<void>;
  fingerprintResources(refs: readonly ColorSystemCreateJournalResourceRefV2[]): Promise<string>;
  loadAllPages(): Promise<void>;
  resolveResource(
    ref: ColorSystemCreateJournalResourceRefV2
  ): Promise<ColorSystemCreateJournalResolvedResourceV2 | null>;
}

export interface ColorSystemCreateJournalTargetV2 {
  systemId: string;
  resourceBlueprintHash: string;
  sectionBlueprintHash: string;
}

export type ColorSystemCreateJournalReconciliationV2 =
  | { status: 'none'; removedResourceCount: 0; blocksNewMutation: false }
  | {
      status: 'cleaned-interrupted-output';
      removedResourceCount: number;
      blocksNewMutation: false;
      transactionId: string;
    }
  | {
      status: 'verified-existing-output';
      removedResourceCount: 0;
      blocksNewMutation: false;
      transactionId: string;
      outputName: string;
      systemId: string;
      resourceBlueprintHash: string;
      sectionBlueprintHash: string;
      resources: readonly ColorSystemCreateJournalResourceRefV2[];
    }
  | {
      status: 'released-completed-output';
      removedResourceCount: 0;
      blocksNewMutation: false;
      transactionId: string;
    }
  | {
      status: 'preserved-unacknowledged-output';
      removedResourceCount: 0;
      blocksNewMutation: true;
      transactionId: string;
      outputName: string;
      resourceBlueprintHash: string;
    };

export class ColorSystemCreateJournalV2Error extends Error {
  constructor(
    message: string,
    readonly failures: readonly string[] = []
  ) {
    super(message);
    this.name = 'ColorSystemCreateJournalV2Error';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function text(value: unknown, max = MAX_TEXT): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= max &&
    ![...value].some(character => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  );
}

function chunkKey(generation: 0 | 1, index: number): string {
  return `${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-g${generation}-chunk-${index}`;
}

function contentOf(journal: ColorSystemCreateJournalV2): ColorSystemCreateJournalContentV2 {
  const { journalHash: _journalHash, ...content } = journal;
  return content;
}

function withHash(content: ColorSystemCreateJournalContentV2): ColorSystemCreateJournalV2 {
  return { ...content, journalHash: deterministicContentHash(content) };
}

interface ColorSystemCreateCompletionContentV2 {
  version: typeof COLOR_SYSTEM_CREATE_COMPLETION_V2_VERSION;
  transactionId: string;
  currentFileIdentityHash: string;
  journalHash: string;
  resourceBlueprintHash: string;
  sectionBlueprintHash: string;
  outputFingerprint: string;
}

interface ColorSystemCreateCompletionV2 extends ColorSystemCreateCompletionContentV2 {
  completionHash: string;
}

function withCompletionHash(
  content: ColorSystemCreateCompletionContentV2
): ColorSystemCreateCompletionV2 {
  return { ...content, completionHash: deterministicContentHash(content) };
}

function parseCompletion(value: unknown): ColorSystemCreateCompletionV2 | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create completion acknowledgement is not serialized text.'
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create completion acknowledgement is not valid JSON.'
    );
  }
  const keys = [
    'version',
    'transactionId',
    'currentFileIdentityHash',
    'journalHash',
    'resourceBlueprintHash',
    'sectionBlueprintHash',
    'outputFingerprint',
    'completionHash',
  ];
  if (
    !isRecord(parsed) ||
    !onlyKeys(parsed, keys) ||
    parsed.version !== COLOR_SYSTEM_CREATE_COMPLETION_V2_VERSION ||
    typeof parsed.transactionId !== 'string' ||
    !RECEIPT_ID.test(parsed.transactionId) ||
    ![
      'currentFileIdentityHash',
      'journalHash',
      'resourceBlueprintHash',
      'sectionBlueprintHash',
      'outputFingerprint',
      'completionHash',
    ].every(key => typeof parsed[key] === 'string' && HASH.test(parsed[key] as string))
  ) {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create completion acknowledgement failed strict validation.'
    );
  }
  const completion = parsed as unknown as ColorSystemCreateCompletionV2;
  const { completionHash, ...content } = completion;
  if (deterministicContentHash(content) !== completionHash) {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create completion acknowledgement failed hash validation.'
    );
  }
  return completion;
}

function manifestHash(manifest: Omit<JournalManifestV2, 'manifestHash'>): string {
  return deterministicContentHash(manifest);
}

function splitUtf8(value: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let low = start + 1;
    let high = value.length;
    let best = start;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (
        utf8ByteLength(value.slice(start, middle)) <= COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_CHUNK_BYTES
      ) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (best === start)
      throw new ColorSystemCreateJournalV2Error('Journal contains an unwriteable UTF-8 value.');
    chunks.push(value.slice(start, best));
    start = best;
  }
  if (chunks.length > COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_CHUNKS) {
    throw new ColorSystemCreateJournalV2Error(
      `Create journal exceeds ${COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_CHUNKS} plugin-data chunks.`
    );
  }
  return chunks;
}

function parseManifest(raw: string): JournalManifestV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create journal manifest is not valid JSON.'
    );
  }
  if (
    !isRecord(parsed) ||
    !onlyKeys(parsed, [
      'version',
      'generation',
      'chunkCount',
      'byteLength',
      'journalHash',
      'manifestHash',
    ]) ||
    parsed.version !== COLOR_SYSTEM_CREATE_JOURNAL_V2_MANIFEST_VERSION ||
    (parsed.generation !== 0 && parsed.generation !== 1) ||
    !Number.isInteger(parsed.chunkCount) ||
    (parsed.chunkCount as number) < 1 ||
    (parsed.chunkCount as number) > COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_CHUNKS ||
    !Number.isInteger(parsed.byteLength) ||
    (parsed.byteLength as number) < 1 ||
    (parsed.byteLength as number) >
      COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_CHUNKS * COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_CHUNK_BYTES ||
    typeof parsed.journalHash !== 'string' ||
    !HASH.test(parsed.journalHash) ||
    typeof parsed.manifestHash !== 'string' ||
    !HASH.test(parsed.manifestHash)
  ) {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create journal manifest failed strict validation.'
    );
  }
  const manifest = parsed as unknown as JournalManifestV2;
  const { manifestHash: actual, ...content } = manifest;
  if (manifestHash(content) !== actual) {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create journal manifest failed hash validation.'
    );
  }
  return manifest;
}

const JOURNAL_KEYS = [
  'version',
  'state',
  'transactionId',
  'requestId',
  'sessionId',
  'currentFileIdentityHash',
  'sourceAuthorityHash',
  'liveSourceHash',
  'briefHash',
  'strategySetHash',
  'candidateHash',
  'applicationBlueprintHash',
  'sectionBlueprintHash',
  'resourceBlueprintHash',
  'reviewHash',
  'approvalHash',
  'createAuthorizationHash',
  'outputAction',
  'outputName',
  'outputPageName',
  'systemId',
  'expectedCounts',
  'resources',
  'journalHash',
] as const;

function validCounts(value: unknown): value is ColorSystemCreateJournalExpectedCountsV2 {
  if (
    !isRecord(value) ||
    !onlyKeys(value, ['collections', 'variables', 'styles', 'components', 'frames', 'pages'])
  )
    return false;
  return (
    ['collections', 'variables', 'styles', 'components', 'frames', 'pages'].every(
      key => Number.isInteger(value[key]) && (value[key] as number) >= 0
    ) && value.pages === 1
  );
}

function validRef(value: unknown): value is ColorSystemCreateJournalResourceRefV2 {
  return (
    isRecord(value) &&
    onlyKeys(value, ['kind', 'id', 'recipeId']) &&
    ['collection', 'variable', 'style', 'component', 'frame', 'page'].includes(
      value.kind as string
    ) &&
    text(value.id) &&
    text(value.recipeId)
  );
}

function parseJournal(raw: string): ColorSystemCreateJournalV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create journal content is not valid JSON.'
    );
  }
  if (
    !isRecord(parsed) ||
    !onlyKeys(parsed, JOURNAL_KEYS) ||
    parsed.version !== COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION ||
    (parsed.state !== 'creating' && parsed.state !== 'verified') ||
    typeof parsed.transactionId !== 'string' ||
    !RECEIPT_ID.test(parsed.transactionId) ||
    !text(parsed.requestId, 128) ||
    !text(parsed.sessionId) ||
    ![
      'currentFileIdentityHash',
      'sourceAuthorityHash',
      'liveSourceHash',
      'briefHash',
      'strategySetHash',
      'candidateHash',
      'applicationBlueprintHash',
      'sectionBlueprintHash',
      'resourceBlueprintHash',
      'reviewHash',
      'approvalHash',
      'createAuthorizationHash',
      'journalHash',
    ].every(key => typeof parsed[key] === 'string' && HASH.test(parsed[key] as string)) ||
    !['create-new', 'create-copy', 'update-owned'].includes(parsed.outputAction as string) ||
    !text(parsed.outputName, 128) ||
    !text(parsed.outputPageName, 180) ||
    !text(parsed.systemId) ||
    !validCounts(parsed.expectedCounts) ||
    !Array.isArray(parsed.resources) ||
    parsed.resources.length > MAX_RESOURCES ||
    !parsed.resources.every(validRef)
  ) {
    throw new ColorSystemCreateJournalV2Error('Stored v2 Create journal failed strict validation.');
  }
  const journal = parsed as unknown as ColorSystemCreateJournalV2;
  if (
    journal.transactionId !==
    `teul-create-v2:${journal.createAuthorizationHash.slice('sha256:'.length)}`
  ) {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create journal transaction is not bound to its authorization.'
    );
  }
  const seenIds = new Set<string>();
  for (const ref of journal.resources) {
    const key = `${ref.kind}\u0000${ref.id}`;
    if (seenIds.has(key))
      throw new ColorSystemCreateJournalV2Error(
        'Stored v2 Create journal contains duplicate resource IDs.'
      );
    seenIds.add(key);
  }
  const { journalHash, ...content } = journal;
  if (deterministicContentHash(content) !== journalHash) {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create journal failed deterministic hash validation.'
    );
  }
  return journal;
}

export function createColorSystemCreateJournalRuntimeV2(host: ColorSystemCreateJournalHostV2) {
  // This memory-only signal cannot survive a plugin crash. It does let a retry
  // repair a transient clientStorage failure when this runtime already observed
  // the renderer's post-commit acknowledgement call.
  const commitConfirmedTransactions = new Set<string>();
  const readCompletion = async (
    currentFileIdentityHash: string
  ): Promise<ColorSystemCreateCompletionV2 | null> =>
    parseCompletion(await host.getCompletionAcknowledgement(currentFileIdentityHash));

  const read = (): ColorSystemCreateJournalV2 | null => {
    const rawManifest = host.getRootPluginData(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY);
    if (!rawManifest) return null;
    const manifest = parseManifest(rawManifest);
    let raw = '';
    for (let index = 0; index < manifest.chunkCount; index += 1) {
      const chunk = host.getRootPluginData(chunkKey(manifest.generation, index));
      if (!chunk || utf8ByteLength(chunk) > COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_CHUNK_BYTES) {
        throw new ColorSystemCreateJournalV2Error(
          `Stored v2 Create journal chunk ${index} is missing or oversized.`
        );
      }
      raw += chunk;
    }
    if (utf8ByteLength(raw) !== manifest.byteLength)
      throw new ColorSystemCreateJournalV2Error(
        'Stored v2 Create journal byte length is inconsistent.'
      );
    const journal = parseJournal(raw);
    if (journal.journalHash !== manifest.journalHash)
      throw new ColorSystemCreateJournalV2Error(
        'Stored v2 Create journal manifest does not match its content.'
      );
    return journal;
  };

  const write = (journal: ColorSystemCreateJournalV2): ColorSystemCreateJournalV2 => {
    const existingRaw = host.getRootPluginData(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY);
    const currentGeneration = existingRaw ? parseManifest(existingRaw).generation : 1;
    const generation: 0 | 1 = currentGeneration === 0 ? 1 : 0;
    const raw = canonicalJson(journal);
    const chunks = splitUtf8(raw);
    chunks.forEach((chunk, index) => host.setRootPluginData(chunkKey(generation, index), chunk));
    const content = {
      version: COLOR_SYSTEM_CREATE_JOURNAL_V2_MANIFEST_VERSION,
      generation,
      chunkCount: chunks.length,
      byteLength: utf8ByteLength(raw),
      journalHash: journal.journalHash,
    } as const;
    host.setRootPluginData(
      COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY,
      canonicalJson({ ...content, manifestHash: manifestHash(content) })
    );
    return journal;
  };

  const clear = (transactionId: string): void => {
    const current = read();
    if (!current) return;
    if (current.transactionId !== transactionId)
      throw new ColorSystemCreateJournalV2Error('Refused to clear a different v2 Create journal.');
    host.setRootPluginData(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY, '');
  };

  const begin = (input: BeginColorSystemCreateJournalV2Input): ColorSystemCreateJournalV2 => {
    if (read())
      throw new ColorSystemCreateJournalV2Error(
        'An earlier v2 Create journal must be reconciled before mutation.'
      );
    const expectedCounts: ColorSystemCreateJournalExpectedCountsV2 = {
      collections: 2,
      variables: input.counts.variables,
      styles: input.counts.styles,
      components: input.counts.components,
      frames: 5,
      pages: 1,
    };
    return write(
      withHash({
        version: COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION,
        state: 'creating',
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
        expectedCounts,
        resources: [],
      })
    );
  };

  const assertCurrent = (journal: ColorSystemCreateJournalV2): ColorSystemCreateJournalV2 => {
    const current = read();
    if (
      !current ||
      current.transactionId !== journal.transactionId ||
      current.journalHash !== journal.journalHash
    ) {
      throw new ColorSystemCreateJournalV2Error(
        'The v2 Create journal changed unexpectedly during mutation.'
      );
    }
    return current;
  };

  const record = (
    journal: ColorSystemCreateJournalV2,
    ref: ColorSystemCreateJournalResourceRefV2
  ): ColorSystemCreateJournalV2 => {
    const current = assertCurrent(journal);
    if (!validRef(ref))
      throw new ColorSystemCreateJournalV2Error(
        'Created v2 resource has an invalid recovery identity.'
      );
    if (current.resources.some(item => item.kind === ref.kind && item.id === ref.id))
      return current;
    if (current.resources.length >= MAX_RESOURCES)
      throw new ColorSystemCreateJournalV2Error('V2 Create journal resource limit exceeded.');
    return write(withHash({ ...contentOf(current), resources: [...current.resources, ref] }));
  };

  const markVerified = (journal: ColorSystemCreateJournalV2): ColorSystemCreateJournalV2 => {
    const current = assertCurrent(journal);
    assertCompleteRefCounts(current);
    return write(withHash({ ...contentOf(current), state: 'verified' }));
  };

  const acknowledgeCommitted = async (journal: ColorSystemCreateJournalV2): Promise<void> => {
    const current = assertCurrent(journal);
    if (current.state !== 'verified') {
      throw new ColorSystemCreateJournalV2Error(
        'A v2 Create completion can be acknowledged only after exact output verification.'
      );
    }
    assertCompleteRefCounts(current);
    commitConfirmedTransactions.add(current.transactionId);
    const outputFingerprint = await host.fingerprintResources(current.resources);
    if (!HASH.test(outputFingerprint)) {
      throw new ColorSystemCreateJournalV2Error(
        'The complete v2 Create output did not produce a valid resource fingerprint.'
      );
    }
    const completion = withCompletionHash({
      version: COLOR_SYSTEM_CREATE_COMPLETION_V2_VERSION,
      transactionId: current.transactionId,
      currentFileIdentityHash: current.currentFileIdentityHash,
      journalHash: current.journalHash,
      resourceBlueprintHash: current.resourceBlueprintHash,
      sectionBlueprintHash: current.sectionBlueprintHash,
      outputFingerprint,
    });
    await host.setCompletionAcknowledgement(
      current.currentFileIdentityHash,
      canonicalJson(completion)
    );
    const persisted = await readCompletion(current.currentFileIdentityHash);
    if (!persisted || persisted.completionHash !== completion.completionHash) {
      throw new ColorSystemCreateJournalV2Error(
        'The final v2 Create completion acknowledgement could not be read back exactly.'
      );
    }
  };

  const validateResolved = (
    journal: ColorSystemCreateJournalV2,
    ref: ColorSystemCreateJournalResourceRefV2,
    resource: ColorSystemCreateJournalResolvedResourceV2
  ): string[] => {
    const failures: string[] = [];
    const owner = resource.ownership;
    if (resource.kind !== ref.kind)
      failures.push(`${ref.kind} ${ref.id} resolved as ${resource.kind}`);
    if (resource.remote === true) failures.push(`${ref.kind} ${ref.id} is remote`);
    if (
      owner.version !== COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION ||
      owner.transactionId !== journal.transactionId ||
      owner.systemId !== journal.systemId ||
      owner.recipeId !== ref.recipeId ||
      owner.resourceBlueprintHash !== journal.resourceBlueprintHash ||
      owner.sectionBlueprintHash !== journal.sectionBlueprintHash ||
      owner.resourceKind !== ref.kind
    ) {
      failures.push(`${ref.kind} ${ref.id} is not owned by this exact v2 Create transaction`);
    }
    return failures;
  };

  const reconcile = async (
    currentFileIdentityHash: string,
    target: ColorSystemCreateJournalTargetV2,
    beforeMutation?: () => Promise<void>
  ): Promise<ColorSystemCreateJournalReconciliationV2> => {
    const journal = read();
    if (!journal) return { status: 'none', removedResourceCount: 0, blocksNewMutation: false };
    if (journal.currentFileIdentityHash !== currentFileIdentityHash) {
      throw new ColorSystemCreateJournalV2Error(
        'A v2 Create recovery journal belongs to a different Figma file; no resource was changed.',
        [`expected ${journal.currentFileIdentityHash}`, `actual ${currentFileIdentityHash}`]
      );
    }
    await host.loadAllPages();
    const resolved: Array<{
      ref: ColorSystemCreateJournalResourceRefV2;
      resource: ColorSystemCreateJournalResolvedResourceV2;
    }> = [];
    const failures: string[] = [];
    for (const ref of journal.resources) {
      try {
        const resource = await host.resolveResource(ref);
        if (!resource) {
          if (journal.state === 'verified')
            failures.push(`${ref.kind} ${ref.id} is missing from a verified output`);
          continue;
        }
        failures.push(...validateResolved(journal, ref, resource));
        resolved.push({ ref, resource });
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : `${ref.kind} ${ref.id} lookup failed`
        );
      }
    }
    if (failures.length > 0) {
      throw new ColorSystemCreateJournalV2Error(
        'V2 Create recovery found ambiguous, changed, foreign, or incomplete resources and stopped before cleanup.',
        failures
      );
    }
    if (journal.state === 'verified') {
      assertCompleteRefCounts(journal);
      let completion = await readCompletion(journal.currentFileIdentityHash);
      let acknowledged =
        completion?.transactionId === journal.transactionId &&
        completion.currentFileIdentityHash === journal.currentFileIdentityHash &&
        completion.journalHash === journal.journalHash &&
        completion.resourceBlueprintHash === journal.resourceBlueprintHash &&
        completion.sectionBlueprintHash === journal.sectionBlueprintHash;
      if (!acknowledged && commitConfirmedTransactions.has(journal.transactionId)) {
        try {
          await acknowledgeCommitted(journal);
          completion = await readCompletion(journal.currentFileIdentityHash);
          acknowledged =
            completion?.transactionId === journal.transactionId &&
            completion.currentFileIdentityHash === journal.currentFileIdentityHash &&
            completion.journalHash === journal.journalHash &&
            completion.resourceBlueprintHash === journal.resourceBlueprintHash &&
            completion.sectionBlueprintHash === journal.sectionBlueprintHash;
        } catch {
          // Preserve the verified journal; a later same-runtime retry may repair it.
        }
      }
      if (!acknowledged || !completion) {
        return {
          status: 'preserved-unacknowledged-output',
          removedResourceCount: 0,
          blocksNewMutation: true,
          transactionId: journal.transactionId,
          outputName: journal.outputName,
          resourceBlueprintHash: journal.resourceBlueprintHash,
        };
      }
      const exactTarget =
        target.systemId === journal.systemId &&
        target.resourceBlueprintHash === journal.resourceBlueprintHash &&
        target.sectionBlueprintHash === journal.sectionBlueprintHash;
      if (exactTarget) {
        const outputFingerprint = await host.fingerprintResources(journal.resources);
        if (outputFingerprint !== completion.outputFingerprint) {
          throw new ColorSystemCreateJournalV2Error(
            'The completed Teul-owned output changed after Create, so it cannot be treated as an identical no-op. No resource was changed.',
            [
              `expected fingerprint ${completion.outputFingerprint}`,
              `actual fingerprint ${outputFingerprint}`,
            ]
          );
        }
        return {
          status: 'verified-existing-output',
          removedResourceCount: 0,
          blocksNewMutation: false,
          transactionId: journal.transactionId,
          outputName: journal.outputName,
          systemId: journal.systemId,
          resourceBlueprintHash: journal.resourceBlueprintHash,
          sectionBlueprintHash: journal.sectionBlueprintHash,
          resources: journal.resources,
        };
      }
      await beforeMutation?.();
      clear(journal.transactionId);
      commitConfirmedTransactions.delete(journal.transactionId);
      try {
        await host.clearCompletionAcknowledgement(journal.currentFileIdentityHash);
      } catch {
        // A stale acknowledgement cannot authorize anything without its exact root journal.
      }
      return {
        status: 'released-completed-output',
        removedResourceCount: 0,
        blocksNewMutation: false,
        transactionId: journal.transactionId,
      };
    }
    const priority: Record<ColorSystemCreateJournalResourceKindV2, number> = {
      frame: 0,
      component: 1,
      style: 2,
      variable: 3,
      collection: 4,
      page: 5,
    };
    const ordered = [...resolved].sort(
      (a, b) =>
        priority[a.ref.kind] - priority[b.ref.kind] ||
        journal.resources.indexOf(b.ref) - journal.resources.indexOf(a.ref)
    );
    const removalFailures: string[] = [];
    let removed = journal.resources.length - resolved.length;
    await beforeMutation?.();
    for (const { ref, resource } of ordered) {
      try {
        await resource.remove();
        removed += 1;
      } catch {
        removalFailures.push(`${ref.kind} ${resource.name ?? ref.id} could not be removed`);
      }
    }
    if (removalFailures.length > 0)
      throw new ColorSystemCreateJournalV2Error(
        'V2 Create recovery could not remove every exact owned partial resource. New Create mutations remain blocked.',
        removalFailures
      );
    clear(journal.transactionId);
    commitConfirmedTransactions.delete(journal.transactionId);
    try {
      await host.clearCompletionAcknowledgement(journal.currentFileIdentityHash);
    } catch {
      // A stale acknowledgement cannot authorize anything without its exact root journal.
    }
    return {
      status: 'cleaned-interrupted-output',
      removedResourceCount: removed,
      blocksNewMutation: false,
      transactionId: journal.transactionId,
    };
  };

  return { read, begin, record, markVerified, acknowledgeCommitted, clear, reconcile };
}

function assertCompleteRefCounts(journal: ColorSystemCreateJournalV2): void {
  const actual = { collections: 0, variables: 0, styles: 0, components: 0, frames: 0, pages: 0 };
  for (const ref of journal.resources) actual[`${ref.kind}s` as keyof typeof actual] += 1;
  if (canonicalJson(actual) !== canonicalJson(journal.expectedCounts)) {
    throw new ColorSystemCreateJournalV2Error(
      'Verified v2 Create journal does not contain the complete expected resource inventory.',
      [`expected ${canonicalJson(journal.expectedCounts)}`, `actual ${canonicalJson(actual)}`]
    );
  }
}

export type ColorSystemCreateJournalRuntimeV2 = ReturnType<
  typeof createColorSystemCreateJournalRuntimeV2
>;

type FigmaJournalResource = (
  | VariableCollection
  | Variable
  | PaintStyle
  | ComponentNode
  | FrameNode
  | PageNode
) &
  PluginDataMixin;

const FIGMA_JOURNAL_MUTABLE_PROPERTIES = [
  'name',
  'description',
  'remote',
  'key',
  'hiddenFromPublishing',
  'resolvedType',
  'variableCollectionId',
  'valuesByMode',
  'scopes',
  'modes',
  'variableIds',
  'type',
  'visible',
  'locked',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'opacity',
  'blendMode',
  'isMask',
  'clipsContent',
  'layoutMode',
  'primaryAxisSizingMode',
  'counterAxisSizingMode',
  'primaryAxisAlignItems',
  'counterAxisAlignItems',
  'itemSpacing',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
  'layoutAlign',
  'layoutGrow',
  'layoutPositioning',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'cornerRadius',
  'cornerSmoothing',
  'fills',
  'strokes',
  'strokeWeight',
  'strokeAlign',
  'dashPattern',
  'effects',
  'constraints',
  'boundVariables',
  'explicitVariableModes',
  'characters',
  'fontName',
  'fontSize',
  'fontWeight',
  'textAlignHorizontal',
  'textAlignVertical',
  'textAutoResize',
  'lineHeight',
  'letterSpacing',
  'textCase',
  'textDecoration',
  'paragraphSpacing',
  'paragraphIndent',
  'listSpacing',
  'componentProperties',
  'componentPropertyDefinitions',
  'variantProperties',
  'backgrounds',
] as const;

function readFigmaProperty(value: unknown, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return '[unreadable]';
  }
}

function stableFigmaValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'symbol') return `symbol:${value.description ?? ''}`;
  if (typeof value === 'undefined' || typeof value === 'function') return undefined;
  if (depth >= 16) return '[maximum-depth]';
  if (Array.isArray(value)) {
    return value.map(item => stableFigmaValue(item, depth + 1, seen));
  }
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const normalized = stableFigmaValue(readFigmaProperty(record, key), depth + 1, seen);
    if (normalized !== undefined) result[key] = normalized;
  }
  seen.delete(value);
  return result;
}

function figmaPluginDataSnapshot(resource: PluginDataMixin): Record<string, string> {
  return Object.fromEntries(
    Object.values(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA)
      .sort()
      .map(key => [key, resource.getPluginData(key)])
  );
}

function figmaResourceSnapshot(resource: FigmaJournalResource): unknown {
  const properties: Record<string, unknown> = {};
  for (const key of FIGMA_JOURNAL_MUTABLE_PROPERTIES) {
    const normalized = stableFigmaValue(readFigmaProperty(resource, key));
    if (normalized !== undefined) properties[key] = normalized;
  }
  const mainComponent = readFigmaProperty(resource, 'mainComponent');
  const mainComponentId =
    mainComponent && typeof mainComponent === 'object'
      ? readFigmaProperty(mainComponent, 'id')
      : undefined;
  const children = readFigmaProperty(resource, 'children');
  return {
    id: resource.id,
    pluginData: figmaPluginDataSnapshot(resource),
    properties,
    ...(typeof mainComponentId === 'string' ? { mainComponentId } : {}),
    children: Array.isArray(children)
      ? children.map(child => figmaResourceSnapshot(child as FigmaJournalResource))
      : [],
  };
}

export function createFigmaColorSystemCreateJournalHostV2(
  figmaApi: PluginAPI
): ColorSystemCreateJournalHostV2 {
  const resolve = async (
    ref: ColorSystemCreateJournalResourceRefV2
  ): Promise<FigmaJournalResource | null> => {
    if (ref.kind === 'collection')
      return (await figmaApi.variables.getVariableCollectionByIdAsync(
        ref.id
      )) as FigmaJournalResource | null;
    if (ref.kind === 'variable')
      return (await figmaApi.variables.getVariableByIdAsync(ref.id)) as FigmaJournalResource | null;
    if (ref.kind === 'style') {
      const style = await figmaApi.getStyleByIdAsync(ref.id);
      if (style && style.type !== 'PAINT')
        throw new ColorSystemCreateJournalV2Error(`Journal style ${ref.id} is not a Paint Style.`);
      return style as FigmaJournalResource | null;
    }
    const node = await figmaApi.getNodeByIdAsync(ref.id);
    const expected =
      ref.kind === 'component' ? 'COMPONENT' : ref.kind === 'frame' ? 'FRAME' : 'PAGE';
    if (node && node.type !== expected)
      throw new ColorSystemCreateJournalV2Error(
        `Journal ${ref.kind} ${ref.id} resolved as ${node.type}.`
      );
    return node as FigmaJournalResource | null;
  };
  return {
    getRootPluginData: key => figmaApi.root.getPluginData(key),
    setRootPluginData: (key, value) => figmaApi.root.setPluginData(key, value),
    getCompletionAcknowledgement: currentFileIdentityHash =>
      figmaApi.clientStorage.getAsync(
        colorSystemCreateCompletionStorageKeyV2(currentFileIdentityHash)
      ),
    setCompletionAcknowledgement: (currentFileIdentityHash, value) =>
      figmaApi.clientStorage.setAsync(
        colorSystemCreateCompletionStorageKeyV2(currentFileIdentityHash),
        value
      ),
    clearCompletionAcknowledgement: currentFileIdentityHash =>
      figmaApi.clientStorage.deleteAsync(
        colorSystemCreateCompletionStorageKeyV2(currentFileIdentityHash)
      ),
    async fingerprintResources(refs) {
      await figmaApi.loadAllPagesAsync();
      const snapshots: unknown[] = [];
      for (const ref of refs) {
        const resource = await resolve(ref);
        if (!resource) {
          throw new ColorSystemCreateJournalV2Error(
            `Completed v2 Create resource ${ref.kind} ${ref.id} is missing during fingerprint verification.`
          );
        }
        snapshots.push({ ref, resource: figmaResourceSnapshot(resource) });
      }
      return deterministicContentHash(snapshots);
    },
    loadAllPages: () => figmaApi.loadAllPagesAsync(),
    async resolveResource(ref) {
      const resource = await resolve(ref);
      if (!resource) return null;
      const keys = COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA;
      return {
        id: resource.id,
        kind: ref.kind,
        name: 'name' in resource ? resource.name : undefined,
        remote: 'remote' in resource ? resource.remote : false,
        ownership: {
          version: resource.getPluginData(keys.version),
          transactionId: resource.getPluginData(keys.transactionId),
          systemId: resource.getPluginData(keys.systemId),
          recipeId: resource.getPluginData(keys.recipeId),
          resourceBlueprintHash: resource.getPluginData(keys.resourceBlueprintHash),
          sectionBlueprintHash: resource.getPluginData(keys.sectionBlueprintHash),
          resourceKind: resource.getPluginData(keys.resourceKind),
        },
        remove: () => resource.remove(),
      };
    },
  };
}
