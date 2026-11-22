import { sourceSetPdf } from './source-set-fixture';
import { buildGuidelineApplicationLayout } from '../../src/lib/guideline/applicationGeometry';
import type { ReviewedGuideline } from '../../src/lib/guideline/review';
import type { GuidelineApplicationRequest } from '../../src/lib/guideline/application';
import {
  guidelineContextPaintChoices,
  type GuidelineContextPaints,
} from '../../src/lib/guideline/contextPaints';
import { buildColorSystemSrgbValueV1 } from '../../../src/lib/colorSystemSrgbValueV1';

/** Exposed synthetic development data, unrelated to the reserved evaluation set. */
export function contextPaintsFixture(withRule = false) {
  const project = sourceSetPdf(
    'Synthetic context paint example',
    '#777777',
    withRule ? 'family' : undefined
  );
  return { project, sourceJson: JSON.stringify(project), review: project.review! };
}
export function contextApplicationRequest(
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>
): GuidelineApplicationRequest {
  const modeId = review.model.contexts.find(context => context.id === 'brand')!.modeIds[0];
  const contextPaints: GuidelineContextPaints = {
    version: 'teul.context-paints.v1',
    id: 'test:context',
    actor: { kind: 'user', ref: 'test:context-input' },
    paints: [
      {
        id: 'canvas',
        label: 'Custom canvas',
        modeId,
        role: 'background',
        value: buildColorSystemSrgbValueV1({ r: 0.0000123456789, g: 0, b: 0 }),
      },
      {
        id: 'label',
        label: 'Custom label',
        modeId,
        role: 'foreground',
        value: buildColorSystemSrgbValueV1({ r: 0.999987654321, g: 1, b: 1 }),
      },
    ],
  };
  const paints = guidelineContextPaintChoices(contextPaints);
  const layout = {
    kind: 'chart' as const,
    modeId,
    sourceContextId: 'brand' as const,
    meaning: 'categorical' as const,
    count: 2,
    direction: null,
  };
  const marks = ['#777777', '#F0F0F0'].map(
    hex => review.model.colors.find(color => color.valuesByMode[modeId]?.hex === hex)!.id
  );
  return {
    layout,
    contextPaints,
    extension: null,
    assignments: buildGuidelineApplicationLayout(layout).roles.map(({ applicationId, useId }) => ({
      applicationId,
      useId,
      colorId:
        useId === 'ground'
          ? paints[0].id
          : useId.startsWith('label')
            ? paints[1].id
            : marks[Number(useId.split('-')[1]) - 1],
    })),
  };
}

export async function contextPaintsExtensionFixture(numericVersion?: 2) {
  const { previewGuidelineExtension, reviewGuidelineExtension } =
    await import('../../src/lib/guideline/extension');
  const { createGuidelineExtensionDecision } =
    await import('../../src/lib/guideline/extensionRuleReview');
  const { serializeGuidelineWorkspace } = await import('../../src/lib/guideline/projectCodec');
  const f = contextPaintsFixture(true),
    request = contextApplicationRequest(f.review);
  const extensionRequest = {
    ...(numericVersion === 2 ? { numericVersion } : {}),
    context: 'brand' as const,
    modeId: request.layout.modeId,
    scaleId: f.review.model.scales[0].id,
    additions: [{ slotId: 'middle', position: 1 }],
    lightnessOrder: 'increasing' as const,
  };
  const initial = await previewGuidelineExtension(f.review, extensionRequest);
  const decision = createGuidelineExtensionDecision(
    f.review.reviewHash,
    initial,
    Object.fromEntries(initial.pendingRuleIds.map(id => [id, 'accepted']))
  );
  const preview = await reviewGuidelineExtension(f.review, extensionRequest, decision);
  return {
    ...f,
    sourceJson: await serializeGuidelineWorkspace(f.sourceJson, {
      extension: { preview, decision },
      application: null,
    }),
    request: {
      ...request,
      extension: {
        preview,
        decision,
        anchorColorId: request.assignments.find(a => a.useId === 'mark-1')!.colorId,
        purpose: 'categorical-data' as const,
      },
    },
  };
}
