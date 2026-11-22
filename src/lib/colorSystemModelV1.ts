/** Offline authored relationships. Import and adoption never authorize document writes. */
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import {
  parseColorSystemBrandConstraintsV1,
  type ColorSystemBrandConstraintOriginV1,
  type ColorSystemBrandConstraintsV1,
} from './colorSystemBrandConstraintsV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { normalizeColorSystemSrgbValueV1 } from './colorSystemSrgbValueV1';
import { utf8ByteLength } from './utf8';
import { compareText } from './utils';

export const COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION = 'teul.color-system-model.v1' as const;
export const COLOR_SYSTEM_MODEL_V1_LIMITS = {
  maximumBytes: 2 * 1024 * 1024,
  maximumColors: 256,
  maximumRules: 128,
  maximumContexts: 16,
  maximumModes: 4,
  maximumSources: 32,
  maximumEvidence: 1024,
  maximumClaims: 512,
  maximumFamilies: 64,
  maximumScales: 128,
  maximumSlots: 64,
  maximumConflicts: 128,
  maximumRefs: 256,
  maximumText: 4096,
  maximumId: 128,
  maximumDepth: 24,
  maximumNodes: 100000,
} as const;

export type ColorSystemEvidenceStatusV1 =
  'observed' | 'inferred' | 'contradicted' | 'unsupported' | 'unresolved';
export interface ColorSystemSourceIdentityV1 {
  readonly id: string;
  readonly label: string;
  readonly sourceHash: string;
  readonly version: string | null;
  readonly locator: string | null;
  readonly freshnessMode: 'current-file' | 'imported-snapshot';
  /** Current-file re-read identity; never an external-snapshot freshness claim. */
  readonly currentFileContentHash?: string;
  readonly status: 'approved' | 'draft' | 'historical' | 'unknown';
}
export interface ColorSystemEvidenceV1 {
  readonly id: string;
  readonly sourceId: string;
  readonly locator: string | null;
  readonly status: ColorSystemEvidenceStatusV1;
  readonly description: string;
}
export interface ColorSystemCoverageV1 {
  readonly sourceId: string;
  readonly status: 'complete' | 'partial' | 'unknown';
  readonly evidenceRefs: readonly string[];
  readonly unresolvedClaimIds: readonly string[];
  readonly note: string;
}
export interface ColorSystemClaimV1 {
  readonly id: string;
  readonly sourceId: string;
  readonly text: string;
  readonly status: ColorSystemEvidenceStatusV1;
  readonly evidenceRefs: readonly string[];
  readonly contextIds: readonly string[];
  readonly ruleIds: readonly string[];
  /** Omitted or empty means all declared source modes, not an invented mode. */
  readonly modeIds?: readonly string[];
}
interface EvidenceLinksV1 {
  readonly evidenceRefs: readonly string[];
  readonly claimIds: readonly string[];
}
export interface ColorSystemNamedModeV1 {
  readonly id: string;
  readonly label: string;
}
export interface ColorSystemSourceColorV1 extends EvidenceLinksV1 {
  readonly id: string;
  readonly label: string;
  readonly sourceId: string;
  readonly valuesByMode: Readonly<Record<string, ColorSystemColorValueV2>>;
  /** Missing numeric authority is a scoped source gap, never a fabricated value. */
  readonly valueGapClaimIdsByMode?: Readonly<Record<string, readonly string[]>>;
}
export interface ColorSystemAuthoredFamilyV1 extends EvidenceLinksV1 {
  readonly id: string;
  readonly label: string;
  readonly colorIds: readonly string[];
}
export interface ColorSystemAuthoredScaleV1 extends EvidenceLinksV1 {
  readonly id: string;
  readonly label: string;
  readonly familyId: string;
  /** Authored positions, strictly increasing. Missing slots remain unfilled. */
  readonly slots: readonly { readonly id: string; readonly position: number }[];
  readonly modes: readonly {
    readonly modeId: string;
    readonly anchors: readonly { readonly slotId: string; readonly colorId: string }[];
  }[];
}
export interface ColorSystemUsageContextV1 extends EvidenceLinksV1 {
  readonly id: string;
  readonly label: string;
  readonly modeIds: readonly string[];
}
export type ColorSystemSelectorV1 = {
  readonly kind: 'color' | 'family' | 'scale';
  readonly id: string;
  /** Optional filter on each actual paint use, not on the color's global meaning. */
  readonly role?: string;
};
export type ColorSystemRuleForceV1 =
  'requirement' | 'prohibition' | 'permission' | 'preference' | 'example';
interface RuleBaseV1 extends EvidenceLinksV1 {
  readonly id: string;
  readonly label: string;
  readonly contextIds: readonly string[];
  readonly modeIds: readonly string[];
  readonly origin: ColorSystemBrandConstraintOriginV1;
}
type SelectorsV1 = readonly ColorSystemSelectorV1[];
type PositiveForceV1 = 'requirement' | 'preference' | 'example';
export type ColorSystemScopedRuleV1 = RuleBaseV1 &
  (
    | {
        readonly kind: 'palette-membership';
        readonly force: ColorSystemRuleForceV1;
        readonly operands: { readonly members: SelectorsV1 };
      }
    | {
        readonly kind: 'allowed-pair';
        readonly force: PositiveForceV1 | 'permission';
        readonly operands: {
          readonly left: SelectorsV1;
          readonly right: SelectorsV1;
          readonly ordered: boolean;
          readonly relation: 'co-present' | 'foreground-background';
        };
      }
    | {
        readonly kind: 'forbidden-pair';
        readonly force: 'prohibition' | 'preference' | 'example';
        readonly operands: {
          readonly left: SelectorsV1;
          readonly right: SelectorsV1;
          readonly ordered: boolean;
          readonly relation: 'co-present' | 'foreground-background';
        };
      }
    | {
        readonly kind: 'required-partner';
        readonly force: PositiveForceV1;
        readonly operands: {
          readonly subject: SelectorsV1;
          readonly partner: SelectorsV1;
          readonly subjectRole?: string;
          readonly partnerRole?: string;
        };
      }
    | {
        readonly kind: 'color-count';
        /** Prohibition forbids the inclusive range; permission/example only document it. */
        readonly force: ColorSystemRuleForceV1;
        readonly operands: {
          readonly members: SelectorsV1;
          readonly minimum: number;
          readonly maximum: number;
          /** Defaults to colors. Groups count distinct authored family/scale identities in use. */
          readonly unit?: 'colors' | 'groups';
        };
      }
    | {
        readonly kind: 'prominence';
        readonly force: PositiveForceV1;
        readonly operands:
          | {
              readonly kind: 'ordered-groups'; /** Highest prominence first; no inferred percentages. */
              readonly groups: readonly SelectorsV1[];
            }
          | {
              readonly kind: 'area-fraction';
              readonly members: SelectorsV1;
              readonly minimum: number;
              readonly maximum: number;
            };
      }
    | {
        readonly kind: 'role-binding';
        readonly force: ColorSystemRuleForceV1;
        readonly operands: {
          readonly role: string;
          readonly members: SelectorsV1;
          /** Defaults to required; if-present leaves an absent optional element inapplicable. */
          readonly presence?: 'required' | 'if-present';
        };
      }
  );
export interface ColorSystemRuleAdoptionV1 {
  readonly ruleId: string;
  /** Hash excludes adoption, but binds original rule meaning, force and evidence references. */
  readonly ruleHash: string;
  /** Binds the source and selected structures inspected for this decision. */
  readonly dependencyHash: string;
  readonly status: 'accepted' | 'rejected';
  readonly actor: { readonly kind: 'user' | 'agent'; readonly ref: string };
  readonly authorityRef: string;
  readonly decisionRef: string;
}
export type ColorSystemRuleAdoptionDecisionV1 = Omit<
  ColorSystemRuleAdoptionV1,
  'ruleHash' | 'dependencyHash'
