import legacyRecipe from './fixtures/legacyDesignerScaleV1.recipe.json';
import {
  parseColorSystemRecipeV1,
  colorSystemRecipeSchemaForDirectionV1,
} from '../colorSystemRecipeV1';
import { compileColorSystemAuthoredDeliveryV1 } from '../colorSystemAuthoringDeliveryV1';
import {
  compileColorSystemProposalV1,
  type ColorSystemProposalRequestV1,
} from '../colorSystemProposalV1';
import { readColorSystemDecorativeGradientsV1 } from '../colorSystemDecorativeGradientV1';
import { describe, expect, it } from 'vitest';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemScopedRuleV1,
  type ColorSystemModelV1,
} from '../colorSystemModelV1';
import {
  buildColorSystemContextApplicationV1,
  compileColorSystemRelationshipsV1,
} from '../colorSystemRelationshipsV1';
import { retainGradientPaintV2 } from '../colorSystemGradientDesignV2';
import {
  buildColorSystemApplicationRequirementsV1,
  compileColorSystemApplicationRequirementsV1,
} from '../colorSystemApplicationRequirementsV1';
import {
  assessColorSystemApplicationGeometryV1,
  hashColorSystemGeometryApplicationsV1,
} from '../colorSystemApplicationGeometryV1';
import {
  buildColorSystemDesignContentV1,
  buildColorSystemDesignLockV1,
  recheckColorSystemDesignLockV1,
} from '../colorSystemDesignContentV1';
import { serializeGradientSvgV1 } from '../colorSystemGradientPaintV1';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';

