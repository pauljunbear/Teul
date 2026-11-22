import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { nativeGradientComparisonFixture } from '../../../fixtures/guidelines/native-gradient-comparison-fixture';
import { createGuidelineContinuousGradient } from './authoredGradient';
import { GuidelineCompositionGradientControls } from '../../components/GuidelineCompositionGradientControls';

describe('coexisting attached gradient previews', () => {
  it('keeps each instance paint reference bound to its own gradient definition', async () => {
    const { review, selection } = await nativeGradientComparisonFixture(false);
    const white = review.model.colors.find(
      c => c.valuesByMode[selection.modeId]?.hex === '#FFFFFF'
    )!.id;
    const second = createGuidelineContinuousGradient(review, {
      modeId: selection.modeId,
      scope: 'brand',
      angle: 43.5,
      route: { space: 'oklab' },
      stops: [0, 1].map(position => ({ colorId: white, position, locked: true })),
    });
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        ...[selection, second, selection].map((paint, i) =>
          createElement(GuidelineCompositionGradientControls, {
            key: i,
            review,
            value: { selection: paint },
            selected: paint,
            modeId: paint.modeId,
            context: 'brand',
            onChange: () => {},
          })
        )
      )
    );
    const definitions = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map(match => match[1]);
    const references = [...html.matchAll(/fill="url\(#([^)]*)\)"/g)].map(match => match[1]);
    expect(definitions).toHaveLength(3);
    expect(new Set(definitions).size).toBe(3);
    expect(references).toEqual(definitions);
    expect(definitions.every(id => /^teul-attached-[a-f0-9]+$/.test(id))).toBe(true);
    expect(html).toContain('rgb(0%, 0%, 0%)');
    expect(html).toContain('rgb(100%, 100%, 100%)');
  });
});
