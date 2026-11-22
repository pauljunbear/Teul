import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import {
  COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_BUILDER_V2_LIMITS,
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_REPLACEABLE_SECTION_ROLES_V2,
  COLOR_SYSTEM_SECONDARY_DIRECTION_IDS_V2,
  COLOR_SYSTEM_SECONDARY_DIRECTION_OMISSION_CAUSES_V2,
  COLOR_SYSTEM_SECTION_ROLES_V2,
  COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2,
  COLOR_SYSTEM_STATUS_RESERVE_ROLES_V2,
  COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_STRATEGY_SET_V2_SCHEMA_VERSION,
  type ColorSystemApprovedColorRefV2,
  type ColorSystemAgentAdoptionV1,
  type ColorSystemBrandFitProfileV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemExactPrimaryLockV2,
  type ColorSystemFamilyMemberV2,
  type ColorSystemFamilyPinSkipV2,
  type ColorSystemFamilyPinnedMemberV2,
  type ColorSystemGeneratedDivergingPolarityV2,
  type ColorSystemJobV2,
  type ColorSystemOmittedSecondaryDirectionV2,
  type ColorSystemPreservedColorV2,
  type ColorSystemReplacedColorV2,
  type ColorSystemSecondaryDirectionIdV2,
  type ColorSystemSecondaryFamilyV2,
  type ColorSystemSecondarySystemShapeV2,
  type ColorSystemSectionIntentV2,
  type ColorSystemSectionRatingDimensionV2,
  type ColorSystemSkippedStatusReserveV2,
  type ColorSystemSourceReferenceColorV2,
  type ColorSystemStrategyCandidateV2,
  type ColorSystemStrategySetV2,
} from './colorSystemBuilderV2Contracts';
import { compareText } from './utils';
import {
  colorSystemSrgbToOklchV1,
  normalizeColorSystemSrgbValueV1,
} from './colorSystemSrgbValueV1';
import {
  canonicalizeColorSystemOklchV1,
  colorSystemTerritoryContainsOklchV1,
} from './colorSystemPerceptualBoundsV1';
import {
  COLOR_SYSTEM_JOBS_V2 as JOBS,
  normalizeColorSystemJobsV1,
  normalizeColorSystemPerceptualBoundsV1,
} from './colorSystemBrandGuardsV1';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const DISPOSITIONS = ['preserve', 'rebuild', 'derive', 'omit'] as const;
/**
 * p3-H, p3-J: sections whose recorded colors stay exact `source/<name>` tokens
 * while Teul extends the section around them, so their preserved colors are
 * admitted under `derive` (Extend) as well as `preserve` (Keep). p5-A: under
 * `rebuild` (Replace) the same sections carry nothing; their recorded colors are
 * listed in `replacedColors` instead, and a preserved color there fails closed.
 */
const SECTIONS_KEEPING_SOURCE_COLORS_WHEN_EXTENDED = COLOR_SYSTEM_REPLACEABLE_SECTION_ROLES_V2;
const CONFIRMATIONS = ['source-evidenced', 'owner-confirmed', 'agent-adopted'] as const;
const PROMINENCE = ['supporting', 'accent', 'leading'] as const;
const TERRITORY_STATUSES = ['allowed', 'limited', 'excluded'] as const;
const CANDIDATE_STATUSES = ['complete', 'underfilled'] as const;
const STRATEGY_SET_STATUSES = ['ready', 'no-solution'] as const;
const DIRECTION_IDS = COLOR_SYSTEM_SECONDARY_DIRECTION_IDS_V2;
const OMISSION_CAUSES = COLOR_SYSTEM_SECONDARY_DIRECTION_OMISSION_CAUSES_V2;
const SYSTEM_SHAPES = [
  'named-base-light-pairs',
  'full-light-dark-scales',
  'source-derived-mix',
] as const;
const BLOCKER_CODES = [
  'MISSING_REQUIRED_JOB',
  'FAMILY_TARGET_UNDERFILLED',
  'NO_VALID_FAMILY_SET',
  'BRAND_FIT_EVIDENCE_INSUFFICIENT',
] as const;

export class ColorSystemBuilderV2IntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ColorSystemBuilderV2IntegrityError';
  }
}

type BriefContent = Omit<ColorSystemBuilderBriefV2, 'briefHash'>;
type BriefBuildInput = Omit<BriefContent, 'sourceReferenceColors'> & {
  /** Legacy callers normalize to explicit empty evidence; canonical briefs always retain the field. */
  sourceReferenceColors?: readonly ColorSystemSourceReferenceColorV2[];
};
type BrandFitProfileContent = Omit<ColorSystemBrandFitProfileV2, 'profileHash'>;
type PrimaryLockContent = Omit<ColorSystemExactPrimaryLockV2, 'lockHash'>;
type CandidateInput = Omit<
  ColorSystemStrategyCandidateV2,
  'actualSystemHash' | 'candidateHash' | 'compositionReceipt'
>;
type CandidateContent = Omit<ColorSystemStrategyCandidateV2, 'candidateHash'>;
type StrategySetContent = Omit<ColorSystemStrategySetV2, 'strategySetHash'>;

function fail(message: string): never {
  throw new ColorSystemBuilderV2IntegrityError(message);
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) fail(`${label} must not be empty.`);
  return trimmed;
}

function requireHash(value: string, label: string): string {
  if (!HASH_PATTERN.test(value)) fail(`${label} must be a canonical SHA-256 content hash.`);
  return value;
}

function requireOneOf<const T extends readonly string[]>(
  value: string,
  allowed: T,
  label: string
): T[number] {
  if (!allowed.includes(value as T[number])) {
    fail(`${label} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T[number];
}

function requireKnownKeys(value: object, allowed: readonly string[], label: string): void {
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key));
  if (unexpected.length > 0) {
    fail(`${label} contains unsupported fields: ${unexpected.sort(compareText).join(', ')}.`);
  }
}

function requireIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
}

function requireFiniteInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${label} must be a finite number from ${minimum} through ${maximum}.`);
  }
}

function sortedUniqueStrings(values: readonly string[], label: string): string[] {
  const normalized = values.map((value, index) => requireNonEmpty(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) fail(`${label} must not contain duplicates.`);
  return [...normalized].sort(compareText);
}

function sortedUniqueJobs(values: readonly ColorSystemJobV2[], label: string): ColorSystemJobV2[] {
  return normalizeColorSystemJobsV1(values, label, fail);
}

function requireUniqueIds(values: readonly { readonly id: string }[], label: string): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const id = requireNonEmpty(value.id, `${label}[${index}].id`);
    if (seen.has(id)) fail(`${label} contains duplicate id "${id}".`);
    seen.add(id);
  });
}

function assertContiguousOrder(values: readonly { readonly order: number }[], label: string): void {
  values.forEach((value, index) => {
    if (value.order !== index + 1) {
      fail(`${label} order must be contiguous and start at 1.`);
    }
  });
}

function normalizeColorValue(
  value: ColorSystemColorValueV2,
  label: string
): ColorSystemColorValueV2 {
  try {
    return normalizeColorSystemSrgbValueV1(value);
  } catch (error) {
    fail(`${label}: ${error instanceof Error ? error.message : 'Invalid sRGB value.'}`);
  }
}

function normalizeValuesByMode(
  valuesByMode: Readonly<Record<string, ColorSystemColorValueV2>>,
  label: string
): Readonly<Record<string, ColorSystemColorValueV2>> {
  const modes = Object.keys(valuesByMode).sort(compareText);
  if (modes.length === 0 || modes.length > COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumModes) {
    fail(`${label} must contain 1 through ${COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumModes} modes.`);
  }
  const folded = new Set<string>();
  const normalized: Record<string, ColorSystemColorValueV2> = Object.create(null);
  for (const mode of modes) {
    requireNonEmpty(mode, `${label} mode`);
    const key = mode.toLowerCase();
    if (folded.has(key)) fail(`${label} contains modes that differ only by case.`);
    folded.add(key);
    normalized[mode] = normalizeColorValue(valuesByMode[mode], `${label}.${mode}`);
  }
  return normalized;
}

function sectionRank(role: string): number {
  const rank = COLOR_SYSTEM_SECTION_ROLES_V2.indexOf(
    role as (typeof COLOR_SYSTEM_SECTION_ROLES_V2)[number]
  );
  return rank;
}

function normalizeSectionIntent(
  section: ColorSystemSectionIntentV2,
  expectedOrder: number
): ColorSystemSectionIntentV2 {
  if (section.role !== COLOR_SYSTEM_SECTION_ROLES_V2[expectedOrder - 1]) {
    fail('Builder brief sections must use the canonical five-section role order.');
  }
  if (section.order !== expectedOrder) fail('Builder brief section order must be contiguous.');
  requireOneOf(section.disposition, DISPOSITIONS, `${section.role} disposition`);
  requireOneOf(section.confirmation, CONFIRMATIONS, `${section.role} confirmation`);
  if (section.role === 'primary' && section.disposition !== 'preserve') {
    fail('Primary must remain preserved in the v2 builder brief.');
  }
  return {
    ...section,
    guidance: requireNonEmpty(section.guidance, `${section.role} guidance`),
    jobs: sortedUniqueJobs(section.jobs, `${section.role} jobs`),
    evidenceIds: sortedUniqueStrings(section.evidenceIds, `${section.role} evidenceIds`),
  };
}

function normalizePreservedColor(color: ColorSystemPreservedColorV2): ColorSystemPreservedColorV2 {
  requireNonEmpty(color.stableColorId, 'Preserved color id');
  requireNonEmpty(color.displayName, `${color.stableColorId} displayName`);
  if (sectionRank(color.section) < 0) fail(`${color.stableColorId} has an unknown section.`);
  requireIntegerInRange(color.order, 1, 100_000, `${color.stableColorId} order`);
  return {
    ...color,
    valuesByMode: normalizeValuesByMode(color.valuesByMode, `${color.stableColorId} valuesByMode`),
    evidenceIds: sortedUniqueStrings(color.evidenceIds, `${color.stableColorId} evidenceIds`),
  };
}

