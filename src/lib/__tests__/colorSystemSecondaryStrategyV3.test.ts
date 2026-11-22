import { describe, expect, it, vi } from 'vitest';
import { COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2 } from '../colorSystemApplicationBlueprintV2';
import { canonicalJson, canonicalNumber } from '../colorSystemHashing';
import {
  COLOR_SYSTEM_BUILDER_V2_LIMITS,
  type ColorSystemColorValueV2,
  type ColorSystemJobV2,
} from '../colorSystemBuilderV2Contracts';
import {
  COLOR_SYSTEM_SECONDARY_ANALOGOUS_RANGE_DEGREES_V3,
  COLOR_SYSTEM_SECONDARY_CHROMATIC_MINIMUM_CHROMA_V3,
  COLOR_SYSTEM_SECONDARY_COMPLEMENTARY_RANGE_DEGREES_V3,
  COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3,
  COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3,
  COLOR_SYSTEM_SECONDARY_OBSERVED_CHROMATIC_MINIMUM_CHROMA_V3,
  fitColorSystemSecondaryAccentsV3,
  COLOR_SYSTEM_SECONDARY_NEUTRAL_SEPARATION_DELTA_E_OK_V3,
  COLOR_SYSTEM_SECONDARY_NEUTRAL_TARGET_CHROMA_V3,
  COLOR_SYSTEM_SECONDARY_SEMANTIC_CLAIM_EXCLUSION_DEGREES_V3,
  COLOR_SYSTEM_SECONDARY_SPECTRUM_MINIMUM_ACCENT_COUNT_V3,
  COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_CHROMA_BAND_V3,
  COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3,
  COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_V3,
  COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_ROLES_V3,
  COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3,
  canonicalizeColorSystemSecondaryOklchV3,
  classifyColorSystemSecondaryFamilyAnchorV3,
  classifyColorSystemSecondaryLightnessV3,
  colorSystemSecondaryDeltaEOKV3,
  colorSystemSecondaryHueDistanceV3,
  colorSystemSecondaryHueWithinRangeV3,
  colorSystemSecondaryOklchFromHexV3,
  colorSystemSecondaryOklchFromValueV3,
  colorSystemSecondaryColorIdentityV3,
  colorSystemSecondarySignedHueOffsetV3,
  colorSystemSecondaryStatusReserveRoleV3,
  countColorSystemSecondaryHueClustersV3,
  describeColorSystemSecondaryDirectionV3,
  describeColorSystemSecondaryFamilyV3,
  describeColorSystemSecondaryHueTemperatureV3,
  measureColorSystemSecondaryPaletteV3,
  normalizeColorSystemSecondaryHueV3,
  planColorSystemSecondaryStrategiesV3,
  readColorSystemSecondaryFamilyV3,
  realizeColorSystemSecondaryAnchorV3,
  type ColorSystemSecondaryMeasurementColorInputV3,
  type ColorSystemSecondaryStrategyPlanInputV3,
  type ColorSystemSecondaryStrategyPlanV3,
} from '../colorSystemSecondaryStrategyV3';
import { hexToRgb } from '../utils';
import { buildColorSystemSrgbValueV1, colorSystemSrgbToOklchV1 } from '../colorSystemSrgbValueV1';

const ALL_JOBS = [
  'marketing-accent',
  'product-semantics',
  'product-graphics',
  'functional-iconography',
  'product-ui-surface',
  'categorical-data',
  'sequential-data',
  'diverging-data',
] as const satisfies readonly ColorSystemJobV2[];

const POOL = Array.from(
  { length: 11 },
  (_, index) => `generic-secondary-contribution-${String(index + 1).padStart(2, '0')}`
);
const NEUTRAL_ID = 'generic-neutral-contribution-01';

function value(hex: string, alpha = 1): ColorSystemColorValueV2 {
  const rgb = hexToRgb(hex);
  return {
    colorSpace: 'srgb',
    hex: hex.toUpperCase(),
    components: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 },
    alpha,
  };
}

function input(
  stableColorId: string,
  displayName: string,
  section: ColorSystemSecondaryMeasurementColorInputV3['section'],
  light: string,
  dark = light,
  retention: ColorSystemSecondaryMeasurementColorInputV3['retention'] = 'preserved'
): ColorSystemSecondaryMeasurementColorInputV3 {
  return {
    stableColorId,
    displayName,
    section,
    valuesByMode: { Light: value(light), Dark: value(dark) },
    retention,
    evidenceIds: [`evidence:${stableColorId}`],
  };
}

const BLUE_ONLY = [
  input('primary', 'Primary / Brand', 'primary', '#2563EB'),
  input('ink', 'Text / Ink', 'typography', '#000000', '#FFFFFF'),
  input('surface', 'Text / Surface', 'typography', '#FFFFFF', '#000000'),
];

const BRAND_B = [
  input('primary', 'Primary / Brand', 'primary', '#1F6F50'),
  input('gold', 'Secondary / Gold', 'secondary', '#D9A441', '#D9A441', 'evidence-only'),
  input('terracotta', 'Secondary / Terracotta', 'secondary', '#B5533C', '#B5533C', 'evidence-only'),
  input('ink', 'Text / Ink', 'typography', '#2B2622', '#F5EFE6'),
  input('paper', 'Text / Paper', 'typography', '#F5EFE6', '#2B2622'),
];

const NAVY = [input('primary', 'Primary / Brand', 'primary', '#1F2A44'), ...BLUE_ONLY.slice(1)];
const YELLOW = [input('primary', 'Primary / Brand', 'primary', '#F2B705'), ...BLUE_ONLY.slice(1)];

function planInput(
  colors: readonly ColorSystemSecondaryMeasurementColorInputV3[],
  overrides: Partial<ColorSystemSecondaryStrategyPlanInputV3> = {}
): ColorSystemSecondaryStrategyPlanInputV3 {
  return {
    measurement: measureColorSystemSecondaryPaletteV3(colors),
    requiredJobs: ALL_JOBS,
    secondaryDisposition: 'rebuild',
    chromaticContributionIds: POOL,
    neutralContributionId: NEUTRAL_ID,
    polarityContributionIds: [POOL[1], POOL[4]],
    policyEvidenceId: 'teul-policy:test',
    ...overrides,
  };
}

function direction(
  plan: ColorSystemSecondaryStrategyPlanV3,
  id: ColorSystemSecondaryStrategyPlanV3['directions'][number]['direction']
) {
  const found = plan.directions.find(entry => entry.direction === id);
  if (!found) throw new Error(`Missing direction ${id}`);
  return found;
}

function reserveRoles(plan: ColorSystemSecondaryStrategyPlanV3): string[] {
  return plan.reserves.map(reserve => reserve.role);
}

/** Every anchor a direction realizes: derived, accents, reserves, neutral. */
function directionAnchors(
  plan: ColorSystemSecondaryStrategyPlanV3,
  id: ColorSystemSecondaryStrategyPlanV3['directions'][number]['direction']
): { hex: string; neutral: boolean }[] {
  return plan.families.flatMap(family => {
    const recipe = family.recipes.find(entry => entry.direction === id);
    return recipe ? [{ hex: recipe.realizedHex, neutral: family.kind === 'neutral' }] : [];
  });
}

function expectSeparated(anchors: readonly { hex: string; neutral: boolean }[]): void {
  for (let left = 0; left < anchors.length; left++) {
    for (let right = left + 1; right < anchors.length; right++) {
      const threshold =
        anchors[left].neutral || anchors[right].neutral
          ? COLOR_SYSTEM_SECONDARY_NEUTRAL_SEPARATION_DELTA_E_OK_V3
          : COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3;
      expect(
        colorSystemSecondaryDeltaEOKV3(anchors[left].hex, anchors[right].hex),
        `${anchors[left].hex} vs ${anchors[right].hex}`
      ).toBeGreaterThanOrEqual(threshold);
    }
  }
}

/** p4-A: the family set a direction realizes, as sorted anchor hexes; offered directions never share one. */
function familySet(
  plan: ColorSystemSecondaryStrategyPlanV3,
  id: ColorSystemSecondaryStrategyPlanV3['directions'][number]['direction']
): string[] {
  return directionAnchors(plan, id)
    .map(anchor => anchor.hex)
    .sort();
}

function expectDistinctOfferedFamilySets(plan: ColorSystemSecondaryStrategyPlanV3): void {
  const offered = plan.directions.filter(entry => entry.offered);
  expect(offered.map(entry => entry.direction)).toEqual(plan.offeredDirections);
  for (let left = 0; left < offered.length; left++) {
    for (let right = left + 1; right < offered.length; right++) {
      expect(familySet(plan, offered[left].direction)).not.toEqual(
        familySet(plan, offered[right].direction)
      );
    }
  }
  // An omitted direction realizes exactly Derived's set and states why.
  for (const omitted of plan.omittedDirections) {
    expect(familySet(plan, omitted.direction)).toEqual(familySet(plan, 'close-harmony'));
    expect(direction(plan, omitted.direction).reason).toBe(omitted.reason);
    expect(plan.familyCountByDirection[omitted.direction]).toBe(
      plan.familyCountByDirection['close-harmony']
    );
  }
}

/** True when `hue` lies inside the gap going up the wheel from `fromHue` for `widthDegrees`. */
function hueWithinGap(hue: number, gap: { fromHue: number; widthDegrees: number }): boolean {
  return (
    gap.widthDegrees >= 360 ||
    normalizeColorSystemSecondaryHueV3(hue - gap.fromHue) < gap.widthDegrees
  );
}

/** The widest gap between the given hues, going up the wheel, computed independently of the planner. */
function widestGap(hues: readonly number[]): {
  fromHue: number;
  toHue: number;
  widthDegrees: number;
} {
  const sorted = [...hues].map(normalizeColorSystemSecondaryHueV3).sort((a, b) => a - b);
  if (sorted.length === 1) return { fromHue: sorted[0], toHue: sorted[0], widthDegrees: 360 };
  let best = { fromHue: 0, toHue: 0, widthDegrees: -1 };
  sorted.forEach((hue, index) => {
    const next = sorted[(index + 1) % sorted.length];
    const raw = normalizeColorSystemSecondaryHueV3(next - hue);
    const width = index === sorted.length - 1 && raw === 0 ? 360 : raw;
    if (width > best.widthDegrees) best = { fromHue: hue, toHue: next, widthDegrees: width };
  });
  return best;
}

