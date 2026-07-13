import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleApplyFill,
  handleApplyGradient,
  handleApplyStroke,
  handleCreateStyle,
} from '../colorOperations';

const RED: SolidPaint = { type: 'SOLID', color: { r: 1, g: 0, b: 0 } };
const BLUE: SolidPaint = { type: 'SOLID', color: { r: 0, g: 0, b: 1 } };

function fillNode(id: string, initial: Paint[], failOnWrite = 0) {
  let fills = initial;
  let writes = 0;
  const node = { id, type: 'RECTANGLE' } as unknown as SceneNode & { fills: Paint[] };
  Object.defineProperty(node, 'fills', {
    configurable: true,
    get: () => fills,
    set: (next: Paint[]) => {
      writes += 1;
      if (writes === failOnWrite) throw new Error(`fill write failed for ${id}`);
      fills = next;
    },
  });
  return node;
}

function strokeNode(id: string, initial: Paint[], weight: number, failOnWrite = 0) {
  let strokes = initial;
  let writes = 0;
  const node = { id, type: 'RECTANGLE', strokeWeight: weight } as unknown as SceneNode & {
    strokes: Paint[];
    strokeWeight: number;
  };
  Object.defineProperty(node, 'strokes', {
    configurable: true,
    get: () => strokes,
    set: (next: Paint[]) => {
      writes += 1;
      if (writes === failOnWrite) throw new Error(`stroke write failed for ${id}`);
      strokes = next;
    },
  });
  return node;
}

