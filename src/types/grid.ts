// ============================================
// Swiss Grid System Types
// ============================================

/** Type of grid pattern */
export type GridPattern = 'column' | 'modular' | 'baseline' | 'manuscript' | 'none'

/** Grid alignment options (maps to Figma's LayoutGrid alignment) */
export type GridAlignment = 'MIN' | 'CENTER' | 'MAX' | 'STRETCH'

/** Measurement unit for grid values */
export type GridUnit = 'px' | 'percent'

/** Category for organizing grid presets */
export type GridCategory = 
  | 'classic-swiss'
  | 'editorial'
  | 'poster'
  | 'web-ui'
  | 'modular'
  | 'baseline'
  | 'combined'
  | 'custom'

/** Symmetry of the grid layout */
export type GridSymmetry = 'symmetric' | 'asymmetric'

/** RGBA color for grid visualization */
export interface GridColor {
  r: number  // 0-1
  g: number  // 0-1
  b: number  // 0-1
  a: number  // 0-1
}

// ============================================
// Column Grid Configuration
// ============================================

export interface ColumnGridConfig {
  /** Number of columns */
  count: number
  /** Gutter width between columns */
  gutterSize: number
  /** Unit for gutter (px or percent of frame width) */
  gutterUnit: GridUnit
  /** Left/right margin (or offset for MIN/MAX alignment) */
  margin: number
  /** Unit for margin */
  marginUnit: GridUnit
  /** Column alignment mode */
  alignment: GridAlignment
  /** Grid visibility */
  visible: boolean
  /** Grid line color */
  color: GridColor
}

// ============================================
// Row Grid Configuration (for modular grids)
// ============================================

export interface RowGridConfig {
  /** Number of rows */
  count: number
  /** Gutter height between rows */
  gutterSize: number
  /** Unit for gutter */
  gutterUnit: GridUnit
  /** Top/bottom margin */
  margin: number
  /** Unit for margin */
  marginUnit: GridUnit
  /** Row alignment mode */
  alignment: GridAlignment
  /** Grid visibility */
  visible: boolean
  /** Grid line color */
  color: GridColor
}

// ============================================
// Baseline Grid Configuration
// ============================================

export interface BaselineGridConfig {
  /** Height of each baseline row in pixels */
  height: number
  /** Offset from top of frame (for cap-height alignment) */
  offset: number
  /** Grid visibility */
  visible: boolean
  /** Grid line color */
  color: GridColor
}

// ============================================
// Complete Grid Configuration
// ============================================

export interface GridConfig {
  /** Column grid (vertical divisions) */
  columns?: ColumnGridConfig
  /** Row grid (horizontal divisions for modular grids) */
  rows?: RowGridConfig
  /** Baseline grid (for typography alignment) */
  baseline?: BaselineGridConfig
}

// ============================================
// Grid Preset (stored template)
// ============================================

export interface GridPreset {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Description of the grid and its use case */
  description: string
  /** Category for organization */
  category: GridCategory
  /** Tags for search/filtering */
  tags: string[]
  /** Recommended aspect ratio (e.g., "1:1.414", "16:9") */
  aspectRatio?: string
  /** The actual grid configuration */
  config: GridConfig
  /** Whether this is a user-created preset */
  isCustom: boolean
  /** Creation timestamp (for custom presets) */
  createdAt?: number
}

// ============================================
// Saved Grid (user's custom grid)
// ============================================

export interface SavedGrid extends GridPreset {
  /** Override: custom grids are always custom */
  isCustom: true
  /** Source of the grid (preset name) */
  source?: string
}

// ============================================
// Figma Layout Grid Types (for API integration)
// ============================================

export interface FigmaLayoutGrid {
  pattern: 'COLUMNS' | 'ROWS' | 'GRID'
  alignment: GridAlignment
  gutterSize: number
  count: number
  sectionSize?: number  // For GRID pattern
  offset: number
  visible: boolean
  color: GridColor
}

// ============================================
// Plugin Message Types
// ============================================

export interface CreateGridFrameMessage {
  type: 'create-grid-frame'
  config: GridConfig
  frameName: string
  width: number
  height: number
  includeImage?: boolean
  imageBytes?: Uint8Array
}

export interface ApplyGridMessage {
  type: 'apply-grid'
  config: GridConfig
  replaceExisting: boolean
}

export type GridPluginMessage = 
  | CreateGridFrameMessage
  | ApplyGridMessage

// ============================================
// Grid Library State
// ============================================

export interface GridLibraryState {
  /** Currently selected category filter */
  selectedCategory: GridCategory | 'all'
  /** Search query */
  searchQuery: string
  /** Currently selected preset for preview */
  selectedPreset: GridPreset | null
}

// ============================================
// Utility Type Helpers
// ============================================

/** Default column grid color (red) */
export const DEFAULT_COLUMN_COLOR: GridColor = {
  r: 1,
  g: 0.2,
  b: 0.2,
  a: 0.1
}

/** Default row grid color (blue) */
export const DEFAULT_ROW_COLOR: GridColor = {
  r: 0.2,
  g: 0.4,
  b: 1,
  a: 0.1
}

/** Default baseline grid color (cyan) */
export const DEFAULT_BASELINE_COLOR: GridColor = {
  r: 0.2,
  g: 0.8,
  b: 0.9,
  a: 0.15
}

