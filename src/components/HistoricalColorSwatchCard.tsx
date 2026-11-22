import * as React from 'react';
import { getAccessibleTextColor } from '../lib/accessibility';
import { type as typeScale } from '../lib/theme';

interface HistoricalColorSwatchCardProps {
  color: {
    name: string;
    hex: string;
  };
  onOpen: () => void;
  markerLabel?: string;
  trailingCount?: number;
  selected?: boolean;
  /** Ring color drawn around a selected tile (the canvas and text tokens). */
  ringColors?: { gap: string; ring: string };
}

/**
 * The WCAG 2.2 statement for the text Teul draws on a swatch: the exact foreground and
 * background pair, with the canonical level name. Shown in the color's detail sheet.
 */
export function swatchTextRating(hex: string): { label: string | null; title: string } {
  const textContrast = getAccessibleTextColor(hex);
  const label = textContrast.rating.level === 'Fail' ? null : textContrast.rating.level;
  return {
    label,
    title: `WCAG 2.2 ${label ?? 'Fail'} for ${textContrast.hex} text on ${hex} (${textContrast.contrast.toFixed(1)}:1)`,
  };
}

/**
 * Shared rendered-color primitive for Teul's historical browsers: a clean square tile
 * with the color, its name and, for Wada, how many combinations it appears in.
 *
 * The tile derives its text color from the exact pair it renders. Hex, values and the
 * WCAG label of that pair live in the color's detail sheet.
 */
export const HistoricalColorSwatchCard: React.FC<HistoricalColorSwatchCardProps> = ({
  color,
  onOpen,
  markerLabel,
  trailingCount,
  selected = false,
  ringColors,
}) => {
  const textColor = getAccessibleTextColor(color.hex).hex;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${color.name}, ${color.hex}`}
      aria-current={selected ? 'true' : undefined}
      data-teul-swatch={color.hex}
      className="teul-tile"
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        minWidth: 0,
        borderRadius: '8px',
        backgroundColor: color.hex,
        color: textColor,
        cursor: 'pointer',
        boxShadow:
          selected && ringColors
            ? `0 0 0 2px ${ringColors.gap}, 0 0 0 4px ${ringColors.ring}`
            : 'inset 0 0 0 1px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      {markerLabel && (
        <span
          aria-label={markerLabel}
          title={markerLabel}
          style={{
            position: 'absolute',
            top: '6px',
            right: '7px',
            fontSize: typeScale.meta,
            lineHeight: 1,
            opacity: 0.85,
          }}
        >
          ★
        </span>
      )}
      {trailingCount !== undefined && (
        <span
          aria-label={`${trailingCount} combinations`}
          title={`In ${trailingCount} combinations`}
          style={{
            position: 'absolute',
            top: '6px',
            right: '7px',
            fontSize: typeScale.meta,
            fontWeight: 500,
            lineHeight: 1,
            opacity: 0.8,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {trailingCount}
        </span>
      )}
      <span
        style={{
          position: 'absolute',
          left: '7px',
          right: '7px',
          bottom: '6px',
          fontSize: typeScale.meta,
          fontWeight: 500,
          lineHeight: 1.2,
          overflowWrap: 'anywhere',
        }}
      >
        {color.name}
      </span>
    </div>
  );
};
