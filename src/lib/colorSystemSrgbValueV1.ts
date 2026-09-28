import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import { canonicalJson, canonicalNumber, deterministicContentHash } from './colorSystemHashing';
import { hexToRgb, oklabToOklch, rgbToHex, rgbToOklab, type OKLCH, type RGB } from './utils';

type Components = ColorSystemColorValueV2['components'];
const CHANNELS = ['r', 'g', 'b'] as const;

function assertChannels(components: Components, alpha: number): void {
  if (
    !components ||
    typeof components !== 'object' ||
    Array.isArray(components) ||
    Object.keys(components).length !== 3 ||
    Object.keys(components).some(key => !CHANNELS.includes(key as (typeof CHANNELS)[number])) ||
    CHANNELS.some(
      channel =>
        !Number.isFinite(components[channel]) || components[channel] < 0 || components[channel] > 1
    ) ||
    !Number.isFinite(alpha) ||
    alpha < 0 ||
    alpha > 1
  ) {
    throw new Error('sRGB components and alpha must be finite values from zero through one.');
  }
}

/** Source numbers are data, unlike the rounded results of perceptual calculations. */
export function colorSystemExactSrgbValueHashV1(components: Components, alpha: number): string {
  assertChannels(components, alpha);
  return deterministicContentHash(
    canonicalJson({
      components: { r: components.r, g: components.g, b: components.b },
      alpha,
    })
  );
}

export function colorSystemSrgbNeedsNativeRepresentationV1(
  components: Components,
  alpha: number
): boolean {
  assertChannels(components, alpha);
  return (
    CHANNELS.some(channel => components[channel] !== Math.round(components[channel] * 255) / 255) ||
    alpha !== canonicalNumber(alpha)
  );
}

/** Byte-based colors keep their existing shape and hashes. Native values keep their actual channels. */
export function buildColorSystemSrgbValueV1(
  components: Components,
  alpha = 1
): ColorSystemColorValueV2 {
  assertChannels(components, alpha);
  const hex = rgbToHex(
    ...(CHANNELS.map(channel => Math.round(components[channel] * 255)) as [number, number, number])
  ).toUpperCase();
  return {
    colorSpace: 'srgb',
    hex,
    components: { r: components.r, g: components.g, b: components.b },
    alpha,
    ...(colorSystemSrgbNeedsNativeRepresentationV1(components, alpha)
      ? {
          representation: {
            kind: 'native-srgb' as const,
            exactValueHash: colorSystemExactSrgbValueHashV1(components, alpha),
          },
        }
      : {}),
  };
}

export function normalizeColorSystemSrgbValueV1(
  value: ColorSystemColorValueV2
): ColorSystemColorValueV2 {
  if (value?.colorSpace !== 'srgb' || !/^#[0-9a-f]{6}$/i.test(value.hex)) {
    throw new Error('A color requires sRGB channels and a six-digit display hex.');
  }
  assertChannels(value.components, value.alpha);
  const hex = value.hex.toUpperCase();
  const expected = hexToRgb(hex);
  if (value.representation === undefined) {
    if (colorSystemSrgbNeedsNativeRepresentationV1(value.components, value.alpha)) {
      throw new Error(
        'Native sRGB components or alpha require a bound native-srgb representation.'
      );
    }
    if (CHANNELS.some(channel => value.components[channel] !== expected[channel] / 255)) {
      throw new Error('Color component does not match the exact sRGB hex channel.');
    }
    return { colorSpace: 'srgb', hex, components: { ...value.components }, alpha: value.alpha };
  }
  const representation = value.representation;
  if (
    representation === null ||
    typeof representation !== 'object' ||
    (Object.getPrototypeOf(representation) !== Object.prototype &&
      Object.getPrototypeOf(representation) !== null) ||
    Object.keys(representation).some(key => key !== 'kind' && key !== 'exactValueHash') ||
    representation.kind !== 'native-srgb' ||
    representation.exactValueHash !==
      colorSystemExactSrgbValueHashV1(value.components, value.alpha) ||
    CHANNELS.some(channel => Math.round(value.components[channel] * 255) !== expected[channel])
  ) {
    throw new Error(
      'Native sRGB representation must bind the exact channels and their display approximation.'
    );
  }
  return {
    colorSpace: 'srgb',
    hex,
    components: { ...value.components },
    alpha: value.alpha,
    representation: { kind: 'native-srgb', exactValueHash: representation.exactValueHash },
  };
}

export function colorSystemSrgbToRgbV1(value: Pick<ColorSystemColorValueV2, 'components'>): RGB {
  return { r: value.components.r * 255, g: value.components.g * 255, b: value.components.b * 255 };
}

/** Composite unrounded sRGB channels on an opaque ground. Inputs use the existing 0–255 RGB type. */
export function compositeColorSystemRgbV1(foreground: RGB, alpha: number, background: RGB): RGB {
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
  };
}

export function colorSystemRgbDeltaEOKV1(left: RGB, right: RGB): number {
  const first = rgbToOklab(left.r, left.g, left.b);
  const second = rgbToOklab(right.r, right.g, right.b);
  return Math.hypot(first.L - second.L, first.a - second.a, first.b - second.b);
}

export function colorSystemSrgbToOklchV1(
  value: Pick<ColorSystemColorValueV2, 'components'>
): OKLCH {
  const rgb = colorSystemSrgbToRgbV1(value);
  const lab = rgbToOklab(rgb.r, rgb.g, rgb.b);
  return oklabToOklch(lab.L, lab.a, lab.b);
}

/** CSS Color 4 represents normalized source channels without eight-bit quantization. */
export function colorSystemSrgbToCssV1(value: ColorSystemColorValueV2): string {
  if (value.representation?.kind === 'native-srgb') {
    return `color(srgb ${value.components.r} ${value.components.g} ${value.components.b} / ${value.alpha})`;
  }
  if (value.alpha >= 1) return value.hex;
  return `rgb(${CHANNELS.map(channel => Math.round(value.components[channel] * 255)).join(' ')} / ${value.alpha})`;
}
