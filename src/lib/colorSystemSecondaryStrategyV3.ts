/**
 * Pure Secondary strategy planning for the Intelligent Color System Builder.
 *
 * The planner measures the brand's confirmed palette, admits its own chromatic
 * colors as exact scale anchors, pairs each recorded tint with the family it
 * names, adds one tinted neutral ramp, reserves a conventional hue for each
 * status role the palette leaves uncovered, and sizes each review direction
 * from the confirmed jobs: Derived adds only the accents the jobs force,
 * Complementary adds a complementary pair, Spectrum adds the accents the
 * categorical series count needs. Every number here is computed from the
 * palette; nothing is a fixed hue wheel.
 *
 * p3-H. An owned hue is never dropped to fit the family ceiling: a palette with
 * more hues than the ceiling allows fails closed with a plain message. When the
 * ceiling binds, accents give way first (Spectrum's series accents, then the
 * complementary pair), then status reserves; every reserve that is skipped or
 * dropped is recorded with the anchor it collided with so the review can say so.
 *
 * p4-A. Every offered direction realizes a different family set. Spectrum adds at
 * least one hue-spaced accent, placed in the widest hue gap between the anchors it
 * must keep clear of, whenever the ceiling leaves room; Complementary adds at least
 * one complementary accent. A direction that would repeat Derived's family set
 * exactly (no room at the ceiling, no accent that keeps separation, or a preserved
 * Secondary section) is not offered, and the plan states why in its place.
 *
 * Invariants: no randomness, no clock, no Figma, no network, no imports from
 * the intent policy or the source compiler. Anchor arithmetic mirrors the
 * engine exactly so a planned recipe reproduces the planned color.
 */

import { generateColorScale, generateColorScaleFromSrgbV1, mapOklchToSrgb } from './colorScale';
import { buildColorSystemBrandFitProfileV2 } from './colorSystemBuilderV2Integrity';
import {
  lowerColorSystemBrandConstraintsV1,
  type ColorSystemBrandConstraintsV1,
} from './colorSystemBrandConstraintsV1';
import { canonicalJson, canonicalNumber } from './colorSystemHashing';
import {
  canonicalizeColorSystemOklchV1,
  colorSystemTerritoryContainsOklchV1,
} from './colorSystemPerceptualBoundsV1';
import {
  colorSystemSrgbToOklchV1,
  colorSystemSrgbToRgbV1,
  normalizeColorSystemSrgbValueV1,
} from './colorSystemSrgbValueV1';
import { paletteNumericPathV3 } from './colorSystemPaletteAnalysisV3';
import {
  COLOR_SYSTEM_BUILDER_V2_LIMITS,
  COLOR_SYSTEM_SECONDARY_DIRECTION_IDS_V2,
  COLOR_SYSTEM_SECTION_ROLES_V2,
  COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2,
  COLOR_SYSTEM_STATUS_RESERVE_ROLES_V2,
  type ColorSystemBrandTerritoryV2,
  type ColorSystemColorValueV2,
  type ColorSystemFamilyProminenceV2,
  type ColorSystemJobV2,
  type ColorSystemSecondaryDirectionIdV2,
  type ColorSystemSectionDispositionV2,
  type ColorSystemSectionRoleV2,
  type ColorSystemStatusReserveRoleV2,
} from './colorSystemBuilderV2Contracts';
import { compareText, hexToOklch, hexToRgb, rgbToHex, rgbToOklab } from './utils';

export const COLOR_SYSTEM_SECONDARY_STRATEGY_V3_VERSION = 'teul-secondary-strategy/v3' as const;

export const COLOR_SYSTEM_SECONDARY_DIRECTIONS_V3 = COLOR_SYSTEM_SECONDARY_DIRECTION_IDS_V2;

export type ColorSystemSecondaryDirectionV3 = ColorSystemSecondaryDirectionIdV2;

/** What a direction means once it is computed from the palette instead of constants. */
export type ColorSystemSecondaryStrategyKindV3 = 'derived' | 'complementary' | 'spectrum';

export const COLOR_SYSTEM_SECONDARY_STRATEGY_KIND_BY_DIRECTION_V3: Readonly<
  Record<ColorSystemSecondaryDirectionV3, ColorSystemSecondaryStrategyKindV3>
> = {
  'close-harmony': 'derived',
  'balanced-contrast': 'complementary',
  'wide-spectrum': 'spectrum',
};

export const COLOR_SYSTEM_SECONDARY_STRATEGY_LABEL_V3: Readonly<
  Record<ColorSystemSecondaryStrategyKindV3, string>
> = {
  derived: 'Derived',
  complementary: 'Complementary',
  spectrum: 'Spectrum',
};

export const COLOR_SYSTEM_SECONDARY_ACCENT_KIND_LABEL_V3: Readonly<
  Record<ColorSystemSecondaryStrategyKindV3, string>
> = {
  derived: 'analogous',
  complementary: 'complementary',
  spectrum: 'spectrum',
};

/**
 * OKLCH chroma the hero (the most saturated Primary) and every generated accent
 * must reach. This is the requirement for a color that has to carry a hue on
 * its own; it is not the rule for admitting an observed color.
 */
export const COLOR_SYSTEM_SECONDARY_CHROMATIC_MINIMUM_CHROMA_V3 = 0.04;
/** Measured neutral rule shared with the composer: Light step-9 chroma below this is a neutral. */
export const COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3 = 0.03;
/**
 * p3-H. An observed opaque Secondary color at or above this chroma becomes an
 * exact derived family; below it the color is a neutral. The floor equals the
 * neutral rule so the two classes meet with no gap: a recorded color of chroma
 * 0.036 used to be neither chromatic (≥ 0.04) nor neutral (< 0.03) and vanished.
 * The scale generator handles low-chroma anchors, so nothing observed is dropped.
 */
export const COLOR_SYSTEM_SECONDARY_OBSERVED_CHROMATIC_MINIMUM_CHROMA_V3 =
  COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3;
/** Requested step-9 chroma of the tinted neutral ramp. */
export const COLOR_SYSTEM_SECONDARY_NEUTRAL_TARGET_CHROMA_V3 = 0.012;
/** The neutral ramp anchors toward mid lightness so both scale modes get a full ladder. */
export const COLOR_SYSTEM_SECONDARY_NEUTRAL_TARGET_LIGHTNESS_V3 = 0.55;
/** Below this chroma an observed neutral's hue is 8-bit quantization noise, not temperature. */
export const COLOR_SYSTEM_SECONDARY_NEUTRAL_HUE_EVIDENCE_MINIMUM_CHROMA_V3 = 0.002;
/** Enforced minimum ΔEOK between the Light step-9 anchors of two chromatic families. */
export const COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3 = 0.08;
/** Enforced minimum ΔEOK between a neutral anchor and any other family anchor. */
export const COLOR_SYSTEM_SECONDARY_NEUTRAL_SEPARATION_DELTA_E_OK_V3 = 0.04;
/** Half-width of the hue zone reserved around an observed semantic-claim color. */
export const COLOR_SYSTEM_SECONDARY_SEMANTIC_CLAIM_EXCLUSION_DEGREES_V3 = 20;
/** Anchor lightness band for generated accents (checked on step 9, not on every step). */
export const COLOR_SYSTEM_SECONDARY_ACCENT_LIGHTNESS_BAND_V3 = {
  minimum: 0.3,
  maximum: 0.85,
} as const;
/** Twice the chromatic threshold, so a low-chroma primary still yields readable accents. */
export const COLOR_SYSTEM_SECONDARY_ACCENT_MINIMUM_CHROMA_V3 = 0.08;
/**
 * The confirmed handoff carries no owner-supplied series count, so categorical
 * coverage plans for five series; the composer's runtime mark count is separate.
 */
export const COLOR_SYSTEM_SECONDARY_DEFAULT_CATEGORICAL_SERIES_V3 = 5;
/** Existing hues closer than this are one hue cluster when counting coverage. */
export const COLOR_SYSTEM_SECONDARY_HUE_CLUSTER_DEGREES_V3 = 15;
/** Analogous accents stay within this many degrees of the hero hue. */
export const COLOR_SYSTEM_SECONDARY_ANALOGOUS_RANGE_DEGREES_V3 = 30;
/** Complementary accents stay within this many degrees of the hero hue + 180°. */
export const COLOR_SYSTEM_SECONDARY_COMPLEMENTARY_RANGE_DEGREES_V3 = 30;
/** The Complementary direction adds this many complementary accents beyond Derived. */
export const COLOR_SYSTEM_SECONDARY_COMPLEMENTARY_PAIR_COUNT_V3 = 2;
/**
 * p4-A. Spectrum carries at least this many hue-spaced accents when the family
 * ceiling leaves room, even when the palette's hue clusters already cover the
 * categorical series; otherwise it would realize Derived's family set exactly.
 */
export const COLOR_SYSTEM_SECONDARY_SPECTRUM_MINIMUM_ACCENT_COUNT_V3 = 1;

/**
 * Conventional status reserves. A meaning role whose OKLCH hue range holds no
 * confirmed brand hue gets a generated family at the range's conventional
 * centre, eligible for `product-semantics` only. The ranges mirror the
 * application blueprint's semantic hue table (error and destructive share one).
 */
export const COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_ROLES_V3 = COLOR_SYSTEM_STATUS_RESERVE_ROLES_V2;
export type ColorSystemSecondaryStatusReserveRoleV3 = ColorSystemStatusReserveRoleV2;
export const COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_CONTRIBUTION_PREFIX_V3 =
  COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2;
export const COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3: Readonly<
  Record<ColorSystemSecondaryStatusReserveRoleV3, Readonly<{ minimum: number; maximum: number }>>
> = {
  success: { minimum: 120, maximum: 170 },
  warning: { minimum: 55, maximum: 95 },
  error: { minimum: 15, maximum: 45 },
  information: { minimum: 230, maximum: 275 },
};
/** Conventional centre hue of each reserve, in OKLCH degrees. */
export const COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_V3: Readonly<
  Record<ColorSystemSecondaryStatusReserveRoleV3, number>
> = {
  success: 145,
  warning: 75,
  error: 28,
  information: 250,
};
/** The plain color word a reader expects for each role; the hue number is the fact. */
export const COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_COLOR_WORD_V3: Readonly<
  Record<ColorSystemSecondaryStatusReserveRoleV3, string>
> = {
  success: 'green',
  warning: 'amber',
  error: 'red',
  information: 'blue',
};
/** Reserve step-9 chroma follows the hero's chroma inside this band. */
export const COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_CHROMA_BAND_V3 = {
  minimum: 0.08,
  maximum: 0.16,
} as const;
/** Reserve step-9 lightness target: a fill that carries white text where the gamut allows. */
export const COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_TARGET_LIGHTNESS_V3 = 0.55;
/** The only job a status reserve may serve. */
export const COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_JOB_V3: ColorSystemJobV2 = 'product-semantics';
/** Reserves are dropped in this order when the bounded family maximum is exceeded. */
const STATUS_RESERVE_DROP_ORDER: readonly ColorSystemSecondaryStatusReserveRoleV3[] = [
  'information',
  'warning',
  'success',
  'error',
];
const STATUS_RESERVE_DISPLAY_NAME_PATTERN =
  /^Status reserve — (success|warning|error|information)\b/;

const HUE_STEP_DEGREES = 5;
const CHROMA_SCALE_OPTIONS = [1, 0.85, 0.7] as const;
/**
 * Low-chroma hero rule. When the hero's own chroma is at or below the accent
 * floor, every fraction of it would collapse onto the floor and a 60° band
 * could not hold two separated accents; the options step up from the floor
 * instead. The top option is 2.4× a chroma-0.05 hero, which is why the seed
 * chroma-scale ceiling is 3.
 */
const LOW_CHROMA_ACCENT_TARGETS = [0.12, 0.1, 0.08] as const;
const MAXIMUM_SEED_CHROMA_SCALE = 3;
const MINIMUM_SEED_CHROMA_SCALE = 0.02;
/**
 * 8-bit quantization moves the hue of a chroma-0.04 color by about 3°, and of
 * darker low-chroma colors by a little more. Planned accents keep this margin
 * from a reserved zone, and a realized anchor may exceed its strategy band by it.
 */
const HUE_QUANTIZATION_GUARD_DEGREES = 5;
const SEMANTIC_CLAIM_HUE_GUARD_DEGREES = HUE_QUANTIZATION_GUARD_DEGREES;
const LIGHTNESS_SHIFT_LIMIT = 0.25;
const DARK_LIGHTNESS_MAXIMUM = 0.4;
const LIGHT_LIGHTNESS_MINIMUM = 0.72;
const DARK_HERO_ACCENT_LIGHTNESS_CEILING = 0.78;
const LIGHT_HERO_ACCENT_LIGHTNESS_FLOOR = 0.35;
/**
 * Separation is ranked in one-JND buckets (0.02 ΔEOK is roughly the smallest
 * difference most people notice), so candidates that differ by less than a JND
 * tie and fall to the hue-spread and gamut keys instead of a hair of ΔEOK.
 */
const SEPARATION_RANK_BUCKET_DELTA_E_OK = 0.02;
const NEUTRAL_EXCLUDED_JOBS: ReadonlySet<ColorSystemJobV2> = new Set<ColorSystemJobV2>([
  'categorical-data',
  'diverging-data',
  'marketing-accent',
  'product-semantics',
]);

/**
 * Accent lightness targets relative to the hero, cycled by slot. The first
 * entry is the rule (dark hero: +0.20, light hero: −0.20, mid hero: ±0.12);
 * later entries give additional slots their own lightness level so separation
 * does not have to come from hue alone inside a narrow band.
 */
const LIGHTNESS_SHIFT_CYCLE: Readonly<
  Record<ColorSystemSecondaryLightnessClassV3, readonly number[]>
> = {
  dark: [0.2, 0.12, 0.25, 0.16],
  light: [-0.2, -0.12, -0.25, -0.16],
  mid: [0.12, -0.12, 0.24, -0.24],
};

export type ColorSystemSecondaryLightnessClassV3 = 'dark' | 'mid' | 'light';
export type ColorSystemSecondaryHueTemperatureV3 = 'warm' | 'cool';
export type ColorSystemSecondarySemanticClaimKindV3 = 'success' | 'error' | 'warning' | 'info';
export type ColorSystemSecondaryFamilyKindV3 = 'derived' | 'neutral' | 'accent' | 'reserve';

const SEMANTIC_CLAIM_WORDS: Readonly<
  Record<ColorSystemSecondarySemanticClaimKindV3, readonly string[]>
> = {
  success: ['success', 'successful'],
  error: ['error', 'danger', 'destructive', 'failure', 'critical'],
  warning: ['warning', 'warn', 'caution'],
  info: ['info', 'information', 'informational', 'notice'],
};

export interface ColorSystemSecondaryOklchV3 {
  l: number;
  c: number;
  h: number;
}

export class ColorSystemSecondaryStrategyV3Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ColorSystemSecondaryStrategyV3Error';
  }
}

function fail(message: string): never {
  throw new ColorSystemSecondaryStrategyV3Error(message);
}

/* ------------------------------------------------------------------------ */
/* Color math shared with the engine and the review model                    */
/* ------------------------------------------------------------------------ */

/**
 * Decision inputs and serialized OKLCH evidence are canonicalized by the shared
 * `canonicalNumber` policy; a powerless hue (CSS Color 4 "missing" component)
 * is stored as the deterministic placeholder `{ c: 0, h: 0 }`.
 */
export function canonicalizeColorSystemSecondaryOklchV3(
  value: ColorSystemSecondaryOklchV3
): ColorSystemSecondaryOklchV3 {
  return canonicalizeColorSystemOklchV1(value);
}

export function normalizeColorSystemSecondaryHexV3(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r, g, b).toUpperCase();
}

export function colorSystemSecondaryOklchFromHexV3(hex: string): ColorSystemSecondaryOklchV3 {
  return canonicalizeColorSystemSecondaryOklchV3(hexToOklch(hex));
}

