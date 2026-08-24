import { generateColorScale } from './colorScale';
import { createSourceSystemSnapshot, deterministicContentHash } from './colorSystemAudit';
import { evaluateProposalModuleCoverage } from './colorSystemProposal';
import {
  COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION,
  COLOR_SYSTEM_STRATEGY_BUILDER_SCHEMA_VERSION,
  COLOR_SYSTEM_STRATEGY_RECOMMENDATION_POLICY_VERSION,
  buildColorSystemStrategyRecommendation,
  colorSystemStrategyActualSystemHash,
  measureColorSystemStrategyCandidate,
  resolveConfirmedColorSystemPrimary,
  type ColorSystemPrimaryLockEvidence,
  type ColorSystemHarmonyProvenance,
  type ColorSystemStrategyCandidate,
  type ColorSystemStrategyMeasurements,
  type ColorSystemStrategyPaletteColor,
  type ColorSystemStrategySet,
  type ColorSystemStrategyRecommendation,
  type ColorSystemStrategyVisualizationArtifact,
} from './colorSystemStrategyBuilder';
import { RADIX_COLORS_VERSION, radixColors, type RadixScale } from './radixColors';
import { compareText, hexToRgb, rgbToHex } from './utils';
import {
  COLOR_SYSTEM_AUDIT_ENGINE_VERSION,
  COLOR_SYSTEM_PROPOSAL_SCHEMA_VERSION,
  type AccessibilityPairEvidence,
  type ColorModuleCoverage,
  type ColorProposalNamespace,
  type ColorProposalModule,
  type ColorSystemBuilderEvidence,
  type ColorSystemProposal,
  type ProposedColorAlias,
  type ProposedColorToken,
  type ProposedTokenProvenance,
  type SourceColorSectionKind,
  type SourceColorToken,
  type SourceColorValue,
  type SourceSystemSnapshot,
  type VisualizationKind,
} from '../types/colorSystemAudit';

export const COLOR_SYSTEM_STRATEGY_PROPOSAL_COMPILER_VERSION = 'teul-strategy-proposal-v1' as const;

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const VISUALIZATION_KINDS: readonly VisualizationKind[] = [
  'categorical',
  'sequential',
  'diverging',
];

/**
 * This union is deliberately local until `ProposedTokenProvenance` adopts the
 * strategy builder's richer, source-linked harmony provenance.
 */
export type ColorSystemStrategyProposalProvenance =
  | ProposedTokenProvenance
  | ColorSystemHarmonyProvenance;

export interface ColorSystemStrategyProposalToken extends Omit<
  ProposedColorToken,
  'provenanceByMode'
> {
  provenanceByMode: Readonly<Record<string, ColorSystemStrategyProposalProvenance>>;
}

export interface ColorSystemStrategyProposalModule extends Omit<ColorProposalModule, 'tokens'> {
  tokens: readonly ColorSystemStrategyProposalToken[];
}

export interface ColorSystemStrategyProposalColorBinding {
  position: number;
  hex: string;
  primitiveTokenId: string;
  semanticTokenId: string;
}

export interface ColorSystemStrategyProposalVisualizationEvidence {
  kind: VisualizationKind;
  evaluationHash: string;
  /**
   * The exact, policy-versioned evaluation that produced this artifact. Keeping
   * it in the proposal makes surface contrast and simulated separation
   * inspectable after the strategy candidate itself is no longer in memory.
   */
  evaluation: ColorSystemStrategyVisualizationArtifact['evaluation'];
  bindings: readonly ColorSystemStrategyProposalColorBinding[];
}

export type ColorSystemStrategyUnsupportedSourceReason =
  | 'transparency'
  | 'unsupported-color-space'
  | 'missing-hex'
  | 'empty-path'
  | 'duplicate-output-path'
  | 'unresolved-section-entry'
  | 'unresolved-alias-target'
  | 'unresolved-alias-target-mode'
  | 'alias-value-divergence';

export interface ColorSystemStrategyUnsupportedSourceEvidence {
  sourceId: string;
  mode?: string;
  section?: SourceColorSectionKind;
  reason: ColorSystemStrategyUnsupportedSourceReason;
  detail: string;
}

export interface ColorSystemStrategySourceContinuityEvidence {
  sourceTokenCount: number;
  sourceSectionCount: number;
  sourceSectionEntryCount: number;
  eligibleSourceTokenModeCount: number;
  compiledSourceTokenModeCount: number;
  omittedEligibleSourceTokenModeCount: number;
  unsupportedSourceTokenModeCount: number;
  eligibleSourceSectionEntryCount: number;
  representedSourceSectionEntryCount: number;
  exactSourceModeCoverage: number;
  exactSectionEntryCoverage: number;
  sourceOwnedTokenIds: readonly string[];
  sourceOwnedAliasIds: readonly string[];
  sourceOwnedTokens: readonly {
    sourceTokenId: string;
    proposalTokenId: string;
    name: string;
    sourcePath: readonly string[];
    outputPath: readonly string[];
    modes: readonly string[];
    aliasTargetsByMode: Readonly<Record<string, string>>;
    sectionMemberships: readonly SourceColorSectionKind[];
  }[];
  unsupported: readonly ColorSystemStrategyUnsupportedSourceEvidence[];
}

export interface ColorSystemStrategyProposalBuilderEvidence extends ColorSystemBuilderEvidence {
  compilerVersion: typeof COLOR_SYSTEM_STRATEGY_PROPOSAL_COMPILER_VERSION;
  candidateLabel: string;
  primaryPreserved: true;
  exactPrimary: {
    sourceTokenId: string;
    sourceMode: string;
    sourceHex: string;
    proposalTokenId: string;
    path: readonly string[];
    valuesByMode: Readonly<Record<string, string>>;
    exactSourceValuesByMode: Readonly<Record<string, SourceColorValue>>;
    sourceAliasTargetsByMode: Readonly<Record<string, string>>;
  };
  primaryLock: ColorSystemPrimaryLockEvidence;
  sourceContinuity: ColorSystemStrategySourceContinuityEvidence;
  measurements: ColorSystemStrategyMeasurements;
  recommendation: ColorSystemStrategyRecommendation;
  secondaryFamilies: readonly {
    familyIndex: 1 | 2;
    seedHex: string;
    hueOffsetDegrees: number;
    brandTokenId: string;
    primitiveTokenIds: readonly string[];
  }[];
  visualizationArtifacts: readonly ColorSystemStrategyProposalVisualizationEvidence[];
}

export interface ColorSystemStrategyProposalContent extends Omit<
  ColorSystemProposal,
  'proposalHash' | 'modules'
> {
  modules: readonly ColorSystemStrategyProposalModule[];
  builderEvidence: ColorSystemStrategyProposalBuilderEvidence;
}

export interface ColorSystemStrategyProposalDraft {
  content: ColorSystemStrategyProposalContent;
  proposalHash: string;
}

export interface ColorSystemStrategyProposalSelection {
  candidateId: string;
  candidateHash: string;
}

export type ColorSystemStrategyProposalBlockerCode =
  | 'SOURCE_MISMATCH'
  | 'PRIMARY_SOURCE_MISMATCH'
  | 'INVALID_STRATEGY_SET'
  | 'CANDIDATE_NOT_FOUND'
  | 'CANDIDATE_HASH_MISMATCH'
  | 'INVALID_CANDIDATE';

export interface ColorSystemStrategyProposalBlocker {
  code: ColorSystemStrategyProposalBlockerCode;
  message: string;
  alternatives: readonly string[];
}

export type ColorSystemStrategyProposalCompileResult =
  | { status: 'ready'; draft: ColorSystemStrategyProposalDraft }
  | {
      status: 'no-solution';
      sourceHash: string;
      blockers: readonly ColorSystemStrategyProposalBlocker[];
    };

interface MaterializedPrimitive {
  token: ColorSystemStrategyProposalToken;
  mode: string;
  hex: string;
}

