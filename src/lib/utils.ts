import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getSystemTheme(): "dark" | "light" {
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }
  return "dark"
}

export function setTheme(theme: "dark" | "light" | "system") {
  const root = window.document.documentElement
  root.classList.remove("light", "dark")
  
  if (theme === "system") {
    const systemTheme = getSystemTheme()
    root.classList.add(systemTheme)
    return
  }
  
  root.classList.add(theme)
}

// Color utilities
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 }
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}

// Luminance calculation for contrast
export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

// WCAG contrast ratio
export function getContrastRatio(rgb1: number[], rgb2: number[]): number {
  const l1 = getLuminance(rgb1[0], rgb1[1], rgb1[2])
  const l2 = getLuminance(rgb2[0], rgb2[1], rgb2[2])
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export function getContrastLevel(ratio: number): { level: string; color: string; pass: boolean } {
  if (ratio >= 7) return { level: 'AAA', color: 'text-green-500', pass: true }
  if (ratio >= 4.5) return { level: 'AA', color: 'text-green-400', pass: true }
  if (ratio >= 3) return { level: 'AA Large', color: 'text-yellow-500', pass: true }
  return { level: 'Fail', color: 'text-red-500', pass: false }
}

// Accessibility rating type
export type AccessibilityRating = 'AAA' | 'AA' | 'AA Large' | 'Fail'

/**
 * Calculate contrast ratio between two hex colors
 * Returns a value between 1 and 21 (higher = more contrast)
 */
export function calculateContrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1)
  const rgb2 = hexToRgb(hex2)
  return getContrastRatio([rgb1.r, rgb1.g, rgb1.b], [rgb2.r, rgb2.g, rgb2.b])
}

/**
 * Get accessibility rating for a foreground/background color pair
 * Based on WCAG 2.1 guidelines
 */
export function getAccessibilityRating(
  foregroundHex: string,
  backgroundHex: string
): { rating: AccessibilityRating; ratio: number; pass: boolean } {
  const ratio = calculateContrastRatio(foregroundHex, backgroundHex)
  
  if (ratio >= 7) {
    return { rating: 'AAA', ratio, pass: true }
  } else if (ratio >= 4.5) {
    return { rating: 'AA', ratio, pass: true }
  } else if (ratio >= 3) {
    return { rating: 'AA Large', ratio, pass: true }
  }
  return { rating: 'Fail', ratio, pass: false }
}

/**
 * Determine if text should be light or dark for best contrast on a background
 */
export function getTextColorForBackground(backgroundHex: string): 'light' | 'dark' {
  const { r, g, b } = hexToRgb(backgroundHex)
  const luminance = getLuminance(r, g, b)
  return luminance > 0.179 ? 'dark' : 'light'
}

/**
 * Get recommended text hex color (black or white) for a background
 */
export function getContrastingTextColor(backgroundHex: string): string {
  return getTextColorForBackground(backgroundHex) === 'dark' ? '#000000' : '#ffffff'
}

// Color distance using LAB (Delta E CIE76)
export function colorDistance(lab1: number[], lab2: number[]): number {
  return Math.sqrt(
    Math.pow(lab1[0] - lab2[0], 2) +
    Math.pow(lab1[1] - lab2[1], 2) +
    Math.pow(lab1[2] - lab2[2], 2)
  )
}

// RGB to LAB conversion
export function rgbToLab(r: number, g: number, b: number): number[] {
  // RGB to XYZ
  let rr = r / 255, gg = g / 255, bb = b / 255
  
  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92
  
  rr *= 100; gg *= 100; bb *= 100
  
  const x = rr * 0.4124 + gg * 0.3576 + bb * 0.1805
  const y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722
  const z = rr * 0.0193 + gg * 0.1192 + bb * 0.9505
  
  // XYZ to LAB
  let xx = x / 95.047, yy = y / 100.000, zz = z / 108.883
  
  xx = xx > 0.008856 ? Math.pow(xx, 1/3) : (7.787 * xx) + 16/116
  yy = yy > 0.008856 ? Math.pow(yy, 1/3) : (7.787 * yy) + 16/116
  zz = zz > 0.008856 ? Math.pow(zz, 1/3) : (7.787 * zz) + 16/116
  
  const L = (116 * yy) - 16
  const a = 500 * (xx - yy)
  const bVal = 200 * (yy - zz)
  
  return [L, a, bVal]
}

// ============================================
// OKLCH Color Space Conversions
// OKLCH is perceptually uniform - ideal for generating color scales
// ============================================

export interface OKLCH {
  l: number  // Lightness: 0-1
  c: number  // Chroma: 0-0.4 (varies by hue)
  h: number  // Hue: 0-360 degrees
}

