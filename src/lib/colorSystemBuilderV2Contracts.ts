/**
 * Parallel v2 contracts for the Intelligent Color System Builder.
 *
 * V1 is intentionally not extended by these types. Existing v1 approvals,
 * packages, and apply messages cannot be cast into this graph; v2 must be
 * derived from fresh source authority and issue a new hash chain.
 */

export const COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION =
  'teul-color-system-builder-brief/v2' as const;
export const COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION =
  'teul-color-system-strategy-candidate/v2' as const;
export const COLOR_SYSTEM_STRATEGY_SET_V2_SCHEMA_VERSION =
  'teul-color-system-strategy-set/v2' as const;
export const COLOR_SYSTEM_SECTION_BLUEPRINT_V2_SCHEMA_VERSION = 'teul-color-output/v2' as const;
export const COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION = 'teul-intelligent-color-builder-v2' as const;

export const COLOR_SYSTEM_BUILDER_V2_LIMITS = {
  sectionCount: 5,
  minimumCandidateCount: 1,
  maximumCandidateCount: 3,
  minimumSecondaryFamilyTarget: 4,
  maximumSecondaryFamilyTarget: 12,
  maximumMembersPerFamily: 12,
  maximumModes: 4,
  maximumProductGraphicsDerivations: 64,
  maximumDataVisualizationSelections: 8,
  minimumDataVisualizationMarks: 2,
  maximumDataVisualizationMarks: 9,
  maximumTypographySpecimens: 32,
  maximumTokens: 512,
  maximumAliases: 128,
  maximumFamilyModeComponentVariants: 24,
  maximumEstimatedRecipeNodes: 5_000,
} as const;

export const COLOR_SYSTEM_SECTION_ROLES_V2 = [
  'primary',
  'secondary',
  'product-graphics',
  'data-visualization',
  'typography',
] as const;

export type ColorSystemSectionRoleV2 = (typeof COLOR_SYSTEM_SECTION_ROLES_V2)[number];

export type ColorSystemSectionDispositionV2 = 'preserve' | 'rebuild' | 'derive' | 'omit';

export type ColorSystemJobV2 =
  | 'brand-primary'
  | 'marketing-accent'
  | 'product-graphics'
  | 'functional-iconography'
  | 'product-ui-surface'
  | 'product-semantics'
  | 'categorical-data'
  | 'sequential-data'
  | 'diverging-data'
  | 'rendered-text-pair';

export type ColorSystemPolicyEvidenceAuthorityV2 =
  | 'governed-source'
  | 'teul-proposal'
  | 'teul-policy-evidence';

export interface ColorSystemSectionIntentV2 {
  role: ColorSystemSectionRoleV2;
  order: number;
  disposition: ColorSystemSectionDispositionV2;
  jobs: readonly ColorSystemJobV2[];
  guidance: string;
  evidenceIds: readonly string[];
  confirmation: 'source-evidenced' | 'owner-confirmed';
}

export interface ColorSystemColorValueV2 {
  colorSpace: 'srgb';
  hex: string;
  /** Exact normalized sRGB channels retained from source or deterministic mapping. */
  components: Readonly<{ r: number; g: number; b: number }>;
  alpha: number;
}

export interface ColorSystemSecondaryTargetPolicyV2 {
  version: 'teul-secondary-target-policy/v2';
  derivationRule:
    | 'max-retained-groups-and-job-minima-clamped'
    | 'teul-generated-contribution-count';
  /** Source family groups retained as evidence. These do not dictate assembly size. */
  retainedSourceFamilyGroupIds: readonly string[];
  /** Exact assembly contributions. Its length must equal the derived target. */
  assemblyContributionIds: readonly string[];
  jobMinimums: readonly {
    job: ColorSystemJobV2;
    minimumFamilies: number;
    authority: 'teul-policy-evidence';
    evidenceIds: readonly string[];
  }[];
  evidenceIds: readonly string[];
}