interface SourceModeValue {
  token: SourceColorToken;
  mode: string;
  hex: string;
  valueKey: string;
}

interface SourceSectionMatch {
  section: SourceColorSectionKind;
  entryId: string;
  entryName: string;
  order: number;
  value: SourceModeValue;
}

interface CompiledSourceModules {
  modules: readonly ColorSystemStrategyProposalModule[];
  primaryToken: ColorSystemStrategyProposalToken;
  evidence: ColorSystemStrategySourceContinuityEvidence;
}

function normalizeHex(hex: string): string {
  if (!HEX_PATTERN.test(hex)) throw new Error(`Invalid six-digit sRGB color: ${hex}`);
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r, g, b).toLowerCase();
}

function sameValue(first: unknown, second: unknown): boolean {
  return deterministicContentHash(first) === deterministicContentHash(second);
}

function sourceSnapshotIntegrityError(snapshot: SourceSystemSnapshot): string | null {
  try {
    const { sourceHash: _sourceHash, ...input } = snapshot;
    return createSourceSystemSnapshot(input).sourceHash === snapshot.sourceHash
      ? null
      : 'The supplied source snapshot no longer matches its canonical source hash.';
  } catch (error) {
    return error instanceof Error
      ? `The supplied source snapshot is invalid: ${error.message}`
      : 'The supplied source snapshot is invalid.';
  }
}

function blocker(
  code: ColorSystemStrategyProposalBlockerCode,
  message: string,
  alternatives: readonly string[]
): ColorSystemStrategyProposalBlocker {
  return { code, message, alternatives };
}

function noSolution(
  strategySet: Pick<ColorSystemStrategySet, 'sourceHash'>,
  item: ColorSystemStrategyProposalBlocker
): ColorSystemStrategyProposalCompileResult {
  return { status: 'no-solution', sourceHash: strategySet.sourceHash, blockers: [item] };
}

function candidateWithoutHashes(
  candidate: ColorSystemStrategyCandidate
): Omit<ColorSystemStrategyCandidate, 'modelHash' | 'candidateHash'> {
  const { modelHash: _modelHash, candidateHash: _candidateHash, ...preview } = candidate;
  return preview;
}

function validateStrategySet(strategySet: ColorSystemStrategySet): string | null {
  if (
    strategySet.schemaVersion !== COLOR_SYSTEM_STRATEGY_BUILDER_SCHEMA_VERSION ||
    strategySet.policyVersion !== COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION ||
    !HASH_PATTERN.test(strategySet.sourceHash) ||
    !HASH_PATTERN.test(strategySet.briefHash) ||
    !HASH_PATTERN.test(strategySet.strategySetHash) ||
    strategySet.recommendation.policyVersion !==
      COLOR_SYSTEM_STRATEGY_RECOMMENDATION_POLICY_VERSION ||
    strategySet.candidates.length < 1 ||
    strategySet.candidates.length > 3 ||
    strategySet.recommendation.ranking.length !== strategySet.candidates.length ||
    strategySet.recommendation.ranking[0]?.candidateId !==
      strategySet.recommendation.recommendedCandidateId ||
    !sameValue(
      strategySet.recommendation,
      buildColorSystemStrategyRecommendation(strategySet.candidates)
    ) ||
    new Set(strategySet.candidates.map(candidate => candidate.id)).size !==
      strategySet.candidates.length ||
    new Set(strategySet.candidates.map(candidate => candidate.actualSystemHash)).size !==
      strategySet.candidates.length
  ) {
    return 'The strategy set has an unsupported version, invalid identity, or incomplete candidate list.';
  }

  for (const candidate of strategySet.candidates) {
    if (
      Object.values(candidate.measurements).some(
        measurement => !Number.isFinite(measurement) || measurement < 0
      )
    ) {
      return `Strategy candidate ${candidate.id} contains invalid measurements.`;
    }
    const preview = candidateWithoutHashes(candidate);
    const modelHash = deterministicContentHash({
      policyVersion: strategySet.policyVersion,
      sourceHash: strategySet.sourceHash,
      briefHash: strategySet.briefHash,
      candidate: preview,
    });
    const candidateHash = deterministicContentHash({
      policyVersion: strategySet.policyVersion,
      sourceHash: strategySet.sourceHash,
      briefHash: strategySet.briefHash,
      modelHash,
      preview,
    });
    if (
      candidate.modelHash !== modelHash ||
      candidate.candidateHash !== candidateHash ||
      candidate.actualSystemHash !== colorSystemStrategyActualSystemHash(candidate) ||
      !sameValue(candidate.primary, strategySet.primary)
    ) {
      return `Strategy candidate ${candidate.id} no longer matches its reviewed evidence.`;
    }
  }

  const strategySetHash = deterministicContentHash({
    schemaVersion: strategySet.schemaVersion,
    policyVersion: strategySet.policyVersion,
    sourceHash: strategySet.sourceHash,
    briefHash: strategySet.briefHash,
    primary: strategySet.primary,
    visualizationSettings: strategySet.visualizationSettings,
    recommendation: strategySet.recommendation,
    blockers: strategySet.blockers,
    candidates: strategySet.candidates.map(candidate => ({
      id: candidate.id,
      modelHash: candidate.modelHash,
      candidateHash: candidate.candidateHash,
    })),
  });
  return strategySetHash === strategySet.strategySetHash
    ? null
    : 'The strategy-set hash no longer matches its reviewed candidates.';
}

function validateSecondaryFamilies(candidate: ColorSystemStrategyCandidate): string | null {
  if (
    candidate.secondaryFamilies.length !== 2 ||
    candidate.secondaryFamilies[0].familyIndex !== 1 ||
    candidate.secondaryFamilies[1].familyIndex !== 2
  ) {
    return 'A compiled strategy requires exactly two ordered Secondary families.';
  }
  for (const family of candidate.secondaryFamilies) {
    if (!HEX_PATTERN.test(family.seedHex)) {
      return `Secondary family ${family.familyIndex} has an invalid seed color.`;
    }
    for (const mode of ['light', 'dark'] as const) {
      const scale = family.modes[mode];
      if (!scale.validation.valid || scale.steps.length !== 12) {
        return `Secondary family ${family.familyIndex} has an incomplete ${mode} scale.`;
      }
      for (let index = 0; index < scale.steps.length; index += 1) {
        const step = scale.steps[index];
        const provenance = step.provenance;
        if (
          step.step !== index + 1 ||
          !HEX_PATTERN.test(step.hex) ||
          provenance.kind !== 'teul-harmony-generated' ||
          provenance.sourceTokenId !== candidate.primary.tokenId ||
          provenance.sourceMode !== candidate.primary.mode ||
          normalizeHex(provenance.sourceHex) !== normalizeHex(candidate.primary.hex) ||
          provenance.direction !== candidate.direction ||
          provenance.familyIndex !== family.familyIndex ||
          provenance.hueOffsetDegrees !== family.hueOffsetDegrees ||
          normalizeHex(provenance.seedHex) !== normalizeHex(family.seedHex) ||
          provenance.mode !== mode ||
          provenance.step !== step.step
        ) {
          return `Secondary family ${family.familyIndex} step ${step.step} has inconsistent provenance.`;
        }
      }
      if (normalizeHex(scale.steps[8].hex) !== normalizeHex(family.seedHex)) {
        return `Secondary family ${family.familyIndex} does not preserve its generated seed at step 9.`;
      }
    }
  }
  return null;
}

