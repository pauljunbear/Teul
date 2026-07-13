import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedGrid } from '../../types/grid';
import { invalidateGridCache, saveGridsToStorage } from '../../lib/gridStorage';
import { MyGrids } from '../MyGrids';

interface PostedPayload {
  pluginMessage?: {
    type?: string;
    requestId?: string;
    text?: string;
    expectedTargetIds?: string[];
    sourceDimensions?: {
      width: number;
      height: number;
    };
    sourceConfig?: {
      columns?: {
        margin?: number;
      };
    };
  };
}

type PostMessageCall = [PostedPayload, string];

interface SelectionTarget {
  id: string;
  name: string;
  width: number;
  height: number;
}

function sendSelectionInfo(targets: SelectionTarget[], requestId?: string): void {
  const firstTarget = targets[0];

  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        pluginMessage: {
          type: 'selection-info',
          hasSelection: targets.length > 0,
          isFrame: targets.length === 1,
          selectedCount: targets.length,
          eligibleTargets: targets,
          ineligibleCount: 0,
          width: firstTarget?.width,
          height: firstTarget?.height,
          name: firstTarget?.name,
          ...(requestId ? { requestId } : {}),
        },
      },
    })
  );
}

const savedGrid: SavedGrid = {
  id: 'saved-grid',
  name: 'Responsive Grid',
  description: 'Uses percentage margins',
  category: 'custom',
  tags: [],
  config: {
    columns: {
      count: 4,
      gutterSize: 20,
      gutterUnit: 'px',
      margin: 10,
      marginUnit: 'percent',
      alignment: 'STRETCH',
      visible: true,
      color: { r: 1, g: 0, b: 0, a: 0.1 },
    },
  },
  isCustom: true,
};

