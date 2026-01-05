/**
 * Accessibility Library for Teul
 *
 * Implements:
 * - WCAG 2.1 contrast ratio calculations
 * - APCA (Accessible Perceptual Contrast Algorithm) for WCAG 3.0
 * - Contrast ratings and recommendations
 *
 * References:
 * - WCAG 2.1: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum
 * - APCA: https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell
 */

import { hexToRgb, type RGB } from './utils';

// ============================================
// Types
// ============================================

export interface ContrastResult {
  wcag: {
    ratio: number;
    aa: boolean;
    aaLarge: boolean;
    aaa: boolean;
    aaaLarge: boolean;
  };
  apca: {
    lc: number;
    rating: APCARating;
    minimumFontSize: number | null;
  };
}

export type WCAGLevel = 'AAA' | 'AA' | 'AA Large' | 'Fail';
export type APCARating = 'gold' | 'silver' | 'bronze' | 'fail';

export interface FontSizeRecommendation {
  minSize: number;
  weight: 'normal' | 'bold';
  description: string;
}

// ============================================
// WCAG 2.1 Contrast Functions
// ============================================

/**
 * Calculate relative luminance according to WCAG 2.1
 * Formula: L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * Where R, G, B are linearized sRGB values
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate WCAG 2.1 contrast ratio between two colors
 * Returns a value between 1:1 and 21:1
 */
