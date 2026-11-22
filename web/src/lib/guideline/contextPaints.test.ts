import { describe, expect, it } from 'vitest';
import {
  contextPaintsFixture,
  contextPaintsExtensionFixture,
  contextApplicationRequest,
} from '../../../fixtures/guidelines/context-paints-fixture';
import {
  sourceSetPdf,
  sourceSetPdfRevision,
  sourceSetActor,
  sourceSetTime,
} from '../../../fixtures/guidelines/source-set-fixture';
import {
  assessGuidelineApplication,
  guidelineApplicationContextProposal,
  exportGuidelineApplication,
  buildGuidelineSourceApplication,
  guidelineApplicationSourceChoices,
} from './application';
import { applicationDraftFromRequest, applicationDraftMatchesRequest } from './applicationDraft';
import { createGuidelineAuthoringDraft, EMPTY_GUIDELINE_AUTHORING } from './authoringDraft';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { prepareSourceSetEntry, applySourceSetReview, type SourceSetDraft } from './sourceSet';
import { readSourceSetProject, serializeSourceSetProject } from './sourceSetProject';
import { createGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh } from './refreshReplay';
import { prepareSourceSetRefresh, replaySourceSetRefresh } from './sourceSetRefresh';
import { guidelineHash, type ReviewedGuideline } from './review';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { createGuidelineRuleDecision } from './extensionRuleReview';
import { readGuidelineContextPaints } from './contextPaints';
import {
  readGuidelineSelectedOutputs,
  storedGuidelineOutputs,
  EMPTY_GUIDELINE_OUTPUTS,
} from './selectedOutputs';

async function outputs(review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>) {
  const request = contextApplicationRequest(review);
  const application = await assessGuidelineApplication(review, request);
  expect(application.status, JSON.stringify(application.execution?.diagnostics)).toBe('ready');
  const draft = applicationDraftFromRequest(request);
  const authoring = createGuidelineAuthoringDraft(review, {
    ...EMPTY_GUIDELINE_AUTHORING,
    activeTask: 'application',
    application: draft,
  });
  return { extension: null, application, authoring, designBrief: authoring.briefs.application! };
}
const reseal = (raw: Record<string, unknown>, key: string) => {
  const { [key]: _hash, ...content } = raw;
  return JSON.stringify({ ...content, [key]: guidelineHash(content) });
};

