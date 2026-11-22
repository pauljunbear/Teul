import { describe, expect, it } from 'vitest';
import { nativeGradientEditFixture } from '../../../fixtures/guidelines/native-gradient-edit-fixture';
import { sourceSetPdf } from '../../../fixtures/guidelines/source-set-fixture';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { hashCanonical } from './intakeClient';
import { createFigmaNativeInventory } from './figmaInventory';
import { compileFigmaReview } from './figmaReview';
import { buildFigmaProject } from './figmaProject';
import { readSourceProject } from './sourceProjectCodec';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import {
  createGuidelineAuthoringDraft,
  readGuidelineAuthoringDraft,
  EMPTY_GUIDELINE_AUTHORING,
  type GuidelineNativeGradientDraft,
} from './authoringDraft';
import {
  bindGuidelineNativeGradientSource,
  resolveGuidelineNativeGradientSource,
  sourceSetNativeGradientSources,
} from './nativeGradientWorkspace';
import { createGuidelineNativeGradient } from './nativeGradientSelection';
import { createGuidelineRefreshLineage } from './refreshLineage';
import { mergeRestoredGuidelineOutputs, replayGuidelineRefresh } from './refreshReplay';
import { EMPTY_GUIDELINE_OUTPUTS, hasGuidelineNativeEdits } from './selectedOutputs';
import { guidelineHash } from './review';
import { prepareSourceSetEntry, applySourceSetReview, type SourceSetDraft } from './sourceSet';
import { readSourceSetProject, serializeSourceSetProject } from './sourceSetProject';
import { prepareSourceSetRefresh, replaySourceSetRefresh } from './sourceSetRefresh';

async function fixture(change?: Parameters<typeof nativeGradientEditFixture>[0]) {
  const f = await nativeGradientEditFixture(change);
  const sourceJson = JSON.stringify(
    await buildFigmaProject({
      capture: f.inventory.packet,
      draft: f.draft,
      review: f.review,
      selection: null,
    })
  );
  const nativeGradient: GuidelineNativeGradientDraft = {
    activeMethod: 'native',
    source: bindGuidelineNativeGradientSource(f.sources[0], f.review),
    scope: 'brand',
    modeId: f.controls.modeId,
    interpretation: 'srgb',
    rotationDegrees: '',
    positions: ['', '0.6', '-', '1.25'],
  };
  const authoring = createGuidelineAuthoringDraft(f.review, {
    ...EMPTY_GUIDELINE_AUTHORING,
    activeTask: 'gradient',
    nativeGradient,
  });
  return {
    ...f,
    sourceJson,
    nativeGradient,
    authoring,
    outputs: { ...EMPTY_GUIDELINE_OUTPUTS, authoring },
  };
}
async function openSource(json: string) {
  const opened = await readSourceProject(json);
  if (opened.status !== 'opened' || opened.value.kind !== 'figma')
    throw new Error('Expected Figma source project');
  return opened.value;
}
async function recapture(f: Awaited<ReturnType<typeof fixture>>) {
  const { contentHash: _hash, ...raw } = structuredClone(f.inventory.packet);
  const content = { ...raw, capturedAt: '2026-09-28T02:00:00.000Z' };
  const inventory = await createFigmaNativeInventory({
    ...content,
    contentHash: await hashCanonical(canonicalIntakeJson(content)),
  });
  const draft = {
    ...f.draft,
    captureHash: inventory.packet.contentHash,
    profileDecision: { ...f.draft.profileDecision!, captureHash: inventory.packet.contentHash },
  };
  const review = compileFigmaReview(
    inventory,
    draft,
    f.review.decision.actor,
    f.review.decision.reviewedAt
  );
  return JSON.stringify(
    await buildFigmaProject({ capture: inventory.packet, draft, review, selection: null })
  );
}

