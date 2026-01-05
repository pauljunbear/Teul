/**
 * Palette Accessibility Analysis Library
 *
 * Provides tools for analyzing color palettes for accessibility:
 * - CIE2000 color difference (Delta E)
 * - Distinguishability analysis under CVD simulation
 * - Safe alternative suggestions
 * - Palette accessibility scoring
 *
 * References:
 * - CIE DE2000: Sharma, Wu, & Dalal (2005) "The CIEDE2000 Color-Difference Formula"
 */

import { hexToRgb, rgbToLab, type RGB } from './utils';
import { simulateCVD, type CVDType, colorDistance as rgbDistance } from './colorBlindness';

// ============================================
// Types
// ============================================

export interface ColorPairAnalysis {
  color1Index: number;
  color2Index: number;
  originalDeltaE: number;
  simulatedDeltaE: number;
  distinguishable: boolean;
  wcagCompliant: boolean; // Non-text elements need 3:1 contrast
}

export interface PaletteAccessibilityReport {
  cvdType: CVDType;
  totalPairs: number;
  distinguishablePairs: number;
  confusingPairs: ColorPairAnalysis[];
  score: number; // 0-100, higher is better
  recommendations: string[];
}

export interface SafeAlternative {
  originalColor: RGB;
  suggestedColor: RGB;
  originalHex: string;
  suggestedHex: string;
  improvementScore: number;
  reason: string;
}

// ============================================
// CIE2000 Color Difference (Delta E)
// ============================================

/**
 * Calculate CIE2000 color difference (Delta E 2000)
 * This is the most perceptually uniform color difference formula.
 *
 * @param lab1 - First color in LAB [L, a, b]
 * @param lab2 - Second color in LAB [L, a, b]
 * @returns Delta E 2000 value
 *
 * Interpretation:
 * - 0-1: Imperceptible difference
 * - 1-2: Perceptible through close observation
 * - 2-10: Perceptible at a glance
 * - 11-49: Colors are more similar than opposite
 * - 50-100: Colors are nearly opposite
 */
