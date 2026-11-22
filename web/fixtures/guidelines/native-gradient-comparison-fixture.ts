import { nativeGradientInventoryFixture } from './native-gradient-fixture';
import { canonicalIntakeJson } from '../../../services/guideline-intake/src/protocol';
import { hashCanonical } from '../../src/lib/guideline/intakeClient';
import { createFigmaNativeInventory } from '../../src/lib/guideline/figmaInventory';
import { suggestFigmaReview, compileFigmaReview } from '../../src/lib/guideline/figmaReview';
import { createGuidelineContinuousGradient } from '../../src/lib/guideline/authoredGradient';
import { figmaNativeGradients } from '../../src/lib/guideline/nativeGradient';
import { createNativeGradientComparison } from '../../src/lib/guideline/nativeGradientComparison';

/** Synthetic composition source: public radial paint plus explicit test solids; no brand acceptance. */
export async function nativeGradientComparisonFixture(text = true) {
  const original = await nativeGradientInventoryFixture();
  const { contentHash: _hash, ...content } = structuredClone(original.packet);
  content.file.name = 'Synthetic native gradient comparison';
  content.roots[0].document.children = [
    (content.roots[0].document.children as any[])[2],
    ...[0, 1].map((channel, index) => ({
      id: `2:${index + 1}`,
      name: index ? 'White test label' : 'Black test fill',
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: { r: channel, g: channel, b: channel, a: 1 } }],
    })),
  ];
  const inventory = await createFigmaNativeInventory({
    ...content,
    contentHash: await hashCanonical(canonicalIntakeJson(content)),
  });
  const actor = { kind: 'user' as const, ref: 'synthetic-test-user-not-a-human-rating' };
  const draft = suggestFigmaReview(inventory);
  draft.modeIds = [inventory.modes[0].id];
  draft.colors = inventory.declarations.map(item => ({
    declarationId: item.id,
    label: item.label,
    family: 'Synthetic',
  }));
  draft.profileDecision = {
    captureHash: draft.captureHash,
    interpretation: 'srgb',
    actor,
    decidedAt: content.capturedAt,
  };
  draft.scopeDecision = { accepted: true, reason: 'Synthetic comparison test only.' };
  const review = compileFigmaReview(inventory, draft, actor, content.capturedAt);
  const modeId = review.model.modes[0].id;
  const black = review.model.colors.find(color => color.valuesByMode[modeId]?.components.r === 0)!;
  const white = review.model.colors.find(color => color.valuesByMode[modeId]?.components.r === 1)!;
  const selection = createGuidelineContinuousGradient(
    review,
    {
      modeId,
      scope: 'brand',
      angle: 43.5,
      route: { space: 'oklab' },
      stops: [0, 1].map(position => ({ colorId: black.id, position, locked: true })),
    },
    text
      ? {
          origin: 'designer-authored',
          use: {
            kind: 'text',
            foregroundColorId: white.id,
            minimumRatio: 4.5,
            footprint: { start: 0.2, end: 0.8 },
          },
          limits: [],
        }
      : undefined
  );
  const [evidence] = figmaNativeGradients(inventory);
  const wide = createNativeGradientComparison(review, selection, evidence, {
    width: 400,
    height: 240,
    interpretation: 'srgb',
  });
  const narrow = createNativeGradientComparison(review, selection, evidence, {
    width: 240,
    height: 240,
    interpretation: 'srgb',
  });
  return { inventory, review, selection, evidence, wide, narrow };
}
