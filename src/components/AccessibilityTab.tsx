import * as React from 'react';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { analyzeContrast, type ContrastResult, type APCAUseCase } from '../lib/accessibility';
import { simulateCVDHex, CVD_INFO, type CVDType } from '../lib/colorBlindness';
import { validatePluginToUIMessage } from '../lib/messageValidation';
import { consumeRequestId, createRequestId } from '../lib/requestId';
import { useOptionalWorkspaceState } from '../lib/workspaceState';

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
 * APCA use-case guide badge
 */
const APCAUseCaseBadge: React.FC<{
  useCase: APCAUseCase;
  styles: ReturnType<typeof getStyles>;
}> = ({ useCase, styles }) => {
  const config = {
    'preferred-body': { color: styles.success, label: 'Preferred body text' },
    'minimum-body': { color: styles.success, label: 'Minimum body text' },
    'fluent-text': { color: styles.warning, label: 'Fluent text' },
    'large-text': { color: styles.warning, label: 'Large text only' },
    'non-content-text': { color: styles.warning, label: 'Non-content text only' },
    'non-text': { color: styles.textMuted, label: 'Non-text only' },
    'below-guide': { color: styles.error, label: 'Below guide' },
  };

  return (
    <span
      style={{
        padding: '3px 8px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 600,
        backgroundColor: `${config[useCase].color}20`,
        color: config[useCase].color,
      }}
    >
      {config[useCase].label}
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

const APCA_BASIC_REFERENCE_LEVELS = [
  { lc: 90, label: 'Preferred Body Text', detail: '16px' },
  { lc: 75, label: 'Minimum Body Text', detail: '18px' },
  { lc: 60, label: 'Minimum Fluent text', detail: '24px' },
  { lc: 45, label: 'Minimum Large text', detail: '42px' },
  { lc: 30, label: 'Minimum Any text', detail: 'non-content text only' },
  { lc: 15, label: 'Invisibility point', detail: 'certain non-text only' },
] as const;

// ============================================
// Contrast Checker Section
// ============================================

const ContrastChecker: React.FC<{
  styles: ReturnType<typeof getStyles>;
  recentColors?: Array<{ hex: string; name: string }>;
}> = ({ styles, recentColors = [] }) => {
  const [foreground, setForeground] = useState('#1a1a1a');
  const [background, setBackground] = useState('#ffffff');
  const [selectionPending, setSelectionPending] = useState(false);
  const [selectionStatus, setSelectionStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const latestSelectionRequest = useRef<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: unknown }>) => {
      const validation = validatePluginToUIMessage(event.data?.pluginMessage);
      if (!validation.valid || validation.message.type !== 'accessibility-selection-result') {
        return;
      }

      const message = validation.message;
      if (message.requestId !== latestSelectionRequest.current) return;
      if (!consumeRequestId(message.requestId)) return;
      latestSelectionRequest.current = null;

      setSelectionPending(false);
      if (message.success) {
        setForeground(message.foreground);
        setBackground(message.background);
        const sources = `${message.foregroundSource} on ${message.backgroundSource}`;
        setSelectionStatus({ success: true, message: `${sources} · sRGB document` });
      } else {
        setSelectionStatus({
          success: false,
          message: message.error,
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (latestSelectionRequest.current) {
        consumeRequestId(latestSelectionRequest.current);
        latestSelectionRequest.current = null;
      }
    };
  }, []);

  const handleUseSelection = useCallback(() => {
    if (latestSelectionRequest.current) {
      consumeRequestId(latestSelectionRequest.current);
    }
    const requestId = createRequestId('accessibility-selection');
    latestSelectionRequest.current = requestId;
    setSelectionPending(true);
    setSelectionStatus(null);
    parent.postMessage(
      { pluginMessage: { type: 'get-selection-for-accessibility', requestId } },
      '*'
    );
  }, []);

  const contrastResult = useMemo<ContrastResult | null>(() => {
    try {
      return analyzeContrast(foreground, background);
    } catch {
      return null;
    }
  }, [foreground, background]);

  const referenceTableSize = contrastResult?.apca.minimumFontSize ?? null;

  return (
    <Card styles={styles}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        <div style={{ flex: 1 }}>
          <SectionHeader styles={styles}>Contrast Checker</SectionHeader>
        </div>
        <button
          type="button"
          onClick={handleUseSelection}
          disabled={selectionPending}
          style={{
            border: `1px solid ${styles.inputBorder}`,
            borderRadius: '6px',
            padding: '6px 9px',
            backgroundColor: styles.inputBg,
            color: styles.text,
            cursor: selectionPending ? 'wait' : 'pointer',
            fontSize: '10px',
            fontWeight: 600,
          }}
        >
          {selectionPending ? 'Reading…' : 'Use Selection'}
        </button>
      </div>

      {selectionStatus && (
        <div
          role={selectionStatus.success ? 'status' : 'alert'}
          style={{
            padding: '7px 8px',
            marginBottom: '12px',
            borderRadius: '6px',
            backgroundColor: selectionStatus.success ? `${styles.success}18` : `${styles.error}18`,
            color: selectionStatus.success ? styles.success : styles.error,
            fontSize: '10px',
            lineHeight: 1.4,
          }}
        >
          {selectionStatus.message}
        </div>
      )}

      {/* Color Inputs */}
      <div style={{ margin: '-4px 0 8px', color: styles.textMuted, fontSize: '10px' }}>
        Manual hex and accepted selection values are evaluated as sRGB.
      </div>
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

      {recentColors.length > 0 && (
        <div style={{ margin: '-6px 0 14px' }}>
          <div style={{ marginBottom: '5px', color: styles.textMuted, fontSize: '10px' }}>
            Recent colors · choose foreground
          </div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {recentColors.map(color => (
              <button
                key={color.hex}
                type="button"
                title={`${color.name} ${color.hex}`}
                aria-label={`Use ${color.name} ${color.hex} as foreground`}
                onClick={() => setForeground(color.hex)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '5px',
                  border: `1px solid ${styles.border}`,
                  backgroundColor: color.hex,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          marginBottom: '6px',
          fontSize: '11px',
          fontWeight: 600,
          color: styles.textMuted,
        }}
      >
        APCA 0.1.9 Reference-Table Size at Weight 400 (Barlow)
      </div>

      <div
        data-apca-reference-metadata="true"
        style={{
          padding: '10px 12px',
          borderRadius: '8px',
          backgroundColor: styles.bg,
          color: styles.text,
          marginBottom: '16px',
          border: `1px solid ${styles.border}`,
          fontSize: '11px',
          lineHeight: 1.45,
        }}
      >
        {referenceTableSize === null
          ? 'No practical normal-weight content-text size is listed at this Lc.'
          : `Barlow 400 reference-table result: ${referenceTableSize}px.`}{' '}
        Numeric supplemental metadata only; Teul does not render an APCA font-size example or claim
        APCA Compatible integration.
      </div>

      {/* Results */}
      {contrastResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* WCAG 2.2 */}
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: styles.textMuted,
                marginBottom: '6px',
              }}
            >
              WCAG 2.2 pair thresholds
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
                AAA {contrastResult.wcag.aaa ? 'pass' : 'fail'}
              </Badge>
              <Badge variant={contrastResult.wcag.aa ? 'success' : 'neutral'} styles={styles}>
                AA {contrastResult.wcag.aa ? 'pass' : 'fail'}
              </Badge>
              <Badge variant={contrastResult.wcag.aaLarge ? 'success' : 'error'} styles={styles}>
                AA large text {contrastResult.wcag.aaLarge ? 'pass' : 'fail'}
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
              APCA 0.1.9 perceptual Lc (experimental)
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
                Lc {contrastResult.apca.lc > 0 ? '+' : ''}
                {contrastResult.apca.lc.toFixed(1)}
              </span>
              <APCAUseCaseBadge useCase={contrastResult.apca.useCase} styles={styles} />
            </div>
            <div style={{ marginTop: '6px', fontSize: '10px', color: styles.textMuted }}>
              Supplemental beta metric for self-illuminated sRGB web content; not a WCAG conformance
              method. Text/background order and polarity matter.{' '}
              <a
                href="https://git.apcacontrast.com/documentation/WhyAPCA"
                target="_blank"
                rel="noreferrer"
                style={{ color: styles.text }}
              >
                Why APCA
              </a>
              {' · '}
              <a
                href="https://git.apcacontrast.com/documentation/APCAeasyIntro"
                target="_blank"
                rel="noreferrer"
                style={{ color: styles.text }}
              >
                use-case guide
              </a>
              {' · '}
              <a
                href="https://git.apcacontrast.com/documentation/minimum_compliance"
                target="_blank"
                rel="noreferrer"
                style={{ color: styles.text }}
              >
                integration limits
              </a>
              {' · '}
              <a
                href="https://github.com/Myndex/SAPC-APCA/discussions"
                target="_blank"
                rel="noreferrer"
                style={{ color: styles.text }}
              >
                questions and discussion
              </a>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', color: styles.text }}>
              {APCA_BASIC_REFERENCE_LEVELS.map(level => (
                <div key={level.lc} style={{ marginBottom: '2px' }}>
                  Lc {level.lc}: {level.label} — {level.detail}
                </div>
              ))}
            </div>
            <div style={{ marginTop: '4px', fontSize: '10px', color: styles.textMuted }}>
              Public-beta reference-table levels for Barlow 400. Typeface, rendering, spacing,
              context, and user needs can require more contrast; see the adjacent use-case guide for
              fuller explanations.
            </div>
          </div>
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
        <strong>Tip:</strong> Blue and orange can remain distinguishable for many viewers, but
        verify the specific colors and do not rely on color alone.
      </div>
    </Card>
  );
};

// ============================================
// Main Component
// ============================================

export const AccessibilityTab: React.FC<AccessibilityTabProps> = ({ isDark }) => {
  const styles = getStyles(isDark);
  const workspace = useOptionalWorkspaceState();

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
        <ContrastChecker styles={styles} recentColors={workspace?.state.recentColors} />

        {/* CVD Simulator */}
        <CVDSimulator styles={styles} />
      </div>
    </div>
  );
};
