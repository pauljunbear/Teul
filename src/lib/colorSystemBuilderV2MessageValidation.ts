import {
  COLOR_SYSTEM_BUILDER_V2_LIMITS,
  COLOR_SYSTEM_REPLACEABLE_SECTION_ROLES_V2, // p5-A
  COLOR_SYSTEM_SECTION_ROLES_V2,
  type ColorSystemColorValueV2,
} from './colorSystemBuilderV2Contracts';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { normalizeColorSystemSrgbValueV1 } from './colorSystemSrgbValueV1';
import {
  normalizeColorSystemBrandRulesV1,
  parseColorSystemBrandConstraintsV1,
  COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_LIMITS,
} from './colorSystemBrandConstraintsV1';
import { COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2 } from './colorSystemGenericLimitsV2';
// wave2-UI: the review model carries surface advisories; their vocabulary is pinned here.
import {
  CMYK_UNPROFILED_DISCLAIMER,
  COLOR_SYSTEM_PROPORTION_TIERS_V3,
  COLOR_SYSTEM_SURFACES_V3,
  COLOR_SYSTEM_SURFACE_ADVISORIES_V3_SCHEMA_VERSION,
  SURFACE_ADVISORY_CODES_V3,
} from './colorSystemSurfaceAdvisoriesV3';
// p3-B: meaning-source vocabulary for the why block is pinned to the blueprint's tuples.
// p3-I: so are the ground-source and chart-order vocabularies.
// p4-B: and the mark-origin vocabulary.
import {
  COLOR_SYSTEM_CHART_ORDER_SOURCES_V2,
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2, // p4-DE
  COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2,
  COLOR_SYSTEM_SEMANTIC_MEANING_SOURCES_V2,
  COLOR_SYSTEM_STRUCTURAL_GROUND_SOURCES_V2,
  COLOR_SYSTEM_VISUALIZATION_MARK_ORIGINS_V2,
} from './colorSystemApplicationVocabularyV2';
import {
  COLOR_SYSTEM_OWNER_SPOT_COLOR_LIMITS_V2, // p4-DE
  type ColorSystemBuilderV2PluginMessage,
  type ColorSystemBuilderV2UIMessage,
} from '../types/colorSystemBuilderV2Messages';

type JsonRecord = Record<string, unknown>;

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const HEX = /^#[0-9A-F]{6}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const REVIEW_MODEL_SCHEMA_VERSION = 'teul-color-system-review-model/v2';
const GENERIC_SOURCE_SCOPES = ['automatic', 'selection', 'current-page', 'whole-file'] as const;
const GENERIC_DISPOSITIONS = ['preserve', 'extend', 'rebuild', 'propose', 'exclude'] as const;
const GENERIC_BASES = ['analyzed', 'inferred', 'owner-confirmed'] as const;
const GENERIC_OUTCOMES = [
  'ready',
  'empty',
  'partial',
  'ambiguous',
  'unsupported-profile',
  'source-incomplete',
  'capacity',
  'cancelled',
  'host-error',
  'stale',
] as const;
const GENERIC_CONFIRMATION_FAILURE_OUTCOMES = [
  'ambiguous',
  'unsupported-profile',
  'source-incomplete',
  'capacity',
  'cancelled',
  'host-error',
  'stale',
] as const;
const GENERIC_GAP_KINDS = [
  'missing-source',
  'conflicting-source',
  'unsupported-color',
  'unsupported-profile',
  'unsupported-paint',
  'unresolved-alias',
  'capacity',
  'source-changed',
  'host-error',
  'other',
] as const;
const GENERIC_PROGRESS_PHASES = [
  'reading-source',
  'loading-pages',
  'classifying-evidence',
  'building-plan',
  'revalidating',
  'confirming',
] as const;

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function only(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function requiredAndOptional(
  value: JsonRecord,
  required: readonly string[],
  optional: readonly string[]
): boolean {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every(key => allowed.has(key))
  );
}

function text(value: unknown, maximum = 2_000): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function requestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID.test(value);
}

function hash(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value);
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

// wave2-UI: compact shape checks for the measured review blocks; unknown keys fail closed.
type Check = (value: unknown) => boolean;
const oneOf =
  (options: readonly string[]): Check =>
  value =>
    options.includes(value as string);
const nullable =
  (check: Check): Check =>
  value =>
    value === null || check(value);
const listOf =
  (check: Check, maximum: number, minimum = 0): Check =>
  value =>
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.every(check);
const textOf =
  (maximum = 2_000): Check =>
  value =>
    text(value, maximum);
const finiteIn =
  (minimum: number, maximum: number): Check =>
  value =>
    finite(value, minimum, maximum);
const integerIn =
  (minimum: number, maximum: number): Check =>
  value =>
    integer(value, minimum, maximum);
const hexValue: Check = value => typeof value === 'string' && HEX.test(value);
/** Every listed key must be present and pass; any other key fails. */
function shape(spec: Readonly<Record<string, Check>>): Check {
  const keys = Object.keys(spec);
  return value => record(value) && only(value, keys) && keys.every(key => spec[key](value[key]));
}
/** Null checks reserve a key for a cross-field guard without reading its value here. */
function shapeWithOptional(
  required: Readonly<Record<string, Check | null>>,
  optional: Readonly<Record<string, Check | null>>
): Check {
  const requiredKeys = Object.keys(required);
  const optionalKeys = Object.keys(optional);
  return value =>
    record(value) &&
    requiredAndOptional(value, requiredKeys, optionalKeys) &&
    requiredKeys.every(key => required[key]?.(value[key]) ?? true) &&
    optionalKeys.every(key => !(key in value) || (optional[key]?.(value[key]) ?? true));
}
/** `{ <first>, total }` with first ≤ total. */
function countOf(first: string): Check {
  const base = shape({ [first]: integerIn(0, 100_000), total: integerIn(0, 100_000) });
  return value =>
    base(value) &&
    (value as Record<string, number>)[first] <= (value as Record<string, number>).total;
}

const optionalValue =
  (check: Check): Check =>
  value =>
    value === undefined || check(value);
const booleanValue: Check = value => typeof value === 'boolean';

// p3-C: the optional token exports on a Create success. Bounds mirror
// COLOR_SYSTEM_TOKEN_EXPORT_V2_LIMITS; the texts are opaque here, parsed by no one
// in the UI, and copied verbatim to the clipboard.
const tokenExportShape = shape({
  format: oneOf(['dtcg-2025.10']),
  defaultMode: textOf(80),
  modes: listOf(textOf(80), 4, 1),
  tokenCount: integerIn(1, 1024),
  aliasCount: integerIn(0, 1024),
  dtcgJson: textOf(1000000),
  cssText: textOf(400000),
});
function tokenExport(value: unknown): boolean {
  if (!tokenExportShape(value)) return false;
  const data = value as JsonRecord;
  return (
    (data.modes as unknown[]).includes(data.defaultMode) &&
    (data.aliasCount as number) <= (data.tokenCount as number)
  );
}

// p4-DE: an owner-typed spot reference. Shape only: the name is never compared
// with any spot library, and the only accepted source is the owner.
/** True when any character is a C0 control (below 0x20) or DEL (0x7F). */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
function ownerSpotColor(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['system', 'name', 'finish', 'source']) &&
    (value.system === 'pantone' || value.system === 'other') &&
    typeof value.name === 'string' &&
    value.name === value.name.trim() &&
    value.name.length >= 1 &&
    value.name.length <= COLOR_SYSTEM_OWNER_SPOT_COLOR_LIMITS_V2.maximumNameLength &&
    !hasControlCharacter(value.name) &&
    ['coated', 'uncoated', 'none'].includes(value.finish as string) &&
    value.source === 'owner-supplied'
  );
}

