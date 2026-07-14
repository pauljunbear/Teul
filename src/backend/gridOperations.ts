// Grid Operations for Figma Backend
// Handles grid frame creation, application, and clearing

import { gridConfigToFigmaLayoutGrids } from '../lib/figmaGrids';
import { analyzeResolvedGridFit } from '../lib/gridFit';
import { resolveGridConfigForTarget } from '../lib/gridUtils';
import { resolveGridConstructionForTarget } from '../lib/gridConstructionV2';
import { isNodeOrAncestorLocked } from './figmaHelpers';
import {
  canGenerateConstructionOnNode,
  createGeneratedConstructionOverlay,
  getGeneratedConstructionOverlays,
  type GeneratedConstructionTarget,
} from './gridConstructionGeometry';
import type {
  GridApplicationMode,
  GridConfig as SourceGridConfig,
  GridResponsiveWidth,
  GridConfig,
  GridColor,
  GridBoundVariables,
} from '../types/grid';
import type {
  ApplyGridMessage,
  ClearGridMessage,
  FigmaGridConfig,
  GridAppliedMessage,
  GridCaptureResultMessage,
} from '../types/messages';

type LayoutGridNode = SceneNode & {
  layoutGrids: ReadonlyArray<LayoutGrid>;
  gridStyleId: string;
  setGridStyleIdAsync(styleId: string): Promise<void>;
};

interface GridApplyPlan {
  node: LayoutGridNode;
  previousGrids: LayoutGrid[];
  previousGridStyleId: string;
  nextGrids: LayoutGrid[];
  nextGridStyleId: string;
}

interface GridRollbackResult {
  failedRestoreCount: number;
  remainingMutationCount: number;
}

const GRID_ENTRY_KEYS = ['columns', 'rows', 'baseline'] as const;

function canHaveLayoutGrids(node: SceneNode): node is LayoutGridNode {
  return 'layoutGrids' in node;
}

function hasGridEntry(config: FigmaGridConfig | SourceGridConfig): boolean {
  return GRID_ENTRY_KEYS.some(key => config[key] !== undefined);
}

function getApplyGridPayloadError(
  sourceConfig: SourceGridConfig | undefined,
  expectedTargetIds: readonly string[] | undefined,
  construction: ApplyGridMessage['construction']
): string | null {
  const generatedConstruction =
    construction?.realization.kind === 'generated-geometry' ||
    construction?.realization.kind === 'approximation';
  if ((!sourceConfig || !hasGridEntry(sourceConfig)) && !generatedConstruction) {
    return 'Grid payload sourceConfig must include at least one grid';
  }
  if (!expectedTargetIds || expectedTargetIds.length === 0) {
    return 'Grid payload must include expected target IDs';
  }
  if (new Set(expectedTargetIds).size !== expectedTargetIds.length) {
    return 'Grid payload expected target IDs must be unique';
  }
  return null;
}

