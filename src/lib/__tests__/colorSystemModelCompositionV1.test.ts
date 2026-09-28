import { describe, expect, it, vi } from 'vitest';
import { buildColorSystemModelV1, buildColorSystemRuleAdoptionsV1 } from '../colorSystemModelV1';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
} from '../colorSystemApplicationRequirementsV1';
import {
  compileColorSystemModelCompositionV1,
  COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
  type ColorSystemModelCompositionRequestV1,
} from '../colorSystemModelCompositionV1';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import { measureColorSystemContextPairV1 } from '../colorSystemRelationshipsV1';

const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
function fixture() {
  const original = syntheticColorSystemModelInputV1();
  const input = {
    ...original,
    rules: [],
    adoptions: [],
    claims: original.claims.map(claim => ({ ...claim, ruleIds: [] })),
  };
  const model = buildColorSystemModelV1(input);
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: ['Day', 'Night'].map(modeId => ({
      id: modeId,
      contextId: 'interface',
      modeId,
      uses: [
        { id: 'ground', role: 'surface', area: 100 },
        { id: 'text', role: 'text', area: 10 },
      ],
      pairs: [
        {
          id: 'text-on-ground',
          foregroundUseId: 'text',
          backgroundUseId: 'ground',
          contrast: { minimum: 4.5, assessment: 'required' },
        },
      ],
    })),
    distinctions: [],
  });
  const assignments = (useId: string, colorId: string) =>
    requirements.templates.map(template => ({ applicationId: template.id, useId, colorId }));
  const request = {
    version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
    modelHash: model.modelHash,
    requirementsHash: hash(requirements),
    maximumNodes: 4096,
    maximumSolutions: 3,
    groups: [
      {
        id: 'grounds',
        options: [{ id: 'source-paper', assignments: assignments('ground', 'paper') }],
      },
      {
        id: 'text',
        options: [
          { id: 'too-light', assignments: assignments('text', 'blue-pale') },
          { id: 'source-ink', assignments: assignments('text', 'ink') },
        ],
      },
    ],
  };
  return {
    original,
    input,
    model,
    requirements,
    request,
    assignments,
    compile: () => compileColorSystemModelCompositionV1(model, requirements, request),
  };
}
const immediate = { isCancelled: () => false, yield: () => Promise.resolve() };

