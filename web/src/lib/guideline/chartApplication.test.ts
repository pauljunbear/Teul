import { describe, expect, it } from 'vitest';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../../../../src/lib/colorSystemModelV1';
import {
  buildColorSystemSrgbValueV1,
  colorSystemSrgbToCssV1,
} from '../../../../src/lib/colorSystemSrgbValueV1';
import { colorSystemGeometryShapeToSvgPathV1 } from '../../../../src/lib/colorSystemApplicationGeometryV1';
import { guidelineHash } from './review';
import {
  buildGuidelineApplicationLayout,
  assessGuidelineApplicationGeometry,
} from './applicationGeometry';
import {
  assessGuidelineApplication,
  buildGuidelineSourceApplication,
  guidelineApplicationSourceChoices,
  exportGuidelineApplication,
  readGuidelineApplication,
  type GuidelineApplicationRequest,
} from './application';
import {
  applicationDraftFromRequest,
  applicationDraftMatchesRequest,
  applicationLayoutFromDraft,
  applicationExtensionPurpose,
  readGuidelineApplicationDraft,
} from './applicationDraft';
import { createGuidelineAuthoringDraft, EMPTY_GUIDELINE_AUTHORING } from './authoringDraft';
import { readGuidelineSelectedOutputs, storedGuidelineOutputs } from './selectedOutputs';
import { previewGuidelineExtension } from './extension';
import { guidelineChartRows, type GuidelineChartLayoutInput } from './chartGeometry';
import {
  generateGuidelineSupportingDirections,
  type GuidelineSupportingRequest,
} from './supportingDirections';

function fixture(restricted = false, inkAlpha = 1) {
  const link = { evidenceRefs: [], claimIds: [] };
  const input: ColorSystemModelInputV1 = {
    schemaVersion: 'teul.color-system-model.v1',
    sources: [
      {
        id: 'source',
        label: 'Synthetic chart fixture',
        sourceHash: guidelineHash('chart'),
        version: '1',
        locator: null,
        freshnessMode: 'imported-snapshot',
        status: 'draft',
      },
    ],
    evidence: [],
    claims: [],
    coverage: [
      {
        sourceId: 'source',
        status: 'complete',
        evidenceRefs: [],
        unresolvedClaimIds: [],
        note: 'Invented test colors only.',
      },
    ],
    modes: [{ id: 'Source', label: 'Source' }],
    contexts: ['brand', 'product'].map(id => ({ ...link, id, label: id, modeIds: ['Source'] })),
    colors: [
      ['paper', 1],
      ['ink', 0.123456789],
      ['middle', 0.3],
      ['light', 0.5],
    ].map(([id, v]) => ({
      ...link,
      id: String(id),
      label: String(id),
      sourceId: 'source',
      valuesByMode: {
        Source: buildColorSystemSrgbValueV1(
          { r: Number(v), g: Number(v), b: Number(v) },
          id === 'ink' ? inkAlpha : 1
        ),
      },
    })),
    families: [],
    scales: [],
    brandConstraintsByContext: [],
    conflicts: [],
    rules: restricted
      ? [
          {
            ...link,
            contextIds: ['product'],
            modeIds: ['Source'],
            origin: 'inferred',
            id: 'mark-rule',
            label: 'Only paper for first mark',
            kind: 'role-binding',
            force: 'requirement',
            operands: {
              role: 'mark-1',
              presence: 'if-present',
              members: [{ kind: 'color', id: 'paper' }],
            },
          },
        ]
      : [],
    adoptions: [],
  };
  const model = buildColorSystemModelV1({
    ...input,
    adoptions: buildColorSystemRuleAdoptionsV1(
      input,
      input.rules.map(rule => ({
        ruleId: rule.id,
        status: 'accepted',
        actor: { kind: 'user', ref: 'test:chart' },
        authorityRef: 'fixture',
        decisionRef: 'chart-test',
      }))
    ),
  });
  return { model, reviewHash: guidelineHash('chart-review') };
}
const chart = (
  meaning: 'categorical' | 'sequential' = 'sequential',
  count = 3
): GuidelineChartLayoutInput => ({
  kind: 'chart',
  modeId: 'Source',
  sourceContextId: 'product',
  meaning,
  count,
  direction: meaning === 'sequential' ? 'dark-to-light' : null,
});
function request(layout = chart()): GuidelineApplicationRequest {
  return {
    layout,
    extension: null,
    assignments: buildGuidelineApplicationLayout(layout).roles.map(r => ({
      applicationId: r.applicationId,
      useId: r.useId,
      colorId:
        r.useId === 'ground'
          ? 'paper'
          : r.useId.startsWith('label')
            ? 'ink'
            : ['ink', 'middle', 'light'][(Number(r.useId.split('-')[1]) - 1) % 3],
    })),
  };
}