export type ColorSystemSecondaryColorInputV3 = string | ColorSystemColorValueV2;

export function colorSystemSecondaryOklchFromValueV3(
  value: ColorSystemSecondaryColorInputV3
): ColorSystemSecondaryOklchV3 {
  return typeof value !== 'string' && value.representation
    ? canonicalizeColorSystemSecondaryOklchV3(colorSystemSrgbToOklchV1(value))
    : colorSystemSecondaryOklchFromHexV3(typeof value === 'string' ? value : value.hex);
}

export function colorSystemSecondaryColorIdentityV3(
  value: ColorSystemSecondaryColorInputV3
): string {
  return typeof value !== 'string' && value.representation
    ? value.representation.exactValueHash
    : normalizeColorSystemSecondaryHexV3(typeof value === 'string' ? value : value.hex);
}

function colorRgb(value: ColorSystemSecondaryColorInputV3) {
  return typeof value !== 'string' && value.representation
    ? colorSystemSrgbToRgbV1(value)
    : hexToRgb(typeof value === 'string' ? value : value.hex);
}

export function colorSystemSecondaryDeltaEOKV3(
  firstValue: ColorSystemSecondaryColorInputV3,
  secondValue: ColorSystemSecondaryColorInputV3
): number {
  const first = colorRgb(firstValue);
  const second = colorRgb(secondValue);
  const firstLab = rgbToOklab(first.r, first.g, first.b);
  const secondLab = rgbToOklab(second.r, second.g, second.b);
  return canonicalNumber(
    Math.sqrt(
      Math.pow(firstLab.L - secondLab.L, 2) +
        Math.pow(firstLab.a - secondLab.a, 2) +
        Math.pow(firstLab.b - secondLab.b, 2)
    )
  );
}

/**
 * Wraps a hue into [0, 360) under the shared numeric policy. The input is
 * canonicalized first (so 359.9999999999999 becomes 360 and wraps to 0), then
 * wrapped once, then canonicalized again so runtime noise a hair below zero
 * (-1e-20 + 360 is exactly 360 in binary64) lands on 0 rather than on 360.
 * Already-normalized fractional hues are preserved exactly; -0 becomes 0.
 */
export function normalizeColorSystemSecondaryHueV3(value: number): number {
  const wrapped = canonicalNumber(value) % 360;
  const positive = canonicalNumber(wrapped < 0 ? wrapped + 360 : wrapped);
  return positive >= 360 ? 0 : positive;
}

/** Shortest angular distance between two hues, from 0 through 180. */
export function colorSystemSecondaryHueDistanceV3(first: number, second: number): number {
  const difference = Math.abs(normalizeColorSystemSecondaryHueV3(first - second));
  return difference > 180 ? 360 - difference : difference;
}

/** Signed rotation from one hue to another, from -180 through 180. */
export function colorSystemSecondarySignedHueOffsetV3(from: number, to: number): number {
  const offset = normalizeColorSystemSecondaryHueV3(to - from);
  return offset > 180 ? offset - 360 : offset;
}

/** Inclusive membership in a hue range; a range whose minimum exceeds its maximum wraps through 0°. */
export function colorSystemSecondaryHueWithinRangeV3(
  hue: number,
  range: Readonly<{ minimum: number; maximum: number }>
): boolean {
  const value = normalizeColorSystemSecondaryHueV3(hue);
  const minimum = normalizeColorSystemSecondaryHueV3(range.minimum);
  const maximum = normalizeColorSystemSecondaryHueV3(range.maximum);
  if (minimum <= maximum) return value >= minimum && value <= maximum;
  return value >= minimum || value <= maximum;
}

export function colorSystemSecondaryStatusReserveContributionIdV3(
  role: ColorSystemSecondaryStatusReserveRoleV3
): string {
  return `${COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_CONTRIBUTION_PREFIX_V3}${role}`;
}

export function colorSystemSecondaryStatusReserveDisplayNameV3(
  role: ColorSystemSecondaryStatusReserveRoleV3
): string {
  return `Status reserve — ${role}`;
}

/**
 * A family is a status reserve by identity (its contribution id) or, when the
 * caller has no contribution id, by the planner's own display-name form.
 */
export function colorSystemSecondaryStatusReserveRoleV3(input: {
  contributionId?: string | null;
  displayName?: string | null;
}): ColorSystemSecondaryStatusReserveRoleV3 | null {
  const fromContribution = input.contributionId?.startsWith(
    COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_CONTRIBUTION_PREFIX_V3
  )
    ? input.contributionId.slice(
        COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_CONTRIBUTION_PREFIX_V3.length
      )
    : null;
  const fromName = input.displayName?.match(STATUS_RESERVE_DISPLAY_NAME_PATTERN)?.[1] ?? null;
  const role = fromContribution ?? fromName;
  return role !== null &&
    (COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_ROLES_V3 as readonly string[]).includes(role)
    ? (role as ColorSystemSecondaryStatusReserveRoleV3)
    : null;
}

export function classifyColorSystemSecondaryLightnessV3(
  lightness: number
): ColorSystemSecondaryLightnessClassV3 {
  if (lightness < DARK_LIGHTNESS_MAXIMUM) return 'dark';
  if (lightness > LIGHT_LIGHTNESS_MINIMUM) return 'light';
  return 'mid';
}

export function isColorSystemSecondaryNeutralHexV3(hex: string): boolean {
  return (
    colorSystemSecondaryOklchFromHexV3(hex).c < COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3
  );
}

/**
 * OKLCH hue in degrees: red sits near 30°, yellow near 90°, green near 145°,
 * cyan near 195°, blue near 265°, magenta near 330°. The number is the fact;
 * the word only helps a reader place it.
 */
export function describeColorSystemSecondaryHueTemperatureV3(
  hue: number
): ColorSystemSecondaryHueTemperatureV3 {
  const normalized = normalizeColorSystemSecondaryHueV3(hue);
  return normalized < 130 || normalized >= 340 ? 'warm' : 'cool';
}

export interface ColorSystemSecondaryAnchorTransformV3 {
  hueOffsetDegrees: number;
  chromaScale: number;
  lightnessShift: number;
}

/**
 * The single anchor formula used by the planner and the engine. Base and
 * recipe transforms are applied exactly as the engine applies them, so a
 * planned recipe realizes the planned color, preserving native identity anchors.
 */
export function realizeColorSystemSecondaryAnchorV3(
  sourceValue: ColorSystemSecondaryColorInputV3,
  base: ColorSystemSecondaryAnchorTransformV3,
  recipe: ColorSystemSecondaryAnchorTransformV3
): {
  requested: ColorSystemSecondaryOklchV3;
  hex: string;
  mapped: boolean;
  value?: ColorSystemColorValueV2;
} {
  const value =
    typeof sourceValue === 'string' ? undefined : normalizeColorSystemSrgbValueV1(sourceValue);
  const normalizedSource = normalizeColorSystemSecondaryHexV3(
    typeof sourceValue === 'string' ? sourceValue : sourceValue.hex
  );
  const source = colorSystemSecondaryOklchFromValueV3(value ?? normalizedSource);
  // An identity transform is the exact source, so no color math runs: the lightness
  // clamp below would otherwise move a source lighter than L 0.95 or darker than
  // L 0.05, and a derived family must reproduce the confirmed color, not a neighbor.
  if (isIdentityTransform(base) && isIdentityTransform(recipe)) {
    return {
      requested: source,
      hex: normalizedSource,
      mapped: false,
      ...(value?.representation ? { value } : {}),
    };
  }
  const requested = {
    l: Math.max(0.05, Math.min(0.95, source.l + base.lightnessShift + recipe.lightnessShift)),
    c: Math.max(0, Math.min(0.5, source.c * base.chromaScale * recipe.chromaScale)),
    h: normalizeColorSystemSecondaryHueV3(
      source.h + base.hueOffsetDegrees + recipe.hueOffsetDegrees
    ),
  };
  const mapped = mapOklchToSrgb(requested);
  return { requested, hex: normalizeColorSystemSecondaryHexV3(mapped.hex), mapped: mapped.mapped };
}

const IDENTITY_TRANSFORM: ColorSystemSecondaryAnchorTransformV3 = {
  hueOffsetDegrees: 0,
  chromaScale: 1,
  lightnessShift: 0,
};

function isIdentityTransform(transform: ColorSystemSecondaryAnchorTransformV3): boolean {
  return (
    transform.hueOffsetDegrees === 0 &&
    transform.chromaScale === 1 &&
    transform.lightnessShift === 0
  );
}

/* ------------------------------------------------------------------------ */
/* Palette measurement                                                       */
/* ------------------------------------------------------------------------ */

export interface ColorSystemSecondaryMeasurementColorInputV3 {
  stableColorId: string;
  displayName: string;
  section: ColorSystemSectionRoleV2;
  valuesByMode: Readonly<Record<string, ColorSystemColorValueV2>>;
  retention: 'preserved' | 'evidence-only';
  evidenceIds: readonly string[];
}

export interface ColorSystemSecondaryMeasuredColorV3 {
  stableColorId: string;
  displayName: string;
  section: ColorSystemSectionRoleV2;
  mode: string;
  hex: string;
  value?: ColorSystemColorValueV2;
  oklch: ColorSystemSecondaryOklchV3;
  retention: 'preserved' | 'evidence-only';
  evidenceIds: readonly string[];
}

export interface ColorSystemSecondarySemanticClaimV3 {
  stableColorId: string;
  displayName: string;
  claim: ColorSystemSecondarySemanticClaimKindV3;
  hex: string;
  hue: number;
  evidenceIds: readonly string[];
}

/**
 * p3-H. A recorded tint paired to the observed color whose family it belongs to.
 * `light-suffix`: the name is the base name plus a final `Light` word
 * (`Sky Light`, `Sky/Light`, `sky-light`). `numeric-path`: a lighter sibling on
 * the same numeric path (`Blue/100` beside `Blue/500`) whose chroma is below the
 * observed floor, so no chromatic ladder step is demoted from its own family. A
 * named tint is a tint whatever its chroma. Tints pin into their family's Light
 * scale downstream and are never their own family.
 */
export interface ColorSystemSecondaryObservedTintV3 {
  stableColorId: string;
  displayName: string;
  baseStableColorId: string;
  baseDisplayName: string;
  rule: 'light-suffix' | 'numeric-path';
  /** The opaque value that pins: the Light mode when present, else the first opaque mode. */
  value: ColorSystemSecondaryMeasuredColorV3;
}

export interface ColorSystemSecondaryPaletteMeasurementV3 {
  version: 'teul-secondary-palette-measurement/v3';
  /** Highest-chroma opaque confirmed Primary value, or null when none is chromatic. */
  hero: ColorSystemSecondaryMeasuredColorV3 | null;
  heroLightnessClass: ColorSystemSecondaryLightnessClassV3 | null;
  /**
   * Every non-Primary observed color at or above the observed chromatic floor,
   * one preferred mode per color, Secondary section first. Paired tints are
   * listed under `observedTints` instead.
   */
  observedChromatic: readonly ColorSystemSecondaryMeasuredColorV3[];
  /** p3-H: recorded tints paired by name to the observed color they belong to. */
  observedTints: readonly ColorSystemSecondaryObservedTintV3[];
  /** Every opaque value below the neutral chroma rule, across all sections and modes. */
  observedNeutrals: readonly ColorSystemSecondaryMeasuredColorV3[];
  neutralHue: {
    degrees: number | null;
    source: 'observed-neutrals' | 'hero' | 'none';
    /** Observed neutrals that carried hue evidence above the quantization floor. */
    evidenceCount: number;
  };
  /** Hero plus observed chromatic hues, clustered at the coverage resolution. */
  existingHueClusterCount: number;
  semanticClaims: readonly ColorSystemSecondarySemanticClaimV3[];
}

function sectionRank(section: ColorSystemSectionRoleV2): number {
  return COLOR_SYSTEM_SECTION_ROLES_V2.indexOf(section);
}

function measuredValue(
  color: ColorSystemSecondaryMeasurementColorInputV3,
  mode: string,
  value: ColorSystemColorValueV2
): ColorSystemSecondaryMeasuredColorV3 {
  const normalized = normalizeColorSystemSrgbValueV1(value);
  const hex = normalizeColorSystemSecondaryHexV3(normalized.hex);
  return {
    stableColorId: color.stableColorId,
    displayName: color.displayName,
    section: color.section,
    mode,
    hex,
    ...(normalized.representation ? { value: normalized } : {}),
    oklch: colorSystemSecondaryOklchFromValueV3(normalized),
    retention: color.retention,
    evidenceIds: [...new Set(color.evidenceIds)].sort(compareText),
  };
}

function opaqueValues(
  color: ColorSystemSecondaryMeasurementColorInputV3
): ColorSystemSecondaryMeasuredColorV3[] {
  return Object.entries(color.valuesByMode)
    .filter(([, value]) => value.alpha === 1)
    .sort(([left], [right]) => compareText(left, right))
    .map(([mode, value]) => measuredValue(color, mode, value));
}

/** The hero and generated-accent requirement (0.04). */
function isChromatic(value: ColorSystemSecondaryMeasuredColorV3): boolean {
  return value.oklch.c >= COLOR_SYSTEM_SECONDARY_CHROMATIC_MINIMUM_CHROMA_V3;
}

/** The observed-color rule (0.03): anything not a neutral is an exact family. */
function isObservedChromatic(value: ColorSystemSecondaryMeasuredColorV3): boolean {
  return value.oklch.c >= COLOR_SYSTEM_SECONDARY_OBSERVED_CHROMATIC_MINIMUM_CHROMA_V3;
}

/**
 * Name tokens as the palette analysis tokenizes them (NFKC, lower-case, split on
 * anything that is not a letter or digit), so a tint pairs the way the analysis
 * would read the same name.
 */
function nameTokens(displayName: string): string[] {
  return displayName
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 0);
}

function nameKey(displayName: string): string {
  return nameTokens(displayName).join('/');
}

/** `<base> Light` in any separator form: the base key, or null. */
function lightSuffixBaseKey(displayName: string): string | null {
  const tokens = nameTokens(displayName);
  if (tokens.length < 2 || tokens[tokens.length - 1] !== 'light') return null;
  return tokens.slice(0, -1).join('/');
}

/** The opaque value a tint pins with: Light mode when present, else the first opaque mode. */
function preferredOpaqueMode(
  color: ColorSystemSecondaryMeasurementColorInputV3
): ColorSystemSecondaryMeasuredColorV3 | null {
  const opaque = opaqueValues(color);
  if (opaque.length === 0) return null;
  return opaque.find(value => value.mode === 'Light') ?? opaque[0];
}

function compareChromaDescending(
  left: ColorSystemSecondaryMeasuredColorV3,
  right: ColorSystemSecondaryMeasuredColorV3
): number {
  return (
    right.oklch.c - left.oklch.c ||
    compareText(left.stableColorId, right.stableColorId) ||
    compareText(left.mode, right.mode)
  );
}

/** The hero rule: the most saturated opaque confirmed Primary value across modes. */
export function pickColorSystemSecondaryHeroV3(
  colors: readonly ColorSystemSecondaryMeasurementColorInputV3[]
): ColorSystemSecondaryMeasuredColorV3 | null {
  const candidates = colors
    .filter(color => color.section === 'primary')
    .flatMap(opaqueValues)
    .filter(isChromatic)
    .sort(compareChromaDescending);
  return candidates[0] ?? null;
}

function preferredChromaticMode(
  color: ColorSystemSecondaryMeasurementColorInputV3,
  predicate: (value: ColorSystemSecondaryMeasuredColorV3) => boolean = isChromatic
): ColorSystemSecondaryMeasuredColorV3 | null {
  const chromatic = opaqueValues(color).filter(predicate);
  if (chromatic.length === 0) return null;
  const light = chromatic.find(value => value.mode === 'Light');
  return light ?? [...chromatic].sort(compareChromaDescending)[0];
}

