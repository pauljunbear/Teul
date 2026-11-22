import {
  applicationDraftFromRequest,
  captureGuidelineDraftExtension,
  restoreGuidelineDraftExtension,
} from './applicationDraft';
import type { GuidelineInteriorExtensionRequest } from './extension';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import figma from '../../../fixtures/guidelines/figma-project-v1.json';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { createFigmaNativeInventory } from './figmaInventory';
import { suggestFigmaReview, compileFigmaReview } from './figmaReview';
import { buildFigmaProject } from './figmaProject';
import { createGuidelineModeGradient } from './modeGradient';
import { createGuidelineAuthoredGradient } from './authoredGradient';
import { previewGuidelineExtension, reviewGuidelineExtension } from './extension';
import { assessGuidelineApplication, exportGuidelineApplication } from './application';
import { createGuidelineExtensionDecision } from './extensionRuleReview';
import { buildGuidelineApplicationLayout } from './applicationGeometry';
import { createGuidelineRefreshLineage, readGuidelineRefreshLineage } from './refreshLineage';
import {
  replayGuidelineRefresh,
  mergeRestoredGuidelineOutputs,
  replayReviewedDesigns,
} from './refreshReplay';
import { createGuidelineAuthoringDraft, EMPTY_GUIDELINE_AUTHORING } from './authoringDraft';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import { proposeFigmaRefresh } from './nativeRefreshSources';
import { guidelineHash } from './review';
import {
  generateGuidelineSupportingDirections,
  refineGuidelineSupportingDirection,
} from './supportingDirections';

const actor = { kind: 'user' as const, ref: 'test:refresh' },
  time = '2026-09-26T04:00:00.000Z';
