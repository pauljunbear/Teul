import { describe, expect, it } from 'vitest';
import {
  sourceSetPdf,
  sourceSetPdfRevision as changePdf,
  sourceSetActor as actor,
  sourceSetTime as time,
} from '../../../fixtures/guidelines/source-set-fixture';
import { compileGuidelineReviewV3 } from './reviewV3';
import { buildGuidelineProjectV3 } from './projectV3';
import {
  applySourceSetReview,
  inspectSourceSet,
  prepareSourceSetEntry,
  type SourceSetDraft,
} from './sourceSet';
import {
  readSourceSetProject,
  serializeSourceSetProject,
  type SourceSetWorkspace,
} from './sourceSetProject';
import {
  prepareSourceSetRefresh,
  proposeSourceSetRefresh,
  replaySourceSetRefresh,
} from './sourceSetRefresh';
import { guidelineHash } from './review';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import { createGuidelineAuthoredGradient } from './authoredGradient';
import { previewGuidelineExtension } from './extension';
import { assessGuidelineApplication, exportGuidelineApplication } from './application';
import { buildGuidelineApplicationLayout } from './applicationGeometry';
import { generateGuidelineSupportingDirections } from './supportingDirections';
import figmaProject from '../../../fixtures/guidelines/figma-project-v1.json';
import websitePacket from '../../../fixtures/guidelines/website-capture.json';
import { createFigmaNativeInventory } from './figmaInventory';
import { suggestFigmaReview, compileFigmaReview } from './figmaReview';
import { buildFigmaProject } from './figmaProject';
import { createWebsiteInventory } from './websiteInventory';
import { suggestWebsiteReview, compileWebsiteReview } from './websiteReview';
import { buildWebsiteProject } from './websiteProject';
import { hashCanonical } from './intakeClient';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';

async function setup(
  disjoint = false,
  restriction?: Parameters<typeof sourceSetPdf>[2],
  aRestriction?: Parameters<typeof sourceSetPdf>[2]
) {
  const a = sourceSetPdf('PDF A', '#123456', aRestriction),
    b = sourceSetPdf('PDF B', '#334455', restriction);
  const A = await prepareSourceSetEntry(JSON.stringify(a), 'A'),
    B = await prepareSourceSetEntry(JSON.stringify(b), 'B');
  const draft: SourceSetDraft = {
    entries: [A.entry, B.entry],
    subjects: [
      ...A.subjects,
      ...B.subjects.map(s => (disjoint ? { ...s, subject: `B ${s.subject}` } : s)),
    ],
    scope: 'brand',
    resolutions: [],
  };
  const inspection = await inspectSourceSet(draft);
  draft.resolutions = inspection.subjects
    .filter(s => s.conflicting)
    .map(s => ({
      subject: s.subject,
      memberHash: s.memberHash,
      chosen: { entryId: s.members[0].entryId, colorId: s.members[0].colorId },
      reason: 'Preserve the reviewed A value.',
    }));
  const review = await applySourceSetReview(draft, { actor, reviewedAt: time });
  const workspace: SourceSetWorkspace = {
    draft,
    review,
    outputs: EMPTY_GUIDELINE_OUTPUTS,
    gradientSelection: null,
  };
  return { a, b, workspace };
}
async function accepted(previous: SourceSetWorkspace, next: string) {
  const { proposal, lineage } = await prepareSourceSetRefresh(previous, 'A', next);
  return {
    ...previous,
    draft: proposal.draft,
    review: await applySourceSetReview(proposal.draft, { actor, reviewedAt: time }),
    outputs: EMPTY_GUIDELINE_OUTPUTS,
    gradientSelection: null,
    refresh: lineage,
  };
}
function withGradient(workspace: SourceSetWorkspace, labels = ['b blue', 'b light']) {
  return {
    ...workspace,
    gradientSelection: createGuidelineAuthoredGradient(workspace.review!, {
      scope: 'brand',
      modeId: 'Working',
      angle: 120,
      route: { space: 'oklab' },
      stops: labels.map((name, i) => ({
        colorId: workspace.review!.model.colors.find(c => c.label === name)!.id,
        position: i,
        locked: true,
      })),
    }),
  };
}
const reseal = (raw: Record<string, unknown>) => {
  const { projectHash: _hash, ...content } = raw;
  return JSON.stringify({ ...content, projectHash: guidelineHash(content) });
};

