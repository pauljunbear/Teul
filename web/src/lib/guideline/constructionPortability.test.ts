import { describe, expect, it } from 'vitest';
import {
  constructionPortabilityArtifacts,
  reopenConstructionPortabilityArtifacts,
} from '../../../fixtures/guidelines/construction-portability-artifacts';
import { contextApplicationRequest } from '../../../fixtures/guidelines/context-paints-fixture';
import {
  sourceSetPdf,
  sourceSetPdfRevision,
  sourceSetActor,
  sourceSetTime,
} from '../../../fixtures/guidelines/source-set-fixture';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { guidelineHash } from './review';
import {
  readGuidelineApplication,
  assessGuidelineApplication,
  exportGuidelineApplication,
} from './application';
import {
  parseColorSystemRecipeV1,
  readColorSystemRecipeJsonV1,
} from '../../../../src/lib/colorSystemRecipeV1';
import { previewGuidelineExtension, readGuidelineExtensionRequest } from './extension';
import {
  guidelineScaleRequest,
  createGuidelineAuthoringDraft,
  EMPTY_GUIDELINE_AUTHORING,
  type GuidelineScaleDraft,
} from './authoringDraft';
import { applicationDraftFromRequest } from './applicationDraft';
import { prepareSourceSetEntry, applySourceSetReview, type SourceSetDraft } from './sourceSet';
import { readSourceSetProject, serializeSourceSetProject } from './sourceSetProject';
import { createGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh } from './refreshReplay';
import { prepareSourceSetRefresh, replaySourceSetRefresh } from './sourceSetRefresh';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';

const reseal = (raw: Record<string, unknown>, field: string) => {
  const { [field]: _old, ...content } = raw;
  return JSON.stringify({ ...content, [field]: guidelineHash(content) });
};
async function openedFixture() {
  const packet = await constructionPortabilityArtifacts();
  await readAnyGuidelineProject(packet.workspace);
  const opened = await readAnyGuidelineProject(packet.workspace);
  if (opened.status !== 'opened') throw new Error('Expected workspace');
  return { packet, ...opened.value };
}

