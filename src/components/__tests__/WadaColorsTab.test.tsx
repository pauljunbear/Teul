import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WadaColorsTab } from '../WadaColorsTab';
import wadaColors from '../../colors.json';

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

  const buttons = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button'));

  it('opens a detail sheet over the grid, leads with combinations and builds from one', () => {
    act(() => {
      root.render(<WadaColorsTab isDark={false} colors={wadaColors} />);
    });

    const grid = container.querySelector<HTMLElement>('[data-teul-color-grid]')!;
    const tilesBefore = grid.querySelectorAll('[role="button"]').length;
    const corinthianPink = container.querySelector<HTMLElement>(
      '[aria-label="Open Corinthian Pink, #f8b6ba"]'
    );
    act(() => corinthianPink?.click());

    const sheet = container.querySelector<HTMLElement>('[data-teul-sheet]');
    expect(sheet?.getAttribute('aria-label')).toBe('Corinthian Pink details');
    expect(corinthianPink?.getAttribute('aria-current')).toBe('true');
    // The sheet overlays the grid: the grid keeps every tile and its five columns.
    expect(grid.querySelectorAll('[role="button"]').length).toBe(tilesBefore);
    expect((grid.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe(
      'repeat(5, minmax(0, 1fr))'
    );
    expect(sheet?.style.position).toBe('absolute');
    expect(container.querySelector('[aria-label="Open Slate Color, #34454c"]')).not.toBeNull();
    expect(sheet?.textContent).toContain('#F8B6BA · RGB 248 182 186');
    expect(sheet?.textContent).toContain('In 12 of Wada’s combinations');
    expect(sheet?.querySelectorAll('[data-teul-combo-size]')).toHaveLength(12);
    // CMYK and Lab stay reachable in Values, with the swatch label's WCAG statement.
    expect(sheet?.textContent).toContain('CMYK');
    expect(sheet?.textContent).toContain('LAB');
    expect(sheet?.textContent).toContain('WCAG 2.2');

    const fill = buttons().find(button => button.textContent?.trim() === 'Use as fill');
    act(() => fill?.click());
    expect(
      (postMessage.mock.calls.at(-1)?.[0] as { pluginMessage: { type: string; hex: string } })
        .pluginMessage
    ).toMatchObject({ type: 'apply-fill', hex: '#f8b6ba' });

    // Escape closes the sheet.
    act(() => {
      sheet?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('[data-teul-sheet]')).toBeNull();

    act(() => corinthianPink?.click());
    const firstSet = container.querySelector<HTMLButtonElement>('[data-teul-combo-size]')!;
    expect(firstSet.getAttribute('aria-label')).toMatch(
      /^Build a system from set 1: Corinthian Pink, /
    );
    act(() => firstSet.click());

    expect(container.textContent).toContain('1 of 2');
    expect(container.querySelector<HTMLInputElement>('#color-system-name')?.value).toBe(
      'Corinthian Pink Palette, Set 1'
    );
    expect(container.querySelector('[data-teul-role-card="primary"]')?.textContent).toContain(
      'Corinthian Pink'
    );

    // Back returns to the library with the sheet still open.
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Back to colors"]')?.click());
    expect(container.querySelector('[data-teul-sheet]')?.getAttribute('aria-label')).toBe(
      'Corinthian Pink details'
    );
  });

  it('keeps every pairing reachable with System, Export and gradients', () => {
    act(() => {
      root.render(<WadaColorsTab isDark={false} colors={wadaColors} />);
    });
    act(() =>
      container.querySelector<HTMLElement>('[aria-label="Open Corinthian Pink, #f8b6ba"]')?.click()
    );
    const viewAll = buttons().find(button => button.textContent?.includes('View all 12 pairings'));
    act(() => viewAll?.click());

    expect(container.textContent).toContain('12 combinations');
    expect(container.textContent).toContain('Set 12');
    expect(buttons().filter(button => button.textContent?.trim() === 'LIN')).toHaveLength(12);

    const systemButton = buttons().find(button => button.textContent?.trim() === 'System');
    act(() => systemButton?.click());

    expect(container.textContent).toContain('1 of 2');
    expect(container.textContent).toContain('Corinthian Pink');
    expect(container.textContent).toContain('Slate Color');
  });

  it('builds a system from a single color', () => {
    act(() => {
      root.render(<WadaColorsTab isDark colors={wadaColors} />);
    });
    act(() =>
      container.querySelector<HTMLElement>('[aria-label="Open Corinthian Pink, #f8b6ba"]')?.click()
    );
    act(() =>
      buttons()
        .find(button => button.textContent?.trim() === 'Build system')
        ?.click()
    );
    expect(container.querySelectorAll('[data-teul-role-card]')).toHaveLength(1);
  });
});
