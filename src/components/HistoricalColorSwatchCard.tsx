import * as React from 'react';
import { getAccessibleTextColor } from '../lib/accessibility';

interface HistoricalColorSwatchCardProps {
  color: {
    name: string;
    hex: string;
  };
  onOpen: () => void;
  markerLabel?: string;
  trailingCount?: number;
}

/**
 * Shared rendered-color primitive for Teul's historical browsers.
 *
 * The card derives its text color and WCAG label from the exact foreground and
 * background pair that it renders. Historical source metadata remains owned by
 * each browser and the shared SourceProvenanceDisclosure component.
 */
export const HistoricalColorSwatchCard: React.FC<HistoricalColorSwatchCardProps> = ({
  color,
  onOpen,
  markerLabel,
  trailingCount,
}) => {
  const textContrast = getAccessibleTextColor(color.hex);
  const textColor = textContrast.hex;
  const wcagLabel = textContrast.rating.level === 'Fail' ? null : textContrast.rating.level;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${color.name}, ${color.hex}`}
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
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
      onMouseEnter={event => (event.currentTarget.style.transform = 'scale(1.03)')}
      onMouseLeave={event => (event.currentTarget.style.transform = 'scale(1)')}
    >
      {markerLabel && (
        <span
          aria-label={markerLabel}
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            fontSize: '8px',
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '8px', color: textColor, fontFamily: 'monospace' }}>
          {color.hex.toUpperCase()}
        </span>
        <span style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
          {wcagLabel && (
            <span
              style={{
                fontSize: '7px',
                color: textColor,
                padding: '1px 3px',
                borderRadius: '3px',
                fontWeight: 700,
              }}
              title={`WCAG 2.2 ${wcagLabel} for ${textColor} text on ${color.hex} (${textContrast.contrast.toFixed(1)}:1)`}
            >
              {wcagLabel}
            </span>
          )}
          {trailingCount !== undefined && (
            <span
              aria-label={`${trailingCount} combinations`}
              style={{
                fontSize: '9px',
                color: textColor,
                padding: '1px 5px',
                borderRadius: '8px',
                fontWeight: 600,
              }}
            >
              {trailingCount}
            </span>
          )}
        </span>
      </div>
    </div>
  );
};