describe('MyGrids apply flow', () => {
  let container: HTMLDivElement;
  let root: Root;
  let postMessage: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    invalidateGridCache();
    await saveGridsToStorage([savedGrid]);
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
    invalidateGridCache();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('uses only the correlated live selection snapshot and waits for backend confirmation', async () => {
    await act(async () => {
      root.render(<MyGrids isDark={false} />);
      await Promise.resolve();
    });

    expect(container.querySelector('[role="button"] button')).toBeNull();
    const gridTitle = Array.from(container.querySelectorAll('h4')).find(
      heading => heading.textContent === savedGrid.name
    );
    expect(gridTitle).toBeDefined();

    const applyButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Apply'
    );
    expect(applyButton).toBeDefined();

    act(() => {
      applyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const initialCalls = postMessage.mock.calls as unknown as PostMessageCall[];
    const selectionRequest = initialCalls.find(
      ([payload]) => payload.pluginMessage?.type === 'get-selection-for-grid'
    );
    expect(selectionRequest?.[0].pluginMessage?.requestId).toBe('saved-grid-apply-1');
    expect(
      initialCalls.filter(([payload]) => payload.pluginMessage?.type === 'apply-grid')
    ).toHaveLength(0);

    act(() => {
      sendSelectionInfo([{ id: 'frame-1', name: 'Frame 1', width: 1000, height: 500 }]);
      sendSelectionInfo(
        [{ id: 'frame-1', name: 'Frame 1', width: 1000, height: 500 }],
        'saved-grid-apply-stale'
      );
    });

    expect(
      (postMessage.mock.calls as unknown as PostMessageCall[]).filter(
        ([payload]) => payload.pluginMessage?.type === 'apply-grid'
      )
    ).toHaveLength(0);

    act(() => {
      sendSelectionInfo(
        [{ id: 'frame-1', name: 'Frame 1', width: 1000, height: 500 }],
        selectionRequest?.[0].pluginMessage?.requestId
      );
    });

    const calls = postMessage.mock.calls as unknown as PostMessageCall[];
    const applyCall = calls.find(([payload]) => payload.pluginMessage?.type === 'apply-grid');
    expect(applyCall?.[0].pluginMessage?.sourceConfig?.columns?.margin).toBe(10);
    expect(applyCall?.[0].pluginMessage?.expectedTargetIds).toEqual(['frame-1']);
    expect(applyCall?.[0].pluginMessage?.sourceDimensions).toBeUndefined();
    expect(applyCall?.[0].pluginMessage?.requestId).toBe(
      selectionRequest?.[0].pluginMessage?.requestId
    );
    expect(container.textContent).not.toContain('Grid apply confirmed');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'grid-applied',
              requestId: 'saved-grid-apply-stale',
              success: true,
              message: 'Grid apply confirmed',
            },
          },
        })
      );
    });

    expect(container.textContent).not.toContain('Grid apply confirmed');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'grid-applied',
              requestId: selectionRequest?.[0].pluginMessage?.requestId,
              success: true,
              message: 'Grid apply confirmed',
            },
          },
        })
      );
    });

    expect(container.textContent).toContain('Grid apply confirmed');
  });

  it('analyzes every eligible target and blocks the apply when any target fails', async () => {
    await act(async () => {
      root.render(<MyGrids isDark={false} />);
      await Promise.resolve();
    });

    const applyButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Apply'
    );

    act(() => {
      applyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const selectionRequest = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) => payload.pluginMessage?.type === 'get-selection-for-grid'
    );

    act(() => {
      sendSelectionInfo(
        [
          { id: 'frame-wide', name: 'Wide Frame', width: 1000, height: 500 },
          { id: 'frame-tiny', name: 'Tiny Frame', width: 40, height: 40 },
        ],
        selectionRequest?.[0].pluginMessage?.requestId
      );
    });

    const calls = postMessage.mock.calls as unknown as PostMessageCall[];
    expect(calls.some(([payload]) => payload.pluginMessage?.type === 'apply-grid')).toBe(false);
    expect(calls.some(([payload]) => payload.pluginMessage?.type === 'notify')).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  });

  it('preserves scale-from-reference behavior for saved preset copies', async () => {
    await saveGridsToStorage([
      {
        ...savedGrid,
        referenceDimensions: { width: 800, height: 600 },
        applicationMode: 'scale-from-reference',
      },
    ]);

    await act(async () => {
      root.render(<MyGrids isDark={false} />);
      await Promise.resolve();
    });

    const applyButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Apply'
    );
    act(() => {
      applyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const selectionRequest = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) => payload.pluginMessage?.type === 'get-selection-for-grid'
    );
    act(() => {
      sendSelectionInfo(
        [{ id: 'frame-1', name: 'Frame 1', width: 1000, height: 750 }],
        selectionRequest?.[0].pluginMessage?.requestId
      );
    });

    const applyCall = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) => payload.pluginMessage?.type === 'apply-grid'
    );
    expect(applyCall?.[0].pluginMessage?.sourceDimensions).toEqual({ width: 800, height: 600 });
  });

  it('does not report create-frame success before backend confirmation', async () => {
    await act(async () => {
      root.render(<MyGrids isDark={false} />);
      await Promise.resolve();
    });

    const createFrameButton = Array.from(container.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Create new frame with this grid'
    );

    act(() => {
      createFrameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(
      (postMessage.mock.calls as unknown as PostMessageCall[]).some(
        ([payload]) => payload.pluginMessage?.type === 'create-grid-frame'
      )
    ).toBe(true);
    expect(container.textContent).not.toContain(`Created frame with "${savedGrid.name}"`);
  });

  it('associates Edit Grid labels with their fields', async () => {
    await act(async () => {
      root.render(<MyGrids isDark={false} />);
      await Promise.resolve();
    });

    const editButton = Array.from(container.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Edit grid settings'
    );
    expect(editButton).toBeDefined();

    act(() => {
      editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('label[for="edit-grid-name"]')?.textContent).toContain('Name');
    expect(container.querySelector('label[for="edit-grid-description"]')?.textContent).toContain(
      'Description'
    );
    expect(container.querySelector('label[for="edit-grid-tags"]')?.textContent).toContain('Tags');
    expect(container.querySelector('#edit-grid-name')).toBe(document.activeElement);
  });

  it('clearly warns when an import accepts only some records', async () => {
    const importJson = JSON.stringify({
      type: 'teul-grids',
      version: 1,
      grids: [savedGrid, { ...savedGrid, id: 'invalid-grid', tags: 'not-an-array' }],
    });
    const readAsText = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (
      this: FileReader
    ) {
      this.onload?.call(this, {
        target: { result: importJson },
      } as unknown as ProgressEvent<FileReader>);
    });

    await act(async () => {
      root.render(<MyGrids isDark={false} />);
      await Promise.resolve();
    });

    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File([importJson], 'partial-import.json', { type: 'application/json' })],
    });

    await act(async () => {
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    readAsText.mockRestore();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Imported 1 of 2 grids. 1 invalid grid was rejected.'
    );
  });
});
