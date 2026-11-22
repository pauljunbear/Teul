import { describe, expect, it } from 'vitest';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../../../../src/lib/colorSystemModelV1';
import { guidelineHash } from './review';
import { guidelineApplicationContextProposal } from './application';
import { previewGuidelineExtension, reviewGuidelineExtension } from './extension';
import {
  guidelineMatrixSourceEvidence,
  guidelineMatrixEvidenceAssignments,
} from './quantitativeMatrixBinding';
import { createGuidelineExtensionDecision } from './extensionRuleReview';
import { createGuidelineRuleDecision } from './extensionRuleReview';
import { guidelineContextPaintChoices, type GuidelineContextPaints } from './contextPaints';
import { quantitativeComparisonFixture } from '../../../fixtures/guidelines/quantitative-comparison-fixture';
import { quantitativeApplicationFixture } from '../../../fixtures/guidelines/quantitative-application-fixture';
import {
  assessGuidelineApplication,
  buildGuidelineSourceApplication,
  exportGuidelineApplication,
  guidelineApplicationSourceChoices,
  readGuidelineApplication,
} from './application';
import {
  guidelineMatrixDeclaredSourceSteps,
  readGuidelineMatrixControls,
} from './quantitativeMatrixBinding';
import { applicationDraftFromRequest, applicationDraftMatchesRequest } from './applicationDraft';
import { rebindQuantitativeMatrixDraft } from './quantitativeMatrixDraft';
import { createGuidelineAuthoringDraft, EMPTY_GUIDELINE_AUTHORING } from './authoringDraft';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { createGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh } from './refreshReplay';
import { sourceSetPdfRevision } from '../../../fixtures/guidelines/source-set-fixture';

