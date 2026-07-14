import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGridStorageItem, setGridStorageItem } from '../gridStorageBridge';
import { addSavedGrid, createSavedGrid, invalidateGridCache, loadSavedGrids } from '../gridStorage';

interface StorageRequest {
  pluginMessage: {
    type: 'get-grid-storage' | 'set-grid-storage' | 'delete-grid-storage';
    requestId: string;
    value?: string;
  };
}

function dispatchStorageResult(
  source: Window,
  message: {
    type: 'grid-storage-result';
    requestId: string;
    operation: 'get' | 'set' | 'delete';
    success: boolean;
    value?: string | null;
    error?: string;
  }
): void {
  const event = new Event('message');
  Object.defineProperties(event, {
    source: { value: source },
    data: { value: { pluginMessage: message } },
  });
  window.dispatchEvent(event);
}

describe('gridStorageBridge', () => {
  const originalParent = window.parent;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    invalidateGridCache();
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', { configurable: true, value: originalParent });
    invalidateGridCache();
    vi.useRealTimers();
  });

  it('round-trips get, set, and delete requests through the Figma parent bridge', async () => {
    let storedValue: string | null = null;
    const figmaParent = {
      postMessage: vi.fn((payload: StorageRequest) => {
        const { pluginMessage } = payload;
        const operation = pluginMessage.type.replace('-grid-storage', '') as
          | 'get'
          | 'set'
          | 'delete';
        if (operation === 'set') storedValue = pluginMessage.value ?? null;
        if (operation === 'delete') storedValue = null;

        queueMicrotask(() => {
          dispatchStorageResult(figmaParent as unknown as Window, {
            type: 'grid-storage-result',
            requestId: pluginMessage.requestId,
            operation,
            success: true,
            ...(operation === 'get' ? { value: storedValue } : {}),
          });
        });
      }),
    };
    Object.defineProperty(window, 'parent', { configurable: true, value: figmaParent });

    await setGridStorageItem('{"version":1}');
    await expect(getGridStorageItem()).resolves.toBe('{"version":1}');
    expect(figmaParent.postMessage).toHaveBeenCalledTimes(2);
  });

  it('accepts Figma-relayed responses when the event source is not the immediate parent', async () => {
    const figmaParent = {
      postMessage: vi.fn((payload: StorageRequest) => {
        queueMicrotask(() => {
          dispatchStorageResult(window, {
            type: 'grid-storage-result',
            requestId: payload.pluginMessage.requestId,
            operation: 'get',
            success: true,
            value: 'relayed-value',
          });
        });
      }),
    };
    Object.defineProperty(window, 'parent', { configurable: true, value: figmaParent });

    await expect(getGridStorageItem()).resolves.toBe('relayed-value');
  });

  it('propagates clientStorage quota errors to the caller', async () => {
    const figmaParent = {
      postMessage: vi.fn((payload: StorageRequest) => {
        queueMicrotask(() => {
          dispatchStorageResult(figmaParent as unknown as Window, {
            type: 'grid-storage-result',
            requestId: payload.pluginMessage.requestId,
            operation: 'set',
            success: false,
            error: 'clientStorage quota exceeded',
          });
        });
      }),
    };
    Object.defineProperty(window, 'parent', { configurable: true, value: figmaParent });

    await expect(setGridStorageItem('{"version":1}')).rejects.toThrow(
      'clientStorage quota exceeded'
    );
  });

  it('prefers existing clientStorage over legacy iframe localStorage', async () => {
    localStorage.setItem('teul-saved-grids', 'legacy-value');
    const figmaParent = {
      postMessage: vi.fn((payload: StorageRequest) => {
        queueMicrotask(() => {
          dispatchStorageResult(figmaParent as unknown as Window, {
            type: 'grid-storage-result',
            requestId: payload.pluginMessage.requestId,
            operation: 'get',
            success: true,
            value: 'client-value',
          });
        });
      }),
    };
    Object.defineProperty(window, 'parent', { configurable: true, value: figmaParent });

    await expect(getGridStorageItem()).resolves.toBe('client-value');
    expect(figmaParent.postMessage).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('teul-saved-grids')).toBeNull();
  });

  it('migrates legacy iframe localStorage only after a successful clientStorage write', async () => {
    localStorage.setItem('teul-saved-grids', 'legacy-value');
    const figmaParent = {
      postMessage: vi.fn((payload: StorageRequest) => {
        const operation = payload.pluginMessage.type.replace('-grid-storage', '') as 'get' | 'set';
        queueMicrotask(() => {
          dispatchStorageResult(figmaParent as unknown as Window, {
            type: 'grid-storage-result',
            requestId: payload.pluginMessage.requestId,
            operation,
            success: true,
            ...(operation === 'get' ? { value: null } : {}),
          });
        });
      }),
    };
    Object.defineProperty(window, 'parent', { configurable: true, value: figmaParent });

    await expect(getGridStorageItem()).resolves.toBe('legacy-value');
    expect(figmaParent.postMessage).toHaveBeenNthCalledWith(
      2,
      {
        pluginMessage: {
          type: 'set-grid-storage',
          requestId: expect.any(String),
          value: 'legacy-value',
        },
      },
      '*'
    );
    expect(localStorage.getItem('teul-saved-grids')).toBeNull();
  });

  it('preserves legacy iframe localStorage when migration cannot be persisted', async () => {
    localStorage.setItem('teul-saved-grids', 'legacy-value');
    const figmaParent = {
      postMessage: vi.fn((payload: StorageRequest) => {
        const operation = payload.pluginMessage.type.replace('-grid-storage', '') as 'get' | 'set';
        queueMicrotask(() => {
          dispatchStorageResult(figmaParent as unknown as Window, {
            type: 'grid-storage-result',
            requestId: payload.pluginMessage.requestId,
            operation,
            success: operation === 'get',
            ...(operation === 'get' ? { value: null } : { error: 'clientStorage quota exceeded' }),
          });
        });
      }),
    };
    Object.defineProperty(window, 'parent', { configurable: true, value: figmaParent });

    await expect(getGridStorageItem()).rejects.toThrow('clientStorage quota exceeded');
    expect(localStorage.getItem('teul-saved-grids')).toBe('legacy-value');
  });

  it('serializes concurrent adds so a deferred clientStorage write cannot lose either grid', async () => {
    let storedValue: string | null = null;
    let firstSetRequest: StorageRequest['pluginMessage'] | null = null;
    let setRequestCount = 0;
    const figmaParent = {
      postMessage: vi.fn((payload: StorageRequest) => {
        const { pluginMessage } = payload;
        const operation = pluginMessage.type.replace('-grid-storage', '') as
          | 'get'
          | 'set'
          | 'delete';

        if (operation === 'get') {
          queueMicrotask(() => {
            dispatchStorageResult(figmaParent as unknown as Window, {
              type: 'grid-storage-result',
              requestId: pluginMessage.requestId,
              operation,
              success: true,
              value: storedValue,
            });
          });
          return;
        }

        if (operation === 'set') {
          setRequestCount++;
          if (setRequestCount === 1) {
            firstSetRequest = pluginMessage;
            return;
          }
          storedValue = pluginMessage.value ?? null;
        }

        queueMicrotask(() => {
          dispatchStorageResult(figmaParent as unknown as Window, {
            type: 'grid-storage-result',
            requestId: pluginMessage.requestId,
            operation,
            success: true,
          });
        });
      }),
    };
    Object.defineProperty(window, 'parent', { configurable: true, value: figmaParent });

    const config = {
      columns: {
        count: 12,
        gutterSize: 24,
        gutterUnit: 'px' as const,
        margin: 32,
        marginUnit: 'px' as const,
        alignment: 'STRETCH' as const,
        visible: true,
        color: { r: 1, g: 0.2, b: 0.2, a: 0.1 },
      },
    };
    const firstAdd = addSavedGrid(createSavedGrid({ name: 'First', description: '', config }));
    const secondAdd = addSavedGrid(createSavedGrid({ name: 'Second', description: '', config }));

    await vi.waitFor(() => expect(firstSetRequest).not.toBeNull());
    expect(setRequestCount).toBe(1);

    const committedFirstRequest = firstSetRequest as unknown as StorageRequest['pluginMessage'];
    storedValue = committedFirstRequest.value ?? null;
    dispatchStorageResult(figmaParent as unknown as Window, {
      type: 'grid-storage-result',
      requestId: committedFirstRequest.requestId,
      operation: 'set',
      success: true,
    });

    await Promise.all([firstAdd, secondAdd]);

    expect(setRequestCount).toBe(2);
    expect((await loadSavedGrids()).map(grid => grid.name)).toEqual(['Second', 'First']);
    expect(JSON.parse(storedValue!).grids.map((grid: { name: string }) => grid.name)).toEqual([
      'Second',
      'First',
    ]);
  });
});
