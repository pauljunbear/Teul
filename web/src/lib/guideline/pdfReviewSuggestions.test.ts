import { describe, expect, it, vi } from 'vitest';
import { bindCapture, CAPTURE_VERSION, type TextObservation } from './evidence';
import { suggestGuidelineReviewV2 } from './reviewV2';
import { parseGuidelineDraftV4, suggestGuidelineReviewV4 } from './reviewV4';
import { bindPdfRegionWitness } from './reviewedValues';
import * as review from './review';
import { applyPdfReviewSuggestions, preparePdfReviewSuggestions } from './pdfReviewSuggestions';

function fixture(
  names = ['Cedar 100', 'Cedar 300', 'Cedar 900'],
  values = ['#112233', '#445566', '#778899']
) {
  const texts: TextObservation[] = names.flatMap((name, i) => [
    {
      id: `name:${i}`,
      kind: 'text' as const,
      text: name,
      locator: {
        kind: 'pdf' as const,
        page: 1,
        bounds: [20, 10 + i * 150, 70, 10] as [number, number, number, number],
      },
    },
    {
      id: `text:${i}`,
      kind: 'text' as const,
      text: `HEX: ${values[i]}`,
      locator: {
        kind: 'pdf' as const,
        page: 1,
        bounds: [20, 40 + i * 150, 80, 10] as [number, number, number, number],
      },
    },
  ]);
  return make(texts, values);
}
function make(texts: TextObservation[], values: string[]) {
  return bindCapture({
    schemaVersion: CAPTURE_VERSION,
    id: 'synthetic:names',
    kind: 'pdf',
    identity: {
      label: 'Synthetic source',
      locator: null,
      revision: null,
      sha256: `sha256:${'1'.repeat(64)}`,
    },
    capturedAt: '2026-09-28T00:00:00Z',
    scope: { total: 1, requested: ['page:1'], inspected: ['page:1'], gaps: [] },
    observations: [
      ...texts,
      ...values.map((value, i) => ({
        id: `color:${i}`,
        kind: 'color' as const,
        literal: value,
        value,
        method: 'stated-hex' as const,
        evidenceRefs: [`text:${i}`],
        locator: texts.find(t => t.id === `text:${i}`)!.locator,
      })),
    ],
    extractionVersion: 'synthetic:names.v1',
  });
}
function textsOf(capture: ReturnType<typeof fixture>) {
  return capture.observations.filter(o => o.kind === 'text');
}

