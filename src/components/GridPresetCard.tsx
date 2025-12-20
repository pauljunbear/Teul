import * as React from 'react'
import type { GridPreset, GridConfig, ColumnGridConfig, RowGridConfig, BaselineGridConfig } from '../types/grid'
import { gridColorToCSS } from '../lib/gridUtils'

interface GridPresetCardProps {
  preset: GridPreset
  isSelected: boolean
  onClick: () => void
  onApply: () => void
  isDark: boolean
}

// ============================================
// SVG Grid Preview Component
// ============================================

interface GridPreviewSVGProps {
  config: GridConfig
  width: number
  height: number
  isDark: boolean
}

const GridPreviewSVG: React.FC<GridPreviewSVGProps> = ({ config, width, height, isDark }) => {
  const bgColor = isDark ? '#2a2a2a' : '#f5f5f5'
  
  // Calculate column positions
  const renderColumns = (columns: ColumnGridConfig) => {
    const marginPercent = columns.marginUnit === 'percent' ? columns.margin : (columns.margin / width) * 100
    const gutterPercent = columns.gutterUnit === 'percent' ? columns.gutterSize : (columns.gutterSize / width) * 100
    
    const marginPx = (marginPercent / 100) * width
    const gutterPx = (gutterPercent / 100) * width
    const availableWidth = width - (marginPx * 2)
    const totalGutterWidth = gutterPx * (columns.count - 1)
    const columnWidth = (availableWidth - totalGutterWidth) / columns.count
    
    const rects: React.ReactNode[] = []
    let x = marginPx
    
    for (let i = 0; i < columns.count; i++) {
      rects.push(
        <rect
          key={`col-${i}`}
          x={x}
          y={0}
          width={columnWidth}
          height={height}
          fill={gridColorToCSS({ ...columns.color, a: 0.3 })}
        />
      )
      x += columnWidth + gutterPx
    }
    
    return rects
  }
  
  // Calculate row positions
  const renderRows = (rows: RowGridConfig) => {
    const marginPercent = rows.marginUnit === 'percent' ? rows.margin : (rows.margin / height) * 100
    const gutterPercent = rows.gutterUnit === 'percent' ? rows.gutterSize : (rows.gutterSize / height) * 100
    
    const marginPx = (marginPercent / 100) * height
    const gutterPx = (gutterPercent / 100) * height
    const availableHeight = height - (marginPx * 2)
    const totalGutterHeight = gutterPx * (rows.count - 1)
    const rowHeight = (availableHeight - totalGutterHeight) / rows.count
    
    const rects: React.ReactNode[] = []
    let y = marginPx
    
    for (let i = 0; i < rows.count; i++) {
      rects.push(
        <rect
          key={`row-${i}`}
          x={0}
          y={y}
          width={width}
          height={rowHeight}
          fill={gridColorToCSS({ ...rows.color, a: 0.15 })}
        />
      )
      y += rowHeight + gutterPx
    }
    
    return rects
  }
  
  // Render baseline grid lines
  const renderBaseline = (baseline: BaselineGridConfig) => {
    const lines: React.ReactNode[] = []
    let y = baseline.offset
    let i = 0
    
    while (y < height) {
      lines.push(
        <line
          key={`baseline-${i}`}
          x1={0}
          y1={y}
          x2={width}
          y2={y}
          stroke={gridColorToCSS({ ...baseline.color, a: 0.4 })}
          strokeWidth={0.5}
        />
      )
      y += baseline.height
      i++
    }
    
    return lines
  }
  
  return (
    <svg 
      width={width} 
      height={height} 
      viewBox={`0 0 ${width} ${height}`}
      style={{ borderRadius: '4px', overflow: 'hidden' }}
    >
      {/* Background */}
      <rect x={0} y={0} width={width} height={height} fill={bgColor} />
      
      {/* Rows (render first so columns overlay) */}
      {config.rows && renderRows(config.rows)}
      
      {/* Columns */}
      {config.columns && renderColumns(config.columns)}
      
      {/* Baseline */}
      {config.baseline && renderBaseline(config.baseline)}
    </svg>
  )
}

