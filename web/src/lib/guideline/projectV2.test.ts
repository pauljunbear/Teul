import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { previewGuidelineExtension } from './extension';
import { describe, expect, it } from 'vitest';
import { bindCapture, CAPTURE_VERSION, type TextObservation } from './evidence';
import { compileGuidelineReview, guidelineHash, suggestGuidelineReview } from './review';
import { buildGuidelineProject, createGuidelineGradient, PROJECT_BYTES } from './project';
import { buildGuidelineProjectV2, readGuidelineProjectAny } from './projectV2';
import {
  compileGuidelineReviewV2,
  guidelineColorIdV2,
  suggestGuidelineReviewV2,
  upgradeGuidelineDraftV2,
} from './reviewV2';
import { gradientCssV1, gradientSvgV1 } from '../../../../src/lib/colorSystemGradientV1';

const text: TextObservation[] = ['#126E78', '#ECBF74', 'Both colors must appear in product.'].map(
  (text, index) => ({
    id: `text:${index}`,
    kind: 'text',
    text,
    locator: { kind: 'pdf', page: 1, bounds: [0, index * 20, 400, 20] },
  })
);
const capture = bindCapture({
  schemaVersion: CAPTURE_VERSION,
  id: 'synthetic:project-v2',
  kind: 'pdf',
  identity: {
    label: 'Synthetic V2 project',
    locator: null,
    revision: null,
    sha256: `sha256:${'4'.repeat(64)}`,
  },
  capturedAt: '2026-09-25T00:00:00.000Z',
  scope: { total: 1, requested: ['page:1'], inspected: ['page:1'], gaps: [] },
  observations: [
    ...text,
    ...text.slice(0, 2).map((item, index) => ({
      id: `observation:${index}`,
      kind: 'color' as const,
      literal: item.text,
      value: item.text,
      method: 'stated-hex' as const,
      evidenceRefs: [item.id],
      locator: item.locator,
    })),
  ],
  extractionVersion: 'synthetic:project-v2.v1',
});
function fixture() {
  const draft = suggestGuidelineReviewV2(capture);
  draft.colors.forEach(color => {
    color.family = 'Original';
  });
  draft.rules[0] = {
    ...draft.rules[0],
    meaning: 'relationship',
    scope: 'product',
    definition: {
      kind: 'required-partner',
      force: 'requirement',
      operands: {
        subject: [{ kind: 'color', id: 'observation:0' }],
        partner: [{ kind: 'color', id: 'observation:1' }],
      },
    },
  };
  draft.scales.push({
    id: 'source-scale',
    label: 'Original sequence',
    family: 'Original',
    slots: [
      { id: 'first', position: 1, observationId: 'observation:0' },
      { id: 'unfilled', position: 12.5, observationId: null },
      { id: 'last', position: 999, observationId: 'observation:1' },
    ],
    evidenceRefs: ['observation:0', 'observation:1'],
  });
  const review = compileGuidelineReviewV2(
    capture,
    draft,
    { kind: 'agent', ref: 'test:project-v2' },
    '2026-09-25T01:00:00.000Z'
  );
  return {
    capture,
    draft,
    review,
    selection: createGuidelineGradient(
      review,
      'brand',
      guidelineColorIdV2('observation:0'),
      guidelineColorIdV2('observation:1'),
      75
    ),
  };
}
const clone = <T>(input: T): T => JSON.parse(JSON.stringify(input));

