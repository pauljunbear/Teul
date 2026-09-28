/**
 * Tests for colorSystemSurfaceAdvisoriesV3.ts
 *
 * Semantic assertions only: what each check claims, what it refuses to claim,
 * and that the aggregate is deterministic and fully cited.
 */

import { describe, expect, it } from 'vitest';
import type { ColorSystemJobV2 } from '../colorSystemBuilderV2Contracts';
import {
  CMYK_UNPROFILED_DISCLAIMER,
  COLOR_SYSTEM_PROPORTION_RULE_V3,
  COLOR_SYSTEM_PROPORTION_TIERS_V3,
  COLOR_SYSTEM_SURFACES_V3,
  COLOR_SYSTEM_SURFACE_ADVISORIES_V3_SCHEMA_VERSION,
  DEFAULT_INK_COVERAGE_LIMIT_ID_V3,
  HERO_DISCIPLINE_STATEMENT_V3,
  INK_COVERAGE_LIMITS_V3,
  OAAA_FONT_SIZE_TABLE_V3,
  SURFACES_BY_JOB_V3,
  SURFACE_ADVISORY_CODES_V3,
  SURFACE_ADVISORY_CONSTANTS_V3,
  SURFACE_ADVISORY_SOURCES_V3,
  TEUL_POLICY_DEFAULT_CITATION,
  buildSurfaceAdvisoriesV3,
  estimateCmykUnprofiled,
  heroDisciplineAdvisories,
  inkCoverageAdvisory,
  minimumLetterHeightCm,
  outOfHomeTextAdvisory,
  printTriplet,
  screenToPrintDriftAdvisory,
  surfacesForJob,
  surfacesForJobs,
  totalInkCoverage,
  type ColorSystemSurfaceV3,
  type HeroDisciplineInputV3,
  type OwnerSuppliedCmykV3,
  type OwnerSuppliedSpotColor,
  type SurfaceAdvisoriesInputV3,
} from '../colorSystemSurfaceAdvisoriesV3';

const ALL_JOBS = [
  'brand-primary',
  'marketing-accent',
  'product-graphics',
  'functional-iconography',
  'product-ui-surface',
  'product-semantics',
  'categorical-data',
  'sequential-data',
  'diverging-data',
  'rendered-text-pair',
] as const satisfies readonly ColorSystemJobV2[];

const OWNER_SPOT: OwnerSuppliedSpotColor = {
  system: 'pantone',
  name: 'Owner Blue (from the brand’s print standard)',
  finish: 'coated',
  source: 'owner-supplied',
};

function ownerCmyk(c: number, m: number, y: number, k: number): OwnerSuppliedCmykV3 {
  return { c, m, y, k, source: 'owner-supplied' };
}

// ============================================
// Surface model
// ============================================

describe('surfacesForJob', () => {
  it.each<[ColorSystemJobV2, readonly ColorSystemSurfaceV3[]]>([
    ['brand-primary', ['screen-product', 'screen-marketing', 'print', 'out-of-home']],
    ['marketing-accent', ['screen-marketing', 'print', 'out-of-home']],
    ['product-graphics', ['screen-product']],
    ['functional-iconography', ['screen-product']],
    ['product-ui-surface', ['screen-product']],
    ['product-semantics', ['screen-product']],
    ['categorical-data', ['screen-product', 'screen-marketing']],
    ['sequential-data', ['screen-product', 'screen-marketing']],
    ['diverging-data', ['screen-product', 'screen-marketing']],
    ['rendered-text-pair', ['screen-product', 'screen-marketing', 'print', 'out-of-home']],
  ])('maps %s to its surfaces', (job, expected) => {
    expect([...surfacesForJob(job)]).toEqual(expected);
  });

  it('covers every builder job exactly once', () => {
    expect(Object.keys(SURFACES_BY_JOB_V3).sort()).toEqual([...ALL_JOBS].sort());
  });

  it('fails closed on an unknown job', () => {
    expect(() => surfacesForJob('poster-ink' as ColorSystemJobV2)).toThrow(
      /Unknown color-system job/
    );
  });

  it('unions job surfaces in canonical order without duplicates', () => {
    expect([...surfacesForJobs(['product-semantics', 'categorical-data'])]).toEqual([
      'screen-product',
      'screen-marketing',
    ]);
    expect([...surfacesForJobs(['marketing-accent', 'product-ui-surface'])]).toEqual([
      ...COLOR_SYSTEM_SURFACES_V3,
    ]);
    expect(surfacesForJobs([])).toEqual([]);
  });
});

// ============================================
// Unprofiled CMYK estimate
// ============================================

