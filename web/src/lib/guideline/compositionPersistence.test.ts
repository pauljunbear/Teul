import { parseGradientDesignV2 } from '../../../../src/lib/colorSystemGradientDesignV2';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../../../../src/lib/colorSystemModelV1';
import { describe, expect, it } from 'vitest';
import { nativeGradientComparisonFixture } from '../../../fixtures/guidelines/native-gradient-comparison-fixture';
import { sourceSetPdf } from '../../../fixtures/guidelines/source-set-fixture';
import { assessGuidelineApplication, type GuidelineApplicationRequest } from './application';
import {
  applicationDraftFromRequest,
  applicationDraftMatchesRequest,
  readGuidelineApplicationDraft,
} from './applicationDraft';
import {
  createGuidelineAuthoringDraft,
  readGuidelineAuthoringDraft,
  EMPTY_GUIDELINE_AUTHORING,
} from './authoringDraft';
import { buildFigmaProject } from './figmaProject';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { createGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh, replayReviewedDesigns } from './refreshReplay';
import { EMPTY_GUIDELINE_OUTPUTS, hasGuidelineComposition } from './selectedOutputs';
import { guidelineHash, type ReviewedGuideline } from './review';
import { createGuidelineContinuousGradient } from './authoredGradient';
import { prepareSourceSetEntry, applySourceSetReview, type SourceSetDraft } from './sourceSet';
import { serializeSourceSetProject, readSourceSetProject } from './sourceSetProject';
import { prepareSourceSetRefresh, replaySourceSetRefresh } from './sourceSetRefresh';
import { readGuidelineDesignBrief } from './designBrief';

