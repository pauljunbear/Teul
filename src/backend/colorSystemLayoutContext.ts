import type {
  SemanticColorModeReport,
  SemanticColorPolicyReport,
} from '../lib/semanticColorPolicy';
import type { ColorScaleData, ColorSystemData } from '../types/colorSystem';

export type ColorSystemSemanticMode = 'light' | 'dark';

export const RADIX_STEP_LABELS: Record<number, { short: string; full: string }> = {
  1: { short: 'App BG', full: 'App Background' },
  2: { short: 'Subtle BG', full: 'Subtle Background' },
  3: { short: 'Element BG', full: 'UI Element Background' },
  4: { short: 'Hovered', full: 'Hovered Element BG' },
  5: { short: 'Active', full: 'Active/Selected Element BG' },
  6: { short: 'Subtle Border', full: 'Subtle Border' },
  7: { short: 'Border', full: 'Border' },
  8: { short: 'Focus Ring', full: 'Border Focus/Hover' },
  9: { short: 'Solid', full: 'Solid Background' },
  10: { short: 'Solid Hover', full: 'Solid Hover' },
  11: { short: 'Text Low', full: 'Low Contrast Text' },
  12: { short: 'Text High', full: 'High Contrast Text' },
};

export interface ColorSystemLayoutContext {
  createFrame: () => FrameNode;
  createText: (
    content: string,
    fontSize: number,
    fontStyle?: 'Regular' | 'Medium' | 'Semi Bold' | 'Bold',
    color?: RGB
  ) => TextNode;
  createColorSwatch: (
    hex: string,
    width: number,
    height: number,
    cornerRadius?: number
  ) => RectangleNode;
  createScaleRow: (
    scale: ColorScaleData,
    mode: ColorSystemSemanticMode,
    showLabels?: boolean,
    swatchSize?: number,
    showRadixGuidance?: boolean
  ) => Promise<FrameNode>;
  createBWSwatches: (size?: number) => FrameNode;
  createSemanticPolicyReport: (
    policy: SemanticColorPolicyReport,
    modePolicy: SemanticColorModeReport,
    mode: ColorSystemSemanticMode
  ) => FrameNode;
  getOrderedScaleKeys: (scales: ColorSystemData['scales']['light']) => string[];
  getAccessibilityRating: (contrast: number) => { rating: string; color: RGB };
  getWCAGContrastHex: (foreground: string, background: string) => number;
}