export function getWCAGContrast(fg: RGB, bg: RGB): number {
  const l1 = getRelativeLuminance(fg.r, fg.g, fg.b);
  const l2 = getRelativeLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Calculate WCAG contrast from hex colors
 */
export function getWCAGContrastHex(fgHex: string, bgHex: string): number {
  return getWCAGContrast(hexToRgb(fgHex), hexToRgb(bgHex));
}

/**
 * Get WCAG 2.1 conformance levels for a contrast ratio
 */
export function getWCAGRating(ratio: number): {
  aa: boolean;
  aaLarge: boolean;
  aaa: boolean;
  aaaLarge: boolean;
  level: WCAGLevel;
} {
  return {
    aaa: ratio >= 7,
    aa: ratio >= 4.5,
    aaaLarge: ratio >= 4.5,
    aaLarge: ratio >= 3,
    level: ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA Large' : 'Fail',
  };
}

// ============================================
// APCA (WCAG 3.0) Contrast Functions
// ============================================

// APCA constants (SAPC 0.0.98G-4g-base)
const APCA = {
  // Exponents
  mainTRC: 2.4,
  sRGBtrc: 2.218,
  // Coefficients for sRGB
  sRco: 0.2126729,
  sGco: 0.7151522,
  sBco: 0.072175,
  // Clamp values
  blkThrs: 0.022,
  blkClmp: 1.414,
  scaleBoW: 1.14,
  scaleWoB: 1.14,
  loBoWoffset: 0.027,
  loWoBoffset: 0.027,
  loClip: 0.1,
  // delta Y
  deltaYmin: 0.0005,
};

/**
 * Soft clamp for APCA black level
 */
function softClamp(y: number): number {
  if (y < 0) return 0;
  if (y < APCA.blkThrs) {
    return y + Math.pow(APCA.blkThrs - y, APCA.blkClmp);
  }
  return y;
}

/**
 * Calculate Y (luminance) for APCA from sRGB color
 * Uses different linearization than WCAG
 */
function apcaY(r: number, g: number, b: number): number {
  // Linearize sRGB
  const rLin = Math.pow(r / 255, APCA.mainTRC);
  const gLin = Math.pow(g / 255, APCA.mainTRC);
  const bLin = Math.pow(b / 255, APCA.mainTRC);

  // Calculate Y
  const y = APCA.sRco * rLin + APCA.sGco * gLin + APCA.sBco * bLin;

  return y;
}

/**
 * Calculate APCA Lightness Contrast (Lc) value
 * Returns value from roughly -108 to 106
 * Negative = dark text on light bg, Positive = light text on dark bg
 *
 * The absolute value is what matters for contrast:
 * - |Lc| >= 15: minimum for non-text elements
 * - |Lc| >= 30: minimum for any text
 * - |Lc| >= 45: minimum for body text at large sizes
 * - |Lc| >= 60: preferred for body text
 * - |Lc| >= 75: enhanced/large text
 * - |Lc| >= 90: high contrast preference
 */
export function getAPCAContrast(text: RGB, bg: RGB): number {
  // Calculate Y values
  let Ytext = apcaY(text.r, text.g, text.b);
  let Ybg = apcaY(bg.r, bg.g, bg.b);

  // Soft clamp black levels
  Ytext = softClamp(Ytext);
  Ybg = softClamp(Ybg);

  // Check for very low contrast
  if (Math.abs(Ybg - Ytext) < APCA.deltaYmin) {
    return 0;
  }

  let SAPC: number;
  let outputContrast: number;

  // Determine polarity: is this dark-on-light or light-on-dark?
  if (Ybg > Ytext) {
    // Dark text on light background (BoW - Black on White)
    // Returns NEGATIVE value per APCA convention
    SAPC = (Math.pow(Ybg, 0.56) - Math.pow(Ytext, 0.57)) * APCA.scaleBoW;

    outputContrast =
      SAPC < APCA.loClip ? 0 : SAPC < APCA.loBoWoffset ? 0 : -(SAPC - APCA.loBoWoffset);
  } else {
    // Light text on dark background (WoB - White on Black)
    // Returns POSITIVE value per APCA convention
    SAPC = (Math.pow(Ytext, 0.62) - Math.pow(Ybg, 0.65)) * APCA.scaleWoB;

    outputContrast = SAPC < APCA.loClip ? 0 : SAPC < APCA.loWoBoffset ? 0 : SAPC - APCA.loWoBoffset;
  }

  // Scale to Lc (roughly -108 to 106)
  return outputContrast * 100;
}

/**
 * Calculate APCA contrast from hex colors
 */
export function getAPCAContrastHex(textHex: string, bgHex: string): number {
  return getAPCAContrast(hexToRgb(textHex), hexToRgb(bgHex));
}

/**
 * Get APCA rating based on Lc value
 * Uses the APCA Bronze/Silver/Gold conformance model
 */
export function getAPCARating(lc: number): APCARating {
  const absLc = Math.abs(lc);

  if (absLc >= 75) return 'gold';
  if (absLc >= 60) return 'silver';
  if (absLc >= 45) return 'bronze';
  return 'fail';
}

/**
 * Get minimum font size for APCA Lc value
 * Returns null if contrast is insufficient for any text
 *
 * Based on APCA font lookup tables
 */
export function getAPCAMinFontSize(lc: number, weight: number = 400): number | null {
  const absLc = Math.abs(lc);

  // APCA font size lookup (simplified)
  // Format: [Lc threshold, min size for weight 400, min size for weight 700]
  const sizeTable: [number, number, number][] = [
    [90, 12, 10],
    [75, 14, 12],
    [60, 16, 14],
    [45, 24, 18],
    [30, 36, 24],
    [15, 72, 48], // Non-text only
  ];

  for (const [threshold, size400, size700] of sizeTable) {
    if (absLc >= threshold) {
      return weight >= 600 ? size700 : size400;
    }
  }

  return null; // Insufficient contrast
}

/**
 * Get font size recommendations for an APCA Lc value
 */
export function getFontRecommendations(lc: number): FontSizeRecommendation[] {
  const absLc = Math.abs(lc);
  const recommendations: FontSizeRecommendation[] = [];

  if (absLc >= 90) {
    recommendations.push({
      minSize: 12,
      weight: 'normal',
      description: 'Excellent: Any text size',
    });
  } else if (absLc >= 75) {
    recommendations.push({
      minSize: 14,
      weight: 'normal',
      description: 'Very good: Body text and larger',
    });
    recommendations.push({
      minSize: 12,
      weight: 'bold',
      description: 'Very good: Bold small text',
    });
  } else if (absLc >= 60) {
    recommendations.push({
      minSize: 16,
      weight: 'normal',
      description: 'Good: Standard body text',
    });
    recommendations.push({
      minSize: 14,
      weight: 'bold',
      description: 'Good: Bold body text',
    });
  } else if (absLc >= 45) {
    recommendations.push({
      minSize: 24,
      weight: 'normal',
      description: 'Acceptable: Large headings only',
    });
    recommendations.push({
      minSize: 18,
      weight: 'bold',
      description: 'Acceptable: Bold headings',
    });
  } else if (absLc >= 30) {
    recommendations.push({
      minSize: 36,
      weight: 'normal',
      description: 'Minimum: Display text only',
    });
  } else {
    recommendations.push({
      minSize: Infinity,
      weight: 'normal',
      description: 'Insufficient contrast for text',
    });
  }

  return recommendations;
}

// ============================================
// Combined Analysis
// ============================================

/**
 * Get comprehensive contrast analysis for two colors
 */
export function analyzeContrast(fgHex: string, bgHex: string): ContrastResult {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);

  const wcagRatio = getWCAGContrast(fg, bg);
  const wcagRating = getWCAGRating(wcagRatio);
  const apcaLc = getAPCAContrast(fg, bg);
  const apcaRating = getAPCARating(apcaLc);
  const minFontSize = getAPCAMinFontSize(apcaLc);

  return {
    wcag: {
      ratio: wcagRatio,
      ...wcagRating,
    },
    apca: {
      lc: apcaLc,
      rating: apcaRating,
      minimumFontSize: minFontSize,
    },
  };
}

