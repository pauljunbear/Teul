import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplyGridMessage, ClearGridMessage } from '../../types/messages';
import type { GridConstructionV2 } from '../../types/grid';
import {
  handleApplyGrid,
  handleClearGrid,
  handleCaptureSelectedGrid,
  handleCreateGridFrame,
} from '../gridOperations';

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
  readonly children: readonly SceneNode[];
  getLayoutGrids: () => ReadonlyArray<LayoutGrid>;
  getGridStyleId: () => string;
} {
  let layoutGrids: ReadonlyArray<LayoutGrid> = initialGrids;
  let gridStyleId = initialGridStyleId;
  let writeIndex = 0;
  let styleWriteIndex = 0;
  const children: SceneNode[] = [];
  const pluginData = new Map<string, string>();
  const node = {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    type: 'FRAME',
    width: 800,
    height: 600,
    children,
    appendChild: vi.fn((child: SceneNode) => {
      children.push(child);
    }),
    getPluginData: vi.fn((key: string) => pluginData.get(key) ?? ''),
    setPluginData: vi.fn((key: string, value: string) => pluginData.set(key, value)),
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
    readonly children: readonly SceneNode[];
    getLayoutGrids: () => ReadonlyArray<LayoutGrid>;
    getGridStyleId: () => string;
  };
}

function createGeometryFrame(): FrameNode {
  const frame = createLayoutGridNode('Generated Overlay') as unknown as FrameNode;
  Object.assign(frame, {
    x: 0,
    y: 0,
    fills: [],
    strokes: [],
    clipsContent: false,
    locked: false,
    layoutPositioning: 'AUTO',
    resize: vi.fn((width: number, height: number) => Object.assign(frame, { width, height })),
  });
  return frame;
}

function createGeometryRectangle(): RectangleNode {
  const rectangle = {
    name: '',
    type: 'RECTANGLE',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    fills: [],
    strokes: [],
    resize: vi.fn((width: number, height: number) => Object.assign(rectangle, { width, height })),
  };
  return rectangle as unknown as RectangleNode;
}

const generatedConstruction: GridConstructionV2 = {
  version: 2,
  margins: { left: 40, right: 40, top: 40, bottom: 40, unit: 'px' },
  trackGroups: [
    {
      id: 'columns',
      axis: 'columns',
      tracks: [200, 200],
      gutters: [20],
      gapBefore: 0,
      unit: 'px',
      visible: true,
      color,
    },
  ],
  subdivisions: [],
  realization: {
    kind: 'generated-geometry',
    disclosure: 'Unequal construction rendered as a generated overlay.',
  },
};

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
    applicationMode: 'fixed',
    expectedTargetIds,
    replaceExisting: true,
    linkedResourcePolicy: 'replace-with-values',
    ...overrides,
  };
}

function clearGridMessage(expectedTargetIds: string[]): ClearGridMessage {
  return {
    type: 'clear-grid',
    requestId: 'grid-clear-test',
    expectedTargetIds,
  };
}

