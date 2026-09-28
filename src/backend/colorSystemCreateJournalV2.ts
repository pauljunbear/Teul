import { canonicalJson, deterministicContentHash } from '../lib/colorSystemHashing';
import { utf8ByteLength } from '../lib/utf8';
import type { ColorSystemCreateActionV2 } from '../lib/colorSystemCreateAuthorizationV2';
import type { ColorSystemResourceBlueprintCountsV2 } from '../lib/colorSystemResourceBlueprintV2';
import {
  COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA,
  COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION,
  COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION,
  COLOR_SYSTEM_AUTHORED_FIGMA_PLUGIN_DATA_V1,
  type ColorSystemAuthoredCreateIdentityV1,
  type ColorSystemAuthoredResourceOwnershipV1,
} from './colorSystemResourceOwnershipV2';
import {
  snapshotColorSystemInertJsonV1,
  serializeColorSystemInertJsonV1,
} from '../lib/colorSystemInertJsonV1';
import {
  COLOR_SYSTEM_AUTHORED_PAGE_NAME_MAX_LENGTH_V1,
  isColorSystemAuthoredNameV1,
} from '../lib/colorSystemAuthoredNamingV1';

/**
 * Persistence layout (append-only, one plugin-data entry per recorded resource).
 *
 *   <KEY>            manifest: identity of the header, state, and the checkpoint
 *                    (how many entries are covered by `chainHash`). Rewritten only
 *                    when `begin` runs, when a 16-entry group closes, or on
 *                    `markVerified`.
 *   <KEY>-header     the journal identity (transaction, authority hashes, output,
 *                    expected counts). Written exactly once by `begin`.
 *   <KEY>-r-<index>  one resource ref plus `chain`, where
 *                    chain_i = hash(chain_{i-1}, i, ref_i) and chain_-1 = headerHash.
 *                    Written exactly once by `record`; never rewritten.
 *
 * A reader follows the chain from entry 0 until the first missing key, so a crash
 * between an entry write and its later manifest checkpoint loses nothing. Every
 * entry is far below Figma's 100 kB per-entry plugin-data limit.
 *
 * The previous layout (`<KEY>-g{0|1}-chunk-<i>`, whole-journal rewrite per record)
 * is still readable so an interrupted create from that format can be reconciled.
 */
export const COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY = 'teul-color-system-create-journal-v2';
export const COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION =
  'teul-color-system-create-journal/v2' as const;
export const COLOR_SYSTEM_CREATE_JOURNAL_V2_MANIFEST_VERSION =
  'teul-color-system-create-journal-manifest/v3' as const;
export const COLOR_SYSTEM_CREATE_JOURNAL_V2_LEGACY_MANIFEST_VERSION =
  'teul-color-system-create-journal-manifest/v2' as const;
/** Entries recorded between two manifest checkpoints. */
export const COLOR_SYSTEM_CREATE_JOURNAL_V2_CHECKPOINT_INTERVAL = 16;
/** Figma limits one plugin-data entry to 100 kB; keep a wide envelope. */
export const COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_ENTRY_BYTES = 64 * 1024;
export const COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID = 'resource/documentation-page' as const;
export const COLOR_SYSTEM_CREATE_COMPLETION_V2_KEY =
  'teul-color-system-create-completion-v2' as const;
export const COLOR_SYSTEM_CREATE_COMPLETION_V2_VERSION =
  'teul-color-system-create-completion/v2' as const;
export const COLOR_SYSTEM_AUTHORED_CREATE_JOURNAL_V1_VERSION =
  'teul-authored-create-journal/v1' as const;
export const COLOR_SYSTEM_AUTHORED_CREATE_COMPLETION_V1_VERSION =
  'teul-authored-create-completion/v1' as const;
export const COLOR_SYSTEM_CREATE_JOURNAL_MAX_RESOURCES = 2_048;
export type ColorSystemCreateJournalContractKind = 'legacy-v2' | 'authored-v1';

const HASH = /^sha256:[0-9a-f]{64}$/;
const RECEIPT_ID = /^teul-create-v2:[0-9a-f]{64}$/;
const MAX_TEXT = 256;
const MAX_RESOURCES = COLOR_SYSTEM_CREATE_JOURNAL_MAX_RESOURCES;
const AUTHORED_RECEIPT_ID = /^teul-authored-create-v1:[0-9a-f]{64}$/;
const LEGACY_MAX_CHUNKS = 32;
const LEGACY_MAX_CHUNK_BYTES = 64 * 1024;
const JOURNAL_PAYLOAD_KEY_PREFIX = `${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-`;

export function colorSystemCreateCompletionStorageKeyV2(currentFileIdentityHash: string): string {
  if (!HASH.test(currentFileIdentityHash)) {
    throw new ColorSystemCreateJournalV2Error(
      'A valid current-file identity is required for durable completion storage.'
    );
  }
  return `${COLOR_SYSTEM_CREATE_COMPLETION_V2_KEY}:${currentFileIdentityHash.slice('sha256:'.length)}`;
}

export type ColorSystemCreateJournalResourceKindV2 =
  'collection' | 'variable' | 'style' | 'component' | 'frame' | 'page';

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

type ColorSystemCreateJournalHeaderV2 = Omit<
  ColorSystemCreateJournalContentV2,
  'state' | 'resources'
>;

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

export interface BeginColorSystemAuthoredCreateJournalV1Input extends ColorSystemAuthoredCreateIdentityV1 {
  transactionId: string;
  requestId: string;
  sessionId: string;
  currentFileIdentityHash: string;
  outputAction: 'create-new' | 'create-copy';
  outputName: string;
  outputPageName: string;
  systemId: string;
  counts: ColorSystemCreateJournalExpectedCountsV2;
}
type ColorSystemAuthoredCreateJournalHeaderV1 = Omit<
  BeginColorSystemAuthoredCreateJournalV1Input,
  'counts'
> & {
  version: typeof COLOR_SYSTEM_AUTHORED_CREATE_JOURNAL_V1_VERSION;
  expectedCounts: ColorSystemCreateJournalExpectedCountsV2;
};
export interface ColorSystemAuthoredCreateJournalV1 extends ColorSystemAuthoredCreateJournalHeaderV1 {
  state: 'creating' | 'verified';
  resources: readonly ColorSystemCreateJournalResourceRefV2[];
  journalHash: string;
}
export interface ColorSystemAuthoredCreateJournalTargetV1 extends Omit<
  ColorSystemAuthoredCreateIdentityV1,
  'reviewHash' | 'approvalHash' | 'createAuthorizationHash'
> {
  systemId: string;
}
type AnyJournal = ColorSystemCreateJournalV2 | ColorSystemAuthoredCreateJournalV1;
type AnyHeader = ColorSystemCreateJournalHeaderV2 | ColorSystemAuthoredCreateJournalHeaderV1;
type AnyTarget = ColorSystemCreateJournalTargetV2 | ColorSystemAuthoredCreateJournalTargetV1;

interface JournalManifestV3 {
  version: typeof COLOR_SYSTEM_CREATE_JOURNAL_V2_MANIFEST_VERSION;
  headerHash: string;
  state: 'creating' | 'verified';
  /** Entries covered by `chainHash`; entries beyond it are verified by chain only. */
  resourceCount: number;
  chainHash: string;
  manifestHash: string;
}