function validateVisualizationArtifact(
  candidate: ColorSystemStrategyCandidate,
  artifact: ColorSystemStrategyVisualizationArtifact,
  kind: VisualizationKind
): string | null {
  const settings = candidate.visualization.settings;
  const evaluation = artifact.evaluation;
  if (
    artifact.id !== kind ||
    artifact.kind !== kind ||
    evaluation.id !== kind ||
    evaluation.kind !== kind ||
    evaluation.status !== 'suitable-candidate' ||
    normalizeHex(evaluation.surfaceHex) !== normalizeHex(settings.surfaceHex) ||
    evaluation.chartType !== settings.chartType ||
    evaluation.adjacency !== settings.adjacency ||
    evaluation.nonColorCue !== settings.nonColorCue ||
    !sameValue(
      artifact.colors.map(color => normalizeHex(color.hex)),
      evaluation.colors.map(normalizeHex)
    ) ||
    evaluation.surfaceEvidence.some(evidence => evidence.mode !== settings.mode) ||
    evaluation.blockers.length > 0 ||
    !evaluation.orderingPass ||
    !evaluation.uniqueAfterQuantization
  ) {
    return `The ${kind} artifact no longer matches its suitable-candidate evaluation.`;
  }
  const surfaceIds = new Set<string>();
  for (const evidence of evaluation.surfaceEvidence) {
    if (
      surfaceIds.has(evidence.id) ||
      evidence.status !== 'tested' ||
      evidence.method !== 'WCAG 2.2 sRGB contrast ratio' ||
      evidence.ratio === undefined ||
      !Number.isFinite(evidence.ratio) ||
      evidence.threshold === undefined ||
      !Number.isFinite(evidence.threshold) ||
      evidence.pass !== evidence.ratio >= evidence.threshold
    ) {
      return `The ${kind} artifact contains invalid or duplicate surface-contrast evidence.`;
    }
    surfaceIds.add(evidence.id);
  }
  const expectedSeparationConditions = [
    'normal',
    'protan condition',
    'deutan condition',
    'severe tritanomaly approximation',
  ] as const;
  if (kind === 'sequential') {
    if (evaluation.separationEvidence.length !== 0) {
      return 'The sequential artifact contains separation evidence outside its ordered-palette policy.';
    }
  } else if (
    evaluation.separationEvidence.length !== expectedSeparationConditions.length ||
    evaluation.separationEvidence.some(
      (evidence, index) =>
        evidence.condition !== expectedSeparationConditions[index] ||
        evidence.advisory !== true ||
        !Number.isFinite(evidence.minimumDeltaEOK) ||
        !Number.isFinite(evidence.threshold) ||
        evidence.pass !== evidence.minimumDeltaEOK >= evidence.threshold ||
        evidence.pass !== true ||
        evidence.simulatedColors.length !== artifact.colors.length ||
        evidence.simulatedColors.some(color => !HEX_PATTERN.test(color))
    )
  ) {
    return `The ${kind} artifact does not retain the complete normal and simulated color-vision separation evidence.`;
  }
  const expectedCount =
    kind === 'categorical'
      ? settings.categoryCount
      : kind === 'sequential'
        ? settings.sequentialCount
        : settings.divergingCount;
  if (artifact.colors.length !== expectedCount) {
    return `The ${kind} artifact has ${artifact.colors.length} colors; ${expectedCount} are required.`;
  }
  for (const color of artifact.colors) {
    if (!HEX_PATTERN.test(color.hex) || color.source.mode !== settings.mode) {
      return `The ${kind} artifact contains an invalid or cross-mode source color.`;
    }
  }
  return null;
}

function validateCandidate(candidate: ColorSystemStrategyCandidate): string | null {
  if (!candidate.evidence.primaryPreserved || !candidate.evidence.validLightAndDarkScales) {
    return 'The selected candidate does not carry the required Primary and scale evidence.';
  }
  const familyError = validateSecondaryFamilies(candidate);
  if (familyError) return familyError;
  for (const kind of VISUALIZATION_KINDS) {
    const error = validateVisualizationArtifact(candidate, candidate.visualization[kind], kind);
    if (error) return error;
  }
  return null;
}

function validateSourceContinuity(
  snapshot: SourceSystemSnapshot,
  strategySet: ColorSystemStrategySet
): string | null {
  const existingSourceHexes = [
    ...new Set(
      snapshot.tokens.flatMap(token =>
        Object.values(token.valuesByMode).flatMap(value =>
          value.colorSpace === 'srgb' && value.alpha === 1 && value.hex
            ? [normalizeHex(value.hex)]
            : []
        )
      )
    ),
  ].sort(compareText);
  const canonicalExisting = existingSourceHexes.filter(hex => hex !== strategySet.primary.hex);
  const expectedBriefHash = deterministicContentHash({
    schemaVersion: COLOR_SYSTEM_STRATEGY_BUILDER_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION,
    sourceHash: strategySet.sourceHash,
    primary: strategySet.primary,
    visualizationSettings: strategySet.visualizationSettings,
    existingSourceHexes: canonicalExisting,
  });
  if (expectedBriefHash !== strategySet.briefHash) {
    return 'The strategy brief does not cover the exact eligible colors in the audited source.';
  }
  for (const candidate of strategySet.candidates) {
    const expected = measureColorSystemStrategyCandidate(candidate, existingSourceHexes);
    if (!sameValue(expected, candidate.measurements)) {
      return `Strategy candidate ${candidate.id} source-continuity measurements do not match the audited source.`;
    }
  }
  return null;
}

function secondaryPrimitiveId(
  candidate: ColorSystemStrategyCandidate,
  familyIndex: 1 | 2,
  step: number
): string {
  return `generated.${candidate.direction}.secondary-${familyIndex}.${step}`;
}

function buildSecondaryPrimitiveTokens(
  candidate: ColorSystemStrategyCandidate
): ColorSystemStrategyProposalToken[] {
  return candidate.secondaryFamilies.flatMap(family =>
    Array.from({ length: 12 }, (_, index): ColorSystemStrategyProposalToken => {
      const step = index + 1;
      const light = family.modes.light.steps[index];
      const dark = family.modes.dark.steps[index];
      return {
        id: secondaryPrimitiveId(candidate, family.familyIndex, step),
        name: `${family.name} ${step}`,
        path: [
          'suggested',
          'product',
          'primitives',
          'secondary',
          candidate.direction,
          `family-${family.familyIndex}`,
          String(step),
        ],
        namespace: 'product-primitives',
        valuesByMode: { light: normalizeHex(light.hex), dark: normalizeHex(dark.hex) },
        provenanceByMode: { light: light.provenance, dark: dark.provenance },
        sourceRelationships: [candidate.primary.tokenId],
        accessibilityConstrained: false,
      };
    })
  );
}

function exactSourceValueKey(value: SourceColorValue): string | null {
  if (
    value.colorSpace !== 'srgb' ||
    value.alpha !== 1 ||
    !value.hex ||
    !HEX_PATTERN.test(value.hex)
  ) {
    return null;
  }
  return `${normalizeHex(value.hex)}\u0000${value.components.join(',')}`;
}

function cloneExactSourceValue(value: SourceColorValue): SourceColorValue {
  return {
    colorSpace: value.colorSpace,
    ...(value.hex ? { hex: normalizeHex(value.hex) } : {}),
    components: [value.components[0], value.components[1], value.components[2]],
    alpha: value.alpha,
  };
}

function aliasTargetForSourceMode(token: SourceColorToken, mode: string): string | undefined {
  return token.aliasTargetsByMode !== undefined
    ? token.aliasTargetsByMode[mode]
    : token.aliasTargetId;
}

function sourceModeValues(snapshot: SourceSystemSnapshot): SourceModeValue[] {
  return [...snapshot.tokens]
    .sort((first, second) => compareText(first.id, second.id))
    .flatMap(token =>
      Object.keys(token.valuesByMode)
        .sort(compareText)
        .flatMap(mode => {
          const value = token.valuesByMode[mode];
          const valueKey = exactSourceValueKey(value);
          return valueKey && value.hex
            ? [{ token, mode, hex: normalizeHex(value.hex), valueKey }]
            : [];
        })
    );
}

