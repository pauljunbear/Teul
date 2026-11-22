/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { capturePdfPages, openGuidelinePdf } from './pdf';
import { parseCapture, bindCapture } from './evidence';
import { compileColorSystemRelationshipsV1 } from '../../../../src/lib/colorSystemRelationshipsV1';
import { compileGuidelineReview, guidelineOperationIssues, suggestGuidelineReview } from './review';

async function capture() {
  const pdf = await openGuidelinePdf(
    new Uint8Array(
      await readFile(new URL('../../../fixtures/guidelines/harbor-native.pdf', import.meta.url))
    ),
    'Harbor'
  );
  try {
    return await capturePdfPages(pdf, [1, 2]);
  } finally {
    await pdf.close();
  }
}
const actor = { kind: 'agent' as const, ref: 'test:review' };

describe('evidence-to-model boundary', () => {
  it('separates stable content from capture time and rejects forged or executable packets', async () => {
    const a = await capture();
    const { captureHash: _hash, ...data } = a;
    const b = bindCapture({ ...data, capturedAt: '2020-01-01T00:00:00.000Z' });
    expect(a.captureHash).toBe(b.captureHash);
    expect(Object.isFrozen(a.observations[0])).toBe(true);
    expect(parseCapture(JSON.parse(JSON.stringify(a)))).toEqual(a);
    expect(() => parseCapture({ ...a, observations: [] })).toThrow('changed');
    const forged = JSON.parse(JSON.stringify(data));
    const color = forged.observations.find((item: { kind: string }) => item.kind === 'color');
    color.literal = '#FFFFFF';
    color.value = '#FFFFFF';
    expect(() => bindCapture(forged)).toThrow('cited source text');
    expect(() => parseCapture({ ...a, execute: true })).toThrow('unsupported');
    const hostile = Object.defineProperty({}, 'observations', {
      get() {
        throw new Error('getter executed');
      },
      enumerable: true,
    });
    expect(() => parseCapture(hostile)).toThrow('accessors');
  });

  it('retains exact codes, equal families and unsupported restrictions in the core model', async () => {
    const source = await capture();
    const draft = suggestGuidelineReview(source);
    draft.colors[0].family = 'Ocean';
    draft.colors[1].family = 'Sand';
    const reviewed = compileGuidelineReview(source, draft, actor);
    expect(reviewed.model.colors.map(color => color.valuesByMode.Source.hex)).toEqual([
      '#126E78',
      '#ECBF74',
      '#F4EFE6',
      '#182E34',
    ]);
    expect(reviewed.model.modes.map(mode => mode.id)).toEqual(['Source']);
    expect(reviewed.model.families.map(family => family.label)).toEqual(['Ocean', 'Sand']);
    expect(
      reviewed.model.claims
        .filter(claim => claim.status === 'unsupported')
        .every(claim => claim.contextIds.includes('brand'))
    ).toBe(true);
    expect(guidelineOperationIssues(reviewed, 'extend', 'brand').length).toBeGreaterThan(0);
    const application = {
      id: 'proof:application',
      contextId: 'brand',
      modeId: 'Source',
      uses: [{ id: 'paint:ground', colorId: reviewed.model.colors[0].id, role: 'ground' }],
      pairs: [],
    };
    expect(compileColorSystemRelationshipsV1(reviewed.model).evaluate(application).eligible).toBe(
      false
    );
    const explicitTestDecision = {
      ...draft,
      rules: draft.rules.map(rule => ({
        ...rule,
        meaning: 'not-a-rule' as const,
        reason: 'Synthetic negative test: remove restriction to prove the consumer changes.',
      })),
    };
    const withoutRestrictions = compileGuidelineReview(source, explicitTestDecision, actor);
    expect(
      compileColorSystemRelationshipsV1(withoutRestrictions.model).evaluate(application).eligible
    ).toBe(true);
    expect(reviewed.decision.actor.kind).toBe('agent');
    expect(reviewed.model.sources[0].status).toBe('draft');
  });

  it('keeps a gradient ban scoped to its actual use and makes a closed palette block extensions', async () => {
    const source = await capture();
    const draft = suggestGuidelineReview(source);
    draft.rules.forEach(rule => {
      rule.meaning = 'not-a-rule';
      rule.reason = 'Agent test fixture: other constraints assessed separately.';
    });
    const ban = draft.rules.find(rule =>
      source.observations.some(
        item =>
          item.id === rule.observationId &&
          item.kind === 'text' &&
          item.text.includes('Do not use gradients')
      )
    )!;
    expect(ban).toBeDefined();
    ban.meaning = 'no-gradients';
    ban.scope = 'product';
    ban.reason = '';
    const reviewed = compileGuidelineReview(source, draft, actor);
    expect(guidelineOperationIssues(reviewed, 'gradient', 'product').length).toBe(1);
    expect(guidelineOperationIssues(reviewed, 'gradient', 'brand')).toEqual([]);
    expect(guidelineOperationIssues(reviewed, 'extend', 'product')).toEqual([]);
    ban.meaning = 'closed-palette';
    ban.scope = 'all';
    const closed = compileGuidelineReview(source, draft, actor);
    expect(guidelineOperationIssues(closed, 'extend', 'brand').length).toBe(1);
    expect(closed.model.adoptions[0].status).toBe('accepted');
    expect(closed.model.rules[0].origin).toBe('inferred');
    expect(() => compileGuidelineReview(source, { ...draft, rules: [] }, actor)).toThrow('missing');
    expect(() =>
      compileGuidelineReview(source, { ...draft, captureHash: 'changed' }, actor)
    ).toThrow('changed');
  });
});
