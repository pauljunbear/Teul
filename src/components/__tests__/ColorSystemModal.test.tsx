import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorSystemModal } from '../ColorSystemModal';

const colors = [{ hex: '#3366cc', name: 'Test Blue' }];

describe('ColorSystemModal submission', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onClose: () => void;
  let postMessage: ReturnType<typeof vi.spyOn>;

  const renderModal = (combinationName: string) => {
    act(() => {
      root.render(
        <ColorSystemModal
          isOpen
          onClose={onClose}
          colors={colors}
          combinationName={combinationName}
          isDark={false}
        />
      );
    });
  };

  const findButton = (text: string) =>
    Array.from(container.querySelectorAll('button')).find(button =>
      button.textContent?.includes(text)
    );

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    act(() => {
      valueSetter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const advanceToReview = (method = 'Exact Radix Colors') => {
    act(() => findButton('Continue')?.click());
    act(() => findButton(method)?.click());
    act(() => findButton('Continue')?.click());
  };

  const sendOperationResult = (
    requestId: string,
    success: boolean,
    error?: string,
    details: Record<string, unknown> = {}
  ) => {
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'color-system-operation-result',
              requestId,
              success,
              ...details,
              ...(error ? { error } : {}),
            },
          },
        })
      );
    });
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    onClose = vi.fn<() => void>();
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

  it.each([
    ['whitespace-only', '   ', 'Enter a system name.'],
    ['oversized', 'a'.repeat(513), 'System name must be 512 characters or fewer.'],
  ])('blocks %s system names before posting', (_, invalidName, expectedError) => {
    renderModal('Test System');

    const nameInput = container.querySelector<HTMLInputElement>('#color-system-name');
    expect(nameInput).not.toBeNull();
    setInputValue(nameInput!, invalidName);

    const generateButton = findButton('Continue') as HTMLButtonElement | undefined;
    const error = container.querySelector('#color-system-name-error');

    expect(nameInput?.getAttribute('aria-invalid')).toBe('true');
    expect(nameInput?.getAttribute('aria-describedby')).toBe('color-system-name-error');
    expect(error?.textContent).toBe(expectedError);
    expect(generateButton?.disabled).toBe(true);

    act(() => generateButton?.click());

    expect(postMessage).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('posts one correlated transaction and blocks duplicate submission until success', () => {
    renderModal('Test System');

    advanceToReview();

    const createStylesToggle = Array.from(container.querySelectorAll('label'))
      .find(label => label.textContent?.includes('Create Figma Color Styles'))
      ?.querySelector<HTMLInputElement>('input');
    const generateButton = findButton('Create Color System') as HTMLButtonElement | undefined;

    expect(generateButton?.disabled).toBe(false);

    act(() => createStylesToggle?.click());
    act(() => generateButton?.click());

    const postedMessages = postMessage.mock.calls as unknown as [
      {
        pluginMessage: {
          type: string;
          requestId: string;
          createStyles: boolean;
          createVariables: boolean;
          collisionPolicy: string;
        };
      },
      string,
    ][];
    const request = postedMessages[0][0].pluginMessage;

    expect(postedMessages).toHaveLength(1);
    expect(request.type).toBe('generate-color-system');
    expect(request.requestId).toMatch(/^color-system-/);
    expect(request.createStyles).toBe(true);
    expect(request.createVariables).toBe(true);
    expect(request.collisionPolicy).toBe('cancel');
    expect(generateButton?.disabled).toBe(true);

    act(() => generateButton?.click());

    expect(postMessage).toHaveBeenCalledTimes(1);

    sendOperationResult('unrelated-request', true);
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    sendOperationResult(request.requestId, true);
    expect(onClose).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Created “Test System”');
    expect(findButton('Create Another')).toBeDefined();
  });

  it('re-enables submission after a correlated failure acknowledgement', () => {
    renderModal('Test System');

    advanceToReview();
    act(() => findButton('Create Color System')?.click());

    const firstRequest = (
      postMessage.mock.calls[0][0] as {
        pluginMessage: { requestId: string };
      }
    ).pluginMessage;

    sendOperationResult(firstRequest.requestId, false, 'Style creation failed');

    const retryButton = findButton('Create Color System') as HTMLButtonElement | undefined;
    expect(retryButton?.disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Style creation failed');
    expect(onClose).not.toHaveBeenCalled();

    act(() => retryButton?.click());

    const secondRequest = (
      postMessage.mock.calls[1][0] as {
        pluginMessage: { requestId: string };
      }
    ).pluginMessage;
    expect(secondRequest.requestId).not.toBe(firstRequest.requestId);
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it('uses the selected collision policy and renders the backend output report', () => {
    renderModal('Test System');
    advanceToReview();
    const policy = container.querySelector<HTMLSelectElement>('#color-system-collision-policy')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(policy, 'create-copy');
      policy.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => findButton('Create Color System')?.click());
    const request = (
      postMessage.mock.calls[0][0] as {
        pluginMessage: { requestId: string; collisionPolicy: string };
      }
    ).pluginMessage;
    expect(request.collisionPolicy).toBe('create-copy');

    sendOperationResult(request.requestId, true, undefined, {
      outputName: 'Test System Copy',
      modes: ['Light', 'Dark'],
      primitiveCount: 24,
      semanticAliasCount: 10,
      styleCount: 34,
      frameCount: 1,
      skippedCount: 0,
      warnings: ['Existing output was preserved.'],
    });

    expect(container.textContent).toContain('Created “Test System Copy”');
    expect(container.textContent).toContain('24 primitives');
    expect(container.textContent).toContain('Existing output was preserved.');
  });

  it('presents three distinct generation modes with accurate claims', () => {
    renderModal('Test System');

    act(() => findButton('Continue')?.click());
    expect(findButton('Teul Generated')).toBeDefined();
    expect(findButton('Exact Radix Colors')).toBeDefined();
    expect(findButton('WCAG-Constrained Tokens')).toBeDefined();
    expect(container.textContent).toContain('unmodified @radix-ui/colors v3.0.0');
    expect(container.textContent).toContain('block output unless every declared pairing passes');
  });

  it('posts exact Radix source metadata instead of inserting the input color into the scale', () => {
    renderModal('Test System');

    act(() => findButton('Continue')?.click());
    act(() => findButton('Exact Radix Colors')?.click());
    expect(container.textContent).toContain(
      'the input color is not inserted into the exact Radix scale'
    );

    act(() => findButton('Continue')?.click());
    act(() => findButton('Create Color System')?.click());

    const request = (
      postMessage.mock.calls[0][0] as {
        pluginMessage: {
          config: { scaleMethod: string };
          scales: {
            scaleMethod: string;
            scales: {
              light: {
                primary: {
                  sourceVersion: string;
                  sourceFamily: string;
                  sourceInputHex: string;
                };
              };
            };
          };
        };
      }
    ).pluginMessage;

    expect(request.config.scaleMethod).toBe('radix-match');
    expect(request.scales.scaleMethod).toBe('radix-match');
    expect(request.scales.scales.light.primary.sourceVersion).toBe('3.0.0');
    expect(request.scales.scales.light.primary.sourceFamily.length).toBeGreaterThan(0);
    expect(request.scales.scales.light.primary.sourceInputHex).toBe('#3366cc');
  });

  it('posts a passing recomputable semantic policy in WCAG-constrained mode', () => {
    renderModal('Test System');

    act(() => findButton('Continue')?.click());
    act(() => findButton('WCAG-Constrained Tokens')?.click());
    expect(container.textContent).toContain('WCAG 2.2 semantic color policy: Passed');

    act(() => findButton('Continue')?.click());
    act(() => findButton('Create Color System')?.click());

    const request = (
      postMessage.mock.calls[0][0] as {
        pluginMessage: {
          config: { scaleMethod: string };
          scales: {
            scaleMethod: string;
            semanticPolicy: { valid: boolean; modes: { light: { pairings: unknown[] } } };
          };
        };
      }
    ).pluginMessage;

    expect(request.config.scaleMethod).toBe('wcag-constrained');
    expect(request.scales.scaleMethod).toBe('wcag-constrained');
    expect(request.scales.semanticPolicy.valid).toBe(true);
    expect(request.scales.semanticPolicy.modes.light.pairings.length).toBeGreaterThan(0);
  });
});
