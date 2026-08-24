import { describe, expect, it } from 'vitest';
import {
  createColorSystemProposal,
  createExpressiveModule,
  createProductSemanticModule,
  evaluateProposalModuleCoverage,
  findExactRadixSwatchEquivalenceClasses,
  rankExactRadixFamilies,
} from '../colorSystemProposal';
import {
  auditColorSystem,
  createSourceSystemSnapshot,
  evaluateAccessibilityPair,
  observedLiteralCandidateIdentity,
} from '../colorSystemAudit';
import {
  createColorSystemAuditExport,
  serializeColorSystemAuditExport,
} from '../colorSystemAuditExport';
import {
  RADIX_COLORS_VERSION,
  radixColors,
  type RadixColorName,
  type RadixScale,
} from '../radixColors';
import { hexToRgb, rgbToOklab } from '../utils';
import type {
  ColorSystemProposal,
  ExactRadixAnchor,
  ExactRadixFamilyCandidate,
  ProductSemanticBinding,
  ProductSemanticRole,
  ProposedColorToken,
  RadixSwatchCandidate,
  SourceColorToken,
  SourceSystemSnapshotInput,
} from '../../types/colorSystemAudit';

const REFERENCE_MODE_ORDER: Readonly<Record<'light' | 'dark', number>> = {
  light: 0,
  dark: 1,
};
const REFERENCE_EXACT_RESULT_LIMIT = 64;

function compareReferenceText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function referenceDeltaEOK(firstHex: string, secondHex: string): number {
  const first = hexToRgb(firstHex);
  const second = hexToRgb(secondHex);
  const firstLab = rgbToOklab(first.r, first.g, first.b);
  const secondLab = rgbToOklab(second.r, second.g, second.b);
  return Math.hypot(firstLab.L - secondLab.L, firstLab.a - secondLab.a, firstLab.b - secondLab.b);
}

function compareReferenceSwatches(
  first: RadixSwatchCandidate,
  second: RadixSwatchCandidate
): number {
  if (first.deltaEOK !== second.deltaEOK) return first.deltaEOK - second.deltaEOK;
  const byFamily = compareReferenceText(first.family, second.family);
  if (byFamily !== 0) return byFamily;
  const byMode = REFERENCE_MODE_ORDER[first.mode] - REFERENCE_MODE_ORDER[second.mode];
  if (byMode !== 0) return byMode;
  return first.step - second.step;
}

function referenceBestFamilyMatch(
  family: RadixColorName,
  anchor: ExactRadixAnchor
): RadixSwatchCandidate & { sourceTokenId: string } {
  const modes: Array<'light' | 'dark'> = anchor.referenceMode
    ? [anchor.referenceMode]
    : ['light', 'dark'];
  const steps = anchor.referenceStep
    ? [anchor.referenceStep]
    : Array.from({ length: 12 }, (_, index) => index + 1);
  const candidates: RadixSwatchCandidate[] = [];

  for (const mode of modes) {
    const scale = radixColors[family][mode];
    for (const step of steps) {
      if (!Number.isInteger(step) || step < 1 || step > 12) continue;
      const hex = scale[step as keyof RadixScale];
      const distance = referenceDeltaEOK(anchor.hex, hex);
      candidates.push({
        family,
        mode,
        step,
        hex,
        packageVersion: RADIX_COLORS_VERSION,
        deltaEOK: distance,
        exact: distance === 0,
      });
    }
  }

  const best = candidates.sort(compareReferenceSwatches)[0];
  if (!best) throw new Error(`Anchor ${anchor.sourceTokenId} has no valid reference step.`);
  return { ...best, sourceTokenId: anchor.sourceTokenId };
}

function compareReferenceExactAssignments(
  first: ExactRadixFamilyCandidate,
  second: ExactRadixFamilyCandidate
): number {
  if (first.maximumDeltaEOK !== second.maximumDeltaEOK) {
    return first.maximumDeltaEOK - second.maximumDeltaEOK;
  }
  if (first.weightedMeanDeltaEOK !== second.weightedMeanDeltaEOK) {
    return first.weightedMeanDeltaEOK - second.weightedMeanDeltaEOK;
  }
  if (first.unintendedFamilyCollisions !== second.unintendedFamilyCollisions) {
    return first.unintendedFamilyCollisions - second.unintendedFamilyCollisions;
  }
  const byFamily = compareReferenceText(first.family, second.family);
  if (byFamily !== 0) return byFamily;
  return compareReferenceText(
    first.anchorMatches.map(match => `${match.sourceTokenId}=${match.family}`).join('|'),
    second.anchorMatches.map(match => `${match.sourceTokenId}=${match.family}`).join('|')
  );
}

