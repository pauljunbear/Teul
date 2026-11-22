import { describe, expect, it, vi } from 'vitest';
import * as authoringRun from '../../../../src/lib/colorSystemAuthoringRunV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../../../../src/lib/colorSystemModelV1';
import {
  buildColorSystemSrgbValueV1,
  colorSystemRgbDeltaEOKV1,
  colorSystemSrgbToRgbV1,
} from '../../../../src/lib/colorSystemSrgbValueV1';
import {
  buildColorSystemBrandConstraintsV1,
  hashColorSystemBrandTerritoryRuleV1,
  type ColorSystemBrandTerritoryRuleV1,
} from '../../../../src/lib/colorSystemBrandConstraintsV1';
import { guidelineHash } from './review';
import {
  exportGuidelineSupportingDirection,
  generateGuidelineSupportingDirections,
  readGuidelineSupportingDirection,
  type GuidelineSupportingRequest,
  buildGuidelineSupportingSourceApplication,
  assessGuidelineSupportingSourceApplication,
  refineGuidelineSupportingDirection,
  readGuidelineSupportingFeedback,
} from './supportingDirections';
import { exportGuidelineApplication, readGuidelineApplication } from './application';

const links = { evidenceRefs: [], claimIds: [] };
const scope = {
  ...links,
  contextIds: ['brand', 'product'],
  modeIds: ['Source'],
  origin: 'inferred' as const,
};
function fixture(
  change: (input: ColorSystemModelInputV1) => ColorSystemModelInputV1 = input => input
) {
  const input = change({
    schemaVersion: 'teul.color-system-model.v1',
    sources: [
      {
        id: 'source',
        label: 'Invented brand',
        sourceHash: guidelineHash('invented'),
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
        note: 'Synthetic test, no brand approval.',
      },
    ],
    claims: [],
    modes: [{ id: 'Source', label: 'Source' }],
    colors: [
      ['blue', [0.1, 0.25, 0.6]],
      ['orange', [0.9, 0.4, 0.1]],
      ['paper', [1, 1, 1]],
      ['ink', [0.05, 0.05, 0.05]],
      ['mist', [0.9, 0.9, 0.9]],
    ].map(([id, value]) => ({
      ...links,
      id: id as string,
      label: id as string,
      sourceId: 'source',
      valuesByMode: {
        Source: buildColorSystemSrgbValueV1({
          r: Number(value[0]),
          g: Number(value[1]),
          b: Number(value[2]),
        }),
      },
    })),
    families: [
      { ...links, id: 'cool', label: 'Cool', colorIds: ['blue'] },
      { ...links, id: 'warm', label: 'Warm', colorIds: ['orange'] },
    ],
    scales: [],
    contexts: ['brand', 'product'].map(id => ({ ...links, id, label: id, modeIds: ['Source'] })),
    brandConstraintsByContext: [],
    rules: [],
    adoptions: [],
    conflicts: [],
  });
  const model = buildColorSystemModelV1({
    ...input,
    adoptions: buildColorSystemRuleAdoptionsV1(
      input,
      input.rules.map(rule => ({
        ruleId: rule.id,
        status: 'accepted',
        actor: { kind: 'user', ref: 'fixture-user' },
        authorityRef: 'synthetic-source-review',
        decisionRef: 'source-review',
      }))
    ),
  });
  return { model, reviewHash: guidelineHash({ model: model.modelHash, review: 'fixture' }) };
}
const brand: GuidelineSupportingRequest = {
  layout: { kind: 'brand', modeId: 'Source', layout: 'split', primaryShare: 60 },
  provider: 'wada',
  scheme: null,
  relationship: 'companion',
  anchorColorIds: ['blue', 'orange'],
  excludedCandidateIds: [],
  sourcePaints: { ground: 'paper', primary: 'blue', accent: 'orange' },
};
const product: GuidelineSupportingRequest = {
  layout: { kind: 'product', modeId: 'Source' },
  provider: 'radix',
  scheme: 'light',
  relationship: 'nearby',
  anchorColorIds: ['blue'],
  excludedCandidateIds: [],
  sourcePaints: {
    ground: 'paper',
    label: 'paper',
    partner: 'ink',
    'focus-ring': 'ink',
    'disabled-action': 'mist',
    'disabled-label': 'ink',
  },
};

