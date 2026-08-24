import { canonicalJson, deterministicContentHash } from '../lib/colorSystemAudit';
import { COLOR_SYSTEM_OUTPUT_LIMITS } from '../lib/colorSystemOutputBlueprint';
import { utf8ByteLength } from '../lib/utf8';
import {
  isTeulColorSystemApplyResource,
  markTeulColorSystemApplyResource,
} from './colorResourceOwnership';

export const COLOR_SYSTEM_APPLY_JOURNAL_KEY = 'teul-color-system-apply-journal-v1';
export const COLOR_SYSTEM_APPLY_JOURNAL_VERSION = 'teul-color-system-apply-journal/v1' as const;

// Figma limits one plugin-data entry to 100 kB. Keep a substantial envelope
// for the plugin id, key, and future host accounting changes.
const MAX_JOURNAL_BYTES = 64 * 1024;
const MAX_RESOURCE_ID_LENGTH = 256;
const MAX_OUTPUT_NAME_LENGTH = 128;
const MAX_REQUEST_ID_LENGTH = 128;
const MAX_RESOURCE_REFS = COLOR_SYSTEM_OUTPUT_LIMITS.maximumStyles + 2;
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

export type ColorSystemApplyJournalResourceKind = 'collection' | 'style' | 'node';

export interface ColorSystemApplyJournalResourceRef {
  kind: ColorSystemApplyJournalResourceKind;
  id: string;
}

interface ColorSystemApplyJournalContent {
  version: typeof COLOR_SYSTEM_APPLY_JOURNAL_VERSION;
  state: 'creating' | 'verified';
  transactionId: string;
  requestId: string;
  sourceHash: string;
  proposalHash: string;
  approvalHash: string;
  outputBlueprintHash: string;
  outputName: string;
  resources: readonly ColorSystemApplyJournalResourceRef[];
}

export interface ColorSystemApplyJournal extends ColorSystemApplyJournalContent {
  journalHash: string;
}

export interface BeginColorSystemApplyJournalInput {
  requestId: string;
  sourceHash: string;
  proposalHash: string;
  approvalHash: string;
  outputBlueprintHash: string;
  outputName: string;
}

export interface ColorSystemApplyJournalReconciliation {
  status: 'none' | 'cleaned-interrupted-output';
  removedResourceCount: number;
}

export class ColorSystemApplyJournalError extends Error {
  constructor(
    message: string,
    readonly failures: readonly string[] = []
  ) {
    super(message);
    this.name = 'ColorSystemApplyJournalError';
  }
}

export class ColorSystemApplyVerifiedOutputError extends ColorSystemApplyJournalError {
  constructor(outputName: string) {
    super(
      `A previously interrupted Apply already produced the verified output "${outputName}". Teul preserved it and did not create a duplicate. Inspect the existing output before applying again.`
    );
    this.name = 'ColorSystemApplyVerifiedOutputError';
  }
}

type PluginDataResourceWithId = {
  readonly id: string;
  getPluginData(key: string): string;
  setPluginData(key: string, value: string): void;
};

type RemovablePluginDataResource = PluginDataResourceWithId & {
  readonly name?: string;
  readonly remote?: boolean;
  readonly type?: string;
  remove(): void;
};

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !value.includes('\u0000')
  );
}

function journalHashPayload(journal: ColorSystemApplyJournalContent): unknown {
  return journal;
}

function withJournalHash(content: ColorSystemApplyJournalContent): ColorSystemApplyJournal {
  return {
    ...content,
    journalHash: deterministicContentHash(journalHashPayload(content)),
  };
}

function journalContent(journal: ColorSystemApplyJournal): ColorSystemApplyJournalContent {
  const { journalHash: _journalHash, ...content } = journal;
  return content;
}

function serializeJournal(journal: ColorSystemApplyJournal): string {
  const serialized = canonicalJson(journal);
  if (utf8ByteLength(serialized) > MAX_JOURNAL_BYTES) {
    throw new ColorSystemApplyJournalError(
      `Apply transaction journal exceeds the ${MAX_JOURNAL_BYTES}-byte safety limit.`
    );
  }
  return serialized;
}

