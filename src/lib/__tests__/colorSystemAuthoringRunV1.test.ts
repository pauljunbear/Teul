import { describe, expect, it, vi } from 'vitest';
import {
  executeColorSystemAuthoringRunV1,
  COLOR_SYSTEM_AUTHORING_RUN_V1_VERSION,
  type ColorSystemAuthoringRunRequestV1,
} from '../colorSystemAuthoringRunV1';
import { COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION } from '../colorSystemAuthoringExecutionV1';
import { buildColorSystemModelV1 } from '../colorSystemModelV1';
import {
  COLOR_SYSTEM_PROPOSAL_V1_VERSION,
  type ColorSystemProposalRequestV1,
} from '../colorSystemProposalV1';
import {
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
  buildColorSystemApplicationRequirementsV1,
} from '../colorSystemApplicationRequirementsV1';
import { COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION } from '../colorSystemModelCompositionV1';
import { compileColorSystemAuthoredCandidatesV1 } from '../colorSystemAuthoredCandidatesV1';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[Key] extends object
      ? Mutable<T[Key]>
      : T[Key];
};
const copy = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>;
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const execution = { isCancelled: () => false, yield: async () => {} };
function fixture(count = 2) {
  const input = syntheticColorSystemModelInputV1();
  const source = buildColorSystemModelV1({
    ...input,
    rules: [],
    adoptions: [],
    claims: input.claims.map(claim => ({ ...claim, ruleIds: [] })),
  });
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: ['Day', 'Night'].map(modeId => ({
      id: modeId,
      contextId: 'interface',
      modeId,
      uses: [
        { id: 'ground', role: 'ground', area: 100 },
        { id: 'mark', role: 'action', area: 10 },
      ],
      pairs: [
        {
          id: 'mark-ground',
          foregroundUseId: 'mark',
          backgroundUseId: 'ground',
          contrast: { minimum: 3, assessment: 'required' },
        },
      ],
    })),
    distinctions: [],
  });
  const brief: ColorSystemProposalRequestV1['brief'] = {
    briefHash: hash('one frozen run brief'),
    operation: 'apply',
    contextIds: ['interface'],
    modeIds: ['Day', 'Night'],
    permissions: {
      addColors: false,
      addFamilies: false,
      addScales: false,
      addRules: false,
      editFamilyIds: [],
      editScaleIds: [],
      replaceRuleIds: [],
    },
  };
  const request = copy<ColorSystemAuthoringRunRequestV1>({
    version: COLOR_SYSTEM_AUTHORING_RUN_V1_VERSION,
    id: 'synthetic-run',
    requirements,
    brief: structuredClone(brief),
    directions: Array.from({ length: count }, (_, index) => ({
      version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
      id: `direction:${index}`,
      generation: {
        kind: 'apply',
        proposal: {
          version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
          id: `source-application:${index}`,
          sourceModelHash: source.modelHash,
          brief,
          derivation: {
            algorithmId: 'source-application',
            algorithmVersion: '1',
            policyHash: hash('apply'),
            inputHash: hash('source'),
            sourceColorIds: [],
            sourceScaleIds: [],
          },
          colors: [],
          families: [],
          scales: [],
          rules: [],
          exceptions: [],
        },
      },
      composition: {
        version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
        modelHash: source.modelHash,
        requirementsHash: hash(requirements),
        maximumNodes: 4096,
        maximumSolutions: 3,
        groups: [
          {
            id: 'complete-options',
            options: ['ink', 'blue-deep', 'warm-deep'].map(colorId => ({
              id: colorId,
              assignments: requirements.templates.flatMap(template =>
                template.uses.map(use => ({
                  applicationId: template.id,
                  useId: use.id,
                  colorId: use.id === 'ground' ? 'paper' : colorId,
                }))
              ),
            })),
          },
        ],
      },
      units: [],
    })),
  });
  return { source, request };
}

