import * as React from 'react'
import type { SavedGrid, GridCategory } from '../types/grid'
import { GridMiniPreview } from './GridPreview'
import { 
  loadSavedGrids, 
  deleteSavedGrid, 
  updateSavedGrid,
  duplicateSavedGrid,
  downloadGridsAsJSON,
  importGridsFromFile,
  searchSavedGrids,
} from '../lib/gridStorage'
import { 
  buildApplyGridMessage, 
  buildCreateGridFrameMessage,
  getPresetFrameDimensions 
} from '../lib/figmaGrids'

interface MyGridsProps {
  isDark: boolean
  onSaveGrid?: (grid: SavedGrid) => void
}

const styles = {
  light: {
    bg: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    inputBg: '#f5f5f5',
    cardBg: '#ffffff',
    cardHoverBg: '#f8f8f8',
    dangerBg: '#fef2f2',
    dangerText: '#dc2626',
    successBg: '#f0fdf4',
    successText: '#16a34a',
  },
  dark: {
    bg: '#1a1a1a',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    inputBg: '#2a2a2a',
    cardBg: '#262626',
    cardHoverBg: '#333333',
    dangerBg: '#450a0a',
    dangerText: '#fca5a5',
    successBg: '#052e16',
    successText: '#86efac',
  }
}

// ============================================
// Grid Card Component
// ============================================

interface GridCardProps {
  grid: SavedGrid
  isDark: boolean
  onApply: () => void
  onCreateFrame: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  isSelected?: boolean
  onClick?: () => void
}

