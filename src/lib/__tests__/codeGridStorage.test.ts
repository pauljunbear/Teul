import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

vi.mock('../../backend', () => backendMocks);

describe('backend saved-grid storage bridge', () => {
  const postMessage = vi.fn();
  const getAsync = vi.fn();
  const setAsync = vi.fn();
  const deleteAsync = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getAsync.mockResolvedValue(null);
    setAsync.mockResolvedValue(undefined);
    deleteAsync.mockResolvedValue(undefined);

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
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        clientStorage: { getAsync, setAsync, deleteAsync },
        ui: { onmessage: undefined, postMessage },
      },
    });
  });

  it('routes get, set, and delete operations through figma.clientStorage', async () => {
    getAsync.mockResolvedValue('{"version":1}');
    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({ type: 'get-grid-storage', requestId: 'get-1' });
    await onmessage({
      type: 'set-grid-storage',
      requestId: 'set-1',
      value: '{"version":1}',
    });
    await onmessage({ type: 'delete-grid-storage', requestId: 'delete-1' });

    expect(getAsync).toHaveBeenCalledWith('teul-saved-grids');
    expect(setAsync).toHaveBeenCalledWith('teul-saved-grids', '{"version":1}');
    expect(deleteAsync).toHaveBeenCalledWith('teul-saved-grids');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'grid-storage-result',
      requestId: 'get-1',
      operation: 'get',
      success: true,
      value: '{"version":1}',
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'grid-storage-result',
      requestId: 'set-1',
      operation: 'set',
      success: true,
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'grid-storage-result',
      requestId: 'delete-1',
      operation: 'delete',
      success: true,
    });
  });

  it('returns the clientStorage error instead of reporting a false save success', async () => {
    setAsync.mockRejectedValue(new Error('clientStorage quota exceeded'));
    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({
      type: 'set-grid-storage',
      requestId: 'set-quota',
      value: '{"version":1}',
    });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'grid-storage-result',
      requestId: 'set-quota',
      operation: 'set',
      success: false,
      error: 'clientStorage quota exceeded',
    });
  });

  it('returns a correlated error for rejected storage payloads instead of timing out the UI', async () => {
    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({ type: 'set-grid-storage', requestId: 'set-invalid', value: '' });

    expect(setAsync).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'grid-storage-result',
      requestId: 'set-invalid',
      operation: 'set',
      success: false,
      error: 'Invalid saved grid storage request',
    });
  });
});