describe('source-set refresh', () => {
  it('retains a B composition and scale after changed A rules and paint, but invalidates a new global rule', async () => {
    const { a, workspace } = await setup(true, undefined, 'color');
    const review = workspace.review!,
      layout = {
        kind: 'brand' as const,
        modeId: 'Working',
        layout: 'split' as const,
        primaryShare: 60,
      },
      scale = review.model.scales.find(s => s.label.includes('PDF B'))!;
    const preview = await previewGuidelineExtension(review, {
      context: 'brand',
      modeId: 'Working',
      scaleId: scale.id,
      additions: [{ slotId: '500', position: 1 }],
      lightnessOrder: 'none',
    });
    const application = await assessGuidelineApplication(review, {
      layout,
      extension: null,
      assignments: buildGuidelineApplicationLayout(layout).roles.map(r => ({
        applicationId: r.applicationId,
        useId: r.useId,
        colorId: review.model.colors.find(
          c => c.label === (r.useId === 'ground' ? 'b light' : 'b blue')
        )!.id,
      })),
    });
    expect(application.status).toBe('ready');
    const blue = review.model.colors.find(c => c.label === 'b blue')!.id,
      light = review.model.colors.find(c => c.label === 'b light')!.id;
    const directions = await generateGuidelineSupportingDirections(review, {
      layout,
      provider: 'wada',
      scheme: null,
      relationship: 'companion',
      anchorColorIds: [blue],
      excludedCandidateIds: [],
      sourcePaints: { ground: light, primary: blue, accent: light },
    });
    expect(directions.status).toBe('ready');
    const supporting = { result: directions, directionId: directions.directions[0].id };
    const previous = {
      ...workspace,
      outputs: {
        ...EMPTY_GUIDELINE_OUTPUTS,
        application,
        extension: { preview, decision: null },
        supporting,
      },
    };
    const original = a.draft.rules[0].definition!;
    if (original.kind !== 'forbidden-pair') throw new Error('Fixture rule');
    const unrelated = changePdf(a, {
      color: [0, '#223344'],
      rule: {
        text: 'Do not pair Blue and Light.',
        definition: {
          ...original,
          operands: { ...original.operands, right: [{ kind: 'color', id: 'color:1' }] },
        },
      },
    });
    const replay = await replaySourceSetRefresh(
      await accepted(previous, JSON.stringify(unrelated))
    );
    expect(replay.items.find(i => i.kind === 'application')?.status).toBe('restorable');
    expect(replay.items.find(i => i.kind === 'extension')?.status).toBe('restorable');
    expect(replay.items.find(i => i.kind === 'supporting')?.status).toBe('restorable');
    expect((await exportGuidelineApplication(replay.outputs.application!)).svgs).toEqual(
      (await exportGuidelineApplication(application)).svgs
    );
    const global = changePdf(a, {
      rule: {
        text: 'Blue should occupy more area than Gold.',
        definition: {
          kind: 'prominence',
          force: 'requirement',
          operands: {
            kind: 'ordered-groups',
            groups: [[{ kind: 'color', id: 'color:0' }], [{ kind: 'color', id: 'color:2' }]],
          },
        },
      },
    });
    const stale = await replaySourceSetRefresh(await accepted(previous, JSON.stringify(global)));
    expect(stale.items.find(i => i.kind === 'application')?.status).toBe('stale');
    expect(stale.outputs.application).toBeNull();
    expect(stale.items.find(i => i.kind === 'extension')?.status).toBe('stale');
  }, 15000);
  it('retains a gradient through changed examples but refuses a newly governing prohibition', async () => {
    const { a, workspace } = await setup(true, undefined, 'color');
    const original = a.draft.rules[0].definition!;
    const example = changePdf(a, {
      rule: { text: 'An example pairing.', definition: { ...original, force: 'example' } },
    });
    const draft = {
      ...workspace.draft,
      entries: workspace.draft.entries.map(e =>
        e.id === 'A' ? { ...e, projectJson: JSON.stringify(example) } : e
      ),
    };
    const previous = withGradient({
      ...workspace,
      draft,
      review: await applySourceSetReview(draft, { actor, reviewedAt: time }),
    });
    const revisedExample = changePdf(example, {
      rule: { text: 'A revised example pairing.', definition: { ...original, force: 'example' } },
    });
    const restored = await replaySourceSetRefresh(
      await accepted(previous, JSON.stringify(revisedExample))
    );
    expect(restored.items.find(i => i.kind === 'gradient')?.status).toBe('restorable');
    expect(restored.selection?.design.compiledPaint).toEqual(
      previous.gradientSelection.design.compiledPaint
    );
    const blocked = await replaySourceSetRefresh(await accepted(previous, JSON.stringify(a)));
    expect(blocked.items.find(i => i.kind === 'gradient')?.status).toBe('stale');
    expect(blocked.selection).toBeNull();
  });
  it.each(['figma', 'website'] as const)(
    'refreshes reviewed %s evidence without conflating capture identities',
    async kind => {
      const build = async (recaptured: boolean) => {
        const raw = structuredClone(kind === 'figma' ? figmaProject.capture : websitePacket);
        if (recaptured) raw.capturedAt = '2026-09-26T11:00:00.000Z';
        const { contentHash: _, ...content } = raw;
        const packet = {
          ...content,
          contentHash: await hashCanonical(canonicalIntakeJson(content)),
        };
        const inventory =
          kind === 'figma'
            ? await createFigmaNativeInventory(packet)
            : await createWebsiteInventory(packet);
        const draft =
          kind === 'figma'
            ? suggestFigmaReview(inventory as Parameters<typeof suggestFigmaReview>[0])
            : suggestWebsiteReview(inventory as Parameters<typeof suggestWebsiteReview>[0]);
        draft.modeIds = [inventory.modes[0].id];
        draft.colors = inventory.declarations
          .slice(0, 2)
          .map((c, i) => ({ declarationId: c.id, label: `Native ${i}`, family: 'Native' }));
        draft.statements = draft.statements.map(s => ({
          ...s,
          meaning: 'not-a-rule',
          reason: 'Synthetic source text.',
        }));
        draft.scopeDecision = { accepted: true, reason: 'Reviewed source area.' };
        if (kind === 'figma') {
          const i = inventory as Parameters<typeof compileFigmaReview>[0];
          const d = draft as Parameters<typeof compileFigmaReview>[1];
          d.profileDecision = {
            captureHash: i.packet.contentHash,
            interpretation: 'srgb',
            actor,
            decidedAt: time,
          };
          return buildFigmaProject({
            capture: i.packet,
            draft: d,
            review: compileFigmaReview(i, d, actor, time),
            selection: null,
          });
        }
        const i = inventory as Parameters<typeof compileWebsiteReview>[0];
        const d = draft as Parameters<typeof compileWebsiteReview>[1];
        return buildWebsiteProject({
          capture: i.packet,
          draft: d,
          review: compileWebsiteReview(i, d, actor, time),
          selection: null,
        });
      };
      const before = await build(false),
        after = await build(true);
      const A = await prepareSourceSetEntry(JSON.stringify(before), 'A'),
        B = await prepareSourceSetEntry(JSON.stringify(sourceSetPdf()), 'B');
      const draft: SourceSetDraft = {
        entries: [A.entry, B.entry],
        subjects: [...A.subjects, ...B.subjects.map(s => ({ ...s, subject: `B ${s.subject}` }))],
        resolutions: [],
        scope: 'brand',
      };
      const workspace = withGradient({
        draft,
        review: await applySourceSetReview(draft, { actor, reviewedAt: time }),
        outputs: EMPTY_GUIDELINE_OUTPUTS,
        gradientSelection: null,
      });
      const proposal = await proposeSourceSetRefresh(workspace, 'A', JSON.stringify(after));
      expect(proposal.mappings.every(m => m.status === 'retained')).toBe(true);
      expect(proposal.metadataChanges).toEqual([]);
      const next = await accepted(workspace, JSON.stringify(after));
      const replay = await replaySourceSetRefresh(next);
      expect(replay.selection?.design.compiledPaint).toEqual(
        workspace.gradientSelection.design.compiledPaint
      );
      expect((await readSourceSetProject(await serializeSourceSetProject(next))).status).toBe(
        'opened'
      );
    }
  );
  it('requires renewed scale evidence and rejects a forged current review', async () => {
    const { a, workspace } = await setup(true),
      scale = workspace.review!.model.scales.find(s => s.label.includes('PDF A'))!;
    const preview = await previewGuidelineExtension(workspace.review!, {
      context: 'brand',
      modeId: 'Working',
      scaleId: scale.id,
      additions: [{ slotId: '500', position: 1 }],
      lightnessOrder: 'none',
    });
    const previous = {
      ...workspace,
      outputs: { ...EMPTY_GUIDELINE_OUTPUTS, extension: { preview, decision: null } },
    };
    const draft = structuredClone(a.draft);
    draft.scales[0].evidenceRefs.push('color:2');
    const changed = buildGuidelineProjectV3({
      capture: a.capture,
      draft,
      review: compileGuidelineReviewV3(a.capture, draft, actor, time),
      selection: null,
    });
    const next = await accepted(previous, JSON.stringify(changed));
    expect(
      (await replaySourceSetRefresh(next)).items.find(i => i.kind === 'extension')?.status
    ).toBe('stale');
    const forged = structuredClone(next);
    forged.review = { ...forged.review, reviewHash: guidelineHash('unearned review') };
    await expect(replaySourceSetRefresh(forged)).rejects.toThrow('Current review');
    const again = await prepareSourceSetRefresh(
      next,
      'A',
      JSON.stringify(changePdf(a, { note: true }))
    );
    expect(JSON.parse(again.lineage.previousProjectJson).schemaVersion).toBe(
      'teul.source-set-project.v1'
    );
    expect(JSON.parse(again.lineage.previousProjectJson).refresh).toBeUndefined();
  });
  it('retains unchanged editable matches and resolutions through new evidence bytes, without retaining merged approval', async () => {
    const { a, workspace } = await setup();
    const refreshed = await prepareSourceSetRefresh(
      workspace,
      'A',
      JSON.stringify(changePdf(a, { note: true }))
    );
    expect(refreshed.proposal.retainedResolutions).toEqual(['blue']);
    expect(refreshed.proposal.resetResolutions).toEqual([]);
    expect(refreshed.proposal.draft.resolutions[0].memberHash).not.toBe(
      workspace.draft.resolutions[0].memberHash
    );
    expect(refreshed.proposal.draft.resolutions[0].reason).toBe(
      workspace.draft.resolutions[0].reason
    );
    expect(refreshed.proposal.draft.entries[1]).toEqual(workspace.draft.entries[1]);
    expect(refreshed.proposal.changes.some(c => c.status === 'added')).toBe(true);
    const pending: SourceSetWorkspace = {
      draft: refreshed.proposal.draft,
      review: null,
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      gradientSelection: null,
      refresh: refreshed.lineage,
    };
    const opened = await readSourceSetProject(await serializeSourceSetProject(pending));
    expect(opened.status).toBe('opened');
    if (opened.status === 'opened') expect(opened.value).toEqual(pending);
    await expect(replaySourceSetRefresh(pending)).rejects.toThrow('Apply');
  });
  it('resets changed conflict members and removes obsolete choices when values become equal', async () => {
    const { a, workspace } = await setup();
    for (const color of ['#223344', '#334455']) {
      const proposal = await proposeSourceSetRefresh(
        workspace,
        'A',
        JSON.stringify(changePdf(a, { color: [0, color] }))
      );
      expect(proposal.retainedResolutions).toEqual([]);
      expect(proposal.resetResolutions).toEqual(['blue']);
      expect(proposal.draft.resolutions).toEqual([]);
      expect(proposal.mappings.filter(m => m.status === 'retained')).toHaveLength(2);
    }
    expect(workspace.draft.resolutions).toHaveLength(1);
  });
  it('retains an unrelated source gradient through changed paint, family or authority', async () => {
    const { a, workspace } = await setup(true),
      previous = withGradient(workspace);
    for (const change of [
      { color: [0, '#223344'] as [number, string] },
      { family: 'New accent family' },
      { authority: true },
    ]) {
      const next = await accepted(previous, JSON.stringify(changePdf(a, change))),
        replay = await replaySourceSetRefresh(next);
      expect(replay.items.find(i => i.kind === 'gradient')?.status).toBe('restorable');
      expect(replay.selection?.design.compiledPaint).toEqual(
        previous.gradientSelection.design.compiledPaint
      );
      expect(replay.selection?.design.sourceModelHash).not.toBe(
        previous.gradientSelection.design.sourceModelHash
      );
    }
  });
  it('invalidates a used logical color when even its losing source changes authority or reviewed family', async () => {
    const { a, workspace } = await setup(),
      previous = withGradient(workspace, ['blue', 'gold']);
    for (const change of [{ authority: true }, { family: 'New accent family' }]) {
      const next = await accepted(previous, JSON.stringify(changePdf(a, change))),
        replay = await replaySourceSetRefresh(next);
      expect(replay.items.find(i => i.kind === 'gradient')?.status).toBe('stale');
      expect(replay.selection).toBeNull();
    }
  });
  it('replays an unrelated extension with duplicate family labels through namespaced identity', async () => {
    const { a, workspace } = await setup(true, 'family'),
      scale = workspace.review!.model.scales.find(s => s.label.includes('PDF B'))!;
    const preview = await previewGuidelineExtension(workspace.review!, {
      context: 'brand',
      modeId: 'Working',
      scaleId: scale.id,
      additions: [{ slotId: '500', position: 1 }],
      lightnessOrder: 'none',
    });
    const previous = {
      ...workspace,
      outputs: { ...EMPTY_GUIDELINE_OUTPUTS, extension: { preview, decision: null } },
    };
    const next = await accepted(previous, JSON.stringify(changePdf(a, { color: [0, '#223344'] }))),
      replay = await replaySourceSetRefresh(next);
    expect(replay.items.find(i => i.kind === 'extension')?.status).toBe('needs-review');
    expect(replay.outputs.extension?.decision).toBeNull();
    const paint = (value: typeof preview) =>
      value.generatedBindings.map(
        binding =>
          value.workingModel!.colors.find(c => c.id === binding.colorId)!.valuesByMode.Working
      );
    expect(paint(replay.outputs.extension!.preview)).toEqual(paint(preview));
  });
  it('recomputes dependencies after a purpose or working-use edit', async () => {
    const { a, workspace } = await setup(true),
      previous = withGradient(workspace),
      next = await accepted(previous, JSON.stringify(changePdf(a, { note: true })));
    for (const draft of [
      {
        ...next.draft,
        subjects: next.draft.subjects.map(s =>
          s.subject === 'B Blue' ? { ...s, subject: 'Renamed purpose' } : s
        ),
      },
      { ...next.draft, scope: 'product' as const, resolutions: [] },
    ]) {
      const edited = {
        ...next,
        draft,
        review: await applySourceSetReview(draft, { actor, reviewedAt: time }),
      };
      expect(
        (await replaySourceSetRefresh(edited)).items.find(i => i.kind === 'gradient')?.status
      ).toBe('stale');
    }
  });
  it('rejects changed source bindings, malformed lineage, nested predecessor and cancellation', async () => {
    const { a, workspace } = await setup(),
      next = await accepted(workspace, JSON.stringify(changePdf(a, { note: true }))),
      json = await serializeSourceSetProject(next),
      raw = JSON.parse(json);
    const corrupt = structuredClone(raw);
    corrupt.refresh.proposalHash = 'bad';
    const { lineageHash: _, ...body } = corrupt.refresh;
    corrupt.refresh.lineageHash = guidelineHash(body);
    await expect(readSourceSetProject(reseal(corrupt))).rejects.toThrow('comparison');
    const nested = structuredClone(raw);
    nested.refresh.previousProjectJson = json;
    const { lineageHash: _old, ...nestedBody } = nested.refresh;
    nested.refresh.lineageHash = guidelineHash(nestedBody);
    await expect(readSourceSetProject(reseal(nested))).rejects.toThrow('flat V1');
    const moved = structuredClone(raw);
    moved.draft.entries[1].projectJson = JSON.stringify(sourceSetPdf('Different'));
    await expect(readSourceSetProject(reseal(moved))).rejects.toThrow();
    const abort = new AbortController();
    abort.abort();
    await expect(replaySourceSetRefresh(next, abort.signal)).rejects.toThrow();
    expect(
      (await readSourceSetProject('{"schemaVersion":"teul.source-set-project.v999"}')).status
    ).toBe('read-only');
  });
});

