import { parseGradientDesignV2 } from '../../../../src/lib/colorSystemGradientDesignV2';
import { beforeAll, describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/guidelines/figma-project-v1.json';
import { readFigmaProject } from './figmaProject';
import {
  createGuidelineContinuousGradient,
  createGuidelineAuthoredGradient,
  type GuidelineGradientControls,
} from './authoredGradient';
import {
  bindGuidelineCompositionGradient,
  readGuidelineCompositionGradient,
  type GuidelineCompositionGradient,
} from './compositionGradient';
import { verifyGuidelineCompositionGradient } from './compositionGradientVerification';
import {
  buildColorSystemModelV1,
  type ColorSystemModelV1,
} from '../../../../src/lib/colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { guidelineHash } from './review';
import type { ModeGradientReview } from './modeGradient';
import { createGuidelineGradientCatalog, gradientCatalogControlId } from './gradientCatalog';

let review: ModeGradientReview;
let gradient: GuidelineCompositionGradient;
let controls: GuidelineGradientControls;
let workingModel: ColorSystemModelV1;
beforeAll(async () => {
  const opened = await readFigmaProject(fixture);
  if (opened.status !== 'opened' || !opened.project.review) throw new Error('Fixture');
  review = opened.project.review;
  controls = {
    scope: 'brand',
    modeId: review.model.modes[0].id,
    angle: 43.5,
    route: { space: 'oklab' },
    stops: [0, 1].map(position => ({ colorId: review.model.colors[0].id, position, locked: true })),
  };
  gradient = {
    selection: createGuidelineContinuousGradient(review, controls),
    sourceRole: 'illustration',
  };
  const { modelHash: _hash, ...source } = review.model;
  workingModel = buildColorSystemModelV1({
    ...source,
    colors: [
      ...source.colors,
      {
        ...source.colors[0],
        id: 'authored:canvas',
        label: 'Authored canvas',
        valuesByMode: {
          [controls.modeId]: buildColorSystemSrgbValueV1({ r: 0.01, g: 0.02, b: 0.03 }),
        },
        evidenceRefs: [],
        claimIds: [],
      },
    ],
  });
});

describe('retained composition gradient binding', () => {
  it('retains catalog permission and checks its source anchors even when both paint stops are catalog colors', () => {
    const catalog = createGuidelineGradientCatalog(review, {
      scope: controls.scope,
      modeId: controls.modeId,
      sourceAnchorIds: [controls.stops[0].colorId],
      provider: 'radix',
      scheme: 'light',
      candidateId: 'radix:blue',
    });
    const selection = createGuidelineContinuousGradient(
      review,
      {
        ...controls,
        stops: controls.stops.map(stop => ({
          ...stop,
          colorId: gradientCatalogControlId(catalog.memberIds[8]),
        })),
      },
      undefined,
      catalog
    );
    const parsed = readGuidelineCompositionGradient({ selection });
    const bound = bindGuidelineCompositionGradient(review, parsed, workingModel);
    expect(parseGradientDesignV2(bound.paint).compiledPaint).toEqual(
      parseGradientDesignV2(selection.design).compiledPaint
    );
    expect('catalog' in parsed.selection ? parsed.selection.catalog : undefined).toEqual(catalog);
    expect(
      'catalog' in parsed.selection ? parsed.selection.catalog?.sourceModelHash : undefined
    ).toBe(review.model.modelHash);
    const { modelHash: _hash, ...source } = workingModel;
    const changed = buildColorSystemModelV1({
      ...source,
      colors: source.colors.map(color =>
        color.id === catalog.sourceAnchorIds[0]
          ? {
              ...color,
              valuesByMode: {
                ...color.valuesByMode,
                [controls.modeId]: buildColorSystemSrgbValueV1({ r: 0.123, g: 0.456, b: 0.789 }),
              },
            }
          : color
      ),
    });
    expect(() => bindGuidelineCompositionGradient(review, parsed, changed)).toThrow(
      'catalog source anchor'
    );
    const altered = structuredClone(parsed);
    if (!('stopRefs' in altered.selection)) throw new Error('Expected generated gradient');
    (altered.selection.stopRefs[0] as { kind: 'catalog'; memberId: string }).memberId =
      'outside-permission';
    expect(() => readGuidelineCompositionGradient(altered)).toThrow('origin');
  });
  it('preserves reviewed selection and exact paint while explicitly identifying the working model binding', async () => {
    const before = structuredClone(gradient);
    const parsed = readGuidelineCompositionGradient(gradient);
    expect(readGuidelineCompositionGradient(parsed)).toBe(parsed);
    expect(
      Object.isFrozen(parseGradientDesignV2(parsed.selection.design).compiledPaint.stops)
    ).toBe(true);
    const binding = bindGuidelineCompositionGradient(review, parsed, workingModel);
    expect(binding).toMatchObject({
      selectionHash: guidelineHash(gradient.selection),
      sourceDesignHash: gradient.selection.design.designHash,
      boundDesignHash: binding.paint.designHash,
    });
    expect(binding.boundDesignHash).not.toBe(binding.sourceDesignHash);
    const {
      sourceModelHash: _source,
      designHash: _design,
      ...retained
    } = gradient.selection.design;
    expect(binding.paint).toEqual({
      ...retained,
      sourceModelHash: workingModel.modelHash,
      designHash: binding.boundDesignHash,
    });
    expect(gradient).toEqual(before);
    const verified = await verifyGuidelineCompositionGradient(review, parsed, workingModel);
    expect(verified.binding).toEqual(binding);
    expect(verified.original.selection).toEqual(before.selection);
    expect(verified.exportable).toBe(true);
    expect(verified.fidelity?.designHash).toBe(binding.boundDesignHash);
  });

  it.each([
    [
      'unknown envelope',
      (v: any) => {
        v.approved = true;
      },
    ],
    [
      'unknown selection',
      (v: any) => {
        v.selection.approved = true;
      },
    ],
    [
      'source role',
      (v: any) => {
        v.sourceRole = ' ';
      },
    ],
    [
      'future version',
      (v: any) => {
        v.selection.schemaVersion = 'teul.guideline-authored-gradient.v5';
      },
    ],
    [
      'missing catalog',
      (v: any) => {
        delete v.selection.catalog;
      },
    ],
    [
      'altered paint',
      (v: any) => {
        v.selection.design.compiledPaint.stops[0].position = 0.2;
      },
    ],
    [
      'anchor origin',
      (v: any) => {
        v.selection.stopRefs[0].colorId = 'other';
      },
    ],
    [
      'oversized selection',
      (v: any) => {
        v.sourceRole = 'x'.repeat(256001);
      },
    ],
  ])('rejects malformed %s without source authority', (_name, mutate) => {
    const value = structuredClone(gradient);
    mutate(value);
    expect(() => readGuidelineCompositionGradient(value)).toThrow();
  });

  it('requires V4 decorative work and rejects a changed review or exact anchor', () => {
    expect(() =>
      readGuidelineCompositionGradient({
        selection: createGuidelineAuthoredGradient(review, controls),
      })
    ).toThrow();
    const text = createGuidelineContinuousGradient(review, controls, {
      origin: 'designer-authored',
      use: {
        kind: 'text',
        foregroundColorId: controls.stops[0].colorId,
        minimumRatio: 4.5,
        footprint: { start: 0, end: 1 },
      },
      limits: [],
    });
    expect(() => readGuidelineCompositionGradient({ selection: text })).toThrow();
    expect(() =>
      bindGuidelineCompositionGradient(
        { ...review, reviewHash: 'sha256:' + '0'.repeat(64) },
        gradient,
        workingModel
      )
    ).toThrow();
    const { modelHash: _hash, ...source } = workingModel;
    const changed = buildColorSystemModelV1({
      ...source,
      colors: source.colors.map(color =>
        color.id === controls.stops[0].colorId
          ? {
              ...color,
              valuesByMode: {
                ...color.valuesByMode,
                [controls.modeId]: buildColorSystemSrgbValueV1({ r: 0.123, g: 0.456, b: 0.789 }),
              },
            }
          : color
      ),
    });
    expect(() => bindGuidelineCompositionGradient(review, gradient, changed)).toThrow('anchor');
  });

  it('keeps failed decorative limits nonexportable and respects cancellation before local execution', async () => {
    const selection = createGuidelineContinuousGradient(review, controls, {
      origin: 'designer-authored',
      use: { kind: 'decorative' },
      limits: [
        {
          id: 'exclude-all',
          scope: 'rendered-paint',
          effect: 'exclude',
          bounds: {
            lightness: { minimum: 0, maximum: 1 },
            chroma: { minimum: 0, maximum: 0.5 },
            hueRanges: [{ minimum: 0, maximum: 360 }],
          },
        },
      ],
    });
    const result = await verifyGuidelineCompositionGradient(review, { selection }, workingModel);
    expect(result.exportable).toBe(false);
    expect(result.original.portable.assessment?.status).toBe('fail');
    const controller = new AbortController();
    controller.abort();
    await expect(
      verifyGuidelineCompositionGradient(review, gradient, workingModel, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
