/**
 * Tests for Grid Utility Functions
 *
 * Covers:
 * - Unit conversions (px ↔ percent)
 * - Aspect ratio calculations
 * - Grid dimension calculations
 * - Grid scaling
 * - Baseline typography utilities
 * - GridConfig to Figma conversion
 * - Grid validation
 * - SVG path generation
 * - Color conversions
 */

import { describe, it, expect } from 'vitest';
import type {
  GridConfig,
  ColumnGridConfig,
  RowGridConfig,
  BaselineGridConfig,
  GridColor,
} from '../../types/grid';
import {
  // Unit conversions
  percentToPixels,
  pixelsToPercent,
  toPixels,
  fromPixels,
  // Aspect ratios
  calculateAspectRatio,
  getAspectRatioName,
  COMMON_ASPECT_RATIOS,
  // Grid calculations
  calculateColumnWidth,
  calculateRowHeight,
  calculateModuleDimensions,
  // Grid scaling
  scaleGrid,
  // Baseline utilities
  calculateBaselineFromTypography,
  getTypographySuggestions,
  // Figma conversion
  gridConfigToFigmaLayoutGrids,
  // Validation
  validateGridConfig,
  // SVG generation
  generateColumnGridSVGPath,
  generateRowGridSVGPath,
  generateBaselineGridSVGPath,
  // Color utilities
  gridColorToCSS,
  cssToGridColor,
  // Default colors
  DEFAULT_COLUMN_COLOR,
  DEFAULT_ROW_COLOR,
  DEFAULT_BASELINE_COLOR,
} from '../gridUtils';

// ============================================
// Test Fixtures
// ============================================

const createColumnConfig = (overrides: Partial<ColumnGridConfig> = {}): ColumnGridConfig => ({
  count: 12,
  gutterSize: 20,
  gutterUnit: 'px',
  margin: 40,
  marginUnit: 'px',
  alignment: 'STRETCH',
  visible: true,
  color: DEFAULT_COLUMN_COLOR,
  ...overrides,
});

const createRowConfig = (overrides: Partial<RowGridConfig> = {}): RowGridConfig => ({
  count: 6,
  gutterSize: 20,
  gutterUnit: 'px',
  margin: 40,
  marginUnit: 'px',
  alignment: 'STRETCH',
  visible: true,
  color: DEFAULT_ROW_COLOR,
  ...overrides,
});

const createBaselineConfig = (overrides: Partial<BaselineGridConfig> = {}): BaselineGridConfig => ({
  height: 8,
  offset: 0,
  visible: true,
  color: DEFAULT_BASELINE_COLOR,
  ...overrides,
});

// ============================================
// Unit Conversion Tests
// ============================================

describe('Unit Conversion Utilities', () => {
  describe('percentToPixels', () => {
    it('converts percentage to pixels correctly', () => {
      expect(percentToPixels(50, 1000)).toBe(500);
      expect(percentToPixels(25, 800)).toBe(200);
      expect(percentToPixels(100, 400)).toBe(400);
    });

    it('handles 0% correctly', () => {
      expect(percentToPixels(0, 1000)).toBe(0);
    });

    it('handles fractional percentages', () => {
      expect(percentToPixels(33.33, 300)).toBeCloseTo(99.99, 2);
    });

    it('handles percentages over 100', () => {
      expect(percentToPixels(150, 100)).toBe(150);
    });
  });

  describe('pixelsToPercent', () => {
    it('converts pixels to percentage correctly', () => {
      expect(pixelsToPercent(500, 1000)).toBe(50);
      expect(pixelsToPercent(200, 800)).toBe(25);
      expect(pixelsToPercent(400, 400)).toBe(100);
    });

    it('handles 0 pixels correctly', () => {
      expect(pixelsToPercent(0, 1000)).toBe(0);
    });

    it('handles 0 total size (division by zero)', () => {
      expect(pixelsToPercent(100, 0)).toBe(0);
    });

    it('handles fractional results', () => {
      expect(pixelsToPercent(100, 300)).toBeCloseTo(33.33, 2);
    });
  });

  describe('toPixels', () => {
    it('returns pixels unchanged when unit is px', () => {
      expect(toPixels(100, 'px', 1000)).toBe(100);
    });

    it('converts percent to pixels', () => {
      expect(toPixels(50, 'percent', 1000)).toBe(500);
    });
  });

  describe('fromPixels', () => {
    it('returns pixels unchanged when target unit is px', () => {
      expect(fromPixels(100, 'px', 1000)).toBe(100);
    });

    it('converts pixels to percent', () => {
      expect(fromPixels(500, 'percent', 1000)).toBe(50);
    });
  });
});

