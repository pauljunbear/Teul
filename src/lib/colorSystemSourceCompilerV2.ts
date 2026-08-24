import { getRelativeLuminance } from './accessibility';
import { canonicalJson, deterministicContentHash } from './colorSystemAudit';
import {
  COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_SECTION_ROLES_V2,
  type ColorSystemBrandTerritoryV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemFamilyProminenceV2,
  type ColorSystemJobV2,
  type ColorSystemPolicyEvidenceAuthorityV2,
  type ColorSystemSectionDispositionV2,
  type ColorSystemSectionIntentV2,
  type ColorSystemSectionRoleV2,
} from './colorSystemBuilderV2Contracts';
import {
  assertColorSystemBuilderBriefV2Integrity,
  buildColorSystemBrandFitProfileV2,
  buildColorSystemBuilderBriefV2,
  buildColorSystemExactPrimaryLockV2,
} from './colorSystemBuilderV2Integrity';
import {
  COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS,
  type ColorSystemSecondaryDirectionRecipeV2,
  type ColorSystemSecondaryFamilySeedV2,
  type ColorSystemSecondaryScaleModeV2,
} from './colorSystemSecondaryEngineV2';
import {
  assertColorSystemGenericSourceSnapshotV2Integrity,
  type ColorSystemGenericSourceSnapshotV2,
  type GenericColorValueV2,
  type GenericColorVariableV2,
} from './colorSystemGenericSourceAdapterV2';
import {
  COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
  COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
  assertColorSystemGenericIntentProposalV2Integrity,
  assertColorSystemGenericOwnerConfirmationV2Integrity,
  type GenericIntakeProposalV2,
  type GenericOwnerConfirmationV2,
} from './colorSystemGenericIntentPolicyV2';
import {
  assertColorSystemGenericPolicyHandoffV2Integrity,
  type ColorSystemGenericPolicyHandoffV2,
} from './colorSystemGenericPolicyHandoffV2';
import {
  COLOR_SYSTEM_PRESENTATION_PROFILE_V2_SCHEMA_VERSION,
  assertColorSystemPresentationProfileV2ContentIntegrity,
  type ColorSystemPresentationProfileV2,
} from './colorSystemPresentationProfileV2';
import { compareText, hexToOklch, hexToRgb, rgbToHex } from './utils';

export const COLOR_SYSTEM_SOURCE_COMPILER_V2_SCHEMA_VERSION =
  'teul-color-system-source-compiler/v2' as const;
export const COLOR_SYSTEM_EVIDENCE_AUTHORITY_POLICY_VERSION = 'teul-evidence-authority/v1' as const;
export const COLOR_SYSTEM_GENERIC_SOURCE_BRIDGE_V2_VERSION =
  'teul-color-system-generic-source-bridge/v1' as const;
export const COLOR_SYSTEM_GENERIC_PRESENTATION_TEMPLATE_V2_VERSION =
  'teul-generic-five-frame-presentation-template/v1' as const;

const HASH = /^sha256:[0-9a-f]{64}$/;
const HEX = /^#[0-9A-F]{6}$/;
const SOURCE_SCHEMA = 'teul.color-builder-source-palette/1';
const MODES = ['Light', 'Dark'] as const;
const DISPOSITIONS = ['preserve', 'rebuild', 'derive', 'omit'] as const;
const PROMINENCE = ['supporting', 'accent', 'leading'] as const;
const JOBS = [
  'brand-primary',
  'marketing-accent',
  'product-graphics',
  'functional-iconography',
  'product-ui-surface',
  'product-semantics',
  'categorical-data',
  'sequential-data',
  'diverging-data',
  'rendered-text-pair',
] as const satisfies readonly ColorSystemJobV2[];
const SECONDARY_JOBS = new Set<ColorSystemJobV2>([
  'marketing-accent',
  'product-graphics',
  'functional-iconography',
  'product-ui-surface',
  'product-semantics',
  'categorical-data',
  'sequential-data',
  'diverging-data',
]);

type JsonRecord = Record<string, unknown>;

export type ColorSystemSourceCompilerV2ErrorCode =
  | 'INVALID_SOURCE_COMPILER_INPUT'
  | 'SOURCE_PALETTE_HASH_MISMATCH'
  | 'SOURCE_PACKAGE_HASH_MISMATCH'
  | 'EVIDENCE_AUTHORITY_MISMATCH'
  | 'UNSUPPORTED_PINK_LEADERSHIP'
  | 'UNAUTHORIZED_GRADIENT_POLICY'
  | 'GENERIC_HANDOFF_NOT_READY'
  | 'GENERIC_EXACT_SRGB_VALUE_UNSUPPORTED'
  | 'GENERIC_PRIMARY_INSUFFICIENT'
  | 'GENERIC_PRIMARY_CHROMATIC_ANCHOR_REQUIRED'
  | 'GENERIC_NEUTRALS_INSUFFICIENT'
  | 'GENERIC_NEUTRAL_SURFACE_POLARITY_REQUIRED'
  | 'GENERIC_POLARITY_ANCHORS_REQUIRED'
  | 'GENERIC_MODE_SUPPORT_INSUFFICIENT';

export class ColorSystemSourceCompilerV2Error extends Error {
  constructor(
    readonly code: ColorSystemSourceCompilerV2ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ColorSystemSourceCompilerV2Error';
  }
}

export interface ColorSystemSourceCompilerV2BindingInput {
  sourcePaletteHash: string;
  sourcePackageHash: string;
  sourceAuthorityHash: string;
  presentationProfileHash: string;
}

export interface ColorSystemSourceCompilerV2SectionIntentInput {
  role: ColorSystemSectionRoleV2;
  order: number;
  disposition: ColorSystemSectionDispositionV2;
  jobs: readonly ColorSystemJobV2[];
  guidance: string;
  evidenceIds: readonly string[];
  confirmation: 'source-evidenced' | 'owner-confirmed';
}

export interface ColorSystemSourceCompilerV2FamilyGroupInput {
  groupId: string;
  displayName: string;
  baseEntryId: string;
  lightEntryId: string;
  evidenceIds: readonly string[];
}

export interface ColorSystemSourceCompilerV2ModeAssignmentInput {
  entryId: string;
  mode: ColorSystemSecondaryScaleModeV2;
  authority: ColorSystemPolicyEvidenceAuthorityV2;
  evidenceIds: readonly string[];
}

export interface ColorSystemSourceCompilerV2EligibilityInput {
  modes: readonly ColorSystemSecondaryScaleModeV2[];
  steps: readonly number[];
  jobs: readonly ColorSystemJobV2[];
  evidenceIds: readonly string[];
}

export interface ColorSystemSourceCompilerV2FamilyRuleInput {
  groupId: string;
  territoryId: string;
  prominence: ColorSystemFamilyProminenceV2;
  authority: 'teul-proposal';
  baseHueOffsetDegrees: number;
  baseChromaScale: number;
  baseLightnessShift: number;
  directionRecipes: readonly ColorSystemSecondaryDirectionRecipeV2[];
  eligibilityEvidence: readonly ColorSystemSourceCompilerV2EligibilityInput[];
  evidenceIds: readonly string[];
}

export interface ColorSystemSourceCompilerV2JobMinimumInput {
  job: ColorSystemJobV2;
  minimumFamilies: number;
  authority: 'teul-policy-evidence';
  evidenceIds: readonly string[];
}

export interface ColorSystemSourceCompilerV2PolicyInput {
  territories: readonly ColorSystemBrandTerritoryV2[];
  familyRules: readonly ColorSystemSourceCompilerV2FamilyRuleInput[];
  jobMinimums: readonly ColorSystemSourceCompilerV2JobMinimumInput[];
  dataVisualization: {
    diverging: {
      negativeGroupId: string;
      positiveGroupId: string;
      authority: 'governed-source';
      evidenceIds: readonly string[];
    };
  };
  pink: {
    permission: 'supporting-only';
    groupIds: readonly string[];
    leadingExclusionTerritoryId: string;
    authority: 'governed-source';
    evidenceIds: readonly string[];
  };
  gradients: {
    authorized: false;
    authority: 'governed-source';
    evidenceIds: readonly string[];
  };
}

export interface CompileColorSystemSourceV2Input {
  version: typeof COLOR_SYSTEM_SOURCE_COMPILER_V2_SCHEMA_VERSION;
  sourcePalette: unknown;
  sourcePackage: unknown;
  bindings: ColorSystemSourceCompilerV2BindingInput;
  intent?: readonly ColorSystemSourceCompilerV2SectionIntentInput[] | null;
  familyGrouping?:
    | { kind: 'source-name-base-light-pairs'; evidenceIds: readonly string[] }
    | {
        kind: 'explicit';
        groups: readonly ColorSystemSourceCompilerV2FamilyGroupInput[];
        evidenceIds: readonly string[];
      }
    | null;
  modeAssignments?: readonly ColorSystemSourceCompilerV2ModeAssignmentInput[] | null;
  policy: ColorSystemSourceCompilerV2PolicyInput;
}

export interface ColorSystemSourceCompilerV2GovernedConstraintReceipt {
  version: 'teul-color-system-source-constraints/v2';
  pink: ColorSystemSourceCompilerV2PolicyInput['pink'];
  gradients: ColorSystemSourceCompilerV2PolicyInput['gradients'];
  constraintHash: string;
}

export interface ColorSystemSourceCompilerV2GenericConstraintReceipt {
  version: 'teul-color-system-generic-constraints/v2';
  proposalScope: 'secondary-color-families-only';
  authority: 'teul-policy-evidence';
  pink: {
    permission: 'not-classified';
    authority: 'teul-policy-evidence';
    evidenceIds: readonly string[];
  };
  gradients: {
    authorized: false;
    authority: 'teul-policy-evidence';
    evidenceIds: readonly string[];
  };
  evidenceIds: readonly string[];
  limitation: string;
  constraintHash: string;
}

export type ColorSystemSourceCompilerV2ConstraintReceipt =
  | ColorSystemSourceCompilerV2GovernedConstraintReceipt
  | ColorSystemSourceCompilerV2GenericConstraintReceipt;

export interface CompileColorSystemGenericPolicyHandoffSourceV2Input {
  snapshot: ColorSystemGenericSourceSnapshotV2;
  proposal: GenericIntakeProposalV2;
  confirmation: GenericOwnerConfirmationV2;
  handoff: ColorSystemGenericPolicyHandoffV2;
}

export type ColorSystemSourceCompilerV2Result =
  | {
      status: 'confirmation-required';
      brief: null;
      seeds: readonly [];
      compilationHash: null;
      confirmation: {
        code: 'SOURCE_AUTHORITY_CONFIRMATION_REQUIRED';
        missing: readonly ('intent' | 'family-grouping' | 'mode-assignments')[];
        question: string;
        consequence: string;
      };
    }
  | {
      status: 'ready';
      brief: ColorSystemBuilderBriefV2;
      seeds: readonly ColorSystemSecondaryFamilySeedV2[];
      groups: readonly ColorSystemSourceCompilerV2FamilyGroupInput[];
      constraints: ColorSystemSourceCompilerV2ConstraintReceipt;
      evidenceAuthorityPolicyVersion: typeof COLOR_SYSTEM_EVIDENCE_AUTHORITY_POLICY_VERSION;
      bindings: ColorSystemSourceCompilerV2BindingInput;
      sourcePaletteSemanticHash: string;
      compilationHash: string;
    };

interface SourceEntry {
  id: string;
  name: string;
  order: number;
  hex: string;
  alpha: number;
}

interface SourceSection {
  kind: ColorSystemSectionRoleV2;
  title: string;
  sourceNodeId: string;
  guidance: string | null;
  entries: SourceEntry[];
}

interface NormalizedSourcePalette {
  schemaVersion: typeof SOURCE_SCHEMA;
  fixtureId: string;
  classification: string;
  source: JsonRecord;
  sections: SourceSection[];
}

function fail(code: ColorSystemSourceCompilerV2ErrorCode, message: string): never {
  throw new ColorSystemSourceCompilerV2Error(code, message);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) fail('INVALID_SOURCE_COMPILER_INPUT', `${label} must be an object.`);
  return value;
}

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    fail('INVALID_SOURCE_COMPILER_INPUT', `${label} has missing or unsupported fields.`);
  }
}

function knownKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter(key => !keys.includes(key));
  if (unknown.length > 0) {
    fail(
      'INVALID_SOURCE_COMPILER_INPUT',
      `${label} contains unsupported fields: ${unknown.sort(compareText).join(', ')}.`
    );
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.includes('\u0000')) {
    fail('INVALID_SOURCE_COMPILER_INPUT', `${label} must be non-empty canonical text.`);
  }
  return value;
}

function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HASH.test(value)) {
    fail('INVALID_SOURCE_COMPILER_INPUT', `${label} must be a sha256 hash.`);
  }
  return value;
}

function finite(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(
      'INVALID_SOURCE_COMPILER_INPUT',
      `${label} must be finite from ${minimum} through ${maximum}.`
    );
  }
  return value;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  const parsed = finite(value, minimum, maximum, label);
  if (!Number.isInteger(parsed)) {
    fail('INVALID_SOURCE_COMPILER_INPUT', `${label} must be an integer.`);
  }
  return parsed;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail('INVALID_SOURCE_COMPILER_INPUT', `${label} must be an array.`);
  return value;
}

function uniqueText(values: unknown, label: string): string[] {
  const result = array(values, label).map((value, index) => text(value, `${label}[${index}]`));
  if (new Set(result).size !== result.length) {
    fail('INVALID_SOURCE_COMPILER_INPUT', `${label} must not contain duplicates.`);
  }
  return result.sort(compareText);
}

function mergeEvidence(...collections: readonly (readonly string[])[]): string[] {
  return [...new Set(collections.flat())].sort(compareText);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail('INVALID_SOURCE_COMPILER_INPUT', `${label} is unsupported.`);
  }
  return value as T;
}

function normalizeSourcePalette(value: unknown): NormalizedSourcePalette {
  const root = record(value, 'sourcePalette');
  exactKeys(
    root,
    ['schemaVersion', 'fixtureId', 'classification', 'source', 'sections'],
    'sourcePalette'
  );
  if (root.schemaVersion !== SOURCE_SCHEMA) {
    fail('INVALID_SOURCE_COMPILER_INPUT', 'Source palette schema is unsupported.');
  }
  const source = record(root.source, 'sourcePalette.source');
  exactKeys(
    source,
    [
      'fileKey',
      'rootNodeId',
      'sourceLocator',
      'documentProfile',
      'capturedAt',
      'captureMethod',
      'authority',
      'freshness',
      'limitations',
    ],
    'sourcePalette.source'
  );
  ['fileKey', 'rootNodeId', 'sourceLocator', 'capturedAt', 'captureMethod', 'authority'].forEach(
    key => text(source[key], `sourcePalette.source.${key}`)
  );
  if (source.documentProfile !== 'srgb') {
    fail('INVALID_SOURCE_COMPILER_INPUT', 'Source palette must declare the sRGB profile.');
  }
  uniqueText(source.limitations, 'sourcePalette.source.limitations');
  const freshness = record(source.freshness, 'sourcePalette.source.freshness');
  exactKeys(
    freshness,
    ['class', 'checkedAt', 'checkedAgainst', 'staleWhen'],
    'sourcePalette.source.freshness'
  );
  oneOf(freshness.class, ['immutable', 'versioned', 'live'], 'source freshness class');
  ['checkedAt', 'checkedAgainst', 'staleWhen'].forEach(key =>
    text(freshness[key], `sourcePalette.source.freshness.${key}`)
  );

  const sections = array(root.sections, 'sourcePalette.sections').map((rawSection, index) => {
    const section = record(rawSection, `sourcePalette.sections[${index}]`);
    exactKeys(
      section,
      ['kind', 'title', 'sourceNodeId', 'guidance', 'entries'],
      `sourcePalette.sections[${index}]`
    );
    const kind = oneOf(
      section.kind,
      COLOR_SYSTEM_SECTION_ROLES_V2,
      `sourcePalette.sections[${index}].kind`
    );
    if (kind !== COLOR_SYSTEM_SECTION_ROLES_V2[index]) {
      fail(
        'INVALID_SOURCE_COMPILER_INPUT',
        'Source palette sections must use the canonical five-role order.'
      );
    }
    const entries = array(section.entries, `${kind}.entries`).map((rawEntry, entryIndex) => {
      const entry = record(rawEntry, `${kind}.entries[${entryIndex}]`);
      exactKeys(entry, ['id', 'name', 'order', 'hex', 'alpha'], `${kind}.entries[${entryIndex}]`);
      const order = integer(entry.order, 1, 100_000, `${kind}.entries[${entryIndex}].order`);
      if (order !== entryIndex + 1) {
        fail('INVALID_SOURCE_COMPILER_INPUT', `${kind} entries must have contiguous source order.`);
      }
      const hexValue = text(entry.hex, `${kind}.entries[${entryIndex}].hex`);
      if (!HEX.test(hexValue)) {
        fail(
          'INVALID_SOURCE_COMPILER_INPUT',
          `${kind}.entries[${entryIndex}].hex must be canonical uppercase six-digit sRGB.`
        );
      }
      return {
        id: text(entry.id, `${kind}.entries[${entryIndex}].id`),
        name: text(entry.name, `${kind}.entries[${entryIndex}].name`),
        order,
        hex: hexValue,
        alpha: finite(entry.alpha, 0, 1, `${kind}.entries[${entryIndex}].alpha`),
      };
    });
    if (entries.length === 0) {
      fail('INVALID_SOURCE_COMPILER_INPUT', `${kind} must contain at least one source entry.`);
    }
    return {
      kind,
      title: text(section.title, `${kind}.title`),
      sourceNodeId: text(section.sourceNodeId, `${kind}.sourceNodeId`),
      guidance: section.guidance === null ? null : text(section.guidance, `${kind}.guidance`),
      entries,
    };
  });
  if (sections.length !== COLOR_SYSTEM_SECTION_ROLES_V2.length) {
    fail('INVALID_SOURCE_COMPILER_INPUT', 'Source palette must contain exactly five sections.');
  }
  const entryIds = sections.flatMap(section => section.entries.map(entry => entry.id));
  if (new Set(entryIds).size !== entryIds.length) {
    fail('INVALID_SOURCE_COMPILER_INPUT', 'Source entry identities must be globally unique.');
  }
  return {
    schemaVersion: SOURCE_SCHEMA,
    fixtureId: text(root.fixtureId, 'sourcePalette.fixtureId'),
    classification: text(root.classification, 'sourcePalette.classification'),
    source,
    sections,
  };
}

function normalizeBindings(value: unknown): ColorSystemSourceCompilerV2BindingInput {
  const bindings = record(value, 'bindings');
  exactKeys(
    bindings,
    ['sourcePaletteHash', 'sourcePackageHash', 'sourceAuthorityHash', 'presentationProfileHash'],
    'bindings'
  );
  return {
    sourcePaletteHash: hash(bindings.sourcePaletteHash, 'bindings.sourcePaletteHash'),
    sourcePackageHash: hash(bindings.sourcePackageHash, 'bindings.sourcePackageHash'),
    sourceAuthorityHash: hash(bindings.sourceAuthorityHash, 'bindings.sourceAuthorityHash'),
    presentationProfileHash: hash(
      bindings.presentationProfileHash,
      'bindings.presentationProfileHash'
    ),
  };
}

function normalizeGovernedEvidenceSourceIds(
  value: unknown,
  expectedPackageHash: string
): ReadonlySet<string> {
  if (deterministicContentHash(value) !== expectedPackageHash) {
    fail(
      'SOURCE_PACKAGE_HASH_MISMATCH',
      'The governed source package changed after its content hash was authorized.'
    );
  }
  const sourcePackage = record(value, 'sourcePackage');
  if (sourcePackage.schemaVersion !== 'source-to-system.source-package.v1') {
    fail('INVALID_SOURCE_COMPILER_INPUT', 'Source package schema is unsupported.');
  }
  const sources = array(sourcePackage.sources, 'sourcePackage.sources').map((value, index) => {
    const source = record(value, `sourcePackage.sources[${index}]`);
    const sourceId = text(source.sourceId, `sourcePackage.sources[${index}].sourceId`);
    const authority = text(source.authority, `sourcePackage.sources[${index}].authority`);
    text(source.locator, `sourcePackage.sources[${index}].locator`);
    return { sourceId, authority };
  });
  if (
    sources.length === 0 ||
    new Set(sources.map(source => source.sourceId)).size !== sources.length
  ) {
    fail(
      'INVALID_SOURCE_COMPILER_INPUT',
      'Source package must contain unique governed source identities.'
    );
  }
  const admissible = sources.filter(
    source =>
      source.authority.startsWith('canonical') || source.authority.startsWith('owner-approved')
  );
  return new Set(admissible.map(source => source.sourceId));
}

function governedEvidenceSourceId(evidenceId: string): string {
  const fragment = evidenceId.indexOf('#');
  return fragment === -1 ? evidenceId : evidenceId.slice(0, fragment);
}

function validateEvidenceAuthority(
  authority: unknown,
  evidenceIds: readonly string[],
  governedSourceIds: ReadonlySet<string>,
  label: string
): ColorSystemPolicyEvidenceAuthorityV2 {
  const normalized = oneOf(
    authority,
    ['governed-source', 'teul-proposal', 'teul-policy-evidence'],
    `${label}.authority`
  );
  if (evidenceIds.length === 0) {
    fail('EVIDENCE_AUTHORITY_MISMATCH', `${label} requires evidence.`);
  }
  if (normalized === 'governed-source') {
    const unresolved = evidenceIds.find(
      evidenceId => !governedSourceIds.has(governedEvidenceSourceId(evidenceId))
    );
    if (unresolved) {
      fail(
        'EVIDENCE_AUTHORITY_MISMATCH',
        `${label} claims owner/source authority through unresolved evidence id ${unresolved}.`
      );
    }
  } else {
    const prefix = normalized === 'teul-proposal' ? 'teul-proposal:' : 'teul-policy:';
    const masquerading = evidenceIds.find(evidenceId => !evidenceId.startsWith(prefix));
    if (masquerading) {
      fail(
        'EVIDENCE_AUTHORITY_MISMATCH',
        `${label} is ${normalized} but evidence id ${masquerading} masquerades as another authority.`
      );
    }
  }
  return normalized;
}

function colorValue(entry: SourceEntry): ColorSystemColorValueV2 {
  const rgb = hexToRgb(entry.hex);
  return {
    colorSpace: 'srgb',
    hex: entry.hex,
    components: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 },
    alpha: entry.alpha,
  };
}

function normalizeIntent(
  value: unknown,
  governedSourceIds: ReadonlySet<string>
): ColorSystemSectionIntentV2[] | null {
  if (value === undefined || value === null) return null;
  const raw = array(value, 'intent');
  if (raw.length !== COLOR_SYSTEM_SECTION_ROLES_V2.length) return null;
  return raw.map((item, index) => {
    const intent = record(item, `intent[${index}]`);
    exactKeys(
      intent,
      ['role', 'order', 'disposition', 'jobs', 'guidance', 'evidenceIds', 'confirmation'],
      `intent[${index}]`
    );
    const role = oneOf(intent.role, COLOR_SYSTEM_SECTION_ROLES_V2, `intent[${index}].role`);
    if (role !== COLOR_SYSTEM_SECTION_ROLES_V2[index]) {
      fail('INVALID_SOURCE_COMPILER_INPUT', 'Intent must use the canonical five-role order.');
    }
    const order = integer(intent.order, 1, 5, `intent[${index}].order`);
    if (order !== index + 1) {
      fail('INVALID_SOURCE_COMPILER_INPUT', 'Intent order must be contiguous.');
    }
    const jobs = uniqueText(intent.jobs, `intent[${index}].jobs`).map(job =>
      oneOf(job, JOBS, `intent[${index}].job`)
    );
    if (jobs.length === 0) {
      fail('INVALID_SOURCE_COMPILER_INPUT', `${role} intent requires at least one job.`);
    }
    const disposition = oneOf(intent.disposition, DISPOSITIONS, `${role}.disposition`);
    if ((role === 'primary' || role === 'typography') && disposition !== 'preserve') {
      fail(
        'INVALID_SOURCE_COMPILER_INPUT',
        'The v2 source compiler only preserves source values from confirmed Primary and Typography.'
      );
    }
    if (role !== 'primary' && role !== 'typography' && disposition === 'preserve') {
      fail(
        'INVALID_SOURCE_COMPILER_INPUT',
        'Secondary and application sections cannot enter preserved output in this compiler.'
      );
    }
    const evidenceIds = uniqueText(intent.evidenceIds, `${role}.evidenceIds`);
    validateEvidenceAuthority('governed-source', evidenceIds, governedSourceIds, `${role} intent`);
    return {
      role,
      order,
      disposition,
      jobs,
      guidance: text(intent.guidance, `${role}.guidance`),
      evidenceIds,
      confirmation: oneOf(
        intent.confirmation,
        ['source-evidenced', 'owner-confirmed'],
        `${role}.confirmation`
      ),
    };
  });
}

