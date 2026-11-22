import * as React from 'react';
import type { GridConfig, GridPreset } from '../types/grid';
import type { GridFitAggregateAnalysis } from '../lib/gridFit';
import { getPresetApplicationMode, parseAspectRatio } from '../lib/figmaGrids';
import { themeFor, type ThemeTokens, type as typeScale } from '../lib/theme';
import { BottomSheet, buttonStyle } from './TeulUI';
import { GridPreview } from './GridPreview';

/**
 * Grid presentation helpers for the 2026-11 redesign: the dialog shell every grid dialog
 * shares, the short facts line, and the preset detail sheet. Behaviour stays with the
 * owning screens; these only lay out what they pass in.
 */

export const gridDialogOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  backgroundColor: 'rgba(0,0,0,0.5)',
};

export const gridDialogPanel = (theme: ThemeTokens, maxWidth = 380): React.CSSProperties => ({
  width: '100%',
  maxWidth: `${maxWidth}px`,
  maxHeight: 'calc(100vh - 32px)',
  overflowY: 'auto',
  padding: '18px',
  boxSizing: 'border-box',
  borderRadius: '12px',
  border: `1px solid ${theme.border}`,
  backgroundColor: theme.sheetBg,
  color: theme.text,
  boxShadow: '0 18px 50px rgba(0,0,0,0.3)',
  fontSize: typeScale.body,
  lineHeight: 1.4,
});

export const gridDialogTitle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: typeScale.emphasis,
  fontWeight: 600,
  lineHeight: 1.25,
};

export const gridDialogText = (theme: ThemeTokens): React.CSSProperties => ({
  margin: '0 0 16px',
  color: theme.textMuted,
  fontSize: typeScale.body,
  lineHeight: 1.5,
});

export const gridDialogActions: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
};

/** Destructive action: the error colour as a fill, legible in both themes. */
export const dangerButtonStyle = (theme: ThemeTokens): React.CSSProperties => ({
  ...buttonStyle(theme, 'primary'),
  border: '1px solid #b42318',
  backgroundColor: '#b42318',
  color: '#ffffff',
});

/** "4 col × 3 row", or the uniform cell size, as the cards have always summarised a grid. */
export function gridSummary(config: GridConfig): string {
  const parts: string[] = [];
  if (config.columns) parts.push(`${config.columns.count} col`);
  if (config.rows) parts.push(`${config.rows.count} row`);
  return parts.join(' × ') || (config.baseline ? `${config.baseline.height}px` : '');
}

