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
  /**
   * p3-H. The family ceiling follows from the resource ceilings below, not the
   * other way round. Each family is 12 primitive Variables (one per step, both
   * modes on one Variable): 24 families × 12 steps = 288 primitives, which leaves
   * 512 − 288 = 224 Variables for exact `source/<name>` primitives and aliases
   * (aliases are capped at 128, so up to 96 preserved source colors fit beside a
   * full alias set). 24 families × 2 modes = 48 family-mode component variants.
   * Paint Styles stay far below 1,024 because only anchors and semantic aliases
   * receive one. A palette with more owned hues than 23 (the ceiling less the
   * neutral ramp) fails closed with a plain blocker; owned hues are never dropped.
   */
  maximumSecondaryFamilyTarget: 24,
  maximumMembersPerFamily: 12,
  maximumModes: 4,
  maximumProductGraphicsDerivations: 64,
  maximumDataVisualizationSelections: 8,
  minimumDataVisualizationMarks: 2,
  maximumDataVisualizationMarks: 9,
  maximumTypographySpecimens: 32,
  maximumTokens: 512,
  maximumAliases: 128,
  /** p3-H: 24 families × 2 scale modes. */
  maximumFamilyModeComponentVariants: 48,
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

/**
 * The three Secondary review directions. The brief may carry one family target
 * per direction; a strategy candidate names the direction it realizes.
 */
export const COLOR_SYSTEM_SECONDARY_DIRECTION_IDS_V2 = [
  'close-harmony',
  'balanced-contrast',
  'wide-spectrum',
] as const;

export type ColorSystemSecondaryDirectionIdV2 =
  (typeof COLOR_SYSTEM_SECONDARY_DIRECTION_IDS_V2)[number];

/** p4-A: why the planner does not offer a review direction. */
export const COLOR_SYSTEM_SECONDARY_DIRECTION_OMISSION_CAUSES_V2 = [
  'family-limit',
  'separation',
  'preserved',
] as const;

export type ColorSystemSecondaryDirectionOmissionCauseV2 =
  (typeof COLOR_SYSTEM_SECONDARY_DIRECTION_OMISSION_CAUSES_V2)[number];

/**
 * p4-A: a review direction the planner does not offer, with the measured reason.
 * Derived (`close-harmony`) is the baseline and is never omitted.
 */
export interface ColorSystemOmittedSecondaryDirectionV2 {
  direction: ColorSystemSecondaryDirectionIdV2;
  cause: ColorSystemSecondaryDirectionOmissionCauseV2;
  reason: string;
}

/**
 * Conventional status reserves: generated families that give a meaning role a
 * conventional hue when the confirmed palette owns no hue in that role's range.
 * Downstream composers recognize them by this contribution-id prefix and may use
 * them for `product-semantics` only, after brand families in range and before a
 * nearest-hue fallback.
 */
export const COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2 =
  'generic-status-reserve-' as const;

export const COLOR_SYSTEM_STATUS_RESERVE_ROLES_V2 = [
  'success',
  'warning',
  'error',
  'information',
] as const;

export type ColorSystemStatusReserveRoleV2 = (typeof COLOR_SYSTEM_STATUS_RESERVE_ROLES_V2)[number];

export interface ColorSystemSecondaryTargetFamilyCountBandV2 {
  minimum: number;
  maximum: number;
}

/**
 * p3-H: a conventional status reserve the planner needed (the palette owns no hue
 * in the role's range) but could not add. `separation`: its realized anchor sat
 * closer than the family separation rule to an existing anchor. `family-limit`:
 * the owned hues, the neutral ramp, and the other reserves already filled the
 * family ceiling. Carried on the brief and its candidates so the review can say
 * why a status role falls back to the nearest hue.
 */
export interface ColorSystemSkippedStatusReserveV2 {
  role: ColorSystemStatusReserveRoleV2;
  contributionId: string;
  /** The conventional centre hue requested, in OKLCH degrees. */
  hue: number;
  realizedHex: string;
  nearestHex: string;
  /** Display name of the anchor the reserve collided with (a family or the neutral ramp). */
  nearestDisplayName: string;
  deltaEOK: number;
  cause: 'separation' | 'family-limit';
  reason: string;
}

/**
 * p5-A: the sections an owner may choose to Replace (`rebuild`). Their recorded
 * colors then ride the brief as `replacedColors`: evidence the review lists, never
 * anchors, `source/<group>/<name>` tokens, or chart marks.
 */
export const COLOR_SYSTEM_REPLACEABLE_SECTION_ROLES_V2 = [
  'secondary',
  'product-graphics',
  'data-visualization',
] as const satisfies readonly ColorSystemSectionRoleV2[];

export type ColorSystemReplaceableSectionRoleV2 =
  (typeof COLOR_SYSTEM_REPLACEABLE_SECTION_ROLES_V2)[number];

/**
 * p5-A: a recorded color of a section the owner chose to Replace. The compiler
 * records it (identity and exact hex per mode) so nothing disappears silently;
 * the planner never sees it, so it is not carried into the new system.
 */
export interface ColorSystemReplacedColorV2 {
  stableColorId: string;
  displayName: string;
  section: ColorSystemReplaceableSectionRoleV2;
  /** Exact six-digit upper-case sRGB hex per mode name, as recorded. */
  hexByMode: Readonly<Record<string, string>>;
}

/**
 * p3-H: an exact observed tint pinned into a generated scale step. The member's
 * value in `mode` is byte-identical to preserved color `sourceColorId`; the other
 * mode keeps its generated value.
 */
