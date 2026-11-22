import { describe, expect, it } from 'vitest';
import { nativeGradientComparisonFixture } from '../../../fixtures/guidelines/native-gradient-comparison-fixture';
import { sourceSetPdf } from '../../../fixtures/guidelines/source-set-fixture';
import { buildFigmaProject } from './figmaProject';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import {
  readGuidelineNativeGradientComparison,
  singleNativeGradientSources,
  sourceSetNativeGradientSources,
  type GuidelineNativeGradientComparison,
} from './nativeGradientWorkspace';
import { applySourceSetReview, prepareSourceSetEntry, type SourceSetDraft } from './sourceSet';
import { readSourceSetProject, serializeSourceSetProject } from './sourceSetProject';
import { authoredGradientControls, createGuidelineContinuousGradient } from './authoredGradient';
import { createNativeGradientComparison } from './nativeGradientComparison';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { hashCanonical } from './intakeClient';
import { createFigmaNativeInventory } from './figmaInventory';
import { compileFigmaReview, suggestFigmaReview } from './figmaReview';
import { guidelineHash } from './review';
import { prepareSourceSetRefresh, replaySourceSetRefresh } from './sourceSetRefresh';

async function single() {
  const value = await nativeGradientComparisonFixture();
  const project = await buildFigmaProject({
    capture: value.inventory.packet,
    draft: value.review.decision.draft,
    review: value.review,
    selection: null,
  });
  // Intentionally noncanonical whitespace: outer writers must keep original inner bytes.
  const sourceProjectJson = `${JSON.stringify(project, null, 2)}\n`;
  const comparison: GuidelineNativeGradientComparison = {
    sourceEntryId: null,
    sourceEntryModeId: null,
    comparison: value.wide,
  };
  return { ...value, sourceProjectJson, comparison };
}
async function combined() {
  const value = await single();
  const prepared = await prepareSourceSetEntry(value.sourceProjectJson, 'native-member');
  const companion = await prepareSourceSetEntry(JSON.stringify(sourceSetPdf()), 'pdf-member');
  const draft: SourceSetDraft = {
    entries: [prepared.entry, companion.entry],
    subjects: [...prepared.subjects, ...companion.subjects],
    scope: 'brand',
    resolutions: [],
  };
  const review = await applySourceSetReview(draft, {
    actor: value.review.decision.actor,
    reviewedAt: value.review.decision.reviewedAt,
  });
  const modeId = review.model.modes[0].id;
  const black = review.model.colors.find(color => color.valuesByMode[modeId]?.components.r === 0)!;
  const selection = createGuidelineContinuousGradient(review, {
    modeId,
    scope: 'brand',
    angle: 43.5,
    route: { space: 'oklab' },
    stops: [0, 1].map(position => ({ colorId: black.id, position, locked: true })),
  });
  const sources = await sourceSetNativeGradientSources(draft);
  const source = sources[0];
  const comparison: GuidelineNativeGradientComparison = {
    sourceEntryId: source.sourceEntryId,
    sourceEntryModeId: source.sourceEntryModeId,
    comparison: createNativeGradientComparison(
      review,
      selection,
      source.evidence,
      value.wide.frame
    ),
  };
  return { value, draft, review, selection, sources, comparison };
}
function reseal(raw: Record<string, unknown>, hash: 'bundleHash' | 'projectHash') {
  const body = { ...raw };
  delete body[hash];
  return JSON.stringify({ ...body, [hash]: guidelineHash(body) });
}

