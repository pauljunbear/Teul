import { bindCaptureV2, CAPTURE_V2_VERSION } from '../../src/lib/guideline/evidenceV2';
import type { TextObservation } from '../../src/lib/guideline/evidence';
import { parseSingleStatedDigitalColor } from '../../src/lib/guideline/numericEvidence';
import { suggestGuidelineReviewV3 } from '../../src/lib/guideline/reviewV3';
import { buildGuidelineProjectV3 } from '../../src/lib/guideline/projectV3';

// Authored source observations for UI/replay tests; not a PDF extraction fixture.
export function statementReviewFixture() {
  const text = (id: string, value: string, page: number, y: number, x = 20): TextObservation => ({
    id,
    kind: 'text',
    text: value,
    locator: { kind: 'pdf', page, bounds: [x, y, 320, 12] },
  });
  const sourceText = [
    text('color', '#336699', 1, 20),
    text('notice-a', 'For internal use only.', 1, 500),
    text('notice-b', 'For internal use only.', 2, 500),
    text('notice-c', 'For internal use only.', 3, 500),
    text('notice-reviewed', 'For internal use only.', 4, 500),
    text('notice-different', 'For internal use only. Never publish.', 5, 500),
    text('restriction', 'Never use white in backgrounds.', 1, 100),
    text('qualifier', 'Except on monochrome logo applications.', 1, 116),
    text('other-column', 'Unrelated adjacent column.', 1, 116, 420),
    text('later-paragraph', 'This is a separate paragraph.', 1, 190),
  ];
  const capture = bindCaptureV2({
    schemaVersion: CAPTURE_V2_VERSION,
    id: 'synthetic:statement-review',
    kind: 'pdf',
    identity: {
      label: 'Fictional review statements — authored test observations',
      locator: null,
      revision: null,
      sha256: `sha256:${'8'.repeat(64)}`,
    },
    capturedAt: '2026-09-26T00:00:00.000Z',
    scope: {
      total: 5,
      requested: [1, 2, 3, 4, 5].map(n => `page:${n}`),
      inspected: [1, 2, 3, 4, 5].map(n => `page:${n}`),
      gaps: [],
    },
    observations: [
      ...sourceText,
      {
        id: 'blue',
        kind: 'color',
        method: 'stated-digital',
        ...parseSingleStatedDigitalColor('#336699'),
        evidenceRefs: ['color'],
        locator: sourceText[0].locator,
      },
    ],
    extractionVersion: 'synthetic:statement-review.v1',
  });
  const draft = suggestGuidelineReviewV3(capture);
  draft.rules = draft.rules.map(rule =>
    rule.observationId === 'notice-reviewed'
      ? { ...rule, meaning: 'no-gradients', scope: 'product', reason: 'Existing test decision.' }
      : rule
  );
  return {
    capture,
    draft,
    sourceText,
    project: buildGuidelineProjectV3({ capture, draft, review: null, selection: null }),
  };
}
