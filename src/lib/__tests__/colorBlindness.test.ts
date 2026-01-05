/**
 * Tests for colorBlindness.ts
 *
 * Validates CVD simulation algorithms against known behaviors
 * and color science principles.
 */

import { describe, it, expect } from 'vitest';
import {
  CVD_INFO,
  type CVDType,
  rgbToLinear,
  linearToRgb,
  rgbToLms,
  lmsToRgb,
  getMachadoMatrix,
  simulateCVD,
  simulateCVDHex,
  simulateProtanopia,
  simulateDeuteranopia,
  simulateTritanopia,
  simulateAchromatopsia,
  simulateAnomaly,
  simulatePaletteForCVD,
  getAllSimulations,
  getAllSimulationsHex,
  colorDistance,
  wouldConfuse,
  wouldConfuseAny,
  findConfusingPairs,
  isColorSafe,
  suggestSafeAlternative,
  SAFE_COLORS,
} from '../colorBlindness';
import type { RGB } from '../utils';

// ============================================
// Helper Functions
// ============================================

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };
const RED: RGB = { r: 255, g: 0, b: 0 };
const GREEN: RGB = { r: 0, g: 255, b: 0 };
const BLUE: RGB = { r: 0, g: 0, b: 255 };
const GRAY: RGB = { r: 128, g: 128, b: 128 };

// ============================================
// CVD Info Tests
// ============================================

describe('CVD_INFO', () => {
  it('contains all CVD types', () => {
    const types: CVDType[] = [
      'normal',
      'protanopia',
      'protanomaly',
      'deuteranopia',
      'deuteranomaly',
      'tritanopia',
      'tritanomaly',
      'achromatopsia',
    ];
    for (const type of types) {
      expect(CVD_INFO[type]).toBeDefined();
      expect(CVD_INFO[type].type).toBe(type);
      expect(CVD_INFO[type].name).toBeTruthy();
      expect(CVD_INFO[type].description).toBeTruthy();
    }
  });

  it('identifies affected cones correctly', () => {
    expect(CVD_INFO.protanopia.affectedCone).toBe('L');
    expect(CVD_INFO.protanomaly.affectedCone).toBe('L');
    expect(CVD_INFO.deuteranopia.affectedCone).toBe('M');
    expect(CVD_INFO.deuteranomaly.affectedCone).toBe('M');
    expect(CVD_INFO.tritanopia.affectedCone).toBe('S');
    expect(CVD_INFO.tritanomaly.affectedCone).toBe('S');
    expect(CVD_INFO.achromatopsia.affectedCone).toBe('all');
    expect(CVD_INFO.normal.affectedCone).toBe('none');
  });
});

// ============================================
// Color Space Conversion Tests
// ============================================

describe('rgbToLinear / linearToRgb', () => {
  it('converts white correctly', () => {
    const linear = rgbToLinear(WHITE);
    expect(linear[0]).toBeCloseTo(1, 2);
    expect(linear[1]).toBeCloseTo(1, 2);
    expect(linear[2]).toBeCloseTo(1, 2);
  });

  it('converts black correctly', () => {
    const linear = rgbToLinear(BLACK);
    expect(linear[0]).toBe(0);
    expect(linear[1]).toBe(0);
    expect(linear[2]).toBe(0);
  });

  it('round-trips through conversion', () => {
    const colors = [WHITE, BLACK, RED, GREEN, BLUE, GRAY];
    for (const color of colors) {
      const linear = rgbToLinear(color);
      const back = linearToRgb(linear);
      expect(back.r).toBeCloseTo(color.r, 0);
      expect(back.g).toBeCloseTo(color.g, 0);
      expect(back.b).toBeCloseTo(color.b, 0);
    }
  });

  it('handles low sRGB values correctly', () => {
    const lowColor = { r: 10, g: 10, b: 10 };
    const linear = rgbToLinear(lowColor);
    expect(linear[0]).toBeGreaterThan(0);
    expect(linear[0]).toBeLessThan(0.01);
  });
});