describe('native-gradient workspace binding', () => {
  it('resolves single sources once and replays only their unchanged capture and selection', async () => {
    const value = await single();
    const sources = singleNativeGradientSources(value.inventory);
    expect(singleNativeGradientSources(value.inventory)).toBe(sources);
    expect(sources[0].sourceEntryId).toBeNull();
    expect(sources[0].sourceEntryModeId).toBeNull();
    expect(sources[0].capture).toBe(value.inventory.packet);
    expect(
      readGuidelineNativeGradientComparison(
        value.comparison,
        value.review,
        value.selection,
        sources
      )
    ).toEqual(value.comparison);
    expect(readGuidelineNativeGradientComparison(null, null, null, [])).toBeNull();
    expect(() =>
      readGuidelineNativeGradientComparison(value.comparison, null, value.selection, sources)
    ).toThrow('reviewed source');
    expect(() =>
      readGuidelineNativeGradientComparison(value.comparison, value.review, null, sources)
    ).toThrow('selected gradient');
    expect(() =>
      readGuidelineNativeGradientComparison(value.comparison, value.review, value.selection, [])
    ).toThrow('missing or changed');
    expect(() =>
      readGuidelineNativeGradientComparison(value.comparison, value.review, value.selection, [
        { ...sources[0] },
      ])
    ).toThrow('missing or changed');
  });

  it('writes V13 only for a comparison, keeps source bytes, and cold-replays the exact composition', async () => {
    const value = await single();
    const json = await serializeGuidelineWorkspace(
      value.sourceProjectJson,
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      null,
      value.selection,
      value.comparison
    );
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v13');
    expect(JSON.parse(json).sourceProjectJson).toBe(value.sourceProjectJson);
    await readAnyGuidelineProject(json); // Consume the writer's exact-byte validation receipt.
    const cold = await readAnyGuidelineProject(json);
    expect(cold.status).toBe('opened');
    if (cold.status !== 'opened') throw new Error('Expected current workspace.');
    expect(cold.value.gradientComparison).toEqual(value.comparison);
    expect(cold.value.gradientSelection).toEqual(value.selection);
    expect(cold.value.gradientComparison?.comparison.sourceSvg).toBe(value.wide.sourceSvg);
    expect(cold.value.gradientComparison?.comparison.proposalSvg).toBe(value.wide.proposalSvg);
    expect(
      await serializeGuidelineWorkspace(value.sourceProjectJson, EMPTY_GUIDELINE_OUTPUTS)
    ).toBe(value.sourceProjectJson);
    const without = await serializeGuidelineWorkspace(
      value.sourceProjectJson,
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      null,
      value.selection
    );
    expect(JSON.parse(without).schemaVersion).toBe('teul.guideline-workspace.v7');
    expect(JSON.parse(without)).not.toHaveProperty('gradientComparison');
  });

  it.each(['old-envelope', 'unknown-field', 'source', 'content', 'empty', 'missing-selection'])(
    'rejects a resealed single-source %s substitution',
    async field => {
      const value = await single();
      const raw = JSON.parse(
        await serializeGuidelineWorkspace(
          value.sourceProjectJson,
          EMPTY_GUIDELINE_OUTPUTS,
          null,
          undefined,
          null,
          value.selection,
          value.comparison
        )
      );
      if (field === 'old-envelope') raw.schemaVersion = 'teul.guideline-workspace.v12';
      if (field === 'unknown-field') raw.gradientComparison.approved = true;
      if (field === 'source') raw.gradientComparison.comparison.source.captureHash = 'sha256:wrong';
      if (field === 'content') raw.gradientComparison.comparison.content.artwork.text = 'Approved';
      if (field === 'empty') raw.gradientComparison = null;
      if (field === 'missing-selection') raw.gradientSelection = null;
      await expect(readAnyGuidelineProject(reseal(raw, 'bundleHash'))).rejects.toThrow();
    }
  );

  it('rejects an unsupported single-source attempt as retained workspace state', async () => {
    const value = await single();
    const attempt = {
      ...value.comparison,
      comparison: createNativeGradientComparison(value.review, value.selection, value.evidence, {
        width: 64,
        height: 64,
        interpretation: 'srgb',
      }),
    };
    expect(attempt.comparison.status).toBe('unsupported');
    expect(attempt.comparison.sourceSvg).toBeNull();
    const write = (comparison: GuidelineNativeGradientComparison) =>
      serializeGuidelineWorkspace(
        value.sourceProjectJson,
        EMPTY_GUIDELINE_OUTPUTS,
        null,
        undefined,
        null,
        value.selection,
        comparison
      );
    const raw = JSON.parse(await write(value.comparison));
    raw.gradientComparison = attempt;
    await expect(readAnyGuidelineProject(reseal(raw, 'bundleHash'))).rejects.toThrow(
      'Only a rendered native comparison can be retained'
    );
    await expect(write(attempt)).rejects.toThrow(
      'Only a rendered native comparison can be retained'
    );
  });

  it('returns future versions read-only without trying to rewrite inner projects', async () => {
    expect(
      await readAnyGuidelineProject(
        JSON.stringify({ schemaVersion: 'teul.guideline-workspace.v99' })
      )
    ).toEqual({ status: 'read-only', version: 'teul.guideline-workspace.v99' });
    expect(
      await readSourceSetProject(JSON.stringify({ schemaVersion: 'teul.source-set-project.v99' }))
    ).toEqual({ status: 'read-only', version: 'teul.source-set-project.v99' });
  });

  it('rejects a gradient-only capture change even when the old solid review remains supplied', async () => {
    const value = await single();
    const { contentHash: _oldHash, ...content } = structuredClone(value.inventory.packet);
    const children = content.roots[0].document.children as Record<string, any>[];
    children[0].fills[0].gradientHandlePositions[2].x += 0.01;
    const inventory = await createFigmaNativeInventory({
      ...content,
      contentHash: await hashCanonical(canonicalIntakeJson(content)),
    });
    expect(() =>
      readGuidelineNativeGradientComparison(
        value.comparison,
        value.review,
        value.selection,
        singleNativeGradientSources(inventory)
      )
    ).toThrow('missing or changed');
  });

  it('retains member mode independently of Working and cold-replays combined V7', async () => {
    const value = await combined();
    expect(value.sources[0].sourceEntryId).toBe('native-member');
    expect(value.sources[0].sourceEntryModeId).toBe(value.draft.entries[0].modeId);
    expect(value.selection.modeId).toBe('Working');
    expect(value.sources[0].sourceEntryModeId).not.toBe(value.selection.modeId);
    const json = await serializeSourceSetProject({
      draft: value.draft,
      review: value.review,
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      gradientSelection: value.selection,
      gradientComparison: value.comparison,
    });
    expect(JSON.parse(json).schemaVersion).toBe('teul.source-set-project.v7');
    expect(JSON.parse(json).draft.entries[0].projectJson).toBe(value.value.sourceProjectJson);
    const reopened = await readSourceSetProject(json);
    if (reopened.status !== 'opened') throw new Error('Expected current source set.');
    expect(reopened.value.gradientComparison).toEqual(value.comparison);
    expect(reopened.value.gradientSelection).toEqual(value.selection);
    const without = await serializeSourceSetProject({
      draft: value.draft,
      review: value.review,
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      gradientSelection: value.selection,
    });
    expect(JSON.parse(without).schemaVersion).toBe('teul.source-set-project.v1');
    expect(JSON.parse(without)).not.toHaveProperty('gradientComparison');
    expect(await sourceSetNativeGradientSources({ ...value.draft, entries: [] })).toEqual([]);
  });

  it.each(['member', 'mode', 'missing-mode', 'capture', 'old-envelope', 'empty'])(
    'rejects a resealed combined %s substitution',
    async field => {
      const value = await combined();
      const raw = JSON.parse(
        await serializeSourceSetProject({
          draft: value.draft,
          review: value.review,
          outputs: EMPTY_GUIDELINE_OUTPUTS,
          gradientSelection: value.selection,
          gradientComparison: value.comparison,
        })
      );
      if (field === 'member') raw.gradientComparison.sourceEntryId = 'other';
      if (field === 'mode') raw.gradientComparison.sourceEntryModeId = 'Working';
      if (field === 'missing-mode') raw.gradientComparison.sourceEntryModeId = null;
      if (field === 'capture')
        raw.gradientComparison.comparison.source.captureHash = 'sha256:other';
      if (field === 'old-envelope') raw.schemaVersion = 'teul.source-set-project.v6';
      if (field === 'empty') raw.gradientComparison = null;
      await expect(readSourceSetProject(reseal(raw, 'projectHash'))).rejects.toThrow();
    }
  );

  it('rejects an unsupported combined-source attempt as retained workspace state', async () => {
    const value = await combined();
    const white = value.review.model.colors.find(
      color => color.valuesByMode[value.selection.modeId]?.components.r === 1
    )!;
    const selection = createGuidelineContinuousGradient(
      value.review,
      authoredGradientControls(value.selection),
      {
        origin: 'designer-authored',
        use: {
          kind: 'text',
          foregroundColorId: white.id,
          minimumRatio: 4.5,
          footprint: { start: 0.2, end: 0.8 },
        },
        limits: [],
      }
    );
    const comparison = (width: number, height: number) => ({
      ...value.comparison,
      comparison: createNativeGradientComparison(
        value.review,
        selection,
        value.sources[0].evidence,
        {
          width,
          height,
          interpretation: 'srgb',
        }
      ),
    });
    const attempt = comparison(64, 64);
    expect(attempt.comparison.status).toBe('unsupported');
    expect(attempt.comparison.proposalSvg).toBeNull();
    const write = (gradientComparison: GuidelineNativeGradientComparison) =>
      serializeSourceSetProject({
        draft: value.draft,
        review: value.review,
        outputs: EMPTY_GUIDELINE_OUTPUTS,
        gradientSelection: selection,
        gradientComparison,
      });
    const raw = JSON.parse(await write(comparison(400, 240)));
    raw.gradientComparison = attempt;
    await expect(readSourceSetProject(reseal(raw, 'projectHash'))).rejects.toThrow(
      'Only a rendered native comparison can be retained'
    );
    await expect(write(attempt)).rejects.toThrow(
      'Only a rendered native comparison can be retained'
    );
  });

  it('reopens validated members and rejects undeclared member modes, future files and cancellation', async () => {
    const value = await combined();
    await expect(
      sourceSetNativeGradientSources({
        ...value.draft,
        entries: [{ ...value.draft.entries[0], modeId: 'not-captured' }],
      })
    ).rejects.toThrow('selected source mode');
    await expect(
      sourceSetNativeGradientSources({
        ...value.draft,
        entries: [
          {
            ...value.draft.entries[0],
            projectJson: JSON.stringify({ schemaVersion: 'teul.guideline-workspace.v99' }),
          },
        ],
      })
    ).rejects.toThrow('read-only');
    const controller = new AbortController();
    controller.abort();
    await expect(sourceSetNativeGradientSources(value.draft, controller.signal)).rejects.toThrow();
  });

  it('keeps a prior comparison in flat V6 history after a gradient-only member update, without restoring it', async () => {
    const value = await combined();
    const previous = {
      draft: value.draft,
      review: value.review,
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      gradientSelection: value.selection,
      gradientComparison: value.comparison,
    };
    const previousJson = await serializeSourceSetProject(previous);
    const { contentHash: _hash, ...content } = structuredClone(value.value.inventory.packet);
    const children = content.roots[0].document.children as Record<string, any>[];
    children[0].fills[0].gradientHandlePositions[2].x += 0.01;
    const inventory = await createFigmaNativeInventory({
      ...content,
      contentHash: await hashCanonical(canonicalIntakeJson(content)),
    });
    const nativeDraft = suggestFigmaReview(inventory);
    nativeDraft.modeIds = value.value.review.decision.draft.modeIds;
    nativeDraft.colors = inventory.declarations.map(item => ({
      declarationId: item.id,
      label: item.label,
      family: 'Synthetic',
    }));
    nativeDraft.profileDecision = {
      ...value.value.review.decision.draft.profileDecision!,
      captureHash: inventory.packet.contentHash,
    };
    nativeDraft.scopeDecision = value.value.review.decision.draft.scopeDecision;
    const nativeReview = compileFigmaReview(
      inventory,
      nativeDraft,
      value.value.review.decision.actor,
      value.value.review.decision.reviewedAt
    );
    const solidValues = (review: typeof nativeReview) =>
      Object.fromEntries(review.model.colors.map(color => [color.label, color.valuesByMode]));
    expect(solidValues(nativeReview)).toEqual(solidValues(value.value.review));
    const replacement = JSON.stringify(
      await buildFigmaProject({
        capture: inventory.packet,
        draft: nativeDraft,
        review: nativeReview,
        selection: null,
      })
    );
    const prepared = await prepareSourceSetRefresh(previous, 'native-member', replacement);
    expect(prepared.lineage.schemaVersion).toBe('teul.source-set-refresh.v6');
    expect(prepared.lineage.previousProjectJson).toBe(previousJson);
    const current = {
      draft: prepared.proposal.draft,
      review: await applySourceSetReview(prepared.proposal.draft, {
        actor: value.review.decision.actor,
        reviewedAt: value.review.decision.reviewedAt,
      }),
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      gradientSelection: null,
      gradientComparison: null,
      refresh: prepared.lineage,
    };
    const json = await serializeSourceSetProject(current);
    const raw = JSON.parse(json);
    expect(raw.schemaVersion).toBe('teul.source-set-project.v7');
    expect(raw.gradientComparison).toBeNull();
    const opened = await readSourceSetProject(json);
    if (opened.status !== 'opened') throw new Error('Expected current history.');
    expect(opened.value.gradientComparison ?? null).toBeNull();
    expect(opened.value.refresh!.previousProjectJson).toBe(previousJson);
    const recovered = await readSourceSetProject(opened.value.refresh!.previousProjectJson);
    if (recovered.status !== 'opened') throw new Error('Expected recoverable prior project.');
    expect(recovered.value.gradientComparison).toEqual(value.comparison);
    expect(recovered.value.gradientComparison?.comparison.sourceSvg).toBe(
      value.comparison.comparison.sourceSvg
    );
    const replay = await replaySourceSetRefresh(opened.value);
    expect(replay.selection).not.toBeNull();
    expect(replay).not.toHaveProperty('gradientComparison');
    const sources = await sourceSetNativeGradientSources(opened.value.draft);
    expect(() =>
      readGuidelineNativeGradientComparison(
        value.comparison,
        opened.value.review,
        replay.selection,
        sources
      )
    ).toThrow('missing or changed');
    const fresh = createNativeGradientComparison(
      current.review,
      replay.selection!,
      sources[0].evidence,
      value.comparison.comparison.frame
    );
    expect(fresh.comparisonHash).not.toBe(value.comparison.comparison.comparisonHash);
    expect(fresh.source.captureHash).toBe(inventory.packet.contentHash);

    for (let version = 1; version <= 6; version++) {
      const legacy = { ...raw, schemaVersion: `teul.source-set-project.v${version}` };
      delete legacy.gradientComparison;
      if (version < 4) {
        delete legacy.authoring;
        delete legacy.designBrief;
      }
      await expect(readSourceSetProject(reseal(legacy, 'projectHash'))).rejects.toThrow();
    }
    const nestedPredecessor = JSON.parse(prepared.lineage.previousProjectJson);
    nestedPredecessor.refresh = prepared.lineage;
    const changedLineage = {
      ...prepared.lineage,
      previousProjectJson: reseal(nestedPredecessor, 'projectHash'),
    };
    const { lineageHash: _lineageHash, ...lineageBody } = changedLineage;
    raw.refresh = { ...lineageBody, lineageHash: guidelineHash(lineageBody) };
    await expect(readSourceSetProject(reseal(raw, 'projectHash'))).rejects.toThrow(
      'flat predecessor'
    );
  });
});