function normalizeSourceReferenceColor(
  color: ColorSystemSourceReferenceColorV2
): ColorSystemSourceReferenceColorV2 {
  requireKnownKeys(
    color,
    [
      'stableColorId',
      'displayName',
      'sourceSection',
      'sourceOrder',
      'valuesByMode',
      'applicationRoles',
      'evidenceIds',
    ],
    'Source reference color'
  );
  const stableColorId = requireNonEmpty(color.stableColorId, 'Source reference color id');
  const displayName = requireNonEmpty(color.displayName, `${stableColorId} displayName`);
  if (sectionRank(color.sourceSection) < 0) {
    fail(`${stableColorId} has an unknown source section.`);
  }
  requireIntegerInRange(color.sourceOrder, 1, 100_000, `${stableColorId} sourceOrder`);
  const evidenceIds = sortedUniqueStrings(
    color.evidenceIds,
    `${stableColorId} reference evidenceIds`
  );
  if (evidenceIds.length === 0) fail(`${stableColorId} source reference requires evidence.`);
  const applicationRoles = sortedUniqueStrings(
    color.applicationRoles ?? [],
    `${stableColorId} applicationRoles`
  );
  applicationRoles.forEach((role, index) =>
    requireOneOf(
      role,
      ['diverging-negative', 'diverging-positive'],
      `${stableColorId} applicationRoles[${index}]`
    )
  );
  const normalizedApplicationRoles = applicationRoles as Array<
    'diverging-negative' | 'diverging-positive'
  >;
  return {
    stableColorId,
    displayName,
    sourceSection: color.sourceSection,
    sourceOrder: color.sourceOrder,
    valuesByMode: normalizeValuesByMode(
      color.valuesByMode,
      `${stableColorId} reference valuesByMode`
    ),
    ...(normalizedApplicationRoles.length === 0
      ? {}
      : { applicationRoles: normalizedApplicationRoles }),
    evidenceIds,
  };
}

function normalizePrimaryLockContent(input: PrimaryLockContent): PrimaryLockContent {
  if (input.version !== 'teul-exact-primary-lock/v2') {
    fail('Primary lock is not the supported v2 schema.');
  }
  const lockId = requireNonEmpty(input.lockId, 'Primary lock id');
  const stableColorId = requireNonEmpty(input.stableColorId, `${lockId} stableColorId`);
  const sourcePath = requireNonEmpty(input.sourcePath, `${lockId} sourcePath`);
  const mode = requireNonEmpty(input.mode, `${lockId} mode`);
  const aliasTargetId =
    input.aliasTargetId === undefined
      ? undefined
      : requireNonEmpty(input.aliasTargetId, `${lockId} aliasTargetId`);
  const evidenceIds = sortedUniqueStrings(input.evidenceIds, `${lockId} evidenceIds`);
  if (evidenceIds.length === 0) fail(`${lockId} requires evidence.`);
  return {
    version: 'teul-exact-primary-lock/v2',
    lockId,
    stableColorId,
    sourcePath,
    mode,
    expectedValue: normalizeColorValue(input.expectedValue, `${lockId} expectedValue`),
    ...(aliasTargetId === undefined ? {} : { aliasTargetId }),
    evidenceIds,
  };
}

export function buildColorSystemExactPrimaryLockV2(
  input: PrimaryLockContent
): ColorSystemExactPrimaryLockV2 {
  const content = normalizePrimaryLockContent(input);
  return { ...content, lockHash: deterministicContentHash(content) };
}

function normalizePrimaryLock(lock: ColorSystemExactPrimaryLockV2): ColorSystemExactPrimaryLockV2 {
  requireHash(lock.lockHash, `${lock.lockId} lockHash`);
  const content: PrimaryLockContent = {
    version: lock.version,
    lockId: lock.lockId,
    stableColorId: lock.stableColorId,
    sourcePath: lock.sourcePath,
    mode: lock.mode,
    expectedValue: lock.expectedValue,
    ...(lock.aliasTargetId === undefined ? {} : { aliasTargetId: lock.aliasTargetId }),
    evidenceIds: lock.evidenceIds,
  };
  const rebuilt = buildColorSystemExactPrimaryLockV2(content);
  if (canonicalJson(rebuilt) !== canonicalJson(lock)) {
    fail('Primary lock failed canonical v2 integrity validation.');
  }
  return rebuilt;
}

function normalizeBrandFitProfileContent(input: BrandFitProfileContent): BrandFitProfileContent {
  if (input.version !== 'teul-brand-fit-profile/v2') {
    fail('Brand-fit profile is not the supported v2 schema.');
  }
  const evidenceIds = sortedUniqueStrings(input.evidenceIds, 'brandFitProfile.evidenceIds');
  if (evidenceIds.length === 0) fail('Brand-fit profile requires source evidence.');
  const territories = [...input.territories]
    .map(territory => {
      const territoryId = requireNonEmpty(territory.territoryId, 'Brand territory id');
      requireNonEmpty(territory.label, `${territoryId} label`);
      requireOneOf(territory.status, TERRITORY_STATUSES, `${territoryId} status`);
      const allowedJobs = sortedUniqueJobs(territory.allowedJobs, `${territoryId} allowedJobs`);
      const allowedProminence = sortedUniqueStrings(
        territory.allowedProminence,
        `${territoryId} allowedProminence`
      );
      allowedProminence.forEach((value, index) =>
        requireOneOf(value, PROMINENCE, `${territoryId} allowedProminence[${index}]`)
      );
      const appliesToProminence = sortedUniqueStrings(
        territory.appliesToProminence,
        `${territoryId} appliesToProminence`
      );
      appliesToProminence.forEach((value, index) =>
        requireOneOf(value, PROMINENCE, `${territoryId} appliesToProminence[${index}]`)
      );
      if (appliesToProminence.length === 0) {
        fail(`${territoryId} requires an explicit prominence scope.`);
      }
      const perceptualBounds = normalizeColorSystemPerceptualBoundsV1(
        territory.perceptualBounds,
        territoryId,
        fail
      );
      const territoryEvidence = sortedUniqueStrings(
        territory.evidenceIds,
        `${territoryId} evidenceIds`
      );
      if (territoryEvidence.length === 0) fail(`${territoryId} requires evidence.`);
      if (
        territory.status === 'excluded' &&
        (allowedJobs.length > 0 || allowedProminence.length > 0)
      ) {
        fail(`${territoryId} is excluded and cannot grant jobs or prominence.`);
      }
      if (
        territory.status !== 'excluded' &&
        (allowedJobs.length === 0 || allowedProminence.length === 0)
      ) {
        fail(`${territoryId} must grant at least one job and prominence.`);
      }
      return {
        ...territory,
        territoryId,
        allowedJobs,
        allowedProminence:
          allowedProminence as BrandFitProfileContent['territories'][number]['allowedProminence'],
        appliesToProminence:
          appliesToProminence as BrandFitProfileContent['territories'][number]['appliesToProminence'],
        perceptualBounds,
        evidenceIds: territoryEvidence,
      };
    })
    .sort((left, right) => compareText(left.territoryId, right.territoryId));
  if (territories.length === 0) fail('Brand-fit profile requires at least one territory.');
  if (new Set(territories.map(territory => territory.territoryId)).size !== territories.length) {
    fail('Brand-fit territory identities must be unique.');
  }
  return { ...input, territories, evidenceIds };
}

export function buildColorSystemBrandFitProfileV2(
  input: BrandFitProfileContent
): ColorSystemBrandFitProfileV2 {
  const content = normalizeBrandFitProfileContent(input);
  return { ...content, profileHash: deterministicContentHash(content) };
}

function normalizeBrandFitProfile(
  profile: ColorSystemBrandFitProfileV2
): ColorSystemBrandFitProfileV2 {
  requireHash(profile.profileHash, 'brandFitProfile.profileHash');
  const content: BrandFitProfileContent = {
    version: profile.version,
    territories: profile.territories,
    evidenceIds: profile.evidenceIds,
  };
  const rebuilt = buildColorSystemBrandFitProfileV2(content);
  if (canonicalJson(rebuilt) !== canonicalJson(profile)) {
    fail('Brand-fit profile failed canonical v2 integrity validation.');
  }
  return rebuilt;
}

function normalizeSecondaryTargetPolicy(
  policy: BriefContent['secondaryTargetPolicy'],
  requiredJobs: readonly ColorSystemJobV2[]
): { policy: BriefContent['secondaryTargetPolicy']; derivedTarget: number } {
  requireKnownKeys(
    policy,
    [
      'version',
      'derivationRule',
      'retainedSourceFamilyGroupIds',
      'assemblyContributionIds',
      'jobMinimums',
      'evidenceIds',
    ],
    'secondaryTargetPolicy'
  );
  if (policy.version !== 'teul-secondary-target-policy/v2') {
    fail('Secondary target policy is not the supported schema.');
  }
  if (
    policy.derivationRule !== 'max-retained-groups-and-job-minima-clamped' &&
    policy.derivationRule !== 'teul-generated-contribution-count'
  ) {
    fail('Secondary target policy uses an unsupported derivation rule.');
  }
  const retainedSourceFamilyGroupIds = sortedUniqueStrings(
    policy.retainedSourceFamilyGroupIds,
    'secondaryTarget.retainedSourceFamilyGroupIds'
  );
  if (
    policy.derivationRule === 'max-retained-groups-and-job-minima-clamped' &&
    retainedSourceFamilyGroupIds.length === 0
  ) {
    fail('Secondary target policy requires at least one retained source family group.');
  }
  if (
    policy.derivationRule === 'teul-generated-contribution-count' &&
    retainedSourceFamilyGroupIds.length !== 0
  ) {
    fail('Teul-generated Secondary policy cannot masquerade Primary anchors as source families.');
  }
  const assemblyContributionIds = sortedUniqueStrings(
    policy.assemblyContributionIds,
    'secondaryTarget.assemblyContributionIds'
  );
  const evidenceIds = sortedUniqueStrings(policy.evidenceIds, 'secondaryTarget.evidenceIds');
  if (evidenceIds.length === 0) fail('Secondary target policy requires evidence.');
  const jobMinimums = [...policy.jobMinimums]
    .map(entry => {
      requireOneOf(entry.job, JOBS, 'secondaryTarget job');
      requireIntegerInRange(
        entry.minimumFamilies,
        1,
        COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget,
        `${entry.job} minimumFamilies`
      );
      const entryEvidence = sortedUniqueStrings(
        entry.evidenceIds,
        `${entry.job} target evidenceIds`
      );
      if (entryEvidence.length === 0) fail(`${entry.job} target minimum requires evidence.`);
      if (entry.authority !== 'teul-policy-evidence') {
        fail(`${entry.job} target minimum must be labeled as Teul policy evidence.`);
      }
      return { ...entry, authority: 'teul-policy-evidence' as const, evidenceIds: entryEvidence };
    })
    .sort((left, right) => compareText(left.job, right.job));
  if (new Set(jobMinimums.map(entry => entry.job)).size !== jobMinimums.length) {
    fail('Secondary target job minima must have unique jobs.');
  }
  const minimumByJob = new Map(jobMinimums.map(entry => [entry.job, entry.minimumFamilies]));
  requiredJobs.forEach(job => {
    if (!minimumByJob.has(job)) fail(`Secondary target policy is missing a minimum for ${job}.`);
  });
  jobMinimums.forEach(entry => {
    if (!requiredJobs.includes(entry.job)) {
      fail(`Secondary target policy includes undeclared job ${entry.job}.`);
    }
  });
  const rawTarget =
    policy.derivationRule === 'teul-generated-contribution-count'
      ? assemblyContributionIds.length
      : Math.max(
          COLOR_SYSTEM_BUILDER_V2_LIMITS.minimumSecondaryFamilyTarget,
          retainedSourceFamilyGroupIds.length,
          ...jobMinimums.map(entry => entry.minimumFamilies)
        );
  const derivedTarget = Math.min(
    COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget,
    rawTarget
  );
  if (assemblyContributionIds.length !== derivedTarget) {
    fail('Secondary assembly contribution count must equal the derived target family count.');
  }
  if (
    policy.derivationRule === 'teul-generated-contribution-count' &&
    (derivedTarget < COLOR_SYSTEM_BUILDER_V2_LIMITS.minimumSecondaryFamilyTarget ||
      jobMinimums.some(entry => entry.minimumFamilies > derivedTarget))
  ) {
    fail('Teul-generated Secondary contributions do not satisfy the bounded target or job minima.');
  }
  return {
    policy: {
      ...policy,
      retainedSourceFamilyGroupIds,
      assemblyContributionIds,
      jobMinimums,
      evidenceIds,
    },
    derivedTarget,
  };
}

