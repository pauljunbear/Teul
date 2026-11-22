/** Invented technical fixture. Actual catalog, overlay and execution APIs; no private source data. */
import { buildColorSystemModelV1 } from '../../colorSystemModelV1';
import { syntheticColorSystemModelInputV1 } from './colorSystemModelV1Fixture';
import {
  buildColorSystemOverlayProposalV1,
  COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION,
  type ColorSystemOverlayProposalRequestV1,
} from '../../colorSystemOverlayProposalV1';
import { COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA } from '../../colorSystemConstructionV1';
import { COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION } from '../../colorSystemConstructionProposalV1';
import {
  compileColorSystemCatalogProposalV1,
  COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
} from '../../colorSystemCatalogProposalV1';
import { COLOR_SYSTEM_PROPOSAL_V1_VERSION } from '../../colorSystemProposalV1';
import { colorSystemExactSrgbValueHashV1 } from '../../colorSystemSrgbValueV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
} from '../../colorSystemApplicationRequirementsV1';
import { COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION } from '../../colorSystemModelCompositionV1';
import {
  executeColorSystemAuthoringDirectionV1,
  COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
  type ColorSystemAuthoringDirectionV1,
} from '../../colorSystemAuthoringExecutionV1';
import { parseColorSystemRecipeV1, COLOR_SYSTEM_RECIPE_V1_SCHEMA } from '../../colorSystemRecipeV1';
import { buildColorSystemDesignContentV1 } from '../../colorSystemDesignContentV1';
import { canonicalJson, deterministicContentHash } from '../../colorSystemHashing';

const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const runtime = { isCancelled: () => false, yield: async () => {} };
const decision = {
  actor: { kind: 'user' as const, ref: 'synthetic:designer' },
  authorityRef: 'synthetic:local-review',
  decisionRef: 'synthetic:control-review',
};