export function deltaE2000(lab1: number[], lab2: number[]): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  // Weight factors (standard values)
  const kL = 1;
  const kC = 1;
  const kH = 1;

  // Calculate C'ab and h'ab
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab = (C1 + C2) / 2;

  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cab, 7) / (Math.pow(Cab, 7) + Math.pow(25, 7))));

  const a1Prime = a1 * (1 + G);
  const a2Prime = a2 * (1 + G);

  const C1Prime = Math.sqrt(a1Prime * a1Prime + b1 * b1);
  const C2Prime = Math.sqrt(a2Prime * a2Prime + b2 * b2);

  const h1Prime = Math.atan2(b1, a1Prime) * (180 / Math.PI);
  const h2Prime = Math.atan2(b2, a2Prime) * (180 / Math.PI);

  const h1PrimeNorm = h1Prime < 0 ? h1Prime + 360 : h1Prime;
  const h2PrimeNorm = h2Prime < 0 ? h2Prime + 360 : h2Prime;

  // Calculate delta values
  const deltaLPrime = L2 - L1;
  const deltaCPrime = C2Prime - C1Prime;

  let deltahPrime: number;
  if (C1Prime * C2Prime === 0) {
    deltahPrime = 0;
  } else if (Math.abs(h2PrimeNorm - h1PrimeNorm) <= 180) {
    deltahPrime = h2PrimeNorm - h1PrimeNorm;
  } else if (h2PrimeNorm - h1PrimeNorm > 180) {
    deltahPrime = h2PrimeNorm - h1PrimeNorm - 360;
  } else {
    deltahPrime = h2PrimeNorm - h1PrimeNorm + 360;
  }

  const deltaHPrime = 2 * Math.sqrt(C1Prime * C2Prime) * Math.sin((deltahPrime * Math.PI) / 360);

  // Calculate means
  const LPrimeBar = (L1 + L2) / 2;
  const CPrimeBar = (C1Prime + C2Prime) / 2;

  let hPrimeBar: number;
  if (C1Prime * C2Prime === 0) {
    hPrimeBar = h1PrimeNorm + h2PrimeNorm;
  } else if (Math.abs(h1PrimeNorm - h2PrimeNorm) <= 180) {
    hPrimeBar = (h1PrimeNorm + h2PrimeNorm) / 2;
  } else if (h1PrimeNorm + h2PrimeNorm < 360) {
    hPrimeBar = (h1PrimeNorm + h2PrimeNorm + 360) / 2;
  } else {
    hPrimeBar = (h1PrimeNorm + h2PrimeNorm - 360) / 2;
  }

  // Calculate T
  const T =
    1 -
    0.17 * Math.cos(((hPrimeBar - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hPrimeBar * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hPrimeBar + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hPrimeBar - 63) * Math.PI) / 180);

  // Calculate SL, SC, SH
  const SL =
    1 + (0.015 * Math.pow(LPrimeBar - 50, 2)) / Math.sqrt(20 + Math.pow(LPrimeBar - 50, 2));
  const SC = 1 + 0.045 * CPrimeBar;
  const SH = 1 + 0.015 * CPrimeBar * T;

  // Calculate RT
  const deltaTheta = 30 * Math.exp(-Math.pow((hPrimeBar - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(CPrimeBar, 7) / (Math.pow(CPrimeBar, 7) + Math.pow(25, 7)));
  const RT = -RC * Math.sin((2 * deltaTheta * Math.PI) / 180);

  // Calculate final Delta E 2000
  const deltaE = Math.sqrt(
    Math.pow(deltaLPrime / (kL * SL), 2) +
      Math.pow(deltaCPrime / (kC * SC), 2) +
      Math.pow(deltaHPrime / (kH * SH), 2) +
      RT * (deltaCPrime / (kC * SC)) * (deltaHPrime / (kH * SH))
  );

  return deltaE;
}

/**
 * Calculate Delta E 2000 from RGB colors
 */
export function deltaE2000RGB(rgb1: RGB, rgb2: RGB): number {
  const lab1 = rgbToLab(rgb1.r, rgb1.g, rgb1.b);
  const lab2 = rgbToLab(rgb2.r, rgb2.g, rgb2.b);
  return deltaE2000(lab1, lab2);
}

/**
 * Calculate Delta E 2000 from hex colors
 */
export function deltaE2000Hex(hex1: string, hex2: string): number {
  return deltaE2000RGB(hexToRgb(hex1), hexToRgb(hex2));
}

// ============================================
// Distinguishability Thresholds
// ============================================

// Minimum Delta E for colors to be distinguishable
export const DELTA_E_THRESHOLDS = {
  imperceptible: 1,
  justNoticeable: 2.3, // JND threshold
  noticeable: 5,
  distinct: 10,
  veryDistinct: 25,
} as const;

/**
 * Check if two colors are distinguishable
 * Uses Delta E 2000 with configurable threshold
 */
export function areDistinguishable(
  rgb1: RGB,
  rgb2: RGB,
  threshold: number = DELTA_E_THRESHOLDS.distinct
): boolean {
  return deltaE2000RGB(rgb1, rgb2) >= threshold;
}

/**
 * Check if two colors would be distinguishable under CVD simulation
 */
export function areDistinguishableUnderCVD(
  rgb1: RGB,
  rgb2: RGB,
  cvdType: CVDType,
  threshold: number = DELTA_E_THRESHOLDS.distinct
): boolean {
  if (cvdType === 'normal') {
    return areDistinguishable(rgb1, rgb2, threshold);
  }

  const sim1 = simulateCVD(rgb1, { type: cvdType });
  const sim2 = simulateCVD(rgb2, { type: cvdType });
  return deltaE2000RGB(sim1, sim2) >= threshold;
}

// ============================================
// Palette Analysis
// ============================================

/**
 * Analyze a color pair for accessibility under a specific CVD type
 */
export function analyzeColorPair(
  color1: RGB,
  color2: RGB,
  cvdType: CVDType,
  index1: number = 0,
  index2: number = 1,
  threshold: number = DELTA_E_THRESHOLDS.distinct
): ColorPairAnalysis {
  const originalDeltaE = deltaE2000RGB(color1, color2);

  let simulatedDeltaE: number;
  if (cvdType === 'normal') {
    simulatedDeltaE = originalDeltaE;
  } else {
    const sim1 = simulateCVD(color1, { type: cvdType });
    const sim2 = simulateCVD(color2, { type: cvdType });
    simulatedDeltaE = deltaE2000RGB(sim1, sim2);
  }

  // Check WCAG non-text contrast (3:1 using relative luminance)
  const wcagCompliant = rgbDistance(color1, color2) >= 125; // Approximate 3:1

  return {
    color1Index: index1,
    color2Index: index2,
    originalDeltaE,
    simulatedDeltaE,
    distinguishable: simulatedDeltaE >= threshold,
    wcagCompliant,
  };
}

/**
 * Generate a comprehensive accessibility report for a palette
 */
export function analyzePalette(
  palette: RGB[],
  cvdType: CVDType,
  threshold: number = DELTA_E_THRESHOLDS.distinct
): PaletteAccessibilityReport {
  const pairs: ColorPairAnalysis[] = [];
  const confusingPairs: ColorPairAnalysis[] = [];

  // Analyze all color pairs
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const analysis = analyzeColorPair(palette[i], palette[j], cvdType, i, j, threshold);
      pairs.push(analysis);
      if (!analysis.distinguishable) {
        confusingPairs.push(analysis);
      }
    }
  }

  const totalPairs = pairs.length;
  const distinguishablePairs = totalPairs - confusingPairs.length;
  const score = totalPairs > 0 ? Math.round((distinguishablePairs / totalPairs) * 100) : 100;

  // Generate recommendations
  const recommendations: string[] = [];
  if (confusingPairs.length > 0) {
    recommendations.push(
      `${confusingPairs.length} color pair(s) may be confused by people with ${cvdType}`
    );
  }
  if (score < 70) {
    recommendations.push('Consider using blue-orange or yellow-purple color combinations');
  }
  if (confusingPairs.some(p => !p.wcagCompliant)) {
    recommendations.push('Some pairs do not meet WCAG non-text contrast requirements');
  }
  if (score === 100) {
    recommendations.push('Excellent! All colors are distinguishable.');
  }

  return {
    cvdType,
    totalPairs,
    distinguishablePairs,
    confusingPairs,
    score,
    recommendations,
  };
}

