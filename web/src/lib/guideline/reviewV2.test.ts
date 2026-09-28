import { describe, expect, it } from 'vitest';
import { bindCapture, CAPTURE_VERSION, type TextObservation } from './evidence';
import { guidelineOperationIssues } from './review';
import {
  compileGuidelineReviewV2,
  guidelineColorIdV2,
  parseGuidelineDraftV2,
  suggestGuidelineReviewV2,
  type GuidelineReviewDraftV2,
  type SourceRuleDefinition,
} from './reviewV2';

const text: TextObservation[] = [
  '#112233',
  '#336699',
  '#99CCFF',
  '#DDBB22',
  'Supporting colors must accompany gold.',
  'Do not use blue text on gold.',
  'Blue must dominate gold.',
  'Only blue may be used for actions.',
].map((text, index) => ({
  id: `text:${index}`,
  kind: 'text',
  text,
  locator: { kind: 'pdf', page: 1, bounds: [0, index * 20, 400, 20] },
}));
const capture = bindCapture({
  schemaVersion: CAPTURE_VERSION,
  id: 'synthetic:structure',
  kind: 'pdf',
  identity: {
    label: 'Synthetic structure',
    locator: null,
    revision: null,
    sha256: `sha256:${'3'.repeat(64)}`,
  },
  capturedAt: '2026-09-25T00:00:00.000Z',
  scope: { total: 1, requested: ['page:1'], inspected: ['page:1'], gaps: [] },
  observations: [
    ...text,
    ...text.slice(0, 4).map((item, index) => ({
      id: `observation:${index}`,
      kind: 'color' as const,
      literal: item.text,
      value: item.text,
      method: 'stated-hex' as const,
      evidenceRefs: [item.id],
      locator: item.locator,
    })),
  ],
  extractionVersion: 'synthetic:structure.v1',
});
const definitions: SourceRuleDefinition[] = [
  {
    kind: 'required-partner',
    force: 'requirement',
    operands: {
      subject: [{ kind: 'scale', id: 'blue-source' }],
      partner: [{ kind: 'color', id: 'observation:3' }],
    },
  },
  {
    kind: 'forbidden-pair',
    force: 'prohibition',
    operands: {
      left: [{ kind: 'family', id: 'Blue' }],
      right: [{ kind: 'color', id: 'observation:3' }],
      relation: 'foreground-background',
      ordered: true,
    },
  },
  {
    kind: 'prominence',
    force: 'requirement',
    operands: {
      kind: 'ordered-groups',
      groups: [[{ kind: 'family', id: 'Blue' }], [{ kind: 'family', id: 'Gold' }]],
    },
  },
  {
    kind: 'role-binding',
    force: 'preference',
    operands: { role: 'action', members: [{ kind: 'family', id: 'Blue' }], presence: 'if-present' },
  },
];
function fixture() {
  const draft = suggestGuidelineReviewV2(capture);
  draft.colors.forEach((color, index) => {
    color.label = `Source ${index}`;
    color.family = index < 3 ? 'Blue' : 'Gold';
  });
  draft.rules.forEach((rule, index) => {
    rule.meaning = 'relationship';
    rule.definition = structuredClone(definitions[index]);
    rule.scope = 'product';
  });
  draft.scales = [
    {
      id: 'blue-source',
      label: 'Original Blue',
      family: 'Blue',
      slots: [
        { id: '100', position: 100, observationId: 'observation:0' },
        { id: '300', position: 300, observationId: null },
        { id: '600', position: 600, observationId: 'observation:1' },
        { id: '900', position: 900, observationId: 'observation:2' },
      ],
      evidenceRefs: ['observation:0', 'observation:1', 'observation:2'],
    },
  ];
  return draft;
}
const apply = (draft = fixture()) =>
  compileGuidelineReviewV2(
    capture,
    draft,
    { kind: 'agent', ref: 'test:structure' },
    '2026-09-25T01:00:00.000Z'
  );

