import * as React from 'react';
import type { SavedGrid } from '../types/grid';
import { getPresetApplicationMode } from '../lib/figmaGrids';
import { GridMiniPreview } from './GridPreview';
import { myGridStyles } from './myGridTheme';

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
  const theme = isDark ? myGridStyles.dark : myGridStyles.light;

  return (
    <div
      style={{
        padding: '12px',
        backgroundColor: theme.cardBg,
        borderRadius: '10px',
        border: `1px solid ${theme.border}`,
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
    >
      <div
        style={{
          marginBottom: '10px',
          borderRadius: '6px',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          backgroundColor: isDark ? '#1e1e1e' : '#f0f0f0',
          padding: '8px',
        }}
      >
        <GridMiniPreview
          config={grid.config}
          construction={grid.construction}
          size={64}
          isDark={isDark}
          referenceDimensions={grid.referenceDimensions}
          applicationMode={grid.applicationMode}
          responsiveWidth={grid.responsiveWidth}
          aspectRatio={grid.aspectRatio}
        />
      </div>

      <h4
        style={{
          margin: '0 0 4px 0',
          fontSize: '12px',
          fontWeight: 600,
          color: theme.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {grid.name}
      </h4>

      <p
        style={{
          margin: '0 0 6px 0',
          fontSize: '10px',
          color: theme.textMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {grid.description || 'No description'}
      </p>

      {grid.referenceDimensions && (
        <p style={{ margin: '0 0 6px 0', fontSize: '9px', color: theme.textMuted }}>
          {getPresetApplicationMode(grid) === 'canonical-only'
            ? 'Canonical frame only'
            : getPresetApplicationMode(grid) === 'responsive-width'
              ? `Responsive ${grid.responsiveWidth?.min}-${grid.responsiveWidth?.max ?? '∞'}px width`
              : getPresetApplicationMode(grid) === 'scale-from-reference'
                ? 'Scales from reference'
                : 'Fixed measurements'}{' '}
          · {grid.referenceDimensions.width}×{grid.referenceDimensions.height}px
        </p>
      )}

      {grid.construction && (
        <p
          style={{ margin: '0 0 6px 0', fontSize: '9px', lineHeight: 1.35, color: theme.textMuted }}
          title={grid.construction.realization.disclosure}
        >
          Source: Grid Construction v2 · Figma: {grid.construction.realization.kind}
        </p>
      )}

      {grid.tags.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {grid.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '9px',
                backgroundColor: isDark ? '#333' : '#e5e5e5',
                color: theme.textMuted,
              }}
            >
              {tag}
            </span>
          ))}
          {grid.tags.length > 3 && (
            <span style={{ fontSize: '9px', color: theme.textMuted }}>+{grid.tags.length - 3}</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
        <button
          onClick={onApply}
          style={{
            flex: 1,
            padding: '6px 8px',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Apply
        </button>
        <button
          onClick={onCreateFrame}
          style={{
            padding: '6px 8px',
            borderRadius: '4px',
            border: `1px solid ${theme.border}`,
            backgroundColor: 'transparent',
            color: theme.text,
            fontSize: '10px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
          title="Create new frame"
          aria-label="Create new frame with this grid"
        >
          +
        </button>
      </div>

      <div
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          display: 'flex',
          gap: '4px',
        }}
      >
        {[
          {
            label: 'Edit grid geometry',
            title: 'Edit geometry',
            icon: '📐',
            action: onEditGeometry,
          },
          { label: 'Edit grid settings', title: 'Edit', icon: '✏️', action: onEdit },
          { label: 'Duplicate this grid', title: 'Duplicate', icon: '📋', action: onDuplicate },
        ].map(action => (
          <button
            key={action.label}
            onClick={action.action}
            title={action.title}
            aria-label={action.label}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.cardBg,
              color: theme.textMuted,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {action.icon}
          </button>
        ))}
        <button
          onClick={onDelete}
          title="Delete"
          aria-label="Delete this grid"
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.dangerBg,
            color: theme.dangerText,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          🗑️
        </button>
      </div>
    </div>
  );
};
