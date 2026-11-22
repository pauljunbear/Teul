import { describe, expect, it } from 'vitest';
import { quantitativeApplicationFixture } from '../../../fixtures/guidelines/quantitative-application-fixture';
import {
  assessGuidelineApplication,
  buildGuidelineSourceApplication,
  guidelineApplicationSourceChoices,
  exportGuidelineApplication,
  readGuidelineApplication,
} from './application';
import {
  applicationDraftFromRequest,
  applicationDraftMatchesRequest,
  applicationLayoutFromDraft,
  captureGuidelineDraftExtension,
} from './applicationDraft';
import { quantitativeMatrixEdits, rebindQuantitativeMatrixDraft } from './quantitativeMatrixDraft';
import { previewGuidelineExtension } from './extension';
import {
  guidelineMatrixEvidenceAssignments,
  guidelineMatrixSourceEvidence,
} from './quantitativeMatrixBinding';
import { createGuidelineAuthoringDraft, EMPTY_GUIDELINE_AUTHORING } from './authoringDraft';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { guidelineHash } from './review';
import { createGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh } from './refreshReplay';
import {
  sourceSetPdf,
  sourceSetPdfRevision,
} from '../../../fixtures/guidelines/source-set-fixture';
import { bindCaptureV2 } from './evidenceV2';
import { compileGuidelineReviewV3 } from './reviewV3';
import { buildGuidelineProjectV3 } from './projectV3';
import { parseSingleStatedDigitalColor } from './numericEvidence';
import { sourceSetActor, sourceSetTime } from '../../../fixtures/guidelines/source-set-fixture';
import { prepareSourceSetEntry, applySourceSetReview, type SourceSetDraft } from './sourceSet';
import { readSourceSetProject, serializeSourceSetProject } from './sourceSetProject';
import { prepareSourceSetRefresh, replaySourceSetRefresh } from './sourceSetRefresh';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../../../../src/lib/colorSystemModelV1';
import { guidelineMatrixUseIds } from './quantitativeMatrixBinding';

async function combinedQuantitativeFixture(sourceComparison = false) {
  const { project, request } = quantitativeApplicationFixture();
  if (request.layout.kind !== 'chart' || !request.layout.matrix) throw new Error('fixture');
  const prepared = await prepareSourceSetEntry(JSON.stringify(project), 'matrix-source');
  const companion = await prepareSourceSetEntry(
    JSON.stringify(sourceSetPdf('Companion source', '#777777')),
    'companion'
  );
  const draft: SourceSetDraft = {
    entries: [prepared.entry, companion.entry],
    subjects: [...prepared.subjects, ...companion.subjects],
    scope: 'brand',
    resolutions: [],
  };
  const decision = { actor: sourceSetActor, reviewedAt: sourceSetTime };
  const review = await applySourceSetReview(draft, decision);
  const scale = review.model.scales.find(scale => scale.slots.length === 12)!;
  const modeId = scale.modes[0].modeId;
  const scaleId = scale.id;
  const id = (old: string) => {
    const label = project.review!.model.colors.find(color => color.id === old)!.label;
    return review.model.colors.find(color => color.label === label)!.id;
  };
  const input = {
    ...request.layout.matrix.input,
    modeId,
    evidence: guidelineMatrixSourceEvidence(
      review.model,
      review.model,
      scaleId,
      modeId,
      request.layout.matrix.input.evidence.originals.map(original => id(original.colorId))
    ),
  };
  let application = await assessGuidelineApplication(review, {
    ...request,
    layout: { ...request.layout, modeId, matrix: { ...request.layout.matrix, scaleId, input } },
    assignments: request.assignments.map(assignment => ({
      ...assignment,
      colorId: id(assignment.colorId),
    })),
  });
  expect(application.status).toBe('ready');
  if (sourceComparison)
    application = await assessGuidelineApplication(
      review,
      buildGuidelineSourceApplication(
        review,
        application,
        guidelineApplicationSourceChoices(review, application)
      )
    );
  const workspace = {
    draft,
    review,
    outputs: { extension: null, application },
    gradientSelection: null,
  };
  return { workspace, project, decision };
}

