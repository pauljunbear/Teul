// ============================================
// Grid System Utility Functions
// ============================================

import type {
  GridConfig,
  ColumnGridConfig,
  RowGridConfig,
  BaselineGridConfig,
  GridUnit,
  FigmaLayoutGrid,
  GridColor,
  DEFAULT_COLUMN_COLOR,
  DEFAULT_ROW_COLOR,
  DEFAULT_BASELINE_COLOR,
} from '../types/grid'

// Re-export default colors for convenience
export {
  DEFAULT_COLUMN_COLOR,
  DEFAULT_ROW_COLOR,
  DEFAULT_BASELINE_COLOR,
} from '../types/grid'

// ============================================
// Unit Conversion Utilities
// ============================================

/**
 * Convert a percentage value to pixels
 * @param percent - Value as percentage (0-100)
 * @param totalSize - Total size in pixels (width or height)
 * @returns Value in pixels
 */
export function percentToPixels(percent: number, totalSize: number): number {
  return (percent / 100) * totalSize
}

/**
 * Convert a pixel value to percentage
 * @param pixels - Value in pixels
 * @param totalSize - Total size in pixels (width or height)
 * @returns Value as percentage (0-100)
 */
export function pixelsToPercent(pixels: number, totalSize: number): number {
  if (totalSize === 0) return 0
  return (pixels / totalSize) * 100
}

/**
 * Convert a grid value to pixels based on its unit
 * @param value - The value to convert
 * @param unit - The unit of the value ('px' or 'percent')
 * @param totalSize - Total size for percentage calculation
 * @returns Value in pixels
 */
export function toPixels(value: number, unit: GridUnit, totalSize: number): number {
  return unit === 'percent' ? percentToPixels(value, totalSize) : value
}

/**
 * Convert a pixel value to a specified unit
 * @param pixels - Value in pixels
 * @param unit - Target unit
 * @param totalSize - Total size for percentage calculation
 * @returns Value in target unit
 */
export function fromPixels(pixels: number, unit: GridUnit, totalSize: number): number {
  return unit === 'percent' ? pixelsToPercent(pixels, totalSize) : pixels
}

// ============================================
// Aspect Ratio Utilities
// ============================================

/** Common aspect ratios with their names */
export const COMMON_ASPECT_RATIOS: { name: string; ratio: number; display: string }[] = [
  { name: 'A-series (ISO 216)', ratio: 1.414, display: '1:√2' },
  { name: 'Golden Ratio', ratio: 1.618, display: '1:φ' },
  { name: 'Classic 2:3', ratio: 1.5, display: '2:3' },
  { name: 'Photo 3:4', ratio: 1.333, display: '3:4' },
  { name: 'Square', ratio: 1, display: '1:1' },
  { name: 'Widescreen 16:9', ratio: 1.778, display: '16:9' },
  { name: 'Cinema 2.35:1', ratio: 2.35, display: '2.35:1' },
  { name: 'Letter (US)', ratio: 1.294, display: '8.5:11' },
]

/**
 * Calculate aspect ratio from dimensions
 * @param width - Width in pixels
 * @param height - Height in pixels
 * @returns Aspect ratio as a number (width/height)
 */
export function calculateAspectRatio(width: number, height: number): number {
  if (height === 0) return 1
  return width / height
}

/**
 * Get the closest common aspect ratio name
 * @param ratio - The aspect ratio to match
 * @param tolerance - How close the match needs to be (default 0.05)
 * @returns The display name of the closest ratio, or the raw ratio
 */
export function getAspectRatioName(ratio: number, tolerance = 0.05): string {
  // Handle both landscape and portrait orientations
  const normalizedRatio = ratio >= 1 ? ratio : 1 / ratio
  
  for (const common of COMMON_ASPECT_RATIOS) {
    if (Math.abs(normalizedRatio - common.ratio) < tolerance) {
      return common.display
    }
  }
  
  // Return simplified fraction or decimal
  return simplifyRatio(ratio)
}

/**
 * Simplify a ratio to a readable fraction
 */
