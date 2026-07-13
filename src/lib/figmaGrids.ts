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
  FigmaRowsColsLayoutGrid,
  FigmaUniformLayoutGrid,
  GridApplicationMode,
  GridDimensions,
  GridPreset,
  GridResponsiveWidth,
} from '../types/grid';
import { toPixels } from './gridUtils';

// Type for the Figma-formatted grid config passed to the plugin backend
interface FigmaGridConfigs {
  columns?: FigmaRowsColsLayoutGrid;
  rows?: FigmaRowsColsLayoutGrid;
  baseline?: FigmaUniformLayoutGrid;
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
): FigmaRowsColsLayoutGrid {
  const marginPx = toPixels(config.margin, config.marginUnit, frameWidth);
  const gutterPx = toPixels(config.gutterSize, config.gutterUnit, frameWidth);
  const grid: FigmaRowsColsLayoutGrid = {
    pattern: 'COLUMNS',
    alignment: config.alignment,
    gutterSize: Math.round(gutterPx),
    count: config.count,
    offset: Math.round(marginPx),
    visible: config.visible,
    color: config.color,
  };

  if (config.alignment !== 'STRETCH') {
    grid.sectionSize = Math.max(
      1,
      Math.round((frameWidth - marginPx * 2 - gutterPx * (config.count - 1)) / config.count)
    );
  }

  return grid;
}

/**
 * Convert a row grid configuration to Figma LayoutGrid format
 * @param config - Row grid configuration
 * @param frameHeight - Frame height for percentage calculations
 * @returns Figma LayoutGrid object
 */
export function rowConfigToFigmaGrid(
  config: RowGridConfig,
  frameHeight: number
): FigmaRowsColsLayoutGrid {
  const marginPx = toPixels(config.margin, config.marginUnit, frameHeight);
  const gutterPx = toPixels(config.gutterSize, config.gutterUnit, frameHeight);
  const grid: FigmaRowsColsLayoutGrid = {
    pattern: 'ROWS',
    alignment: config.alignment,
    gutterSize: Math.round(gutterPx),
    count: config.count,
    offset: Math.round(marginPx),
    visible: config.visible,
    color: config.color,
  };

  if (config.alignment !== 'STRETCH') {
    grid.sectionSize = Math.max(
      1,
      Math.round((frameHeight - marginPx * 2 - gutterPx * (config.count - 1)) / config.count)
    );
  }

  return grid;
}

/**
 * Convert a baseline grid configuration to Figma LayoutGrid format
 * @param config - Baseline grid configuration
 * @returns Figma LayoutGrid object
 */
export function baselineConfigToFigmaGrid(config: BaselineGridConfig): FigmaUniformLayoutGrid {
  return {
    pattern: 'GRID',
    sectionSize: config.height,
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
  if (preset.referenceDimensions) {
    return { ...preset.referenceDimensions };
  }

  if (!preset.isCustom) {
    throw new Error(`Bundled grid preset "${preset.id}" is missing reference dimensions.`);
  }

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

/** Resolve backward-compatible pixel-measurement behavior for any preset. */
export function getPresetApplicationMode(preset: GridPreset): GridApplicationMode {
  return preset.applicationMode ?? (preset.isCustom ? 'fixed' : 'scale-from-reference');
}

/** Source dimensions to use when resolving a preset for another target frame. */
export function getPresetSourceDimensions(preset: GridPreset): GridDimensions | undefined {
  return getPresetApplicationMode(preset) === 'fixed'
    ? undefined
    : getPresetFrameDimensions(preset);
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
  positionNearSelection?: boolean;
}): {
  type: 'create-grid-frame';
  config: FigmaGridConfigs;
  frameName: string;
  width: number;
  height: number;
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
    positionNearSelection: params.positionNearSelection !== false,
  };
}

/**
 * Build the message payload for applying a grid to selection
 */
export function buildApplyGridMessage(params: {
  requestId: string;
  config: GridConfig;
  expectedTargetIds: readonly string[];
  replaceExisting?: boolean;
  sourceDimensions?: { width: number; height: number };
  applicationMode?: GridApplicationMode;
  responsiveWidth?: GridResponsiveWidth;
}): {
  type: 'apply-grid';
  requestId: string;
  sourceConfig: GridConfig;
  sourceDimensions?: { width: number; height: number };
  applicationMode: GridApplicationMode;
  responsiveWidth?: GridResponsiveWidth;
  expectedTargetIds: string[];
  replaceExisting: boolean;
} {
  return {
    type: 'apply-grid',
    requestId: params.requestId,
    sourceConfig: params.config,
    sourceDimensions: params.sourceDimensions,
    applicationMode:
      params.applicationMode ??
      (params.sourceDimensions === undefined ? 'fixed' : 'scale-from-reference'),
    responsiveWidth: params.responsiveWidth,
    expectedTargetIds: [...params.expectedTargetIds],
    replaceExisting: params.replaceExisting !== false,
  };
}
