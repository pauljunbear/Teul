// ============================================
// Figma Grid System Helpers
// ============================================
// Centralized utilities for converting GridConfig to Figma LayoutGrid format
// and handling all Figma-specific grid operations

import type {
  GridConfig,
  ColumnGridConfig,
  RowGridConfig,
  BaselineGridConfig,
  FigmaLayoutGrid,
  GridColor,
  GridPreset,
} from '../types/grid';
import { toPixels, scaleGrid } from './gridUtils';

// Type for the Figma-formatted grid config passed to the plugin backend
interface FigmaGridConfigs {
  columns?: FigmaLayoutGrid;
  rows?: FigmaLayoutGrid;
  baseline?: FigmaLayoutGrid;
}

// ============================================
// GridConfig to Figma LayoutGrid Conversion
// ============================================

/**
 * Convert a column grid configuration to Figma LayoutGrid format
 * @param config - Column grid configuration
 * @param frameWidth - Frame width for percentage calculations
 * @returns Figma LayoutGrid object
 */
export function columnConfigToFigmaGrid(
  config: ColumnGridConfig,
  frameWidth: number
): FigmaLayoutGrid {
  const marginPx = toPixels(config.margin, config.marginUnit, frameWidth);
  const gutterPx = toPixels(config.gutterSize, config.gutterUnit, frameWidth);

  return {
    pattern: 'COLUMNS',
    alignment: config.alignment,
    gutterSize: Math.round(gutterPx),
    count: config.count,
    offset: Math.round(marginPx),
    visible: config.visible,
    color: config.color,
  };
}

/**
 * Convert a row grid configuration to Figma LayoutGrid format
 * @param config - Row grid configuration
 * @param frameHeight - Frame height for percentage calculations
 * @returns Figma LayoutGrid object
 */
export function rowConfigToFigmaGrid(config: RowGridConfig, frameHeight: number): FigmaLayoutGrid {
  const marginPx = toPixels(config.margin, config.marginUnit, frameHeight);
  const gutterPx = toPixels(config.gutterSize, config.gutterUnit, frameHeight);

  return {
    pattern: 'ROWS',
    alignment: config.alignment,
    gutterSize: Math.round(gutterPx),
    count: config.count,
    offset: Math.round(marginPx),
    visible: config.visible,
    color: config.color,
  };
}

/**
 * Convert a baseline grid configuration to Figma LayoutGrid format
 * @param config - Baseline grid configuration
 * @returns Figma LayoutGrid object
 */
export function baselineConfigToFigmaGrid(config: BaselineGridConfig): FigmaLayoutGrid {
  return {
    pattern: 'GRID',
    alignment: 'MIN', // Baseline grids always align to top
    gutterSize: 0,
    count: 1,
    sectionSize: config.height,
    offset: config.offset,
    visible: config.visible,
    color: config.color,
  };
}

/**
 * Convert a complete GridConfig to an array of Figma LayoutGrids
 * @param config - Complete grid configuration
 * @param frameWidth - Frame width for percentage calculations
 * @param frameHeight - Frame height for percentage calculations
 * @returns Array of Figma LayoutGrid objects
 */
export function gridConfigToFigmaLayoutGrids(
  config: GridConfig,
  frameWidth: number,
  frameHeight: number
): FigmaLayoutGrid[] {
  const layoutGrids: FigmaLayoutGrid[] = [];

  if (config.columns) {
    layoutGrids.push(columnConfigToFigmaGrid(config.columns, frameWidth));
  }

  if (config.rows) {
    layoutGrids.push(rowConfigToFigmaGrid(config.rows, frameHeight));
  }

  if (config.baseline) {
    layoutGrids.push(baselineConfigToFigmaGrid(config.baseline));
  }

  return layoutGrids;
}

// ============================================
// Frame Naming Convention
// ============================================

/**
 * Generate a standardized frame name for a grid
 * Convention: "Grid - [Source/Preset Name] - [Columns]col"
 */
export function generateGridFrameName(params: {
  source?: string;
  presetName?: string;
  columns?: number;
  rows?: number;
  isModular?: boolean;
}): string {
  const parts = ['Grid'];

  // Add source/preset name
  const name = params.presetName || params.source || 'Custom';
  parts.push(name);

  // Add grid specs
  const specs: string[] = [];

  if (params.columns && params.columns > 0) {
    specs.push(`${params.columns}col`);
  }

  if (params.isModular && params.rows && params.rows > 0) {
    specs.push(`${params.rows}row`);
  }

  if (specs.length > 0) {
    parts.push(specs.join(' × '));
  }

  return parts.join(' - ');
}

/**
 * Generate frame name from a GridConfig
 */
