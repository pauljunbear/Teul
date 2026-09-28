import { describe, expect, it, vi } from 'vitest';
import {
  COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION,
  selectColorSystemModelInteractionsV1,
  enumerateColorSystemModelInteractionsV1,
  type ColorSystemModelInteractionsRequestV1,
} from '../colorSystemModelInteractionsV1';
import { buildColorSystemModelV1, type ColorSystemModelInputV1 } from '../colorSystemModelV1';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import {
  selectColorSystemAuthoredInteractionStatesV1,
  enumerateColorSystemAuthoredInteractionStatesV1,
} from '../colorSystemInteractionStatesV1';

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};
const immediate = { isCancelled: () => false, yield: async () => undefined };
const gray = (channel: number) =>
  buildColorSystemSrgbValueV1({ r: channel, g: channel, b: channel });
function fixture() {
  const input = structuredClone(
    syntheticColorSystemModelInputV1()
  ) as Mutable<ColorSystemModelInputV1>;
  input.adoptions = [];
  const scale = input.scales[0];
  const positions = [0.125, 0.12500000000001, 73.625, Number.MAX_SAFE_INTEGER - 1];
  scale.slots.forEach((slot, i) => {
    slot.position = positions[i];
  });
  for (const mode of scale.modes)
    mode.anchors.forEach((anchor, i) => {
      const color = input.colors.find(color => color.id === anchor.colorId)!;
      const channel = mode.modeId === 'Day' ? 0.1234567890123456 + i * 0.05 : 0.6 + i * 0.04;
      color.valuesByMode[mode.modeId] = buildColorSystemSrgbValueV1(
        { r: channel, g: channel + 0.01, b: channel + 0.02 },
        i === 2 ? 0.9876543210987654 : 1
      );
    });
  input.colors.find(color => color.id === 'paper')!.valuesByMode = { Day: gray(1), Night: gray(0) };
  for (const [i, id] of ['warm-pale', 'warm', 'warm-deep'].entries())
    input.colors.find(color => color.id === id)!.valuesByMode.Day = gray(0.15 + i * 0.03);
  const model = buildColorSystemModelV1(input);
  const request: Mutable<ColorSystemModelInteractionsRequestV1> = {
    version: COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION,
    modelHash: model.modelHash,
    contextId: 'communications',
    modeId: 'Day',
    role: 'selected',
    scales: [
      {
        scaleId: 'blue-scale',
        slotIds: scale.slots.map(slot => slot.id),
        preference: 0,
        preferredSlotIds: { rest: 'slot:0', hover: 'slot:1', pressed: 'slot:2' },
        stateOrder: 'ascending',
      },
    ],
    surfaceColorIds: ['paper'],
    onForegroundColorIds: ['paper'],
  };
  return { input, model, request };
}
async function ready(model: unknown, request: unknown) {
  const result = await selectColorSystemModelInteractionsV1(model, request, immediate);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Expected ready');
  return result;
}
function missingValue(input: Mutable<ColorSystemModelInputV1>, colorId: string) {
  const color = input.colors.find(color => color.id === colorId)!;
  const claimId = `missing:${colorId}`;
  delete color.valuesByMode.Day;
  color.claimIds.push(claimId);
  color.valueGapClaimIdsByMode = { Day: [claimId] };
  input.claims.push({
    id: claimId,
    sourceId: color.sourceId,
    text: 'Synthetic Day numeric authority gap.',
    status: 'unsupported',
    evidenceRefs: [],
    contextIds: [],
    ruleIds: [],
    modeIds: ['Day'],
  });
  input.coverage[0].status = 'partial';
  input.coverage[0].unresolvedClaimIds.push(claimId);
}

