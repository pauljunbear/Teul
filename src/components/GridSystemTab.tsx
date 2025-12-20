import * as React from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { GridLibrary } from './GridLibrary'
import { GridAnalyzer } from './GridAnalyzer'

const MyGrids: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <div style={{
    padding: '24px',
    textAlign: 'center',
    color: isDark ? '#a3a3a3' : '#666666',
  }}>
    <div style={{ fontSize: '32px', marginBottom: '12px' }}>💾</div>
    <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>My Grids</p>
    <p style={{ fontSize: '12px', opacity: 0.7 }}>
      Your saved custom grids
    </p>
  </div>
)

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
  const theme = isDark ? styles.dark : styles.light
  
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: theme.bg,
    }}>
      {/* Tab Navigation */}
      <div style={{
        flexShrink: 0,
        padding: '12px 16px',
        borderBottom: `1px solid ${theme.border}`,
      }}>
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '4px',
          backgroundColor: theme.tabBg,
          borderRadius: '8px',
        }}>
          {[
            { id: 'library', label: 'Library', icon: '📐' },
            { id: 'analyze', label: 'Analyze', icon: '🔍' },
            { id: 'my-grids', label: 'My Grids', icon: '💾' },
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
            </button>
          ))}
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
    </div>
  )
}

export default GridSystemTab

