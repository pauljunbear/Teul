import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridConfig } from '../../types/grid';
import { HelpPanel } from '../HelpPanel';
import { SaveGridModal } from '../SaveGridModal';
import { useModalAccessibility } from '../../lib/useModalAccessibility';

const gridConfig: GridConfig = {
  columns: {
    count: 4,
    gutterSize: 16,
    gutterUnit: 'px',
    margin: 24,
    marginUnit: 'px',
    alignment: 'STRETCH',
    visible: true,
    color: { r: 1, g: 0, b: 0, a: 0.1 },
  },
};

const uniformGridConfig: GridConfig = {
  baseline: {
    height: 8,
    offset: 0,
    visible: true,
    color: { r: 0, g: 0.8, b: 0.9, a: 0.15 },
  },
};

const dispatchKey = (key: string, shiftKey = false) => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
  });
};

const StackedDialog: React.FC<{ name: string; onClose: () => void }> = ({ name, onClose }) => {
  const dialogRef = useModalAccessibility({ onClose });
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} data-dialog={name}>
      <button>{name}</button>
    </div>
  );
};

describe('modal accessibility', () => {
  let container: HTMLDivElement;
  let root: Root;
  let opener: HTMLButtonElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    opener = document.createElement('button');
    opener.textContent = 'Open overlay';
    document.body.appendChild(opener);
    opener.focus();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    opener.remove();
    vi.useRealTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('traps focus in the help dialog, closes on Escape, and restores focus', () => {
    const onClose = vi.fn();

    act(() => {
      root.render(<HelpPanel isOpen onClose={onClose} isDark={false} />);
    });

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const closeButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Close grid system guide"]'
    );
    const footerButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Got it!'
    );

    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('grid-system-guide-title');
    expect(document.activeElement).toBe(closeButton);

    act(() => footerButton?.focus());
    dispatchKey('Tab');
    expect(document.activeElement).toBe(closeButton);

    dispatchKey('Tab', true);
    expect(document.activeElement).toBe(footerButton);

    dispatchKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(<HelpPanel isOpen={false} onClose={onClose} isDark={false} />);
    });
    expect(document.activeElement).toBe(opener);
  });

  it('gives the save dialog an accessible name, labels its fields, and traps focus', () => {
    const onClose = vi.fn();

    act(() => {
      root.render(
        <SaveGridModal
          config={gridConfig}
          suggestedName="Editorial"
          isDark={false}
          onClose={onClose}
        />
      );
    });

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const nameInput = container.querySelector<HTMLInputElement>('#save-grid-name');
    const closeButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Close save grid dialog"]'
    );
    const saveButton = Array.from(container.querySelectorAll('button')).find(button =>
      button.textContent?.includes('Save Grid')
    );

    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('save-grid-dialog-title');
    expect(document.activeElement).toBe(nameInput);
    expect(container.querySelector('label[for="save-grid-name"]')?.textContent).toContain('Name');
    expect(container.querySelector('label[for="save-grid-description"]')?.textContent).toContain(
      'Description'
    );
    expect(container.querySelector('label[for="save-grid-category"]')?.textContent).toContain(
      'Category'
    );
    expect(container.querySelector('label[for="save-grid-tags"]')?.textContent).toContain('Tags');

    act(() => saveButton?.focus());
    dispatchKey('Tab');
    expect(document.activeElement).toBe(closeButton);

    act(() => closeButton?.focus());
    dispatchKey('Tab', true);
    expect(document.activeElement).toBe(saveButton);

    dispatchKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => root.render(null));
    expect(document.activeElement).toBe(opener);
  });

  it('uses current Swiss-inspired and uniform-grid labels when saving a square Figma grid', () => {
    act(() => {
      root.render(
        <SaveGridModal
          config={uniformGridConfig}
          suggestedName="Spacing"
          isDark={false}
          onClose={vi.fn()}
        />
      );
    });

    const optionLabels = Array.from(container.querySelectorAll('option'), option =>
      option.textContent?.trim()
    );
    const tags = container.querySelector<HTMLInputElement>('#save-grid-tags');

    expect(optionLabels).toContain('🇨🇭 Swiss-Inspired');
    expect(optionLabels).toContain('📏 Uniform Grid');
    expect(optionLabels).not.toContain('🇨🇭 Classic Swiss');
    expect(optionLabels).not.toContain('📏 Baseline');
    expect(tags?.value).toBe('uniform-grid, 8px');
  });

  it('keeps focus and Escape behavior active in the save success dialog', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();

    act(() => {
      root.render(
        <SaveGridModal
          config={gridConfig}
          suggestedName="Editorial"
          isDark={false}
          onClose={onClose}
        />
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find(button =>
      button.textContent?.includes('Save Grid')
    );

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const successDialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(successDialog?.textContent).toContain('Grid Saved!');
    expect(document.activeElement).toBe(successDialog);

    dispatchKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.clearAllTimers();
  });

  it('hides and makes underlying stacked dialogs inert', () => {
    act(() => {
      root.render(
        <>
          <StackedDialog name="underlying" onClose={vi.fn()} />
          <StackedDialog name="top" onClose={vi.fn()} />
        </>
      );
    });

    const underlying = container.querySelector<HTMLElement>('[data-dialog="underlying"]');
    const top = container.querySelector<HTMLElement>('[data-dialog="top"]');

    expect(underlying?.getAttribute('aria-modal')).toBe('false');
    expect(underlying?.getAttribute('aria-hidden')).toBe('true');
    expect(underlying?.hasAttribute('inert')).toBe(true);
    expect(top?.getAttribute('aria-modal')).toBe('true');
    expect(top?.hasAttribute('aria-hidden')).toBe(false);
    expect(top?.hasAttribute('inert')).toBe(false);
  });

  it('isolates the application background and restores its previous state', () => {
    const onClose = vi.fn();

    act(() => {
      root.render(
        <>
          <main data-background aria-hidden="false">
            <button>Background action</button>
          </main>
          <StackedDialog name="modal" onClose={onClose} />
        </>
      );
    });

    const background = container.querySelector<HTMLElement>('[data-background]');
    expect(background?.getAttribute('aria-hidden')).toBe('true');
    expect(background?.hasAttribute('inert')).toBe(true);

    act(() => {
      root.render(
        <main data-background aria-hidden="false">
          <button>Background action</button>
        </main>
      );
    });

    const restoredBackground = container.querySelector<HTMLElement>('[data-background]');
    expect(restoredBackground?.getAttribute('aria-hidden')).toBe('false');
    expect(restoredBackground?.hasAttribute('inert')).toBe(false);
  });
});
