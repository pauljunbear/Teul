import { buildColorSystemGenericBuilderOrchestratorV2Input } from '../lib/colorSystemBuilderOrchestratorV2';
import {
  handleAnalyzeGenericColorSystemV2,
  handleCancelGenericColorSystemV2,
  handleConfirmGenericColorSystemPlanV2,
  handleCreateIntelligentColorSystemV2,
  initializeColorSystemBuilderV2Controller,
} from './colorSystemBuilderV2Controller';
import { inventoryColorSystemGenericSourceV2 } from './colorSystemGenericSourceInventoryV2';
import { createColorSystemModelControllerV1 } from './colorSystemModelControllerV1';
import { createColorSystemModelReadScopeV1 } from './colorSystemModelReadScopeV1';
import { createColorSystemAuthoringControllerV1 } from './colorSystemAuthoringControllerV1';
import { serializeColorSystemInertJsonV1 } from '../lib/colorSystemInertJsonV1';
import { compileColorSystemDesignerScaleV1 } from '../lib/colorSystemDesignerScaleV1';
import { deterministicContentHash } from '../lib/colorSystemHashing';
import type { ColorSystemBuilderV2GenericInventoryRequest } from './colorSystemBuilderV2Controller';
import { createColorSystemFigmaRendererHostV2 } from './colorSystemFigmaHostV2';
import { createColorSystemAuthoredFigmaHostV1 } from './colorSystemAuthoredFigmaHostV1';
import { readColorSystemNativeContextV1 } from './colorSystemNativeOperationsV1';
import { buildColorSystemDesignerGeometryV1 } from '../lib/colorSystemDesignerGeometryV1';
import { isColorSystemAuthoringRequestV1 } from '../lib/colorSystemAuthoringBridgeV1';
import { isColorSystemModelRequestV1 } from '../lib/colorSystemModelBridgeV1';
import {
  createColorSystemCreateJournalRuntimeV2,
  createFigmaColorSystemCreateJournalHostV2,
} from './colorSystemCreateJournalV2';

let initialized = false;
let sourceReadsInFlight = 0;

function inventoryGenericSource(request: ColorSystemBuilderV2GenericInventoryRequest) {
  return inventoryColorSystemGenericSourceV2(figma, {
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
  });
}

const sourceReader = createColorSystemModelReadScopeV1(figma, {
  fileKey: () => figma.fileKey ?? null,
  documentProfile: detectDocumentColorProfile,
});
const modelDependencies = {
  inventory: inventoryGenericSource,
  sourceLocator: () => (figma.fileKey ? `figma-file:${figma.fileKey}` : null),
  sourceReader,
};
const modelController = createColorSystemModelControllerV1({
  ...modelDependencies,
  postMessage: () => {},
});
const authoringController = createColorSystemAuthoringControllerV1({
  clientStorage: figma.clientStorage,
  defaultGeometry(recipe) {
    if (!recipe.selection)
      throw new Error('Select a complete design before preparing application geometry.');
    return buildColorSystemDesignerGeometryV1(
      recipe.selection.model,
      recipe.selection.applications
    );
  },
  delivery: {
    sessionId: `authored-session:${deterministicContentHash({ startedAt: Date.now(), instance: Math.random() }).slice(7)}`,
    journal: createColorSystemCreateJournalRuntimeV2(
      createFigmaColorSystemCreateJournalHostV2(figma)
    ),
    async destination() {
      // This labels the actual open document. Source freshness is separately reproduced through
      // the captured native read scope; selection never determines the new output destination.
      const currentFileIdentityHash = deterministicContentHash({
        fileKey: figma.fileKey ?? null,
        rootId: figma.root.id,
        name: figma.root.name,
      });
      const context = readColorSystemNativeContextV1(figma, currentFileIdentityHash);
      return {
        name: figma.root.name,
        currentFileIdentityHash,
        documentType: context.documentType,
        colorProfile: context.colorProfile,
        editable: context.editable,
      };
    },
    host: destination =>
      createColorSystemAuthoredFigmaHostV1(figma, destination.currentFileIdentityHash),
  },
  prepareScale(source, input) {
    const compiled = compileColorSystemDesignerScaleV1(source, input, {
      actor: { kind: 'user', ref: 'teul:designer' },
      authorityRef: 'teul:explicit-scale-form',
      decisionRef: `teul:scale-intent:${deterministicContentHash(serializeColorSystemInertJsonV1(input)).slice(7)}`,
    });
    return {
      id: compiled.request.id,
      label: compiled.request.label,
      direction: compiled.direction,
    };
  },
  async checkSource(source, isCancelled) {
    // An imported read descriptor is only intent. A separate controller must reproduce the
    // entire native source snapshot before it can bind this recipe to the current document.
    const checker = createColorSystemModelControllerV1({
      ...modelDependencies,
      postMessage: () => {},
    });
    const loaded = await checker.handle({
      type: 'read-color-system-model-v1',
      requestId: 'recipe-source-load',
      source: 'guideline-json',
      json: serializeColorSystemInertJsonV1(source.model),
    });
    if (!loaded?.success || !source.currentFileReadScopeJson)
      return {
        status: 'unsupported',
        code: 'NEEDS_SOURCE_BINDING',
        sourceModelHash: source.model.modelHash,
        message:
          'This recipe has no supported native read scope. Read the source again to establish a new recipe.',
      };
    return checker.freshCheck({
      readScope: JSON.parse(source.currentFileReadScopeJson),
      isCancelled,
    });
  },
  postMessage: message => figma.ui.postMessage(message),
});

export async function handleColorSystemModelV1(message: unknown): Promise<void> {
  if (authoringController.isCreating()) {
    if (isColorSystemModelRequestV1(message))
      figma.ui.postMessage({
        type: 'color-system-model-result-v1',
        requestId: message.requestId,
        success: false,
        code: 'CREATE_IN_PROGRESS',
        error: 'Wait for the current Create outcome before replacing its source.',
      });
    return;
  }
  // Hold the source operation across awaits. Create cannot begin between installing the model
  // and adopting that same source into authoring, including an earlier pending source read.
  sourceReadsInFlight += 1;
  try {
    const result = await modelController.handle(message);
    const source = result?.success ? modelController.getCurrentSource() : null;
    if (source)
      authoringController.setSource({
        model: source.model,
        intake: source.intake,
        ...(source.readScope
          ? { currentFileReadScopeJson: serializeColorSystemInertJsonV1(source.readScope) }
          : {}),
      });
    if (result) figma.ui.postMessage(result);
  } finally {
    sourceReadsInFlight -= 1;
  }
}

export async function handleColorSystemAuthoringV1(message: unknown): Promise<void> {
  if (
    sourceReadsInFlight &&
    isColorSystemAuthoringRequestV1(message) &&
    message.type === 'color-system-authoring-v1' &&
    message.action === 'create-delivery'
  ) {
    figma.ui.postMessage({
      type: 'color-system-authoring-result-v1',
      requestId: message.requestId,
      success: false,
      code: 'SOURCE_READ_IN_PROGRESS',
      error: 'Wait for the source read to finish, then prepare a new delivery review.',
    });
    return;
  }
  await authoringController.handle(message);
}

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
    inventoryGenericSource,
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
