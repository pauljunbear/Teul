import { describe, expect, it } from 'vitest';
import { bindCaptureV2, CAPTURE_V2_VERSION } from './evidenceV2';
import {
  suggestGuidelineReviewV4,
  compileGuidelineReviewV4,
  type GuidelineReviewDraftV4,
} from './reviewV4';
import {
  bindPdfRegionWitness,
  createTranscribedValue,
  sampleRenderedValue,
  confirmReviewedValue,
  revokeReviewedValue,
  type PdfRegionWitnessInput,
} from './reviewedValues';
import { proposePdfRefresh } from './pdfRefresh';
import { preparePdfReviewedContinuity } from './pdfReviewedContinuity';
import { buildGuidelineProjectV4 } from './projectV4';
import { createGuidelineRefreshLineage, guidelineRefreshContext } from './refreshLineage';
import { readSourceProject, type OpenedSourceProject } from './sourceProjectCodec';
import { previewGuidelineExtension } from './extension';
import { replayGuidelineRefresh } from './refreshReplay';
import { serializeGuidelineWorkspace, readAnyGuidelineProject } from './projectCodec';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';

const actor = { kind: 'user' as const, ref: 'designer' },
  time = '2026-09-26T09:00:00Z';
function source(revision: number, text = 'Ocean must be used together with Light.') {
  return bindCaptureV2({
    schemaVersion: CAPTURE_V2_VERSION,
    id: `source:${revision}`,
    kind: 'pdf',
    identity: {
      label: 'Synthetic scan',
      locator: null,
      revision: null,
      sha256: `sha256:${String(revision).repeat(64)}`,
    },
    capturedAt: time,
    scope: { total: 1, requested: ['page:1'], inspected: ['page:1'], gaps: [] },
    extractionVersion: 'test',
    observations: [
      {
        id: `${revision}:text`,
        kind: 'text',
        text,
        locator: { kind: 'pdf', page: 1, bounds: [0, 0, 100, 20] },
      },
    ],
  });
}
type Source = ReturnType<typeof source>;
function add(
  capture: Source,
  draft: GuidelineReviewDraftV4,
  i: number,
  options: {
    witness?: Partial<PdfRegionWitnessInput>;
    literal?: string;
    sample?: boolean;
    replacesId?: string;
  } = {}
) {
  const witness = bindPdfRegionWitness(capture, {
    schemaVersion: 'teul.pdf-region.v1',
    captureHash: capture.captureHash,
    sourceDigest: capture.identity.sha256,
    page: 1,
    pageSize: { width: 800, height: 600, rotation: 0 },
    bounds: [20 + i * 100, 40, 40, 40],
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
    ...options.witness,
  });
  const candidate = options.sample
    ? sampleRenderedValue(capture, witness, options.replacesId ?? null)
    : createTranscribedValue(
        capture,
        witness,
        options.literal ?? (i === 0 ? '#126E78' : '#F2F6FA'),
        options.replacesId ?? null
      );
  if (!draft.reviewedValues.witnesses.some(w => w.witnessHash === witness.witnessHash))
    draft.reviewedValues.witnesses.push(witness);
  draft.reviewedValues.candidates.push(candidate);
  draft.reviewedValues.confirmations.push(confirmReviewedValue(candidate, actor, time));
  draft.colors.push({
    observationId: candidate.id,
    label: i === 0 ? 'Ocean' : 'Light',
    family: 'Ocean',
    include: true,
  });
  return candidate;
}
function fixture() {
  const previous = source(1),
    capture = source(2),
    old = suggestGuidelineReviewV4(previous);
  const a = add(previous, old, 0),
    b = add(previous, old, 1);
  old.scales = [
    {
      id: 'ocean',
      label: 'Ocean',
      family: 'Ocean',
      evidenceRefs: [a.id, b.id],
      slots: [
        { id: 'dark', position: 0, observationId: a.id },
        { id: 'light', position: 2, observationId: b.id },
      ],
    },
  ];
  old.rules[0] = {
    ...old.rules[0],
    meaning: 'relationship',
    scope: 'brand',
    definition: {
      kind: 'required-partner',
      force: 'requirement',
      operands: {
        subject: [{ kind: 'family', id: 'Ocean' }],
        partner: [{ kind: 'color', id: a.id }],
      },
    },
  };
  const proposal = proposePdfRefresh(previous, old, capture);
  const current = structuredClone({
    ...proposal.draft,
    reviewedValues: { witnesses: [], candidates: [], confirmations: [] },
  }) as GuidelineReviewDraftV4;
  add(capture, current, 0);
  add(capture, current, 1);
  return { previous, capture, old, current, proposal };
}
const run = (f: ReturnType<typeof fixture>) =>
  preparePdfReviewedContinuity(f.previous, f.old, f.capture).compare(f.current);