>;
export interface ColorSystemScopedBrandConstraintsV1 {
  readonly id: string;
  readonly sourceId: string;
  readonly contextIds: readonly string[];
  /** Existing TASK002 semantics; this wrapper does not reinterpret its territory rules. */
  readonly fragment: ColorSystemBrandConstraintsV1;
}
export interface ColorSystemSourceConflictV1 {
  readonly id: string;
  readonly message: string;
  readonly status: 'unresolved' | 'resolved';
  readonly claimIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly contextIds: readonly string[];
  readonly ruleIds: readonly string[];
  /** Omitted or empty restricts through the other explicit conflict scopes only. */
  readonly colorIds?: readonly string[];
  readonly modeIds?: readonly string[];
  /** A resolution is another inspectable claim; original claims are retained. */
  readonly resolutionClaimId?: string;
}
export interface ColorSystemModelV1 {
  readonly schemaVersion: typeof COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION;
  readonly sources: readonly ColorSystemSourceIdentityV1[];
  readonly evidence: readonly ColorSystemEvidenceV1[];
  readonly coverage: readonly ColorSystemCoverageV1[];
  readonly claims: readonly ColorSystemClaimV1[];
  readonly modes: readonly ColorSystemNamedModeV1[];
  readonly colors: readonly ColorSystemSourceColorV1[];
  readonly families: readonly ColorSystemAuthoredFamilyV1[];
  readonly scales: readonly ColorSystemAuthoredScaleV1[];
  readonly contexts: readonly ColorSystemUsageContextV1[];
  readonly brandConstraintsByContext: readonly ColorSystemScopedBrandConstraintsV1[];
  readonly rules: readonly ColorSystemScopedRuleV1[];
  /** Missing adoption means unreviewed, never automatic acceptance. */
  readonly adoptions: readonly ColorSystemRuleAdoptionV1[];
  readonly conflicts: readonly ColorSystemSourceConflictV1[];
  readonly modelHash: string;
}
export type ColorSystemModelInputV1 = Omit<ColorSystemModelV1, 'modelHash'>;
export type ColorSystemModelV1ErrorCode =
  | 'INVALID_COLOR_SYSTEM_MODEL'
  | 'MODEL_LIMIT_EXCEEDED'
  | 'UNSUPPORTED_MODEL_VERSION'
  | 'UNSUPPORTED_RULE_KIND'
  | 'UNSUPPORTED_RULE_SCOPE'
  | 'UNSUPPORTED_RULE_FORCE'
  | 'MODEL_REFERENCE_ERROR'
  | 'MODEL_HASH_MISMATCH'
  | 'STALE_RULE_ADOPTION';
export class ColorSystemModelV1Error extends Error {
  constructor(
    readonly code: ColorSystemModelV1ErrorCode,
    readonly path: string,
    message: string
  ) {
    super(`${path}: ${message}`);
    this.name = 'ColorSystemModelV1Error';
  }
}

type RecordValue = Record<string, unknown>;
const LIMITS = COLOR_SYSTEM_MODEL_V1_LIMITS;
// Only snapshots captured by this module can reuse completed validation. A supplied
// hash, frozen object or serialized marker never enters this registry.
const capturedModels = new WeakSet<ColorSystemModelV1>();
const STATUS = ['observed', 'inferred', 'contradicted', 'unsupported', 'unresolved'] as const;
const ORIGINS = [
  'source-stated',
  'observed-example',
  'inferred',
  'teul-default',
  'owner-authored',
  'proposal',
] as const;
const FORCES = ['requirement', 'prohibition', 'permission', 'preference', 'example'] as const;
const RULE_KINDS = [
  'palette-membership',
  'allowed-pair',
  'forbidden-pair',
  'required-partner',
  'color-count',
  'prominence',
  'role-binding',
] as const;
const MODEL_KEYS = [
  'schemaVersion',
  'sources',
  'evidence',
  'coverage',
  'claims',
  'modes',
  'colors',
  'families',
  'scales',
  'contexts',
  'brandConstraintsByContext',
  'rules',
  'adoptions',
  'conflicts',
] as const;

function fail(
  path: string,
  message: string,
  code: ColorSystemModelV1ErrorCode = 'INVALID_COLOR_SYSTEM_MODEL'
): never {
  throw new ColorSystemModelV1Error(code, path, message);
}

/** Reject executable JS values before any semantic property is read or serialized. */
function assertJsonData(value: unknown): void {
  let nodes = 0;
  let stringBytes = 0;
  const ancestors = new Set<object>();
  function visit(item: unknown, path: string, depth: number): void {
    if (++nodes > LIMITS.maximumNodes || depth > LIMITS.maximumDepth)
      fail(path, 'JSON structure exceeds bounded depth or node count.', 'MODEL_LIMIT_EXCEEDED');
    if (typeof item === 'string') {
      stringBytes += utf8ByteLength(item);
      if (stringBytes > LIMITS.maximumBytes)
        fail(path, 'Text exceeds 2 MiB UTF-8.', 'MODEL_LIMIT_EXCEEDED');
      return;
    }
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) fail(path, 'Only finite JSON numbers are supported.');
      return;
    }
    if (typeof item !== 'object') fail(path, 'Only inert JSON data is supported.');
    if (ancestors.has(item)) fail(path, 'Cyclic data is not JSON.');
    const isArray = Array.isArray(item);
    if (isArray && Object.getPrototypeOf(item) !== Array.prototype)
      fail(path, 'Expected a plain JSON array.');
    if (!isArray && ![Object.prototype, null].includes(Object.getPrototypeOf(item)))
      fail(path, 'Expected a plain JSON object.');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const ownKeys = Reflect.ownKeys(item);
    if (ownKeys.some(key => typeof key !== 'string')) fail(path, 'Symbol fields are unsupported.');
    if (isArray && (item.length > LIMITS.maximumEvidence || ownKeys.length !== item.length + 1))
      fail(
        path,
        'Array is sparse, extended, or exceeds the bounded length.',
        'MODEL_LIMIT_EXCEEDED'
      );
    if (!isArray && ownKeys.length > LIMITS.maximumEvidence)
      fail(path, 'Object exceeds the bounded field count.', 'MODEL_LIMIT_EXCEEDED');
    ancestors.add(item);
    for (const key of ownKeys as string[]) {
      if (isArray && key === 'length') continue;
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        fail(`${path}.${key}`, 'Prototype-bearing fields are unsupported.');
      if (isArray && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length))
        fail(path, 'Arrays may contain only contiguous index fields.');
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !('value' in descriptor))
        fail(`${path}.${key}`, 'Accessors and non-enumerable fields are unsupported.');
      visit(descriptor.value, `${path}.${key}`, depth + 1);
    }
    ancestors.delete(item);
  }
  visit(value, '$', 0);
  if (utf8ByteLength(canonicalJson(value)) > LIMITS.maximumBytes)
    fail('$', 'Model exceeds 2 MiB UTF-8 JSON.', 'MODEL_LIMIT_EXCEEDED');
}

