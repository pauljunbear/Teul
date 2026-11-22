type Size = { width: number; height: number };
type Coverage = { start: number; end: number };

const BOARD_INSET = 12;
const GLYPH_ALLOWANCE = 2;

/** Positions the measured text without resizing it; coverage includes possible glyph overhang. */
export function gradientTextPlacement(
  frame: Size,
  text: Size,
  angleDegrees: number,
  footprint: Coverage
): { left: number; top: number; coverage: Coverage } | null {
  if (
    ![frame.width, frame.height, text.width, text.height].every(
      value => Number.isFinite(value) && value > 0
    ) ||
    ![angleDegrees, footprint.start, footprint.end].every(Number.isFinite) ||
    footprint.start < 0 ||
    footprint.end > 1 ||
    footprint.start >= footprint.end
  )
    return null;

  const xLimit = (frame.width - text.width) / 2 - BOARD_INSET;
  const yLimit = (frame.height - text.height) / 2 - BOARD_INSET;
  if (xLimit < 0 || yLimit < 0) return null;

  const angle = ((((angleDegrees % 360) + 360) % 360) * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  // CSS gradient stops lie along this line through the frame center, including oblique angles.
  const lineLength = Math.abs(dx) * frame.width + Math.abs(dy) * frame.height;
  const radius =
    Math.abs(dx) * (text.width / 2 + GLYPH_ALLOWANCE) +
    Math.abs(dy) * (text.height / 2 + GLYPH_ALLOWANCE);
  const minimum = (footprint.start - 0.5) * lineLength + radius;
  const maximum = (footprint.end - 0.5) * lineLength - radius;
  const boardReach = Math.abs(dx) * xLimit + Math.abs(dy) * yLimit;
  if (![lineLength, radius, minimum, maximum, boardReach].every(Number.isFinite)) return null;

  const lower = Math.max(minimum, -boardReach);
  const upper = Math.min(maximum, boardReach);
  const tolerance = Number.EPSILON * lineLength * 8;
  // Decimal range endpoints can disagree by a few floating-point units at an exact fit.
  if (lower - upper > tolerance) return null;

  const nearest = lower > upper ? lower / 2 + upper / 2 : Math.max(lower, Math.min(upper, 0));
  const target = Math.max(-boardReach, Math.min(boardReach, nearest));
  const scale = target / (dx * dx + dy * dy);
  let x = dx * scale;
  let y = dy * scale;
  // Project onto the nearest coverage boundary, then its intersection with an inset edge.
  // Feasibility above ensures at most one edge must constrain the closest point.
  if (Math.abs(x) > xLimit + tolerance) {
    x = Math.sign(x) * xLimit;
    y = (target - dx * x) / dy;
  } else if (Math.abs(y) > yLimit + tolerance) {
    y = Math.sign(y) * yLimit;
    x = (target - dy * y) / dx;
  }
  x = Math.max(-xLimit, Math.min(xLimit, x));
  y = Math.max(-yLimit, Math.min(yLimit, y));

  const projection = dx * x + dy * y;
  return {
    left: (frame.width - text.width) / 2 + x,
    top: (frame.height - text.height) / 2 + y,
    coverage: {
      start: 0.5 + (projection - radius) / lineLength,
      end: 0.5 + (projection + radius) / lineLength,
    },
  };
}
