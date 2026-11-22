import { describe, expect, it } from 'vitest';
import { compileGradientV1, type GradientDesignV1 } from '../colorSystemGradientV1';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import {
  assessGradientPaintV1,
  parseGradientAssessmentPolicyV1,
  type GradientLimitV1,
} from '../colorSystemGradientAssessmentV1';
const hash = 'sha256:' + 'a'.repeat(64);
const color = (r: number, g = r, b = r) => buildColorSystemSrgbValueV1({ r, g, b });
const design = (values: ReturnType<typeof color>[], longer = false) =>
  compileGradientV1({
    sourceModelHash: hash,
    briefHash: hash,
    angleDegrees: 120,
    route: longer ? { space: 'oklch', huePath: 'longer' } : { space: 'oklab' },
    stops: values.map((value, i) => ({
      value,
      sourceColorId: `c${i}`,
      locked: true,
      position: i / (values.length - 1),
    })),
  });
const blackWhite = design([color(0), color(1)]);
const middle: GradientLimitV1 = {
  id: 'middle',
  scope: 'rendered-paint',
  effect: 'exclude',
  bounds: {
    lightness: { minimum: 0.45, maximum: 0.55 },
    chroma: { minimum: 0, maximum: 0.5 },
    hueRanges: [{ minimum: 0, maximum: 360 }],
  },
};
// Independent direct transfer/matrix oracle. No production interval or color helpers are used.
function measured(rgb: number[]) {
  const x = rgb.map(c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const l = Math.cbrt(0.4122214708 * x[0] + 0.5363325363 * x[1] + 0.0514459929 * x[2]);
  const m = Math.cbrt(0.2119034982 * x[0] + 0.6806995451 * x[1] + 0.1073969566 * x[2]);
  const s = Math.cbrt(0.0883024619 * x[0] + 0.2817188376 * x[1] + 0.6299787005 * x[2]);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    L,
    C: Math.hypot(a, b),
    h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
    Y: 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2],
  };
}
function samples(value: GradientDesignV1) {
  return value.compiledPaint.stops.slice(1).flatMap((b, i) => {
    const a = value.compiledPaint.stops[i];
    return Array.from({ length: 257 }, (_, n) => {
      const t = n / 256;
      return measured(
        ['r', 'g', 'b'].map(
          k =>
            a.value.components[k as 'r'] +
            (b.value.components[k as 'r'] - a.value.components[k as 'r']) * t
        )
      );
    });
  });
}
describe('continuous declared gradient paint assessment', () => {
  it('distinguishes authored-stop restrictions from rendered interiors', () => {
    const anchors = assessGradientPaintV1(blackWhite, {
      use: { kind: 'decorative' },
      limits: [{ ...middle, scope: 'authored-stops' }],
    });
    const paint = assessGradientPaintV1(blackWhite, {
      use: { kind: 'decorative' },
      limits: [middle],
    });
    expect(anchors.status).toBe('pass');
    expect(paint.status).toBe('fail');
    expect(paint.limits[0].witnessPosition).toBeGreaterThan(0);
    expect(paint.limits[0].witnessPosition).toBeLessThan(1);
    expect(paint.idealPath).toBe('not-certified');
  });
  it('checks the actual foreground and only the declared text footprint', () => {
    const use = {
      kind: 'text' as const,
      foreground: color(1),
      minimumRatio: 4.5,
      footprint: { start: 0, end: 1 },
    };
    expect(assessGradientPaintV1(blackWhite, { use, limits: [] }).status).toBe('fail');
    const clipped = assessGradientPaintV1(blackWhite, {
      use: { ...use, footprint: { start: 0, end: 0.2 } },
      limits: [],
    });
    expect(clipped.status).toBe('pass');
    expect(clipped.contrast!.minimumRatioLowerBound).toBeGreaterThan(4.5);
    expect(clipped.renderingChannelAllowance).toBe(2 / 255);
  });
  it('catches a failing interior even when both endpoint contrasts pass', () => {
    const value = design([color(0), color(1)]),
      fg = color(0.46);
    const fgY = measured([0.46, 0.46, 0.46]).Y;
    expect((fgY + 0.05) / 0.05).toBeGreaterThan(4.5);
    expect(1.05 / (fgY + 0.05)).toBeGreaterThan(4.5);
    const result = assessGradientPaintV1(value, {
      use: { kind: 'text', foreground: fg, minimumRatio: 4.5, footprint: { start: 0, end: 1 } },
      limits: [],
    });
    expect(result.status).toBe('fail');
    expect(result.contrast!.minimumRatioObserved).toBeLessThan(1.2);
  });
  it('keeps an unresolved rendering margin from becoming a pass', () => {
    const value = design([color(0.5), color(0.5)]),
      l = measured([0.5, 0.5, 0.5]).L;
    const result = assessGradientPaintV1(value, {
      use: { kind: 'decorative' },
      limits: [
        {
          ...middle,
          effect: 'restrict-to',
          bounds: { ...middle.bounds, lightness: { minimum: l - 0.0001, maximum: l + 0.0001 } },
        },
      ],
    });
    expect(result.status).toBe('unassessed');
    expect(result.limits[0].witnessPosition).toBeNull();
    expect(result.limits[0].intervals).toBeLessThanOrEqual(8192);
  });
  it('handles wrapped hue territories without treating the wrap as a full wheel', () => {
    const value = design([color(0.6, 0.04, 0.2), color(0.72, 0.07, 0.2)]);
    const limit: GradientLimitV1 = {
      id: 'red',
      scope: 'rendered-paint',
      effect: 'restrict-to',
      bounds: {
        lightness: { minimum: 0.1, maximum: 0.95 },
        chroma: { minimum: 0.03, maximum: 0.4 },
        hueRanges: [
          { minimum: 320, maximum: 360 },
          { minimum: 0, maximum: 45 },
        ],
      },
    };
    const result = assessGradientPaintV1(value, { use: { kind: 'decorative' }, limits: [limit] });
    expect(result.status).toBe('pass');
    for (const c of samples(value)) expect(c.h >= 320 || c.h <= 45).toBe(true);
  });
  it('does not let allowed end hues authorize a prohibited longer-route interior', () => {
    const value = design([color(0.7, 0.1, 0.1), color(0.1, 0.1, 0.7)], true);
    const limit: GradientLimitV1 = {
      id: 'ends',
      scope: 'rendered-paint',
      effect: 'restrict-to',
      bounds: {
        lightness: { minimum: 0, maximum: 1 },
        chroma: { minimum: 0, maximum: 0.5 },
        hueRanges: [
          { minimum: 0, maximum: 50 },
          { minimum: 250, maximum: 360 },
        ],
      },
    };
    expect(
      assessGradientPaintV1(value, {
        use: { kind: 'decorative' },
        limits: [{ ...limit, scope: 'authored-stops' }],
      }).status
    ).toBe('pass');
    expect(
      assessGradientPaintV1(value, { use: { kind: 'decorative' }, limits: [limit] }).status
    ).toBe('fail');
  });
  it('does not collapse near-zero positive or near-360 hues onto the zero endpoint', () => {
    const limit: GradientLimitV1 = {
      ...middle,
      scope: 'authored-stops',
      effect: 'restrict-to',
      bounds: {
        lightness: { minimum: 0, maximum: 1 },
        chroma: { minimum: 0, maximum: 0.5 },
        hueRanges: [{ minimum: 0, maximum: 0 }],
      },
    };
    for (const g of [0.18944254782474523, 0.18944254782474476]) {
      const paint = color(0.7, g, 0.4);
      expect(
        assessGradientPaintV1(design([paint, paint]), {
          use: { kind: 'decorative' },
          limits: [limit],
        }).status
      ).toBe('fail');
    }
  });
  it('never overstates contrast against an independent dense oracle over adversarial paints', () => {
    const inputs = [
      [
        [0.04, 0.08, 0.2],
        [0.2, 0.05, 0.18],
      ],
      [
        [0.9, 0.94, 0.97],
        [0.72, 0.86, 0.9],
      ],
      [
        [1, 0, 0],
        [0, 1, 0],
      ],
      [
        [0, 0, 1],
        [1, 1, 0],
      ],
      [
        [0.1, 0.9, 0.5],
        [0.9, 0.1, 0.7],
      ],
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
    ];
    for (const endpoints of inputs) {
      const value = design(endpoints.map(([r, g, b]) => color(r, g, b)));
      const oracle = samples(value);
      for (const shade of [0, 0.3, 0.46, 0.7, 1]) {
        const fg = color(shade),
          y = measured([shade, shade, shade]).Y;
        const minimum = Math.min(
          ...oracle.map(c => (Math.max(c.Y, y) + 0.05) / (Math.min(c.Y, y) + 0.05))
        );
        const result = assessGradientPaintV1(value, {
          use: { kind: 'text', foreground: fg, minimumRatio: 4.5, footprint: { start: 0, end: 1 } },
          limits: [],
        });
        expect(result.contrast!.minimumRatioLowerBound).toBeLessThanOrEqual(minimum + 1e-10);
        if (result.status === 'pass') expect(minimum).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('treats the 360-degree boundary as the same hue as zero', () => {
    const value = design([
      color(0.7, 0.1894425478247452, 0.4),
      color(0.7, 0.1894425478247452, 0.4),
    ]);
    const limit: GradientLimitV1 = {
      ...middle,
      scope: 'authored-stops',
      bounds: {
        ...middle.bounds,
        lightness: { minimum: 0, maximum: 1 },
        hueRanges: [{ minimum: 350, maximum: 360 }],
      },
    };
    expect(
      assessGradientPaintV1(value, { use: { kind: 'decorative' }, limits: [limit] }).status
    ).toBe('fail');
  });
  it('rejects malformed policies and altered compiled paint', () => {
    for (const policy of [
      { use: { kind: 'unknown' }, limits: [] },
      {
        use: {
          kind: 'text',
          foreground: color(1),
          minimumRatio: 4.5,
          footprint: { start: 0.5, end: 0.5 },
        },
        limits: [],
      },
      { use: { kind: 'decorative' }, limits: [middle, middle] },
      { use: { kind: 'decorative' }, limits: [{ ...middle, scope: 'source' }] },
      {
        use: { kind: 'decorative' },
        limits: [
          { ...middle, bounds: { ...middle.bounds, lightness: { minimum: 0.9, maximum: 0.1 } } },
        ],
      },
    ])
      expect(() => parseGradientAssessmentPolicyV1(policy)).toThrow();
    const changed = JSON.parse(JSON.stringify(blackWhite));
    changed.compiledPaint.stops[0].value = color(0.2);
    expect(() =>
      assessGradientPaintV1(changed, { use: { kind: 'decorative' }, limits: [] })
    ).toThrow();
  });
});