async function applyGeneratedConstruction(params: {
  message: ApplyGridMessage;
  eligibleNodes: readonly LayoutGridNode[];
  skippedCount: number;
  postResult: (result: Omit<GridAppliedMessage, 'type' | 'requestId'>) => void;
}): Promise<void> {
  const { message, eligibleNodes, skippedCount, postResult } = params;
  const construction = message.construction;
  if (!construction) return;

  const generatedTargets: GeneratedConstructionTarget[] = [];
  try {
    if (message.linkedResourcePolicy === 'preserve-if-available') {
      throw new Error(
        'Generated construction geometry cannot preserve native grid-style links. Choose numeric values.'
      );
    }
    for (const node of eligibleNodes) {
      if (!canGenerateConstructionOnNode(node)) {
        throw new Error(
          `Generated construction cannot be added inside ${node.type.toLowerCase()} "${node.name}". Use a frame or component.`
        );
      }
      generatedTargets.push(node);
    }
  } catch (error) {
    const messageText = 'Grid construction rejected: unsupported target or resource policy';
    figma.notify(messageText);
    postResult({
      success: false,
      appliedCount: 0,
      skippedCount,
      failedCount: eligibleNodes.length,
      message: messageText,
      error: error instanceof Error ? error.message : 'Generated construction preflight failed',
      realization: construction.realization,
    });
    return;
  }

  let plans: Array<{
    node: GeneratedConstructionTarget;
    resolved: ReturnType<typeof resolveGridConstructionForTarget>;
    previousGrids: LayoutGrid[];
    previousGridStyleId: string;
    previousOverlays: SceneNode[];
  }>;
  try {
    plans = generatedTargets.map(node => ({
      node,
      resolved: resolveGridConstructionForTarget(
        construction,
        message.sourceDimensions,
        { width: node.width, height: node.height },
        message.applicationMode,
        message.responsiveWidth
      ),
      previousGrids: snapshotLayoutGrids(node.layoutGrids),
      previousGridStyleId: node.gridStyleId,
      previousOverlays: getGeneratedConstructionOverlays(node),
    }));
  } catch (error) {
    const messageText = 'Grid construction rejected: geometry does not fit the target';
    figma.notify(messageText);
    postResult({
      success: false,
      appliedCount: 0,
      skippedCount,
      failedCount: eligibleNodes.length,
      message: messageText,
      error: error instanceof Error ? error.message : 'Generated construction resolution failed',
      realization: construction.realization,
    });
    return;
  }
  const created: FrameNode[] = [];

  try {
    for (const plan of plans) {
      created.push(createGeneratedConstructionOverlay(plan.node, construction, plan.resolved));
    }

    if (message.replaceExisting) {
      for (const plan of plans) {
        if (plan.node.gridStyleId) await plan.node.setGridStyleIdAsync('');
        plan.node.layoutGrids = [];
      }
      for (const plan of plans) {
        for (const overlay of plan.previousOverlays) overlay.remove();
      }
    }

    figma.commitUndo();
    const realizationLabel =
      construction.realization.kind === 'approximation'
        ? 'generated approximation'
        : 'generated construction';
    const messageText = `Applied ${realizationLabel} to ${plans.length} target${plans.length === 1 ? '' : 's'}`;
    figma.notify(messageText);
    postResult({
      success: plans.length > 0,
      appliedCount: plans.length,
      skippedCount,
      failedCount: 0,
      message: messageText,
      frameName: plans[0]?.node.name,
      frameWidth: plans[0]?.node.width,
      frameHeight: plans[0]?.node.height,
      realization: construction.realization,
    });
  } catch (error) {
    for (const overlay of [...created].reverse()) {
      if (!overlay.removed) {
        try {
          overlay.remove();
        } catch (cleanupError) {
          console.error('Failed to remove generated construction during rollback:', cleanupError);
        }
      }
    }
    const rollbackPlans: GridApplyPlan[] = plans.map(plan => ({
      node: plan.node,
      previousGrids: plan.previousGrids,
      previousGridStyleId: plan.previousGridStyleId,
      nextGrids: [],
      nextGridStyleId: '',
    }));
    const rollback = await rollbackGridPlans(rollbackPlans);
    const messageText = `Generated grid construction rolled back${rollback.remainingMutationCount > 0 ? ` with ${rollback.remainingMutationCount} remaining mutation${rollback.remainingMutationCount === 1 ? '' : 's'}` : ''}`;
    figma.notify(messageText);
    postResult({
      success: false,
      appliedCount: rollback.remainingMutationCount,
      skippedCount,
      failedCount: eligibleNodes.length - rollback.remainingMutationCount,
      message: messageText,
      error: error instanceof Error ? error.message : 'Generated construction failed',
      realization: construction.realization,
    });
  }
}

function buildLayoutGrids(config: FigmaGridConfig): LayoutGrid[] {
  return [config.columns, config.rows, config.baseline]
    .filter(grid => grid !== undefined)
    .map(grid => ({ ...grid }) as LayoutGrid);
}

function removeBoundVariables(grids: readonly LayoutGrid[]): LayoutGrid[] {
  return grids.map(grid => {
    const { boundVariables: _boundVariables, ...numericGrid } = grid;
    return numericGrid as LayoutGrid;
  });
}

