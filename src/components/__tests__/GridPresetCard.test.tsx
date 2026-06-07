import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridFitAnalysis } from '../../lib/gridFit';
import type { GridPreset } from '../../types/grid';
import { GridPresetCard } from '../GridPresetCard';

const preset: GridPreset = {
  id: 'test-grid',
  name: 'Test Grid',
  description: 'A test grid',
  category: 'web-ui',
  tags: ['test'],
  config: {
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
  },
  isCustom: false,
};

const failedFit: GridFitAnalysis = {
  frame: { width: 100, height: 100 },
  status: 'fail',
  fits: false,
  score: 0,
  issues: [
    {
      code: 'section-too-small',
      severity: 'error',
      axis: 'columns',
      message: 'Columns are too narrow for the selected frame.',
    },
  ],
  recommendations: [
    {
      action: 'reduce-count',
      axis: 'columns',
      message: 'Reduce columns from 4 to 2 or fewer for this frame.',
    },
  ],
};

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

describe('GridPresetCard accessibility', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('uses sibling native buttons and reveals Apply when keyboard focus enters the card', () => {
    const onClick = vi.fn();
    const onApply = vi.fn();

    act(() => {
      root.render(
        <GridPresetCard
          preset={preset}
          isSelected={false}
          onClick={onClick}
          onApply={onApply}
          isDark={false}
        />
      );
    });

    const group = container.querySelector<HTMLElement>('[role="group"]');
    const selectionButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Test Grid"]'
    );

    expect(group?.getAttribute('aria-label')).toBe('Test Grid grid preset');
    expect(selectionButton?.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(selectionButton?.querySelector('button')).toBeNull();

    act(() => selectionButton?.focus());

    const applyButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Apply Test Grid to selected frame"]'
    );
    expect(applyButton).not.toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(2);

    act(() => applyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('replaces failed Apply with an actionable explanation tied to the selection control', () => {
    const onClick = vi.fn();
    const onApply = vi.fn();

    act(() => {
      root.render(
        <GridPresetCard
          preset={preset}
          fit={failedFit}
          isSelected
          onClick={onClick}
          onApply={onApply}
          isDark={false}
        />
      );
    });

    const buttons = container.querySelectorAll('button');
    const selectionButton = buttons[0];
    const describedBy = selectionButton.getAttribute('aria-describedby');

    expect(buttons).toHaveLength(1);
    expect(container.querySelector('button:disabled')).toBeNull();
    expect(container.textContent).not.toContain('Review fit');
    expect(container.textContent).toContain('Cannot apply.');
    expect(container.textContent).toContain('Reduce columns from 4 to 2 or fewer');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')?.textContent).toContain('Cannot apply.');

    act(() => selectionButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});
