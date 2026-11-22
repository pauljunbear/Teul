import { describe, expect, it, vi } from 'vitest';
import {
  getGridSelectionTargets,
  hexToFigmaRgb,
  isNodeOrAncestorLocked,
  isValidHex,
  sendSelectionInfo,
} from '../../backend/figmaHelpers';

describe('isValidHex', () => {
  it.each(['#123456', '123456', '#ABCDEF', 'abcdef'])('accepts valid hex format %j', hex => {
    expect(isValidHex(hex)).toBe(true);
  });

  it.each(['', '#fff', '1234567', '##123456', '12#3456', 'abc#def', '#gg0000', ' 123456'])(
    'rejects invalid hex format %j',
    hex => {
      expect(isValidHex(hex)).toBe(false);
    }
  );
});

describe('hexToFigmaRgb', () => {
  it('converts valid hex colors to Figma RGB values', () => {
    expect(hexToFigmaRgb('#ff8000')).toEqual({ r: 1, g: 128 / 255, b: 0 });
  });

  it.each(['invalid', '#fff', '##000000', ''])('throws for invalid hex format %j', hex => {
    expect(() => hexToFigmaRgb(hex)).toThrow(`Invalid hex color: ${hex}`);
  });
});

describe('isNodeOrAncestorLocked', () => {
  it('detects a direct node lock', () => {
    const node = { id: 'locked', locked: true, parent: null } as unknown as SceneNode;
    expect(isNodeOrAncestorLocked(node)).toBe(true);
  });

  it('detects a locked ancestor and allows an unlocked component or instance', () => {
    const lockedComponent = {
      id: 'component',
      type: 'COMPONENT',
      locked: true,
      parent: null,
    } as unknown as ComponentNode;
    const nested = {
      id: 'nested',
      type: 'RECTANGLE',
      locked: false,
      parent: lockedComponent,
    } as unknown as RectangleNode;
    const instance = {
      id: 'instance',
      type: 'INSTANCE',
      locked: false,
      parent: null,
    } as unknown as InstanceNode;

    expect(isNodeOrAncestorLocked(nested)).toBe(true);
    expect(isNodeOrAncestorLocked(instance)).toBe(false);
  });
});

describe('grid selection info', () => {
  function createNode(
    id: string,
    name: string,
    width: number,
    height: number,
    eligible: boolean
  ): SceneNode {
    return {
      id,
      name,
      type: eligible ? 'FRAME' : 'RECTANGLE',
      width,
      height,
      ...(eligible ? { layoutGrids: [] } : {}),
    } as unknown as SceneNode;
  }

  it('returns every selected target that can accept layout grids', () => {
    const first = createNode('1', 'Wide', 1440, 900, true);
    const skipped = createNode('2', 'Rectangle', 100, 100, false);
    const second = createNode('3', 'Narrow', 320, 568, true);

    expect(getGridSelectionTargets([first, skipped, second])).toEqual([
      {
        id: '1',
        name: 'Wide',
        width: 1440,
        height: 900,
        layoutGridCount: 0,
        teulConstructionCount: 0,
      },
      {
        id: '3',
        name: 'Narrow',
        width: 320,
        height: 568,
        layoutGridCount: 0,
        teulConstructionCount: 0,
      },
    ]);
  });

  it('posts all eligible targets and selection counts to the UI', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('figma', {
      currentPage: {
        selection: [
          createNode('1', 'Wide', 1440, 900, true),
          createNode('2', 'Rectangle', 100, 100, false),
          createNode('3', 'Narrow', 320, 568, true),
        ],
      },
      ui: { postMessage },
    });

    sendSelectionInfo();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'selection-info',
        selectedCount: 3,
        ineligibleCount: 1,
        eligibleTargets: [
          {
            id: '1',
            name: 'Wide',
            width: 1440,
            height: 900,
            layoutGridCount: 0,
            teulConstructionCount: 0,
          },
          {
            id: '3',
            name: 'Narrow',
            width: 320,
            height: 568,
            layoutGridCount: 0,
            teulConstructionCount: 0,
          },
        ],
      })
    );

    vi.unstubAllGlobals();
  });

  it('echoes a selection request ID for correlated pre-apply refreshes', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('figma', {
      currentPage: {
        selection: [createNode('1', 'Frame', 1440, 900, true)],
      },
      ui: { postMessage },
    });

    sendSelectionInfo('grid-apply-1');

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'selection-info',
        requestId: 'grid-apply-1',
      })
    );

    vi.unstubAllGlobals();
  });
});
