import legacyRecipe from './fixtures/legacyDesignerScaleV1.recipe.json';
import { parseColorSystemRecipeV1 } from '../colorSystemRecipeV1';
import { describe, expect, it } from 'vitest';
import {
  buildColorSystemContextApplicationV1,
  compileColorSystemRelationshipsV1,
} from '../colorSystemRelationshipsV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemScopedRuleV1,
} from '../colorSystemModelV1';
import {
  buildColorSystemApplicationRequirementsV1,
  compileColorSystemApplicationRequirementsV1,
} from '../colorSystemApplicationRequirementsV1';
import {
  buildColorSystemDesignContentV1,
  buildColorSystemDesignLockV1,
  recheckColorSystemDesignLockV1,
} from '../colorSystemDesignContentV1';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';

const paper = { kind: 'color' as const, id: 'paper', role: 'canvas' };
const warm = { kind: 'color' as const, id: 'warm', role: 'heading' };
const base = {
  id: 'rule',
  label: 'Explicit synthetic rule',
  contextIds: ['communications'],
  modeIds: ['Day'],
  origin: 'source-stated' as const,
  force: 'requirement' as const,
  evidenceRefs: ['evidence:rules'],
  claimIds: ['claim:rules'],
};
const rules: ColorSystemScopedRuleV1[] = [
  { ...base, kind: 'palette-membership', operands: { members: [paper, warm] } },
  { ...base, kind: 'role-binding', operands: { role: 'heading', members: [warm] } },
  {
    ...base,
    kind: 'required-partner',
    operands: { subject: [warm], subjectRole: 'heading', partner: [paper], partnerRole: 'canvas' },
  },
  {
    ...base,
    kind: 'allowed-pair',
    operands: { left: [warm], right: [paper], ordered: true, relation: 'foreground-background' },
  },
  {
    ...base,
    kind: 'forbidden-pair',
    force: 'prohibition',
    operands: { left: [warm], right: [paper], ordered: true, relation: 'foreground-background' },
  },
  { ...base, kind: 'color-count', operands: { members: [warm], minimum: 1, maximum: 1 } },
  { ...base, kind: 'prominence', operands: { kind: 'ordered-groups', groups: [[paper], [warm]] } },
];
function model(rule: ColorSystemScopedRuleV1) {
  const source = syntheticColorSystemModelInputV1();
  const raw = {
    ...source,
    rules: [rule],
    claims: source.claims.map(c => (c.id === 'claim:rules' ? { ...c, ruleIds: [rule.id] } : c)),
    adoptions: [],
  };
  return buildColorSystemModelV1({
    ...raw,
    adoptions: buildColorSystemRuleAdoptionsV1(raw, [
      {
        ruleId: rule.id,
        status: 'accepted',
        actor: { kind: 'agent', ref: 'synthetic-review' },
        authorityRef: 'fixture',
        decisionRef: 'fixture',
      },
    ]),
  });
}
function application(mapped: boolean) {
  return buildColorSystemContextApplicationV1({
    id: 'panel',
    contextId: 'communications',
    modeId: 'Day',
    uses: [
      {
        id: 'ground',
        colorId: 'paper',
        role: mapped ? 'ground' : 'canvas',
        ...(mapped ? { sourceRole: 'canvas' } : {}),
        area: 90,
      },
      {
        id: 'text-1',
        colorId: 'warm',
        role: mapped ? 'text-1' : 'heading',
        ...(mapped ? { sourceRole: 'heading' } : {}),
        area: 10,
      },
    ],
    pairs: [{ id: 'heading:canvas', foregroundUseId: 'text-1', backgroundUseId: 'ground' }],
  });
}

