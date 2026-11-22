/**
 * Shared theme tokens for consistent styling across components.
 *
 * Teul renders inside Figma with `themeColors: true`, so both themes are first-class:
 * dark follows the approved 2026-11 redesign (near-black canvas, raised panels, white
 * primary action); light is its counterpart (white canvas, soft grey panels, ink primary
 * action). Every component reads these tokens through `isDark`; nothing hard-codes a
 * dark-only colour.
 */

export interface ThemeTokens {
  /** Window canvas. */
  bg: string;
  /** Raised cards and grid cards. */
  cardBg: string;
  text: string;
  /** Secondary text; at least 4.5:1 on `bg`, `cardBg` and `panel`. */
  textMuted: string;
  /** Hairline dividers and control borders. */
  border: string;
  /** Inputs, search fields and segmented-control tracks. */
  inputBg: string;
  btnBg: string;
  btnHover: string;
  /** Primary action fill. */
  btnActive: string;
  btnActiveText: string;
  /** Left rail background and its selected item. */
  rail: string;
  railActive: string;
  /** Selected segment inside a segmented control. */
  segActive: string;
  /** Bottom sheet surface and its shadow. */
  sheetBg: string;
  sheetShadow: string;
  /** Hover tint laid over any surface (inset box-shadow), so hover never fights inline fills. */
  hoverTint: string;
  /** Emphasised card border on hover and selection. */
  borderStrong: string;
  /** Pass and fail text. */
  ok: string;
  no: string;
  /** Warning and success notice surfaces. */
  warnBg: string;
  warnText: string;
  okBg: string;
  okBorder: string;
  errorBg: string;
  /** Code blocks. */
  codeBg: string;
  scrollThumb: string;
  focus: string;
}

const lightTheme: ThemeTokens = {
  bg: '#ffffff',
  cardBg: '#ffffff',
  text: '#1a1a1a',
  textMuted: '#636363',
  border: '#e4e4e4',
  inputBg: '#f3f3f3',
  btnBg: '#f3f3f3',
  btnHover: '#e8e8e8',
  btnActive: '#1a1a1a',
  btnActiveText: '#ffffff',
  rail: '#f7f7f7',
  railActive: '#e9e9e9',
  segActive: '#ffffff',
  sheetBg: '#ffffff',
  sheetShadow: '0 -12px 32px rgba(0,0,0,0.12), 0 -1px 0 rgba(0,0,0,0.06)',
  hoverTint: 'rgba(0,0,0,0.045)',
  borderStrong: '#9a9a9a',
  ok: '#1d7a3d',
  no: '#b42318',
  warnBg: '#fff7e6',
  warnText: '#8a4b00',
  okBg: '#eef8f0',
  okBorder: '#9fd2ad',
  errorBg: '#fdeceb',
  codeBg: '#f6f6f6',
  scrollThumb: 'rgba(0,0,0,0.22)',
  focus: '#0d6efd',
};

const darkTheme: ThemeTokens = {
  bg: '#1e1e1e',
  cardBg: '#262626',
  text: '#f5f5f5',
  textMuted: '#a3a3a3',
  border: '#3a3a3a',
  inputBg: '#2c2c2c',
  btnBg: '#2c2c2c',
  btnHover: '#3a3a3a',
  btnActive: '#f5f5f5',
  btnActiveText: '#111111',
  rail: '#252525',
  railActive: '#3a3a3a',
  segActive: '#454545',
  sheetBg: '#262626',
  sheetShadow: '0 -18px 40px rgba(0,0,0,0.45)',
  hoverTint: 'rgba(255,255,255,0.06)',
  borderStrong: '#6b6b6b',
  ok: '#7fd49b',
  no: '#f08a80',
  warnBg: '#3a2a12',
  warnText: '#f5c56b',
  okBg: '#20301f',
  okBorder: '#3d6b47',
  errorBg: '#3b1d1b',
  codeBg: '#161616',
  scrollThumb: 'rgba(255,255,255,0.22)',
  focus: '#7cb4ff',
};

/**
 * Consolidated styles object for backward compatibility
 */
export const styles = {
  light: lightTheme,
  dark: darkTheme,
};

export const themeFor = (isDark: boolean): ThemeTokens => (isDark ? darkTheme : lightTheme);

/** Type scale: ratio 1.2 on a 12px base, floor 11px. */
export const type = {
  meta: '11px',
  body: '12px',
  emphasis: '14px',
  title: '17px',
  display: '30px',
  sample: '52px',
} as const;

export const FONT_STACK =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
