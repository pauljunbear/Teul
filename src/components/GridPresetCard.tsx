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
  
  // Calculate column positions - fill entire width properly
  const renderColumns = (columns: ColumnGridConfig) => {
    // Convert margin to pixels
    const marginPx = columns.marginUnit === 'percent' 
      ? (columns.margin / 100) * width 
      : columns.margin * (width / 200) // Scale for preview
    
    // Convert gutter to pixels
    const gutterPx = columns.gutterUnit === 'percent' 
      ? (columns.gutterSize / 100) * width 
      : columns.gutterSize * (width / 200) // Scale for preview
    
    // Available width after both margins
    const availableWidth = width - (marginPx * 2)
    
    // Total gutter width (n-1 gutters)
    const totalGutterWidth = Math.max(0, gutterPx * (columns.count - 1))
    
    // Each column width
    const columnWidth = Math.max(1, (availableWidth - totalGutterWidth) / columns.count)
    
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
          fill={gridColorToCSS({ ...columns.color, a: 0.35 })}
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
  const cardRef = React.useRef<HTMLDivElement>(null)
  const [cardWidth, setCardWidth] = React.useState(140)
  
  // Measure card width for responsive SVG
  React.useEffect(() => {
    if (cardRef.current) {
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          // Card width minus padding (12px * 2) minus border (2px * 2)
          setCardWidth(entry.contentRect.width)
        }
      })
      observer.observe(cardRef.current)
      return () => observer.disconnect()
    }
  }, [])
  
  // Get grid summary - more compact
  const getGridSummary = () => {
    const parts: string[] = []
    if (preset.config.columns) parts.push(`${preset.config.columns.count} col`)
    if (preset.config.rows) parts.push(`${preset.config.rows.count} row`)
    return parts.join(' × ') || (preset.config.baseline ? `${preset.config.baseline.height}px` : '')
  }
  
  // Calculate preview height based on aspect ratio
  const getPreviewHeight = () => {
    if (!preset.aspectRatio) return Math.round(cardWidth * 0.65)
    
    // Parse aspect ratio
    if (preset.aspectRatio.includes('√2')) return Math.round(cardWidth * 1.414)
    if (preset.aspectRatio.includes('9:16')) return Math.round(cardWidth * (16/9))
    if (preset.aspectRatio.includes('16:9')) return Math.round(cardWidth * (9/16))
    if (preset.aspectRatio.includes('2:3')) return Math.round(cardWidth * 1.5)
    if (preset.aspectRatio.includes('3:4')) return Math.round(cardWidth * (4/3))
    if (preset.aspectRatio.includes('4:3')) return Math.round(cardWidth * 0.75)
    if (preset.aspectRatio.includes('1:1')) return cardWidth
    
    return Math.round(cardWidth * 0.7) // Default
  }
  
  // Limit preview height for tall ratios
  const previewHeight = Math.min(getPreviewHeight(), 120)
  
  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        backgroundColor: isSelected ? theme.cardBgSelected : (isHovered ? theme.cardBgHover : theme.cardBg),
        border: `1.5px solid ${isSelected ? theme.borderSelected : (isHovered ? theme.text + '20' : theme.border)}`,
        borderRadius: '10px',
        padding: '10px',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isHovered ? 'translateY(-2px) scale(1.01)' : 'translateY(0) scale(1)',
        boxShadow: isHovered 
          ? '0 8px 24px rgba(0,0,0,0.15)' 
          : (isSelected ? '0 2px 8px rgba(59,130,246,0.2)' : 'none'),
      }}
    >
      {/* Preview Thumbnail - fills card width */}
      <div style={{
        marginBottom: '8px',
        borderRadius: '6px',
        overflow: 'hidden',
        backgroundColor: isDark ? '#1e1e1e' : '#e8e8e8',
      }}>
        <GridPreviewSVG 
          config={preset.config} 
          width={cardWidth} 
          height={previewHeight} 
          isDark={isDark}
        />
      </div>
      
      {/* Title + Summary Row */}
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '6px',
        marginBottom: '6px',
      }}>
        <h4 style={{
          margin: 0,
          fontSize: '11px',
          fontWeight: 600,
          color: theme.text,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {preset.name}
        </h4>
        <span style={{
          fontSize: '9px',
          color: theme.textMuted,
          fontFamily: 'monospace',
          flexShrink: 0,
        }}>
          {getGridSummary()}
        </span>
      </div>
      
      {/* Tags Row - minimal */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '3px',
        minHeight: '18px',
      }}>
        {preset.tags.slice(0, 2).map(tag => (
          <span
            key={tag}
            style={{
              fontSize: '8px',
              padding: '2px 5px',
              borderRadius: '3px',
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
              fontSize: '8px',
              padding: '2px 5px',
              borderRadius: '3px',
              backgroundColor: isDark ? '#2d4a3e' : '#d4edda',
              color: isDark ? '#7dd3a0' : '#155724',
              fontWeight: 600,
            }}
          >
            {preset.aspectRatio}
          </span>
        )}
      </div>
      
      {/* Apply Button - slide in from bottom */}
      <div style={{
        overflow: 'hidden',
        maxHeight: isHovered || isSelected ? '40px' : '0px',
        marginTop: isHovered || isSelected ? '8px' : '0px',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onApply()
          }}
          style={{
            width: '100%',
            padding: '7px 10px',
            border: 'none',
            borderRadius: '5px',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
        >
          Apply
        </button>
      </div>
    </div>
  )
}

export default GridPresetCard

