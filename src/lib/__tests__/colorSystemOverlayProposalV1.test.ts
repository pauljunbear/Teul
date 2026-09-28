import { describe, expect, it, vi } from 'vitest';
import {
  buildColorSystemOverlayProposalV1,
  COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION,
  type ColorSystemOverlayProposalRequestV1,
} from '../colorSystemOverlayProposalV1';
import { buildColorSystemModelV1, type ColorSystemModelInputV1 } from '../colorSystemModelV1';
import {
  COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
  type ColorSystemConstructionBriefV1,
} from '../colorSystemConstructionV1';
import { COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION } from '../colorSystemConstructionProposalV1';
import {
  compileColorSystemCatalogProposalV1,
  COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
  type ColorSystemCatalogProposalRequestV1,
} from '../colorSystemCatalogProposalV1';
import { COLOR_SYSTEM_PROPOSAL_V1_VERSION } from '../colorSystemProposalV1';
import { colorSystemExactSrgbValueHashV1 } from '../colorSystemSrgbValueV1';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';

const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const runtime = { isCancelled: () => false, yield: async () => {} };
type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};
const copy = <T>(value: T) => structuredClone(value) as Mutable<T>;

async function fixture(provider: 'werner' | 'wada' = 'werner', extraGapCount = 0) {
  const original = syntheticColorSystemModelInputV1();
  const input: ColorSystemModelInputV1 = {
    ...original,
    rules: [],
    adoptions: [],
    claims: original.claims.map(claim => ({ ...claim, ruleIds: [] })),
    scales: original.scales.map(scale =>
      scale.id === 'blue-scale'
        ? {
            ...scale,
            slots: [
              ...scale.slots,
              { id: 'gap-a', position: 1.5 },
              { id: 'gap-b', position: 2.5 },
              { id: 'outer', position: 4 },
              ...Array.from({ length: extraGapCount }, (_, index) => ({
                id: `extra-gap-${index}`,
                position: 5 + index,
              })),
            ].sort((a, b) => a.position - b.position),
          }
        : scale
    ),
  };
  const source = buildColorSystemModelV1(input);
  const brief: ColorSystemOverlayProposalRequestV1['brief'] = {
    briefHash: hash('two-mode refinement'),
    operation: 'extend',
    contextIds: ['interface'],
    modeIds: ['Day', 'Night'],
    permissions: {
      addColors: true,
      addFamilies: true,
      addScales: true,
      addRules: true,
      editFamilyIds: ['pigments'],
      editScaleIds: ['blue-scale'],
      replaceRuleIds: [],
    },
  };
  const construction: ColorSystemConstructionBriefV1 = {
    schemaVersion: COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
    modelHash: source.modelHash,
    contextId: 'interface',
    changeMode: 'extend',
    decision: {
      actor: { kind: 'agent', ref: 'fixture' },
      authorityRef: 'synthetic:brief',
      decisionRef: 'synthetic:fill-gaps',
    },
    scales: ['Day', 'Night'].map(modeId => ({
      scaleId: 'blue-scale',
      modeId,
      requiredSlotIds: ['gap-a', 'gap-b'],
      fillSlotIds: ['gap-a', 'gap-b'],
      lightnessOrder: 'none',
      endpoints: [],
    })),
  };
  const query: ColorSystemCatalogProposalRequestV1 = {
    version: COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
    sourceModelHash: source.modelHash,
    contextId: 'interface',
    providers: [provider],
    limitPerProvider: 2,
    anchorRefs: ['Day', 'Night'].map(modeId => {
      const value = source.colors.find(color => color.id === 'warm')!.valuesByMode[modeId];
      return {
        colorId: 'warm',
        modeId,
        valueHash: colorSystemExactSrgbValueHashV1(value.components, value.alpha),
      };
    }),
    historicalModes: ['Day', 'Night'].map(modeId => ({ modeId, sourceMode: 'static' })),
  };
  const session = await compileColorSystemCatalogProposalV1(source, query, runtime);
  if (session.status !== 'ready') throw new Error('Synthetic query unavailable.');
  const request: ColorSystemOverlayProposalRequestV1 = {
    version: COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION,
    id: 'synthetic-overlay',
    sourceModelHash: source.modelHash,
    brief,
    fragments: [
      {
        id: 'control',
        kind: 'construction',
        brief: construction,
        intent: {
          version: COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
          id: 'synthetic-control',
          sourceModelHash: source.modelHash,
          brief,
        },
      },
      {
        id: 'accent',
        kind: 'catalog',
        query,
        candidateId: session.retrieval.candidates[0].id,
        intent: {
          version: COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
          id: 'synthetic-accent',
          sourceModelHash: source.modelHash,
          brief,
        },
      },
    ],
  };
  return { source, request: copy(request) };
}

