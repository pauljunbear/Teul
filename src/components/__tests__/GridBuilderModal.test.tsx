import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridBuilderModal } from '../GridBuilderModal';

describe('GridBuilderModal', () => {
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

  it('builds native geometry with editable units, alignment, visibility, and application mode', () => {
    const onContinue = vi.fn();
    act(() =>
      root.render(<GridBuilderModal isDark={false} onCancel={vi.fn()} onContinue={onContinue} />)
    );

    const selects = Array.from(container.querySelectorAll('select'));
    const applicationMode = selects.find(select =>
      Array.from(select.options).some(option => option.value === 'scale-from-reference')
    );
    act(() => {
      if (applicationMode) {
        applicationMode.value = 'scale-from-reference';
        applicationMode.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    const continueButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Continue'
    );
    act(() => continueButton?.click());

    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationMode: 'scale-from-reference',
        config: { columns: expect.objectContaining({ count: 12, alignment: 'STRETCH' }) },
        construction: expect.objectContaining({
          version: 2,
          realization: expect.objectContaining({ kind: 'native-layout-grids' }),
        }),
      })
    );
  });

  it('authors asymmetric generated geometry with unequal tracks, nested subdivisions, and live fit', () => {
    const onContinue = vi.fn();
    act(() =>
      root.render(
        <GridBuilderModal
          isDark={false}
          targetDimensions={{ width: 1440, height: 900 }}
          onCancel={vi.fn()}
          onContinue={onContinue}
        />
      )
    );

    const advanced = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Advanced construction'
    );
    act(() => advanced?.click());
    expect(container.textContent).toContain('Fits selected target 1440×900 · generated-geometry');
    expect(container.querySelector('[aria-label="Grid construction preview"]')).not.toBeNull();

    const addNested = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Add nested subdivision'
    );
    act(() => addNested?.click());
    const continueButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Continue'
    );
    act(() => continueButton?.click());

    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({
        config: {},
        construction: expect.objectContaining({
          margins: expect.objectContaining({ left: 72, right: 48, top: 72, bottom: 48 }),
          trackGroups: [expect.objectContaining({ tracks: [180, 260, 180], gutters: [24, 36] })],
          subdivisions: [
            expect.objectContaining({
              parentTrackId: 'columns:0',
              axis: 'rows',
              tracks: [120, 120, 120],
            }),
          ],
          realization: expect.objectContaining({ kind: 'generated-geometry' }),
        }),
      })
    );
  });

  it('preserves ordered groups and multiple subdivisions when editing generated geometry', () => {
    const onContinue = vi.fn();
    act(() =>
      root.render(
        <GridBuilderModal
          isDark={false}
          initialValue={{
            config: {},
            dimensions: { width: 1200, height: 900 },
            applicationMode: 'fixed',
            construction: {
              version: 2,
              margins: { left: 40, right: 60, top: 48, bottom: 48, unit: 'px' },
              trackGroups: [
                {
                  id: 'primary-columns',
                  axis: 'columns',
                  tracks: [160, 240],
                  gutters: [32],
                  gapBefore: 0,
                  unit: 'px',
                  visible: true,
                  color: { r: 1, g: 0, b: 0, a: 0.1 },
                },
                {
                  id: 'secondary-columns',
                  axis: 'columns',
                  tracks: [120, 120],
                  gutters: [24],
                  gapBefore: 48,
                  unit: 'px',
                  visible: false,
                  color: { r: 1, g: 0, b: 0, a: 0.1 },
                },
              ],
              subdivisions: [
                {
                  id: 'nested-a',
                  parentTrackId: 'primary-columns:0',
                  axis: 'rows',
                  tracks: [100, 100],
                  gutters: [20],
                  insetStart: 0,
                  insetEnd: 0,
                  unit: 'px',
                  visible: true,
                  color: { r: 0, g: 0, b: 1, a: 0.1 },
                },
                {
                  id: 'nested-b',
                  parentTrackId: 'primary-columns:1',
                  axis: 'rows',
                  tracks: [80, 80],
                  gutters: [16],
                  insetStart: 8,
                  insetEnd: 8,
                  unit: 'px',
                  visible: false,
                  color: { r: 0, g: 0, b: 1, a: 0.1 },
                },
              ],
              realization: { kind: 'generated-geometry', disclosure: 'Generated test.' },
            },
          }}
          onCancel={vi.fn()}
          onContinue={onContinue}
        />
      )
    );

    const continueButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Continue'
    );
    act(() => continueButton?.click());

    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({
        construction: expect.objectContaining({
          trackGroups: [
            expect.objectContaining({ id: 'primary-columns', visible: true }),
            expect.objectContaining({ id: 'secondary-columns', gapBefore: 48, visible: false }),
          ],
          subdivisions: [
            expect.objectContaining({ id: 'nested-a', parentTrackId: 'primary-columns:0' }),
            expect.objectContaining({
              id: 'nested-b',
              parentTrackId: 'primary-columns:1',
              visible: false,
            }),
          ],
        }),
      })
    );
  });

  it('blocks continuation when declared geometry cannot fit', () => {
    const onContinue = vi.fn();
    act(() =>
      root.render(<GridBuilderModal isDark={false} onCancel={vi.fn()} onContinue={onContinue} />)
    );
    const advanced = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Advanced construction'
    );
    act(() => advanced?.click());
    const columnTracks = Array.from(container.querySelectorAll('label'))
      .find(label => label.textContent?.includes('Column track sizes'))
      ?.querySelector<HTMLInputElement>('input');
    act(() => {
      if (columnTracks) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
          columnTracks,
          '2000, 2000, 2000'
        );
        columnTracks.dispatchEvent(new Event('input', { bubbles: true }));
        columnTracks.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('exceeds');
    const continueButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Continue'
    );
    expect(continueButton?.disabled).toBe(true);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
