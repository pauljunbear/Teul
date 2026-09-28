import { describe, expect, it, vi } from 'vitest';
import {
  executeColorSystemAuthoringDirectionV1,
  COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
  type ColorSystemAuthoringDirectionV1,
} from '../colorSystemAuthoringExecutionV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../colorSystemModelV1';
import {
  buildColorSystemProposalV1,
  COLOR_SYSTEM_PROPOSAL_V1_VERSION,
  type ColorSystemProposalRequestV1,
} from '../colorSystemProposalV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
  type ColorSystemApplicationRequirementsV1,
} from '../colorSystemApplicationRequirementsV1';
import {
  COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
  type ColorSystemModelCompositionRequestV1,
} from '../colorSystemModelCompositionV1';
import {
  buildColorSystemConstructionProposalV1,
  COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
  type ColorSystemConstructionProposalIntentV1,
} from '../colorSystemConstructionProposalV1';
import {
  COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
  type ColorSystemConstructionBriefV1,
} from '../colorSystemConstructionV1';
import {
  compileColorSystemCatalogProposalV1,
  COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
  type ColorSystemCatalogProposalIntentV1,
  type ColorSystemCatalogProposalRequestV1,
} from '../colorSystemCatalogProposalV1';
import {
  buildColorSystemBrandConstraintsV1,
  hashColorSystemBrandTerritoryRuleV1,
  type ColorSystemBrandTerritoryRuleV1,
} from '../colorSystemBrandConstraintsV1';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import {
  buildColorSystemSrgbValueV1,
  colorSystemExactSrgbValueHashV1,
} from '../colorSystemSrgbValueV1';
import { COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION } from '../colorSystemModelInteractionsV1';
import * as modelInteractions from '../colorSystemModelInteractionsV1';
import * as constructionProposal from '../colorSystemConstructionProposalV1';
import { COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION } from '../colorSystemOverlayProposalV1';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';
import * as ruleReview from '../colorSystemAuthoringRuleReviewV1';
import { executeColorSystemAuthoringRunV1 } from '../colorSystemAuthoringRunV1';
import {
  parseColorSystemRecipeV1,
  replayColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
} from '../colorSystemRecipeV1';
import { buildColorSystemDesignContentV1 } from '../colorSystemDesignContentV1';
import {
  compileColorSystemAuthoredDeliveryV1,
  readColorSystemAuthoredDeliveryV1,
} from '../colorSystemAuthoringDeliveryV1';
import { hashColorSystemGeometryApplicationsV1 } from '../colorSystemApplicationGeometryV1';
import { createColorSystemAuthoringSessionV1 } from '../../backend/colorSystemAuthoringSessionV1';
import { createColorSystemRecipeStorageV1 } from '../../backend/colorSystemRecipeStorageV1';
import { compileColorSystemRelationshipsV1 } from '../colorSystemRelationshipsV1';

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const mutableCopy = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>;
const execution = { isCancelled: () => false, yield: async () => {} };
function sourceInput(): ColorSystemModelInputV1 {
  const original = syntheticColorSystemModelInputV1();
  return {
    ...original,
    rules: [],
    adoptions: [],
    claims: original.claims.map(claim => ({ ...claim, ruleIds: [] })),
  };
}
function requirements(): ColorSystemApplicationRequirementsV1 {
  return buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: ['Day', 'Night'].map(modeId => ({
      id: modeId,
      contextId: 'interface',
      modeId,
      uses: [
        { id: 'ground', role: 'ground', area: 100 },
        { id: 'mark', role: 'action', area: 20 },
      ],
      pairs: [
        {
          id: 'mark-on-ground',
          foregroundUseId: 'mark',
          backgroundUseId: 'ground',
          contrast: { minimum: 3, assessment: 'required' },
        },
      ],
    })),
    distinctions: [],
  });
}
function proposal(modelHash: string): ColorSystemProposalRequestV1 {
  return {
    version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
    id: 'authoring-fixture',
    sourceModelHash: modelHash,
    brief: {
      briefHash: hash('fixed two-mode application brief'),
      operation: 'apply',
      contextIds: ['interface'],
      modeIds: ['Day', 'Night'],
      permissions: {
        addColors: true,
        addFamilies: true,
        addScales: true,
        addRules: false,
        editFamilyIds: [],
        editScaleIds: [],
        replaceRuleIds: [],
      },
    },
    derivation: {
      algorithmId: 'declared-source-application',
      algorithmVersion: '1',
      policyHash: hash('apply-policy'),
      inputHash: hash('source-application'),
      sourceColorIds: ['paper', 'ink'],
      sourceScaleIds: [],
    },
    colors: [],
    families: [],
    scales: [],
    rules: [],
    exceptions: [],
  };
}
function composition(
  modelHash: string,
  fixed: ColorSystemApplicationRequirementsV1,
  choices = ['ink']
): ColorSystemModelCompositionRequestV1 {
  return {
    version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
    modelHash,
    requirementsHash: hash(fixed),
    maximumNodes: 4096,
    maximumSolutions: 3,
    groups: [
      {
        id: 'whole-applications',
        options: choices.map((colorId, index) => ({
          id: `choice:${index}`,
          assignments: fixed.templates.flatMap(template =>
            template.uses.map(use => ({
              applicationId: template.id,
              useId: use.id,
              colorId: use.id === 'ground' ? 'paper' : colorId,
            }))
          ),
        })),
      },
    ],
  };
}
function applyFixture(input = sourceInput()) {
  const source = buildColorSystemModelV1(input);
  const fixed = requirements();
  const request: Mutable<ColorSystemAuthoringDirectionV1> = {
    version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
    id: 'one-direction',
    generation: { kind: 'apply', proposal: mutableCopy(proposal(source.modelHash)) },
    requirements: mutableCopy(fixed),
    composition: mutableCopy(composition(source.modelHash, fixed)),
    units: [],
  };
  return { source, request };
}
async function constructedFixture(input = sourceInput()) {
  const f = applyFixture(input);
  const base = proposal(f.source.modelHash);
  const briefScope = { ...base.brief, operation: 'extend' as const };
  const structureProposal: ColorSystemProposalRequestV1 = {
    ...base,
    id: 'new-scale-structure',
    brief: briefScope,
    families: [
      {
        id: 'proposed-family',
        label: 'Explicit source-derived family',
        colorIds: ['blue-mid', 'blue-deep'],
      },
    ],
    scales: [
      {
        id: 'proposed-scale',
        label: 'Explicit three-slot scale',
        familyId: 'proposed-family',
        slots: [0, 1, 2].map(position => ({ id: `slot:${position}`, position })),
        modes: ['Day', 'Night'].map(modeId => ({
          modeId,
          anchors: [
            { slotId: 'slot:0', colorId: 'blue-mid' },
            { slotId: 'slot:2', colorId: 'blue-deep' },
          ],
        })),
      },
    ],
  };
  const structure = buildColorSystemProposalV1(f.source, structureProposal);
  const brief: ColorSystemConstructionBriefV1 = {
    schemaVersion: COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
    modelHash: structure.workingModel.modelHash,
    contextId: 'interface',
    changeMode: 'extend',
    decision: {
      actor: { kind: 'agent', ref: 'synthetic-builder' },
      authorityRef: 'synthetic:extension',
      decisionRef: 'synthetic:construction',
    },
    scales: ['Day', 'Night'].map(modeId => ({
      scaleId: 'proposed-scale',
      modeId,
      requiredSlotIds: ['slot:0', 'slot:1', 'slot:2'],
      fillSlotIds: ['slot:1'],
      lightnessOrder: 'none',
      endpoints: [],
    })),
  };
  const intent: ColorSystemConstructionProposalIntentV1 = {
    version: COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
    id: 'constructed-direction',
    sourceModelHash: f.source.modelHash,
    brief: briefScope,
  };
  const preview = await buildColorSystemConstructionProposalV1(
    f.source,
    brief,
    intent,
    execution,
    structureProposal
  );
  if (preview.status !== 'proposed') throw new Error('Unexpected synthetic construction');
  const request: ColorSystemAuthoringDirectionV1 = {
    ...f.request,
    generation: { kind: 'construction', brief, intent, structureProposal },
    composition: composition(preview.proposal.workingModel.modelHash, f.request.requirements, [
      preview.generatedBindings[0].colorId,
    ]),
    units: [
      {
        id: 'new-scale-unit',
        contextId: 'interface',
        familyId: 'proposed-family',
        scaleId: 'proposed-scale',
        prominence: 'supporting',
        jobs: ['product-semantics'],
        anchors: ['Day', 'Night'].map(modeId => ({ modeId, colorId: 'blue-deep' })),
      },
    ],
  };
  return { ...f, request, preview };
}

