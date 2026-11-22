import * as React from 'react';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { analyzeContrast, type ContrastResult, type APCAUseCase } from '../lib/accessibility';
import { simulateCVDHex, CVD_INFO, type CVDType } from '../lib/colorBlindness';
import { validatePluginToUIMessage } from '../lib/messageValidation';
import { consumeRequestId, createRequestId } from '../lib/requestId';
import { useOptionalWorkspaceState } from '../lib/workspaceState';
import type { NormalizedDocumentColorProfile } from '../types/messages';
import { themeFor, type ThemeTokens, type as typeScale } from '../lib/theme';
import { ArrowLeftRight, X } from './TeulIcons';
import { Disclosure, Notice, SectionLabel, buttonStyle, monoStyle } from './TeulUI';
import { DISPLAY_P3_WARNING } from './MorePanel';

interface AccessibilityTabProps {
  isDark: boolean;
  documentColorProfile?: NormalizedDocumentColorProfile;
}

const APCA_BASIC_REFERENCE_LEVELS = [
  { lc: 90, label: 'Preferred Body Text', detail: '16px' },
  { lc: 75, label: 'Minimum Body Text', detail: '18px' },
  { lc: 60, label: 'Minimum Fluent text', detail: '24px' },
  { lc: 45, label: 'Minimum Large text', detail: '42px' },
  { lc: 30, label: 'Minimum Any text', detail: 'non-content text only' },
  { lc: 15, label: 'Invisibility point', detail: 'certain non-text only' },
] as const;

const CVD_TYPES = Object.keys(CVD_INFO) as CVDType[];

/** Short strip labels; the full name, prevalence and description stay one click away. */
const CVD_SHORT_NAME: Record<CVDType, string> = {
  normal: 'Normal vision',
  protanopia: 'Protanopia',
  protanomaly: 'Protanomaly',
  deuteranopia: 'Deuteranopia',
  deuteranomaly: 'Deuteranomaly',
  tritanopia: 'Severe tritanomaly approximation',
  tritanomaly: 'Tritanomaly',
  achromatopsia: 'Achromatopsia',
};

/** APCA use-case badge. */
const APCAUseCaseBadge: React.FC<{ useCase: APCAUseCase; theme: ThemeTokens }> = ({
  useCase,
  theme,
}) => {
  const config = {
    'preferred-body': { color: theme.ok, label: 'Preferred body text' },
    'minimum-body': { color: theme.ok, label: 'Minimum body text' },
    'fluent-text': { color: theme.warnText, label: 'Fluent text' },
    'large-text': { color: theme.warnText, label: 'Large text only' },
    'non-content-text': { color: theme.warnText, label: 'Non-content text only' },
    'non-text': { color: theme.textMuted, label: 'Non-text only' },
    'below-guide': { color: theme.no, label: 'Below guide' },
  };

  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '6px',
        border: `1px solid ${theme.border}`,
        fontSize: typeScale.meta,
        fontWeight: 600,
        color: config[useCase].color,
      }}
    >
      {config[useCase].label}
    </span>
  );
};

/** A hex field with its native color picker swatch. */
const ColorField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  theme: ThemeTokens;
}> = ({ label, value, onChange, theme }) => {
  const hexId = React.useId();
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        color: theme.textMuted,
        fontSize: typeScale.meta,
      }}
    >
      <label htmlFor={hexId}>{label}</label>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          height: '32px',
          padding: '0 6px',
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          backgroundColor: theme.inputBg,
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            position: 'relative',
            width: '20px',
            height: '20px',
            flex: 'none',
            borderRadius: '5px',
            backgroundColor: value,
            boxShadow: `inset 0 0 0 1px ${theme.borderStrong}`,
            overflow: 'hidden',
          }}
        >
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
            onChange={e => onChange(e.target.value)}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0,
              cursor: 'pointer',
              width: '100%',
              height: '100%',
              border: 0,
              padding: 0,
            }}
            aria-label={`Select ${label.toLowerCase()} color`}
          />
        </span>
        <input
          id={hexId}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          aria-label={`${label} hex color`}
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            background: 'none',
            color: theme.text,
            outline: 'none',
            fontSize: typeScale.body,
            ...monoStyle,
          }}
        />
      </span>
    </div>
  );
};