function requestFor(
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>
): GuidelineApplicationRequest {
  const modeId = review.model.modes[0].id;
  const colors = review.model.colors.filter(c => c.valuesByMode[modeId]);
  const white = colors.find(c => c.valuesByMode[modeId].components.r === 1)!;
  const black = colors.find(c => c.valuesByMode[modeId].components.r === 0)!;
  const selection = createGuidelineContinuousGradient(review, {
    modeId,
    scope: 'brand',
    angle: 43.5,
    route: { space: 'oklab' },
    stops: [0, 1].map(position => ({ colorId: black.id, position, locked: true })),
  });
  return {
    layout: {
      kind: 'composition',
      sourceContextId: 'brand',
      modeId,
      width: 400,
      height: 320,
      heading: 'A clearer direction',
      body: 'Compare exact retained paint.',
      sourceRoles: { ground: 'canvas', heading: 'heading', body: 'body' },
    },
    decorativeGradient: { selection, sourceRole: 'illustration' },
    assignments: ['ground', 'text-1', 'text-2'].map((useId, i) => ({
      applicationId: 'composition',
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
  return { ...value, sourceJson: JSON.stringify(project) };
}
function reseal(raw: Record<string, unknown>, field: string) {
  const body = { ...raw };
  delete body[field];
  return JSON.stringify({ ...body, [field]: guidelineHash(body) });
}
async function outputs(review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>) {
  const application = await assessGuidelineApplication(review, requestFor(review));
  const authoring = createGuidelineAuthoringDraft(review, {
    ...EMPTY_GUIDELINE_AUTHORING,
    activeTask: 'application',
    application: applicationDraftFromRequest(application.request),
  });
  return { extension: null, application, authoring, designBrief: authoring.briefs.application! };
}

describe('mixed composition persistence', () => {
  it('saves missing-gradient controls, binds exact embedded selection to its brief, and rejects downgrade', async () => {
    const { review } = await fixture(),
      request = requestFor(review);
    const draft = applicationDraftFromRequest(request);
    expect(readGuidelineApplicationDraft(draft)).toEqual(draft);
    expect(applicationDraftMatchesRequest(draft, request)).toBe(true);
    const changed = structuredClone(draft);
    changed.decorativeGradient!.sourceRole = 'background';
    expect(applicationDraftMatchesRequest(changed, request)).toBe(false);
    const author = (application: typeof draft) =>
      createGuidelineAuthoringDraft(review, {
        ...EMPTY_GUIDELINE_AUTHORING,
        activeTask: 'application',
        application,
      });
    const saved = author(draft),
      modified = author(changed);
    expect(saved.schemaVersion).toBe('teul.guideline-authoring.v5');
    expect(saved.briefs.application!.schemaVersion).toBe('teul.guideline-design-brief.v3');
    expect(saved.briefs.application!.input.applicationCompositionHash).not.toBe(
      modified.briefs.application!.input.applicationCompositionHash
    );
    expect(() =>
      readGuidelineAuthoringDraft(
        { ...saved, schemaVersion: 'teul.guideline-authoring.v4' },
        review
      )
    ).toThrow();
    expect(() =>
      readGuidelineDesignBrief(
        { ...saved.briefs.application!, schemaVersion: 'teul.guideline-design-brief.v2' },
        review
      )
    ).toThrow();
    delete changed.decorativeGradient;
    const unfinished = author(changed);
    expect(readGuidelineAuthoringDraft(unfinished, review)).toEqual(unfinished);
    expect(hasGuidelineComposition({ ...EMPTY_GUIDELINE_OUTPUTS, authoring: unfinished })).toBe(
      true
    );
  });

  it('cold-reopens checked output and unfinished controls, preserves standalone gradient, and retains history-only versions', async () => {
    const f = await fixture(),
      selected = await outputs(f.review);
    expect(selected.application.status).toBe('ready');
    const incomplete = applicationDraftFromRequest(selected.application.request);
    delete incomplete.decorativeGradient;
    selected.authoring = createGuidelineAuthoringDraft(f.review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: incomplete,
    });
    selected.designBrief = selected.authoring.briefs.application!;
    const json = await serializeGuidelineWorkspace(
      f.sourceJson,
      selected,
      null,
      undefined,
      null,
      f.selection
    );
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v15');
    await readAnyGuidelineProject(json);
    const opened = await readAnyGuidelineProject(json);
    if (opened.status !== 'opened') throw new Error('Expected opened project');
    expect(opened.value.outputs.authoring).toEqual(selected.authoring);
    expect(opened.value.outputs.application!.request.decorativeGradient).toEqual(
      selected.application.request.decorativeGradient
    );
    expect(opened.value.gradientSelection).toEqual(f.selection);
    const old = JSON.parse(json);
    old.schemaVersion = 'teul.guideline-workspace.v14';
    await expect(readAnyGuidelineProject(reseal(old, 'bundleHash'))).rejects.toThrow(
      /composition/i
    );
    const next = await readAnyGuidelineProject(f.sourceJson);
    if (next.status !== 'opened') throw new Error('Expected source');
    const history = await createGuidelineRefreshLineage(f.sourceJson, selected, next.value);
    expect(history.schemaVersion).toBe('teul.guideline-refresh-lineage.v12');
    const replay = await replayGuidelineRefresh(history, next.value);
    expect(replay.items.find(item => item.kind === 'application')?.status).toBe('restorable');
    expect(
      parseGradientDesignV2(
        replay.outputs.application!.request.decorativeGradient!.selection.design
      ).compiledPaint
    ).toEqual(
      parseGradientDesignV2(selected.application.request.decorativeGradient!.selection.design)
        .compiledPaint
    );
    expect(replay.outputs.authoring!.application!.decorativeGradient).toBeUndefined();
    expect(replay.items.find(i => i.kind === 'brief')?.status).toBe('restorable');
    expect(replay.outputs.designBrief).toEqual(replay.outputs.authoring!.briefs.application);
    const historyJson = await serializeGuidelineWorkspace(
      f.sourceJson,
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      history
    );
    expect(JSON.parse(historyJson).schemaVersion).toBe('teul.guideline-workspace.v15');
    const downgrade = JSON.parse(historyJson);
    downgrade.schemaVersion = 'teul.guideline-workspace.v14';
    await expect(readAnyGuidelineProject(reseal(downgrade, 'bundleHash'))).rejects.toThrow('V15');
  });

  it('remaps source identities without changing embedded anchors, compiled paint, or authoring intent', async () => {
    const f = await fixture(),
      selected = await outputs(f.review);
    const pairs = new Map(
      f.review.model.colors.map((color, index) => [color.id, `renewed-color-${index}`])
    );
    const { modelHash: _hash, ...source } = f.review.model;
    const input = JSON.parse(
      JSON.stringify(source, (_key, value) =>
        typeof value === 'string' ? (pairs.get(value) ?? value) : value
      )
    ) as ColorSystemModelInputV1;
    const model = buildColorSystemModelV1(input);
    const replay = await replayReviewedDesigns(
      {
        previousModel: f.review.model,
        previousReviewHash: f.review.reviewHash,
        previousSelection: null,
        legacyGradientKind: 'native',
        outputs: selected,
        gradient: f.selection,
        colorPairs: pairs,
        modePairs: new Map(f.review.model.modes.map(m => [m.id, m.id])),
        evidencePairs: new Map(f.review.model.evidence.map(e => [e.id, e.id])),
        scaleIds: new Set(f.review.model.scales.map(s => s.id)),
        metadataChanges: [],
      },
      { model, reviewHash: guidelineHash(model) }
    );
    expect(replay.items.find(i => i.kind === 'application')?.status).toBe('restorable');
    const old = selected.application.request.decorativeGradient!.selection;
    const renewed = replay.outputs.application!.request.decorativeGradient!.selection;
    expect(renewed.design.sourceModelHash).toBe(model.modelHash);
    expect(parseGradientDesignV2(renewed.design).compiledPaint).toEqual(
      parseGradientDesignV2(old.design).compiledPaint
    );
    expect(renewed.design.stops.map(stop => stop.sourceColorId)).toEqual(
      old.design.stops.map(stop => pairs.get(stop.sourceColorId!))
    );
    expect(replay.outputs.authoring!.application!.decorativeGradient!.selection).toEqual(renewed);
    expect(replay.outputs.designBrief).toEqual(replay.outputs.authoring!.briefs.application);
    expect(replay.outputs.designBrief!.input.applicationCompositionHash).not.toBe(
      selected.designBrief.input.applicationCompositionHash
    );
    expect(f.selection.design.sourceModelHash).toBe(f.review.model.modelHash);
  });

  it.each(['brand', 'gradient:brand'])(
    'invalidates embedded gradient when %s source policy changes',
    async contextId => {
      const f = await fixture(),
        selected = await outputs(f.review);
      const { modelHash: _hash, ...source } = f.review.model;
      const input: ColorSystemModelInputV1 = {
        ...source,
        rules: [
          ...source.rules,
          {
            id: 'new-composition-ban',
            label: 'Changed test policy',
            kind: 'forbidden-pair',
            force: 'prohibition',
            origin: 'inferred',
            contextIds: [contextId],
            modeIds: [selected.application.request.layout.modeId],
            evidenceRefs: [],
            claimIds: [],
            operands: {
              relation: 'co-present',
              ordered: false,
              left: [{ kind: 'color', id: selected.application.request.assignments[0].colorId }],
              right: [{ kind: 'color', id: selected.application.request.assignments[1].colorId }],
            },
          },
        ],
        adoptions: [],
      };
      const model = buildColorSystemModelV1({
        ...input,
        adoptions: buildColorSystemRuleAdoptionsV1(input, [
          {
            ruleId: 'new-composition-ban',
            status: 'accepted',
            actor: { kind: 'user', ref: 'synthetic-test' },
            authorityRef: 'synthetic-source',
            decisionRef: guidelineHash(contextId),
          },
        ]),
      });
      const replay = await replayReviewedDesigns(
        {
          previousModel: f.review.model,
          previousReviewHash: f.review.reviewHash,
          previousSelection: null,
          legacyGradientKind: 'native',
          outputs: selected,
          gradient: null,
          colorPairs: new Map(f.review.model.colors.map(c => [c.id, c.id])),
          modePairs: new Map(f.review.model.modes.map(m => [m.id, m.id])),
          evidencePairs: new Map(f.review.model.evidence.map(e => [e.id, e.id])),
          scaleIds: new Set(f.review.model.scales.map(s => s.id)),
          metadataChanges: [],
        },
        { model, reviewHash: guidelineHash(model) }
      );
      expect(replay.items.find(i => i.kind === 'application')?.status).toBe('stale');
      expect(replay.outputs.application).toBeNull();
      expect(replay.items.find(i => i.kind === 'application-draft')?.status).toBe('needs-review');
    }
  );

  it('keeps brief-only composition identity explicit and refuses to invent controls during refresh', async () => {
    const f = await fixture();
    const request = requestFor(f.review);
    const authoring = createGuidelineAuthoringDraft(f.review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      application: applicationDraftFromRequest(request),
    });
    const selected = { ...EMPTY_GUIDELINE_OUTPUTS, designBrief: authoring.briefs.application! };
    const json = await serializeGuidelineWorkspace(f.sourceJson, selected);
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v15');
    const next = await readAnyGuidelineProject(f.sourceJson);
    if (next.status !== 'opened') throw new Error('Expected source');
    const lineage = await createGuidelineRefreshLineage(f.sourceJson, selected, next.value);
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v12');
    const replay = await replayGuidelineRefresh(lineage, next.value);
    expect(replay.items.find(i => i.kind === 'brief')?.status).toBe('needs-review');
  });

  it('reopens combined sources and preserves embedded gradient through combined refresh', async () => {
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
    expect(JSON.parse(json).schemaVersion).toBe('teul.source-set-project.v9');
    const opened = await readSourceSetProject(json);
    if (opened.status !== 'opened') throw new Error('Expected open');
    expect(opened.value.outputs.application!.request.decorativeGradient).toEqual(
      selected.application.request.decorativeGradient
    );
    const next = await prepareSourceSetRefresh(workspace, 'native', f.sourceJson);
    expect(next.lineage.schemaVersion).toBe('teul.source-set-refresh.v8');
    const renewed = {
      ...workspace,
      draft: next.proposal.draft,
      review: await applySourceSetReview(next.proposal.draft, decision),
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      refresh: next.lineage,
    };
    const replay = await replaySourceSetRefresh(renewed);
    expect(replay.items.find(i => i.kind === 'application')?.status).toBe('restorable');
    expect(
      parseGradientDesignV2(
        replay.outputs.application!.request.decorativeGradient!.selection.design
      ).compiledPaint
    ).toEqual(
      parseGradientDesignV2(selected.application.request.decorativeGradient!.selection.design)
        .compiledPaint
    );
    const saved = await serializeSourceSetProject(renewed);
    expect(JSON.parse(saved).schemaVersion).toBe('teul.source-set-project.v9');
    const older = JSON.parse(saved);
    older.schemaVersion = 'teul.source-set-project.v8';
    await expect(readSourceSetProject(reseal(older, 'projectHash'))).rejects.toThrow('V9');
  });
});