function writeJournal(journal: ColorSystemApplyJournal): void {
  figma.root.setPluginData(COLOR_SYSTEM_APPLY_JOURNAL_KEY, serializeJournal(journal));
}

function validResourceRef(value: unknown): value is ColorSystemApplyJournalResourceRef {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['kind', 'id']) &&
    (value.kind === 'collection' || value.kind === 'style' || value.kind === 'node') &&
    isBoundedText(value.id, MAX_RESOURCE_ID_LENGTH)
  );
}

function parseJournal(value: string): ColorSystemApplyJournal {
  if (utf8ByteLength(value) > MAX_JOURNAL_BYTES) {
    throw new ColorSystemApplyJournalError('Stored Apply transaction journal is oversized.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ColorSystemApplyJournalError('Stored Apply transaction journal is not valid JSON.');
  }
  if (
    !isRecord(parsed) ||
    !hasOnlyKeys(parsed, [
      'version',
      'state',
      'transactionId',
      'requestId',
      'sourceHash',
      'proposalHash',
      'approvalHash',
      'outputBlueprintHash',
      'outputName',
      'resources',
      'journalHash',
    ]) ||
    parsed.version !== COLOR_SYSTEM_APPLY_JOURNAL_VERSION ||
    (parsed.state !== 'creating' && parsed.state !== 'verified') ||
    typeof parsed.transactionId !== 'string' ||
    !CONTENT_HASH.test(parsed.transactionId) ||
    !isBoundedText(parsed.requestId, MAX_REQUEST_ID_LENGTH) ||
    typeof parsed.sourceHash !== 'string' ||
    !CONTENT_HASH.test(parsed.sourceHash) ||
    typeof parsed.proposalHash !== 'string' ||
    !CONTENT_HASH.test(parsed.proposalHash) ||
    typeof parsed.approvalHash !== 'string' ||
    !CONTENT_HASH.test(parsed.approvalHash) ||
    typeof parsed.outputBlueprintHash !== 'string' ||
    !CONTENT_HASH.test(parsed.outputBlueprintHash) ||
    !isBoundedText(parsed.outputName, MAX_OUTPUT_NAME_LENGTH) ||
    !Array.isArray(parsed.resources) ||
    parsed.resources.length > MAX_RESOURCE_REFS ||
    !parsed.resources.every(validResourceRef) ||
    typeof parsed.journalHash !== 'string' ||
    !CONTENT_HASH.test(parsed.journalHash)
  ) {
    throw new ColorSystemApplyJournalError(
      'Stored Apply transaction journal failed strict v1 validation.'
    );
  }
  const journal = parsed as unknown as ColorSystemApplyJournal;
  const seen = new Set<string>();
  for (const resource of journal.resources) {
    const key = `${resource.kind}\u0000${resource.id}`;
    if (seen.has(key)) {
      throw new ColorSystemApplyJournalError(
        'Stored Apply transaction journal contains duplicate resource IDs.'
      );
    }
    seen.add(key);
  }
  const { journalHash, ...content } = journal;
  if (deterministicContentHash(journalHashPayload(content)) !== journalHash) {
    throw new ColorSystemApplyJournalError(
      'Stored Apply transaction journal failed deterministic hash validation.'
    );
  }
  return journal;
}

export function readColorSystemApplyJournal(): ColorSystemApplyJournal | null {
  const stored = figma.root.getPluginData(COLOR_SYSTEM_APPLY_JOURNAL_KEY);
  return stored ? parseJournal(stored) : null;
}

function assertCurrentJournal(transactionId: string): ColorSystemApplyJournal {
  const current = readColorSystemApplyJournal();
  if (!current || current.transactionId !== transactionId) {
    throw new ColorSystemApplyJournalError(
      'Apply transaction journal changed unexpectedly during mutation.'
    );
  }
  return current;
}

export function beginColorSystemApplyJournal(
  input: BeginColorSystemApplyJournalInput
): ColorSystemApplyJournal {
  if (readColorSystemApplyJournal()) {
    throw new ColorSystemApplyJournalError(
      'An earlier Apply transaction journal must be reconciled before mutation.'
    );
  }
  const transactionId = deterministicContentHash({
    version: COLOR_SYSTEM_APPLY_JOURNAL_VERSION,
    ...input,
  });
  const journal = withJournalHash({
    version: COLOR_SYSTEM_APPLY_JOURNAL_VERSION,
    state: 'creating',
    transactionId,
    requestId: input.requestId,
    sourceHash: input.sourceHash,
    proposalHash: input.proposalHash,
    approvalHash: input.approvalHash,
    outputBlueprintHash: input.outputBlueprintHash,
    outputName: input.outputName,
    resources: [],
  });
  writeJournal(journal);
  return journal;
}

export function recordColorSystemApplyJournalResource(
  journal: ColorSystemApplyJournal,
  kind: ColorSystemApplyJournalResourceKind,
  resource: PluginDataResourceWithId
): ColorSystemApplyJournal {
  assertCurrentJournal(journal.transactionId);
  if (!isBoundedText(resource.id, MAX_RESOURCE_ID_LENGTH)) {
    throw new ColorSystemApplyJournalError('Created Figma resource has an invalid ID.');
  }
  if (journal.resources.length >= MAX_RESOURCE_REFS) {
    throw new ColorSystemApplyJournalError('Apply transaction journal resource limit exceeded.');
  }
  if (journal.resources.some(item => item.kind === kind && item.id === resource.id)) {
    return journal;
  }

  // Figma exposes no atomic create-and-tag operation. Tagging is deliberately
  // the first instruction after creation, but a host crash in that irreducible
  // interval could still leave an unjournaled resource. Do not describe this
  // compensating journal as a true database transaction.
  markTeulColorSystemApplyResource(resource, journal.transactionId, journal.outputBlueprintHash);
  const next = withJournalHash({
    ...journalContent(journal),
    resources: [...journal.resources, { kind, id: resource.id }],
  });
  writeJournal(next);
  return next;
}

export function markColorSystemApplyJournalVerified(
  journal: ColorSystemApplyJournal
): ColorSystemApplyJournal {
  // This marker is the recovery handoff before Apply clears it and commits the
  // one Undo unit. An interruption while it remains must preserve the complete
  // output rather than treating it as an incomplete transaction.
  assertCurrentJournal(journal.transactionId);
  const next = withJournalHash({ ...journalContent(journal), state: 'verified' });
  writeJournal(next);
  return next;
}

export function clearColorSystemApplyJournal(transactionId: string): void {
  const current = readColorSystemApplyJournal();
  if (!current) return;
  if (current.transactionId !== transactionId) {
    throw new ColorSystemApplyJournalError(
      'Refused to clear a different Apply transaction journal.'
    );
  }
  // Do not swallow a host write failure. During Apply, the caller must roll
  // back instead of reporting success; during reconciliation, retaining the
  // verified marker is safer than permitting a duplicate output.
  figma.root.setPluginData(COLOR_SYSTEM_APPLY_JOURNAL_KEY, '');
}

async function resolveResource(
  ref: ColorSystemApplyJournalResourceRef
): Promise<RemovablePluginDataResource | null> {
  if (ref.kind === 'collection') {
    return (await figma.variables.getVariableCollectionByIdAsync(
      ref.id
    )) as RemovablePluginDataResource | null;
  }
  if (ref.kind === 'style') {
    const style = await figma.getStyleByIdAsync(ref.id);
    if (style && style.type !== 'PAINT') {
      throw new ColorSystemApplyJournalError(
        `Journal style ID ${ref.id} resolved to a non-paint style.`
      );
    }
    return style as RemovablePluginDataResource | null;
  }
  const node = await figma.getNodeByIdAsync(ref.id);
  if (node && node.type === 'DOCUMENT') {
    throw new ColorSystemApplyJournalError(
      `Journal node ID ${ref.id} resolved to the document root.`
    );
  }
  return node as RemovablePluginDataResource | null;
}

async function resolveAndValidateResources(
  journal: ColorSystemApplyJournal,
  requireEveryResource: boolean
): Promise<
  Array<{ ref: ColorSystemApplyJournalResourceRef; resource: RemovablePluginDataResource }>
> {
  const resolved: Array<{
    ref: ColorSystemApplyJournalResourceRef;
    resource: RemovablePluginDataResource;
  }> = [];
  const failures: string[] = [];
  for (const ref of journal.resources) {
    let resource: RemovablePluginDataResource | null;
    try {
      resource = await resolveResource(ref);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `${ref.kind} ${ref.id} lookup failed`);
      continue;
    }
    if (!resource) {
      if (requireEveryResource) failures.push(`${ref.kind} ${ref.id} is missing`);
      continue;
    }
    if (resource.remote === true) {
      failures.push(`${ref.kind} ${ref.id} is remote and cannot be recovered`);
      continue;
    }
    if (
      !isTeulColorSystemApplyResource(resource, journal.transactionId, journal.outputBlueprintHash)
    ) {
      failures.push(`${ref.kind} ${ref.id} is not owned by this exact Apply transaction`);
      continue;
    }
    resolved.push({ ref, resource });
  }
  if (failures.length > 0) {
    throw new ColorSystemApplyJournalError(
      'Apply transaction recovery found foreign, changed, or missing resources and stopped before deletion.',
      failures
    );
  }
  return resolved;
}