type Data = Record<string, any>;
const seal = (raw: Data) => {
  const { contentHash: _, ...content } = raw;
  return {
    ...content,
    contentHash: `sha256:${createHash('sha256').update(canonicalIntakeJson(content)).digest('hex')}`,
  };
};
async function fixture(withFamilyRule = false, subjectRole?: string) {
  const raw = structuredClone(figma.capture) as Data;
  if (withFamilyRule)
    raw.roots[0].document.children[2].characters = 'Use Primary together with Light.';
  raw.roots[0].document.children.push({
    id: '1:8',
    type: 'RECTANGLE',
    name: 'Accent',
    fills: [{ type: 'SOLID', color: { r: 0.8, g: 0.1, b: 0.3 } }],
  });
  const inventory = await createFigmaNativeInventory(seal(raw)),
    draft = suggestFigmaReview(inventory);
  const colors = inventory.declarations;
  draft.modeIds = inventory.modes.map(m => m.id);
  draft.colors = colors.map(c => ({
    declarationId: c.id,
    label: c.label.split(' / ')[0],
    family: c.locator.includes('1:8/') ? 'Accent' : 'Primary',
  }));
  draft.profileDecision = {
    captureHash: inventory.packet.contentHash,
    interpretation: 'srgb',
    actor,
    decidedAt: time,
  };
  draft.scopeDecision = { accepted: true, reason: 'Synthetic fixture scope.' };
  draft.statements = draft.statements.map(s => ({
    ...s,
    meaning: 'no-gradients',
    scope: 'product',
    reason: 'Preserve source restriction.',
  }));
  const first = colors.find(c => c.locator.includes('1:3/'))!.id,
    last = colors.find(c => c.locator.includes('1:4/'))!.id,
    mode = draft.modeIds[0];
  if (withFamilyRule)
    draft.statements = draft.statements.map(s => ({
      ...s,
      meaning: 'relationship',
      scope: 'brand',
      definition: {
        kind: 'required-partner',
        force: 'requirement',
        operands: {
          subject: [{ kind: 'family', id: 'Primary' }],
          partner: [{ kind: 'color', id: first }],
        },
      },
    }));
  if (subjectRole)
    draft.statements = draft.statements.map(s => ({
      ...s,
      definition: {
        kind: 'role-binding',
        force: 'requirement',
        operands: {
          role: subjectRole,
          presence: 'if-present',
          members: [{ kind: 'family', id: 'Primary' }],
        },
      },
    }));
  draft.scales = [
    {
      id: 'scale:primary',
      label: 'Primary',
      family: 'Primary',
      evidenceRefs: [first, last],
      slots: [
        { id: '100', position: 0 },
        { id: '900', position: 2 },
      ],
      modes: [
        {
          modeId: mode,
          anchors: [
            { slotId: '100', declarationId: first },
            { slotId: '900', declarationId: last },
          ],
        },
      ],
    },
  ];
  const review = compileFigmaReview(inventory, draft, actor, time),
    selection = withFamilyRule
      ? null
      : createGuidelineModeGradient(review, 'brand', mode, first, last, 120);
  const project = await buildFigmaProject({ capture: inventory.packet, draft, review, selection });
  const extension = {
    preview: await previewGuidelineExtension(review, {
      context: 'brand',
      modeId: mode,
      scaleId: 'scale:primary',
      additions: [{ slotId: '500', position: 1 }],
      lightnessOrder: 'none',
    }),
    decision: null,
  };
  const layout = { kind: 'product' as const, modeId: mode };
  const application = await assessGuidelineApplication(review, {
    layout,
    extension: null,
    assignments: buildGuidelineApplicationLayout(layout).roles.map(role => ({
      applicationId: role.applicationId,
      useId: role.useId,
      colorId: ['ground', 'label', 'focus-outer'].includes(role.useId) ? first : last,
    })),
  });
  return { raw, inventory, draft, project, outputs: { extension, application } };
}
async function next(f: Awaited<ReturnType<typeof fixture>>, edit: (raw: Data) => void) {
  const raw = structuredClone(f.raw);
  edit(raw);
  const inventory = await createFigmaNativeInventory(seal(raw));
  const proposal = proposeFigmaRefresh(f.inventory, f.draft, inventory);
  const draft = structuredClone(proposal.draft);
  draft.scopeDecision = { ...draft.scopeDecision, accepted: true };
  draft.profileDecision = {
    captureHash: inventory.packet.contentHash,
    interpretation: 'srgb',
    actor,
    decidedAt: time,
  };
  draft.statements = draft.statements.map(s =>
    s.meaning === 'needs-interpretation'
      ? { ...s, meaning: 'not-a-rule', reason: 'Reviewed new fixture note.' }
      : s
  );
  const review = compileFigmaReview(inventory, draft, actor, time);
  const project = await buildFigmaProject({
    capture: inventory.packet,
    draft,
    review,
    selection: null,
  });
  return { kind: 'figma' as const, project, inventory };
}
describe('reviewed source-refresh design replay', () => {
  it('reopens and refreshes a chart selection independently from its unfinished chart controls', async () => {
    const f = await fixture(),
      review = f.project.review!;
    const modeId = review.model.modes[0].id;
    const light = review.model.colors.find(c => c.label === 'Light')!.id;
    const dark = review.model.colors.find(c => c.label === 'Dark')!.id;
    const layout = {
      kind: 'chart' as const,
      sourceContextId: 'product' as const,
      modeId,
      meaning: 'categorical' as const,
      count: 2,
      direction: null,
    };
    const application = await assessGuidelineApplication(review, {
      layout,
      extension: null,
      assignments: buildGuidelineApplicationLayout(layout).roles.map(r => ({
        applicationId: r.applicationId,
        useId: r.useId,
        colorId: r.useId === 'ground' ? light : dark,
      })),
    });
    expect(application.recipe).not.toBeNull();
    const raw = applicationDraftFromRequest(application.request);
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: {
        ...raw,
        chart: { ...raw.chart!, count: 3 },
        choices: { ...raw.choices, 'chart/mark-3': '' },
      },
    });
    const outputs = { extension: null, application, authoring };
    const json = await serializeGuidelineWorkspace(JSON.stringify(f.project), outputs);
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v9');
    await readAnyGuidelineProject(json);
    const cold = await readAnyGuidelineProject(json);
    if (cold.status !== 'opened') throw new Error('cold reopen');
    expect(cold.value.outputs.authoring?.application).toEqual(authoring.application);
    const before = await exportGuidelineApplication(cold.value.outputs.application!);
    const target = await next(f, raw => {
      raw.capturedAt = '2026-09-27T01:00:00.000Z';
    });
    const lineage = await createGuidelineRefreshLineage(JSON.stringify(f.project), outputs, target);
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v8');
    const reread = await readGuidelineRefreshLineage(lineage, target);
    const replay = await replayGuidelineRefresh(reread, target);
    for (const kind of ['application', 'application-draft']) {
      const item = replay.items.find(i => i.kind === kind)!;
      expect(item.status, item.reason).toBe('restorable');
    }
    expect(replay.outputs.application!.request.layout).toEqual(layout);
    expect(replay.outputs.authoring!.application!.chart).toEqual(authoring.application!.chart);
    expect(replay.outputs.authoring!.application!.choices['chart/mark-3']).toBe('');
    expect((await exportGuidelineApplication(replay.outputs.application!)).svgs).toEqual(
      before.svgs
    );
    // A source context is a retained decision; chart use never invents one on recapture.
    expect(replay.outputs.authoring!.briefs.application!.input.sourceContextId).toBe('product');
  });

  const drafts = (f: Awaited<ReturnType<typeof fixture>>) => {
    const review = f.project.review!,
      modeId = review.model.modes[0].id;
    const light = review.model.colors.find(c => c.label === 'Light')!.id;
    const accent = review.model.colors.find(c => c.label === 'Accent')!.id;
    return createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'gradient',
      extension: {
        operation: 'interior',
        anchorColorId: light,
        familyId: '',
        scaleLabel: 'Keep my name',
        polarity: 'light',
        scaleId: 'scale:primary',
        derivedScaleId: '',
        context: 'brand',
        modeId,
        order: 'none',
        additions: [{ slotId: 'Unfinished', position: '' }],
      },
      gradient: {
        controls: {
          scope: 'brand',
          modeId,
          angle: 73,
          route: { space: 'oklab' },
          stops: [
            { colorId: light, position: 0, locked: true },
            { colorId: accent, position: 1, locked: false },
          ],
        },
        policy: null,
        catalog: null,
      },
    });
  };
  it('refreshes unfinished application paints with their own extension and clears prior rule decisions', async () => {
    const f = await fixture(true),
      review = f.project.review!;
    const proposal = f.outputs.extension.preview;
    const decision = createGuidelineExtensionDecision(
      review.reviewHash,
      proposal,
      Object.fromEntries(proposal.pendingRuleIds.map(id => [id, 'accepted' as const]))
    );
    const preview = await reviewGuidelineExtension(review, proposal.request, decision);
    const raw = applicationDraftFromRequest(f.outputs.application.request);
    const application = {
      ...raw,
      kind: 'brand' as const,
      useExtension: true,
      extension: captureGuidelineDraftExtension({ preview, decision }),
      anchorColorId: review.model.colors.find(c => c.label === 'Light')!.id,
      choices: {
        'brand/ground': preview.generatedBindings[0].colorId,
        'brand/primary': '',
        'brand/accent': '',
      },
      ruleChoices: { [proposal.pendingRuleIds[0]]: 'accepted' as const },
    };
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application,
    });
    const target = await next(f, raw => {
      raw.capturedAt = '2026-09-27T01:00:00.000Z';
    });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      { ...EMPTY_GUIDELINE_OUTPUTS, authoring },
      target
    );
    const replay = await replayGuidelineRefresh(lineage, target);
    const item = replay.items.find(i => i.kind === 'application-draft')!;
    expect(item.status, item.reason).toBe('restorable');
    expect(replay.outputs.application).toBeNull();
    const restored = replay.outputs.authoring!.application!;
    expect(restored.ruleChoices).toEqual({});
    expect(restored.extension!.decision).toBeNull();
    expect(restored.choices['brand/primary']).toBe('');
    const pair = await restoreGuidelineDraftExtension(target.project.review!, restored.extension!);
    expect(pair.preview.pendingRuleIds.length).toBeGreaterThan(0);
    const before = preview.workingModel!.colors.find(
      c => c.id === application.choices['brand/ground']
    )!.valuesByMode[application.modeId];
    const after = pair.preview.workingModel!.colors.find(
      c => c.id === restored.choices['brand/ground']
    )!.valuesByMode[restored.modeId];
    expect(after).toEqual(before);
    const merged = mergeRestoredGuidelineOutputs(
      target.project.review!,
      EMPTY_GUIDELINE_OUTPUTS,
      replay.outputs
    );
    expect(merged.authoring!.application).toEqual(restored);
  });
  it('honors queued cancellation before synchronous draft validation can publish a result', async () => {
    const f = await fixture(),
      review = f.project.review!,
      authoring = drafts(f);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 0);
    try {
      await expect(
        replayReviewedDesigns(
          {
            previousModel: review.model,
            previousReviewHash: review.reviewHash,
            previousSelection: null,
            legacyGradientKind: 'native',
            outputs: { ...EMPTY_GUIDELINE_OUTPUTS, authoring },
            gradient: null,
            colorPairs: new Map(review.model.colors.map(c => [c.id, c.id])),
            modePairs: new Map(review.model.modes.map(m => [m.id, m.id])),
            evidencePairs: new Map(review.model.evidence.map(e => [e.id, e.id])),
            scaleIds: new Set(review.model.scales.map(s => s.id)),
            metadataChanges: [],
          },
          review,
          controller.signal
        )
      ).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      clearTimeout(timer);
    }
  });
  it('roundtrips draft-only refresh history and restores raw unfinished controls under the new review', async () => {
    const f = await fixture(),
      authoring = drafts(f);
    const target = await next(f, raw => {
      raw.capturedAt = '2026-09-27T01:00:00.000Z';
    });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      { ...EMPTY_GUIDELINE_OUTPUTS, authoring },
      target
    );
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v8');
    const json = await serializeGuidelineWorkspace(
      JSON.stringify(target.project),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      lineage
    );
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v9');
    await readAnyGuidelineProject(json);
    const cold = await readAnyGuidelineProject(json);
    expect(cold.status).toBe('opened');
    if (cold.status !== 'opened' || !cold.value.refreshLineage) throw new Error('Fixture');
    const replay = await replayGuidelineRefresh(cold.value.refreshLineage, target);
    const scale = replay.items.find(i => i.kind === 'scale-draft')!;
    expect(scale.status, scale.reason).toBe('restorable');
    const gradient = replay.items.find(i => i.kind === 'gradient-draft')!;
    expect(gradient.status, gradient.reason).toBe('restorable');
    expect(replay.outputs.authoring!.extension).toEqual(authoring.extension);
    expect(replay.outputs.authoring!.gradient).toEqual(authoring.gradient);
    expect(replay.outputs.authoring!.reviewHash).toBe(target.project.review!.reviewHash);
    expect(replay.outputs.authoring!.draftHash).not.toBe(authoring.draftHash);
    expect(replay.outputs.extension).toBeNull();
    expect(replay.outputs.application).toBeNull();
  });
  it('keeps unchanged scale controls independently of a changed gradient anchor and preserves newer unrelated drafts', async () => {
    const f = await fixture(),
      saved = drafts(f);
    const review = f.project.review!,
      accent = review.model.colors.find(c => c.label === 'Accent')!.id,
      dark = review.model.colors.find(c => c.label === 'Dark')!.id;
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'extension',
      extension: {
        ...saved.extension!,
        operation: 'new-scale',
        anchorColorId: accent,
        scaleId: '',
        derivedScaleId: 'accent-scale',
      },
      gradient: {
        ...saved.gradient!,
        controls: {
          ...saved.gradient!.controls,
          stops: [saved.gradient!.controls.stops[0], { colorId: dark, position: 1, locked: true }],
        },
      },
    });
    const target = await next(f, raw => {
      raw.roots[0].document.children[1].fills[0].color.r = 0.3;
    });
    // The user reviews the changed paint and retains the same complete source scope.
    const draft = structuredClone(target.project.draft);
    draft.colors = f.draft.colors.map(old => ({
      ...old,
      declarationId: target.inventory.declarations.find(c => c.label.split(' / ')[0] === old.label)!
        .id,
    }));
    target.project = await buildFigmaProject({
      capture: target.inventory.packet,
      draft,
      review: compileFigmaReview(target.inventory, draft, actor, time),
      selection: null,
    });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      { ...EMPTY_GUIDELINE_OUTPUTS, authoring },
      target
    );
    const replay = await replayGuidelineRefresh(lineage, target);
    const scale = replay.items.find(i => i.kind === 'scale-draft')!;
    expect(scale.status, scale.reason).toBe('restorable');
    const gradient = replay.items.find(i => i.kind === 'gradient-draft')!;
    expect(gradient.status).toBe('needs-review');
    expect(gradient.previousChoices?.find(c => c.label === 'Angle')?.value).toBe('73°');
    expect(replay.outputs.authoring!.gradient).toBeNull();
    const current = createGuidelineAuthoringDraft(target.project.review!, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'gradient',
      gradient: {
        ...authoring.gradient!,
        controls: { ...authoring.gradient!.controls, angle: 15 },
      },
    });
    const merged = mergeRestoredGuidelineOutputs(
      target.project.review!,
      { ...EMPTY_GUIDELINE_OUTPUTS, authoring: current },
      replay.outputs
    );
    expect(merged.authoring!.gradient!.controls.angle).toBe(15);
    expect(merged.authoring!.extension!.additions[0].position).toBe('');
  });
  it('retains incomplete unbound choices in refresh history without inventing source references', async () => {
    const f = await fixture(),
      input = drafts(f);
    const authoring = createGuidelineAuthoringDraft(f.project.review!, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: input.activeTask,
      gradient: null,
      extension: { ...input.extension!, modeId: '' },
    });
    const target = await next(f, raw => {
      raw.capturedAt = '2026-09-27T01:00:00.000Z';
    });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      { ...EMPTY_GUIDELINE_OUTPUTS, authoring },
      target
    );
    const replay = await replayGuidelineRefresh(lineage, target);
    expect(replay.items.find(i => i.kind === 'scale-draft')?.status).toBe('needs-review');
    expect(replay.outputs.authoring).toBeUndefined();
    expect(JSON.stringify(lineage)).toContain('Keep my name');
  });
  it('renews an unchanged governing native rule and preserves deliberately blank supporting roles', async () => {
    const f = await fixture(true),
      saved = drafts(f),
      review = f.project.review!;
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'supporting',
      extension: saved.extension,
      supporting: {
        layout: {
          kind: 'brand',
          modeId: review.model.modes[0].id,
          layout: 'split',
          primaryShare: 60,
        },
        provider: 'wada',
        scheme: null,
        relationship: 'nearby',
        anchorColorIds: [saved.extension!.anchorColorId],
        excludedCandidateIds: [],
        sourcePaints: { ground: '', primary: saved.extension!.anchorColorId, accent: '' },
      },
    });
    const target = await next(f, raw => {
      raw.capturedAt = '2026-09-27T01:00:00.000Z';
    });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      { ...EMPTY_GUIDELINE_OUTPUTS, authoring },
      target
    );
    const replay = await replayGuidelineRefresh(lineage, target);
    for (const kind of ['scale-draft', 'supporting-draft']) {
      const item = replay.items.find(i => i.kind === kind)!;
      expect(item.status, item.reason).toBe('restorable');
    }
    expect(replay.outputs.authoring!.supporting!.sourcePaints.ground).toBe('');
  });
  it('restores a composition when pending extension rules apply only to an absent role, including an unrelated rule change', async () => {
    const f = await fixture(true, 'logo'),
      review = f.project.review!;
    const preview = f.outputs.extension.preview;
    expect(preview.pendingRuleIds.length).toBeGreaterThan(0);
    const layout = {
      kind: 'brand' as const,
      modeId: review.model.modes[0].id,
      layout: 'split' as const,
      primaryShare: 60,
    };
    const application = await assessGuidelineApplication(review, {
      layout,
      extension: {
        preview,
        decision: null,
        anchorColorId: review.model.colors.find(c => c.label === 'Light')!.id,
        purpose: 'brand-primary',
      },
      assignments: buildGuidelineApplicationLayout(layout).roles.map(r => ({
        applicationId: r.applicationId,
        useId: r.useId,
        colorId: preview.generatedBindings[0].colorId,
      })),
    });
    expect(application.status).toBe('ready');
    const target = await next(f, raw => {
      raw.capturedAt = '2026-09-27T01:00:00.000Z';
    });
    for (const subjectRole of ['logo', 'other-absent-role', undefined]) {
      const draft = structuredClone(target.project.draft);
      const definition = draft.statements[0].definition!;
      if (definition.kind !== 'role-binding') throw new Error('fixture');
      draft.statements[0].definition = {
        ...definition,
        operands: {
          ...definition.operands,
          role: subjectRole ?? 'logo',
          presence: subjectRole ? 'if-present' : 'required',
        },
      };
      const changed = {
        ...target,
        project: await buildFigmaProject({
          capture: target.inventory.packet,
          draft,
          review: compileFigmaReview(target.inventory, draft, actor, time),
          selection: null,
        }),
      };
      const lineage = await createGuidelineRefreshLineage(
        JSON.stringify(f.project),
        { ...EMPTY_GUIDELINE_OUTPUTS, application },
        changed
      );
      const replay = await replayGuidelineRefresh(lineage, changed);
      const item = replay.items.find(i => i.kind === 'application')!;
      expect(item.status, item.reason).toBe(subjectRole ? 'restorable' : 'stale');
      if (subjectRole) {
        expect(replay.outputs.application!.status).toBe('ready');
        expect(
          replay.outputs.application!.request.extension!.preview.pendingRuleIds.length
        ).toBeGreaterThan(0);
        expect((await exportGuidelineApplication(replay.outputs.application!)).svgs).toEqual(
          (await exportGuidelineApplication(application)).svgs
        );
      } else expect(replay.outputs.application).toBeNull();
    }
  });
  it('retains supporting paint after recapture changes generated identities and refuses changed source anchors', async () => {
    const f = await fixture();
    const review = f.project.review!,
      modeId = review.model.modes[0].id;
    const first = review.model.colors.find(c => c.label === 'Light')!,
      second = review.model.colors.find(c => c.label === 'Dark')!;
    const result = await generateGuidelineSupportingDirections(review, {
      layout: { kind: 'brand', modeId, layout: 'split', primaryShare: 60 },
      provider: 'wada',
      scheme: null,
      relationship: 'companion',
      anchorColorIds: [second.id],
      excludedCandidateIds: [],
      sourcePaints: { ground: first.id, primary: second.id, accent: first.id },
    });
    expect(result.status).toBe('ready');
    const supporting = { result, directionId: result.directions[0].id };
    const refined = refineGuidelineSupportingDirection(
      review,
      result,
      supporting.directionId,
      result.request,
      [],
      'hierarchy',
      'Keep this review note with its original context.'
    );
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'supporting',
      supporting: refined.request,
      supportingFeedback: refined.feedback,
    });
    const outputs = { ...EMPTY_GUIDELINE_OUTPUTS, supporting, authoring };
    const target = await next(f, raw => {
      raw.capturedAt = '2026-09-27T01:00:00.000Z';
    });
    const lineage = await createGuidelineRefreshLineage(JSON.stringify(f.project), outputs, target);
    const replay = await replayGuidelineRefresh(lineage, target);
    expect(replay.items.find(item => item.kind === 'supporting')?.status).toBe('restorable');
    expect(replay.outputs.supporting?.result.sourceModelHash).toBe(
      target.project.review!.model.modelHash
    );
    expect(replay.outputs.supporting?.directionId).not.toBe(supporting.directionId);
    expect(replay.outputs.authoring?.supportingFeedback).toEqual(refined.feedback);
    expect(replay.outputs.authoring?.supporting?.excludedCandidateIds).toEqual(
      refined.request.excludedCandidateIds
    );
    const currentNotes = refined.feedback.map(item => ({
      ...item,
      note: 'Updated after refresh.',
    }));
    const current = createGuidelineAuthoringDraft(target.project.review!, {
      ...EMPTY_GUIDELINE_AUTHORING,
      supportingFeedback: currentNotes,
    });
    const merged = mergeRestoredGuidelineOutputs(
      target.project.review!,
      { ...EMPTY_GUIDELINE_OUTPUTS, authoring: current },
      replay.outputs
    );
    expect(merged.authoring?.supportingFeedback).toEqual(currentNotes);
    const fullHistory = Array.from({ length: 24 }, (_, index) => {
      const directionId = `historical:${index}`;
      const original = refined.feedback[0];
      return {
        ...original,
        directionId,
        id: guidelineHash({ requestHash: original.requestHash, directionId }),
      };
    });
    const incoming = {
      ...replay.outputs,
      authoring: createGuidelineAuthoringDraft(target.project.review!, {
        ...EMPTY_GUIDELINE_AUTHORING,
        supportingFeedback: fullHistory,
      }),
    };
    for (const notes of [currentNotes, []]) {
      const current = createGuidelineAuthoringDraft(target.project.review!, {
        ...EMPTY_GUIDELINE_AUTHORING,
        supportingFeedback: notes,
      });
      const restored = mergeRestoredGuidelineOutputs(
        target.project.review!,
        { ...EMPTY_GUIDELINE_OUTPUTS, authoring: current },
        incoming
      );
      expect(restored.authoring!.supportingFeedback).toEqual(notes);
      expect(restored.supporting).toBe(replay.outputs.supporting);
    }
    const withoutNotes = createGuidelineAuthoringDraft(
      target.project.review!,
      EMPTY_GUIDELINE_AUTHORING
    );
    expect(
      mergeRestoredGuidelineOutputs(
        target.project.review!,
        { ...EMPTY_GUIDELINE_OUTPUTS, authoring: withoutNotes },
        incoming
      ).authoring!.supportingFeedback
    ).toEqual(fullHistory);
    const changed = await next(f, raw => {
      raw.roots[0].document.children[0].fills[0].color.r = 0.24;
    });
    const changedLineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      outputs,
      changed
    );
    const rejected = await replayGuidelineRefresh(changedLineage, changed);
    expect(rejected.items.find(item => item.kind === 'supporting')?.status).toBe('stale');
    expect(rejected.outputs.supporting).toBeUndefined();
    expect(rejected.outputs.authoring?.supportingFeedback).toEqual(refined.feedback);
    expect(rejected.outputs.authoring?.supporting).toBeNull();
  }, 15000);
  it('requires renewed extension decisions even when a reviewed family rule and paint are unchanged', async () => {
    const f = await fixture(true);
    const pair = f.outputs.extension;
    expect(pair.preview.pendingRuleIds.length).toBeGreaterThan(0);
    if (pair.preview.construction?.status !== 'proposed') throw new Error('No proposal');
    const decision = {
      reviewedProposalHash: pair.preview.construction.proposal.proposalHash,
      decisions: pair.preview.pendingRuleIds.map(ruleId => ({
        ruleId,
        status: 'accepted' as const,
        actor,
        authorityRef: f.project.review!.reviewHash,
        decisionRef: 'test:accepted',
      })),
    };
    const preview = await reviewGuidelineExtension(
      f.project.review!,
      pair.preview.request,
      decision
    );
    expect(preview.pendingRuleIds).toEqual([]);
    const target = await next(f, raw => {
      raw.capturedAt = '2026-09-27T01:00:00.000Z';
    });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      {
        ...f.outputs,
        extension: { preview, decision },
      },
      target
    );
    const replay = await replayGuidelineRefresh(lineage, target);
    expect(replay.items.find(i => i.kind === 'extension')!.status).toBe('needs-review');
    expect(replay.outputs.extension!.decision).toBeNull();
    expect(replay.outputs.extension!.preview.pendingRuleIds.length).toBeGreaterThan(0);
  });
  it('replays a distinct embedded extension and remaps its generated paint without replacing it with the standalone selection', async () => {
    const f = await fixture(),
      review = f.project.review!;
    const preview = await previewGuidelineExtension(review, {
      ...f.outputs.extension.preview.request,
      additions: [{ slotId: '350', position: 0.5 }],
    });
    const layout = {
      kind: 'brand' as const,
      modeId: review.model.modes[0].id,
      layout: 'split' as const,
      primaryShare: 60,
    };
    const application = await assessGuidelineApplication(review, {
      layout,
      extension: {
        preview,
        decision: null,
        anchorColorId: review.model.colors.find(c => c.label === 'Light')!.id,
        purpose: 'brand-primary',
      },
      assignments: buildGuidelineApplicationLayout(layout).roles.map(role => ({
        applicationId: role.applicationId,
        useId: role.useId,
        colorId:
          role.useId === 'ground'
            ? preview.generatedBindings[0].colorId
            : review.model.colors.find(c => c.label === 'Dark')!.id,
      })),
    });
    const target = await next(f, raw => {
      raw.roots[0].document.children[3].fills[0].color.r = 0.5;
    });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      { ...f.outputs, application },
      target
    );
    const replay = await replayGuidelineRefresh(lineage, target);
    const item = replay.items.find(i => i.kind === 'application')!;
    expect(item.status, item.reason).toBe('restorable');
    expect(
      (
        replay.outputs.application!.request.extension!.preview
          .request as GuidelineInteriorExtensionRequest
      ).additions[0].slotId
    ).toBe('350');
    expect(
      (replay.outputs.extension!.preview.request as GuidelineInteriorExtensionRequest).additions[0]
        .slotId
    ).toBe('500');
  });
  it.each([false, true])(
    'restores an embedded extension without its old approval, retaining pending work and failures (missing partner: %s)',
    async missingPartner => {
      const f = await fixture(true),
        review = f.project.review!;
      const request = {
        ...f.outputs.extension.preview.request,
        additions: [{ slotId: '350', position: 0.5 }],
      };
      const proposal = await previewGuidelineExtension(review, request);
      if (proposal.construction?.status !== 'proposed') throw new Error('No proposal');
      const decision = {
        reviewedProposalHash: proposal.construction.proposal.proposalHash,
        decisions: proposal.pendingRuleIds.map(ruleId => ({
          ruleId,
          status: 'accepted' as const,
          actor,
          authorityRef: review.reviewHash,
          decisionRef: 'test:embedded',
        })),
      };
      const preview = await reviewGuidelineExtension(review, request, decision);
      const layout = {
        kind: 'brand' as const,
        modeId: review.model.modes[0].id,
        layout: 'split' as const,
        primaryShare: 60,
      };
      const light = review.model.colors.find(c => c.label === 'Light')!.id;
      const application = await assessGuidelineApplication(review, {
        layout,
        extension: { preview, decision, anchorColorId: light, purpose: 'brand-primary' },
        assignments: buildGuidelineApplicationLayout(layout).roles.map(role => ({
          applicationId: role.applicationId,
          useId: role.useId,
          colorId:
            role.useId === 'ground' || missingPartner
              ? preview.generatedBindings[0].colorId
              : light,
        })),
      });
      expect(!!application.recipe).toBe(!missingPartner);
      const target = await next(f, raw => {
        raw.capturedAt = '2026-09-27T01:00:00.000Z';
      });
      const lineage = await createGuidelineRefreshLineage(
        JSON.stringify(f.project),
        { ...f.outputs, application },
        target
      );
      const replay = await replayGuidelineRefresh(lineage, target);
      const item = replay.items.find(i => i.kind === 'application')!;
      expect(item.status, item.reason).toBe('needs-review');
      const restored = replay.outputs.application!;
      expect(restored.status).toBe('blocked');
      expect(restored.recipe).toBeNull();
      expect(
        restored.execution?.diagnostics.some(d => d.code === 'SOURCE_RULE_REVIEW_REQUIRED')
      ).toBe(true);
      expect(restored.request.extension!.decision).toBeNull();
      expect(
        (restored.request.extension!.preview.request as GuidelineInteriorExtensionRequest)
          .additions[0].slotId
      ).toBe('350');
      expect(
        (replay.outputs.extension!.preview.request as GuidelineInteriorExtensionRequest)
          .additions[0].slotId
      ).toBe('500');
      const json = await serializeGuidelineWorkspace(
        JSON.stringify(target.project),
        replay.outputs,
        null,
        undefined,
        lineage
      );
      const reopened = await readAnyGuidelineProject(json);
      if (reopened.status !== 'opened') throw new Error('Project did not reopen');
      expect(reopened.value.outputs.application!.request).toEqual(restored.request);
      expect(reopened.value.outputs.application!.recipe).toBeNull();
      await expect(exportGuidelineApplication(restored)).rejects.toThrow();
      const forged = JSON.parse(json);
      forged.outputs.application.status = 'ready';
      forged.outputs.application.exportable = true;
      await expect(readAnyGuidelineProject(JSON.stringify(forged))).rejects.toThrow();
      await expect(
        reviewGuidelineExtension(target.project.review!, request, decision)
      ).rejects.toThrow();
      const pending = restored.request.extension!;
      expect(() =>
        createGuidelineExtensionDecision(target.project.review!.reviewHash, pending.preview, {})
      ).toThrow('unapproved');
      const decisions = Object.fromEntries(
        pending.preview.pendingRuleIds.map(id => [id, 'accepted' as const])
      );
      expect(() =>
        createGuidelineExtensionDecision(target.project.review!.reviewHash, pending.preview, {
          ...decisions,
          [pending.preview.pendingRuleIds[0]]: 'rejected',
        })
      ).toThrow('unapproved');
      const renewedDecision = createGuidelineExtensionDecision(
        target.project.review!.reviewHash,
        pending.preview,
        decisions
      );
      expect(renewedDecision.reviewedProposalHash).not.toBe(decision.reviewedProposalHash);
      const renewedPreview = await reviewGuidelineExtension(
        target.project.review!,
        pending.preview.request,
        renewedDecision
      );
      const renewed = await assessGuidelineApplication(target.project.review!, {
        ...restored.request,
        extension: { ...pending, preview: renewedPreview, decision: renewedDecision },
      });
      expect(!!renewed.recipe).toBe(!missingPartner);
      expect(renewed.layout.boards).toEqual(application.layout.boards);
      const paints = (value: typeof application) =>
        value.applications.flatMap(app =>
          app.uses.map(
            use => value.model!.colors.find(c => c.id === use.colorId)!.valuesByMode[app.modeId]
          )
        );
      expect(paints(renewed)).toEqual(paints(application));
      const changed = await next(f, raw => {
        raw.roots[0].document.children[0].fills[0].color.r = 0.3;
      });
      const changedLineage = await createGuidelineRefreshLineage(
        JSON.stringify(f.project),
        { ...f.outputs, application },
        changed
      );
      const stale = await replayGuidelineRefresh(changedLineage, changed);
      expect(stale.items.find(i => i.kind === 'application')!.status).toBe('stale');
      expect(stale.outputs.application).toBeNull();
    }
  );
  it('retains exact gradient, extension and application paint across an unrelated source edit', async () => {
    const f = await fixture(),
      target = await next(f, raw => {
        raw.roots[0].document.children[3].fills[0].color.r = 0.5;
      });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      f.outputs,
      target
    );
    const result = await replayGuidelineRefresh(lineage, target);
    expect(result.items.map(i => i.status)).toEqual(['restorable', 'restorable', 'restorable']);
    expect(result.selection!.design).toHaveProperty(
      'compiledPaint',
      f.project.selection!.design.compiledPaint
    );
    expect(result.selection!.design.sourceModelHash).toBe(target.project.review!.model.modelHash);
    expect(result.outputs.application!.recipe).not.toBeNull();
    expect(result.outputs.extension!.preview.sourceModelHash).not.toBe(
      f.outputs.extension.preview.sourceModelHash
    );
    expect(f.project.capture.contentHash).not.toBe(target.project.capture.contentHash);
  });
  it('refuses a scale whose declared evidence was changed during the renewed review', async () => {
    const f = await fixture(true);
    const target = await next(f, raw => {
      raw.capturedAt = '2026-09-27T01:00:00.000Z';
    });
    const draft = structuredClone(target.project.draft);
    draft.scales[0].evidenceRefs = draft.scales[0].evidenceRefs.slice(0, 1);
    const review = compileFigmaReview(target.inventory, draft, actor, time);
    const changed = {
      ...target,
      project: await buildFigmaProject({
        capture: target.inventory.packet,
        draft,
        review,
        selection: null,
      }),
    };
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      f.outputs,
      changed
    );
    const replay = await replayGuidelineRefresh(lineage, changed);
    const result = replay.items.find(item => item.kind === 'extension')!;
    expect(result.status).toBe('stale');
    expect(result.reason).toContain('evidence changed');
    expect(replay.outputs.extension).toBeNull();
  });
  it('marks a changed used anchor stale without inventing equal-paint identity', async () => {
    const f = await fixture(),
      target = await next(f, raw => {
        raw.roots[0].document.children[0].fills[0].color.r = 0.4;
      });
    const lineage = await createGuidelineRefreshLineage(
        JSON.stringify(f.project),
        f.outputs,
        target
      ),
      result = await replayGuidelineRefresh(lineage, target);
    expect(result.items.every(i => i.status === 'stale')).toBe(true);
    expect(result.selection).toBeNull();
    expect(result.outputs).toEqual(EMPTY_GUIDELINE_OUTPUTS);
  });
  it('detects a designer changing an otherwise unchanged color role after comparison', async () => {
    const f = await fixture(),
      target = await next(f, raw => {
        raw.capturedAt = '2026-09-27T01:00:00.000Z';
      });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      f.outputs,
      target
    );
    const draft = structuredClone(target.project.draft);
    draft.colors[0].label = 'A different role';
    target.project = await buildFigmaProject({
      capture: target.project.capture,
      draft,
      review: compileFigmaReview(target.inventory, draft, actor, time),
      selection: null,
    });
    expect(
      (await replayGuidelineRefresh(lineage, target)).items.every(i => i.status === 'stale')
    ).toBe(true);
  });
  it('applies a newly reviewed gradient restriction while retaining an unrelated extension', async () => {
    const f = await fixture(),
      target = await next(f, raw => {
        raw.capturedAt = '2026-09-27T01:00:00.000Z';
      });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      f.outputs,
      target
    );
    const draft = structuredClone(target.project.draft);
    draft.statements.forEach(statement => {
      statement.scope = 'brand';
    });
    target.project = await buildFigmaProject({
      capture: target.project.capture,
      draft,
      review: compileFigmaReview(target.inventory, draft, actor, time),
      selection: null,
    });
    const replay = await replayGuidelineRefresh(lineage, target);
    expect(replay.items.find(i => i.kind === 'gradient')!.status).toBe('stale');
    expect(replay.items.find(i => i.kind === 'extension')!.status).toBe('restorable');
    expect(replay.selection).toBeNull();
  });
  it('persists one flat validated lineage in V2 while keeping V1 bytes unchanged', async () => {
    const f = await fixture(),
      target = await next(f, raw => {
        raw.capturedAt = '2026-09-27T01:00:00.000Z';
      });
    const source = JSON.stringify(target.project),
      lineage = await createGuidelineRefreshLineage(JSON.stringify(f.project), f.outputs, target);
    const legacy = await serializeGuidelineWorkspace(source, EMPTY_GUIDELINE_OUTPUTS);
    expect(legacy).toBe(source);
    const saved = await serializeGuidelineWorkspace(
      source,
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      lineage
    );
    expect(JSON.parse(saved).schemaVersion).toBe('teul.guideline-workspace.v2');
    const opened = await readAnyGuidelineProject(saved);
    if (opened.status !== 'opened') throw new Error('Not reopened');
    expect(opened.value.refreshLineage).toEqual(lineage);
    expect(
      (await replayGuidelineRefresh(opened.value.refreshLineage!, opened.value)).items[0].status
    ).toBe('restorable');
    const tampered = JSON.parse(saved);
    tampered.refreshLineage.nextCaptureHash = 'sha256:' + '0'.repeat(64);
    const { lineageHash: _, ...content } = tampered.refreshLineage;
    tampered.refreshLineage.lineageHash = guidelineHash(content);
    const { bundleHash: __, ...bundle } = tampered;
    tampered.bundleHash = guidelineHash(bundle);
    await expect(readAnyGuidelineProject(JSON.stringify(tampered))).rejects.toThrow(/bind/);
    const nested = { ...lineage, previousSourceProjectJson: saved };
    const { lineageHash: ___, ...flat } = nested;
    nested.lineageHash = guidelineHash(flat);
    await expect(readGuidelineRefreshLineage(nested, target)).rejects.toThrow();
  });
  it('does not substitute mutated saved output or publish after cancellation', async () => {
    const f = await fixture(),
      target = await next(f, raw => {
        raw.capturedAt = '2026-09-27T01:00:00.000Z';
      });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(f.project),
      f.outputs,
      target
    );
    const forged = structuredClone(lineage) as unknown as Data;
    forged.previousOutputs.extension.preview.status = 'blocked';
    const { lineageHash: _, ...content } = forged;
    forged.lineageHash = guidelineHash(content);
    await expect(readGuidelineRefreshLineage(forged, target)).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(replayGuidelineRefresh(lineage, target, controller.signal)).rejects.toThrow();
  });
});