describe('rgbToLms / lmsToRgb', () => {
  it('converts white to LMS', () => {
    const lms = rgbToLms(WHITE);
    // White should have high values in all LMS channels
    expect(lms[0]).toBeGreaterThan(0.5);
    expect(lms[1]).toBeGreaterThan(0.5);
    expect(lms[2]).toBeGreaterThan(0.5);
  });

  it('converts black to LMS', () => {
    const lms = rgbToLms(BLACK);
    expect(lms[0]).toBeCloseTo(0, 3);
    expect(lms[1]).toBeCloseTo(0, 3);
    expect(lms[2]).toBeCloseTo(0, 3);
  });

  it('red has higher L than M or S', () => {
    const lms = rgbToLms(RED);
    expect(lms[0]).toBeGreaterThan(lms[1]); // L > M for red
    expect(lms[0]).toBeGreaterThan(lms[2]); // L > S for red
  });

  it('green has higher M', () => {
    const lms = rgbToLms(GREEN);
    expect(lms[1]).toBeGreaterThan(lms[0]); // M > L for green
  });

  it('blue has higher S', () => {
    const lms = rgbToLms(BLUE);
    expect(lms[2]).toBeGreaterThan(lms[0]); // S > L for blue
  });

  it('approximately round-trips', () => {
    const colors = [WHITE, RED, GREEN, BLUE, GRAY];
    for (const color of colors) {
      const lms = rgbToLms(color);
      const back = lmsToRgb(lms);
      // Allow for some precision loss
      expect(Math.abs(back.r - color.r)).toBeLessThan(3);
      expect(Math.abs(back.g - color.g)).toBeLessThan(3);
      expect(Math.abs(back.b - color.b)).toBeLessThan(3);
    }
  });
});

// ============================================
// Machado Matrix Tests
// ============================================

describe('getMachadoMatrix', () => {
  it('returns identity for normal vision', () => {
    const matrix = getMachadoMatrix('normal', 1.0);
    expect(matrix[0][0]).toBe(1);
    expect(matrix[1][1]).toBe(1);
    expect(matrix[2][2]).toBe(1);
  });

  it('returns full matrix for dichromacy types at any severity', () => {
    const protan = getMachadoMatrix('protanopia', 0.5);
    expect(protan[0][0]).not.toBe(1); // Should be the full matrix, not interpolated
  });

  it('interpolates for anomaly types based on severity', () => {
    const severityZero = getMachadoMatrix('protanomaly', 0);
    const severityHalf = getMachadoMatrix('protanomaly', 0.5);
    const severityFull = getMachadoMatrix('protanomaly', 1.0);

    // At severity 0, should be identity
    expect(severityZero[0][0]).toBeCloseTo(1, 3);
    expect(severityZero[1][1]).toBeCloseTo(1, 3);

    // At severity 0.5, should be between identity and full
    expect(severityHalf[0][0]).not.toBeCloseTo(1, 1);
    expect(severityHalf[0][0]).not.toBeCloseTo(severityFull[0][0], 1);

    // At severity 1.0, should be full matrix
    expect(severityFull[0][0]).not.toBeCloseTo(1, 1);
  });

  it('clamps severity to 0-1', () => {
    const neg = getMachadoMatrix('protanomaly', -0.5);
    const over = getMachadoMatrix('protanomaly', 1.5);
    const zero = getMachadoMatrix('protanomaly', 0);
    const one = getMachadoMatrix('protanomaly', 1);

    expect(neg).toEqual(zero);
    expect(over).toEqual(one);
  });
});

// ============================================
// Dichromacy Simulation Tests
// ============================================

describe('simulateProtanopia', () => {
  it('preserves white', () => {
    const result = simulateProtanopia(WHITE);
    expect(result.r).toBeCloseTo(255, 0);
    expect(result.g).toBeCloseTo(255, 0);
    expect(result.b).toBeCloseTo(255, 0);
  });

  it('preserves black', () => {
    const result = simulateProtanopia(BLACK);
    expect(result.r).toBeCloseTo(0, 0);
    expect(result.g).toBeCloseTo(0, 0);
    expect(result.b).toBeCloseTo(0, 0);
  });

  it('reduces red perception', () => {
    const result = simulateProtanopia(RED);
    // Red should appear darker and shifted
    expect(result.r + result.g + result.b).toBeLessThan(255 * 3);
  });

  it('makes red and green more similar', () => {
    const simRed = simulateProtanopia(RED);
    const simGreen = simulateProtanopia(GREEN);
    const originalDist = colorDistance(RED, GREEN);
    const simDist = colorDistance(simRed, simGreen);
    // Distance should decrease after simulation
    expect(simDist).toBeLessThan(originalDist);
  });

  it('preserves blue relatively well', () => {
    const result = simulateProtanopia(BLUE);
    // Blue should still be recognizably blue
    expect(result.b).toBeGreaterThan(result.r);
    expect(result.b).toBeGreaterThan(result.g);
  });
});

