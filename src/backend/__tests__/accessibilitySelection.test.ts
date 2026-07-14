import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAccessibilitySelection } from '../accessibilitySelection';

const mixed = Symbol('mixed');

function solid(hex: [number, number, number], extras: Partial<SolidPaint> = {}): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: hex[0], g: hex[1], b: hex[2] },
    ...extras,
  };
}

function node(params: {
  id: string;
  name: string;
  type: 'TEXT' | 'RECTANGLE' | 'FRAME';
  fills: readonly Paint[] | PluginAPI['mixed'];
  parent?: BaseNode | null;
}): SceneNode {
  return {
    ...params,
    parent: params.parent ?? ({ type: 'PAGE' } as PageNode),
    visible: true,
    opacity: 1,
    blendMode: 'NORMAL',
  } as unknown as SceneNode;
}

describe('accessibility selection reader', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        mixed,
        variables: { getVariableById: vi.fn() },
      },
    });
  });

  it('reads one selected text layer and one solid background shape', () => {
    const text = node({ id: 'text', name: 'Label', type: 'TEXT', fills: [solid([0.1, 0.2, 0.3])] });
    const background = node({
      id: 'background',
      name: 'Card',
      type: 'RECTANGLE',
      fills: [solid([1, 1, 1])],
    });

    expect(readAccessibilitySelection([background, text], 'srgb', 'selection-1')).toEqual({
      type: 'accessibility-selection-result',
      requestId: 'selection-1',
      success: true,
      profile: 'srgb',
      foreground: '#1A334D',
      background: '#FFFFFF',
      foregroundSource: 'Label',
      backgroundSource: 'Card',
    });
  });

  it('uses the containing fill as the background for one selected text layer', () => {
    const frame = node({ id: 'frame', name: 'Panel', type: 'FRAME', fills: [solid([0, 0, 0])] });
    const text = node({
      id: 'text',
      name: 'Body',
      type: 'TEXT',
      fills: [solid([1, 1, 1])],
      parent: frame,
    });

    const result = readAccessibilitySelection([text], 'display-p3', 'selection-2');
    expect(result).toMatchObject({
      success: true,
      profile: 'display-p3',
      foreground: '#FFFFFF',
      background: '#000000',
      backgroundSource: 'Panel',
    });
  });

  it.each([
    {
      label: 'mixed fills',
      fills: mixed as unknown as PluginAPI['mixed'],
      error: 'mixed fills',
    },
    {
      label: 'gradient fills',
      fills: [{ type: 'GRADIENT_LINEAR' } as GradientPaint],
      error: 'gradient, image, or video',
    },
    {
      label: 'transparent fills',
      fills: [solid([1, 1, 1], { opacity: 0.5 })],
      error: 'transparent or blended',
    },
  ])('rejects $label rather than guessing a rendered color', ({ fills, error }) => {
    const text = node({ id: 'text', name: 'Label', type: 'TEXT', fills });
    const background = node({
      id: 'background',
      name: 'Card',
      type: 'RECTANGLE',
      fills: [solid([1, 1, 1])],
    });

    expect(readAccessibilitySelection([text, background], 'srgb', 'selection-3')).toMatchObject({
      success: false,
      error: expect.stringContaining(error),
    });
  });

  it('resolves a bound color variable for the selected node', () => {
    const resolveForConsumer = vi.fn(() => ({
      resolvedType: 'COLOR',
      value: { r: 0.2, g: 0.4, b: 0.6, a: 1 },
    }));
    vi.mocked(figma.variables.getVariableById).mockReturnValue({
      resolveForConsumer,
    } as unknown as Variable);
    const text = node({
      id: 'text',
      name: 'Variable Label',
      type: 'TEXT',
      fills: [
        solid([0, 0, 0], { boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'v1' } } }),
      ],
    });
    const background = node({
      id: 'background',
      name: 'Card',
      type: 'RECTANGLE',
      fills: [solid([1, 1, 1])],
    });

    expect(readAccessibilitySelection([text, background], 'srgb', 'selection-4')).toMatchObject({
      success: true,
      foreground: '#336699',
    });
    expect(resolveForConsumer).toHaveBeenCalledWith(text);
  });

  it('rejects role-ambiguous shape-only selections', () => {
    const first = node({ id: 'a', name: 'A', type: 'RECTANGLE', fills: [solid([0, 0, 0])] });
    const second = node({ id: 'b', name: 'B', type: 'RECTANGLE', fills: [solid([1, 1, 1])] });

    expect(readAccessibilitySelection([first, second], 'srgb', 'selection-5')).toMatchObject({
      success: false,
      error: expect.stringContaining('exactly one text layer'),
    });
  });
});
