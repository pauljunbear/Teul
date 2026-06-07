// Color System Export Utilities
// Extracted from ColorSystemModal.tsx

// ============================================
// Types
// ============================================

import type { ColorScaleValidation } from './colorScale';

export interface ExportScale {
  name: string;
  role: string;
  steps: { step: number; hex: string }[];
  profile?: 'sRGB';
  method?: 'Teul OKLCH v2' | 'Radix Colors';
  mode?: 'light' | 'dark';
  validation?: ColorScaleValidation;
}

export interface ExportScales {
  primary?: ExportScale;
  secondary?: ExportScale;
  tertiary?: ExportScale;
  accent?: ExportScale;
  neutral: ExportScale;
  [key: string]: ExportScale | undefined;
}

interface ExportScaleData {
  name: string;
  role: string;
  colors: Record<string, string>;
  profile?: 'sRGB';
  method?: 'Teul OKLCH v2' | 'Radix Colors';
  mode?: 'light' | 'dark';
  validation?: ColorScaleValidation;
}

interface ExportJSONData {
  name: string;
  generatedAt: string;
  generator: string;
  light: Record<string, ExportScaleData>;
  dark?: Record<string, ExportScaleData>;
}

// ============================================
// Helper Functions
// ============================================

// Export and Figma style suffixes are separate backward-compatibility contracts.
// Figma style suffix 1000 historically means step 11; export suffix 1000 means step 12.
export function stepToVarSuffix(step: number): string {
  const mapping: Record<number, string> = {
    1: '50',
    2: '100',
    3: '200',
    4: '300',
    5: '400',
    6: '500',
    7: '600',
    8: '700',
    9: '800',
    10: '900',
    11: '950',
    12: '1000',
  };
  return mapping[step] || step.toString();
}

export function stepToStyleSuffix(step: number): string {
  const mapping: Record<number, string> = {
    1: '50',
    2: '100',
    3: '200',
    4: '300',
    5: '400',
    6: '500',
    7: '600',
    8: '700',
    9: '800',
    10: '900',
    11: '1000',
    12: '1100',
  };
  return mapping[step] || step.toString();
}

const BASE_SCALE_ORDER = ['primary', 'secondary', 'tertiary', 'accent'] as const;

export function getOrderedScaleKeys(scales: Record<string, unknown>): string[] {
  const presentKeys = Object.keys(scales).filter(key => scales[key] !== undefined);
  const roleOrder = new Map(BASE_SCALE_ORDER.map((role, index) => [role, index]));
  const parseRoleKey = (key: string) => {
    const match = /^(primary|secondary|tertiary|accent)(\d+)?$/.exec(key);
    return match
      ? {
          role: roleOrder.get(match[1] as (typeof BASE_SCALE_ORDER)[number]) ?? 0,
          variant: match[2] ? Number(match[2]) : 1,
        }
      : null;
  };
  const remainingKeys = presentKeys
    .filter(key => key !== 'neutral')
    .sort((first, second) => {
      const parsedFirst = parseRoleKey(first);
      const parsedSecond = parseRoleKey(second);
      if (parsedFirst && parsedSecond) {
        return parsedFirst.role - parsedSecond.role || parsedFirst.variant - parsedSecond.variant;
      }
      if (parsedFirst) return -1;
      if (parsedSecond) return 1;
      return first.localeCompare(second);
    });

  return presentKeys.includes('neutral') ? [...remainingKeys, 'neutral'] : remainingKeys;
}

export function systemNameToTokenPrefix(systemName: string): string {
  const normalized = systemName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'teul-color-system';
}

// ============================================
// Export Functions
// ============================================

