import { nativeGradientComparisonFixture } from './native-gradient-comparison-fixture';
import { createGuidelineContinuousGradient } from '../../src/lib/guideline/authoredGradient';
import { buildFigmaProject } from '../../src/lib/guideline/figmaProject';
import { serializeGuidelineWorkspace } from '../../src/lib/guideline/projectCodec';
import { EMPTY_GUIDELINE_OUTPUTS } from '../../src/lib/guideline/selectedOutputs';

/** Exposed invented development colors; this is no brand or human-judgment evaluation. */
export async function mixedCompositionStudioFixture() {
  const f = await nativeGradientComparisonFixture(false);
  const modeId = f.review.model.modes[0].id;
  const black = f.review.model.colors.find(color => color.valuesByMode[modeId]?.hex === '#000000')!;
  const white = f.review.model.colors.find(color => color.valuesByMode[modeId]?.hex === '#FFFFFF')!;
  const selection = createGuidelineContinuousGradient(f.review, {
    modeId,
    scope: 'brand',
    angle: 43.5,
    route: { space: 'oklab' },
    stops: [black, white].map((color, position) => ({ colorId: color.id, position, locked: true })),
  });
  const project = await buildFigmaProject({
    capture: f.inventory.packet,
    draft: f.review.decision.draft,
    review: f.review,
    selection: null,
  });
  const json = await serializeGuidelineWorkspace(
    JSON.stringify(project),
    EMPTY_GUIDELINE_OUTPUTS,
    null,
    undefined,
    null,
    selection
  );
  return { review: f.review, selection, json, modeId, black: black.id, white: white.id };
}