async function assertLinkedResourcesAvailable(message: ApplyGridMessage): Promise<void> {
  if (message.linkedResourcePolicy !== 'preserve-if-available') return;
  const resources = message.nativeResources;
  if (!resources) throw new Error('No linked resource metadata was supplied');
  if (resources.sourceFileKey && figma.fileKey && resources.sourceFileKey !== figma.fileKey) {
    throw new Error(
      'Captured grid links belong to another Figma file. Choose numeric values to apply without links.'
    );
  }

  if (resources.gridStyleId) {
    const style = await figma.getStyleByIdAsync(resources.gridStyleId);
    if (!style || style.type !== 'GRID') {
      throw new Error(
        'The captured grid style is unavailable. Choose numeric values to replace the missing link.'
      );
    }
  }

  for (const variableId of resources.boundVariableIds) {
    if (!(await figma.variables.getVariableByIdAsync(variableId))) {
      throw new Error(
        'A captured grid variable is unavailable. Choose numeric values to replace the missing link.'
      );
    }
  }
}

function resolveLayoutGridsForNode(
  sourceConfig: SourceGridConfig,
  sourceDimensions: { width: number; height: number } | undefined,
  applicationMode: GridApplicationMode,
  responsiveWidth: GridResponsiveWidth | undefined,
  node: SceneNode
): LayoutGrid[] {
  const targetConfig = resolveGridConfigForTarget(
    sourceConfig,
    sourceDimensions,
    {
      width: node.width,
      height: node.height,
    },
    applicationMode,
    responsiveWidth
  );

  return gridConfigToFigmaLayoutGrids(targetConfig, node.width, node.height).map(
    grid => ({ ...grid }) as LayoutGrid
  );
}

function haveMatchingTargetIds(
  nodes: readonly LayoutGridNode[],
  expectedTargetIds: readonly string[]
): boolean {
  if (nodes.length !== expectedTargetIds.length) return false;
  const currentTargetIds = new Set(nodes.map(node => node.id));
  return expectedTargetIds.every(id => currentTargetIds.has(id));
}

function haveMatchingGridColors(left: RGBA | undefined, right: RGBA | undefined): boolean {
  if (!left || !right) return left === right;
  return left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a;
}

function haveMatchingBoundVariables(
  left: LayoutGrid['boundVariables'],
  right: LayoutGrid['boundVariables']
): boolean {
  const normalize = (boundVariables: LayoutGrid['boundVariables']): string[] =>
    Object.entries(boundVariables ?? {})
      .filter((entry): entry is [string, VariableAlias] => entry[1] !== undefined)
      .map(([field, alias]) => `${field}\u0000${alias.type}\u0000${alias.id}`)
      .sort();

  const leftEntries = normalize(left);
  const rightEntries = normalize(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every((entry, index) => entry === rightEntries[index])
  );
}

function haveMatchingLayoutGrids(
  currentGrids: ReadonlyArray<LayoutGrid>,
  expectedGrids: ReadonlyArray<LayoutGrid>
): boolean {
  return (
    currentGrids.length === expectedGrids.length &&
    currentGrids.every((current, index) => {
      const expected = expectedGrids[index];
      if (
        !expected ||
        current.pattern !== expected.pattern ||
        current.visible !== expected.visible ||
        !haveMatchingGridColors(current.color, expected.color) ||
        !haveMatchingBoundVariables(current.boundVariables, expected.boundVariables)
      ) {
        return false;
      }

      if (current.pattern === 'GRID' && expected.pattern === 'GRID') {
        return current.sectionSize === expected.sectionSize;
      }
      if (current.pattern === 'GRID' || expected.pattern === 'GRID') {
        return false;
      }

      return (
        current.alignment === expected.alignment &&
        current.count === expected.count &&
        current.gutterSize === expected.gutterSize &&
        current.offset === expected.offset &&
        current.sectionSize === expected.sectionSize
      );
    })
  );
}

function snapshotLayoutGrids(grids: ReadonlyArray<LayoutGrid>): LayoutGrid[] {
  return grids.map(
    grid =>
      ({
        ...grid,
        color: grid.color ? { ...grid.color } : undefined,
        boundVariables: grid.boundVariables ? { ...grid.boundVariables } : undefined,
      }) as LayoutGrid
  );
}

