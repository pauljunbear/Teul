import {
  composeColorSystemApplicationBlueprintV2,
  type ColorSystemApplicationComposerBlockerV2,
  type ColorSystemApplicationComposerOptionsV2,
} from './colorSystemApplicationComposerV2';
import type {
  ColorSystemApplicationSystemBlueprintV2,
  ColorSystemSectionBlueprintV2,
} from './colorSystemApplicationBlueprintV2';
import { deterministicContentHash } from './colorSystemAudit';
import type {
  ColorSystemBuilderBriefV2,
  ColorSystemJobV2,
  ColorSystemStrategyCandidateV2,
  ColorSystemStrategySetV2,
} from './colorSystemBuilderV2Contracts';
import {
  buildColorSystemPresentationProfileV2,
  type BuildColorSystemPresentationProfileV2Input,
  type ColorSystemPresentationProfileV2,
} from './colorSystemPresentationProfileV2';
import {
  buildColorSystemResourceBlueprintV2,
  type ColorSystemResourceBlueprintV2,
} from './colorSystemResourceBlueprintV2';
import {
  buildColorSystemReviewModelV2,
  type ColorSystemReviewModelV2,
} from './colorSystemReviewModelV2';
import { buildColorSystemSecondaryStrategySetV2 } from './colorSystemSecondaryEngineV2';
import { composeColorSystemSectionBlueprintV2 } from './colorSystemSectionComposerV2';
import {
  buildColorSystemGenericPresentationProfileV2,
  compileColorSystemGenericPolicyHandoffSourceV2,
  compileColorSystemSourceV2,
  type CompileColorSystemGenericPolicyHandoffSourceV2Input,
  type CompileColorSystemSourceV2Input,
  type ColorSystemSourceCompilerV2Result,
} from './colorSystemSourceCompilerV2';
import type { ColorSystemGenericSourceSnapshotV2 } from './colorSystemGenericSourceAdapterV2';
import type {
  GenericIntakeProposalV2,
  GenericOwnerConfirmationV2,
} from './colorSystemGenericIntentPolicyV2';
import type { ColorSystemGenericPolicyHandoffV2 } from './colorSystemGenericPolicyHandoffV2';
import { compareText } from './utils';

export const COLOR_SYSTEM_BUILDER_ORCHESTRATOR_V2_VERSION =
  'teul-color-system-builder-orchestrator/v2' as const;
export const COLOR_SYSTEM_BUILDER_RECOMMENDATION_POLICY_V2_VERSION =
  'teul-color-system-recommendation-policy/v2' as const;
export const COLOR_SYSTEM_GENERIC_BUILDER_ORCHESTRATOR_INPUT_V2_VERSION =
  'teul-color-system-generic-builder-input/v1' as const;

export type ColorSystemBuilderRecommendationObjectiveV2 =
  | 'general-product-system'
  | 'data-visualization-dominant'
  | 'source-continuity-dominant';

export interface ColorSystemBuilderRecommendationPolicyV2 {
  version: typeof COLOR_SYSTEM_BUILDER_RECOMMENDATION_POLICY_V2_VERSION;
  objective: ColorSystemBuilderRecommendationObjectiveV2;
  authority: 'owner-confirmed' | 'teul-policy-default';
  evidenceIds: readonly string[];
}

export interface ColorSystemBuilderOrchestratorV2Input {
  presentation: BuildColorSystemPresentationProfileV2Input;
  source: CompileColorSystemSourceV2Input;
  application?: ColorSystemApplicationComposerOptionsV2;
  resource: {
    compilerVersion: string;
    systemId: string;
    outputName: string;
  };
  recommendation: ColorSystemBuilderRecommendationPolicyV2;
  maximumDirections?: 1 | 2 | 3;
}

interface ColorSystemBuilderOrchestratorExecutionV2 {
  application?: ColorSystemApplicationComposerOptionsV2;
  resource: ColorSystemBuilderOrchestratorV2Input['resource'];
  recommendation: ColorSystemBuilderRecommendationPolicyV2;
  maximumDirections?: 1 | 2 | 3;
}

export interface ColorSystemGenericBuilderOrchestratorV2Input extends ColorSystemBuilderOrchestratorExecutionV2 {
  version: typeof COLOR_SYSTEM_GENERIC_BUILDER_ORCHESTRATOR_INPUT_V2_VERSION;
  source: CompileColorSystemGenericPolicyHandoffSourceV2Input;
  inputHash: string;
}

