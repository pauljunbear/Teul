import {
  calculateContrastRatio,
  getLuminance,
  hexToOklch,
  hexToRgb,
  oklabToOklch,
  oklchToOklab,
  rgbToHex,
  rgbToOklab,
  type OKLCH,
} from './utils';

export type ColorScaleMode = 'light' | 'dark';

interface ColorStep {
  step: number;
  hex: string;
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
  steps: ColorStep[];
  mode: ColorScaleMode;
  profile: 'sRGB';
  method: 'Teul OKLCH v2';
  anchorStep: 9;
  validation: ColorScaleValidation;
}

export type ColorScaleBuildResult =
  | { ok: true; scale: ColorScale }
  | { ok: false; candidate: ColorScale; issues: ScaleValidationIssue[] };

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

interface RawRgb {
  r: number;
  g: number;
  b: number;
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

/**
 * Maps OKLCH into sRGB by preserving lightness and hue while reducing chroma.
 * This is deterministic and avoids clipping RGB channels, which can shift hue.
 */
export function mapOklchToSrgb(color: OKLCH): { oklch: OKLCH; hex: string; mapped: boolean } {
  if (!isFiniteOklch(color)) {
    throw new Error('OKLCH values must be finite.');
  }

  const safe: OKLCH = {
    l: Math.max(0, Math.min(1, color.l)),
    c: Math.max(0, color.c),
    h: ((color.h % 360) + 360) % 360,
  };

  let mapped = safe.l !== color.l || safe.c !== color.c || safe.h !== color.h;
  if (!isOklchInSrgbGamut(safe)) {
    let low = 0;
    let high = safe.c;

    for (let iteration = 0; iteration < 24; iteration++) {
      const mid = (low + high) / 2;
      if (isOklchInSrgbGamut({ ...safe, c: mid })) {
        low = mid;
      } else {
        high = mid;
      }
    }
    safe.c = low;
    mapped = true;
  }

  const raw = oklchToRawSrgb(safe.l, safe.c, safe.h);
  const hex = rgbToHex(
    Math.round(Math.max(0, Math.min(255, raw.r))),
    Math.round(Math.max(0, Math.min(255, raw.g))),
    Math.round(Math.max(0, Math.min(255, raw.b)))
  ).toLowerCase();

  return { oklch: safe, hex, mapped };
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

function createGeneratedStep(step: number, lightness: number, baseOklch: OKLCH): ColorStep {
  const mapped = mapOklchToSrgb({
    l: lightness,
    c: baseOklch.c * CHROMA_MULTIPLIERS[step - 1],
    h: baseOklch.h,
  });
  return {
    step,
    hex: mapped.hex,
    oklch: finalOklch(mapped.hex),
    usage: STEP_USAGE[step],
    gamutMapped: mapped.mapped,
  };
}

function refineStructuralOrder(
  initialSteps: ColorStep[],
  baseOklch: OKLCH,
  mode: ColorScaleMode
): ColorStep[] {
  const steps = [...initialSteps];
  const preDirection = mode === 'light' ? 1 : -1;
  const postDirection = -preDirection;
  const ordered = (first: ColorStep, second: ColorStep, direction: number) =>
    (first.oklch.l - second.oklch.l) * direction > EPSILON &&
    (relativeLuminance(first.hex) - relativeLuminance(second.hex)) * direction > EPSILON &&
    first.hex !== second.hex;

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
  mode: ColorScaleMode
): ColorScaleValidation {
  const issues: ScaleValidationIssue[] = [];
  const anchorPreserved = steps[8]?.hex.toLowerCase() === baseHex.toLowerCase();
  const finite = steps.every(step => isFiniteOklch(step.oklch));
  // The serialized hex value is the final output users receive. Valid six-digit
  // hex values are necessarily in sRGB, while OKLCH round trips can introduce
  // tiny matrix-floating-point excursions at the gamut boundary.
  const inSrgbGamut = steps.every(step => /^#[0-9a-f]{6}$/.test(step.hex));
  const duplicatePairs: number[][] = [];

  for (let index = 1; index < steps.length; index++) {
    if (steps[index - 1].hex === steps[index].hex) {
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
    const luminanceChange =
      relativeLuminance(steps[index].hex) - relativeLuminance(steps[index - 1].hex);
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
    const ratio = calculateContrastRatio(
      steps[target.foregroundStep - 1].hex,
      steps[target.backgroundStep - 1].hex
    );
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
      return {
        step,
        hex: normalizedBase,
        oklch: finalOklch(normalizedBase),
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
    method: 'Teul OKLCH v2',
    anchorStep: 9,
    validation: validateScale(normalizedBase, steps, mode),
  };
}

export function buildColorScale(
  baseHex: string,
  mode: ColorScaleMode = 'light',
  name: string = 'Custom'
): ColorScaleBuildResult {
  const candidate = generateColorScale(baseHex, mode, name);
  return candidate.validation.valid
    ? { ok: true, scale: candidate }
    : { ok: false, candidate, issues: candidate.validation.issues };
}

export function generateColorScales(
  baseHex: string,
  name: string = 'Custom'
): { light: ColorScale; dark: ColorScale } {
  return {
    light: generateColorScale(baseHex, 'light', name),
    dark: generateColorScale(baseHex, 'dark', name),
  };
}
