import * as React from 'react';
import type { GridPreset } from '../types/grid';
import type { GridFitAnalysis } from '../lib/gridFit';
import { themeFor, type as typeScale } from '../lib/theme';
import { GridPreview } from './GridPreview';
import { fitTone, gridSummary, previewBox } from './GridSheet';

interface GridPresetCardProps {
  preset: GridPreset;
  isSelected: boolean;
  /** Selects the card; Apply, New Frame and Save live in the detail sheet it opens. */
  onClick: () => void;
  isDark: boolean;
  fit?: GridFitAnalysis;
}

const PREVIEW_HEIGHT = 92;

/** A library card: the grid drawn from its own measurements, its name and short facts. */
export const GridPresetCard: React.FC<GridPresetCardProps> = ({
  preset,
  isSelected,
  onClick,
  isDark,
  fit,
}) => {
  const theme = themeFor(isDark);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = React.useState(132);
  const fitMessageId = React.useId();

  // Measure the card so the preview uses the space it has.
  React.useEffect(() => {
    if (!cardRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) setCardWidth(entry.contentRect.width - 20);
      }
    });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  const box = previewBox(preset, Math.max(60, cardWidth), PREVIEW_HEIGHT);
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
      style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}
    >
      <button
        type="button"
        data-teul-grid-card={preset.id}
        aria-pressed={isSelected}
        aria-describedby={failedFitMessage ? fitMessageId : undefined}
        aria-label={`${preset.name}${fit ? `, ${fit.status} for selected frame` : ''}`}
        onClick={onClick}
        className="teul-card"
        style={{
          width: '100%',
          minWidth: 0,
          flex: 1,
          padding: '10px',
          border: `1px solid ${isSelected ? theme.text : theme.border}`,
          borderRadius: '10px',
          backgroundColor: theme.cardBg,
          color: theme.text,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '2px',
          textAlign: 'left',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            height: `${PREVIEW_HEIGHT}px`,
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ borderRadius: '3px', overflow: 'hidden', display: 'block' }}>
            <GridPreview
              config={preset.config}
              width={box.width}
              height={box.height}
              isDark={isDark}
              referenceDimensions={preset.referenceDimensions}
              applicationMode={preset.applicationMode}
              responsiveWidth={preset.responsiveWidth}
              aspectRatio={preset.aspectRatio}
            />
          </span>
        </span>
        <span
          style={{
            fontSize: typeScale.body,
            fontWeight: 500,
            lineHeight: 1.25,
            overflowWrap: 'anywhere',
          }}
        >
          {preset.name}
        </span>
        <span
          style={{
            color: theme.textMuted,
            fontSize: typeScale.meta,
            lineHeight: 1.35,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {gridSummary(preset.config)}
          {fit && (
            <>
              {' · '}
              <span style={{ color: fitTone(theme, fit.status), fontWeight: 600 }}>
                {fit.status}
              </span>
            </>
          )}
        </span>
      </button>
      {failedFitMessage && (
        <p
          id={fitMessageId}
          style={{
            margin: '4px 2px 0',
            color: theme.no,
            fontSize: typeScale.meta,
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
          title={failedFitMessage}
        >
          <strong style={{ fontWeight: 600 }}>Cannot apply.</strong> {failedFitMessage}
        </p>
      )}
    </div>
  );
};
