/** Native paint geometry shared by captured comparisons and source-linked edits. */
export type NativeGradientPointV1 = { x: number; y: number };
export type NativeGradientStopV1 = {
  position: number;
  color: { r: number; g: number; b: number; a: number };
};
type Point = NativeGradientPointV1;
type Stop = NativeGradientStopV1;
type Data = Record<string, unknown>;
const object = (value: unknown): Data | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Data) : null;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const unit = (value: unknown): value is number => finite(value) && value >= 0 && value <= 1;

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Paint serialization only; capture authority, source rules and contrast belong to callers. */
export function serializeNativeGradientSvgV1(
  paint: Data,
  width: number,
  height: number,
  options: { label: string; description: string; gradientId?: string; nativeEdit?: boolean }
): string {
  if (![width, height].every(n => Number.isFinite(n) && n > 0 && n <= 10000))
    throw new Error('Invalid native gradient SVG dimensions.');
  const id = options.gradientId ?? 'native-gradient';
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(id))
    throw new Error('Invalid native gradient SVG identity.');
  const parsed = inspectNativeGradientPaintV1(paint, options.nativeEdit);
  if (parsed.issues.length) throw new Error(parsed.issues[0]);
  const [p, q, r] = parsed.handles;
  const matrix = [
    width * (q.x - p.x),
    height * (q.y - p.y),
    width * (r.x - p.x),
    height * (r.y - p.y),
    width * p.x,
    height * p.y,
  ].join(' ');
  const stops = parsed.stops
    .map(
      stop =>
        `<stop offset="${stop.position}" stop-color="rgb(${[stop.color.r, stop.color.g, stop.color.b].map(c => `${c * 100}%`).join(', ')})"${stop.color.a === 1 ? '' : ` stop-opacity="${stop.color.a}"`}/>`
    )
    .join('');
  const radial = paint.type === 'GRADIENT_RADIAL';
  const type = radial ? 'radialGradient' : 'linearGradient';
  const axes = radial ? 'cx="0" cy="0" fx="0" fy="0" r="1"' : 'x1="0" y1="0" x2="1" y2="0"';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escape(options.label)}</title><desc>${escape(options.description)}</desc><defs><${type} id="${id}" gradientUnits="userSpaceOnUse" color-interpolation="sRGB" spreadMethod="pad" ${axes} gradientTransform="matrix(${matrix})">${stops}</${type}></defs><rect width="${width}" height="${height}" fill="url(#${id})"/></svg>`;
}

export function nativeGradientProfileIssuesV1(value: Data): string[] {
  return ['colorProfile', 'colorSpace'].flatMap(key =>
    value[key] !== undefined && !['srgb', 'SRGB'].includes(String(value[key]))
      ? [`Recorded ${key} is unsupported; native channels have not been converted.`]
      : []
  );
}
export function inspectNativeGradientPaintV1(
  paint: Data,
  nativeEdit = false
): { handles: Point[]; stops: Stop[]; issues: string[] } {
  const issues = nativeGradientProfileIssuesV1(paint);
  if (!['GRADIENT_LINEAR', 'GRADIENT_RADIAL'].includes(String(paint.type)))
    issues.push('This native gradient type has no verified comparison renderer.');
  if (paint.visible !== undefined && paint.visible !== true)
    issues.push('The native paint is hidden or has unknown visibility.');
  if (paint.opacity !== undefined && paint.opacity !== 1)
    issues.push('Paint opacity requires a declared backdrop and compositing proof.');
  if (paint.blendMode !== undefined && paint.blendMode !== 'NORMAL')
    issues.push('Paint blending requires a flattened source rendering.');
  if (
    Object.keys(paint).some(
      key =>
        ![
          'type',
          'visible',
          'opacity',
          'blendMode',
          'gradientHandlePositions',
          'gradientStops',
          'boundVariables',
          'colorProfile',
          'colorSpace',
        ].includes(key)
    )
  )
    issues.push('Unknown native paint properties remain in the original capture.');
  const handles = paint.gradientHandlePositions;
  const validHandles =
    Array.isArray(handles) &&
    handles.length === 3 &&
    handles.every(raw => {
      const point = object(raw);
      return (
        point &&
        Object.keys(point).length === 2 &&
        finite(point.x) &&
        finite(point.y) &&
        Math.abs(point.x) <= 1e6 &&
        Math.abs(point.y) <= 1e6
      );
    });
  if (!validHandles)
    issues.push(
      'Three bounded finite native handles are required; no handles are inferred or clamped.'
    );
  const stops = paint.gradientStops;
  const validStops =
    Array.isArray(stops) &&
    stops.length >= 2 &&
    stops.length <= 256 &&
    stops.every((raw, index) => {
      const stop = object(raw),
        color = object(stop?.color);
      return (
        stop &&
        Object.keys(stop).every(key => ['position', 'color', 'boundVariables'].includes(key)) &&
        unit(stop.position) &&
        (index === 0 ||
          (nativeEdit
            ? (object(stops[index - 1])!.position as number) <= stop.position
            : (object(stops[index - 1])!.position as number) < stop.position)) &&
        color &&
        Object.keys(color).every(key => ['r', 'g', 'b', 'a'].includes(key)) &&
        [color.r, color.g, color.b].every(unit) &&
        (nativeEdit ? unit(color.a) : color.a === 1)
      );
    });
  if (!validStops)
    issues.push(
      nativeEdit
        ? 'Native edits require 2–256 ordered sRGB stops with finite RGBA channels.'
        : 'Comparison requires 2–256 ordered opaque native stops; duplicates, alpha and malformed values remain unsupported.'
    );
  if (validHandles) {
    const [p, q, r] = handles as Point[];
    const ux = q.x - p.x,
      uy = q.y - p.y,
      vx = r.x - p.x,
      vy = r.y - p.y;
    const scale = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (!Number.isFinite(scale) || scale === 0 || Math.abs(ux * vy - uy * vx) <= scale * 1e-10)
      issues.push('Native handles are singular or too ill-conditioned to render reliably.');
    if (paint.type === 'GRADIENT_LINEAR' && Math.abs(ux * vx + uy * vy) > scale * 1e-10)
      issues.push(
        'Skewed linear handle semantics need an independent native render; the third handle is not discarded.'
      );
  }
  return {
    handles: validHandles ? (handles as Point[]) : [],
    stops: validStops ? (stops as Stop[]) : [],
    issues,
  };
}