function sourceRepresentationRank(token: SourceColorToken): number {
  if (token.sourceRepresentation === 'structured-source') return 0;
  if (token.sourceRepresentation === 'authored-token' || !token.sourceRepresentation) return 1;
  return 2;
}

function sectionNamespace(kind: SourceColorSectionKind): ColorProposalNamespace {
  if (kind === 'product-graphics') return 'illustration';
  if (kind === 'data-visualization') return 'data-visualization';
  return 'brand-marketing';
}

function sourceTokenId(token: SourceColorToken): string {
  return `source.${deterministicContentHash({ tokenId: token.id }).slice('sha256:'.length, 23)}`;
}

function unsupportedReason(value: SourceColorValue): ColorSystemStrategyUnsupportedSourceReason {
  if (value.alpha !== 1) return 'transparency';
  if (value.colorSpace !== 'srgb') return 'unsupported-color-space';
  return 'missing-hex';
}

function sourceSectionMatches(
  snapshot: SourceSystemSnapshot,
  values: readonly SourceModeValue[],
  primary: ColorSystemPrimaryLockEvidence,
  unsupported: ColorSystemStrategyUnsupportedSourceEvidence[]
): SourceSectionMatch[] {
  const matches: SourceSectionMatch[] = [];
  for (const section of [...(snapshot.sourceSections ?? [])].sort(
    (first, second) =>
      compareText(first.kind, second.kind) || compareText(first.sourceNodeId, second.sourceNodeId)
  )) {
    for (const entry of [...section.entries].sort(
      (first, second) => first.order - second.order || compareText(first.id, second.id)
    )) {
      const valueKey = exactSourceValueKey(entry.value);
      if (!valueKey) {
        unsupported.push({
          sourceId: entry.id,
          section: section.kind,
          reason: unsupportedReason(entry.value),
          detail: `Source section ${section.kind} entry ${entry.name} cannot be represented as an opaque sRGB proposal token.`,
        });
        continue;
      }
      const matched = values
        .filter(value => value.valueKey === valueKey)
        .sort((first, second) => {
          const firstPrimary =
            first.token.id === primary.tokenId && first.mode === primary.mode ? 0 : 1;
          const secondPrimary =
            second.token.id === primary.tokenId && second.mode === primary.mode ? 0 : 1;
          return (
            firstPrimary - secondPrimary ||
            sourceRepresentationRank(first.token) - sourceRepresentationRank(second.token) ||
            compareText(first.token.id, second.token.id) ||
            compareText(first.mode, second.mode)
          );
        })[0];
      if (!matched) {
        unsupported.push({
          sourceId: entry.id,
          section: section.kind,
          reason: 'unresolved-section-entry',
          detail: `Source section ${section.kind} entry ${entry.name} has no exact token/mode match in the audited snapshot.`,
        });
        continue;
      }
      matches.push({
        section: section.kind,
        entryId: entry.id,
        entryName: entry.name,
        order: entry.order,
        value: matched,
      });
    }
  }
  return matches;
}

function canonicalSourceUnsupported(
  unsupported: readonly ColorSystemStrategyUnsupportedSourceEvidence[]
): ColorSystemStrategyUnsupportedSourceEvidence[] {
  return [...unsupported].sort(
    (first, second) =>
      compareText(first.sourceId, second.sourceId) ||
      compareText(first.mode ?? '', second.mode ?? '') ||
      compareText(first.section ?? '', second.section ?? '') ||
      compareText(first.reason, second.reason)
  );
}