function simplifyRatio(ratio: number): string {
  if (ratio >= 1) {
    // Landscape or square
    const simplified = findSimpleFraction(ratio)
    return simplified || ratio.toFixed(2)
  } else {
    // Portrait - flip the ratio
    const flipped = 1 / ratio
    const simplified = findSimpleFraction(flipped)
    if (simplified) {
      const [a, b] = simplified.split(':')
      return `${b}:${a}`
    }
    return (1 / ratio).toFixed(2)
  }
}

/**
 * Find a simple fraction representation
 */
function findSimpleFraction(ratio: number): string | null {
  const maxDenominator = 20
  for (let b = 1; b <= maxDenominator; b++) {
    for (let a = 1; a <= maxDenominator; a++) {
      if (Math.abs(a / b - ratio) < 0.02) {
        return `${a}:${b}`
      }
    }
  }
  return null
}

// ============================================
// Grid Calculation Utilities
// ============================================

/**
 * Calculate the width of each column
 * @param config - Column grid configuration
 * @param frameWidth - Total frame width
 * @returns Width of each column in pixels
 */
export function calculateColumnWidth(
  config: ColumnGridConfig,
  frameWidth: number
): number {
  const marginPx = toPixels(config.margin, config.marginUnit, frameWidth)
  const gutterPx = toPixels(config.gutterSize, config.gutterUnit, frameWidth)
  
  // Available width after margins
  const availableWidth = frameWidth - (marginPx * 2)
  
  // Total gutter width
  const totalGutterWidth = gutterPx * (config.count - 1)
  
  // Column width
  return (availableWidth - totalGutterWidth) / config.count
}

/**
 * Calculate the height of each row
 * @param config - Row grid configuration
 * @param frameHeight - Total frame height
 * @returns Height of each row in pixels
 */
export function calculateRowHeight(
  config: RowGridConfig,
  frameHeight: number
): number {
  const marginPx = toPixels(config.margin, config.marginUnit, frameHeight)
  const gutterPx = toPixels(config.gutterSize, config.gutterUnit, frameHeight)
  
  // Available height after margins
  const availableHeight = frameHeight - (marginPx * 2)
  
  // Total gutter height
  const totalGutterHeight = gutterPx * (config.count - 1)
  
  // Row height
  return (availableHeight - totalGutterHeight) / config.count
}

/**
 * Calculate module dimensions for a modular grid
 * @param columns - Column configuration
 * @param rows - Row configuration
 * @param frameWidth - Frame width in pixels
 * @param frameHeight - Frame height in pixels
 * @returns Module dimensions
 */
export function calculateModuleDimensions(
  columns: ColumnGridConfig,
  rows: RowGridConfig,
  frameWidth: number,
  frameHeight: number
): { width: number; height: number } {
  return {
    width: calculateColumnWidth(columns, frameWidth),
    height: calculateRowHeight(rows, frameHeight),
  }
}

// ============================================
// Grid Scaling Utilities
// ============================================

/**
 * Scale a grid configuration to fit a new frame size
 * @param config - Original grid configuration
 * @param originalWidth - Original frame width
 * @param originalHeight - Original frame height
 * @param newWidth - New frame width
 * @param newHeight - New frame height
 * @returns Scaled grid configuration
 */
export function scaleGrid(
  config: GridConfig,
  originalWidth: number,
  originalHeight: number,
  newWidth: number,
  newHeight: number
): GridConfig {
  const widthScale = newWidth / originalWidth
  const heightScale = newHeight / originalHeight
  
  const scaled: GridConfig = {}
  
  if (config.columns) {
    scaled.columns = {
      ...config.columns,
      // Scale pixel values, keep percentages as-is
      gutterSize: config.columns.gutterUnit === 'px'
        ? config.columns.gutterSize * widthScale
        : config.columns.gutterSize,
      margin: config.columns.marginUnit === 'px'
        ? config.columns.margin * widthScale
        : config.columns.margin,
    }
  }
  
  if (config.rows) {
    scaled.rows = {
      ...config.rows,
      gutterSize: config.rows.gutterUnit === 'px'
        ? config.rows.gutterSize * heightScale
        : config.rows.gutterSize,
      margin: config.rows.marginUnit === 'px'
        ? config.rows.margin * heightScale
        : config.rows.margin,
    }
  }
  
  if (config.baseline) {
    scaled.baseline = {
      ...config.baseline,
      // Scale baseline proportionally
      height: config.baseline.height * Math.min(widthScale, heightScale),
      offset: config.baseline.offset * heightScale,
    }
  }
  
  return scaled
}

