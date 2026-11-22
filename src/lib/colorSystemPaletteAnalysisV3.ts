import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import { canonicalJson, canonicalNumber, deterministicContentHash } from './colorSystemHashing';
import { colorSystemSrgbToRgbV1, normalizeColorSystemSrgbValueV1 } from './colorSystemSrgbValueV1';
import { radixColors } from './radixColors';
import { compareText, getLuminance, hexToRgb, oklabToOklch, rgbToOklab, type OKLab } from './utils';

/**
 * Pure, deterministic analysis of an observed palette.
 *
 * This module measures color geometry only. It never reads Figma, the network,
 * storage, or the clock, and it never assigns a section role: the intent policy
 * turns these measurements into tentative proposals that an owner confirms.
 *
 * Every threshold below is a policy constant of this module, not a claim about
 * a color-science standard. Each one is documented where it is declared.
 */
export const COLOR_SYSTEM_PALETTE_ANALYSIS_V3_VERSION =
  'teul-color-system-palette-analysis/v3.1' as const;
export const COLOR_SYSTEM_PALETTE_ANALYSIS_V3_NATIVE_VERSION =
  'teul-color-system-palette-analysis/v3.2' as const;

/**
 * OKLCH chroma below which a color reads as a neutral. OKLCH chroma is used
 * instead of an sRGB channel spread because warm creams such as `#F5EFE6`
 * (chroma ≈ 0.014) are neutrals in practice while their channel spread is not.
 */
export const PALETTE_NEUTRAL_MAX_CHROMA_V3 = 0.03;

/**
 * Minimum OKLCH chroma for a color to serve as the palette hero. Matches the
 * chromatic Primary anchor floor used by the generic source compiler so that a
 * hero proposed here is never rejected there as "not chromatic".
 */
export const PALETTE_HERO_MINIMUM_CHROMA_V3 = 0.04;

/**
 * Below this chroma the OKLCH hue angle is numerically meaningless (pure white
 * measures hue ≈ 90° with chroma ≈ 3e-8). Such colors report hue 0, no hue
 * family, and never vote on neutral temperature.
 */
export const PALETTE_ACHROMATIC_CHROMA_FLOOR_V3 = 0.002;

/** Two colors closer than this ΔE OK (Euclidean OKLab distance) are near duplicates. */
export const PALETTE_NEAR_DUPLICATE_DELTA_E_OK_V3 = 0.02;

/**
 * Neutral temperature bands on the OKLCH hue circle. Warm covers orange through
 * yellow-green casts; cool covers cyan through violet casts; everything else,
 * and every achromatic color, is `neutral`. Boundaries are inclusive.
 */
export const PALETTE_WARM_HUE_RANGE_V3 = { start: 20, end: 110 } as const;
export const PALETTE_COOL_HUE_RANGE_V3 = { start: 200, end: 300 } as const;

export type PaletteAnalysisSourceKindV3 = 'variable' | 'paint-style' | 'palette-entry';

export interface PaletteAnalysisColorInputV3 {
  /** Stable identity of the source (for example a generic source ref ID). */
  id: string;
  name: string;
  description?: string;
  /** Six-digit sRGB hex, with or without the leading `#`. */
  hex: string;
  /** Exact sRGB value when hex is a display approximation; hex and alpha must agree. */
  value?: ColorSystemColorValueV2;
  /** 0–1 alpha; only fully opaque colors (alpha === 1) can be the hero. */
  alpha: number;
  /** Mode name when the source carries one value per mode. */
  mode?: string;
  kind: PaletteAnalysisSourceKindV3;
}

export interface PaletteOklchV3 {
  l: number;
  c: number;
  h: number;
}

export type PaletteNeutralTemperatureV3 = 'warm' | 'cool' | 'neutral';

export type PaletteHueFamilyV3 =
  | 'rose'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'violet'
  | 'magenta';

export type PaletteSemanticClaimV3 = 'success' | 'warning' | 'error' | 'info' | 'link';

/**
 * p3-I: vocabulary a name uses to claim a ground (the page or a raised surface).
 * A `named-ground` term names the job outright; the plain names white and black
 * are a weaker `plain-extreme` claim that the composer honours only when no
 * named ground is recorded for the same polarity. Matching is by whole name
 * token, so “Foreground” does not read as “ground” and “Black Coffee” (last
 * token “coffee”) does not read as black.
 */
export const PALETTE_NAMED_GROUND_TERMS_V3 = [
  'surface',
  'background',
  'ground',
  'paper',
  'canvas',
  'page',
  'sheet',
] as const;
export const PALETTE_PLAIN_GROUND_TERMS_V3 = ['white', 'black'] as const;

export type PaletteGroundClaimTermV3 =
  (typeof PALETTE_NAMED_GROUND_TERMS_V3)[number] | (typeof PALETTE_PLAIN_GROUND_TERMS_V3)[number];
export type PaletteGroundClaimKindV3 = 'named-ground' | 'plain-extreme';

