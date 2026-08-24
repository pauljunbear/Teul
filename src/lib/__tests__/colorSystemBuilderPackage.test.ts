import { describe, expect, it } from 'vitest';
import { auditColorSystem, createSourceSystemSnapshot } from '../colorSystemAudit';
import {
  COLOR_SYSTEM_BUILDER_PACKAGE_SCHEMA_VERSION,
  MAX_COLOR_SYSTEM_BUILDER_PACKAGE_BYTES,
  createColorSystemBuilderPackage,
  parseApprovedColorSystemBuilderPackage,
  serializeColorSystemBuilderPackage,
  type ColorSystemBuilderPackageInput,
} from '../colorSystemBuilderPackage';
import { createColorSystemApprovalHash, createColorSystemReviewHash } from '../colorSystemApproval';
import { composeColorSystemObjectiveModules } from '../colorSystemObjectiveModules';
import { buildColorSystemStrategySet } from '../colorSystemStrategyBuilder';
import { compileColorSystemStrategyProposal } from '../colorSystemStrategyProposal';
import type { ColorSystemProposal } from '../../types/colorSystemAudit';

function builderPackageInput(): ColorSystemBuilderPackageInput {
  const snapshot = createSourceSystemSnapshot({
    sourceKind: 'figma-document',
    sourceLocator: 'figma-file:builder-package-test',
    authorization: { status: 'user-authorized' },
    documentProfile: 'srgb',
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: 1,
      localStyleCount: 0,
    },
    usageScope: 'selection',
    capturedAt: '2026-08-03T12:00:00.000Z',
    modes: ['Light'],
    tokens: [
      {
        id: 'brand.primary',
        name: 'Primary',
        path: ['brand', 'primary'],
        sourceRepresentation: 'authored-token',
        valuesByMode: {
          Light: {
            colorSpace: 'srgb',
            hex: '#E4F222',
            components: [228 / 255, 242 / 255, 34 / 255],
            alpha: 1,
          },
        },
        evidence: [{ kind: 'figma-resource', locator: 'variable:brand.primary' }],
        roleEvidence: [],
      },
    ],
    supportedUsage: [],
    unsupportedUsage: [],
    declaredPairs: [],
  });
  const visualizationSettings = {
    mode: 'light' as const,
    surfaceHex: '#FFFFFF',
    chartType: 'brand-system-overview',
    categoryCount: 4,
    nonColorCue: 'labels and shapes',
    markType: 'bar' as const,
    adjacency: 'separated-marks' as const,
    divergingMidpoint: 'zero',
    sequentialCount: 3,
    divergingCount: 3,
  };
  const built = buildColorSystemStrategySet({
    sourceHash: snapshot.sourceHash,
    primary: {
      tokenId: 'brand.primary',
      name: 'Primary',
      mode: 'Light',
      hex: '#E4F222',
    },
    visualizationSettings,
    existingSourceHexes: ['#E4F222'],
  });
  if (built.status !== 'ready') throw new Error(built.blockers[0]?.message);
  const candidate = built.strategySet.candidates[1];
  const compiled = compileColorSystemStrategyProposal(snapshot, built.strategySet, {
    candidateId: candidate.id,
    candidateHash: candidate.candidateHash,
  });
  if (compiled.status !== 'ready') throw new Error(compiled.blockers[0]?.message);
  const baseProposal: ColorSystemProposal = {
    ...compiled.draft.content,
    proposalHash: compiled.draft.proposalHash,
  };
  const composed = composeColorSystemObjectiveModules(snapshot, baseProposal, [
    'product-primitives',
    'product-semantics',
  ]);
  if (composed.status === 'no-solution') throw new Error(composed.blockers[0]?.message);
  const confirmedAnchors = [{ tokenId: 'brand.primary', mode: 'Light', hex: '#E4F222' }];
  const intendedSurfaces = ['product-primitives', 'product-semantics', 'data-visualization'];
  const decision = {
    snapshot,
    proposal: composed.proposal,
    confirmedAnchors,
    intendedSurfaces,
    roleDecisions: [],
    visualizationSettings,
  };
  return {
    snapshot,
    audit: auditColorSystem(snapshot),
    completeness: { partial: false, cancelled: false, scannedNodeCount: 42 },
    strategySet: built.strategySet,
    candidateId: candidate.id,
    candidateHash: candidate.candidateHash,
    proposal: composed.proposal,
    decision: {
      reviewHash: createColorSystemReviewHash(decision),
      approvalHash: createColorSystemApprovalHash(decision),
      confirmedAnchorTokenIds: ['brand.primary'],
      confirmedAnchors,
      intendedSurfaces,
      roleDecisions: [],
      visualizationSettings,
    },
  };
}