async function rollbackGridPlans(plans: readonly GridApplyPlan[]): Promise<GridRollbackResult> {
  let failedRestoreCount = 0;
  for (const plan of [...plans].reverse()) {
    let restoreFailed = false;

    try {
      plan.node.layoutGrids = plan.previousGrids;
    } catch (rollbackError) {
      restoreFailed = true;
      console.error(`Failed to roll back grid on "${plan.node.name}":`, rollbackError);
    }

    if (plan.node.gridStyleId !== plan.previousGridStyleId) {
      try {
        await plan.node.setGridStyleIdAsync(plan.previousGridStyleId);
      } catch (rollbackError) {
        restoreFailed = true;
        console.error(`Failed to restore grid style on "${plan.node.name}":`, rollbackError);
      }
    }

    if (restoreFailed) failedRestoreCount++;
  }

  const remainingMutationCount = plans.filter(
    plan =>
      plan.node.gridStyleId !== plan.previousGridStyleId ||
      !haveMatchingLayoutGrids(plan.node.layoutGrids, plan.previousGrids)
  ).length;

  return { failedRestoreCount, remainingMutationCount };
}

function removeNodeOnFailure(node: BaseNode | undefined, label: string): void {
  if (!node || node.removed) return;

  try {
    node.remove();
  } catch (error) {
    console.error(`Failed to remove partial ${label}:`, error);
  }
}

export function handleCaptureSelectedGrid(requestId: string): void {
  const result: GridCaptureResultMessage = {
    type: 'grid-capture-result',
    requestId,
    success: false,
  };

  try {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || !canHaveLayoutGrids(selection[0])) {
      throw new Error('Select exactly one frame or component with layout grids');
    }
    const target = selection[0];
    if (target.layoutGrids.length === 0) throw new Error('The selected target has no layout grids');

    const config: GridConfig = {};
    const boundVariableIds = new Set<string>();
    for (const grid of target.layoutGrids) {
      const color: GridColor = grid.color
        ? { r: grid.color.r, g: grid.color.g, b: grid.color.b, a: grid.color.a }
        : { r: 1, g: 0.2, b: 0.2, a: 0.1 };
      const boundVariables: GridBoundVariables | undefined = grid.boundVariables
        ? Object.fromEntries(
            Object.entries(grid.boundVariables)
              .filter((entry): entry is [string, VariableAlias] => entry[1] !== undefined)
              .map(([field, alias]) => {
                boundVariableIds.add(alias.id);
                return [field, { type: 'VARIABLE_ALIAS' as const, id: alias.id }];
              })
          )
        : undefined;
      if (grid.pattern === 'COLUMNS' || grid.pattern === 'ROWS') {
        if (grid.alignment !== 'STRETCH') {
          throw new Error('Capture currently supports stretch column and row grids only');
        }
        const captured = {
          count: grid.count,
          gutterSize: grid.gutterSize,
          gutterUnit: 'px' as const,
          margin: grid.offset ?? 0,
          marginUnit: 'px' as const,
          alignment: grid.alignment,
          visible: grid.visible !== false,
          color,
          ...(boundVariables ? { boundVariables } : {}),
        };
        if (grid.pattern === 'COLUMNS') {
          if (config.columns)
            throw new Error('Multiple column grids cannot be captured as one preset');
          config.columns = captured;
        } else {
          if (config.rows) throw new Error('Multiple row grids cannot be captured as one preset');
          config.rows = captured;
        }
      } else {
        if (config.baseline)
          throw new Error('Multiple uniform grids cannot be captured as one preset');
        config.baseline = {
          height: grid.sectionSize ?? 8,
          offset: 0,
          visible: grid.visible !== false,
          color,
          ...(boundVariables ? { boundVariables } : {}),
        };
      }
    }

    result.success = true;
    result.config = config;
    result.frameName = target.name;
    result.dimensions = { width: target.width, height: target.height };
    result.nativeResources = {
      ...(target.gridStyleId ? { gridStyleId: target.gridStyleId } : {}),
      boundVariableIds: [...boundVariableIds].sort(),
      ...(figma.fileKey ? { sourceFileKey: figma.fileKey } : {}),
    };
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Failed to capture selected grid';
  }

  figma.ui.postMessage(result);
}

// ============================================
// Create Grid Frame
// ============================================