/**
 * Analyze a palette across all CVD types
 */
export function analyzePaletteForAllCVD(
  palette: RGB[],
  threshold: number = DELTA_E_THRESHOLDS.distinct
): Record<CVDType, PaletteAccessibilityReport> {
  const cvdTypes: CVDType[] = [
    'normal',
    'protanopia',
    'protanomaly',
    'deuteranopia',
    'deuteranomaly',
    'tritanopia',
    'tritanomaly',
    'achromatopsia',
  ];

  const reports: Partial<Record<CVDType, PaletteAccessibilityReport>> = {};
  for (const type of cvdTypes) {
    reports[type] = analyzePalette(palette, type, threshold);
  }

  return reports as Record<CVDType, PaletteAccessibilityReport>;
}

/**
 * Calculate an overall accessibility score for a palette (0-100)
 * Weights different CVD types by prevalence
 */
export function getOverallAccessibilityScore(
  palette: RGB[],
  threshold: number = DELTA_E_THRESHOLDS.distinct
): number {
  const reports = analyzePaletteForAllCVD(palette, threshold);

  // Weights based on prevalence (deuteranomaly is most common)
  const weights: Partial<Record<CVDType, number>> = {
    normal: 0.3,
    deuteranopia: 0.15,
    deuteranomaly: 0.25,
    protanopia: 0.1,
    protanomaly: 0.1,
    tritanopia: 0.02,
    tritanomaly: 0.02,
    achromatopsia: 0.06,
  };

  let weightedScore = 0;
  let totalWeight = 0;

  for (const [type, weight] of Object.entries(weights)) {
    const report = reports[type as CVDType];
    if (report) {
      weightedScore += report.score * weight;
      totalWeight += weight;
    }
  }

  return Math.round(weightedScore / totalWeight);
}

// ============================================
// Safe Alternative Suggestions
// ============================================

/**
 * Preset safe color pairs that work for most CVD types
 */
