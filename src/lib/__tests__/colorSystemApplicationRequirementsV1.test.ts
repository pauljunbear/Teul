import { describe, expect, it, vi } from 'vitest';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../colorSystemModelV1';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';
import {
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
  buildColorSystemApplicationRequirementsV1,
  compileColorSystemApplicationRequirementsV1,
  type ColorSystemApplicationRequirementsV1,
  type ColorSystemApplicationTemplateV1,
} from '../colorSystemApplicationRequirementsV1';
import { type ColorSystemContextApplicationV1 } from '../colorSystemRelationshipsV1';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};
function modelInput() {
  const input = JSON.parse(
    JSON.stringify(syntheticColorSystemModelInputV1())
  ) as Mutable<ColorSystemModelInputV1>;
  input.rules = [];
  input.adoptions = [];
  input.claims.forEach(claim => {
    claim.ruleIds = [];
  });
  return input;
}
function productTemplate(): Mutable<ColorSystemApplicationTemplateV1> {
  return {
    id: 'controls:Day',
    contextId: 'interface',
    modeId: 'Day',
    uses: [
      { id: 'ground', role: 'surface', area: 900 },
      ...['rest', 'hover', 'pressed'].flatMap(state => [
        { id: state, role: `control.${state}`, area: 100 },
        { id: `label:${state}`, role: `control.label.${state}`, area: 5 },
      ]),
      { id: 'focus', role: 'focus', area: 12 },
      { id: 'disabled', role: 'disabled', area: 100 },
    ],
    pairs: [
      ...['rest', 'hover', 'pressed'].flatMap(state => [
        {
          id: `boundary:${state}`,
          foregroundUseId: state,
          backgroundUseId: 'ground',
          contrast: { minimum: 3, assessment: 'required' as const },
        },
        {
          id: `label:${state}`,
          foregroundUseId: `label:${state}`,
          backgroundUseId: state,
          underlayUseId: 'ground',
          contrast: { minimum: 4.5, assessment: 'required' as const },
        },
      ]),
      {
        id: 'focus',
        foregroundUseId: 'focus',
        backgroundUseId: 'ground',
        contrast: { minimum: 3, assessment: 'required' },
      },
      {
        id: 'disabled',
        foregroundUseId: 'disabled',
        backgroundUseId: 'ground',
        contrast: { minimum: 3, assessment: 'inactive-exempt' },
      },
    ],
  };
}
function fixture() {
  const input = modelInput();
  const model = buildColorSystemModelV1(input);
  const template = productTemplate();
  const requirements: Mutable<ColorSystemApplicationRequirementsV1> = {
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: [template],
    distinctions: [
      {
        id: 'control:states',
        applicationId: template.id,
        kind: 'interaction-states',
        useIds: ['rest', 'hover', 'pressed'],
        groundUseId: 'ground',
        minimumDeltaEOK: 0,
        expectedCount: 3,
      },
    ],
  };
  const application: Mutable<ColorSystemContextApplicationV1> = {
    ...JSON.parse(JSON.stringify(template)),
    uses: template.uses.map(use => ({
      ...use,
      colorId:
        use.id.startsWith('label:') || use.id === 'ground'
          ? 'paper'
          : use.id === 'rest' || use.id === 'focus'
            ? 'blue'
            : use.id === 'hover'
              ? 'blue-deep'
              : use.id === 'disabled'
                ? 'blue-pale'
                : 'ink',
    })),
  };
  return { input, model, requirements, application };
}

