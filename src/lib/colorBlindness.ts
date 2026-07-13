/**
 * Color Vision Deficiency (CVD) Simulation Library
 *
 * Implements Machado et al. 2009's published matrices for approximating
 * dichromacy and anomalous trichromacy across supported severity levels.
 *
 * References:
 * - Machado et al. 2009: "A physiologically-based model for simulation of color vision deficiency"
 */

import { hexToRgb, rgbToHex, type RGB } from './utils';

// ============================================
// Types
// ============================================

export type CVDType =
  | 'normal'
  | 'protanopia' // L-cone-related dichromacy
  | 'protanomaly' // L-cone-related anomalous trichromacy
  | 'deuteranopia' // M-cone-related dichromacy
  | 'deuteranomaly' // M-cone-related anomalous trichromacy
  | 'tritanopia' // S-cone-related dichromacy
  | 'tritanomaly' // S-cone-related anomalous trichromacy
  | 'achromatopsia'; // Grayscale approximation for little/no color discrimination

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
    description: 'Typical trichromatic color vision; individual color perception still varies.',
    prevalence: 'Baseline; no single population-wide percentage',
    affectedCone: 'none',
  },
  protanopia: {
    type: 'protanopia',
    name: 'Protanopia',
    description: 'An L-cone-related dichromacy that reduces red-green discrimination.',
    prevalence: '~1% of males; much rarer in females',
    affectedCone: 'L',
  },
  protanomaly: {
    type: 'protanomaly',
    name: 'Protanomaly',
    description: 'L-cone-related anomalous trichromacy with reduced red-green discrimination.',
    prevalence: '~1% of males; much rarer in females',
    affectedCone: 'L',
  },
  deuteranopia: {
    type: 'deuteranopia',
    name: 'Deuteranopia',
    description: 'An M-cone-related dichromacy that reduces red-green discrimination.',
    prevalence: '~1% of males; much rarer in females',
    affectedCone: 'M',
  },
  deuteranomaly: {
    type: 'deuteranomaly',
    name: 'Deuteranomaly',
    description: 'M-cone-related anomalous trichromacy; a common red-green deficiency.',
    prevalence: '~5% of males; much rarer in females',
    affectedCone: 'M',
  },
  tritanopia: {
    type: 'tritanopia',
    name: 'Tritanopia',
    description: 'An S-cone-related dichromacy that reduces blue-yellow discrimination.',
    prevalence: 'Rare; estimates vary by population',
    affectedCone: 'S',
  },
  tritanomaly: {
    type: 'tritanomaly',
    name: 'Tritanomaly',
    description: 'S-cone-related anomalous trichromacy with reduced blue-yellow discrimination.',
    prevalence: 'Rare; estimates vary by population',
    affectedCone: 'S',
  },
  achromatopsia: {
    type: 'achromatopsia',
    name: 'Achromatopsia',
    description:
      'A rare condition with little or no color discrimination; this preview is a grayscale approximation.',
    prevalence: 'Rare; estimates vary by population',
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
// Machado 2009 Matrices
// ============================================

type Matrix3x3 = number[][];

/**
 * Machado et al. 2009 provides matrices for different severity levels.
 * These matrices operate directly in RGB space.
 * Severity levels: 0.0 (normal) to 1.0 (dichromacy)
 *
 * The authors' supplement provides matrices at 0.1 severity increments.
 * Intermediate severities are interpolated between the nearest two matrices,
 * as prescribed by the supplement (for example, 0.873 uses 0.8 and 0.9).
 * Source: https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
 */

const MACHADO_PROTAN: Matrix3x3[] = [
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  [
    [0.856167, 0.182038, -0.038205],
    [0.029342, 0.955115, 0.015544],
    [-0.00288, -0.001563, 1.004443],
  ],
  [
    [0.734766, 0.334872, -0.069637],
    [0.05184, 0.919198, 0.028963],
    [-0.004928, -0.004209, 1.009137],
  ],
  [
    [0.630323, 0.465641, -0.095964],
    [0.069181, 0.890046, 0.040773],
    [-0.006308, -0.007724, 1.014032],
  ],
  [
    [0.539009, 0.579343, -0.118352],
    [0.082546, 0.866121, 0.051332],
    [-0.007136, -0.011959, 1.019095],
  ],
  [
    [0.458064, 0.679578, -0.137642],
    [0.092785, 0.846313, 0.060902],
    [-0.007494, -0.016807, 1.024301],
  ],
  [
    [0.38545, 0.769005, -0.154455],
    [0.100526, 0.829802, 0.069673],
    [-0.007442, -0.02219, 1.029632],
  ],
  [
    [0.319627, 0.849633, -0.169261],
    [0.106241, 0.815969, 0.07779],
    [-0.007025, -0.028051, 1.035076],
  ],
  [
    [0.259411, 0.923008, -0.18242],
    [0.110296, 0.80434, 0.085364],
    [-0.006276, -0.034346, 1.040622],
  ],
  [
    [0.203876, 0.990338, -0.194214],
    [0.112975, 0.794542, 0.092483],
    [-0.005222, -0.041043, 1.046265],
  ],
  [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
];

const MACHADO_DEUTAN: Matrix3x3[] = [
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  [
    [0.866435, 0.177704, -0.044139],
    [0.049567, 0.939063, 0.01137],
    [-0.003453, 0.007233, 0.99622],
  ],
  [
    [0.760729, 0.319078, -0.079807],
    [0.090568, 0.889315, 0.020117],
    [-0.006027, 0.013325, 0.992702],
  ],
  [
    [0.675425, 0.43385, -0.109275],
    [0.125303, 0.847755, 0.026942],
    [-0.00795, 0.018572, 0.989378],
  ],
  [
    [0.605511, 0.52856, -0.134071],
    [0.155318, 0.812366, 0.032316],
    [-0.009376, 0.023176, 0.9862],
  ],
  [
    [0.547494, 0.607765, -0.155259],
    [0.181692, 0.781742, 0.036566],
    [-0.01041, 0.027275, 0.983136],
  ],
  [
    [0.498864, 0.674741, -0.173604],
    [0.205199, 0.754872, 0.039929],
    [-0.011131, 0.030969, 0.980162],
  ],
  [
    [0.457771, 0.731899, -0.18967],
    [0.226409, 0.731012, 0.042579],
    [-0.011595, 0.034333, 0.977261],
  ],
  [
    [0.422823, 0.781057, -0.203881],
    [0.245752, 0.709602, 0.044646],
    [-0.011843, 0.037423, 0.974421],
  ],
  [
    [0.392952, 0.82361, -0.216562],
    [0.263559, 0.69021, 0.046232],
    [-0.01191, 0.040281, 0.97163],
  ],
  [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
];

const MACHADO_TRITAN: Matrix3x3[] = [
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  [
    [0.92667, 0.092514, -0.019184],
    [0.021191, 0.964503, 0.014306],
    [0.008437, 0.054813, 0.93675],
  ],
  [
    [0.89572, 0.13333, -0.02905],
    [0.029997, 0.9454, 0.024603],
    [0.013027, 0.104707, 0.882266],
  ],
  [
    [0.905871, 0.127791, -0.033662],
    [0.026856, 0.941251, 0.031893],
    [0.01341, 0.148296, 0.838294],
  ],
  [
    [0.948035, 0.08949, -0.037526],
    [0.014364, 0.946792, 0.038844],
    [0.010853, 0.193991, 0.795156],
  ],
  [
    [1.017277, 0.027029, -0.044306],
    [-0.006113, 0.958479, 0.047634],
    [0.006379, 0.248708, 0.744913],
  ],
  [
    [1.104996, -0.046633, -0.058363],
    [-0.032137, 0.971635, 0.060503],
    [0.001336, 0.317922, 0.680742],
  ],
  [
    [1.193214, -0.109812, -0.083402],
    [-0.058496, 0.97941, 0.079086],
    [-0.002346, 0.403492, 0.598854],
  ],
  [
    [1.257728, -0.139648, -0.118081],
    [-0.078003, 0.975409, 0.102594],
    [-0.003316, 0.501214, 0.502102],
  ],
  [
    [1.278864, -0.125333, -0.153531],
    [-0.084748, 0.957674, 0.127074],
    [-0.000989, 0.601151, 0.399838],
  ],
  [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
];

// ============================================
// Matrix Operations
// ============================================

function multiplyMatrix(m: Matrix3x3, v: number[]): number[] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function interpolateMatrix(start: Matrix3x3, end: Matrix3x3, t: number): Matrix3x3 {
  const result: Matrix3x3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      result[i][j] = start[i][j] * (1 - t) + end[i][j] * t;
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
function linearRgbToXyz(linear: number[]): number[] {
  return multiplyMatrix(RGB_TO_XYZ, linear);
}

/**
 * Convert XYZ to linear RGB
 */
function xyzToLinearRgb(xyz: number[]): number[] {
  return multiplyMatrix(XYZ_TO_RGB, xyz);
}

/**
 * Convert XYZ to LMS
 */
function xyzToLms(xyz: number[]): number[] {
  return multiplyMatrix(XYZ_TO_LMS, xyz);
}

/**
 * Convert LMS to XYZ
 */
function lmsToXyz(lms: number[]): number[] {
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

/**
 * Approximate protanopia using Machado's full-severity protan matrix.
 */
export function simulateProtanopia(rgb: RGB): RGB {
  return simulateAnomaly(rgb, 'protanopia', 1);
}

/**
 * Approximate deuteranopia using Machado's full-severity deutan matrix.
 */
export function simulateDeuteranopia(rgb: RGB): RGB {
  return simulateAnomaly(rgb, 'deuteranopia', 1);
}

/**
 * Approximate tritanopia using Machado's full-severity tritan matrix.
 */
export function simulateTritanopia(rgb: RGB): RGB {
  return simulateAnomaly(rgb, 'tritanopia', 1);
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

  let matrices: Matrix3x3[];

  switch (type) {
    case 'protanopia':
    case 'protanomaly':
      matrices = MACHADO_PROTAN;
      break;
    case 'deuteranopia':
    case 'deuteranomaly':
      matrices = MACHADO_DEUTAN;
      break;
    case 'tritanopia':
    case 'tritanomaly':
      matrices = MACHADO_TRITAN;
      break;
    default:
      return IDENTITY_MATRIX;
  }

  // For dichromacy types, always use full severity
  if (type === 'protanopia' || type === 'deuteranopia' || type === 'tritanopia') {
    return matrices[10];
  }

  const scaledSeverity = t * 10;
  const lowerIndex = Math.floor(scaledSeverity);
  const upperIndex = Math.ceil(scaledSeverity);

  if (lowerIndex === upperIndex) {
    return matrices[lowerIndex];
  }

  return interpolateMatrix(matrices[lowerIndex], matrices[upperIndex], scaledSeverity - lowerIndex);
}

/**
 * Simulate a supported CVD category using the Machado model.
 * Works directly in linear RGB space
 */
export function simulateAnomaly(rgb: RGB, type: CVDType, severity: number = 1.0): RGB {
  const matrix = getMachadoMatrix(type, severity);
  const linear = rgbToLinear(rgb);
  const simLinear = multiplyMatrix(matrix, linear);
  return linearToRgb(simLinear);
}

// ============================================
// Achromatopsia Grayscale Approximation
// ============================================

/**
 * Approximate achromatopsia as luminance-only grayscale.
 * This intentionally does not claim to reproduce an individual's perception.
 */
export function simulateAchromatopsia(rgb: RGB): RGB {
  const [r, g, b] = rgbToLinear(rgb);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return linearToRgb([luminance, luminance, luminance]);
}

// ============================================
// Main Simulation Function
// ============================================

/**
 * Produce an algorithmic preview for a color vision deficiency category.
 * This is a design aid, not a reproduction of any individual's perception.
 *
 * @param rgb - The input color
 * @param options - CVD type and optional severity (0-1)
 * @returns The transformed preview color
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
