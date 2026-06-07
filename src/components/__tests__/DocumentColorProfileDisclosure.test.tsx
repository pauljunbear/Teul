import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../ui';

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

describe('document color profile disclosure', () => {
  let container: HTMLDivElement;
  let root: Root;
  let postMessage: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    });
    postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    postMessage.mockRestore();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('requests and displays the document color profile', () => {
    act(() => {
      root.render(<App />);
    });

    const tablist = container.querySelector('[role="tablist"][aria-label="Teul sections"]');
    expect(tablist?.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(tablist?.textContent).not.toBe('SW');

    expect(postMessage).toHaveBeenCalledWith(
      { pluginMessage: { type: 'get-document-color-profile' } },
      '*'
    );
    expect(
      container.querySelector('[aria-label="Document color profile: Not reported"]')
    ).not.toBeNull();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'document-color-profile',
              profile: 'display-p3',
            },
          },
        })
      );
    });

    expect(container.querySelector('[aria-label="Document color profile: Display P3"]')).not.toBe(
      null
    );
  });
});
