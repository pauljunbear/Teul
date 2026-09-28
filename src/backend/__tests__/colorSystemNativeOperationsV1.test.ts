import { describe, expect, it, vi } from 'vitest';
import { findColorSystemNativeNameCollisionsV1 } from '../colorSystemNativeOperationsV1';

type Named = { name: string };

function nativeNames(collections: Named[] = [], styles: Named[] = [], nodes: Named[] = []) {
  const loadAllPagesAsync = vi.fn(async () => {});
  const getLocalVariableCollectionsAsync = vi.fn(async () => collections);
  const getLocalPaintStylesAsync = vi.fn(async () => styles);
  const page = { name: 'Current page', findAll: () => nodes };
  const api = {
    loadAllPagesAsync,
    variables: { getLocalVariableCollectionsAsync },
    getLocalPaintStylesAsync,
    root: { children: [page] },
  } as unknown as PluginAPI;
  return {
    api,
    page,
    loadAllPagesAsync,
    getLocalVariableCollectionsAsync,
    getLocalPaintStylesAsync,
  };
}

describe('native name collision lookup', () => {
  it('collects exact and legacy matches across every resource kind in sorted order', async () => {
    const document = nativeNames(
      [{ name: 'Collection' }],
      [{ name: 'Style — Color System' }],
      [{ name: 'Node' }, { name: 'Node — Color System' }]
    );
    document.page.name = 'Page — Color System';
    const requested = ['Node', 'Style', 'Page', 'Collection', 'Node', 'Absent'];
    expect(await findColorSystemNativeNameCollisionsV1(document.api, requested)).toEqual([
      'Collection',
      'Node',
      'Page',
      'Style',
    ]);
    expect(document.loadAllPagesAsync).toHaveBeenCalledOnce();
    expect(document.getLocalVariableCollectionsAsync).toHaveBeenCalledOnce();
    expect(document.getLocalPaintStylesAsync).toHaveBeenCalledOnce();
    expect(requested).toEqual(['Node', 'Style', 'Page', 'Collection', 'Node', 'Absent']);
  });

  it('retains direct and legacy ambiguity, duplicate requests, and an empty base name', async () => {
    const document = nativeNames(
      [],
      [],
      [{ name: 'A — Color System' }, { name: ' — Color System' }]
    );
    expect(
      await findColorSystemNativeNameCollisionsV1(document.api, [
        'A — Color System',
        'A',
        '',
        ' — Color System',
        'A',
      ])
    ).toEqual(['', ' — Color System', 'A', 'A — Color System']);
  });

  it('preserves exact case, whitespace and Unicode identity for both match forms', async () => {
    const document = nativeNames(
      [],
      [],
      [
        { name: 'Day' },
        { name: 'day — Color System' },
        { name: ' Day ' },
        { name: 'e\u0301 — Color System' },
        { name: 'BLUE' },
      ]
    );
    expect(
      await findColorSystemNativeNameCollisionsV1(document.api, [
        'Day',
        'day',
        ' Day',
        'é',
        'e\u0301',
        'Blue',
      ])
    ).toEqual(['Day', 'day', 'e\u0301']);
  });

  it('builds fresh requests after loading pages and re-reads the document on every call', async () => {
    const collections = [{ name: 'Before' }];
    const nodes = [{ name: 'Added during load — Color System' }];
    const document = nativeNames(collections, [], nodes);
    const requested = ['Before'];
    document.loadAllPagesAsync.mockImplementationOnce(async () => {
      requested.push('Added during load');
    });
    expect(await findColorSystemNativeNameCollisionsV1(document.api, requested)).toEqual([
      'Added during load',
      'Before',
    ]);
    collections[0].name = 'After — Color System';
    nodes[0].name = 'Unrequested';
    requested.push('After');
    expect(await findColorSystemNativeNameCollisionsV1(document.api, requested)).toEqual(['After']);
    expect(document.loadAllPagesAsync).toHaveBeenCalledTimes(2);
    expect(document.getLocalVariableCollectionsAsync).toHaveBeenCalledTimes(2);
    expect(document.getLocalPaintStylesAsync).toHaveBeenCalledTimes(2);
  });

  it('matches legacy collision semantics for many names and repeated native resources', async () => {
    const requested = Array.from({ length: 512 }, (_, index) => `Tone ${index}`);
    requested.push('Tone 3 — Color System', 'Tone 3', 'Tone 7');
    const actual = Array.from({ length: 2048 }, (_, index) => {
      const base = `Tone ${index % 512}`;
      return index % 3 === 0 ? base : index % 3 === 1 ? `${base} — Color System` : 'Unrequested';
    });
    const expected = [...new Set(requested)].filter(name =>
      actual.some(value => value === name || value === `${name} — Color System`)
    );
    const document = nativeNames(
      [],
      [],
      actual.map(name => ({ name }))
    );
    expect(await findColorSystemNativeNameCollisionsV1(document.api, requested)).toEqual(
      expected.sort()
    );
  });
});
