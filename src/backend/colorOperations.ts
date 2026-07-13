// Color Operations for Figma Backend
// Handles fill, stroke, style creation, and palette operations

import {
  hexToFigmaRgb,
  getSelectedNodesWithFills,
  getSelectedNodesWithStrokes,
  isNodeOrAncestorLocked,
  type GradientColor,
} from './figmaHelpers';

function hasLockedTarget(nodes: readonly SceneNode[], operation: string): boolean {
  const lockedTargets = nodes.filter(isNodeOrAncestorLocked);
  if (lockedTargets.length === 0) return false;

  figma.notify(
    `${operation} rejected: unlock ${lockedTargets.length === 1 ? 'the selected target' : `${lockedTargets.length} selected targets`} first`
  );
  return true;
}

// ============================================
// Fill Operations
// ============================================

export async function handleApplyFill(msg: { hex: string; name: string }): Promise<boolean> {
  const nodes = getSelectedNodesWithFills();

  if (nodes.length === 0) {
    figma.notify('Select an editable shape or frame with a uniform fill');
    return false;
  }
  if (hasLockedTarget(nodes, 'Fill apply')) return false;

  const color = hexToFigmaRgb(msg.hex);
  const snapshots: FillSnapshot[] = [];

  try {
    nodes.forEach(node => {
      snapshots.push({
        node,
        fills: [...node.fills],
        fillStyleId:
          'fillStyleId' in node && typeof node.fillStyleId === 'string' ? node.fillStyleId : '',
      });
      node.fills = [
        {
          type: 'SOLID',
          color,
        },
      ];
    });
  } catch (error) {
    const restored = await restoreFills(snapshots);
    figma.notify(
      restored
        ? 'Failed to apply fill; previous fills were restored'
        : 'Failed to apply fill; some previous fills could not be restored'
    );
    console.error('Failed to apply fill transaction', error);
    return false;
  }

  figma.notify(`Applied "${msg.name}" to ${nodes.length} element${nodes.length > 1 ? 's' : ''}`);
  return true;
}

// ============================================
// Stroke Operations
// ============================================

export async function handleApplyStroke(msg: { hex: string; name: string }): Promise<boolean> {
  const nodes = getSelectedNodesWithStrokes();

  if (nodes.length === 0) {
    figma.notify('Select an editable shape or frame with strokes');
    return false;
  }
  if (hasLockedTarget(nodes, 'Stroke apply')) return false;

  const color = hexToFigmaRgb(msg.hex);
  const snapshots: StrokeSnapshot[] = [];

  try {
    nodes.forEach(node => {
      snapshots.push({
        node,
        strokes: [...node.strokes],
        strokeWeight: 'strokeWeight' in node ? node.strokeWeight : undefined,
        hasStrokeWeight: 'strokeWeight' in node,
        strokeStyleId:
          'strokeStyleId' in node && typeof node.strokeStyleId === 'string'
            ? node.strokeStyleId
            : '',
      });
      node.strokes = [
        {
          type: 'SOLID',
          color,
        },
      ];
      // Set stroke weight if not already set.
      if ('strokeWeight' in node && (node.strokeWeight === 0 || node.strokeWeight === undefined)) {
        (node as GeometryMixin).strokeWeight = 2;
      }
    });
  } catch (error) {
    const restored = await restoreStrokes(snapshots);
    figma.notify(
      restored
        ? 'Failed to apply stroke; previous strokes were restored'
        : 'Failed to apply stroke; some previous strokes could not be restored'
    );
    console.error('Failed to apply stroke transaction', error);
    return false;
  }

  figma.notify(
    `Applied stroke "${msg.name}" to ${nodes.length} element${nodes.length > 1 ? 's' : ''}`
  );
  return true;
}

// ============================================
// Style Creation
// ============================================