export interface PaletteGroundClaimV3 {
  term: PaletteGroundClaimTermV3;
  kind: PaletteGroundClaimKindV3;
}

/**
 * p3-I: vocabulary a name uses to claim a text (ink) job. `named-text` terms
 * name the job; `typography` alone is usually a section prefix (“Typography /
 * Gray 3”) and is the weaker `section-prefix` claim.
 */
export const PALETTE_TEXT_CLAIM_TERMS_V3 = ['primary text', 'ink', 'text', 'typography'] as const;
export type PaletteTextClaimTermV3 = (typeof PALETTE_TEXT_CLAIM_TERMS_V3)[number];
export type PaletteTextClaimKindV3 = 'named-text' | 'section-prefix';

export interface PaletteTextClaimV3 {
  term: PaletteTextClaimTermV3;
  kind: PaletteTextClaimKindV3;
}

/**
 * p3-I: the polarity a recorded chart color claims by name. Status vocabulary
 * (error, danger, negative → negative; success, positive → positive) and the
 * colour words red and blaze (negative) and green (positive). A name that
 * claims both is ambiguous and claims neither.
 */
export const PALETTE_DIVERGING_CLAIM_TERMS_V3 = {
  negative: ['negative', 'red', 'blaze'],
  positive: ['positive', 'green'],
} as const;
export type PaletteDivergingClaimV3 = 'negative' | 'positive';

export interface PaletteNumericPathHintV3 {
  /** Lower-cased path with numeric step removed, segments joined by `/`. */
  scaleName: string;
  step: number;
}

export interface PaletteColorRefV3 {
  id: string;
  mode: string | null;
}

export interface PaletteAnalysisColorV3 extends PaletteColorRefV3 {
  name: string;
  kind: PaletteAnalysisSourceKindV3;
  /** Lower-cased six-digit hex with a leading `#`. */
  hex: string;
  /** Native source value retained for exact identity and downstream measurements. */
  value?: ColorSystemColorValueV2;
  alpha: number;
  opaque: boolean;
  /** OKLCH rounded to 12 significant digits; hue is 0 below the achromatic floor. */
  oklch: PaletteOklchV3;
  /** OKLCH chroma below PALETTE_NEUTRAL_MAX_CHROMA_V3. */
  isNeutral: boolean;
  /** OKLCH chroma below PALETTE_ACHROMATIC_CHROMA_FLOOR_V3; hue is meaningless. */
  achromatic: boolean;
  /** Neutral temperature; null for chromatic colors. */
  temperature: PaletteNeutralTemperatureV3 | null;
  /** 1–12 Radix-style lightness role this color would occupy; see PALETTE_LADDER_ANCHOR_V3. */
  ladderStep: number;
  /** Coarse 12-sector hue name; null for achromatic colors. */
  hueFamily: PaletteHueFamilyV3 | null;
  numericPath: PaletteNumericPathHintV3 | null;
  /** Most consequential status claim in the name (error > warning > success > info > link). */
  semanticClaim: PaletteSemanticClaimV3 | null;
  /** Every status term found in the name, sorted. */
  semanticClaimTerms: readonly string[];
  /** p3-I: the ground (page or surface) job the name claims, if any. */
  groundClaim: PaletteGroundClaimV3 | null;
  /** p3-I: the text (ink) job the name claims, if any. */
  textClaim: PaletteTextClaimV3 | null;
  /** p3-I: a recorded order such as the `01` in `Data Viz / 01 Sky`; null without one. */
  orderClaim: number | null;
}

export interface PaletteColorPairV3 {
  baseName: string;
  /** `suffix`: names end in light/dark. `mode`: one source, two modes, different values. */
  kind: 'suffix' | 'mode';
  light: PaletteColorRefV3;
  dark: PaletteColorRefV3;
}

export interface PaletteNearDuplicateV3 {
  first: PaletteColorRefV3;
  second: PaletteColorRefV3;
  deltaEOk: number;
}

export interface PaletteUnevenScaleV3 {
  scaleName: string;
  mode: string | null;
  steps: readonly number[];
  lightness: readonly number[];
  refs: readonly PaletteColorRefV3[];
}

export interface PaletteArchitectureV3 {
  hero: boolean;
  /** Colors whose names carry primary/secondary/brand/accent vocabulary. */
  core: number;
  extended: number;
}

export type PaletteFaultCodeV3 =
  | 'no-chromatic-hero'
  | 'neutral-pair-missing'
  | 'neutral-polarity-missing'
  | 'near-duplicate'
  | 'uneven-scale'
  | 'duplicate-scale-step';

export interface PaletteFaultV3 {
  code: PaletteFaultCodeV3;
  refs: readonly PaletteColorRefV3[];
  message: string;
}

