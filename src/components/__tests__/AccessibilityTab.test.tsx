import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
      'Fluent Text Minimum Reference Font Sizes at Normal Weight (Arial 400)'
    );
    expect(container.textContent).toContain('Lc 75: Minimum Body Text — 16px');
    expect(container.textContent).toContain('Lc 30: Minimum Any text — non-content text only');
    expect(container.textContent).not.toMatch(/Gold|Silver|Bronze/);

    const referenceSample = container.querySelector<HTMLElement>('[data-apca-reference-sample]');
    expect(referenceSample?.style.fontFamily).toContain('Arial');
    expect(referenceSample?.style.fontWeight).toBe('400');

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
});