/**
 * Retains the original exhaustive 31^N search as an independent correctness oracle.
 * Keep this intentionally simple: production may optimize, while this reference must
 * continue to enumerate every assignment and preserve stable insertion ordering.
 */
function rankExactRadixFamiliesExhaustiveReference(
  anchors: readonly ExactRadixAnchor[]
): ExactRadixFamilyCandidate[] {
  if (anchors.length === 0 || anchors.length > 4) return [];
  const orderedAnchors = [...anchors].sort((first, second) =>
    compareReferenceText(first.sourceTokenId, second.sourceTokenId)
  );
  const families = (Object.keys(radixColors) as RadixColorName[]).sort(compareReferenceText);
  const matchesByAnchor = orderedAnchors.map(anchor =>
    families.map(family => referenceBestFamilyMatch(family, anchor))
  );
  const ranked: ExactRadixFamilyCandidate[] = [];

  const visit = (
    anchorIndex: number,
    anchorMatches: readonly (RadixSwatchCandidate & { sourceTokenId: string })[]
  ): void => {
    if (anchorIndex === matchesByAnchor.length) {
      const uniqueFamilies = [...new Set(anchorMatches.map(match => match.family))].sort(
        compareReferenceText
      );
      const uniqueAssignments = new Set(
        anchorMatches.map(match => `${match.family}:${match.mode}:${match.step}`)
      );
      const totalWeight = orderedAnchors.reduce((sum, anchor) => sum + (anchor.weight ?? 1), 0);
      const candidate: ExactRadixFamilyCandidate = {
        family: uniqueFamilies.join('+'),
        anchorMatches,
        maximumDeltaEOK: Math.max(...anchorMatches.map(match => match.deltaEOK)),
        weightedMeanDeltaEOK:
          anchorMatches.reduce(
            (sum, match, index) => sum + match.deltaEOK * (orderedAnchors[index].weight ?? 1),
            0
          ) / totalWeight,
        unintendedFamilyCollisions: anchorMatches.length - uniqueAssignments.size,
      };
      const insertionIndex = ranked.findIndex(
        existing => compareReferenceExactAssignments(candidate, existing) < 0
      );
      if (insertionIndex === -1) ranked.push(candidate);
      else ranked.splice(insertionIndex, 0, candidate);
      if (ranked.length > REFERENCE_EXACT_RESULT_LIMIT) ranked.pop();
      return;
    }

    for (const match of matchesByAnchor[anchorIndex]) {
      visit(anchorIndex + 1, [...anchorMatches, match]);
    }
  };

  visit(0, []);
  return ranked;
}

function createDeterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function deterministicRandomHex(random: () => number): string {
  return `#${Math.floor(random() * 0x1_000_000)
    .toString(16)
    .padStart(6, '0')}`;
}

function deterministicPermutation<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function token(id: string, hex: string, protectedAnchor = false): SourceColorToken {
  const rgb = hexToRgb(hex);
  const value = {
    colorSpace: 'srgb' as const,
    hex,
    components: [rgb.r / 255, rgb.g / 255, rgb.b / 255] as const,
    alpha: 1,
  };
  return {
    id,
    name: id,
    path: id.split('.'),
    valuesByMode: { light: value, dark: value },
    evidence: [{ kind: 'token-path', locator: id }],
    roleEvidence: protectedAnchor
      ? [
          {
            role: 'primary',
            status: 'verified',
            confidence: 1,
            evidence: [{ kind: 'manual', locator: id }],
            reviewerDisposition: 'confirmed',
            protectedAnchor: true,
          },
        ]
      : [],
  };
}

function snapshotInput(tokens: readonly SourceColorToken[]): SourceSystemSnapshotInput {
  return {
    sourceKind: 'figma-document',
    sourceLocator: 'figma:test',
    authorization: { status: 'user-authorized' },
    documentProfile: 'srgb',
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: tokens.length,
      localStyleCount: 0,
    },
    usageScope: 'selection',
    capturedAt: '2026-08-02T12:00:00.000Z',
    modes: ['light', 'dark'],
    tokens,
    supportedUsage: [],
    unsupportedUsage: [],
    declaredPairs: [],
  };
}