async function refreshedQuantitativeFixture() {
  const { workspace, project, decision } = await combinedQuantitativeFixture();
  const next = await prepareSourceSetRefresh(workspace, 'matrix-source', JSON.stringify(project));
  expect(next.lineage.schemaVersion).toBe('teul.source-set-refresh.v9');
  const refreshed = {
    ...workspace,
    draft: next.proposal.draft,
    review: await applySourceSetReview(next.proposal.draft, decision),
    outputs: EMPTY_GUIDELINE_OUTPUTS,
    refresh: next.lineage,
  };
  return refreshed;
}

describe('source-bound quantitative applications', () => {
  it('preserves legacy matrix calculation when no numeric version was declared', async () => {
    const { review, request } = quantitativeApplicationFixture();
    if (request.layout.kind !== 'chart' || !request.layout.matrix) throw new Error('fixture');
    const { numericVersion: _version, ...matrix } = request.layout.matrix;
    const legacy = { ...request, layout: { ...request.layout, matrix } };
    const result = await assessGuidelineApplication(review, legacy);
    expect(result.recipe?.direction.evidenceVersion).toBeUndefined();
    const restored = await readGuidelineApplication(
      (await exportGuidelineApplication(result)).applicationJson,
      review
    );
    expect(restored.request).toEqual(legacy);
    const rebound = rebindQuantitativeMatrixDraft(
      applicationDraftFromRequest(legacy),
      review.model,
      review.model,
      matrix.scaleId
    );
    expect(rebound.chart?.matrix?.numericVersion).toBeUndefined();
  });

  it('enforces an adopted source role rule on actual matrix regions', async () => {
    const { review, request, id } = quantitativeApplicationFixture();
    if (request.layout.kind !== 'chart' || !request.layout.matrix) throw new Error('fixture');
    const { modelHash: _hash, ...source } = review.model;
    const input: ColorSystemModelInputV1 = {
      ...source,
      adoptions: [],
      rules: [
        {
          id: 'reserved-ink',
          label: 'Only source blue is permitted for chart captions',
          kind: 'role-binding',
          force: 'requirement',
          origin: 'inferred',
          contextIds: ['brand'],
          modeIds: [request.layout.modeId],
          evidenceRefs: [],
          claimIds: [],
          operands: {
            role: 'chart-caption',
            presence: 'if-present',
            members: [{ kind: 'color', id: id('source-blue') }],
          },
        },
      ],
    };
    const model = buildColorSystemModelV1({
      ...input,
      adoptions: buildColorSystemRuleAdoptionsV1(input, [
        {
          ruleId: 'reserved-ink',
          status: 'accepted',
          actor: { kind: 'user', ref: 'test:matrix' },
          authorityRef: 'synthetic-fixture',
          decisionRef: 'synthetic-rule-decision',
        },
      ]),
    });
    const nextReview = { model, reviewHash: guidelineHash(model) };
    await expect(assessGuidelineApplication(nextReview, request)).rejects.toThrow(
      'Map quantitative'
    );
    const sourceRoles = Object.fromEntries(
      guidelineMatrixUseIds(request.layout.matrix.input).map(id => [
        id,
        id === 'text' ? 'chart-caption' : id,
      ])
    );
    const mapped = {
      ...request,
      layout: { ...request.layout, matrix: { ...request.layout.matrix, sourceRoles } },
    };
    const blocked = await assessGuidelineApplication(nextReview, mapped);
    expect(blocked.recipe).toBeNull();
    expect(blocked.assessment?.eligible).toBe(false);
    await expect(exportGuidelineApplication(blocked)).rejects.toThrow();
    await expect(
      assessGuidelineApplication(nextReview, {
        ...mapped,
        layout: {
          ...mapped.layout,
          matrix: {
            ...mapped.layout.matrix,
            sourceRoles: { ...sourceRoles, text: 'typo-caption' },
          },
        },
      })
    ).rejects.toThrow('declared source role');
  });
  it('uses generated steps while preserving the original source anchor', async () => {
    const { review, request, id } = quantitativeApplicationFixture();
    if (request.layout.kind !== 'chart' || !request.layout.matrix) throw new Error('fixture');
    const anchor = id('source-blue');
    const preview = await previewGuidelineExtension(review, {
      kind: 'new-scale',
      context: 'brand',
      modeId: request.layout.modeId,
      familyId: review.model.families.find(family => family.colorIds.includes(anchor))!.id,
      anchorColorId: anchor,
      label: 'Derived blue',
      scaleId: 'derived-blue',
      polarity: 'light',
      numericVersion: 2,
    });
    expect(preview.status).toBe('proposed');
    const input = {
      ...request.layout.matrix.input,
      evidence: guidelineMatrixSourceEvidence(
        review.model,
        preview.workingModel!,
        preview.request.scaleId,
        request.layout.modeId,
        [anchor]
      ),
    };
    const locked = new Map(
      guidelineMatrixEvidenceAssignments(input).map(item => [item.useId, item.colorId])
    );
    const result = await assessGuidelineApplication(review, {
      ...request,
      layout: {
        ...request.layout,
        matrix: { ...request.layout.matrix, scaleId: preview.request.scaleId, input },
      },
      assignments: request.assignments.map(assignment => ({
        ...assignment,
        colorId:
          locked.get(assignment.useId) ??
          (assignment.useId.startsWith('bin-')
            ? input.evidence.steps[Number(assignment.useId.slice(4)) + 6].colorId!
            : assignment.colorId),
      })),
      extension: { preview, decision: null, anchorColorId: anchor, purpose: 'sequential-data' },
    });
    expect(result.status).toBe('ready');
    const exported = await exportGuidelineApplication(result);
    const reopened = await readGuidelineApplication(exported.applicationJson, review);
    expect((await exportGuidelineApplication(reopened)).svgs).toEqual(exported.svgs);
    expect(input.evidence.originals[0].valueLabel).toBe(
      review.model.colors.find(color => color.id === anchor)!.valuesByMode[request.layout.modeId]
        .hex
    );
  });
  it('rebinds locked scale evidence with mode and context changes', () => {
    const { review, request } = quantitativeApplicationFixture();
    const draft = applicationDraftFromRequest(request);
    const nextMode = 'alternate';
    const source = {
      ...review.model,
      colors: review.model.colors.map(color => ({
        ...color,
        valuesByMode: {
          ...color.valuesByMode,
          [nextMode]: color.valuesByMode[draft.modeId],
        },
      })),
      scales: review.model.scales.map(scale => ({
        ...scale,
        modes: [...scale.modes, { ...scale.modes[0], modeId: nextMode }],
      })),
    };
    const next = rebindQuantitativeMatrixDraft(
      {
        ...draft,
        modeId: nextMode,
        choices: {},
        chart: { ...draft.chart!, sourceContextId: 'product' },
      },
      source,
      source,
      draft.chart!.matrix!.scaleId
    );
    expect(next.chart?.matrix?.input.modeId).toBe(nextMode);
    expect(next.chart?.matrix?.input.contextId).toBe('product');
    expect(Object.keys(next.choices)).toHaveLength(13);
    expect(next.choices['matrix-bars/original-1']).toBe(draft.choices['matrix-bars/original-1']);
    expect(() => rebindQuantitativeMatrixDraft(next, source, source, 'missing')).toThrow(
      'source anchor'
    );
  });

  it('saves unfinished count edits separately from the last checked application', async () => {
    const { review, request, project } = quantitativeApplicationFixture();
    const application = await assessGuidelineApplication(review, request);
    const draft = applicationDraftFromRequest(request);
    const edits = quantitativeMatrixEdits(draft.chart!.matrix!.input);
    edits.rows[0].values[0] = '';
    const unfinished = { ...draft, matrixEdits: edits };
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: unfinished,
    });
    const text = await serializeGuidelineWorkspace(JSON.stringify(project), {
      extension: null,
      application,
      authoring,
    });
    await readAnyGuidelineProject(text);
    const opened = await readAnyGuidelineProject(text);
    if (opened.status !== 'opened') throw new Error('Expected current workspace.');
    expect(opened.value.outputs.authoring?.application?.matrixEdits).toEqual(edits);
    expect(opened.value.outputs.application?.request).toEqual(request);
    expect(applicationDraftMatchesRequest(unfinished, request)).toBe(false);
    await expect(
      assessGuidelineApplication(review, {
        ...request,
        layout: applicationLayoutFromDraft(unfinished),
      })
    ).rejects.toThrow();
  });

  it('keeps a source matrix scale through refresh when a different extension is inactive', async () => {
    const { review, request, project, id } = quantitativeApplicationFixture();
    const preview = await previewGuidelineExtension(review, {
      kind: 'new-scale',
      context: 'brand',
      modeId: request.layout.modeId,
      familyId: review.model.families.find(family => family.colorIds.includes(id('source-blue')))!
        .id,
      anchorColorId: id('source-blue'),
      label: 'Inactive scale',
      scaleId: 'inactive-scale',
      polarity: 'light',
      numericVersion: 2,
    });
    expect(preview.status).toBe('proposed');
    const application = {
      ...applicationDraftFromRequest(request),
      extension: captureGuidelineDraftExtension({ preview, decision: null }),
      useExtension: false,
    };
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application,
    });
    const next = {
      kind: 'pdf' as const,
      format: 'project' as const,
      project: sourceSetPdfRevision(project, { note: true }),
    };
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(project),
      {
        extension: null,
        application: null,
        authoring,
      },
      next
    );
    const refreshed = await replayGuidelineRefresh(lineage, next);
    const retained = refreshed.outputs.authoring?.application;
    expect(retained?.useExtension).toBe(false);
    expect(retained?.chart?.matrix?.scaleId).toBe(application.chart?.matrix?.scaleId);
    expect(retained?.chart?.matrix?.scaleId).not.toBe(preview.request.scaleId);
    expect(retained?.choices).toEqual(application.choices);
  });
  it.each(['wide', 'narrow'] as const)(
    'checks and cold-replays complete %s geometry through V8',
    async viewport => {
      const { review, request } = quantitativeApplicationFixture(viewport);
      const before = JSON.stringify(review);
      const result = await assessGuidelineApplication(review, request);
      expect(result.status).toBe('ready');
      expect(result.recipe?.direction.evidenceVersion).toBe(2);
      expect(result.recipe?.schemaVersion).toBe('teul.color-system-recipe.v6');
      expect(result.geometry?.plan.version).toBe('teul.application-geometry.v2');
      const exported = await exportGuidelineApplication(result);
      expect(JSON.parse(exported.applicationJson).schemaVersion).toBe(
        'teul.guideline-application.v8'
      );
      expect(exported.svgs[0].svg).toContain('Afternoon, Collection: 40 requests');
      expect(
        await exportGuidelineApplication(
          await readGuidelineApplication(exported.applicationJson, review)
        )
      ).toEqual(exported);
      expect(JSON.stringify(review)).toBe(before);
      for (let i = 1; i <= 7; i++)
        await expect(
          readGuidelineApplication(
            JSON.stringify({
              ...JSON.parse(exported.applicationJson),
              schemaVersion: `teul.guideline-application.v${i}`,
            }),
            review
          )
        ).rejects.toThrow('V8');
    }
  );

  it('rejects forged evidence, displaced evidence paint and off-scale chart paint', async () => {
    const { review, request, id } = quantitativeApplicationFixture();
    if (request.layout.kind !== 'chart' || !request.layout.matrix) throw new Error('fixture');
    const matrix = request.layout.matrix;
    const replacements = [
      {
        ...matrix,
        input: {
          ...matrix.input,
          evidence: {
            ...matrix.input.evidence,
            originals: matrix.input.evidence.originals.map(original => ({
              ...original,
              label: 'Official approved blue',
            })),
          },
        },
      },
      {
        ...matrix,
        input: {
          ...matrix.input,
          evidence: {
            ...matrix.input.evidence,
            steps: matrix.input.evidence.steps.map((step, i) =>
              i ? step : { ...step, colorId: null }
            ),
          },
        },
      },
      { ...matrix, scaleId: 'unrelated-scale' },
    ];
    for (const value of replacements)
      await expect(
        assessGuidelineApplication(review, {
          ...request,
          layout: { ...request.layout, matrix: value },
        })
      ).rejects.toThrow();
    for (const useId of ['original-1', 'step-1', 'bin-1'])
      await expect(
        assessGuidelineApplication(review, {
          ...request,
          assignments: request.assignments.map(a =>
            a.useId === useId ? { ...a, colorId: id('source-blue') } : a
          ),
        })
      ).rejects.toThrow(/locked|displayed scale/);
  });

  it('retains failed contrast for inspection without authorizing export', async () => {
    const { review, request, id } = quantitativeApplicationFixture();
    const failed = await assessGuidelineApplication(review, {
      ...request,
      assignments: request.assignments.map(a =>
        a.useId === 'text' ? { ...a, colorId: id('paper') } : a
      ),
    });
    expect(failed.recipe).toBeNull();
    expect(failed.assessment?.eligible).toBe(false);
    expect(failed.geometry).not.toBeNull();
    await expect(exportGuidelineApplication(failed)).rejects.toThrow('Assess');
  });

  it('persists selected, draft-only and brief-only quantitative capability without admitting V15 downgrades', async () => {
    const { review, request, project } = quantitativeApplicationFixture();
    const application = await assessGuidelineApplication(review, request);
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: applicationDraftFromRequest(request),
    });
    expect(authoring.schemaVersion).toBe('teul.guideline-authoring.v6');
    expect(authoring.briefs.application?.schemaVersion).toBe('teul.guideline-design-brief.v4');
    expect(applicationDraftMatchesRequest(authoring.application!, request)).toBe(true);
    for (const selected of [
      { application, authoring, designBrief: authoring.briefs.application },
      { application: null, authoring },
      { application: null, designBrief: authoring.briefs.application },
    ]) {
      const json = await serializeGuidelineWorkspace(JSON.stringify(project), {
        extension: null,
        ...selected,
      });
      expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v16');
      expect((await readAnyGuidelineProject(json)).status).toBe('opened');
      const { bundleHash: _hash, ...body } = JSON.parse(json);
      body.schemaVersion = 'teul.guideline-workspace.v15';
      await expect(
        readAnyGuidelineProject(JSON.stringify({ ...body, bundleHash: guidelineHash(body) }))
      ).rejects.toThrow(/Quantitative/);
    }
  });

  it('preserves a selected board through unrelated refresh', async () => {
    const { review, request, project } = quantitativeApplicationFixture();
    const application = await assessGuidelineApplication(review, request);
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: applicationDraftFromRequest(request),
    });
    const outputs = {
      extension: null,
      application,
      authoring,
      designBrief: authoring.briefs.application,
    };
    const nextProject = sourceSetPdfRevision(project, { note: true });
    const next = { kind: 'pdf' as const, format: 'project' as const, project: nextProject };
    const lineage = await createGuidelineRefreshLineage(JSON.stringify(project), outputs, next);
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v13');
    const refreshed = await replayGuidelineRefresh(lineage, next);
    expect(refreshed.outputs.application?.status).toBe('ready');
    expect(
      refreshed.outputs.authoring?.briefs.application?.input.quantitativeCompositionHash
    ).toBeDefined();
    expect((await exportGuidelineApplication(refreshed.outputs.application!)).svgs).toEqual(
      (await exportGuidelineApplication(application)).svgs
    );
  });

  it.each([false, true])(
    'invalidates evidence-only changes while retaining the previous board in history (source data: %s)',
    async sourceComparison => {
      const { review, request, project } = quantitativeApplicationFixture();
      const original = await assessGuidelineApplication(review, request);
      const application = sourceComparison
        ? await assessGuidelineApplication(
            review,
            buildGuidelineSourceApplication(
              review,
              original,
              guidelineApplicationSourceChoices(review, original)
            )
          )
        : original;
      const authoring = createGuidelineAuthoringDraft(review, {
        ...EMPTY_GUIDELINE_AUTHORING,
        activeTask: 'application',
        application: applicationDraftFromRequest(application.request),
      });
      const outputs = {
        extension: null,
        application,
        authoring,
        designBrief: authoring.briefs.application,
      };
      const { captureHash: _hash, ...raw } = structuredClone(project.capture);
      const numeric = parseSingleStatedDigitalColor('#FEFEFE');
      raw.identity.sha256 = guidelineHash('changed evidence-only step');
      raw.observations = raw.observations.map(observation =>
        observation.id === 'color:step-1' && observation.kind === 'color'
          ? { ...observation, literal: '#FEFEFE', value: numeric.value, syntax: numeric.syntax }
          : observation.id === 'text:step-1' && observation.kind === 'text'
            ? { ...observation, text: 'step-1 #FEFEFE' }
            : observation
      );
      const capture = bindCaptureV2(raw);
      const draft = { ...project.draft, captureHash: capture.captureHash };
      const changed = {
        kind: 'pdf' as const,
        format: 'project' as const,
        project: buildGuidelineProjectV3({
          capture,
          draft,
          review: compileGuidelineReviewV3(capture, draft, sourceSetActor, sourceSetTime),
          selection: null,
        }),
      };
      const history = await createGuidelineRefreshLineage(
        JSON.stringify(project),
        outputs,
        changed
      );
      const invalidated = await replayGuidelineRefresh(history, changed);
      expect(invalidated.outputs.application).toBeNull();
      expect(invalidated.outputs.authoring?.application ?? null).toBeNull();
      expect(invalidated.items.find(item => item.kind === 'application')?.status).toBe('stale');
      expect(history.previousOutputs.application?.request).toEqual(application.request);
    }
  );

  it('cold reopens quantitative source sets', async () => {
    const { workspace } = await combinedQuantitativeFixture();
    const json = await serializeSourceSetProject(workspace);
    expect(JSON.parse(json).schemaVersion).toBe('teul.source-set-project.v10');
    await readSourceSetProject(json);
    expect((await readSourceSetProject(json)).status).toBe('opened');
  });

  it('preserves source-data capability through combined project and refresh replay', async () => {
    const { workspace, project, decision } = await combinedQuantitativeFixture(true);
    const opened = await readSourceSetProject(await serializeSourceSetProject(workspace));
    expect(opened.status).toBe('opened');
    const next = await prepareSourceSetRefresh(workspace, 'matrix-source', JSON.stringify(project));
    const replay = await replaySourceSetRefresh({
      ...workspace,
      draft: next.proposal.draft,
      review: await applySourceSetReview(next.proposal.draft, decision),
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      refresh: next.lineage,
    });
    const layout = replay.outputs.application?.request.layout;
    expect(layout?.kind === 'chart' && layout.matrix?.dataPaints).toBe('reviewed-source-v1');
    expect((await exportGuidelineApplication(replay.outputs.application!)).svgs).toEqual(
      (await exportGuidelineApplication(workspace.outputs.application!)).svgs
    );
  }, 15000);

  it('replays the selected matrix after a source-set refresh', async () => {
    const refreshed = await refreshedQuantitativeFixture();
    const replay = await replaySourceSetRefresh(refreshed);
    expect(replay.outputs.application?.status).toBe('ready');
    expect(replay.outputs.application?.recipe?.direction.evidenceVersion).toBe(2);
    const layout = replay.outputs.application?.request.layout;
    expect(layout?.kind === 'chart' && layout.matrix?.numericVersion).toBe(2);
  });

  it('retains quantitative history capability through source-set refresh', async () => {
    const refreshed = await refreshedQuantitativeFixture();
    const history = await serializeSourceSetProject(refreshed);
    expect(JSON.parse(history).schemaVersion).toBe('teul.source-set-project.v10');
    const { projectHash: _hash, ...old } = JSON.parse(history);
    old.schemaVersion = 'teul.source-set-project.v9';
    await expect(
      readSourceSetProject(JSON.stringify({ ...old, projectHash: guidelineHash(old) }))
    ).rejects.toThrow(/Quantitative/);
  });
});
