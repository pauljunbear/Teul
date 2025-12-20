import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GridPresetCard } from './GridPresetCard'
import { SaveGridModal } from './SaveGridModal'
import { 
  GRID_PRESETS, 
  GRID_CATEGORIES, 
  getPresetsByCategory,
  searchPresets,
  getPresetCountByCategory,
} from '../lib/gridPresets'
import { 
  buildCreateGridFrameMessage, 
  buildApplyGridMessage,
  getPresetFrameDimensions,
  presetToFrameName,
  scaleGridForFrameSize,
} from '../lib/figmaGrids'
import type { GridPreset, GridCategory } from '../types/grid'

// Hook for scroll direction detection
function useScrollDirection() {
  const [scrollDirection, setScrollDirection] = React.useState<'up' | 'down' | null>(null)
  const [lastScrollY, setLastScrollY] = React.useState(0)
  const [isAtTop, setIsAtTop] = React.useState(true)
  
  const updateScrollDirection = React.useCallback((scrollY: number) => {
    setIsAtTop(scrollY < 10)
    
    if (scrollY > lastScrollY && scrollY > 50) {
      setScrollDirection('down')
    } else if (scrollY < lastScrollY) {
      setScrollDirection('up')
    }
    
    setLastScrollY(scrollY)
  }, [lastScrollY])
  
  return { scrollDirection, isAtTop, updateScrollDirection }
}

interface GridLibraryProps {
  isDark: boolean
}

const styles = {
  light: {
    bg: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    inputBg: '#f5f5f5',
    categoryBg: '#f5f5f5',
    categoryActive: '#1a1a1a',
    categoryActiveText: '#ffffff',
    emptyIcon: '#d4d4d4',
  },
  dark: {
    bg: '#1a1a1a',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    inputBg: '#2a2a2a',
    categoryBg: '#2a2a2a',
    categoryActive: '#ffffff',
    categoryActiveText: '#1a1a1a',
    emptyIcon: '#404040',
  }
}

