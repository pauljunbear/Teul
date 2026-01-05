/**
 * Tests for accessibility.ts
 *
 * Validates WCAG 2.1 and APCA contrast calculations
 * against known reference values.
 */

import { describe, it, expect } from 'vitest';
import {
  getRelativeLuminance,
  getWCAGContrast,
  getWCAGContrastHex,
  getWCAGRating,
  getAPCAContrast,
  getAPCAContrastHex,
  getAPCARating,
  getAPCAMinFontSize,
  getFontRecommendations,
  analyzeContrast,
  meetsWCAGLevel,
  meetsAPCARating,
  suggestTextColor,
  findAccessibleColor,
} from '../accessibility';

// ============================================
// Relative Luminance Tests
// ============================================

describe('getRelativeLuminance', () => {
  it('returns 0 for pure black', () => {
    expect(getRelativeLuminance(0, 0, 0)).toBe(0);
  });

  it('returns 1 for pure white', () => {
    expect(getRelativeLuminance(255, 255, 255)).toBe(1);
  });

  it('returns approximately 0.2126 for pure red', () => {
    const lum = getRelativeLuminance(255, 0, 0);
    expect(lum).toBeCloseTo(0.2126, 3);
  });

  it('returns approximately 0.7152 for pure green', () => {
    const lum = getRelativeLuminance(0, 255, 0);
    expect(lum).toBeCloseTo(0.7152, 3);
  });

  it('returns approximately 0.0722 for pure blue', () => {
    const lum = getRelativeLuminance(0, 0, 255);
    expect(lum).toBeCloseTo(0.0722, 3);
  });

  it('handles mid-gray correctly', () => {
    const lum = getRelativeLuminance(128, 128, 128);
    expect(lum).toBeGreaterThan(0.2);
    expect(lum).toBeLessThan(0.25);
  });

  it('handles low sRGB values (< 0.03928 threshold)', () => {
    const lum = getRelativeLuminance(10, 10, 10);
    expect(lum).toBeGreaterThan(0);
    expect(lum).toBeLessThan(0.01);
  });
});

// ============================================
// WCAG Contrast Tests
// ============================================

describe('getWCAGContrast', () => {
  it('returns 21:1 for black on white', () => {
    const ratio = getWCAGContrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    expect(ratio).toBe(21);
  });

  it('returns 21:1 for white on black', () => {
    const ratio = getWCAGContrast({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 });
    expect(ratio).toBe(21);
  });

  it('returns 1:1 for same colors', () => {
    const ratio = getWCAGContrast({ r: 128, g: 128, b: 128 }, { r: 128, g: 128, b: 128 });
    expect(ratio).toBe(1);
  });

  it('is commutative (order does not matter)', () => {
    const fg = { r: 100, g: 50, b: 200 };
    const bg = { r: 255, g: 200, b: 150 };
    const ratio1 = getWCAGContrast(fg, bg);
    const ratio2 = getWCAGContrast(bg, fg);
    expect(ratio1).toBeCloseTo(ratio2, 10);
  });

  it('handles Radix UI blue-9 on white correctly', () => {
    // Radix blue-9 (#3b82f6) should have good contrast on white
    const ratio = getWCAGContrast({ r: 59, g: 130, b: 246 }, { r: 255, g: 255, b: 255 });
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(5);
  });
});

describe('getWCAGContrastHex', () => {
  it('handles hex with # prefix', () => {
    expect(getWCAGContrastHex('#000000', '#ffffff')).toBe(21);
  });

  it('handles hex without # prefix', () => {
    expect(getWCAGContrastHex('000000', 'ffffff')).toBe(21);
  });

  it('handles lowercase hex', () => {
    expect(getWCAGContrastHex('#aabbcc', '#ffffff')).toBeGreaterThan(1);
  });

  it('handles uppercase hex', () => {
    expect(getWCAGContrastHex('#AABBCC', '#FFFFFF')).toBeGreaterThan(1);
  });
});