export interface ColorSystemGeneratedDivergingPolarityV2 {
  policyVersion: 'teul-owner-confirmed-generated-diverging-semantics/v1';
  negativeContributionId: string;
  positiveContributionId: string;
  authority: 'owner-confirmed';
  evidenceIds: readonly string[];
}

export type ColorSystemBrandTerritoryStatusV2 = 'allowed' | 'limited' | 'excluded';
export type ColorSystemFamilyProminenceV2 = 'supporting' | 'accent' | 'leading';

export interface ColorSystemBrandTerritoryV2 {
  territoryId: string;
  label: string;
  status: ColorSystemBrandTerritoryStatusV2;
  allowedJobs: readonly ColorSystemJobV2[];
  allowedProminence: readonly ColorSystemFamilyProminenceV2[];
  appliesToProminence: readonly ColorSystemFamilyProminenceV2[];
  perceptualBounds: {
    hueRanges: readonly Readonly<{ minimum: number; maximum: number }>[];
    chroma: Readonly<{ minimum: number; maximum: number }>;
    lightness: Readonly<{ minimum: number; maximum: number }>;
  };
  evidenceIds: readonly string[];
}

export interface ColorSystemBrandFitProfileV2 {
  version: 'teul-brand-fit-profile/v2';
  territories: readonly ColorSystemBrandTerritoryV2[];
  evidenceIds: readonly string[];
  profileHash: string;
}

export interface ColorSystemPreservedColorV2 {
  stableColorId: string;
  displayName: string;
  section: ColorSystemSectionRoleV2;
  order: number;
  valuesByMode: Readonly<Record<string, ColorSystemColorValueV2>>;
  evidenceIds: readonly string[];
}

/**
 * Exact source evidence admitted for derivation only. These colors are hash-bound
 * into the brief but are never preserved tokens, output colors, or Primary locks.
 */
export interface ColorSystemSourceReferenceColorV2 {
  stableColorId: string;
  displayName: string;
  sourceSection: ColorSystemSectionRoleV2;
  sourceOrder: number;
  valuesByMode: Readonly<Record<string, ColorSystemColorValueV2>>;
  applicationRoles?: readonly ('diverging-negative' | 'diverging-positive')[];
  evidenceIds: readonly string[];
}

export interface ColorSystemExactPrimaryLockV2 {
  version: 'teul-exact-primary-lock/v2';
  lockId: string;
  stableColorId: string;
  sourcePath: string;
  mode: string;
  expectedValue: ColorSystemColorValueV2;
  aliasTargetId?: string;
  evidenceIds: readonly string[];
  lockHash: string;
}

export interface ColorSystemBuilderBriefV2 {
  version: typeof COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION;
  policyVersion: typeof COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION;
  sourceHash: string;
  sourcePackageHash: string;
  brandFitProfileHash: string;
  brandFitProfile: ColorSystemBrandFitProfileV2;
  presentationProfileHash: string;
  sections: readonly [
    ColorSystemSectionIntentV2,
    ColorSystemSectionIntentV2,
    ColorSystemSectionIntentV2,
    ColorSystemSectionIntentV2,
    ColorSystemSectionIntentV2,
  ];
  preservedColors: readonly ColorSystemPreservedColorV2[];
  sourceReferenceColors: readonly ColorSystemSourceReferenceColorV2[];
  primaryLocks: readonly ColorSystemExactPrimaryLockV2[];
  primaryLockIds: readonly string[];
  secondaryTargetPolicy: ColorSystemSecondaryTargetPolicyV2;
  secondaryTargetFamilyCount: number;
  requiredSecondaryJobs: readonly ColorSystemJobV2[];
  /** Present only when an owner assigned semantic polarity to generated contributions. */
  divergingPolarity?: ColorSystemGeneratedDivergingPolarityV2;
  briefHash: string;
}

export type ColorSystemFamilyShapeV2 =
  | {
      kind: 'named-base-light-pair';
      baseMemberId: string;
      lightMemberId: string;
    }
  | {
      kind: 'full-light-dark-scale';
      stepCount: 12;
    };