function record(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = []
): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail(path, 'Expected an object.');
  const input = value as RecordValue;
  for (const key of Object.keys(input)) {
    if (!required.includes(key) && !optional.includes(key))
      fail(`${path}.${key}`, 'Unknown field.');
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(input, key))
      fail(`${path}.${key}`, 'Required field is missing.');
  }
  return input;
}
function text(value: unknown, path: string, maximum: number = LIMITS.maximumText): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    fail(path, `Expected nonblank text of at most ${maximum} characters.`);
  return value;
}
function nullableText(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path);
}
function id(value: unknown, path: string): string {
  const result = text(value, path, LIMITS.maximumId);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result) ||
    result === 'prototype' ||
    Object.prototype.hasOwnProperty.call(Object.prototype, result)
  )
    fail(path, 'Expected an inert stable identifier.');
  return result;
}
function hash(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value))
    fail(path, 'Expected SHA-256.');
  return value;
}
function choice<const T extends readonly string[]>(
  value: unknown,
  options: T,
  path: string
): T[number] {
  if (typeof value !== 'string' || !options.includes(value))
    fail(path, `Expected one of ${options.join(', ')}.`);
  return value as T[number];
}
function array(value: unknown, path: string, maximum: number, minimum = 0): unknown[] {
  if (!Array.isArray(value) || value.length < minimum)
    fail(path, `Expected at least ${minimum} array entries.`);
  if (value.length > maximum)
    fail(path, `At most ${maximum} entries supported.`, 'MODEL_LIMIT_EXCEEDED');
  return value;
}
function unique<T>(values: T[], key: (item: T) => string, path: string): T[] {
  if (new Set(values.map(key)).size !== values.length)
    fail(path, 'Duplicate identity or reference.');
  return values;
}
function refs(
  value: unknown,
  path: string,
  maximum: number = LIMITS.maximumRefs,
  minimum = 0
): string[] {
  return unique(
    array(value, path, maximum, minimum).map((item, i) => id(item, `${path}[${i}]`)),
    item => item,
    path
  ).sort(compareText);
}
function entities<T extends { readonly id: string }>(
  value: unknown,
  path: string,
  maximum: number,
  normalize: (item: unknown, path: string) => T,
  minimum = 0
): T[] {
  return unique(
    array(value, path, maximum, minimum).map((item, i) => normalize(item, `${path}[${i}]`)),
    item => item.id,
    path
  ).sort((a, b) => compareText(a.id, b.id));
}
function number(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  integer = false
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  )
    fail(
      path,
      `Expected ${integer ? 'integer' : 'finite number'} from ${minimum} through ${maximum}.`
    );
  return value === 0 ? 0 : value;
}
function links(input: RecordValue, path: string): EvidenceLinksV1 {
  return {
    evidenceRefs: refs(input.evidenceRefs, `${path}.evidenceRefs`),
    claimIds: refs(input.claimIds, `${path}.claimIds`),
  };
}
function selectorKey(selector: ColorSystemSelectorV1): string {
  return canonicalJson([selector.kind, selector.id, selector.role ?? null]);
}
function selectors(value: unknown, path: string): ColorSystemSelectorV1[] {
  const result = array(value, path, LIMITS.maximumColors, 1).map((item, index) => {
    const here = `${path}[${index}]`;
    const input = record(item, here, ['kind', 'id'], ['role']);
    return {
      kind: choice(input.kind, ['color', 'family', 'scale'] as const, `${here}.kind`),
      id: id(input.id, `${here}.id`),
      ...(input.role === undefined
        ? {}
        : { role: text(input.role, `${here}.role`, LIMITS.maximumId) }),
    };
  });
  return unique(result, selectorKey, path).sort(
    (a, b) =>
      compareText(a.kind, b.kind) ||
      compareText(a.id, b.id) ||
      compareText(a.role ?? '', b.role ?? '')
  );
}
function range(
  input: RecordValue,
  path: string,
  maximum: number,
  integer = false
): { minimum: number; maximum: number } {
  const minimum = number(input.minimum, `${path}.minimum`, 0, maximum, integer);
  const upper = number(input.maximum, `${path}.maximum`, minimum, maximum, integer);
  return { minimum, maximum: upper };
}

function normalizeRule(value: unknown, path: string): ColorSystemScopedRuleV1 {
  const input = record(value, path, [
    'id',
    'label',
    'kind',
    'contextIds',
    'modeIds',
    'origin',
    'force',
    'claimIds',
    'evidenceRefs',
    'operands',
  ]);
  if (!RULE_KINDS.includes(input.kind as (typeof RULE_KINDS)[number]))
    fail(
      `${path}.kind`,
      'Unsupported rule kind; retain the original input for inspection.',
      'UNSUPPORTED_RULE_KIND'
    );
  if (
    !Array.isArray(input.contextIds) ||
    input.contextIds.length === 0 ||
    !Array.isArray(input.modeIds) ||
    input.modeIds.length === 0
  )
    fail(path, 'Rules require explicit nonempty context and mode scope.', 'UNSUPPORTED_RULE_SCOPE');
  const force = choice(input.force, FORCES, `${path}.force`);
  const kind = input.kind as (typeof RULE_KINDS)[number];
  const supported =
    kind === 'forbidden-pair'
      ? ['prohibition', 'preference', 'example']
      : kind === 'allowed-pair'
        ? ['requirement', 'permission', 'preference', 'example']
        : ['required-partner', 'prominence'].includes(kind)
          ? ['requirement', 'preference', 'example']
          : FORCES;
  if (!supported.includes(force))
    fail(`${path}.force`, `Force ${force} is unsupported for ${kind}.`, 'UNSUPPORTED_RULE_FORCE');
  const common = {
    id: id(input.id, `${path}.id`),
    label: text(input.label, `${path}.label`),
    contextIds: refs(input.contextIds, `${path}.contextIds`, LIMITS.maximumContexts, 1),
    modeIds: refs(input.modeIds, `${path}.modeIds`, LIMITS.maximumModes, 1),
    origin: choice(input.origin, ORIGINS, `${path}.origin`),
    force,
    ...links(input, path),
  };
  if (
    (common.origin === 'source-stated' || common.origin === 'observed-example') &&
    (!common.evidenceRefs.length || !common.claimIds.length)
  )
    fail(path, 'Source-origin rules require inspectable claim and evidence references.');
  const opPath = `${path}.operands`;
  let operands: ColorSystemScopedRuleV1['operands'];
  switch (kind) {
    case 'palette-membership': {
      const op = record(input.operands, opPath, ['members']);
      operands = { members: selectors(op.members, `${opPath}.members`) };
      break;
    }
    case 'allowed-pair':
    case 'forbidden-pair': {
      const op = record(input.operands, opPath, ['left', 'right', 'ordered', 'relation']);
      if (typeof op.ordered !== 'boolean') fail(`${opPath}.ordered`, 'Expected a boolean.');
      if (op.relation === 'co-present' && op.ordered)
        fail(
          opPath,
          'Co-presence is unordered; use foreground-background for directional pairs.',
          'UNSUPPORTED_RULE_SCOPE'
        );
      operands = {
        left: selectors(op.left, `${opPath}.left`),
        right: selectors(op.right, `${opPath}.right`),
        ordered: op.ordered,
        relation: choice(
          op.relation,
          ['co-present', 'foreground-background'] as const,
          `${opPath}.relation`
        ),
      };
      break;
    }
    case 'required-partner': {
      const op = record(
        input.operands,
        opPath,
        ['subject', 'partner'],
        ['subjectRole', 'partnerRole']
      );
      operands = {
        subject: selectors(op.subject, `${opPath}.subject`),
        partner: selectors(op.partner, `${opPath}.partner`),
        ...(op.subjectRole === undefined
          ? {}
          : { subjectRole: text(op.subjectRole, `${opPath}.subjectRole`, LIMITS.maximumId) }),
        ...(op.partnerRole === undefined
          ? {}
          : { partnerRole: text(op.partnerRole, `${opPath}.partnerRole`, LIMITS.maximumId) }),
      };
      break;
    }
    case 'color-count': {
      const op = record(input.operands, opPath, ['members', 'minimum', 'maximum'], ['unit']);
      const members = selectors(op.members, `${opPath}.members`);
      const unit =
        op.unit === undefined ? undefined : choice(op.unit, ['colors', 'groups'], `${opPath}.unit`);
      if (unit === 'groups' && members.some(member => member.kind === 'color'))
        fail(`${opPath}.members`, 'Group counts require authored family or scale selectors.');
      operands = {
        members,
        ...range(op, opPath, LIMITS.maximumColors, true),
        ...(unit === undefined ? {} : { unit }),
      };
      break;
    }
    case 'prominence': {
      const op = record(
        input.operands,
        opPath,
        ['kind'],
        ['groups', 'members', 'minimum', 'maximum']
      );
      if (op.kind === 'ordered-groups') {
        record(op, opPath, ['kind', 'groups']);
        const groups = array(op.groups, `${opPath}.groups`, LIMITS.maximumFamilies, 2).map(
          (group, i) => selectors(group, `${opPath}.groups[${i}]`)
        );
        unique(groups.flat(), selectorKey, `${opPath}.groups`);
        operands = { kind: 'ordered-groups', groups };
      } else if (op.kind === 'area-fraction') {
        record(op, opPath, ['kind', 'members', 'minimum', 'maximum']);
        operands = {
          kind: 'area-fraction',
          members: selectors(op.members, `${opPath}.members`),
          ...range(op, opPath, 1),
        };
      } else
        fail(
          `${opPath}.kind`,
          'Prominence must use ordered groups or explicit area fractions.',
          'UNSUPPORTED_RULE_SCOPE'
        );
      break;
    }
    case 'role-binding': {
      const op = record(input.operands, opPath, ['role', 'members'], ['presence']);
      operands = {
        role: text(op.role, `${opPath}.role`, LIMITS.maximumId),
        members: selectors(op.members, `${opPath}.members`),
        ...(op.presence === undefined
          ? {}
          : {
              presence: choice(op.presence, ['required', 'if-present'], `${opPath}.presence`),
            }),
      };
      break;
    }
  }
  return { ...common, kind, operands } as ColorSystemScopedRuleV1;
}

