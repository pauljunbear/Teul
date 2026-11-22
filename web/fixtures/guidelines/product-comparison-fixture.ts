/** Exposed synthetic paints and fixed assignments; no ranking or design-quality judgment. */
import { quantitativeApplicationFixture } from './quantitative-application-fixture';
import { previewGuidelineExtension } from '../../src/lib/guideline/extension';
import { buildGuidelineApplicationLayout } from '../../src/lib/guideline/applicationGeometry';
import {
  assessGuidelineApplication,
  buildGuidelineSourceApplication,
  guidelineApplicationSourceChoices,
  type GuidelineApplicationRequest,
} from '../../src/lib/guideline/application';

export async function productComparisonFixture() {
  const fixture = quantitativeApplicationFixture();
  const { review, id } = fixture;
  const modeId = review.model.modes[0].id;
  const anchor = id('source-blue');
  const preview = await previewGuidelineExtension(review, {
    kind: 'new-scale',
    context: 'product',
    modeId,
    familyId: review.model.families.find(family => family.colorIds.includes(anchor))!.id,
    anchorColorId: anchor,
    label: 'Derived product blue',
    scaleId: 'derived-product-blue',
    polarity: 'light',
    numericVersion: 2,
  });
  const scale = preview.workingModel!.scales.find(item => item.id === preview.request.scaleId)!;
  const steps = scale.modes.find(mode => mode.modeId === modeId)!.anchors;
  const layout = { kind: 'product' as const, modeId };
  const request: GuidelineApplicationRequest = {
    layout,
    extension: { preview, decision: null, anchorColorId: anchor, purpose: 'product-semantics' },
    assignments: buildGuidelineApplicationLayout(layout).roles.map(({ applicationId, useId }) => ({
      applicationId,
      useId,
      colorId:
        useId === 'ground' || useId === 'label'
          ? id('paper')
          : useId !== 'action'
            ? id('ink')
            : applicationId === 'disabled'
              ? id('step-2')
              : steps[applicationId === 'hover' ? 9 : applicationId === 'pressed' ? 10 : 8].colorId,
    })),
  };
  const proposed = await assessGuidelineApplication(review, request);
  const choices = guidelineApplicationSourceChoices(review, proposed);
  for (const state of ['rest', 'hover', 'pressed', 'focus'])
    choices[`${state}/action`] = id(
      `step-${state === 'hover' ? 10 : state === 'pressed' ? 11 : 9}`
    );
  const sourceRequest = buildGuidelineSourceApplication(review, proposed, choices);
  return { ...fixture, request, proposed, choices, sourceRequest };
}
