import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityTab } from '../AccessibilityTab';

describe('AccessibilityTab', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('presents APCA as an experimental use-case guide, not a medal rating', () => {
    act(() => root.render(<AccessibilityTab isDark={false} />));

    expect(container.textContent).toContain('APCA 0.1.9 perceptual Lc (experimental)');
    expect(container.textContent).toContain('Supplemental beta metric');
    expect(container.textContent).toContain('Preferred body text');
    expect(container.textContent).toContain(
      'APCA 0.1.9 Reference-Table Size at Weight 400 (Barlow)'
    );
    expect(container.textContent).toContain('Lc 75: Minimum Body Text — 18px');
    expect(container.textContent).toContain('Lc 30: Minimum Any text — non-content text only');
    expect(container.textContent).not.toMatch(/Gold|Silver|Bronze/);

    expect(container.querySelector('[data-apca-reference-sample]')).toBeNull();
    expect(container.querySelector('[data-apca-reference-metadata]')).not.toBeNull();
    expect(container.textContent).toContain('Numeric supplemental metadata only');
    expect(container.textContent).toContain('does not render an APCA font-size example');

    const links = Array.from(container.querySelectorAll('a')).map(link => link.href);
    expect(links).toContain('https://git.apcacontrast.com/documentation/WhyAPCA');
    expect(links).toContain('https://git.apcacontrast.com/documentation/APCAeasyIntro');
    expect(links).toContain('https://git.apcacontrast.com/documentation/minimum_compliance');
    expect(links).toContain('https://github.com/Myndex/SAPC-APCA/discussions');
  });

  it('uses sex-specific or qualified CVD prevalence labels', () => {
    act(() => root.render(<AccessibilityTab isDark={false} />));

    // Every condition is in the strip at once; each tile names its prevalence.
    const options = Array.from(container.querySelectorAll<HTMLElement>('[data-teul-cvd]')).map(
      tile => tile.title
    );
    expect(options).toHaveLength(8);
    expect(options.find(option => option.startsWith('Normal Vision'))).toContain(
      'no single population-wide percentage'
    );
    expect(options.find(option => option.startsWith('Protanopia'))).toContain('males');
    expect(options.join(' ')).not.toContain('~92% of population');
  });

  it('loads an exact supported text and background pair from the Figma selection', () => {
    const postMessage = vi.spyOn(parent, 'postMessage');
    act(() => root.render(<AccessibilityTab isDark={false} />));

    const useSelection = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Use selection'
    );
    act(() => useSelection?.click());

    const request = postMessage.mock.calls.find(
      call => call[0]?.pluginMessage?.type === 'get-selection-for-accessibility'
    )?.[0].pluginMessage;
    expect(request?.requestId).toEqual(expect.any(String));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'accessibility-selection-result',
              requestId: request.requestId,
              success: true,
              profile: 'srgb',
              foreground: '#123456',
              background: '#FEDCBA',
              foregroundSource: 'Label',
              backgroundSource: 'Card',
            },
          },
        })
      );
    });

    const textInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    );
    expect(textInputs.map(input => input.value)).toEqual(['#123456', '#FEDCBA']);
    expect(container.textContent).toContain('Label on Card · sRGB document');
    expect(container.textContent).toContain(
      'Manual hex and accepted selection values are evaluated as sRGB.'
    );
  });

  it('leaves the existing sRGB result unchanged when selection profile preflight fails', () => {
    const postMessage = vi.spyOn(parent, 'postMessage');
    act(() => root.render(<AccessibilityTab isDark={false} />));

    const useSelection = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Use selection'
    );
    act(() => useSelection?.click());
    const request = postMessage.mock.calls.find(
      call => call[0]?.pluginMessage?.type === 'get-selection-for-accessibility'
    )?.[0].pluginMessage;

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'accessibility-selection-result',
              requestId: request.requestId,
              success: false,
              profile: 'display-p3',
              error: 'WCAG 2.2 selection analysis requires an sRGB Figma document.',
            },
          },
        })
      );
    });

    const textInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    );
    expect(textInputs.map(input => input.value)).toEqual(['#1a1a1a', '#ffffff']);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'requires an sRGB Figma document'
    );
  });

  it('ignores malformed and stale results without consuming the correlated request', () => {
    const postMessage = vi.spyOn(parent, 'postMessage');
    act(() => root.render(<AccessibilityTab isDark={false} />));

    const useSelection = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Use selection'
    );
    act(() => useSelection?.click());
    const request = postMessage.mock.calls.find(
      call => call[0]?.pluginMessage?.type === 'get-selection-for-accessibility'
    )?.[0].pluginMessage;

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'accessibility-selection-result',
              requestId: request.requestId,
              success: true,
              profile: 'srgb',
              foreground: 'not-hex',
              background: '#FFFFFF',
              foregroundSource: 'Malformed',
              backgroundSource: 'Card',
            },
          },
        })
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'accessibility-selection-result',
              requestId: 'stale-request',
              success: true,
              profile: 'srgb',
              foreground: '#000000',
              background: '#FFFFFF',
              foregroundSource: 'Stale',
              backgroundSource: 'Card',
            },
          },
        })
      );
    });

    expect(container.textContent).toContain('Reading…');
    expect(container.textContent).not.toContain('Malformed on Card');
    expect(container.textContent).not.toContain('Stale on Card');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'accessibility-selection-result',
              requestId: request.requestId,
              success: true,
              profile: 'srgb',
              foreground: '#123456',
              background: '#FEDCBA',
              foregroundSource: 'Valid',
              backgroundSource: 'Card',
            },
          },
        })
      );
    });

    expect(container.textContent).toContain('Valid on Card · sRGB document');
    expect(container.textContent).not.toContain('Reading…');
  });

  it('ignores a valid late result issued by an unmounted checker instance', () => {
    const postMessage = vi.spyOn(parent, 'postMessage');
    act(() => root.render(<AccessibilityTab isDark={false} />));

    const firstButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Use selection'
    );
    act(() => firstButton?.click());
    const oldRequest = postMessage.mock.calls.find(
      call => call[0]?.pluginMessage?.type === 'get-selection-for-accessibility'
    )?.[0].pluginMessage;

    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<AccessibilityTab isDark={false} />));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: {
              type: 'accessibility-selection-result',
              requestId: oldRequest.requestId,
              success: true,
              profile: 'srgb',
              foreground: '#123456',
              background: '#FEDCBA',
              foregroundSource: 'Old label',
              backgroundSource: 'Old card',
            },
          },
        })
      );
    });

    const textInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    );
    expect(textInputs.map(input => input.value)).toEqual(['#1a1a1a', '#ffffff']);
    expect(container.textContent).not.toContain('Old label on Old card');
  });

  it('answers first with the sample, ratio and three results, and swaps the pair', () => {
    act(() => root.render(<AccessibilityTab isDark />));

    expect(container.querySelector('[data-teul-contrast-ratio]')?.textContent).toBe('17.40:1');
    expect(
      Array.from(container.querySelectorAll('[data-teul-wcag-result]')).map(node =>
        node.textContent?.replace(/\s+/g, ' ')
      )
    ).toEqual([
      'PassesBody text, AAneeds 4.5:1',
      'PassesBody text, AAAneeds 7:1',
      'PassesLarge text, AAneeds 3:1',
    ]);

    const text = container.querySelector<HTMLInputElement>('input[aria-label="Text hex color"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        text,
        '#999999'
      );
      text.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(
      Array.from(container.querySelectorAll('[data-teul-wcag-result]')).map(node =>
        node.getAttribute('data-teul-wcag-result')
      )
    ).toEqual(['fail', 'fail', 'fail']);

    act(() =>
      container.querySelector<HTMLButtonElement>('[aria-label="Swap text and background"]')?.click()
    );
    const values = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="text"]')
    ).map(input => input.value);
    expect(values).toEqual(['#ffffff', '#999999']);
  });

  it('shows the pair under every vision condition and the severity for anomalies', () => {
    act(() => root.render(<AccessibilityTab isDark={false} />));
    const tiles = container.querySelectorAll<HTMLButtonElement>('[data-teul-cvd]');
    expect(tiles).toHaveLength(8);
    expect(container.querySelector('[aria-label="Adjust severity level"]')).toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('[data-teul-cvd="protanomaly"]')?.click());
    expect(
      container.querySelector('[data-teul-cvd="protanomaly"]')?.getAttribute('aria-pressed')
    ).toBe('true');
    expect(container.querySelector('[aria-label="Adjust severity level"]')).not.toBeNull();
    expect(container.querySelector('[data-teul-cvd-description]')?.textContent).toContain(
      'Protanomaly'
    );
    // The Test colors tool keeps add and remove.
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Add test color"]')?.click());
    expect(container.querySelectorAll('input[aria-label^="Test color"]')).toHaveLength(6);
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Remove color 1"]')?.click());
    expect(container.querySelectorAll('input[aria-label^="Test color"]')).toHaveLength(5);
  });
});
