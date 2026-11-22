import { quantitativeMatrixInput, quantitativeMatrixModel } from './quantitative-matrix-fixture';
import { bindCaptureV2, CAPTURE_V2_VERSION } from '../../src/lib/guideline/evidenceV2';
import { parseSingleStatedDigitalColor } from '../../src/lib/guideline/numericEvidence';
import {
  compileGuidelineReviewV3,
  suggestGuidelineReviewV3,
} from '../../src/lib/guideline/reviewV3';
import { buildGuidelineProjectV3 } from '../../src/lib/guideline/projectV3';
import { sourceSetActor, sourceSetTime } from './source-set-fixture';
import { guidelineHash } from '../../src/lib/guideline/review';
import { guidelineMatrixSourceEvidence } from '../../src/lib/guideline/quantitativeMatrixBinding';
import { buildGuidelineApplicationLayout } from '../../src/lib/guideline/applicationGeometry';
import type { GuidelineApplicationRequest } from '../../src/lib/guideline/application';

/** Public invented source with explicit twelve-slot scale; no brand or evaluation authority. */
export function quantitativeApplicationFixture(viewport: 'wide' | 'narrow' = 'wide') {
  const colors = quantitativeMatrixModel().colors;
  const observations = colors.flatMap((color, i) => {
    const literal = color.valuesByMode.Day.hex;
    const locator = {
      kind: 'pdf' as const,
      page: 1,
      bounds: [0, i * 20, 400, 20] as [number, number, number, number],
    };
    const numeric = parseSingleStatedDigitalColor(literal);
    return [
      { id: `text:${color.id}`, kind: 'text' as const, text: `${color.label} ${literal}`, locator },
      {
        id: `color:${color.id}`,
        kind: 'color' as const,
        method: 'stated-digital' as const,
        literal,
        syntax: numeric.syntax,
        value: numeric.value,
        evidenceRefs: [`text:${color.id}`],
        locator,
      },
    ];
  });
  const capture = bindCaptureV2({
    schemaVersion: CAPTURE_V2_VERSION,
    id: 'synthetic-matrix',
    kind: 'pdf',
    identity: {
      label: 'Synthetic quantitative source',
      locator: null,
      revision: null,
      sha256: guidelineHash('synthetic-matrix-source'),
    },
    capturedAt: sourceSetTime,
    scope: { total: 1, requested: ['page:1'], inspected: ['page:1'], gaps: [] },
    observations,
    extractionVersion: 'synthetic:quantitative-application.v1',
  });
  const draft = suggestGuidelineReviewV3(capture);
  draft.colors.forEach(color => {
    color.label = color.observationId.slice(6);
    color.family = color.label.startsWith('step-') ? 'Quantitative' : 'Context';
  });
  draft.scales = [
    {
      id: 'scale',
      label: 'Synthetic scale',
      family: 'Quantitative',
      slots: Array.from({ length: 12 }, (_, i) => ({
        id: String(i + 1),
        position: i + 1,
        observationId: `color:step-${i + 1}`,
      })),
      evidenceRefs: Array.from({ length: 12 }, (_, i) => `color:step-${i + 1}`),
    },
  ];
  const review = compileGuidelineReviewV3(capture, draft, sourceSetActor, sourceSetTime);
  const project = buildGuidelineProjectV3({ capture, draft, review, selection: null });
  const modeId = review.model.modes[0].id;
  const id = (label: string) => review.model.colors.find(color => color.label === label)!.id;
  const scaleId = review.model.scales[0].id;
  const input = {
    ...quantitativeMatrixInput(viewport),
    contextId: 'brand' as const,
    modeId,
    evidence: guidelineMatrixSourceEvidence(review.model, review.model, scaleId, modeId, [
      id('step-7'),
    ]),
  };
  const layout = {
    kind: 'chart' as const,
    modeId,
    sourceContextId: 'brand' as const,
    meaning: 'sequential' as const,
    count: 5,
    direction: input.direction,
    matrix: { scaleId, input, numericVersion: 2 as const },
  };
  const request: GuidelineApplicationRequest = {
    layout,
    extension: null,
    assignments: buildGuidelineApplicationLayout(layout).roles.map(role => ({
      applicationId: role.applicationId,
      useId: role.useId,
      colorId: id(
        role.useId === 'ground'
          ? 'paper'
          : role.useId === 'text'
            ? 'ink'
            : role.useId.startsWith('bin-')
              ? `step-${Number(role.useId.slice(4)) + 5}`
              : role.useId.startsWith('original-')
                ? 'step-7'
                : role.useId
      ),
    })),
  };
  return { project, review, request, id };
}
