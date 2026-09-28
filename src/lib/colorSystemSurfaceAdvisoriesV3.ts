/**
 * Brand-surface model and print / out-of-home advisories (v3).
 *
 * The color builder previously carried no notion of where a color will live:
 * "marketing-accent" was a label with no logic, and print, CMYK and
 * out-of-home appeared nowhere. This module names four surfaces, maps builder
 * jobs onto them, and produces advisories a designer can act on before a color
 * goes to a printer or onto a board.
 *
 * It is a pure, deterministic module: no Figma access, no clock, no
 * randomness, no hashing. Wiring into the UI happens elsewhere.
 *
 * What it claims:
 * - a surface set per job (a Teul policy default, see SURFACES_BY_JOB_V3);
 * - an unprofiled sRGB → CMYK estimate, always labelled as such;
 * - total ink coverage against an ECI-published limit, naming the press
 *   condition it assumes;
 * - saturation and pale-tint warnings on Teul-declared OKLCH thresholds;
 * - WCAG 2.2 contrast for out-of-home text against a Teul-declared floor;
 * - the OAAA letter-height table by viewing distance;
 * - hero-color discipline on product screens: the primary bound to a large
 *   fill, or carrying more roles than its declared share (Teul policy default);
 * - the proportion rule Teul honours, declared with the sources it compared
 *   rather than applied silently (Teul policy default).
 *
 * What it refuses to claim:
 * - any spot-color name or number. Spot references are licensed data; the
 *   module only carries an owner-supplied field and says so;
 * - a profiled CMYK conversion. The estimate is orientation only and is never
 *   called a build;
 * - that any color is inside or outside a press gamut.
 *
 * Every numeric constant below cites either a URL fetched on 2026-09-07 or is
 * labelled a Teul policy default. See docs/SURFACE_ADVISORIES_V3.md.
 */

import { getWCAGContrastHex } from './accessibility';
import { COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2 } from './colorSystemApplicationVocabularyV2';
import type { ColorSystemJobV2 } from './colorSystemBuilderV2Contracts';
import { compareText, hexToOklch, hexToRgb } from './utils';

export const COLOR_SYSTEM_SURFACE_ADVISORIES_V3_SCHEMA_VERSION =
  'teul-color-system-surface-advisories/v3' as const;

// ============================================
// Surfaces
// ============================================

export const COLOR_SYSTEM_SURFACES_V3 = [
  'screen-product',
  'screen-marketing',
  'print',
  'out-of-home',
] as const;

export type ColorSystemSurfaceV3 = (typeof COLOR_SYSTEM_SURFACES_V3)[number];

/** The only citation allowed for a constant that has no fetched source. */
export const TEUL_POLICY_DEFAULT_CITATION = 'Teul policy default' as const;

// ============================================
// Sources (every URL below was fetched on the stated date)
// ============================================

export type SurfaceAdvisorySourceV3 = {
  readonly publisher: string;
  readonly title: string;
  /** URL fetched by the Teul maintainers on `fetchedOn`. */
  readonly citation: `https://${string}`;
  readonly fetchedOn: string;
  /** Verbatim quotes, whitespace normalized, with where they sit in the source. */
  readonly quotes: readonly { readonly text: string; readonly location: string }[];
};

export const SURFACE_ADVISORY_SOURCES_V3 = {
  'eci-offset-standards': {
    publisher: 'European Color Initiative (ECI)',
    title: 'Colour standards — offset (ECI offset profiles)',
    citation: 'https://eci.org/doku.php?id=en:colorstandards:offset',
    fetchedOn: '2026-09-07',
    quotes: [
      {
        text: 'ECI, bvdm and FOGRA jointly recommend the use of “ISO Coated v2 (ECI)” and “ISO Coated v2 300% (ECI)”. The latter is a version with lower maximum ink coverage (300%) suitable for e.g. heat set web offset. Both profiles are based on “FOGRA39L”.',
        location: 'Section “Which new profiles are available?”',
      },
      {
        text: 'The ECI offset profile “ISO Coated v2 300% (ECI)” is a good choice in cases where the intended printing condition is not yet known. The advantage of the version of the coated profile with a maximum total ink coverage of 300% is it‘s higher flexibility regarding the use for sheetfed and web offset printing.',
        location:
          'Paragraph beginning “In general, the ECI, bvdm, and Fogra recommend using the ICC profile which matches the intended printing condition”',
      },
      {
        text: 'Practice-oriented reduction of the maximum ink coverage: Reducing the maximum ink coverage from 350% to 330%, or 300% respectively (setup value in profiling software), reflects the practical need of many printers, to avoid printing problems caused by too high ink coverage.',
        location:
          'List “Substantial improvements of the new ECI offset profiles”, describing the FOGRA39-based “ISO Coated v2 (ECI)” and “ISO Coated v2 300% (ECI)” pair',
      },
      {
        text: 'For the paper types 1+2 for offset printing on gloss and matt coated paper, the CIELAB values measured in daily production comply with the aim values (FOGRA39, “ISO Coated v2”).',
        location: 'Paragraph on process control for proofing and production printing',
      },
      {
        text: 'FOGRA51 – PSO Coated v3 – Premium coated paper (ISO 12647-2:2013 PC 1); FOGRA52 – PSO Uncoated v3 (FOGRA52) – wood-free uncoated white paper (ISO 12647-2:2013 PC 5)',
        location: 'List pairing the newer Fogra characterization data with the PSO v3 profiles',
      },
    ],
  },
  'xrite-extended-gamut': {
    publisher: 'X-Rite',
    title: 'Blog post at the cited URL (Pantone Extended Gamut guide for printers)',
    citation: 'https://www.xrite.com/blog/pantone-extended-gamut-guide-helps-printers',
    fetchedOn: '2026-09-07',
    quotes: [
      {
        text: 'it provides a very limited gamut and can only hit about half of PANTONE MATCHING SYSTEM® Colors',
        location: 'Paragraph on conventional four-color (CMYK) process printing',
      },
      {
        text: 'you can expect to achieve a good visual match for approximately 90% of all spot colors without color mixing',
        location: 'Paragraph on Extended Gamut (CMYK plus orange, green and violet)',
      },
    ],
  },
  'oaaa-ooh-creative-best-practices': {
    publisher: 'OAAA',
    title: 'OOH Creative Best Practices (PDF, spreads edition)',
    citation:
      'https://oaaa.org/wp-content/uploads/2022/09/OAAA-Best-Practices-oct20-2021-spreads_2_.pdf',
    fetchedOn: '2026-09-07',
    quotes: [
      {
        text: 'What colors contrast best with OOH? Same colors that contrast in the everyday world',
        location: 'PDF page 13 of the spreads file (printed folio 24), “Contrast — Color”',
      },
      {
        text: 'Side note, when designing for digital, and using an all white background, it’s good practice to make the white a 10% black',
        location: 'PDF page 13 of the spreads file (printed folio 24), “Contrast — Color”',
      },
      {
        text: 'Be sure to make typeface legible from a far distance if it will be viewed from father away',
        location: 'PDF page 13 of the spreads file (printed folio 24), “Typeface” (sic)',
      },
      {
        text: 'Generally, font point sizes are more easily read at the following scales:',
        location:
          'PDF page 14 of the spreads file (printed folio 26), “Font Size”, introducing the DISTANCE / MEDIA TYPE / FONT SIZE table carried in OAAA_FONT_SIZE_TABLE_V3',
      },
    ],
  },
  'lamar-design-tips': {
    publisher: 'Lamar Advertising Company',
    title: 'Design Tips',
    citation: 'https://lamar.com/en/advertising-resources/design-tips',
    fetchedOn: '2026-09-07',
    quotes: [
      {
        text: 'Research demonstrates that high-color contrast can improve outdoor advertising recall by 38%.',
        location: 'Design Tips page, contrast guidance',
      },
      {
        text: 'Words with both upper and lower case characters are generally easier to read than all uppercase.',
        location: 'Design Tips page, typography guidance',
      },
      {
        text: 'Adequate spacing between letters, words and lines will enhance visibility.',
        location: 'Design Tips page, typography guidance',
      },
      {
        text: 'Say it loud and say it clear, but say it in seven words or less.',
        location: 'Design Tips page, copy guidance',
      },
    ],
  },
  'wcag22-contrast-minimum': {
    publisher: 'W3C Web Accessibility Initiative',
    title: 'Understanding Success Criterion 1.4.3: Contrast (Minimum), WCAG 2.2',
    citation: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
    fetchedOn: '2026-09-07',
    quotes: [
      {
        text: 'The visual presentation of text and images of text has a contrast ratio of at least 4.5:1',
        location: 'Success Criterion text',
      },
      {
        text: 'Large-scale text and images of large-scale text have a contrast ratio of at least 3:1',
        location: 'Success Criterion text, Large Text exception',
      },
    ],
  },
  'nist-sp811-appendix-b9': {
    publisher: 'National Institute of Standards and Technology (NIST)',
    title:
      'Guide for the Use of the International System of Units (SI), Special Publication 811, Appendix B.9 — Factors for units listed by kind of quantity',
    citation:
      'https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9',
    fetchedOn: '2026-09-07',
    quotes: [
      {
        text: 'foot (ft) → meter (m): 3.048 E-01; inch (in) → centimeter (cm): 2.54 E+00',
        location: 'LENGTH table; both factors are set in boldface',
      },
      {
        text: 'Factors in boldface are exact.',
        location: 'Appendix B convention note',
      },
    ],
  },
} as const satisfies Record<string, SurfaceAdvisorySourceV3>;

