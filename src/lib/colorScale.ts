import {
  getLuminance,
  hexToOklch,
  hexToRgb,
  oklabToOklch,
  oklchToOklab,
  rgbToHex,
  rgbToOklab,
  type OKLCH,
} from './utils';
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import {
  colorSystemSrgbToOklchV1,
  colorSystemSrgbToRgbV1,
  normalizeColorSystemSrgbValueV1,
} from './colorSystemSrgbValueV1';

export type ColorScaleMode = 'light' | 'dark';

interface ColorStep {
  step: number;
  hex: string;
  /** Present only when the display hex is an approximation of exact native channels. */
  value?: ColorSystemColorValueV2;
  /** Fixed step endpoints used to derive this generated step. */
  sourceAnchorSteps?: readonly [number, number];
  /** Exact coordinates requested before gamut mapping for this finalized step. */
  requestedOklch: OKLCH;
  /** Exact coordinates returned by Local MINDE before hex quantization. */
  mappedOklch: OKLCH;
  oklch: OKLCH;
  usage: string;
  gamutMapped: boolean;
}

interface ScaleContrastCheck {
  foregroundStep: number;
  backgroundStep: number;
  useCase: string;
  minimumRatio: number;
  required: boolean;
  ratio: number;
  pass: boolean;
}

type ScaleValidationIssueCode =
  | 'anchor-moved'
  | 'duplicate-adjacent'
  | 'non-finite'
  | 'non-monotonic-lightness'
  | 'non-monotonic-relative-luminance'
  | 'required-contrast-failure';

interface ScaleValidationIssue {
  code: ScaleValidationIssueCode;
  message: string;
  steps?: number[];
}

export interface ColorScaleValidation {
  valid: boolean;
  anchorPreserved: boolean;
  finite: boolean;
  inSrgbGamut: boolean;
  monotonicLightness: boolean;
  monotonicRelativeLuminance: boolean;
  uniqueAdjacentSteps: boolean;
  requiredContrastPass: boolean;
  gamutMappedSteps: number[];
  contrast: ScaleContrastCheck[];
  issues: ScaleValidationIssue[];
}

export interface ColorScale {
  name: string;
  baseHex: string;
  baseValue?: ColorSystemColorValueV2;
  steps: ColorStep[];
  mode: ColorScaleMode;
  profile: 'sRGB';
  method: 'Teul OKLCH v3';
  sourcePinPolicy?: 'source-anchored-oklch-v1';
  anchorStep: 9;
  validation: ColorScaleValidation;
}

const STEP_USAGE: Record<number, string> = {
  1: 'App background',
  2: 'Subtle background',
  3: 'UI element background',
  4: 'Hovered UI element background',
  5: 'Active/Selected UI element background',
  6: 'Subtle borders and separators',
  7: 'UI element border and focus rings',
  8: 'Hovered UI element border',
  9: 'Solid backgrounds',
  10: 'Hovered solid backgrounds',
  11: 'Low-contrast text',
  12: 'High-contrast text',
};

const CHROMA_MULTIPLIERS = [0.025, 0.05, 0.1, 0.17, 0.25, 0.36, 0.52, 0.72, 1, 0.92, 0.72, 0.52];
const EPSILON = 0.00001;
const LOCAL_MINDE_JND = 0.02;
const LOCAL_MINDE_EPSILON = 0.0001;

interface RawRgb {
  r: number;
  g: number;
  b: number;
}

interface ClippedSrgb {
  rgb: RawRgb;
  hex: string;
  oklch: OKLCH;
  oklab: ReturnType<typeof rgbToOklab>;
}

function normalizeHex(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r, g, b).toLowerCase();
}