export function gridConfigToFrameName(config: GridConfig, source?: string): string {
  return generateGridFrameName({
    source,
    columns: config.columns?.count,
    rows: config.rows?.count,
    isModular: !!(config.columns && config.rows),
  });
}

/**
 * Generate frame name from a GridPreset
 */
export function presetToFrameName(preset: GridPreset): string {
  return generateGridFrameName({
    presetName: preset.name,
    columns: preset.config.columns?.count,
    rows: preset.config.rows?.count,
    isModular: !!(preset.config.columns && preset.config.rows),
  });
}

// ============================================
// Grid Scaling for Different Frame Sizes
// ============================================

/**
 * Scale a grid configuration to fit a new frame size while maintaining proportions
 * @param config - Original grid configuration
 * @param originalWidth - Original frame width
 * @param originalHeight - Original frame height
 * @param targetWidth - Target frame width
 * @param targetHeight - Target frame height
 * @param preserveColumnCount - Whether to keep the same number of columns (default: true)
 * @returns Scaled grid configuration
 */
export function scaleGridForFrameSize(
  config: GridConfig,
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number,
  preserveColumnCount: boolean = true
): GridConfig {
  // Use the utility from gridUtils for basic scaling
  const scaled = scaleGrid(config, originalWidth, originalHeight, targetWidth, targetHeight);

  // If we want to preserve column count, ensure it's unchanged
  if (preserveColumnCount) {
    if (scaled.columns && config.columns) {
      scaled.columns.count = config.columns.count;
    }
    if (scaled.rows && config.rows) {
      scaled.rows.count = config.rows.count;
    }
  }

  return scaled;
}

/**
 * Check if a grid needs scaling for a target frame
 */
export function needsScaling(
  config: GridConfig,
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number,
  tolerance: number = 1 // pixels
): boolean {
  return (
    Math.abs(originalWidth - targetWidth) > tolerance ||
    Math.abs(originalHeight - targetHeight) > tolerance
  );
}

// ============================================
// Aspect Ratio Utilities for Frame Creation
// ============================================

/**
 * Parse an aspect ratio string and calculate dimensions
 * @param aspectRatio - Aspect ratio string (e.g., "1:1.414", "16:9", "1:√2")
 * @param baseWidth - Base width to calculate from
 * @returns Calculated width and height
 */
export function parseAspectRatio(
  aspectRatio: string,
  baseWidth: number = 800
): { width: number; height: number } {
  // Handle special cases
  if (aspectRatio.includes('√2') || aspectRatio.includes('1.414')) {
    // A-series paper ratio (portrait)
    return { width: baseWidth, height: Math.round(baseWidth * 1.414) };
  }

  if (aspectRatio.includes('φ') || aspectRatio.includes('1.618')) {
    // Golden ratio (portrait)
    return { width: baseWidth, height: Math.round(baseWidth * 1.618) };
  }

  // Parse standard ratios like "16:9", "2:3", etc.
  const match = aspectRatio.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);

  if (match) {
    const w = parseFloat(match[1]);
    const h = parseFloat(match[2]);

    if (w && h) {
      // Determine if we should calculate height from width or vice versa
      // For portrait ratios (h > w), calculate height from width
      // For landscape ratios (w > h), calculate height from width
      const ratio = h / w;
      return {
        width: baseWidth,
        height: Math.round(baseWidth * ratio),
      };
    }
  }

  // Default to 4:3
  return { width: baseWidth, height: Math.round(baseWidth * 0.75) };
}

/**
 * Get recommended frame dimensions for a preset
 */
export function getPresetFrameDimensions(
  preset: GridPreset,
  baseWidth: number = 800
): { width: number; height: number } {
  if (preset.aspectRatio) {
    return parseAspectRatio(preset.aspectRatio, baseWidth);
  }

  // Default dimensions based on category
  switch (preset.category) {
    case 'poster':
      return { width: 800, height: 1132 }; // ~A2 proportion
    case 'editorial':
      return { width: 800, height: 1040 }; // Magazine page
    case 'web-ui':
      return { width: 1440, height: 900 }; // Desktop viewport
    default:
      return { width: baseWidth, height: Math.round(baseWidth * 1.414) };
  }
}

// ============================================
// Message Builders for UI-to-Plugin Communication
// ============================================

/**
 * Build the message payload for creating a grid frame
 */
