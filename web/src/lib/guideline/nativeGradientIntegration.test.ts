import { sourceSetPdf } from '../../../fixtures/guidelines/source-set-fixture';
import { createFigmaNativeInventory } from './figmaInventory';
import { compileFigmaReview } from './figmaReview';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { hashCanonical } from './intakeClient';
import { prepareSourceSetEntry, applySourceSetReview, type SourceSetDraft } from './sourceSet';
import { sourceSetNativeGradientSources } from './nativeGradientWorkspace';
import { serializeSourceSetProject, readSourceSetProject } from './sourceSetProject';
import { prepareSourceSetRefresh, replaySourceSetRefresh } from './sourceSetRefresh';
import { createGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh } from './refreshReplay';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import { createGuidelineAuthoringDraft, EMPTY_GUIDELINE_AUTHORING } from './authoringDraft';
import { applicationDraftFromRequest } from './applicationDraft';
import { describe, expect, it } from 'vitest';
import { nativeGradientEditFixture } from '../../../fixtures/guidelines/native-gradient-edit-fixture';
import { createGuidelineNativeGradient } from './nativeGradientSelection';
import {
  guidelineNativeGradientContext,
  readGuidelineNativeGradientContext,
} from './nativeGradientWorkspace';
import {
  executeGradientWorkerRequest,
  gradientWorkerRequestHash,
  type GradientWorkerRequest,
} from './gradientWorkerOperations';
import {
  assessGuidelineApplication,
  exportGuidelineApplication,
  readGuidelineApplication,
  type GuidelineApplicationRequest,
} from './application';
import { buildFigmaProject } from './figmaProject';
import { serializeGuidelineWorkspace, readAnyGuidelineProject } from './projectCodec';
import { guidelineHash } from './review';
import { parseColorSystemRecipeV1 } from '../../../../src/lib/colorSystemRecipeV1';
import {
  buildColorSystemDesignContentV1,
  buildColorSystemDesignLockV1,
  recheckColorSystemDesignLockV1,
} from '../../../../src/lib/colorSystemDesignContentV1';

async function fixture(change?: Parameters<typeof nativeGradientEditFixture>[0]) {
  const value = await nativeGradientEditFixture(change);
  const { review, sources, controls, inventory, draft } = value;
  const selection = createGuidelineNativeGradient(review, sources[0], controls);
  const nativeContext = guidelineNativeGradientContext(selection.source, review, sources);
  const white = review.model.colors.find(
    c => c.valuesByMode[controls.modeId]?.hex === '#FFFFFF'
  )!.id;
  const black = review.model.colors.find(
    c => c.valuesByMode[controls.modeId]?.hex === '#000000'
  )!.id;
  const request: GuidelineApplicationRequest = {
    layout: {
      kind: 'composition',
      sourceContextId: 'brand',
      modeId: controls.modeId,
      width: 400,
      height: 320,
      heading: 'Captured paint',
      body: 'Retain exact colors and geometry.',
    },
    decorativeGradient: { selection },
    assignments: ['ground', 'text-1', 'text-2'].map((useId, i) => ({
      applicationId: 'composition',
      useId,
      colorId: i ? black : white,
    })),
    extension: null,
  };
  return {
    ...value,
    selection,
    nativeContext,
    request,
    sourceJson: JSON.stringify(
      await buildFigmaProject({ capture: inventory.packet, draft, review, selection: null })
    ),
  };
}

