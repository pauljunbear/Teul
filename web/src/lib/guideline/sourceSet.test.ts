import { describe, expect, it } from 'vitest';
import figma from '../../../fixtures/guidelines/figma-project-v1.json';
import website from '../../../fixtures/guidelines/website-capture.json';
import { createWebsiteInventory } from './websiteInventory';
import { compileWebsiteReview, suggestWebsiteReview } from './websiteReview';
import { buildWebsiteProject } from './websiteProject';
import {
  sourceSetActor as actor,
  sourceSetTime as reviewedAt,
  sourceSetPdf,
} from '../../../fixtures/guidelines/source-set-fixture';
import {
  applySourceSetReview,
  inspectSourceSet,
  prepareSourceSetEntry,
  parseSourceSetDraft,
  type SourceSetDraft,
} from './sourceSet';
import { readSourceSetProject, serializeSourceSetProject } from './sourceSetProject';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import { guidelineHash, guidelineOperationIssues } from './review';
import { guidelineGenerationIssues } from './generationReview';
import { compileColorSystemRelationshipsV1 } from '../../../../src/lib/colorSystemRelationshipsV1';
import { createGuidelineAuthoredGradient } from './authoredGradient';
import { previewGuidelineExtension, reviewGuidelineExtension } from './extension';
import { createGuidelineExtensionDecision } from './extensionRuleReview';
import { compileGuidelineReviewV3 } from './reviewV3';
import { buildGuidelineProjectV3 } from './projectV3';

async function setup(second = sourceSetPdf('PDF B', '#334455'), first = sourceSetPdf()) {
  const a = await prepareSourceSetEntry(JSON.stringify(first), 'a');
  const b = await prepareSourceSetEntry(JSON.stringify(second), 'b');
  return {
    entries: [a.entry, b.entry],
    subjects: [...a.subjects, ...b.subjects],
    scope: 'brand',
    resolutions: [],
  } as SourceSetDraft;
}
async function resolve(draft: SourceSetDraft) {
  const inspect = await inspectSourceSet(draft);
  return {
    ...draft,
    resolutions: inspect.subjects
      .filter(s => s.conflicting)
      .map(s => ({
        subject: s.subject,
        memberHash: s.memberHash,
        chosen: { entryId: s.members[0].entryId, colorId: s.members[0].colorId },
        reason: 'Use the explicitly selected PDF value for this work.',
      })),
  };
}
const apply = (draft: SourceSetDraft) => applySourceSetReview(draft, { actor, reviewedAt });
const reseal = (raw: Record<string, unknown>) => {
  const { projectHash: _hash, ...content } = raw;
  return JSON.stringify({ ...content, projectHash: guidelineHash(content) });
};

