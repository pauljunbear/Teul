import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WernerColorsTab } from '../WernerColorsTab';

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
      root.render(<WernerColorsTab isDark={false} />);
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
});