// ============================================
// Aspect Ratio Tests
// ============================================

describe('Aspect Ratio Utilities', () => {
  describe('COMMON_ASPECT_RATIOS', () => {
    it('contains expected common ratios', () => {
      const names = COMMON_ASPECT_RATIOS.map(r => r.name);
      expect(names).toContain('Square');
      expect(names).toContain('Golden Ratio');
      expect(names).toContain('A-series (ISO 216)');
      expect(names).toContain('Widescreen 16:9');
    });

    it('has valid ratio values', () => {
      for (const ratio of COMMON_ASPECT_RATIOS) {
        expect(ratio.ratio).toBeGreaterThan(0);
        expect(ratio.display).toBeTruthy();
      }
    });
  });

  describe('calculateAspectRatio', () => {
    it('calculates landscape ratios correctly', () => {
      expect(calculateAspectRatio(1920, 1080)).toBeCloseTo(1.778, 3);
      expect(calculateAspectRatio(1000, 1000)).toBe(1);
    });

    it('calculates portrait ratios correctly', () => {
      expect(calculateAspectRatio(1080, 1920)).toBeCloseTo(0.5625, 4);
    });

    it('handles zero height (returns 1 as fallback)', () => {
      expect(calculateAspectRatio(1000, 0)).toBe(1);
    });

    it('handles very wide aspect ratios', () => {
      expect(calculateAspectRatio(2350, 1000)).toBe(2.35);
    });
  });

  describe('getAspectRatioName', () => {
    it('identifies square ratio', () => {
      expect(getAspectRatioName(1)).toBe('1:1');
    });

    it('identifies golden ratio', () => {
      expect(getAspectRatioName(1.618)).toBe('1:φ');
    });

    it('identifies A-series (√2)', () => {
      expect(getAspectRatioName(1.414)).toBe('1:√2');
    });

    it('identifies 16:9 widescreen', () => {
      expect(getAspectRatioName(1.778)).toBe('16:9');
    });

    it('handles portrait orientation', () => {
      // Portrait 2:3 should normalize to 3:2 = 1.5
      const result = getAspectRatioName(0.667);
      expect(result).toBe('2:3');
    });

    it('returns decimal for non-standard ratios', () => {
      const result = getAspectRatioName(1.123);
      // Should return either a fraction or decimal
      expect(result).toBeTruthy();
    });

    it('uses tolerance for matching', () => {
      // Slightly off from 16:9
      expect(getAspectRatioName(1.78, 0.01)).toBe('16:9');
      // Too far off with tight tolerance
      expect(getAspectRatioName(1.75, 0.01)).not.toBe('16:9');
    });
  });
});

// ============================================
// Grid Calculation Tests
// ============================================