interface LegacyJournalManifestV2 {
  version: typeof COLOR_SYSTEM_CREATE_JOURNAL_V2_LEGACY_MANIFEST_VERSION;
  generation: 0 | 1;
  chunkCount: number;
  byteLength: number;
  journalHash: string;
  manifestHash: string;
}

interface JournalEntryV3 {
  chain: string;
  ref: ColorSystemCreateJournalResourceRefV2;
}

export interface ColorSystemCreateJournalResolvedResourceV2 {
  id: string;
  kind: ColorSystemCreateJournalResourceKindV2;
  name?: string;
  remote?: boolean;
  ownership:
    | {
        version: string;
        transactionId: string;
        systemId: string;
        recipeId: string;
        resourceBlueprintHash: string;
        sectionBlueprintHash: string;
        resourceKind: string;
      }
    | (ColorSystemAuthoredResourceOwnershipV1 & { resourceKind: string });
  remove(): void | Promise<void>;
}

export interface ColorSystemCreateJournalHostV2 {
  /** Program-owned document scope shared by every wrapper; never read from serialized input. */
  transactionScope?: object;
  getRootPluginData(key: string): string;
  setRootPluginData(key: string, value: string): void;
  /** Lets `clear` and `begin` sweep every journal key, including orphans from
   * earlier layouts. Hosts without enumeration fall back to deterministic probing. */
  getRootPluginDataKeys?(): readonly string[];
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

export type ColorSystemAuthoredCreateJournalReconciliationV1 =
  | Exclude<
      ColorSystemCreateJournalReconciliationV2,
      { status: 'verified-existing-output' | 'preserved-unacknowledged-output' }
    >
  | ({
      status: 'verified-existing-output';
      removedResourceCount: 0;
      blocksNewMutation: false;
      transactionId: string;
      outputName: string;
      resources: readonly ColorSystemCreateJournalResourceRefV2[];
    } & ColorSystemAuthoredCreateJournalTargetV1)
  | {
      status: 'preserved-unacknowledged-output';
      removedResourceCount: 0;
      blocksNewMutation: true;
      transactionId: string;
      outputName: string;
      deliveryBlueprintHash: string;
    };
type AnyReconciliation =
  ColorSystemCreateJournalReconciliationV2 | ColorSystemAuthoredCreateJournalReconciliationV1;

export interface ColorSystemAuthoredCreateJournalRuntimeV1 {
  read(): ColorSystemAuthoredCreateJournalV1 | null;
  begin(input: BeginColorSystemAuthoredCreateJournalV1Input): ColorSystemAuthoredCreateJournalV1;
  record(
    journal: ColorSystemAuthoredCreateJournalV1,
    ref: ColorSystemCreateJournalResourceRefV2
  ): ColorSystemAuthoredCreateJournalV1;
  markVerified(journal: ColorSystemAuthoredCreateJournalV1): ColorSystemAuthoredCreateJournalV1;
  acknowledgeCommitted(journal: ColorSystemAuthoredCreateJournalV1): Promise<void>;
  clear(transactionId: string): void;
  reconcile(
    currentFileIdentityHash: string,
    target: ColorSystemAuthoredCreateJournalTargetV1,
    beforeMutation?: () => Promise<void>
  ): Promise<ColorSystemAuthoredCreateJournalReconciliationV1>;
}

export interface ColorSystemLegacyCreateJournalMethodsV2 {
  read(): ColorSystemCreateJournalV2 | null;
  begin(input: BeginColorSystemCreateJournalV2Input): ColorSystemCreateJournalV2;
  record(
    journal: ColorSystemCreateJournalV2,
    ref: ColorSystemCreateJournalResourceRefV2
  ): ColorSystemCreateJournalV2;
  markVerified(journal: ColorSystemCreateJournalV2): ColorSystemCreateJournalV2;
  acknowledgeCommitted(journal: ColorSystemCreateJournalV2): Promise<void>;
  clear(transactionId: string): void;
  reconcile(
    currentFileIdentityHash: string,
    target: ColorSystemCreateJournalTargetV2,
    beforeMutation?: () => Promise<void>
  ): Promise<ColorSystemCreateJournalReconciliationV2>;
}
export interface ColorSystemCreateJournalTransactionV1 {
  legacy: ColorSystemLegacyCreateJournalMethodsV2;
  authored: ColorSystemAuthoredCreateJournalRuntimeV1;
  release(): void;
}
export interface ColorSystemCreateJournalRuntimeV2 extends ColorSystemLegacyCreateJournalMethodsV2 {
  authored: ColorSystemAuthoredCreateJournalRuntimeV1;
  getActiveContractKind(): ColorSystemCreateJournalContractKind | null;
  /** Opaque, memory-only lease; an ID or persisted header never establishes this ownership. */
  acquireTransaction(): ColorSystemCreateJournalTransactionV1 | null;
}
const activeTransactions = new WeakMap<object, object>();

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

export function colorSystemCreateJournalHeaderKeyV2(): string {
  return `${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-header`;
}

export function colorSystemCreateJournalEntryKeyV2(index: number): string {
  return `${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-r-${index}`;
}

function legacyChunkKey(generation: 0 | 1, index: number): string {
  return `${COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY}-g${generation}-chunk-${index}`;
}

function isJournalPayloadKey(key: string): boolean {
  return key !== COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY && key.startsWith(JOURNAL_PAYLOAD_KEY_PREFIX);
}

function contentOf(journal: AnyJournal) {
  const { journalHash: _journalHash, ...content } = journal;
  return content;
}

function entryChainHash(
  previous: string,
  index: number,
  ref: ColorSystemCreateJournalResourceRefV2
): string {
  return deterministicContentHash({ previous, index, ref });
}

/** O(1) journal identity: the header, the state, and the chained resource log. */
function journalHashOf(
  headerHash: string,
  state: 'creating' | 'verified',
  resourceCount: number,
  chainHash: string
): string {
  return deterministicContentHash({ headerHash, state, resourceCount, chainHash });
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

type AuthoredCompletionContent = ColorSystemAuthoredCreateIdentityV1 & {
  version: typeof COLOR_SYSTEM_AUTHORED_CREATE_COMPLETION_V1_VERSION;
  transactionId: string;
  currentFileIdentityHash: string;
  journalHash: string;
  outputFingerprint: string;
};
type AnyCompletionContent = ColorSystemCreateCompletionContentV2 | AuthoredCompletionContent;
type AnyCompletion = AnyCompletionContent & { completionHash: string };
const AUTHORED_IDENTITY_KEYS = [
  'authoringRecipeId',
  'recipeHash',
  'sourceModelHash',
  'designContentHash',
  'deliveryBlueprintHash',
  'geometryHash',
  'assessmentHash',
  'reviewHash',
  'approvalHash',
  'createAuthorizationHash',
] as const;
const AUTHORED_TARGET_KEYS = AUTHORED_IDENTITY_KEYS.filter(
  key => !['reviewHash', 'approvalHash', 'createAuthorizationHash'].includes(key)
);
function authoredIdentity(
  value: ColorSystemAuthoredCreateIdentityV1
): ColorSystemAuthoredCreateIdentityV1 {
  return Object.fromEntries(
    AUTHORED_IDENTITY_KEYS.map(key => [key, value[key]])
  ) as unknown as ColorSystemAuthoredCreateIdentityV1;
}
function kindOf(journal: AnyJournal): ColorSystemCreateJournalContractKind {
  return journal.version === COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION ? 'legacy-v2' : 'authored-v1';
}
function targetOf(journal: AnyJournal): AnyTarget {
  return journal.version === COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION
    ? {
        systemId: journal.systemId,
        resourceBlueprintHash: journal.resourceBlueprintHash,
        sectionBlueprintHash: journal.sectionBlueprintHash,
      }
    : ({
        systemId: journal.systemId,
        ...Object.fromEntries(AUTHORED_TARGET_KEYS.map(key => [key, journal[key]])),
      } as ColorSystemAuthoredCreateJournalTargetV1);
}
function targetMatches(journal: AnyJournal, target: AnyTarget): boolean {
  const expected = targetOf(journal);
  return Object.keys(expected).every(
    key =>
      (target as unknown as Record<string, unknown>)[key] ===
      (expected as unknown as Record<string, unknown>)[key]
  );
}
function withCompletionHash(content: AnyCompletionContent): AnyCompletion {
  return { ...content, completionHash: deterministicContentHash(content) };
}
function completionMatches(completion: AnyCompletion | null, journal: AnyJournal): boolean {
  if (
    !completion ||
    completion.transactionId !== journal.transactionId ||
    completion.currentFileIdentityHash !== journal.currentFileIdentityHash ||
    completion.journalHash !== journal.journalHash
  )
    return false;
  return journal.version === COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION
    ? completion.version === COLOR_SYSTEM_CREATE_COMPLETION_V2_VERSION &&
        completion.resourceBlueprintHash === journal.resourceBlueprintHash &&
        completion.sectionBlueprintHash === journal.sectionBlueprintHash
    : completion.version === COLOR_SYSTEM_AUTHORED_CREATE_COMPLETION_V1_VERSION &&
        AUTHORED_IDENTITY_KEYS.every(key => completion[key] === journal[key]);
}
function parseCompletion(value: unknown): AnyCompletion | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string')
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create completion acknowledgement is not serialized text.'
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create completion acknowledgement is not valid JSON.'
    );
  }
  const authored =
    isRecord(parsed) && parsed.version === COLOR_SYSTEM_AUTHORED_CREATE_COMPLETION_V1_VERSION;
  const identityKeys = authored
    ? AUTHORED_IDENTITY_KEYS
    : ['resourceBlueprintHash', 'sectionBlueprintHash'];
  const hashKeys = [
    'currentFileIdentityHash',
    'journalHash',
    'outputFingerprint',
    'completionHash',
    ...identityKeys.filter(key => key !== 'authoringRecipeId'),
  ];
  if (
    !isRecord(parsed) ||
    !onlyKeys(parsed, [
      'version',
      'transactionId',
      'currentFileIdentityHash',
      'journalHash',
      'outputFingerprint',
      'completionHash',
      ...identityKeys,
    ]) ||
    parsed.version !==
      (authored
        ? COLOR_SYSTEM_AUTHORED_CREATE_COMPLETION_V1_VERSION
        : COLOR_SYSTEM_CREATE_COMPLETION_V2_VERSION) ||
    typeof parsed.transactionId !== 'string' ||
    !(authored ? AUTHORED_RECEIPT_ID : RECEIPT_ID).test(parsed.transactionId) ||
    (authored && !text(parsed.authoringRecipeId)) ||
    !hashKeys.every(key => typeof parsed[key] === 'string' && HASH.test(parsed[key] as string))
  )
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create completion acknowledgement failed strict validation.'
    );
  const completion = parsed as unknown as AnyCompletion;
  const { completionHash, ...content } = completion;
  if (deterministicContentHash(content) !== completionHash)
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create completion acknowledgement failed hash validation.'
    );
  return completion;
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new ColorSystemCreateJournalV2Error(
      `Stored v2 Create journal ${label} is not valid JSON.`
    );
  }
}

