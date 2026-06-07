import type { ColorScaleValidation } from '../lib/colorScale';
import type { SemanticColorPolicyReport } from '../lib/semanticColorPolicy';

export type NormalizedDocumentColorProfile = 'legacy' | 'srgb' | 'display-p3' | 'unknown';

export type ColorRole = 'primary' | 'secondary' | 'tertiary' | 'accent';
export type ColorScaleMode = 'light' | 'dark';
export type ColorScaleMethod = 'Teul OKLCH v2' | 'Radix Colors';
export type ColorSystemScaleMethod = 'custom' | 'radix-match' | 'wcag-constrained';
export type ColorSystemDetailLevel = 'minimal' | 'detailed' | 'presentation';
export type NeutralFamily = 'auto' | 'gray' | 'mauve' | 'slate' | 'sage' | 'olive' | 'sand';

export interface ColorSource {
  hex: string;
  name: string;
}

export interface ColorSystemRoleAssignment extends ColorSource {
  role: ColorRole | null;
  roles?: ColorRole[];
}

export interface ColorSystemConfig {
  sourceColors: ColorSource[];
  roleAssignments: ColorSystemRoleAssignment[];
  scaleMethod: ColorSystemScaleMethod;
  neutralFamily: NeutralFamily;
  detailLevel: ColorSystemDetailLevel;
  includeDarkMode: boolean;
  systemName: string;
  documentColorProfile: NormalizedDocumentColorProfile;
}

export interface ColorScaleData {
  name: string;
  role: string;
  steps: { step: number; hex: string }[];
  profile: 'sRGB';
  method: ColorScaleMethod;
  mode: ColorScaleMode;
  validation?: ColorScaleValidation;
  sourceVersion?: string;
  sourceFamily?: string;
  sourceInputHex?: string;
}

export interface ColorSystemData {
  systemName: string;
  detailLevel: ColorSystemDetailLevel;
  includeDarkMode: boolean;
  scaleMethod: ColorSystemScaleMethod;
  scales: {
    light: ColorScaleMap;
    dark?: ColorScaleMap;
  };
  usageProportions: {
    primary: number;
    secondary: number;
    tertiary: number;
    accent: number;
    neutral: number;
  };
  documentColorProfile?: NormalizedDocumentColorProfile;
  multiSelectMode?: boolean;
  colorCounts?: Record<ColorRole, number>;
  semanticPolicy?: SemanticColorPolicyReport;
}

export interface ColorScaleMap {
  primary?: ColorScaleData;
  secondary?: ColorScaleData;
  tertiary?: ColorScaleData;
  accent?: ColorScaleData;
  neutral: ColorScaleData;
  [key: string]: ColorScaleData | undefined;
}

export type CreateStylesScaleData = ColorScaleData;

export interface CreateStylesData {
  systemName: string;
  includeDarkMode: boolean;
  scaleMethod: ColorSystemScaleMethod;
  scales: {
    light: CreateStylesScaleMap;
    dark?: CreateStylesScaleMap;
  };
  semanticPolicy?: SemanticColorPolicyReport;
}

export interface CreateStylesScaleMap {
  primary?: CreateStylesScaleData;
  secondary?: CreateStylesScaleData;
  tertiary?: CreateStylesScaleData;
  accent?: CreateStylesScaleData;
  neutral: CreateStylesScaleData;
  [key: string]: CreateStylesScaleData | undefined;
}
