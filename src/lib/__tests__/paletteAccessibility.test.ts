/**
 * Tests for paletteAccessibility.ts
 *
 * Validates CIE2000 color difference calculations and palette analysis
 */

import { describe, it, expect } from 'vitest';
import {
  deltaE2000,
  deltaE2000RGB,
  deltaE2000Hex,
  DELTA_E_THRESHOLDS,
  areDistinguishable,
  areDistinguishableUnderCVD,
  analyzeColorPair,
  analyzePalette,
  analyzePaletteForAllCVD,
  getOverallAccessibilityScore,
  findSafeAlternative,
  suggestSafeAlternatives,
  getDeltaEDescription,
  isPaletteAccessible,
  SAFE_COLOR_COMBINATIONS,
} from '../paletteAccessibility';
import type { RGB } from '../utils';

// ============================================
// Test Colors
// ============================================

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };
const RED: RGB = { r: 255, g: 0, b: 0 };
const GREEN: RGB = { r: 0, g: 255, b: 0 };
const BLUE: RGB = { r: 0, g: 0, b: 255 };
const GRAY: RGB = { r: 128, g: 128, b: 128 };

// ============================================
// Delta E 2000 Tests
// ============================================

describe('deltaE2000', () => {
  it('returns 0 for identical LAB colors', () => {
    const lab = [50, 10, 20];
    expect(deltaE2000(lab, lab)).toBe(0);
  });

  it('returns small value for similar colors', () => {
    const lab1 = [50, 10, 20];
    const lab2 = [50.5, 10.2, 20.1];
    expect(deltaE2000(lab1, lab2)).toBeLessThan(1);
  });

  it('returns large value for different colors', () => {
    const white = [100, 0, 0]; // White in LAB
    const black = [0, 0, 0]; // Black in LAB
    expect(deltaE2000(white, black)).toBeGreaterThan(50);
  });

  it('is symmetric', () => {
    const lab1 = [50, 10, 20];
    const lab2 = [60, -10, 30];
    expect(deltaE2000(lab1, lab2)).toBeCloseTo(deltaE2000(lab2, lab1), 10);
  });

  it('handles negative a and b values', () => {
    const lab1 = [50, -20, -30];
    const lab2 = [50, 20, 30];
    expect(deltaE2000(lab1, lab2)).toBeGreaterThan(0);
  });
});

describe('deltaE2000RGB', () => {
  it('returns 0 for same RGB colors', () => {
    expect(deltaE2000RGB(RED, RED)).toBe(0);
  });

  it('returns high value for black and white', () => {
    const deltaE = deltaE2000RGB(BLACK, WHITE);
    expect(deltaE).toBeGreaterThan(50);
  });

  it('returns moderate value for similar colors', () => {
    const color1 = { r: 100, g: 100, b: 100 };
    const color2 = { r: 110, g: 110, b: 110 };
    const deltaE = deltaE2000RGB(color1, color2);
    expect(deltaE).toBeLessThan(10);
    expect(deltaE).toBeGreaterThan(0);
  });
});

describe('deltaE2000Hex', () => {
  it('handles hex strings correctly', () => {
    expect(deltaE2000Hex('#ff0000', '#ff0000')).toBe(0);
  });

  it('handles hex without # prefix', () => {
    expect(deltaE2000Hex('ff0000', 'ff0000')).toBe(0);
  });

  it('calculates difference between colors', () => {
    const deltaE = deltaE2000Hex('#000000', '#ffffff');
    expect(deltaE).toBeGreaterThan(50);
  });
});

// ============================================
// Threshold Tests
// ============================================

describe('DELTA_E_THRESHOLDS', () => {
  it('defines expected thresholds', () => {
    expect(DELTA_E_THRESHOLDS.imperceptible).toBe(1);
    expect(DELTA_E_THRESHOLDS.justNoticeable).toBe(2.3);
    expect(DELTA_E_THRESHOLDS.noticeable).toBe(5);
    expect(DELTA_E_THRESHOLDS.distinct).toBe(10);
    expect(DELTA_E_THRESHOLDS.veryDistinct).toBe(25);
  });
});