function manifestHash(manifest: Omit<JournalManifestV3, 'manifestHash'>): string {
  return deterministicContentHash(manifest);
}

function legacyManifestHash(manifest: Omit<LegacyJournalManifestV2, 'manifestHash'>): string {
  return deterministicContentHash(manifest);
}

type ParsedManifest =
  | { format: 'v3'; manifest: JournalManifestV3 }
  | { format: 'legacy'; manifest: LegacyJournalManifestV2 };

function parseManifest(raw: string): ParsedManifest {
  const parsed = parseJson(raw, 'manifest');
  if (!isRecord(parsed)) {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create journal manifest failed strict validation.'
    );
  }
  if (parsed.version === COLOR_SYSTEM_CREATE_JOURNAL_V2_LEGACY_MANIFEST_VERSION) {
    if (
      !onlyKeys(parsed, [
        'version',
        'generation',
        'chunkCount',
        'byteLength',
        'journalHash',
        'manifestHash',
      ]) ||
      (parsed.generation !== 0 && parsed.generation !== 1) ||
      !Number.isInteger(parsed.chunkCount) ||
      (parsed.chunkCount as number) < 1 ||
      (parsed.chunkCount as number) > LEGACY_MAX_CHUNKS ||
      !Number.isInteger(parsed.byteLength) ||
      (parsed.byteLength as number) < 1 ||
      (parsed.byteLength as number) > LEGACY_MAX_CHUNKS * LEGACY_MAX_CHUNK_BYTES ||
      typeof parsed.journalHash !== 'string' ||
      !HASH.test(parsed.journalHash) ||
      typeof parsed.manifestHash !== 'string' ||
      !HASH.test(parsed.manifestHash)
    ) {
      throw new ColorSystemCreateJournalV2Error(
        'Stored v2 Create journal manifest failed strict validation.'
      );
    }
    const manifest = parsed as unknown as LegacyJournalManifestV2;
    const { manifestHash: actual, ...content } = manifest;
    if (legacyManifestHash(content) !== actual) {
      throw new ColorSystemCreateJournalV2Error(
        'Stored v2 Create journal manifest failed hash validation.'
      );
    }
    return { format: 'legacy', manifest };
  }
  if (
    !onlyKeys(parsed, [
      'version',
      'headerHash',
      'state',
      'resourceCount',
      'chainHash',
      'manifestHash',
    ]) ||
    parsed.version !== COLOR_SYSTEM_CREATE_JOURNAL_V2_MANIFEST_VERSION ||
    typeof parsed.headerHash !== 'string' ||
    !HASH.test(parsed.headerHash) ||
    (parsed.state !== 'creating' && parsed.state !== 'verified') ||
    !Number.isInteger(parsed.resourceCount) ||
    (parsed.resourceCount as number) < 0 ||
    (parsed.resourceCount as number) > MAX_RESOURCES ||
    typeof parsed.chainHash !== 'string' ||
    !HASH.test(parsed.chainHash) ||
    typeof parsed.manifestHash !== 'string' ||
    !HASH.test(parsed.manifestHash)
  ) {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create journal manifest failed strict validation.'
    );
  }
  const manifest = parsed as unknown as JournalManifestV3;
  const { manifestHash: actual, ...content } = manifest;
  if (manifestHash(content) !== actual) {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create journal manifest failed hash validation.'
    );
  }
  return { format: 'v3', manifest };
}

const HEADER_KEYS = [
  'version',
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
] as const;

