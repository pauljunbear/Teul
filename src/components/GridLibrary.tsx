import * as React from 'react';
import { GridPresetCard } from './GridPresetCard';
import { SaveGridModal } from './SaveGridModal';
import {
  GRID_PRESETS,
  GRID_CATEGORIES,
  getPresetsByCategory,
  getPresetCountByCategory,
} from '../lib/gridPresets';
import {
  buildCreateGridFrameMessage,
  buildApplyGridMessage,
  getPresetFrameDimensions,
  presetToFrameName,
  scaleGridForFrameSize,
} from '../lib/figmaGrids';
import type { GridPreset, GridCategory } from '../types/grid';

// CSS keyframe animations injected once
const injectStyles = (() => {
  let injected = false;
  return () => {
    if (injected) return;
    injected = true;
    const style = document.createElement('style');
    style.textContent = `
      @keyframes gridFadeIn {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes gridFadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-8px); }
      }
      @keyframes pillFadeIn {
        from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      .grid-card-animate {
        animation: gridFadeIn 0.25s ease-out forwards;
      }
      .grid-header-visible {
        transform: translateY(0);
        opacity: 1;
      }
      .grid-header-hidden {
        transform: translateY(-140px);
        opacity: 0;
      }
      .grid-pill-visible {
        animation: pillFadeIn 0.2s ease-out forwards;
      }
      .grid-category-btn {
        transition: transform 0.1s ease, background-color 0.15s ease, color 0.15s ease;
      }
      .grid-category-btn:hover {
        transform: scale(1.02);
      }
      .grid-category-btn:active {
        transform: scale(0.98);
      }
    `;
    document.head.appendChild(style);
  };
})();

// Hook for scroll direction detection with debouncing
function useScrollDirection() {
  const [scrollDirection, setScrollDirection] = React.useState<'up' | 'down' | null>(null);
  const [isAtTop, setIsAtTop] = React.useState(true);
  const lastScrollYRef = React.useRef(0);
  const rafRef = React.useRef<number | null>(null);

  const updateScrollDirection = React.useCallback((scrollY: number) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      const lastScrollY = lastScrollYRef.current;
      const delta = scrollY - lastScrollY;

      if (Math.abs(delta) > 5) {
        setIsAtTop(scrollY < 10);

        if (scrollY > lastScrollY && scrollY > 50) {
          setScrollDirection('down');
        } else if (scrollY < lastScrollY) {
          setScrollDirection('up');
        }

        lastScrollYRef.current = scrollY;
      }

      rafRef.current = null;
    });
  }, []);

  React.useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { scrollDirection, isAtTop, updateScrollDirection };
}

interface GridLibraryProps {
  isDark: boolean;
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
  },
};