export type ColorSystemFamilyMemberProvenanceV2 =
  | {
      kind: 'source-preserved';
      sourceColorIds: readonly string[];
      evidenceIds: readonly string[];
    }
  | {
      kind: 'teul-generated';
      authority: 'teul-proposal';
      algorithmVersion: string;
      seedId: string;
      directionId: string;
      hueOffsetDegrees: number;
      requestedOklchByMode: Readonly<Record<string, Readonly<{ l: number; c: number; h: number }>>>;
      mappedOklchByMode: Readonly<Record<string, Readonly<{ l: number; c: number; h: number }>>>;
      gamutMapping: 'local-minde-v1';
      sourceColorIds: readonly string[];
      evidenceIds: readonly string[];
    };

export interface ColorSystemFamilyMemberV2 {
  stableMemberId: string;
  displayName: string;
  role: string;
  order: number;
  valuesByMode: Readonly<Record<string, ColorSystemColorValueV2>>;
  provenance: ColorSystemFamilyMemberProvenanceV2;
}

export interface ColorSystemSecondaryFamilyV2 {
  stableFamilyId: string;
  displayName: string;
  order: number;
  /** Unique reviewed assembly contribution this family satisfies; prevents filler families. */
  contributionId: string;
  shape: ColorSystemFamilyShapeV2;
  brandFit: {
    territoryId: string;
    prominence: ColorSystemFamilyProminenceV2;
    evidenceIds: readonly string[];
  };
  members: readonly ColorSystemFamilyMemberV2[];
}

export type ColorSystemSecondarySystemShapeV2 =
  | 'named-base-light-pairs'
  | 'full-light-dark-scales'
  | 'source-derived-mix';

/** Stable downstream identity. Indices and literal fallback colors are forbidden. */
export interface ColorSystemApprovedColorRefV2 {
  familyId: string;
  memberId: string;
  mode: string;
}

/**
 * The only authority for assigning an approved Secondary member/mode to a job.
 * Family existence alone never grants downstream application eligibility.
 */
export interface ColorSystemMemberModeJobEligibilityV2 {
  ref: ColorSystemApprovedColorRefV2;
  jobs: readonly ColorSystemJobV2[];
  authority: 'teul-policy-evidence';
  evidenceIds: readonly string[];
}

export type ColorSystemApplicationColorRefV2 =
  | {
      kind: 'approved-family-member';
      ref: ColorSystemApprovedColorRefV2;
    }
  | {
      kind: 'preserved-source-color';
      stableColorId: string;
      mode: string;
    };

export type ColorSystemProductGraphicsJobV2 =
  | 'product-graphic'
  | 'functional-iconography'
  | 'product-ui-surface';

export interface ColorSystemProductGraphicsDerivationV2 {
  id: string;
  job: ColorSystemProductGraphicsJobV2;
  order: number;
  sourceRefs: readonly ColorSystemApprovedColorRefV2[];
  transform:
    | { kind: 'identity' }
    | {
        kind: 'alpha';
        alpha: number;
      };
}

export type ColorSystemDataVisualizationKindV2 = 'categorical' | 'sequential' | 'diverging';

export interface ColorSystemDataVisualizationMarkV2 {
  order: number;
  label: string;
  ref: ColorSystemApprovedColorRefV2;
}

export interface ColorSystemDataVisualizationSelectionV2 {
  id: string;
  kind: ColorSystemDataVisualizationKindV2;
  contextHash: string;
  marks: readonly ColorSystemDataVisualizationMarkV2[];
  evaluationHash: string;
}

export type ColorSystemTypographyUseCategoryV2 =
  | 'primary-body'
  | 'supporting-body'
  | 'large-heading'
  | 'reverse-body';

export type ColorSystemRenderedPairRequirementV2 =
  | 'normal-text-aa'
  | 'large-text-aa'
  | 'non-text-aa';

