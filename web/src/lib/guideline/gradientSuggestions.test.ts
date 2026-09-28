import { buildColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/guidelines/figma-project-v1.json';
import { readFigmaProject, buildFigmaProject } from './figmaProject';
import {
  suggestGuidelineGradients,
  type GuidelineGradientSuggestionRequest,
} from './gradientSuggestions';
import {
  createGuidelineGradientCatalog,
  readGuidelineGradientCatalog,
  gradientCatalogIssues,
} from './gradientCatalog';
import {
  CATALOG_GRADIENT_VERSION,
  authoredGradientControls,
  createGuidelineAuthoredGradient,
  readGuidelineAuthoredGradient,
} from './authoredGradient';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import { createGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh } from './refreshReplay';
import { guidelineAuthoredGradientExports } from './gradientExport';
import { guidelineHash } from './review';

async function setup() {
  const opened = await readFigmaProject(fixture);
  if (opened.status !== 'opened' || !opened.project.review) throw new Error('Fixture');
  const review = opened.project.review;
  const request: GuidelineGradientSuggestionRequest = {
    scope: 'brand',
    modeId: review.model.modes[0].id,
    sourceAnchorIds: [review.model.colors[0].id],
    provider: 'radix',
    scheme: 'light',
    exploration: 'restrained',
    angle: 120,
    policy: { origin: 'designer-authored', use: { kind: 'decorative' }, limits: [] },
    allowCatalogColors: true,
  };
  const source = {
    kind: 'figma' as const,
    project: await buildFigmaProject({
      capture: opened.project.capture,
      draft: opened.project.draft,
      review,
      selection: null,
    }),
    inventory: opened.inventory,
  };
  return { review, request, source };
}
describe('catalog-supported gradient exploration', () => {
  it('returns distinct checked proposals while preserving exact locked source values and library provenance', async () => {
    const { review, request } = await setup();
    const before = JSON.stringify(review);
    const result = await suggestGuidelineGradients(review, request);
    expect(result.directions.length).toBeGreaterThan(0);
    expect(result.directions.length).toBeLessThanOrEqual(3);
    expect(result.counts.families).toBeLessThanOrEqual(8);
    expect(result.counts.attempted).toBeLessThanOrEqual(24);
    expect(new Set(result.directions.map(d => d.id)).size).toBe(result.directions.length);
    for (const direction of result.directions) {
      const selection = direction.selection;
      expect(selection.schemaVersion).toBe(CATALOG_GRADIENT_VERSION);
      expect(selection.design.sourceModelHash).toBe(review.model.modelHash);
      expect(selection.design.stops[0]).toMatchObject({
        sourceColorId: request.sourceAnchorIds[0],
        locked: true,
        value: review.model.colors[0].valuesByMode[request.modeId],
      });
      expect(selection.design.stops[1].sourceColorId).toBeNull();
      const portable = guidelineAuthoredGradientExports(review, selection);
      expect(portable.assessment?.status).toBe('pass');
      expect(JSON.parse(portable.json).schemaVersion).toBe(
        'teul.guideline-authored-gradient-export.v3'
      );
      expect(readGuidelineAuthoredGradient(review, JSON.parse(JSON.stringify(selection)))).toEqual(
        selection
      );
    }
    expect(JSON.stringify(review)).toBe(before);
    expect(await suggestGuidelineGradients(review, request)).toEqual(result);
  });
  it('does not relabel an unselected source paint as a new addition and retains source bans and conflicts', async () => {
    const { review, request } = await setup();
    const first = (await suggestGuidelineGradients(review, request)).directions[0].selection;
    const { modelHash, ...input } = review.model;
    void modelHash;
    const proposed = first.design.stops.find(s => s.sourceColorId === null)!.value;
    const model = buildColorSystemModelV1({
      ...input,
      colors: [
        ...input.colors,
        {
          ...input.colors[0],
          id: 'existing-unselected',
          label: 'Existing source color',
          valuesByMode: { [request.modeId]: proposed },
        },
      ],
    });
    const result = await suggestGuidelineGradients(
      { model, reviewHash: guidelineHash(model.modelHash) },
      request
    );
    for (const direction of result.directions)
      expect(
        direction.selection.design.stops.find(s => s.sourceColorId === null)!.value
      ).not.toEqual(proposed);
    await expect(
      suggestGuidelineGradients(review, { ...request, scope: 'product' })
    ).rejects.toThrow();
    const contradicted = buildColorSystemModelV1({
      ...input,
      coverage: input.coverage.map(c => ({
        ...c,
        unresolvedClaimIds: [...c.unresolvedClaimIds, input.claims[0].id],
      })),
      claims: input.claims.map((c, i) => (i === 0 ? { ...c, status: 'contradicted' } : c)),
    });
    await expect(
      suggestGuidelineGradients(
        { model: contradicted, reviewHash: guidelineHash(contradicted.modelHash) },
        request
      )
    ).rejects.toThrow('Review required');
    const closed = buildColorSystemModelV1({
      ...input,
      rules: [
        {
          id: 'closed-palette',
          label: 'Keep source palette',
          kind: 'palette-membership',
          force: 'requirement',
          origin: 'inferred',
          evidenceRefs: [],
          claimIds: [],
          contextIds: ['gradient:brand'],
          modeIds: [request.modeId],
          operands: { members: input.colors.map(c => ({ kind: 'color', id: c.id })) },
        },
      ],
    });
    const closedReview = { model: closed, reviewHash: guidelineHash(closed.modelHash) };
    expect(gradientCatalogIssues(closedReview, 'brand', request.modeId).join(' ')).toContain(
      'existing palette'
    );
    await expect(suggestGuidelineGradients(closedReview, request)).rejects.toThrow();
    const conflict = buildColorSystemModelV1({
      ...input,
      conflicts: [
        {
          id: 'conflict',
          message: 'Conflicting gradient guidance',
          status: 'unresolved',
          claimIds: [input.claims[0].id, input.claims[1].id],
          evidenceRefs: input.claims[0].evidenceRefs,
          contextIds: ['gradient:brand'],
          ruleIds: [],
        },
      ],
    });
    await expect(
      suggestGuidelineGradients(
        { model: conflict, reviewHash: guidelineHash(conflict.modelHash) },
        request
      )
    ).rejects.toThrow('Conflicting gradient');
  });
  it.each(['wada', 'werner'] as const)(
    'preserves multiple source anchors and disclosures for expressive %s exploration',
    async provider => {
      const { review, request } = await setup();
      const result = await suggestGuidelineGradients(review, {
        ...request,
        provider,
        scheme: null,
        exploration: 'expressive',
        sourceAnchorIds: review.model.colors.slice(0, 2).map(c => c.id),
      });
      expect(result.counts.attempted).toBeLessThanOrEqual(24);
      if (provider === 'wada') expect(result.directions.length).toBeGreaterThan(0);
      for (const direction of result.directions) {
        expect(direction.disclosure).toContain('digital approximations');
        expect(
          direction.selection.design.stops
            .filter(s => s.sourceColorId !== null)
            .every(s => s.locked)
        ).toBe(true);
        expect(direction.selection.design.stops.filter(s => s.sourceColorId !== null)).toHaveLength(
          2
        );
      }
    }
  );
  it('rejects missing permission, invalid references and a failing actual foreground; supports cancellation', async () => {
    const { review, request } = await setup();
    await expect(
      suggestGuidelineGradients(review, { ...request, allowCatalogColors: false } as never)
    ).rejects.toThrow('permission');
    await expect(
      suggestGuidelineGradients(review, { ...request, sourceAnchorIds: ['invented'] })
    ).rejects.toThrow('reference');
    await expect(suggestGuidelineGradients(review, { ...request, scheme: null })).rejects.toThrow();
    const result = await suggestGuidelineGradients(review, {
      ...request,
      policy: {
        ...request.policy,
        use: {
          kind: 'text',
          foregroundColorId: request.sourceAnchorIds[0],
          minimumRatio: 4.5,
          footprint: { start: 0, end: 1 },
        },
      },
    });
    expect(result.directions).toEqual([]);
    expect(result.counts.rejected).toBeGreaterThan(0);
    const controller = new AbortController();
    const pending = suggestGuidelineGradients(review, request, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
  it('rejects forged catalog membership, source binding, scheme, permission scope and stop origins', async () => {
    const { review, request } = await setup();
    const selection = (await suggestGuidelineGradients(review, request)).directions[0].selection;
    if (selection.schemaVersion !== CATALOG_GRADIENT_VERSION) throw new Error('version');
    for (const patch of [
      { provider: 'wada' },
      { scheme: 'dark' },
      { catalogHash: 'sha256:' + 'a'.repeat(64) },
      { sourceModelHash: 'sha256:' + 'a'.repeat(64) },
      { reviewHash: 'sha256:' + 'a'.repeat(64) },
      { memberIds: ['missing'] },
      { origin: 'source-reviewed' },
    ])
      expect(() =>
        readGuidelineGradientCatalog(review, { ...selection.catalog, ...patch })
      ).toThrow();
    expect(() =>
      createGuidelineAuthoredGradient(
        review,
        { ...authoredGradientControls(selection), scope: 'product' },
        selection.policy,
        selection.catalog
      )
    ).toThrow();
    const raw = JSON.parse(JSON.stringify(selection));
    raw.stopRefs[1] = { kind: 'source', colorId: request.sourceAnchorIds[0] };
    expect(() => readGuidelineAuthoredGradient(review, raw)).toThrow();
    const missing = JSON.parse(JSON.stringify(selection));
    missing.catalog = null;
    expect(() => readGuidelineAuthoredGradient(review, missing)).toThrow();
    const changed = JSON.parse(JSON.stringify(selection));
    changed.design.stops[1].value.components.r += 0.01;
    expect(() => readGuidelineAuthoredGradient(review, changed)).toThrow();
  });
  it('round-trips workspace V6, rejects an older wrapper and preserves selected paint through refresh lineage V5', async () => {
    const { source, review, request } = await setup();
    const selection = (await suggestGuidelineGradients(review, request)).directions[0].selection;
    if (selection.schemaVersion !== CATALOG_GRADIENT_VERSION) throw new Error('version');
    const bytes = await serializeGuidelineWorkspace(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      null,
      selection
    );
    expect(JSON.parse(bytes).schemaVersion).toBe('teul.guideline-workspace.v6');
    const opened = await readAnyGuidelineProject(bytes);
    if (opened.status !== 'opened') throw new Error('open');
    expect(opened.value.gradientSelection).toEqual(selection);
    const legacy = JSON.parse(bytes);
    legacy.schemaVersion = 'teul.guideline-workspace.v5';
    const { bundleHash, ...body } = legacy;
    void bundleHash;
    legacy.bundleHash = guidelineHash(body);
    await expect(readAnyGuidelineProject(JSON.stringify(legacy))).rejects.toThrow('V6');
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      source,
      undefined,
      selection
    );
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v5');
    const replay = await replayGuidelineRefresh(lineage, source);
    expect(replay.items.find(i => i.kind === 'gradient')?.status).toBe('restorable');
    expect(replay.selection?.design.compiledPaint).toEqual(selection.design.compiledPaint);
    const subset = createGuidelineGradientCatalog(review, {
      ...selection.catalog,
      memberIds: [selection.stopRefs[1].kind === 'catalog' ? selection.stopRefs[1].memberId : ''],
    });
    expect(readGuidelineGradientCatalog(review, subset).members).toHaveLength(1);
  });
});