export interface ColorSystemPaletteAnalysisV3 {
  analysisVersion:
    | typeof COLOR_SYSTEM_PALETTE_ANALYSIS_V3_VERSION
    | typeof COLOR_SYSTEM_PALETTE_ANALYSIS_V3_NATIVE_VERSION;
  colors: readonly PaletteAnalysisColorV3[];
  /** Highest-chroma opaque color at or above the hero floor; ties break by name, then id, then mode. */
  hero: PaletteColorRefV3 | null;
  chromaticCount: number;
  neutralCount: number;
  /** Plurality temperature among non-achromatic neutrals; ties and no votes resolve to `neutral`. */
  neutralTemperature: PaletteNeutralTemperatureV3 | null;
  existingPairs: readonly PaletteColorPairV3[];
  nearDuplicates: readonly PaletteNearDuplicateV3[];
  unevenScales: readonly PaletteUnevenScaleV3[];
  architecture: PaletteArchitectureV3;
  faults: readonly PaletteFaultV3[];
  analysisHash: string;
}

export type ColorSystemPaletteAnalysisV3ErrorCode = 'INVALID_PALETTE_INPUT';

export class ColorSystemPaletteAnalysisV3Error extends Error {
  constructor(
    readonly code: ColorSystemPaletteAnalysisV3ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ColorSystemPaletteAnalysisV3Error';
  }
}

function fail(message: string): never {
  throw new ColorSystemPaletteAnalysisV3Error('INVALID_PALETTE_INPUT', message);
}

const MAX_TEXT = 500;
const HEX = /^#?[0-9a-fA-F]{6}$/;
const SOURCE_KINDS: ReadonlySet<string> = new Set(['variable', 'paint-style', 'palette-entry']);

/**
 * Lightness ladder anchor. Radix step 9 is the "solid background" step that
 * Teul's generator (colorScale.ts, getLightnessTargets) pins the base color to,
 * so the reference ladder is that light-mode shape anchored at the OKLCH
 * lightness of Radix Colors gray step 9 (light), the neutral every Radix scale
 * is paired against. The anchor is data, not a hand-typed number.
 */
export const PALETTE_LADDER_ANCHOR_V3 = {
  hex: radixColors.gray.light[9],
  source: 'Radix Colors 3.0.0 gray, light mode, step 9',
} as const;

function interpolate(start: number, end: number, index: number, count: number): number {
  return start + ((end - start) * index) / count;
}

/**
 * Re-statement of the light-mode ladder shape in colorScale.ts
 * (getLightnessTargets, `mode === 'light'` branch): steps 1–8 run from a clamped
 * near-white down to the anchor, step 9 is the anchor, steps 10–11 divide the
 * distance to a clamped dark floor in thirds, and step 12 is that floor. The
 * test suite cross-checks this list against generateColorScale so drift fails.
 */