describe('saved supporting refinement decisions', () => {
  it('refines the displayed request, keeps compatible exclusions, and preserves selected paint', async () => {
    const review = fixture();
    const result = await generateGuidelineSupportingDirections(review, brand);
    const direction = result.directions[0];
    const original = await exportGuidelineSupportingDirection(result, direction.id);
    const incompatible = {
      ...brand,
      provider: 'werner' as const,
      relationship: 'nearby' as const,
      sourcePaints: { ...brand.sourcePaints, ground: 'ink' },
      excludedCandidateIds: ['unrelated'],
    };
    const next = refineGuidelineSupportingDirection(
      review,
      result,
      direction.id,
      incompatible,
      [],
      'too-muted',
      'Keep the source accent clear.'
    );
    expect(next.request).toEqual({
      ...result.request,
      excludedCandidateIds: [direction.catalogCandidateId],
    });
    expect(next.feedback[0]).toMatchObject({
      request: result.request,
      requestHash: result.requestHash,
      sourceModelHash: result.sourceModelHash,
      reviewHash: review.reviewHash,
      reason: 'too-muted',
      note: 'Keep the source accent clear.',
    });
    const leading = direction.recipe.selection!.applications[0];
    const colorId = leading.uses.find(use => use.id === 'secondary')!.colorId;
    expect(next.feedback[0].paint).toEqual(
      direction.recipe.selection!.model.colors.find(c => c.id === colorId)!.valuesByMode[
        leading.modeId
      ]
    );
    const updated = refineGuidelineSupportingDirection(
      review,
      result,
      direction.id,
      {
        ...next.request,
        excludedCandidateIds: [...next.request.excludedCandidateIds, 'previously-excluded'],
      },
      next.feedback,
      'hierarchy',
      'Updated judgment.'
    );
    expect(updated.feedback).toHaveLength(1);
    expect(updated.feedback[0].reason).toBe('hierarchy');
    expect(updated.request.excludedCandidateIds).toContain('previously-excluded');
    const regenerated = await generateGuidelineSupportingDirections(review, updated.request);
    expect(
      regenerated.directions.every(d => d.catalogCandidateId !== direction.catalogCandidateId)
    ).toBe(true);
    expect((await exportGuidelineSupportingDirection(result, direction.id)).json).toBe(
      original.json
    );
    expect(readGuidelineSupportingFeedback(JSON.parse(JSON.stringify(updated.feedback)))).toEqual(
      updated.feedback
    );
  });

  it('rejects altered identities, invalid notes, changed source review and feedback overflow', async () => {
    const review = fixture();
    const result = await generateGuidelineSupportingDirections(review, product);
    const direction = result.directions[0];
    const refine = (
      notes: Parameters<typeof refineGuidelineSupportingDirection>[4] = [],
      reason: any = 'states',
      note = ''
    ) =>
      refineGuidelineSupportingDirection(
        review,
        result,
        direction.id,
        result.request,
        notes,
        reason,
        note
      );
    const note = refine().feedback[0];
    expect(() => refine([], 'toString')).toThrow();
    expect(() => refine([], ['states'])).toThrow();
    expect(() => refine([], 'states', 'x'.repeat(501))).toThrow();
    expect(() => readGuidelineSupportingFeedback([note, note])).toThrow();
    expect(() =>
      readGuidelineSupportingFeedback([{ ...note, requestHash: guidelineHash('changed') }])
    ).toThrow();
    expect(() => readGuidelineSupportingFeedback([{ ...note, extra: 'unsupported' }])).toThrow();
    expect(() =>
      readGuidelineSupportingFeedback([
        { ...note, paint: { ...note.paint, components: { ...note.paint.components, x: 1 } } },
      ])
    ).toThrow();
    expect(() =>
      refineGuidelineSupportingDirection(
        { ...review, reviewHash: guidelineHash('new review') },
        result,
        direction.id,
        product,
        [],
        'states',
        ''
      )
    ).toThrow(/current source review/);
    expect(() =>
      refineGuidelineSupportingDirection(
        review,
        structuredClone(result),
        direction.id,
        product,
        [],
        'states',
        ''
      )
    ).toThrow(/current source review/);
    const full = Array.from({ length: 24 }, (_, index) => {
      const directionId = `historical:${index}`;
      return {
        ...note,
        directionId,
        id: guidelineHash({ requestHash: note.requestHash, directionId }),
      };
    });
    expect(readGuidelineSupportingFeedback(full)).toHaveLength(24);
    expect(() => refine(full)).toThrow(/24 review notes/);
    expect(() =>
      refineGuidelineSupportingDirection(
        review,
        result,
        direction.id,
        { ...product, excludedCandidateIds: Array.from({ length: 24 }, (_, i) => `other:${i}`) },
        [],
        'states',
        ''
      )
    ).toThrow(/bounded/);
    expect(
      refineGuidelineSupportingDirection(
        review,
        result,
        direction.id,
        { ...product, sourcePaints: { ...product.sourcePaints, ground: '' } },
        [],
        'states',
        ''
      ).request.layout
    ).toEqual(product.layout);
  });
});