/**
 * p3-H. Pairs recorded tints with the observed color they belong to. A base is
 * any color with an opaque value at or above the observed chromatic floor (the
 * hero included). The light-suffix rule pairs by exact base key; when several
 * colors share the key the same section wins and a remaining tie pairs nothing.
 * The numeric-path rule pairs a pale (below-floor) sibling with the nearest
 * darker chromatic sibling on its path.
 */
function pairObservedTints(
  colors: readonly ColorSystemSecondaryMeasurementColorInputV3[]
): ColorSystemSecondaryObservedTintV3[] {
  const bases = colors
    .map(color => ({ color, value: preferredChromaticMode(color, isObservedChromatic) }))
    .filter(
      (
        entry
      ): entry is { color: (typeof colors)[number]; value: ColorSystemSecondaryMeasuredColorV3 } =>
        entry.value !== null
    );
  const basesByKey = new Map<string, typeof bases>();
  bases.forEach(entry => {
    const key = nameKey(entry.color.displayName);
    basesByKey.set(key, [...(basesByKey.get(key) ?? []), entry]);
  });
  const tints: ColorSystemSecondaryObservedTintV3[] = [];
  const claimed = new Set<string>();
  const pair = (
    color: ColorSystemSecondaryMeasurementColorInputV3,
    base: (typeof bases)[number],
    rule: ColorSystemSecondaryObservedTintV3['rule']
  ) => {
    const value = preferredOpaqueMode(color);
    if (!value || claimed.has(color.stableColorId)) return;
    claimed.add(color.stableColorId);
    tints.push({
      stableColorId: color.stableColorId,
      displayName: color.displayName,
      baseStableColorId: base.color.stableColorId,
      baseDisplayName: base.color.displayName,
      rule,
      value,
    });
  };
  // Rule 1: `<base> Light`.
  colors.forEach(color => {
    const baseKey = lightSuffixBaseKey(color.displayName);
    if (baseKey === null) return;
    const candidates = (basesByKey.get(baseKey) ?? []).filter(
      entry => entry.color.stableColorId !== color.stableColorId
    );
    const sameSection = candidates.filter(entry => entry.color.section === color.section);
    const chosen =
      sameSection.length === 1 ? sameSection[0] : candidates.length === 1 ? candidates[0] : null;
    if (chosen) pair(color, chosen, 'light-suffix');
  });
  // Rule 2: a pale sibling on a numeric path pairs with the nearest darker chromatic sibling.
  const chromaticByPath = new Map<string, typeof bases>();
  bases.forEach(entry => {
    const path = paletteNumericPathV3(entry.color.displayName);
    if (!path) return;
    const key = `${entry.color.section}\u0000${path.scaleName}`;
    chromaticByPath.set(key, [...(chromaticByPath.get(key) ?? []), entry]);
  });
  colors.forEach(color => {
    if (claimed.has(color.stableColorId)) return;
    const path = paletteNumericPathV3(color.displayName);
    if (!path) return;
    const value = preferredOpaqueMode(color);
    if (!value || isObservedChromatic(value)) return;
    const siblings = (chromaticByPath.get(`${color.section}\u0000${path.scaleName}`) ?? [])
      .filter(entry => entry.value.oklch.l < value.oklch.l)
      .sort(
        (left, right) =>
          right.value.oklch.l - left.value.oklch.l ||
          compareText(left.color.stableColorId, right.color.stableColorId)
      );
    if (siblings.length > 0) pair(color, siblings[0], 'numeric-path');
  });
  return tints.sort(
    (left, right) =>
      compareText(left.baseStableColorId, right.baseStableColorId) ||
      compareText(left.stableColorId, right.stableColorId)
  );
}

function detectSemanticClaim(displayName: string): ColorSystemSecondarySemanticClaimKindV3 | null {
  const tokens = new Set(
    displayName
      .toLocaleLowerCase('en-US')
      .split(/[^a-z]+/)
      .filter(Boolean)
  );
  const claims = (
    Object.keys(SEMANTIC_CLAIM_WORDS) as ColorSystemSecondarySemanticClaimKindV3[]
  ).filter(claim => SEMANTIC_CLAIM_WORDS[claim].some(word => tokens.has(word)));
  return claims.length === 1 ? claims[0] : null;
}

function circularMeanHue(entries: readonly { hue: number; weight: number }[]): number | null {
  let x = 0;
  let y = 0;
  for (const entry of entries) {
    const radians = (entry.hue * Math.PI) / 180;
    x += Math.cos(radians) * entry.weight;
    y += Math.sin(radians) * entry.weight;
  }
  if (Math.hypot(x, y) < 1e-9) return null;
  return canonicalNumber(normalizeColorSystemSecondaryHueV3((Math.atan2(y, x) * 180) / Math.PI));
}

export function countColorSystemSecondaryHueClustersV3(hues: readonly number[]): number {
  if (hues.length === 0) return 0;
  const sorted = [...hues].map(normalizeColorSystemSecondaryHueV3).sort((a, b) => a - b);
  const clusterStarts: number[] = [];
  for (const hue of sorted) {
    const start = clusterStarts[clusterStarts.length - 1];
    if (start === undefined || hue - start > COLOR_SYSTEM_SECONDARY_HUE_CLUSTER_DEGREES_V3) {
      clusterStarts.push(hue);
    }
  }
  if (
    clusterStarts.length > 1 &&
    clusterStarts[0] + 360 - sorted[sorted.length - 1] <=
      COLOR_SYSTEM_SECONDARY_HUE_CLUSTER_DEGREES_V3
  ) {
    return clusterStarts.length - 1;
  }
  return clusterStarts.length;
}

export function measureColorSystemSecondaryPaletteV3(
  colors: readonly ColorSystemSecondaryMeasurementColorInputV3[]
): ColorSystemSecondaryPaletteMeasurementV3 {
  const hero = pickColorSystemSecondaryHeroV3(colors);
  const observedTints = pairObservedTints(colors);
  const tintIds = new Set(observedTints.map(tint => tint.stableColorId));
  const observedChromatic = colors
    .filter(color => color.section !== 'primary' && !tintIds.has(color.stableColorId))
    .flatMap(color => {
      const preferred = preferredChromaticMode(color, isObservedChromatic);
      return preferred ? [preferred] : [];
    })
    .sort(
      (left, right) =>
        sectionRank(left.section) - sectionRank(right.section) ||
        compareChromaDescending(left, right)
    );
  const observedNeutrals = colors
    .flatMap(opaqueValues)
    .filter(value => value.oklch.c < COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3)
    .sort(
      (left, right) =>
        sectionRank(left.section) - sectionRank(right.section) ||
        compareText(left.stableColorId, right.stableColorId) ||
        compareText(left.mode, right.mode)
    );
  const hueEvidence = observedNeutrals
    .filter(value => value.oklch.c >= COLOR_SYSTEM_SECONDARY_NEUTRAL_HUE_EVIDENCE_MINIMUM_CHROMA_V3)
    .map(value => ({ hue: value.oklch.h, weight: value.oklch.c }));
  const observedMean = circularMeanHue(hueEvidence);
  const neutralHue: ColorSystemSecondaryPaletteMeasurementV3['neutralHue'] =
    observedMean !== null
      ? { degrees: observedMean, source: 'observed-neutrals', evidenceCount: hueEvidence.length }
      : hero
        ? { degrees: hero.oklch.h, source: 'hero', evidenceCount: 0 }
        : { degrees: null, source: 'none', evidenceCount: 0 };
  const semanticClaims = colors
    .filter(color => color.retention === 'preserved')
    .flatMap(color => {
      const claim = detectSemanticClaim(color.displayName);
      const preferred = claim ? preferredChromaticMode(color) : null;
      return claim && preferred
        ? [
            {
              stableColorId: color.stableColorId,
              displayName: color.displayName,
              claim,
              hex: preferred.hex,
              hue: preferred.oklch.h,
              evidenceIds: preferred.evidenceIds,
            },
          ]
        : [];
    })
    .sort((left, right) => compareText(left.stableColorId, right.stableColorId));
  return {
    version: 'teul-secondary-palette-measurement/v3',
    hero,
    heroLightnessClass: hero ? classifyColorSystemSecondaryLightnessV3(hero.oklch.l) : null,
    observedChromatic,
    observedTints,
    observedNeutrals,
    neutralHue,
    existingHueClusterCount: countColorSystemSecondaryHueClustersV3([
      ...(hero ? [hero.oklch.h] : []),
      ...observedChromatic.map(value => value.oklch.h),
    ]),
    semanticClaims,
  };
}

/* ------------------------------------------------------------------------ */
/* Strategy planning                                                         */
/* ------------------------------------------------------------------------ */

export interface ColorSystemSecondaryStrategyPlanInputV3 {
  measurement: ColorSystemSecondaryPaletteMeasurementV3;
  requiredJobs: readonly ColorSystemJobV2[];
  secondaryDisposition: ColorSystemSectionDispositionV2;
  /** Ordered slot identities for chromatic families; the planner consumes them in order. */
  chromaticContributionIds: readonly string[];
  neutralContributionId: string;
  /** Contribution identities the owner bound to diverging polarity; they must exist as chromatic slots. */
  polarityContributionIds: readonly string[];
  policyEvidenceId: string;
  /** Adopted generic rules narrow the existing profile before candidate enumeration. */
  reviewedBrandConstraints?: ColorSystemBrandConstraintsV1;
}

export interface ColorSystemSecondaryPlannedRecipeV3 {
  direction: ColorSystemSecondaryDirectionV3;
  hueOffsetDegrees: number;
  chromaScale: number;
  lightnessShift: number;
  displayName: string | null;
  requested: ColorSystemSecondaryOklchV3;
  realizedHex: string;
  value?: ColorSystemColorValueV2;
  /** ΔEOK from the realized anchor to the nearest anchor accepted before it, or null for derived families. */
  minimumSeparationDeltaEOK: number | null;
}

export interface ColorSystemSecondaryPlannedReserveV3 {
  role: ColorSystemSecondaryStatusReserveRoleV3;
  contributionId: string;
  range: Readonly<{ minimum: number; maximum: number }>;
  /** The conventional centre hue requested for the reserve. */
  hue: number;
  requested: ColorSystemSecondaryOklchV3;
  realizedHex: string;
  realized: ColorSystemSecondaryOklchV3;
  /** ΔEOK to the nearest anchor accepted before the reserve (derived, observed, neutral, earlier reserves). */
  minimumSeparationDeltaEOK: number;
  /** Base transform from the hero that realizes the reserve; identity recipes in every direction. */
  base: ColorSystemSecondaryAnchorTransformV3;
}

export interface ColorSystemSecondaryPlannedFamilyV3 {
  slot: number;
  kind: 'hero' | 'observed' | 'neutral' | 'accent' | 'reserve';
  contributionId: string;
  displayName: string;
  prominence: ColorSystemFamilyProminenceV2;
  territoryId: string;
  anchor: {
    stableColorId: string;
    mode: string;
    hex: string;
    value?: ColorSystemColorValueV2;
    oklch: ColorSystemSecondaryOklchV3;
    displayName: string;
    evidenceIds: readonly string[];
  };
  base: ColorSystemSecondaryAnchorTransformV3;
  recipes: readonly ColorSystemSecondaryPlannedRecipeV3[];
  jobs: readonly ColorSystemJobV2[];
  /** Present on status reserves only. */
  reserve?: ColorSystemSecondaryPlannedReserveV3;
  /**
   * p3-H: present on hero and observed families that own recorded tints. The
   * engine pins each tint into the family's Light scale at the step nearest in
   * lightness when the pinned scale still validates, and records the outcome.
   */
  tints?: readonly ColorSystemSecondaryObservedTintV3[];
}

export type ColorSystemSecondaryPlannedTerritoryV3 = ColorSystemBrandTerritoryV2;

export interface ColorSystemSecondaryPlannedAccentV3 {
  slot: number;
  hue: number;
  lightness: number;
  chroma: number;
  lightnessShift: number;
  realizedHex: string;
  /** ΔEOK to the nearest chromatic anchor accepted before this accent. */
  minimumSeparationDeltaEOK: number;
  /** ΔEOK to the neutral ramp anchor. */
  neutralSeparationDeltaEOK: number | null;
  minimumHueDistanceDegrees: number;
  /**
   * p4-A: the hue gap this accent sits in, measured between the chromatic anchors
   * accepted before it (owned hues, other preserved hues, status reserves, earlier
   * accents), and whether that gap is the widest on the wheel. Null when no
   * chromatic anchor preceded it.
   */
  hueGap: ColorSystemSecondaryHueGapV3 | null;
}

/** p4-A: what a reader would call the anchor on either side of a hue gap. */
export type ColorSystemSecondaryHueGapNeighbourKindV3 = 'owned' | 'reserve' | 'accent';

export interface ColorSystemSecondaryHueGapV3 {
  /** Width in degrees from the anchor below to the anchor above, going up the wheel. */
  widthDegrees: number;
  fromHue: number;
  toHue: number;
  from: { displayName: string; kind: ColorSystemSecondaryHueGapNeighbourKindV3 };
  to: { displayName: string; kind: ColorSystemSecondaryHueGapNeighbourKindV3 };
  /** True when no other gap between those anchors is wider. */
  widest: boolean;
  widestWidthDegrees: number;
}

/** p4-A: why a direction is not offered. */
export type ColorSystemSecondaryDirectionOmissionCauseV3 =
  'family-limit' | 'separation' | 'preserved';

export interface ColorSystemSecondaryDirectionPlanV3 {
  direction: ColorSystemSecondaryDirectionV3;
  kind: ColorSystemSecondaryStrategyKindV3;
  derivedFamilyCount: number;
  reserveFamilyCount: number;
  /** Accent slots this direction fills; slots are shared across directions in order. */
  accentSlotCount: number;
  /** Derived + reserves + neutral + this direction's accent slots. */
  targetFamilyCount: number;
  /**
   * States the count and why, from measurement. For a direction that is not
   * offered this is the omission statement itself.
   */
  reason: string;
  accents: readonly ColorSystemSecondaryPlannedAccentV3[];
  unfilledSlots: readonly number[];
  /**
   * p4-A: whether this direction enters the strategy set. Derived always does; another
   * direction is offered only when it realizes at least one accent of its own, so no
   * two offered directions share a family set.
   */
  offered: boolean;
  omissionCause: ColorSystemSecondaryDirectionOmissionCauseV3 | null;
}