export type SurfaceAdvisorySourceIdV3 = keyof typeof SURFACE_ADVISORY_SOURCES_V3;

const SOURCES = SURFACE_ADVISORY_SOURCES_V3;

// ============================================
// Constants (each cites a fetched URL or is a labelled Teul policy default)
// ============================================

export type SurfaceAdvisoryConstantV3 = {
  readonly value: number;
  readonly unit: string;
  readonly citation: `https://${string}` | typeof TEUL_POLICY_DEFAULT_CITATION;
  readonly sourceId: SurfaceAdvisorySourceIdV3 | null;
  /** Why this value, in one or two sentences. */
  readonly rationale: string;
};

export const SURFACE_ADVISORY_CONSTANTS_V3 = {
  'ink-coverage-limit-iso-coated-v2-300-eci': {
    value: 300,
    unit: 'percent total ink coverage',
    citation: SOURCES['eci-offset-standards'].citation,
    sourceId: 'eci-offset-standards',
    rationale:
      'Default limit. ECI names “ISO Coated v2 300% (ECI)” as “a good choice in cases where the intended printing condition is not yet known”, which is exactly Teul’s position when it has no press profile.',
  },
  'ink-coverage-limit-iso-coated-v2-eci': {
    value: 330,
    unit: 'percent total ink coverage',
    citation: SOURCES['eci-offset-standards'].citation,
    sourceId: 'eci-offset-standards',
    rationale:
      'Opt-in limit. ECI states the reduced limits as “from 350% to 330%, or 300% respectively” for the FOGRA39L coated pair and names only the 300% profile explicitly; Teul reads 330% as the “ISO Coated v2 (ECI)” value from that “respectively”.',
  },
  'saturated-screen-chroma-threshold': {
    value: 0.2,
    unit: 'OKLCH chroma',
    citation: TEUL_POLICY_DEFAULT_CITATION,
    sourceId: null,
    rationale:
      'Above this chroma Teul warns that CMYK reproduction typically shifts. The threshold is a Teul judgment, not a measured gamut boundary; a profiled conversion is the only real test.',
  },
  'pale-tint-lightness-threshold': {
    value: 0.9,
    unit: 'OKLCH lightness',
    citation: TEUL_POLICY_DEFAULT_CITATION,
    sourceId: null,
    rationale:
      'Above this lightness Teul treats a color as a pale tint that tends to drop out in print and on digital boards. The threshold is a Teul judgment.',
  },
  'out-of-home-text-minimum-contrast': {
    value: 4.5,
    unit: 'WCAG 2.2 contrast ratio',
    citation: TEUL_POLICY_DEFAULT_CITATION,
    sourceId: 'wcag22-contrast-minimum',
    rationale:
      'Teul reuses the WCAG 2.2 SC 1.4.3 normal-text floor (4.5:1) as its out-of-home text floor. WCAG is a web standard; applying its number to boards is Teul’s choice, not an OAAA or Lamar figure.',
  },
  'out-of-home-near-white-lightness-threshold': {
    value: 0.97,
    unit: 'OKLCH lightness',
    citation: TEUL_POLICY_DEFAULT_CITATION,
    sourceId: null,
    rationale:
      'Above this lightness Teul treats an out-of-home background as an all-white ground and surfaces the OAAA recommendation to pull it to a light gray. The threshold is a Teul judgment.',
  },
  'out-of-home-digital-white-to-black-percent': {
    value: 10,
    unit: 'percent black',
    citation: SOURCES['oaaa-ooh-creative-best-practices'].citation,
    sourceId: 'oaaa-ooh-creative-best-practices',
    rationale:
      'OAAA: “make the white a 10% black” for an all-white digital background. Teul quotes it as a recommendation and does not convert it to a hex value.',
  },
  'meters-per-international-foot': {
    value: 0.3048,
    unit: 'meters per foot',
    citation: SOURCES['nist-sp811-appendix-b9'].citation,
    sourceId: 'nist-sp811-appendix-b9',
    rationale: 'Exact conversion factor (NIST SP 811 B.9, boldface).',
  },
  'centimeters-per-inch': {
    value: 2.54,
    unit: 'centimeters per inch',
    citation: SOURCES['nist-sp811-appendix-b9'].citation,
    sourceId: 'nist-sp811-appendix-b9',
    rationale: 'Exact conversion factor (NIST SP 811 B.9, boldface).',
  },
  'hero-meaning-role-share-limit': {
    value: 1,
    unit: 'meaning roles per mode',
    citation: TEUL_POLICY_DEFAULT_CITATION,
    sourceId: null,
    rationale:
      'p3-B. Above this many meaning roles (focus, selected, link, status) on the hero family in one mode, Teul notes that the primary is carrying more than emphasis. The benchmark sources reserve the hero for selective emphasis but give no count; one is Teul’s judgment.',
  },
  'hero-surface-role-share-limit': {
    value: 1,
    unit: 'product surface roles per mode',
    citation: TEUL_POLICY_DEFAULT_CITATION,
    sourceId: null,
    rationale:
      'p3-B. Above this many product surface roles (background, surface, text, border, disabled) on the hero family in one mode, Teul notes the hero is doing the neutral ramp’s work. One is Teul’s judgment; the composer itself assigns none.',
  },
} as const satisfies Record<string, SurfaceAdvisoryConstantV3>;

