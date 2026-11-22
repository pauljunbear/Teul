import {
  colorSystemMeanAnchorSeparationDeltaEOKV2,
  colorSystemSourceContinuityDeltaEOKV2,
  composeColorSystemApplicationBlueprintV2,
  type ColorSystemApplicationComposerBlockerV2,
  type ColorSystemApplicationComposerOptionsV2,
} from './colorSystemApplicationComposerV2';
import {
  COLOR_SYSTEM_APPLICATION_MEANING_FILL_MINIMUM_DELTA_E_OK,
  type ColorSystemApplicationSystemBlueprintV2,
  type ColorSystemSectionBlueprintV2,
} from './colorSystemApplicationBlueprintV2';
import { deterministicContentHash } from './colorSystemHashing';
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
  GenericPolicyDecisionV2,
} from './colorSystemGenericIntentPolicyV2';
import type { ColorSystemGenericPolicyHandoffV2 } from './colorSystemGenericPolicyHandoffV2';
import { compareText } from './utils';

export const COLOR_SYSTEM_BUILDER_ORCHESTRATOR_V2_VERSION =
  'teul-color-system-builder-orchestrator/v2.1' as const;
export const COLOR_SYSTEM_BUILDER_RECOMMENDATION_POLICY_V2_VERSION =
  'teul-color-system-recommendation-policy/v2.1' as const;
export const COLOR_SYSTEM_GENERIC_BUILDER_ORCHESTRATOR_INPUT_V2_VERSION =
  'teul-color-system-generic-builder-input/v1' as const;

export type ColorSystemBuilderRecommendationObjectiveV2 =
  'general-product-system' | 'data-visualization-dominant' | 'source-continuity-dominant';

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
  'presentation' | 'source' | 'secondary' | 'application' | 'section' | 'resource' | 'review';

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
  ColorSystemBuilderReadyDirectionV2 | ColorSystemBuilderBlockedDirectionV2;

export interface ColorSystemBuilderRecommendationV2 {
  directionId: string;
  label: string;
  /** The measured statements joined into one sentence; kept as a string for wire consumers. */
  basis: string;
  /** One measured statement per ranking criterion, in ranking order, ready to print. */
  basisStatements: readonly string[];
  policy: ColorSystemBuilderRecommendationPolicyV2;
  evidence: ColorSystemBuilderRecommendationEvidenceV2;
  authority: 'teul-recommendation';
  ownerAcceptance: false;
}

/**
 * Every field is measured from the direction's own application blueprint,
 * candidate and brief. There is no static per-direction fit table: two directions
 * with identical measurements tie and fall through to the stable direction ID.
 */
