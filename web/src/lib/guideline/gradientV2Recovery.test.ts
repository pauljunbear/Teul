import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/guidelines/figma-project-v1.json';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { readFigmaProject, buildFigmaProject } from './figmaProject';
import { createFigmaNativeInventory } from './figmaInventory';
import { compileFigmaReview } from './figmaReview';
import { proposeFigmaRefresh } from './nativeRefreshSources';
import {
  AUTHORED_GRADIENT_VERSION,
  CONTINUOUS_GRADIENT_VERSION,
  authoredGradientControls,
  createGuidelineAuthoredGradient,
  createGuidelineContinuousGradient,
  readGuidelineAuthoredGradient,
  type GuidelineGradientControls,
  type GuidelineGradientPolicy,
} from './authoredGradient';
import { createGuidelineGradientCatalog, gradientCatalogControlId } from './gradientCatalog';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { createGuidelineRefreshLineage, readGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh } from './refreshReplay';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import { guidelineHash } from './review';

type Data = Record<string, any>;
const decorative: GuidelineGradientPolicy = {
  origin: 'designer-authored',
  use: { kind: 'decorative' },
  limits: [],
};
const actor = { kind: 'user' as const, ref: 'test:gradient-v2-refresh' };
const time = '2026-09-27T04:00:00.000Z';
function rehash(raw: Data, key: string) {
  const { [key]: _digest, ...content } = raw;
  raw[key] = guidelineHash(content);
}
async function setup() {
  const opened = await readFigmaProject(fixture);
  if (opened.status !== 'opened' || !opened.project.review) throw new Error('Fixture');
  const source = {
    kind: 'figma' as const,
    inventory: opened.inventory,
    project: await buildFigmaProject({
      capture: opened.project.capture,
      draft: opened.project.draft,
      review: opened.project.review,
      selection: null,
    }),
  };
  const review = source.project.review!;
  const controls: GuidelineGradientControls = {
    scope: 'brand',
    modeId: review.model.modes[0].id,
    angle: 43.5,
    route: { space: 'oklab' },
    stops: review.model.colors.slice(0, 2).map((color, position) => ({
      colorId: color.id,
      position,
      locked: true,
    })),
  };
  return { source, review, controls };
}
async function recapture(
  source: Awaited<ReturnType<typeof setup>>['source'],
  edit?: (capture: Data) => void
) {
  const capture = structuredClone(source.project.capture) as Data;
  capture.capturedAt = time;
  capture.request.version = 'revision-8';
  capture.file.requestedVersion = 'revision-8';
  capture.file.returnedVersion = 'revision-8';
  edit?.(capture);
  const { contentHash: _hash, ...content } = capture;
  capture.contentHash = `sha256:${createHash('sha256')
    .update(canonicalIntakeJson(content))
    .digest('hex')}`;
  const inventory = await createFigmaNativeInventory(capture);
  const proposal = proposeFigmaRefresh(source.inventory, source.project.draft, inventory);
  const draft = structuredClone(proposal.draft);
  draft.scopeDecision = { ...draft.scopeDecision, accepted: true };
  draft.profileDecision = {
    captureHash: inventory.packet.contentHash,
    interpretation: 'srgb',
    actor,
    decidedAt: time,
  };
  const review = compileFigmaReview(inventory, draft, actor, time);
  return {
    kind: 'figma' as const,
    inventory,
    project: await buildFigmaProject({ capture: inventory.packet, draft, review, selection: null }),
  };
}
async function portable(
  source: Awaited<ReturnType<typeof setup>>['source'],
  selection: ReturnType<typeof createGuidelineContinuousGradient>
) {
  const bytes = await serializeGuidelineWorkspace(
    JSON.stringify(source.project),
    EMPTY_GUIDELINE_OUTPUTS,
    null,
    undefined,
    null,
    selection
  );
  // Exercise the parser after consuming the immediate serialization cache.
  await readAnyGuidelineProject(bytes);
  return bytes;
}