/** Constructs an absent source-scale slot, with no preview generation or output-based choice. */
function renewalFixture(change?: (input: Mutable<ColorSystemModelInputV1>) => void) {
  const input = mutableCopy(sourceInput());
  input.scales
    .find(scale => scale.id === 'blue-scale')!
    .modes.forEach(mode => {
      mode.anchors = mode.anchors.filter(anchor => anchor.slotId !== 'slot:2');
    });
  const original = syntheticColorSystemModelInputV1().rules[0];
  input.rules = [
    { ...mutableCopy(original), id: 'source:palette', contextIds: ['interface'] },
    {
      ...mutableCopy(original),
      id: 'source:role',
      kind: 'role-binding',
      contextIds: ['interface'],
      operands: { role: 'action', members: [{ kind: 'family', id: 'pigments' }] },
    },
  ];
  change?.(input);
  input.adoptions = mutableCopy(
    buildColorSystemRuleAdoptionsV1(
      input,
      input.rules.map(rule => ({
        ruleId: rule.id,
        status: 'accepted',
        actor: { kind: 'agent', ref: 'original-source-reviewer' },
        authorityRef: 'synthetic:accepted-source',
        decisionRef: 'original-source-decision',
      }))
    )
  );
  const source = buildColorSystemModelV1(input);
  const base = proposal(source.modelHash);
  const brief = {
    ...base.brief,
    operation: 'extend' as const,
    permissions: {
      ...base.brief.permissions,
      editFamilyIds: ['pigments'],
      editScaleIds: ['blue-scale'],
    },
  };
  const generation: ColorSystemAuthoringDirectionV1['generation'] = {
    kind: 'construction',
    brief: {
      schemaVersion: COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
      modelHash: source.modelHash,
      contextId: 'interface',
      changeMode: 'extend',
      decision: {
        actor: { kind: 'agent', ref: 'synthetic-builder' },
        authorityRef: 'synthetic:extension',
        decisionRef: 'synthetic:construction',
      },
      scales: ['Day', 'Night'].map(modeId => ({
        scaleId: 'blue-scale',
        modeId,
        requiredSlotIds: ['slot:0', 'slot:1', 'slot:2', 'slot:3'],
        fillSlotIds: ['slot:2'],
        lightnessOrder: 'none',
        endpoints: [],
      })),
    },
    intent: {
      version: COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
      id: 'reviewed-construction',
      sourceModelHash: source.modelHash,
      brief,
    },
  };
  const fixed = requirements();
  const generatedId = `generated:${hash([source.modelHash, 'blue-scale', 'slot:2']).slice(7)}`;
  const { modelHash: _hash, ...template } = composition(source.modelHash, fixed, [generatedId]);
  const request: ColorSystemAuthoringDirectionV1 = {
    version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
    id: 'renewal-direction',
    generation,
    requirements: fixed,
    composition: { ...template, modelBinding: 'generated-model' },
    units: [
      {
        id: 'source-scale-unit',
        contextId: 'interface',
        familyId: 'pigments',
        scaleId: 'blue-scale',
        prominence: 'supporting',
        jobs: ['product-semantics'],
        anchors: ['Day', 'Night'].map(modeId => ({ modeId, colorId: 'blue-deep' })),
      },
    ],
    provisionalRuleReview: {
      version: 'teul.provisional-source-rule-review.v1',
      sourceModelHash: source.modelHash,
      generationRequestHash: hash(generation),
      briefContractHash: hash(brief),
      decisionScope: 'whole-source-predicates',
      contextIds: ['interface'],
      modeIds: ['Day', 'Night'],
      ruleIds: input.rules.map(rule => rule.id),
      actor: { kind: 'agent', ref: 'explicit-provisional-reviewer' },
      authorityRef: 'synthetic:working-renewal',
      decisionRef: 'synthetic:one-generation-review',
    },
  };
  return { source, request, brief };
}

