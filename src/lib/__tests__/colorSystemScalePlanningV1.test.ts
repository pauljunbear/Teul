import { describe, expect, it, vi } from 'vitest';
import {
  COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION,
  planColorSystemSourceScaleV1,
  type ColorSystemSourceScalePlanningRequestV1,
} from '../colorSystemScalePlanningV1';
import { buildColorSystemModelV1, type ColorSystemModelInputV1 } from '../colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import { buildColorSystemProposalV1 } from '../colorSystemProposalV1';
import { buildColorSystemConstructionProposalV1 } from '../colorSystemConstructionProposalV1';
import {
  canonicalHashJson,
  canonicalJson,
  canonicalNumber,
  deterministicContentHash,
} from '../colorSystemHashing';
import { generateColorScaleFromSrgbV1 } from '../colorScale';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};
const exactHash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const execution = { isCancelled: () => false, yield: async () => {} };

function fixture() {
  const input = structuredClone(
    syntheticColorSystemModelInputV1()
  ) as Mutable<ColorSystemModelInputV1>;
  input.adoptions = [];
  const blue = input.colors.find(color => color.id === 'blue')!;
  blue.valuesByMode.Day = buildColorSystemSrgbValueV1(blue.valuesByMode.Day.components);
  const originalPair = input.scales.find(scale => scale.id === 'blue-scale')!;
  originalPair.slots = [
    { id: 'pair:a', position: 0 },
    { id: 'pair:b', position: 1 },
  ];
  for (const mode of originalPair.modes)
    mode.anchors = [
      { slotId: 'pair:a', colorId: 'blue' },
      { slotId: 'pair:b', colorId: 'blue-deep' },
    ];
  const model = buildColorSystemModelV1(input);
  const request: Mutable<ColorSystemSourceScalePlanningRequestV1> = {
    version: COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION,
    id: 'synthetic-planned-scale',
    sourceModelHash: model.modelHash,
    contextId: 'communications',
    family: { id: 'product-family', label: 'Proposed product colors' },
    scale: { id: 'product-scale', label: 'Proposed custom product scale' },
    brief: {
      briefHash: exactHash('public synthetic explicit extension'),
      operation: 'extend',
      contextIds: ['communications'],
      modeIds: ['Day', 'Night'],
      permissions: {
        addColors: true,
        addFamilies: true,
        addScales: true,
        addRules: false,
        editFamilyIds: [],
        editScaleIds: [],
        replaceRuleIds: [],
      },
    },
    decision: {
      actor: { kind: 'agent', ref: 'synthetic-planner' },
      authorityRef: 'synthetic:local-proposals',
      decisionRef: 'synthetic:plan',
    },
    modes: ['Day', 'Night'].map(modeId => ({
      modeId,
      polarity: modeId === 'Day' ? 'light' : 'dark',
      anchorColorId: 'blue',
    })),
  };
  return { input, model, request };
}
function planned(f = fixture()) {
  const plan = planColorSystemSourceScaleV1(f.model, f.request);
  if (plan.status !== 'planned') throw new Error('Expected planned structure');
  return plan;
}
function gap(f: ReturnType<typeof fixture>, colorId: string) {
  const color = f.input.colors.find(color => color.id === colorId)!;
  delete color.valuesByMode.Day;
  const id = `gap:${colorId}:Day`;
  color.claimIds.push(id);
  color.valueGapClaimIdsByMode = { Day: [id] };
  f.input.claims.push({
    id,
    sourceId: color.sourceId,
    text: 'Exact Day value unavailable.',
    status: 'unsupported',
    evidenceRefs: color.evidenceRefs,
    contextIds: [],
    ruleIds: [],
    modeIds: ['Day'],
  });
  f.input.coverage[0].status = 'partial';
  f.input.coverage[0].unresolvedClaimIds.push(id);
  f.model = buildColorSystemModelV1(f.input);
  f.request.sourceModelHash = f.model.modelHash;
}