export type SurfaceAdvisoryConstantIdV3 = keyof typeof SURFACE_ADVISORY_CONSTANTS_V3;

const CONSTANTS = SURFACE_ADVISORY_CONSTANTS_V3;

// ============================================
// Job → surface mapping (Teul policy default)
// ============================================

/**
 * Teul policy default. Brand and rendered-text colors travel everywhere;
 * marketing accents skip product UI; product jobs stay on product screens;
 * data palettes appear on product and marketing screens but are not checked
 * for print or boards.
 */
export const SURFACES_BY_JOB_V3: Readonly<
  Record<ColorSystemJobV2, readonly ColorSystemSurfaceV3[]>
> = {
  'brand-primary': COLOR_SYSTEM_SURFACES_V3,
  'marketing-accent': ['screen-marketing', 'print', 'out-of-home'],
  'product-graphics': ['screen-product'],
  'functional-iconography': ['screen-product'],
  'product-ui-surface': ['screen-product'],
  'product-semantics': ['screen-product'],
  'categorical-data': ['screen-product', 'screen-marketing'],
  'sequential-data': ['screen-product', 'screen-marketing'],
  'diverging-data': ['screen-product', 'screen-marketing'],
  'rendered-text-pair': COLOR_SYSTEM_SURFACES_V3,
};

export function surfacesForJob(job: ColorSystemJobV2): readonly ColorSystemSurfaceV3[] {
  const surfaces = Object.prototype.hasOwnProperty.call(SURFACES_BY_JOB_V3, job)
    ? SURFACES_BY_JOB_V3[job]
    : undefined;
  if (!surfaces) {
    throw new Error(`Unknown color-system job: ${String(job)}`);
  }
  return surfaces;
}

/** Union of the surfaces for every job, in canonical surface order. */
export function surfacesForJobs(
  jobs: readonly ColorSystemJobV2[]
): readonly ColorSystemSurfaceV3[] {
  const active = new Set<ColorSystemSurfaceV3>();
  for (const job of jobs) {
    for (const surface of surfacesForJob(job)) {
      active.add(surface);
    }
  }
  return COLOR_SYSTEM_SURFACES_V3.filter(surface => active.has(surface));
}

// ============================================
// Findings
// ============================================

export type SurfaceAdvisorySeverityV3 = 'info' | 'warning';

export const SURFACE_ADVISORY_CODES_V3 = [
  'PRINT_TRIPLET',
  'PRINT_INK_COVERAGE_EXCEEDS_LIMIT',
  'PRINT_INK_COVERAGE_WITHIN_LIMIT',
  'PRINT_SATURATED_SCREEN_COLOR',
  'PRINT_PALE_TINT_DROPOUT',
  'OOH_PALE_TINT_GROUND',
  'OOH_TEXT_CONTRAST_BELOW_MINIMUM',
  'OOH_TEXT_CONTRAST_MEETS_MINIMUM',
  'OOH_DIGITAL_BOARD_WHITE_GROUND',
  // p3-B: hero-color discipline on product screens.
  'HERO_AS_WASH',
  'HERO_SHARE_EXCEEDED',
] as const;

export type SurfaceAdvisoryCodeV3 = (typeof SURFACE_ADVISORY_CODES_V3)[number];

/** JSON-safe evidence so the UI can render or export it without translation. */
export type SurfaceAdvisoryEvidenceValueV3 =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly SurfaceAdvisoryEvidenceValueV3[]
  | { readonly [key: string]: SurfaceAdvisoryEvidenceValueV3 };

export type SurfaceFindingV3 = {
  readonly surface: ColorSystemSurfaceV3;
  readonly severity: SurfaceAdvisorySeverityV3;
  readonly code: SurfaceAdvisoryCodeV3;
  readonly message: string;
  readonly evidence: { readonly [key: string]: SurfaceAdvisoryEvidenceValueV3 };
};

export type SurfaceAdvisoryV3 = { readonly id: string } & SurfaceFindingV3;

// ============================================
// Hex and OKLCH helpers
// ============================================

function normalizeHexV3(hex: string): string {
  const trimmed = hex.trim();
  const short = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(trimmed);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  }
  const full = /^#?([a-f\d]{6})$/i.exec(trimmed);
  if (!full) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return `#${full[1]}`.toUpperCase();
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

type RoundedOklchV3 = { readonly l: number; readonly c: number; readonly h: number };

function roundedOklch(oklch: { l: number; c: number; h: number }): RoundedOklchV3 {
  return { l: roundTo(oklch.l, 3), c: roundTo(oklch.c, 3), h: roundTo(oklch.h, 1) };
}

// ============================================
// Unprofiled CMYK estimate
// ============================================

export const CMYK_UNPROFILED_DISCLAIMER =
  'Unprofiled estimate for orientation only. A profiled conversion (for example ISO Coated v2 / FOGRA39) will differ, and CMYK cannot reproduce many saturated screen colors.' as const;

export type CmykPercentagesV3 = {
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
};

export type UnprofiledCmykEstimateV3 = CmykPercentagesV3 & {
  readonly hex: string;
  readonly method: 'unprofiled-naive-estimate';
  readonly disclaimer: typeof CMYK_UNPROFILED_DISCLAIMER;
};

/** CMYK percentages the owner states, for example from an existing print standard. */
export type OwnerSuppliedCmykV3 = CmykPercentagesV3 & {
  readonly source: 'owner-supplied';
  /** Press condition or profile the owner states for these values, verbatim. */
  readonly pressCondition?: string;
};

export type InkCoverageBasisV3 = UnprofiledCmykEstimateV3 | OwnerSuppliedCmykV3;

function toWholePercent(fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  const percent = Math.round(clamped * 100);
  return percent === 0 ? 0 : percent;
}

/**
 * Standard naive sRGB → CMYK formula: K = 1 − max(R, G, B);
 * C = (1 − R − K) / (1 − K), and likewise for M and Y. It replaces gray with
 * black as far as possible and knows nothing about ink, paper or dot gain.
 */
export function estimateCmykUnprofiled(hex: string): UnprofiledCmykEstimateV3 {
  const normalized = normalizeHexV3(hex);
  const rgb = hexToRgb(normalized);
  const red = rgb.r / 255;
  const green = rgb.g / 255;
  const blue = rgb.b / 255;
  const black = 1 - Math.max(red, green, blue);
  const base = {
    hex: normalized,
    method: 'unprofiled-naive-estimate' as const,
    disclaimer: CMYK_UNPROFILED_DISCLAIMER,
  };
  if (black >= 1) {
    return { ...base, c: 0, m: 0, y: 0, k: 100 };
  }
  const scale = 1 - black;
  return {
    ...base,
    c: toWholePercent((1 - red - black) / scale),
    m: toWholePercent((1 - green - black) / scale),
    y: toWholePercent((1 - blue - black) / scale),
    k: toWholePercent(black),
  };
}

