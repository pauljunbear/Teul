import { describe, expect, it } from 'vitest';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
  type ColorSystemScopedRuleV1,
} from '../../../../src/lib/colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { guidelineHash } from './review';
import {
  previewGuidelineExtension,
  reviewGuidelineExtension,
  type GuidelineExtensionRequest,
  type GuidelineInteriorExtensionRequest,
} from './extension';

const run = { isCancelled: () => false, yield: async () => {} };
const request: GuidelineExtensionRequest = {
  context: 'product',
  modeId: 'Source',
  scaleId: 'stone-scale',
  additions: [{ slotId: 'authored-middle', position: 13.5 }],
  lightnessOrder: 'decreasing',
};
function fixture(change?: (input: ColorSystemModelInputV1) => ColorSystemModelInputV1) {
  const link = { evidenceRefs: [], claimIds: [] };
  const base = {
    ...link,
    contextIds: ['brand', 'product'],
    modeIds: ['Source'],
    origin: 'inferred' as const,
  };
  let input: ColorSystemModelInputV1 = {
    schemaVersion: 'teul.color-system-model.v1',
    sources: [
      {
        id: 'source',
        label: 'Synthetic source',
        sourceHash: guidelineHash('source'),
        version: '1',
        locator: null,
        freshnessMode: 'imported-snapshot',
        status: 'draft',
      },
    ],
    evidence: [],
    coverage: [
      {
        sourceId: 'source',
        status: 'complete',
        evidenceRefs: [],
        unresolvedClaimIds: [],
        note: 'Synthetic source only.',
      },
    ],
    claims: [],
    modes: [{ id: 'Source', label: 'Source' }],
    colors: [
      ['pale', 0.9],
      ['middle', 0.5],
      ['deep', 0.1],
      ['paper', 1],
    ].map(([id, value]) => ({
      ...link,
      id: String(id),
      label: String(id),
      sourceId: 'source',
      valuesByMode: {
        Source: buildColorSystemSrgbValueV1({
          r: Number(value),
          g: Number(value),
          b: Number(value),
        }),
      },
    })),
    families: [{ ...link, id: 'stone', label: 'Stone', colorIds: ['pale', 'middle', 'deep'] }],
    scales: [
      {
        ...link,
        id: 'stone-scale',
        familyId: 'stone',
        label: 'Named uneven source scale',
        slots: [
          { id: 'Mist', position: 2 },
          { id: 'Stone', position: 25 },
          { id: 'Coal', position: 87 },
        ],
        modes: [
          {
            modeId: 'Source',
            anchors: [
              { slotId: 'Mist', colorId: 'pale' },
              { slotId: 'Stone', colorId: 'middle' },
              { slotId: 'Coal', colorId: 'deep' },
            ],
          },
        ],
      },
    ],
    contexts: ['brand', 'product'].map(id => ({ ...link, id, label: id, modeIds: ['Source'] })),
    brandConstraintsByContext: [],
    rules: [
      {
        ...base,
        id: 'partner',
        label: 'Stone requires its middle anchor',
        kind: 'required-partner',
        force: 'requirement',
        operands: {
          subject: [{ kind: 'family', id: 'stone' }],
          partner: [{ kind: 'color', id: 'middle' }],
        },
      },
      {
        ...base,
        id: 'paper-ground',
        label: 'Use paper for the ground',
        kind: 'role-binding',
        force: 'preference',
        operands: { role: 'ground', members: [{ kind: 'color', id: 'paper' }] },
      },
    ],
    adoptions: [],
    conflicts: [],
  };
  input = change ? change(input) : input;
  input = {
    ...input,
    coverage: input.coverage.map(item => ({
      ...item,
      status: input.claims.length ? 'partial' : 'complete',
      unresolvedClaimIds: input.claims
        .filter(claim => ['unsupported', 'unresolved', 'contradicted'].includes(claim.status))
        .map(claim => claim.id),
    })),
  };
  const model = buildColorSystemModelV1({
    ...input,
    adoptions: buildColorSystemRuleAdoptionsV1(
      input,
      input.rules.map(rule => ({
        ruleId: rule.id,
        status: 'accepted',
        actor: { kind: 'user', ref: 'fixture-source-review' },
        authorityRef: 'fixture',
        decisionRef: 'source-review',
      }))
    ),
  });
  return {
    model,
    reviewHash: guidelineHash({ model: model.modelHash, decision: 'fixture-source-review' }),
  };
}

