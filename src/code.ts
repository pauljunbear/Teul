// Teul Figma Plugin Backend
// Main entry point - routes messages to backend modules

import {
  sendSelectionInfo,
  sendAccessibilitySelection,
  sendDocumentColorProfile,
  detectDocumentColorProfile,
  handleApplyFill,
  handleApplyStroke,
  handleCreateStyle,
  handleApplyGradient,
  handleCreateGridFrame,
  handleApplyGrid,
  handleClearGrid,
  handleCaptureSelectedGrid,
  handleGenerateColorSystem,
} from './backend';
import { validateUIToPluginMessage } from './lib/messageValidation';
import type {
  ColorSystemOperationResultMessage,
  GridAppliedMessage,
  GridStorageResultMessage,
  GridCaptureResultMessage,
  MutationOperation,
  MutationOperationResultMessage,
  UIToPluginMessage,
  WorkspaceStorageResultMessage,
} from './types/messages';

const GRID_STORAGE_KEY = 'teul-saved-grids';
const WORKSPACE_STORAGE_KEY = 'teul-workspace-v1';

function commitUndoBoundary(): void {
  figma.commitUndo();
}

function postMutationResult(
  requestId: string,
  operation: MutationOperation,
  success: boolean,
  message: string
): void {
  const result: MutationOperationResultMessage = {
    type: 'mutation-operation-result',
    requestId,
    operation,
    success,
    message,
    ...(success ? {} : { error: message }),
  };
  figma.ui.postMessage(result);
}

// ============================================
// Plugin Initialization
// ============================================

