import * as React from 'react'
import type { 
  GridConfig, 
  ColumnGridConfig, 
  RowGridConfig, 
  BaselineGridConfig,
  GridColor 
} from '../types/grid'
import { gridColorToCSS } from '../lib/gridUtils'

interface GridPreviewProps {
  /** Grid configuration to render */
  config: GridConfig
  /** Preview width in pixels */
  width: number
  /** Preview height in pixels */
  height: number
  /** Optional background image (base64 or URL) */
  backgroundImage?: string
  /** Dark mode */
  isDark: boolean
  /** Show grid labels */
  showLabels?: boolean
  /** Interactive - allow clicking on grid elements */
  interactive?: boolean
  /** Callback when a column is clicked */
  onColumnClick?: (index: number) => void
  /** Callback when a row is clicked */
  onRowClick?: (index: number) => void
}

// ============================================
// Grid Preview Component
// ============================================

export const GridPreview: React.FC<GridPreviewProps> = ({
  config,
  width,
  height,
  backgroundImage,
  isDark,
  showLabels = false,
  interactive = false,
  onColumnClick,
  onRowClick,
}) => {
  const bgColor = isDark ? '#1e1e1e' : '#f8f8f8'
  const labelColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'
  
  // ============================================
  // Column Grid Rendering
  // ============================================
  
  const renderColumnGrid = (columns: ColumnGridConfig) => {
    const marginPercent = columns.marginUnit === 'percent' ? columns.margin : (columns.margin / width) * 100
    const gutterPercent = columns.gutterUnit === 'percent' ? columns.gutterSize : (columns.gutterSize / width) * 100
    
    const marginPx = (marginPercent / 100) * width
    const gutterPx = (gutterPercent / 100) * width
    const availableWidth = width - (marginPx * 2)
    const totalGutterWidth = gutterPx * (columns.count - 1)
    const columnWidth = (availableWidth - totalGutterWidth) / columns.count
    
    const elements: React.ReactNode[] = []
    let x = marginPx
    
    // Column fill color with opacity
    const fillColor = gridColorToCSS({ ...columns.color, a: columns.color.a * 0.5 })
    const strokeColor = gridColorToCSS({ ...columns.color, a: columns.color.a * 2 })
    
    for (let i = 0; i < columns.count; i++) {
      const currentX = x
      
      // Column rectangle
      elements.push(
        <rect
          key={`col-fill-${i}`}
          x={currentX}
          y={0}
          width={columnWidth}
          height={height}
          fill={fillColor}
          style={{ cursor: interactive ? 'pointer' : 'default' }}
          onClick={() => interactive && onColumnClick?.(i)}
        />
      )
      
      // Column edges (lines)
      elements.push(
        <line
          key={`col-left-${i}`}
          x1={currentX}
          y1={0}
          x2={currentX}
          y2={height}
          stroke={strokeColor}
          strokeWidth={1}
        />
      )
      elements.push(
        <line
          key={`col-right-${i}`}
          x1={currentX + columnWidth}
          y1={0}
          x2={currentX + columnWidth}
          y2={height}
          stroke={strokeColor}
          strokeWidth={1}
        />
      )
      
      // Column label
      if (showLabels) {
        elements.push(
          <text
            key={`col-label-${i}`}
            x={currentX + columnWidth / 2}
            y={12}
            textAnchor="middle"
            fill={labelColor}
            fontSize={9}
            fontFamily="system-ui, sans-serif"
          >
            {i + 1}
          </text>
        )
      }
      
      x += columnWidth + gutterPx
    }
    
    // Margin indicators
    if (showLabels && marginPx > 20) {
      // Left margin
      elements.push(
        <g key="margin-left">
          <line
            x1={0}
            y1={height / 2}
            x2={marginPx}
            y2={height / 2}
            stroke={labelColor}
            strokeWidth={1}
            strokeDasharray="2,2"
          />
          <text
            x={marginPx / 2}
            y={height / 2 - 4}
            textAnchor="middle"
            fill={labelColor}
            fontSize={8}
          >
            {Math.round(marginPx)}px
          </text>
        </g>
      )
      
      // Right margin
      elements.push(
        <g key="margin-right">
          <line
            x1={width - marginPx}
            y1={height / 2}
            x2={width}
            y2={height / 2}
            stroke={labelColor}
            strokeWidth={1}
            strokeDasharray="2,2"
          />
          <text
            x={width - marginPx / 2}
            y={height / 2 - 4}
            textAnchor="middle"
            fill={labelColor}
            fontSize={8}
          >
            {Math.round(marginPx)}px
          </text>
        </g>
      )
    }
    
    return elements
  }
  
  // ============================================
  // Row Grid Rendering
  // ============================================
  
  const renderRowGrid = (rows: RowGridConfig) => {
    const marginPercent = rows.marginUnit === 'percent' ? rows.margin : (rows.margin / height) * 100
    const gutterPercent = rows.gutterUnit === 'percent' ? rows.gutterSize : (rows.gutterSize / height) * 100
    
    const marginPx = (marginPercent / 100) * height
    const gutterPx = (gutterPercent / 100) * height
    const availableHeight = height - (marginPx * 2)
    const totalGutterHeight = gutterPx * (rows.count - 1)
    const rowHeight = (availableHeight - totalGutterHeight) / rows.count
    
    const elements: React.ReactNode[] = []
    let y = marginPx
    
    // Row fill color with opacity
    const fillColor = gridColorToCSS({ ...rows.color, a: rows.color.a * 0.3 })
    const strokeColor = gridColorToCSS({ ...rows.color, a: rows.color.a * 1.5 })
    
    for (let i = 0; i < rows.count; i++) {
      const currentY = y
      
      // Row rectangle (subtle fill)
      elements.push(
        <rect
          key={`row-fill-${i}`}
          x={0}
          y={currentY}
          width={width}
          height={rowHeight}
          fill={fillColor}
          style={{ cursor: interactive ? 'pointer' : 'default' }}
          onClick={() => interactive && onRowClick?.(i)}
        />
      )
      
      // Row edges (lines)
      elements.push(
        <line
          key={`row-top-${i}`}
          x1={0}
          y1={currentY}
          x2={width}
          y2={currentY}
          stroke={strokeColor}
          strokeWidth={1}
        />
      )
      elements.push(
        <line
          key={`row-bottom-${i}`}
          x1={0}
          y1={currentY + rowHeight}
          x2={width}
          y2={currentY + rowHeight}
          stroke={strokeColor}
          strokeWidth={1}
        />
      )
      
      // Row label
      if (showLabels) {
        elements.push(
          <text
            key={`row-label-${i}`}
            x={8}
            y={currentY + rowHeight / 2 + 3}
            fill={labelColor}
            fontSize={9}
            fontFamily="system-ui, sans-serif"
          >
            {i + 1}
          </text>
        )
      }
      
      y += rowHeight + gutterPx
    }
    
    return elements
  }
  
  // ============================================
  // Baseline Grid Rendering
  // ============================================
  
  const renderBaselineGrid = (baseline: BaselineGridConfig) => {
    const elements: React.ReactNode[] = []
    let y = baseline.offset
    let lineIndex = 0
    
    const strokeColor = gridColorToCSS({ ...baseline.color, a: baseline.color.a * 0.8 })
    const accentColor = gridColorToCSS({ ...baseline.color, a: baseline.color.a * 1.5 })
    
    while (y < height) {
      // Every 4th line is slightly stronger (for 4-line groupings)
      const isAccent = lineIndex % 4 === 0
      
      elements.push(
        <line
          key={`baseline-${lineIndex}`}
          x1={0}
          y1={y}
          x2={width}
          y2={y}
          stroke={isAccent ? accentColor : strokeColor}
          strokeWidth={isAccent ? 1 : 0.5}
        />
      )
      
      // Label every 4th line
      if (showLabels && isAccent && y > 10 && y < height - 10) {
        elements.push(
          <text
            key={`baseline-label-${lineIndex}`}
            x={width - 4}
            y={y - 2}
            textAnchor="end"
            fill={labelColor}
            fontSize={7}
            fontFamily="system-ui, sans-serif"
          >
            {Math.round(y)}
          </text>
        )
      }
      
      y += baseline.height
      lineIndex++
    }
    
    return elements
  }
  
  // ============================================
  // Module Intersections (for modular grids)
  // ============================================
  
  const renderModuleIntersections = () => {
    if (!config.columns || !config.rows) return null
    
    const cols = config.columns
    const rows = config.rows
    
    const colMarginPx = (cols.marginUnit === 'percent' ? cols.margin : (cols.margin / width) * 100) / 100 * width
    const colGutterPx = (cols.gutterUnit === 'percent' ? cols.gutterSize : (cols.gutterSize / width) * 100) / 100 * width
    const availableWidth = width - (colMarginPx * 2)
    const colWidth = (availableWidth - colGutterPx * (cols.count - 1)) / cols.count
    
    const rowMarginPx = (rows.marginUnit === 'percent' ? rows.margin : (rows.margin / height) * 100) / 100 * height
    const rowGutterPx = (rows.gutterUnit === 'percent' ? rows.gutterSize : (rows.gutterSize / height) * 100) / 100 * height
    const availableHeight = height - (rowMarginPx * 2)
    const rowHeight = (availableHeight - rowGutterPx * (rows.count - 1)) / rows.count
    
    const dots: React.ReactNode[] = []
    
    // Render dots at intersections
    for (let c = 0; c <= cols.count; c++) {
      for (let r = 0; r <= rows.count; r++) {
        const x = colMarginPx + c * (colWidth + colGutterPx) - (c > 0 ? colGutterPx : 0)
        const y = rowMarginPx + r * (rowHeight + rowGutterPx) - (r > 0 ? rowGutterPx : 0)
        
        dots.push(
          <circle
            key={`intersection-${c}-${r}`}
            cx={x}
            cy={y}
            r={2}
            fill={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)'}
          />
        )
      }
    }
    
    return dots
  }
  
  return (
    <div style={{
      position: 'relative',
      width,
      height,
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      <svg 
        width={width} 
        height={height} 
        viewBox={`0 0 ${width} ${height}`}
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        {/* Background */}
        {backgroundImage ? (
          <image
            href={backgroundImage}
            x={0}
            y={0}
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <rect x={0} y={0} width={width} height={height} fill={bgColor} />
        )}
        
        {/* Grid pattern overlay */}
        <defs>
          <pattern id="smallGrid" width="8" height="8" patternUnits="userSpaceOnUse">
            <path 
              d="M 8 0 L 0 0 0 8" 
              fill="none" 
              stroke={isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'} 
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        {!backgroundImage && (
          <rect x={0} y={0} width={width} height={height} fill="url(#smallGrid)" />
        )}
        
        {/* Rows (render first so columns overlay) */}
        {config.rows && renderRowGrid(config.rows)}
        
        {/* Columns */}
        {config.columns && renderColumnGrid(config.columns)}
        
        {/* Module intersections */}
        {config.columns && config.rows && renderModuleIntersections()}
        
        {/* Baseline */}
        {config.baseline && renderBaselineGrid(config.baseline)}
        
        {/* Frame border */}
        <rect 
          x={0.5} 
          y={0.5} 
          width={width - 1} 
          height={height - 1} 
          fill="none" 
          stroke={isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'} 
          strokeWidth={1}
        />
      </svg>
      
      {/* Dimensions label */}
      {showLabels && (
        <div style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          padding: '2px 6px',
          backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)',
          borderRadius: 4,
          fontSize: 9,
          fontFamily: 'monospace',
          color: isDark ? '#a3a3a3' : '#666666',
        }}>
          {width} × {height}
        </div>
      )}
    </div>
  )
}

// ============================================
// Mini Preview Component (for thumbnails)
// ============================================

interface GridMiniPreviewProps {
  config: GridConfig
  size?: number
  isDark: boolean
}

export const GridMiniPreview: React.FC<GridMiniPreviewProps> = ({
  config,
  size = 48,
  isDark,
}) => {
  const bgColor = isDark ? '#2a2a2a' : '#f5f5f5'
  
  const renderMiniColumns = (cols: ColumnGridConfig) => {
    const margin = cols.marginUnit === 'percent' ? cols.margin / 100 * size : (cols.margin / 800) * size
    const gutter = cols.gutterUnit === 'percent' ? cols.gutterSize / 100 * size : (cols.gutterSize / 800) * size
    const available = size - margin * 2
    const colWidth = (available - gutter * (cols.count - 1)) / cols.count
    
    const rects: React.ReactNode[] = []
    let x = margin
    
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
      )
      x += colWidth + gutter
    }
    
    return rects
  }
  
  const renderMiniRows = (rows: RowGridConfig) => {
    const margin = rows.marginUnit === 'percent' ? rows.margin / 100 * size : (rows.margin / 600) * size
    const gutter = rows.gutterUnit === 'percent' ? rows.gutterSize / 100 * size : (rows.gutterSize / 600) * size
    const available = size - margin * 2
    const rowHeight = (available - gutter * (rows.count - 1)) / rows.count
    
    const rects: React.ReactNode[] = []
    let y = margin
    
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
      )
      y += rowHeight + gutter
    }
    
    return rects
  }
  
  const renderMiniBaseline = (baseline: BaselineGridConfig) => {
    const lines: React.ReactNode[] = []
    let y = baseline.offset
    const scaledHeight = (baseline.height / 800) * size * 10 // Scale up for visibility
    
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
      )
      y += scaledHeight
    }
    
    return lines
  }
  
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect x={0} y={0} width={size} height={size} fill={bgColor} rx={2} />
      {config.rows && renderMiniRows(config.rows)}
      {config.columns && renderMiniColumns(config.columns)}
      {config.baseline && renderMiniBaseline(config.baseline)}
    </svg>
  )
}

export default GridPreview

