import { describe, it, expect } from 'vitest';
import {
  columnConfigToFigmaGrid,
  rowConfigToFigmaGrid,
  baselineConfigToFigmaGrid,
  gridConfigToFigmaLayoutGrids,
  generateGridFrameName,
  gridConfigToFrameName,
  parseAspectRatio,
  getPresetApplicationMode,
  getPresetFrameDimensions,
  getPresetSourceDimensions,
  buildCreateGridFrameMessage,
  buildApplyGridMessage,
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
    expect(result).not.toHaveProperty('sectionSize');
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
    expect(result.sectionSize).toBe(120);
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
    expect(result.sectionSize).toBe(188);
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
    expect(result).not.toHaveProperty('sectionSize');
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
    expect(result.sectionSize).toBe(163);
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

    expect(result).toEqual({
      pattern: 'GRID',
      sectionSize: 8,
      visible: true,
      color: defaultColor,
    });
  });

  it('does not send unsupported offset fields for a uniform GRID', () => {
    const config: BaselineGridConfig = {
      height: 4,
      offset: 16,
      visible: false,
      color: defaultColor,
    };

    const result = baselineConfigToFigmaGrid(config);

    expect(result.sectionSize).toBe(4);
    expect(result).not.toHaveProperty('offset');
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
  it('uses explicit reference dimensions before inferred category or aspect dimensions', () => {
    const preset: GridPreset = {
      id: 'documented-format',
      name: 'Documented Format',
      description: 'Test',
      category: 'poster',
      aspectRatio: '1:1',
      referenceDimensions: { width: 650, height: 950 },
      tags: [],
      isCustom: false,
      config: {},
    };

    expect(getPresetFrameDimensions(preset)).toEqual({ width: 650, height: 950 });
  });

  it('uses preset aspect ratio when available', () => {
    const preset: GridPreset = {
      id: 'test',
      name: 'Test Grid',
      description: 'Test',
      category: 'poster',
      aspectRatio: '1:1',
      tags: [],
      isCustom: true,
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
      isCustom: true,
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
      isCustom: true,
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
      isCustom: true,
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
      category: 'classic-swiss',
      tags: [],
      isCustom: true,
      config: {},
    };

    const result = getPresetFrameDimensions(preset, 800);

    expect(result.width).toBe(800);
    expect(result.height).toBe(1131); // 800 * 1.414
  });

  it('rejects bundled presets that omit an explicit reference frame', () => {
    const preset: GridPreset = {
      id: 'invalid-bundled',
      name: 'Invalid Bundled Grid',
      description: 'Test',
      category: 'web-ui',
      tags: [],
      isCustom: false,
      config: {},
    };

    expect(() => getPresetFrameDimensions(preset)).toThrow('missing reference dimensions');
  });
});