function compileSourceModules(
  snapshot: SourceSystemSnapshot,
  primaryLock: ColorSystemPrimaryLockEvidence
): CompiledSourceModules {
  const values = sourceModeValues(snapshot);
  const unsupported: ColorSystemStrategyUnsupportedSourceEvidence[] = [];
  const matches = sourceSectionMatches(snapshot, values, primaryLock, unsupported);
  // Every authored/imported local token is inside the source boundary.
  // Structured sections and the confirmed Primary remain eligible too, while
  // observed canvas literals do not silently become authored system tokens.
  const selectedTokenIds = new Set([
    ...matches.map(match => match.value.token.id),
    ...snapshot.tokens
      .filter(
        token =>
          token.sourceRepresentation === undefined ||
          token.sourceRepresentation === 'authored-token'
      )
      .map(token => token.id),
    primaryLock.tokenId,
  ]);
  const tokenById = new Map(snapshot.tokens.map(token => [token.id, token]));
  const resolvedAliasTargets = new Map<string, Map<string, string>>();
  const blockedAliasModes = new Map<string, Set<string>>();
  const pendingTokenIds = [...selectedTokenIds].sort(compareText);
  for (let index = 0; index < pendingTokenIds.length; index += 1) {
    const sourceId = pendingTokenIds[index];
    const token = tokenById.get(sourceId);
    if (!token) continue;
    const aliasModes = (
      token.aliasTargetsByMode !== undefined
        ? Object.keys(token.aliasTargetsByMode)
        : token.aliasTargetId
          ? Object.keys(token.valuesByMode)
          : []
    ).sort(compareText);
    for (const mode of aliasModes) {
      const targetId = aliasTargetForSourceMode(token, mode);
      const target = targetId ? tokenById.get(targetId) : undefined;
      const sourceValue = token.valuesByMode[mode];
      const targetValue = target?.valuesByMode[mode];
      let reason: ColorSystemStrategyUnsupportedSourceReason | null = null;
      let detail = '';
      if (!targetId || !target) {
        reason = 'unresolved-alias-target';
        detail = `Source alias ${token.id} mode ${mode} points to a missing source token.`;
      } else if (!sourceValue || !targetValue) {
        reason = 'unresolved-alias-target-mode';
        detail = `Source alias ${token.id} mode ${mode} cannot resolve the same mode on ${targetId}.`;
      } else {
        const sourceKey = exactSourceValueKey(sourceValue);
        const targetKey = exactSourceValueKey(targetValue);
        if (!sourceKey || !targetKey) {
          reason = 'unresolved-alias-target-mode';
          detail = `Source alias ${token.id} mode ${mode} or target ${targetId} is not an exact opaque sRGB value.`;
        } else if (sourceKey !== targetKey) {
          reason = 'alias-value-divergence';
          detail = `Source alias ${token.id} mode ${mode} differs from exact target ${targetId}; Teul will not flatten the alias to its captured literal.`;
        }
      }
      if (reason) {
        const modes = blockedAliasModes.get(token.id) ?? new Set<string>();
        modes.add(mode);
        blockedAliasModes.set(token.id, modes);
        unsupported.push({ sourceId: token.id, mode, reason, detail });
        continue;
      }
      const targets = resolvedAliasTargets.get(token.id) ?? new Map<string, string>();
      targets.set(mode, targetId as string);
      resolvedAliasTargets.set(token.id, targets);
      if (!selectedTokenIds.has(targetId as string)) {
        selectedTokenIds.add(targetId as string);
        pendingTokenIds.push(targetId as string);
      }
    }
  }
  const memberships = new Map<string, Set<SourceColorSectionKind>>();
  for (const match of matches) {
    const sections = memberships.get(match.value.token.id) ?? new Set<SourceColorSectionKind>();
    sections.add(match.section);
    memberships.set(match.value.token.id, sections);
  }
  const namespacePriority: readonly SourceColorSectionKind[] = [
    'primary',
    'secondary',
    'product-graphics',
    'data-visualization',
    'typography',
  ];
  const moduleTokens = new Map<ColorProposalNamespace, ColorSystemStrategyProposalToken[]>();
  const moduleAliases = new Map<ColorProposalNamespace, ProposedColorAlias[]>();
  const compiledBySourceId = new Map<string, ColorSystemStrategyProposalToken>();
  const outputPaths = new Set<string>();
  const sourceOwnedTokens: ColorSystemStrategySourceContinuityEvidence['sourceOwnedTokens'][number][] =
    [];
  let eligibleSourceTokenModeCount = 0;
  let compiledSourceTokenModeCount = 0;

  for (const token of [...snapshot.tokens]
    .filter(item => selectedTokenIds.has(item.id))
    .sort((first, second) => {
      const firstPrimary = first.id === primaryLock.tokenId ? 0 : 1;
      const secondPrimary = second.id === primaryLock.tokenId ? 0 : 1;
      return firstPrimary - secondPrimary || compareText(first.id, second.id);
    })) {
    const modes = Object.keys(token.valuesByMode).sort(compareText);
    const eligibleModes = modes.filter(mode => exactSourceValueKey(token.valuesByMode[mode]));
    const supportedModes = eligibleModes.filter(
      mode => !blockedAliasModes.get(token.id)?.has(mode)
    );
    eligibleSourceTokenModeCount += eligibleModes.length;
    for (const mode of modes.filter(candidate => !eligibleModes.includes(candidate))) {
      const value = token.valuesByMode[mode];
      unsupported.push({
        sourceId: token.id,
        mode,
        reason: unsupportedReason(value),
        detail: `Source token ${token.id} mode ${mode} cannot be represented as an opaque sRGB proposal token.`,
      });
    }
    const sectionKinds = memberships.get(token.id) ?? new Set<SourceColorSectionKind>();
    const ownerKind = namespacePriority.find(kind => sectionKinds.has(kind));
    const ownerMatch = ownerKind
      ? matches
          .filter(match => match.value.token.id === token.id && match.section === ownerKind)
          .sort(
            (first, second) =>
              first.order - second.order || compareText(first.entryId, second.entryId)
          )[0]
      : undefined;
    if (token.path.length === 0 && token.id === primaryLock.tokenId) {
      unsupported.push({
        sourceId: token.id,
        reason: 'empty-path',
        detail: `Source token ${token.id} has no output path and was not compiled.`,
      });
      if (token.id === primaryLock.tokenId) {
        throw new Error('The protected Primary has no source path and cannot be compiled safely.');
      }
      continue;
    }
    if (supportedModes.length === 0) continue;
    let outputPath =
      token.id === primaryLock.tokenId
        ? [...token.path]
        : !ownerMatch
          ? [
              'source',
              'local',
              ...token.path,
              deterministicContentHash({ tokenId: token.id }).slice('sha256:'.length, 17),
            ]
          : [
              'source',
              ownerMatch.section,
              `group-${Math.floor((ownerMatch.order - 1) / 12) + 1}`,
              String(((ownerMatch.order - 1) % 12) + 1),
            ];
    let pathKey = outputPath.join('\u0000');
    if (outputPaths.has(pathKey)) {
      const finalSegment = outputPath[outputPath.length - 1];
      outputPath = [
        ...outputPath.slice(0, -1),
        `token-${deterministicContentHash({ tokenId: token.id }).slice('sha256:'.length, 17)}`,
        finalSegment,
      ];
      pathKey = outputPath.join('\u0000');
      if (outputPaths.has(pathKey)) {
        throw new Error(`Source token ${token.id} cannot receive a unique deterministic path.`);
      }
    }
    outputPaths.add(pathKey);
    const namespace =
      token.id === primaryLock.tokenId
        ? 'brand-marketing'
        : ownerKind
          ? sectionNamespace(ownerKind)
          : 'brand-marketing';
    const valuesByMode: Record<string, string> = {};
    const exactSourceValuesByMode: Record<string, SourceColorValue> = {};
    const sourceAliasTargetsByMode: Record<string, string> = {};
    const provenanceByMode: Record<string, ProposedTokenProvenance> = {};
    for (const mode of supportedModes) {
      const value = token.valuesByMode[mode];
      if (!value.hex) continue;
      const hex = normalizeHex(value.hex);
      valuesByMode[mode] = hex;
      exactSourceValuesByMode[mode] = cloneExactSourceValue(value);
      provenanceByMode[mode] = {
        kind: 'source-preserved',
        sourceTokenIds: [token.id],
        sourceTokenId: token.id,
        sourceMode: mode,
        sourceHex: hex,
        sourceComponents: [value.components[0], value.components[1], value.components[2]],
        sourceAlpha: value.alpha,
      };
      const targetId = resolvedAliasTargets.get(token.id)?.get(mode);
      if (targetId) sourceAliasTargetsByMode[mode] = sourceTokenId(tokenById.get(targetId)!);
      compiledSourceTokenModeCount += 1;
    }
    const compiled: ColorSystemStrategyProposalToken = {
      id: sourceTokenId(token),
      name: ownerMatch?.entryName ?? token.name,
      path: outputPath,
      namespace,
      valuesByMode,
      exactSourceValuesByMode,
      ...(Object.keys(sourceAliasTargetsByMode).length > 0 ? { sourceAliasTargetsByMode } : {}),
      provenanceByMode,
      sourceRelationships: [
        token.id,
        ...new Set(resolvedAliasTargets.get(token.id)?.values() ?? []),
      ],
      accessibilityConstrained: false,
    };
    compiledBySourceId.set(token.id, compiled);
    sourceOwnedTokens.push({
      sourceTokenId: token.id,
      proposalTokenId: compiled.id,
      name: compiled.name,
      sourcePath: [...token.path],
      outputPath: [...compiled.path],
      modes: supportedModes,
      aliasTargetsByMode: Object.fromEntries(
        [...(resolvedAliasTargets.get(token.id) ?? new Map<string, string>()).entries()].sort(
          ([first], [second]) => compareText(first, second)
        )
      ),
      sectionMemberships: [...sectionKinds].sort(compareText),
    });
    const tokens = moduleTokens.get(namespace) ?? [];
    tokens.push(compiled);
    moduleTokens.set(namespace, tokens);
  }

  const primaryToken = compiledBySourceId.get(primaryLock.tokenId);
  const primaryExactValue = primaryToken?.exactSourceValuesByMode?.[primaryLock.mode];
  if (
    !primaryToken ||
    primaryToken.valuesByMode[primaryLock.mode] !== primaryLock.exactHex ||
    !primaryExactValue ||
    primaryExactValue.alpha !== primaryLock.alpha ||
    primaryExactValue.components.some(
      (component, index) => component !== primaryLock.exactComponents[index]
    )
  ) {
    throw new Error('The protected Primary was not preserved in its exact source mode and value.');
  }
  const compiledProposalIds = new Set([...compiledBySourceId.values()].map(token => token.id));
  for (const token of compiledBySourceId.values()) {
    for (const [mode, targetId] of Object.entries(token.sourceAliasTargetsByMode ?? {})) {
      if (!compiledProposalIds.has(targetId)) {
        throw new Error(
          `Source alias ${token.id} mode ${mode} cannot resolve compiled target ${targetId}.`
        );
      }
    }
  }

  let representedSourceSectionEntryCount = 0;
  for (const match of matches) {
    const target = compiledBySourceId.get(match.value.token.id);
    if (!target || target.valuesByMode[match.value.mode] !== match.value.hex) continue;
    const namespace = sectionNamespace(match.section);
    const aliases = moduleAliases.get(namespace) ?? [];
    aliases.push({
      id: `source-section.${match.section}.${deterministicContentHash({ entryId: match.entryId }).slice('sha256:'.length, 19)}`,
      role: `source-${match.section}`,
      mode: match.value.mode,
      state: `${String(match.order).padStart(2, '0')}-${match.entryName}`,
      targetTokenId: target.id,
    });
    moduleAliases.set(namespace, aliases);
    representedSourceSectionEntryCount += 1;
  }

  const namespaces = new Set([...moduleTokens.keys(), ...moduleAliases.keys()]);
  const modules = [...namespaces]
    .map(
      (namespace): ColorSystemStrategyProposalModule => ({
        namespace,
        tokens: moduleTokens.get(namespace) ?? [],
        aliases: moduleAliases.get(namespace) ?? [],
        pairEvidence: [],
        warnings: [
          'Source-owned colors retain exact supported sRGB values, native mode names, source identity, and source-preserved provenance; ordered section output is chunked to bounded 12-swatch groups.',
        ],
      })
    )
    .sort((first, second) => compareText(first.namespace, second.namespace));
  const eligibleSourceSectionEntryCount = (snapshot.sourceSections ?? []).reduce(
    (count, section) =>
      count + section.entries.filter(entry => exactSourceValueKey(entry.value) !== null).length,
    0
  );
  const sourceOwnedTokenIds = [...compiledBySourceId.values()]
    .map(token => token.id)
    .sort(compareText);
  const sourceOwnedAliasIds = modules
    .flatMap(module => module.aliases.map(alias => `${module.namespace}:${alias.id}`))
    .concat(
      [...compiledBySourceId.values()].flatMap(token =>
        Object.keys(token.sourceAliasTargetsByMode ?? {}).map(mode => `${token.id}:${mode}`)
      )
    )
    .sort(compareText);
  return {
    modules,
    primaryToken,
    evidence: {
      sourceTokenCount: snapshot.tokens.length,
      sourceSectionCount: snapshot.sourceSections?.length ?? 0,
      sourceSectionEntryCount: (snapshot.sourceSections ?? []).reduce(
        (count, section) => count + section.entries.length,
        0
      ),
      eligibleSourceTokenModeCount,
      compiledSourceTokenModeCount,
      omittedEligibleSourceTokenModeCount:
        eligibleSourceTokenModeCount - compiledSourceTokenModeCount,
      unsupportedSourceTokenModeCount: new Set(
        unsupported
          .filter(item => item.mode !== undefined && tokenById.has(item.sourceId))
          .map(item => `${item.sourceId}\u0000${item.mode}`)
      ).size,
      eligibleSourceSectionEntryCount,
      representedSourceSectionEntryCount,
      exactSourceModeCoverage:
        eligibleSourceTokenModeCount === 0
          ? 0
          : Number((compiledSourceTokenModeCount / eligibleSourceTokenModeCount).toFixed(6)),
      exactSectionEntryCoverage:
        eligibleSourceSectionEntryCount === 0
          ? 0
          : Number(
              (representedSourceSectionEntryCount / eligibleSourceSectionEntryCount).toFixed(6)
            ),
      sourceOwnedTokenIds,
      sourceOwnedAliasIds,
      sourceOwnedTokens: sourceOwnedTokens.sort((first, second) =>
        compareText(first.sourceTokenId, second.sourceTokenId)
      ),
      unsupported: canonicalSourceUnsupported(unsupported),
    },
  };
}

