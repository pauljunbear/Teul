import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridConstructionV2 } from '../../types/grid';
import { resolveGridConstructionV2 } from '../../lib/gridConstructionV2';
import {
  canGenerateConstructionOnNode,
  createGeneratedConstructionOverlay,
  getGeneratedConstructionCount,
  getGeneratedConstructionOverlays,
} from '../gridConstructionGeometry';

const color = { r: 1, g: 0.2, b: 0.2, a: 0.1 };

function makeContainer(type: 'FRAME' | 'COMPONENT' | 'INSTANCE', width = 600, height = 900) {
  const children: SceneNode[] = [];
  const pluginData = new Map<string, string>();
  const node = {
    id: `${type.toLowerCase()}-1`,
    name: type,
    type,
    width,
    height,
    children,
    removed: false,
    appendChild: vi.fn((child: SceneNode) => {
      children.push(child);
      Object.defineProperty(child, 'parent', { configurable: true, value: node });
    }),
    getPluginData: vi.fn((key: string) => pluginData.get(key) ?? ''),
    setPluginData: vi.fn((key: string, value: string) => pluginData.set(key, value)),
    remove: vi.fn(),
  };
  return node as unknown as FrameNode;
}

function makeRectangle(): RectangleNode {
  const rectangle = {
    name: '',
    type: 'RECTANGLE',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    fills: [],
    strokes: [],
    resize: (width: number, height: number) => {
      rectangle.width = width;
      rectangle.height = height;
    },
  };
  return rectangle as unknown as RectangleNode;
}

function makeOverlay(): FrameNode {
  const overlay = makeContainer('FRAME');
  Object.assign(overlay, {
    x: 0,
    y: 0,
    fills: [],
    strokes: [],
    clipsContent: false,
    locked: false,
    layoutPositioning: 'AUTO',
    resize(width: number, height: number) {
      Object.assign(this, { width, height });
    },
    remove() {
      Object.assign(this, { removed: true });
    },
  });
  return overlay;
}

const construction: GridConstructionV2 = {
  version: 2,
  margins: { left: 40, right: 40, top: 60, bottom: 60, unit: 'px' },
  trackGroups: [
    {
      id: 'columns',
      axis: 'columns',
      tracks: [200, 300],
      gutters: [20],
      gapBefore: 0,
      unit: 'px',
      visible: true,
      color,
    },
  ],
  subdivisions: [
    {
      id: 'left-rows',
      parentTrackId: 'columns:0',
      axis: 'rows',
      tracks: [120, 120],
      gutters: [20],
      insetStart: 0,
      insetEnd: 0,
      unit: 'px',
      visible: true,
      color: { r: 0.2, g: 0.4, b: 1, a: 0.1 },
    },
  ],
  baseline: {
    interval: 12,
    topInset: 6,
    unit: 'px',
    visible: true,
    color: { r: 0.2, g: 0.8, b: 0.9, a: 0.15 },
  },
  realization: {
    kind: 'generated-geometry',
    disclosure: 'Unequal source geometry is rendered as a generated overlay.',
  },
};

describe('generated grid construction geometry', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        createFrame: vi.fn(makeOverlay),
        createRectangle: vi.fn(makeRectangle),
      },
    });
  });

  it('supports frames and components but rejects immutable instances', () => {
    expect(canGenerateConstructionOnNode(makeContainer('FRAME'))).toBe(true);
    expect(canGenerateConstructionOnNode(makeContainer('COMPONENT'))).toBe(true);
    expect(canGenerateConstructionOnNode(makeContainer('INSTANCE'))).toBe(false);
  });

  it('creates a locked tagged overlay with source track geometry', () => {
    const target = makeContainer('FRAME');
    const resolved = resolveGridConstructionV2(construction, { width: 600, height: 900 });

    const overlay = createGeneratedConstructionOverlay(target, construction, resolved);

    expect(overlay.locked).toBe(true);
    expect(overlay.layoutPositioning).toBe('ABSOLUTE');
    expect(getGeneratedConstructionCount(target)).toBe(1);
    expect(getGeneratedConstructionOverlays(target)).toEqual([overlay]);
    const rectangles = overlay.children as RectangleNode[];
    expect(rectangles[0]).toMatchObject({ x: 40, y: 60, width: 200, height: 780 });
    expect(rectangles[1]).toMatchObject({ x: 260, y: 60, width: 300, height: 780 });
    expect(rectangles[2]).toMatchObject({ x: 40, y: 60, width: 200, height: 120 });
    expect(rectangles[0].fills).toEqual([
      { type: 'SOLID', color: { r: 1, g: 0.2, b: 0.2 }, opacity: 0.1 },
    ]);
    expect(rectangles.some(rectangle => rectangle.name === 'Baseline 1')).toBe(true);
  });

  it('removes a partial overlay when child generation fails', () => {
    const target = makeContainer('FRAME');
    const overlay = makeOverlay();
    vi.mocked(figma.createFrame).mockReturnValue(overlay);
    vi.mocked(figma.createRectangle).mockImplementationOnce(() => {
      throw new Error('rectangle failed');
    });

    expect(() =>
      createGeneratedConstructionOverlay(
        target,
        construction,
        resolveGridConstructionV2(construction, { width: 600, height: 900 })
      )
    ).toThrow('rectangle failed');
    expect(overlay.removed).toBe(true);
  });
});
