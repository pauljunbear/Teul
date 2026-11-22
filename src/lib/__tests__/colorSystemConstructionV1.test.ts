import { describe, expect, it, vi } from 'vitest';
import {
  COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
  compileColorSystemConstructionV1,
  type ColorSystemConstructionBriefV1,
} from '../colorSystemConstructionV1';
import { buildColorSystemModelV1, type ColorSystemModelInputV1 } from '../colorSystemModelV1';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';
import { buildColorSystemSrgbValueV1, colorSystemSrgbToOklchV1 } from '../colorSystemSrgbValueV1';
import { canonicalJson } from '../colorSystemHashing';
import { mapOklchToNativeSrgbV1, mapOklchToSrgb } from '../colorScale';

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};

function fixture() {
  const input = JSON.parse(
    JSON.stringify(syntheticColorSystemModelInputV1())
  ) as Mutable<ColorSystemModelInputV1>;
  input.adoptions = [];
  const scale = input.scales[0];
  scale.slots = [0, 1, 3, 6, 10, 14, 18, 22, 24].map(position => ({
    id: `s${position}`,
    position,
  }));
  scale.modes.forEach(mode => {
    mode.anchors = mode.anchors.map((anchor, index) => ({
      ...anchor,
      slotId: ['s1', 's6', 's18', 's24'][index],
    }));
  });
  const model = buildColorSystemModelV1(input);
  const brief: Mutable<ColorSystemConstructionBriefV1> = {
    schemaVersion: COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
    modelHash: model.modelHash,
    contextId: 'communications',
    changeMode: 'extend',
    decision: {
      actor: { kind: 'agent', ref: 'test-author' },
      authorityRef: 'test:extend-only',
      decisionRef: 'test:decision',
    },
    scales: model.scales[0].modes.map(mode => ({
      scaleId: scale.id,
      modeId: mode.modeId,
      requiredSlotIds: scale.slots.slice(1).map(slot => slot.id),
      fillSlotIds: ['s3', 's10', 's14', 's22'],
      lightnessOrder: mode.modeId === 'Day' ? 'decreasing' : 'increasing',
      endpoints: [],
    })),
  };
  return { input, model, brief };
}