function deriveNameGroups(secondary: SourceSection): ColorSystemSourceCompilerV2FamilyGroupInput[] {
  const byName = new Map<string, SourceEntry>();
  for (const entry of secondary.entries) {
    const folded = entry.name.toLocaleLowerCase('en-US');
    if (byName.has(folded)) {
      fail('INVALID_SOURCE_COMPILER_INPUT', 'Secondary names must be uniquely identifiable.');
    }
    byName.set(folded, entry);
  }
  const groups: ColorSystemSourceCompilerV2FamilyGroupInput[] = [];
  for (const base of secondary.entries.filter(entry => !entry.name.endsWith(' Light'))) {
    const light = byName.get(`${base.name} light`.toLocaleLowerCase('en-US'));
    if (!light) return [];
    groups.push({
      groupId: `secondary-group:${base.id}`,
      displayName: base.name,
      baseEntryId: base.id,
      lightEntryId: light.id,
      evidenceIds: [`source-entry:${base.id}`, `source-entry:${light.id}`].sort(compareText),
    });
  }
  if (groups.length * 2 !== secondary.entries.length) return [];
  return groups;
}

function normalizeGroups(
  value: unknown,
  secondary: SourceSection,
  governedSourceIds: ReadonlySet<string>
): ColorSystemSourceCompilerV2FamilyGroupInput[] | null {
  if (value === undefined || value === null) return null;
  const grouping = record(value, 'familyGrouping');
  const kind = oneOf(grouping.kind, ['source-name-base-light-pairs', 'explicit'], 'grouping kind');
  if (kind === 'source-name-base-light-pairs') {
    exactKeys(grouping, ['kind', 'evidenceIds'], 'familyGrouping');
    const groupingEvidence = uniqueText(grouping.evidenceIds, 'familyGrouping.evidenceIds');
    if (groupingEvidence.length === 0) {
      fail('INVALID_SOURCE_COMPILER_INPUT', 'Family grouping requires evidence.');
    }
    validateEvidenceAuthority(
      'governed-source',
      groupingEvidence,
      governedSourceIds,
      'familyGrouping'
    );
    const groups = deriveNameGroups(secondary);
    return groups.length === 0
      ? null
      : groups.map(group => ({
          ...group,
          evidenceIds: mergeEvidence(group.evidenceIds, groupingEvidence),
        }));
  }
  exactKeys(grouping, ['kind', 'groups', 'evidenceIds'], 'familyGrouping');
  const groupingEvidence = uniqueText(grouping.evidenceIds, 'familyGrouping.evidenceIds');
  if (groupingEvidence.length === 0) {
    fail('INVALID_SOURCE_COMPILER_INPUT', 'Family grouping requires evidence.');
  }
  validateEvidenceAuthority(
    'governed-source',
    groupingEvidence,
    governedSourceIds,
    'familyGrouping'
  );
  const groups = array(grouping.groups, 'familyGrouping.groups').map((item, index) => {
    const group = record(item, `familyGrouping.groups[${index}]`);
    exactKeys(
      group,
      ['groupId', 'displayName', 'baseEntryId', 'lightEntryId', 'evidenceIds'],
      `familyGrouping.groups[${index}]`
    );
    return {
      groupId: text(group.groupId, `group[${index}].groupId`),
      displayName: text(group.displayName, `group[${index}].displayName`),
      baseEntryId: text(group.baseEntryId, `group[${index}].baseEntryId`),
      lightEntryId: text(group.lightEntryId, `group[${index}].lightEntryId`),
      evidenceIds: uniqueText(group.evidenceIds, `group[${index}].evidenceIds`),
    };
  });
  const entryIds = new Set(secondary.entries.map(entry => entry.id));
  const consumed = groups.flatMap(group => [group.baseEntryId, group.lightEntryId]);
  if (
    groups.length === 0 ||
    new Set(groups.map(group => group.groupId)).size !== groups.length ||
    new Set(consumed).size !== consumed.length ||
    consumed.some(id => !entryIds.has(id)) ||
    consumed.length !== secondary.entries.length
  ) {
    fail(
      'INVALID_SOURCE_COMPILER_INPUT',
      'Explicit Secondary groups must uniquely and completely cover source entries.'
    );
  }
  const sourceOrder = new Map(secondary.entries.map(entry => [entry.id, entry.order]));
  return groups
    .map(group => ({
      ...group,
      evidenceIds: mergeEvidence(group.evidenceIds, groupingEvidence),
    }))
    .sort(
      (left, right) =>
        (sourceOrder.get(left.baseEntryId) ?? 0) - (sourceOrder.get(right.baseEntryId) ?? 0) ||
        compareText(left.groupId, right.groupId)
    );
}

function normalizeModeAssignments(
  value: unknown,
  requiredEntryIds: readonly string[],
  governedSourceIds: ReadonlySet<string>
): Map<string, ColorSystemSourceCompilerV2ModeAssignmentInput> | null {
  if (value === undefined || value === null) return null;
  const assignments = array(value, 'modeAssignments').map((item, index) => {
    const assignment = record(item, `modeAssignments[${index}]`);
    exactKeys(
      assignment,
      ['entryId', 'mode', 'authority', 'evidenceIds'],
      `modeAssignments[${index}]`
    );
    const evidenceIds = uniqueText(assignment.evidenceIds, `modeAssignments[${index}].evidenceIds`);
    return {
      entryId: text(assignment.entryId, `modeAssignments[${index}].entryId`),
      mode: oneOf(assignment.mode, MODES, `modeAssignments[${index}].mode`),
      authority: validateEvidenceAuthority(
        assignment.authority,
        evidenceIds,
        governedSourceIds,
        `modeAssignments[${index}]`
      ),
      evidenceIds,
    };
  });
  if (assignments.some(assignment => assignment.evidenceIds.length === 0)) {
    fail('INVALID_SOURCE_COMPILER_INPUT', 'Every mode assignment requires evidence.');
  }
  if (new Set(assignments.map(assignment => assignment.entryId)).size !== assignments.length) {
    fail('INVALID_SOURCE_COMPILER_INPUT', 'Mode assignments must have unique entry identities.');
  }
  const required = [...requiredEntryIds].sort(compareText);
  const supplied = assignments.map(assignment => assignment.entryId).sort(compareText);
  if (canonicalJson(required) !== canonicalJson(supplied)) return null;
  return new Map(assignments.map(assignment => [assignment.entryId, assignment]));
}

function normalizePolicy(
  value: unknown,
  governedSourceIds: ReadonlySet<string>
): ColorSystemSourceCompilerV2PolicyInput {
  const policy = record(value, 'policy');
  exactKeys(
    policy,
    ['territories', 'familyRules', 'jobMinimums', 'dataVisualization', 'pink', 'gradients'],
    'policy'
  );
  const pink = record(policy.pink, 'policy.pink');
  exactKeys(
    pink,
    ['permission', 'groupIds', 'leadingExclusionTerritoryId', 'authority', 'evidenceIds'],
    'policy.pink'
  );
  if (pink.permission !== 'supporting-only') {
    fail('UNSUPPORTED_PINK_LEADERSHIP', 'Pink is authorized only as a supporting family.');
  }
  const gradients = record(policy.gradients, 'policy.gradients');
  exactKeys(gradients, ['authorized', 'authority', 'evidenceIds'], 'policy.gradients');
  if (gradients.authorized !== false) {
    fail(
      'UNAUTHORIZED_GRADIENT_POLICY',
      'The current source authority does not authorize generated gradients.'
    );
  }
  const dataVisualization = record(policy.dataVisualization, 'policy.dataVisualization');
  exactKeys(dataVisualization, ['diverging'], 'policy.dataVisualization');
  const diverging = record(dataVisualization.diverging, 'policy.dataVisualization.diverging');
  exactKeys(
    diverging,
    ['negativeGroupId', 'positiveGroupId', 'authority', 'evidenceIds'],
    'policy.dataVisualization.diverging'
  );
  const pinkEvidenceIds = uniqueText(pink.evidenceIds, 'policy.pink.evidenceIds');
  const gradientEvidenceIds = uniqueText(gradients.evidenceIds, 'policy.gradients.evidenceIds');
  const divergingEvidenceIds = uniqueText(
    diverging.evidenceIds,
    'policy.dataVisualization.diverging.evidenceIds'
  );
  const divergingAuthority = validateEvidenceAuthority(
    diverging.authority,
    divergingEvidenceIds,
    governedSourceIds,
    'policy.dataVisualization.diverging'
  );
  const pinkAuthority = validateEvidenceAuthority(
    pink.authority,
    pinkEvidenceIds,
    governedSourceIds,
    'policy.pink'
  );
  const gradientAuthority = validateEvidenceAuthority(
    gradients.authority,
    gradientEvidenceIds,
    governedSourceIds,
    'policy.gradients'
  );
  if (
    divergingAuthority !== 'governed-source' ||
    pinkAuthority !== 'governed-source' ||
    gradientAuthority !== 'governed-source'
  ) {
    fail(
      'EVIDENCE_AUTHORITY_MISMATCH',
      'Diverging meaning, pink exclusion, and gradient exclusion require governed source authority.'
    );
  }
  return {
    territories: array(
      policy.territories,
      'policy.territories'
    ) as unknown as ColorSystemBrandTerritoryV2[],
    familyRules: array(
      policy.familyRules,
      'policy.familyRules'
    ) as unknown as ColorSystemSourceCompilerV2FamilyRuleInput[],
    jobMinimums: array(
      policy.jobMinimums,
      'policy.jobMinimums'
    ) as unknown as ColorSystemSourceCompilerV2JobMinimumInput[],
    dataVisualization: {
      diverging: {
        negativeGroupId: text(
          diverging.negativeGroupId,
          'policy.dataVisualization.diverging.negativeGroupId'
        ),
        positiveGroupId: text(
          diverging.positiveGroupId,
          'policy.dataVisualization.diverging.positiveGroupId'
        ),
        authority: 'governed-source',
        evidenceIds: divergingEvidenceIds,
      },
    },
    pink: {
      permission: 'supporting-only',
      groupIds: uniqueText(pink.groupIds, 'policy.pink.groupIds'),
      leadingExclusionTerritoryId: text(
        pink.leadingExclusionTerritoryId,
        'policy.pink.leadingExclusionTerritoryId'
      ),
      authority: 'governed-source',
      evidenceIds: pinkEvidenceIds,
    },
    gradients: {
      authorized: false,
      authority: 'governed-source',
      evidenceIds: gradientEvidenceIds,
    },
  };
}

function confirmation(
  missing: readonly ('intent' | 'family-grouping' | 'mode-assignments')[]
): ColorSystemSourceCompilerV2Result {
  return {
    status: 'confirmation-required',
    brief: null,
    seeds: [],
    compilationHash: null,
    confirmation: {
      code: 'SOURCE_AUTHORITY_CONFIRMATION_REQUIRED',
      missing,
      question: `Confirm the ${missing.join(', ')} source decisions before Teul builds suggestions.`,
      consequence:
        'Without this evidence Teul cannot preserve exact modes or derive Secondary families without guessing.',
    },
  };
}

/**
 * Pure source-to-brief compilation. It reads supplied JSON only and has no
 * network, storage, randomness, clock, or Figma mutation capability.
 */