export async function handleCreateGridFrame(msg: {
  config: FigmaGridConfig;
  frameName?: string;
  width: number;
  height: number;
  positionNearSelection?: boolean;
  construction?: ApplyGridMessage['construction'];
}): Promise<boolean> {
  let frame: FrameNode | undefined;
  const originalSelection = [...figma.currentPage.selection];

  try {
    const { config, frameName, width, height, positionNearSelection = true, construction } = msg;
    const generatedConstruction =
      construction?.realization.kind === 'generated-geometry' ||
      construction?.realization.kind === 'approximation';

    if (!hasGridEntry(config) && !generatedConstruction) {
      throw new Error('Grid frame config must include at least one grid');
    }
    frame = figma.createFrame();
    const resolvedFrameName = frameName || 'Grid Frame';
    frame.name = resolvedFrameName;
    frame.resize(width, height);

    // Apply layout grids
    frame.layoutGrids = generatedConstruction ? [] : buildLayoutGrids(config);
    if (generatedConstruction && construction) {
      createGeneratedConstructionOverlay(
        frame,
        construction,
        resolveGridConstructionForTarget(
          construction,
          { width, height },
          { width, height },
          'fixed'
        )
      );
    }

    // Position near selection or in viewport center
    const selection = figma.currentPage.selection;
    if (positionNearSelection && selection.length > 0) {
      const bounds = selection[0];

      // Calculate position to the right of selection with spacing
      const spacing = 48;
      frame.x = bounds.x + bounds.width + spacing;
      frame.y = bounds.y;

      // Check if frame would go off-canvas (beyond reasonable bounds)
      // If so, position below instead
      const maxX = 100000; // Figma's practical limit
      if (frame.x + frame.width > maxX) {
        frame.x = bounds.x;
        frame.y = bounds.y + bounds.height + spacing;
      }
    } else {
      frame.x = figma.viewport.center.x - width / 2;
      frame.y = figma.viewport.center.y - height / 2;
    }

    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);

    // Build notification message
    const gridInfo: string[] = [];
    if (config.columns?.count) gridInfo.push(`${config.columns.count} columns`);
    if (config.rows?.count) gridInfo.push(`${config.rows.count} rows`);
    if (config.baseline && !generatedConstruction) gridInfo.push('baseline grid');
    if (generatedConstruction) gridInfo.push('generated construction');

    const infoStr = gridInfo.length > 0 ? ` (${gridInfo.join(', ')})` : '';
    figma.notify(`Created: ${resolvedFrameName}${infoStr}`);
    return true;
  } catch (error) {
    console.error('Error creating grid frame:', error);
    removeNodeOnFailure(frame, 'grid frame');
    try {
      figma.currentPage.selection = originalSelection;
    } catch (selectionError) {
      console.error(
        'Failed to restore selection after grid frame creation failure:',
        selectionError
      );
    }
    figma.notify('Failed to create grid frame');
    return false;
  }
}

// ============================================
// Apply Grid to Selection
// ============================================

