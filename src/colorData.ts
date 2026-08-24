import colorJson from './colors.json';
import type { WadaColor } from './types/historicalColorData';

interface ColorCombination {
  name: string;
  colors: number[];
  type: 'duo' | 'trio' | 'quad';
}

export interface ColorData {
  colors: WadaColor[];
  combinations: ColorCombination[];
}

// Initialize and export the color data
export const colorData: ColorData = {
  colors: colorJson as WadaColor[],
  combinations: [],
};
