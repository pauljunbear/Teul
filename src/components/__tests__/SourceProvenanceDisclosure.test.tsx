import * as React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WADA_SOURCE_PROVENANCE, WERNER_SOURCE_PROVENANCE } from '../../lib/sourceProvenance';
import { SourceProvenanceDisclosure } from '../SourceProvenanceDisclosure';

describe('SourceProvenanceDisclosure', () => {
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

  it.each([
    ['Wada', WADA_SOURCE_PROVENANCE],
    ['Werner', WERNER_SOURCE_PROVENANCE],
  ])('preserves the %s disclosure wording, accessibility label, and credit', (_, provenance) => {
    act(() => {
      root.render(<SourceProvenanceDisclosure provenance={provenance} isDark={false} />);
    });

    const summary = container.querySelector('summary');
    expect(summary?.getAttribute('aria-label')).toBe(
      `${provenance.source.title} source provenance`
    );
    expect(summary?.textContent).toContain(provenance.disclosure.label);
    expect(summary?.textContent).toContain(provenance.disclosure.compact);

    const rows = Array.from(container.querySelectorAll('details > div > div'));
    expect(rows.map(row => row.querySelector('strong')?.textContent)).toEqual([
      'Disclosure:',
      'Source:',
      'Profile:',
      'Derivation:',
      'Uncertainty:',
      'Credit:',
    ]);
    expect(container.textContent).toContain(provenance.disclosure.detail);
    expect(container.textContent).toContain(provenance.credit.full);
  });

  it('uses the requested theme', () => {
    act(() => {
      root.render(<SourceProvenanceDisclosure provenance={WADA_SOURCE_PROVENANCE} isDark={true} />);
    });

    expect(container.querySelector('details')?.style.backgroundColor).toBe('rgb(51, 51, 51)');
  });
});
