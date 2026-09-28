/** Candidate authoring lifecycle. This module cannot reach a Figma mutation host. */
import {
  executeColorSystemAuthoringDirectionV1,
  parseColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringExecutionV1,
  type ColorSystemAuthoringDirectionV1,
} from '../lib/colorSystemAuthoringExecutionV1';
import {
  buildColorSystemDesignContentV1,
  buildColorSystemDesignLockV1,
  recheckColorSystemDesignLockV1,
  diffColorSystemDesignContentV1,
  type ColorSystemDesignDiffV1,
} from '../lib/colorSystemDesignContentV1';
import {
  COLOR_SYSTEM_RECIPE_V1_SCHEMA,
  parseColorSystemRecipeV1,
  readColorSystemRecipeJsonV1,
  replayColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
  type ColorSystemRecipeV1,
} from '../lib/colorSystemRecipeV1';
import { deterministicContentHash } from '../lib/colorSystemHashing';
import type { createColorSystemRecipeStorageV1 } from './colorSystemRecipeStorageV1';
import type { ColorSystemModelFreshCheckV1 } from './colorSystemModelControllerV1';
import {
  serializeColorSystemInertJsonV1,
  snapshotColorSystemInertJsonV1,
} from '../lib/colorSystemInertJsonV1';
import { parseColorSystemModelV1 } from '../lib/colorSystemModelV1';
import type {
  ColorSystemProposalV1,
  ColorSystemProposalRequestV1,
} from '../lib/colorSystemProposalV1';
import { describeColorSystemAuthoringFailureV1 } from './colorSystemAuthoringFailureV1';

export interface ColorSystemAuthoringSessionDependenciesV1 {
  source(): ColorSystemRecipeV1['source'] | null;
  storage: ReturnType<typeof createColorSystemRecipeStorageV1>;
  /** Must perform a backend evidence read; a saved read descriptor grants no capability. */
  checkSource(
    source: ColorSystemRecipeV1['source'],
    isCancelled: () => boolean
  ): Promise<ColorSystemModelFreshCheckV1>;
  yield?: () => Promise<void>;
}
export interface ColorSystemAuthoringSessionSnapshotV1 {
  readonly recipe: ColorSystemRecipeV1 | null;
  readonly readOnlyJson: string | null;
  readonly recipeHash: string | null;
  readonly saved: boolean;
  readonly revisionHeads: readonly string[];
  readonly conflictHeads: readonly string[];
  readonly sourceFreshness:
    'not-checked' | 'imported-snapshot' | 'same' | 'changed' | 'unsupported';
  readonly qualified: false;
}
export interface ColorSystemAuthoringSessionResultV1 {
  readonly status: 'ready' | 'blocked' | 'cancelled' | 'changed' | 'read-only';
  readonly message: string;
  readonly snapshot: ColorSystemAuthoringSessionSnapshotV1;
  readonly diff?: ColorSystemDesignDiffV1;
}
type Current = {
  /** Shared only by refinements of this open recipe, never by a later import/open. */
  lineage: object;
  recipe: ColorSystemRecipeV1;
  savedHash: string | null;
  revisionHeads: string[];
  conflictHeads: string[];
  /** Fresh evidence stays in memory; reopening does not rewrite the saved decision record. */
  execution: ColorSystemAuthoringExecutionV1;
  sourceFreshness: ColorSystemAuthoringSessionSnapshotV1['sourceFreshness'];
};
const recipeHash = (recipe: ColorSystemRecipeV1) =>
  deterministicContentHash(serializeColorSystemRecipeV1(recipe));
const design = (selection: NonNullable<ColorSystemRecipeV1['selection']>) =>
  buildColorSystemDesignContentV1(selection.model, selection.applications);
const exactSource = (source: ColorSystemRecipeV1['source'] | null) =>
  serializeColorSystemInertJsonV1(source, { maximumBytes: 8 * 1024 * 1024 });
function generatedProposal(
  execution: ColorSystemAuthoringExecutionV1
): ColorSystemProposalV1 | null {
  const generation = execution.generation;
  if (!generation) return null;
  return (
    execution.ruleReview?.proposal ??
    (generation.kind === 'apply' ? generation.proposal : generation.result.proposal)
  );
}