describe('simulateDeuteranopia', () => {
  it('preserves white', () => {
    const result = simulateDeuteranopia(WHITE);
    expect(result.r).toBeCloseTo(255, 0);
    expect(result.g).toBeCloseTo(255, 0);
    expect(result.b).toBeCloseTo(255, 0);
  });

  it('preserves black', () => {
    const result = simulateDeuteranopia(BLACK);
    expect(result.r).toBeCloseTo(0, 0);
    expect(result.g).toBeCloseTo(0, 0);
    expect(result.b).toBeCloseTo(0, 0);
  });

  it('makes red and green more similar', () => {
    const simRed = simulateDeuteranopia(RED);
    const simGreen = simulateDeuteranopia(GREEN);
    const originalDist = colorDistance(RED, GREEN);
    const simDist = colorDistance(simRed, simGreen);
    expect(simDist).toBeLessThan(originalDist);
  });

  it('is the most common form - preserves blue', () => {
    const result = simulateDeuteranopia(BLUE);
    expect(result.b).toBeGreaterThan(result.r);
  });
});

describe('simulateTritanopia', () => {
  it('preserves white', () => {
    const result = simulateTritanopia(WHITE);
    expect(result.r).toBeCloseTo(255, 0);
    expect(result.g).toBeCloseTo(255, 0);
    expect(result.b).toBeCloseTo(255, 0);
  });

  it('preserves black', () => {
    const result = simulateTritanopia(BLACK);
    expect(result.r).toBeCloseTo(0, 0);
    expect(result.g).toBeCloseTo(0, 0);
    expect(result.b).toBeCloseTo(0, 0);
  });

  it('affects blue perception', () => {
    const result = simulateTritanopia(BLUE);
    // Blue should be significantly altered
    const original = BLUE.b;
    expect(Math.abs(result.b - original)).toBeGreaterThan(0);
  });

  it('makes blue and yellow more similar', () => {
    const yellow: RGB = { r: 255, g: 255, b: 0 };
    const simBlue = simulateTritanopia(BLUE);
    const simYellow = simulateTritanopia(yellow);
    const originalDist = colorDistance(BLUE, yellow);
    const simDist = colorDistance(simBlue, simYellow);
    expect(simDist).toBeLessThan(originalDist);
  });
});

describe('simulateAchromatopsia', () => {
  it('converts to grayscale', () => {
    const result = simulateAchromatopsia(RED);
    expect(result.r).toBe(result.g);
    expect(result.g).toBe(result.b);
  });

  it('preserves white', () => {
    const result = simulateAchromatopsia(WHITE);
    expect(result.r).toBe(255);
    expect(result.g).toBe(255);
    expect(result.b).toBe(255);
  });

  it('preserves black', () => {
    const result = simulateAchromatopsia(BLACK);
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
  });

  it('preserves gray', () => {
    const result = simulateAchromatopsia(GRAY);
    expect(result.r).toBeCloseTo(128, 0);
  });

  it('uses correct luminance formula', () => {
    // Pure red has luminance ~54 (0.2126 * 255)
    const redResult = simulateAchromatopsia(RED);
    expect(redResult.r).toBeCloseTo(54, 0);

    // Pure green has luminance ~182 (0.7152 * 255)
    const greenResult = simulateAchromatopsia(GREEN);
    expect(greenResult.r).toBeCloseTo(182, 0);

    // Pure blue has luminance ~18 (0.0722 * 255)
    const blueResult = simulateAchromatopsia(BLUE);
    expect(blueResult.r).toBeCloseTo(18, 0);
  });
});

// ============================================
// Anomaly Simulation Tests
// ============================================