export function compileColorSystemSourceV2(input: unknown): ColorSystemSourceCompilerV2Result {
  const root = record(input, 'source compiler input');
  knownKeys(
    root,
    [
      'version',
      'sourcePalette',
      'sourcePackage',
      'bindings',
      'intent',
      'familyGrouping',
      'modeAssignments',
      'policy',
    ],
    'source compiler input'
  );
  if (root.version !== COLOR_SYSTEM_SOURCE_COMPILER_V2_SCHEMA_VERSION) {
    fail('INVALID_SOURCE_COMPILER_INPUT', 'Source compiler input is not the supported v2 schema.');
  }
  const sourcePalette = normalizeSourcePalette(root.sourcePalette);
  const bindings = normalizeBindings(root.bindings);
  const governedSourceIds = normalizeGovernedEvidenceSourceIds(
    root.sourcePackage,
    bindings.sourcePackageHash
  );
  const semanticSourceHash = deterministicContentHash(sourcePalette);
  if (semanticSourceHash !== bindings.sourcePaletteHash) {
    fail(
      'SOURCE_PALETTE_HASH_MISMATCH',
      'The structured source palette changed after its semantic hash was authorized.'
    );
  }
  const intent = normalizeIntent(root.intent, governedSourceIds);
  const secondary = sourcePalette.sections[1];
  const groups = normalizeGroups(root.familyGrouping, secondary, governedSourceIds);
  const requiredModeEntryIds = [
    ...sourcePalette.sections[0].entries.map(entry => entry.id),
    ...sourcePalette.sections[4].entries.map(entry => entry.id),
    ...(groups ?? []).map(group => group.baseEntryId),
  ];
  const modeAssignments = normalizeModeAssignments(
    root.modeAssignments,
    requiredModeEntryIds,
    governedSourceIds
  );
  const missing: ('intent' | 'family-grouping' | 'mode-assignments')[] = [];
  if (!intent) missing.push('intent');
  if (!groups || groups.length < 4 || groups.length > 12) missing.push('family-grouping');
  if (!modeAssignments) missing.push('mode-assignments');
  if (missing.length > 0) return confirmation(missing);

  const confirmedIntent = intent as ColorSystemSectionIntentV2[];
  const confirmedGroups = groups as ColorSystemSourceCompilerV2FamilyGroupInput[];
  const confirmedModes = modeAssignments as Map<
    string,
    ColorSystemSourceCompilerV2ModeAssignmentInput
  >;
  const policy = normalizePolicy(root.policy, governedSourceIds);
  const constraintsWithoutHash = {
    version: 'teul-color-system-source-constraints/v2' as const,
    pink: policy.pink,
    gradients: policy.gradients,
  };
  const constraints: ColorSystemSourceCompilerV2ConstraintReceipt = {
    ...constraintsWithoutHash,
    constraintHash: deterministicContentHash(constraintsWithoutHash),
  };
  const requiredSecondaryJobs = [
    ...new Set(
      confirmedIntent
        .filter(section => section.disposition === 'rebuild' || section.disposition === 'derive')
        .flatMap(section => section.jobs)
        .filter(job => SECONDARY_JOBS.has(job))
    ),
  ].sort(compareText);
  if (requiredSecondaryJobs.length === 0) {
    fail('INVALID_SOURCE_COMPILER_INPUT', 'Confirmed intent must declare Secondary consumer jobs.');
  }

  const brandFitProfile = buildColorSystemBrandFitProfileV2({
    version: 'teul-brand-fit-profile/v2',
    territories: policy.territories,
    evidenceIds: [
      ...policy.pink.evidenceIds,
      ...policy.gradients.evidenceIds,
      `constraint-receipt:${constraints.constraintHash}`,
    ],
  });
  const groupById = new Map(confirmedGroups.map(group => [group.groupId, group]));
  const groupRank = new Map(confirmedGroups.map((group, index) => [group.groupId, index]));
  const divergingPolicy = policy.dataVisualization.diverging;
  const negativeGroup = groupById.get(divergingPolicy.negativeGroupId);
  const positiveGroup = groupById.get(divergingPolicy.positiveGroupId);
  const dataVisualizationGuidance = sourcePalette.sections.find(
    section => section.kind === 'data-visualization'
  )?.guidance;
  if (
    !negativeGroup ||
    !positiveGroup ||
    negativeGroup.groupId === positiveGroup.groupId ||
    !dataVisualizationGuidance ||
    !dataVisualizationGuidance
      .toLocaleLowerCase('en-US')
      .includes(`use ${negativeGroup.displayName.toLocaleLowerCase('en-US')} for negative`) ||
    !dataVisualizationGuidance
      .toLocaleLowerCase('en-US')
      .includes(`${positiveGroup.displayName.toLocaleLowerCase('en-US')} for positive`)
  ) {
    fail(
      'INVALID_SOURCE_COMPILER_INPUT',
      'Diverging polarity must resolve to distinct Secondary groups and the governed Data Visualization guidance.'
    );
  }
  const familyRules = policy.familyRules
    .map((rule, index) => {
      const item = record(rule, `policy.familyRules[${index}]`);
      exactKeys(
        item,
        [
          'groupId',
          'territoryId',
          'prominence',
          'authority',
          'baseHueOffsetDegrees',
          'baseChromaScale',
          'baseLightnessShift',
          'directionRecipes',
          'eligibilityEvidence',
          'evidenceIds',
        ],
        `policy.familyRules[${index}]`
      );
      const groupId = text(rule.groupId, `policy.familyRules[${index}].groupId`);
      if (!groupById.has(groupId)) {
        fail('INVALID_SOURCE_COMPILER_INPUT', `${groupId} does not resolve to a Secondary group.`);
      }
      const prominence = oneOf(rule.prominence, PROMINENCE, `${groupId}.prominence`);
      const ruleEvidenceIds = uniqueText(rule.evidenceIds, `${groupId}.evidenceIds`);
      if (
        validateEvidenceAuthority(
          rule.authority,
          ruleEvidenceIds,
          governedSourceIds,
          `${groupId} family rule`
        ) !== 'teul-proposal'
      ) {
        fail(
          'EVIDENCE_AUTHORITY_MISMATCH',
          `${groupId} generated hue/chroma rule must be labeled as a Teul proposal.`
        );
      }
      if (policy.pink.groupIds.includes(groupId) && prominence !== 'supporting') {
        fail('UNSUPPORTED_PINK_LEADERSHIP', `${groupId} may remain supporting but cannot lead.`);
      }
      const territoryId = text(rule.territoryId, `${groupId}.territoryId`);
      const territory = brandFitProfile.territories.find(
        candidate => candidate.territoryId === territoryId
      );
      if (
        !territory ||
        territory.status === 'excluded' ||
        !territory.allowedProminence.includes(prominence) ||
        !territory.appliesToProminence.includes(prominence)
      ) {
        fail(
          'INVALID_SOURCE_COMPILER_INPUT',
          `${groupId} has no evidence-authorized territory and prominence.`
        );
      }
      const directionRecipes = array(rule.directionRecipes, `${groupId}.directionRecipes`)
        .map((rawRecipe, recipeIndex) => {
          const recipe = record(rawRecipe, `${groupId}.directionRecipes[${recipeIndex}]`);
          exactKeys(
            recipe,
            [
              'direction',
              'hueOffsetDegrees',
              'chromaScale',
              'lightnessShift',
              'authority',
              'evidenceIds',
            ],
            `${groupId}.directionRecipes[${recipeIndex}]`
          );
          const evidenceIds = uniqueText(
            recipe.evidenceIds,
            `${groupId}.directionRecipes[${recipeIndex}].evidenceIds`
          );
          if (evidenceIds.length === 0) {
            fail('INVALID_SOURCE_COMPILER_INPUT', `${groupId} direction requires evidence.`);
          }
          if (
            validateEvidenceAuthority(
              recipe.authority,
              evidenceIds,
              governedSourceIds,
              `${groupId}.directionRecipes[${recipeIndex}]`
            ) !== 'teul-proposal'
          ) {
            fail(
              'EVIDENCE_AUTHORITY_MISMATCH',
              `${groupId} direction recipe must be labeled as a Teul proposal.`
            );
          }
          return {
            direction: oneOf(
              recipe.direction,
              COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS,
              `${groupId}.direction`
            ),
            hueOffsetDegrees: finite(
              recipe.hueOffsetDegrees,
              -360,
              360,
              `${groupId}.hueOffsetDegrees`
            ),
            chromaScale: finite(recipe.chromaScale, 0.05, 2, `${groupId}.chromaScale`),
            lightnessShift: finite(recipe.lightnessShift, -0.25, 0.25, `${groupId}.lightnessShift`),
            authority: 'teul-proposal' as const,
            evidenceIds,
          };
        })
        .sort(
          (left, right) =>
            COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS.indexOf(left.direction) -
            COLOR_SYSTEM_SECONDARY_ENGINE_V2_DIRECTIONS.indexOf(right.direction)
        );
      if (
        directionRecipes.length === 0 ||
        new Set(directionRecipes.map(recipe => recipe.direction)).size !== directionRecipes.length
      ) {
        fail(
          'INVALID_SOURCE_COMPILER_INPUT',
          `${groupId} requires unique, evidence-bound directions.`
        );
      }
      const eligibilityEvidence = array(rule.eligibilityEvidence, `${groupId}.eligibilityEvidence`)
        .map((rawEligibility, eligibilityIndex) => {
          const eligibility = record(
            rawEligibility,
            `${groupId}.eligibilityEvidence[${eligibilityIndex}]`
          );
          exactKeys(
            eligibility,
            ['modes', 'steps', 'jobs', 'authority', 'evidenceIds'],
            `${groupId}.eligibilityEvidence[${eligibilityIndex}]`
          );
          const modes = uniqueText(
            eligibility.modes,
            `${groupId}.eligibilityEvidence[${eligibilityIndex}].modes`
          ).map(mode => oneOf(mode, MODES, `${groupId}.eligibility mode`));
          const steps = array(
            eligibility.steps,
            `${groupId}.eligibilityEvidence[${eligibilityIndex}].steps`
          )
            .map((step, stepIndex) =>
              integer(step, 1, 12, `${groupId}.eligibility step[${stepIndex}]`)
            )
            .sort((left, right) => left - right);
          const jobs = uniqueText(
            eligibility.jobs,
            `${groupId}.eligibilityEvidence[${eligibilityIndex}].jobs`
          ).map(job => oneOf(job, JOBS, `${groupId}.eligibility job`));
          const evidenceIds = uniqueText(
            eligibility.evidenceIds,
            `${groupId}.eligibilityEvidence[${eligibilityIndex}].evidenceIds`
          );
          if (
            validateEvidenceAuthority(
              eligibility.authority,
              evidenceIds,
              governedSourceIds,
              `${groupId}.eligibilityEvidence[${eligibilityIndex}]`
            ) !== 'teul-policy-evidence'
          ) {
            fail(
              'EVIDENCE_AUTHORITY_MISMATCH',
              `${groupId} job recipe must be labeled as Teul policy evidence.`
            );
          }
          if (
            modes.length === 0 ||
            steps.length === 0 ||
            new Set(steps).size !== steps.length ||
            jobs.length === 0 ||
            evidenceIds.length === 0 ||
            jobs.some(job => !requiredSecondaryJobs.includes(job)) ||
            jobs.some(job => !territory.allowedJobs.includes(job))
          ) {
            fail(
              'INVALID_SOURCE_COMPILER_INPUT',
              `${groupId} has invalid or unbound member/mode job eligibility.`
            );
          }
          return {
            modes,
            steps,
            jobs,
            authority: 'teul-policy-evidence' as const,
            evidenceIds,
          };
        })
        .sort((left, right) => compareText(canonicalJson(left), canonicalJson(right)));
      if (eligibilityEvidence.length === 0) {
        fail('INVALID_SOURCE_COMPILER_INPUT', `${groupId} requires job eligibility evidence.`);
      }
      const evidenceIds = ruleEvidenceIds;
      if (evidenceIds.length === 0) {
        fail('INVALID_SOURCE_COMPILER_INPUT', `${groupId} requires source evidence.`);
      }
      return {
        groupId,
        territoryId,
        prominence,
        authority: 'teul-proposal' as const,
        baseHueOffsetDegrees: finite(
          rule.baseHueOffsetDegrees,
          -360,
          360,
          `${groupId}.baseHueOffsetDegrees`
        ),
        baseChromaScale: finite(rule.baseChromaScale, 0.05, 2, `${groupId}.baseChromaScale`),
        baseLightnessShift: finite(
          rule.baseLightnessShift,
          -0.25,
          0.25,
          `${groupId}.baseLightnessShift`
        ),
        directionRecipes,
        eligibilityEvidence,
        evidenceIds,
      };
    })
    .sort(
      (left, right) =>
        (groupRank.get(left.groupId) ?? 0) - (groupRank.get(right.groupId) ?? 0) ||
        compareText(left.groupId, right.groupId)
    );
  if (
    familyRules.length !== confirmedGroups.length ||
    new Set(familyRules.map(rule => rule.groupId)).size !== confirmedGroups.length
  ) {
    fail(
      'INVALID_SOURCE_COMPILER_INPUT',
      'Every Secondary group requires exactly one evidence-scoped family rule.'
    );
  }

  const excludedPinkTerritory = brandFitProfile.territories.find(
    territory => territory.territoryId === policy.pink.leadingExclusionTerritoryId
  );
  if (
    !excludedPinkTerritory ||
    excludedPinkTerritory.status !== 'excluded' ||
    !excludedPinkTerritory.appliesToProminence.includes('leading') ||
    policy.pink.groupIds.some(groupId => !groupById.has(groupId)) ||
    policy.pink.evidenceIds.length === 0 ||
    policy.gradients.evidenceIds.length === 0
  ) {
    fail(
      'INVALID_SOURCE_COMPILER_INPUT',
      'Pink and gradient constraints require complete, evidence-bound exclusions.'
    );
  }

  const primary = sourcePalette.sections[0];
  const typography = sourcePalette.sections[4];
  const preservedColors = [primary, typography].flatMap(section =>
    section.entries.map(entry => {
      const assignment = confirmedModes.get(entry.id);
      if (!assignment) {
        fail('INVALID_SOURCE_COMPILER_INPUT', `Missing confirmed mode for ${entry.id}.`);
      }
      return {
        stableColorId: `source-color:${entry.id}`,
        displayName: entry.name,
        section: section.kind,
        order: entry.order,
        valuesByMode: { [assignment.mode]: colorValue(entry) },
        evidenceIds: mergeEvidence([`source-entry:${entry.id}`], assignment.evidenceIds),
      };
    })
  );
  const sourceReferenceColors = confirmedGroups.map(group => {
    const base = secondary.entries.find(entry => entry.id === group.baseEntryId);
    const assignment = confirmedModes.get(group.baseEntryId);
    if (!base || !assignment) {
      fail('INVALID_SOURCE_COMPILER_INPUT', `Secondary group ${group.groupId} lost its anchor.`);
    }
    return {
      stableColorId: `source-secondary-anchor:${base.id}`,
      displayName: base.name,
      sourceSection: 'secondary' as const,
      sourceOrder: base.order,
      valuesByMode: { [assignment.mode]: colorValue(base) },
      ...(group.groupId === divergingPolicy.negativeGroupId
        ? { applicationRoles: ['diverging-negative' as const] }
        : group.groupId === divergingPolicy.positiveGroupId
          ? { applicationRoles: ['diverging-positive' as const] }
          : {}),
      evidenceIds: mergeEvidence(
        group.evidenceIds,
        assignment.evidenceIds,
        group.groupId === divergingPolicy.negativeGroupId ||
          group.groupId === divergingPolicy.positiveGroupId
          ? divergingPolicy.evidenceIds
          : []
      ),
    };
  });
  const primaryLocks = primary.entries.map(entry => {
    const assignment = confirmedModes.get(entry.id);
    if (!assignment) fail('INVALID_SOURCE_COMPILER_INPUT', `Missing mode for ${entry.id}.`);
    return buildColorSystemExactPrimaryLockV2({
      version: 'teul-exact-primary-lock/v2',
      lockId: `primary-lock:${entry.id}`,
      stableColorId: `source-color:${entry.id}`,
      sourcePath: `${primary.sourceNodeId}/${entry.id}`,
      mode: assignment.mode,
      expectedValue: colorValue(entry),
      evidenceIds: mergeEvidence([`source-entry:${entry.id}`], assignment.evidenceIds),
    });
  });
  const jobMinimums = policy.jobMinimums.map((minimum, index) => {
    const item = record(minimum, `policy.jobMinimums[${index}]`);
    exactKeys(
      item,
      ['job', 'minimumFamilies', 'authority', 'evidenceIds'],
      `policy.jobMinimums[${index}]`
    );
    const evidenceIds = uniqueText(minimum.evidenceIds, `policy.jobMinimums[${index}].evidenceIds`);
    if (
      validateEvidenceAuthority(
        minimum.authority,
        evidenceIds,
        governedSourceIds,
        `policy.jobMinimums[${index}]`
      ) !== 'teul-policy-evidence'
    ) {
      fail(
        'EVIDENCE_AUTHORITY_MISMATCH',
        `policy.jobMinimums[${index}] must be labeled as Teul policy evidence.`
      );
    }
    return {
      job: oneOf(minimum.job, JOBS, `policy.jobMinimums[${index}].job`),
      minimumFamilies: integer(
        minimum.minimumFamilies,
        1,
        12,
        `policy.jobMinimums[${index}].minimumFamilies`
      ),
      authority: 'teul-policy-evidence' as const,
      evidenceIds,
    };
  });
  if (
    canonicalJson(jobMinimums.map(item => item.job).sort(compareText)) !==
    canonicalJson([...requiredSecondaryJobs].sort(compareText))
  ) {
    fail(
      'INVALID_SOURCE_COMPILER_INPUT',
      'Job minima must exactly cover the confirmed Secondary consumer jobs.'
    );
  }
  const target = Math.min(
    12,
    Math.max(4, confirmedGroups.length, ...jobMinimums.map(item => item.minimumFamilies))
  );
  if (target !== confirmedGroups.length) {
    return confirmation(['family-grouping']);
  }
  const brief = buildColorSystemBuilderBriefV2({
    version: COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    sourceHash: bindings.sourceAuthorityHash,
    sourcePackageHash: bindings.sourcePackageHash,
    brandFitProfileHash: brandFitProfile.profileHash,
    brandFitProfile,
    presentationProfileHash: bindings.presentationProfileHash,
    sections: confirmedIntent as unknown as ColorSystemBuilderBriefV2['sections'],
    preservedColors,
    sourceReferenceColors,
    primaryLocks,
    primaryLockIds: primaryLocks.map(lock => lock.lockId),
    secondaryTargetPolicy: {
      version: 'teul-secondary-target-policy/v2',
      derivationRule: 'max-retained-groups-and-job-minima-clamped',
      retainedSourceFamilyGroupIds: confirmedGroups.map(group => group.groupId),
      assemblyContributionIds: confirmedGroups.map(group => `assembly:${group.groupId}`),
      jobMinimums,
      evidenceIds: mergeEvidence(
        confirmedGroups.flatMap(group => group.evidenceIds),
        jobMinimums.flatMap(item => item.evidenceIds),
        [`constraint-receipt:${constraints.constraintHash}`]
      ),
    },
    secondaryTargetFamilyCount: target,
    requiredSecondaryJobs,
  });
  assertColorSystemBuilderBriefV2Integrity(brief);
  const referenceByGroup = new Map(
    confirmedGroups.map((group, index) => [group.groupId, sourceReferenceColors[index]])
  );
  const seeds = familyRules
    .map(rule => {
      const group = groupById.get(rule.groupId);
      const reference = referenceByGroup.get(rule.groupId);
      const assignment = group ? confirmedModes.get(group.baseEntryId) : undefined;
      if (!group || !reference || !assignment) {
        fail('INVALID_SOURCE_COMPILER_INPUT', `${rule.groupId} lost its source binding.`);
      }
      return {
        version: 'teul-secondary-family-seed/v2' as const,
        authority: 'teul-proposal' as const,
        seedId: `secondary-seed:${rule.groupId}`,
        displayName: group.displayName,
        contributionId: `assembly:${rule.groupId}`,
        sourceColorId: reference.stableColorId,
        sourceMode: assignment.mode,
        baseHueOffsetDegrees: rule.baseHueOffsetDegrees,
        baseChromaScale: rule.baseChromaScale,
        baseLightnessShift: rule.baseLightnessShift,
        territoryId: rule.territoryId,
        prominence: rule.prominence,
        directionRecipes: rule.directionRecipes,
        eligibilityEvidence: rule.eligibilityEvidence,
        evidenceIds: mergeEvidence(group.evidenceIds, rule.evidenceIds),
      };
    })
    .sort((left, right) => compareText(left.contributionId, right.contributionId));
  const resultContent = {
    version: COLOR_SYSTEM_SOURCE_COMPILER_V2_SCHEMA_VERSION,
    evidenceAuthorityPolicyVersion: COLOR_SYSTEM_EVIDENCE_AUTHORITY_POLICY_VERSION,
    bindings,
    sourcePaletteSemanticHash: semanticSourceHash,
    constraints,
    groups: confirmedGroups,
    brief,
    seeds,
  };
  return {
    status: 'ready',
    brief,
    seeds,
    groups: confirmedGroups,
    constraints,
    evidenceAuthorityPolicyVersion: COLOR_SYSTEM_EVIDENCE_AUTHORITY_POLICY_VERSION,
    bindings,
    sourcePaletteSemanticHash: semanticSourceHash,
    compilationHash: deterministicContentHash(resultContent),
  };
}