/** Exact source values and thresholds are data; do not perceptually round model hashes. */
function exactHash(value: unknown): string {
  return deterministicContentHash(canonicalJson(value));
}
export function hashColorSystemScopedRuleV1(value: unknown): string {
  assertJsonData(value);
  return exactHash(normalizeRule(value, '$.rule'));
}

function normalizeColor(value: unknown, path: string): ColorSystemSourceColorV1 {
  const input = record(
    value,
    path,
    ['id', 'label', 'sourceId', 'valuesByMode', 'evidenceRefs', 'claimIds'],
    ['valueGapClaimIdsByMode']
  );
  if (
    !input.valuesByMode ||
    typeof input.valuesByMode !== 'object' ||
    Array.isArray(input.valuesByMode)
  )
    fail(`${path}.valuesByMode`, 'Expected named authored mode values.');
  const entries = Object.entries(input.valuesByMode);
  if (entries.length > LIMITS.maximumModes)
    fail(`${path}.valuesByMode`, 'At most four authored modes are supported.');
  const valuesByMode: Record<string, ColorSystemColorValueV2> = {};
  for (const [mode, raw] of entries.sort(([a], [b]) => compareText(a, b))) {
    id(mode, `${path}.valuesByMode mode`);
    const here = `${path}.valuesByMode.${mode}`;
    const color = record(
      raw,
      here,
      ['colorSpace', 'hex', 'components', 'alpha'],
      ['representation']
    );
    record(color.components, `${here}.components`, ['r', 'g', 'b']);
    if (color.representation !== undefined)
      record(color.representation, `${here}.representation`, ['kind', 'exactValueHash']);
    try {
      valuesByMode[mode] = normalizeColorSystemSrgbValueV1(
        color as unknown as ColorSystemColorValueV2
      );
    } catch (error) {
      fail(here, error instanceof Error ? error.message : 'Invalid native color.');
    }
  }
  let valueGapClaimIdsByMode: Record<string, string[]> | undefined;
  if (input.valueGapClaimIdsByMode !== undefined) {
    const raw = input.valueGapClaimIdsByMode;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      fail(`${path}.valueGapClaimIdsByMode`, 'Expected named mode gap claims.');
    const gaps = Object.entries(raw);
    if (!gaps.length || gaps.length > LIMITS.maximumModes)
      fail(`${path}.valueGapClaimIdsByMode`, 'Expected one through four mode gaps.');
    valueGapClaimIdsByMode = {};
    for (const [mode, claimIds] of gaps.sort(([a], [b]) => compareText(a, b))) {
      id(mode, `${path}.valueGapClaimIdsByMode mode`);
      if (valuesByMode[mode])
        fail(
          `${path}.valueGapClaimIdsByMode.${mode}`,
          'A mode cannot have both an exact value and a missing-value claim.'
        );
      valueGapClaimIdsByMode[mode] = refs(
        claimIds,
        `${path}.valueGapClaimIdsByMode.${mode}`,
        LIMITS.maximumRefs,
        1
      );
    }
  }
  if (!entries.length && !valueGapClaimIdsByMode)
    fail(`${path}.valuesByMode`, 'Absent values require explicit mode-bound source gaps.');
  return {
    id: id(input.id, `${path}.id`),
    label: text(input.label, `${path}.label`),
    sourceId: id(input.sourceId, `${path}.sourceId`),
    valuesByMode,
    ...links(input, path),
    ...(valueGapClaimIdsByMode ? { valueGapClaimIdsByMode } : {}),
  };
}

function normalizeScale(value: unknown, path: string): ColorSystemAuthoredScaleV1 {
  const input = record(value, path, [
    'id',
    'label',
    'familyId',
    'slots',
    'modes',
    'evidenceRefs',
    'claimIds',
  ]);
  const slots = unique(
    array(input.slots, `${path}.slots`, LIMITS.maximumSlots, 1).map((raw, index) => {
      const here = `${path}.slots[${index}]`;
      const slot = record(raw, here, ['id', 'position']);
      return {
        id: id(slot.id, `${here}.id`),
        position: number(slot.position, `${here}.position`, 0, Number.MAX_SAFE_INTEGER),
      };
    }),
    slot => slot.id,
    `${path}.slots`
  );
  if (slots.some((slot, i) => i > 0 && slot.position <= slots[i - 1].position))
    fail(`${path}.slots`, 'Authored slot positions must be strictly increasing.');
  const positions = new Map(slots.map((slot, index) => [slot.id, index]));
  const modes = unique(
    array(input.modes, `${path}.modes`, LIMITS.maximumModes, 1).map((raw, index) => {
      const here = `${path}.modes[${index}]`;
      const mode = record(raw, here, ['modeId', 'anchors']);
      const anchors = unique(
        array(mode.anchors, `${here}.anchors`, LIMITS.maximumSlots, 1).map(
          (anchorRaw, anchorIndex) => {
            const anchorPath = `${here}.anchors[${anchorIndex}]`;
            const anchor = record(anchorRaw, anchorPath, ['slotId', 'colorId']);
            const slotId = id(anchor.slotId, `${anchorPath}.slotId`);
            if (!positions.has(slotId))
              fail(`${anchorPath}.slotId`, 'Unknown scale slot.', 'MODEL_REFERENCE_ERROR');
            return { slotId, colorId: id(anchor.colorId, `${anchorPath}.colorId`) };
          }
        ),
        anchor => anchor.slotId,
        `${here}.anchors`
      );
      if (
        anchors.some(
          (anchor, i) =>
            i > 0 && positions.get(anchor.slotId)! <= positions.get(anchors[i - 1].slotId)!
        )
      )
        fail(`${here}.anchors`, 'Anchors must follow their authored slot order.');
      return { modeId: id(mode.modeId, `${here}.modeId`), anchors };
    }),
    mode => mode.modeId,
    `${path}.modes`
  ).sort((a, b) => compareText(a.modeId, b.modeId));
  return {
    id: id(input.id, `${path}.id`),
    label: text(input.label, `${path}.label`),
    familyId: id(input.familyId, `${path}.familyId`),
    slots,
    modes,
    ...links(input, path),
  };
}

function normalizeAdoptions(
  value: unknown,
  rules: readonly ColorSystemScopedRuleV1[]
): ColorSystemRuleAdoptionV1[] {
  const rulesById = new Map(rules.map(rule => [rule.id, rule]));
  return unique(
    array(value, '$.adoptions', LIMITS.maximumRules).map(
      (raw, index): ColorSystemRuleAdoptionV1 => {
        const path = `$.adoptions[${index}]`;
        const item = record(raw, path, [
          'ruleId',
          'ruleHash',
          'dependencyHash',
          'status',
          'actor',
          'authorityRef',
          'decisionRef',
        ]);
        const ruleId = id(item.ruleId, `${path}.ruleId`);
        const rule = rulesById.get(ruleId);
        if (!rule) fail(`${path}.ruleId`, 'Unknown adopted rule.', 'MODEL_REFERENCE_ERROR');
        const ruleHash = hash(item.ruleHash, `${path}.ruleHash`);
        if (ruleHash !== exactHash(rule))
          fail(
            `${path}.ruleHash`,
            'Adoption does not bind the current rule.',
            'STALE_RULE_ADOPTION'
          );
        const actor = record(item.actor, `${path}.actor`, ['kind', 'ref']);
        return {
          ruleId,
          ruleHash,
          dependencyHash: hash(item.dependencyHash, `${path}.dependencyHash`),
          status: choice(item.status, ['accepted', 'rejected'] as const, `${path}.status`),
          actor: {
            kind: choice(actor.kind, ['user', 'agent'] as const, `${path}.actor.kind`),
            ref: text(actor.ref, `${path}.actor.ref`, LIMITS.maximumId),
          },
          authorityRef: text(item.authorityRef, `${path}.authorityRef`),
          decisionRef: text(item.decisionRef, `${path}.decisionRef`),
        };
      }
    ),
    adoption => adoption.ruleId,
    '$.adoptions'
  ).sort((a, b) => compareText(a.ruleId, b.ruleId));
}

/** Check the inert version tag before applying this version's field contract. */
function assertModelVersion(value: unknown): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail('$', 'Expected an object.');
  if (!Object.prototype.hasOwnProperty.call(value, 'schemaVersion'))
    fail('$.schemaVersion', 'Required field is missing.');
  const version = text((value as RecordValue).schemaVersion, '$.schemaVersion', LIMITS.maximumId);
  if (version !== COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION)
    fail(
      '$.schemaVersion',
      'Unsupported model version; preserve the original input for read-only inspection.',
      'UNSUPPORTED_MODEL_VERSION'
    );
}

