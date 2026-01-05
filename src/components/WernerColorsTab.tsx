import * as React from 'react';
import { useState, useMemo } from 'react';
import { wernerColors, WERNER_GROUPS, WernerColor, getRelatedColors } from '../wernerColorData';
import { ColorSystemModal } from './ColorSystemModal';
import { AboutPanel, WERNER_ABOUT_CONTENT } from './AboutPanel';

interface WernerColorsTabProps {
  isDark: boolean;
}

const styles = {
  light: {
    bg: '#ffffff',
    cardBg: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    inputBg: '#f5f5f5',
    btnBg: '#f0f0f0',
    btnHover: '#e5e5e5',
    btnActive: '#1a1a1a',
    btnActiveText: '#ffffff',
  },
  dark: {
    bg: '#1a1a1a',
    cardBg: '#262626',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    inputBg: '#333333',
    btnBg: '#333333',
    btnHover: '#404040',
    btnActive: '#ffffff',
    btnActiveText: '#1a1a1a',
  },
};

const getTextColor = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
};

const copyToClipboard = (text: string, label: string) => {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    parent.postMessage({ pluginMessage: { type: 'notify', text: `Copied ${label}` } }, '*');
  } catch {
    parent.postMessage({ pluginMessage: { type: 'notify', text: 'Copy failed' } }, '*');
  }
  document.body.removeChild(textarea);
};