interface GenericResolvedVariableColorV2 {
  sourceRefId: string;
  stableColorId: string;
  displayName: string;
  role: ColorSystemSectionRoleV2;
  valuesByMode: Readonly<Record<string, ColorSystemColorValueV2>>;
  aliasTargetByMode: Readonly<Record<string, string | undefined>>;
  evidenceIds: readonly string[];
}

export type ColorSystemGenericCompilerPreflightBlockerCodeV2 = Extract<
  ColorSystemSourceCompilerV2ErrorCode,
  | 'GENERIC_HANDOFF_NOT_READY'
  | 'GENERIC_EXACT_SRGB_VALUE_UNSUPPORTED'
  | 'GENERIC_PRIMARY_INSUFFICIENT'
  | 'GENERIC_PRIMARY_CHROMATIC_ANCHOR_REQUIRED'
  | 'GENERIC_NEUTRALS_INSUFFICIENT'
  | 'GENERIC_NEUTRAL_SURFACE_POLARITY_REQUIRED'
  | 'GENERIC_MODE_SUPPORT_INSUFFICIENT'
>;

export interface ColorSystemGenericCompilerPreflightBlockerV2 {
  code: ColorSystemGenericCompilerPreflightBlockerCodeV2;
  message: string;
  sourceRefIds: readonly string[];
}

export type ColorSystemGenericCompilerPreflightResultV2 =
  | { status: 'ready'; blockers: readonly [] }
  | { status: 'blocked'; blockers: readonly ColorSystemGenericCompilerPreflightBlockerV2[] };

export interface PreflightColorSystemGenericSourceV2Input {
  snapshot: ColorSystemGenericSourceSnapshotV2;
  proposal: GenericIntakeProposalV2;
}

interface GenericSecondaryContributionRecipeV2 {
  contributionId: (typeof COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2)[number];
  displayName: string;
  baseHueOffsetDegrees: number;
  baseChromaScale: number;
  prominence: ColorSystemFamilyProminenceV2;
}

const GENERIC_SECONDARY_CONTRIBUTION_RECIPES_V2: readonly GenericSecondaryContributionRecipeV2[] = [
  {
    contributionId: 'generic-secondary-contribution-01',
    displayName: 'Teul Secondary A',
    baseHueOffsetDegrees: 0,
    baseChromaScale: 1,
    prominence: 'leading',
  },
  {
    contributionId: 'generic-secondary-contribution-02',
    displayName: 'Teul Secondary B',
    baseHueOffsetDegrees: 55,
    baseChromaScale: 0.96,
    prominence: 'accent',
  },
  {
    contributionId: 'generic-secondary-contribution-03',
    displayName: 'Teul Secondary C',
    baseHueOffsetDegrees: 115,
    baseChromaScale: 0.92,
    prominence: 'accent',
  },
  {
    contributionId: 'generic-secondary-contribution-04',
    displayName: 'Teul Secondary D',
    baseHueOffsetDegrees: 175,
    baseChromaScale: 0.9,
    prominence: 'supporting',
  },
  {
    contributionId: 'generic-secondary-contribution-05',
    displayName: 'Teul Secondary E',
    baseHueOffsetDegrees: 235,
    baseChromaScale: 0.94,
    prominence: 'supporting',
  },
  {
    contributionId: 'generic-secondary-contribution-06',
    displayName: 'Teul Secondary F',
    baseHueOffsetDegrees: 295,
    baseChromaScale: 0.98,
    prominence: 'supporting',
  },
] as const;

const GENERIC_SECONDARY_POLICY_EVIDENCE_ID =
  'teul-policy:generic-secondary-systematic-hue-coverage-v1';