export interface ColorSystemSecondaryStrategyPlanV3 {
  version: typeof COLOR_SYSTEM_SECONDARY_STRATEGY_V3_VERSION;
  measurement: ColorSystemSecondaryPaletteMeasurementV3;
  /** The largest direction target; equals the number of planned families (the contribution union). */
  familyCount: number;
  familyCountByDirection: Readonly<Record<ColorSystemSecondaryDirectionV3, number>>;
  familyCountBand: Readonly<{ minimum: number; maximum: number }>;
  derivedFamilyCount: number;
  reserveFamilyCount: number;
  /** The largest accent slot count across directions. */
  accentSlotCount: number;
  /** Hue count the confirmed jobs ask for (categorical series or two contrasting hues). */
  requiredHueCount: number;
  existingHueClusterCount: number;
  /** Why the accent slot counts are what they are; every term is measured. */
  slotDerivation: {
    /** Accent slots every direction keeps because the owner bound diverging polarity to them. */
    fromPolarity: number;
    /** Accent slots every direction keeps to reach the bounded minimum family target. */
    fromMinimumTarget: number;
    /** Accent slots Spectrum adds for the categorical series count beyond existing hue clusters. */
    fromSeries: number;
    /** Accent slots Complementary adds beyond Derived. */
    fromComplementaryPair: number;
    /**
     * p4-A: accent slots Spectrum carries because of its minimum-one rule beyond what
     * the structure and the series count gave it (1 when the hue clusters already
     * cover the series and nothing forces an accent, else 0).
     */
    fromSpectrumMinimum: number;
  };
  /** Accent contribution identities that carry owner-confirmed polarity, in slot order. */
  polarityAccentContributionIds: readonly string[];
  families: readonly ColorSystemSecondaryPlannedFamilyV3[];
  territories: readonly ColorSystemSecondaryPlannedTerritoryV3[];
  directions: readonly ColorSystemSecondaryDirectionPlanV3[];
  /** p4-A: the directions that enter the strategy set, in review order. */
  offeredDirections: readonly ColorSystemSecondaryDirectionV3[];
  /** p4-A: the directions that are not offered, each with its stated reason. */
  omittedDirections: readonly {
    direction: ColorSystemSecondaryDirectionV3;
    kind: ColorSystemSecondaryStrategyKindV3;
    cause: ColorSystemSecondaryDirectionOmissionCauseV3;
    reason: string;
  }[];
  reserves: readonly ColorSystemSecondaryPlannedReserveV3[];
  /** Status roles the palette already covers, so no reserve was added. */
  coveredStatusRoles: readonly {
    role: ColorSystemSecondaryStatusReserveRoleV3;
    stableColorId: string;
    displayName: string;
    hex: string;
    hue: number;
  }[];
  /**
   * Reserves the palette needed but could not have: `separation` when the
   * realized anchor sat too close to an existing anchor, `family-limit` when the
   * owned hues, the neutral ramp, and earlier reserves filled the ceiling.
   */
  skippedReserves: readonly {
    role: ColorSystemSecondaryStatusReserveRoleV3;
    contributionId: string;
    hue: number;
    realizedHex: string;
    nearestHex: string;
    /** p3-H: the display name of the anchor the reserve collided with. */
    nearestDisplayName: string;
    deltaEOK: number;
    /** p3-H */
    cause: 'separation' | 'family-limit';
    reason: string;
  }[];
  /**
   * Observed Secondary colors that sit within the family separation rule of an
   * accepted family anchor. They are not their own family (the engine would reject
   * two anchors this close) but remain exact source colors; nothing observed is
   * dropped from preservation.
   */
  skippedObserved: readonly {
    stableColorId: string;
    displayName: string;
    hex: string;
    nearestStableColorId: string;
    deltaEOK: number;
  }[];
  /** p3-H: recorded tints whose base did not become a family (a skipped near-duplicate). */
  orphanTints: readonly ColorSystemSecondaryObservedTintV3[];
  /**
   * p3-H: what the family ceiling did to this plan. `derivedCapacity` is the
   * ceiling less the neutral ramp; the counts are accents and reserves removed
   * so the largest direction fits. Owned hues are never among them.
   */
  familyLimit: {
    maximumFamilies: number;
    derivedCapacity: number;
    seriesAccentsRemoved: number;
    pairAccentsRemoved: number;
    /** p4-A: 1 when the ceiling left no room for Spectrum's minimum accent, else 0. */
    spectrumMinimumRemoved: number;
    reservesDropped: number;
  };
}

export const COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3 = {
  derived: 'generic-derived-space',
  neutral: 'generic-neutral-space',
  accent: 'generic-accent-space',
  reserve: 'generic-status-reserve-space',
  semanticClaimPrefix: 'generic-semantic-claim-exclusion',
} as const;

interface AcceptedAnchor {
  hex: string;
  value?: ColorSystemColorValueV2;
  oklch: ColorSystemSecondaryOklchV3;
  neutral: boolean;
  /** What a reader would call this anchor when a reserve collides with it. */
  displayName?: string;
  /** p4-A: how the anchor is named on either side of a hue gap; absent for the neutral ramp. */
  gap?: { displayName: string; kind: ColorSystemSecondaryHueGapNeighbourKindV3 };
}

interface AccentCandidate {
  recipe: ColorSystemSecondaryAnchorTransformV3;
  requested: ColorSystemSecondaryOklchV3;
  realizedHex: string;
  value?: ColorSystemColorValueV2;
  realized: ColorSystemSecondaryOklchV3;
  /** ΔEOK to the nearest accepted chromatic anchor (ranking and the 0.08 gate). */
  minimumSeparation: number;
  /** ΔEOK to the nearest accepted neutral anchor (the 0.04 gate), or null without a neutral. */
  neutralSeparation: number | null;
  minimumHueDistance: number;
  hueAffinity: number;
  mappedSteps: number | null;
}

function separationThreshold(left: AcceptedAnchor, right: { neutral: boolean }): number {
  return left.neutral || right.neutral
    ? COLOR_SYSTEM_SECONDARY_NEUTRAL_SEPARATION_DELTA_E_OK_V3
    : COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3;
}

function clampedAccentLightnessShift(
  heroLightness: number,
  heroClass: ColorSystemSecondaryLightnessClassV3,
  rawShift: number
): number {
  let target = heroLightness + rawShift;
  if (heroClass === 'dark') target = Math.min(target, DARK_HERO_ACCENT_LIGHTNESS_CEILING);
  if (heroClass === 'light') target = Math.max(target, LIGHT_HERO_ACCENT_LIGHTNESS_FLOOR);
  target = Math.max(
    COLOR_SYSTEM_SECONDARY_ACCENT_LIGHTNESS_BAND_V3.minimum,
    Math.min(COLOR_SYSTEM_SECONDARY_ACCENT_LIGHTNESS_BAND_V3.maximum, target)
  );
  const shift = Math.max(
    -LIGHTNESS_SHIFT_LIMIT,
    Math.min(LIGHTNESS_SHIFT_LIMIT, target - heroLightness)
  );
  return canonicalNumber(shift);
}

/**
 * The slot's own lightness level comes first; the other cycle levels follow
 * as fallbacks, tried only when no candidate at the preferred level can keep
 * the separation gates (a narrow band around a low-chroma hero, for example).
 */
function accentLightnessShifts(
  heroLightness: number,
  heroClass: ColorSystemSecondaryLightnessClassV3,
  slotIndex: number
): number[] {
  const cycle = LIGHTNESS_SHIFT_CYCLE[heroClass];
  const preferred = cycle[slotIndex % cycle.length];
  const ordered = [preferred, ...cycle.filter(shift => shift !== preferred)];
  return [
    ...new Set(ordered.map(shift => clampedAccentLightnessShift(heroLightness, heroClass, shift))),
  ];
}

function accentHueOffsets(kind: ColorSystemSecondaryStrategyKindV3): number[] {
  if (kind === 'spectrum') {
    return Array.from({ length: 360 / HUE_STEP_DEGREES }, (_, index) => index * HUE_STEP_DEGREES);
  }
  const center = kind === 'derived' ? 0 : 180;
  const range =
    kind === 'derived'
      ? COLOR_SYSTEM_SECONDARY_ANALOGOUS_RANGE_DEGREES_V3
      : COLOR_SYSTEM_SECONDARY_COMPLEMENTARY_RANGE_DEGREES_V3;
  const steps = range / HUE_STEP_DEGREES;
  return Array.from(
    { length: steps * 2 + 1 },
    (_, index) => center - range + index * HUE_STEP_DEGREES
  );
}

function accentChromaScales(heroChroma: number): number[] {
  const targets =
    heroChroma <= COLOR_SYSTEM_SECONDARY_ACCENT_MINIMUM_CHROMA_V3
      ? LOW_CHROMA_ACCENT_TARGETS
      : CHROMA_SCALE_OPTIONS.map(option =>
          Math.max(COLOR_SYSTEM_SECONDARY_ACCENT_MINIMUM_CHROMA_V3, heroChroma * option)
        );
  const scales = targets.map(target =>
    canonicalNumber(
      Math.min(MAXIMUM_SEED_CHROMA_SCALE, Math.max(MINIMUM_SEED_CHROMA_SCALE, target / heroChroma))
    )
  );
  return [...new Set(scales)].sort((left, right) => right - left);
}

function insideSemanticClaimZone(
  hue: number,
  claims: readonly ColorSystemSecondarySemanticClaimV3[],
  guardDegrees: number
): boolean {
  return claims.some(
    claim =>
      colorSystemSecondaryHueDistanceV3(hue, claim.hue) <
      COLOR_SYSTEM_SECONDARY_SEMANTIC_CLAIM_EXCLUSION_DEGREES_V3 + guardDegrees
  );
}

function separationBucket(value: number): number {
  return Math.floor(value / SEPARATION_RANK_BUCKET_DELTA_E_OK + 1e-9);
}

function rankKeys(kind: ColorSystemSecondaryStrategyKindV3, candidate: AccentCandidate): number[] {
  // Higher separation and hue distance are better; encode as negatives so every key sorts ascending.
  return kind === 'spectrum'
    ? [-candidate.minimumHueDistance, -separationBucket(candidate.minimumSeparation)]
    : [-separationBucket(candidate.minimumSeparation), -candidate.minimumHueDistance];
}

