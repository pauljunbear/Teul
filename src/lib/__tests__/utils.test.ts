import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  rgbToHex,
  getLuminance,
  getContrastRatio,
  calculateContrastRatio,
  colorDistance,
  rgbToLab,
  rgbToOklab,
  oklabToOklch,
  oklchToOklab,
  hexToOklch,
  rgbToHsl,
  hexToHsl,
} from '../utils';
import { generateColorScale } from '../colorScale';

// ============================================
// Basic Color Conversions
// ============================================

describe('hexToRgb', () => {
  it('converts hex with hash to RGB', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('converts hex without hash to RGB', () => {
    expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('handles uppercase hex values', () => {
    expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('AABBCC')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it.each(['invalid', '#gg0000', '', '#fff', '1234567', '##123456', ' 123456'])(
    'throws for invalid hex format %j',
    hex => {
      expect(() => hexToRgb(hex)).toThrow(`Invalid hex color: ${hex}`);
    }
  );

  it('does not treat invalid input as black', () => {
    expect(() => hexToRgb('not-black')).toThrow();
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('rgbToHex', () => {
  it('converts RGB to hex with hash', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
    expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
  });

  it('pads single digit hex values', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(15, 15, 15)).toBe('#0f0f0f');
  });

  it('handles full white', () => {
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
  });
});

// ============================================
// Luminance and Contrast
// ============================================

describe('getLuminance', () => {
  it('calculates luminance for pure colors', () => {
    // Black has 0 luminance
    expect(getLuminance(0, 0, 0)).toBe(0);

    // White has 1 luminance
    expect(getLuminance(255, 255, 255)).toBeCloseTo(1, 2);

    // Red has ~0.2126 luminance (from coefficient)
    expect(getLuminance(255, 0, 0)).toBeCloseTo(0.2126, 2);

    // Green has highest luminance contribution
    expect(getLuminance(0, 255, 0)).toBeCloseTo(0.7152, 2);

    // Blue has lowest luminance contribution
    expect(getLuminance(0, 0, 255)).toBeCloseTo(0.0722, 2);
  });

  it('calculates luminance for gray values', () => {
    // Mid gray should be around 0.21
    const midGray = getLuminance(128, 128, 128);
    expect(midGray).toBeGreaterThan(0.1);
    expect(midGray).toBeLessThan(0.3);
  });
});

describe('getContrastRatio', () => {
  it('calculates maximum contrast for black/white', () => {
    const ratio = getContrastRatio([0, 0, 0], [255, 255, 255]);
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('returns 1 for identical colors', () => {
    const ratio = getContrastRatio([128, 128, 128], [128, 128, 128]);
    expect(ratio).toBe(1);
  });

  it('is symmetric (order independent)', () => {
    const ratio1 = getContrastRatio([255, 0, 0], [0, 0, 255]);
    const ratio2 = getContrastRatio([0, 0, 255], [255, 0, 0]);
    expect(ratio1).toBeCloseTo(ratio2, 5);
  });

  it('calculates known contrast values', () => {
    // Black on white should be 21:1
    expect(getContrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);

    // Dark gray on white should be less than 21:1
    const darkGrayOnWhite = getContrastRatio([85, 85, 85], [255, 255, 255]);
    expect(darkGrayOnWhite).toBeGreaterThan(7);
    expect(darkGrayOnWhite).toBeLessThan(10);
  });
});

describe('calculateContrastRatio', () => {
  it('calculates contrast from hex values', () => {
    const ratio = calculateContrastRatio('#000000', '#ffffff');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('works with hex values without hash', () => {
    const ratio = calculateContrastRatio('000000', 'ffffff');
    expect(ratio).toBeCloseTo(21, 0);
  });
});

// ============================================
// LAB Color Space
// ============================================

describe('rgbToLab', () => {
  it('converts black to LAB', () => {
    const lab = rgbToLab(0, 0, 0);
    expect(lab[0]).toBeCloseTo(0, 0); // L = 0 for black
  });

  it('converts white to LAB', () => {
    const lab = rgbToLab(255, 255, 255);
    expect(lab[0]).toBeCloseTo(100, 0); // L = 100 for white
    expect(lab[1]).toBeCloseTo(0, 1); // a = 0 (neutral)
    expect(lab[2]).toBeCloseTo(0, 1); // b = 0 (neutral)
  });

  it('converts red to LAB with positive a', () => {
    const lab = rgbToLab(255, 0, 0);
    expect(lab[1]).toBeGreaterThan(0); // Red has positive a
  });

  it('converts green to LAB with negative a', () => {
    const lab = rgbToLab(0, 255, 0);
    expect(lab[1]).toBeLessThan(0); // Green has negative a
  });
});

describe('colorDistance', () => {
  it('returns 0 for identical colors', () => {
    const lab = rgbToLab(128, 128, 128);
    expect(colorDistance(lab, lab)).toBe(0);
  });

  it('calculates distance between black and white', () => {
    const black = rgbToLab(0, 0, 0);
    const white = rgbToLab(255, 255, 255);
    const distance = colorDistance(black, white);
    expect(distance).toBeCloseTo(100, 0); // L difference is ~100
  });

  it('is symmetric', () => {
    const lab1 = rgbToLab(255, 0, 0);
    const lab2 = rgbToLab(0, 0, 255);
    expect(colorDistance(lab1, lab2)).toBe(colorDistance(lab2, lab1));
  });
});

// ============================================
// OKLab and OKLCH Color Spaces
// ============================================

describe('rgbToOklab', () => {
  it('converts black to OKLab', () => {
    const oklab = rgbToOklab(0, 0, 0);
    expect(oklab.L).toBeCloseTo(0, 2);
  });

  it('converts white to OKLab', () => {
    const oklab = rgbToOklab(255, 255, 255);
    expect(oklab.L).toBeCloseTo(1, 2);
    expect(oklab.a).toBeCloseTo(0, 2);
    expect(oklab.b).toBeCloseTo(0, 2);
  });
});

describe('oklabToOklch and oklchToOklab', () => {
  it('converts neutral OKLab to OKLCH with zero chroma', () => {
    const oklch = oklabToOklch(0.5, 0, 0);
    expect(oklch.c).toBeCloseTo(0, 5);
    expect(oklch.l).toBe(0.5);
  });

  it('roundtrips OKLab through OKLCH', () => {
    const originalL = 0.7,
      originalA = 0.1,
      originalB = -0.05;
    const oklch = oklabToOklch(originalL, originalA, originalB);
    const oklab = oklchToOklab(oklch.l, oklch.c, oklch.h);

    expect(oklab.L).toBeCloseTo(originalL, 5);
    expect(oklab.a).toBeCloseTo(originalA, 5);
    expect(oklab.b).toBeCloseTo(originalB, 5);
  });

  it('calculates correct hue for pure red direction', () => {
    const oklch = oklabToOklch(0.5, 0.1, 0);
    expect(oklch.h).toBeCloseTo(0, 0); // Hue ~0 for positive a, zero b
  });
});

describe('hexToOklch', () => {
  it('converts hex to OKLCH', () => {
    const oklch = hexToOklch('#ff0000');
    expect(oklch.l).toBeGreaterThan(0);
    expect(oklch.l).toBeLessThan(1);
    expect(oklch.c).toBeGreaterThan(0); // Red is saturated
  });

  it('converts black to low lightness', () => {
    const oklch = hexToOklch('#000000');
    expect(oklch.l).toBeCloseTo(0, 2);
  });

  it('converts white to high lightness', () => {
    const oklch = hexToOklch('#ffffff');
    expect(oklch.l).toBeCloseTo(1, 2);
    expect(oklch.c).toBeCloseTo(0, 2); // White has no chroma
  });
});

// ============================================
// HSL Color Space
// ============================================

describe('rgbToHsl', () => {
  it('converts pure red to HSL', () => {
    const hsl = rgbToHsl(255, 0, 0);
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  it('converts pure green to HSL', () => {
    const hsl = rgbToHsl(0, 255, 0);
    expect(hsl.h).toBe(120);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  it('converts pure blue to HSL', () => {
    const hsl = rgbToHsl(0, 0, 255);
    expect(hsl.h).toBe(240);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  it('converts gray to HSL with zero saturation', () => {
    const hsl = rgbToHsl(128, 128, 128);
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBe(50);
  });

  it('converts white to HSL', () => {
    const hsl = rgbToHsl(255, 255, 255);
    expect(hsl.l).toBe(100);
  });

  it('converts black to HSL', () => {
    const hsl = rgbToHsl(0, 0, 0);
    expect(hsl.l).toBe(0);
  });
});

describe('hexToHsl', () => {
  it('converts hex to HSL', () => {
    const hsl = hexToHsl('#ff0000');
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });
});

// ============================================
// Color Scale Generation
// ============================================

describe('generateColorScale', () => {
  it('generates 12 steps', () => {
    const scale = generateColorScale('#3366cc');
    expect(scale.steps).toHaveLength(12);
  });

  it('step 9 is the base color', () => {
    const baseHex = '#3366cc';
    const scale = generateColorScale(baseHex);
    const step9 = scale.steps.find(s => s.step === 9);

    expect(step9).toBeDefined();
    // Step 9 should be very close to the base color
    const step9Rgb = hexToRgb(step9!.hex);
    const baseRgb = hexToRgb(baseHex);

    expect(step9Rgb.r).toBeCloseTo(baseRgb.r, -1);
    expect(step9Rgb.g).toBeCloseTo(baseRgb.g, -1);
    expect(step9Rgb.b).toBeCloseTo(baseRgb.b, -1);
  });

  it('light mode has lighter early steps', () => {
    const scale = generateColorScale('#3366cc', 'light');
    const step1Oklch = hexToOklch(scale.steps[0].hex);
    const step9Oklch = hexToOklch(scale.steps[8].hex);

    expect(step1Oklch.l).toBeGreaterThan(step9Oklch.l);
  });

  it('dark mode has darker early steps', () => {
    const scale = generateColorScale('#3366cc', 'dark');
    const step1Oklch = hexToOklch(scale.steps[0].hex);
    const step9Oklch = hexToOklch(scale.steps[8].hex);

    expect(step1Oklch.l).toBeLessThan(step9Oklch.l);
  });

  it('each step has usage description', () => {
    const scale = generateColorScale('#ff5500');
    scale.steps.forEach(step => {
      expect(step.usage).toBeDefined();
      expect(step.usage.length).toBeGreaterThan(0);
    });
  });

  it('sets the name and baseHex correctly', () => {
    const scale = generateColorScale('#cc3300', 'light', 'Orange');
    expect(scale.name).toBe('Orange');
    expect(scale.baseHex).toBe('#cc3300');
    expect(scale.mode).toBe('light');
  });
});

describe('generateColorScales', () => {
  it('generates both light and dark scales', () => {
    const scales = {
      light: generateColorScale('#3366cc', 'light', 'Blue'),
      dark: generateColorScale('#3366cc', 'dark', 'Blue'),
    };

    expect(scales.light).toBeDefined();
    expect(scales.dark).toBeDefined();
    expect(scales.light.mode).toBe('light');
    expect(scales.dark.mode).toBe('dark');
    expect(scales.light.name).toBe('Blue');
    expect(scales.dark.name).toBe('Blue');
  });

  it('both scales have 12 steps', () => {
    const scales = {
      light: generateColorScale('#ff6600', 'light'),
      dark: generateColorScale('#ff6600', 'dark'),
    };

    expect(scales.light.steps).toHaveLength(12);
    expect(scales.dark.steps).toHaveLength(12);
  });
});