it('invalidates a retained gradient when only its declared text color changes', async () => {
  const f = await fixture();
  const review = f.project.review!,
    modeId = review.model.modes[0].id;
  const accent = review.model.colors.find(c => c.label === 'Accent')!;
  const colors = review.model.colors.filter(c => c.id !== accent.id);
  const selected = createGuidelineAuthoredGradient(
    review,
    {
      scope: 'brand',
      modeId,
      angle: 120,
      route: { space: 'oklab' },
      stops: [0, 1].map(position => ({ colorId: colors[position].id, position, locked: true })),
    },
    {
      origin: 'designer-authored',
      use: {
        kind: 'text',
        foregroundColorId: accent.id,
        minimumRatio: 4.5,
        footprint: { start: 0, end: 1 },
      },
      limits: [],
    }
  );
  const source = await buildFigmaProject({
    capture: f.project.capture,
    draft: f.draft,
    review,
    selection: null,
  });
  for (const changed of [false, true]) {
    const fresh = await next(f, raw => {
      if (changed) raw.roots[0].document.children.at(-1).fills[0].color.r = 0.7;
    });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(source),
      EMPTY_GUIDELINE_OUTPUTS,
      fresh,
      undefined,
      selected
    );
    const replay = await replayGuidelineRefresh(lineage, fresh);
    expect(replay.items.find(i => i.kind === 'gradient')?.status).toBe(
      changed ? 'stale' : 'restorable'
    );
  }
});

