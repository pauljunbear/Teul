import * as React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoricalColorSwatchCard } from '../HistoricalColorSwatchCard';

describe('HistoricalColorSwatchCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('uses the exact rendered pair and the canonical WCAG level name', () => {
    act(() => {
      root.render(
        <HistoricalColorSwatchCard color={{ name: 'Threshold', hex: '#777777' }} onOpen={vi.fn()} />
      );
    });

    const wcagBadge = container.querySelector('[title^="WCAG 2.2"]');
    expect(wcagBadge?.textContent).toBe('AA Large');
    expect(wcagBadge?.getAttribute('title')).toContain('for #ffffff text on #777777');
    expect(wcagBadge?.textContent).not.toBe('A');
  });

  it('opens with click, Enter, and Space while preserving optional metadata', () => {
    const onOpen = vi.fn();
    act(() => {
      root.render(
        <HistoricalColorSwatchCard
          color={{ name: 'Test Color', hex: '#ffffff' }}
          onOpen={onOpen}
          markerLabel="Characteristic color"
          trailingCount={12}
        />
      );
    });

    const card = container.querySelector('[role="button"]') as HTMLDivElement;
    act(() => card.click());
    act(() => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    act(() => card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));

    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(container.querySelector('[aria-label="Characteristic color"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="12 combinations"]')).not.toBeNull();
  });
});
