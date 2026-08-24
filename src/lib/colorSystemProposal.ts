import { generateColorScale, type ColorScale } from './colorScale';
import {
  auditColorSystem,
  deterministicContentHash,
  evaluateAccessibilityPair,
} from './colorSystemAudit';
import {
  RADIX_COLORS_VERSION,
  neutralFamilies,
  radixColors,
  type RadixColorName,
  type RadixScale,
} from './radixColors';
import { compareText, hexToRgb, rgbToHex, rgbToOklab } from './utils';
import {
  COLOR_SYSTEM_AUDIT_ENGINE_VERSION,
  COLOR_SYSTEM_PROPOSAL_SCHEMA_VERSION,
  type AccessibilityPairEvidence,
  type BrandPreservingProposalRequest,
  type ColorModuleCoverage,
  type ColorSystemAudit,
  type ColorProposalModule,
  type ColorSystemProposal,
  type ColorSystemProposalRequest,
  type ExactRadixAnchor,
  type ExactRadixFamilyCandidate,
  type ExactRadixProposalRequest,
  type ExpressiveModuleInput,
  type GeneratedScaleEvidence,
  type GeneratedScaleRequest,
  type HybridProposalRequest,
  type ProductSemanticModuleInput,
  type ProposalBlocker,
  type ProposalBundle,
  type ProposalReviewerRoleDecision,
  type ProposedColorToken,
  type ProposedTokenProvenance,
  type RadixSwatchCandidate,
  type RadixSwatchEquivalenceClass,
  type SourceSystemSnapshot,
} from '../types/colorSystemAudit';

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const MODE_ORDER: Readonly<Record<'light' | 'dark', number>> = { light: 0, dark: 1 };
const ROLE_CONFIDENCE_CONFIRMATION_THRESHOLD = 0.7;
const MAX_EXACT_ANCHORS = 4;
const MAX_RANKED_EXACT_ASSIGNMENTS = 64;

function normalizeHex(hex: string): string {
  if (!HEX_PATTERN.test(hex)) throw new Error(`Invalid six-digit sRGB hex value: ${hex}`);
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r, g, b).toLowerCase();
}

function deltaEOK(firstHex: string, secondHex: string): number {
  const first = hexToRgb(firstHex);
  const second = hexToRgb(secondHex);
  const firstLab = rgbToOklab(first.r, first.g, first.b);
  const secondLab = rgbToOklab(second.r, second.g, second.b);
  return Math.hypot(firstLab.L - secondLab.L, firstLab.a - secondLab.a, firstLab.b - secondLab.b);
}

function familyNames(): RadixColorName[] {
  return (Object.keys(radixColors) as RadixColorName[]).sort(compareText);
}

function swatchesForFamily(
  family: RadixColorName,
  anchor?: Pick<ExactRadixAnchor, 'referenceMode' | 'referenceStep'>
): RadixSwatchCandidate[] {
  const modes: Array<'light' | 'dark'> = anchor?.referenceMode
    ? [anchor.referenceMode]
    : ['light', 'dark'];
  const steps = anchor?.referenceStep
    ? [anchor.referenceStep]
    : Array.from({ length: 12 }, (_, index) => index + 1);
  const candidates: RadixSwatchCandidate[] = [];
  for (const mode of modes) {
    const scale = radixColors[family][mode];
    for (const step of steps) {
      if (!Number.isInteger(step) || step < 1 || step > 12) continue;
      candidates.push({
        family,
        mode,
        step,
        hex: scale[step as keyof RadixScale],
        packageVersion: RADIX_COLORS_VERSION,
        deltaEOK: Number.POSITIVE_INFINITY,
        exact: false,
      });
    }
  }
  return candidates;
}

function compareSwatches(first: RadixSwatchCandidate, second: RadixSwatchCandidate): number {
  if (first.deltaEOK !== second.deltaEOK) return first.deltaEOK - second.deltaEOK;
  const byFamily = compareText(first.family, second.family);
  if (byFamily !== 0) return byFamily;
  const byMode = MODE_ORDER[first.mode] - MODE_ORDER[second.mode];
  if (byMode !== 0) return byMode;
  return first.step - second.step;
}

/**
 * Enumerate published Radix solid swatches without collapsing duplicate values.
 * The zero-distance class therefore retains every exact equivalent candidate.
 */
export function findExactRadixSwatchEquivalenceClasses(hex: string): RadixSwatchEquivalenceClass[] {
  const sourceHex = normalizeHex(hex);
  const candidates: RadixSwatchCandidate[] = [];
  for (const family of familyNames()) {
    for (const candidate of swatchesForFamily(family)) {
      const distance = deltaEOK(sourceHex, candidate.hex);
      candidates.push({ ...candidate, deltaEOK: distance, exact: distance === 0 });
    }
  }
  candidates.sort(compareSwatches);

  const classes: Array<{ deltaEOK: number; candidates: RadixSwatchCandidate[] }> = [];
  for (const candidate of candidates) {
    const current = classes[classes.length - 1];
    if (!current || current.deltaEOK !== candidate.deltaEOK) {
      classes.push({ deltaEOK: candidate.deltaEOK, candidates: [candidate] });
    } else {
      current.candidates.push(candidate);
    }
  }
  return classes;
}

