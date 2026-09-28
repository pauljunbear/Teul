/**
 * p3-C test helper: drives the generic builder end to end (snapshot → intent
 * proposal → owner confirmation → policy handoff → orchestrator) for two
 * synthetic brands, so naming and export tests assert against the compiler's
 * real output rather than hand-built blueprints. The brands mirror the
 * orchestrator suite's fixtures: a blue Primary with black/white text colors,
 * and a forest Primary with Gold and Terracotta secondaries on warm paper.
 * P4-C: `orchestrateGenericSourceInput` runs the same chain over any recorded
 * snapshot input, such as the repository's Kestrel fixture.
 */
import {
  COLOR_SYSTEM_BUILDER_RECOMMENDATION_POLICY_V2_VERSION,
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
  type ColorSystemBuilderRecommendationObjectiveV2,
} from '../../colorSystemBuilderOrchestratorV2';
import { canonicalJson, deterministicContentHash } from '../../colorSystemHashing';
import {
  buildColorSystemBrandConstraintsV1,
  type ColorSystemBrandTerritoryRuleV1,
} from '../../colorSystemBrandConstraintsV1';
import {
  buildColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotInputV2,
  type GenericColorValueV2,
} from '../../colorSystemGenericSourceAdapterV2';
import {
  COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
  COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
  buildColorSystemGenericIntentProposalV2,
  buildColorSystemGenericOwnerConfirmationV2,
  type GenericConfirmedSectionDecisionV2,
} from '../../colorSystemGenericIntentPolicyV2';
import { compileColorSystemGenericPolicyHandoffV2 } from '../../colorSystemGenericPolicyHandoffV2';

export interface GenericBrandFixture {
  primary: string;
  primaryDark: string;
  secondaries: readonly { name: string; hex: string }[];
  ink: string;
  paper: string;
}

/** The generic builder's minimum: a chromatic Primary and two exact neutrals. */
export const GENERIC_BRAND: GenericBrandFixture = {
  primary: '#3366CC',
  primaryDark: '#6699FF',
  secondaries: [],
  ink: '#000000',
  paper: '#FFFFFF',
};

/** Forest, gold and terracotta on warm paper: the compiler's Brand B fixture. */
export const BRAND_B: GenericBrandFixture = {
  primary: '#1F6F50',
  primaryDark: '#1F6F50',
  secondaries: [
    { name: 'Gold', hex: '#D9A441' },
    { name: 'Terracotta', hex: '#B5533C' },
  ],
  ink: '#2B2622',
  paper: '#F5EFE6',
};

function color(red: number, green: number, blue: number): GenericColorValueV2 {
  const channel = (value: number): number => value / 255;
  return {
    colorSpace: 'srgb',
    components: [channel(red), channel(green), channel(blue)],
    alpha: 1,
  };
}

function hexColor(hex: string): GenericColorValueV2 {
  const clean = hex.replace('#', '');
  return color(
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  );
}

function variable(
  variableId: string,
  name: string,
  light: GenericColorValueV2,
  dark: GenericColorValueV2,
  scopes: readonly string[]
) {
  return {
    variableId,
    name,
    description: name,
    collectionId: 'collection:colors',
    scopes: [...scopes],
    valuesByMode: [
      {
        modeId: 'mode:light',
        modeName: 'Light',
        rawValue: { kind: 'color' as const, value: light },
        resolution: 'literal' as const,
      },
      {
        modeId: 'mode:dark',
        modeName: 'Dark',
        rawValue: { kind: 'color' as const, value: dark },
        resolution: 'literal' as const,
      },
    ],
    evidenceIds: ['evidence:variables'],
  };
}

export function genericBrandSourceInput(
  brand: GenericBrandFixture
): ColorSystemGenericSourceSnapshotInputV2 {
  return {
    capturedAt: '2026-08-21T13:00:00.000Z',
    scope: {
      kind: 'current-file',
      usageScope: 'whole-file',
      selectedNodeIds: [],
      loadedPageIds: ['page:colors'],
      excludedPageIds: [],
      coverage: 'complete-supported-scope',
    },
    documentProfile: 'srgb',
    collections: [
      {
        collectionId: 'collection:colors',
        name: 'Colors',
        defaultModeId: 'mode:light',
        modes: [
          { collectionId: 'collection:colors', modeId: 'mode:light', name: 'Light', order: 1 },
          { collectionId: 'collection:colors', modeId: 'mode:dark', name: 'Dark', order: 2 },
        ],
      },
    ],
    variables: [
      variable(
        'variable:brand-primary',
        'Primary / Brand',
        hexColor(brand.primary),
        hexColor(brand.primaryDark),
        ['ALL_FILLS']
      ),
      ...brand.secondaries.map((entry, index) =>
        variable(
          `variable:secondary-${index + 1}`,
          `Secondary / ${entry.name}`,
          hexColor(entry.hex),
          hexColor(entry.hex),
          ['ALL_FILLS']
        )
      ),
      variable('variable:text-ink', 'Text / Ink', hexColor(brand.ink), hexColor(brand.paper), [
        'TEXT_FILL',
      ]),
      variable(
        'variable:text-surface',
        'Text / Surface',
        hexColor(brand.paper),
        hexColor(brand.ink),
        ['ALL_FILLS']
      ),
    ],
    paintStyles: [],
    paletteStructures: [],
    usageEvidence: [],
    unsupported: [],
    evidence: [
      {
        evidenceId: 'evidence:variables',
        kind: 'figma-resource',
        locator: 'figma://local-variables',
      },
    ],
    enabledLibraryDescriptors: [],
    libraryBoundaryNote: 'No remote library values were imported.',
    scannedNodeCount: 1,
    cancelled: false,
    partial: false,
  };
}

