import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import wadaColors from '../../colors.json';
import { wernerColors } from '../../wernerColorData';
import { HISTORICAL_COLOR_DATA_SCHEMA_VERSION } from '../../types/historicalColorData';
import { App } from '../../ui';

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

describe('historical color data loading', () => {
  let container: HTMLDivElement;
  let root: Root;
  let postMessage: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
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
    vi.useRealTimers();
    localStorage.clear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  const postedRequests = () =>
    (postMessage.mock.calls as unknown as Array<[unknown, ...unknown[]]>)
      .map(
        (call: [unknown, ...unknown[]]) => call[0] as { pluginMessage?: Record<string, unknown> }
      )
      .map(envelope => envelope.pluginMessage)
      .filter(message => message?.type === 'get-historical-color-data');

  const deliver = (request: Record<string, unknown>, records: unknown[]) => {
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'historical-color-data-result',
              schemaVersion: HISTORICAL_COLOR_DATA_SCHEMA_VERSION,
              requestId: request.requestId,
              dataset: request.dataset,
              success: true,
              records,
            },
          },
        })
      );
    });
  };

  it('requests each dataset on first use and retains both in the UI session', () => {
    act(() => root.render(<App />));
    expect(container.textContent).toContain('Loading Wada colors');
    act(() => vi.runOnlyPendingTimers());

    const wadaRequest = postedRequests()[0];
    expect(wadaRequest).toMatchObject({
      schemaVersion: HISTORICAL_COLOR_DATA_SCHEMA_VERSION,
      dataset: 'wada',
    });
    deliver(wadaRequest!, wadaColors);
    expect(container.textContent).toContain('Hermosa Pink');

    act(() => container.querySelector<HTMLButtonElement>('#main-werner-tab')?.click());
    act(() => vi.runOnlyPendingTimers());
    const wernerRequest = postedRequests()[1];
    expect(wernerRequest).toMatchObject({ dataset: 'werner' });
    deliver(wernerRequest!, wernerColors);
    expect(container.textContent).toContain('Snow White');

    act(() => container.querySelector<HTMLButtonElement>('#main-colors-tab')?.click());
    act(() => container.querySelector<HTMLButtonElement>('#main-werner-tab')?.click());
    act(() => vi.runOnlyPendingTimers());
    expect(postedRequests()).toHaveLength(2);
  });

  it('fails closed on invalid data and exposes an accessible retry action', () => {
    act(() => root.render(<App />));
    act(() => vi.runOnlyPendingTimers());
    const wadaRequest = postedRequests()[0];
    deliver(wadaRequest!, []);

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Wada colors could not load'
    );
    const retry = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(button =>
      button.textContent?.includes('Retry loading Wada colors')
    );
    expect(retry).toBeDefined();
    act(() => retry?.click());
    expect(postedRequests()).toHaveLength(2);
  });
});
