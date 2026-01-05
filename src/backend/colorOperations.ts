// Color Operations for Figma Backend
// Handles fill, stroke, style creation, and palette operations

import {
  hexToFigmaRgb,
  getSelectedNodesWithFills,
  getSelectedNodesWithStrokes,
  type GradientColor,
  type ColorMessage,
} from './figmaHelpers';

// ============================================
// Fill Operations
// ============================================

export function handleApplyFill(msg: { hex: string; name: string }): void {
  const nodes = getSelectedNodesWithFills();

  if (nodes.length === 0) {
    figma.notify('Please select a shape or frame first');
    return;
  }

  const color = hexToFigmaRgb(msg.hex);

  nodes.forEach(node => {
    node.fills = [
      {
        type: 'SOLID',
        color: color,
      },
    ];
  });

  figma.notify(`Applied "${msg.name}" to ${nodes.length} element${nodes.length > 1 ? 's' : ''}`);
}

// ============================================
// Stroke Operations
// ============================================

export function handleApplyStroke(msg: { hex: string; name: string }): void {
  const nodes = getSelectedNodesWithStrokes();

  if (nodes.length === 0) {
    figma.notify('Please select a shape or frame first');
    return;
  }

  const color = hexToFigmaRgb(msg.hex);

  nodes.forEach(node => {
    node.strokes = [
      {
        type: 'SOLID',
        color: color,
      },
    ];
    // Set stroke weight if not already set
    if ('strokeWeight' in node && (node.strokeWeight === 0 || node.strokeWeight === undefined)) {
      (node as GeometryMixin).strokeWeight = 2;
    }
  });

  figma.notify(
    `Applied stroke "${msg.name}" to ${nodes.length} element${nodes.length > 1 ? 's' : ''}`
  );
}

// ============================================
// Style Creation
// ============================================

export async function handleCreateStyle(msg: { hex: string; name: string }): Promise<void> {
  try {
    const color = hexToFigmaRgb(msg.hex);

    // Check if style already exists
    const existingStyles = await figma.getLocalPaintStylesAsync();
    const existingStyle = existingStyles.find(s => s.name === `Teul/${msg.name}`);

    if (existingStyle) {
      figma.notify(`Style "Teul/${msg.name}" already exists`);
      return;
    }

    const style = figma.createPaintStyle();
    style.name = `Teul/${msg.name}`;
    style.paints = [
      {
        type: 'SOLID',
        color: color,
      },
    ];

    figma.notify(`Created style: Teul/${msg.name}`);
  } catch (error) {
    figma.notify('Failed to create style');
    console.error(error);
  }
}

// ============================================
// Selection Color Extraction
// ============================================

export function handleGetSelectionColor(): void {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify('Please select an element first');
    return;
  }

  const node = selection[0];

  if ('fills' in node) {
    const fills = node.fills as Paint[];

    if (fills.length > 0 && fills[0].type === 'SOLID') {
      const fill = fills[0] as SolidPaint;
      const rgb = [
        Math.round(fill.color.r * 255),
        Math.round(fill.color.g * 255),
        Math.round(fill.color.b * 255),
      ];

      figma.ui.postMessage({
        type: 'selection-color',
        rgb: rgb,
      });
    } else {
      figma.notify('Selected element has no solid fill');
    }
  } else {
    figma.notify('Selected element has no fill property');
  }
}

// ============================================
// Legacy Color Rectangle
// ============================================

export function handleCreateColorRect(msg: { color: { rgb_array: number[]; name: string } }): void {
  const color = msg.color;
  const rect = figma.createRectangle();

  rect.resize(100, 100);
  rect.x = figma.viewport.center.x - 50;
  rect.y = figma.viewport.center.y - 50;

  const rgbColor = {
    r: color.rgb_array[0] / 255,
    g: color.rgb_array[1] / 255,
    b: color.rgb_array[2] / 255,
  };

  rect.fills = [
    {
      type: 'SOLID',
      color: rgbColor,
    },
  ];

  rect.name = color.name;

  figma.currentPage.selection = [rect];
  figma.viewport.scrollAndZoomIntoView([rect]);
}