function installFigmaMock(selection: SceneNode[]) {
  const notify = vi.fn();
  const postMessage = vi.fn();
  const scrollAndZoomIntoView = vi.fn();
  const commitUndo = vi.fn();

  vi.stubGlobal('figma', {
    fileKey: 'current-file',
    currentPage: { selection },
    notify,
    commitUndo,
    ui: { postMessage },
    getStyleByIdAsync: vi.fn(async () => ({ type: 'GRID' })),
    variables: { getVariableByIdAsync: vi.fn(async () => ({ id: 'variable' })) },
    createFrame: vi.fn(createGeometryFrame),
    createRectangle: vi.fn(createGeometryRectangle),
    viewport: {
      center: { x: 500, y: 500 },
      scrollAndZoomIntoView,
    },
  });

  return { notify, postMessage, scrollAndZoomIntoView, commitUndo };
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

  it('creates generated v2 geometry instead of a flattened native grid', async () => {
    const mainFrame = createGeometryFrame();
    const overlay = createGeometryFrame();
    const { scrollAndZoomIntoView } = installFigmaMock([]);
    vi.mocked(figma.createFrame).mockReturnValueOnce(mainFrame).mockReturnValueOnce(overlay);

    const success = await handleCreateGridFrame({
      config: {},
      construction: generatedConstruction,
      frameName: 'Generated Editorial Grid',
      width: 600,
      height: 900,
    });

    expect(success).toBe(true);
    expect(mainFrame.layoutGrids).toEqual([]);
    expect(mainFrame.children).toEqual([overlay]);
    expect(overlay.locked).toBe(true);
    expect(scrollAndZoomIntoView).toHaveBeenCalledWith([mainFrame]);
  });

  it('removes a partial frame when layout-grid assignment fails', async () => {
    const frame = createLayoutGridNode('New Frame', [], ['fail-before-write']);
    Object.assign(frame, {
      resize: vi.fn(),
      x: 0,
      y: 0,
    });
    installFigmaMock([]);
    Object.assign(figma, {
      createFrame: vi.fn(() => frame),
    });

    await handleCreateGridFrame({
      config: { baseline: fallbackBaseline },
      width: 800,
      height: 600,
    });

    expect(frame.removed).toBe(true);
    expect(figma.currentPage.selection).toEqual([]);
  });
});

describe('handleCaptureSelectedGrid', () => {
  it('captures one native stretch grid with its frame dimensions', () => {
    const grid = {
      pattern: 'COLUMNS',
      alignment: 'STRETCH',
      count: 12,
      gutterSize: 24,
      offset: 64,
      visible: true,
      color,
    } as LayoutGrid;
    const frame = createLayoutGridNode('Captured Frame', [grid]);
    const { postMessage } = installFigmaMock([frame]);

    handleCaptureSelectedGrid('capture-1');

    expect(postMessage).toHaveBeenCalledWith({
      type: 'grid-capture-result',
      requestId: 'capture-1',
      success: true,
      config: {
        columns: {
          count: 12,
          gutterSize: 24,
          gutterUnit: 'px',
          margin: 64,
          marginUnit: 'px',
          alignment: 'STRETCH',
          visible: true,
          color,
        },
      },
      frameName: 'Captured Frame',
      dimensions: { width: 800, height: 600 },
      nativeResources: { boundVariableIds: [], sourceFileKey: 'current-file' },
    });
  });

  it('rejects fixed-size native grids that cannot round-trip through the saved model', () => {
    const grid = {
      pattern: 'COLUMNS',
      alignment: 'CENTER',
      count: 6,
      gutterSize: 20,
      offset: 0,
      sectionSize: 80,
      visible: true,
      color,
    } as LayoutGrid;
    const frame = createLayoutGridNode('Fixed Grid', [grid]);
    const { postMessage } = installFigmaMock([frame]);

    handleCaptureSelectedGrid('capture-2');

    expect(postMessage).toHaveBeenCalledWith({
      type: 'grid-capture-result',
      requestId: 'capture-2',
      success: false,
      error: 'Capture currently supports stretch column and row grids only',
    });
  });

  it('captures linked grid styles and bound variables without flattening them', () => {
    const grid = {
      pattern: 'COLUMNS',
      alignment: 'STRETCH',
      count: 4,
      gutterSize: 20,
      offset: 32,
      visible: true,
      color,
      boundVariables: {
        gutterSize: { type: 'VARIABLE_ALIAS', id: 'VariableID:gutter' },
      },
    } as LayoutGrid;
    const frame = createLayoutGridNode('Styled Frame', [grid], [], 'GridStyle:editorial');
    const { postMessage } = installFigmaMock([frame]);

    handleCaptureSelectedGrid('capture-linked');

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        config: {
          columns: expect.objectContaining({
            boundVariables: {
              gutterSize: { type: 'VARIABLE_ALIAS', id: 'VariableID:gutter' },
            },
          }),
        },
        nativeResources: {
          gridStyleId: 'GridStyle:editorial',
          boundVariableIds: ['VariableID:gutter'],
          sourceFileKey: 'current-file',
        },
      })
    );
  });
});

