import { describe, expect, it, vi } from 'vitest';
import legacyV3 from '../../../fixtures/guidelines/legacy-project-v3.json';
import { bindCaptureV2, CAPTURE_V2_VERSION } from './evidenceV2';
import { guidelineOperationIssues } from './review';
import { guidelineColorIdV2 } from './reviewV2';
import { readGuidelineProjectLatest } from './projectV3';
import { createGuidelineGradient } from './project';
import {
  bindPdfRegionWitness,
  createTranscribedValue,
  sampleRenderedValue,
  confirmReviewedValue,
  revokeReviewedValue,
} from './reviewedValues';
import { createGuidelineSourceInventory } from './sourceInventory';
import {
  compileGuidelineReviewV4,
  parseGuidelineDraftV4,
  suggestGuidelineReviewV4,
} from './reviewV4';

const capture = bindCaptureV2({
  schemaVersion: CAPTURE_V2_VERSION,
  id: 'mixed-scan',
  kind: 'pdf',
  identity: {
    label: 'Synthetic scanned guideline',
    locator: null,
    revision: null,
    sha256: `sha256:${'c'.repeat(64)}`,
  },
  capturedAt: '2026-09-25T00:00:00Z',
  scope: {
    total: 1,
    requested: ['page:1'],
    inspected: ['page:1'],
    gaps: [{ scope: 'page:1', code: 'NO_TEXT', message: 'Swatch values require source review' }],
  },
  observations: [
    {
      id: 'rule',
      kind: 'text',
      text: 'Do not use gradients in product.',
      locator: { kind: 'pdf', page: 1, bounds: [0, 0, 400, 20] },
    },
  ],
  extractionVersion: 'test',
});
const actor = { kind: 'user' as const, ref: 'designer' };
const date = '2026-09-25T01:00:00Z';
function fixture() {
  const region = bindPdfRegionWitness(capture, {
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
  const transcribed = createTranscribedValue(
    capture,
    region,
    'color(srgb .123456789012341 .5 .75)'
  );
  const sampled = sampleRenderedValue(capture, region);
  const draft = suggestGuidelineReviewV4(capture);
  draft.reviewedValues = {
    witnesses: [region],
    candidates: [transcribed, sampled],
    confirmations: [transcribed, sampled].map(value => confirmReviewedValue(value, actor, date)),
  };
  draft.colors = [transcribed, sampled].map((value, index) => ({
    observationId: value.id,
    include: true,
    label: `Reviewed ${index}`,
    family: 'Ocean',
  }));
  draft.rules[0] = { ...draft.rules[0], meaning: 'no-gradients', scope: 'product' };
  draft.scales = [
    {
      id: 'ocean',
      label: 'Reviewed source scale',
      family: 'Ocean',
      slots: [
        { id: 'first', position: 10, observationId: transcribed.id },
        { id: 'gap', position: 15, observationId: null },
        { id: 'last', position: 20, observationId: sampled.id },
      ],
      evidenceRefs: [transcribed.id, sampled.id],
    },
  ];
  return { draft, transcribed, sampled };
}

describe('reviewed value compiler V4', () => {
  it('retains validated overlays across structure edits without trusting mutable or executable input', () => {
    const { draft } = fixture();
    const parsed = parseGuidelineDraftV4(capture, draft);
    const decode = vi.spyOn(globalThis, 'atob');
    try {
      const edited = { ...parsed, colors: parsed.colors.map(row => ({ ...row, label: 'Edited' })) };
      expect(parseGuidelineDraftV4(capture, edited).reviewedValues).toBe(parsed.reviewedValues);
      compileGuidelineReviewV4(capture, edited, actor, date);
      expect(decode).not.toHaveBeenCalled();
      let invoked = false;
      const hostile = Object.defineProperty({ ...edited }, 'reviewedValues', {
        enumerable: true,
        get() {
          invoked = true;
          return parsed.reviewedValues;
        },
      });
      expect(() => parseGuidelineDraftV4(capture, hostile)).toThrow('accessors');
      expect(invoked).toBe(false);
      const symbol = { ...edited, [Symbol('extra')]: true };
      expect(() => parseGuidelineDraftV4(capture, symbol)).toThrow('fields');
      const hidden = Object.defineProperty({ ...edited }, 'colors', { enumerable: false });
      expect(() => parseGuidelineDraftV4(capture, hidden)).toThrow('hidden');
      draft.reviewedValues.confirmations.length = 0;
      expect(parsed.reviewedValues.confirmations).toHaveLength(2);
    } finally {
      decode.mockRestore();
    }
  });

  it('compiles confirmed transcription and sampled appearance through the existing model and scales', () => {
    const { draft, transcribed, sampled } = fixture();
    const before = JSON.stringify(capture);
    const review = compileGuidelineReviewV4(capture, draft, actor, date);
    expect(review.schemaVersion).toBe('teul.guideline-review.v4');
    expect(review.model.colors).toHaveLength(2);
    const color = review.model.colors.find(item => item.id === guidelineColorIdV2(transcribed.id))!;
    expect(color.valuesByMode.Source).toEqual(transcribed.value);
    expect(color.claimIds).toHaveLength(1);
    expect(review.model.evidence.find(item => item.id === transcribed.id)).toMatchObject({
      status: 'inferred',
      description: expect.stringMatching(/^User-confirmed transcription:/),
    });
    expect(review.model.evidence.find(item => item.id === sampled.id)).toMatchObject({
      status: 'inferred',
      description: expect.stringMatching(/^Accepted rendered sRGB approximation:/),
    });
    expect(
      review.model.evidence.find(item => item.id.startsWith('reviewed-witness:'))?.status
    ).toBe('observed');
    expect(
      review.model.claims
        .filter(item => item.id.startsWith('reviewed-claim:'))
        .every(item => item.status === 'inferred')
    ).toBe(true);
    expect(review.model.coverage[0].status).toBe('partial');
    expect(review.model.coverage[0].note).toContain('Swatch values require source review');
    expect(review.model.scales[0].slots.map(item => item.position)).toEqual([10, 15, 20]);
    expect(review.model.scales[0].modes[0].anchors).toHaveLength(2);
    expect(guidelineOperationIssues(review, 'gradient', 'product')).toHaveLength(1);
    expect(
      createGuidelineGradient(
        review,
        'brand',
        guidelineColorIdV2(transcribed.id),
        guidelineColorIdV2(sampled.id),
        45
      ).design.stops[0].value
    ).toEqual(transcribed.value);
    expect(JSON.stringify(capture)).toBe(before);
    expect(capture.observations).toHaveLength(1);
  });

  it('does not compile pending, revoked or replaced values and preserves recoverable excluded rows', () => {
    const { draft, transcribed } = fixture();
    draft.reviewedValues.confirmations = [];
    expect(() => compileGuidelineReviewV4(capture, draft, actor, date)).toThrow(
      'Invalid reviewed color'
    );
    draft.colors.forEach(color => {
      color.include = false;
    });
    expect(parseGuidelineDraftV4(capture, draft).colors.every(color => !color.include)).toBe(true);
    const revoked = fixture();
    revoked.draft.reviewedValues.confirmations[0] = revokeReviewedValue(
      revoked.draft.reviewedValues.confirmations[0],
      actor,
      '2026-09-25T02:00:00Z',
      'Source correction'
    );
    expect(() => compileGuidelineReviewV4(capture, revoked.draft, actor, date)).toThrow();
    const replacement = createTranscribedValue(
      capture,
      draft.reviewedValues.witnesses[0],
      '#112233',
      transcribed.id
    );
    draft.reviewedValues.candidates.push(replacement);
    draft.reviewedValues.confirmations = [confirmReviewedValue(transcribed, actor, date)];
    draft.colors[0].include = true;
    expect(() => parseGuidelineDraftV4(capture, draft)).toThrow();
  });

  it('keeps stale scale and relationship references blocked after a correction', () => {
    const { draft, transcribed } = fixture();
    const replacement = createTranscribedValue(
      capture,
      draft.reviewedValues.witnesses[0],
      '#112233',
      transcribed.id
    );
    draft.reviewedValues.candidates.push(replacement);
    draft.reviewedValues.confirmations.push(confirmReviewedValue(replacement, actor, date));
    draft.colors[0].include = false;
    draft.colors.push({
      observationId: replacement.id,
      include: true,
      label: 'Corrected',
      family: 'Ocean',
    });
    expect(() => compileGuidelineReviewV4(capture, draft, actor, date)).toThrow(
      'excluded source color'
    );
    draft.scales[0].slots[0].observationId = replacement.id;
    draft.rules[0] = {
      ...draft.rules[0],
      meaning: 'relationship',
      definition: {
        kind: 'required-partner',
        force: 'requirement',
        operands: {
          subject: [{ kind: 'color', id: transcribed.id }],
          partner: [{ kind: 'color', id: replacement.id }],
        },
      },
    };
    expect(() => compileGuidelineReviewV4(capture, draft, actor, date)).toThrow(
      'missing or excluded'
    );
  });

  it('changes decision/model hashes after source-bound correction and never accepts a removed lexical ban', () => {
    const original = fixture();
    const before = compileGuidelineReviewV4(capture, original.draft, actor, date);
    const changed = fixture();
    const replacement = createTranscribedValue(
      capture,
      changed.draft.reviewedValues.witnesses[0],
      '#112233',
      changed.transcribed.id
    );
    changed.draft.reviewedValues.candidates.push(replacement);
    changed.draft.reviewedValues.confirmations.push(confirmReviewedValue(replacement, actor, date));
    changed.draft.colors[0].include = false;
    changed.draft.colors.push({
      observationId: replacement.id,
      include: true,
      label: 'Corrected',
      family: 'Ocean',
    });
    changed.draft.scales[0].slots[0].observationId = replacement.id;
    const after = compileGuidelineReviewV4(capture, changed.draft, actor, date);
    expect(after.reviewHash).not.toBe(before.reviewHash);
    expect(after.model.modelHash).not.toBe(before.model.modelHash);
    changed.draft.rules = [];
    expect(() => parseGuidelineDraftV4(capture, changed.draft)).toThrow('source rule is missing');
  });

  it('requires captured rows and rejects supplementary authority in old strict readers', () => {
    const legacy = legacyV3.capture;
    const opened = readGuidelineProjectLatest(JSON.stringify(legacyV3));
    if (opened.status !== 'opened') throw new Error('Expected old project');
    expect(JSON.stringify(opened.project)).toBe(JSON.stringify(legacyV3));
    const draft = suggestGuidelineReviewV4(opened.project.capture);
    draft.colors.shift();
    expect(() => parseGuidelineDraftV4(opened.project.capture, draft)).toThrow(
      'source color is missing'
    );
    expect(legacy.schemaVersion).toBe('teul.guideline-capture.v2');
  });

  it('exposes validated immutable color choices while unavailable candidates remain labeled as unconfirmed', () => {
    const { draft } = fixture();
    draft.reviewedValues.confirmations = [];
    const inventory = createGuidelineSourceInventory(capture, draft.reviewedValues);
    const colors = inventory.entries.filter(item => item.kind === 'color');
    expect(colors.every(item => !item.available)).toBe(true);
    expect(colors.every(item => item.description.startsWith('Unconfirmed or revoked'))).toBe(true);
    expect(Object.isFrozen(inventory.entries)).toBe(true);
    expect(colors[0].locator).toEqual({ kind: 'pdf', page: 1, bounds: [20, 30, 50, 50] });
  });
});
