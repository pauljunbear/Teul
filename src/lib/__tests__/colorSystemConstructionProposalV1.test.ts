import { describe, expect, it, vi } from 'vitest';
import {
  buildColorSystemConstructionProposalV1,
  COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
  type ColorSystemConstructionProposalIntentV1,
} from '../colorSystemConstructionProposalV1';
import {
  COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
  type ColorSystemConstructionBriefV1,
} from '../colorSystemConstructionV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../colorSystemModelV1';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';
import {
  buildColorSystemProposalV1,
  COLOR_SYSTEM_PROPOSAL_V1_VERSION,
  type ColorSystemProposalRequestV1,
} from '../colorSystemProposalV1';

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};
const execution = { isCancelled: () => false, yield: async () => {} };
const exactHash = (value: unknown) => deterministicContentHash(canonicalJson(value));

function fixture() {
  const input = JSON.parse(
    JSON.stringify(syntheticColorSystemModelInputV1())
  ) as Mutable<ColorSystemModelInputV1>;
  input.adoptions = [];
  for (const scale of input.scales) {
    const count = scale.id === 'blue-scale' ? 4 : 3;
    scale.slots = Array.from({ length: count * 2 - 1 }, (_, index) => ({
      id: index % 2 ? `gap:${(index + 1) / 2}` : `pin:${index / 2}`,
      position: index,
    }));
    scale.modes.forEach(mode => {
      mode.anchors = mode.anchors.map((anchor, index) => ({ ...anchor, slotId: `pin:${index}` }));
    });
  }
  const model = buildColorSystemModelV1({
    ...input,
    adoptions: buildColorSystemRuleAdoptionsV1(
      input,
      input.rules.map(rule => ({
        ruleId: rule.id,
        status: 'accepted',
        actor: { kind: 'agent', ref: 'fixture-author' },
        authorityRef: 'synthetic:review',
        decisionRef: `initial:${rule.id}`,
      }))
    ),
  });
  const brief: Mutable<ColorSystemConstructionBriefV1> = {
    schemaVersion: COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
    modelHash: model.modelHash,
    contextId: 'communications',
    changeMode: 'extend',
    decision: {
      actor: { kind: 'agent', ref: 'fixture-builder' },
      authorityRef: 'synthetic:construction',
      decisionRef: 'synthetic:fill-review',
    },
    scales: model.scales.flatMap(scale =>
      scale.modes.map(mode => ({
        scaleId: scale.id,
        modeId: mode.modeId,
        requiredSlotIds: scale.slots.map(slot => slot.id),
        fillSlotIds: scale.slots.filter(slot => slot.id.startsWith('gap:')).map(slot => slot.id),
        lightnessOrder: 'none',
        endpoints: [],
      }))
    ),
  };
  const intent: Mutable<ColorSystemConstructionProposalIntentV1> = {
    version: COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
    id: 'constructed-fixture',
    sourceModelHash: model.modelHash,
    brief: {
      briefHash: deterministicContentHash('frozen synthetic extension'),
      operation: 'extend',
      contextIds: ['communications'],
      modeIds: ['Day', 'Night'],
      permissions: {
        addColors: true,
        addFamilies: false,
        addScales: false,
        addRules: false,
        editFamilyIds: ['pigments'],
        editScaleIds: model.scales.map(scale => scale.id),
        replaceRuleIds: [],
      },
    },
  };
  return { input, model, brief, intent };
}