describe('continuous-gradient saved work and refresh', () => {
  it('round-trips workspace V7 with exact paint and source bindings, without saved verification', async () => {
    const { source, review, controls } = await setup();
    const selection = createGuidelineContinuousGradient(review, controls, decorative);
    const bytes = await portable(source, selection);
    expect(JSON.parse(bytes).schemaVersion).toBe('teul.guideline-workspace.v7');
    const opened = await readAnyGuidelineProject(bytes);
    if (opened.status !== 'opened') throw new Error('Not reopened');
    expect(opened.value.gradientSelection).toEqual(selection);
    expect(opened.value.gradientSelection).not.toHaveProperty('assessment');
    expect(authoredGradientControls(opened.value.gradientSelection!)).toEqual(controls);
    expect(JSON.parse(bytes).sourceProjectJson).toBe(JSON.stringify(source.project));
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      source,
      undefined,
      selection
    );
    const replay = await replayGuidelineRefresh(lineage, source);
    expect(replay.items[0].status).toBe('restorable');
    expect(replay.selection).toEqual(selection);
    expect(selection.catalog).toBeNull();
    expect(selection.stopRefs.every(ref => ref.kind === 'source')).toBe(true);
  });

  it('rejects a forged saved success even when the workspace digest is recomputed', async () => {
    const { source, review, controls } = await setup();
    const bytes = await portable(
      source,
      createGuidelineContinuousGradient(review, controls, decorative)
    );
    for (const location of ['selection', 'design'] as const) {
      const raw = JSON.parse(bytes);
      const selected = raw.gradientSelection;
      (location === 'selection' ? selected : selected.design).assessment = {
        status: 'pass',
        qualified: true,
      };
      if (location === 'design') rehash(selected.design, 'designHash');
      rehash(raw, 'bundleHash');
      await expect(readAnyGuidelineProject(JSON.stringify(raw))).rejects.toThrow();
    }
  });

  it('rejects V4 selections in every older workspace envelope and V6 history in older history formats', async () => {
    const { source, review, controls } = await setup();
    const selection = createGuidelineContinuousGradient(review, controls, decorative);
    const bytes = await portable(source, selection);
    for (let version = 1; version <= 6; version++) {
      const raw = JSON.parse(bytes);
      raw.schemaVersion = `teul.guideline-workspace.v${version}`;
      if (version === 1) delete raw.refreshLineage;
      if (version < 4) delete raw.supportingSelection;
      rehash(raw, 'bundleHash');
      await expect(readAnyGuidelineProject(JSON.stringify(raw))).rejects.toThrow();
    }
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      source,
      undefined,
      selection
    );
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v6');
    for (let version = 1; version <= 5; version++) {
      const raw = structuredClone(lineage) as Data;
      raw.schemaVersion = `teul.guideline-refresh-lineage.v${version}`;
      if (version < 3) delete raw.previousSupporting;
      rehash(raw, 'lineageHash');
      await expect(readGuidelineRefreshLineage(raw, source)).rejects.toThrow();
    }
    const saved = await serializeGuidelineWorkspace(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      lineage
    );
    expect(JSON.parse(saved).schemaVersion).toBe('teul.guideline-workspace.v7');
    for (let version = 3; version <= 6; version++) {
      const raw = JSON.parse(saved);
      raw.schemaVersion = `teul.guideline-workspace.v${version}`;
      if (version === 3) delete raw.supportingSelection;
      rehash(raw, 'bundleHash');
      await expect(readAnyGuidelineProject(JSON.stringify(raw))).rejects.toThrow('V7');
    }
  });

  it('rebinds exact retained paint, source IDs, foreground and catalog permission after a new source revision', async () => {
    const { source, review, controls } = await setup();
    const catalog = createGuidelineGradientCatalog(review, {
      scope: controls.scope,
      modeId: controls.modeId,
      sourceAnchorIds: [controls.stops[0].colorId],
      provider: 'radix',
      scheme: 'light',
      candidateId: 'radix:blue',
    });
    const selectedControls = {
      ...controls,
      stops: [
        controls.stops[0],
        { position: 1, locked: false, colorId: gradientCatalogControlId(catalog.memberIds[8]) },
      ],
    };
    const policy: GuidelineGradientPolicy = {
      ...decorative,
      use: {
        kind: 'text',
        foregroundColorId: controls.stops[1].colorId,
        minimumRatio: 4.5,
        footprint: { start: 0, end: 1 },
      },
    };
    const proposed = createGuidelineContinuousGradient(review, selectedControls, policy, catalog);
    // A structurally valid retained paint need not be the current compiler proposal or pass
    // fidelity. Storage preserves it; only the worker can authorize preview and export.
    const retainedPaint = {
      ...proposed.design.compiledPaint,
      stops: [
        proposed.design.compiledPaint.stops[0],
        {
          position: 0.5,
          value: buildColorSystemSrgbValueV1({ r: 1, g: 0, b: 0 }),
        },
        proposed.design.compiledPaint.stops.at(-1)!,
      ],
    };
    const selected = createGuidelineContinuousGradient(
      review,
      selectedControls,
      policy,
      catalog,
      retainedPaint.stops
    );
    const target = await recapture(source);
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      target,
      undefined,
      selected
    );
    const saved = await serializeGuidelineWorkspace(
      JSON.stringify(target.project),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      lineage
    );
    await readAnyGuidelineProject(saved);
    const opened = await readAnyGuidelineProject(saved);
    if (opened.status !== 'opened') throw new Error('Not reopened');
    const replay = await replayGuidelineRefresh(opened.value.refreshLineage!, opened.value);
    expect(replay.items[0].status, replay.items[0].reason).toBe('restorable');
    const restored = replay.selection;
    if (
      !restored ||
      !('schemaVersion' in restored) ||
      restored.schemaVersion !== CONTINUOUS_GRADIENT_VERSION
    )
      throw new Error('Wrong selection');
    expect(restored.design.compiledPaint).toEqual(retainedPaint);
    expect(restored.design.sourceModelHash).toBe(target.project.review!.model.modelHash);
    expect(restored.design.sourceModelHash).not.toBe(selected.design.sourceModelHash);
    expect(restored.stopRefs[0]).toEqual({
      kind: 'source',
      colorId: target.project.review!.model.colors.find(
        c => c.label === review.model.colors[0].label
      )!.id,
    });
    expect(restored.stopRefs[0]).not.toEqual(selected.stopRefs[0]);
    expect(restored.stopRefs[1]).toEqual(selected.stopRefs[1]);
    expect(restored.policy.use).toMatchObject({
      foregroundColorId: target.project.review!.model.colors.find(
        c => c.label === review.model.colors[1].label
      )!.id,
    });
    expect(restored.catalog?.sourceAnchorIds).toEqual([restored.design.stops[0].sourceColorId]);
    expect(restored.catalog?.catalogHash).toBe(catalog.catalogHash);
    expect(restored.catalog?.referenceHash).toBe(catalog.referenceHash);
    expect(restored.catalog?.memberIds).toEqual(catalog.memberIds);
    expect(restored).not.toHaveProperty('assessment');

    const bad = structuredClone(lineage) as Data;
    bad.previousGradient.catalog.referenceHash = 'sha256:' + '0'.repeat(64);
    rehash(bad, 'lineageHash');
    await expect(readGuidelineRefreshLineage(bad, target)).rejects.toThrow(/catalog/i);
  });

  it('marks retained V4 paint stale when its separate text foreground changes', async () => {
    const { source, review, controls } = await setup();
    const selection = createGuidelineContinuousGradient(
      review,
      {
        ...controls,
        stops: [controls.stops[0], { ...controls.stops[0], position: 1 }],
      },
      {
        ...decorative,
        use: {
          kind: 'text',
          foregroundColorId: controls.stops[1].colorId,
          minimumRatio: 4.5,
          footprint: { start: 0, end: 1 },
        },
      }
    );
    const target = await recapture(source, raw => {
      raw.roots[0].document.children[1].fills[0].color.r = 0.4;
    });
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      target,
      undefined,
      selection
    );
    const replay = await replayGuidelineRefresh(lineage, target);
    expect(replay.items[0].status).toBe('stale');
    expect(replay.selection).toBeNull();
  });

  it('preserves legacy V1 source selections and authored replay without upgrading their paint or envelopes', async () => {
    const original = await readAnyGuidelineProject(JSON.stringify(fixture));
    if (original.status !== 'opened') throw new Error('Not opened');
    expect(original.value.project.selection).toEqual(fixture.selection);
    expect(original.value.gradientSelection).toBeNull();
    const { source, review, controls } = await setup();
    const selected = createGuidelineAuthoredGradient(review, controls);
    expect(selected.schemaVersion).toBe(AUTHORED_GRADIENT_VERSION);
    expect(readGuidelineAuthoredGradient(review, JSON.parse(JSON.stringify(selected)))).toEqual(
      selected
    );
    const bytes = await serializeGuidelineWorkspace(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      null,
      selected
    );
    expect(JSON.parse(bytes).schemaVersion).toBe('teul.guideline-workspace.v3');
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      source,
      undefined,
      selected
    );
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v2');
    expect((await replayGuidelineRefresh(lineage, source)).selection).toEqual(selected);
  });
});
