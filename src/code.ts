// Teul Figma Plugin Backend
// Main entry point - routes messages to backend modules

import {
  sendSelectionInfo,
  sendDocumentColorProfile,
  handleApplyFill,
  handleApplyStroke,
  handleCreateStyle,
  handleApplyGradient,
  handleCreateGridFrame,
  handleApplyGrid,
  handleGenerateColorSystem,
} from './backend';
import { validateUIToPluginMessage } from './lib/messageValidation';
import type {
  ColorSystemOperationResultMessage,
  GridAppliedMessage,
  UIToPluginMessage,
} from './types/messages';

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

// Selection does not change when a selected frame is resized, so keep grid-fit
// diagnostics synchronized with geometry changes as well. A page-scoped
// listener is required when the plugin uses dynamic-page document access.
const handleCurrentPageNodeChange = (event: NodeChangeEvent): void => {
  const selectedGridTargetIds = new Set(
    figma.currentPage.selection.filter(node => 'layoutGrids' in node).map(node => node.id)
  );

  if (selectedGridTargetIds.size === 0) return;

  const selectedGeometryChanged = event.nodeChanges.some(
    change =>
      change.type === 'PROPERTY_CHANGE' &&
      selectedGridTargetIds.has(change.id) &&
      change.properties.some(property => property === 'width' || property === 'height')
  );

  if (selectedGeometryChanged) {
    sendSelectionInfo();
  }
};

let observedPage = figma.currentPage;
observedPage.on('nodechange', handleCurrentPageNodeChange);

figma.on('currentpagechange', () => {
  observedPage.off('nodechange', handleCurrentPageNodeChange);
  observedPage = figma.currentPage;
  observedPage.on('nodechange', handleCurrentPageNodeChange);
  sendSelectionInfo();
});

// ============================================
// Message Router
// ============================================

figma.ui.onmessage = async (msg: unknown) => {
  const validation = validateUIToPluginMessage(msg);
  if (!validation.valid) {
    console.error('Rejected invalid UI message:', validation.error);
    if (
      typeof msg === 'object' &&
      msg !== null &&
      'type' in msg &&
      msg.type === 'generate-color-system' &&
      'requestId' in msg &&
      typeof msg.requestId === 'string' &&
      msg.requestId.trim().length > 0 &&
      msg.requestId.length <= 128
    ) {
      const result: ColorSystemOperationResultMessage = {
        type: 'color-system-operation-result',
        requestId: msg.requestId,
        success: false,
        error: 'Invalid color system request',
      };
      figma.ui.postMessage(result);
    }
    if (
      typeof msg === 'object' &&
      msg !== null &&
      'type' in msg &&
      msg.type === 'apply-grid' &&
      'requestId' in msg &&
      typeof msg.requestId === 'string' &&
      msg.requestId.trim().length > 0 &&
      msg.requestId.length <= 128
    ) {
      const result: GridAppliedMessage = {
        type: 'grid-applied',
        requestId: msg.requestId,
        success: false,
        appliedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        message: 'Grid apply rejected: invalid request',
        error: 'Invalid grid apply request',
      };
      figma.ui.postMessage(result);
    }
    figma.notify('Invalid plugin message');
    return;
  }

  const message: UIToPluginMessage = validation.message;

  // Color Operations
  if (message.type === 'apply-fill') {
    await handleApplyFill(message);
    return;
  }

  if (message.type === 'apply-stroke') {
    await handleApplyStroke(message);
    return;
  }

  if (message.type === 'create-style') {
    await handleCreateStyle(message);
    return;
  }

  if (message.type === 'get-selection-for-grid') {
    sendSelectionInfo(message.requestId);
    return;
  }

  if (message.type === 'get-document-color-profile') {
    sendDocumentColorProfile();
    return;
  }

  if (message.type === 'apply-gradient') {
    await handleApplyGradient(message);
    return;
  }

  // Notification
  if (message.type === 'notify') {
    figma.notify(message.text);
    return;
  }

  // Color System Operations
  if (message.type === 'generate-color-system') {
    await handleGenerateColorSystem(message);
    return;
  }

  // Grid Operations
  if (message.type === 'create-grid-frame') {
    await handleCreateGridFrame(message);
    return;
  }

  if (message.type === 'apply-grid') {
    await handleApplyGrid(message);
    return;
  }
};