describe('local PDF review proposals', () => {
  it('previews names and printed numbered positions, then preserves values and explicit review state', () => {
    const capture = fixture();
    const before = JSON.stringify(capture);
    const draft = suggestGuidelineReviewV2(capture);
    const preview = preparePdfReviewSuggestions(capture, draft);
    expect(draft.colors.map(c => c.label)).toEqual(['Color 1', 'Color 2', 'Color 3']);
    expect(preview.names.map(n => n.label)).toEqual(['Cedar 100', 'Cedar 300', 'Cedar 900']);
    expect(preview.names.every(n => n.family === 'Cedar')).toBe(true);
    expect(preview.scales[0].slots.map(s => s.position)).toEqual([100, 300, 900]);
    expect(preview.scales[0].evidenceRefs).toContain('name:1');
    const next = applyPdfReviewSuggestions(capture, draft, preview);
    expect(next.rules).toBe(draft.rules);
    expect(next.colors.map(c => c.include)).toEqual(draft.colors.map(c => c.include));
    expect(JSON.stringify(capture)).toBe(before);
    expect(preparePdfReviewSuggestions(capture, next).names).toEqual([]);
    expect(
      applyPdfReviewSuggestions(capture, next, preparePdfReviewSuggestions(capture, next))
    ).toBe(next);
  });
  it('accepts a row name without inventing a family, and is independent of source item order', () => {
    const original = fixture(['Ocean'], ['#112233']);
    const texts = structuredClone(textsOf(original));
    texts[0].locator = { kind: 'pdf', page: 1, bounds: [20, 40, 60, 10] };
    texts[1].locator = { kind: 'pdf', page: 1, bounds: [200, 40, 80, 10] };
    const capture = make(texts.reverse(), ['#112233']);
    const preview = preparePdfReviewSuggestions(capture, suggestGuidelineReviewV2(capture));
    expect(preview.names[0]).toMatchObject({
      label: 'Ocean',
      family: null,
      basis: 'printed-row',
      evidenceRefs: ['name:0', 'text:0'],
    });
    expect(preview.scales).toEqual([]);
  });
  it('abstains on competing titles, prose and split name fragments', () => {
    const initial = fixture(['Ocean'], ['#112233']);
    const cases = [
      [
        ...textsOf(initial),
        {
          id: 'competing',
          kind: 'text' as const,
          text: 'River',
          locator: {
            kind: 'pdf' as const,
            page: 1,
            bounds: [40, 10, 40, 10] as [number, number, number, number],
          },
        },
      ],
      textsOf(initial).map(t => (t.id === 'name:0' ? { ...t, text: 'Use only Ocean' } : t)),
      [
        ...textsOf(initial),
        {
          id: 'fragment',
          kind: 'text' as const,
          text: '500',
          locator: {
            kind: 'pdf' as const,
            page: 1,
            bounds: [93, 10, 20, 10] as [number, number, number, number],
          },
        },
      ],
    ];
    for (const texts of cases) {
      const capture = make(texts, ['#112233']);
      expect(preparePdfReviewSuggestions(capture, suggestGuidelineReviewV2(capture)).names).toEqual(
        []
      );
    }
  });
  it('does not mistake a named print-code value for the color name', () => {
    const original = fixture(['Purple C'], ['#112233']);
    const texts = structuredClone(textsOf(original));
    texts[0].locator = { kind: 'pdf', page: 1, bounds: [20, 24, 60, 10] };
    texts.push({
      id: 'print-field',
      kind: 'text',
      text: 'Pantone:',
      locator: { kind: 'pdf', page: 1, bounds: [20, 10, 60, 10] },
    });
    const capture = make(texts, ['#112233']);
    expect(preparePdfReviewSuggestions(capture, suggestGuidelineReviewV2(capture)).names).toEqual(
      []
    );
  });
  it('abstains on overlapping titles even when one endpoint is closer', () => {
    const original = fixture(['Ocean'], ['#112233']);
    const capture = make(
      [
        ...textsOf(original),
        {
          id: 'overlap',
          kind: 'text',
          text: 'River',
          locator: { kind: 'pdf', page: 1, bounds: [20, 4, 80, 10] },
        },
      ],
      ['#112233']
    );
    expect(preparePdfReviewSuggestions(capture, suggestGuidelineReviewV2(capture)).names).toEqual(
      []
    );
  });
  it('withholds every family and scale if bounded inference could hide a conflicting position', () => {
    const labels = Array.from({ length: 128 }, (_, i) =>
      i === 0
        ? 'Cedar 100'
        : i === 1 || i === 127
          ? 'Cedar 300'
          : i === 2
            ? 'Cedar 900'
            : `Other${i}`
    );
    const values = labels.map((_, i) => (i === 127 ? '#445567' : i === 1 ? '#445566' : '#112233'));
    const texts = [...textsOf(fixture(labels, values))];
    for (let i = 0; i < 600; i++)
      texts.push({
        id: `filler:${i}`,
        kind: 'text',
        text: '0',
        locator: { kind: 'pdf', page: 1, bounds: [1000, 10 + i * 15, 80, 10] },
      });
    const capture = make(texts, values);
    const preview = preparePdfReviewSuggestions(capture, suggestGuidelineReviewV2(capture));
    expect(preview.namedOccurrences).toBeGreaterThan(3);
    expect(preview.limited).toBe(true);
    expect(preview.scales).toEqual([]);
    expect(preview.names.every(name => name.family === null)).toBe(true);
  });
  it('does not conflate distinct printed slot identifiers that have the same numeric position', () => {
    const capture = fixture(
      ['Cedar 01', 'Cedar 1', 'Cedar 3', 'Cedar 9'],
      ['#112233', '#112233', '#445566', '#778899']
    );
    const preview = preparePdfReviewSuggestions(capture, suggestGuidelineReviewV2(capture));
    expect(preview.names).toHaveLength(4);
    expect(preview.scales).toEqual([]);
  });
  it('does not rehash retained rasters during edits, while still binding changed overlay evidence', () => {
    const capture = fixture();
    const draft = suggestGuidelineReviewV4(capture);
    const witness = bindPdfRegionWitness(capture, {
      schemaVersion: 'teul.pdf-region.v1',
      captureHash: capture.captureHash,
      sourceDigest: capture.identity.sha256,
      page: 1,
      pageSize: { width: 800, height: 600, rotation: 0 },
      bounds: [20, 30, 50, 50],
      render: {
        engine: 'pdfjs',
        version: '6.3.289',
        scale: 1,
        width: 800,
        height: 600,
        colorSpace: 'srgb',
        background: '#FFFFFF',
        sampling: 'nearest-center',
      },
      raster: { width: 1, height: 1, rgbaBase64: btoa(String.fromCharCode(18, 110, 120, 255)) },
    });
    draft.reviewedValues.witnesses.push(witness);
    const parsed = parseGuidelineDraftV4(capture, draft);
    const hash = vi.spyOn(review, 'guidelineHash');
    try {
      const preview = preparePdfReviewSuggestions(capture, parsed);
      const edited = {
        ...parsed,
        colors: parsed.colors.map(c => ({ ...c, label: c.label + ' edited' })),
      };
      preparePdfReviewSuggestions(capture, edited);
      expect(hash.mock.calls.filter(([value]) => value === parsed.reviewedValues)).toHaveLength(1);
      expect(() =>
        applyPdfReviewSuggestions(
          capture,
          { ...parsed, reviewedValues: { witnesses: [], candidates: [], confirmations: [] } },
          preview
        )
      ).toThrow('changed');
    } finally {
      hash.mockRestore();
    }
  });
  it('does not merge conflicting same-position declarations or choose a winner', () => {
    const capture = fixture(
      ['Cedar 100', 'Cedar 300', 'Cedar 300', 'Cedar 900'],
      ['#112233', '#445566', '#445567', '#778899']
    );
    const preview = preparePdfReviewSuggestions(capture, suggestGuidelineReviewV2(capture));
    expect(preview.names).toHaveLength(4);
    expect(preview.names.every(n => n.family === null)).toBe(true);
    expect(preview.scales).toEqual([]);
  });
  it('retains equivalent repeated declarations as evidence for one printed position', () => {
    const capture = fixture(
      ['Cedar 100', 'Cedar 300', 'Cedar 300', 'Cedar 900'],
      ['#112233', '#445566', '#445566', '#778899']
    );
    const draft = suggestGuidelineReviewV2(capture);
    const preview = preparePdfReviewSuggestions(capture, draft);
    expect(preview.names).toHaveLength(4);
    expect(preview.scales[0].slots).toHaveLength(3);
    expect(preview.scales[0].evidenceRefs).toEqual(
      expect.arrayContaining(['color:1', 'color:2', 'name:1', 'name:2'])
    );
    expect(applyPdfReviewSuggestions(capture, draft, preview).colors).toHaveLength(4);
  });
  it('protects authored names, families, scales and inclusion, including the V4 overlay', () => {
    const capture = fixture();
    const draft = suggestGuidelineReviewV4(capture);
    draft.colors[0].label = 'My chosen name';
    draft.colors[1].family = 'Custom';
    draft.colors[2].include = false;
    const preview = preparePdfReviewSuggestions(capture, draft);
    expect(preview.scales).toEqual([]);
    const next = applyPdfReviewSuggestions(capture, draft, preview);
    expect(next.colors[0]).toEqual(draft.colors[0]);
    expect(next.colors[1].family).toBe('Custom');
    expect(next.colors[2].include).toBe(false);
    expect(next.reviewedValues).toBe(draft.reviewedValues);
    const clean = suggestGuidelineReviewV2(capture);
    const series = preparePdfReviewSuggestions(capture, clean).scales;
    clean.scales = series;
    expect(preparePdfReviewSuggestions(capture, clean).scales).toEqual([]);
  });
  it('rejects stale or tampered previews before changing fields', () => {
    const capture = fixture();
    const draft = suggestGuidelineReviewV2(capture);
    const preview = preparePdfReviewSuggestions(capture, draft);
    const changed = structuredClone(draft);
    changed.colors[0].include = false;
    expect(() => applyPdfReviewSuggestions(capture, changed, preview)).toThrow('changed');
    const tampered = structuredClone(preview);
    tampered.names[0].label = 'Invented';
    expect(() => applyPdfReviewSuggestions(capture, draft, tampered)).toThrow('changed');
    expect(() =>
      applyPdfReviewSuggestions(
        fixture(['Different 100', 'Different 300', 'Different 900']),
        draft,
        preview
      )
    ).toThrow();
  });
});