export interface BuildColorSystemGenericBuilderOrchestratorV2InputOptions {
  application?: ColorSystemApplicationComposerOptionsV2;
  resource?: Partial<ColorSystemBuilderOrchestratorV2Input['resource']>;
  recommendation?: ColorSystemBuilderRecommendationPolicyV2;
  maximumDirections?: 1 | 2 | 3;
}

export type ColorSystemBuilderOrchestratorStageV2 =
  | 'presentation'
  | 'source'
  | 'secondary'
  | 'application'
  | 'section'
  | 'resource'
  | 'review';

export interface ColorSystemBuilderOrchestratorBlockerV2 {
  stage: ColorSystemBuilderOrchestratorStageV2;
  code: string;
  message: string;
}

export interface ColorSystemBuilderHashChainV2 {
  sourceAuthorityHash: string;
  sourcePackageHash: string;
  presentationProfileHash: string;
  briefHash: string;
  strategySetHash: string;
  candidateHash: string;
  applicationBlueprintHash: string;
  sectionBlueprintHash: string;
  resourceBlueprintHash: string;
  reviewModelHash: string;
}

export interface ColorSystemBuilderReadyDirectionV2 {
  status: 'ready';
  directionId: string;
  directionLabel: string;
  candidate: ColorSystemStrategyCandidateV2;
  application: ColorSystemApplicationSystemBlueprintV2;
  section: ColorSystemSectionBlueprintV2;
  resource: ColorSystemResourceBlueprintV2;
  review: ColorSystemReviewModelV2;
  hashChain: ColorSystemBuilderHashChainV2;
  recommendationEvidence: ColorSystemBuilderRecommendationEvidenceV2;
  blockers: readonly [];
  directionHash: string;
}

export interface ColorSystemBuilderBlockedDirectionV2 {
  status: 'blocked';
  directionId: string;
  directionLabel: string;
  candidate: ColorSystemStrategyCandidateV2;
  application: ColorSystemApplicationSystemBlueprintV2 | null;
  section: null;
  resource: null;
  review: null;
  hashChain: null;
  blockers: readonly ColorSystemBuilderOrchestratorBlockerV2[];
  directionHash: string;
}

export type ColorSystemBuilderDirectionV2 =
  | ColorSystemBuilderReadyDirectionV2
  | ColorSystemBuilderBlockedDirectionV2;

export interface ColorSystemBuilderRecommendationV2 {
  directionId: string;
  label: string;
  basis: string;
  policy: ColorSystemBuilderRecommendationPolicyV2;
  evidence: ColorSystemBuilderRecommendationEvidenceV2;
  authority: 'teul-recommendation';
  ownerAcceptance: false;
}

export interface ColorSystemBuilderRecommendationEvidenceV2 {
  requiredPairsPassing: number;
  productSemanticsPassing: number;
  productGraphicsPassing: number;
  objectiveFit: 1 | 2 | 3;
  minimumModeledChartSeparation: number;
}

interface ColorSystemBuilderOrchestratorBaseV2 {
  version: typeof COLOR_SYSTEM_BUILDER_ORCHESTRATOR_V2_VERSION;
  mutatesFigma: false;
  legacyV1AcceptanceUsed: false;
  presentationProfile: ColorSystemPresentationProfileV2 | null;
  sourceCompilation: Extract<ColorSystemSourceCompilerV2Result, { status: 'ready' }> | null;
  brief: ColorSystemBuilderBriefV2 | null;
  strategySet: ColorSystemStrategySetV2 | null;
  directions: readonly ColorSystemBuilderDirectionV2[];
  recommendedDirection: ColorSystemBuilderRecommendationV2 | null;
  blockers: readonly ColorSystemBuilderOrchestratorBlockerV2[];
  orchestratorHash: string;
}

export type ColorSystemBuilderOrchestratorV2Result =
  | (ColorSystemBuilderOrchestratorBaseV2 & { status: 'ready' })
  | (ColorSystemBuilderOrchestratorBaseV2 & { status: 'blocked' });

type OrchestratorContent = Omit<ColorSystemBuilderOrchestratorV2Result, 'orchestratorHash'>;

function asBlocker(
  stage: ColorSystemBuilderOrchestratorStageV2,
  code: string,
  message: string
): ColorSystemBuilderOrchestratorBlockerV2 {
  return { stage, code, message };
}

function result(content: OrchestratorContent): ColorSystemBuilderOrchestratorV2Result {
  return { ...content, orchestratorHash: deterministicContentHash(content) };
}

