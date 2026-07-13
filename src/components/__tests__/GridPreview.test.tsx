import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GridConfig } from '../../types/grid';
import { GridPreview } from '../GridPreview';

const color = { r: 0.2, g: 0.8, b: 0.9, a: 0.15 };

describe('GridPreview', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('renders a native Figma uniform GRID on both axes', () => {
    const config: GridConfig = {
      baseline: { height: 8, offset: 0, visible: true, color },
    };
    act(() => root.render(<GridPreview config={config} width={80} height={80} isDark={false} />));

    expect(container.querySelectorAll('[data-grid-pattern="uniform-pattern"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-grid-pattern="uniform-grid"]')).toHaveLength(1);
    expect(container.querySelectorAll('pattern')).toHaveLength(1);
    expect(container.querySelectorAll('line')).toHaveLength(0);
  });

  it('renders a constant-size SVG tree for very dense uniform grids', () => {
    const config: GridConfig = {
      baseline: { height: 1, offset: 0, visible: true, color },
    };
    act(() =>
      root.render(
        <GridPreview
          config={config}
          width={80}
          height={80}
          isDark={false}
          referenceDimensions={{ width: 100_000, height: 100_000 }}
        />
      )
    );

    expect(container.querySelectorAll('[data-grid-pattern="uniform-pattern"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-grid-pattern="uniform-grid"]')).toHaveLength(1);
  });

  it('fits the canonical frame without distorting its aspect ratio', () => {
    const config: GridConfig = {
      columns: {
        count: 4,
        gutterSize: 16,
        gutterUnit: 'px',
        margin: 16,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color,
      },
    };
    act(() =>
      root.render(
        <GridPreview
          config={config}
          width={100}
          height={100}
          isDark={false}
          referenceDimensions={{ width: 1600, height: 900 }}
          applicationMode="fixed"
        />
      )
    );

    const frame = container.querySelector('g > rect');
    expect(frame?.getAttribute('width')).toBe('1600');
    expect(frame?.getAttribute('height')).toBe('900');
    expect(frame?.parentElement?.getAttribute('transform')).toContain('translate(0 21.875)');
  });

  it('uses the quantized canonical payload for source-faithful previews', () => {
    const config: GridConfig = {
      columns: {
        count: 2,
        gutterSize: 20,
        gutterUnit: 'px',
        margin: 0,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color,
      },
    };
    act(() =>
      root.render(
        <GridPreview
          config={config}
          width={100}
          height={100}
          isDark
          referenceDimensions={{ width: 580, height: 580 }}
          applicationMode="canonical-only"
        />
      )
    );

    const columns = container.querySelectorAll('[data-grid-pattern="column"]');
    expect(columns).toHaveLength(2);
    expect(columns[0]?.getAttribute('width')).toBe('280');
    expect(columns[1]?.getAttribute('x')).toBe('300');
  });
});