describe('color-system builder package', () => {
  it('normalizes equivalent review ordering into byte-stable versioned JSON', () => {
    const input = builderPackageInput();
    const first = createColorSystemBuilderPackage(input);
    const second = createColorSystemBuilderPackage({
      ...input,
      decision: {
        ...input.decision,
        intendedSurfaces: [...input.decision.intendedSurfaces].reverse(),
      },
    });

    expect(first.schemaVersion).toBe(COLOR_SYSTEM_BUILDER_PACKAGE_SCHEMA_VERSION);
    expect(first.packageHash).toBe(second.packageHash);
    expect(serializeColorSystemBuilderPackage(first)).toBe(
      serializeColorSystemBuilderPackage(second)
    );
    expect(first.strategy.receipt).toMatchObject({
      lifecycle: 'approved',
      sourceHash: input.snapshot.sourceHash,
      proposalHash: input.proposal.proposalHash,
      outputBlueprintHash: first.outputBlueprint.outputBlueprintHash,
    });
    expect(first.handoffBoundary).toMatchObject({
      createsSeparateFigmaFile: false,
      publishesFigmaLibrary: false,
    });
  });

  it('fails closed for tampered, stale, or mismatched hash relationships', () => {
    const input = builderPackageInput();
    expect(() =>
      createColorSystemBuilderPackage({
        ...input,
        candidateHash: `sha256:${'0'.repeat(64)}`,
      })
    ).toThrow(/candidate identity/i);
    expect(() =>
      createColorSystemBuilderPackage({
        ...input,
        proposal: { ...input.proposal, warnings: [...input.proposal.warnings, 'tampered'] },
      })
    ).toThrow(/proposal-hash/i);
    expect(() =>
      createColorSystemBuilderPackage({
        ...input,
        decision: { ...input.decision, reviewHash: `sha256:${'1'.repeat(64)}` },
      })
    ).toThrow(/review receipt/i);
  });

  it('rejects serialized packages above the hard byte ceiling', () => {
    const document = createColorSystemBuilderPackage(builderPackageInput());
    const oversized = {
      ...document,
      padding: 'x'.repeat(MAX_COLOR_SYSTEM_BUILDER_PACKAGE_BYTES),
    } as unknown as typeof document;
    expect(() => serializeColorSystemBuilderPackage(oversized)).toThrow(/byte limit/i);
  });

  it('strictly reparses only an approved canonical v1 package and recomputes blueprint parity', () => {
    const approved = createColorSystemBuilderPackage(builderPackageInput());
    expect(
      parseApprovedColorSystemBuilderPackage(serializeColorSystemBuilderPackage(approved))
    ).toEqual(approved);

    const unknownNested = JSON.parse(serializeColorSystemBuilderPackage(approved));
    unknownNested.source.snapshot.tokens[0].unexpected = true;
    expect(() => parseApprovedColorSystemBuilderPackage(JSON.stringify(unknownNested))).toThrow(
      /strict source|canonical reconstruction/i
    );

    const tamperedBlueprint = JSON.parse(serializeColorSystemBuilderPackage(approved));
    tamperedBlueprint.outputBlueprint.counts.tokenCount += 1;
    expect(() => parseApprovedColorSystemBuilderPackage(JSON.stringify(tamperedBlueprint))).toThrow(
      /canonical reconstruction|blueprint/i
    );

    const compiledInput = builderPackageInput();
    delete compiledInput.decision.approvalHash;
    const compiled = createColorSystemBuilderPackage(compiledInput);
    expect(() =>
      parseApprovedColorSystemBuilderPackage(serializeColorSystemBuilderPackage(compiled))
    ).toThrow(/explicitly approved/i);
  });

  it('rejects prohibited keys and pre-parse payloads above 8 MiB', () => {
    expect(() => parseApprovedColorSystemBuilderPackage('{"constructor":{}}')).toThrow(
      /prohibited object key/i
    );
    expect(() =>
      parseApprovedColorSystemBuilderPackage(' '.repeat(MAX_COLOR_SYSTEM_BUILDER_PACKAGE_BYTES + 1))
    ).toThrow(/byte limit/i);
  });
});
