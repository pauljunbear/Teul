import * as React from 'react';
import type {
  FigmaRowsColsLayoutGrid,
  GridApplicationMode,
  GridConfig,
  GridDimensions,
  GridResponsiveWidth,
} from '../types/grid';
import { gridConfigToFigmaLayoutGrids, parseAspectRatio } from '../lib/figmaGrids';
import { gridColorToCSS, resolveGridConfigForTarget } from '../lib/gridUtils';

interface GridPreviewProps {
  config: GridConfig;
  width: number;
  height: number;
  isDark: boolean;
  referenceDimensions?: GridDimensions;
  applicationMode?: GridApplicationMode;
  responsiveWidth?: GridResponsiveWidth;
  aspectRatio?: string;
}

interface GridMiniPreviewProps {
  config: GridConfig;
  size?: number;
  isDark: boolean;
  referenceDimensions?: GridDimensions;
  applicationMode?: GridApplicationMode;
  responsiveWidth?: GridResponsiveWidth;
  aspectRatio?: string;
}

function getPreviewFrameDimensions(
  referenceDimensions: GridDimensions | undefined,
  aspectRatio: string | undefined
): GridDimensions {
  if (
    referenceDimensions &&
    Number.isFinite(referenceDimensions.width) &&
    Number.isFinite(referenceDimensions.height) &&
    referenceDimensions.width > 0 &&
    referenceDimensions.height > 0
  ) {
    return referenceDimensions;
  }

  return aspectRatio ? parseAspectRatio(aspectRatio) : { width: 800, height: 800 };
}

function getAxisGeometry(grid: FigmaRowsColsLayoutGrid, frameSize: number) {
  const totalGutterSize = grid.gutterSize * Math.max(0, grid.count - 1);
  const sectionSize =
    grid.alignment === 'STRETCH'
      ? (frameSize - grid.offset * 2 - totalGutterSize) / grid.count
      : (grid.sectionSize ?? 0);
  const totalSize = sectionSize * grid.count + totalGutterSize;
  const start =
    grid.alignment === 'CENTER'
      ? (frameSize - totalSize) / 2
      : grid.alignment === 'MAX'
        ? frameSize - grid.offset - totalSize
        : grid.offset;

  return { sectionSize, start };
}

/** Render the same quantized grids that Teul sends to Figma. */
export const GridPreview: React.FC<GridPreviewProps> = ({
  config,
  width,
  height,
  isDark,
  referenceDimensions,
  applicationMode = 'fixed',
  responsiveWidth,
  aspectRatio,
}) => {
  const previewId = React.useId().replace(/:/g, '');
  const frame = getPreviewFrameDimensions(referenceDimensions, aspectRatio);
  const resolvedConfig = resolveGridConfigForTarget(
    config,
    applicationMode === 'fixed' ? undefined : frame,
    frame,
    applicationMode,
    responsiveWidth
  );
  const grids = gridConfigToFigmaLayoutGrids(resolvedConfig, frame.width, frame.height);
  const scale = Math.min(width / frame.width, height / frame.height);
  const renderedWidth = frame.width * scale;
  const renderedHeight = frame.height * scale;
  const xOffset = (width - renderedWidth) / 2;
  const yOffset = (height - renderedHeight) / 2;
  const outerBackground = isDark ? '#1e1e1e' : '#e8e8e8';
  const frameBackground = isDark ? '#2a2a2a' : '#f5f5f5';

  return (
    <svg
      data-testid="grid-preview"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ borderRadius: '4px', overflow: 'hidden', display: 'block' }}
    >
      <rect width={width} height={height} fill={outerBackground} />
      <g transform={`translate(${xOffset} ${yOffset}) scale(${scale})`}>
        <rect width={frame.width} height={frame.height} fill={frameBackground} />
        {grids.map((grid, gridIndex) => {
          if (grid.pattern === 'GRID') {
            const patternId = `${previewId}-uniform-${gridIndex}`;
            const lineColor = gridColorToCSS({ ...grid.color, a: 0.5 });
            return (
              <g key={`uniform-${gridIndex}`}>
                <defs>
                  <pattern
                    id={patternId}
                    width={grid.sectionSize}
                    height={grid.sectionSize}
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      data-grid-pattern="uniform-pattern"
                      d={`M ${grid.sectionSize} 0 L 0 0 0 ${grid.sectionSize}`}
                      fill="none"
                      stroke={lineColor}
                      strokeWidth={0.5 / scale}
                    />
                  </pattern>
                </defs>
                <rect
                  data-grid-pattern="uniform-grid"
                  width={frame.width}
                  height={frame.height}
                  fill={`url(#${patternId})`}
                />
              </g>
            );
          }

          const frameSize = grid.pattern === 'COLUMNS' ? frame.width : frame.height;
          const { sectionSize, start } = getAxisGeometry(grid, frameSize);
          if (!Number.isFinite(sectionSize) || sectionSize <= 0) return null;

          return (
            <g key={`${grid.pattern}-${gridIndex}`}>
              {Array.from({ length: grid.count }, (_, index) => {
                const position = start + index * (sectionSize + grid.gutterSize);
                return grid.pattern === 'COLUMNS' ? (
                  <rect
                    key={`column-${index}`}
                    data-grid-pattern="column"
                    x={position}
                    y={0}
                    width={sectionSize}
                    height={frame.height}
                    fill={gridColorToCSS({ ...grid.color, a: 0.35 })}
                  />
                ) : (
                  <rect
                    key={`row-${index}`}
                    data-grid-pattern="row"
                    x={0}
                    y={position}
                    width={frame.width}
                    height={sectionSize}
                    fill={gridColorToCSS({ ...grid.color, a: 0.2 })}
                  />
                );
              })}
            </g>
          );
        })}
      </g>
    </svg>
  );
};

export const GridMiniPreview: React.FC<GridMiniPreviewProps> = ({
  config,
  size = 48,
  isDark,
  referenceDimensions,
  applicationMode,
  responsiveWidth,
  aspectRatio,
}) => (
  <GridPreview
    config={config}
    width={size}
    height={size}
    isDark={isDark}
    referenceDimensions={referenceDimensions}
    applicationMode={applicationMode}
    responsiveWidth={responsiveWidth}
    aspectRatio={aspectRatio}
  />
);
