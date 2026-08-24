import type { ColorScaleValidation } from '../lib/colorScale';

export const COLOR_SYSTEM_SNAPSHOT_SCHEMA_VERSION = '1.0.0' as const;
export const COLOR_SYSTEM_AUDIT_ENGINE_VERSION = '1.0.0' as const;
export const OBSERVED_LITERAL_MODE_GROUP_ID = 'figma-observed-literals' as const;
export const STRUCTURED_SOURCE_MODE_GROUP_ID = 'figma-structured-source-sections' as const;
export const OBSERVED_LITERAL_EVIDENCE_LIMIT = 24 as const;
export const COLOR_SYSTEM_PROPOSAL_SCHEMA_VERSION = '1.0.0' as const;
export const COLOR_SYSTEM_REVIEW_POLICY_VERSION = 'teul-color-review-v1' as const;
export const COLOR_SYSTEM_APPROVAL_POLICY_VERSION = 'teul-color-approval-v1' as const;

export type SnapshotSourceKind = 'figma-document' | 'dtcg-tokens' | 'teul-json' | 'guideline-draft';

export type SnapshotDocumentProfile = 'srgb' | 'display-p3' | 'legacy' | 'unknown';
export type SnapshotUsageScope = 'selection' | 'current-page' | 'whole-file' | 'not-applicable';
export type RoleEvidenceStatus = 'verified' | 'inferred' | 'unresolved';
export type ReviewerDisposition = 'confirmed' | 'rejected' | 'pending';
export type ProposalStrategy = 'exact-radix' | 'brand-preserving' | 'hybrid';

/** Deterministic directions shown by the guided color-system builder. */
export type ColorSystemBuilderDirection = 'close-harmony' | 'balanced-contrast' | 'wide-spectrum';

/**
 * Canonical roles a reviewer may add when proprietary token names do not carry
 * recognizable role evidence. Source evidence may retain other documented
 * role names, but manual assignments are deliberately constrained to roles
 * consumed by Teul's production objective modules.
 */
export const COLOR_SYSTEM_REVIEW_ASSIGNABLE_ROLES = [
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
  'neutral',
  'accent',
  'primary',
  'secondary',
  'supporting',
  'campaign',
  'categorical',
  'sequential',
  'diverging',
  'illustration',
  'illustration-decorative',
  'illustration-information-bearing',
] as const;
export const MAX_COLOR_SYSTEM_REVIEWER_ROLE_ASSIGNMENTS = 100;
export type ColorSystemReviewAssignableRole = (typeof COLOR_SYSTEM_REVIEW_ASSIGNABLE_ROLES)[number];

interface ProposalReviewerEvidenceRoleDecision {
  tokenId: string;
  role: string;
  disposition: 'confirmed' | 'rejected';
  /** Omitted only for backward-compatible source-evidence reviews. */
  assignmentSource?: 'source-evidence';
}

interface ProposalReviewerAssignedRoleDecision {
  tokenId: string;
  role: ColorSystemReviewAssignableRole;
  disposition: 'confirmed';
  assignmentSource: 'reviewer-assigned';
}

export type ProposalReviewerRoleDecision =
  | ProposalReviewerEvidenceRoleDecision
  | ProposalReviewerAssignedRoleDecision;

/** Explicit render context used to derive chart-specific proposal artifacts. */
export interface ColorSystemVisualizationSettings {
  mode: 'light' | 'dark';
  surfaceHex: string;
  boundaryHex?: string;
  chartType: string;
  categoryCount: number;
  nonColorCue: string;
  /** Required by the guided builder; optional only for legacy proposal readers. */
  markType?: 'bar' | 'line' | 'area' | 'point' | 'region';
  /** Whether marks visually touch, which changes boundary evidence requirements. */
  adjacency?: 'separated-marks' | 'touching-regions';
  /** Human-declared meaning of the neutral center used by diverging output. */
  divergingMidpoint?: string;
  /** Ordered sequential marks requested for the reviewed chart context. */
  sequentialCount?: number;
  /** Odd diverging marks requested for V1, including one explicit midpoint mark. */
  divergingCount?: number;
}

