/// <reference lib="dom" />

import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { colorData } from './colorData';
import { getContrastRatio, getContrastLevel, colorDistance, rgbToLab } from './lib/utils';
import { ColorSystemModal } from './components/ColorSystemModal';
import { GridSystemTab } from './components/GridSystemTab';

interface Color {
  name: string;
  combinations: number[];
  swatch: number;
  cmyk: number[];
  lab: number[];
  rgb: number[];
  hex: string;
}

interface ColorCombo {
  id: number;
  colors: Color[];
}

const SWATCH_GROUPS = [
  { id: -1, name: 'All' },
  { id: 0, name: 'Reds' },
  { id: 1, name: 'Yellows' },
  { id: 2, name: 'Greens' },
  { id: 3, name: 'Blues' },
  { id: 4, name: 'Purples' },
  { id: 5, name: 'Neutrals' },
];

const calculateCombinations = (color: Color): ColorCombo[] => {
  return color.combinations.map((comboId) => {
    const comboColors = colorData.colors.filter(c => 
      c.combinations.includes(comboId) && c.hex !== color.hex
    );
    return { id: comboId, colors: comboColors };
  });
};

const getTextColor = (rgb: number[]): string => {
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
};

// Contrast Tooltip Component - compact inline tooltip
const ContrastTooltip: React.FC<{
  ratio: number;
  children: React.ReactNode;
  isDark: boolean;
}> = ({ ratio, children, isDark }) => {
  const [show, setShow] = useState(false);
  
  const getLevel = () => {
    if (ratio >= 7) return { level: 'AAA', desc: 'Excellent' };
    if (ratio >= 4.5) return { level: 'AA', desc: 'Good for text' };
    if (ratio >= 3) return { level: 'AA Large', desc: 'Large text only' };
    return { level: 'Fail', desc: 'Not accessible' };
  };
  
  const { level, desc } = getLevel();
  const theme = isDark ? styles.dark : styles.light;
  
  return (
    <div 
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '6px',
          backgroundColor: isDark ? '#0a0a0a' : '#ffffff',
          border: `1px solid ${theme.border}`,
          borderRadius: '6px',
          padding: '8px 10px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 9999,
          fontSize: '10px',
          color: theme.text,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            bottom: '-5px',
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: '8px',
            height: '8px',
            backgroundColor: isDark ? '#0a0a0a' : '#ffffff',
            borderRight: `1px solid ${theme.border}`,
            borderBottom: `1px solid ${theme.border}`,
          }} />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              padding: '1px 5px',
              borderRadius: '3px',
              backgroundColor: ratio >= 4.5 ? '#22c55e' : ratio >= 3 ? '#f59e0b' : '#ef4444',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '9px',
            }}>
              {level}
            </span>
            <span style={{ color: theme.textMuted }}>{desc}</span>
          </div>
        </div>
      )}
    </div>
  );
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

// Styles
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
  }
};