function normalizeGeneratedDivergingPolarity(
  value: ColorSystemGeneratedDivergingPolarityV2 | undefined,
  contributionIds: readonly string[]
): ColorSystemGeneratedDivergingPolarityV2 | undefined {
  if (value === undefined) return undefined;
  requireKnownKeys(
    value,
    [
      'policyVersion',
      'negativeContributionId',
      'positiveContributionId',
      'authority',
      'evidenceIds',
    ],
    'divergingPolarity'
  );
  if (
    value.policyVersion !== 'teul-owner-confirmed-generated-diverging-semantics/v1' ||
    value.authority !== 'owner-confirmed'
  ) {
    fail('Generated diverging polarity requires the owner-confirmed v1 policy.');
  }
  const negativeContributionId = requireNonEmpty(
    value.negativeContributionId,
    'divergingPolarity.negativeContributionId'
  );
  const positiveContributionId = requireNonEmpty(
    value.positiveContributionId,
    'divergingPolarity.positiveContributionId'
  );
  if (
    negativeContributionId === positiveContributionId ||
    !contributionIds.includes(negativeContributionId) ||
    !contributionIds.includes(positiveContributionId)
  ) {
    fail('Generated diverging polarity must resolve to two distinct assembly contributions.');
  }
  const evidenceIds = sortedUniqueStrings(value.evidenceIds, 'divergingPolarity.evidenceIds');
  if (evidenceIds.length === 0) fail('Generated diverging polarity requires owner evidence.');
  return {
    policyVersion: 'teul-owner-confirmed-generated-diverging-semantics/v1',
    negativeContributionId,
    positiveContributionId,
    authority: 'owner-confirmed',
    evidenceIds,
  };
}

export function normalizeColorSystemAgentAdoptionV1(value: unknown): ColorSystemAgentAdoptionV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Agent adoption requires an explicit bounded authority record.');
  }
  requireKnownKeys(
    value,
    ['version', 'actor', 'authorizationRef', 'stage', 'ownerAcceptance', 'creationAuthorized'],
    'agent adoption'
  );
  const input = value as ColorSystemAgentAdoptionV1;
  if (
    input.version !== 'teul-agent-plan-adoption/v1' ||
    input.stage !== 'generation-review-export' ||
    input.ownerAcceptance !== false ||
    input.creationAuthorized !== false ||
    !input.actor ||
    typeof input.actor !== 'object' ||
    Array.isArray(input.actor) ||
    input.actor.kind !== 'agent'
  ) {
    fail(
      'Agent adoption is limited to generation, review and export, without owner or creation authority.'
    );
  }
  requireKnownKeys(input.actor, ['kind', 'ref'], 'agent adoption actor');
  for (const text of [input.actor.ref, input.authorizationRef]) {
    if (typeof text !== 'string' || !text.length || text.length > 500 || text.trim() !== text) {
      fail('Agent adoption requires bounded actor and authorization references.');
    }
  }
  return {
    version: input.version,
    actor: { kind: 'agent', ref: input.actor.ref },
    authorizationRef: input.authorizationRef,
    stage: input.stage,
    ownerAcceptance: false,
    creationAuthorized: false,
  };
}

function normalizedBriefContent(input: BriefBuildInput): BriefContent {
  if (input.version !== COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION) {
    fail('Builder brief is not the supported v2 schema.');
  }
  if (input.policyVersion !== COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION) {
    fail('Builder brief policy version is not supported.');
  }
  requireHash(input.sourceHash, 'sourceHash');
  requireHash(input.sourcePackageHash, 'sourcePackageHash');
  requireHash(input.brandFitProfileHash, 'brandFitProfileHash');
  const brandFitProfile = normalizeBrandFitProfile(input.brandFitProfile);
  if (input.brandFitProfileHash !== brandFitProfile.profileHash) {
    fail('brandFitProfileHash must match the retained structured profile.');
  }
  requireHash(input.presentationProfileHash, 'presentationProfileHash');
  requireIntegerInRange(
    input.secondaryTargetFamilyCount,
    COLOR_SYSTEM_BUILDER_V2_LIMITS.minimumSecondaryFamilyTarget,
    COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget,
    'secondaryTargetFamilyCount'
  );
  if (input.sections.length !== COLOR_SYSTEM_BUILDER_V2_LIMITS.sectionCount) {
    fail('Builder brief must contain exactly five sections.');
  }
  const sections = input.sections.map((section, index) =>
    normalizeSectionIntent(section, index + 1)
  ) as unknown as BriefContent['sections'];
  const adoption =
    input.adoption === undefined ? undefined : normalizeColorSystemAgentAdoptionV1(input.adoption);
  if (
    adoption
      ? sections.some(section => section.confirmation !== 'agent-adopted')
      : sections.some(section => section.confirmation === 'agent-adopted')
  ) {
    fail(
      'Agent-adopted sections require one explicit adoption record and cannot mix owner authority.'
    );
  }
  if (adoption && input.divergingPolarity) {
    fail('Agent adoption cannot synthesize owner-confirmed diverging polarity.');
  }
  const preservedColors = input.preservedColors
    .map(normalizePreservedColor)
    .sort(
      (left, right) =>
        sectionRank(left.section) - sectionRank(right.section) ||
        left.order - right.order ||
        compareText(left.stableColorId, right.stableColorId)
    );
  const preservedIds = preservedColors.map(color => color.stableColorId);
  if (new Set(preservedIds).size !== preservedIds.length) {
    fail('Preserved colors must have unique stable identities.');
  }
  const dispositionBySection = new Map(
    sections.map(section => [section.role, section.disposition] as const)
  );
  preservedColors.forEach(color => {
    // p3-H: an extended (`derive`) Secondary section keeps every recorded value as an
    // exact source token while Teul extends the system around them, so Secondary
    // preserved colors are admitted under that disposition too. p3-J: recorded
    // product-graphics and data-visualization colors ride the same way, exact and in
    // recorded order, for the composer to reproduce by value. p5-A: a replaced
    // (`rebuild`) section carries none of its recorded colors; they belong in
    // `replacedColors`. Every other section preserves colors only when it is itself
    // preserved.
    const disposition = dispositionBySection.get(color.section);
    const replaceable = SECTIONS_KEEPING_SOURCE_COLORS_WHEN_EXTENDED.some(
      section => section === color.section
    );
    if (replaceable && disposition === 'rebuild') {
      fail(
        `${color.stableColorId} cannot be preserved because its section is replaced; list it in replacedColors instead.`
      );
    }
    const admitted = disposition === 'preserve' || (replaceable && disposition === 'derive');
    if (!admitted) {
      fail(
        `${color.stableColorId} cannot be preserved because its section is not dispositioned preserve.`
      );
    }
  });
  const sourceReferenceColors = [...(input.sourceReferenceColors ?? [])]
    .map(normalizeSourceReferenceColor)
    .sort(
      (left, right) =>
        sectionRank(left.sourceSection) - sectionRank(right.sourceSection) ||
        left.sourceOrder - right.sourceOrder ||
        compareText(left.stableColorId, right.stableColorId)
    );
  const sourceReferenceIds = sourceReferenceColors.map(color => color.stableColorId);
  if (new Set(sourceReferenceIds).size !== sourceReferenceIds.length) {
    fail('Source reference colors must have unique stable identities.');
  }
  const allSourceIds = [...preservedIds, ...sourceReferenceIds];
  if (new Set(allSourceIds).size !== allSourceIds.length) {
    fail('Preserved and source reference colors must not share stable identities.');
  }
  const primaryLocks = input.primaryLocks
    .map(normalizePrimaryLock)
    .sort((left, right) => compareText(left.lockId, right.lockId));
  if (primaryLocks.length === 0) fail('Builder brief requires at least one Primary lock.');
  if (new Set(primaryLocks.map(lock => lock.lockId)).size !== primaryLocks.length) {
    fail('Primary locks must have unique lock identities.');
  }
  const primaryLockIds = sortedUniqueStrings(input.primaryLockIds, 'primaryLockIds');
  const preservedById = new Map(preservedColors.map(color => [color.stableColorId, color]));
  if (
    canonicalJson(primaryLockIds) !==
    canonicalJson(primaryLocks.map(lock => lock.lockId).sort(compareText))
  ) {
    fail('primaryLockIds must exactly match the retained Primary lock receipts.');
  }
  for (const lock of primaryLocks) {
    const color = preservedById.get(lock.stableColorId);
    if (!color || color.section !== 'primary') {
      fail(`Primary lock "${lock.lockId}" must resolve to a preserved Primary color.`);
    }
    const expected = color.valuesByMode[lock.mode];
    if (!expected || canonicalJson(expected) !== canonicalJson(lock.expectedValue)) {
      fail(`Primary lock "${lock.lockId}" does not match its exact source mode value.`);
    }
  }
  const requiredSecondaryJobs = sortedUniqueJobs(
    input.requiredSecondaryJobs,
    'requiredSecondaryJobs'
  );
  if (requiredSecondaryJobs.length === 0) fail('At least one Secondary job is required.');
  const targetPolicy = normalizeSecondaryTargetPolicy(
    input.secondaryTargetPolicy,
    requiredSecondaryJobs
  );
  if (input.secondaryTargetFamilyCount !== targetPolicy.derivedTarget) {
    fail(
      'secondaryTargetFamilyCount must be derived from retained source groups and per-job minima.'
    );
  }
  const perDirection = normalizePerDirectionTargets(input);
  const divergingPolarity = normalizeGeneratedDivergingPolarity(
    input.divergingPolarity,
    targetPolicy.policy.assemblyContributionIds
  );
  const {
    skippedStatusReserves: rawSkippedStatusReserves,
    secondaryOmittedDirections: rawOmittedDirections,
    replacedColors: rawReplacedColors,
    ...rest
  } = input;
  const skippedStatusReserves = normalizeSkippedStatusReserves(
    rawSkippedStatusReserves,
    targetPolicy.policy.assemblyContributionIds,
    'brief.skippedStatusReserves'
  );
  const secondaryOmittedDirections = normalizeOmittedDirections(rawOmittedDirections, perDirection);
  // p5-A: recorded colors of Replace sections, evidence only; disjoint from every source id.
  const replacedColors = normalizeReplacedColors(rawReplacedColors, dispositionBySection, [
    ...preservedIds,
    ...sourceReferenceIds,
  ]);
  return {
    ...rest,
    ...(adoption ? { adoption } : {}),
    brandFitProfile,
    sections,
    preservedColors,
    sourceReferenceColors,
    primaryLocks,
    primaryLockIds,
    secondaryTargetPolicy: targetPolicy.policy,
    ...perDirection,
    requiredSecondaryJobs,
    ...(divergingPolarity ? { divergingPolarity } : {}),
    ...(skippedStatusReserves ? { skippedStatusReserves } : {}),
    ...(secondaryOmittedDirections ? { secondaryOmittedDirections } : {}),
    ...(replacedColors ? { replacedColors } : {}),
  };
}

