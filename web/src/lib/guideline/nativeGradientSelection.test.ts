import { describe, expect, it } from 'vitest';
import { nativeGradientEditFixture } from '../../../fixtures/guidelines/native-gradient-edit-fixture';
import { nativeGradientComparisonFixture } from '../../../fixtures/guidelines/native-gradient-comparison-fixture';
import { nativeGradientInventoryFixture } from '../../../fixtures/guidelines/native-gradient-fixture';
import { sourceSetPdf } from '../../../fixtures/guidelines/source-set-fixture';
import { createFigmaNativeInventory } from './figmaInventory';
import { buildColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { hashCanonical } from './intakeClient';
import { guidelineHash } from './review';
import { suggestFigmaReview, compileFigmaReview } from './figmaReview';
import { buildFigmaProject } from './figmaProject';
import { applySourceSetReview, prepareSourceSetEntry, type SourceSetDraft } from './sourceSet';
import {
  singleNativeGradientSources,
  sourceSetNativeGradientSources,
} from './nativeGradientWorkspace';
import {
  createGuidelineNativeGradient,
  readGuidelineNativeGradient,
  guidelineNativeGradientSvgs,
} from './nativeGradientSelection';

async function mixedModeFixture() {
  const value = await nativeGradientEditFixture(doc => {
    doc.children.push({
      id: '4:1',
      type: 'TEXT',
      name: 'Product rule',
      characters: 'Never use gradients in product.',
    });
  });
  const { contentHash: _hash, ...original } = value.inventory.packet;
  const content = {
    ...original,
    request: { ...original.request, includeVariables: true },
    variables: {
      status: 'captured',
      revision: null,
      relationship: 'unversioned-current-read',
      values: {
        blue: {
          id: 'blue',
          name: 'Variable blue',
          variableCollectionId: 'brand',
          resolvedType: 'COLOR',
          valuesByMode: { day: { r: 0.1, g: 0.2, b: 0.7, a: 1 } },
        },
      },
      collections: {
        brand: {
          id: 'brand',
          name: 'Brand',
          modes: [{ modeId: 'day', name: 'Day' }],
          defaultModeId: 'day',
        },
      },
    },
  };
  const inventory = await createFigmaNativeInventory({
    ...content,
    contentHash: await hashCanonical(canonicalIntakeJson(content)),
  });
  const draft = suggestFigmaReview(inventory);
  draft.modeIds = inventory.modes.map(mode => mode.id);
  draft.colors = inventory.declarations.map(item => ({
    declarationId: item.id,
    label: item.label,
    family: 'Synthetic',
  }));
  draft.profileDecision = {
    ...value.draft.profileDecision!,
    captureHash: inventory.packet.contentHash,
  };
  draft.scopeDecision = value.draft.scopeDecision;
  const review = compileFigmaReview(
    inventory,
    draft,
    value.review.decision.actor,
    value.review.decision.reviewedAt
  );
  const sources = singleNativeGradientSources(inventory, review);
  const variableMode = inventory.modes.find(mode => mode.id !== sources[0].evidence.modeId)!.id;
  return { ...value, inventory, draft, review, sources, variableMode };
}

describe('native gradient source-bound selection', () => {
  it('cannot bypass a captured-mode rule by selecting an unrestricted variable mode', async () => {
    const value = await mixedModeFixture();
    expect(() =>
      createGuidelineNativeGradient(value.review, value.sources[0], {
        ...value.controls,
        scope: 'product',
      })
    ).toThrow('Review required');
    expect(() =>
      createGuidelineNativeGradient(value.review, value.sources[0], {
        ...value.controls,
        scope: 'product',
        modeId: value.variableMode,
      })
    ).toThrow('captured-paints source mode');
    const project = await buildFigmaProject({
      capture: value.inventory.packet,
      draft: value.draft,
      review: value.review,
      selection: null,
    });
    const prepared = await prepareSourceSetEntry(JSON.stringify(project), 'native-member');
    const companion = await prepareSourceSetEntry(JSON.stringify(sourceSetPdf()), 'pdf-member');
    const draft: SourceSetDraft = {
      entries: [{ ...prepared.entry, modeId: value.variableMode }, companion.entry],
      subjects: [...prepared.subjects, ...companion.subjects],
      scope: 'product',
      resolutions: [],
    };
    const review = await applySourceSetReview(draft, {
      actor: value.review.decision.actor,
      reviewedAt: value.review.decision.reviewedAt,
    });
    const sources = await sourceSetNativeGradientSources(draft, undefined, review);
    expect(() =>
      createGuidelineNativeGradient(review, sources[0], {
        ...value.controls,
        scope: 'product',
        modeId: 'Working',
      })
    ).toThrow('captured-paints member mode');
  });

  it('cold replays a maximum-stop selection with large retained source metadata', async () => {
    const positions = Array.from({ length: 256 }, (_, i) => i / 255);
    const value = await nativeGradientEditFixture(doc => {
      doc.children[0].fills[0].gradientStops = positions.map(position => ({
        position,
        color: { r: 0.1234567890123456, g: 0.2, b: 0.7, a: 0.375 },
        boundVariables: { color: { type: 'VARIABLE_ALIAS', id: `VariableID:${'x'.repeat(300)}` } },
      }));
    });
    const selection = createGuidelineNativeGradient(value.review, value.sources[0], {
      ...value.controls,
      positions,
    });
    const json = JSON.stringify(selection);
    expect(json.length).toBeGreaterThan(256_000);
    expect(readGuidelineNativeGradient(value.review, JSON.parse(json), value.sources)).toEqual(
      selection
    );
  });
  it('cold replays exact captured RGBA and authored geometry without admitting native stops as solids', async () => {
    const { review, sources, controls } = await nativeGradientEditFixture();
    const before = guidelineHash(review);
    const selection = createGuidelineNativeGradient(review, sources[0], controls);
    expect(
      readGuidelineNativeGradient(review, JSON.parse(JSON.stringify(selection)), sources)
    ).toEqual(selection);
    expect(selection.design.sourceEvidenceHash).toBe(sources[0].evidence.evidenceHash);
    expect(selection.design.originalPaint).toEqual(sources[0].evidence.paint);
    expect(selection.design.stops.map(stop => stop.sourceColorId)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(review.model.colors).toHaveLength(2);
    expect(guidelineHash(review)).toBe(before);
    const { originalSvg, editedSvg } = guidelineNativeGradientSvgs(selection, 400, 200);
    expect(originalSvg).toContain('matrix(400 0 0 100 -100 60)');
    expect(editedSvg).toContain('matrix(0 200 -200 0 100 -40)');
    for (const svg of [originalSvg, editedSvg]) {
      expect(svg).toContain('stop-opacity="0.375"');
      expect(svg).toContain('stop-opacity="0"');
    }
    expect(readGuidelineNativeGradient(null, null, [])).toBeNull();
  });

  it.each([
    'source',
    'member',
    'mode',
    'draft',
    'rgba',
    'original',
    'interpretation',
    'solid',
    'review',
    'geometry',
  ])('rejects a saved %s substitution even with a recalculated design hash', async field => {
    const { review, sources, controls } = await nativeGradientEditFixture();
    const raw = JSON.parse(
      JSON.stringify(createGuidelineNativeGradient(review, sources[0], controls))
    );
    if (field === 'source') raw.source.evidenceHash = guidelineHash('different');
    if (field === 'member') raw.source.sourceEntryId = 'other';
    if (field === 'mode') raw.modeId = 'unknown';
    if (field === 'draft') raw.source.sourceSetDraftHash = guidelineHash('other');
    if (field === 'rgba') raw.design.paint.gradientStops[0].color.a = 1;
    if (field === 'original') raw.design.originalPaint.gradientStops[0].color.r = 0.5;
    if (field === 'interpretation') raw.design.interpretation = 'oklab';
    if (field === 'solid') raw.design.stops[0].sourceColorId = review.model.colors[0].id;
    if (field === 'review') raw.design.briefHash = guidelineHash('other');
    if (field === 'geometry') raw.design.paint.gradientHandlePositions[0].x += 0.1;
    const { designHash: _hash, ...body } = raw.design;
    raw.design.designHash = guidelineHash(body);
    expect(() => readGuidelineNativeGradient(review, raw, sources)).toThrow();
  });

  it('requires a source from the current validated loader and rejects gradient-only capture changes', async () => {
    const value = await nativeGradientEditFixture();
    const selection = createGuidelineNativeGradient(value.review, value.sources[0], value.controls);
    expect(() =>
      createGuidelineNativeGradient(value.review, { ...value.sources[0] }, value.controls)
    ).toThrow('validated');
    expect(() => readGuidelineNativeGradient(value.review, selection, [])).toThrow();
    expect(() =>
      readGuidelineNativeGradient(value.review, selection, [...value.sources, ...value.sources])
    ).toThrow();
    const changed = await nativeGradientEditFixture(doc => {
      doc.children[0].fills[0].gradientStops[0].color.r = 0.55;
    });
    expect(() => readGuidelineNativeGradient(value.review, selection, changed.sources)).toThrow();
    expect(() =>
      createGuidelineNativeGradient(value.review, changed.sources[0], changed.controls)
    ).toThrow('validated review');
  });

  it.each(['mask', 'effect', 'clipping', 'blending', 'profile', 'other-paint'])(
    'retains the captured %s refusal',
    async kind => {
      const value = await nativeGradientEditFixture(doc => {
        if (kind === 'mask') doc.isMask = true;
        if (kind === 'effect') doc.effects = [{ type: 'LAYER_BLUR', radius: 2 }];
        if (kind === 'clipping') doc.clipsContent = true;
        if (kind === 'blending') doc.blendMode = 'MULTIPLY';
        if (kind === 'profile') doc.children[0].fills[0].colorProfile = 'DISPLAY_P3';
        if (kind === 'other-paint')
          doc.children[0].fills.push({ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } });
      });
      expect(() =>
        createGuidelineNativeGradient(value.review, value.sources[0], value.controls)
      ).toThrow();
    }
  );

  it('does not reinterpret the existing radial or no-gradients development sources as editable', async () => {
    const radial = await nativeGradientComparisonFixture();
    expect(() =>
      createGuidelineNativeGradient(
        radial.review,
        singleNativeGradientSources(radial.inventory, radial.review)[0],
        {
          scope: 'brand',
          modeId: radial.review.model.modes[0].id,
          interpretation: 'srgb',
          rotationDegrees: 0,
          positions: [0, 1],
        }
      )
    ).toThrow('linear');
    const inventory = await nativeGradientInventoryFixture();
    const draft = suggestFigmaReview(inventory);
    draft.modeIds = [inventory.modes[0].id];
    draft.colors = inventory.declarations
      .filter(item =>
        item.observations.some(observation => observation.modeId === draft.modeIds[0])
      )
      .map(item => ({ declarationId: item.id, label: item.label, family: 'Synthetic' }));
    draft.scopeDecision = {
      accepted: true,
      reason: 'Test the captured prohibition without changing it.',
    };
    draft.profileDecision = {
      captureHash: draft.captureHash,
      interpretation: 'srgb',
      actor: radial.review.decision.actor,
      decidedAt: radial.review.decision.reviewedAt,
    };
    const review = compileFigmaReview(
      inventory,
      draft,
      radial.review.decision.actor,
      radial.review.decision.reviewedAt
    );
    expect(() =>
      createGuidelineNativeGradient(review, singleNativeGradientSources(inventory, review)[0], {
        scope: 'brand',
        modeId: review.model.modes[0].id,
        interpretation: 'srgb',
        rotationDegrees: 0,
        positions: [0, 1],
      })
    ).toThrow();
  });

  it('rechecks unresolved operation claims instead of trusting the native source appearance', async () => {
    const value = await nativeGradientEditFixture(doc => {
      doc.children.push({
        id: '4:1',
        type: 'TEXT',
        name: 'Restriction',
        characters: 'Do not use gradients.',
      });
    });
    expect(() =>
      createGuidelineNativeGradient(value.review, value.sources[0], value.controls)
    ).toThrow('Review required');
  });

  it.each([['brand'], null, {}, 1])('rejects a malformed scope %j', async scope => {
    const value = await nativeGradientEditFixture();
    expect(() =>
      createGuidelineNativeGradient(value.review, value.sources[0], {
        ...value.controls,
        scope,
      } as any)
    ).toThrow('requires');
  });

  it('requires full capture and review replay even when native node paint is unchanged', async () => {
    const value = await nativeGradientEditFixture();
    const { contentHash: _hash, ...content } = structuredClone(value.inventory.packet);
    content.capturedAt = '2026-09-28T01:00:00.000Z';
    const inventory = await createFigmaNativeInventory({
      ...content,
      contentHash: await hashCanonical(canonicalIntakeJson(content)),
    });
    expect(inventory.sources[0].sourceHash).toBe(value.inventory.sources[0].sourceHash);
    expect(() => singleNativeGradientSources(inventory, value.review)).toThrow();
    expect(() =>
      createGuidelineNativeGradient(
        value.review,
        singleNativeGradientSources(inventory)[0],
        value.controls
      )
    ).toThrow('validated review');
    const forgedReview = { ...value.review, reviewHash: guidelineHash('other') };
    expect(() => singleNativeGradientSources(value.inventory, forgedReview)).toThrow('differs');
    expect(() =>
      createGuidelineNativeGradient(forgedReview, value.sources[0], value.controls)
    ).toThrow('validated review');
  });

  it('binds combined sources to the reviewed draft and rejects another member or scope even with matching capture', async () => {
    const value = await nativeGradientEditFixture();
    const project = await buildFigmaProject({
      capture: value.inventory.packet,
      draft: value.draft,
      review: value.review,
      selection: null,
    });
    const prepared = await prepareSourceSetEntry(JSON.stringify(project), 'native-member');
    const companion = await prepareSourceSetEntry(JSON.stringify(sourceSetPdf()), 'pdf-member');
    const draft: SourceSetDraft = {
      entries: [prepared.entry, companion.entry],
      subjects: [...prepared.subjects, ...companion.subjects],
      scope: 'brand',
      resolutions: [],
    };
    const review = await applySourceSetReview(draft, {
      actor: value.review.decision.actor,
      reviewedAt: value.review.decision.reviewedAt,
    });
    const sources = await sourceSetNativeGradientSources(draft, undefined, review);
    const selection = createGuidelineNativeGradient(review, sources[0], {
      ...value.controls,
      modeId: 'Working',
    });
    expect(selection.source.sourceSetDraftHash).toBe(review.decision.draftHash);
    expect(selection.source.sourceEntryModeId).toBe(prepared.entry.modeId);
    expect(
      readGuidelineNativeGradient(review, JSON.parse(JSON.stringify(selection)), sources)
    ).toEqual(selection);
    const changedSources = await sourceSetNativeGradientSources({ ...draft, scope: 'product' });
    expect(() =>
      createGuidelineNativeGradient(review, changedSources[0], {
        ...value.controls,
        modeId: 'Working',
      })
    ).toThrow('validated review');
    expect(() => readGuidelineNativeGradient(review, selection, changedSources)).toThrow(
      'validated review'
    );
    const wrongMember = JSON.parse(JSON.stringify(selection));
    wrongMember.source.sourceEntryModeId = 'Working';
    expect(() => readGuidelineNativeGradient(review, wrongMember, sources)).toThrow();
    const forbiddenCompanion = await prepareSourceSetEntry(
      JSON.stringify(sourceSetPdf('Restricted', '#123456', 'no-gradients')),
      'pdf-member'
    );
    const forbiddenDraft = {
      ...draft,
      entries: [prepared.entry, forbiddenCompanion.entry],
      subjects: [...prepared.subjects, ...forbiddenCompanion.subjects],
    };
    const forbiddenReview = await applySourceSetReview(forbiddenDraft, {
      actor: value.review.decision.actor,
      reviewedAt: value.review.decision.reviewedAt,
    });
    const forbiddenSources = await sourceSetNativeGradientSources(
      forbiddenDraft,
      undefined,
      forbiddenReview
    );
    expect(() =>
      createGuidelineNativeGradient(forbiddenReview, forbiddenSources[0], {
        ...value.controls,
        modeId: 'Working',
      })
    ).toThrow('Review required');
    const { modelHash: _modelHash, ...modelContent } = forbiddenReview.model;
    const changedModel = buildColorSystemModelV1({
      ...modelContent,
      claims: modelContent.claims.map(claim => ({ ...claim, status: 'inferred' as const })),
    });
    expect(changedModel.modelHash).not.toBe(forbiddenReview.model.modelHash);
    const { reviewHash: _reviewHash, ...reviewContent } = forbiddenReview;
    const changedReview = {
      ...reviewContent,
      model: changedModel,
      reviewHash: guidelineHash({ ...reviewContent, model: changedModel }),
    };
    expect(() =>
      createGuidelineNativeGradient(changedReview, forbiddenSources[0], {
        ...value.controls,
        modeId: 'Working',
      })
    ).toThrow('validated review');
    await expect(
      sourceSetNativeGradientSources(forbiddenDraft, undefined, changedReview)
    ).rejects.toThrow('differs');
    const unreviewed = await sourceSetNativeGradientSources(draft);
    expect(() =>
      createGuidelineNativeGradient(review, unreviewed[0], { ...value.controls, modeId: 'Working' })
    ).toThrow('validated review');
    const clone = { ...sources[0] };
    expect(() =>
      createGuidelineNativeGradient(review, clone, { ...value.controls, modeId: 'Working' })
    ).toThrow('validated');
  });
});