function lightModeLadder(baseLightness: number): number[] {
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

function oklabOf(hex: string): OKLab {
  const { r, g, b } = hexToRgb(hex);
  return rgbToOklab(r, g, b);
}

/** Twelve light-mode lightness targets, index 0 = step 1. */
export const PALETTE_LADDER_LIGHTNESS_TARGETS_V3: readonly number[] = lightModeLadder(
  oklabOf(PALETTE_LADDER_ANCHOR_V3.hex).L
);

/**
 * Hue sectors in OKLCH degrees. Boundaries were set by hand against the hue
 * this module measures for the twelve sRGB colour-wheel spokes (`#FF0000` red
 * ≈ 29°, `#FF8000` orange ≈ 53°, `#FFFF00` yellow ≈ 110°, `#80FF00` ≈ 136°,
 * `#00FF00` green ≈ 143°, `#00FF80` ≈ 151°, `#00FFFF` cyan ≈ 195°, `#0080FF`
 * ≈ 256°, `#0000FF` blue ≈ 264°, `#8000FF` violet ≈ 294°, `#FF00FF` magenta
 * ≈ 328°, `#FF0080` rose ≈ 3°), so each spoke lands in the sector that bears
 * its name. OKLCH compresses greens and blues, which is why sectors are not
 * equal width. This is a legibility hint, not a colour-naming standard.
 */
export const PALETTE_HUE_SECTORS_V3: readonly {
  family: PaletteHueFamilyV3;
  start: number;
  end: number;
}[] = [
  { family: 'rose', start: 345, end: 15 },
  { family: 'red', start: 15, end: 40 },
  { family: 'orange', start: 40, end: 80 },
  { family: 'yellow', start: 80, end: 120 },
  { family: 'lime', start: 120, end: 140 },
  { family: 'green', start: 140, end: 165 },
  { family: 'teal', start: 165, end: 190 },
  { family: 'cyan', start: 190, end: 215 },
  { family: 'sky', start: 215, end: 250 },
  { family: 'blue', start: 250, end: 275 },
  { family: 'violet', start: 275, end: 305 },
  { family: 'magenta', start: 305, end: 345 },
];

const SEMANTIC_CLAIM_TERMS: readonly { term: string; claim: PaletteSemanticClaimV3 }[] = [
  { term: 'success', claim: 'success' },
  { term: 'positive', claim: 'success' },
  { term: 'warning', claim: 'warning' },
  { term: 'caution', claim: 'warning' },
  { term: 'error', claim: 'error' },
  { term: 'danger', claim: 'error' },
  { term: 'negative', claim: 'error' },
  { term: 'destructive', claim: 'error' },
  { term: 'info', claim: 'info' },
  { term: 'information', claim: 'info' },
  { term: 'link', claim: 'link' },
];

const SEMANTIC_CLAIM_PRIORITY: readonly PaletteSemanticClaimV3[] = [
  'error',
  'warning',
  'success',
  'info',
  'link',
];

const CORE_VOCABULARY: ReadonlySet<string> = new Set(['primary', 'secondary', 'brand', 'accent']);

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/** Shortest angular distance between two hues, 0–180. */
export function paletteHueDistanceV3(first: number, second: number): number {
  const difference = Math.abs(normalizeHue(first) - normalizeHue(second));
  return Math.min(difference, 360 - difference);
}

export function paletteHueFamilyV3(hue: number, chroma: number): PaletteHueFamilyV3 | null {
  if (chroma < PALETTE_ACHROMATIC_CHROMA_FLOOR_V3) return null;
  const normalized = normalizeHue(hue);
  const sector = PALETTE_HUE_SECTORS_V3.find(candidate =>
    candidate.start > candidate.end
      ? normalized >= candidate.start || normalized < candidate.end
      : normalized >= candidate.start && normalized < candidate.end
  );
  return sector ? sector.family : null;
}

export function paletteNeutralTemperatureV3(
  hue: number,
  chroma: number
): PaletteNeutralTemperatureV3 | null {
  if (chroma >= PALETTE_NEUTRAL_MAX_CHROMA_V3) return null;
  if (chroma < PALETTE_ACHROMATIC_CHROMA_FLOOR_V3) return 'neutral';
  const normalized = normalizeHue(hue);
  if (
    normalized >= PALETTE_WARM_HUE_RANGE_V3.start &&
    normalized <= PALETTE_WARM_HUE_RANGE_V3.end
  ) {
    return 'warm';
  }
  if (
    normalized >= PALETTE_COOL_HUE_RANGE_V3.start &&
    normalized <= PALETTE_COOL_HUE_RANGE_V3.end
  ) {
    return 'cool';
  }
  return 'neutral';
}

/** Nearest ladder target wins; an exact tie resolves to the lower step. */
export function paletteLadderStepV3(lightness: number): number {
  let best = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  PALETTE_LADDER_LIGHTNESS_TARGETS_V3.forEach((target, index) => {
    const distance = Math.abs(target - lightness);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index + 1;
    }
  });
  return best;
}

function nameTokens(name: string): string[] {
  return name
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 0);
}

/**
 * Parses `Blue/500`, `gray-900`, `primary.9`, `Chart / Series 1`, and `blue500`
 * into a scale name plus integer step. The step must be the final token (or the
 * trailing digits of a single letters+digits token) and needs at least one
 * preceding alphabetic segment, so bare numbers and hex-like names parse to null.
 */
export function paletteNumericPathV3(name: string): PaletteNumericPathHintV3 | null {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return null;
  const last = tokens[tokens.length - 1];
  if (/^\d{1,4}$/.test(last) && tokens.length >= 2) {
    const head = tokens.slice(0, -1);
    if (!head.every(token => /^[a-z][a-z0-9]*$/.test(token) && !/^\d+$/.test(token))) return null;
    return { scaleName: head.join('/'), step: Number(last) };
  }
  const glued = /^([a-z]+)(\d{1,4})$/.exec(last);
  if (glued) {
    const head = [...tokens.slice(0, -1), glued[1]];
    if (!head.every(token => /^[a-z][a-z0-9]*$/.test(token))) return null;
    return { scaleName: head.join('/'), step: Number(glued[2]) };
  }
  return null;
}

function semanticClaims(name: string): {
  claim: PaletteSemanticClaimV3 | null;
  terms: string[];
} {
  const tokens = new Set(nameTokens(name));
  const matches = SEMANTIC_CLAIM_TERMS.filter(entry => tokens.has(entry.term));
  const claims = new Set(matches.map(entry => entry.claim));
  const claim = SEMANTIC_CLAIM_PRIORITY.find(candidate => claims.has(candidate)) ?? null;
  return { claim, terms: matches.map(entry => entry.term).sort(compareText) };
}

/**
 * p3-I: the ground a name claims. A named-ground term anywhere in the name wins;
 * otherwise a name whose last token is white or black is a plain-extreme claim
 * (“Primary / White”, “Alpha White”), and any other name claims no ground.
 */
