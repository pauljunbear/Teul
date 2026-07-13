import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const backendMocks = vi.hoisted(() => ({
  sendSelectionInfo: vi.fn(),
  sendDocumentColorProfile: vi.fn(),
  handleApplyFill: vi.fn(),
  handleApplyStroke: vi.fn(),
  handleCreateStyle: vi.fn(),
  handleApplyGradient: vi.fn(),
  handleCreateGridFrame: vi.fn(),
  handleApplyGrid: vi.fn(),
  handleGenerateColorSystem: vi.fn(),
  generateColorSystemFrames: vi.fn(),
}));

vi.mock('../../backend', () => backendMocks);

describe('backend selection geometry refresh', () => {
  const figmaListeners = new Map<string, () => void>();
  const pageListeners = new Map<string, (event: NodeChangeEvent) => void>();
  const page = {
    selection: [
      {
        id: 'selected-frame',
        type: 'FRAME',
        name: 'Selected Frame',
        width: 1440,
        height: 900,
        layoutGrids: [],
      },
    ],
    on: vi.fn((type: string, listener: (event: NodeChangeEvent) => void) => {
      pageListeners.set(type, listener);
    }),
    off: vi.fn((type: string, listener: (event: NodeChangeEvent) => void) => {
      if (pageListeners.get(type) === listener) pageListeners.delete(type);
    }),
  };

  beforeEach(() => {
    vi.resetModules();
    figmaListeners.clear();
    pageListeners.clear();
    page.on.mockClear();
    page.off.mockClear();

    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        currentPage: page,
        showUI: vi.fn(),
        on: vi.fn((type: string, listener: () => void) => {
          figmaListeners.set(type, listener);
        }),
        notify: vi.fn(),
        ui: {
          onmessage: undefined,
        },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes only when selected grid-target geometry changes', async () => {
    await import('../../code');
    const handleNodeChange = pageListeners.get('nodechange');
    expect(handleNodeChange).toBeDefined();

    handleNodeChange?.({
      nodeChanges: [
        {
          type: 'PROPERTY_CHANGE',
          id: 'selected-frame',
          origin: 'LOCAL',
          node: {} as SceneNode,
          properties: ['name'],
        },
        {
          type: 'PROPERTY_CHANGE',
          id: 'other-frame',
          origin: 'LOCAL',
          node: {} as SceneNode,
          properties: ['width'],
        },
      ],
    });

    expect(backendMocks.sendSelectionInfo).not.toHaveBeenCalled();

    handleNodeChange?.({
      nodeChanges: [
        {
          type: 'PROPERTY_CHANGE',
          id: 'selected-frame',
          origin: 'LOCAL',
          node: {} as SceneNode,
          properties: ['width', 'height'],
        },
      ],
    });

    expect(backendMocks.sendSelectionInfo).toHaveBeenCalledTimes(1);
  });

  it('rebinds geometry monitoring when the current page changes', async () => {
    await import('../../code');
    const currentPageChange = figmaListeners.get('currentpagechange');
    expect(currentPageChange).toBeDefined();

    const nextPageListeners = new Map<string, (event: NodeChangeEvent) => void>();
    const nextPage = {
      ...page,
      on: vi.fn((type: string, listener: (event: NodeChangeEvent) => void) => {
        nextPageListeners.set(type, listener);
      }),
      off: vi.fn(),
    };
    Object.defineProperty(figma, 'currentPage', { configurable: true, value: nextPage });

    currentPageChange?.();

    expect(page.off).toHaveBeenCalledWith('nodechange', expect.any(Function));
    expect(nextPage.on).toHaveBeenCalledWith('nodechange', expect.any(Function));
    expect(backendMocks.sendSelectionInfo).toHaveBeenCalledTimes(1);
  });

  it('echoes the request ID when routing an explicit selection refresh', async () => {
    await import('../../code');

    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;
    await onmessage({ type: 'get-selection-for-grid', requestId: 'grid-apply-7' });

    expect(backendMocks.sendSelectionInfo).toHaveBeenCalledWith('grid-apply-7');
  });
});