describe('fresh PDF region continuity', () => {
  it('remaps only newly confirmed identical evidence and restores complete relationships without changing capture comparison bytes', () => {
    const f = fixture(),
      bytes = JSON.stringify(f),
      result = run(f);
    expect(result.candidatePairs.size).toBe(2);
    expect(result.evidencePairs.size).toBe(4);
    expect(result.addedScales).toBe(1);
    expect(result.restoredRules).toBe(1);
    expect(result.restored.scales[0].slots[0].observationId).toBe(
      f.current.colors[0].observationId
    );
    expect(result.restored.rules[0].meaning).toBe('relationship');
    expect(result.restored.reviewedValues).toEqual(f.current.reviewedValues);
    expect(proposePdfRefresh(f.previous, f.old, f.capture).proposalHash).toBe(
      f.proposal.proposalHash
    );
    expect(JSON.stringify(f)).toBe(bytes);
  });
  it.each(['missing', 'revoked', 'excluded', 'replaced'] as const)(
    'cannot retain a %s confirmation on either side',
    change => {
      for (const side of ['old', 'current'] as const) {
        const f = fixture(),
          draft = f[side],
          capture = side === 'old' ? f.previous : f.capture;
        if (change === 'missing') draft.reviewedValues.confirmations.splice(0, 1);
        if (change === 'revoked')
          draft.reviewedValues.confirmations[0] = revokeReviewedValue(
            draft.reviewedValues.confirmations[0],
            actor,
            time,
            'revoked'
          );
        if (change === 'excluded') draft.colors[0].include = false;
        if (change === 'replaced')
          add(capture, draft, 0, { literal: '#126E79', replacesId: draft.colors[0].observationId });
        draft.colors[0].include = false;
        const result = run(f);
        expect(result.candidatePairs.size).toBe(1);
        expect(result.scales).toHaveLength(0);
        expect(result.restoredRules).toBe(0);
      }
    }
  );
  it.each([
    'raster',
    'location',
    'rotation',
    'dimensions',
    'render',
    'method',
    'literal',
    'value',
  ] as const)('refuses changed %s despite otherwise similar colors', change => {
    const f = fixture();
    f.current.colors = [];
    f.current.reviewedValues = { candidates: [], confirmations: [], witnesses: [] };
    const original = f.old.reviewedValues.witnesses[0];
    add(f.capture, f.current, 0, {
      ...(change === 'literal' ? { literal: '#126e78' } : {}),
      ...(change === 'value' ? { literal: '#126E79' } : {}),
      ...(change === 'method' ? { sample: true } : {}),
      witness:
        change === 'raster'
          ? {
              raster: {
                ...original.raster,
                rgbaBase64: btoa(String.fromCharCode(18, 111, 120, 255)),
              },
            }
          : change === 'location'
            ? { bounds: [21, 40, 40, 40] }
            : change === 'rotation'
              ? { pageSize: { ...original.pageSize, rotation: 90 } }
              : change === 'dimensions'
                ? {
                    pageSize: { ...original.pageSize, height: 700 },
                    render: { ...original.render, height: 1400 },
                  }
                : change === 'render'
                  ? { render: { ...original.render, scale: 1, width: 800, height: 600 } }
                  : {},
    });
    add(f.capture, f.current, 1);
    expect(run(f).candidatePairs.size).toBe(1);
    expect(run(f).scales).toHaveLength(0);
  });
  it('rejects same-region ambiguity on either side, copied confirmations and tampered raster hashes', () => {
    for (const side of ['old', 'current'] as const) {
      const f = fixture();
      add(side === 'old' ? f.previous : f.capture, f[side], 0, { sample: true });
      expect(run(f).candidatePairs.size).toBe(1);
    }
    const f = fixture();
    f.current.reviewedValues.confirmations[0] = f.old.reviewedValues.confirmations[0];
    expect(() => run(f)).toThrow();
    const g = fixture();
    g.current.reviewedValues.witnesses[0] = {
      ...g.current.reviewedValues.witnesses[0],
      witnessHash: `sha256:${'a'.repeat(64)}`,
    };
    expect(() => run(g)).toThrow();
  });
  it('preserves later scale and rule edits, and refuses incomplete family or changed text dependencies', () => {
    const f = fixture(),
      restored = run(f).restored;
    f.current.scales = restored.scales.map(s => ({ ...s, label: 'My new scale' }));
    f.current.rules[0] = { ...f.current.rules[0], meaning: 'not-a-rule', reason: 'My decision' };
    expect(run(f).addedScales).toBe(0);
    expect(run(f).restoredRules).toBe(0);
    expect(run(f).restored.scales[0].label).toBe('My new scale');
    const g = fixture();
    add(g.capture, g.current, 2, { literal: '#443366' });
    expect(run(g).candidatePairs.size).toBe(2);
    expect(run(g).restoredRules).toBe(0);
    const h = fixture();
    h.current.colors[1].family = 'New';
    expect(run(h).scales).toHaveLength(0);
    expect(run(h).restoredRules).toBe(0);
    const changed = source(2, 'Use Ocean alone.');
    const draft = suggestGuidelineReviewV4(changed);
    add(changed, draft, 0);
    add(changed, draft, 1);
    expect(
      preparePdfReviewedContinuity(h.previous, h.old, changed).compare(draft).restoredRules
    ).toBe(0);
  });
  it('keeps correspondence and current edits when restoration exceeds capacity', () => {
    const f = fixture(),
      scale = run(f).restored.scales[0];
    f.current.scales = Array.from({ length: 128 }, (_, i) => ({ ...scale, id: `current-${i}` }));
    const result = run(f);
    expect(result.candidatePairs.size).toBe(2);
    expect(result.restorationError).toContain('128-scale limit');
    expect(result.addedScales).toBe(0);
    expect(result.restored).toEqual(f.current);
  });

  it('requires fresh interpretation when source metadata or coverage changes', () => {
    for (const patch of [
      { identity: { ...source(2).identity, label: 'Another source' } },
      { scope: { ...source(2).scope, total: 2 } },
    ]) {
      const f = fixture();
      const { captureHash: _, ...raw } = f.capture;
      const capture = bindCaptureV2({ ...raw, ...patch }),
        current = suggestGuidelineReviewV4(capture);
      add(capture, current, 0);
      add(capture, current, 1);
      expect(
        preparePdfReviewedContinuity(f.previous, f.old, capture).compare(current).candidatePairs
          .size
      ).toBe(0);
    }
  });
  it('restores selected extension paint only after fresh source review and preserves pending save/reopen', async () => {
    const f = fixture();
    f.old.rules = f.old.rules.map(r => ({
      ...r,
      meaning: 'not-a-rule',
      definition: null,
      reason: 'Fixture comparison only.',
    }));
    const oldReview = compileGuidelineReviewV4(f.previous, f.old, actor, time);
    const previous = buildGuidelineProjectV4({
      capture: f.previous,
      draft: f.old,
      review: oldReview,
      selection: null,
    });
    const preview = await previewGuidelineExtension(oldReview, {
      context: 'brand',
      modeId: 'Source',
      scaleId: 'ocean',
      additions: [{ slotId: 'middle', position: 1 }],
      lightnessOrder: 'none',
    });
    expect(preview.status).toBe('proposed');
    const outputs = { ...EMPTY_GUIDELINE_OUTPUTS, extension: { preview, decision: null } };
    const base = proposePdfRefresh(f.previous, f.old, f.capture);
    const pending = buildGuidelineProjectV4({
      capture: f.capture,
      draft: {
        ...base.draft,
        reviewedValues: { witnesses: [], candidates: [], confirmations: [] },
      },
      review: null,
      selection: null,
    });
    const opened = async (project: unknown) => {
      const read = await readSourceProject(JSON.stringify(project));
      if (read.status !== 'opened') throw new Error('Expected project');
      return read.value;
    };
    const next = await opened(pending);
    const lineage = await createGuidelineRefreshLineage(JSON.stringify(previous), outputs, next);
    const restored = preparePdfReviewedContinuity(f.previous, f.old, f.capture).compare({
      ...f.current,
      rules: base.draft.rules,
    }).restored;
    const unreviewed = buildGuidelineProjectV4({
      capture: f.capture,
      draft: restored,
      review: null,
      selection: null,
    });
    const saved = await serializeGuidelineWorkspace(
      JSON.stringify(unreviewed),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      lineage
    );
    const reopened = await readAnyGuidelineProject(saved);
    expect(reopened.status).toBe('opened');
    const review = compileGuidelineReviewV4(f.capture, restored, actor, '2026-09-26T10:00:00Z');
    const fresh = await opened(
      buildGuidelineProjectV4({ capture: f.capture, draft: restored, review, selection: null })
    );
    const context = await guidelineRefreshContext(lineage, fresh);
    expect(context.colorPairs.size).toBe(2);
    expect(context.scaleIds.has('ocean')).toBe(true);
    const replay = await replayGuidelineRefresh(lineage, fresh);
    expect(replay.items.find(item => item.kind === 'extension')?.status).toBe('restorable');
    const paints = (result: typeof preview) =>
      result.generatedBindings.map(
        b => result.workingModel!.colors.find(c => c.id === b.colorId)!.valuesByMode
      );
    expect(paints(replay.outputs.extension!.preview)).toEqual(paints(preview));
    const missing = await opened(unreviewed);
    await expect(replayGuidelineRefresh(lineage, missing as OpenedSourceProject)).rejects.toThrow();
  });
});