// Export as CSS custom properties
export function exportAsCSS(
  scales: ExportScales,
  darkScales: ExportScales | undefined,
  systemName: string
): string {
  const prefix = systemNameToTokenPrefix(systemName);
  let css = `/* ${systemName} Color System */\n`;
  css += `/* Generated with Teul */\n\n`;

  css += `:root {\n`;

  // Light mode variables
  for (const key of getOrderedScaleKeys(scales)) {
    const scale = scales[key];
    if (scale) {
      css += `  /* ${scale.role} */\n`;
      css += `  /* ${scale.method ?? 'Unspecified source'}${scale.profile ? ` · ${scale.profile}` : ''} */\n`;
      for (const step of scale.steps) {
        css += `  --${prefix}-${key}-${stepToVarSuffix(step.step)}: ${step.hex};\n`;
      }
      css += `\n`;
    }
  }
  css += `}\n`;

  // Dark mode variables
  if (darkScales) {
    css += `\n/* Dark Mode */\n`;
    css += `[data-theme="dark"],\n.dark {\n`;
    for (const key of getOrderedScaleKeys(darkScales)) {
      const scale = darkScales[key];
      if (scale) {
        css += `  /* ${scale.role} */\n`;
        for (const step of scale.steps) {
          css += `  --${prefix}-${key}-${stepToVarSuffix(step.step)}: ${step.hex};\n`;
        }
        css += `\n`;
      }
    }
    css += `}\n`;
  }

  return css;
}

// Export as Tailwind config
export function exportAsTailwind(
  scales: ExportScales,
  darkScales: ExportScales | undefined,
  systemName: string
): string {
  const buildColorObject = (scalesData: ExportScales): Record<string, Record<string, string>> => {
    const colors: Record<string, Record<string, string>> = {};

    for (const key of getOrderedScaleKeys(scalesData)) {
      const scale = scalesData[key];
      if (scale) {
        colors[key] = {};
        for (const step of scale.steps) {
          colors[key][stepToVarSuffix(step.step)] = step.hex;
        }
      }
    }
    return colors;
  };

  const lightColors = buildColorObject(scales);

  let config = `// ${systemName} - Tailwind CSS Config\n`;
  config += `// Generated with Teul\n\n`;
  config += `module.exports = {\n`;
  config += `  theme: {\n`;
  config += `    extend: {\n`;
  config += `      colors: ${JSON.stringify(lightColors, null, 8)
    .replace(/"/g, "'")
    .split('\n')
    .map((line, i) => (i === 0 ? line : '      ' + line))
    .join('\n')},\n`;
  config += `    },\n`;
  config += `  },\n`;
  config += `};\n`;

  if (darkScales) {
    const darkColors = buildColorObject(darkScales);
    config += `\n// Dark mode colors (use with darkMode: 'class')\n`;
    config += `// Add to your CSS or use CSS variables approach:\n`;
    config += `/*\n${JSON.stringify(darkColors, null, 2)}\n*/\n`;
  }

  return config;
}

// Export as JSON
export function exportAsJSON(
  scales: ExportScales,
  darkScales: ExportScales | undefined,
  systemName: string
): string {
  const buildScaleObject = (scalesData: ExportScales): Record<string, ExportScaleData> => {
    const result: Record<string, ExportScaleData> = {};

    for (const key of getOrderedScaleKeys(scalesData)) {
      const scale = scalesData[key];
      if (scale) {
        result[key] = {
          name: scale.name,
          role: scale.role,
          profile: scale.profile,
          method: scale.method,
          mode: scale.mode,
          validation: scale.validation,
          colors: scale.steps.reduce(
            (acc, step) => {
              acc[stepToVarSuffix(step.step)] = step.hex;
              return acc;
            },
            {} as Record<string, string>
          ),
        };
      }
    }
    return result;
  };

  const data: ExportJSONData = {
    name: systemName,
    generatedAt: new Date().toISOString(),
    generator: 'Teul',
    light: buildScaleObject(scales),
  };

  if (darkScales) {
    data.dark = buildScaleObject(darkScales);
  }

  return JSON.stringify(data, null, 2);
}