/** Exact source literal the reviewer protected, including its source mode. */
export interface ConfirmedColorSystemAnchor {
  tokenId: string;
  mode: string;
  hex: string;
}
export type ProposalCandidateStatus =
  | 'suitable-candidate'
  | 'closest-candidate-outside-approved-tolerance'
  | 'no-solution';

export interface SnapshotAuthorization {
  status: 'user-authorized' | 'public-reference' | 'unknown';
  rightsNote?: string;
  /** Receipt metadata is intentionally excluded from sourceHash. */
  receiptLocator?: string;
}

export interface SnapshotResourceScope {
  kind: 'all-local-resources' | 'structured-input';
  localVariableCount: number;
  localStyleCount: number;
}

export interface SourceEvidenceLocator {
  kind: 'figma-resource' | 'figma-node' | 'token-path' | 'document-page' | 'manual';
  locator: string;
  detail?: string;
}

export interface SourceColorValue {
  colorSpace: 'srgb' | 'display-p3';
  /** Six-digit sRGB hex is required for deterministic v1 proposal math. */
  hex?: string;
  /** Original normalized components. Values are not silently reinterpreted across profiles. */
  components: readonly [number, number, number];
  alpha: number;
}

export interface SourceRoleEvidence {
  role: string;
  status: RoleEvidenceStatus;
  confidence: number | null;
  evidence: readonly SourceEvidenceLocator[];
  reviewerDisposition: ReviewerDisposition;
  protectedAnchor?: boolean;
}

export interface SourceScalePosition {
  scaleId: string;
  step: number;
}

export interface SourceColorToken {
  id: string;
  name: string;
  path: readonly string[];
  description?: string;
  /**
   * Omitted for existing source-token adapters. `observed-literal` identifies a
   * deterministic candidate derived from an opaque resolved Figma canvas
   * paint without a locally inventoried source token. `structured-source`
   * identifies an exact opaque swatch from an authorized named source section
   * when unrelated local resources would otherwise suppress literal fallback.
   * Neither representation is an authored or imported variable/style.
   */
  sourceRepresentation?: 'authored-token' | 'observed-literal' | 'structured-source';
  /** Exact number of supported paint observations represented by a candidate. */
  observedUsageCount?: number;
  /** One-based deterministic rank by usage count, normalized hex, then exact mode/components. */
  observedUsageRank?: number;
  /** Tokens are compared for missing modes only within the same collection or adapter group. */
  modeGroupId?: string;
  valuesByMode: Readonly<Record<string, SourceColorValue>>;
  /** Canonical alias graph. A Figma variable may target a different token in each mode. */
  aliasTargetsByMode?: Readonly<Record<string, string>>;
  /** Compatibility fallback for formats whose alias target is mode-independent. */
  aliasTargetId?: string;
  evidence: readonly SourceEvidenceLocator[];
  roleEvidence: readonly SourceRoleEvidence[];
  scalePosition?: SourceScalePosition;
}

export interface SourceColorUsage {
  id: string;
  tokenId?: string;
  mode: string;
  value: SourceColorValue;
  count: number;
  evidence: readonly SourceEvidenceLocator[];
}

export const SOURCE_COLOR_SECTION_KINDS = [
  'primary',
  'secondary',
  'product-graphics',
  'data-visualization',
  'typography',
] as const;

export type SourceColorSectionKind = (typeof SOURCE_COLOR_SECTION_KINDS)[number];

/**
 * One explicitly labelled color inside a source-system section. Section
 * membership is source evidence only; it never implies a semantic role.
 */
export interface SourceColorSectionEntry {
  id: string;
  name: string;
  /** One-based native visual order within the source section. */
  order: number;
  value: SourceColorValue;
  evidence: readonly SourceEvidenceLocator[];
}

/**
 * A bounded, evidence-backed section found in an authorized Figma source.
 * The same exact color may intentionally occur in more than one section.
 */
export interface SourceColorSection {
  kind: SourceColorSectionKind;
  title: string;
  sourceNodeId: string;
  extractionMethod: 'explicit-heading';
  entries: readonly SourceColorSectionEntry[];
  evidence: readonly SourceEvidenceLocator[];
}

export type UnsupportedColorReason =
  | 'gradient'
  | 'image'
  | 'video'
  | 'mixed-paint'
  | 'blend-mode'
  | 'unknown-background'
  | 'transparency'
  | 'unsupported-color-space'
  | 'unresolved-alias'
  | 'other';

