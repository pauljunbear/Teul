import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePluginOperation } from '../usePluginOperation';

describe('usePluginOperation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let postMessage: ReturnType<typeof vi.spyOn>;
  const onResult = vi.fn();
  const onTimeout = vi.fn();

  const Harness: React.FC = () => {
    const operation = usePluginOperation({
      resultType: 'color-system-operation-result',
      timeoutMs: 100,
      onResult,
      onTimeout,
    });
    return (
      <button
        data-pending={operation.pending}
        onClick={() =>
          operation.submit({
            type: 'generate-color-system',
            requestId: 'request-1',
            createStyles: false,
            createVariables: false,
            collisionPolicy: 'cancel',
            config: {} as never,
            scales: {} as never,
          })
        }
      >
        Submit
      </button>
    );
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    postMessage.mockRestore();
    vi.useRealTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('suppresses duplicate submissions and ignores invalid or stale results', () => {
    const button = container.querySelector('button')!;
    act(() => button.click());
    act(() => button.click());
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(button.dataset.pending).toBe('true');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'color-system-operation-result',
              requestId: 'stale-request',
              success: true,
            },
          },
        })
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'color-system-operation-result',
              requestId: 'request-1',
              success: 'yes',
            },
          },
        })
      );
    });
    expect(onResult).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'color-system-operation-result',
              requestId: 'request-1',
              success: true,
            },
          },
        })
      );
    });
    expect(onResult).toHaveBeenCalledOnce();
    expect(button.dataset.pending).toBe('false');
  });

  it('clears pending state and reports a bounded timeout', () => {
    const button = container.querySelector('button')!;
    act(() => button.click());
    act(() => vi.advanceTimersByTime(100));

    expect(onTimeout).toHaveBeenCalledWith('request-1');
    expect(button.dataset.pending).toBe('false');
  });
});