export interface ColorSystemFamilyPinnedMemberV2 {
  stableMemberId: string;
  step: number;
  mode: string;
  sourceColorId: string;
  sourceDisplayName: string;
  hex: string;
}

/** p3-H: an observed tint that could not be pinned; the generated step stands and the tint ships as a source token. */
export interface ColorSystemFamilyPinSkipV2 {
  sourceColorId: string;
  sourceDisplayName: string;
  hex: string;
  mode: string;
  /** The step the tint's lightness was nearest to, or null when no step was eligible. */
  nearestStep: number | null;
  reason: string;
}

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
  'governed-source' | 'teul-proposal' | 'teul-policy-evidence';

export interface ColorSystemSectionIntentV2 {
  role: ColorSystemSectionRoleV2;
  order: number;
  disposition: ColorSystemSectionDispositionV2;
  jobs: readonly ColorSystemJobV2[];
  guidance: string;
  evidenceIds: readonly string[];
  confirmation: 'source-evidenced' | 'owner-confirmed' | 'agent-adopted';
}

/** Scoped local adoption of a working plan; never an owner or creation receipt. */
export interface ColorSystemAgentAdoptionV1 {
  version: 'teul-agent-plan-adoption/v1';
  actor: { kind: 'agent'; ref: string };
  authorizationRef: string;
  stage: 'generation-review-export';
  ownerAcceptance: false;
  creationAuthorized: false;
}

export interface ColorSystemColorValueV2 {
  colorSpace: 'srgb';
  /** Display approximation when representation is native-srgb; exact byte value otherwise. */
  hex: string;
  /** Exact normalized sRGB channels retained from source or deterministic mapping. */
  components: Readonly<{ r: number; g: number; b: number }>;
  alpha: number;
  representation?: {
    kind: 'native-srgb';
    /** Hash of exact serialized components/alpha, without perceptual numeric rounding. */
    exactValueHash: string;
  };
}

export interface ColorSystemSecondaryTargetPolicyV2 {
  version: 'teul-secondary-target-policy/v2';
  derivationRule:
    'max-retained-groups-and-job-minima-clamped' | 'teul-generated-contribution-count';
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
  /**
   * The largest reviewed family count across directions; it equals the number of
   * assembly contributions. Without per-direction targets it is every direction's target.
   */
  secondaryTargetFamilyCount: number;
  /**
   * Per-direction family targets derived by the planner from the measured palette
   * and the confirmed jobs. Present together with the band; each value lies inside
   * it and the band maximum equals `secondaryTargetFamilyCount`.
   */
  secondaryTargetFamilyCountByDirection?: Readonly<
    Record<ColorSystemSecondaryDirectionIdV2, number>
  >;
  secondaryTargetFamilyCountBand?: Readonly<ColorSystemSecondaryTargetFamilyCountBandV2>;
  /** The planner's measured reason for each direction's count, for the review copy. */
  secondaryTargetFamilyCountReasonByDirection?: Readonly<
    Record<ColorSystemSecondaryDirectionIdV2, string>
  >;
  requiredSecondaryJobs: readonly ColorSystemJobV2[];
  /** Present only for an explicitly authorized provisional agent working plan. */
  adoption?: ColorSystemAgentAdoptionV1;
  /** Present only when an owner assigned semantic polarity to generated contributions. */
  divergingPolarity?: ColorSystemGeneratedDivergingPolarityV2;
  /** p3-H: present only when the planner needed a status reserve it could not add. */
  skippedStatusReserves?: readonly ColorSystemSkippedStatusReserveV2[];
  /**
   * p4-A: present only when the planner does not offer a review direction because it
   * would realize Derived's family set exactly (the family ceiling left no room for
   * its accent, no accent kept separation, or the Secondary section is preserved).
   * Requires per-direction targets; the omitted direction's target equals Derived's
   * and its entry in `secondaryTargetFamilyCountReasonByDirection` is this reason.
   * The engine builds no candidate for it, so it raises no underfilled blocker.
   */
  secondaryOmittedDirections?: readonly ColorSystemOmittedSecondaryDirectionV2[];
  /**
   * p5-A: present only when a Replace (`rebuild`) section had recorded colors. They
   * are not preserved colors, source references, anchors, tokens, or chart marks;
   * the review lists them with the count so the owner sees what was not carried.
   */
  replacedColors?: readonly ColorSystemReplacedColorV2[];
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
  /** p3-H: present only when an observed tint was pinned into this family's scale. */
  pinnedMembers?: readonly ColorSystemFamilyPinnedMemberV2[];
  /** p3-H: present only when an observed tint of this family could not be pinned. */
  pinSkips?: readonly ColorSystemFamilyPinSkipV2[];
}

export type ColorSystemSecondarySystemShapeV2 =
  'named-base-light-pairs' | 'full-light-dark-scales' | 'source-derived-mix';

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
  'product-graphic' | 'functional-iconography' | 'product-ui-surface';

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
  'primary-body' | 'supporting-body' | 'large-heading' | 'reverse-body';

export type ColorSystemRenderedPairRequirementV2 =
  'normal-text-aa' | 'large-text-aa' | 'non-text-aa';

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
  /** The review direction this candidate realizes; required when the brief carries per-direction targets. */
  direction?: ColorSystemSecondaryDirectionIdV2;
  /** This direction's reviewed target, from the brief (per direction when present). */
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
  /** p3-H: the brief's skipped status reserves, carried so a candidate's review can show them. */
  skippedStatusReserves?: readonly ColorSystemSkippedStatusReserveV2[];
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
