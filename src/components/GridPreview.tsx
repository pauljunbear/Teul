import * as React from 'react';
import type {
  BaselineGridConfig,
  ColumnGridConfig,
  GridConfig,
  RowGridConfig,
} from '../types/grid';
import { gridColorToCSS } from '../lib/gridUtils';

interface GridMiniPreviewProps {
  config: GridConfig;
  size?: number;
  isDark: boolean;
}

export const GridMiniPreview: React.FC<GridMiniPreviewProps> = ({ config, size = 48, isDark }) => {
  const bgColor = isDark ? '#2a2a2a' : '#f5f5f5';

  const renderMiniColumns = (cols: ColumnGridConfig) => {
    const margin =
      cols.marginUnit === 'percent' ? (cols.margin / 100) * size : (cols.margin / 800) * size;
    const gutter =
      cols.gutterUnit === 'percent'
        ? (cols.gutterSize / 100) * size
        : (cols.gutterSize / 800) * size;
    const available = size - margin * 2;
    const colWidth = (available - gutter * (cols.count - 1)) / cols.count;

    const rects: React.ReactNode[] = [];
    let x = margin;

    for (let i = 0; i < cols.count; i++) {
      rects.push(
        <rect
          key={`mini-col-${i}`}
          x={x}
          y={0}
          width={Math.max(1, colWidth)}
          height={size}
          fill={gridColorToCSS({ ...cols.color, a: 0.4 })}
        />
      );
      x += colWidth + gutter;
    }

    return rects;
  };

  const renderMiniRows = (rows: RowGridConfig) => {
    const margin =
      rows.marginUnit === 'percent' ? (rows.margin / 100) * size : (rows.margin / 600) * size;
    const gutter =
      rows.gutterUnit === 'percent'
        ? (rows.gutterSize / 100) * size
        : (rows.gutterSize / 600) * size;
    const available = size - margin * 2;
    const rowHeight = (available - gutter * (rows.count - 1)) / rows.count;

    const rects: React.ReactNode[] = [];
    let y = margin;

    for (let i = 0; i < rows.count; i++) {
      rects.push(
        <rect
          key={`mini-row-${i}`}
          x={0}
          y={y}
          width={size}
          height={Math.max(1, rowHeight)}
          fill={gridColorToCSS({ ...rows.color, a: 0.2 })}
        />
      );
      y += rowHeight + gutter;
    }

    return rects;
  };

  const renderMiniBaseline = (baseline: BaselineGridConfig) => {
    const lines: React.ReactNode[] = [];
    let y = 0;
    const scaledHeight = (baseline.height / 800) * size * 10;

    while (y < size) {
      lines.push(
        <line
          key={`mini-baseline-${y}`}
          x1={0}
          y1={y}
          x2={size}
          y2={y}
          stroke={gridColorToCSS({ ...baseline.color, a: 0.5 })}
          strokeWidth={0.5}
        />
      );
      y += scaledHeight;
    }

    return lines;
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect x={0} y={0} width={size} height={size} fill={bgColor} rx={2} />
      {config.rows && renderMiniRows(config.rows)}
      {config.columns && renderMiniColumns(config.columns)}
      {config.baseline && renderMiniBaseline(config.baseline)}
    </svg>
  );
};
