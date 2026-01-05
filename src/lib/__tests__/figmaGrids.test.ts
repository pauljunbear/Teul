import { describe, it, expect } from 'vitest';
import {
  columnConfigToFigmaGrid,
  rowConfigToFigmaGrid,
  baselineConfigToFigmaGrid,
  gridConfigToFigmaLayoutGrids,
  generateGridFrameName,
  gridConfigToFrameName,
  presetToFrameName,
  scaleGridForFrameSize,
  needsScaling,
  parseAspectRatio,
  getPresetFrameDimensions,
  buildCreateGridFrameMessage,
  buildApplyGridMessage,
  validateGridForFigma,
  FIGMA_GRID_COLORS,
} from '../figmaGrids';
import type {
  ColumnGridConfig,
  RowGridConfig,
  BaselineGridConfig,
  GridConfig,
  GridPreset,
} from '../../types/grid';

// ============================================
// columnConfigToFigmaGrid Tests
// ============================================

describe('columnConfigToFigmaGrid', () => {
  const defaultColor = { r: 1, g: 0, b: 0, a: 0.1 };

  it('converts basic column config with pixel units', () => {
    const config: ColumnGridConfig = {
      count: 12,
      gutterSize: 24,
      gutterUnit: 'px',
      margin: 32,
      marginUnit: 'px',
      alignment: 'STRETCH',
      visible: true,
      color: defaultColor,
    };

    const result = columnConfigToFigmaGrid(config, 1440);

    expect(result.pattern).toBe('COLUMNS');
    expect(result.alignment).toBe('STRETCH');
    expect(result.count).toBe(12);
    expect(result.gutterSize).toBe(24);
    expect(result.offset).toBe(32);
    expect(result.visible).toBe(true);
    expect(result.color).toEqual(defaultColor);
  });

  it('converts column config with percentage margins', () => {
    const config: ColumnGridConfig = {
      count: 6,
      gutterSize: 16,
      gutterUnit: 'px',
      margin: 10, // 10%
      marginUnit: 'percent',
      alignment: 'CENTER',
      visible: true,
      color: defaultColor,
    };

    const result = columnConfigToFigmaGrid(config, 1000);

    expect(result.offset).toBe(100); // 10% of 1000
  });

  it('converts column config with percentage gutters', () => {
    const config: ColumnGridConfig = {
      count: 4,
      gutterSize: 2, // 2%
      gutterUnit: 'percent',
      margin: 0,
      marginUnit: 'px',
      alignment: 'MIN',
      visible: false,
      color: defaultColor,
    };

    const result = columnConfigToFigmaGrid(config, 800);

    expect(result.gutterSize).toBe(16); // 2% of 800
    expect(result.visible).toBe(false);
  });

  it('rounds pixel values to whole numbers', () => {
    const config: ColumnGridConfig = {
      count: 3,
      gutterSize: 5, // 5% of 999 = 49.95
      gutterUnit: 'percent',
      margin: 3, // 3% of 999 = 29.97
      marginUnit: 'percent',
      alignment: 'STRETCH',
      visible: true,
      color: defaultColor,
    };

    const result = columnConfigToFigmaGrid(config, 999);

    expect(result.gutterSize).toBe(50); // Rounded from 49.95
    expect(result.offset).toBe(30); // Rounded from 29.97
  });
});

// ============================================
// rowConfigToFigmaGrid Tests
// ============================================

describe('rowConfigToFigmaGrid', () => {
  const defaultColor = { r: 0, g: 0, b: 1, a: 0.1 };

  it('converts basic row config with pixel units', () => {
    const config: RowGridConfig = {
      count: 8,
      gutterSize: 16,
      gutterUnit: 'px',
      margin: 24,
      marginUnit: 'px',
      alignment: 'STRETCH',
      visible: true,
      color: defaultColor,
    };

    const result = rowConfigToFigmaGrid(config, 900);

    expect(result.pattern).toBe('ROWS');
    expect(result.alignment).toBe('STRETCH');
    expect(result.count).toBe(8);
    expect(result.gutterSize).toBe(16);
    expect(result.offset).toBe(24);
  });

  it('converts row config with percentage values', () => {
    const config: RowGridConfig = {
      count: 4,
      gutterSize: 5, // 5%
      gutterUnit: 'percent',
      margin: 10, // 10%
      marginUnit: 'percent',
      alignment: 'CENTER',
      visible: true,
      color: defaultColor,
    };

    const result = rowConfigToFigmaGrid(config, 1000);

    expect(result.gutterSize).toBe(50); // 5% of 1000
    expect(result.offset).toBe(100); // 10% of 1000
  });
});

