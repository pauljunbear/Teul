// Figma Backend Helper Utilities
// Common utilities for Figma plugin backend operations

// ============================================
// Type Definitions
// ============================================

export interface GradientColor {
  hex: string;
  name: string;
}

export interface ColorMessage {
  hex: string;
  name: string;
  rgb?: number[];
}

// ============================================
// Validation Functions
// ============================================

// Validate hex color format
export function isValidHex(hex: string): boolean {
  const cleanHex = hex.replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(cleanHex);
}

// ============================================
// Color Conversion
// ============================================

// Convert hex to Figma RGB (with validation)
export function hexToFigmaRgb(hex: string): RGB {
  const cleanHex = hex.replace('#', '');

  // Validate hex format - return black if invalid
  if (!isValidHex(hex)) {
    console.error(`Invalid hex color: ${hex}`);
    return { r: 0, g: 0, b: 0 };
  }

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

// Send selection info to UI
export function sendSelectionInfo(): void {
  const selection = figma.currentPage.selection;
  const hasSelection = selection.length > 0;
  const firstNode = selection[0];

  figma.ui.postMessage({
    type: 'selection-info',
    hasSelection,
    isFrame: hasSelection && firstNode?.type === 'FRAME',
    width: hasSelection && 'width' in firstNode ? firstNode.width : undefined,
    height: hasSelection && 'height' in firstNode ? firstNode.height : undefined,
    name: hasSelection ? firstNode?.name : undefined,
  });
}
