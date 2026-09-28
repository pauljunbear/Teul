export const COLOR_SYSTEM_SNAPSHOT_SCHEMA_VERSION = '1.0.0' as const;
export const COLOR_SYSTEM_AUDIT_ENGINE_VERSION = '1.0.0' as const;
export const OBSERVED_LITERAL_MODE_GROUP_ID = 'figma-observed-literals' as const;
export const STRUCTURED_SOURCE_MODE_GROUP_ID = 'figma-structured-source-sections' as const;
export const OBSERVED_LITERAL_EVIDENCE_LIMIT = 24 as const;

export type SnapshotSourceKind = 'figma-document' | 'dtcg-tokens' | 'teul-json' | 'guideline-draft';

export type SnapshotDocumentProfile = 'srgb' | 'display-p3' | 'legacy' | 'unknown';
export type SnapshotUsageScope = 'selection' | 'current-page' | 'whole-file' | 'not-applicable';
export type RoleEvidenceStatus = 'verified' | 'inferred' | 'unresolved';
export type ReviewerDisposition = 'confirmed' | 'rejected' | 'pending';

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