const GridCard: React.FC<GridCardProps> = ({
  grid,
  isDark,
  onApply,
  onCreateFrame,
  onEdit,
  onDuplicate,
  onDelete,
  isSelected,
  onClick,
}) => {
  const theme = isDark ? styles.dark : styles.light
  const [showActions, setShowActions] = React.useState(false)
  
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      style={{
        padding: '12px',
        backgroundColor: isSelected ? (isDark ? '#2a3a4a' : '#e6f0ff') : theme.cardBg,
        borderRadius: '10px',
        border: `1px solid ${isSelected ? '#3b82f6' : theme.border}`,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
    >
      {/* Preview */}
      <div style={{
        marginBottom: '10px',
        borderRadius: '6px',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        backgroundColor: isDark ? '#1e1e1e' : '#f0f0f0',
        padding: '8px',
      }}>
        <GridMiniPreview config={grid.config} size={64} isDark={isDark} />
      </div>
      
      {/* Info */}
      <h4 style={{
        margin: '0 0 4px 0',
        fontSize: '12px',
        fontWeight: 600,
        color: theme.text,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {grid.name}
      </h4>
      
      <p style={{
        margin: '0 0 6px 0',
        fontSize: '10px',
        color: theme.textMuted,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {grid.description || 'No description'}
      </p>
      
      {/* Tags */}
      {grid.tags.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '4px',
          flexWrap: 'wrap',
          marginBottom: '8px',
        }}>
          {grid.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '9px',
                backgroundColor: isDark ? '#333' : '#e5e5e5',
                color: theme.textMuted,
              }}
            >
              {tag}
            </span>
          ))}
          {grid.tags.length > 3 && (
            <span style={{ fontSize: '9px', color: theme.textMuted }}>
              +{grid.tags.length - 3}
            </span>
          )}
        </div>
      )}
      
      {/* Quick Actions (visible on hover) */}
      {showActions && (
        <div style={{
          display: 'flex',
          gap: '4px',
          marginTop: '8px',
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); onApply(); }}
            style={{
              flex: 1,
              padding: '6px 8px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Apply
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCreateFrame(); }}
            style={{
              padding: '6px 8px',
              borderRadius: '4px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.text,
              fontSize: '10px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            title="Create new frame"
          >
            +
          </button>
        </div>
      )}
      
      {/* Context Menu (visible on hover) */}
      {showActions && (
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          display: 'flex',
          gap: '4px',
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="Edit"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.cardBg,
              color: theme.textMuted,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✏️
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            title="Duplicate"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.cardBg,
              color: theme.textMuted,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            📋
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.dangerBg,
              color: theme.dangerText,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            🗑️
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================
// Edit Modal Component
// ============================================

interface EditModalProps {
  grid: SavedGrid
  isDark: boolean
  onSave: (updates: Partial<SavedGrid>) => void
  onCancel: () => void
}

const EditModal: React.FC<EditModalProps> = ({ grid, isDark, onSave, onCancel }) => {
  const theme = isDark ? styles.dark : styles.light
  const [name, setName] = React.useState(grid.name)
  const [description, setDescription] = React.useState(grid.description)
  const [tags, setTags] = React.useState(grid.tags.join(', '))
  
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        width: '340px',
        backgroundColor: theme.bg,
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
      }}>
        <h3 style={{
          margin: '0 0 16px 0',
          fontSize: '16px',
          fontWeight: 600,
          color: theme.text,
        }}>
          Edit Grid
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
            }}>
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
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
          
          <div>
            <label style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
            }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.inputBg,
                color: theme.text,
                fontSize: '13px',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>
          
          <div>
            <label style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
            }}>
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="poster, swiss, 4-column"
              style={{
                width: '100%',
                padding: '10px 12px',
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
        </div>
        
        <div style={{
          display: 'flex',
          gap: '8px',
          marginTop: '20px',
        }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.textMuted,
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({
              name: name.trim() || 'Untitled Grid',
              description: description.trim(),
              tags: tags.split(',').map(t => t.trim()).filter(Boolean),
            })}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Delete Confirmation Modal
// ============================================

interface DeleteModalProps {
  gridName: string
  isDark: boolean
  onConfirm: () => void
  onCancel: () => void
}

const DeleteModal: React.FC<DeleteModalProps> = ({ gridName, isDark, onConfirm, onCancel }) => {
  const theme = isDark ? styles.dark : styles.light
  
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        width: '300px',
        backgroundColor: theme.bg,
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🗑️</div>
        <h3 style={{
          margin: '0 0 8px 0',
          fontSize: '16px',
          fontWeight: 600,
          color: theme.text,
        }}>
          Delete Grid?
        </h3>
        <p style={{
          margin: '0 0 20px 0',
          fontSize: '13px',
          color: theme.textMuted,
        }}>
          Are you sure you want to delete "{gridName}"? This action cannot be undone.
        </p>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.textMuted,
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Main MyGrids Component
// ============================================

export const MyGrids: React.FC<MyGridsProps> = ({ isDark }) => {
  const theme = isDark ? styles.dark : styles.light
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  
  // State
  const [grids, setGrids] = React.useState<SavedGrid[]>([])
  const [searchQuery, setSearchQuery] = React.useState('')
  const [selectedGrid, setSelectedGrid] = React.useState<SavedGrid | null>(null)
  const [editingGrid, setEditingGrid] = React.useState<SavedGrid | null>(null)
  const [deletingGrid, setDeletingGrid] = React.useState<SavedGrid | null>(null)
  const [notification, setNotification] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null)
  
  // Load grids on mount
  React.useEffect(() => {
    setGrids(loadSavedGrids())
  }, [])
  
  // Filter grids by search
  const filteredGrids = React.useMemo(() => {
    if (!searchQuery.trim()) return grids
    return searchSavedGrids(searchQuery)
  }, [grids, searchQuery])
  
  // Show notification
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }
  
  // Apply grid to selection
  const handleApplyGrid = (grid: SavedGrid) => {
    parent.postMessage({
      pluginMessage: {
        type: 'get-selection-for-grid'
      }
    }, '*')
    
    // We'll send the apply message after getting selection info
    // For now, just send directly with default dimensions
    const message = buildApplyGridMessage({
      config: grid.config,
      width: 800,
      height: 600,
      replaceExisting: true,
    })
    parent.postMessage({ pluginMessage: message }, '*')
    showNotification('success', `Applied "${grid.name}"`)
  }
  
  // Create new frame with grid
  const handleCreateFrame = (grid: SavedGrid) => {
    const dimensions = getPresetFrameDimensions(grid)
    const message = buildCreateGridFrameMessage({
      config: grid.config,
      frameName: `Grid - ${grid.name}`,
      width: dimensions.width,
      height: dimensions.height,
      positionNearSelection: true,
    })
    parent.postMessage({ pluginMessage: message }, '*')
    showNotification('success', `Created frame with "${grid.name}"`)
  }
  
  // Edit grid
  const handleEditGrid = (grid: SavedGrid, updates: Partial<SavedGrid>) => {
    const updated = updateSavedGrid(grid.id, updates)
    setGrids(updated)
    setEditingGrid(null)
    showNotification('success', 'Grid updated')
  }
  
  // Duplicate grid
  const handleDuplicateGrid = (grid: SavedGrid) => {
    const duplicate = duplicateSavedGrid(grid.id)
    if (duplicate) {
      setGrids(loadSavedGrids())
      showNotification('success', `Created copy of "${grid.name}"`)
    }
  }
  
  // Delete grid
  const handleDeleteGrid = (grid: SavedGrid) => {
    const updated = deleteSavedGrid(grid.id)
    setGrids(updated)
    setDeletingGrid(null)
    if (selectedGrid?.id === grid.id) {
      setSelectedGrid(null)
    }
    showNotification('success', `Deleted "${grid.name}"`)
  }
  
  // Export grids
  const handleExport = () => {
    if (grids.length === 0) {
      showNotification('error', 'No grids to export')
      return
    }
    downloadGridsAsJSON(grids)
    showNotification('success', `Exported ${grids.length} grid(s)`)
  }
  
  // Import grids
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const result = await importGridsFromFile(file)
    
    if (result.success) {
      setGrids(result.grids || [])
      showNotification('success', `Imported ${result.count} grid(s)`)
    } else {
      showNotification('error', result.error || 'Import failed')
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }
  
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: theme.bg,
    }}>
      {/* Header with search and actions */}
      <div style={{
        flexShrink: 0,
        padding: '12px 16px',
        borderBottom: `1px solid ${theme.border}`,
      }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search your grids..."
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
            marginBottom: '12px',
          }}
        />
        
        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: '8px',
        }}>
          <button
            onClick={handleExport}
            disabled={grids.length === 0}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: grids.length === 0 ? theme.textMuted : theme.text,
              fontSize: '11px',
              fontWeight: 600,
              cursor: grids.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              opacity: grids.length === 0 ? 0.5 : 1,
            }}
          >
            <span>📤</span> Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.text,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>📥</span> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </div>
      </div>
      
      {/* Notification */}
      {notification && (
        <div style={{
          padding: '10px 16px',
          backgroundColor: notification.type === 'success' ? theme.successBg : theme.dangerBg,
          color: notification.type === 'success' ? theme.successText : theme.dangerText,
          fontSize: '12px',
          fontWeight: 500,
          textAlign: 'center',
        }}>
          {notification.message}
        </div>
      )}
      
      {/* Grid List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
      }}>
        {filteredGrids.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
          }}>
            {filteredGrids.map(grid => (
              <GridCard
                key={grid.id}
                grid={grid}
                isDark={isDark}
                isSelected={selectedGrid?.id === grid.id}
                onClick={() => setSelectedGrid(grid)}
                onApply={() => handleApplyGrid(grid)}
                onCreateFrame={() => handleCreateFrame(grid)}
                onEdit={() => setEditingGrid(grid)}
                onDuplicate={() => handleDuplicateGrid(grid)}
                onDelete={() => setDeletingGrid(grid)}
              />
            ))}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>💾</div>
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '16px',
              fontWeight: 600,
              color: theme.text,
            }}>
              {searchQuery ? 'No matching grids' : 'No saved grids yet'}
            </h3>
            <p style={{
              margin: 0,
              fontSize: '13px',
              color: theme.textMuted,
              lineHeight: 1.5,
            }}>
              {searchQuery 
                ? 'Try a different search term'
                : 'Save grids from the Library or Analyzer tabs to build your collection.'
              }
            </p>
            
            {!searchQuery && (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  marginTop: '16px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>📥</span> Import Grids
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Footer with count */}
      {grids.length > 0 && (
        <div style={{
          flexShrink: 0,
          padding: '8px 16px',
          borderTop: `1px solid ${theme.border}`,
          fontSize: '11px',
          color: theme.textMuted,
          textAlign: 'center',
        }}>
          {filteredGrids.length === grids.length 
            ? `${grids.length} saved grid${grids.length !== 1 ? 's' : ''}`
            : `${filteredGrids.length} of ${grids.length} grids`
          }
        </div>
      )}
      
      {/* Edit Modal */}
      {editingGrid && (
        <EditModal
          grid={editingGrid}
          isDark={isDark}
          onSave={(updates) => handleEditGrid(editingGrid, updates)}
          onCancel={() => setEditingGrid(null)}
        />
      )}
      
      {/* Delete Confirmation Modal */}
      {deletingGrid && (
        <DeleteModal
          gridName={deletingGrid.name}
          isDark={isDark}
          onConfirm={() => handleDeleteGrid(deletingGrid)}
          onCancel={() => setDeletingGrid(null)}
        />
      )}
    </div>
  )
}

export default MyGrids


