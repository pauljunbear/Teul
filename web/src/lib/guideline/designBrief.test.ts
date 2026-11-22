import { describe, expect, it } from 'vitest';
import figma from '../../../fixtures/guidelines/figma-project-v1.json';
import { sourceSetPdf } from '../../../fixtures/guidelines/source-set-fixture';
import { buildColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { EMPTY_GUIDELINE_OUTPUTS, storedGuidelineOutputs } from './selectedOutputs';
import { guidelineHash } from './review';
import {
  createGuidelineDesignBrief,
  readGuidelineDesignBrief,
  type GuidelineDesignBriefInput,
} from './designBrief';
import { prepareSourceSetEntry, applySourceSetReview, type SourceSetDraft } from './sourceSet';
import { readSourceSetProject, serializeSourceSetProject } from './sourceSetProject';

async function fixture() {
  const opened = await readAnyGuidelineProject(JSON.stringify(figma));
  if (opened.status !== 'opened' || !opened.value.project.review) throw new Error('Fixture');
  const review = opened.value.project.review;
  const context = review.model.contexts.find(item => item.id === 'brand')!;
  const modeId = context.modeIds[0];
  const colors = review.model.colors.filter(item => item.valuesByMode[modeId]);
  const input: GuidelineDesignBriefInput = {
    outputType: 'scale',
    context: 'brand',
    sourceContextId: context.id,
    modeId,
    sourceReferences: colors.slice(0, 2).map(item => item.id),
    lockedColorIds: colors.slice(0, 2).map(item => item.id),
    allowedTransformations: ['extend-family'],
    backgrounds: [
      {
        id: 'canvas',
        sourceColorId: null,
        value: buildColorSystemSrgbValueV1({ r: 1, g: 1, b: 1 }),
      },
    ],
    categoryMeaning: null,
  };
  return { review, input };
}
function reseal(raw: Record<string, unknown>, key: string) {
  const content = { ...raw };
  delete content[key];
  return { ...content, [key]: guidelineHash(content) };
}

describe('explicit source-bound design brief', () => {
  it('retains multiple anchors and native precision without making a global primary', async () => {
    const { review, input } = await fixture();
    const native = buildColorSystemSrgbValueV1({ r: 0.123456789012341, g: 0.5, b: 0.75 });
    const { modelHash: _modelHash, ...source } = review.model;
    const model = buildColorSystemModelV1({
      ...source,
      colors: review.model.colors.map(item =>
        item.id === input.sourceReferences[0]
          ? { ...item, valuesByMode: { ...item.valuesByMode, [input.modeId]: native } }
          : item
      ),
    });
    const next = { model, reviewHash: guidelineHash('native review') };
    const brief = createGuidelineDesignBrief(next, input);
    expect(brief.lockedValues[0].value).toEqual(native);
    expect(brief.input.sourceReferences).toEqual(input.sourceReferences);
    expect(readGuidelineDesignBrief(JSON.parse(JSON.stringify(brief)), next)).toEqual(brief);
    expect(Object.isFrozen(brief.input.sourceReferences)).toBe(true);
  });

  it('saves incomplete choices without granting source permission or generating a result', async () => {
    const { review, input } = await fixture();
    const before = JSON.stringify(review);
    const brief = createGuidelineDesignBrief(review, {
      ...input,
      sourceReferences: [],
      lockedColorIds: [],
      backgrounds: [],
      allowedTransformations: [],
    });
    expect(brief.input.sourceReferences).toEqual([]);
    expect(JSON.stringify(review)).toBe(before);
    expect(brief).not.toHaveProperty('qualified');
    expect(brief).not.toHaveProperty('exportable');
  });

  it('rejects invented references, conflicting background paint and invalid modes', async () => {
    const { review, input } = await fixture();
    expect(() =>
      createGuidelineDesignBrief(review, { ...input, sourceReferences: ['invented'] })
    ).toThrow('no reviewed value');
    expect(() =>
      createGuidelineDesignBrief(review, { ...input, lockedColorIds: ['invented'] })
    ).toThrow('selected reference');
    expect(() => createGuidelineDesignBrief(review, { ...input, modeId: 'invented' })).toThrow(
      'declared source context'
    );
    expect(() => createGuidelineDesignBrief(review, { ...input, context: 'product' })).toThrow(
      'intended use'
    );
    const colorId = input.sourceReferences[0];
    const value = buildColorSystemSrgbValueV1({ r: 0.111, g: 0.222, b: 0.333 });
    expect(() =>
      createGuidelineDesignBrief(review, {
        ...input,
        backgrounds: [{ id: 'canvas', sourceColorId: colorId, value }],
      })
    ).toThrow('differs from its source');
    expect(() =>
      createGuidelineDesignBrief(review, {
        ...input,
        backgrounds: [{ id: 'canvas', sourceColorId: null, value: { ...value, alpha: 0.5 } }],
      })
    ).toThrow();
    expect(() =>
      createGuidelineDesignBrief(review, { ...input, sourceReferences: [colorId, colorId] })
    ).toThrow('Repeated');
    expect(() =>
      createGuidelineDesignBrief(review, { ...input, categoryMeaning: 'categorical' })
    ).toThrow('chart brief');
    expect(() =>
      createGuidelineDesignBrief(review, {
        ...input,
        allowedTransformations: ['override-rules'],
      } as unknown as GuidelineDesignBriefInput)
    ).toThrow('Unsupported transformation');
  });

  it('rejects resealed forged locks, governing decisions, source identities and unknown fields', async () => {
    const { review, input } = await fixture();
    const brief = createGuidelineDesignBrief(review, input);
    for (const altered of [
      { ...brief, lockedValues: [] },
      {
        ...brief,
        decisionReferences: [{ ruleId: 'invented', adoptionHash: guidelineHash('forged') }],
      },
      { ...brief, sourceModelHash: guidelineHash('different') },
      { ...brief, input: { ...input, authorized: true } },
    ])
      expect(() => readGuidelineDesignBrief(reseal(altered, 'briefHash'), review)).toThrow();
    expect(() => readGuidelineDesignBrief(brief, null)).toThrow('source review');
  });

  it('binds selected paint while keeping unrelated changes outside the dependency identity', async () => {
    const { review, input } = await fixture();
    const selected = {
      ...input,
      sourceReferences: input.sourceReferences.slice(0, 1),
      lockedColorIds: input.lockedColorIds.slice(0, 1),
    };
    const brief = createGuidelineDesignBrief(review, selected);
    const unrelated = review.model.colors.find(
      item => !selected.sourceReferences.includes(item.id)
    )!;
    const { modelHash: _modelHash, ...source } = review.model;
    const changedModel = buildColorSystemModelV1({
      ...source,
      colors: review.model.colors.map(item =>
        item.id === unrelated.id ? { ...item, label: 'Unrelated label' } : item
      ),
    });
    const retained = createGuidelineDesignBrief(
      {
        model: changedModel,
        reviewHash: guidelineHash('unrelated review'),
      },
      brief.input
    );
    expect(retained.dependencyHash).toBe(brief.dependencyHash);
    expect(retained.sourceModelHash).not.toBe(brief.sourceModelHash);
    const changed = buildColorSystemModelV1({
      ...source,
      colors: review.model.colors.map(item =>
        item.id === input.sourceReferences[0]
          ? {
              ...item,
              valuesByMode: {
                ...item.valuesByMode,
                [input.modeId]: buildColorSystemSrgbValueV1({ r: 0.876, g: 0.753, b: 0.642 }),
              },
            }
          : item
      ),
    });
    expect(
      createGuidelineDesignBrief(
        {
          model: changed,
          reviewHash: guidelineHash('changed'),
        },
        brief.input
      ).dependencyHash
    ).not.toBe(brief.dependencyHash);
  });
});

describe('reviewed rules in the design brief', () => {
  it('rejects coerced arrays in every enum field', async () => {
    const { review, input } = await fixture();
    for (const bad of [
      { ...input, outputType: ['scale'] },
      { ...input, context: ['brand'] },
      { ...input, context: 'chart', categoryMeaning: ['categorical'] },
    ])
      expect(() =>
        createGuidelineDesignBrief(review, bad as unknown as GuidelineDesignBriefInput)
      ).toThrow();
  });

  it('changes dependency identity with scoped source authority, coverage or mode meaning', async () => {
    const { review, input } = await fixture();
    const brief = createGuidelineDesignBrief(review, input);
    const { modelHash: _modelHash, ...source } = review.model;
    const selectedSource = source.colors.find(
      item => item.id === input.sourceReferences[0]
    )!.sourceId;
    const changes = [
      {
        sources: source.sources.map(item =>
          item.id === selectedSource ? { ...item, locator: 'changed-source-location' } : item
        ),
      },
      {
        sources: source.sources.map(item =>
          item.id === selectedSource ? { ...item, status: 'historical' } : item
        ),
      },
      {
        coverage: source.coverage.map(item =>
          item.sourceId === selectedSource ? { ...item, status: 'unknown' } : item
        ),
      },
      {
        modes: source.modes.map(item =>
          item.id === input.modeId ? { ...item, label: 'Changed mode meaning' } : item
        ),
      },
    ];
    for (const change of changes) {
      const model = buildColorSystemModelV1({ ...source, ...change });
      expect(model.modelHash).not.toBe(review.model.modelHash);
      expect(
        createGuidelineDesignBrief({ model, reviewHash: guidelineHash(change) }, brief.input)
          .dependencyHash
      ).not.toBe(brief.dependencyHash);
    }
  });

  it('binds an unadopted rule’s unselected partner', () => {
    const captured = sourceSetPdf('Pending relationship', '#123456', 'color').review!;
    const { modelHash: _modelHash, ...source } = captured.model;
    const model = buildColorSystemModelV1({ ...source, adoptions: [] });
    const review = { model, reviewHash: guidelineHash('pending source rule') };
    const modeId = model.modes[0].id;
    const blue = model.colors.find(item => item.label === 'Blue')!;
    const gold = model.colors.find(item => item.label === 'Gold')!;
    const brief = createGuidelineDesignBrief(review, {
      outputType: 'supporting-palette',
      context: 'brand',
      sourceContextId: 'brand',
      modeId,
      sourceReferences: [blue.id],
      lockedColorIds: [blue.id],
      allowedTransformations: ['add-family'],
      backgrounds: [],
      categoryMeaning: null,
    });
    expect(brief.decisionReferences).toEqual([]);
    const changed = buildColorSystemModelV1({
      ...source,
      adoptions: [],
      colors: source.colors.map(item =>
        item.id === gold.id
          ? {
              ...item,
              valuesByMode: {
                ...item.valuesByMode,
                [modeId]: buildColorSystemSrgbValueV1({ r: 0.82, g: 0.17, b: 0.28 }),
              },
            }
          : item
      ),
    });
    expect(
      createGuidelineDesignBrief(
        {
          model: changed,
          reviewHash: guidelineHash('changed partner'),
        },
        brief.input
      ).dependencyHash
    ).not.toBe(brief.dependencyHash);
  });

  it('binds governing adoptions and evidence without granting requested transformations', () => {
    const review = sourceSetPdf('Restricted source', '#123456', 'color').review!;
    const modeId = review.model.modes[0].id;
    const brief = createGuidelineDesignBrief(review, {
      outputType: 'supporting-palette',
      context: 'brand',
      sourceContextId: 'brand',
      modeId,
      sourceReferences: review.model.colors.slice(0, 2).map(item => item.id),
      lockedColorIds: [],
      allowedTransformations: ['add-family'],
      backgrounds: [],
      categoryMeaning: null,
    });
    expect(brief.decisionReferences.length).toBeGreaterThan(0);
    expect(review.model.adoptions[0].status).toBe('accepted');
    const { modelHash: _modelHash, ...source } = review.model;
    const model = buildColorSystemModelV1({
      ...source,
      adoptions: source.adoptions.map(item => ({ ...item, status: 'rejected' })),
    });
    expect(
      createGuidelineDesignBrief(
        {
          model,
          reviewHash: guidelineHash('changed decision'),
        },
        brief.input
      ).dependencyHash
    ).not.toBe(brief.dependencyHash);
    const changedEvidence = buildColorSystemModelV1({
      ...source,
      adoptions: [],
      evidence: source.evidence.map(item => ({
        ...item,
        description: `${item.description} changed`,
      })),
    });
    expect(
      createGuidelineDesignBrief(
        {
          model: changedEvidence,
          reviewHash: guidelineHash('changed evidence'),
        },
        brief.input
      ).dependencyHash
    ).not.toBe(brief.dependencyHash);
  });
});

describe('versioned design brief persistence', () => {
  it.each(['scale', 'supporting-palette', 'gradient'] as const)(
    'reopens a %s brief and preserves original source bytes',
    async outputType => {
      const { review, input } = await fixture();
      const designBrief = createGuidelineDesignBrief(review, {
        ...input,
        outputType,
        sourceContextId: outputType === 'gradient' ? 'gradient:brand' : 'brand',
      });
      const sourceJson = JSON.stringify(figma);
      const outputs = { ...EMPTY_GUIDELINE_OUTPUTS, designBrief };
      expect(storedGuidelineOutputs(outputs)).toEqual(EMPTY_GUIDELINE_OUTPUTS);
      const bytes = await serializeGuidelineWorkspace(sourceJson, outputs);
      const saved = JSON.parse(bytes);
      expect(saved.schemaVersion).toBe('teul.guideline-workspace.v9');
      expect(saved.sourceProjectJson).toBe(sourceJson);
      await readAnyGuidelineProject(bytes); // Consume prepared serialization and exercise full replay.
      const reopened = await readAnyGuidelineProject(bytes);
      expect(reopened.status).toBe('opened');
      if (reopened.status === 'opened')
        expect(reopened.value.outputs.designBrief).toEqual(designBrief);
      saved.designBrief.lockedValues = [];
      saved.designBrief = reseal(saved.designBrief, 'briefHash');
      await expect(
        readAnyGuidelineProject(JSON.stringify(reseal(saved, 'bundleHash')))
      ).rejects.toThrow();
    }
  );

  it('does not admit a brief under a legacy envelope or rewrite an unchanged legacy project', async () => {
    const { review, input } = await fixture();
    const json = JSON.stringify(figma);
    expect(await serializeGuidelineWorkspace(json, EMPTY_GUIDELINE_OUTPUTS)).toBe(json);
    const bytes = await serializeGuidelineWorkspace(json, {
      ...EMPTY_GUIDELINE_OUTPUTS,
      designBrief: createGuidelineDesignBrief(review, input),
    });
    const saved = { ...JSON.parse(bytes), schemaVersion: 'teul.guideline-workspace.v8' };
    await expect(
      readAnyGuidelineProject(JSON.stringify(reseal(saved, 'bundleHash')))
    ).rejects.toThrow();
    expect(
      await readAnyGuidelineProject('{"schemaVersion":"teul.guideline-workspace.v99"}')
    ).toEqual({ status: 'read-only', version: 'teul.guideline-workspace.v99' });
  });

  it('retains the same contract in a combined source-set project', async () => {
    const entry = await prepareSourceSetEntry(JSON.stringify(sourceSetPdf('A')), 'a');
    const second = await prepareSourceSetEntry(JSON.stringify(sourceSetPdf('B')), 'b');
    const draft: SourceSetDraft = {
      entries: [entry.entry, second.entry],
      subjects: [...entry.subjects, ...second.subjects],
      scope: 'brand',
      resolutions: [],
    };
    const review = await applySourceSetReview(draft, {
      actor: { kind: 'user', ref: 'fixture' },
      reviewedAt: '2026-09-27T12:00:00.000Z',
    });
    const context = review.model.contexts.find(item => item.id === 'brand')!;
    const modeId = context.modeIds[0];
    const references = review.model.colors
      .filter(item => item.valuesByMode[modeId])
      .slice(0, 2)
      .map(item => item.id);
    const designBrief = createGuidelineDesignBrief(review, {
      outputType: 'supporting-palette',
      context: 'brand',
      sourceContextId: context.id,
      modeId,
      sourceReferences: references,
      lockedColorIds: references,
      allowedTransformations: ['add-family'],
      backgrounds: [],
      categoryMeaning: null,
    });
    const bytes = await serializeSourceSetProject({
      draft,
      review,
      outputs: { ...EMPTY_GUIDELINE_OUTPUTS, designBrief },
      gradientSelection: null,
    });
    expect(JSON.parse(bytes).schemaVersion).toBe('teul.source-set-project.v4');
    const reopened = await readSourceSetProject(bytes);
    expect(reopened.status).toBe('opened');
    if (reopened.status === 'opened')
      expect(reopened.value.outputs.designBrief).toEqual(designBrief);
    const old = { ...JSON.parse(bytes), schemaVersion: 'teul.source-set-project.v3' };
    await expect(
      readSourceSetProject(JSON.stringify(reseal(old, 'projectHash')))
    ).rejects.toThrow();
  });
});