describe('complete authored application requirements', () => {
  it('assesses all declared state, label, focus, disabled and ground uses together', () => {
    const { model, requirements, application } = fixture();
    const result = compileColorSystemApplicationRequirementsV1(model, requirements).evaluate([
      application,
    ]);
    expect(result.eligible).toBe(true);
    expect(result.applications[0].pairs).toHaveLength(8);
    expect(result.applications[0].pairs.find(pair => pair.pairId === 'disabled')?.status).toBe(
      'inactive-exempt'
    );
    expect(result.distinctions[0]).toMatchObject({
      expectedCount: 3,
      observedCount: 3,
      pass: true,
    });
  });

  it.each(['focus', 'disabled'])('rejects a visually attractive candidate missing %s', id => {
    const { model, requirements, application } = fixture();
    application.uses = application.uses.filter(use => use.id !== id);
    application.pairs = application.pairs.filter(pair => pair.foregroundUseId !== id);
    const result = compileColorSystemApplicationRequirementsV1(model, requirements).evaluate([
      application,
    ]);
    expect(result.eligible).toBe(false);
    expect(result.blockers.some(blocker => blocker.code === 'INCOMPLETE_APPLICATION')).toBe(true);
  });

  it('does not accept omitted pair checks or weakened required contrast as equivalent', () => {
    const { model, requirements, application } = fixture();
    Object.assign(application.pairs[0].contrast!, { assessment: 'advisory' });
    Object.assign(application.pairs[1].contrast!, { minimum: 1 });
    const result = compileColorSystemApplicationRequirementsV1(model, requirements).evaluate([
      application,
    ]);
    expect(result.eligible).toBe(false);
    expect(result.blockers.some(blocker => blocker.code === 'INCOMPLETE_APPLICATION')).toBe(true);
  });

  it('fails a complete geometry when actual required pairs fail', () => {
    const { model, requirements, application } = fixture();
    application.uses.find(use => use.id === 'focus')!.colorId = 'blue-pale';
    const result = compileColorSystemApplicationRequirementsV1(model, requirements).evaluate([
      application,
    ]);
    expect(result.eligible).toBe(false);
    expect(result.blockers.some(blocker => blocker.id === 'controls:Day:focus')).toBe(true);
  });

  it('preserves source rule enforcement alongside complete numerical state requirements', () => {
    const { input, requirements, application } = fixture();
    input.rules = [
      {
        id: 'source:focus',
        label: 'Fixture focus color',
        contextIds: ['interface'],
        modeIds: ['Day'],
        origin: 'source-stated',
        force: 'requirement',
        kind: 'role-binding',
        operands: { role: 'focus', members: [{ kind: 'color', id: 'warm-deep' }] },
        evidenceRefs: ['evidence:rules'],
        claimIds: ['claim:rules'],
      },
    ];
    input.adoptions = [
      ...buildColorSystemRuleAdoptionsV1(input, [
        {
          ruleId: 'source:focus',
          status: 'accepted',
          actor: { kind: 'agent', ref: 'test' },
          authorityRef: 'synthetic',
          decisionRef: 'test:focus',
        },
      ]),
    ];
    const result = compileColorSystemApplicationRequirementsV1(
      buildColorSystemModelV1(input),
      requirements
    ).evaluate([application]);
    expect(result.eligible).toBe(false);
    expect(result.blockers.some(blocker => blocker.id === 'controls:Day:source:focus')).toBe(true);
  });

  it('rejects rendered-identical states even when source color identities differ', () => {
    const { input, requirements, application } = fixture();
    for (const id of ['blue', 'blue-deep'])
      input.colors.find(color => color.id === id)!.valuesByMode.Day = buildColorSystemSrgbValueV1({
        r: 0.2,
        g: 0.3,
        b: 0.4,
      });
    const result = compileColorSystemApplicationRequirementsV1(
      buildColorSystemModelV1(input),
      requirements
    ).evaluate([application]);
    expect(result.distinctions[0]).toMatchObject({
      observedCount: 3,
      observedMinimumDeltaEOK: 0,
      pass: false,
    });
    expect(result.eligible).toBe(false);
  });

  it('does not infer an opaque ground for distinctness', () => {
    const { input, requirements, application } = fixture();
    const paper = input.colors.find(color => color.id === 'paper')!;
    paper.valuesByMode.Day = buildColorSystemSrgbValueV1(paper.valuesByMode.Day.components, 0.5);
    const result = compileColorSystemApplicationRequirementsV1(
      buildColorSystemModelV1(input),
      requirements
    ).evaluate([application]);
    expect(result.eligible).toBe(false);
    expect(result.distinctions[0]).toMatchObject({ observedMinimumDeltaEOK: null, pass: false });
    expect(result.blockers.some(blocker => blocker.reason.includes('opaque ground'))).toBe(true);
  });

  it('rejects a distinction measured on an unrelated ground that hides identical actual states', () => {
    const input = modelInput();
    input.colors.find(color => color.id === 'ink')!.valuesByMode.Day = buildColorSystemSrgbValueV1({
      r: 0,
      g: 0,
      b: 0,
    });
    input.colors.find(color => color.id === 'blue')!.valuesByMode.Day = buildColorSystemSrgbValueV1(
      { r: 1, g: 1, b: 1 },
      0.5
    );
    input.colors.find(color => color.id === 'blue-deep')!.valuesByMode.Day =
      buildColorSystemSrgbValueV1({ r: 0.5, g: 0.5, b: 0.5 });
    const model = buildColorSystemModelV1(input);
    const template: ColorSystemApplicationTemplateV1 = {
      id: 'alpha-states',
      contextId: 'interface',
      modeId: 'Day',
      uses: ['black', 'unrelated-white', 'rest', 'hover'].map(id => ({ id, role: id, area: 10 })),
      pairs: ['rest', 'hover'].map(id => ({
        id: `pair:${id}`,
        foregroundUseId: id,
        backgroundUseId: 'black',
        contrast: { minimum: 3, assessment: 'required' },
      })),
    };
    const requirements: Mutable<ColorSystemApplicationRequirementsV1> = {
      schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
      templates: [JSON.parse(JSON.stringify(template))],
      distinctions: [
        {
          id: 'states',
          applicationId: template.id,
          kind: 'interaction-states',
          useIds: ['rest', 'hover'],
          groundUseId: 'unrelated-white',
          expectedCount: 2,
          minimumDeltaEOK: 0,
        },
      ],
    };
    expect(() => compileColorSystemApplicationRequirementsV1(model, requirements)).toThrow(
      /actual pair/
    );
    requirements.distinctions[0].groundUseId = 'black';
    const application: ColorSystemContextApplicationV1 = {
      ...template,
      uses: template.uses.map((use, i) => ({
        ...use,
        colorId: ['ink', 'paper', 'blue', 'blue-deep'][i],
      })),
    };
    const result = compileColorSystemApplicationRequirementsV1(model, requirements).evaluate([
      application,
    ]);
    expect(result.applications[0].pairs.every(pair => pair.status === 'pass')).toBe(true);
    expect(result.distinctions[0]).toMatchObject({
      observedMinimumDeltaEOK: 0,
      pass: false,
      groundUseId: 'black',
    });
    expect(result.eligible).toBe(false);
  });

  it('requires five chart series, preserves their fixed count and labels CVD evidence separately', () => {
    const { model } = fixture();
    const template: ColorSystemApplicationTemplateV1 = {
      id: 'chart:Day',
      contextId: 'communications',
      modeId: 'Day',
      uses: [
        { id: 'ground', role: 'surface', area: 500 },
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `series:${i}`,
          role: `data.series.${i}`,
          area: 50,
        })),
      ],
      pairs: Array.from({ length: 5 }, (_, i) => ({
        id: `pair:${i}`,
        foregroundUseId: `series:${i}`,
        backgroundUseId: 'ground',
        contrast: { minimum: 3, assessment: 'required' },
      })),
    };
    const requirements: ColorSystemApplicationRequirementsV1 = {
      schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
      templates: [template],
      distinctions: [
        {
          id: 'five-series',
          applicationId: template.id,
          kind: 'categorical-series',
          useIds: template.uses.slice(1).map(use => use.id),
          groundUseId: 'ground',
          minimumDeltaEOK: 0.0001,
          expectedCount: 5,
        },
      ],
    };
    const ids = ['paper', 'ink', 'blue', 'blue-deep', 'warm-deep', 'warm'];
    const application: Mutable<ColorSystemContextApplicationV1> = {
      ...JSON.parse(JSON.stringify(template)),
      uses: template.uses.map((use, i) => ({ ...use, colorId: ids[i] })),
    };
    const compiled = compileColorSystemApplicationRequirementsV1(model, requirements);
    const complete = compiled.evaluate([application]);
    expect(complete.eligible).toBe(true);
    expect(complete.distinctions[0]).toMatchObject({
      expectedCount: 5,
      observedCount: 5,
      pass: true,
    });
    expect(complete.distinctions[0].basis).toContain('not WCAG');
    application.uses.pop();
    application.pairs.pop();
    const incomplete = compiled.evaluate([application]);
    expect(incomplete.eligible).toBe(false);
    expect(incomplete.distinctions[0]).toMatchObject({
      expectedCount: 5,
      observedCount: 4,
      pass: false,
    });
  });

  it('requires every declared mode/application and rejects unrequested applications', () => {
    const { model, requirements, application } = fixture();
    requirements.templates.push({ ...productTemplate(), id: 'controls:Night', modeId: 'Night' });
    const result = compileColorSystemApplicationRequirementsV1(model, requirements).evaluate([
      application,
    ]);
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ id: 'controls:Night', code: 'MISSING_APPLICATION' })
    );
    const extra = { ...application, id: 'unexpected' };
    expect(
      compileColorSystemApplicationRequirementsV1(model, requirements)
        .evaluate([application, extra])
        .blockers.some(blocker => blocker.code === 'UNREQUESTED_APPLICATION')
    ).toBe(true);
  });

  it('binds exact painted area and role semantics instead of changing them to pass prominence', () => {
    const { model, requirements, application } = fixture();
    application.uses[0].area = 0.1;
    application.uses[1].role = 'cosmetic-accent';
    const result = compileColorSystemApplicationRequirementsV1(model, requirements).evaluate([
      application,
    ]);
    expect(result.eligible).toBe(false);
    expect(result.blockers.some(blocker => blocker.code === 'INCOMPLETE_APPLICATION')).toBe(true);
  });

  it('retains a locked source default even when a different complete state set also passes contrast', () => {
    const { model, requirements, application } = fixture();
    requirements.locks = [{ applicationId: application.id, useId: 'rest', colorId: 'blue' }];
    const compiled = compileColorSystemApplicationRequirementsV1(model, requirements);
    expect(compiled.evaluate([application]).eligible).toBe(true);
    application.uses.find(use => use.id === 'rest')!.colorId = 'ink';
    application.uses.find(use => use.id === 'pressed')!.colorId = 'warm-deep';
    const result = compiled.evaluate([application]);
    expect(result.applications[0].eligible).toBe(true);
    expect(result.distinctions[0].pass).toBe(true);
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ id: 'controls:Day:rest', code: 'COLOR_LOCK_CHANGED' })
    );
    requirements.locks = [
      ...requirements.locks,
      { applicationId: application.id, useId: 'rest', colorId: 'ink' },
    ];
    expect(() => buildColorSystemApplicationRequirementsV1(requirements)).toThrow(
      /one exact color lock/
    );
  });

  it('keeps compiled requirements and source independent of caller mutation and replays exactly', () => {
    const { model, requirements, application } = fixture();
    const compiled = compileColorSystemApplicationRequirementsV1(model, requirements);
    const expected = compiled.evaluate([application]);
    requirements.templates[0].uses[0].area = 1;
    (model as Mutable<typeof model>).colors[0].valuesByMode.Day.components.r = 0;
    expect(compiled.evaluate([application])).toEqual(expected);
    application.uses.find(use => use.id === 'focus')!.colorId = 'ink';
    expect(compiled.evaluate([application]).assessmentHash).not.toBe(expected.assessmentHash);
  });

  it('rejects malformed count/role contracts, undeclared scopes and executable values', () => {
    const { model, requirements } = fixture();
    requirements.distinctions[0].expectedCount = 4;
    expect(() => buildColorSystemApplicationRequirementsV1(requirements)).toThrow(/count/);
    const invalid = fixture().requirements;
    invalid.templates[0].contextId = 'unknown';
    expect(() => compileColorSystemApplicationRequirementsV1(model, invalid)).toThrow(/undeclared/);
    const dangerous = fixture().requirements;
    const getter = vi.fn(() => []);
    Object.defineProperty(dangerous.templates[0], 'uses', { get: getter, enumerable: true });
    expect(() => buildColorSystemApplicationRequirementsV1(dangerous)).toThrow(/accessor/);
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      buildColorSystemApplicationRequirementsV1({ ...fixture().requirements, unexpected: true })
    ).toThrow();
    const sparse = fixture().requirements;
    delete sparse.templates[0];
    expect(() => buildColorSystemApplicationRequirementsV1(sparse)).toThrow();
    const oversized = fixture().requirements;
    oversized.templates = Array.from({ length: 65 }, () => productTemplate());
    expect(() => buildColorSystemApplicationRequirementsV1(oversized)).toThrow(/array bound/);
  });
});