function buildBrandModule(
  candidate: ColorSystemStrategyCandidate,
  secondaryTokens: readonly ColorSystemStrategyProposalToken[],
  primaryToken: ColorSystemStrategyProposalToken
): ColorSystemStrategyProposalModule {
  const secondaryBrandTokens = candidate.secondaryFamilies.map(family => {
    const primitive = secondaryTokens.find(
      token => token.id === secondaryPrimitiveId(candidate, family.familyIndex, 9)
    );
    if (!primitive) throw new Error(`Secondary family ${family.familyIndex} is missing step 9.`);
    return {
      ...primitive,
      id: `brand.secondary.${family.familyIndex}`,
      name: `${family.name} anchor`,
      path: ['suggested', 'brand', 'secondary', String(family.familyIndex)],
      namespace: 'brand-marketing' as const,
      accessibilityConstrained: false,
    };
  });
  const aliases: ProposedColorAlias[] = [
    ...Object.keys(primaryToken.valuesByMode).map(mode => ({
      id: 'brand.primary',
      role: 'primary',
      mode,
      targetTokenId: primaryToken.id,
    })),
    ...secondaryBrandTokens.flatMap((token, index) =>
      (['light', 'dark'] as const).map(mode => ({
        id: `brand.secondary-${index + 1}`,
        role: 'secondary',
        mode,
        state: String(index + 1),
        targetTokenId: token.id,
      }))
    ),
  ];
  return {
    namespace: 'brand-marketing',
    tokens: secondaryBrandTokens,
    aliases,
    pairEvidence: [],
    warnings: [
      'Primary is preserved exactly; Secondary anchors are deterministic suggestions and are not source colors.',
    ],
  };
}

function addPrimitive(
  tokens: Map<string, ColorSystemStrategyProposalToken>,
  token: ColorSystemStrategyProposalToken
): ColorSystemStrategyProposalToken {
  const existing = tokens.get(token.id);
  if (existing && !sameValue(existing, token)) {
    throw new Error(`Primitive ${token.id} has conflicting definitions.`);
  }
  if (!existing) tokens.set(token.id, token);
  return existing ?? token;
}

function materializePalettePrimitive(
  candidate: ColorSystemStrategyCandidate,
  color: ColorSystemStrategyPaletteColor,
  secondaryTokens: ReadonlyMap<string, ColorSystemStrategyProposalToken>,
  primitiveTokens: Map<string, ColorSystemStrategyProposalToken>
): MaterializedPrimitive {
  const source = color.source;
  const expectedHex = normalizeHex(color.hex);
  if (source.kind === 'secondary-scale') {
    const id = secondaryPrimitiveId(candidate, source.familyIndex, source.step);
    const token = secondaryTokens.get(id);
    if (!token || normalizeHex(token.valuesByMode[source.mode]) !== expectedHex) {
      throw new Error(`Visualization Secondary source ${id} does not match ${expectedHex}.`);
    }
    return { token, mode: source.mode, hex: expectedHex };
  }

  if (source.kind === 'primary-scale') {
    if (source.sourceTokenId !== candidate.primary.tokenId) {
      throw new Error('Visualization Primary support no longer references the protected Primary.');
    }
    const id = `generated.primary-support.${source.step}`;
    let token = primitiveTokens.get(id);
    if (!token) {
      const light = generateColorScale(candidate.primary.hex, 'light', candidate.primary.name);
      const dark = generateColorScale(candidate.primary.hex, 'dark', candidate.primary.name);
      if (
        !light.validation.valid ||
        !dark.validation.valid ||
        source.step < 1 ||
        source.step > 12
      ) {
        throw new Error('Visualization Primary support scale is invalid.');
      }
      const provenance: ProposedTokenProvenance = {
        kind: 'teul-generated',
        algorithmVersion: 'Teul OKLCH v3',
        sourceTokenIds: [candidate.primary.tokenId],
        anchorStep: 9,
      };
      token = addPrimitive(primitiveTokens, {
        id,
        name: `${candidate.primary.name} support ${source.step}`,
        path: ['suggested', 'product', 'primitives', 'primary-support', String(source.step)],
        namespace: 'product-primitives',
        valuesByMode: {
          light: normalizeHex(light.steps[source.step - 1].hex),
          dark: normalizeHex(dark.steps[source.step - 1].hex),
        },
        provenanceByMode: { light: provenance, dark: provenance },
        sourceRelationships: [candidate.primary.tokenId],
        accessibilityConstrained: source.step === 11 || source.step === 12,
      });
    }
    if (normalizeHex(token.valuesByMode[source.mode]) !== expectedHex) {
      throw new Error(`Visualization Primary support ${id} does not match ${expectedHex}.`);
    }
    return { token, mode: source.mode, hex: expectedHex };
  }

  if (source.packageVersion !== RADIX_COLORS_VERSION || source.step < 1 || source.step > 12) {
    throw new Error('Visualization Radix support has invalid pinned provenance.');
  }
  const family = radixColors[source.family as keyof typeof radixColors];
  if (!family) throw new Error(`Unknown exact Radix support family ${source.family}.`);
  const id = `radix.${family.name}.${source.step}`;
  let token = primitiveTokens.get(id);
  if (!token) {
    const lightProvenance: ProposedTokenProvenance = {
      kind: 'exact-radix',
      packageVersion: RADIX_COLORS_VERSION,
      family: family.name,
      mode: 'light',
      step: source.step,
    };
    const darkProvenance: ProposedTokenProvenance = {
      ...lightProvenance,
      mode: 'dark',
    };
    token = addPrimitive(primitiveTokens, {
      id,
      name: `${family.displayName} ${source.step}`,
      path: ['product', 'primitives', family.name, String(source.step)],
      namespace: 'product-primitives',
      valuesByMode: {
        light: normalizeHex(family.light[source.step as keyof RadixScale]),
        dark: normalizeHex(family.dark[source.step as keyof RadixScale]),
      },
      provenanceByMode: { light: lightProvenance, dark: darkProvenance },
      sourceRelationships: [],
      accessibilityConstrained: false,
    });
  }
  if (normalizeHex(token.valuesByMode[source.mode]) !== expectedHex) {
    throw new Error(`Visualization Radix support ${id} does not match ${expectedHex}.`);
  }
  return { token, mode: source.mode, hex: expectedHex };
}