describe('secondary strategy v3: shared color math', () => {
  it('canonicalizes exactly like the engine at the powerless-hue boundary', () => {
    expect(canonicalizeColorSystemSecondaryOklchV3({ l: 0.5, c: 0.000004, h: 240 })).toEqual({
      l: 0.5,
      c: 0,
      h: 0,
    });
    expect(canonicalizeColorSystemSecondaryOklchV3({ l: 0.5, c: 0.00000400001, h: 240 })).toEqual({
      l: 0.5,
      c: 0.00000400001,
      h: 240,
    });
  });

  it('normalizes hue once under the shared numeric policy', () => {
    expect(normalizeColorSystemSecondaryHueV3(360)).toBe(0);
    expect(normalizeColorSystemSecondaryHueV3(-360)).toBe(0);
    expect(normalizeColorSystemSecondaryHueV3(1080)).toBe(0);
    expect(normalizeColorSystemSecondaryHueV3(-30)).toBe(330);
    expect(normalizeColorSystemSecondaryHueV3(720.5)).toBe(0.5);
    // Negative zero is zero.
    expect(Object.is(normalizeColorSystemSecondaryHueV3(-0), -0)).toBe(false);
    expect(normalizeColorSystemSecondaryHueV3(-0)).toBe(0);
    // Runtime noise a hair below zero lands on 0, not on 360 (the single-wrap form
    // returned 360 because -1e-20 + 360 is exactly 360 in binary64).
    expect(normalizeColorSystemSecondaryHueV3(-1e-20)).toBe(0);
    expect(normalizeColorSystemSecondaryHueV3(-1e-300)).toBe(0);
    expect(normalizeColorSystemSecondaryHueV3(-1e-13)).toBe(0);
    // A hue a hair below 360 canonicalizes to 360 under the twelve-digit policy and wraps to 0.
    expect(canonicalNumber(359.9999999999999)).toBe(360);
    expect(normalizeColorSystemSecondaryHueV3(359.9999999999999)).toBe(0);
    // Values the policy can tell apart from 360 stay where they are.
    expect(normalizeColorSystemSecondaryHueV3(-1e-9)).toBe(359.999999999);
    expect(normalizeColorSystemSecondaryHueV3(359.999999999)).toBe(359.999999999);
    // Already-normalized fractional hues are preserved exactly (no double wrap).
    expect(normalizeColorSystemSecondaryHueV3(12.5)).toBe(12.5);
    expect(normalizeColorSystemSecondaryHueV3(29.123456789)).toBe(29.123456789);
    expect(normalizeColorSystemSecondaryHueV3(0.5)).toBe(0.5);
  });

  it('measures hue distance, signed offsets, temperature, and lightness class', () => {
    expect(colorSystemSecondaryHueDistanceV3(10, 350)).toBe(20);
    expect(colorSystemSecondaryHueDistanceV3(0, 180)).toBe(180);
    expect(colorSystemSecondarySignedHueOffsetV3(350, 10)).toBe(20);
    expect(colorSystemSecondarySignedHueOffsetV3(10, 350)).toBe(-20);
    expect(describeColorSystemSecondaryHueTemperatureV3(72)).toBe('warm');
    expect(describeColorSystemSecondaryHueTemperatureV3(262)).toBe('cool');
    expect(classifyColorSystemSecondaryLightnessV3(0.288)).toBe('dark');
    expect(classifyColorSystemSecondaryLightnessV3(0.546)).toBe('mid');
    expect(classifyColorSystemSecondaryLightnessV3(0.811)).toBe('light');
    expect(colorSystemSecondaryHueWithinRangeV3(145, { minimum: 120, maximum: 170 })).toBe(true);
    expect(colorSystemSecondaryHueWithinRangeV3(171, { minimum: 120, maximum: 170 })).toBe(false);
    expect(colorSystemSecondaryHueWithinRangeV3(5, { minimum: 350, maximum: 10 })).toBe(true);
  });

  it('reproduces the exact six-digit source when the transform is identity', () => {
    const identity = { hueOffsetDegrees: 0, chromaScale: 1, lightnessShift: 0 };
    for (const hex of [
      '#2563EB',
      '#F2B705',
      '#1F2A44',
      '#D6453D',
      '#D9A441',
      '#B5533C',
      '#F5EFE6',
    ]) {
      expect(realizeColorSystemSecondaryAnchorV3(hex, identity, identity).hex).toBe(hex);
    }
  });

  it('counts hue clusters across the 0°/360° seam', () => {
    expect(countColorSystemSecondaryHueClustersV3([])).toBe(0);
    expect(countColorSystemSecondaryHueClustersV3([5, 355, 180])).toBe(2);
    expect(countColorSystemSecondaryHueClustersV3([163, 34.5, 79.8])).toBe(3);
    expect(countColorSystemSecondaryHueClustersV3([100, 110, 250])).toBe(2);
  });

  it('keeps the status reserve hue table equal to the application blueprint semantic ranges', () => {
    for (const role of COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_ROLES_V3) {
      expect(COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3[role]).toEqual(
        COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2[role]
      );
      const centre = COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_V3[role];
      expect(
        colorSystemSecondaryHueWithinRangeV3(
          centre,
          COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3[role]
        )
      ).toBe(true);
    }
    // Destructive shares the error range, so one red reserve serves both.
    expect(COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2.destructive).toEqual(
      COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3.error
    );
    expect(COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_V3).toEqual({
      success: 145,
      warning: 75,
      error: 28,
      information: 250,
    });
  });
});

describe('secondary strategy v3: palette measurement', () => {
  it('picks the most saturated opaque Primary value as hero and ignores translucent values', () => {
    const measurement = measureColorSystemSecondaryPaletteV3([
      {
        ...input('primary', 'Primary', 'primary', '#2563EB', '#6699FF'),
        valuesByMode: { Light: value('#2563EB', 0.5), Dark: value('#6699FF') },
      },
      input('primary-2', 'Primary Alt', 'primary', '#3366CC'),
    ]);
    // #6699FF (c ≈ 0.160) is the only opaque value of the first color; #3366CC has c ≈ 0.168.
    expect(measurement.hero?.hex).toBe('#3366CC');
    expect(measurement.heroLightnessClass).toBe('mid');
  });

  it('measures observed hues, neutrals, the warm neutral hue, and clusters for Brand B', () => {
    const measurement = measureColorSystemSecondaryPaletteV3(BRAND_B);
    expect(measurement.hero?.hex).toBe('#1F6F50');
    expect(measurement.observedChromatic.map(color => color.hex)).toEqual(['#B5533C', '#D9A441']);
    expect(measurement.observedChromatic.every(color => color.mode === 'Light')).toBe(true);
    expect(measurement.observedNeutrals.map(color => color.hex).sort()).toEqual([
      '#2B2622',
      '#2B2622',
      '#F5EFE6',
      '#F5EFE6',
    ]);
    expect(measurement.neutralHue.source).toBe('observed-neutrals');
    expect(measurement.neutralHue.degrees).toBeGreaterThan(60);
    expect(measurement.neutralHue.degrees).toBeLessThan(80);
    expect(measurement.existingHueClusterCount).toBe(3);
    expect(measurement.semanticClaims).toEqual([]);
  });

  it('falls back to the hero hue when black and white carry no hue evidence', () => {
    const measurement = measureColorSystemSecondaryPaletteV3(BLUE_ONLY);
    expect(measurement.neutralHue.source).toBe('hero');
    expect(measurement.neutralHue.degrees).toBeCloseTo(measurement.hero!.oklch.h, 6);
    expect(measurement.observedNeutrals).toHaveLength(4);
  });

  it('detects semantic claims only on preserved chromatic colors', () => {
    const measurement = measureColorSystemSecondaryPaletteV3([
      ...BRAND_B,
      input('error', 'Text / Error', 'typography', '#D6453D'),
      input('warn', 'Secondary / Warning', 'secondary', '#F2B705', '#F2B705', 'evidence-only'),
      input('info-gray', 'Text / Info', 'typography', '#777777'),
    ]);
    expect(measurement.semanticClaims.map(claim => [claim.displayName, claim.claim])).toEqual([
      ['Text / Error', 'error'],
    ]);
    expect(Math.round(measurement.semanticClaims[0].hue)).toBe(27);
  });
});

