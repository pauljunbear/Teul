import { nativeGradientComparisonFixture } from './native-gradient-comparison-fixture';
import {
  assessGuidelineApplication,
  exportGuidelineApplication,
  readGuidelineApplication,
} from '../../src/lib/guideline/application';

/** Public development content only; not an evaluation source or proposed brand palette. */
export async function compositionPanelFixture() {
  const { review } = await nativeGradientComparisonFixture(false);
  const modeId = review.model.modes[0].id;
  const colors = review.model.colors.filter(c => c.valuesByMode[modeId]);
  const white = colors.find(c => c.valuesByMode[modeId].components.r === 1)!;
  const black = colors.find(c => c.valuesByMode[modeId].components.r === 0)!;
  const results = await Promise.all(
    [400, 280].map(async width => {
      const result = await assessGuidelineApplication(review, {
        layout: {
          kind: 'panel',
          sourceContextId: 'brand',
          modeId,
          width,
          height: 360,
          heading: 'A clearer direction',
          body: 'Compare the original colours with a proposed direction. Keep the source values visible.\nMake the choice in context.',
        },
        assignments: [
          { applicationId: 'panel', useId: 'ground', colorId: white.id },
          { applicationId: 'panel', useId: 'text-1', colorId: black.id },
          { applicationId: 'panel', useId: 'text-2', colorId: black.id },
        ],
        extension: null,
      });
      const exported = await exportGuidelineApplication(result);
      const portable = { svg: exported.svgs[0].svg, json: exported.applicationJson };
      const reopened = await readGuidelineApplication(portable.json, review);
      if ((await exportGuidelineApplication(reopened)).svgs[0].svg !== portable.svg)
        throw new Error('Panel replay changed painted SVG.');
      return { width, result, portable };
    })
  );
  return { review, results };
}