// ============================================
// Total ink coverage
// ============================================

export type InkCoverageLimitV3 = {
  readonly id: string;
  readonly percent: number;
  /** Named so the message can say which press condition the limit assumes. */
  readonly pressCondition: string;
  readonly citation: string;
};

export const INK_COVERAGE_LIMITS_V3 = {
  'iso-coated-v2-300-eci': {
    id: 'iso-coated-v2-300-eci',
    percent: CONSTANTS['ink-coverage-limit-iso-coated-v2-300-eci'].value,
    pressCondition:
      '“ISO Coated v2 300% (ECI)” (FOGRA39L; gloss or matt coated paper types 1 and 2; sheet-fed or heat-set web offset)',
    citation: SOURCES['eci-offset-standards'].citation,
  },
  'iso-coated-v2-eci': {
    id: 'iso-coated-v2-eci',
    percent: CONSTANTS['ink-coverage-limit-iso-coated-v2-eci'].value,
    pressCondition: '“ISO Coated v2 (ECI)” (FOGRA39L; gloss or matt coated paper types 1 and 2)',
    citation: SOURCES['eci-offset-standards'].citation,
  },
} as const satisfies Record<string, InkCoverageLimitV3>;

export type InkCoverageLimitIdV3 = keyof typeof INK_COVERAGE_LIMITS_V3;

export const DEFAULT_INK_COVERAGE_LIMIT_ID_V3: InkCoverageLimitIdV3 = 'iso-coated-v2-300-eci';

function assertCmykPercentages(cmyk: CmykPercentagesV3): void {
  for (const channel of ['c', 'm', 'y', 'k'] as const) {
    const value = cmyk[channel];
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(
        `CMYK channel ${channel.toUpperCase()} must be a percentage from 0 to 100; received ${String(value)}`
      );
    }
  }
}

/** C + M + Y + K in percent, rounded to one decimal. */
export function totalInkCoverage(cmyk: CmykPercentagesV3): number {
  assertCmykPercentages(cmyk);
  return roundTo(cmyk.c + cmyk.m + cmyk.y + cmyk.k, 1);
}

function resolveInkCoverageLimit(limit: InkCoverageLimitV3 | number): InkCoverageLimitV3 {
  if (typeof limit === 'number') {
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error(
        `Ink coverage limit must be a positive percentage; received ${String(limit)}`
      );
    }
    return {
      id: 'caller-supplied',
      percent: limit,
      pressCondition: 'a caller-supplied limit with no stated press condition',
      citation: 'caller-supplied',
    };
  }
  if (!Number.isFinite(limit.percent) || limit.percent <= 0) {
    throw new Error(
      `Ink coverage limit must be a positive percentage; received ${String(limit.percent)}`
    );
  }
  return limit;
}

function formatPercent(value: number): string {
  return `${value}%`;
}

/**
 * Compare total ink coverage with a limit. The default limit is the ECI
 * “ISO Coated v2 300% (ECI)” condition, which ECI recommends when the press
 * condition is not yet known. The message always names the assumed condition.
 */
export function inkCoverageAdvisory(
  cmyk: InkCoverageBasisV3,
  limit: InkCoverageLimitV3 | number = INK_COVERAGE_LIMITS_V3[DEFAULT_INK_COVERAGE_LIMIT_ID_V3]
): SurfaceFindingV3 {
  const resolvedLimit = resolveInkCoverageLimit(limit);
  const total = totalInkCoverage(cmyk);
  const basis = 'source' in cmyk ? 'owner-supplied' : 'unprofiled-naive-estimate';
  const basisNote =
    basis === 'owner-supplied'
      ? 'The total comes from the owner-supplied CMYK values.'
      : 'The total comes from an unprofiled estimate that uses maximal black replacement, which tends to understate the total ink a profiled separation would carry.';
  const exceeded = total > resolvedLimit.percent;
  const message = exceeded
    ? `Total ink coverage ${formatPercent(total)} exceeds the ${formatPercent(resolvedLimit.percent)} limit assumed for ${resolvedLimit.pressCondition}. Rework the CMYK values with the printer before it goes to press. ${basisNote}`
    : `Total ink coverage ${formatPercent(total)} is within the ${formatPercent(resolvedLimit.percent)} limit assumed for ${resolvedLimit.pressCondition}. ${basisNote}`;

  return {
    surface: 'print',
    severity: exceeded ? 'warning' : 'info',
    code: exceeded ? 'PRINT_INK_COVERAGE_EXCEEDS_LIMIT' : 'PRINT_INK_COVERAGE_WITHIN_LIMIT',
    message,
    evidence: {
      basis,
      c: cmyk.c,
      m: cmyk.m,
      y: cmyk.y,
      k: cmyk.k,
      totalPercent: total,
      limitPercent: resolvedLimit.percent,
      limitId: resolvedLimit.id,
      pressCondition: resolvedLimit.pressCondition,
      citation: resolvedLimit.citation,
    },
  };
}

// ============================================
// Screen → print drift and pale tints
// ============================================

/**
 * Two Teul-declared checks on the screen value itself. Saturated colors get a
 * print warning; pale tints get a print warning and an out-of-home warning,
 * because both surfaces lose them. The X-Rite note travels as context only —
 * it is a statement about the CMYK gamut, not a number about this color.
 */
export function screenToPrintDriftAdvisory(hex: string): readonly SurfaceFindingV3[] {
  const normalized = normalizeHexV3(hex);
  const raw = hexToOklch(normalized);
  const oklch = roundedOklch(raw);
  const chromaThreshold = CONSTANTS['saturated-screen-chroma-threshold'].value;
  const paleThreshold = CONSTANTS['pale-tint-lightness-threshold'].value;
  const findings: SurfaceFindingV3[] = [];

  if (raw.c > chromaThreshold) {
    findings.push({
      surface: 'print',
      severity: 'warning',
      code: 'PRINT_SATURATED_SCREEN_COLOR',
      message: `${normalized} is highly saturated on screen (OKLCH chroma ${oklch.c}, above Teul’s ${chromaThreshold} threshold). Colors this saturated typically shift when reproduced in CMYK; expect visible drift and proof it under the intended press condition.`,
      evidence: {
        hex: normalized,
        oklch,
        chromaThreshold,
        citation: CONSTANTS['saturated-screen-chroma-threshold'].citation,
        context: SOURCES['xrite-extended-gamut'].quotes[0].text,
        contextCitation: SOURCES['xrite-extended-gamut'].citation,
      },
    });
  }

  if (raw.l > paleThreshold) {
    const paleEvidence = {
      hex: normalized,
      oklch,
      lightnessThreshold: paleThreshold,
      citation: CONSTANTS['pale-tint-lightness-threshold'].citation,
    };
    findings.push({
      surface: 'print',
      severity: 'warning',
      code: 'PRINT_PALE_TINT_DROPOUT',
      message: `${normalized} is a pale tint (OKLCH lightness ${oklch.l}, above Teul’s ${paleThreshold} threshold). Pale tints tend to drop out in print and on digital boards; do not rely on it as a ground, a fine line or a gradient end.`,
      evidence: paleEvidence,
    });
    findings.push({
      surface: 'out-of-home',
      severity: 'warning',
      code: 'OOH_PALE_TINT_GROUND',
      message: `${normalized} is a pale tint (OKLCH lightness ${oklch.l}, above Teul’s ${paleThreshold} threshold). On boards it reads as near-white; avoid it as an out-of-home ground.`,
      evidence: paleEvidence,
    });
  }

  return findings;
}

