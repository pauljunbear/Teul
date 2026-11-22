import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WernerColorsTab } from '../WernerColorsTab';
import { wernerColors } from '../../wernerColorData';

describe('WernerColorsTab transcription disclosure', () => {
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

  it('shows the source text and normalization reason for a printed inconsistency', () => {
    act(() => {
      root.render(<WernerColorsTab isDark={false} colors={wernerColors} />);
    });

    const cloveBrown = container.querySelector<HTMLElement>('[aria-label^="Open Clove Brown,"]');
    act(() => {
      cloveBrown?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Source/display differences (1)');
    expect(container.textContent).toContain(
      'Source: “Olive Brown, is ash grey mixed with a little blue, red, and chesnut brown.”'
    );
    expect(container.textContent).toContain(
      'Display: “Clove Brown, is ash grey mixed with a little blue, red, and chestnut brown.”'
    );
    expect(container.textContent).toContain('the table identifies No. 109 as "Clove Brown"');
  });

  it('opens the detail sheet with Werner actions and builds a one-color system', () => {
    act(() => {
      root.render(
        <WernerColorsTab
          isDark
          colors={wernerColors}
          librarySwitch={<span data-testid="switch">switch</span>}
        />
      );
    });
    expect(container.querySelector('[data-testid="switch"]')).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.placeholder).toBe(
      'Search 110 colors'
    );
    const snowWhite = container.querySelector<HTMLElement>('[aria-label^="Open Snow White,"]');
    act(() => snowWhite?.click());
    const sheet = container.querySelector<HTMLElement>('[data-teul-sheet]');
    expect(sheet?.getAttribute('aria-label')).toBe('Snow White details');
    expect(sheet?.textContent).toContain('Whites · Characteristic color');
    expect(sheet?.textContent).toContain('Animal');

    const style = container.querySelector<HTMLButtonElement>('[aria-label="Create style"]');
    act(() => style?.click());
    expect(
      (postMessage.mock.calls.at(-1)?.[0] as { pluginMessage: { type: string; name: string } })
        .pluginMessage
    ).toMatchObject({ type: 'create-style', name: 'Werner/Whites/Snow White' });

    const build = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Build system'
    );
    act(() => build?.click());
    expect(container.querySelector<HTMLInputElement>('#color-system-name')?.value).toBe(
      'Werner/Snow White'
    );
  });
});