describe('handleApplyGrid', () => {
  it('applies generated v2 geometry as a tagged child overlay', async () => {
    const target = createLayoutGridNode('Target');
    const { postMessage, commitUndo } = installFigmaMock([target]);

    await handleApplyGrid(
      applyGridMessage(['target'], {
        sourceConfig: {},
        construction: generatedConstruction,
        linkedResourcePolicy: 'replace-with-values',
      })
    );

    expect(target.children).toHaveLength(1);
    expect(target.children[0].name).toBe('Teul Grid Construction');
    expect(target.children[0].locked).toBe(true);
    expect(commitUndo).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        appliedCount: 1,
        realization: generatedConstruction.realization,
      })
    );
  });

  it('replaces native grids when generated realization is explicitly set to replace', async () => {
    const target = createLayoutGridNode('Target', [fallbackBaseline], [], 'GridStyle:old');
    const { postMessage } = installFigmaMock([target]);

    await handleApplyGrid(
      applyGridMessage(['target'], {
        sourceConfig: {},
        construction: generatedConstruction,
        replaceExisting: true,
      })
    );

    expect(target.getLayoutGrids()).toEqual([]);
    expect(target.getGridStyleId()).toBe('');
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects generated realization on an instance before mutation', async () => {
    const instance = createLayoutGridNode('Instance');
    Object.assign(instance, { type: 'INSTANCE' });
    const { postMessage, commitUndo } = installFigmaMock([instance]);

    await handleApplyGrid(
      applyGridMessage(['instance'], {
        sourceConfig: {},
        construction: generatedConstruction,
      })
    );

    expect(instance.children).toHaveLength(0);
    expect(commitUndo).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Use a frame or component'),
      })
    );
  });

  it('preserves available captured style and variable links', async () => {
    const target = createLayoutGridNode('Target');
    const { postMessage } = installFigmaMock([target]);
    const boundVariables = {
      gutterSize: { type: 'VARIABLE_ALIAS' as const, id: 'VariableID:gutter' },
    };

    await handleApplyGrid(
      applyGridMessage(['target'], {
        sourceConfig: { columns: { ...sourceColumns, boundVariables } },
        nativeResources: {
          gridStyleId: 'GridStyle:editorial',
          boundVariableIds: ['VariableID:gutter'],
          sourceFileKey: 'current-file',
        },
        linkedResourcePolicy: 'preserve-if-available',
      })
    );

    expect(target.getGridStyleId()).toBe('GridStyle:editorial');
    expect(target.getLayoutGrids()[0]).toMatchObject({ boundVariables });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining('[links preserved]'),
      })
    );
  });

  it('uses captured numeric values when replacement is explicitly chosen', async () => {
    const target = createLayoutGridNode('Target');
    const { postMessage } = installFigmaMock([target]);

    await handleApplyGrid(
      applyGridMessage(['target'], {
        sourceConfig: {
          columns: {
            ...sourceColumns,
            boundVariables: {
              gutterSize: { type: 'VARIABLE_ALIAS', id: 'missing-variable' },
            },
          },
        },
        nativeResources: {
          gridStyleId: 'missing-style',
          boundVariableIds: ['missing-variable'],
          sourceFileKey: 'another-file',
        },
        linkedResourcePolicy: 'replace-with-values',
      })
    );

    expect(target.getGridStyleId()).toBe('');
    expect(target.getLayoutGrids()[0]).not.toHaveProperty('boundVariables');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining('[numeric values]'),
      })
    );
  });

  it('stops before mutation when preserved links belong to another file', async () => {
    const target = createLayoutGridNode('Target');
    const original = [...target.getLayoutGrids()];
    const { postMessage } = installFigmaMock([target]);

    await handleApplyGrid(
      applyGridMessage(['target'], {
        nativeResources: {
          boundVariableIds: ['VariableID:gutter'],
          sourceFileKey: 'another-file',
        },
        linkedResourcePolicy: 'preserve-if-available',
      })
    );

    expect(target.getLayoutGrids()).toEqual(original);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('another Figma file'),
      })
    );
  });
  it('rejects all targets before mutation when a selected frame is locked', async () => {
    const existingGrid = { pattern: 'GRID', sectionSize: 6, visible: true, color } as LayoutGrid;
    const unlocked = createLayoutGridNode('Unlocked', [existingGrid]);
    const locked = Object.assign(createLayoutGridNode('Locked', [existingGrid]), { locked: true });
    const { notify, postMessage } = installFigmaMock([unlocked, locked]);

    await handleApplyGrid(
      applyGridMessage(['unlocked', 'locked'], {
        sourceConfig: { baseline: sourceBaseline },
      })
    );

    expect(unlocked.getLayoutGrids()).toEqual([existingGrid]);
    expect(locked.getLayoutGrids()).toEqual([existingGrid]);
    expect(notify).toHaveBeenCalledWith('Grid apply rejected: unlock the selected target first');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'grid-applied',
      requestId: 'grid-apply-test',
      success: false,
      appliedCount: 0,
      skippedCount: 0,
      failedCount: 2,
      message: 'Grid apply rejected: unlock the selected target first',
      error: 'Locked grid targets cannot be edited',
    });
  });

  it('rejects a grid target inside a locked component before mutation', async () => {
    const existingGrid = { pattern: 'GRID', sectionSize: 6, visible: true, color } as LayoutGrid;
    const nestedFrame = Object.assign(createLayoutGridNode('Nested Frame', [existingGrid]), {
      parent: { id: 'component', type: 'COMPONENT', locked: true, parent: null },
    });
    const { postMessage } = installFigmaMock([nestedFrame]);

    await handleApplyGrid(
      applyGridMessage(['nested-frame'], {
        sourceConfig: { baseline: sourceBaseline },
      })
    );

    expect(nestedFrame.getLayoutGrids()).toEqual([existingGrid]);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        appliedCount: 0,
        failedCount: 1,
        error: 'Locked grid targets cannot be edited',
      })
    );
  });

  it('continues to support unlocked components and instances that expose layout grids', async () => {
    const component = Object.assign(createLayoutGridNode('Component'), {
      type: 'COMPONENT' as const,
      locked: false,
    });
    const instance = Object.assign(createLayoutGridNode('Instance'), {
      type: 'INSTANCE' as const,
      locked: false,
    });
    const { postMessage } = installFigmaMock([component, instance]);

    await handleApplyGrid(
      applyGridMessage(['component', 'instance'], {
        sourceConfig: { baseline: sourceBaseline },
      })
    );

    expect(component.getLayoutGrids()).toEqual([
      expect.objectContaining({ pattern: 'GRID', sectionSize: 10 }),
    ]);
    expect(instance.getLayoutGrids()).toEqual([
      expect.objectContaining({ pattern: 'GRID', sectionSize: 10 }),
    ]);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, appliedCount: 2, failedCount: 0 })
    );
  });

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

  it('does not detach an existing grid style before a failing write', async () => {
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
    expect(styleRestoreFailure.getGridStyleId()).toBe('GridStyle:1');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        appliedCount: 0,
        message: expect.stringContaining('Grid apply rolled back'),
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
      applicationMode: 'fixed',
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
      applicationMode: 'fixed',
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
      applicationMode: 'fixed',
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
      applicationMode: 'scale-from-reference',
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

  it('applies responsive centered-content geometry without constraining frame height', async () => {
    const frame = createLayoutGridNode('Responsive');
    Object.assign(frame, { width: 1600, height: 2000 });
    installFigmaMock([frame]);

    await handleApplyGrid({
      type: 'apply-grid',
      requestId: 'grid-apply-responsive',
      sourceConfig: {
        columns: {
          count: 12,
          gutterSize: 24,
          gutterUnit: 'px',
          margin: 72,
          marginUnit: 'px',
          alignment: 'STRETCH',
          visible: true,
          color,
        },
      },
      applicationMode: 'responsive-width',
      responsiveWidth: { min: 1400, maxContentWidth: 1320, contentInset: 12 },
      expectedTargetIds: ['responsive'],
      replaceExisting: true,
    });

    expect(frame.getLayoutGrids()[0]).toEqual(
      expect.objectContaining({ pattern: 'COLUMNS', gutterSize: 24, offset: 152 })
    );
  });

  it('blocks a source-faithful grid on a noncanonical frame before mutation', async () => {
    const existingGrid = { pattern: 'GRID', sectionSize: 4, visible: true, color } as LayoutGrid;
    const frame = createLayoutGridNode('Wrong Size', [existingGrid]);
    Object.assign(frame, { width: 1160, height: 1160 });
    const { postMessage } = installFigmaMock([frame]);

    await handleApplyGrid(
      applyGridMessage(['wrong-size'], {
        sourceDimensions: { width: 580, height: 580 },
        applicationMode: 'canonical-only',
      })
    );

    expect(frame.getLayoutGrids()).toEqual([existingGrid]);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        appliedCount: 0,
        error: expect.stringContaining('580\u00d7580px'),
      })
    );
  });
});

