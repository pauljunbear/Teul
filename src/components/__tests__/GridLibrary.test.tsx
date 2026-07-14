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
    replaceExisting?: boolean;
    sourceConfig?: {
      columns?: {
        margin?: number;
      };
    };
  };
}

type PostMessageCall = [PostedPayload, string];

function sendSelectionInfo(
  width: number,
  height: number,
  requestId?: string,
  layoutGridCount = 0
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        pluginMessage: {
          type: 'selection-info',
          hasSelection: true,
          isFrame: true,
          selectedCount: 1,
          eligibleTargets: [{ id: 'frame-1', name: 'Frame 1', width, height, layoutGridCount }],
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
    expect(container.querySelector('[role="alert"]')?.textContent).toBeTruthy();
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

  it('requires an explicit replace choice when the target already has grids', () => {
    act(() => root.render(<GridLibrary isDark={false} />));
    act(() => sendSelectionInfo(1200, 800));
    postMessage.mockClear();

    const applyButton = container.querySelector<HTMLButtonElement>('[data-preset-id="swiss-4col"]');
    act(() => applyButton?.click());
    const refreshRequest = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) => payload.pluginMessage?.type === 'get-selection-for-grid'
    );
    act(() => sendSelectionInfo(1200, 800, refreshRequest?.[0].pluginMessage?.requestId, 2));

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      'Existing layout grids found'
    );
    expect(
      (postMessage.mock.calls as unknown as PostMessageCall[]).some(
        ([payload]) => payload.pluginMessage?.type === 'apply-grid'
      )
    ).toBe(false);

    const replaceButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Replace'
    );
    act(() => replaceButton?.click());

    const applyCall = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) => payload.pluginMessage?.type === 'apply-grid'
    );
    expect(applyCall?.[0].pluginMessage?.replaceExisting).toBe(true);
  });

  it('preflights and confirms Clear for the current selection', () => {
    act(() => root.render(<GridLibrary isDark={false} />));
    act(() => sendSelectionInfo(1200, 800, undefined, 1));
    postMessage.mockClear();

    const clearButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Clear'
    );
    act(() => clearButton?.click());
    const selectionRequest = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) =>
        payload.pluginMessage?.type === 'get-selection-for-grid' &&
        typeof payload.pluginMessage.requestId === 'string'
    );
    act(() => sendSelectionInfo(1200, 800, selectionRequest?.[0].pluginMessage?.requestId, 1));
    const confirm = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')
    ).find(button => button.textContent === 'Clear');
    act(() => confirm?.click());

    const clearCall = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) => payload.pluginMessage?.type === 'clear-grid'
    );
    expect(clearCall?.[0].pluginMessage?.expectedTargetIds).toEqual(['frame-1']);
  });
});