// p4-DE: the Create request's map, keyed by family id; an empty map is never sent.
function ownerSpotColors(value: unknown): boolean {
  if (!record(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length >= 1 &&
    entries.length <= COLOR_SYSTEM_OWNER_SPOT_COLOR_LIMITS_V2.maximumEntries &&
    entries.every(([familyId, spot]) => text(familyId, 200) && ownerSpotColor(spot))
  );
}

// p4-DE: the success echo. A verified no-op mutates nothing, so it writes nothing.
function ownerSpotColorsEcho(value: unknown, action: unknown): boolean {
  return (
    record(value) &&
    only(value, ['supplied', 'descriptionsWritten']) &&
    integer(value.supplied, 1, COLOR_SYSTEM_OWNER_SPOT_COLOR_LIMITS_V2.maximumEntries) &&
    integer(value.descriptionsWritten, 0, 512) &&
    (action !== 'verified-no-op' || value.descriptionsWritten === 0)
  );
}

function finite(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function strings(value: unknown, maximum: number, maximumLength = 2_000): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every(item => text(item, maximumLength))
  );
}

function uniqueStrings(value: unknown, maximum: number, maximumLength = 2_000): value is string[] {
  return strings(value, maximum, maximumLength) && new Set(value).size === value.length;
}

function isoUtc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ISO_UTC.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z'))
  );
}

const blocker = shape({ code: textOf(100), message: textOf(), recovery: textOf() });

function nativeReviewValue(parent: JsonRecord): boolean {
  if (!('nativeValue' in parent)) return true;
  const value = parent.nativeValue;
  if (
    !record(value) ||
    !record(value.representation) ||
    value.representation.kind !== 'native-srgb' ||
    value.hex !== parent.hex ||
    (parent.alpha !== undefined && value.alpha !== parent.alpha)
  )
    return false;
  try {
    return (
      canonicalJson(
        normalizeColorSystemSrgbValueV1(value as unknown as ColorSystemColorValueV2)
      ) === canonicalJson(value)
    );
  } catch {
    return false;
  }
}

const reviewColorShape = shapeWithOptional(
  {
    id: textOf(300),
    name: textOf(300),
    mode: textOf(80),
    hex: hexValue,
    alpha: finiteIn(0, 1),
    origin: oneOf(['existing', 'suggested']),
    jobs: value => strings(value, 16, 100),
  },
  { nativeValue: null }
);
function reviewColor(value: unknown): boolean {
  return reviewColorShape(value) && nativeReviewValue(value as JsonRecord);
}