describe('secondary strategy v3: planning per direction', () => {
  it('plans blue-only: Derived keeps only the polarity-bound accents, Complementary adds a pair, Spectrum fills the series', () => {
    const random = vi.spyOn(Math, 'random');
    const plan = planColorSystemSecondaryStrategiesV3(planInput(BLUE_ONLY));
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();

    expect(plan.derivedFamilyCount).toBe(1);
    expect(plan.reserveFamilyCount).toBe(3);
    expect(plan.requiredHueCount).toBe(5);
    expect(plan.slotDerivation).toEqual({
      fromPolarity: 2,
      fromMinimumTarget: 0,
      fromSeries: 4,
      fromComplementaryPair: 2,
      fromSpectrumMinimum: 0,
    });
    // p4-A: every direction carries accents of its own, so all three are offered.
    expect(plan.offeredDirections).toEqual(['close-harmony', 'balanced-contrast', 'wide-spectrum']);
    expect(plan.omittedDirections).toEqual([]);
    expectDistinctOfferedFamilySets(plan);
    // The owner bound polarity to slots 02 and 05: those identities take the first two
    // accent slots so every direction carries them without inflating Derived.
    expect(plan.polarityAccentContributionIds).toEqual([POOL[1], POOL[4]]);
    expect(plan.familyCountByDirection).toEqual({
      'close-harmony': 7,
      'balanced-contrast': 9,
      'wide-spectrum': 9,
    });
    expect(plan.familyCountBand).toEqual({ minimum: 7, maximum: 9 });
    expect(plan.familyCount).toBe(9);
    expect(plan.accentSlotCount).toBe(4);
    expect(plan.families.map(family => [family.kind, family.contributionId])).toEqual([
      ['hero', POOL[0]],
      ['accent', POOL[1]],
      ['accent', POOL[4]],
      ['accent', POOL[2]],
      ['accent', POOL[3]],
      ['reserve', 'generic-status-reserve-success'],
      ['reserve', 'generic-status-reserve-warning'],
      ['reserve', 'generic-status-reserve-error'],
      ['neutral', NEUTRAL_ID],
    ]);
    expect(direction(plan, 'close-harmony').accentSlotCount).toBe(2);
    expect(direction(plan, 'balanced-contrast').accentSlotCount).toBe(4);
    expect(direction(plan, 'wide-spectrum').accentSlotCount).toBe(4);
    expect(direction(plan, 'close-harmony').reason).toBe(
      'Derived: 7 families (1 existing hue, 1 neutral ramp, 3 status reserves (success, warning, error), 2 analogous accents). Both accents are required by your confirmed diverging polarity (generic-secondary-contribution-02, generic-secondary-contribution-05).'
    );
    expect(direction(plan, 'balanced-contrast').reason).toBe(
      'Complementary: 9 families (1 existing hue, 1 neutral ramp, 3 status reserves (success, warning, error), 4 complementary accents). 2 accents are required by your confirmed diverging polarity (generic-secondary-contribution-02, generic-secondary-contribution-05); a complementary pair of 2 adds contrast.'
    );
    expect(direction(plan, 'wide-spectrum').reason).toBe(
      'Spectrum: 9 families (1 existing hue, 1 neutral ramp, 3 status reserves (success, warning, error), 4 spectrum accents). All 4 accents are needed for 5 categorical series because your palette has 1 hue cluster; 2 of them are also required by your confirmed diverging polarity (generic-secondary-contribution-02, generic-secondary-contribution-05).'
    );

    const hero = plan.measurement.hero!;
    const neutral = plan.families[plan.families.length - 1];
    expect(neutral.displayName).toBe('Neutral');
    expect(neutral.prominence).toBe('supporting');
    expect(neutral.base.chromaScale).toBeCloseTo(
      COLOR_SYSTEM_SECONDARY_NEUTRAL_TARGET_CHROMA_V3 / hero.oklch.c,
      9
    );
    expect(neutral.base.lightnessShift).toBeCloseTo(0.55 - hero.oklch.l, 9);
    const neutralRealized = colorSystemSecondaryOklchFromHexV3(neutral.recipes[0].realizedHex);
    expect(neutralRealized.c).toBeLessThan(COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3);
    expect(colorSystemSecondaryHueDistanceV3(neutralRealized.h, hero.oklch.h)).toBeLessThan(20);
    expect(neutral.jobs).not.toContain('categorical-data');
    expect(neutral.jobs).toContain('product-ui-surface');

    for (const entry of plan.directions) {
      expect(entry.unfilledSlots).toEqual([]);
      expect(entry.targetFamilyCount).toBe(plan.familyCountByDirection[entry.direction]);
      // Mid hero: accents alternate above and below the hero's lightness.
      expect(entry.accents.some(accent => accent.lightnessShift > 0)).toBe(true);
      expect(entry.accents.some(accent => accent.lightnessShift < 0)).toBe(true);
      expect(entry.accents.every(accent => accent.minimumSeparationDeltaEOK >= 0.08)).toBe(true);
      for (const accent of entry.accents) {
        const distanceToHero = colorSystemSecondaryHueDistanceV3(accent.hue, hero.oklch.h);
        // Realized hue stays inside the strategy band plus the 5° quantization guard.
        if (entry.kind === 'derived') {
          expect(distanceToHero).toBeLessThanOrEqual(
            COLOR_SYSTEM_SECONDARY_ANALOGOUS_RANGE_DEGREES_V3 + 5
          );
        }
        if (entry.kind === 'complementary') {
          expect(
            colorSystemSecondaryHueDistanceV3(accent.hue, hero.oklch.h + 180)
          ).toBeLessThanOrEqual(COLOR_SYSTEM_SECONDARY_COMPLEMENTARY_RANGE_DEGREES_V3 + 5);
        }
        if (entry.kind === 'spectrum') {
          expect(accent.minimumHueDistanceDegrees).toBeGreaterThanOrEqual(30);
        }
      }
      expectSeparated(directionAnchors(plan, entry.direction));
    }
    // Accent names follow each direction's contribution order; a slot that exists in one
    // direction only carries recipes for that direction only.
    expect(plan.families[1].recipes.map(recipe => recipe.displayName)).toEqual([
      'Analogous accent 1',
      'Complementary accent 1',
      'Spectrum accent 1',
    ]);
    expect(plan.families[2].recipes.map(recipe => recipe.displayName)).toEqual([
      'Analogous accent 2',
      'Complementary accent 4',
      'Spectrum accent 4',
    ]);
    expect(plan.families[3].recipes.map(recipe => [recipe.direction, recipe.displayName])).toEqual([
      ['balanced-contrast', 'Complementary accent 2'],
      ['wide-spectrum', 'Spectrum accent 2'],
    ]);
    expect(plan.families[0].recipes.every(recipe => recipe.displayName === null)).toBe(true);
  });

  it('gives Brand B three different counts with Derived the fewest, keeping gold and terracotta exact', () => {
    const plan = planColorSystemSecondaryStrategiesV3(planInput(BRAND_B));
    expect(plan.derivedFamilyCount).toBe(3);
    expect(plan.families.slice(0, 3).map(family => family.anchor.hex)).toEqual([
      '#1F6F50',
      '#B5533C',
      '#D9A441',
    ]);
    expect(plan.families.slice(0, 3).map(family => family.displayName)).toEqual([
      'Primary / Brand',
      'Secondary / Terracotta',
      'Secondary / Gold',
    ]);
    expect(plan.families[1].prominence).toBe('supporting');
    expect(plan.families[1].recipes.every(recipe => recipe.realizedHex === '#B5533C')).toBe(true);
    // Terracotta already carries polarity slot 02; only 05 needs an accent in every direction.
    expect(plan.polarityAccentContributionIds).toEqual([POOL[4]]);
    expect(plan.slotDerivation).toEqual({
      fromPolarity: 1,
      fromMinimumTarget: 0,
      fromSeries: 2,
      fromComplementaryPair: 2,
      fromSpectrumMinimum: 0,
    });
    expectDistinctOfferedFamilySets(plan);
    expect(plan.familyCountByDirection).toEqual({
      'close-harmony': 6,
      'balanced-contrast': 8,
      'wide-spectrum': 7,
    });
    const counts = Object.values(plan.familyCountByDirection);
    expect(new Set(counts).size).toBe(3);
    expect(plan.familyCountByDirection['close-harmony']).toBe(Math.min(...counts));
    expect(plan.familyCount).toBe(8);
    expect(direction(plan, 'close-harmony').reason).toBe(
      'Derived: 6 families (3 existing hues, 1 neutral ramp, 1 status reserve (information), 1 analogous accent). The accent is required by your confirmed diverging polarity (generic-secondary-contribution-05).'
    );
    expect(direction(plan, 'balanced-contrast').reason).toMatch(
      /^Complementary: 8 families .* a complementary pair of 2 adds contrast\.$/
    );
    expect(direction(plan, 'wide-spectrum').reason).toBe(
      'Spectrum: 7 families (3 existing hues, 1 neutral ramp, 1 status reserve (information), 2 spectrum accents). Both accents are needed for 5 categorical series because your palette has 3 hue clusters; 1 of them is also required by your confirmed diverging polarity (generic-secondary-contribution-05).'
    );
    const neutral = plan.families[plan.families.length - 1];
    const neutralHue = colorSystemSecondaryOklchFromHexV3(neutral.recipes[0].realizedHex).h;
    expect(
      colorSystemSecondaryHueDistanceV3(neutralHue, plan.measurement.neutralHue.degrees!)
    ).toBeLessThan(20);
    expect(describeColorSystemSecondaryHueTemperatureV3(neutralHue)).toBe('warm');
    for (const entry of plan.directions) {
      expect(entry.unfilledSlots).toEqual([]);
      expectSeparated(directionAnchors(plan, entry.direction));
    }
  });

  it('keeps a preserved Secondary section derived-only, offers no direction that would repeat it, and lets Derived add nothing when jobs are covered', () => {
    const preserved = planColorSystemSecondaryStrategiesV3(
      planInput(BRAND_B, {
        secondaryDisposition: 'preserve',
        polarityContributionIds: [],
        requiredJobs: ['categorical-data', 'sequential-data', 'product-graphics'],
      })
    );
    expect(preserved.slotDerivation).toEqual({
      fromPolarity: 0,
      fromMinimumTarget: 0,
      fromSeries: 0,
      fromComplementaryPair: 0,
      fromSpectrumMinimum: 0,
    });
    expect(preserved.accentSlotCount).toBe(0);
    expect(preserved.reserveFamilyCount).toBe(0);
    expect(preserved.familyCountByDirection).toEqual({
      'close-harmony': 4,
      'balanced-contrast': 4,
      'wide-spectrum': 4,
    });
    expect(preserved.directions.every(entry => entry.accents.length === 0)).toBe(true);
    expect(direction(preserved, 'close-harmony').reason).toBe(
      'Derived: 4 families (3 existing hues, 1 neutral ramp). No new accent: the Secondary section is preserved.'
    );
    // p4-A: with nothing to add, the other two directions would be Derived under another
    // name, so they are not offered and the plan says why in their place.
    expect(preserved.offeredDirections).toEqual(['close-harmony']);
    expect(preserved.omittedDirections).toEqual([
      {
        direction: 'balanced-contrast',
        kind: 'complementary',
        cause: 'preserved',
        reason:
          "Complementary is not offered: the Secondary section is preserved, so it would repeat Derived's families.",
      },
      {
        direction: 'wide-spectrum',
        kind: 'spectrum',
        cause: 'preserved',
        reason:
          "Spectrum is not offered: the Secondary section is preserved, so it would repeat Derived's families.",
      },
    ]);
    expectDistinctOfferedFamilySets(preserved);

    const rebuilt = planColorSystemSecondaryStrategiesV3(
      planInput(BRAND_B, {
        polarityContributionIds: [],
        requiredJobs: ['categorical-data', 'sequential-data', 'product-graphics'],
      })
    );
    expect(rebuilt.slotDerivation).toEqual({
      fromPolarity: 0,
      fromMinimumTarget: 0,
      fromSeries: 2,
      fromComplementaryPair: 2,
      fromSpectrumMinimum: 0,
    });
    expect(rebuilt.omittedDirections).toEqual([]);
    expectDistinctOfferedFamilySets(rebuilt);
    // Derived: your hues plus a neutral, nothing added.
    expect(rebuilt.familyCountByDirection).toEqual({
      'close-harmony': 4,
      'balanced-contrast': 6,
      'wide-spectrum': 6,
    });
    expect(direction(rebuilt, 'close-harmony').reason).toBe(
      'Derived: 4 families (3 existing hues, 1 neutral ramp). No new accent: every confirmed job is covered by your hues.'
    );
    expect(direction(rebuilt, 'balanced-contrast').reason).toBe(
      'Complementary: 6 families (3 existing hues, 1 neutral ramp, 2 complementary accents). A complementary pair of 2 adds contrast.'
    );
    expect(direction(rebuilt, 'wide-spectrum').reason).toBe(
      'Spectrum: 6 families (3 existing hues, 1 neutral ramp, 2 spectrum accents). Both accents are needed for 5 categorical series because your palette has 3 hue clusters.'
    );

    const minimum = planColorSystemSecondaryStrategiesV3(
      planInput(BLUE_ONLY, {
        secondaryDisposition: 'preserve',
        polarityContributionIds: [],
        requiredJobs: ['marketing-accent'],
      })
    );
    expect(minimum.slotDerivation).toEqual({
      fromPolarity: 0,
      fromMinimumTarget: 2,
      fromSeries: 0,
      fromComplementaryPair: 0,
      fromSpectrumMinimum: 0,
    });
    // The two structural accents are searched per direction (analogous, complementary,
    // spectrum), so the three directions differ by value and all are offered.
    expect(minimum.offeredDirections).toEqual([
      'close-harmony',
      'balanced-contrast',
      'wide-spectrum',
    ]);
    expectDistinctOfferedFamilySets(minimum);
    expect(minimum.familyCountByDirection).toEqual({
      'close-harmony': 4,
      'balanced-contrast': 4,
      'wide-spectrum': 4,
    });
    expect(direction(minimum, 'close-harmony').reason).toBe(
      'Derived: 4 families (1 existing hue, 1 neutral ramp, 2 analogous accents). Both accents are needed to reach the minimum of 4 families.'
    );
  });

  it('lifts accents from a dark hero and lowers them from a light hero, shrinking a direction that cannot keep separation', () => {
    const navy = planColorSystemSecondaryStrategiesV3(planInput(NAVY));
    expect(navy.measurement.heroLightnessClass).toBe('dark');
    for (const entry of navy.directions) {
      expect(entry.accents.every(accent => accent.lightnessShift >= 0.1)).toBe(true);
      expect(entry.accents.every(accent => accent.lightness <= 0.78)).toBe(true);
      // Low-chroma hero rule: accents carry at least the accent chroma floor.
      expect(entry.accents.every(accent => accent.chroma >= 0.07)).toBe(true);
      expect(entry.targetFamilyCount).toBe(
        navy.derivedFamilyCount + 1 + navy.reserveFamilyCount + entry.accents.length
      );
    }
    // The complementary pair could not keep ΔEOK 0.08 from the reserves and forced accents:
    // Complementary keeps its own smaller target and says so instead of reporting underfill.
    const navyBalanced = direction(navy, 'balanced-contrast');
    expect(navyBalanced.unfilledSlots).toHaveLength(2);
    expect(navyBalanced.accents).toHaveLength(2);
    expect(navyBalanced.targetFamilyCount).toBe(6);
    expect(navyBalanced.reason).toMatch(
      /2 complementary slots could not keep ΔEOK 0\.08 separation from the accepted anchors and were dropped\.$/
    );
    expect(direction(navy, 'close-harmony').targetFamilyCount).toBe(6);
    expect(direction(navy, 'wide-spectrum').targetFamilyCount).toBe(8);
    expect(navy.familyCountBand).toEqual({ minimum: 6, maximum: 8 });

    const yellow = planColorSystemSecondaryStrategiesV3(planInput(YELLOW));
    expect(yellow.measurement.heroLightnessClass).toBe('light');
    for (const entry of yellow.directions) {
      expect(entry.accents.every(accent => accent.lightnessShift <= -0.1)).toBe(true);
      expect(entry.accents.every(accent => accent.lightness >= 0.35)).toBe(true);
    }
    expect(direction(yellow, 'balanced-contrast').unfilledSlots).toHaveLength(1);
    expect(yellow.familyCountByDirection).toEqual({
      'close-harmony': 7,
      'balanced-contrast': 8,
      'wide-spectrum': 9,
    });
    // A slot the structure forces is never dropped: with no polarity binding, every
    // direction's forced slots are the ones that reach the minimum, and those stay.
    expect(
      navy.directions.every(entry =>
        entry.unfilledSlots.every(slot => slot - navy.derivedFamilyCount - 1 >= 2)
      )
    ).toBe(true);
  });

  it('reserves ±20° around an observed semantic-claim hue for generated accents only', () => {
    const plan = planColorSystemSecondaryStrategiesV3(
      planInput([...BRAND_B, input('error', 'Text / Error', 'typography', '#D6453D')])
    );
    const claim = plan.measurement.semanticClaims[0];
    expect(claim.claim).toBe('error');
    const exclusion = plan.territories.find(territory =>
      territory.territoryId.startsWith(COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.semanticClaimPrefix)
    );
    expect(exclusion).toMatchObject({
      status: 'excluded',
      appliesToProminence: ['accent'],
      allowedJobs: [],
      allowedProminence: [],
    });
    expect(exclusion?.perceptualBounds.hueRanges).toEqual([
      {
        minimum: expect.closeTo(
          claim.hue - COLOR_SYSTEM_SECONDARY_SEMANTIC_CLAIM_EXCLUSION_DEGREES_V3,
          6
        ),
        maximum: expect.closeTo(
          claim.hue + COLOR_SYSTEM_SECONDARY_SEMANTIC_CLAIM_EXCLUSION_DEGREES_V3,
          6
        ),
      },
    ]);
    for (const entry of plan.directions) {
      for (const accent of entry.accents) {
        expect(colorSystemSecondaryHueDistanceV3(accent.hue, claim.hue)).toBeGreaterThanOrEqual(
          COLOR_SYSTEM_SECONDARY_SEMANTIC_CLAIM_EXCLUSION_DEGREES_V3
        );
      }
    }
    // The brand's own terracotta (hue ≈ 34°) stays derived even though it sits inside the zone.
    expect(
      plan.families.some(family => family.anchor.hex === '#B5533C' && family.kind === 'observed')
    ).toBe(true);
  });

  it('skips a near-duplicate observed Secondary and records why', () => {
    const plan = planColorSystemSecondaryStrategiesV3(
      planInput([
        ...BRAND_B,
        input('gold-2', 'Secondary / Gold Dup', 'secondary', '#DAA543', '#DAA543', 'evidence-only'),
      ])
    );
    expect(plan.skippedObserved).toHaveLength(1);
    expect(plan.skippedObserved[0]).toMatchObject({
      hex: '#DAA543',
      nearestStableColorId: 'gold',
    });
    expect(plan.skippedObserved[0].deltaEOK).toBeLessThan(0.08);
    expect(plan.derivedFamilyCount).toBe(3);
  });

  it('is byte-deterministic and independent of input color order', () => {
    const first = planColorSystemSecondaryStrategiesV3(planInput(BRAND_B));
    const second = planColorSystemSecondaryStrategiesV3(planInput([...BRAND_B].reverse()));
    expect(canonicalJson(second)).toBe(canonicalJson(first));
    const blueFirst = planColorSystemSecondaryStrategiesV3(planInput(BLUE_ONLY));
    const blueSecond = planColorSystemSecondaryStrategiesV3(planInput([...BLUE_ONLY].reverse()));
    expect(canonicalJson(blueSecond)).toBe(canonicalJson(blueFirst));
  });

  it('fails closed on impossible slot identities', () => {
    expect(() =>
      planColorSystemSecondaryStrategiesV3(
        planInput(BLUE_ONLY, { polarityContributionIds: ['missing'] })
      )
    ).toThrow('not a chromatic slot identity');
    expect(() =>
      planColorSystemSecondaryStrategiesV3(
        planInput(BLUE_ONLY, { chromaticContributionIds: [...POOL, NEUTRAL_ID] })
      )
    ).toThrow('must be unique');
    expect(() =>
      planColorSystemSecondaryStrategiesV3(
        planInput([input('ink', 'Text / Ink', 'typography', '#000000', '#FFFFFF')])
      )
    ).toThrow('chromatic opaque Primary hero');
  });
});

