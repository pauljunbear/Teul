import { describe, expect, it } from 'vitest';
import { capacityApplicationFixture } from '../../../fixtures/guidelines/capacity-application-fixture';
import {
  assessGuidelineApplication,
  exportGuidelineApplication,
  readGuidelineApplication,
  guidelineApplicationSourceChoices,
  buildGuidelineSourceApplication,
} from './application';
import {
  applicationChoice,
  applicationDraftFromRequest,
  applicationLayoutFromDraft,
} from './applicationDraft';
import { capacityBarsEdits } from './capacityBarsControls';
import { buildGuidelineApplicationLayout } from './applicationGeometry';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../../../../src/lib/colorSystemModelV1';
import { guidelineHash } from './review';

describe('capacity application contract', () => {
  it('honors cancellation before producing a replacement result', async () => {
    const { review, request } = capacityApplicationFixture();
    const controller = new AbortController();
    controller.abort();
    const result = await assessGuidelineApplication(review, request, controller.signal);
    expect(result.status).toBe('cancelled');
    expect(result.recipe).toBeNull();
  });
  it.each(['text', 'ground'] as const)(
    'keeps adopted %s rules on inset regions with explicit structural mappings',
    async role => {
      const { review, request, id } = capacityApplicationFixture();
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
            actor: { kind: 'user', ref: 'test:capacity' },
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
  it('uses one category paint for keys and booked bars and rejects forged alternatives', async () => {
    const { review, request, id } = capacityApplicationFixture();
    const draft = applicationDraftFromRequest(request);
    expect(draft.choices['capacity-bars/booked-1']).toBeUndefined();
    expect(applicationChoice(draft.choices, 'capacity-bars', 'booked-1')).toBe(id('source-blue'));
    await expect(
      assessGuidelineApplication(review, {
        ...request,
        assignments: request.assignments.map(a =>
          a.useId === 'booked-1' ? { ...a, colorId: id('paper') } : a
        ),
      })
    ).rejects.toThrow(/category key paint/);
  });

  it('assesses actual key and track backgrounds and preserves an inspectable failure', async () => {
    const { review, request, id } = capacityApplicationFixture();
    const result = await assessGuidelineApplication(review, {
      ...request,
      assignments: request.assignments.map(a =>
        a.useId === 'track' ? { ...a, colorId: id('paper') } : a
      ),
    });
    expect(result.recipe).toBeNull();
    expect(
      result.assessment?.applications[0].pairs.some(
        pair => pair.pairId.startsWith('track:') && pair.status === 'fail'
      )
    ).toBe(true);
    await expect(exportGuidelineApplication(result)).rejects.toThrow();
  });

  it('rejects blank, fractional and overbooked counts without losing the original data', () => {
    const { request } = capacityApplicationFixture();
    const draft = applicationDraftFromRequest(request);
    const original = draft.chart!.capacity!.input;
    for (const raw of ['', '1.5', '1000001', '-1', '101']) {
      const edits = capacityBarsEdits(original);
      edits.booked[0] = raw;
      const layout = applicationLayoutFromDraft({ ...draft, capacityEdits: edits });
      expect(() => buildGuidelineApplicationLayout(layout)).toThrow(/Counts/);
      expect(original.records[0].booked).toBe(10);
    }
  });

  it('rejects ambiguous chart arrangements and incorrect mode binding', () => {
    const { request } = capacityApplicationFixture();
    if (request.layout.kind !== 'chart' || !request.layout.capacity) throw new Error('fixture');
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
    ).toThrow(/five categories/);
    expect(() => buildGuidelineApplicationLayout({ ...layout, matrix: {} as never })).toThrow(
      /one chart/
    );
  });

  it('replays portable exports and compares original colors in the complete retained geometry', async () => {
    const { review, request } = capacityApplicationFixture();
    const result = await assessGuidelineApplication(review, request);
    expect(result.status).toBe('ready');
    expect(result.recipe?.direction.evidenceVersion).toBe(2);
    expect(result.assessment?.distinctions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'capacity:categories', observedMinimumDeltaEOK: 0 }),
      ])
    );
    const files = await exportGuidelineApplication(result);
    expect(JSON.parse(files.applicationJson).schemaVersion).toBe('teul.guideline-application.v10');
    expect(files.svgs[0].svg).toContain('Weekly capacity');
    const reopened = await readGuidelineApplication(files.applicationJson, review);
    expect((await exportGuidelineApplication(reopened)).svgs).toEqual(files.svgs);
    const choices = guidelineApplicationSourceChoices(review, result);
    expect(buildGuidelineSourceApplication(review, result, choices)).toEqual(request);
    const old = JSON.parse(files.applicationJson);
    old.schemaVersion = 'teul.guideline-application.v9';
    await expect(readGuidelineApplication(JSON.stringify(old), review)).rejects.toThrow(/V10/);
  }, 15000);
});