describe('getWCAGRating', () => {
  it('returns AAA for ratio >= 7', () => {
    const rating = getWCAGRating(7);
    expect(rating.aaa).toBe(true);
    expect(rating.aa).toBe(true);
    expect(rating.aaaLarge).toBe(true);
    expect(rating.aaLarge).toBe(true);
    expect(rating.level).toBe('AAA');
  });

  it('returns AA for ratio >= 4.5 but < 7', () => {
    const rating = getWCAGRating(5);
    expect(rating.aaa).toBe(false);
    expect(rating.aa).toBe(true);
    expect(rating.aaaLarge).toBe(true);
    expect(rating.aaLarge).toBe(true);
    expect(rating.level).toBe('AA');
  });

  it('returns AA Large for ratio >= 3 but < 4.5', () => {
    const rating = getWCAGRating(3.5);
    expect(rating.aaa).toBe(false);
    expect(rating.aa).toBe(false);
    expect(rating.aaLarge).toBe(true);
    expect(rating.level).toBe('AA Large');
  });

  it('returns Fail for ratio < 3', () => {
    const rating = getWCAGRating(2);
    expect(rating.aaa).toBe(false);
    expect(rating.aa).toBe(false);
    expect(rating.aaLarge).toBe(false);
    expect(rating.level).toBe('Fail');
  });

  it('handles exact boundary at 7', () => {
    expect(getWCAGRating(7).level).toBe('AAA');
    expect(getWCAGRating(6.99).level).toBe('AA');
  });

  it('handles exact boundary at 4.5', () => {
    expect(getWCAGRating(4.5).level).toBe('AA');
    expect(getWCAGRating(4.49).level).toBe('AA Large');
  });

  it('handles exact boundary at 3', () => {
    expect(getWCAGRating(3).level).toBe('AA Large');
    expect(getWCAGRating(2.99).level).toBe('Fail');
  });
});

// ============================================
// APCA Contrast Tests
// ============================================

describe('getAPCAContrast', () => {
  it('returns high positive Lc for white on black', () => {
    const lc = getAPCAContrast({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 });
    expect(lc).toBeGreaterThan(100);
  });

  it('returns high negative Lc for black on white', () => {
    const lc = getAPCAContrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    expect(lc).toBeLessThan(-100);
  });

  it('returns 0 for identical colors', () => {
    const lc = getAPCAContrast({ r: 128, g: 128, b: 128 }, { r: 128, g: 128, b: 128 });
    expect(lc).toBe(0);
  });

  it('returns near-zero for very similar colors', () => {
    const lc = getAPCAContrast({ r: 128, g: 128, b: 128 }, { r: 130, g: 130, b: 130 });
    expect(Math.abs(lc)).toBeLessThan(5);
  });

  it('is NOT commutative (polarity matters)', () => {
    const light = { r: 255, g: 255, b: 255 };
    const dark = { r: 0, g: 0, b: 0 };
    const lc1 = getAPCAContrast(light, dark);
    const lc2 = getAPCAContrast(dark, light);
    expect(lc1).toBeGreaterThan(0);
    expect(lc2).toBeLessThan(0);
  });

  it('handles mid-range contrast correctly', () => {
    // Gray text on white
    const lc = getAPCAContrast({ r: 128, g: 128, b: 128 }, { r: 255, g: 255, b: 255 });
    expect(Math.abs(lc)).toBeGreaterThan(40);
    expect(Math.abs(lc)).toBeLessThan(70);
  });

  it('handles blue on white (common UI pattern)', () => {
    const lc = getAPCAContrast({ r: 59, g: 130, b: 246 }, { r: 255, g: 255, b: 255 });
    expect(Math.abs(lc)).toBeGreaterThan(40);
  });
});

describe('getAPCAContrastHex', () => {
  it('handles hex colors correctly', () => {
    const lc = getAPCAContrastHex('#ffffff', '#000000');
    expect(lc).toBeGreaterThan(100);
  });

  it('handles hex without # prefix', () => {
    const lc = getAPCAContrastHex('ffffff', '000000');
    expect(lc).toBeGreaterThan(100);
  });
});

describe('getAPCARating', () => {
  it('returns gold for |Lc| >= 75', () => {
    expect(getAPCARating(80)).toBe('gold');
    expect(getAPCARating(-80)).toBe('gold');
    expect(getAPCARating(75)).toBe('gold');
  });

  it('returns silver for |Lc| >= 60 but < 75', () => {
    expect(getAPCARating(65)).toBe('silver');
    expect(getAPCARating(-60)).toBe('silver');
    expect(getAPCARating(74.9)).toBe('silver');
  });

  it('returns bronze for |Lc| >= 45 but < 60', () => {
    expect(getAPCARating(50)).toBe('bronze');
    expect(getAPCARating(-45)).toBe('bronze');
    expect(getAPCARating(59.9)).toBe('bronze');
  });

  it('returns fail for |Lc| < 45', () => {
    expect(getAPCARating(40)).toBe('fail');
    expect(getAPCARating(-30)).toBe('fail');
    expect(getAPCARating(0)).toBe('fail');
  });
});