// ============================================
// Baseline Grid Utilities
// ============================================

/**
 * Calculate recommended baseline height based on typography
 * @param fontSize - Base font size in pixels
 * @param lineHeight - Line height multiplier (e.g., 1.5)
 * @returns Recommended baseline grid height in pixels
 */
export function calculateBaselineFromTypography(
  fontSize: number,
  lineHeight: number
): number {
  const rawBaseline = fontSize * lineHeight
  
  // Round to nearest "nice" number (4, 6, 8, 12, 16, 20, 24, etc.)
  const niceNumbers = [4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48]
  
  let closest = niceNumbers[0]
  let closestDiff = Math.abs(rawBaseline - closest)
  
  for (const n of niceNumbers) {
    const diff = Math.abs(rawBaseline - n)
    if (diff < closestDiff) {
      closest = n
      closestDiff = diff
    }
  }
  
  return closest
}

/**
 * Get typography scale suggestions for a baseline
 * @param baseline - Baseline height in pixels
 * @returns Suggested font sizes and line heights
 */
export function getTypographySuggestions(baseline: number): {
  bodySize: number
  bodyLineHeight: number
  headingSizes: number[]
} {
  // Common multiplier for line height
  const lineHeight = 1.5
  const bodySize = Math.round(baseline / lineHeight)
  
  // Heading sizes based on modular scale (1.25 ratio)
  const scale = 1.25
  const headingSizes = [
    Math.round(bodySize * scale),
    Math.round(bodySize * scale * scale),
    Math.round(bodySize * scale * scale * scale),
    Math.round(bodySize * scale * scale * scale * scale),
  ]
  
  return {
    bodySize,
    bodyLineHeight: lineHeight,
    headingSizes,
  }
}

// ============================================
// GridConfig to Figma LayoutGrid Conversion
// ============================================

/**
 * Convert a GridConfig to Figma's layoutGrids array
 * @param config - Grid configuration
 * @param frameWidth - Frame width for unit conversion
 * @param frameHeight - Frame height for unit conversion
 * @returns Array of Figma LayoutGrid objects
 */
export function gridConfigToFigmaLayoutGrids(
  config: GridConfig,
  frameWidth: number,
  frameHeight: number
): FigmaLayoutGrid[] {
  const layoutGrids: FigmaLayoutGrid[] = []
  
  // Add column grid
  if (config.columns) {
    const marginPx = toPixels(config.columns.margin, config.columns.marginUnit, frameWidth)
    const gutterPx = toPixels(config.columns.gutterSize, config.columns.gutterUnit, frameWidth)
    
    layoutGrids.push({
      pattern: 'COLUMNS',
      alignment: config.columns.alignment,
      gutterSize: Math.round(gutterPx),
      count: config.columns.count,
      offset: Math.round(marginPx),
      visible: config.columns.visible,
      color: config.columns.color,
    })
  }
  
  // Add row grid
  if (config.rows) {
    const marginPx = toPixels(config.rows.margin, config.rows.marginUnit, frameHeight)
    const gutterPx = toPixels(config.rows.gutterSize, config.rows.gutterUnit, frameHeight)
    
    layoutGrids.push({
      pattern: 'ROWS',
      alignment: config.rows.alignment,
      gutterSize: Math.round(gutterPx),
      count: config.rows.count,
      offset: Math.round(marginPx),
      visible: config.rows.visible,
      color: config.rows.color,
    })
  }
  
  // Add baseline grid
  if (config.baseline) {
    layoutGrids.push({
      pattern: 'GRID',
      alignment: 'MIN',
      gutterSize: 0,
      count: 1,
      sectionSize: config.baseline.height,
      offset: config.baseline.offset,
      visible: config.baseline.visible,
      color: config.baseline.color,
    })
  }
  
  return layoutGrids
}

// ============================================
// Grid Validation Utilities
// ============================================

/**
 * Validate that a grid configuration is reasonable
 * @param config - Grid configuration to validate
 * @param frameWidth - Target frame width
 * @param frameHeight - Target frame height
 * @returns Validation result with any warnings
 */