export function createColorSystemAuthoringSessionV1(
  dependencies: ColorSystemAuthoringSessionDependenciesV1
) {
  let current: Current | null = null;
  let readOnlyJson: string | null = null;
  let sequence = 0;
  let saving = false;
  let pendingReview: { draft: ColorSystemRecipeV1; proposal: ColorSystemProposalV1 } | null = null;
  const snapshot = (): ColorSystemAuthoringSessionSnapshotV1 => {
    const identity = current ? recipeHash(current.recipe) : null;
    return {
      recipe: current ? parseColorSystemRecipeV1(current.recipe) : null,
      readOnlyJson,
      recipeHash: identity,
      saved:
        !readOnlyJson &&
        !!current &&
        !current.conflictHeads.length &&
        current.savedHash === identity,
      revisionHeads: [...(current?.revisionHeads ?? [])],
      conflictHeads: [...(current?.conflictHeads ?? [])],
      sourceFreshness: current?.sourceFreshness ?? 'not-checked',
      qualified: false,
    };
  };
  const result = (
    status: ColorSystemAuthoringSessionResultV1['status'],
    message: string,
    diff?: ColorSystemDesignDiffV1
  ): ColorSystemAuthoringSessionResultV1 => ({
    status,
    message,
    snapshot: snapshot(),
    ...(diff ? { diff } : {}),
  });
  const runtime = (operation: number) => ({
    isCancelled: () => operation !== sequence,
    yield: dependencies.yield ?? (() => new Promise<void>(resolve => setTimeout(resolve, 0))),
  });
  const editable = () => {
    if (readOnlyJson)
      throw new Error(
        'This recipe version is read-only. Export its original data before creating a new recipe.'
      );
    if (!current) throw new Error('No selected recipe is available.');
    return current;
  };
  const select = (
    execution: ColorSystemAuthoringExecutionV1,
    locks: ColorSystemRecipeV1['locks']
  ) => {
    for (const candidate of execution.candidates) {
      const selection = {
        model: candidate.proposal.workingModel,
        applications: candidate.applications.applications.map(item => item.application),
        contentHash: '',
        executionReceiptHash: execution.receipt.receiptHash,
      };
      const content = design(selection);
      if (locks.some(lock => recheckColorSystemDesignLockV1(lock, content).status !== 'intact'))
        continue;
      return { ...selection, contentHash: content.contentHash };
    }
    return null;
  };
  async function restore(
    raw: string,
    heads: readonly string[],
    saved: boolean,
    conflictHeads: readonly string[] = []
  ) {
    const operation = ++sequence;
    pendingReview = null;
    const loaded = readColorSystemRecipeJsonV1(raw);
    if (loaded.status === 'read-only') {
      readOnlyJson = raw;
      return result(
        'read-only',
        'This version remains available for exact export; no migration or new permission was applied.'
      );
    }
    let recipe = loaded.recipe;
    const replay = await replayColorSystemRecipeV1(recipe, runtime(operation));
    if (operation !== sequence || replay.status === 'cancelled')
      return result('cancelled', 'Resume cancelled; the previous selection remains available.');
    if (replay.status !== 'matched') return result(replay.status, replay.message);
    const wasDraft = recipe.selection === null;
    if (wasDraft) {
      const selection = select(replay.execution, recipe.locks);
      if (!selection)
        return result('blocked', 'The draft did not produce a selectable complete design.');
      recipe = parseColorSystemRecipeV1({ ...recipe, selection });
    }
    current = {
      lineage: {},
      recipe,
      savedHash: saved && !wasDraft ? recipeHash(recipe) : null,
      revisionHeads: [...heads],
      conflictHeads: [...conflictHeads],
      execution: replay.execution,
      sourceFreshness:
        recipe.source.intake === 'guideline-json' ? 'imported-snapshot' : 'not-checked',
    };
    readOnlyJson = null;
    return result(
      'ready',
      wasDraft
        ? 'Draft recomputed into an unsaved design. Save a new revision to retain these values.'
        : 'Recipe recomputed. Current-file freshness and Create permission must be checked separately.'
    );
  }

  return {
    getSnapshot: snapshot,
    getPendingReview() {
      return pendingReview
        ? {
            proposalHash: pendingReview.proposal.proposalHash,
            model: parseColorSystemModelV1(pendingReview.proposal.workingModel),
            pendingRuleIds: [...pendingReview.proposal.pendingRuleIds],
          }
        : null;
    },
    /** Explicit rule decisions bind one computed draft. They do not select it or authorize creation. */
    prepareReview(
      proposalHash: string,
      decisions: NonNullable<ColorSystemProposalRequestV1['review']>['decisions']
    ) {
      const pending = pendingReview;
      if (
        !pending ||
        pending.proposal.proposalHash !== proposalHash ||
        exactSource(dependencies.source()) !== exactSource(pending.draft.source)
      )
        throw new Error('The rule review is stale. Recompute this draft before reviewing it.');
      const choices = snapshotColorSystemInertJsonV1(decisions) as typeof decisions;
      if (
        !Array.isArray(choices) ||
        !choices.length ||
        new Set(choices.map(item => item.ruleId)).size !== choices.length ||
        choices.some(item => !pending.proposal.pendingRuleIds.includes(item.ruleId))
      )
        throw new Error('Choose distinct pending rules from the current draft.');
      const preserved =
        pending.proposal.reviewStatus === 'current'
          ? (pending.proposal.request.review?.decisions ?? [])
          : [];
      const review: NonNullable<ColorSystemProposalRequestV1['review']> = {
        reviewedProposalHash: proposalHash,
        decisions: [
          ...new Map([...preserved, ...choices].map(choice => [choice.ruleId, choice])).values(),
        ],
      };
      const generation = pending.draft.direction.generation;
      // A new explicit review supersedes the prior policy; it does not authorize a second policy run.
      const { provisionalRuleReview: _policy, ...reviewedDirection } = pending.draft.direction;
      const reviewed: ColorSystemAuthoringDirectionV1['generation'] =
        generation.kind === 'apply'
          ? { ...generation, proposal: { ...generation.proposal, review } }
          : generation.kind === 'overlay'
            ? { ...generation, proposal: { ...generation.proposal, review } }
            : generation.kind === 'construction'
              ? { ...generation, intent: { ...generation.intent, review } }
              : { ...generation, intent: { ...generation.intent, review } };
      const bindReviewedModel = <
        T extends { readonly modelHash?: string; readonly modelBinding?: string },
      >(
        binding: T
      ) => {
        if ('modelHash' in binding) {
          if (binding.modelHash !== pending.proposal.workingModel.modelHash)
            throw new Error('The draft model binding is stale. Recompute before reviewing.');
          const { modelHash: _modelHash, ...rest } = binding;
          return { ...rest, modelBinding: 'generated-model' as const };
        }
        return binding;
      };
      return {
        id: pending.draft.id,
        label: pending.draft.label,
        expectedSourceHash: deterministicContentHash(exactSource(pending.draft.source)),
        direction: parseColorSystemAuthoringDirectionV1({
          ...reviewedDirection,
          generation: reviewed,
          composition: bindReviewedModel(pending.draft.direction.composition),
          ...(pending.draft.direction.interactionGroups
            ? {
                interactionGroups: pending.draft.direction.interactionGroups.map(group => ({
                  ...group,
                  request: bindReviewedModel(group.request),
                })),
              }
            : {}),
        }),
      };
    },
    cancel() {
      sequence++;
      pendingReview = null;
    },
    /** Source intake invalidates readiness without destroying the last confirmed recipe. */
    invalidateSource() {
      sequence++;
      pendingReview = null;
      if (current) current.sourceFreshness = 'not-checked';
    },
    async analyze(input: {
      id: string;
      label: string;
      direction: unknown;
      /** An in-memory preparation check, never saved permission or a model receipt. */
      expectedSourceHash?: string;
    }): Promise<ColorSystemAuthoringSessionResultV1> {
      const operation = ++sequence;
      pendingReview = null;
      if (readOnlyJson)
        throw new Error('Start a new recipe before editing an unsupported version.');
      const source = dependencies.source();
      if (!source) throw new Error('Read or import a source model first.');
      if (
        input.expectedSourceHash !== undefined &&
        input.expectedSourceHash !== deterministicContentHash(exactSource(source))
      )
        return result(
          'changed',
          'The source changed after this draft review was prepared. Recompute it before reviewing.'
        );
      const previous = current;
      const sameRecipe = previous?.recipe.id === input.id;
      if (sameRecipe && exactSource(previous.recipe.source) !== exactSource(source))
        return result(
          'changed',
          'The source packet changed. Retain the old recipe and start a new recipe identity before generating from this source.'
        );
      const direction = parseColorSystemAuthoringDirectionV1(input.direction);
      const draft = parseColorSystemRecipeV1({
        schemaVersion: COLOR_SYSTEM_RECIPE_V1_SCHEMA,
        id: input.id,
        label: input.label,
        source,
        direction,
        selection: null,
        locks: [],
      });
      const execution = await executeColorSystemAuthoringDirectionV1(
        draft.source.model,
        draft.direction,
        runtime(operation)
      );
      if (operation !== sequence || execution.status === 'cancelled')
        return result('cancelled', 'Analysis cancelled; the previous selection remains available.');
      if (exactSource(dependencies.source()) !== exactSource(draft.source))
        return result(
          'changed',
          'The source changed during analysis; the previous selection remains available.'
        );
      if (execution.status !== 'ready') {
        const proposal = generatedProposal(execution);
        if (proposal?.pendingRuleIds.length) {
          pendingReview = { draft, proposal };
          return result(
            'blocked',
            'Review the draft rules, then reassess the complete application. The previous selection remains available.'
          );
        }
        return result('blocked', describeColorSystemAuthoringFailureV1(execution, draft.direction));
      }
      const locks = sameRecipe ? previous.recipe.locks : [];
      const selection = select(execution, locks);
      if (!selection)
        return result(
          'blocked',
          `Every feasible result changes a locked relationship or color (${locks.map(lock => `${lock.target.kind} ${lock.target.id}`).join(', ')}). Choose a direction that preserves these locks, or explicitly unlock them before changing the design. The previous selection remains available.`
        );
      const recipe = parseColorSystemRecipeV1({ ...draft, selection, locks });
      const diff = previous?.recipe.selection
        ? diffColorSystemDesignContentV1(design(previous.recipe.selection), design(selection))
        : undefined;
      current = {
        lineage: sameRecipe ? previous.lineage : {},
        recipe,
        savedHash: sameRecipe ? previous.savedHash : null,
        revisionHeads: sameRecipe ? [...previous.revisionHeads] : [],
        conflictHeads: sameRecipe ? [...previous.conflictHeads] : [],
        execution,
        sourceFreshness:
          recipe.source.intake === 'guideline-json' ? 'imported-snapshot' : 'not-checked',
      };
      return result('ready', 'Complete candidate recomputed; exact locks were preserved.', diff);
    },
    lock(target: unknown) {
      const state = editable();
      if (!state.recipe.selection)
        throw new Error('Select a complete design before locking a family or scale.');
      const lock = buildColorSystemDesignLockV1(design(state.recipe.selection), target);
      sequence++;
      state.recipe = parseColorSystemRecipeV1({
        ...state.recipe,
        locks: [
          ...state.recipe.locks.filter(
            item => item.target.kind !== lock.target.kind || item.target.id !== lock.target.id
          ),
          lock,
        ],
      });
      return snapshot();
    },
    unlock(target: { kind: 'family' | 'scale'; id: string }) {
      const state = editable();
      sequence++;
      state.recipe = parseColorSystemRecipeV1({
        ...state.recipe,
        locks: state.recipe.locks.filter(
          item => item.target.kind !== target.kind || item.target.id !== target.id
        ),
      });
      return snapshot();
    },
    exportJson() {
      return readOnlyJson ?? serializeColorSystemRecipeV1(editable().recipe);
    },
    importJson(raw: string) {
      return restore(raw, [], false);
    },
    startNew() {
      sequence++;
      pendingReview = null;
      current = null;
      readOnlyJson = null;
      return snapshot();
    },
    list() {
      return dependencies.storage.list();
    },
    async open(recipeId: string, revisionHash: string) {
      const operation = ++sequence;
      const stored = await dependencies.storage.get(recipeId);
      if (operation !== sequence) return result('cancelled', 'Open cancelled.');
      if (stored.status !== 'found' || !stored.recipe)
        throw new Error('The selected saved recipe is unavailable.');
      if (stored.recipe.status === 'deleted') throw new Error('This recipe was deleted.');
      const entry = stored.recipe.revisions.find(
        item => item.revision?.revisionHash === revisionHash
      );
      if (!entry?.revision)
        throw new Error('Choose an exact readable revision from the current storage list.');
      return restore(
        entry.revision.recipeJson,
        [revisionHash],
        true,
        stored.recipe.headRevisionHashes.length > 1 ? stored.recipe.headRevisionHashes : []
      );
    },
    async save(mutationId: string) {
      if (saving) throw new Error('Wait for the current save acknowledgment before saving again.');
      const state = editable();
      if (state.conflictHeads.length)
        throw new Error('Resolve the observed revision branches before saving.');
      const recipeJson = serializeColorSystemRecipeV1(state.recipe);
      const savingHash = deterministicContentHash(recipeJson);
      saving = true;
      try {
        const saved = await dependencies.storage.save({
          recipeId: state.recipe.id,
          mutationId,
          parentRevisionHashes: [...state.revisionHeads],
          recipeJson,
        });
        if (current?.lineage === state.lineage && 'headRevisionHashes' in saved) {
          if (saved.status === 'conflict') current.conflictHeads = [...saved.headRevisionHashes];
          // Analysis replaces Current but retains lineage: preserve its newer draft and its saved parent.
          if (saved.acknowledgedRevisionHash)
            current.revisionHeads = [saved.acknowledgedRevisionHash];
          if (saved.status === 'saved') {
            current.savedHash = savingHash;
            current.conflictHeads = [];
          }
        }
        return { result: saved, snapshot: snapshot() };
      } finally {
        saving = false;
      }
    },
    /** Explicit choice to retain this design while preserving the other branch revisions in history. */
    async resolveConflicts(expectedHeadRevisionHashes: readonly string[]) {
      const operation = ++sequence;
      const state = editable();
      const observed = [...expectedHeadRevisionHashes].sort();
      if (!observed.length || new Set(observed).size !== observed.length)
        throw new Error('Choose the complete observed branch set.');
      const stored = await dependencies.storage.get(state.recipe.id);
      if (
        operation !== sequence ||
        current !== state ||
        stored.status !== 'found' ||
        !stored.recipe ||
        !['ready', 'conflict'].includes(stored.recipe.status) ||
        JSON.stringify([...stored.recipe.headRevisionHashes].sort()) !== JSON.stringify(observed)
      )
        throw new Error('Revision branches changed; inspect the current saved revisions.');
      state.revisionHeads = observed;
      state.conflictHeads = [];
      state.savedHash = null;
      return snapshot();
    },
    async openReadOnlyStorageEntry(key: string) {
      pendingReview = null;
      const operation = ++sequence;
      const listed = await dependencies.storage.list();
      if (operation !== sequence) return result('cancelled', 'Open cancelled.');
      if (listed.status !== 'listed') throw new Error('Stored recipe data could not be read.');
      const entry = [
        ...listed.snapshot.unscopedReadOnlyEntries,
        ...listed.snapshot.recipes.flatMap(recipe => recipe.readOnlyEntries),
      ].find(item => item.key === key);
      const raw = entry?.rawStorageJson ?? entry?.legacyExportJson;
      if (!raw) throw new Error('Choose an available read-only storage entry.');
      readOnlyJson = raw;
      return result(
        'read-only',
        'Original stored data is available for export; it will not be migrated or overwritten.'
      );
    },
    async delete(recipeId: string, mutationId: string, expectedHeadRevisionHashes: string[]) {
      const deleted = await dependencies.storage.delete({
        recipeId,
        mutationId,
        expectedHeadRevisionHashes,
      });
      if (
        (deleted.status === 'deleted' || deleted.status === 'delete-incomplete') &&
        current?.recipe.id === recipeId
      ) {
        sequence++;
        current = null;
        readOnlyJson = null;
      }
      if (
        (deleted.status === 'deleted' || deleted.status === 'delete-incomplete') &&
        pendingReview?.draft.id === recipeId
      )
        pendingReview = null;
      return { result: deleted, snapshot: snapshot() };
    },
    async checkSource() {
      const state = editable();
      if (state.recipe.source.intake === 'guideline-json') {
        state.sourceFreshness = 'imported-snapshot';
        return { result: null, snapshot: snapshot() };
      }
      const operation = ++sequence;
      const checked = await dependencies.checkSource(
        parseColorSystemRecipeV1(state.recipe).source,
        () => operation !== sequence || current !== state
      );
      if (operation === sequence && current === state) state.sourceFreshness = checked.status;
      return { result: checked, snapshot: snapshot() };
    },
  };
}
