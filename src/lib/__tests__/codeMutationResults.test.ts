import { beforeEach, describe, expect, it, vi } from 'vitest';

const backendMocks = vi.hoisted(() => ({
  sendSelectionInfo: vi.fn(),
  sendAccessibilitySelection: vi.fn(),
  sendDocumentColorProfile: vi.fn(),
  detectDocumentColorProfile: vi.fn(),
  handleApplyFill: vi.fn(),
  handleApplyStroke: vi.fn(),
  handleCreateStyle: vi.fn(),
  handleApplyGradient: vi.fn(),
  handleCreateGridFrame: vi.fn(),
  handleApplyGrid: vi.fn(),
  handleCaptureSelectedGrid: vi.fn(),
  handleGenerateColorSystem: vi.fn(),
}));

vi.mock('../../backend', () => backendMocks);

describe('correlated document mutation results', () => {
  const postMessage = vi.fn();
  const commitUndo = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify: vi.fn(),
        commitUndo,
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        ui: { onmessage: undefined, postMessage },
      },
    });
  });

  it('posts success and creates one undo boundary after a confirmed mutation', async () => {
    backendMocks.handleApplyFill.mockResolvedValue(true);
    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({
      type: 'apply-fill',
      requestId: 'fill-1',
      hex: '#112233',
      name: 'Test',
    });

    expect(commitUndo).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'mutation-operation-result',
      requestId: 'fill-1',
      operation: 'apply-fill',
      success: true,
      message: 'Fill applied',
    });
  });

  it('posts failure without creating an undo boundary', async () => {
    backendMocks.handleApplyFill.mockResolvedValue(false);
    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({
      type: 'apply-fill',
      requestId: 'fill-2',
      hex: '#112233',
      name: 'Test',
    });

    expect(commitUndo).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'mutation-operation-result',
      requestId: 'fill-2',
      operation: 'apply-fill',
      success: false,
      message: 'Fill not applied',
      error: 'Fill not applied',
    });
  });

  it('routes an accessibility selection request with its document profile', async () => {
    backendMocks.detectDocumentColorProfile.mockReturnValue('srgb');
    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({
      type: 'get-selection-for-accessibility',
      requestId: 'accessibility-1',
    });

    expect(backendMocks.detectDocumentColorProfile).toHaveBeenCalledWith(figma.root);
    expect(backendMocks.sendAccessibilitySelection).toHaveBeenCalledWith('accessibility-1', 'srgb');
  });
});
