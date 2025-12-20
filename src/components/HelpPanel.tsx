import * as React from 'react'

// ============================================
// Help Panel Component
// ============================================

interface HelpPanelProps {
  isOpen: boolean
  onClose: () => void
  isDark: boolean
}

const styles = {
  light: {
    bg: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    sectionBg: '#f5f5f5',
    codeBg: '#e5e5e5',
    accentBg: '#eff6ff',
    accentBorder: '#3b82f6',
    accentText: '#1e40af',
  },
  dark: {
    bg: '#1a1a1a',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    sectionBg: '#262626',
    codeBg: '#333333',
    accentBg: '#1e3a5f',
    accentBorder: '#3b82f6',
    accentText: '#93c5fd',
  }
}

// ============================================
// Help Content Sections
// ============================================

const HELP_SECTIONS = [
  {
    id: 'getting-started',
    title: '🚀 Getting Started',
    content: [
      {
        heading: 'Library Tab',
        text: 'Browse pre-built grid presets organized by category. Click a preset to see its details, then Apply to your selection or Create a new frame.',
      },
      {
        heading: 'Analyze Tab',
        text: 'Select an image in Figma, click "Get Selection", then "Analyze with AI" to detect its grid structure. Adjust the results and apply.',
      },
      {
        heading: 'My Grids Tab',
        text: 'Save custom grids for reuse. Export/import grids as JSON to share with your team.',
      },
    ],
  },
  {
    id: 'keyboard-shortcuts',
    title: '⌨️ Keyboard Shortcuts',
    shortcuts: [
      { keys: ['Enter'], action: 'Apply current grid to selection' },
      { keys: ['⌘/Ctrl', 'S'], action: 'Save current grid to My Grids' },
      { keys: ['Escape'], action: 'Close modal / Cancel action' },
      { keys: ['⌘/Ctrl', 'Enter'], action: 'Create new frame with grid' },
    ],
  },
  {
    id: 'grid-terminology',
    title: '📐 Grid Terminology',
    definitions: [
      {
        term: 'Columns',
        definition: 'Vertical divisions that structure your layout. Content aligns to column edges.',
      },
      {
        term: 'Gutter',
        definition: 'Space between columns. Creates visual separation and rhythm.',
      },
      {
        term: 'Margin',
        definition: 'Space between the grid and frame edge. Provides breathing room.',
      },
      {
        term: 'Baseline Grid',
        definition: 'Horizontal lines for text alignment. Height typically matches line-height.',
      },
      {
        term: 'Modular Grid',
        definition: 'Both columns AND rows, creating a matrix of cells for complex layouts.',
      },
      {
        term: 'Swiss Style',
        definition: 'Design approach emphasizing mathematical grids, clean typography, and asymmetric balance.',
      },
    ],
  },
  {
    id: 'tips',
    title: '💡 Pro Tips',
    tips: [
      'Use % for gutters/margins when designing responsive layouts.',
      'Combine column grids with baseline grids for perfect typography.',
      'Start with a classic 4 or 6-column grid, then customize as needed.',
      'Save analyzed grids to My Grids for quick reuse.',
      'Export your grid library as JSON backup before major Figma updates.',
    ],
  },
  {
    id: 'ai-analysis',
    title: '🤖 AI Analysis',
    content: [
      {
        heading: 'How It Works',
        text: 'Claude Vision analyzes your image to detect underlying grid structures, including columns, gutters, margins, and layout patterns.',
      },
      {
        heading: 'Best Results',
        text: 'Works best on designs with clear vertical alignment, consistent spacing, and visible content blocks. Abstract or organic layouts may not be detected.',
      },
      {
        heading: 'API Key',
        text: 'Requires your own Anthropic API key. Enter it once and it\'s securely stored in your browser.',
      },
    ],
  },
]

