import { describe, expect, it } from 'vitest';
import legacyProjects from '../../../fixtures/guidelines/legacy-projects.json';
import { gradientCssV1, gradientSvgV1 } from '../../../../src/lib/colorSystemGradientV1';
import {
  buildColorSystemSrgbValueV1,
  colorSystemSrgbToCssV1,
} from '../../../../src/lib/colorSystemSrgbValueV1';
import { type TextObservation } from './evidence';
import { bindCaptureV2, CAPTURE_V2_VERSION, type ColorObservationV2 } from './evidenceV2';
import { parseSingleStatedDigitalColor } from './numericEvidence';
import { createGuidelineGradient, PROJECT_BYTES } from './project';
import { readGuidelineProjectAny } from './projectV2';
import {
  buildGuidelineProjectV3,
  readGuidelineProjectLatest,
  type GuidelineProjectInputV3,
} from './projectV3';
import { guidelineHash, guidelineOperationIssues } from './review';
import { guidelineColorIdV2 } from './reviewV2';
import { compileGuidelineReviewV3, suggestGuidelineReviewV3 } from './reviewV3';

const text: TextObservation[] = [
  'color(srgb .123456789012341 .5 .75)',
  'color(srgb .123456789012342 .5 .75)',
  'rgba(18.25,110.5,120.75,.3333333333333333)',
  'rgba(18.25,110.5,120.75,.3333333333333334)',
  '#ECBF74',
  'Do not use gradients in product controls.',
  'Both source colors must appear together in product.',
].map((text, index) => ({
  id: `text:${index}`,
  kind: 'text',
  text,
  locator: { kind: 'pdf', page: 1, bounds: [0, index * 20, 400, 20] },
}));
const capture = bindCaptureV2({
  schemaVersion: CAPTURE_V2_VERSION,
  id: 'synthetic:numeric-project',
  kind: 'pdf',
  identity: {
    label: 'Synthetic numeric source',
    locator: null,
    revision: null,
    sha256: `sha256:${'6'.repeat(64)}`,
  },
  capturedAt: '2026-09-25T00:00:00.000Z',
  scope: {
    total: 2,
    requested: ['page:1'],
    inspected: ['page:1'],
    gaps: [{ scope: 'document', code: 'NOT_INSPECTED', message: 'One page was not selected.' }],
  },
  observations: [
    ...text,
    ...text.slice(0, 5).map((item, index): ColorObservationV2 => ({
      id: `observation:${index}`,
      kind: 'color',
      method: 'stated-digital',
      ...parseSingleStatedDigitalColor(item.text),
      evidenceRefs: [item.id],
      locator: item.locator,
    })),
  ],
  extractionVersion: 'synthetic:numeric-project.v1',
});

function fixture(): GuidelineProjectInputV3 {
  const draft = suggestGuidelineReviewV3(capture);
  draft.colors.forEach((color, index) => {
    color.label = `Source ${index}`;
    color.family = 'Original';
  });
  draft.rules[0] = {
    ...draft.rules[0],
    meaning: 'no-gradients',
    scope: 'product',
    definition: null,
  };
  draft.rules[1] = {
    ...draft.rules[1],
    meaning: 'relationship',
    scope: 'product',
    definition: {
      kind: 'required-partner',
      force: 'requirement',
      operands: {
        subject: [{ kind: 'scale', id: 'original-scale' }],
        partner: [{ kind: 'color', id: 'observation:4' }],
      },
    },
  };
  draft.scales = [
    {
      id: 'original-scale',
      label: 'Original source positions',
      family: 'Original',
      slots: [
        { id: 'first', position: 1, observationId: 'observation:0' },
        { id: 'missing', position: 12.5, observationId: null },
        { id: 'last', position: 999, observationId: 'observation:1' },
      ],
      evidenceRefs: ['text:0', 'text:1'],
    },
  ];
  const review = compileGuidelineReviewV3(
    capture,
    draft,
    { kind: 'agent', ref: 'test:numeric-project' },
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
      guidelineColorIdV2('observation:4'),
      137.5
    ),
  };
}
type Mutable<T> = { -readonly [Key in keyof T]: Mutable<T[Key]> };
const clone = <T>(value: T): Mutable<T> => JSON.parse(JSON.stringify(value));
function rehashProject<T extends { projectHash: string }>(project: T): T {
  const { projectHash: _hash, ...content } = project;
  project.projectHash = guidelineHash(content);
  return project;
}
function nativeColors(input = fixture()) {
  return [0, 1, 2, 3].map(
    index =>
      input.review!.model.colors.find(
        color => color.id === guidelineColorIdV2(`observation:${index}`)
      )!.valuesByMode.Source
  );
}

