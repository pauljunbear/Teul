import { deterministicContentHash } from './colorSystemAudit';
import { compareText } from './utils';

export const COLOR_SYSTEM_STRATEGY_RECOMMENDATION_POLICY_VERSION_VALUE =
  'teul-strategy-recommendation-v1' as const;

type StrategyDirection = 'close-harmony' | 'balanced-contrast' | 'wide-spectrum';

interface RecommendationCandidate {
  id: StrategyDirection;
  candidateHash: string;
  measurements: {
    meanNearestSourceDeltaEOK: number;
    minimumCategoricalSeparationDeltaEOK: number;
    gamutMappedStepRate: number;
    minimumSetSeparationDeltaEOK: number;
    functionalArtifactCoverage: number;
  };
}

interface ActualSystemCandidate {
  secondaryFamilies: readonly {
    modes: {
      light: { steps: readonly { hex: string }[] };
      dark: { steps: readonly { hex: string }[] };
    };
  }[];
}

function ranks(
  candidates: readonly RecommendationCandidate[],
  value: (candidate: RecommendationCandidate) => number,
  direction: 'ascending' | 'descending'
): Map<StrategyDirection, number> {
  const ordered = [...candidates].sort((first, second) => {
    const delta = value(first) - value(second);
    if (delta !== 0) return direction === 'ascending' ? delta : -delta;
    return compareText(first.candidateHash, second.candidateHash);
  });
  const result = new Map<StrategyDirection, number>();
  let priorValue: number | undefined;
  let priorRank = 0;
  ordered.forEach((candidate, index) => {
    const current = value(candidate);
    const rank = priorValue !== undefined && current === priorValue ? priorRank : index + 1;
    result.set(candidate.id, rank);
    priorValue = current;
    priorRank = rank;
  });
  return result;
}

export function buildColorSystemStrategyRecommendation(
  candidates: readonly RecommendationCandidate[]
) {
  if (candidates.length < 1 || candidates.length > 3) {
    throw new Error('A recommendation requires one to three strategy candidates.');
  }
  const continuity = ranks(
    candidates,
    candidate => candidate.measurements.meanNearestSourceDeltaEOK,
    'ascending'
  );
  const categorical = ranks(
    candidates,
    candidate => candidate.measurements.minimumCategoricalSeparationDeltaEOK,
    'descending'
  );
  const gamut = ranks(
    candidates,
    candidate => candidate.measurements.gamutMappedStepRate,
    'ascending'
  );
  const separation = ranks(
    candidates,
    candidate => candidate.measurements.minimumSetSeparationDeltaEOK,
    'descending'
  );
  const functional = ranks(
    candidates,
    candidate => candidate.measurements.functionalArtifactCoverage,
    'descending'
  );
  const ordered = candidates
    .map(candidate => {
      const sourceContinuityRank = continuity.get(candidate.id) ?? candidates.length;
      const categoricalSeparationRank = categorical.get(candidate.id) ?? candidates.length;
      const gamutRetentionRank = gamut.get(candidate.id) ?? candidates.length;
      const setSeparationRank = separation.get(candidate.id) ?? candidates.length;
      const functionalCoverageRank = functional.get(candidate.id) ?? candidates.length;
      return {
        candidateId: candidate.id,
        sourceContinuityRank,
        categoricalSeparationRank,
        gamutRetentionRank,
        setSeparationRank,
        functionalCoverageRank,
        ordinalRankSum:
          sourceContinuityRank +
          categoricalSeparationRank +
          gamutRetentionRank +
          setSeparationRank +
          functionalCoverageRank,
        tieBreakHash: candidate.candidateHash,
      };
    })
    .sort(
      (first, second) =>
        first.ordinalRankSum - second.ordinalRankSum ||
        compareText(first.tieBreakHash, second.tieBreakHash)
    );
  return {
    policyVersion: COLOR_SYSTEM_STRATEGY_RECOMMENDATION_POLICY_VERSION_VALUE,
    recommendedCandidateId: ordered[0].candidateId,
    ranking: ordered.map((entry, index) => ({ ...entry, aggregateRank: index + 1 })),
    statement:
      'Recommended under Teul policy by ordinal ranks across source continuity, categorical separation, gamut retention, set separation, and functional coverage; this is not a universal quality score.',
  };
}

export function colorSystemStrategyActualSystemHash(candidate: ActualSystemCandidate): string {
  const familyValueHashes = candidate.secondaryFamilies
    .map(family =>
      deterministicContentHash({
        light: family.modes.light.steps.map(step => step.hex),
        dark: family.modes.dark.steps.map(step => step.hex),
      })
    )
    .sort(compareText);
  return deterministicContentHash({ familyValueHashes });
}