function blockedBeforeDirections(
  presentationProfile: ColorSystemPresentationProfileV2 | null,
  sourceCompilation: Extract<ColorSystemSourceCompilerV2Result, { status: 'ready' }> | null,
  blocker: ColorSystemBuilderOrchestratorBlockerV2
): ColorSystemBuilderOrchestratorV2Result {
  return result({
    version: COLOR_SYSTEM_BUILDER_ORCHESTRATOR_V2_VERSION,
    status: 'blocked',
    mutatesFigma: false,
    legacyV1AcceptanceUsed: false,
    presentationProfile,
    sourceCompilation,
    brief: sourceCompilation?.brief ?? null,
    strategySet: null,
    directions: [],
    recommendedDirection: null,
    blockers: [blocker],
  });
}

function directionBlocker(
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2 | null,
  blockers: readonly ColorSystemBuilderOrchestratorBlockerV2[]
): ColorSystemBuilderBlockedDirectionV2 {
  const content = {
    status: 'blocked' as const,
    directionId: candidate.id,
    directionLabel: candidate.label,
    candidate,
    application,
    section: null,
    resource: null,
    review: null,
    hashChain: null,
    blockers,
  };
  return { ...content, directionHash: deterministicContentHash(content) };
}

function normalizeSystemId(base: string, candidateId: string): string {
  const normalizedBase = base.trim();
  const suffix = candidateId.replace(/[^A-Za-z0-9._-]+/g, '-');
  const maximumBase = Math.max(1, 79 - suffix.length);
  return `${normalizedBase.slice(0, maximumBase)}-${suffix}`;
}

const PRODUCT_SYSTEM_JOBS = new Set<ColorSystemJobV2>([
  'marketing-accent',
  'product-graphics',
  'functional-iconography',
  'product-ui-surface',
  'product-semantics',
]);
const DATA_VISUALIZATION_JOBS = new Set<ColorSystemJobV2>([
  'categorical-data',
  'sequential-data',
  'diverging-data',
]);

export function inferColorSystemBuilderRecommendationObjectiveV2(
  jobs: readonly ColorSystemJobV2[]
): ColorSystemBuilderRecommendationObjectiveV2 {
  const productSystem = jobs.some(job => PRODUCT_SYSTEM_JOBS.has(job));
  const dataVisualization = jobs.some(job => DATA_VISUALIZATION_JOBS.has(job));
  if (productSystem && dataVisualization) return 'general-product-system';
  if (dataVisualization) return 'data-visualization-dominant';
  return 'source-continuity-dominant';
}

function objectiveFit(
  directionId: string,
  objective: ColorSystemBuilderRecommendationObjectiveV2
): 1 | 2 | 3 {
  const fitByObjective: Readonly<
    Record<ColorSystemBuilderRecommendationObjectiveV2, Readonly<Record<string, 1 | 2 | 3>>>
  > = {
    'general-product-system': {
      'secondary-close-harmony': 2,
      'secondary-balanced-contrast': 3,
      'secondary-wide-spectrum': 1,
    },
    'data-visualization-dominant': {
      'secondary-close-harmony': 1,
      'secondary-balanced-contrast': 2,
      'secondary-wide-spectrum': 3,
    },
    'source-continuity-dominant': {
      'secondary-close-harmony': 3,
      'secondary-balanced-contrast': 2,
      'secondary-wide-spectrum': 1,
    },
  };
  return fitByObjective[objective][directionId] ?? 1;
}

function recommendationEvidence(
  directionId: string,
  application: ColorSystemApplicationSystemBlueprintV2,
  policy: ColorSystemBuilderRecommendationPolicyV2
): ColorSystemBuilderRecommendationEvidenceV2 {
  const requiredPairsPassing = application.pairEvidence.filter(
    evidence => evidence.context.assessment === 'required' && evidence.status === 'pass'
  ).length;
  const categoricalSeparation = Math.min(
    application.visualization.categorical.cvdAdvisory.normal,
    application.visualization.categorical.cvdAdvisory.protan,
    application.visualization.categorical.cvdAdvisory.deutan,
    application.visualization.categorical.cvdAdvisory.severeTritan
  );
  const divergingSeparation = Math.min(
    application.visualization.diverging.cvdAdvisory.normal,
    application.visualization.diverging.cvdAdvisory.protan,
    application.visualization.diverging.cvdAdvisory.deutan,
    application.visualization.diverging.cvdAdvisory.severeTritan
  );
  return {
    requiredPairsPassing,
    productSemanticsPassing: application.productSemantics.filter(
      role => role.accessibilityStatus === 'pass'
    ).length,
    productGraphicsPassing: application.productGraphics.filter(
      specimen => specimen.accessibilityStatus === 'pass'
    ).length,
    objectiveFit: objectiveFit(directionId, policy.objective),
    minimumModeledChartSeparation: Math.min(categoricalSeparation, divergingSeparation),
  };
}

