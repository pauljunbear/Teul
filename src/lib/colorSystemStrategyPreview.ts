import type {
  ColorSystemStrategyBuilderBlocker,
  ColorSystemStrategySearchEvidence,
  ColorSystemStrategySet,
} from './colorSystemStrategyBuilder';
import { compileColorSystemStrategyProposal } from './colorSystemStrategyProposal';
import { composeColorSystemObjectiveModules } from './colorSystemObjectiveModules';
import type {
  ColorSystemStrategyPreviewBlocker,
  ColorSystemStrategyPreviewCandidate,
  ColorSystemStrategyPreviewSet,
} from '../types/messages';
import type {
  ColorSystemProposal,
  ProductSemanticRole,
  SourceSystemSnapshot,
} from '../types/colorSystemAudit';

export const COLOR_SYSTEM_PREVIEW_PRODUCT_SEMANTIC_ROLES = [
  'background',
  'surface',
  'text',
  'border',
  'focus',
  'disabled',
  'success',
  'warning',
  'error',
  'information',
  'destructive',
  'link',
  'selected',
] as const satisfies readonly ProductSemanticRole[];

type ProductSemanticPreview = ColorSystemStrategyPreviewCandidate['productSemantics'];

function projectProductSemantics(proposal: ColorSystemProposal): ProductSemanticPreview {
  const semanticModules = proposal.modules.filter(
    module => module.namespace === 'product-semantics'
  );
  if (semanticModules.length !== 1) {
    throw new Error('The complete strategy preview requires one Product semantics module.');
  }
  const semanticModule = semanticModules[0];
  const tokens = new Map(
    proposal.modules.flatMap(module => module.tokens).map(token => [token.id, token])
  );
  return COLOR_SYSTEM_PREVIEW_PRODUCT_SEMANTIC_ROLES.map(role => {
    const targetForMode = (mode: 'light' | 'dark') => {
      const matches = semanticModule.aliases.filter(
        alias => alias.role === role && alias.mode === mode && alias.state === undefined
      );
      if (matches.length !== 1) {
        throw new Error(`The complete strategy preview cannot resolve ${role} in ${mode} mode.`);
      }
      const target = tokens.get(matches[0].targetTokenId);
      const hex = target?.valuesByMode[mode];
      if (!target || !hex) {
        throw new Error(
          `The complete strategy preview cannot resolve ${role} in ${mode} to an exact color.`
        );
      }
      return { targetTokenId: target.id, targetName: target.name, hex };
    };
    return { role, light: targetForMode('light'), dark: targetForMode('dark') };
  });
}

function projectCandidateProductSemantics(
  snapshot: SourceSystemSnapshot,
  strategySet: ColorSystemStrategySet,
  candidateId: ColorSystemStrategySet['candidates'][number]['id'],
  candidateHash: string
): ProductSemanticPreview {
  const compiled = compileColorSystemStrategyProposal(snapshot, strategySet, {
    candidateId,
    candidateHash,
  });
  if (compiled.status !== 'ready') {
    throw new Error(
      compiled.blockers[0]?.message ?? 'The strategy could not be compiled for complete preview.'
    );
  }
  const base: ColorSystemProposal = {
    ...compiled.draft.content,
    proposalHash: compiled.draft.proposalHash,
  };
  const composed = composeColorSystemObjectiveModules(snapshot, base, [
    'product-primitives',
    'product-semantics',
  ]);
  if (composed.status === 'no-solution') {
    throw new Error(
      composed.blockers[0]?.message ?? 'The Product semantic mappings could not be completed.'
    );
  }
  return projectProductSemantics(composed.proposal);
}

