import * as React from 'react';
import { themeFor, type as typeScale } from '../lib/theme';
import { ArrowLeft, Copy, MagicWand, PaintBucket, PencilSimple, Swatches } from './TeulIcons';
import { buttonStyle, inputStyle, monoStyle, sheetScrollSpacer } from './TeulUI';
import { swatchTextRating } from './HistoricalColorSwatchCard';

/**
 * Layout shared by the Wada and Werner browsers: one compact top row, one row of
 * filter chips, a five-column grid of tiles, and a bottom sheet that rises over the
 * grid without resizing it.
 */
export const ColorBrowseFrame: React.FC<{
  isDark: boolean;
  topRow: React.ReactNode;
  chips: React.ReactNode;
  gridLabel: string;
  sheet: React.ReactNode | null;
  children: React.ReactNode;
}> = ({ isDark, topRow, chips, gridLabel, sheet, children }) => {
  const theme = themeFor(isDark);
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: theme.bg,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px 8px' }}>
        {topRow}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          padding: '0 12px 10px',
          alignItems: 'center',
        }}
      >
        {chips}
      </div>
      <div
        role="region"
        aria-label={gridLabel}
        data-teul-color-grid=""
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '4px 12px 12px',
          boxSizing: 'border-box',
          ...sheetScrollSpacer(Boolean(sheet)),
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: '6px',
            alignContent: 'start',
          }}
        >
          {children}
        </div>
      </div>
      {sheet}
    </div>
  );
};

/** Search field used by both libraries. */
export const ColorSearch: React.FC<{
  isDark: boolean;
  label: string;
  count: number;
  value: string;
  onChange: (value: string) => void;
}> = ({ isDark, label, count, value, onChange }) => (
  <input
    type="search"
    aria-label={label}
    placeholder={`Search ${count} colors`}
    value={value}
    onChange={event => onChange(event.target.value)}
    style={{ ...inputStyle(themeFor(isDark)), flex: 1 }}
  />
);

export const EmptyGrid: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <div
    style={{
      gridColumn: '1 / -1',
      padding: '40px 0',
      textAlign: 'center',
      color: themeFor(isDark).textMuted,
    }}
  >
    No colors found
  </div>
);

/** Swatch, name and hex/RGB at the top of a color's detail sheet. */
export const ColorSheetHeader: React.FC<{
  isDark: boolean;
  name: string;
  hex: string;
  rgb: readonly number[];
  eyebrow?: string;
  headingId: string;
}> = ({ isDark, name, hex, rgb, eyebrow, headingId }) => {
  const theme = themeFor(isDark);
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', paddingRight: '36px' }}>
      <div
        aria-hidden="true"
        style={{
          width: '56px',
          height: '56px',
          flex: 'none',
          borderRadius: '10px',
          backgroundColor: hex,
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
        }}
      />
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <span style={{ display: 'block', color: theme.textMuted, fontSize: typeScale.meta }}>
            {eyebrow}
          </span>
        )}
        <h3
          id={headingId}
          style={{
            margin: 0,
            fontSize: typeScale.title,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            lineHeight: 1.25,
            color: theme.text,
          }}
        >
          {name}
        </h3>
        <p
          style={{
            margin: '2px 0 0',
            color: theme.textMuted,
            fontSize: typeScale.meta,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {hex.toUpperCase()} · RGB {rgb.join(' ')}
        </p>
      </div>
    </div>
  );
};

/** Use as fill (primary), Build system, Stroke, Style, Copy. */
export const ColorSheetActions: React.FC<{
  isDark: boolean;
  onFill: () => void;
  onBuild: () => void;
  onStroke: () => void;
  onStyle: () => void;
  onCopy: () => void;
}> = ({ isDark, onFill, onBuild, onStroke, onStyle, onCopy }) => {
  const theme = themeFor(isDark);
  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
      <button
        type="button"
        onClick={onFill}
        style={{ ...buttonStyle(theme, 'primary', { grow: true }), minWidth: 0 }}
      >
        <PaintBucket size={14} /> Use as fill
      </button>
      <button type="button" onClick={onBuild} className="teul-hover" style={buttonStyle(theme)}>
        <MagicWand size={14} /> Build system
      </button>
      <button
        type="button"
        onClick={onStroke}
        aria-label="Use as stroke"
        title="Use as stroke"
        className="teul-hover"
        style={buttonStyle(theme)}
      >
        <PencilSimple size={14} /> Stroke
      </button>
      <button
        type="button"
        onClick={onStyle}
        aria-label="Create style"
        title="Create style"
        className="teul-hover"
        style={buttonStyle(theme)}
      >
        <Swatches size={14} /> Style
      </button>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy hex"
        title="Copy hex"
        className="teul-hover"
        style={buttonStyle(theme)}
      >
        <Copy size={14} /> Copy
      </button>
    </div>
  );
};

/** Hex, RGB, CMYK, Lab and the WCAG label of the swatch's own text pair. */
export const ColorValues: React.FC<{
  isDark: boolean;
  hex: string;
  rows: Array<{ label: string; value: string }>;
}> = ({ isDark, hex, rows }) => {
  const theme = themeFor(isDark);
  const rating = swatchTextRating(hex);
  return (
    <dl style={{ margin: 0, display: 'grid', gap: '4px' }}>
      {rows.map(row => (
        <div key={row.label} style={{ display: 'flex', gap: '10px' }}>
          <dt style={{ width: '44px', flex: 'none', color: theme.textMuted }}>{row.label}</dt>
          <dd style={{ margin: 0, color: theme.text, ...monoStyle }}>{row.value}</dd>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '10px' }}>
        <dt style={{ width: '44px', flex: 'none', color: theme.textMuted }}>Label</dt>
        <dd style={{ margin: 0, color: theme.text }} title={rating.title}>
          {rating.title}
        </dd>
      </div>
    </dl>
  );
};

/** A full-panel secondary view (all pairings) with a back button. */
export const PanelView: React.FC<{
  isDark: boolean;
  title: React.ReactNode;
  backLabel: string;
  onBack: () => void;
  aside?: React.ReactNode;
  children: React.ReactNode;
}> = ({ isDark, title, backLabel, onBack, aside, children }) => {
  const theme = themeFor(isDark);
  const backRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => backRef.current?.focus({ preventScroll: true }), []);
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.bg,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <button
          ref={backRef}
          type="button"
          aria-label={backLabel}
          title={backLabel}
          onClick={onBack}
          className="teul-hover"
          style={{
            ...buttonStyle(theme),
            width: '32px',
            padding: 0,
            backgroundColor: theme.inputBg,
            border: 0,
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: typeScale.emphasis,
            fontWeight: 600,
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        {aside}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 16px' }}>
        {children}
      </div>
    </div>
  );
};