/**
 * p5-A. Recorded colors of a section the owner chose to Replace. Each names a
 * replaceable section whose confirmed disposition is `rebuild`, carries at least
 * one exact hex per mode, and shares no identity with a preserved or source
 * reference color (it is evidence, never a source). Absent when empty, so briefs
 * without a Replace section hash exactly as before.
 */
function normalizeReplacedColors(
  value: readonly ColorSystemReplacedColorV2[] | undefined,
  dispositionBySection: ReadonlyMap<string, string>,
  sourceIds: readonly string[]
): ColorSystemReplacedColorV2[] | undefined {
  if (value === undefined || value.length === 0) return undefined;
  const label = 'brief.replacedColors';
  const normalized = value.map((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    requireKnownKeys(entry, ['stableColorId', 'displayName', 'section', 'hexByMode'], entryLabel);
    const stableColorId = requireNonEmpty(entry.stableColorId, `${entryLabel}.stableColorId`);
    const displayName = requireNonEmpty(entry.displayName, `${entryLabel}.displayName`);
    const section = requireOneOf(
      entry.section,
      COLOR_SYSTEM_REPLACEABLE_SECTION_ROLES_V2,
      `${entryLabel}.section`
    );
    if (dispositionBySection.get(section) !== 'rebuild') {
      fail(`${entryLabel} names section ${section}, which is not dispositioned rebuild.`);
    }
    if (sourceIds.includes(stableColorId)) {
      fail(`${entryLabel} shares identity ${stableColorId} with a preserved or source color.`);
    }
    const modes = Object.keys(entry.hexByMode ?? {});
    if (modes.length === 0) fail(`${entryLabel}.hexByMode must carry at least one mode.`);
    const hexByMode = Object.fromEntries(
      modes.sort(compareText).map(mode => {
        const hex = entry.hexByMode[mode];
        if (typeof hex !== 'string' || !HEX_PATTERN.test(hex)) {
          fail(`${entryLabel}.hexByMode.${mode} must be six-digit hex.`);
        }
        return [requireNonEmpty(mode, `${entryLabel}.hexByMode mode`), hex.toUpperCase()];
      })
    );
    return { stableColorId, displayName, section, hexByMode };
  });
  if (new Set(normalized.map(entry => entry.stableColorId)).size !== normalized.length) {
    fail(`${label} must have unique stable identities.`);
  }
  return normalized.sort(
    (left, right) =>
      sectionRank(left.section) - sectionRank(right.section) ||
      compareText(left.displayName, right.displayName) ||
      compareText(left.stableColorId, right.stableColorId)
  );
}

/**
 * p3-H. Skipped status reserves are evidence, not families: each names a status
 * role, its reserve contribution (which must not be among the assembly
 * contributions, since it was not added), the anchor it collided with, and a
 * cause. An empty list canonicalizes to absence so briefs without skips hash as
 * before.
 */
function normalizeSkippedStatusReserves(
  value: readonly ColorSystemSkippedStatusReserveV2[] | undefined,
  assemblyContributionIds: readonly string[],
  label: string
): ColorSystemSkippedStatusReserveV2[] | undefined {
  if (value === undefined || value.length === 0) return undefined;
  const normalized = value.map((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    requireKnownKeys(
      entry,
      [
        'role',
        'contributionId',
        'hue',
        'realizedHex',
        'nearestHex',
        'nearestDisplayName',
        'deltaEOK',
        'cause',
        'reason',
      ],
      entryLabel
    );
    requireOneOf(entry.role, COLOR_SYSTEM_STATUS_RESERVE_ROLES_V2, `${entryLabel}.role`);
    const contributionId = requireNonEmpty(entry.contributionId, `${entryLabel}.contributionId`);
    if (contributionId !== `${COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2}${entry.role}`) {
      fail(`${entryLabel}.contributionId must be the reserve contribution for ${entry.role}.`);
    }
    if (assemblyContributionIds.includes(contributionId)) {
      fail(`${entryLabel} names a reserve that the assembly contributions still include.`);
    }
    requireFiniteInRange(entry.hue, 0, 360, `${entryLabel}.hue`);
    if (!HEX_PATTERN.test(entry.realizedHex))
      fail(`${entryLabel}.realizedHex must be six-digit hex.`);
    if (!HEX_PATTERN.test(entry.nearestHex))
      fail(`${entryLabel}.nearestHex must be six-digit hex.`);
    requireNonEmpty(entry.nearestDisplayName, `${entryLabel}.nearestDisplayName`);
    requireFiniteInRange(entry.deltaEOK, 0, 2, `${entryLabel}.deltaEOK`);
    requireOneOf(entry.cause, ['separation', 'family-limit'], `${entryLabel}.cause`);
    requireNonEmpty(entry.reason, `${entryLabel}.reason`);
    return {
      role: entry.role,
      contributionId,
      hue: entry.hue,
      realizedHex: entry.realizedHex.toUpperCase(),
      nearestHex: entry.nearestHex.toUpperCase(),
      nearestDisplayName: entry.nearestDisplayName,
      deltaEOK: entry.deltaEOK,
      cause: entry.cause,
      reason: entry.reason,
    };
  });
  if (new Set(normalized.map(entry => entry.role)).size !== normalized.length) {
    fail(`${label} must name each status role at most once.`);
  }
  return normalized;
}

/**
 * Per-direction family targets are optional and travel together with their
 * band. Each target lies inside the bounded limits and inside the band; the band
 * is exactly the spread of the targets; its maximum is the brief's largest
 * target, which the assembly contributions already equal. Reasons, when present,
 * name every direction with non-empty measured copy.
 */
function normalizePerDirectionTargets(
  input: BriefBuildInput
): Pick<
  BriefContent,
  | 'secondaryTargetFamilyCountByDirection'
  | 'secondaryTargetFamilyCountBand'
  | 'secondaryTargetFamilyCountReasonByDirection'