function deduplicatePairEvidence(
  evidence: readonly AccessibilityPairEvidence[]
): AccessibilityPairEvidence[] {
  const byId = new Map<string, AccessibilityPairEvidence>();
  for (const item of evidence) {
    const existing = byId.get(item.id);
    if (existing && !sameValue(existing, item)) {
      throw new Error(`Accessibility evidence ${item.id} has conflicting definitions.`);
    }
    if (!existing) byId.set(item.id, item);
  }
  return [...byId.values()].sort((first, second) => compareText(first.id, second.id));
}

function buildVisualizationModule(
  candidate: ColorSystemStrategyCandidate,
  secondaryTokens: ReadonlyMap<string, ColorSystemStrategyProposalToken>,
  primitiveTokens: Map<string, ColorSystemStrategyProposalToken>
): {
  module: ColorSystemStrategyProposalModule;
  evidence: ColorSystemStrategyProposalVisualizationEvidence[];
} {
  const aliases: ProposedColorAlias[] = [];
  const artifactEvidence: ColorSystemStrategyProposalVisualizationEvidence[] = [];
  const pairEvidence: AccessibilityPairEvidence[] = [];

  for (const kind of VISUALIZATION_KINDS) {
    const artifact = candidate.visualization[kind];
    const bindings = artifact.colors.map(
      (color, index): ColorSystemStrategyProposalColorBinding => {
        const primitive = materializePalettePrimitive(
          candidate,
          color,
          secondaryTokens,
          primitiveTokens
        );
        const position = index + 1;
        const semanticTokenId = `viz.${kind}.${String(position).padStart(2, '0')}`;
        if (!primitive.token.provenanceByMode[primitive.mode])
          throw new Error(`Primitive ${primitive.token.id} has no ${primitive.mode} provenance.`);
        aliases.push({
          id: semanticTokenId,
          role: kind,
          mode: primitive.mode,
          state: String(position),
          targetTokenId: primitive.token.id,
        });
        return {
          position,
          hex: primitive.hex,
          primitiveTokenId: primitive.token.id,
          semanticTokenId,
        };
      }
    );
    pairEvidence.push(...artifact.evaluation.surfaceEvidence);
    artifactEvidence.push({
      kind,
      evaluationHash: deterministicContentHash(artifact.evaluation),
      evaluation: artifact.evaluation,
      bindings,
    });
  }

  return {
    module: {
      namespace: 'data-visualization',
      // Data Viz roles are semantic aliases over the already approved primitive
      // graph. Duplicating their literal values here would sever propagation
      // when a reviewed primitive is edited after creation.
      tokens: [],
      aliases: aliases.sort((first, second) => compareText(first.id, second.id)),
      pairEvidence: deduplicatePairEvidence(pairEvidence),
      warnings: [
        candidate.evidence.accessibilityBoundary,
        `Declared chart context: ${candidate.visualization.settings.chartType}; non-color cue: ${candidate.visualization.settings.nonColorCue}.`,
      ],
    },
    evidence: artifactEvidence,
  };
}

function canonicalModule(
  module: ColorSystemStrategyProposalModule
): ColorSystemStrategyProposalModule {
  return {
    ...module,
    tokens: [...module.tokens].sort((first, second) => compareText(first.id, second.id)),
    aliases: [...module.aliases].sort((first, second) => {
      const byId = compareText(first.id, second.id);
      return byId !== 0 ? byId : compareText(first.mode, second.mode);
    }),
    pairEvidence: [...module.pairEvidence].sort((first, second) =>
      compareText(first.id, second.id)
    ),
    warnings: [...new Set(module.warnings)].sort(compareText),
  };
}

function mergeModules(
  modules: readonly ColorSystemStrategyProposalModule[]
): ColorSystemStrategyProposalModule[] {
  const byNamespace = new Map<ColorProposalNamespace, ColorSystemStrategyProposalModule>();
  for (const module of modules) {
    const existing = byNamespace.get(module.namespace);
    if (!existing) {
      byNamespace.set(module.namespace, canonicalModule(module));
      continue;
    }
    const tokens = new Map(existing.tokens.map(token => [token.id, token]));
    for (const token of module.tokens) {
      const prior = tokens.get(token.id);
      if (prior && !sameValue(prior, token)) {
        throw new Error(
          `Proposal token ${token.id} has conflicting source and suggested definitions.`
        );
      }
      if (!prior) tokens.set(token.id, token);
    }
    const aliases = new Map(
      existing.aliases.map(alias => [`${alias.id}\u0000${alias.mode}`, alias])
    );
    for (const alias of module.aliases) {
      const key = `${alias.id}\u0000${alias.mode}`;
      const prior = aliases.get(key);
      if (prior && !sameValue(prior, alias)) {
        throw new Error(`Proposal alias ${alias.id} has conflicting ${alias.mode} targets.`);
      }
      if (!prior) aliases.set(key, alias);
    }
    byNamespace.set(
      module.namespace,
      canonicalModule({
        namespace: module.namespace,
        tokens: [...tokens.values()],
        aliases: [...aliases.values()],
        pairEvidence: deduplicatePairEvidence([...existing.pairEvidence, ...module.pairEvidence]),
        warnings: [...existing.warnings, ...module.warnings],
      })
    );
  }
  return [...byNamespace.values()].sort((first, second) =>
    compareText(first.namespace, second.namespace)
  );
}

function moduleCoverage(
  modules: readonly ColorSystemStrategyProposalModule[]
): ColorModuleCoverage[] {
  const coverage = evaluateProposalModuleCoverage(
    modules as unknown as readonly ColorProposalModule[]
  );
  return coverage.map(item => {
    if (item.module !== 'product-primitives') return item;
    const accent = modules
      .filter(module => module.namespace === 'product-primitives')
      .some(module =>
        module.tokens.some(token =>
          Object.values(token.provenanceByMode).some(
            provenance => provenance.kind === 'teul-harmony-generated'
          )
        )
      );
    if (!accent || item.coveredRoles.includes('accent')) return item;
    const coveredRoles = [...item.coveredRoles, 'accent'].sort(compareText);
    const missingRoles = item.missingRoles.filter(role => role !== 'accent');
    return {
      ...item,
      coveredRoles,
      missingRoles,
      status: missingRoles.length === 0 ? 'covered' : 'partial',
    };
  });
}

