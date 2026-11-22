import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { getGridPresetCatalog } from '../../backend/gridPresetCatalog';
import type { GetGridPresetCatalogMessage } from '../../types/gridPresetCatalog';
import { GRID_PRESETS } from '../../lib/gridPresets';
import { GridLibrary } from '../GridLibrary';

vi.mock('../GridPresetCard', () => ({
  GridPresetCard: ({
    preset,
    onClick,
  }: {
    preset: { id: string; name: string };
    onClick: () => void;
  }) => (
    <button type="button" data-preset-id={preset.id} onClick={onClick}>
      {preset.name}
    </button>
  ),
}));
vi.mock('../SaveGridModal', () => ({ SaveGridModal: () => null }));

describe('grid catalog loading UI', () => {
  it('keeps loading/retry accessible, ignores unmounted responses and retains all catalog features', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const requests = () =>
      post.mock.calls
        .map(call => call[0].pluginMessage as GetGridPresetCatalogMessage)
        .filter(message => message.type === 'get-grid-preset-catalog');
    const deliver = (message: unknown, source: Window | null = window.parent) => {
      window.dispatchEvent(
        new MessageEvent('message', { source, data: { pluginMessage: message } })
      );
    };
    try {
      await act(async () => root.render(<GridLibrary isDark={false} />));
      expect(container.querySelector('[role="status"]')?.textContent).toContain(
        'Loading grid presets'
      );
      expect(container.querySelector('[data-preset-id]')).toBeNull();
      expect(container.querySelector<HTMLButtonElement>('.grid-category-btn')?.disabled).toBe(true);
      const old = requests()[0];
      await act(async () => root.render(null));
      await act(async () => root.render(<GridLibrary isDark />));
      const current = requests()[1];
      await act(async () => deliver(getGridPresetCatalog(old)));
      expect(container.querySelector('[data-preset-id]')).toBeNull();
      await act(async () => deliver({ ...getGridPresetCatalog(current), catalogJson: '[]' }));
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not load');
      const retry = Array.from(container.querySelectorAll('button')).find(
        button => button.textContent === 'Retry loading grid presets'
      );
      expect(retry).toBeDefined();
      await act(async () => retry!.click());
      expect(container.querySelector('[role="status"]')?.textContent).toContain(
        'Loading grid presets'
      );
      const valid = getGridPresetCatalog(requests()[2]);
      await act(async () => deliver(valid, null));
      expect(container.querySelector('[data-preset-id]')).toBeNull();
      await act(async () => deliver(valid));
      expect(container.querySelectorAll('[data-preset-id]')).toHaveLength(65);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      const category = Array.from(
        container.querySelectorAll<HTMLButtonElement>('.grid-category-btn')
      ).find(button => button.textContent?.includes('Editorial'))!;
      await act(async () => category.click());
      expect(container.querySelectorAll('[data-preset-id]')).toHaveLength(
        GRID_PRESETS.filter(preset => preset.category === 'editorial').length
      );
      const all = container.querySelector<HTMLButtonElement>('.grid-category-btn')!;
      await act(async () => all.click());
      const input = container.querySelector<HTMLInputElement>(
        'input[placeholder="Search grids..."]'
      )!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          'Gerstner'
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const filtered = GRID_PRESETS.filter(preset =>
        `${preset.name} ${preset.description} ${preset.tags.join(' ')}`
          .toLowerCase()
          .includes('gerstner')
      );
      expect(container.querySelectorAll('[data-preset-id]')).toHaveLength(filtered.length);
      await act(async () =>
        container.querySelector<HTMLButtonElement>('[data-preset-id]')!.click()
      );
      expect(container.textContent).toContain(filtered[0].provenance!.adaptationNotes);
      expect(container.querySelector('a')?.getAttribute('href')).toBe(
        filtered[0].provenance!.sourceUrl
      );
      expect(container.textContent).toContain('source-faithful canonical frame only');
      const requestsBefore = requests().length;
      await act(async () => root.render(null));
      await act(async () => root.render(<GridLibrary isDark={false} />));
      expect(requests()).toHaveLength(requestsBefore);
      expect(container.querySelectorAll('[data-preset-id]')).toHaveLength(65);
    } finally {
      act(() => root.unmount());
      container.remove();
      post.mockRestore();
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    }
  });
});