export function validateGridConfig(
  config: GridConfig,
  frameWidth: number,
  frameHeight: number
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = []
  
  if (config.columns) {
    const columnWidth = calculateColumnWidth(config.columns, frameWidth)
    
    if (columnWidth < 10) {
      warnings.push('Columns may be too narrow (< 10px each)')
    }
    
    if (config.columns.count > 24) {
      warnings.push('Very high column count (> 24) may be difficult to use')
    }
    
    const marginPx = toPixels(config.columns.margin, config.columns.marginUnit, frameWidth)
    if (marginPx > frameWidth * 0.25) {
      warnings.push('Margins exceed 25% of frame width')
    }
  }
  
  if (config.rows) {
    const rowHeight = calculateRowHeight(config.rows, frameHeight)
    
    if (rowHeight < 10) {
      warnings.push('Rows may be too short (< 10px each)')
    }
  }
  
  if (config.baseline) {
    if (config.baseline.height < 4) {
      warnings.push('Baseline height may be too small (< 4px)')
    }
    
    if (config.baseline.height > 48) {
      warnings.push('Baseline height is quite large (> 48px)')
    }
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
  }
}

// ============================================
// Grid Preview Utilities (for SVG rendering)
// ============================================

/**
 * Generate SVG path data for column grid preview
 * @param config - Column configuration
 * @param width - Preview width
 * @param height - Preview height
 * @returns SVG path data string
 */
export function generateColumnGridSVGPath(
  config: ColumnGridConfig,
  width: number,
  height: number
): string {
  const marginPx = toPixels(config.margin, config.marginUnit, width)
  const gutterPx = toPixels(config.gutterSize, config.gutterUnit, width)
  const columnWidth = calculateColumnWidth(config, width)
  
  let path = ''
  let x = marginPx
  
  for (let i = 0; i < config.count; i++) {
    // Left edge of column
    path += `M ${x} 0 L ${x} ${height} `
    // Right edge of column
    const rightEdge = x + columnWidth
    path += `M ${rightEdge} 0 L ${rightEdge} ${height} `
    
    x = rightEdge + gutterPx
  }
  
  return path
}

/**
 * Generate SVG path data for row grid preview
 * @param config - Row configuration
 * @param width - Preview width
 * @param height - Preview height
 * @returns SVG path data string
 */
export function generateRowGridSVGPath(
  config: RowGridConfig,
  width: number,
  height: number
): string {
  const marginPx = toPixels(config.margin, config.marginUnit, height)
  const gutterPx = toPixels(config.gutterSize, config.gutterUnit, height)
  const rowHeight = calculateRowHeight(config, height)
  
  let path = ''
  let y = marginPx
  
  for (let i = 0; i < config.count; i++) {
    // Top edge of row
    path += `M 0 ${y} L ${width} ${y} `
    // Bottom edge of row
    const bottomEdge = y + rowHeight
    path += `M 0 ${bottomEdge} L ${width} ${bottomEdge} `
    
    y = bottomEdge + gutterPx
  }
  
  return path
}

/**
 * Generate SVG path data for baseline grid preview
 * @param config - Baseline configuration
 * @param width - Preview width
 * @param height - Preview height
 * @returns SVG path data string
 */
export function generateBaselineGridSVGPath(
  config: BaselineGridConfig,
  width: number,
  height: number
): string {
  let path = ''
  let y = config.offset
  
  while (y < height) {
    path += `M 0 ${y} L ${width} ${y} `
    y += config.height
  }
  
  return path
}

/**
 * Convert GridColor to CSS rgba string
 */
export function gridColorToCSS(color: GridColor): string {
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a})`
}

/**
 * Convert CSS color to GridColor
 */
export function cssToGridColor(css: string, alpha = 0.1): GridColor {
  // Handle hex colors
  if (css.startsWith('#')) {
    const hex = css.slice(1)
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
      a: alpha,
    }
  }
  
  // Handle rgb/rgba
  const match = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (match) {
    return {
      r: parseInt(match[1]) / 255,
      g: parseInt(match[2]) / 255,
      b: parseInt(match[3]) / 255,
      a: match[4] ? parseFloat(match[4]) : alpha,
    }
  }
  
  // Default to red
  return { r: 1, g: 0.2, b: 0.2, a: alpha }
}