export async function handleApplyGrid(msg: ApplyGridMessage): Promise<void> {
  const selection = figma.currentPage.selection;
  const {
    requestId,
    sourceConfig,
    sourceDimensions,
    applicationMode,
    responsiveWidth,
    expectedTargetIds,
    replaceExisting = true,
    nativeResources,
    linkedResourcePolicy = 'replace-with-values',
  } = msg;
  const payloadError = getApplyGridPayloadError(sourceConfig, expectedTargetIds, msg.construction);
  const postResult = (result: Omit<GridAppliedMessage, 'type' | 'requestId'>): void => {
    figma.ui.postMessage({ type: 'grid-applied', requestId, ...result });
  };

  if (payloadError) {
    const message = 'Grid apply rejected: invalid or empty grid payload';
    figma.notify(message);
    postResult({
      success: false,
      appliedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      message,
      error: payloadError,
    });
    return;
  }

  if (selection.length === 0) {
    const message = 'Grid apply: 0 applied, 0 skipped, 0 failed (no selection)';
    figma.notify(message);
    postResult({
      success: false,
      appliedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      message,
      error: 'No selection',
    });
    return;
  }

  const eligibleNodes = selection.filter(canHaveLayoutGrids);
  const skippedCount = selection.length - eligibleNodes.length;
  if (!haveMatchingTargetIds(eligibleNodes, expectedTargetIds)) {
    const message = 'Grid apply rejected: selection changed before apply';
    figma.notify(message);
    postResult({
      success: false,
      appliedCount: 0,
      skippedCount,
      failedCount: 0,
      message,
      error: 'Selection changed after the grid target snapshot',
    });
    return;
  }

  const lockedNodes = eligibleNodes.filter(isNodeOrAncestorLocked);
  if (lockedNodes.length > 0) {
    const message = `Grid apply rejected: unlock ${lockedNodes.length === 1 ? 'the selected target' : `${lockedNodes.length} selected targets`} first`;
    figma.notify(message);
    postResult({
      success: false,
      appliedCount: 0,
      skippedCount,
      failedCount: eligibleNodes.length,
      message,
      error: 'Locked grid targets cannot be edited',
    });
    return;
  }

  if (
    msg.construction?.realization.kind === 'generated-geometry' ||
    msg.construction?.realization.kind === 'approximation'
  ) {
    await applyGeneratedConstruction({ message: msg, eligibleNodes, skippedCount, postResult });
    return;
  }

  let plans: GridApplyPlan[];
  try {
    await assertLinkedResourcesAvailable(msg);
    plans = [];
    for (const node of eligibleNodes) {
      const fit = analyzeResolvedGridFit(
        sourceConfig,
        { id: node.id, name: node.name, width: node.width, height: node.height },
        sourceDimensions,
        { applicationMode, responsiveWidth }
      );
      if (!fit.fits) {
        throw new Error(
          fit.recommendations[0]?.message ??
            fit.issues[0]?.message ??
            `Resolved grid does not fit "${node.name}"`
        );
      }

      const linkedGrids = resolveLayoutGridsForNode(
        sourceConfig,
        sourceDimensions,
        applicationMode,
        responsiveWidth,
        node
      );
      const resolvedGrids =
        linkedResourcePolicy === 'preserve-if-available'
          ? linkedGrids
          : removeBoundVariables(linkedGrids);
      if (resolvedGrids.length === 0) {
        throw new Error('Resolved grid payload contained no layout grids');
      }

      const previousGrids = snapshotLayoutGrids(node.layoutGrids);
      if (
        linkedResourcePolicy === 'preserve-if-available' &&
        !replaceExisting &&
        (previousGrids.length > 0 || node.gridStyleId)
      ) {
        throw new Error(
          'Linked grid resources cannot be added to existing guides without detaching them. Choose Replace or numeric values.'
        );
      }
      plans.push({
        node,
        previousGrids,
        previousGridStyleId: node.gridStyleId,
        nextGrids: replaceExisting ? resolvedGrids : [...previousGrids, ...resolvedGrids],
        nextGridStyleId:
          linkedResourcePolicy === 'preserve-if-available'
            ? (nativeResources?.gridStyleId ?? '')
            : '',
      });
    }
  } catch (error) {
    console.error('Grid apply preflight failed:', error);
    const message = 'Grid apply rejected: current target geometry does not fit';
    figma.notify(message);
    postResult({
      success: false,
      appliedCount: 0,
      skippedCount,
      failedCount: 0,
      message,
      error: error instanceof Error ? error.message : 'Grid apply preflight failed',
    });
    return;
  }

  const attemptedPlans: GridApplyPlan[] = [];
  try {
    for (const plan of plans) {
      attemptedPlans.push(plan);
      if (plan.node.gridStyleId) await plan.node.setGridStyleIdAsync('');
      plan.node.layoutGrids = plan.nextGrids;
      if (plan.nextGridStyleId) await plan.node.setGridStyleIdAsync(plan.nextGridStyleId);
    }

    const gridInfo: string[] = [];
    if (sourceConfig.columns?.count) {
      gridInfo.push(`${sourceConfig.columns.count}col`);
    }
    if (sourceConfig.rows?.count) {
      gridInfo.push(`${sourceConfig.rows.count}row`);
    }
    if (sourceConfig.baseline) gridInfo.push('uniform');

    const infoStr = gridInfo.length > 0 ? ` (${gridInfo.join(', ')})` : '';
    const resolutionNote =
      applicationMode === 'scale-from-reference'
        ? ' [scaled]'
        : applicationMode === 'responsive-width'
          ? ' [responsive]'
          : applicationMode === 'canonical-only'
            ? ' [source-faithful]'
            : '';
    const linkedResourceNote = nativeResources
      ? linkedResourcePolicy === 'preserve-if-available'
        ? ' [links preserved]'
        : ' [numeric values]'
      : '';
    const appliedCount = plans.length;
    const firstPlan = plans[0];
    const firstAppliedNode = firstPlan?.node;
    const message =
      selection.length === 1 && appliedCount === 1
        ? `${replaceExisting ? (firstPlan.previousGrids.length > 0 ? 'Replaced' : 'Applied') : 'Added'} grid on "${firstAppliedNode.name}"${infoStr}${resolutionNote}${linkedResourceNote}`
        : `Grid apply: ${appliedCount} applied, ${skippedCount} skipped, 0 failed${infoStr}${resolutionNote}${linkedResourceNote}`;

    figma.commitUndo();
    figma.notify(message);

    // Send success message back to UI
    postResult({
      success: appliedCount > 0,
      appliedCount,
      skippedCount,
      failedCount: 0,
      message,
      frameName: firstAppliedNode?.name,
      frameWidth: firstAppliedNode?.width,
      frameHeight: firstAppliedNode?.height,
      error: appliedCount === 0 ? 'No selected elements can accept layout grids' : undefined,
    });
  } catch (error) {
    console.error('Error applying grid; rolling back prior targets:', error);
    const rollback = await rollbackGridPlans(attemptedPlans);
    const appliedCount = rollback.remainingMutationCount;
    const failedCount = eligibleNodes.length - appliedCount;
    const rollbackFailureNote =
      rollback.failedRestoreCount > 0
        ? `; rollback restoration failed on ${rollback.failedRestoreCount} target${rollback.failedRestoreCount === 1 ? '' : 's'}`
        : '';
    const remainingMutationNote =
      appliedCount > 0
        ? `; ${appliedCount} mutation${appliedCount === 1 ? '' : 's'} ${appliedCount === 1 ? 'remains' : 'remain'}`
        : '';
    const message = `Grid apply ${appliedCount === 0 ? 'rolled back' : 'partially rolled back'}: ${appliedCount} applied, ${skippedCount} skipped, ${failedCount} failed${rollbackFailureNote}${remainingMutationNote}`;
    figma.notify(message);

    postResult({
      success: false,
      appliedCount,
      skippedCount,
      failedCount,
      message,
      error:
        rollback.failedRestoreCount > 0
          ? `Failed to apply grid atomically; rollback restoration failed on ${rollback.failedRestoreCount} target${rollback.failedRestoreCount === 1 ? '' : 's'} and ${appliedCount} mutation${appliedCount === 1 ? '' : 's'} ${appliedCount === 1 ? 'remains' : 'remain'}`
          : 'Failed to apply grid atomically; prior targets were rolled back',
    });
  }
}