function normalizeContent(value: unknown): ColorSystemModelInputV1 {
  assertModelVersion(value);
  const input = record(value, '$', MODEL_KEYS);
  const sources = entities(
    input.sources,
    '$.sources',
    LIMITS.maximumSources,
    (raw, path): ColorSystemSourceIdentityV1 => {
      const item = record(
        raw,
        path,
        ['id', 'label', 'sourceHash', 'version', 'locator', 'freshnessMode', 'status'],
        ['currentFileContentHash']
      );
      if (item.currentFileContentHash !== undefined && item.freshnessMode !== 'current-file')
        fail(
          `${path}.currentFileContentHash`,
          'Only current-file sources may carry a live re-read identity.'
        );
      return {
        id: id(item.id, `${path}.id`),
        label: text(item.label, `${path}.label`),
        sourceHash: hash(item.sourceHash, `${path}.sourceHash`),
        version: nullableText(item.version, `${path}.version`),
        locator: nullableText(item.locator, `${path}.locator`),
        freshnessMode: choice(
          item.freshnessMode,
          ['current-file', 'imported-snapshot'] as const,
          `${path}.freshnessMode`
        ),
        ...(item.currentFileContentHash === undefined
          ? {}
          : {
              currentFileContentHash: hash(
                item.currentFileContentHash,
                `${path}.currentFileContentHash`
              ),
            }),
        status: choice(
          item.status,
          ['approved', 'draft', 'historical', 'unknown'] as const,
          `${path}.status`
        ),
      };
    },
    1
  );
  const evidence = entities(
    input.evidence,
    '$.evidence',
    LIMITS.maximumEvidence,
    (raw, path): ColorSystemEvidenceV1 => {
      const item = record(raw, path, ['id', 'sourceId', 'locator', 'status', 'description']);
      return {
        id: id(item.id, `${path}.id`),
        sourceId: id(item.sourceId, `${path}.sourceId`),
        locator: nullableText(item.locator, `${path}.locator`),
        status: choice(item.status, STATUS, `${path}.status`),
        description: text(item.description, `${path}.description`),
      };
    }
  );
  const coverage = unique(
    array(input.coverage, '$.coverage', LIMITS.maximumSources, 1).map(
      (raw, index): ColorSystemCoverageV1 => {
        const path = `$.coverage[${index}]`;
        const item = record(raw, path, [
          'sourceId',
          'status',
          'evidenceRefs',
          'unresolvedClaimIds',
          'note',
        ]);
        return {
          sourceId: id(item.sourceId, `${path}.sourceId`),
          status: choice(
            item.status,
            ['complete', 'partial', 'unknown'] as const,
            `${path}.status`
          ),
          evidenceRefs: refs(item.evidenceRefs, `${path}.evidenceRefs`, LIMITS.maximumEvidence),
          unresolvedClaimIds: refs(
            item.unresolvedClaimIds,
            `${path}.unresolvedClaimIds`,
            LIMITS.maximumClaims
          ),
          note: text(item.note, `${path}.note`),
        };
      }
    ),
    item => item.sourceId,
    '$.coverage'
  ).sort((a, b) => compareText(a.sourceId, b.sourceId));
  const claims = entities(
    input.claims,
    '$.claims',
    LIMITS.maximumClaims,
    (raw, path): ColorSystemClaimV1 => {
      const item = record(
        raw,
        path,
        ['id', 'sourceId', 'text', 'status', 'evidenceRefs', 'contextIds', 'ruleIds'],
        ['modeIds']
      );
      return {
        id: id(item.id, `${path}.id`),
        sourceId: id(item.sourceId, `${path}.sourceId`),
        text: text(item.text, `${path}.text`),
        status: choice(item.status, STATUS, `${path}.status`),
        evidenceRefs: refs(item.evidenceRefs, `${path}.evidenceRefs`),
        contextIds: refs(item.contextIds, `${path}.contextIds`, LIMITS.maximumContexts),
        ruleIds: refs(item.ruleIds, `${path}.ruleIds`, LIMITS.maximumRules),
        ...(item.modeIds === undefined
          ? {}
          : { modeIds: refs(item.modeIds, `${path}.modeIds`, LIMITS.maximumModes) }),
      };
    }
  );
  const modes = entities(
    input.modes,
    '$.modes',
    LIMITS.maximumModes,
    (raw, path): ColorSystemNamedModeV1 => {
      const item = record(raw, path, ['id', 'label']);
      return { id: id(item.id, `${path}.id`), label: text(item.label, `${path}.label`) };
    },
    1
  );
  const colors = entities(input.colors, '$.colors', LIMITS.maximumColors, normalizeColor);
  const families = entities(
    input.families,
    '$.families',
    LIMITS.maximumFamilies,
    (raw, path): ColorSystemAuthoredFamilyV1 => {
      const item = record(raw, path, ['id', 'label', 'colorIds', 'evidenceRefs', 'claimIds']);
      return {
        id: id(item.id, `${path}.id`),
        label: text(item.label, `${path}.label`),
        colorIds: refs(item.colorIds, `${path}.colorIds`, LIMITS.maximumColors, 1),
        ...links(item, path),
      };
    }
  );
  const scales = entities(input.scales, '$.scales', LIMITS.maximumScales, normalizeScale);
  const contexts = entities(
    input.contexts,
    '$.contexts',
    LIMITS.maximumContexts,
    (raw, path): ColorSystemUsageContextV1 => {
      const item = record(raw, path, ['id', 'label', 'modeIds', 'evidenceRefs', 'claimIds']);
      return {
        id: id(item.id, `${path}.id`),
        label: text(item.label, `${path}.label`),
        modeIds: refs(item.modeIds, `${path}.modeIds`, LIMITS.maximumModes, 1),
        ...links(item, path),
      };
    },
    1
  );
  const brandConstraintsByContext = entities(
    input.brandConstraintsByContext,
    '$.brandConstraintsByContext',
    LIMITS.maximumContexts,
    (raw, path): ColorSystemScopedBrandConstraintsV1 => {
      const item = record(raw, path, ['id', 'sourceId', 'contextIds', 'fragment']);
      let fragment: ColorSystemBrandConstraintsV1;
      try {
        fragment = parseColorSystemBrandConstraintsV1(item.fragment);
      } catch (error) {
        fail(
          `${path}.fragment`,
          error instanceof Error ? error.message : 'Invalid reviewed brand constraints.'
        );
      }
      return {
        id: id(item.id, `${path}.id`),
        sourceId: id(item.sourceId, `${path}.sourceId`),
        contextIds: refs(item.contextIds, `${path}.contextIds`, LIMITS.maximumContexts, 1),
        fragment,
      };
    }
  );
  const rules = entities(input.rules, '$.rules', LIMITS.maximumRules, normalizeRule);
  if (
    rules.length +
      brandConstraintsByContext.reduce(
        (count, wrapper) => count + wrapper.fragment.rules.length,
        0
      ) >
    LIMITS.maximumRules
  )
    fail(
      '$.rules',
      'Typed and scoped territory rules together exceed 128 rules.',
      'MODEL_LIMIT_EXCEEDED'
    );
  const adoptions = normalizeAdoptions(input.adoptions, rules);
  const conflicts = entities(
    input.conflicts,
    '$.conflicts',
    LIMITS.maximumConflicts,
    (raw, path): ColorSystemSourceConflictV1 => {
      const item = record(
        raw,
        path,
        ['id', 'message', 'status', 'claimIds', 'evidenceRefs', 'contextIds', 'ruleIds'],
        ['resolutionClaimId', 'colorIds', 'modeIds']
      );
      const status = choice(item.status, ['unresolved', 'resolved'] as const, `${path}.status`);
      if (
        (status === 'resolved') !==
        Object.prototype.hasOwnProperty.call(item, 'resolutionClaimId')
      )
        fail(path, 'Only resolved conflicts require a separate resolution claim.');
      const contextIds = refs(item.contextIds, `${path}.contextIds`, LIMITS.maximumContexts);
      const ruleIds = refs(item.ruleIds, `${path}.ruleIds`, LIMITS.maximumRules);
      const colorIds =
        item.colorIds === undefined
          ? undefined
          : refs(item.colorIds, `${path}.colorIds`, LIMITS.maximumColors);
      if (!contextIds.length && !ruleIds.length && !colorIds?.length)
        fail(
          path,
          'Conflict requires explicit dependent contexts, rules, or colors.',
          'UNSUPPORTED_RULE_SCOPE'
        );
      return {
        id: id(item.id, `${path}.id`),
        message: text(item.message, `${path}.message`),
        status,
        claimIds: refs(item.claimIds, `${path}.claimIds`, LIMITS.maximumClaims, 2),
        evidenceRefs: refs(item.evidenceRefs, `${path}.evidenceRefs`, LIMITS.maximumRefs, 1),
        contextIds,
        ruleIds,
        ...(colorIds === undefined ? {} : { colorIds }),
        ...(item.modeIds === undefined
          ? {}
          : { modeIds: refs(item.modeIds, `${path}.modeIds`, LIMITS.maximumModes) }),
        ...(status === 'resolved'
          ? { resolutionClaimId: id(item.resolutionClaimId, `${path}.resolutionClaimId`) }
          : {}),
      };
    }
  );
  return {
    schemaVersion: COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
    sources,
    evidence,
    coverage,
    claims,
    modes,
    colors,
    families,
    scales,
    contexts,
    brandConstraintsByContext,
    rules,
    adoptions,
    conflicts,
  };
}

