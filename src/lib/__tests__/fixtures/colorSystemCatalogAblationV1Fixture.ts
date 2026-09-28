/** Invented source brief: inspect every member of a proposed supporting palette on readable cards. */
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemScopedRuleV1,
} from '../../colorSystemModelV1';
import {
  compileColorSystemCatalogProposalV1,
  type ColorSystemCatalogProposalIntentV1,
  type ColorSystemCatalogProposalRequestV1,
} from '../../colorSystemCatalogProposalV1';
import { buildColorSystemApplicationRequirementsV1 } from '../../colorSystemApplicationRequirementsV1';
import type { ColorSystemAuthoringDirectionV1 } from '../../colorSystemAuthoringExecutionV1';
import { canonicalJson, deterministicContentHash } from '../../colorSystemHashing';
import {
  buildColorSystemSrgbValueV1,
  colorSystemExactSrgbValueHashV1,
} from '../../colorSystemSrgbValueV1';
import { syntheticColorSystemModelInputV1 } from './colorSystemModelV1Fixture';

const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
export async function catalogAblationFixtureV1() {
  const initial = syntheticColorSystemModelInputV1();
  const rules: ColorSystemScopedRuleV1[] = [
    {
      ...initial.rules[0],
      id: 'rule:readable-labels',
      label: 'Labels retain the two source neutrals',
      kind: 'role-binding',
      contextIds: ['interface'],
      operands: {
        role: 'label',
        members: [
          { kind: 'color', id: 'ink' },
          { kind: 'color', id: 'paper' },
        ],
      },
    },
  ];
  const input = {
    ...initial,
    rules,
    adoptions: [],
    colors: initial.colors.map(color =>
      color.id === 'paper' || color.id === 'ink'
        ? {
            ...color,
            valuesByMode: Object.fromEntries(
              ['Day', 'Night'].map(mode => [
                mode,
                buildColorSystemSrgbValueV1(
                  Object.fromEntries(
                    ['r', 'g', 'b'].map(channel => [channel, color.id === 'paper' ? 1 : 0])
                  ) as { r: number; g: number; b: number }
                ),
              ])
            ),
          }
        : color
    ),
    claims: initial.claims.map(claim => ({
      ...claim,
      ruleIds: claim.id === 'claim:rules' ? rules.map(rule => rule.id) : [],
    })),
  };
  const model = buildColorSystemModelV1({
    ...input,
    adoptions: buildColorSystemRuleAdoptionsV1(input, [
      {
        ruleId: rules[0].id,
        status: 'accepted',
        actor: { kind: 'agent', ref: 'synthetic-ablation-author' },
        authorityRef: 'synthetic:catalog-ablation',
        decisionRef: 'synthetic:fixed-source-label-rule',
      },
    ]),
  });
  const query: ColorSystemCatalogProposalRequestV1 = {
    version: 'teul.catalog-proposal.v1',
    sourceModelHash: model.modelHash,
    contextId: 'interface',
    anchorRefs: ['blue-deep', 'warm'].flatMap(colorId =>
      ['Day', 'Night'].map(modeId => {
        const value = model.colors.find(color => color.id === colorId)!.valuesByMode[modeId];
        return {
          colorId,
          modeId,
          valueHash: colorSystemExactSrgbValueHashV1(value.components, value.alpha),
        };
      })
    ),
    providers: ['wada', 'werner', 'radix'],
    limitPerProvider: 1,
    radix: {
      category: 'accent',
      modes: [
        { modeId: 'Day', scheme: 'light' },
        { modeId: 'Night', scheme: 'dark' },
      ],
    },
    historicalModes: [
      { modeId: 'Day', sourceMode: 'static' },
      { modeId: 'Night', sourceMode: 'static' },
    ],
  };
  const intent: ColorSystemCatalogProposalIntentV1 = {
    version: 'teul.catalog-proposal.v1',
    id: 'catalog-ablation',
    sourceModelHash: model.modelHash,
    brief: {
      briefHash: hash(
        'Inspect the whole supporting palette in both named modes. Every label passes 4.5:1 using exact source black or white.'
      ),
      operation: 'extend',
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
  };
  const catalog = await compileColorSystemCatalogProposalV1(model, query, {
    isCancelled: () => false,
    yield: async () => {},
  });
  if (catalog.status !== 'ready') throw new Error(JSON.stringify(catalog));
  const cases = catalog.retrieval.candidates.map(candidate => {
    const materialized = catalog.materialize(candidate.id, intent);
    const templates = ['Day', 'Night'].flatMap(modeId =>
      materialized.binding.members.map((member, index) => ({
        id: `${modeId}:${index}`,
        contextId: 'interface',
        modeId,
        uses: [
          { id: 'ground', role: 'supporting-swatch', area: 120 * 80 },
          { id: 'label', role: 'label', area: 600 },
        ],
        pairs: [
          {
            id: 'label-on-swatch',
            foregroundUseId: 'label',
            backgroundUseId: 'ground',
            contrast: { minimum: 4.5, assessment: 'required' as const },
          },
        ],
      }))
    );
    const requirements = buildColorSystemApplicationRequirementsV1({
      schemaVersion: 'teul.application-requirements.v1',
      templates,
      distinctions: [],
    });
    const direction: ColorSystemAuthoringDirectionV1 = {
      version: 'teul.authoring-direction.v1',
      id: `catalog:${candidate.provider}`,
      generation: { kind: 'catalog', query, candidateId: candidate.id, intent },
      requirements,
      composition: {
        version: 'teul.model-composition.v1',
        modelHash: materialized.proposal.workingModel.modelHash,
        requirementsHash: hash(requirements),
        maximumNodes: 4096,
        maximumSolutions: 1,
        groups: templates.map((template, index) => ({
          id: template.id,
          options: ['ink', 'paper'].map(label => ({
            id: label,
            assignments: [
              {
                applicationId: template.id,
                useId: 'ground',
                colorId:
                  materialized.binding.members[index % materialized.binding.members.length].colorId,
              },
              { applicationId: template.id, useId: 'label', colorId: label },
            ],
          })),
        })),
      },
      units: [
        {
          id: `unit:${candidate.provider}`,
          contextId: 'interface',
          familyId: materialized.binding.familyId,
          ...(materialized.binding.scaleId ? { scaleId: materialized.binding.scaleId } : {}),
          prominence: 'supporting',
          jobs: ['marketing-accent'],
          anchors: ['Day', 'Night'].map(modeId => ({
            modeId,
            colorId:
              materialized.binding.members[candidate.kind === 'radix-family' ? 8 : 0].colorId,
          })),
        },
      ],
    };
    return { candidate, materialized, direction };
  });
  return { model, query, intent, catalog, cases };
}
