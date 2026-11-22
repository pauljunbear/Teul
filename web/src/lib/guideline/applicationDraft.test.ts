import { describe, expect, it } from 'vitest';
import figma from '../../../fixtures/guidelines/figma-project-v1.json';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { previewGuidelineExtension } from './extension';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import { createGuidelineAuthoringDraft, EMPTY_GUIDELINE_AUTHORING } from './authoringDraft';
import { buildGuidelineApplicationLayout } from './applicationGeometry';
import {
  applicationChoice,
  applicationDraftFromRequest,
  applicationDraftMatchesRequest,
  captureGuidelineDraftExtension,
  matchesGuidelineDraftExtension,
  readGuidelineApplicationDraft,
  restoreGuidelineDraftExtension,
  type GuidelineApplicationDraft,
} from './applicationDraft';

async function fixture() {
  const opened = await readAnyGuidelineProject(JSON.stringify(figma));
  if (opened.status !== 'opened' || !opened.value.project.review) throw new Error('fixture');
  const review = opened.value.project.review;
  const modeId = review.model.contexts.find(c => c.id === 'brand')!.modeIds[0];
  const anchor = review.model.colors.find(c => c.valuesByMode[modeId])!;
  const preview = await previewGuidelineExtension(review, {
    kind: 'new-scale',
    context: 'brand',
    modeId,
    familyId: review.model.families.find(f => f.colorIds.includes(anchor.id))?.id ?? null,
    anchorColorId: anchor.id,
    label: 'Saved A',
    scaleId: 'saved:a',
    polarity: 'light',
  });
  expect(preview.status).toBe('proposed');
  const pair = { preview, decision: null };
  const draft: GuidelineApplicationDraft = {
    kind: 'brand',
    modeId,
    layoutName: 'split',
    primaryShare: 57,
    useExtension: true,
    extension: captureGuidelineDraftExtension(pair),
    choices: {
      'brand/primary': preview.generatedBindings[0].colorId,
      'brand/ground': anchor.id,
      'brand/accent': '',
    },
    anchorColorId: anchor.id,
    brandPurpose: 'brand-primary',
    ruleChoices: {},
  };
  return { review, pair, draft };
}
describe('unfinished application controls', () => {
  it('cold reopens an independent saved scale A when the standalone selection is B, without creating an application result', async () => {
    const { review, pair, draft } = await fixture();
    const other = {
      preview: await previewGuidelineExtension(review, {
        ...pair.preview.request,
        scaleId: 'saved:b',
      }),
      decision: null,
    };
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: draft,
    });
    expect(authoring.briefs.application!.lockedValues.map(v => v.colorId)).not.toContain(
      pair.preview.generatedBindings[0].colorId
    );
    const text = await serializeGuidelineWorkspace(JSON.stringify(figma), {
      ...EMPTY_GUIDELINE_OUTPUTS,
      extension: other,
      authoring,
    });
    await readAnyGuidelineProject(text);
    const opened = await readAnyGuidelineProject(text);
    if (opened.status !== 'opened') throw new Error('reopen');
    const saved = opened.value.outputs.authoring!.application!;
    expect(saved).toEqual(draft);
    expect(opened.value.outputs.application).toBeNull();
    expect(matchesGuidelineDraftExtension(saved.extension, other)).toBe(false);
    const restored = await restoreGuidelineDraftExtension(review, saved.extension!);
    expect(restored).toEqual(pair);
    expect(saved.choices['brand/accent']).toBe('');
  });
  it('refuses a different reconstructed paint and cancellation, retaining the raw choices', async () => {
    const { review, draft } = await fixture();
    const wrong = { ...draft.extension!, previewHash: `sha256:${'0'.repeat(64)}` };
    await expect(restoreGuidelineDraftExtension(review, wrong)).rejects.toThrow(
      'proposed shades changed'
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      restoreGuidelineDraftExtension(review, draft.extension!, controller.signal)
    ).rejects.toThrow();
    expect(draft.choices['brand/accent']).toBe('');
  });
  it('retains explicit state overrides independently from inherited choices', async () => {
    const { draft } = await fixture();
    const raw = {
      ...draft,
      kind: 'product' as const,
      choices: {
        'all/ground': 'paper',
        'all/label': 'ink',
        'rest/action': 'rest',
        'hover/action': 'hover',
        'pressed/action': '',
        'focus/label': 'focus-label',
      },
    };
    const saved = readGuidelineApplicationDraft(raw);
    expect(applicationChoice(saved.choices, 'pressed', 'action')).toBe('rest');
    expect(applicationChoice(saved.choices, 'hover', 'action')).toBe('hover');
    expect(applicationChoice(saved.choices, 'focus', 'label')).toBe('focus-label');
    expect(saved.choices['pressed/action']).toBe('');
    const layout = { kind: 'product' as const, modeId: raw.modeId };
    const request = {
      layout,
      extension: null,
      assignments: buildGuidelineApplicationLayout(layout).roles.map(r => ({
        applicationId: r.applicationId,
        useId: r.useId,
        colorId: applicationChoice(raw.choices, r.applicationId, r.useId) || 'ink',
      })),
    };
    const restored = applicationDraftFromRequest(request);
    expect(applicationDraftMatchesRequest(restored, request)).toBe(true);
    expect(
      applicationDraftMatchesRequest(
        { ...restored, choices: { ...restored.choices, 'hover/action': 'different' } },
        request
      )
    ).toBe(false);
  });
  it('accepts unfinished mode and choices as an inert draft and rejects unknown controls and approval statuses', async () => {
    const { review, draft } = await fixture();
    const unfinished = { ...draft, modeId: '', choices: {}, extension: null, useExtension: false };
    expect(
      createGuidelineAuthoringDraft(review, {
        ...EMPTY_GUIDELINE_AUTHORING,
        application: unfinished,
      }).briefs.application
    ).toBeNull();
    expect(() =>
      readGuidelineApplicationDraft({ ...draft, choices: { 'unknown/paint': 'x' } })
    ).toThrow();
    expect(() =>
      readGuidelineApplicationDraft({ ...draft, ruleChoices: { rule: 'approved' } })
    ).toThrow();
    expect(() => readGuidelineApplicationDraft({ ...draft, exportApproved: true })).toThrow();
    expect(() => readGuidelineApplicationDraft({ ...draft, kind: ['brand'] })).toThrow();
    expect(() =>
      readGuidelineApplicationDraft({ ...draft, ruleChoices: { rule: ['accepted'] } })
    ).toThrow();
  });
});
