import { describe, expect, it } from 'vitest';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';
import { buildColorSystemModelV1 } from '../colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import { canonicalJson, canonicalNumber, deterministicContentHash } from '../colorSystemHashing';
import {
  buildColorSystemApplicationRequirementsV1,
  compileColorSystemApplicationRequirementsV1,
  type ColorSystemApplicationRequirementsV1,
} from '../colorSystemApplicationRequirementsV1';
import { strictlyMonotonicColorMetricV1 } from '../colorSystemChartOrderV1';
import {
  executeColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringDirectionV1,
} from '../colorSystemAuthoringExecutionV1';
import { buildColorSystemDesignContentV1 } from '../colorSystemDesignContentV1';
import { parseColorSystemRecipeV1 } from '../colorSystemRecipeV1';
import {
  compileColorSystemAuthoredDeliveryV1,
  exportColorSystemAuthoredDeliveryV1,
} from '../colorSystemAuthoringDeliveryV1';
import {
  hashColorSystemGeometryApplicationsV1,
  type ColorSystemApplicationGeometryPlanV1,
} from '../colorSystemApplicationGeometryV1';

type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
const copy = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>;
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const immediate = { isCancelled: () => false, yield: async () => {} };

function fixture(values = [0.1, 0.2, 0.3], alphas = [1, 1, 1], groundAlpha = 1) {
  const input = copy(syntheticColorSystemModelInputV1());
  input.rules = [];
  input.adoptions = [];
  input.claims.forEach(claim => {
    claim.ruleIds = [];
  });
  const ids = ['ink', 'blue', 'blue-deep'];
  ids.forEach((id, index) => {
    const v = values[index];
    input.colors.find(color => color.id === id)!.valuesByMode.Day = buildColorSystemSrgbValueV1(
      { r: v, g: v, b: v },
      alphas[index]
    );
  });
  input.colors.find(color => color.id === 'paper')!.valuesByMode.Day = buildColorSystemSrgbValueV1(
    { r: 1, g: 1, b: 1 },
    groundAlpha
  );
  const source = buildColorSystemModelV1(input);
  const requirements: Mutable<ColorSystemApplicationRequirementsV1> = {
    schemaVersion: 'teul.application-requirements.v1',
    templates: [
      {
        id: 'chart',
        contextId: 'interface',
        modeId: 'Day',
        uses: [
          { id: 'ground', role: 'surface', area: 29600 },
          ...ids.map((_, i) => ({ id: `mark:${i}`, role: `data.value.${i}`, area: 800 })),
        ],
        pairs: ids.map((_, i) => ({
          id: `pair:${i}`,
          foregroundUseId: `mark:${i}`,
          backgroundUseId: 'ground',
          contrast: { minimum: 3, assessment: 'required' },
        })),
      },
    ],
    distinctions: [],
    orders: [
      {
        id: 'increasing-value',
        applicationId: 'chart',
        useIds: ids.map((_, i) => `mark:${i}`),
        groundUseId: 'ground',
        direction: 'dark-to-light',
      },
    ],
  };
  const application = {
    ...copy(requirements.templates[0]),
    uses: requirements.templates[0].uses.map((use, i) => ({
      ...use,
      colorId: i === 0 ? 'paper' : ids[i - 1],
    })),
  };
  return { input, source, requirements, application };
}