export const AccessibilityTab: React.FC<AccessibilityTabProps> = ({
  isDark,
  documentColorProfile = 'unknown',
}) => {
  const theme = themeFor(isDark);
  const workspace = useOptionalWorkspaceState();
  const recentColors = workspace?.state.recentColors ?? [];

  const [foreground, setForeground] = useState('#1a1a1a');
  const [background, setBackground] = useState('#ffffff');
  const [selectionPending, setSelectionPending] = useState(false);
  const [selectionStatus, setSelectionStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const latestSelectionRequest = useRef<string | null>(null);

  const [cvdType, setCvdType] = useState<CVDType>('deuteranopia');
  const [severity, setSeverity] = useState(100);
  const [testColors, setTestColors] = useState([
    '#ff0000', // Red
    '#00ff00', // Green
    '#0000ff', // Blue
    '#ffff00', // Yellow
    '#ff00ff', // Magenta
  ]);

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
  const isAnomaly = cvdType.includes('anomaly');
  const anomalySeverity = severity / 100;
  const simulate = (hex: string, type: CVDType) => {
    try {
      return simulateCVDHex(hex, {
        type,
        severity: type.includes('anomaly') ? anomalySeverity : 1.0,
      });
    } catch {
      return hex;
    }
  };

  const simulatedColors = useMemo(
    () =>
      testColors.map(hex =>
        simulateCVDHex(hex, { type: cvdType, severity: isAnomaly ? anomalySeverity : 1.0 })
      ),
    [testColors, cvdType, isAnomaly, anomalySeverity]
  );

  const results = contrastResult
    ? [
        { label: 'Body text, AA', pass: contrastResult.wcag.aa, need: '4.5:1' },
        { label: 'Body text, AAA', pass: contrastResult.wcag.aaa, need: '7:1' },
        { label: 'Large text, AA', pass: contrastResult.wcag.aaLarge, need: '3:1' },
      ]
    : [];

  const paragraph: React.CSSProperties = {
    margin: 0,
    color: theme.textMuted,
    fontSize: typeScale.meta,
    lineHeight: 1.5,
  };
  const link: React.CSSProperties = { color: theme.text };

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        backgroundColor: theme.bg,
        color: theme.text,
        padding: '12px 14px 20px',
        boxSizing: 'border-box',
      }}
    >
      {/* Answer first: the pair itself, the ratio and three plain results. */}
      <div
        data-teul-contrast-sample=""
        aria-label={`Sample: ${foreground} text on ${background}`}
        role="img"
        style={{
          height: '132px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          backgroundColor: background,
          color: foreground,
          padding: '0 22px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            fontSize: typeScale.sample,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          Aa
        </span>
        <span style={{ fontSize: typeScale.title, marginTop: '8px', lineHeight: 1.25 }}>
          The quick brown fox
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginTop: '14px',
        }}
      >
        <div>
          <span
            data-teul-contrast-ratio=""
            style={{
              display: 'block',
              fontSize: typeScale.display,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {contrastResult ? `${contrastResult.wcag.ratio.toFixed(2)}:1` : '—'}
          </span>
          <span style={{ ...paragraph, display: 'block', marginTop: '4px' }}>
            {contrastResult
              ? 'WCAG 2.2 contrast ratio'
              : 'Enter two six-digit hex colors to check them.'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleUseSelection}
          disabled={selectionPending}
          style={{
            ...buttonStyle(theme, 'primary'),
            cursor: selectionPending ? 'wait' : 'pointer',
          }}
        >
          {selectionPending ? 'Reading…' : 'Use selection'}
        </button>
      </div>

      {selectionStatus && (
        <Notice
          isDark={isDark}
          tone={selectionStatus.success ? 'ok' : 'error'}
          role={selectionStatus.success ? 'status' : 'alert'}
          style={{ marginTop: '10px' }}
        >
          {selectionStatus.message}
        </Notice>
      )}
      {documentColorProfile === 'display-p3' && (
        <Notice isDark={isDark} tone="warn" role="status" style={{ marginTop: '10px' }}>
          {DISPLAY_P3_WARNING}
        </Notice>
      )}

      {contrastResult && (
        <div
          role="group"
          aria-label="WCAG 2.2 pair thresholds"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '8px',
            marginTop: '12px',
          }}
        >
          {results.map(result => (
            <div
              key={result.label}
              data-teul-wcag-result={result.pass ? 'pass' : 'fail'}
              style={{
                padding: '9px 10px',
                borderRadius: '10px',
                border: `1px solid ${theme.border}`,
              }}
            >
              <strong
                style={{
                  display: 'block',
                  color: result.pass ? theme.ok : theme.no,
                  fontSize: typeScale.emphasis,
                  fontWeight: 600,
                  lineHeight: 1.25,
                }}
              >
                {result.pass ? 'Passes' : 'Fails'}
              </strong>
              <span style={{ display: 'block', color: theme.textMuted, fontSize: typeScale.meta }}>
                {result.label}
              </span>
              <span
                style={{
                  display: 'block',
                  color: theme.textMuted,
                  fontSize: typeScale.meta,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                needs {result.need}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginTop: '14px' }}>
        <ColorField label="Text" value={foreground} onChange={setForeground} theme={theme} />
        <button
          type="button"
          aria-label="Swap text and background"
          title="Swap text and background"
          onClick={() => {
            setForeground(background);
            setBackground(foreground);
          }}
          className="teul-hover"
          style={{ ...buttonStyle(theme), width: '32px', padding: 0, flex: 'none' }}
        >
          <ArrowLeftRight size={15} />
        </button>
        <ColorField label="Background" value={background} onChange={setBackground} theme={theme} />
      </div>
      <p style={{ ...paragraph, marginTop: '6px' }}>
        Manual hex and accepted selection values are evaluated as sRGB.
      </p>

      {recentColors.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ ...paragraph, marginBottom: '5px' }}>Recent colors · choose foreground</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {recentColors.map(color => (
              <button
                key={color.hex}
                type="button"
                title={`${color.name} ${color.hex}`}
                aria-label={`Use ${color.name} ${color.hex} as foreground`}
                onClick={() => setForeground(color.hex)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: 0,
                  boxShadow: `inset 0 0 0 1px ${theme.border}`,
                  backgroundColor: color.hex,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Color vision: the pair under every condition at once. */}
      <SectionLabel isDark={isDark} aside="Approximate">
        How others see it
      </SectionLabel>
      <div
        role="group"
        aria-label="Color vision simulation"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' }}
      >
        {CVD_TYPES.map(type => {
          const selected = type === cvdType;
          return (
            <button
              key={type}
              type="button"
              aria-pressed={selected}
              title={`${CVD_INFO[type].name} - ${CVD_INFO[type].prevalence}`}
              data-teul-cvd={type}
              onClick={() => setCvdType(type)}
              style={{
                minWidth: 0,
                // A button centres its content: a two-line name must not push its tile up.
                alignSelf: 'start',
                padding: 0,
                border: 0,
                background: 'none',
                color: theme.textMuted,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  height: '48px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: simulate(background, type),
                  color: simulate(foreground, type),
                  fontSize: '20px',
                  fontWeight: 600,
                  boxShadow: selected
                    ? `0 0 0 2px ${theme.bg}, 0 0 0 3px ${theme.text}`
                    : `inset 0 0 0 1px ${theme.border}`,
                }}
              >
                Aa
              </span>
              <span
                style={{
                  display: 'block',
                  marginTop: '4px',
                  fontSize: typeScale.meta,
                  lineHeight: 1.25,
                  color: selected ? theme.text : theme.textMuted,
                  fontWeight: selected ? 600 : 400,
                }}
              >
                {CVD_SHORT_NAME[type]}
              </span>
            </button>
          );
        })}
      </div>
      <p style={{ ...paragraph, marginTop: '8px' }} data-teul-cvd-description="">
        <strong style={{ color: theme.text, fontWeight: 600 }}>{CVD_INFO[cvdType].name}</strong> ·{' '}
        {CVD_INFO[cvdType].prevalence}. {CVD_INFO[cvdType].description}
      </p>
      {isAnomaly && (
        <label
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr) 40px',
            alignItems: 'center',
            gap: '10px',
            marginTop: '8px',
            color: theme.textMuted,
            fontSize: typeScale.meta,
          }}
        >
          Severity
          <input
            type="range"
            min="0"
            max="100"
            value={severity}
            onChange={e => setSeverity(Number(e.target.value))}
            style={{ width: '100%', accentColor: theme.text }}
            aria-label="Adjust severity level"
          />
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {severity}%
          </span>
        </label>
      )}

      <div style={{ marginTop: '14px', borderBottom: `1px solid ${theme.border}` }}>
        <Disclosure isDark={isDark} summary="Test colors">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <span>Original, then simulated ({CVD_INFO[cvdType].name})</span>
            <button
              type="button"
              onClick={() => setTestColors(prev => [...prev, '#808080'])}
              className="teul-hover"
              style={buttonStyle(theme, 'secondary', { height: 28 })}
              aria-label="Add test color"
            >
              + Add
            </button>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {testColors.map((color, i) => (
              <div
                key={i}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  backgroundColor: color,
                  boxShadow: `inset 0 0 0 1px ${theme.border}`,
                  position: 'relative',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="color"
                  value={color}
                  onChange={e =>
                    setTestColors(prev =>
                      prev.map((item, index) => (index === i ? e.target.value : item))
                    )
                  }
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
                    type="button"
                    onClick={() => setTestColors(prev => prev.filter((_, index) => index !== i))}
                    style={{
                      position: 'absolute',
                      top: '-12px',
                      right: '-12px',
                      width: '28px',
                      height: '28px',
                      padding: 0,
                      border: 0,
                      background: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-label={`Remove color ${i + 1}`}
                  >
                    <span
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: `1px solid ${theme.border}`,
                        backgroundColor: theme.sheetBg,
                        color: theme.text,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <X size={11} />
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            {simulatedColors.map((color, i) => (
              <div
                key={i}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  backgroundColor: color,
                  boxShadow: `inset 0 0 0 1px ${theme.border}`,
                }}
                title={`Simulated: ${color}`}
              />
            ))}
          </div>
          <p style={{ ...paragraph, marginTop: '10px' }}>
            <strong>Tip:</strong> Blue and orange can remain distinguishable for many viewers, but
            verify the specific colors and do not rely on color alone.
          </p>
        </Disclosure>

        <Disclosure isDark={isDark} summary="APCA perceptual contrast (experimental)">
          {contrastResult && (
            <>
              <div style={{ color: theme.textMuted, marginBottom: '4px' }}>
                APCA 0.1.9 perceptual Lc (experimental)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: typeScale.title,
                    fontWeight: 600,
                    color: theme.text,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  Lc {contrastResult.apca.lc > 0 ? '+' : ''}
                  {contrastResult.apca.lc.toFixed(1)}
                </span>
                <APCAUseCaseBadge useCase={contrastResult.apca.useCase} theme={theme} />
              </div>
              <p style={{ ...paragraph, marginTop: '6px' }}>
                Supplemental beta metric for self-illuminated sRGB web content; not a WCAG
                conformance method. Text/background order and polarity matter.{' '}
                <a
                  href="https://git.apcacontrast.com/documentation/WhyAPCA"
                  target="_blank"
                  rel="noreferrer"
                  style={link}
                >
                  Why APCA
                </a>
                {' · '}
                <a
                  href="https://git.apcacontrast.com/documentation/APCAeasyIntro"
                  target="_blank"
                  rel="noreferrer"
                  style={link}
                >
                  use-case guide
                </a>
                {' · '}
                <a
                  href="https://git.apcacontrast.com/documentation/minimum_compliance"
                  target="_blank"
                  rel="noreferrer"
                  style={link}
                >
                  integration limits
                </a>
                {' · '}
                <a
                  href="https://github.com/Myndex/SAPC-APCA/discussions"
                  target="_blank"
                  rel="noreferrer"
                  style={link}
                >
                  questions and discussion
                </a>
              </p>
            </>
          )}
          <div style={{ color: theme.textMuted, margin: '10px 0 4px' }}>
            APCA 0.1.9 Reference-Table Size at Weight 400 (Barlow)
          </div>
          <div
            data-apca-reference-metadata="true"
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              color: theme.text,
              lineHeight: 1.45,
            }}
          >
            {referenceTableSize === null
              ? 'No practical normal-weight content-text size is listed at this Lc.'
              : `Barlow 400 reference-table result: ${referenceTableSize}px.`}{' '}
            Numeric supplemental metadata only; Teul does not render an APCA font-size example or
            claim APCA Compatible integration.
          </div>
          <div style={{ marginTop: '10px', color: theme.text, lineHeight: 1.6 }}>
            {APCA_BASIC_REFERENCE_LEVELS.map(level => (
              <div key={level.lc}>
                Lc {level.lc}: {level.label} — {level.detail}
              </div>
            ))}
          </div>
          <p style={{ ...paragraph, marginTop: '4px' }}>
            Public-beta reference-table levels for Barlow 400. Typeface, rendering, spacing,
            context, and user needs can require more contrast; see the adjacent use-case guide for
            fuller explanations.
          </p>
        </Disclosure>
      </div>
    </div>
  );
};