describe('transactional color operations', () => {
  const notify = vi.fn();
  let selection: SceneNode[];

  beforeEach(() => {
    selection = [];
    notify.mockReset();
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        currentPage: {
          get selection() {
            return selection;
          },
        },
        notify,
        getLocalPaintStylesAsync: vi.fn().mockResolvedValue([]),
        createPaintStyle: vi.fn(),
      },
    });
  });

  it('restores every selected fill when one node rejects the mutation', async () => {
    const setFillStyleIdAsync = vi.fn().mockResolvedValue(undefined);
    const first = Object.assign(fillNode('first', [RED]), {
      fillStyleId: 'paint-style-1',
      setFillStyleIdAsync,
    });
    const second = fillNode('second', [BLUE], 1);
    selection = [first, second];

    await expect(handleApplyFill({ hex: '#00ff00', name: 'Green' })).resolves.toBe(false);
    expect(first.fills).toEqual([RED]);
    expect(second.fills).toEqual([BLUE]);
    expect(setFillStyleIdAsync).toHaveBeenCalledWith('paint-style-1');
    expect(notify).toHaveBeenCalledWith('Failed to apply fill; previous fills were restored');
  });

  it('restores strokes and stroke weights when a later node fails', async () => {
    const setStrokeStyleIdAsync = vi.fn().mockResolvedValue(undefined);
    const first = Object.assign(strokeNode('first', [RED], 0), {
      strokeStyleId: 'stroke-style-1',
      setStrokeStyleIdAsync,
    });
    const second = strokeNode('second', [BLUE], 4, 1);
    selection = [first, second];

    await expect(handleApplyStroke({ hex: '#00ff00', name: 'Green' })).resolves.toBe(false);
    expect(first.strokes).toEqual([RED]);
    expect(first.strokeWeight).toBe(0);
    expect(setStrokeStyleIdAsync).toHaveBeenCalledWith('stroke-style-1');
    expect(second.strokes).toEqual([BLUE]);
    expect(second.strokeWeight).toBe(4);
  });

  it('restores fills when a gradient application fails partway through', async () => {
    const first = fillNode('first', [RED]);
    const second = fillNode('second', [BLUE], 1);
    selection = [first, second];

    await expect(
      handleApplyGradient({
        colors: [
          { hex: '#ff0000', name: 'Red' },
          { hex: '#0000ff', name: 'Blue' },
        ],
        gradientType: 'LINEAR',
      })
    ).resolves.toBe(false);
    expect(first.fills).toEqual([RED]);
    expect(second.fills).toEqual([BLUE]);
  });

  it('removes a newly created style if initialization fails', async () => {
    const remove = vi.fn();
    const style = { remove } as unknown as PaintStyle;
    Object.defineProperty(style, 'name', { configurable: true, writable: true, value: '' });
    Object.defineProperty(style, 'paints', {
      configurable: true,
      set: () => {
        throw new Error('paint assignment failed');
      },
    });
    vi.mocked(figma.createPaintStyle).mockReturnValue(style);

    await expect(handleCreateStyle({ hex: '#ff0000', name: 'Red' })).resolves.toBe(false);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Failed to create style; incomplete style was removed');
  });

  it('applies a fill atomically when all selected nodes accept it', async () => {
    const first = fillNode('first', [RED]);
    const second = fillNode('second', [BLUE]);
    selection = [first, second];

    await expect(handleApplyFill({ hex: '#00ff00', name: 'Green' })).resolves.toBe(true);
    expect(first.fills).toEqual([{ type: 'SOLID', color: { r: 0, g: 1, b: 0 } }]);
    expect(second.fills).toEqual(first.fills);
  });

  it('rejects the whole fill transaction when a selected instance is locked', async () => {
    const component = Object.assign(fillNode('component', [RED]), {
      type: 'COMPONENT' as const,
      locked: false,
    });
    const instance = Object.assign(fillNode('instance', [BLUE]), {
      type: 'INSTANCE' as const,
      locked: true,
    });
    selection = [component, instance];

    await expect(handleApplyFill({ hex: '#00ff00', name: 'Green' })).resolves.toBe(false);
    expect(component.fills).toEqual([RED]);
    expect(instance.fills).toEqual([BLUE]);
    expect(notify).toHaveBeenCalledWith('Fill apply rejected: unlock the selected target first');
  });

  it('rejects the whole stroke transaction when a target has a locked ancestor', async () => {
    const unlocked = strokeNode('unlocked', [RED], 1);
    const nested = Object.assign(strokeNode('nested', [BLUE], 2), {
      parent: { id: 'locked-component', type: 'COMPONENT', locked: true, parent: null },
    });
    selection = [unlocked, nested];

    await expect(handleApplyStroke({ hex: '#00ff00', name: 'Green' })).resolves.toBe(false);
    expect(unlocked.strokes).toEqual([RED]);
    expect(nested.strokes).toEqual([BLUE]);
    expect(notify).toHaveBeenCalledWith('Stroke apply rejected: unlock the selected target first');
  });

  it('rejects a gradient on a locked component before writing its fill', async () => {
    const component = Object.assign(fillNode('component', [RED]), {
      type: 'COMPONENT' as const,
      locked: true,
    });
    selection = [component];

    await expect(
      handleApplyGradient({
        colors: [
          { hex: '#ff0000', name: 'Red' },
          { hex: '#0000ff', name: 'Blue' },
        ],
        gradientType: 'LINEAR',
      })
    ).resolves.toBe(false);
    expect(component.fills).toEqual([RED]);
    expect(notify).toHaveBeenCalledWith(
      'Gradient apply rejected: unlock the selected target first'
    );
  });

  it('does not mutate a node whose existing fills are mixed and cannot be restored safely', async () => {
    const mixed = Symbol('mixed');
    selection = [{ id: 'mixed-text', type: 'TEXT', fills: mixed } as unknown as SceneNode];

    await expect(handleApplyFill({ hex: '#00ff00', name: 'Green' })).resolves.toBe(false);
    expect(notify).toHaveBeenCalledWith('Select an editable shape or frame with a uniform fill');
  });

  it('does not mutate a node whose existing strokes are mixed and cannot be restored safely', async () => {
    const mixed = Symbol('mixed');
    selection = [{ id: 'mixed-text', type: 'TEXT', strokes: mixed } as unknown as SceneNode];

    await expect(handleApplyStroke({ hex: '#00ff00', name: 'Green' })).resolves.toBe(false);
    expect(notify).toHaveBeenCalledWith('Select an editable shape or frame with strokes');
  });
});
