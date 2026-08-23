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

    const referenceSample = container.querySelector<HTMLElement>('[data-apca-reference-sample]');
    expect(referenceSample?.style.fontFamily).toBe('sans-serif');
    expect(referenceSample?.style.fontWeight).toBe('400');
    expect(container.textContent).toContain('iframe does not prove the Barlow reference face');

    const links = Array.from(container.querySelectorAll('a')).map(link => link.href);
    expect(links).toContain('https://git.apcacontrast.com/documentation/WhyAPCA');
    expect(links).toContain('https://git.apcacontrast.com/documentation/APCAeasyIntro');
    expect(links).toContain('https://git.apcacontrast.com/documentation/minimum_compliance');
    expect(links).toContain('https://github.com/Myndex/SAPC-APCA/discussions');
  });

  it('uses sex-specific or qualified CVD prevalence labels', () => {
    act(() => root.render(<AccessibilityTab isDark={false} />));

    const options = Array.from(container.querySelectorAll('option')).map(
      option => option.textContent ?? ''
    );
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
      button => button.textContent === 'Use Selection'
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
      button => button.textContent === 'Use Selection'
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
      button => button.textContent === 'Use Selection'
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
      button => button.textContent === 'Use Selection'
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
});
