import { captureColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { sourceSetPdf } from '../../../fixtures/guidelines/source-set-fixture';
import { prepareSourceSetEntry, applySourceSetReview } from './sourceSet';
import { readSourceSetProject, serializeSourceSetProject } from './sourceSetProject';
import { describe, expect, it } from 'vitest';
import figma from '../../../fixtures/guidelines/figma-project-v1.json';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { guidelineHash } from './review';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import {
  generateGuidelineSupportingDirections,
  refineGuidelineSupportingDirection,
} from './supportingDirections';
import {
  createGuidelineAuthoringDraft,
  readGuidelineAuthoringDraft,
  guidelineScaleRequest,
  type GuidelineAuthoringInputs,
} from './authoringDraft';

async function fixture() {
  const opened = await readAnyGuidelineProject(JSON.stringify(figma));
  if (opened.status !== 'opened' || !opened.value.project.review) throw new Error('Fixture');
  const review = opened.value.project.review;
  const modeId = review.model.contexts.find(c => c.id === 'brand')!.modeIds[0];
  const colors = review.model.colors.filter(c => c.valuesByMode[modeId]?.alpha === 1);
  const colorId = colors[0].id;
  const scaleId = review.model.scales[0].id;
  const input: GuidelineAuthoringInputs = {
    activeTask: 'extension',
    extension: {
      operation: 'interior',
      anchorColorId: colorId,
      familyId: '',
      scaleLabel: '',
      polarity: 'light',
      scaleId,
      derivedScaleId: '',
      context: 'brand',
      modeId,
      order: 'none',
      additions: [{ slotId: 'Unfinished', position: '' }],
    },
    supporting: {
      layout: { kind: 'brand', modeId, layout: 'split', primaryShare: 60 },
      provider: 'werner',
      scheme: null,
      relationship: 'nearby',
      anchorColorIds: [colorId],
      excludedCandidateIds: [],
      sourcePaints: { ground: colors.at(-1)!.id, primary: colorId, accent: colors[1].id },
    },
    gradient: {
      controls: {
        scope: 'brand',
        modeId,
        angle: 73,
        route: { space: 'oklch', huePath: 'longer' },
        stops: [
          { colorId, position: 0, locked: true },
          { colorId: colors[1].id, position: 1, locked: false },
        ],
      },
      policy: {
        origin: 'designer-authored',
        use: {
          kind: 'text',
          foregroundColorId: colorId,
          minimumRatio: 4.5,
          footprint: { start: 0, end: 1 },
        },
        limits: [],
      },
      catalog: null,
    },
  };
  return { review, input };
}
function reseal(value: object, field = 'draftHash') {
  const content = { ...value } as Record<string, unknown>;
  delete content[field];
  return { ...content, [field]: guidelineHash(content) };
}
describe('source-bound unfinished design controls', () => {
  it('keeps feedback and refinement through project replay without changing selected output authority', async () => {
    const { review, input } = await fixture();
    const result = await generateGuidelineSupportingDirections(review, input.supporting!);
    const refined = refineGuidelineSupportingDirection(
      review,
      result,
      result.directions[0].id,
      input.supporting!,
      [],
      'source-mismatch',
      'Keep the source relationship.'
    );
    const authoring = createGuidelineAuthoringDraft(review, {
      ...input,
      supporting: refined.request,
      supportingFeedback: refined.feedback,
    });
    const json = await serializeGuidelineWorkspace(JSON.stringify(figma), {
      ...EMPTY_GUIDELINE_OUTPUTS,
      authoring,
    });
    const reopened = await readAnyGuidelineProject(json);
    expect(reopened.status).toBe('opened');
    if (reopened.status !== 'opened') throw new Error('Fixture');
    expect(reopened.value.outputs.authoring).toEqual(authoring);
    expect(reopened.value.outputs.supporting).toBeUndefined();
    const changed = { ...review, reviewHash: guidelineHash('new review') };
    const historical = createGuidelineAuthoringDraft(changed, {
      ...input,
      supportingFeedback: refined.feedback,
    });
    expect(historical.supportingFeedback).toEqual(refined.feedback);
    expect(historical.supportingFeedback![0].reviewHash).not.toBe(historical.reviewHash);
    expect(() =>
      readGuidelineAuthoringDraft(
        reseal({
          ...authoring,
          supportingFeedback: [{ ...refined.feedback[0], requestHash: guidelineHash('wrong') }],
        }),
        review
      )
    ).toThrow();
    const legacy = createGuidelineAuthoringDraft(review, input);
    expect('supportingFeedback' in legacy).toBe(false);
    expect(readGuidelineAuthoringDraft(JSON.parse(JSON.stringify(legacy)), review)).toEqual(legacy);
  });
  it('preserves gradient search choices and old packets without optional search/application fields', async () => {
    const { review, input } = await fixture();
    const old = createGuidelineAuthoringDraft(review, input);
    expect(readGuidelineAuthoringDraft(JSON.parse(JSON.stringify(old)), review)).toEqual(old);
    expect('application' in old).toBe(false);
    expect('search' in old.gradient!).toBe(false);
    const search = {
      sourceAnchorIds: [input.gradient!.controls.stops[0].colorId],
      provider: 'radix' as const,
      scheme: 'dark' as const,
      exploration: 'expressive' as const,
      allowCatalogColors: true,
    };
    const authoring = createGuidelineAuthoringDraft(review, {
      ...input,
      gradient: { ...input.gradient!, search },
    });
    const json = await serializeGuidelineWorkspace(JSON.stringify(figma), {
      ...EMPTY_GUIDELINE_OUTPUTS,
      authoring,
    });
    await readAnyGuidelineProject(json);
    const reopened = await readAnyGuidelineProject(json);
    if (reopened.status !== 'opened') throw new Error('fixture');
    expect(reopened.value.outputs.authoring?.gradient?.search).toEqual(search);
    expect(() =>
      createGuidelineAuthoringDraft(review, {
        ...input,
        gradient: {
          ...input.gradient!,
          search: {
            ...search,
            sourceAnchorIds: [...search.sourceAnchorIds, ...search.sourceAnchorIds],
          },
        },
      })
    ).toThrow();
  });
  it('roundtrips all unfinished controls without creating an output or completing partial numbers', async () => {
    const { review, input } = await fixture();
    const authoring = createGuidelineAuthoringDraft(review, input);
    expect(authoring.extension?.additions[0].position).toBe('');
    expect(() => guidelineScaleRequest(review, authoring.extension!)).toThrow('enter its position');
    const json = await serializeGuidelineWorkspace(JSON.stringify(figma), {
      ...EMPTY_GUIDELINE_OUTPUTS,
      authoring,
    });
    // Consume the one-shot receipt, then prove cold replay of the actual file.
    await readAnyGuidelineProject(json);
    const reopened = await readAnyGuidelineProject(json);
    expect(reopened.status).toBe('opened');
    if (reopened.status !== 'opened') throw new Error('Fixture');
    expect(reopened.value.outputs.authoring).toEqual(authoring);
    expect(reopened.value.outputs.extension).toBeNull();
    expect(reopened.value.outputs.supporting).toBeUndefined();
    expect(reopened.value.gradientSelection).toBeNull();
    expect(JSON.parse(json).sourceProjectJson).toBe(JSON.stringify(figma));
  });
  it('binds the actual background, source scale anchors and text foreground without inventing permission', async () => {
    const { review, input } = await fixture();
    const authoring = createGuidelineAuthoringDraft(review, input);
    const ground = input.supporting!.sourcePaints.ground;
    expect(authoring.briefs.supporting?.input.backgrounds).toEqual([
      {
        id: 'ground',
        sourceColorId: ground,
        value: review.model.colors.find(c => c.id === ground)!.valuesByMode[
          input.supporting!.layout.modeId
        ],
      },
    ]);
    expect(authoring.briefs.extension?.lockedValues.length).toBeGreaterThan(0);
    expect(authoring.briefs.gradient?.input.sourceReferences).toContain(
      input.gradient!.policy!.use.kind === 'text'
        ? input.gradient!.policy!.use.foregroundColorId
        : ''
    );
    expect(authoring).not.toHaveProperty('exportable');
  });
  it('rejects resealed briefs, changed source bindings and non-primitive control enums', async () => {
    const { review, input } = await fixture();
    const authoring = createGuidelineAuthoringDraft(review, input);
    expect(() =>
      readGuidelineAuthoringDraft(
        reseal({ ...authoring, briefs: { ...authoring.briefs, supporting: null } }),
        review
      )
    ).toThrow('differ');
    expect(() =>
      readGuidelineAuthoringDraft(
        reseal({ ...authoring, reviewHash: guidelineHash('different') }),
        review
      )
    ).toThrow('differ');
    expect(() =>
      createGuidelineAuthoringDraft(review, {
        ...input,
        activeTask: ['gradient'],
      } as unknown as GuidelineAuthoringInputs)
    ).toThrow();
    expect(() =>
      createGuidelineAuthoringDraft(review, {
        ...input,
        extension: { ...input.extension!, qualified: true },
      } as GuidelineAuthoringInputs)
    ).toThrow();
  });
  it('can retain an incomplete mode and invalid numeric range for correction, without a bound brief for absent source choices', async () => {
    const { review, input } = await fixture();
    const authoring = createGuidelineAuthoringDraft(review, {
      ...input,
      gradient: {
        ...input.gradient!,
        controls: {
          ...input.gradient!.controls,
          modeId: '',
          stops: input.gradient!.controls.stops.map(s => ({ ...s, position: -1 })),
        },
      },
    });
    expect(authoring.briefs.gradient).toBeNull();
    expect(readGuidelineAuthoringDraft(authoring, review)).toEqual(authoring);
  });
  it('materializes the same scale request as its saved choices, including exact new-scale identity', async () => {
    const { review, input } = await fixture();
    const draft = {
      ...input.extension!,
      operation: 'new-scale' as const,
      scaleLabel: 'My saved scale',
      derivedScaleId: 'saved-scale',
    };
    const authoring = createGuidelineAuthoringDraft(review, { ...input, extension: draft });
    const request = guidelineScaleRequest(review, authoring.extension!);
    expect(request).toMatchObject({
      kind: 'new-scale',
      scaleId: 'saved-scale',
      label: 'My saved scale',
      anchorColorId: draft.anchorColorId,
      modeId: draft.modeId,
    });
    expect(authoring.briefs.extension?.input.sourceReferences).toEqual([draft.anchorColorId]);
  });
  it('rejects authoring data smuggled into a legacy envelope even with a new checksum', async () => {
    const { review, input } = await fixture();
    const json = await serializeGuidelineWorkspace(JSON.stringify(figma), {
      ...EMPTY_GUIDELINE_OUTPUTS,
      authoring: createGuidelineAuthoringDraft(review, input),
    });
    const legacy = reseal(
      { ...JSON.parse(json), schemaVersion: 'teul.guideline-workspace.v8' },
      'bundleHash'
    );
    await expect(readAnyGuidelineProject(JSON.stringify(legacy))).rejects.toThrow();
  });
  it('reuses unchanged brief dependencies across label edits with a captured immutable review', async () => {
    const { review: source, input } = await fixture();
    const review = { ...source, model: captureColorSystemModelV1(source.model) };
    const first = createGuidelineAuthoringDraft(review, input);
    const next = createGuidelineAuthoringDraft(review, {
      ...input,
      extension: { ...input.extension!, scaleLabel: 'Changed label only' },
    });
    expect(next.briefs.extension).toBe(first.briefs.extension);
    expect(next.briefs.supporting).toBe(first.briefs.supporting);
    expect(next.briefs.gradient).toBe(first.briefs.gradient);
    expect(next.draftHash).not.toBe(first.draftHash);
    const anotherReview = createGuidelineAuthoringDraft(
      { ...review, reviewHash: guidelineHash('different decisions') },
      input
    );
    expect(anotherReview.briefs.extension).not.toBe(first.briefs.extension);
    expect(anotherReview.briefs.extension?.reviewHash).not.toBe(first.briefs.extension?.reviewHash);
  });
  it('retains unfinished controls in a combined source set while preserving exact source bytes', async () => {
    const entries = await Promise.all(
      ['A', 'B'].map((label, i) =>
        prepareSourceSetEntry(JSON.stringify(sourceSetPdf(label)), String(i))
      )
    );
    const draft = {
      entries: entries.map(e => e.entry),
      subjects: entries.flatMap(e => e.subjects),
      scope: 'brand' as const,
      resolutions: [],
    };
    const review = await applySourceSetReview(draft, {
      actor: { kind: 'user', ref: 'fixture' },
      reviewedAt: '2026-09-27T12:00:00.000Z',
    });
    const { input } = await fixture();
    const modeId = review.model.contexts.find(c => c.id === 'brand')!.modeIds[0];
    const color = review.model.colors.find(c => c.valuesByMode[modeId])!;
    const authoring = createGuidelineAuthoringDraft(review, {
      activeTask: 'extension',
      extension: {
        ...input.extension!,
        operation: 'new-scale',
        scaleLabel: 'Combined unfinished',
        anchorColorId: color.id,
        scaleId: '',
        modeId,
      },
      supporting: null,
      gradient: null,
    });
    const json = await serializeSourceSetProject({
      draft,
      review,
      outputs: { ...EMPTY_GUIDELINE_OUTPUTS, authoring },
      gradientSelection: null,
    });
    const reopened = await readSourceSetProject(json);
    expect(reopened.status).toBe('opened');
    if (reopened.status !== 'opened') throw new Error('Fixture');
    expect(reopened.value.outputs.authoring).toEqual(authoring);
    expect(reopened.value.draft.entries.map(e => e.projectJson)).toEqual(
      draft.entries.map(e => e.projectJson)
    );
  });
});
