// Grid Operations for Figma Backend
// Handles grid frame creation, application, and clearing

import { gridConfigToFigmaLayoutGrids } from '../lib/figmaGrids';
import { analyzeResolvedGridFit } from '../lib/gridFit';
import { resolveGridConfigForTarget } from '../lib/gridUtils';
import type { GridConfig as SourceGridConfig } from '../types/grid';
import type { ApplyGridMessage, FigmaGridConfig, GridAppliedMessage } from '../types/messages';

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
  expectedTargetIds: readonly string[] | undefined
): string | null {
  if (!sourceConfig || !hasGridEntry(sourceConfig)) {
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

function buildLayoutGrids(config: FigmaGridConfig): LayoutGrid[] {
  return [config.columns, config.rows, config.baseline]
    .filter(grid => grid !== undefined)
    .map(grid => ({ ...grid }) as LayoutGrid);
}

function resolveLayoutGridsForNode(
  sourceConfig: SourceGridConfig,
  sourceDimensions: { width: number; height: number } | undefined,
  node: SceneNode
): LayoutGrid[] {
  const targetConfig = resolveGridConfigForTarget(sourceConfig, sourceDimensions, {
    width: node.width,
    height: node.height,
  });

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

// ============================================
// Create Grid Frame
// ============================================

export async function handleCreateGridFrame(msg: {
  config: FigmaGridConfig;
  frameName?: string;
  width: number;
  height: number;
  includeImage?: boolean;
  imageData?: string;
  positionNearSelection?: boolean;
}): Promise<void> {
  let frame: FrameNode | undefined;
  let imageRect: RectangleNode | undefined;
  const originalSelection = [...figma.currentPage.selection];

  try {
    const {
      config,
      frameName,
      width,
      height,
      includeImage,
      imageData,
      positionNearSelection = true,
    } = msg;

    if (!hasGridEntry(config)) {
      throw new Error('Grid frame config must include at least one grid');
    }
    if (includeImage && !imageData) {
      throw new Error('Grid frame image data is required when includeImage is true');
    }

    frame = figma.createFrame();
    const resolvedFrameName = frameName || 'Grid Frame';
    frame.name = resolvedFrameName;
    frame.resize(width, height);

    // Apply layout grids
    frame.layoutGrids = buildLayoutGrids(config);

    // Include original image as reference layer if requested
    if (includeImage && imageData) {
      // Decode base64 to Uint8Array
      const binaryString = atob(imageData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create image hash
      const imageHash = figma.createImage(bytes).hash;

      // Create rectangle with image fill
      imageRect = figma.createRectangle();
      imageRect.name = 'Reference Image';
      imageRect.resize(width, height);
      imageRect.x = 0;
      imageRect.y = 0;
      imageRect.fills = [
        {
          type: 'IMAGE',
          scaleMode: 'FILL',
          imageHash: imageHash,
        },
      ];
      imageRect.opacity = 0.5; // Semi-transparent for reference
      imageRect.locked = true; // Lock to prevent accidental edits

      frame.appendChild(imageRect);
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
    if (config.baseline) gridInfo.push('baseline grid');

    const infoStr = gridInfo.length > 0 ? ` (${gridInfo.join(', ')})` : '';
    figma.notify(`Created: ${resolvedFrameName}${infoStr}`);
  } catch (error) {
    console.error('Error creating grid frame:', error);
    removeNodeOnFailure(imageRect, 'reference image');
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
    expectedTargetIds,
    replaceExisting = true,
  } = msg;
  const scaledToFit = sourceDimensions !== undefined;
  const payloadError = getApplyGridPayloadError(sourceConfig, expectedTargetIds);
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

  let plans: GridApplyPlan[];
  try {
    plans = eligibleNodes.map(node => {
      const fit = analyzeResolvedGridFit(
        sourceConfig,
        { id: node.id, name: node.name, width: node.width, height: node.height },
        sourceDimensions
      );
      if (!fit.fits) {
        throw new Error(
          fit.recommendations[0]?.message ??
            fit.issues[0]?.message ??
            `Resolved grid does not fit "${node.name}"`
        );
      }

      const resolvedGrids = resolveLayoutGridsForNode(sourceConfig, sourceDimensions, node);
      if (resolvedGrids.length === 0) {
        throw new Error('Resolved grid payload contained no layout grids');
      }

      const previousGrids = snapshotLayoutGrids(node.layoutGrids);
      return {
        node,
        previousGrids,
        previousGridStyleId: node.gridStyleId,
        nextGrids: replaceExisting ? resolvedGrids : [...previousGrids, ...resolvedGrids],
      };
    });
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
      plan.node.layoutGrids = plan.nextGrids;
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
    const scaleNote = scaledToFit ? ' [scaled]' : '';
    const appliedCount = plans.length;
    const firstPlan = plans[0];
    const firstAppliedNode = firstPlan?.node;
    const message =
      selection.length === 1 && appliedCount === 1
        ? `${replaceExisting ? (firstPlan.previousGrids.length > 0 ? 'Replaced' : 'Applied') : 'Added'} grid on "${firstAppliedNode.name}"${infoStr}${scaleNote}`
        : `Grid apply: ${appliedCount} applied, ${skippedCount} skipped, 0 failed${infoStr}${scaleNote}`;

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
