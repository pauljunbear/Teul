/**
 * Color Vision Deficiency (CVD) Simulation Library
 *
 * Implements academically-validated algorithms for simulating color blindness:
 * - Brettel 1997: Accurate dichromacy simulation (complete color blindness)
 * - Machado 2009: Anomalous trichromacy with severity (partial color blindness)
 *
 * References:
 * - Brettel et al. 1997: "Computerized simulation of color appearance for dichromats"
 * - Viénot et al. 1999: "Digital video colourmaps for checking the legibility of displays by dichromats"
 * - Machado et al. 2009: "A physiologically-based model for simulation of color vision deficiency"
 */

import { hexToRgb, rgbToHex, type RGB } from './utils';

// ============================================
// Types
// ============================================

export type CVDType =
  | 'normal'
  | 'protanopia' // Red-blind (dichromacy)
  | 'protanomaly' // Red-weak (anomalous trichromacy)
  | 'deuteranopia' // Green-blind (dichromacy)
  | 'deuteranomaly' // Green-weak (anomalous trichromacy) - most common
  | 'tritanopia' // Blue-blind (dichromacy)
  | 'tritanomaly' // Blue-weak (anomalous trichromacy)
  | 'achromatopsia'; // Complete color blindness (monochromacy)

export interface CVDSimulationOptions {
  type: CVDType;
  severity?: number; // 0-1, default 1.0 (full effect). Only applies to anomaly types.
}

export interface CVDInfo {
  type: CVDType;
  name: string;
  description: string;
  prevalence: string; // Approximate prevalence
  affectedCone: 'L' | 'M' | 'S' | 'all' | 'none';
}

// ============================================
// CVD Information
// ============================================

export const CVD_INFO: Record<CVDType, CVDInfo> = {
  normal: {
    type: 'normal',
    name: 'Normal Vision',
    description: 'Full color vision with all three cone types functioning normally.',
    prevalence: '~92% of population',
    affectedCone: 'none',
  },
  protanopia: {
    type: 'protanopia',
    name: 'Protanopia',
    description: 'Complete absence of L-cones (red receptors). Cannot perceive red light.',
    prevalence: '~1% of males',
    affectedCone: 'L',
  },
  protanomaly: {
    type: 'protanomaly',
    name: 'Protanomaly',
    description: 'Reduced sensitivity of L-cones. Red appears weaker/shifted.',
    prevalence: '~1% of males',
    affectedCone: 'L',
  },
  deuteranopia: {
    type: 'deuteranopia',
    name: 'Deuteranopia',
    description:
      'Complete absence of M-cones (green receptors). Cannot distinguish red from green.',
    prevalence: '~1% of males',
    affectedCone: 'M',
  },
  deuteranomaly: {
    type: 'deuteranomaly',
    name: 'Deuteranomaly',
    description: 'Reduced sensitivity of M-cones. Most common form of color blindness.',
    prevalence: '~5% of males',
    affectedCone: 'M',
  },
  tritanopia: {
    type: 'tritanopia',
    name: 'Tritanopia',
    description: 'Complete absence of S-cones (blue receptors). Very rare.',
    prevalence: '~0.01% of population',
    affectedCone: 'S',
  },
  tritanomaly: {
    type: 'tritanomaly',
    name: 'Tritanomaly',
    description: 'Reduced sensitivity of S-cones. Blue appears weaker.',
    prevalence: '~0.01% of population',
    affectedCone: 'S',
  },
  achromatopsia: {
    type: 'achromatopsia',
    name: 'Achromatopsia',
    description: 'Complete color blindness. Only perceives luminance (grayscale).',
    prevalence: '~0.003% of population',
    affectedCone: 'all',
  },
};

// ============================================
// Color Space Conversion Matrices
// ============================================

// sRGB to XYZ (D65 illuminant)
const RGB_TO_XYZ: number[][] = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];

// XYZ to sRGB (D65 illuminant)
const XYZ_TO_RGB: number[][] = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];

// XYZ to LMS (Hunt-Pointer-Estevez transformation)
const XYZ_TO_LMS: number[][] = [
  [0.4002, 0.7076, -0.0808],
  [-0.2263, 1.1653, 0.0457],
  [0.0, 0.0, 0.9182],
];

// LMS to XYZ
const LMS_TO_XYZ: number[][] = [
  [1.8600667, -1.1294803, 0.2198974],
  [0.3612229, 0.6388043, -0.0000064],
  [0.0, 0.0, 1.0890637],
];