function linearToSrgbFloat(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function oklchToRawSrgb(l: number, c: number, h: number): RawRgb {
  const { L, a, b } = oklchToOklab(l, c, h);
  const lPrime = L + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = L - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = L - 0.0894841775 * a - 1.291485548 * b;

  const l3 = lPrime * lPrime * lPrime;
  const m3 = mPrime * mPrime * mPrime;
  const s3 = sPrime * sPrime * sPrime;

  const linearR = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const linearG = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const linearB = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return {
    r: linearToSrgbFloat(linearR) * 255,
    g: linearToSrgbFloat(linearG) * 255,
    b: linearToSrgbFloat(linearB) * 255,
  };
}

function isFiniteOklch(color: OKLCH): boolean {
  return Number.isFinite(color.l) && Number.isFinite(color.c) && Number.isFinite(color.h);
}

export function isOklchInSrgbGamut(color: OKLCH): boolean {
  if (!isFiniteOklch(color)) return false;
  const rgb = oklchToRawSrgb(color.l, color.c, color.h);
  return (
    rgb.r >= -EPSILON &&
    rgb.r <= 255 + EPSILON &&
    rgb.g >= -EPSILON &&
    rgb.g <= 255 + EPSILON &&
    rgb.b >= -EPSILON &&
    rgb.b <= 255 + EPSILON
  );
}

function normalizeHue(hue: number): number {
  const wrapped = hue % 360;
  if (Object.is(wrapped, -0)) return 0;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function clampChannel(channel: number): number {
  return Math.max(0, Math.min(255, channel));
}

function clipOklchToSrgb(color: OKLCH): ClippedSrgb {
  const raw = oklchToRawSrgb(color.l, color.c, color.h);
  const clipped = {
    r: clampChannel(raw.r),
    g: clampChannel(raw.g),
    b: clampChannel(raw.b),
  };
  const oklab = rgbToOklab(clipped.r, clipped.g, clipped.b);

  return {
    rgb: clipped,
    hex: rgbToHex(
      Math.round(clipped.r),
      Math.round(clipped.g),
      Math.round(clipped.b)
    ).toLowerCase(),
    oklch: oklabToOklch(oklab.L, oklab.a, oklab.b),
    oklab,
  };
}

function deltaEOK(
  first: ReturnType<typeof rgbToOklab>,
  second: ReturnType<typeof rgbToOklab>
): number {
  return Math.sqrt(
    Math.pow(first.L - second.L, 2) +
      Math.pow(first.a - second.a, 2) +
      Math.pow(first.b - second.b, 2)
  );
}

function deltaFromClippedSrgb(color: OKLCH, clipped: ClippedSrgb): number {
  const oklab = oklchToOklab(color.l, color.c, color.h);
  return deltaEOK(clipped.oklab, oklab);
}

/**
 * Maps an individual SDR OKLCH color to sRGB using CSS Color 4's Binary Search
 * Gamut Mapping with Local MINDE. In-gamut colors are unchanged. Out-of-gamut
 * colors reduce chroma at constant lightness and hue until an sRGB clip is less
 * than one deltaEOK JND away (0.02), using the specified 0.0001 epsilon.
 */
function mapOklchToSrgbChannels(color: OKLCH): {
  oklch: OKLCH;
  hex: string;
  mapped: boolean;
  rgb: RawRgb;
} {
  if (!isFiniteOklch(color)) {
    throw new Error('OKLCH values must be finite.');
  }

  const hue = normalizeHue(color.h);
  if (color.l >= 1) {
    return {
      oklch: { l: 1, c: 0, h: hue },
      hex: '#ffffff',
      mapped: color.l !== 1 || color.c !== 0 || color.h !== hue,
      rgb: { r: 255, g: 255, b: 255 },
    };
  }
  if (color.l <= 0) {
    return {
      oklch: { l: 0, c: 0, h: hue },
      hex: '#000000',
      mapped: color.l !== 0 || color.c !== 0 || color.h !== hue,
      rgb: { r: 0, g: 0, b: 0 },
    };
  }

  const safe: OKLCH = {
    l: color.l,
    c: Math.max(0, color.c),
    h: hue,
  };

  const normalized = safe.c !== color.c || safe.h !== color.h;
  if (isOklchInSrgbGamut(safe)) {
    const raw = oklchToRawSrgb(safe.l, safe.c, safe.h);
    return {
      oklch: safe,
      hex: rgbToHex(
        Math.round(clampChannel(raw.r)),
        Math.round(clampChannel(raw.g)),
        Math.round(clampChannel(raw.b))
      ).toLowerCase(),
      mapped: normalized,
      rgb: { r: clampChannel(raw.r), g: clampChannel(raw.g), b: clampChannel(raw.b) },
    };
  }

  let current = safe;
  let clipped = clipOklchToSrgb(current);
  if (deltaFromClippedSrgb(current, clipped) < LOCAL_MINDE_JND) {
    return { oklch: clipped.oklch, hex: clipped.hex, mapped: true, rgb: clipped.rgb };
  }

  let min = 0;
  let max = safe.c;
  let minInGamut = true;

  // Typical sRGB inputs converge in fewer than 16 passes. The finite cap also
  // makes this total for arbitrarily large-but-finite chroma supplied to the
  // exported helper.
  for (let iteration = 0; iteration < 2048 && max - min > LOCAL_MINDE_EPSILON; iteration++) {
    const chroma = (min + max) / 2;
    if (chroma === min || chroma === max) break;
    current = { ...safe, c: chroma };

    if (minInGamut && isOklchInSrgbGamut(current)) {
      min = chroma;
      continue;
    }

    clipped = clipOklchToSrgb(current);
    const difference = deltaFromClippedSrgb(current, clipped);
    if (difference < LOCAL_MINDE_JND) {
      if (LOCAL_MINDE_JND - difference < LOCAL_MINDE_EPSILON) {
        return { oklch: clipped.oklch, hex: clipped.hex, mapped: true, rgb: clipped.rgb };
      }
      minInGamut = false;
      min = chroma;
    } else {
      max = chroma;
    }
  }

  return { oklch: clipped.oklch, hex: clipped.hex, mapped: true, rgb: clipped.rgb };
}

/** Existing byte-based contract remains exact; native construction uses the same mapping below. */
export function mapOklchToSrgb(color: OKLCH): { oklch: OKLCH; hex: string; mapped: boolean } {
  const { oklch, hex, mapped } = mapOklchToSrgbChannels(color);
  return { oklch, hex, mapped };
}

/** Preserve mapped channels before display-hex rounding, so close native anchors remain usable. */
export function mapOklchToNativeSrgbV1(color: OKLCH): {
  components: ColorSystemColorValueV2['components'];
  mapped: boolean;
} {
  const { rgb, mapped } = mapOklchToSrgbChannels(color);
  return { components: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 }, mapped };
}

function interpolate(start: number, end: number, index: number, count: number): number {
  return start + ((end - start) * index) / count;
}

function getLightnessTargets(baseLightness: number, mode: ColorScaleMode): number[] {
  if (mode === 'light') {
    const first = Math.min(0.995, Math.max(0.985, baseLightness + 0.12));
    const last = Math.max(0.015, Math.min(0.22, baseLightness - 0.24));
    return [
      ...Array.from({ length: 8 }, (_, index) => interpolate(first, baseLightness, index, 8)),
      baseLightness,
      interpolate(baseLightness, last, 1, 3),
      interpolate(baseLightness, last, 2, 3),
      last,
    ];
  }

  const first = Math.max(0.015, Math.min(0.1, baseLightness - 0.12));
  const last = Math.min(0.985, Math.max(0.93, baseLightness + 0.24));
  return [
    ...Array.from({ length: 8 }, (_, index) => interpolate(first, baseLightness, index, 8)),
    baseLightness,
    interpolate(baseLightness, last, 1, 3),
    interpolate(baseLightness, last, 2, 3),
    last,
  ];
}

function finalOklch(hex: string): OKLCH {
  const { r, g, b } = hexToRgb(hex);
  const lab = rgbToOklab(r, g, b);
  return oklabToOklch(lab.L, lab.a, lab.b);
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return getLuminance(r, g, b);
}

const stepHex = (step: ColorStep): string => step.hex;
const stepLuminance = (step: ColorStep): number => relativeLuminance(step.hex);

function createGeneratedStep(step: number, lightness: number, baseOklch: OKLCH): ColorStep {
  const requestedOklch = {
    l: lightness,
    c: baseOklch.c * CHROMA_MULTIPLIERS[step - 1],
    h: baseOklch.h,
  };
  const mapped = mapOklchToSrgb(requestedOklch);
  return {
    step,
    hex: mapped.hex,
    requestedOklch,
    mappedOklch: mapped.oklch,
    oklch: finalOklch(mapped.hex),
    usage: STEP_USAGE[step],
    gamutMapped: mapped.mapped,
  };
}

function refineStructuralOrder(
  initialSteps: ColorStep[],
  baseOklch: OKLCH,
  mode: ColorScaleMode,
  luminance = stepLuminance,
  identity = stepHex
): ColorStep[] {
  const steps = [...initialSteps];
  const preDirection = mode === 'light' ? 1 : -1;
  const postDirection = -preDirection;
  const ordered = (first: ColorStep, second: ColorStep, direction: number) =>
    (first.oklch.l - second.oklch.l) * direction > EPSILON &&
    (luminance(first) - luminance(second)) * direction > EPSILON &&
    identity(first) !== identity(second);

  // Work outward from the preserved anchor so every adjusted step remains on
  // the correct side of its nearest already-validated neighbor.
  for (let index = 7; index >= 0; index--) {
    let candidate = steps[index];
    let lightness = candidate.oklch.l;
    for (
      let attempt = 0;
      attempt < 200 && !ordered(candidate, steps[index + 1], preDirection);
      attempt++
    ) {
      lightness = Math.max(0.001, Math.min(0.999, lightness + preDirection * 0.0025));
      candidate = createGeneratedStep(index + 1, lightness, baseOklch);
    }
    steps[index] = candidate;
  }

  for (let index = 9; index < steps.length; index++) {
    let candidate = steps[index];
    let lightness = candidate.oklch.l;
    for (
      let attempt = 0;
      attempt < 200 && !ordered(candidate, steps[index - 1], postDirection);
      attempt++
    ) {
      lightness = Math.max(0.001, Math.min(0.999, lightness + postDirection * 0.0025));
      candidate = createGeneratedStep(index + 1, lightness, baseOklch);
    }
    steps[index] = candidate;
  }

  return steps;
}

function validateScale(
  baseHex: string,
  steps: ColorStep[],
  mode: ColorScaleMode,
  luminance = stepLuminance,
  identity = stepHex
): ColorScaleValidation {
  const issues: ScaleValidationIssue[] = [];
  const anchorPreserved = !!steps[8] && identity(steps[8]).toLowerCase() === baseHex.toLowerCase();
  const finite = steps.every(step => isFiniteOklch(step.oklch));
  // Generated values are six-digit sRGB; native sources are channel-validated
  // before entering the scale. OKLCH round trips may have tiny boundary errors.
  const inSrgbGamut = steps.every(step => /^#[0-9a-f]{6}$/.test(step.hex));
  const duplicatePairs: number[][] = [];

  for (let index = 1; index < steps.length; index++) {
    if (identity(steps[index - 1]) === identity(steps[index])) {
      duplicatePairs.push([steps[index - 1].step, steps[index].step]);
    }
  }

  const expectedDirection = mode === 'light' ? -1 : 1;
  const monotonicFailures: number[][] = [];
  const relativeLuminanceFailures: number[][] = [];
  for (let index = 1; index < steps.length; index++) {
    const change = steps[index].oklch.l - steps[index - 1].oklch.l;
    if (change * expectedDirection <= EPSILON) {
      monotonicFailures.push([steps[index - 1].step, steps[index].step]);
    }
    const luminanceChange = luminance(steps[index]) - luminance(steps[index - 1]);
    if (luminanceChange * expectedDirection <= EPSILON) {
      relativeLuminanceFailures.push([steps[index - 1].step, steps[index].step]);
    }
  }

  if (!anchorPreserved) {
    issues.push({
      code: 'anchor-moved',
      message: 'Step 9 no longer matches the selected source color.',
      steps: [9],
    });
  }
  if (!finite) {
    issues.push({ code: 'non-finite', message: 'The scale contains a non-finite color value.' });
  }
  if (duplicatePairs.length > 0) {
    issues.push({
      code: 'duplicate-adjacent',
      message: 'Adjacent steps collapse to the same rounded sRGB value.',
      steps: duplicatePairs.flat(),
    });
  }
  if (monotonicFailures.length > 0) {
    issues.push({
      code: 'non-monotonic-lightness',
      message: `Lightness is not strictly ${mode === 'light' ? 'decreasing' : 'increasing'} across the scale.`,
      steps: monotonicFailures.flat(),
    });
  }
  if (relativeLuminanceFailures.length > 0) {
    issues.push({
      code: 'non-monotonic-relative-luminance',
      message: `Final sRGB relative luminance is not strictly ${mode === 'light' ? 'decreasing' : 'increasing'} across the scale.`,
      steps: relativeLuminanceFailures.flat(),
    });
  }

  const contrastTargets = [
    {
      foregroundStep: 9,
      backgroundStep: 1,
      useCase: 'Solid control on app background',
      minimumRatio: 3,
      required: false,
    },
    {
      foregroundStep: 11,
      backgroundStep: 1,
      useCase: 'Body text on app background',
      minimumRatio: 4.5,
      required: true,
    },
    {
      foregroundStep: 12,
      backgroundStep: 1,
      useCase: 'Enhanced text on app background',
      minimumRatio: 7,
      required: true,
    },
  ];
  const contrast = contrastTargets.map(target => {
    const foreground = luminance(steps[target.foregroundStep - 1]);
    const background = luminance(steps[target.backgroundStep - 1]);
    const ratio =
      (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    return { ...target, ratio, pass: ratio >= target.minimumRatio };
  });
  const requiredContrastPass = contrast.filter(check => check.required).every(check => check.pass);
  if (!requiredContrastPass) {
    issues.push({
      code: 'required-contrast-failure',
      message: 'One or more required final WCAG 2.2 text pairings fail.',
      steps: contrast
        .filter(check => check.required && !check.pass)
        .map(check => check.foregroundStep),
    });
  }

  return {
    valid:
      anchorPreserved &&
      finite &&
      inSrgbGamut &&
      duplicatePairs.length === 0 &&
      monotonicFailures.length === 0 &&
      relativeLuminanceFailures.length === 0 &&
      requiredContrastPass,
    anchorPreserved,
    finite,
    inSrgbGamut,
    monotonicLightness: monotonicFailures.length === 0,
    monotonicRelativeLuminance: relativeLuminanceFailures.length === 0,
    uniqueAdjacentSteps: duplicatePairs.length === 0,
    requiredContrastPass,
    gamutMappedSteps: steps.filter(step => step.gamutMapped).map(step => step.step),
    contrast,
    issues,
  };
}

export function generateColorScale(
  baseHex: string,
  mode: ColorScaleMode = 'light',
  name: string = 'Custom'
): ColorScale {
  const normalizedBase = normalizeHex(baseHex);
  const baseOklch = hexToOklch(normalizedBase);
  const lightnessTargets = getLightnessTargets(baseOklch.l, mode);

  const initialSteps = lightnessTargets.map((lightness, index): ColorStep => {
    const step = index + 1;
    if (step === 9) {
      const anchorOklch = finalOklch(normalizedBase);
      return {
        step,
        hex: normalizedBase,
        requestedOklch: anchorOklch,
        mappedOklch: anchorOklch,
        oklch: anchorOklch,
        usage: STEP_USAGE[step],
        gamutMapped: false,
      };
    }

    return createGeneratedStep(step, lightness, baseOklch);
  });
  const steps = refineStructuralOrder(initialSteps, baseOklch, mode);

  return {
    name,
    baseHex: normalizedBase,
    steps,
    mode,
    profile: 'sRGB',
    method: 'Teul OKLCH v3',
    anchorStep: 9,
    validation: validateScale(normalizedBase, steps, mode),
  };
}

/**
 * Returns a copy of `scale` with one generated step replaced by an exact hex
 * and the validation recomputed by the same validator `generateColorScale`
 * uses (strictly monotonic lightness and relative luminance, no duplicate
 * adjacent steps, the required WCAG text pairs). Step 9 is the anchor and is
 * refused. Callers keep the original scale when the result's
 * `validation.valid` is false; the pinned step reports `gamutMapped: false`
 * because it was never mapped.
 */
export function pinColorScaleStep(scale: ColorScale, step: number, hex: string): ColorScale {
  if (!Number.isInteger(step) || step < 1 || step > 12 || step === scale.anchorStep) {
    throw new RangeError(
      `Cannot pin step ${step}: pinnable steps are 1 through 12 except the anchor.`
    );
  }
  const normalized = normalizeHex(hex);
  const oklch = finalOklch(normalized);
  const steps = scale.steps.map(existing =>
    existing.step === step
      ? {
          step,
          hex: normalized,
          requestedOklch: oklch,
          mappedOklch: oklch,
          oklch,
          usage: STEP_USAGE[step],
          gamutMapped: false,
        }
      : existing
  );
  return { ...scale, steps, validation: validateScale(scale.baseHex, steps, scale.mode) };
}

function nativeStepIdentity(step: ColorStep): string {
  return step.value?.representation?.exactValueHash ?? step.hex;
}

function nativeStepLuminance(step: ColorStep): number {
  if (!step.value) return stepLuminance(step);
  const { r, g, b } = colorSystemSrgbToRgbV1(step.value);
  return getLuminance(r, g, b);
}

function nativeSourceStep(step: number, input: ColorSystemColorValueV2): ColorStep {
  const value = normalizeColorSystemSrgbValueV1(input);
  if (value.alpha !== 1) throw new Error('Scale sources must be opaque sRGB colors.');
  const hex = value.hex.toLowerCase();
  const oklch = value.representation ? colorSystemSrgbToOklchV1(value) : finalOklch(hex);
  return {
    step,
    hex,
    ...(value.representation ? { value } : {}),
    requestedOklch: oklch,
    mappedOklch: oklch,
    oklch,
    usage: STEP_USAGE[step],
    gamutMapped: false,
  };
}

/** Backend native path; legacy hex callers retain their exact serialized scale. */
export function generateColorScaleFromSrgbV1(
  value: ColorSystemColorValueV2,
  mode: ColorScaleMode = 'light',
  name = 'Custom'
): ColorScale {
  const anchor = nativeSourceStep(9, value);
  if (!anchor.value) return generateColorScale(anchor.hex, mode, name);
  const baseOklch = anchor.oklch;
  const initial = getLightnessTargets(baseOklch.l, mode).map((lightness, index) =>
    index === 8 ? anchor : createGeneratedStep(index + 1, lightness, baseOklch)
  );
  const steps = refineStructuralOrder(
    initial,
    baseOklch,
    mode,
    nativeStepLuminance,
    nativeStepIdentity
  );
  return {
    name,
    baseHex: anchor.hex,
    baseValue: anchor.value,
    steps,
    mode,
    profile: 'sRGB',
    method: 'Teul OKLCH v3',
    anchorStep: 9,
    validation: validateScale(
      nativeStepIdentity(anchor),
      steps,
      mode,
      nativeStepLuminance,
      nativeStepIdentity
    ),
  };
}

/** Pin actual source channels and rerun the same scale policy against those channels. */
export function pinColorScaleStepFromSrgbV1(
  scale: ColorScale,
  step: number,
  value: ColorSystemColorValueV2
): ColorScale {
  if (!Number.isInteger(step) || step < 1 || step > 12 || step === scale.anchorStep) {
    throw new RangeError(
      `Cannot pin step ${step}: pinnable steps are 1 through 12 except the anchor.`
    );
  }
  const pinned = nativeSourceStep(step, value);
  if (!pinned.value && !scale.baseValue && !scale.steps.some(item => item.value)) {
    return pinColorScaleStep(scale, step, pinned.hex);
  }
  const steps = scale.steps.map(existing => (existing.step === step ? pinned : existing));
  return {
    ...scale,
    steps,
    validation: validateScale(
      scale.baseValue?.representation?.exactValueHash ?? scale.baseHex,
      steps,
      scale.mode,
      nativeStepLuminance,
      nativeStepIdentity
    ),
  };
}

/**
 * Native candidate policy: exact source pins bound the chroma/hue interpolation
 * of their generated neighbors. Callers pass prior pins, including byte pins,
 * so inserting another source can never regenerate an earlier source value.
 */
export function pinColorScaleStepWithSourceAnchorsV1(
  scale: ColorScale,
  step: number,
  value: ColorSystemColorValueV2,
  preservedSteps: readonly number[]
): ColorScale {
  const pinned = pinColorScaleStepFromSrgbV1(scale, step, value);
  if (!pinned.baseValue && !pinned.steps.some(item => item.value)) return pinned;
  if (
    preservedSteps.some(
      fixed => !Number.isInteger(fixed) || fixed < 1 || fixed > 12 || fixed === step
    )
  ) {
    throw new RangeError('Preserved source steps must be distinct from the new pin.');
  }
  const fixedSteps = [...new Set([1, scale.anchorStep, 12, step, ...preservedSteps])].sort(
    (a, b) => a - b
  );
  const pinIndex = fixedSteps.indexOf(step);
  const steps = [...pinned.steps];
  for (let segment = Math.max(0, pinIndex - 1); segment <= pinIndex; segment++) {
    const left = steps[fixedSteps[segment] - 1];
    const right = steps[fixedSteps[segment + 1] - 1];
    if (!right) break;
    if (left.oklch.l === right.oklch.l) continue;
    const hueDelta = ((right.oklch.h - left.oklch.h + 540) % 360) - 180;
    for (let index = left.step; index < right.step - 1; index++) {
      const lightness = steps[index].requestedOklch.l;
      const fraction = Math.max(
        0,
        Math.min(1, (lightness - left.oklch.l) / (right.oklch.l - left.oklch.l))
      );
      const requestedOklch = {
        l: lightness,
        c: left.oklch.c + (right.oklch.c - left.oklch.c) * fraction,
        h: normalizeHue(left.oklch.h + hueDelta * fraction),
      };
      const mapped = mapOklchToSrgb(requestedOklch);
      steps[index] = {
        step: index + 1,
        hex: mapped.hex,
        sourceAnchorSteps: [left.step, right.step],
        requestedOklch,
        mappedOklch: mapped.oklch,
        oklch: finalOklch(mapped.hex),
        usage: STEP_USAGE[index + 1],
        gamutMapped: mapped.mapped,
      };
    }
  }
  return {
    ...pinned,
    sourcePinPolicy: 'source-anchored-oklch-v1',
    steps,
    validation: validateScale(
      scale.baseValue?.representation?.exactValueHash ?? scale.baseHex,
      steps,
      scale.mode,
      nativeStepLuminance,
      nativeStepIdentity
    ),
  };
}

export function isExactTeulGeneratedScale(scale: {
  method?: unknown;
  mode?: unknown;
  steps?: readonly { step: number; hex: string }[];
  validation?: unknown;
}): boolean {
  if (
    scale.method !== 'Teul OKLCH v3' ||
    (scale.mode !== 'light' && scale.mode !== 'dark') ||
    !Array.isArray(scale.steps) ||
    scale.steps.length !== 12 ||
    scale.steps.some(
      (step, index) =>
        step.step !== index + 1 ||
        typeof step.hex !== 'string' ||
        !/^#[0-9a-fA-F]{6}$/.test(step.hex)
    )
  ) {
    return false;
  }

  const regenerated = generateColorScale(scale.steps[8].hex, scale.mode);
  return (
    regenerated.validation.valid &&
    scale.steps.every(
      (step, index) => step.hex.toLowerCase() === regenerated.steps[index].hex.toLowerCase()
    ) &&
    JSON.stringify(scale.validation) === JSON.stringify(regenerated.validation)
  );
}

export function haveExactTeulGeneratedScaleClaims(
  ...scaleMaps: Array<
    | Record<
        string,
        | {
            method?: unknown;
            mode?: unknown;
            steps?: readonly { step: number; hex: string }[];
            validation?: unknown;
          }
        | undefined
      >
    | undefined
  >
): boolean {
  return scaleMaps.every(scaleMap =>
    Object.values(scaleMap ?? {}).every(
      scale => scale?.method !== 'Teul OKLCH v3' || isExactTeulGeneratedScale(scale)
    )
  );
}
