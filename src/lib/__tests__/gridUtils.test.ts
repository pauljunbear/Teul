import { describe, expect, it } from 'vitest';
import type { ColumnGridConfig, GridConfig } from '../../types/grid';
import {
  DEFAULT_BASELINE_COLOR,
  DEFAULT_COLUMN_COLOR,
  DEFAULT_ROW_COLOR,
  gridColorToCSS,
  resolveGridConfigForTarget,
  scaleGrid,
  toPixels,
} from '../gridUtils';

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

describe('toPixels', () => {
  it('preserves pixel values and resolves percentages', () => {
    expect(toPixels(100, 'px', 1000)).toBe(100);
    expect(toPixels(12.5, 'percent', 800)).toBe(100);
  });
});

describe('scaleGrid', () => {
  it('scales pixel columns and rows on their respective axes', () => {
    const config: GridConfig = {
      columns: createColumnConfig({ gutterSize: 20, margin: 40 }),
      rows: {
        count: 6,
        gutterSize: 10,
        gutterUnit: 'px',
        margin: 20,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: DEFAULT_ROW_COLOR,
      },
    };

    const scaled = scaleGrid(config, 1000, 500, 2000, 1000);

    expect(scaled.columns).toMatchObject({ gutterSize: 40, margin: 80 });
    expect(scaled.rows).toMatchObject({ gutterSize: 20, margin: 40 });
  });

  it('keeps percentages and uniform-grid rhythm fixed', () => {
    const config: GridConfig = {
      columns: createColumnConfig({
        gutterSize: 2,
        gutterUnit: 'percent',
        margin: 5,
        marginUnit: 'percent',
      }),
      baseline: {
        height: 8,
        offset: 0,
        visible: true,
        color: DEFAULT_BASELINE_COLOR,
      },
    };

    const scaled = scaleGrid(config, 1000, 500, 2000, 1000);

    expect(scaled.columns).toMatchObject({ gutterSize: 2, margin: 5 });
    expect(scaled.baseline).toMatchObject({ height: 8, offset: 0 });
  });
});

describe('resolveGridConfigForTarget', () => {
  it('resolves source-scaled pixel geometry for one target', () => {
    const config: GridConfig = {
      columns: createColumnConfig({ gutterSize: 24, margin: 20 }),
    };

    const resolved = resolveGridConfigForTarget(
      config,
      { width: 1440, height: 900 },
      { width: 320, height: 568 },
      'scale-from-reference'
    );

    expect(resolved.columns?.gutterSize).toBeCloseTo(24 * (320 / 1440));
    expect(resolved.columns?.margin).toBeCloseTo(20 * (320 / 1440));
  });

  it('returns fixed geometry without requiring reference dimensions', () => {
    const config: GridConfig = { columns: createColumnConfig() };

    expect(
      resolveGridConfigForTarget(config, undefined, { width: 320, height: 568 }, 'fixed')
    ).toBe(config);
  });

  it('rejects invalid reference and target dimensions for resolved modes', () => {
    const config: GridConfig = { columns: createColumnConfig() };

    expect(() =>
      resolveGridConfigForTarget(
        config,
        { width: 0, height: 900 },
        { width: 320, height: 568 },
        'scale-from-reference'
      )
    ).toThrow('Source grid dimensions');
    expect(() =>
      resolveGridConfigForTarget(
        config,
        { width: 1440, height: 900 },
        { width: 0, height: 568 },
        'scale-from-reference'
      )
    ).toThrow('Target grid dimensions');
  });

  it('preserves canonical geometry only at its reference dimensions', () => {
    const config: GridConfig = {
      columns: createColumnConfig({ gutterSize: 20, margin: 0 }),
    };
    const reference = { width: 580, height: 580 };

    expect(resolveGridConfigForTarget(config, reference, reference, 'canonical-only')).toBe(config);
    expect(() =>
      resolveGridConfigForTarget(config, reference, { width: 1160, height: 1160 }, 'canonical-only')
    ).toThrow('requires a 580\u00d7580px frame');
  });

  it('accepts responsive frames throughout the width range regardless of height', () => {
    const config: GridConfig = { columns: createColumnConfig({ gutterSize: 24, margin: 32 }) };

    expect(
      resolveGridConfigForTarget(
        config,
        undefined,
        { width: 768, height: 4000 },
        'responsive-width',
        { min: 600, max: 904 }
      )
    ).toBe(config);
    expect(() =>
      resolveGridConfigForTarget(
        config,
        undefined,
        { width: 905, height: 4000 },
        'responsive-width',
        { min: 600, max: 904 }
      )
    ).toThrow('600-904px');
  });

  it('recenters a capped content body as responsive frames widen', () => {
    const config: GridConfig = { columns: createColumnConfig({ gutterSize: 24, margin: 72 }) };
    const resolved = resolveGridConfigForTarget(
      config,
      undefined,
      { width: 1600, height: 700 },
      'responsive-width',
      { min: 1400, maxContentWidth: 1320, contentInset: 12 }
    );

    expect(resolved.columns?.margin).toBe(152);
    expect(resolved.columns?.gutterSize).toBe(24);
    expect(config.columns?.margin).toBe(72);
  });
});

describe('gridColorToCSS', () => {
  it('converts normalized Figma channels to CSS rgba', () => {
    expect(gridColorToCSS({ r: 0.5, g: 0.25, b: 1, a: 0.4 })).toBe('rgba(128, 64, 255, 0.4)');
  });
});

describe('default grid colors', () => {
  it('provides distinct column, row, and uniform-grid colors', () => {
    expect(DEFAULT_COLUMN_COLOR).not.toEqual(DEFAULT_ROW_COLOR);
    expect(DEFAULT_BASELINE_COLOR).not.toEqual(DEFAULT_COLUMN_COLOR);
  });
});
