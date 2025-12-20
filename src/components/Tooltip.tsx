import * as React from 'react'

// ============================================
// Tooltip Component with Grid Terminology
// ============================================

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  maxWidth?: number
  isDark?: boolean
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  maxWidth = 200,
  isDark = true,
}) => {
  const [isVisible, setIsVisible] = React.useState(false)
  const [coords, setCoords] = React.useState({ x: 0, y: 0 })
  const triggerRef = React.useRef<HTMLDivElement>(null)
  const tooltipRef = React.useRef<HTMLDivElement>(null)
  
  const showTooltip = () => setIsVisible(true)
  const hideTooltip = () => setIsVisible(false)
  
  React.useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const trigger = triggerRef.current.getBoundingClientRect()
      const tooltip = tooltipRef.current.getBoundingClientRect()
      
      let x = 0
      let y = 0
      
      switch (position) {
        case 'top':
          x = trigger.left + trigger.width / 2 - tooltip.width / 2
          y = trigger.top - tooltip.height - 8
          break
        case 'bottom':
          x = trigger.left + trigger.width / 2 - tooltip.width / 2
          y = trigger.bottom + 8
          break
        case 'left':
          x = trigger.left - tooltip.width - 8
          y = trigger.top + trigger.height / 2 - tooltip.height / 2
          break
        case 'right':
          x = trigger.right + 8
          y = trigger.top + trigger.height / 2 - tooltip.height / 2
          break
      }
      
      // Keep tooltip within viewport
      x = Math.max(8, Math.min(x, window.innerWidth - tooltip.width - 8))
      y = Math.max(8, Math.min(y, window.innerHeight - tooltip.height - 8))
      
      setCoords({ x, y })
    }
  }, [isVisible, position])
  
  const theme = {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#404040' : '#e5e5e5',
    text: isDark ? '#ffffff' : '#1a1a1a',
    textMuted: isDark ? '#a3a3a3' : '#666666',
  }
  
  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        style={{ display: 'inline-block' }}
      >
        {children}
      </div>
      
      {isVisible && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            maxWidth,
            padding: '8px 12px',
            backgroundColor: theme.bg,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: 10000,
            pointerEvents: 'none',
            animation: 'tooltipFadeIn 0.15s ease',
          }}
        >
          <div style={{
            fontSize: '11px',
            lineHeight: 1.4,
            color: theme.text,
          }}>
            {content}
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes tooltipFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}

// ============================================
// Info Icon with Tooltip
// ============================================

interface InfoTooltipProps {
  content: React.ReactNode
  isDark?: boolean
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ content, isDark = true }) => {
  return (
    <Tooltip content={content} isDark={isDark}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
        color: isDark ? '#a3a3a3' : '#666666',
        fontSize: '10px',
        fontWeight: 700,
        cursor: 'help',
      }}>
        ?
      </span>
    </Tooltip>
  )
}

// ============================================
// Grid Terminology Definitions
// ============================================

export const GRID_TERMINOLOGY: Record<string, { term: string; definition: string }> = {
  columns: {
    term: 'Columns',
    definition: 'Vertical divisions of your layout. Content aligns to these invisible guides. More columns = more flexibility for layouts.'
  },
  gutter: {
    term: 'Gutter',
    definition: 'The space between columns. Consistent gutters create visual rhythm. Typically 15-30px for web, 3-5% for print.'
  },
  margin: {
    term: 'Margin',
    definition: 'The space between the grid and the frame edge. Creates breathing room and prevents content from touching edges.'
  },
  baseline: {
    term: 'Baseline Grid',
    definition: 'Horizontal lines that align text across columns. The height matches your line-height for consistent vertical rhythm.'
  },
  modular: {
    term: 'Modular Grid',
    definition: 'A grid with both columns AND rows, creating a matrix of cells. Perfect for complex layouts with images and text blocks.'
  },
  alignment: {
    term: 'Alignment',
    definition: 'How columns fill the frame. STRETCH: columns expand to fill space. MIN/MAX: columns are fixed-width from one edge.'
  },
  aspectRatio: {
    term: 'Aspect Ratio',
    definition: 'The proportional relationship between width and height. 1:√2 (A-series paper), 16:9 (widescreen), 1:1 (square).'
  },
  swiss: {
    term: 'Swiss Style',
    definition: 'Design approach emphasizing clean grids, asymmetry, and typography. Made famous by Müller-Brockmann and the International Typographic Style.'
  },
}

// Helper to get terminology tooltip
export const GridTermTooltip: React.FC<{ term: keyof typeof GRID_TERMINOLOGY; isDark?: boolean }> = ({ 
  term, 
  isDark = true 
}) => {
  const info = GRID_TERMINOLOGY[term]
  if (!info) return null
  
  return (
    <InfoTooltip
      content={
        <div>
          <strong style={{ display: 'block', marginBottom: '4px' }}>{info.term}</strong>
          {info.definition}
        </div>
      }
      isDark={isDark}
    />
  )
}

export default Tooltip


