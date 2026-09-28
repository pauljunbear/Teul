import { describe, expect, it } from 'vitest';
import { generateColorScale } from '../colorScale';
import { canonicalNumber } from '../colorSystemHashing';
import { buildColorSystemSrgbValueV1, colorSystemSrgbToOklchV1 } from '../colorSystemSrgbValueV1';
import {
  COLOR_SYSTEM_PALETTE_ANALYSIS_V3_NATIVE_VERSION,
  COLOR_SYSTEM_PALETTE_ANALYSIS_V3_VERSION,
  ColorSystemPaletteAnalysisV3Error,
  PALETTE_ACHROMATIC_CHROMA_FLOOR_V3,
  PALETTE_HERO_MINIMUM_CHROMA_V3,
  PALETTE_HUE_SECTORS_V3,
  PALETTE_LADDER_ANCHOR_V3,
  PALETTE_LADDER_LIGHTNESS_TARGETS_V3,
  PALETTE_NEAR_DUPLICATE_DELTA_E_OK_V3,
  PALETTE_NEUTRAL_MAX_CHROMA_V3,
  analyzeColorSystemPaletteV3,
  paletteDivergingClaimV3,
  paletteGroundClaimV3,
  paletteHueDistanceV3,
  paletteHueFamilyV3,
  paletteLadderStepV3,
  paletteNumericPathV3,
  paletteOrderClaimV3,
  paletteTextClaimV3,
  type ColorSystemPaletteAnalysisV3,
  type PaletteAnalysisColorInputV3,
  type PaletteHueFamilyV3,
} from '../colorSystemPaletteAnalysisV3';
import { hexToOklch } from '../utils';

function entry(
  id: string,
  name: string,
  hex: string,
  extra: Partial<PaletteAnalysisColorInputV3> = {}
): PaletteAnalysisColorInputV3 {
  return { id, name, hex, alpha: 1, kind: 'variable', ...extra };
}

function color(analysis: ColorSystemPaletteAnalysisV3, id: string, mode: string | null = null) {
  const found = analysis.colors.find(item => item.id === id && item.mode === mode);
  if (!found) throw new Error(`Missing analyzed color ${id}.`);
  return found;
}