function decisions(proposalHash: string, ruleId = 'partner') {
  return {
    reviewedProposalHash: proposalHash,
    decisions: [
      {
        ruleId,
        status: 'accepted' as const,
        actor: { kind: 'user' as const, ref: 'fixture-user' },
        authorityRef: 'fixture:extension-review',
        decisionRef: 'explicit-confirmation',
      },
    ],
  };
}

describe('reviewed source scale extension', () => {
  it('preserves arbitrary source slots, numeric values and anchors while exposing an unqualified proposal', async () => {
    const review = fixture();
    const before = JSON.stringify(review);
    const result = await previewGuidelineExtension(review, request, run);
    expect(result.status).toBe('proposed');
    expect(result.qualified).toBe(false);
    expect(result.generatedBindings).toHaveLength(1);
    expect(result.generatedBindings[0]).toMatchObject({
      scaleId: 'stone-scale',
      slotId: 'authored-middle',
    });
    const model = result.workingModel!;
    for (const color of review.model.colors)
      expect(model.colors.find(item => item.id === color.id)).toEqual(color);
    for (const slot of review.model.scales[0].slots)
      expect(model.scales[0].slots.find(item => item.id === slot.id)).toEqual(slot);
    for (const anchor of review.model.scales[0].modes[0].anchors)
      expect(model.scales[0].modes[0].anchors).toContainEqual(anchor);
    expect(model.scales[0].slots.map(item => item.position)).toEqual([2, 13.5, 25, 87]);
    expect(result.pendingRuleIds).toContain('partner');
    expect(result.adoptionChanges.find(item => item.ruleId === 'partner')?.status).toBe(
      'needs-review'
    );
    expect(result.adoptionChanges.find(item => item.ruleId === 'paper-ground')?.status).toBe(
      'retained'
    );
    expect(JSON.stringify(review)).toBe(before);
  });

  it('renews only explicit user decisions bound to the exact proposal and preserves whole source scope', async () => {
    const review = fixture();
    const first = await previewGuidelineExtension(review, request, run);
    if (first.construction?.status !== 'proposed') throw new Error('Expected proposal');
    const hash = first.construction.proposal.proposalHash;
    const renewed = await reviewGuidelineExtension(review, request, decisions(hash), run);
    expect(renewed.status).toBe('proposed');
    expect(renewed.pendingRuleIds).not.toContain('partner');
    expect(renewed.adoptionChanges.find(item => item.ruleId === 'partner')).toMatchObject({
      status: 'reviewed',
      after: { actor: { kind: 'user', ref: 'fixture-user' } },
    });
    expect(renewed.workingModel!.rules).toEqual(review.model.rules);
    expect(renewed.workingModel!.rules[0].contextIds).toEqual(['brand', 'product']);
    expect(renewed.generatedBindings).toEqual(first.generatedBindings);
    await expect(
      reviewGuidelineExtension(
        review,
        { ...request, additions: [{ slotId: 'later', position: 14 }] },
        decisions(hash),
        run
      )
    ).rejects.toThrow('extension changed');
    await expect(
      reviewGuidelineExtension(
        { ...review, reviewHash: guidelineHash('new review') },
        request,
        decisions(hash),
        run
      )
    ).rejects.toThrow('extension changed');
    await expect(
      reviewGuidelineExtension(review, request, { ...decisions(hash), decisions: [] }, run)
    ).rejects.toThrow('per-rule');
    await expect(
      reviewGuidelineExtension(
        review,
        request,
        {
          ...decisions(hash),
          decisions: [
            { ...decisions(hash).decisions[0], actor: { kind: 'agent', ref: 'not-a-user' } },
          ],
        } as never,
        run
      )
    ).rejects.toThrow('user decisions');
  });

  it('blocks a closed palette before interpolation and respects context scope', async () => {
    const review = fixture(input => ({
      ...input,
      rules: [
        ...input.rules,
        {
          id: 'closed',
          label: 'Closed brand palette',
          contextIds: ['brand'],
          modeIds: ['Source'],
          origin: 'inferred',
          force: 'requirement',
          kind: 'palette-membership',
          operands: { members: [{ kind: 'family', id: 'stone' }] },
          evidenceRefs: [],
          claimIds: [],
        } as ColorSystemScopedRuleV1,
      ],
    }));
    const blocked = await previewGuidelineExtension(review, { ...request, context: 'brand' }, run);
    expect(blocked.status).toBe('blocked');
    expect(blocked.construction).toBeNull();
    expect(blocked.issues.some(item => item.code === 'CLOSED_SOURCE_PALETTE')).toBe(true);
    expect((await previewGuidelineExtension(review, request, run)).status).toBe('proposed');
  });

  it.each(['unsupported', 'unresolved', 'contradicted'] as const)(
    'blocks %s source meaning before generation',
    async status => {
      const review = fixture(input => ({
        ...input,
        claims: [
          {
            id: 'uncertain',
            sourceId: 'source',
            text: 'Unknown extension permission',
            status,
            evidenceRefs: [],
            contextIds: ['product'],
            ruleIds: [],
            modeIds: ['Source'],
          },
        ],
      }));
      const result = await previewGuidelineExtension(review, request, run);
      expect(result.status).toBe('blocked');
      expect(result.issues[0].code).toBe('SOURCE_MEANING_REQUIRED');
      expect(result.generatedBindings).toEqual([]);
    }
  );

  it.each(
    [
      [{ slotId: 'outside', position: 90 }],
      [{ slotId: 'edge', position: 2 }],
      [{ slotId: 'Stone', position: 14 }],
      [{ slotId: 'same-position', position: 25 }],
      [
        { slotId: 'one', position: 14 },
        { slotId: 'two', position: 14 },
      ],
      [
        { slotId: 'one', position: 14 },
        { slotId: 'one', position: 15 },
      ],
    ].map(additions => ({ additions }))
  )('rejects invalid source additions $additions', async ({ additions }) => {
    await expect(
      previewGuidelineExtension(fixture(), { ...request, additions }, run)
    ).rejects.toThrow('Guideline extension');
  });

  it('reports missing scale/mode without guessing a source scale', async () => {
    const review = fixture();
    expect(
      (await previewGuidelineExtension(review, { ...request, scaleId: 'missing' }, run)).issues[0]
        .code
    ).toBe('SOURCE_SCALE_REQUIRED');
    expect(
      (await previewGuidelineExtension(review, { ...request, modeId: 'Dark' }, run)).issues[0].code
    ).toBe('SOURCE_MODE_REQUIRED');
  });

  it('requires an existing source decision and does not fill unrequested source gaps', async () => {
    const review = fixture();
    const { modelHash: _hash, ...sourceInput } = review.model;
    const unreviewed = {
      ...review,
      model: buildColorSystemModelV1({ ...sourceInput, adoptions: [] }),
    };
    const blocked = await previewGuidelineExtension(unreviewed, request, run);
    expect(blocked.status).toBe('blocked');
    expect(blocked.issues.some(item => item.code === 'SOURCE_RULE_REVIEW_REQUIRED')).toBe(true);
    const gapReview = fixture(input => ({
      ...input,
      scales: input.scales.map(scale => ({
        ...scale,
        slots: [...scale.slots, { id: 'existing-empty', position: 10 }].sort(
          (a, b) => a.position - b.position
        ),
      })),
    }));
    const missing = await previewGuidelineExtension(gapReview, request, run);
    expect(missing.status).toBe('incomplete');
    expect(missing.workingModel).toBeNull();
    expect(missing.generatedBindings).toEqual([]);
  });

  it('detaches the review request before yielding so a later edit cannot inherit the decision', async () => {
    const review = fixture();
    const editable = { ...request, additions: request.additions.map(item => ({ ...item })) };
    const preview = await previewGuidelineExtension(review, editable, run);
    if (preview.construction?.status !== 'proposed') throw new Error('Expected proposal');
    const result = await reviewGuidelineExtension(
      review,
      editable,
      decisions(preview.construction.proposal.proposalHash),
      {
        isCancelled: () => false,
        yield: async () => {
          editable.additions[0].position = 19;
        },
      }
    );
    expect((result.request as GuidelineInteriorExtensionRequest).additions[0].position).toBe(13.5);
    expect(result.requestHash).toBe(preview.requestHash);
    expect(result.pendingRuleIds).not.toContain('partner');
  });

  it('binds a direct preview to the original review when its caller changes during a yield', async () => {
    const review = fixture();
    const originalHash = review.reviewHash;
    const expected = await previewGuidelineExtension(review, request, run);
    const actual = await previewGuidelineExtension(review, request, {
      isCancelled: () => false,
      yield: async () => {
        review.reviewHash = guidelineHash('changed while constructing');
      },
    });
    expect(actual.status).toBe('proposed');
    expect(actual.reviewHash).toBe(originalHash);
    expect(actual.requestHash).toBe(expected.requestHash);
    expect(actual.construction?.construction.brief.decision.authorityRef).toBe(originalHash);
  });

  it('retains core infeasible and cancelled outcomes without a working model', async () => {
    const review = fixture();
    const wrongOrder = await previewGuidelineExtension(
      review,
      { ...request, lightnessOrder: 'increasing' },
      run
    );
    expect(wrongOrder.status).toBe('infeasible');
    expect(wrongOrder.workingModel).toBeNull();
    const cancelled = await previewGuidelineExtension(review, request, {
      ...run,
      isCancelled: () => true,
    });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.generatedBindings).toEqual([]);
  });
});