export function paletteGroundClaimV3(name: string): PaletteGroundClaimV3 | null {
  const tokens = nameTokens(name);
  const named = PALETTE_NAMED_GROUND_TERMS_V3.find(term => tokens.includes(term));
  if (named) return { term: named, kind: 'named-ground' };
  const last = tokens[tokens.length - 1];
  const plain = PALETTE_PLAIN_GROUND_TERMS_V3.find(term => term === last);
  return plain ? { term: plain, kind: 'plain-extreme' } : null;
}

/**
 * p3-I: the text job a name claims. “primary text” (two consecutive tokens),
 * “ink” and “text” are named claims; “typography” alone is the section-prefix
 * claim. The most specific term present is reported.
 */
export function paletteTextClaimV3(name: string): PaletteTextClaimV3 | null {
  const tokens = nameTokens(name);
  const hasPrimaryText = tokens.some(
    (token, index) => token === 'primary' && tokens[index + 1] === 'text'
  );
  if (hasPrimaryText) return { term: 'primary text', kind: 'named-text' };
  if (tokens.includes('ink')) return { term: 'ink', kind: 'named-text' };
  if (tokens.includes('text')) return { term: 'text', kind: 'named-text' };
  if (tokens.includes('typography')) return { term: 'typography', kind: 'section-prefix' };
  return null;
}

/**
 * p3-I: a recorded order such as `Data Viz / 01 Sky`, `Chart / Series 3` or
 * `Categorical 2`: the first standalone token of one or two digits that follows
 * at least one alphabetic token. Three- and four-digit tokens are scale steps
 * (`Blue/500`, `gray-900`), not orders, and parse to null here.
 */
export function paletteOrderClaimV3(name: string): number | null {
  const tokens = nameTokens(name);
  let sawAlphabetic = false;
  for (const token of tokens) {
    if (/^[a-z][a-z0-9]*$/.test(token) && !/^\d+$/.test(token)) sawAlphabetic = true;
    if (/^\d{1,2}$/.test(token) && sawAlphabetic) return Number(token);
    if (/^\d{3,}$/.test(token)) return null;
  }
  return null;
}

/** p3-I: the diverging polarity a recorded chart color claims by name; null when neither or both. */
export function paletteDivergingClaimV3(name: string): PaletteDivergingClaimV3 | null {
  const tokens = new Set(nameTokens(name));
  const status = semanticClaims(name);
  const negative =
    status.claim === 'error' ||
    PALETTE_DIVERGING_CLAIM_TERMS_V3.negative.some(term => tokens.has(term));
  const positive =
    status.claim === 'success' ||
    PALETTE_DIVERGING_CLAIM_TERMS_V3.positive.some(term => tokens.has(term));
  if (negative === positive) return null;
  return negative ? 'negative' : 'positive';
}

function lightDarkSuffix(name: string): { base: string; side: 'light' | 'dark' } | null {
  const tokens = nameTokens(name);
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1];
  if (last !== 'light' && last !== 'dark') return null;
  return { base: tokens.slice(0, -1).join('/'), side: last };
}

function ref(color: PaletteColorRefV3): PaletteColorRefV3 {
  return { id: color.id, mode: color.mode };
}

function compareRefs(left: PaletteColorRefV3, right: PaletteColorRefV3): number {
  return compareText(left.id, right.id) || compareText(left.mode ?? '', right.mode ?? '');
}

function refKey(color: PaletteColorRefV3): string {
  return `${color.id}\u0000${color.mode ?? ''}`;
}

function validText(value: unknown, label: string, allowEmpty: boolean): string {
  if (
    typeof value !== 'string' ||
    value.length > MAX_TEXT ||
    value !== value.trim() ||
    value.includes('\u0000') ||
    (!allowEmpty && value.length === 0)
  ) {
    fail(`${label} must be trimmed text of at most ${MAX_TEXT} characters.`);
  }
  return value;
}

interface MeasuredColor {
  color: PaletteAnalysisColorV3;
  oklab: OKLab;
  luminance: number;
  rgbIdentity: string;
}