// ============================================
// baselineConfigToFigmaGrid Tests
// ============================================

describe('baselineConfigToFigmaGrid', () => {
  const defaultColor = { r: 0, g: 0.8, b: 0.9, a: 0.15 };

  it('converts baseline config correctly', () => {
    const config: BaselineGridConfig = {
      height: 8,
      offset: 0,
      visible: true,
      color: defaultColor,
    };

    const result = baselineConfigToFigmaGrid(config);

    expect(result.pattern).toBe('GRID');
    expect(result.alignment).toBe('MIN');
    expect(result.gutterSize).toBe(0);
    expect(result.count).toBe(1);
    expect(result.sectionSize).toBe(8);
    expect(result.offset).toBe(0);
    expect(result.visible).toBe(true);
  });

  it('preserves offset value', () => {
    const config: BaselineGridConfig = {
      height: 4,
      offset: 16,
      visible: false,
      color: defaultColor,
    };

    const result = baselineConfigToFigmaGrid(config);

    expect(result.sectionSize).toBe(4);
    expect(result.offset).toBe(16);
    expect(result.visible).toBe(false);
  });
});

// ============================================
// gridConfigToFigmaLayoutGrids Tests
// ============================================

describe('gridConfigToFigmaLayoutGrids', () => {
  const defaultColumnColor = { r: 1, g: 0, b: 0, a: 0.1 };
  const defaultRowColor = { r: 0, g: 0, b: 1, a: 0.1 };
  const defaultBaselineColor = { r: 0, g: 0.8, b: 0.9, a: 0.15 };

  it('converts config with only columns', () => {
    const config: GridConfig = {
      columns: {
        count: 12,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColumnColor,
      },
    };

    const result = gridConfigToFigmaLayoutGrids(config, 1440, 900);

    expect(result).toHaveLength(1);
    expect(result[0].pattern).toBe('COLUMNS');
  });

  it('converts config with columns and rows', () => {
    const config: GridConfig = {
      columns: {
        count: 12,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColumnColor,
      },
      rows: {
        count: 6,
        gutterSize: 16,
        gutterUnit: 'px',
        margin: 24,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultRowColor,
      },
    };

    const result = gridConfigToFigmaLayoutGrids(config, 1440, 900);

    expect(result).toHaveLength(2);
    expect(result[0].pattern).toBe('COLUMNS');
    expect(result[1].pattern).toBe('ROWS');
  });

  it('converts config with all three grid types', () => {
    const config: GridConfig = {
      columns: {
        count: 12,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColumnColor,
      },
      rows: {
        count: 6,
        gutterSize: 16,
        gutterUnit: 'px',
        margin: 24,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultRowColor,
      },
      baseline: {
        height: 8,
        offset: 0,
        visible: true,
        color: defaultBaselineColor,
      },
    };

    const result = gridConfigToFigmaLayoutGrids(config, 1440, 900);

    expect(result).toHaveLength(3);
    expect(result[0].pattern).toBe('COLUMNS');
    expect(result[1].pattern).toBe('ROWS');
    expect(result[2].pattern).toBe('GRID');
  });

  it('returns empty array for empty config', () => {
    const config: GridConfig = {};

    const result = gridConfigToFigmaLayoutGrids(config, 1440, 900);

    expect(result).toHaveLength(0);
  });
});

// ============================================
// generateGridFrameName Tests
// ============================================