describe('source-derived scale', () => {
  const newScale = {
    kind: 'new-scale' as const,
    context: 'product' as const,
    modeId: 'Source',
    scaleId: 'derived-stone',
    familyId: 'stone',
    anchorColorId: 'middle',
    label: 'Stone product scale',
    polarity: 'light' as const,
  };
  it('constructs without a source scale and preserves family rules and exact native anchor', async () => {
    const source = fixture(input => ({
      ...input,
      scales: [],
      colors: input.colors.map(color =>
        color.id === 'middle'
          ? {
              ...color,
              valuesByMode: {
                Source: buildColorSystemSrgbValueV1({
                  r: 0.34567890123,
                  g: 0.53456789012,
                  b: 0.76543210987,
                }),
              },
            }
          : color
      ),
    }));
    const preview = await previewGuidelineExtension(source, newScale, run);
    expect(preview.status).toBe('proposed');
    expect(preview.generatedBindings).toHaveLength(11);
    expect(preview.pendingRuleIds).toContain('partner');
    expect(preview.workingModel!.families).toHaveLength(source.model.families.length);
    expect(preview.workingModel!.scales[0].familyId).toBe('stone');
    for (const color of source.model.colors)
      expect(preview.workingModel!.colors.find(c => c.id === color.id)).toEqual(color);
    expect(preview.qualified).toBe(false);
    const construction = preview.construction!;
    if (construction.status !== 'proposed') throw Error('proposal missing');
    const renewed = await reviewGuidelineExtension(
      source,
      newScale,
      decisions(construction.proposal.proposalHash),
      run
    );
    expect(renewed.pendingRuleIds).not.toContain('partner');
    expect(renewed.generatedBindings).toEqual(preview.generatedBindings);
  });
  it('supports explicit dark ordering without inventing a source mode', async () => {
    const source = fixture(input => ({ ...input, scales: [] }));
    const result = await previewGuidelineExtension(source, { ...newScale, polarity: 'dark' }, run);
    expect(result.status).toBe('proposed');
    expect(result.workingModel!.modes).toEqual(source.model.modes);
    expect(result.generation!.brief.scales[0].lightnessOrder).toBe('increasing');
  });
  it('rejects alpha and a family that does not contain the original anchor', async () => {
    const source = fixture(input => ({
      ...input,
      scales: [],
      colors: input.colors.map(color =>
        color.id === 'middle'
          ? {
              ...color,
              valuesByMode: {
                Source: buildColorSystemSrgbValueV1({ r: 0.5, g: 0.5, b: 0.5 }, 0.5),
              },
            }
          : color
      ),
    }));
    expect(
      (await previewGuidelineExtension(source, newScale, run)).issues.map(i => i.code)
    ).toContain('OPAQUE_SOURCE_REQUIRED');
    expect(
      (
        await previewGuidelineExtension(
          fixture(input => ({ ...input, scales: [] })),
          { ...newScale, familyId: 'invented' },
          run
        )
      ).issues.map(i => i.code)
    ).toContain('SOURCE_FAMILY_REQUIRED');
  });
  it('creates an explicitly proposed family only for an ungrouped anchor and cannot escape an existing family', async () => {
    const ungrouped = fixture(input => ({ ...input, scales: [], families: [], rules: [] }));
    const result = await previewGuidelineExtension(ungrouped, { ...newScale, familyId: null }, run);
    expect(result.status).toBe('proposed');
    expect(ungrouped.model.families).toEqual([]);
    expect(result.workingModel!.families).toHaveLength(1);
    expect(result.generation!.structureProposal!.brief.permissions.addFamilies).toBe(true);
    const bound = await previewGuidelineExtension(
      fixture(input => ({ ...input, scales: [] })),
      { ...newScale, familyId: null },
      run
    );
    expect(bound.status).toBe('blocked');
    expect(bound.issues.map(i => i.code)).toContain('SOURCE_FAMILY_REQUIRED');
  });
  it('preserves closed-palette and unresolved-source gates before constructing a new scale', async () => {
    const closed = fixture(input => ({
      ...input,
      scales: [],
      rules: [
        ...input.rules,
        {
          id: 'closed',
          label: 'Only source colors',
          contextIds: ['product'],
          modeIds: ['Source'],
          origin: 'inferred',
          force: 'requirement',
          kind: 'palette-membership',
          operands: { members: [{ kind: 'family', id: 'stone' }] },
          evidenceRefs: [],
          claimIds: [],
        },
      ],
    }));
    expect(
      (await previewGuidelineExtension(closed, newScale, run)).issues.map(i => i.code)
    ).toContain('CLOSED_SOURCE_PALETTE');
    const unresolved = fixture(input => ({
      ...input,
      scales: [],
      claims: [
        {
          id: 'unknown',
          sourceId: 'source',
          text: 'Unknown permission',
          status: 'unresolved',
          evidenceRefs: [],
          contextIds: ['product'],
          ruleIds: [],
          modeIds: ['Source'],
        },
      ],
    }));
    expect(
      (await previewGuidelineExtension(unresolved, newScale, run)).issues.map(i => i.code)
    ).toContain('SOURCE_MEANING_REQUIRED');
  });
  it('does not publish a cancelled construction or accept unknown request fields', async () => {
    const source = fixture(input => ({ ...input, scales: [] }));
    const cancelled = await previewGuidelineExtension(source, newScale, {
      isCancelled: () => true,
      yield: async () => {},
    });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.workingModel).toBeNull();
    await expect(
      previewGuidelineExtension(source, { ...newScale, extra: true } as typeof newScale, run)
    ).rejects.toThrow('unsupported request fields');
  });

  it.each(
    [0, 0.001, 0.999, 1].flatMap(channel =>
      ['light', 'dark'].map(polarity => ({ channel, polarity: polarity as 'light' | 'dark' }))
    )
  )(
    'keeps an extreme $channel source feasible and exact for $polarity ordering',
    async ({ channel, polarity }) => {
      const source = fixture(input => ({
        ...input,
        scales: [],
        colors: input.colors.map(color =>
          color.id === 'middle'
            ? {
                ...color,
                valuesByMode: {
                  Source: buildColorSystemSrgbValueV1({ r: channel, g: channel, b: channel }),
                },
              }
            : color
        ),
      }));
      const result = await previewGuidelineExtension(source, { ...newScale, polarity }, run);
      expect(result.status).toBe('proposed');
      const anchorSlot = result.generation!.structureProposal!.scales[0].modes[0].anchors[0].slotId;
      if (channel === 0 || channel === 1) expect(['step:1', 'step:12']).toContain(anchorSlot);
      expect(
        result.generation!.brief.scales[0].endpoints.some(
          endpoint => endpoint.slotId === anchorSlot
        )
      ).toBe(false);
      expect(result.workingModel!.colors.find(c => c.id === 'middle')!.valuesByMode).toEqual(
        source.model.colors.find(c => c.id === 'middle')!.valuesByMode
      );
      expect(result.generatedBindings).toHaveLength(11);
    }
  );
});
