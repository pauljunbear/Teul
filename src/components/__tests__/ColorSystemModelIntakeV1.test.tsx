import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorSystemModelIntakeV1 } from '../ColorSystemModelIntakeV1';

describe('source model intake acknowledgments', () => {
  let container: HTMLDivElement;
  let root: Root;
  let post: ReturnType<typeof vi.spyOn>;
  let sourceRead = vi.fn<() => void>();
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    sourceRead = vi.fn();
    act(() => root.render(<ColorSystemModelIntakeV1 isDark={false} onSourceRead={sourceRead} />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  const button = (name: string) =>
    Array.from(container.querySelectorAll('button')).find(item => item.textContent === name)!;
  const reply = (message: unknown, source: Window = window.parent) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { source, data: { pluginMessage: message } })
      );
    });

  it('hands off only a matching backend acknowledgment and ignores other senders', () => {
    act(() => button('Read Figma colors').click());
    const sent = post.mock.calls.at(-1)![0].pluginMessage;
    expect(sent).toMatchObject({ source: 'current-file', scope: 'selection' });
    expect(container.textContent).toContain('Reading source…');
    const success = {
      type: 'color-system-model-result-v1',
      requestId: sent.requestId,
      success: true,
      modelHash: `sha256:${'a'.repeat(64)}`,
      modelJson: '{"model":"exact opaque export"}',
      summary: 'Two contexts, seven attributed rules.',
    };
    reply({ ...success, requestId: 'unrelated' });
    expect(sourceRead).not.toHaveBeenCalled();
    reply(success, {} as Window);
    expect(sourceRead).not.toHaveBeenCalled();
    reply(success);
    expect(sourceRead).toHaveBeenCalledTimes(1);
    reply(success);
    expect(sourceRead).toHaveBeenCalledTimes(1);
  });

  it('cancels outstanding reads and rejects late success without claiming a loaded model', () => {
    act(() => button('Read Figma colors').click());
    const requestId = post.mock.calls.at(-1)![0].pluginMessage.requestId;
    act(() => button('Cancel read').click());
    expect(post.mock.calls.at(-1)![0].pluginMessage).toMatchObject({
      type: 'cancel-color-system-model-v1',
      targetRequestId: requestId,
    });
    reply({
      type: 'color-system-model-result-v1',
      requestId,
      success: true,
      modelHash: `sha256:${'a'.repeat(64)}`,
      modelJson: '{}',
      summary: 'Too late',
    });
    expect(container.textContent).not.toContain('Too late');
    expect(sourceRead).not.toHaveBeenCalled();
  });

  it('times out with a recoverable error and never sends create authority', () => {
    act(() => button('Read Figma colors').click());
    act(() => vi.advanceTimersByTime(120000));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('retry');
    expect(button('Read Figma colors').disabled).toBe(false);
    expect(
      post.mock.calls.map(
        (call: unknown[]) => (call[0] as { pluginMessage: { type: string } }).pluginMessage.type
      )
    ).toEqual(['read-color-system-model-v1', 'cancel-color-system-model-v1']);
  });

  it('waits for the selected file and ignores a superseded slow file read', async () => {
    const input = container.querySelector<HTMLInputElement>('#model-source-file')!;
    let finishA!: (value: string) => void;
    const choose = (file: { size: number; text(): Promise<string> }) =>
      act(() => {
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    choose({
      size: 12,
      text: () =>
        new Promise(resolve => {
          finishA = resolve;
        }),
    });
    expect(button('Import guideline model').disabled).toBe(true);
    await act(async () => {
      choose({ size: 12, text: async () => '{"new":"B"}' });
    });
    expect(button('Import guideline model').disabled).toBe(false);
    await act(async () => {
      finishA('{"old":"A"}');
    });
    expect(container.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('{"new":"B"}');
    act(() => button('Import guideline model').click());
    expect(post.mock.calls.at(-1)![0].pluginMessage.json).toBe('{"new":"B"}');
  });
});