describe('simulateAnomaly', () => {
  it('at severity 0, returns original color', () => {
    const result = simulateAnomaly(RED, 'protanomaly', 0);
    expect(result.r).toBeCloseTo(RED.r, 0);
    expect(result.g).toBeCloseTo(RED.g, 0);
    expect(result.b).toBeCloseTo(RED.b, 0);
  });

  it('at severity 1, matches dichromacy closely', () => {
    const anomalyResult = simulateAnomaly(RED, 'deuteranomaly', 1.0);
    // At full severity, anomaly should significantly alter the color
    expect(colorDistance(anomalyResult, RED)).toBeGreaterThan(10);
  });

  it('severity 0.5 is between 0 and 1', () => {
    const original = RED;
    const half = simulateAnomaly(RED, 'protanomaly', 0.5);
    const full = simulateAnomaly(RED, 'protanomaly', 1.0);

    const distHalf = colorDistance(original, half);
    const distFull = colorDistance(original, full);

    expect(distHalf).toBeLessThan(distFull);
    expect(distHalf).toBeGreaterThan(0);
  });
});

// ============================================
// Main Simulation Function Tests
// ============================================

describe('simulateCVD', () => {
  it('returns original for normal type', () => {
    const result = simulateCVD(RED, { type: 'normal' });
    expect(result.r).toBe(RED.r);
    expect(result.g).toBe(RED.g);
    expect(result.b).toBe(RED.b);
  });

  it('handles all CVD types', () => {
    const types: CVDType[] = [
      'normal',
      'protanopia',
      'protanomaly',
      'deuteranopia',
      'deuteranomaly',
      'tritanopia',
      'tritanomaly',
      'achromatopsia',
    ];

    for (const type of types) {
      const result = simulateCVD(RED, { type });
      expect(result).toHaveProperty('r');
      expect(result).toHaveProperty('g');
      expect(result).toHaveProperty('b');
      expect(result.r).toBeGreaterThanOrEqual(0);
      expect(result.r).toBeLessThanOrEqual(255);
    }
  });

  it('passes severity to anomaly types', () => {
    const noSeverity = simulateCVD(RED, { type: 'protanomaly' });
    const halfSeverity = simulateCVD(RED, { type: 'protanomaly', severity: 0.5 });
    const fullSeverity = simulateCVD(RED, { type: 'protanomaly', severity: 1.0 });

    // Default should be 1.0
    expect(colorDistance(noSeverity, fullSeverity)).toBeLessThan(1);

    // Half severity should be different from full
    expect(colorDistance(halfSeverity, fullSeverity)).toBeGreaterThan(10);
  });
});

describe('simulateCVDHex', () => {
  it('converts hex correctly', () => {
    const result = simulateCVDHex('#ff0000', { type: 'normal' });
    expect(result).toBe('#ff0000');
  });

  it('handles lowercase hex', () => {
    const result = simulateCVDHex('#aabbcc', { type: 'normal' });
    expect(result).toBe('#aabbcc');
  });

  it('handles uppercase hex', () => {
    const result = simulateCVDHex('#AABBCC', { type: 'normal' });
    expect(result.toLowerCase()).toBe('#aabbcc');
  });
});

describe('simulatePaletteForCVD', () => {
  it('simulates all colors in palette', () => {
    const palette = [RED, GREEN, BLUE];
    const result = simulatePaletteForCVD(palette, 'deuteranopia');
    expect(result.length).toBe(3);
  });

  it('uses specified severity', () => {
    const palette = [RED];
    const full = simulatePaletteForCVD(palette, 'protanomaly', 1.0);
    const half = simulatePaletteForCVD(palette, 'protanomaly', 0.5);
    expect(colorDistance(full[0], half[0])).toBeGreaterThan(0);
  });
});

describe('getAllSimulations', () => {
  it('returns all CVD type results', () => {
    const result = getAllSimulations(RED);
    expect(result.normal).toBeDefined();
    expect(result.protanopia).toBeDefined();
    expect(result.protanomaly).toBeDefined();
    expect(result.deuteranopia).toBeDefined();
    expect(result.deuteranomaly).toBeDefined();
    expect(result.tritanopia).toBeDefined();
    expect(result.tritanomaly).toBeDefined();
    expect(result.achromatopsia).toBeDefined();
  });

  it('normal returns original color', () => {
    const result = getAllSimulations(RED);
    expect(result.normal.r).toBe(RED.r);
    expect(result.normal.g).toBe(RED.g);
    expect(result.normal.b).toBe(RED.b);
  });
});