export interface UnsupportedColorUsage {
  id: string;
  reason: UnsupportedColorReason;
  count: number;
  detail: string;
  evidence: readonly SourceEvidenceLocator[];
}

export interface DeclaredColorReference {
  tokenId: string;
  alpha?: number;
}

export type AccessibilityUseCategory = 'normal-text' | 'large-text' | 'non-text';
export type WCAGRequiredLevel = 'AA' | 'AAA';

export interface DeclaredAccessibilityPair {
  id: string;
  foreground: DeclaredColorReference;
  background: DeclaredColorReference;
  /** Required when a translucent background cannot otherwise be rendered. */
  underlayHex?: string;
  mode: string;
  useCase: string;
  category: AccessibilityUseCategory;
  requiredLevel: WCAGRequiredLevel;
  textSizePt?: number;
  textWeight?: number;
}

export interface SourceSystemSnapshotInput {
  schemaVersion?: typeof COLOR_SYSTEM_SNAPSHOT_SCHEMA_VERSION;
  sourceKind: SnapshotSourceKind;
  sourceLocator: string;
  authorization: SnapshotAuthorization;
  documentProfile: SnapshotDocumentProfile;
  resourceScope: SnapshotResourceScope;
  usageScope: SnapshotUsageScope;
  capturedAt: string;
  modes: readonly string[];
  tokens: readonly SourceColorToken[];
  /** Optional for backward-compatible token-file snapshots; Figma inventory supplies it. */
  sourceSections?: readonly SourceColorSection[];
  supportedUsage: readonly SourceColorUsage[];
  unsupportedUsage: readonly UnsupportedColorUsage[];
  declaredPairs: readonly DeclaredAccessibilityPair[];
}

export interface SourceSystemSnapshot extends SourceSystemSnapshotInput {
  schemaVersion: typeof COLOR_SYSTEM_SNAPSHOT_SCHEMA_VERSION;
  sourceHash: string;
}

export interface AccessibilityPairInput {
  id: string;
  foregroundHex: string;
  /** Exact normalized sRGB channels. Hex remains display evidence only when supplied. */
  foregroundComponents?: readonly [number, number, number];
  foregroundAlpha?: number;
  backgroundHex: string;
  /** Exact normalized sRGB channels. Hex remains display evidence only when supplied. */
  backgroundComponents?: readonly [number, number, number];
  backgroundAlpha?: number;
  underlayHex?: string;
  mode: string;
  useCase: string;
  category: AccessibilityUseCategory;
  requiredLevel: WCAGRequiredLevel;
  textSizePt?: number;
  textWeight?: number;
}

export interface AccessibilityPairEvidence {
  id: string;
  status: 'tested' | 'unsupported';
  foreground: {
    /** Absent when the declared token cannot resolve to an sRGB value in the requested mode. */
    sourceHex?: string;
    /** Exact normalized sRGB channels used for luminance and contrast. */
    sourceComponents?: readonly [number, number, number];
    alpha: number;
    /** Exact normalized channels after compositing; hex is quantized display evidence only. */
    compositedComponents?: readonly [number, number, number];
    compositedHex?: string;
  };
  background: {
    /** Absent when the declared token cannot resolve to an sRGB value in the requested mode. */
    sourceHex?: string;
    /** Exact normalized sRGB channels used for luminance and contrast. */
    sourceComponents?: readonly [number, number, number];
    alpha: number;
    /** Exact normalized channels after compositing; hex is quantized display evidence only. */
    compositedComponents?: readonly [number, number, number];
    compositedHex?: string;
  };
  underlayHex?: string;
  mode: string;
  useCase: string;
  category: AccessibilityUseCategory;
  requiredLevel: WCAGRequiredLevel;
  textSizePt?: number;
  textWeight?: number;
  method: 'WCAG 2.2 sRGB contrast ratio';
  ratio?: number;
  threshold?: number;
  pass?: boolean;
  unsupportedReason?: string;
}