interface GeneratedOverlayBackup {
  original: SceneNode;
  backup: SceneNode;
  parent: ChildrenMixin;
  index: number;
  visible: boolean;
}

function createGeneratedOverlayBackups(overlays: readonly SceneNode[]): GeneratedOverlayBackup[] {
  const backups: GeneratedOverlayBackup[] = [];
  try {
    for (const original of overlays) {
      const parent = original.parent;
      if (!parent || !('children' in parent) || !('insertChild' in parent)) {
        throw new Error(`Cannot safely clear generated overlay "${original.name}"`);
      }
      const index = parent.children.indexOf(original);
      if (index < 0) throw new Error(`Generated overlay "${original.name}" is detached`);
      const backup = original.clone();
      backup.visible = false;
      parent.insertChild(index, backup);
      backups.push({ original, backup, parent, index, visible: original.visible });
    }
    return backups;
  } catch (error) {
    for (const item of [...backups].reverse()) {
      if (!item.backup.removed) item.backup.remove();
    }
    throw error;
  }
}

function restoreGeneratedOverlayBackups(backups: readonly GeneratedOverlayBackup[]): string[] {
  const failures: string[] = [];
  for (const item of backups) {
    try {
      if (item.original.removed) {
        item.backup.visible = item.visible;
        item.parent.insertChild(Math.min(item.index, item.parent.children.length), item.backup);
      } else if (!item.backup.removed) {
        item.backup.remove();
      }
    } catch (error) {
      console.error('Failed to restore generated construction overlay:', error);
      failures.push(`generated overlay "${item.original.name}" restoration failed`);
    }
  }
  return failures;
}