/** Deterministic shuffle so the permutation test never depends on Math.random. */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  let state = 0x2545_f491;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1_103_515_245 + 12_345) >>> 0;
    const swap = state % (index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

const SINGLE_PRIMARY = [
  entry('primary', 'Primary', '#3B82F6'),
  entry('black', 'Black', '#000000'),
  entry('white', 'White', '#FFFFFF'),
];

const WARM_BRAND = [
  entry('brand-terracotta', 'Brand/Terracotta', '#C2410C'),
  entry('brand-olive', 'Brand/Olive', '#4D7C0F'),
  entry('brand-navy', 'Brand/Navy', '#1E3A8A'),
  entry('legacy-terracotta', 'Legacy/Terracotta', '#C2410C'),
  entry('surface-light', 'Surface/Light', '#F5EFE6'),
  entry('surface-dark', 'Surface/Dark', '#2B2622'),
];

const NAVY_LOW_CHROMA = [
  entry('navy', 'Navy', '#1F2A44'),
  entry('slate', 'Slate', '#0F172A'),
  entry('cool-light', 'Cool Light', '#E5E7EB'),
  entry('cool-dark', 'Cool Dark', '#212529'),
];

const NUMERIC = [
  entry('blue-300', 'Blue/300', '#93C5FD'),
  entry('blue-500', 'Blue/500', '#3B82F6'),
  entry('blue-700', 'Blue/700', '#1D4ED8'),
  entry('gray-50', 'Gray/50', '#F5EFE6'),
  entry('gray-500', 'Gray/500', '#FAFAFA'),
  entry('gray-900', 'Gray/900', '#2B2622'),
  entry('red-300', 'Red/300', '#FCA5A5'),
  entry('red-500-a', 'Red/500', '#DC2626'),
  entry('red-500-b', 'Red/500', '#EF4444'),
];

const SRGB_SPOKES: readonly [string, PaletteHueFamilyV3][] = [
  ['#FF0000', 'red'],
  ['#FF8000', 'orange'],
  ['#FFFF00', 'yellow'],
  ['#80FF00', 'lime'],
  ['#00FF00', 'green'],
  ['#00FF80', 'green'],
  ['#00FFFF', 'cyan'],
  ['#0080FF', 'blue'],
  ['#0000FF', 'blue'],
  ['#8000FF', 'violet'],
  ['#FF00FF', 'magenta'],
  ['#FF0080', 'rose'],
];

describe('colorSystemPaletteAnalysisV3', () => {
  it('measures native channels and binds their exact identity even when display hex agrees', () => {
    const value = buildColorSystemSrgbValueV1({
      r: 0.123456789012341,
      g: 0.5,
      b: 0.75,
    });
    const input = entry('native', 'Native color', value.hex, { value });
    const analysis = analyzeColorSystemPaletteV3([input]);
    const measured = color(analysis, 'native');
    const expected = colorSystemSrgbToOklchV1(value);
    expect(analysis.analysisVersion).toBe(COLOR_SYSTEM_PALETTE_ANALYSIS_V3_NATIVE_VERSION);
    expect(measured.value).toEqual(value);
    expect(measured.oklch).toEqual({
      l: canonicalNumber(expected.l),
      c: canonicalNumber(expected.c),
      h: canonicalNumber(expected.h),
    });
    expect(measured.oklch).not.toEqual(
      color(analyzeColorSystemPaletteV3([entry('native', 'Native color', value.hex)]), 'native')
        .oklch
    );
    const changed = buildColorSystemSrgbValueV1({ ...value.components, r: 0.123456789012342 });
    expect(changed.hex).toBe(value.hex);
    expect(analyzeColorSystemPaletteV3([{ ...input, value: changed }]).analysisHash).not.toBe(
      analysis.analysisHash
    );
  });

  it('retains byte analysis output when an exact byte value is supplied', () => {
    const value = buildColorSystemSrgbValueV1({ r: 51 / 255, g: 102 / 255, b: 204 / 255 });
    const input = entry('byte', 'Byte color', value.hex);
    expect(analyzeColorSystemPaletteV3([{ ...input, value }])).toEqual(
      analyzeColorSystemPaletteV3([input])
    );
  });

  it('keeps distinct native mode values when they share a display hex', () => {
    const light = buildColorSystemSrgbValueV1({ r: 0.5001, g: 0.5001, b: 0.5001 });
    const dark = buildColorSystemSrgbValueV1({ r: 0.50001, g: 0.50001, b: 0.50001 });
    expect(light.hex).toBe(dark.hex);
    const analysis = analyzeColorSystemPaletteV3([
      entry('neutral', 'Neutral', light.hex, { mode: 'Light', value: light }),
      entry('neutral', 'Neutral', dark.hex, { mode: 'Dark', value: dark }),
    ]);
    expect(analysis.existingPairs).toEqual([
      {
        baseName: 'neutral',
        kind: 'mode',
        light: { id: 'neutral', mode: 'Light' },
        dark: { id: 'neutral', mode: 'Dark' },
      },
    ]);
    expect(analysis.faults.some(fault => fault.code === 'neutral-pair-missing')).toBe(false);
  });

  it('rejects native values that disagree with the displayed input or omit their identity', () => {
    const value = buildColorSystemSrgbValueV1({ r: 0.2 + 1e-15, g: 0.4, b: 0.8 });
    const input = entry('native', 'Native color', value.hex, { value });
    expect(() => analyzeColorSystemPaletteV3([{ ...input, hex: '#FFFFFF' }])).toThrow(
      ColorSystemPaletteAnalysisV3Error
    );
    expect(() => analyzeColorSystemPaletteV3([{ ...input, alpha: 0.5 }])).toThrow(
      ColorSystemPaletteAnalysisV3Error
    );
    const { representation: _representation, ...stripped } = value;
    expect(() => analyzeColorSystemPaletteV3([{ ...input, value: stripped }])).toThrow(
      ColorSystemPaletteAnalysisV3Error
    );
  });

  it('measures a saturated primary with black and white anchors', () => {
    const analysis = analyzeColorSystemPaletteV3(SINGLE_PRIMARY);
    expect(analysis.analysisVersion).toBe(COLOR_SYSTEM_PALETTE_ANALYSIS_V3_VERSION);
    expect(analysis.colors.map(item => item.id)).toEqual(['black', 'primary', 'white']);
    expect(analysis.hero).toEqual({ id: 'primary', mode: null });
    expect(analysis.chromaticCount).toBe(1);
    expect(analysis.neutralCount).toBe(2);
    expect(analysis.neutralTemperature).toBe('neutral');
    expect(analysis.existingPairs).toEqual([]);
    expect(analysis.nearDuplicates).toEqual([]);
    expect(analysis.unevenScales).toEqual([]);
    expect(analysis.architecture).toEqual({ hero: true, core: 1, extended: 2 });
    expect(analysis.faults).toEqual([]);
    expect(analysis.analysisHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const white = color(analysis, 'white');
    expect(white.hex).toBe('#ffffff');
    expect(white.opaque).toBe(true);
    expect(white.oklch.l).toBeCloseTo(1, 6);
    expect(white.oklch.c).toBeLessThan(PALETTE_ACHROMATIC_CHROMA_FLOOR_V3);
    expect(white.oklch.h).toBe(0);
    expect(white).toMatchObject({
      isNeutral: true,
      achromatic: true,
      temperature: 'neutral',
      ladderStep: 1,
      hueFamily: null,
      numericPath: null,
      semanticClaim: null,
      semanticClaimTerms: [],
    });
    const black = color(analysis, 'black');
    expect(black.oklch).toEqual({ l: 0, c: 0, h: 0 });
    expect(black.ladderStep).toBe(12);
    const primary = color(analysis, 'primary');
    expect(primary.isNeutral).toBe(false);
    expect(primary.temperature).toBeNull();
    expect(primary.hueFamily).toBe('blue');
    expect(primary.ladderStep).toBe(9);
    expect(primary.oklch.c).toBeGreaterThanOrEqual(PALETTE_HERO_MINIMUM_CHROMA_V3);
  });

  it('classifies warm cream neutrals, suffix pairs, near duplicates, and core vocabulary', () => {
    const analysis = analyzeColorSystemPaletteV3(WARM_BRAND);
    const cream = color(analysis, 'surface-light');
    const ink = color(analysis, 'surface-dark');
    for (const neutral of [cream, ink]) {
      expect(neutral.isNeutral).toBe(true);
      expect(neutral.achromatic).toBe(false);
      expect(neutral.temperature).toBe('warm');
      expect(neutral.oklch.c).toBeLessThan(PALETTE_NEUTRAL_MAX_CHROMA_V3);
      expect(neutral.oklch.h).toBeGreaterThanOrEqual(20);
      expect(neutral.oklch.h).toBeLessThanOrEqual(110);
    }
    expect(cream.ladderStep).toBeLessThanOrEqual(2);
    expect(ink.ladderStep).toBeGreaterThanOrEqual(11);
    expect(analysis.neutralTemperature).toBe('warm');
    expect(analysis.neutralCount).toBe(2);
    expect(analysis.chromaticCount).toBe(4);
    expect(color(analysis, 'brand-navy').hueFamily).toBe('blue');

    // Identical values tie on chroma, so the hero resolves by name.
    expect(analysis.hero).toEqual({ id: 'brand-terracotta', mode: null });
    expect(analysis.nearDuplicates).toEqual([
      {
        first: { id: 'brand-terracotta', mode: null },
        second: { id: 'legacy-terracotta', mode: null },
        deltaEOk: 0,
      },
    ]);
    expect(analysis.existingPairs).toEqual([
      {
        baseName: 'surface',
        kind: 'suffix',
        light: { id: 'surface-light', mode: null },
        dark: { id: 'surface-dark', mode: null },
      },
    ]);
    expect(analysis.architecture).toEqual({ hero: true, core: 3, extended: 3 });
    expect(analysis.faults.map(fault => fault.code)).toEqual(['near-duplicate']);
    expect(analysis.faults[0].refs).toEqual([
      { id: 'brand-terracotta', mode: null },
      { id: 'legacy-terracotta', mode: null },
    ]);
    expect(analysis.faults[0].message).toContain(String(PALETTE_NEAR_DUPLICATE_DELTA_E_OK_V3));
  });

  it('accepts a low-chroma navy hero and keeps the 0.03–0.04 band neither neutral nor hero', () => {
    const analysis = analyzeColorSystemPaletteV3(NAVY_LOW_CHROMA);
    const navy = color(analysis, 'navy');
    const slate = color(analysis, 'slate');
    expect(navy.oklch.c).toBeGreaterThanOrEqual(PALETTE_HERO_MINIMUM_CHROMA_V3);
    expect(analysis.hero).toEqual({ id: 'navy', mode: null });
    expect(slate.isNeutral).toBe(false);
    expect(slate.oklch.c).toBeGreaterThanOrEqual(PALETTE_NEUTRAL_MAX_CHROMA_V3);
    expect(slate.oklch.c).toBeLessThan(PALETTE_HERO_MINIMUM_CHROMA_V3);
    expect(analysis.chromaticCount).toBe(2);
    expect(analysis.neutralCount).toBe(2);
    for (const id of ['cool-light', 'cool-dark']) {
      const neutral = color(analysis, id);
      expect(neutral.isNeutral).toBe(true);
      expect(neutral.temperature).toBe('cool');
      expect(neutral.oklch.h).toBeGreaterThanOrEqual(200);
      expect(neutral.oklch.h).toBeLessThanOrEqual(300);
    }
    expect(analysis.neutralTemperature).toBe('cool');
    expect(analysis.faults).toEqual([]);
  });

  it('parses numeric paths and flags uneven and duplicated scale steps', () => {
    const analysis = analyzeColorSystemPaletteV3(NUMERIC);
    expect(color(analysis, 'blue-300').numericPath).toEqual({ scaleName: 'blue', step: 300 });
    expect(paletteNumericPathV3('gray-900')).toEqual({ scaleName: 'gray', step: 900 });
    expect(paletteNumericPathV3('primary.9')).toEqual({ scaleName: 'primary', step: 9 });
    expect(paletteNumericPathV3('blue500')).toEqual({ scaleName: 'blue', step: 500 });
    expect(paletteNumericPathV3('Chart / Series 1')).toEqual({
      scaleName: 'chart/series',
      step: 1,
    });
    expect(paletteNumericPathV3('500')).toBeNull();
    expect(paletteNumericPathV3('#F5EFE6')).toBeNull();
    expect(paletteNumericPathV3('Brand/Orange')).toBeNull();

    const blues = ['blue-300', 'blue-500', 'blue-700'].map(id => color(analysis, id).oklch.l);
    expect(blues[0]).toBeGreaterThan(blues[1]);
    expect(blues[1]).toBeGreaterThan(blues[2]);
    expect(analysis.unevenScales).toEqual([
      {
        scaleName: 'gray',
        mode: null,
        steps: [50, 500, 900],
        lightness: ['gray-50', 'gray-500', 'gray-900'].map(id => color(analysis, id).oklch.l),
        refs: [
          { id: 'gray-50', mode: null },
          { id: 'gray-500', mode: null },
          { id: 'gray-900', mode: null },
        ],
      },
    ]);
    expect(analysis.unevenScales[0].lightness[1]).toBeGreaterThan(
      analysis.unevenScales[0].lightness[0]
    );
    const codes = analysis.faults.map(fault => fault.code);
    expect(codes).toContain('uneven-scale');
    expect(codes).toContain('duplicate-scale-step');
    const duplicate = analysis.faults.find(fault => fault.code === 'duplicate-scale-step');
    expect(duplicate?.refs.map(ref => ref.id)).toEqual(['red-300', 'red-500-a', 'red-500-b']);
    expect(analysis.unevenScales.some(scale => scale.scaleName === 'red')).toBe(false);
  });

  it('detects status claims and mode pairs while keeping same-source modes out of duplicates', () => {
    const analysis = analyzeColorSystemPaletteV3([
      entry('surface', 'Surface/Background', '#FFFFFF', { mode: 'Light' }),
      entry('surface', 'Surface/Background', '#0B0B0B', { mode: 'Dark' }),
      entry('flat', 'Flat', '#FFFFFF', { mode: 'Light' }),
      entry('flat', 'Flat', '#FFFFFF', { mode: 'Dark' }),
      entry('error', 'Status/Error', '#DC2626'),
      entry('danger-link', 'Danger Link', '#B91C1C'),
      entry('info', 'Information/Banner', '#0EA5E9'),
    ]);
    expect(color(analysis, 'error')).toMatchObject({
      semanticClaim: 'error',
      semanticClaimTerms: ['error'],
    });
    expect(color(analysis, 'danger-link')).toMatchObject({
      semanticClaim: 'error',
      semanticClaimTerms: ['danger', 'link'],
    });
    expect(color(analysis, 'info').semanticClaim).toBe('info');
    expect(analysis.existingPairs).toEqual([
      {
        baseName: 'surface/background',
        kind: 'mode',
        light: { id: 'surface', mode: 'Light' },
        dark: { id: 'surface', mode: 'Dark' },
      },
    ]);
    // `flat` is identical across modes, so it is one color, not a pair, and its
    // two entries are never reported as duplicates of each other.
    expect(analysis.nearDuplicates.every(pair => pair.first.id !== pair.second.id)).toBe(true);
    expect(analysis.nearDuplicates).toContainEqual({
      first: { id: 'flat', mode: 'Dark' },
      second: { id: 'surface', mode: 'Light' },
      deltaEOk: 0,
    });
  });

  it('reports a missing hero and missing neutral pair when nothing opaque is chromatic', () => {
    const analysis = analyzeColorSystemPaletteV3([
      entry('accent', 'Accent', '#FF0000', { alpha: 0.5 }),
      entry('black', 'Black', '#000000'),
    ]);
    expect(analysis.hero).toBeNull();
    expect(analysis.architecture.hero).toBe(false);
    expect(analysis.faults.map(fault => fault.code)).toEqual([
      'neutral-pair-missing',
      'no-chromatic-hero',
    ]);
    const polarity = analyzeColorSystemPaletteV3([
      entry('a', 'A', '#111111'),
      entry('b', 'B', '#222222'),
      entry('c', 'C', '#FF0000'),
    ]);
    expect(polarity.faults.map(fault => fault.code)).toEqual(['neutral-polarity-missing']);
  });

  it('places the twelve sRGB spokes in their named hue sectors', () => {
    expect(PALETTE_HUE_SECTORS_V3).toHaveLength(12);
    expect(new Set(PALETTE_HUE_SECTORS_V3.map(sector => sector.family)).size).toBe(12);
    for (const [hex, family] of SRGB_SPOKES) {
      const oklch = hexToOklch(hex);
      expect(paletteHueFamilyV3(oklch.h, oklch.c)).toBe(family);
    }
    expect(paletteHueFamilyV3(90, 0)).toBeNull();
    expect(paletteHueDistanceV3(350, 10)).toBe(20);
    expect(paletteHueDistanceV3(10, 190)).toBe(180);
  });

  it('re-states the colorScale light-mode ladder exactly at the Radix gray anchor', () => {
    expect(PALETTE_LADDER_ANCHOR_V3.hex).toBe('#8d8d8d');
    const scale = generateColorScale(PALETTE_LADDER_ANCHOR_V3.hex, 'light');
    expect(PALETTE_LADDER_LIGHTNESS_TARGETS_V3).toHaveLength(12);
    scale.steps.forEach((step, index) => {
      expect(PALETTE_LADDER_LIGHTNESS_TARGETS_V3[index]).toBeCloseTo(step.requestedOklch.l, 12);
    });
    for (let index = 1; index < 12; index += 1) {
      expect(PALETTE_LADDER_LIGHTNESS_TARGETS_V3[index]).toBeLessThan(
        PALETTE_LADDER_LIGHTNESS_TARGETS_V3[index - 1]
      );
    }
    expect(paletteLadderStepV3(1)).toBe(1);
    expect(paletteLadderStepV3(0)).toBe(12);
    expect(paletteLadderStepV3(PALETTE_LADDER_LIGHTNESS_TARGETS_V3[8])).toBe(9);
  });

  it('is deterministic for repeated and permuted input', () => {
    for (const palette of [SINGLE_PRIMARY, WARM_BRAND, NAVY_LOW_CHROMA, NUMERIC]) {
      const first = analyzeColorSystemPaletteV3(palette);
      const second = analyzeColorSystemPaletteV3(palette);
      const permuted = analyzeColorSystemPaletteV3(shuffled(palette));
      expect(second).toEqual(first);
      expect(permuted).toEqual(first);
      expect(permuted.analysisHash).toBe(first.analysisHash);
      expect(JSON.stringify(permuted)).toBe(JSON.stringify(first));
    }
  });

  it('fails closed on malformed entries and duplicate identities', () => {
    const invalid: unknown[] = [
      [entry('a', 'A', '#GGGGGG')],
      [entry('a', 'A', '#fff')],
      [entry('a', 'A', '#FFFFFF', { alpha: 1.2 })],
      [entry('a', 'A', '#FFFFFF', { alpha: Number.NaN })],
      [entry('', 'A', '#FFFFFF')],
      [{ ...entry('a', 'A', '#FFFFFF'), kind: 'gradient' }],
      [entry('a', 'A', '#FFFFFF'), entry('a', 'B', '#000000')],
      [
        entry('a', 'A', '#FFFFFF', { mode: 'Light' }),
        entry('a', 'A', '#000000', { mode: 'Light' }),
      ],
      'not an array',
    ];
    for (const input of invalid) {
      expect(() =>
        analyzeColorSystemPaletteV3(input as readonly PaletteAnalysisColorInputV3[])
      ).toThrow(ColorSystemPaletteAnalysisV3Error);
    }
    expect(() => analyzeColorSystemPaletteV3([])).not.toThrow();
    expect(analyzeColorSystemPaletteV3([]).neutralTemperature).toBeNull();
  });

  // p3-I: what a recorded name claims — a ground, a text job, an order, a diverging polarity.
  it('reads ground claims by whole token: named grounds first, plain white or black by the last token', () => {
    expect(paletteGroundClaimV3('Primary / Surface Gray')).toEqual({
      term: 'surface',
      kind: 'named-ground',
    });
    expect(paletteGroundClaimV3('Surface Black')).toEqual({
      term: 'surface',
      kind: 'named-ground',
    });
    expect(paletteGroundClaimV3('Text / Surface')).toEqual({
      term: 'surface',
      kind: 'named-ground',
    });
    expect(paletteGroundClaimV3('Background/Default')).toEqual({
      term: 'background',
      kind: 'named-ground',
    });
    expect(paletteGroundClaimV3('Paper')).toEqual({ term: 'paper', kind: 'named-ground' });
    expect(paletteGroundClaimV3('Canvas Warm')).toEqual({ term: 'canvas', kind: 'named-ground' });
    expect(paletteGroundClaimV3('Page')).toEqual({ term: 'page', kind: 'named-ground' });
    expect(paletteGroundClaimV3('Sheet 2')).toEqual({ term: 'sheet', kind: 'named-ground' });
    expect(paletteGroundClaimV3('Primary / White')).toEqual({
      term: 'white',
      kind: 'plain-extreme',
    });
    expect(paletteGroundClaimV3('Black')).toEqual({ term: 'black', kind: 'plain-extreme' });
    expect(paletteGroundClaimV3('Alpha White')).toEqual({ term: 'white', kind: 'plain-extreme' });
    // “Foreground” contains “ground” as a substring but is not the ground token; “Black
    // Coffee” ends in “coffee”; a gray step claims nothing.
    expect(paletteGroundClaimV3('Foreground')).toBeNull();
    expect(paletteGroundClaimV3('Black Coffee')).toBeNull();
    expect(paletteGroundClaimV3('Typography / Gray 3')).toBeNull();
    expect(paletteGroundClaimV3('')).toBeNull();
  });

  it('reads text claims with the most specific term and treats a bare typography prefix as the weakest', () => {
    expect(paletteTextClaimV3('Primary Text')).toEqual({
      term: 'primary text',
      kind: 'named-text',
    });
    expect(paletteTextClaimV3('Typography / Ink')).toEqual({ term: 'ink', kind: 'named-text' });
    expect(paletteTextClaimV3('Text / Ink')).toEqual({ term: 'ink', kind: 'named-text' });
    expect(paletteTextClaimV3('Body Text')).toEqual({ term: 'text', kind: 'named-text' });
    expect(paletteTextClaimV3('Typography / Gray 3')).toEqual({
      term: 'typography',
      kind: 'section-prefix',
    });
    expect(paletteTextClaimV3('Typography / Primary Reverse')).toEqual({
      term: 'typography',
      kind: 'section-prefix',
    });
    expect(paletteTextClaimV3('Primary / Surface Gray')).toBeNull();
    expect(paletteTextClaimV3('Texture')).toBeNull();
  });

  it('reads a recorded order from the first one- or two-digit token after a word, never from a scale step', () => {
    expect(paletteOrderClaimV3('Data Viz / 01 Sky')).toBe(1);
    expect(paletteOrderClaimV3('Data Viz / 11 Rust')).toBe(11);
    expect(paletteOrderClaimV3('Chart / Series 3')).toBe(3);
    expect(paletteOrderClaimV3('Categorical 2')).toBe(2);
    expect(paletteOrderClaimV3('Blue/500')).toBeNull();
    expect(paletteOrderClaimV3('gray-900')).toBeNull();
    expect(paletteOrderClaimV3('01 Sky')).toBeNull();
    expect(paletteOrderClaimV3('Sky')).toBeNull();
  });

  it('reads the diverging polarity a name claims and refuses an ambiguous one', () => {
    expect(paletteDivergingClaimV3('Data Viz / 07 Green')).toBe('positive');
    expect(paletteDivergingClaimV3('Chart / Success')).toBe('positive');
    expect(paletteDivergingClaimV3('Positive Change')).toBe('positive');
    expect(paletteDivergingClaimV3('Data Viz / 10 Blaze')).toBe('negative');
    expect(paletteDivergingClaimV3('Series / Red')).toBe('negative');
    expect(paletteDivergingClaimV3('Negative')).toBe('negative');
    expect(paletteDivergingClaimV3('Error Emphasis')).toBe('negative');
    expect(paletteDivergingClaimV3('Red Green')).toBeNull();
    expect(paletteDivergingClaimV3('Sky')).toBeNull();
  });

  it('carries every claim on the analyzed colors and folds them into the analysis hash', () => {
    const named = analyzeColorSystemPaletteV3([
      entry('surface', 'Primary / Surface Gray', '#F4F2ED'),
      entry('ink', 'Typography / Ink', '#0F0E0C'),
      entry('chart', 'Data Viz / 02 Ember', '#D4552E'),
    ]);
    expect(color(named, 'surface').groundClaim).toEqual({ term: 'surface', kind: 'named-ground' });
    expect(color(named, 'surface').textClaim).toBeNull();
    expect(color(named, 'ink').textClaim).toEqual({ term: 'ink', kind: 'named-text' });
    expect(color(named, 'chart').orderClaim).toBe(2);
    expect(color(named, 'chart').groundClaim).toBeNull();
    const renamed = analyzeColorSystemPaletteV3([
      entry('surface', 'Primary / Gray 1', '#F4F2ED'),
      entry('ink', 'Typography / Ink', '#0F0E0C'),
      entry('chart', 'Data Viz / 02 Ember', '#D4552E'),
    ]);
    expect(color(renamed, 'surface').groundClaim).toBeNull();
    expect(renamed.analysisHash).not.toBe(named.analysisHash);
  });
});