export function chainFromInput(
  input: ColorSystemGenericSourceSnapshotInputV2,
  brandRules?: readonly ColorSystemBrandTerritoryRuleV1[]
) {
  const snapshot = buildColorSystemGenericSourceSnapshotV2(input);
  const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
  const displayedConstraints =
    brandRules === undefined
      ? undefined
      : buildColorSystemBrandConstraintsV1({
          schemaVersion: 'teul.brand-constraints.v1',
          sourceSnapshotHash: snapshot.sourceSnapshotHash,
          rules: brandRules,
          decisions: [],
        });
  const sectionDecisions = proposal.sections.map(section => ({
    role: section.role,
    order: section.order,
    disposition: section.disposition,
    jobs: section.jobs,
    sourceRefIds: section.sourceRefIds,
    status: 'owner-confirmed' as const,
    evidenceIds: [`owner-decision:${section.role}`],
  })) as GenericConfirmedSectionDecisionV2[];
  const displayedPlan = {
    kind: 'generic-plan-wire',
    sections: proposal.sections,
    generationPolicyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
    contributionIds: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
    ...(displayedConstraints ? { reviewedBrandConstraints: displayedConstraints } : {}),
  };
  const confirmation = buildColorSystemGenericOwnerConfirmationV2(snapshot, proposal, {
    displayedSections: proposal.sections,
    displayedPlanHash: deterministicContentHash(displayedPlan),
    displayedPlanJson: canonicalJson(displayedPlan),
    sectionDecisions,
    ...(displayedConstraints
      ? {
          reviewedBrandConstraints: buildColorSystemBrandConstraintsV1({
            schemaVersion: displayedConstraints.schemaVersion,
            sourceSnapshotHash: snapshot.sourceSnapshotHash,
            rules: displayedConstraints.rules,
            decisions: displayedConstraints.rules.map(rule => ({
              ruleId: rule.id,
              ruleHash: deterministicContentHash(rule),
              status: 'accepted',
              actor: { kind: 'agent', ref: 'test-agent' },
              authorityRef: 'test:authorized-local-evaluation',
            })),
          }),
        }
      : {}),
    ownerEditedRoles: [],
    generatedPolarity: {
      policyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
      negativeContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[1],
      positiveContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[4],
      status: 'owner-confirmed' as const,
      evidenceIds: ['owner-decision:generated-diverging-polarity'],
    },
    acknowledgedGapIds: [
      ...proposal.unsupported,
      ...proposal.contradictions,
      ...proposal.insufficiencies,
    ].map(gap => gap.gapId),
    confirmedAt: '2026-08-21T14:00:00.000Z',
  });
  const handoff = compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, confirmation);
  return { snapshot, proposal, confirmation, handoff };
}

/**
 * Runs the whole generic pipeline over a recorded snapshot input and returns the
 * orchestrator result. `categoricalMarkCount` defaults to the brand helper's 5.
 */
export function orchestrateGenericSourceInput(
  input: ColorSystemGenericSourceSnapshotInputV2,
  objective: ColorSystemBuilderRecommendationObjectiveV2 = 'general-product-system',
  application: {
    categoricalMarkCount?: number;
    brandRules?: readonly ColorSystemBrandTerritoryRuleV1[];
  } = {}
) {
  const source = chainFromInput(input, application.brandRules);
  const orchestratorInput = buildColorSystemGenericBuilderOrchestratorV2Input(
    source.snapshot,
    source.proposal,
    source.confirmation,
    source.handoff,
    {
      application: {
        applicationMode: 'Light',
        surfaceContext: 'light',
        categoricalMarkCount: application.categoricalMarkCount ?? 5,
        sequentialMarkCount: 5,
        divergingMarkCount: 3,
      },
      recommendation: {
        version: COLOR_SYSTEM_BUILDER_RECOMMENDATION_POLICY_V2_VERSION,
        objective,
        authority: 'owner-confirmed',
        evidenceIds: ['owner-decision:recommendation-objective'],
      },
    }
  );
  return buildColorSystemGenericBuilderOrchestratorV2(orchestratorInput);
}

/** Runs the whole generic pipeline for a synthetic brand and returns the orchestrator result. */
export function orchestrateGenericBrand(
  brand: GenericBrandFixture = GENERIC_BRAND,
  objective: ColorSystemBuilderRecommendationObjectiveV2 = 'general-product-system'
) {
  return orchestrateGenericSourceInput(genericBrandSourceInput(brand), objective);
}

export type GenericReadyDirection = Extract<
  ReturnType<typeof orchestrateGenericBrand>['directions'][number],
  { status: 'ready' }
>;

/** Every ready direction of a brand, keyed by direction ID. */
export function readyDirections(
  result: ReturnType<typeof orchestrateGenericBrand>
): Map<string, GenericReadyDirection> {
  const directions = new Map<string, GenericReadyDirection>();
  for (const direction of result.directions) {
    if (direction.status !== 'ready') {
      throw new Error(`Direction ${direction.directionId} blocked: ${canonicalJson(direction)}`);
    }
    directions.set(direction.directionId, direction);
  }
  return directions;
}
