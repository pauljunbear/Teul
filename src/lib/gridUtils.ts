// ============================================
// Grid System Utility Functions
// ============================================

import type {
  GridConfig,
  GridUnit,
  GridColor,
  GridApplicationMode,
  GridDimensions,
  GridResponsiveWidth,
} from '../types/grid';
import { DEFAULT_COLUMN_COLOR, DEFAULT_ROW_COLOR, DEFAULT_BASELINE_COLOR } from '../types/grid';

// Re-export default colors for convenience
export { DEFAULT_COLUMN_COLOR, DEFAULT_ROW_COLOR, DEFAULT_BASELINE_COLOR };

// ============================================
// Unit Conversion Utilities
// ============================================

/**
 * Convert a grid value to pixels based on its unit
 * @param value - The value to convert
 * @param unit - The unit of the value ('px' or 'percent')
 * @param totalSize - Total size for percentage calculation
 * @returns Value in pixels
 */
export function toPixels(value: number, unit: GridUnit, totalSize: number): number {
  return unit === 'percent' ? (value / 100) * totalSize : value;
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
  const widthScale = newWidth / originalWidth;
  const heightScale = newHeight / originalHeight;

  const scaled: GridConfig = {};

  if (config.columns) {
    scaled.columns = {
      ...config.columns,
      // Scale pixel values, keep percentages as-is
      gutterSize:
        config.columns.gutterUnit === 'px'
          ? config.columns.gutterSize * widthScale
          : config.columns.gutterSize,
      margin:
        config.columns.marginUnit === 'px'
          ? config.columns.margin * widthScale
          : config.columns.margin,
    };
  }

  if (config.rows) {
    scaled.rows = {
      ...config.rows,
      gutterSize:
        config.rows.gutterUnit === 'px'
          ? config.rows.gutterSize * heightScale
          : config.rows.gutterSize,
      margin:
        config.rows.marginUnit === 'px' ? config.rows.margin * heightScale : config.rows.margin,
    };
  }

  if (config.baseline) {
    scaled.baseline = {
      ...config.baseline,
      // Uniform spacing grids retain their pixel rhythm when a frame resizes.
      height: config.baseline.height,
      offset: config.baseline.offset,
    };
  }

  return scaled;
}

function hasValidDimensions(dimensions: GridDimensions): boolean {
  return (
    Number.isFinite(dimensions.width) &&
    Number.isFinite(dimensions.height) &&
    dimensions.width > 0 &&
    dimensions.height > 0
  );
}

/**
 * Resolve the source grid configuration for one target using the same geometry
 * contract used by fit analysis and backend application.
 */
export function resolveGridConfigForTarget(
  config: GridConfig,
  sourceDimensions: GridDimensions | undefined,
  targetDimensions: GridDimensions,
  applicationMode: GridApplicationMode = sourceDimensions ? 'scale-from-reference' : 'fixed',
  responsiveWidth?: GridResponsiveWidth
): GridConfig {
  if (applicationMode === 'fixed') {
    return config;
  }

  if (!hasValidDimensions(targetDimensions)) {
    throw new Error('Target grid dimensions must be finite positive numbers.');
  }

  if (applicationMode === 'responsive-width') {
    if (
      !responsiveWidth ||
      !Number.isFinite(responsiveWidth.min) ||
      responsiveWidth.min <= 0 ||
      (responsiveWidth.max !== undefined &&
        (!Number.isFinite(responsiveWidth.max) || responsiveWidth.max < responsiveWidth.min))
    ) {
      throw new Error('Responsive grid application requires a valid width range.');
    }

    const { min, max, maxContentWidth, contentInset = 0 } = responsiveWidth;
    if (targetDimensions.width < min || (max !== undefined && targetDimensions.width > max)) {
      const supportedRange = max === undefined ? `${min}px or wider` : `${min}-${max}px`;
      throw new Error(
        `This responsive grid supports frame widths of ${supportedRange}; frame height may vary.`
      );
    }

    if (maxContentWidth === undefined) {
      return config;
    }

    if (
      !Number.isFinite(maxContentWidth) ||
      maxContentWidth <= 0 ||
      !Number.isFinite(contentInset) ||
      contentInset < 0 ||
      !config.columns ||
      config.columns.alignment !== 'STRETCH'
    ) {
      throw new Error('Responsive centered-content grids require valid stretch columns.');
    }

    return {
      ...config,
      columns: {
        ...config.columns,
        margin: Math.max(0, (targetDimensions.width - maxContentWidth) / 2 + contentInset),
        marginUnit: 'px',
      },
    };
  }

  if (!sourceDimensions) {
    throw new Error(`${applicationMode} grid application requires reference dimensions.`);
  }

  if (!hasValidDimensions(sourceDimensions)) {
    throw new Error('Source grid dimensions must be finite positive numbers.');
  }

  if (applicationMode === 'canonical-only') {
    const matchesReference =
      Math.abs(sourceDimensions.width - targetDimensions.width) < 0.01 &&
      Math.abs(sourceDimensions.height - targetDimensions.height) < 0.01;

    if (!matchesReference) {
      throw new Error(
        `This source-faithful grid requires a ${sourceDimensions.width}\u00d7${sourceDimensions.height}px frame. Create the recommended frame or choose an adaptable preset.`
      );
    }

    return config;
  }

  return scaleGrid(
    config,
    sourceDimensions.width,
    sourceDimensions.height,
    targetDimensions.width,
    targetDimensions.height
  );
}

/**
 * Convert GridColor to CSS rgba string
 */
export function gridColorToCSS(color: GridColor): string {
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a})`;
}
