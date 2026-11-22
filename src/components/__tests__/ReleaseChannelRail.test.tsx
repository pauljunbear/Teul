import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLOR_SYSTEM_GENERIC_BUILDER_V2_ENABLED } from '../../lib/colorSystemGenericReleaseChannelV2';
import { App } from '../../ui';

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

/**
 * Vitest compiles without the webpack DefinePlugin, so this file exercises the
 * real release-channel module in its disabled state: the same state the
 * production bundle ships with.
 */
describe('rail in a disabled generic-builder release', () => {
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

  function railTabs(): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        '[role="tablist"][aria-label="Teul sections"] [role="tab"]'
      )
    );
  }

  it('is the disabled channel by default in this test build', () => {
    expect(COLOR_SYSTEM_GENERIC_BUILDER_V2_ENABLED).toBe(false);
  });

  it('renders four sections and never advertises the color-system builder', () => {
    act(() => root.render(<App />));

    expect(railTabs().map(tab => tab.id)).toEqual([
      'main-colors-tab',
      'main-grids-tab',
      'main-a11y-tab',
      'main-more-tab',
    ]);
    expect(railTabs().map(tab => tab.textContent?.trim())).toEqual([
      'Color',
      'Grids',
      'Check',
      'More',
    ]);
    expect(container.querySelector('#main-system-tab')).toBeNull();
    expect(container.querySelector('#main-system-panel')).toBeNull();
    expect(container.querySelectorAll('[role="tabpanel"][id^="main-"]')).toHaveLength(4);
    for (const phrase of [
      'Color system',
      'Build a color system',
      'Analyze and build suggestions',
      'Qualification build',
      'Color-system qualification is in progress',
    ]) {
      expect(container.textContent).not.toContain(phrase);
    }

    const colorsTab = container.querySelector<HTMLElement>('#main-colors-tab');
    act(() => {
      colorsTab?.focus();
      colorsTab?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    });
    expect(document.activeElement?.id).toBe('main-more-tab');
    expect(container.querySelector('#main-more-panel')?.hasAttribute('hidden')).toBe(false);
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' })
      );
    });
    expect(document.activeElement?.id).toBe('main-a11y-tab');
    expect(container.querySelector('#main-a11y-panel')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('#main-more-panel')?.hasAttribute('hidden')).toBe(true);
  });

  it('falls back to the first section when a persisted workspace points at the builder', () => {
    act(() => root.render(<App />));
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'workspace-storage-result',
              requestId: 'workspace-get',
              operation: 'get',
              success: true,
              value: JSON.stringify({
                version: 1,
                activeTab: 'system',
                themeMode: 'system',
                wada: { searchTerm: '', selectedSwatch: -1 },
                werner: { searchTerm: '', selectedGroup: -1 },
                recentColors: [],
              }),
            },
          },
        })
      );
    });

    expect(railTabs().filter(tab => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(container.querySelector('#main-colors-tab')?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('#main-colors-panel')?.hasAttribute('hidden')).toBe(false);
    const pressedLibrary = container.querySelector(
      '[aria-label="Color library"] button[aria-pressed="true"]'
    );
    expect(pressedLibrary?.textContent).toBe('Wada');
  });

  it('keeps rail and app text at or above 11px', () => {
    act(() => root.render(<App />));
    const sizes = Array.from(container.querySelectorAll<HTMLElement>('[style]'))
      .map(element => element.style.fontSize)
      .filter(size => size.endsWith('px'))
      .map(size => Number.parseFloat(size));

    expect(railTabs().every(tab => tab.style.fontSize === '11px')).toBe(true);
    expect(sizes.length).toBeGreaterThanOrEqual(8);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });
});