function newScaleFixture() {
  const f = fixture();
  f.intent.brief.permissions.addFamilies = true;
  f.intent.brief.permissions.addScales = true;
  const draft: Mutable<ColorSystemProposalRequestV1> = {
    version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
    id: 'explicit-scale-structure',
    sourceModelHash: f.model.modelHash,
    brief: structuredClone(f.intent.brief),
    derivation: {
      algorithmId: 'declared-structure',
      algorithmVersion: '1',
      policyHash: exactHash('explicit source-derived scale structure'),
      inputHash: exactHash('structure-input'),
      sourceColorIds: ['blue', 'blue-deep'],
      sourceScaleIds: [],
    },
    colors: [],
    families: [
      { id: 'product-colors', label: 'Proposed product colors', colorIds: ['blue', 'blue-deep'] },
    ],
    scales: [
      {
        id: 'product-states',
        label: 'Proposed product scale',
        familyId: 'product-colors',
        slots: [0, 0.25, 1, 2, 3].map((position, index) => ({ id: `product:${index}`, position })),
        modes: ['Day', 'Night'].map(modeId => ({
          modeId,
          anchors: [
            { slotId: 'product:2', colorId: 'blue' },
            { slotId: 'product:4', colorId: 'blue-deep' },
          ],
        })),
      },
    ],
    rules: [],
    exceptions: [],
  };
  const structure = buildColorSystemProposalV1(f.model, draft);
  f.brief.modelHash = structure.workingModel.modelHash;
  f.brief.scales = draft.scales[0].modes.map(mode => ({
    scaleId: 'product-states',
    modeId: mode.modeId,
    requiredSlotIds: draft.scales[0].slots.map(slot => slot.id),
    fillSlotIds: ['product:0', 'product:1', 'product:3'],
    lightnessOrder: 'none',
    endpoints: [{ slotId: 'product:0', oklch: { l: 0.95, c: 0.02, h: 260 }, alpha: 1 }],
  }));
  return { ...f, draft, structure };
}

