import {
  generateColorScale,
  isOklchInSrgbGamut,
  mapOklchToSrgb,
  type ColorScaleValidation,
} from './colorScale';
import { deterministicContentHash } from './colorSystemAudit';
import { evaluateVisualizationPalette } from './colorSystemVisualization';
import {
  COLOR_SYSTEM_STRATEGY_RECOMMENDATION_POLICY_VERSION_VALUE,
  buildColorSystemStrategyRecommendation,
  colorSystemStrategyActualSystemHash,
} from './colorSystemStrategyReceipts';
import { RADIX_COLORS_VERSION, radixColors, type RadixScale } from './radixColors';
import { compareText, hexToOklch, hexToRgb, rgbToHex, rgbToOklab } from './utils';
import type {
  ColorSystemVisualizationSettings,
  ConfirmedColorSystemAnchor,
  SourceEvidenceLocator,
  SourceSystemSnapshot,
  VisualizationKind,
  VisualizationProposal,
} from '../types/colorSystemAudit';

export const COLOR_SYSTEM_STRATEGY_BUILDER_SCHEMA_VERSION = '1.0.0' as const;
export const COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION = 'teul-secondary-strategy-v1' as const;
export const COLOR_SYSTEM_STRATEGY_BUILDER_GAMUT_MAPPING = 'CSS Color 4 Local MINDE' as const;
export const COLOR_SYSTEM_STRATEGY_RECOMMENDATION_POLICY_VERSION =
  COLOR_SYSTEM_STRATEGY_RECOMMENDATION_POLICY_VERSION_VALUE;
export {
  buildColorSystemStrategyRecommendation,
  colorSystemStrategyActualSystemHash,
} from './colorSystemStrategyReceipts';

export type ColorSystemStrategyDirection = 'close-harmony' | 'balanced-contrast' | 'wide-spectrum';

export type ColorSystemStrategyMarkType = 'bar' | 'line' | 'area' | 'point' | 'region';
export type ColorSystemStrategyAdjacency = 'separated-marks' | 'touching-regions';

export interface ColorSystemStrategyVisualizationSettings extends ColorSystemVisualizationSettings {
  markType: ColorSystemStrategyMarkType;
  adjacency: ColorSystemStrategyAdjacency;
  divergingMidpoint: string;
  sequentialCount: number;
  divergingCount: number;
}

export interface ColorSystemStrategyPrimary {
  tokenId: string;
  name: string;
  mode: string;
  /** Canonical six-digit sRGB value. The builder never replaces this value. */
  hex: string;
}

export type ColorSystemStrategySourceReferenceSection = 'secondary' | 'data-visualization';

/**
 * One backend-derived, opaque chromatic source reference. These entries retain
 * native section order and identity; they are strategy evidence, not semantic
 * role claims.
 */
export interface ColorSystemStrategySourceReference {
  section: ColorSystemStrategySourceReferenceSection;
  sectionTitle: string;
  sourceNodeId: string;
  entryId: string;
  name: string;
  order: number;
  hex: string;
}

export interface ColorSystemStrategySourceReferences {
  secondary: readonly ColorSystemStrategySourceReference[];
  dataVisualization: readonly ColorSystemStrategySourceReference[];
}

export interface ColorSystemPrimaryLockEvidence {
  tokenId: string;
  name: string;
  path: readonly string[];
  mode: string;
  colorSpace: 'srgb';
  exactComponents: readonly [number, number, number];
  exactHex: string;
  alpha: 1;
  aliasTargetId?: string;
  sourceEvidence: readonly SourceEvidenceLocator[];
}

export type ColorSystemConfirmedPrimaryMismatchCode =
  | 'INVALID_CONFIRMATION'
  | 'TOKEN_NOT_FOUND'
  | 'MODE_NOT_FOUND'
  | 'UNSUPPORTED_VALUE'
  | 'HEX_MISMATCH';

export type ColorSystemConfirmedPrimaryResolution =
  | {
      status: 'ready';
      primary: ColorSystemStrategyPrimary;
      lock: ColorSystemPrimaryLockEvidence;
    }
  | {
      status: 'mismatch';
      code: ColorSystemConfirmedPrimaryMismatchCode;
      message: string;
    };

export interface ColorSystemStrategyBuilderInput {
  sourceHash: string;
  primary: ColorSystemStrategyPrimary;
  visualizationSettings: ColorSystemStrategyVisualizationSettings;
  /**
   * Backend-derived Secondary and Data Viz references used for seed tone,
   * chroma, source-territory gating, and lead-family ordering.
   */
  sourceReferences?: ColorSystemStrategySourceReferences;
  /**
   * Exact source colors retained for duplicate detection and downstream source
   * continuity verification. They do not steer seed tone, chroma, or ordering
   * when structured references are available.
   */
  existingSourceHexes?: readonly string[];
}

export interface ColorSystemHarmonyProvenance {
  kind: 'teul-harmony-generated';
  policyVersion: typeof COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION;
  scaleAlgorithmVersion: 'Teul OKLCH v3';
  gamutMapping: typeof COLOR_SYSTEM_STRATEGY_BUILDER_GAMUT_MAPPING;
  sourceTokenId: string;
  sourceMode: string;
  sourceHex: string;
  direction: ColorSystemStrategyDirection;
  familyIndex: 1 | 2;
  hueOffsetDegrees: number;
  seedHex: string;
  mode: 'light' | 'dark';
  step: number;
  gamutMapped: boolean;
  requestedOklch: { l: number; c: number; h: number };
  mappedOklch: { l: number; c: number; h: number };
}

export interface ColorSystemStrategyScaleStep {
  step: number;
  hex: string;
  provenance: ColorSystemHarmonyProvenance;
}

export interface ColorSystemStrategyScaleMode {
  mode: 'light' | 'dark';
  steps: readonly ColorSystemStrategyScaleStep[];
  validation: ColorScaleValidation;
}

export interface ColorSystemStrategySecondaryFamily {
  id: string;
  name: string;
  familyIndex: 1 | 2;
  hueOffsetDegrees: number;
  seedHex: string;
  modes: Readonly<Record<'light' | 'dark', ColorSystemStrategyScaleMode>>;
}

export type ColorSystemStrategyPaletteColorSource =
  | {
      kind: 'secondary-scale';
      familyIndex: 1 | 2;
      mode: 'light' | 'dark';
      step: number;
    }
  | {
      kind: 'primary-scale';
      mode: 'light' | 'dark';
      step: number;
      sourceTokenId: string;
    }
  | {
      kind: 'exact-radix-support';
      packageVersion: string;
      family: string;
      mode: 'light' | 'dark';
      step: number;
    };

export interface ColorSystemStrategyPaletteColor {
  hex: string;
  source: ColorSystemStrategyPaletteColorSource;
}

export interface ColorSystemStrategyVisualizationArtifact {
  id: VisualizationKind;
  kind: VisualizationKind;
  colors: readonly ColorSystemStrategyPaletteColor[];
  evaluation: VisualizationProposal;
}

export interface ColorSystemStrategyVisualizationPreview {
  settings: ColorSystemStrategyVisualizationSettings;
  categorical: ColorSystemStrategyVisualizationArtifact;
  sequential: ColorSystemStrategyVisualizationArtifact;
  diverging: ColorSystemStrategyVisualizationArtifact;
  searchEvidence: {
    categoricalCandidateCount: number;
    categoricalEvaluationCount: number;
    categoricalMaximumEvaluations: number;
    categoricalMaximumBeamWidth: number;
  };
}

/** Bounded raw search accounting. Counts are evidence, not quality scores. */
export interface ColorSystemStrategySearchEvidence {
  rawPoolCandidateCount: number;
  rawPoolMaximumCandidates: 648;
  uniquePoolCandidateCount: number;
  quantizationCollapseCount: number;
  sourceDuplicateRejectionCount: number;
  directionEligibleCandidateCount: number;
  prequalifiedFamilyCount: number;
  maximumPrequalifiedFamilies: 64;
  generatedScaleFamilyCount: number;
  invalidScaleRejectionCount: number;
  pairEvaluationCount: number;
  pairMaximumEvaluations: 25_000;
  pairFrontierCount: number;
  pairArtifactEvaluationCount: number;
  pairMaximumBeamWidth: 32;
  /** Total Data Viz palette evaluations consumed across every tried pair in this direction. */
  visualizationEvaluationCount: number;
  /** Hard per-direction ceiling shared by categorical, sequential, and diverging search. */
  visualizationMaximumEvaluations: 8_192;
}

/** Raw measurements only. These are not probabilities or universal quality scores. */
export interface ColorSystemStrategyMeasurements {
  sourceColorCount: number;
  referenceColorCount: number;
  generatedSeedDuplicateCount: number;
  meanNearestSourceDeltaEOK: number;
  maximumNearestReferenceDeltaEOK: number;
  sourceTerritoryThresholdDeltaEOK: number;
  meanPrimaryRelatednessDeltaEOK: number;
  minimumSetSeparationDeltaEOK: number;
  minimumCategoricalSeparationDeltaEOK: number;
  gamutMappedStepCount: number;
  gamutMappedStepRate: number;
  maximumStep9ModeDeltaEOK: number;
  functionalArtifactCoverage: number;
}

export interface ColorSystemStrategyCandidate {
  id: ColorSystemStrategyDirection;
  direction: ColorSystemStrategyDirection;
  label: string;
  rationale: string;
  primary: ColorSystemStrategyPrimary;
  secondaryFamilies: readonly [
    ColorSystemStrategySecondaryFamily,
    ColorSystemStrategySecondaryFamily,
  ];
  visualization: ColorSystemStrategyVisualizationPreview;
  searchEvidence: ColorSystemStrategySearchEvidence;
  measurements: ColorSystemStrategyMeasurements;
  evidence: {
    primaryPreserved: true;
    validLightAndDarkScales: true;
    visualizationSuitableForDeclaredContext: true;
    accessibilityBoundary: string;
    sourceTerritory: {
      status: 'passed' | 'not-assessed';
      method: 'ordered-source-sections' | 'legacy-source-colors';
      references: readonly ColorSystemStrategySourceReference[];
      secondaryReferenceCount: number;
      dataVisualizationReferenceCount: number;
      thresholdDeltaEOK: number;
      maximumNearestReferenceDeltaEOK: number;
      lightnessRange: readonly [number, number];
      chromaRange: readonly [number, number];
      leadReference: ColorSystemStrategySourceReference;
    };
  };
  warnings: readonly string[];
  /** Hash of rendered family values only; labels and direction provenance are excluded. */
  actualSystemHash: string;
  modelHash: string;
  candidateHash: string;
}