// ============================================
// Grid Preset Card Component
// ============================================

const styles = {
  light: {
    cardBg: '#ffffff',
    cardBgHover: '#fafafa',
    cardBgSelected: '#f0f7ff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    borderSelected: '#3b82f6',
    tagBg: '#f0f0f0',
    tagText: '#666666',
    btnBg: '#1a1a1a',
    btnText: '#ffffff',
    btnBgHover: '#333333',
  },
  dark: {
    cardBg: '#2a2a2a',
    cardBgHover: '#333333',
    cardBgSelected: '#1e3a5f',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    borderSelected: '#3b82f6',
    tagBg: '#3a3a3a',
    tagText: '#a3a3a3',
    btnBg: '#ffffff',
    btnText: '#1a1a1a',
    btnBgHover: '#e5e5e5',
  }
}

export const GridPresetCard: React.FC<GridPresetCardProps> = ({
  preset,
  isSelected,
  onClick,
  onApply,
  isDark,
}) => {
  const theme = isDark ? styles.dark : styles.light
  const [isHovered, setIsHovered] = React.useState(false)
  
  // Get grid summary
  const getGridSummary = () => {
    const parts: string[] = []
    
    if (preset.config.columns) {
      parts.push(`${preset.config.columns.count} col`)
    }
    if (preset.config.rows) {
      parts.push(`${preset.config.rows.count} row`)
    }
    if (preset.config.baseline) {
      parts.push(`${preset.config.baseline.height}px baseline`)
    }
    
    return parts.join(' • ')
  }
  
  // Get grid type icon
  const getGridIcon = () => {
    if (preset.config.rows && preset.config.columns) {
      return '🔲' // Modular
    }
    if (preset.config.baseline && !preset.config.columns) {
      return '📏' // Baseline only
    }
    if (preset.config.columns && preset.config.baseline) {
      return '🎯' // Combined
    }
    return '▤' // Column only
  }
  
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        backgroundColor: isSelected ? theme.cardBgSelected : (isHovered ? theme.cardBgHover : theme.cardBg),
        border: `2px solid ${isSelected ? theme.borderSelected : theme.border}`,
        borderRadius: '12px',
        padding: '12px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: isHovered ? '0 4px 12px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      {/* Preview Thumbnail */}
      <div style={{
        marginBottom: '10px',
        borderRadius: '6px',
        overflow: 'hidden',
        border: `1px solid ${theme.border}`,
      }}>
        <GridPreviewSVG 
          config={preset.config} 
          width={120} 
          height={80} 
          isDark={isDark}
        />
      </div>
      
      {/* Title Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '4px',
      }}>
        <span style={{ fontSize: '14px' }}>{getGridIcon()}</span>
        <h4 style={{
          margin: 0,
          fontSize: '12px',
          fontWeight: 600,
          color: theme.text,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {preset.name}
        </h4>
      </div>
      
      {/* Grid Summary */}
      <p style={{
        margin: '0 0 8px 0',
        fontSize: '10px',
        color: theme.textMuted,
        fontFamily: 'monospace',
      }}>
        {getGridSummary()}
      </p>
      
      {/* Tags (show first 2) */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        marginBottom: '10px',
      }}>
        {preset.tags.slice(0, 2).map(tag => (
          <span
            key={tag}
            style={{
              fontSize: '9px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: theme.tagBg,
              color: theme.tagText,
            }}
          >
            {tag}
          </span>
        ))}
        {preset.aspectRatio && (
          <span
            style={{
              fontSize: '9px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: isDark ? '#2d4a3e' : '#e6f4ea',
              color: isDark ? '#7dd3a0' : '#137333',
            }}
          >
            {preset.aspectRatio}
          </span>
        )}
      </div>
      
      {/* Apply Button (show on hover or selected) */}
      {(isHovered || isSelected) && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onApply()
          }}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: theme.btnBg,
            color: theme.btnText,
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = theme.btnBgHover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = theme.btnBg
          }}
        >
          Apply to Selection
        </button>
      )}
    </div>
  )
}

export default GridPresetCard