describe('estimateCmykUnprofiled', () => {
  it.each([
    ['pure red', '#FF0000', { c: 0, m: 100, y: 100, k: 0 }],
    ['pure green', '#00FF00', { c: 100, m: 0, y: 100, k: 0 }],
    ['pure blue', '#0000FF', { c: 100, m: 100, y: 0, k: 0 }],
    ['black', '#000000', { c: 0, m: 0, y: 0, k: 100 }],
    ['white', '#FFFFFF', { c: 0, m: 0, y: 0, k: 0 }],
    ['mid gray', '#808080', { c: 0, m: 0, y: 0, k: 50 }],
    ['mid blue', '#336699', { c: 67, m: 33, y: 0, k: 40 }],
  ])('estimates %s with the naive formula as whole percentages', (_label, hex, expected) => {
    const estimate = estimateCmykUnprofiled(hex);
    expect({ c: estimate.c, m: estimate.m, y: estimate.y, k: estimate.k }).toEqual(expected);
    expect(estimate.hex).toBe(hex);
    for (const value of [estimate.c, estimate.m, estimate.y, estimate.k]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(Object.is(value, -0)).toBe(false);
    }
  });

  it('labels itself as an unprofiled estimate and never as a build', () => {
    const estimate = estimateCmykUnprofiled('#336699');
    expect(estimate.method).toBe('unprofiled-naive-estimate');
    expect(estimate.disclaimer).toBe(
      'Unprofiled estimate for orientation only. A profiled conversion (for example ISO Coated v2 / FOGRA39) will differ, and CMYK cannot reproduce many saturated screen colors.'
    );
    expect(CMYK_UNPROFILED_DISCLAIMER).toBe(estimate.disclaimer);
    expect(JSON.stringify(estimate)).not.toMatch(/\bbuild\b/i);
  });

  it('normalizes shorthand and lowercase hex before estimating', () => {
    expect(estimateCmykUnprofiled('#369')).toEqual(estimateCmykUnprofiled('#336699'));
    expect(estimateCmykUnprofiled('336699').hex).toBe('#336699');
    expect(estimateCmykUnprofiled(' #ff0000 ').hex).toBe('#FF0000');
  });

  it('rejects malformed hex', () => {
    expect(() => estimateCmykUnprofiled('#12345')).toThrow(/Invalid hex color/);
    expect(() => estimateCmykUnprofiled('blue')).toThrow(/Invalid hex color/);
  });
});

// ============================================
// Total ink coverage
// ============================================

describe('totalInkCoverage and inkCoverageAdvisory', () => {
  it('sums the four channels in percent', () => {
    expect(totalInkCoverage({ c: 67, m: 33, y: 0, k: 40 })).toBe(140);
    expect(totalInkCoverage({ c: 100, m: 100, y: 100, k: 100 })).toBe(400);
    expect(totalInkCoverage({ c: 12.5, m: 0.2, y: 0, k: 0 })).toBe(12.7);
  });

  it('rejects channels outside 0–100', () => {
    expect(() => totalInkCoverage({ c: 101, m: 0, y: 0, k: 0 })).toThrow(/channel C/);
    expect(() => totalInkCoverage({ c: 0, m: -1, y: 0, k: 0 })).toThrow(/channel M/);
    expect(() => totalInkCoverage({ c: 0, m: 0, y: Number.NaN, k: 0 })).toThrow(/channel Y/);
  });

  it('defaults to the ECI “ISO Coated v2 300% (ECI)” condition and names it', () => {
    const limit = INK_COVERAGE_LIMITS_V3[DEFAULT_INK_COVERAGE_LIMIT_ID_V3];
    expect(limit.percent).toBe(300);
    expect(limit.pressCondition).toContain('ISO Coated v2 300% (ECI)');
    expect(limit.pressCondition).toContain('FOGRA39L');
    expect(limit.citation).toBe('https://eci.org/doku.php?id=en:colorstandards:offset');
  });

  it('warns when an owner-supplied rich black exceeds the default limit', () => {
    const finding = inkCoverageAdvisory(ownerCmyk(90, 80, 70, 100));
    expect(finding.surface).toBe('print');
    expect(finding.severity).toBe('warning');
    expect(finding.code).toBe('PRINT_INK_COVERAGE_EXCEEDS_LIMIT');
    expect(finding.message).toContain('340%');
    expect(finding.message).toContain('300%');
    expect(finding.message).toContain('ISO Coated v2 300% (ECI)');
    expect(finding.message).toContain('owner-supplied');
    expect(finding.evidence).toMatchObject({
      basis: 'owner-supplied',
      totalPercent: 340,
      limitPercent: 300,
      limitId: 'iso-coated-v2-300-eci',
    });
  });

  it('reports an owner-supplied value within the limit as info', () => {
    const finding = inkCoverageAdvisory(ownerCmyk(60, 40, 40, 100));
    expect(finding.severity).toBe('info');
    expect(finding.code).toBe('PRINT_INK_COVERAGE_WITHIN_LIMIT');
    expect(finding.message).toContain('240%');
    expect(finding.evidence.totalPercent).toBe(240);
  });

  it('applies the opt-in 330% coated condition when asked', () => {
    const limit = INK_COVERAGE_LIMITS_V3['iso-coated-v2-eci'];
    expect(inkCoverageAdvisory(ownerCmyk(80, 80, 60, 100), limit).severity).toBe('info');
    expect(inkCoverageAdvisory(ownerCmyk(90, 80, 70, 100), limit).severity).toBe('warning');
    expect(inkCoverageAdvisory(ownerCmyk(90, 80, 70, 100), limit).message).toContain(
      'ISO Coated v2 (ECI)'
    );
  });

  it('accepts a bare numeric limit and says no press condition is assumed', () => {
    const finding = inkCoverageAdvisory(ownerCmyk(60, 60, 60, 80), 250);
    expect(finding.severity).toBe('warning');
    expect(finding.message).toContain('260%');
    expect(finding.message).toContain('no stated press condition');
    expect(finding.evidence.limitId).toBe('caller-supplied');
    expect(() => inkCoverageAdvisory(ownerCmyk(0, 0, 0, 0), 0)).toThrow(/positive percentage/);
  });

  it('says an estimate-based total tends to understate ink and never calls it a build', () => {
    const finding = inkCoverageAdvisory(estimateCmykUnprofiled('#0B3D91'));
    expect(finding.evidence.basis).toBe('unprofiled-naive-estimate');
    expect(finding.message).toContain('understate');
    expect(finding.message).not.toMatch(/\bbuild\b/i);
  });

  it('never exceeds 300% for a naive estimate, so the default check only bites on owner values', () => {
    let maximum = 0;
    for (let red = 0; red < 256; red += 15) {
      for (let green = 0; green < 256; green += 15) {
        for (let blue = 0; blue < 256; blue += 15) {
          const hex = `#${[red, green, blue].map(v => v.toString(16).padStart(2, '0')).join('')}`;
          const total = totalInkCoverage(estimateCmykUnprofiled(hex));
          expect(total).toBeLessThanOrEqual(300);
          maximum = Math.max(maximum, total);
        }
      }
    }
    expect(maximum).toBeGreaterThan(250);
    expect(inkCoverageAdvisory(estimateCmykUnprofiled('#00000F')).severity).toBe('info');
  });
});