export interface ColorSystemStrategyRecommendationRank {
  candidateId: ColorSystemStrategyDirection;
  sourceContinuityRank: number;
  categoricalSeparationRank: number;
  gamutRetentionRank: number;
  setSeparationRank: number;
  functionalCoverageRank: number;
  ordinalRankSum: number;
  aggregateRank: number;
  tieBreakHash: string;
}

export interface ColorSystemStrategyRecommendation {
  policyVersion: typeof COLOR_SYSTEM_STRATEGY_RECOMMENDATION_POLICY_VERSION;
  recommendedCandidateId: ColorSystemStrategyDirection;
  ranking: readonly ColorSystemStrategyRecommendationRank[];
  statement: string;
}

export interface ColorSystemStrategySet {
  schemaVersion: typeof COLOR_SYSTEM_STRATEGY_BUILDER_SCHEMA_VERSION;
  policyVersion: typeof COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION;
  sourceHash: string;
  briefHash: string;
  strategySetHash: string;
  primary: ColorSystemStrategyPrimary;
  visualizationSettings: ColorSystemStrategyVisualizationSettings;
  recommendation: ColorSystemStrategyRecommendation;
  /** One to three honest, non-duplicate directions. */
  candidates: readonly ColorSystemStrategyCandidate[];
  /** Non-blocking direction failures and duplicate-collapse disclosures. */
  blockers: readonly ColorSystemStrategyBuilderBlocker[];
}

export type ColorSystemStrategyBuilderBlockerCode =
  | 'INVALID_SOURCE_HASH'
  | 'INVALID_PRIMARY'
  | 'UNSUPPORTED_VISUALIZATION_CONTEXT'
  | 'PRIMARY_HUE_UNSTABLE'
  | 'SOURCE_REFERENCE_TERRITORY_UNAVAILABLE'
  | 'SOURCE_TERRITORY_MISMATCH'
  | 'NO_DISTINCT_SECONDARY_STRATEGY'
  | 'INVALID_GENERATED_SCALE'
  | 'NO_SUITABLE_CATEGORICAL_PALETTE'
  | 'NO_SUITABLE_SEQUENTIAL_PALETTE'
  | 'NO_SUITABLE_DIVERGING_PALETTE'
  | 'VISUALIZATION_EVALUATION_LIMIT_REACHED'
  | 'INCOMPLETE_STRATEGY_SET'
  | 'DUPLICATE_STRATEGY_COLLAPSED';

export interface ColorSystemStrategyBuilderBlocker {
  code: ColorSystemStrategyBuilderBlockerCode;
  message: string;
  direction?: ColorSystemStrategyDirection;
  duplicateOfDirection?: ColorSystemStrategyDirection;
  searchEvidence?: ColorSystemStrategySearchEvidence;
  alternatives: readonly string[];
}

export type ColorSystemStrategyBuilderResult =
  | { status: 'ready'; strategySet: ColorSystemStrategySet }
  | {
      status: 'no-solution';
      sourceHash: string;
      blockers: readonly ColorSystemStrategyBuilderBlocker[];
    };

interface StrategyRecipe {
  id: ColorSystemStrategyDirection;
  label: string;
  rationale: string;
  targetAbsoluteOffsetDegrees: number;
  minimumAbsoluteOffsetDegrees: number;
  maximumAbsoluteOffsetDegrees: number;
}

interface RawSecondaryKey {
  requestedOklch: { l: number; c: number; h: number };
  mappedOklch: { l: number; c: number; h: number };
  maximumInGamutChroma: number;
  sourceChromaTarget: number;
  hueOffsetDegrees: number;
  seedHex: string;
  seedHash: string;
  nearestSourceDeltaEOK: number;
  primaryDeltaEOK: number;
}

interface CanonicalPool {
  rawPoolCandidateCount: number;
  uniqueKeys: readonly RawSecondaryKey[];
  quantizationCollapseCount: number;
  sourceDuplicateRejectionCount: number;
}

interface SourceTerritoryProfile {
  method: 'ordered-source-sections' | 'legacy-source-colors';
  references: readonly ColorSystemStrategySourceReference[];
  referenceHexes: readonly string[];
  secondaryReferenceCount: number;
  dataVisualizationReferenceCount: number;
  lightnessAnchors: readonly [number, number, number];
  chromaAnchors: readonly [number, number, number];
  lightnessRange: readonly [number, number];
  chromaRange: readonly [number, number];
  leadReference: ColorSystemStrategySourceReference;
}

interface PrequalifiedFamily {
  key: RawSecondaryKey;
  family: ColorSystemStrategySecondaryFamily;
  gamutMappedStepRate: number;
}

interface StrategyPairState {
  first: PrequalifiedFamily;
  second: PrequalifiedFamily;
  targetDeviation: number;
  meanNearestSourceDeltaEOK: number;
  meanPrimaryDeltaEOK: number;
  minimumSetSeparationDeltaEOK: number;
  minimumFamilySeparationDeltaEOK: number;
  maximumNearestReferenceDeltaEOK: number;
  gamutRetention: number;
  weakestPercentile: number;
  pairHash: string;
}

interface PaletteCandidate extends ColorSystemStrategyPaletteColor {
  key: string;
  requiredFamily?: 1 | 2;
}

interface CategoricalState {
  indices: readonly number[];
  score: number;
}

interface CategoricalSearchResult {
  colors?: readonly ColorSystemStrategyPaletteColor[];
  evaluation?: VisualizationProposal;
  candidateCount: number;
  evaluationCount: number;
}

interface VisualizationEvaluationBudget {
  count: number;
  readonly maximum: 8_192;
}

interface CandidateBuildResult {
  candidate?: Omit<ColorSystemStrategyCandidate, 'modelHash' | 'candidateHash'>;
  blockers: ColorSystemStrategyBuilderBlocker[];
}

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const MINIMUM_PRIMARY_CHROMA = 0.035;
const MINIMUM_REFERENCE_CHROMA = 0.035;
const MINIMUM_DISTINCT_DELTA_E_OK = 0.035;
/** Teul policy tolerance in OKLab distance; it is a gate, not a quality score. */
export const COLOR_SYSTEM_STRATEGY_SOURCE_TERRITORY_THRESHOLD_DELTA_E_OK = 0.22 as const;
const MAXIMUM_CATEGORICAL_CANDIDATES = 18;
const MAXIMUM_CATEGORICAL_BEAM_WIDTH = 64;
const MAXIMUM_CATEGORICAL_EVALUATIONS = 8_192;
const MAXIMUM_VISUALIZATION_EVALUATIONS = 8_192 as const;
const RAW_HUE_INCREMENT_DEGREES = 5;
const MAXIMUM_RAW_POOL_CANDIDATES = 648 as const;
const MAXIMUM_PREQUALIFIED_FAMILIES = 64 as const;
const MAXIMUM_STRATEGY_PAIR_BEAM_WIDTH = 32 as const;
const MAXIMUM_STRATEGY_PAIR_EVALUATIONS = 25_000 as const;
const SCALE_STEPS = Array.from({ length: 12 }, (_, index) => index + 1);

const STRATEGY_RECIPES: readonly StrategyRecipe[] = [
  {
    id: 'close-harmony',
    label: 'Close harmony',
    rationale:
      'Stays closest to the current brand feel. Tradeoff: the quieter range provides less visual separation between families.',
    targetAbsoluteOffsetDegrees: 40,
    minimumAbsoluteOffsetDegrees: 15,
    maximumAbsoluteOffsetDegrees: 75,
  },
  {
    id: 'balanced-contrast',
    label: 'Balanced contrast',
    rationale:
      'Balances brand familiarity with clearer separation for product and information design. Tradeoff: it is less restrained than Close harmony and less expressive than Wide spectrum.',
    targetAbsoluteOffsetDegrees: 145,
    minimumAbsoluteOffsetDegrees: 105,
    maximumAbsoluteOffsetDegrees: 180,
  },
  {
    id: 'wide-spectrum',
    label: 'Wide spectrum',
    rationale:
      'Creates the broadest expressive range for graphics and information design. Tradeoff: it moves furthest from the current brand feel and needs the most review.',
    targetAbsoluteOffsetDegrees: 120,
    minimumAbsoluteOffsetDegrees: 75,
    maximumAbsoluteOffsetDegrees: 155,
  },
] as const;

function normalizeHex(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r, g, b).toLowerCase();
}

/**
 * Resolves an explicit user confirmation against one exact source token value.
 * A missing token, alternate mode, or merely similar hex is a mismatch; this
 * helper never selects a fallback Primary.
 */
