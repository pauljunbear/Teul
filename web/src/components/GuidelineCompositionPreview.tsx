import { useMemo } from 'react';
import type {
  GuidelineApplicationRequest,
  GuidelineApplicationResult,
} from '../lib/guideline/application';
import {
  exportGuidelineApplicationSvgs,
  type GuidelineApplicationLayout,
} from '../lib/guideline/applicationGeometry';
import { guidelineGradientSelectionNotices } from '../lib/guideline/gradientExport';
import type { ReviewedGuideline } from '../lib/guideline/review';
import type { ColorSystemModelV1 } from '../../../src/lib/colorSystemModelV1';

/** The geometry renderer is shared with export; rendering alone establishes no eligibility. */
export function GuidelineCompositionPreview({
  review,
  model,
  layout,
  request,
  result,
}: {
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
  model: ColorSystemModelV1;
  layout: GuidelineApplicationLayout;
  request: GuidelineApplicationRequest;
  result: GuidelineApplicationResult | null;
}) {
  const preview = useMemo(() => {
    try {
      const applications =
        result?.applications ??
        layout.requirements.templates.map(template => ({
          ...template,
          uses: template.uses.map(use => ({
            ...use,
            colorId: request.assignments.find(
              a => a.applicationId === template.id && a.useId === use.id
            )?.colorId,
          })),
        }));
      return {
        svg: exportGuidelineApplicationSvgs(
          model,
          applications,
          layout,
          request.decorativeGradient
            ? guidelineGradientSelectionNotices(review, request.decorativeGradient.selection)
            : []
        )[0].svg,
        error: '',
      };
    } catch (reason) {
      return {
        svg: '',
        error: reason instanceof Error ? reason.message : 'The composition preview is unavailable.',
      };
    }
  }, [review, model, layout, request, result]);
  return preview.svg ? (
    <div
      className="guideline-composition-preview"
      dangerouslySetInnerHTML={{ __html: preview.svg }}
    />
  ) : (
    <p role="alert">{preview.error}</p>
  );
}