it('reopens and selectively refreshes a derived scale in a combined source set', async () => {
  const { a, workspace } = await setup(true);
  const review = workspace.review!;
  const anchor = review.model.colors.find(c => c.label === 'b blue')!;
  const preview = await previewGuidelineExtension(review, {
    kind: 'new-scale',
    context: 'brand',
    modeId: 'Working',
    familyId: review.model.families.find(f => f.colorIds.includes(anchor.id))?.id ?? null,
    anchorColorId: anchor.id,
    scaleId: 'derived:blue',
    label: 'Blue scale',
    polarity: 'light',
  });
  expect(preview.status).toBe('proposed');
  const previous = {
    ...workspace,
    outputs: { ...EMPTY_GUIDELINE_OUTPUTS, extension: { preview, decision: null } },
  };
  const saved = await serializeSourceSetProject(previous);
  expect(JSON.parse(saved).schemaVersion).toBe('teul.source-set-project.v3');
  const read = await readSourceSetProject(saved);
  if (read.status !== 'opened') throw Error('not opened');
  expect(read.value.outputs.extension).toEqual(previous.outputs.extension);
  const downgraded = JSON.parse(saved);
  downgraded.schemaVersion = 'teul.source-set-project.v1';
  delete downgraded.refresh;
  await expect(readSourceSetProject(reseal(downgraded))).rejects.toThrow('newer project');
  const target = await accepted(previous, JSON.stringify(changePdf(a, { color: [0, '#225588'] })));
  expect(target.refresh.schemaVersion).toBe('teul.source-set-refresh.v2');
  const replay = await replaySourceSetRefresh(target);
  expect(replay.items.find(i => i.kind === 'extension')?.status).toBe('restorable');
  const refreshed = await serializeSourceSetProject({ ...target, outputs: replay.outputs });
  expect((await readSourceSetProject(refreshed)).status).toBe('opened');
  const nested = JSON.parse(refreshed);
  nested.refresh.previousProjectJson = refreshed;
  const { lineageHash: _, ...body } = nested.refresh;
  nested.refresh.lineageHash = guidelineHash(body);
  await expect(readSourceSetProject(reseal(nested))).rejects.toThrow('flat V3');
});