describe('explicit provisional source-rule review', () => {
  it('declares and records whole-rule acceptance beyond the application context and mode', async () => {
    const f = renewalFixture(input => {
      for (const rule of input.rules) rule.contextIds = ['communications', 'interface'];
    });
    const before = canonicalJson(f.source);
    const generation = mutableCopy(f.request.generation);
    if (generation.kind !== 'construction') throw new Error('Expected construction');
    generation.brief.scales = generation.brief.scales.filter(scale => scale.modeId === 'Day');
    generation.intent.brief.modeIds = ['Day'];
    const generated = await buildColorSystemConstructionProposalV1(
      f.source,
      generation.brief,
      generation.intent,
      execution
    );
    if (generated.status !== 'proposed') throw new Error('Expected generated Day proposal');
    const reviewed = ruleReview.reviewColorSystemAuthoringSourceRulesV1(
      f.source,
      generated.proposal,
      generation,
      {
        ...f.request.provisionalRuleReview,
        generationRequestHash: hash(generation),
        briefContractHash: hash(generated.proposal.request.brief),
        modeIds: ['Day'],
      }
    );
    expect(reviewed.policy.contextIds).toEqual(['interface']);
    expect(reviewed.policy.modeIds).toEqual(['Day']);
    expect(reviewed.policy.decisionScope).toBe('whole-source-predicates');
    expect(reviewed.renewedRules).toEqual(
      f.source.rules.map(rule => {
        const adoption = reviewed.proposal.workingModel.adoptions.find(
          item => item.ruleId === rule.id
        )!;
        return {
          ruleId: rule.id,
          ruleHash: adoption.ruleHash,
          dependencyHash: adoption.dependencyHash,
          contextIds: ['communications', 'interface'],
          modeIds: ['Day', 'Night'],
        };
      })
    );
    const original = compileColorSystemRelationshipsV1(generated.proposal.workingModel);
    const effective = compileColorSystemRelationshipsV1(reviewed.proposal.workingModel);
    for (const [contextId, modeId, colorId] of [
      ['communications', 'Day', generated.generatedBindings[0].colorId],
      ['interface', 'Night', 'blue-deep'],
    ]) {
      const application = {
        id: `outside-application-scope:${contextId}:${modeId}`,
        contextId,
        modeId,
        uses: [{ id: 'paint', role: 'action', colorId }],
        pairs: [],
      };
      expect(original.evaluate(application).rules.every(rule => rule.status === 'unresolved')).toBe(
        true
      );
      expect(
        effective
          .evaluate(application)
          .rules.every(rule => rule.adoption === 'accepted' && rule.status === 'pass')
      ).toBe(true);
    }
    expect(reviewed.proposal.workingModel.rules).toEqual(generated.proposal.workingModel.rules);
    expect(reviewed.proposal.workingModel.colors).toEqual(generated.proposal.workingModel.colors);
    expect(canonicalJson(f.source)).toBe(before);
  });

  it('rejects absent or unsupported whole-predicate decision scope', async () => {
    const f = renewalFixture();
    const { decisionScope: _scope, ...withoutScope } = f.request.provisionalRuleReview!;
    for (const policy of [withoutScope, { ...withoutScope, decisionScope: 'application-only' }])
      await expect(
        executeColorSystemAuthoringDirectionV1(
          f.source,
          { ...f.request, provisionalRuleReview: policy },
          execution
        )
      ).rejects.toThrow();
  });

  it('generates once, retains the original pending proposal and binds fresh agent decisions', async () => {
    const f = renewalFixture();
    const before = canonicalJson(f.source);
    const construct = vi.spyOn(constructionProposal, 'buildColorSystemConstructionProposalV1');
    try {
      const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
      expect(result.status).toBe('ready');
      expect(construct).toHaveBeenCalledTimes(1);
      if (
        result.generation?.kind !== 'construction' ||
        result.generation.result.status !== 'proposed'
      )
        throw new Error('Expected one retained construction');
      const original = result.generation.result.proposal;
      expect(original.reviewStatus).toBe('absent');
      expect(original.pendingRuleIds).toEqual(['source:palette', 'source:role']);
      const reviewed = result.ruleReview!.proposal;
      expect(reviewed.proposalHash).toBe(original.proposalHash);
      expect(reviewed.reviewStatus).toBe('current');
      expect(reviewed.pendingRuleIds).toEqual([]);
      expect(
        reviewed.workingModel.adoptions.every(
          decision => decision.actor.ref === 'explicit-provisional-reviewer'
        )
      ).toBe(true);
      expect(result.ruleReview!.qualified).toBe(false);
      expect(result.receipt.ruleReviewHash).toBe(hash(result.ruleReview));
      expect(result.candidates[0].proposal).toEqual(reviewed);
      expect(canonicalJson(f.source)).toBe(before);
      expect(reviewed.sourceAssessmentModel).toEqual(original.sourceAssessmentModel);
    } finally {
      construct.mockRestore();
    }
  });

  it('reports missing and incomplete review as blocked, without declaring numerical infeasibility', async () => {
    const f = renewalFixture();
    const { provisionalRuleReview: _policy, ...withoutPolicy } = f.request;
    for (const request of [
      withoutPolicy,
      {
        ...f.request,
        provisionalRuleReview: { ...f.request.provisionalRuleReview!, ruleIds: ['source:palette'] },
      },
    ]) {
      const result = await executeColorSystemAuthoringDirectionV1(f.source, request, execution);
      expect(result.status).toBe('blocked');
      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stage: 'review', code: 'SOURCE_RULE_REVIEW_REQUIRED' }),
        ])
      );
    }
  });

  it('does not lose the pending-review diagnostic behind bounded failure examples', async () => {
    const f = renewalFixture(input => {
      for (let i = 0; i < 8; i++)
        input.rules.push({
          ...input.rules[0],
          id: `earlier:${i}`,
          kind: 'color-count',
          operands: { members: [{ kind: 'color', id: 'paper' }], minimum: 0, maximum: 0 },
        });
    });
    const { provisionalRuleReview: _policy, ...request } = f.request;
    const result = await executeColorSystemAuthoringDirectionV1(f.source, request, execution);
    expect(result.status).toBe('blocked');
    if (!result.composition || result.composition.status === 'cancelled')
      throw new Error('Missing composition');
    expect(result.composition.diagnostics.failures).toHaveLength(8);
    expect(
      result.composition.diagnostics.failures.every(item => item.id.includes('earlier:'))
    ).toBe(true);
    expect(
      result.diagnostics.find(item => item.code === 'SOURCE_RULE_REVIEW_REQUIRED')?.reason
    ).toContain('source:palette');
  });

  it.each([
    ['sourceModelHash', hash('other source')],
    ['generationRequestHash', hash('other generation')],
    ['briefContractHash', hash('other brief')],
    ['contextIds', ['communications']],
    ['modeIds', ['Day']],
    ['ruleIds', ['undeclared-rule']],
  ])(
    'rejects changed %s bindings without composition or silently renewed decisions',
    async (field, value) => {
      const f = renewalFixture();
      const result = await executeColorSystemAuthoringDirectionV1(
        f.source,
        {
          ...f.request,
          provisionalRuleReview: { ...f.request.provisionalRuleReview, [field as string]: value },
        },
        execution
      );
      expect(result).toMatchObject({ status: 'blocked', composition: null, candidates: [] });
      expect(result.ruleReview).toBeUndefined();
      expect(result.diagnostics[0].code).toBe('PROVISIONAL_RULE_REVIEW_BLOCKED');
    }
  );

  it('rejects owner attribution, duplicate identities and executable accessors', async () => {
    const f = renewalFixture();
    for (const actor of [
      { kind: 'user', ref: 'owner' },
      { kind: 'agent', ref: 'agent', approved: true },
    ])
      await expect(
        executeColorSystemAuthoringDirectionV1(
          f.source,
          { ...f.request, provisionalRuleReview: { ...f.request.provisionalRuleReview, actor } },
          execution
        )
      ).rejects.toThrow();
    await expect(
      executeColorSystemAuthoringDirectionV1(
        f.source,
        {
          ...f.request,
          provisionalRuleReview: {
            ...f.request.provisionalRuleReview,
            ruleIds: ['source:palette', 'source:palette'],
          },
        },
        execution
      )
    ).rejects.toThrow();
    let called = false;
    const hostile = {
      ...f.request.provisionalRuleReview,
      get decisionRef() {
        called = true;
        return 'unsafe';
      },
    };
    await expect(
      executeColorSystemAuthoringDirectionV1(
        f.source,
        { ...f.request, provisionalRuleReview: hostile },
        execution
      )
    ).rejects.toThrow();
    expect(called).toBe(false);
  });

  it('does not convert accepted predicates into unconditional application passes', async () => {
    const f = renewalFixture(input => {
      input.rules.push({
        ...input.rules[0],
        id: 'source:count',
        kind: 'color-count',
        operands: {
          members: [
            { kind: 'color', id: 'paper' },
            { kind: 'family', id: 'pigments' },
          ],
          minimum: 1,
          maximum: 1,
        },
      });
    });
    const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    expect(result.ruleReview!.proposal.reviewStatus).toBe('current');
    expect(result.ruleReview!.proposal.pendingRuleIds).toEqual([]);
    expect(result.status).toBe('infeasible');
    expect(result.candidates).toEqual([]);
    if (!result.composition || result.composition.status === 'cancelled')
      throw new Error('Missing composition');
    expect(
      result.composition!.diagnostics.failures.some(failure => failure.id === 'Day:source:count')
    ).toBe(true);
  });

  it('leaves unresolved source evidence blocking after fresh working rule decisions', async () => {
    const f = renewalFixture(input => {
      const gap = {
        ...input.claims[0],
        id: 'source:numeric-gap',
        status: 'unresolved' as const,
        text: 'The invented source ground authority is disputed.',
      };
      input.claims.push(gap);
      input.colors.find(color => color.id === 'paper')!.claimIds.push(gap.id);
      input.coverage[0].unresolvedClaimIds.push(gap.id);
    });
    const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    expect(result.ruleReview!.proposal.workingModel.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'source:numeric-gap', status: 'unresolved' }),
      ])
    );
    expect(result.status).toBe('infeasible');
    expect(result.candidates).toEqual([]);
    if (!result.composition || result.composition.status === 'cancelled')
      throw new Error('Missing composition');
    expect(
      result.composition!.diagnostics.failures.some(
        failure => failure.id === 'Day:source:numeric-gap'
      )
    ).toBe(true);
  });

  it('rejects changed or unaccepted source predicates and existing reviews instead of overwriting them', async () => {
    const f = renewalFixture();
    const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    if (
      result.generation?.kind !== 'construction' ||
      result.generation.result.status !== 'proposed'
    )
      throw new Error('Missing construction');
    const original = result.generation.result.proposal;
    const altered = mutableCopy(original);
    altered.workingModel.rules[0].label = 'Different predicate meaning';
    expect(() =>
      ruleReview.reviewColorSystemAuthoringSourceRulesV1(
        f.source,
        altered,
        f.request.generation,
        f.request.provisionalRuleReview
      )
    ).toThrow(/original predicate/);
    const { modelHash: _modelHash, ...content } = f.source;
    const unaccepted = buildColorSystemModelV1({ ...content, adoptions: [] });
    expect(() =>
      ruleReview.reviewColorSystemAuthoringSourceRulesV1(
        unaccepted,
        { ...original, sourceModelHash: unaccepted.modelHash },
        f.request.generation,
        { ...f.request.provisionalRuleReview, sourceModelHash: unaccepted.modelHash }
      )
    ).toThrow(/previously accepted/);
    expect(() =>
      ruleReview.reviewColorSystemAuthoringSourceRulesV1(
        f.source,
        result.ruleReview!.proposal,
        f.request.generation,
        f.request.provisionalRuleReview
      )
    ).toThrow(/cannot be overwritten/);
    expect(() =>
      ruleReview.reviewColorSystemAuthoringSourceRulesV1(
        f.source,
        {
          ...original,
          request: {
            ...original.request,
            exceptions: [
              {
                sourceRuleId: 'source:role',
                replacementRuleId: 'replacement',
                reason: 'unsupported blanket exception',
              },
            ],
          },
        },
        f.request.generation,
        f.request.provisionalRuleReview
      )
    ).toThrow(/separate explicit/);
  });

  it('replays the serialized policy and effective model through the common run and saved recipe', async () => {
    const f = renewalFixture();
    const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    const replayed = await executeColorSystemAuthoringDirectionV1(
      f.source,
      JSON.parse(JSON.stringify(f.request)),
      execution
    );
    expect(replayed.receipt).toEqual(result.receipt);
    expect(replayed.candidates).toEqual(result.candidates);
    const { requirements: fixed, ...direction } = f.request;
    const run = await executeColorSystemAuthoringRunV1(
      f.source,
      {
        version: 'teul.authoring-run.v1',
        id: 'policy-run',
        requirements: fixed,
        brief: f.brief,
        directions: [direction],
      },
      execution
    );
    expect(run.status).toBe('ready');
    expect(run.executions[0].receipt).toEqual(result.receipt);
    const selected = result.candidates[0];
    const applications = selected.applications.applications.map(item => item.application);
    const model = selected.proposal.workingModel;
    const recipe = parseColorSystemRecipeV1({
      schemaVersion: 'teul.color-system-recipe.v1',
      id: 'working-review-recipe',
      label: 'Invented working review',
      source: { model: f.source, intake: 'guideline-json' },
      direction: f.request,
      selection: {
        model,
        applications,
        contentHash: buildColorSystemDesignContentV1(model, applications).contentHash,
        executionReceiptHash: result.receipt.receiptHash,
      },
      locks: [],
    });
    const saved = JSON.parse(serializeColorSystemRecipeV1(recipe));
    const replay = await replayColorSystemRecipeV1(saved, execution);
    expect(replay.status).toBe('matched');
    expect(replay.execution.ruleReview).toEqual(result.ruleReview);
    expect(replay.qualified).toBe(false);
    const delivery = await compileColorSystemAuthoredDeliveryV1(
      saved,
      {
        version: 'teul.application-geometry.v1',
        modelHash: model.modelHash,
        applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
        boards: applications.map(application => ({
          applicationId: application.id,
          width: 12,
          height: 10,
          root: {
            id: `${application.id}:ground`,
            useId: 'ground',
            shape: { kind: 'rect', x: 0, y: 0, width: 12, height: 10 },
            children: [
              {
                id: `${application.id}:mark`,
                useId: 'mark',
                shape: { kind: 'rect', x: 2, y: 2, width: 4, height: 5 },
                children: [],
              },
            ],
          },
        })),
      },
      execution
    );
    const blueprint = readColorSystemAuthoredDeliveryV1(delivery);
    expect(blueprint.identity.workingModelHash).toBe(model.modelHash);
    expect(blueprint.identity.executionReceiptHash).toBe(result.receipt.receiptHash);
    expect(blueprint.documentation.adoptions).toEqual(model.adoptions);
  });

  it('lets a separate explicit review complete a partial policy without carrying it forward', async () => {
    const f = renewalFixture();
    const values = new Map<string, unknown>();
    const storage = createColorSystemRecipeStorageV1({
      clientStorage: {
        keysAsync: async () => [...values.keys()],
        getAsync: async key => values.get(key),
        setAsync: async (key, value) => {
          values.set(key, value);
        },
        deleteAsync: async key => {
          values.delete(key);
        },
      },
      validateRecipeJsonForSave: raw => {
        parseColorSystemRecipeV1(JSON.parse(raw));
      },
    });
    const session = createColorSystemAuthoringSessionV1({
      source: () => ({ model: f.source, intake: 'guideline-json' }),
      storage,
      checkSource: async () => ({
        status: 'same',
        code: 'SYNTHETIC',
        message: 'Invented source read',
        sourceModelHash: f.source.modelHash,
      }),
      yield: async () => {},
    });
    const first = await session.analyze({
      id: 'partial-policy',
      label: 'Partial source-rule review',
      direction: {
        ...f.request,
        provisionalRuleReview: { ...f.request.provisionalRuleReview, ruleIds: ['source:palette'] },
      },
    });
    expect(first.status).toBe('blocked');
    const pending = session.getPendingReview()!;
    expect(pending.pendingRuleIds).toEqual(['source:role']);
    expect(pending.model.adoptions.find(item => item.ruleId === 'source:palette')?.actor.ref).toBe(
      'explicit-provisional-reviewer'
    );
    const next = session.prepareReview(pending.proposalHash, [
      {
        ruleId: 'source:role',
        status: 'accepted',
        actor: { kind: 'user', ref: 'synthetic-designer' },
        authorityRef: 'synthetic:explicit-follow-up',
        decisionRef: 'one-proposal',
      },
    ]);
    expect(next.direction.provisionalRuleReview).toBeUndefined();
    const completed = await session.analyze(next);
    expect(completed.status).toBe('ready');
    const adoptions = completed.snapshot.recipe!.selection!.model.adoptions;
    expect(adoptions.find(item => item.ruleId === 'source:palette')?.actor.ref).toBe(
      'explicit-provisional-reviewer'
    );
    expect(adoptions.find(item => item.ruleId === 'source:role')?.actor.kind).toBe('user');
  });

  it('clears selectable review output when cancelled immediately after the fresh review', async () => {
    const f = renewalFixture();
    let cancelled = false;
    const original = ruleReview.reviewColorSystemAuthoringSourceRulesV1;
    const review = vi
      .spyOn(ruleReview, 'reviewColorSystemAuthoringSourceRulesV1')
      .mockImplementation((...args) => {
        const result = original(...args);
        cancelled = true;
        return result;
      });
    try {
      const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, {
        isCancelled: () => cancelled,
        yield: async () => {},
      });
      expect(result).toMatchObject({
        status: 'cancelled',
        generation: null,
        composition: null,
        candidates: [],
      });
      expect(result.ruleReview).toBeUndefined();
    } finally {
      review.mockRestore();
    }
  });
});
async function catalogFixture() {
  const f = applyFixture();
  const query: ColorSystemCatalogProposalRequestV1 = {
    version: COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
    sourceModelHash: f.source.modelHash,
    contextId: 'interface',
    providers: ['radix'],
    limitPerProvider: 1,
    anchorRefs: ['Day', 'Night'].map(modeId => {
      const value = f.source.colors.find(color => color.id === 'blue-deep')!.valuesByMode[modeId];
      return {
        colorId: 'blue-deep',
        modeId,
        valueHash: colorSystemExactSrgbValueHashV1(value.components, value.alpha),
      };
    }),
    radix: {
      category: 'accent',
      modes: [
        { modeId: 'Day', scheme: 'light' },
        { modeId: 'Night', scheme: 'dark' },
      ],
    },
  };
  const intent: ColorSystemCatalogProposalIntentV1 = {
    version: COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
    id: 'catalog-direction',
    sourceModelHash: f.source.modelHash,
    brief: { ...proposal(f.source.modelHash).brief, operation: 'extend' },
  };
  const session = await compileColorSystemCatalogProposalV1(f.source, query, execution);
  if (session.status !== 'ready') throw new Error('Unexpected synthetic catalog');
  const candidateId = session.retrieval.candidates[0].id;
  const preview = session.materialize(candidateId, intent);
  const request: ColorSystemAuthoringDirectionV1 = {
    ...f.request,
    generation: { kind: 'catalog', query, candidateId, intent },
    composition: composition(preview.proposal.workingModel.modelHash, f.request.requirements, [
      preview.binding.members[11].colorId,
    ]),
    units: [
      {
        id: 'catalog-unit',
        contextId: 'interface',
        familyId: preview.binding.familyId,
        scaleId: preview.binding.scaleId!,
        prominence: 'supporting',
        jobs: ['product-semantics'],
        anchors: ['Day', 'Night'].map(modeId => ({
          modeId,
          colorId: preview.binding.members[8].colorId,
        })),
      },
    ],
  };
  return { ...f, request, preview };
}