// ============================================
// Out-of-home legibility
// ============================================

/**
 * Contrast for text meant to be read at distance. The 4.5:1 floor is a Teul
 * policy default borrowed from WCAG 2.2; the white-ground advisory carries
 * OAAA’s own words. Letter height by distance lives in minimumLetterHeightCm.
 */
export function outOfHomeTextAdvisory(
  foregroundHex: string,
  backgroundHex: string
): readonly SurfaceFindingV3[] {
  const foreground = normalizeHexV3(foregroundHex);
  const background = normalizeHexV3(backgroundHex);
  const ratio = getWCAGContrastHex(foreground, background);
  const displayRatio = roundTo(ratio, 2);
  const minimum = CONSTANTS['out-of-home-text-minimum-contrast'].value;
  const meets = ratio >= minimum;
  const findings: SurfaceFindingV3[] = [];

  findings.push({
    surface: 'out-of-home',
    severity: meets ? 'info' : 'warning',
    code: meets ? 'OOH_TEXT_CONTRAST_MEETS_MINIMUM' : 'OOH_TEXT_CONTRAST_BELOW_MINIMUM',
    message: meets
      ? `Text ${foreground} on ${background} measures ${displayRatio}:1 (WCAG 2.2 formula), meeting Teul’s ${minimum}:1 out-of-home floor. Legibility at distance still depends on letter height and viewing distance.`
      : `Text ${foreground} on ${background} measures ${displayRatio}:1 (WCAG 2.2 formula), below Teul’s ${minimum}:1 out-of-home floor. Choose a darker or lighter pair before it goes on a board.`,
    evidence: {
      foregroundHex: foreground,
      backgroundHex: background,
      ratio: displayRatio,
      minimumRatio: minimum,
      citation: CONSTANTS['out-of-home-text-minimum-contrast'].citation,
      context: SOURCES['lamar-design-tips'].quotes[0].text,
      contextCitation: SOURCES['lamar-design-tips'].citation,
    },
  });

  const backgroundRaw = hexToOklch(background);
  const nearWhiteThreshold = CONSTANTS['out-of-home-near-white-lightness-threshold'].value;
  if (backgroundRaw.l > nearWhiteThreshold) {
    const backgroundOklch = roundedOklch(backgroundRaw);
    findings.push({
      surface: 'out-of-home',
      severity: 'warning',
      code: 'OOH_DIGITAL_BOARD_WHITE_GROUND',
      message: `Background ${background} is white or near-white (OKLCH lightness ${backgroundOklch.l}). On digital boards pull an all-white ground to a light gray; OAAA’s guidance is to “make the white a 10% black”.`,
      evidence: {
        backgroundHex: background,
        oklch: backgroundOklch,
        lightnessThreshold: nearWhiteThreshold,
        thresholdCitation: CONSTANTS['out-of-home-near-white-lightness-threshold'].citation,
        recommendationPercentBlack: CONSTANTS['out-of-home-digital-white-to-black-percent'].value,
        quote: SOURCES['oaaa-ooh-creative-best-practices'].quotes[1].text,
        quoteLocation: SOURCES['oaaa-ooh-creative-best-practices'].quotes[1].location,
        citation: SOURCES['oaaa-ooh-creative-best-practices'].citation,
      },
    });
  }

  return findings;
}

// ============================================
// Letter height by viewing distance (OAAA table)
// ============================================

export type OaaaFontSizeRowV3 = {
  readonly distanceFeet: { readonly minimum: number; readonly maximum: number | null };
  readonly mediaType: string;
  readonly letterHeightInches: { readonly minimum: number; readonly maximum: number };
  /** The row as printed, cells separated by a single space. */
  readonly verbatim: string;
};

/**
 * OAAA, OOH Creative Best Practices, PDF page 14 of the spreads file (printed
 * folio 26), “Font Size” table: DISTANCE / MEDIA TYPE / FONT SIZE.
 * Source: https://oaaa.org/wp-content/uploads/2022/09/OAAA-Best-Practices-oct20-2021-spreads_2_.pdf
 */
export const OAAA_FONT_SIZE_TABLE_V3: readonly OaaaFontSizeRowV3[] = [
  {
    distanceFeet: { minimum: 5, maximum: 50 },
    mediaType: 'Malls, Airports',
    letterHeightInches: { minimum: 1, maximum: 2 },
    verbatim: '5’-50’ Malls, Airports 1”- 2”',
  },
  {
    distanceFeet: { minimum: 50, maximum: 100 },
    mediaType: 'Window, Street Furniture',
    letterHeightInches: { minimum: 2, maximum: 4 },
    verbatim: '50’-100’ Window, Street Furniture 2”-4”',
  },
  {
    distanceFeet: { minimum: 100, maximum: 200 },
    mediaType: 'Posters, Surface Streets',
    letterHeightInches: { minimum: 4, maximum: 8 },
    verbatim: '100’-200’ Posters, Surface Streets 4”-8”',
  },
  {
    distanceFeet: { minimum: 200, maximum: 350 },
    mediaType: 'Highway Bulletins, Walls',
    letterHeightInches: { minimum: 8, maximum: 15 },
    verbatim: '200’-350’ Highway Bulletins, Walls 8”-15”',
  },
  {
    distanceFeet: { minimum: 350, maximum: 500 },
    mediaType: 'Highways',
    letterHeightInches: { minimum: 15, maximum: 20 },
    verbatim: '350’-500’ Highways 15”-20”',
  },
  {
    distanceFeet: { minimum: 500, maximum: 600 },
    mediaType: 'Highways',
    letterHeightInches: { minimum: 20, maximum: 24 },
    verbatim: '500’-600’ Highways 20”-24”',
  },
  {
    distanceFeet: { minimum: 600, maximum: null },
    mediaType: 'Highways',
    letterHeightInches: { minimum: 24, maximum: 40 },
    verbatim: '600’+ Highways 24”-40”',
  },
];

export type LetterHeightGuidanceV3 = {
  readonly viewingDistanceM: number;
  readonly viewingDistanceFeet: number;
  readonly minimumCm: number;
  readonly maximumCm: number;
  readonly minimumInches: number;
  readonly maximumInches: number;
  readonly mediaType: string;
  readonly row: OaaaFontSizeRowV3;
  readonly citation: string;
  readonly note: string;
};