describe('generateGridFrameName', () => {
  it('generates name with preset name and columns', () => {
    const result = generateGridFrameName({
      presetName: 'Swiss Grid',
      columns: 12,
    });

    expect(result).toBe('Grid - Swiss Grid - 12col');
  });

  it('generates name for modular grid with rows', () => {
    const result = generateGridFrameName({
      presetName: 'Modular',
      columns: 6,
      rows: 4,
      isModular: true,
    });

    expect(result).toBe('Grid - Modular - 6col × 4row');
  });

  it('uses source when no preset name', () => {
    const result = generateGridFrameName({
      source: 'MyGrids',
      columns: 8,
    });

    expect(result).toBe('Grid - MyGrids - 8col');
  });

  it('uses Custom when no source or preset', () => {
    const result = generateGridFrameName({
      columns: 4,
    });

    expect(result).toBe('Grid - Custom - 4col');
  });

  it('omits column spec when count is 0 or undefined', () => {
    const result = generateGridFrameName({
      presetName: 'Baseline Only',
    });

    expect(result).toBe('Grid - Baseline Only');
  });
});

// ============================================
// gridConfigToFrameName Tests
// ============================================

describe('gridConfigToFrameName', () => {
  it('generates name from config with columns', () => {
    const config: GridConfig = {
      columns: {
        count: 12,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: { r: 1, g: 0, b: 0, a: 0.1 },
      },
    };

    const result = gridConfigToFrameName(config, 'Swiss');

    expect(result).toBe('Grid - Swiss - 12col');
  });

  it('generates modular name when both columns and rows', () => {
    const config: GridConfig = {
      columns: {
        count: 6,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: { r: 1, g: 0, b: 0, a: 0.1 },
      },
      rows: {
        count: 4,
        gutterSize: 16,
        gutterUnit: 'px',
        margin: 24,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: { r: 0, g: 0, b: 1, a: 0.1 },
      },
    };

    const result = gridConfigToFrameName(config);

    expect(result).toBe('Grid - Custom - 6col × 4row');
  });
});

// ============================================
// parseAspectRatio Tests
// ============================================

describe('parseAspectRatio', () => {
  it('parses √2 (A-series paper) ratio', () => {
    const result = parseAspectRatio('1:√2', 800);

    expect(result.width).toBe(800);
    expect(result.height).toBe(1131); // 800 * 1.414 rounded
  });

  it('parses 1.414 ratio (alternative √2)', () => {
    const result = parseAspectRatio('1:1.414', 800);

    expect(result.width).toBe(800);
    expect(result.height).toBe(1131);
  });

  it('parses φ (golden ratio)', () => {
    const result = parseAspectRatio('1:φ', 800);

    expect(result.width).toBe(800);
    expect(result.height).toBe(1294); // 800 * 1.618 rounded
  });

  it('parses 1.618 ratio (alternative φ)', () => {
    const result = parseAspectRatio('1:1.618', 800);

    expect(result.width).toBe(800);
    expect(result.height).toBe(1294);
  });

  it('parses standard 16:9 ratio', () => {
    const result = parseAspectRatio('16:9', 1600);

    expect(result.width).toBe(1600);
    expect(result.height).toBe(900); // 1600 * (9/16)
  });

  it('parses portrait 2:3 ratio', () => {
    const result = parseAspectRatio('2:3', 800);

    expect(result.width).toBe(800);
    expect(result.height).toBe(1200); // 800 * 1.5
  });

  it('parses 1:1 square ratio', () => {
    const result = parseAspectRatio('1:1', 800);

    expect(result.width).toBe(800);
    expect(result.height).toBe(800);
  });

  it('parses 4:3 ratio', () => {
    const result = parseAspectRatio('4:3', 800);

    expect(result.width).toBe(800);
    expect(result.height).toBe(600); // 800 * 0.75
  });

  it('defaults to 4:3 for invalid input', () => {
    const result = parseAspectRatio('invalid', 800);

    expect(result.width).toBe(800);
    expect(result.height).toBe(600); // 800 * 0.75
  });

  it('uses default baseWidth of 800', () => {
    const result = parseAspectRatio('1:1');

    expect(result.width).toBe(800);
    expect(result.height).toBe(800);
  });
});