// ============================================
// Gradient Operations
// ============================================

export function handleApplyGradient(msg: {
  colors: GradientColor[];
  gradientType: 'LINEAR' | 'RADIAL' | 'ANGULAR' | 'DIAMOND';
}): void {
  const nodes = getSelectedNodesWithFills();

  if (nodes.length === 0) {
    figma.notify('Please select a shape or frame first');
    return;
  }

  const colors = msg.colors;

  // Validate: gradients need at least 2 colors
  if (!colors || colors.length < 2) {
    figma.notify('Gradient requires at least 2 colors');
    return;
  }

  const gradientStops: ColorStop[] = colors.map((color: GradientColor, index: number) => {
    const rgb = hexToFigmaRgb(color.hex);
    return {
      position: index / (colors.length - 1),
      color: { ...rgb, a: 1 },
    };
  });

  // Different transforms for different gradient types
  let gradientTransform: Transform;

  switch (msg.gradientType) {
    case 'LINEAR':
      // Diagonal gradient from top-left to bottom-right
      gradientTransform = [
        [1, 0, 0],
        [0, 1, 0],
      ];
      break;
    case 'RADIAL':
    case 'ANGULAR':
    case 'DIAMOND':
      // Centered gradient
      gradientTransform = [
        [0.5, 0, 0.25],
        [0, 0.5, 0.25],
      ];
      break;
    default:
      gradientTransform = [
        [1, 0, 0],
        [0, 1, 0],
      ];
  }

  const gradientType =
    msg.gradientType === 'LINEAR'
      ? 'GRADIENT_LINEAR'
      : msg.gradientType === 'RADIAL'
        ? 'GRADIENT_RADIAL'
        : msg.gradientType === 'ANGULAR'
          ? 'GRADIENT_ANGULAR'
          : 'GRADIENT_DIAMOND';

  const gradientFill: GradientPaint = {
    type: gradientType,
    gradientTransform,
    gradientStops,
  };

  nodes.forEach(node => {
    node.fills = [gradientFill];
  });

  figma.notify(`Applied ${msg.gradientType.toLowerCase()} gradient with ${colors.length} colors`);
}

// ============================================
// Palette Creation
// ============================================

export async function handleCreatePalette(msg: {
  colors: ColorMessage[];
  name?: string;
}): Promise<void> {
  const colors = msg.colors;
  const paletteName = msg.name || 'Teul Palette';

  // Create frame
  const frame = figma.createFrame();
  frame.name = paletteName;
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 16;
  frame.paddingLeft = 24;
  frame.paddingRight = 24;
  frame.paddingTop = 24;
  frame.paddingBottom = 24;
  frame.cornerRadius = 16;
  frame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];

  // Add color swatches
  for (const color of colors) {
    const swatch = figma.createFrame();
    swatch.name = color.name;
    swatch.resize(80, 100);
    swatch.layoutMode = 'VERTICAL';
    swatch.primaryAxisSizingMode = 'FIXED';
    swatch.counterAxisSizingMode = 'FIXED';
    swatch.fills = [];

    // Color rectangle
    const rect = figma.createRectangle();
    rect.resize(80, 60);
    rect.cornerRadius = 4;
    rect.fills = [{ type: 'SOLID', color: hexToFigmaRgb(color.hex) }];
    swatch.appendChild(rect);

    // Color name text
    const nameText = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    nameText.fontName = { family: 'Inter', style: 'Medium' };
    nameText.characters = color.name;
    nameText.fontSize = 10;
    nameText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
    swatch.appendChild(nameText);

    // Hex text
    const hexText = figma.createText();
    hexText.fontName = { family: 'Inter', style: 'Medium' };
    hexText.characters = color.hex;
    hexText.fontSize = 9;
    hexText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
    swatch.appendChild(hexText);

    frame.appendChild(swatch);
  }

  // Position frame in viewport
  frame.x = figma.viewport.center.x - frame.width / 2;
  frame.y = figma.viewport.center.y - frame.height / 2;

  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);

  figma.notify(`Created palette with ${colors.length} colors`);
}
