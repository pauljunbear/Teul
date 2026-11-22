import { styles, type ThemeTokens } from '../lib/theme';

/** Saved-grid surfaces, derived from the shared theme tokens (2026-11 redesign). */
const fromTheme = (theme: ThemeTokens) =>
  ({
    bg: theme.bg,
    text: theme.text,
    textMuted: theme.textMuted,
    border: theme.border,
    inputBg: theme.inputBg,
    cardBg: theme.cardBg,
    cardHoverBg: theme.btnHover,
    dangerBg: theme.errorBg,
    dangerText: theme.no,
    successBg: theme.okBg,
    successText: theme.ok,
    warningBg: theme.warnBg,
    warningText: theme.warnText,
  }) as const;

export const myGridStyles = {
  light: fromTheme(styles.light),
  dark: fromTheme(styles.dark),
} as const;