describe('bounded composition of authored actual-use choices', () => {
  it('finds complete two-mode applications without a Primary and retains exact authored colors', async () => {
    const f = fixture();
    const result = await f.compile().compose(immediate);
    expect(result.status).toBe('ready');
    expect(result.qualified).toBe(false);
    if (result.status !== 'ready') throw new Error('Expected ready');
    expect(result.exhausted).toBe(true);
    expect(result.solutions).toHaveLength(1);
    expect(result.solutions[0].choices).toEqual([
      { groupId: 'grounds', optionId: 'source-paper' },
      { groupId: 'text', optionId: 'source-ink' },
    ]);
    expect(result.solutions[0].applications.map(item => item.modeId)).toEqual(['Day', 'Night']);
    expect(result.solutions[0].assessment.eligible).toBe(true);
    expect(result.diagnostics.contrastRejectedNodes).toBe(1);
    expect(result.diagnostics.completeAssignments).toBe(1);
    expect(result.diagnostics.failures).toEqual([]);
    expect(
      result.solutions[0].applications.every(item =>
        item.uses.every(use => ['paper', 'ink'].includes(use.colorId))
      )
    ).toBe(true);
  });

  it('retains the actual first failed pair when contrast pruning leaves no solution', async () => {
    const f = fixture();
    f.request.groups[1].options = [f.request.groups[1].options[0]];
    const result = await f.compile().compose(immediate);
    expect(result.status).toBe('infeasible');
    if (result.status === 'cancelled') throw new Error('Unexpected cancel');
    expect(result.diagnostics).toMatchObject({
      visitedNodes: 2,
      completeAssignments: 0,
      contrastRejectedNodes: 1,
    });
    const ratio = measureColorSystemContextPairV1(
      f.model.colors.find(color => color.id === 'blue-pale')!.valuesByMode.Day,
      f.model.colors.find(color => color.id === 'paper')!.valuesByMode.Day
    );
    expect(result.diagnostics.failures).toEqual([
      {
        id: expect.stringMatching(/^contrast:/),
        code: 'REQUIRED_CONTRAST_FAILED',
        reason:
          'Application Day (context interface, mode Day), pair text-on-ground: ' +
          'foreground use text (color blue-pale) on background use ground (color paper). ' +
          `Measured contrast ${ratio}:1. Required minimum 4.5:1.`,
      },
    ]);
    expect(await f.compile().compose(immediate)).toEqual(result);
  });

  it.each([undefined, 'blue', 'paper'])(
    'reports the actual translucent pair and its supplied underlay (%s)',
    async underlayColorId => {
      const f = fixture();
      const requirements = buildColorSystemApplicationRequirementsV1({
        ...f.requirements,
        templates: f.requirements.templates.map(template => ({
          ...template,
          uses: [
            ...template.uses,
            ...(underlayColorId ? [{ id: 'underlay', role: 'surface', area: 100 }] : []),
          ],
          pairs: template.pairs.map(pair => ({
            ...pair,
            ...(underlayColorId ? { underlayUseId: 'underlay' } : {}),
          })),
        })),
      });
      const result = await compileColorSystemModelCompositionV1(f.model, requirements, {
        ...f.request,
        requirementsHash: hash(requirements),
        groups: [
          {
            id: 'translucent-pair',
            options: [
              {
                id: 'same-colors',
                assignments: [
                  ...f.assignments('ground', 'blue'),
                  ...f.assignments('text', 'blue'),
                  ...(underlayColorId ? f.assignments('underlay', underlayColorId) : []),
                ],
              },
            ],
          },
        ],
      }).compose(immediate);
      expect(result.status).toBe('infeasible');
      if (result.status === 'cancelled') throw new Error('Unexpected cancel');
      expect(result.diagnostics.failures).toHaveLength(1);
      const failure = result.diagnostics.failures[0];
      expect(failure.code).toBe('REQUIRED_CONTRAST_FAILED');
      expect(failure.reason).toContain(
        'foreground use text (color blue) on background use ground (color blue)'
      );
      expect(failure.reason).toContain('Required minimum 4.5:1.');
      if (underlayColorId)
        expect(failure.reason).toContain(`underlay use underlay (color ${underlayColorId})`);
      if (underlayColorId === 'paper') expect(failure.reason).toContain('Measured contrast ');
      else {
        expect(failure.reason).toContain(
          'Contrast could not be measured: the background is translucent'
        );
        expect(failure.reason).toContain(
          underlayColorId ? 'supplied underlay is not opaque' : 'no opaque underlay was supplied'
        );
      }
    }
  );

  it.each([2, 10])(
    'deduplicates rejected assignments and caps examples from %i distinct colors',
    async count => {
      const f = fixture();
      const colors = Array.from({ length: count }, (_, index) => ({
        ...f.input.colors.find(color => color.id === 'blue-pale')!,
        id: `low-contrast-${index}`,
      }));
      const model = buildColorSystemModelV1({ ...f.input, colors: [...f.input.colors, ...colors] });
      const result = await compileColorSystemModelCompositionV1(model, f.requirements, {
        ...f.request,
        modelHash: model.modelHash,
        groups: [
          f.request.groups[0],
          {
            id: 'text',
            options: colors.flatMap(color =>
              ['a', 'b'].map(suffix => ({
                id: `${color.id}-${suffix}`,
                assignments: f.assignments('text', color.id),
              }))
            ),
          },
        ],
      }).compose(immediate);
      expect(result.status).toBe('infeasible');
      if (result.status === 'cancelled') throw new Error('Unexpected cancel');
      expect(result.diagnostics.contrastRejectedNodes).toBe(count * 2);
      expect(result.diagnostics.failures).toHaveLength(Math.min(count, 8));
      expect(new Set(result.diagnostics.failures.map(item => item.id)).size).toBe(
        Math.min(count, 8)
      );
      result.diagnostics.failures.forEach((failure, index) => {
        expect(failure.reason).toContain(`foreground use text (color low-contrast-${index})`);
      });
    }
  );

  it('keeps explicit paired options together rather than independently remixing their roles', async () => {
    const f = fixture();
    f.request.groups = [
      {
        id: 'authored-pair',
        options: [
          {
            id: 'positive',
            assignments: [...f.assignments('ground', 'paper'), ...f.assignments('text', 'ink')],
          },
          {
            id: 'negative',
            assignments: [...f.assignments('ground', 'ink'), ...f.assignments('text', 'paper')],
          },
        ],
      },
    ];
    const result = await f.compile().compose(immediate);
    expect(result.status).toBe('ready');
    expect(result.solutions.map(item => item.choices[0].optionId)).toEqual([
      'positive',
      'negative',
    ]);
  });

  it('uses full source rules after contrast pruning and retains why complete applications fail', async () => {
    const f = fixture();
    const rule = {
      ...f.original.rules[6],
      kind: 'role-binding' as const,
      operands: { role: 'text', members: [{ kind: 'color' as const, id: 'warm' }] },
    };
    const content = { ...f.input, rules: [rule] };
    const pending = buildColorSystemModelV1(content);
    const model = buildColorSystemModelV1({
      ...content,
      adoptions: buildColorSystemRuleAdoptionsV1(pending, [
        {
          ruleId: rule.id,
          status: 'accepted',
          actor: { kind: 'agent', ref: 'reviewer' },
          authorityRef: 'brief',
          decisionRef: 'rule-review',
        },
      ]),
    });
    const result = await compileColorSystemModelCompositionV1(model, f.requirements, {
      ...f.request,
      modelHash: model.modelHash,
    }).compose(immediate);
    expect(result.status).toBe('infeasible');
    if (result.status === 'cancelled') throw new Error('Unexpected cancel');
    expect(result.diagnostics.requirementsRejectedAssignments).toBe(1);
    expect(result.diagnostics.failures).toContainEqual(
      expect.objectContaining({ code: 'APPLICATION_POLICY_BLOCKED' })
    );
    expect(result.diagnostics.failures).toContainEqual(
      expect.objectContaining({ code: 'REQUIRED_CONTRAST_FAILED' })
    );
  });

  it.each([1, 5])(
    'preserves all %i pending source-rule identities within the existing failure cap',
    async count => {
      const f = fixture();
      const rules = Array.from({ length: count }, (_, index) => ({
        ...f.original.rules[6],
        id: `rule:pending-${index}`,
      }));
      const model = buildColorSystemModelV1({ ...f.input, rules });
      const result = await compileColorSystemModelCompositionV1(model, f.requirements, {
        ...f.request,
        modelHash: model.modelHash,
      }).compose(immediate);
      expect(result.status).toBe('infeasible');
      if (result.status === 'cancelled') throw new Error('Unexpected cancel');
      expect(result.diagnostics.pendingRuleIds).toEqual(rules.map(rule => rule.id));
      expect(result.diagnostics.failures).toHaveLength(Math.min(count * 2 + 1, 8));
      expect(result.diagnostics.failures[0].code).toBe('APPLICATION_POLICY_BLOCKED');
      if (count === 1)
        expect(result.diagnostics.failures[result.diagnostics.failures.length - 1].code).toBe(
          'REQUIRED_CONTRAST_FAILED'
        );
    }
  );

  it('reports search exhaustion honestly when an unvisited valid choice still exists', async () => {
    const f = fixture();
    f.request.maximumNodes = 2;
    const result = await f.compile().compose(immediate);
    expect(result.status).toBe('search-limited');
    if (result.status === 'cancelled') throw new Error('Unexpected cancel');
    expect(result.exhausted).toBe(false);
    expect(result.stopped).toBe('search-limit');
    expect(result.solutions).toEqual([]);
    expect(result.diagnostics.visitedNodes).toBe(2);
    expect(result.diagnostics.failures).toContainEqual(
      expect.objectContaining({ code: 'REQUIRED_CONTRAST_FAILED' })
    );
  });

  it('discards recorded failure examples when cancellation follows contrast rejection', async () => {
    const f = fixture();
    f.request.groups[1].options = Array.from({ length: 33 }, (_, index) => ({
      ...f.request.groups[1].options[0],
      id: `duplicate-failed-pair-${index}`,
    }));
    let yields = 0;
    const result = await f.compile().compose({
      isCancelled: () => yields >= 2,
      yield: async () => {
        yields++;
      },
    });
    expect(yields).toBe(2);
    expect(result).toMatchObject({ status: 'cancelled', solutions: [] });
    expect(result).not.toHaveProperty('diagnostics');
    expect(result).not.toHaveProperty('resultHash');
  });

  it('does not infer a missing source mode value and keeps incomplete distinct from infeasible', async () => {
    const f = fixture();
    const content = {
      ...f.input,
      colors: f.input.colors.map(color =>
        color.id === 'ink' ? { ...color, valuesByMode: { Day: color.valuesByMode.Day } } : color
      ),
    };
    const model = buildColorSystemModelV1(content);
    const result = await compileColorSystemModelCompositionV1(model, f.requirements, {
      ...f.request,
      modelHash: model.modelHash,
    }).compose(immediate);
    expect(result.status).toBe('incomplete');
    if (result.status === 'cancelled') throw new Error('Unexpected cancel');
    expect(result.exhausted).toBe(false);
    expect(result.diagnostics.unavailableOptions).toContainEqual(
      expect.objectContaining({ colorId: 'ink', modeId: 'Night', code: 'MISSING_SOURCE_VALUE' })
    );
  });

  it('honors exact locks without replacing them with a more convenient passing option', async () => {
    const f = fixture();
    const requirements = buildColorSystemApplicationRequirementsV1({
      ...f.requirements,
      locks: [{ applicationId: 'Day', useId: 'text', colorId: 'blue-pale' }],
    });
    const result = await compileColorSystemModelCompositionV1(f.model, requirements, {
      ...f.request,
      requirementsHash: hash(requirements),
    }).compose(immediate);
    expect(result.status).toBe('infeasible');
    if (result.status === 'cancelled') throw new Error('Unexpected cancel');
    expect(
      result.diagnostics.unavailableOptions.some(item => item.code === 'COLOR_LOCK_CHANGED')
    ).toBe(true);
  });

  it('short-circuits an empty required group before a search budget can hide the known cause', async () => {
    const f = fixture();
    const model = buildColorSystemModelV1({
      ...f.input,
      colors: f.input.colors.map(color =>
        color.id === 'ink' ? { ...color, valuesByMode: { Day: color.valuesByMode.Day } } : color
      ),
    });
    f.request.groups[1].options = [f.request.groups[1].options[1]];
    f.request.groups[0].options.push({ ...f.request.groups[0].options[0], id: 'second-ground' });
    const result = await compileColorSystemModelCompositionV1(model, f.requirements, {
      ...f.request,
      modelHash: model.modelHash,
      maximumNodes: 1,
    }).compose(immediate);
    expect(result.status).toBe('incomplete');
    if (result.status === 'cancelled') throw new Error('Unexpected cancel');
    expect(result.diagnostics.visitedNodes).toBe(0);
    const requirements = buildColorSystemApplicationRequirementsV1({
      ...f.requirements,
      locks: [{ applicationId: 'Day', useId: 'text', colorId: 'blue-pale' }],
    });
    const locked = await compileColorSystemModelCompositionV1(model, requirements, {
      ...f.request,
      modelHash: model.modelHash,
      requirementsHash: hash(requirements),
      maximumNodes: 1,
    }).compose(immediate);
    expect(locked.status).toBe('infeasible');
    if (locked.status === 'cancelled') throw new Error('Unexpected cancel');
    expect(locked.exhausted).toBe(true);
    expect(locked.diagnostics.visitedNodes).toBe(0);
  });

  it('cancels before work and during bounded search without returning partial solutions', async () => {
    const f = fixture();
    const plan = f.compile();
    let cancelled = false;
    const runtime = {
      isCancelled: () => cancelled,
      yield: async () => {
        cancelled = true;
      },
    };
    expect(await plan.compose(runtime)).toMatchObject({ status: 'cancelled', solutions: [] });
    const yieldFn = vi.fn(async () => {});
    expect(await plan.compose({ isCancelled: () => true, yield: yieldFn })).toMatchObject({
      status: 'cancelled',
      solutions: [],
    });
    expect(yieldFn).not.toHaveBeenCalled();
    expect((await plan.compose(immediate)).status).toBe('ready');
  });

  it('isolates compiled requests and returned applications/diagnostics across replay', async () => {
    const f = fixture();
    const plan = f.compile();
    const first = await plan.compose(immediate);
    const expected = JSON.stringify(first);
    f.request.groups[1].options[1].assignments[0].colorId = 'warm-pale';
    Object.assign(plan.request.groups[0].options[0].assignments[0], { colorId: 'ink' });
    if (first.status !== 'ready') throw new Error('Expected ready');
    Object.assign(first.solutions[0].applications[0].pairs[0].contrast!, { minimum: 1 });
    first.diagnostics.unavailableOptions.push({
      groupId: 'fake',
      optionId: 'fake',
      applicationId: 'Day',
      useId: 'text',
      colorId: 'ink',
      modeId: 'Day',
      code: 'MISSING_SOURCE_VALUE',
    });
    expect(JSON.stringify(await plan.compose(immediate))).toBe(expected);
  });

  it('yields before every full application assessment and cancels a later leaf without partial output', async () => {
    const f = fixture();
    f.request.groups = [
      {
        id: 'pair',
        options: [
          {
            id: 'positive',
            assignments: [...f.assignments('ground', 'paper'), ...f.assignments('text', 'ink')],
          },
          {
            id: 'negative',
            assignments: [...f.assignments('ground', 'ink'), ...f.assignments('text', 'paper')],
          },
        ],
      },
    ];
    let yields = 0;
    const result = await f.compile().compose({
      isCancelled: () => yields >= 3,
      yield: async () => {
        yields++;
      },
    });
    expect(yields).toBe(3);
    expect(result).toMatchObject({ status: 'cancelled', solutions: [] });
    const complete = await f.compile().compose(immediate);
    expect(complete.solutions).toHaveLength(2);
  });

  it('rejects changed targets, overlap, missing roles and stale identities before search', () => {
    const f = fixture();
    const invalid = (patch: Partial<ColorSystemModelCompositionRequestV1>) =>
      compileColorSystemModelCompositionV1(f.model, f.requirements, { ...f.request, ...patch });
    expect(() => invalid({ modelHash: hash('stale') })).toThrow(/stale/);
    expect(() => invalid({ requirementsHash: hash('stale') })).toThrow(/stale/);
    expect(() => invalid({ groups: [f.request.groups[0]] })).toThrow(/every requested/);
    expect(() =>
      invalid({ groups: [...f.request.groups, { ...f.request.groups[0], id: 'duplicate' }] })
    ).toThrow(/overlap/);
    const changed = structuredClone(f.request.groups);
    changed[1].options[0].assignments.pop();
    expect(() => invalid({ groups: changed })).toThrow(/same nonempty/);
    expect(() => invalid({ maximumNodes: 4097 })).toThrow(/bound/);
    expect(() => invalid({ maximumSolutions: 4 })).toThrow(/bound/);
  });

  it('rejects unknown/accessor fields before execution hooks and never consumes payload colors', () => {
    const f = fixture();
    const getter = vi.fn(() => f.request.groups);
    const malicious = { ...f.request };
    Object.defineProperty(malicious, 'groups', { enumerable: true, get: getter });
    expect(() => compileColorSystemModelCompositionV1(f.model, f.requirements, malicious)).toThrow(
      /accessor/
    );
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      compileColorSystemModelCompositionV1(f.model, f.requirements, { ...f.request, colors: [] })
    ).toThrow(/unknown/);
  });
});