describe('native source project V3', () => {
  it('replays native channels, alpha, structure and selected source paint without original PDF bytes', () => {
    const project = buildGuidelineProjectV3(fixture());
    const opened = readGuidelineProjectLatest(JSON.stringify(project));
    if (opened.status !== 'opened' || opened.project.schemaVersion !== 'teul.guideline-project.v3')
      throw new Error('Expected V3 project');
    expect(opened.project).toEqual(project);
    expect(JSON.stringify(opened.project)).toBe(JSON.stringify(project));
    const [first, second, alpha1, alpha2] = nativeColors(opened.project);
    expect(first.hex).toBe(second.hex);
    expect(first.components.r).toBe(0.123456789012341);
    expect(second.components.r).toBe(0.123456789012342);
    expect(first.representation!.exactValueHash).not.toBe(second.representation!.exactValueHash);
    expect(alpha1.hex).toBe(alpha2.hex);
    expect(alpha1.components.r).toBe(18.25 / 255);
    expect(alpha1.alpha).toBe(0.3333333333333333);
    expect(alpha2.alpha).toBe(0.3333333333333334);
    expect(alpha1.representation!.exactValueHash).not.toBe(alpha2.representation!.exactValueHash);
    expect(colorSystemSrgbToCssV1(first)).toBe('color(srgb 0.123456789012341 0.5 0.75 / 1)');
    expect(colorSystemSrgbToCssV1(alpha1)).toContain('/ 0.3333333333333333)');
    expect(opened.project.selection!.design.stops[0].value).toEqual(first);
    expect(gradientCssV1(opened.project.selection!.design)).toContain(
      `${first.components.r * 100}%`
    );
    expect(gradientSvgV1(opened.project.selection!.design)).toContain(
      `${first.components.r * 100}%`
    );
    expect(opened.project.review!.model.scales[0].slots.map(slot => slot.position)).toEqual([
      1, 12.5, 999,
    ]);
    expect(
      opened.project.review!.model.scales[0].modes[0].anchors.map(anchor => anchor.slotId)
    ).toEqual(['first', 'last']);
    expect(opened.project.capture.scope.gaps).toEqual(capture.scope.gaps);
    expect(opened.project.review!.decision.actor).toEqual({
      kind: 'agent',
      ref: 'test:numeric-project',
    });
  });

  it('retains source restrictions and refuses a product selection copied from the permitted brand design', () => {
    const input = fixture();
    expect(guidelineOperationIssues(input.review!, 'gradient', 'product')).toHaveLength(2);
    expect(input.review!.model.rules[0].operands).toMatchObject({
      subject: [{ kind: 'scale', id: 'original-scale' }],
    });
    expect(() =>
      createGuidelineGradient(
        input.review!,
        'product',
        guidelineColorIdV2('observation:0'),
        guidelineColorIdV2('observation:4'),
        0
      )
    ).toThrow('Do not use gradients');
    const project = clone(buildGuidelineProjectV3(input));
    project.selection!.scope = 'product';
    expect(() => readGuidelineProjectLatest(JSON.stringify(rehashProject(project)))).toThrow(
      'Do not use gradients'
    );
    expect(() =>
      createGuidelineGradient(
        input.review!,
        'brand',
        guidelineColorIdV2('observation:2'),
        guidelineColorIdV2('observation:4'),
        0
      )
    ).toThrow('opaque');
  });

  it('opens a V3 reviewed-source download and an unfinished native-source project', () => {
    const input = fixture();
    const legacy = readGuidelineProjectLatest(JSON.stringify({ capture, review: input.review }));
    expect(legacy.status === 'opened' && legacy.format).toBe('legacy-review');
    expect(legacy.status === 'opened' && legacy.project.review).toEqual(input.review);
    input.draft.scales[0].label = '';
    input.draft.rules[1].definition = null;
    const project = buildGuidelineProjectV3({ ...input, review: null, selection: null });
    const reopened = readGuidelineProjectLatest(JSON.stringify(project));
    expect(reopened.status === 'opened' && reopened.project.draft).toEqual(input.draft);
    expect(() =>
      compileGuidelineReviewV3(capture, input.draft, { kind: 'user', ref: 'test' })
    ).toThrow('Complete each');
  });

  it.each(['project', 'project2'] as const)(
    'reopens actual pre-refactor %s with exact serialized values and hashes',
    key => {
      expect(legacyProjects.baseline).toBe('edbac863b6ae267a7d4d2c3afd30d46c263718f6');
      const previous = legacyProjects[key];
      const reopened = readGuidelineProjectLatest(JSON.stringify(previous));
      if (reopened.status !== 'opened') throw new Error('Expected legacy project');
      expect(JSON.stringify(reopened.project)).toBe(JSON.stringify(previous));
      expect([
        reopened.project.projectHash,
        reopened.project.review!.reviewHash,
        reopened.project.review!.model.modelHash,
      ]).toEqual([
        previous.projectHash,
        previous.review.reviewHash,
        previous.review.model.modelHash,
      ]);
      expect(
        guidelineOperationIssues(reopened.project.review!, 'gradient', 'product')
      ).toHaveLength(1);
      const envelope = readGuidelineProjectLatest(
        JSON.stringify({ capture: previous.capture, review: previous.review })
      );
      expect(envelope.status === 'opened' && envelope.format).toBe('legacy-review');
      expect(envelope.status === 'opened' && envelope.project.review).toEqual(previous.review);
    }
  );

  it.each(['project', 'project2'] as const)(
    'keeps the old %s codec strict against native-value injection',
    key => {
      const project = clone(legacyProjects[key]);
      const color = project.capture.observations.find(item => item.kind === 'color')!;
      Object.assign(color, { value: nativeColors()[0] });
      const { captureHash: _capture, capturedAt: _time, ...source } = project.capture;
      project.capture.captureHash = guidelineHash(source);
      expect(() => readGuidelineProjectLatest(JSON.stringify(rehashProject(project)))).toThrow();
      expect(() => readGuidelineProjectAny(JSON.stringify(rehashProject(project)))).toThrow();
    }
  );

  it('rejects a stale draft and selected paint, even when the outer project is rehashed', () => {
    const project = clone(buildGuidelineProjectV3(fixture()));
    project.draft.scales[0].slots[1].position = 13;
    expect(() => readGuidelineProjectLatest(JSON.stringify(rehashProject(project)))).toThrow(
      'draft changed'
    );
    const paint = clone(buildGuidelineProjectV3(fixture()));
    paint.selection!.design.stops[0].value = buildColorSystemSrgbValueV1({
      r: 0.123456789012342,
      g: 0.5,
      b: 0.75,
    });
    expect(() => readGuidelineProjectLatest(JSON.stringify(rehashProject(paint)))).toThrow(
      'gradient differs'
    );
    expect(() => buildGuidelineProjectV3({ ...fixture(), review: null })).toThrow(
      'requires an applied'
    );
  });

  it('rejects cached model substitutions and forged model hashes independently of the outer hash', () => {
    const project = clone(buildGuidelineProjectV3(fixture()));
    const first = project.review!.model.colors.find(
      color => color.id === guidelineColorIdV2('observation:0')
    )!;
    first.valuesByMode.Source = buildColorSystemSrgbValueV1({
      r: 0.123456789012342,
      g: 0.5,
      b: 0.75,
    });
    project.review!.model.modelHash = `sha256:${'7'.repeat(64)}`;
    expect(() => readGuidelineProjectLatest(JSON.stringify(rehashProject(project)))).toThrow(
      'review no longer matches'
    );
  });

  it('rejects changed source channels even after recomputing native, capture and project hashes', () => {
    const project = clone(buildGuidelineProjectV3(fixture()));
    const color = project.capture.observations.find(
      item => item.id === 'observation:0'
    ) as ColorObservationV2;
    color.value = buildColorSystemSrgbValueV1({ r: 0.123456789012342, g: 0.5, b: 0.75 });
    const { captureHash: _hash, capturedAt: _time, ...source } = project.capture;
    project.capture.captureHash = guidelineHash(source);
    expect(() => readGuidelineProjectLatest(JSON.stringify(rehashProject(project)))).toThrow(
      'does not match its stated literal'
    );
  });

  it('rejects substituted evidence, dropped native representation and incomplete lexical restrictions', () => {
    const reference = clone(buildGuidelineProjectV3(fixture()));
    const observation = reference.capture.observations.find(
      item => item.id === 'observation:0'
    ) as ColorObservationV2;
    observation.evidenceRefs = ['text:1'];
    expect(() => readGuidelineProjectLatest(JSON.stringify(rehashProject(reference)))).toThrow(
      'cited source text'
    );
    const native = clone(buildGuidelineProjectV3(fixture()));
    const value = native.capture.observations.find(
      item => item.id === 'observation:0'
    ) as ColorObservationV2;
    Reflect.deleteProperty(value.value, 'representation');
    expect(() => readGuidelineProjectLatest(JSON.stringify(rehashProject(native)))).toThrow(
      'does not match its stated literal'
    );
    const input = fixture();
    input.draft.rules.shift();
    expect(() => buildGuidelineProjectV3({ ...input, review: null, selection: null })).toThrow();
  });

  it('detaches mutable inputs, freezes replayed objects and never invokes executable input accessors', () => {
    const input = clone(fixture());
    const before = JSON.stringify(input);
    const project = buildGuidelineProjectV3(input);
    expect(JSON.stringify(input)).toBe(before);
    input.draft.colors[0].label = 'Changed after save';
    const color = input.capture.observations.find(
      item => item.id === 'observation:0'
    ) as Mutable<ColorObservationV2>;
    color.value.components.r = 0;
    expect(project.draft.colors[0].label).toBe('Source 0');
    expect(nativeColors(project)[0].components.r).toBe(0.123456789012341);
    expect(Object.isFrozen(project.capture.observations)).toBe(true);
    expect(Object.isFrozen(nativeColors(project)[0].components)).toBe(true);
    expect(Object.isFrozen(project.review!.decision.draft.scales[0])).toBe(true);
    let invoked = false;
    const executable = Object.defineProperty({}, 'capture', {
      enumerable: true,
      get: () => {
        invoked = true;
        return capture;
      },
    });
    expect(() => buildGuidelineProjectV3(executable as GuidelineProjectInputV3)).toThrow(
      'accessors'
    );
    expect(invoked).toBe(false);
  });

  it('does not activate unknown versions or accept extra known-version fields, bad hashes and oversized files', () => {
    expect(
      readGuidelineProjectLatest(
        JSON.stringify({ schemaVersion: 'teul.guideline-project.v999', execute: true })
      )
    ).toEqual({ status: 'read-only', version: 'teul.guideline-project.v999' });
    const project = buildGuidelineProjectV3(fixture());
    expect(() =>
      readGuidelineProjectLatest(JSON.stringify({ ...project, credential: 'synthetic' }))
    ).toThrow('unsupported fields');
    expect(() =>
      readGuidelineProjectLatest(JSON.stringify({ ...project, projectHash: 'forged' }))
    ).toThrow('content changed');
    const nested = clone(project);
    Object.assign(nested.review!.decision.actor, { approved: true });
    expect(() => readGuidelineProjectLatest(JSON.stringify(rehashProject(nested)))).toThrow(
      'unsupported fields'
    );
    expect(() => readGuidelineProjectLatest(' '.repeat(PROJECT_BYTES + 1))).toThrow('16 MiB');
  });
});