> {
  const byDirection = input.secondaryTargetFamilyCountByDirection;
  const band = input.secondaryTargetFamilyCountBand;
  const reasons = input.secondaryTargetFamilyCountReasonByDirection;
  if (byDirection === undefined && band === undefined) {
    if (reasons !== undefined) {
      fail('Per-direction family-count reasons require per-direction targets.');
    }
    return {};
  }
  if (byDirection === undefined || band === undefined) {
    fail('Per-direction family targets and their band must be present together.');
  }
  requireKnownKeys(byDirection, DIRECTION_IDS, 'secondaryTargetFamilyCountByDirection');
  requireKnownKeys(band, ['minimum', 'maximum'], 'secondaryTargetFamilyCountBand');
  const targets = DIRECTION_IDS.map(direction => {
    const value = byDirection[direction];
    if (value === undefined) {
      fail(`secondaryTargetFamilyCountByDirection is missing ${direction}.`);
    }
    requireIntegerInRange(
      value,
      COLOR_SYSTEM_BUILDER_V2_LIMITS.minimumSecondaryFamilyTarget,
      COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget,
      `secondaryTargetFamilyCountByDirection.${direction}`
    );
    return value;
  });
  requireIntegerInRange(
    band.minimum,
    COLOR_SYSTEM_BUILDER_V2_LIMITS.minimumSecondaryFamilyTarget,
    COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget,
    'secondaryTargetFamilyCountBand.minimum'
  );
  requireIntegerInRange(
    band.maximum,
    COLOR_SYSTEM_BUILDER_V2_LIMITS.minimumSecondaryFamilyTarget,
    COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget,
    'secondaryTargetFamilyCountBand.maximum'
  );
  if (band.minimum !== Math.min(...targets) || band.maximum !== Math.max(...targets)) {
    fail('secondaryTargetFamilyCountBand must span exactly the per-direction targets.');
  }
  if (band.maximum !== input.secondaryTargetFamilyCount) {
    fail(
      'secondaryTargetFamilyCount must equal the largest per-direction target, which the assembly contributions realize.'
    );
  }
  let normalizedReasons: Record<ColorSystemSecondaryDirectionIdV2, string> | undefined;
  if (reasons !== undefined) {
    requireKnownKeys(reasons, DIRECTION_IDS, 'secondaryTargetFamilyCountReasonByDirection');
    normalizedReasons = Object.fromEntries(
      DIRECTION_IDS.map(direction => {
        const reason = reasons[direction];
        if (reason === undefined) {
          fail(`secondaryTargetFamilyCountReasonByDirection is missing ${direction}.`);
        }
        return [
          direction,
          requireNonEmpty(reason, `secondaryTargetFamilyCountReasonByDirection.${direction}`),
        ];
      })
    ) as Record<ColorSystemSecondaryDirectionIdV2, string>;
  }
  return {
    secondaryTargetFamilyCountByDirection: Object.fromEntries(
      DIRECTION_IDS.map(direction => [direction, byDirection[direction]])
    ) as Record<ColorSystemSecondaryDirectionIdV2, number>,
    secondaryTargetFamilyCountBand: { minimum: band.minimum, maximum: band.maximum },
    ...(normalizedReasons
      ? { secondaryTargetFamilyCountReasonByDirection: normalizedReasons }
      : {}),
  };
}

/**
 * p4-A. Directions the planner does not offer. Each is a known direction other than
 * Derived, named at most once, with a known cause and a non-empty measured reason.
 * The list requires per-direction targets; an omitted direction adds no family, so
 * its target equals Derived's, and its per-direction reason is the omission
 * statement itself, so the review reads one sentence wherever it looks. An empty
 * list canonicalizes to absence.
 */
function normalizeOmittedDirections(
  input: readonly ColorSystemOmittedSecondaryDirectionV2[] | undefined,
  perDirection: ReturnType<typeof normalizePerDirectionTargets>
): readonly ColorSystemOmittedSecondaryDirectionV2[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) fail('brief.secondaryOmittedDirections must be a list.');
  if (input.length === 0) return undefined;
  const byDirection = perDirection.secondaryTargetFamilyCountByDirection;
  if (!byDirection) fail('Omitted directions require per-direction family targets.');
  const reasons = perDirection.secondaryTargetFamilyCountReasonByDirection;
  const normalized = input.map((entry, index) => {
    const label = `brief.secondaryOmittedDirections[${index}]`;
    requireKnownKeys(entry, ['direction', 'cause', 'reason'], label);
    const direction = requireOneOf(entry.direction, DIRECTION_IDS, `${label}.direction`);
    if (direction === 'close-harmony') {
      fail('The Derived direction (close-harmony) is the baseline and cannot be omitted.');
    }
    const cause = requireOneOf(entry.cause, OMISSION_CAUSES, `${label}.cause`);
    const reason = requireNonEmpty(entry.reason, `${label}.reason`);
    if (byDirection[direction] !== byDirection['close-harmony']) {
      fail(
        `An omitted direction adds no family beyond Derived, so ${direction} must carry Derived's target.`
      );
    }
    if (reasons && reasons[direction] !== reason) {
      fail(`The per-direction reason for omitted ${direction} must be its omission statement.`);
    }
    return { direction, cause, reason };
  });
  if (new Set(normalized.map(entry => entry.direction)).size !== normalized.length) {
    fail('brief.secondaryOmittedDirections must name each direction at most once.');
  }
  return [...normalized].sort(
    (left, right) => DIRECTION_IDS.indexOf(left.direction) - DIRECTION_IDS.indexOf(right.direction)
  );
}

/** The reviewed target for a candidate: its own direction's when the brief carries per-direction targets. */
export function colorSystemBriefTargetFamilyCountV2(
  brief: Pick<
    ColorSystemBuilderBriefV2,
    'secondaryTargetFamilyCount' | 'secondaryTargetFamilyCountByDirection'
  >,
  direction: ColorSystemSecondaryDirectionIdV2 | undefined
): number {
  const byDirection = brief.secondaryTargetFamilyCountByDirection;
  if (!byDirection) return brief.secondaryTargetFamilyCount;
  if (direction === undefined) {
    fail(
      'A candidate must declare its review direction when the brief carries per-direction targets.'
    );
  }
  return byDirection[direction];
}

export function buildColorSystemBuilderBriefV2(input: BriefBuildInput): ColorSystemBuilderBriefV2 {
  const content = normalizedBriefContent(input);
  // An empty evidence collection is the canonical legacy-equivalent state. Non-empty
  // source references are included in full, so every admitted value and receipt is hash-bound.
  const hashContent =
    content.sourceReferenceColors.length === 0
      ? (({ sourceReferenceColors: _empty, ...legacyEquivalent }) => legacyEquivalent)(content)
      : content;
  return { ...content, briefHash: deterministicContentHash(hashContent) };
}

export function assertColorSystemBuilderBriefV2Integrity(brief: ColorSystemBuilderBriefV2): void {
  const { briefHash, ...content } = brief;
  requireHash(briefHash, 'briefHash');
  const rebuilt = buildColorSystemBuilderBriefV2(content);
  if (canonicalJson(rebuilt) !== canonicalJson(brief)) {
    fail('Builder brief failed canonical v2 integrity validation.');
  }
}

function normalizeFamilyMember(
  member: ColorSystemFamilyMemberV2,
  familyId: string,
  preservedIds: ReadonlySet<string>,
  sourceReferenceIds: ReadonlySet<string>
): ColorSystemFamilyMemberV2 {
  requireNonEmpty(member.stableMemberId, `${familyId} member id`);
  requireNonEmpty(member.displayName, `${familyId}/${member.stableMemberId} displayName`);
  requireNonEmpty(member.role, `${familyId}/${member.stableMemberId} role`);
  requireIntegerInRange(member.order, 1, 12, `${familyId}/${member.stableMemberId} order`);
  const provenanceLabel = `${familyId}/${member.stableMemberId} provenance`;
  requireOneOf(
    member.provenance.kind,
    ['source-preserved', 'teul-generated'],
    `${provenanceLabel}.kind`
  );
  const sourceColorIds = sortedUniqueStrings(
    member.provenance.sourceColorIds,
    `${provenanceLabel}.sourceColorIds`
  );
  const evidenceIds = sortedUniqueStrings(
    member.provenance.evidenceIds,
    `${provenanceLabel}.evidenceIds`
  );
  if (sourceColorIds.length === 0 || evidenceIds.length === 0) {
    fail(`${provenanceLabel} requires source colors and evidence.`);
  }
  const valuesByMode = normalizeValuesByMode(
    member.valuesByMode,
    `${familyId}/${member.stableMemberId} valuesByMode`
  );
  let provenance: ColorSystemFamilyMemberV2['provenance'];
  if (member.provenance.kind === 'teul-generated') {
    sourceColorIds.forEach(sourceColorId => {
      if (!preservedIds.has(sourceColorId) && !sourceReferenceIds.has(sourceColorId)) {
        fail(`${provenanceLabel} references unknown source color ${sourceColorId}.`);
      }
    });
    const generatedProvenance = member.provenance;
    requireKnownKeys(
      generatedProvenance,
      [
        'kind',
        'authority',
        'algorithmVersion',
        'seedId',
        'directionId',
        'hueOffsetDegrees',
        'requestedOklchByMode',
        'mappedOklchByMode',
        'gamutMapping',
        'sourceColorIds',
        'evidenceIds',
      ],
      provenanceLabel
    );
    if (generatedProvenance.authority !== 'teul-proposal') {
      fail(`${provenanceLabel} must identify generated values as a Teul proposal.`);
    }
    const algorithmVersion = requireNonEmpty(
      generatedProvenance.algorithmVersion,
      `${provenanceLabel}.algorithmVersion`
    );
    const seedId = requireNonEmpty(generatedProvenance.seedId, `${provenanceLabel}.seedId`);
    const directionId = requireNonEmpty(
      generatedProvenance.directionId,
      `${provenanceLabel}.directionId`
    );
    requireFiniteInRange(
      generatedProvenance.hueOffsetDegrees,
      -360,
      360,
      `${provenanceLabel}.hueOffsetDegrees`
    );
    const modeKeys = Object.keys(valuesByMode).sort(compareText);
    const requestedModeKeys = Object.keys(generatedProvenance.requestedOklchByMode).sort(
      compareText
    );
    const mappedModeKeys = Object.keys(generatedProvenance.mappedOklchByMode).sort(compareText);
    if (
      canonicalJson(modeKeys) !== canonicalJson(requestedModeKeys) ||
      canonicalJson(modeKeys) !== canonicalJson(mappedModeKeys)
    ) {
      fail(`${provenanceLabel} must record requested and mapped OKLCH for every exact mode.`);
    }
    for (const mode of modeKeys) {
      for (const [name, oklch] of [
        ['requestedOklchByMode', generatedProvenance.requestedOklchByMode[mode]],
        ['mappedOklchByMode', generatedProvenance.mappedOklchByMode[mode]],
      ] as const) {
        requireFiniteInRange(oklch.l, 0, 1, `${provenanceLabel}.${name}.${mode}.l`);
        requireFiniteInRange(oklch.c, 0, 0.5, `${provenanceLabel}.${name}.${mode}.c`);
        requireFiniteInRange(oklch.h, 0, 360, `${provenanceLabel}.${name}.${mode}.h`);
      }
    }
    if (generatedProvenance.gamutMapping !== 'local-minde-v1') {
      fail(`${provenanceLabel}.gamutMapping is not supported.`);
    }
    Object.entries(valuesByMode).forEach(([mode, value]) => {
      if (value.alpha !== 1) fail(`${provenanceLabel} generated colors must be opaque.`);
      const observed = colorSystemSrgbToOklchV1(value);
      const mapped = generatedProvenance.mappedOklchByMode[mode];
      const hueDifference = Math.min(
        Math.abs(observed.h - mapped.h),
        360 - Math.abs(observed.h - mapped.h)
      );
      if (
        Math.abs(observed.l - mapped.l) > 0.005 ||
        Math.abs(observed.c - mapped.c) > 0.005 ||
        (observed.c > 0.005 && hueDifference > 2)
      ) {
        fail(`${provenanceLabel}.mappedOklch does not reproduce its exact sRGB value.`);
      }
    });
    provenance = {
      kind: 'teul-generated',
      authority: 'teul-proposal',
      algorithmVersion,
      seedId,
      directionId,
      hueOffsetDegrees: generatedProvenance.hueOffsetDegrees,
      requestedOklchByMode: generatedProvenance.requestedOklchByMode,
      mappedOklchByMode: generatedProvenance.mappedOklchByMode,
      gamutMapping: 'local-minde-v1',
      sourceColorIds,
      evidenceIds,
    };
  } else {
    sourceColorIds.forEach(sourceColorId => {
      if (!preservedIds.has(sourceColorId)) {
        fail(
          `${provenanceLabel} source-preserved provenance must resolve only to preserved output color ${sourceColorId}.`
        );
      }
    });
    requireKnownKeys(member.provenance, ['kind', 'sourceColorIds', 'evidenceIds'], provenanceLabel);
    provenance = { kind: 'source-preserved', sourceColorIds, evidenceIds };
  }
  return {
    ...member,
    valuesByMode,
    provenance,
  };
}