describe('explicit source-role bindings', () => {
  it.each(rules)(
    'preserves $kind source predicates without renaming structural paint roles',
    rule => {
      const evaluate = compileColorSystemRelationshipsV1(model(rule));
      const original = evaluate.evaluate(application(false));
      const mapped = evaluate.evaluate(application(true));
      expect(mapped.rules).toEqual(original.rules);
      const omitted = application(true);
      const missing = evaluate.evaluate({
        ...omitted,
        uses: omitted.uses.map(({ sourceRole: _role, ...use }) => use),
      });
      expect(missing.rules).not.toEqual(original.rules);
      expect(mapped.application.uses.map(u => u.role)).toEqual(['ground', 'text-1']);
    }
  );
  it('binds mappings to requirements so an unpainted role change cannot reuse an assessment', () => {
    const app = application(true);
    const requirements = buildColorSystemApplicationRequirementsV1({
      schemaVersion: 'teul.application-requirements.v1',
      templates: [{ ...app, uses: app.uses.map(({ colorId: _color, ...use }) => use) }],
      distinctions: [],
    });
    expect(requirements.templates[0].uses[1].sourceRole).toBe('heading');
    const evaluator = compileColorSystemApplicationRequirementsV1(model(rules[1]), requirements);
    expect(evaluator.evaluate([app]).eligible).toBe(true);
    const changed = evaluator.evaluate([
      { ...app, uses: app.uses.map(use => ({ ...use, sourceRole: 'changed' })) },
    ]);
    expect(changed.eligible).toBe(false);
    expect(changed.blockers.some(blocker => blocker.code === 'INCOMPLETE_APPLICATION')).toBe(true);
  });
  it('retains role-rule lock dependencies even when their selected colors do not match', () => {
    const rule = {
      ...rules[1],
      operands: { role: 'heading', members: [{ kind: 'color' as const, id: 'ink' }] },
    } as ColorSystemScopedRuleV1;
    const source = model(rule),
      app = application(true);
    const design = buildColorSystemDesignContentV1(source, [app]);
    const lock = buildColorSystemDesignLockV1(design, { kind: 'scale', id: 'warm-scale' });
    expect(lock.snapshot.rules.map(r => r.id)).toContain('rule');
    const edited = buildColorSystemDesignContentV1(source, [
      { ...app, uses: app.uses.map(use => ({ ...use, sourceRole: 'changed' })) },
    ]);
    expect(recheckColorSystemDesignLockV1(lock, edited).status).toBe('changed');
  });
  it.each([null, '', ' '.repeat(3), 'x'.repeat(129), 3])(
    'rejects invalid source-role binding %j',
    sourceRole => {
      const app = application(true);
      expect(() =>
        buildColorSystemContextApplicationV1({
          ...app,
          uses: app.uses.map(use => ({ ...use, sourceRole })),
        })
      ).toThrow();
    }
  );
  it('rejects accessor bindings without calling them and preserves legacy absence', () => {
    const app = application(false),
      use = { ...app.uses[0] };
    Object.defineProperty(use, 'sourceRole', {
      enumerable: true,
      get() {
        throw new Error('Getter ran');
      },
    });
    expect(() =>
      buildColorSystemContextApplicationV1({ ...app, uses: [use, app.uses[1]] })
    ).toThrow(/accessor|fields/);
    expect(buildColorSystemContextApplicationV1(app)).toEqual(app);
    expect(JSON.stringify(app)).not.toContain('sourceRole');
  });
});

describe('source-role recipe capability validation', () => {
  it.each(['construction', 'overlay'])(
    'rejects invalid nested versions inside a V3 %s recipe',
    kind => {
      for (const version of ['teul.construction-proposal.v99', 'teul.construction-proposal.v2']) {
        const original = structuredClone(legacyRecipe);
        const generation = original.direction.generation;
        generation.intent.version = version;
        const raw = {
          ...original,
          schemaVersion: 'teul.color-system-recipe.v3',
          selection: null,
          locks: [],
          direction: {
            ...original.direction,
            requirements: {
              ...original.direction.requirements,
              templates: original.direction.requirements.templates.map(template => ({
                ...template,
                uses: template.uses.map(use => ({ ...use, sourceRole: 'canvas' })),
              })),
            },
            generation:
              kind === 'overlay'
                ? {
                    kind: 'overlay',
                    proposal: {
                      version: 'teul.overlay-proposal.v1',
                      id: 'version-test',
                      sourceModelHash: original.source.model.modelHash,
                      brief: generation.intent.brief,
                      fragments: [{ ...generation, id: 'scale' }],
                    },
                  }
                : generation,
          },
        };
        expect(() => parseColorSystemRecipeV1(raw)).toThrow(
          'Unsupported or mismatched construction'
        );
      }
    }
  );
});
