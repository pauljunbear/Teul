import { buildColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { guidelineHash } from './review';
import { prepareSourceSetEntry, applySourceSetReview, type SourceSetDraft } from './sourceSet';
import { readSourceSetProject, serializeSourceSetProject } from './sourceSetProject';
import { prepareSourceSetRefresh, replaySourceSetRefresh } from './sourceSetRefresh';
import {
  sourceSetActor,
  sourceSetTime,
  sourceSetPdf,
} from '../../../fixtures/guidelines/source-set-fixture';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import { describe, expect, it } from 'vitest';
import { productComparisonFixture } from '../../../fixtures/guidelines/product-comparison-fixture';
import {
  assessGuidelineApplication,
  buildGuidelineSourceApplication,
  exportGuidelineApplication,
  guidelineApplicationSourceChoices,
  readGuidelineApplication,
} from './application';
import { applicationDraftFromRequest } from './applicationDraft';
import { createGuidelineAuthoringDraft, EMPTY_GUIDELINE_AUTHORING } from './authoringDraft';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { createGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh } from './refreshReplay';
import { sourceSetPdfRevision } from '../../../fixtures/guidelines/source-set-fixture';
import { guidelineContextPaintChoices, type GuidelineContextPaints } from './contextPaints';

describe('checked product original-color comparison', () => {
  it('keeps all five state assignments distinct and replays exact source-only output', async () => {
    const { review, proposed, choices, sourceRequest, id } = await productComparisonFixture();
    expect(proposed.status).toBe('ready');
    const before = JSON.stringify(review);
    const initial = guidelineApplicationSourceChoices(review, proposed);
    expect(Object.keys(initial)).toHaveLength(21);
    for (const state of ['rest', 'hover', 'pressed', 'focus'])
      expect(initial[`${state}/action`]).toBe('');
    expect(initial['disabled/action']).toBe(id('step-2'));
    const changed = buildGuidelineSourceApplication(review, proposed, {
      ...choices,
      'hover/action': id('ink'),
    });
    expect(changed.assignments.filter(a => a.applicationId !== 'hover')).toEqual(
      sourceRequest.assignments.filter(a => a.applicationId !== 'hover')
    );
    expect(sourceRequest.extension).toBeNull();
    const selected = await assessGuidelineApplication(review, sourceRequest);
    expect(selected.status).toBe('ready');
    expect(selected.layout.boards).toEqual(proposed.layout.boards);
    expect(JSON.stringify(review)).toBe(before);
    const exported = await exportGuidelineApplication(selected);
    expect(exported.svgs.map(board => board.applicationId)).toEqual([
      'rest',
      'hover',
      'pressed',
      'focus',
      'disabled',
    ]);
    expect(
      await exportGuidelineApplication(
        await readGuidelineApplication(exported.applicationJson, review)
      )
    ).toEqual(exported);
  });

  it('refuses incomplete, generated, unqualified, forged and stale comparisons', async () => {
    const { review, proposed, choices } = await productComparisonFixture();
    const missing = { ...choices };
    delete missing['hover/action'];
    const generated = proposed.request.assignments.find(
      a => a.applicationId === 'hover' && a.useId === 'action'
    )!.colorId;
    for (const bad of [
      missing,
      { ...choices, action: choices['rest/action'] },
      { ...choices, 'hover/action': generated },
      { ...choices, 'focus/focus-ring': 'missing' },
    ])
      expect(() => buildGuidelineSourceApplication(review, proposed, bad)).toThrow();
    expect(() => guidelineApplicationSourceChoices(review, structuredClone(proposed))).toThrow(
      'Recheck'
    );
    expect(() =>
      guidelineApplicationSourceChoices(
        { ...review, reviewHash: `sha256:${'0'.repeat(64)}` },
        proposed
      )
    ).toThrow('Recheck');
  });

  it('excludes source paints unavailable or fully transparent in the selected mode', async () => {
    const { review: prior, sourceRequest } = await productComparisonFixture();
    const { modelHash: _hash, ...base } = prior.model;
    const source = base.colors[0];
    const value = source.valuesByMode[sourceRequest.layout.modeId];
    const model = buildColorSystemModelV1({
      ...base,
      modes: [...base.modes, { id: 'Other', label: 'Other' }],
      colors: [
        ...base.colors,
        { ...source, id: 'other-mode', label: 'Other mode only', valuesByMode: { Other: value } },
        {
          ...source,
          id: 'transparent',
          label: 'Invisible',
          valuesByMode: { [sourceRequest.layout.modeId]: { ...value, alpha: 0 } },
        },
      ],
    });
    const review = { model, reviewHash: guidelineHash(model) };
    const selected = await assessGuidelineApplication(review, sourceRequest);
    expect(selected.status).toBe('ready');
    const choices = guidelineApplicationSourceChoices(review, selected);
    for (const id of ['other-mode', 'transparent'])
      expect(() =>
        buildGuidelineSourceApplication(review, selected, { ...choices, 'hover/action': id })
      ).toThrow('original source paint');
  });

  it('retains selected exports through a failed active state and cancellation, preserving the disabled exemption', async () => {
    const { review, proposed, choices, id } = await productComparisonFixture();
    const exported = await exportGuidelineApplication(proposed);
    const failed = await assessGuidelineApplication(
      review,
      buildGuidelineSourceApplication(review, proposed, { ...choices, 'hover/action': id('paper') })
    );
    expect(failed.recipe).toBeNull();
    const disabled = await assessGuidelineApplication(
      review,
      buildGuidelineSourceApplication(review, proposed, {
        ...choices,
        'disabled/action': id('paper'),
      })
    );
    expect(disabled.status).toBe('ready');
    const activeLink = await assessGuidelineApplication(
      review,
      buildGuidelineSourceApplication(review, proposed, {
        ...choices,
        'disabled/partner': id('paper'),
      })
    );
    expect(activeLink.recipe).toBeNull();
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

  it('keeps custom context exact and forbids using it as an action or focus paint', async () => {
    const { review, proposed, sourceRequest, id } = await productComparisonFixture();
    const contextPaints: GuidelineContextPaints = {
      version: 'teul.context-paints.v1',
      id: 'product-context',
      actor: { kind: 'user', ref: 'test:product' },
      paints: [
        {
          id: 'canvas',
          label: 'Custom canvas',
          modeId: sourceRequest.layout.modeId,
          role: 'background',
          value: review.model.colors.find(c => c.id === id('paper'))!.valuesByMode[
            sourceRequest.layout.modeId
          ],
        },
      ],
    };
    const canvas = guidelineContextPaintChoices(contextPaints)[0].id;
    const custom = await assessGuidelineApplication(review, {
      ...proposed.request,
      contextPaints,
      assignments: proposed.request.assignments.map(a =>
        a.useId === 'ground' ? { ...a, colorId: canvas } : a
      ),
    });
    expect(custom.status).toBe('ready');
    const initial = guidelineApplicationSourceChoices(review, custom);
    expect(initial['hover/ground']).toBe(canvas);
    const complete = { ...initial };
    for (const state of ['rest', 'hover', 'pressed', 'focus'])
      complete[`${state}/action`] = id('ink');
    expect(buildGuidelineSourceApplication(review, custom, complete).contextPaints).toEqual(
      contextPaints
    );
    for (const role of ['rest/action', 'focus/focus-ring', 'rest/label'])
      expect(() =>
        buildGuidelineSourceApplication(review, custom, { ...complete, [role]: canvas })
      ).toThrow('original source paint');
  });

  it('replays the five source states through combined projects, preserving unrelated refresh and rejecting changed authority', async () => {
    const f = await productComparisonFixture();
    const entries = await Promise.all([
      prepareSourceSetEntry(JSON.stringify(f.project), 'A'),
      prepareSourceSetEntry(
        JSON.stringify(sourceSetPdf('Additional public fixture', '#FF2200')),
        'B'
      ),
    ]);
    const draft: SourceSetDraft = {
      entries: entries.map(e => e.entry),
      subjects: entries.flatMap(e => e.subjects),
      scope: 'product',
      resolutions: [],
    };
    const review = await applySourceSetReview(draft, {
      actor: sourceSetActor,
      reviewedAt: sourceSetTime,
    });
    const modeId = review.model.contexts.find(c => c.id === 'product')!.modeIds[0];
    const request = {
      ...f.sourceRequest,
      layout: { kind: 'product' as const, modeId },
      assignments: f.sourceRequest.assignments.map(use => {
        const hex = f.review.model.colors.find(c => c.id === use.colorId)!.valuesByMode[
          f.sourceRequest.layout.modeId
        ].hex;
        return {
          ...use,
          colorId: review.model.colors.find(c => c.valuesByMode[modeId]?.hex === hex)!.id,
        };
      }),
    };
    const checked = await assessGuidelineApplication(review, request);
    const application = await assessGuidelineApplication(
      review,
      buildGuidelineSourceApplication(
        review,
        checked,
        guidelineApplicationSourceChoices(review, checked)
      )
    );
    expect(application.status).toBe('ready');
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: applicationDraftFromRequest(application.request),
    });
    const workspace = {
      draft,
      review,
      outputs: { ...EMPTY_GUIDELINE_OUTPUTS, application, authoring },
      gradientSelection: null,
    };
    const opened = await readSourceSetProject(await serializeSourceSetProject(workspace));
    if (opened.status !== 'opened') throw new Error('Expected combined project');
    expect(await exportGuidelineApplication(opened.value.outputs.application!)).toEqual(
      await exportGuidelineApplication(application)
    );
    for (const change of [{ note: true }, { authority: true }]) {
      const next = await prepareSourceSetRefresh(
        workspace,
        'A',
        JSON.stringify(sourceSetPdfRevision(f.project, change))
      );
      const refreshed = await replaySourceSetRefresh({
        ...workspace,
        draft: next.proposal.draft,
        review: await applySourceSetReview(next.proposal.draft, {
          actor: sourceSetActor,
          reviewedAt: sourceSetTime,
        }),
        outputs: EMPTY_GUIDELINE_OUTPUTS,
        refresh: next.lineage,
      });
      if ('note' in change) expect(refreshed.outputs.application?.status).toBe('ready');
      else expect(refreshed.outputs.application).toBeNull();
    }
  }, 20000);

  it('preserves selected output and unfinished controls through single-source offline replay and unrelated refresh', async () => {
    const { project, review, sourceRequest, id } = await productComparisonFixture();
    const application = await assessGuidelineApplication(review, sourceRequest);
    const draft = applicationDraftFromRequest(sourceRequest);
    draft.choices['hover/action'] = '';
    const authoring = createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: draft,
    });
    for (const selected of [application, null]) {
      const opened = await readAnyGuidelineProject(
        await serializeGuidelineWorkspace(JSON.stringify(project), {
          extension: null,
          application: selected,
          authoring,
        })
      );
      if (opened.status !== 'opened') throw new Error('Expected current workspace');
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
    expect((await exportGuidelineApplication(refreshed.outputs.application!)).svgs).toEqual(
      (await exportGuidelineApplication(application)).svgs
    );
    expect(draft.choices['rest/action']).toBe(id('step-9'));
  }, 20000);
});
