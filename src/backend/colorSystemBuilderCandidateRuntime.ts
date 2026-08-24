import { buildColorSystemGenericBuilderOrchestratorV2Input } from '../lib/colorSystemBuilderOrchestratorV2';
import {
  handleAnalyzeGenericColorSystemV2,
  handleCancelGenericColorSystemV2,
  handleConfirmGenericColorSystemPlanV2,
  handleCreateIntelligentColorSystemV2,
  initializeColorSystemBuilderV2Controller,
} from './colorSystemBuilderV2Controller';
import { inventoryColorSystemGenericSourceV2 } from './colorSystemGenericSourceInventoryV2';
import { createColorSystemFigmaRendererHostV2 } from './colorSystemFigmaHostV2';
import {
  createColorSystemCreateJournalRuntimeV2,
  createFigmaColorSystemCreateJournalHostV2,
} from './colorSystemCreateJournalV2';

let initialized = false;

function detectDocumentColorProfile(): 'legacy' | 'srgb' | 'display-p3' | 'unknown' {
  try {
    const profile = figma.root.documentColorProfile;
    if (profile === 'LEGACY') return 'legacy';
    if (profile === 'SRGB') return 'srgb';
    if (profile === 'DISPLAY_P3') return 'display-p3';
  } catch {
    // Fall through to the explicit unsupported state.
  }
  return 'unknown';
}

export function ensureColorSystemBuilderV2Initialized(): void {
  if (initialized) return;
  initializeColorSystemBuilderV2Controller({
    inventoryGenericSource: request =>
      inventoryColorSystemGenericSourceV2(figma, {
        usageScope: request.usageScope,
        documentProfile: detectDocumentColorProfile(),
        sourceLocator: figma.fileKey ? `figma-file:${figma.fileKey}` : 'figma-file:open-document',
        authorization: {
          status: 'user-authorized',
          receiptLocator: `teul-generic-builder:${request.capturedAt}`,
        },
        includeEnabledLibraryDescriptors: true,
        confirmWholeFile: request.confirmWholeFile,
        capturedAt: request.capturedAt,
        onProgress: request.onProgress,
        isCancelled: request.isCancelled,
      }),
    buildGenericInput: ({
      snapshot,
      proposal,
      confirmation,
      handoff,
      dataVisualization,
      sourceLabel,
    }) =>
      buildColorSystemGenericBuilderOrchestratorV2Input(snapshot, proposal, confirmation, handoff, {
        application: {
          modes: ['Light', 'Dark'],
          applicationMode: dataVisualization.mode,
          surfaceContext: dataVisualization.surfaceContext,
          categoricalMarkCount: dataVisualization.categoricalMarkCount,
          sequentialMarkCount: dataVisualization.sequentialMarkCount,
          divergingMarkCount: dataVisualization.divergingMarkCount,
          categoricalAdjacency: dataVisualization.adjacency,
          divergingMidpointMeaning: dataVisualization.midpointMeaning,
        },
        resource: {
          compilerVersion: 'teul-generic-color-builder-runtime/v2',
          systemId: 'teul-generic-intelligent-color-system-v2',
          outputName: `${sourceLabel} — Proposed Color System`,
        },
        maximumDirections: 3,
      }),
    rendererHost: snapshot =>
      createColorSystemFigmaRendererHostV2(figma, snapshot.currentFileIdentityHash),
    journalRuntime: createColorSystemCreateJournalRuntimeV2(
      createFigmaColorSystemCreateJournalHostV2(figma)
    ),
    postMessage: message => figma.ui.postMessage(message),
  });
  initialized = true;
}

export {
  handleAnalyzeGenericColorSystemV2,
  handleCancelGenericColorSystemV2,
  handleConfirmGenericColorSystemPlanV2,
  handleCreateIntelligentColorSystemV2,
};