export interface OKLab {
  L: number  // Lightness: 0-1
  a: number  // Green-Red axis: ~-0.4 to 0.4
  b: number  // Blue-Yellow axis: ~-0.4 to 0.4
}

export interface RGB {
  r: number  // 0-255
  g: number  // 0-255
  b: number  // 0-255
}

export interface HSL {
  h: number  // 0-360
  s: number  // 0-100
  l: number  // 0-100
}

// sRGB to Linear RGB (remove gamma correction)
function srgbToLinear(c: number): number {
  const val = c / 255
  return val <= 0.04045 
    ? val / 12.92 
    : Math.pow((val + 0.055) / 1.055, 2.4)
}

// Linear RGB to sRGB (apply gamma correction)
function linearToSrgb(c: number): number {
  const val = c <= 0.0031308 
    ? c * 12.92 
    : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.round(Math.max(0, Math.min(255, val * 255)))
}

// RGB to OKLab
export function rgbToOklab(r: number, g: number, b: number): OKLab {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  }
}

// OKLab to RGB
export function oklabToRgb(L: number, a: number, b: number): RGB {
  const l = L + 0.3963377774 * a + 0.2158037573 * b
  const m = L - 0.1055613458 * a - 0.0638541728 * b
  const s = L - 0.0894841775 * a - 1.2914855480 * b

  const l3 = l * l * l
  const m3 = m * m * m
  const s3 = s * s * s

  const lr = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3

  return {
    r: linearToSrgb(lr),
    g: linearToSrgb(lg),
    b: linearToSrgb(lb),
  }
}

// OKLab to OKLCH
export function oklabToOklch(L: number, a: number, b: number): OKLCH {
  const c = Math.sqrt(a * a + b * b)
  let h = Math.atan2(b, a) * (180 / Math.PI)
  if (h < 0) h += 360
  return { l: L, c, h }
}

// OKLCH to OKLab
export function oklchToOklab(l: number, c: number, h: number): OKLab {
  const hRad = h * (Math.PI / 180)
  return {
    L: l,
    a: c * Math.cos(hRad),
    b: c * Math.sin(hRad),
  }
}

// Hex to OKLCH (convenience function)
export function hexToOklch(hex: string): OKLCH {
  const { r, g, b } = hexToRgb(hex)
  const oklab = rgbToOklab(r, g, b)
  return oklabToOklch(oklab.L, oklab.a, oklab.b)
}

// OKLCH to Hex (convenience function)
export function oklchToHex(l: number, c: number, h: number): string {
  const oklab = oklchToOklab(l, c, h)
  const rgb = oklabToRgb(oklab.L, oklab.a, oklab.b)
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

// RGB to HSL
export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255
  g /= 255
  b /= 255
  
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

// HSL to RGB
export function hslToRgb(h: number, s: number, l: number): RGB {
  h /= 360
  s /= 100
  l /= 100

  let r, g, b

  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  }
}

// Hex to HSL
export function hexToHsl(hex: string): HSL {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHsl(r, g, b)
}

// HSL to Hex
export function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l)
  return rgbToHex(r, g, b)
}

// Clamp OKLCH values to valid sRGB gamut (approximate)
export function clampToGamut(l: number, c: number, h: number): OKLCH {
  // Binary search to find max chroma that fits in sRGB
  let low = 0
  let high = c
  
  while (high - low > 0.001) {
    const mid = (low + high) / 2
    const oklab = oklchToOklab(l, mid, h)
    const rgb = oklabToRgb(oklab.L, oklab.a, oklab.b)
    
    if (rgb.r >= 0 && rgb.r <= 255 && 
        rgb.g >= 0 && rgb.g <= 255 && 
        rgb.b >= 0 && rgb.b <= 255) {
      low = mid
    } else {
      high = mid
    }
  }
  
  return { l, c: low, h }
}

// ============================================
// Color Scale Generation
// Follows Radix UI conventions: 12 steps, step 9 = base color
// ============================================

export interface ColorStep {
  step: number       // 1-12
  hex: string
  oklch: OKLCH
  usage: string      // What this step is typically used for
}

export interface ColorScale {
  name: string
  baseHex: string
  steps: ColorStep[]
  mode: 'light' | 'dark'
}

// Radix-style step usage descriptions
const STEP_USAGE: Record<number, string> = {
  1: 'App background',
  2: 'Subtle background',
  3: 'UI element background',
  4: 'Hovered UI element background',
  5: 'Active/Selected UI element background',
  6: 'Subtle borders and separators',
  7: 'UI element border and focus rings',
  8: 'Hovered UI element border',
  9: 'Solid backgrounds',
  10: 'Hovered solid backgrounds',
  11: 'Low-contrast text',
  12: 'High-contrast text',
}

