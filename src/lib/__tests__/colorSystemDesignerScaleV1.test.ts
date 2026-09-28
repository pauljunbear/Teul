import { describe, expect, it } from 'vitest';
import {
  compileColorSystemDesignerScaleV1,
  readColorSystemDesignerScaleRequestV1,
  type ColorSystemDesignerScaleRequestV1,
} from '../colorSystemDesignerScaleV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import { executeColorSystemAuthoringDirectionV1 } from '../colorSystemAuthoringExecutionV1';
import { serializeColorSystemInertJsonV1 } from '../colorSystemInertJsonV1';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
const decision = {
  actor: { kind: 'user' as const, ref: 'synthetic:designer' },
  authorityRef: 'synthetic:explicit-form-action',
  decisionRef: 'synthetic:request-1',
};
const runtime = { isCancelled: () => false, yield: async () => {} };
function fixture() {
  const input = structuredClone(
    syntheticColorSystemModelInputV1()
  ) as Mutable<ColorSystemModelInputV1>;
  input.rules = [];
  input.adoptions = [];
  input.claims.forEach(claim => {
    claim.ruleIds = [];
  });
  const blue = input.colors.find(color => color.id === 'blue')!;
  blue.valuesByMode.Day = buildColorSystemSrgbValueV1(blue.valuesByMode.Day.components);
  const request: Mutable<ColorSystemDesignerScaleRequestV1> = {
    id: 'synthetic-product',
    label: 'Synthetic product',
    contextId: 'interface',
    lockRest: true,
    modes: ['Day', 'Night'].map(modeId => ({
      modeId,
      polarity: modeId === 'Day' ? 'light' : 'dark',
      anchorColorId: 'blue',
      surfaceColorId: 'paper',
      textColorId: 'paper',
      focusColorId: 'ink',
    })),
  };
  return { input, request, source: buildColorSystemModelV1(input) };
}
function compile(f = fixture()) {
  return compileColorSystemDesignerScaleV1(f.source, f.request, decision);
}
function gap(f: ReturnType<typeof fixture>, colorId: string) {
  const color = f.input.colors.find(item => item.id === colorId)!;
  delete color.valuesByMode.Day;
  const id = `gap:${colorId}:Day`;
  color.claimIds.push(id);
  color.valueGapClaimIdsByMode = { Day: [id] };
  f.input.claims.push({
    id,
    sourceId: color.sourceId,
    text: 'Exact Day paint is unavailable.',
    status: 'unsupported',
    evidenceRefs: color.evidenceRefs,
    contextIds: [],
    ruleIds: [],
    modeIds: ['Day'],
  });
  f.input.coverage[0].status = 'partial';
  f.input.coverage[0].unresolvedClaimIds.push(id);
  f.source = buildColorSystemModelV1(f.input);
}
function adoptedRule(f: ReturnType<typeof fixture>, id: string) {
  const original = structuredClone(
    syntheticColorSystemModelInputV1().rules.find(rule => rule.id === id)!
  ) as Mutable<ColorSystemModelInputV1['rules'][number]>;
  f.input.rules = [{ ...original, contextIds: ['interface'] }];
  f.input.claims.find(claim => claim.id === 'claim:rules')!.ruleIds = [original.id];
  f.input.adoptions = [
    ...buildColorSystemRuleAdoptionsV1(f.input, [
      { ruleId: original.id, status: 'accepted', ...decision },
    ]),
  ];
  f.source = buildColorSystemModelV1(f.input);
}