export const HelpPanel: React.FC<HelpPanelProps> = ({ isOpen, onClose, isDark }) => {
  const theme = isDark ? styles.dark : styles.light
  const [expandedSection, setExpandedSection] = React.useState<string | null>('getting-started')
  
  // Close on Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])
  
  if (!isOpen) return null
  
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
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div style={{
        width: '100%',
        maxWidth: '480px',
        maxHeight: '80vh',
        backgroundColor: theme.bg,
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 700,
            color: theme.text,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <span>📚</span> Grid System Guide
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              color: theme.textMuted,
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
        
        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 24px',
        }}>
          {HELP_SECTIONS.map(section => (
            <div key={section.id} style={{ marginBottom: '16px' }}>
              {/* Section Header */}
              <button
                onClick={() => setExpandedSection(
                  expandedSection === section.id ? null : section.id
                )}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: theme.sectionBg,
                  color: theme.text,
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  textAlign: 'left',
                }}
              >
                {section.title}
                <span style={{
                  transform: expandedSection === section.id ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}>
                  ▼
                </span>
              </button>
              
              {/* Section Content */}
              {expandedSection === section.id && (
                <div style={{
                  padding: '16px',
                  marginTop: '8px',
                  backgroundColor: theme.sectionBg,
                  borderRadius: '10px',
                }}>
                  {/* Regular content */}
                  {section.content?.map((item, idx) => (
                    <div key={idx} style={{ marginBottom: idx < section.content!.length - 1 ? '12px' : 0 }}>
                      <h4 style={{
                        margin: '0 0 4px 0',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: theme.text,
                      }}>
                        {item.heading}
                      </h4>
                      <p style={{
                        margin: 0,
                        fontSize: '11px',
                        lineHeight: 1.5,
                        color: theme.textMuted,
                      }}>
                        {item.text}
                      </p>
                    </div>
                  ))}
                  
                  {/* Keyboard shortcuts */}
                  {section.shortcuts?.map((shortcut, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 0',
                        borderBottom: idx < section.shortcuts!.length - 1 
                          ? `1px solid ${theme.border}` 
                          : 'none',
                      }}
                    >
                      <span style={{
                        display: 'flex',
                        gap: '4px',
                      }}>
                        {shortcut.keys.map((key, i) => (
                          <React.Fragment key={i}>
                            <kbd style={{
                              padding: '3px 8px',
                              borderRadius: '4px',
                              backgroundColor: theme.codeBg,
                              color: theme.text,
                              fontSize: '10px',
                              fontWeight: 600,
                              fontFamily: 'monospace',
                            }}>
                              {key}
                            </kbd>
                            {i < shortcut.keys.length - 1 && (
                              <span style={{ color: theme.textMuted, fontSize: '10px' }}>+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        color: theme.textMuted,
                      }}>
                        {shortcut.action}
                      </span>
                    </div>
                  ))}
                  
                  {/* Definitions */}
                  {section.definitions?.map((def, idx) => (
                    <div key={idx} style={{ marginBottom: idx < section.definitions!.length - 1 ? '10px' : 0 }}>
                      <dt style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: theme.text,
                        marginBottom: '2px',
                      }}>
                        {def.term}
                      </dt>
                      <dd style={{
                        margin: 0,
                        fontSize: '10px',
                        lineHeight: 1.4,
                        color: theme.textMuted,
                      }}>
                        {def.definition}
                      </dd>
                    </div>
                  ))}
                  
                  {/* Tips */}
                  {section.tips?.map((tip, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        marginBottom: idx < section.tips!.length - 1 ? '8px' : 0,
                      }}
                    >
                      <span style={{ color: '#f59e0b', fontSize: '12px' }}>•</span>
                      <span style={{
                        fontSize: '11px',
                        lineHeight: 1.4,
                        color: theme.textMuted,
                      }}>
                        {tip}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        
        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${theme.border}`,
          textAlign: 'center',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 32px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Help Button Component
// ============================================

interface HelpButtonProps {
  onClick: () => void
  isDark: boolean
}

export const HelpButton: React.FC<HelpButtonProps> = ({ onClick, isDark }) => {
  return (
    <button
      onClick={onClick}
      title="Help & Documentation"
      style={{
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        border: `1px solid ${isDark ? '#404040' : '#e5e5e5'}`,
        backgroundColor: 'transparent',
        color: isDark ? '#a3a3a3' : '#666666',
        fontSize: '14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      ?
    </button>
  )
}

export default HelpPanel


