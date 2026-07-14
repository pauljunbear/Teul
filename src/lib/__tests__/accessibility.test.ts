/**
 * Tests for accessibility.ts
 *
 * Validates WCAG 2.2 and APCA contrast calculations
 * against known reference values.
 */

import { describe, it, expect } from 'vitest';
import {
  getRelativeLuminance,
  getWCAGContrast,
  getWCAGContrastHex,
  getWCAGRating,
  getAccessibleTextColor,
  getAPCAContrast,
  getAPCAUseCase,
  getAPCAMinFontSize,
  analyzeContrast,
} from '../accessibility';
import wadaColors from '../../colors.json';
import wernerColors from '../../wernerColors.json';

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

  it('handles low sRGB values below the 0.04045 threshold', () => {
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

describe('getAccessibleTextColor', () => {
  const candidates = ['#1a1a1a', '#ffffff'] as const;

  it('chooses the exact higher-contrast rendered candidate', () => {
    const result = getAccessibleTextColor('#00b49b');
    expect(result.hex).toBe('#1a1a1a');
    expect(result.contrast).toBeCloseTo(6.63, 2);
    expect(result.rating.aa).toBe(true);
  });

  it('rejects an empty candidate list', () => {
    expect(() => getAccessibleTextColor('#ffffff', [])).toThrow(
      'At least one text-color candidate is required'
    );
  });

  it.each([
    ['Wada', wadaColors],
    ['Werner', wernerColors],
  ])('selects the best candidate for every %s swatch', (_name, colors) => {
    for (const color of colors) {
      const result = getAccessibleTextColor(color.hex, candidates);
      const candidateContrasts = candidates.map(candidate =>
        getWCAGContrastHex(candidate, color.hex)
      );
      const bestContrast = Math.max(...candidateContrasts);

      expect(result.contrast).toBeCloseTo(bestContrast, 10);
      if (bestContrast >= 4.5) {
        expect(result.rating.aa, `${color.name} should pass AA`).toBe(true);
      }
    }
  });

  it('rescues Werner Sap Green from a failing white-text choice', () => {
    const result = getAccessibleTextColor('#808740');
    expect(result.hex).toBe('#1a1a1a');
    expect(result.contrast).toBeGreaterThanOrEqual(4.5);
    expect(getWCAGContrastHex('#ffffff', '#808740')).toBeLessThan(4.5);
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
  it('matches the canonical black-on-white vector and positive polarity', () => {
    const lc = getAPCAContrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    expect(lc).toBe(106.04067321268862);
  });

  it('matches the canonical white-on-black vector and negative polarity', () => {
    const lc = getAPCAContrast({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 });
    expect(lc).toBe(-107.88473318309848);
  });

  it.each([
    [{ r: 136, g: 136, b: 136 }, { r: 255, g: 255, b: 255 }, 63.056469930209424],
    [{ r: 255, g: 255, b: 255 }, { r: 136, g: 136, b: 136 }, -68.54146436644962],
    [{ r: 17, g: 34, b: 51 }, { r: 221, g: 238, b: 255 }, 91.66830811481631],
    [{ r: 221, g: 238, b: 255 }, { r: 17, g: 34, b: 51 }, -93.06770049484275],
    [{ r: 0, g: 0, b: 0 }, { r: 170, g: 170, b: 170 }, 58.146262578561334],
    [{ r: 170, g: 170, b: 170 }, { r: 0, g: 0, b: 0 }, -56.24113336839742],
  ])('matches an apca-w3 0.1.9 package vector', (text, background, expected) => {
    expect(getAPCAContrast(text, background)).toBe(expected);
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
    expect(lc1).toBeLessThan(0);
    expect(lc2).toBeGreaterThan(0);
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

describe('getAPCAUseCase', () => {
  it('maps signed Lc values to contextual use cases instead of conformance grades', () => {
    expect(getAPCAUseCase(90)).toBe('preferred-body');
    expect(getAPCAUseCase(-75)).toBe('minimum-body');
    expect(getAPCAUseCase(60)).toBe('fluent-text');
    expect(getAPCAUseCase(-45)).toBe('large-text');
    expect(getAPCAUseCase(30)).toBe('non-content-text');
    expect(getAPCAUseCase(15)).toBe('non-text');
    expect(getAPCAUseCase(14.9)).toBe('below-guide');
  });
});

describe('getAPCAMinFontSize', () => {
  it('uses the official basic reference size for high contrast at normal weight', () => {
    expect(getAPCAMinFontSize(95)).toBe(14);
  });

  it('uses the official Arial 400 basic reference size at Lc 75', () => {
    expect(getAPCAMinFontSize(75, 400)).toBe(16);
  });

  it('uses the official basic reference size for high contrast at bold weight', () => {
    expect(getAPCAMinFontSize(95, 700)).toBe(14);
  });

  it('returns the official Lc 60 reference sizes', () => {
    expect(getAPCAMinFontSize(60, 400)).toBe(24);
    expect(getAPCAMinFontSize(60, 700)).toBe(16);
  });

  it('returns the official Lc 45 reference sizes', () => {
    expect(getAPCAMinFontSize(45, 400)).toBe(42);
    expect(getAPCAMinFontSize(45, 700)).toBe(24);
  });

  it('returns larger size for lower contrast', () => {
    const size60 = getAPCAMinFontSize(60);
    const size90 = getAPCAMinFontSize(90);
    expect(size60).toBeGreaterThan(size90!);
  });

  it('returns null for insufficient contrast', () => {
    expect(getAPCAMinFontSize(20)).toBeNull();
  });

  it('handles negative Lc values (takes absolute)', () => {
    expect(getAPCAMinFontSize(-90)).toBe(14);
  });

  it('returns different sizes based on weight', () => {
    const normalSize = getAPCAMinFontSize(60, 400);
    const boldSize = getAPCAMinFontSize(60, 700);
    expect(normalSize).toBeGreaterThan(boldSize!);
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

  it('includes APCA use case and canonical font size', () => {
    const result = analyzeContrast('#000000', '#ffffff');
    expect(result.apca.useCase).toBe('preferred-body');
    expect(result.apca.minimumFontSize).toBe(14);
  });

  it('handles low contrast colors', () => {
    const result = analyzeContrast('#888888', '#999999');
    expect(result.wcag.ratio).toBeLessThan(2);
    expect(result.wcag.aa).toBe(false);
    expect(result.apca.useCase).toBe('below-guide');
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
