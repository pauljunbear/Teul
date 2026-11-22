import { describe, expect, it } from 'vitest';
import figma from '../../../fixtures/guidelines/figma-project-v1.json';
import { readFigmaProject, buildFigmaProject } from './figmaProject';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import {
  readGuidelineSelectedOutputs,
  storedGuidelineOutputs,
  EMPTY_GUIDELINE_OUTPUTS,
} from './selectedOutputs';
import {
  generateGuidelineSupportingDirections,
  storedGuidelineSupportingSelection,
} from './supportingDirections';
import { createGuidelineAuthoredGradient } from './authoredGradient';
import { createGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh } from './refreshReplay';
import { guidelineHash } from './review';

async function fixture() {
  const opened = await readFigmaProject(figma);
  if (opened.status !== 'opened' || !opened.project.review) throw new Error('Fixture');
  const project = await buildFigmaProject({
    capture: opened.project.capture,
    draft: opened.project.draft,
    review: opened.project.review,
    selection: null,
  });
  const source = { kind: 'figma' as const, project, inventory: opened.inventory };
  const review = project.review!,
    modeId = review.model.contexts.find(c => c.id === 'brand')!.modeIds[0];
  const colors = review.model.colors.filter(c => c.valuesByMode[modeId]?.alpha === 1);
  const result = await generateGuidelineSupportingDirections(review, {
    layout: { kind: 'brand', modeId, layout: 'split', primaryShare: 60 },
    provider: 'wada',
    scheme: null,
    relationship: 'companion',
    anchorColorIds: [colors[0].id],
    excludedCandidateIds: [],
    sourcePaints: { ground: colors[0].id, primary: colors[1].id, accent: colors[0].id },
  });
  if (!result.directions.length) throw new Error('Fixture has no supporting direction');
  const supporting = { result, directionId: result.directions[0].id };
  const gradient = createGuidelineAuthoredGradient(review, {
    scope: 'brand',
    modeId,
    angle: 45,
    route: { space: 'oklab' },
    stops: colors.slice(0, 2).map((c, position) => ({ colorId: c.id, position, locked: true })),
  });
  return { source, supporting, gradient };
}
function reseal(saved: Record<string, unknown>) {
  const { bundleHash: _, ...content } = saved;
  return JSON.stringify({ ...content, bundleHash: guidelineHash(content) });
}

describe('supporting choices in versioned Studio workspaces', () => {
  it('keeps legacy bytes and two-key stored outputs while supporting-only work uses V4', async () => {
    const { source, supporting } = await fixture();
    const json = JSON.stringify(source.project);
    expect(await serializeGuidelineWorkspace(json, EMPTY_GUIDELINE_OUTPUTS)).toBe(json);
    const outputs = { ...EMPTY_GUIDELINE_OUTPUTS, supporting };
    expect(storedGuidelineOutputs(outputs)).toEqual(EMPTY_GUIDELINE_OUTPUTS);
    await expect(readGuidelineSelectedOutputs(outputs, source.project.review)).rejects.toThrow();
    const bytes = await serializeGuidelineWorkspace(json, outputs),
      saved = JSON.parse(bytes);
    expect(saved.schemaVersion).toBe('teul.guideline-workspace.v4');
    expect(saved.sourceProjectJson).toBe(json);
    expect(saved.outputs).toEqual(EMPTY_GUIDELINE_OUTPUTS);
    expect(saved.gradientSelection).toBeNull();
    await readAnyGuidelineProject(bytes); // Consume the one-shot prepared receipt; prove a full replay.
    const reopened = await readAnyGuidelineProject(bytes);
    if (reopened.status !== 'opened') throw new Error('Open');
    expect(storedGuidelineSupportingSelection(reopened.value.outputs.supporting!)).toBe(
      storedGuidelineSupportingSelection(supporting)
    );
  });

  it('retains a gradient beside supporting paint and rejects forged or legacy-wrapped selections', async () => {
    const { source, supporting, gradient } = await fixture();
    const bytes = await serializeGuidelineWorkspace(
      JSON.stringify(source.project),
      { ...EMPTY_GUIDELINE_OUTPUTS, supporting },
      null,
      undefined,
      null,
      gradient
    );
    const opened = await readAnyGuidelineProject(bytes);
    if (opened.status !== 'opened') throw new Error('Open');
    expect(opened.value.gradientSelection).toEqual(gradient);
    expect(opened.value.outputs.supporting?.directionId).toBe(supporting.directionId);
    const saved = JSON.parse(bytes),
      payload = JSON.parse(saved.supportingSelection);
    payload.reviewHash = guidelineHash('different review');
    saved.supportingSelection = JSON.stringify(payload);
    await expect(readAnyGuidelineProject(reseal(saved))).rejects.toThrow('changed source review');
    const old = { ...JSON.parse(bytes), schemaVersion: 'teul.guideline-workspace.v3' };
    await expect(readAnyGuidelineProject(reseal(old))).rejects.toThrow();
  });

  it('retains flat supporting history, requires V4 and restores identical paint under the current review', async () => {
    const { source, supporting, gradient } = await fixture();
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(source.project),
      { ...EMPTY_GUIDELINE_OUTPUTS, supporting },
      source,
      undefined,
      gradient
    );
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v3');
    const bytes = await serializeGuidelineWorkspace(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      lineage
    );
    expect(JSON.parse(bytes).schemaVersion).toBe('teul.guideline-workspace.v4');
    const replay = await replayGuidelineRefresh(lineage, source);
    expect(replay.items.find(i => i.kind === 'supporting')?.status).toBe('restorable');
    expect(storedGuidelineSupportingSelection(replay.outputs.supporting!)).toBe(
      storedGuidelineSupportingSelection(supporting)
    );
    const old = JSON.parse(bytes);
    old.schemaVersion = 'teul.guideline-workspace.v3';
    delete old.supportingSelection;
    await expect(readAnyGuidelineProject(reseal(old))).rejects.toThrow('requires workspace V4');
  });
});