const LEGACY_JOURNAL_KEYS = [...HEADER_KEYS, 'state', 'resources', 'journalHash'] as const;

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

function validHeaderFields(parsed: Record<string, unknown>): boolean {
  return (
    parsed.version === COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION &&
    typeof parsed.transactionId === 'string' &&
    RECEIPT_ID.test(parsed.transactionId) &&
    text(parsed.requestId, 128) &&
    text(parsed.sessionId) &&
    [
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
    ].every(key => typeof parsed[key] === 'string' && HASH.test(parsed[key] as string)) &&
    ['create-new', 'create-copy', 'update-owned'].includes(parsed.outputAction as string) &&
    text(parsed.outputName, 128) &&
    text(parsed.outputPageName, 180) &&
    text(parsed.systemId) &&
    validCounts(parsed.expectedCounts) &&
    parsed.transactionId ===
      `teul-create-v2:${(parsed.createAuthorizationHash as string).slice('sha256:'.length)}`
  );
}

const AUTHORED_HEADER_KEYS = [
  'version',
  'transactionId',
  'requestId',
  'sessionId',
  'currentFileIdentityHash',
  ...AUTHORED_IDENTITY_KEYS,
  'outputAction',
  'outputName',
  'outputPageName',
  'systemId',
  'expectedCounts',
];
function validAuthoredHeader(parsed: Record<string, unknown>): boolean {
  return (
    onlyKeys(parsed, AUTHORED_HEADER_KEYS) &&
    parsed.version === COLOR_SYSTEM_AUTHORED_CREATE_JOURNAL_V1_VERSION &&
    typeof parsed.transactionId === 'string' &&
    AUTHORED_RECEIPT_ID.test(parsed.transactionId) &&
    text(parsed.requestId, 128) &&
    text(parsed.sessionId) &&
    text(parsed.authoringRecipeId) &&
    [
      'currentFileIdentityHash',
      ...AUTHORED_IDENTITY_KEYS.filter(key => key !== 'authoringRecipeId'),
    ].every(key => typeof parsed[key] === 'string' && HASH.test(parsed[key] as string)) &&
    ['create-new', 'create-copy'].includes(parsed.outputAction as string) &&
    isColorSystemAuthoredNameV1(parsed.outputName) &&
    isColorSystemAuthoredNameV1(
      parsed.outputPageName,
      COLOR_SYSTEM_AUTHORED_PAGE_NAME_MAX_LENGTH_V1
    ) &&
    text(parsed.systemId) &&
    validCounts(parsed.expectedCounts) &&
    Object.values(parsed.expectedCounts).reduce((sum, count) => sum + count, 0) <= MAX_RESOURCES &&
    parsed.transactionId ===
      `teul-authored-create-v1:${(parsed.createAuthorizationHash as string).slice('sha256:'.length)}`
  );
}
function parseHeader(raw: string): AnyHeader {
  const parsed = parseJson(raw, 'header');
  if (
    !isRecord(parsed) ||
    !(parsed.version === COLOR_SYSTEM_AUTHORED_CREATE_JOURNAL_V1_VERSION
      ? validAuthoredHeader(parsed)
      : onlyKeys(parsed, HEADER_KEYS) && validHeaderFields(parsed))
  ) {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create journal header failed strict validation.'
    );
  }
  return parsed as unknown as AnyHeader;
}

function parseEntry(raw: string, index: number): JournalEntryV3 {
  const parsed = parseJson(raw, `entry ${index}`);
  if (
    !isRecord(parsed) ||
    !onlyKeys(parsed, ['chain', 'ref']) ||
    typeof parsed.chain !== 'string' ||
    !HASH.test(parsed.chain) ||
    !validRef(parsed.ref)
  ) {
    throw new ColorSystemCreateJournalV2Error(
      `Stored v2 Create journal entry ${index} failed strict validation.`
    );
  }
  return parsed as unknown as JournalEntryV3;
}

function assertUniqueRefs(resources: readonly ColorSystemCreateJournalResourceRefV2[]): void {
  const seenIds = new Set<string>();
  for (const ref of resources) {
    const key = `${ref.kind}\u0000${ref.id}`;
    if (seenIds.has(key))
      throw new ColorSystemCreateJournalV2Error(
        'Stored v2 Create journal contains duplicate resource IDs.'
      );
    seenIds.add(key);
  }
}

function parseLegacyJournal(raw: string): ColorSystemCreateJournalV2 {
  const parsed = parseJson(raw, 'content');
  if (
    !isRecord(parsed) ||
    !onlyKeys(parsed, LEGACY_JOURNAL_KEYS) ||
    (parsed.state !== 'creating' && parsed.state !== 'verified') ||
    typeof parsed.journalHash !== 'string' ||
    !HASH.test(parsed.journalHash) ||
    !Array.isArray(parsed.resources) ||
    parsed.resources.length > MAX_RESOURCES ||
    !parsed.resources.every(validRef) ||
    !validHeaderFields(parsed)
  ) {
    throw new ColorSystemCreateJournalV2Error('Stored v2 Create journal failed strict validation.');
  }
  const journal = parsed as unknown as ColorSystemCreateJournalV2;
  assertUniqueRefs(journal.resources);
  const { journalHash, ...content } = journal;
  if (deterministicContentHash(content) !== journalHash) {
    throw new ColorSystemCreateJournalV2Error(
      'Stored v2 Create journal failed deterministic hash validation.'
    );
  }
  return journal;
}

/** A private detached witness keeps mutable public journal artifacts out of the fast-path trust boundary. */
function privateJournalSnapshot(journal: AnyJournal): AnyJournal {
  return Object.freeze({
    ...journal,
    expectedCounts: Object.freeze({ ...journal.expectedCounts }),
    resources: Object.freeze(journal.resources.map(ref => Object.freeze({ ...ref }))),
  });
}
function sameJournalSnapshot(actual: AnyJournal, expected: AnyJournal): boolean {
  const fields = Object.keys(expected).filter(
    key => !['resources', 'expectedCounts'].includes(key)
  );
  return (
    Object.keys(actual).length === Object.keys(expected).length &&
    fields.every(
      key =>
        (actual as unknown as Record<string, unknown>)[key] ===
        (expected as unknown as Record<string, unknown>)[key]
    ) &&
    isRecord(actual.expectedCounts) &&
    Object.keys(actual.expectedCounts).length === 6 &&
    Object.keys(expected.expectedCounts).every(
      key =>
        actual.expectedCounts[key as keyof ColorSystemCreateJournalExpectedCountsV2] ===
        expected.expectedCounts[key as keyof ColorSystemCreateJournalExpectedCountsV2]
    ) &&
    Array.isArray(actual.resources) &&
    actual.resources.length === expected.resources.length &&
    actual.resources.every(
      (ref, index) =>
        validRef(ref) &&
        ref.kind === expected.resources[index].kind &&
        ref.id === expected.resources[index].id &&
        ref.recipeId === expected.resources[index].recipeId
    )
  );
}
interface JournalCacheV3 {
  format: 'v3';
  journal: AnyJournal;
  snapshot: AnyJournal;
  manifestRaw: string;
  manifest: JournalManifestV3;
  headerRaw: string;
  headerHash: string;
  /** Canonical entry text, index-aligned with `journal.resources`. */
  entriesRaw: string[];
  /** Chain after the last entry (`headerHash` while the log is empty). */
  chain: string;
  refKeys: Set<string>;
}

