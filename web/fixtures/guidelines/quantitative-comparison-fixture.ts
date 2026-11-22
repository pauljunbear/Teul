/** Invented source and one fixed generated scale; no brand-quality judgment. */
import { quantitativeApplicationFixture } from './quantitative-application-fixture';
import { previewGuidelineExtension } from '../../src/lib/guideline/extension';
import {
  guidelineMatrixEvidenceAssignments,
  guidelineMatrixSourceEvidence,
} from '../../src/lib/guideline/quantitativeMatrixBinding';
import {
  assessGuidelineApplication,
  buildGuidelineSourceApplication,
  guidelineApplicationSourceChoices,
} from '../../src/lib/guideline/application';

export async function quantitativeComparisonFixture(viewport: 'wide' | 'narrow' = 'wide') {
  const fixture = quantitativeApplicationFixture(viewport);
  const { review, request, id } = fixture;
  if (request.layout.kind !== 'chart' || !request.layout.matrix) throw new Error('fixture');
  const anchor = id('source-blue');
  const preview = await previewGuidelineExtension(review, {
    kind: 'new-scale',
    context: 'brand',
    modeId: request.layout.modeId,
    familyId: review.model.families.find(family => family.colorIds.includes(anchor))!.id,
    anchorColorId: anchor,
    label: 'Derived blue',
    scaleId: 'derived-blue',
    polarity: 'light',
    numericVersion: 2,
  });
  const input = {
    ...request.layout.matrix.input,
    evidence: guidelineMatrixSourceEvidence(
      review.model,
      preview.workingModel!,
      preview.request.scaleId,
      request.layout.modeId,
      [anchor]
    ),
  };
  const locked = new Map(
    guidelineMatrixEvidenceAssignments(input).map(use => [use.useId, use.colorId])
  );
  const proposed = await assessGuidelineApplication(review, {
    ...request,
    layout: {
      ...request.layout,
      matrix: { ...request.layout.matrix, scaleId: preview.request.scaleId, input },
    },
    assignments: request.assignments.map(use => ({
      ...use,
      colorId:
        locked.get(use.useId) ??
        (use.useId.startsWith('bin-')
          ? input.evidence.steps[Number(use.useId.slice(4)) + 6].colorId!
          : use.colorId),
    })),
    extension: { preview, decision: null, anchorColorId: anchor, purpose: 'sequential-data' },
  });
  const choices = guidelineApplicationSourceChoices(review, proposed);
  for (const use of request.assignments)
    if (use.useId.startsWith('bin-')) choices[use.useId] = use.colorId;
  const sourceRequest = buildGuidelineSourceApplication(review, proposed, choices);
  return { ...fixture, proposed, choices, sourceRequest };
}