export type DiagnosticCode =
  | 'DUPLICATE_COLOR'
  | 'NEAR_DUPLICATE_COLOR'
  | 'ALIAS_TARGET_MISSING'
  | 'ALIAS_CYCLE'
  | 'ALIAS_LITERAL_DIVERGENCE'
  | 'MISSING_MODE'
  | 'UNEVEN_SCALE'
  | 'UNCOVERED_ROLE'
  | 'INACCESSIBLE_DECLARED_PAIR'
  | 'CONTEXT_DEPENDENT_COLOR'
  | 'AUDIT_EVIDENCE_TRUNCATED'
  | 'UNSUPPORTED_PROFILE';

export interface ColorSystemDiagnostic {
  id: string;
  code: DiagnosticCode;
  severity: 'info' | 'warning' | 'blocking';
  classification: 'observation' | 'potential-gap' | 'confirmed-defect' | 'unsupported';
  message: string;
  tokenIds: readonly string[];
  mode?: string;
  evidence: readonly SourceEvidenceLocator[];
}

export interface ColorModuleCoverage {
  module:
    | 'brand-marketing'
    | 'product-primitives'
    | 'product-semantics'
    | 'data-visualization'
    | 'illustration';
  coveredRoles: readonly string[];
  missingRoles: readonly string[];
  status: 'covered' | 'partial' | 'unknown';
}

export interface ColorSystemAudit {
  schemaVersion: '1.0.0';
  engineVersion: typeof COLOR_SYSTEM_AUDIT_ENGINE_VERSION;
  diagnosticPolicyVersion: 'teul-color-diagnostics-v1';
  sourceHash: string;
  diagnostics: readonly ColorSystemDiagnostic[];
  moduleCoverage: readonly ColorModuleCoverage[];
  declaredPairTests: readonly AccessibilityPairEvidence[];
  unresolvedQuestions: readonly string[];
  auditHash: string;
}

export interface ExactRadixAnchor {
  sourceTokenId: string;
  hex: string;
  /** When absent, every published solid step participates in ranking. */
  referenceMode?: 'light' | 'dark';
  referenceStep?: number;
  weight?: number;
}

export interface RadixSwatchCandidate {
  family: string;
  mode: 'light' | 'dark';
  step: number;
  hex: string;
  packageVersion: string;
  deltaEOK: number;
  exact: boolean;
}

export interface RadixSwatchEquivalenceClass {
  deltaEOK: number;
  candidates: readonly RadixSwatchCandidate[];
}

export interface ExactRadixFamilyCandidate {
  family: string;
  anchorMatches: readonly (RadixSwatchCandidate & { sourceTokenId: string })[];
  maximumDeltaEOK: number;
  weightedMeanDeltaEOK: number;
  unintendedFamilyCollisions: number;
}

export interface LockedColorAnchor {
  sourceTokenId: string;
  /** Exact source mode whose opaque sRGB literal is protected. */
  sourceMode: string;
  name: string;
  hex: string;
  /** The current Teul OKLCH v3 generator supports a protected step-nine anchor. */
  step: number;
}

export interface GeneratedScaleRequest {
  id: string;
  name: string;
  anchor: LockedColorAnchor;
  includeDarkMode: boolean;
}

/** Exact OKLCH coordinates retained as deterministic generation evidence. */
export interface ColorSystemOklchCoordinates {
  l: number;
  c: number;
  h: number;
}

export type ProposedTokenProvenance =
  | {
      kind: 'source-preserved';
      sourceTokenIds: readonly string[];
      /** Singular source-value identity retained alongside the relationship index. */
      sourceTokenId: string;
      sourceMode: string;
      sourceHex: string;
      /** Exact normalized source channels; never reconstructed from sourceHex. */
      sourceComponents?: readonly [number, number, number];
      sourceAlpha?: number;
    }
  | {
      kind: 'exact-radix';
      packageVersion: string;
      family: string;
      mode: 'light' | 'dark';
      step: number;
    }
  | {
      kind: 'teul-generated';
      algorithmVersion: 'Teul OKLCH v3';
      sourceTokenIds: readonly string[];
      anchorStep: 9;
    }
  | {
      /**
       * A Secondary scale generated from, but never substituted for, one exact
       * protected Primary. This is a Teul recommendation rather than source
       * ownership or an exact third-party palette.
       */
      kind: 'teul-harmony-generated';
      policyVersion: 'teul-secondary-strategy-v1';
      scaleAlgorithmVersion: 'Teul OKLCH v3';
      gamutMapping: 'CSS Color 4 Local MINDE';
      sourceTokenId: string;
      sourceMode: string;
      sourceHex: string;
      direction: ColorSystemBuilderDirection;
      familyIndex: 1 | 2;
      hueOffsetDegrees: number;
      seedHex: string;
      mode: 'light' | 'dark';
      step: number;
      gamutMapped: boolean;
      /** Coordinates requested before CSS Color 4 Local MINDE gamut mapping. */
      requestedOklch: ColorSystemOklchCoordinates;
      /** Coordinates returned by the mapper before six-digit sRGB serialization. */
      mappedOklch: ColorSystemOklchCoordinates;
    };