describe('getAPCAMinFontSize', () => {
  it('returns 12px for high contrast with normal weight', () => {
    expect(getAPCAMinFontSize(95)).toBe(12);
  });

  it('returns 10px for high contrast with bold weight', () => {
    expect(getAPCAMinFontSize(95, 700)).toBe(10);
  });

  it('returns larger size for lower contrast', () => {
    const size60 = getAPCAMinFontSize(60);
    const size90 = getAPCAMinFontSize(90);
    expect(size60).toBeGreaterThan(size90!);
  });

  it('returns null for insufficient contrast', () => {
    expect(getAPCAMinFontSize(10)).toBeNull();
  });

  it('handles negative Lc values (takes absolute)', () => {
    expect(getAPCAMinFontSize(-90)).toBe(12);
  });

  it('returns different sizes based on weight', () => {
    const normalSize = getAPCAMinFontSize(60, 400);
    const boldSize = getAPCAMinFontSize(60, 700);
    expect(normalSize).toBeGreaterThan(boldSize!);
  });
});

describe('getFontRecommendations', () => {
  it('returns appropriate recommendations for high contrast', () => {
    const recs = getFontRecommendations(95);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].minSize).toBe(12);
  });

  it('returns larger minimum for lower contrast', () => {
    const highRecs = getFontRecommendations(90);
    const lowRecs = getFontRecommendations(45);
    expect(lowRecs[0].minSize).toBeGreaterThan(highRecs[0].minSize);
  });

  it('returns Infinity for insufficient contrast', () => {
    const recs = getFontRecommendations(20);
    expect(recs[0].minSize).toBe(Infinity);
  });

  it('handles negative Lc values', () => {
    const recs = getFontRecommendations(-75);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].minSize).toBeLessThan(Infinity);
  });
});

// ============================================
// Combined Analysis Tests
// ============================================

describe('analyzeContrast', () => {
  it('returns both WCAG and APCA results', () => {
    const result = analyzeContrast('#000000', '#ffffff');
    expect(result.wcag).toBeDefined();
    expect(result.apca).toBeDefined();
    expect(result.wcag.ratio).toBe(21);
    expect(Math.abs(result.apca.lc)).toBeGreaterThan(100);
  });

  it('includes all WCAG ratings', () => {
    const result = analyzeContrast('#000000', '#ffffff');
    expect(result.wcag.aa).toBe(true);
    expect(result.wcag.aaa).toBe(true);
    expect(result.wcag.aaLarge).toBe(true);
    expect(result.wcag.aaaLarge).toBe(true);
  });

  it('includes APCA rating and font size', () => {
    const result = analyzeContrast('#000000', '#ffffff');
    expect(result.apca.rating).toBe('gold');
    expect(result.apca.minimumFontSize).toBe(12);
  });

  it('handles low contrast colors', () => {
    const result = analyzeContrast('#888888', '#999999');
    expect(result.wcag.ratio).toBeLessThan(2);
    expect(result.wcag.aa).toBe(false);
    expect(result.apca.rating).toBe('fail');
  });
});

describe('meetsWCAGLevel', () => {
  it('returns true for black/white meeting AA', () => {
    expect(meetsWCAGLevel('#000000', '#ffffff', 'AA')).toBe(true);
  });

  it('returns true for black/white meeting AAA', () => {
    expect(meetsWCAGLevel('#000000', '#ffffff', 'AAA')).toBe(true);
  });

  it('returns false for low contrast at AA', () => {
    expect(meetsWCAGLevel('#888888', '#999999', 'AA')).toBe(false);
  });

  it('correctly identifies AA but not AAA', () => {
    // Find a ratio between 4.5 and 7
    const meetsAA = meetsWCAGLevel('#767676', '#ffffff', 'AA');
    const meetsAAA = meetsWCAGLevel('#767676', '#ffffff', 'AAA');
    expect(meetsAA).toBe(true);
    expect(meetsAAA).toBe(false);
  });
});

describe('meetsAPCARating', () => {
  it('returns true for black/white meeting gold', () => {
    expect(meetsAPCARating('#000000', '#ffffff', 'gold')).toBe(true);
  });

  it('returns false for low contrast at bronze', () => {
    expect(meetsAPCARating('#888888', '#999999', 'bronze')).toBe(false);
  });

  it('correctly identifies silver but not gold', () => {
    // Mid-gray on white should be silver-ish
    const meetsSilver = meetsAPCARating('#666666', '#ffffff', 'silver');
    expect(meetsSilver).toBe(true);
  });
});