describe('recomputed existing-scale construction proposals', () => {
  it('constructs a separately proposed product scale without rewriting an authored source pair or scale', async () => {
    const f = newScaleFixture();
    const before = canonicalJson(f.model);
    const result = await buildColorSystemConstructionProposalV1(
      f.model,
      f.brief,
      f.intent,
      execution,
      f.draft
    );
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed') throw new Error('Expected proposal');
    expect(result.generatedBindings).toHaveLength(3);
    expect(result.construction.structureProposalHash).toBe(f.structure.proposalHash);
    expect(result.construction.constructionModelHash).toBe(f.structure.workingModel.modelHash);
    expect(result.construction.modelHash).toBe(f.model.modelHash);
    expect(result.proposal.sourceAssessmentModel.scales).toEqual(f.model.scales);
    expect(
      result.proposal.workingModel.scales.filter(scale => scale.id !== 'product-states')
    ).toEqual(f.model.scales);
    const proposedScale = result.proposal.workingModel.scales.find(
      scale => scale.id === 'product-states'
    )!;
    expect(proposedScale.slots).toEqual(f.draft.scales[0].slots);
    expect(proposedScale.modes.every(mode => mode.anchors.length === 5)).toBe(true);
    for (const sourceColor of f.model.colors)
      expect(
        result.proposal.workingModel.colors.find(color => color.id === sourceColor.id)
      ).toEqual(sourceColor);
    expect(result.proposal.workingModel.sources).toHaveLength(f.model.sources.length + 1);
    expect(
      result.proposal.workingModel.sources.some(source => source.id.includes(f.draft.id))
    ).toBe(false);
    expect(result.proposal.request.derivation.sourceScaleIds).toEqual([]);
    expect(result.proposal.request.derivation.sourceColorIds).toEqual(['blue', 'blue-deep']);
    expect(result.generatedBindings.every(binding => binding.modes.length === 2)).toBe(true);
    expect(canonicalJson(f.model)).toBe(before);
    expect(result.qualified).toBe(false);
  });

  it('requires explicit new-structure permissions and binds the exact intermediate structure', async () => {
    const f = newScaleFixture();
    const yieldHook = vi.fn(async () => {});
    await expect(
      buildColorSystemConstructionProposalV1(
        f.model,
        { ...f.brief, modelHash: f.model.modelHash },
        f.intent,
        { ...execution, yield: yieldHook },
        f.draft
      )
    ).rejects.toThrow(/different source model/);
    const denied = {
      ...f.draft,
      brief: { ...f.draft.brief, permissions: { ...f.draft.brief.permissions, addScales: false } },
    };
    await expect(
      buildColorSystemConstructionProposalV1(
        f.model,
        f.brief,
        f.intent,
        { ...execution, yield: yieldHook },
        denied
      )
    ).rejects.toThrow(/permission/);
    await expect(
      buildColorSystemConstructionProposalV1(
        f.model,
        f.brief,
        { ...f.intent, brief: { ...f.intent.brief, briefHash: exactHash('changed') } },
        { ...execution, yield: yieldHook },
        f.draft
      )
    ).rejects.toThrow(/exact brief/);
    expect(yieldHook).not.toHaveBeenCalled();
  });

  it('rejects injected numeric output, unrelated scales and review in a structure-only draft', async () => {
    const f = newScaleFixture();
    const colored = {
      ...f.draft,
      colors: [
        {
          id: 'injected',
          label: 'Injected',
          valuesByMode: { Day: f.model.colors[0].valuesByMode.Day },
        },
      ],
    };
    await expect(
      buildColorSystemConstructionProposalV1(f.model, f.brief, f.intent, execution, colored)
    ).rejects.toThrow(/only declared families/);
    const reviewed = {
      ...f.draft,
      review: { reviewedProposalHash: f.structure.proposalHash, decisions: [] },
    };
    await expect(
      buildColorSystemConstructionProposalV1(f.model, f.brief, f.intent, execution, reviewed)
    ).rejects.toThrow(/without colors, rules or review/);
    const unrelated = {
      ...f.draft,
      scales: [...f.draft.scales, { ...f.draft.scales[0], id: 'unrequested' }],
    };
    const staged = buildColorSystemProposalV1(f.model, unrelated);
    await expect(
      buildColorSystemConstructionProposalV1(
        f.model,
        { ...f.brief, modelHash: staged.workingModel.modelHash },
        f.intent,
        execution,
        unrelated
      )
    ).rejects.toThrow(/only families and scales requested/);
  });

  it('detaches structure intent before async construction and reviews only the final combined proposal', async () => {
    const f = newScaleFixture();
    const expected = await buildColorSystemConstructionProposalV1(
      f.model,
      f.brief,
      f.intent,
      execution,
      f.draft
    );
    const actual = await buildColorSystemConstructionProposalV1(
      f.model,
      f.brief,
      f.intent,
      {
        ...execution,
        yield: async () => {
          f.draft.scales[0].slots[0].position = 999;
          f.draft.families[0].colorIds.length = 0;
        },
      },
      f.draft
    );
    expect(actual).toEqual(expected);
    const clean = newScaleFixture();
    if (expected.status !== 'proposed') throw new Error('Expected proposal');
    const reviewed = await buildColorSystemConstructionProposalV1(
      clean.model,
      clean.brief,
      {
        ...clean.intent,
        review: { reviewedProposalHash: expected.proposal.proposalHash, decisions: [] },
      },
      execution,
      clean.draft
    );
    expect(reviewed.status).toBe('proposed');
    if (reviewed.status !== 'proposed') throw new Error('Expected proposal');
    expect(reviewed.proposal.reviewStatus).toBe('current');
    expect(reviewed.proposal.proposalHash).toBe(expected.proposal.proposalHash);
  });

  it('preserves four native anchors, two modes, and separate related scales while merging only generated slot values', async () => {
    const { model, brief, intent } = fixture();
    const result = await buildColorSystemConstructionProposalV1(model, brief, intent, execution);
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed' || result.construction.result.status === 'cancelled')
      throw new Error('Unexpected fixture outcome');
    expect(result.qualified).toBe(false);
    expect(result.generatedBindings).toHaveLength(5);
    expect(result.proposal.request.colors).toHaveLength(5);
    expect(result.proposal.workingModel.scales).toHaveLength(2);
    expect(result.proposal.sourceAssessmentModel.scales).toEqual(model.scales);
    expect(result.proposal.sourceAssessmentModel.families).toEqual(model.families);
    expect(result.proposal.sourceAssessmentModel.adoptions).toEqual(model.adoptions);
    expect(result.proposal.pendingRuleIds).toContain('rule:palette');
    for (const scale of model.scales) {
      const working = result.proposal.workingModel.scales.find(item => item.id === scale.id)!;
      expect(working.slots).toEqual(scale.slots);
      for (const mode of scale.modes) {
        const constructed = result.construction.result.scales.find(
          item => item.scaleId === scale.id && item.modeId === mode.modeId
        )!;
        expect(constructed.members).toHaveLength(scale.slots.length);
        for (const anchor of mode.anchors) {
          const member = constructed.members.find(item => item.slotId === anchor.slotId)!;
          expect(member.origin).toEqual({ kind: 'source', colorId: anchor.colorId });
          expect(member.value).toEqual(
            model.colors.find(color => color.id === anchor.colorId)!.valuesByMode[mode.modeId]
          );
          expect(working.modes.find(item => item.modeId === mode.modeId)!.anchors).toContainEqual(
            anchor
          );
        }
      }
    }
    for (const binding of result.generatedBindings) {
      const color = result.proposal.request.colors.find(item => item.id === binding.colorId)!;
      expect(Object.keys(color.valuesByMode).sort()).toEqual(['Day', 'Night']);
      for (const mode of binding.modes) {
        const scale = result.construction.result.scales.find(
          item => item.scaleId === binding.scaleId && item.modeId === mode.modeId
        )!;
        const member = scale.members.find(item => item.slotId === binding.slotId)!;
        expect(color.valuesByMode[mode.modeId]).toEqual(member.value);
        expect(mode.memberHash).toBe(exactHash(member));
        expect(mode.scaleResultHash).toBe(scale.resultHash);
      }
    }
    const sameNamedSlot = result.generatedBindings.filter(item => item.slotId === 'gap:1');
    expect(sameNamedSlot).toHaveLength(2);
    expect(sameNamedSlot[0].colorId).not.toBe(sameNamedSlot[1].colorId);
    expect(result.proposal.request.derivation.inputHash).toBe(result.construction.receiptHash);
    expect(result.proposal.request.derivation.sourceScaleIds).toEqual(['blue-scale', 'warm-scale']);
    expect(result.proposal.request.derivation.sourceColorIds).toContain('blue');
    const { receiptHash, ...content } = result.construction;
    expect(receiptHash).toBe(exactHash(content));
  });

  it('does not invent an unrequested mode or fill an unrequested slot', async () => {
    const { model, brief, intent } = fixture();
    brief.scales = brief.scales.filter(request => request.modeId === 'Day');
    intent.brief.modeIds = ['Day'];
    brief.scales[0].requiredSlotIds = brief.scales[0].requiredSlotIds.filter(id => id !== 'gap:3');
    brief.scales[0].fillSlotIds = brief.scales[0].fillSlotIds.filter(id => id !== 'gap:3');
    const result = await buildColorSystemConstructionProposalV1(model, brief, intent, execution);
    if (result.status !== 'proposed') throw new Error('Unexpected outcome');
    expect(
      result.proposal.request.colors.every(
        color => Object.keys(color.valuesByMode).join() === 'Day'
      )
    ).toBe(true);
    expect(result.generatedBindings.some(binding => binding.slotId === 'gap:3')).toBe(false);
    for (const scale of result.proposal.workingModel.scales) {
      expect(scale.modes.find(mode => mode.modeId === 'Night')).toEqual(
        model.scales.find(item => item.id === scale.id)!.modes.find(mode => mode.modeId === 'Night')
      );
    }
  });

  it.each(['addColors', 'family', 'scale'] as const)(
    'rejects unauthorized %s changes before executing construction',
    async missing => {
      const { model, brief, intent } = fixture();
      if (missing === 'addColors') intent.brief.permissions.addColors = false;
      if (missing === 'family') intent.brief.permissions.editFamilyIds = [];
      if (missing === 'scale') intent.brief.permissions.editScaleIds = ['blue-scale'];
      const yieldHook = vi.fn(async () => {});
      await expect(
        buildColorSystemConstructionProposalV1(model, brief, intent, {
          ...execution,
          yield: yieldHook,
        })
      ).rejects.toThrow('explicit permission');
      expect(yieldHook).not.toHaveBeenCalled();
    }
  );

  it('rejects stale source identity and mismatched operation, context or mode scope', async () => {
    const { model, brief, intent } = fixture();
    await expect(
      buildColorSystemConstructionProposalV1(
        model,
        { ...brief, modelHash: deterministicContentHash('stale') },
        intent,
        execution
      )
    ).rejects.toThrow('different source model');
    await expect(
      buildColorSystemConstructionProposalV1(
        model,
        brief,
        { ...intent, sourceModelHash: deterministicContentHash('stale') },
        execution
      )
    ).rejects.toThrow('Source model is stale');
    for (const patch of [
      { operation: 'explore' as const },
      { contextIds: ['interface'] },
      { modeIds: ['Day'] },
    ]) {
      await expect(
        buildColorSystemConstructionProposalV1(
          model,
          brief,
          { ...intent, brief: { ...intent.brief, ...patch } },
          execution
        )
      ).rejects.toThrow('scope must match construction');
    }
  });

  it('requires an exact review of the recomputed proposal and leaves changed reviews stale', async () => {
    const { model, brief, intent } = fixture();
    const first = await buildColorSystemConstructionProposalV1(model, brief, intent, execution);
    if (first.status !== 'proposed') throw new Error('Unexpected outcome');
    intent.review = {
      reviewedProposalHash: first.proposal.proposalHash,
      decisions: first.proposal.pendingRuleIds.map(ruleId => ({
        ruleId,
        status: 'accepted',
        actor: { kind: 'agent', ref: 'reviewer' },
        authorityRef: 'synthetic:review',
        decisionRef: 'new:decision',
      })),
    };
    const reviewed = await buildColorSystemConstructionProposalV1(model, brief, intent, execution);
    if (reviewed.status !== 'proposed') throw new Error('Unexpected outcome');
    expect(reviewed.proposal.proposalHash).toBe(first.proposal.proposalHash);
    expect(reviewed.proposal.reviewStatus).toBe('current');
    expect(reviewed.proposal.pendingRuleIds).toEqual([]);
    brief.scales[0].lightnessOrder = 'decreasing';
    const changed = await buildColorSystemConstructionProposalV1(model, brief, intent, execution);
    if (changed.status !== 'proposed') throw new Error('Unexpected outcome');
    expect(changed.proposal.reviewStatus).toBe('stale');
    expect(changed.proposal.pendingRuleIds).toContain('rule:palette');
    expect(
      changed.proposal.workingModel.adoptions.some(adoption => adoption.ruleId === 'rule:palette')
    ).toBe(false);
  });

  it('leaves no-fill apply source, memberships and decisions unchanged', async () => {
    const { model, brief, intent } = fixture();
    brief.changeMode = 'apply';
    intent.brief.operation = 'apply';
    for (const request of brief.scales) {
      request.requiredSlotIds = request.requiredSlotIds.filter(id => id.startsWith('pin:'));
      request.fillSlotIds = [];
    }
    const result = await buildColorSystemConstructionProposalV1(model, brief, intent, execution);
    if (result.status !== 'proposed') throw new Error('Unexpected outcome');
    expect(result.generatedBindings).toEqual([]);
    expect(result.proposal.workingModel).toEqual(model);
    expect(result.proposal.sourceAssessmentModel).toEqual(model);
    expect(result.proposal.request.colors).toEqual([]);
    expect(result.proposal.request.families).toEqual([]);
    expect(result.proposal.request.scales).toEqual([]);
  });

  it('returns incomplete source-gap and infeasible diagnostics without a proposal', async () => {
    const { input, model, brief, intent } = fixture();
    const blue = input.colors.find(color => color.id === 'blue')!;
    delete blue.valuesByMode.Day;
    blue.valueGapClaimIdsByMode = { Day: ['gap:blue'] };
    blue.claimIds.push('gap:blue');
    input.claims.push({
      id: 'gap:blue',
      sourceId: blue.sourceId,
      text: 'Missing original Day anchor authority.',
      status: 'unresolved',
      evidenceRefs: [...blue.evidenceRefs],
      contextIds: [],
      ruleIds: [],
      modeIds: ['Day'],
    });
    input.coverage[0].unresolvedClaimIds.push('gap:blue');
    const gapModel = buildColorSystemModelV1(input);
    const incomplete = await buildColorSystemConstructionProposalV1(
      gapModel,
      { ...brief, modelHash: gapModel.modelHash },
      { ...intent, sourceModelHash: gapModel.modelHash },
      execution
    );
    expect(incomplete).toMatchObject({
      status: 'incomplete',
      proposal: null,
      generatedBindings: [],
      qualified: false,
    });
    if (incomplete.construction.result.status === 'cancelled')
      throw new Error('Unexpected cancellation');
    expect(
      incomplete.construction.result.scales
        .flatMap(scale => scale.issues)
        .some(issue => issue.code === 'MISSING_SOURCE_VALUE')
    ).toBe(true);
    brief.scales[0].lightnessOrder = 'increasing';
    const infeasible = await buildColorSystemConstructionProposalV1(
      model,
      brief,
      intent,
      execution
    );
    expect(infeasible).toMatchObject({
      status: 'infeasible',
      proposal: null,
      generatedBindings: [],
      qualified: false,
    });
  });

  it('returns cancellation without exposing a partial proposal', async () => {
    const { model, brief, intent } = fixture();
    const before = await buildColorSystemConstructionProposalV1(model, brief, intent, {
      isCancelled: () => true,
      yield: async () => {},
    });
    expect(before).toMatchObject({ status: 'cancelled', proposal: null, generatedBindings: [] });
    let cancelled = false;
    const during = await buildColorSystemConstructionProposalV1(model, brief, intent, {
      isCancelled: () => cancelled,
      yield: async () => {
        cancelled = true;
      },
    });
    expect(during).toMatchObject({ status: 'cancelled', proposal: null, generatedBindings: [] });
    expect(during.construction.result.status).toBe('cancelled');
  });

  it('replays deterministically and isolates both async input mutation and returned artifact mutation', async () => {
    const { model, brief, intent } = fixture();
    const expected = await buildColorSystemConstructionProposalV1(model, brief, intent, execution);
    const incoming = JSON.parse(JSON.stringify({ model, brief, intent }));
    const changed = await buildColorSystemConstructionProposalV1(
      incoming.model,
      incoming.brief,
      incoming.intent,
      {
        ...execution,
        yield: async () => {
          incoming.model.colors[0].valuesByMode.Day.components.r = 0;
          incoming.brief.scales[0].fillSlotIds = [];
          incoming.intent.brief.permissions.addColors = false;
        },
      }
    );
    expect(changed).toEqual(expected);
    if (changed.status !== 'proposed') throw new Error('Unexpected outcome');
    Object.assign(changed.proposal, { proposalHash: deterministicContentHash('forged return') });
    Object.assign(changed.proposal.request.colors[0].valuesByMode.Day.components, { r: 0 });
    expect(await buildColorSystemConstructionProposalV1(model, brief, intent, execution)).toEqual(
      expected
    );
  });

  it('rejects caller-supplied generated data and executable nested intent before any execution hook', async () => {
    const { model, brief, intent } = fixture();
    const yieldHook = vi.fn(async () => {});
    for (const forbidden of ['colors', 'families', 'scales', 'rules', 'derivation']) {
      await expect(
        buildColorSystemConstructionProposalV1(
          model,
          brief,
          { ...intent, [forbidden]: [] },
          { ...execution, yield: yieldHook }
        )
      ).rejects.toThrow('caller-generated output');
    }
    const getter = vi.fn(() => true);
    Object.defineProperty(intent.brief.permissions, 'addColors', { enumerable: true, get: getter });
    await expect(
      buildColorSystemConstructionProposalV1(model, brief, intent, {
        ...execution,
        yield: yieldHook,
      })
    ).rejects.toThrow(/accessors/i);
    expect(getter).not.toHaveBeenCalled();
    expect(yieldHook).not.toHaveBeenCalled();
  });

  it('enforces the combined model color bound before a fill workload runs', async () => {
    const { input, brief, intent } = fixture();
    input.colors.push(
      ...Array.from({ length: 247 }, (_, index) => ({
        ...input.colors[0],
        id: `additional-${index}`,
      }))
    );
    const model = buildColorSystemModelV1(input);
    const yieldHook = vi.fn(async () => {});
    await expect(
      buildColorSystemConstructionProposalV1(
        model,
        { ...brief, modelHash: model.modelHash },
        { ...intent, sourceModelHash: model.modelHash },
        { ...execution, yield: yieldHook }
      )
    ).rejects.toThrow('combined model color bound');
    expect(yieldHook).not.toHaveBeenCalled();
  });
});
