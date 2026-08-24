import { describe, expect, it } from 'vitest';
import {
  auditColorSystem,
  createSourceSystemSnapshot,
  deterministicContentHash,
  observedLiteralCandidateIdentity,
} from '../colorSystemAudit';
import {
  validateColorSystemAuditPluginMessage,
  validateColorSystemBuilderPackageCore,
} from '../colorSystemAuditMessageValidation';
import {
  createColorSystemBuilderPackage,
  serializeColorSystemBuilderPackage,
} from '../colorSystemBuilderPackage';
import { createColorSystemReviewHash } from '../colorSystemApproval';
import { composeColorSystemObjectiveModules } from '../colorSystemObjectiveModules';
import { createColorSystemProposal } from '../colorSystemProposal';
import { COLOR_SYSTEM_INTENDED_SURFACES } from '../colorSystemIntendedSurfaces';
import {
  buildColorSystemStrategyRecommendation,
  buildColorSystemStrategySet,
} from '../colorSystemStrategyBuilder';
import { projectColorSystemStrategyPreview } from '../colorSystemStrategyPreview';
import { compileColorSystemStrategyProposal } from '../colorSystemStrategyProposal';
import {
  COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
  COLOR_SYSTEM_APPLY_FAILURE_RECEIPT_VERSION,
  COLOR_SYSTEM_AUDIT_EVIDENCE_TEXT_LIMIT,
} from '../../types/messages';
import type { ColorSystemProposal } from '../../types/colorSystemAudit';

const digest = (label: string) => deterministicContentHash({ label });

const snapshot = createSourceSystemSnapshot({
  sourceKind: 'figma-document',
  sourceLocator: 'figma-file:test',
  authorization: { status: 'user-authorized' },
  documentProfile: 'srgb',
  resourceScope: { kind: 'all-local-resources', localVariableCount: 1, localStyleCount: 0 },
  usageScope: 'selection',
  capturedAt: '2026-08-02T12:00:00.000Z',
  modes: ['light'],
  tokens: [
    {
      id: 'brand.anchor',
      name: 'Brand anchor',
      path: ['brand', 'anchor'],
      valuesByMode: {
        light: {
          colorSpace: 'srgb',
          hex: '#3366cc',
          components: [0.2, 0.4, 0.8],
          alpha: 1,
        },
      },
      evidence: [{ kind: 'figma-resource', locator: 'variable:brand-anchor' }],
      roleEvidence: [],
    },
  ],
  supportedUsage: [],
  unsupportedUsage: [],
  declaredPairs: [],
});
const audit = auditColorSystem(snapshot);
const suitableBundle = createColorSystemProposal(snapshot, {
  strategy: 'brand-preserving',
  scales: [
    {
      id: 'brand',
      name: 'Brand',
      anchor: {
        sourceTokenId: 'brand.anchor',
        sourceMode: 'light',
        name: 'Brand anchor',
        hex: '#3366cc',
        step: 9,
      },
      includeDarkMode: true,
    },
  ],
});

if (suitableBundle.status !== 'suitable-candidate') {
  throw new Error('Expected the message-validation fixture to produce a suitable proposal.');
}

const noSolutionBundle = {
  status: 'no-solution' as const,
  strategy: 'exact-radix' as const,
  sourceHash: snapshot.sourceHash,
  blockers: [
    {
      code: 'NO_SUITABLE_EXACT_MATCH' as const,
      message: 'No candidate is inside the approved tolerance.',
      sourceTokenIds: ['brand.anchor'],
      alternatives: ['Approve an explicit tolerance.'],
    },
  ],
};

const builtStrategy = buildColorSystemStrategySet({
  sourceHash: snapshot.sourceHash,
  primary: {
    tokenId: 'brand.anchor',
    name: 'Brand anchor',
    mode: 'light',
    hex: '#3366cc',
  },
  visualizationSettings: {
    mode: 'light',
    surfaceHex: '#ffffff',
    chartType: 'brand-system-overview',
    categoryCount: 4,
    nonColorCue: 'labels and shapes',
    markType: 'bar',
    adjacency: 'separated-marks',
    divergingMidpoint: 'zero',
    sequentialCount: 3,
    divergingCount: 3,
  },
  existingSourceHexes: ['#3366cc'],
});
if (builtStrategy.status !== 'ready') {
  throw new Error(`Expected strategy message fixture: ${builtStrategy.blockers[0]?.message}`);
}
const strategySetFixture = builtStrategy.strategySet;
const strategyPreviewFixture = projectColorSystemStrategyPreview(strategySetFixture, snapshot);
const strategyMessage = {
  type: 'color-system-strategy-set-result' as const,
  requestId: 'strategies-1',
  success: true as const,
  sourceHash: snapshot.sourceHash,
  strategySet: strategyPreviewFixture,
  primaryResolution: 'user-confirmed' as const,
  primaryNote: 'The reviewer confirmed one exact audited Primary value.',
};

const cappedSearchEvidence = {
  rawPoolCandidateCount: 648,
  rawPoolMaximumCandidates: 648 as const,
  uniquePoolCandidateCount: 640,
  quantizationCollapseCount: 4,
  sourceDuplicateRejectionCount: 4,
  directionEligibleCandidateCount: 120,
  prequalifiedFamilyCount: 64,
  maximumPrequalifiedFamilies: 64 as const,
  generatedScaleFamilyCount: 60,
  invalidScaleRejectionCount: 4,
  pairEvaluationCount: 1_770,
  pairMaximumEvaluations: 25_000 as const,
  pairFrontierCount: 32,
  pairArtifactEvaluationCount: 32,
  pairMaximumBeamWidth: 32 as const,
  visualizationEvaluationCount: 8_192,
  visualizationMaximumEvaluations: 8_192 as const,
};

type MutableRecord = Record<string, unknown>;

function mutableStrategyMessage(): MutableRecord {
  return JSON.parse(JSON.stringify(strategyMessage)) as MutableRecord;
}

function strategyCandidate(message: MutableRecord): MutableRecord {
  const strategySet = message.strategySet as MutableRecord;
  return (strategySet.candidates as MutableRecord[])[0];
}

function strategyLightFamily(message: MutableRecord): MutableRecord {
  const candidate = strategyCandidate(message);
  return (candidate.secondaryFamilies as MutableRecord[])[0];
}