function measure(input: PaletteAnalysisColorInputV3, index: number): MeasuredColor {
  if (input === null || typeof input !== 'object') fail(`colors[${index}] must be an object.`);
  const id = validText(input.id, `colors[${index}].id`, false);
  const name = validText(input.name, `colors[${index}].name`, true);
  if (input.description !== undefined) {
    validText(input.description, `colors[${index}].description`, true);
  }
  const mode =
    input.mode === undefined ? null : validText(input.mode, `colors[${index}].mode`, false);
  if (typeof input.kind !== 'string' || !SOURCE_KINDS.has(input.kind)) {
    fail(`colors[${index}].kind must be variable, paint-style, or palette-entry.`);
  }
  if (typeof input.hex !== 'string' || !HEX.test(input.hex)) {
    fail(`colors[${index}].hex must be six-digit sRGB hex.`);
  }
  if (typeof input.alpha !== 'number' || !Number.isFinite(input.alpha)) {
    fail(`colors[${index}].alpha must be a finite number.`);
  }
  if (input.alpha < 0 || input.alpha > 1) fail(`colors[${index}].alpha must be within 0–1.`);
  const hex = `#${input.hex.replace(/^#/, '').toLowerCase()}`;
  let value: ColorSystemColorValueV2 | undefined;
  if (input.value !== undefined) {
    try {
      value = normalizeColorSystemSrgbValueV1(input.value);
    } catch {
      fail(`colors[${index}].value must be a valid exact sRGB value.`);
    }
    if (value.hex.toLowerCase() !== hex || value.alpha !== input.alpha) {
      fail(`colors[${index}].value must match its display hex and alpha.`);
    }
  }
  const { r, g, b } = value ? colorSystemSrgbToRgbV1(value) : hexToRgb(input.hex);
  const oklab = rgbToOklab(r, g, b);
  const raw = oklabToOklch(oklab.L, oklab.a, oklab.b);
  const c = canonicalNumber(raw.c);
  const achromatic = c < PALETTE_ACHROMATIC_CHROMA_FLOOR_V3;
  const h = achromatic ? 0 : canonicalNumber(normalizeHue(raw.h));
  const l = canonicalNumber(raw.l);
  const claims = semanticClaims(name);
  return {
    color: {
      id,
      mode,
      name,
      kind: input.kind,
      hex,
      ...(value?.representation ? { value } : {}),
      alpha: input.alpha,
      opaque: input.alpha === 1,
      oklch: { l, c, h },
      isNeutral: c < PALETTE_NEUTRAL_MAX_CHROMA_V3,
      achromatic,
      temperature: paletteNeutralTemperatureV3(h, c),
      ladderStep: paletteLadderStepV3(l),
      hueFamily: paletteHueFamilyV3(h, c),
      numericPath: paletteNumericPathV3(name),
      semanticClaim: claims.claim,
      semanticClaimTerms: claims.terms,
      groundClaim: paletteGroundClaimV3(name),
      textClaim: paletteTextClaimV3(name),
      orderClaim: paletteOrderClaimV3(name),
    },
    oklab,
    luminance: getLuminance(r, g, b),
    rgbIdentity: canonicalJson({ r, g, b }),
  };
}

function compareMeasured(left: MeasuredColor, right: MeasuredColor): number {
  return (
    compareRefs(left.color, right.color) ||
    compareText(left.color.hex, right.color.hex) ||
    compareText(left.color.name, right.color.name)
  );
}

function selectHero(measured: readonly MeasuredColor[]): PaletteColorRefV3 | null {
  const candidates = measured
    .filter(entry => entry.color.opaque && entry.color.oklch.c >= PALETTE_HERO_MINIMUM_CHROMA_V3)
    .sort(
      (left, right) =>
        right.color.oklch.c - left.color.oklch.c ||
        compareText(left.color.name, right.color.name) ||
        compareRefs(left.color, right.color)
    );
  return candidates.length > 0 ? ref(candidates[0].color) : null;
}

function neutralTemperature(
  measured: readonly MeasuredColor[]
): PaletteNeutralTemperatureV3 | null {
  const neutrals = measured.filter(entry => entry.color.isNeutral);
  if (neutrals.length === 0) return null;
  const votes = { warm: 0, cool: 0, neutral: 0 };
  neutrals
    .filter(entry => !entry.color.achromatic)
    .forEach(entry => {
      votes[entry.color.temperature ?? 'neutral'] += 1;
    });
  if (votes.warm > votes.cool && votes.warm > votes.neutral) return 'warm';
  if (votes.cool > votes.warm && votes.cool > votes.neutral) return 'cool';
  return 'neutral';
}

function existingPairs(measured: readonly MeasuredColor[]): PaletteColorPairV3[] {
  const pairs: PaletteColorPairV3[] = [];
  const suffixGroups = new Map<
    string,
    { base: string; light: MeasuredColor[]; dark: MeasuredColor[] }
  >();
  measured.forEach(entry => {
    const suffix = lightDarkSuffix(entry.color.name);
    if (!suffix) return;
    const key = `${suffix.base}\u0000${entry.color.mode ?? ''}`;
    const group = suffixGroups.get(key) ?? { base: suffix.base, light: [], dark: [] };
    group[suffix.side].push(entry);
    suffixGroups.set(key, group);
  });
  suffixGroups.forEach(group => {
    if (group.light.length !== 1 || group.dark.length !== 1) return;
    pairs.push({
      baseName: group.base,
      kind: 'suffix',
      light: ref(group.light[0].color),
      dark: ref(group.dark[0].color),
    });
  });
  const byId = new Map<string, MeasuredColor[]>();
  measured
    .filter(entry => entry.color.mode !== null)
    .forEach(entry => {
      const group = byId.get(entry.color.id) ?? [];
      group.push(entry);
      byId.set(entry.color.id, group);
    });
  byId.forEach(group => {
    if (group.length !== 2 || group[0].rgbIdentity === group[1].rgbIdentity) return;
    const [lighter, darker] =
      group[0].color.oklch.l >= group[1].color.oklch.l
        ? [group[0], group[1]]
        : [group[1], group[0]];
    pairs.push({
      baseName: nameTokens(lighter.color.name).join('/'),
      kind: 'mode',
      light: ref(lighter.color),
      dark: ref(darker.color),
    });
  });
  return pairs.sort(
    (left, right) =>
      compareText(left.kind, right.kind) ||
      compareText(left.baseName, right.baseName) ||
      compareRefs(left.light, right.light) ||
      compareRefs(left.dark, right.dark)
  );
}