export function resolveConfirmedColorSystemPrimary(
  snapshot: SourceSystemSnapshot,
  confirmed: ConfirmedColorSystemAnchor
): ColorSystemConfirmedPrimaryResolution {
  if (!confirmed.tokenId.trim() || !confirmed.mode.trim() || !HEX_PATTERN.test(confirmed.hex)) {
    return {
      status: 'mismatch',
      code: 'INVALID_CONFIRMATION',
      message: 'Confirmed Primary must include an exact token, mode, and six-digit sRGB hex.',
    };
  }
  const token = snapshot.tokens.find(candidate => candidate.id === confirmed.tokenId);
  if (!token) {
    return {
      status: 'mismatch',
      code: 'TOKEN_NOT_FOUND',
      message: `Confirmed Primary token ${confirmed.tokenId} is not present in the audited source.`,
    };
  }
  const value = token.valuesByMode[confirmed.mode];
  if (!value) {
    return {
      status: 'mismatch',
      code: 'MODE_NOT_FOUND',
      message: `Confirmed Primary mode ${confirmed.mode} is not present on ${confirmed.tokenId}.`,
    };
  }
  if (
    value.colorSpace !== 'srgb' ||
    value.alpha !== 1 ||
    !value.hex ||
    !HEX_PATTERN.test(value.hex)
  ) {
    return {
      status: 'mismatch',
      code: 'UNSUPPORTED_VALUE',
      message: `Confirmed Primary ${confirmed.tokenId} in ${confirmed.mode} is not an opaque six-digit sRGB value.`,
    };
  }
  const exactHex = normalizeHex(value.hex);
  if (normalizeHex(confirmed.hex) !== exactHex) {
    return {
      status: 'mismatch',
      code: 'HEX_MISMATCH',
      message: `Confirmed Primary ${confirmed.tokenId} in ${confirmed.mode} no longer matches ${normalizeHex(confirmed.hex)}.`,
    };
  }
  const aliasTargetId = token.aliasTargetsByMode?.[confirmed.mode] ?? token.aliasTargetId;
  return {
    status: 'ready',
    primary: {
      tokenId: token.id,
      name: token.name,
      mode: confirmed.mode,
      hex: exactHex,
    },
    lock: {
      tokenId: token.id,
      name: token.name,
      path: [...token.path],
      mode: confirmed.mode,
      colorSpace: 'srgb',
      exactComponents: [...value.components],
      exactHex,
      alpha: 1,
      ...(aliasTargetId ? { aliasTargetId } : {}),
      sourceEvidence: [...token.evidence],
    },
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function deltaEOK(firstHex: string, secondHex: string): number {
  const first = hexToRgb(firstHex);
  const second = hexToRgb(secondHex);
  const firstLab = rgbToOklab(first.r, first.g, first.b);
  const secondLab = rgbToOklab(second.r, second.g, second.b);
  return Math.hypot(firstLab.L - secondLab.L, firstLab.a - secondLab.a, firstLab.b - secondLab.b);
}

function roundedMeasurement(value: number): number {
  return Number(value.toFixed(6));
}

function quantile(sortedValues: readonly number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const position = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function threeQuantileAnchors(values: readonly number[]): readonly [number, number, number] {
  const sorted = [...values].sort((first, second) => first - second);
  return [quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75)];
}

function canonicalSourceReference(
  reference: ColorSystemStrategySourceReference
): ColorSystemStrategySourceReference {
  return {
    section: reference.section,
    sectionTitle: reference.sectionTitle.trim(),
    sourceNodeId: reference.sourceNodeId.trim(),
    entryId: reference.entryId.trim(),
    name: reference.name.trim(),
    order: reference.order,
    hex: normalizeHex(reference.hex),
  };
}

function compareSourceReferences(
  first: ColorSystemStrategySourceReference,
  second: ColorSystemStrategySourceReference
): number {
  const sectionDelta =
    Number(first.section === 'data-visualization') -
    Number(second.section === 'data-visualization');
  return (
    sectionDelta ||
    first.order - second.order ||
    compareText(first.entryId, second.entryId) ||
    compareText(first.hex, second.hex)
  );
}

function sourceTerritoryProfile(
  input: ColorSystemStrategyBuilderInput,
  primary: ColorSystemStrategyPrimary,
  existingHexes: ReadonlySet<string>
): SourceTerritoryProfile {
  const structured = input.sourceReferences
    ? [
        ...input.sourceReferences.secondary.map(canonicalSourceReference),
        ...input.sourceReferences.dataVisualization.map(canonicalSourceReference),
      ].sort(compareSourceReferences)
    : [];
  const legacyHexes = [...existingHexes]
    .filter(hex => hexToOklch(hex).c >= MINIMUM_REFERENCE_CHROMA)
    .sort(compareText);
  const references =
    structured.length > 0
      ? structured
      : (legacyHexes.length > 0 ? legacyHexes : [primary.hex]).map((hex, index) => ({
          section: 'secondary' as const,
          sectionTitle: 'Legacy eligible source colors',
          sourceNodeId: 'legacy-source-colors',
          entryId: `legacy-source-color-${index + 1}`,
          name: `Eligible source color ${index + 1}`,
          order: index + 1,
          hex,
        }));
  const referenceHexes = [...new Set(references.map(reference => reference.hex))];
  const oklch = referenceHexes.map(hex => hexToOklch(hex));
  const lightnessValues = oklch.map(value => value.l);
  const chromaValues = oklch.map(value => value.c);
  const primaryOklch = hexToOklch(primary.hex);
  const structuredMethod = structured.length > 0;
  const leadReference =
    references.find(reference => reference.section === 'data-visualization') ?? references[0];
  return {
    method: structuredMethod ? 'ordered-source-sections' : 'legacy-source-colors',
    references,
    referenceHexes,
    secondaryReferenceCount: references.filter(reference => reference.section === 'secondary')
      .length,
    dataVisualizationReferenceCount: references.filter(
      reference => reference.section === 'data-visualization'
    ).length,
    lightnessAnchors: structuredMethod
      ? threeQuantileAnchors(lightnessValues)
      : [
          clamp(primaryOklch.l - 0.06, 0.02, 0.98),
          clamp(primaryOklch.l, 0.02, 0.98),
          clamp(primaryOklch.l + 0.06, 0.02, 0.98),
        ],
    chromaAnchors: structuredMethod ? threeQuantileAnchors(chromaValues) : [0.45, 0.65, 0.85],
    lightnessRange: [Math.min(...lightnessValues), Math.max(...lightnessValues)],
    chromaRange: [Math.min(...chromaValues), Math.max(...chromaValues)],
    leadReference,
  };
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function minimumPairSeparation(colors: readonly string[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let first = 0; first < colors.length; first += 1) {
    for (let second = first + 1; second < colors.length; second += 1) {
      minimum = Math.min(minimum, deltaEOK(colors[first], colors[second]));
    }
  }
  return Number.isFinite(minimum) ? minimum : 0;
}

function measureCandidate(
  primary: ColorSystemStrategyPrimary,
  families: readonly [ColorSystemStrategySecondaryFamily, ColorSystemStrategySecondaryFamily],
  categorical: VisualizationProposal,
  sequential: VisualizationProposal,
  diverging: VisualizationProposal,
  existingHexes: ReadonlySet<string>,
  referenceHexes: readonly string[]
): ColorSystemStrategyMeasurements {
  const sourceColors = [...new Set([primary.hex, ...existingHexes])].sort(compareText);
  const referenceColors = [...new Set(referenceHexes.map(normalizeHex))].sort(compareText);
  const seeds = families.map(family => normalizeHex(family.seedHex));
  const nearestReferenceDistances = seeds.map(seed =>
    Math.min(...referenceColors.map(reference => deltaEOK(seed, reference)))
  );
  const primaryDistances = seeds.map(seed => deltaEOK(primary.hex, seed));
  const mappedSteps = families.flatMap(family =>
    (['light', 'dark'] as const).flatMap(mode =>
      family.modes[mode].steps.filter(step => step.provenance.gamutMapped)
    )
  ).length;
  const totalSteps = families.length * 2 * 12;
  const stepNineModeDifferences = families.map(family =>
    deltaEOK(family.modes.light.steps[8].hex, family.modes.dark.steps[8].hex)
  );
  const categoricalSeparations = categorical.separationEvidence.map(
    evidence => evidence.minimumDeltaEOK
  );
  const suitableArtifacts = [categorical, sequential, diverging].filter(
    artifact => artifact.status === 'suitable-candidate'
  ).length;
  return {
    sourceColorCount: sourceColors.length,
    referenceColorCount: referenceColors.length,
    generatedSeedDuplicateCount: seeds.filter(seed => sourceColors.includes(seed)).length,
    meanNearestSourceDeltaEOK: roundedMeasurement(mean(nearestReferenceDistances)),
    maximumNearestReferenceDeltaEOK: roundedMeasurement(Math.max(...nearestReferenceDistances)),
    sourceTerritoryThresholdDeltaEOK: COLOR_SYSTEM_STRATEGY_SOURCE_TERRITORY_THRESHOLD_DELTA_E_OK,
    meanPrimaryRelatednessDeltaEOK: roundedMeasurement(mean(primaryDistances)),
    minimumSetSeparationDeltaEOK: roundedMeasurement(
      minimumPairSeparation([primary.hex, ...seeds])
    ),
    minimumCategoricalSeparationDeltaEOK: roundedMeasurement(
      categoricalSeparations.length > 0 ? Math.min(...categoricalSeparations) : 0
    ),
    gamutMappedStepCount: mappedSteps,
    gamutMappedStepRate: roundedMeasurement(mappedSteps / totalSteps),
    maximumStep9ModeDeltaEOK: roundedMeasurement(Math.max(...stepNineModeDifferences)),
    functionalArtifactCoverage: roundedMeasurement(suitableArtifacts / 3),
  };
}

export function measureColorSystemStrategyCandidate(
  candidate: Pick<
    ColorSystemStrategyCandidate,
    'primary' | 'secondaryFamilies' | 'visualization' | 'evidence'
  >,
  existingSourceHexes: readonly string[]
): ColorSystemStrategyMeasurements {
  if (existingSourceHexes.some(hex => !HEX_PATTERN.test(hex))) {
    throw new Error('Source-continuity measurements require six-digit sRGB colors.');
  }
  return measureCandidate(
    candidate.primary,
    candidate.secondaryFamilies,
    candidate.visualization.categorical.evaluation,
    candidate.visualization.sequential.evaluation,
    candidate.visualization.diverging.evaluation,
    new Set(existingSourceHexes.map(normalizeHex).filter(hex => hex !== candidate.primary.hex)),
    candidate.evidence.sourceTerritory.references.map(reference => reference.hex)
  );
}

function blocker(
  code: ColorSystemStrategyBuilderBlockerCode,
  message: string,
  alternatives: readonly string[],
  direction?: ColorSystemStrategyDirection,
  searchEvidence?: ColorSystemStrategySearchEvidence,
  duplicateOfDirection?: ColorSystemStrategyDirection
): ColorSystemStrategyBuilderBlocker {
  return {
    code,
    message,
    ...(direction ? { direction } : {}),
    ...(searchEvidence ? { searchEvidence } : {}),
    ...(duplicateOfDirection ? { duplicateOfDirection } : {}),
    alternatives,
  };
}

function canonicalPrimary(primary: ColorSystemStrategyPrimary): ColorSystemStrategyPrimary {
  return {
    tokenId: primary.tokenId.trim(),
    name: primary.name.trim(),
    mode: primary.mode.trim(),
    hex: normalizeHex(primary.hex),
  };
}

function canonicalSettings(
  settings: ColorSystemStrategyVisualizationSettings
): ColorSystemStrategyVisualizationSettings {
  return {
    mode: settings.mode,
    surfaceHex: normalizeHex(settings.surfaceHex),
    ...(settings.adjacency === 'touching-regions' && settings.boundaryHex
      ? { boundaryHex: normalizeHex(settings.boundaryHex) }
      : {}),
    chartType: settings.chartType.trim(),
    categoryCount: settings.categoryCount,
    nonColorCue: settings.nonColorCue.trim(),
    markType: settings.markType,
    adjacency: settings.adjacency,
    divergingMidpoint: settings.divergingMidpoint.trim(),
    sequentialCount: settings.sequentialCount,
    divergingCount: settings.divergingCount,
  };
}

function validateInput(
  input: ColorSystemStrategyBuilderInput
): ColorSystemStrategyBuilderBlocker[] {
  const blockers: ColorSystemStrategyBuilderBlocker[] = [];
  if (!HASH_PATTERN.test(input.sourceHash)) {
    blockers.push(
      blocker(
        'INVALID_SOURCE_HASH',
        'Strategy generation requires a canonical SHA-256 source hash.',
        ['Analyze the source again.', 'Use the backend-owned source snapshot.']
      )
    );
  }
  if (
    !input.primary.tokenId.trim() ||
    !input.primary.name.trim() ||
    !input.primary.mode.trim() ||
    !HEX_PATTERN.test(input.primary.hex)
  ) {
    blockers.push(
      blocker(
        'INVALID_PRIMARY',
        'Primary must identify one exact opaque six-digit sRGB source value.',
        ['Choose an exact source Primary.', 'Analyze an opaque sRGB palette.']
      )
    );
  }
  const settings = input.visualizationSettings;
  const normalizedBoundary = settings.boundaryHex?.trim().toLowerCase();
  const boundaryIsBlackOrWhite =
    normalizedBoundary === '#000000' || normalizedBoundary === '#ffffff';
  if (
    (settings.mode !== 'light' && settings.mode !== 'dark') ||
    !HEX_PATTERN.test(settings.surfaceHex) ||
    (settings.boundaryHex !== undefined && !HEX_PATTERN.test(settings.boundaryHex)) ||
    !settings.chartType.trim() ||
    !settings.nonColorCue.trim() ||
    !['bar', 'line', 'area', 'point', 'region'].includes(settings.markType) ||
    !['separated-marks', 'touching-regions'].includes(settings.adjacency) ||
    (settings.adjacency === 'separated-marks' && settings.boundaryHex !== undefined) ||
    (settings.adjacency === 'touching-regions' && !boundaryIsBlackOrWhite) ||
    !settings.divergingMidpoint.trim() ||
    !Number.isInteger(settings.sequentialCount) ||
    settings.sequentialCount < 3 ||
    settings.sequentialCount > 9 ||
    !Number.isInteger(settings.divergingCount) ||
    settings.divergingCount < 3 ||
    settings.divergingCount > 9 ||
    settings.divergingCount % 2 === 0 ||
    !Number.isInteger(settings.categoryCount) ||
    settings.categoryCount < 2 ||
    settings.categoryCount > 8
  ) {
    blockers.push(
      blocker(
        'UNSUPPORTED_VISUALIZATION_CONTEXT',
        'Data visualization requires mode, surface, mark type, adjacency, a meaningful diverging midpoint, 2-8 categories, and a non-color cue. Separated marks must omit a boundary; touching regions require an explicit black or white boundary.',
        [
          'Provide a complete chart context.',
          'Use labels and shapes in addition to color.',
          'Use black or white only when touching regions require a boundary.',
        ]
      )
    );
  }
  if ((input.existingSourceHexes ?? []).some(hex => !HEX_PATTERN.test(hex))) {
    blockers.push(
      blocker('INVALID_PRIMARY', 'Existing source colors must be six-digit sRGB values.', [
        'Remove unsupported colors from the generation request.',
        'Keep wide-gamut or contextual colors inventory-only.',
      ])
    );
  }
  if (input.sourceReferences) {
    const grouped = [
      ['secondary', input.sourceReferences.secondary] as const,
      ['data-visualization', input.sourceReferences.dataVisualization] as const,
    ];
    const references = grouped.flatMap(([, entries]) => entries);
    const invalidReference = grouped.some(([section, entries]) => {
      const orders = new Set<number>();
      const ids = new Set<string>();
      return entries.some(reference => {
        const invalid =
          reference.section !== section ||
          !reference.sectionTitle.trim() ||
          !reference.sourceNodeId.trim() ||
          !reference.entryId.trim() ||
          !reference.name.trim() ||
          !Number.isInteger(reference.order) ||
          reference.order < 1 ||
          !HEX_PATTERN.test(reference.hex) ||
          hexToOklch(reference.hex).c < MINIMUM_REFERENCE_CHROMA ||
          orders.has(reference.order) ||
          ids.has(reference.entryId);
        orders.add(reference.order);
        ids.add(reference.entryId);
        return invalid;
      });
    });
    if (references.length === 0 || invalidReference) {
      blockers.push(
        blocker(
          'SOURCE_REFERENCE_TERRITORY_UNAVAILABLE',
          'Structured strategy references must contain ordered, opaque chromatic Secondary or Data Viz source entries.',
          [
            'Re-analyze the named source frames.',
            'Keep alpha, neutral, and explicit light-companion entries as inventory evidence only.',
          ]
        )
      );
    }
  }
  return blockers;
}

function signedHueOffset(sourceHue: number, candidateHue: number): number {
  const offset = ((candidateHue - sourceHue + 540) % 360) - 180;
  return offset === -180 ? 180 : offset;
}

function hueDistanceDegrees(firstHex: string, secondHex: string): number {
  const firstHue = hexToOklch(firstHex).h;
  const secondHue = hexToOklch(secondHex).h;
  const distance = Math.abs(firstHue - secondHue) % 360;
  return Math.min(distance, 360 - distance);
}

function maximumInGamutChroma(lightness: number, hue: number): number {
  let minimum = 0;
  let maximum = 0.4;
  while (maximum < 1 && isOklchInSrgbGamut({ l: lightness, c: maximum, h: hue })) {
    minimum = maximum;
    maximum = Math.min(1, maximum * 2);
  }
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const candidate = (minimum + maximum) / 2;
    if (isOklchInSrgbGamut({ l: lightness, c: candidate, h: hue })) minimum = candidate;
    else maximum = candidate;
  }
  return minimum;
}

function canonicalPool(
  primary: ColorSystemStrategyPrimary,
  existingHexes: ReadonlySet<string>,
  territory: SourceTerritoryProfile
): CanonicalPool {
  const primaryOklch = hexToOklch(primary.hex);
  const sourceColors = [...new Set([primary.hex, ...existingHexes])].sort(compareText);
  const byHex = new Map<string, RawSecondaryKey>();
  let rawPoolCandidateCount = 0;
  let sourceDuplicateRejectionCount = 0;
  for (let hue = 0; hue < 360; hue += RAW_HUE_INCREMENT_DEGREES) {
    for (const sourceLightness of territory.lightnessAnchors) {
      const lightness = clamp(sourceLightness, 0.02, 0.98);
      const maximumChroma = maximumInGamutChroma(lightness, hue);
      for (const sourceChromaTarget of territory.chromaAnchors) {
        rawPoolCandidateCount += 1;
        const requestedOklch = {
          l: lightness,
          c:
            territory.method === 'ordered-source-sections'
              ? Math.min(sourceChromaTarget, maximumChroma * 0.98)
              : maximumChroma * sourceChromaTarget,
          h: hue,
        };
        const mapped = mapOklchToSrgb(requestedOklch);
        const seedHex = normalizeHex(mapped.hex);
        if (sourceColors.includes(seedHex)) {
          sourceDuplicateRejectionCount += 1;
          continue;
        }
        const key: RawSecondaryKey = {
          requestedOklch,
          mappedOklch: { ...mapped.oklch },
          maximumInGamutChroma: maximumChroma,
          sourceChromaTarget,
          hueOffsetDegrees: signedHueOffset(primaryOklch.h, hue),
          seedHex,
          seedHash: deterministicContentHash({
            requestedOklch,
            mappedOklch: mapped.oklch,
            seedHex,
          }),
          nearestSourceDeltaEOK: Math.min(
            ...territory.referenceHexes.map(reference => deltaEOK(seedHex, reference))
          ),
          primaryDeltaEOK: deltaEOK(primary.hex, seedHex),
        };
        const current = byHex.get(seedHex);
        if (!current || compareText(key.seedHash, current.seedHash) < 0) byHex.set(seedHex, key);
      }
    }
  }
  if (rawPoolCandidateCount > MAXIMUM_RAW_POOL_CANDIDATES) {
    throw new Error('The bounded Secondary key pool exceeded its declared cap.');
  }
  const uniqueKeys = [...byHex.values()].sort((first, second) =>
    compareText(first.seedHash, second.seedHash)
  );
  return {
    rawPoolCandidateCount,
    uniqueKeys,
    quantizationCollapseCount:
      rawPoolCandidateCount - sourceDuplicateRejectionCount - uniqueKeys.length,
    sourceDuplicateRejectionCount,
  };
}

function createScaleFamily(
  primary: ColorSystemStrategyPrimary,
  direction: ColorSystemStrategyDirection,
  familyIndex: 1 | 2,
  key: RawSecondaryKey
): ColorSystemStrategySecondaryFamily | null {
  const mapped = mapOklchToSrgb(key.requestedOklch);
  if (
    mapped.hex !== key.seedHex ||
    deterministicContentHash(mapped.oklch) !== deterministicContentHash(key.mappedOklch)
  ) {
    return null;
  }
  const name = `${STRATEGY_RECIPES.find(recipe => recipe.id === direction)?.label ?? direction} ${familyIndex}`;
  const light = generateColorScale(mapped.hex, 'light', name);
  const dark = generateColorScale(mapped.hex, 'dark', name);
  if (!light.validation.valid || !dark.validation.valid) return null;

  const toMode = (mode: 'light' | 'dark', scale: typeof light): ColorSystemStrategyScaleMode => ({
    mode,
    validation: scale.validation,
    steps: scale.steps.map(step => ({
      step: step.step,
      hex: step.hex,
      provenance: {
        kind: 'teul-harmony-generated',
        policyVersion: COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION,
        scaleAlgorithmVersion: 'Teul OKLCH v3',
        gamutMapping: COLOR_SYSTEM_STRATEGY_BUILDER_GAMUT_MAPPING,
        sourceTokenId: primary.tokenId,
        sourceMode: primary.mode,
        sourceHex: primary.hex,
        direction,
        familyIndex,
        hueOffsetDegrees: key.hueOffsetDegrees,
        seedHex: mapped.hex,
        mode,
        step: step.step,
        gamutMapped: step.gamutMapped,
        requestedOklch: { ...step.requestedOklch },
        mappedOklch: { ...step.mappedOklch },
      },
    })),
  });

  return {
    id: `${direction}.secondary-${familyIndex}`,
    name,
    familyIndex,
    hueOffsetDegrees: key.hueOffsetDegrees,
    seedHex: mapped.hex,
    modes: { light: toMode('light', light), dark: toMode('dark', dark) },
  };
}

function sourceForSecondary(
  familyIndex: 1 | 2,
  mode: 'light' | 'dark',
  step: number
): ColorSystemStrategyPaletteColorSource {
  return { kind: 'secondary-scale', familyIndex, mode, step };
}

function secondaryColor(
  family: ColorSystemStrategySecondaryFamily,
  mode: 'light' | 'dark',
  step: number
): PaletteCandidate {
  const value = family.modes[mode].steps[step - 1];
  return {
    key: `secondary-${family.familyIndex}-${mode}-${step}`,
    hex: value.hex,
    source: sourceForSecondary(family.familyIndex, mode, step),
    requiredFamily: family.familyIndex,
  };
}

function exactRadixColor(
  family: keyof typeof radixColors,
  mode: 'light' | 'dark',
  step: number
): PaletteCandidate {
  return {
    key: `radix-${family}-${mode}-${step}`,
    hex: radixColors[family][mode][step as keyof RadixScale],
    source: {
      kind: 'exact-radix-support',
      packageVersion: RADIX_COLORS_VERSION,
      family,
      mode,
      step,
    },
  };
}

function publicPaletteColor(candidate: PaletteCandidate): ColorSystemStrategyPaletteColor {
  return { hex: candidate.hex, source: candidate.source };
}

function primaryScaleColors(
  primary: ColorSystemStrategyPrimary,
  mode: 'light' | 'dark'
): PaletteCandidate[] {
  const scale = generateColorScale(primary.hex, mode, primary.name);
  if (!scale.validation.valid) return [];
  return [12, 10, 8].map(step => ({
    key: `primary-${mode}-${step}`,
    hex: scale.steps[step - 1].hex,
    source: {
      kind: 'primary-scale' as const,
      mode,
      step,
      sourceTokenId: primary.tokenId,
    },
  }));
}

function deduplicatePaletteCandidates(candidates: readonly PaletteCandidate[]): PaletteCandidate[] {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const hex = normalizeHex(candidate.hex);
    if (seen.has(hex)) return false;
    seen.add(hex);
    return true;
  });
}

