// Backend Module Barrel Export
// Re-exports all backend operations for use in code.ts

// Figma Helpers
export {
  isValidHex,
  hexToFigmaRgb,
  getSelectedNodesWithFills,
  getSelectedNodesWithStrokes,
  sendSelectionInfo,
  type GradientColor,
  type ColorMessage,
} from './figmaHelpers';

// Color Operations
export {
  handleApplyFill,
  handleApplyStroke,
  handleCreateStyle,
  handleGetSelectionColor,
  handleCreateColorRect,
  handleApplyGradient,
  handleCreatePalette,
} from './colorOperations';

// Grid Operations
export { handleCreateGridFrame, handleApplyGrid, handleClearGrids } from './gridOperations';

// Color System Generation
export {
  generateColorSystemFrames,
  type ColorScaleData,
  type ColorSystemData,
} from './colorSystemGeneration';

// Color Styles
export { createColorStyles, type CreateStylesData } from './colorStyles';
