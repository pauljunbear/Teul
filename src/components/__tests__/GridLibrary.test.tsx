import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridLibrary } from '../GridLibrary';

vi.mock('../GridPresetCard', () => ({
  GridPresetCard: ({
    preset,
    onApply,
  }: {
    preset: { id: string; name: string };
    onApply: () => void;
  }) => (
    <button type="button" data-preset-id={preset.id} onClick={onApply}>
      Apply {preset.name}
    </button>
  ),
}));

vi.mock('../SaveGridModal', () => ({
  SaveGridModal: () => null,
}));

interface PostedPayload {
  pluginMessage?: {
    type?: string;
    requestId?: string;
    expectedTargetIds?: string[];
    sourceConfig?: {
      columns?: {
        margin?: number;
      };
    };
  };
}

type PostMessageCall = [PostedPayload, string];

function sendSelectionInfo(width: number, height: number, requestId?: string): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        pluginMessage: {
          type: 'selection-info',
          hasSelection: true,
          isFrame: true,
          selectedCount: 1,
          eligibleTargets: [{ id: 'frame-1', name: 'Frame 1', width, height }],
          ineligibleCount: 0,
          width,
          height,
          name: 'Frame 1',
          ...(requestId ? { requestId } : {}),
        },
      },
    })
  );
}

describe('GridLibrary live fit validation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let postMessage: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

  it('requests fresh geometry and blocks apply when the resized target no longer fits', () => {
    act(() => {
      root.render(<GridLibrary isDark={false} />);
    });

    act(() => sendSelectionInfo(1440, 900));
    postMessage.mockClear();

    const applyButton = container.querySelector<HTMLButtonElement>('[data-preset-id="web-12col"]');
    expect(applyButton).not.toBeNull();

    act(() => applyButton?.click());

    const refreshRequest = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) => payload.pluginMessage?.requestId
    );
    expect(refreshRequest?.[0].pluginMessage?.type).toBe('get-selection-for-grid');
    expect(
      (postMessage.mock.calls as unknown as PostMessageCall[]).some(
        ([payload]) => payload.pluginMessage?.type === 'apply-grid'
      )
    ).toBe(false);

    act(() => sendSelectionInfo(40, 40));
    expect(
      (postMessage.mock.calls as unknown as PostMessageCall[]).some(
        ([payload]) => payload.pluginMessage?.type === 'apply-grid'
      )
    ).toBe(false);

    act(() => sendSelectionInfo(40, 40, refreshRequest?.[0].pluginMessage?.requestId));

    const calls = postMessage.mock.calls as unknown as PostMessageCall[];
    expect(calls.some(([payload]) => payload.pluginMessage?.type === 'apply-grid')).toBe(false);
    expect(calls.some(([payload]) => payload.pluginMessage?.type === 'notify')).toBe(true);
  });

  it('builds the apply message from the fresh snapshot rather than cached geometry', () => {
    act(() => {
      root.render(<GridLibrary isDark={false} />);
    });

    act(() => sendSelectionInfo(600, 600));
    postMessage.mockClear();

    const applyButton = container.querySelector<HTMLButtonElement>('[data-preset-id="swiss-4col"]');
    expect(applyButton).not.toBeNull();

    act(() => applyButton?.click());
    const refreshRequest = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) => payload.pluginMessage?.requestId
    );
    act(() => sendSelectionInfo(1200, 800, refreshRequest?.[0].pluginMessage?.requestId));

    const applyCall = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) => payload.pluginMessage?.type === 'apply-grid'
    );

    expect(applyCall?.[0].pluginMessage?.sourceConfig?.columns?.margin).toBe(7);
    expect(applyCall?.[0].pluginMessage?.expectedTargetIds).toEqual(['frame-1']);
    expect(applyCall?.[0].pluginMessage?.requestId).toBe(
      refreshRequest?.[0].pluginMessage?.requestId
    );
  });
});