const App: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedColor, setSelectedColor] = useState<Color | null>(null);
  const [selectedSwatch, setSelectedSwatch] = useState(-1);
  const [isDark, setIsDark] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [exportColors, setExportColors] = useState<Color[]>([]);
  
  // Color System Modal state
  const [showColorSystem, setShowColorSystem] = useState(false);
  const [colorSystemColors, setColorSystemColors] = useState<{ hex: string; name: string }[]>([]);
  const [colorSystemName, setColorSystemName] = useState('');
  
  // Main navigation state (Colors vs Grids)
  const [mainTab, setMainTab] = useState<'colors' | 'grids'>('colors');

  const theme = isDark ? styles.dark : styles.light;

  const filteredColors = useMemo(() => {
    let colors = colorData.colors;
    if (selectedSwatch >= 0) colors = colors.filter(c => c.swatch === selectedSwatch);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      colors = colors.filter(c => c.name.toLowerCase().includes(term) || c.hex.toLowerCase().includes(term));
    }
    return colors;
  }, [searchTerm, selectedSwatch]);

  const combinations = useMemo(() => selectedColor ? calculateCombinations(selectedColor) : [], [selectedColor]);

  useEffect(() => {
    window.onmessage = (e) => {
      const msg = e.data.pluginMessage;
      if (msg?.type === 'selection-color') {
        const targetLab = rgbToLab(msg.rgb[0], msg.rgb[1], msg.rgb[2]);
        const closest = colorData.colors.reduce((acc, c) => {
          const dist = colorDistance(c.lab, targetLab);
          return dist < acc.distance ? { color: c, distance: dist } : acc;
        }, { color: null as Color | null, distance: Infinity });
        if (closest.color) setSelectedColor(closest.color);
      }
    };
  }, []);

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

  const iconButtonStyle: React.CSSProperties = {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.cardBg,
    color: theme.text,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: theme.bg,
      color: theme.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Compact Unified Header */}
      <div style={{
        flexShrink: 0,
        padding: '10px 12px',
        borderBottom: `1px solid ${theme.border}`,
        backgroundColor: theme.bg,
      }}>
        {/* Top Row: Logo + Main Tabs + Actions */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
        }}>
          {/* Logo/Brand - compact */}
          <div style={{ 
            fontSize: '13px', 
            fontWeight: 700, 
            color: theme.textMuted,
            minWidth: 'fit-content',
          }}>
            SW
          </div>
          
          {/* Main Tabs - pill style */}
          <div style={{
            flex: 1,
            display: 'flex',
            gap: '2px',
            padding: '3px',
            backgroundColor: theme.inputBg,
            borderRadius: '8px',
          }}>
            <button
              onClick={() => setMainTab('colors')}
              style={{
                flex: 1,
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                transition: 'all 0.15s ease',
                backgroundColor: mainTab === 'colors' ? theme.btnActive : 'transparent',
                color: mainTab === 'colors' ? theme.btnActiveText : theme.textMuted,
              }}
            >
              <span style={{ fontSize: '12px' }}>🎨</span>
              Colors
            </button>
            <button
              onClick={() => setMainTab('grids')}
              style={{
                flex: 1,
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                transition: 'all 0.15s ease',
                backgroundColor: mainTab === 'grids' ? theme.btnActive : 'transparent',
                color: mainTab === 'grids' ? theme.btnActiveText : theme.textMuted,
              }}
            >
              <span style={{ fontSize: '12px' }}>📐</span>
              Grids
            </button>
          </div>
          
          {/* Action Buttons - compact */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {mainTab === 'colors' && selectedColor && (
              <button 
                onClick={() => setSelectedColor(null)} 
                title="Back"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                }}
              >
                ←
              </button>
            )}
            {mainTab === 'colors' && (
              <button 
                onClick={() => {
                  const random = colorData.colors[Math.floor(Math.random() * colorData.colors.length)];
                  setSelectedColor(random);
                }}
                title="Random"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                }}
              >
                ⟳
              </button>
            )}
            <button 
              onClick={() => setIsDark(!isDark)} 
              title="Toggle Theme"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                border: `1px solid ${theme.border}`,
                backgroundColor: 'transparent',
                color: theme.text,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
              }}
            >
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* Color-specific controls (only show when on Colors tab) */}
        {mainTab === 'colors' && (
          <div style={{ marginTop: '8px' }}>
            <input
              type="text"
              placeholder="Search colors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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

            {!selectedColor && (
              <div style={{ display: 'flex', gap: '3px', marginTop: '6px' }}>
                {SWATCH_GROUPS.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedSwatch(g.id)}
                    style={{
                      flex: 1,
                      padding: '5px 2px',
                      borderRadius: '5px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '10px',
                      fontWeight: 600,
                      backgroundColor: selectedSwatch === g.id ? theme.btnActive : theme.btnBg,
                      color: selectedSwatch === g.id ? theme.btnActiveText : theme.text,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: mainTab === 'grids' ? '0' : '16px' }}>
        {mainTab === 'grids' ? (
          <GridSystemTab isDark={isDark} />
        ) : !selectedColor ? (
          // Color Grid
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {filteredColors.map(color => {
              const textColor = getTextColor(color.rgb);
              const combos = calculateCombinations(color);
              return (
                <div
                  key={color.hex}
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
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.03)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <div style={{ fontWeight: 700, fontSize: '11px', color: textColor, marginBottom: '2px', lineHeight: 1.2 }}>
                    {color.name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', color: textColor, opacity: 0.8, fontFamily: 'monospace' }}>
                      {color.hex.toUpperCase()}
                    </span>
                    <span style={{
                      fontSize: '9px',
                      color: textColor,
                      backgroundColor: 'rgba(0,0,0,0.15)',
                      padding: '1px 5px',
                      borderRadius: '8px',
                      fontWeight: 600,
                    }}>
                      {combos.length}
                    </span>
                  </div>
                </div>
              );
            })}
            {filteredColors.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: theme.textMuted }}>
                No colors found
              </div>
            )}
          </div>
        ) : (
          // Detail View
          <div>
            {/* Hero */}
            <div style={{
              backgroundColor: selectedColor.hex,
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '16px',
            }}>
              <h2 style={{
                fontSize: '24px',
                fontWeight: 800,
                color: getTextColor(selectedColor.rgb),
                margin: '0 0 8px 0',
              }}>
                {selectedColor.name}
              </h2>
              <p style={{
                fontSize: '14px',
                color: getTextColor(selectedColor.rgb),
                opacity: 0.8,
                margin: 0,
                fontFamily: 'monospace',
              }}>
                {selectedColor.hex.toUpperCase()}
              </p>
            </div>

            {/* Color Values */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              marginBottom: '16px',
            }}>
              {[
                { label: 'RGB', value: selectedColor.rgb.join(', ') },
                { label: 'CMYK', value: selectedColor.cmyk.join(', ') },
                { label: 'HEX', value: selectedColor.hex },
              ].map(item => (
                <div
                  key={item.label}
                  style={{
                    backgroundColor: theme.cardBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    padding: '12px',
                    cursor: item.label === 'HEX' ? 'pointer' : 'default',
                  }}
                  onClick={() => item.label === 'HEX' && copyToClipboard(item.value, item.value)}
                >
                  <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px', fontWeight: 600 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '12px', fontFamily: 'monospace', color: theme.text }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '24px' }}>
              <button
                onClick={() => parent.postMessage({ pluginMessage: { type: 'apply-fill', ...selectedColor } }, '*')}
                style={{
                  ...buttonStyle(true),
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                🎨 Apply Fill
              </button>
              <button
                onClick={() => parent.postMessage({ pluginMessage: { type: 'apply-stroke', ...selectedColor } }, '*')}
                style={{
                  ...buttonStyle(),
                  padding: '14px',
                  border: `1px solid ${theme.border}`,
                }}
              >
                ✏️ Apply Stroke
              </button>
              <button
                onClick={() => parent.postMessage({ pluginMessage: { type: 'create-style', ...selectedColor } }, '*')}
                style={{
                  ...buttonStyle(),
                  padding: '14px',
                  border: `1px solid ${theme.border}`,
                }}
              >
                ✨ Create Style
              </button>
              <button
                onClick={() => copyToClipboard(selectedColor.hex, selectedColor.hex)}
                style={{
                  ...buttonStyle(),
                  padding: '14px',
                  border: `1px solid ${theme.border}`,
                }}
              >
                📋 Copy Hex
              </button>
            </div>

            {/* Combinations */}
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: theme.textMuted, marginBottom: '12px' }}>
              {combinations.length} COMBINATIONS
            </h3>

            {combinations.map((combo, idx) => {
              return (
                <div
                  key={combo.id}
                  style={{
                    backgroundColor: theme.cardBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted }}>
                      Set {idx + 1}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => {
                          const allColors = [selectedColor, ...combo.colors].map(c => ({ hex: c.hex, name: c.name }));
                          setColorSystemColors(allColors);
                          setColorSystemName(`${selectedColor.name} Palette`);
                          setShowColorSystem(true);
                        }}
                        style={{
                          ...buttonStyle(),
                          padding: '6px 12px',
                          fontSize: '11px',
                          border: `1px solid ${theme.border}`,
                          backgroundColor: '#3b82f6',
                          color: '#ffffff',
                        }}
                      >
                        🎨 System
                      </button>
                      <button
                        onClick={() => { setExportColors([selectedColor, ...combo.colors]); setShowExport(true); }}
                        style={{
                          ...buttonStyle(),
                          padding: '6px 12px',
                          fontSize: '11px',
                          border: `1px solid ${theme.border}`,
                        }}
                      >
                        📥 Export
                      </button>
                    </div>
                  </div>

                  {/* Swatches */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        backgroundColor: selectedColor.hex,
                        cursor: 'pointer',
                        boxShadow: `0 0 0 3px ${theme.bg}, 0 0 0 5px ${selectedColor.hex}`,
                      }}
                      onClick={() => copyToClipboard(selectedColor.hex, selectedColor.hex)}
                      title={`${selectedColor.name} - Click to copy`}
                    />
                    {combo.colors.map(c => (
                      <div
                        key={c.hex}
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '8px',
                          backgroundColor: c.hex,
                          cursor: 'pointer',
                          transition: 'transform 0.1s ease',
                        }}
                        onClick={() => copyToClipboard(c.hex, c.hex)}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        title={`${c.name} - Click to copy`}
                      />
                    ))}
                  </div>

                  {/* Contrast ratios */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {combo.colors.map(c => {
                      const ratio = getContrastRatio(selectedColor.rgb, c.rgb);
                      const isGood = ratio >= 4.5;
                      const isOk = ratio >= 3;
                      return (
                        <ContrastTooltip key={c.hex} ratio={ratio} isDark={isDark}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: '4px',
                              backgroundColor: isGood ? '#22c55e' : isOk ? '#f59e0b' : '#6b7280',
                              color: '#ffffff',
                              cursor: 'help',
                            }}
                          >
                            {ratio.toFixed(1)}:1
                          </span>
                        </ContrastTooltip>
                      );
                    })}
                  </div>

                  {/* Gradient buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {['LINEAR', 'RADIAL', 'ANGULAR', 'DIAMOND'].map(type => (
                      <button
                        key={type}
                        onClick={() => parent.postMessage({ 
                          pluginMessage: { 
                            type: 'apply-gradient', 
                            gradientType: type, 
                            colors: [selectedColor, ...combo.colors].map(co => ({ hex: co.hex, name: co.name })) 
                          } 
                        }, '*')}
                        style={{
                          ...buttonStyle(),
                          padding: '8px 4px',
                          fontSize: '10px',
                          border: `1px solid ${theme.border}`,
                        }}
                      >
                        {type.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Export Modal */}
      {showExport && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 100,
          }}
          onClick={() => setShowExport(false)}
        >
          <div
            style={{
              backgroundColor: theme.cardBg,
              borderRadius: '16px',
              padding: '20px',
              width: '100%',
              maxWidth: '400px',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: theme.text }}>Export Palette</h3>
              <button
                onClick={() => setShowExport(false)}
                style={{ ...iconButtonStyle, width: '32px', height: '32px', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>

            {[
              { label: 'CSS', data: exportColors.map((c, i) => `--color-${i + 1}: ${c.hex};`).join('\n') },
              { label: 'JSON', data: JSON.stringify(exportColors.map(c => ({ name: c.name, hex: c.hex })), null, 2) },
            ].map(({ label, data }) => (
              <div key={label} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted }}>{label}</span>
                  <button
                    onClick={() => copyToClipboard(data, label)}
                    style={{ ...buttonStyle(), padding: '6px 12px', fontSize: '11px', border: `1px solid ${theme.border}` }}
                  >
                    Copy
                  </button>
                </div>
                <pre style={{
                  backgroundColor: theme.inputBg,
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: '120px',
                  margin: 0,
                  color: theme.text,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {data}
                </pre>
              </div>
            ))}

            <button
              onClick={() => setShowExport(false)}
              style={{ ...buttonStyle(true), width: '100%', padding: '14px' }}
            >
              Done
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
};

const container = document.getElementById('react-page');
if (container) {
  createRoot(container).render(<App />);
}

export default App;
