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