function categoricalScore(evaluation: VisualizationProposal): number {
  return evaluation.separationEvidence.length === 0
    ? 0
    : Math.min(...evaluation.separationEvidence.map(evidence => evidence.minimumDeltaEOK));
}

function compareCategoricalStates(
  candidates: readonly PaletteCandidate[],
  first: CategoricalState,
  second: CategoricalState
): number {
  if (first.score !== second.score) return second.score - first.score;
  const firstKey = first.indices.map(index => candidates[index].key).join('\u0000');
  const secondKey = second.indices.map(index => candidates[index].key).join('\u0000');
  return compareText(firstKey, secondKey);
}

function includesBothSecondaryFamilies(
  candidates: readonly PaletteCandidate[],
  indices: readonly number[]
): boolean {
  const present = new Set(indices.map(index => candidates[index].requiredFamily));
  return present.has(1) && present.has(2);
}

function consumeVisualizationEvaluation(budget: VisualizationEvaluationBudget): boolean {
  if (budget.count >= budget.maximum) return false;
  budget.count += 1;
  return true;
}

function searchCategoricalPalette(
  primary: ColorSystemStrategyPrimary,
  families: readonly [ColorSystemStrategySecondaryFamily, ColorSystemStrategySecondaryFamily],
  settings: ColorSystemStrategyVisualizationSettings,
  budget: VisualizationEvaluationBudget
): CategoricalSearchResult {
  const mode = settings.mode;
  const familySteps = [12, 10, 8, 9, 7];
  const supportFamilies = ['blue', 'red', 'green', 'purple', 'orange', 'cyan'] as const;
  const candidates = deduplicatePaletteCandidates([
    ...familySteps.map(step => secondaryColor(families[0], mode, step)),
    ...familySteps.map(step => secondaryColor(families[1], mode, step)),
    ...primaryScaleColors(primary, mode),
    ...supportFamilies.map(family => exactRadixColor(family, mode, 12)),
  ]).slice(0, MAXIMUM_CATEGORICAL_CANDIDATES);
  if (settings.categoryCount > candidates.length) {
    return { candidateCount: candidates.length, evaluationCount: 0 };
  }

  const startingEvaluationCount = budget.count;
  let states: CategoricalState[] = candidates.map((_, index) => ({
    indices: [index],
    score: Number.POSITIVE_INFINITY,
  }));
  for (let size = 2; size <= settings.categoryCount; size += 1) {
    const next: CategoricalState[] = [];
    search: for (const state of states) {
      const last = state.indices[state.indices.length - 1];
      for (let index = last + 1; index < candidates.length; index += 1) {
        if (!consumeVisualizationEvaluation(budget)) break search;
        const indices = [...state.indices, index];
        const colors = indices.map(candidateIndex => candidates[candidateIndex].hex);
        const evaluation = evaluateVisualizationPalette({
          id: 'categorical',
          kind: 'categorical',
          mode,
          colors,
          surfaceHex: settings.surfaceHex,
          ...(settings.boundaryHex ? { boundaryHex: settings.boundaryHex } : {}),
          adjacency: settings.adjacency,
          chartType: settings.chartType,
          categoryCount: colors.length,
          nonColorCue: settings.nonColorCue,
        });
        if (evaluation.status === 'suitable-candidate') {
          next.push({ indices, score: categoricalScore(evaluation) });
        }
      }
    }
    states = next
      .sort((first, second) => compareCategoricalStates(candidates, first, second))
      .slice(0, MAXIMUM_CATEGORICAL_BEAM_WIDTH);
    if (states.length === 0) {
      return {
        candidateCount: candidates.length,
        evaluationCount: budget.count - startingEvaluationCount,
      };
    }
  }

  const selected = states.find(state => includesBothSecondaryFamilies(candidates, state.indices));
  if (!selected) {
    return {
      candidateCount: candidates.length,
      evaluationCount: budget.count - startingEvaluationCount,
    };
  }
  const colors = selected.indices.map(index => publicPaletteColor(candidates[index]));
  if (!consumeVisualizationEvaluation(budget)) {
    return {
      candidateCount: candidates.length,
      evaluationCount: budget.count - startingEvaluationCount,
    };
  }
  const evaluation = evaluateVisualizationPalette({
    id: 'categorical',
    kind: 'categorical',
    mode,
    colors: colors.map(color => color.hex),
    surfaceHex: settings.surfaceHex,
    ...(settings.boundaryHex ? { boundaryHex: settings.boundaryHex } : {}),
    adjacency: settings.adjacency,
    chartType: settings.chartType,
    categoryCount: settings.categoryCount,
    nonColorCue: settings.nonColorCue,
  });
  return {
    ...(evaluation.status === 'suitable-candidate' ? { colors, evaluation } : {}),
    candidateCount: candidates.length,
    evaluationCount: budget.count - startingEvaluationCount,
  };
}

