import { describe, expect, it } from 'vitest';
import { gradientTextPlacement } from './gradientTextPlacement';

type Size = { width: number; height: number };
type Coverage = { start: number; end: number };
const frame = { width: 400, height: 240 };
const text = { width: 120, height: 32 };
const full = { start: 0, end: 1 };

function checkCorners(board: Size, measured: Size, angleDegrees: number, footprint: Coverage) {
  const placement = gradientTextPlacement(board, measured, angleDegrees, footprint);
  expect(placement).not.toBeNull();
  if (!placement) throw new Error('Expected the complete text to fit.');
  const { left, top, coverage } = placement;
  expect(left).toBeGreaterThanOrEqual(12 - 1e-9);
  expect(top).toBeGreaterThanOrEqual(12 - 1e-9);
  expect(left + measured.width).toBeLessThanOrEqual(board.width - 12 + 1e-9);
  expect(top + measured.height).toBeLessThanOrEqual(board.height - 12 + 1e-9);

  // Derive each actual corner's position from the CSS line endpoints, independently
  // of the helper's center/radius bounds. Check the extra 2px rectangle as well.
  const angle = (angleDegrees * Math.PI) / 180;
  const direction = { x: Math.sin(angle), y: -Math.cos(angle) };
  const length = Math.abs(direction.x * board.width) + Math.abs(direction.y * board.height);
  const start = {
    x: board.width / 2 - (direction.x * length) / 2,
    y: board.height / 2 - (direction.y * length) / 2,
  };
  const vector = { x: direction.x * length, y: direction.y * length };
  for (const allowance of [0, 2]) {
    const positions = [left - allowance, left + measured.width + allowance].flatMap(x =>
      [top - allowance, top + measured.height + allowance].map(
        y => ((x - start.x) * vector.x + (y - start.y) * vector.y) / (vector.x ** 2 + vector.y ** 2)
      )
    );
    for (const position of positions) {
      expect(position).toBeGreaterThanOrEqual(footprint.start - 1e-9);
      expect(position).toBeLessThanOrEqual(footprint.end + 1e-9);
    }
    if (allowance === 2) {
      expect(coverage.start).toBeCloseTo(Math.min(...positions), 12);
      expect(coverage.end).toBeCloseTo(Math.max(...positions), 12);
    }
  }
  return placement;
}