export const GridLibrary: React.FC<GridLibraryProps> = ({ isDark }) => {
  const theme = isDark ? styles.dark : styles.light
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const { scrollDirection, isAtTop, updateScrollDirection } = useScrollDirection()
  
  const [selectedCategory, setSelectedCategory] = React.useState<GridCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [selectedPreset, setSelectedPreset] = React.useState<GridPreset | null>(null)
  const [selectionInfo, setSelectionInfo] = React.useState<{
    hasSelection: boolean
    isFrame: boolean
    width?: number
    height?: number
    name?: string
  } | null>(null)
  const [showSaveModal, setShowSaveModal] = React.useState(false)
  
  // Track scroll for header hide/show
  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    updateScrollDirection(e.currentTarget.scrollTop)
  }, [updateScrollDirection])
  
  // Show header when search has focus or at top
  const showHeader = isAtTop || scrollDirection === 'up'
  
  // Get filtered presets
  const filteredPresets = React.useMemo(() => {
    let presets = selectedCategory === 'all' 
      ? GRID_PRESETS 
      : getPresetsByCategory(selectedCategory)
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      presets = presets.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.tags.some(t => t.toLowerCase().includes(query))
      )
    }
    
    return presets
  }, [selectedCategory, searchQuery])
  
  // Request selection info on mount and periodically
  React.useEffect(() => {
    const requestSelectionInfo = () => {
      parent.postMessage({ pluginMessage: { type: 'get-selection-for-grid' } }, '*')
    }
    
    requestSelectionInfo()
    
    // Listen for selection info
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage
      if (msg?.type === 'selection-info') {
        setSelectionInfo({
          hasSelection: msg.hasSelection,
          isFrame: msg.isFrame,
          width: msg.width,
          height: msg.height,
          name: msg.name,
        })
      }
    }
    
    window.addEventListener('message', handleMessage)
    
    // Poll for selection changes
    const interval = setInterval(requestSelectionInfo, 2000)
    
    return () => {
      window.removeEventListener('message', handleMessage)
      clearInterval(interval)
    }
  }, [])
  
  // Apply grid to selection
  const handleApplyGrid = (preset: GridPreset) => {
    if (!selectionInfo?.hasSelection) {
      parent.postMessage({ 
        pluginMessage: { 
          type: 'notify', 
          text: 'Please select a frame first' 
        } 
      }, '*')
      return
    }
    
    const targetWidth = selectionInfo.width || 800
    const targetHeight = selectionInfo.height || 600
    
    // Get preset's native dimensions
    const presetDimensions = getPresetFrameDimensions(preset)
    
    // Scale the grid if needed (preserving column/row counts)
    const scaledConfig = scaleGridForFrameSize(
      preset.config,
      presetDimensions.width,
      presetDimensions.height,
      targetWidth,
      targetHeight,
      true // preserve column count
    )
    
    // Build and send the apply message
    const message = buildApplyGridMessage({
      config: scaledConfig,
      width: targetWidth,
      height: targetHeight,
      replaceExisting: true,
    })
    
    parent.postMessage({ pluginMessage: message }, '*')
  }
  
  // Create new frame with grid
  const handleCreateFrame = (preset: GridPreset) => {
    // Get recommended dimensions for this preset
    const { width, height } = getPresetFrameDimensions(preset)
    
    // Build and send the create frame message
    const message = buildCreateGridFrameMessage({
      config: preset.config,
      frameName: presetToFrameName(preset),
      width,
      height,
      positionNearSelection: true,
    })
    
    parent.postMessage({ pluginMessage: message }, '*')
  }
  
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: theme.bg,
      position: 'relative',
    }}>
      {/* Animated Header - hides on scroll down */}
      <motion.div
        initial={{ y: 0 }}
        animate={{ 
          y: showHeader ? 0 : -150,
          opacity: showHeader ? 1 : 0,
        }}
        transition={{ 
          type: 'spring', 
          stiffness: 300, 
          damping: 30,
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          backgroundColor: theme.bg,
          borderBottom: `1px solid ${theme.border}`,
          boxShadow: !isAtTop ? '0 2px 10px rgba(0,0,0,0.1)' : 'none',
        }}
      >
        {/* Search + Categories unified */}
        <div style={{ padding: '12px 16px 8px' }}>
          <input
            type="text"
            placeholder="Search grids..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.inputBg,
              color: theme.text,
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        
        {/* Category Pills */}
        <div style={{ padding: '4px 16px 12px' }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '5px',
          }}>
            {GRID_CATEGORIES.map(cat => {
              const count = getPresetCountByCategory(cat.id)
              const isActive = selectedCategory === cat.id
              
              return (
                <motion.button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 9px',
                    borderRadius: '12px',
                    border: isActive ? 'none' : `1px solid ${isDark ? '#333' : '#ddd'}`,
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: isActive ? 600 : 500,
                    whiteSpace: 'nowrap',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                    backgroundColor: isActive ? theme.categoryActive : 'transparent',
                    color: isActive ? theme.categoryActiveText : theme.textMuted,
                  }}
                >
                  <span style={{ fontSize: '10px' }}>{cat.icon}</span>
                  <span>{cat.name}</span>
                  <span style={{
                    fontSize: '9px',
                    opacity: 0.5,
                  }}>
                    {count}
                  </span>
                </motion.button>
              )
            })}
          </div>
        </div>
      </motion.div>
      
      {/* Selection Status - compact floating pill */}
      <AnimatePresence>
        {selectionInfo && !selectionInfo.hasSelection && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'absolute',
              top: showHeader ? 115 : 8,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 5,
              padding: '6px 12px',
              borderRadius: '16px',
              backgroundColor: isDark ? '#3a2e1e' : '#fef3e6',
              border: `1px solid ${isDark ? '#5a4a2a' : '#fcd34d'}`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'top 0.3s ease',
            }}
          >
            <p style={{
              margin: 0,
              fontSize: '10px',
              fontWeight: 500,
              color: isDark ? '#fbbf24' : '#b45309',
            }}>
              ⚠ Select a frame to apply grids
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Grid Cards - with scroll tracking */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingTop: '120px', // Space for fixed header
          paddingLeft: '12px',
          paddingRight: '12px',
          paddingBottom: '12px',
        }}
      >
        {filteredPresets.length > 0 ? (
          <motion.div 
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px',
            }}
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: {
                  staggerChildren: 0.03,
                },
              },
            }}
          >
            {filteredPresets.map((preset, index) => (
              <motion.div
                key={preset.id}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{ 
                  type: 'spring',
                  stiffness: 400,
                  damping: 25,
                }}
              >
                <GridPresetCard
                  preset={preset}
                  isSelected={selectedPreset?.id === preset.id}
                  onClick={() => setSelectedPreset(preset)}
                  onApply={() => {
                    if (selectionInfo?.hasSelection) {
                      handleApplyGrid(preset)
                    } else {
                      parent.postMessage({ 
                        pluginMessage: { 
                          type: 'notify', 
                          text: 'Select a frame first, or use "Create Frame"' 
                        } 
                      }, '*')
                      setSelectedPreset(preset)
                    }
                  }}
                  isDark={isDark}
                />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: theme.textMuted,
            }}
          >
            <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }}>📐</div>
            <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              No grids found
            </p>
            <p style={{ fontSize: '11px', opacity: 0.6 }}>
              Try adjusting your search
            </p>
          </motion.div>
        )}
      </div>
      
      {/* Selected Preset Info Panel */}
      {selectedPreset && (
        <div style={{
          flexShrink: 0,
          padding: '16px',
          borderTop: `1px solid ${theme.border}`,
          backgroundColor: isDark ? '#262626' : '#fafafa',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '12px',
          }}>
            <div style={{ flex: 1, marginRight: '12px' }}>
              <h3 style={{
                margin: '0 0 4px 0',
                fontSize: '14px',
                fontWeight: 600,
                color: theme.text,
              }}>
                {selectedPreset.name}
              </h3>
              <p style={{
                margin: 0,
                fontSize: '11px',
                color: theme.textMuted,
                lineHeight: 1.4,
              }}>
                {selectedPreset.description}
              </p>
            </div>
            <button
              onClick={() => setSelectedPreset(null)}
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                color: theme.textMuted,
                cursor: 'pointer',
                fontSize: '16px',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
          
          {/* Action buttons - always show both Apply and Create */}
          <div style={{
            display: 'flex',
            gap: '8px',
          }}>
            <button
              onClick={() => {
                if (selectionInfo?.hasSelection) {
                  handleApplyGrid(selectedPreset)
                } else {
                  parent.postMessage({ 
                    pluginMessage: { type: 'notify', text: 'Select a frame first' } 
                  }, '*')
                }
              }}
              disabled={!selectionInfo?.hasSelection}
              style={{
                flex: 1,
                padding: '10px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: selectionInfo?.hasSelection ? '#3b82f6' : (isDark ? '#404040' : '#d4d4d4'),
                color: selectionInfo?.hasSelection ? '#ffffff' : (isDark ? '#666' : '#999'),
                fontSize: '12px',
                fontWeight: 600,
                cursor: selectionInfo?.hasSelection ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s ease',
              }}
            >
              ✓ Apply
            </button>
            
            <button
              onClick={() => handleCreateFrame(selectedPreset)}
              style={{
                flex: 1,
                padding: '10px 16px',
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                backgroundColor: 'transparent',
                color: theme.text,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              + New Frame
            </button>
            
            <button
              onClick={() => setShowSaveModal(true)}
              title="Save to My Grids"
              style={{
                padding: '10px 14px',
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                backgroundColor: 'transparent',
                color: theme.text,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
            >
              💾
            </button>
          </div>
        </div>
      )}
      
      {/* Save Grid Modal */}
      {showSaveModal && selectedPreset && (
        <SaveGridModal
          config={selectedPreset.config}
          suggestedName={`${selectedPreset.name} (Copy)`}
          source={selectedPreset.name}
          aspectRatio={selectedPreset.aspectRatio}
          isDark={isDark}
          onClose={() => setShowSaveModal(false)}
          onSave={() => {
            setShowSaveModal(false)
            // Notify user
            parent.postMessage({
              pluginMessage: {
                type: 'notify',
                text: `Saved "${selectedPreset.name}" to My Grids`
              }
            }, '*')
          }}
        />
      )}
    </div>
  )
}

export default GridLibrary