function readyDirection(
  sourceCompilation: Extract<ColorSystemSourceCompilerV2Result, { status: 'ready' }>,
  strategySet: ColorSystemStrategySetV2,
  candidate: ColorSystemStrategyCandidateV2,
  presentationProfile: ColorSystemPresentationProfileV2,
  input: ColorSystemBuilderOrchestratorExecutionV2
): ColorSystemBuilderDirectionV2 {
  const applicationResult = composeColorSystemApplicationBlueprintV2(
    sourceCompilation.brief,
    candidate,
    input.application
  );
  if (applicationResult.status === 'blocked') {
    return directionBlocker(
      candidate,
      applicationResult.blueprint,
      applicationResult.blockers.map((blocker: ColorSystemApplicationComposerBlockerV2) =>
        asBlocker('application', blocker.code, blocker.message)
      )
    );
  }
  let integrationStage: 'section' | 'resource' | 'review' = 'section';
  try {
    const application = applicationResult.blueprint;
    const section = composeColorSystemSectionBlueprintV2(
      sourceCompilation.brief,
      candidate,
      application,
      presentationProfile
    );
    integrationStage = 'resource';
    const resource = buildColorSystemResourceBlueprintV2(
      sourceCompilation.brief,
      strategySet,
      candidate,
      application,
      section,
      presentationProfile,
      {
        compilerVersion: input.resource.compilerVersion,
        systemId: normalizeSystemId(input.resource.systemId, candidate.id),
        outputName: `${input.resource.outputName} — ${candidate.label}`,
      }
    );
    integrationStage = 'review';
    const review = buildColorSystemReviewModelV2(sourceCompilation.brief, candidate, section);
    const hashChain: ColorSystemBuilderHashChainV2 = {
      sourceAuthorityHash: sourceCompilation.brief.sourceHash,
      sourcePackageHash: sourceCompilation.brief.sourcePackageHash,
      presentationProfileHash: presentationProfile.profileHash,
      briefHash: sourceCompilation.brief.briefHash,
      strategySetHash: strategySet.strategySetHash,
      candidateHash: candidate.candidateHash,
      applicationBlueprintHash: application.applicationBlueprintHash,
      sectionBlueprintHash: section.sectionBlueprintHash,
      resourceBlueprintHash: resource.resourceBlueprintHash,
      reviewModelHash: review.reviewModelHash,
    };
    const recommendationEvidenceValue = recommendationEvidence(
      candidate.id,
      application,
      input.recommendation
    );
    const content = {
      status: 'ready' as const,
      directionId: candidate.id,
      directionLabel: candidate.label,
      candidate,
      application,
      section,
      resource,
      review,
      hashChain,
      recommendationEvidence: recommendationEvidenceValue,
      blockers: [] as const,
    };
    return { ...content, directionHash: deterministicContentHash(content) };
  } catch (error) {
    const domain = error as { code?: string; message?: string };
    return directionBlocker(candidate, applicationResult.blueprint, [
      asBlocker(
        integrationStage,
        domain.code ?? 'DIRECTION_INTEGRATION_FAILED',
        domain.message ?? 'The direction could not close its immutable v2 artifact chain.'
      ),
    ]);
  }
}

