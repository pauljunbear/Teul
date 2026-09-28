import { describe, expect, it } from 'vitest';
import {
  buildColorSystemModelV1,
  COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
  type ColorSystemModelInputV1,
} from '../../../../src/lib/colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { gradientCssV1, gradientSvgV1 } from '../../../../src/lib/colorSystemGradientV1';
import { REVIEWED_VALUE_PREFIXES } from '../../../../src/lib/colorSystemValueProvenanceV1';
import {
  createGuidelineModeGradient,
  readGuidelineModeGradientSelection,
  type GuidelineModeGradientSelection,
} from './modeGradient';
import { guidelineGradientExports, guidelineModeGradientExports } from './gradientExport';
import { guidelineHash, guidelineOperationIssues } from './review';
import { createGuidelineGradient, readGuidelineSelection } from './project';
import { readGuidelineProjectLatest } from './projectV4';
import legacy from '../../../fixtures/guidelines/legacy-projects.json';
import legacyV3 from '../../../fixtures/guidelines/legacy-project-v3.json';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function input(): { -readonly [K in keyof ColorSystemModelInputV1]: ColorSystemModelInputV1[K] } {
  return {
    schemaVersion: COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
    sources: [
      {
        id: 'source',
        label: 'Native guideline',
        sourceHash: `sha256:${'1'.repeat(64)}`,
        version: null,
        locator: null,
        freshnessMode: 'imported-snapshot',
        status: 'unknown',
      },
    ],
    evidence: [
      {
        id: 'profile',
        sourceId: 'source',
        locator: 'review/profile',
        status: 'inferred',
        description: `${REVIEWED_VALUE_PREFIXES.profile} Recorded user decision.`,
      },
    ],
    claims: [],
    coverage: [
      {
        sourceId: 'source',
        status: 'partial',
        evidenceRefs: ['profile'],
        unresolvedClaimIds: [],
        note: 'Selected declarations.',
      },
    ],
    modes: [
      { id: 'day', label: 'Same name' },
      { id: 'night', label: 'Same name' },
    ],
    colors: [
      {
        id: 'ink',
        label: 'Ink',
        sourceId: 'source',
        evidenceRefs: ['profile'],
        claimIds: [],
        valuesByMode: {
          day: buildColorSystemSrgbValueV1({ r: 0.123456789012341, g: 0.25, b: 0.35 }),
          night: buildColorSystemSrgbValueV1({ r: 0.123456789012342, g: 0.25, b: 0.35 }),
        },
      },
      {
        id: 'paper',
        label: 'Paper',
        sourceId: 'source',
        evidenceRefs: ['profile'],
        claimIds: [],
        valuesByMode: {
          day: buildColorSystemSrgbValueV1({ r: 0.85, g: 0.8, b: 0.75 }),
          night: buildColorSystemSrgbValueV1({ r: 0.75, g: 0.8, b: 0.85 }),
        },
      },
    ],
    families: [],
    scales: [],
    contexts: ['brand', 'product', 'gradient:brand', 'gradient:product'].map(id => ({
      id,
      label: id,
      modeIds: ['day', 'night'],
      evidenceRefs: [],
      claimIds: [],
    })),
    brandConstraintsByContext: [],
    rules: [],
    adoptions: [],
    conflicts: [],
  };
}
function review(source = input()) {
  const model = buildColorSystemModelV1({
    ...source,
    coverage: source.coverage.map(item => ({
      ...item,
      unresolvedClaimIds: source.claims
        .filter(claim => ['unsupported', 'unresolved', 'contradicted'].includes(claim.status))
        .map(claim => claim.id),
    })),
  });
  return { model, reviewHash: guidelineHash({ model: model.modelHash, decision: 'reviewed' }) };
}