function removalPriority(kind: ColorSystemApplyJournalResourceKind): number {
  if (kind === 'node') return 0;
  if (kind === 'style') return 1;
  return 2;
}

function removalFailureLabel(
  ref: ColorSystemApplyJournalResourceRef,
  resource: RemovablePluginDataResource
): string {
  const name = resource.name || ref.id;
  if (ref.kind === 'collection') return `collection "${name}" removal failed`;
  if (ref.kind === 'style') return `style "${name}" removal failed`;
  return resource.type === 'PAGE'
    ? `created page "${name}" removal failed`
    : `overview node "${name}" removal failed`;
}

async function removeJournalResources(
  journal: ColorSystemApplyJournal,
  requireEveryResource: boolean
): Promise<number> {
  const resolved = await resolveAndValidateResources(journal, requireEveryResource);
  const ordered = [...resolved].sort((left, right) => {
    const priority = removalPriority(left.ref.kind) - removalPriority(right.ref.kind);
    return priority === 0
      ? journal.resources.indexOf(right.ref) - journal.resources.indexOf(left.ref)
      : priority;
  });
  const failures: string[] = [];
  let removed = 0;
  for (const { ref, resource } of ordered) {
    try {
      resource.remove();
      removed += 1;
    } catch (error) {
      failures.push(removalFailureLabel(ref, resource));
      console.error('Failed to recover exact Apply transaction resource:', error);
    }
  }
  if (failures.length > 0) {
    throw new ColorSystemApplyJournalError(
      'Apply transaction recovery could not remove every exact owned resource.',
      failures
    );
  }
  clearColorSystemApplyJournal(journal.transactionId);
  return removed;
}

export async function rollbackColorSystemApplyJournal(
  journal: ColorSystemApplyJournal
): Promise<number> {
  return removeJournalResources(journal, false);
}

export async function reconcileColorSystemApplyJournal(): Promise<ColorSystemApplyJournalReconciliation> {
  const journal = readColorSystemApplyJournal();
  if (!journal) return { status: 'none', removedResourceCount: 0 };
  await figma.loadAllPagesAsync();
  if (journal.state === 'verified') {
    // A verified marker can only be left before Apply's clear step (or when
    // that clear failed). Prove that every exact owned root remains, clear the
    // marker, and stop this invocation before any duplicate can be created.
    await resolveAndValidateResources(journal, true);
    clearColorSystemApplyJournal(journal.transactionId);
    throw new ColorSystemApplyVerifiedOutputError(journal.outputName);
  }
  const removedResourceCount = await removeJournalResources(journal, false);
  return { status: 'cleaned-interrupted-output', removedResourceCount };
}
