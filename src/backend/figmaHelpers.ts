// Figma Backend Helper Utilities
// Common utilities for Figma plugin backend operations

import type { GridSelectionTarget } from '../types/grid';

// ============================================
// Type Definitions
// ============================================

export interface GradientColor {
  hex: string;
  name: string;
}

// ============================================
// Validation Functions
// ============================================

// Validate hex color format
export function isValidHex(hex: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(hex);
}

// ============================================
// Color Conversion
// ============================================

// Convert hex to Figma RGB (with validation)
export function hexToFigmaRgb(hex: string): RGB {
  if (!isValidHex(hex)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const cleanHex = hex.replace(/^#/, '');

  return {
    r: parseInt(cleanHex.substring(0, 2), 16) / 255,
    g: parseInt(cleanHex.substring(2, 4), 16) / 255,
    b: parseInt(cleanHex.substring(4, 6), 16) / 255,
  };
}

// ============================================
// Selection Helpers
// ============================================

// Get current selection with fills
export function getSelectedNodesWithFills(): (SceneNode & { fills: Paint[] })[] {
  return figma.currentPage.selection.filter(
    (node): node is SceneNode & { fills: Paint[] } => 'fills' in node
  );
}

// Get current selection with strokes
export function getSelectedNodesWithStrokes(): (SceneNode & { strokes: Paint[] })[] {
  return figma.currentPage.selection.filter(
    (node): node is SceneNode & { strokes: Paint[] } => 'strokes' in node
  );
}

// ============================================
// UI Communication
// ============================================

export function getGridSelectionTargets(selection: readonly SceneNode[]): GridSelectionTarget[] {
  return selection
    .filter(node => 'layoutGrids' in node)
    .map(node => ({
      id: node.id,
      name: node.name,
      width: node.width,
      height: node.height,
    }));
}

// Send selection info to UI
export function sendSelectionInfo(requestId?: string): void {
  const selection = figma.currentPage.selection;
  const hasSelection = selection.length > 0;
  const firstNode = selection[0];
  const eligibleTargets = getGridSelectionTargets(selection);

  figma.ui.postMessage({
    type: 'selection-info',
    hasSelection,
    isFrame: hasSelection && firstNode?.type === 'FRAME',
    selectedCount: selection.length,
    eligibleTargets,
    ineligibleCount: selection.length - eligibleTargets.length,
    width: hasSelection && 'width' in firstNode ? firstNode.width : undefined,
    height: hasSelection && 'height' in firstNode ? firstNode.height : undefined,
    name: hasSelection ? firstNode?.name : undefined,
    ...(requestId ? { requestId } : {}),
  });
}