describe('exact Radix proposals', () => {
  it('emits exactly one coverage row for every proposal module', () => {
    const coverage = evaluateProposalModuleCoverage([]);
    const modules = coverage.map(entry => entry.module);

    expect(modules).toEqual([
      'brand-marketing',
      'product-primitives',
      'product-semantics',
      'data-visualization',
      'illustration',
    ]);
    expect(new Set(modules).size).toBe(modules.length);
  });

  it('retains every zero-distance duplicate in a deterministic equivalence class', () => {
    const classes = findExactRadixSwatchEquivalenceClasses(radixColors.blue.light[9]);
    const zero = classes[0];

    expect(zero.deltaEOK).toBe(0);
    expect(zero.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: 'blue', mode: 'light', step: 9, exact: true }),
        expect.objectContaining({ family: 'blue', mode: 'dark', step: 9, exact: true }),
      ])
    );
    expect(findExactRadixSwatchEquivalenceClasses(radixColors.blue.light[9])).toEqual(classes);
    expect(findExactRadixSwatchEquivalenceClasses('#0090fe')[0].deltaEOK).toBeGreaterThan(0);
  });

  it('uses T-exact as an explicit gate and preserves exact package values', () => {
    const snapshot = createSourceSystemSnapshot(snapshotInput([token('blue.anchor', '#0090ff')]));
    const suitable = createColorSystemProposal(snapshot, {
      strategy: 'exact-radix',
      anchors: [{ sourceTokenId: 'blue.anchor', hex: '#0090ff', referenceStep: 9, weight: 1 }],
      approvedTolerance: 0,
    });
    const rankingOnly = createColorSystemProposal(snapshot, {
      strategy: 'exact-radix',
      anchors: [{ sourceTokenId: 'blue.anchor', hex: '#0090ff', referenceStep: 9 }],
    });
    const noMatch = createColorSystemProposal(snapshot, {
      strategy: 'exact-radix',
      anchors: [{ sourceTokenId: 'blue.anchor', hex: '#0090fe', referenceStep: 9 }],
      approvedTolerance: 0,
    });

    expect(suitable.status).toBe('suitable-candidate');
    if (suitable.status !== 'no-solution') {
      expect(suitable.proposal.exactCandidates[0].family).toBe('blue');
      const stepNine = suitable.proposal.modules[0].tokens.find(
        candidate => candidate.id === 'radix.blue.9'
      );
      expect(stepNine?.valuesByMode).toEqual({
        light: radixColors.blue.light[9],
        dark: radixColors.blue.dark[9],
      });
      const pairedNeutral = suitable.proposal.modules[0].tokens.find(
        candidate => candidate.id === 'radix.slate.9'
      );
      expect(pairedNeutral?.valuesByMode).toEqual({
        light: radixColors.slate.light[9],
        dark: radixColors.slate.dark[9],
      });
      expect(pairedNeutral?.provenanceByMode.light).toMatchObject({
        kind: 'exact-radix',
        family: 'slate',
      });
      expect(suitable.proposal.moduleCoverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ module: 'product-primitives', status: 'covered' }),
          expect.objectContaining({ module: 'product-semantics', status: 'unknown' }),
          expect.objectContaining({ module: 'data-visualization', status: 'unknown' }),
          expect.objectContaining({ module: 'brand-marketing', status: 'unknown' }),
          expect.objectContaining({ module: 'illustration', status: 'unknown' }),
        ])
      );
      expect(suitable.proposal.warnings.join(' ')).toMatch(
        /product-semantics.*data-visualization.*illustration/
      );
    }
    expect(rankingOnly.status).toBe('closest-candidate-outside-approved-tolerance');
    expect(noMatch).toMatchObject({
      status: 'no-solution',
      blockers: [{ code: 'NO_SUITABLE_EXACT_MATCH' }],
    });
  });

  it('is stable under anchor permutation and exposes the full objective tuple', () => {
    const snapshot = createSourceSystemSnapshot(
      snapshotInput([
        token('blue.solid', radixColors.blue.light[9]),
        token('blue.hover', radixColors.blue.light[10]),
      ])
    );
    const anchors = [
      {
        sourceTokenId: 'blue.solid',
        hex: radixColors.blue.light[9],
        referenceMode: 'light' as const,
        referenceStep: 9,
      },
      {
        sourceTokenId: 'blue.hover',
        hex: radixColors.blue.light[10],
        referenceMode: 'light' as const,
        referenceStep: 10,
      },
    ];
    const first = createColorSystemProposal(snapshot, {
      strategy: 'exact-radix',
      anchors,
      approvedTolerance: 0,
    });
    const second = createColorSystemProposal(snapshot, {
      strategy: 'exact-radix',
      anchors: [...anchors].reverse(),
      approvedTolerance: 0,
    });

    expect(first).toEqual(second);
    if (first.status !== 'no-solution') {
      expect(first.proposal.exactCandidates[0]).toMatchObject({
        family: 'blue',
        maximumDeltaEOK: 0,
        weightedMeanDeltaEOK: 0,
        unintendedFamilyCollisions: 0,
      });
    }
  });

  it('matches the retained exhaustive ranking for seeded anchors and permutations', () => {
    const random = createDeterministicRandom(0x7e_01_20_26);
    const anchors = Array.from({ length: 4 }, (_, index): ExactRadixAnchor => {
      const anchor: ExactRadixAnchor = {
        sourceTokenId: `seeded.anchor.${String.fromCharCode(100 - index)}`,
        hex: deterministicRandomHex(random),
        weight: 0.5 + random() * 3,
      };
      if (index === 1 || index === 3) {
        anchor.referenceMode = random() < 0.5 ? 'light' : 'dark';
      }
      if (index === 2 || index === 3) {
        anchor.referenceStep = Math.floor(random() * 12) + 1;
      }
      return anchor;
    });

    for (let anchorCount = 1; anchorCount <= anchors.length; anchorCount += 1) {
      const scenario = anchors.slice(0, anchorCount);
      const shuffled = deterministicPermutation(scenario, random);
      if (shuffled.length > 1 && shuffled.every((anchor, index) => anchor === scenario[index])) {
        shuffled.reverse();
      }

      const exhaustive = rankExactRadixFamiliesExhaustiveReference(scenario);
      for (const permutation of [scenario, shuffled]) {
        const optimized = rankExactRadixFamilies(permutation);

        expect(JSON.stringify(optimized)).toBe(JSON.stringify(exhaustive));
      }
    }
  });

  it('assigns independent exact families across multiple anchors without forcing one family', () => {
    const snapshot = createSourceSystemSnapshot(
      snapshotInput([
        token('blue.anchor', radixColors.blue.light[9]),
        token('red.anchor', radixColors.red.light[9]),
      ])
    );
    const anchors = [
      {
        sourceTokenId: 'blue.anchor',
        hex: radixColors.blue.light[9],
        referenceMode: 'light' as const,
        referenceStep: 9,
      },
      {
        sourceTokenId: 'red.anchor',
        hex: radixColors.red.light[9],
        referenceMode: 'light' as const,
        referenceStep: 9,
      },
    ];
    const forward = createColorSystemProposal(snapshot, {
      strategy: 'exact-radix',
      anchors,
      approvedTolerance: 0,
    });
    const reverse = createColorSystemProposal(snapshot, {
      strategy: 'exact-radix',
      anchors: [...anchors].reverse(),
      approvedTolerance: 0,
    });

    expect(forward).toEqual(reverse);
    expect(forward.status).toBe('suitable-candidate');
    if (forward.status === 'no-solution') throw new Error('Expected exact assignment.');
    expect(forward.proposal.exactCandidates[0]).toMatchObject({
      family: 'blue+red',
      maximumDeltaEOK: 0,
      weightedMeanDeltaEOK: 0,
      unintendedFamilyCollisions: 0,
    });
    expect(
      forward.proposal.exactCandidates[0].anchorMatches.map(match => [
        match.sourceTokenId,
        match.family,
      ])
    ).toEqual([
      ['blue.anchor', 'blue'],
      ['red.anchor', 'red'],
    ]);

    const primitives = forward.proposal.modules[0].tokens;
    expect(
      primitives
        .filter(candidate => candidate.id.startsWith('radix.blue.'))
        .every(
          candidate =>
            candidate.sourceRelationships.length === 1 &&
            candidate.sourceRelationships[0] === 'blue.anchor'
        )
    ).toBe(true);
    expect(
      primitives
        .filter(candidate => candidate.id.startsWith('radix.red.'))
        .every(
          candidate =>
            candidate.sourceRelationships.length === 1 &&
            candidate.sourceRelationships[0] === 'red.anchor'
        )
    ).toBe(true);
    expect(
      primitives
        .filter(candidate => candidate.id.startsWith('radix.slate.'))
        .every(candidate => candidate.sourceRelationships.length === 0)
    ).toBe(true);

    const serializedExport = serializeColorSystemAuditExport(
      createColorSystemAuditExport({
        snapshot,
        audit: auditColorSystem(snapshot),
        proposal: forward.proposal,
        exportedAt: '2026-08-02T12:00:00.000Z',
      })
    );
    const exported = JSON.parse(serializedExport) as {
      proposal: ColorSystemProposal;
    };
    const exportedBlue = exported.proposal.modules[0].tokens.find(
      candidate => candidate.id === 'radix.blue.9'
    );
    const exportedRed = exported.proposal.modules[0].tokens.find(
      candidate => candidate.id === 'radix.red.9'
    );
    expect(exportedBlue?.sourceRelationships).toEqual(['blue.anchor']);
    expect(exportedRed?.sourceRelationships).toEqual(['red.anchor']);
  });
});