/** Immutable evidence tying a compiled proposal back to the preview selected by the user. */
export interface ColorSystemBuilderEvidence {
  policyVersion: 'teul-secondary-strategy-v1';
  strategySetHash: string;
  briefHash: string;
  candidateId: ColorSystemBuilderDirection;
  candidateHash: string;
  modelHash: string;
  primary: {
    tokenId: string;
    name: string;
    mode: string;
    hex: string;
  };
  visualizationSettings: ColorSystemVisualizationSettings;
}

export interface ProposedColorToken {
  id: string;
  name: string;
  path: readonly string[];
  namespace: ColorProposalNamespace;
  valuesByMode: Readonly<Record<string, string>>;
  /** Exact source values for source-owned modes. Generated modes intentionally omit this map. */
  exactSourceValuesByMode?: Readonly<Record<string, SourceColorValue>>;
  /** Source variable alias topology, mapped to proposal token IDs per exact source mode. */
  sourceAliasTargetsByMode?: Readonly<Record<string, string>>;
  provenanceByMode: Readonly<Record<string, ProposedTokenProvenance>>;
  sourceRelationships: readonly string[];
  accessibilityConstrained: boolean;
}

export type ColorProposalNamespace =
  | 'brand-marketing'
  | 'product-primitives'
  | 'product-semantics'
  | 'data-visualization'
  | 'illustration';

export interface ProposedColorAlias {
  id: string;
  role: ProductSemanticRole | string;
  mode: string;
  state?: string;
  targetTokenId: string;
}

export interface ColorProposalModule {
  namespace: ColorProposalNamespace;
  tokens: readonly ProposedColorToken[];
  aliases: readonly ProposedColorAlias[];
  pairEvidence: readonly AccessibilityPairEvidence[];
  warnings: readonly string[];
}

export type ProductSemanticRole =
  | 'background'
  | 'surface'
  | 'text'
  | 'border'
  | 'focus'
  | 'link'
  | 'selected'
  | 'disabled'
  | 'success'
  | 'warning'
  | 'error'
  | 'information'
  | 'destructive';

export interface ProductSemanticBinding {
  id: string;
  role: ProductSemanticRole;
  mode: string;
  targetTokenId: string;
  state?: string;
}

export interface ProductSemanticModuleInput {
  modes: readonly string[];
  availableTokens: readonly ProposedColorToken[];
  bindings: readonly ProductSemanticBinding[];
  pairEvidence?: readonly AccessibilityPairEvidence[];
}

export interface ExpressiveColorInput {
  id: string;
  name: string;
  sourceTokenId: string;
  valuesByMode: Readonly<Record<string, string>>;
  informationBearing: boolean;
  pairEvidence?: readonly AccessibilityPairEvidence[];
}

export interface ExpressiveModuleInput {
  namespace: 'brand-marketing' | 'illustration';
  colors: readonly ExpressiveColorInput[];
}

export type ProposalNoSolutionCode =
  | 'NO_SUITABLE_EXACT_MATCH'
  | 'ROLE_CONFIRMATION_REQUIRED'
  | 'UNSUPPORTED_LOCKED_ANCHOR_POSITION'
  | 'CONFLICTING_LOCKED_ANCHORS'
  | 'INVALID_GENERATED_SCALE'
  | 'UNSUPPORTED_COLOR_PROFILE'
  | 'MISSING_PRODUCT_ROLE'
  | 'INACCESSIBLE_SEMANTIC_PAIR'
  | 'INACCESSIBLE_PROTECTED_ANCHOR'
  | 'NO_SUITABLE_VIZ_PALETTE'
  | 'AUDIT_EVIDENCE_TRUNCATED';

