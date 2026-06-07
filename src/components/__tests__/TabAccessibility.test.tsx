import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridSystemTab } from '../GridSystemTab';
import { App } from '../../ui';

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

const assertTabRelationships = (container: HTMLElement, tablistLabel: string) => {
  const tablist = container.querySelector(`[role="tablist"][aria-label="${tablistLabel}"]`);
  const tabs = Array.from(tablist?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);

  expect(tabs.length).toBeGreaterThan(0);

  for (const tab of tabs) {
    const panelId = tab.getAttribute('aria-controls');
    const panel = panelId ? container.querySelector<HTMLElement>(`#${panelId}`) : null;

    expect(panelId).toBeTruthy();
    expect(panel?.getAttribute('role')).toBe('tabpanel');
    expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
  }
};

describe('tab accessibility relationships', () => {
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
    localStorage.clear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('keeps every main tabpanel mounted with valid relationships while switching tabs', () => {
    act(() => {
      root.render(<App />);
    });

    assertTabRelationships(container, 'Teul sections');
    expect(container.querySelectorAll('[role="tabpanel"][id^="main-"]')).toHaveLength(4);
    expect(container.querySelector('#main-colors-panel')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('#main-werner-panel')?.hasAttribute('hidden')).toBe(true);

    const colorsTab = container.querySelector<HTMLElement>('#main-colors-tab');
    act(() => {
      colorsTab?.focus();
      colorsTab?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });

    assertTabRelationships(container, 'Teul sections');
    expect(container.querySelectorAll('[role="tabpanel"][id^="main-"]')).toHaveLength(4);
    expect(container.querySelector('#main-colors-panel')?.hasAttribute('hidden')).toBe(true);
    expect(container.querySelector('#main-werner-panel')?.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement?.id).toBe('main-werner-tab');
  });

  it('keeps every grid tabpanel mounted with valid relationships while switching tabs', () => {
    act(() => {
      root.render(<GridSystemTab isDark={false} />);
    });

    assertTabRelationships(container, 'Grid sections');
    expect(container.querySelectorAll('[role="tabpanel"][id^="grid-"]')).toHaveLength(2);
    expect(container.querySelector('#grid-library-panel')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('#grid-my-grids-panel')?.hasAttribute('hidden')).toBe(true);

    const libraryTab = container.querySelector<HTMLElement>('#grid-library-tab');
    act(() => {
      libraryTab?.focus();
      libraryTab?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });

    assertTabRelationships(container, 'Grid sections');
    expect(container.querySelectorAll('[role="tabpanel"][id^="grid-"]')).toHaveLength(2);
    expect(container.querySelector('#grid-library-panel')?.hasAttribute('hidden')).toBe(true);
    expect(container.querySelector('#grid-my-grids-panel')?.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement?.id).toBe('grid-my-grids-tab');
  });
});