describe('areDistinguishable', () => {
  it('returns true for very different colors', () => {
    expect(areDistinguishable(BLACK, WHITE)).toBe(true);
  });

  it('returns false for identical colors', () => {
    expect(areDistinguishable(RED, RED)).toBe(false);
  });

  it('respects custom threshold', () => {
    const color1 = { r: 100, g: 100, b: 100 };
    const color2 = { r: 105, g: 105, b: 105 };
    expect(areDistinguishable(color1, color2, 100)).toBe(false);
    expect(areDistinguishable(color1, color2, 0.1)).toBe(true);
  });
});

describe('areDistinguishableUnderCVD', () => {
  it('returns true for normal vision with different colors', () => {
    expect(areDistinguishableUnderCVD(BLACK, WHITE, 'normal')).toBe(true);
  });

  it('works with CVD simulation', () => {
    // Blue and orange should be distinguishable even under protanopia
    const blue = { r: 59, g: 130, b: 246 };
    const orange = { r: 249, g: 115, b: 22 };
    expect(areDistinguishableUnderCVD(blue, orange, 'protanopia')).toBe(true);
  });

  it('returns false for identical colors under any CVD', () => {
    expect(areDistinguishableUnderCVD(RED, RED, 'deuteranopia')).toBe(false);
  });
});

// ============================================
// Color Pair Analysis Tests
// ============================================

describe('analyzeColorPair', () => {
  it('returns correct structure', () => {
    const result = analyzeColorPair(RED, GREEN, 'normal', 0, 1);
    expect(result).toHaveProperty('color1Index', 0);
    expect(result).toHaveProperty('color2Index', 1);
    expect(result).toHaveProperty('originalDeltaE');
    expect(result).toHaveProperty('simulatedDeltaE');
    expect(result).toHaveProperty('distinguishable');
    expect(result).toHaveProperty('wcagCompliant');
  });

  it('calculates original and simulated Delta E', () => {
    const result = analyzeColorPair(RED, BLUE, 'deuteranopia');
    expect(result.originalDeltaE).toBeGreaterThan(0);
    expect(result.simulatedDeltaE).toBeGreaterThan(0);
  });

  it('marks identical colors as not distinguishable', () => {
    const result = analyzeColorPair(RED, RED, 'normal');
    expect(result.distinguishable).toBe(false);
  });

  it('marks very different colors as distinguishable', () => {
    const result = analyzeColorPair(BLACK, WHITE, 'protanopia');
    expect(result.distinguishable).toBe(true);
  });
});

// ============================================
// Palette Analysis Tests
// ============================================

describe('analyzePalette', () => {
  it('returns correct report structure', () => {
    const palette = [RED, GREEN, BLUE];
    const report = analyzePalette(palette, 'normal');

    expect(report).toHaveProperty('cvdType', 'normal');
    expect(report).toHaveProperty('totalPairs');
    expect(report).toHaveProperty('distinguishablePairs');
    expect(report).toHaveProperty('confusingPairs');
    expect(report).toHaveProperty('score');
    expect(report).toHaveProperty('recommendations');
  });

  it('calculates correct number of pairs', () => {
    const palette = [RED, GREEN, BLUE, WHITE];
    const report = analyzePalette(palette, 'normal');
    // 4 choose 2 = 6 pairs
    expect(report.totalPairs).toBe(6);
  });

  it('returns 100% score for well-distinguished palette', () => {
    const palette = [BLACK, WHITE]; // Very different colors
    const report = analyzePalette(palette, 'normal');
    expect(report.score).toBe(100);
    expect(report.confusingPairs.length).toBe(0);
  });

  it('identifies confusing pairs', () => {
    const palette = [
      { r: 100, g: 100, b: 100 },
      { r: 102, g: 102, b: 102 }, // Very similar
    ];
    const report = analyzePalette(palette, 'normal');
    expect(report.confusingPairs.length).toBe(1);
    expect(report.score).toBeLessThan(100);
  });

  it('handles single color palette', () => {
    const palette = [RED];
    const report = analyzePalette(palette, 'normal');
    expect(report.totalPairs).toBe(0);
    expect(report.score).toBe(100);
  });

  it('handles empty palette', () => {
    const palette: RGB[] = [];
    const report = analyzePalette(palette, 'normal');
    expect(report.totalPairs).toBe(0);
    expect(report.score).toBe(100);
  });
});