const GENERIC_CHROMATIC_PRIMARY_MINIMUM_OKLCH_CHROMA = 0.04;

function genericSourceAuthorityHash(handoff: ColorSystemGenericPolicyHandoffV2): string {
  return deterministicContentHash({
    bridgeVersion: COLOR_SYSTEM_GENERIC_SOURCE_BRIDGE_V2_VERSION,
    sourceSnapshotHash: handoff.sourceSnapshotHash,
    proposalHash: handoff.proposalHash,
    confirmationHash: handoff.confirmationHash,
    handoffHash: handoff.handoffHash,
  });
}

function genericPresentationTemplateHash(): string {
  return deterministicContentHash({
    version: COLOR_SYSTEM_GENERIC_PRESENTATION_TEMPLATE_V2_VERSION,
    frame: { width: 9540, height: 5391, siblingGap: 40 },
    layout: {
      padding: 340,
      header: { x: 340, y: 340, width: 8860, height: 368 },
      palette: { x: 340, y: 2051, width: 8860, height: 3000 },
    },
    typography: 'Inter',
    boundary: 'none-or-monochrome-inside-1px',
    roles: COLOR_SYSTEM_SECTION_ROLES_V2,
  });
}

/**
 * Teul-owned presentation grammar. Template geometry is implementation policy;
 * section colors and authority remain bound to the exact generic handoff.
 */
export function buildColorSystemGenericPresentationProfileV2(
  input: CompileColorSystemGenericPolicyHandoffSourceV2Input
): ColorSystemPresentationProfileV2 {
  assertColorSystemGenericPolicyHandoffV2Integrity(
    input.snapshot,
    input.proposal,
    input.confirmation,
    input.handoff
  );
  const sourceAuthorityHash = genericSourceAuthorityHash(input.handoff);
  const sourcePackageHash = input.handoff.handoffHash;
  const sectionGuidance: Readonly<Record<ColorSystemSectionRoleV2, string>> = {
    primary: 'Preserve the exact owner-confirmed Primary colors and source modes.',
    secondary:
      'Review six systematic Teul-proposed Secondary families derived from the protected Primary anchor. These are proposals, not observed brand colors.',
    'product-graphics':
      'Use only measured job-eligible Secondary members for product graphics, functional iconography, and product UI surfaces.',
    'data-visualization':
      'Use measured categorical, sequential, and owner-confirmed diverging selections with non-color cues.',
    typography:
      'Preserve exact observed neutral colors and show accessibility only for rendered foreground/background pairs.',
  };
  const rowsByRole: Readonly<
    Record<
      ColorSystemSectionRoleV2,
      readonly ColorSystemPresentationProfileV2['sections'][number]['rows'][number][]
    >
  > = {
    primary: [
      { count: 6, width: 8860, height: 1460, cardWidth: 1410 },
      { count: 6, width: 8860, height: 1460, cardWidth: 1410 },
    ],
    secondary: [
      { count: 6, width: 8860, height: 1460, cardWidth: 1410 },
      { count: 6, width: 8860, height: 1460, cardWidth: 1410 },
    ],
    'product-graphics': [{ count: 3, width: 8860, height: 3000, cardWidth: 2900 }],
    'data-visualization': [
      { count: 6, width: 8860, height: 1460, cardWidth: 1410 },
      { count: 5, width: 7370, height: 1460, cardWidth: 1410 },
    ],
    typography: [{ count: 4, width: 8860, height: 3000, cardWidth: 2155 }],
  };
  const sections = COLOR_SYSTEM_SECTION_ROLES_V2.map((role, index) => ({
    role,
    order: index + 1,
    sourceNodeId: `teul-template:${role}`,
    headerNodeId: `teul-template:${role}:header`,
    paletteNodeId: `teul-template:${role}:palette`,
    headerHeight: role === 'data-visualization' ? 1066 : 368,
    guidance: sectionGuidance[role],
    guidancePlacement: 'header-right' as const,
    contentAuthorityRef: `generic-handoff:${input.handoff.handoffHash}#${role}`,
    rows: rowsByRole[role],
    metadataOrder: ['name', 'hex', 'rgba', 'source-or-proposal', 'rating'],
  })) as unknown as ColorSystemPresentationProfileV2['sections'];
  const content: Omit<ColorSystemPresentationProfileV2, 'profileHash'> = {
    version: COLOR_SYSTEM_PRESENTATION_PROFILE_V2_SCHEMA_VERSION,
    sourceAuthorityHash,
    sourcePackageHash,
    presentationEvidenceHash: genericPresentationTemplateHash(),
    frame: {
      width: 9540,
      height: 5391,
      backgroundHex: '#FFFFFF',
      siblingGap: 40,
      padding: 340,
      layoutAxis: 'vertical',
      horizontalAlignment: 'center',
      distribution: 'space-between',
      header: {
        x: 340,
        y: 340,
        width: 8860,
        defaultHeight: 368,
        titleGroupGap: 82,
        guidanceX: 5115,
        guidanceWidth: 3745,
      },
      palette: {
        x: 340,
        y: 2051,
        width: 8860,
        height: 3000,
        rowGap: 80,
        cardGap: 80,
        cardPadding: 80,
        cardContentGap: 80,
        cardCornerRadius: 32,
        cardContentAlignment: 'bottom-left',
        cardClipContent: true,
      },
      explicitLayoutGrid: 'none-governing',
    },
    typography: [
      {
        role: 'brand-title-and-section-title',
        fontFamily: 'Inter',
        fontStyle: 'Regular',
        fontSize: 200,
        lineHeight: 210,
        lineHeightMultiplier: null,
        letterSpacing: 0,
        sections: COLOR_SYSTEM_SECTION_ROLES_V2,
      },
      {
        role: 'guidance',
        fontFamily: 'Inter',
        fontStyle: 'Regular',
        fontSize: 120,
        lineHeight: 140,
        lineHeightMultiplier: null,
        letterSpacing: 0,
        sections: COLOR_SYSTEM_SECTION_ROLES_V2,
      },
      {
        role: 'card-label-and-metadata',
        fontFamily: 'Inter',
        fontStyle: 'Regular',
        fontSize: 80,
        lineHeight: null,
        lineHeightMultiplier: 1.1,
        letterSpacing: 0,
        sections: COLOR_SYSTEM_SECTION_ROLES_V2,
      },
    ],
    sections,
    cardBoundaryPolicy: {
      kind: 'none-or-monochrome-inside-1px',
      allowedColors: ['#000000', '#FFFFFF'],
      forbidden: ['nested-inside-outside-outline', 'double-outline'],
    },
    rendererClaimBoundary: {
      authoringProfile: 'srgb',
      claim:
        'Values are authored as sRGB and accessibility is assessed only for exact rendered pairs.',
      limitations: [
        'Display appearance varies with monitor calibration, brightness, operating system, and color management.',
        'The template does not claim physical-screen equivalence or palette-level accessibility.',
      ],
      renderAuthority: 'comparison-only',
    },
  };
  const profile = { ...content, profileHash: deterministicContentHash(content) };
  assertColorSystemPresentationProfileV2ContentIntegrity(profile);
  return profile;
}

/**
 * The generic adapter retains arbitrary normalized sRGB components, but the
 * existing v2 brief/lock graph defines exactness as six-digit hex plus matching
 * byte channels. Rejecting here preserves source fidelity; rounding here would
 * silently change the owner source before hashing and mutation.
 */
function exactGenericSrgbColor(value: GenericColorValueV2, label: string): ColorSystemColorValueV2 {
  if (value.colorSpace !== 'srgb') {
    fail('GENERIC_EXACT_SRGB_VALUE_UNSUPPORTED', `${label} is not an exact supported sRGB value.`);
  }
  const channels = value.components.map(component => {
    const channel = component * 255;
    const rounded = Math.round(channel);
    if (Math.abs(channel - rounded) > 1e-9) {
      fail(
        'GENERIC_EXACT_SRGB_VALUE_UNSUPPORTED',
        `${label} cannot enter the current v2 builder: its normalized sRGB channels do not exactly equal six-digit sRGB byte channels. The generic adapter preserves the source components, but v2 brief, lock, integrity, and mutation contracts require hex-matched byte components and must not silently quantize them.`
      );
    }
    return rounded;
  }) as [number, number, number];
  const hex = rgbToHex(channels[0], channels[1], channels[2]).toUpperCase();
  return {
    colorSpace: 'srgb',
    hex,
    components: {
      r: channels[0] / 255,
      g: channels[1] / 255,
      b: channels[2] / 255,
    },
    alpha: value.alpha,
  };
}

function resolveGenericStaticColor(
  value: GenericColorValueV2,
  sourceRefId: string,
  displayName: string,
  role: ColorSystemSectionRoleV2,
  evidenceIds: readonly string[]
): GenericResolvedVariableColorV2 {
  const exact = exactGenericSrgbColor(value, sourceRefId);
  return {
    sourceRefId,
    stableColorId: `generic-source-color:${role}:${sourceRefId}`,
    displayName,
    role,
    valuesByMode: { Light: exact, Dark: exact },
    aliasTargetByMode: {},
    evidenceIds: mergeEvidence(evidenceIds),
  };
}

function canonicalGenericModeName(modeName: string): string {
  const folded = modeName.toLocaleLowerCase('en-US');
  return folded === 'light' ? 'Light' : folded === 'dark' ? 'Dark' : modeName;
}

function resolveGenericVariable(
  variable: GenericColorVariableV2,
  sourceRefId: string,
  role: ColorSystemSectionRoleV2,
  evidenceIds: readonly string[]
): GenericResolvedVariableColorV2 {
  if (variable.valuesByMode.length === 0 || variable.valuesByMode.length > 4) {
    fail(
      'GENERIC_MODE_SUPPORT_INSUFFICIENT',
      `${sourceRefId} must expose one through four exact local modes.`
    );
  }
  const valuesByMode: Record<string, ColorSystemColorValueV2> = Object.create(null);
  const aliasTargetByMode: Record<string, string | undefined> = Object.create(null);
  variable.valuesByMode.forEach(mode => {
    const name = canonicalGenericModeName(mode.modeName);
    if (valuesByMode[name]) {
      fail(
        'GENERIC_MODE_SUPPORT_INSUFFICIENT',
        `${sourceRefId} contains duplicate canonical mode ${name}.`
      );
    }
    const resolved =
      mode.resolution === 'literal' && mode.rawValue.kind === 'color'
        ? mode.rawValue.value
        : mode.resolution === 'resolved-alias'
          ? mode.resolvedValue
          : undefined;
    if (!resolved) {
      fail(
        'GENERIC_MODE_SUPPORT_INSUFFICIENT',
        `${sourceRefId}/${mode.modeName} is missing an exact resolved local color.`
      );
    }
    valuesByMode[name] = exactGenericSrgbColor(resolved, `${sourceRefId}/${mode.modeName}`);
    aliasTargetByMode[name] =
      mode.rawValue.kind === 'alias' ? mode.rawValue.targetVariableId : undefined;
  });
  return {
    sourceRefId,
    stableColorId: `generic-source-color:${role}:${sourceRefId}`,
    displayName: variable.name,
    role,
    valuesByMode,
    aliasTargetByMode,
    evidenceIds: mergeEvidence(variable.evidenceIds, evidenceIds),
  };
}

function resolveGenericPreservedColors(
  input: CompileColorSystemGenericPolicyHandoffSourceV2Input
): GenericResolvedVariableColorV2[] {
  return resolveGenericSourceLocks(input.snapshot, input.proposal, input.handoff.sourceLocks);
}