describe('replayed chart order and explicit advisory evidence', () => {
  it('checks native rendered lightness and luminance without rounding through hex', () => {
    const { source, requirements, application } = fixture([0.20000001, 0.20000002, 0.20000003]);
    expect(
      new Set(
        source.colors
          .filter(color => ['ink', 'blue', 'blue-deep'].includes(color.id))
          .map(color => color.valuesByMode.Day.hex)
      ).size
    ).toBe(1);
    const result = compileColorSystemApplicationRequirementsV1(source, requirements).evaluate([
      application,
    ]);
    expect(result.eligible).toBe(true);
    expect(result.orders?.[0]).toMatchObject({ pass: true, direction: 'dark-to-light' });
    expect(result.orders?.[0].observed).toHaveLength(3);
    const canonical = buildColorSystemApplicationRequirementsV1(requirements);
    expect(buildColorSystemApplicationRequirementsV1(canonical)).toEqual(canonical);
    expect(canonical.orders).toEqual(requirements.orders);
  });

  it('canonicalizes returned evidence only after raw boundary decisions', () => {
    const { source, requirements, application } = fixture([0.5, 0.5 + 1.4e-12, 0.5 + 2.8e-12]);
    const result = compileColorSystemApplicationRequirementsV1(source, requirements).evaluate([
      application,
    ]);
    expect(result.orders?.[0].pass).toBe(true);
    const observed = result.orders![0].observed;
    for (const value of observed) {
      expect(value.oklabLightness).toBe(canonicalNumber(value.oklabLightness));
      expect(value.relativeLuminance).toBe(canonicalNumber(value.relativeLuminance));
    }
    // Rounding before the gate would fail this otherwise increasing native scale.
    expect(
      strictlyMonotonicColorMetricV1(
        observed.map(value => value.oklabLightness),
        1
      )
    ).toBe(false);
  });

  it.each([
    [0.3, 0.2, 0.1],
    [0.1, 0.3, 0.2],
    [0.2, 0.2, 0.2],
  ])('blocks reversed, folded or flat order: %j', (...values) => {
    const { source, requirements, application } = fixture(values);
    const result = compileColorSystemApplicationRequirementsV1(source, requirements).evaluate([
      application,
    ]);
    expect(result.applications[0].eligible).toBe(true);
    expect(result.eligible).toBe(false);
    expect(result.orders?.[0].pass).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: 'INVALID_SEQUENTIAL_ORDER' })
    );
  });

  it('accepts an explicitly reversed direction and binds that choice to the requirements hash', () => {
    const { source, requirements, application } = fixture([0.3, 0.2, 0.1]);
    const before = compileColorSystemApplicationRequirementsV1(source, requirements);
    requirements.orders![0].direction = 'light-to-dark';
    const after = compileColorSystemApplicationRequirementsV1(source, requirements);
    expect(after.requirementsHash).not.toBe(before.requirementsHash);
    expect(after.evaluate([application]).eligible).toBe(true);
  });

  it('uses the actual opaque ground for alpha and never invents an underlay', () => {
    const alpha = fixture([0.1, 0.2, 0.3], [1, 0.1, 1]);
    const result = compileColorSystemApplicationRequirementsV1(
      alpha.source,
      alpha.requirements
    ).evaluate([alpha.application]);
    expect(result.orders?.[0].pass).toBe(false);
    expect(result.orders![0].observed[1].oklabLightness).toBeGreaterThan(
      result.orders![0].observed[2].oklabLightness
    );
    const transparent = fixture(undefined, undefined, 0.5);
    const unavailable = compileColorSystemApplicationRequirementsV1(
      transparent.source,
      transparent.requirements
    ).evaluate([transparent.application]);
    expect(unavailable.orders?.[0]).toMatchObject({ pass: false, observed: [] });
    expect(unavailable.blockers.some(blocker => blocker.reason.includes('opaque ground'))).toBe(
      true
    );
  });

  it('rejects missing or changed uses instead of assessing a partial ordered scale', () => {
    const { source, requirements, application } = fixture();
    application.uses.pop();
    application.pairs.pop();
    const result = compileColorSystemApplicationRequirementsV1(source, requirements).evaluate([
      application,
    ]);
    expect(result.eligible).toBe(false);
    expect(result.orders?.[0].pass).toBe(false);
    expect(result.blockers.some(blocker => blocker.code === 'INCOMPLETE_APPLICATION')).toBe(true);
  });

  it.each([
    { useIds: ['mark:0', 'mark:0', 'mark:2'] },
    { useIds: ['mark:0', 'mark:1'] },
    { useIds: ['mark:0', 'mark:1', 'unknown'] },
    { useIds: ['ground', 'mark:1', 'mark:2'] },
    { groundUseId: 'mark:0' },
    { applicationId: 'unknown' },
    { direction: 'status' },
    { direction: undefined },
    { permission: true },
  ])('rejects invalid order controls: %j', patch => {
    const { requirements } = fixture();
    expect(() =>
      buildColorSystemApplicationRequirementsV1({
        ...requirements,
        orders: [{ ...requirements.orders![0], ...patch }],
      })
    ).toThrow();
  });

  it('rejects unrelated declared grounds, duplicate order IDs and unsupported advisory modes', () => {
    const { requirements } = fixture();
    const order = requirements.orders![0];
    requirements.templates[0].uses.push({ id: 'unrelated', role: 'surface', area: 1 });
    expect(() =>
      buildColorSystemApplicationRequirementsV1({
        ...requirements,
        orders: [{ ...order, groundUseId: 'unrelated' }],
      })
    ).toThrow('actual pair');
    expect(() =>
      buildColorSystemApplicationRequirementsV1({ ...requirements, orders: [order, order] })
    ).toThrow('unique');
    expect(() =>
      buildColorSystemApplicationRequirementsV1({ ...requirements, orders: undefined })
    ).toThrow();
  });

  it('keeps CVD distinction failures advisory only when explicitly requested; actual paint stays required', () => {
    const { source, requirements, application } = fixture([0.2, 0.2, 0.2]);
    delete requirements.orders;
    requirements.distinctions = [
      {
        id: 'categories',
        applicationId: 'chart',
        kind: 'categorical-series',
        useIds: ['mark:0', 'mark:1', 'mark:2'],
        groundUseId: 'ground',
        minimumDeltaEOK: 0,
        expectedCount: 3,
      },
    ];
    const required = compileColorSystemApplicationRequirementsV1(source, requirements).evaluate([
      application,
    ]);
    expect(required.eligible).toBe(false);
    requirements.distinctions[0].assessment = 'advisory';
    const advisory = compileColorSystemApplicationRequirementsV1(source, requirements).evaluate([
      application,
    ]);
    expect(advisory.eligible).toBe(true);
    expect(advisory.distinctions[0]).toMatchObject({
      assessment: 'advisory',
      pass: false,
      observedMinimumDeltaEOK: 0,
    });
    application.uses[1].colorId = 'paper';
    expect(
      compileColorSystemApplicationRequirementsV1(source, requirements).evaluate([application])
        .eligible
    ).toBe(false);
    requirements.distinctions[0].kind = 'interaction-states';
    expect(() => buildColorSystemApplicationRequirementsV1(requirements)).toThrow(
      'Only categorical'
    );
    expect(() =>
      buildColorSystemApplicationRequirementsV1({
        ...requirements,
        distinctions: [{ ...requirements.distinctions[0], assessment: 'ignore' }],
      })
    ).toThrow('required or advisory');
  });

  it('preserves old canonical fields and assessment shape when the new policies are absent', () => {
    const { source, requirements, application } = fixture();
    delete requirements.orders;
    const canonical = buildColorSystemApplicationRequirementsV1(requirements);
    expect(canonicalJson(canonical)).toBe(canonicalJson({ ...requirements, locks: [] }));
    expect(canonical).not.toHaveProperty('orders');
    expect(
      compileColorSystemApplicationRequirementsV1(source, canonical).evaluate([application])
    ).not.toHaveProperty('orders');
  });

  it('keeps the existing monotonic tolerance and rejects incomplete or nonfinite metrics', () => {
    expect(strictlyMonotonicColorMetricV1([0, 2e-12, 4e-12], 1)).toBe(true);
    expect(strictlyMonotonicColorMetricV1([0, 1e-12, 2e-12], 1)).toBe(false);
    expect(strictlyMonotonicColorMetricV1([1, 0.5, 0], -1)).toBe(true);
    expect(strictlyMonotonicColorMetricV1([0, NaN, 1], 1)).toBe(false);
    expect(strictlyMonotonicColorMetricV1([0, 1, Infinity], 1)).toBe(false);
    expect(strictlyMonotonicColorMetricV1([0], 1)).toBe(false);
  });

  it('replays order in real authoring and delivery; a contrary saved order cannot export', async () => {
    const { source, requirements, application } = fixture();
    const direction: ColorSystemAuthoringDirectionV1 = {
      version: 'teul.authoring-direction.v1',
      id: 'chart-order',
      generation: {
        kind: 'apply',
        proposal: {
          version: 'teul.color-system-proposal.v1',
          id: 'chart-order',
          sourceModelHash: source.modelHash,
          brief: {
            briefHash: hash('synthetic ordered chart'),
            operation: 'apply',
            contextIds: ['interface'],
            modeIds: ['Day'],
            permissions: {
              addColors: false,
              addFamilies: false,
              addScales: false,
              addRules: false,
              editFamilyIds: [],
              editScaleIds: [],
              replaceRuleIds: [],
            },
          },
          derivation: {
            algorithmId: 'source-apply',
            algorithmVersion: '1',
            policyHash: hash('source stays exact'),
            inputHash: source.modelHash,
            sourceColorIds: ['paper', 'ink', 'blue', 'blue-deep'],
            sourceScaleIds: [],
          },
          colors: [],
          families: [],
          scales: [],
          rules: [],
          exceptions: [],
        },
      },
      requirements: buildColorSystemApplicationRequirementsV1(requirements),
      composition: {
        version: 'teul.model-composition.v1',
        modelHash: source.modelHash,
        requirementsHash: hash(buildColorSystemApplicationRequirementsV1(requirements)),
        maximumNodes: 64,
        maximumSolutions: 1,
        groups: [
          {
            id: 'chart',
            options: [
              {
                id: 'assigned',
                assignments: application.uses.map(use => ({
                  applicationId: application.id,
                  useId: use.id,
                  colorId: use.colorId,
                })),
              },
            ],
          },
        ],
      },
      units: [],
    };
    const run = await executeColorSystemAuthoringDirectionV1(source, direction, immediate);
    expect(run.status).toBe('ready');
    const applications = run.candidates[0].applications.applications.map(item => item.application);
    const recipe = parseColorSystemRecipeV1({
      schemaVersion: 'teul.color-system-recipe.v1',
      id: 'chart-order',
      label: 'Synthetic ordered chart proof',
      source: { model: source, intake: 'guideline-json' },
      direction,
      selection: {
        model: source,
        applications,
        contentHash: buildColorSystemDesignContentV1(source, applications).contentHash,
        executionReceiptHash: run.receipt.receiptHash,
      },
      locks: [],
    });
    const geometry: ColorSystemApplicationGeometryPlanV1 = {
      version: 'teul.application-geometry.v1',
      modelHash: source.modelHash,
      applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
      boards: [
        {
          applicationId: 'chart',
          width: 400,
          height: 80,
          root: {
            id: 'ground',
            useId: 'ground',
            shape: { kind: 'rect', x: 0, y: 0, width: 400, height: 80 },
            children: [0, 1, 2].map(i => ({
              id: `mark:${i}`,
              useId: `mark:${i}`,
              shape: { kind: 'rect', x: 20 + i * 60, y: 28, width: 40, height: 20 },
              textAlternative: `Ordered mark ${i + 1}`,
              children: [],
            })),
          },
        },
      ],
    };
    const output = exportColorSystemAuthoredDeliveryV1(
      await compileColorSystemAuthoredDeliveryV1(recipe, geometry, immediate)
    );
    expect(JSON.parse(output.recipeJson).direction.requirements.orders).toEqual(
      requirements.orders
    );
    expect(
      exportColorSystemAuthoredDeliveryV1(
        await compileColorSystemAuthoredDeliveryV1(
          JSON.parse(output.recipeJson),
          geometry,
          immediate
        )
      )
    ).toEqual(output);
    const changed = copy(recipe);
    changed.direction.requirements.orders![0].direction = 'light-to-dark';
    changed.direction.composition.requirementsHash = hash(
      buildColorSystemApplicationRequirementsV1(changed.direction.requirements)
    );
    const rejected = await executeColorSystemAuthoringDirectionV1(
      source,
      changed.direction,
      immediate
    );
    expect(rejected.status).toBe('infeasible');
    expect(rejected.candidates).toHaveLength(0);
    await expect(
      compileColorSystemAuthoredDeliveryV1(changed, geometry, immediate)
    ).rejects.toThrow();
  });
});
