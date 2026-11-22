import * as React from 'react';
import type { SavedGrid } from '../types/grid';
import { getPresetApplicationMode } from '../lib/figmaGrids';
import { themeFor, type as typeScale } from '../lib/theme';
import { GridPreview } from './GridPreview';
import { Copy, GridFour, PencilSimple } from './TeulIcons';
import { buttonStyle } from './TeulUI';
import { gridSummary, previewBox } from './GridSheet';

interface SavedGridCardProps {
  grid: SavedGrid;
  isDark: boolean;
  onApply: () => void;
  onCreateFrame: () => void;
  onEdit: () => void;
  onEditGeometry: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Lucide `trash-2` v1.24.0, drawn locally like the other Teul icons. */
const TrashIcon: React.FC = () => (
  <svg
    aria-hidden="true"
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export const SavedGridCard: React.FC<SavedGridCardProps> = ({
  grid,
  isDark,
  onApply,
  onCreateFrame,
  onEdit,
  onEditGeometry,
  onDuplicate,
  onDelete,
}) => {
  const theme = themeFor(isDark);
  const box = previewBox(grid, 180, 84);
  const meta: React.CSSProperties = {
    margin: '0 0 4px',
    color: theme.textMuted,
    fontSize: typeScale.meta,
    lineHeight: 1.4,
  };
  const iconButton: React.CSSProperties = {
    ...buttonStyle(theme, 'ghost', { height: 28 }),
    width: '28px',
    padding: 0,
    color: theme.textMuted,
  };

  return (
    <div
      style={{
        minWidth: 0,
        padding: '10px',
        backgroundColor: theme.cardBg,
        borderRadius: '10px',
        border: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          height: '84px',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GridPreview
          config={grid.config}
          construction={grid.construction}
          width={box.width}
          height={box.height}
          isDark={isDark}
          referenceDimensions={grid.referenceDimensions}
          applicationMode={grid.applicationMode}
          responsiveWidth={grid.responsiveWidth}
          aspectRatio={grid.aspectRatio}
        />
      </div>

      <h4
        style={{
          margin: '0 0 2px',
          fontSize: typeScale.body,
          fontWeight: 600,
          lineHeight: 1.25,
          color: theme.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={grid.name}
      >
        {grid.name}
      </h4>

      <p
        style={{ ...meta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={grid.description || undefined}
      >
        {grid.description || 'No description'}
      </p>

      <p style={{ ...meta, fontVariantNumeric: 'tabular-nums' }}>
        {gridSummary(grid.config)}
        {grid.referenceDimensions && (
          <>
            {' · '}
            {getPresetApplicationMode(grid) === 'canonical-only'
              ? 'Canonical frame only'
              : getPresetApplicationMode(grid) === 'responsive-width'
                ? `Responsive ${grid.responsiveWidth?.min}-${grid.responsiveWidth?.max ?? '∞'}px width`
                : getPresetApplicationMode(grid) === 'scale-from-reference'
                  ? 'Scales from reference'
                  : 'Fixed measurements'}{' '}
            · {grid.referenceDimensions.width}×{grid.referenceDimensions.height}px
          </>
        )}
      </p>

      {grid.construction && (
        <p style={meta} title={grid.construction.realization.disclosure}>
          Source: Grid Construction v2 · Figma: {grid.construction.realization.kind}
        </p>
      )}

      {grid.tags.length > 0 && (
        <p style={meta}>
          {grid.tags.slice(0, 3).join(', ')}
          {grid.tags.length > 3 && ` +${grid.tags.length - 3}`}
        </p>
      )}

      <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', paddingTop: '6px' }}>
        <button
          type="button"
          onClick={onApply}
          style={buttonStyle(theme, 'primary', { grow: true, height: 30 })}
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onCreateFrame}
          className="teul-hover"
          style={buttonStyle(theme, 'secondary', { height: 30 })}
          title="Create new frame"
          aria-label="Create new frame with this grid"
        >
          + Frame
        </button>
      </div>

      <div style={{ display: 'flex', gap: '2px', marginTop: '6px', justifyContent: 'flex-end' }}>
        {[
          {
            label: 'Edit grid geometry',
            title: 'Edit geometry',
            icon: <GridFour size={14} strokeWidth={1.8} />,
            action: onEditGeometry,
          },
          {
            label: 'Edit grid settings',
            title: 'Edit',
            icon: <PencilSimple size={14} strokeWidth={1.8} />,
            action: onEdit,
          },
          {
            label: 'Duplicate this grid',
            title: 'Duplicate',
            icon: <Copy size={14} strokeWidth={1.8} />,
            action: onDuplicate,
          },
        ].map(action => (
          <button
            key={action.label}
            type="button"
            onClick={action.action}
            title={action.title}
            aria-label={action.label}
            className="teul-hover"
            style={iconButton}
          >
            {action.icon}
          </button>
        ))}
        <button
          type="button"
          onClick={onDelete}
          title="Delete"
          aria-label="Delete this grid"
          className="teul-hover"
          style={{ ...iconButton, color: theme.no }}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
};
