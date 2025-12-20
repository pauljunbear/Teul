import * as React from 'react'
import type { GridConfig, GridCategory, DetectedGrid, SavedGrid } from '../types/grid'
import { GridMiniPreview } from './GridPreview'
import { createSavedGrid, addSavedGrid } from '../lib/gridStorage'

interface SaveGridModalProps {
  /** Grid configuration to save */
  config: GridConfig
  /** Pre-fill name suggestion */
  suggestedName?: string
  /** Source of the grid (e.g., "Swiss 4-Column" or "Analyzed") */
  source?: string
  /** Detected grid data if from analysis */
  detectedData?: DetectedGrid
  /** Suggested aspect ratio */
  aspectRatio?: string
  /** Dark mode */
  isDark: boolean
  /** Callback when modal is closed */
  onClose: () => void
  /** Callback when grid is saved successfully */
  onSave?: (grid: SavedGrid) => void
}

const styles = {
  light: {
    bg: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    inputBg: '#f5f5f5',
    successBg: '#f0fdf4',
    successText: '#16a34a',
  },
  dark: {
    bg: '#1a1a1a',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    inputBg: '#2a2a2a',
    successBg: '#052e16',
    successText: '#86efac',
  }
}

const CATEGORY_OPTIONS: { value: GridCategory; label: string; icon: string }[] = [
  { value: 'custom', label: 'Custom', icon: '✨' },
  { value: 'classic-swiss', label: 'Classic Swiss', icon: '🇨🇭' },
  { value: 'editorial', label: 'Editorial', icon: '📰' },
  { value: 'poster', label: 'Poster', icon: '🎨' },
  { value: 'web-ui', label: 'Web/UI', icon: '💻' },
  { value: 'modular', label: 'Modular', icon: '🔲' },
  { value: 'baseline', label: 'Baseline', icon: '📏' },
  { value: 'combined', label: 'Combined', icon: '🎯' },
]

export const SaveGridModal: React.FC<SaveGridModalProps> = ({
  config,
  suggestedName = '',
  source,
  detectedData,
  aspectRatio,
  isDark,
  onClose,
  onSave,
}) => {
  const theme = isDark ? styles.dark : styles.light
  
  // Form state
  const [name, setName] = React.useState(suggestedName || 'My Grid')
  const [description, setDescription] = React.useState('')
  const [category, setCategory] = React.useState<GridCategory>('custom')
  const [tags, setTags] = React.useState('')
  const [isSaving, setIsSaving] = React.useState(false)
  const [isSaved, setIsSaved] = React.useState(false)
  
  // Auto-generate tags based on config
  React.useEffect(() => {
    const autoTags: string[] = []
    
    if (config.columns) {
      autoTags.push(`${config.columns.count}-column`)
    }
    if (config.rows) {
      autoTags.push(`${config.rows.count}-row`)
      autoTags.push('modular')
    }
    if (config.baseline) {
      autoTags.push('baseline')
      autoTags.push(`${config.baseline.height}px`)
    }
    if (source) {
      autoTags.push(source.toLowerCase().replace(/\s+/g, '-'))
    }
    
    setTags(autoTags.join(', '))
  }, [config, source])
  
  // Handle save
  const handleSave = () => {
    setIsSaving(true)
    
    try {
      const savedGrid = createSavedGrid({
        name: name.trim() || 'Untitled Grid',
        description: description.trim(),
        category,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        config,
        source,
        detectedData,
        aspectRatio,
      })
      
      addSavedGrid(savedGrid)
      
      setIsSaved(true)
      
      // Notify parent
      onSave?.(savedGrid)
      
      // Close after brief delay
      setTimeout(() => {
        onClose()
      }, 1000)
    } catch (error) {
      console.error('Failed to save grid:', error)
      setIsSaving(false)
    }
  }
  
  // Close on escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose()
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isSaving) {
        handleSave()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSaving])
  
  if (isSaved) {
    return (
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
        onClick={onClose}
      >
        <div style={{
          width: '280px',
          backgroundColor: theme.bg,
          borderRadius: '12px',
          padding: '24px',
          textAlign: 'center',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: theme.successBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            fontSize: '24px',
          }}>
            ✓
          </div>
          <h3 style={{
            margin: '0 0 8px 0',
            fontSize: '16px',
            fontWeight: 600,
            color: theme.text,
          }}>
            Grid Saved!
          </h3>
          <p style={{
            margin: 0,
            fontSize: '13px',
            color: theme.textMuted,
          }}>
            "{name}" has been added to My Grids
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) {
          onClose()
        }
      }}
    >
      <div style={{
        width: '360px',
        backgroundColor: theme.bg,
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '16px',
            fontWeight: 600,
            color: theme.text,
          }}>
            Save Grid
          </h3>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: theme.textMuted,
              fontSize: '16px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
        
        {/* Content */}
        <div style={{ padding: '20px' }}>
          {/* Preview */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: theme.inputBg,
            borderRadius: '8px',
          }}>
            <GridMiniPreview config={config} size={80} isDark={isDark} />
          </div>
          
          {/* Form Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Name */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
              }}>
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Custom Grid"
                autoFocus
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
            
            {/* Description */}
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
                placeholder="Describe when to use this grid..."
                rows={2}
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
            
            {/* Category */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
              }}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as GridCategory)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.icon} {opt.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Tags */}
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
        </div>
        
        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${theme.border}`,
          display: 'flex',
          gap: '8px',
        }}>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.textMuted,
              fontSize: '12px',
              fontWeight: 600,
              cursor: isSaving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: !name.trim() ? theme.border : '#3b82f6',
              color: !name.trim() ? theme.textMuted : '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isSaving || !name.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {isSaving ? (
              <>
                <span style={{ 
                  display: 'inline-block',
                  animation: 'spin 1s linear infinite',
                }}>⟳</span>
                Saving...
              </>
            ) : (
              <>💾 Save Grid</>
            )}
          </button>
        </div>
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default SaveGridModal


