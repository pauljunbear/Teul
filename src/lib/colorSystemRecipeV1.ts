/** Durable design data. Parsing or saving a recipe never restores execution or Create authority. */
import { parseColorSystemModelV1, type ColorSystemModelV1 } from './colorSystemModelV1';
import {
  parseColorSystemAuthoringDirectionV1,
  executeColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringExecutionV1,
} from './colorSystemAuthoringExecutionV1';
import {
  buildColorSystemDesignContentV1,
  recheckColorSystemDesignLockV1,
  type ColorSystemDesignLockV1,
} from './colorSystemDesignContentV1';
import {
  buildColorSystemContextApplicationV1,
  type ColorSystemContextApplicationV1,
} from './colorSystemRelationshipsV1';
import { buildColorSystemApplicationRequirementsV1 } from './colorSystemApplicationRequirementsV1';
import type { ColorSystemAuthoredCandidateExecutionV1 } from './colorSystemAuthoredCandidatesV1';
import {
  snapshotColorSystemInertJsonV1,
  serializeColorSystemInertJsonV1,
} from './colorSystemInertJsonV1';
import { buildColorSystemProposalV1 } from './colorSystemProposalV1';
import { deterministicContentHash } from './colorSystemHashing';
import { utf8ByteLength } from './utf8';

export const COLOR_SYSTEM_RECIPE_V1_SCHEMA = 'teul.color-system-recipe.v1' as const;
export const COLOR_SYSTEM_RECIPE_V1_LIMITS = Object.freeze({
  maximumBytes: 8 * 1024 * 1024,
  maximumLocks: 128,
});
export interface ColorSystemRecipeV1 {
  readonly schemaVersion: typeof COLOR_SYSTEM_RECIPE_V1_SCHEMA;
  readonly id: string;
  readonly label: string;
  readonly source: {
    readonly model: ColorSystemModelV1;
    readonly intake: 'guideline-json' | 'current-file';
    /** Serialized read intent only. The backend must resolve it through an actual host read. */
    readonly currentFileReadScopeJson?: string;
  };
  readonly direction: ColorSystemAuthoringDirectionV1;
  /** Full reviewed values/rules remain inspectable offline; they are not trusted computed output. */
  readonly selection: {
    readonly model: ColorSystemModelV1;
    readonly applications: readonly ColorSystemContextApplicationV1[];
    readonly contentHash: string;
    readonly executionReceiptHash: string;
  } | null;
  readonly locks: readonly ColorSystemDesignLockV1[];
}
type JsonRecord = Record<string, unknown>;
function record(value: unknown, required: string[], optional: string[] = []): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Recipe requires a data record.');
  const result = value as JsonRecord;
  if (
    required.some(key => !Object.prototype.hasOwnProperty.call(result, key)) ||
    Object.keys(result).some(key => !required.includes(key) && !optional.includes(key))
  )
    throw new Error(
      'Recipe has missing or unknown fields; saved data cannot contain session or write authority.'
    );
  return result;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value))
    throw new Error('Recipe requires a content hash.');
  return value;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new Error('Recipe text is blank or exceeds its bound.');
  return value;
}

function rejectSessionState(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (
      [
        'sessionId',
        'authorization',
        'createAuthorization',
        'writeAuthorization',
        'journal',
        'journalState',
        'createNonce',
        'authorizationHash',
      ].includes(key)
    )
      throw new Error(
        'Recipes retain design decisions, never session, journal or write authorization.'
      );
    rejectSessionState(child);
  }
}

const losslessJson = (value: unknown) =>
  serializeColorSystemInertJsonV1(value, {
    maximumBytes: COLOR_SYSTEM_RECIPE_V1_LIMITS.maximumBytes,
    maximumDepth: 32,
    maximumNodes: 400000,
  });

