import * as React from 'react';
import type { GridPreset } from '../types/grid';
import type { GridFitAnalysis } from '../lib/gridFit';
import { GridPreview } from './GridPreview';

interface GridPresetCardProps {
  preset: GridPreset;
  isSelected: boolean;
  onClick: () => void;
  onApply: () => void;
  isDark: boolean;
  fit?: GridFitAnalysis;
}

// ============================================
// Grid Preset Card Component
// ============================================

const styles = {
  light: {
    cardBg: '#ffffff',
    cardBgHover: '#fafafa',
    cardBgSelected: '#f0f7ff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    borderSelected: '#3b82f6',
    tagBg: '#f0f0f0',
    tagText: '#666666',
    btnBg: '#1a1a1a',
    btnText: '#ffffff',
    btnBgHover: '#333333',
  },
  dark: {
    cardBg: '#2a2a2a',
    cardBgHover: '#333333',
    cardBgSelected: '#1e3a5f',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    borderSelected: '#3b82f6',
    tagBg: '#3a3a3a',
    tagText: '#a3a3a3',
    btnBg: '#ffffff',
    btnText: '#1a1a1a',
    btnBgHover: '#e5e5e5',
  },
};

export const GridPresetCard: React.FC<GridPresetCardProps> = ({
  preset,
  isSelected,
  onClick,
  onApply,
  isDark,
  fit,
}) => {
  const theme = isDark ? styles.dark : styles.light;
  const [isHovered, setIsHovered] = React.useState(false);
  const [hasFocusWithin, setHasFocusWithin] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = React.useState(140);
  const fitMessageId = React.useId();

  // Measure card width for responsive SVG
  React.useEffect(() => {
    if (cardRef.current) {
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          // Card width minus padding (12px * 2) minus border (2px * 2)
          setCardWidth(entry.contentRect.width);
        }
      });
      observer.observe(cardRef.current);
      return () => observer.disconnect();
    }
  }, []);

  // Get grid summary - more compact
  const getGridSummary = () => {
    const parts: string[] = [];
    if (preset.config.columns) parts.push(`${preset.config.columns.count} col`);
    if (preset.config.rows) parts.push(`${preset.config.rows.count} row`);
    return (
      parts.join(' × ') || (preset.config.baseline ? `${preset.config.baseline.height}px` : '')
    );
  };

  const previewHeight = Math.min(85, Math.round(cardWidth * 0.65));
  const showApply = fit?.status !== 'fail' && (isHovered || isSelected || hasFocusWithin);
  const failedFitMessage =
    fit?.status === 'fail'
      ? (fit.recommendations[0]?.message ??
        fit.issues[0]?.message ??
        'Adjust the grid or selected frame before applying.')
      : undefined;

  return (
    <div
      ref={cardRef}
      role="group"
      aria-label={`${preset.name} grid preset`}
      onFocusCapture={() => setHasFocusWithin(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setHasFocusWithin(false);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        backgroundColor: isSelected
          ? theme.cardBgSelected
          : isHovered
            ? theme.cardBgHover
            : theme.cardBg,
        border: `1px solid ${isSelected ? theme.borderSelected : isHovered ? theme.text + '20' : theme.border}`,
        borderRadius: '8px',
        padding: '6px',
        position: 'relative',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: isHovered
          ? '0 4px 12px rgba(0,0,0,0.12)'
          : isSelected
            ? '0 2px 6px rgba(59,130,246,0.15)'
            : 'none',
      }}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        aria-describedby={failedFitMessage ? fitMessageId : undefined}
        aria-label={`${preset.name}${fit ? `, ${fit.status} for selected frame` : ''}`}
        onClick={onClick}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          border: 'none',
          borderRadius: '8px',
          background: 'transparent',
          cursor: 'pointer',
        }}
      />

      {/* Preview Thumbnail - compact */}
      <div
        style={{
          marginBottom: '5px',
          borderRadius: '4px',
          overflow: 'hidden',
          backgroundColor: isDark ? '#1e1e1e' : '#e8e8e8',
        }}
      >
        <GridPreview
          config={preset.config}
          width={cardWidth}
          height={previewHeight}
          isDark={isDark}
          referenceDimensions={preset.referenceDimensions}
          applicationMode={preset.applicationMode}
          responsiveWidth={preset.responsiveWidth}
          aspectRatio={preset.aspectRatio}
        />
      </div>

      {/* Title + Summary Row - tighter */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '4px',
          marginBottom: '3px',
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: '10px',
            fontWeight: 600,
            color: theme.text,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {preset.name}
        </h4>
        <span
          style={{
            fontSize: '8px',
            color: theme.textMuted,
            fontFamily: 'monospace',
            flexShrink: 0,
          }}
        >
          {getGridSummary()}
        </span>
      </div>

      {/* Tags Row - minimal */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '2px',
          minHeight: '14px',
        }}
      >
        {preset.tags.slice(0, 2).map(tag => (
          <span
            key={tag}
            style={{
              fontSize: '7px',
              padding: '1px 4px',
              borderRadius: '3px',
              backgroundColor: theme.tagBg,
              color: theme.tagText,
            }}
          >
            {tag}
          </span>
        ))}
        {preset.aspectRatio && (
          <span
            style={{
              fontSize: '7px',
              padding: '1px 4px',
              borderRadius: '3px',
              backgroundColor: isDark ? '#2d4a3e' : '#d4edda',
              color: isDark ? '#7dd3a0' : '#155724',
              fontWeight: 600,
            }}
          >
            {preset.aspectRatio}
          </span>
        )}
        {fit && (
          <span
            style={{
              fontSize: '7px',
              padding: '1px 4px',
              borderRadius: '3px',
              backgroundColor:
                fit.status === 'fit'
                  ? isDark
                    ? '#14532d'
                    : '#dcfce7'
                  : fit.status === 'warning'
                    ? isDark
                      ? '#713f12'
                      : '#fef3c7'
                    : isDark
                      ? '#7f1d1d'
                      : '#fee2e2',
              color:
                fit.status === 'fit'
                  ? isDark
                    ? '#86efac'
                    : '#166534'
                  : fit.status === 'warning'
                    ? isDark
                      ? '#fde68a'
                      : '#92400e'
                    : isDark
                      ? '#fca5a5'
                      : '#b91c1c',
              fontWeight: 700,
            }}
          >
            {fit.status}
          </span>
        )}
      </div>

      {failedFitMessage ? (
        <p
          id={fitMessageId}
          style={{
            margin: '5px 2px 0',
            color: isDark ? '#fca5a5' : '#b91c1c',
            fontSize: '8px',
            lineHeight: 1.35,
          }}
        >
          <strong>Cannot apply.</strong> {failedFitMessage}
        </p>
      ) : (
        showApply && (
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              marginTop: '5px',
            }}
          >
            <button
              type="button"
              onClick={onApply}
              aria-label={`Apply ${preset.name} to selected frame`}
              style={{
                width: '100%',
                padding: '5px 8px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                fontSize: '9px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2563eb')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#3b82f6')}
            >
              Apply
            </button>
          </div>
        )
      )}
    </div>
  );
};