function deltaEOk(first: OKLab, second: OKLab): number {
  return Math.sqrt(
    Math.pow(first.L - second.L, 2) +
      Math.pow(first.a - second.a, 2) +
      Math.pow(first.b - second.b, 2)
  );
}

/**
 * Near-duplicate search bucketed on an OKLab grid whose cell edge equals the
 * ΔE threshold, so only the 27 neighbouring cells are compared and the result is
 * exact for every pair inside the threshold. Entries that share an id (one
 * source across modes) are never compared with each other.
 */
function nearDuplicates(measured: readonly MeasuredColor[]): PaletteNearDuplicateV3[] {
  const cell = PALETTE_NEAR_DUPLICATE_DELTA_E_OK_V3;
  const buckets = new Map<string, number[]>();
  const coordinates = measured.map(entry => [
    Math.floor(entry.oklab.L / cell),
    Math.floor(entry.oklab.a / cell),
    Math.floor(entry.oklab.b / cell),
  ]);
  coordinates.forEach((coordinate, index) => {
    const key = coordinate.join(',');
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
  });
  const duplicates: PaletteNearDuplicateV3[] = [];
  measured.forEach((entry, index) => {
    const [x, y, z] = coordinates[index];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = buckets.get(`${x + dx},${y + dy},${z + dz}`);
          if (!bucket) continue;
          bucket.forEach(other => {
            if (other <= index) return;
            const candidate = measured[other];
            if (candidate.color.id === entry.color.id) return;
            if (candidate.color.alpha !== entry.color.alpha) return;
            const distance = deltaEOk(entry.oklab, candidate.oklab);
            if (distance < PALETTE_NEAR_DUPLICATE_DELTA_E_OK_V3) {
              duplicates.push({
                first: ref(entry.color),
                second: ref(candidate.color),
                deltaEOk: canonicalNumber(distance),
              });
            }
          });
        }
      }
    }
  });
  return duplicates.sort(
    (left, right) => compareRefs(left.first, right.first) || compareRefs(left.second, right.second)
  );
}

interface ScaleGroup {
  scaleName: string;
  mode: string | null;
  members: MeasuredColor[];
}

function scaleGroups(measured: readonly MeasuredColor[]): ScaleGroup[] {
  const groups = new Map<string, ScaleGroup>();
  measured.forEach(entry => {
    const path = entry.color.numericPath;
    if (!path) return;
    const key = `${path.scaleName}\u0000${entry.color.mode ?? ''}`;
    const group = groups.get(key) ?? {
      scaleName: path.scaleName,
      mode: entry.color.mode,
      members: [],
    };
    group.members.push(entry);
    groups.set(key, group);
  });
  return [...groups.values()]
    .filter(group => group.members.length >= 3)
    .sort(
      (left, right) =>
        compareText(left.scaleName, right.scaleName) ||
        compareText(left.mode ?? '', right.mode ?? '')
    );
}

function hasDuplicateSteps(group: ScaleGroup): boolean {
  const steps = group.members.map(entry => entry.color.numericPath?.step ?? Number.NaN);
  return new Set(steps).size !== steps.length;
}

function isStrictlyMonotonic(values: readonly number[]): boolean {
  const increasing = values.every((value, index) => index === 0 || value > values[index - 1]);
  const decreasing = values.every((value, index) => index === 0 || value < values[index - 1]);
  return increasing || decreasing;
}

function sortedMembers(group: ScaleGroup): MeasuredColor[] {
  return [...group.members].sort(
    (left, right) =>
      (left.color.numericPath?.step ?? 0) - (right.color.numericPath?.step ?? 0) ||
      compareRefs(left.color, right.color)
  );
}

function unevenScales(groups: readonly ScaleGroup[]): PaletteUnevenScaleV3[] {
  return groups.flatMap(group => {
    if (hasDuplicateSteps(group)) return [];
    const members = sortedMembers(group);
    const lightness = members.map(entry => entry.color.oklch.l);
    if (isStrictlyMonotonic(lightness)) return [];
    return [
      {
        scaleName: group.scaleName,
        mode: group.mode,
        steps: members.map(entry => entry.color.numericPath?.step ?? 0),
        lightness,
        refs: members.map(entry => ref(entry.color)),
      },
    ];
  });
}

function formatRefs(refs: readonly PaletteColorRefV3[]): string {
  return refs.map(item => (item.mode === null ? item.id : `${item.id} (${item.mode})`)).join(', ');
}