describe('checked source-only alternatives', () => {
  it.each([brand, product])(
    'preserves source paint and geometry for $layout.kind handoff and replay',
    async request => {
      const review = fixture();
      const result = await generateGuidelineSupportingDirections(review, request);
      const direction = result.directions[0];
      const original = await exportGuidelineSupportingDirection(result, direction.id);
      const sourceRequest = buildGuidelineSupportingSourceApplication(result, direction.id, 'blue');
      expect(sourceRequest.extension).toBeNull();
      expect(sourceRequest.layout).toEqual(result.layout.request);
      const generatedRole = request.layout.kind === 'brand' ? 'secondary' : 'action';
      for (const assignment of sourceRequest.assignments) {
        const prior = direction.recipe
          .selection!.applications.find(a => a.id === assignment.applicationId)!
          .uses.find(u => u.id === assignment.useId)!;
        const replaces =
          assignment.useId === generatedRole && assignment.applicationId !== 'disabled';
        expect(assignment.colorId).toBe(replaces ? 'blue' : prior.colorId);
        expect(review.model.colors.some(color => color.id === assignment.colorId)).toBe(true);
      }
      const checked = await assessGuidelineSupportingSourceApplication(
        review,
        result,
        direction.id,
        'blue'
      );
      expect(checked.status).toBe('ready');
      expect(checked.recipe).not.toBeNull();
      expect(checked.model).toEqual(review.model);
      expect(checked.layout.boards).toEqual(result.layout.boards);
      const exported = await exportGuidelineApplication(checked);
      const reopened = await readGuidelineApplication(exported.applicationJson, review);
      expect((await exportGuidelineApplication(reopened)).svgs).toEqual(exported.svgs);
      expect((await exportGuidelineSupportingDirection(result, direction.id)).json).toBe(
        original.json
      );
    }
  );

  it('blocks low-contrast source substitution without borrowing the proposal pass', async () => {
    const review = fixture();
    const result = await generateGuidelineSupportingDirections(review, product);
    const direction = result.directions[0];
    const checked = await assessGuidelineSupportingSourceApplication(
      review,
      result,
      direction.id,
      'paper'
    );
    expect(checked.recipe).toBeNull();
    expect(checked.assessment?.eligible).toBe(false);
    expect(checked.assessment?.blockers.length).toBeGreaterThan(0);
    await expect(exportGuidelineApplication(checked)).rejects.toThrow('feasible');
    expect((await exportGuidelineSupportingDirection(result, direction.id)).svgs).toHaveLength(5);
  });

  it('rejects copied results, unknown choices, added colors and stale source reviews', async () => {
    const review = fixture();
    const result = await generateGuidelineSupportingDirections(review, brand);
    const direction = result.directions[0];
    const generatedId = direction.recipe.selection!.applications[0].uses.find(
      u => u.id === 'secondary'
    )!.colorId;
    for (const id of ['', 'unknown', generatedId])
      expect(() => buildGuidelineSupportingSourceApplication(result, direction.id, id)).toThrow(
        'original source'
      );
    expect(() =>
      buildGuidelineSupportingSourceApplication(structuredClone(result), direction.id, 'blue')
    ).toThrow('Recompute');
    expect(() => buildGuidelineSupportingSourceApplication(result, 'unknown', 'blue')).toThrow(
      'eligible'
    );
    await expect(
      assessGuidelineSupportingSourceApplication(
        { ...review, reviewHash: guidelineHash('new review') },
        result,
        direction.id,
        'blue'
      )
    ).rejects.toThrow('review changed');
    const changed = fixture(input => ({
      ...input,
      colors: input.colors.map(color => ({ ...color, label: color.label + ' changed' })),
    }));
    await expect(
      assessGuidelineSupportingSourceApplication(changed, result, direction.id, 'blue')
    ).rejects.toThrow('review changed');
  });

  it('returns no usable recipe after cancellation', async () => {
    const review = fixture();
    const result = await generateGuidelineSupportingDirections(review, brand);
    const controller = new AbortController();
    controller.abort();
    const checked = await assessGuidelineSupportingSourceApplication(
      review,
      result,
      result.directions[0].id,
      'blue',
      controller.signal
    );
    expect(checked.status).toBe('cancelled');
    expect(checked.recipe).toBeNull();
  });
});