describe('authored scale construction', () => {
  it.each([1e-5, 1e-9, 1e-12, 1e-15])(
    'keeps a midpoint inside native anchors separated by %s even when display hex matches',
    async width => {
      const { input, brief } = fixture();
      const scale = input.scales[0];
      scale.slots = [0, 1, 2].map(position => ({ id: `s${position}`, position }));
      scale.modes.forEach(mode => {
        mode.anchors = [
          { slotId: 's0', colorId: 'blue-pale' },
          { slotId: 's2', colorId: 'blue-deep' },
        ];
      });
      for (const [id, channel] of [
        ['blue-pale', 0.50001],
        ['blue-deep', 0.50001 + width],
      ] as const) {
        input.colors.find(color => color.id === id)!.valuesByMode.Day = buildColorSystemSrgbValueV1(
          {
            r: channel,
            g: channel,
            b: channel,
          }
        );
      }
      const model = buildColorSystemModelV1(input);
      brief.modelHash = model.modelHash;
      brief.scales = [
        {
          scaleId: scale.id,
          modeId: 'Day',
          requiredSlotIds: ['s0', 's1', 's2'],
          fillSlotIds: ['s1'],
          lightnessOrder: 'increasing',
          endpoints: [],
        },
      ];
      const result = await compileColorSystemConstructionV1(model, brief).construct();
      if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
      expect(result.status).toBe('complete');
      const [left, middle, right] = result.scales[0].members;
      expect(left.value.components.r).toBe(0.50001);
      expect(right.value.components.r).toBe(0.50001 + width);
      for (const channel of ['r', 'g', 'b'] as const) {
        expect(middle.value.components[channel]).toBeGreaterThanOrEqual(
          left.value.components[channel]
        );
        expect(middle.value.components[channel]).toBeLessThanOrEqual(
          right.value.components[channel]
        );
      }
      expect(middle.value.representation?.kind).toBe('native-srgb');
      expect(new Set([left, middle, right].map(member => member.value.hex)).size).toBe(1);
      if (width < 1e-6)
        expect(middle.origin).toMatchObject({
          interpolationSpace: 'native-srgb-precision-fallback',
        });
    }
  );

  it('uses the short hue arc across zero and preserves fractional source alpha', async () => {
    const { input, brief } = fixture();
    const scale = input.scales[0];
    scale.slots = [0, 1, 2].map(position => ({ id: `s${position}`, position }));
    scale.modes.forEach(mode => {
      mode.anchors = [
        { slotId: 's0', colorId: 'blue-pale' },
        { slotId: 's2', colorId: 'blue-deep' },
      ];
    });
    const alpha = [0.23456789012345, 0.9876543210987654];
    ['blue-pale', 'blue-deep'].forEach((id, index) => {
      const components = mapOklchToNativeSrgbV1({
        l: 0.6,
        c: 0.08,
        h: index ? 10 : 350,
      }).components;
      input.colors.find(color => color.id === id)!.valuesByMode.Day = buildColorSystemSrgbValueV1(
        components,
        alpha[index]
      );
    });
    const model = buildColorSystemModelV1(input);
    brief.modelHash = model.modelHash;
    brief.scales = [
      {
        scaleId: scale.id,
        modeId: 'Day',
        requiredSlotIds: ['s0', 's1', 's2'],
        fillSlotIds: ['s1'],
        lightnessOrder: 'none',
        endpoints: [],
      },
    ];
    const result = await compileColorSystemConstructionV1(model, brief).construct();
    if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
    const [left, middle, right] = result.scales[0].members;
    expect(left.value.alpha).toBe(alpha[0]);
    expect(right.value.alpha).toBe(alpha[1]);
    expect(middle.value.alpha).toBeCloseTo((alpha[0] + alpha[1]) / 2, 11);
    if (middle.origin.kind !== 'teul-generated') throw new Error('Expected generated');
    const hue = middle.origin.requestedOklch.h;
    expect(Math.min(hue, 360 - hue)).toBeLessThan(0.001);
  });

  it('constructs all 64 authored slots and rejects a workload beyond 1024', async () => {
    const { input, brief } = fixture();
    const scale = input.scales[0];
    scale.slots = Array.from({ length: 64 }, (_, position) => ({ id: `s${position}`, position }));
    scale.modes.forEach(mode => {
      mode.anchors = mode.anchors.map((anchor, i) => ({
        ...anchor,
        slotId: `s${[0, 20, 42, 63][i]}`,
      }));
    });
    input.scales = [
      scale,
      input.scales[1],
      ...Array.from({ length: 16 }, (_, i) => ({ ...scale, id: `extra:${i}` })),
    ];
    const model = buildColorSystemModelV1(input);
    brief.modelHash = model.modelHash;
    const requiredSlotIds = scale.slots.map(slot => slot.id);
    const fillSlotIds = requiredSlotIds.filter(
      id => !scale.modes[0].anchors.some(anchor => anchor.slotId === id)
    );
    brief.scales = model.scales
      .filter(item => item.id !== 'warm-scale')
      .map(item => ({
        scaleId: item.id,
        modeId: 'Day',
        requiredSlotIds,
        fillSlotIds,
        lightnessOrder: 'decreasing',
        endpoints: [],
      }));
    expect(() => compileColorSystemConstructionV1(model, brief)).toThrow(/1024/);
    brief.scales.pop();
    const result = await compileColorSystemConstructionV1(model, brief).construct();
    if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
    expect(result.status).toBe('complete');
    expect(result.scales.reduce((sum, item) => sum + item.members.length, 0)).toBe(1024);
  });

  it('uses the same gamut mapping for native and byte-based values', () => {
    for (const l of [0, 0.2, 0.55, 0.95, 1])
      for (const c of [0, 0.1, 0.4])
        for (const h of [0, 90, 230]) {
          const input = { l, c, h };
          const native = mapOklchToNativeSrgbV1(input);
          const byte = mapOklchToSrgb(input);
          expect(buildColorSystemSrgbValueV1(native.components).hex.toLowerCase()).toBe(byte.hex);
          expect(native.mapped).toBe(byte.mapped);
          expect(Object.keys(byte)).toEqual(['oklch', 'hex', 'mapped']);
        }
  });
  it('preserves four exact anchors in each authored mode and fills only permitted nonuniform positions', async () => {
    const { model, brief } = fixture();
    const before = canonicalJson(model);
    const result = await compileColorSystemConstructionV1(model, brief).construct();
    expect(result.status).toBe('complete');
    if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
    expect(result.scales).toHaveLength(2);
    for (const scale of result.scales) {
      expect(scale.members.map(member => member.slotId)).toEqual([
        's1',
        's3',
        's6',
        's10',
        's14',
        's18',
        's22',
        's24',
      ]);
      for (const anchor of model.scales[0].modes.find(mode => mode.modeId === scale.modeId)!
        .anchors) {
        const member = scale.members.find(item => item.slotId === anchor.slotId)!;
        expect(member.origin).toEqual({ kind: 'source', colorId: anchor.colorId });
        expect(canonicalJson(member.value)).toBe(
          canonicalJson(
            model.colors.find(color => color.id === anchor.colorId)!.valuesByMode[scale.modeId]
          )
        );
      }
      const generated = scale.members.find(member => member.slotId === 's10')!;
      expect(generated.origin.kind).toBe('teul-generated');
      if (generated.origin.kind !== 'teul-generated') throw new Error('Wrong origin');
      expect(generated.origin.boundingSlotIds).toEqual(['s6', 's18']);
      expect(generated.origin.sourceAnchorColorIds).toEqual(['blue-mid', 'blue']);
      const left = colorSystemSrgbToOklchV1(
        model.colors.find(color => color.id === 'blue-mid')!.valuesByMode[scale.modeId]
      );
      const right = colorSystemSrgbToOklchV1(
        model.colors.find(color => color.id === 'blue')!.valuesByMode[scale.modeId]
      );
      expect(generated.origin.requestedOklch.l).toBeCloseTo(left.l + (right.l - left.l) / 3, 10);
      expect(generated.origin.status).toBe('proposed');
      expect(generated.origin.decisionRef).toBe(brief.decision.decisionRef);
    }
    expect(result.scales[0].members.map(member => member.value.hex)).not.toEqual(
      result.scales[1].members.map(member => member.value.hex)
    );
    expect(canonicalJson(model)).toBe(before);
  });

  it('preserves separate related scales within one family and does not create unrequested scales', async () => {
    const { model, brief } = fixture();
    brief.scales = [
      brief.scales[0],
      {
        scaleId: 'warm-scale',
        modeId: 'Day',
        requiredSlotIds: ['slot:0', 'slot:1', 'slot:2'],
        fillSlotIds: [],
        lightnessOrder: 'decreasing',
        endpoints: [],
      },
    ];
    const result = await compileColorSystemConstructionV1(model, brief).construct();
    if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
    expect(result.status).toBe('complete');
    expect(result.scales.map(scale => [scale.scaleId, scale.familyId, scale.modeId])).toEqual([
      ['blue-scale', 'pigments', 'Day'],
      ['warm-scale', 'pigments', 'Day'],
    ]);
    expect(result.scales[1].members.every(member => member.origin.kind === 'source')).toBe(true);
    expect(model.rules.find(rule => rule.id === 'rule:partner')?.kind).toBe('required-partner');
  });

  it('reports absent apply slots without inventing a color and rejects generation permission in apply', async () => {
    const { model, brief } = fixture();
    brief.changeMode = 'apply';
    expect(() => compileColorSystemConstructionV1(model, brief)).toThrow(/Apply/);
    brief.scales.forEach(scale => {
      scale.fillSlotIds = [];
    });
    const result = await compileColorSystemConstructionV1(model, brief).construct();
    if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
    expect(result.status).toBe('incomplete');
    expect(result.scales[0].issues.every(issue => issue.code === 'UNPERMITTED_GAP')).toBe(true);
    expect(
      result.scales.every(scale => scale.members.every(member => member.origin.kind === 'source'))
    ).toBe(true);
  });

  it('requires explicit outer endpoints and records gamut mapping without altering source pins', async () => {
    const { model, brief } = fixture();
    brief.scales = [brief.scales[0]];
    brief.scales[0].requiredSlotIds.unshift('s0');
    brief.scales[0].fillSlotIds.unshift('s0');
    let result = await compileColorSystemConstructionV1(model, brief).construct();
    if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
    expect(result.status).toBe('incomplete');
    expect(result.scales[0].issues).toContainEqual(
      expect.objectContaining({ code: 'UNBOUNDED_GAP', slotIds: ['s0'] })
    );
    brief.scales[0].endpoints = [{ slotId: 's0', oklch: { l: 0.99, c: 0.4, h: 90 }, alpha: 1 }];
    result = await compileColorSystemConstructionV1(model, brief).construct();
    if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
    expect(result.status).toBe('complete');
    expect(result.scales[0].members[0].origin).toMatchObject({
      kind: 'teul-generated',
      method: 'explicit-endpoint',
      gamutMapped: true,
      sourceAnchorColorIds: [],
    });
  });

  it('does not erase an impossible fixed-anchor ordering', async () => {
    const { model, brief } = fixture();
    brief.scales[0].lightnessOrder = 'increasing';
    const result = await compileColorSystemConstructionV1(model, brief).construct();
    if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
    expect(result.status).toBe('infeasible');
    expect(result.scales[0].issues.some(issue => issue.code === 'LIGHTNESS_ORDER_CONFLICT')).toBe(
      true
    );
    const source = result.scales[0].members.find(member => member.slotId === 's18')!;
    expect(source.value).toEqual(model.colors.find(color => color.id === 'blue')!.valuesByMode.Day);
  });

  it('keeps missing numeric anchors unresolved and does not bridge across them', async () => {
    const { input, brief } = fixture();
    const color = input.colors.find(item => item.id === 'blue-mid')!;
    delete color.valuesByMode.Day;
    color.valueGapClaimIdsByMode = { Day: ['claim:gap'] };
    color.claimIds.push('claim:gap');
    input.claims.push({
      id: 'claim:gap',
      sourceId: color.sourceId,
      text: 'Numeric value unavailable.',
      status: 'unresolved',
      evidenceRefs: ['evidence:values'],
      contextIds: [],
      ruleIds: [],
      modeIds: ['Day'],
    });
    input.coverage[0].status = 'partial';
    input.coverage[0].unresolvedClaimIds.push('claim:gap');
    const model = buildColorSystemModelV1(input);
    brief.modelHash = model.modelHash;
    const result = await compileColorSystemConstructionV1(model, brief).construct();
    if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
    expect(result.status).toBe('incomplete');
    expect(result.scales[0].issues).toContainEqual(
      expect.objectContaining({ code: 'MISSING_SOURCE_VALUE', slotIds: ['s6'] })
    );
    expect(result.scales[0].members.map(member => member.slotId)).not.toContain('s10');
    expect(result.scales[1].status).toBe('complete');
    brief.scales[0].fillSlotIds.push('s6');
    expect(() => compileColorSystemConstructionV1(model, brief)).toThrow(/Source anchors/);
  });

  it('borrows hue from the chromatic endpoint when the other endpoint is achromatic', async () => {
    const { input, brief } = fixture();
    const pale = input.colors.find(color => color.id === 'blue-pale')!;
    pale.valuesByMode.Day = buildColorSystemSrgbValueV1({ r: 1, g: 1, b: 1 });
    const model = buildColorSystemModelV1(input);
    brief.modelHash = model.modelHash;
    brief.scales = [brief.scales[0]];
    const result = await compileColorSystemConstructionV1(model, brief).construct();
    if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
    const member = result.scales[0].members.find(item => item.slotId === 's3')!;
    if (member.origin.kind !== 'teul-generated') throw new Error('Expected generated');
    expect(member.origin.requestedOklch.h).toBeCloseTo(
      colorSystemSrgbToOklchV1(
        model.colors.find(color => color.id === 'blue-mid')!.valuesByMode.Day
      ).h,
      8
    );
  });

  it('detaches source, input, displayed brief and returned values from later replay', async () => {
    const { model, brief } = fixture();
    const plan = compileColorSystemConstructionV1(model, brief);
    const first = await plan.construct();
    const expected = canonicalJson(first);
    (model as Mutable<typeof model>).colors[0].label = 'mutated source';
    brief.scales[0].fillSlotIds = [];
    (plan.brief as Mutable<typeof brief>).scales[0].requiredSlotIds = [];
    if (first.status === 'cancelled') throw new Error('Unexpected cancellation');
    (first as Mutable<typeof first>).scales[0].members[0].value.components.r = 0;
    expect(canonicalJson(await plan.construct())).toBe(expected);
  });

  it('preserves signed zero in source pins and isolates returned native values across replay', async () => {
    const { input, brief } = fixture();
    input.colors.find(color => color.id === 'blue-pale')!.valuesByMode.Day =
      buildColorSystemSrgbValueV1({ r: -0, g: 0.1234567890123456, b: 0.3456789012345678 }, -0);
    const model = buildColorSystemModelV1(input);
    const original = model.colors.find(color => color.id === 'blue-pale')!.valuesByMode.Day;
    const scale = model.scales[0];
    const plan = compileColorSystemConstructionV1(model, {
      ...brief,
      modelHash: model.modelHash,
      changeMode: 'apply',
      scales: [
        {
          scaleId: scale.id,
          modeId: 'Day',
          requiredSlotIds: scale.modes
            .find(mode => mode.modeId === 'Day')!
            .anchors.map(anchor => anchor.slotId),
          fillSlotIds: [],
          lightnessOrder: 'none',
          endpoints: [],
        },
      ],
    });
    const first = await plan.construct();
    if (first.status === 'cancelled') throw new Error('Unexpected cancellation');
    expect(first.status).toBe('complete');
    const value = first.scales[0].members.find(
      member => member.origin.kind === 'source' && member.origin.colorId === 'blue-pale'
    )!.value as Mutable<typeof original>;
    expect(Object.is(value.components.r, -0)).toBe(true);
    expect(Object.is(value.alpha, -0)).toBe(true);
    expect(value).toEqual(original);
    expect(value).not.toBe(original);
    expect(value.components).not.toBe(original.components);
    expect(value.representation).not.toBe(original.representation);

    value.components.r = 0.5;
    value.alpha = 0.5;
    value.representation!.exactValueHash = 'mutated representation';
    const replay = await plan.construct();
    if (replay.status === 'cancelled') throw new Error('Unexpected cancellation');
    const replayed = replay.scales[0].members.find(
      member => member.origin.kind === 'source' && member.origin.colorId === 'blue-pale'
    )!.value;
    expect(Object.is(replayed.components.r, -0)).toBe(true);
    expect(Object.is(replayed.alpha, -0)).toBe(true);
    expect(replayed).toEqual(original);
    expect(replay.resultHash).toBe(first.resultHash);
  });

  it('binds native source differences, attribution, scope and permitted additions to identity', () => {
    const { input, model, brief } = fixture();
    const first = compileColorSystemConstructionV1(model, brief);
    brief.decision.actor.ref = 'other-agent';
    expect(compileColorSystemConstructionV1(model, brief).planHash).not.toBe(first.planHash);
    brief.decision.actor.ref = 'test-author';
    brief.contextId = 'interface';
    expect(compileColorSystemConstructionV1(model, brief).planHash).not.toBe(first.planHash);
    const color = input.colors.find(item => item.id === 'blue')!;
    color.valuesByMode.Day = buildColorSystemSrgbValueV1(
      { ...color.valuesByMode.Day.components, r: color.valuesByMode.Day.components.r + 1e-15 },
      color.valuesByMode.Day.alpha
    );
    const changed = buildColorSystemModelV1(input);
    expect(() => compileColorSystemConstructionV1(changed, brief)).toThrow(/different source/);
    brief.modelHash = changed.modelHash;
    expect(compileColorSystemConstructionV1(changed, brief).planHash).not.toBe(first.planHash);
  });

  it('cancels before work and between scales without exposing partial results', async () => {
    const { model, brief } = fixture();
    const plan = compileColorSystemConstructionV1(model, brief);
    const immediate = { isCancelled: () => true, yield: vi.fn(async () => undefined) };
    expect(await plan.construct(immediate)).toEqual({
      status: 'cancelled',
      planHash: plan.planHash,
    });
    expect(immediate.yield).not.toHaveBeenCalled();
    let ticks = 0;
    const result = await plan.construct({
      isCancelled: () => ticks === 2,
      yield: async () => {
        ticks += 1;
      },
    });
    expect(result).toEqual({ status: 'cancelled', planHash: plan.planHash });
  });

  it.each([
    [
      'unknown mode',
      (brief: Mutable<ColorSystemConstructionBriefV1>) => {
        brief.scales[0].modeId = 'Uninvented';
      },
    ],
    [
      'unknown context',
      (brief: Mutable<ColorSystemConstructionBriefV1>) => {
        brief.contextId = 'Unknown';
      },
    ],
    [
      'unknown slot',
      (brief: Mutable<ColorSystemConstructionBriefV1>) => {
        brief.scales[0].requiredSlotIds.push('unknown');
      },
    ],
    [
      'duplicate slot',
      (brief: Mutable<ColorSystemConstructionBriefV1>) => {
        brief.scales[0].fillSlotIds.push('s3');
      },
    ],
    [
      'unrequested fill',
      (brief: Mutable<ColorSystemConstructionBriefV1>) => {
        brief.scales[0].fillSlotIds.push('s0');
      },
    ],
    [
      'source overwrite',
      (brief: Mutable<ColorSystemConstructionBriefV1>) => {
        brief.scales[0].fillSlotIds.push('s1');
      },
    ],
    [
      'interior endpoint',
      (brief: Mutable<ColorSystemConstructionBriefV1>) => {
        brief.scales[0].endpoints.push({
          slotId: 's3',
          oklch: { l: 0.5, c: 0.2, h: 200 },
          alpha: 1,
        });
      },
    ],
    [
      'duplicate request',
      (brief: Mutable<ColorSystemConstructionBriefV1>) => {
        brief.scales.push(brief.scales[0]);
      },
    ],
    [
      'empty request',
      (brief: Mutable<ColorSystemConstructionBriefV1>) => {
        brief.scales = [];
      },
    ],
    [
      'oversized text',
      (brief: Mutable<ColorSystemConstructionBriefV1>) => {
        brief.decision.authorityRef = 'a'.repeat(257);
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const { model, brief } = fixture();
    mutate(brief);
    expect(() => compileColorSystemConstructionV1(model, brief)).toThrow();
  });

  it('rejects accessors, unknown keys, extended arrays, sparse arrays and executable nested values without invocation', () => {
    const { model, brief } = fixture();
    const getter = vi.fn(() => 'extend');
    Object.defineProperty(brief, 'changeMode', { get: getter, enumerable: true });
    expect(() => compileColorSystemConstructionV1(model, brief)).toThrow(/accessor/);
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      compileColorSystemConstructionV1(model, { ...fixture().brief, typo: true })
    ).toThrow(/unknown/);
    const extended = fixture().brief;
    Object.defineProperty(extended.scales, 'extra', { value: true });
    expect(() => compileColorSystemConstructionV1(model, extended)).toThrow(/array bound/);
    const sparse = fixture().brief;
    delete sparse.scales[0];
    expect(() => compileColorSystemConstructionV1(model, sparse)).toThrow();
    const executable = fixture().brief;
    Object.defineProperty(executable.decision.actor, 'ref', { value: () => 'agent' });
    expect(() => compileColorSystemConstructionV1(model, executable)).toThrow();
  });
});