figma.showUI(__html__, {
  width: 560,
  height: 720,
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
      (msg.type === 'get-workspace-storage' || msg.type === 'set-workspace-storage') &&
      'requestId' in msg &&
      typeof msg.requestId === 'string' &&
      msg.requestId.trim().length > 0 &&
      msg.requestId.length <= 128
    ) {
      const result: WorkspaceStorageResultMessage = {
        type: 'workspace-storage-result',
        requestId: msg.requestId,
        operation: msg.type === 'get-workspace-storage' ? 'get' : 'set',
        success: false,
        error: 'Invalid workspace storage request',
      };
      figma.ui.postMessage(result);
    }
    if (
      typeof msg === 'object' &&
      msg !== null &&
      'type' in msg &&
      msg.type === 'capture-selected-grid' &&
      'requestId' in msg &&
      typeof msg.requestId === 'string' &&
      msg.requestId.trim().length > 0 &&
      msg.requestId.length <= 128
    ) {
      const result: GridCaptureResultMessage = {
        type: 'grid-capture-result',
        requestId: msg.requestId,
        success: false,
        error: 'Invalid grid capture request',
      };
      figma.ui.postMessage(result);
    }
    if (
      typeof msg === 'object' &&
      msg !== null &&
      'type' in msg &&
      (msg.type === 'apply-fill' ||
        msg.type === 'apply-stroke' ||
        msg.type === 'create-style' ||
        msg.type === 'apply-gradient' ||
        msg.type === 'create-grid-frame') &&
      'requestId' in msg &&
      typeof msg.requestId === 'string' &&
      msg.requestId.trim().length > 0 &&
      msg.requestId.length <= 128
    ) {
      postMutationResult(
        msg.requestId,
        msg.type,
        false,
        `Invalid ${msg.type.replace(/-/g, ' ')} request`
      );
    }
    if (
      typeof msg === 'object' &&
      msg !== null &&
      'type' in msg &&
      (msg.type === 'apply-grid' || msg.type === 'clear-grid') &&
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
        message: `Grid ${msg.type === 'clear-grid' ? 'clear' : 'apply'} rejected: invalid request`,
        error: `Invalid grid ${msg.type === 'clear-grid' ? 'clear' : 'apply'} request`,
      };
      figma.ui.postMessage(result);
    }
    if (
      typeof msg === 'object' &&
      msg !== null &&
      'type' in msg &&
      (msg.type === 'get-grid-storage' ||
        msg.type === 'set-grid-storage' ||
        msg.type === 'delete-grid-storage') &&
      'requestId' in msg &&
      typeof msg.requestId === 'string' &&
      msg.requestId.trim().length > 0 &&
      msg.requestId.length <= 128
    ) {
      const result: GridStorageResultMessage = {
        type: 'grid-storage-result',
        requestId: msg.requestId,
        operation:
          msg.type === 'get-grid-storage'
            ? 'get'
            : msg.type === 'set-grid-storage'
              ? 'set'
              : 'delete',
        success: false,
        error: 'Invalid saved grid storage request',
      };
      figma.ui.postMessage(result);
    }
    figma.notify('Invalid plugin message');
    return;
  }

  const message: UIToPluginMessage = validation.message;

  // Color Operations
  if (message.type === 'apply-fill') {
    const success = await handleApplyFill(message);
    if (success) commitUndoBoundary();
    postMutationResult(
      message.requestId,
      message.type,
      success,
      success ? 'Fill applied' : 'Fill not applied'
    );
    return;
  }

  if (message.type === 'apply-stroke') {
    const success = await handleApplyStroke(message);
    if (success) commitUndoBoundary();
    postMutationResult(
      message.requestId,
      message.type,
      success,
      success ? 'Stroke applied' : 'Stroke not applied'
    );
    return;
  }

  if (message.type === 'create-style') {
    const success = await handleCreateStyle(message);
    if (success) commitUndoBoundary();
    postMutationResult(
      message.requestId,
      message.type,
      success,
      success ? 'Style created' : 'Style not created'
    );
    return;
  }

  if (message.type === 'get-selection-for-grid') {
    sendSelectionInfo(message.requestId);
    return;
  }

  if (message.type === 'capture-selected-grid') {
    handleCaptureSelectedGrid(message.requestId);
    return;
  }

  if (message.type === 'get-document-color-profile') {
    sendDocumentColorProfile();
    return;
  }

  if (message.type === 'get-selection-for-accessibility') {
    sendAccessibilitySelection(message.requestId, detectDocumentColorProfile(figma.root));
    return;
  }

  if (message.type === 'get-grid-storage') {
    const result: GridStorageResultMessage = {
      type: 'grid-storage-result',
      requestId: message.requestId,
      operation: 'get',
      success: true,
      value: null,
    };

    try {
      const value = await figma.clientStorage.getAsync(GRID_STORAGE_KEY);
      result.value = typeof value === 'string' ? value : null;
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Failed to load saved grids';
    }

    figma.ui.postMessage(result);
    return;
  }

  if (message.type === 'set-grid-storage') {
    const result: GridStorageResultMessage = {
      type: 'grid-storage-result',
      requestId: message.requestId,
      operation: 'set',
      success: true,
    };

    try {
      await figma.clientStorage.setAsync(GRID_STORAGE_KEY, message.value);
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Failed to save grids';
    }

    figma.ui.postMessage(result);
    return;
  }

  if (message.type === 'delete-grid-storage') {
    const result: GridStorageResultMessage = {
      type: 'grid-storage-result',
      requestId: message.requestId,
      operation: 'delete',
      success: true,
    };

    try {
      await figma.clientStorage.deleteAsync(GRID_STORAGE_KEY);
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Failed to clear saved grids';
    }

    figma.ui.postMessage(result);
    return;
  }

  if (message.type === 'get-workspace-storage') {
    const result: WorkspaceStorageResultMessage = {
      type: 'workspace-storage-result',
      requestId: message.requestId,
      operation: 'get',
      success: true,
      value: null,
    };
    try {
      const value = await figma.clientStorage.getAsync(WORKSPACE_STORAGE_KEY);
      result.value = typeof value === 'string' ? value : null;
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Failed to load workspace';
    }
    figma.ui.postMessage(result);
    return;
  }

  if (message.type === 'set-workspace-storage') {
    const result: WorkspaceStorageResultMessage = {
      type: 'workspace-storage-result',
      requestId: message.requestId,
      operation: 'set',
      success: true,
    };
    try {
      await figma.clientStorage.setAsync(WORKSPACE_STORAGE_KEY, message.value);
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Failed to save workspace';
    }
    figma.ui.postMessage(result);
    return;
  }

  if (message.type === 'apply-gradient') {
    const success = await handleApplyGradient(message);
    if (success) commitUndoBoundary();
    postMutationResult(
      message.requestId,
      message.type,
      success,
      success ? 'Gradient applied' : 'Gradient not applied'
    );
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
    const success = await handleCreateGridFrame(message);
    if (success) commitUndoBoundary();
    postMutationResult(
      message.requestId,
      message.type,
      success,
      success ? 'Grid frame created' : 'Grid frame not created'
    );
    return;
  }

  if (message.type === 'apply-grid') {
    await handleApplyGrid(message);
    return;
  }

  if (message.type === 'clear-grid') {
    await handleClearGrid(message);
    return;
  }
};