export interface ProposalBlocker {
  code: ProposalNoSolutionCode;
  message: string;
  sourceTokenIds: readonly string[];
  alternatives: readonly string[];
}

export interface GeneratedScaleEvidence {
  id: string;
  name: string;
  anchor: LockedColorAnchor;
  modes: Readonly<
    Record<
      string,
      {
        steps: readonly { step: number; hex: string }[];
        validation: ColorScaleValidation;
      }
    >
  >;
}

export interface ExactRadixProposalRequest {
  strategy: 'exact-radix';
  anchors: readonly ExactRadixAnchor[];
  /** Undefined means rank only; zero is a valid approved tolerance. */
  approvedTolerance?: number;
}

export interface BrandPreservingProposalRequest {
  strategy: 'brand-preserving';
  scales: readonly GeneratedScaleRequest[];
}

export interface HybridProposalRequest {
  strategy: 'hybrid';
  exact: ExactRadixProposalRequest;
  generatedScales: readonly GeneratedScaleRequest[];
}

export type ColorSystemProposalRequest =
  | ExactRadixProposalRequest
  | BrandPreservingProposalRequest
  | HybridProposalRequest;

export interface ColorSystemProposal {
  schemaVersion: typeof COLOR_SYSTEM_PROPOSAL_SCHEMA_VERSION;
  engineVersion: typeof COLOR_SYSTEM_AUDIT_ENGINE_VERSION;
  strategy: ProposalStrategy;
  strategyVersion: string;
  status: Exclude<ProposalCandidateStatus, 'no-solution'>;
  sourceHash: string;
  lockedAnchorTokenIds: readonly string[];
  exactCandidates: readonly ExactRadixFamilyCandidate[];
  generatedScales: readonly GeneratedScaleEvidence[];
  modules: readonly ColorProposalModule[];
  moduleCoverage: readonly ColorModuleCoverage[];
  pairEvidence: readonly AccessibilityPairEvidence[];
  unresolvedBlockers: readonly ProposalBlocker[];
  warnings: readonly string[];
  /** Present only for proposals compiled from the guided three-strategy builder. */
  builderEvidence?: ColorSystemBuilderEvidence;
  proposalHash: string;
}

export type ProposalBundle =
  | {
      status: Exclude<ProposalCandidateStatus, 'no-solution'>;
      proposal: ColorSystemProposal;
    }
  | {
      status: 'no-solution';
      strategy: ProposalStrategy;
      sourceHash: string;
      blockers: readonly ProposalBlocker[];
    };

export type VisualizationKind = 'categorical' | 'sequential' | 'diverging';

export interface VisualizationPaletteInput {
  id: string;
  kind: VisualizationKind;
  mode: string;
  colors: readonly string[];
  surfaceHex: string;
  chartType: string;
  categoryCount?: number;
  midpointIndex?: number;
  orderedDirection?: 'light-to-dark' | 'dark-to-light';
  boundaryHex?: string;
  adjacency?: 'separated-marks' | 'touching-regions';
  nonColorCue?: string;
}

export interface VisualizationSeparationEvidence {
  condition:
    | 'normal'
    | 'protan condition'
    | 'deutan condition'
    | 'severe tritanomaly approximation';
  advisory: true;
  minimumDeltaEOK: number;
  threshold: number;
  pass: boolean;
  simulatedColors: readonly string[];
}

export interface VisualizationProposal {
  id: string;
  kind: VisualizationKind;
  policyVersion: 'teul-visualization-v1';
  simulator: 'Machado 2009 severity 1.0 advisory';
  status: 'suitable-candidate' | 'no-solution';
  colors: readonly string[];
  surfaceHex: string;
  chartType: string;
  categoryCount?: number;
  midpointIndex?: number;
  orderedDirection?: 'light-to-dark' | 'dark-to-light';
  adjacency?: 'separated-marks' | 'touching-regions';
  surfaceEvidence: readonly AccessibilityPairEvidence[];
  separationEvidence: readonly VisualizationSeparationEvidence[];
  orderingPass: boolean;
  uniqueAfterQuantization: boolean;
  nonColorCue: string | null;
  blockers: readonly ProposalBlocker[];
}
