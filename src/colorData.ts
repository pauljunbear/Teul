import colorJson from './colors.json';

export interface Color {
  name: string;
  combinations: number[];
  swatch: number;
  cmyk: number[];
  lab: number[];
  rgb: number[];
  hex: string;
}

export interface ColorCombination {
  name: string;
  colors: number[];
  type: 'duo' | 'trio' | 'quad';
}

export interface ColorData {
  colors: Color[];
  combinations: ColorCombination[];
}

// Initialize and export the color data
export const colorData: ColorData = {
  colors: colorJson,
  combinations: [],
};

// Export colors directly for backward compatibility
export const colors: { colors: Color[] } = { colors: colorJson };
