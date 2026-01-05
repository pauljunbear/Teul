import * as React from 'react';
import { useState, useCallback, useMemo } from 'react';
import {
  analyzeContrast,
  getAPCARating,
  getFontRecommendations,
  type ContrastResult,
  type APCARating,
} from '../lib/accessibility';
import { simulateCVDHex, CVD_INFO, type CVDType } from '../lib/colorBlindness';
import { hexToRgb, rgbToHex } from '../lib/utils';

// ============================================
// Types
// ============================================

interface AccessibilityTabProps {
  isDark: boolean;
}

// ============================================
// Theme Styles
// ============================================

const getStyles = (isDark: boolean) => ({
  bg: isDark ? '#1a1a1a' : '#ffffff',
  cardBg: isDark ? '#262626' : '#f5f5f5',
  text: isDark ? '#ffffff' : '#1a1a1a',
  textMuted: isDark ? '#a3a3a3' : '#666666',
  border: isDark ? '#404040' : '#e5e5e5',
  inputBg: isDark ? '#333333' : '#ffffff',
  inputBorder: isDark ? '#555555' : '#cccccc',
  success: isDark ? '#22c55e' : '#16a34a',
  warning: isDark ? '#eab308' : '#ca8a04',
  error: isDark ? '#ef4444' : '#dc2626',
  gold: '#fbbf24',
  silver: '#9ca3af',
  bronze: '#d97706',
});

// ============================================
// Components
// ============================================

/**
 * Color Input with Preview
 */
const ColorInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  styles: ReturnType<typeof getStyles>;
}> = ({ label, value, onChange, styles }) => (
  <div style={{ flex: 1 }}>
    <label
      style={{
        display: 'block',
        fontSize: '11px',
        fontWeight: 600,
        color: styles.textMuted,
        marginBottom: '4px',
      }}
    >
      {label}
    </label>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '6px',
          backgroundColor: value,
          border: `1px solid ${styles.border}`,
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            cursor: 'pointer',
            width: '100%',
            height: '100%',
          }}
          aria-label={`Select ${label.toLowerCase()} color`}
        />
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          flex: 1,
          padding: '6px 8px',
          borderRadius: '6px',
          border: `1px solid ${styles.inputBorder}`,
          backgroundColor: styles.inputBg,
          color: styles.text,
          fontSize: '12px',
          fontFamily: 'monospace',
        }}
        placeholder="#000000"
        aria-label={`${label} hex color`}
      />
    </div>
  </div>
);

/**
 * Badge Component
 */
const Badge: React.FC<{
  children: React.ReactNode;
  variant: 'success' | 'warning' | 'error' | 'neutral';
  styles: ReturnType<typeof getStyles>;
}> = ({ children, variant, styles }) => {
  const colors = {
    success: { bg: `${styles.success}20`, text: styles.success },
    warning: { bg: `${styles.warning}20`, text: styles.warning },
    error: { bg: `${styles.error}20`, text: styles.error },
    neutral: { bg: styles.cardBg, text: styles.textMuted },
  };

  return (
    <span
      style={{
        padding: '3px 8px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 600,
        backgroundColor: colors[variant].bg,
        color: colors[variant].text,
      }}
    >
      {children}
    </span>
  );
};

/**
 * APCA Rating Badge
 */
const APCARatingBadge: React.FC<{
  rating: APCARating;
  styles: ReturnType<typeof getStyles>;
}> = ({ rating, styles }) => {
  const config = {
    gold: { color: styles.gold, label: 'Gold' },
    silver: { color: styles.silver, label: 'Silver' },
    bronze: { color: styles.bronze, label: 'Bronze' },
    fail: { color: styles.error, label: 'Fail' },
  };

  return (
    <span
      style={{
        padding: '3px 8px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 600,
        backgroundColor: `${config[rating].color}20`,
        color: config[rating].color,
      }}
    >
      {config[rating].label}
    </span>
  );
};

/**
 * Section Header
 */
const SectionHeader: React.FC<{
  children: React.ReactNode;
  styles: ReturnType<typeof getStyles>;
}> = ({ children, styles }) => (
  <h3
    style={{
      margin: '0 0 12px 0',
      fontSize: '13px',
      fontWeight: 700,
      color: styles.text,
    }}
  >
    {children}
  </h3>
);

/**
 * Card Container
 */