export interface ColorSystemTypographySpecimenV2 {
  id: string;
  useCategory: ColorSystemTypographyUseCategoryV2;
  requiredLevel: ColorSystemRenderedPairRequirementV2;
  foreground: ColorSystemApplicationColorRefV2;
  background: ColorSystemApplicationColorRefV2;
  mode: string;
  ratio: number;
  threshold: 3 | 4.5;
  pass: boolean;
  evidenceId: string;
}

export interface ColorSystemSectionRatingDimensionV2 {
  id: string;
  label: string;
  measuredValue: number;
  threshold?: number;
  unit: string;
  evidenceIds: readonly string[];
}

export interface ColorSystemSectionRatingV2 {
  section: ColorSystemSectionRoleV2;
  dimensions: readonly ColorSystemSectionRatingDimensionV2[];
  limitation: string;
}

export interface ColorSystemCandidateExplanationV2 {
  summary: string;
  intendedUses: readonly string[];
  excludedUses: readonly string[];
  tradeoffs: readonly string[];
}

export interface ColorSystemStrategyBlockerV2 {
  code:
    | 'MISSING_REQUIRED_JOB'
    | 'FAMILY_TARGET_UNDERFILLED'
    | 'NO_VALID_FAMILY_SET'
    | 'BRAND_FIT_EVIDENCE_INSUFFICIENT';
  message: string;
  job?: ColorSystemJobV2;
}

export interface ColorSystemSecondaryCompositionReceiptV2 {
  policyVersion: 'teul-secondary-composition/v1';
  maximumLeadingFamilies: 1;
  leadingFamilyIds: readonly string[];
  accentFamilyIds: readonly string[];
  supportingFamilyIds: readonly string[];
  evidenceIds: readonly string[];
  compositionHash: string;
}

export interface ColorSystemStrategyCandidateV2 {
  version: typeof COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION;
  policyVersion: typeof COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION;
  id: string;
  label: string;
  status: 'complete' | 'underfilled';
  targetFamilyCount: number;
  actualFamilyCount: number;
  systemShape: ColorSystemSecondarySystemShapeV2;
  requiredJobs: readonly ColorSystemJobV2[];
  missingJobs: readonly ColorSystemJobV2[];
  families: readonly ColorSystemSecondaryFamilyV2[];
  jobEligibility: readonly ColorSystemMemberModeJobEligibilityV2[];
  /** Measurements of the Secondary proposal only; downstream ratings belong to application evidence. */
  measures: readonly ColorSystemSectionRatingDimensionV2[];
  compositionReceipt: ColorSystemSecondaryCompositionReceiptV2;
  explanation: ColorSystemCandidateExplanationV2;
  blockers: readonly ColorSystemStrategyBlockerV2[];
  /** Sorted set identity of value-only family hashes, excluding order, labels, roles, and IDs. */
  actualSystemHash: string;
  candidateHash: string;
}

export interface ColorSystemStrategySetV2 {
  version: typeof COLOR_SYSTEM_STRATEGY_SET_V2_SCHEMA_VERSION;
  policyVersion: typeof COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION;
  sourceHash: string;
  sourcePackageHash: string;
  briefHash: string;
  status: 'ready' | 'no-solution';
  candidates: readonly ColorSystemStrategyCandidateV2[];
  blockers: readonly ColorSystemStrategyBlockerV2[];
  strategySetHash: string;
}

export type ColorSystemCardBoundaryV2 =
  | { kind: 'none' }
  | {
      kind: 'monochrome-inside-1px';
      color: '#000000' | '#FFFFFF';
    };

export interface ColorSystemRoleFrameRecipeV2 {
  role: ColorSystemSectionRoleV2;
  order: number;
  disposition: ColorSystemSectionDispositionV2;
  title: string;
  guidance: string;
  colorRefs: readonly ColorSystemApplicationColorRefV2[];
  exampleIds: readonly string[];
  ratingSection: ColorSystemSectionRoleV2;
  cardBoundary: ColorSystemCardBoundaryV2;
}
