import * as React from 'react';
import { useState, useMemo } from 'react';
import { wernerColors, WERNER_GROUPS, WernerColor, getWernerTextRecord } from '../wernerColorData';
import { ColorSystemModal } from './ColorSystemModal';
import { AboutPanel, WERNER_ABOUT_CONTENT } from './AboutPanel';
import { copyToClipboard } from '../lib/clipboard';
import { styles } from '../lib/theme';
import { getWCAGContrastHex, getWCAGRating } from '../lib/accessibility';
import { WERNER_SOURCE_PROVENANCE } from '../lib/sourceProvenance';
import type { NormalizedDocumentColorProfile } from '../types/messages';
import { SourceProvenanceDisclosure } from './SourceProvenanceDisclosure';

interface WernerColorsTabProps {
  isDark: boolean;
  documentColorProfile?: NormalizedDocumentColorProfile;
}

const getTextColor = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
};

export const WernerColorsTab: React.FC<WernerColorsTabProps> = ({
  isDark,
  documentColorProfile = 'unknown',
}) => {
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
    let filtered = wernerColors;
    if (selectedGroup >= 0) filtered = filtered.filter(c => c.groupId === selectedGroup);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        c =>
          c.name.toLowerCase().includes(term) ||
          c.hex.toLowerCase().includes(term) ||
          c.group.toLowerCase().includes(term) ||
          Object.values(c.text.normalized).some(value => value.toLowerCase().includes(term)) ||
          Object.values(c.text.source).some(value => value.toLowerCase().includes(term))
      );
    }
    return filtered;
  }, [searchTerm, selectedGroup]);

  const selectedText = useMemo(
    () => (selectedColor ? getWernerTextRecord(selectedColor) : null),
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
            aria-label="Learn about Werner's Nomenclature of Colours"
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
        <SourceProvenanceDisclosure provenance={WERNER_SOURCE_PROVENANCE} isDark={isDark} />
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
              // Calculate best WCAG contrast (against white or black)
              const contrastWhite = getWCAGContrastHex(color.hex, '#ffffff');
              const contrastBlack = getWCAGContrastHex(color.hex, '#000000');
              const bestContrast = Math.max(contrastWhite, contrastBlack);
              const wcagRating = getWCAGRating(bestContrast);
              const wcagLabel = wcagRating.aaa
                ? 'AAA'
                : wcagRating.aa
                  ? 'AA'
                  : wcagRating.aaLarge
                    ? 'AA Large'
                    : '';
              return (
                <div
                  key={color.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${color.name}, ${color.hex}`}
                  onClick={() => setSelectedColor(color)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedColor(color);
                    }
                  }}
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
                    {wcagLabel && (
                      <span
                        style={{
                          fontSize: '7px',
                          color: textColor,
                          backgroundColor: 'rgba(255,255,255,0.2)',
                          padding: '1px 3px',
                          borderRadius: '3px',
                          fontWeight: 700,
                          opacity: 0.9,
                        }}
                        title={`WCAG 2.2 ${wcagLabel} contrast threshold with black or white text (${bestContrast.toFixed(1)}:1)`}
                      >
                        {wcagLabel}
                      </span>
                    )}
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
                &ldquo;{selectedText?.normalized.description}&rdquo;
              </p>
              <div style={{ marginTop: '8px', color: theme.textMuted, fontSize: '9px' }}>
                Reviewed source transcription is preserved separately from normalized display text.
                Every difference is recorded below.
              </div>
            </div>

            {selectedText && selectedText.normalizations.length > 0 && (
              <details
                style={{
                  backgroundColor: theme.cardBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: '12px',
                  color: theme.text,
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}>
                  Source/display differences ({selectedText.normalizations.length})
                </summary>
                <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
                  {selectedText.normalizations.map(normalization => (
                    <div
                      key={normalization.field}
                      style={{
                        borderTop: `1px solid ${theme.border}`,
                        paddingTop: '8px',
                        fontSize: '9px',
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ textTransform: 'capitalize' }}>{normalization.field}</strong>
                      <div style={{ color: theme.textMuted }}>
                        Source: &ldquo;{normalization.source}&rdquo;
                      </div>
                      <div>Display: &ldquo;{normalization.normalized}&rdquo;</div>
                      <div style={{ marginTop: '4px', color: theme.textMuted }}>
                        {normalization.reasons.join(' ')}
                        {normalization.evidence.length > 0 &&
                          ` Evidence: ${normalization.evidence.join(' ')}`}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

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
                { label: '🦁 Animal', value: selectedText?.normalized.animal },
                { label: '🌿 Vegetable', value: selectedText?.normalized.vegetable },
                { label: '💎 Mineral', value: selectedText?.normalized.mineral },
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
                setColorSystemColors([{ hex: selectedColor.hex, name: selectedColor.name }]);
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
              🎨 Generate Radix-inspired System
            </button>

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
                Patrick Syme&apos;s 1821 second edition
                <br />
                Independently transcribed and sampled from the public-domain Getty scan
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
        documentColorProfile={documentColorProfile}
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