export interface ColorSystemBuilderRecommendationEvidenceV2 {
  requiredPairsPassing: number;
  requiredPairsTotal: number;
  productSemanticsPassing: number;
  productGraphicsPassing: number;
  /** Hue-band roles whose resolved value sits inside its target OKLCH hue range. */
  meaningRolesInRange: number;
  meaningRolesTotal: number;
  /** True when no meaning fill sits within the distinctness floor of another (declared error/destructive shares aside). */
  distinctMeaningFills: boolean;
  /** Meaning roles flagged with a fill collision, summed over modes. */
  meaningFillCollisions: number;
  /** Minimum modeled (normal plus Machado severity-1) Delta E OK across chart selections. */
  minimumModeledChartSeparation: number;
  /** Coefficient of variation of the sequential ramp's adjacent steps; lower is more even. */
  sequentialAdjacentCoefficientOfVariation: number | null;
  /** Mean pairwise Delta E OK between family anchors (Light step 9 or base). */
  meanAnchorSeparationDeltaEOK: number;
  /** Mean Delta E OK from each family anchor to its nearest governed source anchor; null without sources. */
  sourceContinuityDeltaEOK: number | null;
  /** Categorical marks the owner requested per mode. */
  categoricalMarksRequested: number;
  /** Categorical marks actually achieved in each composed mode, sorted by mode. */
  categoricalMarksAchievedByMode: readonly { mode: string; achieved: number }[];
  /** Sum over modes of (requested − achieved); zero when every mode met the request. */
  categoricalMarkShortfall: number;
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

/**
 * Mean distance from each family anchor to its nearest governed source anchor
 * (source reference colors plus exact Primary locks). Lower means the direction
 * stays closer to the reviewed source. Null when the brief carries no anchors.
 */
/**
 * p3-I: preserved Secondary colors and pinned tints count as source anchors
 * (see colorSystemSourceContinuityDeltaEOKV2), so a brand whose hues all come
 * back exact measures 0 rather than the distance to its own recorded palette.
 */
function sourceContinuity(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2
): number | null {
  return colorSystemSourceContinuityDeltaEOKV2(brief, candidate);
}

function minimumCvdSeparation(
  advisory: ColorSystemApplicationSystemBlueprintV2['visualization']['categorical']['cvdAdvisory']
): number {
  return Math.min(advisory.normal, advisory.protan, advisory.deutan, advisory.severeTritan);
}

function recommendationEvidence(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemBuilderRecommendationEvidenceV2 {
  const requiredPairs = application.pairEvidence.filter(
    evidence => evidence.context.assessment === 'required'
  );
  const rangedRoles = application.semanticMeaning.filter(item => item.targetHueRange !== null);
  const chartSelections = [
    application.visualization.categorical,
    application.visualization.diverging,
    ...application.additionalCategorical,
  ].filter(selection => selection !== null);
  const categoricalSelections = [
    application.visualization.categorical,
    ...application.additionalCategorical,
  ];
  const selectionMode = (
    selection: ColorSystemApplicationSystemBlueprintV2['visualization']['categorical']
  ): string =>
    selection.surface.kind === 'approved-family-member'
      ? selection.surface.ref.mode
      : selection.surface.mode;
  const categoricalMarksAchievedByMode = categoricalSelections
    .map(selection => ({ mode: selectionMode(selection), achieved: selection.achievedMarkCount }))
    .sort((left, right) => compareText(left.mode, right.mode));
  return {
    requiredPairsPassing: requiredPairs.filter(evidence => evidence.status === 'pass').length,
    requiredPairsTotal: requiredPairs.length,
    productSemanticsPassing: application.productSemantics.filter(
      role => role.accessibilityStatus === 'pass'
    ).length,
    productGraphicsPassing: application.productGraphics.filter(
      specimen => specimen.accessibilityStatus === 'pass'
    ).length,
    meaningRolesInRange: rangedRoles.filter(item => item.inRange).length,
    meaningRolesTotal: rangedRoles.length,
    distinctMeaningFills: application.semanticMeaning.every(item => item.collision === null),
    meaningFillCollisions: application.semanticMeaning.filter(item => item.collision !== null)
      .length,
    minimumModeledChartSeparation: Math.min(
      ...chartSelections.map(selection => minimumCvdSeparation(selection.cvdAdvisory))
    ),
    sequentialAdjacentCoefficientOfVariation:
      application.visualization.sequential?.perceptualEvidence
        .adjacentDeltaEOKCoefficientOfVariation ?? null,
    meanAnchorSeparationDeltaEOK: colorSystemMeanAnchorSeparationDeltaEOKV2(candidate),
    sourceContinuityDeltaEOK: sourceContinuity(brief, candidate),
    categoricalMarksRequested: application.visualization.categorical.requestedMarkCount,
    categoricalMarksAchievedByMode,
    categoricalMarkShortfall: categoricalSelections.reduce(
      (total, selection) => total + (selection.requestedMarkCount - selection.achievedMarkCount),
      0
    ),
  };
}

type EvidenceComparator = (
  left: ColorSystemBuilderRecommendationEvidenceV2,
  right: ColorSystemBuilderRecommendationEvidenceV2
) => number;

/**
 * Fewer failing required pairs ranks higher. Failures, not passes, are compared so
 * a direction that composes fewer categorical marks (and therefore fewer pairs)
 * is not read as less accessible.
 */
const byRequiredPairs: EvidenceComparator = (left, right) =>
  left.requiredPairsTotal -
  left.requiredPairsPassing -
  (right.requiredPairsTotal - right.requiredPairsPassing);
/** A direction whose meaning fills collide ranks below one whose fills are distinct. */
const byMeaningFillCollisions: EvidenceComparator = (left, right) =>
  left.meaningFillCollisions - right.meaningFillCollisions;
const byMeaningCoverage: EvidenceComparator = (left, right) =>
  right.meaningRolesInRange - left.meaningRolesInRange;
const byChartSeparation: EvidenceComparator = (left, right) =>
  right.minimumModeledChartSeparation - left.minimumModeledChartSeparation;
const byCategoricalShortfall: EvidenceComparator = (left, right) =>
  left.categoricalMarkShortfall - right.categoricalMarkShortfall;
const bySequentialUniformity: EvidenceComparator = (left, right) =>
  left.sequentialAdjacentCoefficientOfVariation === null ||
  right.sequentialAdjacentCoefficientOfVariation === null
    ? 0
    : left.sequentialAdjacentCoefficientOfVariation -
      right.sequentialAdjacentCoefficientOfVariation;
const byAnchorSeparation: EvidenceComparator = (left, right) =>
  right.meanAnchorSeparationDeltaEOK - left.meanAnchorSeparationDeltaEOK;
const bySourceContinuity: EvidenceComparator = (left, right) =>
  left.sourceContinuityDeltaEOK === right.sourceContinuityDeltaEOK
    ? 0
    : (left.sourceContinuityDeltaEOK ?? Number.POSITIVE_INFINITY) -
      (right.sourceContinuityDeltaEOK ?? Number.POSITIVE_INFINITY);

/**
 * Ranking order per objective. Required pairs always come first. A general
 * product system then values meaning coverage; a data-visualization brief moves
 * chart separation and ramp evenness ahead of meaning; a continuity brief moves
 * closeness to the source (lower is better) directly behind required pairs. In
 * Once application evidence ties, closer source continuity precedes general
 * anchor variety: extra hues without a demonstrated application benefit must
 * not win merely by increasing palette separation. In every order a direction
 * that meets the requested categorical count outranks one
 * that fell short, judged just before sequential uniformity.
 */
function rankingComparators(
  objective: ColorSystemBuilderRecommendationObjectiveV2
): readonly EvidenceComparator[] {
  switch (objective) {
    case 'data-visualization-dominant':
      return [
        byRequiredPairs,
        byMeaningFillCollisions,
        byChartSeparation,
        byCategoricalShortfall,
        bySequentialUniformity,
        byMeaningCoverage,
        bySourceContinuity,
        byAnchorSeparation,
      ];
    case 'source-continuity-dominant':
      return [
        byRequiredPairs,
        byMeaningFillCollisions,
        bySourceContinuity,
        byMeaningCoverage,
        byChartSeparation,
        byCategoricalShortfall,
        bySequentialUniformity,
        byAnchorSeparation,
      ];
    default:
      return [
        byRequiredPairs,
        byMeaningFillCollisions,
        byMeaningCoverage,
        byChartSeparation,
        byCategoricalShortfall,
        bySequentialUniformity,
        bySourceContinuity,
        byAnchorSeparation,
      ];
  }
}

/**
 * Pure ranking over measured evidence: returns direction IDs best-first for the
 * objective. Exported so the ordering itself can be tested without a full
 * orchestration.
 */
export function rankColorSystemBuilderRecommendationEvidenceV2(
  entries: readonly { directionId: string; evidence: ColorSystemBuilderRecommendationEvidenceV2 }[],
  objective: ColorSystemBuilderRecommendationObjectiveV2
): string[] {
  const comparators = rankingComparators(objective);
  return [...entries]
    .sort((left, right) => {
      for (const compare of comparators) {
        const order = compare(left.evidence, right.evidence);
        if (order !== 0) return order;
      }
      return compareText(left.directionId, right.directionId);
    })
    .map(entry => entry.directionId);
}

function measured(value: number): string {
  return value.toFixed(3);
}

/**
 * When any ready direction fell short of the requested categorical count in some
 * mode, name every direction's measured count for that mode so the owner can see
 * which strategy carries the series they asked for.
 */
function categoricalComparisonStatements(
  ready: readonly ColorSystemBuilderReadyDirectionV2[]
): string[] {
  const modes = [
    ...new Set(
      ready.flatMap(direction =>
        direction.recommendationEvidence.categoricalMarksAchievedByMode.map(entry => entry.mode)
      )
    ),
  ].sort(compareText);
  return modes.flatMap(mode => {
    const entries = ready
      .map(direction => ({
        label: direction.directionLabel,
        requested: direction.recommendationEvidence.categoricalMarksRequested,
        achieved:
          direction.recommendationEvidence.categoricalMarksAchievedByMode.find(
            entry => entry.mode === mode
          )?.achieved ?? null,
      }))
      .filter((entry): entry is typeof entry & { achieved: number } => entry.achieved !== null);
    if (entries.every(entry => entry.achieved >= entry.requested)) return [];
    const requested = Math.max(...entries.map(entry => entry.requested));
    return [
      `Categorical series in ${mode}: ${entries
        .map(entry => `${entry.label} ${entry.achieved}`)
        .join(', ')} (${requested} requested).`,
    ];
  });
}

function basisStatements(
  evidence: ColorSystemBuilderRecommendationEvidenceV2,
  candidate: ColorSystemStrategyCandidateV2,
  policy: ColorSystemBuilderRecommendationPolicyV2,
  comparison: readonly string[]
): string[] {
  const statements: Record<string, string> = {
    pairs: `${evidence.requiredPairsPassing} of ${evidence.requiredPairsTotal} required pairs pass.`,
    distinct: evidence.distinctMeaningFills
      ? `Meaning fills are pairwise distinct (at least ${COLOR_SYSTEM_APPLICATION_MEANING_FILL_MINIMUM_DELTA_E_OK} Delta E OK apart).`
      : `${evidence.meaningFillCollisions} meaning roles share a fill with another meaning role.`,
    meaning: `${evidence.meaningRolesInRange} of ${evidence.meaningRolesTotal} meaning roles sit inside their hue range.`,
    chart: `Minimum modeled chart separation ${measured(evidence.minimumModeledChartSeparation)} Delta E OK.`,
    categorical: `Categorical series achieved: ${evidence.categoricalMarksAchievedByMode
      .map(entry => `${entry.mode} ${entry.achieved} of ${evidence.categoricalMarksRequested}`)
      .join(', ')} requested.`,
    uniformity:
      evidence.sequentialAdjacentCoefficientOfVariation === null
        ? 'The recorded chart palette is kept; no sequential ramp was requested.'
        : `Sequential adjacent-step variation ${measured(evidence.sequentialAdjacentCoefficientOfVariation)} (coefficient of variation; lower is more even).`,
    anchors: `Mean anchor separation ${measured(evidence.meanAnchorSeparationDeltaEOK)} Delta E OK across ${candidate.families.length} families.`,
    continuity:
      evidence.sourceContinuityDeltaEOK === null
        ? 'No governed source anchors are available to measure continuity.'
        : `Mean distance from source anchors ${measured(evidence.sourceContinuityDeltaEOK)} Delta E OK (lower keeps closer to the reviewed source).`,
  };
  const order: Record<ColorSystemBuilderRecommendationObjectiveV2, readonly string[]> = {
    'general-product-system': [
      'pairs',
      'distinct',
      'meaning',
      'chart',
      'categorical',
      'uniformity',
      'continuity',
      'anchors',
    ],
    'data-visualization-dominant': [
      'pairs',
      'distinct',
      'chart',
      'categorical',
      'uniformity',
      'meaning',
      'continuity',
      'anchors',
    ],
    'source-continuity-dominant': [
      'pairs',
      'distinct',
      'continuity',
      'meaning',
      'chart',
      'categorical',
      'uniformity',
      'anchors',
    ],
  };
  return [
    ...order[policy.objective].map(key => statements[key]),
    ...comparison,
    `Ranked for ${policy.objective} under ${policy.version}. This is not owner acceptance.`,
  ];
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
      sourceCompilation.brief,
      candidate,
      application
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
  const ready = directions.filter(
    (direction): direction is ColorSystemBuilderReadyDirectionV2 => direction.status === 'ready'
  );
  const rankedIds = rankColorSystemBuilderRecommendationEvidenceV2(
    ready.map(direction => ({
      directionId: direction.directionId,
      evidence: direction.recommendationEvidence,
    })),
    policy.objective
  );
  const selected = ready.find(direction => direction.directionId === rankedIds[0]);
  if (!selected) return null;
  const statements = basisStatements(
    selected.recommendationEvidence,
    selected.candidate,
    policy,
    categoricalComparisonStatements(ready)
  );
  return {
    directionId: selected.directionId,
    label: `Teul recommendation: ${selected.directionLabel}`,
    basis: statements.join(' '),
    basisStatements: statements,
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
  confirmation: GenericPolicyDecisionV2,
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