function bestFamilyMatch(
  family: RadixColorName,
  anchor: ExactRadixAnchor
): RadixSwatchCandidate & { sourceTokenId: string } {
  const sourceHex = normalizeHex(anchor.hex);
  const best = swatchesForFamily(family, anchor)
    .map(candidate => {
      const distance = deltaEOK(sourceHex, candidate.hex);
      return { ...candidate, deltaEOK: distance, exact: distance === 0 };
    })
    .sort(compareSwatches)[0];
  if (!best) {
    throw new Error(`Anchor ${anchor.sourceTokenId} has no valid Radix reference step.`);
  }
  return { ...best, sourceTokenId: anchor.sourceTokenId };
}

function compareExactAssignments(
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
  const byFamily = compareText(first.family, second.family);
  if (byFamily !== 0) return byFamily;
  return compareText(
    first.anchorMatches.map(match => `${match.sourceTokenId}=${match.family}`).join('|'),
    second.anchorMatches.map(match => `${match.sourceTokenId}=${match.family}`).join('|')
  );
}

function exactAssignmentCandidate(
  anchorMatches: readonly (RadixSwatchCandidate & { sourceTokenId: string })[],
  maximumDeltaEOK: number,
  weightedMeanDeltaEOK: number
): ExactRadixFamilyCandidate {
  const uniqueFamilies = [...new Set(anchorMatches.map(match => match.family))].sort(compareText);
  const uniqueAssignments = new Set(
    anchorMatches.map(match => `${match.family}:${match.mode}:${match.step}`)
  );
  const family = uniqueFamilies.join('+');

  return {
    family,
    anchorMatches,
    maximumDeltaEOK,
    weightedMeanDeltaEOK,
    unintendedFamilyCollisions: anchorMatches.length - uniqueAssignments.size,
  };
}

interface ExactAssignmentHeapEntry {
  candidate: ExactRadixFamilyCandidate;
  enumerationIndex: number;
}

function compareExactAssignmentEntries(
  first: ExactAssignmentHeapEntry,
  second: ExactAssignmentHeapEntry
): number {
  const byCandidate = compareExactAssignments(first.candidate, second.candidate);
  return byCandidate !== 0 ? byCandidate : first.enumerationIndex - second.enumerationIndex;
}

function pushWorstFirstExactAssignment(
  heap: ExactAssignmentHeapEntry[],
  entry: ExactAssignmentHeapEntry
): void {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareExactAssignmentEntries(heap[parent], heap[index]) >= 0) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function replaceWorstExactAssignment(
  heap: ExactAssignmentHeapEntry[],
  entry: ExactAssignmentHeapEntry
): void {
  heap[0] = entry;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    if (left >= heap.length) return;
    const right = left + 1;
    let worseChild = left;
    if (right < heap.length && compareExactAssignmentEntries(heap[right], heap[left]) > 0) {
      worseChild = right;
    }
    if (compareExactAssignmentEntries(heap[index], heap[worseChild]) >= 0) return;
    [heap[index], heap[worseChild]] = [heap[worseChild], heap[index]];
    index = worseChild;
  }
}