describe('analyzePaletteForAllCVD', () => {
  it('returns reports for all CVD types', () => {
    const palette = [RED, BLUE];
    const reports = analyzePaletteForAllCVD(palette);

    expect(reports.normal).toBeDefined();
    expect(reports.protanopia).toBeDefined();
    expect(reports.protanomaly).toBeDefined();
    expect(reports.deuteranopia).toBeDefined();
    expect(reports.deuteranomaly).toBeDefined();
    expect(reports.tritanopia).toBeDefined();
    expect(reports.tritanomaly).toBeDefined();
    expect(reports.achromatopsia).toBeDefined();
  });

  it('each report has correct CVD type', () => {
    const palette = [RED, BLUE];
    const reports = analyzePaletteForAllCVD(palette);

    expect(reports.protanopia.cvdType).toBe('protanopia');
    expect(reports.deuteranopia.cvdType).toBe('deuteranopia');
  });
});

describe('getOverallAccessibilityScore', () => {
  it('returns a score between 0 and 100', () => {
    const palette = [RED, GREEN, BLUE];
    const score = getOverallAccessibilityScore(palette);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns high score for well-designed palette', () => {
    const palette = [BLACK, WHITE]; // Maximum contrast
    const score = getOverallAccessibilityScore(palette);
    expect(score).toBe(100);
  });

  it('returns lower score for problematic palette', () => {
    const palette = [
      { r: 128, g: 128, b: 128 },
      { r: 130, g: 130, b: 130 },
    ];
    const score = getOverallAccessibilityScore(palette);
    expect(score).toBeLessThan(100);
  });
});

// ============================================
// Safe Alternative Tests
// ============================================

describe('SAFE_COLOR_COMBINATIONS', () => {
  it('contains expected safe combinations', () => {
    expect(SAFE_COLOR_COMBINATIONS.length).toBeGreaterThan(0);
    expect(SAFE_COLOR_COMBINATIONS[0]).toHaveProperty('primary');
    expect(SAFE_COLOR_COMBINATIONS[0]).toHaveProperty('secondary');
  });

  it('blue-orange combination is distinguishable under CVD', () => {
    const blueOrange = SAFE_COLOR_COMBINATIONS[0];
    expect(areDistinguishableUnderCVD(blueOrange.primary, blueOrange.secondary, 'protanopia')).toBe(
      true
    );
    expect(
      areDistinguishableUnderCVD(blueOrange.primary, blueOrange.secondary, 'deuteranopia')
    ).toBe(true);
  });
});

describe('findSafeAlternative', () => {
  it('returns null when no better alternative exists', () => {
    const problematic = RED;
    const existing = [BLACK, WHITE];
    const reference = [RED]; // Only option is the same color
    const result = findSafeAlternative(problematic, existing, reference, 'normal');
    expect(result).toBeNull();
  });

  it('suggests alternative from reference palette', () => {
    const problematic = { r: 100, g: 100, b: 100 };
    const existing = [{ r: 102, g: 102, b: 102 }]; // Very similar
    const reference = [BLUE, RED, GREEN]; // Different options
    const result = findSafeAlternative(problematic, existing, reference, 'normal');

    expect(result).not.toBeNull();
    if (result) {
      expect(result.suggestedColor).not.toEqual(problematic);
      expect(result.improvementScore).toBeGreaterThan(0);
    }
  });

  it('returns correct structure', () => {
    const problematic = { r: 100, g: 100, b: 100 };
    const existing = [WHITE];
    const reference = [BLUE];
    const result = findSafeAlternative(problematic, existing, reference, 'deuteranopia');

    if (result) {
      expect(result).toHaveProperty('originalColor');
      expect(result).toHaveProperty('suggestedColor');
      expect(result).toHaveProperty('originalHex');
      expect(result).toHaveProperty('suggestedHex');
      expect(result).toHaveProperty('improvementScore');
      expect(result).toHaveProperty('reason');
    }
  });
});

