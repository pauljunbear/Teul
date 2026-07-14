import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MutationHarness: React.FC = () => (
  <button
    onClick={() =>
      parent.postMessage(
        {
          pluginMessage: {
            type: 'apply-fill',
            requestId: 'integration-fill-1',
            hex: '#3366cc',
            name: 'Integration Blue',
          },
        },
        '*'
      )
    }
  >
    Apply integration fill
  </button>
);

describe('UI to validator to router to Figma integration', () => {
  let container: HTMLDivElement;
  let root: Root;
  const uiPostMessage = vi.fn();
  const commitUndo = vi.fn();
  const notify = vi.fn();
  const parentPostMessage = vi.spyOn(window.parent, 'postMessage');
  const target = {
    id: 'integration-target',
    type: 'RECTANGLE',
    name: 'Integration target',
    fills: [] as Paint[],
    locked: false,
    parent: null,
  } as unknown as SceneNode & { fills: Paint[] };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify,
        commitUndo,
        root: {},
        currentPage: { selection: [target], on: vi.fn(), off: vi.fn() },
        ui: { onmessage: undefined, postMessage: uiPostMessage },
      },
    });
    parentPostMessage.mockImplementation(() => undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await import('../../code');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    parentPostMessage.mockReset();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('applies one exact fill and returns one correlated terminal result', async () => {
    act(() => root.render(<MutationHarness />));
    act(() => container.querySelector('button')?.click());

    const request = parentPostMessage.mock.calls[0]?.[0] as {
      pluginMessage: unknown;
    };
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;
    await onmessage(request.pluginMessage);

    expect(target.fills).toEqual([
      {
        type: 'SOLID',
        color: {
          r: 0x33 / 255,
          g: 0x66 / 255,
          b: 0xcc / 255,
        },
      },
    ]);
    expect(commitUndo).toHaveBeenCalledOnce();
    expect(uiPostMessage).toHaveBeenCalledWith({
      type: 'mutation-operation-result',
      requestId: 'integration-fill-1',
      operation: 'apply-fill',
      success: true,
      message: 'Fill applied',
    });
  });
});