describe('explicit source-mode gradients', () => {
  it('uses exact channels from the requested native mode and binds mode identity to replay', () => {
    const source = review();
    const before = canonicalJson(source);
    const day = createGuidelineModeGradient(source, 'brand', 'day', 'ink', 'paper', 137.5);
    const night = createGuidelineModeGradient(source, 'brand', 'night', 'ink', 'paper', 137.5);
    expect(day.design.stops[0].value.hex).toBe(night.design.stops[0].value.hex);
    expect(day.design.stops[0].value.components.r).toBe(0.123456789012341);
    expect(night.design.stops[0].value.components.r).toBe(0.123456789012342);
    expect(day.design.briefHash).not.toBe(night.design.briefHash);
    expect(day.design.designHash).not.toBe(night.design.designHash);
    expect(day.design.stops.every(stop => stop.locked)).toBe(true);
    expect(readGuidelineModeGradientSelection(source, clone(day))).toEqual(day);
    expect(Object.isFrozen(day)).toBe(true);
    expect(Object.isFrozen(day.design.stops[0].value.components)).toBe(true);
    expect(canonicalJson(source)).toBe(before);
  });

  it('rejects unknown modes, context mismatches, missing mode values and translucent anchors', () => {
    expect(() =>
      createGuidelineModeGradient(review(), 'brand', 'Source', 'ink', 'paper', 0)
    ).toThrow('declared source mode');
    const restricted = input();
    restricted.contexts = restricted.contexts.map(context =>
      context.id === 'gradient:product' ? { ...context, modeIds: ['day'] } : context
    );
    expect(() =>
      createGuidelineModeGradient(review(restricted), 'product', 'night', 'ink', 'paper', 0)
    ).toThrow('unavailable');
    const missing = input();
    missing.colors = missing.colors.map(color =>
      color.id === 'ink' ? { ...color, valuesByMode: { day: color.valuesByMode.day } } : color
    );
    expect(() =>
      createGuidelineModeGradient(review(missing), 'brand', 'night', 'ink', 'paper', 0)
    ).toThrow('no reviewed value');
    const alpha = input();
    alpha.colors = alpha.colors.map(color =>
      color.id === 'ink'
        ? {
            ...color,
            valuesByMode: {
              ...color.valuesByMode,
              day: buildColorSystemSrgbValueV1({ r: 0.1, g: 0.2, b: 0.3 }, 0.5),
            },
          }
        : color
    );
    expect(() =>
      createGuidelineModeGradient(review(alpha), 'brand', 'day', 'ink', 'paper', 0)
    ).toThrow('Only opaque');
  });

  it('scopes unresolved restrictions by mode while omitted and empty mode lists remain global', () => {
    for (const modeIds of [['night'], [], undefined]) {
      const source = input();
      source.claims = [
        {
          id: 'restriction',
          sourceId: 'source',
          text: 'Do not use gradients.',
          status: 'unsupported',
          evidenceRefs: ['profile'],
          contextIds: ['gradient:brand'],
          ruleIds: [],
          ...(modeIds === undefined ? {} : { modeIds }),
        },
      ];
      const checked = review(source);
      expect(guidelineOperationIssues(checked, 'gradient', 'brand')).toHaveLength(1);
      expect(() =>
        createGuidelineModeGradient(checked, 'brand', 'night', 'ink', 'paper', 0)
      ).toThrow('Do not use gradients');
      if (modeIds?.length)
        expect(createGuidelineModeGradient(checked, 'brand', 'day', 'ink', 'paper', 0).modeId).toBe(
          'day'
        );
      else
        expect(() =>
          createGuidelineModeGradient(checked, 'brand', 'day', 'ink', 'paper', 0)
        ).toThrow('Do not use gradients');
      expect(
        createGuidelineModeGradient(checked, 'product', 'night', 'ink', 'paper', 0).scope
      ).toBe('product');
    }
  });

  it('keeps closed-palette rules scoped to their native mode', () => {
    const source = input();
    source.claims = [
      {
        id: 'closed-claim',
        sourceId: 'source',
        text: 'Only existing colors.',
        status: 'observed',
        evidenceRefs: ['profile'],
        contextIds: ['gradient:brand'],
        modeIds: ['night'],
        ruleIds: ['closed'],
      },
    ];
    source.rules = [
      {
        id: 'closed',
        label: 'Only existing colors',
        kind: 'palette-membership',
        force: 'requirement',
        origin: 'source-stated',
        contextIds: ['gradient:brand'],
        modeIds: ['night'],
        evidenceRefs: ['profile'],
        claimIds: ['closed-claim'],
        operands: {
          members: [
            { kind: 'color', id: 'ink' },
            { kind: 'color', id: 'paper' },
          ],
        },
      },
    ];
    const checked = review(source);
    expect(createGuidelineModeGradient(checked, 'brand', 'day', 'ink', 'paper', 0)).toBeTruthy();
    expect(() => createGuidelineModeGradient(checked, 'brand', 'night', 'ink', 'paper', 0)).toThrow(
      'existing palette'
    );
  });

  it('rejects substituted mode, source, stops, paint, version and extra fields even with recomputed hashes', () => {
    const source = review();
    const selected = createGuidelineModeGradient(source, 'brand', 'day', 'ink', 'paper', 120);
    const changes: ((value: GuidelineModeGradientSelection) => void)[] = [
      value => {
        value.modeId = 'night';
      },
      value => {
        value.scope = 'product';
      },
      value => {
        value.design.stops[0].sourceColorId = 'paper';
      },
      value => {
        value.design.stops[0].value = buildColorSystemSrgbValueV1({ r: 0, g: 0, b: 0 });
      },
      value => {
        value.design.compiledPaint.stops[0].value = buildColorSystemSrgbValueV1({
          r: 0,
          g: 0,
          b: 0,
        });
      },
      value => {
        value.design.stops[0].locked = false;
      },
      value => {
        Object.assign(value, { schemaVersion: 'teul.guideline-mode-gradient.v99' });
      },
      value => {
        Object.assign(value, { approved: true });
      },
    ];
    for (const change of changes) {
      const changed = clone(selected);
      change(changed);
      const { designHash: _, ...content } = changed.design;
      changed.design.designHash = guidelineHash(content);
      expect(() => readGuidelineModeGradientSelection(source, changed)).toThrow();
    }
    expect(() =>
      readGuidelineModeGradientSelection(
        { ...source, reviewHash: `sha256:${'2'.repeat(64)}` },
        selected
      )
    ).toThrow('review or compiled');
    expect(() => readGuidelineModeGradientSelection(null, selected)).toThrow(
      'applied source review'
    );
    expect(readGuidelineModeGradientSelection(null, null)).toBeNull();
    expect(() =>
      readGuidelineModeGradientSelection(source, {
        ...selected,
        get modeId() {
          throw new Error('executed accessor');
        },
      })
    ).toThrow(/Accessor|accessor/);
  });

  it('preserves source qualifications in SVG, CSS and mode-bound JSON', () => {
    const source = review();
    const selection = createGuidelineModeGradient(source, 'brand', 'night', 'ink', 'paper', 120);
    const output = guidelineModeGradientExports(source, selection);
    for (const artifact of [output.svg, output.css, output.json])
      expect(artifact).toContain('original source profile is unverified');
    expect(JSON.parse(output.json)).toMatchObject({
      modeId: 'night',
      scope: 'brand',
      reviewHash: source.reviewHash,
      sourceModelHash: source.model.modelHash,
      design: selection.design,
    });
  });

  it('preserves real legacy PDF project bytes and export forms; old readers reject the new selection shape', () => {
    for (const saved of [legacy.project, legacy.project2, legacyV3]) {
      const opened = readGuidelineProjectLatest(JSON.stringify(saved));
      if (opened.status !== 'opened' || !opened.project.review)
        throw new Error('Legacy fixture unavailable');
      expect(JSON.stringify(opened.project)).toBe(JSON.stringify(saved));
      if (guidelineOperationIssues(opened.project.review, 'gradient', 'brand').length) continue;
      const [first, last] = opened.project.review.model.colors;
      const selection = createGuidelineGradient(
        opened.project.review,
        'brand',
        first.id,
        last.id,
        120
      );
      const output = guidelineGradientExports(opened.project.review, selection);
      expect(output.svg).toBe(gradientSvgV1(selection.design));
      expect(output.css).toBe(`.gradient { background: ${gradientCssV1(selection.design)}; }`);
      expect(output.json).toBe(JSON.stringify(selection.design, null, 2));
      const modeSelection = createGuidelineModeGradient(
        opened.project.review,
        'brand',
        'Source',
        first.id,
        last.id,
        120
      );
      expect(() => readGuidelineSelection(opened.project.review, modeSelection)).toThrow(
        'unsupported fields'
      );
      expect(() => readGuidelineModeGradientSelection(opened.project.review, selection)).toThrow();
    }
  });
});