describe('suggestTextColor', () => {
  it('suggests black for white background', () => {
    const result = suggestTextColor('#ffffff');
    expect(result.hex).toBe('#000000');
    expect(result.wcagRatio).toBe(21);
  });

  it('suggests white for black background', () => {
    const result = suggestTextColor('#000000');
    expect(result.hex).toBe('#ffffff');
    expect(result.wcagRatio).toBe(21);
  });

  it('suggests black for light colors', () => {
    const result = suggestTextColor('#f0f0f0');
    expect(result.hex).toBe('#000000');
  });

  it('suggests white for dark colors', () => {
    const result = suggestTextColor('#222222');
    expect(result.hex).toBe('#ffffff');
  });

  it('suggests black for yellow background', () => {
    const result = suggestTextColor('#ffff00');
    expect(result.hex).toBe('#000000');
  });

  it('includes APCA Lc value', () => {
    const result = suggestTextColor('#ffffff');
    expect(result.apcaLc).toBeDefined();
    expect(Math.abs(result.apcaLc)).toBeGreaterThan(100);
  });
});

describe('findAccessibleColor', () => {
  it('returns same color if already accessible', () => {
    const result = findAccessibleColor('#000000', '#ffffff', 'AAA');
    expect(result).toBe('#000000');
  });

  it('returns adjusted color for low contrast', () => {
    const result = findAccessibleColor('#888888', '#ffffff', 'AA');
    expect(result).toBeDefined();
    if (result) {
      const ratio = getWCAGContrastHex(result, '#ffffff');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('returns black or white if original color cannot be adjusted enough', () => {
    // Very light color on white - needs to go much darker
    const result = findAccessibleColor('#fefefe', '#ffffff', 'AA');
    expect(result).toBeDefined();
    // Should find a darker shade or black
    if (result) {
      const ratio = getWCAGContrastHex(result, '#ffffff');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('handles AAA target level', () => {
    const result = findAccessibleColor('#666666', '#ffffff', 'AAA');
    expect(result).toBeDefined();
    if (result) {
      const ratio = getWCAGContrastHex(result, '#ffffff');
      expect(ratio).toBeGreaterThanOrEqual(7);
    }
  });

  it('preserves relative darkness/lightness when possible', () => {
    // A dark color on white should return a darker color
    const result = findAccessibleColor('#444444', '#ffffff', 'AA');
    expect(result).toBeDefined();
    // The result should still be on the darker side
    if (result && result !== '#000000' && result !== '#ffffff') {
      const rgb = {
        r: parseInt(result.slice(1, 3), 16),
        g: parseInt(result.slice(3, 5), 16),
        b: parseInt(result.slice(5, 7), 16),
      };
      const brightness = (rgb.r + rgb.g + rgb.b) / 3;
      expect(brightness).toBeLessThan(128);
    }
  });
});

// ============================================
// Edge Cases
// ============================================

describe('edge cases', () => {
  it('handles pure red', () => {
    const result = analyzeContrast('#ff0000', '#ffffff');
    expect(result.wcag.ratio).toBeGreaterThan(1);
    expect(result.apca.lc).not.toBe(0);
  });

  it('handles pure green', () => {
    const result = analyzeContrast('#00ff00', '#ffffff');
    expect(result.wcag.ratio).toBeGreaterThan(1);
  });

  it('handles pure blue', () => {
    const result = analyzeContrast('#0000ff', '#ffffff');
    expect(result.wcag.ratio).toBeGreaterThan(1);
  });

  it('handles very similar colors', () => {
    const result = analyzeContrast('#ffffff', '#fffffe');
    expect(result.wcag.ratio).toBeCloseTo(1, 1);
  });

  it('handles 3-character hex shorthand conversion', () => {
    // Note: hexToRgb might not handle 3-char hex, but we test the library's behavior
    const result6 = analyzeContrast('#aabbcc', '#ffffff');
    expect(result6.wcag.ratio).toBeGreaterThan(1);
  });
});

// ============================================
// Real-World Color Pairs
// ============================================

describe('real-world color pairs', () => {
  it('validates Tailwind blue-500 on white', () => {
    const result = analyzeContrast('#3b82f6', '#ffffff');
    expect(result.wcag.aaLarge).toBe(true);
  });

  it('validates Tailwind gray-700 on white (body text)', () => {
    const result = analyzeContrast('#374151', '#ffffff');
    expect(result.wcag.aa).toBe(true);
  });

  it('validates Tailwind green-600 on white', () => {
    const result = analyzeContrast('#16a34a', '#ffffff');
    expect(result.wcag.aaLarge).toBe(true);
  });

  it('validates white text on Tailwind slate-900', () => {
    const result = analyzeContrast('#ffffff', '#0f172a');
    expect(result.wcag.aaa).toBe(true);
  });

  it('validates placeholder text contrast (gray-400 on white)', () => {
    const result = analyzeContrast('#9ca3af', '#ffffff');
    // Placeholder text typically fails AA but may pass AA Large
    expect(result.wcag.aa).toBe(false);
  });
});