// ============================================
// Screen → print drift
// ============================================

describe('screenToPrintDriftAdvisory', () => {
  it.each([
    ['pure red', '#FF0000', ['PRINT_SATURATED_SCREEN_COLOR']],
    [
      'pure yellow',
      '#FFFF00',
      ['PRINT_SATURATED_SCREEN_COLOR', 'PRINT_PALE_TINT_DROPOUT', 'OOH_PALE_TINT_GROUND'],
    ],
    ['white', '#FFFFFF', ['PRINT_PALE_TINT_DROPOUT', 'OOH_PALE_TINT_GROUND']],
    ['beige', '#F5F5DC', ['PRINT_PALE_TINT_DROPOUT', 'OOH_PALE_TINT_GROUND']],
    ['mid gray', '#808080', []],
    ['silver', '#C0C0C0', []],
    ['deep blue', '#0B3D91', []],
  ])('flags %s with the expected codes', (_label, hex, codes) => {
    const findings = screenToPrintDriftAdvisory(hex);
    expect(findings.map(finding => finding.code)).toEqual(codes);
    for (const finding of findings) {
      expect(finding.severity).toBe('warning');
      expect(finding.evidence.hex).toBe(hex);
      expect(finding.evidence.citation).toBe(TEUL_POLICY_DEFAULT_CITATION);
    }
  });

  it('compares thresholds on the raw OKLCH values, not the rounded display values', () => {
    // #FF6A00 sits at chroma 0.2012: above 0.20 raw, but rounds to 0.201 in the message.
    const [saturated] = screenToPrintDriftAdvisory('#FF6A00');
    expect(saturated.code).toBe('PRINT_SATURATED_SCREEN_COLOR');
    expect(saturated.message).toContain('OKLCH chroma 0.201');
  });

  it('carries the X-Rite gamut note as context only, not as a number about the color', () => {
    const [saturated] = screenToPrintDriftAdvisory('#0000FF');
    expect(saturated.evidence.context).toBe(
      'it provides a very limited gamut and can only hit about half of PANTONE MATCHING SYSTEM® Colors'
    );
    expect(saturated.evidence.contextCitation).toBe(
      'https://www.xrite.com/blog/pantone-extended-gamut-guide-helps-printers'
    );
    expect(saturated.message).not.toMatch(/half|50 ?%/i);
  });

  it('warns that pale tints fail in print and on boards', () => {
    const findings = screenToPrintDriftAdvisory('#FFFFFF');
    const print = findings.find(finding => finding.surface === 'print');
    const board = findings.find(finding => finding.surface === 'out-of-home');
    expect(print?.message).toMatch(/drop out in print and on digital boards/);
    expect(board?.message).toMatch(/avoid it as an out-of-home ground/);
    expect(print?.evidence.lightnessThreshold).toBe(0.9);
  });
});

// ============================================
// Out-of-home legibility
// ============================================

