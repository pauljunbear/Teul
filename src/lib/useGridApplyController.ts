import * as React from 'react';
import type {
  GridLinkedResourcePolicy,
  GridNativeResources,
  GridPreset,
  GridSelectionTarget,
} from '../types/grid';
import type { GridAppliedMessage, SelectionInfoMessage } from '../types/messages';
import {
  buildApplyGridMessage,
  getPresetApplicationMode,
  getPresetSourceDimensions,
} from './figmaGrids';
import { analyzeResolvedPresetFits } from './gridFit';
import { resolveGridConstructionForTarget } from './gridConstructionV2';
import { validatePluginToUIMessage } from './messageValidation';
import { usePluginOperation } from './usePluginOperation';

export interface PendingGridApplyChoice<T extends GridPreset> {
  source: T;
  selection: SelectionInfoMessage;
  requestId: string;
  existingGridCount: number;
  linkedResourceCount: number;
}

export interface PendingGridClearChoice {
  selection: SelectionInfoMessage;
  requestId: string;
  existingGridCount: number;
}

interface UseGridApplyControllerOptions<T extends GridPreset> {
  requestPrefix: string;
  onResult: (result: GridAppliedMessage, operation: 'apply' | 'clear') => void;
  onFailure: (message: string) => void;
  onPreflightFailure?: (source: T, message: string) => void;
}

function normalizeSelection(message: SelectionInfoMessage): SelectionInfoMessage {
  return {
    ...message,
    eligibleTargets: message.eligibleTargets.map(target => ({
      ...target,
      layoutGridCount: target.layoutGridCount ?? 0,
      teulConstructionCount: target.teulConstructionCount ?? 0,
    })),
  };
}

function nativeResourcesFor(source: GridPreset): GridNativeResources | undefined {
  return (source as GridPreset & { nativeResources?: GridNativeResources }).nativeResources;
}

function existingGridCount(targets: readonly GridSelectionTarget[]): number {
  return targets.reduce(
    (total, target) => total + target.layoutGridCount + (target.teulConstructionCount ?? 0),
    0
  );
}