describe('source structure review V2', () => {
  it('preserves arbitrary source slots, gaps and original values while adopting scoped inferred relationships', () => {
    const review = apply();
    expect(review.schemaVersion).toBe('teul.guideline-review.v2');
    expect(review.model.sources[0].status).toBe('draft');
    expect(review.model.scales[0].slots).toEqual([
      { id: '100', position: 100 },
      { id: '300', position: 300 },
      { id: '600', position: 600 },
      { id: '900', position: 900 },
    ]);
    expect(review.model.scales[0].modes[0].anchors).toEqual(
      [0, 1, 2].map((index, i) => ({
        slotId: ['100', '600', '900'][i],
        colorId: guidelineColorIdV2(`observation:${index}`),
      }))
    );
    expect(
      review.model.colors.find(color => color.id === guidelineColorIdV2('observation:1'))
        ?.valuesByMode.Source.components
    ).toEqual({ r: 0.2, g: 0.4, b: 0.6 });
    expect(review.model.rules.map(rule => rule.kind).sort()).toEqual([
      'forbidden-pair',
      'prominence',
      'required-partner',
      'role-binding',
    ]);
    expect(
      review.model.rules.every(
        rule =>
          rule.origin === 'inferred' &&
          rule.contextIds.includes('product') &&
          !rule.contextIds.includes('brand')
      )
    ).toBe(true);
    expect(
      review.model.claims.every(
        claim =>
          claim.status === 'inferred' &&
          claim.ruleIds.length === 1 &&
          text.some(item => item.text === claim.text)
      )
    ).toBe(true);
    expect(review.model.coverage[0].unresolvedClaimIds).toEqual([]);
    expect(
      review.model.adoptions.every(
        item => item.actor.kind === 'agent' && item.status === 'accepted'
      )
    ).toBe(true);
    expect(guidelineOperationIssues(review, 'gradient', 'product')).toHaveLength(4);
    expect(guidelineOperationIssues(review, 'gradient', 'product')[0]).toContain(
      'cannot yet assess'
    );
    expect(guidelineOperationIssues(review, 'gradient', 'brand')).toEqual([]);
  });

  it('keeps selector identities after reordered rows and rejects exclusion instead of retargeting another color', () => {
    const before = apply();
    const reordered = fixture();
    reordered.colors.reverse();
    reordered.rules.reverse();
    const after = apply(reordered);
    expect(after.model.colors).toEqual(before.model.colors);
    expect(after.model.rules).toEqual(before.model.rules);
    expect(after.model.claims).toEqual(before.model.claims);
    const excluded = fixture();
    excluded.colors[3].include = false;
    expect(() => apply(excluded)).toThrow('missing or excluded color');
    const renamed = fixture();
    renamed.colors[3].family = 'New family';
    expect(() => apply(renamed)).toThrow('missing or excluded family');
  });

  it('lets safe unfinished structure survive without allowing its application', () => {
    const draft = fixture();
    draft.rules[0].definition = null;
    draft.scales.push({
      id: 'unfinished-scale',
      label: '',
      family: '',
      slots: [],
      evidenceRefs: [],
    });
    expect(parseGuidelineDraftV2(capture, draft)).toEqual(draft);
    expect(() => apply(draft)).toThrow('Complete each');
    draft.rules[0].definition = structuredClone(definitions[0]);
    expect(() => apply(draft)).toThrow('Name each source scale');
    const emptySelector = fixture();
    emptySelector.rules[0].definition = {
      kind: 'required-partner',
      force: 'requirement',
      operands: { subject: [{ kind: 'color', id: '' }], partner: [] },
    };
    expect(parseGuidelineDraftV2(capture, emptySelector)).toEqual(emptySelector);
    expect(() => apply(emptySelector)).toThrow('unfinished');
  });

  it.each([
    {
      change: (draft: GuidelineReviewDraftV2) => {
        draft.scales[0].slots[1].position = 99;
      },
      message: 'strictly increasing',
    },
    {
      change: (draft: GuidelineReviewDraftV2) => {
        draft.scales[0].slots[1].id = '100';
      },
      message: 'Duplicate',
    },
    {
      change: (draft: GuidelineReviewDraftV2) => {
        draft.scales[0].slots[0].observationId = 'observation:3';
      },
      message: 'family',
    },
    {
      change: (draft: GuidelineReviewDraftV2) => {
        draft.scales[0].slots.forEach(slot => {
          slot.observationId = null;
        });
      },
      message: 'at least 1',
    },
  ])(
    'rejects invalid scales without normalizing away authored structure: $message',
    ({ change, message }) => {
      const draft = fixture();
      change(draft);
      expect(parseGuidelineDraftV2(capture, draft)).toEqual(draft);
      expect(() => apply(draft)).toThrow(new RegExp(message, 'i'));
    }
  );

  it('rejects invalid evidence, omitted prompts, unsupported forces and hidden fields', () => {
    const missing = fixture();
    missing.rules.pop();
    expect(() => parseGuidelineDraftV2(capture, missing)).toThrow('rule is missing');
    const wrongEvidence = fixture();
    wrongEvidence.scales[0].evidenceRefs.push('missing');
    expect(() => parseGuidelineDraftV2(capture, wrongEvidence)).toThrow(
      'missing or duplicated evidence'
    );
    const wrongForce = fixture();
    (wrongForce.rules[0].definition as unknown as { force: string }).force = 'permission';
    expect(() => parseGuidelineDraftV2(capture, wrongForce)).toThrow(
      'Unsupported relationship force'
    );
    const hidden = fixture();
    Object.assign(hidden.rules[0].definition!, { approved: true });
    expect(() => parseGuidelineDraftV2(capture, hidden)).toThrow('unsupported fields');
    const scalar = fixture();
    scalar.scales[0].slots[0].position = Number.NaN;
    expect(() => parseGuidelineDraftV2(capture, scalar)).toThrow();
    let invoked = false;
    const getter = Object.defineProperty({}, 'captureHash', {
      enumerable: true,
      get: () => {
        invoked = true;
        return capture.captureHash;
      },
    });
    expect(() => parseGuidelineDraftV2(capture, getter)).toThrow('accessors');
    expect(invoked).toBe(false);
  });

  it('rejects ambiguous scale identities before an imported draft can reach keyed editors', () => {
    const draft = fixture();
    draft.scales.push(structuredClone(draft.scales[0]));
    expect(() => parseGuidelineDraftV2(capture, draft)).toThrow(
      'identities must be nonblank and unique'
    );
    draft.scales[1].id = '';
    expect(() => parseGuidelineDraftV2(capture, draft)).toThrow(
      'identities must be nonblank and unique'
    );
    for (const id of ['not valid', 'prototype', 'toString']) {
      draft.scales[1].id = id;
      expect(() => parseGuidelineDraftV2(capture, draft)).toThrow('inert stable identifier');
    }
  });

  it('retains incomplete meaning and existing restrictions without presenting them as resolved relationships', () => {
    const draft = suggestGuidelineReviewV2(capture);
    const unsupported = apply(draft);
    expect(guidelineOperationIssues(unsupported, 'extend', 'product')).toHaveLength(4);
    draft.rules[0].meaning = 'closed-palette';
    draft.rules[1].meaning = 'no-gradients';
    draft.rules[1].scope = 'brand';
    draft.rules[2].meaning = 'not-a-rule';
    draft.rules[2].reason =
      'Synthetic fixture statement intentionally dismissed by the test reviewer.';
    draft.rules[3].meaning = 'not-a-rule';
    draft.rules[3].reason =
      'Synthetic fixture statement intentionally dismissed by the test reviewer.';
    const review = apply(draft);
    expect(review.model.rules).toHaveLength(1);
    expect(guidelineOperationIssues(review, 'gradient', 'brand')).toHaveLength(2);
    expect(guidelineOperationIssues(review, 'extend', 'product')).toHaveLength(1);
    expect(review.model.claims.find(claim => claim.text === text[6].text)?.contextIds).toEqual([]);
  });
});