describe('Grid Calculation Utilities', () => {
  describe('calculateColumnWidth', () => {
    it('calculates column width for standard 12-column grid', () => {
      const config = createColumnConfig({
        count: 12,
        gutterSize: 20,
        gutterUnit: 'px',
        margin: 40,
        marginUnit: 'px',
      });
      // Frame: 1440px
      // Available: 1440 - 80 (margins) = 1360px
      // Gutters: 20 * 11 = 220px
      // Columns: (1360 - 220) / 12 = 95px
      expect(calculateColumnWidth(config, 1440)).toBe(95);
    });

    it('handles percentage gutters', () => {
      const config = createColumnConfig({
        count: 4,
        gutterSize: 2,
        gutterUnit: 'percent',
        margin: 5,
        marginUnit: 'percent',
      });
      // Frame: 1000px
      // Margin: 5% * 1000 = 50px each side = 100px total
      // Available: 1000 - 100 = 900px
      // Gutter: 2% * 1000 = 20px, total: 20 * 3 = 60px
      // Columns: (900 - 60) / 4 = 210px
      expect(calculateColumnWidth(config, 1000)).toBe(210);
    });

    it('handles single column', () => {
      const config = createColumnConfig({
        count: 1,
        gutterSize: 20,
        margin: 0,
      });
      expect(calculateColumnWidth(config, 1000)).toBe(1000);
    });

    it('handles zero margin', () => {
      const config = createColumnConfig({
        count: 4,
        gutterSize: 20,
        margin: 0,
      });
      // Available: 1000px
      // Gutters: 20 * 3 = 60px
      // Columns: (1000 - 60) / 4 = 235px
      expect(calculateColumnWidth(config, 1000)).toBe(235);
    });
  });

  describe('calculateRowHeight', () => {
    it('calculates row height correctly', () => {
      const config = createRowConfig({
        count: 6,
        gutterSize: 20,
        gutterUnit: 'px',
        margin: 40,
        marginUnit: 'px',
      });
      // Frame: 800px
      // Available: 800 - 80 = 720px
      // Gutters: 20 * 5 = 100px
      // Rows: (720 - 100) / 6 ≈ 103.33px
      expect(calculateRowHeight(config, 800)).toBeCloseTo(103.33, 2);
    });

    it('handles percentage margins', () => {
      const config = createRowConfig({
        count: 3,
        gutterSize: 10,
        gutterUnit: 'px',
        margin: 10,
        marginUnit: 'percent',
      });
      // Frame: 500px
      // Margin: 10% * 500 = 50px each = 100px total
      // Available: 500 - 100 = 400px
      // Gutters: 10 * 2 = 20px
      // Rows: (400 - 20) / 3 ≈ 126.67px
      expect(calculateRowHeight(config, 500)).toBeCloseTo(126.67, 2);
    });
  });

  describe('calculateModuleDimensions', () => {
    it('returns both width and height', () => {
      const columns = createColumnConfig({ count: 4, gutterSize: 20, margin: 40 });
      const rows = createRowConfig({ count: 3, gutterSize: 20, margin: 40 });

      const result = calculateModuleDimensions(columns, rows, 1000, 600);

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result).toHaveProperty('width');
      expect(result).toHaveProperty('height');
    });
  });
});

// ============================================
// Grid Scaling Tests
// ============================================

describe('Grid Scaling Utilities', () => {
  describe('scaleGrid', () => {
    it('scales pixel-based columns proportionally', () => {
      const config: GridConfig = {
        columns: createColumnConfig({
          gutterSize: 20,
          gutterUnit: 'px',
          margin: 40,
          marginUnit: 'px',
        }),
      };

      const scaled = scaleGrid(config, 1000, 800, 2000, 1600);

      expect(scaled.columns?.gutterSize).toBe(40);
      expect(scaled.columns?.margin).toBe(80);
    });

    it('keeps percentage values unchanged', () => {
      const config: GridConfig = {
        columns: createColumnConfig({
          gutterSize: 2,
          gutterUnit: 'percent',
          margin: 5,
          marginUnit: 'percent',
        }),
      };

      const scaled = scaleGrid(config, 1000, 800, 2000, 1600);

      expect(scaled.columns?.gutterSize).toBe(2);
      expect(scaled.columns?.margin).toBe(5);
    });

    it('scales rows with height scale factor', () => {
      const config: GridConfig = {
        rows: createRowConfig({
          gutterSize: 10,
          gutterUnit: 'px',
          margin: 20,
          marginUnit: 'px',
        }),
      };

      const scaled = scaleGrid(config, 1000, 500, 1000, 1000);

      // Height doubled
      expect(scaled.rows?.gutterSize).toBe(20);
      expect(scaled.rows?.margin).toBe(40);
    });

    it('scales baseline using minimum of width/height scale', () => {
      const config: GridConfig = {
        baseline: createBaselineConfig({
          height: 8,
          offset: 16,
        }),
      };

      const scaled = scaleGrid(config, 1000, 1000, 2000, 1500);
      // Width scale: 2, Height scale: 1.5, min = 1.5
      expect(scaled.baseline?.height).toBe(12);
      expect(scaled.baseline?.offset).toBe(24);
    });

    it('handles empty config', () => {
      const config: GridConfig = {};
      const scaled = scaleGrid(config, 1000, 800, 2000, 1600);
      expect(scaled).toEqual({});
    });

    it('preserves non-scaled properties', () => {
      const config: GridConfig = {
        columns: createColumnConfig({
          count: 12,
          alignment: 'CENTER',
          visible: false,
        }),
      };

      const scaled = scaleGrid(config, 1000, 800, 2000, 1600);

      expect(scaled.columns?.count).toBe(12);
      expect(scaled.columns?.alignment).toBe('CENTER');
      expect(scaled.columns?.visible).toBe(false);
    });
  });
});