export const SAFE_COLOR_COMBINATIONS = [
  { primary: { r: 59, g: 130, b: 246 }, secondary: { r: 249, g: 115, b: 22 } }, // Blue-Orange
  { primary: { r: 168, g: 85, b: 247 }, secondary: { r: 234, g: 179, b: 8 } }, // Purple-Yellow
  { primary: { r: 0, g: 0, b: 0 }, secondary: { r: 255, g: 255, b: 255 } }, // Black-White
  { primary: { r: 59, g: 130, b: 246 }, secondary: { r: 234, g: 179, b: 8 } }, // Blue-Yellow
];

/**
 * Find a safe alternative for a color that causes confusion
 * Searches through a reference palette for the most distinguishable option
 */
export function findSafeAlternative(
  problematicColor: RGB,
  existingColors: RGB[],
  referencePalette: RGB[],
  cvdType: CVDType
): SafeAlternative | null {
  let bestAlternative: RGB | null = null;
  let bestScore = 0;
  let bestReason = '';

  for (const candidate of referencePalette) {
    // Skip if too similar to original
    if (deltaE2000RGB(candidate, problematicColor) < DELTA_E_THRESHOLDS.noticeable) {
      continue;
    }

    // Calculate minimum distinguishability from all existing colors
    let minDeltaE = Infinity;
    for (const existing of existingColors) {
      const sim1 = simulateCVD(candidate, { type: cvdType });
      const sim2 = simulateCVD(existing, { type: cvdType });
      const deltaE = deltaE2000RGB(sim1, sim2);
      minDeltaE = Math.min(minDeltaE, deltaE);
    }

    if (minDeltaE > bestScore) {
      bestScore = minDeltaE;
      bestAlternative = candidate;
      bestReason = `Delta E of ${minDeltaE.toFixed(1)} under ${cvdType} simulation`;
    }
  }

  if (!bestAlternative) {
    return null;
  }

  const rgbToHex = (rgb: RGB) =>
    `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;

  return {
    originalColor: problematicColor,
    suggestedColor: bestAlternative,
    originalHex: rgbToHex(problematicColor),
    suggestedHex: rgbToHex(bestAlternative),
    improvementScore: bestScore,
    reason: bestReason,
  };
}

/**
 * Generate safe alternatives for all confusing pairs in a palette
 */
export function suggestSafeAlternatives(
  palette: RGB[],
  referencePalette: RGB[],
  cvdType: CVDType
): SafeAlternative[] {
  const report = analyzePalette(palette, cvdType);
  const alternatives: SafeAlternative[] = [];

  // Find unique problematic colors
  const problematicIndices = new Set<number>();
  for (const pair of report.confusingPairs) {
    problematicIndices.add(pair.color1Index);
    problematicIndices.add(pair.color2Index);
  }

  for (const index of problematicIndices) {
    const otherColors = palette.filter((_, i) => i !== index);
    const alternative = findSafeAlternative(palette[index], otherColors, referencePalette, cvdType);

    if (alternative) {
      alternatives.push(alternative);
    }
  }

  return alternatives;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get a description of Delta E value
 */
export function getDeltaEDescription(deltaE: number): string {
  if (deltaE < DELTA_E_THRESHOLDS.imperceptible) {
    return 'Imperceptible difference';
  }
  if (deltaE < DELTA_E_THRESHOLDS.justNoticeable) {
    return 'Just noticeable difference';
  }
  if (deltaE < DELTA_E_THRESHOLDS.noticeable) {
    return 'Noticeable difference';
  }
  if (deltaE < DELTA_E_THRESHOLDS.distinct) {
    return 'Clearly different';
  }
  if (deltaE < DELTA_E_THRESHOLDS.veryDistinct) {
    return 'Very distinct colors';
  }
  return 'Completely different colors';
}

/**
 * Check if a palette meets minimum accessibility standards
 */
export function isPaletteAccessible(
  palette: RGB[],
  minimumScore: number = 70
): { accessible: boolean; score: number; worstType: CVDType | null } {
  const reports = analyzePaletteForAllCVD(palette);
  let lowestScore = 100;
  let worstType: CVDType | null = null;

  for (const [type, report] of Object.entries(reports) as [CVDType, PaletteAccessibilityReport][]) {
    if (type !== 'normal' && report.score < lowestScore) {
      lowestScore = report.score;
      worstType = type;
    }
  }

  const overallScore = getOverallAccessibilityScore(palette);

  return {
    accessible: lowestScore >= minimumScore,
    score: overallScore,
    worstType,
  };
}
