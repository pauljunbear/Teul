import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridLibrary } from '../GridLibrary';
import { getGridPresetCatalog } from '../../backend/gridPresetCatalog';
import type { GetGridPresetCatalogMessage } from '../../types/gridPresetCatalog';

vi.mock('../SaveGridModal', () => ({
  SaveGridModal: () => <div data-testid="save-grid-modal" />,
}));

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

interface Posted {
  pluginMessage?: {
    type?: string;
    requestId?: string;
    expectedTargetIds?: string[];
    frameName?: string;
  };
}

function sendSelection(requestId?: string): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        pluginMessage: {
          type: 'selection-info',
          hasSelection: true,
          isFrame: true,
          selectedCount: 1,
          eligibleTargets: [
            { id: 'frame-1', name: 'Frame 1', width: 1200, height: 800, layoutGridCount: 0 },
          ],
          ineligibleCount: 0,
          width: 1200,
          height: 800,
          name: 'Frame 1',
          ...(requestId ? { requestId } : {}),
        },
      },
    })
  );
}

describe('GridLibrary detail sheet', () => {
  let container: HTMLDivElement;
  let root: Root;
  let postMessage: ReturnType<typeof vi.spyOn>;
  const posted = () => (postMessage.mock.calls as unknown as [Posted, string][]).map(c => c[0]);

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    });
    postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(payload => {
      const request = payload.pluginMessage as GetGridPresetCatalogMessage;
      if (request.type === 'get-grid-preset-catalog') {
        window.dispatchEvent(
          new MessageEvent('message', {
            source: window.parent,
            data: { pluginMessage: getGridPresetCatalog(request) },
          })
        );
      }
    });
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

  it('opens an overlaying sheet from a card and applies through the same apply-grid flow', async () => {
    await act(async () => root.render(<GridLibrary isDark />));
    act(() => sendSelection());

    expect(container.querySelector('[data-teul-sheet]')).toBeNull();
    const card = container.querySelector<HTMLButtonElement>('[data-teul-grid-card="swiss-4col"]');
    expect(card).not.toBeNull();
    act(() => card?.click());

    const sheet = container.querySelector<HTMLElement>('[data-teul-sheet]');
    expect(sheet).not.toBeNull();
    expect(sheet?.style.position).toBe('absolute');
    expect(sheet?.getAttribute('aria-label')).toMatch(/details$/);
    expect(card?.getAttribute('aria-pressed')).toBe('true');

    const buttons = Array.from(sheet?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const apply = buttons.find(button => button.textContent === 'Apply to Frame 1');
    const newFrame = buttons.find(button => button.textContent === 'New Frame');
    const save = buttons.find(button => button.textContent === 'Save');
    expect(apply?.disabled).toBe(false);
    expect(newFrame).toBeDefined();
    expect(save?.getAttribute('aria-label')).toBe('Save grid to My Grids collection');

    postMessage.mockClear();
    act(() => apply?.click());
    const selectionRequest = posted().find(
      message => message.pluginMessage?.type === 'get-selection-for-grid'
    );
    expect(selectionRequest?.pluginMessage?.requestId).toBeTruthy();
    act(() => sendSelection(selectionRequest?.pluginMessage?.requestId));
    const applyCall = posted().find(message => message.pluginMessage?.type === 'apply-grid');
    expect(applyCall?.pluginMessage?.expectedTargetIds).toEqual(['frame-1']);
    expect(applyCall?.pluginMessage?.requestId).toBe(selectionRequest?.pluginMessage?.requestId);

    postMessage.mockClear();
    act(() => newFrame?.click());
    expect(posted().some(message => message.pluginMessage?.type === 'create-grid-frame')).toBe(
      true
    );

    act(() => save?.click());
    expect(container.querySelector('[data-testid="save-grid-modal"]')).not.toBeNull();

    act(() => {
      sheet?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    expect(container.querySelector('[data-teul-sheet]')).toBeNull();
  });

  it('keeps every inline text size at or above 11px in the cards and the sheet', async () => {
    await act(async () => root.render(<GridLibrary isDark={false} />));
    act(() => sendSelection());
    act(() =>
      container.querySelector<HTMLButtonElement>('[data-teul-grid-card="swiss-4col"]')?.click()
    );
    const sizes = Array.from(container.querySelectorAll<HTMLElement>('[style]'))
      .map(element => Number.parseFloat(element.style.fontSize))
      .filter(Number.isFinite);
    expect(sizes.length).toBeGreaterThan(10);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });
});
