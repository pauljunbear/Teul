/// <reference types="node" />
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INTERPRETATION_VERSION,
  parseInterpretationInput,
  type InterpretationResult,
  type InterpretationRuleDefinition,
} from '../../../../services/guideline-intake/src/interpretation';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import {
  bindCapture,
  CAPTURE_VERSION,
  type GuidelineCapture,
  type TextObservation,
} from './evidence';
import { guidelineHash, guidelineOperationIssues } from './review';
import { compileGuidelineReviewV2, suggestGuidelineReviewV2 } from './reviewV2';
import {
  applyGuidelineAssistance,
  readGuidelineAssistanceReceipt,
  prepareGuidelineAssistance,
  type AssistanceOrigin,
  type PreparedGuidelineAssistance,
} from './assistance';
import type { GuidelinePdf } from './pdf';
import { buildGuidelineProjectV2 } from './projectV2';
import { serializeGuidelineWorkspace, readAnyGuidelineProject } from './projectCodec';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';

const hash = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalIntakeJson(value)).digest('hex')}`;
const imageBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=';
function source(): GuidelineCapture {
  const texts: TextObservation[] = [
    '#112233',
    '#336699',
    '#DDBB22',
    'Supporting colors must accompany gold.',
    'Do not use gradients.',
    'Use only these colors.',
    'Blue on a warm field.',
  ].map((text, i) => ({
    id: `text:${i}`,
    kind: 'text',
    text,
    locator: { kind: 'pdf', page: 1, bounds: [0, i * 20, 400, 20] },
  }));
  return bindCapture({
    schemaVersion: CAPTURE_VERSION,
    id: 'synthetic:assistance',
    kind: 'pdf',
    identity: {
      label: 'Synthetic brand guidance',
      locator: null,
      revision: null,
      sha256: `sha256:${'7'.repeat(64)}`,
    },
    capturedAt: '2026-09-25T00:00:00.000Z',
    scope: {
      total: 2,
      requested: ['page:1', 'page:2'],
      inspected: ['page:1'],
      gaps: [
        { scope: 'page:2', code: 'NO_TEXT', message: 'No extractable text on this selected page.' },
      ],
    },
    observations: [
      ...texts,
      ...texts.slice(0, 3).map((item, i) => ({
        id: `color:${i}`,
        kind: 'color' as const,
        literal: item.text,
        value: item.text,
        method: 'stated-hex' as const,
        evidenceRefs: [item.id],
        locator: item.locator,
      })),
    ],
    extractionVersion: 'synthetic:assistance.v1',
  });
}
async function fixture(capture = source()) {
  const prepared = await prepareGuidelineAssistance(capture, { workspaceId: 'review-one' });
  const draft = suggestGuidelineReviewV2(capture);
  draft.colors.forEach((color, i) => {
    color.label = `Original ${i}`;
    color.family = i < 2 ? 'Blue' : 'Gold';
  });
  return { capture, prepared, draft };
}
function response(prepared: PreparedGuidelineAssistance): InterpretationResult {
  return {
    schemaVersion: INTERPRETATION_VERSION,
    sourceDigest: prepared.input.source.digest,
    sourceCaptureHash: prepared.input.source.captureHash,
    colors: [
      {
        observationId: 'color:0',
        label: 'Midnight',
        family: 'Deep Blue',
        evidenceRefs: ['color:0', 'text:0'],
        reason: 'A tentative label for the captured code.',
        basis: 'source-text',
      },
    ],
    scales: [],
    rules: [],
    issues: [],
  };
}
function origin(result: InterpretationResult): AssistanceOrigin {
  return {
    profileId: 'synthetic-pdf-interpretation',
    profileVersion: '1',
    destination: 'Synthetic local processor',
    jobId: '7c22b6d2-cf63-4776-85b4-553755ad17f5',
    outputHash: hash(result),
  };
}
const apply = (f: Awaited<ReturnType<typeof fixture>>, result = response(f.prepared)) =>
  applyGuidelineAssistance({
    capture: f.capture,
    draft: f.draft,
    input: f.prepared.input,
    result,
    origin: origin(result),
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('assisted review evidence and recoverable draft boundary', () => {
  it('prepares exact selected evidence locally, preserving coverage and hashing the detached payload without default images', async () => {
    const fetch = vi.fn(() => {
      throw new Error('Unexpected network access');
    });
    vi.stubGlobal('fetch', fetch);
    const getPage = vi.fn(() => {
      throw new Error('Unexpected preview rendering');
    });
    const capture = source();
    const prepared = await prepareGuidelineAssistance(capture, {
      workspaceId: 'review-one',
      pdf: { document: { getPage } } as unknown as GuidelinePdf,
    });
    expect(prepared.binding).toEqual({
      workspaceId: 'review-one',
      sourceRevision: capture.identity.sha256,
    });
    expect(prepared.input.source).toEqual({
      kind: 'pdf',
      label: capture.identity.label,
      digest: capture.identity.sha256,
      captureHash: capture.captureHash,
      scope: capture.scope.requested,
      inspectedScopes: capture.scope.inspected,
      gaps: capture.scope.gaps,
    });
    expect(prepared.input.observations).toEqual(
      capture.observations.map(item =>
        item.kind === 'text'
          ? { id: item.id, kind: 'text', scope: 'page:1', text: item.text }
          : {
              id: item.id,
              kind: 'color',
              scope: 'page:1',
              notation: `${item.literal} (${item.value})`,
              evidenceRefs: item.evidenceRefs,
            }
      )
    );
    expect(prepared.input.images).toEqual([]);
    expect(prepared.captureHash).toBe(hash(prepared.input));
    expect(prepared.input.source.gaps).not.toBe(capture.scope.gaps);
    expect(Object.isFrozen(prepared.input.observations[0])).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(getPage).not.toHaveBeenCalled();
  });

  it('requires the matching PDF only for explicitly requested previews and respects cancellation', async () => {
    const capture = source();
    await expect(
      prepareGuidelineAssistance(capture, { workspaceId: 'review-one', includeImages: true })
    ).rejects.toThrow('matching PDF');
    await expect(
      prepareGuidelineAssistance(capture, {
        workspaceId: 'review-one',
        includeImages: true,
        pdf: { sha256: `sha256:${'8'.repeat(64)}` } as GuidelinePdf,
      })
    ).rejects.toThrow('matching source PDF');
    await expect(prepareGuidelineAssistance(capture, { workspaceId: '../escape' })).rejects.toThrow(
      'Invalid review workspace'
    );
    const abort = new AbortController();
    abort.abort();
    await expect(
      prepareGuidelineAssistance(capture, { workspaceId: 'review-one', signal: abort.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('never starts a late page render after cancellation while getPage is pending', async () => {
    const capture = source();
    const abort = new AbortController();
    const render = vi.fn();
    const cleanup = vi.fn();
    let release!: (value: unknown) => void;
    const pending = new Promise(resolve => {
      release = resolve;
    });
    const work = prepareGuidelineAssistance(capture, {
      workspaceId: 'review-one',
      includeImages: true,
      signal: abort.signal,
      pdf: {
        sha256: capture.identity.sha256,
        pageCount: 3,
        document: { getPage: () => pending },
      } as unknown as GuidelinePdf,
    });
    abort.abort();
    release({ render, cleanup });
    await expect(work).rejects.toMatchObject({ name: 'AbortError' });
    expect(render).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('rejects changed source identity, selected evidence, capture contents and stale draft bindings', async () => {
    const f = await fixture();
    const result = response(f.prepared);
    const changedInputs = [
      { ...f.prepared.input, source: { ...f.prepared.input.source, label: 'Other source' } },
      {
        ...f.prepared.input,
        source: { ...f.prepared.input.source, scope: ['page:1', 'page:2', 'page:3'] },
      },
      {
        ...f.prepared.input,
        observations: f.prepared.input.observations.map((item, i) =>
          i === 0 ? { ...item, text: 'Changed source text' } : item
        ),
      },
    ];
    for (const input of changedInputs)
      expect(() =>
        applyGuidelineAssistance({
          capture: f.capture,
          draft: f.draft,
          input,
          result,
          origin: origin(result),
        })
      ).toThrow('selected evidence changed');
    expect(() =>
      applyGuidelineAssistance({
        capture: { ...f.capture, observations: [] },
        draft: f.draft,
        input: f.prepared.input,
        result,
        origin: origin(result),
      })
    ).toThrow('changed');
    expect(() =>
      applyGuidelineAssistance({
        capture: f.capture,
        draft: { ...f.draft, captureHash: 'other' },
        input: f.prepared.input,
        result,
        origin: origin(result),
      })
    ).toThrow('source changed');
    expect(() => apply(f, { ...result, sourceDigest: `sha256:${'8'.repeat(64)}` })).toThrow(
      'SOURCE_MISMATCH'
    );
  });

  it('merges partial suggestions while preserving every omitted color, include decision and exact source value', async () => {
    const f = await fixture();
    f.draft.colors[0].include = false;
    const omitted = structuredClone(f.draft.colors.slice(1));
    const out = apply(f);
    expect(out.draft.colors[0]).toEqual({
      observationId: 'color:0',
      include: false,
      label: 'Midnight',
      family: 'Deep Blue',
    });
    expect(out.draft.colors.slice(1)).toEqual(omitted);
    expect(out.draft.colors).toHaveLength(f.draft.colors.length);
    const review = compileGuidelineReviewV2(f.capture, out.draft, {
      kind: 'agent',
      ref: 'synthetic:test-only',
    });
    expect(review.model.colors.map(color => color.valuesByMode.Source.hex).sort()).toEqual([
      '#336699',
      '#DDBB22',
    ]);
    expect(
      f.capture.observations.filter(item => item.kind === 'color').map(item => item.value)
    ).toEqual(['#112233', '#336699', '#DDBB22']);
    expect(out).not.toHaveProperty('model');
    expect(out.draft).not.toHaveProperty('adoptions');
  });

  it('retains omitted lexical restrictions and existing explicit restrictions', async () => {
    const f = await fixture();
    const ban = f.draft.rules.find(rule => rule.observationId === 'text:4')!;
    ban.meaning = 'no-gradients';
    ban.scope = 'brand';
    ban.reason = 'Previously reviewed source restriction.';
    const prior = structuredClone(f.draft.rules);
    const out = apply(f);
    expect(out.draft.rules).toEqual(prior);
    expect(out.draft.rules.some(rule => rule.meaning === 'needs-interpretation')).toBe(true);
    const review = compileGuidelineReviewV2(f.capture, out.draft, {
      kind: 'agent',
      ref: 'synthetic:test-only',
    });
    expect(guidelineOperationIssues(review, 'gradient', 'brand').length).toBeGreaterThan(0);
    expect(guidelineOperationIssues(review, 'extend', 'product').length).toBeGreaterThan(0);
  });

  const definitions: InterpretationRuleDefinition[] = [
    {
      kind: 'required-partner',
      force: 'requirement',
      operands: {
        subject: [{ kind: 'scale', id: 'blue-source' }],
        partner: [{ kind: 'color', id: 'color:2' }],
      },
    },
    {
      kind: 'forbidden-pair',
      force: 'prohibition',
      operands: {
        left: [{ kind: 'scale', id: 'blue-source' }],
        right: [{ kind: 'color', id: 'color:2' }],
        ordered: true,
        relation: 'foreground-background',
      },
    },
    {
      kind: 'prominence',
      force: 'preference',
      operands: {
        kind: 'ordered-groups',
        groups: [[{ kind: 'scale', id: 'blue-source' }], [{ kind: 'color', id: 'color:2' }]],
      },
    },
    {
      kind: 'role-binding',
      force: 'example',
      operands: {
        role: 'accent',
        members: [{ kind: 'scale', id: 'blue-source' }],
        presence: 'if-present',
      },
    },
  ];
  it.each(definitions)(
    'retains source slots and null gaps and remaps $kind scale selectors consistently',
    async definition => {
      const f = await fixture();
      const result = response(f.prepared);
      result.colors[0].family = 'Blue';
      result.scales = [
        {
          id: 'blue-source',
          label: 'Original Blue',
          family: 'Blue',
          slots: [
            { id: '100', position: 100, observationId: 'color:0' },
            { id: '300', position: 300, observationId: null },
            { id: '900', position: 900, observationId: 'color:1' },
          ],
          evidenceRefs: ['color:0', 'color:1'],
          reason: 'Captured anchors with an explicit gap.',
          basis: 'inference',
        },
      ];
      result.rules = [
        {
          observationId: 'text:3',
          meaning: 'relationship',
          scope: 'product',
          definition,
          evidenceRefs: ['text:3'],
          reason: 'Possible relationship from the selected source.',
          basis: 'inference',
        },
      ];
      f.draft.scales = [
        {
          id: 'manual-scale',
          label: 'Manual Gold',
          family: 'Gold',
          slots: [{ id: 'base', position: 10, observationId: 'color:2' }],
          evidenceRefs: ['color:2'],
        },
      ];
      const out = apply(f, result);
      expect(out.draft.scales[0]).toEqual(f.draft.scales[0]);
      const scale = out.draft.scales[1];
      expect(scale.id).not.toBe('blue-source');
      expect(scale.slots).toEqual(result.scales[0].slots);
      const rule = out.draft.rules.find(rule => rule.observationId === 'text:3')!;
      expect(JSON.stringify(rule.definition)).toContain(scale.id);
      expect(JSON.stringify(rule.definition)).not.toContain('"blue-source"');
      expect(rule.reason).toBe(result.rules[0].reason);
      expect(out.receipt.result.rules[0].basis).toBe('inference');
      expect(rule.scope).toBe('product');
      const repeated = apply({ ...f, draft: out.draft }, result);
      expect(repeated.draft.scales).toEqual(out.draft.scales);
      const reviewed = compileGuidelineReviewV2(f.capture, out.draft, {
        kind: 'agent',
        ref: 'synthetic:test-only',
      });
      const compiledScale = reviewed.model.scales.find(item => item.id === scale.id)!;
      expect(compiledScale.slots.map(slot => slot.position)).toEqual([100, 300, 900]);
      expect(compiledScale.modes[0].anchors.map(anchor => anchor.slotId)).toEqual(['100', '900']);
    }
  );

  it.each(['unsupported-rule', 'conflict'] as const)(
    'makes a model-noted %s on unprompted text unresolved',
    async kind => {
      const f = await fixture();
      expect(f.draft.rules.some(rule => rule.observationId === 'text:6')).toBe(false);
      const result = response(f.prepared);
      result.rules = [
        {
          observationId: 'text:6',
          meaning: 'not-a-rule',
          scope: 'brand',
          definition: null,
          evidenceRefs: ['text:6'],
          reason: 'Tentatively dismissed.',
          basis: 'inference',
        },
      ];
      result.issues = [
        {
          kind,
          scope: 'page:1',
          observationIds: ['text:6'],
          imageIds: [],
          note: 'This arrangement may imply a restriction that needs review.',
        },
      ];
      const out = apply(f, result);
      expect(out.draft.rules.find(rule => rule.observationId === 'text:6')).toEqual({
        observationId: 'text:6',
        meaning: 'needs-interpretation',
        scope: 'all',
        definition: null,
        reason: result.issues[0].note,
      });
      const reviewed = compileGuidelineReviewV2(f.capture, out.draft, {
        kind: 'agent',
        ref: 'synthetic:test-only',
      });
      expect(guidelineOperationIssues(reviewed, 'extend', 'brand').length).toBeGreaterThan(0);
    }
  );

  it('blocks visual-only restrictions and scales whose only citation is an image', async () => {
    const f = await fixture();
    f.prepared.input = parseInterpretationInput({
      ...f.prepared.input,
      images: [
        {
          id: 'image:1',
          scope: 'page:1',
          mimeType: 'image/png',
          base64: imageBase64,
          width: 1,
          height: 1,
          sha256: `sha256:${createHash('sha256').update(Buffer.from(imageBase64, 'base64')).digest('hex')}`,
        },
      ],
    });
    const result = response(f.prepared);
    result.issues = [
      {
        kind: 'unsupported-rule',
        scope: 'page:1',
        observationIds: [],
        imageIds: ['image:1'],
        note: 'A visual arrangement might prohibit this combination.',
      },
    ];
    expect(() => apply(f, result)).toThrow(
      'visual restriction or conflict needs source confirmation'
    );
    result.issues = [];
    result.scales = [
      {
        id: 'image-scale',
        label: 'Possible scale',
        family: 'Deep Blue',
        slots: [{ id: 'one', position: 1, observationId: 'color:0' }],
        evidenceRefs: ['image:1'],
        reason: 'Image arrangement.',
        basis: 'visual-example',
      },
    ];
    expect(() => apply(f, result)).toThrow('visual scale needs a source text or color reference');
  });

  it('rejects invented values or extra execution fields before changing a draft', async () => {
    const f = await fixture();
    const before = structuredClone(f.draft);
    const invented = response(f.prepared);
    Object.assign(invented.colors[0], { hex: '#ABCDEF' });
    expect(() => apply(f, invented)).toThrow('INVALID_FIELDS');
    const extra = response(f.prepared);
    Object.assign(extra, { execute: 'fetch(privateSource)' });
    expect(() => apply(f, extra)).toThrow('INVALID_FIELDS');
    const unknown = response(f.prepared);
    unknown.colors[0].observationId = 'new-color';
    expect(() => apply(f, unknown)).toThrow('INVALID_INTERPRETATION_REFERENCE');
    expect(f.draft).toEqual(before);
  });

  it('records origin and stable before/after hashes without mutating capture, draft, input or caller receipt data', async () => {
    const f = await fixture();
    const result = response(f.prepared);
    const callerOrigin = origin(result);
    const before = structuredClone({
      capture: f.capture,
      draft: f.draft,
      input: f.prepared.input,
      result,
    });
    const out = applyGuidelineAssistance({
      capture: f.capture,
      draft: f.draft,
      input: f.prepared.input,
      result,
      origin: callerOrigin,
    });
    expect(out.receipt).toMatchObject({
      schemaVersion: 'teul.guideline-assistance-receipt.v1',
      sourceDigest: f.capture.identity.sha256,
      sourceCaptureHash: f.capture.captureHash,
      beforeDraftHash: guidelineHash(f.draft),
      afterDraftHash: guidelineHash(out.draft),
      origin: callerOrigin,
      result,
    });
    expect(out.receipt.beforeDraftHash).not.toBe(out.receipt.afterDraftHash);
    const { receiptHash, ...content } = out.receipt;
    expect(receiptHash).toBe(guidelineHash(content));
    expect({ capture: f.capture, draft: f.draft, input: f.prepared.input, result }).toEqual(before);
    callerOrigin.destination = 'Changed';
    result.colors[0].label = 'Changed';
    out.draft.colors[0].label = 'Changed';
    expect(out.receipt.origin.destination).toBe('Synthetic local processor');
    expect(out.receipt.result.colors[0].label).toBe('Midnight');
    expect(f.draft.colors[0].label).toBe('Original 0');
  });

  it('prepares selected scanned pages when explicit local previews are the only available evidence', async () => {
    const base = source();
    const { captureHash: _captureHash, ...captured } = base;
    const capture = bindCapture({
      ...captured,
      observations: [],
      scope: {
        ...captured.scope,
        inspected: [],
        gaps: captured.scope.requested.map(scope => ({
          scope,
          code: 'NO_TEXT',
          message: 'Scanned page; no text layer.',
        })),
      },
    });
    const bytes = Buffer.from(imageBase64, 'base64');
    const canvas = {
      width: 0,
      height: 0,
      toBlob(callback: (value: Blob) => void) {
        callback(new Blob([bytes], { type: 'image/png' }));
      },
    };
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    class LocalReader {
      result = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      readAsDataURL(blob: Blob) {
        void blob.arrayBuffer().then(value => {
          this.result = `data:image/png;base64,${Buffer.from(value).toString('base64')}`;
          this.onload?.();
        });
      }
      abort() {
        this.onabort?.();
      }
    }
    vi.stubGlobal('FileReader', LocalReader);
    const cleanup = vi.fn();
    const getPage = vi.fn(async () => ({
      getViewport: () => ({ width: 1, height: 1 }),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      cleanup,
    }));
    const pdf = {
      sha256: capture.identity.sha256,
      pageCount: 2,
      document: { getPage },
    } as unknown as GuidelinePdf;
    const prepared = await prepareGuidelineAssistance(capture, {
      workspaceId: 'review-one',
      includeImages: true,
      pdf,
    });
    expect(prepared.input.observations).toEqual([]);
    expect(prepared.input.images.map(image => image.scope)).toEqual(['page:1', 'page:2']);
    expect(prepared.input.source.gaps).toEqual(capture.scope.gaps);
    expect(prepared.input.source.inspectedScopes).toEqual([]);
    expect(getPage.mock.calls).toEqual([[1], [2]]);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('preserves the aggregate NOT_INSPECTED gap from a partial multi-page PDF capture', async () => {
    const { captureHash: _captureHash, ...base } = source();
    const gap = {
      scope: 'document',
      code: 'NOT_INSPECTED' as const,
      message: 'Five pages were not selected for inspection.',
    };
    const capture = bindCapture({
      ...base,
      scope: { ...base.scope, total: 7, gaps: [...base.scope.gaps, gap] },
    });
    const prepared = await prepareGuidelineAssistance(capture, { workspaceId: 'review-one' });
    expect(prepared.input.source.gaps).toEqual(capture.scope.gaps);
    expect(prepared.input.source.scope).toEqual(['page:1', 'page:2']);
    expect(prepared.input.observations.every(item => item.scope === 'page:1')).toBe(true);
    expect(
      prepared.input.observations.some(
        item => item.kind === 'text' && item.text.includes('Five pages')
      )
    ).toBe(false);
    expect(prepared.captureHash).toBe(hash(prepared.input));
  });

  it('retains a maximum-length rule reason without overflowing the review limit or dropping its basis receipt', async () => {
    const f = await fixture();
    const result = response(f.prepared);
    const reason = 'x'.repeat(4096);
    result.rules = [
      {
        observationId: 'text:3',
        meaning: 'needs-interpretation',
        scope: 'all',
        definition: null,
        reason,
        evidenceRefs: ['text:3'],
        basis: 'inference',
      },
    ];
    const out = apply(f, result);
    expect(out.draft.rules.find(rule => rule.observationId === 'text:3')?.reason).toBe(reason);
    expect(out.receipt.result.rules[0].basis).toBe('inference');
  });

  it('rejects malformed origin IDs, output digests and extra receipt fields', async () => {
    const f = await fixture();
    const result = response(f.prepared);
    const invalid = [
      { ...origin(result), outputHash: 'unverified' },
      { ...origin(result), jobId: 'unknown-job' },
      { ...origin(result), profileId: '../execute' },
      { ...origin(result), profileVersion: '' },
      { ...origin(result), execute: 'upload' },
    ];
    for (const unsafe of invalid)
      expect(() =>
        applyGuidelineAssistance({
          capture: f.capture,
          draft: f.draft,
          input: f.prepared.input,
          result,
          origin: unsafe,
        })
      ).toThrow('Invalid interpretation origin');
  });
});

describe('retained assistance provenance', () => {
  it('retains the historical receipt without changing a later draft or calling a provider', async () => {
    const f = await fixture();
    const out = apply(f);
    const fetch = vi.fn(() => {
      throw new Error('Unexpected network');
    });
    vi.stubGlobal('fetch', fetch);
    const restored = await readGuidelineAssistanceReceipt(
      JSON.parse(JSON.stringify(out.receipt)),
      f.capture
    );
    expect(restored).toEqual(out.receipt);
    expect(fetch).not.toHaveBeenCalled();
    out.draft.colors[0].label = 'Later manual edit';
    expect(restored.afterDraftHash).not.toBe(guidelineHash(out.draft));
    const source = buildGuidelineProjectV2({
      capture: f.capture,
      draft: out.draft,
      review: null,
      selection: null,
    });
    const json = await serializeGuidelineWorkspace(
      JSON.stringify(source),
      EMPTY_GUIDELINE_OUTPUTS,
      restored
    );
    const opened = await readAnyGuidelineProject(json);
    if (opened.status !== 'opened') throw new Error('Fixture');
    expect(opened.value.assistanceReceipt).toEqual(restored);
    expect(opened.value.project.draft.colors[0].label).toBe('Later manual edit');
  });
  it('rejects altered content, forged source, unknown fields and invalid evidence references', async () => {
    const f = await fixture(),
      out = apply(f);
    for (const change of [
      (r: typeof out.receipt) => {
        r.afterDraftHash = guidelineHash('changed');
      },
      (r: typeof out.receipt) => {
        r.sourceDigest = `sha256:${'0'.repeat(64)}`;
      },
      (r: typeof out.receipt) => {
        r.origin.outputHash = `sha256:${'0'.repeat(64)}`;
      },
      (r: typeof out.receipt) => {
        r.result.colors[0].evidenceRefs.push('unknown');
      },
    ]) {
      const value = structuredClone(out.receipt);
      change(value);
      await expect(readGuidelineAssistanceReceipt(value, f.capture)).rejects.toThrow();
    }
    await expect(
      readGuidelineAssistanceReceipt({ ...out.receipt, execute: 'upload' }, f.capture)
    ).rejects.toThrow();
  });
});

it('checks nested rule selectors, evidence basis and issue scope even when all receipt hashes are recomputed', async () => {
  const f = await fixture(),
    out = apply(f);
  for (const change of [
    (r: typeof out.receipt) => {
      r.result.issues.push({
        kind: 'conflict',
        scope: 'page:999',
        observationIds: ['text:0'],
        imageIds: [],
        note: 'Wrong page',
      });
    },
    (r: typeof out.receipt) => {
      r.result.colors[0].basis = 'visual-example';
    },
    (r: typeof out.receipt) => {
      r.result.rules.push({
        observationId: 'text:0',
        meaning: 'relationship',
        scope: 'all',
        reason: 'Bad selector',
        evidenceRefs: ['text:0'],
        basis: 'source-text',
        definition: {
          kind: 'required-partner',
          force: 'requirement',
          operands: {
            subject: [{ kind: 'color', id: 'missing' }],
            partner: [{ kind: 'color', id: 'color:0' }],
          },
        },
      });
    },
  ]) {
    const value = structuredClone(out.receipt);
    change(value);
    value.origin.outputHash = hash(value.result);
    const { receiptHash: _, ...content } = value;
    value.receiptHash = guidelineHash(content);
    await expect(readGuidelineAssistanceReceipt(value, f.capture)).rejects.toThrow();
  }
});
