import { describe, expect, it, vi } from 'vitest';
import {
  inspectColorSystemAuthoringRefinementV1,
  discoverColorSystemAuthoringCatalogV1,
  selectColorSystemAuthoringCatalogV1,
  editColorSystemAuthoringRoleBindingV1,
} from '../colorSystemAuthoringRefinementV1';
import * as construction from '../colorSystemConstructionProposalV1';
import { buildColorSystemApplicationRequirementsV1 } from '../colorSystemApplicationRequirementsV1';
import { COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION } from '../colorSystemModelInteractionsV1';
import {
  executeColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringDirectionV1,
} from '../colorSystemAuthoringExecutionV1';
import { parseColorSystemRecipeV1, serializeColorSystemRecipeV1 } from '../colorSystemRecipeV1';
import { buildColorSystemOverlayProposalV1 } from '../colorSystemOverlayProposalV1';
import {
  buildColorSystemDesignContentV1,
  buildColorSystemDesignLockV1,
  recheckColorSystemDesignLockV1,
} from '../colorSystemDesignContentV1';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import { serializeColorSystemInertJsonV1 } from '../colorSystemInertJsonV1';
import { syntheticColorSystemAuthoringRefinementFixtureV1 as fixture } from './fixtures/colorSystemAuthoringRefinementV1Fixture';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const runtime = { isCancelled: () => false, yield: async () => {} };

async function discover(
  f: Awaited<ReturnType<typeof fixture>>,
  provider: 'werner' | 'wada' | 'radix' = 'werner'
) {
  const request = {
    recipeHash: inspectColorSystemAuthoringRefinementV1(f.recipe).recipeHash,
    fragmentId: 'accent',
    provider,
    ...(provider === 'radix'
      ? {
          radix: {
            category: 'accent',
            modes: [
              { modeId: 'Day', scheme: 'light' },
              { modeId: 'Night', scheme: 'dark' },
            ],
          },
        }
      : {}),
  };
  const result = await discoverColorSystemAuthoringCatalogV1(f.recipe, request, runtime);
  if (result.status !== 'ready') throw new Error('Discovery cancelled unexpectedly.');
  const choice = result.candidates.find(item => item.candidate.id !== f.binding.candidateId)!;
  const selection = {
    ...request,
    discoveryHash: result.discoveryHash,
    candidateId: choice.candidate.id,
    candidateHash: choice.candidate.candidateHash,
    mappings: [
      { kind: 'color' as const, fromId: f.member.colorId, toId: choice.binding.members[0].colorId },
      { kind: 'family' as const, fromId: f.binding.familyId, toId: choice.binding.familyId },
    ],
  };
  return { result, request, choice, selection };
}

async function reviewAccent(
  prior: Awaited<ReturnType<typeof fixture>>['recipe'],
  input: ColorSystemAuthoringDirectionV1
) {
  const direction = structuredClone(input) as Mutable<ColorSystemAuthoringDirectionV1>;
  if (direction.generation.kind !== 'overlay') throw new Error('Expected overlay.');
  const draft = await buildColorSystemOverlayProposalV1(
    prior.source.model,
    direction.generation.proposal,
    runtime
  );
  expect(draft.proposal!.pendingRuleIds).toEqual(['rule:accent']);
  direction.generation.proposal.review = {
    reviewedProposalHash: draft.proposal!.proposalHash,
    decisions: [
      {
        ruleId: 'rule:accent',
        status: 'accepted',
        actor: { kind: 'user', ref: 'synthetic:accent-editor' },
        authorityRef: 'synthetic:explicit-accent-review',
        decisionRef: draft.proposal!.proposalHash,
      },
    ],
  };
  const result = await executeColorSystemAuthoringDirectionV1(
    prior.source.model,
    direction,
    runtime
  );
  expect(result.status).toBe('ready');
  const selected = result.candidates[0],
    model = selected.proposal.workingModel,
    applications = selected.applications.applications.map(item => item.application);
  return parseColorSystemRecipeV1({
    ...prior,
    direction,
    selection: {
      model,
      applications,
      contentHash: buildColorSystemDesignContentV1(model, applications).contentHash,
      executionReceiptHash: result.receipt.receiptHash,
    },
  });
}

