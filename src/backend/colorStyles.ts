// Color Styles Creation for Figma Backend
// Creates Figma color styles from a color system

import { hexToFigmaRgb } from './figmaHelpers';

// ============================================
// Type Definitions
// ============================================

interface CreateStylesScaleData {
  name: string;
  role: string;
  steps: { step: number; hex: string }[];
}

export interface CreateStylesData {
  systemName: string;
  includeDarkMode: boolean;
  scales: {
    light: {
      primary?: CreateStylesScaleData;
      secondary?: CreateStylesScaleData;
      tertiary?: CreateStylesScaleData;
      accent?: CreateStylesScaleData;
      neutral: CreateStylesScaleData;
      [key: string]: CreateStylesScaleData | undefined;
    };
    dark?: {
      primary?: CreateStylesScaleData;
      secondary?: CreateStylesScaleData;
      tertiary?: CreateStylesScaleData;
      accent?: CreateStylesScaleData;
      neutral: CreateStylesScaleData;
      [key: string]: CreateStylesScaleData | undefined;
    };
  };
}

// ============================================
// Helper Functions
// ============================================

// Convert step number to Radix-style name (1-12 → 50-1200)
function stepToStyleNumber(step: number): string {
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

// ============================================
// Main Public Function
// ============================================

/**
 * Create Figma color styles from a color system
 * Naming convention: [System Name]/[Mode]/[Role]/[Step]
 * e.g., "Brand Colors/Light/Primary/800"
 */
export async function createColorStyles(
  scalesData: CreateStylesData,
  systemName: string
): Promise<void> {
  const existingStyles = await figma.getLocalPaintStylesAsync();
  const existingStyleNames = new Set(existingStyles.map(s => s.name));

  // Collect all styles to create (batch processing for better performance)
  interface StyleToCreate {
    name: string;
    hex: string;
  }
  const stylesToCreate: StyleToCreate[] = [];

  // Helper to queue a style for creation
  const queueStyle = (styleName: string, hex: string) => {
    if (!existingStyleNames.has(styleName)) {
      stylesToCreate.push({ name: styleName, hex });
    }
  };

  // Queue scale styles
  const queueScaleStyles = (scales: CreateStylesData['scales']['light'], modePath: string) => {
    const styleScaleOrder = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;

    for (const key of styleScaleOrder) {
      const scale = scales[key];
      if (scale) {
        for (const step of scale.steps) {
          const styleName = `${modePath}/${scale.role}/${stepToStyleNumber(step.step)}`;
          queueStyle(styleName, step.hex);
        }
      }
    }
  };

  // Queue light mode styles
  const lightPath = scalesData.includeDarkMode ? `${systemName}/Light` : systemName;
  queueScaleStyles(scalesData.scales.light, lightPath);

  // Queue dark mode styles if available
  if (scalesData.includeDarkMode && scalesData.scales.dark) {
    const darkPath = `${systemName}/Dark`;
    queueScaleStyles(scalesData.scales.dark, darkPath);
  }

  // Queue semantic aliases
  const lightScales = scalesData.scales.light;
  const basePath = scalesData.includeDarkMode ? `${systemName}/Light` : systemName;

  const semanticAliases = [
    // Backgrounds
    { name: 'bg-app', scale: 'neutral', step: 1 },
    { name: 'bg-subtle', scale: 'neutral', step: 2 },
    { name: 'bg-muted', scale: 'neutral', step: 3 },
    // Foreground/Text
    { name: 'text-primary', scale: 'neutral', step: 12 },
    { name: 'text-secondary', scale: 'neutral', step: 11 },
    { name: 'text-muted', scale: 'neutral', step: 9 },
    // Borders
    { name: 'border-subtle', scale: 'neutral', step: 6 },
    { name: 'border-default', scale: 'neutral', step: 7 },
    { name: 'border-strong', scale: 'neutral', step: 8 },
  ];

  for (const alias of semanticAliases) {
    const scale = lightScales[alias.scale as keyof typeof lightScales];
    if (scale) {
      const step = scale.steps.find(s => s.step === alias.step);
      if (step) {
        queueStyle(`${basePath}/Semantic/${alias.name}`, step.hex);
      }
    }
  }

  // Queue primary color semantic aliases if available
  if (lightScales.primary) {
    const primaryAliases = [
      { name: 'primary-bg', step: 3 },
      { name: 'primary-bg-hover', step: 4 },
      { name: 'primary-solid', step: 9 },
      { name: 'primary-solid-hover', step: 10 },
      { name: 'primary-text', step: 11 },
    ];

    for (const alias of primaryAliases) {
      const step = lightScales.primary.steps.find(s => s.step === alias.step);
      if (step) {
        queueStyle(`${basePath}/Semantic/${alias.name}`, step.hex);
      }
    }
  }

  // Create all styles in batches for better performance
  const BATCH_SIZE = 20;
  let created = 0;

  for (let i = 0; i < stylesToCreate.length; i += BATCH_SIZE) {
    const batch = stylesToCreate.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(({ name, hex }) => {
        const style = figma.createPaintStyle();
        style.name = name;
        style.paints = [{ type: 'SOLID', color: hexToFigmaRgb(hex) }];
        created++;
        return Promise.resolve();
      })
    );
  }

  figma.notify(`Created ${created} color styles`);
}