export const WernerColorsTab: React.FC<WernerColorsTabProps> = ({ isDark }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedColor, setSelectedColor] = useState<WernerColor | null>(null);
  const [selectedGroup, setSelectedGroup] = useState(-1);

  // Color System Modal state
  const [showColorSystem, setShowColorSystem] = useState(false);
  const [colorSystemColors, setColorSystemColors] = useState<{ hex: string; name: string }[]>([]);
  const [colorSystemName, setColorSystemName] = useState('');

  // About panel state
  const [showAbout, setShowAbout] = useState(false);

  const theme = isDark ? styles.dark : styles.light;

  const filteredColors = useMemo(() => {
    let colors = wernerColors;
    if (selectedGroup >= 0) colors = colors.filter(c => c.groupId === selectedGroup);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      colors = colors.filter(
        c =>
          c.name.toLowerCase().includes(term) ||
          c.hex.toLowerCase().includes(term) ||
          c.group.toLowerCase().includes(term) ||
          c.description.toLowerCase().includes(term)
      );
    }
    return colors;
  }, [searchTerm, selectedGroup]);

  const relatedColors = useMemo(
    () => (selectedColor ? getRelatedColors(selectedColor) : []),
    [selectedColor]
  );

  const buttonStyle = (active = false): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    backgroundColor: active ? theme.btnActive : theme.btnBg,
    color: active ? theme.btnActiveText : theme.text,
    transition: 'all 0.15s ease',
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search and filters */}
      <div style={{ padding: '12px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search Werner's colors..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
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
          <button
            onClick={() => setShowAbout(true)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.textMuted,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 600,
              flexShrink: 0,
            }}
            title="About Werner's Colors"
          >
            ?
          </button>
        </div>

        {!selectedColor && (
          <div
            style={{
              display: 'flex',
              gap: '3px',
              marginTop: '8px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {WERNER_GROUPS.slice(0, 6).map(g => (
              <button
                key={g.id}
                onClick={() => setSelectedGroup(g.id)}
                style={{
                  flex: '1 1 auto',
                  minWidth: '48px',
                  padding: '5px 4px',
                  borderRadius: '5px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '9px',
                  fontWeight: 600,
                  backgroundColor: selectedGroup === g.id ? theme.btnActive : theme.btnBg,
                  color: selectedGroup === g.id ? theme.btnActiveText : theme.text,
                  transition: 'all 0.15s ease',
                }}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
        {!selectedColor && (
          <div
            style={{
              display: 'flex',
              gap: '3px',
              marginTop: '3px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {WERNER_GROUPS.slice(6).map(g => (
              <button
                key={g.id}
                onClick={() => setSelectedGroup(g.id)}
                style={{
                  flex: '1 1 auto',
                  minWidth: '48px',
                  padding: '5px 4px',
                  borderRadius: '5px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '9px',
                  fontWeight: 600,
                  backgroundColor: selectedGroup === g.id ? theme.btnActive : theme.btnBg,
                  color: selectedGroup === g.id ? theme.btnActiveText : theme.text,
                  transition: 'all 0.15s ease',
                }}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Back button when viewing detail */}
      {selectedColor && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.border}` }}>
          <button
            onClick={() => setSelectedColor(null)}
            style={{
              ...buttonStyle(),
              padding: '6px 12px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            ← Back to colors
          </button>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {!selectedColor ? (
          // Color Grid
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {filteredColors.map(color => {
              const textColor = getTextColor(color.hex);
              return (
                <div
                  key={color.id}
                  onClick={() => setSelectedColor(color)}
                  style={{
                    backgroundColor: color.hex,
                    borderRadius: '8px',
                    padding: '10px',
                    cursor: 'pointer',
                    minHeight: '70px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                    transition: 'transform 0.15s ease',
                    position: 'relative',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {color.characteristic && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        fontSize: '8px',
                        backgroundColor: 'rgba(0,0,0,0.2)',
                        color: textColor,
                        padding: '2px 5px',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}
                    >
                      ★
                    </span>
                  )}
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '10px',
                      color: textColor,
                      marginBottom: '2px',
                      lineHeight: 1.2,
                    }}
                  >
                    {color.name}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '8px',
                        color: textColor,
                        opacity: 0.8,
                        fontFamily: 'monospace',
                      }}
                    >
                      {color.hex.toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontSize: '8px',
                        color: textColor,
                        backgroundColor: 'rgba(0,0,0,0.15)',
                        padding: '1px 4px',
                        borderRadius: '6px',
                        fontWeight: 600,
                      }}
                    >
                      {color.relatedColors.length}
                    </span>
                  </div>
                </div>
              );
            })}
            {filteredColors.length === 0 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '40px',
                  color: theme.textMuted,
                }}
              >
                No colors found
              </div>
            )}
          </div>
        ) : (
          // Detail View
          <div>
            {/* Hero */}
            <div
              style={{
                backgroundColor: selectedColor.hex,
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: '10px',
                      color: getTextColor(selectedColor.hex),
                      opacity: 0.7,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {selectedColor.group}
                  </span>
                  <h2
                    style={{
                      fontSize: '22px',
                      fontWeight: 800,
                      color: getTextColor(selectedColor.hex),
                      margin: '4px 0 8px 0',
                    }}
                  >
                    {selectedColor.name}
                  </h2>
                  <p
                    style={{
                      fontSize: '13px',
                      color: getTextColor(selectedColor.hex),
                      opacity: 0.9,
                      margin: 0,
                      fontFamily: 'monospace',
                    }}
                  >
                    {selectedColor.hex.toUpperCase()}
                  </p>
                </div>
                {selectedColor.characteristic && (
                  <span
                    style={{
                      fontSize: '10px',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      color: getTextColor(selectedColor.hex),
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontWeight: 700,
                    }}
                  >
                    ★ Characteristic
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            <div
              style={{
                backgroundColor: theme.cardBg,
                border: `1px solid ${theme.border}`,
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '12px',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  color: theme.textMuted,
                  marginBottom: '6px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Description
              </div>
              <p
                style={{
                  fontSize: '12px',
                  color: theme.text,
                  margin: 0,
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                }}
              >
                &ldquo;{selectedColor.description}&rdquo;
              </p>
            </div>

            {/* Natural Examples */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                marginBottom: '12px',
              }}
            >
              {[
                { label: '🦁 Animal', value: selectedColor.animal },
                { label: '🌿 Vegetable', value: selectedColor.vegetable },
                { label: '💎 Mineral', value: selectedColor.mineral },
              ]
                .filter(item => item.value)
                .map(item => (
                  <div
                    key={item.label}
                    style={{
                      backgroundColor: theme.cardBg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                      padding: '10px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '9px',
                        color: theme.textMuted,
                        marginBottom: '4px',
                        fontWeight: 600,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: theme.text,
                        lineHeight: 1.3,
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
            </div>

            {/* Actions */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px',
                marginBottom: '16px',
              }}
            >
              <button
                onClick={() =>
                  parent.postMessage(
                    {
                      pluginMessage: {
                        type: 'apply-fill',
                        name: selectedColor.name,
                        hex: selectedColor.hex,
                        rgb: [
                          parseInt(selectedColor.hex.slice(1, 3), 16),
                          parseInt(selectedColor.hex.slice(3, 5), 16),
                          parseInt(selectedColor.hex.slice(5, 7), 16),
                        ],
                      },
                    },
                    '*'
                  )
                }
                style={{
                  ...buttonStyle(true),
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                🎨 Apply Fill
              </button>
              <button
                onClick={() =>
                  parent.postMessage(
                    {
                      pluginMessage: {
                        type: 'apply-stroke',
                        name: selectedColor.name,
                        hex: selectedColor.hex,
                        rgb: [
                          parseInt(selectedColor.hex.slice(1, 3), 16),
                          parseInt(selectedColor.hex.slice(3, 5), 16),
                          parseInt(selectedColor.hex.slice(5, 7), 16),
                        ],
                      },
                    },
                    '*'
                  )
                }
                style={{
                  ...buttonStyle(),
                  padding: '12px',
                  border: `1px solid ${theme.border}`,
                }}
              >
                ✏️ Apply Stroke
              </button>
              <button
                onClick={() =>
                  parent.postMessage(
                    {
                      pluginMessage: {
                        type: 'create-style',
                        name: `Werner/${selectedColor.group}/${selectedColor.name}`,
                        hex: selectedColor.hex,
                        rgb: [
                          parseInt(selectedColor.hex.slice(1, 3), 16),
                          parseInt(selectedColor.hex.slice(3, 5), 16),
                          parseInt(selectedColor.hex.slice(5, 7), 16),
                        ],
                      },
                    },
                    '*'
                  )
                }
                style={{
                  ...buttonStyle(),
                  padding: '12px',
                  border: `1px solid ${theme.border}`,
                }}
              >
                ✨ Create Style
              </button>
              <button
                onClick={() => copyToClipboard(selectedColor.hex, selectedColor.hex)}
                style={{
                  ...buttonStyle(),
                  padding: '12px',
                  border: `1px solid ${theme.border}`,
                }}
              >
                📋 Copy Hex
              </button>
            </div>

            {/* Color System Button */}
            <button
              onClick={() => {
                const allColors = [
                  { hex: selectedColor.hex, name: selectedColor.name },
                  ...relatedColors.map(c => ({ hex: c.hex, name: c.name })),
                ];
                setColorSystemColors(allColors);
                setColorSystemName(`Werner/${selectedColor.name}`);
                setShowColorSystem(true);
              }}
              style={{
                ...buttonStyle(),
                width: '100%',
                padding: '12px',
                marginBottom: '16px',
                border: `1px solid ${theme.border}`,
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              🎨 Generate Color System (Radix)
            </button>

            {/* Related Colors */}
            {relatedColors.length > 0 && (
              <>
                <h3
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: theme.textMuted,
                    marginBottom: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {relatedColors.length} Related Colors
                </h3>

                <div
                  style={{
                    backgroundColor: theme.cardBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '12px',
                    padding: '14px',
                  }}
                >
                  {/* Swatches */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      marginBottom: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '8px',
                        backgroundColor: selectedColor.hex,
                        cursor: 'pointer',
                        boxShadow: `0 0 0 3px ${theme.bg}, 0 0 0 5px ${selectedColor.hex}`,
                        flexShrink: 0,
                      }}
                      onClick={() => copyToClipboard(selectedColor.hex, selectedColor.hex)}
                      title={`${selectedColor.name} - Click to copy`}
                    />
                    {relatedColors.map(c => (
                      <div
                        key={c.id}
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '8px',
                          backgroundColor: c.hex,
                          cursor: 'pointer',
                          transition: 'transform 0.1s ease',
                          flexShrink: 0,
                        }}
                        onClick={() => setSelectedColor(c)}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                        title={`${c.name} - Click to view`}
                      />
                    ))}
                  </div>

                  {/* Related color names */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {relatedColors.map(c => (
                      <span
                        key={c.id}
                        onClick={() => setSelectedColor(c)}
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: theme.inputBg,
                          color: theme.text,
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = theme.btnHover)}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = theme.inputBg)}
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Credits */}
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: theme.inputBg,
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  fontSize: '9px',
                  color: theme.textMuted,
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                From Werner&apos;s Nomenclature of Colours (1814)
                <br />
                Digitized by Nicholas Rougeux
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Color System Modal */}
      <ColorSystemModal
        isOpen={showColorSystem}
        onClose={() => setShowColorSystem(false)}
        colors={colorSystemColors}
        combinationName={colorSystemName}
        isDark={isDark}
        onGenerate={() => {
          // Modal handles sending the message with computed scales
        }}
      />

      {/* About Panel */}
      <AboutPanel
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
        isDark={isDark}
        {...WERNER_ABOUT_CONTENT}
      />
    </div>
  );
};

export default WernerColorsTab;