describe('source-bound chart applications', () => {
  it.each([
    ['categorical', 2],
    ['categorical', 9],
    ['sequential', 3],
    ['sequential', 9],
  ] as const)(
    'measures every %s mark and label for %i quantities against actual canvas',
    (meaning, count) => {
      const input = request(chart(meaning, count));
      const layout = buildGuidelineApplicationLayout(input.layout);
      const applications = layout.requirements.templates.map(t => ({
        ...t,
        uses: t.uses.map(u => ({
          ...u,
          colorId: input.assignments.find(a => a.useId === u.id)!.colorId,
        })),
      }));
      const actual = assessGuidelineApplicationGeometry(fixture().model, applications, layout);
      expect(layout.roles).toHaveLength(count * 2 + 1);
      expect(layout.areas.reduce((total, a) => total + a.area, 0)).toBe(
        480 * layout.boards[0].height
      );
      expect(layout.areas.every(a => a.area > 0)).toBe(true);
      expect(actual.regions).toHaveLength(count * 2 + 1);
      expect(layout.requirements.templates[0].contextId).toBe('product');
      expect(layout.requirements.templates[0].pairs).toHaveLength(count * 2);
      for (const pair of layout.requirements.templates[0].pairs) {
        expect(pair.backgroundUseId).toBe('ground');
        expect(pair.contrast).toEqual({
          minimum: pair.foregroundUseId.startsWith('label') ? 4.5 : 3,
          assessment: 'required',
        });
      }
      expect(layout.boards[0].root.children.every(n => n.children.length === 0)).toBe(true);
      const labels = actual.regions.filter(r => r.useId.startsWith('label'));
      expect(labels.every(r => r.contours.length > 1)).toBe(true);
      expect(
        guidelineChartRows(input.layout as GuidelineChartLayoutInput).map(r => r.value)
      ).toHaveLength(count);
    }
  );
  it.each([
    { count: 1 },
    { count: 10 },
    { count: 3.5 },
    { direction: null },
    { sourceContextId: 'chart' },
    { meaning: 'status' },
    { separator: 'invented' },
  ])('rejects unsupported or ambiguous controls %j', patch => {
    expect(() =>
      buildGuidelineApplicationLayout({ ...chart(), ...patch } as GuidelineChartLayoutInput)
    ).toThrow();
  });
  it('binds export, exact source channels, label geometry and ordering to the selected chart', async () => {
    const review = fixture(),
      input = request();
    const result = await assessGuidelineApplication(review, input);
    expect(result.status).toBe('ready');
    expect(result.assessment?.orders?.[0].pass).toBe(true);
    const files = await exportGuidelineApplication(result);
    expect(JSON.parse(files.applicationJson).schemaVersion).toBe('teul.guideline-application.v3');
    expect(files.svgs).toHaveLength(1);
    const svg = files.svgs[0].svg;
    expect(svg).toContain(
      colorSystemSrgbToCssV1(review.model.colors.find(c => c.id === 'ink')!.valuesByMode.Source)
    );
    for (const node of result.layout.boards[0].root.children)
      expect(svg).toContain(`d="${colorSystemGeometryShapeToSvgPathV1(node.shape)}"`);
    expect(svg).not.toContain('<text');
    const reopened = await readGuidelineApplication(files.applicationJson, review);
    expect((await exportGuidelineApplication(reopened)).svgs).toEqual(files.svgs);
    const tampered = JSON.parse(files.applicationJson);
    tampered.request.layout.direction = 'light-to-dark';
    await expect(readGuidelineApplication(JSON.stringify(tampered), review)).rejects.toThrow();
    tampered.request.layout.direction = 'dark-to-light';
    tampered.schemaVersion = 'teul.guideline-application.v2';
    await expect(readGuidelineApplication(JSON.stringify(tampered), review)).rejects.toThrow('V3');
  });
  it('blocks reversed ordering despite passing contrast and blocks low-contrast labels', async () => {
    const reversed = await assessGuidelineApplication(
      fixture(),
      request({ ...chart(), direction: 'light-to-dark' })
    );
    expect(reversed.assessment?.applications[0].eligible).toBe(true);
    expect(reversed.assessment?.orders?.[0].pass).toBe(false);
    expect(reversed.recipe).toBeNull();
    await expect(exportGuidelineApplication(reversed)).rejects.toThrow();
    const low = request();
    const failed = await assessGuidelineApplication(fixture(), {
      ...low,
      assignments: low.assignments.map(a =>
        a.useId === 'label-1' ? { ...a, colorId: 'light' } : a
      ),
    });
    expect(failed.recipe).toBeNull();
    expect(failed.assessment?.orders?.[0].pass).toBe(true);
  });
  it('keeps categorical CVD evidence advisory and source restrictions mandatory', async () => {
    const categorical = request(chart('categorical'));
    const same = {
      ...categorical,
      assignments: categorical.assignments.map(a =>
        a.useId.startsWith('mark') ? { ...a, colorId: 'ink' } : a
      ),
    };
    const result = await assessGuidelineApplication(fixture(), same);
    expect(result.recipe).not.toBeNull();
    expect(result.assessment?.distinctions[0]).toMatchObject({
      assessment: 'advisory',
      pass: false,
      observedCount: 3,
    });
    const blocked = await assessGuidelineApplication(fixture(true), same);
    expect(blocked.recipe).toBeNull();
    expect(blocked.applications[0].contextId).toBe('product');
    const brand = await assessGuidelineApplication(fixture(true), {
      ...same,
      layout: { ...chart('categorical'), sourceContextId: 'brand' },
    });
    expect(brand.recipe).not.toBeNull();
  });
  it('preserves raw chart drafts, source context and category meaning without inventing a source chart context', () => {
    const input = request();
    const draft = applicationDraftFromRequest(input);
    expect(readGuidelineApplicationDraft(draft)).toEqual(draft);
    expect(applicationLayoutFromDraft(draft)).toEqual(input.layout);
    expect(applicationDraftMatchesRequest(draft, input)).toBe(true);
    expect(applicationExtensionPurpose(draft)).toBe('sequential-data');
    expect(
      applicationDraftMatchesRequest(
        { ...draft, chart: { ...draft.chart!, direction: 'light-to-dark' } },
        input
      )
    ).toBe(false);
    expect(() => readGuidelineApplicationDraft({ ...draft, chart: undefined })).toThrow();
    expect(() => readGuidelineApplicationDraft({ ...draft, kind: 'brand' })).toThrow();
    expect(() =>
      readGuidelineApplicationDraft({ ...draft, chart: { ...draft.chart, arbitrary: true } })
    ).toThrow();
    const authoring = createGuidelineAuthoringDraft(fixture(), {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'application',
      application: { ...draft, choices: { ...draft.choices, 'chart/mark-2': '' } },
    });
    expect(authoring.briefs.application?.input).toMatchObject({
      context: 'chart',
      sourceContextId: 'product',
      categoryMeaning: 'sequential',
      allowedTransformations: [],
    });
    expect(authoring.application!.choices['chart/mark-2']).toBe('');
  });
  it('requires current project readers and replays selected results rather than trusting saved assessment', async () => {
    const review = fixture(),
      application = await assessGuidelineApplication(review, request());
    const saved = storedGuidelineOutputs({ extension: null, application });
    await expect(readGuidelineSelectedOutputs(saved, review, undefined, true)).rejects.toThrow(
      'brief-bearing'
    );
    const reopened = await readGuidelineSelectedOutputs(saved, review, undefined, true, true);
    expect(reopened.application?.recipe).toEqual(application.recipe);
    const changed = structuredClone(saved);
    changed.application!.requestHash = guidelineHash('different');
    await expect(
      readGuidelineSelectedOutputs(changed, review, undefined, true, true)
    ).rejects.toThrow();
  });
  it('uses the actual chart job for a selected source-derived scale and refuses a control-purpose substitution', async () => {
    const review = fixture();
    const preview = await previewGuidelineExtension(review, {
      kind: 'new-scale',
      context: 'product',
      modeId: 'Source',
      familyId: null,
      anchorColorId: 'middle',
      label: 'Chart scale',
      scaleId: 'chart-scale',
      polarity: 'light',
    });
    expect(preview.status).toBe('proposed');
    const input: GuidelineApplicationRequest = {
      ...request(),
      extension: { preview, decision: null, anchorColorId: 'middle', purpose: 'sequential-data' },
    };
    const result = await assessGuidelineApplication(review, input);
    expect(result.recipe).not.toBeNull();
    expect(JSON.stringify(result.recipe)).toContain('sequential-data');
    await expect(
      assessGuidelineApplication(review, {
        ...input,
        extension: { ...input.extension!, purpose: 'product-semantics' },
      })
    ).rejects.toThrow('purpose');
  });
  it('rejects chart layouts at the supporting-generation boundary until that generator supports them', async () => {
    await expect(
      generateGuidelineSupportingDirections(fixture(), {
        layout: chart(),
        provider: 'radix',
        scheme: 'light',
        relationship: 'nearby',
        anchorColorIds: ['middle'],
        excludedCandidateIds: [],
        sourcePaints: {},
      } as unknown as GuidelineSupportingRequest)
    ).rejects.toThrow('does not yet support chart');
  });
});

