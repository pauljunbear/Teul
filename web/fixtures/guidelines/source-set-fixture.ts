import { bindCaptureV2, CAPTURE_V2_VERSION } from '../../src/lib/guideline/evidenceV2';
import { parseSingleStatedDigitalColor } from '../../src/lib/guideline/numericEvidence';
import {
  compileGuidelineReviewV3,
  suggestGuidelineReviewV3,
} from '../../src/lib/guideline/reviewV3';
import { buildGuidelineProjectV3 } from '../../src/lib/guideline/projectV3';
import { guidelineHash } from '../../src/lib/guideline/review';

export const sourceSetActor = { kind: 'user' as const, ref: 'test:source-set' };
export const sourceSetTime = '2026-09-26T10:00:00.000Z';
export function sourceSetPdf(
  label = 'PDF A',
  blue = '#123456',
  restriction?: 'color' | 'family' | 'scale' | 'no-gradients',
  extraColors = 0
) {
  const literals = [
    blue,
    '#F0F0F0',
    '#DDBB22',
    ...Array.from(
      { length: extraColors },
      (_, i) => `#${(i + 1000).toString(16).padStart(6, '0')}`
    ),
  ];
  const locator = (i: number) => ({
    kind: 'pdf' as const,
    page: 1,
    bounds: [0, i * 20, 400, 20] as [number, number, number, number],
  });
  const texts = literals.map((text, i) => ({
    id: `text:${i}`,
    kind: 'text' as const,
    text,
    locator: locator(i),
  }));
  const rule = restriction
    ? [
        {
          id: 'text:rule',
          kind: 'text' as const,
          text:
            restriction === 'no-gradients' ? 'Do not use gradients.' : 'Do not pair Blue and Gold.',
          locator: locator(4),
        },
      ]
    : [];
  const capture = bindCaptureV2({
    schemaVersion: CAPTURE_V2_VERSION,
    id: label,
    kind: 'pdf',
    identity: { label, locator: null, revision: null, sha256: guidelineHash(label) },
    capturedAt: sourceSetTime,
    scope: { total: 1, requested: ['page:1'], inspected: ['page:1'], gaps: [] },
    observations: [
      ...texts,
      ...rule,
      ...literals.map((literal, i) => {
        const value = parseSingleStatedDigitalColor(literal);
        return {
          id: `color:${i}`,
          kind: 'color' as const,
          method: 'stated-digital' as const,
          literal,
          syntax: value.syntax,
          value: value.value,
          evidenceRefs: [`text:${i}`],
          locator: locator(i),
        };
      }),
    ],
    extractionVersion: 'synthetic:source-set.v1',
  });
  const draft = suggestGuidelineReviewV3(capture);
  draft.colors.forEach((c, i) => {
    c.label = ['Blue', 'Light', 'Gold'][i] ?? `Extra ${i}`;
    c.family = i < 2 ? 'Blue family' : 'Gold family';
  });
  draft.scales = [
    {
      id: 'blue-scale',
      label: `${label} Blue scale`,
      family: 'Blue family',
      slots: [
        { id: '100', position: 0, observationId: 'color:0' },
        { id: '900', position: 2, observationId: 'color:1' },
      ],
      evidenceRefs: ['color:0', 'color:1'],
    },
  ];
  draft.rules = draft.rules.map(r => ({
    ...r,
    meaning: restriction === 'no-gradients' ? 'no-gradients' : 'relationship',
    scope: 'brand',
    reason: 'Synthetic source rule.',
    definition:
      restriction && restriction !== 'no-gradients'
        ? {
            kind: 'forbidden-pair',
            force: 'prohibition',
            operands: {
              left: [
                {
                  kind: restriction,
                  id:
                    restriction === 'color'
                      ? 'color:0'
                      : restriction === 'family'
                        ? 'Blue family'
                        : 'blue-scale',
                },
              ],
              right: [{ kind: 'color', id: 'color:2' }],
              ordered: false,
              relation: 'co-present',
            },
          }
        : null,
  }));
  const review = compileGuidelineReviewV3(capture, draft, sourceSetActor, sourceSetTime);
  return buildGuidelineProjectV3({ capture, draft, review, selection: null });
}

export function sourceSetPdfRevision(
  base: ReturnType<typeof sourceSetPdf>,
  change: {
    color?: [number, string];
    family?: string;
    authority?: boolean;
    note?: boolean;
    rule?: {
      text: string;
      definition: NonNullable<(typeof base.draft.rules)[number]['definition']>;
    };
  } = {}
) {
  const { captureHash: _, ...raw } = structuredClone(base.capture);
  raw.identity.sha256 = guidelineHash({ change });
  raw.capturedAt = '2026-09-26T11:00:00.000Z';
  if (change.authority) raw.identity.locator = 'https://example.test/different-guideline';
  if (change.color) {
    const [index, literal] = change.color,
      numeric = parseSingleStatedDigitalColor(literal);
    raw.observations = raw.observations.map(o =>
      o.id === `text:${index}` && o.kind === 'text'
        ? { ...o, text: literal }
        : o.id === `color:${index}` && o.kind === 'color'
          ? { ...o, literal, syntax: numeric.syntax, value: numeric.value }
          : o
    );
  }
  if (change.note)
    raw.observations.push({
      id: 'text:unrelated',
      kind: 'text',
      text: 'An unrelated explanatory sentence.',
      locator: { kind: 'pdf', page: 1, bounds: [0, 300, 400, 20] },
    });
  if (change.rule) {
    raw.observations = raw.observations.map(o =>
      o.id === 'text:rule' && o.kind === 'text' ? { ...o, text: change.rule!.text } : o
    );
  }
  const capture = bindCaptureV2(raw),
    draft = structuredClone(base.draft);
  if (change.rule) draft.rules[0].definition = change.rule.definition;
  draft.captureHash = capture.captureHash;
  if (change.family) draft.colors[2].family = change.family;
  return buildGuidelineProjectV3({
    capture,
    draft,
    review: compileGuidelineReviewV3(capture, draft, sourceSetActor, sourceSetTime),
    selection: null,
  });
}