function validateReferences(model: ColorSystemModelInputV1): void {
  const sources = new Map(model.sources.map(item => [item.id, item]));
  const evidence = new Map(model.evidence.map(item => [item.id, item]));
  const claims = new Map(model.claims.map(item => [item.id, item]));
  const modes = new Set(model.modes.map(item => item.id));
  const colors = new Map(model.colors.map(item => [item.id, item]));
  const families = new Map(model.families.map(item => [item.id, item]));
  const scales = new Map(model.scales.map(item => [item.id, item]));
  const contexts = new Map(model.contexts.map(item => [item.id, item]));
  const rules = new Map(model.rules.map(item => [item.id, item]));
  const requireRefs = (
    refs: readonly string[],
    target: { has(key: string): boolean },
    path: string
  ) => {
    for (const ref of refs)
      if (!target.has(ref)) fail(path, `Unknown reference ${ref}.`, 'MODEL_REFERENCE_ERROR');
  };
  const requireSourceEvidence = (sourceId: string, refs: readonly string[], path: string) => {
    requireRefs([sourceId], sources, `${path}.sourceId`);
    requireRefs(refs, evidence, `${path}.evidenceRefs`);
    if (refs.some(ref => evidence.get(ref)!.sourceId !== sourceId))
      fail(path, 'Evidence belongs to a different source.', 'MODEL_REFERENCE_ERROR');
  };
  const requireLinks = (item: EvidenceLinksV1, path: string) => {
    requireRefs(item.evidenceRefs, evidence, `${path}.evidenceRefs`);
    requireRefs(item.claimIds, claims, `${path}.claimIds`);
  };
  for (const item of model.evidence)
    requireRefs([item.sourceId], sources, `$.evidence.${item.id}.sourceId`);
  for (const item of model.claims) {
    const path = `$.claims.${item.id}`;
    requireSourceEvidence(item.sourceId, item.evidenceRefs, path);
    requireRefs(item.contextIds, contexts, `${path}.contextIds`);
    requireRefs(item.ruleIds, rules, `${path}.ruleIds`);
    requireRefs(item.modeIds ?? [], modes, `${path}.modeIds`);
  }
  if (model.coverage.length !== model.sources.length)
    fail('$.coverage', 'Every source requires its own coverage record.', 'MODEL_REFERENCE_ERROR');
  for (const item of model.coverage) {
    const path = `$.coverage.${item.sourceId}`;
    requireSourceEvidence(item.sourceId, item.evidenceRefs, path);
    requireRefs(item.unresolvedClaimIds, claims, `${path}.unresolvedClaimIds`);
    if (item.unresolvedClaimIds.some(ref => claims.get(ref)!.sourceId !== item.sourceId))
      fail(path, 'Coverage claim belongs to a different source.', 'MODEL_REFERENCE_ERROR');
    const unresolved = model.claims.filter(
      claim =>
        claim.sourceId === item.sourceId &&
        ['unresolved', 'unsupported', 'contradicted'].includes(claim.status)
    );
    if (unresolved.some(claim => !item.unresolvedClaimIds.includes(claim.id)))
      fail(
        path,
        'Unresolved source claims must remain in the coverage ledger.',
        'MODEL_REFERENCE_ERROR'
      );
  }
  for (const item of model.colors) {
    const path = `$.colors.${item.id}`;
    requireSourceEvidence(item.sourceId, item.evidenceRefs, path);
    requireLinks(item, path);
    if (item.claimIds.some(ref => claims.get(ref)!.sourceId !== item.sourceId))
      fail(path, 'Color claim belongs to a different source.', 'MODEL_REFERENCE_ERROR');
    requireRefs(Object.keys(item.valuesByMode), modes, `${path}.valuesByMode`);
    for (const [mode, gapIds] of Object.entries(item.valueGapClaimIdsByMode ?? {})) {
      requireRefs([mode], modes, `${path}.valueGapClaimIdsByMode`);
      requireRefs(gapIds, claims, `${path}.valueGapClaimIdsByMode.${mode}`);
      if (
        gapIds.some(
          ref =>
            !item.claimIds.includes(ref) ||
            claims.get(ref)!.sourceId !== item.sourceId ||
            (!!claims.get(ref)!.modeIds?.length && !claims.get(ref)!.modeIds!.includes(mode)) ||
            !['unresolved', 'unsupported', 'contradicted'].includes(claims.get(ref)!.status)
        )
      )
        fail(
          `${path}.valueGapClaimIdsByMode.${mode}`,
          'Mode gaps require retained unresolved claims for this color and source.',
          'MODEL_REFERENCE_ERROR'
        );
    }
  }
  for (const item of model.families) {
    requireLinks(item, `$.families.${item.id}`);
    requireRefs(item.colorIds, colors, `$.families.${item.id}.colorIds`);
  }
  for (const item of model.scales) {
    const path = `$.scales.${item.id}`;
    requireLinks(item, path);
    requireRefs([item.familyId], families, `${path}.familyId`);
    for (const mode of item.modes) {
      requireRefs([mode.modeId], modes, `${path}.modes`);
      for (const anchor of mode.anchors) {
        requireRefs([anchor.colorId], colors, `${path}.anchors`);
        if (!families.get(item.familyId)!.colorIds.includes(anchor.colorId))
          fail(path, 'Scale anchor must belong to its authored family.', 'MODEL_REFERENCE_ERROR');
        const color = colors.get(anchor.colorId)!;
        if (!color.valuesByMode[mode.modeId] && !color.valueGapClaimIdsByMode?.[mode.modeId])
          fail(
            path,
            'Scale anchor has no exact value or explicit source gap for its authored mode.',
            'MODEL_REFERENCE_ERROR'
          );
      }
    }
  }
  for (const item of model.contexts) {
    requireLinks(item, `$.contexts.${item.id}`);
    requireRefs(item.modeIds, modes, `$.contexts.${item.id}.modeIds`);
  }
  const validateSelector = (
    selector: ColorSystemSelectorV1,
    modeIds: readonly string[],
    path: string
  ): void => {
    const target =
      selector.kind === 'color' ? colors : selector.kind === 'family' ? families : scales;
    requireRefs([selector.id], target, path);
    for (const mode of modeIds) {
      const hasMode = (color: ColorSystemSourceColorV1) =>
        !!color.valuesByMode[mode] || !!color.valueGapClaimIdsByMode?.[mode];
      const available =
        selector.kind === 'color'
          ? hasMode(colors.get(selector.id)!)
          : selector.kind === 'family'
            ? families.get(selector.id)!.colorIds.some(colorId => hasMode(colors.get(colorId)!))
            : scales.get(selector.id)!.modes.some(entry => entry.modeId === mode);
      if (!available)
        fail(path, `Selector has no authored value for mode ${mode}.`, 'UNSUPPORTED_RULE_SCOPE');
    }
  };
  for (const rule of model.rules) {
    const path = `$.rules.${rule.id}`;
    requireLinks(rule, path);
    requireRefs(rule.contextIds, contexts, `${path}.contextIds`);
    requireRefs(rule.modeIds, modes, `${path}.modeIds`);
    if (
      rule.contextIds.some(context =>
        rule.modeIds.some(mode => !contexts.get(context)!.modeIds.includes(mode))
      )
    )
      fail(path, 'Rule modes must be supported by every scoped context.', 'UNSUPPORTED_RULE_SCOPE');
    const op = rule.operands;
    const selected =
      'members' in op
        ? op.members
        : 'left' in op
          ? [...op.left, ...op.right]
          : 'subject' in op
            ? [...op.subject, ...op.partner]
            : op.groups.flat();
    selected.forEach(selector => validateSelector(selector, rule.modeIds, `${path}.operands`));
  }
  for (const wrapper of model.brandConstraintsByContext) {
    const path = `$.brandConstraintsByContext.${wrapper.id}`;
    requireRefs([wrapper.sourceId], sources, `${path}.sourceId`);
    requireRefs(wrapper.contextIds, contexts, `${path}.contextIds`);
    if (wrapper.fragment.sourceSnapshotHash !== sources.get(wrapper.sourceId)!.sourceHash)
      fail(
        `${path}.fragment.sourceSnapshotHash`,
        'Reviewed fragment must bind this source identity.',
        'MODEL_HASH_MISMATCH'
      );
    for (const rule of wrapper.fragment.rules)
      requireSourceEvidence(
        wrapper.sourceId,
        rule.evidenceRefs,
        `${path}.fragment.rules.${rule.id}`
      );
  }
  for (const conflict of model.conflicts) {
    const path = `$.conflicts.${conflict.id}`;
    requireLinks(conflict, path);
    requireRefs(conflict.contextIds, contexts, `${path}.contextIds`);
    requireRefs(conflict.ruleIds, rules, `${path}.ruleIds`);
    requireRefs(conflict.colorIds ?? [], colors, `${path}.colorIds`);
    requireRefs(conflict.modeIds ?? [], modes, `${path}.modeIds`);
    const claimEvidence = new Set(conflict.claimIds.flatMap(ref => claims.get(ref)!.evidenceRefs));
    if (conflict.evidenceRefs.some(ref => !claimEvidence.has(ref)))
      fail(path, 'Conflict evidence must identify its preserved claims.', 'MODEL_REFERENCE_ERROR');
    if (conflict.resolutionClaimId) {
      requireRefs([conflict.resolutionClaimId], claims, `${path}.resolutionClaimId`);
      if (conflict.claimIds.includes(conflict.resolutionClaimId))
        fail(path, 'Resolution must be a separate claim.');
    }
  }
}