describe('original-color chart comparison and selection', () => {
  async function proposed(review = fixture()) {
    const preview = await previewGuidelineExtension(review, {
      kind: 'new-scale',
      context: 'product',
      modeId: 'Source',
      familyId: null,
      anchorColorId: 'middle',
      label: 'Comparison scale',
      scaleId: 'comparison-scale',
      polarity: 'light',
    });
    expect(preview.status).toBe('proposed');
    const input = request({ ...chart(), direction: 'light-to-dark' });
    const result = await assessGuidelineApplication(review, {
      ...input,
      assignments: input.assignments.map(use =>
        use.useId.startsWith('mark-')
          ? {
              ...use,
              colorId: preview.generatedBindings.find(
                b => b.slotId === `step:${Number(use.useId.split('-')[1]) + 9}`
              )!.colorId,
            }
          : use
      ),
      extension: { preview, decision: null, anchorColorId: 'middle', purpose: 'sequential-data' },
    });
    expect(result.recipe).not.toBeNull();
    const originals: Record<string, string> = {
      ...guidelineApplicationSourceChoices(review, result),
      'mark-1': 'light',
      'mark-2': 'middle',
      'mark-3': 'ink',
    };
    return { review, result, originals };
  }
  it('keeps source assignments exact and every generated role explicitly unassigned', async () => {
    const { review, result } = await proposed();
    const choices = guidelineApplicationSourceChoices(review, result);
    expect(choices).toEqual({
      ground: 'paper',
      'mark-1': '',
      'label-1': 'ink',
      'mark-2': '',
      'label-2': 'ink',
      'mark-3': '',
      'label-3': 'ink',
    });
    expect(() => buildGuidelineSourceApplication(review, result, choices)).toThrow();
    const before = await exportGuidelineApplication(result);
    expect(await exportGuidelineApplication(result)).toEqual(before);
  });
  it('uses one complete source request for exact original paint, reassessment and saved exports', async () => {
    const { review, result, originals } = await proposed();
    const selectedBefore = await exportGuidelineApplication(result);
    const baseline = buildGuidelineSourceApplication(review, result, originals);
    expect(baseline.layout).toEqual(result.request.layout);
    expect(baseline.extension).toBeNull();
    expect(baseline.assignments.map(a => a.colorId)).toEqual([
      'paper',
      'light',
      'ink',
      'middle',
      'ink',
      'ink',
      'ink',
    ]);
    const checked = await assessGuidelineApplication(review, baseline);
    expect(checked.recipe).not.toBeNull();
    expect(checked.assessment?.orders?.[0].pass).toBe(true);
    expect(checked.layout.boards).toEqual(result.layout.boards);
    const files = await exportGuidelineApplication(checked);
    expect(files.svgs[0].svg).toContain(
      colorSystemSrgbToCssV1(review.model.colors.find(c => c.id === 'ink')!.valuesByMode.Source)
    );
    expect((await readGuidelineApplication(files.applicationJson, review)).request).toEqual(
      baseline
    );
    expect(await exportGuidelineApplication(result)).toEqual(selectedBefore);
    expect(originals['mark-1']).toBe('light');
  });
  it('preserves translucent native source paint and checks its actual canvas composite', async () => {
    const { review, result, originals } = await proposed(fixture(false, 0.7));
    const request = buildGuidelineSourceApplication(review, result, {
      ...originals,
      'mark-2': 'ink',
      'mark-3': 'middle',
    });
    const checked = await assessGuidelineApplication(review, request);
    expect(checked.recipe).not.toBeNull();
    expect(checked.assessment?.orders?.[0].pass).toBe(true);
    const ink = checked.model!.colors.find(c => c.id === 'ink')!.valuesByMode.Source;
    expect(ink.alpha).toBe(0.7);
    expect(ink.components.r).toBe(0.123456789);
    const files = await exportGuidelineApplication(checked);
    expect(files.svgs[0].svg).toContain(`fill="${colorSystemSrgbToCssV1(ink)}"`);
    expect(
      (await readGuidelineApplication(files.applicationJson, review)).model!.colors.find(
        c => c.id === 'ink'
      )!.valuesByMode.Source
    ).toEqual(ink);
  });
  it('requires explicit original choices for generated canvas and label paints too', async () => {
    const { review, result } = await proposed();
    const preview = result.request.extension!.preview;
    const value = (step: number) =>
      preview.generatedBindings.find(b => b.slotId === `step:${step}`)!.colorId;
    const extraGenerated = await assessGuidelineApplication(review, {
      ...result.request,
      assignments: result.request.assignments.map(use =>
        use.useId === 'ground'
          ? { ...use, colorId: value(1) }
          : use.useId.startsWith('label-')
            ? { ...use, colorId: value(12) }
            : use
      ),
    });
    expect(extraGenerated.recipe).not.toBeNull();
    expect(
      Object.values(guidelineApplicationSourceChoices(review, extraGenerated)).every(
        id => id === ''
      )
    ).toBe(true);
  });
  it('rejects stale or forged results, missing/extra roles and generated colors offered as originals', async () => {
    const { review, result, originals } = await proposed();
    expect(() =>
      guidelineApplicationSourceChoices(
        { ...review, reviewHash: guidelineHash('different-review') },
        result
      )
    ).toThrow('Recheck');
    expect(() => guidelineApplicationSourceChoices(fixture(true), result)).toThrow('Recheck');
    expect(() => guidelineApplicationSourceChoices(review, structuredClone(result))).toThrow(
      'Recheck'
    );
    const { ground: _ground, ...incomplete } = originals;
    expect(() => buildGuidelineSourceApplication(review, result, incomplete)).toThrow();
    expect(() =>
      buildGuidelineSourceApplication(review, result, { ...originals, 'unknown-role': 'ink' })
    ).toThrow();
    expect(() =>
      buildGuidelineSourceApplication(review, result, {
        ...originals,
        'mark-1': result.request.assignments.find(a => a.useId === 'mark-1')!.colorId,
      })
    ).toThrow('original source');
    expect(() =>
      buildGuidelineSourceApplication(review, result, {
        ...originals,
        'mark-1': 'x'.repeat(10000),
      })
    ).toThrow();
  });
  it('keeps original previews unqualified until checked and rejects contrary ordering and contrast', async () => {
    const { review, result, originals } = await proposed();
    const reversed = buildGuidelineSourceApplication(review, result, {
      ...originals,
      'mark-1': 'ink',
      'mark-3': 'light',
    });
    const failed = await assessGuidelineApplication(review, reversed);
    expect(failed.assessment?.applications[0].eligible).toBe(true);
    expect(failed.assessment?.orders?.[0].pass).toBe(false);
    expect(failed.recipe).toBeNull();
    const pale = buildGuidelineSourceApplication(review, result, {
      ...originals,
      'mark-1': 'paper',
    });
    const invisible = await assessGuidelineApplication(review, pale);
    expect(invisible.recipe).toBeNull();
    await expect(exportGuidelineApplication(invisible)).rejects.toThrow();
    expect(result.recipe).not.toBeNull();
  });
  it('returns cancellation without mutating the retained proposal or comparison choices', async () => {
    const { review, result, originals } = await proposed();
    const before = await exportGuidelineApplication(result);
    const controller = new AbortController();
    controller.abort();
    const checked = await assessGuidelineApplication(
      review,
      buildGuidelineSourceApplication(review, result, originals),
      controller.signal
    );
    expect(checked.status).toBe('cancelled');
    expect(checked.recipe).toBeNull();
    expect(await exportGuidelineApplication(result)).toEqual(before);
    expect(originals['mark-2']).toBe('middle');
  });
});
