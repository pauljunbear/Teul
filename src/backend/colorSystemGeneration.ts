// Color System Frame Generation for Figma Backend
// Generates visual color system layouts in Figma

import { hexToFigmaRgb } from './figmaHelpers';
import type {
  SemanticColorModeReport,
  SemanticColorPolicyReport,
} from '../lib/semanticColorPolicy';
import { isSemanticColorPolicyCurrent } from '../lib/semanticColorPolicy';
import { areAllScalesExactRadix, haveExactRadixScaleClaims } from '../lib/radixColors';
import { getWCAGContrastHex, getWCAGRating } from '../lib/accessibility';
import type { ColorScaleData, ColorSystemData } from '../types/colorSystem';
import { RADIX_STEP_LABELS, type ColorSystemLayoutContext } from './colorSystemLayoutContext';
import { generateMinimalColorSystemLayout } from './colorSystemMinimalLayout';
import { generateDetailedColorSystemLayout } from './colorSystemDetailedLayout';
import { generatePresentationColorSystemLayout } from './colorSystemPresentationLayout';
import { getColorSystemDocumentName, getOrderedColorScaleKeys } from './colorSystemDocumentModel';
export type { ColorSystemData } from '../types/colorSystem';

// ============================================
// Type Definitions
// ============================================

type SemanticMode = 'light' | 'dark';

// ============================================
// Constants
// ============================================

const FONT_LOAD_TIMEOUT = 5000;

interface GenerationOperation {
  nodes: Set<SceneNode>;
}

interface GenerateColorSystemFramesOptions {
  notify?: boolean;
}

let activeGenerationOperation: GenerationOperation | null = null;

// ============================================
// Utility Functions
// ============================================

function beginGenerationOperation(): GenerationOperation {
  if (activeGenerationOperation) {
    throw new Error('Color system generation is already in progress');
  }

  const operation = { nodes: new Set<SceneNode>() };
  activeGenerationOperation = operation;
  return operation;
}

function finishGenerationOperation(operation: GenerationOperation): void {
  if (activeGenerationOperation === operation) {
    activeGenerationOperation = null;
  }
}

function trackCreatedNode<T extends SceneNode>(node: T): T {
  if (!activeGenerationOperation) {
    throw new Error('Color system nodes must be created within a generation operation');
  }

  activeGenerationOperation.nodes.add(node);
  return node;
}

function createOwnedFrame(): FrameNode {
  return trackCreatedNode(figma.createFrame());
}

function createOwnedRectangle(): RectangleNode {
  return trackCreatedNode(figma.createRectangle());
}

function createOwnedText(): TextNode {
  return trackCreatedNode(figma.createText());
}

function removeOwnedNodes(operation: GenerationOperation): void {
  const ownedRoots = [...operation.nodes].filter(
    node => !operation.nodes.has(node.parent as SceneNode)
  );

  for (const node of ownedRoots.reverse()) {
    try {
      node.remove();
    } catch (cleanupError) {
      console.error('Failed to remove partial color system node:', cleanupError);
    }
  }
}

