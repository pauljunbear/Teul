/** Serializers for validated opaque paint. They do not authorize source use or export. */
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import type { GradientPaintStopV1 } from './colorSystemGradientV1';
import { canonicalNumber } from './colorSystemHashing';
const CHANNELS = ['r', 'g', 'b'] as const;
export interface GradientPaintViewV1 {
  angleDegrees: number;
  compiledPaint: { stops: readonly GradientPaintStopV1[] };
}
// Percent sRGB channels keep native precision and work in SVG consumers that lack color(srgb ...).
const rgbCss = (value: ColorSystemColorValueV2) =>
  `rgb(${CHANNELS.map(key => `${value.components[key] * 100}%`).join(', ')})`;
export function serializeGradientCssV1(design: GradientPaintViewV1): string {
  return `linear-gradient(${design.angleDegrees}deg in srgb, ${design.compiledPaint.stops.map(stop => `${rgbCss(stop.value)} ${stop.position * 100}%`).join(', ')})`;
}
export function serializeGradientSvgV1(
  design: GradientPaintViewV1,
  width = 800,
  height = 480
): string {
  if (![width, height].every(n => Number.isFinite(n) && n > 0 && n <= 10000))
    throw new Error('Invalid SVG dimensions.');
  const angle = (design.angleDegrees * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const halfLength = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const stops = design.compiledPaint.stops
    .map(stop => `<stop offset="${stop.position}" stop-color="${rgbCss(stop.value)}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="teul-gradient" gradientUnits="userSpaceOnUse" color-interpolation="sRGB" x1="${canonicalNumber(width / 2 - halfLength * dx)}" y1="${canonicalNumber(height / 2 - halfLength * dy)}" x2="${canonicalNumber(width / 2 + halfLength * dx)}" y2="${canonicalNumber(height / 2 + halfLength * dy)}">${stops}</linearGradient></defs><rect width="${width}" height="${height}" fill="url(#teul-gradient)"/></svg>`;
}
