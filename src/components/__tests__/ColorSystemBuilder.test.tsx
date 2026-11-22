import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorSystemBuilder } from '../ColorSystemBuilder';

const colors = [{ hex: '#3366cc', name: 'Test Blue' }];

describe('ColorSystemBuilder submission', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onClose: () => void;
  let postMessage: ReturnType<typeof vi.spyOn>;

  const renderModal = (
    combinationName: string,
    documentColorProfile: 'srgb' | 'display-p3' | 'legacy' | 'unknown' = 'srgb'
  ) => {
    act(() => {
      root.render(
        <ColorSystemBuilder
          isOpen
          onClose={onClose}
          colors={colors}
          combinationName={combinationName}
          isDark={false}
          documentColorProfile={documentColorProfile}
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

  const findExactButton = (text: string) =>
    Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.trim() === text
    );

  const advanceToReview = (method = 'Exact Radix') => {
    act(() => findExactButton(method)?.click());
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
    const generateButton = findButton('Create in Figma') as HTMLButtonElement | undefined;

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
    expect(container.querySelector('[data-teul-system-builder="2"]')).not.toBeNull();

    sendOperationResult(request.requestId, true);
    expect(onClose).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Created “Test System”');
    expect(findButton('Create another')).toBeDefined();
  });

  it('re-enables submission after a correlated failure acknowledgement', () => {
    renderModal('Test System');

    advanceToReview();
    act(() => findButton('Create in Figma')?.click());

    const firstRequest = (
      postMessage.mock.calls[0][0] as {
        pluginMessage: { requestId: string };
      }
    ).pluginMessage;

    sendOperationResult(firstRequest.requestId, false, 'Style creation failed');

    const retryButton = findButton('Create in Figma') as HTMLButtonElement | undefined;
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
    act(() => findButton('Create in Figma')?.click());
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

    const sentence = () => container.querySelector('[data-teul-method-sentence]')?.textContent;
    expect(findExactButton('Teul generated')?.getAttribute('aria-pressed')).toBe('true');
    expect(sentence()).toBe('Preserve your source colors and report tested guarantees');

    act(() => findExactButton('Exact Radix')?.click());
    expect(findExactButton('Exact Radix')?.title).toBe('Exact Radix sRGB Solid');
    expect(sentence()).toContain('Delta E OK nearest exact published sRGB solid-scale step');
    expect(sentence()).toContain('source @radix-ui/colors v3.0.0');

    act(() => findExactButton('WCAG tokens')?.click());
    expect(findExactButton('WCAG tokens')?.title).toContain('WCAG-Constrained Tokens');
    expect(sentence()).toContain('block output unless every declared pairing passes');
  });

  it('blocks every on-canvas sRGB color-system mutation outside a confirmed sRGB document', () => {
    renderModal('P3 System', 'display-p3');

    const constrainedButton = findExactButton('WCAG tokens');

    expect(constrainedButton?.disabled).toBe(true);
    expect(constrainedButton?.title).toContain('confirmed sRGB');

    act(() => findExactButton('Exact Radix')?.click());
    act(() => findButton('Continue')?.click());
    expect(container.textContent).toContain('frames, variables, and styles are blocked');
    expect(container.querySelector('[data-teul-profile-status]')?.textContent).toBe(
      'Display P3 document'
    );
    const createButton = findButton('Create in Figma') as HTMLButtonElement | undefined;
    expect(createButton?.disabled).toBe(true);
    expect(container.textContent).toContain('Export remains available');
    act(() => createButton?.click());
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('posts exact Radix source metadata instead of inserting the input color into the scale', () => {
    renderModal('Test System');

    act(() => findExactButton('Exact Radix')?.click());
    expect(container.textContent).toMatch(
      /Exact Radix (light|dark) step \d+ at #[0-9A-F]{6} is nearest by Delta E OK \([0-9.]+\)/
    );
    expect(container.textContent).toContain(
      'the input color is not inserted into the exact Radix scale'
    );

    act(() => findButton('Continue')?.click());
    act(() => findButton('Create in Figma')?.click());

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

    act(() => findExactButton('WCAG tokens')?.click());
    expect(container.textContent).toContain('WCAG 2.2 sRGB semantic color policy: Passed');

    act(() => findButton('Continue')?.click());
    act(() => findButton('Create in Figma')?.click());

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

  it('shapes the system in step 1 and creates it in step 2 inside the plugin window', () => {
    act(() => {
      root.render(
        <ColorSystemBuilder
          isOpen
          onClose={onClose}
          colors={[
            { hex: '#c59a6b', name: 'Raw Sienna' },
            { hex: '#2f4f6b', name: 'Dusky Blue' },
            { hex: '#e8d9a8', name: 'Ivory Buff' },
            { hex: '#7b3a3a', name: 'Maroon' },
          ]}
          combinationName="Raw Sienna Palette"
          isDark
          documentColorProfile="srgb"
        />
      );
    });

    expect(container.textContent).toContain('1 of 2');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    const roleCards = Array.from(container.querySelectorAll('[data-teul-role-card]')).map(card =>
      card.getAttribute('data-teul-role-card')
    );
    expect(roleCards).toEqual(['primary', 'secondary', 'tertiary', 'accent']);
    const rows = Array.from(container.querySelectorAll('[data-teul-scale-row]')).map(row =>
      row.getAttribute('data-teul-scale-row')
    );
    expect(rows).toEqual(['primary', 'secondary', 'tertiary', 'accent', 'neutral']);
    // Light and dark strips per row, each of 12 real engine steps.
    const primaryRow = () => container.querySelector('[data-teul-scale-row="primary"]')!;
    expect(primaryRow().querySelectorAll('[role="img"]')).toHaveLength(2);
    expect(primaryRow().querySelectorAll('[role="img"] > i')).toHaveLength(24);
    const marked = primaryRow().querySelector('[data-teul-source-step]');
    expect(marked?.getAttribute('title')).toBe('Step 9: #c59a6b (your color)');

    // Removing the dark mode removes the dark strips.
    const darkToggle = () =>
      Array.from(container.querySelectorAll('label'))
        .find(label => label.textContent?.includes('Include dark mode'))
        ?.querySelector('input');
    act(() => darkToggle()?.click());
    expect(primaryRow().querySelectorAll('[role="img"]')).toHaveLength(1);
    act(() => darkToggle()?.click());

    // Reassigning the accent drops its scale row.
    const accentSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Role for Maroon"]'
    )!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(
        accentSelect,
        'none'
      );
      accentSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('[data-teul-scale-row="accent"]')).toBeNull();

    expect(container.querySelector('[data-teul-validation] summary')?.textContent).toMatch(
      /^Structure validated · \d+ of \d+ tested pairings pass$/
    );

    act(() => findButton('Continue')?.click());
    expect(container.textContent).toContain('2 of 2');
    const checkbox = (text: string) =>
      Array.from(container.querySelectorAll('label'))
        .find(label => label.textContent?.includes(text))
        ?.querySelector<HTMLInputElement>('input');
    expect(checkbox('Create Figma Variables')?.checked).toBe(true);
    expect(checkbox('Create Figma Color Styles')?.checked).toBe(false);
    expect(container.querySelector('[data-teul-profile-status]')?.textContent).toBe(
      'sRGB document'
    );
    expect(findExactButton('Detailed')?.getAttribute('aria-pressed')).toBe('true');
    act(() => findExactButton('Presentation')?.click());
    expect(container.textContent).toContain('Full framework');

    act(() => findExactButton('CSS')?.click());
    expect(container.querySelector('[data-teul-export-preview]')?.textContent).toContain('--');
    expect(findButton('Copy CSS')).toBeDefined();

    act(() => findButton('Create in Figma')?.click());
    const request = (
      postMessage.mock.calls[0][0] as {
        pluginMessage: { type: string; config: { detailLevel: string; systemName: string } };
      }
    ).pluginMessage;
    expect(request.type).toBe('generate-color-system');
    expect(request.config.detailLevel).toBe('presentation');
    expect(request.config.systemName).toBe('Raw Sienna Palette');
    sendOperationResult(
      (postMessage.mock.calls[0][0] as { pluginMessage: { requestId: string } }).pluginMessage
        .requestId,
      true
    );

    // Back returns to step 1 with the draft intact; step-1 Back leaves the builder.
    act(() =>
      container.querySelector<HTMLButtonElement>('[aria-label="Back to shape the system"]')?.click()
    );
    expect(container.textContent).toContain('1 of 2');
    expect(container.querySelector<HTMLInputElement>('#color-system-name')?.value).toBe(
      'Raw Sienna Palette'
    );
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Back to colors"]')?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('holds Continue until a primary color is chosen', () => {
    renderModal('Test System');
    const primary = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Role for Test Blue"]'
    )!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(
        primary,
        'none'
      );
      primary.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect((findButton('Continue') as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain('Choose a primary color to continue.');
  });

  it('keeps the builder open while Figma works and steps back with Escape', () => {
    renderModal('Test System');
    const region = () => container.querySelector<HTMLElement>('[data-teul-system-builder]')!;
    const escape = () =>
      act(() => {
        region().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

    act(() => findButton('Continue')?.click());
    expect(region().getAttribute('data-teul-system-builder')).toBe('2');
    escape();
    expect(region().getAttribute('data-teul-system-builder')).toBe('1');
    act(() => findButton('Continue')?.click());

    act(() => findButton('Create in Figma')?.click());
    const back = container.querySelector<HTMLButtonElement>(
      '[aria-label="Back to shape the system"]'
    )!;
    expect(back.disabled).toBe(true);
    escape();
    expect(region().getAttribute('data-teul-system-builder')).toBe('2');
    expect(onClose).not.toHaveBeenCalled();

    const requestId = (postMessage.mock.calls[0][0] as { pluginMessage: { requestId: string } })
      .pluginMessage.requestId;
    sendOperationResult(requestId, true);
    expect(back.disabled).toBe(false);
    escape();
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says on step 1 why WCAG tokens is unavailable outside sRGB', () => {
    renderModal('P3 System', 'display-p3');
    expect(container.querySelector('[data-teul-method-blocked]')?.textContent).toBe(
      'WCAG tokens: Requires a confirmed sRGB Figma document (Display P3 reported).'
    );
  });
});
