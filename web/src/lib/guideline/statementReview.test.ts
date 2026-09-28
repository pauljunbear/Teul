import { describe, expect, it } from 'vitest';
import { statementReviewFixture } from '../../../fixtures/guidelines/statement-review';
import type { TextObservation } from './evidence';
import { buildGuidelineProjectV3, readGuidelineProjectLatest } from './projectV3';
import {
  copyStatementExclusion,
  groupReviewStatements,
  indexPdfStatementText,
  nearbyPdfStatementText,
} from './statementReview';

describe('statement review without source or decision loss', () => {
  it('groups verbatim text but retains every occurrence and existing distinct decision', () => {
    const { draft, sourceText } = statementReviewFixture();
    const groups = groupReviewStatements(draft.rules, new Map(sourceText.map(s => [s.id, s])));
    expect(groups.map(group => group.items.length)).toEqual([4, 1, 1]);
    expect(groups[0].items.map(item => item.observationId)).toEqual([
      'notice-a',
      'notice-b',
      'notice-c',
      'notice-reviewed',
    ]);
    expect(groups[0].items[3].meaning).toBe('no-gradients');
    expect(groups.flatMap(g => g.items)).toEqual(draft.rules);
    expect(groups[0].items[0]).toBe(draft.rules[0]);
  });

  it('does not group case or whitespace changes, or ignore a missing source', () => {
    const { draft, sourceText } = statementReviewFixture();
    const sources = new Map(sourceText.map(s => [s.id, s]));
    sources.set('notice-b', { ...sources.get('notice-b')!, text: 'FOR INTERNAL USE ONLY.' });
    sources.set('notice-c', { ...sources.get('notice-c')!, text: 'For internal use only. ' });
    expect(groupReviewStatements(draft.rules, sources)).toHaveLength(5);
    sources.delete('notice-a');
    expect(() => groupReviewStatements(draft.rules, sources)).toThrow('source text is missing');
  });

  it('copies a reasoned exclusion only to unresolved copies and preserves native scopes', () => {
    const { capture, draft, sourceText } = statementReviewFixture();
    const sources = new Map(sourceText.map(s => [s.id, s]));
    const rules = draft.rules.map(rule => ({ ...rule, modeIds: [rule.observationId] }));
    rules[0] = {
      ...rules[0],
      meaning: 'not-a-rule',
      reason: 'Document access notice, retained in evidence.',
    };
    rules[1].scope = 'brand';
    const original = structuredClone(rules);
    const next = copyStatementExclusion(rules, sources, 'notice-a');
    expect(next.slice(0, 3).map(r => r.meaning)).toEqual([
      'not-a-rule',
      'not-a-rule',
      'not-a-rule',
    ]);
    expect(next[1]).toMatchObject({
      scope: 'brand',
      modeIds: ['notice-b'],
      reason: rules[0].reason,
    });
    expect(next[3]).toBe(rules[3]);
    expect(next[4]).toBe(rules[4]);
    expect(rules).toEqual(original);
    expect(copyStatementExclusion(next, sources, 'notice-a')).toBe(next);
    const project = buildGuidelineProjectV3({
      capture,
      draft: { ...draft, rules: next.map(({ modeIds: _m, ...rule }) => rule) },
      review: null,
      selection: null,
    });
    const reopened = readGuidelineProjectLatest(JSON.stringify(project));
    expect(reopened.status).toBe('opened');
    if (reopened.status === 'opened') expect(reopened.project).toEqual(project);
    expect(project.capture).toEqual(capture);
  });

  it('does not propagate positive decisions or an empty exclusion reason', () => {
    const { draft, sourceText } = statementReviewFixture();
    const sources = new Map(sourceText.map(s => [s.id, s]));
    expect(copyStatementExclusion(draft.rules, sources, 'notice-reviewed')).toBe(draft.rules);
    draft.rules[0] = { ...draft.rules[0], meaning: 'not-a-rule', reason: '  ' };
    expect(copyStatementExclusion(draft.rules, sources, 'notice-a')).toBe(draft.rules);
    expect(copyStatementExclusion(draft.rules, sources, 'missing')).toBe(draft.rules);
  });
});

describe('nearby PDF viewing context', () => {
  it('shows the adjacent qualifier without joining another column, page or paragraph', () => {
    const { sourceText } = statementReviewFixture();
    const index = indexPdfStatementText([...sourceText].reverse());
    const found = nearbyPdfStatementText(index, 'restriction');
    expect(found.map(item => item.id)).toEqual(['restriction', 'qualifier']);
    expect(found[0]).toBe(sourceText.find(item => item.id === 'restriction'));
    expect(nearbyPdfStatementText(index, 'notice-b').map(item => item.id)).toEqual(['notice-b']);
    expect(nearbyPdfStatementText(index, 'missing')).toEqual([]);
  });

  it('stops at ambiguous overlapping lines and ignores zero-size text', () => {
    const { sourceText } = statementReviewFixture();
    const qualifier = sourceText.find(item => item.id === 'qualifier')!;
    const duplicate = { ...qualifier, id: 'overlap', text: 'A different overlapping clause.' };
    const zero: TextObservation = {
      ...qualifier,
      id: 'zero',
      locator: { kind: 'pdf', page: 1, bounds: [20, 132, 0, 12] },
    };
    expect(
      nearbyPdfStatementText(indexPdfStatementText([...sourceText, duplicate]), 'restriction').map(
        x => x.id
      )
    ).toEqual(['restriction']);
    expect(nearbyPdfStatementText(indexPdfStatementText([zero]), 'zero')).toEqual([]);
  });

  it('bounds dense context and never treats it as a complete paragraph', () => {
    const lines: TextObservation[] = Array.from({ length: 20_000 }, (_, i) => ({
      id: `${i}`,
      kind: 'text',
      text: `Line ${i}`,
      locator: { kind: 'pdf', page: 1, bounds: [0, i * 16, 300, 12] },
    }));
    const found = nearbyPdfStatementText(indexPdfStatementText(lines), '10000');
    expect(found.map(item => item.id)).toEqual([
      '9997',
      '9998',
      '9999',
      '10000',
      '10001',
      '10002',
      '10003',
    ]);
  });
});
