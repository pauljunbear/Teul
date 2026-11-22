import { describe, expect, it } from 'vitest';
import { capacityApplicationFixture } from '../../../fixtures/guidelines/capacity-application-fixture';
import {
  sourceSetActor,
  sourceSetPdf,
  sourceSetPdfRevision,
  sourceSetTime,
} from '../../../fixtures/guidelines/source-set-fixture';
import {
  assessGuidelineApplication,
  exportGuidelineApplication,
  type GuidelineApplicationRequest,
} from './application';
import {
  applicationDraftFromRequest,
  applicationDraftMatchesRequest,
  applicationLayoutFromDraft,
} from './applicationDraft';
import {
  createGuidelineAuthoringDraft,
  EMPTY_GUIDELINE_AUTHORING,
  readGuidelineAuthoringDraft,
} from './authoringDraft';
import { readGuidelineDesignBrief } from './designBrief';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { createGuidelineRefreshLineage, readGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh } from './refreshReplay';
import { guidelineHash } from './review';
import { EMPTY_GUIDELINE_OUTPUTS, hasGuidelineCapacity } from './selectedOutputs';
import { applySourceSetReview, prepareSourceSetEntry, type SourceSetDraft } from './sourceSet';
import { readSourceSetProject, serializeSourceSetProject } from './sourceSetProject';
import { prepareSourceSetRefresh, replaySourceSetRefresh } from './sourceSetRefresh';
import { bindCaptureV2 } from './evidenceV2';
import { parseSingleStatedDigitalColor } from './numericEvidence';
import { compileGuidelineReviewV3 } from './reviewV3';
import { buildGuidelineProjectV3 } from './projectV3';

function authoringFor(
  review: Parameters<typeof createGuidelineAuthoringDraft>[0],
  request: GuidelineApplicationRequest
) {
  return createGuidelineAuthoringDraft(review, {
    ...EMPTY_GUIDELINE_AUTHORING,
    activeTask: 'application',
    application: applicationDraftFromRequest(request),
  });
}

function downgrade(json: string, schemaVersion: string, hashKey: 'bundleHash' | 'projectHash') {
  const body = JSON.parse(json);
  delete body[hashKey];
  body.schemaVersion = schemaVersion;
  return JSON.stringify({ ...body, [hashKey]: guidelineHash(body) });
}

