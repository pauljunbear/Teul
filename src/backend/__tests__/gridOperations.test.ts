import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplyGridMessage } from '../../types/messages';
import { handleApplyGrid, handleCreateGridFrame } from '../gridOperations';

const color = { r: 0, g: 0.5, b: 1, a: 0.1 };
const sourceColumns = {
  count: 12,
  gutterSize: 24,
  gutterUnit: 'px' as const,
  margin: 20,
  marginUnit: 'px' as const,
  alignment: 'STRETCH' as const,
  visible: true,
  color,
};
const fallbackBaseline = {
  pattern: 'GRID' as const,
  sectionSize: 10,
  visible: true,
  color,
};
const sourceBaseline = {
  height: 10,
  offset: 0,
  visible: true,
  color,
};

type WriteBehavior =
  | 'succeed'
  | 'succeed-without-bound-variables'
  | 'reject-explicit-undefined'
  | 'fail-before-write'
  | 'fail-after-write';

function createLayoutGridNode(
  name: string,
  initialGrids: LayoutGrid[] = [],
  writeBehaviors: WriteBehavior[] = [],
  initialGridStyleId = '',
  styleWriteBehaviors: WriteBehavior[] = []
): SceneNode & {
  getLayoutGrids: () => ReadonlyArray<LayoutGrid>;
  getGridStyleId: () => string;
} {
  let layoutGrids: ReadonlyArray<LayoutGrid> = initialGrids;
  let gridStyleId = initialGridStyleId;
  let writeIndex = 0;
  let styleWriteIndex = 0;
  const node = {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    type: 'FRAME',
    width: 800,
    height: 600,
    getLayoutGrids: () => layoutGrids,
    getGridStyleId: () => gridStyleId,
    get gridStyleId() {
      return gridStyleId;
    },
    setGridStyleIdAsync: vi.fn(async (styleId: string) => {
      const behavior = styleWriteBehaviors[styleWriteIndex++] ?? 'succeed';
      if (behavior === 'fail-before-write') {
        throw new Error('style write failed');
      }
      gridStyleId = styleId;
      if (behavior === 'fail-after-write') {
        throw new Error('style write failed after mutation');
      }
    }),
    removed: false,
    remove: vi.fn(() => {
      node.removed = true;
    }),
  };

  Object.defineProperty(node, 'layoutGrids', {
    get: () => layoutGrids,
    set: (value: ReadonlyArray<LayoutGrid>) => {
      const behavior = writeBehaviors[writeIndex++] ?? 'succeed';
      if (behavior === 'fail-before-write') {
        throw new Error('write failed');
      }
      if (
        behavior === 'reject-explicit-undefined' &&
        value.some(grid => Object.values(grid).some(property => property === undefined))
      ) {
        throw new Error('invalid undefined layout grid property');
      }
      layoutGrids =
        behavior === 'succeed-without-bound-variables'
          ? value.map(grid => ({ ...grid, boundVariables: undefined }) as LayoutGrid)
          : value;
      gridStyleId = '';
      if (behavior === 'fail-after-write') {
        throw new Error('write failed after mutation');
      }
    },
    enumerable: true,
  });

  return node as unknown as SceneNode & {
    getLayoutGrids: () => ReadonlyArray<LayoutGrid>;
    getGridStyleId: () => string;
  };
}

function createIneligibleNode(name: string): SceneNode {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    type: 'RECTANGLE',
    width: 100,
    height: 100,
  } as unknown as SceneNode;
}

function applyGridMessage(
  expectedTargetIds: string[],
  overrides: Partial<ApplyGridMessage> = {}
): ApplyGridMessage {
  return {
    type: 'apply-grid',
    requestId: 'grid-apply-test',
    sourceConfig: { columns: sourceColumns },
    expectedTargetIds,
    replaceExisting: true,
    ...overrides,
  };
}