describe('reviewed multi-source working palette', () => {
  it('keeps both observations and methods while unresolved conflict blocks generation and gradients', async () => {
    const draft = await setup(),
      before = JSON.stringify(draft),
      inspect = await inspectSourceSet(draft);
    expect(inspect.subjects).toHaveLength(3);
    expect(inspect.model.conflicts).toHaveLength(1);
    expect(inspect.model.conflicts[0].claimIds).toHaveLength(2);
    expect(inspect.model.adoptions).toEqual([]);
    expect(inspect.model.evidence.some(e => e.description.includes('stated'))).toBe(true);
    const review = await apply(draft);
    expect(guidelineGenerationIssues(review.model, 'brand', 'Working').map(i => i.code)).toContain(
      'SOURCE_CONFLICT_REQUIRED'
    );
    expect(guidelineOperationIssues(review, 'gradient', 'brand', 'Working').length).toBeGreaterThan(
      0
    );
    expect(JSON.stringify(draft)).toBe(before);
  });
  it.each(['color', 'family', 'scale'] as const)(
    'keeps the losing source %s prohibition attached to the chosen paint',
    async selector => {
      const draft = await resolve(await setup(sourceSetPdf('PDF B', '#334455', selector))),
        review = await apply(draft);
      const blue = review.model.colors.find(c => c.label === 'blue')!,
        gold = review.model.colors.find(c => c.label === 'gold')!;
      expect(blue.valuesByMode.Working.hex).toBe('#123456');
      const result = compileColorSystemRelationshipsV1(review.model).evaluate({
        id: 'proof',
        contextId: 'brand',
        modeId: 'Working',
        uses: [
          { id: 'blue-use', colorId: blue.id, role: 'foreground' },
          { id: 'gold-use', colorId: gold.id, role: 'background' },
        ],
        pairs: [],
      });
      expect(result.eligible).toBe(false);
      expect(result.rules.some(r => r.kind === 'forbidden-pair' && r.status === 'fail')).toBe(true);
      expect(review.model.conflicts[0].status).toBe('resolved');
      expect(review.model.adoptions).toHaveLength(1);
      const inspected = await inspectSourceSet(draft);
      expect(inspected.unavailableScales.map(s => s.entryId)).toEqual(
        selector === 'color' ? ['b'] : ['a', 'b']
      );
      expect(review.model.scales).toHaveLength(selector === 'color' ? 1 : 0);
      expect(JSON.parse(draft.entries[1].projectJson)).toEqual(
        sourceSetPdf('PDF B', '#334455', selector)
      );
    }
  );
  it('keeps retained scale rules dynamic when new shades are generated and reviewed', async () => {
    const draft = await setup(sourceSetPdf('PDF B', '#123456', 'scale')),
      review = await apply(draft);
    expect(review.model.scales).toHaveLength(1);
    const rule = review.model.rules[0];
    if (rule.kind !== 'forbidden-pair') throw new Error('Expected source restriction');
    expect(rule.operands.left[0].kind).toBe('scale');
    const execution = { isCancelled: () => false, yield: async () => {} };
    const request = {
      context: 'brand' as const,
      modeId: 'Working',
      scaleId: review.model.scales[0].id,
      additions: [{ slotId: '500', position: 1 }],
      lightnessOrder: 'none' as const,
    };
    const preview = await previewGuidelineExtension(review, request, execution);
    expect(preview.pendingRuleIds).toContain(rule.id);
    const decision = createGuidelineExtensionDecision(
      review.reviewHash,
      preview,
      Object.fromEntries(preview.pendingRuleIds.map(id => [id, 'accepted']))
    );
    const renewed = await reviewGuidelineExtension(review, request, decision, execution);
    const model = renewed.workingModel!,
      generated = renewed.generatedBindings[0];
    const assessment = compileColorSystemRelationshipsV1(model).evaluate({
      id: 'generated-proof',
      contextId: 'brand',
      modeId: 'Working',
      uses: [
        { id: 'generated', colorId: generated.colorId, role: 'foreground' },
        { id: 'gold', colorId: model.colors.find(c => c.label === 'gold')!.id, role: 'background' },
      ],
      pairs: [],
    });
    expect(assessment.rules.some(r => r.kind === 'forbidden-pair' && r.status === 'fail')).toBe(
      true
    );
  });
  it.each(['permission', 'requirement', 'prohibition'] as const)(
    'does not grow a different source family governed by %s',
    async force => {
      const original = sourceSetPdf('PDF B', '#123456', 'family'),
        draft = structuredClone(original.draft);
      draft.rules[0].definition = {
        kind: 'role-binding',
        force,
        operands: {
          role: 'action',
          members: [{ kind: 'family', id: 'Blue family' }],
          presence: 'if-present',
        },
      };
      const project = buildGuidelineProjectV3({
        capture: original.capture,
        draft,
        review: compileGuidelineReviewV3(original.capture, draft, actor, reviewedAt),
        selection: null,
      });
      const inspected = await inspectSourceSet(await setup(project));
      expect(inspected.unavailableScales.find(s => s.entryId === 'a')?.reason).toContain(
        'overlapping'
      );
      expect(inspected.model.scales).toHaveLength(1);
    }
  );
  it('preserves gradient-only restrictions and source modes without widening them', async () => {
    const draft = await resolve(await setup(sourceSetPdf('PDF B', '#334455', 'no-gradients'))),
      review = await apply(draft);
    expect(guidelineGenerationIssues(review.model, 'brand', 'Working')).toEqual([]);
    expect(guidelineOperationIssues(review, 'gradient', 'brand', 'Working').length).toBeGreaterThan(
      0
    );
    const product = await apply({ ...draft, scope: 'product', resolutions: [] });
    expect(product.model.contexts.map(c => c.id).sort()).toEqual(['gradient:product', 'product']);
    expect(product.model.claims.filter(c => c.status === 'unsupported')).toEqual([]);
    await expect(
      inspectSourceSet({
        ...draft,
        entries: draft.entries.map((e, i) => (i === 0 ? { ...e, modeId: 'invented' } : e)),
      })
    ).rejects.toThrow('declared source mode');
  });
  it('distinguishes exact fractional values with equal display hex', async () => {
    const a = sourceSetPdf('PDF A', 'color(srgb .123456789012341 .5 .75 / .3333333333333333)'),
      b = sourceSetPdf('PDF B', 'color(srgb .123456789012342 .5 .75 / .3333333333333334)');
    const inspected = await inspectSourceSet(await setup(b, a)),
      subject = inspected.subjects.find(s => s.subject === 'blue')!;
    expect(subject.members[0].value!.hex).toBe(subject.members[1].value!.hex);
    expect(subject.conflicting).toBe(true);
    expect(subject.resolved).toBe(false);
  });
  it('does not transfer stale choices after mode, use, grouping, membership or source changes', async () => {
    const draft = await resolve(await setup());
    await expect(inspectSourceSet({ ...draft, scope: 'product' })).rejects.toThrow('stale');
    await expect(
      inspectSourceSet({
        ...draft,
        entries: [
          { ...draft.entries[0], projectJson: JSON.stringify(sourceSetPdf('PDF A', '#112234')) },
          draft.entries[1],
        ],
      })
    ).rejects.toThrow('stale');
    const changed = {
      ...draft,
      subjects: draft.subjects.map(s =>
        s.entryId === 'a' && s.subject === 'Blue' ? { ...s, subject: 'Different role' } : s
      ),
    };
    await expect(inspectSourceSet(changed)).rejects.toThrow('stale');
  });
  it('preserves identity and exact model after source and mapping reorder', async () => {
    const draft = await resolve(await setup()),
      a = await inspectSourceSet(draft),
      b = await inspectSourceSet({
        ...draft,
        entries: [...draft.entries].reverse(),
        subjects: [...draft.subjects].reverse(),
      });
    expect(b.model).toEqual(a.model);
    expect(b.draftHash).toBe(a.draftHash);
  });
  it('rejects duplicate captures, omitted, duplicate and unknown mappings, same-source collapse and unsupported keys', async () => {
    const draft = await setup();
    for (const subjects of [
      draft.subjects.slice(1),
      [...draft.subjects, draft.subjects[0]],
      [{ ...draft.subjects[0], colorId: 'invented' }, ...draft.subjects.slice(1)],
      draft.subjects.map(s => ({ ...s, subject: 'one' })),
    ])
      await expect(inspectSourceSet({ ...draft, subjects })).rejects.toThrow();
    const duplicate = await prepareSourceSetEntry(draft.entries[0].projectJson, 'c');
    await expect(
      inspectSourceSet({
        ...draft,
        entries: [...draft.entries, duplicate.entry],
        subjects: [...draft.subjects, ...duplicate.subjects],
      })
    ).rejects.toThrow('already');
    expect(() => parseSourceSetDraft({ ...draft, extra: true })).toThrow();
    expect(() =>
      parseSourceSetDraft({ ...draft, entries: Array(9).fill(draft.entries[0]) })
    ).toThrow('eight');
    const controller = new AbortController();
    controller.abort();
    await expect(inspectSourceSet(draft, controller.signal)).rejects.toThrow();
  });
  it('combines strict Figma and PDF projects without modifying either input', async () => {
    const pdf = await prepareSourceSetEntry(JSON.stringify(sourceSetPdf()), 'a'),
      native = await prepareSourceSetEntry(JSON.stringify(figma), 'b');
    const draft: SourceSetDraft = {
      entries: [pdf.entry, native.entry],
      subjects: [...pdf.subjects, ...native.subjects],
      scope: 'brand',
      resolutions: [],
    };
    const review = await apply(draft);
    expect(review.model.sources.length).toBe(3);
    expect(draft.entries[1].projectJson).toBe(JSON.stringify(figma));
    expect(review.model.sources.some(s => s.locator?.includes('figma.com'))).toBe(true);
  });
  it('retains conflicting PDF, Figma and website observations in one reviewed set', async () => {
    const inventory = await createWebsiteInventory(website),
      draft = suggestWebsiteReview(inventory);
    draft.modeIds = [inventory.modes[0].id];
    const accent = inventory.declarations.find(c => c.property === '--accent')!;
    draft.colors = [{ declarationId: accent.id, label: 'Blue', family: 'Accent' }];
    draft.statements = draft.statements.map(s => ({
      ...s,
      meaning: 'not-a-rule',
      reason: 'Synthetic fixture text.',
    }));
    draft.scopeDecision = { accepted: true, reason: 'Observed source region only.' };
    const webProject = await buildWebsiteProject({
      capture: inventory.packet,
      draft,
      review: compileWebsiteReview(inventory, draft, actor, reviewedAt),
      selection: null,
    });
    const entries = await Promise.all(
      [JSON.stringify(sourceSetPdf()), JSON.stringify(figma), JSON.stringify(webProject)].map(
        (json, i) => prepareSourceSetEntry(json, `entry-${i}`)
      )
    );
    const sourceSet: SourceSetDraft = {
      entries: entries.map(p => p.entry),
      subjects: entries.flatMap(p =>
        p.subjects.some(s => s.subject === 'Blue')
          ? p.subjects
          : p.subjects.map((s, i) => (i === 0 ? { ...s, subject: 'Blue' } : s))
      ),
      scope: 'brand',
      resolutions: [],
    };
    const inspected = await inspectSourceSet(sourceSet),
      blue = inspected.subjects.find(s => s.subject === 'blue')!;
    expect(blue.members).toHaveLength(3);
    expect(blue.conflicting).toBe(true);
    expect(
      inspected.model.conflicts.find(c => c.colorIds?.includes(blue.representativeColorId))!
        .claimIds
    ).toHaveLength(3);
    expect(inspected.entries.map(e => e.kind).sort()).toEqual(['figma', 'pdf', 'website']);
    expect(sourceSet.entries[2].projectJson).toBe(JSON.stringify(webProject));
  });
  it('fails at combined model capacity without trimming source observations', async () => {
    const sources = [];
    for (let i = 0; i < 8; i++)
      sources.push(
        await prepareSourceSetEntry(
          JSON.stringify(sourceSetPdf(`Capacity ${i}`, '#123456', undefined, 80)),
          `capacity-${i}`
        )
      );
    const draft: SourceSetDraft = {
      entries: sources.map(s => s.entry),
      subjects: sources.flatMap(s => s.subjects),
      scope: 'brand',
      resolutions: [],
    };
    const before = JSON.stringify(draft);
    await expect(inspectSourceSet(draft)).rejects.toThrow(/limit|maximum|at most|exceed/i);
    expect(JSON.stringify(draft)).toBe(before);
  });
});

