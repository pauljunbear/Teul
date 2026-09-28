import { describe, expect, it, vi } from 'vitest';
import {
  COLOR_SYSTEM_RECIPE_V1_SCHEMA,
  parseColorSystemRecipeV1,
  readColorSystemRecipeJsonV1,
  replayColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
  type ColorSystemRecipeV1,
} from '../colorSystemRecipeV1';
import {
  COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
  executeColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringDirectionV1,
} from '../colorSystemAuthoringExecutionV1';
import { COLOR_SYSTEM_PROPOSAL_V1_VERSION } from '../colorSystemProposalV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
} from '../colorSystemApplicationRequirementsV1';
import { COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION } from '../colorSystemModelCompositionV1';
import { buildColorSystemModelV1, type ColorSystemModelV1 } from '../colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import {
  buildColorSystemDesignContentV1,
  buildColorSystemDesignLockV1,
} from '../colorSystemDesignContentV1';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;
const copy = <T>(value: T) => structuredClone(value) as Mutable<T>;
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const runtime = { isCancelled: () => false, yield: async () => {} };

function source(): ColorSystemModelV1 {
  const input = syntheticColorSystemModelInputV1();
  return buildColorSystemModelV1({
    ...input,
    rules: [],
    adoptions: [],
    claims: input.claims.map(claim => ({ ...claim, ruleIds: [] })),
    colors: input.colors.map(color =>
      color.id !== 'blue'
        ? color
        : {
            ...color,
            valuesByMode: {
              ...color.valuesByMode,
              Day: buildColorSystemSrgbValueV1(
                { r: -0, g: 0.1234567890123456, b: 0.35 },
                0.9876543210987654
              ),
            },
          }
    ),
  });
}
function direction(model: ColorSystemModelV1): ColorSystemAuthoringDirectionV1 {
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: ['Day', 'Night'].map(modeId => ({
      id: modeId,
      contextId: 'interface',
      modeId,
      uses: [
        { id: 'ground', role: 'ground', area: 100 },
        { id: 'mark', role: 'action', area: 20 },
      ],
      pairs: [
        {
          id: 'mark-on-ground',
          foregroundUseId: 'mark',
          backgroundUseId: 'ground',
          contrast: { minimum: 3, assessment: 'required' },
        },
      ],
    })),
    distinctions: [],
  });
  return {
    version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
    id: 'recipe-direction',
    generation: {
      kind: 'apply',
      proposal: {
        version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
        id: 'recipe-proposal',
        sourceModelHash: model.modelHash,
        brief: {
          briefHash: hash('fixed recipe brief'),
          operation: 'apply',
          contextIds: ['interface'],
          modeIds: ['Day', 'Night'],
          permissions: {
            addColors: false,
            addFamilies: false,
            addScales: false,
            addRules: false,
            editFamilyIds: [],
            editScaleIds: [],
            replaceRuleIds: [],
          },
        },
        derivation: {
          algorithmId: 'source-apply',
          algorithmVersion: '1',
          policyHash: hash('apply policy'),
          inputHash: hash('source'),
          sourceColorIds: ['paper', 'ink'],
          sourceScaleIds: [],
        },
        colors: [],
        families: [],
        scales: [],
        rules: [],
        exceptions: [],
      },
    },
    requirements,
    composition: {
      version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
      modelHash: model.modelHash,
      requirementsHash: hash(requirements),
      maximumNodes: 256,
      maximumSolutions: 3,
      groups: [
        {
          id: 'applications',
          options: [
            {
              id: 'source-pair',
              assignments: requirements.templates.flatMap(template =>
                template.uses.map(use => ({
                  applicationId: template.id,
                  useId: use.id,
                  colorId: use.id === 'ground' ? 'paper' : 'ink',
                }))
              ),
            },
          ],
        },
      ],
    },
    units: [],
  };
}
async function fixture() {
  const model = source(),
    input = direction(model);
  const execution = await executeColorSystemAuthoringDirectionV1(model, input, runtime);
  if (execution.status !== 'ready') throw new Error(`Recipe fixture is ${execution.status}.`);
  const candidate = execution.candidates[0];
  const applications = candidate.applications.applications.map(item => item.application);
  const design = buildColorSystemDesignContentV1(candidate.proposal.workingModel, applications);
  const recipe: ColorSystemRecipeV1 = {
    schemaVersion: COLOR_SYSTEM_RECIPE_V1_SCHEMA,
    id: 'recipe-a',
    label: 'Two-mode source application',
    source: { model, intake: 'guideline-json' },
    direction: input,
    selection: {
      model: candidate.proposal.workingModel,
      applications,
      contentHash: design.contentHash,
      executionReceiptHash: execution.receipt.receiptHash,
    },
    locks: [],
  };
  return { recipe: copy(recipe), execution, design };
}
function rebind(recipe: Mutable<ColorSystemRecipeV1>, model: ColorSystemModelV1) {
  recipe.source.model = copy(model);
  if (
    recipe.direction.generation.kind !== 'apply' ||
    !('modelHash' in recipe.direction.composition)
  )
    throw new Error('Expected apply fixture.');
  recipe.direction.generation.proposal.sourceModelHash = model.modelHash;
  recipe.direction.composition.modelHash = model.modelHash;
}

