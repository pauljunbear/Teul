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
import { validatePluginToUIMessage } from '../lib/messageValidation';
import { themeFor, type as typeScale } from '../lib/theme';
import type { SelectionInfoMessage } from '../types/messages';
import { buttonStyle } from './TeulUI';

interface GridSystemTabProps {
  isDark: boolean;
}

type GridSection = 'library' | 'my-grids';

/**
 * The working-frame status shown beside Library | Saved. It reads the same
 * `selection-info` messages the apply controllers use; it never requests anything.
 */
function selectionStatus(
  selection: SelectionInfoMessage | null,
  strongColor: string
): {
  text: React.ReactNode;
  title: string;
  ready: boolean;
} | null {
  if (!selection) return null;
  if (!selection.hasSelection) {
    return { text: 'Select a frame to apply', title: 'Select a frame to apply', ready: false };
  }
  const targets = selection.eligibleTargets;
  if (targets.length === 0) {
    const text = 'No selected elements can accept layout grids.';
    return { text, title: text, ready: false };
  }
  if (targets.length === 1) {
    const target = targets[0];
    const size = `${Math.round(target.width)} × ${Math.round(target.height)}`;
    return {
      text: (
        <>
          Applying to <strong style={{ fontWeight: 600, color: strongColor }}>{target.name}</strong>{' '}
          · {size}
        </>
      ),
      title: `Applying to ${target.name} · ${size}`,
      ready: true,
    };
  }
  const text = `Applying to ${targets.length} selected targets`;
  return { text, title: text, ready: true };
}

export const GridSystemTab: React.FC<GridSystemTabProps> = ({ isDark }) => {
  const [activeTab, setActiveTab] = React.useState<GridSection>('library');
  const [savedGridCount, setSavedGridCount] = React.useState(0);
  const [showHelp, setShowHelp] = React.useState(false);
  const [selection, setSelection] = React.useState<SelectionInfoMessage | null>(null);
  const theme = themeFor(isDark);

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

  // Mirror the live selection for the status line.
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: unknown }>) => {
      const validation = validatePluginToUIMessage(event.data?.pluginMessage);
      if (!validation.valid || validation.message.type !== 'selection-info') return;
      setSelection(validation.message);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
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

  const status = selectionStatus(selection, theme.text);
  const tabs: Array<{ id: GridSection; label: string; count?: number }> = [
    { id: 'library', label: 'Library' },
    { id: 'my-grids', label: 'Saved', count: savedGridCount || undefined },
  ];

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
      <div
        style={{
          flexShrink: 0,
          padding: '10px 12px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          minWidth: 0,
        }}
      >
        <div
          role="tablist"
          aria-label="Grid sections"
          style={{
            display: 'flex',
            flex: 'none',
            padding: '2px',
            gap: '2px',
            borderRadius: '8px',
            backgroundColor: theme.inputBg,
          }}
        >
          {tabs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`grid-${tab.id}-tab`}
                role="tab"
                aria-selected={active}
                aria-controls={`grid-${tab.id}-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={event => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const nextTab: GridSection =
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
                className={active ? undefined : 'teul-hover'}
                style={{
                  minHeight: '28px',
                  padding: '0 10px',
                  border: 0,
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  backgroundColor: active ? theme.segActive : 'transparent',
                  boxShadow:
                    active && !isDark
                      ? '0 1px 2px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)'
                      : 'none',
                  color: active ? theme.text : theme.textMuted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: typeScale.body,
                  fontWeight: active ? 600 : 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    style={{
                      color: theme.textMuted,
                      fontSize: typeScale.meta,
                      fontWeight: 500,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div
          role="status"
          aria-live="polite"
          title={status?.title}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'right',
            color: status && !status.ready ? theme.warnText : theme.textMuted,
            fontSize: typeScale.meta,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {status?.text}
        </div>

        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="teul-hover"
          style={{
            ...buttonStyle(theme, 'secondary', { height: 28 }),
            width: '28px',
            padding: 0,
            flex: 'none',
            color: theme.textMuted,
          }}
          title="Help (F1)"
          aria-label="Open help and documentation"
        >
          ?
        </button>
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
          minHeight: 0,
          overflow: 'hidden',
          display: activeTab === 'library' ? 'flex' : 'none',
          flexDirection: 'column',
          position: 'relative',
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
          minHeight: 0,
          overflow: 'hidden',
          display: activeTab === 'my-grids' ? 'flex' : 'none',
          flexDirection: 'column',
          position: 'relative',
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