/**
 * Check if a color pair meets a specific WCAG level
 */
export function meetsWCAGLevel(fgHex: string, bgHex: string, level: 'AA' | 'AAA'): boolean {
  const ratio = getWCAGContrastHex(fgHex, bgHex);
  return level === 'AAA' ? ratio >= 7 : ratio >= 4.5;
}

/**
 * Check if a color pair meets a specific APCA rating
 */
export function meetsAPCARating(
  textHex: string,
  bgHex: string,
  rating: 'bronze' | 'silver' | 'gold'
): boolean {
  const lc = Math.abs(getAPCAContrastHex(textHex, bgHex));
  switch (rating) {
    case 'gold':
      return lc >= 75;
    case 'silver':
      return lc >= 60;
    case 'bronze':
      return lc >= 45;
    default:
      return false;
  }
}

/**
 * Suggest a text color (black or white) that provides best contrast
 */
export function suggestTextColor(bgHex: string): {
  hex: string;
  wcagRatio: number;
  apcaLc: number;
} {
  const blackContrast = analyzeContrast('#000000', bgHex);
  const whiteContrast = analyzeContrast('#ffffff', bgHex);

  // Prefer the color with higher WCAG ratio
  // APCA handles polarity (dark-on-light vs light-on-dark) but WCAG is symmetric
  if (blackContrast.wcag.ratio > whiteContrast.wcag.ratio) {
    return {
      hex: '#000000',
      wcagRatio: blackContrast.wcag.ratio,
      apcaLc: blackContrast.apca.lc,
    };
  }
  return {
    hex: '#ffffff',
    wcagRatio: whiteContrast.wcag.ratio,
    apcaLc: whiteContrast.apca.lc,
  };
}

/**
 * Find the closest color that meets a WCAG level
 * Adjusts the text color lightness while preserving hue
 */
export function findAccessibleColor(
  textHex: string,
  bgHex: string,
  targetLevel: 'AA' | 'AAA' = 'AA'
): string | null {
  const targetRatio = targetLevel === 'AAA' ? 7 : 4.5;
  const currentRatio = getWCAGContrastHex(textHex, bgHex);

  if (currentRatio >= targetRatio) {
    return textHex; // Already meets target
  }

  // Get background luminance to determine direction
  const bg = hexToRgb(bgHex);
  const bgLum = getRelativeLuminance(bg.r, bg.g, bg.b);

  // Try darkening or lightening the text
  const text = hexToRgb(textHex);
  const textLum = getRelativeLuminance(text.r, text.g, text.b);

  // Determine if we should go lighter or darker
  const shouldLighten = textLum > bgLum;

  // Binary search for the right adjustment
  let low = 0;
  let high = 1;
  let bestHex: string | null = null;

  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    const factor = shouldLighten ? 1 + mid : 1 - mid;

    const adjusted = {
      r: Math.max(0, Math.min(255, Math.round(text.r * factor))),
      g: Math.max(0, Math.min(255, Math.round(text.g * factor))),
      b: Math.max(0, Math.min(255, Math.round(text.b * factor))),
    };

    const adjustedHex = `#${adjusted.r.toString(16).padStart(2, '0')}${adjusted.g.toString(16).padStart(2, '0')}${adjusted.b.toString(16).padStart(2, '0')}`;

    const ratio = getWCAGContrastHex(adjustedHex, bgHex);

    if (ratio >= targetRatio) {
      bestHex = adjustedHex;
      high = mid; // Try to find a closer match
    } else {
      low = mid;
    }
  }

  // If we couldn't find a good match, suggest black or white
  if (!bestHex) {
    const blackRatio = getWCAGContrastHex('#000000', bgHex);
    const whiteRatio = getWCAGContrastHex('#ffffff', bgHex);
    if (blackRatio >= targetRatio) return '#000000';
    if (whiteRatio >= targetRatio) return '#ffffff';
    return null;
  }

  return bestHex;
}
