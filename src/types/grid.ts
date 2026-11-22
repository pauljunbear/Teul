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

/** How a preset's measurements behave when applied to another frame. */
export type GridApplicationMode =
  | 'fixed'
  | 'scale-from-reference'
  | 'responsive-width'
  | 'canonical-only';

/** Width contract for a responsive named system; height remains unconstrained. */
export interface GridResponsiveWidth {
  min: number;
  max?: number;
  /** Optional centered body/container width used to recompute the content-guide margin. */
  maxContentWidth?: number;
  /** Fixed inset inside the centered body before the first content guide. */
  contentInset?: number;
}

/** Selected Figma node that can accept layout grids. */
export interface GridSelectionTarget extends GridDimensions {
  id: string;
  name: string;
  layoutGridCount: number;
  /** Generated Teul construction overlays already attached to this target. */
  teulConstructionCount?: number;
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

/** Serializable subset of Figma's VariableAlias used by captured native guides. */
export interface GridVariableAlias {
  type: 'VARIABLE_ALIAS';
  id: string;
}

/** Bound fields retained from a native Figma layout-grid layer. */
export type GridBoundVariables = Record<string, GridVariableAlias>;

/** Native resources captured with a saved grid and resolved again on apply. */
export interface GridNativeResources {
  gridStyleId?: string;
  boundVariableIds: string[];
  sourceFileKey?: string;
}

export type GridLinkedResourcePolicy = 'preserve-if-available' | 'replace-with-values';

export type GridConstructionAxis = 'columns' | 'rows';
export type GridConstructionRealizationKind =
  | 'native-layout-grids'
  | 'native-layout-grid-layers'
  | 'generated-geometry'
  | 'approximation';

export interface GridConstructionMarginsV2 {
  left: number;
  right: number;
  top: number;
  bottom: number;
  inside?: number;
  outside?: number;
  unit: GridUnit;
}

export interface GridTrackGroupV2 {
  id: string;
  axis: GridConstructionAxis;
  /** Ordered track sizes. Unequal values are preserved. */
  tracks: number[];
  /** Ordered gaps between tracks; length must equal tracks.length - 1. */
  gutters: number[];
  /** Space before this group in the same axis. */
  gapBefore: number;
  unit: GridUnit;
  visible: boolean;
  color: GridColor;
}

export interface GridNestedSubdivisionV2 {
  id: string;
  /** `${groupId}:${zeroBasedTrackIndex}` identifies the parent track. */
  parentTrackId: string;
  axis: GridConstructionAxis;
  tracks: number[];
  gutters: number[];
  insetStart: number;
  insetEnd: number;
  unit: GridUnit;
  visible: boolean;
  color: GridColor;
}

export interface GridBaselineRowsV2 {
  interval: number;
  topInset: number;
  unit: GridUnit;
  visible: boolean;
  color: GridColor;
}

export interface GridConstructionV2 {
  version: 2;
  margins: GridConstructionMarginsV2;
  trackGroups: GridTrackGroupV2[];
  subdivisions: GridNestedSubdivisionV2[];
  baseline?: GridBaselineRowsV2;
  realization: {
    kind: GridConstructionRealizationKind;
    disclosure: string;
  };
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
  /** Optional native variable bindings captured from Figma. */
  boundVariables?: GridBoundVariables;
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
  /** Optional native variable bindings captured from Figma. */
  boundVariables?: GridBoundVariables;
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
  /** Optional native variable bindings captured from Figma. */
  boundVariables?: GridBoundVariables;
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
  /** Preview/reference frame; canonical only when applicationMode is canonical-only. */
  referenceDimensions?: GridDimensions;
  /** Whether measurements stay fixed, scale, follow a width contract, or require the canonical frame. */
  applicationMode?: GridApplicationMode;
  /** Responsive width range and optional centered-content rule. */
  responsiveWidth?: GridResponsiveWidth;
  /** The actual grid configuration */
  config: GridConfig;
  /** Versioned source construction; config remains the current native realization. */
  construction?: GridConstructionV2;
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
  /** Linked style and variable identifiers retained by native capture. */
  nativeResources?: GridNativeResources;
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
  boundVariables?: GridBoundVariables;
}

export interface FigmaUniformLayoutGrid {
  pattern: 'GRID';
  sectionSize: number;
  visible: boolean;
  color: GridColor;
  boundVariables?: GridBoundVariables;
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
