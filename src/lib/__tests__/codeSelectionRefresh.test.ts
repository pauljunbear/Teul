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
  const listeners = new Map<string, (event: DocumentChangeEvent) => void>();

  beforeEach(() => {
    vi.resetModules();
    listeners.clear();

    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        currentPage: {
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
        },
        showUI: vi.fn(),
        on: vi.fn((type: string, listener: (event: DocumentChangeEvent) => void) => {
          listeners.set(type, listener);
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
    const handleDocumentChange = listeners.get('documentchange');
    expect(handleDocumentChange).toBeDefined();

    handleDocumentChange?.({
      documentChanges: [
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

    handleDocumentChange?.({
      documentChanges: [
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

  it('echoes the request ID when routing an explicit selection refresh', async () => {
    await import('../../code');

    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;
    await onmessage({ type: 'get-selection-for-grid', requestId: 'grid-apply-7' });

    expect(backendMocks.sendSelectionInfo).toHaveBeenCalledWith('grid-apply-7');
  });
});