function resolveGenericSourceLocks(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  proposal: GenericIntakeProposalV2,
  locks: readonly {
    sourceRefId: string;
    role: ColorSystemSectionRoleV2;
    evidenceIds: readonly string[];
    ownerDecisionRuleId?: string;
  }[]
): GenericResolvedVariableColorV2[] {
  const refs = new Map(proposal.observedSourceRefs.map(ref => [ref.sourceRefId, ref]));
  const variables = new Map(snapshot.variables.map(variable => [variable.variableId, variable]));
  const paintStyles = new Map(snapshot.paintStyles.map(style => [style.styleId, style]));
  const paletteEntries = new Map(
    snapshot.paletteStructures.flatMap(structure =>
      structure.entries.map(
        entry => [entry.entryId, { entry, structureEvidenceIds: structure.evidenceIds }] as const
      )
    )
  );
  return locks
    .map(lock => {
      const ref = refs.get(lock.sourceRefId);
      if (!ref) {
        fail('GENERIC_HANDOFF_NOT_READY', `${lock.sourceRefId} lost its observed source.`);
      }
      const authorityEvidenceIds = [
        ...lock.evidenceIds,
        ...(lock.ownerDecisionRuleId ? [lock.ownerDecisionRuleId] : []),
      ];
      if (ref.sourceKind === 'variable') {
        const variable = variables.get(ref.localId);
        if (!variable) {
          fail('GENERIC_HANDOFF_NOT_READY', `${lock.sourceRefId} lost its observed Variable.`);
        }
        return resolveGenericVariable(variable, lock.sourceRefId, lock.role, authorityEvidenceIds);
      }
      if (ref.sourceKind === 'paint-style') {
        const style = paintStyles.get(ref.localId);
        if (
          !style ||
          style.governingEligibility !== 'eligible' ||
          style.directDeclaration === null
        ) {
          fail(
            'GENERIC_MODE_SUPPORT_INSUFFICIENT',
            `${lock.sourceRefId} is not an eligible exact single-solid Paint Style declaration.`
          );
        }
        if (style.directDeclaration.kind === 'literal') {
          return resolveGenericStaticColor(
            style.directDeclaration.value,
            lock.sourceRefId,
            style.name,
            lock.role,
            mergeEvidence(style.evidenceIds, authorityEvidenceIds)
          );
        }
        const targetVariableId = style.directDeclaration.targetVariableId;
        const variable = variables.get(targetVariableId);
        if (!variable) {
          fail(
            'GENERIC_MODE_SUPPORT_INSUFFICIENT',
            `${lock.sourceRefId} aliases missing local Variable ${targetVariableId}.`
          );
        }
        const resolved = resolveGenericVariable(
          variable,
          lock.sourceRefId,
          lock.role,
          mergeEvidence(style.evidenceIds, variable.evidenceIds, authorityEvidenceIds)
        );
        return {
          ...resolved,
          stableColorId: `generic-source-color:${lock.role}:${lock.sourceRefId}`,
          displayName: style.name,
          aliasTargetByMode: Object.fromEntries(
            Object.keys(resolved.valuesByMode).map(mode => [mode, targetVariableId])
          ),
        };
      }
      const palette = paletteEntries.get(ref.localId);
      if (!palette) {
        fail('GENERIC_HANDOFF_NOT_READY', `${lock.sourceRefId} lost its observed palette entry.`);
      }
      if (ref.sourceKind !== 'palette-entry') {
        fail(
          'GENERIC_MODE_SUPPORT_INSUFFICIENT',
          `${lock.sourceRefId} uses an unsupported preserved source kind.`
        );
      }
      return resolveGenericStaticColor(
        palette.entry.value,
        lock.sourceRefId,
        palette.entry.name,
        lock.role,
        mergeEvidence(palette.structureEvidenceIds, palette.entry.evidenceIds, authorityEvidenceIds)
      );
    })
    .sort(
      (left, right) =>
        COLOR_SYSTEM_SECTION_ROLES_V2.indexOf(left.role) -
          COLOR_SYSTEM_SECTION_ROLES_V2.indexOf(right.role) ||
        compareText(left.sourceRefId, right.sourceRefId)
    );
}

function isNearNeutral(value: ColorSystemColorValueV2): boolean {
  const channels = [value.components.r, value.components.g, value.components.b];
  return Math.max(...channels) - Math.min(...channels) <= 0.08;
}

function genericNeutralSupportBlockers(
  colors: readonly GenericResolvedVariableColorV2[]
): ColorSystemGenericCompilerPreflightBlockerV2[] {
  const blockers: ColorSystemGenericCompilerPreflightBlockerV2[] = [];
  for (const mode of MODES) {
    const values = colors
      .filter(color => color.role === 'primary' || color.role === 'typography')
      .flatMap(color => {
        const value = color.valuesByMode[mode];
        return value && value.alpha === 1 && isNearNeutral(value)
          ? [{ stableColorId: color.stableColorId, sourceRefId: color.sourceRefId, value }]
          : [];
      });
    if (new Set(values.map(entry => `${entry.stableColorId}\u0000${entry.value.hex}`)).size < 2) {
      blockers.push({
        code: 'GENERIC_NEUTRALS_INSUFFICIENT',
        message: `Generic compilation requires at least two distinct exact opaque observed neutrals in ${mode} mode.`,
        sourceRefIds: colors
          .filter(color => color.role === 'primary' || color.role === 'typography')
          .map(color => color.sourceRefId)
          .sort(compareText),
      });
      continue;
    }
    const luminances = values.map(entry => {
      const rgbValue = hexToRgb(entry.value.hex);
      return getRelativeLuminance(rgbValue.r, rgbValue.g, rgbValue.b);
    });
    if (!luminances.some(value => value >= 0.5) || !luminances.some(value => value < 0.5)) {
      blockers.push({
        code: 'GENERIC_NEUTRAL_SURFACE_POLARITY_REQUIRED',
        message: `Generic compilation requires both light and dark exact observed neutral surfaces in ${mode} mode.`,
        sourceRefIds: values.map(value => value.sourceRefId).sort(compareText),
      });
    }
  }
  return blockers;
}

function assertGenericNeutralSupport(colors: readonly GenericResolvedVariableColorV2[]): void {
  const blocker = genericNeutralSupportBlockers(colors)[0];
  if (blocker) fail(blocker.code, blocker.message);
}

function genericChromaticAnchors(colors: readonly GenericResolvedVariableColorV2[]) {
  return colors
    .filter(color => color.role === 'primary')
    .flatMap(color =>
      Object.entries(color.valuesByMode).flatMap(([mode, value]) =>
        value.alpha === 1 &&
        hexToOklch(value.hex).c >= GENERIC_CHROMATIC_PRIMARY_MINIMUM_OKLCH_CHROMA
          ? [{ color, mode, value, chroma: hexToOklch(value.hex).c }]
          : []
      )
    )
    .sort(
      (left, right) =>
        right.chroma - left.chroma ||
        compareText(left.color.stableColorId, right.color.stableColorId) ||
        compareText(left.mode, right.mode)
    );
}

function preflightBlockerFromError(
  error: ColorSystemSourceCompilerV2Error,
  sourceRefIds: readonly string[]
): ColorSystemGenericCompilerPreflightBlockerV2 | null {
  const codes: readonly ColorSystemGenericCompilerPreflightBlockerCodeV2[] = [
    'GENERIC_HANDOFF_NOT_READY',
    'GENERIC_EXACT_SRGB_VALUE_UNSUPPORTED',
    'GENERIC_PRIMARY_INSUFFICIENT',
    'GENERIC_PRIMARY_CHROMATIC_ANCHOR_REQUIRED',
    'GENERIC_NEUTRALS_INSUFFICIENT',
    'GENERIC_NEUTRAL_SURFACE_POLARITY_REQUIRED',
    'GENERIC_MODE_SUPPORT_INSUFFICIENT',
  ];
  if (!codes.includes(error.code as ColorSystemGenericCompilerPreflightBlockerCodeV2)) {
    return null;
  }
  return {
    code: error.code as ColorSystemGenericCompilerPreflightBlockerCodeV2,
    message: error.message,
    sourceRefIds: [...new Set(sourceRefIds)].sort(compareText),
  };
}

/**
 * Pure, read-only prerequisite check for the exact plan currently displayed to
 * the owner. It intentionally runs before owner confirmation so the UI cannot
 * promise a build whose current source refs are structurally unable to compile.
 */
export function preflightColorSystemGenericSourceV2(
  input: PreflightColorSystemGenericSourceV2Input
): ColorSystemGenericCompilerPreflightResultV2 {
  assertColorSystemGenericSourceSnapshotV2Integrity(input.snapshot);
  assertColorSystemGenericIntentProposalV2Integrity(input.snapshot, input.proposal);
  const blockers: ColorSystemGenericCompilerPreflightBlockerV2[] = [];
  if (
    input.snapshot.documentProfile !== 'srgb' ||
    input.snapshot.cancelled ||
    input.snapshot.partial ||
    input.snapshot.scope.coverage !== 'complete-supported-scope'
  ) {
    blockers.push({
      code: 'GENERIC_HANDOFF_NOT_READY',
      message:
        'Generic compilation requires a complete, non-cancelled source snapshot in an authoritatively sRGB document.',
      sourceRefIds: [],
    });
  }
  const proposedLocks = input.proposal.sections
    .filter(section => section.disposition === 'preserve')
    .flatMap(section =>
      section.sourceRefIds.map(sourceRefId => ({
        sourceRefId,
        role: section.role,
        evidenceIds: section.evidenceIds,
      }))
    );
  const resolvedColors: GenericResolvedVariableColorV2[] = [];
  proposedLocks.forEach(lock => {
    try {
      resolvedColors.push(...resolveGenericSourceLocks(input.snapshot, input.proposal, [lock]));
    } catch (error) {
      if (!(error instanceof ColorSystemSourceCompilerV2Error)) throw error;
      const blocker = preflightBlockerFromError(error, [lock.sourceRefId]);
      if (!blocker) throw error;
      blockers.push(blocker);
    }
  });
  const proposedPrimaryRefIds = proposedLocks
    .filter(lock => lock.role === 'primary')
    .map(lock => lock.sourceRefId);
  const primaryColors = resolvedColors.filter(color => color.role === 'primary');
  if (proposedPrimaryRefIds.length === 0) {
    blockers.push({
      code: 'GENERIC_PRIMARY_INSUFFICIENT',
      message: 'Generic compilation requires at least one exact proposed Primary source.',
      sourceRefIds: [],
    });
  } else if (primaryColors.length > 0 && genericChromaticAnchors(primaryColors).length === 0) {
    blockers.push({
      code: 'GENERIC_PRIMARY_CHROMATIC_ANCHOR_REQUIRED',
      message: `Generic Secondary generation requires an opaque proposed Primary anchor with OKLCH chroma at least ${GENERIC_CHROMATIC_PRIMARY_MINIMUM_OKLCH_CHROMA}.`,
      sourceRefIds: proposedPrimaryRefIds.sort(compareText),
    });
  }
  blockers.push(...genericNeutralSupportBlockers(resolvedColors));
  const unique = new Map<string, ColorSystemGenericCompilerPreflightBlockerV2>();
  blockers.forEach(blocker => {
    unique.set(canonicalJson([blocker.code, blocker.message, blocker.sourceRefIds]), blocker);
  });
  const normalized = [...unique.values()].sort(
    (left, right) =>
      compareText(left.code, right.code) ||
      compareText(left.message, right.message) ||
      compareText(canonicalJson(left.sourceRefIds), canonicalJson(right.sourceRefIds))
  );
  return normalized.length === 0
    ? { status: 'ready', blockers: [] }
    : { status: 'blocked', blockers: normalized };
}

function genericRequiredSecondaryJobs(
  handoff: ColorSystemGenericPolicyHandoffV2
): ColorSystemJobV2[] {
  const jobs = handoff.sectionIntents
    .filter(intent => intent.disposition === 'rebuild' || intent.disposition === 'derive')
    .flatMap(intent => intent.jobs)
    .filter(job => SECONDARY_JOBS.has(job));
  const normalized = [...new Set(jobs)].sort(compareText);
  if (normalized.length === 0) {
    fail('GENERIC_HANDOFF_NOT_READY', 'The confirmed plan declares no Secondary consumer jobs.');
  }
  return normalized;
}

function genericDirectionRecipes(
  contributionId: string
): readonly ColorSystemSecondaryDirectionRecipeV2[] {
  return [
    {
      direction: 'close-harmony',
      hueOffsetDegrees: 0,
      chromaScale: 0.92,
      lightnessShift: 0,
      authority: 'teul-proposal',
      evidenceIds: [`teul-proposal:${contributionId}:close-harmony`],
    },
    {
      direction: 'balanced-contrast',
      hueOffsetDegrees: 16,
      chromaScale: 0.86,
      lightnessShift: 0,
      authority: 'teul-proposal',
      evidenceIds: [`teul-proposal:${contributionId}:balanced-contrast`],
    },
    {
      direction: 'wide-spectrum',
      hueOffsetDegrees: 36,
      chromaScale: 0.78,
      lightnessShift: 0,
      authority: 'teul-proposal',
      evidenceIds: [`teul-proposal:${contributionId}:wide-spectrum`],
    },
  ];
}