describe('explicit original-source recipe refinement commands', () => {
  it('removes an inherited provisional policy when generation changes and records its invalidation', async () => {
    const f = await fixture();
    if (f.recipe.direction.generation.kind !== 'overlay') throw new Error('Expected overlay');
    // Stale declarations remain readable, but cannot authorize this new refinement.
    const recipe = parseColorSystemRecipeV1({
      ...f.recipe,
      direction: {
        ...f.recipe.direction,
        provisionalRuleReview: {
          version: 'teul.provisional-source-rule-review.v1',
          sourceModelHash: hash('old source'),
          generationRequestHash: hash(f.recipe.direction.generation),
          briefContractHash: hash(f.recipe.direction.generation.proposal.brief),
          decisionScope: 'whole-source-predicates',
          contextIds: ['interface'],
          modeIds: ['Day', 'Night'],
          ruleIds: ['old-source-rule'],
          actor: { kind: 'agent', ref: 'prior-reviewer' },
          authorityRef: 'synthetic:old-policy',
          decisionRef: 'synthetic:prior-generation',
        },
      },
    });
    const result = editColorSystemAuthoringRoleBindingV1(recipe, {
      recipeHash: inspectColorSystemAuthoringRefinementV1(recipe).recipeHash,
      fragmentId: 'policy',
      ruleId: 'rule:control',
      contextIds: ['interface'],
      modeIds: ['Day'],
      members: [{ kind: 'scale', id: 'warm-scale' }],
    });
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed') throw new Error('Expected refinement');
    expect(result.direction.provisionalRuleReview).toBeUndefined();
    expect(result.changedPaths).toContain('provisionalRuleReview');
    expect(result.pendingRuleIds).toContain('rule:control');
    expect(recipe.direction.provisionalRuleReview).toBeDefined();
  });
  it('discovers actual providers and switches one accent while preserving control values, input and accepted decision', async () => {
    const f = await fixture(),
      before = serializeColorSystemRecipeV1(f.recipe),
      found = await discover(f, 'wada');
    expect(found.result.candidates.length).toBeGreaterThan(1);
    expect(found.result.candidates.every(item => item.candidate.provider === 'wada')).toBe(true);
    expect(found.choice.binding.members.length).toBeGreaterThan(1);
    const spy = vi.spyOn(construction, 'buildColorSystemConstructionProposalV1');
    const selected = await selectColorSystemAuthoringCatalogV1(f.recipe, found.selection, runtime);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(selected.status).toBe('proposed');
    if (selected.status !== 'proposed' || selected.direction.generation.kind !== 'overlay')
      throw new Error('Expected proposed direction.');
    const old = f.recipe.direction.generation;
    if (old.kind !== 'overlay') throw new Error('Expected overlay.');
    expect(
      serializeColorSystemInertJsonV1(selected.direction.generation.proposal.fragments[0])
    ).toBe(serializeColorSystemInertJsonV1(old.proposal.fragments[0]));
    expect(
      serializeColorSystemInertJsonV1(selected.direction.generation.proposal.fragments[2])
    ).toBe(serializeColorSystemInertJsonV1(old.proposal.fragments[2]));
    expect(selected.direction.generation.proposal.brief).toEqual(old.proposal.brief);
    expect(selected.direction.generation.proposal.review).toBeUndefined();
    const priorAdoption = f.recipe.selection!.model.adoptions.find(
      item => item.ruleId === 'rule:control'
    )!;
    expect(selected.direction.generation.proposal.retainedAdoptions).toContainEqual(priorAdoption);
    const result = await executeColorSystemAuthoringDirectionV1(
      f.source,
      selected.direction,
      runtime
    );
    expect(result.status).toBe('ready');
    expect(result.candidates[0].proposal.workingModel.adoptions).toContainEqual(priorAdoption);
    const priorScale = f.recipe.selection!.model.scales.find(item => item.id === 'blue-scale')!;
    expect(
      result.candidates[0].proposal.workingModel.scales.find(item => item.id === 'blue-scale')
    ).toEqual(priorScale);
    for (const id of priorScale.modes.flatMap(mode => mode.anchors.map(anchor => anchor.colorId)))
      expect(
        result.candidates[0].proposal.workingModel.colors.find(item => item.id === id)
      ).toEqual(f.recipe.selection!.model.colors.find(item => item.id === id));
    expect(
      result.candidates[0].applications.applications.every(
        app =>
          app.application.uses.find(use => use.id === 'accent')?.colorId ===
          found.choice.binding.members[0].colorId
      )
    ).toBe(true);
    expect(serializeColorSystemRecipeV1(f.recipe)).toBe(before);
  });

  it('reports precise unresolved paths instead of mapping members by their order', async () => {
    const f = await fixture(),
      found = await discover(f);
    const result = await selectColorSystemAuthoringCatalogV1(
      f.recipe,
      { ...found.selection, mappings: [] },
      runtime
    );
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') throw new Error('Expected scoped references.');
    expect(result.direction).toBeNull();
    expect(
      result.unresolved.some(
        ref => ref.path === 'composition.groups[0].options[0].assignments[2].colorId'
      )
    ).toBe(true);
    expect(
      result.unresolved.some(ref => ref.kind === 'family' && ref.path === 'units[1].familyId')
    ).toBe(true);
    expect(result.unresolved.every(ref => ref.reason.includes('explicit'))).toBe(true);
  });

  it('retains identical candidate identities without requiring replacement mappings', async () => {
    const f = await fixture(),
      found = await discover(f),
      current = found.result.candidates.find(item => item.candidate.id === f.binding.candidateId)!;
    expect(current).toBeDefined();
    const result = await selectColorSystemAuthoringCatalogV1(
      f.recipe,
      {
        ...found.selection,
        candidateId: current.candidate.id,
        candidateHash: current.candidate.candidateHash,
        mappings: [],
      },
      runtime
    );
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed') throw new Error('Expected unchanged identities.');
    expect(result.direction.composition.groups).toEqual(f.recipe.direction.composition.groups);
    expect(result.direction.units).toEqual(f.recipe.direction.units);
    expect(result.pendingRuleIds).toEqual([]);
  });

  it('retains exact existing rejected decisions without turning them into new acceptances', async () => {
    const f = await fixture('werner', false, true),
      found = await discover(f);
    const original = f.recipe.selection!.model.adoptions.find(
      item => item.ruleId === 'rule:rejected'
    )!;
    expect(original.status).toBe('rejected');
    const changed = await selectColorSystemAuthoringCatalogV1(f.recipe, found.selection, runtime);
    if (changed.status !== 'proposed' || changed.direction.generation.kind !== 'overlay')
      throw new Error('Expected proposed direction.');
    expect(changed.direction.generation.proposal.retainedAdoptions).toContainEqual(original);
    const replay = await executeColorSystemAuthoringDirectionV1(
      f.source,
      changed.direction,
      runtime
    );
    expect(replay.status).toBe('ready');
    expect(replay.candidates[0].proposal.workingModel.adoptions).toContainEqual(original);
  });

  it('preserves a locked product family and sibling accepted/rejected decisions while editing another context accent twice', async () => {
    const f = await fixture('werner', true, true, 'communications'),
      initial = f.recipe.selection!,
      lock = buildColorSystemDesignLockV1(
        buildColorSystemDesignContentV1(initial.model, initial.applications),
        { kind: 'family', id: 'pigments' }
      );
    const locked = { ...f, recipe: parseColorSystemRecipeV1({ ...f.recipe, locks: [lock] }) },
      found = await discover(locked, 'wada');
    expect(found.result.query.contextId).toBe('communications');
    expect(initial.applications.map(app => `${app.contextId}:${app.modeId}`).sort()).toEqual([
      'communications:Day',
      'communications:Night',
      'interface:Day',
      'interface:Night',
    ]);
    const switched = await selectColorSystemAuthoringCatalogV1(
      locked.recipe,
      found.selection,
      runtime
    );
    if (switched.status !== 'proposed' || switched.direction.generation.kind !== 'overlay')
      throw new Error('Expected catalog refinement.');
    expect(switched.pendingRuleIds).toEqual(['rule:accent']);
    const originalGeneration = f.recipe.direction.generation;
    if (originalGeneration.kind !== 'overlay') throw new Error('Expected overlay.');
    const originalPolicy = originalGeneration.proposal.fragments.find(
        item => item.id === 'policy'
      )!,
      retainedPolicy = switched.direction.generation.proposal.fragments.find(
        item => item.id === 'policy'
      )!;
    if (originalPolicy.kind !== 'rules' || retainedPolicy.kind !== 'rules')
      throw new Error('Expected rules.');
    expect(retainedPolicy.proposal.id).toBe(originalPolicy.proposal.id);
    expect(retainedPolicy.proposal.derivation).toEqual(originalPolicy.proposal.derivation);
    expect(retainedPolicy.proposal.rules.map(rule => rule.id)).toEqual([
      'rule:control',
      'rule:rejected',
    ]);
    expect(switched.direction.generation.proposal.fragments).toHaveLength(4);
    const afterCatalog = await reviewAccent(locked.recipe, switched.direction);
    const inspection = inspectColorSystemAuthoringRefinementV1(afterCatalog),
      accent = inspection.editableRoleBindings.find(item => item.rule.id === 'rule:accent')!;
    const edited = editColorSystemAuthoringRoleBindingV1(afterCatalog, {
      recipeHash: inspection.recipeHash,
      fragmentId: accent.fragmentId,
      ruleId: accent.rule.id,
      contextIds: ['communications'],
      modeIds: ['Day'],
      members: accent.rule.operands.members,
    });
    if (edited.status !== 'proposed' || edited.direction.generation.kind !== 'overlay')
      throw new Error('Expected role refinement.');
    expect(edited.direction.generation.proposal.fragments).toHaveLength(4);
    const afterRole = await reviewAccent(afterCatalog, edited.direction);
    for (const recipe of [afterCatalog, afterRole]) {
      const selection = recipe.selection!,
        controlIds = initial.model.families.find(family => family.id === 'pigments')!.colorIds;
      expect(
        serializeColorSystemInertJsonV1(
          selection.model.adoptions.filter(item => item.ruleId !== 'rule:accent')
        )
      ).toBe(
        serializeColorSystemInertJsonV1(
          initial.model.adoptions.filter(item => item.ruleId !== 'rule:accent')
        )
      );
      expect(selection.model.colors.filter(color => controlIds.includes(color.id))).toEqual(
        initial.model.colors.filter(color => controlIds.includes(color.id))
      );
      expect(recipe.locks).toEqual([lock]);
      expect(
        recheckColorSystemDesignLockV1(
          lock,
          buildColorSystemDesignContentV1(selection.model, selection.applications)
        ).status
      ).toBe('intact');
      expect(recipe.source).toEqual(f.recipe.source);
    }
    expect(
      afterRole.selection!.model.rules.find(rule => rule.id === 'rule:accent')!.modeIds
    ).toEqual(['Day']);
  });

  it('permits an unreferenced fragment switch and rejects a lost Radix scale dependency', async () => {
    const original = await fixture(),
      draft = structuredClone(original.recipe) as Mutable<typeof original.recipe>;
    draft.direction.units = draft.direction.units.filter(unit => unit.id !== 'accent');
    for (const group of draft.direction.composition.groups)
      for (const option of group.options)
        for (const assignment of option.assignments)
          if (assignment.colorId === original.member.colorId) assignment.colorId = 'warm';
    // A readable pending intent need not qualify; full execution still requires coverage of every generated unit.
    const unreferenced = { ...original, recipe: parseColorSystemRecipeV1(draft) },
      a = await discover(unreferenced, 'radix');
    expect(a.result.references).toEqual([]);
    expect(
      (
        await selectColorSystemAuthoringCatalogV1(
          unreferenced.recipe,
          { ...a.selection, mappings: [] },
          runtime
        )
      ).status
    ).toBe('proposed');
    const radix = await fixture('radix'),
      b = await discover(radix, 'werner');
    const blocked = await selectColorSystemAuthoringCatalogV1(radix.recipe, b.selection, runtime);
    expect(blocked.status).toBe('blocked');
    if (blocked.status !== 'blocked') throw new Error('Expected a missing scale.');
    expect(blocked.unresolved).toContainEqual(
      expect.objectContaining({
        kind: 'scale',
        id: radix.binding.scaleId,
        path: 'units[1].scaleId',
      })
    );
  });

  it('maps only typed references and permits deliberately retaining an original-source color', async () => {
    const f = await fixture(),
      found = await discover(f);
    const mapped = {
      ...found.selection,
      mappings: found.selection.mappings.map(item =>
        item.kind === 'color' ? { ...item, toId: 'warm' } : item
      ),
    };
    const result = await selectColorSystemAuthoringCatalogV1(f.recipe, mapped, runtime);
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed') throw new Error('Expected intent.');
    expect(result.direction.composition.groups[0].options[0].assignments[2].colorId).toBe('warm');
    expect(result.direction.units[1].anchors.every(anchor => anchor.colorId === 'warm')).toBe(true);
    // This intentionally inconsistent family/anchor request is left to the final model/application gate.
    await expect(
      executeColorSystemAuthoringDirectionV1(f.source, result.direction, runtime)
    ).rejects.toThrow(/anchor must be/);
  });

  it('edits only an existing proposed role binding and leaves it pending fresh review', async () => {
    const f = await fixture(),
      inspection = inspectColorSystemAuthoringRefinementV1(f.recipe);
    expect(inspection.editableRoleBindings.map(item => item.rule.id)).toEqual(['rule:control']);
    expect(inspection.selectorChoices).toContainEqual(
      expect.objectContaining({ kind: 'family', id: f.binding.familyId, inOriginalSource: false })
    );
    const result = editColorSystemAuthoringRoleBindingV1(f.recipe, {
      recipeHash: inspection.recipeHash,
      fragmentId: 'policy',
      ruleId: 'rule:control',
      contextIds: ['interface'],
      modeIds: ['Day'],
      members: [{ kind: 'scale', id: 'warm-scale' }],
    });
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed' || result.direction.generation.kind !== 'overlay')
      throw new Error('Expected edit.');
    expect(result.pendingRuleIds).toEqual(['rule:control']);
    expect(result.direction.generation.proposal.retainedAdoptions).toEqual([]);
    const fragment = result.direction.generation.proposal.fragments[2];
    if (fragment.kind !== 'rules') throw new Error('Expected rule fragment.');
    expect(fragment.proposal.rules[0]).toMatchObject({
      id: 'rule:control',
      force: 'requirement',
      modeIds: ['Day'],
      operands: { role: 'control', members: [{ kind: 'scale', id: 'warm-scale' }] },
    });
    const executed = await executeColorSystemAuthoringDirectionV1(
      f.source,
      result.direction,
      runtime
    );
    expect(executed.candidates).toEqual([]);
    if (executed.generation?.kind !== 'overlay') throw new Error('Expected replay.');
    expect(executed.generation.result.proposal?.pendingRuleIds).toContain('rule:control');
  });

  it('rejects broadened rule scopes, missing selectors and changing source-exception replacements', async () => {
    const f = await fixture(),
      recipeHash = inspectColorSystemAuthoringRefinementV1(f.recipe).recipeHash;
    const edit = {
      recipeHash,
      fragmentId: 'policy',
      ruleId: 'rule:control',
      contextIds: ['interface'],
      modeIds: ['Day'],
      members: [{ kind: 'color', id: 'ink' }],
    };
    expect(() =>
      editColorSystemAuthoringRoleBindingV1(f.recipe, { ...edit, contextIds: ['communications'] })
    ).toThrow(/scope exceeds/);
    expect(() =>
      editColorSystemAuthoringRoleBindingV1(f.recipe, { ...edit, modeIds: ['Unknown'] })
    ).toThrow(/scope exceeds/);
    expect(() =>
      editColorSystemAuthoringRoleBindingV1(f.recipe, {
        ...edit,
        members: [{ kind: 'family', id: 'missing' }],
      })
    ).toThrow(/existing source or retained/);
    expect(() =>
      editColorSystemAuthoringRoleBindingV1(f.recipe, { ...edit, ruleId: 'missing' })
    ).toThrow(/proposal-owned/);
    const copy = structuredClone(f.recipe) as Mutable<typeof f.recipe>;
    if (copy.direction.generation.kind !== 'overlay') throw new Error('Expected overlay.');
    const rule = copy.direction.generation.proposal.fragments[2];
    if (rule.kind !== 'rules') throw new Error('Expected rules.');
    rule.proposal.exceptions.push({
      sourceRuleId: 'source:declared',
      replacementRuleId: 'rule:control',
      reason: 'Declared source exception',
    });
    const changedHash = inspectColorSystemAuthoringRefinementV1(copy).recipeHash;
    expect(() =>
      editColorSystemAuthoringRoleBindingV1(copy, { ...edit, recipeHash: changedHash })
    ).toThrow(/source exception/);
  });

  it('fails explicitly when preserving sibling provenance requires a ninth fragment', async () => {
    const f = await fixture('werner', true),
      copy = structuredClone(f.recipe) as Mutable<typeof f.recipe>;
    if (copy.direction.generation.kind !== 'overlay') throw new Error('Expected overlay.');
    const policy = copy.direction.generation.proposal.fragments[2];
    if (policy.kind !== 'rules') throw new Error('Expected rules.');
    // Additional empty declarations exercise the existing fragment capacity, without new colors or reviews.
    for (let i = 0; i < 5; i++)
      copy.direction.generation.proposal.fragments.push({
        id: `empty:${i}`,
        kind: 'rules',
        proposal: { ...policy.proposal, id: `empty:${i}`, rules: [], exceptions: [] },
      });
    const before = serializeColorSystemRecipeV1(copy),
      inspection = inspectColorSystemAuthoringRefinementV1(copy),
      accent = inspection.editableRoleBindings.find(item => item.rule.id === 'rule:accent')!;
    expect(() =>
      editColorSystemAuthoringRoleBindingV1(copy, {
        recipeHash: inspection.recipeHash,
        fragmentId: accent.fragmentId,
        ruleId: accent.rule.id,
        contextIds: accent.rule.contextIds,
        modeIds: ['Day'],
        members: accent.rule.operands.members,
      })
    ).toThrow(/eight-fragment limit/);
    expect(serializeColorSystemRecipeV1(copy)).toBe(before);
  });

  it('rejects stale exact recipe identity, source and value hashes, missing candidates and tampered display choices', async () => {
    const f = await fixture(),
      found = await discover(f);
    await expect(
      selectColorSystemAuthoringCatalogV1(
        f.recipe,
        { ...found.selection, recipeHash: hash('stale') },
        runtime
      )
    ).rejects.toThrow(/Recipe hash changed/);
    const renamed = { ...f.recipe, label: 'Changed retained metadata' };
    await expect(
      selectColorSystemAuthoringCatalogV1(renamed, found.selection, runtime)
    ).rejects.toThrow(/Recipe hash changed/);
    const reattributed = structuredClone(f.recipe) as Mutable<typeof f.recipe>;
    if (reattributed.direction.generation.kind !== 'overlay') throw new Error('Expected overlay.');
    reattributed.direction.generation.proposal.review!.decisions[0].decisionRef =
      'synthetic:another-recorded-review';
    expect(reattributed.selection!.contentHash).toBe(f.recipe.selection!.contentHash);
    await expect(
      selectColorSystemAuthoringCatalogV1(reattributed, found.selection, runtime)
    ).rejects.toThrow(/Recipe hash changed/);
    for (const changed of [
      { discoveryHash: hash('tampered') },
      { candidateId: 'missing' },
      { candidateHash: hash('forged') },
    ])
      await expect(
        selectColorSystemAuthoringCatalogV1(f.recipe, { ...found.selection, ...changed }, runtime)
      ).rejects.toThrow();
    found.choice.candidate.id = 'mutable-display';
    expect(
      (await selectColorSystemAuthoringCatalogV1(f.recipe, found.selection, runtime)).status
    ).toBe('proposed');
    const bad = structuredClone(f.recipe) as Mutable<typeof f.recipe>;
    if (bad.direction.generation.kind !== 'overlay') throw new Error('Expected overlay.');
    bad.direction.generation.proposal.sourceModelHash = hash('other source');
    expect(() => inspectColorSystemAuthoringRefinementV1(bad)).toThrow(/original source/);
    const query = structuredClone(f.recipe) as Mutable<typeof f.recipe>;
    if (query.direction.generation.kind !== 'overlay') throw new Error('Expected overlay.');
    const fragment = query.direction.generation.proposal.fragments[1];
    if (fragment.kind !== 'catalog') throw new Error('Expected catalog.');
    fragment.query.anchorRefs[0].valueHash = hash('wrong exact value');
    const request = {
      ...found.request,
      recipeHash: inspectColorSystemAuthoringRefinementV1(query).recipeHash,
    };
    await expect(discoverColorSystemAuthoringCatalogV1(query, request, runtime)).rejects.toThrow(
      /value hash is stale/
    );
  });

  it('rejects missing selections, stale concrete bindings, wrong providers and inert-input violations', async () => {
    const f = await fixture(),
      found = await discover(f);
    expect(() => inspectColorSystemAuthoringRefinementV1({ ...f.recipe, selection: null })).toThrow(
      /Select a complete/
    );
    const bad = structuredClone(f.recipe) as Mutable<typeof f.recipe>;
    bad.direction.composition = { ...bad.direction.composition, modelHash: hash('wrong') } as never;
    delete (bad.direction.composition as unknown as Record<string, unknown>).modelBinding;
    expect(() => inspectColorSystemAuthoringRefinementV1(bad)).toThrow(/Composition model hash/);
    await expect(
      discoverColorSystemAuthoringCatalogV1(
        f.recipe,
        { ...found.request, provider: 'radix' },
        runtime
      )
    ).rejects.toThrow(/explicit/);
    await expect(
      discoverColorSystemAuthoringCatalogV1(
        f.recipe,
        { ...found.request, provider: 'unknown' },
        runtime
      )
    ).rejects.toThrow(/supported/);
    let reads = 0;
    const unsafe = { ...found.request };
    Object.defineProperty(unsafe, 'fragmentId', {
      enumerable: true,
      get() {
        reads++;
        return 'accent';
      },
    });
    await expect(discoverColorSystemAuthoringCatalogV1(f.recipe, unsafe, runtime)).rejects.toThrow(
      /accessor/
    );
    expect(reads).toBe(0);
    await expect(
      selectColorSystemAuthoringCatalogV1(
        f.recipe,
        { ...found.selection, mappings: new Array(2) },
        runtime
      )
    ).rejects.toThrow(/dense/);
    await expect(
      selectColorSystemAuthoringCatalogV1(
        f.recipe,
        {
          ...found.selection,
          mappings: [{ kind: 'color', fromId: f.member.colorId, toId: 'missing' }],
        },
        runtime
      )
    ).rejects.toThrow(/Mapping target/);
  });

  it('returns no partial catalog choices or direction after cancellation and detaches before hooks', async () => {
    const f = await fixture(),
      found = await discover(f),
      before = serializeColorSystemRecipeV1(f.recipe);
    let cancelled = false;
    const stopped = await discoverColorSystemAuthoringCatalogV1(f.recipe, found.request, {
      isCancelled: () => cancelled,
      yield: async () => {
        cancelled = true;
      },
    });
    expect(stopped).toMatchObject({ status: 'cancelled', candidates: [] });
    expect(stopped).not.toHaveProperty('current');
    expect(
      await selectColorSystemAuthoringCatalogV1(f.recipe, found.selection, {
        isCancelled: () => true,
        yield: async () => {},
      })
    ).toMatchObject({ status: 'cancelled', direction: null });
    const input = structuredClone(found.request);
    const stable = await discoverColorSystemAuthoringCatalogV1(f.recipe, input, {
      isCancelled: () => false,
      yield: async () => {
        input.provider = 'wada';
      },
    });
    expect(stable.status).toBe('ready');
    if (stable.status === 'ready')
      expect(stable.candidates.every(item => item.candidate.provider === 'werner')).toBe(true);
    expect(serializeColorSystemRecipeV1(f.recipe)).toBe(before);
  });

  it('maps locks, interaction operands and proposed selectors, but blocks changes to a construction declaration', async () => {
    const f = await fixture('radix', true),
      copy = structuredClone(f.recipe) as Mutable<typeof f.recipe>;
    copy.direction.requirements.locks = [
      { applicationId: 'app:Day', useId: 'accent', colorId: f.member.colorId },
    ];
    copy.direction.composition.requirementsHash = hash(
      buildColorSystemApplicationRequirementsV1(copy.direction.requirements)
    );
    copy.direction.interactionGroups = [
      {
        id: 'declared-state-group',
        request: {
          version: COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION,
          modelBinding: 'generated-model',
          contextId: 'interface',
          modeId: 'Day',
          role: 'selected',
          scales: [
            {
              scaleId: f.binding.scaleId!,
              slotIds: ['step:9', 'step:10', 'step:11'],
              preferredSlotIds: { rest: 'step:9', hover: 'step:10', pressed: 'step:11' },
              preference: 0,
              stateOrder: 'ascending',
            },
          ],
          surfaceColorIds: [f.member.colorId],
          onForegroundColorIds: ['paper'],
        },
        bindings: [{ applicationId: 'app:Day', useId: 'accent', selection: 'rest' }],
      },
    ];
    const enhanced = { ...f, recipe: parseColorSystemRecipeV1(copy) },
      found = await discover(enhanced, 'radix');
    const selected = await selectColorSystemAuthoringCatalogV1(
      enhanced.recipe,
      {
        ...found.selection,
        mappings: [
          ...found.selection.mappings,
          { kind: 'scale', fromId: f.binding.scaleId!, toId: found.choice.binding.scaleId! },
        ],
      },
      runtime
    );
    expect(selected.status).toBe('proposed');
    if (selected.status !== 'proposed') throw new Error('Expected mapped direction.');
    expect(selected.direction.requirements.locks![0].colorId).toBe(
      found.choice.binding.members[0].colorId
    );
    expect(selected.direction.interactionGroups![0].request.scales[0].scaleId).toBe(
      found.choice.binding.scaleId
    );
    expect(selected.direction.interactionGroups![0].request.surfaceColorIds).toEqual([
      found.choice.binding.members[0].colorId,
    ]);
    expect(selected.pendingRuleIds).toContain('rule:accent');
    if (selected.direction.generation.kind !== 'overlay') throw new Error('Expected overlay.');
    const mappedRules = selected.direction.generation.proposal.fragments.find(
      fragment =>
        fragment.kind === 'rules' && fragment.proposal.rules.some(rule => rule.id === 'rule:accent')
    )!;
    if (mappedRules.kind !== 'rules') throw new Error('Expected rules.');
    expect(mappedRules.proposal.rules.find(rule => rule.id === 'rule:accent')).toMatchObject({
      operands: { members: [{ kind: 'family', id: found.choice.binding.familyId }] },
    });
    if (copy.direction.generation.kind !== 'overlay') throw new Error('Expected overlay.');
    const constructionFragment = copy.direction.generation.proposal.fragments[0];
    if (constructionFragment.kind !== 'construction') throw new Error('Expected construction.');
    constructionFragment.brief.scales[0].scaleId = f.binding.scaleId!;
    const dependent = { ...f, recipe: parseColorSystemRecipeV1(copy) },
      choices = await discover(dependent, 'radix');
    const blocked = await selectColorSystemAuthoringCatalogV1(
      dependent.recipe,
      {
        ...choices.selection,
        mappings: [
          ...choices.selection.mappings,
          { kind: 'scale', fromId: f.binding.scaleId!, toId: choices.choice.binding.scaleId! },
        ],
      },
      runtime
    );
    expect(blocked.status).toBe('blocked');
    if (blocked.status === 'blocked')
      expect(blocked.unresolved).toContainEqual(
        expect.objectContaining({
          editable: false,
          path: 'generation.proposal.fragments[0].brief.scales[0].scaleId',
        })
      );
  });
});