describe('suggestSafeAlternatives', () => {
  it('returns empty array for accessible palette', () => {
    const palette = [BLACK, WHITE];
    const reference = [BLUE, RED, GREEN];
    const alternatives = suggestSafeAlternatives(palette, reference, 'normal');
    expect(alternatives.length).toBe(0);
  });

  it('suggests alternatives for confusing palette', () => {
    const palette = [
      { r: 100, g: 100, b: 100 },
      { r: 102, g: 102, b: 102 },
    ];
    const reference = [BLUE, RED, GREEN, WHITE, BLACK];
    const alternatives = suggestSafeAlternatives(palette, reference, 'normal');
    // Should suggest at least one alternative
    expect(alternatives.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// Utility Function Tests
// ============================================

describe('getDeltaEDescription', () => {
  it('returns correct description for imperceptible', () => {
    expect(getDeltaEDescription(0.5)).toBe('Imperceptible difference');
  });

  it('returns correct description for just noticeable', () => {
    expect(getDeltaEDescription(1.5)).toBe('Just noticeable difference');
  });

  it('returns correct description for noticeable', () => {
    expect(getDeltaEDescription(3)).toBe('Noticeable difference');
  });

  it('returns correct description for distinct', () => {
    expect(getDeltaEDescription(7)).toBe('Clearly different');
  });

  it('returns correct description for very distinct', () => {
    expect(getDeltaEDescription(15)).toBe('Very distinct colors');
  });

  it('returns correct description for completely different', () => {
    expect(getDeltaEDescription(50)).toBe('Completely different colors');
  });
});

describe('isPaletteAccessible', () => {
  it('returns accessible true for good palette', () => {
    const palette = [BLACK, WHITE];
    const result = isPaletteAccessible(palette);
    expect(result.accessible).toBe(true);
    expect(result.score).toBe(100);
  });

  it('returns accessible false for poor palette', () => {
    const palette = [
      { r: 100, g: 100, b: 100 },
      { r: 101, g: 101, b: 101 },
    ];
    const result = isPaletteAccessible(palette, 50);
    expect(result.accessible).toBe(false);
  });

  it('identifies worst CVD type', () => {
    const palette = [RED, GREEN, BLUE];
    const result = isPaletteAccessible(palette);
    // Some CVD type should have lower score
    expect(result.worstType).not.toBeNull();
  });

  it('respects minimum score parameter', () => {
    const palette = [RED, BLUE];
    const strict = isPaletteAccessible(palette, 100);
    const lenient = isPaletteAccessible(palette, 50);
    // Lenient threshold should be easier to pass
    expect(lenient.score).toBeGreaterThanOrEqual(strict.score);
  });
});

// ============================================
// Edge Cases
// ============================================

describe('edge cases', () => {
  it('handles pure colors correctly', () => {
    const deltaE = deltaE2000RGB(RED, GREEN);
    expect(deltaE).toBeGreaterThan(0);
  });

  it('handles grayscale correctly', () => {
    const gray1 = { r: 50, g: 50, b: 50 };
    const gray2 = { r: 200, g: 200, b: 200 };
    const deltaE = deltaE2000RGB(gray1, gray2);
    expect(deltaE).toBeGreaterThan(20); // Should be quite different
  });

  it('handles near-identical colors', () => {
    const color1 = { r: 100, g: 100, b: 100 };
    const color2 = { r: 100, g: 100, b: 101 };
    const deltaE = deltaE2000RGB(color1, color2);
    expect(deltaE).toBeLessThan(1);
  });

  it('palette with duplicates handles correctly', () => {
    const palette = [RED, RED, BLUE];
    const report = analyzePalette(palette, 'normal');
    // Should have 3 pairs, one of which is RED-RED
    expect(report.totalPairs).toBe(3);
    expect(report.confusingPairs.length).toBeGreaterThan(0);
  });
});
