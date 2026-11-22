import { describe, expect, it } from 'vitest';
import { sourceSetPdf } from '../../../fixtures/guidelines/source-set-fixture';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
} from '../../../../src/lib/colorSystemModelV1';
import { createGuidelineDesignBrief } from './designBrief';
import { refreshGuidelineBrief, reviewReceiptPairs } from './briefRefresh';
import { guidelineHash } from './review';

function fixture(withRule = false) {
  const review = sourceSetPdf('PDF A', '#123456', withRule ? 'color' : undefined).review!;
  const color = review.model.colors[0];
  const brief = createGuidelineDesignBrief(review, {
    outputType: 'scale',
    context: 'brand',
    sourceContextId: 'brand',
    modeId: 'Source',
    sourceReferences: [color.id],
    lockedColorIds: [color.id],
    allowedTransformations: ['extend-family'],
    backgrounds: [],
    categoryMeaning: null,
  });
  const mapping = {
    mode: 'Source',
    color: (id: string) => id,
    family: (id: string) => id,
    scale: (id: string) => id,
    checkRules: () => {},
  };
  const { modelHash: _hash, ...input } = structuredClone(review.model);
  return { review, brief, mapping, input };
}
describe('source meaning across brief refresh', () => {
  it('checks evidence on an unselected color required by a governing rule', () => {
    const { review, brief, mapping, input } = fixture(true);
    const partner = input.colors.find(c => c.label === 'Gold')!;
    const evidence = input.evidence.map(e =>
      partner.evidenceRefs.includes(e.id)
        ? { ...e, description: e.description + ' Changed source qualification.' }
        : e
    );
    const changed = { ...input, evidence, adoptions: [] };
    const adoptions = buildColorSystemRuleAdoptionsV1(
      changed,
      input.adoptions.map(a => ({
        ruleId: a.ruleId,
        status: a.status,
        actor: a.actor,
        authorityRef: a.authorityRef,
        decisionRef: a.decisionRef,
      }))
    );
    const next = {
      model: buildColorSystemModelV1({ ...changed, adoptions }),
      reviewHash: guidelineHash('reviewed partner evidence'),
    };
    expect(() => refreshGuidelineBrief(review, next, brief, mapping)).toThrow('changed');
  });
  it.each(['authority', 'evidence', 'coverage', 'claim', 'conflict'] as const)(
    'requires review after changed %s even when selected paint is unchanged',
    kind => {
      const { review, brief, mapping, input } = fixture();
      const next = { ...input };
      if (kind === 'authority')
        next.sources = input.sources.map(s => ({
          ...s,
          locator: 'https://example.test/different-authority',
        }));
      if (kind === 'evidence')
        next.evidence = input.evidence.map(e => ({
          ...e,
          description: e.description + ' Changed meaning.',
        }));
      if (kind === 'coverage')
        next.coverage = input.coverage.map(c => ({ ...c, note: 'Selected scope has changed.' }));
      if (kind === 'claim')
        next.claims = [
          ...input.claims,
          {
            id: 'claim:new',
            sourceId: input.sources[0].id,
            text: 'A newly unresolved interpretation.',
            status: 'unresolved',
            evidenceRefs: [input.evidence[0].id],
            contextIds: ['brand'],
            modeIds: ['Source'],
            ruleIds: [],
          },
        ];
      if (kind === 'conflict') {
        const claims = [0, 1].map(i => ({
          id: `conflicting-claim:${i}`,
          sourceId: input.sources[0].id,
          text: `Observed incompatible statement ${i}.`,
          status: 'observed' as const,
          evidenceRefs: [input.evidence[0].id],
          contextIds: ['brand'],
          modeIds: ['Source'],
          ruleIds: [],
        }));
        next.claims = [...input.claims, ...claims];
        next.conflicts = [
          {
            id: 'conflict:new',
            message: 'An unselected color has conflicting guidance.',
            status: 'unresolved',
            colorIds: [input.colors.at(-1)!.id],
            evidenceRefs: [input.evidence[0].id],
            claimIds: claims.map(c => c.id),
            contextIds: ['brand'],
            modeIds: ['Source'],
            ruleIds: [],
          },
        ];
      }
      if (kind === 'claim')
        next.coverage = input.coverage.map(c => ({
          ...c,
          unresolvedClaimIds: [...c.unresolvedClaimIds, 'claim:new'],
        }));
      const target = { model: buildColorSystemModelV1(next), reviewHash: guidelineHash(kind) };
      expect(() => refreshGuidelineBrief(review, target, brief, mapping)).toThrow('changed');
    }
  );
  it('ties generated receipt renewal to its evidence owner and preserves changed reason text', () => {
    const { review, input } = fixture();
    const oldTime = '2026-09-26T10:00:00.000Z',
      newTime = '2026-09-27T10:00:00.000Z';
    const records = [0, 1].map(i => ({
      id: `receipt:${i}`,
      sourceId: input.sources[0].id,
      locator: 'review/partial-scope',
      status: 'inferred' as const,
      description: `Accepted ${i} at ${oldTime}. Original reason.`,
    }));
    const before = {
      ...review,
      model: buildColorSystemModelV1({ ...input, evidence: [...input.evidence, ...records] }),
      decision: { ...review.decision, reviewedAt: oldTime },
    };
    const after = {
      ...before,
      model: buildColorSystemModelV1({
        ...input,
        evidence: [
          ...input.evidence,
          ...records.map(r => ({ ...r, description: r.description.replace(oldTime, newTime) })),
        ],
      }),
      decision: { ...review.decision, reviewedAt: newTime },
    };
    // Duplicate compiler locators within one source are ambiguous, never normalized by string coincidence.
    expect(reviewReceiptPairs(before, after).filter(p => p.kind === 'evidence')).toEqual([]);
    const single = {
      ...before,
      model: buildColorSystemModelV1({ ...input, evidence: [...input.evidence, records[0]] }),
    };
    const changedReason = {
      ...after,
      model: buildColorSystemModelV1({
        ...input,
        evidence: [
          ...input.evidence,
          {
            ...records[0],
            description: records[0].description
              .replace(oldTime, newTime)
              .replace('Original', 'Different'),
          },
        ],
      }),
    };
    expect(reviewReceiptPairs(single, changedReason).filter(p => p.kind === 'evidence')).toEqual(
      []
    );
  });
  it('does not rewrite an unchanged source that shares another source’s review timestamp', () => {
    const { review, input } = fixture();
    const oldTime = '2026-09-26T10:00:00.000Z',
      newTime = '2026-09-27T10:00:00.000Z';
    const second = { ...input.sources[0], id: 'source:other', label: 'Another source' };
    const a = {
      id: 'receipt:A',
      sourceId: input.sources[0].id,
      locator: 'review/partial-scope',
      status: 'inferred' as const,
      description: `Accepted at ${oldTime}. Same reason.`,
    };
    const b = { ...a, id: 'receipt:B', sourceId: second.id };
    const shared = {
      ...input,
      sources: [...input.sources, second],
      coverage: [
        ...input.coverage,
        { ...input.coverage[0], sourceId: second.id, evidenceRefs: [b.id], unresolvedClaimIds: [] },
      ],
    };
    const before = {
      ...review,
      model: buildColorSystemModelV1({ ...shared, evidence: [...input.evidence, a, b] }),
      decision: { ...review.decision, reviewedAt: oldTime },
    };
    const after = {
      ...before,
      model: buildColorSystemModelV1({
        ...shared,
        evidence: [
          ...input.evidence,
          { ...a, description: a.description.replace(oldTime, newTime) },
          b,
        ],
      }),
      decision: { ...review.decision, reviewedAt: newTime },
    };
    const pairs = reviewReceiptPairs(before, after).filter(p => p.kind === 'evidence');
    expect(pairs).toEqual([
      {
        kind: 'evidence',
        evidenceId: a.id,
        before: a.description,
        after: a.description.replace(oldTime, newTime),
      },
    ]);
  });
});