describe('capacity composition persistence', () => {
  it('binds complete controls into the brief and rejects downgraded authoring and brief versions', () => {
    const { review, request } = capacityApplicationFixture();
    const authoring = authoringFor(review, request);
    expect(authoring.schemaVersion).toBe('teul.guideline-authoring.v8');
    expect(authoring.briefs.application?.schemaVersion).toBe('teul.guideline-design-brief.v5');
    expect(authoring.briefs.application?.input.capacityCompositionHash).toBe(
      guidelineHash(applicationLayoutFromDraft(authoring.application!))
    );
    if (request.layout.kind !== 'chart' || !request.layout.capacity) throw new Error('fixture');
    const changed = {
      ...request,
      layout: {
        ...request.layout,
        capacity: {
          ...request.layout.capacity,
          input: { ...request.layout.capacity.input, unit: 'hours' },
        },
      },
    };
    expect(
      authoringFor(review, changed).briefs.application?.input.capacityCompositionHash
    ).not.toBe(authoring.briefs.application?.input.capacityCompositionHash);
    expect(() =>
      readGuidelineAuthoringDraft(
        { ...authoring, schemaVersion: 'teul.guideline-authoring.v7' },
        review
      )
    ).toThrow();
    expect(() =>
      readGuidelineDesignBrief(
        { ...authoring.briefs.application, schemaVersion: 'teul.guideline-design-brief.v4' },
        review
      )
    ).toThrow();
    const combined = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      application: authoring.application,
      nativeGradient: null,
    });
    expect(readGuidelineAuthoringDraft(combined, review).nativeGradient).toBeNull();
  });

  it('cold reopens selected, draft-only and brief-only capacity work using V18', async () => {
    const { project, review, request } = capacityApplicationFixture();
    const application = await assessGuidelineApplication(review, request);
    expect(application.status).toBe('ready');
    const authoring = authoringFor(review, request);
    for (const selected of [
      { application, authoring, designBrief: authoring.briefs.application },
      { application: null, authoring },
      { application: null, designBrief: authoring.briefs.application },
    ]) {
      const json = await serializeGuidelineWorkspace(JSON.stringify(project), {
        extension: null,
        ...selected,
      });
      expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v18');
      await readAnyGuidelineProject(json);
      const opened = await readAnyGuidelineProject(json);
      if (opened.status !== 'opened') throw new Error('Expected current workspace.');
      expect(hasGuidelineCapacity(opened.value.outputs)).toBe(true);
      await expect(
        readAnyGuidelineProject(downgrade(json, 'teul.guideline-workspace.v17', 'bundleHash'))
      ).rejects.toThrow(/Capacity/);
    }
  });

  it('keeps unfinished raw counts separate from the checked application across reopen and refresh', async () => {
    const { project, review, request } = capacityApplicationFixture();
    const application = await assessGuidelineApplication(review, request);
    const draft = applicationDraftFromRequest(request);
    const input = draft.chart!.capacity!.input;
    const edits = {
      heading: input.heading,
      unit: input.unit,
      labels: input.records.map(r => r.label),
      booked: input.records.map(r => String(r.booked)),
      capacities: input.records.map(r => String(r.capacity)),
    };
    edits.booked[0] = '';
    const unfinished = { ...draft, capacityEdits: edits };
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: unfinished,
    });
    const outputs = {
      extension: null,
      application,
      authoring,
      designBrief: authoring.briefs.application,
    };
    const json = await serializeGuidelineWorkspace(JSON.stringify(project), outputs);
    await readAnyGuidelineProject(json);
    const opened = await readAnyGuidelineProject(json);
    if (opened.status !== 'opened') throw new Error('Expected current workspace.');
    expect(opened.value.outputs.authoring?.application?.capacityEdits).toEqual(edits);
    expect(opened.value.outputs.application?.request).toEqual(request);
    expect(applicationDraftMatchesRequest(unfinished, request)).toBe(false);
    await expect(
      assessGuidelineApplication(review, {
        ...request,
        layout: applicationLayoutFromDraft(unfinished),
      })
    ).rejects.toThrow();
    const next = {
      kind: 'pdf' as const,
      format: 'project' as const,
      project: sourceSetPdfRevision(project, { note: true }),
    };
    const lineage = await createGuidelineRefreshLineage(JSON.stringify(project), outputs, next);
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v15');
    const refreshed = await replayGuidelineRefresh(lineage, next);
    expect(refreshed.outputs.authoring?.application?.capacityEdits).toEqual(edits);
    expect(refreshed.outputs.authoring?.application?.chart?.capacity?.sourceRoles).toEqual(
      draft.chart!.capacity!.sourceRoles
    );
    expect(refreshed.outputs.application?.status).toBe('ready');
    expect(refreshed.outputs.designBrief?.input.capacityCompositionHash).toBeDefined();
    expect((await exportGuidelineApplication(refreshed.outputs.application!)).svgs).toEqual(
      (await exportGuidelineApplication(application)).svgs
    );
  }, 30000);

  it('retains capacity capability when only single-source history remains', async () => {
    const { project, review, request } = capacityApplicationFixture();
    const authoring = authoringFor(review, request);
    const next = {
      kind: 'pdf' as const,
      format: 'project' as const,
      project: sourceSetPdfRevision(project, { note: true }),
    };
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(project),
      { extension: null, application: null, authoring },
      next
    );
    const json = await serializeGuidelineWorkspace(
      JSON.stringify(next.project),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      lineage
    );
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v18');
    await readAnyGuidelineProject(json);
    expect((await readAnyGuidelineProject(json)).status).toBe('opened');
    await expect(
      readAnyGuidelineProject(downgrade(json, 'teul.guideline-workspace.v17', 'bundleHash'))
    ).rejects.toThrow(/Capacity/);
    const { lineageHash: _hash, ...old } = lineage;
    const downgraded = { ...old, schemaVersion: 'teul.guideline-refresh-lineage.v14' };
    await expect(
      readGuidelineRefreshLineage({ ...downgraded, lineageHash: guidelineHash(downgraded) }, next)
    ).rejects.toThrow(/Capacity/);
  });

  it('does not reconstruct capacity records from a standalone brief hash during refresh', async () => {
    const { project, review, request } = capacityApplicationFixture();
    const designBrief = authoringFor(review, request).briefs.application;
    const next = {
      kind: 'pdf' as const,
      format: 'project' as const,
      project: sourceSetPdfRevision(project, { note: true }),
    };
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(project),
      { ...EMPTY_GUIDELINE_OUTPUTS, designBrief },
      next
    );
    const replay = await replayGuidelineRefresh(lineage, next);
    expect(replay.outputs.designBrief ?? null).toBeNull();
    expect(replay.items.find(item => item.kind === 'brief')).toMatchObject({
      status: 'needs-review',
      reason: expect.stringContaining('retained capacity controls'),
    });
  });

  it('invalidates changed chosen paints while preserving previous capacity work in history', async () => {
    const { project, review, request } = capacityApplicationFixture();
    const application = await assessGuidelineApplication(review, request);
    const authoring = authoringFor(review, request);
    const { captureHash: _hash, ...raw } = structuredClone(project.capture);
    const numeric = parseSingleStatedDigitalColor('#000000');
    raw.identity.sha256 = guidelineHash('changed capacity category color');
    raw.observations = raw.observations.map(observation =>
      observation.id === 'color:source-blue' && observation.kind === 'color'
        ? { ...observation, literal: '#000000', value: numeric.value, syntax: numeric.syntax }
        : observation.id === 'text:source-blue' && observation.kind === 'text'
          ? { ...observation, text: 'source-blue #000000' }
          : observation
    );
    const capture = bindCaptureV2(raw);
    const draft = { ...project.draft, captureHash: capture.captureHash };
    const next = {
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
      { extension: null, application, authoring },
      next
    );
    const replay = await replayGuidelineRefresh(history, next);
    expect(replay.outputs.application).toBeNull();
    expect(replay.outputs.authoring?.application ?? null).toBeNull();
    expect(replay.items.find(item => item.kind === 'application')?.status).toBe('stale');
    expect(history.previousOutputs.application?.request).toEqual(request);
  });

  it('cold reopens, refreshes and retains history-only capacity source sets', async () => {
    const { project, request } = capacityApplicationFixture();
    const prepared = await prepareSourceSetEntry(JSON.stringify(project), 'capacity-source');
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
    const modeId = review.model.modes[0].id;
    const color = (old: string) =>
      review.model.colors.find(
        c => c.label === project.review!.model.colors.find(c => c.id === old)!.label
      )!.id;
    if (request.layout.kind !== 'chart' || !request.layout.capacity) throw new Error('fixture');
    const combinedRequest = {
      ...request,
      layout: {
        ...request.layout,
        modeId,
        capacity: {
          ...request.layout.capacity,
          input: { ...request.layout.capacity.input, modeId },
        },
      },
      assignments: request.assignments.map(assignment => ({
        ...assignment,
        colorId: color(assignment.colorId),
      })),
    };
    const application = await assessGuidelineApplication(review, combinedRequest);
    expect(application.status).toBe('ready');
    const authoring = authoringFor(review, combinedRequest);
    const workspace = {
      draft,
      review,
      outputs: { extension: null, application, authoring },
      gradientSelection: null,
    };
    const json = await serializeSourceSetProject(workspace);
    expect(JSON.parse(json).schemaVersion).toBe('teul.source-set-project.v12');
    expect((await readSourceSetProject(json)).status).toBe('opened');
    await expect(
      readSourceSetProject(downgrade(json, 'teul.source-set-project.v11', 'projectHash'))
    ).rejects.toThrow(/Capacity/);
    const next = await prepareSourceSetRefresh(
      workspace,
      'capacity-source',
      JSON.stringify(project)
    );
    expect(next.lineage.schemaVersion).toBe('teul.source-set-refresh.v11');
    const refreshed = {
      ...workspace,
      draft: next.proposal.draft,
      review: await applySourceSetReview(next.proposal.draft, decision),
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      refresh: next.lineage,
    };
    const replay = await replaySourceSetRefresh(refreshed);
    expect(replay.outputs.application?.status).toBe('ready');
    expect(replay.outputs.authoring?.application?.chart?.capacity?.input.modeId).toBe(
      refreshed.review.model.modes[0].id
    );
    const historyJson = await serializeSourceSetProject(refreshed);
    expect(JSON.parse(historyJson).schemaVersion).toBe('teul.source-set-project.v12');
    expect((await readSourceSetProject(historyJson)).status).toBe('opened');
    await expect(
      readSourceSetProject(downgrade(historyJson, 'teul.source-set-project.v11', 'projectHash'))
    ).rejects.toThrow(/Capacity/);
  }, 30000);
});