describe('explicit source-derived scale planning', () => {
  it('runs the real bridge in two modes while retaining original pair, related scale and every exact source value', async () => {
    const f = fixture(),
      before = canonicalJson(f.model),
      plan = planned(f);
    const draft = buildColorSystemProposalV1(f.model, plan.structureProposal);
    expect(draft.proposalHash).toBe(plan.structureProposalHash);
    expect(draft.workingModel.modelHash).toBe(plan.structureWorkingModelHash);
    expect(plan.constructionBrief.modelHash).toBe(plan.structureWorkingModelHash);
    expect(plan.structureProposal.colors).toEqual([]);
    expect(plan.structureProposal.rules).toEqual([]);
    expect(plan.structureProposal.review).toBeUndefined();
    expect(plan.constructionIntent.review).toBeUndefined();
    expect(plan.structureProposal.brief).toEqual(plan.constructionIntent.brief);
    expect(plan.constructionBrief.decision).toEqual(f.request.decision);
    const result = await buildColorSystemConstructionProposalV1(
      f.model,
      plan.constructionBrief,
      plan.constructionIntent,
      execution,
      plan.structureProposal
    );
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed') throw new Error(JSON.stringify(result.construction.result));
    expect(result.qualified).toBe(false);
    expect(result.generatedBindings).toHaveLength(11);
    expect(result.proposal.sourceAssessmentModel.scales).toEqual(f.model.scales);
    expect(
      result.proposal.workingModel.scales.filter(scale => scale.id !== 'product-scale')
    ).toEqual(f.model.scales);
    const scale = result.proposal.workingModel.scales.find(scale => scale.id === 'product-scale')!;
    expect(scale.slots).toEqual(
      Array.from({ length: 12 }, (_, i) => ({ id: `step:${i + 1}`, position: i + 1 }))
    );
    for (const mode of scale.modes) {
      expect(mode.anchors).toHaveLength(12);
      expect(mode.anchors.find(pin => pin.slotId === 'step:9')?.colorId).toBe('blue');
    }
    for (const color of f.model.colors)
      expect(result.proposal.workingModel.colors.find(item => item.id === color.id)).toEqual(color);
    expect(result.proposal.workingModel.sources).toHaveLength(f.model.sources.length + 1);
    expect(canonicalJson(f.model)).toBe(before);
    expect(plan.qualified).toBe(false);
    expect(plan.kind).toBe('source-derived-custom-construction');
  });

  it('uses only old-generator endpoints with exact native input derivation and diagnostic validation', () => {
    const f = fixture(),
      plan = planned(f);
    for (const mode of f.request.modes) {
      const value = f.model.colors.find(color => color.id === mode.anchorColorId)!.valuesByMode[
        mode.modeId
      ];
      const legacy = generateColorScaleFromSrgbV1(value, mode.polarity, f.request.scale.label);
      const derivation = plan.endpointDerivations.find(item => item.modeId === mode.modeId)!;
      expect(derivation.input.value).toEqual(value);
      expect(derivation.inputHash).toBe(
        exactHash({ value, mode: mode.polarity, name: f.request.scale.label })
      );
      expect(derivation.generatorOutputHash).toBe(deterministicContentHash(legacy));
      expect(derivation.validation).toEqual(JSON.parse(canonicalHashJson(legacy.validation)));
      expect(derivation.endpoints.map(endpoint => endpoint.generatorStep)).toEqual([1, 12]);
      expect(
        plan.constructionBrief.scales.find(scale => scale.modeId === mode.modeId)!.endpoints
      ).toEqual(
        [1, 12].map(step => {
          const point = legacy.steps.find(item => item.step === step)!.requestedOklch;
          return {
            slotId: `step:${step}`,
            oklch: {
              l: canonicalNumber(point.l),
              c: canonicalNumber(point.c),
              h: canonicalNumber(point.h),
            },
            alpha: 1,
          };
        })
      );
    }
    expect(plan.structureProposal.derivation.sourceColorIds).toEqual(['blue']);
    expect(plan.structureProposal.derivation.sourceScaleIds).toEqual([]);
    expect(plan.structureProposal.derivation.inputHash).toBe(
      exactHash({ requestHash: plan.requestHash, endpointDerivations: plan.endpointDerivations })
    );
  });

  it('preserves allowed extra source alpha and endpoint pins through actual construction', async () => {
    const f = fixture();
    const extra = f.input.colors.find(color => color.id === 'blue-deep')!;
    extra.valuesByMode.Day = buildColorSystemSrgbValueV1(
      extra.valuesByMode.Day.components,
      0.3456789012345678
    );
    f.model = buildColorSystemModelV1(f.input);
    f.request.sourceModelHash = f.model.modelHash;
    for (const mode of f.request.modes)
      mode.extraPins = [
        { slotId: 'step:12', colorId: 'ink' },
        { slotId: 'step:11', colorId: 'blue-deep' },
        { slotId: 'step:1', colorId: 'paper' },
      ];
    const plan = planned(f);
    expect(plan.constructionBrief.scales.every(scale => scale.endpoints.length === 0)).toBe(true);
    expect(
      plan.endpointDerivations.every(item => item.endpoints.every(endpoint => !endpoint.emitted))
    ).toBe(true);
    const result = await buildColorSystemConstructionProposalV1(
      f.model,
      plan.constructionBrief,
      plan.constructionIntent,
      execution,
      plan.structureProposal
    );
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed') throw new Error(JSON.stringify(result.construction.result));
    expect(result.generatedBindings).toHaveLength(8);
    expect(
      result.proposal.workingModel.colors.find(color => color.id === 'blue-deep')!.valuesByMode.Day
    ).toEqual(extra.valuesByMode.Day);
    expect(
      result.proposal.workingModel.scales
        .find(scale => scale.id === 'product-scale')!
        .modes.every(mode =>
          ['step:1', 'step:9', 'step:11', 'step:12'].every(slotId =>
            mode.anchors.some(
              pin => pin.slotId === slotId && f.model.colors.some(color => color.id === pin.colorId)
            )
          )
        )
    ).toBe(true);
  });

  it('adds a separate related scale to an existing family only with edit permission and preserves all members', async () => {
    const f = fixture();
    f.request.family = { id: f.model.families[0].id, label: f.model.families[0].label };
    f.request.brief.permissions.addFamilies = false;
    f.request.brief.permissions.editFamilyIds = [f.request.family.id];
    const plan = planned(f);
    expect(plan.structureProposal.families[0].colorIds).toEqual(
      [...f.model.families[0].colorIds].sort()
    );
    const result = await buildColorSystemConstructionProposalV1(
      f.model,
      plan.constructionBrief,
      plan.constructionIntent,
      execution,
      plan.structureProposal
    );
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed') throw new Error('Expected proposal');
    expect(result.proposal.workingModel.families).toHaveLength(1);
    expect(
      result.proposal.workingModel.scales.filter(scale => scale.familyId === f.request.family.id)
    ).toHaveLength(3);
    expect(result.proposal.workingModel.families[0].colorIds).toEqual(
      expect.arrayContaining([...f.model.families[0].colorIds])
    );
  });

  it('keeps an old-generator diagnostic failure separate from the plan and final constructor outcome', async () => {
    const f = fixture();
    f.input.colors.find(color => color.id === 'blue')!.valuesByMode.Day =
      buildColorSystemSrgbValueV1({ r: 1 / 255, g: 1 / 255, b: 1 / 255 });
    f.model = buildColorSystemModelV1(f.input);
    f.request.sourceModelHash = f.model.modelHash;
    const plan = planned(f);
    expect(plan.endpointDerivations.find(item => item.modeId === 'Day')!.validation.valid).toBe(
      false
    );
    expect(plan.status).toBe('planned');
    const result = await buildColorSystemConstructionProposalV1(
      f.model,
      plan.constructionBrief,
      plan.constructionIntent,
      execution,
      plan.structureProposal
    );
    expect(result.status).toBe('proposed');
    expect(result.qualified).toBe(false);
  });

  it('reports explicit missing base or extra-pin source values without fabricated endpoints', () => {
    for (const colorId of ['blue', 'blue-deep']) {
      const f = fixture();
      gap(f, colorId);
      if (colorId === 'blue-deep') f.request.modes[0].extraPins = [{ slotId: 'step:11', colorId }];
      const plan = planColorSystemSourceScaleV1(f.model, f.request);
      expect(plan.status).toBe('incomplete');
      if (plan.status !== 'incomplete') throw new Error('Expected exact source gap');
      expect(plan.gaps).toEqual([
        {
          modeId: 'Day',
          slotId: colorId === 'blue' ? 'step:9' : 'step:11',
          colorId,
          claimIds: [`gap:${colorId}:Day`],
        },
      ]);
      expect('constructionBrief' in plan).toBe(false);
      expect('endpointDerivations' in plan).toBe(false);
      expect(plan.qualified).toBe(false);
    }
  });

  it('does not infer a second mode or polarity from names, and rejects a translucent base explicitly', () => {
    const f = fixture();
    f.request.modes = [f.request.modes[0]];
    f.request.brief.modeIds = ['Day'];
    expect(planned(f).structureProposal.scales[0].modes.map(mode => mode.modeId)).toEqual(['Day']);
    const color = f.input.colors.find(color => color.id === 'blue')!;
    color.valuesByMode.Day = buildColorSystemSrgbValueV1(color.valuesByMode.Day.components, 0.9);
    f.model = buildColorSystemModelV1(f.input);
    f.request.sourceModelHash = f.model.modelHash;
    expect(() => planned(f)).toThrow(/opaque base.*never flattened/);
  });

  it('hashes exact native source changes even when display hex and canonical computed numbers match', () => {
    const f = fixture(),
      first = planned(f);
    const color = f.input.colors.find(color => color.id === 'blue')!;
    color.valuesByMode.Day = buildColorSystemSrgbValueV1({
      ...color.valuesByMode.Day.components,
      r: color.valuesByMode.Day.components.r + 1e-15,
    });
    f.model = buildColorSystemModelV1(f.input);
    f.request.sourceModelHash = f.model.modelHash;
    const next = planned(f);
    expect(next.endpointDerivations[0].input.value.hex).toBe(
      first.endpointDerivations[0].input.value.hex
    );
    expect(next.sourceModelHash).not.toBe(first.sourceModelHash);
    expect(next.requestHash).not.toBe(first.requestHash);
    expect(next.endpointDerivations[0].inputHash).not.toBe(first.endpointDerivations[0].inputHash);
    expect(next.planHash).not.toBe(first.planHash);
  });

  it('returns deterministic detached records and binds attributed decisions without granting review', async () => {
    const f = fixture(),
      plan = planned(f),
      before = canonicalJson(plan),
      inputs = canonicalJson(f);
    expect(canonicalJson(planned(f))).toBe(before);
    f.request.modes.reverse();
    expect(canonicalJson(planned(f))).toBe(before);
    f.request.modes.reverse();
    const mutated = plan as Mutable<typeof plan>;
    mutated.structureProposal.scales[0].slots[0].position = 100;
    mutated.endpointDerivations[0].input.value.components.r = 0;
    mutated.request.brief.permissions.addColors = false;
    expect(canonicalJson(f)).toBe(inputs);
    expect(canonicalJson(planned(f))).toBe(before);
    f.request.decision.actor.ref = 'another-attributed-actor';
    const other = planned(f);
    expect(other.planHash).not.toBe(JSON.parse(before).planHash);
    expect(other.constructionIntent.review).toBeUndefined();
    const first = planned(),
      second = planned();
    const [a, b] = await Promise.all(
      [first, second].map(item =>
        buildColorSystemConstructionProposalV1(
          fixture().model,
          item.constructionBrief,
          item.constructionIntent,
          execution,
          item.structureProposal
        )
      )
    );
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it.each([
    [
      'stale source',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.sourceModelHash = exactHash('stale');
      },
    ],
    [
      'unknown context',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.contextId = 'missing';
      },
    ],
    [
      'unknown mode',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.modes[0].modeId = 'missing';
      },
    ],
    [
      'duplicate mode',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.modes[1] = { ...r.modes[0] };
      },
    ],
    [
      'no modes',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.modes = [];
      },
    ],
    [
      'mode bound',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.modes = Array(5).fill(r.modes[0]);
      },
    ],
    [
      'unknown anchor',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.modes[0].anchorColorId = 'missing';
      },
    ],
    [
      'existing scale',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.scale.id = 'blue-scale';
      },
    ],
    [
      'invalid structure ID',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.family.id = 'constructor';
      },
    ],
    [
      'unknown shared context',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.brief.contextIds = ['communications', 'interface'];
      },
    ],
    [
      'extra shared mode',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.modes.pop();
      },
    ],
    [
      'denied colors',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.brief.permissions.addColors = false;
      },
    ],
    [
      'denied scale',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.brief.permissions.addScales = false;
      },
    ],
    [
      'denied family',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.brief.permissions.addFamilies = false;
      },
    ],
    [
      'apply operation',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.brief.operation = 'apply';
      },
    ],
    [
      'existing family edit denied',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.family = { id: 'pigments', label: 'Related illustration pigments' };
      },
    ],
    [
      'existing family renamed',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.family.id = 'pigments';
        r.brief.permissions.editFamilyIds = ['pigments'];
      },
    ],
    [
      'duplicate pin',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.modes[0].extraPins = Array(2).fill({ slotId: 'step:11', colorId: 'blue-deep' });
      },
    ],
    [
      'protected step9',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.modes[0].extraPins = [{ slotId: 'step:9', colorId: 'warm' }];
      },
    ],
    [
      'outside slot',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.modes[0].extraPins = [{ slotId: 'step:13', colorId: 'warm' }];
      },
    ],
    [
      'unknown pin',
      (r: Mutable<ColorSystemSourceScalePlanningRequestV1>) => {
        r.modes[0].extraPins = [{ slotId: 'step:11', colorId: 'missing' }];
      },
    ],
  ])('rejects %s', (_label, mutate) => {
    const f = fixture();
    mutate(f.request);
    expect(() => planned(f)).toThrow();
  });

  it('does not turn a contradictory preserved pin into a moved source value', async () => {
    const f = fixture();
    f.request.modes[0].extraPins = [{ slotId: 'step:11', colorId: 'paper' }];
    const plan = planned(f);
    const result = await buildColorSystemConstructionProposalV1(
      f.model,
      plan.constructionBrief,
      plan.constructionIntent,
      execution,
      plan.structureProposal
    );
    expect(result.status).toBe('infeasible');
    expect(result.proposal).toBeNull();
    expect(result.generatedBindings).toEqual([]);
  });

  it('requires a freshly bound working structure and preserves bridge cancellation', async () => {
    const f = fixture(),
      plan = planned(f),
      yieldHook = vi.fn(async () => {});
    await expect(
      buildColorSystemConstructionProposalV1(
        f.model,
        { ...plan.constructionBrief, modelHash: f.model.modelHash },
        plan.constructionIntent,
        { ...execution, yield: yieldHook },
        plan.structureProposal
      )
    ).rejects.toThrow(/different source model/);
    expect(yieldHook).not.toHaveBeenCalled();
    const result = await buildColorSystemConstructionProposalV1(
      f.model,
      plan.constructionBrief,
      plan.constructionIntent,
      { isCancelled: () => true, yield: yieldHook },
      plan.structureProposal
    );
    expect(result.status).toBe('cancelled');
    expect(result.proposal).toBeNull();
    expect(result.generatedBindings).toEqual([]);
  });

  it('rejects accessors, hostile arrays/prototypes, unknown execution/numeric fields and missing polarity without executing code', () => {
    const f = fixture(),
      hook = vi.fn(() => 'light');
    const getter = structuredClone(f.request);
    Object.defineProperty(getter.modes[0], 'polarity', { get: hook, enumerable: true });
    const sparse = structuredClone(f.request);
    delete sparse.modes[0];
    const inherited = Object.assign(Object.create({ inherited: true }), f.request);
    const arrayGetter = structuredClone(f.request);
    Object.defineProperty(arrayGetter.modes, '0', { get: hook, enumerable: true });
    const absentPolarity = structuredClone(f.request) as unknown as {
      modes: Record<string, unknown>[];
    };
    delete absentPolarity.modes[0].polarity;
    const symbolField = { ...f.request, [Symbol('hidden')]: 'payload' };
    const subclass = structuredClone(f.request);
    Object.setPrototypeOf(subclass.modes, class extends Array {}.prototype);
    const deep: Record<string, unknown> = {};
    deep.self = deep;
    for (const request of [
      getter,
      sparse,
      inherited,
      arrayGetter,
      absentPolarity,
      symbolField,
      subclass,
      { ...f.request, version: 'unknown' },
      { ...f.request, colors: [] },
      { ...f.request, execute: hook },
      { ...f.request, deep },
      { ...f.request, scale: { ...f.request.scale, endpoint: { l: 0.9, c: 0.2, h: 200 } } },
      { ...f.request, decision: { ...f.request.decision, authorityRef: hook } },
    ]) {
      expect(() => planColorSystemSourceScaleV1(f.model, request)).toThrow();
    }
    expect(hook).not.toHaveBeenCalled();
  });
});
