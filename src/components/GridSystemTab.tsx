import * as React from 'react';
import { GridLibrary } from './GridLibrary';
import { MyGrids } from './MyGrids';
import {
  getSavedGridCount,
  invalidateGridCache,
  SAVED_GRIDS_CHANGED_EVENT,
} from '../lib/gridStorage';
import { HelpPanel } from './HelpPanel';
import { isAnyModalOpen } from '../lib/useModalAccessibility';

interface GridSystemTabProps {
  isDark: boolean;
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
  },
};

export const GridSystemTab: React.FC<GridSystemTabProps> = ({ isDark }) => {
  const [activeTab, setActiveTab] = React.useState<'library' | 'my-grids'>('library');
  const [savedGridCount, setSavedGridCount] = React.useState(0);
  const [showHelp, setShowHelp] = React.useState(false);
  const theme = isDark ? styles.dark : styles.light;

  // Update saved grid count when tab changes
  React.useEffect(() => {
    let cancelled = false;
    void getSavedGridCount()
      .then(count => {
        if (!cancelled) setSavedGridCount(count);
      })
      .catch(error => {
        console.error('Failed to load saved grid count:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Listen for storage changes
  React.useEffect(() => {
    const handleStorageChange = () => {
      invalidateGridCache();
      void getSavedGridCount()
        .then(setSavedGridCount)
        .catch(error => {
          console.error('Failed to refresh saved grid count:', error);
        });
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(SAVED_GRIDS_CHANGED_EVENT, handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(SAVED_GRIDS_CHANGED_EVENT, handleStorageChange);
    };
  }, []);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isEditable || showHelp || isAnyModalOpen()) return;

      // ? or F1 for help
      if ((e.key === '?' && !e.metaKey && !e.ctrlKey) || e.key === 'F1') {
        e.preventDefault();
        setShowHelp(true);
      }

      // Tab navigation with Cmd/Ctrl + 1/2
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveTab('library');
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveTab('my-grids');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHelp]);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.bg,
        position: 'relative',
      }}
    >
      {/* Compact Sub-Navigation */}
      <div
        style={{
          flexShrink: 0,
          padding: '6px 12px',
          backgroundColor: theme.bg,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          {/* Sub-tabs - text links style */}
          <div
            role="tablist"
            aria-label="Grid sections"
            style={{
              flex: 1,
              display: 'flex',
              gap: '2px',
            }}
          >
            {[
              { id: 'library', label: 'Library', count: undefined },
              { id: 'my-grids', label: 'Saved', count: savedGridCount || undefined },
            ].map(tab => (
              <button
                key={tab.id}
                id={`grid-${tab.id}-tab`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`grid-${tab.id}-panel`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id as 'library' | 'my-grids')}
                onKeyDown={event => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const nextTab =
                    event.key === 'Home'
                      ? 'library'
                      : event.key === 'End'
                        ? 'my-grids'
                        : activeTab === 'library'
                          ? 'my-grids'
                          : 'library';
                  setActiveTab(nextTab);
                  document.getElementById(`grid-${nextTab}-tab`)?.focus();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: activeTab === tab.id ? 600 : 500,
                  transition: 'all 0.15s ease',
                  backgroundColor: activeTab === tab.id ? theme.tabActive : 'transparent',
                  color: activeTab === tab.id ? theme.tabActiveText : theme.tabInactiveText,
                }}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    style={{
                      padding: '1px 5px',
                      borderRadius: '8px',
                      fontSize: '9px',
                      fontWeight: 600,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)',
                      color: theme.tabInactiveText,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Help Button - smaller */}
          <button
            onClick={() => setShowHelp(true)}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '5px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.tabInactiveText,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
            }}
            title="Help (F1)"
            aria-label="Open help and documentation"
          >
            ?
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div
        id="grid-library-panel"
        role="tabpanel"
        aria-labelledby="grid-library-tab"
        hidden={activeTab !== 'library'}
        tabIndex={activeTab === 'library' ? 0 : -1}
        style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: theme.bg,
        }}
      >
        {activeTab === 'library' && <GridLibrary isDark={isDark} />}
      </div>
      <div
        id="grid-my-grids-panel"
        role="tabpanel"
        aria-labelledby="grid-my-grids-tab"
        hidden={activeTab !== 'my-grids'}
        tabIndex={activeTab === 'my-grids' ? 0 : -1}
        style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: theme.bg,
        }}
      >
        {activeTab === 'my-grids' && <MyGrids isDark={isDark} />}
      </div>

      {/* Help Panel */}
      <HelpPanel isOpen={showHelp} onClose={() => setShowHelp(false)} isDark={isDark} />
    </div>
  );
};