// p4-DE: the resolved product roles per mode the preview boards are built from.
// One entry per role and mode; the token path is the blueprint's alias scheme.
function reviewSemanticRoles(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.length * 4) {
    return false;
  }
  const seen = new Set<string>();
  return value.every(item => {
    if (
      !record(item) ||
      !only(item, ['role', 'mode', 'tokenName', 'color']) ||
      !COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.includes(
        item.role as (typeof COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2)[number]
      ) ||
      !text(item.mode, 80) ||
      item.tokenName !== `semantic/${String(item.role)}` ||
      !reviewColor(item.color) ||
      (item.color as JsonRecord).mode !== item.mode
    ) {
      return false;
    }
    const key = `${String(item.role)}\u0000${item.mode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// p3-H: exact tints pinned into a family's scale, and tints that could not be pinned.
const reviewPinnedMember = shape({
  memberId: textOf(300),
  step: value => integer(value, 1, 12) && value !== 9,
  mode: textOf(80),
  sourceName: textOf(300),
  hex: hexValue,
});

const reviewPinSkip = shape({
  sourceName: textOf(300),
  hex: hexValue,
  mode: textOf(80),
  nearestStep: nullable(integerIn(1, 12)),
  reason: textOf(),
});

const reviewFamily = shapeWithOptional(
  {
    id: textOf(300),
    name: textOf(300),
    prominence: oneOf(['supporting', 'accent', 'leading']),
    reason: textOf(),
    jobs: value => strings(value, 16, 100),
    colors: listOf(reviewColor, 24, 2),
  },
  {
    kind: optionalValue(oneOf(['derived', 'accent', 'neutral', 'reserve'])),
    anchorHex: optionalValue(hexValue),
    statusReserve: optionalValue(oneOf(['success', 'warning', 'error', 'information'])),
    pinnedMembers: optionalValue(listOf(reviewPinnedMember, 11, 1)),
    pinSkips: optionalValue(listOf(reviewPinSkip, 24, 1)),
  }
);

// The measured "why" block, one number per ranking criterion.
const delta = finiteIn(0, 10);
const label = textOf(300);
// p3-B: where each meaning role's family came from; the vocabulary is the blueprint's.
const reviewMeaningSources = listOf(
  shape({
    role: oneOf(COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2),
    mode: textOf(80),
    source: oneOf(COLOR_SYSTEM_SEMANTIC_MEANING_SOURCES_V2),
    family: label,
    statement: textOf(500),
  }),
  64
);
// p3-I: the two one-line facts the Why block prints. Statements are prose the UI
// shows verbatim; the vocabularies are the blueprint's tuples.
const reviewWhySurfaces = shape({
  source: oneOf([...COLOR_SYSTEM_STRUCTURAL_GROUND_SOURCES_V2, 'mixed']),
  groundNames: value => strings(value, 8, 300),
  statement: textOf(500),
});
const reviewWhyChartOrder = shape({
  source: oneOf(COLOR_SYSTEM_CHART_ORDER_SOURCES_V2),
  recordedCount: integerIn(0, 8),
  warnings: value => strings(value, 64, 500),
  statement: textOf(500),
});
const reviewWhy = shapeWithOptional(
  {
    familyAnchorSeparation: shape({ minimum: nullable(delta), threshold: delta }),
    meanSourceAdjustment: nullable(delta),
    gamutMappedSteps: nullable(integerIn(0, 100_000)),
    requiredPairs: countOf('passing'),
    meaningRoles: countOf('inRange'),
    sequentialAdjacentCoefficientOfVariation: nullable(finiteIn(0, 1_000)),
    chartSeparation: shape({
      minimum: delta,
      threshold: delta,
      normal: delta,
      protan: delta,
      deutan: delta,
      tritan: delta,
    }),
    meanAnchorSeparation: delta,
    sourceContinuity: nullable(delta),
    basisStatements: value => strings(value, 16, 500) && value.length >= 1,
  },
  {
    meaningSources: reviewMeaningSources,
    // p3-H: status reserves the planner needed and could not add, at most one per role.
    skippedStatusReserves: value =>
      listOf(
        shape({
          role: oneOf(['success', 'warning', 'error', 'information']),
          hue: finiteIn(0, 360),
          realizedHex: hexValue,
          nearestHex: hexValue,
          nearestName: label,
          deltaEOK: delta,
          cause: oneOf(['separation', 'family-limit']),
          statement: textOf(600),
        }),
        4
      )(value) && (value as unknown[]).length >= 1,
    surfaces: reviewWhySurfaces, // p3-I
    chartOrder: reviewWhyChartOrder, // p3-I
  }
);

// p6: the recommendation screen's pre-grouped cards. Prose is shown verbatim and
// bounded; origins are the three written tags; token paths follow `color/<slug>`.
const reviewSystemPart = shape({
  label: textOf(120),
  values: value =>
    listOf(
      item =>
        shapeWithOptional({ mode: textOf(80), hex: hexValue }, { nativeValue: record })(item) &&
        nativeReviewValue(item as JsonRecord),
      8
    )(value) && (value as unknown[]).length >= 1,
});
const reviewSystemCards = listOf(
  shape({
    id: textOf(300),
    name: textOf(300),
    origin: nullable(oneOf(['kept-exactly', 'new', 'from-brand'])),
    usedFor: textOf(600),
    parts: value => listOf(reviewSystemPart, 8)(value) && (value as unknown[]).length >= 1,
  }),
  32
);
const reviewRecommendedSystem = shape({
  colorCount: integerIn(1, 64),
  summary: textOf(600),
  accentPlacement: textOf(300),
  alsoConsidered: textOf(600),
  brand: reviewSystemCards,
  productUi: reviewSystemCards,
  status: reviewSystemCards,
  chartCapacity: nullable(textOf(600)),
  why: shape({ kept: textOf(600), added: textOf(900), notDone: textOf(600) }),
  familyNames: listOf(
    shape({
      familyId: textOf(300),
      name: textOf(300),
      tokenPath: value =>
        typeof value === 'string' && /^color\/[a-z0-9][a-z0-9-]{0,78}$/.test(value),
    }),
    COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget
  ),
});

// p5-A: what a Replace plan did not carry: one sentence per replaced section and
// every recorded color by name, mode and exact hex (at most one entry per Variable
// mode value, so the Variables ceiling bounds it).
const reviewReplaced = shape({
  statements: value => strings(value, 3, 600) && value.length >= 1,
  colors: value =>
    listOf(
      shape({
        id: label,
        name: label,
        section: oneOf(COLOR_SYSTEM_REPLACEABLE_SECTION_ROLES_V2),
        mode: textOf(80),
        hex: hexValue,
      }),
      COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumTokens * 2
    )(value) && (value as unknown[]).length >= 1,
});

// Brand surfaces: reach per family plus print and out-of-home advisories.
const surfaceValue = oneOf(COLOR_SYSTEM_SURFACES_V3);
const surfaceList: Check = value =>
  listOf(surfaceValue, COLOR_SYSTEM_SURFACES_V3.length)(value) &&
  new Set(value as unknown[]).size === (value as unknown[]).length;
/** Only an owner-supplied spot reference is ever accepted; Teul never looks one up. */
const ownerSuppliedSpot: Check = value =>
  record(value) &&
  requiredAndOptional(value, ['system', 'name', 'source'], ['finish']) &&
  oneOf(['pantone', 'other'])(value.system) &&
  text(value.name, 200) &&
  value.source === 'owner-supplied' &&
  (value.finish === undefined || oneOf(['coated', 'uncoated'])(value.finish));
const percent = integerIn(0, 100);
const printTripletShape = shape({
  colorId: label,
  name: label,
  screenHex: hexValue,
  cmyk: shape({ c: percent, m: percent, y: percent, k: percent, totalInk: integerIn(0, 400) }),
  spot: nullable(ownerSuppliedSpot),
  canonical: oneOf(['screen', 'spot']),
  note: textOf(),
});
/** The spot reference is canonical exactly when the owner supplied one. */
const reviewPrintTriplet: Check = value =>
  printTripletShape(value) &&
  (value as JsonRecord).canonical === ((value as JsonRecord).spot === null ? 'screen' : 'spot');
const reviewBrandSurfaces = shape({
  version: value => value === COLOR_SYSTEM_SURFACE_ADVISORIES_V3_SCHEMA_VERSION,
  surfaces: surfaceList,
  // p3-H: one entry per family, up to the 24-family ceiling.
  families: listOf(
    shape({ id: label, name: label, hex: hexValue, surfaces: surfaceList }),
    COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget
  ),
  advisories: listOf(
    shape({
      id: label,
      surface: surfaceValue,
      severity: oneOf(['info', 'warning']),
      code: oneOf(SURFACE_ADVISORY_CODES_V3),
      message: textOf(),
    }),
    512
  ),
  printTriplets: listOf(
    reviewPrintTriplet,
    COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget // p3-H
  ),
  cmykDisclaimer: value => value === CMYK_UNPROFILED_DISCLAIMER,
});

// p3-B: the declared proportion rule. Shares are prose, sources may omit a URL
// (the compared documents have no public page), and the authority is fixed.
const proportionSource: Check = value =>
  record(value) &&
  requiredAndOptional(value, ['label'], ['url']) &&
  text(value.label, 400) &&
  (!('url' in value) ||
    (typeof value.url === 'string' &&
      /^https:\/\/\S+$/.test(value.url) &&
      value.url.length <= 500));
const proportionTier = shape({
  tier: oneOf(COLOR_SYSTEM_PROPORTION_TIERS_V3),
  share: textOf(40),
  roles: value => strings(value, 16, 100),
});
const reviewProportionRule = shape({
  authority: value => value === 'teul-policy-default',
  tiers: value =>
    listOf(proportionTier, COLOR_SYSTEM_PROPORTION_TIERS_V3.length)(value) &&
    (value as unknown[]).length >= 1 &&
    new Set((value as { tier: string }[]).map(tier => tier.tier)).size ===
      (value as unknown[]).length,
  statement: textOf(600),
  sources: value => listOf(proportionSource, 16)(value) && (value as unknown[]).length >= 1,
  sourcesNote: textOf(600),
  note: textOf(300),
});

// Rendered typography pairs with WCAG ratio and supplementary APCA Lc.
const reviewTextPair = shape({
  id: label,
  useCategory: oneOf(['primary-body', 'supporting-body', 'large-heading', 'reverse-body']),
  mode: textOf(80),
  foreground: reviewColor,
  background: reviewColor,
  ratio: nullable(finiteIn(1, 21)),
  threshold: value => value === 3 || value === 4.5,
  status: oneOf(['pass', 'fail', 'unassessed', 'inactive-exempt']),
  apcaLc: nullable(finiteIn(-150, 150)),
});

// Requested versus achieved categorical marks per mode, when reported.
const reviewCategoricalCapacity = listOf(
  shape({
    mode: textOf(80),
    requestedMarkCount: integerIn(0, 64),
    achievedMarkCount: integerIn(0, 64),
    limitation: nullable(textOf()),
  }),
  8
);

function ratingDimension(value: unknown): boolean {
  return (
    record(value) &&
    Object.keys(value).every(key =>
      ['id', 'label', 'measuredValue', 'threshold', 'unit', 'evidenceIds'].includes(key)
    ) &&
    text(value.id, 200) &&
    text(value.label, 300) &&
    finite(value.measuredValue, -1_000_000, 1_000_000) &&
    (value.threshold === undefined || finite(value.threshold, -1_000_000, 1_000_000)) &&
    text(value.unit, 100) &&
    strings(value.evidenceIds, 1_000, 500)
  );
}

function sectionRating(value: unknown, role: string): boolean {
  return (
    value === null ||
    (record(value) &&
      only(value, ['section', 'dimensions', 'limitation']) &&
      value.section === role &&
      Array.isArray(value.dimensions) &&
      value.dimensions.length > 0 &&
      value.dimensions.length <= 16 &&
      value.dimensions.every(ratingDimension) &&
      text(value.limitation))
  );
}

function reviewVisualizationMark(value: unknown, expectedOrder: number): boolean {
  return (
    record(value) &&
    // p4-B: `origin` is optional; `recorded` marks reproduce a recorded chart color exactly.
    requiredAndOptional(value, ['order', 'label', 'color', 'renderedHex'], ['origin']) &&
    value.order === expectedOrder &&
    text(value.label, 300) &&
    reviewColor(value.color) &&
    typeof value.renderedHex === 'string' &&
    HEX.test(value.renderedHex) &&
    (value.origin === undefined || oneOf(COLOR_SYSTEM_VISUALIZATION_MARK_ORIGINS_V2)(value.origin)) // p4-B
  );
}

function reviewVisualizationBase(
  value: JsonRecord,
  minimumMarks: number,
  maximumMarks: number
): boolean {
  return (
    text(value.selectionId, 300) &&
    Array.isArray(value.marks) &&
    value.marks.length >= minimumMarks &&
    value.marks.length <= maximumMarks &&
    value.marks.every((mark, index) => reviewVisualizationMark(mark, index + 1)) &&
    reviewColor(value.surface) &&
    strings(value.evidenceIds, 256, 500)
  );
}

function reviewCategoricalSpecimen(value: unknown): boolean {
  return (
    record(value) &&
    requiredAndOptional(
      value,
      [
        'selectionId',
        'marks',
        'surface',
        'evidenceIds',
        'kind',
        'adjacency',
        'boundary',
        'directLabels',
        'nonColorCue',
      ],
      // wave2-E: adaptive categorical counts are optional on the wire; unknown keys still fail.
      ['requestedMarkCount', 'achievedMarkCount', 'limitation']
    ) &&
    reviewVisualizationBase(value, 2, 8) &&
    value.kind === 'categorical' &&
    (value.adjacency === 'separated' || value.adjacency === 'touching') &&
    (value.adjacency === 'separated'
      ? value.boundary === null
      : value.boundary !== null && reviewColor(value.boundary)) &&
    value.directLabels === true &&
    (value.nonColorCue === 'shape' || value.nonColorCue === 'pattern') &&
    // wave2-E: when present, the achieved count is the mark count and never above the request;
    // a limitation is present exactly when the request was not met.
    (value.requestedMarkCount === undefined || integer(value.requestedMarkCount, 2, 8)) &&
    (value.achievedMarkCount === undefined ||
      (integer(value.achievedMarkCount, 2, 8) &&
        Array.isArray(value.marks) &&
        value.achievedMarkCount === value.marks.length &&
        (value.requestedMarkCount === undefined ||
          value.achievedMarkCount <= (value.requestedMarkCount as number)))) &&
    (value.limitation === undefined || value.limitation === null || text(value.limitation, 500)) &&
    (value.requestedMarkCount === undefined ||
      value.achievedMarkCount === undefined ||
      value.limitation === undefined ||
      (value.limitation === null) === (value.achievedMarkCount === value.requestedMarkCount))
  );
}

function reviewSequentialSpecimen(value: unknown): boolean {
  return (
    record(value) &&
    only(value, [
      'selectionId',
      'marks',
      'surface',
      'evidenceIds',
      'kind',
      'direction',
      'axisLabel',
      'endpointLabels',
      'nonColorCue',
    ]) &&
    reviewVisualizationBase(value, 3, 9) &&
    value.kind === 'sequential' &&
    (value.direction === 'light-to-dark' || value.direction === 'dark-to-light') &&
    text(value.axisLabel, 300) &&
    strings(value.endpointLabels, 2, 300) &&
    value.endpointLabels.length === 2 &&
    value.nonColorCue === 'axis-and-endpoint-labels'
  );
}

function reviewDivergingSpecimen(value: unknown): boolean {
  return (
    record(value) &&
    only(value, [
      'selectionId',
      'marks',
      'surface',
      'evidenceIds',
      'kind',
      'midpointOrder',
      'midpointMeaning',
      'midpointPolarity',
      'zeroReferenceLine',
      'negativeLabel',
      'positiveLabel',
      'nonColorCue',
    ]) &&
    reviewVisualizationBase(value, 3, 9) &&
    value.kind === 'diverging' &&
    Array.isArray(value.marks) &&
    [3, 5, 7, 9].includes(value.marks.length) &&
    value.midpointOrder === (value.marks.length + 1) / 2 &&
    text(value.midpointMeaning, 300) &&
    (value.midpointPolarity === 'light' || value.midpointPolarity === 'dark') &&
    value.zeroReferenceLine === true &&
    text(value.negativeLabel, 300) &&
    text(value.positiveLabel, 300) &&
    value.nonColorCue === 'zero-line-and-sign-labels'
  );
}

function reviewVisualizationSpecimens(value: unknown, preserve: boolean): boolean {
  return (
    record(value) &&
    // wave2-UI: `categoricalCapacity` is optional and only present when the composer reports it.
    requiredAndOptional(
      value,
      ['categorical', 'sequential', 'diverging'],
      ['categoricalCapacity']
    ) &&
    reviewCategoricalSpecimen(value.categorical) &&
    ((preserve && value.sequential === null) || reviewSequentialSpecimen(value.sequential)) &&
    ((preserve && value.diverging === null) || reviewDivergingSpecimen(value.diverging)) &&
    (value.categoricalCapacity === undefined ||
      reviewCategoricalCapacity(value.categoricalCapacity))
  );
}

const PRODUCT_GRAPHICS_REVIEW_JOBS = [
  'product-graphic',
  'functional-iconography',
  'product-ui-surface',
] as const;

function reviewGraphicContrast(value: unknown): boolean {
  return (
    record(value) &&
    requiredAndOptional(value, ['ratio', 'requiredRatio', 'status', 'limitation'], ['apcaLc']) &&
    (value.ratio === null || (typeof value.ratio === 'number' && Number.isFinite(value.ratio))) &&
    (value.requiredRatio === 3 || value.requiredRatio === 4.5) &&
    ['pass', 'fail', 'unassessed', 'inactive-exempt'].includes(value.status as string) &&
    text(value.limitation) &&
    (value.apcaLc === undefined || value.apcaLc === null || finite(value.apcaLc, -150, 150))
  );
}

// Reuse wire shape checks; source and geometry admission stay in the backend.
const graphicSize: Check = value => finite(value, 1 / 64, 8192) && Number.isSafeInteger(value * 64);
const graphicRenderingShape = shape({
  policyVersion: oneOf(['teul-product-graphics-rendering/v1']),
  provenance: oneOf(['declared-context', 'legacy-pair-only']),
  requirementsHash: nullable(hash),
  contextId: textOf(),
  layoutHash: hash,
  width: graphicSize,
  height: graphicSize,
  uses: listOf(
    shape({
      id: textOf(),
      role: oneOf([
        'outer-backdrop',
        'card-surface',
        'control-surface',
        'accent',
        'functional-icon',
        'label',
        'border',
      ]),
      assessment: oneOf(['informative', 'decorative']),
      color: reviewColor,
    }),
    32,
    1
  ),
  nodes: listOf(
    shape({
      id: textOf(),
      parentId: nullable(textOf()),
      useId: textOf(),
      kind: oneOf(['rectangle', 'vector']),
      x: finiteIn(0, 8192),
      y: finiteIn(0, 8192),
      width: graphicSize,
      height: graphicSize,
      path: nullable(textOf(524288)),
      textAlternative: nullable(textOf()),
    }),
    1024,
    1
  ),
  pairs: listOf(
    shape({
      pairEvidenceId: textOf(),
      foregroundUseId: textOf(),
      backgroundUseId: textOf(),
      underlayUseId: nullable(textOf()),
      contrast: reviewGraphicContrast,
    }),
    64
  ),
});
function reviewGraphicRendering(value: unknown): boolean {
  if (!graphicRenderingShape(value)) return false;
  const data =
    value as import('./colorSystemReviewModelV2').ColorSystemReviewProductGraphicsRenderingV1;
  if ((data.provenance === 'declared-context') !== (data.requirementsHash !== null)) return false;
  const uses = new Set(data.uses.map(use => use.id));
  const pairs = new Set(data.pairs.map(pair => pair.pairEvidenceId));
  if (uses.size !== data.uses.length || pairs.size !== data.pairs.length) return false;
  const nodes = new Set<string>(),
    painted = new Set<string>();
  if (
    !data.nodes.every((node, index) => {
      if (
        nodes.has(node.id) ||
        !uses.has(node.useId) ||
        (index === 0 ? node.parentId !== null : !nodes.has(node.parentId!)) ||
        node.x + node.width > data.width ||
        node.y + node.height > data.height ||
        !Number.isSafeInteger(node.x * 64) ||
        !Number.isSafeInteger(node.y * 64) ||
        (node.kind === 'rectangle'
          ? node.path !== null
          : node.path === null || !/^[MLZ0-9.e+\-\s]+$/.test(node.path))
      )
        return false;
      nodes.add(node.id);
      painted.add(node.useId);
      return true;
    }) ||
    painted.size !== uses.size
  )
    return false;
  return (
    data.pairs.every(
      pair =>
        uses.has(pair.foregroundUseId) &&
        uses.has(pair.backgroundUseId) &&
        (pair.underlayUseId === null || uses.has(pair.underlayUseId))
    ) &&
    data.layoutHash ===
      deterministicContentHash({ width: data.width, height: data.height, nodes: data.nodes })
  );
}

function reviewProductGraphicsSpecimen(value: unknown, index: number): boolean {
  return (
    record(value) &&
    requiredAndOptional(
      value,
      [
        'derivationId',
        'job',
        'order',
        'mode',
        'intendedUse',
        'excludedUses',
        'assessment',
        'colors',
        'surface',
        'underlay',
        'contrast',
        'accessibilityStatus',
        'nonColorCue',
        'pairEvidenceIds',
        'evidenceIds',
      ],
      ['rendering', 'renderingLimitation']
    ) &&
    text(value.derivationId, 300) &&
    value.job === PRODUCT_GRAPHICS_REVIEW_JOBS[index] &&
    value.order === index + 1 &&
    text(value.mode, 300) &&
    text(value.intendedUse, 500) &&
    strings(value.excludedUses, 64, 500) &&
    (value.assessment === 'informative' || value.assessment === 'decorative') &&
    Array.isArray(value.colors) &&
    value.colors.length >= 1 &&
    value.colors.length <= 12 &&
    value.colors.every(reviewColor) &&
    (value.surface === null || reviewColor(value.surface)) &&
    (value.underlay === null || reviewColor(value.underlay)) &&
    (value.contrast === null || reviewGraphicContrast(value.contrast)) &&
    (value.assessment === 'decorative'
      ? value.contrast === null
      : value.surface !== null && value.contrast !== null) &&
    ['pass', 'exempt', 'blocked'].includes(value.accessibilityStatus as string) &&
    (value.nonColorCue === null || text(value.nonColorCue, 500)) &&
    strings(value.pairEvidenceIds, 256, 500) &&
    strings(value.evidenceIds, 256, 500) &&
    (value.rendering === undefined ||
      value.rendering === null ||
      reviewGraphicRendering(value.rendering)) &&
    (value.renderingLimitation === undefined ||
      value.renderingLimitation === null ||
      text(value.renderingLimitation))
  );
}

function reviewProductGraphicsSpecimens(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === PRODUCT_GRAPHICS_REVIEW_JOBS.length &&
    value.every((specimen, index) => reviewProductGraphicsSpecimen(specimen, index))
  );
}

function reviewSection(value: unknown, expectedRole: string): boolean {
  return (
    record(value) &&
    // wave2-UI: `textPairs` is optional and only allowed on the Typography section.
    requiredAndOptional(
      value,
      [
        'role',
        'title',
        'changeLabel',
        'disposition',
        'guidance',
        'colors',
        'exampleLabels',
        'ratings',
        'cardBoundary',
        'productGraphicsSpecimens',
        'visualizationSpecimens',
      ],
      ['textPairs']
    ) &&
    (value.textPairs === undefined ||
      (expectedRole === 'typography' &&
        Array.isArray(value.textPairs) &&
        value.textPairs.length <= 64 &&
        value.textPairs.every(reviewTextPair))) &&
    value.role === expectedRole &&
    text(value.title, 300) &&
    text(value.changeLabel, 300) &&
    ['preserve', 'rebuild', 'derive', 'omit'].includes(value.disposition as string) &&
    text(value.guidance) &&
    Array.isArray(value.colors) &&
    value.colors.length <= 512 &&
    value.colors.every(reviewColor) &&
    strings(value.exampleLabels, 256, 500) &&
    sectionRating(value.ratings, expectedRole) &&
    ['none', 'black-inside-1px', 'white-inside-1px'].includes(value.cardBoundary as string) &&
    (expectedRole === 'product-graphics'
      ? reviewProductGraphicsSpecimens(value.productGraphicsSpecimens)
      : value.productGraphicsSpecimens === null) &&
    (expectedRole === 'data-visualization'
      ? reviewVisualizationSpecimens(value.visualizationSpecimens, value.disposition === 'preserve')
      : value.visualizationSpecimens === null)
  );
}

const reviewDirectionDecision = shape({
  promise: textOf(),
  bestFor: textOf(),
  tradeoff: textOf(),
  authority: oneOf(['teul-recommendation']),
  ownerAcceptance: value => value === false,
});

const reviewModelShape = shapeWithOptional(
  {
    schemaVersion: oneOf([REVIEW_MODEL_SCHEMA_VERSION]),
    directionId: textOf(200),
    directionLabel: textOf(200),
    directionDecision: reviewDirectionDecision,
    status: oneOf(['ready-to-create']),
    headline: textOf(),
    summary: textOf(),
    unchanged: value => strings(value, 32),
    proposed: value => strings(value, 32),
    importantLimitations: value => strings(value, 32),
    families: listOf(reviewFamily, COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget, 4),
    sections: value =>
      Array.isArray(value) &&
      value.length === 5 &&
      value.every((section, index) => reviewSection(section, COLOR_SYSTEM_SECTION_ROLES_V2[index])),
    technicalReceipt: shape({
      sourceHash: hash,
      candidateHash: hash,
      applicationBlueprintHash: hash,
      sectionBlueprintHash: hash,
    }),
    reviewModelHash: hash,
  },
  {
    why: optionalValue(reviewWhy),
    brandSurfaces: optionalValue(reviewBrandSurfaces),
    proportionRule: optionalValue(reviewProportionRule),
    semanticRoles: optionalValue(reviewSemanticRoles),
    replaced: optionalValue(reviewReplaced),
    recommendedSystem: optionalValue(reviewRecommendedSystem),
  }
);
function reviewModel(value: unknown): boolean {
  if (!reviewModelShape(value)) return false;
  const data = value as JsonRecord;
  const specimens = (data.sections as JsonRecord[])[3].visualizationSpecimens as JsonRecord;
  const { reviewModelHash, ...content } = data;
  return (
    (data.why === undefined ||
      (specimens.sequential === null) ===
        ((data.why as JsonRecord).sequentialAdjacentCoefficientOfVariation === null)) &&
    deterministicContentHash(content) === reviewModelHash
  );
}

export type ColorSystemBuilderV2UIValidationResult =
  { valid: true; message: ColorSystemBuilderV2UIMessage } | { valid: false; error: string };

const dataVisualizationRequest = shape({
  mode: oneOf(['Light', 'Dark']),
  surfaceContext: oneOf(['light', 'dark']),
  categoricalMarkCount: integerIn(2, 8),
  sequentialMarkCount: integerIn(3, 9),
  divergingMarkCount: value => [3, 5, 7, 9].includes(value as number),
  adjacency: oneOf(['separated', 'touching']),
  midpointMeaning: textOf(160),
});

function genericRole(value: unknown): value is (typeof COLOR_SYSTEM_SECTION_ROLES_V2)[number] {
  return COLOR_SYSTEM_SECTION_ROLES_V2.includes(
    value as (typeof COLOR_SYSTEM_SECTION_ROLES_V2)[number]
  );
}

function genericDisposition(value: unknown): value is (typeof GENERIC_DISPOSITIONS)[number] {
  return GENERIC_DISPOSITIONS.includes(value as (typeof GENERIC_DISPOSITIONS)[number]);
}

function genericSectionDecision(value: unknown, expectedRole: string): boolean {
  return (
    record(value) &&
    only(value, ['role', 'decision']) &&
    value.role === expectedRole &&
    genericDisposition(value.decision)
  );
}

function genericSectionDecisions(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === COLOR_SYSTEM_SECTION_ROLES_V2.length &&
    value.every((decision, index) =>
      genericSectionDecision(decision, COLOR_SYSTEM_SECTION_ROLES_V2[index])
    )
  );
}

const genericSectionShape = shapeWithOptional(
  {
    role: null,
    label: textOf(120),
    sourceSummary: textOf(),
    planSummary: textOf(),
    basis: oneOf(GENERIC_BASES),
    decision: nullable(genericDisposition),
    allowedDecisions: value =>
      listOf(genericDisposition, GENERIC_DISPOSITIONS.length, 1)(value) &&
      new Set(value as unknown[]).size === (value as unknown[]).length,
  },
  {
    locked: optionalValue(booleanValue),
    limitation: optionalValue(textOf()),
    recordedColorCount: optionalValue(integerIn(0, 100000)),
  }
);
function genericSection(value: unknown, expectedRole: string): boolean {
  if (!genericSectionShape(value)) return false;
  const data = value as JsonRecord,
    allowed = data.allowedDecisions as unknown[];
  return (
    data.role === expectedRole &&
    (!genericDisposition(data.decision) || allowed.includes(data.decision)) &&
    (data.locked !== true ||
      (genericDisposition(data.decision) && allowed.length === 1 && allowed[0] === data.decision))
  );
}

const genericGapShape = shapeWithOptional(
  {
    id: requestId,
    kind: oneOf(GENERIC_GAP_KINDS),
    title: textOf(COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2),
    message: textOf(COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2),
    remediation: textOf(COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2),
    blocking: booleanValue,
  },
  { sectionRole: optionalValue(genericRole), resolvableByEdit: optionalValue(booleanValue) }
);
function genericGap(value: unknown): boolean {
  if (!genericGapShape(value)) return false;
  const data = value as JsonRecord;
  return (
    data.resolvableByEdit !== true || (data.blocking === true && data.sectionRole !== undefined)
  );
}

function genericGaps(value: unknown, minimum = 0): value is JsonRecord[] {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= 256 &&
    value.every(genericGap) &&
    new Set(value.map(gap => (gap as JsonRecord).id)).size === value.length
  );
}

const genericProposal = shapeWithOptional(
  {
    id: requestId,
    sourceLabel: textOf(300),
    summary: textOf(),
    found: value => strings(value, 64),
    fixed: value => strings(value, 64),
    proposed: value => strings(value, 64),
    sections: value =>
      Array.isArray(value) &&
      value.length === COLOR_SYSTEM_SECTION_ROLES_V2.length &&
      value.every((section, index) =>
        genericSection(section, COLOR_SYSTEM_SECTION_ROLES_V2[index])
      ),
    gaps: value => genericGaps(value),
    limitations: value => strings(value, 64),
  },
  { reviewedBrandConstraints: optionalValue(genericConstraintFragment) }
);

function genericConstraintFragment(value: unknown): boolean {
  try {
    parseColorSystemBrandConstraintsV1(value);
    return true;
  } catch {
    return false;
  }
}

function genericConstraintRules(value: unknown): boolean {
  try {
    normalizeColorSystemBrandRulesV1(value);
    return true;
  } catch {
    return false;
  }
}

function genericBrandRuleDecisions(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['fragmentHash', 'decisions']) &&
    hash(value.fragmentHash) &&
    Array.isArray(value.decisions) &&
    value.decisions.length <= COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_LIMITS.maximumRules &&
    value.decisions.every(
      decision =>
        record(decision) &&
        only(decision, ['ruleId', 'status']) &&
        requestId(decision.ruleId) &&
        ['accepted', 'rejected'].includes(decision.status as string)
    ) &&
    new Set(value.decisions.map(decision => (decision as JsonRecord).ruleId)).size ===
      value.decisions.length
  );
}

const genericPlanState = shapeWithOptional(
  { kind: oneOf(GENERIC_OUTCOMES) },
  { message: optionalValue(textOf()), firstBlockerId: optionalValue(requestId) }
);

function genericEditedRoles(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= COLOR_SYSTEM_SECTION_ROLES_V2.length &&
    value.every(genericRole) &&
    new Set(value).size === value.length
  );
}

const genericConfirmationDraft = shapeWithOptional(
  {
    proposalId: requestId,
    sectionDecisions: genericSectionDecisions,
    ownerEditedRoles: genericEditedRoles,
    acknowledgedGapIds: value => uniqueStrings(value, 256, 128) && value.every(requestId),
  },
  { brandRuleDecisions: optionalValue(genericBrandRuleDecisions) }
);

const genericGeneratedPolarityShape = shape({
  policyVersion: oneOf(['teul-color-system-generic-secondary-generation/v1']),
  negativeContributionId: requestId,
  positiveContributionId: requestId,
  status: oneOf(['owner-confirmed']),
  evidenceIds: value => uniqueStrings(value, 16, 128) && value.length > 0 && value.every(requestId),
});
function genericGeneratedPolarity(value: unknown): boolean {
  return (
    value === null ||
    (genericGeneratedPolarityShape(value) &&
      (value as JsonRecord).negativeContributionId !== (value as JsonRecord).positiveContributionId)
  );
}

function genericDisplayedPlanReceipt(value: unknown, expectedHash: unknown): boolean {
  if (!text(value, 100_000) || !hash(expectedHash)) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return canonicalJson(parsed) === value && deterministicContentHash(parsed) === expectedHash;
  } catch {
    return false;
  }
}

const genericConfirmationReceiptShape = shapeWithOptional(
  {
    sourceSnapshotHash: hash,
    proposalHash: hash,
    displayedPlanHash: hash,
    displayedPlanJson: null,
    sectionDecisions: genericSectionDecisions,
    ownerEditedRoles: genericEditedRoles,
    generatedPolarity: genericGeneratedPolarity,
    acknowledgedGapIds: value => uniqueStrings(value, 256, 128) && value.every(requestId),
    adapterVersion: textOf(100),
    inferencePolicyVersion: textOf(100),
    confirmationPolicyVersion: textOf(100),
    confirmedAt: isoUtc,
    confirmationHash: hash,
    handoffHash: hash,
  },
  { reviewedBrandConstraints: optionalValue(genericConstraintFragment) }
);
function genericConfirmationReceipt(value: unknown): boolean {
  return (
    genericConfirmationReceiptShape(value) &&
    genericDisplayedPlanReceipt(
      (value as JsonRecord).displayedPlanJson,
      (value as JsonRecord).displayedPlanHash
    )
  );
}

function firstBlockingGap(value: unknown): JsonRecord | null {
  if (!Array.isArray(value)) return null;
  return (
    (value.find(gap => record(gap) && gap.blocking === true) as JsonRecord | undefined) ?? null
  );
}

function outcomeMatchesFirstGap(outcome: unknown, gap: JsonRecord): boolean {
  if (outcome === 'ambiguous') return true;
  if (outcome === 'source-incomplete') {
    return [
      'missing-source',
      'conflicting-source',
      'unsupported-color',
      'unresolved-alias',
    ].includes(gap.kind as string);
  }
  const expectedKind: Readonly<Record<string, string>> = {
    empty: 'missing-source',
    'unsupported-profile': 'unsupported-profile',
    capacity: 'capacity',
    cancelled: 'other',
    'host-error': 'host-error',
    stale: 'source-changed',
  };
  return expectedKind[outcome as string] === gap.kind;
}

function validateGenericPlanResult(value: JsonRecord): boolean {
  if (
    !(value.analysisId === null || requestId(value.analysisId)) ||
    !(value.snapshotHash === null || hash(value.snapshotHash)) ||
    !genericPlanState(value.state) ||
    !(value.proposal === null || genericProposal(value.proposal))
  ) {
    return false;
  }

  const state = value.state as JsonRecord;
  const proposal = value.proposal as JsonRecord | null;
  const reviewable = ['ready', 'partial', 'ambiguous'].includes(state.kind as string);
  if (reviewable) {
    if (
      !only(value, ['type', 'requestId', 'analysisId', 'snapshotHash', 'state', 'proposal']) ||
      !requestId(value.analysisId) ||
      !proposal ||
      !hash(value.snapshotHash)
    ) {
      return false;
    }
  } else if (
    !only(value, [
      'type',
      'requestId',
      'analysisId',
      'snapshotHash',
      'state',
      'proposal',
      'gaps',
    ]) ||
    !genericGaps(value.gaps, 1)
  ) {
    return false;
  }
  if (state.kind === 'empty' && proposal !== null) return false;

  const outcomeGaps = reviewable ? proposal?.gaps : value.gaps;
  const first = firstBlockingGap(outcomeGaps);
  if (state.kind === 'ready' || state.kind === 'partial') {
    return first === null && state.firstBlockerId === undefined;
  }
  if (state.kind === 'ambiguous') {
    return first !== null && first.resolvableByEdit === true && state.firstBlockerId === first.id;
  }
  if (
    first === null ||
    state.firstBlockerId !== first.id ||
    !outcomeMatchesFirstGap(state.kind, first)
  ) {
    return false;
  }
  if (!proposal) return true;
  return JSON.stringify(proposal.gaps) === JSON.stringify(value.gaps);
}

function reviewResult(value: JsonRecord): boolean {
  return (
    text(value.sessionId, 200) &&
    integer(value.sourceColorCount, 1, 50_000) &&
    integer(value.scannedNodeCount, 0, 100_000) &&
    ['selection', 'current-page', 'whole-file'].includes(value.resolvedUsageScope as string) &&
    text(value.recommendedDirectionId, 200) &&
    text(value.selectedDirectionId, 200) &&
    Array.isArray(value.reviews) &&
    value.reviews.length >= 1 &&
    value.reviews.length <= 3 &&
    value.reviews.every(reviewModel) &&
    value.reviews.some(review => review.directionId === value.recommendedDirectionId) &&
    value.reviews.some(review => review.directionId === value.selectedDirectionId) &&
    strings(value.limitations, 32)
  );
}

function validateGenericConfirmationSuccess(value: JsonRecord): boolean {
  return (
    only(value, [
      'type',
      'requestId',
      'success',
      'status',
      'analysisId',
      'snapshotHash',
      'proposalId',
      'receipt',
      'sessionId',
      'sourceColorCount',
      'scannedNodeCount',
      'resolvedUsageScope',
      'recommendedDirectionId',
      'selectedDirectionId',
      'reviews',
      'limitations',
    ]) &&
    value.success === true &&
    value.status === 'confirmed-ready' &&
    requestId(value.analysisId) &&
    hash(value.snapshotHash) &&
    requestId(value.proposalId) &&
    genericConfirmationReceipt(value.receipt) &&
    (value.receipt as JsonRecord).sourceSnapshotHash === value.snapshotHash &&
    (value.receipt as JsonRecord).displayedPlanHash === value.proposalId &&
    reviewResult(value)
  );
}

function validateGenericConfirmationFailure(value: JsonRecord): boolean {
  if (
    !only(value, [
      'type',
      'requestId',
      'success',
      'analysisId',
      'snapshotHash',
      'state',
      'gaps',
      'error',
    ]) ||
    value.success !== false ||
    !requestId(value.analysisId) ||
    !(value.snapshotHash === null || hash(value.snapshotHash)) ||
    !genericPlanState(value.state) ||
    !genericGaps(value.gaps, 1) ||
    !text(value.error)
  ) {
    return false;
  }
  const state = value.state as JsonRecord;
  const first = firstBlockingGap(value.gaps);
  return (
    GENERIC_CONFIRMATION_FAILURE_OUTCOMES.includes(
      state.kind as (typeof GENERIC_CONFIRMATION_FAILURE_OUTCOMES)[number]
    ) &&
    first !== null &&
    state.firstBlockerId === first.id &&
    outcomeMatchesFirstGap(state.kind, first)
  );
}

export function validateColorSystemBuilderV2UIMessage(
  value: unknown
): ColorSystemBuilderV2UIValidationResult {
  if (!record(value) || !requestId(value.requestId) || typeof value.type !== 'string') {
    return { valid: false, error: 'Invalid v2 color builder request.' };
  }
  if (value.type === 'analyze-intelligent-color-system-v2') {
    const automaticScope = value.sourceScopeMode === 'auto';
    const manualScope = value.sourceScopeMode === 'manual';
    const scopeIsValid = ['selection', 'current-page', 'whole-file'].includes(
      value.usageScope as string
    );
    const authorizationIsValid =
      (automaticScope && value.usageScope === 'selection' && value.confirmWholeFile === true) ||
      (manualScope &&
        ((value.usageScope === 'whole-file' && value.confirmWholeFile === true) ||
          (value.usageScope !== 'whole-file' && value.confirmWholeFile === false)));
    if (
      only(value, [
        'type',
        'requestId',
        'sourceScopeMode',
        'usageScope',
        'confirmWholeFile',
        'dataVisualization',
      ]) &&
      (automaticScope || manualScope) &&
      scopeIsValid &&
      typeof value.confirmWholeFile === 'boolean' &&
      authorizationIsValid &&
      dataVisualizationRequest(value.dataVisualization)
    ) {
      return { valid: true, message: value as unknown as ColorSystemBuilderV2UIMessage };
    }
    return { valid: false, error: 'Invalid v2 analysis request.' };
  }
  if (value.type === 'create-intelligent-color-system-v2') {
    if (
      requiredAndOptional(
        value,
        [
          'type',
          'requestId',
          'sessionId',
          'directionId',
          'collisionPolicy',
          'currentFileAcknowledged',
          'manualPublicationAcknowledged',
        ],
        ['ownerSpotColors'] // p4-DE: owner-typed spot references, shape-validated only
      ) &&
      (value.ownerSpotColors === undefined || ownerSpotColors(value.ownerSpotColors)) && // p4-DE
      text(value.sessionId, 200) &&
      text(value.directionId, 200) &&
      value.collisionPolicy === 'create-copy' &&
      value.currentFileAcknowledged === true &&
      value.manualPublicationAcknowledged === true
    ) {
      return { valid: true, message: value as unknown as ColorSystemBuilderV2UIMessage };
    }
    return { valid: false, error: 'Invalid v2 Create request.' };
  }
  if (value.type === 'analyze-generic-color-system-v2') {
    const scope = value.sourceScope;
    const scopeIsValid = GENERIC_SOURCE_SCOPES.includes(
      scope as (typeof GENERIC_SOURCE_SCOPES)[number]
    );
    const authorizationIsValid =
      ((scope === 'automatic' || scope === 'whole-file') && value.confirmWholeFile === true) ||
      ((scope === 'selection' || scope === 'current-page') && value.confirmWholeFile === false);
    if (
      requiredAndOptional(
        value,
        ['type', 'requestId', 'sourceScope', 'confirmWholeFile', 'dataVisualization'],
        ['brandConstraintRules']
      ) &&
      scopeIsValid &&
      typeof value.confirmWholeFile === 'boolean' &&
      authorizationIsValid &&
      dataVisualizationRequest(value.dataVisualization) &&
      (value.brandConstraintRules === undefined ||
        genericConstraintRules(value.brandConstraintRules))
    ) {
      return { valid: true, message: value as unknown as ColorSystemBuilderV2UIMessage };
    }
    return { valid: false, error: 'Invalid generic v2 analysis request.' };
  }
  if (value.type === 'cancel-generic-color-system-v2') {
    if (
      only(value, ['type', 'requestId', 'targetRequestId']) &&
      requestId(value.targetRequestId) &&
      value.targetRequestId !== value.requestId
    ) {
      return { valid: true, message: value as unknown as ColorSystemBuilderV2UIMessage };
    }
    return { valid: false, error: 'Invalid generic v2 cancellation request.' };
  }
  if (value.type === 'confirm-generic-color-system-plan-v2') {
    if (
      only(value, ['type', 'requestId', 'analysisId', 'snapshotHash', 'proposalId', 'draft']) &&
      requestId(value.analysisId) &&
      hash(value.snapshotHash) &&
      requestId(value.proposalId) &&
      genericConfirmationDraft(value.draft) &&
      (value.draft as JsonRecord).proposalId === value.proposalId
    ) {
      return { valid: true, message: value as unknown as ColorSystemBuilderV2UIMessage };
    }
    return { valid: false, error: 'Invalid generic v2 confirmation request.' };
  }
  return { valid: false, error: 'Unsupported v2 color builder request.' };
}

export type ColorSystemBuilderV2PluginValidationResult =
  { valid: true; message: ColorSystemBuilderV2PluginMessage } | { valid: false; error: string };

function cleanup(value: unknown): boolean {
  if (
    !record(value) ||
    !only(value, ['attempted', 'complete', 'removedResourceCount', 'errors']) ||
    typeof value.attempted !== 'boolean' ||
    typeof value.complete !== 'boolean' ||
    !integer(value.removedResourceCount, 0, 20_000) ||
    !strings(value.errors, 256)
  ) {
    return false;
  }
  if (!value.attempted) {
    return value.complete === true && value.removedResourceCount === 0 && value.errors.length === 0;
  }
  return value.complete ? value.errors.length === 0 : value.errors.length > 0;
}

export function validateColorSystemBuilderV2PluginMessage(
  value: unknown
): ColorSystemBuilderV2PluginValidationResult {
  if (!record(value) || !requestId(value.requestId) || typeof value.type !== 'string') {
    return { valid: false, error: 'Invalid v2 color builder response.' };
  }
  if (value.type === 'intelligent-color-system-v2-progress') {
    return only(value, ['type', 'requestId', 'phase', 'message']) &&
      ['reading-source', 'building-directions', 'revalidating', 'creating'].includes(
        value.phase as string
      ) &&
      text(value.message)
      ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
      : { valid: false, error: 'Invalid v2 progress response.' };
  }
  if (value.type === 'intelligent-color-system-v2-analysis-result') {
    if (value.success === true) {
      const valid =
        only(value, [
          'type',
          'requestId',
          'success',
          'sessionId',
          'sourceColorCount',
          'scannedNodeCount',
          'resolvedUsageScope',
          'recommendedDirectionId',
          'selectedDirectionId',
          'reviews',
          'limitations',
        ]) && reviewResult(value);
      return valid
        ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
        : { valid: false, error: 'Invalid v2 analysis success response.' };
    }
    const valid =
      value.success === false &&
      only(value, ['type', 'requestId', 'success', 'blockers', 'error']) &&
      Array.isArray(value.blockers) &&
      value.blockers.length >= 1 &&
      value.blockers.length <= 32 &&
      value.blockers.every(blocker) &&
      text(value.error);
    return valid
      ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
      : { valid: false, error: 'Invalid v2 analysis failure response.' };
  }
  if (value.type === 'generic-color-system-v2-progress') {
    const valid =
      only(value, [
        'type',
        'requestId',
        'analysisId',
        'phase',
        'message',
        'loadedPageCount',
        'discoveredResourceCount',
        'visitedNodeCount',
        'cancellable',
      ]) &&
      (value.analysisId === null || requestId(value.analysisId)) &&
      GENERIC_PROGRESS_PHASES.includes(value.phase as (typeof GENERIC_PROGRESS_PHASES)[number]) &&
      (value.analysisId !== null || value.phase === 'reading-source') &&
      text(value.message) &&
      integer(value.loadedPageCount, 0, 10_000) &&
      integer(value.discoveredResourceCount, 0, 50_000) &&
      integer(value.visitedNodeCount, 0, 100_000) &&
      typeof value.cancellable === 'boolean';
    return valid
      ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
      : { valid: false, error: 'Invalid generic v2 progress response.' };
  }
  if (value.type === 'generic-color-system-v2-plan-result') {
    return validateGenericPlanResult(value)
      ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
      : { valid: false, error: 'Invalid generic v2 plan response.' };
  }
  if (value.type === 'generic-color-system-v2-confirmation-result') {
    const valid =
      value.success === true
        ? validateGenericConfirmationSuccess(value)
        : validateGenericConfirmationFailure(value);
    return valid
      ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
      : { valid: false, error: 'Invalid generic v2 confirmation response.' };
  }
  if (value.type === 'intelligent-color-system-v2-create-result') {
    if (value.success === true) {
      const valid =
        requiredAndOptional(
          value,
          [
            'type',
            'requestId',
            'success',
            'sessionId',
            'directionId',
            'action',
            'outputName',
            'pageName',
            'resourceBlueprintHash',
            'createAuthorizationHash',
            'created',
            'manualPublicationRequired',
            'warnings',
          ],
          ['tokens', 'ownerSpotColors'] // p3-C: optional token exports; p4-DE: spot echo
        ) &&
        (value.tokens === undefined || tokenExport(value.tokens)) && // p3-C
        (value.ownerSpotColors === undefined ||
          ownerSpotColorsEcho(value.ownerSpotColors, value.action)) && // p4-DE
        text(value.sessionId, 200) &&
        text(value.directionId, 200) &&
        text(value.outputName, 120) &&
        text(value.pageName, 120) &&
        hash(value.resourceBlueprintHash) &&
        hash(value.createAuthorizationHash) &&
        record(value.created) &&
        only(value.created, ['collections', 'variables', 'styles', 'components', 'frames']) &&
        ((value.action === 'created' &&
          value.created.collections === 2 &&
          integer(value.created.variables, 1, 512) &&
          integer(value.created.styles, 1, 1_024) &&
          integer(value.created.components, 1, 512) &&
          value.created.frames === 5) ||
          (value.action === 'verified-no-op' &&
            value.created.collections === 0 &&
            value.created.variables === 0 &&
            value.created.styles === 0 &&
            value.created.components === 0 &&
            value.created.frames === 0)) &&
        value.manualPublicationRequired === true &&
        strings(value.warnings, 32);
      return valid
        ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
        : { valid: false, error: 'Invalid v2 Create success response.' };
    }
    const valid =
      value.success === false &&
      only(value, ['type', 'requestId', 'success', 'failureStage', 'cleanup', 'error']) &&
      ['preflight', 'revalidation', 'authorization', 'creation', 'verification'].includes(
        value.failureStage as string
      ) &&
      cleanup(value.cleanup) &&
      text(value.error);
    return valid
      ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
      : { valid: false, error: 'Invalid v2 Create failure response.' };
  }
  return { valid: false, error: 'Unsupported v2 color builder response.' };
}