// ============================================
// Baseline Typography Tests
// ============================================

describe('Baseline Typography Utilities', () => {
  describe('calculateBaselineFromTypography', () => {
    it('calculates baseline from font size and line height', () => {
      // 16px * 1.5 = 24px baseline
      expect(calculateBaselineFromTypography(16, 1.5)).toBe(24);
    });

    it('rounds to nearest nice number', () => {
      // 14px * 1.4 = 19.6 → rounds to 20
      expect(calculateBaselineFromTypography(14, 1.4)).toBe(20);
    });

    it('handles small text sizes', () => {
      // 10px * 1.2 = 12px
      expect(calculateBaselineFromTypography(10, 1.2)).toBe(12);
    });

    it('handles large text sizes', () => {
      // 24px * 1.5 = 36px
      expect(calculateBaselineFromTypography(24, 1.5)).toBe(36);
    });

    it('returns from predefined nice numbers', () => {
      const niceNumbers = [4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48];
      const result = calculateBaselineFromTypography(16, 1.5);
      expect(niceNumbers).toContain(result);
    });
  });

  describe('getTypographySuggestions', () => {
    it('returns body size and line height', () => {
      const result = getTypographySuggestions(24);

      expect(result.bodySize).toBe(16);
      expect(result.bodyLineHeight).toBe(1.5);
    });

    it('returns heading sizes array', () => {
      const result = getTypographySuggestions(24);

      expect(result.headingSizes).toHaveLength(4);
      expect(result.headingSizes[0]).toBeGreaterThan(result.bodySize);
    });

    it('uses modular scale for headings', () => {
      const result = getTypographySuggestions(24);
      const scale = 1.25;
      const bodySize = result.bodySize;

      expect(result.headingSizes[0]).toBe(Math.round(bodySize * scale));
      expect(result.headingSizes[1]).toBe(Math.round(bodySize * scale * scale));
    });

    it('handles different baseline values', () => {
      const small = getTypographySuggestions(12);
      const large = getTypographySuggestions(36);

      expect(small.bodySize).toBeLessThan(large.bodySize);
    });
  });
});

// ============================================
// Figma Conversion Tests
// ============================================

