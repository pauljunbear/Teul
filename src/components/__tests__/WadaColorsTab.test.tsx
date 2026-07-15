import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WadaColorsTab } from '../WadaColorsTab';

describe('WadaColorsTab studio flow', () => {
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

  it('keeps the library visible, exposes all Corinthian Pink pairings, and preloads a pairing', () => {
    act(() => {
      root.render(<WadaColorsTab isDark={false} />);
    });

    const corinthianPink = container.querySelector<HTMLElement>(
      '[aria-label="Open Corinthian Pink, #f8b6ba"]'
    );
    act(() => corinthianPink?.click());

    expect(container.querySelector('[aria-label="Corinthian Pink inspector"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Open Slate Color, #34454c"]')).not.toBeNull();
    expect(container.textContent).toContain('12 combinations');

    const viewAll = Array.from(container.querySelectorAll('button')).find(button =>
      button.textContent?.includes('View all 12 pairings')
    );
    act(() => viewAll?.click());

    expect(container.textContent).toContain('12 COMBINATIONS');
    expect(container.textContent).toContain('Set 12');

    const systemButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'System'
    );
    act(() => systemButton?.click());

    expect(container.textContent).toContain('Generate Color System');
    expect(container.textContent).toContain('Corinthian Pink');
    expect(container.textContent).toContain('Slate Color');
  });
});