function compileCandidate(
  snapshot: SourceSystemSnapshot,
  strategySet: ColorSystemStrategySet,
  candidate: ColorSystemStrategyCandidate,
  primaryLock: ColorSystemPrimaryLockEvidence
): ColorSystemStrategyProposalDraft {
  const source = compileSourceModules(snapshot, primaryLock);
  const secondary = buildSecondaryPrimitiveTokens(candidate);
  const secondaryById = new Map(secondary.map(token => [token.id, token]));
  const primitives = new Map(secondaryById);
  const visualization = buildVisualizationModule(candidate, secondaryById, primitives);
  const primitiveModule: ColorSystemStrategyProposalModule = {
    namespace: 'product-primitives',
    tokens: [...primitives.values()],
    aliases: [],
    pairEvidence: [],
    warnings: [
      'Secondary scales are generated suggestions linked to the exact protected Primary; they are not historical or exact Radix scales.',
    ],
  };
  const brandModule = buildBrandModule(candidate, secondary, source.primaryToken);
  const modules = mergeModules([
    ...source.modules,
    brandModule,
    primitiveModule,
    visualization.module,
  ]);
  const coverage = moduleCoverage(modules);
  const warnings = [
    ...candidate.warnings,
    'Product semantic roles are intentionally unassigned until they are composed from these reviewed primitives.',
    ...(source.evidence.unsupported.length > 0 ||
    source.evidence.omittedEligibleSourceTokenModeCount > 0
      ? [
          `${source.evidence.omittedEligibleSourceTokenModeCount} eligible exact source token/mode values remain inventory-only; ${source.evidence.unsupportedSourceTokenModeCount} source token/mode coordinates have issues across ${source.evidence.unsupported.length} explicit token or structured-section issue receipts.`,
        ]
      : []),
    ...coverage
      .filter(item => item.status !== 'covered')
      .map(
        item =>
          `${item.module} remains ${item.status}; unresolved roles: ${item.missingRoles.join(', ')}.`
      ),
  ];
  const builderEvidence: ColorSystemStrategyProposalBuilderEvidence = {
    compilerVersion: COLOR_SYSTEM_STRATEGY_PROPOSAL_COMPILER_VERSION,
    policyVersion: COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION,
    strategySetHash: strategySet.strategySetHash,
    briefHash: strategySet.briefHash,
    candidateId: candidate.id,
    candidateLabel: candidate.label,
    modelHash: candidate.modelHash,
    candidateHash: candidate.candidateHash,
    primary: candidate.primary,
    visualizationSettings: candidate.visualization.settings,
    primaryPreserved: true,
    exactPrimary: {
      sourceTokenId: candidate.primary.tokenId,
      sourceMode: candidate.primary.mode,
      sourceHex: normalizeHex(candidate.primary.hex),
      proposalTokenId: source.primaryToken.id,
      path: [...source.primaryToken.path],
      valuesByMode: { ...source.primaryToken.valuesByMode },
      exactSourceValuesByMode: { ...source.primaryToken.exactSourceValuesByMode },
      sourceAliasTargetsByMode: { ...source.primaryToken.sourceAliasTargetsByMode },
    },
    primaryLock,
    sourceContinuity: source.evidence,
    measurements: candidate.measurements,
    recommendation: strategySet.recommendation,
    secondaryFamilies: candidate.secondaryFamilies.map(family => ({
      familyIndex: family.familyIndex,
      seedHex: normalizeHex(family.seedHex),
      hueOffsetDegrees: family.hueOffsetDegrees,
      brandTokenId: `brand.secondary.${family.familyIndex}`,
      primitiveTokenIds: Array.from({ length: 12 }, (_, index) =>
        secondaryPrimitiveId(candidate, family.familyIndex, index + 1)
      ),
    })),
    visualizationArtifacts: visualization.evidence,
  };
  const pairEvidence = deduplicatePairEvidence(visualization.module.pairEvidence);
  const content: ColorSystemStrategyProposalContent = {
    schemaVersion: COLOR_SYSTEM_PROPOSAL_SCHEMA_VERSION,
    engineVersion: COLOR_SYSTEM_AUDIT_ENGINE_VERSION,
    strategy: 'hybrid',
    strategyVersion: `${COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION}+${COLOR_SYSTEM_STRATEGY_PROPOSAL_COMPILER_VERSION}`,
    status: 'suitable-candidate',
    sourceHash: strategySet.sourceHash,
    lockedAnchorTokenIds: [candidate.primary.tokenId],
    exactCandidates: [],
    generatedScales: [],
    modules,
    moduleCoverage: coverage,
    pairEvidence,
    unresolvedBlockers: [],
    warnings: [...new Set(warnings)].sort(compareText),
    builderEvidence,
  };
  return { content, proposalHash: deterministicContentHash(content) };
}

/**
 * Compiles one reviewed strategy candidate into a proposal-shaped, pre-apply
 * draft. The function is pure: it performs no Figma mutation and verifies the
 * full strategy/candidate hash chain before returning output.
 */
export function compileColorSystemStrategyProposal(
  snapshot: SourceSystemSnapshot,
  strategySet: ColorSystemStrategySet,
  selection: ColorSystemStrategyProposalSelection
): ColorSystemStrategyProposalCompileResult {
  const snapshotError = sourceSnapshotIntegrityError(snapshot);
  if (snapshotError) {
    return noSolution(
      strategySet,
      blocker('SOURCE_MISMATCH', snapshotError, [
        'Analyze the source again.',
        'Do not apply modified snapshot data.',
      ])
    );
  }
  if (snapshot.sourceHash !== strategySet.sourceHash) {
    return noSolution(
      strategySet,
      blocker(
        'SOURCE_MISMATCH',
        'The strategy set does not belong to the supplied audited source snapshot.',
        ['Analyze the source again.', 'Regenerate the strategy comparison.']
      )
    );
  }
  const setError = validateStrategySet(strategySet);
  if (setError) {
    return noSolution(
      strategySet,
      blocker('INVALID_STRATEGY_SET', setError, [
        'Regenerate the strategy comparison from the current source.',
        'Do not apply stale or modified strategy data.',
      ])
    );
  }
  const candidate = strategySet.candidates.find(item => item.id === selection.candidateId);
  if (!candidate) {
    return noSolution(
      strategySet,
      blocker('CANDIDATE_NOT_FOUND', `Strategy ${selection.candidateId} is not in this set.`, [
        'Choose one of the reviewed strategies.',
        'Regenerate the strategy comparison.',
      ])
    );
  }
  if (candidate.candidateHash !== selection.candidateHash) {
    return noSolution(
      strategySet,
      blocker(
        'CANDIDATE_HASH_MISMATCH',
        `Strategy ${candidate.id} no longer matches the reviewed candidate hash.`,
        ['Review the current strategy again.', 'Regenerate the comparison from the source.']
      )
    );
  }
  const primary = resolveConfirmedColorSystemPrimary(snapshot, {
    tokenId: strategySet.primary.tokenId,
    mode: strategySet.primary.mode,
    hex: strategySet.primary.hex,
  });
  if (primary.status !== 'ready') {
    return noSolution(
      strategySet,
      blocker('PRIMARY_SOURCE_MISMATCH', primary.message, [
        'Analyze the source again.',
        'Explicitly confirm the current exact Primary.',
      ])
    );
  }
  const continuityError = validateSourceContinuity(snapshot, strategySet);
  if (continuityError) {
    return noSolution(
      strategySet,
      blocker('INVALID_STRATEGY_SET', continuityError, [
        'Regenerate the strategy comparison from the current audited source.',
        'Do not apply a strategy measured against a partial source palette.',
      ])
    );
  }
  const candidateError = validateCandidate(candidate);
  if (candidateError) {
    return noSolution(
      strategySet,
      blocker('INVALID_CANDIDATE', candidateError, [
        'Regenerate the candidate from the source.',
        'Keep the current system unchanged.',
      ])
    );
  }
  try {
    return {
      status: 'ready',
      draft: compileCandidate(snapshot, strategySet, candidate, primary.lock),
    };
  } catch (error) {
    return noSolution(
      strategySet,
      blocker(
        'INVALID_CANDIDATE',
        error instanceof Error ? error.message : 'The selected strategy could not be compiled.',
        ['Regenerate the candidate from the source.', 'Keep the current system unchanged.']
      )
    );
  }
}