describe('authored context paint portability', () => {
  it('keeps exact custom chart paint, shared comparison context, drafts, briefs and offline exports in one result', async () => {
    const f = contextPaintsFixture(),
      selected = await outputs(f.review);
    expect(selected.designBrief.schemaVersion).toBe('teul.guideline-design-brief.v2');
    expect(selected.authoring.schemaVersion).toBe('teul.guideline-authoring.v2');
    expect(selected.designBrief.input.contextPaints).toEqual(
      selected.application.request.contextPaints
    );
    expect(selected.designBrief.input.backgrounds[0]).toMatchObject({
      sourceColorId: null,
      value: selected.application.request.contextPaints!.paints[0].value,
    });
    const originals = buildGuidelineSourceApplication(
      f.review,
      selected.application,
      guidelineApplicationSourceChoices(f.review, selected.application)
    );
    expect(originals.contextPaints).toEqual(selected.application.request.contextPaints);
    expect(originals.assignments).toEqual(selected.application.request.assignments);
    const files = await exportGuidelineApplication(selected.application);
    const json = await serializeGuidelineWorkspace(f.sourceJson, selected);
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v11');
    await readAnyGuidelineProject(json); // Consume the exact-serialization cache before cold replay.
    const opened = await readAnyGuidelineProject(json);
    if (opened.status !== 'opened') throw new Error('Expected supported project');
    expect(opened.value.outputs.authoring).toEqual(selected.authoring);
    expect(opened.value.outputs.designBrief).toEqual(selected.designBrief);
    expect(await exportGuidelineApplication(opened.value.outputs.application!)).toEqual(files);
    expect(opened.value.project).toEqual(f.project);
    await expect(
      readGuidelineSelectedOutputs(
        storedGuidelineOutputs(selected),
        f.review,
        undefined,
        true,
        true
      )
    ).rejects.toThrow('newer project');
    for (const version of ['teul.guideline-workspace.v9', 'teul.guideline-workspace.v10']) {
      const older = JSON.parse(json);
      older.schemaVersion = version;
      await expect(readAnyGuidelineProject(reseal(older, 'bundleHash'))).rejects.toThrow();
    }
    const draftOnly = JSON.parse(json);
    draftOnly.outputs.application = null;
    draftOnly.designBrief = null;
    draftOnly.schemaVersion = 'teul.guideline-workspace.v9';
    await expect(readAnyGuidelineProject(reseal(draftOnly, 'bundleHash'))).rejects.toThrow('V11');
  });

  it('invalidates changed, deleted, wrong-mode and masquerading context values without changing the retained result', async () => {
    const f = contextPaintsFixture(),
      selected = await outputs(f.review),
      original = await exportGuidelineApplication(selected.application);
    const draft = applicationDraftFromRequest(selected.application.request);
    expect(applicationDraftMatchesRequest(draft, selected.application.request)).toBe(true);
    const changed = {
      ...draft,
      contextPaints: {
        ...draft.contextPaints!,
        paints: draft.contextPaints!.paints.map((paint, i) =>
          i ? paint : { ...paint, value: buildColorSystemSrgbValueV1({ r: 1, g: 1, b: 1 }) }
        ),
      },
    };
    expect(applicationDraftMatchesRequest(changed, selected.application.request)).toBe(false);
    const missing = {
      ...selected.application.request,
      contextPaints: { ...draft.contextPaints!, paints: draft.contextPaints!.paints.slice(1) },
    };
    await expect(assessGuidelineApplication(f.review, missing)).rejects.toThrow(
      'Every actual paint'
    );
    const wrongMode = {
      ...selected.application.request,
      contextPaints: {
        ...draft.contextPaints!,
        paints: draft.contextPaints!.paints.map(paint => ({ ...paint, modeId: 'Wrong' })),
      },
    };
    await expect(assessGuidelineApplication(f.review, wrongMode)).rejects.toThrow(
      'actual application mode'
    );
    expect(() =>
      readGuidelineContextPaints({ ...draft.contextPaints, sourceApproved: true })
    ).toThrow();
    expect(await exportGuidelineApplication(selected.application)).toEqual(original);
  });

  it.each([null, false, 0, ''])(
    'rejects malformed explicit context review: %s',
    async contextReview => {
      const f = contextPaintsFixture();
      const request = { ...contextApplicationRequest(f.review), contextReview };
      await expect(
        assessGuidelineApplication(
          f.review,
          request as unknown as Parameters<typeof assessGuidelineApplication>[1]
        )
      ).rejects.toThrow();
    }
  );

  it('binds explicit source-rule renewal to exact custom values and does not allow it to waive a source prohibition', async () => {
    const f = await contextPaintsExtensionFixture(),
      request = f.request;
    const pending = await assessGuidelineApplication(f.review, request);
    const proposal = guidelineApplicationContextProposal(pending)!;
    expect(proposal.pendingRuleIds.length).toBeGreaterThan(0);
    expect(pending.status).toBe('ready'); // The forbidden pair is absent from this application.
    const contextReview = createGuidelineRuleDecision(
      f.review.reviewHash,
      proposal,
      Object.fromEntries(proposal.pendingRuleIds.map(id => [id, 'accepted']))
    );
    const ready = await assessGuidelineApplication(f.review, { ...request, contextReview });
    expect(ready.status).toBe('ready');
    const changed = {
      ...request,
      contextReview,
      contextPaints: {
        ...request.contextPaints!,
        paints: request.contextPaints!.paints.map((paint, i) =>
          i ? paint : { ...paint, value: buildColorSystemSrgbValueV1({ r: 0.001, g: 0, b: 0 }) }
        ),
      },
    };
    await expect(assessGuidelineApplication(f.review, changed)).rejects.toThrow();
    const gold = f.review.model.colors.find(
      c => c.valuesByMode[request.layout.modeId]?.hex === '#DDBB22'
    )!;
    const forbidden = {
      ...request,
      assignments: request.assignments.map(a =>
        a.useId === 'mark-2' ? { ...a, colorId: gold.id } : a
      ),
    };
    const next = await assessGuidelineApplication(f.review, forbidden),
      nextProposal = guidelineApplicationContextProposal(next)!;
    const decision = createGuidelineRuleDecision(
      f.review.reviewHash,
      nextProposal,
      Object.fromEntries(nextProposal.pendingRuleIds.map(id => [id, 'accepted']))
    );
    const refused = await assessGuidelineApplication(f.review, {
      ...forbidden,
      contextReview: decision,
    });
    expect(refused.recipe).toBeNull();
    expect(refused.assessment?.applications.some(a => a.rules.some(r => r.status === 'fail'))).toBe(
      true
    );
  });

  it('preserves authored IDs and exact paint through an unrelated single-source refresh and versioned history', async () => {
    const f = contextPaintsFixture(),
      selected = await outputs(f.review);
    const nextProject = sourceSetPdfRevision(f.project, { note: true });
    const next = await readAnyGuidelineProject(JSON.stringify(nextProject));
    if (next.status !== 'opened') throw new Error('Expected source');
    const history = await createGuidelineRefreshLineage(f.sourceJson, selected, next.value);
    expect(history.schemaVersion).toBe('teul.guideline-refresh-lineage.v9');
    const fresh = await replayGuidelineRefresh(history, next.value);
    expect(fresh.items.find(item => item.kind === 'application')?.status).toBe('restorable');
    expect(fresh.outputs.application!.request.contextPaints).toEqual(
      selected.application.request.contextPaints
    );
    expect(fresh.outputs.authoring!.application!.contextPaints).toEqual(
      selected.authoring.application!.contextPaints
    );
    expect((await exportGuidelineApplication(fresh.outputs.application!)).svgs).toEqual(
      (await exportGuidelineApplication(selected.application)).svgs
    );
    const saved = await serializeGuidelineWorkspace(
      JSON.stringify(nextProject),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      history
    );
    expect(JSON.parse(saved).schemaVersion).toBe('teul.guideline-workspace.v11');
    const older = JSON.parse(saved);
    older.schemaVersion = 'teul.guideline-workspace.v9';
    await expect(readAnyGuidelineProject(reseal(older, 'bundleHash'))).rejects.toThrow('V11');
  });

  it('cold reopens combined projects and retains exact custom paint through combined-source refresh', async () => {
    const f = contextPaintsFixture(),
      other = sourceSetPdf('Second source', '#777777');
    const entries = await Promise.all([
      prepareSourceSetEntry(f.sourceJson, 'A'),
      prepareSourceSetEntry(JSON.stringify(other), 'B'),
    ]);
    const draft: SourceSetDraft = {
      entries: entries.map(e => e.entry),
      subjects: entries.flatMap(e => e.subjects),
      scope: 'brand',
      resolutions: [],
    };
    const review = await applySourceSetReview(draft, {
      actor: sourceSetActor,
      reviewedAt: sourceSetTime,
    });
    const selected = await outputs(review);
    const workspace = { draft, review, outputs: selected, gradientSelection: null };
    const json = await serializeSourceSetProject(workspace);
    expect(JSON.parse(json).schemaVersion).toBe('teul.source-set-project.v5');
    const opened = await readSourceSetProject(json);
    if (opened.status !== 'opened') throw new Error('Expected source set');
    expect(opened.value.outputs.authoring).toEqual(selected.authoring);
    expect(await exportGuidelineApplication(opened.value.outputs.application!)).toEqual(
      await exportGuidelineApplication(selected.application)
    );
    const older = JSON.parse(json);
    older.schemaVersion = 'teul.source-set-project.v4';
    await expect(readSourceSetProject(reseal(older, 'projectHash'))).rejects.toThrow();
    const next = await prepareSourceSetRefresh(
      workspace,
      'A',
      JSON.stringify(sourceSetPdfRevision(f.project, { note: true }))
    );
    expect(next.lineage.schemaVersion).toBe('teul.source-set-refresh.v4');
    const renewed = {
      ...workspace,
      draft: next.proposal.draft,
      review: await applySourceSetReview(next.proposal.draft, {
        actor: sourceSetActor,
        reviewedAt: sourceSetTime,
      }),
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      refresh: next.lineage,
    };
    const result = await replaySourceSetRefresh(renewed);
    expect(result.items.find(item => item.kind === 'application')?.status).toBe('restorable');
    expect(result.outputs.application!.request.contextPaints).toEqual(
      selected.application.request.contextPaints
    );
    const historyOnly = await serializeSourceSetProject(renewed);
    expect(JSON.parse(historyOnly).schemaVersion).toBe('teul.source-set-project.v5');
  });
});