describe('original-source overlay proposals', () => {
  it('combines two-mode gap construction and a catalog accent with exact original pins and separate origins', async () => {
    const f = await fixture();
    const sourceBefore = canonicalJson(f.source);
    const result = await buildColorSystemOverlayProposalV1(f.source, f.request, runtime);
    expect(result.status).toBe('proposed');
    expect(result.qualified).toBe(false);
    expect(result.diagnostics).toEqual([]);
    const model = result.proposal!.workingModel;
    for (const color of f.source.colors)
      expect(model.colors.find(item => item.id === color.id)).toEqual(color);
    const control = result.fragments[0];
    if (control.kind !== 'construction') throw new Error('Missing construction.');
    expect(control.result.generatedBindings).toHaveLength(2);
    for (const binding of control.result.generatedBindings) {
      expect(
        Object.keys(model.colors.find(item => item.id === binding.colorId)!.valuesByMode)
      ).toEqual(['Day', 'Night']);
      expect(
        result.origins.find(item => item.collection === 'colors' && item.id === binding.colorId)
          ?.fragmentIds
      ).toEqual(['control']);
    }
    const accent = result.fragments[1];
    if (accent.kind !== 'catalog') throw new Error('Missing catalog.');
    expect(accent.result.binding.provider).toBe('werner');
    expect(accent.result.binding.members).toHaveLength(1);
    expect(
      result.origins.find(item => item.id === accent.result.binding.members[0].colorId)?.fragmentIds
    ).toEqual(['accent']);
    expect(canonicalJson(f.source)).toBe(sourceBefore);
    expect(await buildColorSystemOverlayProposalV1(f.source, f.request, runtime)).toEqual(result);
  });

  it('retains actual construction issue codes, slots and scope when a required gap cannot be filled', async () => {
    const f = await fixture();
    const sourceBefore = canonicalJson(f.source);
    const construction = f.request.fragments[0];
    if (construction.kind !== 'construction') throw new Error('Expected construction.');
    construction.brief.scales.forEach(scale => {
      scale.fillSlotIds = [];
    });
    const result = await buildColorSystemOverlayProposalV1(f.source, f.request, runtime);
    expect(result.status).toBe('incomplete');
    expect(result.proposal).toBeNull();
    expect(result.fragments).toEqual([]);
    expect(result.origins).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].fragmentId).toBe('control');
    for (const mode of ['Day', 'Night'])
      for (const slot of ['gap-a', 'gap-b'])
        expect(result.diagnostics[0].message).toContain(
          `Fragment control, scale blue-scale, mode ${mode}, slots ${slot}: UNPERMITTED_GAP. This required slot has no source value or permission to propose one.`
        );
    expect(canonicalJson(f.source)).toBe(sourceBefore);
  });

  it('retains the actual fixed-anchor lightness conflict for an infeasible construction', async () => {
    const f = await fixture();
    const construction = f.request.fragments[0];
    if (construction.kind !== 'construction') throw new Error('Expected construction.');
    construction.brief.scales[0].lightnessOrder = 'increasing';
    const result = await buildColorSystemOverlayProposalV1(f.source, f.request, runtime);
    expect(result.status).toBe('infeasible');
    expect(result.proposal).toBeNull();
    expect(result.diagnostics[0].message).toContain(
      'Fragment control, scale blue-scale, mode Day, slots slot:0, slot:1: LIGHTNESS_ORDER_CONFLICT. Actual sRGB values cannot satisfy the requested lightness order while preserving fixed anchors.'
    );
  });

  it('caps construction issue examples at eight while preserving each recorded mode and slot', async () => {
    const f = await fixture('werner', 2);
    const construction = f.request.fragments[0];
    if (construction.kind !== 'construction') throw new Error('Expected construction.');
    construction.brief.scales.forEach(scale => {
      scale.requiredSlotIds = ['gap-a', 'gap-b', 'outer', 'extra-gap-0', 'extra-gap-1'];
      scale.fillSlotIds = [];
    });
    const result = await buildColorSystemOverlayProposalV1(f.source, f.request, runtime);
    expect(result.status).toBe('incomplete');
    const message = result.diagnostics[0].message;
    expect(message.match(/UNPERMITTED_GAP/g)).toHaveLength(8);
    expect(message).toContain('Construction issue examples (up to 8)');
    expect(message).toContain('mode Day, slots extra-gap-1');
    expect(message).toContain('mode Night, slots outer');
    expect(message).not.toContain('mode Night, slots extra-gap-0');
  });

  it('replaces the catalog fragment without changing the retained construction or its inputs', async () => {
    const first = await fixture('werner');
    const second = await fixture('wada');
    const a = await buildColorSystemOverlayProposalV1(first.source, first.request, runtime);
    const b = await buildColorSystemOverlayProposalV1(second.source, second.request, runtime);
    expect(a.status).toBe('proposed');
    expect(b.status).toBe('proposed');
    expect(b.fragments[0]).toEqual(a.fragments[0]);
    expect(b.receipt.sourceModelHash).toBe(a.receipt.sourceModelHash);
    const oldAccent = a.fragments[1],
      newAccent = b.fragments[1];
    if (oldAccent.kind !== 'catalog' || newAccent.kind !== 'catalog')
      throw new Error('Missing catalog.');
    expect(newAccent.result.binding.provider).toBe('wada');
    expect(newAccent.result.binding.members.length).toBeGreaterThan(1);
    for (const member of oldAccent.result.binding.members)
      expect(b.proposal!.workingModel.colors.some(item => item.id === member.colorId)).toBe(false);
    expect(b.receipt.proposalHash).not.toBe(a.receipt.proposalHash);
    await expect(
      buildColorSystemOverlayProposalV1(a.proposal!.workingModel, second.request, runtime)
    ).rejects.toThrow(/stale source/);
  });

  it('merges same-scale additions requested by separate fragments without dropping either slot', async () => {
    const f = await fixture();
    const first = f.request.fragments[0];
    if (first.kind !== 'construction') throw new Error('Missing construction.');
    const second = copy(first);
    second.id = 'other-gap';
    first.brief.scales.forEach(scale => {
      scale.requiredSlotIds = ['gap-a'];
      scale.fillSlotIds = ['gap-a'];
    });
    second.brief.scales.forEach(scale => {
      scale.requiredSlotIds = ['gap-b'];
      scale.fillSlotIds = ['gap-b'];
    });
    f.request.fragments = [first, second];
    const result = await buildColorSystemOverlayProposalV1(f.source, f.request, runtime);
    expect(result.status).toBe('proposed');
    const scale = result.proposal!.workingModel.scales.find(item => item.id === 'blue-scale')!;
    for (const mode of scale.modes)
      expect(mode.anchors.map(anchor => anchor.slotId)).toEqual([
        'slot:0',
        'slot:1',
        'gap-a',
        'slot:2',
        'gap-b',
        'slot:3',
      ]);
  });

  it('fails closed when two fragments assign different native values to the same generated identity', async () => {
    const f = await fixture();
    const first = f.request.fragments[0];
    if (first.kind !== 'construction') throw new Error('Missing construction.');
    first.brief.scales.forEach(scale => {
      scale.requiredSlotIds = ['outer'];
      scale.fillSlotIds = ['outer'];
      scale.endpoints = [{ slotId: 'outer', oklch: { l: 0.2, c: 0.02, h: 210 }, alpha: 1 }];
    });
    const second = copy(first);
    second.id = 'conflicting-endpoint';
    second.brief.scales.forEach(scale => {
      scale.endpoints[0].oklch.l = 0.3;
    });
    f.request.fragments = [first, second];
    await expect(buildColorSystemOverlayProposalV1(f.source, f.request, runtime)).rejects.toThrow(
      /Conflicting overlay native color/
    );
  });

  it('requires combined review and does not transfer a review after an accent changes', async () => {
    const f = await fixture();
    f.request.fragments.push({
      id: 'context-rule',
      kind: 'rules',
      proposal: {
        version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
        id: 'context-edit',
        sourceModelHash: f.source.modelHash,
        brief: f.request.brief,
        derivation: {
          algorithmId: 'explicit-context-rule',
          algorithmVersion: '1',
          policyHash: hash('policy'),
          inputHash: hash('input'),
          sourceColorIds: ['ink'],
          sourceScaleIds: [],
        },
        colors: [],
        families: [],
        scales: [],
        exceptions: [],
        rules: [
          {
            id: 'rule:new-action',
            label: 'Use the recorded ink for actions',
            kind: 'role-binding',
            force: 'requirement',
            contextIds: ['interface'],
            modeIds: ['Day', 'Night'],
            operands: { role: 'action', members: [{ kind: 'color', id: 'ink' }] },
          },
        ],
      },
    });
    const draft = await buildColorSystemOverlayProposalV1(f.source, f.request, runtime);
    expect(draft.proposal!.pendingRuleIds).toContain('rule:new-action');
    f.request.review = {
      reviewedProposalHash: draft.proposal!.proposalHash,
      decisions: [
        {
          ruleId: 'rule:new-action',
          status: 'accepted',
          actor: { kind: 'agent', ref: 'synthetic-reviewer' },
          authorityRef: 'synthetic:brief',
          decisionRef: 'synthetic:review',
        },
      ],
    };
    const reviewed = await buildColorSystemOverlayProposalV1(f.source, f.request, runtime);
    expect(reviewed.proposal!.reviewStatus).toBe('current');
    expect(reviewed.proposal!.pendingRuleIds).toEqual([]);
    const replacement = await fixture('wada');
    f.request.fragments[1] = replacement.request.fragments[1];
    const stale = await buildColorSystemOverlayProposalV1(f.source, f.request, runtime);
    expect(stale.proposal!.reviewStatus).toBe('stale');
    expect(stale.proposal!.pendingRuleIds).toContain('rule:new-action');
  });

  it('returns no partial candidate on cancellation or unavailable provider selection', async () => {
    const f = await fixture();
    let yields = 0;
    const cancelled = await buildColorSystemOverlayProposalV1(f.source, f.request, {
      isCancelled: () => yields >= 2,
      yield: async () => {
        yields++;
      },
    });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.proposal).toBeNull();
    expect(cancelled.fragments).toEqual([]);
    expect(cancelled.origins).toEqual([]);
    expect(cancelled.diagnostics).toEqual([]);
    const catalog = f.request.fragments[1];
    if (catalog.kind !== 'catalog') throw new Error('Missing catalog.');
    catalog.candidateId = 'absent-candidate';
    const unavailable = await buildColorSystemOverlayProposalV1(f.source, f.request, runtime);
    expect(unavailable.status).toBe('blocked');
    expect(unavailable.fragments).toEqual([]);
    expect(unavailable.proposal).toBeNull();
  });

  it('rejects recursive fragments, injected outputs, accessors and mismatched briefs before hooks', async () => {
    const f = await fixture();
    const hook = vi.fn(async () => {});
    for (const change of [
      (input: Mutable<ColorSystemOverlayProposalRequestV1>) => {
        Object.assign(input.fragments[0], { kind: 'overlay' });
      },
      (input: Mutable<ColorSystemOverlayProposalRequestV1>) => {
        Object.assign(input.fragments[0], { output: [] });
      },
      (input: Mutable<ColorSystemOverlayProposalRequestV1>) => {
        input.fragments.push(input.fragments[0]);
      },
      (input: Mutable<ColorSystemOverlayProposalRequestV1>) => {
        const fragment = input.fragments[0];
        if (fragment.kind !== 'rules')
          fragment.intent.brief = {
            ...fragment.intent.brief,
            permissions: { ...fragment.intent.brief.permissions, addRules: false },
          };
      },
    ]) {
      const input = copy(f.request);
      change(input);
      await expect(
        buildColorSystemOverlayProposalV1(f.source, input, { ...runtime, yield: hook })
      ).rejects.toThrow();
    }
    const input = copy(f.request);
    const getter = vi.fn(() => []);
    Object.defineProperty(input, 'fragments', { get: getter, enumerable: true });
    await expect(
      buildColorSystemOverlayProposalV1(f.source, input, { ...runtime, yield: hook })
    ).rejects.toThrow(/accessor/i);
    expect(getter).not.toHaveBeenCalled();
    expect(hook).not.toHaveBeenCalled();
  });

  it('rejects widened, empty or duplicate local scope before any provider runs', async () => {
    const f = await fixture();
    const hook = vi.fn(async () => {});
    for (const patch of [
      { contextIds: [] },
      { contextIds: ['interface', 'communications'] },
      { contextIds: ['interface', 'interface'] },
      { modeIds: [] },
      { modeIds: ['not-authored'] },
      { modeIds: ['Day', 'Day'] },
    ]) {
      const input = copy(f.request);
      const fragment = input.fragments[0];
      if (fragment.kind === 'rules') throw new Error('Expected construction.');
      fragment.intent.brief = { ...fragment.intent.brief, ...patch };
      await expect(
        buildColorSystemOverlayProposalV1(f.source, input, { ...runtime, yield: hook })
      ).rejects.toThrow(/scope contained/);
    }
    expect(hook).not.toHaveBeenCalled();
  });

  it('detaches every fragment before a hook can change its source, scope or generated values', async () => {
    const f = await fixture();
    const expected = await buildColorSystemOverlayProposalV1(f.source, f.request, runtime);
    let mutated = false;
    const result = await buildColorSystemOverlayProposalV1(f.source, f.request, {
      ...runtime,
      yield: async () => {
        if (mutated) return;
        mutated = true;
        f.request.fragments.length = 0;
        f.request.brief.permissions.addColors = false;
      },
    });
    expect(result).toEqual(expected);
  });
});