function createRuleDependencyHasher(model: ColorSystemModelInputV1) {
  const colors = new Map(model.colors.map(item => [item.id, item]));
  const families = new Map(model.families.map(item => [item.id, item]));
  const scales = new Map(model.scales.map(item => [item.id, item]));
  const contexts = new Map(model.contexts.map(item => [item.id, item]));
  const claims = new Map(model.claims.map(item => [item.id, item]));
  const evidence = new Map(model.evidence.map(item => [item.id, item]));
  const recordHashes = new Map<string, string>();
  const seal = (kind: string, id: string, value: unknown) => {
    const key = canonicalJson([kind, id]);
    let contentHash = recordHashes.get(key);
    if (!contentHash) {
      contentHash = exactHash(value);
      recordHashes.set(key, contentHash);
    }
    return { id, contentHash };
  };
  const sorted = (ids: ReadonlySet<string>) => [...ids].sort(compareText);
  return (rule: ColorSystemScopedRuleV1): string => {
    const colorIds = new Set<string>();
    const familyIds = new Set<string>();
    const scaleIds = new Set<string>();
    const claimIds = new Set<string>();
    const evidenceIds = new Set<string>();
    const sourceIds = new Set<string>();
    const modeKey = canonicalJson(rule.modeIds);
    const claimMatches = (claim: ColorSystemClaimV1) =>
      (!claim.contextIds.length || claim.contextIds.some(id => rule.contextIds.includes(id))) &&
      (!claim.modeIds?.length || claim.modeIds.some(id => rule.modeIds.includes(id))) &&
      (!claim.ruleIds.length || claim.ruleIds.includes(rule.id));
    const scopedLinks = (item: EvidenceLinksV1) => ({
      evidenceRefs: item.evidenceRefs,
      claimIds: item.claimIds.filter(id => claimMatches(claims.get(id)!)),
    });
    const addLinks = (item: EvidenceLinksV1) => {
      item.evidenceRefs.forEach(id => evidenceIds.add(id));
      item.claimIds.forEach(id => {
        if (claimMatches(claims.get(id)!)) claimIds.add(id);
      });
    };
    const addSelector = (selector: ColorSystemSelectorV1) => {
      if (selector.kind === 'color') colorIds.add(selector.id);
      else if (selector.kind === 'family') {
        familyIds.add(selector.id);
        families.get(selector.id)!.colorIds.forEach(id => colorIds.add(id));
      } else {
        scaleIds.add(selector.id);
        const scale = scales.get(selector.id)!;
        familyIds.add(scale.familyId);
        scale.modes
          .filter(mode => rule.modeIds.includes(mode.modeId))
          .forEach(mode => mode.anchors.forEach(anchor => colorIds.add(anchor.colorId)));
      }
    };
    const op = rule.operands;
    const selectors =
      'members' in op
        ? op.members
        : 'left' in op
          ? [...op.left, ...op.right]
          : 'subject' in op
            ? [...op.subject, ...op.partner]
            : op.groups.flat();
    selectors.forEach(addSelector);
    addLinks(rule);
    rule.contextIds.forEach(id => addLinks(contexts.get(id)!));
    familyIds.forEach(id => addLinks(families.get(id)!));
    scaleIds.forEach(id => addLinks(scales.get(id)!));
    colorIds.forEach(id => {
      const color = colors.get(id)!;
      addLinks(color);
      sourceIds.add(color.sourceId);
      rule.modeIds.forEach(mode =>
        color.valueGapClaimIdsByMode?.[mode]?.forEach(id => claimIds.add(id))
      );
    });
    model.claims.forEach(claim => {
      if (
        claimMatches(claim) &&
        (claim.ruleIds.includes(rule.id) ||
          claim.contextIds.some(id => rule.contextIds.includes(id)))
      )
        claimIds.add(claim.id);
    });
    const conflicts = model.conflicts.filter(
      conflict =>
        (!conflict.contextIds.length ||
          conflict.contextIds.some(id => rule.contextIds.includes(id))) &&
        (!conflict.ruleIds.length || conflict.ruleIds.includes(rule.id)) &&
        (!conflict.colorIds?.length || conflict.colorIds.some(id => colorIds.has(id))) &&
        (!conflict.modeIds?.length || conflict.modeIds.some(id => rule.modeIds.includes(id)))
    );
    conflicts.forEach(conflict => {
      conflict.claimIds.forEach(id => claimIds.add(id));
      conflict.evidenceRefs.forEach(id => evidenceIds.add(id));
      if (conflict.resolutionClaimId) claimIds.add(conflict.resolutionClaimId);
    });
    claimIds.forEach(id => {
      const claim = claims.get(id)!;
      sourceIds.add(claim.sourceId);
      claim.evidenceRefs.forEach(id => evidenceIds.add(id));
    });
    evidenceIds.forEach(id => sourceIds.add(evidence.get(id)!.sourceId));
    return exactHash({
      version: 'teul.rule-dependencies.v1',
      ruleId: rule.id,
      ...(selectors.some(selector => selector.role !== undefined)
        ? { selectorRoles: selectors.filter(selector => selector.role !== undefined) }
        : {}),
      ...(rule.kind === 'color-count' && rule.operands.unit !== undefined
        ? { colorCountUnit: rule.operands.unit }
        : {}),
      ...(rule.kind === 'role-binding' && rule.operands.presence !== undefined
        ? { rolePresence: rule.operands.presence }
        : {}),
      modes: model.modes.filter(mode => rule.modeIds.includes(mode.id)),
      contexts: rule.contextIds.map(id => {
        const context = contexts.get(id)!;
        return {
          ...seal(`context/${modeKey}`, id, {
            id: context.id,
            label: context.label,
            modeIds: context.modeIds.filter(mode => rule.modeIds.includes(mode)),
          }),
          ...scopedLinks(context),
        };
      }),
      colors: sorted(colorIds).map(id => {
        const color = colors.get(id)!;
        const valuesByMode = Object.fromEntries(
          Object.entries(color.valuesByMode).filter(([mode]) => rule.modeIds.includes(mode))
        );
        const gaps = Object.entries(color.valueGapClaimIdsByMode ?? {}).filter(([mode]) =>
          rule.modeIds.includes(mode)
        );
        return {
          ...seal(`color/${modeKey}`, id, {
            id: color.id,
            label: color.label,
            sourceId: color.sourceId,
            valuesByMode,
            ...(gaps.length ? { valueGapClaimIdsByMode: Object.fromEntries(gaps) } : {}),
          }),
          ...scopedLinks(color),
        };
      }),
      families: sorted(familyIds).map(id => {
        const family = families.get(id)!;
        return {
          ...seal('family', id, { id, label: family.label, colorIds: family.colorIds }),
          ...scopedLinks(family),
        };
      }),
      scales: sorted(scaleIds).map(id => {
        const scale = scales.get(id)!;
        return {
          ...seal(`scale/${modeKey}`, id, {
            id,
            label: scale.label,
            familyId: scale.familyId,
            slots: scale.slots,
            modes: scale.modes.filter(mode => rule.modeIds.includes(mode.modeId)),
          }),
          ...scopedLinks(scale),
        };
      }),
      claims: sorted(claimIds).map(id => seal('claim', id, claims.get(id)!)),
      evidence: sorted(evidenceIds).map(id => seal('evidence', id, evidence.get(id)!)),
      sources: model.sources
        .filter(source => sourceIds.has(source.id))
        .map(source => seal('source', source.id, source)),
      coverage: model.coverage
        .filter(item => sourceIds.has(item.sourceId))
        .map(item => ({
          ...seal('coverage', item.sourceId, {
            sourceId: item.sourceId,
            status: item.status,
            note: item.note,
          }),
          evidenceRefs: item.evidenceRefs.filter(id => evidenceIds.has(id)),
          unresolvedClaimIds: item.unresolvedClaimIds.filter(id => claimIds.has(id)),
        })),
      conflicts: conflicts.map(conflict => seal('conflict', conflict.id, conflict)),
    });
  };
}

