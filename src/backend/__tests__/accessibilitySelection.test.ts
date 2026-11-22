import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAccessibilitySelection, sendAccessibilitySelection } from '../accessibilitySelection';

const mixed = Symbol('mixed');

const textBounds = { x: 20, y: 20, width: 80, height: 24 };
const backgroundBounds = { x: 0, y: 0, width: 160, height: 100 };

function solid(hex: [number, number, number], extras: Partial<SolidPaint> = {}): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: hex[0], g: hex[1], b: hex[2] },
    ...extras,
  };
}

type TestNodeType = 'TEXT' | 'RECTANGLE' | 'FRAME' | 'GROUP' | 'ELLIPSE';

function node(params: {
  id: string;
  name: string;
  type: TestNodeType;
  fills?: readonly Paint[] | PluginAPI['mixed'];
  bounds?: Rect;
  renderBounds?: Rect | null;
  parent?: BaseNode | null;
  opacity?: number;
  blendMode?: BlendMode;
  effects?: readonly Effect[] | PluginAPI['mixed'];
  isMask?: boolean;
  strokes?: readonly Paint[] | PluginAPI['mixed'];
  rotation?: number;
  cornerRadius?: number | PluginAPI['mixed'];
  relativeTransform?: Transform;
}): SceneNode {
  return {
    ...params,
    fills: params.fills ?? [],
    absoluteBoundingBox: params.bounds ?? backgroundBounds,
    absoluteRenderBounds: params.renderBounds,
    parent: params.parent ?? null,
    visible: true,
    opacity: params.opacity ?? 1,
    blendMode: params.blendMode ?? 'NORMAL',
    effects: params.effects ?? [],
    isMask: params.isMask ?? false,
    strokes: params.strokes ?? [],
    rotation: params.rotation ?? 0,
    cornerRadius: params.cornerRadius ?? 0,
    relativeTransform: params.relativeTransform,
  } as unknown as SceneNode;
}

function parentNode(
  children: SceneNode[],
  params: {
    id?: string;
    name?: string;
    fills?: readonly Paint[] | PluginAPI['mixed'];
    bounds?: Rect;
    opacity?: number;
    blendMode?: BlendMode;
    effects?: readonly Effect[] | PluginAPI['mixed'];
  } = {}
): SceneNode {
  const parent = node({
    id: params.id ?? 'parent',
    name: params.name ?? 'Parent',
    type: 'FRAME',
    fills: params.fills ?? [],
    bounds: params.bounds ?? backgroundBounds,
    opacity: params.opacity,
    blendMode: params.blendMode,
    effects: params.effects,
  }) as SceneNode & ChildrenMixin;
  Object.assign(parent, { children });
  for (const child of children) Object.assign(child, { parent });
  return parent;
}

function siblingPair(): { text: SceneNode; background: SceneNode; parent: SceneNode } {
  const background = node({
    id: 'background',
    name: 'Card',
    type: 'RECTANGLE',
    fills: [solid([1, 1, 1])],
    bounds: backgroundBounds,
  });
  const text = node({
    id: 'text',
    name: 'Label',
    type: 'TEXT',
    fills: [solid([0.1, 0.2, 0.3])],
    bounds: textBounds,
  });
  return { text, background, parent: parentNode([background, text]) };
}

