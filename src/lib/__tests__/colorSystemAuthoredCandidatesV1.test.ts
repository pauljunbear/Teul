import { describe, expect, it, vi } from 'vitest';
import {
  compileColorSystemAuthoredCandidatesV1,
  type ColorSystemGeneratedUnitV1,
} from '../colorSystemAuthoredCandidatesV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../colorSystemModelV1';
import {
  buildColorSystemBrandConstraintsV1,
  hashColorSystemBrandTerritoryRuleV1,
  type ColorSystemBrandTerritoryRuleV1,
} from '../colorSystemBrandConstraintsV1';
import {
  buildColorSystemProposalV1,
  COLOR_SYSTEM_PROPOSAL_V1_VERSION,
  type ColorSystemProposalRequestV1,
} from '../colorSystemProposalV1';
import { COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA } from '../colorSystemApplicationRequirementsV1';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import { deterministicContentHash } from '../colorSystemHashing';

const hash = (value: unknown) => deterministicContentHash(value);
const paint = (r: number, g: number, b: number, alpha = 1) =>
  buildColorSystemSrgbValueV1({ r, g, b }, alpha);
function sourceInput(): ColorSystemModelInputV1 {
  const input = syntheticColorSystemModelInputV1();
  return {
    ...input,
    rules: [],
    adoptions: [],
    claims: input.claims.map(claim => ({ ...claim, ruleIds: [] })),
  };
}
function fixture(source = buildColorSystemModelV1(sourceInput())) {
  const template = {
    id: 'card',
    contextId: 'interface',
    modeId: 'Day',
    uses: [
      { id: 'ground', role: 'ground', area: 100 },
      { id: 'mark', role: 'action', area: 20 },
    ],
    pairs: [
      {
        id: 'mark-on-ground',
        foregroundUseId: 'mark',
        backgroundUseId: 'ground',
        contrast: { minimum: 3, assessment: 'required' as const },
      },
    ],
  };
  const requirements = {
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: [template],
    distinctions: [],
  };
  const request: ColorSystemProposalRequestV1 = {
    version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
    id: 'candidate',
    sourceModelHash: source.modelHash,
    brief: {
      briefHash: hash('one common brief'),
      operation: 'extend',
      contextIds: ['interface'],
      modeIds: ['Day'],
      permissions: {
        addColors: true,
        addFamilies: true,
        addScales: true,
        addRules: true,
        editFamilyIds: ['pigments'],
        editScaleIds: ['blue-scale'],
        replaceRuleIds: [],
      },
    },
    derivation: {
      algorithmId: 'declared-test',
      algorithmVersion: '1',
      policyHash: hash('policy'),
      inputHash: hash('input'),
      sourceColorIds: ['blue'],
      sourceScaleIds: [],
    },
    colors: [],
    families: [],
    scales: [],
    rules: [],
    exceptions: [],
  };
  const candidate = (
    id = 'first',
    colorId = 'ink',
    proposal = request,
    units: ColorSystemGeneratedUnitV1[] = []
  ) => ({
    id,
    proposal: structuredClone(proposal) as {
      -readonly [K in keyof ColorSystemProposalRequestV1]: ColorSystemProposalRequestV1[K];
    },
    units,
    applications: [
      {
        ...structuredClone(template),
        uses: template.uses.map(use => ({
          ...use,
          colorId: use.id === 'ground' ? 'paper' : colorId,
        })),
      },
    ],
  });
  return {
    source,
    requirements,
    request,
    candidate,
    compiled: compileColorSystemAuthoredCandidatesV1(source, requirements),
  };
}
function extension(f: ReturnType<typeof fixture>, value = paint(0.1, 0.2, 0.5)) {
  const proposal = {
    ...f.request,
    colors: [{ id: 'new', label: 'New', valuesByMode: { Day: value } }],
    families: [{ id: 'new-family', label: 'Proposed family', colorIds: ['new'] }],
  };
  const unit: ColorSystemGeneratedUnitV1 = {
    id: 'unit',
    contextId: 'interface',
    familyId: 'new-family',
    prominence: 'supporting',
    jobs: ['product-semantics'],
    anchors: [{ modeId: 'Day', colorId: 'new' }],
  };
  return f.candidate('extension', 'new', proposal, [unit]);
}
function withTerritory(effect: 'restrict-to' | 'exclude', reviewed = true) {
  const input = sourceInput();
  const rule: ColorSystemBrandTerritoryRuleV1 = {
    id: 'territory',
    label: 'Explicit synthetic territory',
    kind: 'brand-territory',
    scope: { kind: 'generated-families', prominence: ['supporting'], jobs: 'all', modes: 'all' },
    bounds: {
      hueRanges: [{ minimum: 200, maximum: 300 }],
      chroma: { minimum: 0.01, maximum: 0.5 },
      lightness: { minimum: 0, maximum: 0.7 },
    },
    effect,
    ...(effect === 'restrict-to' ? { allowedJobs: ['product-semantics'] as const } : {}),
    origin: 'owner-authored',
    evidenceRefs: ['evidence:rules'],
  } as ColorSystemBrandTerritoryRuleV1;
  const fragment = buildColorSystemBrandConstraintsV1({
    schemaVersion: 'teul.brand-constraints.v1',
    sourceSnapshotHash: input.sources[0].sourceHash,
    rules: [rule],
    decisions: reviewed
      ? [
          {
            ruleId: rule.id,
            ruleHash: hashColorSystemBrandTerritoryRuleV1(rule),
            status: 'accepted',
            actor: { kind: 'agent', ref: 'test-reviewer' },
            authorityRef: 'test-brief',
          },
        ]
      : [],
  });
  return buildColorSystemModelV1({
    ...input,
    brandConstraintsByContext: [
      {
        id: 'scoped-territory',
        contextIds: ['interface'],
        sourceId: input.sources[0].id,
        fragment,
      },
    ],
  });
}

