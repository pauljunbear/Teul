import { describe, expect, it } from 'vitest';
import { nativeGradientComparisonFixture } from '../../../fixtures/guidelines/native-gradient-comparison-fixture';
import { sourceSetPdf } from '../../../fixtures/guidelines/source-set-fixture';
import {
  assessGuidelineApplication,
  exportGuidelineApplication,
  readGuidelineApplication,
  type GuidelineApplicationRequest,
} from './application';
import { exportGuidelineApplicationSvgs } from './applicationGeometry';
import { guidelineHash, type ReviewedGuideline } from './review';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../../../../src/lib/colorSystemModelV1';
import { buildFigmaProject } from './figmaProject';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { applicationDraftFromRequest, applicationDraftMatchesRequest } from './applicationDraft';
import { createGuidelineAuthoringDraft, EMPTY_GUIDELINE_AUTHORING } from './authoringDraft';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import { createGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh, replayReviewedDesigns } from './refreshReplay';
import { prepareSourceSetEntry, applySourceSetReview, type SourceSetDraft } from './sourceSet';
import { serializeSourceSetProject, readSourceSetProject } from './sourceSetProject';
import { prepareSourceSetRefresh, replaySourceSetRefresh } from './sourceSetRefresh';
import { guidelineContextPaintChoices } from './contextPaints';

function requestFor(
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>
): GuidelineApplicationRequest {
  const modeId = review.model.modes[0].id;
  const colors = review.model.colors.filter(c => c.valuesByMode[modeId]);
  const white = colors.find(c => c.valuesByMode[modeId].components.r === 1)!;
  const black = colors.find(c => c.valuesByMode[modeId].components.r === 0)!;
  return {
    layout: {
      kind: 'panel',
      sourceContextId: 'brand',
      modeId,
      width: 400,
      height: 320,
      heading: 'A clearer direction',
      body: 'Compare the source colours with a proposed direction.',
      sourceRoles: { ground: 'canvas', heading: 'heading', body: 'body' },
    },
    assignments: ['ground', 'text-1', 'text-2'].map((useId, i) => ({
      applicationId: 'panel',
      useId,
      colorId: i ? black.id : white.id,
    })),
    extension: null,
  };
}
async function fixture() {
  const value = await nativeGradientComparisonFixture(false);
  const project = await buildFigmaProject({
    capture: value.inventory.packet,
    draft: value.review.decision.draft,
    review: value.review,
    selection: null,
  });
  return { ...value, sourceJson: JSON.stringify(project), request: requestFor(value.review) };
}
function reseal(raw: Record<string, unknown>, field: string) {
  const body = { ...raw };
  delete body[field];
  return JSON.stringify({ ...body, [field]: guidelineHash(body) });
}
async function outputs(review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>) {
  const application = await assessGuidelineApplication(review, requestFor(review));
  const draft = applicationDraftFromRequest(application.request);
  const authoring = createGuidelineAuthoringDraft(review, {
    ...EMPTY_GUIDELINE_AUTHORING,
    activeTask: 'application',
    application: draft,
  });
  return { extension: null, application, authoring };
}