describe('model to authored interaction selection', () => {
  it('maps fractional/nonuniform positions to ordinals and returns exact model identities and native values', async () => {
    const { model, request } = fixture();
    request.scales[0].slotIds.reverse();
    const result = await ready(model, request);
    expect(result.qualified).toBe(false);
    expect(result.referenceMeaning).toBe('internal-color-lookup-only');
    expect(result.selection.scaleId).toBe('blue-scale');
    expect(result.selection.familyId).toBe('pigments');
    expect(
      Object.values(result.selection.states).map(state => [
        state.slotId,
        state.position,
        state.colorId,
      ])
    ).toEqual([
      ['slot:0', 0.125, 'blue-pale'],
      ['slot:1', 0.12500000000001, 'blue-mid'],
      ['slot:2', 73.625, 'blue'],
    ]);
    for (const state of Object.values(result.selection.states)) {
      const color = model.colors.find(color => color.id === state.colorId)!;
      expect(state.value).toEqual(color.valuesByMode.Day);
      expect(state.provenance).toEqual({
        sourceId: color.sourceId,
        evidenceRefs: color.evidenceRefs,
        claimIds: color.claimIds,
      });
    }
    expect(result.selection.states.pressed.value.alpha).toBe(0.9876543210987654);
    expect(result.selectorReceipt.status).toBe('ready');
    if (result.selectorReceipt.status !== 'ready') throw new Error('Expected ready receipt');
    expect(
      Object.values(result.selectorReceipt.selection.states).map(state => state.position)
    ).toEqual([0, 1, 2]);
    request.scales[0].slotIds.reverse();
    expect(await ready(model, request)).toEqual(result);
  });

  it('keeps scales in one family separate and allows a preferred authored slot outside the explicit candidate subset', async () => {
    const { model, request } = fixture();
    request.scales[0].slotIds = ['slot:0', 'slot:1'];
    request.scales.push({
      ...request.scales[0],
      scaleId: 'warm-scale',
      slotIds: ['slot:0', 'slot:1', 'slot:2'],
      preference: 1,
    });
    const result = await ready(model, request);
    expect(result.selection.scaleId).toBe('warm-scale');
    expect(
      result.selectorReceipt.diagnostics.scales.map(scale => [scale.familyId, scale.scaleId])
    ).toEqual([
      ['pigments', 'blue-scale'],
      ['pigments', 'warm-scale'],
    ]);
    expect(result.selectorReceipt.diagnostics.counts.INSUFFICIENT_MEMBERS).toBe(1);
  });

  it('honors descending slot locks even when preferences favor another native default', async () => {
    const { model, request } = fixture();
    request.scales[0].stateOrder = 'descending';
    request.scales[0].preferredSlotIds = { rest: 'slot:2', hover: 'slot:1', pressed: 'slot:0' };
    request.scales[0].lockedSlotIds = { rest: 'slot:3' };
    const result = await ready(model, request);
    expect(Object.values(result.selection.states).map(state => state.slotId)).toEqual([
      'slot:3',
      'slot:1',
      'slot:0',
    ]);
    expect(result.selection.states.rest.position).toBe(Number.MAX_SAFE_INTEGER - 1);
  });

  it('cannot replace an infeasible locked source default with a nearby passing color', async () => {
    const { input, request } = fixture();
    input.colors.find(color => color.id === 'blue-pale')!.valuesByMode.Day = gray(0.95);
    const model = buildColorSystemModelV1(input);
    request.modelHash = model.modelHash;
    expect((await ready(model, request)).selection.states.rest.colorId).toBe('blue-mid');
    request.scales[0].lockedSlotIds = { rest: 'slot:0' };
    const result = await selectColorSystemModelInteractionsV1(model, request, immediate);
    expect(result.status).toBe('infeasible');
    expect(result.qualified).toBe(false);
    expect(result.selection).toBeNull();
    if (result.status !== 'infeasible') throw new Error('Expected infeasible');
    expect(result.selectorReceipt.diagnostics.lockRejectedTriples).toBe(1);
  });

  it('treats repeated source colors at separate slots as actual identical paints', async () => {
    const { input, request } = fixture();
    input.scales[0].modes.find(mode => mode.modeId === 'Day')!.anchors[1].colorId = 'blue-pale';
    const model = buildColorSystemModelV1(input);
    request.modelHash = model.modelHash;
    request.scales[0].lockedSlotIds = { rest: 'slot:0', hover: 'slot:1' };
    const result = await selectColorSystemModelInteractionsV1(model, request, immediate);
    expect(result.status).toBe('infeasible');
    if (result.status !== 'infeasible') throw new Error('Expected infeasible');
    expect(result.selectorReceipt.diagnostics.counts.IDENTICAL_RENDERED_STATES).toBe(2);
    expect(result.referenceLookup.filter(binding => binding.colorId === 'blue-pale')).toHaveLength(
      2
    );
  });

  it('uses only the explicitly requested named mode and hashes exact model changes', async () => {
    const { model, input, request } = fixture();
    const day = await ready(model, request);
    request.modeId = 'Night';
    const night = await ready(model, request);
    expect(night.selection.states.rest.value).toEqual(
      model.colors.find(color => color.id === 'blue-pale')!.valuesByMode.Night
    );
    expect(night.selection.surfaces[0].value.components.r).toBe(0);
    expect(night.requestHash).not.toBe(day.requestHash);
    const original = input.colors.find(color => color.id === 'blue-pale')!.valuesByMode.Day;
    input.colors.find(color => color.id === 'blue-pale')!.valuesByMode.Day =
      buildColorSystemSrgbValueV1(
        { ...original.components, r: original.components.r + 1e-15 },
        original.alpha
      );
    const changed = buildColorSystemModelV1(input);
    const next = await ready(changed, { ...request, modeId: 'Day', modelHash: changed.modelHash });
    expect(next.selection.states.rest.value.hex).toBe(day.selection.states.rest.value.hex);
    expect(next.selection.states.rest.value.components.r).not.toBe(
      day.selection.states.rest.value.components.r
    );
    expect(next.requestHash).not.toBe(day.requestHash);
  });

  it('returns missing requested anchors instead of silently choosing a complete alternative triple', async () => {
    const { input, request } = fixture();
    input.scales[0].modes.find(mode => mode.modeId === 'Day')!.anchors.splice(1, 1);
    const model = buildColorSystemModelV1(input);
    const result = await selectColorSystemModelInteractionsV1(
      model,
      { ...request, modelHash: model.modelHash },
      immediate
    );
    expect(result).toMatchObject({
      status: 'incomplete',
      qualified: false,
      selection: null,
      gaps: [
        {
          code: 'MISSING_SLOT_ANCHOR',
          modeId: 'Day',
          usage: 'scale',
          scaleId: 'blue-scale',
          slotId: 'slot:1',
        },
      ],
    });
    expect('selectorReceipt' in result).toBe(false);
  });

  it('reports a known scale missing the requested context-supported mode without copying another mode', async () => {
    const { input, request } = fixture();
    input.scales[0].modes = input.scales[0].modes.filter(mode => mode.modeId !== 'Night');
    input.rules.find(rule => rule.id === 'rule:partner')!.modeIds = ['Day'];
    const model = buildColorSystemModelV1(input);
    const result = await selectColorSystemModelInteractionsV1(
      model,
      { ...request, modelHash: model.modelHash, modeId: 'Night' },
      immediate
    );
    expect(result).toMatchObject({
      status: 'incomplete',
      selection: null,
      gaps: [
        { code: 'MISSING_SCALE_MODE', scaleId: 'blue-scale', modeId: 'Night', usage: 'scale' },
      ],
    });
  });

  it('retains precise numeric-gap claims for states, surfaces and labels', async () => {
    const { input, request } = fixture();
    missingValue(input, 'blue-mid');
    missingValue(input, 'paper');
    const model = buildColorSystemModelV1(input);
    const result = await selectColorSystemModelInteractionsV1(
      model,
      { ...request, modelHash: model.modelHash },
      immediate
    );
    if (result.status !== 'incomplete') throw new Error('Expected incomplete');
    expect(result.gaps).toEqual([
      {
        code: 'MISSING_COLOR_VALUE',
        modeId: 'Day',
        colorId: 'blue-mid',
        usage: 'scale',
        scaleId: 'blue-scale',
        slotId: 'slot:1',
        claimIds: ['missing:blue-mid'],
      },
      {
        code: 'MISSING_COLOR_VALUE',
        modeId: 'Day',
        colorId: 'paper',
        usage: 'surface',
        claimIds: ['missing:paper'],
      },
      {
        code: 'MISSING_COLOR_VALUE',
        modeId: 'Day',
        colorId: 'paper',
        usage: 'on-foreground',
        claimIds: ['missing:paper'],
      },
    ]);
    expect(
      (await ready(model, { ...request, modelHash: model.modelHash, modeId: 'Night' })).qualified
    ).toBe(false);
  });

  it('preserves source and working-proposal ground provenance without inferring authority from names', async () => {
    const { input, request } = fixture();
    input.sources.push({
      id: 'unprefixed-working-source',
      label: 'Synthetic working proposal',
      sourceHash: deterministicContentHash('invented proposal'),
      version: '1',
      locator: null,
      freshnessMode: 'imported-snapshot',
      status: 'draft',
    });
    input.evidence.push({
      id: 'working:evidence',
      sourceId: 'unprefixed-working-source',
      locator: null,
      status: 'inferred',
      description: 'Invented proposed paint, not original source authority.',
    });
    input.claims.push({
      id: 'working:claim',
      sourceId: 'unprefixed-working-source',
      text: 'This added ground is a working proposal.',
      status: 'inferred',
      evidenceRefs: ['working:evidence'],
      contextIds: [],
      modeIds: ['Day'],
      ruleIds: [],
    });
    input.coverage.push({
      sourceId: 'unprefixed-working-source',
      status: 'partial',
      evidenceRefs: ['working:evidence'],
      unresolvedClaimIds: [],
      note: 'Proposal only.',
    });
    input.colors.push({
      id: 'working-ground',
      label: 'Working ground',
      sourceId: 'unprefixed-working-source',
      valuesByMode: { Day: gray(0.98) },
      evidenceRefs: ['working:evidence'],
      claimIds: ['working:claim'],
    });
    const model = buildColorSystemModelV1(input);
    const result = await ready(model, {
      ...request,
      modelHash: model.modelHash,
      surfaceColorIds: ['paper', 'working-ground'],
    });
    expect(result.selection.surfaces.map(color => [color.colorId, color.provenance])).toEqual([
      [
        'paper',
        {
          sourceId: 'source:synthetic',
          evidenceRefs: ['evidence:values'],
          claimIds: ['claim:values'],
        },
      ],
      [
        'working-ground',
        {
          sourceId: 'unprefixed-working-source',
          evidenceRefs: ['working:evidence'],
          claimIds: ['working:claim'],
        },
      ],
    ]);
    expect(
      result.referenceLookup.every(binding => binding.ref.kind === 'approved-family-member')
    ).toBe(true);
    expect(result.referenceMeaning).toBe('internal-color-lookup-only');
    expect(result.qualified).toBe(false);
    const alternatives = await enumerateColorSystemModelInteractionsV1(
      model,
      { ...request, modelHash: model.modelHash, surfaceColorIds: ['paper', 'working-ground'] },
      64,
      immediate
    );
    expect(alternatives.status).toBe('ready');
    expect(
      alternatives.selections.every(
        item => canonicalJson(item.surfaces) === canonicalJson(result.selection.surfaces)
      )
    ).toBe(true);
  });

  it('replays the shared selector receipt using its detached lookup keys', async () => {
    const { model, request } = fixture();
    const result = await ready(model, request);
    const scale = model.scales.find(scale => scale.id === 'blue-scale')!;
    const forColor = (colorId: string) => {
      const binding = result.referenceLookup.find(
        binding => binding.colorId === colorId && !binding.slotId
      )!;
      return {
        ref: binding.ref,
        value: model.colors.find(color => color.id === colorId)!.valuesByMode.Day,
      };
    };
    const replay = await selectColorSystemAuthoredInteractionStatesV1(
      {
        role: request.role,
        mode: request.modeId,
        scales: [
          {
            familyId: scale.familyId,
            scaleId: scale.id,
            contributionId: `model:${model.modelHash}`,
            preference: 0,
            stateOrder: 'ascending',
            preferredPositions: { rest: 0, hover: 1, pressed: 2 },
            members: result.referenceLookup
              .filter(binding => binding.scaleId === scale.id)
              .map(binding => {
                if (binding.ref.kind !== 'approved-family-member')
                  throw new Error('Expected lookup');
                return {
                  ref: binding.ref.ref,
                  value: model.colors.find(color => color.id === binding.colorId)!.valuesByMode.Day,
                  position: scale.slots.findIndex(slot => slot.id === binding.slotId),
                  eligibleJob: 'product-semantics',
                };
              }),
          },
        ],
        surfaces: [forColor('paper')],
        onForegrounds: [forColor('paper')],
      },
      immediate
    );
    expect(replay).toEqual(result.selectorReceipt);
  });

  it('detaches model, request and returned lookup before caller hooks mutate inputs', async () => {
    const { model, request } = fixture();
    const expected = await ready(model, request);
    const modelBefore = canonicalJson(model),
      requestBefore = canonicalJson(request);
    const modelInput = structuredClone(model) as Mutable<typeof model>;
    const requestInput = structuredClone(request);
    const result = await selectColorSystemModelInteractionsV1(modelInput, requestInput, {
      isCancelled: () => {
        modelInput.colors[0].valuesByMode.Day.components.r = 1;
        requestInput.scales[0].slotIds.splice(0);
        return false;
      },
      yield: async () => {
        requestInput.modeId = 'Night';
      },
    });
    expect(result).toEqual(expected);
    if (result.status !== 'ready') throw new Error('Expected ready');
    (result.referenceLookup[0] as { colorId: string }).colorId = 'changed';
    (result.selection.states.rest.value.components as { r: number }).r = 1;
    expect(canonicalJson(model)).toBe(modelBefore);
    expect(canonicalJson(request)).toBe(requestBefore);
    expect(await ready(model, request)).toEqual(expected);
  });

  it.each(['before', 'during'] as const)(
    'cancels %s selection without partial output',
    async when => {
      const { model, request } = fixture();
      let cancelled = when === 'before';
      const yieldWork = vi.fn(async () => {
        cancelled = true;
      });
      const result = await selectColorSystemModelInteractionsV1(model, request, {
        isCancelled: () => cancelled,
        yield: yieldWork,
      });
      expect(result.status).toBe('cancelled');
      expect(result.selection).toBeNull();
      expect(result.qualified).toBe(false);
      expect(result.modelHash).toBe(model.modelHash);
      expect(result.requestHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect('selectorReceipt' in result || 'referenceLookup' in result || 'gaps' in result).toBe(
        false
      );
      expect(yieldWork).toHaveBeenCalledTimes(when === 'before' ? 0 : 1);
    }
  );

  it('does not synthesize label colors for link selection', async () => {
    const { model, request } = fixture();
    const result = await ready(model, { ...request, role: 'link', onForegroundColorIds: [] });
    expect(result.selection.onForeground).toBeNull();
    if (result.selectorReceipt.status !== 'ready') throw new Error('Expected ready receipt');
    expect(
      result.selectorReceipt.selection.pairs.every(
        pair => pair.kind === 'link-text' && pair.minimumRatio === 4.5
      )
    ).toBe(true);
  });

  it.each([
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.modelHash = deterministicContentHash('stale');
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.contextId = 'unknown';
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.modeId = 'Light';
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.scales[0].scaleId = 'unknown';
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.scales.push(r.scales[0]);
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.scales[0].slotIds.push('slot:0');
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.scales[0].slotIds.push('unknown');
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.scales[0].preferredSlotIds.hover = 'slot:0';
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.scales[0].lockedSlotIds = { rest: 'slot:3', pressed: 'slot:0' };
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.scales[0].slotIds = ['slot:0', 'slot:1', 'slot:2'];
      r.scales[0].lockedSlotIds = { pressed: 'slot:3' };
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.scales[0].preference = Infinity;
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.surfaceColorIds = [];
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.surfaceColorIds.push('paper');
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.onForegroundColorIds.push('unknown');
    },
    (r: Mutable<ColorSystemModelInteractionsRequestV1>) => {
      r.scales = Array.from({ length: 25 }, () => r.scales[0]);
    },
  ])('rejects invalid or stale requests before caller hooks (%#)', async mutate => {
    const { model, request } = fixture();
    mutate(request);
    const isCancelled = vi.fn(() => false),
      yieldWork = vi.fn(async () => undefined);
    await expect(
      selectColorSystemModelInteractionsV1(model, request, { isCancelled, yield: yieldWork })
    ).rejects.toThrow();
    expect(isCancelled).not.toHaveBeenCalled();
    expect(yieldWork).not.toHaveBeenCalled();
  });

  it('rejects undeclared context modes, negative source positions and translucent grounds without inference', async () => {
    const { input, model, request } = fixture();
    input.contexts.find(context => context.id === 'interface')!.modeIds = ['Day'];
    input.rules.find(rule => rule.id === 'rule:role')!.modeIds = ['Day'];
    const limited = buildColorSystemModelV1(input);
    await expect(
      selectColorSystemModelInteractionsV1(
        limited,
        { ...request, modelHash: limited.modelHash, contextId: 'interface', modeId: 'Night' },
        immediate
      )
    ).rejects.toThrow(/Context and mode/);
    const negative = structuredClone(model) as Mutable<typeof model>;
    negative.scales[0].slots[0].position = -0.125;
    await expect(
      selectColorSystemModelInteractionsV1(negative, request, immediate)
    ).rejects.toThrow();
    input.colors.find(color => color.id === 'paper')!.valuesByMode.Day =
      buildColorSystemSrgbValueV1({ r: 1, g: 1, b: 1 }, 0.9);
    const translucent = buildColorSystemModelV1(input);
    const hook = vi.fn(() => false);
    await expect(
      selectColorSystemModelInteractionsV1(
        translucent,
        { ...request, modelHash: translucent.modelHash },
        { isCancelled: hook, yield: async () => undefined }
      )
    ).rejects.toThrow(/opaque/);
    expect(hook).not.toHaveBeenCalled();
  });

  it('rejects getters, decorated/sparse/subclassed arrays and unknown fields without execution', async () => {
    const { model, request } = fixture();
    const getter = vi.fn(() => 'communications');
    const variants: unknown[] = [
      Object.defineProperty({ ...request }, 'contextId', { enumerable: true, get: getter }),
      { ...request, primary: 'blue' },
      { ...request, scales: [{ ...request.scales[0], modeId: 'Night' }] },
      { ...request, surfaceColorIds: new Array(1) },
      { ...request, onForegroundColorIds: Object.assign(['paper'], { extra: true }) },
      { ...request, surfaceColorIds: new (class extends Array<string> {})('paper') },
      {
        ...request,
        scales: [
          {
            ...request.scales[0],
            preferredSlotIds: Object.defineProperty({}, 'rest', { enumerable: true, get: getter }),
          },
        ],
      },
      Object.assign(Object.create({ inherited: true }), request),
      { ...request, role: { toString: getter } },
    ];
    for (const value of variants) {
      const hook = vi.fn(() => false);
      await expect(
        selectColorSystemModelInteractionsV1(model, value, {
          isCancelled: hook,
          yield: async () => undefined,
        })
      ).rejects.toThrow();
      expect(hook).not.toHaveBeenCalled();
    }
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('coherent model interaction alternatives', () => {
  it('retains every eligible triple and passing foreground with exact source coordinates and values', async () => {
    const f = fixture();
    f.input.colors.find(color => color.id === 'ink')!.valuesByMode.Day = gray(0.95);
    f.model = buildColorSystemModelV1(f.input);
    f.request.modelHash = f.model.modelHash;
    f.request.onForegroundColorIds = ['paper', 'ink'];
    const result = await enumerateColorSystemModelInteractionsV1(f.model, f.request, 64, immediate);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected complete alternatives');
    expect(result.totalEligibleSelections).toBe(8);
    expect(result.selections).toHaveLength(8);
    expect(result.complete).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.qualified).toBe(false);
    expect(new Set(result.selections.map(selection => selection.onForeground!.colorId))).toEqual(
      new Set(['paper', 'ink'])
    );
    const triples = new Set<string>();
    for (const selection of result.selections) {
      expect(selection.scaleId).toBe('blue-scale');
      expect(selection.familyId).toBe('pigments');
      triples.add(canonicalJson(Object.values(selection.states).map(state => state.slotId)));
      for (const state of Object.values(selection.states)) {
        const color = f.model.colors.find(color => color.id === state.colorId)!;
        expect(state.value).toEqual(color.valuesByMode.Day);
        expect(state.position).toBe(
          f.model.scales[0].slots.find(slot => slot.id === state.slotId)!.position
        );
        expect(state.provenance).toEqual({
          sourceId: color.sourceId,
          evidenceRefs: color.evidenceRefs,
          claimIds: color.claimIds,
        });
      }
    }
    expect(triples.size).toBe(4);
    expect(result.requestHash).toBe(
      deterministicContentHash(canonicalJson({ request: f.request, maximumSelections: 64 }))
    );
    expect(
      await enumerateColorSystemModelInteractionsV1(f.model, f.request, 64, immediate)
    ).toEqual(result);
  });

  it('preserves deterministic top-K order and reports omitted eligible selections instead of false completeness', async () => {
    const { model, request } = fixture();
    const full = await enumerateColorSystemModelInteractionsV1(model, request, 64, immediate);
    const limited = await enumerateColorSystemModelInteractionsV1(model, request, 1, immediate);
    expect(full.status).toBe('ready');
    expect(limited.status).toBe('ready');
    expect(limited.selections).toEqual(full.selections.slice(0, 1));
    expect(limited.totalEligibleSelections).toBe(4);
    expect(limited.complete).toBe(false);
    expect(limited.truncated).toBe(true);
    expect(limited.requestHash).not.toBe(full.requestHash);
    const single = await ready(model, request);
    expect(limited.selections[0]).toEqual(single.selection);
    expect(limited.requestHash).not.toBe(single.requestHash);
  });

  it('keeps related scales separate and retains all explicit locks in ascending and descending orders', async () => {
    const f = fixture();
    f.input.scales.push({
      ...structuredClone(f.input.scales[0]),
      id: 'related-scale',
      label: 'Another authored scale',
    });
    f.model = buildColorSystemModelV1(f.input);
    f.request.modelHash = f.model.modelHash;
    f.request.scales[0].lockedSlotIds = { rest: 'slot:1' };
    f.request.scales.push({
      ...f.request.scales[0],
      scaleId: 'related-scale',
      preference: 1,
      stateOrder: 'descending',
      preferredSlotIds: { rest: 'slot:3', hover: 'slot:2', pressed: 'slot:1' },
      lockedSlotIds: { rest: 'slot:3', pressed: 'slot:1' },
    });
    const result = await enumerateColorSystemModelInteractionsV1(f.model, f.request, 64, immediate);
    expect(result.status).toBe('ready');
    expect(result.selections).toHaveLength(2);
    expect(result.totalEligibleSelections).toBe(2);
    expect(result.complete).toBe(true);
    expect(result.selections.map(item => item.scaleId)).toEqual(['blue-scale', 'related-scale']);
    expect(result.selections[0].states.rest.slotId).toBe('slot:1');
    expect(Object.values(result.selections[1].states).map(state => state.slotId)).toEqual([
      'slot:3',
      'slot:2',
      'slot:1',
    ]);
  });

  it('does not relax an infeasible exact lock to a nearby feasible default', async () => {
    const f = fixture();
    f.input.colors.find(color => color.id === 'blue-pale')!.valuesByMode.Day = gray(1);
    f.model = buildColorSystemModelV1(f.input);
    f.request.modelHash = f.model.modelHash;
    expect(
      (await enumerateColorSystemModelInteractionsV1(f.model, f.request, 64, immediate)).status
    ).toBe('ready');
    f.request.scales[0].lockedSlotIds = { rest: 'slot:0' };
    const locked = await enumerateColorSystemModelInteractionsV1(f.model, f.request, 64, immediate);
    expect(locked).toMatchObject({
      status: 'infeasible',
      selections: [],
      totalEligibleSelections: 0,
      complete: true,
      truncated: false,
      qualified: false,
    });
  });

  it('retains link alternatives without inventing on-foreground choices', async () => {
    const { model, request } = fixture();
    request.role = 'link';
    const result = await enumerateColorSystemModelInteractionsV1(model, request, 64, immediate);
    expect(result.status).toBe('ready');
    expect(result.totalEligibleSelections).toBe(4);
    expect(result.selections.every(selection => selection.onForeground === null)).toBe(true);
  });

  it('replays each shared-kernel alternative from detached lookup records', async () => {
    const { model, request } = fixture();
    const result = await enumerateColorSystemModelInteractionsV1(model, request, 64, immediate);
    if (result.status !== 'ready') throw new Error('Expected alternatives');
    const scale = model.scales[0];
    const color = (colorId: string) => ({
      ref: result.referenceLookup.find(binding => binding.colorId === colorId && !binding.slotId)!
        .ref,
      value: model.colors.find(color => color.id === colorId)!.valuesByMode.Day,
    });
    const replay = await enumerateColorSystemAuthoredInteractionStatesV1(
      {
        role: request.role,
        mode: request.modeId,
        scales: [
          {
            familyId: scale.familyId,
            scaleId: scale.id,
            contributionId: `model:${model.modelHash}`,
            preference: 0,
            stateOrder: 'ascending',
            preferredPositions: { rest: 0, hover: 1, pressed: 2 },
            members: result.referenceLookup
              .filter(binding => binding.scaleId === scale.id)
              .map(binding => {
                if (binding.ref.kind !== 'approved-family-member')
                  throw new Error('Expected lookup');
                return {
                  ref: binding.ref.ref,
                  value: model.colors.find(color => color.id === binding.colorId)!.valuesByMode.Day,
                  position: scale.slots.findIndex(slot => slot.id === binding.slotId),
                  eligibleJob: 'product-semantics',
                };
              }),
          },
        ],
        surfaces: [color('paper')],
        onForegrounds: [color('paper')],
      },
      64,
      immediate
    );
    expect(replay).toEqual(result.enumerationReceipt);
  });

  it('reports missing mode values before enumeration without silently selecting another member', async () => {
    const { input, request } = fixture();
    missingValue(input, 'blue');
    const model = buildColorSystemModelV1(input);
    request.modelHash = model.modelHash;
    const hook = vi.fn(async () => {});
    const result = await enumerateColorSystemModelInteractionsV1(model, request, 64, {
      ...immediate,
      yield: hook,
    });
    expect(result).toMatchObject({
      status: 'incomplete',
      selections: [],
      totalEligibleSelections: null,
      complete: false,
      truncated: false,
      gaps: [expect.objectContaining({ colorId: 'blue', code: 'MISSING_COLOR_VALUE' })],
    });
    expect('enumerationReceipt' in result).toBe(false);
    expect(hook).not.toHaveBeenCalled();
  });

  it('detaches source/request before hooks and clears early or mid-enumeration cancellation results', async () => {
    const f = fixture();
    const expected = await enumerateColorSystemModelInteractionsV1(
      f.model,
      f.request,
      64,
      immediate
    );
    const incoming = structuredClone(f);
    const replay = await enumerateColorSystemModelInteractionsV1(
      incoming.model,
      incoming.request,
      64,
      {
        isCancelled: () => false,
        yield: async () => {
          incoming.request.scales[0].slotIds = [];
          Object.assign(incoming.model.colors[0].valuesByMode.Day.components, { r: 0 });
        },
      }
    );
    expect(replay).toEqual(expected);
    for (const early of [true, false]) {
      let cancelled = early;
      const result = await enumerateColorSystemModelInteractionsV1(f.model, f.request, 64, {
        isCancelled: () => cancelled,
        yield: async () => {
          cancelled = true;
        },
      });
      expect(result).toMatchObject({
        status: 'cancelled',
        selections: [],
        totalEligibleSelections: null,
        complete: false,
        truncated: false,
      });
      expect('enumerationReceipt' in result).toBe(false);
      expect('referenceLookup' in result).toBe(false);
    }
    if (replay.status !== 'ready') throw new Error('Expected alternatives');
    Object.assign(replay.selections[0].states.rest.value.components, { r: 0 });
    expect(
      await enumerateColorSystemModelInteractionsV1(f.model, f.request, 64, immediate)
    ).toEqual(expected);
  });

  it.each([0, -1, 1.5, 65, NaN, Infinity, '2', null])(
    'rejects invalid alternative cap %s before hooks',
    async maximum => {
      const { model, request } = fixture();
      const hook = vi.fn(() => false);
      await expect(
        enumerateColorSystemModelInteractionsV1(model, request, maximum as number, {
          isCancelled: hook,
          yield: async () => {},
        })
      ).rejects.toThrow(/Maximum selections/);
      expect(hook).not.toHaveBeenCalled();
    }
  );

  it('rejects hostile data and stale source hashes before hooks through the shared parser', async () => {
    const { model, request } = fixture();
    const hook = vi.fn(() => false),
      getter = vi.fn();
    for (const input of [
      { ...request, modelHash: deterministicContentHash('stale') },
      { ...request, selection: {} },
      Object.defineProperty({ ...request }, 'contextId', { enumerable: true, get: getter }),
      { ...request, scales: Object.assign([...request.scales], { callback: getter }) },
    ])
      await expect(
        enumerateColorSystemModelInteractionsV1(model, input, 64, {
          isCancelled: hook,
          yield: async () => {},
        })
      ).rejects.toThrow();
    expect(hook).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });
});