describe('source-set strict project recovery', () => {
  it('rebuilds pending conflict and exact reviewed source bytes, scale additions and gradient paint', async () => {
    const pending = await setup();
    const pendingJson = await serializeSourceSetProject({
      draft: pending,
      review: null,
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      gradientSelection: null,
    });
    const openedPending = await readSourceSetProject(pendingJson);
    expect(openedPending.status).toBe('opened');
    if (openedPending.status === 'opened') expect(openedPending.value.draft).toEqual(pending);
    const draft = await resolve(pending),
      review = await apply(draft),
      scale = review.model.scales[0];
    const preview = await previewGuidelineExtension(
      review,
      {
        context: 'brand',
        modeId: 'Working',
        scaleId: scale.id,
        additions: [{ slotId: '500', position: 1 }],
        lightnessOrder: 'none',
      },
      { isCancelled: () => false, yield: async () => {} }
    );
    expect(preview.status).toBe('proposed');
    const gradientSelection = createGuidelineAuthoredGradient(review, {
      scope: 'brand',
      modeId: 'Working',
      angle: 120,
      route: { space: 'oklab' },
      stops: review.model.colors
        .slice(0, 2)
        .map((c, i) => ({ colorId: c.id, position: i, locked: true })),
    });
    const json = await serializeSourceSetProject({
      draft,
      review,
      outputs: { extension: { preview, decision: null }, application: null },
      gradientSelection,
    });
    const opened = await readSourceSetProject(json);
    expect(opened.status).toBe('opened');
    if (opened.status !== 'opened') throw new Error('Expected recovery');
    expect(opened.value.review).toEqual(review);
    expect(opened.value.draft.entries.map(e => e.projectJson)).toEqual(
      draft.entries.map(e => e.projectJson)
    );
    expect(opened.value.outputs.extension!.preview.generatedBindings).toEqual(
      preview.generatedBindings
    );
    expect(opened.value.gradientSelection).toEqual(gradientSelection);
    const forged = JSON.parse(json);
    forged.review.model.colors[0].label = 'invented';
    await expect(readSourceSetProject(reseal(forged))).rejects.toThrow('differs');
    const stale = JSON.parse(json);
    stale.draft.scope = 'product';
    await expect(readSourceSetProject(reseal(stale))).rejects.toThrow();
    const noReview = JSON.parse(json);
    noReview.review = null;
    await expect(readSourceSetProject(reseal(noReview))).rejects.toThrow('require');
  });
  it('preserves future versions read-only, rejects recursive sets and corrupt inner data', async () => {
    const draft = await setup(),
      json = await serializeSourceSetProject({
        draft,
        review: null,
        outputs: EMPTY_GUIDELINE_OUTPUTS,
        gradientSelection: null,
      });
    const future = JSON.parse(json);
    future.draft.entries[0].projectJson = JSON.stringify({
      schemaVersion: 'teul.figma-project.v999',
    });
    expect(await readSourceSetProject(reseal(future))).toEqual({
      status: 'read-only',
      version: 'teul.figma-project.v999',
    });
    expect(await readSourceSetProject('{"schemaVersion":"teul.source-set-project.v999"}')).toEqual({
      status: 'read-only',
      version: 'teul.source-set-project.v999',
    });
    const recursive = JSON.parse(json);
    recursive.draft.entries[0].projectJson = json;
    await expect(readSourceSetProject(reseal(recursive))).rejects.toThrow();
    const corrupt = JSON.parse(json);
    const source = JSON.parse(corrupt.draft.entries[0].projectJson);
    source.capture.identity.label = 'bad';
    corrupt.draft.entries[0].projectJson = JSON.stringify(source);
    await expect(readSourceSetProject(reseal(corrupt))).rejects.toThrow();
    await expect(readSourceSetProject(' '.repeat(16 * 1024 * 1024 + 1))).rejects.toThrow('16 MiB');
  });
});
