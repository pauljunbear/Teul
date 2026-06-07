// ============================================
// Swiss Grid System Types
// ============================================

/** Grid alignment options (maps to Figma's LayoutGrid alignment) */
export type GridAlignment = 'MIN' | 'CENTER' | 'MAX' | 'STRETCH';

/** Measurement unit for grid values */
export type GridUnit = 'px' | 'percent';

/** Category for organizing grid presets */
export type GridCategory =
  | 'classic-swiss'
  | 'editorial'
  | 'poster'
  | 'web-ui'
  | 'modular'
  | 'baseline'
  | 'combined'
  | 'custom';

/** Width and height used when resolving a grid for a target. */
export interface GridDimensions {
  width: number;
  height: number;
}

/** Selected Figma node that can accept layout grids. */
export interface GridSelectionTarget extends GridDimensions {
  id: string;
  name: string;
}

/** Evidence-based classification for preset provenance */
export type GridPresetClassification =
  | 'historical-reconstruction'
  | 'historically-informed-construction'
  | 'modern-named-system'
  | 'teul-modern-adaptation'
  | 'user-created';

/** Strength of the evidence supporting a preset's construction */
export type GridPresetEvidence = 'artifact-level' | 'reference-informed' | 'unsourced';

/** Provenance and adaptation disclosure for a grid preset */
export interface GridPresetProvenance {
  /** Classification of the preset's relationship to its source material */
  classification: GridPresetClassification;
  /** Human-readable source or collection name */
  source: string;
  /** Optional source URL when a specific reference is available */
  sourceUrl?: string;
  /** Strength of the evidence behind the emitted geometry */
  evidence: GridPresetEvidence;
  /** Explanation of how the emitted geometry differs from or interprets its source */
  adaptationNotes: string;
}

/** RGBA color for grid visualization */
export interface GridColor {
  r: number; // 0-1
  g: number; // 0-1
  b: number; // 0-1
  a: number; // 0-1
}

// ============================================
// Column Grid Configuration
// ============================================

export interface ColumnGridConfig {
  /** Number of columns */
  count: number;
  /** Gutter width between columns */
  gutterSize: number;
  /** Unit for gutter (px or percent of frame width) */
  gutterUnit: GridUnit;
  /** Left/right margin (or offset for MIN/MAX alignment) */
  margin: number;
  /** Unit for margin */
  marginUnit: GridUnit;
  /** Column alignment mode */
  alignment: GridAlignment;
  /** Grid visibility */
  visible: boolean;
  /** Grid line color */
  color: GridColor;
}

// ============================================
// Row Grid Configuration (for modular grids)
// ============================================

export interface RowGridConfig {
  /** Number of rows */
  count: number;
  /** Gutter height between rows */
  gutterSize: number;
  /** Unit for gutter */
  gutterUnit: GridUnit;
  /** Top/bottom margin */
  margin: number;
  /** Unit for margin */
  marginUnit: GridUnit;
  /** Row alignment mode */
  alignment: GridAlignment;
  /** Grid visibility */
  visible: boolean;
  /** Grid line color */
  color: GridColor;
}

// ============================================
// Baseline Grid Configuration
// ============================================

export interface BaselineGridConfig {
  /** Size of the native Figma uniform square GRID in pixels */
  height: number;
  /** Legacy stored value. Native Figma uniform GRID does not support offsets. */
  offset: number;
  /** Grid visibility */
  visible: boolean;
  /** Grid line color */
  color: GridColor;
}

// ============================================
// Complete Grid Configuration
// ============================================

export interface GridConfig {
  /** Column grid (vertical divisions) */
  columns?: ColumnGridConfig;
  /** Row grid (horizontal divisions for modular grids) */
  rows?: RowGridConfig;
  /** Baseline grid (for typography alignment) */
  baseline?: BaselineGridConfig;
}

// ============================================
// Grid Preset (stored template)
// ============================================

export interface GridPreset {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of the grid and its use case */
  description: string;
  /** Category for organization */
  category: GridCategory;
  /** Tags for search/filtering */
  tags: string[];
  /** Recommended aspect ratio (e.g., "1:1.414", "16:9") */
  aspectRatio?: string;
  /** The actual grid configuration */
  config: GridConfig;
  /**
   * Source and adaptation disclosure. Optional for backward compatibility with
   * saved and third-party presets; all bundled presets include this metadata.
   */
  provenance?: GridPresetProvenance;
  /** Whether this is a user-created preset */
  isCustom: boolean;
  /** Creation timestamp (for custom presets) */
  createdAt?: number;
}

// ============================================
// Saved Grid (user's custom grid)
// ============================================

export interface SavedGrid extends GridPreset {
  /** Override: custom grids are always custom */
  isCustom: true;
  /** Source of the grid (preset name) */
  source?: string;
}

// ============================================
// Figma Layout Grid Types (for API integration)
// ============================================

export interface FigmaRowsColsLayoutGrid {
  pattern: 'COLUMNS' | 'ROWS';
  alignment: GridAlignment;
  gutterSize: number;
  count: number;
  sectionSize?: number;
  offset: number;
  visible: boolean;
  color: GridColor;
}

export interface FigmaUniformLayoutGrid {
  pattern: 'GRID';
  sectionSize: number;
  visible: boolean;
  color: GridColor;
}

export type FigmaLayoutGrid = FigmaRowsColsLayoutGrid | FigmaUniformLayoutGrid;

// ============================================
// Utility Type Helpers
// ============================================

/** Default column grid color (red) */
export const DEFAULT_COLUMN_COLOR: GridColor = {
  r: 1,
  g: 0.2,
  b: 0.2,
  a: 0.1,
};

/** Default row grid color (blue) */
export const DEFAULT_ROW_COLOR: GridColor = {
  r: 0.2,
  g: 0.4,
  b: 1,
  a: 0.1,
};

/** Default baseline grid color (cyan) */
export const DEFAULT_BASELINE_COLOR: GridColor = {
  r: 0.2,
  g: 0.8,
  b: 0.9,
  a: 0.15,
};