function getAccessibilityRating(contrast: number): { rating: string; color: RGB } {
  const rating = getWCAGRating(contrast).level;
  if (rating === 'AAA') {
    return { rating: 'AAA', color: { r: 0.13, g: 0.55, b: 0.13 } };
  } else if (rating === 'AA') {
    return { rating: 'AA', color: { r: 0.2, g: 0.6, b: 0.86 } };
  } else if (rating === 'AA Large') {
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
  const text = createOwnedText();
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
  const rect = createOwnedRectangle();
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
  swatchSize: number = 40,
  showRadixGuidance: boolean = false
): Promise<FrameNode> {
  const row = createOwnedFrame();
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
    if (scale.method || scale.profile) {
      row.appendChild(
        createText(
          [scale.method, scale.profile].filter(Boolean).join(' · '),
          7,
          'Regular',
          labelColor
        )
      );
    }
  }

  // Color swatches container
  const swatchesContainer = createOwnedFrame();
  swatchesContainer.name = 'Swatches';
  swatchesContainer.layoutMode = 'HORIZONTAL';
  swatchesContainer.primaryAxisSizingMode = 'AUTO';
  swatchesContainer.counterAxisSizingMode = 'AUTO';
  swatchesContainer.itemSpacing = 2;
  swatchesContainer.fills = [];

  for (const step of scale.steps) {
    const swatchFrame = createOwnedFrame();
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

  // Radix step-use labels are source guidance, not generic generated-scale semantics.
  if (showLabels && showRadixGuidance) {
    const labelsContainer = createOwnedFrame();
    labelsContainer.name = 'Semantic Labels';
    labelsContainer.layoutMode = 'HORIZONTAL';
    labelsContainer.primaryAxisSizingMode = 'AUTO';
    labelsContainer.counterAxisSizingMode = 'AUTO';
    labelsContainer.itemSpacing = 2;
    labelsContainer.fills = [];

    for (let i = 1; i <= 12; i++) {
      const labelFrame = createOwnedFrame();
      labelFrame.resize(swatchSize, 14);
      labelFrame.fills = [];
      labelFrame.layoutMode = 'VERTICAL';
      labelFrame.primaryAxisAlignItems = 'CENTER';
      labelFrame.counterAxisAlignItems = 'CENTER';
      labelFrame.primaryAxisSizingMode = 'FIXED';
      labelFrame.counterAxisSizingMode = 'FIXED';

      const semantic = RADIX_STEP_LABELS[i];
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
  if (showLabels && showRadixGuidance && scale.steps.length >= 12) {
    const accessibilityRow = createOwnedFrame();
    accessibilityRow.name = 'Accessibility';
    accessibilityRow.layoutMode = 'HORIZONTAL';
    accessibilityRow.primaryAxisSizingMode = 'AUTO';
    accessibilityRow.counterAxisSizingMode = 'AUTO';
    accessibilityRow.itemSpacing = 2;
    accessibilityRow.fills = [];

    const bgColor = scale.steps[0].hex;

    for (let i = 1; i <= 12; i++) {
      const badgeFrame = createOwnedFrame();
      badgeFrame.resize(swatchSize, 14);
      badgeFrame.fills = [];
      badgeFrame.layoutMode = 'VERTICAL';
      badgeFrame.primaryAxisAlignItems = 'CENTER';
      badgeFrame.counterAxisAlignItems = 'CENTER';
      badgeFrame.primaryAxisSizingMode = 'FIXED';
      badgeFrame.counterAxisSizingMode = 'FIXED';

      if (i === 9 || i === 11 || i === 12) {
        const contrast = getWCAGContrastHex(scale.steps[i - 1].hex, bgColor);
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
  const container = createOwnedFrame();
  container.name = 'Black & White';
  container.layoutMode = 'HORIZONTAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 8;
  container.fills = [];

  // Black
  const blackFrame = createOwnedFrame();
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
  const whiteFrame = createOwnedFrame();
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

function createSemanticPolicyReport(
  policy: SemanticColorPolicyReport,
  report: SemanticColorModeReport,
  mode: SemanticMode
): FrameNode {
  const container = createOwnedFrame();
  container.name = `WCAG Policy Report (${mode})`;
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 8;
  container.paddingLeft = 16;
  container.paddingRight = 16;
  container.paddingTop = 16;
  container.paddingBottom = 16;
  container.cornerRadius = 8;
  container.fills = [
    {
      type: 'SOLID',
      color: mode === 'dark' ? { r: 0.15, g: 0.15, b: 0.15 } : { r: 0.95, g: 0.95, b: 0.95 },
    },
  ];

  const textColor = mode === 'dark' ? { r: 0.95, g: 0.95, b: 0.95 } : { r: 0.1, g: 0.1, b: 0.1 };
  const mutedColor = mode === 'dark' ? { r: 0.7, g: 0.7, b: 0.7 } : { r: 0.4, g: 0.4, b: 0.4 };
  const statusColor = report.valid ? { r: 0.13, g: 0.55, b: 0.13 } : { r: 0.8, g: 0.2, b: 0.2 };

  container.appendChild(createText('WCAG 2.2 SEMANTIC TOKEN POLICY', 11, 'Bold', textColor));
  container.appendChild(
    createText(`${policy.standard} · ${policy.level}`, 10, 'Semi Bold', textColor)
  );
  container.appendChild(
    createText(report.valid ? 'MODE PASS' : 'MODE FAIL', 9, 'Bold', statusColor)
  );
  container.appendChild(
    createText(
      'Scope: declared semantic token pairings only; this is not whole-design WCAG conformance.',
      8,
      'Regular',
      mutedColor
    )
  );

  const tokens = Object.values(report.tokens);
  if (tokens.length > 0) {
    container.appendChild(
      createText(`${mode.toUpperCase()} TOKENS (${tokens.length})`, 9, 'Bold', textColor)
    );
    for (const token of tokens) {
      const row = createOwnedFrame();
      row.name = `Semantic Token - ${token.name}`;
      row.layoutMode = 'HORIZONTAL';
      row.primaryAxisSizingMode = 'AUTO';
      row.counterAxisSizingMode = 'AUTO';
      row.itemSpacing = 8;
      row.fills = [];
      row.counterAxisAlignItems = 'CENTER';
      row.appendChild(createColorSwatch(token.value, 16, 16, 3));
      row.appendChild(
        createText(`${token.name} · ${token.value.toUpperCase()}`, 8, 'Regular', textColor)
      );
      container.appendChild(row);
    }
  }

  if (report.pairings.length > 0) {
    const passedPairings = report.pairings.filter(pairing => pairing.pass).length;
    container.appendChild(
      createText(
        `TESTED PAIRINGS (${passedPairings}/${report.pairings.length} pass)`,
        9,
        'Bold',
        textColor
      )
    );
    for (const pairing of report.pairings) {
      const details = [
        pairing.useCase,
        `${pairing.ratio.toFixed(2)}:1`,
        `required ${pairing.minimumRatio.toFixed(1)}:1`,
        pairing.pass ? 'PASS' : 'FAIL',
      ];
      container.appendChild(
        createText(
          details.join(' · '),
          8,
          'Regular',
          pairing.pass ? mutedColor : { r: 0.8, g: 0.2, b: 0.2 }
        )
      );
    }
  }

  return container;
}

const layoutContext: ColorSystemLayoutContext = {
  createFrame: createOwnedFrame,
  createText,
  createColorSwatch,
  createScaleRow,
  createBWSwatches,
  createSemanticPolicyReport,
  getOrderedScaleKeys: getOrderedColorScaleKeys,
  getAccessibilityRating,
  getWCAGContrastHex,
};

// ============================================
// Main Public Function
// ============================================

export async function generateColorSystemFrames(
  _config: unknown,
  scalesData: ColorSystemData,
  options: GenerateColorSystemFramesOptions = {}
): Promise<FrameNode> {
  if (!haveExactRadixScaleClaims(scalesData.scales.light, scalesData.scales.dark)) {
    throw new Error('Exact Radix Colors claims must match the pinned bundled values');
  }
  if (
    scalesData.scaleMethod === 'radix-match' &&
    !areAllScalesExactRadix(scalesData.scales.light, scalesData.scales.dark)
  ) {
    throw new Error('Exact Radix Colors mode requires only pinned bundled values');
  }

  if (
    scalesData.scaleMethod === 'wcag-constrained' &&
    !isSemanticColorPolicyCurrent(
      scalesData.scales.light,
      scalesData.scales.dark,
      scalesData.semanticPolicy
    )
  ) {
    throw new Error('WCAG-constrained semantic token policy is stale or invalid');
  }

  const operation = beginGenerationOperation();
  try {
    const fontsLoaded = await loadFonts();
    if (!fontsLoaded) {
      throw new Error('Unable to generate color system: required fonts failed to load');
    }

    const { detailLevel, includeDarkMode, systemName, scaleMethod } = scalesData;
    const { light: lightScales, dark: darkScales } = scalesData.scales;
    const semanticPolicy =
      scaleMethod === 'wcag-constrained' ? scalesData.semanticPolicy : undefined;

    const container = createOwnedFrame();
    container.name = getColorSystemDocumentName(scalesData);
    container.layoutMode = 'HORIZONTAL';
    container.primaryAxisSizingMode = 'AUTO';
    container.counterAxisSizingMode = 'AUTO';
    container.itemSpacing = 32;
    container.fills = [];

    let lightFrame: FrameNode;
    switch (detailLevel) {
      case 'minimal':
        lightFrame = await generateMinimalColorSystemLayout(
          layoutContext,
          lightScales,
          'light',
          scaleMethod,
          semanticPolicy
        );
        break;
      case 'detailed':
        lightFrame = await generateDetailedColorSystemLayout(
          layoutContext,
          lightScales,
          'light',
          scaleMethod,
          semanticPolicy
        );
        break;
      case 'presentation':
        lightFrame = await generatePresentationColorSystemLayout(
          layoutContext,
          systemName,
          lightScales,
          'light',
          scaleMethod,
          semanticPolicy
        );
        break;
      default:
        lightFrame = await generateDetailedColorSystemLayout(
          layoutContext,
          lightScales,
          'light',
          scaleMethod,
          semanticPolicy
        );
    }
    container.appendChild(lightFrame);

    if (includeDarkMode && darkScales) {
      let darkFrame: FrameNode;
      switch (detailLevel) {
        case 'minimal':
          darkFrame = await generateMinimalColorSystemLayout(
            layoutContext,
            darkScales,
            'dark',
            scaleMethod,
            semanticPolicy
          );
          break;
        case 'detailed':
          darkFrame = await generateDetailedColorSystemLayout(
            layoutContext,
            darkScales,
            'dark',
            scaleMethod,
            semanticPolicy
          );
          break;
        case 'presentation':
          darkFrame = await generatePresentationColorSystemLayout(
            layoutContext,
            systemName,
            darkScales,
            'dark',
            scaleMethod,
            semanticPolicy
          );
          break;
        default:
          darkFrame = await generateDetailedColorSystemLayout(
            layoutContext,
            darkScales,
            'dark',
            scaleMethod,
            semanticPolicy
          );
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

    if (options.notify !== false) {
      figma.notify(
        `Created "${systemName}" color system with ${includeDarkMode ? 'light & dark modes' : 'light mode'}`
      );
    }
    return container;
  } catch (error) {
    removeOwnedNodes(operation);
    throw error;
  } finally {
    finishGenerationOperation(operation);
  }
}