describe('secondary strategy v3: conventional status reserves', () => {
  it('adds success, warning, and error reserves for a blue brand and none for information', () => {
    const plan = planColorSystemSecondaryStrategiesV3(planInput(BLUE_ONLY));
    expect(reserveRoles(plan)).toEqual(['success', 'warning', 'error']);
    expect(plan.coveredStatusRoles).toEqual([
      expect.objectContaining({ role: 'information', displayName: 'Primary / Brand' }),
    ]);
    expect(plan.skippedReserves).toEqual([]);
    const hero = plan.measurement.hero!;
    for (const reserve of plan.reserves) {
      const family = plan.families.find(entry => entry.contributionId === reserve.contributionId)!;
      expect(family.kind).toBe('reserve');
      expect(family.contributionId).toBe(`generic-status-reserve-${reserve.role}`);
      expect(family.displayName).toBe(`Status reserve — ${reserve.role}`);
      expect(family.prominence).toBe('supporting');
      expect(family.territoryId).toBe(COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.reserve);
      expect(family.jobs).toEqual(['product-semantics']);
      expect(family.reserve).toBe(reserve);
      // The conventional centre is requested exactly; the realized anchor stays in range.
      expect(reserve.hue).toBe(COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_V3[reserve.role]);
      expect(reserve.requested.h).toBeCloseTo(reserve.hue, 6);
      expect(colorSystemSecondaryHueWithinRangeV3(reserve.realized.h, reserve.range)).toBe(true);
      // Chroma follows the hero (0.215) clamped to the band; gamut mapping may lower it.
      expect(reserve.requested.c).toBeCloseTo(
        COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_CHROMA_BAND_V3.maximum,
        6
      );
      expect(reserve.realized.c).toBeLessThanOrEqual(
        COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_CHROMA_BAND_V3.maximum + 0.005
      );
      expect(reserve.realized.c).toBeGreaterThanOrEqual(
        COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_CHROMA_BAND_V3.minimum
      );
      // Step 9 targets L 0.55 so it can carry white text.
      expect(reserve.requested.l).toBeCloseTo(0.55, 6);
      expect(Math.abs(reserve.realized.l - 0.55)).toBeLessThan(0.02);
      expect(reserve.minimumSeparationDeltaEOK).toBeGreaterThanOrEqual(
        COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3
      );
      // Identity recipes: the reserve is the same family in every direction.
      expect(family.recipes.map(recipe => recipe.direction)).toEqual([
        'close-harmony',
        'balanced-contrast',
        'wide-spectrum',
      ]);
      expect(family.recipes.every(recipe => recipe.realizedHex === reserve.realizedHex)).toBe(true);
      // The engine reproduces the planned anchor from the seed's base transform.
      expect(
        realizeColorSystemSecondaryAnchorV3(hero.hex, family.base, {
          hueOffsetDegrees: 0,
          chromaScale: 1,
          lightnessShift: 0,
        }).hex
      ).toBe(reserve.realizedHex);
    }
    const territory = plan.territories.find(
      entry => entry.territoryId === COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.reserve
    );
    expect(territory).toMatchObject({
      status: 'allowed',
      allowedJobs: ['product-semantics'],
      allowedProminence: ['supporting'],
      appliesToProminence: ['supporting'],
    });
    expect(territory?.perceptualBounds.hueRanges).toHaveLength(4);
    // Reserves count toward every direction's target and toward separation.
    for (const entry of plan.directions) {
      expect(entry.reserveFamilyCount).toBe(3);
      expectSeparated(directionAnchors(plan, entry.direction));
    }
  });

  it('adds no success, warning, or error reserve for Brand B, which owns those hues', () => {
    const plan = planColorSystemSecondaryStrategiesV3(planInput(BRAND_B));
    expect(reserveRoles(plan)).toEqual(['information']);
    expect(plan.coveredStatusRoles.map(entry => [entry.role, entry.displayName])).toEqual([
      ['success', 'Primary / Brand'],
      ['warning', 'Secondary / Gold'],
      ['error', 'Secondary / Terracotta'],
    ]);
    // Chroma follows the hero (0.092) inside the band; lightness targets 0.55.
    expect(plan.reserves[0].requested.c).toBeCloseTo(plan.measurement.hero!.oklch.c, 6);
    expect(plan.reserves[0].requested.l).toBeCloseTo(0.55, 6);
    // No reserve territory is declared when no reserve is planned.
    const noSemantics = planColorSystemSecondaryStrategiesV3(
      planInput(BRAND_B, { requiredJobs: ['marketing-accent', 'categorical-data'] })
    );
    expect(noSemantics.reserves).toEqual([]);
    expect(
      noSemantics.territories.some(
        territory => territory.territoryId === COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.reserve
      )
    ).toBe(false);
  });

  it('adds success, error, and information reserves for a yellow brand, which owns the warning range', () => {
    const plan = planColorSystemSecondaryStrategiesV3(planInput(YELLOW));
    expect(reserveRoles(plan)).toEqual(['success', 'error', 'information']);
    expect(plan.coveredStatusRoles.map(entry => entry.role)).toEqual(['warning']);
    // Light hero: the lightness shift is clamped to −0.25, so step 9 lands near L 0.56.
    expect(plan.reserves.every(reserve => Math.abs(reserve.realized.l - 0.56) < 0.02)).toBe(true);
  });

  it('counts a preserved chromatic color from another section as owning its range', () => {
    const plan = planColorSystemSecondaryStrategiesV3(
      planInput([...BLUE_ONLY, input('mint', 'Text / Mint', 'typography', '#2E8B57')])
    );
    expect(reserveRoles(plan)).toEqual(['warning', 'error']);
    expect(plan.coveredStatusRoles.map(entry => [entry.role, entry.displayName])).toEqual([
      ['success', 'Text / Mint'],
      ['information', 'Primary / Brand'],
    ]);
  });

  it('skips a reserve that would collide with an accepted anchor and records why', () => {
    // Navy's low chroma pins every reserve at chroma 0.08; the error red then sits within
    // ΔEOK 0.08 of the warning amber and is skipped, not forced.
    const plan = planColorSystemSecondaryStrategiesV3(planInput(NAVY));
    expect(reserveRoles(plan)).toEqual(['success', 'warning']);
    expect(plan.skippedReserves).toHaveLength(1);
    const skipped = plan.skippedReserves[0];
    expect(skipped.role).toBe('error');
    expect(skipped.contributionId).toBe('generic-status-reserve-error');
    expect(skipped.deltaEOK).toBeLessThan(COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3);
    expect(skipped.nearestHex).toBe(
      plan.reserves.find(reserve => reserve.role === 'warning')!.realizedHex
    );
    // p3-H: the record names the anchor it collided with and its cause.
    expect(skipped.nearestDisplayName).toBe('Status reserve — warning');
    expect(skipped.cause).toBe('separation');
    expect(skipped.reason).toMatch(
      /^The conventional red for error \(hue 28°\) would sit ΔEOK 0\.0\d from Status reserve — warning \(#[0-9A-F]{6}\), below the 0\.08 separation rule, so no reserve was added\.$/
    );
    expect(plan.families.some(family => family.contributionId === skipped.contributionId)).toBe(
      false
    );
    for (const entry of plan.directions) expectSeparated(directionAnchors(plan, entry.direction));
  });

  it('adds reserves only when product-semantics is a confirmed job', () => {
    const plan = planColorSystemSecondaryStrategiesV3(
      planInput(BLUE_ONLY, {
        requiredJobs: ['marketing-accent', 'categorical-data', 'sequential-data'],
        polarityContributionIds: [],
      })
    );
    expect(plan.reserves).toEqual([]);
    expect(plan.coveredStatusRoles).toEqual([]);
    expect(plan.reserveFamilyCount).toBe(0);
  });

  it('is deterministic with reserves in play', () => {
    const first = planColorSystemSecondaryStrategiesV3(planInput(YELLOW));
    const second = planColorSystemSecondaryStrategiesV3(planInput([...YELLOW].reverse()));
    expect(canonicalJson(second)).toBe(canonicalJson(first));
  });
});

describe('secondary strategy v3: readings and copy', () => {
  it('classifies families from realized colors and writes copy from the numbers', () => {
    expect(classifyColorSystemSecondaryFamilyAnchorV3('#D9A441', '#d9a441')).toBe('derived');
    expect(classifyColorSystemSecondaryFamilyAnchorV3('#76706A', null)).toBe('neutral');
    expect(classifyColorSystemSecondaryFamilyAnchorV3('#9571A9', '#1F6F50')).toBe('accent');
    expect(
      classifyColorSystemSecondaryFamilyAnchorV3('#1C882D', '#2563EB', {
        contributionId: 'generic-status-reserve-success',
      })
    ).toBe('reserve');
    expect(colorSystemSecondaryStatusReserveRoleV3({ displayName: 'Status reserve — error' })).toBe(
      'error'
    );
    expect(
      colorSystemSecondaryStatusReserveRoleV3({ contributionId: 'generic-status-reserve-mood' })
    ).toBeNull();

    const hero = colorSystemSecondaryOklchFromHexV3('#1F2A44');
    const accent = readColorSystemSecondaryFamilyV3({
      displayName: 'Complementary accent 1',
      anchorHex: '#924A00',
      sourceHex: '#1F2A44',
      sourceDisplayName: 'Primary / Brand',
      heroOklch: hero,
      otherAnchorHexes: ['#1F2A44', '#6B6E75'],
    });
    expect(accent.kind).toBe('accent');
    expect(accent.reserveRole).toBeNull();
    expect(accent.lightnessShiftFromHero).toBeCloseTo(0.2, 1);
    expect(accent.minimumSeparationDeltaEOK).toBeCloseTo(
      Math.min(
        colorSystemSecondaryDeltaEOKV3('#924A00', '#1F2A44'),
        colorSystemSecondaryDeltaEOKV3('#924A00', '#6B6E75')
      ),
      9
    );
    const sentence = describeColorSystemSecondaryFamilyV3(accent, {
      strategyKind: 'complementary',
      heroLightnessClass: 'dark',
    });
    expect(sentence).toMatch(
      /^New complementary accent at hue \d+°, L 0\.\d\d \(\+0\.\d\d from your dark primary\), chroma 0\.\d{3}; ΔEOK 0\.\d\d from the nearest family anchor\.$/
    );

    const derived = readColorSystemSecondaryFamilyV3({
      displayName: 'Secondary / Gold',
      anchorHex: '#D9A441',
      sourceHex: '#D9A441',
      sourceDisplayName: 'Secondary / Gold',
      heroOklch: hero,
      otherAnchorHexes: [],
    });
    expect(
      describeColorSystemSecondaryFamilyV3(derived, {
        strategyKind: 'derived',
        heroLightnessClass: 'dark',
      })
    ).toBe(
      'Derived from your Secondary / Gold (#D9A441); the exact color is step 9 of its 12-step Light and Dark scale.'
    );
    const neutral = readColorSystemSecondaryFamilyV3({
      displayName: 'Neutral',
      anchorHex: '#76706A',
      sourceHex: '#1F6F50',
      sourceDisplayName: 'Primary / Brand',
      heroOklch: hero,
      otherAnchorHexes: [],
    });
    expect(
      describeColorSystemSecondaryFamilyV3(neutral, {
        strategyKind: 'derived',
        heroLightnessClass: 'mid',
      })
    ).toMatch(
      /^Neutral ramp tinted toward hue \d+° \(warm\); step-9 chroma 0\.\d{3} keeps every step inside the measured neutral rule \(below 0\.03\)\.$/
    );

    const summary = describeColorSystemSecondaryDirectionV3({
      strategyKind: 'derived',
      readings: [derived, neutral],
      heroLightnessClass: 'mid',
      minimumSeparationDeltaEOK: null,
    });
    expect(summary).toMatch(
      /^Derived from your palette: 1 existing hue as full Light and Dark scale \(Secondary \/ Gold\) plus a warm neutral ramp \(hue \d+°\)\. No new hue was needed for the confirmed jobs\. 2 families in this direction\.$/
    );
    const withAccent = describeColorSystemSecondaryDirectionV3({
      strategyKind: 'complementary',
      readings: [derived, neutral, accent],
      heroLightnessClass: 'dark',
      minimumSeparationDeltaEOK: 0.19,
    });
    expect(withAccent).toMatch(
      /Adds one complementary accent at hue \d+°, L 0\.\d\d \(\+0\.\d\d from your dark primary\); minimum family separation ΔEOK 0\.19\. 3 families in this direction\.$/
    );
    // A planner reason replaces the bare count.
    const withReason = describeColorSystemSecondaryDirectionV3({
      strategyKind: 'complementary',
      readings: [derived, neutral, accent],
      heroLightnessClass: 'dark',
      minimumSeparationDeltaEOK: 0.19,
      countReason:
        'Complementary: 3 families (1 existing hue, 1 neutral ramp, 1 complementary accent). One complementary accent adds contrast.',
    });
    expect(withReason.endsWith(' One complementary accent adds contrast.')).toBe(true);
    expect(withReason).not.toMatch(/families in this direction/);
  });

  it('describes a status reserve from its measured hue and the range it fills', () => {
    const hero = colorSystemSecondaryOklchFromHexV3('#2563EB');
    const byIdentity = readColorSystemSecondaryFamilyV3({
      displayName: 'Status reserve — success',
      anchorHex: '#1C882D',
      sourceHex: '#2563EB',
      sourceDisplayName: 'Primary / Brand',
      heroOklch: hero,
      otherAnchorHexes: ['#2563EB', '#BD4238'],
      contributionId: 'generic-status-reserve-success',
    });
    expect(byIdentity.kind).toBe('reserve');
    expect(byIdentity.reserveRole).toBe('success');
    expect(byIdentity.sourceDisplayName).toBeNull();
    expect(
      describeColorSystemSecondaryFamilyV3(byIdentity, {
        strategyKind: 'derived',
        heroLightnessClass: 'mid',
      })
    ).toMatch(
      /^Adds a conventional green \(hue 145°\) for success because your palette has no hue between 120° and 170°\. Step 9 sits at L 0\.55, chroma 0\.\d{3}, for product status roles only; ΔEOK 0\.\d\d from the nearest family anchor\.$/
    );
    // Without a contribution id the planner's display-name form still identifies it.
    const byName = readColorSystemSecondaryFamilyV3({
      displayName: 'Status reserve — success',
      anchorHex: '#1C882D',
      sourceHex: '#2563EB',
      sourceDisplayName: 'Primary / Brand',
      heroOklch: hero,
      otherAnchorHexes: [],
    });
    expect(byName.kind).toBe('reserve');
    expect(byName.reserveRole).toBe('success');

    const warning = readColorSystemSecondaryFamilyV3({
      displayName: 'Status reserve — warning',
      anchorHex: '#9E6300',
      sourceHex: '#2563EB',
      sourceDisplayName: 'Primary / Brand',
      heroOklch: hero,
      otherAnchorHexes: [],
      contributionId: 'generic-status-reserve-warning',
    });
    const summary = describeColorSystemSecondaryDirectionV3({
      strategyKind: 'derived',
      readings: [byIdentity, warning],
      heroLightnessClass: 'mid',
      minimumSeparationDeltaEOK: null,
    });
    expect(summary).toContain(
      'Adds conventional status reserves — green (hue 145°) for success, amber (hue 69°) for warning — because your palette has no hue in those ranges.'
    );
    const single = describeColorSystemSecondaryDirectionV3({
      strategyKind: 'spectrum',
      readings: [byIdentity],
      heroLightnessClass: 'mid',
      minimumSeparationDeltaEOK: null,
    });
    expect(single).toContain(
      'Adds a conventional status reserve — green (hue 145°) for success — because your palette has no hue in the 120°–170° range.'
    );
  });
});

/* ------------------------------------------------------------------------ */
/* p3-H: owned hues, recorded tints, and the family ceiling                   */
/* ------------------------------------------------------------------------ */

const TREE_NAMES = [
  'Alder',
  'Birch',
  'Cedar',
  'Dogwood',
  'Elm',
  'Fir',
  'Ginkgo',
  'Hazel',
  'Ironwood',
  'Juniper',
  'Katsura',
  'Larch',
  'Maple',
  'Nyssa',
  'Oak',
  'Poplar',
  'Quince',
  'Rowan',
  'Spruce',
  'Tupelo',
  'Umbrella',
  'Viburnum',
  'Willow',
  'Yew',
];

/**
 * 24 hues 12° apart on four lightness levels (OKLCH targets L 0.38/0.55/0.70/0.84,
 * C 0.15, mapped into sRGB). Every pair sits at least ΔEOK 0.08 apart and every
 * status hue range is covered, so no reserve is planned. The first 23 fill the
 * 24-family ceiling exactly beside the neutral ramp; all 24 exceed it.
 */
const CEILING_HUES = [
  '#7C0438',
  '#B84451',
  '#ED7666',
  '#FFB18F',
  '#702900',
  '#A95B00',
  '#D29000',
  '#F2C542',
  '#4E4300',
  '#737900',
  '#89AE37',
  '#9BE17D',
  '#00550D',
  '#008B54',
  '#00BB95',
  '#00E9D7',
  '#004F52',
  '#008395',
  '#00B2DF',
  '#70D8FF',
  '#004580',
  '#3070C7',
  '#7898FB',
  '#BEC3FF',
];

/**
 * 22 hues that leave the warning (55–95°) and information (230–275°) ranges empty
 * while staying at least ΔEOK 0.08 apart, so the planner wants two reserves and
 * the ceiling (22 hues + neutral + 2 reserves = 25) forces one drop.
 */
const RESERVE_DROP_HUES = [
  '#525100',
  '#596E00',
  '#528E00',
  '#46AC39',
  '#30CA6F',
  '#00E7A0',
  '#005E47',
  '#007669',
  '#008F8E',
  '#00A8B7',
  '#00C1E5',
  '#CAB3FF',
  '#662398',
  '#8A37A6',
  '#AF4BB1',
  '#D45FB9',
  '#F975BF',
  '#FF9DC3',
  '#950039',
  '#F2D9E6',
  '#CF4234',
  '#E9622E',
];

/** The same palette less two hues: 20 hues + neutral + 2 reserves leave room for exactly one accent. */
const ONE_ACCENT_HUES = RESERVE_DROP_HUES.filter((_, index) => index !== 19 && index !== 21);

const WIDE_POOL = Array.from(
  { length: 23 },
  (_, index) => `generic-secondary-contribution-${String(index + 1).padStart(2, '0')}`
);

function manyHueColors(hexes: readonly string[]): ColorSystemSecondaryMeasurementColorInputV3[] {
  return [
    input('primary', 'Primary / Brand', 'primary', hexes[0]),
    ...hexes
      .slice(1)
      .map((hex, index) =>
        input(`hue-${TREE_NAMES[index]}`, `Secondary / ${TREE_NAMES[index]}`, 'secondary', hex)
      ),
    ...BLUE_ONLY.slice(1),
  ];
}

function widePlan(colors: readonly ColorSystemSecondaryMeasurementColorInputV3[]) {
  return planColorSystemSecondaryStrategiesV3(
    planInput(colors, { chromaticContributionIds: WIDE_POOL })
  );
}

describe('secondary strategy v3: p3-H owned hues, recorded tints, and the family ceiling', () => {
  it('admits an observed color between the neutral rule and the hero floor as an exact family', () => {
    const PINE = '#19342D'; // OKLCH chroma 0.0358: below the 0.04 hero floor, above the 0.03 neutral rule.
    const colors = [
      input('beacon', 'Primary / Beacon', 'primary', '#D6F20F'),
      input('pine', 'Secondary / Pine', 'secondary', PINE),
      input('stone', 'Secondary / Stone', 'secondary', '#D5D1C9'), // chroma 0.012: a neutral
      ...BLUE_ONLY.slice(1),
    ];
    const pineChroma = colorSystemSecondaryOklchFromHexV3(PINE).c;
    expect(pineChroma).toBeGreaterThanOrEqual(
      COLOR_SYSTEM_SECONDARY_OBSERVED_CHROMATIC_MINIMUM_CHROMA_V3
    );
    expect(pineChroma).toBeLessThan(COLOR_SYSTEM_SECONDARY_CHROMATIC_MINIMUM_CHROMA_V3);
    // The observed rule meets the neutral rule with no gap between them.
    expect(COLOR_SYSTEM_SECONDARY_OBSERVED_CHROMATIC_MINIMUM_CHROMA_V3).toBe(
      COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3
    );
    const measurement = measureColorSystemSecondaryPaletteV3(colors);
    expect(measurement.observedChromatic.map(value => value.stableColorId)).toEqual(['pine']);
    expect(measurement.observedNeutrals.some(value => value.stableColorId === 'pine')).toBe(false);
    expect(measurement.observedNeutrals.some(value => value.stableColorId === 'stone')).toBe(true);

    const plan = planColorSystemSecondaryStrategiesV3(planInput(colors));
    const pine = plan.families.find(family => family.anchor.stableColorId === 'pine');
    expect(pine).toMatchObject({ kind: 'observed', prominence: 'supporting', slot: 2 });
    expect(pine?.anchor.hex).toBe(PINE);
    expect(pine?.recipes.every(recipe => recipe.realizedHex === PINE)).toBe(true);
    expect(plan.families.some(family => family.anchor.stableColorId === 'stone')).toBe(false);
    expect(plan.skippedObserved).toEqual([]);
  });

  it('pairs recorded tints by name, keeps them off the family list, and attaches them to their family', () => {
    const colors = [
      input('beacon', 'Primary / Beacon', 'primary', '#D6F20F'),
      input('beacon-light', 'Primary / Beacon Light', 'primary', '#EEFAB4'),
      input('harbor', 'Secondary / Harbor', 'secondary', '#9CC2EA'),
      input('harbor-light', 'Secondary / Harbor Light', 'secondary', '#EAF1F8'),
      input('ember', 'Secondary / Ember', 'secondary', '#F9601F'),
      // Chroma 0.0398 is above the observed floor; the name still makes it a tint.
      input('ember-light', 'Secondary / Ember Light', 'secondary', '#FDDCD1'),
      input('teal-500', 'Secondary / Teal/500', 'secondary', '#00848B'),
      input('teal-100', 'Secondary / Teal/100', 'secondary', '#E3F4F5'),
      input('teal-700', 'Secondary / Teal/700', 'secondary', '#005048'),
      ...BLUE_ONLY.slice(1),
    ];
    const measurement = measureColorSystemSecondaryPaletteV3(colors);
    expect(colorSystemSecondaryOklchFromHexV3('#FDDCD1').c).toBeGreaterThan(
      COLOR_SYSTEM_SECONDARY_OBSERVED_CHROMATIC_MINIMUM_CHROMA_V3
    );
    expect(
      measurement.observedTints.map(tint => [tint.stableColorId, tint.baseStableColorId, tint.rule])
    ).toEqual([
      ['beacon-light', 'beacon', 'light-suffix'],
      ['ember-light', 'ember', 'light-suffix'],
      ['harbor-light', 'harbor', 'light-suffix'],
      ['teal-100', 'teal-500', 'numeric-path'],
    ]);
    const chromaticIds = measurement.observedChromatic.map(value => value.stableColorId);
    expect(chromaticIds).toEqual(
      expect.arrayContaining(['ember', 'harbor', 'teal-500', 'teal-700'])
    );
    expect(chromaticIds).not.toEqual(
      expect.arrayContaining(['ember-light', 'harbor-light', 'teal-100', 'beacon-light'])
    );
    // A tint's pinning value is its Light mode.
    expect(measurement.observedTints[0].value).toMatchObject({ mode: 'Light', hex: '#EEFAB4' });

    const plan = planColorSystemSecondaryStrategiesV3(planInput(colors));
    const tintsOf = (id: string) =>
      plan.families
        .find(family => family.anchor.stableColorId === id)
        ?.tints?.map(tint => tint.stableColorId);
    expect(tintsOf('beacon')).toEqual(['beacon-light']);
    expect(tintsOf('harbor')).toEqual(['harbor-light']);
    expect(tintsOf('ember')).toEqual(['ember-light']);
    expect(tintsOf('teal-500')).toEqual(['teal-100']);
    expect(tintsOf('teal-700')).toBeUndefined();
    expect(plan.families.some(family => family.anchor.stableColorId === 'ember-light')).toBe(false);
    expect(plan.orphanTints).toEqual([]);
    // Input order does not matter.
    expect(
      canonicalJson(planColorSystemSecondaryStrategiesV3(planInput([...colors].reverse())))
    ).toBe(canonicalJson(plan));
  });

  it('prefers a same-section base for a light-suffix tint and pairs nothing when the key is ambiguous', () => {
    const preferred = measureColorSystemSecondaryPaletteV3([
      input('sky-primary', 'Sky', 'primary', '#4777D2'),
      input('sky-secondary', 'Sky', 'secondary', '#9CC2EA'),
      input('sky-light', 'Sky Light', 'secondary', '#EAF1F8'),
      ...BLUE_ONLY.slice(1),
    ]);
    expect(
      preferred.observedTints.map(tint => [tint.stableColorId, tint.baseStableColorId])
    ).toEqual([['sky-light', 'sky-secondary']]);
    const ambiguous = measureColorSystemSecondaryPaletteV3([
      input('primary', 'Primary / Brand', 'primary', '#2563EB'),
      input('sky-a', 'Secondary / Sky', 'secondary', '#9CC2EA'),
      input('sky-b', 'Secondary/Sky', 'secondary', '#4777D2'),
      input('sky-light', 'Secondary / Sky Light', 'secondary', '#EAF1F8'),
      ...BLUE_ONLY.slice(1),
    ]);
    expect(ambiguous.observedTints).toEqual([]);
    expect(ambiguous.observedNeutrals.some(value => value.stableColorId === 'sky-light')).toBe(
      true
    );
  });

  it('lists a tint whose base was a skipped near-duplicate as an orphan', () => {
    const plan = planColorSystemSecondaryStrategiesV3(
      planInput([
        ...BRAND_B,
        input('forest', 'Secondary / Forest', 'secondary', '#216F52'),
        input('forest-light', 'Secondary / Forest Light', 'secondary', '#E2EFE9'),
      ])
    );
    expect(
      plan.skippedObserved.map(entry => [entry.stableColorId, entry.nearestStableColorId])
    ).toEqual([['forest', 'primary']]);
    expect(plan.orphanTints.map(tint => [tint.stableColorId, tint.baseStableColorId])).toEqual([
      ['forest-light', 'forest'],
    ]);
    expect(
      plan.families.every(
        family => !(family.tints ?? []).some(tint => tint.stableColorId === 'forest-light')
      )
    ).toBe(true);
  });

  it('fills the ceiling with owned hues, offers Derived alone, and says why the other two are not offered', () => {
    const plan = widePlan(manyHueColors(CEILING_HUES.slice(0, 23)));
    expect(plan.derivedFamilyCount).toBe(23);
    expect(plan.skippedObserved).toEqual([]);
    expect(plan.reserves).toEqual([]);
    expect(plan.accentSlotCount).toBe(0);
    expect(plan.familyCountByDirection).toEqual({
      'close-harmony': 24,
      'balanced-contrast': 24,
      'wide-spectrum': 24,
    });
    expect(plan.familyLimit).toEqual({
      maximumFamilies: 24,
      derivedCapacity: 23,
      seriesAccentsRemoved: 0,
      pairAccentsRemoved: 2,
      spectrumMinimumRemoved: 1,
      reservesDropped: 0,
    });
    // p4-A: no room for Spectrum's one accent or the complementary pair, so neither
    // direction is offered; Derived alone enters the strategy set.
    expect(plan.offeredDirections).toEqual(['close-harmony']);
    expect(plan.omittedDirections).toEqual([
      {
        direction: 'balanced-contrast',
        kind: 'complementary',
        cause: 'family-limit',
        reason: 'Complementary is not offered: 23 owned hues leave no room within 24 families.',
      },
      {
        direction: 'wide-spectrum',
        kind: 'spectrum',
        cause: 'family-limit',
        reason: 'Spectrum is not offered: 23 owned hues leave no room within 24 families.',
      },
    ]);
    expectDistinctOfferedFamilySets(plan);
    for (const hex of CEILING_HUES.slice(0, 23)) {
      expect(
        plan.families.some(
          family =>
            family.anchor.hex === hex && (family.kind === 'hero' || family.kind === 'observed')
        ),
        hex
      ).toBe(true);
    }
    expect(direction(plan, 'close-harmony').reason).toBe(
      'Derived: 24 families (23 existing hues, 1 neutral ramp). No new accent: every confirmed job is covered by your hues.'
    );
    expect(direction(plan, 'balanced-contrast').reason).toBe(
      'Complementary is not offered: 23 owned hues leave no room within 24 families.'
    );
    expect(direction(plan, 'wide-spectrum').reason).toBe(
      'Spectrum is not offered: 23 owned hues leave no room within 24 families.'
    );
  });

  it('fails closed with a plain count when the palette owns more hues than the ceiling holds', () => {
    expect(() => widePlan(manyHueColors(CEILING_HUES))).toThrow(
      'Your palette has 24 hues; Teul builds systems of up to 24 families (23 hues plus one neutral ramp). Remove or merge 1 hue in the Secondary section and analyze again.'
    );
  });

  it('drops a status reserve at the ceiling before any owned hue and records the drop', () => {
    const plan = widePlan(manyHueColors(RESERVE_DROP_HUES));
    expect(plan.derivedFamilyCount).toBe(22);
    expect(plan.skippedObserved).toEqual([]);
    expect(reserveRoles(plan)).toEqual(['warning']);
    expect(plan.skippedReserves).toEqual([
      expect.objectContaining({
        role: 'information',
        contributionId: 'generic-status-reserve-information',
        hue: 250,
        cause: 'family-limit',
        nearestDisplayName: 'Status reserve — information',
        reason:
          'The blue reserve for information (hue 250°) was dropped at the 24-family limit: your 22 owned hues and the neutral ramp come first.',
      }),
    ]);
    expect(plan.familyLimit).toEqual({
      maximumFamilies: 24,
      derivedCapacity: 23,
      seriesAccentsRemoved: 0,
      pairAccentsRemoved: 2,
      spectrumMinimumRemoved: 1,
      reservesDropped: 1,
    });
    expect(plan.familyCountByDirection).toEqual({
      'close-harmony': 24,
      'balanced-contrast': 24,
      'wide-spectrum': 24,
    });
    expect(
      plan.families.some(family => family.contributionId === 'generic-status-reserve-information')
    ).toBe(false);
    expect(plan.families.filter(family => family.kind === 'observed')).toHaveLength(21);
    // p4-A: the kept reserve counts toward the room the ceiling leaves, and the copy says so.
    expect(plan.offeredDirections).toEqual(['close-harmony']);
    expect(direction(plan, 'balanced-contrast').reason).toBe(
      'Complementary is not offered: 22 owned hues and 1 status reserve leave no room within 24 families.'
    );
    expect(direction(plan, 'wide-spectrum').reason).toBe(
      'Spectrum is not offered: 22 owned hues and 1 status reserve leave no room within 24 families.'
    );
    expect(plan.omittedDirections.map(entry => [entry.direction, entry.cause])).toEqual([
      ['balanced-contrast', 'family-limit'],
      ['wide-spectrum', 'family-limit'],
    ]);
    expectDistinctOfferedFamilySets(plan);
  });

  it('keeps one complementary accent when exactly one fits, gives Spectrum its one accent in that room, and says so', () => {
    const plan = widePlan(manyHueColors(ONE_ACCENT_HUES));
    expect(plan.derivedFamilyCount).toBe(20);
    expect(reserveRoles(plan)).toEqual(['warning', 'information']);
    expect(plan.skippedReserves).toEqual([]);
    expect(plan.familyLimit.pairAccentsRemoved).toBe(1);
    expect(plan.familyLimit.spectrumMinimumRemoved).toBe(0);
    // p4-A: the one free slot holds Complementary's single accent and Spectrum's minimum
    // accent, so both differ from Derived by one family.
    expect(plan.slotDerivation.fromSpectrumMinimum).toBe(1);
    expect(plan.familyCountByDirection).toEqual({
      'close-harmony': 23,
      'balanced-contrast': 24,
      'wide-spectrum': 24,
    });
    expect(plan.offeredDirections).toEqual(['close-harmony', 'balanced-contrast', 'wide-spectrum']);
    expect(direction(plan, 'balanced-contrast').accents).toHaveLength(1);
    expect(direction(plan, 'balanced-contrast').reason).toBe(
      'Complementary: 24 families (20 existing hues, 1 neutral ramp, 2 status reserves (warning, information), 1 complementary accent). One complementary accent adds contrast; a second does not fit within the 24-family limit.'
    );
    const spectrum = direction(plan, 'wide-spectrum');
    expect(spectrum.accents).toHaveLength(1);
    const [accent] = spectrum.accents;
    // Twenty owned hues leave no gap wide enough to hold a separated accent at its
    // midpoint, so the copy names the gap the accent did take and the widest it could not.
    expect(accent.hueGap).not.toBeNull();
    expect(hueWithinGap(accent.hue, accent.hueGap!)).toBe(true);
    expect(accent.hueGap!.widest).toBe(
      accent.hueGap!.widthDegrees >= accent.hueGap!.widestWidthDegrees - 1e-9
    );
    expect(accent.minimumSeparationDeltaEOK).toBeGreaterThanOrEqual(
      COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3
    );
    expect(spectrum.reason).toMatch(
      /^Spectrum: 24 families \(20 existing hues, 1 neutral ramp, 2 status reserves \(warning, information\), 1 spectrum accent\)\. Adds one spectrum accent at hue \d+°, (the widest gap \(\d+°\) between your hues|a \d+° gap between your hues; the widest gap \(\d+°\) held no accent that kept separation); your 11 hue clusters already cover 5 categorical series\.$/
    );
    expect(spectrum.reason).toContain(`at hue ${Math.round(accent.hue)}°`);
    expect(spectrum.reason).toContain(
      accent.hueGap!.widest
        ? `the widest gap (${Math.round(accent.hueGap!.widthDegrees)}°) between your hues`
        : `a ${Math.round(accent.hueGap!.widthDegrees)}° gap between your hues; the widest gap (${Math.round(accent.hueGap!.widestWidthDegrees)}°)`
    );
    expectDistinctOfferedFamilySets(plan);
    for (const entry of plan.directions) expectSeparated(directionAnchors(plan, entry.direction));
  });

  it('fits optional accents in a fixed order: series first, then Spectrum’s minimum, then the pair, never structural accents', () => {
    const fit = fitColorSystemSecondaryAccentsV3;
    const untouched = { spectrumMinimum: 0, spectrumMinimumRemoved: 0 };
    expect(fit({ room: 0, base: 0, pair: 2, seriesGap: 4 })).toEqual({
      pair: 0,
      series: 0,
      seriesAccentsRemoved: 4,
      pairAccentsRemoved: 2,
      ...untouched,
    });
    // Spectrum is the only direction over the room: only series accents go.
    expect(fit({ room: 3, base: 0, pair: 2, seriesGap: 4 })).toEqual({
      pair: 2,
      series: 3,
      seriesAccentsRemoved: 1,
      pairAccentsRemoved: 0,
      ...untouched,
    });
    // Both over the room: the series accent goes first, then one of the pair.
    expect(fit({ room: 1, base: 0, pair: 2, seriesGap: 2 })).toEqual({
      pair: 1,
      series: 1,
      seriesAccentsRemoved: 1,
      pairAccentsRemoved: 1,
      ...untouched,
    });
    // Nothing over the room: nothing removed.
    expect(fit({ room: 6, base: 2, pair: 2, seriesGap: 4 })).toEqual({
      pair: 2,
      series: 4,
      seriesAccentsRemoved: 0,
      pairAccentsRemoved: 0,
      ...untouched,
    });
    // Series accents never fall below the structural base; the pair goes next.
    expect(fit({ room: 2, base: 2, pair: 2, seriesGap: 4 })).toEqual({
      pair: 0,
      series: 2,
      seriesAccentsRemoved: 2,
      pairAccentsRemoved: 2,
      ...untouched,
    });
    // Structural accents cannot be removed: the caller must state the count plainly.
    expect(fit({ room: 1, base: 2, pair: 0, seriesGap: 0 })).toBeNull();

    // p4-A: Spectrum's minimum accent. With room it stays and the pair shrinks around it.
    expect(fit({ room: 1, base: 0, pair: 2, seriesGap: 0, spectrumMinimum: 1 })).toEqual({
      pair: 1,
      series: 0,
      spectrumMinimum: 1,
      seriesAccentsRemoved: 0,
      pairAccentsRemoved: 1,
      spectrumMinimumRemoved: 0,
    });
    // With no room it is the accent removed, and the removal is counted as the minimum.
    expect(fit({ room: 0, base: 0, pair: 2, seriesGap: 0, spectrumMinimum: 1 })).toEqual({
      pair: 0,
      series: 0,
      spectrumMinimum: 0,
      seriesAccentsRemoved: 0,
      pairAccentsRemoved: 2,
      spectrumMinimumRemoved: 1,
    });
    // A series accent that also met the minimum is counted once, as a series accent.
    expect(fit({ room: 0, base: 0, pair: 2, seriesGap: 2, spectrumMinimum: 1 })).toEqual({
      pair: 0,
      series: 0,
      spectrumMinimum: 0,
      seriesAccentsRemoved: 2,
      pairAccentsRemoved: 2,
      spectrumMinimumRemoved: 0,
    });
    // A structural base above the minimum makes it moot: nothing is removed or counted.
    expect(fit({ room: 5, base: 2, pair: 2, seriesGap: 0, spectrumMinimum: 1 })).toEqual({
      pair: 2,
      series: 0,
      spectrumMinimum: 1,
      seriesAccentsRemoved: 0,
      pairAccentsRemoved: 0,
      spectrumMinimumRemoved: 0,
    });
  });

  it('reports the ceiling from the shared limits and leaves palettes under it unchanged', () => {
    const plan = planColorSystemSecondaryStrategiesV3(planInput(BRAND_B));
    expect(plan.familyLimit).toEqual({
      maximumFamilies: COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget,
      derivedCapacity: COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget - 1,
      seriesAccentsRemoved: 0,
      pairAccentsRemoved: 0,
      spectrumMinimumRemoved: 0,
      reservesDropped: 0,
    });
    expect(plan.familyCountByDirection).toEqual({
      'close-harmony': 6,
      'balanced-contrast': 8,
      'wide-spectrum': 7,
    });
    expect(plan.orphanTints).toEqual([]);
    expect(plan.measurement.observedTints).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ */
/* p4-A: every offered direction earns its name                              */
/* ------------------------------------------------------------------------ */

/**
 * Six owned hues spread round the wheel (six clusters, so five categorical series are
 * already covered) and no polarity binding: nothing forces an accent, which is the
 * case where Spectrum used to realize Derived's family set exactly.
 */
const SIX_HUES = [
  input('primary', 'Primary / Brand', 'primary', '#2563EB'),
  input('ember', 'Secondary / Ember', 'secondary', '#F9601F'),
  input('meadow', 'Secondary / Meadow', 'secondary', '#53AF65'),
  input('plum', 'Secondary / Plum', 'secondary', '#683964'),
  input('saffron', 'Secondary / Saffron', 'secondary', '#D8C65A'),
  input('teal', 'Secondary / Teal', 'secondary', '#00A8B7'),
  ...BLUE_ONLY.slice(1),
];

function sixHueInput(colors: readonly ColorSystemSecondaryMeasurementColorInputV3[] = SIX_HUES) {
  return planInput(colors, {
    polarityContributionIds: [],
    requiredJobs: ['categorical-data', 'product-graphics'],
  });
}

describe('secondary strategy v3: p4-A every offered direction earns its name', () => {
  it('gives Spectrum one accent in the widest hue gap when the clusters already cover the series, so it never repeats Derived', () => {
    const plan = planColorSystemSecondaryStrategiesV3(sixHueInput());
    expect(plan.existingHueClusterCount).toBe(6);
    expect(plan.reserves).toEqual([]);
    expect(plan.slotDerivation).toEqual({
      fromPolarity: 0,
      fromMinimumTarget: 0,
      fromSeries: 0,
      fromComplementaryPair: 2,
      fromSpectrumMinimum: 1,
    });
    expect(plan.familyLimit.spectrumMinimumRemoved).toBe(0);
    expect(plan.familyCountByDirection).toEqual({
      'close-harmony': 7,
      'balanced-contrast': 9,
      'wide-spectrum': 8,
    });
    expect(plan.offeredDirections).toEqual(['close-harmony', 'balanced-contrast', 'wide-spectrum']);
    expect(plan.omittedDirections).toEqual([]);
    expectDistinctOfferedFamilySets(plan);

    const spectrum = direction(plan, 'wide-spectrum');
    expect(spectrum.accents).toHaveLength(1);
    const [accent] = spectrum.accents;
    // The accent sits in the widest gap between the hues it had to keep clear of: all six
    // are owned hues (no reserve is planned), so the gap is computed here independently.
    const ownedHues = plan.families
      .filter(family => family.kind === 'hero' || family.kind === 'observed')
      .map(family => family.anchor.oklch.h);
    const widest = widestGap(ownedHues);
    expect(accent.hueGap).not.toBeNull();
    expect(accent.hueGap!.widest).toBe(true);
    expect(accent.hueGap!.widthDegrees).toBeCloseTo(widest.widthDegrees, 6);
    expect(accent.hueGap!.fromHue).toBeCloseTo(widest.fromHue, 6);
    expect(accent.hueGap!.toHue).toBeCloseTo(widest.toHue, 6);
    expect(accent.hueGap!.from).toEqual({ displayName: 'Secondary / Plum', kind: 'owned' });
    expect(accent.hueGap!.to).toEqual({ displayName: 'Secondary / Ember', kind: 'owned' });
    expect(hueWithinGap(accent.hue, accent.hueGap!)).toBe(true);
    // Max-min placement lands within one 5° search step of the gap's midpoint.
    expect(
      Math.abs(accent.minimumHueDistanceDegrees - widest.widthDegrees / 2)
    ).toBeLessThanOrEqual(5);
    expect(accent.minimumSeparationDeltaEOK).toBeGreaterThanOrEqual(
      COLOR_SYSTEM_SECONDARY_FAMILY_SEPARATION_DELTA_E_OK_V3
    );
    // The usual lightness rule for a mid hero: the first slot lifts by 0.12.
    expect(plan.measurement.heroLightnessClass).toBe('mid');
    expect(accent.lightnessShift).toBeCloseTo(0.12, 6);
    expect(spectrum.reason).toBe(
      'Spectrum: 8 families (6 existing hues, 1 neutral ramp, 1 spectrum accent). Adds one spectrum accent at hue 3°, the widest gap (70°) between your hues; your 6 hue clusters already cover 5 categorical series.'
    );
    expect(direction(plan, 'close-harmony').reason).toBe(
      'Derived: 7 families (6 existing hues, 1 neutral ramp). No new accent: every confirmed job is covered by your hues.'
    );
    expect(direction(plan, 'balanced-contrast').reason).toBe(
      'Complementary: 9 families (6 existing hues, 1 neutral ramp, 2 complementary accents). A complementary pair of 2 adds contrast.'
    );
    // Spectrum is Derived plus exactly that accent.
    const derivedSet = familySet(plan, 'close-harmony');
    const spectrumSet = familySet(plan, 'wide-spectrum');
    expect(spectrumSet).toHaveLength(derivedSet.length + 1);
    expect(derivedSet.every(hex => spectrumSet.includes(hex))).toBe(true);
    expect(spectrumSet.filter(hex => !derivedSet.includes(hex))).toEqual([accent.realizedHex]);
    for (const entry of plan.directions) expectSeparated(directionAnchors(plan, entry.direction));
  });

  it('is byte-deterministic and independent of input order with the minimum accent in play', () => {
    const first = planColorSystemSecondaryStrategiesV3(sixHueInput());
    const second = planColorSystemSecondaryStrategiesV3(sixHueInput());
    const reversed = planColorSystemSecondaryStrategiesV3(sixHueInput([...SIX_HUES].reverse()));
    expect(canonicalJson(second)).toBe(canonicalJson(first));
    expect(canonicalJson(reversed)).toBe(canonicalJson(first));
  });

  it('reports the minimum accent from the shared constant and keeps it out of the series accounting', () => {
    expect(COLOR_SYSTEM_SECONDARY_SPECTRUM_MINIMUM_ACCENT_COUNT_V3).toBe(1);
    const plan = planColorSystemSecondaryStrategiesV3(sixHueInput());
    expect(direction(plan, 'wide-spectrum').accentSlotCount).toBe(
      COLOR_SYSTEM_SECONDARY_SPECTRUM_MINIMUM_ACCENT_COUNT_V3
    );
    expect(plan.familyLimit.seriesAccentsRemoved).toBe(0);
    expect(plan.slotDerivation.fromSeries).toBe(0);
  });
});

describe('native sRGB strategy measurements', () => {
  const native = buildColorSystemSrgbValueV1({
    r: 37 / 255 + 0.0008,
    g: 99 / 255 + 0.0004,
    b: 235 / 255 - 0.0008,
  });
  const identity = { hueOffsetDegrees: 0, chromaScale: 1, lightnessShift: 0 };

  it('measures and plans owned native anchors from their actual components', () => {
    const colors = [{ ...BLUE_ONLY[0], valuesByMode: { Light: native } }, ...BLUE_ONLY.slice(1)];
    const measured = measureColorSystemSecondaryPaletteV3(colors);
    expect(measured.hero?.value).toEqual(native);
    expect(measured.hero?.oklch).toEqual(
      canonicalizeColorSystemSecondaryOklchV3(colorSystemSrgbToOklchV1(native))
    );
    expect(measured.hero?.oklch).not.toEqual(colorSystemSecondaryOklchFromHexV3(native.hex));
    const plan = planColorSystemSecondaryStrategiesV3(planInput(colors));
    const owned = plan.families.find(
      family => family.kind === 'hero' && family.anchor.stableColorId === 'primary'
    );
    expect(owned?.anchor.value).toEqual(native);
    expect(owned?.recipes).toHaveLength(3);
    expect(
      owned?.recipes.every(recipe => JSON.stringify(recipe.value) === JSON.stringify(native))
    ).toBe(true);
  });

  it('keeps identity transforms exact and derives other transforms from native measurements', () => {
    expect(realizeColorSystemSecondaryAnchorV3(native, identity, identity)).toEqual({
      requested: colorSystemSecondaryOklchFromValueV3(native),
      hex: native.hex,
      value: native,
      mapped: false,
    });
    const moved = realizeColorSystemSecondaryAnchorV3(native, identity, {
      ...identity,
      lightnessShift: 0.02,
    });
    expect(moved.requested.l).toBe(colorSystemSecondaryOklchFromValueV3(native).l + 0.02);
    expect(moved.requested.l).not.toBe(colorSystemSecondaryOklchFromHexV3(native.hex).l + 0.02);
    expect(moved.value).toBeUndefined();
  });

  it('distinguishes source identity and separation when display hexes are equal', () => {
    const byte = value(native.hex);
    expect(colorSystemSecondaryColorIdentityV3(native)).not.toBe(
      colorSystemSecondaryColorIdentityV3(byte)
    );
    expect(colorSystemSecondaryDeltaEOKV3(native, byte)).toBeGreaterThan(0);
    expect(classifyColorSystemSecondaryFamilyAnchorV3(native, byte)).toBe('accent');
    const reading = readColorSystemSecondaryFamilyV3({
      displayName: 'Native',
      anchorHex: native.hex,
      anchorValue: native,
      sourceHex: byte.hex,
      sourceValue: byte,
      sourceDisplayName: 'Byte',
      heroOklch: null,
      otherAnchorHexes: [byte.hex],
      otherAnchorValues: [byte],
    });
    expect(reading.anchor).toEqual(colorSystemSecondaryOklchFromValueV3(native));
    expect(reading.minimumSeparationDeltaEOK).toBe(colorSystemSecondaryDeltaEOKV3(native, byte));
  });
});