function normalizeAdoptionInput(value: unknown): ColorSystemModelInputV1 {
  assertJsonData(value);
  assertModelVersion(value);
  const input = record(value, '$', MODEL_KEYS, ['modelHash']);
  const { modelHash: _modelHash, ...content } = input;
  const normalized = normalizeContent({ ...content, adoptions: [] });
  validateReferences(normalized);
  return normalized;
}

/** Authoring helper: existing decisions and modelHash are omitted, never silently renewed. */
export function hashColorSystemRuleDependenciesV1(value: unknown, ruleId: string): string {
  const model = normalizeAdoptionInput(value);
  const rule = model.rules.find(rule => rule.id === ruleId);
  if (!rule) fail('$.ruleId', 'Unknown rule dependency target.', 'MODEL_REFERENCE_ERROR');
  return createRuleDependencyHasher(model)(rule);
}

/** Explicitly record new review decisions in one normalized pass. */
export function buildColorSystemRuleAdoptionsV1(
  value: unknown,
  decisions: readonly ColorSystemRuleAdoptionDecisionV1[]
): ColorSystemRuleAdoptionV1[] {
  const model = normalizeAdoptionInput(value);
  assertJsonData(decisions);
  const rules = new Map(model.rules.map(rule => [rule.id, rule]));
  const dependencyHash = createRuleDependencyHasher(model);
  const completed = array(decisions, '$.decisions', LIMITS.maximumRules).map((raw, index) => {
    const path = `$.decisions[${index}]`;
    const item = record(raw, path, ['ruleId', 'status', 'actor', 'authorityRef', 'decisionRef']);
    const ruleId = id(item.ruleId, `${path}.ruleId`);
    const rule = rules.get(ruleId);
    if (!rule) fail(`${path}.ruleId`, 'Unknown reviewed rule.', 'MODEL_REFERENCE_ERROR');
    return { ...item, ruleHash: exactHash(rule), dependencyHash: dependencyHash(rule) };
  });
  return normalizeAdoptions(completed, model.rules);
}

/** Explicit authoring operation; normalization does not infer roles, rules or approval. */
export function buildColorSystemModelV1(value: unknown): ColorSystemModelV1 {
  assertJsonData(value);
  const content = normalizeContent(value);
  validateReferences(content);
  const dependencyHash = createRuleDependencyHasher(content);
  const rules = new Map(content.rules.map(rule => [rule.id, rule]));
  for (const adoption of content.adoptions) {
    if (adoption.dependencyHash !== dependencyHash(rules.get(adoption.ruleId)!))
      fail(
        `$.adoptions.${adoption.ruleId}.dependencyHash`,
        'Adoption does not bind the current source and rule dependencies.',
        'STALE_RULE_ADOPTION'
      );
  }
  const model = { ...content, modelHash: exactHash(content) };
  if (utf8ByteLength(canonicalJson(model)) > LIMITS.maximumBytes)
    fail('$', 'Model including its hash exceeds 2 MiB UTF-8 JSON.', 'MODEL_LIMIT_EXCEEDED');
  return model;
}

/** JSON.parse normally drops duplicate object members; reject them before semantic import. */
function rejectDuplicateJsonFields(json: string): void {
  const stack: (Set<string> | null)[] = [];
  for (let index = 0; index < json.length; index += 1) {
    const char = json[index];
    if (char === '{' || char === '[') {
      stack.push(char === '{' ? new Set<string>() : null);
      if (stack.length > LIMITS.maximumDepth)
        fail('$', 'JSON nesting exceeds the bounded depth.', 'MODEL_LIMIT_EXCEEDED');
    } else if (char === '}' || char === ']') stack.pop();
    else if (char === '"') {
      const start = index;
      for (index += 1; index < json.length; index += 1) {
        if (json[index] === '\\') index += 1;
        else if (json[index] === '"') break;
      }
      let next = index + 1;
      while (/\s/.test(json[next] ?? '') && next < json.length) next += 1;
      if (json[next] === ':') {
        const key = JSON.parse(json.slice(start, index + 1)) as string;
        const keys = stack[stack.length - 1];
        if (keys?.has(key)) fail('$', `Duplicate JSON field ${key}.`);
        keys?.add(key);
      }
    }
  }
}

/** Verify supplied identity; callers keep rejected/unsupported original input outside this parser. */
export function parseColorSystemModelV1(value: unknown): ColorSystemModelV1 {
  if (isCapturedModel(value)) return copyCapturedData(value);
  let decoded = value;
  if (typeof value === 'string') {
    if (utf8ByteLength(value) > LIMITS.maximumBytes)
      fail('$', 'Model exceeds 2 MiB UTF-8 JSON.', 'MODEL_LIMIT_EXCEEDED');
    try {
      rejectDuplicateJsonFields(value);
      decoded = JSON.parse(value);
    } catch (error) {
      if (error instanceof ColorSystemModelV1Error) throw error;
      fail('$', 'Malformed JSON; original input must remain available for inspection.');
    }
  }
  assertJsonData(decoded);
  assertModelVersion(decoded);
  const input = record(decoded, '$', [...MODEL_KEYS, 'modelHash']);
  const expected = hash(input.modelHash, '$.modelHash');
  const { modelHash: _modelHash, ...content } = input;
  const result = buildColorSystemModelV1(content);
  if (result.modelHash !== expected)
    fail('$.modelHash', 'Model content does not match the supplied hash.', 'MODEL_HASH_MISMATCH');
  return result;
}

function isCapturedModel(value: unknown): value is ColorSystemModelV1 {
  return !!value && typeof value === 'object' && capturedModels.has(value as ColorSystemModelV1);
}

/** Already validated inert data only. Preserve numeric values, including negative zero. */
function copyCapturedData<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(copyCapturedData) as T;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, copyCapturedData(child)])
  ) as T;
}

function freezeCapturedData(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) freezeCapturedData(child);
  Object.freeze(value);
}

/**
 * Validate and detach once for a private computation. Capturing never freezes caller
 * data or grants source freshness/approval. Parsing a capture still returns a mutable copy.
 */
export function captureColorSystemModelV1(value: unknown): ColorSystemModelV1 {
  if (isCapturedModel(value)) return value;
  const model = parseColorSystemModelV1(value);
  freezeCapturedData(model);
  capturedModels.add(model);
  return model;
}

export function assertColorSystemModelV1Integrity(
  value: unknown
): asserts value is ColorSystemModelV1 {
  parseColorSystemModelV1(value);
}