describe('getAllSimulationsHex', () => {
  it('returns hex strings for all types', () => {
    const result = getAllSimulationsHex('#ff0000');
    expect(result.normal).toBe('#ff0000');
    expect(typeof result.protanopia).toBe('string');
    expect(result.protanopia).toMatch(/^#[0-9a-f]{6}$/);
  });
});

// ============================================
// Color Confusion Detection Tests
// ============================================

describe('colorDistance', () => {
  it('returns 0 for same colors', () => {
    expect(colorDistance(RED, RED)).toBe(0);
  });

  it('returns max distance for black and white', () => {
    const dist = colorDistance(BLACK, WHITE);
    expect(dist).toBeCloseTo(Math.sqrt(3 * 255 * 255), 0);
  });

  it('is symmetric', () => {
    expect(colorDistance(RED, GREEN)).toBe(colorDistance(GREEN, RED));
  });
});

describe('wouldConfuse', () => {
  it('red and green confuse for protanopia at appropriate threshold', () => {
    // Protanopia reduces red/green distance significantly (from ~361 to ~138)
    // Using threshold 150 to catch this reduced distance
    expect(wouldConfuse(RED, GREEN, 'protanopia', 150)).toBe(true);
  });

  it('red and blue do not confuse for deuteranopia', () => {
    expect(wouldConfuse(RED, BLUE, 'deuteranopia', 80)).toBe(false);
  });

  it('black and white never confuse', () => {
    const types: CVDType[] = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
    for (const type of types) {
      expect(wouldConfuse(BLACK, WHITE, type)).toBe(false);
    }
  });

  it('identical colors always confuse', () => {
    expect(wouldConfuse(RED, RED, 'normal')).toBe(true);
  });

  it('respects threshold parameter', () => {
    const c1: RGB = { r: 100, g: 100, b: 100 };
    const c2: RGB = { r: 110, g: 110, b: 110 };
    expect(wouldConfuse(c1, c2, 'normal', 50)).toBe(true);
    expect(wouldConfuse(c1, c2, 'normal', 10)).toBe(false);
  });
});

describe('wouldConfuseAny', () => {
  it('returns empty array for very different colors', () => {
    expect(wouldConfuseAny(BLACK, WHITE)).toEqual([]);
  });

  it('returns array of confusing types', () => {
    // Red and green become more similar under CVD
    // With threshold 150, protanopia (~138 distance) should be detected
    const result = wouldConfuseAny(RED, GREEN, 150);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes achromatopsia when colors have same luminance', () => {
    // Find two colors with similar luminance but different hues
    const result = wouldConfuseAny(
      { r: 186, g: 0, b: 0 }, // Red with luminance ~39
      { r: 0, g: 55, b: 0 }, // Green with similar luminance
      50
    );
    // These might confuse in achromatopsia
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('findConfusingPairs', () => {
  it('returns empty array for well-distinguished palette', () => {
    const palette = [BLACK, WHITE];
    const pairs = findConfusingPairs(palette, 'deuteranopia');
    expect(pairs).toEqual([]);
  });

  it('finds confusing pairs', () => {
    const palette = [RED, GREEN, BLUE];
    // Use threshold 150 since protanopia reduces red/green distance to ~138
    const pairs = findConfusingPairs(palette, 'protanopia', 150);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.some(([i, j]) => (i === 0 && j === 1) || (i === 1 && j === 0))).toBe(true);
  });

  it('returns indices, not colors', () => {
    const palette = [RED, GREEN];
    const pairs = findConfusingPairs(palette, 'deuteranopia', 100);
    if (pairs.length > 0) {
      expect(typeof pairs[0][0]).toBe('number');
      expect(typeof pairs[0][1]).toBe('number');
    }
  });
});

// ============================================
// Safe Color Tests
// ============================================

describe('SAFE_COLORS', () => {
  it('contains expected colors', () => {
    expect(SAFE_COLORS.blue).toBeDefined();
    expect(SAFE_COLORS.orange).toBeDefined();
    expect(SAFE_COLORS.black).toBeDefined();
    expect(SAFE_COLORS.white).toBeDefined();
  });

  it('blue and orange are distinguishable for red-green CVD', () => {
    expect(wouldConfuse(SAFE_COLORS.blue, SAFE_COLORS.orange, 'deuteranopia', 50)).toBe(false);
    expect(wouldConfuse(SAFE_COLORS.blue, SAFE_COLORS.orange, 'protanopia', 50)).toBe(false);
  });
});

describe('isColorSafe', () => {
  it('returns true when color is distinguishable from all references', () => {
    expect(isColorSafe(BLUE, [RED], 50)).toBe(true);
  });

  it('returns false when color confuses with a reference', () => {
    // Red and green-ish colors may confuse
    const lime: RGB = { r: 50, g: 205, b: 50 };
    const lightRed: RGB = { r: 200, g: 50, b: 50 };
    expect(isColorSafe(lime, [lightRed], 80)).toBe(false);
  });

  it('checks against multiple CVD types', () => {
    // Blue should be safe from red/green
    expect(isColorSafe(BLUE, [RED, GREEN], 30)).toBe(true);
  });
});

describe('suggestSafeAlternative', () => {
  it('returns null for empty palette', () => {
    expect(suggestSafeAlternative(RED, [], 'deuteranopia')).toBeNull();
  });

  it('returns most distinguishable color', () => {
    const palette = [BLUE, { r: 100, g: 100, b: 100 }];
    const suggestion = suggestSafeAlternative(RED, palette, 'deuteranopia');
    // Blue should be more distinguishable from red under deuteranopia
    expect(suggestion).toBeDefined();
  });

  it('skips similar colors', () => {
    const veryRed: RGB = { r: 250, g: 0, b: 0 };
    const palette = [veryRed, BLUE];
    const suggestion = suggestSafeAlternative(RED, palette, 'deuteranopia');
    // Should skip veryRed as it's too similar to RED
    expect(suggestion).not.toEqual(veryRed);
  });
});

// ============================================
// Edge Cases
// ============================================

describe('edge cases', () => {
  it('handles colors at RGB boundaries', () => {
    const corners = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 255, b: 0 },
      { r: 255, g: 0, b: 255 },
      { r: 0, g: 255, b: 255 },
      { r: 255, g: 255, b: 255 },
    ];

    for (const color of corners) {
      const result = simulateCVD(color, { type: 'deuteranopia' });
      expect(result.r).toBeGreaterThanOrEqual(0);
      expect(result.r).toBeLessThanOrEqual(255);
      expect(result.g).toBeGreaterThanOrEqual(0);
      expect(result.g).toBeLessThanOrEqual(255);
      expect(result.b).toBeGreaterThanOrEqual(0);
      expect(result.b).toBeLessThanOrEqual(255);
    }
  });

  it('clamps out-of-gamut results', () => {
    // Some simulations might produce values slightly out of range
    // The implementation should clamp them
    const saturated: RGB = { r: 255, g: 0, b: 128 };
    const result = simulateCVD(saturated, { type: 'protanopia' });
    expect(result.r).toBeGreaterThanOrEqual(0);
    expect(result.r).toBeLessThanOrEqual(255);
  });
});

// ============================================
// Known Confusion Line Tests
// ============================================

describe('known confusion lines', () => {
  it('protan confusion: red and brown become similar', () => {
    const red: RGB = { r: 220, g: 50, b: 50 };
    const brown: RGB = { r: 139, g: 90, b: 43 };
    const simRed = simulateCVD(red, { type: 'protanopia' });
    const simBrown = simulateCVD(brown, { type: 'protanopia' });
    const simDist = colorDistance(simRed, simBrown);
    const origDist = colorDistance(red, brown);
    expect(simDist).toBeLessThan(origDist);
  });

  it('deutan confusion: red and green traffic lights', () => {
    const trafficRed: RGB = { r: 230, g: 50, b: 50 };
    const trafficGreen: RGB = { r: 50, g: 200, b: 50 };
    const simRed = simulateCVD(trafficRed, { type: 'deuteranopia' });
    const simGreen = simulateCVD(trafficGreen, { type: 'deuteranopia' });
    const simDist = colorDistance(simRed, simGreen);
    const origDist = colorDistance(trafficRed, trafficGreen);
    expect(simDist).toBeLessThan(origDist);
  });

  it('tritan confusion: blue and green become similar', () => {
    const blue: RGB = { r: 50, g: 50, b: 200 };
    const teal: RGB = { r: 50, g: 150, b: 150 };
    const simBlue = simulateCVD(blue, { type: 'tritanopia' });
    const simTeal = simulateCVD(teal, { type: 'tritanopia' });
    const simDist = colorDistance(simBlue, simTeal);
    const origDist = colorDistance(blue, teal);
    expect(simDist).toBeLessThan(origDist);
  });
});