const Card: React.FC<{
  children: React.ReactNode;
  styles: ReturnType<typeof getStyles>;
}> = ({ children, styles }) => (
  <div
    style={{
      padding: '16px',
      backgroundColor: styles.cardBg,
      borderRadius: '10px',
      marginBottom: '12px',
    }}
  >
    {children}
  </div>
);

// ============================================
// Contrast Checker Section
// ============================================

const ContrastChecker: React.FC<{
  styles: ReturnType<typeof getStyles>;
}> = ({ styles }) => {
  const [foreground, setForeground] = useState('#1a1a1a');
  const [background, setBackground] = useState('#ffffff');

  const contrastResult = useMemo<ContrastResult | null>(() => {
    try {
      return analyzeContrast(foreground, background);
    } catch {
      return null;
    }
  }, [foreground, background]);

  const fontRecs = useMemo(() => {
    if (!contrastResult) return [];
    return getFontRecommendations(contrastResult.apca.lc);
  }, [contrastResult]);

  return (
    <Card styles={styles}>
      <SectionHeader styles={styles}>Contrast Checker</SectionHeader>

      {/* Color Inputs */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <ColorInput
          label="Foreground"
          value={foreground}
          onChange={setForeground}
          styles={styles}
        />
        <ColorInput
          label="Background"
          value={background}
          onChange={setBackground}
          styles={styles}
        />
      </div>

      {/* Preview */}
      <div
        style={{
          padding: '16px',
          borderRadius: '8px',
          backgroundColor: background,
          color: foreground,
          textAlign: 'center',
          marginBottom: '16px',
          border: `1px solid ${styles.border}`,
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Sample Text</div>
        <div style={{ fontSize: '12px' }}>The quick brown fox jumps over the lazy dog</div>
      </div>

      {/* Results */}
      {contrastResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* WCAG 2.1 */}
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: styles.textMuted,
                marginBottom: '6px',
              }}
            >
              WCAG 2.1
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: styles.text,
                }}
              >
                {contrastResult.wcag.ratio.toFixed(2)}:1
              </span>
              <Badge variant={contrastResult.wcag.aaa ? 'success' : 'neutral'} styles={styles}>
                AAA
              </Badge>
              <Badge variant={contrastResult.wcag.aa ? 'success' : 'neutral'} styles={styles}>
                AA
              </Badge>
              <Badge variant={contrastResult.wcag.aaLarge ? 'success' : 'error'} styles={styles}>
                Large Text
              </Badge>
            </div>
          </div>

          {/* APCA */}
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: styles.textMuted,
                marginBottom: '6px',
              }}
            >
              APCA (WCAG 3.0)
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: styles.text,
                }}
              >
                Lc {Math.abs(contrastResult.apca.lc).toFixed(1)}
              </span>
              <APCARatingBadge rating={contrastResult.apca.rating} styles={styles} />
            </div>
          </div>

          {/* Font Recommendations */}
          {fontRecs.length > 0 && fontRecs[0].minSize !== Infinity && (
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: styles.textMuted,
                  marginBottom: '6px',
                }}
              >
                Font Recommendations
              </div>
              <div style={{ fontSize: '12px', color: styles.text }}>
                {fontRecs.map((rec, i) => (
                  <div key={i} style={{ marginBottom: '2px' }}>
                    {rec.minSize}px {rec.weight}: {rec.description}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

// ============================================
// CVD Simulator Section
// ============================================

const CVDSimulator: React.FC<{
  styles: ReturnType<typeof getStyles>;
}> = ({ styles }) => {
  const [cvdType, setCvdType] = useState<CVDType>('deuteranopia');
  const [severity, setSeverity] = useState(100);
  const [testColors, setTestColors] = useState([
    '#ff0000', // Red
    '#00ff00', // Green
    '#0000ff', // Blue
    '#ffff00', // Yellow
    '#ff00ff', // Magenta
  ]);

  const isAnomaly = cvdType.includes('anomaly');
  const actualSeverity = isAnomaly ? severity / 100 : 1.0;

  const simulatedColors = useMemo(() => {
    return testColors.map(hex => simulateCVDHex(hex, { type: cvdType, severity: actualSeverity }));
  }, [testColors, cvdType, actualSeverity]);

  const handleColorChange = useCallback((index: number, value: string) => {
    setTestColors(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addColor = useCallback(() => {
    setTestColors(prev => [...prev, '#808080']);
  }, []);

  const removeColor = useCallback((index: number) => {
    setTestColors(prev => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <Card styles={styles}>
      <SectionHeader styles={styles}>Color Vision Simulation</SectionHeader>

      {/* CVD Type Selector */}
      <div style={{ marginBottom: '12px' }}>
        <label
          style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: styles.textMuted,
            marginBottom: '4px',
          }}
        >
          Condition Type
        </label>
        <select
          value={cvdType}
          onChange={e => setCvdType(e.target.value as CVDType)}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '6px',
            border: `1px solid ${styles.inputBorder}`,
            backgroundColor: styles.inputBg,
            color: styles.text,
            fontSize: '12px',
          }}
          aria-label="Select color vision deficiency type"
        >
          {Object.entries(CVD_INFO).map(([type, info]) => (
            <option key={type} value={type}>
              {info.name} - {info.prevalence}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: '11px',
          color: styles.textMuted,
          marginBottom: '12px',
          padding: '8px',
          backgroundColor: styles.bg,
          borderRadius: '6px',
        }}
      >
        {CVD_INFO[cvdType].description}
      </div>

      {/* Severity Slider (for anomalies) */}
      {isAnomaly && (
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              fontWeight: 600,
              color: styles.textMuted,
              marginBottom: '4px',
            }}
          >
            <span>Severity</span>
            <span>{severity}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={severity}
            onChange={e => setSeverity(Number(e.target.value))}
            style={{ width: '100%' }}
            aria-label="Adjust severity level"
          />
        </div>
      )}

      {/* Color Swatches */}
      <div style={{ marginBottom: '12px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 600, color: styles.textMuted }}>
            Test Colors
          </span>
          <button
            onClick={addColor}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: `1px solid ${styles.border}`,
              backgroundColor: 'transparent',
              color: styles.textMuted,
              fontSize: '10px',
              cursor: 'pointer',
            }}
            aria-label="Add test color"
          >
            + Add
          </button>
        </div>

        {/* Original vs Simulated */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Original Row */}
          <div>
            <div style={{ fontSize: '10px', color: styles.textMuted, marginBottom: '4px' }}>
              Original
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {testColors.map((color, i) => (
                <div
                  key={i}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '6px',
                    backgroundColor: color,
                    border: `1px solid ${styles.border}`,
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="color"
                    value={color}
                    onChange={e => handleColorChange(i, e.target.value)}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: 0,
                      cursor: 'pointer',
                      width: '100%',
                      height: '100%',
                    }}
                    aria-label={`Test color ${i + 1}`}
                  />
                  {testColors.length > 2 && (
                    <button
                      onClick={() => removeColor(i)}
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: styles.error,
                        color: '#fff',
                        fontSize: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      aria-label={`Remove color ${i + 1}`}
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Simulated Row */}
          <div>
            <div style={{ fontSize: '10px', color: styles.textMuted, marginBottom: '4px' }}>
              Simulated ({CVD_INFO[cvdType].name})
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {simulatedColors.map((color, i) => (
                <div
                  key={i}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '6px',
                    backgroundColor: color,
                    border: `1px solid ${styles.border}`,
                  }}
                  title={`Simulated: ${color}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div
        style={{
          fontSize: '11px',
          color: styles.textMuted,
          padding: '8px',
          backgroundColor: styles.bg,
          borderRadius: '6px',
        }}
      >
        <strong>Tip:</strong> Blue and orange are safe color combinations for most forms of color
        blindness.
      </div>
    </Card>
  );
};

// ============================================
// Main Component
// ============================================

export const AccessibilityTab: React.FC<AccessibilityTabProps> = ({ isDark }) => {
  const styles = getStyles(isDark);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: styles.bg,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '12px' }}>
        {/* Header */}
        <div style={{ marginBottom: '12px' }}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: '16px',
              fontWeight: 700,
              color: styles.text,
            }}
          >
            Accessibility Tools
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '11px',
              color: styles.textMuted,
            }}
          >
            Check contrast ratios and preview colors under different vision conditions
          </p>
        </div>

        {/* Contrast Checker */}
        <ContrastChecker styles={styles} />

        {/* CVD Simulator */}
        <CVDSimulator styles={styles} />
      </div>
    </div>
  );
};

export default AccessibilityTab;
