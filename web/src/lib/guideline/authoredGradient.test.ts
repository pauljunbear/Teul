import { describe, expect, it } from 'vitest';
import figma from '../../../fixtures/guidelines/figma-project-v1.json';
import { readFigmaProject, buildFigmaProject } from './figmaProject';
import {
  createGuidelineAuthoredGradient,
  ASSESSED_GRADIENT_VERSION,
  type GuidelineGradientPolicy,
  readGuidelineAuthoredGradient,
  authoredGradientControls,
  type GuidelineGradientControls,
} from './authoredGradient';
import { readGuidelineModeGradientSelection } from './modeGradient';
import { readGuidelineSelection } from './project';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import { createGuidelineRefreshLineage } from './refreshLineage';
import { replayGuidelineRefresh } from './refreshReplay';
import { guidelineAuthoredGradientExports } from './gradientExport';
import { guidelineHash } from './review';
import { canonicalJson, deterministicContentHash } from '../../../../src/lib/colorSystemHashing';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';

async function fixture() {
  const opened = await readFigmaProject(figma);
  if (opened.status !== 'opened' || !opened.project.review) throw new Error('Fixture');
  const source = {
    kind: 'figma' as const,
    project: await buildFigmaProject({
      capture: opened.project.capture,
      draft: opened.project.draft,
      review: opened.project.review,
      selection: null,
    }),
    inventory: opened.inventory,
  };
  const review = source.project.review!;
  const controls: GuidelineGradientControls = {
    scope: 'brand',
    modeId: review.model.modes[0].id,
    angle: 43.5,
    route: { space: 'oklab' },
    stops: Array.from({ length: 5 }, (_, i) => ({
      colorId: review.model.colors[i % 2].id,
      position: i / 4,
      locked: i % 2 === 0,
    })),
  };
  return { source, review, controls };
}
describe('authored source gradients', () => {
  it('preserves five exact source anchors, positions, locks and route through portable workspace replay', async () => {
    const { source, review, controls } = await fixture();
    const selection = createGuidelineAuthoredGradient(review, controls);
    expect(authoredGradientControls(selection)).toEqual(controls);
    selection.design.stops.forEach((s, i) =>
      expect(s.value).toEqual(
        review.model.colors.find(c => c.id === controls.stops[i].colorId)!.valuesByMode[
          controls.modeId
        ]
      )
    );
    const bytes = await serializeGuidelineWorkspace(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      null,
      selection
    );
    expect(JSON.parse(bytes).schemaVersion).toBe('teul.guideline-workspace.v3');
    const opened = await readAnyGuidelineProject(bytes);
    if (opened.status !== 'opened') throw new Error('Not opened');
    expect(opened.value.gradientSelection).toEqual(selection);
    expect(opened.value.project.selection).toBeNull();
    expect(guidelineAuthoredGradientExports(review, opened.value.gradientSelection!)).toEqual(
      guidelineAuthoredGradientExports(review, selection)
    );
    const exported = guidelineAuthoredGradientExports(review, selection);
    expect(exported.notices.length).toBeGreaterThan(0);
    expect(JSON.parse(exported.json).sourceValueNotices).toEqual(exported.notices);
  });
  it('supports both hue routes and rejects invalid positions, modes, counts, references and extra controls', async () => {
    const { review, controls } = await fixture();
    for (const huePath of ['shorter', 'longer'] as const) {
      const value = createGuidelineAuthoredGradient(review, {
        ...controls,
        stops: [controls.stops[0], { ...controls.stops[1], position: 1 }],
        route: { space: 'oklch', huePath },
      });
      expect(readGuidelineAuthoredGradient(review, JSON.parse(JSON.stringify(value)))).toEqual(
        value
      );
    }
    for (const edit of [
      (c: GuidelineGradientControls) => {
        c.stops[2].position = c.stops[1].position;
      },
      (c: GuidelineGradientControls) => {
        c.stops[0].position = 0.01;
      },
      (c: GuidelineGradientControls) => {
        c.modeId = 'fabricated';
      },
      (c: GuidelineGradientControls) => {
        c.stops[1].colorId = 'fabricated';
      },
      (c: GuidelineGradientControls) => {
        c.stops = c.stops.slice(0, 1);
      },
      (c: GuidelineGradientControls) => {
        c.stops.push(c.stops[4]);
      },
      (c: GuidelineGradientControls) => {
        Object.assign(c, { approved: true });
      },
      (c: GuidelineGradientControls) => {
        Object.assign(c, { scope: ['brand'] });
      },
      (c: GuidelineGradientControls) => {
        Object.assign(c, { modeId: [c.modeId] });
      },
    ]) {
      const bad = structuredClone(controls);
      edit(bad);
      expect(() => createGuidelineAuthoredGradient(review, bad)).toThrow();
    }
  });
  it('retains scoped source bans and rejects forged paint even with a recomputed design digest', async () => {
    const { review, controls } = await fixture();
    expect(() =>
      createGuidelineAuthoredGradient(review, { ...controls, scope: 'product' })
    ).toThrow();
    const saved = structuredClone(createGuidelineAuthoredGradient(review, controls));
    saved.design.stops[1].value = buildColorSystemSrgbValueV1({ r: 1, g: 0, b: 1 });
    const { designHash: _, ...content } = saved.design;
    saved.design.designHash = deterministicContentHash(canonicalJson(content));
    expect(() => readGuidelineAuthoredGradient(review, saved)).toThrow(/differs/);
  });
  it('keeps legacy readers strict and rejects two simultaneous gradient selections', async () => {
    const { review, controls } = await fixture();
    const selection = createGuidelineAuthoredGradient(review, controls);
    expect(() => readGuidelineModeGradientSelection(review, selection)).toThrow();
    expect(() => readGuidelineSelection(review, selection)).toThrow();
    await expect(
      serializeGuidelineWorkspace(
        JSON.stringify(figma),
        EMPTY_GUIDELINE_OUTPUTS,
        null,
        undefined,
        null,
        selection
      )
    ).rejects.toThrow(/two selected/);
    const old = await readAnyGuidelineProject(JSON.stringify(figma));
    if (old.status !== 'opened') throw new Error('Not opened');
    expect(old.value.project.selection).toEqual(figma.selection);
    expect(old.value.gradientSelection).toBeNull();
  });
  it('retains and replays all stops in flat lineage V2, including when the new current selection is empty', async () => {
    const { source, review, controls } = await fixture();
    const selection = createGuidelineAuthoredGradient(review, controls);
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      source,
      undefined,
      selection
    );
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v2');
    const bytes = await serializeGuidelineWorkspace(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      lineage
    );
    const saved = JSON.parse(bytes);
    expect(saved.schemaVersion).toBe('teul.guideline-workspace.v3');
    const opened = await readAnyGuidelineProject(bytes);
    if (opened.status !== 'opened') throw new Error('Not opened');
    const replay = await replayGuidelineRefresh(opened.value.refreshLineage!, opened.value);
    expect(replay.items[0].status).toBe('restorable');
    expect(replay.selection).toEqual(selection);
    saved.schemaVersion = 'teul.guideline-workspace.v2';
    delete saved.gradientSelection;
    const { bundleHash: _, ...content } = saved;
    saved.bundleHash = guidelineHash(content);
    await expect(readAnyGuidelineProject(JSON.stringify(saved))).rejects.toThrow(/V2/);
  });
});