function faults(
  measured: readonly MeasuredColor[],
  hero: PaletteColorRefV3 | null,
  duplicates: readonly PaletteNearDuplicateV3[],
  groups: readonly ScaleGroup[],
  uneven: readonly PaletteUnevenScaleV3[]
): PaletteFaultV3[] {
  const list: PaletteFaultV3[] = [];
  if (hero === null) {
    list.push({
      code: 'no-chromatic-hero',
      refs: [],
      message: `No opaque color reaches OKLCH chroma ${PALETTE_HERO_MINIMUM_CHROMA_V3}; the palette has no chromatic hero.`,
    });
  }
  const opaqueNeutrals = measured.filter(entry => entry.color.opaque && entry.color.isNeutral);
  const distinctNeutrals = new Set(opaqueNeutrals.map(entry => entry.rgbIdentity));
  if (distinctNeutrals.size < 2) {
    list.push({
      code: 'neutral-pair-missing',
      refs: opaqueNeutrals.map(entry => ref(entry.color)),
      message: 'Fewer than two distinct opaque neutrals were observed.',
    });
  } else if (
    !opaqueNeutrals.some(entry => entry.luminance >= 0.5) ||
    !opaqueNeutrals.some(entry => entry.luminance < 0.5)
  ) {
    list.push({
      code: 'neutral-polarity-missing',
      refs: opaqueNeutrals.map(entry => ref(entry.color)),
      message:
        'Opaque neutrals do not include both a light surface (relative luminance ≥ 0.5) and a dark surface.',
    });
  }
  duplicates.forEach(pair => {
    list.push({
      code: 'near-duplicate',
      refs: [pair.first, pair.second],
      message: `${formatRefs([pair.first, pair.second])} differ by ΔE OK ${pair.deltaEOk.toFixed(4)}, below ${PALETTE_NEAR_DUPLICATE_DELTA_E_OK_V3}.`,
    });
  });
  groups.filter(hasDuplicateSteps).forEach(group => {
    const refs = sortedMembers(group).map(entry => ref(entry.color));
    list.push({
      code: 'duplicate-scale-step',
      refs,
      message: `Scale ${group.scaleName}${group.mode ? ` (${group.mode})` : ''} repeats a numeric step, so its ladder order cannot be judged.`,
    });
  });
  uneven.forEach(scale => {
    list.push({
      code: 'uneven-scale',
      refs: scale.refs,
      message: `Scale ${scale.scaleName}${scale.mode ? ` (${scale.mode})` : ''} lightness is not monotonic across steps ${scale.steps.join(', ')}.`,
    });
  });
  return list.sort(
    (left, right) =>
      compareText(left.code, right.code) ||
      compareText(left.refs.map(refKey).join('\u0001'), right.refs.map(refKey).join('\u0001'))
  );
}

function architecture(
  measured: readonly MeasuredColor[],
  hero: PaletteColorRefV3 | null
): PaletteArchitectureV3 {
  const core = measured.filter(entry =>
    nameTokens(entry.color.name).some(token => CORE_VOCABULARY.has(token))
  ).length;
  return { hero: hero !== null, core, extended: measured.length - core };
}

/**
 * Analyzes an observed palette. Input order never matters: entries are sorted
 * by id, mode, hex, and name before any measurement, and every list in the
 * result is sorted deterministically. Duplicate (id, mode) identities and
 * malformed entries fail closed.
 */
export function analyzeColorSystemPaletteV3(
  colors: readonly PaletteAnalysisColorInputV3[]
): ColorSystemPaletteAnalysisV3 {
  if (!Array.isArray(colors)) fail('colors must be an array.');
  const measured = colors.map(measure).sort(compareMeasured);
  const seen = new Set<string>();
  measured.forEach(entry => {
    const key = refKey(entry.color);
    if (seen.has(key)) fail(`Duplicate palette identity ${formatRefs([entry.color])}.`);
    seen.add(key);
  });
  const hero = selectHero(measured);
  const duplicates = nearDuplicates(measured);
  const groups = scaleGroups(measured);
  const uneven = unevenScales(groups);
  const content = {
    analysisVersion: measured.some(entry => entry.color.value?.representation)
      ? COLOR_SYSTEM_PALETTE_ANALYSIS_V3_NATIVE_VERSION
      : COLOR_SYSTEM_PALETTE_ANALYSIS_V3_VERSION,
    colors: measured.map(entry => entry.color),
    hero,
    chromaticCount: measured.filter(entry => !entry.color.isNeutral).length,
    neutralCount: measured.filter(entry => entry.color.isNeutral).length,
    neutralTemperature: neutralTemperature(measured),
    existingPairs: existingPairs(measured),
    nearDuplicates: duplicates,
    unevenScales: uneven,
    architecture: architecture(measured, hero),
    faults: faults(measured, hero, duplicates, groups, uneven),
  };
  return { ...content, analysisHash: deterministicContentHash(content) };
}
