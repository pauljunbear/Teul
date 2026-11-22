import { describe, it, expect } from 'vitest';
import { mixedPaintCompositionFixture } from '../../../fixtures/guidelines/mixed-paint-composition-fixture';
import { serializeGuidelineGeometrySvgs } from './geometrySvg';
import { serializeGradientSvgV1 } from '../../../../src/lib/colorSystemGradientPaintV1';
import { guidelineHash } from './review';

describe('mixed application geometry SVG', () => {
  it.each(['Day', 'Night'] as const)(
    'replays and exports the exact %s gradient beside authored text',
    async modeId => {
      const fixture = await mixedPaintCompositionFixture(modeId);
      expect(fixture.fidelity.status).toBe('pass');
      expect(fixture.execution.status).toBe('ready');
      expect(fixture.replay.status).toBe('matched');
      expect(fixture.geometry.areas.reduce((sum, area) => sum + area.area, 0)).toBe(800 * 360);
      expect(
        fixture.execution.candidates[0].applications.applications[0].pairs.every(
          pair => pair.status === 'pass'
        )
      ).toBe(true);
      const id = `teul-${guidelineHash([fixture.geometry.geometryHash, 'composition', 'composition:gradient']).slice(7, 39)}`;
      const expectedPaint = serializeGradientSvgV1(fixture.paint, 400, 360, id)
        .replace('<svg ', '<svg x="400" y="0" ')
        .replace('</svg>', '<title>Decorative source-colour gradient</title></svg>');
      expect(fixture.svg).toContain(expectedPaint);
      expect(fixture.svg).toContain(
        'Accepted rendered sRGB approximation; not an exact authored brand token.'
      );
      expect(fixture.svg).toContain(fixture.panel.input.heading);
      expect(fixture.svg).toContain(fixture.panel.input.body);
      expect(fixture.svg).not.toContain('<text');
      expect(
        serializeGuidelineGeometrySvgs(
          fixture.source,
          fixture.geometry,
          'Synthetic composition',
          fixture.panel.artwork.notes
        )[0].svg
      ).toBe(fixture.svg);
    }
  );
});