describe('outOfHomeTextAdvisory', () => {
  it.each([
    ['black on white', '#000000', '#FFFFFF', 21, 'OOH_TEXT_CONTRAST_MEETS_MINIMUM', true],
    ['gray on white', '#777777', '#FFFFFF', 4.48, 'OOH_TEXT_CONTRAST_BELOW_MINIMUM', true],
    ['white on charcoal', '#FFFFFF', '#1F2933', 14.76, 'OOH_TEXT_CONTRAST_MEETS_MINIMUM', false],
    [
      'charcoal on near-white',
      '#1F2933',
      '#F7F7F7',
      13.77,
      'OOH_TEXT_CONTRAST_MEETS_MINIMUM',
      true,
    ],
    [
      'charcoal on light gray',
      '#1F2933',
      '#EEEEEE',
      12.72,
      'OOH_TEXT_CONTRAST_MEETS_MINIMUM',
      false,
    ],
  ])('judges %s', (_label, foreground, background, ratio, code, whiteGround) => {
    const findings = outOfHomeTextAdvisory(foreground, background);
    const contrast = findings[0];
    expect(contrast.surface).toBe('out-of-home');
    expect(contrast.code).toBe(code);
    expect(contrast.severity).toBe(code === 'OOH_TEXT_CONTRAST_MEETS_MINIMUM' ? 'info' : 'warning');
    expect(contrast.evidence.ratio).toBeCloseTo(ratio, 2);
    expect(contrast.evidence.minimumRatio).toBe(4.5);
    expect(contrast.evidence.citation).toBe(TEUL_POLICY_DEFAULT_CITATION);
    expect(contrast.message).toContain('4.5:1');

    const ground = findings.find(finding => finding.code === 'OOH_DIGITAL_BOARD_WHITE_GROUND');
    expect(ground !== undefined).toBe(whiteGround);
    if (ground) {
      expect(ground.severity).toBe('warning');
      expect(ground.message).toContain('pull an all-white ground to a light gray');
      expect(ground.message).toContain('“make the white a 10% black”');
      expect(ground.evidence.recommendationPercentBlack).toBe(10);
      expect(ground.evidence.citation).toBe(
        'https://oaaa.org/wp-content/uploads/2022/09/OAAA-Best-Practices-oct20-2021-spreads_2_.pdf'
      );
      expect(ground.evidence.quoteLocation).toContain('printed folio 24');
    }
  });

  it('does not suggest a replacement hex for the light gray', () => {
    const ground = outOfHomeTextAdvisory('#000000', '#FFFFFF').find(
      finding => finding.code === 'OOH_DIGITAL_BOARD_WHITE_GROUND'
    );
    expect(ground).toBeDefined();
    expect(ground?.message.match(/#[0-9A-F]{6}/g)).toEqual(['#FFFFFF']);
  });
});

// ============================================
// Letter height by viewing distance
// ============================================

describe('minimumLetterHeightCm', () => {
  it('carries the seven OAAA rows verbatim', () => {
    expect(OAAA_FONT_SIZE_TABLE_V3.map(row => row.verbatim)).toEqual([
      '5’-50’ Malls, Airports 1”- 2”',
      '50’-100’ Window, Street Furniture 2”-4”',
      '100’-200’ Posters, Surface Streets 4”-8”',
      '200’-350’ Highway Bulletins, Walls 8”-15”',
      '350’-500’ Highways 15”-20”',
      '500’-600’ Highways 20”-24”',
      '600’+ Highways 24”-40”',
    ]);
  });

  it.each([
    ['a mall concourse', 5, 16.4, 'Malls, Airports', 2.5, 5.1],
    ['a street-furniture panel', 30, 98.4, 'Window, Street Furniture', 5.1, 10.2],
    ['a poster across the street', 45, 147.6, 'Posters, Surface Streets', 10.2, 20.3],
    ['a highway bulletin', 100, 328.1, 'Highway Bulletins, Walls', 20.3, 38.1],
    ['a far highway board', 200, 656.2, 'Highways', 61, 101.6],
  ])('sizes letters for %s', (_label, meters, feet, mediaType, minimumCm, maximumCm) => {
    const guidance = minimumLetterHeightCm(meters);
    expect(guidance).not.toBeNull();
    expect(guidance?.viewingDistanceFeet).toBeCloseTo(feet, 1);
    expect(guidance?.mediaType).toBe(mediaType);
    expect(guidance?.minimumCm).toBeCloseTo(minimumCm, 1);
    expect(guidance?.maximumCm).toBeCloseTo(maximumCm, 1);
    expect(guidance?.citation).toMatch(/^https:\/\/oaaa\.org\//);
    expect(guidance?.note).toContain('more easily read at the following scales');
  });

  it('uses half-open distance ranges', () => {
    expect(minimumLetterHeightCm(15.2)?.mediaType).toBe('Malls, Airports');
    expect(minimumLetterHeightCm(15.25)?.mediaType).toBe('Window, Street Furniture');
  });

  it('returns null below the table and rejects nonsense', () => {
    expect(minimumLetterHeightCm(1)).toBeNull();
    expect(minimumLetterHeightCm(0)).toBeNull();
    expect(() => minimumLetterHeightCm(-1)).toThrow(/non-negative/);
    expect(() => minimumLetterHeightCm(Number.NaN)).toThrow(/non-negative/);
  });
});

// ============================================
// Print triplet
// ============================================

describe('printTriplet', () => {
  it('makes the screen value canonical and names no spot when none is supplied', () => {
    const triplet = printTriplet('#0b3d91');
    expect(triplet.spot).toBeNull();
    expect(triplet.canonical).toBe('screen');
    expect(triplet.screen.hex).toBe('#0B3D91');
    expect(triplet.screen.oklch).toEqual({ l: 0.386, c: 0.148, h: 260.7 });
    expect(triplet.cmyk).toEqual(estimateCmykUnprofiled('#0B3D91'));
    expect(triplet.note).toContain('screen value #0B3D91 is canonical');
    expect(triplet.note).toContain('does not look up, generate or guess');
    const serialized = JSON.stringify(triplet);
    expect(serialized).not.toMatch(/pantone/i);
    expect(serialized).not.toMatch(/\bbuild\b/i);
  });

  it('makes an owner-supplied spot canonical and states the drift', () => {
    const triplet = printTriplet('#0B3D91', OWNER_SPOT);
    expect(triplet.spot).toEqual(OWNER_SPOT);
    expect(triplet.canonical).toBe('spot');
    expect(triplet.note).toContain(
      '“Owner Blue (from the brand’s print standard)” (coated) is canonical'
    );
    expect(triplet.note).toMatch(/will drift/);
  });

  it('refuses spots that are not owner-supplied or are unnamed', () => {
    expect(() =>
      printTriplet('#0B3D91', { ...OWNER_SPOT, source: 'looked-up' as 'owner-supplied' })
    ).toThrow(/owner-supplied/);
    expect(() => printTriplet('#0B3D91', { ...OWNER_SPOT, name: '   ' })).toThrow(/name/);
    expect(() => printTriplet('#0B3D91', { ...OWNER_SPOT, finish: 'matte' as 'coated' })).toThrow(
      /finish/
    );
  });
});

// ============================================
// Aggregate
// ============================================

const BRAND_INPUT: SurfaceAdvisoriesInputV3 = {
  jobs: ['brand-primary'],
  colors: [
    { id: 'primary', hex: '#0B3D91', role: 'primary' },
    { id: 'accent', hex: '#FFFF00', role: 'accent' },
    { id: 'paper', hex: '#FFFFFF', role: 'ground', cmyk: ownerCmyk(0, 0, 0, 0) },
    { id: 'rich-black', hex: '#000000', role: 'ink', cmyk: ownerCmyk(100, 100, 100, 100) },
  ],
  textPairs: [
    { id: 'headline-on-paper', foregroundHex: '#0B3D91', backgroundHex: '#FFFFFF' },
    { id: 'body-on-dark', foregroundHex: '#FFFFFF', backgroundHex: '#1F2933' },
  ],
  spots: { primary: OWNER_SPOT },
};

describe('buildSurfaceAdvisoriesV3', () => {
  it('reaches no print or board checks for product-only jobs', () => {
    const result = buildSurfaceAdvisoriesV3({
      jobs: ['product-semantics', 'functional-iconography'],
      colors: [{ id: 'danger', hex: '#FF0000', role: 'negative' }],
      textPairs: [{ id: 'label', foregroundHex: '#777777', backgroundHex: '#FFFFFF' }],
    });
    expect(result.version).toBe(COLOR_SYSTEM_SURFACE_ADVISORIES_V3_SCHEMA_VERSION);
    expect(result.surfaces).toEqual(['screen-product']);
    expect(result.advisories).toEqual([]);
    expect(result.summary).toEqual({
      'screen-product': { info: 0, warning: 0, total: 0 },
      'screen-marketing': { info: 0, warning: 0, total: 0 },
      print: { info: 0, warning: 0, total: 0 },
      'out-of-home': { info: 0, warning: 0, total: 0 },
    });
  });

  it('emits the expected advisories for a brand palette', () => {
    const result = buildSurfaceAdvisoriesV3(BRAND_INPUT);
    expect(result.surfaces).toEqual([...COLOR_SYSTEM_SURFACES_V3]);

    const codesById = (id: string) =>
      result.advisories.filter(advisory => advisory.id === id).map(advisory => advisory.code);
    expect(codesById('primary')).toEqual(['PRINT_TRIPLET']);
    expect(codesById('accent')).toEqual([
      'PRINT_PALE_TINT_DROPOUT',
      'PRINT_SATURATED_SCREEN_COLOR',
      'PRINT_TRIPLET',
      'OOH_PALE_TINT_GROUND',
    ]);
    expect(codesById('paper')).toEqual([
      'PRINT_INK_COVERAGE_WITHIN_LIMIT',
      'PRINT_PALE_TINT_DROPOUT',
      'PRINT_TRIPLET',
      'OOH_PALE_TINT_GROUND',
    ]);
    expect(codesById('rich-black')).toEqual(['PRINT_INK_COVERAGE_EXCEEDS_LIMIT', 'PRINT_TRIPLET']);
    expect(codesById('headline-on-paper')).toEqual([
      'OOH_DIGITAL_BOARD_WHITE_GROUND',
      'OOH_TEXT_CONTRAST_MEETS_MINIMUM',
    ]);
    expect(codesById('body-on-dark')).toEqual(['OOH_TEXT_CONTRAST_MEETS_MINIMUM']);

    expect(result.summary).toEqual({
      'screen-product': { info: 0, warning: 0, total: 0 },
      'screen-marketing': { info: 0, warning: 0, total: 0 },
      print: { info: 5, warning: 4, total: 9 },
      'out-of-home': { info: 2, warning: 3, total: 5 },
    });
    expect(result.advisories).toHaveLength(14);

    for (const advisory of result.advisories) {
      expect(SURFACE_ADVISORY_CODES_V3).toContain(advisory.code);
      expect(result.surfaces).toContain(advisory.surface);
      expect(['info', 'warning']).toContain(advisory.severity);
      expect(advisory.message.length).toBeGreaterThan(0);
    }
  });

  it('sorts by surface, then id, then code', () => {
    const result = buildSurfaceAdvisoriesV3(BRAND_INPUT);
    const keys = result.advisories.map(
      advisory =>
        `${COLOR_SYSTEM_SURFACES_V3.indexOf(advisory.surface)}|${advisory.id}|${advisory.code}`
    );
    expect(keys).toEqual([...keys].sort());
  });

  it('is deterministic under reordered input', () => {
    const shuffled: SurfaceAdvisoriesInputV3 = {
      ...BRAND_INPUT,
      jobs: ['product-semantics', 'brand-primary'],
      colors: [...BRAND_INPUT.colors].reverse(),
      textPairs: [...(BRAND_INPUT.textPairs ?? [])].reverse(),
    };
    expect(buildSurfaceAdvisoriesV3(shuffled)).toEqual(buildSurfaceAdvisoriesV3(BRAND_INPUT));
    expect(JSON.stringify(buildSurfaceAdvisoriesV3(shuffled))).toBe(
      JSON.stringify(buildSurfaceAdvisoriesV3(BRAND_INPUT))
    );
  });

  it('puts the triplet in evidence with the owner spot canonical only where supplied', () => {
    const result = buildSurfaceAdvisoriesV3(BRAND_INPUT);
    const triplets = result.advisories.filter(advisory => advisory.code === 'PRINT_TRIPLET');
    const primary = triplets.find(advisory => advisory.id === 'primary');
    const accent = triplets.find(advisory => advisory.id === 'accent');
    expect(primary?.evidence).toMatchObject({
      role: 'primary',
      triplet: { canonical: 'spot', spot: OWNER_SPOT },
    });
    expect(primary?.message).toContain(
      '“Owner Blue (from the brand’s print standard)” (coated), owner-supplied and canonical'
    );
    expect(accent?.evidence).toMatchObject({ triplet: { canonical: 'screen', spot: null } });
    expect(accent?.message).toContain('spot not supplied');
    expect(accent?.message).toContain('unprofiled CMYK estimate C0 M0 Y100 K0 (total 100%)');
    expect(accent?.message).toContain(CMYK_UNPROFILED_DISCLAIMER);
  });

  it('never writes a spot name or number when the owner supplied none', () => {
    const result = buildSurfaceAdvisoriesV3({ ...BRAND_INPUT, spots: undefined });
    for (const advisory of result.advisories) {
      expect(advisory.message).not.toMatch(/pantone/i);
      expect(advisory.message).not.toMatch(/\bbuild\b/i);
      const { context, contextCitation, ...evidenceWithoutContext } = advisory.evidence;
      expect(JSON.stringify(evidenceWithoutContext)).not.toMatch(/pantone/i);
      if (context !== undefined) {
        // Context is always a verbatim quote from the sources registry, paired
        // with the URL it was fetched from.
        const source = Object.values(SURFACE_ADVISORY_SOURCES_V3).find(
          candidate => candidate.citation === contextCitation
        );
        expect(source, `${advisory.code} context citation`).toBeDefined();
        expect(source?.quotes.map(quote => quote.text)).toContain(context);
        // The only allowed mention of a spot system is X-Rite's own sentence
        // about the CMYK gamut.
        if (/pantone/i.test(String(context))) {
          expect(contextCitation).toBe(
            SURFACE_ADVISORY_SOURCES_V3['xrite-extended-gamut'].citation
          );
        }
      }
    }
  });

  it('runs the ink check on owner values, and on estimates only when they exceed the limit', () => {
    const result = buildSurfaceAdvisoriesV3(BRAND_INPUT);
    const inkCodes = result.advisories
      .filter(advisory => advisory.code.startsWith('PRINT_INK_COVERAGE'))
      .map(advisory => `${advisory.id}:${advisory.code}:${advisory.evidence.basis}`);
    expect(inkCodes).toEqual([
      'paper:PRINT_INK_COVERAGE_WITHIN_LIMIT:owner-supplied',
      'rich-black:PRINT_INK_COVERAGE_EXCEEDS_LIMIT:owner-supplied',
    ]);
  });

  it('honours the opt-in ink-coverage condition', () => {
    const result = buildSurfaceAdvisoriesV3({
      ...BRAND_INPUT,
      inkCoverageLimitId: 'iso-coated-v2-eci',
      colors: [{ id: 'deep', hex: '#0B3D91', role: 'primary', cmyk: ownerCmyk(90, 80, 60, 90) }],
      textPairs: [],
      spots: undefined,
    });
    const ink = result.advisories.find(advisory => advisory.code.startsWith('PRINT_INK_COVERAGE'));
    expect(ink?.code).toBe('PRINT_INK_COVERAGE_WITHIN_LIMIT');
    expect(ink?.evidence).toMatchObject({ limitPercent: 330, limitId: 'iso-coated-v2-eci' });
  });

  it('fails closed on duplicate ids, unknown spot targets and bad spots', () => {
    expect(() =>
      buildSurfaceAdvisoriesV3({
        jobs: ['brand-primary'],
        colors: [
          { id: 'a', hex: '#000000', role: 'ink' },
          { id: 'a', hex: '#FFFFFF', role: 'paper' },
        ],
      })
    ).toThrow(/Duplicate color id: a/);
    expect(() =>
      buildSurfaceAdvisoriesV3({
        jobs: ['brand-primary'],
        colors: [{ id: 'a', hex: '#000000', role: 'ink' }],
        textPairs: [
          { id: 'p', foregroundHex: '#000000', backgroundHex: '#FFFFFF' },
          { id: 'p', foregroundHex: '#FFFFFF', backgroundHex: '#000000' },
        ],
      })
    ).toThrow(/Duplicate text pair id: p/);
    expect(() =>
      buildSurfaceAdvisoriesV3({
        jobs: ['brand-primary'],
        colors: [{ id: 'a', hex: '#000000', role: 'ink' }],
        spots: { missing: OWNER_SPOT },
      })
    ).toThrow(/unknown color id: missing/);
    expect(() =>
      buildSurfaceAdvisoriesV3({
        jobs: ['brand-primary'],
        colors: [{ id: 'a', hex: '#000000', role: 'ink' }],
        spots: { a: { ...OWNER_SPOT, source: 'guessed' as 'owner-supplied' } },
      })
    ).toThrow(/owner-supplied/);
  });
});

// ============================================
// Provenance
// ============================================

describe('provenance', () => {
  const isAcceptableCitation = (citation: string) =>
    citation.length > 0 &&
    (citation.startsWith('https://') || citation === TEUL_POLICY_DEFAULT_CITATION);

  it('cites every constant with a fetched URL or an explicit Teul policy default', () => {
    const entries = Object.entries(SURFACE_ADVISORY_CONSTANTS_V3);
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, constant] of entries) {
      expect(isAcceptableCitation(constant.citation), id).toBe(true);
      expect(Number.isFinite(constant.value), id).toBe(true);
      expect(constant.unit.length, id).toBeGreaterThan(0);
      expect(constant.rationale.length, id).toBeGreaterThan(0);
      if (constant.sourceId !== null) {
        expect(Object.keys(SURFACE_ADVISORY_SOURCES_V3), id).toContain(constant.sourceId);
      }
      if (constant.citation !== TEUL_POLICY_DEFAULT_CITATION) {
        expect(constant.sourceId, id).not.toBeNull();
        expect(
          SURFACE_ADVISORY_SOURCES_V3[constant.sourceId as keyof typeof SURFACE_ADVISORY_SOURCES_V3]
            .citation,
          id
        ).toBe(constant.citation);
      }
    }
  });

  it('records a fetch date and at least one located quote for every source', () => {
    for (const [id, source] of Object.entries(SURFACE_ADVISORY_SOURCES_V3)) {
      expect(source.citation.startsWith('https://'), id).toBe(true);
      expect(source.fetchedOn, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(source.quotes.length, id).toBeGreaterThan(0);
      for (const quote of source.quotes) {
        expect(quote.text.length, id).toBeGreaterThan(0);
        expect(quote.location.length, id).toBeGreaterThan(0);
      }
    }
  });

  it('cites every ink-coverage limit', () => {
    for (const [id, limit] of Object.entries(INK_COVERAGE_LIMITS_V3)) {
      expect(isAcceptableCitation(limit.citation), id).toBe(true);
      expect(limit.pressCondition.length, id).toBeGreaterThan(0);
      expect(limit.percent, id).toBeGreaterThan(0);
    }
  });

  it('labels the judgment thresholds as Teul policy defaults', () => {
    for (const id of [
      'saturated-screen-chroma-threshold',
      'pale-tint-lightness-threshold',
      'out-of-home-text-minimum-contrast',
      'out-of-home-near-white-lightness-threshold',
      'hero-meaning-role-share-limit',
      'hero-surface-role-share-limit',
    ] as const) {
      expect(SURFACE_ADVISORY_CONSTANTS_V3[id].citation).toBe(TEUL_POLICY_DEFAULT_CITATION);
    }
    expect(SURFACE_ADVISORY_CONSTANTS_V3['hero-meaning-role-share-limit'].value).toBe(1);
    expect(SURFACE_ADVISORY_CONSTANTS_V3['hero-surface-role-share-limit'].value).toBe(1);
  });
});

// ============================================
// Hero-color discipline (p3-B)
// ============================================

const HERO_INPUT: HeroDisciplineInputV3 = {
  colors: [
    { id: 'sky', hex: '#5683D2', role: 'Sky', hero: true, jobs: ['product-semantics'] },
    {
      id: 'coral',
      hex: '#E0563C',
      role: 'Coral',
      hero: false,
      jobs: ['marketing-accent', 'product-ui-surface'],
    },
    { id: 'stone', hex: '#8A8A8A', role: 'Stone', hero: false, jobs: ['product-ui-surface'] },
  ],
  bindings: [
    { role: 'background', mode: 'Light', colorId: 'stone' },
    { role: 'surface', mode: 'Light', colorId: 'stone' },
    { role: 'focus', mode: 'Light', colorId: 'sky' },
    { role: 'success', mode: 'Light', colorId: 'coral' },
  ],
};

const HERO_LABEL = `${HERO_DISCIPLINE_STATEMENT_V3} (${TEUL_POLICY_DEFAULT_CITATION}.)`;

describe('heroDisciplineAdvisories', () => {
  it('stays silent when the neutral carries the surfaces and the hero carries one role', () => {
    expect(heroDisciplineAdvisories(HERO_INPUT)).toEqual([]);
    expect(HERO_DISCIPLINE_STATEMENT_V3).toBe(
      'The primary is your hero. Keep it for emphasis; the neutral ramp carries surfaces.'
    );
  });

  it('warns when a large fill resolves to the hero or to a brand-surface color', () => {
    const findings = heroDisciplineAdvisories({
      ...HERO_INPUT,
      bindings: [
        { role: 'border', mode: 'Light', colorId: 'sky' },
        { role: 'surface', mode: 'Dark', colorId: 'coral' },
        { role: 'background', mode: 'Light', colorId: 'sky' },
      ],
    });
    const wash = findings.filter(finding => finding.code === 'HERO_AS_WASH');
    expect(wash.map(finding => [finding.id, finding.severity, finding.surface])).toEqual([
      ['coral', 'warning', 'screen-product'],
      ['sky', 'warning', 'screen-product'],
    ]);
    expect(wash[1].message).toBe(
      `Light background resolves to the hero family “Sky” (#5683D2), a large fill. ${HERO_LABEL}`
    );
    expect(wash[0].message).toBe(
      `Dark surface resolves to “Coral”, which carries the marketing-accent job (#E0563C), a large fill. ${HERO_LABEL}`
    );
    expect(wash[0].evidence).toMatchObject({
      hero: false,
      brandSurfaceJob: 'marketing-accent',
      citation: TEUL_POLICY_DEFAULT_CITATION,
    });
    // A border is not a wash, but background plus border is two surface roles on the hero.
    const share = findings.filter(finding => finding.code === 'HERO_SHARE_EXCEEDED');
    expect(share).toHaveLength(1);
    expect(share[0]).toMatchObject({ id: 'sky', severity: 'info', surface: 'screen-product' });
    expect(share[0].message).toContain(
      'carries 2 product surface roles (background, border); Teul’s declared share is 1.'
    );
  });

  it('notes the hero’s share when it carries more than one meaning role in a mode', () => {
    const findings = heroDisciplineAdvisories({
      ...HERO_INPUT,
      bindings: [
        { role: 'selected', mode: 'Light', colorId: 'sky' },
        { role: 'focus', mode: 'Light', colorId: 'sky' },
        { role: 'link', mode: 'Light', colorId: 'sky' },
        { role: 'focus', mode: 'Dark', colorId: 'sky' },
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: 'HERO_SHARE_EXCEEDED',
      severity: 'info',
      id: 'sky',
      surface: 'screen-product',
    });
    expect(findings[0].message).toBe(
      `In Light the hero family “Sky” (#5683D2) carries 3 meaning roles (focus, link, selected); Teul’s declared share is 1. ${HERO_LABEL}`
    );
    expect(findings[0].evidence).toMatchObject({
      mode: 'Light',
      roles: ['focus', 'link', 'selected'],
      limit: 1,
      citation: TEUL_POLICY_DEFAULT_CITATION,
    });
  });

  it('ignores a non-hero color on meaning roles and fails closed on unknown or duplicate colors', () => {
    expect(
      heroDisciplineAdvisories({
        ...HERO_INPUT,
        bindings: [
          { role: 'focus', mode: 'Light', colorId: 'coral' },
          { role: 'selected', mode: 'Light', colorId: 'coral' },
        ],
      })
    ).toEqual([]);
    expect(() =>
      heroDisciplineAdvisories({
        ...HERO_INPUT,
        bindings: [{ role: 'background', mode: 'Light', colorId: 'ghost' }],
      })
    ).toThrow(/unknown color id: ghost/);
    expect(() =>
      heroDisciplineAdvisories({
        colors: [HERO_INPUT.colors[0], HERO_INPUT.colors[0]],
        bindings: [],
      })
    ).toThrow(/Duplicate hero-discipline color id/);
  });

  it('runs through the aggregate only when the product screen is active', () => {
    const heroDiscipline: HeroDisciplineInputV3 = {
      colors: [HERO_INPUT.colors[0]],
      bindings: [{ role: 'background', mode: 'Light', colorId: 'sky' }],
    };
    const colors = [{ id: 'sky', hex: '#5683D2', role: 'Sky' }];
    const product = buildSurfaceAdvisoriesV3({
      jobs: ['product-semantics'],
      colors,
      heroDiscipline,
    });
    expect(product.advisories.map(advisory => advisory.code)).toEqual(['HERO_AS_WASH']);
    expect(product.summary['screen-product']).toEqual({ info: 0, warning: 1, total: 1 });
    const marketing = buildSurfaceAdvisoriesV3({
      jobs: ['marketing-accent'],
      colors,
      heroDiscipline,
    });
    expect(marketing.advisories.some(advisory => advisory.code.startsWith('HERO_'))).toBe(false);
    const withoutBindings = buildSurfaceAdvisoriesV3({ jobs: ['product-semantics'], colors });
    expect(withoutBindings.advisories).toEqual([]);
  });
});

// ============================================
// Declared proportion rule (p3-B)
// ============================================

describe('COLOR_SYSTEM_PROPORTION_RULE_V3', () => {
  const rule = COLOR_SYSTEM_PROPORTION_RULE_V3;

  it('declares its authority, four tiers in order, and Teul’s shares', () => {
    expect(rule.authority).toBe('teul-policy-default');
    expect(rule.tiers.map(tier => tier.tier)).toEqual([...COLOR_SYSTEM_PROPORTION_TIERS_V3]);
    expect(rule.tiers.map(tier => tier.share)).toEqual([
      '60–80 %',
      '≤ 20 %',
      '≤ 10 % each',
      'status only',
    ]);
    // The neutral tier owns every structural role; status stays status; the hero's tier
    // is the emphasis roles the composer actually gives it.
    expect(rule.tiers[0].roles).toEqual(['background', 'surface', 'text', 'border', 'disabled']);
    expect(rule.tiers[1].roles).toEqual(['brand-primary', 'focus', 'selected', 'link']);
    expect(rule.tiers[3].roles).toEqual([
      'success',
      'warning',
      'error',
      'destructive',
      'information',
    ]);
    for (const tier of rule.tiers) expect(tier.roles.length).toBeGreaterThan(0);
    expect(rule.statement).toContain('60–80 %');
    expect(rule.statement).toContain('at most 20 %');
    expect(rule.statement).toContain('Teul’s policy default');
    expect(rule.note).toBe(
      'Change this rule if your brand guideline states another; Teul does not infer proportion from the file.'
    );
  });

  it('lists the compared sources by description and invents no URL', () => {
    expect(rule.sources).toHaveLength(5);
    for (const source of rule.sources) {
      expect(source.label.length).toBeGreaterThan(0);
      expect('url' in source).toBe(false);
    }
    const labels = rule.sources.map(source => source.label).join(' | ');
    expect(labels).toContain('80% neutral foundation, 20% signature color');
    expect(labels).toContain('60% primary, 30% secondary, 10% accent');
    expect(labels).toContain('primary 75 %, secondary 25 %');
    expect(labels).toContain('White 60 %, Green 30 %, Black 10 %');
    expect(labels).toContain('no 60-30-10');
    expect(rule.sourcesNote).toContain('no link is given');
  });
});