describe('native paint through source, worker, composition and workspace', () => {
  it('reconstructs source context and verifies exact edits without generated-route certification', async () => {
    const { review, sources, controls, selection, nativeContext } = await fixture();
    const cold = await readGuidelineNativeGradientContext(structuredClone(nativeContext), review);
    expect(createGuidelineNativeGradient(review, cold[0], controls)).toEqual(selection);
    const request: GradientWorkerRequest = {
      operation: 'native-edit',
      review,
      source: selection.source,
      controls,
      nativeContext,
    };
    const result = await executeGradientWorkerRequest(structuredClone(request));
    if (result.kind !== 'gradient') throw new Error('Expected native paint');
    expect(result.value.selection).toEqual(selection);
    expect(result.value.portable).toMatchObject({
      exportable: true,
      assessment: null,
      fidelity: null,
      textContext: null,
      checks: [],
    });
    expect(result.value.portable.svg).toContain('stop-opacity="0.375"');
    expect(result.value.portable.css).toContain('data:image/svg+xml,');
    expect(result.value.portable.css).not.toContain('linear-gradient(');
    await expect(
      executeGradientWorkerRequest({ operation: 'verify', review, selection })
    ).rejects.toThrow('source context');
    expect(() =>
      guidelineNativeGradientContext(
        selection.source,
        review,
        sources.map(source => ({ ...source }))
      )
    ).toThrow();
    const changed = structuredClone(request);
    changed.controls.rotationDegrees = 45;
    expect(gradientWorkerRequestHash(changed)).not.toBe(gradientWorkerRequestHash(request));
    const controller = new AbortController();
    controller.abort();
    await expect(
      readGuidelineNativeGradientContext(nativeContext, review, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('rejects changed source decisions even with valid paint', async () => {
    const { review, selection, nativeContext } = await fixture();
    const changed = structuredClone(nativeContext);
    changed.decision.actor.ref = 'different-reviewer';
    await expect(
      executeGradientWorkerRequest({
        operation: 'verify',
        review,
        selection,
        nativeContext: changed,
      })
    ).rejects.toThrow('current review');
  });
  it('cold reopens native composition and rejects old envelopes and missing evidence', async () => {
    const { review, sources, selection, request, sourceJson } = await fixture();
    await expect(assessGuidelineApplication(review, request)).rejects.toThrow();
    const result = await assessGuidelineApplication(review, request, undefined, sources);
    expect(result.status).toBe('ready');
    expect(result.decorativeGradient?.fidelity).toBeNull();
    const output = await exportGuidelineApplication(result);
    const portable = JSON.parse(output.applicationJson);
    expect(portable.schemaVersion).toBe('teul.guideline-application.v9');
    expect(portable.recipe.schemaVersion).toBe('teul.color-system-recipe.v7');
    expect(output.svgs[0].svg).toContain('stop-opacity="0.375"');
    expect(output.svgs[0].svg).toContain('gradientTransform="matrix(');
    expect(parseColorSystemRecipeV1(portable.recipe)).toEqual(result.recipe);
    expect(() =>
      parseColorSystemRecipeV1({ ...portable.recipe, schemaVersion: 'teul.color-system-recipe.v6' })
    ).toThrow('V7');
    await expect(readGuidelineApplication(output.applicationJson, review)).rejects.toThrow();
    expect(
      await exportGuidelineApplication(
        await readGuidelineApplication(output.applicationJson, review, undefined, sources)
      )
    ).toEqual(output);
    await expect(
      readGuidelineApplication(
        JSON.stringify({ ...portable, schemaVersion: 'teul.guideline-application.v7' }),
        review,
        undefined,
        sources
      )
    ).rejects.toThrow('V9');
    const json = await serializeGuidelineWorkspace(
      sourceJson,
      { extension: null, application: result },
      null,
      undefined,
      null,
      selection
    );
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v17');
    await readAnyGuidelineProject(json);
    const reopened = await readAnyGuidelineProject(json);
    if (reopened.status !== 'opened') throw new Error('Expected open workspace');
    expect(reopened.value.gradientSelection).toEqual(selection);
    expect(await exportGuidelineApplication(reopened.value.outputs.application!)).toEqual(output);
    const { bundleHash: _hash, ...content } = JSON.parse(json);
    const old = { ...content, schemaVersion: 'teul.guideline-workspace.v16' };
    await expect(
      readAnyGuidelineProject(JSON.stringify({ ...old, bundleHash: guidelineHash(old) }))
    ).rejects.toThrow('newer project');
  });
});

describe('native source refresh and bounded retained metadata', () => {
  it('restores an unchanged recapture and refuses changed paint even when all palette solids match', async () => {
    const f = await fixture();
    const application = await assessGuidelineApplication(f.review, f.request, undefined, f.sources);
    const outputs = { extension: null, application };
    const { contentHash: _hash, ...content } = f.inventory.packet;
    const recaptured = { ...content, capturedAt: '2026-09-28T01:00:00.000Z' };
    const inventory = await createFigmaNativeInventory({
      ...recaptured,
      contentHash: await hashCanonical(canonicalIntakeJson(recaptured)),
    });
    const draft = {
      ...f.draft,
      captureHash: inventory.packet.contentHash,
      profileDecision: { ...f.draft.profileDecision!, captureHash: inventory.packet.contentHash },
    };
    const review = compileFigmaReview(
      inventory,
      draft,
      f.review.decision.actor,
      f.review.decision.reviewedAt
    );
    const project = await buildFigmaProject({
      capture: inventory.packet,
      draft,
      review,
      selection: null,
    });
    const target = await readAnyGuidelineProject(JSON.stringify(project));
    if (target.status !== 'opened') throw new Error('Expected source');
    const lineage = await createGuidelineRefreshLineage(
      f.sourceJson,
      outputs,
      target.value,
      undefined,
      f.selection
    );
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v14');
    const replay = await replayGuidelineRefresh(lineage, target.value);
    expect(replay.items.find(i => i.kind === 'gradient')?.status).toBe('restorable');
    expect(replay.items.find(i => i.kind === 'application')?.status).toBe('restorable');
    expect(replay.selection?.design).toHaveProperty('paint', f.selection.design.paint);
    const history = await serializeGuidelineWorkspace(
      JSON.stringify(project),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      lineage
    );
    expect(JSON.parse(history).schemaVersion).toBe('teul.guideline-workspace.v17');
    const changed = await fixture(doc => {
      doc.children[0].fills[0].gradientStops[0].color.r = 0.2;
    });
    expect(changed.review.model.colors.map(c => c.valuesByMode)).toEqual(
      f.review.model.colors.map(c => c.valuesByMode)
    );
    const changedTarget = await readAnyGuidelineProject(changed.sourceJson);
    if (changedTarget.status !== 'opened') throw new Error('Expected source');
    const changedLineage = await createGuidelineRefreshLineage(
      f.sourceJson,
      outputs,
      changedTarget.value,
      undefined,
      f.selection
    );
    const refused = await replayGuidelineRefresh(changedLineage, changedTarget.value);
    expect(refused.items.find(i => i.kind === 'gradient')?.status).toBe('stale');
    expect(refused.items.find(i => i.kind === 'application')?.status).toBe('stale');
    expect(refused.selection).toBeNull();
  });
  it('cold reopens combined source edits and their retained history', async () => {
    const f = await fixture();
    const entries = await Promise.all([
      prepareSourceSetEntry(f.sourceJson, 'native'),
      prepareSourceSetEntry(JSON.stringify(sourceSetPdf()), 'pdf'),
    ]);
    const draft: SourceSetDraft = {
      entries: entries.map(e => e.entry),
      subjects: entries.flatMap(e => e.subjects),
      scope: 'brand',
      resolutions: [],
    };
    const decision = { actor: f.review.decision.actor, reviewedAt: f.review.decision.reviewedAt };
    const review = await applySourceSetReview(draft, decision);
    const sources = await sourceSetNativeGradientSources(draft, undefined, review);
    const selection = createGuidelineNativeGradient(review, sources[0], {
      ...f.controls,
      modeId: 'Working',
    });
    const workspace = {
      draft,
      review,
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      gradientSelection: selection,
    };
    const json = await serializeSourceSetProject(workspace);
    expect(JSON.parse(json).schemaVersion).toBe('teul.source-set-project.v11');
    const opened = await readSourceSetProject(json);
    if (opened.status !== 'opened') throw new Error('Expected combined source');
    expect(opened.value.gradientSelection).toEqual(selection);
    const prepared = await prepareSourceSetRefresh(workspace, 'native', f.sourceJson);
    expect(prepared.lineage.schemaVersion).toBe('teul.source-set-refresh.v10');
    const next = {
      ...workspace,
      draft: prepared.proposal.draft,
      review: await applySourceSetReview(prepared.proposal.draft, decision),
      gradientSelection: null,
      refresh: prepared.lineage,
    };
    const replay = await replaySourceSetRefresh(next);
    expect(replay.items.find(i => i.kind === 'gradient')?.status).toBe('restorable');
    expect(replay.selection).toEqual(selection);
    expect(JSON.parse(await serializeSourceSetProject(next)).schemaVersion).toBe(
      'teul.source-set-project.v11'
    );
  });
  it('carries accepted near-node-limit native metadata through composition, draft, export and workspace cold read', async () => {
    const f = await fixture(doc => {
      doc.children[0].fills[0].boundVariables = Array.from({ length: 1000 }, () =>
        Array(50).fill(0)
      );
    });
    let phase = 'assess';
    try {
      const application = await assessGuidelineApplication(
        f.review,
        f.request,
        undefined,
        f.sources
      );
      expect(application.status).toBe('ready');
      const retained = application.recipe!.selection!;
      const design = buildColorSystemDesignContentV1(retained.model, retained.applications);
      const lock = buildColorSystemDesignLockV1(design, {
        kind: 'family',
        id: retained.model.families[0].id,
      });
      expect(recheckColorSystemDesignLockV1(JSON.parse(JSON.stringify(lock)), design).status).toBe(
        'intact'
      );
      phase = 'authoring';
      const authoring = createGuidelineAuthoringDraft(f.review, {
        ...EMPTY_GUIDELINE_AUTHORING,
        application: applicationDraftFromRequest(f.request),
      });
      expect(authoring.schemaVersion).toBe('teul.guideline-authoring.v7');
      phase = 'export';
      const output = await exportGuidelineApplication(application);
      phase = 'serialize workspace';
      const json = await serializeGuidelineWorkspace(
        f.sourceJson,
        { extension: null, application, authoring },
        null,
        undefined,
        null,
        f.selection
      );
      phase = 'reopen workspace';
      await readAnyGuidelineProject(json);
      const reopened = await readAnyGuidelineProject(json);
      if (reopened.status !== 'opened') throw new Error('Expected native workspace');
      expect(await exportGuidelineApplication(reopened.value.outputs.application!)).toEqual(output);
    } catch (error) {
      throw new Error(`Native capacity failure during ${phase}`, { cause: error });
    }
  }, 20000);
});