/** Validates a known schema without recomputing its generated output or claiming source freshness. */
export function parseColorSystemRecipeV1(input: unknown): ColorSystemRecipeV1 {
  const data = record(
    snapshotColorSystemInertJsonV1(input, {
      maximumBytes: COLOR_SYSTEM_RECIPE_V1_LIMITS.maximumBytes,
      maximumDepth: 32,
      maximumNodes: 400000,
    }),
    ['schemaVersion', 'id', 'label', 'source', 'direction', 'selection', 'locks']
  );
  rejectSessionState(data);
  if (data.schemaVersion !== COLOR_SYSTEM_RECIPE_V1_SCHEMA)
    throw new Error('Unsupported recipe schema.');
  const recipeId = text(data.id, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(recipeId))
    throw new Error('Recipe identity contains unsupported characters.');
  const source = record(data.source, ['model', 'intake'], ['currentFileReadScopeJson']);
  if (source.intake !== 'guideline-json' && source.intake !== 'current-file')
    throw new Error('Unsupported source intake.');
  if (source.currentFileReadScopeJson !== undefined) {
    if (source.intake !== 'current-file')
      throw new Error('Imported snapshot data cannot claim a current-file read scope.');
    text(source.currentFileReadScopeJson, 65536);
    // This is deliberately only a declaration. The runtime owns its scope schema and native binding.
    snapshotColorSystemInertJsonV1(JSON.parse(source.currentFileReadScopeJson as string), {
      maximumBytes: 65536,
    });
  }
  const sourceModel = parseColorSystemModelV1(source.model);
  const direction = parseColorSystemAuthoringDirectionV1(data.direction);
  const generation = direction.generation;
  const declared =
    generation.kind === 'apply' || generation.kind === 'overlay'
      ? generation.proposal
      : generation.intent;
  if (declared.sourceModelHash !== sourceModel.modelHash)
    throw new Error('Recipe direction does not bind its retained original source.');
  if (generation.kind === 'apply') {
    const proposal = buildColorSystemProposalV1(sourceModel, generation.proposal);
    if (proposal.request.brief.operation !== 'apply')
      throw new Error('Apply recipes must preserve the source unchanged.');
  }
  buildColorSystemApplicationRequirementsV1(direction.requirements);
  if (!Array.isArray(data.locks) || data.locks.length > COLOR_SYSTEM_RECIPE_V1_LIMITS.maximumLocks)
    throw new Error('Recipe locks exceed their bound.');
  let selection: ColorSystemRecipeV1['selection'] = null;
  if (data.selection !== null) {
    const selected = record(data.selection, [
      'model',
      'applications',
      'contentHash',
      'executionReceiptHash',
    ]);
    const model = parseColorSystemModelV1(selected.model);
    if (
      !Array.isArray(selected.applications) ||
      !selected.applications.length ||
      selected.applications.length > 128
    )
      throw new Error('Recipe selection requires bounded actual applications.');
    const applications = selected.applications.map(buildColorSystemContextApplicationV1);
    const design = buildColorSystemDesignContentV1(model, applications);
    if (hash(selected.contentHash) !== design.contentHash)
      throw new Error('Recipe content identity does not match its native values and applications.');
    // Validate lock structure now. A changed lock remains readable but prevents successful replay below.
    for (const lock of data.locks) recheckColorSystemDesignLockV1(lock, design);
    selection = {
      model,
      applications,
      contentHash: design.contentHash,
      executionReceiptHash: hash(selected.executionReceiptHash),
    };
  } else if (data.locks.length)
    throw new Error('A recipe without a selected design cannot carry confirmed design locks.');
  return {
    schemaVersion: COLOR_SYSTEM_RECIPE_V1_SCHEMA,
    id: recipeId,
    label: text(data.label, 256),
    source: {
      model: sourceModel,
      intake: source.intake,
      ...(source.currentFileReadScopeJson !== undefined
        ? { currentFileReadScopeJson: source.currentFileReadScopeJson as string }
        : {}),
    },
    direction,
    selection,
    locks: data.locks as ColorSystemDesignLockV1[],
  };
}