describe('GridConfig to Figma Conversion', () => {
  describe('gridConfigToFigmaLayoutGrids', () => {
    it('converts column config to COLUMNS pattern', () => {
      const config: GridConfig = {
        columns: createColumnConfig({ count: 12, gutterSize: 20, margin: 40 }),
      };

      const result = gridConfigToFigmaLayoutGrids(config, 1440, 900);

      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('COLUMNS');
      expect(result[0].count).toBe(12);
      expect(result[0].gutterSize).toBe(20);
      expect(result[0].offset).toBe(40);
    });

    it('converts row config to ROWS pattern', () => {
      const config: GridConfig = {
        rows: createRowConfig({ count: 6, gutterSize: 20, margin: 40 }),
      };

      const result = gridConfigToFigmaLayoutGrids(config, 1440, 900);

      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('ROWS');
      expect(result[0].count).toBe(6);
    });

    it('converts baseline config to GRID pattern', () => {
      const config: GridConfig = {
        baseline: createBaselineConfig({ height: 8, offset: 4 }),
      };

      const result = gridConfigToFigmaLayoutGrids(config, 1440, 900);

      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('GRID');
      expect(result[0].sectionSize).toBe(8);
      expect(result[0].offset).toBe(4);
      expect(result[0].alignment).toBe('MIN');
    });

    it('converts full grid config to multiple layout grids', () => {
      const config: GridConfig = {
        columns: createColumnConfig(),
        rows: createRowConfig(),
        baseline: createBaselineConfig(),
      };

      const result = gridConfigToFigmaLayoutGrids(config, 1440, 900);

      expect(result).toHaveLength(3);
      expect(result.map(g => g.pattern)).toContain('COLUMNS');
      expect(result.map(g => g.pattern)).toContain('ROWS');
      expect(result.map(g => g.pattern)).toContain('GRID');
    });

    it('converts percentage values to pixels', () => {
      const config: GridConfig = {
        columns: createColumnConfig({
          gutterSize: 2,
          gutterUnit: 'percent',
          margin: 5,
          marginUnit: 'percent',
        }),
      };

      const result = gridConfigToFigmaLayoutGrids(config, 1000, 800);

      expect(result[0].gutterSize).toBe(20); // 2% of 1000
      expect(result[0].offset).toBe(50); // 5% of 1000
    });

    it('rounds pixel values', () => {
      const config: GridConfig = {
        columns: createColumnConfig({
          gutterSize: 33.33,
          gutterUnit: 'percent',
          margin: 100,
          marginUnit: 'px',
        }),
      };

      const result = gridConfigToFigmaLayoutGrids(config, 300, 200);

      expect(Number.isInteger(result[0].gutterSize)).toBe(true);
      expect(Number.isInteger(result[0].offset)).toBe(true);
    });

    it('preserves visibility and color', () => {
      const customColor: GridColor = { r: 0, g: 1, b: 0, a: 0.5 };
      const config: GridConfig = {
        columns: createColumnConfig({
          visible: false,
          color: customColor,
        }),
      };

      const result = gridConfigToFigmaLayoutGrids(config, 1000, 800);

      expect(result[0].visible).toBe(false);
      expect(result[0].color).toEqual(customColor);
    });

    it('returns empty array for empty config', () => {
      const config: GridConfig = {};
      const result = gridConfigToFigmaLayoutGrids(config, 1000, 800);
      expect(result).toEqual([]);
    });
  });
});

// ============================================
// Grid Validation Tests
// ============================================