// ============================================
// Viénot 1999 Simulation Matrices (RGB space)
// ============================================

/**
 * Viénot et al. 1999 matrices operate directly in linear RGB space.
 * These are well-tested and preserve neutral colors (white, black, grays).
 */

// Protanopia simulation matrix (linear RGB space)
const VIENOT_PROTAN: number[][] = [
  [0.56667, 0.43333, 0.0],
  [0.55833, 0.44167, 0.0],
  [0.0, 0.24167, 0.75833],
];

// Deuteranopia simulation matrix (linear RGB space)
const VIENOT_DEUTAN: number[][] = [
  [0.625, 0.375, 0.0],
  [0.7, 0.3, 0.0],
  [0.0, 0.3, 0.7],
];

// Tritanopia simulation matrix (linear RGB space)
const VIENOT_TRITAN: number[][] = [
  [0.95, 0.05, 0.0],
  [0.0, 0.43333, 0.56667],
  [0.0, 0.475, 0.525],
];

// ============================================
// Machado 2009 Matrices for Anomalous Trichromacy
// ============================================

/**
 * Machado et al. 2009 provides matrices for different severity levels.
 * These matrices operate directly in RGB space.
 * Severity levels: 0.0 (normal) to 1.0 (dichromacy)
 *
 * The matrices below are for severity = 1.0 (full dichromacy equivalent).
 * For intermediate severities, we interpolate between identity and these.
 */

// Protanomaly at full severity (severity = 1.0)
const MACHADO_PROTAN_100: number[][] = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];

// Deuteranomaly at full severity (severity = 1.0)
const MACHADO_DEUTAN_100: number[][] = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];

// Tritanomaly at full severity (severity = 1.0)
const MACHADO_TRITAN_100: number[][] = [
  [1.255528, -0.076749, -0.178779],
  [-0.078411, 0.930809, 0.147602],
  [0.004733, 0.691367, 0.3039],
];

// ============================================
// Matrix Operations
// ============================================

type Matrix3x3 = number[][];

function multiplyMatrix(m: Matrix3x3, v: number[]): number[] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function matrixMultiply(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
  const result: Matrix3x3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

function interpolateMatrix(identity: Matrix3x3, target: Matrix3x3, t: number): Matrix3x3 {
  const result: Matrix3x3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      result[i][j] = identity[i][j] * (1 - t) + target[i][j] * t;
    }
  }
  return result;
}

const IDENTITY_MATRIX: Matrix3x3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// ============================================
// Color Space Conversions
// ============================================

/**
 * Linearize sRGB value (remove gamma correction)
 */
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Apply gamma correction to linear RGB
 */
function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, v * 255)));
}

/**
 * Convert sRGB to linear RGB
 */
export function rgbToLinear(rgb: RGB): number[] {
  return [srgbToLinear(rgb.r), srgbToLinear(rgb.g), srgbToLinear(rgb.b)];
}

/**
 * Convert linear RGB to sRGB
 */
export function linearToRgb(linear: number[]): RGB {
  return {
    r: linearToSrgb(linear[0]),
    g: linearToSrgb(linear[1]),
    b: linearToSrgb(linear[2]),
  };
}

/**
 * Convert linear RGB to XYZ
 */
export function linearRgbToXyz(linear: number[]): number[] {
  return multiplyMatrix(RGB_TO_XYZ, linear);
}

/**
 * Convert XYZ to linear RGB
 */
export function xyzToLinearRgb(xyz: number[]): number[] {
  return multiplyMatrix(XYZ_TO_RGB, xyz);
}

/**
 * Convert XYZ to LMS
 */
export function xyzToLms(xyz: number[]): number[] {
  return multiplyMatrix(XYZ_TO_LMS, xyz);
}

/**
 * Convert LMS to XYZ
 */
export function lmsToXyz(lms: number[]): number[] {
  return multiplyMatrix(LMS_TO_XYZ, lms);
}

/**
 * Convert sRGB to LMS
 */
export function rgbToLms(rgb: RGB): number[] {
  const linear = rgbToLinear(rgb);
  const xyz = linearRgbToXyz(linear);
  return xyzToLms(xyz);
}

/**
 * Convert LMS to sRGB
 */
export function lmsToRgb(lms: number[]): RGB {
  const xyz = lmsToXyz(lms);
  const linear = xyzToLinearRgb(xyz);
  return linearToRgb(linear);
}