describe('V2 construction saved-file capability and replay', () => {
  it('cold reopens real reviewed construction plus native paints and produces identical exports', async () => {
    const packet = await constructionPortabilityArtifacts();
    const reopened = await reopenConstructionPortabilityArtifacts(packet);
    expect(reopened.workspaceExports).toEqual(packet.exports);
    expect(reopened.applicationExports).toEqual(packet.exports);
    expect(JSON.parse(packet.workspace).schemaVersion).toBe('teul.guideline-workspace.v12');
    expect(reopened.authoring?.schemaVersion).toBe('teul.guideline-authoring.v3');
    const application = JSON.parse(packet.exports.applicationJson);
    expect(application.schemaVersion).toBe('teul.guideline-application.v5');
    expect(application.recipe.schemaVersion).toBe('teul.color-system-recipe.v2');
    const source = JSON.parse(packet.sourceJson).review.model;
    for (const color of source.colors)
      expect(
        application.recipe.selection.model.colors.find((c: { id: string }) => c.id === color.id)
      ).toEqual(color);
    expect(application.request.contextPaints.paints[0].value.components.r).toBe(0.0000123456789);
  });

  it('refuses downgraded envelopes, mixed or unknown calculations and changed source/value approval', async () => {
    const f = await openedFixture(),
      review = f.project.review!;
    const old = JSON.parse(f.packet.workspace);
    old.schemaVersion = 'teul.guideline-workspace.v11';
    await expect(readAnyGuidelineProject(reseal(old, 'bundleHash'))).rejects.toThrow(
      'newer project'
    );
    old.outputs = { extension: null, application: null };
    await expect(readAnyGuidelineProject(reseal(old, 'bundleHash'))).rejects.toThrow('V12');
    const envelope = JSON.parse(f.packet.exports.applicationJson);
    envelope.schemaVersion = 'teul.guideline-application.v4';
    await expect(readGuidelineApplication(JSON.stringify(envelope), review)).rejects.toThrow('V5');
    const recipe = structuredClone(envelope.recipe);
    recipe.schemaVersion = 'teul.color-system-recipe.v1';
    expect(() => parseColorSystemRecipeV1(recipe)).toThrow('newer recipe');
    recipe.schemaVersion = 'teul.color-system-recipe.v2';
    const construction = recipe.direction.generation.proposal.fragments.find(
      (f: { kind: string }) => f.kind === 'construction'
    );
    construction.intent.version = 'teul.construction-proposal.v1';
    expect(() => parseColorSystemRecipeV1(recipe)).toThrow('versions');
    construction.intent.version = 'teul.construction-proposal.v3';
    expect(() => parseColorSystemRecipeV1(recipe)).toThrow('versions');
    const future = JSON.stringify({ ...recipe, schemaVersion: 'teul.color-system-recipe.v999' });
    expect(readColorSystemRecipeJsonV1(future)).toMatchObject({ status: 'read-only', raw: future });
    const request = f.outputs.application!.request;
    expect(() =>
      readGuidelineExtensionRequest({ ...request.extension!.preview.request, numericVersion: 3 })
    ).toThrow('version');
    await expect(
      readGuidelineApplication(f.packet.exports.applicationJson, {
        ...review,
        reviewHash: guidelineHash('changed-source'),
      })
    ).rejects.toThrow('changed source');
    const contextPaints = structuredClone(request.contextPaints!);
    const changed = {
      ...request,
      contextPaints: {
        ...contextPaints,
        paints: contextPaints.paints.map((p, i) =>
          i
            ? p
            : {
                ...p,
                value: { ...p.value, components: { ...p.value.components, r: 0.000012345678901 } },
              }
        ),
      },
    };
    await expect(assessGuidelineApplication(review, changed)).rejects.toThrow();
    expect(await exportGuidelineApplication(f.outputs.application!)).toEqual(f.packet.exports);
  });

  it('keeps unversioned controls on V1 and requires an explicit changed draft for V2', async () => {
    const project = sourceSetPdf(),
      review = project.review!,
      scale = review.model.scales[0];
    const draft: GuidelineScaleDraft = {
      operation: 'interior',
      anchorColorId: '',
      familyId: '',
      scaleLabel: '',
      polarity: 'light',
      scaleId: scale.id,
      derivedScaleId: '',
      modeId: scale.modes[0].modeId,
      context: 'brand',
      order: 'none',
      additions: [{ slotId: 'middle', position: '1' }],
    };
    const legacy = guidelineScaleRequest(review, draft),
      current = guidelineScaleRequest(review, { ...draft, numericVersion: 2 });
    expect(legacy).not.toHaveProperty('numericVersion');
    expect(current.numericVersion).toBe(2);
    const before = await previewGuidelineExtension(review, legacy),
      after = await previewGuidelineExtension(review, current);
    expect(before.generation?.brief.schemaVersion).toBe('teul.scale-construction-brief.v1');
    expect(after.generation?.brief.schemaVersion).toBe('teul.scale-construction-brief.v2');
    expect(after.requestHash).not.toBe(before.requestHash);
    expect(
      createGuidelineAuthoringDraft(review, { ...EMPTY_GUIDELINE_AUTHORING, extension: draft })
        .schemaVersion
    ).toBe('teul.guideline-authoring.v1');
    expect(
      createGuidelineAuthoringDraft(review, {
        ...EMPTY_GUIDELINE_AUTHORING,
        extension: { ...draft, numericVersion: 2 },
      }).schemaVersion
    ).toBe('teul.guideline-authoring.v3');
  });

  it('retains V2 through single-source history and rejects hiding it under old history', async () => {
    const f = await openedFixture();
    if (f.kind !== 'pdf' || f.project.schemaVersion !== 'teul.guideline-project.v3')
      throw new Error('Expected PDF V3');
    const next = sourceSetPdfRevision(f.project, { note: true }),
      opened = await readAnyGuidelineProject(JSON.stringify(next));
    if (opened.status !== 'opened') throw new Error('Expected next source');
    const history = await createGuidelineRefreshLineage(
      f.packet.sourceJson,
      f.outputs,
      opened.value
    );
    expect(history.schemaVersion).toBe('teul.guideline-refresh-lineage.v10');
    const saved = await serializeGuidelineWorkspace(
      JSON.stringify(next),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      history
    );
    const result = await replayGuidelineRefresh(history, opened.value);
    expect(result.outputs.extension?.preview.request.numericVersion).toBe(2);
    const old = JSON.parse(saved);
    old.schemaVersion = 'teul.guideline-workspace.v11';
    await expect(readAnyGuidelineProject(reseal(old, 'bundleHash'))).rejects.toThrow('V12');
  });

  it('retains selected V2 scales, native paints and their intent through combined-source refresh', async () => {
    const project = sourceSetPdf('Public combined source', '#777777');
    const entries = await Promise.all([
      prepareSourceSetEntry(JSON.stringify(project), 'A'),
      prepareSourceSetEntry(JSON.stringify(sourceSetPdf('Second public source', '#777777')), 'B'),
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
    const request = contextApplicationRequest(review);
    const preview = await previewGuidelineExtension(review, {
      numericVersion: 2,
      context: 'brand',
      modeId: request.layout.modeId,
      scaleId: review.model.scales[0].id,
      additions: [{ slotId: 'middle', position: 1 }],
      lightnessOrder: 'none',
    });
    const extension = { preview, decision: null };
    const application = await assessGuidelineApplication(review, {
      ...request,
      extension: {
        ...extension,
        anchorColorId: review.model.scales[0].modes[0].anchors[0].colorId,
        purpose: 'categorical-data',
      },
      assignments: request.assignments.map(a =>
        a.useId === 'mark-1' ? { ...a, colorId: preview.generatedBindings[0].colorId } : a
      ),
    });
    expect(application.status).toBe('ready');
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: applicationDraftFromRequest(application.request),
    });
    const workspace = {
      draft,
      review,
      outputs: { extension, application, authoring },
      gradientSelection: null,
    };
    const json = await serializeSourceSetProject(workspace),
      opened = await readSourceSetProject(json);
    expect(JSON.parse(json).schemaVersion).toBe('teul.source-set-project.v6');
    if (opened.status !== 'opened') throw new Error('Expected combined source');
    expect(await exportGuidelineApplication(opened.value.outputs.application!)).toEqual(
      await exportGuidelineApplication(application)
    );
    const old = JSON.parse(json);
    old.schemaVersion = 'teul.source-set-project.v5';
    await expect(readSourceSetProject(reseal(old, 'projectHash'))).rejects.toThrow('newer project');
    const next = await prepareSourceSetRefresh(
      workspace,
      'A',
      JSON.stringify(sourceSetPdfRevision(project, { note: true }))
    );
    expect(next.lineage.schemaVersion).toBe('teul.source-set-refresh.v5');
    const refreshed = {
      ...workspace,
      draft: next.proposal.draft,
      review: await applySourceSetReview(next.proposal.draft, {
        actor: sourceSetActor,
        reviewedAt: sourceSetTime,
      }),
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      refresh: next.lineage,
    };
    const restored = await replaySourceSetRefresh(refreshed);
    expect(restored.outputs.application?.request.extension?.preview.request.numericVersion).toBe(2);
    const saved = await serializeSourceSetProject(refreshed);
    expect(JSON.parse(saved).schemaVersion).toBe('teul.source-set-project.v6');
  });
});