function recommendedDirection(
  directions: readonly ColorSystemBuilderDirectionV2[],
  policy: ColorSystemBuilderRecommendationPolicyV2
): ColorSystemBuilderRecommendationV2 | null {
  const ranked = directions
    .filter(
      (direction): direction is ColorSystemBuilderReadyDirectionV2 => direction.status === 'ready'
    )
    .sort((left, right) => {
      const leftEvidence = left.recommendationEvidence;
      const rightEvidence = right.recommendationEvidence;
      return (
        rightEvidence.requiredPairsPassing - leftEvidence.requiredPairsPassing ||
        rightEvidence.productSemanticsPassing - leftEvidence.productSemanticsPassing ||
        rightEvidence.productGraphicsPassing - leftEvidence.productGraphicsPassing ||
        rightEvidence.objectiveFit - leftEvidence.objectiveFit ||
        rightEvidence.minimumModeledChartSeparation - leftEvidence.minimumModeledChartSeparation ||
        compareText(left.directionId, right.directionId)
      );
    });
  const selected = ranked[0];
  if (!selected) return null;
  return {
    directionId: selected.directionId,
    label: `Teul recommendation: ${selected.directionLabel}`,
    basis:
      policy.objective === 'general-product-system'
        ? 'All mandatory evidence passes. Because this brief spans product systems and data visualization, the versioned policy prioritizes balanced source continuity and differentiation. This is not owner acceptance.'
        : policy.objective === 'data-visualization-dominant'
          ? 'All mandatory evidence passes. Because this brief is data-visualization dominant, the versioned policy prioritizes differentiation after exact application checks. This is not owner acceptance.'
          : 'All mandatory evidence passes. Because this brief prioritizes continuity, the versioned policy favors the direction closest to the reviewed source. This is not owner acceptance.',
    policy,
    evidence: selected.recommendationEvidence,
    authority: 'teul-recommendation',
    ownerAcceptance: false,
  };
}

/**
 * Pure v2 orchestration. Every stage consumes immutable data and returns
 * blueprints only; this function never invokes Figma, storage, network, clock,
 * randomness, review approval, or document mutation APIs.
 */
export function buildColorSystemBuilderOrchestratorV2(
  input: ColorSystemBuilderOrchestratorV2Input
): ColorSystemBuilderOrchestratorV2Result {
  const presentation = buildColorSystemPresentationProfileV2(input.presentation);
  if (presentation.status === 'blocked') {
    return blockedBeforeDirections(
      null,
      null,
      asBlocker(
        'presentation',
        presentation.blocker.code,
        `${presentation.blocker.message} Missing: ${presentation.missingFields.join(', ')}.`
      )
    );
  }
  const source = compileColorSystemSourceV2(input.source);
  if (source.status === 'confirmation-required') {
    return blockedBeforeDirections(
      presentation.profile,
      null,
      asBlocker('source', source.confirmation.code, source.confirmation.consequence)
    );
  }
  return buildColorSystemBuilderFromReadySourceV2(presentation.profile, source, input);
}

function buildColorSystemBuilderFromReadySourceV2(
  presentationProfile: ColorSystemPresentationProfileV2,
  source: Extract<ColorSystemSourceCompilerV2Result, { status: 'ready' }>,
  input: ColorSystemBuilderOrchestratorExecutionV2
): ColorSystemBuilderOrchestratorV2Result {
  if (
    source.brief.presentationProfileHash !== presentationProfile.profileHash ||
    source.brief.sourceHash !== presentationProfile.sourceAuthorityHash ||
    source.brief.sourcePackageHash !== presentationProfile.sourcePackageHash
  ) {
    return blockedBeforeDirections(
      presentationProfile,
      source,
      asBlocker(
        'source',
        'SOURCE_PRESENTATION_AUTHORITY_MISMATCH',
        'The source brief and normalized presentation profile do not share one authority chain.'
      )
    );
  }
  const strategySet = buildColorSystemSecondaryStrategySetV2(source.brief, source.seeds);
  if (strategySet.status !== 'ready') {
    return result({
      version: COLOR_SYSTEM_BUILDER_ORCHESTRATOR_V2_VERSION,
      status: 'blocked',
      mutatesFigma: false,
      legacyV1AcceptanceUsed: false,
      presentationProfile,
      sourceCompilation: source,
      brief: source.brief,
      strategySet,
      directions: [],
      recommendedDirection: null,
      blockers: strategySet.blockers.map(blocker =>
        asBlocker('secondary', blocker.code, blocker.message)
      ),
    });
  }
  const maximumDirections = input.maximumDirections ?? 3;
  const directions = strategySet.candidates
    .slice(0, maximumDirections)
    .map(candidate =>
      candidate.status === 'complete'
        ? readyDirection(source, strategySet, candidate, presentationProfile, input)
        : directionBlocker(candidate, null, [
            asBlocker(
              'secondary',
              candidate.blockers[0]?.code ?? 'SECONDARY_DIRECTION_UNDERFILLED',
              candidate.blockers[0]?.message ?? 'The direction is underfilled.'
            ),
          ])
    );
  const recommendation = recommendedDirection(directions, input.recommendation);
  const blockers = directions
    .filter(
      (direction): direction is ColorSystemBuilderBlockedDirectionV2 =>
        direction.status === 'blocked'
    )
    .flatMap(direction => direction.blockers);
  return result({
    version: COLOR_SYSTEM_BUILDER_ORCHESTRATOR_V2_VERSION,
    status: recommendation ? 'ready' : 'blocked',
    mutatesFigma: false,
    legacyV1AcceptanceUsed: false,
    presentationProfile,
    sourceCompilation: source,
    brief: source.brief,
    strategySet,
    directions,
    recommendedDirection: recommendation,
    blockers,
  });
}

