/**
 * Reviewed, source-bound restrictions for the existing generated-family engine.
 * This fragment is deliberately narrower than a general guideline interpreter:
 * exclusions apply to every mode/job at named prominence levels. Source colors
 * themselves are never rewritten, and adoption never changes a rule's origin.
 */
import type {
  ColorSystemBrandFitProfileV2,
  ColorSystemBrandTerritoryV2,
  ColorSystemFamilyProminenceV2,
  ColorSystemJobV2,
} from './colorSystemBuilderV2Contracts';
import { buildColorSystemBrandFitProfileV2 } from './colorSystemBuilderV2Integrity';
import {
  normalizeColorSystemJobsV1,
  normalizeColorSystemPerceptualBoundsV1,
} from './colorSystemBrandGuardsV1';
import { canonicalJson, canonicalNumber, deterministicContentHash } from './colorSystemHashing';
import { compareText } from './utils';

export const COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_SCHEMA_VERSION =
  'teul.brand-constraints.v1' as const;
export const COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_LIMITS = {
  maximumRules: 50,
  maximumHueRanges: 32,
  maximumEvidenceRefs: 32,
  maximumTextLength: 512,
  maximumIdentityLength: 128,
} as const;

export type ColorSystemBrandConstraintOriginV1 =
  | 'source-stated'
  | 'observed-example'
  | 'inferred'
  | 'teul-default'
  | 'owner-authored'
  | 'proposal';

type TerritoryRuleBase = {
  readonly id: string;
  readonly label: string;
  readonly kind: 'brand-territory';
  readonly scope: {
    readonly kind: 'generated-families';
    readonly prominence: readonly ColorSystemFamilyProminenceV2[];
    readonly modes: 'all';
    readonly jobs: 'all';
  };
  readonly bounds: ColorSystemBrandTerritoryV2['perceptualBounds'];
  readonly origin: ColorSystemBrandConstraintOriginV1;
  readonly evidenceRefs: readonly string[];
};

export type ColorSystemBrandTerritoryRuleV1 = TerritoryRuleBase &
  /** Existing engine semantics: bounds constrain the main step-9 anchor, not every tint/shade. */
  (
    | { readonly effect: 'restrict-to'; readonly allowedJobs: readonly ColorSystemJobV2[] }
    /** Excluded bounds are checked against every member in every generated mode. */
    | { readonly effect: 'exclude' }
  );

export interface ColorSystemBrandConstraintDecisionV1 {
  readonly ruleId: string;
  readonly ruleHash: string;
  readonly status: 'accepted' | 'rejected';
  readonly actor: { readonly kind: 'user' | 'agent'; readonly ref: string };
  readonly authorityRef: string;
}

export interface ColorSystemBrandConstraintsV1 {
  readonly schemaVersion: typeof COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_SCHEMA_VERSION;
  readonly sourceSnapshotHash: string;
  readonly rules: readonly ColorSystemBrandTerritoryRuleV1[];
  /** An absent decision means unreviewed, never implicitly accepted. */
  readonly decisions: readonly ColorSystemBrandConstraintDecisionV1[];
  readonly fragmentHash: string;
}

export type ColorSystemBrandConstraintsV1ErrorCode =
  | 'INVALID_BRAND_CONSTRAINTS'
  | 'UNSUPPORTED_BRAND_CONSTRAINT_SCOPE'
  | 'BRAND_CONSTRAINT_HASH_MISMATCH'
  | 'STALE_BRAND_CONSTRAINT_DECISION';

export class ColorSystemBrandConstraintsV1Error extends Error {
  constructor(
    readonly code: ColorSystemBrandConstraintsV1ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ColorSystemBrandConstraintsV1Error';
  }
}

export interface ColorSystemBrandTerritoryBindingV1 {
  readonly sourceTerritoryId: string;
  readonly prominence: ColorSystemFamilyProminenceV2;
  readonly territoryId: string;
}

export interface ColorSystemBrandConstraintLoweringIssueV1 {
  readonly code: 'UNREVIEWED_RULE' | 'EMPTY_ALLOWED_TERRITORY';
  readonly ruleIds: readonly string[];
  readonly sourceTerritoryId?: string;
  readonly prominence?: ColorSystemFamilyProminenceV2;
  readonly message: string;
}