/**
 * Look up the OAAA “Font Size” row for a viewing distance and return its
 * letter-height range in centimeters. The lower bound is what Teul calls the
 * minimum; OAAA words the table as sizes “more easily read at the following
 * scales”, not as a rule. Ranges are half-open: exactly 50 feet falls in the
 * 50–100 row. Distances under 5 feet are outside the table and return null.
 */
export function minimumLetterHeightCm(viewingDistanceM: number): LetterHeightGuidanceV3 | null {
  if (!Number.isFinite(viewingDistanceM) || viewingDistanceM < 0) {
    throw new Error(
      `Viewing distance must be a non-negative number of meters; received ${String(viewingDistanceM)}`
    );
  }
  const feet = viewingDistanceM / CONSTANTS['meters-per-international-foot'].value;
  const row = OAAA_FONT_SIZE_TABLE_V3.find(
    candidate =>
      feet >= candidate.distanceFeet.minimum &&
      (candidate.distanceFeet.maximum === null || feet < candidate.distanceFeet.maximum)
  );
  if (!row) {
    return null;
  }
  const centimetersPerInch = CONSTANTS['centimeters-per-inch'].value;
  return {
    viewingDistanceM,
    viewingDistanceFeet: roundTo(feet, 1),
    minimumCm: roundTo(row.letterHeightInches.minimum * centimetersPerInch, 1),
    maximumCm: roundTo(row.letterHeightInches.maximum * centimetersPerInch, 1),
    minimumInches: row.letterHeightInches.minimum,
    maximumInches: row.letterHeightInches.maximum,
    mediaType: row.mediaType,
    row,
    citation: SOURCES['oaaa-ooh-creative-best-practices'].citation,
    note: 'Lower bound of the OAAA “Font Size” range for this viewing distance. OAAA presents the table as sizes “more easily read at the following scales”, not as a rule; distances under 5 feet are outside it.',
  };
}

// ============================================
// Print triplet
// ============================================

/**
 * A spot color the owner typed in. Teul never derives, looks up, completes or
 * guesses this field; spot references are licensed data.
 */
export type OwnerSuppliedSpotColor = {
  readonly system: 'pantone' | 'other';
  readonly name: string;
  readonly finish?: 'coated' | 'uncoated';
  readonly source: 'owner-supplied';
};

export type PrintTripletV3 = {
  readonly screen: { readonly hex: string; readonly oklch: RoundedOklchV3 };
  readonly cmyk: UnprofiledCmykEstimateV3;
  readonly spot: OwnerSuppliedSpotColor | null;
  /** 'spot' only when the owner supplied one; otherwise the screen value is canonical. */
  readonly canonical: 'screen' | 'spot';
  readonly note: string;
};

function assertOwnerSuppliedSpot(spot: OwnerSuppliedSpotColor): void {
  if (spot.source !== 'owner-supplied') {
    throw new Error('Spot colors must be owner-supplied; Teul does not look up or generate them.');
  }
  if (spot.system !== 'pantone' && spot.system !== 'other') {
    throw new Error(`Unknown spot-color system: ${String(spot.system)}`);
  }
  if (typeof spot.name !== 'string' || spot.name.trim().length === 0) {
    throw new Error('An owner-supplied spot color needs the name the owner wrote.');
  }
  if (spot.finish !== undefined && spot.finish !== 'coated' && spot.finish !== 'uncoated') {
    throw new Error(`Unknown spot-color finish: ${String(spot.finish)}`);
  }
}

/**
 * The three values a brand color needs before print: screen, an unprofiled
 * CMYK estimate, and the owner’s spot reference if one exists. The note says
 * which is canonical and that the others drift from it.
 */
export function printTriplet(hex: string, spot?: OwnerSuppliedSpotColor): PrintTripletV3 {
  const normalized = normalizeHexV3(hex);
  const oklch = roundedOklch(hexToOklch(normalized));
  const cmyk = estimateCmykUnprofiled(normalized);

  if (spot) {
    assertOwnerSuppliedSpot(spot);
    const finish = spot.finish ? ` (${spot.finish})` : '';
    return {
      screen: { hex: normalized, oklch },
      cmyk,
      spot,
      canonical: 'spot',
      note: `The owner-supplied spot color “${spot.name}”${finish} is canonical. The screen value ${normalized} and the unprofiled CMYK estimate approximate it and will drift from the printed swatch; proof both against it.`,
    };
  }

  return {
    screen: { hex: normalized, oklch },
    cmyk,
    spot: null,
    canonical: 'screen',
    note: `No spot color was supplied, so the screen value ${normalized} is canonical. Teul does not look up, generate or guess spot-color references; add one from the brand’s own print standard if it exists. The unprofiled CMYK estimate is for orientation only and will differ from a profiled conversion.`,
  };
}

// ============================================
// Hero-color discipline (Teul policy default; benchmark item E1)
// ============================================

/**
 * The plain rule every hero-discipline advisory ends with. Expert systems keep
 * the signature color for emphasis and let the neutral ramp carry surfaces; the
 * role lists and the share of one below are Teul's declared defaults, not
 * figures from a source.
 */
export const HERO_DISCIPLINE_STATEMENT_V3 =
  'The primary is your hero. Keep it for emphasis; the neutral ramp carries surfaces.' as const;

/** Product roles that fill large areas; the hero or a brand-surface color there is a wash. */
export const HERO_WASH_ROLES_V3 = ['background', 'surface'] as const;
/** Product roles the neutral ramp carries; more than one on the hero exceeds its share. */
export const HERO_SURFACE_ROLES_V3 = [
  'background',
  'surface',
  'text',
  'border',
  'disabled',
] as const;
/** Jobs that mark a color as a brand-surface color; bound to a wash role it becomes a wash. */
export const HERO_BRAND_SURFACE_JOBS_V3 = [
  'brand-primary',
  'marketing-accent',
] as const satisfies readonly ColorSystemJobV2[];

export type HeroDisciplineColorV3 = {
  readonly id: string;
  readonly hex: string;
  /** Display name used in messages. */
  readonly role: string;
  /** True for the brand family and for the locked Primary itself. */
  readonly hero: boolean;
  /** Jobs the color carries; a brand-surface job turns a large fill into a wash. */
  readonly jobs: readonly ColorSystemJobV2[];
};

export type HeroDisciplineBindingV3 = {
  /** Product semantic role name, for example `background` or `success`. */
  readonly role: string;
  readonly mode: string;
  readonly colorId: string;
};

export type HeroDisciplineInputV3 = {
  readonly colors: readonly HeroDisciplineColorV3[];
  readonly bindings: readonly HeroDisciplineBindingV3[];
};

const MEANING_ROLES_V3: ReadonlySet<string> = new Set(COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2);
const WASH_ROLES_V3: ReadonlySet<string> = new Set(HERO_WASH_ROLES_V3);
const SURFACE_ROLES_V3: ReadonlySet<string> = new Set(HERO_SURFACE_ROLES_V3);
const BRAND_SURFACE_JOBS_V3: ReadonlySet<string> = new Set(HERO_BRAND_SURFACE_JOBS_V3);