export function rankExactRadixFamilies(
  anchors: readonly ExactRadixAnchor[]
): ExactRadixFamilyCandidate[] {
  if (anchors.length === 0 || anchors.length > MAX_EXACT_ANCHORS) return [];
  const orderedAnchors = [...anchors].sort((first, second) =>
    compareText(first.sourceTokenId, second.sourceTokenId)
  );
  const families = familyNames();
  const matchesByAnchor = orderedAnchors.map(anchor =>
    families
      .map((family, familyIndex) => ({
        match: bestFamilyMatch(family, anchor),
        familyIndex,
      }))
      .sort((first, second) => compareSwatches(first.match, second.match))
  );
  const weights = orderedAnchors.map(anchor => anchor.weight ?? 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const minimumRemainingMaximum = Array.from({ length: orderedAnchors.length + 1 }, () => 0);
  for (let index = orderedAnchors.length - 1; index >= 0; index -= 1) {
    minimumRemainingMaximum[index] = Math.max(
      minimumRemainingMaximum[index + 1],
      matchesByAnchor[index][0].match.deltaEOK
    );
  }
  const heap: ExactAssignmentHeapEntry[] = [];
  const matches = new Array<RadixSwatchCandidate & { sourceTokenId: string }>(
    orderedAnchors.length
  );
  const familyIndexes = new Array<number>(orderedAnchors.length);
  const visit = (anchorIndex: number, maximumDeltaEOK: number, weightedDeltaSum: number): void => {
    // The suffix bound covers only the primary objective. Prune strictly worse
    // maxima; equal maxima must continue so the remaining objective tuple can rank.
    if (
      heap.length === MAX_RANKED_EXACT_ASSIGNMENTS &&
      Math.max(maximumDeltaEOK, minimumRemainingMaximum[anchorIndex]) >
        heap[0].candidate.maximumDeltaEOK
    ) {
      return;
    }
    if (anchorIndex === matchesByAnchor.length) {
      const candidate = exactAssignmentCandidate(
        [...matches],
        maximumDeltaEOK,
        weightedDeltaSum / totalWeight
      );
      const enumerationIndex = familyIndexes.reduce(
        (index, familyIndex) => index * families.length + familyIndex,
        0
      );
      const entry = { candidate, enumerationIndex };
      if (heap.length < MAX_RANKED_EXACT_ASSIGNMENTS) {
        pushWorstFirstExactAssignment(heap, entry);
      } else if (compareExactAssignmentEntries(entry, heap[0]) < 0) {
        replaceWorstExactAssignment(heap, entry);
      }
      return;
    }
    for (const option of matchesByAnchor[anchorIndex]) {
      if (
        heap.length === MAX_RANKED_EXACT_ASSIGNMENTS &&
        option.match.deltaEOK > heap[0].candidate.maximumDeltaEOK
      ) {
        break;
      }
      matches[anchorIndex] = option.match;
      familyIndexes[anchorIndex] = option.familyIndex;
      visit(
        anchorIndex + 1,
        Math.max(maximumDeltaEOK, option.match.deltaEOK),
        weightedDeltaSum + option.match.deltaEOK * weights[anchorIndex]
      );
    }
  };
  visit(0, 0, 0);
  return heap.sort(compareExactAssignmentEntries).map(entry => entry.candidate);
}

function exactRadixModule(candidate: ExactRadixFamilyCandidate): ColorProposalModule {
  const matchedFamilies = [
    ...new Set(candidate.anchorMatches.map(match => match.family as RadixColorName)),
  ].sort(compareText);
  const sourceRelationshipsByFamily = candidate.anchorMatches.reduce<
    Map<RadixColorName, Set<string>>
  >((relationships, match) => {
    const family = match.family as RadixColorName;
    const sourceTokenIds = relationships.get(family) ?? new Set<string>();
    sourceTokenIds.add(match.sourceTokenId);
    relationships.set(family, sourceTokenIds);
    return relationships;
  }, new Map());
  const exactFamilies = [
    ...new Set(
      matchedFamilies.flatMap(family => [
        radixColors[family].name,
        radixColors[family].pairedNeutral,
      ])
    ),
  ];
  const tokens = exactFamilies.reduce<ProposedColorToken[]>((all, familyName) => {
    const family = radixColors[familyName];
    all.push(
      ...Array.from({ length: 12 }, (_, index): ProposedColorToken => {
        const step = index + 1;
        const provenanceByMode: Record<string, ProposedTokenProvenance> = {
          light: {
            kind: 'exact-radix',
            packageVersion: RADIX_COLORS_VERSION,
            family: family.name,
            mode: 'light',
            step,
          },
          dark: {
            kind: 'exact-radix',
            packageVersion: RADIX_COLORS_VERSION,
            family: family.name,
            mode: 'dark',
            step,
          },
        };
        return {
          id: `radix.${family.name}.${step}`,
          name: `${family.displayName} ${step}`,
          path: ['product', 'primitives', family.name, String(step)],
          namespace: 'product-primitives',
          valuesByMode: {
            light: family.light[step as keyof RadixScale],
            dark: family.dark[step as keyof RadixScale],
          },
          provenanceByMode,
          sourceRelationships: [...(sourceRelationshipsByFamily.get(family.name) ?? [])].sort(
            compareText
          ),
          accessibilityConstrained: false,
        };
      })
    );
    return all;
  }, []);
  return {
    namespace: 'product-primitives',
    tokens: tokens.sort((a, b) => compareText(a.id, b.id)),
    aliases: [],
    pairEvidence: [],
    warnings: [
      `Exact paired neutrals are included from Radix's pinned metadata for ${matchedFamilies.join(', ')}.`,
      'Radix step intentions remain suggestions until the user confirms semantic roles and rendered pairs.',
    ],
  };
}

const PROPOSAL_MODULE_REQUIREMENTS: ReadonlyArray<{
  module: ColorModuleCoverage['module'];
  required: readonly string[];
}> = [
  { module: 'brand-marketing', required: ['primary', 'secondary', 'background'] },
  { module: 'product-primitives', required: ['accent', 'neutral'] },
  {
    module: 'product-semantics',
    required: [
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
    ],
  },
  { module: 'data-visualization', required: ['categorical', 'sequential', 'diverging'] },
  { module: 'illustration', required: ['illustration'] },
];

export function evaluateProposalModuleCoverage(
  modules: readonly ColorProposalModule[]
): ColorModuleCoverage[] {
  const primitiveTokens = modules
    .filter(module => module.namespace === 'product-primitives')
    .reduce<ProposedColorToken[]>((all, module) => {
      all.push(...module.tokens);
      return all;
    }, []);
  const exactFamilies = new Set<string>();
  let hasGeneratedScale = false;
  for (const token of primitiveTokens) {
    for (const provenance of Object.values(token.provenanceByMode)) {
      if (provenance.kind === 'exact-radix') exactFamilies.add(provenance.family);
      if (provenance.kind === 'teul-generated' || provenance.kind === 'teul-harmony-generated') {
        hasGeneratedScale = true;
      }
    }
  }
  const hasNeutral = [...exactFamilies].some(family =>
    neutralFamilies.includes(family as (typeof neutralFamilies)[number])
  );
  const hasAccent = [...exactFamilies].some(
    family => !neutralFamilies.includes(family as (typeof neutralFamilies)[number])
  );

  return PROPOSAL_MODULE_REQUIREMENTS.map(({ module, required }): ColorModuleCoverage => {
    let coveredRoles: string[] = [];
    if (module === 'product-primitives') {
      if (hasAccent) coveredRoles.push('accent');
      if (hasNeutral) coveredRoles.push('neutral');
      // Generated scales originate only from an explicitly confirmed protected
      // anchor. They can serve as the accent primitive without being relabeled
      // as exact Radix; a neutral primitive is still required for coverage.
      if (hasGeneratedScale) coveredRoles.push('accent');
    } else {
      const candidates = modules.filter(candidate => candidate.namespace === module);
      const explicitRoleTerms = new Set(
        candidates.flatMap(candidate => [
          ...candidate.aliases.map(alias => alias.role.toLowerCase()),
          ...candidate.tokens.flatMap(token => [
            token.id.toLowerCase(),
            token.name.toLowerCase(),
            ...token.path.map(segment => segment.toLowerCase()),
          ]),
        ])
      );
      coveredRoles = required.filter(role => explicitRoleTerms.has(role));
    }
    const missingRoles = required.filter(role => !coveredRoles.includes(role));
    return {
      module,
      coveredRoles: coveredRoles.sort(compareText),
      missingRoles,
      status:
        missingRoles.length === 0 ? 'covered' : coveredRoles.length === 0 ? 'unknown' : 'partial',
    };
  });
}

function unresolvedCoverageWarnings(coverage: readonly ColorModuleCoverage[]): string[] {
  return coverage
    .filter(module => module.status !== 'covered')
    .map(
      module =>
        `${module.module} remains ${module.status}; unresolved roles: ${module.missingRoles.join(', ')}.`
    );
}

interface GeneratedBuildResult {
  modules: ColorProposalModule[];
  evidence: GeneratedScaleEvidence[];
  blockers: ProposalBlocker[];
}

function generatedPairEvidence(scale: ColorScale): AccessibilityPairEvidence[] {
  return scale.validation.contrast
    .filter(check => check.required)
    .map(check =>
      evaluateAccessibilityPair({
        id: `${scale.name}.${scale.mode}.${check.foregroundStep}-on-${check.backgroundStep}`,
        foregroundHex: scale.steps[check.foregroundStep - 1].hex,
        backgroundHex: scale.steps[check.backgroundStep - 1].hex,
        mode: scale.mode,
        useCase: check.useCase,
        category: check.minimumRatio === 3 ? 'non-text' : 'normal-text',
        requiredLevel: check.minimumRatio === 7 ? 'AAA' : 'AA',
      })
    );
}

function validateAnchorRelationship(
  snapshot: SourceSystemSnapshot,
  request: GeneratedScaleRequest
): ProposalBlocker | null {
  const token = snapshot.tokens.find(candidate => candidate.id === request.anchor.sourceTokenId);
  const expected = normalizeHex(request.anchor.hex);
  const sourceValue = token?.valuesByMode[request.anchor.sourceMode];
  const matches =
    sourceValue?.colorSpace === 'srgb' &&
    sourceValue.alpha === 1 &&
    Boolean(sourceValue.hex) &&
    normalizeHex(sourceValue.hex ?? '') === expected;
  if (matches) return null;
  return {
    code: 'CONFLICTING_LOCKED_ANCHORS',
    message: `Protected anchor ${request.anchor.sourceTokenId} does not match its opaque sRGB source literal in mode ${request.anchor.sourceMode}.`,
    sourceTokenIds: [request.anchor.sourceTokenId],
    alternatives: [
      'Refresh the source snapshot.',
      'Use the verified source literal.',
      'Remove the protected anchor from this proposal.',
    ],
  };
}

function buildGeneratedScales(
  snapshot: SourceSystemSnapshot,
  requests: readonly GeneratedScaleRequest[]
): GeneratedBuildResult {
  const evidence: GeneratedScaleEvidence[] = [];
  const blockers: ProposalBlocker[] = [];
  const tokens: ProposedColorToken[] = [];
  const pairEvidence: AccessibilityPairEvidence[] = [];
  const seenIds = new Map<string, GeneratedScaleRequest>();

  if (requests.length === 0) {
    blockers.push({
      code: 'INVALID_GENERATED_SCALE',
      message:
        'At least one confirmed protected anchor is required for brand-preserving generation.',
      sourceTokenIds: [],
      alternatives: [
        'Confirm an anchor.',
        'Use exact Radix ranking.',
        'Keep the source system unchanged.',
      ],
    });
  }

  for (const request of [...requests].sort((a, b) => compareText(a.id, b.id))) {
    const prior = seenIds.get(request.id);
    if (prior) {
      const identical =
        prior.anchor.sourceTokenId === request.anchor.sourceTokenId &&
        normalizeHex(prior.anchor.hex) === normalizeHex(request.anchor.hex) &&
        prior.anchor.step === request.anchor.step &&
        prior.includeDarkMode === request.includeDarkMode;
      if (!identical) {
        blockers.push({
          code: 'CONFLICTING_LOCKED_ANCHORS',
          message: `Scale ${request.id} has conflicting protected anchors or mode requirements.`,
          sourceTokenIds: [prior.anchor.sourceTokenId, request.anchor.sourceTokenId].sort(
            compareText
          ),
          alternatives: [
            'Split the anchors into separate scales.',
            'Confirm one protected anchor.',
            'Omit the conflicting scale.',
          ],
        });
      }
      continue;
    }
    seenIds.set(request.id, request);

    if (request.anchor.step !== 9) {
      blockers.push({
        code: 'UNSUPPORTED_LOCKED_ANCHOR_POSITION',
        message: `Teul OKLCH v3 cannot preserve ${request.anchor.sourceTokenId} at step ${request.anchor.step}; only step 9 is supported.`,
        sourceTokenIds: [request.anchor.sourceTokenId],
        alternatives: [
          'Confirm the anchor at step 9.',
          'Use an exact Radix proposal.',
          'Omit this scale until multi-anchor generation is available.',
        ],
      });
      continue;
    }
    const relationshipBlocker = validateAnchorRelationship(snapshot, request);
    if (relationshipBlocker) {
      blockers.push(relationshipBlocker);
      continue;
    }

    const light = generateColorScale(request.anchor.hex, 'light', request.name);
    const dark = request.includeDarkMode
      ? generateColorScale(request.anchor.hex, 'dark', request.name)
      : undefined;
    const modes = [light, ...(dark ? [dark] : [])];
    const invalid = modes.filter(scale => !scale.validation.valid);
    if (invalid.length > 0) {
      blockers.push({
        code: 'INVALID_GENERATED_SCALE',
        message: `${request.name} failed deterministic scale invariants in ${invalid.map(scale => scale.mode).join(', ')} mode.`,
        sourceTokenIds: [request.anchor.sourceTokenId],
        alternatives: [
          'Keep the source anchor without generated companions.',
          'Choose a different confirmed anchor.',
          'Use an exact Radix candidate.',
        ],
      });
      continue;
    }

    const evidenceModes: GeneratedScaleEvidence['modes'] = modes.reduce<
      Record<
        string,
        { steps: Array<{ step: number; hex: string }>; validation: ColorScale['validation'] }
      >
    >((result, scale) => {
      result[scale.mode] = {
        steps: scale.steps.map(step => ({ step: step.step, hex: step.hex })),
        validation: scale.validation,
      };
      return result;
    }, {});
    evidence.push({
      id: request.id,
      name: request.name,
      anchor: request.anchor,
      modes: evidenceModes,
    });
    pairEvidence.push(
      ...modes.reduce<AccessibilityPairEvidence[]>((all, scale) => {
        all.push(...generatedPairEvidence(scale));
        return all;
      }, [])
    );

    for (let step = 1; step <= 12; step += 1) {
      const valuesByMode: Record<string, string> = {};
      const provenanceByMode: Record<string, ProposedTokenProvenance> = {};
      for (const scale of modes) {
        valuesByMode[scale.mode] = scale.steps[step - 1].hex;
        provenanceByMode[scale.mode] =
          step === 9
            ? {
                kind: 'source-preserved',
                sourceTokenIds: [request.anchor.sourceTokenId],
                sourceTokenId: request.anchor.sourceTokenId,
                sourceMode: request.anchor.sourceMode,
                sourceHex: normalizeHex(request.anchor.hex),
              }
            : {
                kind: 'teul-generated',
                algorithmVersion: 'Teul OKLCH v3',
                sourceTokenIds: [request.anchor.sourceTokenId],
                anchorStep: 9,
              };
      }
      tokens.push({
        id: `generated.${request.id}.${step}`,
        name: `${request.name} ${step}`,
        path: ['product', 'primitives', request.id, String(step)],
        namespace: 'product-primitives',
        valuesByMode,
        provenanceByMode,
        sourceRelationships: [request.anchor.sourceTokenId],
        accessibilityConstrained: step === 11 || step === 12,
      });
    }
  }

  return {
    modules:
      tokens.length === 0
        ? []
        : [
            {
              namespace: 'product-primitives',
              tokens: tokens.sort((a, b) => compareText(a.id, b.id)),
              aliases: [],
              pairEvidence: pairEvidence.sort((a, b) => compareText(a.id, b.id)),
              warnings: [],
            },
          ],
    evidence,
    blockers: blockers.sort((a, b) => compareText(a.message, b.message)),
  };
}

function roleConfirmationBlockers(
  snapshot: SourceSystemSnapshot,
  reviewerDecisions: readonly ProposalReviewerRoleDecision[]
): ProposalBlocker[] {
  const decisions = new Set(
    reviewerDecisions.map(decision => `${decision.tokenId}\u0000${decision.role.toLowerCase()}`)
  );
  return snapshot.tokens.reduce<ProposalBlocker[]>((blockers, token) => {
    const roles = token.roleEvidence.filter(role => {
      if (decisions.has(`${token.id}\u0000${role.role.toLowerCase()}`)) return false;
      const lowConfidence =
        role.status === 'inferred' &&
        (role.confidence === null || role.confidence < ROLE_CONFIDENCE_CONFIRMATION_THRESHOLD);
      return (
        role.status === 'unresolved' ||
        role.reviewerDisposition === 'pending' ||
        lowConfidence ||
        (role.protectedAnchor && role.reviewerDisposition !== 'confirmed')
      );
    });
    for (const role of roles) {
      blockers.push({
        code: 'ROLE_CONFIRMATION_REQUIRED',
        message: `Role ${role.role} for ${token.id} requires explicit confirmation or omission.`,
        sourceTokenIds: [token.id],
        alternatives: ['Confirm the role.', 'Omit the role.', 'Supply stronger evidence.'],
      });
    }
    return blockers;
  }, []);
}

function inaccessibleDeclaredPairBlockers(
  snapshot: SourceSystemSnapshot,
  audit: ColorSystemAudit
): ProposalBlocker[] {
  const protectedIds = new Set(
    snapshot.tokens
      .filter(token => token.roleEvidence.some(role => role.protectedAnchor))
      .map(token => token.id)
  );
  return snapshot.declaredPairs.reduce<ProposalBlocker[]>((blockers, pair) => {
    const evidence = audit.declaredPairTests.find(test => test.id === pair.id);
    const pairTokenIds = [pair.foreground.tokenId, pair.background.tokenId].sort(compareText);
    const protectedInvolved = pairTokenIds.filter(id => protectedIds.has(id));
    if (evidence && (evidence.status === 'unsupported' || evidence.pass === false)) {
      blockers.push({
        code:
          protectedInvolved.length > 0
            ? 'INACCESSIBLE_PROTECTED_ANCHOR'
            : 'INACCESSIBLE_SEMANTIC_PAIR',
        message:
          evidence.status === 'unsupported'
            ? `Declared pair ${pair.id} cannot be verified: ${evidence.unsupportedReason ?? 'unsupported rendering context'}.`
            : `Declared pair ${pair.id} fails its required contrast constraint.`,
        sourceTokenIds: pairTokenIds,
        alternatives: [
          'Change the foreground.',
          'Change the background.',
          'Change the assigned role.',
          'Change or remove the declared constraint.',
        ],
      });
    }
    return blockers;
  }, []);
}

function unsupportedProfileBundle(
  snapshot: SourceSystemSnapshot,
  strategy: ColorSystemProposalRequest['strategy']
): ProposalBundle | null {
  if (snapshot.documentProfile === 'srgb') return null;
  return {
    status: 'no-solution',
    strategy,
    sourceHash: snapshot.sourceHash,
    blockers: [
      {
        code: 'UNSUPPORTED_COLOR_PROFILE',
        message: `${snapshot.documentProfile} inputs may be inventoried but cannot enter sRGB proposal math.`,
        sourceTokenIds: [],
        alternatives: [
          'Use a verified sRGB source.',
          'Export the inventory without a proposal.',
          'Wait for a proven profile conversion policy.',
        ],
      },
    ],
  };
}

function finalizeProposal(
  snapshot: SourceSystemSnapshot,
  content: Omit<ColorSystemProposal, 'proposalHash'>
): ProposalBundle {
  const proposal: ColorSystemProposal = {
    ...content,
    proposalHash: deterministicContentHash(content),
  };
  return { status: proposal.status, proposal };
}

function createExactProposal(
  snapshot: SourceSystemSnapshot,
  request: ExactRadixProposalRequest,
  reviewerDecisions: readonly ProposalReviewerRoleDecision[]
): ProposalBundle {
  const invalidAnchor = request.anchors.find(
    anchor =>
      !HEX_PATTERN.test(anchor.hex) ||
      (anchor.referenceStep !== undefined &&
        (!Number.isInteger(anchor.referenceStep) ||
          anchor.referenceStep < 1 ||
          anchor.referenceStep > 12)) ||
      (anchor.weight !== undefined && (!Number.isFinite(anchor.weight) || anchor.weight <= 0))
  );
  const invalidTolerance =
    request.approvedTolerance !== undefined &&
    (!Number.isFinite(request.approvedTolerance) || request.approvedTolerance < 0);
  if (invalidAnchor || invalidTolerance || request.anchors.length > MAX_EXACT_ANCHORS) {
    return {
      status: 'no-solution',
      strategy: request.strategy,
      sourceHash: snapshot.sourceHash,
      blockers: [
        {
          code: 'NO_SUITABLE_EXACT_MATCH',
          message:
            'Exact Radix ranking requires valid sRGB anchors, steps 1-12, positive weights, and a non-negative finite T-exact.',
          sourceTokenIds: invalidAnchor ? [invalidAnchor.sourceTokenId] : [],
          alternatives: ['Correct the exact-match request.', 'Use brand-preserving generation.'],
        },
      ],
    };
  }
  const exactCandidates = rankExactRadixFamilies(request.anchors);
  const best = exactCandidates[0];
  if (!best) {
    return {
      status: 'no-solution',
      strategy: request.strategy,
      sourceHash: snapshot.sourceHash,
      blockers: [
        {
          code: 'NO_SUITABLE_EXACT_MATCH',
          message: 'At least one confirmed sRGB anchor is required for exact Radix ranking.',
          sourceTokenIds: [],
          alternatives: ['Confirm a source anchor.', 'Use brand-preserving generation.'],
        },
      ],
    };
  }
  if (request.approvedTolerance !== undefined && best.maximumDeltaEOK > request.approvedTolerance) {
    return {
      status: 'no-solution',
      strategy: request.strategy,
      sourceHash: snapshot.sourceHash,
      blockers: [
        {
          code: 'NO_SUITABLE_EXACT_MATCH',
          message: `The closest Radix family exceeds approved T-exact ${request.approvedTolerance}.`,
          sourceTokenIds: request.anchors.map(anchor => anchor.sourceTokenId).sort(compareText),
          alternatives: [
            'Increase T-exact explicitly.',
            'Use brand-preserving generation.',
            'Keep the source anchors unchanged.',
          ],
        },
      ],
    };
  }
  const status =
    request.approvedTolerance === undefined
      ? ('closest-candidate-outside-approved-tolerance' as const)
      : ('suitable-candidate' as const);
  const audit = auditColorSystem(snapshot);
  const modules = [exactRadixModule(best)];
  const moduleCoverage = evaluateProposalModuleCoverage(modules);
  return finalizeProposal(snapshot, {
    schemaVersion: COLOR_SYSTEM_PROPOSAL_SCHEMA_VERSION,
    engineVersion: COLOR_SYSTEM_AUDIT_ENGINE_VERSION,
    strategy: request.strategy,
    strategyVersion: `exact-radix-v1+radix-${RADIX_COLORS_VERSION}`,
    status,
    sourceHash: snapshot.sourceHash,
    lockedAnchorTokenIds: [...new Set(request.anchors.map(anchor => anchor.sourceTokenId))].sort(
      compareText
    ),
    exactCandidates,
    generatedScales: [],
    modules,
    moduleCoverage,
    pairEvidence: audit.declaredPairTests,
    unresolvedBlockers: roleConfirmationBlockers(snapshot, reviewerDecisions),
    warnings: [
      ...(request.approvedTolerance === undefined
        ? ['No T-exact is approved; candidates are ranked without an automatic recommendation.']
        : []),
      ...unresolvedCoverageWarnings(moduleCoverage),
    ],
  });
}

function createGeneratedProposal(
  snapshot: SourceSystemSnapshot,
  request: BrandPreservingProposalRequest,
  reviewerDecisions: readonly ProposalReviewerRoleDecision[]
): ProposalBundle {
  const generated = buildGeneratedScales(snapshot, request.scales);
  const terminalBlockers = generated.blockers;
  if (terminalBlockers.length > 0) {
    return {
      status: 'no-solution',
      strategy: request.strategy,
      sourceHash: snapshot.sourceHash,
      blockers: terminalBlockers,
    };
  }
  const audit = auditColorSystem(snapshot);
  const moduleCoverage = evaluateProposalModuleCoverage(generated.modules);
  const generatedPairEvidence = generated.modules.reduce<AccessibilityPairEvidence[]>(
    (all, module) => {
      all.push(...module.pairEvidence);
      return all;
    },
    []
  );
  return finalizeProposal(snapshot, {
    schemaVersion: COLOR_SYSTEM_PROPOSAL_SCHEMA_VERSION,
    engineVersion: COLOR_SYSTEM_AUDIT_ENGINE_VERSION,
    strategy: request.strategy,
    strategyVersion: 'brand-preserving-v1+Teul-OKLCH-v3',
    status: 'suitable-candidate',
    sourceHash: snapshot.sourceHash,
    lockedAnchorTokenIds: [
      ...new Set(request.scales.map(scale => scale.anchor.sourceTokenId)),
    ].sort(compareText),
    exactCandidates: [],
    generatedScales: generated.evidence,
    modules: generated.modules,
    moduleCoverage,
    pairEvidence: [...audit.declaredPairTests, ...generatedPairEvidence].sort((a, b) =>
      compareText(a.id, b.id)
    ),
    unresolvedBlockers: roleConfirmationBlockers(snapshot, reviewerDecisions),
    warnings: unresolvedCoverageWarnings(moduleCoverage),
  });
}

function createHybridProposal(
  snapshot: SourceSystemSnapshot,
  request: HybridProposalRequest,
  reviewerDecisions: readonly ProposalReviewerRoleDecision[]
): ProposalBundle {
  const exact = createExactProposal(snapshot, request.exact, reviewerDecisions);
  if (exact.status === 'no-solution') {
    return { ...exact, strategy: 'hybrid' };
  }
  const generated = buildGeneratedScales(snapshot, request.generatedScales);
  const terminalBlockers = generated.blockers;
  if (terminalBlockers.length > 0) {
    return {
      status: 'no-solution',
      strategy: request.strategy,
      sourceHash: snapshot.sourceHash,
      blockers: terminalBlockers,
    };
  }
  const audit = auditColorSystem(snapshot);
  const modules = [...exact.proposal.modules, ...generated.modules];
  const moduleCoverage = evaluateProposalModuleCoverage(modules);
  const generatedPairEvidence = generated.modules.reduce<AccessibilityPairEvidence[]>(
    (all, module) => {
      all.push(...module.pairEvidence);
      return all;
    },
    []
  );
  return finalizeProposal(snapshot, {
    schemaVersion: COLOR_SYSTEM_PROPOSAL_SCHEMA_VERSION,
    engineVersion: COLOR_SYSTEM_AUDIT_ENGINE_VERSION,
    strategy: request.strategy,
    strategyVersion: `hybrid-v1+radix-${RADIX_COLORS_VERSION}+Teul-OKLCH-v3`,
    status: exact.status,
    sourceHash: snapshot.sourceHash,
    lockedAnchorTokenIds: [
      ...new Set([
        ...request.exact.anchors.map(anchor => anchor.sourceTokenId),
        ...request.generatedScales.map(scale => scale.anchor.sourceTokenId),
      ]),
    ].sort(compareText),
    exactCandidates: exact.proposal.exactCandidates,
    generatedScales: generated.evidence,
    modules,
    moduleCoverage,
    pairEvidence: [...audit.declaredPairTests, ...generatedPairEvidence].sort((a, b) =>
      compareText(a.id, b.id)
    ),
    unresolvedBlockers: roleConfirmationBlockers(snapshot, reviewerDecisions),
    warnings: [
      ...exact.proposal.warnings.filter(warning => !warning.includes('remains')),
      ...unresolvedCoverageWarnings(moduleCoverage),
    ],
  });
}

export function createColorSystemProposal(
  snapshot: SourceSystemSnapshot,
  request: ColorSystemProposalRequest,
  reviewerDecisions: readonly ProposalReviewerRoleDecision[] = []
): ProposalBundle {
  const profileBlock = unsupportedProfileBundle(snapshot, request.strategy);
  if (profileBlock) return profileBlock;
  const audit = auditColorSystem(snapshot);
  const truncationDiagnostic = audit.diagnostics.find(
    diagnostic => diagnostic.code === 'AUDIT_EVIDENCE_TRUNCATED'
  );
  if (truncationDiagnostic) {
    return {
      status: 'no-solution',
      strategy: request.strategy,
      sourceHash: snapshot.sourceHash,
      blockers: [
        {
          code: 'AUDIT_EVIDENCE_TRUNCATED',
          message: truncationDiagnostic.message,
          sourceTokenIds: [],
          alternatives: [
            'Narrow the audit scope.',
            'Resolve or omit roles before proposing.',
            'Export the bounded audit evidence without applying a proposal.',
          ],
        },
      ],
    };
  }
  const declaredPairBlockers = inaccessibleDeclaredPairBlockers(snapshot, audit);
  if (declaredPairBlockers.length > 0) {
    return {
      status: 'no-solution',
      strategy: request.strategy,
      sourceHash: snapshot.sourceHash,
      blockers: declaredPairBlockers,
    };
  }
  if (request.strategy === 'exact-radix') {
    return createExactProposal(snapshot, request, reviewerDecisions);
  }
  if (request.strategy === 'brand-preserving') {
    return createGeneratedProposal(snapshot, request, reviewerDecisions);
  }
  return createHybridProposal(snapshot, request, reviewerDecisions);
}

export function createProductSemanticModule(
  input: ProductSemanticModuleInput
): { ok: true; module: ColorProposalModule } | { ok: false; blockers: ProposalBlocker[] } {
  const tokensById = new Map(input.availableTokens.map(token => [token.id, token]));
  const requiredRoles = [
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
  ] as const;
  const blockers: ProposalBlocker[] = [];
  for (const mode of [...input.modes].sort(compareText)) {
    for (const role of requiredRoles) {
      const binding = input.bindings.find(
        candidate => candidate.mode === mode && candidate.role === role
      );
      if (!binding || !tokensById.has(binding.targetTokenId)) {
        blockers.push({
          code: 'MISSING_PRODUCT_ROLE',
          message: `Product semantic role ${role} is unresolved for ${mode}.`,
          sourceTokenIds: [],
          alternatives: ['Bind an existing primitive.', 'Omit the mode.', 'Return to role review.'],
        });
      }
    }
  }
  for (const pair of input.pairEvidence ?? []) {
    if (pair.status !== 'tested' || pair.pass !== true) {
      blockers.push({
        code: 'INACCESSIBLE_SEMANTIC_PAIR',
        message: `Product semantic pair ${pair.id} is unsupported or fails its declared constraint.`,
        sourceTokenIds: [],
        alternatives: [
          'Change the foreground.',
          'Change the background.',
          'Change the assigned role.',
          'Change or remove the declared constraint.',
        ],
      });
    }
  }
  if (blockers.length > 0) return { ok: false, blockers };
  const referencedIds = new Set(input.bindings.map(binding => binding.targetTokenId));
  const module: ColorProposalModule = {
    namespace: 'product-semantics',
    tokens: input.availableTokens
      .filter(token => referencedIds.has(token.id))
      .sort((a, b) => compareText(a.id, b.id)),
    aliases: [...input.bindings]
      .map(binding => ({
        id: binding.id,
        role: binding.role,
        mode: binding.mode,
        ...(binding.state ? { state: binding.state } : {}),
        targetTokenId: binding.targetTokenId,
      }))
      .sort((a, b) => compareText(a.id, b.id)),
    pairEvidence: [...(input.pairEvidence ?? [])].sort((a, b) => compareText(a.id, b.id)),
    warnings: [],
  };
  return { ok: true, module };
}

export function createExpressiveModule(input: ExpressiveModuleInput): ColorProposalModule {
  const warnings: string[] = [];
  const pairEvidence: AccessibilityPairEvidence[] = [];
  const tokens = [...input.colors]
    .sort((a, b) => compareText(a.id, b.id))
    .map(color => {
      const valuesByMode = Object.keys(color.valuesByMode)
        .sort(compareText)
        .reduce<Record<string, string>>((result, mode) => {
          result[mode] = normalizeHex(color.valuesByMode[mode]);
          return result;
        }, {});
      const provenanceByMode = Object.keys(valuesByMode).reduce<
        Record<string, ProposedTokenProvenance>
      >((result, mode) => {
        result[mode] = {
          kind: 'source-preserved',
          sourceTokenIds: [color.sourceTokenId],
          sourceTokenId: color.sourceTokenId,
          sourceMode: mode,
          sourceHex: valuesByMode[mode],
        };
        return result;
      }, {});
      if (color.informationBearing) {
        pairEvidence.push(...(color.pairEvidence ?? []));
        if (
          !color.pairEvidence ||
          color.pairEvidence.length === 0 ||
          color.pairEvidence.some(pair => pair.status !== 'tested' || pair.pass !== true)
        ) {
          warnings.push(
            `${color.id} conveys information and requires an explicit rendered accessibility pair.`
          );
        }
      }
      return {
        id: color.id,
        name: color.name,
        path: [input.namespace, color.id],
        namespace: input.namespace,
        valuesByMode,
        provenanceByMode,
        sourceRelationships: [color.sourceTokenId],
        accessibilityConstrained: color.informationBearing,
      } as ProposedColorToken;
    });
  return {
    namespace: input.namespace,
    tokens,
    aliases: [],
    pairEvidence: pairEvidence.sort((a, b) => compareText(a.id, b.id)),
    warnings: warnings.sort(compareText),
  };
}