describe('matrix source data comparison', () => {
  it.each(['wide', 'narrow'] as const)(
    'checks source bins with unchanged %s geometry and exact export replay',
    async viewport => {
      const { review, proposed, sourceRequest } = await quantitativeComparisonFixture(viewport);
      const before = JSON.stringify(review);
      const initial = guidelineApplicationSourceChoices(review, proposed);
      expect(initial['bin-1']).toBe('');
      expect(initial['step-1']).not.toBe('');
      expect(sourceRequest.extension).toEqual(proposed.request.extension);
      const selected = await assessGuidelineApplication(review, sourceRequest);
      expect(selected.status).toBe('ready');
      expect(selected.layout.boards).toEqual(proposed.layout.boards);
      expect(selected.layout.requirements).toEqual(proposed.layout.requirements);
      const exported = await exportGuidelineApplication(selected);
      expect(exported.svgs[0].svg).toContain('selected 12-step scale is retained as reference');
      expect(
        await exportGuidelineApplication(
          await readGuidelineApplication(exported.applicationJson, review)
        )
      ).toEqual(exported);
      expect(JSON.stringify(review)).toBe(before);
      const json = JSON.parse(exported.applicationJson);
      delete json.request.layout.matrix.dataPaints;
      await expect(readGuidelineApplication(JSON.stringify(json), review)).rejects.toThrow(
        'displayed scale'
      );
    }
  );

  it('keeps default scale membership and locked reference guards; rejects unknown capabilities', async () => {
    const { review, proposed, choices, sourceRequest, id } = await quantitativeComparisonFixture();
    if (sourceRequest.layout.kind !== 'chart' || !sourceRequest.layout.matrix)
      throw new Error('fixture');
    const { dataPaints: _mode, ...matrix } = sourceRequest.layout.matrix;
    await expect(
      assessGuidelineApplication(review, {
        ...sourceRequest,
        layout: { ...sourceRequest.layout, matrix },
      })
    ).rejects.toThrow('displayed scale');
    expect(() => readGuidelineMatrixControls({ ...matrix, dataPaints: 'anything' })).toThrow(
      'data-paint binding'
    );
    expect(() => readGuidelineMatrixControls({ ...matrix, extra: true })).toThrow();
    expect(() =>
      buildGuidelineSourceApplication(review, proposed, { ...choices, 'step-1': id('ink') })
    ).toThrow('reference paints');
    await expect(
      assessGuidelineApplication(review, {
        ...sourceRequest,
        assignments: sourceRequest.assignments.map(use =>
          use.useId === 'bin-1' ? { ...use, colorId: choices['step-1'] } : use
        ),
      })
    ).rejects.toThrow('original reviewed source');
    await expect(
      assessGuidelineApplication(review, {
        ...sourceRequest,
        assignments: sourceRequest.assignments.map(use =>
          use.useId === 'original-1' ? { ...use, colorId: id('ink') } : use
        ),
      })
    ).rejects.toThrow('locked');
  });

  it('leaves failed order and contrast unexportable, preserving the prior proposal', async () => {
    const { review, proposed, choices, id } = await quantitativeComparisonFixture();
    const exported = await exportGuidelineApplication(proposed);
    for (const changed of [
      { ...choices, 'bin-1': choices['bin-5'] },
      { ...choices, text: id('paper') },
    ]) {
      const failed = await assessGuidelineApplication(
        review,
        buildGuidelineSourceApplication(review, proposed, changed)
      );
      expect(failed.recipe).toBeNull();
      await expect(exportGuidelineApplication(failed)).rejects.toThrow();
    }
    const controller = new AbortController();
    controller.abort();
    const cancelled = await assessGuidelineApplication(
      review,
      buildGuidelineSourceApplication(review, proposed, choices),
      controller.signal
    );
    expect(cancelled.status).toBe('cancelled');
    expect(await exportGuidelineApplication(proposed)).toEqual(exported);
  });

  it('renews custom-context rule decisions for the changed matrix intent', async () => {
    const { review, request, id } = quantitativeApplicationFixture();
    const { modelHash: _hash, ...base } = review.model;
    const input: ColorSystemModelInputV1 = {
      ...base,
      adoptions: [],
      rules: [
        {
          id: 'unused-pair',
          label: 'Keep blue separate from the quantitative family',
          kind: 'forbidden-pair',
          force: 'prohibition',
          origin: 'inferred',
          contextIds: ['brand'],
          modeIds: [request.layout.modeId],
          evidenceRefs: [],
          claimIds: [],
          operands: {
            left: [
              {
                kind: 'family',
                id: base.families.find(family => family.colorIds.includes(id('source-blue')))!.id,
              },
            ],
            right: [{ kind: 'color', id: id('step-1') }],
            ordered: false,
            relation: 'co-present',
          },
        },
      ],
    };
    const model = buildColorSystemModelV1({
      ...input,
      adoptions: buildColorSystemRuleAdoptionsV1(input, [
        {
          ruleId: 'unused-pair',
          status: 'accepted',
          actor: { kind: 'user', ref: 'test:matrix' },
          authorityRef: 'synthetic-test',
          decisionRef: 'synthetic-decision',
        },
      ]),
    });
    const current = { model, reviewHash: guidelineHash(model) };
    const contextPaints: GuidelineContextPaints = {
      version: 'teul.context-paints.v1',
      id: 'matrix-context',
      actor: { kind: 'user', ref: 'test:matrix' },
      paints: [
        {
          id: 'canvas',
          label: 'Custom canvas',
          modeId: request.layout.modeId,
          role: 'background',
          value: model.colors.find(color => color.id === id('paper'))!.valuesByMode[
            request.layout.modeId
          ],
        },
      ],
    };
    if (request.layout.kind !== 'chart' || !request.layout.matrix) throw new Error('fixture');
    const extensionRequest = {
      kind: 'new-scale' as const,
      context: 'brand' as const,
      modeId: request.layout.modeId,
      familyId: model.families.find(family => family.colorIds.includes(id('source-blue')))!.id,
      anchorColorId: id('source-blue'),
      label: 'Context blue',
      scaleId: 'context-blue',
      polarity: 'light' as const,
      numericVersion: 2 as const,
    };
    const pendingScale = await previewGuidelineExtension(current, extensionRequest);
    const decision = createGuidelineExtensionDecision(
      current.reviewHash,
      pendingScale,
      Object.fromEntries(pendingScale.pendingRuleIds.map(id => [id, 'accepted']))
    );
    const preview = await reviewGuidelineExtension(current, extensionRequest, decision);
    const evidence = guidelineMatrixSourceEvidence(
      model,
      preview.workingModel!,
      extensionRequest.scaleId,
      request.layout.modeId,
      [id('source-blue')]
    );
    const matrixInput = { ...request.layout.matrix.input, evidence };
    const locked = new Map(
      guidelineMatrixEvidenceAssignments(matrixInput).map(use => [use.useId, use.colorId])
    );
    const custom = {
      ...request,
      layout: {
        ...request.layout,
        matrix: { ...request.layout.matrix, scaleId: extensionRequest.scaleId, input: matrixInput },
      },
      extension: {
        preview,
        decision,
        anchorColorId: id('source-blue'),
        purpose: 'sequential-data' as const,
      },
      contextPaints,
      assignments: request.assignments.map(use =>
        use.useId === 'ground'
          ? { ...use, colorId: guidelineContextPaintChoices(contextPaints)[0].id }
          : {
              ...use,
              colorId:
                locked.get(use.useId) ??
                (use.useId.startsWith('bin-')
                  ? evidence.steps[Number(use.useId.slice(4)) + 6].colorId!
                  : use.colorId),
            }
      ),
    };
    const first = await assessGuidelineApplication(current, custom);
    const proposal = guidelineApplicationContextProposal(first)!;
    expect(proposal.pendingRuleIds.length).toBeGreaterThan(0);
    const contextReview = createGuidelineRuleDecision(
      current.reviewHash,
      proposal,
      Object.fromEntries(proposal.pendingRuleIds.map(id => [id, 'accepted']))
    );
    const selected = await assessGuidelineApplication(current, { ...custom, contextReview });
    expect(selected.status).toBe('ready');
    const originals = guidelineApplicationSourceChoices(current, selected);
    for (const use of request.assignments)
      if (use.useId.startsWith('bin-')) originals[use.useId] = use.colorId;
    const comparison = buildGuidelineSourceApplication(current, selected, originals);
    expect(comparison.contextReview).toBeUndefined();
    await expect(
      assessGuidelineApplication(current, { ...comparison, contextReview })
    ).rejects.toThrow();
    const checked = await assessGuidelineApplication(current, comparison);
    const renewed = guidelineApplicationContextProposal(checked)!;
    const renewedDecision = createGuidelineRuleDecision(
      current.reviewHash,
      renewed,
      Object.fromEntries(renewed.pendingRuleIds.map(id => [id, 'accepted']))
    );
    expect(
      (await assessGuidelineApplication(current, { ...comparison, contextReview: renewedDecision }))
        .status
    ).toBe('ready');
  });

  it('does not attribute constructed anchor positions to the source', async () => {
    const { review, proposed } = await quantitativeComparisonFixture();
    if (proposed.request.layout.kind !== 'chart' || !proposed.request.layout.matrix)
      throw new Error('fixture');
    const steps = guidelineMatrixDeclaredSourceSteps(
      review.model,
      proposed.model!,
      proposed.request.layout.matrix
    );
    expect(steps).toHaveLength(12);
    expect(steps.every(step => step.colorId === null)).toBe(true);
    const { request } = quantitativeApplicationFixture();
    if (request.layout.kind !== 'chart' || !request.layout.matrix) throw new Error('fixture');
    expect(
      guidelineMatrixDeclaredSourceSteps(review.model, review.model, request.layout.matrix)
    ).toEqual(request.layout.matrix.input.evidence.steps);
  });

  it('keeps source choices in the editor, saved selection, draft-only workspace and unrelated refresh', async () => {
    const { project, review, proposed, sourceRequest } = await quantitativeComparisonFixture();
    const application = await assessGuidelineApplication(review, sourceRequest);
    const draft = applicationDraftFromRequest(sourceRequest);
    const rebound = rebindQuantitativeMatrixDraft(
      draft,
      review.model,
      proposed.model!,
      draft.chart!.matrix!.scaleId,
      [draft.anchorColorId]
    );
    expect(rebound.choices).toEqual(draft.choices);
    expect(applicationDraftMatchesRequest(rebound, sourceRequest)).toBe(true);
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: draft,
    });
    for (const selected of [application, null]) {
      const json = await serializeGuidelineWorkspace(JSON.stringify(project), {
        extension: null,
        application: selected,
        authoring,
      });
      const opened = await readAnyGuidelineProject(json);
      if (opened.status !== 'opened') throw new Error('Expected current workspace');
      expect(opened.value.outputs.authoring?.application?.chart?.matrix?.dataPaints).toBe(
        'reviewed-source-v1'
      );
      expect(opened.value.outputs.authoring?.application?.choices).toEqual(draft.choices);
      expect(opened.value.outputs.application?.request ?? null).toEqual(selected?.request ?? null);
    }
    const next = {
      kind: 'pdf' as const,
      format: 'project' as const,
      project: sourceSetPdfRevision(project, { note: true }),
    };
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(project),
      { extension: null, application, authoring },
      next
    );
    const refreshed = await replayGuidelineRefresh(lineage, next);
    expect(refreshed.outputs.application?.status).toBe('ready');
    expect(refreshed.outputs.authoring?.application?.chart?.matrix?.dataPaints).toBe(
      'reviewed-source-v1'
    );
    expect((await exportGuidelineApplication(refreshed.outputs.application!)).svgs).toEqual(
      (await exportGuidelineApplication(application)).svgs
    );
  }, 20000);
});