describe('source structure project V2', () => {
  it('replays the exact structure, reviewer and source-anchored paint with no original PDF', () => {
    const project = buildGuidelineProjectV2(fixture());
    const result = readGuidelineProjectAny(JSON.stringify(project));
    if (result.status !== 'opened') throw new Error('Expected opened project');
    expect(result.project).toEqual(project);
    expect(result.project.schemaVersion).toBe('teul.guideline-project.v2');
    expect(result.project.review?.model.scales[0].slots.map(slot => slot.position)).toEqual([
      1, 12.5, 999,
    ]);
    expect(result.project.review?.decision.actor.kind).toBe('agent');
    expect(Object.isFrozen(result.project.review?.model.scales[0])).toBe(true);
    expect(gradientCssV1(result.project.selection!.design)).toBe(
      gradientCssV1(project.selection!.design)
    );
    expect(gradientSvgV1(result.project.selection!.design)).toBe(
      gradientSvgV1(project.selection!.design)
    );
  });

  it('keeps V1 project and legacy download byte semantics until an explicit draft upgrade', () => {
    const draft = suggestGuidelineReview(capture);
    draft.rules[0].scope = 'product';
    const review = compileGuidelineReview(
      capture,
      draft,
      { kind: 'agent', ref: 'old-reviewer' },
      '2026-09-25T01:00:00.000Z'
    );
    const selection = createGuidelineGradient(review, 'brand', 'color:1', 'color:2', 137.5);
    const original = buildGuidelineProject({ capture, draft, review, selection });
    const opened = readGuidelineProjectAny(JSON.stringify(original));
    expect(opened.status === 'opened' && JSON.stringify(opened.project)).toBe(
      JSON.stringify(original)
    );
    const legacy = readGuidelineProjectAny(JSON.stringify({ capture, review }));
    expect(legacy.status === 'opened' && legacy.format).toBe('legacy-review');
    expect(legacy.status === 'opened' && legacy.project.review).toEqual(review);
    expect(upgradeGuidelineDraftV2(draft)).toEqual({
      ...draft,
      rules: draft.rules.map(rule => ({ ...rule, definition: null })),
      scales: [],
    });
    expect('scales' in draft).toBe(false);
  });

  it('reopens V2 reviewed-source downloads and unfinished structure drafts', () => {
    const { review, draft } = fixture();
    const legacy = readGuidelineProjectAny(JSON.stringify({ capture, review }));
    expect(legacy.status === 'opened' && legacy.format).toBe('legacy-review');
    expect(legacy.status === 'opened' && legacy.project.review).toEqual(review);
    draft.rules[0].definition = null;
    draft.scales[0].label = '';
    const project = buildGuidelineProjectV2({ capture, draft, review: null, selection: null });
    const result = readGuidelineProjectAny(JSON.stringify(project));
    expect(result.status === 'opened' && result.project.draft).toEqual(draft);
    expect(() => compileGuidelineReviewV2(capture, draft, { kind: 'user', ref: 'test' })).toThrow(
      'Complete each'
    );
  });

  it('rejects source-model substitutions, stale structure and stale selected paint even with a new outer digest', () => {
    const project = clone(buildGuidelineProjectV2(fixture()));
    project.review!.model = { ...project.review!.model, scales: [] };
    const { projectHash: _hash, ...content } = project;
    project.projectHash = guidelineHash(content);
    expect(() => readGuidelineProjectAny(JSON.stringify(project))).toThrow(
      'review no longer matches'
    );
    const changed = fixture();
    changed.draft.scales[0].slots[1].position = 13;
    expect(() => buildGuidelineProjectV2(changed)).toThrow('draft changed');
    const paint = clone(fixture());
    paint.selection.design.sourceModelHash = `sha256:${'5'.repeat(64)}`;
    expect(() => buildGuidelineProjectV2(paint)).toThrow('gradient differs');
    expect(() => buildGuidelineProjectV2({ ...fixture(), review: null })).toThrow(
      'requires an applied'
    );
  });

  it('does not activate unknown future projects or accept extra fields in known versions', () => {
    expect(
      readGuidelineProjectAny(
        JSON.stringify({
          schemaVersion: 'teul.guideline-project.v99',
          arbitrary: { execute: true },
        })
      )
    ).toEqual({ status: 'read-only', version: 'teul.guideline-project.v99' });
    expect(() =>
      readGuidelineProjectAny(
        JSON.stringify({ ...buildGuidelineProjectV2(fixture()), credentials: 'synthetic' })
      )
    ).toThrow('unsupported fields');
    expect(() =>
      readGuidelineProjectAny(
        JSON.stringify({ ...buildGuidelineProjectV2(fixture()), projectHash: 'forged' })
      )
    ).toThrow('content changed');
    expect(() => readGuidelineProjectAny(' '.repeat(PROJECT_BYTES + 1))).toThrow('16 MiB');
    let invoked = false;
    const executable = Object.defineProperty({}, 'capture', {
      enumerable: true,
      get: () => {
        invoked = true;
        return capture;
      },
    });
    expect(() => buildGuidelineProjectV2(executable as ReturnType<typeof fixture>)).toThrow(
      'accessors'
    );
    expect(invoked).toBe(false);
  });
});

it('retains an incomplete PDF extension alongside its exact reviewed source and gradient', async () => {
  const source = fixture(),
    project = buildGuidelineProjectV2(source);
  const preview = await previewGuidelineExtension(source.review, {
    context: 'brand',
    scaleId: 'source-scale',
    modeId: 'Source',
    additions: [{ slotId: 'middle', position: 500 }],
    lightnessOrder: 'none',
  });
  expect(preview.status).toBe('incomplete');
  const outputs = { extension: { preview, decision: null }, application: null };
  const opened = await readAnyGuidelineProject(
    await serializeGuidelineWorkspace(JSON.stringify(project), outputs)
  );
  if (opened.status !== 'opened') throw new Error('Fixture');
  expect(opened.value.kind).toBe('pdf');
  expect(opened.value.project).toEqual(project);
  expect(opened.value.outputs).toEqual(outputs);
});
