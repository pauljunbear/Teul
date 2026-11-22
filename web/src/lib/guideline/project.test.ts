import { describe, expect, it } from 'vitest';
import { bindCapture, CAPTURE_VERSION, type TextObservation } from './evidence';
import { compileGuidelineReview, guidelineHash, suggestGuidelineReview } from './review';
import {
  buildGuidelineProject,
  createGuidelineGradient,
  readGuidelineProject,
  PROJECT_BYTES,
  PROJECT_VERSION,
} from './project';
import { gradientCssV1, gradientSvgV1 } from '../../../../src/lib/colorSystemGradientV1';

const text: TextObservation[] = [
  '#126E78',
  '#ECBF74',
  'Do not use gradients in product controls.',
].map((text, i) => ({
  id: `text:${i}`,
  kind: 'text',
  text,
  locator: { kind: 'pdf', page: 1, bounds: [0, i * 20, 400, 20] },
}));
const capture = bindCapture({
  schemaVersion: CAPTURE_VERSION,
  id: 'synthetic:project',
  kind: 'pdf',
  identity: {
    label: 'Synthetic project',
    locator: null,
    revision: null,
    sha256: `sha256:${'1'.repeat(64)}`,
  },
  capturedAt: '2026-09-25T00:00:00.000Z',
  scope: {
    total: 2,
    requested: ['page:1'],
    inspected: ['page:1'],
    gaps: [{ scope: 'page:2', code: 'NOT_INSPECTED', message: 'Page 2 was not read.' }],
  },
  observations: [
    ...text,
    ...text.slice(0, 2).map((item, i) => ({
      id: `color:${i}`,
      kind: 'color' as const,
      literal: item.text,
      value: item.text,
      method: 'stated-hex' as const,
      evidenceRefs: [item.id],
      locator: item.locator,
    })),
  ],
  extractionVersion: 'synthetic:project-test.v1',
});
function fixture() {
  const draft = suggestGuidelineReview(capture);
  draft.rules[0].meaning = 'no-gradients';
  draft.rules[0].scope = 'product';
  const review = compileGuidelineReview(
    capture,
    draft,
    { kind: 'agent', ref: 'test:project' },
    '2026-09-25T01:00:00.000Z'
  );
  const selection = createGuidelineGradient(review, 'brand', 'color:1', 'color:2', 137.5);
  return { capture, draft, review, selection };
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('portable guideline project', () => {
  it('reopens source, scoped interpretation and exact selected exports without original PDF bytes', () => {
    const project = buildGuidelineProject(fixture());
    const result = readGuidelineProject(JSON.stringify(project));
    expect(result.status).toBe('opened');
    if (result.status !== 'opened') throw new Error('Expected project');
    expect(result.project).toEqual(project);
    expect(Object.isFrozen(result.project.draft.colors[0])).toBe(true);
    expect(result.project.review?.decision.actor.kind).toBe('agent');
    expect(result.project.review?.model.sources[0].status).toBe('draft');
    expect(gradientCssV1(result.project.selection!.design)).toBe(
      gradientCssV1(project.selection!.design)
    );
    expect(gradientSvgV1(result.project.selection!.design)).toBe(
      gradientSvgV1(project.selection!.design)
    );
    expect(() =>
      createGuidelineGradient(result.project.review!, 'product', 'color:1', 'color:2', 90)
    ).toThrow('Do not use gradients');
  });

  it('preserves unfinished names, missing exclusion explanations and unselected colors as drafts', () => {
    const { draft } = fixture();
    draft.colors[0].label = '';
    draft.colors[1].include = false;
    draft.rules[0].meaning = 'not-a-rule';
    const project = buildGuidelineProject({ capture, draft, review: null, selection: null });
    const result = readGuidelineProject(JSON.stringify(project));
    expect(result.status === 'opened' && result.project.draft).toEqual(draft);
    expect(() => compileGuidelineReview(capture, draft, { kind: 'user', ref: 'test' })).toThrow(
      'Name'
    );
    draft.colors[0].label = 'Ocean';
    expect(() => compileGuidelineReview(capture, draft, { kind: 'user', ref: 'test' })).toThrow(
      'explain'
    );
    const missing = clone(draft);
    missing.colors.pop();
    expect(() =>
      buildGuidelineProject({ capture, draft: missing, review: null, selection: null })
    ).toThrow('source color is missing');
  });

  it('imports the earlier reviewed-source download without converting its actor to human approval', () => {
    const { review } = fixture();
    const result = readGuidelineProject(JSON.stringify({ capture, review }));
    expect(result.status === 'opened' && result.format).toBe('legacy-review');
    expect(result.status === 'opened' && result.project.review).toEqual(review);
    expect(result.status === 'opened' && result.project.selection).toBeNull();
  });

  it('rejects stale drafts, omitted rules and substituted models even if the outer digest is recomputed', () => {
    const stale = fixture();
    stale.draft.colors[0].label = 'Changed after review';
    expect(() => buildGuidelineProject(stale)).toThrow('draft changed');
    const omitted = fixture();
    omitted.draft.rules = [];
    expect(() => buildGuidelineProject(omitted)).toThrow('rule is missing');
    const forged = clone(buildGuidelineProject(fixture()));
    forged.review!.model = { ...forged.review!.model, claims: [] };
    const { projectHash: _hash, ...content } = forged;
    forged.projectHash = guidelineHash(content);
    expect(() => readGuidelineProject(JSON.stringify(forged))).toThrow('review no longer matches');
  });

  it('binds the selected paint, source and scope to the applied review', () => {
    for (const change of [
      (input: ReturnType<typeof fixture>) => {
        input.selection.scope = 'product';
      },
      (input: ReturnType<typeof fixture>) => {
        input.selection.design.sourceModelHash = `sha256:${'2'.repeat(64)}`;
      },
      (input: ReturnType<typeof fixture>) => {
        input.selection.design.stops[0].locked = false;
      },
      (input: ReturnType<typeof fixture>) => {
        const stop = input.selection.design.compiledPaint.stops[0];
        stop.value = { ...stop.value, components: { ...stop.value.components, r: 0.999 } };
      },
    ]) {
      const input = clone(fixture());
      change(input);
      expect(() => buildGuidelineProject(input)).toThrow();
    }
    expect(() => buildGuidelineProject({ ...fixture(), review: null })).toThrow(
      'requires an applied'
    );
  });

  it('retains future formats read-only without activating their fields or accepting unknown current fields', () => {
    expect(
      readGuidelineProject(
        JSON.stringify({
          schemaVersion: 'teul.guideline-project.v99',
          secret: 'inert test fixture',
          arbitrary: { permission: 'execute' },
        })
      )
    ).toEqual({
      status: 'read-only',
      version: 'teul.guideline-project.v99',
    });
    const project = buildGuidelineProject(fixture());
    expect(() =>
      readGuidelineProject(JSON.stringify({ ...project, credentials: 'forbidden' }))
    ).toThrow('unsupported fields');
    expect(() =>
      readGuidelineProject(JSON.stringify({ ...project, schemaVersion: 'another-format' }))
    ).toThrow('Unsupported project');
    expect(() =>
      readGuidelineProject(JSON.stringify({ ...project, projectHash: 'changed' }))
    ).toThrow('content changed');
    expect(project.schemaVersion).toBe(PROJECT_VERSION);
  });

  it('rejects oversized and executable inputs before activating data', () => {
    expect(() => readGuidelineProject(' '.repeat(PROJECT_BYTES + 1))).toThrow('16 MiB');
    let invoked = false;
    const input = Object.defineProperty({}, 'capture', {
      enumerable: true,
      get() {
        invoked = true;
        return capture;
      },
    });
    expect(() => buildGuidelineProject(input as ReturnType<typeof fixture>)).toThrow('accessors');
    expect(invoked).toBe(false);
  });

  it('requires a real timezone-qualified review timestamp rather than a coercible scalar', () => {
    const { draft } = fixture();
    for (const value of [1, null, '2026-09-25T00:00:00', 'September 25, 2026'])
      expect(() =>
        compileGuidelineReview(
          capture,
          draft,
          { kind: 'agent', ref: 'test' },
          value as unknown as string
        )
      ).toThrow('explicit actor and date');
  });
});