/** Clear native guides, grid-style links, and Teul generated construction overlays. */
export async function handleClearGrid(msg: ClearGridMessage): Promise<void> {
  const selection = figma.currentPage.selection;
  const postResult = (result: Omit<GridAppliedMessage, 'type' | 'requestId'>): void => {
    figma.ui.postMessage({ type: 'grid-applied', requestId: msg.requestId, ...result });
  };

  if (selection.length === 0) {
    postResult({
      success: false,
      appliedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      message: 'Grid clear: no selection',
      error: 'No selection',
    });
    return;
  }

  const eligibleNodes = selection.filter(canHaveLayoutGrids);
  const ineligibleCount = selection.length - eligibleNodes.length;
  if (!haveMatchingTargetIds(eligibleNodes, msg.expectedTargetIds)) {
    postResult({
      success: false,
      appliedCount: 0,
      skippedCount: ineligibleCount,
      failedCount: 0,
      message: 'Grid clear rejected: selection changed before clear',
      error: 'Selection changed after the grid target snapshot',
    });
    return;
  }

  const plans = eligibleNodes
    .map(node => ({
      node,
      previousGrids: snapshotLayoutGrids(node.layoutGrids),
      previousGridStyleId: node.gridStyleId,
      overlays: canGenerateConstructionOnNode(node) ? getGeneratedConstructionOverlays(node) : [],
    }))
    .filter(
      plan =>
        plan.previousGrids.length > 0 ||
        plan.previousGridStyleId.length > 0 ||
        plan.overlays.length > 0
    );
  const skippedCount = selection.length - plans.length;
  const lockedNodes = plans.filter(plan => isNodeOrAncestorLocked(plan.node));
  if (lockedNodes.length > 0) {
    postResult({
      success: false,
      appliedCount: 0,
      skippedCount,
      failedCount: lockedNodes.length,
      message: 'Grid clear rejected: unlock selected targets first',
      error: 'Locked grid targets cannot be edited',
    });
    return;
  }
  if (plans.length === 0) {
    postResult({
      success: false,
      appliedCount: 0,
      skippedCount: selection.length,
      failedCount: 0,
      message: 'Grid clear: no selected grids to clear',
      error: 'No selected targets contain grids or Teul construction geometry',
    });
    return;
  }

  let backups: GeneratedOverlayBackup[] = [];
  const attemptedPlans: GridApplyPlan[] = [];
  try {
    backups = createGeneratedOverlayBackups(plans.flatMap(plan => plan.overlays));
    for (const plan of plans) {
      attemptedPlans.push({
        node: plan.node,
        previousGrids: plan.previousGrids,
        previousGridStyleId: plan.previousGridStyleId,
        nextGrids: [],
        nextGridStyleId: '',
      });
      if (plan.node.gridStyleId) await plan.node.setGridStyleIdAsync('');
      plan.node.layoutGrids = [];
    }
    for (const plan of plans) {
      for (const overlay of plan.overlays) overlay.remove();
    }
    for (const item of backups) item.backup.remove();

    figma.commitUndo();
    const message = `Cleared grids from ${plans.length} target${plans.length === 1 ? '' : 's'}`;
    figma.notify(message);
    postResult({
      success: true,
      appliedCount: plans.length,
      skippedCount,
      failedCount: 0,
      message,
      frameName: plans[0]?.node.name,
      frameWidth: plans[0]?.node.width,
      frameHeight: plans[0]?.node.height,
    });
  } catch (error) {
    const rollback = await rollbackGridPlans(attemptedPlans);
    const overlayFailures = restoreGeneratedOverlayBackups(backups);
    const rollbackFailed = rollback.failedRestoreCount + overlayFailures.length;
    const message =
      rollbackFailed === 0
        ? 'Grid clear rolled back'
        : `Grid clear failed with ${rollbackFailed} rollback problem${rollbackFailed === 1 ? '' : 's'}`;
    figma.notify(message);
    postResult({
      success: false,
      appliedCount: rollback.remainingMutationCount,
      skippedCount,
      failedCount: plans.length - rollback.remainingMutationCount,
      message,
      error:
        error instanceof Error
          ? `${error.message}${overlayFailures.length > 0 ? `; ${overlayFailures.join('; ')}` : ''}`
          : 'Failed to clear grids atomically',
    });
  }
}
