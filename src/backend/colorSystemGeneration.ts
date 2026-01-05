// Color System Frame Generation for Figma Backend
// Generates visual color system layouts in Figma

import { hexToFigmaRgb } from './figmaHelpers';

// ============================================
// Type Definitions
// ============================================

export interface ColorScaleData {
  name: string;
  role: string;
  steps: { step: number; hex: string }[];
}

export interface ColorSystemData {
  systemName: string;
  detailLevel: 'minimal' | 'detailed' | 'presentation';
  includeDarkMode: boolean;
  scaleMethod: 'custom' | 'radix';
  scales: {
    light: {
      primary?: ColorScaleData;
      secondary?: ColorScaleData;
      tertiary?: ColorScaleData;
      accent?: ColorScaleData;
      neutral: ColorScaleData;
      [key: string]: ColorScaleData | undefined;
    };
    dark?: {
      primary?: ColorScaleData;
      secondary?: ColorScaleData;
      tertiary?: ColorScaleData;
      accent?: ColorScaleData;
      neutral: ColorScaleData;
      [key: string]: ColorScaleData | undefined;
    };
  };
  usageProportions: {
    primary: number;
    secondary: number;
    tertiary: number;
    accent: number;
    neutral: number;
  };
}

interface ColorInfo {
  hex: string;
  name: string;
  role: string;
  luminance: number;
  saturation: number;
  hue: number;
}

// ============================================
// Constants
// ============================================