// ============================================
// Viénot 1999 Dichromacy Simulation
// ============================================

/**
 * Apply Viénot simulation for dichromacy
 * Works directly in linear RGB space
 */
function vienotSimulate(rgb: RGB, matrix: Matrix3x3): RGB {
  const linear = rgbToLinear(rgb);
  const simLinear = multiplyMatrix(matrix, linear);
  return linearToRgb(simLinear);
}

/**
 * Simulate protanopia (red-blind) using Viénot algorithm
 */
export function simulateProtanopia(rgb: RGB): RGB {
  return vienotSimulate(rgb, VIENOT_PROTAN);
}

/**
 * Simulate deuteranopia (green-blind) using Viénot algorithm
 */
export function simulateDeuteranopia(rgb: RGB): RGB {
  return vienotSimulate(rgb, VIENOT_DEUTAN);
}

/**
 * Simulate tritanopia (blue-blind) using Viénot algorithm
 */
export function simulateTritanopia(rgb: RGB): RGB {
  return vienotSimulate(rgb, VIENOT_TRITAN);
}

// ============================================
// Machado 2009 Anomalous Trichromacy Simulation
// ============================================

/**
 * Get the Machado simulation matrix for a given type and severity
 */
export function getMachadoMatrix(type: CVDType, severity: number): Matrix3x3 {
  // Clamp severity to 0-1
  const t = Math.max(0, Math.min(1, severity));

  let targetMatrix: Matrix3x3;

  switch (type) {
    case 'protanopia':
    case 'protanomaly':
      targetMatrix = MACHADO_PROTAN_100;
      break;
    case 'deuteranopia':
    case 'deuteranomaly':
      targetMatrix = MACHADO_DEUTAN_100;
      break;
    case 'tritanopia':
    case 'tritanomaly':
      targetMatrix = MACHADO_TRITAN_100;
      break;
    default:
      return IDENTITY_MATRIX;
  }

  // For dichromacy types, always use full severity
  if (type === 'protanopia' || type === 'deuteranopia' || type === 'tritanopia') {
    return targetMatrix;
  }

  // For anomaly types, interpolate based on severity
  return interpolateMatrix(IDENTITY_MATRIX, targetMatrix, t);
}

/**
 * Simulate anomalous trichromacy using Machado algorithm
 * Works directly in linear RGB space
 */
export function simulateAnomaly(rgb: RGB, type: CVDType, severity: number = 1.0): RGB {
  const matrix = getMachadoMatrix(type, severity);
  const linear = rgbToLinear(rgb);
  const simLinear = multiplyMatrix(matrix, linear);
  return linearToRgb(simLinear);
}

// ============================================
// Achromatopsia (Complete Color Blindness)
// ============================================

/**
 * Simulate achromatopsia (complete color blindness)
 * Uses luminance-only perception
 */
export function simulateAchromatopsia(rgb: RGB): RGB {
  // Calculate luminance using ITU-R BT.709 coefficients
  const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  const gray = Math.round(luminance);
  return { r: gray, g: gray, b: gray };
}

// ============================================
// Main Simulation Function
// ============================================

/**
 * Simulate how a color appears to someone with a specific type of color vision deficiency
 *
 * @param rgb - The input color
 * @param options - CVD type and optional severity (0-1)
 * @returns The simulated color as it would appear to someone with the specified CVD
 */
export function simulateCVD(rgb: RGB, options: CVDSimulationOptions): RGB {
  const { type, severity = 1.0 } = options;

  switch (type) {
    case 'normal':
      return { ...rgb };

    case 'protanopia':
      return simulateProtanopia(rgb);

    case 'protanomaly':
      return simulateAnomaly(rgb, 'protanomaly', severity);

    case 'deuteranopia':
      return simulateDeuteranopia(rgb);

    case 'deuteranomaly':
      return simulateAnomaly(rgb, 'deuteranomaly', severity);

    case 'tritanopia':
      return simulateTritanopia(rgb);

    case 'tritanomaly':
      return simulateAnomaly(rgb, 'tritanomaly', severity);

    case 'achromatopsia':
      return simulateAchromatopsia(rgb);

    default:
      return { ...rgb };
  }
}

/**
 * Simulate CVD from hex color
 */
export function simulateCVDHex(hex: string, options: CVDSimulationOptions): string {
  const rgb = hexToRgb(hex);
  const simulated = simulateCVD(rgb, options);
  return rgbToHex(simulated.r, simulated.g, simulated.b);
}