export function buildCreateGridFrameMessage(params: {
  config: GridConfig;
  frameName?: string;
  width: number;
  height: number;
  includeImage?: boolean;
  imageData?: string;
  positionNearSelection?: boolean;
}): {
  type: 'create-grid-frame';
  config: FigmaGridConfigs;
  frameName: string;
  width: number;
  height: number;
  includeImage?: boolean;
  imageData?: string;
  positionNearSelection?: boolean;
} {
  const { config, width, height } = params;

  // Convert to Figma-friendly format
  const figmaConfig: FigmaGridConfigs = {};

  if (config.columns) {
    figmaConfig.columns = columnConfigToFigmaGrid(config.columns, width);
  }

  if (config.rows) {
    figmaConfig.rows = rowConfigToFigmaGrid(config.rows, height);
  }

  if (config.baseline) {
    figmaConfig.baseline = baselineConfigToFigmaGrid(config.baseline);
  }

  return {
    type: 'create-grid-frame',
    config: figmaConfig,
    frameName: params.frameName || gridConfigToFrameName(config),
    width,
    height,
    includeImage: params.includeImage,
    imageData: params.imageData,
    positionNearSelection: params.positionNearSelection !== false,
  };
}

/**
 * Build the message payload for applying a grid to selection
 */
export function buildApplyGridMessage(params: {
  config: GridConfig;
  width: number;
  height: number;
  replaceExisting?: boolean;
}): {
  type: 'apply-grid';
  config: FigmaGridConfigs;
  replaceExisting: boolean;
} {
  const { config, width, height } = params;

  // Convert to Figma-friendly format
  const figmaConfig: FigmaGridConfigs = {};

  if (config.columns) {
    figmaConfig.columns = columnConfigToFigmaGrid(config.columns, width);
  }

  if (config.rows) {
    figmaConfig.rows = rowConfigToFigmaGrid(config.rows, height);
  }

  if (config.baseline) {
    figmaConfig.baseline = baselineConfigToFigmaGrid(config.baseline);
  }

  return {
    type: 'apply-grid',
    config: figmaConfig,
    replaceExisting: params.replaceExisting !== false,
  };
}

// ============================================
// Grid Validation for Figma
// ============================================

/**
 * Validate that a grid configuration can be applied to a Figma frame
 */
export function validateGridForFigma(
  config: GridConfig,
  frameWidth: number,
  frameHeight: number
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check columns
  if (config.columns) {
    if (config.columns.count < 1) {
      errors.push('Column count must be at least 1');
    }
    if (config.columns.count > 100) {
      errors.push('Column count exceeds Figma maximum (100)');
    }

    const marginPx = toPixels(config.columns.margin, config.columns.marginUnit, frameWidth);
    if (marginPx * 2 >= frameWidth) {
      errors.push('Column margins exceed frame width');
    }

    const gutterPx = toPixels(config.columns.gutterSize, config.columns.gutterUnit, frameWidth);
    if (gutterPx >= frameWidth) {
      errors.push('Column gutter exceeds frame width');
    }
  }

  // Check rows
  if (config.rows) {
    if (config.rows.count < 1) {
      errors.push('Row count must be at least 1');
    }
    if (config.rows.count > 100) {
      errors.push('Row count exceeds Figma maximum (100)');
    }

    const marginPx = toPixels(config.rows.margin, config.rows.marginUnit, frameHeight);
    if (marginPx * 2 >= frameHeight) {
      errors.push('Row margins exceed frame height');
    }
  }

  // Check baseline
  if (config.baseline) {
    if (config.baseline.height < 1) {
      errors.push('Baseline height must be at least 1px');
    }
    if (config.baseline.height > frameHeight) {
      warnings.push('Baseline height exceeds frame height');
    }
    if (config.baseline.offset < 0) {
      warnings.push('Baseline offset is negative');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// Default Grid Colors (Figma-friendly RGBA)
// ============================================

export const FIGMA_GRID_COLORS = {
  column: { r: 1, g: 0.2, b: 0.2, a: 0.1 } as GridColor, // Red
  row: { r: 0.2, g: 0.4, b: 1, a: 0.1 } as GridColor, // Blue
  baseline: { r: 0.2, g: 0.8, b: 0.9, a: 0.15 } as GridColor, // Cyan

  // Alternative color schemes
  mono: {
    column: { r: 0.4, g: 0.4, b: 0.4, a: 0.1 } as GridColor,
    row: { r: 0.3, g: 0.3, b: 0.3, a: 0.1 } as GridColor,
    baseline: { r: 0.5, g: 0.5, b: 0.5, a: 0.15 } as GridColor,
  },

  vibrant: {
    column: { r: 1, g: 0, b: 0.5, a: 0.15 } as GridColor, // Magenta
    row: { r: 0, g: 0.8, b: 1, a: 0.15 } as GridColor, // Cyan
    baseline: { r: 1, g: 0.8, b: 0, a: 0.2 } as GridColor, // Yellow
  },
};