function builderPackageExportMessage() {
  const candidate = strategySetFixture.candidates[1];
  const compiled = compileColorSystemStrategyProposal(snapshot, strategySetFixture, {
    candidateId: candidate.id,
    candidateHash: candidate.candidateHash,
  });
  if (compiled.status !== 'ready') throw new Error(compiled.blockers[0]?.message);
  const base: ColorSystemProposal = {
    ...compiled.draft.content,
    proposalHash: compiled.draft.proposalHash,
  };
  const composed = composeColorSystemObjectiveModules(snapshot, base, [
    'product-primitives',
    'product-semantics',
  ]);
  if (composed.status === 'no-solution') throw new Error(composed.blockers[0]?.message);
  const confirmedAnchors = [{ tokenId: 'brand.anchor', mode: 'light', hex: '#3366cc' }];
  const intendedSurfaces = ['product-primitives', 'product-semantics', 'data-visualization'];
  const decision = {
    snapshot,
    proposal: composed.proposal,
    confirmedAnchors,
    intendedSurfaces,
    roleDecisions: [],
    visualizationSettings: strategySetFixture.visualizationSettings,
  };
  const reviewHash = createColorSystemReviewHash(decision);
  const document = createColorSystemBuilderPackage({
    snapshot,
    audit,
    completeness: { partial: false, cancelled: false, scannedNodeCount: 1 },
    strategySet: strategySetFixture,
    candidateId: candidate.id,
    candidateHash: candidate.candidateHash,
    proposal: composed.proposal,
    decision: {
      reviewHash,
      confirmedAnchorTokenIds: ['brand.anchor'],
      confirmedAnchors,
      intendedSurfaces,
      roleDecisions: [],
      visualizationSettings: strategySetFixture.visualizationSettings,
    },
  });
  return {
    type: 'color-system-export-result' as const,
    requestId: 'builder-package-result',
    success: true as const,
    sourceHash: snapshot.sourceHash,
    kind: 'builder-package' as const,
    artifactVersion: 'teul-color-system-builder-package/v1' as const,
    artifactHash: document.packageHash,
    fileName: 'teul-color-system-balanced-contrast-123456789abc.json',
    mimeType: 'application/json' as const,
    content: serializeColorSystemBuilderPackage(document),
  };
}

const validMessages = [
  {
    type: 'color-system-audit-progress',
    requestId: 'audit-1',
    phase: 'usage',
    completed: 4,
    total: 10,
    pageName: 'Product',
    message: 'Scanning Product',
  },
  {
    type: 'color-system-audit-result',
    requestId: 'audit-1',
    success: true,
    cancelled: false,
    partial: false,
    scannedNodeCount: 10,
    snapshot,
    audit,
    enabledLibraryDescriptors: [],
    libraryBoundaryNote: 'Enabled-library data is descriptor-only.',
  },
  {
    type: 'color-system-declared-pairs-update-result',
    requestId: 'pairs-1',
    success: true,
    previousSourceHash: snapshot.sourceHash,
    sourceHash: snapshot.sourceHash,
    snapshot,
    audit,
  },
  {
    type: 'color-system-proposal-approval-result',
    requestId: 'review-1',
    success: true,
    sourceHash: snapshot.sourceHash,
    bundle: suitableBundle,
    reviewHash: digest('review'),
    confirmedAnchorTokenIds: ['brand.anchor'],
    intendedSurfaces: ['product-primitives'],
  },
  {
    type: 'color-system-proposal-approval-result',
    requestId: 'review-2',
    success: true,
    sourceHash: snapshot.sourceHash,
    bundle: noSolutionBundle,
    confirmedAnchorTokenIds: ['brand.anchor'],
    intendedSurfaces: ['product-primitives'],
  },
  {
    type: 'color-system-proposal-confirmation-result',
    requestId: 'confirm-1',
    success: true,
    sourceHash: snapshot.sourceHash,
    proposalHash: suitableBundle.proposal.proposalHash,
    reviewHash: digest('review'),
    approvalHash: digest('approval'),
  },
  {
    type: 'color-system-proposal-apply-result',
    requestId: 'apply-1',
    success: true,
    sourceHash: snapshot.sourceHash,
    proposalHash: suitableBundle.proposal.proposalHash,
    approvalHash: digest('approval'),
    outputName: 'Brand Product',
    collectionName: 'Brand Product Colors',
    variableCount: 24,
    aliasCount: 10,
    styleCount: 0,
    overviewFrameName: 'Brand Product Overview',
    overviewScaleCount: 2,
    overviewSwatchCount: 48,
    warnings: [],
    undoBoundaryCommitted: true,
  },
  {
    type: 'color-system-export-result',
    requestId: 'export-1',
    success: true,
    sourceHash: snapshot.sourceHash,
    kind: 'audit',
    fileName: 'teul-color-audit.json',
    mimeType: 'application/json',
    content: '{"schemaVersion":"1.0.0"}',
  },
] as const;