/**
 * Simulate a palette for all CVD types
 */
export function simulatePaletteForCVD(
  palette: RGB[],
  type: CVDType,
  severity: number = 1.0
): RGB[] {
  return palette.map(color => simulateCVD(color, { type, severity }));
}

/**
 * Get all simulations for a single color
 */
export function getAllSimulations(rgb: RGB): Record<CVDType, RGB> {
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

  const result: Partial<Record<CVDType, RGB>> = {};
  for (const type of types) {
    result[type] = simulateCVD(rgb, { type });
  }
  return result as Record<CVDType, RGB>;
}

/**
 * Get all simulations for a hex color
 */
export function getAllSimulationsHex(hex: string): Record<CVDType, string> {
  const rgb = hexToRgb(hex);
  const simulations = getAllSimulations(rgb);
  const result: Partial<Record<CVDType, string>> = {};
  for (const type of Object.keys(simulations) as CVDType[]) {
    const sim = simulations[type];
    result[type] = rgbToHex(sim.r, sim.g, sim.b);
  }
  return result as Record<CVDType, string>;
}

// ============================================
// Color Confusion Detection
// ============================================

/**
 * Calculate Euclidean distance between two colors in RGB space
 */
export function colorDistance(c1: RGB, c2: RGB): number {
  return Math.sqrt(Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2));
}

/**
 * Check if two colors would be confused by someone with a specific CVD type
 *
 * @param c1 - First color
 * @param c2 - Second color
 * @param type - CVD type to check
 * @param threshold - Minimum distance for colors to be distinguishable (default 30)
 * @returns true if colors would be confused (too similar after simulation)
 */
export function wouldConfuse(c1: RGB, c2: RGB, type: CVDType, threshold: number = 30): boolean {
  if (type === 'normal') {
    return colorDistance(c1, c2) < threshold;
  }

  const sim1 = simulateCVD(c1, { type });
  const sim2 = simulateCVD(c2, { type });
  return colorDistance(sim1, sim2) < threshold;
}

/**
 * Check if two colors would be confused for any common CVD type
 */
export function wouldConfuseAny(c1: RGB, c2: RGB, threshold: number = 30): CVDType[] {
  const confusingTypes: CVDType[] = [];
  const typesToCheck: CVDType[] = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

  for (const type of typesToCheck) {
    if (wouldConfuse(c1, c2, type, threshold)) {
      confusingTypes.push(type);
    }
  }

  return confusingTypes;
}

/**
 * Find all confusing pairs in a palette for a given CVD type
 */
export function findConfusingPairs(
  palette: RGB[],
  type: CVDType,
  threshold: number = 30
): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];

  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      if (wouldConfuse(palette[i], palette[j], type, threshold)) {
        pairs.push([i, j]);
      }
    }
  }

  return pairs;
}

// ============================================
// Safe Color Suggestions
// ============================================

// Colors that are generally safe for most CVD types
export const SAFE_COLORS = {
  blue: { r: 59, g: 130, b: 246 }, // Blue is preserved in red-green CVD
  orange: { r: 249, g: 115, b: 22 }, // Orange pairs well with blue
  yellow: { r: 234, g: 179, b: 8 }, // Yellow is distinct from blue
  purple: { r: 168, g: 85, b: 247 }, // Purple can work but test carefully
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
};

/**
 * Check if a color is "safe" (distinguishable) for all major CVD types
 */
export function isColorSafe(color: RGB, referenceColors: RGB[], threshold: number = 30): boolean {
  const typesToCheck: CVDType[] = ['protanopia', 'deuteranopia', 'tritanopia'];

  for (const ref of referenceColors) {
    for (const type of typesToCheck) {
      if (wouldConfuse(color, ref, type, threshold)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Suggest a safe alternative from a palette
 * Returns the color from palette that is most distinguishable under CVD simulation
 */
export function suggestSafeAlternative(
  originalColor: RGB,
  palette: RGB[],
  type: CVDType
): RGB | null {
  let bestAlternative: RGB | null = null;
  let maxDistance = 0;

  const originalSim = simulateCVD(originalColor, { type });

  for (const color of palette) {
    if (colorDistance(color, originalColor) < 10) continue; // Skip similar colors

    const colorSim = simulateCVD(color, { type });
    const distance = colorDistance(originalSim, colorSim);

    if (distance > maxDistance) {
      maxDistance = distance;
      bestAlternative = color;
    }
  }

  return bestAlternative;
}