/**
 * Compiles one exact generic source/confirmation/handoff chain into the v2
 * builder source shape. It performs no Figma, storage, network, or clock work.
 */
export function compileColorSystemGenericPolicyHandoffSourceV2(
  input: CompileColorSystemGenericPolicyHandoffSourceV2Input
): Extract<ColorSystemSourceCompilerV2Result, { status: 'ready' }> {
  assertColorSystemGenericSourceSnapshotV2Integrity(input.snapshot);
  assertColorSystemGenericIntentProposalV2Integrity(input.snapshot, input.proposal);
  assertColorSystemGenericOwnerConfirmationV2Integrity(
    input.snapshot,
    input.proposal,
    input.confirmation
  );
  assertColorSystemGenericPolicyHandoffV2Integrity(
    input.snapshot,
    input.proposal,
    input.confirmation,
    input.handoff
  );
  if (
    input.handoff.readiness !== 'ready' ||
    input.handoff.profileSupport.status !== 'supported' ||
    input.handoff.profileSupport.documentProfile !== 'srgb'
  ) {
    fail(
      'GENERIC_HANDOFF_NOT_READY',
      'Only a ready, exact sRGB generic policy handoff may enter the source compiler.'
    );
  }

  const presentationProfile = buildColorSystemGenericPresentationProfileV2(input);
  const bindings: ColorSystemSourceCompilerV2BindingInput = {
    sourcePaletteHash: input.snapshot.currentFileContentHash,
    sourcePackageHash: input.handoff.handoffHash,
    sourceAuthorityHash: genericSourceAuthorityHash(input.handoff),
    presentationProfileHash: presentationProfile.profileHash,
  };
  const resolvedColors = resolveGenericPreservedColors(input);
  const primaryColors = resolvedColors.filter(color => color.role === 'primary');
  if (primaryColors.length === 0) {
    fail(
      'GENERIC_PRIMARY_INSUFFICIENT',
      'Generic compilation requires at least one exact owner-confirmed Primary Variable.'
    );
  }
  assertGenericNeutralSupport(resolvedColors);

  const chromaticAnchors = genericChromaticAnchors(primaryColors);
  if (chromaticAnchors.length === 0) {
    fail(
      'GENERIC_PRIMARY_CHROMATIC_ANCHOR_REQUIRED',
      `Generic Secondary generation requires an opaque owner-confirmed Primary anchor with OKLCH chroma at least ${GENERIC_CHROMATIC_PRIMARY_MINIMUM_OKLCH_CHROMA}.`
    );
  }

  const requiredSecondaryJobs = genericRequiredSecondaryJobs(input.handoff);
  const generatedPolarity = input.handoff.generatedPolarity;
  if (requiredSecondaryJobs.includes('diverging-data') && !generatedPolarity) {
    fail(
      'GENERIC_POLARITY_ANCHORS_REQUIRED',
      'Diverging data requires distinct owner-confirmed generated Secondary contribution IDs.'
    );
  }
  const contributionIds = [...COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2];
  if (
    generatedPolarity &&
    (!contributionIds.includes(
      generatedPolarity.negativeContributionId as (typeof contributionIds)[number]
    ) ||
      !contributionIds.includes(
        generatedPolarity.positiveContributionId as (typeof contributionIds)[number]
      ) ||
      generatedPolarity.negativeContributionId === generatedPolarity.positiveContributionId)
  ) {
    fail(
      'GENERIC_POLARITY_ANCHORS_REQUIRED',
      'Owner-confirmed generated polarity does not resolve to distinct current contribution IDs.'
    );
  }

  const preservedColors = resolvedColors.map((color, index) => ({
    stableColorId: color.stableColorId,
    displayName: color.displayName,
    section: color.role,
    order: index + 1,
    valuesByMode: color.valuesByMode,
    evidenceIds: color.evidenceIds,
  }));
  const primaryLocks = primaryColors.flatMap(color =>
    Object.entries(color.valuesByMode).map(([mode, expectedValue]) =>
      buildColorSystemExactPrimaryLockV2({
        version: 'teul-exact-primary-lock/v2',
        lockId: `generic-primary-lock:${color.sourceRefId}:${mode}`,
        stableColorId: color.stableColorId,
        sourcePath: `${color.sourceRefId}/${mode}`,
        mode,
        expectedValue,
        ...(color.aliasTargetByMode[mode] ? { aliasTargetId: color.aliasTargetByMode[mode] } : {}),
        evidenceIds: color.evidenceIds,
      })
    )
  );
  const sectionIntents = input.handoff.sectionIntents.map((intent, index) => ({
    role: intent.role,
    order: index + 1,
    disposition: intent.disposition,
    jobs: intent.jobs,
    guidance:
      intent.role === 'primary'
        ? 'Preserve exact owner-confirmed Primary values and modes.'
        : intent.role === 'secondary'
          ? 'Generate and review a new Secondary system from the protected Primary anchor.'
          : intent.role === 'product-graphics'
            ? 'Derive product graphics, functional iconography, and product UI surfaces from measured eligible Secondary members.'
            : intent.role === 'data-visualization'
              ? 'Derive categorical, sequential, and owner-confirmed diverging selections from measured eligible Secondary members.'
              : 'Preserve exact observed neutrals and assess only rendered typography pairs.',
    evidenceIds: mergeEvidence(intent.evidenceIds, [input.confirmation.confirmationHash]),
    confirmation: 'owner-confirmed' as const,
  })) as unknown as ColorSystemBuilderBriefV2['sections'];
  const brandFitProfile = buildColorSystemBrandFitProfileV2({
    version: 'teul-brand-fit-profile/v2',
    territories: [
      {
        territoryId: 'teul-generic-secondary-proposal-space',
        label: 'Teul-proposed systematic Secondary search space',
        status: 'allowed',
        allowedJobs: requiredSecondaryJobs,
        allowedProminence: ['supporting', 'accent', 'leading'],
        appliesToProminence: ['supporting', 'accent', 'leading'],
        perceptualBounds: {
          hueRanges: [{ minimum: 0, maximum: 360 }],
          chroma: { minimum: 0, maximum: 0.5 },
          lightness: { minimum: 0, maximum: 1 },
        },
        evidenceIds: [GENERIC_SECONDARY_POLICY_EVIDENCE_ID],
      },
    ],
    evidenceIds: [
      GENERIC_SECONDARY_POLICY_EVIDENCE_ID,
      `generic-handoff:${input.handoff.handoffHash}`,
    ],
  });
  const jobMinimums = requiredSecondaryJobs.map(job => ({
    job,
    minimumFamilies: 1,
    authority: 'teul-policy-evidence' as const,
    evidenceIds: [`teul-policy:generic-job-minimum:${job}`],
  }));
  const brief = buildColorSystemBuilderBriefV2({
    version: COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    sourceHash: bindings.sourceAuthorityHash,
    sourcePackageHash: bindings.sourcePackageHash,
    brandFitProfileHash: brandFitProfile.profileHash,
    brandFitProfile,
    presentationProfileHash: bindings.presentationProfileHash,
    sections: sectionIntents,
    preservedColors,
    sourceReferenceColors: [],
    primaryLocks,
    primaryLockIds: primaryLocks.map(lock => lock.lockId),
    secondaryTargetPolicy: {
      version: 'teul-secondary-target-policy/v2',
      derivationRule: 'teul-generated-contribution-count',
      retainedSourceFamilyGroupIds: [],
      assemblyContributionIds: contributionIds,
      jobMinimums,
      evidenceIds: [
        GENERIC_SECONDARY_POLICY_EVIDENCE_ID,
        `generic-handoff:${input.handoff.handoffHash}`,
      ],
    },
    secondaryTargetFamilyCount: contributionIds.length,
    requiredSecondaryJobs,
    ...(generatedPolarity
      ? {
          divergingPolarity: {
            policyVersion: 'teul-owner-confirmed-generated-diverging-semantics/v1' as const,
            negativeContributionId: generatedPolarity.negativeContributionId,
            positiveContributionId: generatedPolarity.positiveContributionId,
            authority: 'owner-confirmed' as const,
            evidenceIds: mergeEvidence(generatedPolarity.evidenceIds, [
              input.confirmation.confirmationHash,
            ]),
          },
        }
      : {}),
  });
  assertColorSystemBuilderBriefV2Integrity(brief);

  const seeds = GENERIC_SECONDARY_CONTRIBUTION_RECIPES_V2.map((recipe, index) => {
    const anchor = chromaticAnchors[index % chromaticAnchors.length];
    return {
      version: 'teul-secondary-family-seed/v2' as const,
      authority: 'teul-proposal' as const,
      seedId: `generic-secondary-seed:${recipe.contributionId}`,
      displayName: recipe.displayName,
      contributionId: recipe.contributionId,
      sourceColorId: anchor.color.stableColorId,
      sourceMode: anchor.mode,
      baseHueOffsetDegrees: recipe.baseHueOffsetDegrees,
      baseChromaScale: recipe.baseChromaScale,
      baseLightnessShift: 0,
      territoryId: 'teul-generic-secondary-proposal-space',
      prominence: recipe.prominence,
      directionRecipes: genericDirectionRecipes(recipe.contributionId),
      eligibilityEvidence: [
        {
          modes: ['Light', 'Dark'] as const,
          steps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          jobs: requiredSecondaryJobs,
          authority: 'teul-policy-evidence' as const,
          evidenceIds: [`teul-policy:generic-job-eligibility:${recipe.contributionId}`],
        },
      ],
      evidenceIds: [
        `teul-proposal:${recipe.contributionId}`,
        GENERIC_SECONDARY_POLICY_EVIDENCE_ID,
        ...anchor.color.evidenceIds,
      ].sort(compareText),
    } satisfies ColorSystemSecondaryFamilySeedV2;
  });
  const constraintsWithoutHash = {
    version: 'teul-color-system-generic-constraints/v2' as const,
    proposalScope: 'secondary-color-families-only' as const,
    authority: 'teul-policy-evidence' as const,
    pink: {
      permission: 'not-classified' as const,
      authority: 'teul-policy-evidence' as const,
      evidenceIds: ['teul-policy:generic-pink-unclassified'],
    },
    gradients: {
      authorized: false as const,
      authority: 'teul-policy-evidence' as const,
      evidenceIds: ['teul-policy:generic-secondary-solid-colors-only'],
    },
    evidenceIds: [
      GENERIC_SECONDARY_POLICY_EVIDENCE_ID,
      `generic-handoff:${input.handoff.handoffHash}`,
    ],
    limitation:
      'No company-specific hue meaning, gradient permission, or aesthetic restriction is inferred from the generic source.',
  };
  const constraints: ColorSystemSourceCompilerV2GenericConstraintReceipt = {
    ...constraintsWithoutHash,
    constraintHash: deterministicContentHash(constraintsWithoutHash),
  };
  const resultContent = {
    version: COLOR_SYSTEM_GENERIC_SOURCE_BRIDGE_V2_VERSION,
    evidenceAuthorityPolicyVersion: COLOR_SYSTEM_EVIDENCE_AUTHORITY_POLICY_VERSION,
    bindings,
    sourcePaletteSemanticHash: input.snapshot.currentFileContentHash,
    constraints,
    groups: [] as const,
    brief,
    seeds,
    handoffHash: input.handoff.handoffHash,
    generationPolicyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
  };
  return {
    status: 'ready',
    brief,
    seeds,
    groups: [],
    constraints,
    evidenceAuthorityPolicyVersion: COLOR_SYSTEM_EVIDENCE_AUTHORITY_POLICY_VERSION,
    bindings,
    sourcePaletteSemanticHash: input.snapshot.currentFileContentHash,
    compilationHash: deterministicContentHash(resultContent),
  };
}

export function assertColorSystemGenericPolicyHandoffSourceV2Integrity(
  input: CompileColorSystemGenericPolicyHandoffSourceV2Input,
  compilation: Extract<ColorSystemSourceCompilerV2Result, { status: 'ready' }>
): void {
  const rebuilt = compileColorSystemGenericPolicyHandoffSourceV2(input);
  if (canonicalJson(rebuilt) !== canonicalJson(compilation)) {
    fail(
      'GENERIC_HANDOFF_NOT_READY',
      'Generic source compilation is stale, mutated, or not derived from the exact handoff chain.'
    );
  }
}