/** Shared selection, preflight, choice, correlation, timeout, and result controller. */
export function useGridApplyController<T extends GridPreset>(
  options: UseGridApplyControllerOptions<T>
) {
  const { requestPrefix, onResult, onFailure, onPreflightFailure } = options;
  const [selectionInfo, setSelectionInfo] = React.useState<SelectionInfoMessage | null>(null);
  const [pendingChoice, setPendingChoice] = React.useState<PendingGridApplyChoice<T> | null>(null);
  const [pendingClear, setPendingClear] = React.useState<PendingGridClearChoice | null>(null);
  const nextRequest = React.useRef(0);
  const pendingSource = React.useRef<T | null>(null);
  const pendingIntent = React.useRef<'apply' | 'clear' | null>(null);
  const activeMutation = React.useRef<'apply' | 'clear' | null>(null);

  const mutationOperation = usePluginOperation({
    resultType: 'grid-applied',
    onResult: result => {
      const operation = activeMutation.current ?? 'apply';
      activeMutation.current = null;
      onResult(result, operation);
    },
    onTimeout: () => {
      activeMutation.current = null;
      onFailure(
        'Figma did not finish the grid operation within 30 seconds. Inspect the selection before retrying.'
      );
    },
    onSubmitError: error => {
      activeMutation.current = null;
      onFailure(error.message);
    },
  });

  const submitApply = React.useCallback(
    (
      source: T,
      selection: SelectionInfoMessage,
      requestId: string,
      replaceExisting: boolean,
      linkedResourcePolicy: GridLinkedResourcePolicy
    ) => {
      const currentTargets = selection.eligibleTargets;
      const message = buildApplyGridMessage({
        requestId,
        config: source.config,
        expectedTargetIds: currentTargets.map(target => target.id),
        sourceDimensions: getPresetSourceDimensions(source),
        applicationMode: getPresetApplicationMode(source),
        responsiveWidth: source.responsiveWidth,
        replaceExisting,
        nativeResources: nativeResourcesFor(source),
        linkedResourcePolicy,
        construction: source.construction,
      });
      activeMutation.current = 'apply';
      mutationOperation.submit(message);
    },
    [mutationOperation]
  );

  const processSelection = React.useCallback(
    (rawSelection: SelectionInfoMessage) => {
      const selection = normalizeSelection(rawSelection);
      setSelectionInfo(selection);
      const intent = pendingIntent.current;
      const source = pendingSource.current;
      pendingIntent.current = null;
      pendingSource.current = null;

      if (!selection.hasSelection) {
        onFailure('Please select a frame first.');
        return;
      }
      if (selection.eligibleTargets.length === 0) {
        onFailure('No selected elements can accept layout grids.');
        return;
      }

      const gridCount = existingGridCount(selection.eligibleTargets);
      if (intent === 'clear') {
        if (gridCount === 0) {
          onFailure('No selected targets contain grids or Teul construction geometry.');
          return;
        }
        setPendingClear({
          selection,
          requestId: rawSelection.requestId!,
          existingGridCount: gridCount,
        });
        return;
      }
      if (intent !== 'apply' || !source) return;

      const sourceDimensions = getPresetSourceDimensions(source);
      const applicationMode = getPresetApplicationMode(source);
      try {
        const generatedConstruction =
          source.construction?.realization.kind === 'generated-geometry' ||
          source.construction?.realization.kind === 'approximation';
        if (generatedConstruction && source.construction) {
          for (const target of selection.eligibleTargets) {
            resolveGridConstructionForTarget(
              source.construction,
              sourceDimensions,
              { width: target.width, height: target.height },
              applicationMode,
              source.responsiveWidth
            );
          }
        } else {
          const fit = analyzeResolvedPresetFits(
            source,
            selection.eligibleTargets,
            sourceDimensions
          );
          if (fit.status === 'fail') {
            throw new Error(
              fit.representative.recommendations[0]?.message ??
                `This grid does not fit ${fit.representative.frame.name ?? 'one selected target'}.`
            );
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'This construction does not fit the selection.';
        onPreflightFailure?.(source, message);
        onFailure(message);
        return;
      }

      const nativeResources = nativeResourcesFor(source);
      const linkedResourceCount = nativeResources
        ? nativeResources.boundVariableIds.length + (nativeResources.gridStyleId ? 1 : 0)
        : 0;
      if (gridCount > 0 || linkedResourceCount > 0) {
        setPendingChoice({
          source,
          selection,
          requestId: rawSelection.requestId!,
          existingGridCount: gridCount,
          linkedResourceCount,
        });
        return;
      }
      submitApply(source, selection, rawSelection.requestId!, false, 'replace-with-values');
    },
    [onFailure, onPreflightFailure, submitApply]
  );

  const selectionOperation = usePluginOperation({
    resultType: 'selection-info',
    onResult: processSelection,
    onTimeout: () => {
      pendingIntent.current = null;
      pendingSource.current = null;
      onFailure('Figma did not return the current grid selection within 30 seconds.');
    },
    onSubmitError: error => {
      pendingIntent.current = null;
      pendingSource.current = null;
      onFailure(error.message);
    },
  });

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: unknown }>) => {
      const validation = validatePluginToUIMessage(event.data?.pluginMessage);
      if (!validation.valid || validation.message.type !== 'selection-info') return;
      setSelectionInfo(normalizeSelection(validation.message));
    };
    window.addEventListener('message', handleMessage);
    parent.postMessage({ pluginMessage: { type: 'get-selection-for-grid' } }, '*');
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const nextId = React.useCallback(
    (operation: 'apply' | 'clear') =>
      `${requestPrefix}-${operation}-${Date.now()}-${++nextRequest.current}`,
    [requestPrefix]
  );

  const requestApply = React.useCallback(
    (source: T): boolean => {
      if (
        selectionOperation.pending ||
        mutationOperation.pending ||
        pendingChoice ||
        pendingClear
      ) {
        return false;
      }
      pendingSource.current = source;
      pendingIntent.current = 'apply';
      return selectionOperation.submit({
        type: 'get-selection-for-grid',
        requestId: nextId('apply'),
      });
    },
    [mutationOperation.pending, nextId, pendingChoice, pendingClear, selectionOperation]
  );

  const requestClear = React.useCallback((): boolean => {
    if (selectionOperation.pending || mutationOperation.pending || pendingChoice || pendingClear) {
      return false;
    }
    pendingSource.current = null;
    pendingIntent.current = 'clear';
    return selectionOperation.submit({
      type: 'get-selection-for-grid',
      requestId: nextId('clear'),
    });
  }, [mutationOperation.pending, nextId, pendingChoice, pendingClear, selectionOperation]);

  const chooseApply = React.useCallback(
    (replaceExisting: boolean, linkedResourcePolicy: GridLinkedResourcePolicy) => {
      const choice = pendingChoice;
      if (!choice) return;
      setPendingChoice(null);
      submitApply(
        choice.source,
        choice.selection,
        choice.requestId,
        replaceExisting,
        linkedResourcePolicy
      );
    },
    [pendingChoice, submitApply]
  );

  const confirmClear = React.useCallback(() => {
    const choice = pendingClear;
    if (!choice) return;
    setPendingClear(null);
    activeMutation.current = 'clear';
    mutationOperation.submit({
      type: 'clear-grid',
      requestId: choice.requestId,
      expectedTargetIds: choice.selection.eligibleTargets.map(target => target.id),
    });
  }, [mutationOperation, pendingClear]);

  return {
    selectionInfo,
    pendingChoice,
    pendingClear,
    pending:
      selectionOperation.pending ||
      mutationOperation.pending ||
      pendingChoice !== null ||
      pendingClear !== null,
    requestApply,
    requestClear,
    chooseApply,
    confirmClear,
    cancelApplyChoice: () => setPendingChoice(null),
    cancelClear: () => setPendingClear(null),
  };
}