interface JournalCacheLegacy {
  format: 'legacy';
  journal: ColorSystemCreateJournalV2;
}

export function createColorSystemCreateJournalRuntimeV2(
  host: ColorSystemCreateJournalHostV2
): ColorSystemCreateJournalRuntimeV2 {
  const transactionScope = host.transactionScope ?? host;
  // A retry may persist only the original committed output, never fingerprint a
  // later edit as a new completion. A null completion records that the first
  // fingerprint was unavailable; that transaction remains blocked in this runtime.
  // This evidence cannot survive a plugin crash; durable recovery still requires
  // the exact persisted completion acknowledgement.
  const committedOutputs = new Map<
    string,
    { journalHash: string; completion: AnyCompletion | null }
  >();
  let cache: JournalCacheV3 | JournalCacheLegacy | null = null;
  const readCompletion = async (currentFileIdentityHash: string): Promise<AnyCompletion | null> =>
    parseCompletion(await host.getCompletionAcknowledgement(currentFileIdentityHash));

  const blank = (key: string): void => host.setRootPluginData(key, '');

  /** Deletes every payload key of both layouts. Enumeration catches orphans that
   * probing cannot see; probing keeps hosts without enumeration exact. Entries are
   * blanked from the highest index down so an interrupted sweep always leaves a
   * contiguous run that the next sweep can find again. */
  const sweepPayloadKeys = (): void => {
    const keys = host.getRootPluginDataKeys?.();
    if (keys) {
      for (const key of keys) if (isJournalPayloadKey(key)) blank(key);
    }
    if (host.getRootPluginData(colorSystemCreateJournalHeaderKeyV2()) !== '') {
      blank(colorSystemCreateJournalHeaderKeyV2());
    }
    let entryCount = 0;
    while (
      entryCount <= MAX_RESOURCES &&
      host.getRootPluginData(colorSystemCreateJournalEntryKeyV2(entryCount)) !== ''
    ) {
      entryCount += 1;
    }
    for (let index = entryCount - 1; index >= 0; index -= 1) {
      blank(colorSystemCreateJournalEntryKeyV2(index));
    }
    for (const generation of [0, 1] as const) {
      let chunkCount = 0;
      while (
        chunkCount <= LEGACY_MAX_CHUNKS &&
        host.getRootPluginData(legacyChunkKey(generation, chunkCount)) !== ''
      ) {
        chunkCount += 1;
      }
      for (let index = chunkCount - 1; index >= 0; index -= 1) {
        blank(legacyChunkKey(generation, index));
      }
    }
  };

  const writeManifest = (
    content: Omit<JournalManifestV3, 'manifestHash'>
  ): { raw: string; manifest: JournalManifestV3 } => {
    const manifest: JournalManifestV3 = { ...content, manifestHash: manifestHash(content) };
    const raw = canonicalJson(manifest);
    host.setRootPluginData(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY, raw);
    return { raw, manifest };
  };

  const readLegacy = (manifest: LegacyJournalManifestV2): ColorSystemCreateJournalV2 => {
    let raw = '';
    for (let index = 0; index < manifest.chunkCount; index += 1) {
      const chunk = host.getRootPluginData(legacyChunkKey(manifest.generation, index));
      if (!chunk || utf8ByteLength(chunk) > LEGACY_MAX_CHUNK_BYTES) {
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
    const journal = parseLegacyJournal(raw);
    if (journal.journalHash !== manifest.journalHash)
      throw new ColorSystemCreateJournalV2Error(
        'Stored v2 Create journal manifest does not match its content.'
      );
    return journal;
  };

  const read = (): AnyJournal | null => {
    const rawManifest = host.getRootPluginData(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY);
    if (!rawManifest) {
      cache = null;
      committedOutputs.clear();
      return null;
    }
    const parsed = parseManifest(rawManifest);
    if (parsed.format === 'legacy') {
      const journal = readLegacy(parsed.manifest);
      cache = { format: 'legacy', journal };
      return journal;
    }
    const manifest = parsed.manifest;
    const headerRaw = host.getRootPluginData(colorSystemCreateJournalHeaderKeyV2());
    if (!headerRaw || utf8ByteLength(headerRaw) > COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_ENTRY_BYTES) {
      throw new ColorSystemCreateJournalV2Error(
        'Stored v2 Create journal header is missing or oversized.'
      );
    }
    const header = parseHeader(headerRaw);
    const headerHash = deterministicContentHash(header);
    if (headerHash !== manifest.headerHash) {
      throw new ColorSystemCreateJournalV2Error(
        'Stored v2 Create journal header failed hash validation.'
      );
    }
    const resources: ColorSystemCreateJournalResourceRefV2[] = [];
    const entriesRaw: string[] = [];
    const refKeys = new Set<string>();
    let chain = headerHash;
    let checkpointChain = headerHash;
    for (let index = 0; ; index += 1) {
      const raw = host.getRootPluginData(colorSystemCreateJournalEntryKeyV2(index));
      if (!raw) {
        if (index < manifest.resourceCount) {
          throw new ColorSystemCreateJournalV2Error(
            `Stored v2 Create journal entry ${index} is missing.`
          );
        }
        break;
      }
      if (index >= MAX_RESOURCES) {
        throw new ColorSystemCreateJournalV2Error(
          'Stored v2 Create journal exceeds the resource limit.'
        );
      }
      if (manifest.state === 'verified' && index >= manifest.resourceCount) {
        throw new ColorSystemCreateJournalV2Error(
          'Stored v2 Create journal has entries beyond its verified checkpoint.'
        );
      }
      if (utf8ByteLength(raw) > COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_ENTRY_BYTES) {
        throw new ColorSystemCreateJournalV2Error(
          `Stored v2 Create journal entry ${index} is oversized.`
        );
      }
      const entry = parseEntry(raw, index);
      const expected = entryChainHash(chain, index, entry.ref);
      if (entry.chain !== expected) {
        throw new ColorSystemCreateJournalV2Error(
          `Stored v2 Create journal entry ${index} failed hash validation.`
        );
      }
      const refKey = `${entry.ref.kind}\u0000${entry.ref.id}`;
      if (refKeys.has(refKey)) {
        throw new ColorSystemCreateJournalV2Error(
          'Stored v2 Create journal contains duplicate resource IDs.'
        );
      }
      refKeys.add(refKey);
      chain = expected;
      if (index === manifest.resourceCount - 1) checkpointChain = expected;
      resources.push(entry.ref);
      entriesRaw.push(raw);
    }
    if (checkpointChain !== manifest.chainHash) {
      throw new ColorSystemCreateJournalV2Error(
        'Stored v2 Create journal manifest does not match its content.'
      );
    }
    const journal: AnyJournal = {
      ...header,
      state: manifest.state,
      resources,
      journalHash: journalHashOf(headerHash, manifest.state, resources.length, chain),
    };
    cache = {
      format: 'v3',
      journal,
      snapshot: privateJournalSnapshot(journal),
      manifestRaw: rawManifest,
      manifest,
      headerRaw,
      headerHash,
      entriesRaw,
      chain,
      refKeys,
    };
    return journal;
  };

  const clear = (transactionId: string): void => {
    const current = read();
    if (!current) return;
    if (current.transactionId !== transactionId)
      throw new ColorSystemCreateJournalV2Error('Refused to clear a different v2 Create journal.');
    // The manifest goes first: without it the remaining keys are unreadable by
    // design, and the next `begin` sweeps them if this sweep is interrupted.
    blank(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY);
    cache = null;
    committedOutputs.delete(transactionId);
    sweepPayloadKeys();
  };

  const begin = (input: BeginColorSystemCreateJournalV2Input): ColorSystemCreateJournalV2 => {
    if (read())
      throw new ColorSystemCreateJournalV2Error(
        'An earlier v2 Create journal must be reconciled before mutation.'
      );
    sweepPayloadKeys();
    const expectedCounts: ColorSystemCreateJournalExpectedCountsV2 = {
      collections: 2,
      variables: input.counts.variables,
      styles: input.counts.styles,
      components: input.counts.components,
      frames: 5,
      pages: 1,
    };
    const header: ColorSystemCreateJournalHeaderV2 = {
      version: COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION,
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
    };
    return persistHeader(header) as ColorSystemCreateJournalV2;
  };
  const beginAuthored = (
    input: BeginColorSystemAuthoredCreateJournalV1Input
  ): ColorSystemAuthoredCreateJournalV1 => {
    const detached = snapshotColorSystemInertJsonV1(input, {
      maximumBytes: COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_ENTRY_BYTES,
      maximumDepth: 3,
      maximumNodes: 100,
      maximumObjectKeys: 32,
    });
    if (
      !isRecord(detached) ||
      !onlyKeys(
        detached,
        AUTHORED_HEADER_KEYS.filter(key => !['version', 'expectedCounts'].includes(key)).concat(
          'counts'
        )
      )
    )
      throw new ColorSystemCreateJournalV2Error('Authored Create input failed strict validation.');
    const { counts, ...fields } = detached;
    const header = {
      ...fields,
      version: COLOR_SYSTEM_AUTHORED_CREATE_JOURNAL_V1_VERSION,
      expectedCounts: counts,
    };
    if (!validAuthoredHeader(header))
      throw new ColorSystemCreateJournalV2Error(
        'Authored Create header or resource counts failed strict validation.'
      );
    if (read())
      throw new ColorSystemCreateJournalV2Error(
        'An earlier Create journal must be reconciled before mutation.'
      );
    sweepPayloadKeys();
    return persistHeader(
      header as unknown as ColorSystemAuthoredCreateJournalHeaderV1
    ) as ColorSystemAuthoredCreateJournalV1;
  };
  const persistHeader = (header: AnyHeader): AnyJournal => {
    if (Object.values(header.expectedCounts).reduce((sum, count) => sum + count, 0) > MAX_RESOURCES)
      throw new ColorSystemCreateJournalV2Error(
        'Create journal resource limit exceeded before mutation.'
      );
    const headerRaw = canonicalJson(header);
    if (utf8ByteLength(headerRaw) > COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_ENTRY_BYTES) {
      throw new ColorSystemCreateJournalV2Error(
        'Create journal header exceeds the plugin-data entry limit.'
      );
    }
    const headerHash = deterministicContentHash(header);
    host.setRootPluginData(colorSystemCreateJournalHeaderKeyV2(), headerRaw);
    let written: { raw: string; manifest: JournalManifestV3 };
    try {
      written = writeManifest({
        version: COLOR_SYSTEM_CREATE_JOURNAL_V2_MANIFEST_VERSION,
        headerHash,
        state: 'creating',
        resourceCount: 0,
        chainHash: headerHash,
      });
    } catch (error) {
      try {
        blank(colorSystemCreateJournalHeaderKeyV2());
      } catch {
        // Without a manifest the header is inert; the next begin sweeps it.
      }
      throw error;
    }
    const journal: AnyJournal = {
      ...header,
      state: 'creating',
      resources: [],
      journalHash: journalHashOf(headerHash, 'creating', 0, headerHash),
    };
    cache = {
      format: 'v3',
      journal,
      snapshot: privateJournalSnapshot(journal),
      manifestRaw: written.raw,
      manifest: written.manifest,
      headerRaw,
      headerHash,
      entriesRaw: [],
      chain: headerHash,
      refKeys: new Set(),
    };
    return journal;
  };

  /** Fast path: the caller holds the journal this runtime last returned, the
   * manifest and header are byte-identical, every entry past the checkpoint (at
   * most one group) is byte-identical, and nothing was appended. Otherwise the
   * whole persisted log is re-read and re-verified. */
  const assertCurrent = (journal: AnyJournal, mode: 'cached' | 'full' = 'cached'): AnyJournal => {
    if (mode === 'cached' && cache?.format === 'v3' && cache.journal === journal) {
      if (!sameJournalSnapshot(journal, cache.snapshot))
        throw new ColorSystemCreateJournalV2Error(
          'The returned Create journal was changed after validation.'
        );
      const { manifest, entriesRaw } = cache;
      const stillCurrent =
        host.getRootPluginData(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY) === cache.manifestRaw &&
        host.getRootPluginData(colorSystemCreateJournalHeaderKeyV2()) === cache.headerRaw &&
        entriesRaw.every(
          (raw, index) =>
            index < manifest.resourceCount ||
            host.getRootPluginData(colorSystemCreateJournalEntryKeyV2(index)) === raw
        ) &&
        host.getRootPluginData(colorSystemCreateJournalEntryKeyV2(entriesRaw.length)) === '';
      if (stillCurrent) return journal;
    }
    const current = read();
    if (
      !current ||
      current.version !== journal.version ||
      current.transactionId !== journal.transactionId ||
      current.journalHash !== journal.journalHash
    ) {
      throw new ColorSystemCreateJournalV2Error(
        'The v2 Create journal changed unexpectedly during mutation.'
      );
    }
    return current;
  };

  const requireAppendable = (): JournalCacheV3 => {
    if (!cache || cache.format !== 'v3') {
      throw new ColorSystemCreateJournalV2Error(
        'A legacy-format v2 Create journal must be reconciled before it can change.'
      );
    }
    return cache;
  };

  const record = (journal: AnyJournal, ref: ColorSystemCreateJournalResourceRefV2): AnyJournal => {
    const current = assertCurrent(journal);
    if (!validRef(ref))
      throw new ColorSystemCreateJournalV2Error(
        'Created v2 resource has an invalid recovery identity.'
      );
    const live = requireAppendable();
    const refKey = `${ref.kind}\u0000${ref.id}`;
    if (live.refKeys.has(refKey)) return current;
    if (current.resources.length >= MAX_RESOURCES)
      throw new ColorSystemCreateJournalV2Error('V2 Create journal resource limit exceeded.');
    const index = current.resources.length;
    const chain = entryChainHash(live.chain, index, ref);
    const entryRaw = canonicalJson({ chain, ref } satisfies JournalEntryV3);
    if (utf8ByteLength(entryRaw) > COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_ENTRY_BYTES) {
      throw new ColorSystemCreateJournalV2Error(
        'Create journal entry exceeds the plugin-data entry limit.'
      );
    }
    host.setRootPluginData(colorSystemCreateJournalEntryKeyV2(index), entryRaw);
    let { manifestRaw, manifest } = live;
    if (index > 0 && index % COLOR_SYSTEM_CREATE_JOURNAL_V2_CHECKPOINT_INTERVAL === 0) {
      // The previous group just closed: checkpoint it. Entries beyond the
      // checkpoint stay recoverable through the chain if this write is interrupted.
      const written = writeManifest({
        version: COLOR_SYSTEM_CREATE_JOURNAL_V2_MANIFEST_VERSION,
        headerHash: live.headerHash,
        state: 'creating',
        resourceCount: index,
        chainHash: live.chain,
      });
      manifestRaw = written.raw;
      manifest = written.manifest;
    }
    const next: AnyJournal = {
      ...contentOf(current),
      resources: [...current.resources, ref],
      journalHash: journalHashOf(live.headerHash, 'creating', index + 1, chain),
    };
    live.entriesRaw.push(entryRaw);
    live.refKeys.add(refKey);
    cache = {
      ...live,
      journal: next,
      snapshot: privateJournalSnapshot(next),
      manifestRaw,
      manifest,
      chain,
    };
    return next;
  };

  const markVerified = (journal: AnyJournal): AnyJournal => {
    // The verified checkpoint covers the whole log, so verify the whole log first.
    const current = assertCurrent(journal, 'full');
    assertCompleteRefCounts(current);
    const live = requireAppendable();
    const written = writeManifest({
      version: COLOR_SYSTEM_CREATE_JOURNAL_V2_MANIFEST_VERSION,
      headerHash: live.headerHash,
      state: 'verified',
      resourceCount: current.resources.length,
      chainHash: live.chain,
    });
    const next: AnyJournal = {
      ...contentOf(current),
      state: 'verified',
      journalHash: journalHashOf(live.headerHash, 'verified', current.resources.length, live.chain),
    };
    cache = {
      ...live,
      journal: next,
      snapshot: privateJournalSnapshot(next),
      manifestRaw: written.raw,
      manifest: written.manifest,
    };
    return next;
  };

  const assertOutputFingerprint = async (
    journal: AnyJournal,
    completion: AnyCompletion
  ): Promise<void> => {
    const outputFingerprint = await host.fingerprintResources(journal.resources);
    assertCurrent(journal, 'full');
    if (outputFingerprint !== completion.outputFingerprint) {
      throw new ColorSystemCreateJournalV2Error(
        'The completed Teul-owned output changed after Create, so it cannot be treated as an identical no-op. No resource was changed.',
        [
          `expected fingerprint ${completion.outputFingerprint}`,
          `actual fingerprint ${outputFingerprint}`,
        ]
      );
    }
  };

  const acknowledgeCommitted = async (journal: AnyJournal): Promise<void> => {
    // Host awaits must not expose the completion identity to mutations of a public artifact.
    const current = privateJournalSnapshot(assertCurrent(journal));
    if (current.state !== 'verified') {
      throw new ColorSystemCreateJournalV2Error(
        'A v2 Create completion can be acknowledged only after exact output verification.'
      );
    }
    assertCompleteRefCounts(current);
    let committed = committedOutputs.get(current.transactionId);
    if (!committed) {
      committed = { journalHash: current.journalHash, completion: null };
      committedOutputs.set(current.transactionId, committed);
      const outputFingerprint = await host.fingerprintResources(current.resources);
      assertCurrent(current, 'full');
      if (typeof outputFingerprint !== 'string' || !HASH.test(outputFingerprint)) {
        throw new ColorSystemCreateJournalV2Error(
          'The complete v2 Create output did not produce a valid resource fingerprint.'
        );
      }
      committed.completion = withCompletionHash({
        ...(current.version === COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION
          ? {
              version: COLOR_SYSTEM_CREATE_COMPLETION_V2_VERSION,
              resourceBlueprintHash: current.resourceBlueprintHash,
              sectionBlueprintHash: current.sectionBlueprintHash,
            }
          : {
              version: COLOR_SYSTEM_AUTHORED_CREATE_COMPLETION_V1_VERSION,
              ...authoredIdentity(current),
            }),
        transactionId: current.transactionId,
        currentFileIdentityHash: current.currentFileIdentityHash,
        journalHash: current.journalHash,
        outputFingerprint,
      });
    } else if (
      committed.journalHash !== current.journalHash ||
      !committed.completion ||
      !completionMatches(committed.completion, current)
    ) {
      throw new ColorSystemCreateJournalV2Error(
        'The original committed Create output fingerprint is unavailable for this exact journal. Its resources remain preserved.'
      );
    } else {
      await assertOutputFingerprint(current, committed.completion);
    }
    const completion = committed.completion;
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
    // Storage awaits allow document edits. Never report completion if the native
    // output changed while its original acknowledgement was being persisted.
    await assertOutputFingerprint(current, completion);
  };

  const validateResolved = (
    journal: AnyJournal,
    ref: ColorSystemCreateJournalResourceRefV2,
    resource: ColorSystemCreateJournalResolvedResourceV2
  ): string[] => {
    const failures: string[] = [];
    const owner = resource.ownership;
    if (resource.kind !== ref.kind)
      failures.push(`${ref.kind} ${ref.id} resolved as ${resource.kind}`);
    if (resource.remote === true) failures.push(`${ref.kind} ${ref.id} is remote`);
    if (
      owner.transactionId !== journal.transactionId ||
      owner.systemId !== journal.systemId ||
      owner.recipeId !== ref.recipeId ||
      owner.resourceKind !== ref.kind ||
      (journal.version === COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION
        ? owner.version !== COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION ||
          !('resourceBlueprintHash' in owner) ||
          owner.resourceBlueprintHash !== journal.resourceBlueprintHash ||
          owner.sectionBlueprintHash !== journal.sectionBlueprintHash
        : owner.version !== COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION ||
          !('deliveryBlueprintHash' in owner) ||
          !AUTHORED_IDENTITY_KEYS.every(key => owner[key] === journal[key]))
    ) {
      failures.push(`${ref.kind} ${ref.id} is not owned by this exact v2 Create transaction`);
    }
    return failures;
  };

  const reconcile = async (
    currentFileIdentityHash: string,
    target: AnyTarget,
    beforeMutation?: () => Promise<void>
  ): Promise<AnyReconciliation> => {
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
      let acknowledged = completionMatches(completion, journal);
      if (!acknowledged && committedOutputs.has(journal.transactionId)) {
        try {
          await acknowledgeCommitted(journal);
          completion = await readCompletion(journal.currentFileIdentityHash);
          acknowledged = completionMatches(completion, journal);
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
          ...(journal.version === COLOR_SYSTEM_CREATE_JOURNAL_V2_VERSION
            ? { resourceBlueprintHash: journal.resourceBlueprintHash }
            : { deliveryBlueprintHash: journal.deliveryBlueprintHash }),
        };
      }
      const exactTarget = targetMatches(journal, target);
      if (exactTarget) {
        await assertOutputFingerprint(journal, completion);
        return {
          status: 'verified-existing-output',
          removedResourceCount: 0,
          blocksNewMutation: false,
          transactionId: journal.transactionId,
          outputName: journal.outputName,
          ...targetOf(journal),
          resources: journal.resources,
        };
      }
      await beforeMutation?.();
      clear(journal.transactionId);
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

  const assertLease = (token?: object): void => {
    const active = activeTransactions.get(transactionScope);
    if (token ? active !== token : active !== undefined)
      throw new ColorSystemCreateJournalV2Error(
        'Another Create transaction is active in this document; retry after it finishes.'
      );
  };
  const requireKind = (
    journal: AnyJournal | null,
    kind: ColorSystemCreateJournalContractKind
  ): void => {
    if (journal && kindOf(journal) !== kind) {
      cache = null;
      throw new ColorSystemCreateJournalV2Error(
        `The active ${kindOf(journal)} Create journal requires its own recovery surface; ${kind} cannot change it.`
      );
    }
  };
  const readKind = (kind: ColorSystemCreateJournalContractKind): AnyJournal | null => {
    const journal = read();
    requireKind(journal, kind);
    return journal;
  };
  const runAsync = async <T>(
    token: object | undefined,
    operation: () => Promise<T>
  ): Promise<T> => {
    assertLease(token);
    if (token) return operation();
    const ownToken = {};
    activeTransactions.set(transactionScope, ownToken);
    try {
      return await operation();
    } finally {
      if (activeTransactions.get(transactionScope) === ownToken)
        activeTransactions.delete(transactionScope);
    }
  };
  const methods = <J extends AnyJournal, I, T extends AnyTarget, R extends AnyReconciliation>(
    kind: ColorSystemCreateJournalContractKind,
    start: (input: I) => J,
    token?: object
  ) => ({
    read: (): J | null => readKind(kind) as J | null,
    begin: (input: I): J => {
      assertLease(token);
      readKind(kind);
      return start(input);
    },
    record: (journal: J, ref: ColorSystemCreateJournalResourceRefV2): J => {
      assertLease(token);
      requireKind(journal, kind);
      return record(journal, ref) as J;
    },
    markVerified: (journal: J): J => {
      assertLease(token);
      requireKind(journal, kind);
      return markVerified(journal) as J;
    },
    acknowledgeCommitted: (journal: J): Promise<void> =>
      runAsync(token, async () => {
        requireKind(journal, kind);
        await acknowledgeCommitted(journal);
      }),
    clear: (transactionId: string): void => {
      assertLease(token);
      readKind(kind);
      clear(transactionId);
    },
    reconcile: (
      currentFileIdentityHash: string,
      target: T,
      beforeMutation?: () => Promise<void>
    ): Promise<R> =>
      runAsync(token, async () => {
        readKind(kind);
        return (await reconcile(currentFileIdentityHash, target, beforeMutation)) as R;
      }),
  });
  const legacyMethods = (token?: object): ColorSystemLegacyCreateJournalMethodsV2 =>
    methods<
      ColorSystemCreateJournalV2,
      BeginColorSystemCreateJournalV2Input,
      ColorSystemCreateJournalTargetV2,
      ColorSystemCreateJournalReconciliationV2
    >('legacy-v2', begin, token);
  const authoredMethods = (token?: object): ColorSystemAuthoredCreateJournalRuntimeV1 =>
    methods<
      ColorSystemAuthoredCreateJournalV1,
      BeginColorSystemAuthoredCreateJournalV1Input,
      ColorSystemAuthoredCreateJournalTargetV1,
      ColorSystemAuthoredCreateJournalReconciliationV1
    >('authored-v1', beginAuthored, token);
  return {
    ...legacyMethods(),
    authored: authoredMethods(),
    getActiveContractKind() {
      const journal = read();
      return journal ? kindOf(journal) : null;
    },
    acquireTransaction() {
      if (activeTransactions.has(transactionScope)) return null;
      const token = {};
      activeTransactions.set(transactionScope, token);
      return {
        legacy: legacyMethods(token),
        authored: authoredMethods(token),
        release() {
          if (activeTransactions.get(transactionScope) === token)
            activeTransactions.delete(transactionScope);
        },
      };
    },
  };
}

function assertCompleteRefCounts(journal: AnyJournal): void {
  const actual = { collections: 0, variables: 0, styles: 0, components: 0, frames: 0, pages: 0 };
  for (const ref of journal.resources) actual[`${ref.kind}s` as keyof typeof actual] += 1;
  if (canonicalJson(actual) !== canonicalJson(journal.expectedCounts)) {
    throw new ColorSystemCreateJournalV2Error(
      'Verified v2 Create journal does not contain the complete expected resource inventory.',
      [`expected ${canonicalJson(journal.expectedCounts)}`, `actual ${canonicalJson(actual)}`]
    );
  }
}

type FigmaJournalResource = (
  VariableCollection | Variable | PaintStyle | ComponentNode | FrameNode | PageNode
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

function figmaPluginDataSnapshot(
  resource: PluginDataMixin,
  authored = false
): Record<string, string> {
  return Object.fromEntries(
    [
      ...Object.values(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA),
      ...(authored ? Object.values(COLOR_SYSTEM_AUTHORED_FIGMA_PLUGIN_DATA_V1) : []),
    ]
      .sort()
      .map(key => [key, resource.getPluginData(key)])
  );
}

function figmaResourceSnapshot(resource: FigmaJournalResource, authored = false): unknown {
  const properties: Record<string, unknown> = {};
  for (const key of [
    ...FIGMA_JOURNAL_MUTABLE_PROPERTIES,
    ...(authored
      ? ['vectorPaths', 'vectorNetwork', 'fillGeometry', 'relativeTransform', 'absoluteTransform']
      : []),
  ]) {
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
    pluginData: figmaPluginDataSnapshot(resource, authored),
    properties,
    ...(typeof mainComponentId === 'string' ? { mainComponentId } : {}),
    children: Array.isArray(children)
      ? children.map(child => figmaResourceSnapshot(child as FigmaJournalResource, authored))
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
    transactionScope: figmaApi.root,
    getRootPluginData: key => figmaApi.root.getPluginData(key),
    setRootPluginData: (key, value) => figmaApi.root.setPluginData(key, value),
    getRootPluginDataKeys: () => figmaApi.root.getPluginDataKeys(),
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
      let authored = false;
      for (const ref of refs) {
        const resource = await resolve(ref);
        if (!resource) {
          throw new ColorSystemCreateJournalV2Error(
            `Completed v2 Create resource ${ref.kind} ${ref.id} is missing during fingerprint verification.`
          );
        }
        const resourceAuthored =
          resource.getPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.version) ===
          COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION;
        authored ||= resourceAuthored;
        snapshots.push({ ref, resource: figmaResourceSnapshot(resource, resourceAuthored) });
      }
      return deterministicContentHash(
        authored
          ? serializeColorSystemInertJsonV1(snapshots, {
              maximumBytes: 16 * 1024 * 1024,
              maximumDepth: 64,
              maximumNodes: 500000,
            })
          : snapshots
      );
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
          ...(resource.getPluginData(keys.version) ===
          COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION
            ? (Object.fromEntries(
                AUTHORED_IDENTITY_KEYS.map(key => [
                  key,
                  resource.getPluginData(COLOR_SYSTEM_AUTHORED_FIGMA_PLUGIN_DATA_V1[key]),
                ])
              ) as unknown as ColorSystemAuthoredCreateIdentityV1)
            : {
                resourceBlueprintHash: resource.getPluginData(keys.resourceBlueprintHash),
                sectionBlueprintHash: resource.getPluginData(keys.sectionBlueprintHash),
              }),
          resourceKind: resource.getPluginData(keys.resourceKind),
        } as ColorSystemCreateJournalResolvedResourceV2['ownership'],
        remove: () => resource.remove(),
      };
    },
  };
}