export async function syntheticColorSystemAuthoringRefinementFixtureV1(
  provider: 'werner' | 'radix' = 'werner',
  catalogRule = false,
  rejectedRule = false,
  accentContext: 'interface' | 'communications' = 'interface'
) {
  const original = syntheticColorSystemModelInputV1();
  const source = buildColorSystemModelV1({
    ...original,
    rules: [],
    adoptions: [],
    claims: original.claims.map(claim => ({ ...claim, ruleIds: [] })),
    scales: original.scales.map(scale =>
      scale.id === 'blue-scale'
        ? {
            ...scale,
            slots: [...scale.slots, { id: 'gap', position: 1.5 }].sort(
              (a, b) => a.position - b.position
            ),
          }
        : scale
    ),
  });
  const brief: ColorSystemOverlayProposalRequestV1['brief'] = {
    briefHash: hash('explicit synthetic combined brief'),
    operation: 'extend',
    contextIds: accentContext === 'interface' ? ['interface'] : ['interface', 'communications'],
    modeIds: ['Day', 'Night'],
    permissions: {
      addColors: true,
      addFamilies: true,
      addScales: true,
      addRules: true,
      editFamilyIds: ['pigments'],
      editScaleIds: ['blue-scale'],
      replaceRuleIds: [],
    },
  };
  const query = {
    version: COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
    sourceModelHash: source.modelHash,
    contextId: accentContext,
    providers: [provider],
    limitPerProvider: 2,
    anchorRefs: ['Day', 'Night'].map(modeId => {
      const value = source.colors.find(color => color.id === 'warm')!.valuesByMode[modeId];
      return {
        colorId: 'warm',
        modeId,
        valueHash: colorSystemExactSrgbValueHashV1(value.components, value.alpha),
      };
    }),
    ...(provider === 'radix'
      ? {
          radix: {
            category: 'accent' as const,
            modes: [
              { modeId: 'Day', scheme: 'light' as const },
              { modeId: 'Night', scheme: 'dark' as const },
            ],
          },
        }
      : {
          historicalModes: ['Day', 'Night'].map(modeId => ({
            modeId,
            sourceMode: 'static' as const,
          })),
        }),
  };
  const retrieval = await compileColorSystemCatalogProposalV1(source, query, runtime);
  if (retrieval.status !== 'ready') throw new Error('Expected actual catalog results.');
  const intent = {
    version: COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
    id: 'synthetic-accent',
    sourceModelHash: source.modelHash,
    brief: { ...brief, contextIds: [accentContext] },
  };
  const catalog = retrieval.materialize(retrieval.retrieval.candidates[0].id, intent);
  const member =
    catalog.binding.members.find(item => item.slotId === 'step:9') ?? catalog.binding.members[0];
  const overlay: ColorSystemOverlayProposalRequestV1 = {
    version: COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION,
    id: 'synthetic-refinement',
    sourceModelHash: source.modelHash,
    brief,
    fragments: [
      {
        id: 'control',
        kind: 'construction',
        brief: {
          schemaVersion: COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
          modelHash: source.modelHash,
          contextId: 'interface',
          changeMode: 'extend',
          decision,
          scales: ['Day', 'Night'].map(modeId => ({
            scaleId: 'blue-scale',
            modeId,
            requiredSlotIds: ['gap'],
            fillSlotIds: ['gap'],
            lightnessOrder: 'none',
            endpoints: [],
          })),
        },
        intent: {
          version: COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
          id: 'synthetic-control',
          sourceModelHash: source.modelHash,
          brief: { ...brief, contextIds: ['interface'] },
        },
      },
      { id: 'accent', kind: 'catalog', query, candidateId: catalog.binding.candidateId, intent },
      {
        id: 'policy',
        kind: 'rules',
        proposal: {
          version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
          id: 'synthetic-control-rule',
          sourceModelHash: source.modelHash,
          brief,
          derivation: {
            algorithmId: 'synthetic-explicit-rule',
            algorithmVersion: '1',
            policyHash: hash('role-policy'),
            inputHash: hash('role-input'),
            sourceColorIds: [],
            sourceScaleIds: ['blue-scale'],
          },
          colors: [],
          families: [],
          scales: [],
          exceptions: [],
          rules: [
            {
              id: 'rule:control',
              label: 'Retain control family',
              kind: 'role-binding',
              force: 'requirement',
              contextIds: ['interface'],
              modeIds: ['Day', 'Night'],
              operands: { role: 'control', members: [{ kind: 'family', id: 'pigments' }] },
            },
            ...(catalogRule
              ? [
                  {
                    id: 'rule:accent',
                    label: 'Declared accent family',
                    kind: 'role-binding' as const,
                    force: 'requirement' as const,
                    contextIds: [accentContext],
                    modeIds: ['Day', 'Night'],
                    operands: {
                      role: 'accent',
                      members: [{ kind: 'family' as const, id: catalog.binding.familyId }],
                    },
                  },
                ]
              : []),
            ...(rejectedRule
              ? [
                  {
                    id: 'rule:rejected',
                    label: 'Previously rejected working choice',
                    kind: 'role-binding' as const,
                    force: 'requirement' as const,
                    contextIds: ['interface'],
                    modeIds: ['Day', 'Night'],
                    operands: {
                      role: 'control',
                      members: [{ kind: 'color' as const, id: 'paper' }],
                    },
                  },
                ]
              : []),
          ],
        },
      },
    ],
  };
  const draft = await buildColorSystemOverlayProposalV1(source, overlay, runtime);
  const reviewed = {
    ...overlay,
    review: {
      reviewedProposalHash: draft.proposal!.proposalHash,
      decisions: draft.proposal!.pendingRuleIds.map(ruleId => ({
        ruleId,
        status: ruleId === 'rule:rejected' ? ('rejected' as const) : ('accepted' as const),
        ...decision,
      })),
    },
  };
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: ['Day', 'Night'].flatMap(modeId => [
      {
        id: `app:${modeId}`,
        contextId: 'interface',
        modeId,
        uses: [
          { id: 'ground', role: 'ground' },
          { id: 'control', role: 'control' },
          ...(accentContext === 'interface' ? [{ id: 'accent', role: 'accent' }] : []),
        ],
        pairs: [
          {
            id: 'control-on-ground',
            foregroundUseId: 'control',
            backgroundUseId: 'ground',
            contrast: { minimum: 4.5, assessment: 'required' },
          },
          ...(accentContext === 'interface'
            ? [
                {
                  id: 'accent-on-ground',
                  foregroundUseId: 'accent',
                  backgroundUseId: 'ground',
                  contrast: { minimum: 3, assessment: 'advisory' as const },
                },
              ]
            : []),
        ],
      },
      ...(accentContext === 'communications'
        ? [
            {
              id: `accent:${modeId}`,
              contextId: accentContext,
              modeId,
              uses: [
                { id: 'ground', role: 'ground' },
                { id: 'accent', role: 'accent' },
              ],
              pairs: [
                {
                  id: 'accent-on-ground',
                  foregroundUseId: 'accent',
                  backgroundUseId: 'ground',
                  contrast: { minimum: 3, assessment: 'advisory' as const },
                },
              ],
            },
          ]
        : []),
    ]),
    distinctions: [],
  });
  const direction: ColorSystemAuthoringDirectionV1 = {
    version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
    id: 'synthetic-refinement',
    generation: { kind: 'overlay', proposal: reviewed },
    requirements,
    composition: {
      version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
      modelBinding: 'generated-model',
      requirementsHash: hash(requirements),
      maximumNodes: 64,
      maximumSolutions: 1,
      groups: [
        {
          id: 'paint',
          options: [
            {
              id: 'chosen',
              assignments: requirements.templates.flatMap(template =>
                template.uses.map(paintUse => ({
                  applicationId: template.id,
                  useId: paintUse.id,
                  colorId:
                    paintUse.id === 'ground'
                      ? 'paper'
                      : paintUse.id === 'control'
                        ? 'blue-deep'
                        : member.colorId,
                }))
              ),
            },
          ],
        },
      ],
    },
    units: [
      {
        id: 'control',
        contextId: 'interface',
        familyId: 'pigments',
        scaleId: 'blue-scale',
        prominence: 'supporting',
        jobs: ['product-semantics'],
        anchors: ['Day', 'Night'].map(modeId => ({ modeId, colorId: 'blue-deep' })),
      },
      {
        id: 'accent',
        contextId: accentContext,
        familyId: catalog.binding.familyId,
        ...(catalog.binding.scaleId ? { scaleId: catalog.binding.scaleId } : {}),
        prominence: 'accent' as const,
        jobs: ['product-graphics' as const],
        anchors: ['Day', 'Night'].map(modeId => ({ modeId, colorId: member.colorId })),
      },
    ],
  };
  const executed = await executeColorSystemAuthoringDirectionV1(source, direction, runtime);
  if (executed.status !== 'ready') throw new Error(`Fixture failed: ${executed.status}`);
  const selected = executed.candidates[0],
    applications = selected.applications.applications.map(app => app.application);
  const recipe = parseColorSystemRecipeV1({
    schemaVersion: COLOR_SYSTEM_RECIPE_V1_SCHEMA,
    id: 'synthetic-refinement',
    label: 'Synthetic refinement',
    source: { model: source, intake: 'guideline-json' },
    direction,
    selection: {
      model: selected.proposal.workingModel,
      applications,
      contentHash: buildColorSystemDesignContentV1(selected.proposal.workingModel, applications)
        .contentHash,
      executionReceiptHash: executed.receipt.receiptHash,
    },
    locks: [],
  });
  return { recipe, source, direction, member, binding: catalog.binding, executed };
}