describe('standalone native gradient drafts', () => {
  it('cold reopens raw incomplete controls separately from the last checked selection', async () => {
    const f = await fixture();
    const selection = createGuidelineNativeGradient(f.review, f.sources[0], f.controls);
    expect(f.authoring.schemaVersion).toBe('teul.guideline-authoring.v7');
    expect(f.authoring.briefs.gradient).toBeNull();
    expect(hasGuidelineNativeEdits(f.outputs)).toBe(true);
    const json = await serializeGuidelineWorkspace(
      f.sourceJson,
      f.outputs,
      null,
      undefined,
      null,
      selection
    );
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v17');
    const opened = await readAnyGuidelineProject(json);
    if (opened.status !== 'opened') throw new Error('Expected workspace');
    expect(opened.value.outputs.authoring?.nativeGradient).toEqual(f.nativeGradient);
    expect(opened.value.gradientSelection).toEqual(selection);
    expect(() =>
      createGuidelineNativeGradient(f.review, f.sources[0], {
        ...f.controls,
        positions: [0, 0.6, NaN, 1.25],
      })
    ).toThrow();
    expect(opened.value.gradientSelection).toEqual(selection);
  });

  it('retains independent generated controls and the chosen method through repeated saves', async () => {
    const f = await fixture();
    const gradient = {
      controls: {
        scope: 'brand' as const,
        modeId: f.controls.modeId,
        angle: 120,
        route: { space: 'oklab' as const },
        stops: f.review.model.colors
          .slice(0, 2)
          .map((c, i) => ({ colorId: c.id, position: i, locked: true })),
      },
      policy: null,
      catalog: null,
    };
    for (const activeMethod of ['generated', 'native', 'generated'] as const) {
      const draft = createGuidelineAuthoringDraft(f.review, {
        ...EMPTY_GUIDELINE_AUTHORING,
        gradient,
        nativeGradient: { ...f.nativeGradient, activeMethod },
      });
      const restored = readGuidelineAuthoringDraft(JSON.parse(JSON.stringify(draft)), f.review);
      expect(restored.gradient).toEqual(gradient);
      expect(restored.nativeGradient).toEqual({ ...f.nativeGradient, activeMethod });
    }
  });

  it('identifies generated and native draft restoration separately when both methods were used', async () => {
    const f = await fixture();
    const authoring = createGuidelineAuthoringDraft(f.review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      nativeGradient: f.nativeGradient,
      gradient: {
        controls: {
          scope: 'brand',
          modeId: f.controls.modeId,
          angle: 120,
          route: { space: 'oklab' },
          stops: f.review.model.colors
            .slice(0, 2)
            .map((color, position) => ({ colorId: color.id, position, locked: true })),
        },
        policy: null,
        catalog: null,
      },
    });
    const next = await openSource(await recapture(f));
    const lineage = await createGuidelineRefreshLineage(
      f.sourceJson,
      { ...f.outputs, authoring },
      next
    );
    const replay = await replayGuidelineRefresh(lineage, next);
    expect(
      replay.items
        .filter(item => item.kind.endsWith('gradient-draft'))
        .map(item => [item.kind, item.status])
    ).toEqual([
      ['gradient-draft', 'restorable'],
      ['native-gradient-draft', 'restorable'],
    ]);
  });

  it('rejects malformed source identities, non-string raw values and downgraded envelopes', async () => {
    const f = await fixture();
    for (const patch of [
      { interpretation: 'display-p3' },
      { rotationDegrees: 0 },
      { positions: [null] },
      { scope: ['brand'] },
      { source: { ...f.nativeGradient.source, sourceEntryModeId: 'forged' } },
    ]) {
      expect(() =>
        createGuidelineAuthoringDraft(f.review, {
          ...EMPTY_GUIDELINE_AUTHORING,
          nativeGradient: { ...f.nativeGradient, ...patch } as GuidelineNativeGradientDraft,
        })
      ).toThrow();
    }
    const { draftHash: _draft, ...draftContent } = f.authoring;
    const oldDraft = { ...draftContent, schemaVersion: 'teul.guideline-authoring.v6' };
    expect(() =>
      readGuidelineAuthoringDraft({ ...oldDraft, draftHash: guidelineHash(oldDraft) }, f.review)
    ).toThrow();
    const { bundleHash: _bundle, ...content } = JSON.parse(
      await serializeGuidelineWorkspace(f.sourceJson, f.outputs)
    );
    const old = { ...content, schemaVersion: 'teul.guideline-workspace.v16' };
    await expect(
      readAnyGuidelineProject(JSON.stringify({ ...old, bundleHash: guidelineHash(old) }))
    ).rejects.toThrow('V17');
  });

  it('restores raw controls after timestamp-only recapture without generating or granting authority', async () => {
    const f = await fixture();
    const nextJson = await recapture(f),
      next = await openSource(nextJson);
    const lineage = await createGuidelineRefreshLineage(f.sourceJson, f.outputs, next);
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v14');
    const replay = await replayGuidelineRefresh(lineage, next);
    expect(replay.items.find(i => i.kind === 'native-gradient-draft')?.status).toBe('restorable');
    expect(replay.selection).toBeNull();
    const restored = replay.outputs.authoring!.nativeGradient!;
    expect(restored).toEqual({
      ...f.nativeGradient,
      source: {
        ...f.nativeGradient.source,
        captureHash: next.project.capture.contentHash,
        evidenceHash: restored.source!.evidenceHash,
      },
    });
    expect(restored.source!.captureHash).not.toBe(f.nativeGradient.source!.captureHash);
    expect(replay.outputs.authoring!.briefs.gradient).toBeNull();
    const cold = await readAnyGuidelineProject(
      await serializeGuidelineWorkspace(nextJson, replay.outputs, null, undefined, lineage)
    );
    if (cold.status !== 'opened') throw new Error('Expected workspace');
    expect(cold.value.outputs.authoring?.nativeGradient).toEqual(restored);
  });

  it.each(['paint', 'geometry', 'context'] as const)(
    'retains %s changes in history for review instead of rebinding unfinished controls',
    async kind => {
      const f = await fixture();
      const changed = await fixture(doc => {
        if (kind === 'paint') doc.children[0].fills[0].gradientStops[0].color.a = 0.5;
        if (kind === 'geometry') doc.children[0].fills[0].gradientHandlePositions[2].x = 0;
        if (kind === 'context') doc.children[0].opacity = 0.5;
      });
      const next = await openSource(changed.sourceJson);
      const lineage = await createGuidelineRefreshLineage(f.sourceJson, f.outputs, next);
      const replay = await replayGuidelineRefresh(lineage, next);
      expect(replay.items.find(i => i.kind === 'native-gradient-draft')?.status).toBe(
        'needs-review'
      );
      expect(replay.outputs.authoring?.nativeGradient).toBeUndefined();
      expect(replay.selection).toBeNull();
      const merged = mergeRestoredGuidelineOutputs(changed.review, changed.outputs, replay.outputs);
      expect(merged.authoring?.nativeGradient).toEqual(changed.nativeGradient);
      const retained = await readAnyGuidelineProject(
        await serializeGuidelineWorkspace(
          changed.sourceJson,
          EMPTY_GUIDELINE_OUTPUTS,
          null,
          undefined,
          lineage
        )
      );
      expect(retained.status).toBe('opened');
      expect('previousAuthoring' in lineage && lineage.previousAuthoring?.nativeGradient).toEqual(
        f.nativeGradient
      );
    }
  );

  it('a structurally valid forged identity remains a draft and cannot resolve or refresh as source authority', async () => {
    const f = await fixture();
    const source = { ...f.nativeGradient.source!, captureHash: guidelineHash('other') };
    const authoring = createGuidelineAuthoringDraft(f.review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      nativeGradient: { ...f.nativeGradient, source },
    });
    expect(() => resolveGuidelineNativeGradientSource(source, f.review, f.sources)).toThrow();
    const next = await openSource(await recapture(f));
    const lineage = await createGuidelineRefreshLineage(
      f.sourceJson,
      { ...f.outputs, authoring },
      next
    );
    const replay = await replayGuidelineRefresh(lineage, next);
    expect(replay.items.find(i => i.kind === 'native-gradient-draft')?.status).toBe('needs-review');
    expect(replay.outputs.authoring?.nativeGradient).toBeUndefined();
  });

  it('cold reopens and refreshes combined-source raw drafts under native-capable versions', async () => {
    const f = await fixture();
    const entries = await Promise.all([
      prepareSourceSetEntry(f.sourceJson, 'native'),
      prepareSourceSetEntry(JSON.stringify(sourceSetPdf()), 'pdf'),
    ]);
    const draft: SourceSetDraft = {
      entries: entries.map(e => e.entry),
      subjects: entries.flatMap(e => e.subjects),
      scope: 'brand',
      resolutions: [],
    };
    const decision = { actor: f.review.decision.actor, reviewedAt: f.review.decision.reviewedAt };
    const review = await applySourceSetReview(draft, decision);
    const sources = await sourceSetNativeGradientSources(draft, undefined, review);
    const nativeGradient = {
      ...f.nativeGradient,
      source: bindGuidelineNativeGradientSource(sources[0], review),
      modeId: 'Working',
    };
    const outputs = {
      ...EMPTY_GUIDELINE_OUTPUTS,
      authoring: createGuidelineAuthoringDraft(review, {
        ...EMPTY_GUIDELINE_AUTHORING,
        nativeGradient,
      }),
    };
    const workspace = { draft, review, outputs, gradientSelection: null };
    const json = await serializeSourceSetProject(workspace);
    expect(JSON.parse(json).schemaVersion).toBe('teul.source-set-project.v11');
    const cold = await readSourceSetProject(json);
    if (cold.status !== 'opened') throw new Error('Expected source set');
    expect(cold.value.outputs.authoring?.nativeGradient).toEqual(nativeGradient);
    const prepared = await prepareSourceSetRefresh(workspace, 'native', await recapture(f));
    expect(prepared.lineage.schemaVersion).toBe('teul.source-set-refresh.v10');
    const next = {
      ...workspace,
      draft: prepared.proposal.draft,
      review: await applySourceSetReview(prepared.proposal.draft, decision),
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      refresh: prepared.lineage,
    };
    const replay = await replaySourceSetRefresh(next);
    expect(replay.items.find(i => i.kind === 'native-gradient-draft')?.status).toBe('restorable');
    expect(replay.outputs.authoring?.nativeGradient?.positions).toEqual(nativeGradient.positions);
    const changed = await fixture(doc => {
      doc.children[0].opacity = 0.5;
    });
    const updated = await prepareSourceSetRefresh(workspace, 'native', changed.sourceJson);
    const refused = await replaySourceSetRefresh({
      ...next,
      draft: updated.proposal.draft,
      review: await applySourceSetReview(updated.proposal.draft, decision),
      refresh: updated.lineage,
    });
    expect(refused.items.find(i => i.kind === 'native-gradient-draft')?.status).toBe(
      'needs-review'
    );
  });
});