const base = {
  id: 'rule:mixed',
  label: 'Synthetic whole-board rule',
  contextIds: ['communications'],
  modeIds: ['Day'],
  origin: 'source-stated' as const,
  force: 'requirement' as const,
  evidenceRefs: ['evidence:rules'],
  claimIds: ['claim:rules'],
};
const selector = { kind: 'color' as const, id: 'paper' };
const unresolvedRules: ColorSystemScopedRuleV1[] = [
  { ...base, kind: 'palette-membership', operands: { members: [selector] } },
  { ...base, kind: 'color-count', operands: { members: [selector], minimum: 1, maximum: 1 } },
  {
    ...base,
    kind: 'prominence',
    operands: { kind: 'area-fraction', members: [selector], minimum: 0.8, maximum: 1 },
  },
  { ...base, kind: 'role-binding', operands: { role: 'illustration', members: [selector] } },
  {
    ...base,
    kind: 'required-partner',
    operands: { subject: [selector], partner: [{ kind: 'color', id: 'blue' }] },
  },
  {
    ...base,
    kind: 'allowed-pair',
    operands: {
      left: [selector],
      right: [{ kind: 'color', id: 'ink' }],
      ordered: false,
      relation: 'co-present',
    },
  },
  {
    ...base,
    kind: 'forbidden-pair',
    force: 'prohibition',
    operands: {
      left: [selector],
      right: [{ kind: 'color', id: 'blue' }],
      ordered: false,
      relation: 'co-present',
    },
  },
];
function model(rules: ColorSystemScopedRuleV1[] = []) {
  const input = syntheticColorSystemModelInputV1();
  const raw = {
    ...input,
    rules,
    adoptions: [],
    contexts: [
      ...input.contexts,
      { ...input.contexts[0], id: 'gradient:communications', label: 'Decorative gradient' },
    ],
    claims: input.claims.map(c =>
      c.id === 'claim:rules' ? { ...c, ruleIds: rules.map(r => r.id) } : c
    ),
  };
  return buildColorSystemModelV1({
    ...raw,
    adoptions: buildColorSystemRuleAdoptionsV1(
      raw,
      rules.map(rule => ({
        ruleId: rule.id,
        status: 'accepted' as const,
        actor: { kind: 'agent' as const, ref: 'synthetic' },
        authorityRef: 'synthetic',
        decisionRef: 'synthetic',
      }))
    ),
  });
}
function paint(source: ColorSystemModelV1, angle = 90) {
  const stops = ['blue-deep', 'warm'].map((id, index) => ({
    position: index,
    locked: true,
    sourceColorId: id,
    value: source.colors.find(c => c.id === id)!.valuesByMode.Day,
  }));
  return retainGradientPaintV2(
    {
      sourceModelHash: source.modelHash,
      briefHash: `sha256:${'b'.repeat(64)}`,
      angleDegrees: angle,
      route: { space: 'oklab' },
      stops,
    },
    stops.map(({ position, value }) => ({ position, value }))
  );
}
function application(source: ColorSystemModelV1, angle = 90) {
  return buildColorSystemContextApplicationV1({
    id: 'board',
    contextId: 'communications',
    modeId: 'Day',
    uses: [
      { id: 'canvas', colorId: 'paper', role: 'ground', sourceRole: 'canvas' },
      { id: 'label', colorId: 'ink', role: 'text-1', sourceRole: 'heading' },
    ],
    pairs: [
      {
        id: 'text',
        foregroundUseId: 'label',
        backgroundUseId: 'canvas',
        contrast: { minimum: 4.5, assessment: 'required' },
      },
    ],
    gradients: [
      {
        id: 'decoration',
        role: 'decoration',
        sourceRole: 'illustration',
        paint: paint(source, angle),
      },
    ],
  });
}
function geometry(source: ColorSystemModelV1, app = application(source)) {
  return {
    version: 'teul.application-geometry.v1' as const,
    modelHash: source.modelHash,
    applicationsHash: hashColorSystemGeometryApplicationsV1([app]),
    boards: [
      {
        applicationId: 'board',
        width: 800,
        height: 400,
        root: {
          id: 'root',
          useId: 'canvas',
          shape: { kind: 'rect' as const, x: 0, y: 0, width: 800, height: 400 },
          children: [
            {
              id: 'gradient',
              useId: 'decoration',
              shape: { kind: 'rect' as const, x: 0, y: 0, width: 400, height: 400 },
              children: [],
            },
            {
              id: 'label',
              useId: 'label',
              shape: { kind: 'rect' as const, x: 440, y: 40, width: 100, height: 20 },
              children: [],
            },
          ],
        },
      },
    ],
  };
}
describe('explicit decorative gradient application paints', () => {
  it('blocks a gradient foreground/background prohibition instead of treating its role as absent', () => {
    const rule: ColorSystemScopedRuleV1 = {
      ...base,
      kind: 'forbidden-pair',
      force: 'prohibition',
      operands: {
        left: [{ kind: 'color', id: 'blue-deep', role: 'illustration' }],
        right: [{ kind: 'color', id: 'paper', role: 'canvas' }],
        ordered: true,
        relation: 'foreground-background',
      },
    };
    const source = model([rule]);
    const result = compileColorSystemRelationshipsV1(source).evaluate(application(source));
    expect(result.eligible).toBe(false);
    expect(result.rules[0].status).toBe('unresolved');
  });
  it('retains trusted frozen gradients without reparsing their paint and still rejects mutated input', () => {
    const source = model(),
      gradients = application(source).gradients!;
    expect(Object.isFrozen(gradients)).toBe(true);
    expect(Object.isFrozen(gradients[0])).toBe(true);
    expect(readColorSystemDecorativeGradientsV1(gradients)).toBe(gradients);
    const untrusted = structuredClone(gradients);
    if (!('compiledPaint' in untrusted[0].paint)) throw new Error('Expected generated paint');
    untrusted[0].paint.compiledPaint.stops[0].position = 0.01;
    expect(() => readColorSystemDecorativeGradientsV1(untrusted)).toThrow();
  });
  it('evaluates source and working policy without rewriting the exact retained paint binding', () => {
    const source = model();
    const request: ColorSystemProposalRequestV1 = {
      version: 'teul.color-system-proposal.v1',
      id: 'mixed-extension',
      sourceModelHash: source.modelHash,
      brief: {
        briefHash: `sha256:${'d'.repeat(64)}`,
        operation: 'extend',
        contextIds: ['communications'],
        modeIds: ['Day'],
        permissions: {
          addColors: false,
          addFamilies: true,
          addScales: false,
          addRules: false,
          editFamilyIds: [],
          editScaleIds: [],
          replaceRuleIds: [],
        },
      },
      derivation: {
        algorithmId: 'synthetic:family',
        algorithmVersion: '1',
        policyHash: `sha256:${'e'.repeat(64)}`,
        inputHash: `sha256:${'f'.repeat(64)}`,
        sourceColorIds: ['blue-deep', 'warm'],
        sourceScaleIds: [],
      },
      colors: [],
      families: [{ id: 'new-family', label: 'Synthetic family', colorIds: ['blue-deep', 'warm'] }],
      scales: [],
      rules: [],
      exceptions: [],
    };
    const compiled = compileColorSystemProposalV1(source, request),
      working = compiled.proposal.workingModel;
    expect(working.modelHash).not.toBe(compiled.proposal.sourceAssessmentModel.modelHash);
    const app = application(working),
      result = compiled.evaluate(app);
    expect(result.sourceCompliance.eligible).toBe(true);
    expect(result.workingAssessment.eligible).toBe(true);
    expect(result.sourceCompliance.gradientPaintModelHash).toBe(working.modelHash);
    expect(result.sourceCompliance.application.gradients![0].paint).toEqual(
      app.gradients![0].paint
    );
    expect(() =>
      compileColorSystemRelationshipsV1(compiled.proposal.sourceAssessmentModel).evaluate(app)
    ).toThrow('exact working model');
  });
  it('requires recipe V4 for mixed intent or selection and keeps native solid delivery closed', async () => {
    const source = model(),
      gradients = application(source).gradients;
    const old = parseColorSystemRecipeV1(legacyRecipe);
    const recipe = {
      ...old,
      schemaVersion: 'teul.color-system-recipe.v4' as const,
      selection: null,
      locks: [],
      direction: {
        ...old.direction,
        requirements: {
          ...old.direction.requirements,
          templates: old.direction.requirements.templates.map(t => ({ ...t, gradients })),
        },
      },
    };
    expect(colorSystemRecipeSchemaForDirectionV1(recipe.direction)).toBe(
      'teul.color-system-recipe.v4'
    );
    expect(parseColorSystemRecipeV1(recipe).schemaVersion).toBe('teul.color-system-recipe.v4');
    for (const schemaVersion of [
      'teul.color-system-recipe.v1',
      'teul.color-system-recipe.v2',
      'teul.color-system-recipe.v3',
    ])
      expect(() => parseColorSystemRecipeV1({ ...recipe, schemaVersion })).toThrow('recipe V4');
    await expect(compileColorSystemAuthoredDeliveryV1(recipe, {})).rejects.toThrow(
      'mixed-paint delivery'
    );
    const mixed = application(source),
      content = buildColorSystemDesignContentV1(source, [mixed]);
    const selection = {
      model: source,
      applications: [mixed],
      contentHash: content.contentHash,
      executionReceiptHash: `sha256:${'e'.repeat(64)}`,
    };
    expect(() =>
      parseColorSystemRecipeV1({
        ...old,
        schemaVersion: 'teul.color-system-recipe.v3',
        selection,
        locks: [],
      })
    ).toThrow('recipe V4');
  });

  it('retains exact gradients and measures a single board without assigning their area to a stop', () => {
    const source = model(),
      app = application(source);
    const measured = assessColorSystemApplicationGeometryV1(source, [app], geometry(source, app));
    expect(measured.areas).toEqual(
      expect.arrayContaining([
        { applicationId: 'board', useId: 'decoration', area: 160000 },
        { applicationId: 'board', useId: 'label', area: 2000 },
        { applicationId: 'board', useId: 'canvas', area: 158000 },
      ])
    );
    expect(measured.measuredApplications[0].gradients![0].paint).toEqual(app.gradients![0].paint);
    const result = compileColorSystemRelationshipsV1(source).evaluate(
      measured.measuredApplications[0]
    );
    expect(result.eligible).toBe(true);
    expect(result.pairs[0].status).toBe('pass');
    expect(result.gradientSourceAssessment?.application.uses).toEqual([]);
  });
  it.each(unresolvedRules)(
    'blocks unmeasured whole-board $kind instead of restoring a panel-only pass',
    rule => {
      const source = model([rule]);
      const result = compileColorSystemRelationshipsV1(source).evaluate(application(source));
      expect(result.eligible).toBe(false);
      expect(result.rules[0]).toMatchObject({
        status: 'unresolved',
        satisfied: null,
        enforcement: 'blocking',
      });
    }
  );
  it('keeps a definite solid foreground/background failure despite an unrelated gradient', () => {
    const rule: ColorSystemScopedRuleV1 = {
      ...base,
      kind: 'forbidden-pair',
      force: 'prohibition',
      operands: {
        left: [{ kind: 'color', id: 'ink' }],
        right: [selector],
        ordered: true,
        relation: 'foreground-background',
      },
    };
    const source = model([rule]);
    expect(
      compileColorSystemRelationshipsV1(source).evaluate(application(source)).rules[0].status
    ).toBe('fail');
  });
  it('can assess a solid-only heading role without pretending to assess continuous colors', () => {
    const rule: ColorSystemScopedRuleV1 = {
      ...base,
      kind: 'role-binding',
      operands: { role: 'heading', members: [{ kind: 'color', id: 'ink' }] },
    };
    const source = model([rule]);
    expect(compileColorSystemRelationshipsV1(source).evaluate(application(source)).eligible).toBe(
      true
    );
  });
  it('requires the separate gradient source context and propagates its unresolved rules', () => {
    const source = model([{ ...unresolvedRules[0], contextIds: ['gradient:communications'] }]);
    const result = compileColorSystemRelationshipsV1(source).evaluate(application(source));
    expect(result.eligible).toBe(false);
    expect(result.gradientSourceAssessment?.rules[0].status).toBe('unresolved');
    const { modelHash: _hash, ...raw } = model();
    const absent = buildColorSystemModelV1({
      ...raw,
      contexts: raw.contexts.filter(c => !c.id.startsWith('gradient:')),
    });
    expect(
      compileColorSystemRelationshipsV1(absent)
        .evaluate(application(absent))
        .blockers.some(b => b.reason.includes('explicit gradient context'))
    ).toBe(true);
  });
  it('keeps actual-parent contrast failures and rejects text painted on a decorative gradient', () => {
    const source = model(),
      app = application(source);
    const wrong = buildColorSystemContextApplicationV1({
      ...app,
      uses: app.uses.map(u => (u.id === 'label' ? { ...u, colorId: 'paper' } : u)),
    });
    expect(compileColorSystemRelationshipsV1(source).evaluate(wrong).pairs[0].status).toBe('fail');
    expect(() =>
      buildColorSystemContextApplicationV1({
        ...app,
        pairs: [{ ...app.pairs[0], backgroundUseId: 'decoration' }],
      })
    ).toThrow('Pair references');
    const plan = geometry(source, app),
      children = plan.boards[0].root.children;
    const covered = {
      ...plan,
      boards: [
        {
          ...plan.boards[0],
          root: {
            ...plan.boards[0].root,
            children: [
              {
                ...children[0],
                children: [{ ...children[1], shape: { ...children[1].shape, x: 40 } }],
              },
            ],
          },
        },
      ],
    };
    expect(() => assessColorSystemApplicationGeometryV1(source, [app], covered)).toThrow(
      'rectangular leaf'
    );
  });
  it('rejects stale source bindings, altered stops, impersonated roles, missing paint and area drift', () => {
    const source = model(),
      app = application(source);
    const g = app.gradients![0];
    expect(() =>
      buildColorSystemContextApplicationV1({ ...app, gradients: [{ ...g, role: 'ground' }] })
    ).toThrow();
    expect(() =>
      buildColorSystemContextApplicationV1({ ...app, gradients: [{ ...g, id: 'canvas' }] })
    ).toThrow();
    expect(() =>
      buildColorSystemContextApplicationV1({
        ...app,
        gradients: [{ ...g, paint: { ...g.paint, angleDegrees: 0 } }],
      })
    ).toThrow();
    const { modelHash: _hash, ...raw } = source;
    const changed = buildColorSystemModelV1({
      ...raw,
      contexts: raw.contexts.map(c => ({ ...c, label: c.label + ' edited' })),
    });
    expect(() => compileColorSystemRelationshipsV1(changed).evaluate(app)).toThrow(
      'exact working model'
    );
    const area = buildColorSystemContextApplicationV1({ ...app, gradients: [{ ...g, area: 1 }] });
    expect(() =>
      assessColorSystemApplicationGeometryV1(source, [area], geometry(source, area))
    ).toThrow('gradient area');
    const plan = geometry(source, app);
    plan.boards[0].root.children = plan.boards[0].root.children.filter(
      n => n.useId !== 'decoration'
    );
    expect(() => assessColorSystemApplicationGeometryV1(source, [app], plan)).toThrow(
      'positive aggregate'
    );
  });
  it('binds gradients to requirements, design content and family locks', () => {
    const source = model(),
      app = application(source);
    const requirements = buildColorSystemApplicationRequirementsV1({
      schemaVersion: 'teul.application-requirements.v1',
      templates: [{ ...app, uses: app.uses.map(({ colorId: _id, ...use }) => use) }],
      distinctions: [],
    });
    expect(
      compileColorSystemApplicationRequirementsV1(source, requirements).evaluate([app]).eligible
    ).toBe(true);
    const changed = application(source, 0);
    expect(
      compileColorSystemApplicationRequirementsV1(source, requirements).evaluate([changed]).eligible
    ).toBe(false);
    const content = buildColorSystemDesignContentV1(source, [app]);
    const lock = buildColorSystemDesignLockV1(content, { kind: 'family', id: 'pigments' });
    expect(
      recheckColorSystemDesignLockV1(lock, buildColorSystemDesignContentV1(source, [changed]))
        .status
    ).toBe('changed');
  });
  it('keeps legacy application bytes and gives combined SVG gradients distinct safe identities', () => {
    const source = model();
    const { gradients: _gradients, ...solid } = application(source);
    expect(JSON.stringify(buildColorSystemContextApplicationV1(solid))).toBe(JSON.stringify(solid));
    const p = paint(source);
    expect(serializeGradientSvgV1(p, 400, 400, 'left')).toContain('url(#left)');
    expect(serializeGradientSvgV1(p, 400, 400, 'right')).not.toContain('#left');
    expect(() => serializeGradientSvgV1(p, 400, 400, 'x" onload="x')).toThrow('identity');
  });
});