// ============================================
// getPresetFrameDimensions Tests
// ============================================

describe('getPresetFrameDimensions', () => {
  it('uses preset aspect ratio when available', () => {
    const preset: GridPreset = {
      id: 'test',
      name: 'Test Grid',
      description: 'Test',
      category: 'poster',
      aspectRatio: '1:1',
      tags: [],
      isCustom: false,
      config: {},
    };

    const result = getPresetFrameDimensions(preset, 800);

    expect(result.width).toBe(800);
    expect(result.height).toBe(800);
  });

  it('returns poster dimensions for poster category', () => {
    const preset: GridPreset = {
      id: 'poster-1',
      name: 'Poster Grid',
      description: 'Test',
      category: 'poster',
      tags: [],
      isCustom: false,
      config: {},
    };

    const result = getPresetFrameDimensions(preset);

    expect(result.width).toBe(800);
    expect(result.height).toBe(1132);
  });

  it('returns editorial dimensions for editorial category', () => {
    const preset: GridPreset = {
      id: 'editorial-1',
      name: 'Editorial Grid',
      description: 'Test',
      category: 'editorial',
      tags: [],
      isCustom: false,
      config: {},
    };

    const result = getPresetFrameDimensions(preset);

    expect(result.width).toBe(800);
    expect(result.height).toBe(1040);
  });

  it('returns web-ui dimensions for web-ui category', () => {
    const preset: GridPreset = {
      id: 'web-1',
      name: 'Web Grid',
      description: 'Test',
      category: 'web-ui',
      tags: [],
      isCustom: false,
      config: {},
    };

    const result = getPresetFrameDimensions(preset);

    expect(result.width).toBe(1440);
    expect(result.height).toBe(900);
  });

  it('returns default A-series dimensions for unknown category', () => {
    const preset: GridPreset = {
      id: 'unknown-1',
      name: 'Unknown Grid',
      description: 'Test',
      category: 'swiss' as any,
      tags: [],
      isCustom: false,
      config: {},
    };

    const result = getPresetFrameDimensions(preset, 800);

    expect(result.width).toBe(800);
    expect(result.height).toBe(1131); // 800 * 1.414
  });
});

// ============================================
// needsScaling Tests
// ============================================

describe('needsScaling', () => {
  it('returns false when dimensions match exactly', () => {
    const config: GridConfig = {};
    const result = needsScaling(config, 800, 600, 800, 600);

    expect(result).toBe(false);
  });

  it('returns false when dimensions within tolerance', () => {
    const config: GridConfig = {};
    const result = needsScaling(config, 800, 600, 800.5, 600.5, 1);

    expect(result).toBe(false);
  });

  it('returns true when width exceeds tolerance', () => {
    const config: GridConfig = {};
    const result = needsScaling(config, 800, 600, 810, 600, 5);

    expect(result).toBe(true);
  });

  it('returns true when height exceeds tolerance', () => {
    const config: GridConfig = {};
    const result = needsScaling(config, 800, 600, 800, 620, 5);

    expect(result).toBe(true);
  });

  it('uses default tolerance of 1 pixel', () => {
    const config: GridConfig = {};
    const result = needsScaling(config, 800, 600, 802, 600);

    expect(result).toBe(true);
  });
});

// ============================================
// validateGridForFigma Tests
// ============================================

