import { describe, expect, it, vi } from 'vitest';
import {
  compileColorSystemCatalogProposalV1,
  COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
  type ColorSystemCatalogProposalIntentV1,
  type ColorSystemCatalogProposalRequestV1,
} from '../colorSystemCatalogProposalV1';
import { buildColorSystemModelV1, type ColorSystemModelInputV1 } from '../colorSystemModelV1';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import {
  buildColorSystemSrgbValueV1,
  colorSystemExactSrgbValueHashV1,
} from '../colorSystemSrgbValueV1';
import { isExactRadixScale, RADIX_COLORS_VERSION } from '../radixColors';
import {
  syntheticColorSystemModelInputV1,
  syntheticColorSystemModelV1,
} from './fixtures/colorSystemModelV1Fixture';

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};
const execution = { isCancelled: () => false, yield: async () => {} };
const exactHash = (value: unknown) => deterministicContentHash(canonicalJson(value));

function fixture(model = syntheticColorSystemModelV1()) {
  const request: Mutable<ColorSystemCatalogProposalRequestV1> = {
    version: COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
    sourceModelHash: model.modelHash,
    contextId: 'communications',
    anchorRefs: ['blue-deep', 'warm'].flatMap(colorId =>
      ['Day', 'Night'].map(modeId => {
        const value = model.colors.find(color => color.id === colorId)!.valuesByMode[modeId];
        return {
          colorId,
          modeId,
          valueHash: colorSystemExactSrgbValueHashV1(value.components, value.alpha),
        };
      })
    ),
    providers: ['wada', 'werner', 'radix'],
    limitPerProvider: 1,
    radix: {
      category: 'either',
      modes: [
        { modeId: 'Day', scheme: 'light' },
        { modeId: 'Night', scheme: 'dark' },
      ],
    },
    historicalModes: [
      { modeId: 'Day', sourceMode: 'static' },
      { modeId: 'Night', sourceMode: 'static' },
    ],
  };
  const intent: Mutable<ColorSystemCatalogProposalIntentV1> = {
    version: COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
    id: 'catalog-fixture',
    sourceModelHash: model.modelHash,
    brief: {
      briefHash: deterministicContentHash('synthetic catalog extension'),
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
  };
  return { model, request, intent };
}
async function ready(model: unknown, request: unknown, hook = execution) {
  const result = await compileColorSystemCatalogProposalV1(model, request, hook);
  if (result.status !== 'ready') throw new Error(JSON.stringify(result));
  return result;
}

describe('recomputed catalog proposals', () => {
  it('materializes complete Wada combinations and singleton Werner references with honest provenance', async () => {
    const { model, request, intent } = fixture();
    const session = await ready(model, request);
    for (const candidate of session.retrieval.candidates) {
      if (candidate.kind === 'radix-family') continue;
      const result = session.materialize(candidate.id, intent);
      const original =
        candidate.kind === 'wada-combination' ? candidate.members : [candidate.member];
      expect(result.qualified).toBe(false);
      expect(result.proposal.derivationStatus).toBe('declared-not-recomputed');
      expect(result.provenance).toEqual(candidate.provenance);
      expect(result.provenance.classification).toBe('digital-approximation');
      expect(result.binding.scaleId).toBeNull();
      expect(result.proposal.request.scales).toEqual([]);
      expect(result.proposal.request.colors).toHaveLength(original.length);
      expect(result.proposal.request.families[0].colorIds).toEqual(
        result.binding.members.map(member => member.colorId)
      );
      for (const [index, member] of original.entries()) {
        const color = result.proposal.request.colors.find(
          item => item.id === result.binding.members[index].colorId
        )!;
        expect(color.valuesByMode).toEqual({ Day: member.value, Night: member.value });
        expect(result.binding.members[index].modes).toEqual(
          ['Day', 'Night'].map(modeId => ({
            modeId,
            catalogMemberId: member.id,
            valueHash: colorSystemExactSrgbValueHashV1(member.value.components, member.value.alpha),
          }))
        );
      }
      expect(result.proposal.sourceAssessmentModel.families).toEqual(model.families);
      expect(result.proposal.sourceAssessmentModel.rules).toEqual(model.rules);
      expect(result.proposal.sourceAssessmentModel.adoptions).toEqual(model.adoptions);
      expect(
        result.proposal.workingModel.colors.filter(color =>
          model.colors.some(source => source.id === color.id)
        )
      ).toEqual(model.colors);
      const { receiptHash, ...receipt } = result.catalog;
      expect(receiptHash).toBe(exactHash(receipt));
      expect(result.proposal.request.derivation.provider).toMatchObject({
        id: candidate.provider,
        candidateHash: candidate.candidateHash,
        catalogHash: candidate.provenance.catalogHash,
      });
    }
  });

  it('materializes all twelve unchanged Radix steps in explicitly mapped authored modes', async () => {
    const { model, request, intent } = fixture();
    const session = await ready(model, request);
    const candidate = session.retrieval.candidates.find(item => item.kind === 'radix-family')!;
    if (candidate.kind !== 'radix-family') throw new Error('Unexpected provider');
    const result = session.materialize(candidate.id, intent);
    expect(result.binding.members).toHaveLength(12);
    expect(result.proposal.request.colors).toHaveLength(12);
    expect(result.provenance.classification).toBe('exact-library');
    const scale = result.proposal.workingModel.scales.find(
      item => item.id === result.binding.scaleId
    )!;
    expect(scale.familyId).toBe(result.binding.familyId);
    expect(scale.slots).toHaveLength(12);
    for (const [modeId, scheme] of [
      ['Day', 'light'],
      ['Night', 'dark'],
    ] as const) {
      const anchors = scale.modes.find(mode => mode.modeId === modeId)!.anchors;
      expect(anchors).toHaveLength(12);
      const steps = anchors.map((anchor, index) => {
        expect(anchor).toEqual({
          slotId: result.binding.members[index].slotId,
          colorId: result.binding.members[index].colorId,
        });
        const value = result.proposal.workingModel.colors.find(
          color => color.id === anchor.colorId
        )!.valuesByMode[modeId];
        expect(value).toEqual(candidate.schemes[scheme][index].value);
        return { step: index + 1, hex: value.hex };
      });
      expect(isExactRadixScale(RADIX_COLORS_VERSION, candidate.family, scheme, steps)).toBe(true);
    }
    expect(
      result.proposal.workingModel.scales.filter(item =>
        model.scales.some(source => source.id === item.id)
      )
    ).toEqual(model.scales);
    expect(result.proposal.request.derivation.sourceColorIds).toEqual(['blue-deep', 'warm']);
    expect(result.proposal.request.derivation.sourceScaleIds).toEqual([]);
  });

  it('extends only an explicitly permitted family, preserves pins, and requires fresh affected decisions', async () => {
    const { model, request, intent } = fixture();
    const session = await ready(model, request);
    const candidate = session.retrieval.candidates.find(item => item.provider === 'radix')!;
    intent.targetFamilyId = 'pigments';
    intent.brief.permissions.editFamilyIds = ['pigments'];
    intent.brief.permissions.addFamilies = false;
    const first = session.materialize(candidate.id, intent);
    expect(first.binding.familyId).toBe('pigments');
    expect(first.proposal.sourceAssessmentModel.families).toEqual(model.families);
    expect(first.proposal.sourceAssessmentModel.adoptions).toEqual(model.adoptions);
    expect(first.proposal.workingModel.families[0].colorIds).toEqual(
      expect.arrayContaining([...model.families[0].colorIds])
    );
    expect(
      first.proposal.workingModel.scales.filter(scale =>
        model.scales.some(source => source.id === scale.id)
      )
    ).toEqual(model.scales);
    expect(first.proposal.pendingRuleIds).toContain('rule:palette');
    expect(
      first.proposal.workingModel.adoptions.some(adoption => adoption.ruleId === 'rule:palette')
    ).toBe(false);
    intent.review = {
      reviewedProposalHash: first.proposal.proposalHash,
      decisions: first.proposal.pendingRuleIds.map(ruleId => ({
        ruleId,
        status: 'accepted',
        actor: { kind: 'agent', ref: 'synthetic-reviewer' },
        authorityRef: 'synthetic:extension',
        decisionRef: 'synthetic:reviewed-catalog',
      })),
    };
    const reviewed = session.materialize(candidate.id, intent);
    expect(reviewed.proposal.reviewStatus).toBe('current');
    expect(reviewed.proposal.pendingRuleIds).toEqual([]);
    expect(reviewed.proposal.proposalHash).toBe(first.proposal.proposalHash);
    request.radix!.modes[0].scheme = 'dark';
    request.limitPerProvider = 8;
    const changed = await ready(model, request);
    const stale = changed.materialize(candidate.id, intent);
    expect(stale.proposal.reviewStatus).toBe('stale');
    expect(stale.proposal.pendingRuleIds).toContain('rule:palette');
    expect(
      stale.proposal.workingModel.adoptions.some(adoption => adoption.ruleId === 'rule:palette')
    ).toBe(false);
  });

  it.each(['addColors', 'addFamilies', 'addScales', 'editFamilyIds', 'apply'] as const)(
    'rejects missing %s authority',
    async missing => {
      const { model, request, intent } = fixture();
      const session = await ready(model, request);
      const candidate = session.retrieval.candidates.find(item => item.provider === 'radix')!;
      if (missing === 'apply') intent.brief.operation = 'apply';
      else if (missing === 'editFamilyIds') intent.targetFamilyId = 'pigments';
      else intent.brief.permissions[missing] = false;
      expect(() => session.materialize(candidate.id, intent)).toThrow(
        /permit|permission|Apply|authorized/
      );
    }
  );

  it('rejects stale source and exact anchor hashes before catalog work', async () => {
    const { model, request } = fixture();
    const yieldHook = vi.fn(async () => {});
    const stale = deterministicContentHash('stale');
    for (const incoming of [
      { ...request, sourceModelHash: stale },
      { ...request, anchorRefs: [{ ...request.anchorRefs[0], valueHash: stale }] },
    ]) {
      const result = await compileColorSystemCatalogProposalV1(model, incoming, {
        ...execution,
        yield: yieldHook,
      });
      expect(result).toMatchObject({ status: 'invalid-query', qualified: false });
      if (result.status !== 'invalid-query') throw new Error('Unexpected status');
      expect(result.message).toMatch(/stale/);
    }
    expect(yieldHook).not.toHaveBeenCalled();
    const session = await ready(model, request);
    expect(() =>
      session.materialize(session.retrieval.candidates[0].id, {
        ...fixture().intent,
        sourceModelHash: stale,
      })
    ).toThrow('Source model is stale');
  });

  it('rejects missing native authority and translucent anchors instead of substituting display hex', async () => {
    const { model, request } = fixture();
    const translucent = model.colors.find(color => color.id === 'blue')!.valuesByMode.Day;
    request.anchorRefs = [
      {
        colorId: 'blue',
        modeId: 'Day',
        valueHash: colorSystemExactSrgbValueHashV1(translucent.components, translucent.alpha),
      },
    ];
    request.historicalModes = [{ modeId: 'Day', sourceMode: 'static' }];
    request.radix!.modes = [{ modeId: 'Day', scheme: 'light' }];
    const rejected = await compileColorSystemCatalogProposalV1(model, request, execution);
    expect(rejected.status).toBe('invalid-query');
    if (rejected.status !== 'invalid-query') throw new Error('Unexpected outcome');
    expect(rejected.message).toMatch(/opaque|translucent|ground/);
    const input = structuredClone(
      syntheticColorSystemModelInputV1()
    ) as Mutable<ColorSystemModelInputV1>;
    input.adoptions = [];
    const blue = input.colors.find(color => color.id === 'blue')!;
    delete blue.valuesByMode.Day;
    blue.valueGapClaimIdsByMode = { Day: ['gap:blue'] };
    blue.claimIds.push('gap:blue');
    input.claims.push({
      id: 'gap:blue',
      sourceId: blue.sourceId,
      text: 'No exact Day channels.',
      status: 'unresolved',
      evidenceRefs: [...blue.evidenceRefs],
      contextIds: [],
      ruleIds: [],
      modeIds: ['Day'],
    });
    input.coverage[0].unresolvedClaimIds.push('gap:blue');
    const gapModel = buildColorSystemModelV1(input);
    const gap = await compileColorSystemCatalogProposalV1(
      gapModel,
      { ...request, sourceModelHash: gapModel.modelHash },
      execution
    );
    expect(gap).toMatchObject({
      status: 'invalid-query',
      message: expect.stringContaining('lacks an exact value'),
    });
  });

  it('requires explicit complete source mode mappings and exact context/mode materialization scope', async () => {
    const { model, request, intent } = fixture();
    for (const incoming of [
      { ...request, historicalModes: undefined },
      { ...request, historicalModes: [{ modeId: 'Day', sourceMode: 'static' }] },
      { ...request, radix: undefined },
      { ...request, contextId: 'unknown' },
      { ...request, anchorRefs: [{ ...request.anchorRefs[0], modeId: 'unknown' }] },
      { ...request, radix: { ...request.radix!, modes: [{ modeId: 'Day', scheme: 'light' }] } },
    ])
      expect((await compileColorSystemCatalogProposalV1(model, incoming, execution)).status).toBe(
        'invalid-query'
      );
    const session = await ready(model, request);
    const candidateId = session.retrieval.candidates[0].id;
    for (const scope of [{ contextIds: ['interface'] }, { modeIds: ['Day'] }]) {
      expect(() =>
        session.materialize(candidateId, { ...intent, brief: { ...intent.brief, ...scope } })
      ).toThrow('exact retrieval context and mode scope');
    }
    expect(() =>
      session.materialize(candidateId, { ...intent, targetFamilyId: 'unknown' })
    ).toThrow('existing authored family');
  });

  it('uses only requested modes and preserves fractional native identity below ordinary hash rounding', async () => {
    const make = (r: number) => {
      const input = structuredClone(
        syntheticColorSystemModelInputV1()
      ) as Mutable<ColorSystemModelInputV1>;
      input.adoptions = [];
      input.colors.find(color => color.id === 'blue-deep')!.valuesByMode.Day =
        buildColorSystemSrgbValueV1({ r, g: 0.5, b: 0.75 });
      const data = fixture(buildColorSystemModelV1(input));
      data.request.anchorRefs = data.request.anchorRefs.filter(ref => ref.modeId === 'Day');
      data.request.historicalModes = [{ modeId: 'Day', sourceMode: 'static' }];
      data.request.radix!.modes = [{ modeId: 'Day', scheme: 'dark' }];
      data.intent.brief.modeIds = ['Day'];
      return data;
    };
    const a = make(0.123456789012341),
      b = make(0.123456789012342);
    const first = await ready(a.model, a.request),
      second = await ready(b.model, b.request);
    expect(first.catalog.queryHash).not.toBe(second.catalog.queryHash);
    expect(first.catalog.receiptHash).not.toBe(second.catalog.receiptHash);
    const result = first.materialize(first.retrieval.candidates[0].id, a.intent);
    expect(
      result.proposal.request.colors.every(
        color => Object.keys(color.valuesByMode).join() === 'Day'
      )
    ).toBe(true);
    const staleRef = { ...b.request, anchorRefs: a.request.anchorRefs };
    expect((await compileColorSystemCatalogProposalV1(b.model, staleRef, execution)).status).toBe(
      'invalid-query'
    );
  });

  it('rejects caller colors, structures, derivation and executable nested inputs without invoking accessors', async () => {
    const { model, request, intent } = fixture();
    const getter = vi.fn(() => 'blue-deep');
    const accessorRequest = structuredClone(request);
    Object.defineProperty(accessorRequest.anchorRefs[0], 'colorId', {
      enumerable: true,
      get: getter,
    });
    expect(
      (await compileColorSystemCatalogProposalV1(model, accessorRequest, execution)).status
    ).toBe('invalid-query');
    expect(
      (await compileColorSystemCatalogProposalV1(model, { ...request, colors: [] }, execution))
        .status
    ).toBe('invalid-query');
    expect(getter).not.toHaveBeenCalled();
    const session = await ready(model, request);
    const candidateId = session.retrieval.candidates[0].id;
    for (const forbidden of ['colors', 'families', 'scales', 'rules', 'derivation']) {
      expect(() => session.materialize(candidateId, { ...intent, [forbidden]: [] })).toThrow(
        /unknown fields|caller output/
      );
    }
    Object.defineProperty(intent.brief.permissions, 'addColors', { enumerable: true, get: getter });
    expect(() => session.materialize(candidateId, intent)).toThrow(/accessors/i);
    expect(getter).not.toHaveBeenCalled();
  });

  it('isolates incoming async mutations and every returned artifact from its private materializer', async () => {
    const { model, request, intent } = fixture();
    const expectedSession = await ready(model, request);
    const candidateId = expectedSession.retrieval.candidates.find(
      candidate => candidate.provider === 'radix'
    )!.id;
    const expected = expectedSession.materialize(candidateId, intent);
    const incoming = structuredClone({ model, request });
    const session = await ready(incoming.model, incoming.request, {
      ...execution,
      yield: async () => {
        Object.assign(incoming.model.colors[0].valuesByMode.Day.components, { r: 0 });
        incoming.request.providers = [];
        incoming.request.radix!.modes[0].scheme = 'dark';
        incoming.request.anchorRefs[0].valueHash = 'forged';
      },
    });
    expect(session.catalog).toEqual(expectedSession.catalog);
    const display = session.retrieval.candidates.find(candidate => candidate.id === candidateId)!;
    if (display.kind !== 'radix-family') throw new Error('Unexpected provider');
    display.id = 'forged';
    display.provenance.catalogHash = 'forged';
    Object.assign(display.schemes.light[0].value.components, { r: 0 });
    Object.assign(session.catalog.request.radix!.modes[0], { scheme: 'dark' });
    Object.assign(session.catalog, { receiptHash: 'forged' });
    Object.assign(session.retrieval, { queryHash: 'forged' });
    const result = session.materialize(candidateId, intent);
    expect(result).toEqual(expected);
    Object.assign(result.proposal.request.colors[0].valuesByMode.Day.components, { r: 0 });
    Object.assign(result.binding.members[0], { colorId: 'forged' });
    Object.assign(result.catalog, { receiptHash: 'forged' });
    Object.assign(result.provenance, { sourceVersion: 'forged' });
    expect(session.materialize(candidateId, intent)).toEqual(expected);
    expect(() => session.materialize('forged', intent)).toThrow('not present');
  });

  it('ablates actual proposal colors and never substitutes or combines disabled providers', async () => {
    const { model, request, intent } = fixture();
    const full = await ready(model, request);
    const withoutWada = await ready(model, { ...request, providers: ['werner', 'radix'] });
    const wada = full.retrieval.candidates.find(candidate => candidate.provider === 'wada')!;
    expect(() => withoutWada.materialize(wada.id, intent)).toThrow('enabled retrieval');
    for (const candidate of withoutWada.retrieval.candidates) {
      const a = full.materialize(candidate.id, intent),
        b = withoutWada.materialize(candidate.id, intent);
      expect(a.proposal.request.colors).toEqual(b.proposal.request.colors);
      expect(a.binding).toEqual(b.binding);
      expect(b.proposal.request.derivation.provider!.id).toBe(candidate.provider);
    }
    const none = await ready(model, { ...request, providers: [] });
    expect(none.retrieval.candidates).toEqual([]);
    expect(() => none.materialize(wada.id, intent)).toThrow('not present');
  });

  it('replays the same receipts and proposals after nonsemantic query reordering', async () => {
    const { model, request, intent } = fixture();
    const first = await ready(model, request);
    request.anchorRefs.reverse();
    request.providers.reverse();
    request.radix!.modes.reverse();
    request.historicalModes = [...request.historicalModes!].reverse();
    const second = await ready(model, request);
    expect(second.catalog).toEqual(first.catalog);
    expect(second.retrieval).toEqual(first.retrieval);
    for (const candidate of first.retrieval.candidates) {
      expect(second.materialize(candidate.id, intent)).toEqual(
        first.materialize(candidate.id, intent)
      );
    }
  });

  it('returns cancellation without a materializer or partial candidates', async () => {
    const { model, request } = fixture();
    let cancelled = false;
    for (const hook of [
      { isCancelled: () => true, yield: async () => {} },
      {
        isCancelled: () => cancelled,
        yield: async () => {
          cancelled = true;
        },
      },
    ]) {
      const result = await compileColorSystemCatalogProposalV1(model, request, hook);
      expect(result).toMatchObject({
        status: 'cancelled',
        qualified: false,
        retrieval: { candidates: [] },
      });
      expect('materialize' in result).toBe(false);
    }
  });

  it('enforces combined model limits through the shared materializer', async () => {
    const input = structuredClone(
      syntheticColorSystemModelInputV1()
    ) as Mutable<ColorSystemModelInputV1>;
    input.adoptions = [];
    input.colors.push(
      ...Array.from({ length: 247 }, (_, index) => ({
        ...input.colors[0],
        id: `additional-${index}`,
      }))
    );
    const { model, request, intent } = fixture(buildColorSystemModelV1(input));
    const session = await ready(model, request);
    expect(() => session.materialize(session.retrieval.candidates[0].id, intent)).toThrow(
      /256|bound|size/
    );
  });
});