describe('reviewed guideline supporting directions', () => {
  it('paints a new historical companion, preserves both source families and qualifies no visual result', async () => {
    const source = fixture();
    const result = await generateGuidelineSupportingDirections(source, brand);
    expect(result.status).toBe('ready');
    expect(result.qualified).toBe(false);
    expect(result.directions.length).toBeGreaterThan(0);
    expect(result.directions.length).toBeLessThanOrEqual(3);
    const paints = [];
    for (const direction of result.directions) {
      const selected = direction.recipe.selection!;
      expect(direction.provenance.classification).toBe('digital-approximation');
      expect(direction.sourceMatches.map(match => match.sourceColorId).sort()).toEqual([
        'blue',
        'orange',
      ]);
      expect(
        selected.model.colors.filter(color => source.model.colors.some(c => c.id === color.id))
      ).toEqual(source.model.colors);
      expect(
        selected.model.families.filter(family =>
          source.model.families.some(f => f.id === family.id)
        )
      ).toEqual(source.model.families);
      const paintId = selected.applications[0].uses.find(use => use.id === 'secondary')!.colorId;
      const value = selected.model.colors.find(color => color.id === paintId)!.valuesByMode.Source;
      for (const color of source.model.colors)
        expect(
          colorSystemRgbDeltaEOKV1(
            colorSystemSrgbToRgbV1(value),
            colorSystemSrgbToRgbV1(color.valuesByMode.Source)
          )
        ).toBeGreaterThanOrEqual(0.02);
      paints.push(value);
      expect(direction.recipe.direction.units[0].anchors[0].colorId).toBe(paintId);
    }
    for (let i = 1; i < paints.length; i++)
      for (let j = 0; j < i; j++)
        expect(
          colorSystemRgbDeltaEOKV1(
            colorSystemSrgbToRgbV1(paints[i]),
            colorSystemSrgbToRgbV1(paints[j])
          )
        ).toBeGreaterThanOrEqual(0.02);
    const excluded = await generateGuidelineSupportingDirections(source, {
      ...brand,
      excludedCandidateIds: result.proposals.map(p => p.candidateId),
    });
    expect(excluded.directions).toEqual([]);
    expect(excluded.status).toBe('blocked');
  });

  it('uses exact Radix controls with distinct active states and explicit disabled source paints', async () => {
    const source = fixture();
    const result = await generateGuidelineSupportingDirections(source, product);
    expect(result.status).toBe('ready');
    for (const direction of result.directions) {
      expect(direction.provenance.classification).toBe('exact-library');
      const selected = direction.recipe.selection!;
      const paint = (state: string, useId: string) =>
        selected.applications.find(a => a.id === state)!.uses.find(use => use.id === useId)!
          .colorId;
      expect(new Set(['rest', 'hover', 'pressed'].map(state => paint(state, 'action'))).size).toBe(
        3
      );
      expect(paint('focus', 'action')).toBe(paint('rest', 'action'));
      expect(paint('focus', 'focus-ring')).toBe('ink');
      expect(paint('disabled', 'action')).toBe('mist');
      expect(paint('disabled', 'label')).toBe('ink');
      expect(direction.recipe.direction.units[0].anchors[0].colorId).toBe(paint('rest', 'action'));
      expect(selected.applications).toHaveLength(5);
    }
    await expect(
      generateGuidelineSupportingDirections(source, { ...product, scheme: null })
    ).rejects.toThrow('explicit published scheme');
    await expect(
      generateGuidelineSupportingDirections(source, { ...product, provider: 'wada', scheme: null })
    ).rejects.toThrow('exact Radix scale');
  });

  it('keeps closed palettes blocked and cancels without a partial comparison', async () => {
    const closed = fixture(input => ({
      ...input,
      rules: [
        {
          ...scope,
          id: 'closed',
          label: 'Keep this palette',
          kind: 'palette-membership',
          force: 'requirement',
          operands: { members: input.colors.map(c => ({ kind: 'color', id: c.id })) },
        },
      ],
    }));
    const blocked = await generateGuidelineSupportingDirections(closed, brand);
    expect(blocked.issues.map(i => i.code)).toContain('CLOSED_SOURCE_PALETTE');
    expect(blocked.run).toBeNull();
    const abort = new AbortController();
    const pending = generateGuidelineSupportingDirections(fixture(), brand, abort.signal);
    abort.abort();
    expect(await pending).toMatchObject({
      status: 'cancelled',
      run: null,
      directions: [],
      proposals: [],
    });
  });

  it('retains unchanged adopted rules and refuses a direction when its actual paint violates them', async () => {
    const source = fixture(input => ({
      ...input,
      rules: [
        {
          ...scope,
          id: 'fixed-primary',
          label: 'Blue leads',
          kind: 'role-binding',
          force: 'requirement',
          operands: { role: 'primary', members: [{ kind: 'color', id: 'blue' }] },
        },
      ],
    }));
    const result = await generateGuidelineSupportingDirections(source, brand);
    expect(result.status).toBe('ready');
    expect(result.proposals.every(p => p.pendingRuleIds.length === 0)).toBe(true);
    for (const direction of result.directions)
      expect(direction.recipe.selection!.model.adoptions).toEqual(source.model.adoptions);
    const wrong = await generateGuidelineSupportingDirections(source, {
      ...brand,
      sourcePaints: { ...brand.sourcePaints, primary: 'orange' },
    });
    expect(wrong.status).toBe('blocked');
    expect(wrong.directions).toEqual([]);
  });

  it('blocks unresolved conflicts and missing decisions that affect the actual application', async () => {
    const source = fixture(input => ({
      ...input,
      evidence: [
        {
          id: 'conflict-evidence',
          sourceId: 'source',
          locator: null,
          status: 'observed',
          description: 'Conflicting source notes',
        },
      ],
      claims: ['claim-a', 'claim-b'].map(id => ({
        id,
        sourceId: 'source',
        text: id,
        status: 'inferred',
        evidenceRefs: ['conflict-evidence'],
        contextIds: ['brand'],
        ruleIds: [],
      })),
      conflicts: [
        {
          id: 'conflict',
          message: 'Primary is unclear',
          status: 'unresolved',
          claimIds: ['claim-a', 'claim-b'],
          evidenceRefs: ['conflict-evidence'],
          contextIds: ['brand'],
          ruleIds: [],
        },
      ],
    }));
    const conflict = await generateGuidelineSupportingDirections(source, brand);
    expect(conflict.status).toBe('blocked');
    expect(conflict.directions).toEqual([]);
    const adopted = fixture(input => ({
      ...input,
      rules: [
        {
          ...scope,
          id: 'fixed-primary',
          label: 'Blue leads',
          kind: 'role-binding',
          force: 'requirement',
          operands: { role: 'primary', members: [{ kind: 'color', id: 'blue' }] },
        },
      ],
    }));
    const { modelHash: _, ...input } = adopted.model;
    const model = buildColorSystemModelV1({ ...input, adoptions: [] });
    const result = await generateGuidelineSupportingDirections(
      { model, reviewHash: guidelineHash(model.modelHash) },
      brand
    );
    expect(result.status).toBe('blocked');
    expect(result.directions).toEqual([]);
    expect(
      result.proposals.some(proposal => proposal.pendingRuleIds.includes('fixed-primary'))
    ).toBe(true);
  });

  it('retains an unused value gap without blocking unrelated valid paints', async () => {
    const source = fixture(input => ({
      ...input,
      colors: [
        ...input.colors,
        {
          ...links,
          id: 'unresolved-alias',
          label: 'Unresolved alias',
          sourceId: 'source',
          valuesByMode: {},
          claimIds: ['missing-value'],
          valueGapClaimIdsByMode: { Source: ['missing-value'] },
        },
      ],
      claims: [
        {
          id: 'missing-value',
          sourceId: 'source',
          text: 'Unresolved library alias',
          status: 'unsupported',
          evidenceRefs: [],
          contextIds: [],
          ruleIds: [],
          modeIds: ['Source'],
        },
      ],
      coverage: input.coverage.map(item => ({
        ...item,
        status: 'partial',
        unresolvedClaimIds: ['missing-value'],
      })),
    }));
    const result = await generateGuidelineSupportingDirections(source, brand);
    expect(result.status).toBe('ready');
    expect(result.directions[0].recipe.selection!.model.colors).toContainEqual(
      source.model.colors.find(c => c.id === 'unresolved-alias')
    );
    await expect(
      generateGuidelineSupportingDirections(source, {
        ...brand,
        anchorColorIds: ['unresolved-alias'],
      })
    ).rejects.toThrow('available source value');
  });

  it('rejects malformed controls and unavailable source modes', async () => {
    const source = fixture();
    await expect(
      generateGuidelineSupportingDirections(source, { ...brand, anchorColorIds: ['blue', 'blue'] })
    ).rejects.toThrow('unique bounded');
    await expect(
      generateGuidelineSupportingDirections(source, { ...brand, anchorColorIds: ['unknown'] })
    ).rejects.toThrow('available source value');
    await expect(
      generateGuidelineSupportingDirections(source, {
        ...brand,
        layout: { ...brand.layout, modeId: 'Unknown' },
      })
    ).rejects.toThrow('do not exist');
    await expect(
      generateGuidelineSupportingDirections(source, { ...brand, provider: 'werner' })
    ).rejects.toThrow('Wada combinations');
  });

  it('enforces whole-family exclusions instead of returning outside-territory alternatives', async () => {
    const source = fixture(input => {
      const rule: ColorSystemBrandTerritoryRuleV1 = {
        id: 'exclude-all',
        label: 'No new colors here',
        kind: 'brand-territory',
        scope: {
          kind: 'generated-families',
          prominence: ['supporting'],
          jobs: 'all',
          modes: 'all',
        },
        bounds: {
          hueRanges: [{ minimum: 0, maximum: 360 }],
          chroma: { minimum: 0, maximum: 0.5 },
          lightness: { minimum: 0, maximum: 1 },
        },
        effect: 'exclude',
        origin: 'owner-authored',
        evidenceRefs: ['fixture-rule'],
      };
      const fragment = buildColorSystemBrandConstraintsV1({
        schemaVersion: 'teul.brand-constraints.v1',
        sourceSnapshotHash: input.sources[0].sourceHash,
        rules: [rule],
        decisions: [
          {
            ruleId: rule.id,
            ruleHash: hashColorSystemBrandTerritoryRuleV1(rule),
            status: 'accepted',
            actor: { kind: 'user', ref: 'fixture-user' },
            authorityRef: 'fixture',
          },
        ],
      });
      return {
        ...input,
        evidence: [
          {
            id: 'fixture-rule',
            sourceId: 'source',
            locator: null,
            status: 'observed',
            description: 'Synthetic restriction',
          },
        ],
        brandConstraintsByContext: [
          { id: 'scope', sourceId: 'source', contextIds: ['brand'], fragment },
        ],
      };
    });
    const result = await generateGuidelineSupportingDirections(source, brand);
    expect(result.status).toBe('blocked');
    expect(result.directions).toEqual([]);
  });

  it('replays before exporting actual SVG and rejects copied results as export authority', async () => {
    const source = fixture();
    const result = await generateGuidelineSupportingDirections(source, brand);
    const exported = await exportGuidelineSupportingDirection(result, result.directions[0].id);
    expect(exported.svgs).toHaveLength(1);
    const reopened = await readGuidelineSupportingDirection(exported.json, source);
    expect(reopened.result.directions.find(d => d.id === reopened.directionId)?.recipe).toEqual(
      result.directions[0].recipe
    );
    const anotherRuntime = JSON.parse(exported.json);
    anotherRuntime.recipe.selection.executionReceiptHash = guidelineHash('old runtime receipt');
    expect(
      (await readGuidelineSupportingDirection(JSON.stringify(anotherRuntime), source)).result
        .directions[0].recipe
    ).toEqual(result.directions[0].recipe);
    const stale = { ...source, reviewHash: guidelineHash('different decision') };
    await expect(readGuidelineSupportingDirection(exported.json, stale)).rejects.toThrow(
      'changed source review'
    );
    const forged = JSON.parse(exported.json);
    forged.provenance.classification = 'exact-library';
    await expect(readGuidelineSupportingDirection(JSON.stringify(forged), source)).rejects.toThrow(
      'freshly checked'
    );
    const forgedAuthority = JSON.parse(exported.json);
    forgedAuthority.decisions = [{ actor: { kind: 'agent', ref: 'forged' } }];
    await expect(
      readGuidelineSupportingDirection(JSON.stringify(forgedAuthority), source)
    ).rejects.toThrow();
    expect(JSON.parse(exported.json)).toMatchObject({
      sourceModelHash: source.model.modelHash,
      reviewHash: source.reviewHash,
    });
    await expect(
      exportGuidelineSupportingDirection(
        JSON.parse(JSON.stringify(result)),
        result.directions[0].id
      )
    ).rejects.toThrow('Recompute');
    await expect(exportGuidelineSupportingDirection(result, 'missing')).rejects.toThrow('eligible');
  });

  it('reopens the exact eligible paint when numeric candidate IDs and the shortlist change', async () => {
    const source = fixture();
    const result = await generateGuidelineSupportingDirections(source, brand);
    const selected = result.directions[0];
    const exported = await exportGuidelineSupportingDirection(result, selected.id);
    const selectedPaint = selected.recipe.selection!.applications[0].uses.find(
      use => use.id === 'secondary'
    )!.colorId;
    const execute = authoringRun.executeColorSystemAuthoringRunV1;
    const rename = (candidate: authoringRun.ColorSystemAuthoringRunV1['directions'][number]) => ({
      ...candidate,
      id: `${candidate.id}:runtime`,
    });
    const spy = vi
      .spyOn(authoringRun, 'executeColorSystemAuthoringRunV1')
      .mockImplementation(async (...args) => {
        const fresh = await execute(...args);
        if (!fresh.ranking || fresh.ranking.status === 'cancelled') return fresh;
        const directions = fresh.directions
          .filter(
            candidate =>
              candidate.applications.applications[0].application.uses.find(
                use => use.id === 'secondary'
              )!.colorId !== selectedPaint
          )
          .map(rename);
        return {
          ...fresh,
          directions,
          executions: fresh.executions.map(execution => ({
            ...execution,
            candidates: execution.candidates.map(rename),
          })),
          ranking: fresh.ranking
            ? { ...fresh.ranking, directions, assessments: fresh.ranking.assessments.map(rename) }
            : null,
        };
      });
    try {
      const reopened = await readGuidelineSupportingDirection(exported.json, source);
      expect(reopened.directionId).toBe(selected.id);
      expect(reopened.result.directions).toHaveLength(1);
      expect(reopened.result.directions[0].recipe).toEqual(selected.recipe);
      expect((await exportGuidelineSupportingDirection(reopened.result, selected.id)).svgs).toEqual(
        exported.svgs
      );
    } finally {
      spy.mockRestore();
    }
  });
});