/**
 * Two checks on product-role bindings, both on the product screen.
 * `HERO_AS_WASH` (warning): a wash role resolves to the hero, or to a color that
 * carries a brand-surface job. `HERO_SHARE_EXCEEDED` (info): in one mode the
 * hero carries more meaning roles, or more product surface roles, than Teul's
 * declared share of one each. Fails closed on a binding to an unknown color.
 */
export function heroDisciplineAdvisories(
  input: HeroDisciplineInputV3
): readonly SurfaceAdvisoryV3[] {
  assertUniqueIds(
    'hero-discipline color',
    input.colors.map(color => color.id)
  );
  const colorsById = new Map(input.colors.map(color => [color.id, color] as const));
  const bindings = [...input.bindings].sort(
    (left, right) => compareText(left.mode, right.mode) || compareText(left.role, right.role)
  );
  for (const binding of bindings) {
    if (!colorsById.has(binding.colorId)) {
      throw new Error(
        `Hero-discipline binding ${binding.mode}/${binding.role} names an unknown color id: ${binding.colorId}`
      );
    }
  }
  const findings: SurfaceAdvisoryV3[] = [];
  const label = `(${TEUL_POLICY_DEFAULT_CITATION}.)`;

  for (const binding of bindings) {
    if (!WASH_ROLES_V3.has(binding.role)) continue;
    const color = colorsById.get(binding.colorId)!;
    const brandJob = color.jobs.find(job => BRAND_SURFACE_JOBS_V3.has(job)) ?? null;
    if (!color.hero && brandJob === null) continue;
    const hex = normalizeHexV3(color.hex);
    const reason = color.hero
      ? `the hero family “${color.role}”`
      : `“${color.role}”, which carries the ${brandJob} job`;
    findings.push({
      id: color.id,
      surface: 'screen-product',
      severity: 'warning',
      code: 'HERO_AS_WASH',
      message: `${binding.mode} ${binding.role} resolves to ${reason} (${hex}), a large fill. ${HERO_DISCIPLINE_STATEMENT_V3} ${label}`,
      evidence: {
        role: binding.role,
        mode: binding.mode,
        colorId: color.id,
        hex,
        hero: color.hero,
        brandSurfaceJob: brandJob,
        citation: TEUL_POLICY_DEFAULT_CITATION,
      },
    });
  }

  const meaningLimit = CONSTANTS['hero-meaning-role-share-limit'].value;
  const surfaceLimit = CONSTANTS['hero-surface-role-share-limit'].value;
  const modes = [...new Set(bindings.map(binding => binding.mode))].sort(compareText);
  const heroes = input.colors
    .filter(color => color.hero)
    .sort((left, right) => compareText(left.id, right.id));
  for (const mode of modes) {
    for (const color of heroes) {
      const roles = bindings
        .filter(binding => binding.mode === mode && binding.colorId === color.id)
        .map(binding => binding.role);
      const shares = [
        {
          kind: 'meaning roles',
          roles: roles.filter(role => MEANING_ROLES_V3.has(role)),
          limit: meaningLimit,
        },
        {
          kind: 'product surface roles',
          roles: roles.filter(role => SURFACE_ROLES_V3.has(role)),
          limit: surfaceLimit,
        },
      ];
      for (const share of shares) {
        if (share.roles.length <= share.limit) continue;
        const hex = normalizeHexV3(color.hex);
        findings.push({
          id: color.id,
          surface: 'screen-product',
          severity: 'info',
          code: 'HERO_SHARE_EXCEEDED',
          message: `In ${mode} the hero family “${color.role}” (${hex}) carries ${share.roles.length} ${share.kind} (${share.roles.join(', ')}); Teul’s declared share is ${share.limit}. ${HERO_DISCIPLINE_STATEMENT_V3} ${label}`,
          evidence: {
            mode,
            colorId: color.id,
            hex,
            kind: share.kind,
            roles: share.roles,
            limit: share.limit,
            citation: TEUL_POLICY_DEFAULT_CITATION,
          },
        });
      }
    }
  }
  return findings;
}

// ============================================
// Declared proportion rule (Teul policy default; benchmark item B2)
// ============================================

export const COLOR_SYSTEM_PROPORTION_TIERS_V3 = [
  'neutral',
  'brand primary',
  'accents',
  'status',
] as const;

export type ColorSystemProportionTierNameV3 = (typeof COLOR_SYSTEM_PROPORTION_TIERS_V3)[number];

export type ColorSystemProportionTierV3 = {
  readonly tier: ColorSystemProportionTierNameV3;
  /** A share of any one surface, as prose (“60–80 %”, “≤ 20 %”); never a figure Teul measured. */
  readonly share: string;
  /** The roles and jobs the tier may carry, in the builder's vocabulary. */
  readonly roles: readonly string[];
};

export type ColorSystemProportionSourceV3 = {
  readonly label: string;
  /** Present only when the compared source has a public page. */
  readonly url?: `https://${string}`;
};

export type ColorSystemProportionRuleV3 = {
  readonly authority: 'teul-policy-default';
  readonly tiers: readonly ColorSystemProportionTierV3[];
  readonly statement: string;
  readonly sources: readonly ColorSystemProportionSourceV3[];
  readonly sourcesNote: string;
  readonly note: string;
};

/**
 * Expert systems always say how much of a surface each tier may take, and the
 * published rules disagree: 80/20, 60/30/10, 75/25, and one library that
 * refuses a fixed ratio. Teul therefore declares the rule it honours and where
 * it came from instead of applying one silently. The shares are Teul's default;
 * the compared sources are listed so an owner can see the disagreement and
 * substitute their own guideline. Teul never infers proportion from the file.
 */
export const COLOR_SYSTEM_PROPORTION_RULE_V3 = {
  authority: 'teul-policy-default',
  tiers: [
    {
      tier: 'neutral',
      share: '60–80 %',
      roles: ['background', 'surface', 'text', 'border', 'disabled'],
    },
    {
      tier: 'brand primary',
      share: '≤ 20 %',
      roles: ['brand-primary', 'focus', 'selected', 'link'],
    },
    {
      tier: 'accents',
      share: '≤ 10 % each',
      roles: [
        'marketing-accent',
        'product-graphics',
        'functional-iconography',
        'categorical-data',
        'sequential-data',
        'diverging-data',
      ],
    },
    {
      tier: 'status',
      share: 'status only',
      roles: ['success', 'warning', 'error', 'destructive', 'information'],
    },
  ],
  statement:
    'Neutrals carry 60–80 % of any surface. The brand primary takes at most 20 %, for emphasis. Each accent takes at most 10 %. Status colors appear only where they carry meaning. These shares are Teul’s policy default, declared because the published rules disagree.',
  sources: [
    {
      label: 'Brand-strategy pattern: “80% neutral foundation, 20% signature color—never reverse”',
    },
    { label: 'Art-direction framework: “60% primary, 30% secondary, 10% accent”' },
    {
      label: 'Brand-guidelines anatomy example: primary 75 %, secondary 25 % of brand color usage',
    },
    { label: 'A fintech brand’s 2020 guidelines: White 60 %, Green 30 %, Black 10 %' },
    {
      label:
        'A brand library that defines distribution by the context of application and states “no 60-30-10”',
    },
  ],
  sourcesNote:
    'Compared in the 2026-09-07 expert benchmark (checklist item B2). Each is an internal knowledge-base document without a public page, so no link is given.',
  note: 'Change this rule if your brand guideline states another; Teul does not infer proportion from the file.',
} as const satisfies ColorSystemProportionRuleV3;

