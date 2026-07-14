/**
 * Accessibility Library for Teul
 *
 * Implements:
 * - WCAG 2.2 contrast ratio calculations
 * - APCA 0.1.9 as an experimental, supplemental perceptual-contrast metric
 * - APCA use-case and reference-font guidance
 *
 * References:
 * - WCAG 2.2: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
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
    useCase: APCAUseCase;
    minimumFontSize: number | null;
  };
}

export type WCAGLevel = 'AAA' | 'AA' | 'AA Large' | 'Fail';
export interface AccessibleTextColor {
  hex: string;
  contrast: number;
  rating: ReturnType<typeof getWCAGRating>;
}
export type APCAUseCase =
  | 'preferred-body'
  | 'minimum-body'
  | 'fluent-text'
  | 'large-text'
  | 'non-content-text'
  | 'non-text'
  | 'below-guide';

// ============================================
// WCAG 2.2 Contrast Functions
// ============================================

/**
 * Calculate relative luminance according to WCAG 2.2
 * Formula: L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * Where R, G, B are linearized sRGB values
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const srgb = c / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate WCAG 2.2 contrast ratio between two colors
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
 * Get WCAG 2.2 conformance levels for a contrast ratio
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

/**
 * Choose the candidate with the highest exact WCAG 2.2 contrast against a
 * rendered background. The default dark value matches Teul's swatch text.
 */
export function getAccessibleTextColor(
  backgroundHex: string,
  candidates: readonly string[] = ['#1a1a1a', '#ffffff']
): AccessibleTextColor {
  if (candidates.length === 0) {
    throw new Error('At least one text-color candidate is required');
  }

  const best = candidates.reduce(
    (current, hex) => {
      const contrast = getWCAGContrastHex(hex, backgroundHex);
      return contrast > current.contrast ? { hex, contrast } : current;
    },
    { hex: candidates[0], contrast: getWCAGContrastHex(candidates[0], backgroundHex) }
  );

  return { ...best, rating: getWCAGRating(best.contrast) };
}

// ============================================
// APCA Experimental Contrast Functions
// ============================================

/**
 * TypeScript port of the sRGB and contrast operations from canonical apca-w3
 * 0.1.9 (APCA 0.0.98G-4g constants), copyright © 2019-2022 Andrew Somers
 * and/or Myndex. Port changes are limited to types, local naming, and numeric
 * RGB input. Keep these constants and operations current and unmodified; see
 * APCA_LICENSE.md for the Limited W3 License and web-content-only restriction.
 */
const APCA_0_1_9 = {
  mainTRC: 2.4,
  sRco: 0.2126729,
  sGco: 0.7151522,
  sBco: 0.072175,
  normBG: 0.56,
  normTXT: 0.57,
  revTXT: 0.62,
  revBG: 0.65,
  blkThrs: 0.022,
  blkClmp: 1.414,
  scaleBoW: 1.14,
  scaleWoB: 1.14,
  loBoWoffset: 0.027,
  loWoBoffset: 0.027,
  deltaYmin: 0.0005,
  loClip: 0.1,
} as const;

function apcaSRGBtoY(rgb: RGB): number {
  const simpleExp = (channel: number) => Math.pow(channel / 255, APCA_0_1_9.mainTRC);

  return (
    APCA_0_1_9.sRco * simpleExp(rgb.r) +
    APCA_0_1_9.sGco * simpleExp(rgb.g) +
    APCA_0_1_9.sBco * simpleExp(rgb.b)
  );
}

function apcaContrastCanonical(textYInput: number, backgroundYInput: number): number {
  if (
    Number.isNaN(textYInput) ||
    Number.isNaN(backgroundYInput) ||
    Math.min(textYInput, backgroundYInput) < 0 ||
    Math.max(textYInput, backgroundYInput) > 1.1
  ) {
    return 0;
  }

  const textY =
    textYInput > APCA_0_1_9.blkThrs
      ? textYInput
      : textYInput + Math.pow(APCA_0_1_9.blkThrs - textYInput, APCA_0_1_9.blkClmp);
  const backgroundY =
    backgroundYInput > APCA_0_1_9.blkThrs
      ? backgroundYInput
      : backgroundYInput + Math.pow(APCA_0_1_9.blkThrs - backgroundYInput, APCA_0_1_9.blkClmp);

  if (Math.abs(backgroundY - textY) < APCA_0_1_9.deltaYmin) {
    return 0;
  }

  if (backgroundY > textY) {
    const sapc =
      (Math.pow(backgroundY, APCA_0_1_9.normBG) - Math.pow(textY, APCA_0_1_9.normTXT)) *
      APCA_0_1_9.scaleBoW;
    const outputContrast = sapc < APCA_0_1_9.loClip ? 0 : sapc - APCA_0_1_9.loBoWoffset;
    return outputContrast * 100;
  }

  const sapc =
    (Math.pow(backgroundY, APCA_0_1_9.revBG) - Math.pow(textY, APCA_0_1_9.revTXT)) *
    APCA_0_1_9.scaleWoB;
  const outputContrast = sapc > -APCA_0_1_9.loClip ? 0 : sapc + APCA_0_1_9.loWoBoffset;
  return outputContrast * 100;
}

/**
 * Calculate APCA Lightness Contrast (Lc) value
 * using the canonical apca-w3 0.1.9 implementation.
 *
 * Positive = dark text on a light background (BoW).
 * Negative = light text on a dark background (WoB).
 */
export function getAPCAContrast(text: RGB, bg: RGB): number {
  return apcaContrastCanonical(apcaSRGBtoY(text), apcaSRGBtoY(bg));
}

/**
 * Classify an Lc value by APCA's basic use-case levels.
 * These are contextual guides, not pass/fail conformance ratings.
 */
export function getAPCAUseCase(lc: number): APCAUseCase {
  const absLc = Math.abs(lc);

  if (absLc >= 90) return 'preferred-body';
  if (absLc >= 75) return 'minimum-body';
  if (absLc >= 60) return 'fluent-text';
  if (absLc >= 45) return 'large-text';
  if (absLc >= 30) return 'non-content-text';
  if (absLc >= 15) return 'non-text';
  return 'below-guide';
}

/**
 * Get minimum font size for APCA Lc value
 * Returns null below the basic content-text use-case levels
 *
 * Uses APCA's basic reference sizes for its use-case levels. The returned
 * size is for a reference Latin sans-serif and is not a universal minimum.
 */
export function getAPCAMinFontSize(lc: number, weight: number = 400): number | null {
  const absLc = Math.abs(lc);
  const isBold = weight >= 700;

  if (absLc >= 90) return 14;
  if (absLc >= 75) return isBold ? 14 : 16;
  if (absLc >= 60) return isBold ? 16 : 24;
  if (absLc >= 45) return isBold ? 24 : 42;
  return null;
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
  const apcaUseCase = getAPCAUseCase(apcaLc);
  const minFontSize = getAPCAMinFontSize(apcaLc);

  return {
    wcag: {
      ratio: wcagRatio,
      ...wcagRating,
    },
    apca: {
      lc: apcaLc,
      useCase: apcaUseCase,
      minimumFontSize: minFontSize,
    },
  };
}