function interactionSourceInput() {
  const input = structuredClone(sourceInput()) as Mutable<ColorSystemModelInputV1>;
  const gray = (value: number) => buildColorSystemSrgbValueV1({ r: value, g: value, b: value });
  input.colors.find(color => color.id === 'paper')!.valuesByMode.Day = gray(1);
  for (const [index, id] of ['blue-pale', 'blue-mid', 'blue', 'blue-deep'].entries())
    input.colors.find(color => color.id === id)!.valuesByMode.Day = gray(0.15 + index * 0.05);
  return input;
}
function restBoundInput(input = interactionSourceInput(), colorId = 'blue-mid') {
  input.rules = [
    {
      id: 'rule:rest',
      label: 'Source default control color',
      kind: 'role-binding',
      contextIds: ['interface'],
      modeIds: ['Day'],
      origin: 'source-stated',
      force: 'requirement',
      evidenceRefs: ['evidence:rules'],
      claimIds: ['claim:rules'],
      operands: { role: 'rest', members: [{ kind: 'color', id: colorId }] },
    },
  ];
  input.adoptions = mutableCopy(
    buildColorSystemRuleAdoptionsV1(input, [
      {
        ruleId: 'rule:rest',
        status: 'accepted',
        actor: { kind: 'agent', ref: 'synthetic-review' },
        authorityRef: 'synthetic:state-search',
        decisionRef: 'test',
      },
    ])
  );
  return input;
}
function interactionFixture(input = interactionSourceInput()) {
  const source = buildColorSystemModelV1(input);
  const fixed = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: [
      {
        id: 'button',
        contextId: 'interface',
        modeId: 'Day',
        uses: [
          { id: 'ground', role: 'ground', area: 100 },
          ...['rest', 'hover', 'pressed'].map(id => ({ id, role: id, area: 10 })),
          { id: 'label', role: 'on-action', area: 3 },
        ],
        pairs: ['rest', 'hover', 'pressed'].flatMap(id => [
          {
            id: `${id}-ground`,
            foregroundUseId: id,
            backgroundUseId: 'ground',
            contrast: { minimum: 3, assessment: 'required' },
          },
          {
            id: `label-${id}`,
            foregroundUseId: 'label',
            backgroundUseId: id,
            contrast: { minimum: 4.5, assessment: 'required' },
          },
        ]),
      },
    ],
    distinctions: [
      {
        id: 'all-states',
        applicationId: 'button',
        kind: 'interaction-states',
        useIds: ['rest', 'hover', 'pressed'],
        groundUseId: 'ground',
        expectedCount: 3,
        minimumDeltaEOK: 0.01,
      },
    ],
  });
  const base = mutableCopy(proposal(source.modelHash));
  const request: Mutable<ColorSystemAuthoringDirectionV1> = {
    version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
    id: 'selected-state-direction',
    generation: {
      kind: 'apply',
      proposal: { ...base, brief: { ...base.brief, modeIds: ['Day'] } },
    },
    requirements: mutableCopy(fixed),
    units: [],
    composition: {
      ...composition(source.modelHash, fixed),
      groups: [
        {
          id: 'grounds',
          options: [
            {
              id: 'fixed-ground',
              assignments: [{ applicationId: 'button', useId: 'ground', colorId: 'paper' }],
            },
          ],
        },
      ],
    },
    interactionGroups: [
      {
        id: 'selected-states',
        request: {
          version: COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION,
          modelHash: source.modelHash,
          contextId: 'interface',
          modeId: 'Day',
          role: 'selected',
          scales: [
            {
              scaleId: 'blue-scale',
              slotIds: ['slot:0', 'slot:1', 'slot:2', 'slot:3'],
              preference: 0,
              preferredSlotIds: { rest: 'slot:0', hover: 'slot:1', pressed: 'slot:2' },
              stateOrder: 'ascending',
            },
          ],
          surfaceColorIds: ['paper'],
          onForegroundColorIds: ['paper'],
        },
        bindings: [
          ...(['rest', 'hover', 'pressed'] as const).map(selection => ({
            applicationId: 'button',
            useId: selection,
            selection,
          })),
          { applicationId: 'button', useId: 'label', selection: 'on-foreground' },
        ],
      },
    ],
  };
  return { source, request, input };
}

