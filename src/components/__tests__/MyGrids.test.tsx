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
    replaceExisting?: boolean;
    linkedResourcePolicy?: string;
    nativeResources?: SavedGrid['nativeResources'];
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
  layoutGridCount?: number;
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
          eligibleTargets: targets.map(target => ({
            ...target,
            layoutGridCount: target.layoutGridCount ?? 0,
            teulConstructionCount: 0,
          })),
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
      ([payload]) =>
        payload.pluginMessage?.type === 'get-selection-for-grid' &&
        typeof payload.pluginMessage.requestId === 'string'
    );
    expect(selectionRequest?.[0].pluginMessage?.requestId).toMatch(/^saved-grid-apply-\d+-1$/);
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
              appliedCount: 1,
              skippedCount: 0,
              failedCount: 0,
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
              appliedCount: 1,
              skippedCount: 0,
              failedCount: 0,
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
      ([payload]) =>
        payload.pluginMessage?.type === 'get-selection-for-grid' &&
        typeof payload.pluginMessage.requestId === 'string'
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
    expect(container.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  });

  it('can add to existing grids only after an explicit choice', async () => {
    await act(async () => {
      root.render(<MyGrids isDark={false} />);
      await Promise.resolve();
    });

    const applyButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Apply'
    );
    act(() => applyButton?.click());
    const selectionRequest = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) =>
        payload.pluginMessage?.type === 'get-selection-for-grid' &&
        typeof payload.pluginMessage.requestId === 'string'
    );
    act(() => {
      sendSelectionInfo(
        [
          {
            id: 'frame-1',
            name: 'Frame 1',
            width: 1000,
            height: 500,
            layoutGridCount: 1,
          },
        ],
        selectionRequest?.[0].pluginMessage?.requestId
      );
    });

    const addButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Add'
    );
    expect(addButton).toBeDefined();
    act(() => addButton?.click());

    const applyCall = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) => payload.pluginMessage?.type === 'apply-grid'
    );
    expect(applyCall?.[0].pluginMessage?.replaceExisting).toBe(false);
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
      ([payload]) =>
        payload.pluginMessage?.type === 'get-selection-for-grid' &&
        typeof payload.pluginMessage.requestId === 'string'
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

  it('requires an explicit choice before applying captured style and variable links', async () => {
    const linkedGrid: SavedGrid = {
      ...savedGrid,
      nativeResources: {
        gridStyleId: 'GridStyle:editorial',
        boundVariableIds: ['VariableID:gutter'],
        sourceFileKey: 'source-file',
      },
    };
    await saveGridsToStorage([linkedGrid]);

    await act(async () => {
      root.render(<MyGrids isDark={false} />);
      await Promise.resolve();
    });
    const applyButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Apply'
    );
    act(() => applyButton?.click());
    const selectionRequest = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) =>
        payload.pluginMessage?.type === 'get-selection-for-grid' &&
        typeof payload.pluginMessage.requestId === 'string'
    );
    act(() => {
      sendSelectionInfo(
        [{ id: 'frame-1', name: 'Frame 1', width: 1000, height: 500 }],
        selectionRequest?.[0].pluginMessage?.requestId
      );
    });

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      'Choose linked-resource behavior'
    );
    const preserve = container.querySelector<HTMLInputElement>(
      '[role="dialog"] input[type="checkbox"]'
    );
    expect(preserve?.checked).toBe(true);
    const confirm = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')
    ).find(button => button.textContent === 'Apply');
    act(() => confirm?.click());

    const applyCall = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) => payload.pluginMessage?.type === 'apply-grid'
    );
    expect(applyCall?.[0].pluginMessage?.linkedResourcePolicy).toBe('preserve-if-available');
    expect(applyCall?.[0].pluginMessage?.nativeResources).toEqual(linkedGrid.nativeResources);
  });

  it('uses the shared controller to clear selected saved-grid targets', async () => {
    await act(async () => {
      root.render(<MyGrids isDark={false} />);
      await Promise.resolve();
    });
    const clearButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Clear Selected'
    );
    act(() => clearButton?.click());
    const selectionRequest = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) =>
        payload.pluginMessage?.type === 'get-selection-for-grid' &&
        typeof payload.pluginMessage.requestId === 'string'
    );
    act(() => {
      sendSelectionInfo(
        [
          {
            id: 'frame-1',
            name: 'Frame 1',
            width: 1000,
            height: 500,
            layoutGridCount: 1,
          },
        ],
        selectionRequest?.[0].pluginMessage?.requestId
      );
    });
    const confirm = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')
    ).find(button => button.textContent === 'Clear');
    act(() => confirm?.click());
    const clearCall = (postMessage.mock.calls as unknown as PostMessageCall[]).find(
      ([payload]) => payload.pluginMessage?.type === 'clear-grid'
    );
    expect(clearCall?.[0].pluginMessage?.expectedTargetIds).toEqual(['frame-1']);
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

  it('captures a selected native grid into the save workflow', async () => {
    await act(async () => {
      root.render(<MyGrids isDark={false} />);
      await Promise.resolve();
    });

    const captureButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Capture Selected Frame'
    );
    act(() => captureButton?.click());
    expect(postMessage).toHaveBeenCalledWith(
      {
        pluginMessage: { type: 'capture-selected-grid', requestId: 'grid-capture-1' },
      },
      '*'
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'grid-capture-result',
              requestId: 'grid-capture-1',
              success: true,
              frameName: 'Article Frame',
              dimensions: { width: 1200, height: 800 },
              config: savedGrid.config,
            },
          },
        })
      );
    });

    expect(container.querySelector('#save-grid-dialog-title')?.textContent).toBe('Save Grid');
    expect(container.querySelector<HTMLInputElement>('#save-grid-name')?.value).toBe(
      'Article Frame Grid'
    );
  });

  it('opens a real geometry editor before saving a new custom grid', async () => {
    await act(async () => {
      root.render(<MyGrids isDark={false} />);
      await Promise.resolve();
    });

    const newGridButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === '+ New Grid'
    );
    act(() => newGridButton?.click());
    expect(container.querySelector('#grid-builder-title')?.textContent).toBe('New Grid');

    const continueButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Continue'
    );
    act(() => continueButton?.click());

    expect(container.querySelector('#save-grid-dialog-title')?.textContent).toBe('Save Grid');
    expect(container.querySelector<HTMLInputElement>('#save-grid-name')?.value).toBe('My Grid');
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

  it('edits saved geometry rather than only grid metadata', async () => {
    await act(async () => {
      root.render(<MyGrids isDark={false} />);
      await Promise.resolve();
    });

    const editGeometry = Array.from(container.querySelectorAll('button')).find(
      button => button.getAttribute('aria-label') === 'Edit grid geometry'
    );
    act(() => editGeometry?.click());
    expect(container.querySelector('#grid-builder-title')?.textContent).toBe('Edit Grid Geometry');
    expect(
      (postMessage.mock.calls as unknown as PostMessageCall[]).some(([payload]) =>
        payload.pluginMessage?.requestId?.startsWith('grid-builder-selection-')
      )
    ).toBe(true);

    const continueButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Continue'
    );
    await act(async () => {
      continueButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Grid geometry updated');
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