describe('gradient text placement', () => {
  it.each([0, 90, 180, 270, 360, -90, -360, 35, 135, 225, 315, -35])(
    'centers full-coverage text at %s degrees and contains every corner',
    angle => {
      const placement = checkCorners(frame, text, angle, full);
      expect(placement.left).toBeCloseTo(140, 12);
      expect(placement.top).toBeCloseTo(104, 12);
    }
  );

  it.each([
    { angle: 0, left: 140, top: 74 },
    { angle: 90, left: 222, top: 104 },
    { angle: 180, left: 140, top: 134 },
    { angle: 270, left: 58, top: 104 },
  ])('uses the CSS direction at $angle degrees', ({ angle, left, top }) => {
    const placement = checkCorners(frame, text, angle, { start: 0.55, end: 1 });
    expect(placement.left).toBeCloseTo(left, 10);
    expect(placement.top).toBeCloseTo(top, 10);
    expect(placement.coverage.start).toBeCloseTo(0.55, 12);
  });

  it.each([0, 90, 180, 270, 35, 135, 225, 315, -35])(
    'contains the full rectangle in start and end intervals at %s degrees',
    angle => {
      for (const footprint of [
        { start: 0, end: 0.35 },
        { start: 0.65, end: 1 },
      ]) {
        checkCorners(frame, { width: 64, height: 24 }, angle, footprint);
      }
    }
  );

  it('leaves centered text in place when its entire coverage already fits', () => {
    const placement = checkCorners(frame, text, 90, { start: 0.3, end: 0.7 });
    expect(placement.left).toBe(140);
    expect(placement.top).toBe(104);
  });

  it('finds the closest diagonal placement where the right inset constrains the center', () => {
    const placement = checkCorners({ width: 240, height: 400 }, { width: 200, height: 24 }, 45, {
      start: 0.45,
      end: 0.9,
    });
    expect(placement.left).toBeCloseTo(28, 10);
    expect(placement.top).toBeCloseTo(112, 10);
  });

  it('finds the closest diagonal placement where the top inset constrains the center', () => {
    const placement = checkCorners({ width: 400, height: 240 }, { width: 24, height: 200 }, 45, {
      start: 0.45,
      end: 0.9,
    });
    expect(placement.left).toBeCloseTo(264, 10);
    expect(placement.top).toBeCloseTo(12, 10);
  });

  it('normalizes negative angles and complete turns to the same placement', () => {
    for (const angle of [0, 27, 90, 225, 270]) {
      const expected = gradientTextPlacement(frame, text, angle, { start: 0.4, end: 0.9 });
      for (const turn of [-720, -360, 360, 720]) {
        expect(gradientTextPlacement(frame, text, angle + turn, { start: 0.4, end: 0.9 })).toEqual(
          expected
        );
      }
    }
  });

  it('refuses coverage that fits only the measured text without its glyph allowance', () => {
    expect(gradientTextPlacement(frame, text, 90, { start: 0.35, end: 0.65 })).toBeNull();
    checkCorners(frame, text, 90, { start: 0.34, end: 0.66 });
  });

  it('accepts an exact padded fit despite decimal rounding, without admitting a narrower range', () => {
    checkCorners(frame, text, 90, { start: 0.4, end: 0.71 });
    expect(gradientTextPlacement(frame, text, 90, { start: 0.4, end: 0.709999 })).toBeNull();
  });

  it.each([0, 90, 180, 270])('keeps an exact inset-edge fit finite at %s degrees', angle => {
    checkCorners({ width: 100, height: 100 }, { width: 20, height: 20 }, angle, {
      start: 0.6600000000000001,
      end: 1,
    });
  });

  it('refuses an interval that cannot be reached without crossing the board inset', () => {
    expect(
      gradientTextPlacement({ width: 100, height: 100 }, { width: 20, height: 20 }, 90, {
        start: 0,
        end: 0.3,
      })
    ).toBeNull();
  });

  it('refuses text that cannot fit the declared interval or the inset board', () => {
    expect(gradientTextPlacement(frame, text, 45, { start: 0.5, end: 0.52 })).toBeNull();
    expect(gradientTextPlacement({ width: 143, height: 80 }, text, 90, full)).toBeNull();
    expect(gradientTextPlacement({ width: 200, height: 55 }, text, 0, full)).toBeNull();
  });

  it('uses fresh mobile dimensions and refuses a sample that stops fitting after resize', () => {
    const desktop = { width: 640, height: 180 };
    const mobile = { width: 200, height: 180 };
    const sample = { width: 80, height: 24 };
    const footprint = { start: 0.1, end: 0.35 };
    checkCorners(desktop, sample, 90, footprint);
    expect(gradientTextPlacement(mobile, sample, 90, footprint)).toBeNull();
    checkCorners(mobile, sample, 35, full);
  });

  it('accepts fractional measurements and a small board that exactly fits the inset', () => {
    const measured = { width: 72.5, height: 20.25 };
    const placement = checkCorners({ width: 96.5, height: 44.25 }, measured, 32.5, full);
    expect(placement.left).toBe(12);
    expect(placement.top).toBe(12);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('refuses invalid dimensions: %s', value => {
    for (const dimension of ['width', 'height'] as const) {
      expect(gradientTextPlacement({ ...frame, [dimension]: value }, text, 90, full)).toBeNull();
      expect(gradientTextPlacement(frame, { ...text, [dimension]: value }, 90, full)).toBeNull();
    }
  });

  it.each([NaN, Infinity, -Infinity])('refuses invalid angles: %s', angle => {
    expect(gradientTextPlacement(frame, text, angle, full)).toBeNull();
  });

  it('refuses finite dimensions that overflow the gradient geometry', () => {
    expect(
      gradientTextPlacement({ width: Number.MAX_VALUE, height: Number.MAX_VALUE }, text, 45, full)
    ).toBeNull();
  });

  it.each([
    { start: -0.01, end: 1 },
    { start: 0, end: 1.01 },
    { start: 0.8, end: 0.2 },
    { start: 0.5, end: 0.5 },
    { start: NaN, end: 1 },
    { start: 0, end: NaN },
    { start: -Infinity, end: 1 },
    { start: 0, end: Infinity },
  ])('refuses invalid coverage: %j', footprint => {
    expect(gradientTextPlacement(frame, text, 90, footprint)).toBeNull();
  });
});