describe('bounded designer source-scale compiler', () => {
  it('runs one real two-mode construction and complete applications while preserving exact source pins and related scales', async () => {
    const f = fixture(),
      before = serializeColorSystemInertJsonV1(f.source),
      result = compile(f);
    expect(result.qualified).toBe(false);
    expect(result.direction.composition).toHaveProperty('modelBinding', 'generated-model');
    expect(result.direction.interactionGroups).toHaveLength(4);
    expect(
      result.direction.interactionGroups!.every(group => 'modelBinding' in group.request)
    ).toBe(true);
    expect(result.direction.requirements.templates).toHaveLength(6);
    expect(result.direction.requirements.locks).toHaveLength(6);
    expect(result.plan.constructionBrief.decision).toEqual(decision);
    const executed = await executeColorSystemAuthoringDirectionV1(
      f.source,
      result.direction,
      runtime
    );
    expect(executed.status).toBe('ready');
    expect(executed.qualified).toBe(false);
    expect(executed.generation?.kind).toBe('construction');
    expect(executed.interactions).toHaveLength(4);
    const candidate = executed.candidates[0],
      model = candidate.proposal.workingModel;
    for (const color of f.source.colors)
      expect(model.colors.find(item => item.id === color.id)).toEqual(color);
    for (const scale of f.source.scales)
      expect(model.scales.find(item => item.id === scale.id)).toEqual(scale);
    expect(candidate.proposal.sourceAssessmentModel.scales).toEqual(f.source.scales);
    expect(candidate.proposal.sourceAssessmentModel.families).toEqual(f.source.families);
    expect(candidate.proposal.sourceAssessmentModel.rules).toEqual(f.source.rules);
    expect(candidate.proposal.request.review).toBeUndefined();
    expect(model.rules).toEqual(f.source.rules);
    expect(model.adoptions).toEqual(f.source.adoptions);
    const scale = model.scales.find(item => item.id === result.plan.request.scale.id)!;
    expect(scale.slots).toHaveLength(12);
    for (const mode of scale.modes) {
      expect(mode.anchors).toHaveLength(12);
      expect(mode.anchors.find(item => item.slotId === 'step:9')?.colorId).toBe('blue');
    }
    for (const application of candidate.applications.applications) {
      expect(application.eligible).toBe(true);
      expect(application.application.uses.find(use => use.id === 'rest')?.colorId).toBe('blue');
      expect(
        application.application.uses.every(use => use.area !== undefined && use.area > 0)
      ).toBe(true);
      for (const pair of application.pairs) {
        expect(pair.ratio).not.toBeNull();
        if (pair.assessment === 'required') expect(pair.status).toBe('pass');
        else expect(pair.status).toBe('inactive-exempt');
      }
    }
    expect(serializeColorSystemInertJsonV1(f.source)).toBe(before);
  });

  it('uses explicit focus ink for visible disabled states when active labels match the ground', async () => {
    const f = fixture(),
      compiled = compile(f);
    expect(compiled.policy.notes.join(' ')).toMatch(/separately chosen focus/);
    expect(compiled.policy.notes.join(' ')).toMatch(/inactive-exempt/);
    const result = await executeColorSystemAuthoringDirectionV1(
      f.source,
      compiled.direction,
      runtime
    );
    expect(result.status).toBe('ready');
    for (const app of result.candidates[0].applications.applications) {
      expect(app.application.uses.find(use => use.id === 'focus-ring')?.colorId).toBe('ink');
      expect(app.pairs.find(pair => pair.pairId === 'focus-ring:on:ground')?.threshold).toBe(3);
      expect(app.application.uses.find(use => use.id === 'disabled-text')?.colorId).toBe('ink');
      const link = app.application.uses[0].role === 'text-link.ground';
      if (!link)
        expect(app.application.uses.find(use => use.id === 'disabled-boundary')?.colorId).toBe(
          'ink'
        );
      for (const inactive of app.pairs.filter(pair => pair.assessment === 'inactive-exempt')) {
        expect(inactive.ratio).toBeGreaterThanOrEqual(3);
        expect(inactive.status).toBe('inactive-exempt');
      }
      const distinction = result.candidates[0].applications.distinctions.find(
        group => group.id === `${app.application.id}:states`
      )!;
      expect(distinction).toMatchObject({ expectedCount: link ? 4 : 3, pass: true });
    }
  });

  it('rejects an explicit disabled ink that is identical to a locked active link', async () => {
    const f = fixture();
    f.request.modes.forEach(mode => {
      mode.focusColorId = mode.anchorColorId;
    });
    const compiled = compile(f);
    const result = await executeColorSystemAuthoringDirectionV1(
      f.source,
      compiled.direction,
      runtime
    );
    expect(result.candidates).toEqual([]);
    expect(['infeasible', 'search-limited']).toContain(result.status);
    expect(result.composition).toHaveProperty(
      'diagnostics.failures',
      expect.arrayContaining([expect.objectContaining({ code: 'INCOMPLETE_DISTINCTION' })])
    );
    expect(
      compiled.direction.requirements.distinctions.filter(group => group.expectedCount === 4)
    ).toHaveLength(2);
  });

  it('separates exact step-nine preservation from a locked infeasible rest', async () => {
    const f = fixture();
    f.request.modes.forEach(mode => {
      mode.anchorColorId = 'blue-mid';
    });
    const locked = compile(f),
      failed = await executeColorSystemAuthoringDirectionV1(f.source, locked.direction, runtime);
    expect(failed.status).toBe('infeasible');
    expect(failed.candidates).toEqual([]);
    f.request.lockRest = false;
    const unlocked = compile(f);
    expect(unlocked.direction.requirements.locks).toEqual([]);
    expect(
      unlocked.direction.interactionGroups!.every(
        group => group.request.scales[0].lockedSlotIds === undefined
      )
    ).toBe(true);
    const result = await executeColorSystemAuthoringDirectionV1(
      f.source,
      unlocked.direction,
      runtime
    );
    expect(result.status).toBe('ready');
    const model = result.candidates[0].proposal.workingModel;
    expect(
      model.scales
        .find(item => item.id === unlocked.plan.request.scale.id)!
        .modes.every(
          mode => mode.anchors.find(anchor => anchor.slotId === 'step:9')?.colorId === 'blue-mid'
        )
    ).toBe(true);
    expect(
      result.candidates[0].applications.applications.every(
        app => app.application.uses.find(use => use.id === 'rest')?.colorId !== 'blue-mid'
      )
    ).toBe(true);
  });

  it('never reviews or bypasses a closed source palette to make extension pass', async () => {
    const f = fixture();
    adoptedRule(f, 'rule:palette');
    const result = compile(f),
      executed = await executeColorSystemAuthoringDirectionV1(f.source, result.direction, runtime);
    expect(result.plan.structureProposal.review).toBeUndefined();
    expect(result.plan.constructionIntent.review).toBeUndefined();
    expect(executed.candidates).toEqual([]);
    expect(['infeasible', 'search-limited']).toContain(executed.status);
    if (
      executed.generation?.kind !== 'construction' ||
      executed.generation.result.status !== 'proposed'
    )
      throw new Error('Expected the proposal to remain available for inspection.');
    expect(executed.generation.result.proposal.sourceAssessmentModel.adoptions).toEqual(
      f.source.adoptions
    );
    expect(executed.generation.result.proposal.workingModel.rules).toEqual(f.source.rules);
  });

  it('evaluates source prominence with measured areas and does not infer a replacement focus paint', async () => {
    const f = fixture();
    adoptedRule(f, 'rule:prominence');
    const result = compile(f),
      executed = await executeColorSystemAuthoringDirectionV1(f.source, result.direction, runtime);
    expect(executed.status).toBe('ready');
    expect(executed.candidates).toHaveLength(1);
    expect(executed.candidates[0].sourceCompliance).toHaveLength(6);
    expect(
      executed.candidates[0].sourceCompliance.every(assessment =>
        assessment.rules.some(
          rule =>
            rule.ruleId === 'rule:prominence' && rule.status === 'pass' && rule.satisfied === true
        )
      )
    ).toBe(true);
    expect(
      result.direction.requirements.templates.every(template =>
        template.uses.every(use => use.area !== undefined && use.area > 0)
      )
    ).toBe(true);
    const focus = fixture();
    focus.request.modes.forEach(mode => {
      mode.focusColorId = mode.surfaceColorId;
    });
    const unfocused = await executeColorSystemAuthoringDirectionV1(
      focus.source,
      compile(focus).direction,
      runtime
    );
    expect(unfocused.candidates).toEqual([]);
    expect(['infeasible', 'search-limited']).toContain(unfocused.status);
  });

  it('returns a deterministic detached plan with recipe-stable structure IDs and no write authority', () => {
    const f = fixture(),
      result = compile(f),
      original = serializeColorSystemInertJsonV1(result);
    expect(serializeColorSystemInertJsonV1(compile(f))).toBe(original);
    f.request.label = 'Renamed';
    f.request.modes[0].focusColorId = 'blue-deep';
    const renamed = compile(f);
    expect(renamed.plan.request.family.id).toBe(result.plan.request.family.id);
    expect(renamed.plan.request.scale.id).toBe(result.plan.request.scale.id);
    expect(renamed.requestHash).not.toBe(result.requestHash);
    expect(serializeColorSystemInertJsonV1(result)).toBe(original);
    expect(result.plan.structureProposal.brief.permissions).toEqual({
      addColors: true,
      addFamilies: true,
      addScales: true,
      addRules: false,
      editFamilyIds: [],
      editScaleIds: [],
      replaceRuleIds: [],
    });
    expect(result.direction.units[0]).toMatchObject({
      prominence: 'supporting',
      jobs: ['product-semantics', 'rendered-text-pair'],
    });
  });

  it('sorts explicit mode mappings without inferring their polarity or identity', () => {
    const f = fixture(),
      result = compile(f);
    f.request.modes.reverse();
    expect(compile(f)).toEqual(result);
    f.request.modes[0].polarity = 'light';
    expect(
      compile(f).plan.constructionBrief.scales.find(scale => scale.modeId === 'Night')!
        .lightnessOrder
    ).toBe('decreasing');
  });

  it('accepts four explicitly authored modes within the fixed application and selector bounds', () => {
    const f = fixture();
    for (const [modeId, basis] of [
      ['Dawn', 'Day'],
      ['Dusk', 'Night'],
    ] as const) {
      f.input.modes.push({ id: modeId, label: modeId });
      f.input.contexts.find(context => context.id === 'interface')!.modeIds.push(modeId);
      for (const color of f.input.colors)
        color.valuesByMode[modeId] = structuredClone(color.valuesByMode[basis]);
      f.request.modes.push({ ...f.request.modes.find(mode => mode.modeId === basis)!, modeId });
    }
    f.source = buildColorSystemModelV1(f.input);
    const result = compile(f);
    expect(result.plan.constructionBrief.scales).toHaveLength(4);
    expect(result.direction.requirements.templates).toHaveLength(12);
    expect(result.direction.interactionGroups).toHaveLength(8);
    expect(
      readColorSystemDesignerScaleRequestV1(
        f.source,
        result.direction,
        f.request.id,
        f.request.label
      )
    ).toEqual(result.request);
  });

  it.each(['anchorColorId', 'surfaceColorId', 'textColorId', 'focusColorId'] as const)(
    'rejects a missing or translucent exact %s instead of inventing an underlay',
    field => {
      const missing = fixture();
      missing.request.modes[0][field] = 'warm';
      gap(missing, 'warm');
      expect(() => compile(missing)).toThrow(`${field} warm has no exact source value`);
      const alpha = fixture();
      alpha.request.modes[0][field] = 'warm';
      const color = alpha.input.colors.find(item => item.id === alpha.request.modes[0][field])!;
      color.valuesByMode.Day = buildColorSystemSrgbValueV1(color.valuesByMode.Day.components, 0.9);
      alpha.source = buildColorSystemModelV1(alpha.input);
      expect(() => compile(alpha)).toThrow(`${field} warm in Day must be opaque`);
    }
  );

  it.each([
    [
      'unknown field',
      (r: Mutable<ColorSystemDesignerScaleRequestV1>) => ({ ...r, approval: true }),
    ],
    [
      'missing focus',
      (r: Mutable<ColorSystemDesignerScaleRequestV1>) => ({
        ...r,
        modes: r.modes.map(({ focusColorId: _focus, ...mode }) => mode),
      }),
    ],
    [
      'implicit polarity',
      (r: Mutable<ColorSystemDesignerScaleRequestV1>) => ({
        ...r,
        modes: r.modes.map(mode => ({ ...mode, polarity: undefined })),
      }),
    ],
    [
      'unknown context',
      (r: Mutable<ColorSystemDesignerScaleRequestV1>) => ({ ...r, contextId: 'missing' }),
    ],
    [
      'unknown mode',
      (r: Mutable<ColorSystemDesignerScaleRequestV1>) => ({
        ...r,
        modes: [{ ...r.modes[0], modeId: 'missing' }],
      }),
    ],
    [
      'duplicate mode',
      (r: Mutable<ColorSystemDesignerScaleRequestV1>) => ({
        ...r,
        modes: [r.modes[0], r.modes[0]],
      }),
    ],
    [
      'too many modes',
      (r: Mutable<ColorSystemDesignerScaleRequestV1>) => ({
        ...r,
        modes: Array(5).fill(r.modes[0]),
      }),
    ],
    [
      'unknown color',
      (r: Mutable<ColorSystemDesignerScaleRequestV1>) => ({
        ...r,
        modes: [{ ...r.modes[0], anchorColorId: 'missing' }],
      }),
    ],
    [
      'oversized label',
      (r: Mutable<ColorSystemDesignerScaleRequestV1>) => ({ ...r, label: 'x'.repeat(129) }),
    ],
    [
      'implicit lock',
      (r: Mutable<ColorSystemDesignerScaleRequestV1>) => ({ ...r, lockRest: null }),
    ],
  ])('rejects %s', (_label, mutate) => {
    const f = fixture();
    expect(() =>
      compileColorSystemDesignerScaleV1(f.source, mutate(f.request), decision)
    ).toThrow();
  });

  it('rejects executable, prototype, sparse and cyclic request data without invoking a getter', () => {
    const f = fixture();
    let reads = 0;
    const accessor = { ...f.request };
    Object.defineProperty(accessor, 'label', {
      enumerable: true,
      get() {
        reads++;
        return 'getter';
      },
    });
    expect(() => compileColorSystemDesignerScaleV1(f.source, accessor, decision)).toThrow(
      /accessor/
    );
    expect(reads).toBe(0);
    const sparse = { ...f.request, modes: new Array(2) };
    const cycle: Record<string, unknown> = { ...f.request };
    cycle.id = cycle;
    for (const input of [
      Object.create(f.request),
      sparse,
      cycle,
      { ...f.request, label: () => 'execute' },
    ])
      expect(() => compileColorSystemDesignerScaleV1(f.source, input, decision)).toThrow();
    const badDecision = {
      ...decision,
      actor: {
        get kind() {
          reads++;
          return 'user';
        },
        ref: 'caller',
      },
    };
    expect(() =>
      compileColorSystemDesignerScaleV1(f.source, f.request, badDecision as typeof decision)
    ).toThrow(/accessor/);
    expect(reads).toBe(0);
  });

  it('cancels the actual compiled execution without partial selection or source edits', async () => {
    const f = fixture(),
      before = serializeColorSystemInertJsonV1(f.source),
      compiled = compile(f);
    let cancelled = false;
    const result = await executeColorSystemAuthoringDirectionV1(f.source, compiled.direction, {
      isCancelled: () => cancelled,
      yield: async () => {
        cancelled = true;
      },
    });
    expect(result.status).toBe('cancelled');
    expect(result.candidates).toEqual([]);
    expect(result.generation).toBeNull();
    expect(serializeColorSystemInertJsonV1(f.source)).toBe(before);
  });

  it('reconstructs only the exact current form direction and leaves customized saved intent untouched', () => {
    const f = fixture(),
      compiled = compile(f),
      before = serializeColorSystemInertJsonV1(compiled.direction);
    expect(
      readColorSystemDesignerScaleRequestV1(
        f.source,
        compiled.direction,
        f.request.id,
        f.request.label
      )
    ).toEqual(compiled.request);
    expect(
      readColorSystemDesignerScaleRequestV1(
        f.source,
        compiled.direction,
        f.request.id,
        'Renamed outside form'
      )
    ).toBeNull();
    const changed = structuredClone(compiled.direction) as Mutable<typeof compiled.direction>;
    changed.requirements.templates[0].pairs[0].contrast!.minimum = 2;
    expect(
      readColorSystemDesignerScaleRequestV1(f.source, changed, f.request.id, f.request.label)
    ).toBeNull();
    expect(
      readColorSystemDesignerScaleRequestV1(
        f.source,
        { version: 'custom' },
        f.request.id,
        f.request.label
      )
    ).toBeNull();
    expect(serializeColorSystemInertJsonV1(compiled.direction)).toBe(before);
  });
});