describe('accessibility selection reader', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        mixed,
        root: { documentColorProfile: 'SRGB' },
        variables: { getVariableByIdAsync: vi.fn(async () => null) },
        currentPage: { selection: [] },
        ui: { postMessage: vi.fn() },
      },
    });
  });

  it('reads one selected text layer and one proven solid background shape in sRGB', async () => {
    const { text, background } = siblingPair();

    expect(await readAccessibilitySelection([background, text], 'srgb', 'selection-1')).toEqual({
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

  it('uses the nearest containing opaque fill as the background for one selected text layer', async () => {
    const text = node({
      id: 'text',
      name: 'Body',
      type: 'TEXT',
      fills: [solid([1, 1, 1])],
      bounds: textBounds,
    });
    const frame = parentNode([text], {
      id: 'frame',
      name: 'Panel',
      fills: [solid([0, 0, 0])],
    });

    const result = await readAccessibilitySelection([text], 'srgb', 'selection-2');
    expect(result).toMatchObject({
      success: true,
      profile: 'srgb',
      foreground: '#FFFFFF',
      background: '#000000',
      backgroundSource: 'Panel',
    });
    expect(frame).toBeDefined();
  });

  it('rejects text outside an ancestor fill even when overflow expands its render bounds', async () => {
    const text = node({
      id: 'text',
      name: 'Overflowing text',
      type: 'TEXT',
      fills: [solid([0, 0, 0])],
      bounds: { x: 120, y: 20, width: 30, height: 24 },
    });
    const frame = parentNode([text], {
      id: 'frame',
      name: 'Clipping boundary',
      fills: [solid([1, 1, 1])],
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    });
    Object.assign(frame, {
      clipsContent: false,
      absoluteRenderBounds: { x: 0, y: 0, width: 150, height: 100 },
    });

    expect(await readAccessibilitySelection([text], 'srgb', 'ancestor-overflow')).toMatchObject({
      success: false,
      error: expect.stringContaining('fully cover'),
    });
  });

  it.each([
    ['display-p3', 'Display P3'],
    ['legacy', 'legacy'],
    ['unknown', 'could not determine'],
  ] as const)('fails closed for a %s document profile', async (profile, error) => {
    const { text, background } = siblingPair();

    expect(await readAccessibilitySelection([background, text], profile, `profile-${profile}`)).toEqual({
      type: 'accessibility-selection-result',
      requestId: `profile-${profile}`,
      success: false,
      profile,
      error: expect.stringContaining(error),
    });
  });

  it('blocks the #006DFD-on-white Display P3 threshold-reversal fixture', async () => {
    const { text, background } = siblingPair();
    Object.assign(text, { fills: [solid([0, 109 / 255, 253 / 255])] });

    expect(
      await readAccessibilitySelection([background, text], 'display-p3', 'p3-threshold-reversal')
    ).toEqual({
      type: 'accessibility-selection-result',
      requestId: 'p3-threshold-reversal',
      success: false,
      profile: 'display-p3',
      error: expect.stringContaining('Display P3 channels are not treated as sRGB'),
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
  ])('rejects $label rather than guessing a rendered color', async ({ fills, error }) => {
    const { text, background } = siblingPair();
    Object.assign(text, { fills });

    expect(await readAccessibilitySelection([text, background], 'srgb', 'selection-3')).toMatchObject({
      success: false,
      error: expect.stringContaining(error),
    });
  });

  it.each([
    {
      label: 'ancestor opacity',
      parent: { opacity: 0.5 },
      error: 'hidden or transparent',
    },
    {
      label: 'ancestor blend mode',
      parent: { blendMode: 'MULTIPLY' as BlendMode },
      error: 'unsupported blend mode',
    },
    {
      label: 'ancestor effect',
      parent: {
        effects: [{ type: 'LAYER_BLUR', radius: 4, visible: true } as BlurEffect],
      },
      error: 'uses an effect',
    },
    {
      label: 'ancestor stroke',
      parent: { strokes: [solid([1, 0, 0])] },
      error: 'visible stroke',
    },
  ])('rejects $label', async ({ parent: parentOverrides, error }) => {
    const { text, background, parent } = siblingPair();
    Object.assign(parent, parentOverrides);

    expect(
      await readAccessibilitySelection([text, background], 'srgb', 'ancestor-context')
    ).toMatchObject({
      success: false,
      error: expect.stringContaining(error),
    });
  });

  it('rejects mask contexts', async () => {
    const { text, background, parent } = siblingPair();
    const mask = node({
      id: 'mask',
      name: 'Mask',
      type: 'RECTANGLE',
      fills: [solid([0, 0, 0])],
      bounds: backgroundBounds,
      isMask: true,
    });
    Object.assign(mask, { parent });
    (parent as SceneNode & { children: SceneNode[] }).children.unshift(mask);

    expect(await readAccessibilitySelection([text, background], 'srgb', 'mask-context')).toMatchObject({
      success: false,
      error: expect.stringContaining('mask context'),
    });
  });

  it('rejects a background that does not fully cover the text', async () => {
    const { text, background } = siblingPair();
    Object.assign(background, {
      absoluteBoundingBox: { x: 0, y: 0, width: 30, height: 30 },
    });

    expect(await readAccessibilitySelection([text, background], 'srgb', 'non-overlap')).toMatchObject({
      success: false,
      error: expect.stringContaining('fully cover'),
    });
  });

  it.each([
    {
      label: 'ellipse background',
      backgroundOverrides: { type: 'ELLIPSE' },
      error: 'rectangular background',
    },
    {
      label: 'rounded background',
      backgroundOverrides: { cornerRadius: 16 },
      error: 'square-cornered background',
    },
    {
      label: 'rotated background',
      backgroundOverrides: { rotation: 15 },
      error: 'axis-aligned',
    },
    {
      label: 'skewed background',
      backgroundOverrides: {
        relativeTransform: [
          [1, 0.009, 0],
          [0, 0.9999595, 0],
        ],
      },
      error: 'skewed geometry',
    },
  ])('rejects a $label whose bounding box cannot prove painted coverage', async ({
    backgroundOverrides,
    error,
  }) => {
    const { text, background } = siblingPair();
    Object.assign(background, backgroundOverrides);

    expect(
      await readAccessibilitySelection([text, background], 'srgb', 'unprovable-geometry')
    ).toMatchObject({
      success: false,
      error: expect.stringContaining(error),
    });
  });

  it('rejects rotation inherited from an ancestor', async () => {
    const { text, background, parent } = siblingPair();
    Object.assign(parent, { rotation: 10 });

    expect(
      await readAccessibilitySelection([text, background], 'srgb', 'rotated-ancestor')
    ).toMatchObject({
      success: false,
      error: expect.stringContaining('axis-aligned'),
    });
  });

  it('rejects a selected background that is above the text', async () => {
    const { text, background, parent } = siblingPair();
    Object.assign(parent, { children: [text, background] });

    expect(await readAccessibilitySelection([text, background], 'srgb', 'wrong-order')).toMatchObject({
      success: false,
      error: expect.stringContaining('behind the text layer'),
    });
  });

  it('rejects an overlapping intervening layer because the selected pair is not provable', async () => {
    const { text, background } = siblingPair();
    const overlay = node({
      id: 'overlay',
      name: 'Tint',
      type: 'RECTANGLE',
      fills: [solid([1, 0, 0])],
      bounds: textBounds,
    });
    parentNode([background, overlay, text]);

    expect(await readAccessibilitySelection([text, background], 'srgb', 'occluded')).toMatchObject({
      success: false,
      error: expect.stringContaining('Tint'),
    });
  });

  it('rejects an overflowing nested descendant that can paint across the text', async () => {
    const text = node({
      id: 'text',
      name: 'Label',
      type: 'TEXT',
      fills: [solid([0, 0, 0])],
      bounds: textBounds,
    });
    const overflowPaint = node({
      id: 'overflow-paint',
      name: 'Overflow paint',
      type: 'RECTANGLE',
      fills: [solid([1, 0, 0])],
      bounds: textBounds,
    });
    const overflowContainer = parentNode([overflowPaint], {
      id: 'overflow-container',
      name: 'Overflow container',
      bounds: { x: 240, y: 240, width: 20, height: 20 },
    });
    Object.assign(overflowContainer, { clipsContent: false });
    const background = parentNode([overflowContainer], {
      id: 'background',
      name: 'Card',
      fills: [solid([1, 1, 1])],
      bounds: backgroundBounds,
    });
    parentNode([background, text], { id: 'root' });

    expect(
      await readAccessibilitySelection([text, background], 'srgb', 'overflowing-descendant')
    ).toMatchObject({
      success: false,
      error: expect.stringContaining('Overflow container'),
    });
  });

  it('uses render bounds to reject a sibling shadow that reaches the text', async () => {
    const { text, background } = siblingPair();
    const shadowCaster = node({
      id: 'shadow-caster',
      name: 'Shadow caster',
      type: 'RECTANGLE',
      fills: [solid([1, 0, 0])],
      bounds: { x: 300, y: 300, width: 20, height: 20 },
      renderBounds: textBounds,
      effects: [
        {
          type: 'DROP_SHADOW',
          color: { r: 1, g: 0, b: 0, a: 1 },
          offset: { x: -280, y: -280 },
          radius: 20,
          spread: 0,
          visible: true,
          blendMode: 'NORMAL',
          showShadowBehindNode: false,
        } as DropShadowEffect,
      ],
    });
    parentNode([background, shadowCaster, text]);

    expect(
      await readAccessibilitySelection([text, background], 'srgb', 'shadow-overflow')
    ).toMatchObject({
      success: false,
      error: expect.stringContaining('Shadow caster'),
    });
  });

  it('rejects selections whose stacking relation cannot be proven', async () => {
    const text = node({
      id: 'text',
      name: 'Label',
      type: 'TEXT',
      fills: [solid([0, 0, 0])],
      bounds: textBounds,
    });
    const background = node({
      id: 'background',
      name: 'Card',
      type: 'RECTANGLE',
      fills: [solid([1, 1, 1])],
      bounds: backgroundBounds,
    });
    parentNode([text], { id: 'text-parent' });
    parentNode([background], { id: 'background-parent' });

    expect(await readAccessibilitySelection([text, background], 'srgb', 'unprovable')).toMatchObject({
      success: false,
      error: expect.stringContaining('direct sibling'),
    });
  });

  it('resolves a bound color variable for the selected node with the dynamic-page API', async () => {
    const resolveForConsumer = vi.fn(() => ({
      resolvedType: 'COLOR',
      value: { r: 0.2, g: 0.4, b: 0.6, a: 1 },
    }));
    vi.mocked(figma.variables.getVariableByIdAsync).mockResolvedValue({
      resolveForConsumer,
    } as unknown as Variable);
    const { text, background } = siblingPair();
    Object.assign(text, {
      name: 'Variable Label',
      fills: [
        solid([0, 0, 0], { boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'v1' } } }),
      ],
    });

    expect(await readAccessibilitySelection([text, background], 'srgb', 'selection-4')).toMatchObject({
      success: true,
      foreground: '#336699',
    });
    expect(resolveForConsumer).toHaveBeenCalledWith(text);
  });

  it('fails closed when the dynamic-page variable API rejects', async () => {
    vi.mocked(figma.variables.getVariableByIdAsync).mockRejectedValue(
      new Error('page not loaded')
    );
    const { text, background } = siblingPair();
    Object.assign(text, {
      fills: [
        solid([0, 0, 0], { boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'v1' } } }),
      ],
    });

    expect(
      await readAccessibilitySelection([text, background], 'srgb', 'variable-rejection')
    ).toMatchObject({
      success: false,
      error: expect.stringContaining('variable could not be resolved'),
    });
  });

  it('rechecks the live profile after async variable loading before reporting success', async () => {
    let resolveVariable!: (variable: Variable) => void;
    vi.mocked(figma.variables.getVariableByIdAsync).mockReturnValue(
      new Promise(resolve => {
        resolveVariable = resolve;
      })
    );
    const { text, background } = siblingPair();
    Object.assign(text, {
      fills: [
        solid([0, 0, 0], { boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'v1' } } }),
      ],
    });
    Object.assign(figma.currentPage, { selection: [background, text] });

    const pending = sendAccessibilitySelection('profile-race');
    (figma.root as unknown as { documentColorProfile: string }).documentColorProfile =
      'DISPLAY_P3';
    resolveVariable({
      resolveForConsumer: () => ({
        resolvedType: 'COLOR',
        value: { r: 0, g: 0, b: 0, a: 1 },
      }),
    } as unknown as Variable);
    await pending;

    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'accessibility-selection-result',
      requestId: 'profile-race',
      success: false,
      profile: 'display-p3',
      error: expect.stringContaining('Display P3 channels are not treated as sRGB'),
    });
  });

  it('rechecks geometry after async variable loading before reporting success', async () => {
    let resolveVariable!: (variable: Variable) => void;
    vi.mocked(figma.variables.getVariableByIdAsync).mockReturnValue(
      new Promise(resolve => {
        resolveVariable = resolve;
      })
    );
    const { text, background } = siblingPair();
    Object.assign(text, {
      fills: [
        solid([0, 0, 0], { boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'v1' } } }),
      ],
    });
    Object.assign(figma.currentPage, { selection: [background, text] });

    const pending = sendAccessibilitySelection('geometry-race');
    Object.assign(background, { cornerRadius: 16 });
    resolveVariable({
      resolveForConsumer: () => ({
        resolvedType: 'COLOR',
        value: { r: 0, g: 0, b: 0, a: 1 },
      }),
    } as unknown as Variable);
    await pending;

    expect(figma.ui.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'accessibility-selection-result',
        requestId: 'geometry-race',
        success: false,
        error: expect.stringContaining('square-cornered'),
      })
    );
  });

  it('posts a terminal failure if reading the current selection throws unexpectedly', async () => {
    Object.defineProperty(figma.currentPage, 'selection', {
      configurable: true,
      get: () => {
        throw new Error('host selection unavailable');
      },
    });

    await sendAccessibilitySelection('terminal-failure');

    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'accessibility-selection-result',
      requestId: 'terminal-failure',
      success: false,
      profile: 'srgb',
      error: expect.stringContaining('could not read this selection safely'),
    });
  });

  it('rejects role-ambiguous shape-only selections', async () => {
    const first = node({
      id: 'a',
      name: 'A',
      type: 'RECTANGLE',
      fills: [solid([0, 0, 0])],
    });
    const second = node({
      id: 'b',
      name: 'B',
      type: 'RECTANGLE',
      fills: [solid([1, 1, 1])],
    });
    parentNode([first, second]);

    expect(await readAccessibilitySelection([first, second], 'srgb', 'selection-5')).toMatchObject({
      success: false,
      error: expect.stringContaining('exactly one text layer'),
    });
  });
});