describe('generated and hybrid proposals', () => {
  it('reuses an exact observed-literal source candidate without treating it as an inferred role', () => {
    const observedValue = {
      colorSpace: 'srgb' as const,
      hex: '#3366cc',
      components: [0.2, 0.4, 0.8] as const,
      alpha: 1,
    };
    const observedIdentity = observedLiteralCandidateIdentity('rendered', observedValue)!;
    const observedId = observedIdentity.id;
    const snapshot = createSourceSystemSnapshot({
      ...snapshotInput([]),
      resourceScope: { kind: 'all-local-resources', localVariableCount: 0, localStyleCount: 0 },
      modes: ['rendered'],
      tokens: [
        {
          id: observedId,
          name: 'Observed #3366CC',
          path: observedIdentity.path,
          sourceRepresentation: 'observed-literal',
          observedUsageCount: 8,
          observedUsageRank: 1,
          modeGroupId: 'figma-observed-literals',
          valuesByMode: { rendered: observedValue },
          evidence: [{ kind: 'figma-node', locator: 'swatch-blue' }],
          roleEvidence: [],
        },
      ],
      supportedUsage: [
        {
          id: 'usage-blue',
          mode: 'rendered',
          value: observedValue,
          count: 8,
          evidence: [{ kind: 'figma-node', locator: 'swatch-blue' }],
        },
      ],
    });

    const result = createColorSystemProposal(snapshot, {
      strategy: 'brand-preserving',
      scales: [
        {
          id: 'observed-brand',
          name: 'Observed brand',
          anchor: {
            sourceTokenId: observedId,
            sourceMode: 'rendered',
            name: 'Observed #3366CC',
            hex: '#3366cc',
            step: 9,
          },
          includeDarkMode: true,
        },
      ],
    });

    expect(result.status).toBe('suitable-candidate');
    if (result.status === 'no-solution') throw new Error('Expected an observed-literal proposal.');
    expect(result.proposal.unresolvedBlockers).toEqual([]);
    const anchor = result.proposal.modules[0].tokens.find(
      candidate => candidate.id === 'generated.observed-brand.9'
    );
    expect(anchor?.valuesByMode).toEqual({ light: '#3366cc', dark: '#3366cc' });
    expect(anchor?.provenanceByMode.light).toMatchObject({
      kind: 'source-preserved',
      sourceTokenId: observedId,
      sourceMode: 'rendered',
      sourceHex: '#3366cc',
    });
  });

  it('preserves anchors, labels companions, passes invariants, and hashes deterministically', () => {
    const snapshot = createSourceSystemSnapshot(
      snapshotInput([token('brand.anchor', '#3366cc', true)])
    );
    const request = {
      strategy: 'brand-preserving' as const,
      scales: [
        {
          id: 'brand',
          name: 'Brand',
          anchor: {
            sourceTokenId: 'brand.anchor',
            sourceMode: 'light',
            name: 'Brand',
            hex: '#3366cc',
            step: 9,
          },
          includeDarkMode: true,
        },
      ],
    };
    const first = createColorSystemProposal(snapshot, request);
    const second = createColorSystemProposal(snapshot, request);

    expect(first).toEqual(second);
    expect(first.status).toBe('suitable-candidate');
    if (first.status !== 'no-solution') {
      const anchor = first.proposal.modules[0].tokens.find(
        candidate => candidate.id === 'generated.brand.9'
      );
      const companion = first.proposal.modules[0].tokens.find(
        candidate => candidate.id === 'generated.brand.8'
      );
      expect(anchor?.valuesByMode).toEqual({ light: '#3366cc', dark: '#3366cc' });
      expect(anchor?.provenanceByMode.light).toEqual({
        kind: 'source-preserved',
        sourceTokenIds: ['brand.anchor'],
        sourceTokenId: 'brand.anchor',
        sourceMode: 'light',
        sourceHex: '#3366cc',
      });
      expect(companion?.provenanceByMode.light).toMatchObject({
        kind: 'teul-generated',
        algorithmVersion: 'Teul OKLCH v3',
      });
      expect(
        Object.values(first.proposal.generatedScales[0].modes).every(mode => mode.validation.valid)
      ).toBe(true);
      expect(first.proposal.pairEvidence.every(pair => pair.status === 'tested')).toBe(true);
    }
  });

  it('binds generated anchor provenance to the selected source mode and hex', () => {
    const base = token('brand.anchor', '#3366cc', true);
    const snapshot = createSourceSystemSnapshot(
      snapshotInput([
        {
          ...base,
          valuesByMode: {
            light: base.valuesByMode.light,
            dark: {
              colorSpace: 'srgb',
              hex: '#cc3366',
              components: [0.8, 0.2, 0.4],
              alpha: 1,
            },
          },
        },
      ])
    );
    const request = {
      strategy: 'brand-preserving' as const,
      scales: [
        {
          id: 'brand',
          name: 'Brand',
          anchor: {
            sourceTokenId: 'brand.anchor',
            sourceMode: 'light',
            name: 'Brand',
            hex: '#3366cc',
            step: 9,
          },
          includeDarkMode: true,
        },
      ],
    };

    const result = createColorSystemProposal(snapshot, request);
    expect(result.status).toBe('suitable-candidate');
    if (result.status === 'no-solution') throw new Error('Expected selected-mode generation.');
    const anchor = result.proposal.modules[0].tokens.find(
      candidate => candidate.id === 'generated.brand.9'
    );
    const expectedProvenance = {
      kind: 'source-preserved',
      sourceTokenIds: ['brand.anchor'],
      sourceTokenId: 'brand.anchor',
      sourceMode: 'light',
      sourceHex: '#3366cc',
    } as const;
    expect(anchor?.provenanceByMode.light).toEqual(expectedProvenance);
    expect(anchor?.provenanceByMode.dark).toEqual(expectedProvenance);

    const mismatched = createColorSystemProposal(snapshot, {
      ...request,
      scales: [
        {
          ...request.scales[0],
          anchor: { ...request.scales[0].anchor, sourceMode: 'dark' },
        },
      ],
    });
    expect(mismatched).toMatchObject({
      status: 'no-solution',
      blockers: [
        expect.objectContaining({
          code: 'CONFLICTING_LOCKED_ANCHORS',
          message: expect.stringMatching(/mode dark/i),
        }),
      ],
    });
  });

  it('keeps optional scale heuristics out of required WCAG pair evidence', () => {
    const snapshot = createSourceSystemSnapshot(snapshotInput([token('yellow.anchor', '#ffff00')]));
    const result = createColorSystemProposal(snapshot, {
      strategy: 'brand-preserving',
      scales: [
        {
          id: 'yellow',
          name: 'Yellow',
          anchor: {
            sourceTokenId: 'yellow.anchor',
            sourceMode: 'light',
            name: 'Yellow',
            hex: '#ffff00',
            step: 9,
          },
          includeDarkMode: true,
        },
      ],
    });

    expect(result.status).toBe('suitable-candidate');
    if (result.status === 'no-solution') throw new Error('Expected valid generated scales.');
    const validationChecks = Object.values(result.proposal.generatedScales[0].modes).flatMap(
      mode => mode.validation.contrast
    );
    expect(validationChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ foregroundStep: 9, required: false, pass: false }),
      ])
    );
    expect(result.proposal.pairEvidence).toHaveLength(4);
    expect(result.proposal.pairEvidence.every(pair => pair.pass === true)).toBe(true);
    expect(result.proposal.pairEvidence.some(pair => pair.id.includes('.9-on-1'))).toBe(false);
  });

  it('keeps exact and generated provenance separate in a hybrid proposal', () => {
    const snapshot = createSourceSystemSnapshot(
      snapshotInput([
        token('exact.anchor', radixColors.blue.light[9]),
        token('generated.anchor', '#3366cc'),
      ])
    );
    const result = createColorSystemProposal(snapshot, {
      strategy: 'hybrid',
      exact: {
        strategy: 'exact-radix',
        anchors: [
          {
            sourceTokenId: 'exact.anchor',
            hex: radixColors.blue.light[9],
            referenceStep: 9,
          },
        ],
        approvedTolerance: 0,
      },
      generatedScales: [
        {
          id: 'brand',
          name: 'Brand',
          anchor: {
            sourceTokenId: 'generated.anchor',
            sourceMode: 'light',
            name: 'Brand',
            hex: '#3366cc',
            step: 9,
          },
          includeDarkMode: true,
        },
      ],
    });

    expect(result.status).toBe('suitable-candidate');
    if (result.status !== 'no-solution') {
      const provenanceKinds = new Set(
        result.proposal.modules.reduce<string[]>((all, module) => {
          for (const proposed of module.tokens) {
            for (const provenance of Object.values(proposed.provenanceByMode)) {
              all.push(provenance.kind);
            }
          }
          return all;
        }, [])
      );
      expect(provenanceKinds).toEqual(
        new Set(['exact-radix', 'source-preserved', 'teul-generated'])
      );
    }
  });

  it('returns typed no-solution results without moving impossible anchors', () => {
    const whiteSnapshot = createSourceSystemSnapshot(snapshotInput([token('white', '#ffffff')]));
    const invalid = createColorSystemProposal(whiteSnapshot, {
      strategy: 'brand-preserving',
      scales: [
        {
          id: 'white',
          name: 'White',
          anchor: {
            sourceTokenId: 'white',
            sourceMode: 'light',
            name: 'White',
            hex: '#ffffff',
            step: 9,
          },
          includeDarkMode: true,
        },
      ],
    });
    const wrongPosition = createColorSystemProposal(whiteSnapshot, {
      strategy: 'brand-preserving',
      scales: [
        {
          id: 'white',
          name: 'White',
          anchor: {
            sourceTokenId: 'white',
            sourceMode: 'light',
            name: 'White',
            hex: '#ffffff',
            step: 6,
          },
          includeDarkMode: false,
        },
      ],
    });

    expect(invalid).toMatchObject({
      status: 'no-solution',
      blockers: [{ code: 'INVALID_GENERATED_SCALE', sourceTokenIds: ['white'] }],
    });
    expect(wrongPosition).toMatchObject({
      status: 'no-solution',
      blockers: [{ code: 'UNSUPPORTED_LOCKED_ANCHOR_POSITION', sourceTokenIds: ['white'] }],
    });
  });

  it('returns a stable conflict instead of silently choosing between locked anchors', () => {
    const snapshot = createSourceSystemSnapshot(
      snapshotInput([token('first', '#3366cc'), token('second', '#cc3366')])
    );
    const result = createColorSystemProposal(snapshot, {
      strategy: 'brand-preserving',
      scales: [
        {
          id: 'brand',
          name: 'Brand',
          anchor: {
            sourceTokenId: 'first',
            sourceMode: 'light',
            name: 'First',
            hex: '#3366cc',
            step: 9,
          },
          includeDarkMode: true,
        },
        {
          id: 'brand',
          name: 'Brand',
          anchor: {
            sourceTokenId: 'second',
            sourceMode: 'light',
            name: 'Second',
            hex: '#cc3366',
            step: 9,
          },
          includeDarkMode: true,
        },
      ],
    });

    expect(result).toMatchObject({
      status: 'no-solution',
      blockers: [{ code: 'CONFLICTING_LOCKED_ANCHORS', sourceTokenIds: ['first', 'second'] }],
    });
  });

  it('blocks an inaccessible protected anchor and offers explicit alternatives', () => {
    const foreground = token('protected', '#777777', true);
    const background = token('canvas', '#ffffff');
    const snapshot = createSourceSystemSnapshot({
      ...snapshotInput([foreground, background]),
      declaredPairs: [
        {
          id: 'protected-copy',
          foreground: { tokenId: 'protected' },
          background: { tokenId: 'canvas' },
          mode: 'light',
          useCase: 'Protected brand text',
          category: 'normal-text',
          requiredLevel: 'AA',
        },
      ],
    });
    const result = createColorSystemProposal(snapshot, {
      strategy: 'brand-preserving',
      scales: [
        {
          id: 'protected',
          name: 'Protected',
          anchor: {
            sourceTokenId: 'protected',
            sourceMode: 'light',
            name: 'Protected',
            hex: '#777777',
            step: 9,
          },
          includeDarkMode: false,
        },
      ],
    });

    expect(result).toMatchObject({
      status: 'no-solution',
      blockers: [
        {
          code: 'INACCESSIBLE_PROTECTED_ANCHOR',
          alternatives: [
            'Change the foreground.',
            'Change the background.',
            'Change the assigned role.',
            'Change or remove the declared constraint.',
          ],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('standalone color');
  });
});

describe('product and expressive modules', () => {
  const primitive: ProposedColorToken = {
    id: 'primitive.one',
    name: 'Primitive',
    path: ['product', 'primitive'],
    namespace: 'product-primitives',
    valuesByMode: { light: '#000000' },
    provenanceByMode: {
      light: {
        kind: 'source-preserved',
        sourceTokenIds: ['source.one'],
        sourceTokenId: 'source.one',
        sourceMode: 'light',
        sourceHex: '#000000',
      },
    },
    sourceRelationships: ['source.one'],
    accessibilityConstrained: false,
  };
  const roles: ProductSemanticRole[] = [
    'background',
    'surface',
    'text',
    'border',
    'focus',
    'link',
    'selected',
    'disabled',
    'success',
    'warning',
    'error',
    'information',
    'destructive',
  ];

  it('requires every product role and preserves interaction-state aliases', () => {
    const bindings: ProductSemanticBinding[] = roles.map(role => ({
      id: `semantic.${role}`,
      role,
      mode: 'light',
      targetTokenId: primitive.id,
      ...(role === 'selected' ? { state: 'pressed' } : {}),
    }));
    const complete = createProductSemanticModule({
      modes: ['light'],
      availableTokens: [primitive],
      bindings,
    });
    const incomplete = createProductSemanticModule({
      modes: ['light'],
      availableTokens: [primitive],
      bindings: bindings.filter(binding => binding.role !== 'destructive'),
    });

    expect(complete).toMatchObject({ ok: true, module: { aliases: expect.any(Array) } });
    if (complete.ok) {
      expect(complete.module.aliases).toHaveLength(13);
      expect(complete.module.aliases.find(alias => alias.role === 'selected')?.state).toBe(
        'pressed'
      );
    }
    expect(incomplete).toMatchObject({
      ok: false,
      blockers: [expect.objectContaining({ code: 'MISSING_PRODUCT_ROLE' })],
    });
  });

  it('blocks product output when a declared semantic pair fails', () => {
    const bindings: ProductSemanticBinding[] = roles.map(role => ({
      id: `semantic.${role}`,
      role,
      mode: 'light',
      targetTokenId: primitive.id,
    }));
    const failingPair = evaluateAccessibilityPair({
      id: 'low-contrast-link',
      foregroundHex: '#777777',
      backgroundHex: '#ffffff',
      mode: 'light',
      useCase: 'Link on canvas',
      category: 'normal-text',
      requiredLevel: 'AA',
    });
    const result = createProductSemanticModule({
      modes: ['light'],
      availableTokens: [primitive],
      bindings,
      pairEvidence: [failingPair],
    });

    expect(result).toMatchObject({
      ok: false,
      blockers: [
        expect.objectContaining({
          code: 'INACCESSIBLE_SEMANTIC_PAIR',
          alternatives: [
            'Change the foreground.',
            'Change the background.',
            'Change the assigned role.',
            'Change or remove the declared constraint.',
          ],
        }),
      ],
    });
  });

  it('keeps marketing and illustration separate and constrains meaning-bearing uses', () => {
    const evidence = evaluateAccessibilityPair({
      id: 'legend-on-canvas',
      foregroundHex: '#000000',
      backgroundHex: '#ffffff',
      mode: 'light',
      useCase: 'Illustration legend',
      category: 'normal-text',
      requiredLevel: 'AA',
    });
    const marketing = createExpressiveModule({
      namespace: 'brand-marketing',
      colors: [
        {
          id: 'campaign.primary',
          name: 'Campaign Primary',
          sourceTokenId: 'source.primary',
          valuesByMode: { light: '#3366cc' },
          informationBearing: false,
        },
      ],
    });
    const illustration = createExpressiveModule({
      namespace: 'illustration',
      colors: [
        {
          id: 'illustration.legend',
          name: 'Legend',
          sourceTokenId: 'source.legend',
          valuesByMode: { light: '#000000' },
          informationBearing: true,
          pairEvidence: [evidence],
        },
      ],
    });

    expect(marketing.namespace).toBe('brand-marketing');
    expect(illustration.namespace).toBe('illustration');
    expect(illustration.tokens[0]).toMatchObject({
      sourceRelationships: ['source.legend'],
      accessibilityConstrained: true,
    });
    expect(illustration.pairEvidence).toEqual([evidence]);
  });
});