export async function handleCreateStyle(msg: { hex: string; name: string }): Promise<boolean> {
  let createdStyle: PaintStyle | undefined;

  try {
    const color = hexToFigmaRgb(msg.hex);

    // Check if style already exists
    const existingStyles = await figma.getLocalPaintStylesAsync();
    const existingStyle = existingStyles.find(s => s.name === `Teul/${msg.name}`);

    if (existingStyle) {
      figma.notify(`Style "Teul/${msg.name}" already exists`);
      return false;
    }

    createdStyle = figma.createPaintStyle();
    createdStyle.name = `Teul/${msg.name}`;
    createdStyle.paints = [
      {
        type: 'SOLID',
        color,
      },
    ];

    figma.notify(`Created style: Teul/${msg.name}`);
    return true;
  } catch (error) {
    let removed = true;
    if (createdStyle) {
      try {
        createdStyle.remove();
      } catch (rollbackError) {
        removed = false;
        console.error('Failed to remove incomplete paint style', rollbackError);
      }
    }
    figma.notify(
      removed
        ? 'Failed to create style; incomplete style was removed'
        : 'Failed to create style; the incomplete style could not be removed'
    );
    console.error('Failed to create paint style', error);
    return false;
  }
}

// ============================================
// Gradient Operations
// ============================================

export async function handleApplyGradient(msg: {
  colors: GradientColor[];
  gradientType: 'LINEAR' | 'RADIAL' | 'ANGULAR' | 'DIAMOND';
}): Promise<boolean> {
  const nodes = getSelectedNodesWithFills();

  if (nodes.length === 0) {
    figma.notify('Select an editable shape or frame with a uniform fill');
    return false;
  }
  if (hasLockedTarget(nodes, 'Gradient apply')) return false;

  const colors = msg.colors;

  // Validate: gradients need at least 2 colors
  if (!colors || colors.length < 2) {
    figma.notify('Gradient requires at least 2 colors');
    return false;
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

  const snapshots: FillSnapshot[] = [];
  try {
    nodes.forEach(node => {
      snapshots.push({
        node,
        fills: [...node.fills],
        fillStyleId:
          'fillStyleId' in node && typeof node.fillStyleId === 'string' ? node.fillStyleId : '',
      });
      node.fills = [gradientFill];
    });
  } catch (error) {
    const restored = await restoreFills(snapshots);
    figma.notify(
      restored
        ? 'Failed to apply gradient; previous fills were restored'
        : 'Failed to apply gradient; some previous fills could not be restored'
    );
    console.error('Failed to apply gradient transaction', error);
    return false;
  }

  figma.notify(`Applied ${msg.gradientType.toLowerCase()} gradient with ${colors.length} colors`);
  return true;
}

type FillNode = ReturnType<typeof getSelectedNodesWithFills>[number];
type StrokeNode = ReturnType<typeof getSelectedNodesWithStrokes>[number];

interface FillSnapshot {
  node: FillNode;
  fills: Paint[];
  fillStyleId: string;
}

interface StrokeSnapshot {
  node: StrokeNode;
  strokes: Paint[];
  strokeWeight: unknown;
  hasStrokeWeight: boolean;
  strokeStyleId: string;
}

async function restoreFills(snapshots: FillSnapshot[]): Promise<boolean> {
  let restored = true;
  for (const { node, fills, fillStyleId } of snapshots) {
    try {
      node.fills = fills;
      if (fillStyleId && 'setFillStyleIdAsync' in node) {
        await node.setFillStyleIdAsync(fillStyleId);
      }
    } catch (error) {
      restored = false;
      console.error(`Failed to restore fills on node ${node.id}`, error);
    }
  }
  return restored;
}

async function restoreStrokes(snapshots: StrokeSnapshot[]): Promise<boolean> {
  let restored = true;
  for (const { node, strokes, strokeWeight, hasStrokeWeight, strokeStyleId } of snapshots) {
    try {
      node.strokes = strokes;
      if (hasStrokeWeight) {
        (node as GeometryMixin).strokeWeight = strokeWeight as GeometryMixin['strokeWeight'];
      }
      if (strokeStyleId && 'setStrokeStyleIdAsync' in node) {
        await node.setStrokeStyleIdAsync(strokeStyleId);
      }
    } catch (error) {
      restored = false;
      console.error(`Failed to restore strokes on node ${node.id}`, error);
    }
  }
  return restored;
}