function projectSearchEvidence(
  evidence: ColorSystemStrategySearchEvidence
): ColorSystemStrategySearchEvidence {
  return {
    rawPoolCandidateCount: evidence.rawPoolCandidateCount,
    rawPoolMaximumCandidates: evidence.rawPoolMaximumCandidates,
    uniquePoolCandidateCount: evidence.uniquePoolCandidateCount,
    quantizationCollapseCount: evidence.quantizationCollapseCount,
    sourceDuplicateRejectionCount: evidence.sourceDuplicateRejectionCount,
    directionEligibleCandidateCount: evidence.directionEligibleCandidateCount,
    prequalifiedFamilyCount: evidence.prequalifiedFamilyCount,
    maximumPrequalifiedFamilies: evidence.maximumPrequalifiedFamilies,
    generatedScaleFamilyCount: evidence.generatedScaleFamilyCount,
    invalidScaleRejectionCount: evidence.invalidScaleRejectionCount,
    pairEvaluationCount: evidence.pairEvaluationCount,
    pairMaximumEvaluations: evidence.pairMaximumEvaluations,
    pairFrontierCount: evidence.pairFrontierCount,
    pairArtifactEvaluationCount: evidence.pairArtifactEvaluationCount,
    pairMaximumBeamWidth: evidence.pairMaximumBeamWidth,
    visualizationEvaluationCount: evidence.visualizationEvaluationCount,
    visualizationMaximumEvaluations: evidence.visualizationMaximumEvaluations,
  };
}

/** Projects a blocker into count-only transport evidence. */
export function projectColorSystemStrategyBlocker(
  blocker: ColorSystemStrategyBuilderBlocker
): ColorSystemStrategyPreviewBlocker {
  return {
    code: blocker.code,
    message: blocker.message,
    ...(blocker.direction ? { direction: blocker.direction } : {}),
    ...(blocker.duplicateOfDirection ? { duplicateOfDirection: blocker.duplicateOfDirection } : {}),
    ...(blocker.searchEvidence
      ? { searchEvidence: projectSearchEvidence(blocker.searchEvidence) }
      : {}),
    alternatives: [...blocker.alternatives],
  };
}

/**
 * Projects the backend-owned canonical model into the exact bounded view that
 * the iframe renders. Generated provenance, measurements, and model internals
 * deliberately remain in the plugin sandbox.
 */
export function projectColorSystemStrategyPreview(
  strategySet: ColorSystemStrategySet,
  snapshot: SourceSystemSnapshot
): ColorSystemStrategyPreviewSet {
  if (snapshot.sourceHash !== strategySet.sourceHash) {
    throw new Error('The complete strategy preview does not match the audited source.');
  }
  return {
    schemaVersion: strategySet.schemaVersion,
    policyVersion: strategySet.policyVersion,
    sourceHash: strategySet.sourceHash,
    strategySetHash: strategySet.strategySetHash,
    primary: { ...strategySet.primary },
    recommendation: {
      policyVersion: strategySet.recommendation.policyVersion,
      recommendedCandidateId: strategySet.recommendation.recommendedCandidateId,
      statement: strategySet.recommendation.statement,
    },
    candidates: strategySet.candidates.map(candidate => ({
      id: candidate.id,
      candidateHash: candidate.candidateHash,
      label: candidate.label,
      rationale: candidate.rationale,
      primary: { ...candidate.primary },
      secondaryFamilies: [
        {
          id: candidate.secondaryFamilies[0].id,
          name: candidate.secondaryFamilies[0].name,
          familyIndex: 1,
          lightSteps: candidate.secondaryFamilies[0].modes.light.steps.map(step => step.hex),
          darkSteps: candidate.secondaryFamilies[0].modes.dark.steps.map(step => step.hex),
        },
        {
          id: candidate.secondaryFamilies[1].id,
          name: candidate.secondaryFamilies[1].name,
          familyIndex: 2,
          lightSteps: candidate.secondaryFamilies[1].modes.light.steps.map(step => step.hex),
          darkSteps: candidate.secondaryFamilies[1].modes.dark.steps.map(step => step.hex),
        },
      ],
      visualization: {
        categorical: candidate.visualization.categorical.colors.map(color => color.hex),
        sequential: candidate.visualization.sequential.colors.map(color => color.hex),
        diverging: candidate.visualization.diverging.colors.map(color => color.hex),
      },
      productSemantics: projectCandidateProductSemantics(
        snapshot,
        strategySet,
        candidate.id,
        candidate.candidateHash
      ),
    })),
    blockers: strategySet.blockers.map(projectColorSystemStrategyBlocker),
  };
}
