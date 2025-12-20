import * as React from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { GridLibrary } from './GridLibrary'
import { GridAnalyzer } from './GridAnalyzer'
import { MyGrids } from './MyGrids'
import { getSavedGridCount } from '../lib/gridStorage'
import { HelpPanel, HelpButton } from './HelpPanel'
import { ToastProvider, ToastContainer } from './Toast'

interface GridSystemTabProps {
  isDark: boolean
}

const styles = {
  light: {
    bg: '#ffffff',
    cardBg: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    tabBg: '#f5f5f5',
    tabActive: '#ffffff',
    tabActiveText: '#1a1a1a',
    tabInactive: 'transparent',
    tabInactiveText: '#666666',
  },
  dark: {
    bg: '#1a1a1a',
    cardBg: '#262626',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    tabBg: '#262626',
    tabActive: '#404040',
    tabActiveText: '#ffffff',
    tabInactive: 'transparent',
    tabInactiveText: '#a3a3a3',
  }
}

export const GridSystemTab: React.FC<GridSystemTabProps> = ({ isDark }) => {
  const [activeTab, setActiveTab] = React.useState('library')
  const [savedGridCount, setSavedGridCount] = React.useState(0)
  const [showHelp, setShowHelp] = React.useState(false)
  const theme = isDark ? styles.dark : styles.light
  
  // Update saved grid count when tab changes
  React.useEffect(() => {
    setSavedGridCount(getSavedGridCount())
  }, [activeTab])
  
  // Listen for storage changes
  React.useEffect(() => {
    const handleStorageChange = () => {
      setSavedGridCount(getSavedGridCount())
    }
    
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])
  
  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ? or F1 for help
      if ((e.key === '?' && !e.metaKey && !e.ctrlKey) || e.key === 'F1') {
        e.preventDefault()
        setShowHelp(true)
      }
      
      // Tab navigation with Cmd/Ctrl + 1/2/3
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        if (e.key === '1') {
          e.preventDefault()
          setActiveTab('library')
        } else if (e.key === '2') {
          e.preventDefault()
          setActiveTab('analyze')
        } else if (e.key === '3') {
          e.preventDefault()
          setActiveTab('my-grids')
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  return (
    <ToastProvider>
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.bg,
        position: 'relative',
      }}>
        {/* Tab Navigation */}
        <div style={{
          flexShrink: 0,
          padding: '12px 16px',
          borderBottom: `1px solid ${theme.border}`,
        }}>
          <div style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}>
            <div style={{
              flex: 1,
              display: 'flex',
              gap: '4px',
              padding: '4px',
              backgroundColor: theme.tabBg,
              borderRadius: '8px',
            }}>
              {[
                { id: 'library', label: 'Library', icon: '📐', count: undefined },
                { id: 'analyze', label: 'Analyze', icon: '🔍', count: undefined },
                { id: 'my-grids', label: 'My Grids', icon: '💾', count: savedGridCount || undefined },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    transition: 'all 0.15s ease',
                    backgroundColor: activeTab === tab.id ? theme.tabActive : theme.tabInactive,
                    color: activeTab === tab.id ? theme.tabActiveText : theme.tabInactiveText,
                    boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{tab.icon}</span>
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontWeight: 700,
                      backgroundColor: activeTab === tab.id 
                        ? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)')
                        : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'),
                      color: activeTab === tab.id ? theme.tabActiveText : theme.tabInactiveText,
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            
            {/* Help Button */}
            <HelpButton onClick={() => setShowHelp(true)} isDark={isDark} />
          </div>
        </div>

        {/* Tab Content */}
        <div style={{
          flex: 1,
          overflow: 'hidden',
          backgroundColor: theme.bg,
        }}>
          {activeTab === 'library' && <GridLibrary isDark={isDark} />}
          {activeTab === 'analyze' && <GridAnalyzer isDark={isDark} />}
          {activeTab === 'my-grids' && <MyGrids isDark={isDark} />}
        </div>
        
        {/* Help Panel */}
        <HelpPanel
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          isDark={isDark}
        />
        
        {/* Toast Notifications */}
        <ToastContainer isDark={isDark} />
      </div>
    </ToastProvider>
  )
}

export default GridSystemTab

