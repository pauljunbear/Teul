import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WORKSPACE_STATE,
  WorkspaceProvider,
  parseWorkspaceState,
  useWorkspaceState,
} from '../workspaceState';

const Harness: React.FC = () => {
  const { state, hydrated, update } = useWorkspaceState();
  return (
    <button
      data-hydrated={hydrated}
      onClick={() => update(current => ({ ...current, activeTab: 'grids' }))}
    >
      {state.activeTab}:{state.wada.searchTerm}
    </button>
  );
};

describe('workspace state', () => {
  let container: HTMLDivElement;
  let root: Root;
  let postMessage: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('rejects unsupported versions and bounds retained workspace values', () => {
    expect(parseWorkspaceState({ version: 2 })).toEqual(DEFAULT_WORKSPACE_STATE);
    expect(
      parseWorkspaceState({
        version: 1,
        activeTab: 'grids',
        themeMode: 'dark',
        wada: { searchTerm: 'violet', selectedSwatch: 3 },
        werner: { searchTerm: 'blue', selectedGroup: 5 },
        recentColors: [
          { hex: '#3366cc', name: 'Blue' },
          { hex: 'bad', name: 'Rejected' },
        ],
      })
    ).toEqual(
      expect.objectContaining({
        activeTab: 'grids',
        themeMode: 'dark',
        wada: { searchTerm: 'violet', selectedSwatch: 3 },
        werner: { searchTerm: 'blue', selectedGroup: 5 },
        recentColors: [{ hex: '#3366cc', name: 'Blue' }],
      })
    );
  });

  it('hydrates from and debounces updates back to Figma client storage', () => {
    act(() =>
      root.render(
        <WorkspaceProvider>
          <Harness />
        </WorkspaceProvider>
      )
    );
    expect(postMessage).toHaveBeenCalledWith(
      { pluginMessage: { type: 'get-workspace-storage', requestId: 'workspace-get' } },
      '*'
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'workspace-storage-result',
              requestId: 'workspace-get',
              operation: 'get',
              success: true,
              value: JSON.stringify({
                ...DEFAULT_WORKSPACE_STATE,
                activeTab: 'werner',
                wada: { searchTerm: 'saved', selectedSwatch: 1 },
              }),
            },
          },
        })
      );
    });
    const button = container.querySelector('button');
    expect(button?.textContent).toBe('werner:saved');
    expect(button?.dataset.hydrated).toBe('true');

    act(() => button?.click());
    act(() => vi.advanceTimersByTime(200));

    const saveCall = (postMessage.mock.calls as unknown[][]).find(
      (call: unknown[]) =>
        (call[0] as { pluginMessage?: { type?: string } }).pluginMessage?.type ===
        'set-workspace-storage'
    );
    expect(saveCall).toBeDefined();
    const saved = JSON.parse(
      (saveCall?.[0] as { pluginMessage: { value: string } }).pluginMessage.value
    );
    expect(saved.activeTab).toBe('grids');
    expect(saved.wada.searchTerm).toBe('saved');
  });

  it('migrates older generator drafts to the safe cancel collision policy', () => {
    const state = parseWorkspaceState({
      ...DEFAULT_WORKSPACE_STATE,
      generatorDraft: {
        sourceSignature: '#3366cc|Blue',
        scaleMethod: 'custom',
        neutralFamily: 'auto',
        detailLevel: 'detailed',
        includeDarkMode: true,
        createStyles: false,
        createVariables: true,
        systemName: 'Brand',
        multiSelectMode: false,
        roleAssignments: [{ hex: '#3366cc', name: 'Blue', role: 'primary', roles: ['primary'] }],
        stage: 3,
      },
    });

    expect(state.generatorDraft?.collisionPolicy).toBe('cancel');
  });
});