function installFigmaMock(selection: SceneNode[]) {
  const notify = vi.fn();
  const postMessage = vi.fn();
  const scrollAndZoomIntoView = vi.fn();

  vi.stubGlobal('figma', {
    currentPage: { selection },
    notify,
    ui: { postMessage },
    viewport: {
      center: { x: 500, y: 500 },
      scrollAndZoomIntoView,
    },
  });

  return { notify, postMessage, scrollAndZoomIntoView };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('handleCreateGridFrame', () => {
  it('uses the frontend GRID sectionSize when creating a frame', async () => {
    const frame = createLayoutGridNode('New Frame');
    const { scrollAndZoomIntoView } = installFigmaMock([]);
    Object.assign(figma, {
      createFrame: vi.fn(() => frame),
    });
    Object.assign(frame, {
      resize: vi.fn(),
      appendChild: vi.fn(),
      x: 0,
      y: 0,
    });

    await handleCreateGridFrame({
      config: {
        baseline: {
          pattern: 'GRID',
          sectionSize: 12,
          visible: true,
          color,
        },
      },
      width: 800,
      height: 600,
    });

    expect(frame.getLayoutGrids()).toEqual([
      expect.objectContaining({ pattern: 'GRID', sectionSize: 12 }),
    ]);
    expect(scrollAndZoomIntoView).toHaveBeenCalledWith([frame]);
  });

  it('rejects an empty config before creating a frame', async () => {
    installFigmaMock([]);
    const createFrame = vi.fn();
    Object.assign(figma, { createFrame });

    await handleCreateGridFrame({
      config: {},
      width: 800,
      height: 600,
    });

    expect(createFrame).not.toHaveBeenCalled();
    expect(figma.notify).toHaveBeenCalledWith('Failed to create grid frame');
  });

  it('removes partial image and frame nodes when image setup fails', async () => {
    const frame = createLayoutGridNode('New Frame');
    const imageRect = createIneligibleNode('Reference Image') as RectangleNode;
    Object.assign(frame, {
      resize: vi.fn(),
      appendChild: vi.fn(() => {
        throw new Error('append failed');
      }),
      x: 0,
      y: 0,
    });
    Object.assign(imageRect, {
      resize: vi.fn(),
      removed: false,
      remove: vi.fn(),
    });
    installFigmaMock([]);
    Object.assign(figma, {
      createFrame: vi.fn(() => frame),
      createImage: vi.fn(() => ({ hash: 'image-hash' })),
      createRectangle: vi.fn(() => imageRect),
    });

    await handleCreateGridFrame({
      config: { baseline: fallbackBaseline },
      width: 800,
      height: 600,
      includeImage: true,
      imageData: 'AQ==',
    });

    expect(imageRect.remove).toHaveBeenCalled();
    expect(frame.remove).toHaveBeenCalled();
    expect(figma.currentPage.selection).toEqual([]);
  });
});

describe('handleApplyGrid', () => {
  it('rolls back prior targets when a later target write fails', async () => {
    const firstExisting = { pattern: 'GRID', sectionSize: 6, visible: true, color } as LayoutGrid;
    const first = createLayoutGridNode('First', [firstExisting]);
    const second = createLayoutGridNode('Second', [
      { pattern: 'GRID', sectionSize: 4, visible: true, color } as LayoutGrid,
    ]);
    const ineligible = createIneligibleNode('Rectangle');
    const failing = createLayoutGridNode('Locked', [], ['fail-before-write']);
    const { notify, postMessage } = installFigmaMock([first, ineligible, failing, second]);

    await handleApplyGrid(
      applyGridMessage(['first', 'locked', 'second'], {
        sourceConfig: { baseline: sourceBaseline },
      })
    );

    expect(first.getLayoutGrids()).toEqual([firstExisting]);
    expect(second.getLayoutGrids()).toEqual([
      expect.objectContaining({ pattern: 'GRID', sectionSize: 4 }),
    ]);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'grid-applied',
        requestId: 'grid-apply-test',
        success: false,
        appliedCount: 0,
        skippedCount: 1,
        failedCount: 3,
      })
    );
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('Grid apply rolled back: 0 applied, 1 skipped, 3 failed')
    );
  });

  it('restores a linked grid style when rolling back', async () => {
    const variableAlias = {
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:section-size',
    } as VariableAlias;
    const styledGrid = {
      pattern: 'GRID',
      sectionSize: 6,
      visible: true,
      color,
      boundVariables: { sectionSize: variableAlias },
    } as LayoutGrid;
    const styled = createLayoutGridNode('Styled', [styledGrid], [], 'GridStyle:1');
    const applyFailure = createLayoutGridNode('Apply Failure', [], ['fail-before-write']);
    const { postMessage } = installFigmaMock([styled, applyFailure]);

    await handleApplyGrid(
      applyGridMessage(['styled', 'apply-failure'], {
        sourceConfig: { baseline: sourceBaseline },
      })
    );

    expect(styled.getLayoutGrids()).toEqual([styledGrid]);
    expect(styled.getGridStyleId()).toBe('GridStyle:1');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'grid-apply-test',
        success: false,
        appliedCount: 0,
        message: expect.stringContaining('Grid apply rolled back'),
      })
    );
  });

  it('does not claim complete rollback when the linked grid style cannot be restored', async () => {
    const styledGrid = {
      pattern: 'GRID',
      sectionSize: 6,
      visible: true,
      color,
    } as LayoutGrid;
    const styleRestoreFailure = createLayoutGridNode(
      'Style Restore Failure',
      [styledGrid],
      [],
      'GridStyle:1',
      ['fail-before-write']
    );
    const applyFailure = createLayoutGridNode('Apply Failure', [], ['fail-before-write']);
    const { postMessage } = installFigmaMock([styleRestoreFailure, applyFailure]);

    await handleApplyGrid(
      applyGridMessage(['style-restore-failure', 'apply-failure'], {
        sourceConfig: { baseline: sourceBaseline },
      })
    );

    expect(styleRestoreFailure.getLayoutGrids()).toEqual([styledGrid]);
    expect(styleRestoreFailure.getGridStyleId()).toBe('');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        appliedCount: 1,
        message: expect.stringContaining(
          'rollback restoration failed on 1 target; 1 mutation remains'
        ),
      })
    );
  });

  it('does not claim complete rollback when bound variables are lost', async () => {
    const variableAlias = {
      type: 'VARIABLE_ALIAS',
      id: 'VariableID:section-size',
    } as VariableAlias;
    const boundGrid = {
      pattern: 'GRID',
      sectionSize: 6,
      visible: true,
      color,
      boundVariables: { sectionSize: variableAlias },
    } as LayoutGrid;
    const lossyRollback = createLayoutGridNode(
      'Lossy Rollback',
      [boundGrid],
      ['succeed', 'succeed-without-bound-variables']
    );
    const applyFailure = createLayoutGridNode('Apply Failure', [], ['fail-before-write']);
    const { postMessage } = installFigmaMock([lossyRollback, applyFailure]);

    await handleApplyGrid(
      applyGridMessage(['lossy-rollback', 'apply-failure'], {
        sourceConfig: { baseline: sourceBaseline },
      })
    );

    expect(lossyRollback.getLayoutGrids()[0]?.boundVariables).toBeUndefined();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        appliedCount: 1,
        message: expect.stringContaining('1 mutation remains'),
      })
    );
  });

  it('reports a failed rollback restoration and the mutation left behind', async () => {
    const existingGrid = { pattern: 'GRID', sectionSize: 6, visible: true, color } as LayoutGrid;
    const rollbackFailure = createLayoutGridNode(
      'Rollback Failure',
      [existingGrid],
      ['succeed', 'fail-before-write']
    );
    const applyFailure = createLayoutGridNode('Apply Failure', [], ['fail-before-write']);
    const { notify, postMessage } = installFigmaMock([rollbackFailure, applyFailure]);

    await handleApplyGrid(
      applyGridMessage(['rollback-failure', 'apply-failure'], {
        sourceConfig: { baseline: sourceBaseline },
      })
    );

    expect(rollbackFailure.getLayoutGrids()).toEqual([
      expect.objectContaining({ pattern: 'GRID', sectionSize: 10 }),
    ]);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        appliedCount: 1,
        failedCount: 1,
        message: expect.stringContaining(
          'rollback restoration failed on 1 target; 1 mutation remains'
        ),
        error: expect.stringContaining(
          'rollback restoration failed on 1 target and 1 mutation remains'
        ),
      })
    );
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('Grid apply partially rolled back: 1 applied, 0 skipped, 1 failed')
    );
  });

  it('reports a failed rollback restoration even when no mutation remains', async () => {
    const existingGrid = { pattern: 'GRID', sectionSize: 6, visible: true, color } as LayoutGrid;
    const restoredBeforeFailure = createLayoutGridNode(
      'Restored Before Failure',
      [existingGrid],
      ['succeed', 'fail-after-write']
    );
    const applyFailure = createLayoutGridNode('Apply Failure', [], ['fail-before-write']);
    const { postMessage } = installFigmaMock([restoredBeforeFailure, applyFailure]);

    await handleApplyGrid(
      applyGridMessage(['restored-before-failure', 'apply-failure'], {
        sourceConfig: { baseline: sourceBaseline },
      })
    );

    expect(restoredBeforeFailure.getLayoutGrids()).toEqual([existingGrid]);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        appliedCount: 0,
        failedCount: 2,
        message: expect.stringContaining('rollback restoration failed on 1 target'),
        error: expect.stringContaining(
          'rollback restoration failed on 1 target and 0 mutations remain'
        ),
      })
    );
  });

  it('reports a mutation from an apply assignment that throws after writing and cannot roll back', async () => {
    const existingGrid = { pattern: 'GRID', sectionSize: 6, visible: true, color } as LayoutGrid;
    const failingAfterMutation = createLayoutGridNode(
      'Failing After Mutation',
      [existingGrid],
      ['fail-after-write', 'fail-before-write']
    );
    const { postMessage } = installFigmaMock([failingAfterMutation]);

    await handleApplyGrid(
      applyGridMessage(['failing-after-mutation'], {
        sourceConfig: { baseline: sourceBaseline },
      })
    );

    expect(failingAfterMutation.getLayoutGrids()).toEqual([
      expect.objectContaining({ pattern: 'GRID', sectionSize: 10 }),
    ]);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        appliedCount: 1,
        failedCount: 0,
        message: expect.stringContaining(
          'rollback restoration failed on 1 target; 1 mutation remains'
        ),
      })
    );
  });

  it('reports no selection back to the UI with the request ID', async () => {
    const { postMessage } = installFigmaMock([]);

    await handleApplyGrid(applyGridMessage(['frame']));

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'grid-applied',
        requestId: 'grid-apply-test',
        success: false,
        appliedCount: 0,
        error: 'No selection',
      })
    );
  });

  it.each([
    {
      name: 'empty sourceConfig',
      sourceConfig: {},
    },
    {
      name: 'sourceDimensions without sourceConfig',
      sourceDimensions: { width: 1440, height: 900 },
    },
  ])('preserves existing grids when rejecting an unsafe payload: $name', async payload => {
    const existingGrid = { pattern: 'GRID', sectionSize: 4, visible: true, color } as LayoutGrid;
    const frame = createLayoutGridNode('Frame', [existingGrid]);
    const { notify, postMessage } = installFigmaMock([frame]);

    await handleApplyGrid({
      type: 'apply-grid',
      requestId: 'grid-apply-test',
      sourceConfig: payload.sourceConfig,
      sourceDimensions: payload.sourceDimensions,
      expectedTargetIds: ['frame'],
      replaceExisting: true,
    } as ApplyGridMessage);

    expect(frame.getLayoutGrids()).toEqual([existingGrid]);
    expect(notify).toHaveBeenCalledWith('Grid apply rejected: invalid or empty grid payload');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'grid-applied',
        requestId: 'grid-apply-test',
        success: false,
        appliedCount: 0,
      })
    );
  });

  it('rejects a changed eligible selection before resolving or mutating grids', async () => {
    const existingGrid = { pattern: 'GRID', sectionSize: 4, visible: true, color } as LayoutGrid;
    const frame = createLayoutGridNode('Current Frame', [existingGrid]);
    const { postMessage } = installFigmaMock([frame]);

    await handleApplyGrid(applyGridMessage(['snapshot-frame']));

    expect(frame.getLayoutGrids()).toEqual([existingGrid]);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        appliedCount: 0,
        error: 'Selection changed after the grid target snapshot',
      })
    );
  });

  it('rechecks fit against current dimensions before mutating any target', async () => {
    const existingGrid = { pattern: 'GRID', sectionSize: 4, visible: true, color } as LayoutGrid;
    const stable = createLayoutGridNode('Stable', [existingGrid]);
    const resized = createLayoutGridNode('Resized', [existingGrid]);
    Object.assign(resized, { width: 100, height: 100 });
    const { postMessage } = installFigmaMock([stable, resized]);

    await handleApplyGrid(applyGridMessage(['stable', 'resized']));

    expect(stable.getLayoutGrids()).toEqual([existingGrid]);
    expect(resized.getLayoutGrids()).toEqual([existingGrid]);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        appliedCount: 0,
        message: 'Grid apply rejected: current target geometry does not fit',
      })
    );
  });

  it('resolves percentage grids independently for every selected node', async () => {
    const wide = createLayoutGridNode('Wide');
    const narrow = createLayoutGridNode('Narrow');
    Object.assign(wide, { width: 1000, height: 600 });
    Object.assign(narrow, { width: 500, height: 600 });
    installFigmaMock([wide, narrow]);

    await handleApplyGrid({
      type: 'apply-grid',
      requestId: 'grid-apply-percentage',
      sourceConfig: {
        columns: {
          count: 4,
          gutterSize: 2,
          gutterUnit: 'percent',
          margin: 10,
          marginUnit: 'percent',
          alignment: 'STRETCH',
          visible: true,
          color,
        },
      },
      expectedTargetIds: ['wide', 'narrow'],
      replaceExisting: true,
    });

    expect(wide.getLayoutGrids()[0]).toEqual(
      expect.objectContaining({ pattern: 'COLUMNS', gutterSize: 20, offset: 100 })
    );
    expect(narrow.getLayoutGrids()[0]).toEqual(
      expect.objectContaining({ pattern: 'COLUMNS', gutterSize: 10, offset: 50 })
    );
  });

  it('omits optional sectionSize when applying a stretch grid', async () => {
    const linkedinFrame = createLayoutGridNode('LinkedIn cover', [], ['reject-explicit-undefined']);
    Object.assign(linkedinFrame, { width: 1584, height: 396 });
    const { postMessage } = installFigmaMock([linkedinFrame]);

    await handleApplyGrid({
      type: 'apply-grid',
      requestId: 'grid-apply-linkedin',
      sourceConfig: {
        columns: {
          count: 6,
          gutterSize: 2.5,
          gutterUnit: 'percent',
          margin: 5,
          marginUnit: 'percent',
          alignment: 'STRETCH',
          visible: true,
          color,
        },
      },
      expectedTargetIds: ['linkedin-cover'],
      replaceExisting: true,
    });

    expect(linkedinFrame.getLayoutGrids()[0]).toEqual(
      expect.objectContaining({
        pattern: 'COLUMNS',
        alignment: 'STRETCH',
        count: 6,
        gutterSize: 40,
        offset: 79,
      })
    );
    expect(linkedinFrame.getLayoutGrids()[0]).not.toHaveProperty('sectionSize');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'grid-applied',
        requestId: 'grid-apply-linkedin',
        success: true,
        appliedCount: 1,
      })
    );
  });

  it('applies source-scaled pixel geometry independently for every selected node', async () => {
    const wide = createLayoutGridNode('Wide');
    const narrow = createLayoutGridNode('Narrow');
    Object.assign(wide, { width: 1440, height: 900 });
    Object.assign(narrow, { width: 320, height: 568 });
    installFigmaMock([wide, narrow]);

    await handleApplyGrid({
      type: 'apply-grid',
      requestId: 'grid-apply-scaled',
      sourceConfig: {
        columns: {
          count: 12,
          gutterSize: 24,
          gutterUnit: 'px',
          margin: 20,
          marginUnit: 'px',
          alignment: 'STRETCH',
          visible: true,
          color,
        },
      },
      sourceDimensions: { width: 1440, height: 900 },
      expectedTargetIds: ['wide', 'narrow'],
      replaceExisting: true,
    });

    expect(wide.getLayoutGrids()[0]).toEqual(
      expect.objectContaining({ pattern: 'COLUMNS', gutterSize: 24, offset: 20 })
    );
    expect(narrow.getLayoutGrids()[0]).toEqual(
      expect.objectContaining({ pattern: 'COLUMNS', gutterSize: 5, offset: 4 })
    );
  });
});