describe('validateColorSystemAuditPluginMessage', () => {
  it.each(validMessages)('accepts the bounded $type contract', message => {
    expect(validateColorSystemAuditPluginMessage(message)).toEqual({ valid: true, message });
  });

  it('validates the versioned builder package result and its canonical content hash', () => {
    const message = builderPackageExportMessage();
    expect(
      validateColorSystemAuditPluginMessage(message, {
        requestId: message.requestId,
        sourceHash: message.sourceHash,
        exportKind: 'builder-package',
      })
    ).toEqual({ valid: true, message });
    expect(
      validateColorSystemAuditPluginMessage({
        ...message,
        artifactHash: digest('forged-package'),
      }).valid
    ).toBe(false);
    const parsed = JSON.parse(message.content);
    parsed.handoffBoundary.publishesFigmaLibrary = true;
    expect(
      validateColorSystemAuditPluginMessage({
        ...message,
        content: JSON.stringify(parsed),
      }).valid
    ).toBe(false);
    expect(validateColorSystemAuditPluginMessage({ ...message, unexpected: true }).valid).toBe(
      false
    );
  });

  it('validates source-territory evidence exactly and rejects threshold drift', () => {
    const parsed = JSON.parse(builderPackageExportMessage().content) as MutableRecord;
    const source = parsed.source as MutableRecord;
    const strategy = parsed.strategy as MutableRecord;
    const validCore = {
      snapshot: source.snapshot,
      audit: source.audit,
      completeness: source.completeness,
      strategySet: strategy.set,
      proposal: parsed.proposal,
    };
    expect(validateColorSystemBuilderPackageCore(validCore)).toBe(true);

    const tampered = JSON.parse(JSON.stringify(validCore)) as typeof validCore;
    const set = tampered.strategySet as MutableRecord;
    const candidate = (set.candidates as MutableRecord[])[0];
    const evidence = candidate.evidence as MutableRecord;
    const territory = evidence.sourceTerritory as MutableRecord;
    territory.thresholdDeltaEOK = 0.23;
    expect(validateColorSystemBuilderPackageCore(tampered)).toBe(false);
  });

  it('accepts the exact compact projection of a backend-validated strategy set', () => {
    expect(validateColorSystemAuditPluginMessage(strategyMessage)).toEqual({
      valid: true,
      message: strategyMessage,
    });
  });

  it('accepts exact count-only evidence for a capped failed strategy search', () => {
    const message = {
      type: 'color-system-strategy-set-result' as const,
      requestId: 'strategies-capped',
      success: false as const,
      error: 'No direction completed the bounded search.',
      blockers: [
        {
          code: 'VISUALIZATION_EVALUATION_LIMIT_REACHED' as const,
          message: 'Close harmony reached the bounded Data Viz limit.',
          direction: 'close-harmony' as const,
          searchEvidence: cappedSearchEvidence,
          alternatives: ['Change the declared chart context.'],
        },
      ],
    };

    expect(validateColorSystemAuditPluginMessage(message)).toEqual({ valid: true, message });
  });

  it('accepts typed no-solution blockers for missing and mismatched source territory', () => {
    const unavailable = {
      type: 'color-system-strategy-set-result' as const,
      requestId: 'strategies-source-reference-unavailable',
      success: false as const,
      error: 'Structured source references are unavailable.',
      blockers: [
        {
          code: 'SOURCE_REFERENCE_TERRITORY_UNAVAILABLE' as const,
          message: 'No ordered opaque chromatic source references were available.',
          alternatives: ['Re-analyze the named source frames.'],
        },
      ],
    };
    const mismatch = {
      type: 'color-system-strategy-set-result' as const,
      requestId: 'strategies-source-territory-mismatch',
      success: false as const,
      error: 'No direction remained inside the observed source territory.',
      blockers: [
        {
          code: 'SOURCE_TERRITORY_MISMATCH' as const,
          message: 'Wide spectrum exceeded the reviewed source-territory limit.',
          direction: 'wide-spectrum' as const,
          searchEvidence: cappedSearchEvidence,
          alternatives: ['Review a direction closer to the ordered source references.'],
        },
      ],
    };

    expect(validateColorSystemAuditPluginMessage(unavailable)).toEqual({
      valid: true,
      message: unavailable,
    });
    expect(validateColorSystemAuditPluginMessage(mismatch)).toEqual({
      valid: true,
      message: mismatch,
    });
    expect(
      validateColorSystemAuditPluginMessage({
        ...mismatch,
        blockers: [{ ...mismatch.blockers[0], searchEvidence: undefined }],
      }).valid
    ).toBe(false);
  });

  it('rejects forged or value-bearing failed-search evidence', () => {
    const base = {
      type: 'color-system-strategy-set-result' as const,
      requestId: 'strategies-forged',
      success: false as const,
      error: 'No direction completed the bounded search.',
      blockers: [
        {
          code: 'VISUALIZATION_EVALUATION_LIMIT_REACHED' as const,
          message: 'Close harmony reached the bounded Data Viz limit.',
          direction: 'close-harmony' as const,
          searchEvidence: cappedSearchEvidence,
          alternatives: ['Change the declared chart context.'],
        },
      ],
    };
    const forged = structuredClone(base);
    forged.blockers[0].searchEvidence.visualizationEvaluationCount = 8_191;
    expect(validateColorSystemAuditPluginMessage(forged).valid).toBe(false);

    const valueBearing = structuredClone(base) as MutableRecord;
    const blockers = valueBearing.blockers as MutableRecord[];
    (blockers[0].searchEvidence as MutableRecord).generatedHexes = ['#123456'];
    expect(validateColorSystemAuditPluginMessage(valueBearing).valid).toBe(false);
  });

  it('accepts an honestly partial strategy projection with typed direction blockers', () => {
    const partialSnapshot = createSourceSystemSnapshot({
      sourceKind: 'figma-document',
      sourceLocator: 'figma-file:partial-strategy',
      authorization: { status: 'user-authorized' },
      documentProfile: 'srgb',
      resourceScope: { kind: 'all-local-resources', localVariableCount: 3, localStyleCount: 0 },
      usageScope: 'selection',
      capturedAt: '2026-08-03T12:00:00.000Z',
      modes: ['light'],
      tokens: ['#e4f222', '#ffffff', '#111111'].map((hex, index) => ({
        id: index === 0 ? 'brand.anchor' : `brand.supporting-${index}`,
        name: index === 0 ? 'Solar' : `Supporting ${index}`,
        path: ['brand', index === 0 ? 'anchor' : `supporting-${index}`],
        valuesByMode: {
          light: {
            colorSpace: 'srgb' as const,
            hex,
            components: [
              parseInt(hex.slice(1, 3), 16) / 255,
              parseInt(hex.slice(3, 5), 16) / 255,
              parseInt(hex.slice(5, 7), 16) / 255,
            ] as const,
            alpha: 1,
          },
        },
        evidence: [{ kind: 'figma-resource' as const, locator: `variable:${index}` }],
        roleEvidence: [],
      })),
      supportedUsage: [],
      unsupportedUsage: [],
      declaredPairs: [],
    });
    const baseRequest = {
      sourceHash: partialSnapshot.sourceHash,
      primary: {
        tokenId: 'brand.anchor',
        name: 'Solar',
        mode: 'light',
        hex: '#e4f222',
      },
      visualizationSettings: strategySetFixture.visualizationSettings,
      existingSourceHexes: ['#e4f222', '#ffffff', '#111111'],
    };
    const complete = buildColorSystemStrategySet(baseRequest);
    const failed = buildColorSystemStrategySet({
      ...baseRequest,
      visualizationSettings: { ...baseRequest.visualizationSettings, categoryCount: 6 },
    });
    expect(complete.status).toBe('ready');
    expect(failed.status).toBe('no-solution');
    if (complete.status !== 'ready' || failed.status !== 'no-solution') return;
    const omitted = failed.blockers.find(blocker => blocker.direction);
    if (!omitted?.direction) throw new Error('Missing typed omitted-direction evidence.');
    const candidates = complete.strategySet.candidates.filter(
      candidate => candidate.id !== omitted.direction
    );
    const recommendation = buildColorSystemStrategyRecommendation(candidates);
    const blockers = [omitted];
    const partialContent = {
      ...complete.strategySet,
      candidates,
      recommendation,
      blockers,
    };
    const partial = {
      ...partialContent,
      strategySetHash: deterministicContentHash({
        schemaVersion: partialContent.schemaVersion,
        policyVersion: partialContent.policyVersion,
        sourceHash: partialContent.sourceHash,
        briefHash: partialContent.briefHash,
        primary: partialContent.primary,
        visualizationSettings: partialContent.visualizationSettings,
        recommendation,
        blockers,
        candidates: candidates.map(candidate => ({
          id: candidate.id,
          modelHash: candidate.modelHash,
          candidateHash: candidate.candidateHash,
        })),
      }),
    };
    expect(partial.candidates).toHaveLength(2);
    expect(
      validateColorSystemAuditPluginMessage({
        ...strategyMessage,
        sourceHash: partialSnapshot.sourceHash,
        strategySet: projectColorSystemStrategyPreview(partial, partialSnapshot),
      }).valid
    ).toBe(true);
  });

  it('accepts one retained direction when the other two have explicit typed blockers', () => {
    const message = mutableStrategyMessage();
    const strategySet = message.strategySet as MutableRecord;
    const retained = (strategySet.candidates as MutableRecord[])[0];
    strategySet.candidates = [retained];
    strategySet.recommendation = {
      policyVersion: 'teul-strategy-recommendation-v1',
      recommendedCandidateId: retained.id,
      statement: 'One complete direction remains after bounded hard-gate evaluation.',
    };
    strategySet.blockers = ['balanced-contrast', 'wide-spectrum'].map(direction => ({
      code: 'NO_DISTINCT_SECONDARY_STRATEGY',
      message: `${direction} did not produce a complete distinct system.`,
      direction,
      alternatives: ['Use the retained complete direction.'],
    }));

    expect(validateColorSystemAuditPluginMessage(message).valid).toBe(true);
  });

  it.each([
    [
      'a truncated 12-step scale',
      (message: MutableRecord) => {
        const family = strategyLightFamily(message);
        family.lightSteps = (family.lightSteps as unknown[]).slice(0, 11);
      },
    ],
    [
      'an uppercase non-canonical swatch',
      (message: MutableRecord) => {
        const family = strategyLightFamily(message);
        (family.lightSteps as string[])[0] = '#ABCDEF';
      },
    ],
    [
      'a truncated Dark scale',
      (message: MutableRecord) => {
        const family = strategyLightFamily(message);
        family.darkSteps = (family.darkSteps as unknown[]).slice(0, 11);
      },
    ],
    [
      'a missing Product semantic mapping',
      (message: MutableRecord) => {
        const candidate = strategyCandidate(message);
        candidate.productSemantics = (candidate.productSemantics as unknown[]).slice(0, 12);
      },
    ],
    [
      'a reordered Product semantic mapping',
      (message: MutableRecord) => {
        const semantics = strategyCandidate(message).productSemantics as unknown[];
        [semantics[0], semantics[1]] = [semantics[1], semantics[0]];
      },
    ],
    [
      'an uppercase Product semantic color',
      (message: MutableRecord) => {
        const semantics = strategyCandidate(message).productSemantics as MutableRecord[];
        (semantics[0].light as MutableRecord).hex = '#ABCDEF';
      },
    ],
    [
      'a family index that disagrees with its slot',
      (message: MutableRecord) => {
        strategyLightFamily(message).familyIndex = 2;
      },
    ],
    [
      'a candidate Primary that disagrees with the set',
      (message: MutableRecord) => {
        (strategyCandidate(message).primary as MutableRecord).hex = '#000000';
      },
    ],
    [
      'a malformed categorical color array',
      (message: MutableRecord) => {
        const visualization = strategyCandidate(message).visualization as MutableRecord;
        visualization.categorical = [];
      },
    ],
    [
      'an unexpected canonical-model field',
      (message: MutableRecord) => {
        strategyCandidate(message).modelHash = digest('hidden-model');
      },
    ],
    [
      'a recommendation for an unavailable direction',
      (message: MutableRecord) => {
        const strategySet = message.strategySet as MutableRecord;
        (strategySet.recommendation as MutableRecord).recommendedCandidateId = 'missing';
      },
    ],
    [
      'a direction blocker that overlaps a selectable candidate',
      (message: MutableRecord) => {
        const strategySet = message.strategySet as MutableRecord;
        const candidate = strategyCandidate(message);
        strategySet.blockers = [
          {
            code: 'NO_DISTINCT_SECONDARY_STRATEGY',
            message: 'Direction is unavailable.',
            direction: candidate.id,
            alternatives: ['Choose another direction.'],
          },
        ];
      },
    ],
    [
      'a malformed candidate hash',
      (message: MutableRecord) => {
        strategyCandidate(message).candidateHash = 'sha256:not-a-hash';
      },
    ],
    [
      'a malformed strategy-set hash',
      (message: MutableRecord) => {
        (message.strategySet as MutableRecord).strategySetHash = 'sha256:not-a-hash';
      },
    ],
  ])('rejects %s', (_label, corrupt) => {
    const message = mutableStrategyMessage();
    corrupt(message);
    expect(validateColorSystemAuditPluginMessage(message).valid).toBe(false);
  });

  it('accepts the five canonical completion surfaces and rejects a sixth unsupported surface', () => {
    const completionMessage = {
      ...validMessages[3],
      requestId: 'review-completion',
      intendedSurfaces: [...COLOR_SYSTEM_INTENDED_SURFACES],
    };

    expect(validateColorSystemAuditPluginMessage(completionMessage)).toEqual({
      valid: true,
      message: completionMessage,
    });
    expect(
      validateColorSystemAuditPluginMessage({
        ...completionMessage,
        intendedSurfaces: [...COLOR_SYSTEM_INTENDED_SURFACES, 'brand-marketing'],
      }).valid
    ).toBe(false);
  });

  it.each([
    {
      type: 'color-system-audit-result',
      requestId: 'audit-error',
      success: false,
      cancelled: true,
      partial: false,
      error: 'The scan was cancelled.',
    },
    {
      type: 'color-system-declared-pairs-update-result',
      requestId: 'pairs-error',
      success: false,
      error: 'The source changed.',
    },
    {
      type: 'color-system-proposal-approval-result',
      requestId: 'review-error',
      success: false,
      error: 'Proposal review failed.',
    },
    {
      type: 'color-system-proposal-confirmation-result',
      requestId: 'confirm-error',
      success: false,
      error: 'Proposal confirmation failed.',
    },
    {
      type: 'color-system-proposal-apply-result',
      requestId: 'apply-error',
      success: false,
      error: 'Apply rolled back.',
      failureReceiptVersion: COLOR_SYSTEM_APPLY_FAILURE_RECEIPT_VERSION,
      failureStage: 'preflight',
      cleanupReceipt: {
        version: COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
        attempted: false,
        removedResourceCount: 0,
        complete: true,
        failureCount: 0,
        failureMessages: [],
      },
      rollbackFailures: [],
    },
    {
      type: 'color-system-export-result',
      requestId: 'export-error',
      success: false,
      error: 'Export failed.',
    },
  ])('accepts an exact failure envelope for $type', message => {
    expect(validateColorSystemAuditPluginMessage(message).valid).toBe(true);
  });

  it('retains correlated rollback diagnostics above 256 characters within the evidence limit', () => {
    const rollbackFailure = `style "Brand/${'critical-token-'.repeat(24)}" removal failed`;
    expect(rollbackFailure.length).toBeGreaterThan(256);
    const message = {
      type: 'color-system-proposal-apply-result' as const,
      requestId: 'apply-long-rollback',
      success: false as const,
      error: 'Style creation failed.',
      failureReceiptVersion: COLOR_SYSTEM_APPLY_FAILURE_RECEIPT_VERSION,
      failureStage: 'style-creation' as const,
      cleanupReceipt: {
        version: COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
        attempted: true,
        removedResourceCount: null,
        complete: false,
        failureCount: 1,
        failureMessages: [rollbackFailure],
      },
      rollbackFailures: [rollbackFailure],
    };

    expect(
      validateColorSystemAuditPluginMessage(message, {
        requestId: message.requestId,
      })
    ).toEqual({ valid: true, message });
    expect(
      validateColorSystemAuditPluginMessage({
        ...message,
        cleanupReceipt: {
          ...message.cleanupReceipt,
          failureMessages: ['x'.repeat(COLOR_SYSTEM_AUDIT_EVIDENCE_TEXT_LIMIT + 1)],
        },
        rollbackFailures: ['x'.repeat(COLOR_SYSTEM_AUDIT_EVIDENCE_TEXT_LIMIT + 1)],
      }).valid
    ).toBe(false);
  });

  it('rejects unrelated messages, extra fields, invalid request IDs, and non-SHA receipts', () => {
    expect(
      validateColorSystemAuditPluginMessage({
        type: 'grid-applied',
        requestId: 'grid-1',
        success: true,
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemAuditPluginMessage({ ...validMessages[0], unexpected: true }).valid
    ).toBe(false);
    expect(
      validateColorSystemAuditPluginMessage({ ...validMessages[0], requestId: 'bad request' }).valid
    ).toBe(false);
    expect(
      validateColorSystemAuditPluginMessage({
        ...validMessages[5],
        approvalHash: 'fnv1a32:not-a-current-receipt',
      }).valid
    ).toBe(false);
  });

  it('binds audit and declared-pair artifacts to their advertised source hashes', () => {
    expect(
      validateColorSystemAuditPluginMessage({
        ...validMessages[1],
        audit: { ...audit, sourceHash: digest('other-source') },
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemAuditPluginMessage({
        ...validMessages[2],
        sourceHash: digest('other-source'),
      }).valid
    ).toBe(false);
  });

  it('validates canonical structured sections without collapsing a repeated source color', () => {
    const { sourceHash: _sourceHash, ...snapshotInput } = snapshot;
    const repeatedValue = {
      colorSpace: 'srgb' as const,
      hex: '#B2C7EB',
      components: [178 / 255, 199 / 255, 235 / 255] as const,
      alpha: 1,
    };
    const sourceSections = [
      {
        kind: 'secondary' as const,
        title: 'Studio Palette - Colors (Secondary)',
        sourceNodeId: 'studio-secondary',
        extractionMethod: 'explicit-heading' as const,
        entries: [
          {
            id: 'source-section:secondary:sky',
            name: 'Sky',
            order: 1,
            value: repeatedValue,
            evidence: [{ kind: 'figma-node' as const, locator: 'secondary-sky-label' }],
          },
        ],
        evidence: [{ kind: 'figma-node' as const, locator: 'studio-secondary' }],
      },
      {
        kind: 'product-graphics' as const,
        title: 'Studio Palette - Colors (Product Graphics)',
        sourceNodeId: 'studio-product-graphics',
        extractionMethod: 'explicit-heading' as const,
        entries: [
          {
            id: 'source-section:product-graphics:sky',
            name: 'Sky',
            order: 1,
            value: repeatedValue,
            evidence: [{ kind: 'figma-node' as const, locator: 'graphics-sky-label' }],
          },
        ],
        evidence: [{ kind: 'figma-node' as const, locator: 'studio-product-graphics' }],
      },
    ];
    const structuredSnapshot = createSourceSystemSnapshot({
      ...snapshotInput,
      sourceLocator: 'figma-file:studio-palette',
      sourceSections,
    });
    const structuredMessage = {
      ...validMessages[1],
      requestId: 'audit-structured-sections',
      snapshot: structuredSnapshot,
      audit: auditColorSystem(structuredSnapshot),
    };

    expect(validateColorSystemAuditPluginMessage(structuredMessage).valid).toBe(true);

    const structuredCandidateSnapshot = createSourceSystemSnapshot({
      ...snapshotInput,
      sourceLocator: 'figma-file:studio-palette',
      modes: [...snapshotInput.modes, 'Source'],
      tokens: [
        ...snapshotInput.tokens,
        {
          id: 'structured-source:srgb:b2c7eb',
          name: 'Sky',
          path: ['Structured source', 'Sky', '#B2C7EB'],
          sourceRepresentation: 'structured-source',
          modeGroupId: 'figma-structured-source-sections',
          valuesByMode: { Source: repeatedValue },
          evidence: [{ kind: 'figma-node', locator: 'secondary-sky-label' }],
          roleEvidence: [],
        },
      ],
      sourceSections,
    });
    const structuredCandidateMessage = {
      ...structuredMessage,
      snapshot: structuredCandidateSnapshot,
      audit: auditColorSystem(structuredCandidateSnapshot),
    };
    expect(validateColorSystemAuditPluginMessage(structuredCandidateMessage).valid).toBe(true);
    const candidateWithoutSections = JSON.parse(JSON.stringify(structuredCandidateMessage)) as {
      snapshot: { sourceSections?: unknown };
    };
    delete candidateWithoutSections.snapshot.sourceSections;
    expect(() => validateColorSystemAuditPluginMessage(candidateWithoutSections)).not.toThrow();
    expect(validateColorSystemAuditPluginMessage(candidateWithoutSections).valid).toBe(false);
    expect(structuredSnapshot.sourceSections?.map(section => section.kind)).toEqual([
      'secondary',
      'product-graphics',
    ]);
    expect(
      structuredSnapshot.sourceSections?.flatMap(section =>
        section.entries.map(entry => entry.value.hex)
      )
    ).toEqual(['#b2c7eb', '#b2c7eb']);

    const changedTitle = createSourceSystemSnapshot({
      ...snapshotInput,
      sourceLocator: 'figma-file:studio-palette',
      sourceSections: sourceSections.map(section =>
        section.kind === 'secondary'
          ? { ...section, title: 'Studio Palette — Colors (Secondary)' }
          : section
      ),
    });
    expect(changedTitle.sourceHash).not.toBe(structuredSnapshot.sourceHash);

    const duplicateKind = JSON.parse(JSON.stringify(structuredMessage)) as {
      snapshot: { sourceSections: Array<Record<string, unknown>> };
    };
    duplicateKind.snapshot.sourceSections[1].kind = 'secondary';
    expect(validateColorSystemAuditPluginMessage(duplicateKind).valid).toBe(false);

    const brokenOrder = JSON.parse(JSON.stringify(structuredMessage)) as {
      snapshot: { sourceSections: Array<{ entries: Array<Record<string, unknown>> }> };
    };
    brokenOrder.snapshot.sourceSections[0].entries[0].order = 2;
    expect(validateColorSystemAuditPluginMessage(brokenOrder).valid).toBe(false);

    const noEvidence = JSON.parse(JSON.stringify(structuredMessage)) as {
      snapshot: { sourceSections: Array<{ entries: Array<Record<string, unknown>> }> };
    };
    noEvidence.snapshot.sourceSections[0].entries[0].evidence = [];
    expect(validateColorSystemAuditPluginMessage(noEvidence).valid).toBe(false);

    const forgedFile = JSON.parse(JSON.stringify(structuredMessage)) as {
      snapshot: { sourceLocator: string };
    };
    forgedFile.snapshot.sourceLocator = 'figma-file:forged-copy';
    expect(validateColorSystemAuditPluginMessage(forgedFile).valid).toBe(true);

    const forgedNode = JSON.parse(JSON.stringify(structuredMessage)) as {
      snapshot: { sourceSections: Array<Record<string, unknown>> };
    };
    forgedNode.snapshot.sourceSections[0].sourceNodeId = 'copied-secondary';
    expect(validateColorSystemAuditPluginMessage(forgedNode).valid).toBe(true);

    const forgedTitle = JSON.parse(JSON.stringify(structuredMessage)) as {
      snapshot: { sourceSections: Array<Record<string, unknown>> };
    };
    forgedTitle.snapshot.sourceSections[0].title = 'Legacy secondary palette';
    expect(validateColorSystemAuditPluginMessage(forgedTitle).valid).toBe(false);

    const contradictoryHeading = JSON.parse(JSON.stringify(structuredMessage)) as {
      snapshot: { sourceSections: Array<Record<string, unknown>> };
    };
    contradictoryHeading.snapshot.sourceSections[0].extractionMethod = 'owner-pinned-node';
    contradictoryHeading.snapshot.sourceSections[0].kind = 'primary';
    expect(validateColorSystemAuditPluginMessage(contradictoryHeading).valid).toBe(false);
  });

  it('accepts explicit role headings in an open document and rejects tampering', () => {
    const { sourceHash: _sourceHash, ...snapshotInput } = snapshot;
    const fingerprint = [
      ['primary', 'Studio Palette - Colors (Primary)', 'studio-primary'],
      ['secondary', 'Studio Palette - Colors (Secondary)', 'studio-secondary'],
      ['product-graphics', 'Studio Palette - Colors (Product Graphics)', 'studio-product-graphics'],
      ['data-visualization', 'Studio Palette - Colors (Data Vis)', 'studio-data-visualization'],
      ['typography', 'Studio Palette - Colors (Typography)', 'studio-typography'],
    ] as const;
    const sourceSections = fingerprint.map(([kind, title, sourceNodeId], index) => ({
      kind,
      title,
      sourceNodeId,
      extractionMethod: 'explicit-heading' as const,
      entries: [
        {
          id: `source-section:${kind}:entry`,
          name: `Source ${index + 1}`,
          order: 1,
          value: {
            colorSpace: 'srgb' as const,
            hex: '#3366cc',
            components: [0.2, 0.4, 0.8] as const,
            alpha: 1,
          },
          evidence: [{ kind: 'figma-node' as const, locator: `${sourceNodeId}:label` }],
        },
      ],
      evidence: [{ kind: 'figma-node' as const, locator: sourceNodeId }],
    }));
    const openDocumentSnapshot = createSourceSystemSnapshot({
      ...snapshotInput,
      sourceLocator: 'figma-file:open-document',
      sourceSections,
    });
    const message = {
      ...validMessages[1],
      requestId: 'audit-open-document-explicit-headings',
      snapshot: openDocumentSnapshot,
      audit: auditColorSystem(openDocumentSnapshot),
    };

    expect(validateColorSystemAuditPluginMessage(message).valid).toBe(true);
    expect(() =>
      createSourceSystemSnapshot({
        ...snapshotInput,
        sourceLocator: 'figma-file:open-document',
        sourceSections: sourceSections.slice(0, 4),
      })
    ).not.toThrow();

    const partial = JSON.parse(JSON.stringify(message)) as {
      snapshot: { sourceSections: unknown[] };
    };
    partial.snapshot.sourceSections.pop();
    expect(validateColorSystemAuditPluginMessage(partial).valid).toBe(true);

    const mismatched = JSON.parse(JSON.stringify(message)) as {
      snapshot: { sourceSections: Array<{ title: string }> };
    };
    mismatched.snapshot.sourceSections[0].title = 'Studio Palette Primary revised';
    expect(validateColorSystemAuditPluginMessage(mismatched).valid).toBe(false);
  });

  it('accepts only bounded, role-free observed-literal source candidate metadata', () => {
    const observedBlueValue = {
      colorSpace: 'srgb' as const,
      hex: '#3366cc',
      components: [0.2, 0.4, 0.8] as const,
      alpha: 1,
    };
    const observedRedValue = {
      colorSpace: 'srgb' as const,
      hex: '#ff0000',
      components: [1, 0, 0] as const,
      alpha: 1,
    };
    const blueIdentity = observedLiteralCandidateIdentity('rendered', observedBlueValue)!;
    const redIdentity = observedLiteralCandidateIdentity('rendered', observedRedValue)!;
    const observedSnapshot = createSourceSystemSnapshot({
      sourceKind: 'figma-document',
      sourceLocator: 'figma-file:literal-only',
      authorization: { status: 'user-authorized' },
      documentProfile: 'srgb',
      resourceScope: { kind: 'all-local-resources', localVariableCount: 0, localStyleCount: 0 },
      usageScope: 'selection',
      capturedAt: '2026-08-02T12:00:00.000Z',
      modes: ['rendered'],
      tokens: [
        {
          id: blueIdentity.id,
          name: 'Observed #3366CC',
          path: blueIdentity.path,
          sourceRepresentation: 'observed-literal',
          observedUsageCount: 4,
          observedUsageRank: 1,
          modeGroupId: 'figma-observed-literals',
          valuesByMode: { rendered: observedBlueValue },
          evidence: [
            { kind: 'figma-node', locator: 'node-blue' },
            { kind: 'document-page', locator: 'page-blue' },
          ],
          roleEvidence: [],
        },
        {
          id: redIdentity.id,
          name: 'Observed #FF0000',
          path: redIdentity.path,
          sourceRepresentation: 'observed-literal',
          observedUsageCount: 4,
          observedUsageRank: 2,
          modeGroupId: 'figma-observed-literals',
          valuesByMode: { rendered: observedRedValue },
          evidence: [{ kind: 'figma-node', locator: 'node-red' }],
          roleEvidence: [],
        },
      ],
      supportedUsage: [
        {
          id: 'usage-blue',
          mode: 'rendered',
          value: observedBlueValue,
          count: 4,
          evidence: [
            { kind: 'figma-node', locator: 'node-blue' },
            { kind: 'document-page', locator: 'page-blue' },
          ],
        },
        {
          id: 'usage-red',
          mode: 'rendered',
          value: observedRedValue,
          count: 4,
          evidence: [{ kind: 'figma-node', locator: 'node-red' }],
        },
      ],
      unsupportedUsage: [],
      declaredPairs: [],
    });
    const observedAudit = auditColorSystem(observedSnapshot);
    const message = {
      type: 'color-system-audit-result' as const,
      requestId: 'audit-observed-literal',
      success: true as const,
      cancelled: false,
      partial: false,
      scannedNodeCount: 8,
      snapshot: observedSnapshot,
      audit: observedAudit,
      enabledLibraryDescriptors: [],
      libraryBoundaryNote: 'Metadata only.',
    };

    expect(validateColorSystemAuditPluginMessage(message).valid).toBe(true);

    type MutableObservedMessage = {
      snapshot: {
        sourceKind: string;
        resourceScope: {
          kind: string;
          localVariableCount: number;
          localStyleCount: number;
        };
        tokens: Array<Record<string, unknown>>;
        supportedUsage: Array<Record<string, unknown>>;
      };
    };
    const cloneMessage = (): MutableObservedMessage =>
      JSON.parse(JSON.stringify(message)) as MutableObservedMessage;

    const reorderedEvidence = cloneMessage();
    (reorderedEvidence.snapshot.supportedUsage[0].evidence as unknown[]).reverse();
    expect(validateColorSystemAuditPluginMessage(reorderedEvidence).valid).toBe(true);

    const { sourceHash: _observedSourceHash, ...observedSnapshotInput } = observedSnapshot;
    const blueToken = observedSnapshot.tokens.find(token => token.id === blueIdentity.id)!;
    const blueUsage = observedSnapshot.supportedUsage.find(usage => usage.id === 'usage-blue')!;
    const remoteEvidence = { kind: 'figma-node' as const, locator: 'remote-blue-node' };
    const remoteAggregatedSnapshot = createSourceSystemSnapshot({
      ...observedSnapshotInput,
      tokens: observedSnapshot.tokens.map(token =>
        token.id === blueIdentity.id
          ? {
              ...blueToken,
              observedUsageCount: 8,
              evidence: [...blueToken.evidence, remoteEvidence],
            }
          : token
      ),
      supportedUsage: [
        ...observedSnapshot.supportedUsage,
        {
          ...blueUsage,
          id: 'remote-usage-blue',
          tokenId: 'remote-variable-id',
          evidence: [remoteEvidence],
        },
      ],
    });
    const remoteAggregatedMessage = {
      ...message,
      requestId: 'audit-observed-remote',
      scannedNodeCount: 12,
      snapshot: remoteAggregatedSnapshot,
      audit: auditColorSystem(remoteAggregatedSnapshot),
    };
    expect(validateColorSystemAuditPluginMessage(remoteAggregatedMessage).valid).toBe(true);

    const wrongSource = cloneMessage();
    wrongSource.snapshot.sourceKind = 'dtcg-tokens';
    expect(validateColorSystemAuditPluginMessage(wrongSource).valid).toBe(false);

    const authoredCount = cloneMessage();
    authoredCount.snapshot.resourceScope.localVariableCount = 1;
    expect(validateColorSystemAuditPluginMessage(authoredCount).valid).toBe(false);

    const wrongModeGroup = cloneMessage();
    wrongModeGroup.snapshot.tokens[0].modeGroupId = 'other';
    expect(validateColorSystemAuditPluginMessage(wrongModeGroup).valid).toBe(false);

    const tamperedIdentity = cloneMessage();
    tamperedIdentity.snapshot.tokens[0].id = 'observed-literal:3366cc:tampered';
    expect(validateColorSystemAuditPluginMessage(tamperedIdentity).valid).toBe(false);

    const tamperedPath = cloneMessage();
    tamperedPath.snapshot.tokens[0].path = ['observed-literals', 'tampered'];
    expect(validateColorSystemAuditPluginMessage(tamperedPath).valid).toBe(false);

    const inventedScale = cloneMessage();
    inventedScale.snapshot.tokens[0].scalePosition = { scaleId: 'invented', step: 1 };
    expect(validateColorSystemAuditPluginMessage(inventedScale).valid).toBe(false);

    const emptyAliases = cloneMessage();
    emptyAliases.snapshot.tokens[0].aliasTargetsByMode = {};
    expect(validateColorSystemAuditPluginMessage(emptyAliases).valid).toBe(false);

    const directAlias = cloneMessage();
    directAlias.snapshot.tokens[0].aliasTargetId = 'invented.alias';
    expect(validateColorSystemAuditPluginMessage(directAlias).valid).toBe(false);

    const changedCount = cloneMessage();
    changedCount.snapshot.supportedUsage[0].count = 5;
    expect(validateColorSystemAuditPluginMessage(changedCount).valid).toBe(false);

    const changedEvidence = cloneMessage();
    changedEvidence.snapshot.supportedUsage[0].evidence = [
      { kind: 'figma-node', locator: 'tampered' },
    ];
    expect(validateColorSystemAuditPluginMessage(changedEvidence).valid).toBe(false);

    const duplicateUsage = cloneMessage();
    duplicateUsage.snapshot.supportedUsage.push({
      ...duplicateUsage.snapshot.supportedUsage[0],
      id: 'duplicate-usage-blue',
    });
    expect(validateColorSystemAuditPluginMessage(duplicateUsage).valid).toBe(false);

    const duplicateCandidate = cloneMessage();
    duplicateCandidate.snapshot.tokens[1].valuesByMode =
      duplicateCandidate.snapshot.tokens[0].valuesByMode;
    duplicateCandidate.snapshot.tokens[1].observedUsageCount =
      duplicateCandidate.snapshot.tokens[0].observedUsageCount;
    duplicateCandidate.snapshot.tokens[1].evidence = duplicateCandidate.snapshot.tokens[0].evidence;
    expect(validateColorSystemAuditPluginMessage(duplicateCandidate).valid).toBe(false);

    const wrongRankOrder = cloneMessage();
    wrongRankOrder.snapshot.tokens[0].observedUsageRank = 2;
    wrongRankOrder.snapshot.tokens[1].observedUsageRank = 1;
    expect(validateColorSystemAuditPluginMessage(wrongRankOrder).valid).toBe(false);

    const missingRank = JSON.parse(JSON.stringify(message)) as typeof message;
    delete (missingRank.snapshot.tokens[0] as { observedUsageRank?: number }).observedUsageRank;
    expect(validateColorSystemAuditPluginMessage(missingRank).valid).toBe(false);

    const inventedRole = JSON.parse(JSON.stringify(message)) as typeof message;
    (
      inventedRole.snapshot.tokens[0] as unknown as {
        roleEvidence: Array<{
          role: string;
          status: string;
          confidence: number;
          evidence: unknown[];
          reviewerDisposition: string;
        }>;
      }
    ).roleEvidence.push({
      role: 'primary',
      status: 'inferred',
      confidence: 0.5,
      evidence: [],
      reviewerDisposition: 'pending',
    });
    expect(validateColorSystemAuditPluginMessage(inventedRole).valid).toBe(false);

    const mixedRepresentation = JSON.parse(JSON.stringify(message)) as typeof message;
    (
      mixedRepresentation.snapshot as unknown as {
        tokens: Array<(typeof snapshot.tokens)[number]>;
      }
    ).tokens.push(snapshot.tokens[0]);
    expect(validateColorSystemAuditPluginMessage(mixedRepresentation).valid).toBe(false);
  });

  it('requires exact tested-pair components and rejects display-evidence drift', () => {
    const { sourceHash: _sourceHash, ...snapshotInput } = snapshot;
    const pairSnapshot = createSourceSystemSnapshot({
      ...snapshotInput,
      declaredPairs: [
        {
          id: 'brand-on-brand',
          foreground: { tokenId: 'brand.anchor' },
          background: { tokenId: 'brand.anchor' },
          mode: 'light',
          useCase: 'Validator component evidence',
          category: 'normal-text',
          requiredLevel: 'AA',
        },
      ],
    });
    const pairAudit = auditColorSystem(pairSnapshot);
    const message = {
      type: 'color-system-audit-result' as const,
      requestId: 'audit-components',
      success: true as const,
      cancelled: false,
      partial: false,
      scannedNodeCount: 0,
      snapshot: pairSnapshot,
      audit: pairAudit,
      enabledLibraryDescriptors: [],
      libraryBoundaryNote: 'Metadata only.',
    };
    expect(validateColorSystemAuditPluginMessage(message).valid).toBe(true);

    const missingComponents = JSON.parse(JSON.stringify(message)) as typeof message;
    delete (
      missingComponents.audit.declaredPairTests[0].foreground as { sourceComponents?: unknown }
    ).sourceComponents;
    expect(validateColorSystemAuditPluginMessage(missingComponents).valid).toBe(false);

    const contradictory = JSON.parse(JSON.stringify(message)) as typeof message;
    (
      contradictory.audit.declaredPairTests[0].foreground as {
        sourceComponents?: [number, number, number];
      }
    ).sourceComponents = [1, 1, 1];
    expect(validateColorSystemAuditPluginMessage(contradictory).valid).toBe(false);
  });

  it('requires a review receipt only for a suitable proposal and binds confirmed anchors', () => {
    const structuredReview: { reviewHash?: string } & Record<string, unknown> = {
      ...validMessages[3],
    };
    delete structuredReview.reviewHash;
    expect(validateColorSystemAuditPluginMessage(structuredReview).valid).toBe(true);
    expect(
      validateColorSystemAuditPluginMessage({
        ...validMessages[4],
        reviewHash: digest('should-not-exist'),
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemAuditPluginMessage({
        ...validMessages[3],
        confirmedAnchorTokenIds: [],
      }).valid
    ).toBe(false);
  });

  it('rejects source-preserved provenance without exact source mode evidence', () => {
    const message = JSON.parse(JSON.stringify(validMessages[3])) as {
      bundle: {
        proposal: {
          modules: Array<{
            tokens: Array<{
              id: string;
              provenanceByMode: Record<string, { kind: string; sourceMode?: string }>;
            }>;
          }>;
        };
      };
    };
    const anchor = message.bundle.proposal.modules
      .flatMap(module => module.tokens)
      .find(token => token.id === 'generated.brand.9');
    if (!anchor) throw new Error('Expected generated anchor provenance fixture.');
    delete anchor.provenanceByMode.light.sourceMode;

    expect(validateColorSystemAuditPluginMessage(message).valid).toBe(false);
  });

  it('correlates request and immutable receipts with the pending operation', () => {
    const confirmation = validMessages[5];
    expect(
      validateColorSystemAuditPluginMessage(confirmation, {
        requestId: confirmation.requestId,
        sourceHash: confirmation.sourceHash,
        proposalHash: confirmation.proposalHash,
        reviewHash: confirmation.reviewHash,
        approvalHash: confirmation.approvalHash,
      }).valid
    ).toBe(true);
    expect(
      validateColorSystemAuditPluginMessage(confirmation, {
        requestId: 'confirm-stale',
      })
    ).toEqual({
      valid: false,
      error: 'Audit message does not match the pending request receipts.',
    });
    expect(
      validateColorSystemAuditPluginMessage(confirmation, {
        approvalHash: digest('stale-approval'),
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemAuditPluginMessage({
        ...confirmation,
        approvalHash: confirmation.reviewHash,
      }).valid
    ).toBe(false);
  });

  it('rejects unsafe apply and export receipts', () => {
    expect(
      validateColorSystemAuditPluginMessage({
        ...validMessages[6],
        undoBoundaryCommitted: false,
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemAuditPluginMessage({
        ...validMessages[6],
        variableCount: -1,
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemAuditPluginMessage({
        ...validMessages[7],
        fileName: '../audit.json',
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemAuditPluginMessage({
        ...validMessages[7],
        mimeType: 'text/html',
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemAuditPluginMessage({
        ...validMessages[7],
        content: 'é'.repeat(4 * 1024 * 1024 + 1),
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemAuditPluginMessage(validMessages[7], {
        requestId: 'export-1',
        sourceHash: snapshot.sourceHash,
        exportKind: 'proposal-teul',
      }).valid
    ).toBe(false);
  });

  it('fails closed for oversized, non-finite, and cyclic payloads', () => {
    expect(
      validateColorSystemAuditPluginMessage({
        ...validMessages[0],
        message: 'x'.repeat(16 * 1024 + 1),
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemAuditPluginMessage({
        ...validMessages[0],
        completed: Number.NaN,
      }).valid
    ).toBe(false);

    const cyclic: Record<string, unknown> = { ...validMessages[0] };
    cyclic.cycle = cyclic;
    expect(validateColorSystemAuditPluginMessage(cyclic)).toEqual({
      valid: false,
      error: 'Audit message exceeds structural limits.',
    });
  });

  it('accepts the combined 50k-resource and 100k-usage producer capacity', () => {
    const value = {
      colorSpace: 'srgb' as const,
      hex: '#3366cc',
      components: [0.2, 0.4, 0.8] as const,
      alpha: 1,
    };
    const evidence = [
      {
        kind: 'figma-node' as const,
        locator: 'node:capacity',
        detail: 'Capacity node · fills',
      },
      {
        kind: 'document-page' as const,
        locator: 'page:capacity',
        detail: 'Capacity page',
      },
    ];
    const supportedUsage = Array.from({ length: 100_000 }, (_, index) => ({
      id: `usage:${index}`,
      tokenId: `variable:capacity:${index % 50_000}`,
      mode: 'light',
      value,
      count: 1,
      evidence,
    }));
    const tokens = Array.from({ length: 50_000 }, (_, index) => ({
      id: `variable:capacity:${index}`,
      name: `Capacity ${index}`,
      path: ['product', 'accent', String(index)],
      modeGroupId: 'collection:capacity',
      valuesByMode: { light: value },
      scalePosition: {
        scaleId: 'product.accent',
        step: (index % 12) + 1,
      },
      evidence: [
        {
          kind: 'figma-resource' as const,
          locator: `variable:capacity:${index}`,
          detail: `Capacity ${index}`,
        },
      ],
      roleEvidence: [
        {
          role: 'accent',
          status: 'inferred' as const,
          confidence: 0.85,
          evidence: [
            {
              kind: 'token-path' as const,
              locator: `product/accent/${index}`,
              detail: 'Path-based role evidence',
            },
          ],
          reviewerDisposition: 'pending' as const,
        },
      ],
    }));
    const capacityMessage = {
      ...validMessages[1],
      requestId: 'audit-capacity',
      snapshot: {
        ...snapshot,
        resourceScope: {
          ...snapshot.resourceScope,
          localVariableCount: 50_000,
        },
        tokens,
        supportedUsage,
      },
    };

    expect(validateColorSystemAuditPluginMessage(capacityMessage)).toEqual({
      valid: true,
      message: capacityMessage,
    });
  }, 30_000);
});
