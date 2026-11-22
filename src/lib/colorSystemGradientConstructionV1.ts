/** Native samples propose paint; only a separate continuous assessment certifies fidelity. */
import type { GradientInputV1, GradientStopV1, GradientPaintStopV1 } from './colorSystemGradientV1';
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import { mapOklchToNativeSrgbV1 } from './colorScale';
import {
  buildColorSystemSrgbValueV1,
  normalizeColorSystemSrgbValueV1,
  colorSystemRgbDeltaEOKV1,
  colorSystemSrgbToOklchV1,
} from './colorSystemSrgbValueV1';
import { oklabToOklch, rgbToOklab } from './utils';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';
type RGB = ColorSystemColorValueV2['components'];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const rgb255 = (c: RGB) => ({ r: c.r * 255, g: c.g * 255, b: c.b * 255 });
const mixRgb = (a: RGB, b: RGB, t: number): RGB => ({
  r: mix(a.r, b.r, t),
  g: mix(a.g, b.g, t),
  b: mix(a.b, b.b, t),
});

export function normalizeGradientInputV1(raw: GradientInputV1): GradientInputV1 {
  const input = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 64_000 }) as GradientInputV1;
  if (
    !input ||
    !/^sha256:[a-f0-9]{64}$/.test(input.sourceModelHash) ||
    !/^sha256:[a-f0-9]{64}$/.test(input.briefHash)
  )
    throw new Error('A gradient must bind its source model and brief.');
  if (!Number.isFinite(input.angleDegrees) || input.angleDegrees < 0 || input.angleDegrees >= 360)
    throw new Error('Gradient angle must be from 0 up to, but not including, 360 degrees.');
  if (!Array.isArray(input.stops) || input.stops.length < 2 || input.stops.length > 5)
    throw new Error('Use two to five authored gradient stops.');
  const route = input.route;
  if (
    !route ||
    (route.space !== 'oklab' && route.space !== 'oklch') ||
    (route.space === 'oklch' && route.huePath !== 'shorter' && route.huePath !== 'longer')
  )
    throw new Error('Choose an explicit supported interpolation route.');
  const stops = input.stops.map((stop, index) => {
    if (
      !Number.isFinite(stop.position) ||
      stop.position < 0 ||
      stop.position > 1 ||
      (index > 0 && stop.position <= input.stops[index - 1].position)
    )
      throw new Error('Stop positions must increase strictly from 0 to 1.');
    if (
      typeof stop.locked !== 'boolean' ||
      (stop.sourceColorId !== null &&
        (typeof stop.sourceColorId !== 'string' ||
          !stop.sourceColorId ||
          stop.sourceColorId.length > 128))
    )
      throw new Error('Each stop requires a source reference or an explicit proposed value.');
    const value = normalizeColorSystemSrgbValueV1(stop.value);
    if (value.alpha !== 1) throw new Error('Only opaque gradient stops are supported.');
    return {
      position: stop.position,
      value,
      sourceColorId: stop.sourceColorId,
      locked: stop.locked,
    };
  });
  if (stops[0].position !== 0 || stops[stops.length - 1].position !== 1)
    throw new Error('The first and last stops must be at 0 and 1.');
  return {
    sourceModelHash: input.sourceModelHash,
    briefHash: input.briefHash,
    angleDegrees: input.angleDegrees,
    stops,
    route:
      route.space === 'oklab' ? { space: 'oklab' } : { space: 'oklch', huePath: route.huePath },
  };
}

function routeValue(
  a: GradientStopV1,
  b: GradientStopV1,
  t: number,
  route: GradientInputV1['route']
): ColorSystemColorValueV2 {
  // Anchors retain the original native channels, including byte-based representations.
  if (t === 0) return a.value;
  if (t === 1) return b.value;
  let target;
  if (route.space === 'oklab') {
    const left = rgbToOklab(
      a.value.components.r * 255,
      a.value.components.g * 255,
      a.value.components.b * 255
    );
    const right = rgbToOklab(
      b.value.components.r * 255,
      b.value.components.g * 255,
      b.value.components.b * 255
    );
    target = oklabToOklch(
      mix(left.L, right.L, t),
      mix(left.a, right.a, t),
      mix(left.b, right.b, t)
    );
  } else {
    const left = colorSystemSrgbToOklchV1(a.value);
    const right = colorSystemSrgbToOklchV1(b.value);
    // An achromatic endpoint borrows the other hue; a neutral must not introduce a wheel rotation.
    if (left.c < 1e-6) left.h = right.h;
    if (right.c < 1e-6) right.h = left.h;
    let delta = ((right.h - left.h + 540) % 360) - 180;
    if (route.huePath === 'longer' && Math.abs(delta) > 1e-9) delta += delta > 0 ? -360 : 360;
    target = {
      l: mix(left.l, right.l, t),
      c: mix(left.c, right.c, t),
      h: (((left.h + delta * t) % 360) + 360) % 360,
    };
  }
  return buildColorSystemSrgbValueV1(mapOklchToNativeSrgbV1(target).components);
}

export function compileGradientSampledPaintV1(
  raw: GradientInputV1,
  constructionTarget: 0.005 | 0.0025 | 0.001
) {
  if (![0.005, 0.0025, 0.001].includes(constructionTarget))
    throw new Error('Unsupported gradient construction target.');
  const input = normalizeGradientInputV1(raw);
  const oracle: GradientPaintStopV1[] = [];
  for (let index = 0; index < input.stops.length - 1; index++) {
    const a = input.stops[index];
    const b = input.stops[index + 1];
    for (let step = 0; step < 4096; step++) {
      const t = step / 4096;
      oracle.push({
        position: mix(a.position, b.position, t),
        value: routeValue(a, b, t, input.route),
      });
    }
  }
  const last = input.stops[input.stops.length - 1];
  oracle.push({ position: last.position, value: last.value });
  const selected = input.stops.map((_, index) => index * 4096);
  let maxError = 0;
  while (true) {
    maxError = 0;
    let worst = -1;
    for (let segment = 0; segment < selected.length - 1; segment++) {
      const start = selected[segment];
      const end = selected[segment + 1];
      for (let index = start + 1; index < end; index++) {
        const t =
          (oracle[index].position - oracle[start].position) /
          (oracle[end].position - oracle[start].position);
        const actual = mixRgb(oracle[start].value.components, oracle[end].value.components, t);
        const error = colorSystemRgbDeltaEOKV1(
          rgb255(actual),
          rgb255(oracle[index].value.components)
        );
        if (error > maxError) {
          maxError = error;
          worst = index;
        }
      }
    }
    if (maxError <= constructionTarget) break;
    if (selected.length >= 64 || worst < 0)
      throw new Error(
        'This route exceeds the gradient stop budget. Choose a shorter route or closer colors.'
      );
    selected.push(worst);
    selected.sort((a, b) => a - b);
  }
  return { input, stops: selected.map(index => oracle[index]), maximumObserved: maxError };
}
