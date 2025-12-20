import * as React from 'react'
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
    }}>
      {/* Search Bar */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
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
      
      {/* Category Pills - wrapping layout */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${theme.border}`,
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
        }}>
          {GRID_CATEGORIES.map(cat => {
            const count = getPresetCountByCategory(cat.id)
            const isActive = selectedCategory === cat.id
            
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  borderRadius: '14px',
                  border: isActive ? 'none' : `1px solid ${theme.border}`,
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  backgroundColor: isActive ? theme.categoryActive : 'transparent',
                  color: isActive ? theme.categoryActiveText : theme.textMuted,
                }}
              >
                <span style={{ fontSize: '11px' }}>{cat.icon}</span>
                <span>{cat.name}</span>
                <span style={{
                  fontSize: '9px',
                  opacity: 0.6,
                }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      
      {/* Selection Status */}
      {selectionInfo && (
        <div style={{
          padding: '8px 16px',
          backgroundColor: selectionInfo.hasSelection 
            ? (isDark ? '#1e3a2f' : '#e6f4ea')
            : (isDark ? '#3a2e1e' : '#fef3e6'),
          borderBottom: `1px solid ${theme.border}`,
        }}>
          <p style={{
            margin: 0,
            fontSize: '11px',
            color: selectionInfo.hasSelection
              ? (isDark ? '#7dd3a0' : '#137333')
              : (isDark ? '#fbbf24' : '#b45309'),
          }}>
            {selectionInfo.hasSelection 
              ? `✓ Selected: ${selectionInfo.name} (${selectionInfo.width}×${selectionInfo.height})`
              : '⚠ Select a frame to apply grids'
            }
          </p>
        </div>
      )}
      
      {/* Grid Cards */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
      }}>
        {filteredPresets.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
          }}>
            {filteredPresets.map(preset => (
              <GridPresetCard
                key={preset.id}
                preset={preset}
                isSelected={selectedPreset?.id === preset.id}
                onClick={() => setSelectedPreset(preset)}
                onApply={() => {
                  if (selectionInfo?.hasSelection) {
                    handleApplyGrid(preset)
                  } else {
                    // Don't auto-create frame - warn user instead
                    parent.postMessage({ 
                      pluginMessage: { 
                        type: 'notify', 
                        text: 'Please select a frame first, or use "Create Frame" button' 
                      } 
                    }, '*')
                    setSelectedPreset(preset)
                  }
                }}
                isDark={isDark}
              />
            ))}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: theme.textMuted,
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.3 }}>📐</div>
            <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
              No grids found
            </p>
            <p style={{ fontSize: '12px', opacity: 0.7 }}>
              Try adjusting your search or category filter
            </p>
          </div>
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