function extendedInteractionInput() {
  const input = interactionSourceInput();
  const ids = [
    'blue-pale',
    'blue-mid',
    'blue',
    'blue-deep',
    ...Array.from({ length: 16 }, (_, index) => `extended:${index + 4}`),
  ];
  ids.forEach((id, index) => {
    const value = buildColorSystemSrgbValueV1({
      r: 0.12 + index * 0.015,
      g: 0.12 + index * 0.015,
      b: 0.12 + index * 0.015,
    });
    const old = input.colors.find(color => color.id === id);
    if (old) old.valuesByMode.Day = value;
    else
      input.colors.push({
        ...mutableCopy(input.colors[2]),
        id,
        label: id,
        valuesByMode: { Day: value },
      });
  });
  input.families[0].colorIds.push(...ids.slice(4));
  input.scales[0].slots = ids.map((_, index) => ({ id: `slot:${index}`, position: index }));
  input.scales[0].modes.find(mode => mode.modeId === 'Day')!.anchors = ids.map(
    (colorId, index) => ({ slotId: `slot:${index}`, colorId })
  );
  return { input, ids };
}

describe('locally recomputed authoring execution', () => {
  it('retains bounded search status and reports actual pending rules before the fallback return', async () => {
    const { input, ids } = extendedInteractionInput();
    const pending = restBoundInput(input, ids[14]);
    pending.adoptions = [];
    const f = interactionFixture(pending);
    Object.assign(f.request.interactionGroups![0].request.scales[0], {
      slotIds: ids.map((_, index) => `slot:${index}`),
    });
    const bounded = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    expect(bounded.status).toBe('search-limited');
    expect(bounded.candidates).toEqual([]);
    expect(bounded.interactionAlternatives!.groups[0].result.truncated).toBe(true);
    expect(bounded.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INTERACTION_SEARCH_LIMITED' }),
        expect.objectContaining({
          stage: 'review',
          code: 'SOURCE_RULE_REVIEW_REQUIRED',
          reason: expect.stringContaining('rule:rest'),
        }),
      ])
    );
    if (!bounded.composition || bounded.composition.status === 'cancelled')
      throw new Error('Expected retained composition');
    expect(bounded.composition.diagnostics.pendingRuleIds).toEqual(['rule:rest']);

    const smaller = restBoundInput();
    smaller.adoptions = [];
    const complete = interactionFixture(smaller);
    const exhausted = await executeColorSystemAuthoringDirectionV1(
      complete.source,
      complete.request,
      execution
    );
    expect(exhausted.status).toBe('blocked');
    expect(exhausted.interactionAlternatives!.groups[0].result.truncated).toBe(false);
    expect(exhausted.diagnostics.some(item => item.code === 'SOURCE_RULE_REVIEW_REQUIRED')).toBe(
      true
    );
  });

  it('does not report an inapplicable pending predicate as a cause of failed composition', async () => {
    const input = restBoundInput(interactionSourceInput(), 'warm');
    input.rules.push({
      ...input.rules[0],
      id: 'rule:absent-role',
      kind: 'role-binding',
      operands: {
        role: 'absent-role',
        presence: 'if-present',
        members: [{ kind: 'color', id: 'warm' }],
      },
    });
    const f = interactionFixture(input);
    const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    expect(result.status).toBe('infeasible');
    expect(result.candidates).toEqual([]);
    expect(result.diagnostics.some(item => item.code === 'SOURCE_RULE_REVIEW_REQUIRED')).toBe(
      false
    );
    if (!result.composition || result.composition.status === 'cancelled')
      throw new Error('Expected retained composition');
    expect(result.composition.diagnostics.pendingRuleIds).toBeUndefined();
    expect(
      result.composition.diagnostics.failures.some(item => item.id === 'button:rule:rest')
    ).toBe(true);
  });

  it('searches other admitted state combinations when a preference fails a source rule', async () => {
    const f = interactionFixture(restBoundInput());
    const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    expect(result.status).toBe('ready');
    expect(result.candidates).toHaveLength(1);
    expect(
      result.candidates[0].applications.applications[0].application.uses.find(
        use => use.id === 'rest'
      )!.colorId
    ).toBe('blue-mid');
    expect(result.candidates[0].sourceCompliance[0].eligible).toBe(true);
    expect(
      result.candidates[0].applications.applications[0].pairs.every(pair => pair.status === 'pass')
    ).toBe(true);
    expect(f.request.interactionGroups![0].request.scales[0].preferredSlotIds!.rest).toBe('slot:0');

    const locked = structuredClone(f.request);
    Object.assign(locked.interactionGroups![0].request.scales[0], {
      lockedSlotIds: { rest: 'slot:0' },
    });
    const impossible = await executeColorSystemAuthoringDirectionV1(f.source, locked, execution);
    expect(impossible.status).toBe('infeasible');
    expect(impossible.candidates).toEqual([]);
    expect(impossible.interactionAlternatives!.groups.every(group => group.result.complete)).toBe(
      true
    );
    expect(result.interactionAlternatives!.reason).toBe('preferred-states-rejected');
    expect(result.receipt.interactionAlternativesHash).toBe(hash(result.interactionAlternatives));
  });

  it('reports a bounded state search when feasible source choices lie outside retained alternatives', async () => {
    const { input, ids } = extendedInteractionInput();
    const f = interactionFixture(restBoundInput(input, ids[14]));
    Object.assign(f.request.interactionGroups![0].request.scales[0], {
      slotIds: ids.map((_, index) => `slot:${index}`),
    });
    const bounded = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    expect(bounded.status).toBe('search-limited');
    expect(bounded.candidates).toEqual([]);
    expect(bounded.interactionAlternatives!.groups[0].result.truncated).toBe(true);
    expect(bounded.diagnostics.some(item => item.code === 'INTERACTION_SEARCH_LIMITED')).toBe(true);
    const retained = structuredClone(f.request);
    Object.assign(retained.interactionGroups![0].request.scales[0], {
      preferredSlotIds: {
        rest: 'slot:14',
        hover: 'slot:16',
        pressed: 'slot:18',
      },
    });
    const feasible = await executeColorSystemAuthoringDirectionV1(f.source, retained, execution);
    expect(feasible.status).toBe('ready');
    expect(
      feasible.candidates[0].applications.applications[0].application.uses.find(
        use => use.id === 'rest'
      )!.colorId
    ).toBe(ids[14]);
  });

  it('discards complete alternative selections when cancellation arrives before recomposition', async () => {
    const f = interactionFixture(restBoundInput());
    const enumerate = modelInteractions.enumerateColorSystemModelInteractionsV1;
    let cancelled = false;
    const spy = vi
      .spyOn(modelInteractions, 'enumerateColorSystemModelInteractionsV1')
      .mockImplementationOnce(async (...args) => {
        const result = await enumerate(...args);
        cancelled = true;
        return result;
      });
    try {
      const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, {
        ...execution,
        isCancelled: () => cancelled,
      });
      expect(result).toMatchObject({
        status: 'cancelled',
        candidates: [],
        assessments: [],
        interactions: [],
        composition: null,
        generation: null,
      });
      expect(result.interactionAlternatives).toBeUndefined();
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });

  it('selects complete interaction states inside replay and records the realized composition', async () => {
    const f = interactionFixture();
    const yieldHook = vi.fn(async () => {});
    const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, {
      ...execution,
      yield: yieldHook,
    });
    expect(result.status).toBe('ready');
    expect(result.interactions).toHaveLength(1);
    const selected = result.interactions[0];
    expect(selected.request).toEqual(f.request.interactionGroups![0].request);
    expect(selected.result.status).toBe('ready');
    if (selected.result.status !== 'ready') throw new Error('Unexpected selector status');
    const application = result.candidates[0].applications.applications[0].application;
    for (const state of ['rest', 'hover', 'pressed'] as const)
      expect(application.uses.find(use => use.id === state)!.colorId).toBe(
        selected.result.selection.states[state].colorId
      );
    expect(application.uses.find(use => use.id === 'label')!.colorId).toBe(
      selected.result.selection.onForeground!.colorId
    );
    expect(result.candidates[0].applications.distinctions[0].pass).toBe(true);
    expect(result.compositionRequest!.groups).toHaveLength(2);
    expect(result.receipt.compositionRequestHash).toBe(hash(result.compositionRequest));
    expect(result.receipt.interactionHashes).toEqual([hash(selected)]);
    expect(yieldHook).toHaveBeenCalled();
  });

  it('forwards missing slots and selector lock failures without a composition or candidates', async () => {
    const input = interactionSourceInput();
    input.scales[0].modes[0].anchors = input.scales[0].modes[0].anchors.filter(
      anchor => anchor.slotId !== 'slot:1'
    );
    const gap = interactionFixture(input);
    const missing = await executeColorSystemAuthoringDirectionV1(
      gap.source,
      gap.request,
      execution
    );
    expect(missing).toMatchObject({ status: 'incomplete', composition: null, candidates: [] });
    expect(missing.interactions[0].result).toMatchObject({
      status: 'incomplete',
      gaps: expect.arrayContaining([expect.objectContaining({ code: 'MISSING_SLOT_ANCHOR' })]),
    });
    const other = interactionSourceInput();
    other.colors.find(color => color.id === 'blue-pale')!.valuesByMode.Day = other.colors.find(
      color => color.id === 'paper'
    )!.valuesByMode.Day;
    const locked = interactionFixture(other);
    Object.assign(locked.request.interactionGroups![0].request.scales[0], {
      lockedSlotIds: { rest: 'slot:0' },
    });
    const failed = await executeColorSystemAuthoringDirectionV1(
      locked.source,
      locked.request,
      execution
    );
    expect(failed).toMatchObject({ status: 'infeasible', composition: null, candidates: [] });
    expect(failed.interactions[0].result.status).toBe('infeasible');
  });

  it('rejects stale selector hashes, cross-mode bindings, collisions, and implicit link label colors', async () => {
    const f = interactionFixture();
    const changed = structuredClone(f.request);
    Object.assign(changed.interactionGroups![0].request, { modelHash: hash('stale') });
    await expect(
      executeColorSystemAuthoringDirectionV1(f.source, changed, execution)
    ).rejects.toThrow('different model');
    const otherMode = structuredClone(f.request);
    Object.assign(otherMode.interactionGroups![0].request, { modeId: 'Night' });
    await expect(
      executeColorSystemAuthoringDirectionV1(f.source, otherMode, execution)
    ).rejects.toThrow('same explicit context and mode');
    const collision = structuredClone(f.request);
    Object.assign(collision.interactionGroups![0].bindings[0], { useId: 'ground' });
    await expect(
      executeColorSystemAuthoringDirectionV1(f.source, collision, execution)
    ).rejects.toThrow('cannot overlap');
    const groupCollision = structuredClone(f.request);
    Object.assign(groupCollision.interactionGroups![0], { id: 'grounds' });
    await expect(
      executeColorSystemAuthoringDirectionV1(f.source, groupCollision, execution)
    ).rejects.toThrow('unique groups');
    const link = structuredClone(f.request);
    Object.assign(link.interactionGroups![0].request, { role: 'link' });
    const result = await executeColorSystemAuthoringDirectionV1(f.source, link, execution);
    expect(result.status).toBe('infeasible');
    expect(result.diagnostics[0].code).toBe('INTERACTION_BINDING_UNAVAILABLE');
    expect(result.candidates).toEqual([]);
  });

  it('bounds interaction groups before hooks and detaches their requests during replay', async () => {
    const f = interactionFixture();
    const hook = { isCancelled: vi.fn(() => false), yield: vi.fn(async () => {}) };
    await expect(
      executeColorSystemAuthoringDirectionV1(
        f.source,
        {
          ...f.request,
          interactionGroups: Array.from({ length: 17 }, () => f.request.interactionGroups![0]),
        },
        hook
      )
    ).rejects.toThrow('bound');
    expect(hook.isCancelled).not.toHaveBeenCalled();
    expect(hook.yield).not.toHaveBeenCalled();
    const expected = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    const incoming = structuredClone(f.request);
    const replayed = await executeColorSystemAuthoringDirectionV1(f.source, incoming, {
      ...execution,
      yield: async () => {
        Object.assign(incoming.interactionGroups![0].request, {
          surfaceColorIds: [],
          modelHash: hash('changed'),
        });
        Object.assign(incoming.interactionGroups![0].bindings[0], { useId: 'ground' });
      },
    });
    expect(replayed).toEqual(expected);
    let cancelled = false;
    const stopped = await executeColorSystemAuthoringDirectionV1(f.source, f.request, {
      isCancelled: () => cancelled,
      yield: async () => {
        cancelled = true;
      },
    });
    expect(stopped).toMatchObject({
      status: 'cancelled',
      interactions: [],
      composition: null,
      candidates: [],
      assessments: [],
    });
  });

  it('applies unchanged source values and binds complete actual applications into a replay receipt', async () => {
    const { source, request } = applyFixture();
    const result = await executeColorSystemAuthoringDirectionV1(source, request, execution);
    expect(result.status).toBe('ready');
    expect(result.qualified).toBe(false);
    expect(result.derivationStatus).toBe('recomputed-locally');
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.derivationStatus).toBe('declared-not-recomputed');
    expect(candidate.proposal.workingModel).toEqual(source);
    expect(candidate.applications.applications.map(item => item.application.modeId)).toEqual([
      'Day',
      'Night',
    ]);
    expect(candidate.sourceCompliance.every(item => item.eligible)).toBe(true);
    expect(
      candidate.applications.applications.every(item =>
        item.application.uses.every(use => ['paper', 'ink'].includes(use.colorId))
      )
    ).toBe(true);
    expect(result.receipt.requestHash).toBe(hash(request));
    expect(result.receipt.generationHash).toBe(hash(result.generation));
    expect(result.receipt.compositionHash).toBe(hash(result.composition));
    expect(result.receipt.assessmentHashes).toEqual(
      result.assessments.map(item => item.assessmentHash)
    );
    const { receiptHash, ...receipt } = result.receipt;
    expect(receiptHash).toBe(hash(receipt));
    expect(await executeColorSystemAuthoringDirectionV1(source, request, execution)).toEqual(
      result
    );
  });

  it('constructs a new structure and uses its real generated values in complete applications', async () => {
    const { source, request, preview } = await constructedFixture();
    const result = await executeColorSystemAuthoringDirectionV1(source, request, execution);
    expect(result.status).toBe('ready');
    expect(result.generation).toEqual({ kind: 'construction', result: preview });
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.proposal.request).toEqual(preview.proposal.request);
    expect(candidate.proposal.sourceAssessmentModel.scales).toEqual(source.scales);
    expect(
      candidate.applications.applications.every(
        item =>
          item.application.uses.find(use => use.id === 'mark')!.colorId ===
          preview.generatedBindings[0].colorId
      )
    ).toBe(true);
    expect(
      candidate.proposal.workingModel.colors.filter(color =>
        source.colors.some(old => old.id === color.id)
      )
    ).toEqual(source.colors);
  });

  it('binds a declared composition to one recomputed overlay without silently repairing explicit hashes', async () => {
    const f = await constructedFixture();
    if (f.request.generation.kind !== 'construction') throw new Error('Missing construction.');
    const { modelHash: _modelHash, ...template } = f.request
      .composition as ColorSystemModelCompositionRequestV1;
    const deferred: ColorSystemAuthoringDirectionV1 = {
      ...f.request,
      generation: {
        kind: 'overlay',
        proposal: {
          version: COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION,
          id: 'combined-construction',
          sourceModelHash: f.source.modelHash,
          brief: f.request.generation.intent.brief,
          fragments: [{ ...f.request.generation, id: 'control' }],
        },
      },
      composition: { ...template, modelBinding: 'generated-model' },
    };
    const build = vi.spyOn(constructionProposal, 'buildColorSystemConstructionProposalV1');
    try {
      const result = await executeColorSystemAuthoringDirectionV1(f.source, deferred, execution);
      expect(build).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('ready');
      if (result.generation?.kind !== 'overlay') throw new Error('Missing overlay output.');
      expect(result.compositionRequest!.modelHash).toBe(
        result.generation.result.proposal!.workingModel.modelHash
      );
      const explicit = {
        ...deferred,
        composition: { ...template, modelHash: hash('stale model') },
      };
      await expect(
        executeColorSystemAuthoringDirectionV1(f.source, explicit, execution)
      ).rejects.toThrow(/stale|model/i);
      const mixed = {
        ...deferred,
        composition: { ...template, modelBinding: 'generated-model', modelHash: hash('injected') },
      };
      await expect(
        executeColorSystemAuthoringDirectionV1(f.source, mixed, execution)
      ).rejects.toThrow(/unknown fields/i);
    } finally {
      build.mockRestore();
    }
  });

  it('resolves explicit interaction templates after generation and retains concrete-request parity', async () => {
    const f = interactionFixture();
    const original = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    const { modelHash: _compositionHash, ...compositionTemplate } = f.request
      .composition as ColorSystemModelCompositionRequestV1;
    const templated: ColorSystemAuthoringDirectionV1 = {
      ...f.request,
      composition: { ...compositionTemplate, modelBinding: 'generated-model' },
      interactionGroups: f.request.interactionGroups!.map(group => {
        const { modelHash: _interactionHash, ...request } =
          group.request as import('../colorSystemModelInteractionsV1').ColorSystemModelInteractionsRequestV1;
        return { ...group, request: { ...request, modelBinding: 'generated-model' } };
      }),
    };
    const result = await executeColorSystemAuthoringDirectionV1(f.source, templated, execution);
    expect(result.status).toBe('ready');
    expect(result.composition).toEqual(original.composition);
    expect(result.interactions).toEqual(original.interactions);
    expect(result.candidates).toEqual(original.candidates);
  });

  it('blocks an otherwise complete construction when actual generated members violate an adopted territory', async () => {
    const source = sourceInput();
    const rule: ColorSystemBrandTerritoryRuleV1 = {
      id: 'excluded-territory',
      label: 'Synthetic excluded generated territory',
      kind: 'brand-territory',
      scope: { kind: 'generated-families', prominence: ['supporting'], jobs: 'all', modes: 'all' },
      bounds: {
        hueRanges: [{ minimum: 0, maximum: 360 }],
        chroma: { minimum: 0, maximum: 0.5 },
        lightness: { minimum: 0, maximum: 1 },
      },
      effect: 'exclude',
      origin: 'owner-authored',
      evidenceRefs: ['evidence:rules'],
    };
    const fragment = buildColorSystemBrandConstraintsV1({
      schemaVersion: 'teul.brand-constraints.v1',
      sourceSnapshotHash: source.sources[0].sourceHash,
      rules: [rule],
      decisions: [
        {
          ruleId: rule.id,
          ruleHash: hashColorSystemBrandTerritoryRuleV1(rule),
          status: 'accepted',
          actor: { kind: 'agent', ref: 'fixture-reviewer' },
          authorityRef: 'synthetic:territory',
        },
      ],
    });
    const f = await constructedFixture({
      ...source,
      brandConstraintsByContext: [
        {
          id: 'territory-binding',
          contextIds: ['interface'],
          sourceId: source.sources[0].id,
          fragment,
        },
      ],
    });
    const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    expect(result.composition?.status).toBe('ready');
    expect(result.status).toBe('blocked');
    expect(result.candidates).toEqual([]);
    expect(
      result.assessments[0].blockers.some(item => item.code === 'GENERATION_TERRITORY_BLOCKED')
    ).toBe(true);
    expect(result.assessments[0].territoryChecks[0].failedColorIds).toContain(
      f.preview.generatedBindings[0].colorId
    );
  });

  it('keeps source relationship gating after construction and never fabricates a passing solution', async () => {
    const input = sourceInput();
    const original = syntheticColorSystemModelInputV1().rules[6];
    const rule = {
      ...original,
      kind: 'role-binding' as const,
      operands: { role: 'action', members: [{ kind: 'color' as const, id: 'ink' }] },
    };
    const content = { ...input, rules: [rule] };
    const f = await constructedFixture({
      ...content,
      adoptions: buildColorSystemRuleAdoptionsV1(content, [
        {
          ruleId: rule.id,
          status: 'accepted',
          actor: { kind: 'agent', ref: 'fixture-reviewer' },
          authorityRef: 'synthetic:relationship',
          decisionRef: 'review',
        },
      ]),
    });
    const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    expect(result.status).toBe('infeasible');
    expect(result.candidates).toEqual([]);
    expect(result.assessments).toEqual([]);
    if (!result.composition || result.composition.status === 'cancelled')
      throw new Error('Unexpected result');
    expect(
      result.composition.diagnostics.failures.some(
        item => item.code === 'APPLICATION_POLICY_BLOCKED'
      )
    ).toBe(true);
  });

  it('assesses every generated unit even when the application paints only one member', async () => {
    const f = await constructedFixture();
    const result = await executeColorSystemAuthoringDirectionV1(
      f.source,
      { ...f.request, units: [] },
      execution
    );
    expect(result.status).toBe('blocked');
    expect(result.candidates).toEqual([]);
    expect(result.assessments[0].blockers.some(item => item.code === 'UNSCOPED_ADDITION')).toBe(
      true
    );
  });

  it('materializes actual exact catalog colors and disabling the provider removes that proposal', async () => {
    const f = await catalogFixture();
    const result = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    expect(result.status).toBe('ready');
    expect(result.generation).toEqual({ kind: 'catalog', result: f.preview });
    expect(result.candidates[0].proposal.request.colors).toEqual(f.preview.proposal.request.colors);
    expect(result.candidates[0].proposal.request.colors).toHaveLength(12);
    expect(
      result.candidates[0].applications.applications.every(item =>
        item.application.uses.some(use => use.colorId === f.preview.binding.members[11].colorId)
      )
    ).toBe(true);
    if (f.request.generation.kind !== 'catalog') throw new Error('Unexpected fixture');
    const disabled = await executeColorSystemAuthoringDirectionV1(
      f.source,
      {
        ...f.request,
        generation: {
          ...f.request.generation,
          query: { ...f.request.generation.query, providers: [] },
        },
      },
      execution
    );
    expect(disabled.status).toBe('blocked');
    expect(disabled.candidates).toEqual([]);
    expect(disabled.diagnostics[0].code).toBe('CATALOG_CANDIDATE_UNAVAILABLE');
    const stale = await executeColorSystemAuthoringDirectionV1(
      f.source,
      {
        ...f.request,
        generation: {
          ...f.request.generation,
          query: { ...f.request.generation.query, sourceModelHash: hash('stale') },
        },
      },
      execution
    );
    expect(stale.status).toBe('blocked');
    expect(stale.diagnostics[0].code).toBe('CATALOG_QUERY_BLOCKED');
  });

  it('requires complete requested states and exact locks without silently dropping either', async () => {
    const f = applyFixture();
    const missing = structuredClone(f.request);
    missing.composition.groups[0].options[0].assignments.pop();
    await expect(
      executeColorSystemAuthoringDirectionV1(f.source, missing, execution)
    ).rejects.toThrow('cover every requested actual use');
    const locked = buildColorSystemApplicationRequirementsV1({
      ...f.request.requirements,
      locks: [{ applicationId: 'Day', useId: 'mark', colorId: 'blue-pale' }],
    });
    const result = await executeColorSystemAuthoringDirectionV1(
      f.source,
      { ...f.request, requirements: locked, composition: composition(f.source.modelHash, locked) },
      execution
    );
    expect(result.status).toBe('infeasible');
    expect(result.candidates).toEqual([]);
    if (!result.composition || result.composition.status === 'cancelled')
      throw new Error('Unexpected result');
    expect(
      result.composition.diagnostics.unavailableOptions.some(
        item => item.code === 'COLOR_LOCK_CHANGED'
      )
    ).toBe(true);
  });

  it('forwards incomplete and infeasible construction without attempting a fabricated working model', async () => {
    const f = await constructedFixture();
    if (f.request.generation.kind !== 'construction') throw new Error('Unexpected fixture');
    const generation = f.request.generation;
    const content = mutableCopy(sourceInput());
    const missing = content.colors.find(color => color.id === 'blue-mid')!;
    delete missing.valuesByMode.Day;
    missing.valueGapClaimIdsByMode = { Day: ['gap:blue-mid'] };
    missing.claimIds.push('gap:blue-mid');
    content.claims.push({
      id: 'gap:blue-mid',
      sourceId: missing.sourceId,
      text: 'Missing source channels.',
      status: 'unresolved',
      evidenceRefs: [],
      contextIds: [],
      ruleIds: [],
      modeIds: ['Day'],
    });
    content.coverage[0].unresolvedClaimIds.push('gap:blue-mid');
    const source = buildColorSystemModelV1(content);
    const structureProposal = {
      ...generation.structureProposal!,
      sourceModelHash: source.modelHash,
    };
    const structure = buildColorSystemProposalV1(source, structureProposal);
    const result = await executeColorSystemAuthoringDirectionV1(
      source,
      {
        ...f.request,
        generation: {
          ...generation,
          structureProposal,
          brief: { ...generation.brief, modelHash: structure.workingModel.modelHash },
          intent: { ...generation.intent, sourceModelHash: source.modelHash },
        },
      },
      execution
    );
    expect(result).toMatchObject({
      status: 'incomplete',
      composition: null,
      candidates: [],
      assessments: [],
    });
    const failed = await executeColorSystemAuthoringDirectionV1(
      f.source,
      {
        ...f.request,
        generation: {
          ...generation,
          brief: {
            ...generation.brief,
            scales: generation.brief.scales.map(scale =>
              scale.modeId === 'Day' ? { ...scale, lightnessOrder: 'increasing' } : scale
            ),
          },
        },
      },
      execution
    );
    expect(failed).toMatchObject({
      status: 'infeasible',
      composition: null,
      candidates: [],
      assessments: [],
    });
  });

  it('does not label a missing source mode value or an unfinished search as infeasible', async () => {
    const content = sourceInput();
    const f = applyFixture({
      ...content,
      colors: content.colors.map(color =>
        color.id === 'ink' ? { ...color, valuesByMode: { Day: color.valuesByMode.Day } } : color
      ),
    });
    const missing = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    expect(missing.status).toBe('incomplete');
    expect(missing.candidates).toEqual([]);
    const g = applyFixture();
    g.request.composition = mutableCopy({
      ...composition(g.source.modelHash, g.request.requirements, ['paper', 'ink']),
      maximumNodes: 1,
    });
    const limited = await executeColorSystemAuthoringDirectionV1(g.source, g.request, execution);
    expect(limited.status).toBe('search-limited');
    expect(limited.candidates).toEqual([]);
    expect(limited.assessments).toEqual([]);
  });

  it('rejects stale source, working-model and requirements hashes rather than repairing them', async () => {
    const f = applyFixture();
    if (f.request.generation.kind !== 'apply') throw new Error('Unexpected fixture');
    await expect(
      executeColorSystemAuthoringDirectionV1(
        f.source,
        {
          ...f.request,
          generation: {
            kind: 'apply',
            proposal: { ...f.request.generation.proposal, sourceModelHash: hash('stale') },
          },
        },
        execution
      )
    ).rejects.toThrow('Source model is stale');
    for (const field of ['modelHash', 'requirementsHash'])
      await expect(
        executeColorSystemAuthoringDirectionV1(
          f.source,
          { ...f.request, composition: { ...f.request.composition, [field]: hash('stale') } },
          execution
        )
      ).rejects.toThrow('stale model/requirements');
    const constructed = await constructedFixture();
    await expect(
      executeColorSystemAuthoringDirectionV1(
        constructed.source,
        {
          ...constructed.request,
          composition: {
            ...constructed.request.composition,
            modelHash: constructed.source.modelHash,
          },
        },
        execution
      )
    ).rejects.toThrow('stale model/requirements');
  });

  it('requires apply to be unchanged and rejects caller scores, colors and accessors before hooks', async () => {
    const f = applyFixture();
    const yieldHook = vi.fn(async () => {}),
      isCancelled = vi.fn(() => false);
    const hook = { yield: yieldHook, isCancelled };
    const getter = vi.fn(() => 'ink');
    const accessor = structuredClone(f.request);
    Object.defineProperty(accessor.composition.groups[0].options[0].assignments[0], 'colorId', {
      enumerable: true,
      get: getter,
    });
    for (const incoming of [
      accessor,
      { ...f.request, score: 100 },
      { ...f.request, generation: { ...f.request.generation, colors: [] } },
      { ...f.request, units: [{ id: 'injected', scores: {} }] },
      { ...f.request, composition: { ...f.request.composition, maximumSolutions: 4 } },
    ]) {
      await expect(
        executeColorSystemAuthoringDirectionV1(f.source, incoming, hook)
      ).rejects.toThrow();
    }
    expect(getter).not.toHaveBeenCalled();
    expect(yieldHook).not.toHaveBeenCalled();
    expect(isCancelled).not.toHaveBeenCalled();
    if (f.request.generation.kind !== 'apply') throw new Error('Unexpected fixture');
    const original = f.request.generation.proposal;
    await expect(
      executeColorSystemAuthoringDirectionV1(
        f.source,
        {
          ...f.request,
          generation: {
            kind: 'apply',
            proposal: { ...original, brief: { ...original.brief, operation: 'extend' } },
          },
        },
        execution
      )
    ).rejects.toThrow('unchanged apply operation');
    await expect(
      executeColorSystemAuthoringDirectionV1(
        f.source,
        {
          ...f.request,
          generation: {
            kind: 'apply',
            proposal: {
              ...original,
              colors: [
                {
                  id: 'injected',
                  label: 'Injected',
                  valuesByMode: { Day: f.source.colors[0].valuesByMode.Day },
                },
              ],
            },
          },
        },
        execution
      )
    ).rejects.toThrow('Apply');
  });

  it('isolates source/request mutation during hooks and returned artifacts across exact replay', async () => {
    const f = await catalogFixture();
    const expected = await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution);
    const incoming = structuredClone(f);
    const result = await executeColorSystemAuthoringDirectionV1(incoming.source, incoming.request, {
      ...execution,
      yield: async () => {
        Object.assign(incoming.source.colors[0].valuesByMode.Day.components, { r: 0 });
        Object.assign(incoming.request.composition, { maximumNodes: 1 });
        Object.assign(incoming.request.units[0], { anchors: [] });
      },
    });
    expect(result).toEqual(expected);
    Object.assign(result.candidates[0].proposal.request.colors[0].valuesByMode.Day.components, {
      r: 0,
    });
    Object.assign(result.receipt, { receiptHash: hash('forged') });
    expect(await executeColorSystemAuthoringDirectionV1(f.source, f.request, execution)).toEqual(
      expected
    );
  });

  it('clears all candidates on early, generation-time and post-first-assessment cancellation', async () => {
    const f = applyFixture();
    const early = await executeColorSystemAuthoringDirectionV1(f.source, f.request, {
      isCancelled: () => true,
      yield: async () => {},
    });
    expect(early).toMatchObject({
      status: 'cancelled',
      generation: null,
      composition: null,
      candidates: [],
      assessments: [],
    });
    const catalog = await catalogFixture();
    let cancelled = false;
    const during = await executeColorSystemAuthoringDirectionV1(catalog.source, catalog.request, {
      isCancelled: () => cancelled,
      yield: async () => {
        cancelled = true;
      },
    });
    expect(during).toMatchObject({
      status: 'cancelled',
      generation: null,
      composition: null,
      candidates: [],
      assessments: [],
    });
    f.request.composition = mutableCopy(
      composition(f.source.modelHash, f.request.requirements, ['ink', 'blue-deep'])
    );
    let yields = 0;
    const late = await executeColorSystemAuthoringDirectionV1(f.source, f.request, {
      isCancelled: () => yields >= 5,
      yield: async () => {
        yields++;
      },
    });
    expect(yields).toBe(5);
    expect(late).toMatchObject({
      status: 'cancelled',
      generation: null,
      composition: null,
      candidates: [],
      assessments: [],
    });
    expect(late.receipt.assessmentHashes).toEqual([]);
  });
});