/** Preview box for a frame of the given ratio, fitted inside `maxWidth` × `maxHeight`. */
export function previewBox(
  preset: GridPreset,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  // The same frame GridPreview draws: reference dimensions, else the aspect ratio, else square.
  const reference = preset.referenceDimensions;
  const frame =
    reference && reference.width > 0 && reference.height > 0
      ? reference
      : preset.aspectRatio
        ? parseAspectRatio(preset.aspectRatio)
        : { width: 800, height: 800 };
  const ratio =
    frame.width > 0 && frame.height > 0
      ? Math.max(0.5, Math.min(2, frame.width / frame.height))
      : 1;
  let height = maxHeight;
  let width = height * ratio;
  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

/** Application-mode wording, unchanged from the former detail panel. */
export function presetApplicationText(preset: GridPreset): string | null {
  if (!preset.referenceDimensions) return null;
  const mode = getPresetApplicationMode(preset);
  const label =
    mode === 'canonical-only'
      ? 'source-faithful canonical frame only'
      : mode === 'responsive-width'
        ? `responsive width ${preset.responsiveWidth?.min}-${preset.responsiveWidth?.max ?? '∞'}px; height unconstrained`
        : mode === 'scale-from-reference'
          ? 'scaled from reference frame'
          : 'fixed measurements';
  return `Application: ${label} · ${preset.referenceDimensions.width}×${preset.referenceDimensions.height}px preview`;
}

export const fitTone = (theme: ThemeTokens, status: 'fit' | 'warning' | 'fail') =>
  status === 'fit' ? theme.ok : status === 'warning' ? theme.warnText : theme.no;

interface GridPresetSheetProps {
  preset: GridPreset;
  isDark: boolean;
  fit: GridFitAggregateAnalysis | null;
  targetCount: number;
  /** The single selected frame's name, when exactly one target is selected. */
  targetName?: string;
  onApply: () => void;
  onCreateFrame: () => void;
  onSave: () => void;
  onClose: () => void;
}

/** The preset detail: rises over the library grid, never resizes it. */
export const GridPresetSheet: React.FC<GridPresetSheetProps> = ({
  preset,
  isDark,
  fit,
  targetCount,
  targetName,
  onApply,
  onCreateFrame,
  onSave,
  onClose,
}) => {
  const theme = themeFor(isDark);
  const box = previewBox(preset, 168, 120);
  const applicationText = presetApplicationText(preset);
  const canApply = targetCount > 0 && fit?.status !== 'fail';
  const muted: React.CSSProperties = {
    margin: 0,
    color: theme.textMuted,
    fontSize: typeScale.meta,
    lineHeight: 1.5,
  };

  return (
    <BottomSheet
      isDark={isDark}
      label={`${preset.name} details`}
      onClose={onClose}
      closeLabel="Close selected grid details"
      focusKey={preset.id}
    >
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', paddingRight: '32px' }}>
        <div style={{ flex: 'none', borderRadius: '6px', overflow: 'hidden' }}>
          <GridPreview
            config={preset.config}
            construction={preset.construction}
            width={box.width}
            height={box.height}
            isDark={isDark}
            referenceDimensions={preset.referenceDimensions}
            applicationMode={preset.applicationMode}
            responsiveWidth={preset.responsiveWidth}
            aspectRatio={preset.aspectRatio}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              color: theme.text,
              fontSize: typeScale.title,
              fontWeight: 600,
              lineHeight: 1.25,
              letterSpacing: '-0.01em',
            }}
          >
            {preset.name}
          </h3>
          <p
            style={{
              ...muted,
              marginTop: '3px',
              fontSize: typeScale.body,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {[gridSummary(preset.config), preset.aspectRatio].filter(Boolean).join(' · ')}
          </p>
          {preset.tags.length > 0 && (
            <p style={{ ...muted, marginTop: '2px' }}>{preset.tags.slice(0, 4).join(', ')}</p>
          )}
        </div>
      </div>

      <p
        style={{
          margin: '12px 0 0',
          color: theme.text,
          fontSize: typeScale.body,
          lineHeight: 1.45,
        }}
      >
        {preset.description}
      </p>

      {preset.provenance && (
        <div style={{ ...muted, marginTop: '6px' }}>
          <div>
            <strong style={{ fontWeight: 600 }}>
              {preset.provenance.classification
                .replace(/-/g, ' ')
                .replace(/^./, first => first.toUpperCase())}
              :
            </strong>{' '}
            {preset.provenance.adaptationNotes}
          </div>
          <div>
            Source: {preset.provenance.source} · evidence:{' '}
            {preset.provenance.evidence.replace(/-/g, ' ')}
          </div>
          {preset.provenance.sourceUrl && (
            <a
              href={preset.provenance.sourceUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: theme.text }}
            >
              Open source reference
            </a>
          )}
          {applicationText && <div>{applicationText}</div>}
        </div>
      )}

      {fit && (
        <div
          role={fit.status === 'fail' ? 'alert' : 'status'}
          style={{
            marginTop: '10px',
            padding: '8px 10px',
            borderRadius: '8px',
            backgroundColor: theme.inputBg,
            color: theme.textMuted,
            fontSize: typeScale.meta,
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: fitTone(theme, fit.status), fontWeight: 600 }}>
            {fit.status.toUpperCase()} across {fit.targetCount}{' '}
            {fit.targetCount === 1 ? 'target' : 'targets'}
          </strong>
          {fit.representative.frame.name && <span> · worst: {fit.representative.frame.name}</span>}
          {fit.representative.columns && (
            <span> · {fit.representative.columns.sectionSize.toFixed(1)}px columns</span>
          )}
          {fit.representative.rows && (
            <span> · {fit.representative.rows.sectionSize.toFixed(1)}px rows</span>
          )}
          {fit.representative.issues.length > 0 && (
            <ul style={{ margin: '5px 0 0', paddingLeft: '16px' }}>
              {fit.representative.issues.map(issue => (
                <li key={`${issue.axis}-${issue.code}`}>{issue.message}</li>
              ))}
            </ul>
          )}
          {fit.representative.recommendations.length > 0 && (
            <ul style={{ margin: '5px 0 0', paddingLeft: '16px' }}>
              {fit.representative.recommendations.map(recommendation => (
                <li key={`${recommendation.axis}-${recommendation.action}`}>
                  Recommendation: {recommendation.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onApply}
          disabled={!canApply}
          style={{ ...buttonStyle(theme, 'primary', { grow: true }), minWidth: '160px' }}
        >
          {fit?.status === 'fail'
            ? 'Cannot apply'
            : targetCount === 1 && targetName
              ? `Apply to ${targetName}`
              : 'Apply'}
        </button>
        <button
          type="button"
          onClick={onCreateFrame}
          className="teul-hover"
          style={buttonStyle(theme)}
        >
          New Frame
        </button>
        <button
          type="button"
          onClick={onSave}
          title="Save to My Grids"
          aria-label="Save grid to My Grids collection"
          className="teul-hover"
          style={buttonStyle(theme)}
        >
          Save
        </button>
      </div>
    </BottomSheet>
  );
};
