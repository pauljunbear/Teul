// Teul Figma Plugin Backend
// Main entry point - routes messages to backend modules

import {
  sendSelectionInfo,
  sendAccessibilitySelection,
  sendDocumentColorProfile,
  getHistoricalColorData,
  getGridPresetCatalog,
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
import { readPluginMessageType, validateUIToPluginMessage } from './lib/messageValidation';
import { COLOR_SYSTEM_GENERIC_BUILDER_V2_ENABLED } from './lib/colorSystemGenericReleaseChannelV2';
import {
  ensureColorSystemBuilderV2Initialized,
  handleAnalyzeGenericColorSystemV2,
  handleCancelGenericColorSystemV2,
  handleConfirmGenericColorSystemPlanV2,
  handleCreateIntelligentColorSystemV2,
  handleColorSystemModelV1,
  handleColorSystemAuthoringV1,
} from './backend/colorSystemBuilderReleaseRuntime';
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
import type {
  ColorSystemBuilderV2AnalysisResultMessage,
  ColorSystemBuilderV2CreateResultMessage,
  ColorSystemGenericV2ConfirmationResultMessage,
} from './types/colorSystemBuilderV2Messages';

const GRID_STORAGE_KEY = 'teul-saved-grids';
const WORKSPACE_STORAGE_KEY = 'teul-workspace-v1';
const GENERIC_BUILDER_QUALIFICATION_MESSAGE =
  'The intelligent color builder is not enabled in this release bundle. Use an explicit candidate build for controlled qualification.';

function postDisabledBuilderConfirmation(
  message: Extract<UIToPluginMessage, { type: 'confirm-generic-color-system-plan-v2' }>
): void {
  const gap = {
    id: 'generic-confirmation:not-qualified',
    kind: 'host-error' as const,
    title: 'This builder is not enabled in the release bundle',
    message: GENERIC_BUILDER_QUALIFICATION_MESSAGE,
    remediation: 'Load the explicit candidate bundle and analyze again.',
    blocking: true,
  };
  const response: ColorSystemGenericV2ConfirmationResultMessage = {
    type: 'generic-color-system-v2-confirmation-result',
    requestId: message.requestId,
    success: false,
    analysisId: message.analysisId,
    snapshotHash: message.snapshotHash,
    state: {
      kind: 'host-error',
      firstBlockerId: gap.id,
      message: GENERIC_BUILDER_QUALIFICATION_MESSAGE,
    },
    gaps: [gap],
    error: GENERIC_BUILDER_QUALIFICATION_MESSAGE,
  };
  figma.ui.postMessage(response);
}

function postDisabledBuilderCreate(requestId: string): void {
  const response: ColorSystemBuilderV2CreateResultMessage = {
    type: 'intelligent-color-system-v2-create-result',
    requestId,
    success: false,
    failureStage: 'preflight',
    cleanup: {
      attempted: false,
      complete: true,
      removedResourceCount: 0,
      errors: [],
    },
    error: GENERIC_BUILDER_QUALIFICATION_MESSAGE,
  };
  figma.ui.postMessage(response);
}

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
    if (readPluginMessageType(msg) === null) {
      figma.notify('Invalid plugin message');
      return;
    }
    if (
      typeof msg === 'object' &&
      msg !== null &&
      'type' in msg &&
      (msg.type === 'analyze-generic-color-system-v2' ||
        msg.type === 'confirm-generic-color-system-plan-v2' ||
        msg.type === 'cancel-generic-color-system-v2') &&
      'requestId' in msg &&
      typeof msg.requestId === 'string' &&
      msg.requestId.trim().length > 0 &&
      msg.requestId.length <= 128
    ) {
      if (msg.type === 'analyze-generic-color-system-v2') {
        const gap = {
          id: 'generic-invalid-request',
          kind: 'host-error' as const,
          title: 'The analysis request was invalid',
          message: validation.error,
          remediation: 'Return to the System tab and analyze again.',
          blocking: true,
        };
        figma.ui.postMessage({
          type: 'generic-color-system-v2-plan-result',
          requestId: msg.requestId,
          analysisId: null,
          snapshotHash: null,
          state: {
            kind: 'host-error',
            firstBlockerId: gap.id,
            message: gap.message,
          },
          proposal: null,
          gaps: [gap],
        });
      } else if (msg.type === 'confirm-generic-color-system-plan-v2') {
        const analysisId =
          'analysisId' in msg && typeof msg.analysisId === 'string'
            ? msg.analysisId
            : 'invalid-analysis';
        const gap = {
          id: 'generic-invalid-confirmation',
          kind: 'source-changed' as const,
          title: 'The confirmation request was invalid',
          message: validation.error,
          remediation: 'Analyze the current file again.',
          blocking: true,
        };
        figma.ui.postMessage({
          type: 'generic-color-system-v2-confirmation-result',
          requestId: msg.requestId,
          success: false,
          analysisId,
          snapshotHash: null,
          state: {
            kind: 'stale',
            firstBlockerId: gap.id,
            message: gap.message,
          },
          gaps: [gap],
          error: gap.message,
        });
      }
      figma.notify('Invalid plugin message');
      return;
    }
    if (
      typeof msg === 'object' &&
      msg !== null &&
      'type' in msg &&
      (msg.type === 'analyze-intelligent-color-system-v2' ||
        msg.type === 'create-intelligent-color-system-v2') &&
      'requestId' in msg &&
      typeof msg.requestId === 'string' &&
      msg.requestId.trim().length > 0 &&
      msg.requestId.length <= 128
    ) {
      if (msg.type === 'analyze-intelligent-color-system-v2') {
        const result: ColorSystemBuilderV2AnalysisResultMessage = {
          type: 'intelligent-color-system-v2-analysis-result',
          requestId: msg.requestId,
          success: false,
          blockers: [
            {
              code: 'INVALID_REQUEST',
              message: 'The intelligent color-system analysis request was invalid.',
              recovery: 'Return to the System tab and start the analysis again.',
            },
          ],
          error: 'Invalid intelligent color-system analysis request.',
        };
        figma.ui.postMessage(result);
      } else {
        const result: ColorSystemBuilderV2CreateResultMessage = {
          type: 'intelligent-color-system-v2-create-result',
          requestId: msg.requestId,
          success: false,
          failureStage: 'preflight',
          cleanup: {
            attempted: false,
            complete: true,
            removedResourceCount: 0,
            errors: [],
          },
          error: 'Invalid intelligent color-system Create request.',
        };
        figma.ui.postMessage(result);
      }
      figma.notify('Invalid plugin message');
      return;
    }
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

  if (
    message.type === 'color-system-authoring-v1' ||
    message.type === 'cancel-color-system-authoring-v1'
  ) {
    if (!COLOR_SYSTEM_GENERIC_BUILDER_V2_ENABLED) {
      figma.ui.postMessage({
        type: 'color-system-authoring-result-v1',
        requestId: message.requestId,
        success: false,
        code: 'CANDIDATE_ONLY',
        error: GENERIC_BUILDER_QUALIFICATION_MESSAGE,
      });
      return;
    }
    await handleColorSystemAuthoringV1(message);
    return;
  }

  if (
    message.type === 'read-color-system-model-v1' ||
    message.type === 'cancel-color-system-model-v1'
  ) {
    if (!COLOR_SYSTEM_GENERIC_BUILDER_V2_ENABLED) {
      figma.ui.postMessage({
        type: 'color-system-model-result-v1',
        requestId: message.requestId,
        success: false,
        code: 'CANDIDATE_ONLY',
        error: GENERIC_BUILDER_QUALIFICATION_MESSAGE,
      });
      return;
    }
    await handleColorSystemModelV1(message);
    return;
  }

  if (message.type === 'analyze-generic-color-system-v2') {
    ensureColorSystemBuilderV2Initialized();
    if (!COLOR_SYSTEM_GENERIC_BUILDER_V2_ENABLED) {
      const gap = {
        id: 'generic-color-builder-v2:not-qualified',
        kind: 'host-error' as const,
        title: 'Generic builder qualification is still in progress',
        message:
          'This release keeps the generic builder off until its exact candidate bundle passes live Figma, assistive-technology, and owner-acceptance gates.',
        remediation: 'Load the explicit generic candidate build for controlled testing.',
        blocking: true,
      };
      figma.ui.postMessage({
        type: 'generic-color-system-v2-plan-result',
        requestId: message.requestId,
        analysisId: null,
        snapshotHash: null,
        state: {
          kind: 'host-error',
          firstBlockerId: gap.id,
          message: gap.message,
        },
        proposal: null,
        gaps: [gap],
      });
      return;
    }
    await handleAnalyzeGenericColorSystemV2(message);
    return;
  }

  if (message.type === 'confirm-generic-color-system-plan-v2') {
    if (!COLOR_SYSTEM_GENERIC_BUILDER_V2_ENABLED) {
      postDisabledBuilderConfirmation(message);
      return;
    }
    ensureColorSystemBuilderV2Initialized();
    await handleConfirmGenericColorSystemPlanV2(message);
    return;
  }

  if (message.type === 'cancel-generic-color-system-v2') {
    ensureColorSystemBuilderV2Initialized();
    handleCancelGenericColorSystemV2(message);
    return;
  }

  if (message.type === 'create-intelligent-color-system-v2') {
    if (!COLOR_SYSTEM_GENERIC_BUILDER_V2_ENABLED) {
      postDisabledBuilderCreate(message.requestId);
      return;
    }
    ensureColorSystemBuilderV2Initialized();
    await handleCreateIntelligentColorSystemV2(message);
    return;
  }

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

  if (message.type === 'get-grid-preset-catalog') {
    figma.ui.postMessage(getGridPresetCatalog(message));
    return;
  }

  if (message.type === 'get-historical-color-data') {
    figma.ui.postMessage(getHistoricalColorData(message));
    return;
  }

  if (message.type === 'get-selection-for-accessibility') {
    await sendAccessibilitySelection(message.requestId);
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