describe('preset application behavior', () => {
  const makePreset = (overrides: Partial<GridPreset> = {}): GridPreset => ({
    id: 'preset',
    name: 'Preset',
    description: 'Test preset',
    category: 'custom',
    tags: [],
    config: {
      columns: {
        count: 4,
        gutterSize: 20,
        gutterUnit: 'px',
        margin: 40,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: { r: 1, g: 0.2, b: 0.2, a: 0.1 },
      },
    },
    isCustom: false,
    ...overrides,
  });

  it('keeps legacy bundled presets scaling and legacy saved grids fixed', () => {
    const bundled = makePreset({ referenceDimensions: { width: 1200, height: 800 } });
    const saved = makePreset({
      isCustom: true,
      referenceDimensions: { width: 1200, height: 800 },
    });

    expect(getPresetApplicationMode(bundled)).toBe('scale-from-reference');
    expect(getPresetSourceDimensions(bundled)).toEqual({ width: 1200, height: 800 });
    expect(getPresetApplicationMode(saved)).toBe('fixed');
    expect(getPresetSourceDimensions(saved)).toBeUndefined();
  });

  it('respects explicit fixed, scalable, responsive, and canonical-only modes', () => {
    const fixed = makePreset({
      applicationMode: 'fixed',
      referenceDimensions: { width: 1200, height: 800 },
    });
    const scalableSaved = makePreset({
      isCustom: true,
      applicationMode: 'scale-from-reference',
      referenceDimensions: { width: 1200, height: 800 },
    });
    const canonical = makePreset({
      applicationMode: 'canonical-only',
      referenceDimensions: { width: 580, height: 580 },
    });
    const responsive = makePreset({
      applicationMode: 'responsive-width',
      responsiveWidth: { min: 600, max: 904 },
      referenceDimensions: { width: 768, height: 1024 },
    });

    expect(getPresetSourceDimensions(fixed)).toBeUndefined();
    expect(getPresetSourceDimensions(scalableSaved)).toEqual({ width: 1200, height: 800 });
    expect(getPresetSourceDimensions(canonical)).toEqual({ width: 580, height: 580 });
    expect(getPresetSourceDimensions(responsive)).toEqual({ width: 768, height: 1024 });
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
      requestId: 'grid-frame-1',
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
      requestId: 'grid-frame-2',
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
      requestId: 'grid-frame-3',
      config,
      width: 800,
      height: 600,
    });

    expect(result.frameName).toContain('6col');
  });

  it('respects positionNearSelection setting', () => {
    const config: GridConfig = {};

    const result = buildCreateGridFrameMessage({
      requestId: 'grid-frame-4',
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
      requestId: 'grid-apply-1',
      config,
      expectedTargetIds: ['1:2', '3:4'],
    });

    expect(result.type).toBe('apply-grid');
    expect(result.requestId).toBe('grid-apply-1');
    expect(result.sourceConfig).toBe(config);
    expect(result.expectedTargetIds).toEqual(['1:2', '3:4']);
    expect(result.replaceExisting).toBe(true); // Default
    expect(result.applicationMode).toBe('fixed');
    expect(result.linkedResourcePolicy).toBe('replace-with-values');
  });

  it('respects replaceExisting setting', () => {
    const config: GridConfig = {};

    const result = buildApplyGridMessage({
      requestId: 'grid-apply-2',
      config,
      expectedTargetIds: ['1:2'],
      replaceExisting: false,
    });

    expect(result.replaceExisting).toBe(false);
  });

  it('preserves all source grid types without duplicating a converted config', () => {
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
      requestId: 'grid-apply-3',
      config,
      expectedTargetIds: ['1:2'],
    });

    expect(result.sourceConfig).toBe(config);
    expect(result).not.toHaveProperty('config');
  });

  it('preserves a canonical-only application contract', () => {
    const result = buildApplyGridMessage({
      requestId: 'grid-apply-canonical',
      config: {},
      expectedTargetIds: ['1:2'],
      sourceDimensions: { width: 580, height: 580 },
      applicationMode: 'canonical-only',
    });

    expect(result.applicationMode).toBe('canonical-only');
    expect(result.sourceDimensions).toEqual({ width: 580, height: 580 });
  });

  it('preserves a responsive-width application contract', () => {
    const responsiveWidth = { min: 600, max: 904 };
    const result = buildApplyGridMessage({
      requestId: 'grid-apply-responsive',
      config: {},
      expectedTargetIds: ['1:2'],
      applicationMode: 'responsive-width',
      responsiveWidth,
    });

    expect(result.applicationMode).toBe('responsive-width');
    expect(result.responsiveWidth).toEqual(responsiveWidth);
    expect(result.sourceDimensions).toBeUndefined();
  });

  it('preserves captured native resource policy and variable aliases', () => {
    const boundVariables = {
      gutterSize: { type: 'VARIABLE_ALIAS' as const, id: 'VariableID:gutter' },
    };
    const config: GridConfig = {
      columns: {
        count: 4,
        gutterSize: 20,
        gutterUnit: 'px',
        margin: 32,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: defaultColor,
        boundVariables,
      },
    };
    const nativeResources = {
      gridStyleId: 'GridStyle:editorial',
      boundVariableIds: ['VariableID:gutter'],
      sourceFileKey: 'file-key',
    };

    const message = buildApplyGridMessage({
      requestId: 'grid-linked',
      config,
      expectedTargetIds: ['1:2'],
      nativeResources,
      linkedResourcePolicy: 'preserve-if-available',
    });

    expect(message.sourceConfig.columns?.boundVariables).toEqual(boundVariables);
    expect(message.nativeResources).toBe(nativeResources);
    expect(message.linkedResourcePolicy).toBe('preserve-if-available');
  });
});
