import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridPreset } from '../../types/grid';
import { useGridApplyController } from '../useGridApplyController';

const source: GridPreset = {
  id: 'test-grid',
  name: 'Test Grid',
  description: 'Test',
  category: 'custom',
  tags: [],
  isCustom: true,
  config: {
    columns: {
      count: 2,
      gutterSize: 20,
      gutterUnit: 'px',
      margin: 20,
      marginUnit: 'px',
      alignment: 'STRETCH',
      visible: true,
      color: { r: 1, g: 0, b: 0, a: 0.1 },
    },
  },
};

function selection(requestId: string, gridCount: number) {
  return {
    type: 'selection-info',
    requestId,
    hasSelection: true,
    isFrame: true,
    selectedCount: 1,
    eligibleTargets: [
      {
        id: 'frame-1',
        name: 'Frame',
        width: 800,
        height: 600,
        layoutGridCount: gridCount,
        teulConstructionCount: 0,
      },
    ],
    ineligibleCount: 0,
  } as const;
}

describe('useGridApplyController', () => {
  let container: HTMLDivElement;
  let root: Root;
  let postMessage: ReturnType<typeof vi.spyOn>;
  const onResult = vi.fn();
  const onFailure = vi.fn();

  const Harness: React.FC = () => {
    const controller = useGridApplyController({
      requestPrefix: 'test',
      onResult,
      onFailure,
    });
    return (
      <div>
        <button id="apply" onClick={() => controller.requestApply(source)}>
          Apply
        </button>
        <button id="clear" onClick={() => controller.requestClear()}>
          Clear
        </button>
        {controller.pendingChoice && (
          <button id="replace" onClick={() => controller.chooseApply(true, 'replace-with-values')}>
            Replace
          </button>
        )}
        {controller.pendingClear && (
          <button id="confirm-clear" onClick={() => controller.confirmClear()}>
            Confirm clear
          </button>
        )}
      </div>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
    postMessage.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    postMessage.mockRestore();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  function latestRequestId(): string {
    return (postMessage.mock.calls.at(-1)?.[0] as { pluginMessage: { requestId: string } })
      .pluginMessage.requestId;
  }

  function send(message: unknown): void {
    window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: message } }));
  }

  it('applies directly after one current-selection preflight', () => {
    act(() => container.querySelector<HTMLButtonElement>('#apply')!.click());
    const requestId = latestRequestId();
    act(() => send(selection(requestId, 0)));

    const apply = postMessage.mock.calls.at(-1)?.[0] as {
      pluginMessage: { type: string; requestId: string; expectedTargetIds: string[] };
    };
    expect(apply.pluginMessage).toMatchObject({
      type: 'apply-grid',
      requestId,
      expectedTargetIds: ['frame-1'],
    });
  });

  it('requires an explicit replacement choice when selected targets have grids', () => {
    act(() => container.querySelector<HTMLButtonElement>('#apply')!.click());
    const requestId = latestRequestId();
    act(() => send(selection(requestId, 1)));
    expect(container.querySelector('#replace')).not.toBeNull();

    act(() => container.querySelector<HTMLButtonElement>('#replace')!.click());
    const apply = postMessage.mock.calls.at(-1)?.[0] as {
      pluginMessage: { type: string; replaceExisting: boolean };
    };
    expect(apply.pluginMessage).toMatchObject({ type: 'apply-grid', replaceExisting: true });
  });

  it('preflights and confirms Clear through the same correlated controller', () => {
    act(() => container.querySelector<HTMLButtonElement>('#clear')!.click());
    const requestId = latestRequestId();
    act(() => send(selection(requestId, 1)));
    expect(container.querySelector('#confirm-clear')).not.toBeNull();

    act(() => container.querySelector<HTMLButtonElement>('#confirm-clear')!.click());
    const clear = postMessage.mock.calls.at(-1)?.[0] as {
      pluginMessage: { type: string; requestId: string; expectedTargetIds: string[] };
    };
    expect(clear.pluginMessage).toEqual({
      type: 'clear-grid',
      requestId,
      expectedTargetIds: ['frame-1'],
    });
  });
});
