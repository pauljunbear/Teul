import { describe, expect, it } from 'vitest';
import { groupedReportApplicationFixture } from '../../../fixtures/guidelines/grouped-report-application-fixture';
import {
  assessGuidelineApplication,
  exportGuidelineApplication,
  readGuidelineApplication,
  guidelineApplicationSourceChoices,
  buildGuidelineSourceApplication,
} from './application';
import { applicationDraftFromRequest, applicationLayoutFromDraft } from './applicationDraft';
import { groupedReportEdits } from './groupedReportControls';
import { buildGuidelineApplicationLayout } from './applicationGeometry';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../../../../src/lib/colorSystemModelV1';
import { guidelineHash } from './review';

describe('report application contract', () => {
  it('refuses translucent report boundaries before creating a checked selection', async () => {
    const { review, request, id } = groupedReportApplicationFixture();
    const { modelHash: _hash, ...original } = review.model;
    const model = buildColorSystemModelV1({
      ...original,
      colors: original.colors.map(color =>
        color.id === id('paper')
          ? {
              ...color,
              valuesByMode: Object.fromEntries(
                Object.entries(color.valuesByMode).map(([mode, value]) => [
                  mode,
                  { ...value, alpha: 0.5 },
                ])
              ),
            }
          : color
      ),
    });
    await expect(
      assessGuidelineApplication({ model, reviewHash: guidelineHash(model) }, request)
    ).rejects.toThrow(/opaque paints/);
  });
  it('honors cancellation before producing a replacement result', async () => {
    const { review, request } = groupedReportApplicationFixture();
    const controller = new AbortController();
    controller.abort();
    const result = await assessGuidelineApplication(review, request, controller.signal);
    expect(result.status).toBe('cancelled');
    expect(result.recipe).toBeNull();
  });
  it.each(['text', 'ground'] as const)(
    'keeps adopted %s rules on inset regions with explicit structural mappings',
    async role => {
      const { review, request, id } = groupedReportApplicationFixture();
      const { modelHash: _hash, ...source } = review.model;
      const input: ColorSystemModelInputV1 = {
        ...source,
        adoptions: [],
        rules: [
          {
            id: 'required-text',
            label: 'Use ink for text',
            kind: 'role-binding',
            force: 'requirement',
            origin: 'inferred',
            contextIds: ['brand'],
            modeIds: [request.layout.modeId],
            evidenceRefs: [],
            claimIds: [],
            operands: {
              role,
              presence: 'if-present',
              members: [{ kind: 'color', id: id(role === 'text' ? 'ink' : 'paper') }],
            },
          },
        ],
      };
      const model = buildColorSystemModelV1({
        ...input,
        adoptions: buildColorSystemRuleAdoptionsV1(input, [
          {
            ruleId: 'required-text',
            status: 'accepted',
            actor: { kind: 'user', ref: 'test:report' },
            authorityRef: 'synthetic-fixture',
            decisionRef: 'synthetic-rule',
          },
        ]),
      });
      const nextReview = { model, reviewHash: guidelineHash(model) };
      const failed = await assessGuidelineApplication(nextReview, {
        ...request,
        assignments: request.assignments.map(a =>
          a.useId === (role === 'text' ? 'inset-text' : 'surface')
            ? { ...a, colorId: id('source-blue') }
            : a
        ),
      });
      expect(failed.recipe).toBeNull();
      expect(
        failed.assessment?.applications[0].rules.some(
          rule => rule.ruleId === 'required-text' && rule.status === 'fail'
        )
      ).toBe(true);
      const valid = await assessGuidelineApplication(nextReview, request);
      expect(valid.status).toBe('ready');
    }
  );
  it.each(['surface', 'focus-fill'])(
    'rejects insufficient contrast at the actual %s boundary',
    async useId => {
      const { review, request, id } = groupedReportApplicationFixture();
      const result = await assessGuidelineApplication(review, {
        ...request,
        assignments: request.assignments.map(a =>
          a.useId === useId ? { ...a, colorId: id('ink') } : a
        ),
      });
      expect(result.recipe).toBeNull();
      expect(result.assessment?.applications[0].pairs.some(pair => pair.status === 'fail')).toBe(
        true
      );
      await expect(exportGuidelineApplication(result)).rejects.toThrow();
    }
  );

  it('rejects blank, fractional and overbooked counts without losing the original data', () => {
    const { request } = groupedReportApplicationFixture();
    const draft = applicationDraftFromRequest(request);
    const original = draft.chart!.report!.input;
    for (const raw of ['', '1.5', '1000001', '-1', '101']) {
      const edits = groupedReportEdits(original);
      edits.values[0][0] = raw;
      const layout = applicationLayoutFromDraft({ ...draft, reportEdits: edits });
      expect(() => buildGuidelineApplicationLayout(layout)).toThrow(/counts/i);
      expect(original.categories[0].values[0]).toBe(20);
    }
  });

  it('rejects ambiguous chart arrangements and incorrect mode binding', () => {
    const { request } = groupedReportApplicationFixture();
    if (request.layout.kind !== 'chart' || !request.layout.report) throw new Error('fixture');
    const layout = request.layout;
    expect(() => buildGuidelineApplicationLayout({ ...layout, modeId: 'unrelated' })).toThrow(
      /actual application mode/
    );
    expect(() =>
      buildGuidelineApplicationLayout({
        ...layout,
        meaning: 'sequential',
        direction: 'light-to-dark',
      })
    ).toThrow(/four categor/i);
    expect(() => buildGuidelineApplicationLayout({ ...layout, matrix: {} as never })).toThrow(
      /one chart/
    );
  });

  it('replays portable exports and compares original colors in the complete retained geometry', async () => {
    const { review, request } = groupedReportApplicationFixture();
    const result = await assessGuidelineApplication(review, request);
    expect(result.status).toBe('ready');
    expect(result.recipe?.direction.evidenceVersion).toBe(2);
    expect(result.assessment?.distinctions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'report:categories', observedMinimumDeltaEOK: 0 }),
      ])
    );
    const files = await exportGuidelineApplication(result);
    expect(JSON.parse(files.applicationJson).schemaVersion).toBe('teul.guideline-application.v11');
    expect(files.svgs[0].svg).toContain('Quarterly activity');
    const reopened = await readGuidelineApplication(files.applicationJson, review);
    expect((await exportGuidelineApplication(reopened)).svgs).toEqual(files.svgs);
    const choices = guidelineApplicationSourceChoices(review, result);
    expect(buildGuidelineSourceApplication(review, result, choices)).toEqual(request);
    const old = JSON.parse(files.applicationJson);
    old.schemaVersion = 'teul.guideline-application.v10';
    await expect(readGuidelineApplication(JSON.stringify(old), review)).rejects.toThrow(/V11/);
  }, 15000);
});