it('retains derived-scale paint on recapture, renews family decisions, and blocks anchor changes', async () => {
  const f = await fixture(true);
  const review = f.project.review!;
  const anchor = review.model.colors.find(c => c.label === 'Dark')!;
  const request = {
    kind: 'new-scale' as const,
    context: 'brand' as const,
    modeId: review.model.modes[0].id,
    familyId: review.model.families.find(family => family.colorIds.includes(anchor.id))!.id,
    anchorColorId: anchor.id,
    scaleId: 'derived:ink',
    label: 'Ink scale',
    polarity: 'light' as const,
  };
  const initial = await previewGuidelineExtension(review, request);
  expect(initial.status).toBe('proposed');
  const decision = createGuidelineExtensionDecision(
    review.reviewHash,
    initial,
    Object.fromEntries(initial.pendingRuleIds.map(id => [id, 'accepted']))
  );
  const preview = await reviewGuidelineExtension(review, request, decision);
  const outputs = { ...EMPTY_GUIDELINE_OUTPUTS, extension: { preview, decision } };
  const target = await next(f, raw => {
    raw.capturedAt = '2026-09-27T01:00:00.000Z';
  });
  const lineage = await createGuidelineRefreshLineage(JSON.stringify(f.project), outputs, target);
  expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v7');
  const replay = await replayGuidelineRefresh(lineage, target);
  expect(replay.items.find(i => i.kind === 'extension')?.status).toBe('needs-review');
  expect(replay.outputs.extension!.decision).toBeNull();
  const saved = await serializeGuidelineWorkspace(
    JSON.stringify(target.project),
    replay.outputs,
    null,
    undefined,
    lineage
  );
  expect(JSON.parse(saved).schemaVersion).toBe('teul.guideline-workspace.v8');
  await readAnyGuidelineProject(saved);
  expect((await readAnyGuidelineProject(saved)).status).toBe('opened');
  const { lineageHash: _, ...old } = lineage;
  old.schemaVersion = 'teul.guideline-refresh-lineage.v6' as typeof old.schemaVersion;
  await expect(
    readGuidelineRefreshLineage({ ...old, lineageHash: guidelineHash(old) }, target)
  ).rejects.toThrow();
  const changed = await next(f, raw => {
    raw.roots[0].document.children[1].fills[0].color.r = 0.3;
  });
  const changedLineage = await createGuidelineRefreshLineage(
    JSON.stringify(f.project),
    outputs,
    changed
  );
  const stale = await replayGuidelineRefresh(changedLineage, changed);
  expect(stale.items.find(i => i.kind === 'extension')?.status).toBe('stale');
  expect(stale.outputs.extension).toBeNull();
});