describe('handleClearGrid', () => {
  it('clears native guides and grid styles as one undoable operation', async () => {
    const first = createLayoutGridNode('First', [fallbackBaseline], [], 'GridStyle:first');
    const second = createLayoutGridNode('Second', [fallbackBaseline]);
    const skipped = createIneligibleNode('Skipped');
    const { postMessage, commitUndo } = installFigmaMock([first, second, skipped]);

    await handleClearGrid(clearGridMessage(['first', 'second']));

    expect(first.getLayoutGrids()).toEqual([]);
    expect(first.getGridStyleId()).toBe('');
    expect(second.getLayoutGrids()).toEqual([]);
    expect(commitUndo).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'grid-applied',
      requestId: 'grid-clear-test',
      success: true,
      appliedCount: 2,
      skippedCount: 1,
      failedCount: 0,
      message: 'Cleared grids from 2 targets',
      frameName: 'First',
      frameWidth: 800,
      frameHeight: 600,
    });
  });

  it('rejects a changed selection before clearing anything', async () => {
    const target = createLayoutGridNode('Target', [fallbackBaseline]);
    const { postMessage, commitUndo } = installFigmaMock([target]);

    await handleClearGrid(clearGridMessage(['another-target']));

    expect(target.getLayoutGrids()).toEqual([fallbackBaseline]);
    expect(commitUndo).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Selection changed'),
      })
    );
  });

  it('preflights locked targets before clearing any selected grid', async () => {
    const first = createLayoutGridNode('First', [fallbackBaseline]);
    const locked = Object.assign(createLayoutGridNode('Locked', [fallbackBaseline]), {
      locked: true,
    });
    const { postMessage, commitUndo } = installFigmaMock([first, locked]);

    await handleClearGrid(clearGridMessage(['first', 'locked']));

    expect(first.getLayoutGrids()).toEqual([fallbackBaseline]);
    expect(locked.getLayoutGrids()).toEqual([fallbackBaseline]);
    expect(commitUndo).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Locked grid targets cannot be edited' })
    );
  });

  it('restores earlier targets when a later clear write fails', async () => {
    const first = createLayoutGridNode('First', [fallbackBaseline], ['succeed', 'succeed']);
    const second = createLayoutGridNode(
      'Second',
      [fallbackBaseline],
      ['fail-after-write', 'succeed']
    );
    const { postMessage, commitUndo } = installFigmaMock([first, second]);

    await handleClearGrid(clearGridMessage(['first', 'second']));

    expect(first.getLayoutGrids()).toEqual([fallbackBaseline]);
    expect(second.getLayoutGrids()).toEqual([fallbackBaseline]);
    expect(commitUndo).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        appliedCount: 0,
        message: 'Grid clear rolled back',
      })
    );
  });
});