describe('bounded authored runs with final shared ranking', () => {
  it('replays eight directions/24 complete solutions and displays only three genuinely distinct paints', async () => {
    const f = fixture(8);
    const result = await executeColorSystemAuthoringRunV1(f.source, f.request, execution);
    expect(result.status).toBe('ready');
    expect(result.qualified).toBe(false);
    expect(result.executions).toHaveLength(8);
    expect(result.ranking!.assessments).toHaveLength(24);
    expect(result.directions).toHaveLength(3);
    expect(
      new Set(
        result.directions.map(
          direction =>
            direction.applications.applications[0].application.uses.find(use => use.id === 'mark')!
              .colorId
        )
      ).size
    ).toBe(3);
    const actual = result.executions.flatMap(item =>
      item.assessments.map(assessment => ({
        id: assessment.id,
        proposal: assessment.proposal.request,
        units: assessment.units,
        applications: assessment.applications.applications.map(item => item.application),
      }))
    );
    expect(result.ranking).toEqual(
      compileColorSystemAuthoredCandidatesV1(f.source, f.request.requirements).rank(actual)
    );
    expect(result.receipt.requestHash).toBe(hash(f.request));
    expect(result.receipt.executionReceiptHashes).toEqual(
      result.executions.map(item => item.receipt.receiptHash)
    );
    expect(result.receipt.rankingHash).toBe(hash(result.ranking));
    const { receiptHash, ...receipt } = result.receipt;
    expect(receiptHash).toBe(hash(receipt));
  });

  it('preserves exact child failure states and does not display a failed execution', async () => {
    const f = fixture();
    f.request.directions[0].composition.groups[0].options = [
      {
        id: 'failed-pair',
        assignments: f.request.directions[0].composition.groups[0].options[0].assignments.map(
          item => ({ ...item, colorId: 'paper' })
        ),
      },
    ];
    const result = await executeColorSystemAuthoringRunV1(f.source, f.request, execution);
    expect(result.status).toBe('ready');
    expect(result.executions[0].status).toBe('infeasible');
    expect(result.executions[0].candidates).toEqual([]);
    expect(result.directions).toHaveLength(3);
    f.request.directions = [f.request.directions[0]];
    const blocked = await executeColorSystemAuthoringRunV1(f.source, f.request, execution);
    expect(blocked.status).toBe('blocked');
    expect(blocked.executions[0].status).toBe('infeasible');
    expect(blocked.directions).toEqual([]);
  });

  it('rejects changed source, scope and permissions before any supplied hook', async () => {
    const f = fixture();
    const hook = { isCancelled: vi.fn(() => false), yield: vi.fn(async () => {}) };
    for (const field of ['source', 'scope', 'permissions'] as const) {
      const request = copy(f.request);
      const generation = request.directions[1].generation;
      if (generation.kind !== 'apply') throw new Error('Unexpected fixture');
      if (field === 'source') generation.proposal.sourceModelHash = hash('stale');
      if (field === 'scope') generation.proposal.brief.modeIds = ['Day'];
      if (field === 'permissions') generation.proposal.brief.permissions.addColors = true;
      await expect(executeColorSystemAuthoringRunV1(f.source, request, hook)).rejects.toThrow(
        /source model|common brief/
      );
    }
    const nestedRequirements = {
      ...f.request,
      directions: f.request.directions.map(direction => ({
        ...direction,
        requirements: f.request.requirements,
      })),
    };
    await expect(
      executeColorSystemAuthoringRunV1(f.source, nestedRequirements, hook)
    ).rejects.toThrow('unknown fields');
    expect(hook.isCancelled).not.toHaveBeenCalled();
    expect(hook.yield).not.toHaveBeenCalled();
  });

  it('rejects stale composition requirements and injected scores without trusting caller results', async () => {
    const f = fixture();
    f.request.directions[1].composition.requirementsHash = hash('weakened requirements');
    await expect(executeColorSystemAuthoringRunV1(f.source, f.request, execution)).rejects.toThrow(
      'stale model/requirements'
    );
    const clean = fixture();
    await expect(
      executeColorSystemAuthoringRunV1(
        clean.source,
        { ...clean.request, ranking: { score: 100 } },
        execution
      )
    ).rejects.toThrow('unknown fields');
    await expect(
      executeColorSystemAuthoringRunV1(
        clean.source,
        { ...clean.request, directions: [{ ...clean.request.directions[0], score: 100 }] },
        execution
      )
    ).rejects.toThrow('unknown fields');
  });

  it('rejects empty, oversized and duplicate direction sets', async () => {
    const f = fixture();
    for (const directions of [
      [],
      Array.from({ length: 9 }, () => f.request.directions[0]),
      [f.request.directions[0], f.request.directions[0]],
    ]) {
      await expect(
        executeColorSystemAuthoringRunV1(f.source, { ...f.request, directions }, execution)
      ).rejects.toThrow(/eight directions|unique/);
    }
  });

  it('detaches the full run before hooks, including later directions and common requirements', async () => {
    const f = fixture();
    const expected = await executeColorSystemAuthoringRunV1(f.source, f.request, execution);
    const incoming = copy(f.request);
    const result = await executeColorSystemAuthoringRunV1(f.source, incoming, {
      ...execution,
      yield: async () => {
        incoming.directions[1].composition.groups = [];
        Object.assign(incoming.requirements.templates[0].pairs[0].contrast!, { minimum: 1 });
        incoming.brief.permissions.addColors = true;
      },
    });
    expect(result).toEqual(expected);
    Object.assign(
      result.directions[0].proposal.workingModel.colors[0].valuesByMode.Day.components,
      { r: 0 }
    );
    expect(await executeColorSystemAuthoringRunV1(f.source, f.request, execution)).toEqual(
      expected
    );
    const getter = vi.fn(() => 'ink'),
      yieldHook = vi.fn(async () => {});
    Object.defineProperty(
      incoming.directions[0].composition.groups[0].options[0].assignments[0],
      'colorId',
      { enumerable: true, get: getter }
    );
    await expect(
      executeColorSystemAuthoringRunV1(f.source, incoming, { ...execution, yield: yieldHook })
    ).rejects.toThrow('accessors');
    expect(getter).not.toHaveBeenCalled();
    expect(yieldHook).not.toHaveBeenCalled();
  });

  it('returns no partial run on cancellation during replay or final ranking', async () => {
    const f = fixture();
    let totalYields = 0;
    await executeColorSystemAuthoringRunV1(f.source, f.request, {
      ...execution,
      yield: async () => {
        totalYields++;
      },
    });
    for (const stopAt of [0, 2, totalYields - 1]) {
      let yields = 0;
      const result = await executeColorSystemAuthoringRunV1(f.source, f.request, {
        isCancelled: () => yields >= stopAt,
        yield: async () => {
          yields++;
        },
      });
      expect(result).toMatchObject({
        status: 'cancelled',
        executions: [],
        ranking: null,
        directions: [],
        qualified: false,
      });
    }
  });

  it('keeps stable displayed ordering under a nonsemantic direction-order change', async () => {
    const f = fixture();
    const first = await executeColorSystemAuthoringRunV1(f.source, f.request, execution);
    f.request.directions.reverse();
    const reordered = await executeColorSystemAuthoringRunV1(f.source, f.request, execution);
    expect(reordered.directions).toEqual(first.directions);
    expect(reordered.receipt.requestHash).not.toBe(first.receipt.requestHash);
  });
});
