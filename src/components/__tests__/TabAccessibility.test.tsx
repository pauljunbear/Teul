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
    expect(container.querySelectorAll('[role="tabpanel"][id^="main-"]')).toHaveLength(5);
    expect(container.querySelector('#main-colors-panel')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('#main-werner-panel')?.hasAttribute('hidden')).toBe(true);

    const colorsTab = container.querySelector<HTMLElement>('#main-colors-tab');
    act(() => {
      colorsTab?.focus();
      colorsTab?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });

    assertTabRelationships(container, 'Teul sections');
    expect(container.querySelectorAll('[role="tabpanel"][id^="main-"]')).toHaveLength(5);
    expect(container.querySelector('#main-colors-panel')?.hasAttribute('hidden')).toBe(true);
    expect(container.querySelector('#main-werner-panel')?.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement?.id).toBe('main-werner-tab');
  });

  it('keeps System mounted and stateful while Settings hides every main tabpanel', () => {
    act(() => {
      root.render(<App />);
    });

    const systemTab = container.querySelector<HTMLButtonElement>('#main-system-tab')!;
    act(() => systemTab.click());
    expect(container.textContent).toContain('Qualification build — testing only; not released.');

    const advanced = Array.from(container.querySelectorAll<HTMLElement>('summary')).find(
      summary => summary.textContent?.trim() === 'Advanced'
    )!;
    act(() => advanced.click());
    const sourceScope = container.querySelector<HTMLSelectElement>('#teul-v2-source-scope')!;
    expect(sourceScope).toBeDefined();
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        'value'
      )?.set;
      valueSetter?.call(sourceScope, 'current-page');
      sourceScope.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(sourceScope.value).toBe('current-page');
    expect(container.querySelectorAll('main')).toHaveLength(1);

    const analyzeButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      button => button.textContent?.trim() === 'Analyze and build suggestions'
    )!;
    act(() => analyzeButton.click());
    const postedMessages = postMessage.mock.calls as unknown as Array<
      [{ pluginMessage?: { type?: string; requestId?: string } }, ...unknown[]]
    >;
    const analyzeMessage = postedMessages
      .map(call => call[0])
      .find(
        envelope => envelope.pluginMessage?.type === 'analyze-generic-color-system-v2'
      )?.pluginMessage;
    expect(analyzeMessage?.requestId).toBeTruthy();
    expect(analyzeButton.textContent).toBe('Building suggestions…');

    const settingsButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      button => button.textContent?.trim() === 'Settings'
    )!;
    act(() => settingsButton.click());

    assertTabRelationships(container, 'Teul sections');
    const panelsWhileSettings = Array.from(
      container.querySelectorAll<HTMLElement>('[role="tabpanel"][id^="main-"]')
    );
    expect(panelsWhileSettings).toHaveLength(5);
    expect(panelsWhileSettings.every(panel => panel.hidden)).toBe(true);
    expect(settingsButton.getAttribute('aria-pressed')).toBe('true');
    expect(systemTab.getAttribute('aria-selected')).toBe('false');
    expect(sourceScope.isConnected).toBe(false);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'generic-color-system-v2-plan-result',
              requestId: analyzeMessage?.requestId,
              analysisId: null,
              snapshotHash: `sha256:${'a'.repeat(64)}`,
              state: {
                kind: 'source-incomplete',
                firstBlockerId: 'gap:hidden-source-incomplete',
              },
              proposal: null,
              gaps: [
                {
                  id: 'gap:hidden-source-incomplete',
                  kind: 'missing-source',
                  title: 'The source is incomplete',
                  message: 'Hidden lifecycle result received.',
                  remediation: 'Choose a complete palette and analyze again.',
                  blocking: true,
                },
              ],
            },
          },
        })
      );
    });

    act(() => systemTab.click());

    expect(settingsButton.getAttribute('aria-pressed')).toBe('false');
    expect(systemTab.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector<HTMLElement>('#main-system-panel')?.hidden).toBe(false);
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.textContent).toContain('Hidden lifecycle result received.');
    expect(container.textContent).toContain('Choose a complete palette');

    const startOverButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button')
    ).find(button => button.textContent?.trim() === 'Start over')!;
    act(() => startOverButton.click());

    const restoredScope = container.querySelector<HTMLSelectElement>('#teul-v2-source-scope');
    expect(restoredScope).not.toBe(sourceScope);
    expect(restoredScope?.value).toBe('current-page');
    expect(container.textContent).toContain('Qualification build — testing only; not released.');
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        button => button.textContent?.trim() === 'Analyze and build suggestions'
      )
    ).toBeDefined();
  });

  it('unmounts inactive tab bodies so Settings cannot trigger hidden global shortcuts', () => {
    act(() => {
      root.render(<App />);
    });

    const gridsTab = container.querySelector<HTMLButtonElement>('#main-grids-tab')!;
    act(() => gridsTab.click());
    expect(container.querySelector<HTMLButtonElement>('button[title="Help (F1)"]')).not.toBeNull();

    const settingsButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      button => button.textContent?.trim() === 'Settings'
    )!;
    act(() => settingsButton.click());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'F1' }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('main')?.hasAttribute('inert')).toBe(false);
    expect(container.querySelector('main')?.getAttribute('aria-hidden')).not.toBe('true');
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