function genericBuilderInputContent(
  source: CompileColorSystemGenericPolicyHandoffSourceV2Input,
  options: BuildColorSystemGenericBuilderOrchestratorV2InputOptions
): Omit<ColorSystemGenericBuilderOrchestratorV2Input, 'inputHash'> {
  const jobs = source.handoff.sectionIntents.flatMap(intent => intent.jobs);
  const resource = {
    compilerVersion: options.resource?.compilerVersion ?? 'teul-generic-color-builder-v2',
    systemId: options.resource?.systemId ?? 'teul-generic-color-system',
    outputName: options.resource?.outputName ?? 'Teul Proposed Color System',
  };
  const recommendation = options.recommendation ?? {
    version: COLOR_SYSTEM_BUILDER_RECOMMENDATION_POLICY_V2_VERSION,
    objective: inferColorSystemBuilderRecommendationObjectiveV2(jobs),
    authority: 'teul-policy-default' as const,
    evidenceIds: [
      `generic-handoff:${source.handoff.handoffHash}`,
      'teul-policy:generic-builder-recommendation-v1',
    ],
  };
  return {
    version: COLOR_SYSTEM_GENERIC_BUILDER_ORCHESTRATOR_INPUT_V2_VERSION,
    source,
    ...(options.application ? { application: options.application } : {}),
    resource,
    recommendation,
    ...(options.maximumDirections ? { maximumDirections: options.maximumDirections } : {}),
  };
}

/** Builds the exact serializable input a controller can retain and replay at Create. */
export function buildColorSystemGenericBuilderOrchestratorV2Input(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  proposal: GenericIntakeProposalV2,
  confirmation: GenericOwnerConfirmationV2,
  handoff: ColorSystemGenericPolicyHandoffV2,
  options: BuildColorSystemGenericBuilderOrchestratorV2InputOptions = {}
): ColorSystemGenericBuilderOrchestratorV2Input {
  const content = genericBuilderInputContent(
    { snapshot, proposal, confirmation, handoff },
    options
  );
  return { ...content, inputHash: deterministicContentHash(content) };
}

/** Pure generic orchestration; no controller, Figma, storage, network, or mutation APIs. */
export function buildColorSystemGenericBuilderOrchestratorV2(
  input: ColorSystemGenericBuilderOrchestratorV2Input
): ColorSystemBuilderOrchestratorV2Result {
  const { inputHash, ...content } = input;
  if (
    input.version !== COLOR_SYSTEM_GENERIC_BUILDER_ORCHESTRATOR_INPUT_V2_VERSION ||
    inputHash !== deterministicContentHash(content)
  ) {
    return blockedBeforeDirections(
      null,
      null,
      asBlocker(
        'source',
        'GENERIC_BUILDER_INPUT_HASH_MISMATCH',
        'The stored generic builder input is stale, mutated, or not canonical.'
      )
    );
  }
  try {
    const presentationProfile = buildColorSystemGenericPresentationProfileV2(input.source);
    const source = compileColorSystemGenericPolicyHandoffSourceV2(input.source);
    return buildColorSystemBuilderFromReadySourceV2(presentationProfile, source, input);
  } catch (error) {
    const domain = error as { code?: string; message?: string };
    return blockedBeforeDirections(
      null,
      null,
      asBlocker(
        'source',
        domain.code ?? 'GENERIC_SOURCE_COMPILATION_FAILED',
        domain.message ?? 'The generic source handoff could not compile.'
      )
    );
  }
}

export function getColorSystemBuilderDirectionV2(
  resultValue: ColorSystemBuilderOrchestratorV2Result,
  directionId: string
): ColorSystemBuilderDirectionV2 | null {
  return resultValue.directions.find(direction => direction.directionId === directionId) ?? null;
}

export function getRecommendedColorSystemBuilderDirectionV2(
  resultValue: ColorSystemBuilderOrchestratorV2Result
): ColorSystemBuilderReadyDirectionV2 | null {
  const id = resultValue.recommendedDirection?.directionId;
  if (!id) return null;
  const direction = getColorSystemBuilderDirectionV2(resultValue, id);
  return direction?.status === 'ready' ? direction : null;
}