// Light mode lightness targets (step 9 = base, adjusted from there)
// These are approximate and will be adjusted based on the base color
const LIGHT_MODE_LIGHTNESS: Record<number, number> = {
  1: 0.99,   // Nearly white
  2: 0.97,   // Very light
  3: 0.94,   // Light
  4: 0.91,   // Light hover
  5: 0.88,   // Light active
  6: 0.85,   // Light border
  7: 0.78,   // Border
  8: 0.70,   // Border hover
  9: 0.55,   // Base (will be overridden)
  10: 0.50,  // Base hover
  11: 0.40,  // Text low contrast
  12: 0.25,  // Text high contrast
}

// Dark mode lightness targets (inverted from light mode)
const DARK_MODE_LIGHTNESS: Record<number, number> = {
  1: 0.12,   // Nearly black
  2: 0.14,   // Very dark
  3: 0.17,   // Dark
  4: 0.20,   // Dark hover
  5: 0.23,   // Dark active
  6: 0.26,   // Dark border
  7: 0.32,   // Border
  8: 0.40,   // Border hover
  9: 0.55,   // Base (will be overridden)
  10: 0.60,  // Base hover
  11: 0.75,  // Text low contrast
  12: 0.90,  // Text high contrast
}

// Chroma multipliers for each step (how saturated each step should be)
const CHROMA_MULTIPLIERS: Record<number, number> = {
  1: 0.03,   // Very desaturated
  2: 0.06,
  3: 0.12,
  4: 0.18,
  5: 0.25,
  6: 0.33,
  7: 0.50,
  8: 0.70,
  9: 1.00,   // Full saturation (base)
  10: 1.05,  // Slightly more saturated for hover
  11: 0.85,  // Reduced for text legibility
  12: 0.70,  // Further reduced for high contrast text
}

/**
 * Generate a 12-step color scale from a base color
 * Step 9 is the base color, steps 1-8 are lighter, steps 10-12 are darker/text
 * 
 * @param baseHex - The base color in hex format
 * @param mode - 'light' or 'dark' mode
 * @param name - Optional name for the scale
 */
export function generateColorScale(
  baseHex: string,
  mode: 'light' | 'dark' = 'light',
  name: string = 'Custom'
): ColorScale {
  const baseOklch = hexToOklch(baseHex)
  const lightnessTargets = mode === 'light' ? LIGHT_MODE_LIGHTNESS : DARK_MODE_LIGHTNESS
  
  // Use the base color's actual lightness as reference for step 9
  const baseLightness = baseOklch.l
  const baseChroma = baseOklch.c
  const hue = baseOklch.h
  
  const steps: ColorStep[] = []
  
  for (let step = 1; step <= 12; step++) {
    let lightness: number
    let chroma: number
    
    if (step === 9) {
      // Step 9 IS the base color
      lightness = baseLightness
      chroma = baseChroma
    } else {
      // Calculate lightness relative to targets, but adjusted for base color
      const targetL = lightnessTargets[step]
      const baseTargetL = lightnessTargets[9]
      
      // Scale the lightness based on how far from step 9
      if (mode === 'light') {
        if (step < 9) {
          // Lighter steps: interpolate between target and 1.0
          const t = (9 - step) / 8
          lightness = baseLightness + (1.0 - baseLightness) * t * (1 - targetL + 0.5)
          lightness = Math.min(0.995, lightness)
        } else {
          // Darker steps: interpolate towards target
          const t = (step - 9) / 3
          lightness = baseLightness - (baseLightness - targetL) * t
          lightness = Math.max(0.15, lightness)
        }
      } else {
        // Dark mode: invert the logic
        if (step < 9) {
          // Darker backgrounds
          const t = (9 - step) / 8
          lightness = baseLightness - (baseLightness - 0.10) * t
          lightness = Math.max(0.08, lightness)
        } else {
          // Lighter text
          const t = (step - 9) / 3
          lightness = baseLightness + (targetL - baseLightness) * t
          lightness = Math.min(0.95, lightness)
        }
      }
      
      // Apply chroma multiplier
      chroma = baseChroma * CHROMA_MULTIPLIERS[step]
    }
    
    // Clamp to gamut and generate hex
    const clamped = clampToGamut(lightness, chroma, hue)
    const hex = oklchToHex(clamped.l, clamped.c, clamped.h)
    
    steps.push({
      step,
      hex,
      oklch: clamped,
      usage: STEP_USAGE[step],
    })
  }
  
  return {
    name,
    baseHex,
    steps,
    mode,
  }
}

/**
 * Generate both light and dark mode scales from a base color
 */
export function generateColorScales(
  baseHex: string,
  name: string = 'Custom'
): { light: ColorScale; dark: ColorScale } {
  return {
    light: generateColorScale(baseHex, 'light', name),
    dark: generateColorScale(baseHex, 'dark', name),
  }
}
