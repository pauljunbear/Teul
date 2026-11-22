import * as React from 'react';
import { themeFor, type ThemeTokens, type as typeScale, MONO_STACK } from '../lib/theme';
import { X } from './TeulIcons';

/**
 * Shared presentation primitives for the 2026-11 redesign. They carry layout and theme
 * only; every action they trigger is passed in by the owning screen.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/** Button style: every target is at least 28px tall. */
export const buttonStyle = (
  theme: ThemeTokens,
  variant: ButtonVariant = 'secondary',
  options: { height?: number; grow?: boolean } = {}
): React.CSSProperties => ({
  minHeight: `${options.height ?? 32}px`,
  padding: variant === 'primary' ? '0 14px' : '0 12px',
  borderRadius: '8px',
  border: `1px solid ${variant === 'primary' ? theme.btnActive : variant === 'ghost' ? 'transparent' : theme.border}`,
  backgroundColor: variant === 'primary' ? theme.btnActive : 'transparent',
  color: variant === 'primary' ? theme.btnActiveText : theme.text,
  fontFamily: 'inherit',
  fontSize: typeScale.body,
  fontWeight: variant === 'primary' ? 600 : 500,
  lineHeight: 1.2,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  whiteSpace: 'nowrap',
  flex: options.grow ? 1 : undefined,
  boxSizing: 'border-box',
});

export const inputStyle = (theme: ThemeTokens): React.CSSProperties => ({
  height: '32px',
  minWidth: 0,
  padding: '0 10px',
  borderRadius: '8px',
  border: `1px solid ${theme.border}`,
  backgroundColor: theme.inputBg,
  color: theme.text,
  fontFamily: 'inherit',
  fontSize: typeScale.body,
  outline: 'none',
  boxSizing: 'border-box',
});

export const selectStyle = (theme: ThemeTokens): React.CSSProperties => ({
  ...inputStyle(theme),
  height: '30px',
  padding: '0 6px',
  cursor: 'pointer',
});

export const monoStyle: React.CSSProperties = {
  fontFamily: MONO_STACK,
  fontVariantNumeric: 'tabular-nums',
};

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}

/** A segmented choice: a group of pressed/unpressed buttons on a soft track. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  isDark,
  wide = false,
  id,
}: {
  label: string;
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  isDark: boolean;
  wide?: boolean;
  id?: string;
}) {
  const theme = themeFor(isDark);
  return (
    <div
      role="group"
      aria-label={label}
      id={id}
      style={{
        display: 'flex',
        flex: wide ? 1 : 'none',
        minWidth: 0,
        padding: '2px',
        borderRadius: '8px',
        backgroundColor: theme.inputBg,
        gap: '2px',
      }}
    >
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.ariaLabel}
            title={option.title}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={active ? undefined : 'teul-hover'}
            style={{
              flex: wide ? 1 : 'none',
              minWidth: 0,
              minHeight: '28px',
              padding: '0 10px',
              border: 0,
              borderRadius: '6px',
              backgroundColor: active ? theme.segActive : 'transparent',
              boxShadow:
                active && !isDark
                  ? '0 1px 2px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)'
                  : 'none',
              color: active ? theme.text : theme.textMuted,
              fontFamily: 'inherit',
              fontSize: typeScale.body,
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A filter chip: pill, 28px tall, optional colour dot. */
export const Chip: React.FC<{
  pressed: boolean;
  onClick: () => void;
  isDark: boolean;
  dot?: string;
  title?: string;
  children: React.ReactNode;
}> = ({ pressed, onClick, isDark, dot, title, children }) => {
  const theme = themeFor(isDark);
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={pressed ? undefined : 'teul-hover'}
      style={{
        minHeight: '28px',
        padding: '0 8px',
        borderRadius: '14px',
        border: `1px solid ${pressed ? theme.text : theme.border}`,
        backgroundColor: pressed ? theme.text : 'transparent',
        color: pressed ? theme.bg : theme.textMuted,
        fontFamily: 'inherit',
        fontSize: typeScale.meta,
        fontWeight: pressed ? 600 : 500,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        whiteSpace: 'nowrap',
        flex: 'none',
      }}
    >
      {dot && (
        <i
          aria-hidden="true"
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: dot,
            display: 'block',
          }}
        />
      )}
      {children}
    </button>
  );
};