export function serializeColorSystemRecipeV1(input: unknown): string {
  const result = losslessJson(parseColorSystemRecipeV1(input));
  if (utf8ByteLength(result) > COLOR_SYSTEM_RECIPE_V1_LIMITS.maximumBytes)
    throw new Error('Recipe export exceeds its byte bound.');
  return result;
}

/** Unknown versions remain their original bytes. Migration must create a separate revision. */
export function readColorSystemRecipeJsonV1(
  raw: string
):
  | { readonly status: 'supported'; readonly raw: string; readonly recipe: ColorSystemRecipeV1 }
  | { readonly status: 'read-only'; readonly raw: string; readonly schemaVersion: string | null } {
  if (typeof raw !== 'string' || utf8ByteLength(raw) > COLOR_SYSTEM_RECIPE_V1_LIMITS.maximumBytes)
    throw new Error('Recipe JSON exceeds its byte bound.');
  const input = snapshotColorSystemInertJsonV1(JSON.parse(raw), {
    maximumBytes: COLOR_SYSTEM_RECIPE_V1_LIMITS.maximumBytes,
    maximumDepth: 32,
    maximumNodes: 400000,
  });
  const data =
    input && typeof input === 'object' && !Array.isArray(input) ? (input as JsonRecord) : null;
  if (data?.schemaVersion !== COLOR_SYSTEM_RECIPE_V1_SCHEMA)
    return {
      status: 'read-only',
      raw,
      schemaVersion: typeof data?.schemaVersion === 'string' ? data.schemaVersion : null,
    };
  return { status: 'supported', raw, recipe: parseColorSystemRecipeV1(data) };
}

export interface ColorSystemRecipeReplayV1 {
  readonly status: 'matched' | 'changed' | 'blocked' | 'cancelled';
  readonly qualified: false;
  readonly sourceFreshness: 'not-checked';
  readonly recipeHash: string;
  readonly execution: ColorSystemAuthoringExecutionV1;
  readonly candidateId: string | null;
  readonly message: string;
}

/** Recompute once. A restored design still needs a separate live source check and reviewed-create authorization. */
export async function replayColorSystemRecipeV1(
  input: unknown,
  runtime?: ColorSystemAuthoredCandidateExecutionV1
): Promise<ColorSystemRecipeReplayV1> {
  const recipe = parseColorSystemRecipeV1(input);
  const recipeHash = deterministicContentHash(losslessJson(recipe));
  const execution = await executeColorSystemAuthoringDirectionV1(
    recipe.source.model,
    recipe.direction,
    runtime
  );
  const result = (
    status: ColorSystemRecipeReplayV1['status'],
    message: string,
    candidateId: string | null = null
  ): ColorSystemRecipeReplayV1 => ({
    status,
    qualified: false,
    sourceFreshness: 'not-checked',
    recipeHash,
    execution,
    candidateId,
    message,
  });
  if (execution.status === 'cancelled')
    return result('cancelled', 'Resume cancelled; the saved recipe remains unchanged.');
  if (execution.status !== 'ready')
    return result(
      'blocked',
      'The retained intent no longer produces a complete feasible candidate.'
    );
  for (const candidate of execution.candidates) {
    const applications = candidate.applications.applications.map(item => item.application);
    const design = buildColorSystemDesignContentV1(candidate.proposal.workingModel, applications);
    if (recipe.selection && recipe.selection.contentHash !== design.contentHash) continue;
    if (recipe.locks.some(lock => recheckColorSystemDesignLockV1(lock, design).status !== 'intact'))
      continue;
    return result(
      'matched',
      'Design content matches a freshly recomputed candidate. Source freshness and Create permission remain separate.',
      candidate.id
    );
  }
  return result(
    'changed',
    'Fresh results differ from the saved content or violate a retained lock; the last saved design remains available.'
  );
}