// ============================================
// Aggregate
// ============================================

export type SurfaceAdvisoryColorInputV3 = {
  readonly id: string;
  readonly hex: string;
  readonly role: string;
  /** Owner-stated CMYK values; when present the ink check runs on them, not on the estimate. */
  readonly cmyk?: OwnerSuppliedCmykV3;
};

export type SurfaceAdvisoryTextPairInputV3 = {
  readonly id: string;
  readonly foregroundHex: string;
  readonly backgroundHex: string;
};

export type SurfaceAdvisoriesInputV3 = {
  readonly jobs: readonly ColorSystemJobV2[];
  readonly colors: readonly SurfaceAdvisoryColorInputV3[];
  readonly textPairs?: readonly SurfaceAdvisoryTextPairInputV3[];
  /** Keyed by color id. Only owner-supplied spot colors are accepted. */
  readonly spots?: Readonly<Record<string, OwnerSuppliedSpotColor>>;
  /** Press condition for the ink-coverage check; defaults to the ECI 300% profile. */
  readonly inkCoverageLimitId?: InkCoverageLimitIdV3;
  /** p3-B: product-role bindings for the hero-discipline checks on the product screen. */
  readonly heroDiscipline?: HeroDisciplineInputV3;
};

export type SurfaceAdvisorySummaryV3 = {
  readonly info: number;
  readonly warning: number;
  readonly total: number;
};

export type SurfaceAdvisoriesResultV3 = {
  readonly version: typeof COLOR_SYSTEM_SURFACE_ADVISORIES_V3_SCHEMA_VERSION;
  /** Surfaces the supplied jobs reach, in canonical order. */
  readonly surfaces: readonly ColorSystemSurfaceV3[];
  readonly advisories: readonly SurfaceAdvisoryV3[];
  readonly summary: Readonly<Record<ColorSystemSurfaceV3, SurfaceAdvisorySummaryV3>>;
};

function assertUniqueIds(label: string, ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error(`Every ${label} needs a non-empty id.`);
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate ${label} id: ${id}`);
    }
    seen.add(id);
  }
}

function compareAdvisories(left: SurfaceAdvisoryV3, right: SurfaceAdvisoryV3): number {
  return (
    COLOR_SYSTEM_SURFACES_V3.indexOf(left.surface) -
      COLOR_SYSTEM_SURFACES_V3.indexOf(right.surface) ||
    compareText(left.id, right.id) ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message)
  );
}

function tripletMessage(color: SurfaceAdvisoryColorInputV3, triplet: PrintTripletV3): string {
  const { cmyk } = triplet;
  const total = totalInkCoverage(cmyk);
  const screenLabel = triplet.canonical === 'screen' ? ' (canonical)' : '';
  const spotLabel = triplet.spot
    ? `“${triplet.spot.name}”${triplet.spot.finish ? ` (${triplet.spot.finish})` : ''}, owner-supplied and canonical`
    : 'not supplied';
  return `Print triplet for ${color.id} (${color.role}): screen ${triplet.screen.hex}${screenLabel}; unprofiled CMYK estimate C${cmyk.c} M${cmyk.m} Y${cmyk.y} K${cmyk.k} (total ${formatPercent(total)}); spot ${spotLabel}. ${CMYK_UNPROFILED_DISCLAIMER}`;
}

/**
 * Run every surface check the supplied jobs call for and return a sorted,
 * hash-free list the UI can render. The product screen carries the
 * hero-discipline checks when role bindings are supplied; the marketing screen
 * carries no checks here, because nothing cited applies to it yet.
 */
export function buildSurfaceAdvisoriesV3(
  input: SurfaceAdvisoriesInputV3
): SurfaceAdvisoriesResultV3 {
  const surfaces = surfacesForJobs(input.jobs);
  const textPairs = input.textPairs ?? [];
  const spots = input.spots ?? {};
  assertUniqueIds(
    'color',
    input.colors.map(color => color.id)
  );
  assertUniqueIds(
    'text pair',
    textPairs.map(pair => pair.id)
  );

  const colorIds = new Set(input.colors.map(color => color.id));
  for (const [colorId, spot] of Object.entries(spots)) {
    if (!colorIds.has(colorId)) {
      throw new Error(`Spot color supplied for unknown color id: ${colorId}`);
    }
    assertOwnerSuppliedSpot(spot);
  }

  const limit =
    INK_COVERAGE_LIMITS_V3[input.inkCoverageLimitId ?? DEFAULT_INK_COVERAGE_LIMIT_ID_V3];
  const active = new Set<ColorSystemSurfaceV3>(surfaces);
  const advisories: SurfaceAdvisoryV3[] = [];

  for (const color of input.colors) {
    const normalized = normalizeHexV3(color.hex);
    const drift = screenToPrintDriftAdvisory(normalized);

    if (active.has('print')) {
      const spot = Object.prototype.hasOwnProperty.call(spots, color.id)
        ? spots[color.id]
        : undefined;
      const triplet = printTriplet(normalized, spot);
      advisories.push({
        id: color.id,
        surface: 'print',
        severity: 'info',
        code: 'PRINT_TRIPLET',
        message: tripletMessage(color, triplet),
        evidence: { role: color.role, triplet },
      });

      if (color.cmyk) {
        advisories.push({ id: color.id, ...inkCoverageAdvisory(color.cmyk, limit) });
      } else {
        const estimateCheck = inkCoverageAdvisory(triplet.cmyk, limit);
        if (estimateCheck.severity === 'warning') {
          advisories.push({ id: color.id, ...estimateCheck });
        }
      }
    }

    for (const finding of drift) {
      if (active.has(finding.surface)) {
        advisories.push({ id: color.id, ...finding });
      }
    }
  }

  if (active.has('out-of-home')) {
    for (const pair of textPairs) {
      for (const finding of outOfHomeTextAdvisory(pair.foregroundHex, pair.backgroundHex)) {
        advisories.push({ id: pair.id, ...finding });
      }
    }
  }

  // p3-B: hero discipline is judged where product roles are bound.
  if (active.has('screen-product') && input.heroDiscipline) {
    advisories.push(...heroDisciplineAdvisories(input.heroDiscipline));
  }

  advisories.sort(compareAdvisories);

  const summary: Record<ColorSystemSurfaceV3, { info: number; warning: number; total: number }> = {
    'screen-product': { info: 0, warning: 0, total: 0 },
    'screen-marketing': { info: 0, warning: 0, total: 0 },
    print: { info: 0, warning: 0, total: 0 },
    'out-of-home': { info: 0, warning: 0, total: 0 },
  };
  for (const advisory of advisories) {
    const bucket = summary[advisory.surface];
    bucket[advisory.severity] += 1;
    bucket.total += 1;
  }

  return {
    version: COLOR_SYSTEM_SURFACE_ADVISORIES_V3_SCHEMA_VERSION,
    surfaces,
    advisories,
    summary,
  };
}