/** A small label row: muted caption on the left, optional aside on the right. */
export const SectionLabel: React.FC<{
  isDark: boolean;
  aside?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ isDark, aside, id, children, style }) => {
  const theme = themeFor(isDark);
  return (
    <div
      style={{
        margin: '14px 0 8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: '8px',
        color: theme.textMuted,
        fontSize: typeScale.meta,
        lineHeight: 1.4,
        ...style,
      }}
    >
      <h3 id={id} style={{ margin: 0, font: 'inherit', color: 'inherit' }}>
        {children}
      </h3>
      {aside && <span style={{ textAlign: 'right' }}>{aside}</span>}
    </div>
  );
};

/** A collapsed row that opens in place. Summary text stays at the 12px body size. */
export const Disclosure: React.FC<{
  isDark: boolean;
  summary: React.ReactNode;
  summaryLabel?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  first?: boolean;
  dataAttr?: Record<string, string>;
}> = ({ isDark, summary, summaryLabel, children, defaultOpen, first, dataAttr }) => {
  const theme = themeFor(isDark);
  return (
    <details
      open={defaultOpen}
      {...dataAttr}
      style={{
        borderTop: first ? 'none' : `1px solid ${theme.border}`,
        padding: '2px 0',
      }}
    >
      <summary
        className="teul-summary"
        aria-label={summaryLabel}
        style={{
          minHeight: '32px',
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          color: theme.text,
          fontSize: typeScale.body,
          fontWeight: 500,
          lineHeight: 1.35,
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>{summary}</span>
      </summary>
      <div
        style={{
          padding: '2px 0 10px 14px',
          color: theme.textMuted,
          fontSize: typeScale.meta,
          lineHeight: 1.5,
        }}
      >
        {children}
      </div>
    </details>
  );
};

/** Inline notice for warnings, failures and confirmations. */
export const Notice: React.FC<{
  isDark: boolean;
  tone: 'warn' | 'error' | 'ok' | 'neutral';
  role?: 'status' | 'alert';
  id?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ isDark, tone, role, id, children, style }) => {
  const theme = themeFor(isDark);
  const palette = {
    warn: { bg: theme.warnBg, color: theme.warnText },
    error: { bg: theme.errorBg, color: theme.no },
    ok: { bg: theme.okBg, color: theme.ok },
    neutral: { bg: theme.inputBg, color: theme.textMuted },
  }[tone];
  return (
    <div
      role={role}
      id={id}
      style={{
        padding: '8px 10px',
        borderRadius: '8px',
        backgroundColor: palette.bg,
        color: palette.color,
        fontSize: typeScale.meta,
        lineHeight: 1.45,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** The sheet's height budget: never more than this share of the panel. */
export const SHEET_MAX_HEIGHT = '62%';

/**
 * A bottom sheet that rises over its positioned parent. It overlays rather than resizes
 * the content beneath it, so opening it never shifts the grid. Escape closes it and
 * returns focus to the element that opened it. Reduced motion removes the slide.
 */
export const BottomSheet: React.FC<{
  isDark: boolean;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  closeLabel?: string;
  /** Changing this key re-focuses the sheet (a new item was opened). */
  focusKey?: string | number;
}> = ({ isDark, label, onClose, children, closeLabel = 'Close details', focusKey }) => {
  const theme = themeFor(isDark);
  const ref = React.useRef<HTMLElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !ref.current?.contains(active)) opener.current = active;
    ref.current?.focus({ preventScroll: true });
  }, [focusKey]);

  React.useEffect(
    () => () => {
      // Only when focus went down with the sheet; a control the person moved to keeps it.
      const target = opener.current;
      const active = document.activeElement;
      const focusLost = !active || active === document.body;
      if (focusLost && target?.isConnected) target.focus({ preventScroll: true });
    },
    []
  );

  return (
    <section
      ref={ref}
      aria-label={label}
      tabIndex={-1}
      className="teul-sheet"
      data-teul-sheet=""
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        maxHeight: SHEET_MAX_HEIGHT,
        overflowY: 'auto',
        padding: '14px 14px 12px',
        borderTop: `1px solid ${theme.border}`,
        borderRadius: '14px 14px 0 0',
        backgroundColor: theme.sheetBg,
        boxShadow: theme.sheetShadow,
        boxSizing: 'border-box',
        outline: 'none',
      }}
    >
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="teul-hover"
        style={{
          ...buttonStyle(theme, 'ghost', { height: 28 }),
          position: 'absolute',
          top: '10px',
          right: '10px',
          width: '28px',
          padding: 0,
          color: theme.textMuted,
        }}
      >
        <X size={14} />
      </button>
      {children}
    </section>
  );
};

/** Space reserved at the end of a scroller so its last row can scroll clear of an open sheet. */
export const sheetScrollSpacer = (open: boolean): React.CSSProperties =>
  open ? { paddingBottom: '62vh', scrollPaddingBottom: '62vh' } : {};
