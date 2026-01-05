// Teul Figma Plugin Backend
// Main entry point - routes messages to backend modules

import {
  sendSelectionInfo,
  handleApplyFill,
  handleApplyStroke,
  handleCreateStyle,
  handleGetSelectionColor,
  handleCreateColorRect,
  handleApplyGradient,
  handleCreatePalette,
  handleCreateGridFrame,
  handleApplyGrid,
  handleClearGrids,
  generateColorSystemFrames,
  createColorStyles,
} from './backend';

// ============================================
// Plugin Initialization
// ============================================

figma.showUI(__html__, {
  width: 560,
  height: 600,
  themeColors: true,
});

// ============================================
// Selection Change Listener
// ============================================

// Listen for selection changes and push updates to UI (replaces polling)
figma.on('selectionchange', () => {
  sendSelectionInfo();
});

// ============================================
// Message Router
// ============================================

figma.ui.onmessage = async msg => {
  // Color Operations
  if (msg.type === 'apply-fill') {
    handleApplyFill(msg);
    return;
  }

  if (msg.type === 'apply-stroke') {
    handleApplyStroke(msg);
    return;
  }

  if (msg.type === 'create-style') {
    await handleCreateStyle(msg);
    return;
  }

  if (msg.type === 'get-selection-color') {
    handleGetSelectionColor();
    return;
  }

  if (msg.type === 'get-selection-for-grid') {
    sendSelectionInfo();
    return;
  }

  if (msg.type === 'create-color') {
    handleCreateColorRect(msg);
    return;
  }

  if (msg.type === 'apply-gradient') {
    handleApplyGradient(msg);
    return;
  }

  if (msg.type === 'create-palette') {
    await handleCreatePalette(msg);
    return;
  }

  // Notification
  if (msg.type === 'notify') {
    figma.notify(msg.text);
    return;
  }

  if (msg.type === 'copy') {
    figma.notify(`${msg.text} copied!`);
    return;
  }

  // Color System Operations
  if (msg.type === 'generate-color-system') {
    try {
      await generateColorSystemFrames(msg.config, msg.scales);
    } catch (error) {
      console.error('Error generating color system:', error);
      figma.notify('Failed to generate color system');
    }
    return;
  }

  if (msg.type === 'create-color-styles') {
    try {
      await createColorStyles(msg.scales, msg.systemName);
    } catch (error) {
      console.error('Error creating color styles:', error);
      figma.notify('Failed to create color styles');
    }
    return;
  }

  // Grid Operations
  if (msg.type === 'create-grid-frame') {
    await handleCreateGridFrame(msg);
    return;
  }

  if (msg.type === 'apply-grid') {
    handleApplyGrid(msg);
    return;
  }

  if (msg.type === 'clear-grids') {
    handleClearGrids();
    return;
  }
};