function combinations(values: readonly number[], size: number): number[][] {
  const result: number[][] = [];
  const visit = (start: number, selected: number[]): void => {
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }
    for (let index = start; index <= values.length - (size - selected.length); index += 1) {
      selected.push(values[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  };
  visit(0, []);
  return result;
}

function minimumAdjacentDelta(colors: readonly string[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < colors.length; index += 1) {
    minimum = Math.min(minimum, deltaEOK(colors[index - 1], colors[index]));
  }
  return minimum;
}

function orderedArtifact(
  family: ColorSystemStrategySecondaryFamily,
  settings: ColorSystemStrategyVisualizationSettings,
  budget: VisualizationEvaluationBudget
): ColorSystemStrategyVisualizationArtifact | null {
  const mode = settings.mode;
  const scale = family.modes[mode];
  let best:
    | {
        score: number;
        steps: readonly number[];
        evaluation: VisualizationProposal;
      }
    | undefined;
  for (const steps of combinations(SCALE_STEPS, settings.sequentialCount)) {
    if (!consumeVisualizationEvaluation(budget)) break;
    const colors = steps.map(step => scale.steps[step - 1].hex);
    const evaluation = evaluateVisualizationPalette({
      id: 'sequential',
      kind: 'sequential',
      mode,
      colors,
      surfaceHex: settings.surfaceHex,
      ...(settings.boundaryHex ? { boundaryHex: settings.boundaryHex } : {}),
      adjacency: settings.adjacency,
      chartType: settings.chartType,
      orderedDirection: mode === 'light' ? 'light-to-dark' : 'dark-to-light',
      nonColorCue: settings.nonColorCue,
    });
    if (evaluation.status !== 'suitable-candidate') continue;
    const score = minimumAdjacentDelta(colors);
    if (
      !best ||
      score > best.score ||
      (score === best.score && compareText(steps.join(','), best.steps.join(',')) < 0)
    ) {
      best = { score, steps, evaluation };
    }
  }
  if (!best) return null;
  return {
    id: 'sequential',
    kind: 'sequential',
    colors: best.steps.map(step => ({
      hex: scale.steps[step - 1].hex,
      source: sourceForSecondary(family.familyIndex, mode, step),
    })),
    evaluation: best.evaluation,
  };
}

function divergingArtifact(
  families: readonly [ColorSystemStrategySecondaryFamily, ColorSystemStrategySecondaryFamily],
  settings: ColorSystemStrategyVisualizationSettings,
  budget: VisualizationEvaluationBudget
): ColorSystemStrategyVisualizationArtifact | null {
  const mode = settings.mode;
  const armLength = (settings.divergingCount - 1) / 2;
  const armCandidates = combinations([7, 8, 9, 10, 11, 12], armLength);
  let best:
    | {
        score: number;
        colors: readonly ColorSystemStrategyPaletteColor[];
        evaluation: VisualizationProposal;
        key: string;
      }
    | undefined;
  divergingSearch: for (const leftArmAscending of armCandidates) {
    const leftSteps = [...leftArmAscending].reverse();
    for (const midpointStep of SCALE_STEPS) {
      for (const rightSteps of armCandidates) {
        if (!consumeVisualizationEvaluation(budget)) break divergingSearch;
        const colors: readonly ColorSystemStrategyPaletteColor[] = [
          ...leftSteps.map(step => ({
            hex: families[0].modes[mode].steps[step - 1].hex,
            source: sourceForSecondary(1, mode, step),
          })),
          publicPaletteColor(exactRadixColor('gray', mode, midpointStep)),
          ...rightSteps.map(step => ({
            hex: families[1].modes[mode].steps[step - 1].hex,
            source: sourceForSecondary(2, mode, step),
          })),
        ];
        const evaluation = evaluateVisualizationPalette({
          id: 'diverging',
          kind: 'diverging',
          mode,
          colors: colors.map(color => color.hex),
          surfaceHex: settings.surfaceHex,
          ...(settings.boundaryHex ? { boundaryHex: settings.boundaryHex } : {}),
          adjacency: settings.adjacency,
          chartType: settings.chartType,
          midpointIndex: armLength,
          nonColorCue: settings.nonColorCue,
        });
        if (evaluation.status !== 'suitable-candidate') continue;
        const score = minimumAdjacentDelta(colors.map(color => color.hex));
        const key = [...leftSteps, midpointStep, ...rightSteps].join(',');
        if (
          !best ||
          score > best.score ||
          (score === best.score && compareText(key, best.key) < 0)
        ) {
          best = { score, colors, evaluation, key };
        }
      }
    }
  }
  return best
    ? {
        id: 'diverging',
        kind: 'diverging',
        colors: best.colors,
        evaluation: best.evaluation,
      }
    : null;
}

function emptySearchEvidence(
  pool: CanonicalPool,
  values: Partial<ColorSystemStrategySearchEvidence> = {}
): ColorSystemStrategySearchEvidence {
  return {
    rawPoolCandidateCount: pool.rawPoolCandidateCount,
    rawPoolMaximumCandidates: MAXIMUM_RAW_POOL_CANDIDATES,
    uniquePoolCandidateCount: pool.uniqueKeys.length,
    quantizationCollapseCount: pool.quantizationCollapseCount,
    sourceDuplicateRejectionCount: pool.sourceDuplicateRejectionCount,
    directionEligibleCandidateCount: 0,
    prequalifiedFamilyCount: 0,
    maximumPrequalifiedFamilies: MAXIMUM_PREQUALIFIED_FAMILIES,
    generatedScaleFamilyCount: 0,
    invalidScaleRejectionCount: 0,
    pairEvaluationCount: 0,
    pairMaximumEvaluations: MAXIMUM_STRATEGY_PAIR_EVALUATIONS,
    pairFrontierCount: 0,
    pairArtifactEvaluationCount: 0,
    pairMaximumBeamWidth: MAXIMUM_STRATEGY_PAIR_BEAM_WIDTH,
    visualizationEvaluationCount: 0,
    visualizationMaximumEvaluations: MAXIMUM_VISUALIZATION_EVALUATIONS,
    ...values,
  };
}

function comparePrequalificationKeys(
  recipe: StrategyRecipe,
  first: RawSecondaryKey,
  second: RawSecondaryKey
): number {
  const firstTarget = Math.abs(
    Math.abs(first.hueOffsetDegrees) - recipe.targetAbsoluteOffsetDegrees
  );
  const secondTarget = Math.abs(
    Math.abs(second.hueOffsetDegrees) - recipe.targetAbsoluteOffsetDegrees
  );
  if (firstTarget !== secondTarget) return firstTarget - secondTarget;
  if (recipe.id === 'close-harmony') {
    if (first.nearestSourceDeltaEOK !== second.nearestSourceDeltaEOK) {
      return first.nearestSourceDeltaEOK - second.nearestSourceDeltaEOK;
    }
    if (first.primaryDeltaEOK !== second.primaryDeltaEOK) {
      return first.primaryDeltaEOK - second.primaryDeltaEOK;
    }
  } else if (recipe.id === 'wide-spectrum') {
    if (first.primaryDeltaEOK !== second.primaryDeltaEOK) {
      return second.primaryDeltaEOK - first.primaryDeltaEOK;
    }
  } else if (first.nearestSourceDeltaEOK !== second.nearestSourceDeltaEOK) {
    return first.nearestSourceDeltaEOK - second.nearestSourceDeltaEOK;
  }
  if (first.requestedOklch.c !== second.requestedOklch.c) {
    return second.requestedOklch.c - first.requestedOklch.c;
  }
  return compareText(first.seedHash, second.seedHash);
}

function prequalifiedKeys(pool: CanonicalPool, recipe: StrategyRecipe): RawSecondaryKey[] {
  const eligible = pool.uniqueKeys.filter(key => {
    const absoluteOffset = Math.abs(key.hueOffsetDegrees);
    return (
      key.hueOffsetDegrees !== 0 &&
      absoluteOffset >= recipe.minimumAbsoluteOffsetDegrees &&
      absoluteOffset <= recipe.maximumAbsoluteOffsetDegrees &&
      key.primaryDeltaEOK >= MINIMUM_DISTINCT_DELTA_E_OK
    );
  });
  const compare = (first: RawSecondaryKey, second: RawSecondaryKey) =>
    comparePrequalificationKeys(recipe, first, second);
  const perSide = MAXIMUM_PREQUALIFIED_FAMILIES / 2;
  return [
    ...eligible
      .filter(key => key.hueOffsetDegrees < 0)
      .sort(compare)
      .slice(0, perSide),
    ...eligible
      .filter(key => key.hueOffsetDegrees > 0)
      .sort(compare)
      .slice(0, perSide),
  ];
}

function createPrequalifiedFamilies(
  primary: ColorSystemStrategyPrimary,
  recipe: StrategyRecipe,
  keys: readonly RawSecondaryKey[]
): { families: PrequalifiedFamily[]; invalidScaleRejectionCount: number } {
  const families: PrequalifiedFamily[] = [];
  let invalidScaleRejectionCount = 0;
  for (const key of keys) {
    const familyIndex: 1 | 2 = key.hueOffsetDegrees < 0 ? 1 : 2;
    const family = createScaleFamily(primary, recipe.id, familyIndex, key);
    if (!family) {
      invalidScaleRejectionCount += 1;
      continue;
    }
    const mappedSteps = (['light', 'dark'] as const).flatMap(mode =>
      family.modes[mode].steps.filter(step => step.provenance.gamutMapped)
    ).length;
    families.push({ key, family, gamutMappedStepRate: mappedSteps / 24 });
  }
  return { families, invalidScaleRejectionCount };
}

function normalizedMetric(value: number, minimum: number, maximum: number): number {
  return maximum === minimum ? 1 : (value - minimum) / (maximum - minimum);
}

function buildPairFrontier(
  primary: ColorSystemStrategyPrimary,
  recipe: StrategyRecipe,
  families: readonly PrequalifiedFamily[],
  territory: SourceTerritoryProfile
): {
  states: StrategyPairState[];
  pairEvaluationCount: number;
  sourceTerritoryRejectionCount: number;
} {
  const negative = families.filter(item => item.key.hueOffsetDegrees < 0);
  const positive = families.filter(item => item.key.hueOffsetDegrees > 0);
  const states: StrategyPairState[] = [];
  let pairEvaluationCount = 0;
  let sourceTerritoryRejectionCount = 0;
  pairSearch: for (const first of negative) {
    for (const second of positive) {
      if (pairEvaluationCount >= MAXIMUM_STRATEGY_PAIR_EVALUATIONS) break pairSearch;
      pairEvaluationCount += 1;
      const seedHexes = [first.family.seedHex, second.family.seedHex] as const;
      const minimumFamilySeparationDeltaEOK = deltaEOK(seedHexes[0], seedHexes[1]);
      const minimumSetSeparationDeltaEOK = minimumPairSeparation([primary.hex, ...seedHexes]);
      const maximumNearestReferenceDeltaEOK = Math.max(
        ...seedHexes.map(seed =>
          Math.min(...territory.referenceHexes.map(reference => deltaEOK(seed, reference)))
        )
      );
      if (
        seedHexes[0] === seedHexes[1] ||
        minimumFamilySeparationDeltaEOK < MINIMUM_DISTINCT_DELTA_E_OK ||
        minimumSetSeparationDeltaEOK < MINIMUM_DISTINCT_DELTA_E_OK
      ) {
        continue;
      }
      if (
        territory.method === 'ordered-source-sections' &&
        maximumNearestReferenceDeltaEOK >
          COLOR_SYSTEM_STRATEGY_SOURCE_TERRITORY_THRESHOLD_DELTA_E_OK
      ) {
        sourceTerritoryRejectionCount += 1;
        continue;
      }
      states.push({
        first,
        second,
        targetDeviation: mean(
          [first, second].map(
            item =>
              Math.abs(Math.abs(item.key.hueOffsetDegrees) - recipe.targetAbsoluteOffsetDegrees) /
              180
          )
        ),
        meanNearestSourceDeltaEOK: mean([
          first.key.nearestSourceDeltaEOK,
          second.key.nearestSourceDeltaEOK,
        ]),
        meanPrimaryDeltaEOK: mean([first.key.primaryDeltaEOK, second.key.primaryDeltaEOK]),
        minimumSetSeparationDeltaEOK,
        minimumFamilySeparationDeltaEOK,
        maximumNearestReferenceDeltaEOK,
        gamutRetention: 1 - mean([first.gamutMappedStepRate, second.gamutMappedStepRate]),
        weakestPercentile: 0,
        pairHash: deterministicContentHash({
          direction: recipe.id,
          seedHexes: [...seedHexes].sort(compareText),
        }),
      });
    }
  }
  if (states.length > 0) {
    const extrema = {
      continuity: [
        Math.min(...states.map(state => state.meanNearestSourceDeltaEOK)),
        Math.max(...states.map(state => state.meanNearestSourceDeltaEOK)),
      ],
      relatedness: [
        Math.min(...states.map(state => state.targetDeviation)),
        Math.max(...states.map(state => state.targetDeviation)),
      ],
      separation: [
        Math.min(...states.map(state => state.minimumSetSeparationDeltaEOK)),
        Math.max(...states.map(state => state.minimumSetSeparationDeltaEOK)),
      ],
      gamut: [
        Math.min(...states.map(state => state.gamutRetention)),
        Math.max(...states.map(state => state.gamutRetention)),
      ],
    } as const;
    for (const state of states) {
      state.weakestPercentile = Math.min(
        1 - normalizedMetric(state.meanNearestSourceDeltaEOK, ...extrema.continuity),
        1 - normalizedMetric(state.targetDeviation, ...extrema.relatedness),
        normalizedMetric(state.minimumSetSeparationDeltaEOK, ...extrema.separation),
        normalizedMetric(state.gamutRetention, ...extrema.gamut)
      );
    }
  }
  const compare = (first: StrategyPairState, second: StrategyPairState): number => {
    if (recipe.id === 'close-harmony') {
      if (first.meanNearestSourceDeltaEOK !== second.meanNearestSourceDeltaEOK) {
        return first.meanNearestSourceDeltaEOK - second.meanNearestSourceDeltaEOK;
      }
      if (first.targetDeviation !== second.targetDeviation) {
        return first.targetDeviation - second.targetDeviation;
      }
      if (first.meanPrimaryDeltaEOK !== second.meanPrimaryDeltaEOK) {
        return first.meanPrimaryDeltaEOK - second.meanPrimaryDeltaEOK;
      }
    } else if (recipe.id === 'balanced-contrast') {
      if (first.weakestPercentile !== second.weakestPercentile) {
        return second.weakestPercentile - first.weakestPercentile;
      }
      if (first.targetDeviation !== second.targetDeviation) {
        return first.targetDeviation - second.targetDeviation;
      }
    } else {
      if (first.minimumSetSeparationDeltaEOK !== second.minimumSetSeparationDeltaEOK) {
        return second.minimumSetSeparationDeltaEOK - first.minimumSetSeparationDeltaEOK;
      }
      if (first.minimumFamilySeparationDeltaEOK !== second.minimumFamilySeparationDeltaEOK) {
        return second.minimumFamilySeparationDeltaEOK - first.minimumFamilySeparationDeltaEOK;
      }
      if (first.targetDeviation !== second.targetDeviation) {
        return first.targetDeviation - second.targetDeviation;
      }
    }
    return compareText(first.pairHash, second.pairHash);
  };
  return {
    states: states.sort(compare).slice(0, MAXIMUM_STRATEGY_PAIR_BEAM_WIDTH),
    pairEvaluationCount,
    sourceTerritoryRejectionCount,
  };
}

function orderedFamiliesForLeadReference(
  primary: ColorSystemStrategyPrimary,
  recipe: StrategyRecipe,
  pair: StrategyPairState,
  territory: SourceTerritoryProfile
): readonly [ColorSystemStrategySecondaryFamily, ColorSystemStrategySecondaryFamily] | null {
  const ordered = [pair.first, pair.second].sort(
    (first, second) =>
      hueDistanceDegrees(first.family.seedHex, territory.leadReference.hex) -
        hueDistanceDegrees(second.family.seedHex, territory.leadReference.hex) ||
      deltaEOK(first.family.seedHex, territory.leadReference.hex) -
        deltaEOK(second.family.seedHex, territory.leadReference.hex) ||
      compareText(first.key.seedHash, second.key.seedHash)
  );
  const first = createScaleFamily(primary, recipe.id, 1, ordered[0].key);
  const second = createScaleFamily(primary, recipe.id, 2, ordered[1].key);
  return first && second ? [first, second] : null;
}

function buildCandidateFromFamilies(
  primary: ColorSystemStrategyPrimary,
  settings: ColorSystemStrategyVisualizationSettings,
  recipe: StrategyRecipe,
  existingHexes: ReadonlySet<string>,
  territory: SourceTerritoryProfile,
  families: readonly [ColorSystemStrategySecondaryFamily, ColorSystemStrategySecondaryFamily],
  searchEvidence: ColorSystemStrategySearchEvidence,
  budget: VisualizationEvaluationBudget
): CandidateBuildResult {
  const evidenceWithVisualizationBudget = (): ColorSystemStrategySearchEvidence => ({
    ...searchEvidence,
    visualizationEvaluationCount: budget.count,
    visualizationMaximumEvaluations: budget.maximum,
  });
  const categorical = searchCategoricalPalette(primary, families, settings, budget);
  if (!categorical.colors || !categorical.evaluation) {
    return {
      blockers: [
        blocker(
          'NO_SUITABLE_CATEGORICAL_PALETTE',
          `${recipe.label} could not satisfy the declared categorical chart context within ${categorical.evaluationCount} bounded evaluations.`,
          ['Reduce the category count.', 'Change the chart surface or boundary.'],
          recipe.id,
          evidenceWithVisualizationBudget()
        ),
      ],
    };
  }
  const sequential = orderedArtifact(families[0], settings, budget);
  if (!sequential) {
    return {
      blockers: [
        blocker(
          'NO_SUITABLE_SEQUENTIAL_PALETTE',
          `${recipe.label} could not produce a ${settings.sequentialCount}-color sequential artifact for the declared context.`,
          ['Change the chart surface or boundary.', 'Keep the Secondary scale without Data Viz.'],
          recipe.id,
          evidenceWithVisualizationBudget()
        ),
      ],
    };
  }
  const diverging = divergingArtifact(families, settings, budget);
  if (!diverging) {
    return {
      blockers: [
        blocker(
          'NO_SUITABLE_DIVERGING_PALETTE',
          `${recipe.label} could not produce a ${settings.divergingCount}-color diverging artifact for the declared context.`,
          ['Change the chart surface or boundary.', 'Keep the Secondary scales without Data Viz.'],
          recipe.id,
          evidenceWithVisualizationBudget()
        ),
      ],
    };
  }
  const categoricalArtifact: ColorSystemStrategyVisualizationArtifact = {
    id: 'categorical',
    kind: 'categorical',
    colors: categorical.colors,
    evaluation: categorical.evaluation,
  };
  const maximumNearestReferenceDeltaEOK = Math.max(
    ...families.map(family =>
      Math.min(...territory.referenceHexes.map(reference => deltaEOK(family.seedHex, reference)))
    )
  );
  const sourceTerritoryRationale =
    territory.method === 'ordered-source-sections'
      ? `Tone and saturation follow ${territory.secondaryReferenceCount} observed Secondary colors and ${territory.dataVisualizationReferenceCount} observed Data Viz colors. The family closest in hue to ${territory.leadReference.name} (${territory.leadReference.hex.toUpperCase()}) leads sequential charts and Product accents because it appears first in the source ${territory.leadReference.section === 'data-visualization' ? 'Data Viz' : 'Secondary'} order.`
      : 'No ordered Secondary or Data Viz source section was available, so this direction keeps source-color continuity but cannot claim section-level brand fit.';
  const preview = {
    id: recipe.id,
    direction: recipe.id,
    label: recipe.label,
    rationale: `${recipe.rationale} ${sourceTerritoryRationale}`,
    primary,
    secondaryFamilies: families,
    visualization: {
      settings,
      categorical: categoricalArtifact,
      sequential,
      diverging,
      searchEvidence: {
        categoricalCandidateCount: categorical.candidateCount,
        categoricalEvaluationCount: categorical.evaluationCount,
        categoricalMaximumEvaluations: MAXIMUM_CATEGORICAL_EVALUATIONS,
        categoricalMaximumBeamWidth: MAXIMUM_CATEGORICAL_BEAM_WIDTH,
      },
    },
    searchEvidence: evidenceWithVisualizationBudget(),
    measurements: measureCandidate(
      primary,
      families,
      categorical.evaluation,
      sequential.evaluation,
      diverging.evaluation,
      existingHexes,
      territory.referenceHexes
    ),
    evidence: {
      primaryPreserved: true as const,
      validLightAndDarkScales: true as const,
      visualizationSuitableForDeclaredContext: true as const,
      accessibilityBoundary:
        'WCAG 2.2 evidence applies only to the rendered chart artifacts in this declared context; CVD separation is advisory and non-color cues remain required.',
      sourceTerritory: {
        status:
          territory.method === 'ordered-source-sections'
            ? ('passed' as const)
            : ('not-assessed' as const),
        method: territory.method,
        references: territory.references,
        secondaryReferenceCount: territory.secondaryReferenceCount,
        dataVisualizationReferenceCount: territory.dataVisualizationReferenceCount,
        thresholdDeltaEOK: COLOR_SYSTEM_STRATEGY_SOURCE_TERRITORY_THRESHOLD_DELTA_E_OK,
        maximumNearestReferenceDeltaEOK: roundedMeasurement(maximumNearestReferenceDeltaEOK),
        lightnessRange: territory.lightnessRange,
        chromaRange: territory.chromaRange,
        leadReference: territory.leadReference,
      },
    },
    warnings: [
      'This is a deterministic exploration direction, not an objective claim of aesthetic superiority.',
      'sRGB values can render differently across displays; Teul does not claim device-independent visual identity.',
    ],
  };
  return {
    blockers: [],
    candidate: {
      ...preview,
      actualSystemHash: colorSystemStrategyActualSystemHash(preview),
    },
  };
}

function buildCandidate(
  primary: ColorSystemStrategyPrimary,
  settings: ColorSystemStrategyVisualizationSettings,
  recipe: StrategyRecipe,
  existingHexes: ReadonlySet<string>,
  pool: CanonicalPool,
  territory: SourceTerritoryProfile
): CandidateBuildResult {
  const eligible = pool.uniqueKeys.filter(key => {
    const absoluteOffset = Math.abs(key.hueOffsetDegrees);
    return (
      key.hueOffsetDegrees !== 0 &&
      absoluteOffset >= recipe.minimumAbsoluteOffsetDegrees &&
      absoluteOffset <= recipe.maximumAbsoluteOffsetDegrees &&
      key.primaryDeltaEOK >= MINIMUM_DISTINCT_DELTA_E_OK
    );
  });
  const keys = prequalifiedKeys(pool, recipe);
  const generated = createPrequalifiedFamilies(primary, recipe, keys);
  const pairs = buildPairFrontier(primary, recipe, generated.families, territory);
  const baseEvidence = emptySearchEvidence(pool, {
    directionEligibleCandidateCount: eligible.length,
    prequalifiedFamilyCount: keys.length,
    generatedScaleFamilyCount: generated.families.length,
    invalidScaleRejectionCount: generated.invalidScaleRejectionCount,
    pairEvaluationCount: pairs.pairEvaluationCount,
    pairFrontierCount: pairs.states.length,
  });
  if (pairs.states.length === 0) {
    const sourceTerritoryMismatch = pairs.sourceTerritoryRejectionCount > 0;
    return {
      blockers: [
        blocker(
          sourceTerritoryMismatch ? 'SOURCE_TERRITORY_MISMATCH' : 'NO_DISTINCT_SECONDARY_STRATEGY',
          sourceTerritoryMismatch
            ? `${recipe.label} rejected ${pairs.sourceTerritoryRejectionCount} otherwise distinct family sets because at least one seed exceeded the ${COLOR_SYSTEM_STRATEGY_SOURCE_TERRITORY_THRESHOLD_DELTA_E_OK} ΔE OK source-territory limit.`
            : `${recipe.label} found no distinct two-family set after ${pairs.pairEvaluationCount} bounded pair evaluations.`,
          sourceTerritoryMismatch
            ? [
                'Review a direction closer to the ordered source references.',
                'Keep the existing system unchanged.',
              ]
            : ['Choose a different Primary.', 'Keep the existing system unchanged.'],
          recipe.id,
          baseEvidence
        ),
      ],
    };
  }
  let lastFailure: ColorSystemStrategyBuilderBlocker | undefined;
  let attemptedPairCount = 0;
  const visualizationBudget: VisualizationEvaluationBudget = {
    count: 0,
    maximum: MAXIMUM_VISUALIZATION_EVALUATIONS,
  };
  for (let index = 0; index < pairs.states.length; index += 1) {
    attemptedPairCount = index + 1;
    const pair = pairs.states[index];
    const orderedFamilies = orderedFamiliesForLeadReference(primary, recipe, pair, territory);
    if (!orderedFamilies) continue;
    const searchEvidence = {
      ...baseEvidence,
      pairArtifactEvaluationCount: index + 1,
    };
    const attempted = buildCandidateFromFamilies(
      primary,
      settings,
      recipe,
      existingHexes,
      territory,
      orderedFamilies,
      searchEvidence,
      visualizationBudget
    );
    if (attempted.candidate) return attempted;
    lastFailure = attempted.blockers[0];
    if (visualizationBudget.count >= visualizationBudget.maximum) {
      lastFailure = blocker(
        'VISUALIZATION_EVALUATION_LIMIT_REACHED',
        `${recipe.label} reached the ${visualizationBudget.maximum}-evaluation Data Viz search limit for this direction.`,
        ['Change the chart context.', 'Keep the valid Secondary scales without Data Viz.'],
        recipe.id,
        {
          ...searchEvidence,
          visualizationEvaluationCount: visualizationBudget.count,
          visualizationMaximumEvaluations: visualizationBudget.maximum,
        }
      );
      break;
    }
  }
  const finalEvidence = {
    ...baseEvidence,
    pairArtifactEvaluationCount: attemptedPairCount,
    visualizationEvaluationCount: visualizationBudget.count,
    visualizationMaximumEvaluations: visualizationBudget.maximum,
  };
  const reachedVisualizationLimit = visualizationBudget.count >= visualizationBudget.maximum;
  return {
    blockers: [
      blocker(
        lastFailure?.code ?? 'NO_DISTINCT_SECONDARY_STRATEGY',
        reachedVisualizationLimit
          ? `${recipe.label} reached the ${visualizationBudget.maximum}-evaluation Data Viz limit after ${attemptedPairCount} bounded pair attempts.`
          : `${recipe.label} exhausted its ${attemptedPairCount}-set bounded frontier without a complete Secondary and Data Viz result.`,
        lastFailure?.alternatives ?? [
          'Change the Primary or declared chart context.',
          'Keep the existing system unchanged.',
        ],
        recipe.id,
        finalEvidence
      ),
    ],
  };
}

function candidateWithHashes(
  sourceHash: string,
  briefHash: string,
  candidate: Omit<ColorSystemStrategyCandidate, 'modelHash' | 'candidateHash'>
): ColorSystemStrategyCandidate {
  const modelHash = deterministicContentHash({
    policyVersion: COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION,
    sourceHash,
    briefHash,
    candidate,
  });
  const candidateHash = deterministicContentHash({
    policyVersion: COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION,
    sourceHash,
    briefHash,
    modelHash,
    preview: candidate,
  });
  return { ...candidate, modelHash, candidateHash };
}

export function collapseDuplicateColorSystemStrategyCandidates(
  inputCandidates: readonly ColorSystemStrategyCandidate[]
): {
  candidates: readonly ColorSystemStrategyCandidate[];
  blockers: readonly ColorSystemStrategyBuilderBlocker[];
} {
  const ordered = [...inputCandidates].sort(
    (first, second) =>
      STRATEGY_RECIPES.findIndex(recipe => recipe.id === first.direction) -
        STRATEGY_RECIPES.findIndex(recipe => recipe.id === second.direction) ||
      compareText(first.candidateHash, second.candidateHash)
  );
  const candidates: ColorSystemStrategyCandidate[] = [];
  const blockers: ColorSystemStrategyBuilderBlocker[] = [];
  const retainedBySystemHash = new Map<string, ColorSystemStrategyCandidate>();
  for (const candidate of ordered) {
    const retained = retainedBySystemHash.get(candidate.actualSystemHash);
    if (retained) {
      blockers.push(
        blocker(
          'DUPLICATE_STRATEGY_COLLAPSED',
          `${candidate.label} produced the same rendered Secondary family set as ${retained.label} and was collapsed instead of presented as fake variety.`,
          ['Review the retained direction.', 'Choose a different Primary or context.'],
          candidate.direction,
          candidate.searchEvidence,
          retained.direction
        )
      );
      continue;
    }
    retainedBySystemHash.set(candidate.actualSystemHash, candidate);
    candidates.push(candidate);
  }
  return { candidates, blockers };
}

/**
 * Produces one to three inert, deterministic Secondary + Data Viz strategy models.
 * It performs no Figma or network mutation. The backend remains responsible
 * for compiling one selected model into a proposal and approval receipt.
 */
export function buildColorSystemStrategySet(
  input: ColorSystemStrategyBuilderInput
): ColorSystemStrategyBuilderResult {
  const inputBlockers = validateInput(input);
  if (inputBlockers.length > 0) {
    return { status: 'no-solution', sourceHash: input.sourceHash, blockers: inputBlockers };
  }
  const primary = canonicalPrimary(input.primary);
  const settings = canonicalSettings(input.visualizationSettings);
  const primaryOklch = hexToOklch(primary.hex);
  if (!Number.isFinite(primaryOklch.h) || primaryOklch.c < MINIMUM_PRIMARY_CHROMA) {
    return {
      status: 'no-solution',
      sourceHash: input.sourceHash,
      blockers: [
        blocker(
          'PRIMARY_HUE_UNSTABLE',
          'The selected Primary is too neutral for a defensible hue-relationship strategy.',
          [
            'Choose a chromatic Primary.',
            'Use exact source Secondary colors without hue generation.',
          ]
        ),
      ],
    };
  }
  const existingHexes = new Set(
    (input.existingSourceHexes ?? []).map(normalizeHex).filter(hex => hex !== primary.hex)
  );
  const territory = sourceTerritoryProfile(input, primary, existingHexes);
  const brief = {
    schemaVersion: COLOR_SYSTEM_STRATEGY_BUILDER_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION,
    sourceHash: input.sourceHash,
    primary,
    visualizationSettings: settings,
    existingSourceHexes: [...existingHexes].sort(compareText),
  };
  const briefHash = deterministicContentHash(brief);
  const pool = canonicalPool(primary, existingHexes, territory);
  const results = STRATEGY_RECIPES.map(recipe =>
    buildCandidate(primary, settings, recipe, existingHexes, pool, territory)
  );
  const blockers: ColorSystemStrategyBuilderBlocker[] = results.flatMap(result => result.blockers);
  const builtCandidates = results.flatMap(result =>
    result.candidate ? [candidateWithHashes(input.sourceHash, briefHash, result.candidate)] : []
  );
  const collapsed = collapseDuplicateColorSystemStrategyCandidates(builtCandidates);
  const candidates = [...collapsed.candidates];
  blockers.push(...collapsed.blockers);
  if (candidates.length === 0) {
    return {
      status: 'no-solution',
      sourceHash: input.sourceHash,
      blockers: [
        ...blockers,
        ...(blockers.length === 0
          ? [
              blocker(
                'INCOMPLETE_STRATEGY_SET',
                'No strategy direction satisfied the bounded Secondary and Data Viz hard gates.',
                ['Change the Primary or chart context.', 'Keep the current system unchanged.']
              ),
            ]
          : []),
      ],
    };
  }
  const recommendation = buildColorSystemStrategyRecommendation(candidates);
  const strategySetHash = deterministicContentHash({
    schemaVersion: COLOR_SYSTEM_STRATEGY_BUILDER_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION,
    sourceHash: input.sourceHash,
    briefHash,
    primary,
    visualizationSettings: settings,
    recommendation,
    blockers,
    candidates: candidates.map(candidate => ({
      id: candidate.id,
      modelHash: candidate.modelHash,
      candidateHash: candidate.candidateHash,
    })),
  });
  return {
    status: 'ready',
    strategySet: {
      schemaVersion: COLOR_SYSTEM_STRATEGY_BUILDER_SCHEMA_VERSION,
      policyVersion: COLOR_SYSTEM_STRATEGY_BUILDER_POLICY_VERSION,
      sourceHash: input.sourceHash,
      briefHash,
      strategySetHash,
      primary,
      visualizationSettings: settings,
      recommendation,
      candidates,
      blockers,
    },
  };
}