describe('Grid Validation Utilities', () => {
  describe('validateGridConfig', () => {
    it('returns valid for reasonable config', () => {
      const config: GridConfig = {
        columns: createColumnConfig({ count: 12 }),
        rows: createRowConfig({ count: 6 }),
        baseline: createBaselineConfig({ height: 8 }),
      };

      const result = validateGridConfig(config, 1440, 900);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('warns about narrow columns', () => {
      const config: GridConfig = {
        columns: createColumnConfig({
          count: 100, // Way too many
          gutterSize: 5,
          margin: 10,
        }),
      };

      const result = validateGridConfig(config, 500, 400);

      expect(result.valid).toBe(false);
      expect(result.warnings.some(w => w.includes('narrow'))).toBe(true);
    });

    it('warns about high column count', () => {
      const config: GridConfig = {
        columns: createColumnConfig({ count: 30 }),
      };

      const result = validateGridConfig(config, 4000, 2000);

      expect(result.warnings.some(w => w.includes('column count'))).toBe(true);
    });

    it('warns about large margins', () => {
      const config: GridConfig = {
        columns: createColumnConfig({
          margin: 300,
          marginUnit: 'px',
        }),
      };

      const result = validateGridConfig(config, 1000, 800);

      expect(result.warnings.some(w => w.includes('Margins exceed'))).toBe(true);
    });

    it('warns about short rows', () => {
      const config: GridConfig = {
        rows: createRowConfig({
          count: 50,
          gutterSize: 2,
          margin: 10,
        }),
      };

      const result = validateGridConfig(config, 1000, 400);

      expect(result.warnings.some(w => w.includes('short'))).toBe(true);
    });

    it('warns about small baseline height', () => {
      const config: GridConfig = {
        baseline: createBaselineConfig({ height: 2 }),
      };

      const result = validateGridConfig(config, 1000, 800);

      expect(result.warnings.some(w => w.includes('small'))).toBe(true);
    });

    it('warns about large baseline height', () => {
      const config: GridConfig = {
        baseline: createBaselineConfig({ height: 64 }),
      };

      const result = validateGridConfig(config, 1000, 800);

      expect(result.warnings.some(w => w.includes('large'))).toBe(true);
    });

    it('handles empty config without errors', () => {
      const config: GridConfig = {};
      const result = validateGridConfig(config, 1000, 800);
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================
// SVG Path Generation Tests
// ============================================

describe('SVG Path Generation', () => {
  describe('generateColumnGridSVGPath', () => {
    it('generates path for columns', () => {
      const config = createColumnConfig({
        count: 3,
        gutterSize: 10,
        gutterUnit: 'px',
        margin: 20,
        marginUnit: 'px',
      });

      const path = generateColumnGridSVGPath(config, 200, 100);

      expect(path).toContain('M');
      expect(path).toContain('L');
      // Should have 6 vertical lines (2 per column)
      expect(path.split('M').length - 1).toBe(6);
    });

    it('handles zero margin', () => {
      const config = createColumnConfig({
        count: 2,
        gutterSize: 10,
        margin: 0,
      });

      const path = generateColumnGridSVGPath(config, 100, 50);

      // First column should start at x=0
      expect(path).toContain('M 0 0');
    });

    it('generates correct height for lines', () => {
      const config = createColumnConfig({ count: 1, margin: 0, gutterSize: 0 });
      const path = generateColumnGridSVGPath(config, 100, 150);

      expect(path).toContain('L 0 150');
      expect(path).toContain('L 100 150');
    });
  });

  describe('generateRowGridSVGPath', () => {
    it('generates path for rows', () => {
      const config = createRowConfig({
        count: 2,
        gutterSize: 10,
        margin: 20,
      });

      const path = generateRowGridSVGPath(config, 100, 200);

      expect(path).toContain('M');
      expect(path).toContain('L');
      // Should have 4 horizontal lines (2 per row)
      expect(path.split('M').length - 1).toBe(4);
    });

    it('handles percentage values', () => {
      const config = createRowConfig({
        count: 2,
        gutterSize: 10,
        gutterUnit: 'percent',
        margin: 10,
        marginUnit: 'percent',
      });

      const path = generateRowGridSVGPath(config, 100, 200);

      expect(path).toBeTruthy();
      expect(path).toContain('M');
    });
  });

  describe('generateBaselineGridSVGPath', () => {
    it('generates horizontal lines at baseline intervals', () => {
      const config = createBaselineConfig({ height: 20, offset: 0 });
      const path = generateBaselineGridSVGPath(config, 100, 100);

      // Should have lines at y=0, 20, 40, 60, 80
      expect(path.split('M').length - 1).toBe(5);
    });

    it('respects offset', () => {
      const config = createBaselineConfig({ height: 20, offset: 10 });
      const path = generateBaselineGridSVGPath(config, 100, 50);

      // Should have lines at y=10, 30
      expect(path).toContain('M 0 10');
      expect(path).toContain('M 0 30');
    });

    it('spans full width', () => {
      const config = createBaselineConfig({ height: 50, offset: 0 });
      const path = generateBaselineGridSVGPath(config, 200, 100);

      expect(path).toContain('L 200');
    });
  });
});

// ============================================
// Color Conversion Tests
// ============================================

describe('Color Conversion Utilities', () => {
  describe('gridColorToCSS', () => {
    it('converts GridColor to rgba string', () => {
      const color: GridColor = { r: 1, g: 0, b: 0, a: 0.5 };
      expect(gridColorToCSS(color)).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('handles fractional RGB values', () => {
      const color: GridColor = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
      expect(gridColorToCSS(color)).toBe('rgba(128, 128, 128, 1)');
    });

    it('rounds RGB values', () => {
      const color: GridColor = { r: 0.333, g: 0.666, b: 0.999, a: 0.5 };
      const result = gridColorToCSS(color);
      expect(result).toMatch(/rgba\(\d+, \d+, \d+, 0\.5\)/);
    });

    it('preserves alpha precision', () => {
      const color: GridColor = { r: 0, g: 0, b: 0, a: 0.123 };
      expect(gridColorToCSS(color)).toContain('0.123');
    });
  });

  describe('cssToGridColor', () => {
    it('converts hex color to GridColor', () => {
      const result = cssToGridColor('#ff0000', 0.5);

      expect(result.r).toBe(1);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
      expect(result.a).toBe(0.5);
    });

    it('converts rgb() to GridColor', () => {
      const result = cssToGridColor('rgb(255, 128, 0)', 0.3);

      expect(result.r).toBeCloseTo(1, 2);
      expect(result.g).toBeCloseTo(0.5, 1);
      expect(result.b).toBe(0);
      expect(result.a).toBe(0.3);
    });

    it('converts rgba() and preserves alpha', () => {
      const result = cssToGridColor('rgba(0, 255, 0, 0.8)');

      expect(result.r).toBe(0);
      expect(result.g).toBe(1);
      expect(result.b).toBe(0);
      expect(result.a).toBe(0.8);
    });

    it('uses provided alpha for hex colors', () => {
      const result = cssToGridColor('#00ff00', 0.2);
      expect(result.a).toBe(0.2);
    });

    it('returns red fallback for invalid color', () => {
      const result = cssToGridColor('not-a-color');

      expect(result.r).toBe(1);
      expect(result.g).toBe(0.2);
      expect(result.b).toBe(0.2);
    });

    it('handles lowercase and uppercase hex', () => {
      const lower = cssToGridColor('#aabbcc');
      const upper = cssToGridColor('#AABBCC');

      expect(lower.r).toBeCloseTo(upper.r, 5);
      expect(lower.g).toBeCloseTo(upper.g, 5);
      expect(lower.b).toBeCloseTo(upper.b, 5);
    });
  });
});

// ============================================
// Default Colors Tests
// ============================================

describe('Default Colors', () => {
  it('exports DEFAULT_COLUMN_COLOR', () => {
    expect(DEFAULT_COLUMN_COLOR).toBeDefined();
    expect(DEFAULT_COLUMN_COLOR).toHaveProperty('r');
    expect(DEFAULT_COLUMN_COLOR).toHaveProperty('g');
    expect(DEFAULT_COLUMN_COLOR).toHaveProperty('b');
    expect(DEFAULT_COLUMN_COLOR).toHaveProperty('a');
  });

  it('exports DEFAULT_ROW_COLOR', () => {
    expect(DEFAULT_ROW_COLOR).toBeDefined();
  });

  it('exports DEFAULT_BASELINE_COLOR', () => {
    expect(DEFAULT_BASELINE_COLOR).toBeDefined();
  });

  it('default colors have valid ranges', () => {
    const colors = [DEFAULT_COLUMN_COLOR, DEFAULT_ROW_COLOR, DEFAULT_BASELINE_COLOR];

    for (const color of colors) {
      expect(color.r).toBeGreaterThanOrEqual(0);
      expect(color.r).toBeLessThanOrEqual(1);
      expect(color.g).toBeGreaterThanOrEqual(0);
      expect(color.g).toBeLessThanOrEqual(1);
      expect(color.b).toBeGreaterThanOrEqual(0);
      expect(color.b).toBeLessThanOrEqual(1);
      expect(color.a).toBeGreaterThanOrEqual(0);
      expect(color.a).toBeLessThanOrEqual(1);
    }
  });
});