describe('declared gradient use and workspace V5', () => {
  const decorative: GuidelineGradientPolicy = {
    origin: 'designer-authored',
    use: { kind: 'decorative' },
    limits: [],
  };
  it('binds policy to the selection and retains a failed assessment for correction without delivering SVG/CSS', async () => {
    const { source, review, controls } = await fixture();
    const policy: GuidelineGradientPolicy = {
      ...decorative,
      use: {
        kind: 'text',
        foregroundColorId: controls.stops[0].colorId,
        minimumRatio: 4.5,
        footprint: { start: 0, end: 1 },
      },
    };
    const selection = createGuidelineAuthoredGradient(review, controls, policy);
    expect(selection.schemaVersion).toBe(ASSESSED_GRADIENT_VERSION);
    const exported = guidelineAuthoredGradientExports(review, selection);
    expect(exported.assessment?.status).toBe('fail');
    expect(exported.exportable).toBe(false);
    expect(exported.svg).toBe('');
    expect(exported.css).toBe('');
    expect(JSON.parse(exported.json).policy).toEqual(policy);
    const sourceBytes = JSON.stringify(source.project);
    const json = await serializeGuidelineWorkspace(
      sourceBytes,
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      null,
      selection
    );
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v5');
    expect(JSON.parse(json).sourceProjectJson).toBe(sourceBytes);
    // Consume any prepared serialization, then exercise the portable parser directly.
    await readAnyGuidelineProject(json);
    const reopened = await readAnyGuidelineProject(json);
    if (reopened.status !== 'opened') throw new Error('Not opened');
    expect(reopened.value.gradientSelection).toEqual(selection);
    expect(guidelineAuthoredGradientExports(review, reopened.value.gradientSelection!)).toEqual(
      exported
    );
    const tampered = structuredClone(selection);
    if (tampered.schemaVersion !== ASSESSED_GRADIENT_VERSION) throw new Error('Wrong version');
    tampered.policy.use = { kind: 'decorative' };
    expect(() => readGuidelineAuthoredGradient(review, tampered)).toThrow();
  });
  it('keeps old wrappers strict even when the bundle digest is recomputed', async () => {
    const { source, review, controls } = await fixture();
    const selection = createGuidelineAuthoredGradient(review, controls, decorative);
    const bytes = await serializeGuidelineWorkspace(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      null,
      selection
    );
    for (const version of ['teul.guideline-workspace.v3', 'teul.guideline-workspace.v4']) {
      const saved = JSON.parse(bytes);
      saved.schemaVersion = version;
      if (version.endsWith('v3')) delete saved.supportingSelection;
      const { bundleHash: _, ...content } = saved;
      saved.bundleHash = guidelineHash(content);
      await expect(readAnyGuidelineProject(JSON.stringify(saved))).rejects.toThrow(/V5/);
    }
    expect(() => readGuidelineModeGradientSelection(review, selection)).toThrow();
    expect(() => readGuidelineSelection(review, selection)).toThrow();
  });
  it('replays policy and all exact source dependencies using flat lineage V4', async () => {
    const { source, review, controls } = await fixture();
    const policy: GuidelineGradientPolicy = {
      ...decorative,
      use: {
        kind: 'text',
        foregroundColorId: controls.stops[1].colorId,
        minimumRatio: 7,
        footprint: { start: 0.1, end: 0.2 },
      },
    };
    const selection = createGuidelineAuthoredGradient(review, controls, policy);
    const lineage = await createGuidelineRefreshLineage(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      source,
      undefined,
      selection
    );
    expect(lineage.schemaVersion).toBe('teul.guideline-refresh-lineage.v4');
    const bytes = await serializeGuidelineWorkspace(
      JSON.stringify(source.project),
      EMPTY_GUIDELINE_OUTPUTS,
      null,
      undefined,
      lineage
    );
    expect(JSON.parse(bytes).schemaVersion).toBe('teul.guideline-workspace.v5');
    await readAnyGuidelineProject(bytes);
    const opened = await readAnyGuidelineProject(bytes);
    if (opened.status !== 'opened') throw new Error('Not opened');
    const replay = await replayGuidelineRefresh(opened.value.refreshLineage!, opened.value);
    expect(replay.items[0].status).toBe('restorable');
    expect(replay.selection).toEqual(selection);
    const old = JSON.parse(bytes);
    old.refreshLineage.schemaVersion = 'teul.guideline-refresh-lineage.v3';
    const { lineageHash: _, ...data } = old.refreshLineage;
    old.refreshLineage.lineageHash = guidelineHash(data);
    const { bundleHash: __, ...content } = old;
    old.bundleHash = guidelineHash(content);
    await expect(readAnyGuidelineProject(JSON.stringify(old))).rejects.toThrow(/V4/);
  });
  it('does not let authored policy override source restrictions or omit a valid foreground', async () => {
    const { review, controls } = await fixture();
    expect(() =>
      createGuidelineAuthoredGradient(review, { ...controls, scope: 'product' }, decorative)
    ).toThrow();
    const policies = [
      { ...decorative, origin: 'guideline-approved' },
      { ...decorative, approved: true },
      {
        ...decorative,
        use: {
          kind: 'text',
          foregroundColorId: 'invented',
          minimumRatio: 4.5,
          footprint: { start: 0, end: 1 },
        },
      },
      {
        ...decorative,
        use: {
          kind: 'text',
          foregroundColorId: controls.stops[0].colorId,
          minimumRatio: 4.5,
          footprint: { start: 1, end: 0 },
        },
      },
    ];
    for (const policy of policies)
      expect(() =>
        createGuidelineAuthoredGradient(review, controls, policy as GuidelineGradientPolicy)
      ).toThrow();
    const pass = guidelineAuthoredGradientExports(
      review,
      createGuidelineAuthoredGradient(review, controls, decorative)
    );
    expect(pass.exportable).toBe(true);
    expect(pass.assessment?.contrast).toBeNull();
    expect(pass.svg).toContain('<svg');
  });
});