/**
 * p3-H. A pinned member is a generated-scale member whose value in one mode is
 * byte-identical to a preserved color; the record must agree with the member,
 * the step, and the preserved color it names, and the member's provenance must
 * cite that color. A pin skip names a preserved color whose value matches and
 * states why it was not pinned. Empty lists canonicalize to absence.
 */
function normalizeFamilyPins(
  family: ColorSystemSecondaryFamilyV2,
  members: readonly ColorSystemFamilyMemberV2[],
  familyId: string,
  brief: ColorSystemBuilderBriefV2
): {
  pinnedMembers?: ColorSystemFamilyPinnedMemberV2[];
  pinSkips?: ColorSystemFamilyPinSkipV2[];
} {
  const preservedById = new Map(brief.preservedColors.map(color => [color.stableColorId, color]));
  const preservedValue = (
    sourceColorId: string,
    mode: string,
    label: string
  ): ColorSystemColorValueV2 => {
    const preserved = preservedById.get(sourceColorId);
    const value = preserved?.valuesByMode[mode];
    if (!preserved || !value) {
      fail(`${label} does not resolve to a preserved color and mode.`);
    }
    return value;
  };
  let pinnedMembers: ColorSystemFamilyPinnedMemberV2[] | undefined;
  if (family.pinnedMembers !== undefined && family.pinnedMembers.length > 0) {
    pinnedMembers = family.pinnedMembers.map((pin, index) => {
      const label = `${familyId} pinnedMembers[${index}]`;
      requireKnownKeys(
        pin,
        ['stableMemberId', 'step', 'mode', 'sourceColorId', 'sourceDisplayName', 'hex'],
        label
      );
      const member = members.find(candidate => candidate.stableMemberId === pin.stableMemberId);
      if (!member) fail(`${label} names a member this family does not contain.`);
      requireIntegerInRange(pin.step, 1, 12, `${label}.step`);
      if (pin.step === 9 || member.order !== pin.step) {
        fail(`${label} must name a non-anchor step equal to its member's order.`);
      }
      const mode = requireNonEmpty(pin.mode, `${label}.mode`);
      const memberValue = member.valuesByMode[mode];
      if (!memberValue) fail(`${label} names a mode its member does not carry.`);
      if (!HEX_PATTERN.test(pin.hex)) fail(`${label}.hex must be six-digit hex.`);
      const hex = pin.hex.toUpperCase();
      const sourceColorId = requireNonEmpty(pin.sourceColorId, `${label}.sourceColorId`);
      if (
        memberValue.hex.toUpperCase() !== hex ||
        canonicalJson(preservedValue(sourceColorId, mode, label)) !== canonicalJson(memberValue)
      ) {
        fail(`${label} is not byte-identical to its member value and preserved source.`);
      }
      if (!member.provenance.sourceColorIds.includes(sourceColorId)) {
        fail(`${label} member provenance does not cite the pinned source color.`);
      }
      return {
        stableMemberId: member.stableMemberId,
        step: pin.step,
        mode,
        sourceColorId,
        sourceDisplayName: requireNonEmpty(pin.sourceDisplayName, `${label}.sourceDisplayName`),
        hex,
      };
    });
    pinnedMembers.sort((left, right) => left.step - right.step);
    if (new Set(pinnedMembers.map(pin => pin.step)).size !== pinnedMembers.length) {
      fail(`${familyId} pins one step twice.`);
    }
  }
  let pinSkips: ColorSystemFamilyPinSkipV2[] | undefined;
  if (family.pinSkips !== undefined && family.pinSkips.length > 0) {
    pinSkips = family.pinSkips.map((skip, index) => {
      const label = `${familyId} pinSkips[${index}]`;
      requireKnownKeys(
        skip,
        ['sourceColorId', 'sourceDisplayName', 'hex', 'mode', 'nearestStep', 'reason'],
        label
      );
      const sourceColorId = requireNonEmpty(skip.sourceColorId, `${label}.sourceColorId`);
      const mode = requireNonEmpty(skip.mode, `${label}.mode`);
      if (!HEX_PATTERN.test(skip.hex)) fail(`${label}.hex must be six-digit hex.`);
      const hex = skip.hex.toUpperCase();
      if (preservedValue(sourceColorId, mode, label).hex.toUpperCase() !== hex) {
        fail(`${label} hex is not the preserved source value.`);
      }
      if (skip.nearestStep !== null) {
        requireIntegerInRange(skip.nearestStep, 1, 12, `${label}.nearestStep`);
      }
      return {
        sourceColorId,
        sourceDisplayName: requireNonEmpty(skip.sourceDisplayName, `${label}.sourceDisplayName`),
        hex,
        mode,
        nearestStep: skip.nearestStep,
        reason: requireNonEmpty(skip.reason, `${label}.reason`),
      };
    });
    pinSkips.sort(
      (left, right) =>
        compareText(left.sourceColorId, right.sourceColorId) || compareText(left.mode, right.mode)
    );
  }
  return {
    ...(pinnedMembers ? { pinnedMembers } : {}),
    ...(pinSkips ? { pinSkips } : {}),
  };
}

function normalizeFamily(
  family: ColorSystemSecondaryFamilyV2,
  brief: ColorSystemBuilderBriefV2
): ColorSystemSecondaryFamilyV2 {
  requireKnownKeys(
    family,
    [
      'stableFamilyId',
      'displayName',
      'order',
      'contributionId',
      'shape',
      'brandFit',
      'members',
      'pinnedMembers', // p3-H
      'pinSkips', // p3-H
    ],
    'Secondary family'
  );
  const familyId = requireNonEmpty(family.stableFamilyId, 'Family id');
  requireNonEmpty(family.displayName, `${familyId} displayName`);
  const contributionId = requireNonEmpty(family.contributionId, `${familyId} contributionId`);
  if (!brief.secondaryTargetPolicy.assemblyContributionIds.includes(contributionId)) {
    fail(`${familyId} contribution is not declared by the target policy.`);
  }
  // p3-H: family order runs to the family ceiling; member steps stay 1 through 12.
  requireIntegerInRange(
    family.order,
    1,
    COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget,
    `${familyId} order`
  );
  requireOneOf(
    family.shape.kind,
    ['named-base-light-pair', 'full-light-dark-scale'],
    `${familyId} shape.kind`
  );
  if (
    family.members.length === 0 ||
    family.members.length > COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumMembersPerFamily
  ) {
    fail(
      `${familyId} must contain 1 through ${COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumMembersPerFamily} members.`
    );
  }
  const members = family.members
    .map(member =>
      normalizeFamilyMember(
        member,
        familyId,
        new Set(brief.preservedColors.map(color => color.stableColorId)),
        new Set(brief.sourceReferenceColors.map(color => color.stableColorId))
      )
    )
    .sort(
      (left, right) =>
        left.order - right.order || compareText(left.stableMemberId, right.stableMemberId)
    );
  assertContiguousOrder(members, `${familyId} members`);
  const memberIds = members.map(member => member.stableMemberId);
  if (new Set(memberIds).size !== memberIds.length)
    fail(`${familyId} contains duplicate member ids.`);
  if (family.shape.kind === 'named-base-light-pair') {
    const shape = family.shape;
    if (members.length !== 2) fail(`${familyId} named pair must contain exactly two members.`);
    if (
      shape.baseMemberId === shape.lightMemberId ||
      !memberIds.includes(shape.baseMemberId) ||
      !memberIds.includes(shape.lightMemberId)
    ) {
      fail(`${familyId} named pair member identities do not resolve exactly.`);
    }
    const base = members.find(member => member.stableMemberId === shape.baseMemberId);
    const light = members.find(member => member.stableMemberId === shape.lightMemberId);
    if (base?.role !== 'base' || light?.role !== 'light') {
      fail(`${familyId} named pair must use explicit base and light member roles.`);
    }
  } else {
    if (family.shape.stepCount !== 12 || members.length !== 12) {
      fail(`${familyId} full scale must contain exactly twelve members.`);
    }
    members.forEach((member, index) => {
      if (member.role !== `step-${index + 1}`) {
        fail(`${familyId} full scale members must use ordered step-1 through step-12 roles.`);
      }
      if (!member.valuesByMode.Light || !member.valuesByMode.Dark) {
        fail(`${familyId} full scale requires exact Light and Dark values for every step.`);
      }
    });
  }
  const territoryId = requireNonEmpty(family.brandFit.territoryId, `${familyId} territoryId`);
  requireOneOf(family.brandFit.prominence, PROMINENCE, `${familyId} prominence`);
  const brandEvidenceIds = sortedUniqueStrings(
    family.brandFit.evidenceIds,
    `${familyId} brandFit evidenceIds`
  );
  if (brandEvidenceIds.length === 0) fail(`${familyId} brand fit requires evidence.`);
  const territory = brief.brandFitProfile.territories.find(
    item => item.territoryId === territoryId
  );
  if (!territory || territory.status === 'excluded') {
    fail(`${familyId} uses an excluded or unknown brand territory.`);
  }
  if (!territory.allowedProminence.includes(family.brandFit.prominence)) {
    fail(`${familyId} brand territory does not permit ${family.brandFit.prominence} prominence.`);
  }
  if (!territory.appliesToProminence.includes(family.brandFit.prominence)) {
    fail(`${familyId} brand territory does not apply to its declared prominence.`);
  }
  const representativeId =
    family.shape.kind === 'named-base-light-pair' ? family.shape.baseMemberId : null;
  const representative =
    representativeId === null
      ? members.find(member => member.role === 'step-9')
      : members.find(member => member.stableMemberId === representativeId);
  if (!representative) fail(`${familyId} has no representative brand-fit member.`);
  const representativeMode = Object.keys(representative.valuesByMode).sort(compareText)[0];
  if (
    !colorSystemTerritoryContainsOklchV1(
      territory,
      canonicalizeColorSystemOklchV1(
        colorSystemSrgbToOklchV1(representative.valuesByMode[representativeMode])
      )
    )
  ) {
    fail(`${familyId} exact representative color is outside its claimed brand territory.`);
  }
  for (const member of members) {
    for (const [mode, value] of Object.entries(member.valuesByMode)) {
      const exactOklch = canonicalizeColorSystemOklchV1(colorSystemSrgbToOklchV1(value));
      const excludedMatch = brief.brandFitProfile.territories.find(
        item =>
          item.status === 'excluded' &&
          item.appliesToProminence.includes(family.brandFit.prominence) &&
          colorSystemTerritoryContainsOklchV1(item, exactOklch)
      );
      if (excludedMatch) {
        fail(
          `${familyId}/${member.stableMemberId}/${mode} enters excluded territory ${excludedMatch.territoryId}.`
        );
      }
    }
  }
  const { pinnedMembers: _rawPinnedMembers, pinSkips: _rawPinSkips, ...rest } = family;
  return {
    ...rest,
    contributionId,
    brandFit: {
      territoryId,
      prominence: family.brandFit.prominence,
      evidenceIds: brandEvidenceIds,
    },
    members,
    ...normalizeFamilyPins(family, members, familyId, brief),
  };
}

