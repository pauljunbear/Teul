// Color Operations for Figma Backend
// Handles fill, stroke, style creation, and palette operations

import {
  hexToFigmaRgb,
  getSelectedNodesWithFills,
  getSelectedNodesWithStrokes,
  type GradientColor,
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
