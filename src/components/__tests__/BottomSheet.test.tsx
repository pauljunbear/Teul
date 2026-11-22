import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from '../TeulUI';

const Harness: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" id="opener" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button" id="elsewhere" onClick={() => setOpen(false)}>
        Elsewhere
      </button>
      {open && (
        <BottomSheet
          isDark={false}
          label="Test details"
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
        >
          <button type="button">Inside</button>
        </BottomSheet>
      )}
    </div>
  );
};

describe('BottomSheet', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('overlays its parent, takes focus, closes on Escape and returns focus', () => {
    const onClose = vi.fn();
    act(() => root.render(<Harness onClose={onClose} />));
    const opener = container.querySelector<HTMLButtonElement>('#opener')!;
    act(() => {
      opener.focus();
      opener.click();
    });
    const sheet = container.querySelector<HTMLElement>('[data-teul-sheet]')!;
    expect(sheet.getAttribute('aria-label')).toBe('Test details');
    expect(sheet.style.position).toBe('absolute');
    expect(sheet.style.bottom).toBe('0px');
    expect(sheet.className).toBe('teul-sheet');
    expect(document.activeElement).toBe(sheet);

    act(() => {
      sheet.querySelector<HTMLButtonElement>('button')!.focus();
      sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-teul-sheet]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('leaves focus on a control the person moved to when that control closes it', () => {
    act(() => root.render(<Harness />));
    const opener = container.querySelector<HTMLButtonElement>('#opener')!;
    act(() => {
      opener.focus();
      opener.click();
    });
    const elsewhere = container.querySelector<HTMLButtonElement>('#elsewhere')!;
    act(() => {
      elsewhere.focus();
      elsewhere.click();
    });
    expect(container.querySelector('[data-teul-sheet]')).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });
});