function derivedSystemShape(
  families: readonly ColorSystemSecondaryFamilyV2[]
): ColorSystemSecondarySystemShapeV2 {
  const kinds = new Set(families.map(family => family.shape.kind));
  if (kinds.size > 1) return 'source-derived-mix';
  return kinds.has('named-base-light-pair') ? 'named-base-light-pairs' : 'full-light-dark-scales';
}

function actualFamilyHash(family: ColorSystemSecondaryFamilyV2): string {
  const values = family.members
    .flatMap(member =>
      Object.values(member.valuesByMode).map(value => ({
        colorSpace: value.colorSpace,
        hex: value.hex,
        components: value.components,
        alpha: value.alpha,
        ...(value.representation ? { representation: value.representation } : {}),
      }))
    )
    .sort((left, right) => compareText(canonicalJson(left), canonicalJson(right)));
  return deterministicContentHash(values);
}

function actualSystemHash(families: readonly ColorSystemSecondaryFamilyV2[]): string {
  return deterministicContentHash([...families.map(actualFamilyHash)].sort(compareText));
}

function approvedRefIdentity(ref: ColorSystemApprovedColorRefV2): string {
  return `${ref.familyId}\u0000${ref.memberId}\u0000${ref.mode}`;
}

function normalizeJobEligibility(
  brief: ColorSystemBuilderBriefV2,
  families: readonly ColorSystemSecondaryFamilyV2[],
  entries: ColorSystemStrategyCandidateV2['jobEligibility']
): ColorSystemStrategyCandidateV2['jobEligibility'] {
  const familyById = new Map(families.map(family => [family.stableFamilyId, family]));
  const seen = new Set<string>();
  return [...entries]
    .map((entry, index) => {
      const ref = {
        familyId: requireNonEmpty(entry.ref.familyId, `jobEligibility[${index}].familyId`),
        memberId: requireNonEmpty(entry.ref.memberId, `jobEligibility[${index}].memberId`),
        mode: requireNonEmpty(entry.ref.mode, `jobEligibility[${index}].mode`),
      };
      const identity = approvedRefIdentity(ref);
      if (seen.has(identity)) fail('Job eligibility must contain unique member/mode identities.');
      seen.add(identity);
      const family = familyById.get(ref.familyId);
      const member = family?.members.find(item => item.stableMemberId === ref.memberId);
      if (!family || !member?.valuesByMode[ref.mode]) {
        fail(`jobEligibility[${index}] does not resolve to a candidate family member and mode.`);
      }
      const jobs = sortedUniqueJobs(entry.jobs, `jobEligibility[${index}].jobs`);
      if (jobs.length === 0) fail(`jobEligibility[${index}] requires at least one job.`);
      const territory = brief.brandFitProfile.territories.find(
        item => item.territoryId === family.brandFit.territoryId
      );
      jobs.forEach(job => {
        if (!brief.requiredSecondaryJobs.includes(job)) {
          fail(`jobEligibility[${index}] contains undeclared Secondary job ${job}.`);
        }
        if (!territory?.allowedJobs.includes(job)) {
          fail(`${family.stableFamilyId} brand territory does not permit job ${job}.`);
        }
      });
      const evidenceIds = sortedUniqueStrings(
        entry.evidenceIds,
        `jobEligibility[${index}].evidenceIds`
      );
      if (evidenceIds.length === 0) fail(`jobEligibility[${index}] requires evidence.`);
      if (entry.authority !== 'teul-policy-evidence') {
        fail(`jobEligibility[${index}] must be labeled as Teul policy evidence.`);
      }
      return { ref, jobs, authority: 'teul-policy-evidence' as const, evidenceIds };
    })
    .sort((left, right) =>
      compareText(approvedRefIdentity(left.ref), approvedRefIdentity(right.ref))
    );
}

function normalizeSecondaryMeasures(
  measures: readonly ColorSystemSectionRatingDimensionV2[]
): ColorSystemSectionRatingDimensionV2[] {
  if (measures.length === 0) fail('Candidate requires at least one Secondary measure.');
  requireUniqueIds(measures, 'Secondary measures');
  return [...measures]
    .map(measure => {
      requireNonEmpty(measure.label, `${measure.id} label`);
      requireNonEmpty(measure.unit, `${measure.id} unit`);
      if (!Number.isFinite(measure.measuredValue))
        fail(`${measure.id} measuredValue must be finite.`);
      if (measure.threshold !== undefined && !Number.isFinite(measure.threshold)) {
        fail(`${measure.id} threshold must be finite when present.`);
      }
      const evidenceIds = sortedUniqueStrings(measure.evidenceIds, `${measure.id} evidenceIds`);
      if (evidenceIds.length === 0) fail(`${measure.id} requires evidence.`);
      return { ...measure, evidenceIds };
    })
    .sort((left, right) => compareText(left.id, right.id));
}

function buildCompositionReceipt(
  families: readonly ColorSystemSecondaryFamilyV2[]
): ColorSystemStrategyCandidateV2['compositionReceipt'] {
  const byProminence = (prominence: ColorSystemSecondaryFamilyV2['brandFit']['prominence']) =>
    families
      .filter(family => family.brandFit.prominence === prominence)
      .map(family => family.stableFamilyId)
      .sort(compareText);
  const leadingFamilyIds = byProminence('leading');
  if (leadingFamilyIds.length > 1) {
    fail('Secondary composition permits at most one leading family.');
  }
  const accentFamilyIds = byProminence('accent');
  const supportingFamilyIds = byProminence('supporting');
  const evidenceIds = [...new Set(families.flatMap(family => family.brandFit.evidenceIds))].sort(
    compareText
  );
  const content = {
    policyVersion: 'teul-secondary-composition/v1' as const,
    maximumLeadingFamilies: 1 as const,
    leadingFamilyIds,
    accentFamilyIds,
    supportingFamilyIds,
    evidenceIds,
  };
  return { ...content, compositionHash: deterministicContentHash(content) };
}

