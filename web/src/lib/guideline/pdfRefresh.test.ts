import { describe, expect, it } from 'vitest';
import { bindCapture, CAPTURE_VERSION, type GuidelineCapture } from './evidence';
import { suggestGuidelineReviewFromCapture } from './review';
import { upgradeGuidelineDraftV2, parseGuidelineStructureDraft } from './reviewV2';
import { proposePdfRefresh } from './pdfRefresh';
import {
  bindPdfRegionWitness,
  createTranscribedValue,
  confirmReviewedValue,
} from './reviewedValues';

function capture(
  revision: number,
  patches: {
    blue?: string;
    note?: string;
    ban?: string;
    label?: string;
    duplicate?: boolean;
    remove?: boolean;
    scope?: boolean;
  } = {}
) {
  const lines = [
    patches.blue ?? '#336699',
    '#FFBB33',
    patches.ban ?? 'Do not use gradients.',
    'Blue must be used for actions.',
    patches.note ?? 'An unrelated page.',
  ];
  const texts = lines.map((text, i) => ({
    id: `${revision}:text:${i}`,
    kind: 'text' as const,
    text,
    locator: {
      kind: 'pdf' as const,
      page: i === 4 ? 2 : 1,
      bounds: [0, i * 30, 400, 20] as [number, number, number, number],
    },
  }));
  const colors = texts.slice(0, 2).map((text, i) => ({
    id: `${revision}:color:${i}`,
    kind: 'color' as const,
    literal: text.text,
    value: text.text,
    method: 'stated-hex' as const,
    evidenceRefs: [text.id],
    locator: text.locator,
  }));
  const observations = [...texts, ...colors];
  if (patches.duplicate) observations.push({ ...colors[0], id: `${revision}:color:duplicate` });
  return bindCapture({
    schemaVersion: CAPTURE_VERSION,
    id: `source:${revision}`,
    kind: 'pdf',
    identity: {
      label: patches.label ?? 'Brand guidelines',
      locator: null,
      revision: null,
      sha256: `sha256:${String(revision).repeat(64)}`,
    },
    capturedAt: '2026-09-25T00:00:00.000Z',
    extractionVersion: 'synthetic.v1',
    scope: {
      total: 2,
      requested: patches.scope ? ['page:1'] : ['page:1', 'page:2'],
      inspected: patches.scope ? ['page:1'] : ['page:1', 'page:2'],
      gaps: [],
    },
    observations: observations.filter(
      item =>
        (!patches.remove || item.id !== `${revision}:text:2`) &&
        (!patches.scope || item.locator.page === 1)
    ),
  });
}
function draft(source: GuidelineCapture) {
  const result = upgradeGuidelineDraftV2(suggestGuidelineReviewFromCapture(source));
  result.colors.forEach((item, i) => {
    item.label = ['Ocean', 'Sun'][i];
    item.family = ['Blue', 'Gold'][i];
  });
  result.rules[0].meaning = 'no-gradients';
  result.rules[0].scope = 'product';
  result.rules[1].meaning = 'relationship';
  result.rules[1].definition = {
    kind: 'role-binding',
    force: 'requirement',
    operands: { role: 'action', members: [{ kind: 'family', id: 'Blue' }], presence: 'if-present' },
  };
  result.scales = [
    {
      id: 'gold',
      label: 'Gold scale',
      family: 'Gold',
      slots: [{ id: 'solid', position: 9, observationId: result.colors[1].observationId }],
      evidenceRefs: [result.colors[1].observationId],
    },
  ];
  return result;
}
describe('PDF source refresh proposal', () => {
  it('retains unchanged decisions across a new file hash while only unrelated page evidence changes', () => {
    const previous = capture(1),
      old = draft(previous),
      exact = JSON.stringify(old);
    const result = proposePdfRefresh(
      previous,
      old,
      capture(2, { note: 'A revised unrelated page.' })
    );
    expect(result.retained).toEqual({ colors: 2, rules: 2, scales: 1 });
    expect(result.changes.filter(item => item.status === 'changed')).toHaveLength(1);
    expect(result.draft.colors[0]).toMatchObject({
      observationId: '2:color:0',
      label: 'Ocean',
      family: 'Blue',
      include: true,
    });
    expect(result.draft.scales[0].slots[0].observationId).toBe('2:color:1');
    expect(JSON.stringify(old)).toBe(exact);
    expect('review' in result).toBe(false);
  });
  it('resets a changed color and dependent family rule but retains an unrelated scale and ban', () => {
    const previous = capture(1),
      result = proposePdfRefresh(previous, draft(previous), capture(2, { blue: '#337799' }));
    expect(result.retained).toEqual({ colors: 1, rules: 1, scales: 1 });
    expect(result.draft.colors[0].include).toBe(false);
    expect(result.draft.colors[1].label).toBe('Sun');
    expect(result.draft.rules.map(rule => rule.meaning)).toEqual([
      'no-gradients',
      'needs-interpretation',
    ]);
  });
  it('retains a changed formerly prompted statement for fresh interpretation even when its new text has no keyword', () => {
    const previous = capture(1),
      result = proposePdfRefresh(
        previous,
        draft(previous),
        capture(2, { ban: 'Flat paint is an example.' })
      );
    expect(result.draft.rules.find(rule => rule.observationId === '2:text:2')?.meaning).toBe(
      'needs-interpretation'
    );
    expect(result.retained.rules).toBe(1);
  });
  it('reports removed restrictions and refuses ambiguous evidence instead of matching equal paint', () => {
    const previous = capture(1),
      result = proposePdfRefresh(
        previous,
        draft(previous),
        capture(2, { remove: true, duplicate: true })
      );
    expect(result.changes.filter(item => item.status === 'ambiguous')).toHaveLength(3);
    expect(result.changes.find(item => item.beforeId === '1:text:2')?.status).toBe('removed');
    expect(result.draft.colors.filter(item => item.include).map(item => item.label)).toEqual([
      'Sun',
    ]);
    expect(result.retained.rules).toBe(0);
  });
  it.each([{ label: 'Another brand' }, { scope: true }])(
    'requires fresh decisions for identity/coverage changes: %j',
    change => {
      const previous = capture(1),
        result = proposePdfRefresh(previous, draft(previous), capture(2, change));
      expect(result.retained).toEqual({ colors: 0, rules: 0, scales: 0 });
      expect(result.metadataChanges).not.toHaveLength(0);
      expect(result.draft.colors.every(item => !item.include)).toBe(true);
    }
  );
  it('uses existing strict validators and rejects a forged previous or next capture', () => {
    const previous = capture(1),
      old = draft(previous);
    expect(() =>
      proposePdfRefresh(previous, { ...old, captureHash: 'forged' }, capture(2))
    ).toThrow();
    expect(() =>
      proposePdfRefresh(previous, old, { ...capture(2), captureHash: 'forged' })
    ).toThrow();
    expect(() =>
      parseGuidelineStructureDraft(capture(2), proposePdfRefresh(previous, old, capture(2)).draft)
    ).not.toThrow();
  });
  it('does not carry a unique color through ambiguous cited text evidence', () => {
    const previous = capture(1),
      next = capture(2);
    const { captureHash: _hash, ...input } = next;
    const text = next.observations.find(item => item.id === '2:text:0')!;
    const ambiguous = bindCapture({
      ...input,
      observations: [...next.observations, { ...text, id: 'duplicate-text' }],
    });
    const result = proposePdfRefresh(previous, draft(previous), ambiguous);
    expect(result.changes.find(item => item.beforeId === '1:color:0')?.status).toBe('ambiguous');
    expect(result.draft.colors[0].include).toBe(false);
    expect(result.draft.rules[1].meaning).toBe('needs-interpretation');
  });
  it('retains manual confirmations only in the old project, without rebinding their crops to a new PDF', () => {
    const previous = capture(1);
    const witness = bindPdfRegionWitness(previous, {
      schemaVersion: 'teul.pdf-region.v1',
      captureHash: previous.captureHash,
      sourceDigest: previous.identity.sha256,
      page: 1,
      pageSize: { width: 800, height: 600, rotation: 0 },
      bounds: [20, 30, 40, 40],
      render: {
        engine: 'pdfjs',
        version: '6.3.289',
        scale: 2,
        width: 1600,
        height: 1200,
        colorSpace: 'srgb',
        background: '#FFFFFF',
        sampling: 'nearest-center',
      },
      raster: { width: 1, height: 1, rgbaBase64: btoa(String.fromCharCode(18, 110, 120, 255)) },
    });
    const candidate = createTranscribedValue(previous, witness, '#126E78');
    const old = {
      ...draft(previous),
      reviewedValues: {
        witnesses: [witness],
        candidates: [candidate],
        confirmations: [
          confirmReviewedValue(
            candidate,
            { kind: 'user', ref: 'designer' },
            '2026-09-25T01:00:00Z'
          ),
        ],
      },
    };
    old.colors.push({
      observationId: candidate.id,
      include: true,
      label: 'Manually confirmed',
      family: 'Manual',
    });
    const bytes = JSON.stringify(old);
    const result = proposePdfRefresh(previous, old, capture(2));
    expect(result.reset.manualValues).toBe(1);
    expect(result.draft.colors).toHaveLength(2);
    expect('reviewedValues' in result.draft).toBe(false);
    expect(JSON.stringify(old)).toBe(bytes);
  });
});