describe('durable color-system recipes', () => {
  it('round-trips exact native values and negative zero across source and selected content', async () => {
    const { recipe } = await fixture();
    const raw = serializeColorSystemRecipeV1(recipe),
      read = readColorSystemRecipeJsonV1(raw);
    expect(read.status).toBe('supported');
    if (read.status !== 'supported') throw new Error('Expected known recipe.');
    expect(read.raw).toBe(raw);
    for (const model of [read.recipe.source.model, read.recipe.selection!.model]) {
      const value = model.colors.find(color => color.id === 'blue')!.valuesByMode.Day;
      expect(Object.is(value.components.r, -0)).toBe(true);
      expect(value.components.g).toBe(0.1234567890123456);
      expect(value.alpha).toBe(0.9876543210987654);
      expect(value.representation?.kind).toBe('native-srgb');
    }
    expect(serializeColorSystemRecipeV1(read.recipe)).toBe(raw);
    expect((await replayColorSystemRecipeV1(read.recipe, runtime)).status).toBe('matched');
  });

  it('retains unknown schema bytes as a read-only export without interpreting a future payload', () => {
    const raw =
      ' \n {"schemaVersion":"future.recipe.v9","payload":{"native":0.12345678901234567,"signed":-0}} \n';
    expect(readColorSystemRecipeJsonV1(raw)).toEqual({
      status: 'read-only',
      raw,
      schemaVersion: 'future.recipe.v9',
    });
    expect(readColorSystemRecipeJsonV1('{"payload":"legacy"}')).toMatchObject({
      status: 'read-only',
      schemaVersion: null,
    });
  });

  it('rejects direction/source and selected-content identity mismatches', async () => {
    const { recipe } = await fixture();
    const staleDirection = copy(recipe);
    if (staleDirection.direction.generation.kind !== 'apply') throw new Error('Expected apply.');
    staleDirection.direction.generation.proposal.sourceModelHash = hash('other source');
    expect(() => parseColorSystemRecipeV1(staleDirection)).toThrow('retained original source');
    const staleSelection = copy(recipe);
    staleSelection.selection!.contentHash = hash('other content');
    expect(() => parseColorSystemRecipeV1(staleSelection)).toThrow('content identity');
    const staleSource = copy(recipe);
    const { modelHash: _old, ...content } = staleSource.source.model;
    staleSource.source.model = copy(
      buildColorSystemModelV1({
        ...content,
        sources: content.sources.map(item => ({ ...item, sourceHash: hash('replacement packet') })),
      })
    );
    expect(() => parseColorSystemRecipeV1(staleSource)).toThrow('retained original source');
  });

  it('checks stale composition/requirements identities during actual replay', async () => {
    const { recipe } = await fixture();
    const stale = copy(recipe);
    stale.direction.composition.requirementsHash = hash('wrong requirements');
    await expect(replayColorSystemRecipeV1(stale, runtime)).rejects.toThrow();
    if (!('modelHash' in stale.direction.composition)) throw new Error('Expected direct binding.');
    stale.direction.composition.requirementsHash = hash(stale.direction.requirements);
    stale.direction.composition.modelHash = hash('wrong generated model');
    await expect(replayColorSystemRecipeV1(stale, runtime)).rejects.toThrow();
  });

  it('treats current-file read intent as data and never restores freshness or Create permission', async () => {
    const { recipe } = await fixture();
    recipe.source.intake = 'current-file';
    recipe.source.currentFileReadScopeJson =
      '{"fileKey":"declared-file","usageScope":"selection","selectedNodeIds":["node:1"]}';
    const parsed = parseColorSystemRecipeV1(recipe);
    expect(parsed.source.currentFileReadScopeJson).toBe(recipe.source.currentFileReadScopeJson);
    const replay = await replayColorSystemRecipeV1(parsed, runtime);
    expect(replay).toMatchObject({
      status: 'matched',
      qualified: false,
      sourceFreshness: 'not-checked',
    });
    expect(Object.keys(replay)).not.toContain('binding');
    expect(Object.keys(replay)).not.toContain('createAuthorization');
    recipe.source.intake = 'guideline-json';
    expect(() => parseColorSystemRecipeV1(recipe)).toThrow('Imported snapshot');
  });

  it('reopens beyond five minutes and matches design even when runtime receipts change', async () => {
    const { recipe, execution } = await fixture();
    recipe.direction.id = 'resumed-direction';
    recipe.selection!.executionReceiptHash = hash('prior process receipt');
    const raw = serializeColorSystemRecipeV1(recipe);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 600001);
    try {
      const read = readColorSystemRecipeJsonV1(raw);
      if (read.status !== 'supported') throw new Error('Expected known recipe.');
      const replay = await replayColorSystemRecipeV1(read.recipe, runtime);
      expect(replay.status).toBe('matched');
      expect(replay.execution.receipt.receiptHash).not.toBe(execution.receipt.receiptHash);
      expect(replay).toMatchObject({ qualified: false, sourceFreshness: 'not-checked' });
      expect(serializeColorSystemRecipeV1(read.recipe)).toBe(raw);
    } finally {
      clock.mockRestore();
    }
  });

  it('compares saved selection against freshly recomputed applications, not its saved receipt', async () => {
    const { recipe } = await fixture();
    const selected = recipe.selection!;
    selected.applications[0].uses.find(use => use.id === 'mark')!.colorId = 'blue-deep';
    selected.contentHash = buildColorSystemDesignContentV1(
      selected.model,
      selected.applications
    ).contentHash;
    const before = serializeColorSystemRecipeV1(recipe);
    const replay = await replayColorSystemRecipeV1(recipe, runtime);
    expect(replay).toMatchObject({ status: 'changed', candidateId: null });
    expect(replay.execution.status).toBe('ready');
    expect(serializeColorSystemRecipeV1(recipe)).toBe(before);
  });

  it('preserves intact family/scale locks and blocks a changed locked native value', async () => {
    const { recipe, design } = await fixture();
    recipe.locks = copy([
      buildColorSystemDesignLockV1(design, { kind: 'family', id: 'pigments' }),
      buildColorSystemDesignLockV1(design, { kind: 'scale', id: 'blue-scale' }),
    ]);
    expect((await replayColorSystemRecipeV1(recipe, runtime)).status).toBe('matched');
    const { modelHash: _old, ...content } = recipe.source.model;
    const changed = buildColorSystemModelV1({
      ...content,
      colors: content.colors.map(color =>
        color.id !== 'blue'
          ? color
          : {
              ...color,
              valuesByMode: {
                ...color.valuesByMode,
                Day: buildColorSystemSrgbValueV1({ r: 0.2, g: 0.3, b: 0.4 }),
              },
            }
      ),
    });
    rebind(recipe, changed);
    recipe.selection!.model = copy(changed);
    recipe.selection!.contentHash = buildColorSystemDesignContentV1(
      changed,
      recipe.selection!.applications
    ).contentHash;
    expect(() => parseColorSystemRecipeV1(recipe)).not.toThrow();
    expect((await replayColorSystemRecipeV1(recipe, runtime)).status).toBe('changed');
  });

  it('rejects forged lock hashes and locks without a retained selection', async () => {
    const { recipe, design } = await fixture();
    recipe.locks = copy([buildColorSystemDesignLockV1(design, { kind: 'family', id: 'pigments' })]);
    const altered = copy(recipe);
    altered.locks[0].snapshotHash = hash('forged');
    expect(() => parseColorSystemRecipeV1(altered)).toThrow();
    const empty = { ...recipe, selection: null };
    expect(() => parseColorSystemRecipeV1(empty)).toThrow('without a selected design');
  });

  it('leaves the last saved recipe intact when replay is infeasible or cancelled', async () => {
    const { recipe } = await fixture();
    const before = serializeColorSystemRecipeV1(recipe);
    const cancelled = await replayColorSystemRecipeV1(recipe, {
      isCancelled: () => true,
      yield: async () => {},
    });
    expect(cancelled).toMatchObject({ status: 'cancelled', candidateId: null });
    expect(cancelled.execution.candidates).toEqual([]);
    expect(serializeColorSystemRecipeV1(recipe)).toBe(before);
    let stop = false;
    const interrupted = await replayColorSystemRecipeV1(recipe, {
      isCancelled: () => stop,
      yield: async () => {
        stop = true;
      },
    });
    expect(interrupted).toMatchObject({ status: 'cancelled', candidateId: null });
    expect(interrupted.execution.candidates).toEqual([]);
    expect(serializeColorSystemRecipeV1(recipe)).toBe(before);
    const infeasible = copy(recipe);
    for (const assignment of infeasible.direction.composition.groups[0].options[0].assignments)
      assignment.colorId = 'paper';
    const retained = serializeColorSystemRecipeV1(infeasible);
    expect((await replayColorSystemRecipeV1(infeasible, runtime)).status).toBe('blocked');
    expect(serializeColorSystemRecipeV1(infeasible)).toBe(retained);
    expect(infeasible.selection).toEqual(recipe.selection);
  });

  it('leaves saved data intact when a replay hook fails', async () => {
    const { recipe } = await fixture();
    const before = serializeColorSystemRecipeV1(recipe);
    await expect(
      replayColorSystemRecipeV1(recipe, {
        isCancelled: () => false,
        yield: async () => {
          throw new Error('host unavailable');
        },
      })
    ).rejects.toThrow('host unavailable');
    expect(serializeColorSystemRecipeV1(recipe)).toBe(before);
  });

  it('detaches both inputs and outputs and validates before the first replay hook', async () => {
    const { recipe } = await fixture();
    const parsed = parseColorSystemRecipeV1(recipe),
      before = serializeColorSystemRecipeV1(recipe);
    Object.assign(parsed.source.model.colors[0], { label: 'returned mutation' });
    expect(serializeColorSystemRecipeV1(recipe)).toBe(before);
    const original = copy(recipe);
    const running = replayColorSystemRecipeV1(recipe, runtime);
    recipe.label = 'caller changed after invocation';
    recipe.direction.composition.groups[0].options[0].assignments[0].colorId = 'missing-color';
    const replay = await running;
    expect(replay.status).toBe('matched');
    expect(replay.recipeHash).toBe((await replayColorSystemRecipeV1(original, runtime)).recipeHash);
    Object.assign(replay.execution.candidates[0].proposal.workingModel.colors[0], {
      label: 'result mutation',
    });
    expect((await replayColorSystemRecipeV1(original, runtime)).status).toBe('matched');
    const getter = vi.fn(() => original.source),
      hostile = { ...original };
    Object.defineProperty(hostile, 'source', { enumerable: true, get: getter });
    const hooks = { isCancelled: vi.fn(() => false), yield: vi.fn(async () => {}) };
    await expect(replayColorSystemRecipeV1(hostile, hooks)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(hooks.isCancelled).not.toHaveBeenCalled();
    expect(hooks.yield).not.toHaveBeenCalled();
  });

  it.each(['sessionId', 'writeAuthorization', 'createAuthorizationHash', 'journal', 'capability'])(
    'rejects persisted %s at every recipe/intent boundary',
    async field => {
      const { recipe } = await fixture();
      expect(() => parseColorSystemRecipeV1({ ...recipe, [field]: 'forbidden' })).toThrow();
      expect(() =>
        parseColorSystemRecipeV1({ ...recipe, source: { ...recipe.source, [field]: 'forbidden' } })
      ).toThrow();
      expect(() =>
        parseColorSystemRecipeV1({
          ...recipe,
          selection: { ...recipe.selection, [field]: 'forbidden' },
        })
      ).toThrow();
      const nested = copy(recipe);
      if (nested.direction.generation.kind !== 'apply') throw new Error('Expected apply.');
      Object.assign(nested.direction.generation.proposal, { [field]: 'forbidden' });
      expect(() => parseColorSystemRecipeV1(nested)).toThrow();
    }
  );
});