describe('validateGridForFigma', () => {
  const defaultColor = { r: 1, g: 0, b: 0, a: 0.1 };

  it('validates valid column config', () => {
    const config: GridConfig = {
      columns: {
        count: 12,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
    };

    const result = validateGridForFigma(config, 1440, 900);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('errors when column count is less than 1', () => {
    const config: GridConfig = {
      columns: {
        count: 0,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
    };

    const result = validateGridForFigma(config, 1440, 900);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Column count must be at least 1');
  });

  it('errors when column count exceeds 100', () => {
    const config: GridConfig = {
      columns: {
        count: 101,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
    };

    const result = validateGridForFigma(config, 1440, 900);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Column count exceeds Figma maximum (100)');
  });

  it('errors when column margins exceed frame width', () => {
    const config: GridConfig = {
      columns: {
        count: 12,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 800, // 800 * 2 = 1600 > 1440
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
    };

    const result = validateGridForFigma(config, 1440, 900);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Column margins exceed frame width');
  });

  it('errors when column gutter exceeds frame width', () => {
    const config: GridConfig = {
      columns: {
        count: 12,
        gutterSize: 1500, // > 1440
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
    };

    const result = validateGridForFigma(config, 1440, 900);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Column gutter exceeds frame width');
  });

  it('errors when row count is less than 1', () => {
    const config: GridConfig = {
      rows: {
        count: 0,
        gutterSize: 16,
        gutterUnit: 'px',
        margin: 24,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
    };

    const result = validateGridForFigma(config, 1440, 900);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Row count must be at least 1');
  });

  it('errors when row count exceeds 100', () => {
    const config: GridConfig = {
      rows: {
        count: 150,
        gutterSize: 16,
        gutterUnit: 'px',
        margin: 24,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
    };

    const result = validateGridForFigma(config, 1440, 900);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Row count exceeds Figma maximum (100)');
  });

  it('errors when row margins exceed frame height', () => {
    const config: GridConfig = {
      rows: {
        count: 6,
        gutterSize: 16,
        gutterUnit: 'px',
        margin: 500, // 500 * 2 = 1000 > 900
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
    };

    const result = validateGridForFigma(config, 1440, 900);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Row margins exceed frame height');
  });

  it('errors when baseline height is less than 1', () => {
    const config: GridConfig = {
      baseline: {
        height: 0,
        offset: 0,
        visible: true,
        color: defaultColor,
      },
    };

    const result = validateGridForFigma(config, 1440, 900);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Baseline height must be at least 1px');
  });

  it('warns when baseline height exceeds frame height', () => {
    const config: GridConfig = {
      baseline: {
        height: 1000, // > 900
        offset: 0,
        visible: true,
        color: defaultColor,
      },
    };

    const result = validateGridForFigma(config, 1440, 900);

    expect(result.valid).toBe(true); // Warning, not error
    expect(result.warnings).toContain('Baseline height exceeds frame height');
  });

  it('warns when baseline offset is negative', () => {
    const config: GridConfig = {
      baseline: {
        height: 8,
        offset: -10,
        visible: true,
        color: defaultColor,
      },
    };

    const result = validateGridForFigma(config, 1440, 900);

    expect(result.valid).toBe(true); // Warning, not error
    expect(result.warnings).toContain('Baseline offset is negative');
  });

  it('accumulates multiple errors', () => {
    const config: GridConfig = {
      columns: {
        count: 0,
        gutterSize: 2000,
        gutterUnit: 'px',
        margin: 1000,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
    };

    const result = validateGridForFigma(config, 1440, 900);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

// ============================================
// buildCreateGridFrameMessage Tests
// ============================================

describe('buildCreateGridFrameMessage', () => {
  const defaultColor = { r: 1, g: 0, b: 0, a: 0.1 };

  it('builds message with column config', () => {
    const config: GridConfig = {
      columns: {
        count: 12,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
    };

    const result = buildCreateGridFrameMessage({
      config,
      width: 1440,
      height: 900,
    });

    expect(result.type).toBe('create-grid-frame');
    expect(result.width).toBe(1440);
    expect(result.height).toBe(900);
    expect(result.config.columns).toBeDefined();
    expect(result.config.columns?.pattern).toBe('COLUMNS');
    expect(result.positionNearSelection).toBe(true); // Default
  });

  it('uses provided frame name', () => {
    const config: GridConfig = {};

    const result = buildCreateGridFrameMessage({
      config,
      frameName: 'My Custom Grid',
      width: 800,
      height: 600,
    });

    expect(result.frameName).toBe('My Custom Grid');
  });

  it('generates frame name when not provided', () => {
    const config: GridConfig = {
      columns: {
        count: 6,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
    };

    const result = buildCreateGridFrameMessage({
      config,
      width: 800,
      height: 600,
    });

    expect(result.frameName).toContain('6col');
  });

  it('includes image data when provided', () => {
    const config: GridConfig = {};

    const result = buildCreateGridFrameMessage({
      config,
      width: 800,
      height: 600,
      includeImage: true,
      imageData: 'base64data...',
    });

    expect(result.includeImage).toBe(true);
    expect(result.imageData).toBe('base64data...');
  });

  it('respects positionNearSelection setting', () => {
    const config: GridConfig = {};

    const result = buildCreateGridFrameMessage({
      config,
      width: 800,
      height: 600,
      positionNearSelection: false,
    });

    expect(result.positionNearSelection).toBe(false);
  });
});

// ============================================
// buildApplyGridMessage Tests
// ============================================

describe('buildApplyGridMessage', () => {
  const defaultColor = { r: 1, g: 0, b: 0, a: 0.1 };

  it('builds apply message with column config', () => {
    const config: GridConfig = {
      columns: {
        count: 12,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
    };

    const result = buildApplyGridMessage({
      config,
      width: 1440,
      height: 900,
    });

    expect(result.type).toBe('apply-grid');
    expect(result.config.columns).toBeDefined();
    expect(result.replaceExisting).toBe(true); // Default
  });

  it('respects replaceExisting setting', () => {
    const config: GridConfig = {};

    const result = buildApplyGridMessage({
      config,
      width: 800,
      height: 600,
      replaceExisting: false,
    });

    expect(result.replaceExisting).toBe(false);
  });

  it('includes all grid types when present', () => {
    const config: GridConfig = {
      columns: {
        count: 12,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
      rows: {
        count: 6,
        gutterSize: 16,
        gutterUnit: 'px',
        margin: 24,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
      },
      baseline: {
        height: 8,
        offset: 0,
        visible: true,
        color: defaultColor,
      },
    };

    const result = buildApplyGridMessage({
      config,
      width: 1440,
      height: 900,
    });

    expect(result.config.columns).toBeDefined();
    expect(result.config.rows).toBeDefined();
    expect(result.config.baseline).toBeDefined();
  });
});

// ============================================
// FIGMA_GRID_COLORS Tests
// ============================================

describe('FIGMA_GRID_COLORS', () => {
  it('has default colors for column, row, and baseline', () => {
    expect(FIGMA_GRID_COLORS.column).toBeDefined();
    expect(FIGMA_GRID_COLORS.row).toBeDefined();
    expect(FIGMA_GRID_COLORS.baseline).toBeDefined();
  });

  it('has mono color scheme', () => {
    expect(FIGMA_GRID_COLORS.mono).toBeDefined();
    expect(FIGMA_GRID_COLORS.mono.column).toBeDefined();
    expect(FIGMA_GRID_COLORS.mono.row).toBeDefined();
    expect(FIGMA_GRID_COLORS.mono.baseline).toBeDefined();
  });

  it('has vibrant color scheme', () => {
    expect(FIGMA_GRID_COLORS.vibrant).toBeDefined();
    expect(FIGMA_GRID_COLORS.vibrant.column).toBeDefined();
    expect(FIGMA_GRID_COLORS.vibrant.row).toBeDefined();
    expect(FIGMA_GRID_COLORS.vibrant.baseline).toBeDefined();
  });

  it('colors have valid RGBA format', () => {
    const color = FIGMA_GRID_COLORS.column;

    expect(color.r).toBeGreaterThanOrEqual(0);
    expect(color.r).toBeLessThanOrEqual(1);
    expect(color.g).toBeGreaterThanOrEqual(0);
    expect(color.g).toBeLessThanOrEqual(1);
    expect(color.b).toBeGreaterThanOrEqual(0);
    expect(color.b).toBeLessThanOrEqual(1);
    expect(color.a).toBeGreaterThanOrEqual(0);
    expect(color.a).toBeLessThanOrEqual(1);
  });
});