describe('complete authored candidate assessment and ranking', () => {
  it('keeps async rank exactly equal to sync rank for complete, blocked, duplicate and translucent paints', async () => {
    const f = fixture();
    const candidates = [
      extension(f, paint(0.1, 0.2, 0.5)),
      extension(f, paint(0.45, 0.05, 0.05)),
      extension(f, paint(0.05, 0.35, 0.1)),
      extension(f, paint(0.1001, 0.2001, 0.5001)),
      extension(f, paint(0.2, 0.05, 0.35, 0.8)),
      f.candidate('invalid', 'warm-pale'),
    ].map((candidate, index) => ({ ...candidate, id: `candidate:${index}` }));
    const yieldHook = vi.fn(async () => {});
    expect(
      await f.compiled.rankAsync(candidates, { isCancelled: () => false, yield: yieldHook })
    ).toEqual(f.compiled.rank(candidates));
    expect(yieldHook.mock.calls.length).toBeGreaterThan(candidates.length);
    expect(
      await f.compiled.rankAsync([], { isCancelled: () => false, yield: async () => {} })
    ).toEqual(f.compiled.rank([]));
  });

  it('cancels async rank after assessment and before diversity work without partial output', async () => {
    const f = fixture();
    const candidates = [f.candidate('a'), f.candidate('b', 'blue-deep')];
    for (const stopAt of [0, 1, 2, 3]) {
      let yields = 0;
      const result = await f.compiled.rankAsync(candidates, {
        isCancelled: () => yields >= stopAt,
        yield: async () => {
          yields++;
        },
      });
      expect(result).toMatchObject({
        status: 'cancelled',
        directions: [],
        assessments: [],
        qualified: false,
      });
    }
  });

  it('snapshots all async rank inputs before hooks and rejects accessors without invoking them', async () => {
    const f = fixture();
    const candidates = [f.candidate('a'), f.candidate('b', 'blue-deep')];
    const expected = f.compiled.rank(candidates);
    const result = await f.compiled.rankAsync(candidates, {
      isCancelled: () => false,
      yield: async () => {
        candidates[1].applications[0].uses[1].colorId = 'warm-pale';
      },
    });
    expect(result).toEqual(expected);
    const getter = vi.fn(() => 'ink'),
      yieldHook = vi.fn(async () => {});
    Object.defineProperty(candidates[0].applications[0].uses[0], 'colorId', {
      enumerable: true,
      get: getter,
    });
    await expect(
      f.compiled.rankAsync(candidates, { isCancelled: () => false, yield: yieldHook })
    ).rejects.toThrow('accessors');
    expect(getter).not.toHaveBeenCalled();
    expect(yieldHook).not.toHaveBeenCalled();
  });

  it('applies source values without constructing colors and keeps source evidence separate', () => {
    const f = fixture();
    const candidate = f.candidate();
    candidate.proposal = {
      ...candidate.proposal,
      brief: { ...candidate.proposal.brief, operation: 'apply' },
    };
    const result = f.compiled.rank([candidate]);
    expect(result.status).toBe('ready');
    expect(result.directions[0].qualified).toBe(false);
    expect(result.directions[0].derivationStatus).toBe('declared-not-recomputed');
    expect(result.directions[0].proposal.workingModel).toEqual(f.source);
    expect(result.directions[0].sourceCompliance[0].eligible).toBe(true);
  });

  it('rejects additions under apply and never repairs a failed request by broadening permissions', () => {
    const f = fixture();
    const candidate = extension(f);
    candidate.proposal.brief = { ...candidate.proposal.brief, operation: 'apply' };
    expect(() => f.compiled.assess(candidate)).toThrow(/Apply/);
    candidate.proposal.brief = {
      ...candidate.proposal.brief,
      operation: 'extend',
      permissions: { ...candidate.proposal.brief.permissions, addColors: false },
    };
    expect(() => f.compiled.assess(candidate)).toThrow(/permit/);
  });

  it('filters missing roles, weakened checks and failing contrast before any ranking', () => {
    const f = fixture();
    const missing = f.candidate('a-attractive-incomplete');
    missing.applications[0].uses.pop();
    missing.applications[0].pairs = [];
    const weak = f.candidate('b-weakened', 'warm-pale');
    weak.applications[0].pairs[0].contrast.minimum = 1;
    const failing = f.candidate('c-failing', 'warm-pale');
    const result = f.compiled.rank([missing, weak, failing, f.candidate('z-complete')]);
    expect(result.directions.map(item => item.id)).toEqual(['z-complete']);
    expect(result.assessments.slice(0, 3).every(item => !item.eligible)).toBe(true);
    expect(f.compiled.rank([missing, weak, failing]).status).toBe('infeasible');
  });

  it('does not turn similar colors or repeated names into three directions', () => {
    const f = fixture();
    const first = extension(f, paint(0.1, 0.2, 0.5));
    const near = extension(f, paint(0.1001, 0.2001, 0.5001));
    near.id = 'near';
    const duplicate = extension(f);
    duplicate.id = 'renamed';
    const result = f.compiled.rank([near, duplicate, first]);
    expect(result.assessments.every(item => item.eligible)).toBe(true);
    expect(result.directions).toHaveLength(1);
    expect(result.directions[0].id).toBe('extension');
  });

  it('caps materially different feasible applications at three with stable ordering', () => {
    const f = fixture();
    const candidates = [
      [0.1, 0.2, 0.5],
      [0.45, 0.05, 0.05],
      [0.05, 0.35, 0.1],
      [0.2, 0.05, 0.35],
    ].map((rgb, index) => {
      const candidate = extension(f, paint(rgb[0], rgb[1], rgb[2]));
      candidate.id = `direction-${index}`;
      return candidate;
    });
    const result = f.compiled.rank(candidates.reverse());
    expect(result.assessments.every(item => item.eligible)).toBe(true);
    expect(result.directions.map(item => item.id)).toEqual([
      'direction-0',
      'direction-1',
      'direction-2',
    ]);
    expect(result).toEqual(f.compiled.rank(candidates));
  });

  it('compares translucent alternatives on their actual compositing grounds', () => {
    const f = fixture();
    const first = extension(f, paint(0.05, 0.02, 0.3, 0.85));
    first.id = 'purple';
    const second = extension(f, paint(0, 0.4, 0, 0.85));
    second.id = 'green';
    const result = f.compiled.rank([first, second]);
    expect(result.assessments.every(item => item.eligible)).toBe(true);
    expect(result.directions.map(item => item.id)).toEqual(['green', 'purple']);
    expect(f.compiled.rank([first, { ...first, id: 'same' }]).directions).toHaveLength(1);
  });

  it('requires one common brief and all requested modes before comparison', () => {
    const f = fixture();
    const other = f.candidate('other');
    other.proposal = {
      ...other.proposal,
      brief: { ...other.proposal.brief, briefHash: hash('different brief') },
    };
    expect(() => f.compiled.rank([f.candidate(), other])).toThrow(/same brief/);
    other.proposal = {
      ...other.proposal,
      brief: { ...other.proposal.brief, modeIds: ['Day', 'Night'] },
    };
    expect(() => f.compiled.assess(other)).toThrow(/scope/);
    expect(() =>
      f.compiled.rank(Array.from({ length: 25 }, (_, index) => f.candidate(String(index))))
    ).toThrow(/bound/);
  });

  it('does not let an unscoped proposed color bypass generation territories', () => {
    const f = fixture();
    const candidate = extension(f);
    candidate.units = [];
    const result = f.compiled.assess(candidate);
    expect(result.eligible).toBe(false);
    expect(result.blockers.map(item => item.code)).toContain('UNSCOPED_ADDITION');
    expect(result.blockers.map(item => item.code)).toContain('UNSCOPED_GENERATED_USE');
  });

  it('tests exclusions against every family member, including unused proposed colors', () => {
    const f = fixture(withTerritory('exclude'));
    const candidate = extension(f, paint(0.1, 0.35, 0.1));
    candidate.proposal.colors = [
      ...candidate.proposal.colors,
      { id: 'hidden-blue', label: 'Unpainted blue', valuesByMode: { Day: paint(0.1, 0.2, 0.5) } },
    ];
    candidate.proposal.families = [
      { ...candidate.proposal.families[0], colorIds: ['new', 'hidden-blue'] },
    ];
    const result = f.compiled.assess(candidate);
    expect(result.applications.eligible).toBe(true);
    expect(result.eligible).toBe(false);
    expect(result.territoryChecks[0]).toMatchObject({
      status: 'fail',
      failedColorIds: ['hidden-blue'],
    });
  });

  it('preserves restrict-to anchor semantics and checks all requested jobs', () => {
    const f = fixture(withTerritory('restrict-to'));
    const candidate = extension(f);
    candidate.proposal.colors = [
      ...candidate.proposal.colors,
      { id: 'light', label: 'Light tint', valuesByMode: { Day: paint(0.95, 0.95, 1) } },
    ];
    candidate.proposal.families = [
      { ...candidate.proposal.families[0], colorIds: ['new', 'light'] },
    ];
    expect(f.compiled.assess(candidate).eligible).toBe(true);
    candidate.units = [{ ...candidate.units[0], jobs: ['product-semantics', 'marketing-accent'] }];
    expect(f.compiled.assess(candidate).territoryChecks[0].status).toBe('fail');
  });

  it('retains source colors under an exclusion for generated families and does not infer adoption', () => {
    const f = fixture(withTerritory('exclude'));
    expect(f.compiled.assess(f.candidate('source-blue', 'blue')).eligible).toBe(true);
    const pending = fixture(withTerritory('restrict-to', false));
    expect(pending.compiled.assess(extension(pending)).eligible).toBe(false);
    expect(pending.compiled.assess(extension(pending)).territoryChecks[0].status).toBe(
      'unreviewed'
    );
  });

  it('shows baseline noncompliance separately from an explicitly reviewed membership extension', () => {
    const base = syntheticColorSystemModelInputV1();
    const palette = { ...base.rules[0], contextIds: ['interface'] };
    let source = buildColorSystemModelV1({ ...sourceInput(), rules: [palette] });
    const decision = {
      ruleId: palette.id,
      status: 'accepted' as const,
      actor: { kind: 'agent' as const, ref: 'reviewer' },
      authorityRef: 'brief',
      decisionRef: 'source-review',
    };
    const { modelHash: _modelHash, ...sourceContent } = source;
    source = buildColorSystemModelV1({
      ...sourceContent,
      adoptions: buildColorSystemRuleAdoptionsV1(source, [decision]),
    });
    const f = fixture(source);
    const candidate = extension(f);
    candidate.proposal.families = [
      {
        id: 'pigments',
        label: source.families[0].label,
        colorIds: [...source.families[0].colorIds, 'new'],
      },
    ];
    candidate.units = [{ ...candidate.units[0], familyId: 'pigments' }];
    expect(f.compiled.assess(candidate).eligible).toBe(false);
    const unreviewed = buildColorSystemProposalV1(source, candidate.proposal);
    candidate.proposal.review = {
      reviewedProposalHash: unreviewed.proposalHash,
      decisions: [{ ...decision, decisionRef: 'explicit-proposal-membership-review' }],
    };
    const result = f.compiled.assess(candidate);
    expect(result.eligible).toBe(true);
    expect(result.sourceCompliance[0].eligible).toBe(false);
    expect(source.families[0].colorIds).not.toContain('new');
    expect(result.qualified).toBe(false);
  });

  it('binds each proposed mode and actual application context instead of checking a convenient one', () => {
    const f = fixture();
    const candidate = extension(f);
    candidate.proposal.colors = [
      {
        ...candidate.proposal.colors[0],
        valuesByMode: { Day: paint(0.1, 0.2, 0.5), Night: paint(0.2, 0.3, 0.6) },
      },
    ];
    expect(() => f.compiled.assess(candidate)).toThrow(/requested modes/);
    const valid = extension(f);
    valid.units = [{ ...valid.units[0], contextId: 'communications' }];
    expect(() => f.compiled.assess(valid)).toThrow(/scoped/);
  });

  it('isolates compiled source and requirements and rejects accessors before calling them', () => {
    const f = fixture();
    const candidate = extension(f);
    const first = f.compiled.assess(candidate);
    const expectedHash = first.assessmentHash;
    f.requirements.templates[0].pairs[0].contrast.minimum = 21;
    (f.source.colors as unknown as { id: string }[]).length = 0;
    expect(f.compiled.assess(candidate)).toEqual(first);
    Object.assign(first.proposal.request.colors[0].valuesByMode.Day.components, { r: 0.9 });
    expect(f.compiled.assess(candidate).assessmentHash).toBe(expectedHash);
    const getter = vi.fn(() => []);
    Object.defineProperty(candidate, 'units', { enumerable: true, get: getter });
    expect(() => f.compiled.assess(candidate)).toThrow(/accessor/);
    expect(getter).not.toHaveBeenCalled();
    expect(() => f.compiled.assess({ ...f.candidate(), unexpected: true })).toThrow(/unknown/);
  });
});