function compareKeyArrays(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

function finalKeys(kind: ColorSystemSecondaryStrategyKindV3, candidate: AccentCandidate): number[] {
  return [
    ...rankKeys(kind, candidate),
    candidate.mappedSteps ?? Number.POSITIVE_INFINITY,
    -candidate.minimumSeparation,
    kind === 'spectrum' ? 0 : candidate.hueAffinity,
    candidate.requested.h,
    -candidate.requested.c,
  ];
}

interface PlannedBrandFit {
  original: ColorSystemSecondaryPlannedTerritoryV3;
  claimed: ColorSystemSecondaryPlannedTerritoryV3;
  excluded: readonly ColorSystemSecondaryPlannedTerritoryV3[];
  changesColorBounds: boolean;
}

function mappedStepCount(
  anchor: ColorSystemSecondaryColorInputV3,
  displayName: string,
  brandFit?: PlannedBrandFit
): number | null {
  if (
    brandFit &&
    !colorSystemTerritoryContainsOklchV1(
      brandFit.claimed,
      colorSystemSecondaryOklchFromValueV3(anchor)
    )
  )
    return null;
  const scale = (mode: 'light' | 'dark') =>
    typeof anchor === 'string'
      ? generateColorScale(anchor, mode, displayName)
      : generateColorScaleFromSrgbV1(anchor, mode, displayName);
  const light = scale('light');
  const dark = scale('dark');
  if (!light.validation.valid || !dark.validation.valid) return null;
  // The claimed envelope bounds step 9. Exclusions apply to every member in
  // both modes, exactly as in the engine; a legal anchor alone is insufficient.
  if (
    brandFit &&
    [...light.steps, ...dark.steps].some(step => {
      const actual = colorSystemSecondaryOklchFromValueV3(step.value ?? step.hex);
      return brandFit.excluded.some(territory =>
        colorSystemTerritoryContainsOklchV1(territory, actual)
      );
    })
  )
    return null;
  return (
    light.steps.filter(step => step.gamutMapped).length +
    dark.steps.filter(step => step.gamutMapped).length
  );
}

function chooseAccent(
  hero: ColorSystemSecondaryMeasuredColorV3,
  heroClass: ColorSystemSecondaryLightnessClassV3,
  kind: ColorSystemSecondaryStrategyKindV3,
  slotIndex: number,
  accepted: readonly AcceptedAnchor[],
  claims: readonly ColorSystemSecondarySemanticClaimV3[],
  displayName: string,
  brandFit?: PlannedBrandFit
): AccentCandidate | null {
  const shifts = accentLightnessShifts(hero.oklch.l, heroClass, slotIndex);
  const bounds =
    brandFit &&
    canonicalJson(brandFit.claimed.perceptualBounds.lightness) !==
      canonicalJson(brandFit.original.perceptualBounds.lightness)
      ? brandFit.claimed.perceptualBounds.lightness
      : undefined;
  const additional = bounds
    ? [bounds.minimum, bounds.maximum, (bounds.minimum + bounds.maximum) / 2]
        .map(lightness => canonicalNumber(lightness - hero.oklch.l))
        .filter(shift => Math.abs(shift) <= LIGHTNESS_SHIFT_LIMIT)
    : [];
  for (const lightnessShift of new Set([...shifts, ...additional])) {
    const chosen = chooseAccentAtLightness(
      hero,
      kind,
      lightnessShift,
      accepted,
      claims,
      displayName,
      brandFit
    );
    if (chosen) return chosen;
  }
  return null;
}

function chooseAccentAtLightness(
  hero: ColorSystemSecondaryMeasuredColorV3,
  kind: ColorSystemSecondaryStrategyKindV3,
  lightnessShift: number,
  accepted: readonly AcceptedAnchor[],
  claims: readonly ColorSystemSecondarySemanticClaimV3[],
  displayName: string,
  brandFit?: PlannedBrandFit
): AccentCandidate | null {
  const complement = normalizeColorSystemSecondaryHueV3(hero.oklch.h + 180);
  const candidates: AccentCandidate[] = [];
  const bounds = brandFit?.claimed.perceptualBounds;
  const changedHueRanges =
    bounds &&
    canonicalJson(bounds.hueRanges) !== canonicalJson(brandFit!.original.perceptualBounds.hueRanges)
      ? bounds.hueRanges
      : [];
  const boundaryOffsets = changedHueRanges.flatMap(range =>
    [range.minimum, range.maximum, (range.minimum + range.maximum) / 2].map(hue =>
      colorSystemSecondarySignedHueOffsetV3(hero.oklch.h, hue)
    )
  );
  const boundedChromaScales =
    bounds &&
    canonicalJson(bounds.chroma) !== canonicalJson(brandFit!.original.perceptualBounds.chroma)
      ? [
          bounds.chroma.minimum,
          bounds.chroma.maximum,
          (bounds.chroma.minimum + bounds.chroma.maximum) / 2,
        ]
          .map(chroma => canonicalNumber(chroma / hero.oklch.c))
          .filter(scale => scale >= MINIMUM_SEED_CHROMA_SCALE && scale <= MAXIMUM_SEED_CHROMA_SCALE)
      : [];
  for (const hueOffsetDegrees of new Set([...accentHueOffsets(kind), ...boundaryOffsets])) {
    const hue = normalizeColorSystemSecondaryHueV3(hero.oklch.h + hueOffsetDegrees);
    if (insideSemanticClaimZone(hue, claims, SEMANTIC_CLAIM_HUE_GUARD_DEGREES)) continue;
    for (const chromaScale of new Set([
      ...accentChromaScales(hero.oklch.c),
      ...boundedChromaScales,
    ])) {
      const recipe = { hueOffsetDegrees, chromaScale, lightnessShift };
      const realizedAnchor = realizeColorSystemSecondaryAnchorV3(
        hero.value ?? hero.hex,
        IDENTITY_TRANSFORM,
        recipe
      );
      const realized = colorSystemSecondaryOklchFromValueV3(
        realizedAnchor.value ?? realizedAnchor.hex
      );
      // The strategy's hue band applies to the realized six-digit anchor, with the
      // quantization guard: gamut mapping keeps hue, but 8-bit rounding of dark or
      // pale colors can move it by a few degrees.
      const realizedInBand =
        kind === 'derived'
          ? colorSystemSecondaryHueDistanceV3(realized.h, hero.oklch.h) <=
            COLOR_SYSTEM_SECONDARY_ANALOGOUS_RANGE_DEGREES_V3 + HUE_QUANTIZATION_GUARD_DEGREES
          : kind === 'complementary'
            ? colorSystemSecondaryHueDistanceV3(realized.h, complement) <=
              COLOR_SYSTEM_SECONDARY_COMPLEMENTARY_RANGE_DEGREES_V3 + HUE_QUANTIZATION_GUARD_DEGREES
            : true;
      if (
        !realizedInBand ||
        realized.c < COLOR_SYSTEM_SECONDARY_CHROMATIC_MINIMUM_CHROMA_V3 ||
        realized.l < COLOR_SYSTEM_SECONDARY_ACCENT_LIGHTNESS_BAND_V3.minimum ||
        realized.l > COLOR_SYSTEM_SECONDARY_ACCENT_LIGHTNESS_BAND_V3.maximum ||
        insideSemanticClaimZone(realized.h, claims, 0) ||
        (brandFit &&
          (!colorSystemTerritoryContainsOklchV1(brandFit.claimed, realized) ||
            brandFit.excluded.some(territory =>
              colorSystemTerritoryContainsOklchV1(territory, realized)
            )))
      ) {
        continue;
      }
      let minimumSeparation = Number.POSITIVE_INFINITY;
      let neutralSeparation = Number.POSITIVE_INFINITY;
      let minimumHueDistance = 180;
      let separated = true;
      for (const anchor of accepted) {
        const distance = colorSystemSecondaryDeltaEOKV3(
          realizedAnchor.value ?? realizedAnchor.hex,
          anchor.value ?? anchor.hex
        );
        if (distance < separationThreshold(anchor, { neutral: false })) {
          separated = false;
          break;
        }
        if (anchor.neutral) {
          neutralSeparation = Math.min(neutralSeparation, distance);
          continue;
        }
        minimumSeparation = Math.min(minimumSeparation, distance);
        minimumHueDistance = Math.min(
          minimumHueDistance,
          colorSystemSecondaryHueDistanceV3(realized.h, anchor.oklch.h)
        );
      }
      if (!separated) continue;
      candidates.push({
        recipe,
        requested: realizedAnchor.requested,
        realizedHex: realizedAnchor.hex,
        ...(realizedAnchor.value ? { value: realizedAnchor.value } : {}),
        realized,
        minimumSeparation: Number.isFinite(minimumSeparation) ? minimumSeparation : 0,
        neutralSeparation: Number.isFinite(neutralSeparation) ? neutralSeparation : null,
        minimumHueDistance: Math.round(minimumHueDistance),
        hueAffinity:
          kind === 'derived'
            ? colorSystemSecondaryHueDistanceV3(realized.h, hero.oklch.h)
            : colorSystemSecondaryHueDistanceV3(realized.h, complement),
        mappedSteps: null,
      });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((left, right) => compareKeyArrays(rankKeys(kind, left), rankKeys(kind, right)));
  return chooseAccentFrom(kind, candidates, displayName, brandFit);
}

/**
 * Scale generation is the expensive step, so it runs only for the candidates
 * tied on the cheap ranking keys. A group whose every member yields an invalid
 * scale falls through to the next group.
 */
function chooseAccentFrom(
  kind: ColorSystemSecondaryStrategyKindV3,
  candidates: AccentCandidate[],
  displayName: string,
  brandFit?: PlannedBrandFit
): AccentCandidate | null {
  while (candidates.length > 0) {
    const leadingKey = rankKeys(kind, candidates[0]);
    const leadingGroup = candidates.filter(
      candidate => compareKeyArrays(rankKeys(kind, candidate), leadingKey) === 0
    );
    const evaluated = leadingGroup
      .map(candidate => ({
        ...candidate,
        mappedSteps: mappedStepCount(
          candidate.value ?? candidate.realizedHex,
          displayName,
          brandFit
        ),
      }))
      .filter(candidate => candidate.mappedSteps !== null)
      .sort((left, right) => compareKeyArrays(finalKeys(kind, left), finalKeys(kind, right)));
    if (evaluated.length > 0) return evaluated[0];
    candidates = candidates.filter(
      candidate => compareKeyArrays(rankKeys(kind, candidate), leadingKey) !== 0
    );
  }
  return null;
}

/**
 * p4-A. The hue gap a realized accent sits in, among the chromatic anchors it had
 * to keep clear of, and whether that gap is the widest on the wheel. Anchors are
 * ordered by hue, then hex, so ties resolve the same way every run. Two anchors at
 * one hue bound a zero-width gap; the wrap from the last anchor back to the first
 * closes the wheel, so the widths always sum to 360.
 */
function hueGapAround(
  hue: number,
  anchors: readonly AcceptedAnchor[]
): ColorSystemSecondaryHueGapV3 | null {
  const chromatic = anchors
    .filter(anchor => !anchor.neutral && anchor.gap !== undefined)
    .map(anchor => ({
      hue: normalizeColorSystemSecondaryHueV3(anchor.oklch.h),
      hex: anchor.hex,
      gap: anchor.gap!,
    }))
    .sort((left, right) => left.hue - right.hue || compareText(left.hex, right.hex));
  if (chromatic.length === 0) return null;
  const gaps = chromatic.map((from, index) => {
    const to = chromatic[(index + 1) % chromatic.length];
    const raw = normalizeColorSystemSecondaryHueV3(to.hue - from.hue);
    const width =
      chromatic.length === 1 || (index === chromatic.length - 1 && raw === 0) ? 360 : raw;
    return { from, to, width };
  });
  const target = normalizeColorSystemSecondaryHueV3(hue);
  const containing =
    gaps.find(
      gap =>
        gap.width === 360 || normalizeColorSystemSecondaryHueV3(target - gap.from.hue) < gap.width
    ) ?? gaps[gaps.length - 1];
  const widestWidth = Math.max(...gaps.map(gap => gap.width));
  return {
    widthDegrees: canonicalNumber(containing.width),
    fromHue: canonicalNumber(containing.from.hue),
    toHue: canonicalNumber(containing.to.hue),
    from: containing.from.gap,
    to: containing.to.gap,
    widest: containing.width >= widestWidth - 1e-9,
    widestWidthDegrees: canonicalNumber(widestWidth),
  };
}

function fullHueRange(): { minimum: number; maximum: number }[] {
  return [{ minimum: 0, maximum: 360 }];
}

function claimHueRanges(hue: number): { minimum: number; maximum: number }[] {
  const minimum = hue - COLOR_SYSTEM_SECONDARY_SEMANTIC_CLAIM_EXCLUSION_DEGREES_V3;
  const maximum = hue + COLOR_SYSTEM_SECONDARY_SEMANTIC_CLAIM_EXCLUSION_DEGREES_V3;
  if (minimum < 0) {
    return [
      { minimum: 0, maximum: canonicalNumber(maximum) },
      { minimum: canonicalNumber(minimum + 360), maximum: 360 },
    ];
  }
  if (maximum > 360) {
    return [
      { minimum: canonicalNumber(minimum), maximum: 360 },
      { minimum: 0, maximum: canonicalNumber(maximum - 360) },
    ];
  }
  return [{ minimum: canonicalNumber(minimum), maximum: canonicalNumber(maximum) }];
}

function plannedTerritories(
  measurement: ColorSystemSecondaryPaletteMeasurementV3,
  requiredJobs: readonly ColorSystemJobV2[],
  policyEvidenceId: string,
  reserveCount: number
): ColorSystemSecondaryPlannedTerritoryV3[] {
  const territories: ColorSystemSecondaryPlannedTerritoryV3[] = [
    {
      territoryId: COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.derived,
      label: 'Exact scales derived from confirmed brand colors',
      status: 'allowed',
      allowedJobs: requiredJobs,
      allowedProminence: ['leading', 'supporting'],
      appliesToProminence: ['leading', 'supporting'],
      perceptualBounds: {
        hueRanges: fullHueRange(),
        chroma: { minimum: 0, maximum: 0.5 },
        lightness: { minimum: 0, maximum: 1 },
      },
      evidenceIds: [policyEvidenceId],
    },
    {
      territoryId: COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.neutral,
      label: 'Tinted neutral ramp within the measured neutral rule',
      status: 'allowed',
      allowedJobs: requiredJobs,
      allowedProminence: ['supporting'],
      appliesToProminence: ['supporting'],
      perceptualBounds: {
        hueRanges: fullHueRange(),
        chroma: { minimum: 0, maximum: COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3 },
        lightness: { minimum: 0, maximum: 1 },
      },
      evidenceIds: [policyEvidenceId],
    },
    {
      territoryId: COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.accent,
      label: 'Generated accent anchors: chromatic, mid-lightness band',
      status: 'allowed',
      allowedJobs: requiredJobs,
      allowedProminence: ['accent'],
      appliesToProminence: ['accent'],
      perceptualBounds: {
        hueRanges: fullHueRange(),
        chroma: { minimum: COLOR_SYSTEM_SECONDARY_CHROMATIC_MINIMUM_CHROMA_V3, maximum: 0.5 },
        lightness: {
          minimum: COLOR_SYSTEM_SECONDARY_ACCENT_LIGHTNESS_BAND_V3.minimum,
          maximum: COLOR_SYSTEM_SECONDARY_ACCENT_LIGHTNESS_BAND_V3.maximum,
        },
      },
      evidenceIds: [policyEvidenceId],
    },
  ];
  if (reserveCount > 0) {
    territories.push({
      territoryId: COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.reserve,
      label:
        'Conventional status reserves at the centre of a meaning hue range the palette leaves uncovered',
      status: 'allowed',
      allowedJobs: [COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_JOB_V3],
      allowedProminence: ['supporting'],
      appliesToProminence: ['supporting'],
      perceptualBounds: {
        hueRanges: COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_ROLES_V3.map(
          role => COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3[role]
        ),
        chroma: { minimum: COLOR_SYSTEM_SECONDARY_CHROMATIC_MINIMUM_CHROMA_V3, maximum: 0.5 },
        lightness: {
          minimum: COLOR_SYSTEM_SECONDARY_ACCENT_LIGHTNESS_BAND_V3.minimum,
          maximum: COLOR_SYSTEM_SECONDARY_ACCENT_LIGHTNESS_BAND_V3.maximum,
        },
      },
      evidenceIds: [policyEvidenceId],
    });
  }
  measurement.semanticClaims.forEach((claim, index) => {
    territories.push({
      territoryId: `${COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.semanticClaimPrefix}-${String(index + 1).padStart(2, '0')}`,
      label: `Reserved ±${COLOR_SYSTEM_SECONDARY_SEMANTIC_CLAIM_EXCLUSION_DEGREES_V3}° around observed ${claim.claim} color ${claim.displayName} (hue ${Math.round(claim.hue)}°)`,
      status: 'excluded',
      allowedJobs: [],
      allowedProminence: [],
      appliesToProminence: ['accent'],
      perceptualBounds: {
        hueRanges: claimHueRanges(claim.hue),
        chroma: { minimum: COLOR_SYSTEM_SECONDARY_CHROMATIC_MINIMUM_CHROMA_V3, maximum: 0.5 },
        lightness: { minimum: 0, maximum: 1 },
      },
      evidenceIds: [...new Set([policyEvidenceId, ...claim.evidenceIds])].sort(compareText),
    });
  });
  return territories;
}

function uniqueDisplayName(name: string, used: Set<string>): string {
  let candidate = name;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${name} (${suffix})`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function anchorRecord(value: ColorSystemSecondaryMeasuredColorV3) {
  return {
    stableColorId: value.stableColorId,
    mode: value.mode,
    hex: value.hex,
    ...(value.value ? { value: value.value } : {}),
    oklch: value.oklch,
    displayName: value.displayName,
    evidenceIds: value.evidenceIds,
  };
}

export function planColorSystemSecondaryStrategiesV3(
  input: ColorSystemSecondaryStrategyPlanInputV3
): ColorSystemSecondaryStrategyPlanV3 {
  const { measurement } = input;
  const hero = measurement.hero;
  if (!hero || !measurement.heroLightnessClass) {
    fail('Secondary planning requires a chromatic opaque Primary hero.');
  }
  const heroClass = measurement.heroLightnessClass;
  const requiredJobs = [...new Set(input.requiredJobs)].sort(compareText);
  if (requiredJobs.length === 0) fail('Secondary planning requires at least one confirmed job.');
  const minimumTarget = COLOR_SYSTEM_BUILDER_V2_LIMITS.minimumSecondaryFamilyTarget;
  const maximumTarget = COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget;
  const pool = [...input.chromaticContributionIds];
  if (new Set(pool).size !== pool.length || pool.includes(input.neutralContributionId)) {
    fail('Secondary contribution identities must be unique.');
  }
  input.polarityContributionIds.forEach(id => {
    if (!pool.includes(id)) fail(`Polarity contribution ${id} is not a chromatic slot identity.`);
  });

  // 1. Derived families: the hero, then observed Secondary hues that stay separated.
  //    p3-H: an owned hue is never dropped to fit the ceiling. If the palette owns
  //    more hues than the ceiling can hold beside the neutral ramp, planning stops
  //    with a plain statement of the count rather than trimming silently.
  const derived: ColorSystemSecondaryMeasuredColorV3[] = [hero];
  const skippedObserved: ColorSystemSecondaryStrategyPlanV3['skippedObserved'][number][] = [];
  for (const observed of measurement.observedChromatic.filter(
    value => value.section === 'secondary'
  )) {
    let nearest: { id: string; distance: number } | null = null;
    for (const accepted of derived) {
      const distance = colorSystemSecondaryDeltaEOKV3(
        observed.value ?? observed.hex,
        accepted.value ?? accepted.hex
      );
      if (!nearest || distance < nearest.distance) {
        nearest = { id: accepted.stableColorId, distance };
      }
    }
    if (nearest && nearest.distance < COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3) {
      skippedObserved.push({
        stableColorId: observed.stableColorId,
        displayName: observed.displayName,
        hex: observed.hex,
        nearestStableColorId: nearest.id,
        deltaEOK: nearest.distance,
      });
      continue;
    }
    derived.push(observed);
  }
  const derivedCapacity = maximumTarget - 1;
  if (derived.length > derivedCapacity) {
    const excess = derived.length - derivedCapacity;
    fail(
      `Your palette has ${derived.length} ${plural(derived.length, 'hue')}; Teul builds systems of up to ${maximumTarget} families (${derivedCapacity} hues plus one neutral ramp). Remove or merge ${excess} ${plural(excess, 'hue')} in the Secondary section and analyze again.`
    );
  }
  const familyLimit = {
    maximumFamilies: maximumTarget,
    derivedCapacity,
    seriesAccentsRemoved: 0,
    pairAccentsRemoved: 0,
    spectrumMinimumRemoved: 0,
    reservesDropped: 0,
  };
  // Recorded tints follow the family their base became; a tint whose base was a
  // skipped near-duplicate has no family and is listed as an orphan.
  const derivedIds = new Set(derived.map(value => value.stableColorId));
  const tintsByBase = new Map<string, ColorSystemSecondaryObservedTintV3[]>();
  const orphanTints: ColorSystemSecondaryObservedTintV3[] = [];
  for (const tint of measurement.observedTints) {
    if (derivedIds.has(tint.baseStableColorId)) {
      tintsByBase.set(tint.baseStableColorId, [
        ...(tintsByBase.get(tint.baseStableColorId) ?? []),
        tint,
      ]);
    } else {
      orphanTints.push(tint);
    }
  }

  // 2. The neutral ramp: hero anchor, hue from observed neutrals, chroma at the neutral target.
  const neutralHue = measurement.neutralHue.degrees ?? hero.oklch.h;
  const neutralBase: ColorSystemSecondaryAnchorTransformV3 = {
    hueOffsetDegrees: canonicalNumber(
      colorSystemSecondarySignedHueOffsetV3(hero.oklch.h, neutralHue)
    ),
    chromaScale: canonicalNumber(COLOR_SYSTEM_SECONDARY_NEUTRAL_TARGET_CHROMA_V3 / hero.oklch.c),
    lightnessShift: canonicalNumber(
      Math.max(
        -LIGHTNESS_SHIFT_LIMIT,
        Math.min(
          LIGHTNESS_SHIFT_LIMIT,
          COLOR_SYSTEM_SECONDARY_NEUTRAL_TARGET_LIGHTNESS_V3 - hero.oklch.l
        )
      )
    ),
  };
  const neutralRealized = realizeColorSystemSecondaryAnchorV3(
    hero.value ?? hero.hex,
    neutralBase,
    IDENTITY_TRANSFORM
  );
  const neutralJobs = requiredJobs.filter(job => !NEUTRAL_EXCLUDED_JOBS.has(job));

  // 3. Separation anchors every direction must respect: derived, other preserved hues, neutral.
  const otherObserved = measurement.observedChromatic.filter(
    value => value.section !== 'secondary'
  );
  const fixedAnchorsFor = (
    derivedSet: readonly ColorSystemSecondaryMeasuredColorV3[]
  ): AcceptedAnchor[] => [
    ...derivedSet.map(value => ({
      hex: value.hex,
      ...(value.value ? { value: value.value } : {}),
      oklch: value.oklch,
      neutral: false,
      displayName: value.displayName,
      gap: { displayName: value.displayName, kind: 'owned' as const },
    })),
    ...otherObserved.map(value => ({
      hex: value.hex,
      ...(value.value ? { value: value.value } : {}),
      oklch: value.oklch,
      neutral: false,
      displayName: value.displayName,
      gap: { displayName: value.displayName, kind: 'owned' as const },
    })),
    {
      hex: neutralRealized.hex,
      oklch: colorSystemSecondaryOklchFromHexV3(neutralRealized.hex),
      neutral: true,
      displayName: 'the neutral ramp',
    },
  ];

  // 4. Conventional status reserves for meaning ranges the confirmed palette leaves uncovered.
  //    Coverage is measured on the brand's own hues (derived families and preserved chromatic
  //    colors in other sections); a reserve is skipped when it would sit too close to an anchor.
  const coveredStatusRoles: ColorSystemSecondaryStrategyPlanV3['coveredStatusRoles'][number][] = [];
  const skippedReserves: ColorSystemSecondaryStrategyPlanV3['skippedReserves'][number][] = [];
  const reserves: ColorSystemSecondaryPlannedReserveV3[] = [];
  if (requiredJobs.includes(COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_JOB_V3)) {
    const brandHues = [...derived, ...otherObserved];
    const reserveChroma = Math.max(
      COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_CHROMA_BAND_V3.minimum,
      Math.min(COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_CHROMA_BAND_V3.maximum, hero.oklch.c)
    );
    const reserveLightnessShift = canonicalNumber(
      Math.max(
        -LIGHTNESS_SHIFT_LIMIT,
        Math.min(
          LIGHTNESS_SHIFT_LIMIT,
          COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_TARGET_LIGHTNESS_V3 - hero.oklch.l
        )
      )
    );
    for (const role of COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_ROLES_V3) {
      const range = COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3[role];
      const owner = brandHues.find(value =>
        colorSystemSecondaryHueWithinRangeV3(value.oklch.h, range)
      );
      if (owner) {
        coveredStatusRoles.push({
          role,
          stableColorId: owner.stableColorId,
          displayName: owner.displayName,
          hex: owner.hex,
          hue: owner.oklch.h,
        });
        continue;
      }
      const hue = COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_V3[role];
      const base: ColorSystemSecondaryAnchorTransformV3 = {
        hueOffsetDegrees: canonicalNumber(colorSystemSecondarySignedHueOffsetV3(hero.oklch.h, hue)),
        chromaScale: canonicalNumber(
          Math.min(
            MAXIMUM_SEED_CHROMA_SCALE,
            Math.max(MINIMUM_SEED_CHROMA_SCALE, reserveChroma / hero.oklch.c)
          )
        ),
        lightnessShift: reserveLightnessShift,
      };
      const realizedAnchor = realizeColorSystemSecondaryAnchorV3(
        hero.value ?? hero.hex,
        base,
        IDENTITY_TRANSFORM
      );
      const realized = colorSystemSecondaryOklchFromValueV3(
        realizedAnchor.value ?? realizedAnchor.hex
      );
      const contributionId = colorSystemSecondaryStatusReserveContributionIdV3(role);
      let nearest = {
        hex: hero.hex,
        displayName: hero.displayName,
        distance: Number.POSITIVE_INFINITY,
      };
      let separated = true;
      for (const anchor of [
        ...fixedAnchorsFor(derived),
        ...reserves.map((reserve): AcceptedAnchor => ({
          hex: reserve.realizedHex,
          oklch: reserve.realized,
          neutral: false,
          displayName: colorSystemSecondaryStatusReserveDisplayNameV3(reserve.role),
        })),
      ]) {
        const distance = colorSystemSecondaryDeltaEOKV3(
          realizedAnchor.value ?? realizedAnchor.hex,
          anchor.value ?? anchor.hex
        );
        if (distance < nearest.distance) {
          nearest = { hex: anchor.hex, displayName: anchor.displayName ?? anchor.hex, distance };
        }
        if (distance < separationThreshold(anchor, { neutral: false })) separated = false;
      }
      if (!separated) {
        skippedReserves.push({
          role,
          contributionId,
          hue,
          realizedHex: realizedAnchor.hex,
          nearestHex: nearest.hex,
          nearestDisplayName: nearest.displayName,
          deltaEOK: nearest.distance,
          cause: 'separation',
          reason: `The conventional ${COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_COLOR_WORD_V3[role]} for ${role} (hue ${hue}°) would sit ΔEOK ${nearest.distance.toFixed(2)} from ${nearest.displayName} (${nearest.hex}), below the ${COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3} separation rule, so no reserve was added.`,
        });
        continue;
      }
      reserves.push({
        role,
        contributionId,
        range,
        hue,
        requested: realizedAnchor.requested,
        realizedHex: realizedAnchor.hex,
        realized,
        minimumSeparationDeltaEOK: Number.isFinite(nearest.distance) ? nearest.distance : 0,
        base,
      });
    }
  }

  // 4b. p3-H: reserves outrank optional accents but not owned hues. When the owned hues,
  //     the neutral ramp, and the reserves together exceed the ceiling, reserves are
  //     dropped in the fixed order and each drop is recorded as a skip.
  while (derived.length + 1 + reserves.length > maximumTarget) {
    const dropRole = STATUS_RESERVE_DROP_ORDER.find(role =>
      reserves.some(reserve => reserve.role === role)
    )!;
    const dropped = reserves.splice(
      reserves.findIndex(reserve => reserve.role === dropRole),
      1
    )[0];
    familyLimit.reservesDropped += 1;
    skippedReserves.push({
      role: dropped.role,
      contributionId: dropped.contributionId,
      hue: dropped.hue,
      realizedHex: dropped.realizedHex,
      nearestHex: dropped.realizedHex,
      nearestDisplayName: colorSystemSecondaryStatusReserveDisplayNameV3(dropped.role),
      deltaEOK: dropped.minimumSeparationDeltaEOK,
      cause: 'family-limit',
      reason: `The ${COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_COLOR_WORD_V3[dropped.role]} reserve for ${dropped.role} (hue ${dropped.hue}°) was dropped at the ${maximumTarget}-family limit: your ${derived.length} owned ${plural(derived.length, 'hue')} and the neutral ramp come first.`,
    });
  }

  // 5. Accent slot counts per direction. Derived keeps only the slots the confirmed structure
  //    forces (owner-bound polarity identities, the bounded minimum); Complementary adds a
  //    complementary pair; Spectrum adds what the categorical series count still needs.
  const preserve = input.secondaryDisposition === 'preserve';
  const requiredHueCount = requiredJobs.includes('categorical-data')
    ? COLOR_SYSTEM_SECONDARY_DEFAULT_CATEGORICAL_SERIES_V3
    : 2;
  const seriesGap = preserve
    ? 0
    : Math.max(0, requiredHueCount - measurement.existingHueClusterCount);
  // p4-A: Spectrum carries at least one hue-spaced accent when the ceiling leaves room,
  // so it never realizes Derived's family set; the minimum gives way only at the ceiling.
  const state = {
    pair: preserve ? 0 : COLOR_SYSTEM_SECONDARY_COMPLEMENTARY_PAIR_COUNT_V3,
    seriesCap: seriesGap,
    spectrumMinimum: preserve ? 0 : COLOR_SYSTEM_SECONDARY_SPECTRUM_MINIMUM_ACCENT_COUNT_V3,
  };
  const deriveCounts = () => {
    const derivedIds = pool.slice(0, derived.length);
    const polarityAccentIds = [...new Set(input.polarityContributionIds)]
      .filter(id => !derivedIds.includes(id))
      .sort((left, right) => pool.indexOf(left) - pool.indexOf(right));
    const fromPolarity = polarityAccentIds.length;
    const fromMinimumTarget = Math.max(0, minimumTarget - (derived.length + 1 + reserves.length));
    const base = Math.max(fromPolarity, fromMinimumTarget);
    const fromSeries = Math.min(state.seriesCap, seriesGap);
    const byDirection: Record<ColorSystemSecondaryDirectionV3, number> = {
      'close-harmony': base,
      'balanced-contrast': base + state.pair,
      'wide-spectrum': Math.max(base, fromSeries, state.spectrumMinimum),
    };
    const fromSpectrumMinimum = Math.max(
      0,
      byDirection['wide-spectrum'] - Math.max(base, fromSeries)
    );
    const maxAccents = Math.max(...Object.values(byDirection));
    return {
      polarityAccentIds,
      fromPolarity,
      fromMinimumTarget,
      base,
      fromSeries,
      fromSpectrumMinimum,
      byDirection,
      maxAccents,
    };
  };
  // p3-H: the room left for accents after owned hues, the neutral ramp, and reserves.
  // When a direction asks for more, its optional accents give way in a fixed order
  // (`fitColorSystemSecondaryAccentsV3`): Spectrum's series accents first, then the
  // complementary pair. Structural accents (owner-bound polarity, the bounded
  // minimum) and owned hues are never removed.
  const accentRoom = maximumTarget - (derived.length + 1 + reserves.length);
  const initialCounts = deriveCounts();
  const fit = fitColorSystemSecondaryAccentsV3({
    room: accentRoom,
    base: initialCounts.base,
    pair: state.pair,
    seriesGap,
    spectrumMinimum: state.spectrumMinimum,
  });
  if (fit === null) {
    fail(
      `Your palette has ${derived.length} ${plural(derived.length, 'hue')} and its confirmed structure needs ${initialCounts.base} generated ${plural(initialCounts.base, 'accent')}; with the neutral ramp${reserves.length > 0 ? ` and ${reserves.length} status ${plural(reserves.length, 'reserve')}` : ''} that exceeds the ${maximumTarget}-family limit.`
    );
  }
  state.pair = fit.pair;
  state.seriesCap = fit.series;
  state.spectrumMinimum = fit.spectrumMinimum;
  familyLimit.seriesAccentsRemoved = fit.seriesAccentsRemoved;
  familyLimit.pairAccentsRemoved = fit.pairAccentsRemoved;
  familyLimit.spectrumMinimumRemoved = fit.spectrumMinimumRemoved;
  const counts = deriveCounts();
  const {
    polarityAccentIds,
    fromPolarity,
    fromMinimumTarget,
    fromSeries,
    fromSpectrumMinimum,
    byDirection,
  } = counts;
  const accentSlotCount = counts.maxAccents;
  if (derived.length + accentSlotCount > pool.length) {
    fail('Secondary planning ran out of chromatic contribution identities.');
  }
  const accentIds = [
    ...polarityAccentIds,
    ...pool.slice(derived.length).filter(id => !polarityAccentIds.includes(id)),
  ];
  const baseTerritories = plannedTerritories(
    measurement,
    requiredJobs,
    input.policyEvidenceId,
    reserves.length
  );
  const constrainedTerritories = baseTerritories
    .filter(
      territory =>
        accentSlotCount > 0 ||
        territory.territoryId !== COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.accent
    )
    .map(territory =>
      derived.length === 1 &&
      territory.territoryId === COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.derived
        ? {
            ...territory,
            allowedProminence: ['leading'] as const,
            appliesToProminence: ['leading'] as const,
          }
        : territory
    );
  const lowered = input.reviewedBrandConstraints
    ? lowerColorSystemBrandConstraintsV1(
        input.reviewedBrandConstraints,
        buildColorSystemBrandFitProfileV2({
          version: 'teul-brand-fit-profile/v2',
          territories: constrainedTerritories,
          evidenceIds: [input.policyEvidenceId],
        })
      )
    : undefined;
  if (lowered?.status === 'infeasible') {
    fail(
      `Reviewed brand constraints are infeasible: ${lowered.issues.map(issue => issue.message).join(' ')}`
    );
  }
  // Validate even an empty/rejected fragment, but do not reinterpret existing
  // profiles or move legacy engine exclusions into planning when none was adopted.
  const reviewed = input.reviewedBrandConstraints?.decisions.some(
    decision => decision.status === 'accepted'
  )
    ? lowered
    : undefined;
  const territories = reviewed?.profile.territories ?? baseTerritories;
  const fitFor = (
    sourceTerritoryId: string,
    prominence: ColorSystemFamilyProminenceV2
  ): PlannedBrandFit | undefined => {
    if (!reviewed) return undefined;
    const binding = reviewed.territoryBindings.find(
      entry => entry.sourceTerritoryId === sourceTerritoryId && entry.prominence === prominence
    );
    const claimed = territories.find(territory => territory.territoryId === binding?.territoryId);
    if (!claimed || claimed.status === 'excluded')
      fail('Reviewed brand constraints have no permitted family territory.');
    const original = baseTerritories.find(
      territory => territory.territoryId === sourceTerritoryId
    )!;
    const excluded = territories.filter(
      territory =>
        territory.status === 'excluded' && territory.appliesToProminence.includes(prominence)
    );
    return {
      original,
      claimed,
      excluded,
      changesColorBounds:
        canonicalJson(original.perceptualBounds) !== canonicalJson(claimed.perceptualBounds) ||
        excluded.some(
          territory =>
            !baseTerritories.some(
              base =>
                base.status === 'excluded' &&
                base.appliesToProminence.includes(prominence) &&
                canonicalJson(base.perceptualBounds) === canonicalJson(territory.perceptualBounds)
            )
        ),
    };
  };
  const accentFit =
    accentSlotCount > 0
      ? fitFor(COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.accent, 'accent')
      : undefined;
  const accentBrandFit = accentFit?.changesColorBounds ? accentFit : undefined;

  const fixedAnchors = fixedAnchorsFor(derived);
  const reserveAnchors: AcceptedAnchor[] = reserves.map(reserve => ({
    hex: reserve.realizedHex,
    oklch: reserve.realized,
    neutral: false,
    displayName: colorSystemSecondaryStatusReserveDisplayNameV3(reserve.role),
    gap: { displayName: `the ${reserve.role} reserve`, kind: 'reserve' as const },
  }));

  // 6. Fill each direction's accent slots with the deterministic search; reserves are fixed anchors.
  //    Accents are named by their contribution's rank inside the direction so the reviewed
  //    order (contributions sort alphabetically) and the names agree.
  const accentRecipes = new Map<number, ColorSystemSecondaryPlannedRecipeV3[]>();
  const directions = COLOR_SYSTEM_SECONDARY_DIRECTIONS_V3.map(direction => {
    const kind = COLOR_SYSTEM_SECONDARY_STRATEGY_KIND_BY_DIRECTION_V3[direction];
    const slotCount = byDirection[direction];
    const directionAccentIds = [...accentIds.slice(0, slotCount)].sort(compareText);
    const accepted = [...fixedAnchors, ...reserveAnchors];
    const accents: ColorSystemSecondaryPlannedAccentV3[] = [];
    const unfilledSlots: number[] = [];
    for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
      const accentLabel = COLOR_SYSTEM_SECONDARY_ACCENT_KIND_LABEL_V3[kind];
      const displayName = `${accentLabel[0].toUpperCase()}${accentLabel.slice(1)} accent ${
        directionAccentIds.indexOf(accentIds[slotIndex]) + 1
      }`;
      const chosen = chooseAccent(
        hero,
        heroClass,
        kind,
        slotIndex,
        accepted,
        measurement.semanticClaims,
        displayName,
        accentBrandFit
      );
      const slot = derived.length + slotIndex + 1;
      if (!chosen) {
        unfilledSlots.push(slot);
        continue;
      }
      // p4-A: the gap is read against the anchors this accent had to keep clear of,
      // before the accent itself joins them.
      const hueGap = hueGapAround(chosen.realized.h, accepted);
      accepted.push({
        hex: chosen.realizedHex,
        ...(chosen.value ? { value: chosen.value } : {}),
        oklch: chosen.realized,
        neutral: false,
        displayName,
        gap: { displayName: displayName.toLowerCase(), kind: 'accent' as const },
      });
      accents.push({
        slot,
        hue: chosen.realized.h,
        lightness: chosen.realized.l,
        chroma: chosen.realized.c,
        lightnessShift: chosen.recipe.lightnessShift,
        realizedHex: chosen.realizedHex,
        minimumSeparationDeltaEOK: chosen.minimumSeparation,
        neutralSeparationDeltaEOK: chosen.neutralSeparation,
        minimumHueDistanceDegrees: chosen.minimumHueDistance,
        hueGap,
      });
      const recipes = accentRecipes.get(slotIndex) ?? [];
      recipes.push({
        direction,
        hueOffsetDegrees: chosen.recipe.hueOffsetDegrees,
        chromaScale: chosen.recipe.chromaScale,
        lightnessShift: chosen.recipe.lightnessShift,
        displayName,
        requested: chosen.requested,
        realizedHex: chosen.realizedHex,
        ...(chosen.value ? { value: chosen.value } : {}),
        minimumSeparationDeltaEOK: chosen.minimumSeparation,
      });
      accentRecipes.set(slotIndex, recipes);
    }
    // A slot the structure forces (polarity, the bounded minimum) stays in the target
    // even when unfilled, so the direction reports itself underfilled; a slot this
    // direction added for its own identity shrinks the target instead, and the reason says so.
    const droppedSlots = unfilledSlots.filter(slot => slot - derived.length - 1 >= counts.base);
    const accentCount = slotCount - droppedSlots.length;
    const targetFamilyCount = derived.length + 1 + reserves.length + accentCount;
    // p4-A: a direction other than Derived is offered only when it realizes an accent of
    // its own; with none it would be Derived's family set under another name. The
    // cause is the ceiling when the fit left it no slot, separation when every slot
    // it had was dropped, and preservation when the Secondary section is preserved.
    const omissionCause: ColorSystemSecondaryDirectionOmissionCauseV3 | null =
      kind === 'derived' || accentCount > 0
        ? null
        : preserve
          ? 'preserved'
          : slotCount === 0
            ? 'family-limit'
            : 'separation';
    return {
      direction,
      kind,
      derivedFamilyCount: derived.length,
      reserveFamilyCount: reserves.length,
      accentSlotCount: accentCount,
      targetFamilyCount,
      reason:
        omissionCause !== null
          ? describeDirectionOmission({
              kind,
              cause: omissionCause,
              derivedCount: derived.length,
              reserveCount: reserves.length,
              maximumFamilies: maximumTarget,
              attemptedSlotCount: slotCount,
            })
          : describeDirectionCount({
              kind,
              total: targetFamilyCount,
              derivedCount: derived.length,
              reserves,
              accentCount,
              droppedSlotCount: droppedSlots.length,
              base: counts.base,
              fromPolarity,
              polarityAccentIds,
              fromMinimumTarget,
              minimumTarget,
              fromSeries,
              fromSpectrumMinimum,
              accents,
              requiredHueCount,
              existingHueClusterCount: measurement.existingHueClusterCount,
              pair: state.pair,
              preserve,
              limit: familyLimit,
            }),
      accents,
      unfilledSlots,
      offered: omissionCause === null,
      omissionCause,
    };
  });
  for (let slotIndex = 0; slotIndex < accentSlotCount; slotIndex++) {
    if ((accentRecipes.get(slotIndex) ?? []).length === 0) {
      fail(
        `Accent slot ${derived.length + slotIndex + 1} could not be filled in any direction while keeping ΔEOK ${COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3} separation${reviewed ? ' and the reviewed brand constraints' : ''}.`
      );
    }
  }

  // 7. Assemble families in review order: hero, observed, accents, status reserves, neutral.
  const usedNames = new Set<string>();
  const families: ColorSystemSecondaryPlannedFamilyV3[] = [];
  derived.forEach((value, index) => {
    const tints = tintsByBase.get(value.stableColorId);
    families.push({
      slot: index + 1,
      kind: index === 0 ? 'hero' : 'observed',
      contributionId: pool[index],
      displayName: uniqueDisplayName(value.displayName, usedNames),
      prominence: index === 0 ? 'leading' : 'supporting',
      territoryId: COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.derived,
      anchor: anchorRecord(value),
      base: { ...IDENTITY_TRANSFORM },
      recipes: COLOR_SYSTEM_SECONDARY_DIRECTIONS_V3.map(direction => ({
        direction,
        ...IDENTITY_TRANSFORM,
        displayName: null,
        requested: value.oklch,
        realizedHex: value.hex,
        ...(value.value ? { value: value.value } : {}),
        minimumSeparationDeltaEOK: null,
      })),
      jobs: requiredJobs,
      ...(tints && tints.length > 0 ? { tints } : {}),
    });
  });
  for (let slotIndex = 0; slotIndex < accentSlotCount; slotIndex++) {
    const slot = derived.length + slotIndex + 1;
    families.push({
      slot,
      kind: 'accent',
      contributionId: accentIds[slotIndex],
      displayName: uniqueDisplayName(`Accent ${slotIndex + 1}`, usedNames),
      prominence: 'accent',
      territoryId: COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.accent,
      anchor: anchorRecord(hero),
      base: { ...IDENTITY_TRANSFORM },
      recipes: accentRecipes.get(slotIndex) ?? [],
      jobs: requiredJobs,
    });
  }
  reserves.forEach((reserve, index) => {
    families.push({
      slot: derived.length + accentSlotCount + index + 1,
      kind: 'reserve',
      contributionId: reserve.contributionId,
      displayName: uniqueDisplayName(
        colorSystemSecondaryStatusReserveDisplayNameV3(reserve.role),
        usedNames
      ),
      prominence: 'supporting',
      territoryId: COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.reserve,
      anchor: anchorRecord(hero),
      base: reserve.base,
      recipes: COLOR_SYSTEM_SECONDARY_DIRECTIONS_V3.map(direction => ({
        direction,
        ...IDENTITY_TRANSFORM,
        displayName: null,
        requested: reserve.requested,
        realizedHex: reserve.realizedHex,
        minimumSeparationDeltaEOK: reserve.minimumSeparationDeltaEOK,
      })),
      jobs: [COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_JOB_V3],
      reserve,
    });
  });
  families.push({
    slot: derived.length + accentSlotCount + reserves.length + 1,
    kind: 'neutral',
    contributionId: input.neutralContributionId,
    displayName: uniqueDisplayName('Neutral', usedNames),
    prominence: 'supporting',
    territoryId: COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.neutral,
    anchor: anchorRecord(hero),
    base: neutralBase,
    recipes: COLOR_SYSTEM_SECONDARY_DIRECTIONS_V3.map(direction => ({
      direction,
      ...IDENTITY_TRANSFORM,
      displayName: null,
      requested: neutralRealized.requested,
      realizedHex: neutralRealized.hex,
      minimumSeparationDeltaEOK: null,
    })),
    jobs: neutralJobs.length > 0 ? neutralJobs : requiredJobs,
  });

  if (reviewed) {
    for (const family of families) {
      const fit = fitFor(family.territoryId, family.prominence)!;
      family.territoryId = fit.claimed.territoryId;
      family.jobs = family.jobs.filter(job => fit.claimed.allowedJobs.includes(job));
      if (family.jobs.length === 0)
        fail(`Reviewed brand constraints leave ${family.displayName} no permitted job.`);
      for (const recipe of fit.changesColorBounds ? family.recipes : []) {
        const hex = recipe.realizedHex;
        const actual = colorSystemSecondaryOklchFromValueV3(recipe.value ?? hex);
        if (
          !colorSystemTerritoryContainsOklchV1(fit.claimed, actual) ||
          fit.excluded.some(territory => colorSystemTerritoryContainsOklchV1(territory, actual))
        ) {
          fail(
            `Reviewed brand constraints cannot preserve the generated ${family.displayName} family. Its anchor is outside the allowed bounds or enters an exclusion.`
          );
        }
        // Fixed families may replace generated steps with exact source tints.
        // Their whole-scale exclusions must be checked by the engine after pins.
        if (
          family.kind === 'accent' &&
          mappedStepCount(recipe.value ?? hex, family.displayName, fit) === null
        ) {
          fail(
            `Reviewed brand constraints cannot preserve the generated ${family.displayName} family. Its anchor is outside the allowed bounds, a Light/Dark step enters an exclusion, or the scale is invalid.`
          );
        }
      }
    }
  }

  const familyCountByDirection = Object.fromEntries(
    directions.map(direction => [direction.direction, direction.targetFamilyCount])
  ) as Record<ColorSystemSecondaryDirectionV3, number>;
  const targets = directions.map(direction => direction.targetFamilyCount);
  if (families.length !== Math.max(...targets)) {
    fail(
      'Secondary planning produced a contribution union that does not match the largest direction.'
    );
  }
  return {
    version: COLOR_SYSTEM_SECONDARY_STRATEGY_V3_VERSION,
    measurement,
    familyCount: families.length,
    familyCountByDirection,
    familyCountBand: { minimum: Math.min(...targets), maximum: Math.max(...targets) },
    derivedFamilyCount: derived.length,
    reserveFamilyCount: reserves.length,
    accentSlotCount,
    requiredHueCount,
    existingHueClusterCount: measurement.existingHueClusterCount,
    slotDerivation: {
      fromPolarity,
      fromMinimumTarget,
      fromSeries,
      fromComplementaryPair: state.pair,
      fromSpectrumMinimum,
    },
    polarityAccentContributionIds: polarityAccentIds,
    families,
    territories,
    directions,
    offeredDirections: directions.filter(entry => entry.offered).map(entry => entry.direction),
    omittedDirections: directions
      .filter(entry => !entry.offered)
      .map(entry => ({
        direction: entry.direction,
        kind: entry.kind,
        cause: entry.omissionCause!,
        reason: entry.reason,
      })),
    reserves,
    coveredStatusRoles,
    skippedReserves,
    skippedObserved,
    orphanTints,
    familyLimit,
  };
}

export interface ColorSystemSecondaryAccentFitInputV3 {
  /** Accent slots the family ceiling leaves after owned hues, the neutral ramp, and reserves. */
  room: number;
  /** Accents every direction must carry (owner-bound polarity, the bounded minimum). */
  base: number;
  /** Complementary accents Balanced Contrast wants beyond `base`. */
  pair: number;
  /** Series accents Wide Spectrum wants; it carries `max(base, series, spectrumMinimum)`. */
  seriesGap: number;
  /** p4-A: accents Wide Spectrum carries at least, so it never repeats Derived (default 0). */
  spectrumMinimum?: number;
}

export interface ColorSystemSecondaryAccentFitV3 {
  pair: number;
  series: number;
  /** p4-A: the minimum that survived the ceiling (0 when it had to go). */
  spectrumMinimum: number;
  /** Series accents removed net of the structural base; an accent that also met the minimum counts once. */
  seriesAccentsRemoved: number;
  pairAccentsRemoved: number;
  /** p4-A: 1 when the ceiling left no room even for Spectrum's minimum accent. */
  spectrumMinimumRemoved: number;
}

/**
 * p3-H. Fits the optional accents into the room the family ceiling leaves.
 * Reduction order is fixed: while any direction exceeds the room, Spectrum's
 * series accents go first (one at a time, never below `base`), then Spectrum's
 * minimum accent (p4-A), then the complementary pair. Structural accents are
 * never removed; when even they do not fit the result is null and the caller
 * states the count plainly. Spectrum's removals are counted against what it
 * wanted, so a series accent that also satisfied the minimum is counted once.
 */
export function fitColorSystemSecondaryAccentsV3(
  input: ColorSystemSecondaryAccentFitInputV3
): ColorSystemSecondaryAccentFitV3 | null {
  let pair = Math.max(0, input.pair);
  let series = Math.max(0, input.seriesGap);
  let spectrumMinimum = Math.max(0, input.spectrumMinimum ?? 0);
  let pairAccentsRemoved = 0;
  const spectrum = () => Math.max(input.base, series, spectrumMinimum);
  const spectrumWanted = spectrum();
  const complementary = () => input.base + pair;
  while (Math.max(spectrum(), complementary()) > input.room) {
    if (spectrum() > input.room && series > input.base) {
      series -= 1;
    } else if (spectrum() > input.room && spectrumMinimum > input.base) {
      spectrumMinimum -= 1;
    } else if (complementary() > input.room && pair > 0) {
      pair -= 1;
      pairAccentsRemoved += 1;
    } else {
      return null;
    }
  }
  const spectrumRemoved = spectrumWanted - spectrum();
  const seriesAccentsRemoved = Math.min(
    spectrumRemoved,
    Math.max(0, Math.max(0, input.seriesGap) - input.base)
  );
  return {
    pair,
    series,
    spectrumMinimum,
    seriesAccentsRemoved,
    pairAccentsRemoved,
    spectrumMinimumRemoved: spectrumRemoved - seriesAccentsRemoved,
  };
}

/**
 * States a direction's family count and why. The composition is counted; the
 * accent count is explained by the measured fact behind it: the owner-bound
 * polarity identities, the bounded minimum, the complementary pair, or the
 * categorical series count against the existing hue clusters. A slot the
 * direction could not fill under the separation rule is stated as dropped.
 */
function describeDirectionCount(input: {
  kind: ColorSystemSecondaryStrategyKindV3;
  total: number;
  derivedCount: number;
  reserves: readonly ColorSystemSecondaryPlannedReserveV3[];
  accentCount: number;
  droppedSlotCount: number;
  base: number;
  fromPolarity: number;
  polarityAccentIds: readonly string[];
  fromMinimumTarget: number;
  minimumTarget: number;
  fromSeries: number;
  /** p4-A: 1 when Spectrum's only accent comes from its minimum-one rule. */
  fromSpectrumMinimum: number;
  /** The direction's realized accents, so the copy can name where an accent went. */
  accents: readonly ColorSystemSecondaryPlannedAccentV3[];
  requiredHueCount: number;
  existingHueClusterCount: number;
  pair: number;
  preserve: boolean;
  /** p3-H: what the family ceiling removed, so the copy says so instead of implying a choice. */
  limit: ColorSystemSecondaryStrategyPlanV3['familyLimit'];
}): string {
  const accentWord = COLOR_SYSTEM_SECONDARY_ACCENT_KIND_LABEL_V3[input.kind];
  const limitPhrase = `the ${input.limit.maximumFamilies}-family limit`;
  const ownedPhrase = `${input.derivedCount} owned ${plural(input.derivedCount, 'hue')}`;
  const composition = [
    `${input.derivedCount} existing ${plural(input.derivedCount, 'hue')}`,
    '1 neutral ramp',
    ...(input.reserves.length > 0
      ? [
          `${input.reserves.length} status ${plural(input.reserves.length, 'reserve')} (${input.reserves
            .map(reserve => reserve.role)
            .join(', ')})`,
        ]
      : []),
    ...(input.accentCount > 0
      ? [`${input.accentCount} ${accentWord} ${plural(input.accentCount, 'accent')}`]
      : []),
  ];
  // "the accent is" / "both accents are" / "all 4 accents are" / "2 accents are".
  const subject = (count: number, total: number): string =>
    count === total
      ? total === 1
        ? 'the accent is'
        : total === 2
          ? 'both accents are'
          : `all ${total} accents are`
      : `${count} ${count === 1 ? 'accent is' : 'accents are'}`;
  const polarityClause = (count: number, total: number): string =>
    `${subject(count, total)} required by your confirmed diverging polarity (${input.polarityAccentIds.join(', ')})`;
  const minimumClause = (count: number, total: number): string =>
    `${subject(count, total)} needed to reach the minimum of ${input.minimumTarget} families`;
  const structural: string[] = [];
  if (input.fromPolarity > 0)
    structural.push(polarityClause(input.fromPolarity, input.accentCount));
  if (input.base > input.fromPolarity) {
    structural.push(minimumClause(input.base - input.fromPolarity, input.accentCount));
  }
  const seriesPhrase =
    input.requiredHueCount === COLOR_SYSTEM_SECONDARY_DEFAULT_CATEGORICAL_SERIES_V3
      ? `${input.requiredHueCount} categorical series`
      : 'two contrasting hues';
  const clusterPhrase = `${input.existingHueClusterCount} hue ${plural(input.existingHueClusterCount, 'cluster')}`;
  const pairCut = input.kind === 'complementary' ? input.limit.pairAccentsRemoved : 0;
  const seriesCut = input.kind === 'spectrum' ? input.limit.seriesAccentsRemoved : 0;
  let why: string;
  if (input.accentCount === 0 && input.droppedSlotCount === 0) {
    // Only Derived reaches this branch: another direction with no accent is not offered
    // (p4-A) and states its omission instead.
    why = input.preserve
      ? 'no new accent: the Secondary section is preserved'
      : 'no new accent: every confirmed job is covered by your hues';
  } else if (
    input.kind === 'spectrum' &&
    input.fromSpectrumMinimum > 0 &&
    input.accents.length > 0
  ) {
    // p4-A: the hue clusters already cover the series, so the one accent is there to make
    // Spectrum a different direction; say where it went and why that gap.
    const [accent] = input.accents;
    const gap = accent.hueGap;
    const between =
      gap === null
        ? ''
        : gap.from.kind === 'owned' && gap.to.kind === 'owned'
          ? 'between your hues'
          : `between ${gap.from.displayName} and ${gap.to.displayName}`;
    const placement =
      gap === null
        ? ''
        : gap.widest
          ? `, the widest gap (${formatHue(gap.widthDegrees)}) ${between}`
          : `, a ${formatHue(gap.widthDegrees)} gap ${between}; the widest gap (${formatHue(gap.widestWidthDegrees)}) held no accent that kept separation`;
    why = `adds one spectrum accent at hue ${formatHue(accent.hue)}${placement}; your ${clusterPhrase} already ${input.existingHueClusterCount === 1 ? 'covers' : 'cover'} ${seriesPhrase}`;
  } else if (input.kind === 'derived') {
    why = structural.join('; ');
  } else if (input.kind === 'complementary') {
    const pairClause =
      input.pair === 0
        ? pairCut > 0
          ? `with ${ownedPhrase}, no complementary accent fits within ${limitPhrase}`
          : null
        : input.pair === 1
          ? pairCut > 0
            ? `one complementary accent adds contrast; a second does not fit within ${limitPhrase}`
            : 'one complementary accent adds contrast'
          : `a complementary pair of ${input.pair} adds contrast`;
    why = [...structural, ...(pairClause ? [pairClause] : [])].join('; ');
  } else if (input.fromSeries > input.base) {
    const alsoStructural =
      input.base > 0
        ? `; ${input.base} of them ${input.base === 1 ? 'is' : 'are'} also ${
            input.fromPolarity > 0
              ? `required by your confirmed diverging polarity (${input.polarityAccentIds.join(', ')})`
              : `needed to reach the minimum of ${input.minimumTarget} families`
          }`
        : '';
    const cut =
      seriesCut > 0
        ? `; ${seriesCut} more ${seriesCut === 1 ? 'was' : 'were'} needed but ${seriesCut === 1 ? 'does' : 'do'} not fit within ${limitPhrase}`
        : '';
    why = `${subject(input.fromSeries, input.accentCount)} needed for ${seriesPhrase} because your palette has ${clusterPhrase}${alsoStructural}${cut}`;
  } else {
    why =
      seriesCut > 0
        ? `${structural.join('; ')}; with ${ownedPhrase}, no series accent fits within ${limitPhrase}`
        : `${structural.join('; ')}; your ${clusterPhrase} already ${input.existingHueClusterCount === 1 ? 'covers' : 'cover'} ${seriesPhrase}`;
  }
  const dropped =
    input.droppedSlotCount === 0
      ? ''
      : ` ${input.droppedSlotCount} ${accentWord} ${plural(input.droppedSlotCount, 'slot')} could not keep ΔEOK ${COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3} separation from the accepted anchors and ${input.droppedSlotCount === 1 ? 'was' : 'were'} dropped.`;
  const sentence = `${why[0].toUpperCase()}${why.slice(1)}.`;
  return `${COLOR_SYSTEM_SECONDARY_STRATEGY_LABEL_V3[input.kind]}: ${input.total} ${plural(input.total, 'family', 'families')} (${composition.join(', ')}). ${sentence}${dropped}`;
}

/**
 * p4-A. States why a direction is not offered. The family ceiling case names the
 * owned hues (and reserves) that filled it; the separation case names the slots the
 * direction had; the preserved case names the disposition. Each says what the
 * direction would otherwise have been: Derived's family set under another name.
 */
function describeDirectionOmission(input: {
  kind: ColorSystemSecondaryStrategyKindV3;
  cause: ColorSystemSecondaryDirectionOmissionCauseV3;
  derivedCount: number;
  reserveCount: number;
  maximumFamilies: number;
  attemptedSlotCount: number;
}): string {
  const label = COLOR_SYSTEM_SECONDARY_STRATEGY_LABEL_V3[input.kind];
  const accentWord = COLOR_SYSTEM_SECONDARY_ACCENT_KIND_LABEL_V3[input.kind];
  if (input.cause === 'preserved') {
    return `${label} is not offered: the Secondary section is preserved, so it would repeat Derived's families.`;
  }
  if (input.cause === 'family-limit') {
    const filled = [
      `${input.derivedCount} owned ${plural(input.derivedCount, 'hue')}`,
      ...(input.reserveCount > 0
        ? [`${input.reserveCount} status ${plural(input.reserveCount, 'reserve')}`]
        : []),
    ].join(' and ');
    return `${label} is not offered: ${filled} leave no room within ${input.maximumFamilies} families.`;
  }
  const slots =
    input.attemptedSlotCount === 1
      ? `its one ${accentWord} accent`
      : `its ${input.attemptedSlotCount} ${accentWord} accents`;
  return `${label} is not offered: ${slots} could not keep ΔEOK ${COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3} separation from the accepted anchors, so it would repeat Derived's families.`;
}

/* ------------------------------------------------------------------------ */
/* Readings and copy built from realized families                            */
/* ------------------------------------------------------------------------ */

export interface ColorSystemSecondaryFamilyReadingV3 {
  kind: ColorSystemSecondaryFamilyKindV3;
  displayName: string;
  anchorHex: string;
  anchor: ColorSystemSecondaryOklchV3;
  /** The confirmed source color a derived family reproduces exactly. */
  sourceDisplayName: string | null;
  /** The status role a reserve family holds; null for every other kind. */
  reserveRole: ColorSystemSecondaryStatusReserveRoleV3 | null;
  /** Anchor lightness minus hero lightness; null when no hero is known. */
  lightnessShiftFromHero: number | null;
  /** ΔEOK to the nearest other family anchor in the same candidate. */
  minimumSeparationDeltaEOK: number | null;
}

/**
 * Classifies a realized family. A status reserve is recognized by identity
 * (contribution id) or by the planner's display-name form; the other kinds are
 * read from the realized color alone.
 */
export function classifyColorSystemSecondaryFamilyAnchorV3(
  anchorHex: ColorSystemSecondaryColorInputV3,
  sourceHex: ColorSystemSecondaryColorInputV3 | null,
  identity: { contributionId?: string | null; displayName?: string | null } = {}
): ColorSystemSecondaryFamilyKindV3 {
  const anchor = colorSystemSecondaryColorIdentityV3(anchorHex);
  if (sourceHex !== null && colorSystemSecondaryColorIdentityV3(sourceHex) === anchor) {
    return 'derived';
  }
  if (colorSystemSecondaryStatusReserveRoleV3(identity) !== null) return 'reserve';
  return colorSystemSecondaryOklchFromValueV3(anchorHex).c <
    COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3
    ? 'neutral'
    : 'accent';
}

export function readColorSystemSecondaryFamilyV3(input: {
  displayName: string;
  anchorHex: string;
  sourceHex: string | null;
  sourceDisplayName: string | null;
  heroOklch: ColorSystemSecondaryOklchV3 | null;
  otherAnchorHexes: readonly string[];
  anchorValue?: ColorSystemColorValueV2;
  sourceValue?: ColorSystemColorValueV2;
  otherAnchorValues?: readonly ColorSystemSecondaryColorInputV3[];
  /** The family's assembly contribution; lets a status reserve be read by identity. */
  contributionId?: string | null;
}): ColorSystemSecondaryFamilyReadingV3 {
  const anchorHex = normalizeColorSystemSecondaryHexV3(input.anchorHex);
  const anchor = colorSystemSecondaryOklchFromValueV3(input.anchorValue ?? anchorHex);
  const identity = { contributionId: input.contributionId, displayName: input.displayName };
  const kind = classifyColorSystemSecondaryFamilyAnchorV3(
    input.anchorValue ?? anchorHex,
    input.sourceValue ?? input.sourceHex,
    identity
  );
  const separations = (input.otherAnchorValues ?? input.otherAnchorHexes).map(other =>
    colorSystemSecondaryDeltaEOKV3(input.anchorValue ?? anchorHex, other)
  );
  return {
    kind,
    displayName: input.displayName,
    anchorHex,
    anchor,
    sourceDisplayName: kind === 'derived' ? input.sourceDisplayName : null,
    reserveRole: kind === 'reserve' ? colorSystemSecondaryStatusReserveRoleV3(identity) : null,
    lightnessShiftFromHero: input.heroOklch ? canonicalNumber(anchor.l - input.heroOklch.l) : null,
    minimumSeparationDeltaEOK: separations.length === 0 ? null : Math.min(...separations),
  };
}

function formatHue(hue: number): string {
  return `${Math.round(hue)}°`;
}

function formatLightness(lightness: number): string {
  return lightness.toFixed(2);
}

function formatShift(shift: number): string {
  const rounded = Number(shift.toFixed(2));
  return `${rounded >= 0 ? '+' : '−'}${Math.abs(rounded).toFixed(2)}`;
}

function formatDeltaE(value: number): string {
  return `ΔEOK ${value.toFixed(2)}`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

export function describeColorSystemSecondaryFamilyV3(
  reading: ColorSystemSecondaryFamilyReadingV3,
  context: {
    strategyKind: ColorSystemSecondaryStrategyKindV3;
    heroLightnessClass: ColorSystemSecondaryLightnessClassV3 | null;
  }
): string {
  if (reading.kind === 'derived') {
    const source = reading.sourceDisplayName ?? reading.displayName;
    return `Derived from your ${source} (${reading.anchorHex}); the exact color is step 9 of its 12-step Light and Dark scale.`;
  }
  if (reading.kind === 'neutral') {
    return `Neutral ramp tinted toward hue ${formatHue(reading.anchor.h)} (${describeColorSystemSecondaryHueTemperatureV3(reading.anchor.h)}); step-9 chroma ${reading.anchor.c.toFixed(3)} keeps every step inside the measured neutral rule (below ${COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3}).`;
  }
  if (reading.kind === 'reserve' && reading.reserveRole !== null) {
    const role = reading.reserveRole;
    const range = COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3[role];
    const separation =
      reading.minimumSeparationDeltaEOK !== null
        ? `; ${formatDeltaE(reading.minimumSeparationDeltaEOK)} from the nearest family anchor`
        : '';
    return `Adds a conventional ${COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_COLOR_WORD_V3[role]} (hue ${formatHue(reading.anchor.h)}) for ${role} because your palette has no hue between ${range.minimum}° and ${range.maximum}°. Step 9 sits at L ${formatLightness(reading.anchor.l)}, chroma ${reading.anchor.c.toFixed(3)}, for product status roles only${separation}.`;
  }
  const shift =
    reading.lightnessShiftFromHero !== null && context.heroLightnessClass
      ? ` (${formatShift(reading.lightnessShiftFromHero)} from your ${context.heroLightnessClass} primary)`
      : '';
  const separation =
    reading.minimumSeparationDeltaEOK !== null
      ? `; ${formatDeltaE(reading.minimumSeparationDeltaEOK)} from the nearest family anchor`
      : '';
  return `New ${COLOR_SYSTEM_SECONDARY_ACCENT_KIND_LABEL_V3[context.strategyKind]} accent at hue ${formatHue(reading.anchor.h)}, L ${formatLightness(reading.anchor.l)}${shift}, chroma ${reading.anchor.c.toFixed(3)}${separation}.`;
}

export function describeColorSystemSecondaryDirectionV3(input: {
  strategyKind: ColorSystemSecondaryStrategyKindV3;
  readings: readonly ColorSystemSecondaryFamilyReadingV3[];
  heroLightnessClass: ColorSystemSecondaryLightnessClassV3 | null;
  minimumSeparationDeltaEOK: number | null;
  /**
   * The planner's statement of this direction's family count and why (from the
   * brief). When absent the summary still states the count it can see.
   */
  countReason?: string | null;
}): string {
  const derived = input.readings.filter(reading => reading.kind === 'derived');
  const neutrals = input.readings.filter(reading => reading.kind === 'neutral');
  const accents = input.readings.filter(reading => reading.kind === 'accent');
  const reserves = input.readings.filter(reading => reading.kind === 'reserve');
  const label =
    input.strategyKind === 'derived'
      ? 'Derived from your palette'
      : COLOR_SYSTEM_SECONDARY_STRATEGY_LABEL_V3[input.strategyKind];
  const derivedNames = derived.map(reading => reading.sourceDisplayName ?? reading.displayName);
  const derivedClause =
    derived.length === 0
      ? 'no existing hue could be kept as an exact scale'
      : `${derived.length} existing ${plural(derived.length, 'hue')} as full Light and Dark ${plural(derived.length, 'scale')} (${derivedNames.join(', ')})`;
  const neutralClause =
    neutrals.length === 0
      ? ''
      : ` plus a ${describeColorSystemSecondaryHueTemperatureV3(neutrals[0].anchor.h)} neutral ramp (hue ${formatHue(neutrals[0].anchor.h)})`;
  const accentClause =
    accents.length === 0
      ? ' No new hue was needed for the confirmed jobs.'
      : ` Adds ${accents.length === 1 ? 'one' : accents.length} ${COLOR_SYSTEM_SECONDARY_ACCENT_KIND_LABEL_V3[input.strategyKind]} ${plural(accents.length, 'accent')} at ${accents
          .map(reading => {
            const shift =
              reading.lightnessShiftFromHero !== null && input.heroLightnessClass
                ? ` (${formatShift(reading.lightnessShiftFromHero)} from your ${input.heroLightnessClass} primary)`
                : '';
            return `hue ${formatHue(reading.anchor.h)}, L ${formatLightness(reading.anchor.l)}${shift}`;
          })
          .join('; ')}${
          input.minimumSeparationDeltaEOK !== null
            ? `; minimum family separation ${formatDeltaE(input.minimumSeparationDeltaEOK)}`
            : ''
        }.`;
  const reserveClause =
    reserves.length === 0
      ? ''
      : ` Adds ${reserves.length === 1 ? 'a conventional status reserve' : 'conventional status reserves'} — ${reserves
          .map(reading => {
            const role = reading.reserveRole;
            const word = role ? COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_COLOR_WORD_V3[role] : 'hue';
            return `${word} (hue ${formatHue(reading.anchor.h)}) for ${role ?? 'a status role'}`;
          })
          .join(', ')} — because your palette has no hue in ${
          reserves.length === 1 && reserves[0].reserveRole
            ? `the ${COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3[reserves[0].reserveRole].minimum}°–${COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3[reserves[0].reserveRole].maximum}° range`
            : 'those ranges'
        }.`;
  const total = input.readings.length;
  const countClause = input.countReason
    ? ` ${input.countReason.trim()}`
    : ` ${total} ${plural(total, 'family', 'families')} in this direction.`;
  return `${label}: ${derivedClause}${neutralClause}.${reserveClause}${accentClause}${countClause}`;
}
