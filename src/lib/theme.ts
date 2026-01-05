/**
 * Shared theme tokens for consistent styling across components
 */

export interface ThemeTokens {
  bg: string;
  cardBg: string;
  text: string;
  textMuted: string;
  border: string;
  inputBg: string;
  btnBg: string;
  btnHover: string;
  btnActive: string;
  btnActiveText: string;
}

export const lightTheme: ThemeTokens = {
  bg: '#ffffff',
  cardBg: '#ffffff',
  text: '#1a1a1a',
  textMuted: '#666666',
  border: '#e5e5e5',
  inputBg: '#f5f5f5',
  btnBg: '#f0f0f0',
  btnHover: '#e5e5e5',
  btnActive: '#1a1a1a',
  btnActiveText: '#ffffff',
};

export const darkTheme: ThemeTokens = {
  bg: '#1a1a1a',
  cardBg: '#262626',
  text: '#ffffff',
  textMuted: '#a3a3a3',
  border: '#404040',
  inputBg: '#333333',
  btnBg: '#333333',
  btnHover: '#404040',
  btnActive: '#ffffff',
  btnActiveText: '#1a1a1a',
};

/**
 * Get theme tokens based on dark mode preference
 */
export function getTheme(isDark: boolean): ThemeTokens {
  return isDark ? darkTheme : lightTheme;
}

/**
 * Consolidated styles object for backward compatibility
 */
export const styles = {
  light: lightTheme,
  dark: darkTheme,
};