export const GridLibrary: React.FC<GridLibraryProps> = ({ isDark }) => {
  const theme = isDark ? styles.dark : styles.light;
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const { scrollDirection, isAtTop, updateScrollDirection } = useScrollDirection();

  const [selectedCategory, setSelectedCategory] = React.useState<GridCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedPreset, setSelectedPreset] = React.useState<GridPreset | null>(null);
  const [selectionInfo, setSelectionInfo] = React.useState<{
    hasSelection: boolean;
    isFrame: boolean;
    width?: number;
    height?: number;
    name?: string;
  } | null>(null);
  const [showSaveModal, setShowSaveModal] = React.useState(false);

  // Inject CSS animations on mount
  React.useEffect(() => {
    injectStyles();
  }, []);

  const handleScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      updateScrollDirection(e.currentTarget.scrollTop);
    },
    [updateScrollDirection]
  );

  const showHeader = isAtTop || scrollDirection === 'up';

  const filteredPresets = React.useMemo(() => {
    let presets =
      selectedCategory === 'all' ? GRID_PRESETS : getPresetsByCategory(selectedCategory);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      presets = presets.filter(
        p =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.tags.some(t => t.toLowerCase().includes(query))
      );
    }

    return presets;
  }, [selectedCategory, searchQuery]);

  // Listen for selection info from Figma (event-driven, no polling)
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === 'selection-info') {
        setSelectionInfo({
          hasSelection: msg.hasSelection,
          isFrame: msg.isFrame,
          width: msg.width,
          height: msg.height,
          name: msg.name,
        });
      }
    };

    parent.postMessage({ pluginMessage: { type: 'get-selection-for-grid' } }, '*');

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleApplyGrid = (preset: GridPreset) => {
    if (!selectionInfo?.hasSelection) {
      parent.postMessage(
        {
          pluginMessage: {
            type: 'notify',
            text: 'Please select a frame first',
          },
        },
        '*'
      );
      return;
    }

    const targetWidth = selectionInfo.width || 800;
    const targetHeight = selectionInfo.height || 600;
    const presetDimensions = getPresetFrameDimensions(preset);

    const scaledConfig = scaleGridForFrameSize(
      preset.config,
      presetDimensions.width,
      presetDimensions.height,
      targetWidth,
      targetHeight,
      true
    );

    const message = buildApplyGridMessage({
      config: scaledConfig,
      width: targetWidth,
      height: targetHeight,
      replaceExisting: true,
    });

    parent.postMessage({ pluginMessage: message }, '*');
  };

  const handleCreateFrame = (preset: GridPreset) => {
    const { width, height } = getPresetFrameDimensions(preset);

    const message = buildCreateGridFrameMessage({
      config: preset.config,
      frameName: presetToFrameName(preset),
      width,
      height,
      positionNearSelection: true,
    });

    parent.postMessage({ pluginMessage: message }, '*');
  };

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
      {/* Animated Header - hides on scroll down */}
      <div
        className={showHeader ? 'grid-header-visible' : 'grid-header-hidden'}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          backgroundColor: theme.bg,
          boxShadow: !isAtTop ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
          transition: 'transform 0.3s ease, opacity 0.3s ease',
        }}
      >
        {/* Search */}
        <div style={{ padding: '8px 12px 6px' }}>
          <input
            type="text"
            placeholder="Search grids..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.inputBg,
              color: theme.text,
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Category Pills */}
        <div style={{ padding: '2px 12px 8px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
            }}
          >
            {GRID_CATEGORIES.map(cat => {
              const count = getPresetCountByCategory(cat.id);
              const isActive = selectedCategory === cat.id;

              return (
                <button
                  key={cat.id}
                  className="grid-category-btn"
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '4px 7px',
                    borderRadius: '10px',
                    border: isActive ? 'none' : `1px solid ${isDark ? '#333' : '#ddd'}`,
                    cursor: 'pointer',
                    fontSize: '9px',
                    fontWeight: isActive ? 600 : 500,
                    whiteSpace: 'nowrap',
                    backgroundColor: isActive ? theme.categoryActive : 'transparent',
                    color: isActive ? theme.categoryActiveText : theme.textMuted,
                  }}
                >
                  <span style={{ fontSize: '9px' }}>{cat.icon}</span>
                  <span>{cat.name}</span>
                  <span
                    style={{
                      fontSize: '8px',
                      opacity: 0.5,
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selection Status - compact floating pill */}
      {selectionInfo && !selectionInfo.hasSelection && (
        <div
          className="grid-pill-visible"
          style={{
            position: 'absolute',
            top: showHeader ? 125 : 6,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5,
            padding: '4px 10px',
            borderRadius: '12px',
            backgroundColor: isDark ? '#3a2e1e' : '#fef3e6',
            border: `1px solid ${isDark ? '#5a4a2a' : '#fcd34d'}`,
            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
            transition: 'top 0.3s ease',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '9px',
              fontWeight: 500,
              color: isDark ? '#fbbf24' : '#b45309',
            }}
          >
            ⚠ Select a frame to apply
          </p>
        </div>
      )}

      {/* Grid Cards */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingTop: '130px',
          paddingLeft: '8px',
          paddingRight: '8px',
          paddingBottom: '40px',
        }}
      >
        {filteredPresets.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '6px',
            }}
          >
            {filteredPresets.map((preset, index) => (
              <div
                key={preset.id}
                className="grid-card-animate"
                style={{
                  animationDelay: `${index * 0.03}s`,
                  opacity: 0,
                }}
              >
                <GridPresetCard
                  preset={preset}
                  isSelected={selectedPreset?.id === preset.id}
                  onClick={() => setSelectedPreset(preset)}
                  onApply={() => {
                    if (selectionInfo?.hasSelection) {
                      handleApplyGrid(preset);
                    } else {
                      parent.postMessage(
                        {
                          pluginMessage: {
                            type: 'notify',
                            text: 'Select a frame first, or use "Create Frame"',
                          },
                        },
                        '*'
                      );
                      setSelectedPreset(preset);
                    }
                  }}
                  isDark={isDark}
                />
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: theme.textMuted,
              animation: 'gridFadeIn 0.2s ease-out forwards',
            }}
          >
            <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }}>📐</div>
            <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>No grids found</p>
            <p style={{ fontSize: '11px', opacity: 0.6 }}>Try adjusting your search</p>
          </div>
        )}
      </div>

      {/* Selected Preset Info Panel */}
      {selectedPreset && (
        <div
          style={{
            flexShrink: 0,
            padding: '16px',
            borderTop: `1px solid ${theme.border}`,
            backgroundColor: isDark ? '#262626' : '#fafafa',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '12px',
            }}
          >
            <div style={{ flex: 1, marginRight: '12px' }}>
              <h3
                style={{
                  margin: '0 0 4px 0',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: theme.text,
                }}
              >
                {selectedPreset.name}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: '11px',
                  color: theme.textMuted,
                  lineHeight: 1.4,
                }}
              >
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

          <div
            style={{
              display: 'flex',
              gap: '8px',
            }}
          >
            <button
              onClick={() => {
                if (selectionInfo?.hasSelection) {
                  handleApplyGrid(selectedPreset);
                } else {
                  parent.postMessage(
                    {
                      pluginMessage: { type: 'notify', text: 'Select a frame first' },
                    },
                    '*'
                  );
                }
              }}
              disabled={!selectionInfo?.hasSelection}
              style={{
                flex: 1,
                padding: '10px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: selectionInfo?.hasSelection
                  ? '#3b82f6'
                  : isDark
                    ? '#404040'
                    : '#d4d4d4',
                color: selectionInfo?.hasSelection ? '#ffffff' : isDark ? '#666' : '#999',
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
              aria-label="Save grid to My Grids collection"
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
            setShowSaveModal(false);
            parent.postMessage(
              {
                pluginMessage: {
                  type: 'notify',
                  text: `Saved "${selectedPreset.name}" to My Grids`,
                },
              },
              '*'
            );
          }}
        />
      )}
    </div>
  );
};

export default GridLibrary;