function normalizedCandidateContent(
  brief: ColorSystemBuilderBriefV2,
  input: CandidateInput
): CandidateInput {
  assertColorSystemBuilderBriefV2Integrity(brief);
  requireKnownKeys(
    input,
    [
      'version',
      'policyVersion',
      'id',
      'label',
      'status',
      'direction',
      'targetFamilyCount',
      'actualFamilyCount',
      'systemShape',
      'requiredJobs',
      'missingJobs',
      'families',
      'jobEligibility',
      'measures',
      'explanation',
      'blockers',
      'skippedStatusReserves', // p3-H
    ],
    'Strategy candidate'
  );
  // p3-H: a candidate carries exactly the brief's skipped reserves or none; it cannot
  // invent, drop, or reword them.
  if (
    canonicalJson(input.skippedStatusReserves ?? null) !==
    canonicalJson(brief.skippedStatusReserves ?? null)
  ) {
    fail('Candidate skipped status reserves must equal the reviewed builder brief.');
  }
  if (input.version !== COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION) {
    fail('Strategy candidate is not the supported v2 schema.');
  }
  if (input.policyVersion !== COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION) {
    fail('Strategy candidate policy version is not supported.');
  }
  requireNonEmpty(input.id, 'Candidate id');
  requireNonEmpty(input.label, `${input.id} label`);
  requireOneOf(input.status, CANDIDATE_STATUSES, `${input.id} status`);
  requireOneOf(input.systemShape, SYSTEM_SHAPES, `${input.id} systemShape`);
  if (input.direction !== undefined) {
    requireOneOf(input.direction, DIRECTION_IDS, `${input.id} direction`);
    // p4-A: an omitted direction has no candidate; one that claims it would present a
    // family set the brief says is not offered.
    if (
      (brief.secondaryOmittedDirections ?? []).some(entry => entry.direction === input.direction)
    ) {
      fail(
        `${input.id} realizes ${input.direction}, a direction the reviewed brief does not offer.`
      );
    }
  }
  const reviewedTarget = colorSystemBriefTargetFamilyCountV2(brief, input.direction);
  if (input.targetFamilyCount !== reviewedTarget) {
    fail(
      brief.secondaryTargetFamilyCountByDirection
        ? `Candidate target family count must equal the reviewed builder brief target for ${input.direction}.`
        : 'Candidate target family count must equal the reviewed builder brief.'
    );
  }
  requireIntegerInRange(
    input.targetFamilyCount,
    COLOR_SYSTEM_BUILDER_V2_LIMITS.minimumSecondaryFamilyTarget,
    COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget,
    'targetFamilyCount'
  );
  const families = input.families
    .map(family => normalizeFamily(family, brief))
    .sort(
      (left, right) =>
        left.order - right.order || compareText(left.stableFamilyId, right.stableFamilyId)
    );
  assertContiguousOrder(families, 'Secondary families');
  if (new Set(families.map(family => family.stableFamilyId)).size !== families.length) {
    fail('Secondary families must have unique stable identities.');
  }
  if (new Set(families.map(family => family.contributionId)).size !== families.length) {
    fail('Every Secondary family must satisfy a unique assembly contribution.');
  }
  if (new Set(families.map(actualFamilyHash)).size !== families.length) {
    fail('Secondary families must be distinct actual color systems, not relabeled duplicates.');
  }
  if (families.length === 0 || families.length > input.targetFamilyCount) {
    fail('A candidate must contain 1 through its target number of families.');
  }
  if (input.actualFamilyCount !== families.length) {
    fail('Candidate actual family count must equal its family collection length.');
  }
  if (input.systemShape !== derivedSystemShape(families)) {
    fail('Candidate system shape must be derived from its family shapes.');
  }
  const requiredJobs = sortedUniqueJobs(input.requiredJobs, `${input.id} requiredJobs`);
  if (canonicalJson(requiredJobs) !== canonicalJson(brief.requiredSecondaryJobs)) {
    fail('Candidate required jobs must equal the reviewed builder brief.');
  }
  const jobEligibility = normalizeJobEligibility(brief, families, input.jobEligibility);
  const coveredJobs = new Set(jobEligibility.flatMap(entry => entry.jobs));
  const computedMissingJobs = requiredJobs.filter(job => !coveredJobs.has(job));
  const missingJobs = sortedUniqueJobs(input.missingJobs, `${input.id} missingJobs`);
  if (canonicalJson(missingJobs) !== canonicalJson(computedMissingJobs)) {
    fail('Candidate missing jobs do not match its actual family coverage.');
  }
  const blockers = [...input.blockers].sort(
    (left, right) =>
      compareText(left.code, right.code) || compareText(left.job ?? '', right.job ?? '')
  );
  blockers.forEach(blocker => {
    requireOneOf(blocker.code, BLOCKER_CODES, `${input.id} blocker code`);
    requireNonEmpty(blocker.message, `${input.id}/${blocker.code} message`);
    if (blocker.job !== undefined) requireOneOf(blocker.job, JOBS, `${input.id} blocker job`);
  });
  const shouldBeComplete =
    families.length === input.targetFamilyCount &&
    missingJobs.length === 0 &&
    blockers.length === 0;
  if ((input.status === 'complete') !== shouldBeComplete) {
    fail('Candidate complete status does not match target, jobs, and blockers.');
  }
  const band = brief.secondaryTargetFamilyCountBand;
  if (
    shouldBeComplete &&
    band &&
    (input.actualFamilyCount < band.minimum || input.actualFamilyCount > band.maximum)
  ) {
    fail('A complete candidate must hold a family count inside the reviewed per-direction band.');
  }
  // p3-H: the token cap counts Variables the way the resource blueprint creates them:
  // one primitive per preserved color and one per family member, each carrying every
  // mode. Counting mode values double-counted every two-mode primitive and would have
  // refused 24 families (24 × 12 × 2 = 576) that the real ceiling admits (288 primitives).
  const tokenCount =
    brief.preservedColors.length +
    families.reduce((count, family) => count + family.members.length, 0);
  const familyModeVariantCount = families.reduce((count, family) => {
    const modes = new Set(family.members.flatMap(member => Object.keys(member.valuesByMode)));
    return count + modes.size;
  }, 0);
  if (tokenCount > COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumTokens) {
    fail('Candidate exceeds the deterministic token resource cap.');
  }
  if (familyModeVariantCount > COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumFamilyModeComponentVariants) {
    fail('Candidate exceeds the family-mode component variant cap.');
  }
  const measures = normalizeSecondaryMeasures(input.measures);
  requireNonEmpty(input.explanation.summary, `${input.id} explanation summary`);
  if (input.explanation.intendedUses.length === 0) {
    fail(`${input.id} explanation requires at least one intended use.`);
  }
  const explanation = {
    summary: input.explanation.summary.trim(),
    intendedUses: input.explanation.intendedUses.map((value, index) =>
      requireNonEmpty(value, `${input.id} intendedUses[${index}]`)
    ),
    excludedUses: input.explanation.excludedUses.map((value, index) =>
      requireNonEmpty(value, `${input.id} excludedUses[${index}]`)
    ),
    tradeoffs: input.explanation.tradeoffs.map((value, index) =>
      requireNonEmpty(value, `${input.id} tradeoffs[${index}]`)
    ),
  };
  return {
    ...input,
    requiredJobs,
    missingJobs,
    families,
    jobEligibility,
    measures,
    explanation,
    blockers,
  };
}

export function buildColorSystemStrategyCandidateV2(
  brief: ColorSystemBuilderBriefV2,
  input: CandidateInput
): ColorSystemStrategyCandidateV2 {
  const normalized = normalizedCandidateContent(brief, input);
  const content: CandidateContent = {
    ...normalized,
    compositionReceipt: buildCompositionReceipt(normalized.families),
    actualSystemHash: actualSystemHash(normalized.families),
  };
  const candidateHash = deterministicContentHash({
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    sourceHash: brief.sourceHash,
    sourcePackageHash: brief.sourcePackageHash,
    briefHash: brief.briefHash,
    candidate: content,
  });
  return { ...content, candidateHash };
}

export function assertColorSystemStrategyCandidateV2Integrity(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2
): void {
  const {
    candidateHash,
    actualSystemHash: suppliedActualSystemHash,
    compositionReceipt: suppliedCompositionReceipt,
    ...input
  } = candidate;
  requireHash(candidateHash, 'candidateHash');
  requireHash(suppliedActualSystemHash, 'actualSystemHash');
  requireHash(suppliedCompositionReceipt.compositionHash, 'compositionReceipt.compositionHash');
  const rebuilt = buildColorSystemStrategyCandidateV2(brief, input);
  if (canonicalJson(rebuilt) !== canonicalJson(candidate)) {
    fail('Strategy candidate failed canonical v2 integrity validation.');
  }
}

export function buildColorSystemStrategySetV2(
  brief: ColorSystemBuilderBriefV2,
  input: Pick<StrategySetContent, 'status' | 'candidates' | 'blockers'>
): ColorSystemStrategySetV2 {
  assertColorSystemBuilderBriefV2Integrity(brief);
  const candidates = [...input.candidates];
  candidates.forEach(candidate => assertColorSystemStrategyCandidateV2Integrity(brief, candidate));
  if (new Set(candidates.map(candidate => candidate.id)).size !== candidates.length) {
    fail('Strategy set candidate identities must be unique.');
  }
  if (new Set(candidates.map(candidate => candidate.actualSystemHash)).size !== candidates.length) {
    fail('Strategy set candidates must be distinct actual color systems.');
  }
  requireOneOf(input.status, STRATEGY_SET_STATUSES, 'Strategy set status');
  if (input.status === 'ready') {
    requireIntegerInRange(
      candidates.length,
      COLOR_SYSTEM_BUILDER_V2_LIMITS.minimumCandidateCount,
      COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumCandidateCount,
      'Strategy candidate count'
    );
    if (!candidates.some(candidate => candidate.status === 'complete')) {
      fail('A ready strategy set requires at least one complete candidate.');
    }
  } else if (candidates.length !== 0 || input.blockers.length === 0) {
    fail('A no-solution strategy set must contain no candidates and at least one blocker.');
  }
  const blockers = [...input.blockers].sort(
    (left, right) =>
      compareText(left.code, right.code) || compareText(left.job ?? '', right.job ?? '')
  );
  blockers.forEach(blocker => {
    requireOneOf(blocker.code, BLOCKER_CODES, 'Strategy blocker code');
    requireNonEmpty(blocker.message, `${blocker.code} message`);
    if (blocker.job !== undefined) requireOneOf(blocker.job, JOBS, 'Strategy blocker job');
  });
  const content: StrategySetContent = {
    version: COLOR_SYSTEM_STRATEGY_SET_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    sourceHash: brief.sourceHash,
    sourcePackageHash: brief.sourcePackageHash,
    briefHash: brief.briefHash,
    status: input.status,
    candidates,
    blockers,
  };
  const strategySetHash = deterministicContentHash({
    version: content.version,
    policyVersion: content.policyVersion,
    sourceHash: content.sourceHash,
    sourcePackageHash: content.sourcePackageHash,
    briefHash: content.briefHash,
    candidates: candidates.map(candidate => ({
      id: candidate.id,
      candidateHash: candidate.candidateHash,
      status: candidate.status,
    })),
    blockers,
  });
  return { ...content, strategySetHash };
}

export function assertColorSystemStrategySetV2Integrity(
  brief: ColorSystemBuilderBriefV2,
  strategySet: ColorSystemStrategySetV2
): void {
  requireHash(strategySet.strategySetHash, 'strategySetHash');
  if (
    strategySet.version !== COLOR_SYSTEM_STRATEGY_SET_V2_SCHEMA_VERSION ||
    strategySet.policyVersion !== COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION ||
    strategySet.sourceHash !== brief.sourceHash ||
    strategySet.sourcePackageHash !== brief.sourcePackageHash ||
    strategySet.briefHash !== brief.briefHash
  ) {
    fail('Strategy set authority does not match the v2 builder brief.');
  }
  const rebuilt = buildColorSystemStrategySetV2(brief, {
    status: strategySet.status,
    candidates: strategySet.candidates,
    blockers: strategySet.blockers,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(strategySet)) {
    fail('Strategy set failed canonical v2 integrity validation.');
  }
}