const SEMANTIC_LABELS: Record<number, { short: string; full: string }> = {
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

const FONT_LOAD_TIMEOUT = 5000;

// ============================================
// Utility Functions
// ============================================

function getRelativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function calculateContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getAccessibilityRating(contrast: number): { rating: string; color: RGB } {
  if (contrast >= 7) {
    return { rating: 'AAA', color: { r: 0.13, g: 0.55, b: 0.13 } };
  } else if (contrast >= 4.5) {
    return { rating: 'AA', color: { r: 0.2, g: 0.6, b: 0.86 } };
  } else if (contrast >= 3) {
    return { rating: 'AA Large', color: { r: 0.9, g: 0.65, b: 0.15 } };
  } else {
    return { rating: 'Fail', color: { r: 0.8, g: 0.2, b: 0.2 } };
  }
}

async function loadFontWithTimeout(family: string, style: string): Promise<boolean> {
  try {
    await Promise.race([
      figma.loadFontAsync({ family, style }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Font load timeout: ${family} ${style}`)),
          FONT_LOAD_TIMEOUT
        )
      ),
    ]);
    return true;
  } catch (error) {
    console.warn(`Failed to load font ${family} ${style}:`, error);
    return false;
  }
}

async function loadFonts(): Promise<boolean> {
  const fonts = [
    { family: 'Inter', style: 'Regular' },
    { family: 'Inter', style: 'Medium' },
    { family: 'Inter', style: 'Semi Bold' },
    { family: 'Inter', style: 'Bold' },
  ];

  const results = await Promise.all(fonts.map(f => loadFontWithTimeout(f.family, f.style)));

  const allLoaded = results.every(r => r);
  if (!allLoaded) {
    console.warn('Some fonts failed to load - text rendering may be affected');
  }
  return allLoaded;
}

// ============================================
// Node Creation Helpers
// ============================================

function createText(
  content: string,
  fontSize: number,
  fontStyle: 'Regular' | 'Medium' | 'Semi Bold' | 'Bold' = 'Regular',
  color: RGB = { r: 0.2, g: 0.2, b: 0.2 }
): TextNode {
  const text = figma.createText();
  text.fontName = { family: 'Inter', style: fontStyle };
  text.characters = content;
  text.fontSize = fontSize;
  text.fills = [{ type: 'SOLID', color }];
  return text;
}

function createColorSwatch(
  hex: string,
  width: number,
  height: number,
  cornerRadius: number = 4
): RectangleNode {
  const rect = figma.createRectangle();
  rect.resize(width, height);
  rect.cornerRadius = cornerRadius;
  rect.fills = [{ type: 'SOLID', color: hexToFigmaRgb(hex) }];
  rect.name = hex;
  return rect;
}

// ============================================
// Scale Row Creation
// ============================================

async function createScaleRow(
  scale: ColorScaleData,
  mode: 'light' | 'dark',
  showLabels: boolean = true,
  swatchSize: number = 40
): Promise<FrameNode> {
  const row = figma.createFrame();
  row.name = `${scale.name} Scale`;
  row.layoutMode = 'VERTICAL';
  row.primaryAxisSizingMode = 'AUTO';
  row.counterAxisSizingMode = 'AUTO';
  row.itemSpacing = 4;
  row.fills = [];

  // Role label
  if (showLabels) {
    const labelColor = mode === 'dark' ? { r: 0.9, g: 0.9, b: 0.9 } : { r: 0.3, g: 0.3, b: 0.3 };
    const label = createText(scale.role.toUpperCase(), 10, 'Bold', labelColor);
    label.letterSpacing = { value: 1, unit: 'PIXELS' };
    row.appendChild(label);
  }

  // Color swatches container
  const swatchesContainer = figma.createFrame();
  swatchesContainer.name = 'Swatches';
  swatchesContainer.layoutMode = 'HORIZONTAL';
  swatchesContainer.primaryAxisSizingMode = 'AUTO';
  swatchesContainer.counterAxisSizingMode = 'AUTO';
  swatchesContainer.itemSpacing = 2;
  swatchesContainer.fills = [];

  for (const step of scale.steps) {
    const swatchFrame = figma.createFrame();
    swatchFrame.name = `Step ${step.step}`;
    swatchFrame.layoutMode = 'VERTICAL';
    swatchFrame.primaryAxisSizingMode = 'AUTO';
    swatchFrame.counterAxisSizingMode = 'FIXED';
    swatchFrame.resize(swatchSize, swatchFrame.height);
    swatchFrame.itemSpacing = 2;
    swatchFrame.fills = [];
    swatchFrame.primaryAxisAlignItems = 'CENTER';

    const swatch = createColorSwatch(step.hex, swatchSize, swatchSize, 4);
    swatchFrame.appendChild(swatch);

    if (showLabels) {
      const hexLabel = createText(
        step.hex.toUpperCase().slice(1),
        7,
        'Regular',
        mode === 'dark' ? { r: 0.6, g: 0.6, b: 0.6 } : { r: 0.5, g: 0.5, b: 0.5 }
      );
      hexLabel.textAlignHorizontal = 'CENTER';
      swatchFrame.appendChild(hexLabel);
    }

    swatchesContainer.appendChild(swatchFrame);
  }

  row.appendChild(swatchesContainer);

  // Semantic labels row
  if (showLabels) {
    const labelsContainer = figma.createFrame();
    labelsContainer.name = 'Semantic Labels';
    labelsContainer.layoutMode = 'HORIZONTAL';
    labelsContainer.primaryAxisSizingMode = 'AUTO';
    labelsContainer.counterAxisSizingMode = 'AUTO';
    labelsContainer.itemSpacing = 2;
    labelsContainer.fills = [];

    for (let i = 1; i <= 12; i++) {
      const labelFrame = figma.createFrame();
      labelFrame.resize(swatchSize, 14);
      labelFrame.fills = [];
      labelFrame.layoutMode = 'VERTICAL';
      labelFrame.primaryAxisAlignItems = 'CENTER';
      labelFrame.counterAxisAlignItems = 'CENTER';
      labelFrame.primaryAxisSizingMode = 'FIXED';
      labelFrame.counterAxisSizingMode = 'FIXED';

      const semantic = SEMANTIC_LABELS[i];
      const label = createText(
        semantic.short,
        6,
        'Regular',
        mode === 'dark' ? { r: 0.5, g: 0.5, b: 0.5 } : { r: 0.6, g: 0.6, b: 0.6 }
      );
      label.textAlignHorizontal = 'CENTER';
      labelFrame.appendChild(label);
      labelsContainer.appendChild(labelFrame);
    }

    row.appendChild(labelsContainer);
  }

  // Accessibility badges for text steps (11 and 12)
  if (showLabels && scale.steps.length >= 12) {
    const accessibilityRow = figma.createFrame();
    accessibilityRow.name = 'Accessibility';
    accessibilityRow.layoutMode = 'HORIZONTAL';
    accessibilityRow.primaryAxisSizingMode = 'AUTO';
    accessibilityRow.counterAxisSizingMode = 'AUTO';
    accessibilityRow.itemSpacing = 2;
    accessibilityRow.fills = [];

    const bgColor = scale.steps[0].hex;

    for (let i = 1; i <= 12; i++) {
      const badgeFrame = figma.createFrame();
      badgeFrame.resize(swatchSize, 14);
      badgeFrame.fills = [];
      badgeFrame.layoutMode = 'VERTICAL';
      badgeFrame.primaryAxisAlignItems = 'CENTER';
      badgeFrame.counterAxisAlignItems = 'CENTER';
      badgeFrame.primaryAxisSizingMode = 'FIXED';
      badgeFrame.counterAxisSizingMode = 'FIXED';

      if (i === 9 || i === 11 || i === 12) {
        const contrast = calculateContrastRatio(scale.steps[i - 1].hex, bgColor);
        const { rating, color } = getAccessibilityRating(contrast);
        const badge = createText(rating, 6, 'Medium', color);
        badge.textAlignHorizontal = 'CENTER';
        badgeFrame.appendChild(badge);
      }

      accessibilityRow.appendChild(badgeFrame);
    }

    row.appendChild(accessibilityRow);
  }

  return row;
}

// ============================================
// Black & White Swatches
// ============================================

function createBWSwatches(size: number = 60): FrameNode {
  const container = figma.createFrame();
  container.name = 'Black & White';
  container.layoutMode = 'HORIZONTAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 8;
  container.fills = [];

  // Black
  const blackFrame = figma.createFrame();
  blackFrame.name = 'Black';
  blackFrame.layoutMode = 'VERTICAL';
  blackFrame.primaryAxisSizingMode = 'AUTO';
  blackFrame.counterAxisSizingMode = 'AUTO';
  blackFrame.itemSpacing = 4;
  blackFrame.fills = [];

  const blackSwatch = createColorSwatch('#000000', size, size, 4);
  blackFrame.appendChild(blackSwatch);

  const blackLabel = createText('Black', 10, 'Medium', { r: 0.3, g: 0.3, b: 0.3 });
  blackFrame.appendChild(blackLabel);

  // White
  const whiteFrame = figma.createFrame();
  whiteFrame.name = 'White';
  whiteFrame.layoutMode = 'VERTICAL';
  whiteFrame.primaryAxisSizingMode = 'AUTO';
  whiteFrame.counterAxisSizingMode = 'AUTO';
  whiteFrame.itemSpacing = 4;
  whiteFrame.fills = [];

  const whiteSwatch = createColorSwatch('#FFFFFF', size, size, 4);
  whiteSwatch.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
  whiteSwatch.strokeWeight = 1;
  whiteFrame.appendChild(whiteSwatch);

  const whiteLabel = createText('White', 10, 'Medium', { r: 0.3, g: 0.3, b: 0.3 });
  whiteFrame.appendChild(whiteLabel);

  container.appendChild(blackFrame);
  container.appendChild(whiteFrame);

  return container;
}

// ============================================
// Usage Proportion Bar
// ============================================

function createUsageProportionBar(
  proportions: {
    primary: number;
    secondary: number;
    tertiary: number;
    accent: number;
    neutral: number;
  },
  colors: {
    primary?: string;
    secondary?: string;
    tertiary?: string;
    accent?: string;
    neutral: string;
  },
  width: number = 400,
  mode: 'light' | 'dark' = 'light'
): FrameNode {
  const container = figma.createFrame();
  container.name = 'Usage Proportions';
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 8;
  container.fills = [];

  const labelColor = mode === 'dark' ? { r: 0.9, g: 0.9, b: 0.9 } : { r: 0.3, g: 0.3, b: 0.3 };
  const title = createText('USAGE PROPORTIONS', 10, 'Bold', labelColor);
  title.letterSpacing = { value: 1, unit: 'PIXELS' };
  container.appendChild(title);

  // Bar container
  const barFrame = figma.createFrame();
  barFrame.name = 'Bar';
  barFrame.layoutMode = 'HORIZONTAL';
  barFrame.primaryAxisSizingMode = 'AUTO';
  barFrame.counterAxisSizingMode = 'AUTO';
  barFrame.itemSpacing = 0;
  barFrame.fills = [];
  barFrame.cornerRadius = 4;
  barFrame.clipsContent = true;

  const total =
    proportions.primary +
    proportions.secondary +
    proportions.tertiary +
    proportions.accent +
    proportions.neutral;

  const segments = [
    { key: 'primary', color: colors.primary, proportion: proportions.primary },
    { key: 'secondary', color: colors.secondary, proportion: proportions.secondary },
    { key: 'tertiary', color: colors.tertiary, proportion: proportions.tertiary },
    { key: 'accent', color: colors.accent, proportion: proportions.accent },
    { key: 'neutral', color: colors.neutral, proportion: proportions.neutral },
  ].filter(s => s.color && s.proportion > 0);

  for (const segment of segments) {
    const segmentWidth = (segment.proportion / total) * width;
    const rect = figma.createRectangle();
    rect.resize(segmentWidth, 24);
    rect.fills = [{ type: 'SOLID', color: hexToFigmaRgb(segment.color!) }];
    rect.name = segment.key;
    barFrame.appendChild(rect);
  }

  container.appendChild(barFrame);

  // Legend
  const legendFrame = figma.createFrame();
  legendFrame.name = 'Legend';
  legendFrame.layoutMode = 'HORIZONTAL';
  legendFrame.primaryAxisSizingMode = 'AUTO';
  legendFrame.counterAxisSizingMode = 'AUTO';
  legendFrame.itemSpacing = 16;
  legendFrame.fills = [];

  for (const segment of segments) {
    const item = figma.createFrame();
    item.layoutMode = 'HORIZONTAL';
    item.primaryAxisSizingMode = 'AUTO';
    item.counterAxisSizingMode = 'AUTO';
    item.itemSpacing = 4;
    item.fills = [];
    item.counterAxisAlignItems = 'CENTER';

    const dot = createColorSwatch(segment.color!, 8, 8, 4);
    item.appendChild(dot);

    const label = createText(
      `${segment.key.charAt(0).toUpperCase() + segment.key.slice(1)}: ${segment.proportion}%`,
      9,
      'Regular',
      mode === 'dark' ? { r: 0.7, g: 0.7, b: 0.7 } : { r: 0.4, g: 0.4, b: 0.4 }
    );
    item.appendChild(label);

    legendFrame.appendChild(item);
  }

  container.appendChild(legendFrame);

  return container;
}

// ============================================
// Color Pairing Guide
// ============================================

function analyzeColor(hex: string, name: string, role: string): ColorInfo {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0,
    s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    hex,
    name,
    role,
    luminance: l,
    saturation: s,
    hue: h * 360,
  };
}

function getColorUseCase(color: ColorInfo): string {
  if (color.luminance > 0.7) return 'Backgrounds';
  if (color.luminance < 0.3) return 'Text & Details';
  if (color.saturation > 0.5) return 'Accents & CTAs';
  return 'Supporting Elements';
}

function generatePairingSuggestions(colors: ColorInfo[]): {
  pairs: { colors: ColorInfo[]; name: string; description: string }[];
  proportionStack: { color: ColorInfo; weight: number }[];
} {
  const pairs: { colors: ColorInfo[]; name: string; description: string }[] = [];

  if (colors.length < 2) {
    return { pairs: [], proportionStack: colors.map(c => ({ color: c, weight: 1 })) };
  }

  const byLuminance = [...colors].sort((a, b) => b.luminance - a.luminance);

  if (colors.length >= 2) {
    pairs.push({
      colors: [byLuminance[0], byLuminance[byLuminance.length - 1]],
      name: 'High Contrast',
      description: 'Maximum visual impact, great for headlines and CTAs',
    });
  }

  if (colors.length >= 2) {
    pairs.push({
      colors: [colors[0], colors[1]],
      name: 'Harmonious Duo',
      description: 'Balanced and cohesive, ideal for branded content',
    });
  }

  if (colors.length >= 3) {
    pairs.push({
      colors: [colors[0], colors[1], colors[2]],
      name: 'Core Trio',
      description: 'Rich palette for illustrations and marketing',
    });
  }

  if (colors.length >= 4) {
    pairs.push({
      colors: colors.slice(0, 4),
      name: 'Full Palette',
      description: 'Complete expression for maximum visual variety',
    });
  }

  const proportionStack = colors.map(c => {
    let weight: number;
    if (c.luminance > 0.65) weight = 40;
    else if (c.saturation > 0.6 && c.luminance < 0.5) weight = 10;
    else if (c.saturation > 0.5) weight = 20;
    else weight = 30;
    return { color: c, weight };
  });

  const totalWeight = proportionStack.reduce((sum, p) => sum + p.weight, 0);
  proportionStack.forEach(p => (p.weight = Math.round((p.weight / totalWeight) * 100)));

  return { pairs, proportionStack };
}

async function createColorPairingGuide(
  scales: ColorSystemData['scales']['light'],
  mode: 'light' | 'dark'
): Promise<FrameNode> {
  const textColor = mode === 'dark' ? { r: 0.95, g: 0.95, b: 0.95 } : { r: 0.1, g: 0.1, b: 0.1 };
  const mutedColor = mode === 'dark' ? { r: 0.6, g: 0.6, b: 0.6 } : { r: 0.5, g: 0.5, b: 0.5 };
  const bgColor = mode === 'dark' ? { r: 0.12, g: 0.12, b: 0.12 } : { r: 0.97, g: 0.97, b: 0.97 };

  const scaleOrder = ['primary', 'secondary', 'tertiary', 'accent'] as const;
  const colorInfos: ColorInfo[] = [];

  for (const key of scaleOrder) {
    const scale = scales[key];
    if (scale && scale.steps[8]) {
      colorInfos.push(analyzeColor(scale.steps[8].hex, scale.name, scale.role));
    }
  }

  if (colorInfos.length === 0) {
    const emptyFrame = figma.createFrame();
    emptyFrame.name = 'Color Pairing Guide';
    emptyFrame.resize(100, 100);
    return emptyFrame;
  }

  const { pairs, proportionStack } = generatePairingSuggestions(colorInfos);

  const container = figma.createFrame();
  container.name = 'Color Pairing Guide';
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 24;
  container.fills = [];

  const sectionTitle = createText('HOW TO USE THIS PALETTE', 11, 'Bold', mutedColor);
  sectionTitle.letterSpacing = { value: 1.5, unit: 'PIXELS' };
  container.appendChild(sectionTitle);

  // Proportion Stack
  const stackSection = figma.createFrame();
  stackSection.name = 'Visual Proportions';
  stackSection.layoutMode = 'HORIZONTAL';
  stackSection.primaryAxisSizingMode = 'AUTO';
  stackSection.counterAxisSizingMode = 'AUTO';
  stackSection.itemSpacing = 24;
  stackSection.fills = [];

  const stackFrame = figma.createFrame();
  stackFrame.name = 'Stack';
  stackFrame.layoutMode = 'VERTICAL';
  stackFrame.primaryAxisSizingMode = 'AUTO';
  stackFrame.counterAxisSizingMode = 'AUTO';
  stackFrame.itemSpacing = 2;
  stackFrame.cornerRadius = 8;
  stackFrame.clipsContent = true;
  stackFrame.fills = [];

  const sortedStack = [...proportionStack].sort((a, b) => b.weight - a.weight);

  for (const item of sortedStack) {
    const height = Math.max(20, (item.weight / 100) * 160);
    const rect = figma.createRectangle();
    rect.resize(100, height);
    rect.fills = [{ type: 'SOLID', color: hexToFigmaRgb(item.color.hex) }];
    rect.name = `${item.color.name} (${item.weight}%)`;
    stackFrame.appendChild(rect);
  }

  stackSection.appendChild(stackFrame);

  // Stack legend
  const stackLegend = figma.createFrame();
  stackLegend.name = 'Stack Legend';
  stackLegend.layoutMode = 'VERTICAL';
  stackLegend.primaryAxisSizingMode = 'AUTO';
  stackLegend.counterAxisSizingMode = 'AUTO';
  stackLegend.itemSpacing = 8;
  stackLegend.fills = [];

  const proportionTitle = createText('Suggested Proportions', 12, 'Semi Bold', textColor);
  stackLegend.appendChild(proportionTitle);

  for (const item of sortedStack) {
    const row = figma.createFrame();
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'AUTO';
    row.counterAxisSizingMode = 'AUTO';
    row.itemSpacing = 8;
    row.fills = [];
    row.counterAxisAlignItems = 'CENTER';

    const dot = createColorSwatch(item.color.hex, 12, 12, 6);
    row.appendChild(dot);

    const label = createText(`${item.color.name}: ${item.weight}%`, 11, 'Regular', textColor);
    row.appendChild(label);

    const useCase = createText(`(${getColorUseCase(item.color)})`, 10, 'Regular', mutedColor);
    row.appendChild(useCase);

    stackLegend.appendChild(row);
  }

  stackSection.appendChild(stackLegend);
  container.appendChild(stackSection);

  // Suggested Pairings
  const pairingsSection = figma.createFrame();
  pairingsSection.name = 'Suggested Pairings';
  pairingsSection.layoutMode = 'VERTICAL';
  pairingsSection.primaryAxisSizingMode = 'AUTO';
  pairingsSection.counterAxisSizingMode = 'AUTO';
  pairingsSection.itemSpacing = 16;
  pairingsSection.fills = [];

  const pairingsTitle = createText('Color Combinations', 12, 'Semi Bold', textColor);
  pairingsSection.appendChild(pairingsTitle);

  const pairingsGrid = figma.createFrame();
  pairingsGrid.name = 'Pairings Grid';
  pairingsGrid.layoutMode = 'HORIZONTAL';
  pairingsGrid.primaryAxisSizingMode = 'AUTO';
  pairingsGrid.counterAxisSizingMode = 'AUTO';
  pairingsGrid.itemSpacing = 16;
  pairingsGrid.fills = [];

  for (const pair of pairs) {
    const pairCard = figma.createFrame();
    pairCard.name = pair.name;
    pairCard.layoutMode = 'VERTICAL';
    pairCard.primaryAxisSizingMode = 'AUTO';
    pairCard.counterAxisSizingMode = 'AUTO';
    pairCard.itemSpacing = 8;
    pairCard.paddingLeft = 12;
    pairCard.paddingRight = 12;
    pairCard.paddingTop = 12;
    pairCard.paddingBottom = 12;
    pairCard.cornerRadius = 8;
    pairCard.fills = [{ type: 'SOLID', color: bgColor }];

    const swatchesRow = figma.createFrame();
    swatchesRow.name = 'Swatches';
    swatchesRow.layoutMode = 'HORIZONTAL';
    swatchesRow.primaryAxisSizingMode = 'AUTO';
    swatchesRow.counterAxisSizingMode = 'AUTO';
    swatchesRow.itemSpacing = -8;
    swatchesRow.fills = [];

    for (const color of pair.colors) {
      const swatch = figma.createEllipse();
      swatch.resize(32, 32);
      swatch.fills = [{ type: 'SOLID', color: hexToFigmaRgb(color.hex) }];
      swatch.strokes = [
        {
          type: 'SOLID',
          color: mode === 'dark' ? { r: 0.2, g: 0.2, b: 0.2 } : { r: 1, g: 1, b: 1 },
        },
      ];
      swatch.strokeWeight = 2;
      swatchesRow.appendChild(swatch);
    }

    pairCard.appendChild(swatchesRow);

    const pairName = createText(pair.name, 11, 'Semi Bold', textColor);
    pairCard.appendChild(pairName);

    const pairDesc = createText(pair.description, 9, 'Regular', mutedColor);
    pairDesc.resize(140, pairDesc.height);
    pairDesc.textAutoResize = 'HEIGHT';
    pairCard.appendChild(pairDesc);

    pairingsGrid.appendChild(pairCard);
  }

  pairingsSection.appendChild(pairingsGrid);
  container.appendChild(pairingsSection);

  // Use Case Suggestions
  const useCaseSection = figma.createFrame();
  useCaseSection.name = 'Use Cases';
  useCaseSection.layoutMode = 'VERTICAL';
  useCaseSection.primaryAxisSizingMode = 'AUTO';
  useCaseSection.counterAxisSizingMode = 'AUTO';
  useCaseSection.itemSpacing = 12;
  useCaseSection.fills = [];

  const useCaseTitle = createText('Quick Reference', 12, 'Semi Bold', textColor);
  useCaseSection.appendChild(useCaseTitle);

  const useCases = [
    { label: 'Marketing & Social', suggestion: 'Use Full Palette or Core Trio for visual energy' },
    { label: 'Website Sections', suggestion: 'Dominant color as background, others as accents' },
    { label: 'Illustrations', suggestion: 'All colors work together — vary saturation for depth' },
    { label: 'UI Elements', suggestion: 'High Contrast pair for buttons and interactive states' },
  ];

  for (const useCase of useCases) {
    const row = figma.createFrame();
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'AUTO';
    row.counterAxisSizingMode = 'AUTO';
    row.itemSpacing = 8;
    row.fills = [];

    const bullet = createText('→', 10, 'Regular', mutedColor);
    row.appendChild(bullet);

    const labelText = createText(`${useCase.label}:`, 10, 'Semi Bold', textColor);
    row.appendChild(labelText);

    const suggestionText = createText(useCase.suggestion, 10, 'Regular', mutedColor);
    row.appendChild(suggestionText);

    useCaseSection.appendChild(row);
  }

  container.appendChild(useCaseSection);

  return container;
}

// ============================================
// Layout Generators
// ============================================

async function generateMinimalLayout(
  scales: ColorSystemData['scales']['light'],
  mode: 'light' | 'dark'
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = `Color Scales (${mode})`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 16;
  frame.paddingLeft = 24;
  frame.paddingRight = 24;
  frame.paddingTop = 24;
  frame.paddingBottom = 24;
  frame.cornerRadius = 12;
  frame.fills = [
    {
      type: 'SOLID',
      color: mode === 'dark' ? { r: 0.1, g: 0.1, b: 0.1 } : { r: 0.98, g: 0.98, b: 0.98 },
    },
  ];

  const scaleOrder = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;
  for (const key of scaleOrder) {
    const scale = scales[key];
    if (scale) {
      const row = await createScaleRow(scale, mode, true, 36);
      frame.appendChild(row);
    }
  }

  return frame;
}

async function generateDetailedLayout(
  scales: ColorSystemData['scales']['light'],
  proportions: ColorSystemData['usageProportions'],
  mode: 'light' | 'dark'
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = `Color System (${mode})`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 24;
  frame.paddingLeft = 32;
  frame.paddingRight = 32;
  frame.paddingTop = 32;
  frame.paddingBottom = 32;
  frame.cornerRadius = 16;
  frame.fills = [
    {
      type: 'SOLID',
      color: mode === 'dark' ? { r: 0.1, g: 0.1, b: 0.1 } : { r: 0.98, g: 0.98, b: 0.98 },
    },
  ];

  const colors = {
    primary: scales.primary?.steps[8]?.hex,
    secondary: scales.secondary?.steps[8]?.hex,
    tertiary: scales.tertiary?.steps[8]?.hex,
    accent: scales.accent?.steps[8]?.hex,
    neutral: scales.neutral.steps[8].hex,
  };
  const proportionBar = createUsageProportionBar(proportions, colors, 500, mode);
  frame.appendChild(proportionBar);

  const divider = figma.createRectangle();
  divider.resize(500, 1);
  divider.fills = [
    {
      type: 'SOLID',
      color: mode === 'dark' ? { r: 0.2, g: 0.2, b: 0.2 } : { r: 0.9, g: 0.9, b: 0.9 },
    },
  ];
  frame.appendChild(divider);

  const scaleOrder = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;
  for (const key of scaleOrder) {
    const scale = scales[key];
    if (scale) {
      const row = await createScaleRow(scale, mode, true, 40);
      frame.appendChild(row);
    }
  }

  const pairingDivider = figma.createRectangle();
  pairingDivider.resize(500, 1);
  pairingDivider.fills = [
    {
      type: 'SOLID',
      color: mode === 'dark' ? { r: 0.2, g: 0.2, b: 0.2 } : { r: 0.9, g: 0.9, b: 0.9 },
    },
  ];
  frame.appendChild(pairingDivider);

  const pairingGuide = await createColorPairingGuide(scales, mode);
  frame.appendChild(pairingGuide);

  return frame;
}

async function generatePresentationLayout(
  systemName: string,
  scales: ColorSystemData['scales']['light'],
  proportions: ColorSystemData['usageProportions'],
  mode: 'light' | 'dark'
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = `${systemName} - ${mode === 'dark' ? 'Dark' : 'Light'} Mode`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 32;
  frame.paddingLeft = 40;
  frame.paddingRight = 40;
  frame.paddingTop = 40;
  frame.paddingBottom = 40;
  frame.cornerRadius = 20;
  frame.fills = [
    {
      type: 'SOLID',
      color: mode === 'dark' ? { r: 0.08, g: 0.08, b: 0.08 } : { r: 1, g: 1, b: 1 },
    },
  ];

  const textColor = mode === 'dark' ? { r: 0.95, g: 0.95, b: 0.95 } : { r: 0.1, g: 0.1, b: 0.1 };
  const mutedColor = mode === 'dark' ? { r: 0.6, g: 0.6, b: 0.6 } : { r: 0.5, g: 0.5, b: 0.5 };

  // Header
  const header = figma.createFrame();
  header.name = 'Header';
  header.layoutMode = 'VERTICAL';
  header.primaryAxisSizingMode = 'AUTO';
  header.counterAxisSizingMode = 'AUTO';
  header.itemSpacing = 8;
  header.fills = [];

  const title = createText(systemName, 28, 'Bold', textColor);
  header.appendChild(title);

  const subtitle = createText(
    `${mode === 'dark' ? 'Dark' : 'Light'} Mode Color System`,
    14,
    'Regular',
    mutedColor
  );
  header.appendChild(subtitle);

  frame.appendChild(header);

  // Primary Palette Section
  const primarySection = figma.createFrame();
  primarySection.name = 'Primary Palette';
  primarySection.layoutMode = 'VERTICAL';
  primarySection.primaryAxisSizingMode = 'AUTO';
  primarySection.counterAxisSizingMode = 'AUTO';
  primarySection.itemSpacing = 16;
  primarySection.fills = [];

  const primaryTitle = createText('PRIMARY PALETTE', 11, 'Bold', mutedColor);
  primaryTitle.letterSpacing = { value: 1.5, unit: 'PIXELS' };
  primarySection.appendChild(primaryTitle);

  const primaryRow = figma.createFrame();
  primaryRow.name = 'Primary Colors';
  primaryRow.layoutMode = 'HORIZONTAL';
  primaryRow.primaryAxisSizingMode = 'AUTO';
  primaryRow.counterAxisSizingMode = 'AUTO';
  primaryRow.itemSpacing = 16;
  primaryRow.fills = [];

  const bw = createBWSwatches(80);
  primaryRow.appendChild(bw);

  const mainColors = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;
  for (const key of mainColors) {
    const scale = scales[key];
    if (scale && scale.steps[8]) {
      const colorFrame = figma.createFrame();
      colorFrame.name = scale.role;
      colorFrame.layoutMode = 'VERTICAL';
      colorFrame.primaryAxisSizingMode = 'AUTO';
      colorFrame.counterAxisSizingMode = 'AUTO';
      colorFrame.itemSpacing = 4;
      colorFrame.fills = [];

      const swatch = createColorSwatch(scale.steps[8].hex, 80, 80, 4);
      colorFrame.appendChild(swatch);

      const label = createText(scale.role, 10, 'Medium', mutedColor);
      colorFrame.appendChild(label);

      const hexLabel = createText(scale.steps[8].hex.toUpperCase(), 9, 'Regular', mutedColor);
      colorFrame.appendChild(hexLabel);

      primaryRow.appendChild(colorFrame);
    }
  }

  primarySection.appendChild(primaryRow);
  frame.appendChild(primarySection);

  // Usage Proportions
  const colors = {
    primary: scales.primary?.steps[8]?.hex,
    secondary: scales.secondary?.steps[8]?.hex,
    accent: scales.accent?.steps[8]?.hex,
    neutral: scales.neutral.steps[8].hex,
  };
  const proportionBar = createUsageProportionBar(proportions, colors, 600, mode);
  frame.appendChild(proportionBar);

  // Semantic Categories Section
  const semanticSection = figma.createFrame();
  semanticSection.name = 'Semantic Categories';
  semanticSection.layoutMode = 'VERTICAL';
  semanticSection.primaryAxisSizingMode = 'AUTO';
  semanticSection.counterAxisSizingMode = 'AUTO';
  semanticSection.itemSpacing = 24;
  semanticSection.fills = [];

  const semanticTitle = createText('SEMANTIC USAGE GUIDE', 11, 'Bold', mutedColor);
  semanticTitle.letterSpacing = { value: 1.5, unit: 'PIXELS' };
  semanticSection.appendChild(semanticTitle);

  const semanticGroups = [
    {
      name: 'BACKGROUNDS',
      steps: [1, 2, 3, 4, 5],
      description: 'App backgrounds, UI elements, hover & active states',
    },
    {
      name: 'BORDERS',
      steps: [6, 7, 8],
      description: 'Subtle borders, default borders, focus rings',
    },
    { name: 'INTERACTIVE', steps: [9, 10], description: 'Buttons, badges, solid backgrounds' },
    { name: 'TEXT', steps: [11, 12], description: 'Secondary and primary text colors' },
  ];

  for (const group of semanticGroups) {
    const groupFrame = figma.createFrame();
    groupFrame.name = group.name;
    groupFrame.layoutMode = 'VERTICAL';
    groupFrame.primaryAxisSizingMode = 'AUTO';
    groupFrame.counterAxisSizingMode = 'AUTO';
    groupFrame.itemSpacing = 8;
    groupFrame.fills = [];

    const groupTitleRow = figma.createFrame();
    groupTitleRow.layoutMode = 'HORIZONTAL';
    groupTitleRow.primaryAxisSizingMode = 'AUTO';
    groupTitleRow.counterAxisSizingMode = 'AUTO';
    groupTitleRow.itemSpacing = 12;
    groupTitleRow.fills = [];

    const groupTitle = createText(group.name, 10, 'Bold', textColor);
    groupTitle.letterSpacing = { value: 1, unit: 'PIXELS' };
    groupTitleRow.appendChild(groupTitle);

    const groupDesc = createText(group.description, 9, 'Regular', mutedColor);
    groupTitleRow.appendChild(groupDesc);
    groupFrame.appendChild(groupTitleRow);

    const roleSwatches = figma.createFrame();
    roleSwatches.layoutMode = 'HORIZONTAL';
    roleSwatches.primaryAxisSizingMode = 'AUTO';
    roleSwatches.counterAxisSizingMode = 'AUTO';
    roleSwatches.itemSpacing = 16;
    roleSwatches.fills = [];

    const roles = ['primary', 'secondary', 'accent', 'neutral'] as const;
    for (const roleKey of roles) {
      const scale = scales[roleKey];
      if (!scale) continue;

      const roleColumn = figma.createFrame();
      roleColumn.layoutMode = 'VERTICAL';
      roleColumn.primaryAxisSizingMode = 'AUTO';
      roleColumn.counterAxisSizingMode = 'AUTO';
      roleColumn.itemSpacing = 4;
      roleColumn.fills = [];

      const roleLabel = createText(roleKey.toUpperCase(), 7, 'Medium', mutedColor);
      roleColumn.appendChild(roleLabel);

      const swatchRow = figma.createFrame();
      swatchRow.layoutMode = 'HORIZONTAL';
      swatchRow.primaryAxisSizingMode = 'AUTO';
      swatchRow.counterAxisSizingMode = 'AUTO';
      swatchRow.itemSpacing = 2;
      swatchRow.fills = [];

      for (const stepNum of group.steps) {
        const step = scale.steps[stepNum - 1];
        if (!step) continue;

        const swatchContainer = figma.createFrame();
        swatchContainer.layoutMode = 'VERTICAL';
        swatchContainer.primaryAxisSizingMode = 'AUTO';
        swatchContainer.counterAxisSizingMode = 'AUTO';
        swatchContainer.itemSpacing = 2;
        swatchContainer.fills = [];

        const swatch = createColorSwatch(step.hex, 32, 32, 4);
        swatchContainer.appendChild(swatch);

        const semantic = SEMANTIC_LABELS[stepNum];
        const stepLabel = createText(semantic.short, 5, 'Regular', mutedColor);
        swatchContainer.appendChild(stepLabel);

        if (stepNum === 11 || stepNum === 12) {
          const bgColor = scale.steps[0].hex;
          const contrast = calculateContrastRatio(step.hex, bgColor);
          const { rating, color } = getAccessibilityRating(contrast);
          const badge = createText(rating, 5, 'Medium', color);
          swatchContainer.appendChild(badge);
        }

        swatchRow.appendChild(swatchContainer);
      }

      roleColumn.appendChild(swatchRow);
      roleSwatches.appendChild(roleColumn);
    }

    groupFrame.appendChild(roleSwatches);
    semanticSection.appendChild(groupFrame);
  }

  frame.appendChild(semanticSection);

  // Extended Palette Section
  const extendedSection = figma.createFrame();
  extendedSection.name = 'Extended Palette';
  extendedSection.layoutMode = 'VERTICAL';
  extendedSection.primaryAxisSizingMode = 'AUTO';
  extendedSection.counterAxisSizingMode = 'AUTO';
  extendedSection.itemSpacing = 16;
  extendedSection.fills = [];

  const extendedTitle = createText('FULL COLOR SCALES', 11, 'Bold', mutedColor);
  extendedTitle.letterSpacing = { value: 1.5, unit: 'PIXELS' };
  extendedSection.appendChild(extendedTitle);

  const extendedScaleOrder = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;
  for (const key of extendedScaleOrder) {
    const scale = scales[key];
    if (scale) {
      const row = await createScaleRow(scale, mode, true, 48);
      extendedSection.appendChild(row);
    }
  }

  frame.appendChild(extendedSection);

  const pairingGuide = await createColorPairingGuide(scales, mode);
  frame.appendChild(pairingGuide);

  return frame;
}

// ============================================
// Main Public Function
// ============================================

export async function generateColorSystemFrames(
  _config: unknown,
  scalesData: ColorSystemData
): Promise<void> {
  await loadFonts();

  const { detailLevel, includeDarkMode, systemName, scaleMethod } = scalesData;
  const { light: lightScales, dark: darkScales } = scalesData.scales;

  const container = figma.createFrame();
  const methodLabel = scaleMethod === 'custom' ? 'Custom Scales' : 'Radix Matched';
  container.name = `Color System - ${systemName} (${methodLabel})`;
  container.layoutMode = 'HORIZONTAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 32;
  container.fills = [];

  let lightFrame: FrameNode;
  switch (detailLevel) {
    case 'minimal':
      lightFrame = await generateMinimalLayout(lightScales, 'light');
      break;
    case 'detailed':
      lightFrame = await generateDetailedLayout(lightScales, scalesData.usageProportions, 'light');
      break;
    case 'presentation':
      lightFrame = await generatePresentationLayout(
        systemName,
        lightScales,
        scalesData.usageProportions,
        'light'
      );
      break;
    default:
      lightFrame = await generateDetailedLayout(lightScales, scalesData.usageProportions, 'light');
  }
  container.appendChild(lightFrame);

  if (includeDarkMode && darkScales) {
    let darkFrame: FrameNode;
    switch (detailLevel) {
      case 'minimal':
        darkFrame = await generateMinimalLayout(darkScales, 'dark');
        break;
      case 'detailed':
        darkFrame = await generateDetailedLayout(darkScales, scalesData.usageProportions, 'dark');
        break;
      case 'presentation':
        darkFrame = await generatePresentationLayout(
          systemName,
          darkScales,
          scalesData.usageProportions,
          'dark'
        );
        break;
      default:
        darkFrame = await generateDetailedLayout(darkScales, scalesData.usageProportions, 'dark');
    }
    container.appendChild(darkFrame);
  }

  const selection = figma.currentPage.selection;
  if (selection.length > 0) {
    const bounds = selection[0];
    container.x = bounds.x + bounds.width + 48;
    container.y = bounds.y;
  } else {
    container.x = figma.viewport.center.x - container.width / 2;
    container.y = figma.viewport.center.y - container.height / 2;
  }

  figma.currentPage.selection = [container];
  figma.viewport.scrollAndZoomIntoView([container]);

  figma.notify(
    `Created "${systemName}" color system with ${includeDarkMode ? 'light & dark modes' : 'light mode'}`
  );
}
