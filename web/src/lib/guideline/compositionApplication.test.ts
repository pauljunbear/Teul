import { parseGradientDesignV2 } from '../../../../src/lib/colorSystemGradientDesignV2';
import { describe, expect, it } from 'vitest';
import { nativeGradientComparisonFixture } from '../../../fixtures/guidelines/native-gradient-comparison-fixture';
import { createGuidelineContinuousGradient } from './authoredGradient';
import {
  assessGuidelineApplication,
  exportGuidelineApplication,
  readGuidelineApplication,
  type GuidelineApplicationRequest,
} from './application';
import {
  buildGuidelineApplicationLayout,
  exportGuidelineApplicationSvgs,
} from './applicationGeometry';
import { guidelineGradientSelectionNotices } from './gradientExport';
import { guidelineContextPaintChoices, type GuidelineContextPaints } from './contextPaints';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';

async function fixture() {
  const { review } = await nativeGradientComparisonFixture(false);
  const modeId = review.model.modes[0].id;
  const white = review.model.colors.find(c => c.valuesByMode[modeId]?.hex === '#FFFFFF')!.id;
  const black = review.model.colors.find(c => c.valuesByMode[modeId]?.hex === '#000000')!.id;
  const selection = createGuidelineContinuousGradient(review, {
    modeId,
    scope: 'brand',
    angle: 43.5,
    route: { space: 'oklab' },
    stops: [black, white].map((colorId, position) => ({ colorId, position, locked: true })),
  });
  const request: GuidelineApplicationRequest = {
    layout: {
      kind: 'composition',
      sourceContextId: 'brand',
      modeId,
      width: 400,
      height: 320,
      heading: 'Retain the whole design',
      body: 'One source, one checked composition.',
    },
    decorativeGradient: { selection },
    assignments: ['ground', 'text-1', 'text-2'].map((useId, i) => ({
      applicationId: 'composition',
      useId,
      colorId: i ? black : white,
    })),
    extension: null,
  };
  return { review, request, white, black };
}

describe('mixed application execution and export', () => {
  it('replays complete retained paint and measured text through the shared SVG renderer and V7 reader', async () => {
    const { review, request } = await fixture();
    const result = await assessGuidelineApplication(review, request);
    expect(result.status).toBe('ready');
    expect(result.decorativeGradient?.exportable).toBe(true);
    const exports = await exportGuidelineApplication(result);
    expect(exports.capabilities).toEqual(['application', 'svg']);
    expect(exports.cssText).toBeNull();
    expect(exports.dtcgJson).toBeNull();
    expect(JSON.parse(exports.applicationJson).schemaVersion).toBe('teul.guideline-application.v7');
    expect(exports.svgs).toEqual(
      exportGuidelineApplicationSvgs(
        result.model,
        result.applications,
        result.layout,
        guidelineGradientSelectionNotices(review, request.decorativeGradient!.selection)
      )
    );
    expect(exports.svgs[0].svg).toContain('<linearGradient');
    expect(exports.svgs[0].svg).toContain('<title>Retain the whole design</title>');
    const reopened = await readGuidelineApplication(exports.applicationJson, review);
    expect(await exportGuidelineApplication(reopened)).toEqual(exports);
    for (const schemaVersion of ['teul.guideline-application.v1', 'teul.guideline-application.v6'])
      await expect(
        readGuidelineApplication(
          JSON.stringify({ ...JSON.parse(exports.applicationJson), schemaVersion }),
          review
        )
      ).rejects.toThrow('V7');
    await expect(exportGuidelineApplication(structuredClone(result))).rejects.toThrow('Assess');
  });

  it('materializes custom solids without regenerating or changing the reviewed gradient', async () => {
    const { review, request } = await fixture();
    const before = JSON.stringify({ review, selection: request.decorativeGradient!.selection });
    const contextPaints: GuidelineContextPaints = {
      version: 'teul.context-paints.v1',
      id: 'composition:custom',
      actor: { kind: 'user', ref: 'synthetic-test' },
      paints: [
        {
          id: 'canvas',
          label: 'Warm canvas',
          modeId: request.layout.modeId,
          role: 'background',
          value: buildColorSystemSrgbValueV1({ r: 1, g: 0.95, b: 0.9 }),
        },
        {
          id: 'ink',
          label: 'Custom ink',
          modeId: request.layout.modeId,
          role: 'foreground',
          value: buildColorSystemSrgbValueV1({ r: 0.03, g: 0.02, b: 0.01 }),
        },
      ],
    };
    const colors = guidelineContextPaintChoices(contextPaints);
    const result = await assessGuidelineApplication(review, {
      ...request,
      contextPaints,
      assignments: request.assignments.map((a, i) => ({ ...a, colorId: colors[i ? 1 : 0].id })),
    });
    expect(result.recipe).not.toBeNull();
    expect(result.model!.modelHash).not.toBe(review.model.modelHash);
    const bound = result.decorativeGradient!.binding.paint;
    expect(bound.sourceModelHash).toBe(result.model!.modelHash);
    expect(bound.designHash).not.toBe(request.decorativeGradient!.selection.design.designHash);
    expect(parseGradientDesignV2(bound).compiledPaint).toEqual(
      parseGradientDesignV2(request.decorativeGradient!.selection.design).compiledPaint
    );
    expect(bound.stops).toEqual(request.decorativeGradient!.selection.design.stops);
    expect(JSON.stringify({ review, selection: request.decorativeGradient!.selection })).toBe(
      before
    );
    const exports = await exportGuidelineApplication(result);
    expect(
      await exportGuidelineApplication(
        await readGuidelineApplication(exports.applicationJson, review)
      )
    ).toEqual(exports);
  });

  it('rejects missing paint and cross-context attachments before claiming a checked composition', async () => {
    const { review, request } = await fixture();
    const { decorativeGradient: _gradient, ...missing } = request;
    await expect(assessGuidelineApplication(review, missing)).rejects.toThrow(
      'Choose a decorative gradient'
    );
    if (request.layout.kind !== 'composition') throw new Error('Fixture');
    await expect(
      assessGuidelineApplication(review, {
        ...request,
        layout: { ...request.layout, sourceContextId: 'product' },
      })
    ).rejects.toThrow('exact source context');
    expect(() =>
      buildGuidelineApplicationLayout(
        { kind: 'product', modeId: request.layout.modeId },
        {
          id: 'decoration',
          role: 'decoration',
          paint: request.decorativeGradient!.selection.design,
        }
      )
    ).toThrow('Only a composition');
  });

  it('retains readable failed contrast evidence and does not authorize failed or cancelled export', async () => {
    const { review, request, white } = await fixture();
    const failed = await assessGuidelineApplication(review, {
      ...request,
      assignments: request.assignments.map(a => ({ ...a, colorId: white })),
    });
    expect(failed.recipe).toBeNull();
    expect(failed.assessment!.eligible).toBe(false);
    expect(failed.geometry).not.toBeNull();
    await expect(exportGuidelineApplication(failed)).rejects.toThrow('Assess');
    const controller = new AbortController();
    controller.abort();
    const cancelled = await assessGuidelineApplication(review, request, controller.signal);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.recipe).toBeNull();
  });
});
