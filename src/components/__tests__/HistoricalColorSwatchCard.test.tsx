import * as React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoricalColorSwatchCard, swatchTextRating } from '../HistoricalColorSwatchCard';

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
    const rating = swatchTextRating('#777777');
    expect(rating.label).toBe('AA Large');
    expect(rating.title).toContain('for #ffffff text on #777777');
    expect(rating.title.startsWith('WCAG 2.2 AA Large')).toBe(true);

    act(() => {
      root.render(
        <HistoricalColorSwatchCard color={{ name: 'Threshold', hex: '#777777' }} onOpen={vi.fn()} />
      );
    });
    const tile = container.querySelector<HTMLElement>('[role="button"]')!;
    // The tile keeps only the color and its name; the pair's text color is the rated one.
    expect(tile.textContent).toBe('Threshold');
    expect(tile.style.color).toBe('rgb(255, 255, 255)');
    expect(tile.style.aspectRatio).toBe('1 / 1');
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