describe('information panels in the application workflow', () => {
  it('exports exact preview geometry and cold-replays from source, authored copy and mappings', async () => {
    const { review, request } = await fixture();
    const panel = await assessGuidelineApplication(review, request);
    const exported = await exportGuidelineApplication(panel);
    expect(exported.svgs).toEqual(
      exportGuidelineApplicationSvgs(panel.model!, panel.applications, panel.layout)
    );
    expect(exported.svgs[0].svg).toContain('<title>A clearer direction</title>');
    expect(exported.svgs[0].svg).not.toContain('<text');
    expect(exported.applicationJson).not.toContain('contours');
    expect(JSON.parse(exported.applicationJson).schemaVersion).toBe(
      'teul.guideline-application.v6'
    );
    expect(panel.recipe!.schemaVersion).toBe('teul.color-system-recipe.v3');
    const restored = await readGuidelineApplication(exported.applicationJson, review);
    expect(await exportGuidelineApplication(restored)).toEqual(exported);
    expect(exported.dtcgJson).toContain('Source role: heading');
  });
  it('retains failed contrast as inspectable geometry and refuses export', async () => {
    const { review, request } = await fixture();
    const panel = await assessGuidelineApplication(review, {
      ...request,
      assignments: request.assignments.map(a => ({
        ...a,
        colorId: request.assignments[0].colorId,
      })),
    });
    expect(panel.assessment?.eligible).toBe(false);
    expect(panel.geometry?.plan).toBeTruthy();
    await expect(exportGuidelineApplication(panel)).rejects.toThrow('feasible');
  });
  it('requires explicit mappings for scoped source roles and enforces their adopted prohibition', async () => {
    const { review, request } = await fixture();
    const { modelHash: _hash, ...source } = review.model;
    const input: ColorSystemModelInputV1 = {
      ...source,
      rules: [
        {
          id: 'no-small-ink',
          label: 'Body ink cannot be used on this ground',
          kind: 'forbidden-pair',
          force: 'prohibition',
          origin: 'inferred',
          contextIds: ['brand'],
          modeIds: [request.layout.modeId],
          evidenceRefs: [],
          claimIds: [],
          operands: {
            relation: 'foreground-background',
            ordered: true,
            left: [{ kind: 'color', id: request.assignments[2].colorId, role: 'body' }],
            right: [{ kind: 'color', id: request.assignments[0].colorId, role: 'canvas' }],
          },
        },
      ],
      adoptions: [],
    };
    const model = buildColorSystemModelV1({
      ...input,
      adoptions: buildColorSystemRuleAdoptionsV1(input, [
        {
          ruleId: 'no-small-ink',
          status: 'accepted',
          actor: { kind: 'user', ref: 'synthetic-development-review' },
          authorityRef: 'synthetic-source',
          decisionRef: guidelineHash('synthetic-rule-decision'),
        },
      ]),
    });
    const nextReview = { model, reviewHash: guidelineHash(model) };
    if (request.layout.kind === 'panel')
      (request as { layout: typeof request.layout }).layout = {
        ...request.layout,
        sourceRoles: { ground: 'canvas', heading: 'text-1', body: 'body' },
      };
    const previous = await assessGuidelineApplication(review, request);
    const refreshed = await replayReviewedDesigns(
      {
        previousModel: review.model,
        previousReviewHash: review.reviewHash,
        previousSelection: null,
        legacyGradientKind: 'native',
        outputs: { extension: null, application: previous },
        gradient: null,
        colorPairs: new Map(review.model.colors.map(c => [c.id, c.id])),
        modePairs: new Map(review.model.modes.map(m => [m.id, m.id])),
        evidencePairs: new Map(review.model.evidence.map(e => [e.id, e.id])),
        scaleIds: new Set(review.model.scales.map(s => s.id)),
        metadataChanges: [],
      },
      nextReview
    );
    expect(refreshed.items.find(item => item.kind === 'application')?.status).toBe('stale');
    expect(refreshed.outputs.application).toBeNull();
    expect(previous.recipe).not.toBeNull();
    const panel = await assessGuidelineApplication(nextReview, request);
    expect(panel.assessment?.applications[0].rules[0].status).toBe('fail');
    await expect(exportGuidelineApplication(panel)).rejects.toThrow('feasible');
    const typo = structuredClone(request);
    if (typo.layout.kind === 'panel')
      (typo as { layout: typeof typo.layout }).layout = {
        ...typo.layout,
        sourceRoles: { ground: 'canvas', heading: 'text-1', body: 'boody' },
      };
    await expect(assessGuidelineApplication(nextReview, typo)).rejects.toThrow(
      'available source role'
    );
    const unmapped = structuredClone(request);
    if (unmapped.layout.kind === 'panel')
      delete (unmapped.layout as { sourceRoles?: unknown }).sourceRoles;
    await expect(assessGuidelineApplication(nextReview, unmapped)).rejects.toThrow(
      'Map each panel'
    );
  });
  it.each(['copy', 'mapping', 'mode', 'review', 'schema', 'unknown'] as const)(
    'rejects a saved %s substitution',
    async field => {
      const { review, request } = await fixture();
      const data = JSON.parse(
        (await exportGuidelineApplication(await assessGuidelineApplication(review, request)))
          .applicationJson
      );
      if (field === 'copy') data.request.layout.heading = 'Claimed approval';
      if (field === 'mapping') data.request.layout.sourceRoles.heading = 'decoration';
      if (field === 'mode') data.request.layout.modeId = 'missing';
      if (field === 'review') data.reviewHash = guidelineHash('changed review');
      if (field === 'schema') data.schemaVersion = 'teul.guideline-application.v5';
      if (field === 'unknown') data.unknown = true;
      await expect(readGuidelineApplication(JSON.stringify(data), review)).rejects.toThrow();
    }
  );
  it('escapes authored markup, refuses substituted results, and separates invalid edits from checked output', async () => {
    const { review, request } = await fixture();
    if (request.layout.kind !== 'panel') throw new Error('Panel expected');
    const panel = await assessGuidelineApplication(review, {
      ...request,
      layout: { ...request.layout, heading: '<script>alert(1)</script>' },
    });
    const exported = await exportGuidelineApplication(panel);
    expect(exported.svgs[0].svg).toContain('&lt;script&gt;');
    expect(exported.svgs[0].svg).not.toContain('<script>');
    await expect(exportGuidelineApplication({ ...panel })).rejects.toThrow('Assess');
    const draft = applicationDraftFromRequest(panel.request);
    const unfinished = { ...draft, panel: { ...draft.panel!, heading: '', body: 'a'.repeat(256) } };
    expect(applicationDraftMatchesRequest(unfinished, panel.request)).toBe(false);
    const saved = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: unfinished,
    });
    expect(saved.application).toEqual(unfinished);
    expect(saved.schemaVersion).toBe('teul.guideline-authoring.v4');
    await expect(
      assessGuidelineApplication(review, { ...request, layout: { ...request.layout, heading: '' } })
    ).rejects.toThrow();
    expect(await exportGuidelineApplication(panel)).toEqual(exported);
  });
  it('replays custom paints with mapped source roles through the existing overlay and recipe', async () => {
    const { review, request } = await fixture();
    const contextPaints = {
      version: 'teul.context-paints.v1' as const,
      id: 'panel-paints',
      actor: { kind: 'user' as const, ref: 'test' },
      paints: request.assignments.slice(0, 2).map((a, i) => ({
        id: i ? 'ink' : 'canvas',
        label: i ? 'Ink' : 'Canvas',
        role: i ? ('foreground' as const) : ('background' as const),
        modeId: request.layout.modeId,
        value: review.model.colors.find(c => c.id === a.colorId)!.valuesByMode[
          request.layout.modeId
        ],
      })),
    };
    const paints = guidelineContextPaintChoices(contextPaints);
    const panel = await assessGuidelineApplication(review, {
      ...request,
      contextPaints,
      assignments: request.assignments.map((a, i) => ({ ...a, colorId: paints[i ? 1 : 0].id })),
    });
    expect(panel.recipe).not.toBeNull();
    const exported = await exportGuidelineApplication(panel);
    expect(
      await exportGuidelineApplication(
        await readGuidelineApplication(exported.applicationJson, review)
      )
    ).toEqual(exported);
  });
  it('cold-reopens both a checked panel and unfinished draft, alongside the native comparison', async () => {
    const f = await fixture(),
      selected = await outputs(f.review);
    const unfinished = {
      ...selected.authoring.application!,
      panel: { ...selected.authoring.application!.panel!, heading: '' },
    };
    selected.authoring = createGuidelineAuthoringDraft(f.review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: unfinished,
    });
    const comparison = { sourceEntryId: null, sourceEntryModeId: null, comparison: f.wide };
    const json = await serializeGuidelineWorkspace(
      f.sourceJson,
      selected,
      null,
      undefined,
      null,
      f.selection,
      comparison
    );
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v14');
    await readAnyGuidelineProject(json); // consume prepared receipt; next read executes cold
    const opened = await readAnyGuidelineProject(json);
    if (opened.status !== 'opened') throw new Error('Expected open');
    expect(opened.value.outputs.authoring).toEqual(selected.authoring);
    expect(opened.value.gradientComparison).toEqual(comparison);
    expect(await exportGuidelineApplication(opened.value.outputs.application!)).toEqual(
      await exportGuidelineApplication(selected.application)
    );
    for (const application of [selected.application, null]) {
      const older = JSON.parse(
        await serializeGuidelineWorkspace(f.sourceJson, { ...selected, application })
      );
      older.schemaVersion = 'teul.guideline-workspace.v12';
      delete older.gradientComparison;
      await expect(readAnyGuidelineProject(reseal(older, 'bundleHash'))).rejects.toThrow();
    }
  });
  it('retains authored copy, dimensions and mappings through single-source refresh and history-only save', async () => {
    const f = await fixture(),
      selected = await outputs(f.review);
    const next = await readAnyGuidelineProject(f.sourceJson);
    if (next.status !== 'opened') throw new Error('Expected source');
    const history = await createGuidelineRefreshLineage(f.sourceJson, selected, next.value);
    expect(history.schemaVersion).toBe('teul.guideline-refresh-lineage.v11');
    const replay = await replayGuidelineRefresh(history, next.value);
    expect(replay.items.find(i => i.kind === 'application')?.status).toBe('restorable');
    expect(replay.outputs.application?.request.layout).toEqual(selected.application.request.layout);
    const json = await serializeGuidelineWorkspace(
      f.sourceJson,
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      history
    );
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v14');
    await readAnyGuidelineProject(json);
    expect((await readAnyGuidelineProject(json)).status).toBe('opened');
    const older = JSON.parse(json);
    older.schemaVersion = 'teul.guideline-workspace.v12';
    delete older.gradientComparison;
    await expect(readAnyGuidelineProject(reseal(older, 'bundleHash'))).rejects.toThrow('V14');
  });
  it('reopens combined sources and preserves panel history through source-set refresh', async () => {
    const f = await fixture();
    const entries = await Promise.all([
      prepareSourceSetEntry(f.sourceJson, 'native'),
      prepareSourceSetEntry(JSON.stringify(sourceSetPdf('Second source', '#777777')), 'pdf'),
    ]);
    const draft: SourceSetDraft = {
      entries: entries.map(e => e.entry),
      subjects: entries.flatMap(e => e.subjects),
      scope: 'brand',
      resolutions: [],
    };
    const decision = { actor: f.review.decision.actor, reviewedAt: f.review.decision.reviewedAt };
    const review = await applySourceSetReview(draft, decision),
      selected = await outputs(review);
    const workspace = { draft, review, outputs: selected, gradientSelection: null };
    const json = await serializeSourceSetProject(workspace);
    expect(JSON.parse(json).schemaVersion).toBe('teul.source-set-project.v8');
    const opened = await readSourceSetProject(json);
    if (opened.status !== 'opened') throw new Error('Expected open');
    expect(await exportGuidelineApplication(opened.value.outputs.application!)).toEqual(
      await exportGuidelineApplication(selected.application)
    );
    const next = await prepareSourceSetRefresh(workspace, 'native', f.sourceJson);
    expect(next.lineage.schemaVersion).toBe('teul.source-set-refresh.v7');
    const renewed = {
      ...workspace,
      draft: next.proposal.draft,
      review: await applySourceSetReview(next.proposal.draft, decision),
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      refresh: next.lineage,
    };
    const replay = await replaySourceSetRefresh(renewed);
    expect(replay.items.find(i => i.kind === 'application')?.status).toBe('restorable');
    const saved = await serializeSourceSetProject(renewed);
    expect(JSON.parse(saved).schemaVersion).toBe('teul.source-set-project.v8');
    const older = JSON.parse(saved);
    older.schemaVersion = 'teul.source-set-project.v6';
    delete older.gradientComparison;
    await expect(readSourceSetProject(reseal(older, 'projectHash'))).rejects.toThrow('V8');
  });
});