export type ColorSystemBrandConstraintLoweringV1 =
  | {
      readonly status: 'ready';
      readonly profile: ColorSystemBrandFitProfileV2;
      readonly territoryBindings: readonly ColorSystemBrandTerritoryBindingV1[];
    }
  | {
      readonly status: 'infeasible';
      readonly issues: readonly ColorSystemBrandConstraintLoweringIssueV1[];
    };

type RecordValue = Record<string, unknown>;
type Range = Readonly<{ minimum: number; maximum: number }>;
const HASH = /^sha256:[0-9a-f]{64}$/;
const RULE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROMINENCE = ['accent', 'leading', 'supporting'] as const;
const ORIGINS: readonly ColorSystemBrandConstraintOriginV1[] = [
  'source-stated',
  'observed-example',
  'inferred',
  'teul-default',
  'owner-authored',
  'proposal',
];

function fail(
  message: string,
  code: ColorSystemBrandConstraintsV1ErrorCode = 'INVALID_BRAND_CONSTRAINTS'
): never {
  throw new ColorSystemBrandConstraintsV1Error(code, message);
}

function record(value: unknown, name: string): RecordValue {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail(`${name} must be a plain object.`);
  return value as RecordValue;
}

function keys(value: RecordValue, allowed: readonly string[], name: string): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${name} has unknown fields.`);
}

function text(
  value: unknown,
  name: string,
  maximum: number = COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_LIMITS.maximumIdentityLength
): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) {
    fail(`${name}: nonblank text, max ${maximum} characters.`);
  }
  return value;
}

function hash(value: unknown, name: string): string {
  if (typeof value !== 'string' || !HASH.test(value)) fail(`${name} requires SHA-256.`);
  return value;
}

function list(value: unknown, maximum: number, name: string): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    fail(`${name}: array required, max ${maximum} items.`);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) fail(`${name} has missing entries.`);
  }
  return value;
}

function strings(value: unknown, maximum: number, name: string): string[] {
  const result = list(value, maximum, name).map(item => text(item, name));
  if (result.length === 0 || new Set(result).size !== result.length)
    fail(`${name} must be nonempty and unique.`);
  return result.sort(compareText);
}

function range(value: unknown, name: string): Range {
  const input = record(value, name);
  keys(input, ['minimum', 'maximum'], name);
  if (typeof input.minimum !== 'number' || typeof input.maximum !== 'number')
    fail(`${name} must have finite bounds.`);
  // Shared native guards check domains and ordering before canonical rounding.
  return { minimum: input.minimum, maximum: input.maximum };
}

function canonicalRange(value: Range): Range {
  return { minimum: canonicalNumber(value.minimum), maximum: canonicalNumber(value.maximum) };
}

/** Interval order and overlapping subdivisions are not policy differences. */
function unionRanges(ranges: readonly Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.minimum - b.minimum || a.maximum - b.maximum);
  const result: Range[] = [];
  for (const current of sorted) {
    const last = result[result.length - 1];
    if (last && current.minimum <= last.maximum) {
      result[result.length - 1] = {
        minimum: last.minimum,
        maximum: Math.max(last.maximum, current.maximum),
      };
    } else result.push({ ...current });
  }
  return result;
}

function nativeProfile(
  territories: readonly ColorSystemBrandTerritoryV2[],
  evidenceIds: readonly string[]
): ColorSystemBrandFitProfileV2 {
  try {
    return buildColorSystemBrandFitProfileV2({
      version: 'teul-brand-fit-profile/v2',
      territories,
      evidenceIds,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Invalid native brand profile.');
  }
}

function normalizeRule(value: unknown): ColorSystemBrandTerritoryRuleV1 {
  const input = record(value, 'Rule');
  keys(
    input,
    ['id', 'label', 'kind', 'scope', 'bounds', 'origin', 'evidenceRefs', 'effect', 'allowedJobs'],
    'Rule'
  );
  const id = text(input.id, 'Rule id');
  if (!RULE_ID.test(id)) fail('Invalid rule id.');
  const label = text(
    input.label,
    'Rule label',
    COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_LIMITS.maximumTextLength
  );
  if (input.kind !== 'brand-territory') fail('Unsupported rule kind.');
  const scope = record(input.scope, `${id} scope`);
  if (
    Object.keys(scope).some(key => !['kind', 'prominence', 'modes', 'jobs'].includes(key)) ||
    scope.kind !== 'generated-families' ||
    scope.modes !== 'all' ||
    scope.jobs !== 'all'
  ) {
    fail(
      'Scope must cover generated families, all modes and jobs.',
      'UNSUPPORTED_BRAND_CONSTRAINT_SCOPE'
    );
  }
  const prominence = strings(scope.prominence, PROMINENCE.length, `${id} prominence`);
  if (prominence.some(item => !PROMINENCE.includes(item as ColorSystemFamilyProminenceV2))) {
    fail('Invalid family prominence.', 'UNSUPPORTED_BRAND_CONSTRAINT_SCOPE');
  }
  if (!ORIGINS.includes(input.origin as ColorSystemBrandConstraintOriginV1))
    fail(`${id} has an invalid origin.`);
  const evidenceRefs = strings(
    input.evidenceRefs,
    COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_LIMITS.maximumEvidenceRefs,
    `${id} evidence`
  );
  if (new Set(evidenceRefs.map(ref => ref.trim())).size !== evidenceRefs.length) {
    fail(`${id} has duplicate evidence.`);
  }
  const bounds = record(input.bounds, `${id} bounds`);
  keys(bounds, ['hueRanges', 'chroma', 'lightness'], `${id} bounds`);
  const hueRanges = list(
    bounds.hueRanges,
    COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_LIMITS.maximumHueRanges,
    `${id} hue ranges`
  ).map(item => range(item, `${id} hue range`));
  const perceptualBounds = normalizeColorSystemPerceptualBoundsV1(
    {
      hueRanges,
      chroma: range(bounds.chroma, `${id} chroma`),
      lightness: range(bounds.lightness, `${id} lightness`),
    },
    id,
    fail
  );
  if (input.effect !== 'restrict-to' && input.effect !== 'exclude')
    fail(`${id} has an unsupported effect.`);
  if (input.effect === 'exclude' && Object.prototype.hasOwnProperty.call(input, 'allowedJobs')) {
    fail('Exclusions must cover all jobs.', 'UNSUPPORTED_BRAND_CONSTRAINT_SCOPE');
  }
  const allowedJobs =
    input.effect === 'restrict-to'
      ? normalizeColorSystemJobsV1(
          strings(input.allowedJobs, 10, `${id} allowed jobs`),
          `${id} allowedJobs`,
          fail
        )
      : [];
  const common: TerritoryRuleBase = {
    id,
    label,
    kind: 'brand-territory',
    scope: {
      kind: 'generated-families',
      prominence: prominence as ColorSystemFamilyProminenceV2[],
      modes: 'all',
      jobs: 'all',
    },
    bounds: {
      hueRanges: unionRanges(perceptualBounds.hueRanges.map(canonicalRange)),
      chroma: canonicalRange(perceptualBounds.chroma),
      lightness: canonicalRange(perceptualBounds.lightness),
    },
    origin: input.origin as ColorSystemBrandConstraintOriginV1,
    evidenceRefs,
  };
  return input.effect === 'exclude'
    ? { ...common, effect: 'exclude' }
    : { ...common, effect: 'restrict-to', allowedJobs };
}

/** Validate imported rules without inventing a source snapshot or an adoption receipt. */
export function normalizeColorSystemBrandRulesV1(
  value: unknown
): ColorSystemBrandTerritoryRuleV1[] {
  const rules = list(value, COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_LIMITS.maximumRules, 'Brand rules')
    .map(normalizeRule)
    .sort((a, b) => compareText(a.id, b.id));
  if (new Set(rules.map(rule => rule.id)).size !== rules.length) fail('Duplicate rule id.');
  return rules;
}

export function hashColorSystemBrandTerritoryRuleV1(rule: unknown): string {
  return deterministicContentHash(normalizeRule(rule));
}

function normalizeDecision(
  value: unknown,
  rules: ReadonlyMap<string, ColorSystemBrandTerritoryRuleV1>
): ColorSystemBrandConstraintDecisionV1 {
  const input = record(value, 'Decision');
  keys(input, ['ruleId', 'ruleHash', 'status', 'actor', 'authorityRef'], 'Decision');
  const ruleId = text(input.ruleId, 'Rule id');
  const rule = rules.get(ruleId);
  if (!rule) fail('Unknown decision rule.');
  const ruleHash = hash(input.ruleHash, 'Rule hash');
  if (ruleHash !== deterministicContentHash(rule))
    fail('Decision rule hash is stale.', 'STALE_BRAND_CONSTRAINT_DECISION');
  if (input.status !== 'accepted' && input.status !== 'rejected') fail('Invalid decision status.');
  const actor = record(input.actor, 'Decision actor');
  keys(actor, ['kind', 'ref'], 'Decision actor');
  if (actor.kind !== 'user' && actor.kind !== 'agent') fail('Invalid decision actor kind.');
  return {
    ruleId,
    ruleHash,
    status: input.status,
    actor: { kind: actor.kind, ref: text(actor.ref, 'Actor reference') },
    authorityRef: text(
      input.authorityRef,
      'Authority reference',
      COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_LIMITS.maximumTextLength
    ),
  };
}

/** Build canonical content. No decisions is a valid review draft, not permission. */
export function buildColorSystemBrandConstraintsV1(value: unknown): ColorSystemBrandConstraintsV1 {
  const input = record(value, 'Brand constraints');
  keys(input, ['schemaVersion', 'sourceSnapshotHash', 'rules', 'decisions'], 'Brand constraints');
  if (input.schemaVersion !== COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_SCHEMA_VERSION)
    fail('Unsupported rules schema.');
  const sourceSnapshotHash = hash(input.sourceSnapshotHash, 'Source snapshot hash');
  const rules = normalizeColorSystemBrandRulesV1(input.rules);
  const byId = new Map(rules.map(rule => [rule.id, rule]));
  const decisions = list(
    input.decisions,
    COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_LIMITS.maximumRules,
    'Brand decisions'
  )
    .map(decision => normalizeDecision(decision, byId))
    .sort((a, b) => compareText(a.ruleId, b.ruleId));
  if (new Set(decisions.map(decision => decision.ruleId)).size !== decisions.length)
    fail('Duplicate rule decision.');
  const content = {
    schemaVersion: COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_SCHEMA_VERSION,
    sourceSnapshotHash,
    rules,
    decisions,
  };
  return { ...content, fragmentHash: deterministicContentHash(content) };
}

/** Verify serialized input instead of silently re-sealing altered policy. */
export function parseColorSystemBrandConstraintsV1(value: unknown): ColorSystemBrandConstraintsV1 {
  const input = record(value, 'Brand constraints');
  keys(
    input,
    ['schemaVersion', 'sourceSnapshotHash', 'rules', 'decisions', 'fragmentHash'],
    'Brand constraints'
  );
  const expected = hash(input.fragmentHash, 'Rules hash');
  const { fragmentHash: _fragmentHash, ...content } = input;
  const built = buildColorSystemBrandConstraintsV1(content);
  if (built.fragmentHash !== expected)
    fail('Brand-rule hash mismatch.', 'BRAND_CONSTRAINT_HASH_MISMATCH');
  return built;
}

function intersectRanges(left: readonly Range[], right: readonly Range[]): Range[] {
  return unionRanges(
    left.flatMap(a =>
      right.flatMap(b => {
        const minimum = Math.max(a.minimum, b.minimum);
        const maximum = Math.min(a.maximum, b.maximum);
        return minimum <= maximum ? [{ minimum, maximum }] : [];
      })
    )
  );
}

function scopedTerritoryId(
  sourceTerritoryId: string,
  prominence: ColorSystemFamilyProminenceV2
): string {
  return `brand-scope:${deterministicContentHash({ sourceTerritoryId, prominence }).slice(7)}`;
}

/** Preserve the original territory's naming role after its permission scope is narrowed. */
export function colorSystemBrandTerritoryMatchesSourceV1(
  territoryId: string,
  sourceTerritoryId: string,
  prominence: ColorSystemFamilyProminenceV2
): boolean {
  return (
    territoryId === sourceTerritoryId ||
    territoryId === scopedTerritoryId(sourceTerritoryId, prominence)
  );
}

/**
 * Lower only the supported scope, retaining native engine rejection semantics.
 * An infeasible result proves an empty allowed envelope/job intersection; a ready
 * profile still needs actual color/scale feasibility checks against exclusions.
 */
export function lowerColorSystemBrandConstraintsV1(
  value: ColorSystemBrandConstraintsV1,
  baseProfile: ColorSystemBrandFitProfileV2
): ColorSystemBrandConstraintLoweringV1 {
  const fragment = parseColorSystemBrandConstraintsV1(value);
  const base = nativeProfile(baseProfile.territories, baseProfile.evidenceIds);
  if (canonicalJson(base) !== canonicalJson(baseProfile))
    fail('Base profile does not match its canonical hash.', 'BRAND_CONSTRAINT_HASH_MISMATCH');
  const decisions = new Map(fragment.decisions.map(decision => [decision.ruleId, decision]));
  const unreviewed = fragment.rules.filter(rule => !decisions.has(rule.id));
  if (unreviewed.length > 0)
    return {
      status: 'infeasible',
      issues: [
        {
          code: 'UNREVIEWED_RULE',
          ruleIds: unreviewed.map(rule => rule.id),
          message: 'Every brand rule needs an explicit adoption decision before lowering.',
        },
      ],
    };
  const active = fragment.rules.filter(rule => decisions.get(rule.id)?.status === 'accepted');
  const evidence = [
    ...new Set([
      ...base.evidenceIds,
      fragment.fragmentHash,
      ...active.flatMap(rule => rule.evidenceRefs),
    ]),
  ].sort(compareText);
  const territories: ColorSystemBrandTerritoryV2[] = [];
  const territoryBindings: ColorSystemBrandTerritoryBindingV1[] = [];
  const issues: ColorSystemBrandConstraintLoweringIssueV1[] = [];
  for (const original of base.territories) {
    if (original.status === 'excluded') {
      territories.push(original);
      continue;
    }
    for (const prominence of original.appliesToProminence.filter(item =>
      original.allowedProminence.includes(item)
    )) {
      const restrictions = active.filter(
        (
          rule
        ): rule is ColorSystemBrandTerritoryRuleV1 & {
          effect: 'restrict-to';
          allowedJobs: readonly ColorSystemJobV2[];
        } => rule.effect === 'restrict-to' && rule.scope.prominence.includes(prominence)
      );
      let hueRanges = unionRanges(original.perceptualBounds.hueRanges);
      let chroma = { ...original.perceptualBounds.chroma };
      let lightness = { ...original.perceptualBounds.lightness };
      let allowedJobs = [...original.allowedJobs];
      for (const rule of restrictions) {
        hueRanges = intersectRanges(hueRanges, rule.bounds.hueRanges);
        chroma = {
          minimum: Math.max(chroma.minimum, rule.bounds.chroma.minimum),
          maximum: Math.min(chroma.maximum, rule.bounds.chroma.maximum),
        };
        lightness = {
          minimum: Math.max(lightness.minimum, rule.bounds.lightness.minimum),
          maximum: Math.min(lightness.maximum, rule.bounds.lightness.maximum),
        };
        allowedJobs = allowedJobs.filter(job => rule.allowedJobs.includes(job));
      }
      if (
        hueRanges.length === 0 ||
        chroma.minimum > chroma.maximum ||
        lightness.minimum > lightness.maximum ||
        allowedJobs.length === 0
      ) {
        issues.push({
          code: 'EMPTY_ALLOWED_TERRITORY',
          sourceTerritoryId: original.territoryId,
          prominence,
          ruleIds: restrictions.map(rule => rule.id),
          message: 'Reviewed restrictions leave no common allowed territory or job.',
        });
        continue;
      }
      const territoryId = scopedTerritoryId(original.territoryId, prominence);
      territoryBindings.push({ sourceTerritoryId: original.territoryId, prominence, territoryId });
      territories.push({
        ...original,
        territoryId,
        allowedJobs,
        allowedProminence: [prominence],
        appliesToProminence: [prominence],
        perceptualBounds: { hueRanges, chroma, lightness },
        evidenceIds: [
          ...new Set([
            ...original.evidenceIds,
            fragment.fragmentHash,
            ...restrictions.flatMap(rule => rule.evidenceRefs),
          ]),
        ].sort(compareText),
      });
    }
  }
  if (issues.length > 0) return { status: 'infeasible', issues };
  for (const rule of active.filter(rule => rule.effect === 'exclude')) {
    territories.push({
      territoryId: `brand-exclusion:${deterministicContentHash(rule.id).slice(7)}`,
      label: rule.label,
      status: 'excluded',
      allowedJobs: [],
      allowedProminence: [],
      appliesToProminence: rule.scope.prominence,
      perceptualBounds: rule.bounds,
      evidenceIds: [...new Set([...rule.evidenceRefs, fragment.fragmentHash])].sort(compareText),
    });
  }
  return {
    status: 'ready',
    profile: nativeProfile(territories, evidence),
    territoryBindings: territoryBindings.sort(
      (a, b) =>
        compareText(a.sourceTerritoryId, b.sourceTerritoryId) ||
        compareText(a.prominence, b.prominence)
    ),
  };
}
