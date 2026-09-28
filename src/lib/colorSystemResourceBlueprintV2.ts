import { colorSystemBrandTerritoryMatchesSourceV1 } from './colorSystemBrandConstraintsV1';
import { getWCAGContrastHex } from './accessibility';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import {
  COLOR_SYSTEM_BUILDER_V2_LIMITS,
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_SECTION_ROLES_V2,
  type ColorSystemApplicationColorRefV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemFamilyMemberProvenanceV2,
  type ColorSystemFamilyMemberV2,
  type ColorSystemRoleFrameRecipeV2,
  type ColorSystemSecondaryFamilyV2,
  type ColorSystemPreservedColorV2,
  type ColorSystemSectionRoleV2,
  type ColorSystemStrategyCandidateV2,
  type ColorSystemStrategySetV2,
  COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2,
} from './colorSystemBuilderV2Contracts';
import {
  assertColorSystemBuilderBriefV2Integrity,
  assertColorSystemStrategyCandidateV2Integrity,
  assertColorSystemStrategySetV2Integrity,
} from './colorSystemBuilderV2Integrity';
import {
  assertColorSystemApplicationBlueprintV2Integrity,
  assertColorSystemSectionBlueprintV2Integrity,
  type ColorSystemApplicationSystemBlueprintV2,
  type ColorSystemProductSemanticRoleV2,
  type ColorSystemSectionBlueprintV2,
} from './colorSystemApplicationBlueprintV2';
import { paletteHueFamilyV3 } from './colorSystemPaletteAnalysisV3';
import {
  assertColorSystemPresentationProfileV2ContentIntegrity,
  type ColorSystemPresentationProfileV2,
  type ColorSystemPresentationSectionRecipeV2,
} from './colorSystemPresentationProfileV2';
import { COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3 } from './colorSystemSecondaryStrategyV3';
import { compareText, hexToOklch } from './utils';
import { buildColorSystemSrgbValueV1 } from './colorSystemSrgbValueV1';
import {
  getColorSystemProductGraphicsRenderingV1,
  type ColorSystemProductGraphicsRenderingV1,
} from './colorSystemProductGraphicsPlanV1';

export const COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION =
  'teul-color-resource-blueprint/v2' as const;
export const COLOR_SYSTEM_RESOURCE_COMPILER_V2_POLICY_VERSION =
  'teul-color-resource-compiler/v2' as const;
/**
 * p3-C: token names follow one path scheme so Figma groups them and DTCG can
 * address them (`color/gold/9` becomes `{color.gold.9}`). The direction lives in
 * the collection and page name, never in a token.
 */
export const COLOR_SYSTEM_TOKEN_NAMING_V2_VERSION = 'teul-token-naming/v2' as const;

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SYSTEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
/** Every token path segment: lower-case, DTCG-legal (no `.`, `{`, `}`, `$`), Figma-legal. */
const TOKEN_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MEMBER_STEP_PATTERN = /^step-(\d{1,2})$/;
/** Roles whose solid fill is interactive and therefore needs hover and pressed aliases. */
export const COLOR_SYSTEM_INTERACTIVE_FILL_ROLES_V2 = [
  'selected',
  'success',
  'warning',
  'error',
  'information',
  'destructive',
  'link',
] as const;
/** `colorScale.ts` usage labels: step 9 "Solid backgrounds", 10 "Hovered solid backgrounds",
 * 11 "Low-contrast text". Hover takes 10 and pressed takes 11 unless the rest fill already
 * sits there, in which case the states step up from the rest fill so they stay distinct. */
const STATE_HOVER_STEP = 10;
const STATE_PRESSED_STEP = 11;
const SCALE_LAST_STEP = 12;
/** WCAG 2.2 non-text contrast (1.4.11) against the surface the fill sits on. */
const STATE_MINIMUM_SURFACE_CONTRAST = 3;
const STATE_SURFACE_ROLES = ['surface', 'background'] as const;
/** Alias kinds that earn a Paint Style: the values a designer picks from the picker. */
const STYLE_ALIAS_KINDS: ReadonlySet<ColorSystemSemanticVariableRecipeV2['applicationKind']> =
  new Set(['product-semantic', 'data-visualization', 'product-graphics']);

export type ColorSystemResourceBlueprintV2ErrorCode =
  | 'INVALID_RESOURCE_INPUT'
  | 'RESOURCE_AUTHORITY_MISMATCH'
  | 'ORPHAN_RESOURCE_REFERENCE'
  | 'RESOURCE_CLASSIFICATION_MISMATCH'
  | 'RESOURCE_CAP_EXCEEDED'
  | 'RESOURCE_BLUEPRINT_INTEGRITY';

export class ColorSystemResourceBlueprintV2Error extends Error {
  constructor(
    readonly code: ColorSystemResourceBlueprintV2ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ColorSystemResourceBlueprintV2Error';
  }
}

export interface ColorSystemResourceOutputV2 {
  systemId: string;
  name: string;
  modes: readonly string[];
}

export type ColorSystemPrimitiveOriginV2 =
  | {
      kind: 'preserved-source';
      stableColorId: string;
      section: ColorSystemSectionRoleV2;
      evidenceIds: readonly string[];
    }
  | {
      kind: 'approved-secondary';
      familyId: string;
      memberId: string;
      provenance: ColorSystemFamilyMemberProvenanceV2;
    }
  | {
      kind: 'application-derivation';
      derivationId: string;
      sourceVariableRecipeId: string;
      transform: { kind: 'alpha'; alpha: number };
      evidenceIds: readonly string[];
    };

export interface ColorSystemPrimitiveVariableRecipeV2 {
  recipeId: string;
  kind: 'primitive' | 'derivation';
  name: string;
  description: string;
  valuesByMode: Readonly<Record<string, ColorSystemColorValueV2>>;
  scopes: readonly ['ALL_SCOPES'];
  origin: ColorSystemPrimitiveOriginV2;
}

export interface ColorSystemAliasTargetV2 {
  kind: 'variable-alias';
  targetVariableRecipeId: string;
}

export interface ColorSystemSemanticVariableRecipeV2 {
  recipeId: string;
  kind: 'alias';
  applicationKind: 'product-semantic' | 'product-graphics' | 'data-visualization' | 'typography';
  applicationId: string;
  name: string;
  description: string;
  aliasesByMode: Readonly<Record<string, ColorSystemAliasTargetV2>>;
  scopes: readonly string[];
  evidenceIds: readonly string[];
}

export interface ColorSystemPrimitiveCollectionRecipeV2 {
  recipeId: 'collection/primitives';
  role: 'primitives';
  name: string;
  modes: readonly string[];
  variables: readonly ColorSystemPrimitiveVariableRecipeV2[];
}

export interface ColorSystemSemanticCollectionRecipeV2 {
  recipeId: 'collection/semantics';
  role: 'semantics';
  name: string;
  modes: readonly string[];
  variables: readonly ColorSystemSemanticVariableRecipeV2[];
}

export interface ColorSystemPaintStyleRecipeV2 {
  recipeId: string;
  name: string;
  description: string;
  binding: {
    kind: 'variable';
    variableRecipeId: string;
  };
}

export type ColorSystemComponentKindV2 =
  'primary-family' | 'secondary-family' | 'product-graphics' | 'data-visualization' | 'typography';

export interface ColorSystemComponentPaintBindingV2 {
  purpose: string;
  mode: string;
  variableRecipeId: string;
}

export interface ColorSystemComponentRecipeV2 {
  recipeId: string;
  kind: ColorSystemComponentKindV2;
  role: ColorSystemSectionRoleV2;
  name: string;
  content: unknown;
  paintBindings: readonly ColorSystemComponentPaintBindingV2[];
}

export interface ColorSystemResourcePresentationRecipeV2 {
  frame: ColorSystemPresentationProfileV2['frame'];
  typography: readonly ColorSystemPresentationProfileV2['typography'][number][];
  section: Omit<
    ColorSystemPresentationSectionRecipeV2,
    'sourceNodeId' | 'headerNodeId' | 'paletteNodeId'
  >;
  cardBoundaryPolicy: ColorSystemPresentationProfileV2['cardBoundaryPolicy'];
  rendererClaimBoundary: ColorSystemPresentationProfileV2['rendererClaimBoundary'];
}

export interface ColorSystemRoleFrameResourceRecipeV2 {
  recipeId: string;
  role: ColorSystemSectionRoleV2;
  order: number;
  sectionContent: ColorSystemRoleFrameRecipeV2;
  presentationContent: ColorSystemResourcePresentationRecipeV2;
  componentRecipeIds: readonly string[];
  systemVariableRecipeIds: readonly string[];
  documentationChrome: {
    classification: 'documentation-chrome-not-system-color';
    backgroundHex: '#FFFFFF';
    boundaryPolicy: 'none-or-monochrome-inside-1px';
  };
}

export interface ColorSystemResourceBlueprintCountsV2 {
  primitiveVariables: number;
  aliasVariables: number;
  variables: number;
  styles: number;
  components: number;
  frames: 5;
  familyModeComponentVariants: number;
  estimatedNodes: number;
}

function visualizationLegendNodeCount(components: readonly ColorSystemComponentRecipeV2[]): number {
  return components.reduce(
    (count, component) =>
      count +
      (component.kind === 'data-visualization'
        ? 1 +
          component.paintBindings.filter(binding => binding.purpose.startsWith('mark-')).length * 2
        : 0),
    0
  );
}

/** Current delivery estimate; saved estimates remain part of their original blueprint identity. */
export function estimateColorSystemResourceNodesV2(
  variableCount: number,
  styles: readonly ColorSystemPaintStyleRecipeV2[],
  components: readonly ColorSystemComponentRecipeV2[],
  frames: readonly ColorSystemRoleFrameResourceRecipeV2[]
): number {
  return (
    variableCount +
    styles.length +
    components.reduce(
      (count, component) =>
        count +
        4 +
        (component.kind === 'product-graphics'
          ? ((component.content as { rendering?: ColorSystemProductGraphicsRenderingV1 }).rendering
              ?.nodes.length ?? component.paintBindings.length * 2)
          : component.paintBindings.length * 2),
      0
    ) +
    visualizationLegendNodeCount(components) +
    frames.reduce(
      (count, frame) =>
        count + 8 + frame.componentRecipeIds.length * 2 + frame.systemVariableRecipeIds.length,
      0
    )
  );
}

export interface ColorSystemResourceBlueprintLimitsV2 {
  maximumVariables: 512;
  maximumAliases: 128;
  maximumStyles: 1024;
  /** p3-H: 24 families × 2 scale modes; see COLOR_SYSTEM_BUILDER_V2_LIMITS. */
  maximumFamilyModeComponentVariants: 48;
  maximumEstimatedNodes: 5000;
}

/** p3-C: how a family earned its path slug. */
export type ColorSystemFamilySlugBasisV2 =
  'brand-name' | 'hue-family' | 'neutral' | 'status-reserve';

export interface ColorSystemFamilyTokenNameV2 {
  familyId: string;
  /** Second path segment of every member: `color/<slug>/<step>`. */
  slug: string;
  basis: ColorSystemFamilySlugBasisV2;
  /** The family display name with its direction suffix removed. */
  sourceName: string;
  /** 12-sector OKLCH hue word of the anchor when `basis` is `hue-family`. */
  hueFamily: string | null;
  /** The member whose value designers pick from the picker (step 9 or the named base). */
  anchorMemberId: string | null;
  anchorVariableRecipeId: string | null;
}

/** P4-C: how a preserved source earned its group segment. */
export type ColorSystemSourceGroupBasisV2 = 'recorded-heading' | 'section';

export interface ColorSystemSourceTokenNameV2 {
  stableColorId: string;
  section: ColorSystemSectionRoleV2;
  /**
   * Second path segment. The recorded heading when the display name carries one
   * ("Data Viz / 01 Sky" → `data-viz`), otherwise the section's own slug
   * (`data-visualization` → `data-viz`).
   */
  group: string;
  groupBasis: ColorSystemSourceGroupBasisV2;
  /**
   * Third path segment: the recorded display name ("01 Sky" → `01-sky`; a digit
   * may lead because the group precedes it). The second holder of a slug within
   * a group becomes `<slug>-2`, then `-3`, in recorded order.
   */
  slug: string;
  /** `source/<group>/<slug>`: the exact preserved value, byte-identical to its source. */
  path: string;
  sourceName: string;
}

export interface ColorSystemStateTokenRecordV2 {
  role: (typeof COLOR_SYSTEM_INTERACTIVE_FILL_ROLES_V2)[number];
  mode: string;
  familySlug: string;
  baseStep: number;
  hoverStep: number;
  pressedStep: number;
  /** Lowest WCAG ratio of the chosen step against every checked surface role; null when none exists. */
  hoverContrast: number | null;
  pressedContrast: number | null;
  checkedAgainst: readonly string[];
  /** Deviations from the plain 10/11 rule, stated so the record explains itself. */
  notes: readonly string[];
  interaction?: {
    requirementsHash: string;
    pairEvidenceIds: readonly string[];
    minimumLabelContrast: number | null;
  };
}

export interface ColorSystemStateTokenSkipV2 {
  role: (typeof COLOR_SYSTEM_INTERACTIVE_FILL_ROLES_V2)[number];
  reason: string;
}

export interface ColorSystemStylePolicyV2 {
  kind: 'semantic-aliases-and-anchors';
  statement: string;
  emittedStyles: number;
  /** Primitive variables that no longer receive a one-to-one Paint Style. */
  suppressedPrimitiveStyles: number;
  /** Alias variables that no longer receive a Paint Style (typography specimen bindings). */
  suppressedAliasStyles: number;
  anchorVariableRecipeIds: readonly string[];
  includedAliasKinds: readonly ColorSystemSemanticVariableRecipeV2['applicationKind'][];
  excludedAliasKinds: readonly ColorSystemSemanticVariableRecipeV2['applicationKind'][];
}

export interface ColorSystemTokenNamingV2 {
  version: typeof COLOR_SYSTEM_TOKEN_NAMING_V2_VERSION;
  scheme: {
    source: 'source/<group>/<name>';
    family: 'color/<family>/<step>';
    derivation: '<source path>-a<alpha percent>';
    semantic: 'semantic/<role>';
    state: 'semantic/<role>-hover | semantic/<role>-pressed';
    graphics: 'semantic/graphics/<job>/<n>';
    chart: 'semantic/chart/<kind>/<n | surface | boundary>';
    typography: 'semantic/typography/<use>/<mode>/<purpose>';
  };
  /** The strategy direction is carried by the collection and page names only. */
  directionCarrier: 'collection-and-page-name';
  families: readonly ColorSystemFamilyTokenNameV2[];
  sources: readonly ColorSystemSourceTokenNameV2[];
  stateTokens: readonly ColorSystemStateTokenRecordV2[];
  stateTokenSkips: readonly ColorSystemStateTokenSkipV2[];
  stylePolicy: ColorSystemStylePolicyV2;
}

export interface ColorSystemResourceBlueprintV2 {
  version: typeof COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION;
  policyVersion: typeof COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION;
  resourcePolicyVersion: typeof COLOR_SYSTEM_RESOURCE_COMPILER_V2_POLICY_VERSION;
  sourceAuthorityHash: string;
  sourceHash: string;
  sourcePackageHash: string;
  briefHash: string;
  strategySetHash: string;
  candidateId: string;
  candidateHash: string;
  applicationBlueprintHash: string;
  sectionBlueprintHash: string;
  presentationProfileHash: string;
  compilerVersion: string;
  output: ColorSystemResourceOutputV2;
  sectionBlueprint: ColorSystemSectionBlueprintV2;
  collections: readonly [
    ColorSystemPrimitiveCollectionRecipeV2,
    ColorSystemSemanticCollectionRecipeV2,
  ];
  styles: readonly ColorSystemPaintStyleRecipeV2[];
  components: readonly ColorSystemComponentRecipeV2[];
  frames: readonly [
    ColorSystemRoleFrameResourceRecipeV2,
    ColorSystemRoleFrameResourceRecipeV2,
    ColorSystemRoleFrameResourceRecipeV2,
    ColorSystemRoleFrameResourceRecipeV2,
    ColorSystemRoleFrameResourceRecipeV2,
  ];
  counts: ColorSystemResourceBlueprintCountsV2;
  limits: ColorSystemResourceBlueprintLimitsV2;
  /** p3-C: naming, state-token, and Paint Style policy evidence for this system. */
  tokenNaming: ColorSystemTokenNamingV2;
  resourceBlueprintHash: string;
}

export interface BuildColorSystemResourceBlueprintV2Input {
  compilerVersion: string;
  systemId: string;
  outputName: string;
}

type ResourceBlueprintContent = Omit<ColorSystemResourceBlueprintV2, 'resourceBlueprintHash'>;

interface ResolvedColorRecipe {
  variableRecipeId: string;
  mode: string;
  value: ColorSystemColorValueV2;
}

function fail(code: ColorSystemResourceBlueprintV2ErrorCode, message: string): never {
  throw new ColorSystemResourceBlueprintV2Error(code, message);
}

function text(value: string, label: string, maximum = 160): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maximum ||
    [...normalized].some(character => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    fail('INVALID_RESOURCE_INPUT', `${label} must be bounded printable text.`);
  }
  return normalized;
}

function segment(value: string): string {
  return encodeURIComponent(value).replace(/%/g, '_');
}

function recipeId(...parts: readonly string[]): string {
  return parts.map(segment).join('/');
}

function refKey(ref: ColorSystemApplicationColorRefV2): string {
  return ref.kind === 'preserved-source-color'
    ? `source\u0000${ref.stableColorId}\u0000${ref.mode}`
    : `family\u0000${ref.ref.familyId}\u0000${ref.ref.memberId}\u0000${ref.ref.mode}`;
}

function refForMode(
  ref: ColorSystemApplicationColorRefV2,
  mode: string
): ColorSystemApplicationColorRefV2 {
  return ref.kind === 'preserved-source-color'
    ? { ...ref, mode }
    : { ...ref, ref: { ...ref.ref, mode } };
}

function addUnique<T extends { recipeId: string }>(
  map: Map<string, T>,
  recipe: T,
  label: string
): void {
  if (map.has(recipe.recipeId)) {
    fail('RESOURCE_CLASSIFICATION_MISMATCH', `Duplicate ${label} recipe ${recipe.recipeId}.`);
  }
  map.set(recipe.recipeId, recipe);
}

function cloneValue(value: ColorSystemColorValueV2): ColorSystemColorValueV2 {
  return {
    colorSpace: value.colorSpace,
    hex: value.hex,
    components: { ...value.components },
    alpha: value.alpha,
    ...(value.representation ? { representation: { ...value.representation } } : {}),
  };
}

function sortedModes(modes: readonly string[]): string[] {
  const normalized = [...modes].map(mode => text(mode, 'mode', 80)).sort(compareText);
  if (normalized.length === 0 || new Set(normalized).size !== normalized.length) {
    fail('INVALID_RESOURCE_INPUT', 'Output modes must be a non-empty unique set.');
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// p3-C: token naming
// ---------------------------------------------------------------------------

/** Lower-case ASCII slug: diacritics folded, everything else collapsed to `-`. */
function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "Secondary / Gold" names the color "Gold"; the leading segments are the source's grouping. */
function lastPathSegment(value: string): string {
  const segments = value
    .split('/')
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : value.trim();
}

function nameSlug(value: string, fallback: string): string {
  const slug = slugify(lastPathSegment(value));
  if (slug.length === 0) return fallback;
  return /^[0-9]/.test(slug) ? `${fallback}-${slug}` : slug;
}

/** Unique within `used`; the second holder of a slug becomes `<slug>-2`, then `-3`. */
export function uniqueSlug(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

/** The engine names generated families `<name> — <direction>`; the direction belongs to the collection. */
function stripDirectionSuffix(family: ColorSystemSecondaryFamilyV2): string {
  for (const member of family.members) {
    if (member.provenance.kind !== 'teul-generated') continue;
    const suffix = ` — ${member.provenance.directionId}`;
    if (family.displayName.endsWith(suffix)) {
      return family.displayName.slice(0, -suffix.length).trim() || family.displayName;
    }
  }
  return family.displayName;
}

function memberStep(member: ColorSystemFamilyMemberV2): number | null {
  const match = MEMBER_STEP_PATTERN.exec(member.role);
  return match ? Number(match[1]) : null;
}

/** Step 9 anchors a 12-step scale; a named pair is anchored by its base member. */
function familyAnchorMember(
  family: ColorSystemSecondaryFamilyV2
): ColorSystemFamilyMemberV2 | null {
  if (family.shape.kind === 'named-base-light-pair') {
    const baseMemberId = family.shape.baseMemberId;
    return family.members.find(member => member.stableMemberId === baseMemberId) ?? null;
  }
  return family.members.find(member => memberStep(member) === 9) ?? null;
}

/** Light is the reading mode for hue words; otherwise the first mode by name. */
function representativeValue(member: ColorSystemFamilyMemberV2): ColorSystemColorValueV2 {
  if (member.valuesByMode.Light) return member.valuesByMode.Light;
  const [first] = Object.keys(member.valuesByMode).sort(compareText);
  return member.valuesByMode[first];
}

interface FamilyNamingPlan {
  slug: string;
  basis: ColorSystemFamilySlugBasisV2;
  sourceName: string;
  hueFamily: string | null;
  anchorMemberId: string | null;
  /** memberId → final path segment (`9`, `base`, `light`). */
  memberSegments: ReadonlyMap<string, string>;
}

function planFamilyNaming(
  candidate: ColorSystemStrategyCandidateV2
): Map<string, FamilyNamingPlan> {
  const ordered = [...candidate.families].sort(
    (left, right) =>
      left.order - right.order || compareText(left.stableFamilyId, right.stableFamilyId)
  );
  const usedSlugs = new Set<string>();
  const plans = new Map<string, FamilyNamingPlan>();
  for (const family of ordered) {
    const sourceName = stripDirectionSuffix(family);
    const anchor = familyAnchorMember(family);
    let basis: ColorSystemFamilySlugBasisV2 = 'brand-name';
    let base = nameSlug(sourceName, 'family');
    let hueFamily: string | null = null;
    if (family.contributionId.startsWith(COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2)) {
      // P3-A status reserves are named by the role they stand in for, not by hue word,
      // so a product team reads `color/status-success/9` and knows why it exists.
      basis = 'status-reserve';
      base = `status-${
        slugify(
          family.contributionId.slice(COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2.length)
        ) || 'reserve'
      }`;
    } else if (
      colorSystemBrandTerritoryMatchesSourceV1(
        family.brandFit.territoryId,
        COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.neutral,
        family.brandFit.prominence
      )
    ) {
      basis = 'neutral';
      base = 'neutral';
    } else if (
      colorSystemBrandTerritoryMatchesSourceV1(
        family.brandFit.territoryId,
        COLOR_SYSTEM_SECONDARY_TERRITORY_IDS_V3.accent,
        family.brandFit.prominence
      )
    ) {
      basis = 'hue-family';
      const reading = anchor ?? family.members[0];
      const oklch = hexToOklch(representativeValue(reading).hex);
      hueFamily = paletteHueFamilyV3(oklch.h, oklch.c);
      base = hueFamily ?? 'accent';
    }
    const memberSegments = new Map<string, string>();
    const usedSegments = new Set<string>();
    for (const member of [...family.members].sort((left, right) => left.order - right.order)) {
      const step = memberStep(member);
      const segment =
        step === null ? slugify(member.role) || `member-${member.order}` : String(step);
      memberSegments.set(member.stableMemberId, uniqueSlug(segment, usedSegments));
    }
    plans.set(family.stableFamilyId, {
      slug: uniqueSlug(base, usedSlugs),
      basis,
      sourceName,
      hueFamily,
      anchorMemberId: anchor?.stableMemberId ?? null,
      memberSegments,
    });
  }
  return plans;
}

/** P4-C: the group segment of a preserved source whose recorded name carries no heading. */
const SOURCE_SECTION_GROUP_SLUGS: Readonly<Record<ColorSystemSectionRoleV2, string>> = {
  primary: 'primary',
  secondary: 'secondary',
  'product-graphics': 'product-graphics',
  'data-visualization': 'data-viz',
  typography: 'typography',
};

function pathSegments(value: string): string[] {
  return value
    .split('/')
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
}

export interface ColorSystemSourceTokenPlanV2 {
  group: string;
  groupBasis: ColorSystemSourceGroupBasisV2;
  slug: string;
  /** `source/<group>/<slug>` */
  path: string;
}

/**
 * P4-C: `source/<group>/<name>`. The group is the recorded heading ("Data Viz /
 * 01 Sky" → `data-viz`; "Typography / Primary" → `typography`) or, when the
 * name carries none, the section (`data-visualization` → `data-viz`). The name
 * is the last segment of the recorded display name; a digit may lead it because
 * the group precedes it (`source/data-viz/01-sky`, never `source-01-sky`).
 * Collisions resolve within a group in recorded order (section, then `order`),
 * so a second "Gray" under Typography becomes `gray-2`. The real-brand defect
 * this closes: a text color recorded as "Typography / Primary" used to take
 * `source/primary` while the brand primary sat at `source/solar`.
 */
export function planColorSystemSourceTokenNamesV2(
  preservedColors: readonly ColorSystemPreservedColorV2[]
): Map<string, ColorSystemSourceTokenPlanV2> {
  const ordered = [...preservedColors].sort(
    (left, right) =>
      compareText(left.section, right.section) ||
      left.order - right.order ||
      compareText(left.stableColorId, right.stableColorId)
  );
  const usedByGroup = new Map<string, Set<string>>();
  const plans = new Map<string, ColorSystemSourceTokenPlanV2>();
  for (const color of ordered) {
    const segments = pathSegments(color.displayName);
    const heading = slugify(segments.slice(0, -1).join(' '));
    const group = heading.length > 0 ? heading : SOURCE_SECTION_GROUP_SLUGS[color.section];
    const groupBasis: ColorSystemSourceGroupBasisV2 =
      heading.length > 0 ? 'recorded-heading' : 'section';
    const used = usedByGroup.get(group) ?? new Set<string>();
    usedByGroup.set(group, used);
    const slug = uniqueSlug(slugify(segments[segments.length - 1] ?? '') || 'source', used);
    plans.set(color.stableColorId, { group, groupBasis, slug, path: `source/${group}/${slug}` });
  }
  return plans;
}

function planSourceNaming(
  brief: ColorSystemBuilderBriefV2
): Map<string, ColorSystemSourceTokenPlanV2> {
  return planColorSystemSourceTokenNamesV2(brief.preservedColors);
}

function assertTokenPath(name: string, recipeIdentifier: string): void {
  const segments = name.split('/');
  if (segments.length < 2 || segments.some(segment => !TOKEN_SEGMENT_PATTERN.test(segment))) {
    fail(
      'RESOURCE_CLASSIFICATION_MISMATCH',
      `${recipeIdentifier} has a token path "${name}" that is not Figma- and DTCG-legal.`
    );
  }
}

interface NamingPlan {
  families: ReadonlyMap<string, FamilyNamingPlan>;
  sources: ReadonlyMap<string, ColorSystemSourceTokenPlanV2>;
}

function valuesForModes(
  values: Readonly<Record<string, ColorSystemColorValueV2>>,
  modes: ReadonlySet<string>
): Record<string, ColorSystemColorValueV2> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([mode]) => modes.has(mode))
      .map(([mode, value]) => [mode, cloneValue(value)])
  );
}

function buildPrimitiveGraph(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  modes: ReadonlySet<string>,
  naming: NamingPlan
): {
  variables: Map<string, ColorSystemPrimitiveVariableRecipeV2>;
  refs: Map<string, ResolvedColorRecipe>;
  names: Set<string>;
} {
  const variables = new Map<string, ColorSystemPrimitiveVariableRecipeV2>();
  const refs = new Map<string, ResolvedColorRecipe>();
  const names = new Set<string>();
  const addValues = (
    stableId: string,
    valuesByMode: Readonly<Record<string, ColorSystemColorValueV2>>,
    variableRecipeId: string
  ) => {
    for (const [mode, value] of Object.entries(valuesByMode)) {
      if (!modes.has(mode)) continue;
      const key = stableId.startsWith('family\u0000')
        ? `${stableId}\u0000${mode}`
        : `source\u0000${stableId}\u0000${mode}`;
      if (refs.has(key)) {
        fail('RESOURCE_CLASSIFICATION_MISMATCH', `${stableId}/${mode} is duplicated.`);
      }
      refs.set(key, { variableRecipeId, mode, value: cloneValue(value) });
    }
  };

  for (const color of brief.preservedColors) {
    const id = recipeId('variable', 'primitive', 'preserved', color.stableColorId);
    const plan = naming.sources.get(color.stableColorId);
    if (!plan) fail('RESOURCE_CLASSIFICATION_MISMATCH', `${id} has no planned token name.`);
    const name = plan.path;
    assertTokenPath(name, id);
    names.add(name);
    addUnique(
      variables,
      {
        recipeId: id,
        kind: 'primitive',
        name,
        description: `Exact preserved ${color.section} source color "${color.displayName}".`,
        valuesByMode: valuesForModes(color.valuesByMode, modes),
        scopes: ['ALL_SCOPES'],
        origin: {
          kind: 'preserved-source',
          stableColorId: color.stableColorId,
          section: color.section,
          evidenceIds: color.evidenceIds,
        },
      },
      'primitive'
    );
    addValues(color.stableColorId, color.valuesByMode, id);
  }

  for (const family of candidate.families) {
    const plan = naming.families.get(family.stableFamilyId);
    if (!plan) {
      fail('RESOURCE_CLASSIFICATION_MISMATCH', `${family.stableFamilyId} has no planned name.`);
    }
    for (const member of family.members) {
      const id = recipeId(
        'variable',
        'primitive',
        'secondary',
        family.stableFamilyId,
        member.stableMemberId
      );
      const segment = plan.memberSegments.get(member.stableMemberId);
      if (!segment) fail('RESOURCE_CLASSIFICATION_MISMATCH', `${id} has no planned step.`);
      const name = `color/${plan.slug}/${segment}`;
      assertTokenPath(name, id);
      names.add(name);
      addUnique(
        variables,
        {
          recipeId: id,
          kind: 'primitive',
          name,
          description: `${plan.sourceName} step ${segment}; ${member.provenance.kind} provenance.`,
          valuesByMode: valuesForModes(member.valuesByMode, modes),
          scopes: ['ALL_SCOPES'],
          origin: {
            kind: 'approved-secondary',
            familyId: family.stableFamilyId,
            memberId: member.stableMemberId,
            provenance: member.provenance,
          },
        },
        'primitive'
      );
      addValues(
        `family\u0000${family.stableFamilyId}\u0000${member.stableMemberId}`,
        member.valuesByMode,
        id
      );
    }
  }

  for (const lock of brief.primaryLocks) {
    if (!modes.has(lock.mode)) continue;
    const resolved = refs.get(`source\u0000${lock.stableColorId}\u0000${lock.mode}`);
    if (!resolved || canonicalJson(resolved.value) !== canonicalJson(lock.expectedValue)) {
      fail(
        'RESOURCE_CLASSIFICATION_MISMATCH',
        `Exact Primary lock ${lock.lockId} is missing or changed in the primitive graph.`
      );
    }
  }

  return { variables, refs, names };
}

function resolveRef(
  refs: ReadonlyMap<string, ResolvedColorRecipe>,
  ref: ColorSystemApplicationColorRefV2,
  label: string
): ResolvedColorRecipe {
  const resolved = refs.get(refKey(ref));
  if (!resolved) {
    fail('ORPHAN_RESOURCE_REFERENCE', `${label} does not resolve to an output primitive.`);
  }
  return resolved;
}

function semanticScopes(kind: ColorSystemSemanticVariableRecipeV2['applicationKind']): string[] {
  switch (kind) {
    case 'typography':
      return ['TEXT_FILL', 'FRAME_FILL'];
    case 'data-visualization':
      return ['SHAPE_FILL', 'STROKE_COLOR'];
    case 'product-semantic':
      return ['ALL_SCOPES'];
    case 'product-graphics':
      return ['FRAME_FILL', 'SHAPE_FILL', 'STROKE_COLOR'];
  }
}

function addAlias(
  aliases: Map<string, ColorSystemSemanticVariableRecipeV2>,
  input: Omit<ColorSystemSemanticVariableRecipeV2, 'kind' | 'scopes'>
): void {
  if (Object.keys(input.aliasesByMode).length === 0) {
    fail('ORPHAN_RESOURCE_REFERENCE', `${input.applicationId} has no alias target.`);
  }
  addUnique(
    aliases,
    {
      ...input,
      kind: 'alias',
      scopes: semanticScopes(input.applicationKind),
    },
    'semantic alias'
  );
}

function aliasesForEveryMode(
  modes: readonly string[],
  targetVariableRecipeId: string
): Record<string, ColorSystemAliasTargetV2> {
  return Object.fromEntries(
    modes.map(mode => [mode, { kind: 'variable-alias' as const, targetVariableRecipeId }])
  );
}

interface StateTokenPlan {
  records: ColorSystemStateTokenRecordV2[];
  skips: ColorSystemStateTokenSkipV2[];
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * p3-C: hover and pressed aliases for every interactive fill role, per mode.
 * Aliases only: each state points at an existing step of the role's own family.
 * The Dark alias uses the same step numbers of the Dark scale, whose steps carry
 * the same usage meaning as Light.
 */
function buildStateTokenAliases(
  application: ColorSystemApplicationSystemBlueprintV2,
  candidate: ColorSystemStrategyCandidateV2,
  naming: NamingPlan,
  refs: ReadonlyMap<string, ResolvedColorRecipe>,
  roles: ReadonlyMap<string, readonly ColorSystemProductSemanticRoleV2[]>,
  aliases: Map<string, ColorSystemSemanticVariableRecipeV2>
): StateTokenPlan {
  const records: ColorSystemStateTokenRecordV2[] = [];
  const skips: ColorSystemStateTokenSkipV2[] = [];
  const families = new Map(candidate.families.map(family => [family.stableFamilyId, family]));
  const surfaceHex = (mode: string): { role: string; hex: string }[] =>
    STATE_SURFACE_ROLES.flatMap(surfaceRole => {
      const entry = roles.get(surfaceRole)?.find(item => item.mode === mode);
      return entry
        ? [
            {
              role: surfaceRole,
              hex: resolveRef(refs, entry.ref, `${mode}/${surfaceRole}`).value.hex,
            },
          ]
        : [];
    });

  for (const role of COLOR_SYSTEM_INTERACTIVE_FILL_ROLES_V2) {
    const entries = roles.get(role);
    if (!entries || entries.length === 0) continue;
    const perMode: {
      mode: string;
      hover: ColorSystemAliasTargetV2;
      pressed: ColorSystemAliasTargetV2;
      record: ColorSystemStateTokenRecordV2;
    }[] = [];
    let skip: string | null = null;
    for (const entry of [...entries].sort((left, right) => compareText(left.mode, right.mode))) {
      if (entry.ref.kind !== 'approved-family-member') {
        skip = `${role} in ${entry.mode} is a preserved source color without a scale.`;
        break;
      }
      const family = families.get(entry.ref.ref.familyId);
      const plan = naming.families.get(entry.ref.ref.familyId);
      const memberId = entry.ref.ref.memberId;
      const base = family?.members.find(member => member.stableMemberId === memberId);
      const baseStep = base ? memberStep(base) : null;
      if (!family || !plan || !base || baseStep === null) {
        skip = `${role} in ${entry.mode} does not sit on a 12-step scale.`;
        break;
      }
      const declared = application.interaction?.statePlans.find(
        item => item.role === role && item.mode === entry.mode
      );
      if (declared) {
        const stateTarget = (state: 'hover' | 'pressed') => ({
          kind: 'variable-alias' as const,
          targetVariableRecipeId: resolveRef(
            refs,
            {
              kind: 'approved-family-member',
              ref: declared.states[state],
            },
            `${role}/${entry.mode}/${state}`
          ).variableRecipeId,
        });
        const step = (state: 'hover' | 'pressed') => {
          const member = family.members.find(
            item => item.stableMemberId === declared.states[state].memberId
          );
          if (!member) fail('ORPHAN_RESOURCE_REFERENCE', 'Declared interaction member is missing.');
          return memberStep(member)!;
        };
        const minimum = (state: 'hover' | 'pressed') =>
          Math.min(
            ...declared.measurements
              .filter(pair => pair.state === state && pair.kind !== 'label')
              .map(pair => pair.ratio)
          );
        const labels = declared.measurements.filter(pair => pair.kind === 'label');
        perMode.push({
          mode: entry.mode,
          hover: stateTarget('hover'),
          pressed: stateTarget('pressed'),
          record: {
            role,
            mode: entry.mode,
            familySlug: plan.slug,
            baseStep,
            hoverStep: step('hover'),
            pressedStep: step('pressed'),
            hoverContrast: minimum('hover'),
            pressedContrast: minimum('pressed'),
            checkedAgainst: [...new Set(declared.pairs.map(pair => pair.surface.stableColorId))],
            notes: [
              role === 'selected'
                ? 'Complete interaction states measured on every declared surface with one common label.'
                : 'Complete link states measured on every declared surface.',
            ],
            interaction: {
              requirementsHash: application.interaction!.requirementsHash,
              pairEvidenceIds: declared.pairs.flatMap(pair => [
                pair.surfacePairEvidenceId,
                ...(pair.onForegroundPairEvidenceId ? [pair.onForegroundPairEvidenceId] : []),
              ]),
              minimumLabelContrast: labels.length
                ? Math.min(...labels.map(pair => pair.ratio))
                : null,
            },
          },
        });
        continue;
      }
      const byStep = new Map(
        family.members.flatMap(member => {
          const step = memberStep(member);
          return step === null ? [] : [[step, member] as const];
        })
      );
      const surfaces = surfaceHex(entry.mode);
      const notes: string[] = [];
      const stepped = baseStep >= STATE_HOVER_STEP;
      if (stepped) {
        notes.push(
          `Rest fill already sits at step ${baseStep}; states step up from it instead of 10/11.`
        );
      }
      const preferredHover = stepped ? Math.min(baseStep + 1, SCALE_LAST_STEP) : STATE_HOVER_STEP;
      const preferredPressed = stepped
        ? Math.min(baseStep + 2, SCALE_LAST_STEP)
        : STATE_PRESSED_STEP;
      const choose = (
        state: 'hover' | 'pressed',
        preferred: number
      ): { step: number; contrast: number | null } => {
        let fallback: { step: number; contrast: number | null } | null = null;
        for (let step = preferred; step >= Math.max(baseStep, 9); step -= 1) {
          const member = byStep.get(step);
          if (!member) continue;
          const value = member.valuesByMode[entry.mode];
          if (!value) continue;
          const contrast =
            surfaces.length === 0
              ? null
              : roundRatio(
                  Math.min(...surfaces.map(surface => getWCAGContrastHex(value.hex, surface.hex)))
                );
          if (contrast === null || contrast >= STATE_MINIMUM_SURFACE_CONTRAST) {
            if (step !== preferred) {
              notes.push(
                `${state} fell back from step ${preferred} to step ${step} to keep ≥ ${STATE_MINIMUM_SURFACE_CONTRAST}:1 against ${surfaces.map(surface => surface.role).join(' and ')}.`
              );
            }
            return { step, contrast };
          }
          fallback ??= { step, contrast };
        }
        notes.push(
          `${state} keeps step ${preferred}; no step from ${preferred} down to ${baseStep} reaches ${STATE_MINIMUM_SURFACE_CONTRAST}:1 against the surface.`
        );
        return fallback ?? { step: preferred, contrast: null };
      };
      const hover = choose('hover', preferredHover);
      const pressed = choose('pressed', preferredPressed);
      if (hover.step === baseStep) notes.push('hover shares the rest step.');
      if (pressed.step === hover.step) notes.push('pressed shares the hover step.');
      const target = (step: number): ColorSystemAliasTargetV2 => {
        const member = byStep.get(step);
        if (!member) fail('ORPHAN_RESOURCE_REFERENCE', `${role} state step ${step} is missing.`);
        return {
          kind: 'variable-alias',
          targetVariableRecipeId: resolveRef(
            refs,
            {
              kind: 'approved-family-member',
              ref: {
                familyId: family.stableFamilyId,
                memberId: member.stableMemberId,
                mode: entry.mode,
              },
            },
            `${role}/${entry.mode}/step-${step}`
          ).variableRecipeId,
        };
      };
      perMode.push({
        mode: entry.mode,
        hover: target(hover.step),
        pressed: target(pressed.step),
        record: {
          role,
          mode: entry.mode,
          familySlug: plan.slug,
          baseStep,
          hoverStep: hover.step,
          pressedStep: pressed.step,
          hoverContrast: hover.contrast,
          pressedContrast: pressed.contrast,
          checkedAgainst: surfaces.map(surface => surface.role),
          notes,
        },
      });
    }
    if (skip !== null) {
      skips.push({ role, reason: skip });
      continue;
    }
    const evidenceIds = [...new Set(entries.flatMap(entry => entry.evidenceIds))].sort(compareText);
    for (const state of ['hover', 'pressed'] as const) {
      const aliasesByMode = Object.fromEntries(
        perMode.map(item => [item.mode, state === 'hover' ? item.hover : item.pressed])
      );
      const steps = perMode
        .map(
          item =>
            `${item.mode} step ${state === 'hover' ? item.record.hoverStep : item.record.pressedStep}`
        )
        .join(', ');
      const name = `semantic/${role}-${state}`;
      const id = recipeId('variable', 'semantic', 'product', `${role}-${state}`);
      assertTokenPath(name, id);
      addAlias(aliases, {
        recipeId: id,
        applicationKind: 'product-semantic',
        applicationId: `${role}-${state}`,
        name,
        description: `${state === 'hover' ? 'Hover' : 'Pressed'} state of ${role}: ${steps} of the ${perMode[0].record.familySlug} scale.`,
        aliasesByMode,
        evidenceIds,
      });
    }
    records.push(...perMode.map(item => item.record));
  }
  return { records, skips };
}

function buildApplicationResources(
  application: ColorSystemApplicationSystemBlueprintV2,
  candidate: ColorSystemStrategyCandidateV2,
  naming: NamingPlan,
  primitives: Map<string, ColorSystemPrimitiveVariableRecipeV2>,
  primitiveNames: Set<string>,
  refs: ReadonlyMap<string, ResolvedColorRecipe>
): {
  aliases: Map<string, ColorSystemSemanticVariableRecipeV2>;
  productGraphicsPlans: Map<
    string,
    {
      rendering: ColorSystemProductGraphicsRenderingV1 | null;
      limitation: string | null;
      bindings: ColorSystemComponentPaintBindingV2[];
    }
  >;
  dataAliases: Map<string, { marks: string[]; surface: string; boundary: string | null }>;
  typographyAliases: Map<string, string[]>;
  stateTokens: StateTokenPlan;
} {
  const aliases = new Map<string, ColorSystemSemanticVariableRecipeV2>();
  const productGraphicsPlans = new Map<
    string,
    {
      rendering: ColorSystemProductGraphicsRenderingV1 | null;
      limitation: string | null;
      bindings: ColorSystemComponentPaintBindingV2[];
    }
  >();
  const dataAliases = new Map<
    string,
    { marks: string[]; surface: string; boundary: string | null }
  >();
  const typographyAliases = new Map<string, string[]>();
  const aliasNames = new Set<string>();
  const named = (name: string, id: string): string => {
    assertTokenPath(name, id);
    if (aliasNames.has(name)) {
      fail('RESOURCE_CLASSIFICATION_MISMATCH', `Semantic token path ${name} is duplicated.`);
    }
    aliasNames.add(name);
    return name;
  };

  const roles = new Map<string, ColorSystemProductSemanticRoleV2[]>();
  for (const role of application.productSemantics) {
    const values = roles.get(role.role) ?? [];
    roles.set(role.role, [...values, role]);
  }
  for (const [roleName, entries] of [...roles.entries()].sort(([left], [right]) =>
    compareText(left, right)
  )) {
    const aliasesByMode: Record<string, ColorSystemAliasTargetV2> = {};
    for (const entry of entries) {
      aliasesByMode[entry.mode] = {
        kind: 'variable-alias',
        targetVariableRecipeId: resolveRef(refs, entry.ref, `${entry.mode}/${roleName}`)
          .variableRecipeId,
      };
    }
    const id = recipeId('variable', 'semantic', 'product', roleName);
    addAlias(aliases, {
      recipeId: id,
      applicationKind: 'product-semantic',
      applicationId: roleName,
      name: named(`semantic/${roleName}`, id),
      description: entries.map(entry => entry.intendedUse).join(' | '),
      aliasesByMode,
      evidenceIds: [...new Set(entries.flatMap(entry => entry.evidenceIds))].sort(compareText),
    });
  }
  const stateTokens = buildStateTokenAliases(application, candidate, naming, refs, roles, aliases);
  for (const alias of aliases.values()) aliasNames.add(alias.name);

  const graphicsJobSlugs = new Set<string>();
  for (const specimen of application.productGraphics) {
    const specimenAliases: string[] = [];
    const jobSlug = uniqueSlug(slugify(specimen.job) || 'graphic', graphicsJobSlugs);
    specimen.colors.forEach((color, index) => {
      const source = resolveRef(refs, color.ref, `${specimen.derivationId}.colors[${index}]`);
      if (canonicalJson(source.value) !== canonicalJson(color.value)) {
        fail(
          'RESOURCE_CLASSIFICATION_MISMATCH',
          `${specimen.derivationId} source value drifted before derivation.`
        );
      }
      let targetVariableRecipeId = source.variableRecipeId;
      if (specimen.transform.kind === 'alpha') {
        const transform = specimen.transform;
        const expectedAlpha = source.value.alpha * transform.alpha;
        if (
          color.appliedValue.alpha !== expectedAlpha ||
          canonicalJson(color.appliedValue.components) !== canonicalJson(source.value.components) ||
          color.appliedValue.hex !== source.value.hex
        ) {
          fail(
            'RESOURCE_CLASSIFICATION_MISMATCH',
            `${specimen.derivationId} flattened or changed its declared alpha transform.`
          );
        }
        targetVariableRecipeId = recipeId(
          'variable',
          'derivation',
          specimen.derivationId,
          String(index + 1)
        );
        const valuesByMode = Object.fromEntries(
          application.modes.map(mode => {
            const modeSource = resolveRef(
              refs,
              refForMode(color.ref, mode),
              `${specimen.derivationId}.colors[${index}].${mode}`
            );
            if (modeSource.variableRecipeId !== source.variableRecipeId) {
              fail(
                'RESOURCE_CLASSIFICATION_MISMATCH',
                `${specimen.derivationId} changes source variable identity across modes.`
              );
            }
            const value = buildColorSystemSrgbValueV1(
              modeSource.value.components,
              modeSource.value.alpha * transform.alpha
            );
            return [mode, value];
          })
        );
        const sourceName = primitives.get(source.variableRecipeId)?.name;
        if (!sourceName) {
          fail(
            'ORPHAN_RESOURCE_REFERENCE',
            `${specimen.derivationId} derives an unknown primitive.`
          );
        }
        const derivationName = uniqueSlug(
          `${sourceName}-a${Math.round(transform.alpha * 100)}`,
          primitiveNames
        );
        assertTokenPath(derivationName, targetVariableRecipeId);
        addUnique(
          primitives,
          {
            recipeId: targetVariableRecipeId,
            kind: 'derivation',
            name: derivationName,
            description: `Explicit alpha ${transform.alpha} derivation of ${sourceName} for ${specimen.job}.`,
            valuesByMode,
            scopes: ['ALL_SCOPES'],
            origin: {
              kind: 'application-derivation',
              derivationId: specimen.derivationId,
              sourceVariableRecipeId: source.variableRecipeId,
              transform: specimen.transform,
              evidenceIds: specimen.evidenceIds,
            },
          },
          'derivation'
        );
      } else if (canonicalJson(color.appliedValue) !== canonicalJson(source.value)) {
        fail(
          'RESOURCE_CLASSIFICATION_MISMATCH',
          `${specimen.derivationId} identity transform changed its source value.`
        );
      }
      const aliasId = recipeId(
        'variable',
        'semantic',
        'product-graphics',
        specimen.derivationId,
        String(index + 1)
      );
      addAlias(aliases, {
        recipeId: aliasId,
        applicationKind: 'product-graphics',
        applicationId: `${specimen.derivationId}/${index + 1}`,
        name: named(`semantic/graphics/${jobSlug}/${index + 1}`, aliasId),
        description: specimen.intendedUse,
        aliasesByMode: aliasesForEveryMode(application.modes, targetVariableRecipeId),
        evidenceIds: specimen.evidenceIds,
      });
      specimenAliases.push(aliasId);
    });
    let rendering: ColorSystemProductGraphicsRenderingV1;
    try {
      rendering = getColorSystemProductGraphicsRenderingV1(specimen, application.pairEvidence);
    } catch (error) {
      if (specimen.rendering) throw error;
      productGraphicsPlans.set(specimen.derivationId, {
        rendering: null,
        limitation:
          error instanceof Error
            ? error.message
            : 'Legacy graphic has no complete rendering context.',
        bindings: specimenAliases.map((id, index) =>
          paintBinding(`paint-${index + 1}`, specimen.mode, id)
        ),
      });
      continue;
    }
    const useSlugs = new Set<string>();
    const bindings = rendering.uses.map(use => {
      const selectedIndex = specimen.colors.findIndex(
        color => canonicalJson(color.ref) === canonicalJson(use.ref)
      );
      let aliasId = specimenAliases[selectedIndex];
      if (selectedIndex < 0) {
        const target = resolveRef(refs, use.ref, `${specimen.derivationId}/${use.id}`);
        aliasId = recipeId(
          'variable',
          'semantic',
          'product-graphics',
          specimen.derivationId,
          'use',
          use.id
        );
        addAlias(aliases, {
          recipeId: aliasId,
          applicationKind: 'product-graphics',
          applicationId: `${specimen.derivationId}/use/${use.id}`,
          name: named(
            `semantic/graphics/${jobSlug}/use-${uniqueSlug(slugify(use.id) || 'paint', useSlugs)}`,
            aliasId
          ),
          description: `${use.role}: ${specimen.intendedUse}`,
          aliasesByMode: aliasesForEveryMode(application.modes, target.variableRecipeId),
          evidenceIds: specimen.evidenceIds,
        });
      }
      return paintBinding(`use:${use.id}`, specimen.mode, aliasId);
    });
    productGraphicsPlans.set(specimen.derivationId, { rendering, limitation: null, bindings });
  }

  const visualizations = [
    application.visualization.categorical,
    application.visualization.sequential,
    application.visualization.diverging,
  ] as const;
  for (const visualization of visualizations) {
    if (visualization === null) continue;
    const ids = visualization.marks.map(mark => {
      const targetVariableRecipeId = resolveRef(
        refs,
        mark.ref,
        `${visualization.selectionId}.marks[${mark.order}]`
      ).variableRecipeId;
      const id = recipeId(
        'variable',
        'semantic',
        'data-visualization',
        visualization.kind,
        visualization.selectionId,
        String(mark.order)
      );
      addAlias(aliases, {
        recipeId: id,
        applicationKind: 'data-visualization',
        applicationId: `${visualization.selectionId}/${mark.order}`,
        name: named(`semantic/chart/${visualization.kind}/${mark.order}`, id),
        description: `${visualization.kind} mark ${mark.order}: ${mark.label}.`,
        aliasesByMode: aliasesForEveryMode(application.modes, targetVariableRecipeId),
        evidenceIds: visualization.evidenceIds,
      });
      return id;
    });
    const surfaceTargetVariableRecipeId = resolveRef(
      refs,
      visualization.surface,
      `${visualization.selectionId}.surface`
    ).variableRecipeId;
    const surfaceId = recipeId(
      'variable',
      'semantic',
      'data-visualization',
      visualization.kind,
      visualization.selectionId,
      'surface'
    );
    addAlias(aliases, {
      recipeId: surfaceId,
      applicationKind: 'data-visualization',
      applicationId: `${visualization.selectionId}/surface`,
      name: named(`semantic/chart/${visualization.kind}/surface`, surfaceId),
      description: `${visualization.kind} chart surface shared by review and created output.`,
      aliasesByMode: aliasesForEveryMode(application.modes, surfaceTargetVariableRecipeId),
      evidenceIds: visualization.evidenceIds,
    });
    let boundaryId: string | null = null;
    if (visualization.kind === 'categorical' && visualization.boundary !== null) {
      const boundaryTargetVariableRecipeId = resolveRef(
        refs,
        visualization.boundary,
        `${visualization.selectionId}.boundary`
      ).variableRecipeId;
      boundaryId = recipeId(
        'variable',
        'semantic',
        'data-visualization',
        visualization.kind,
        visualization.selectionId,
        'boundary'
      );
      addAlias(aliases, {
        recipeId: boundaryId,
        applicationKind: 'data-visualization',
        applicationId: `${visualization.selectionId}/boundary`,
        name: named(`semantic/chart/${visualization.kind}/boundary`, boundaryId),
        description: 'Exact black or white boundary for touching categorical regions.',
        aliasesByMode: aliasesForEveryMode(application.modes, boundaryTargetVariableRecipeId),
        evidenceIds: visualization.evidenceIds,
      });
    }
    dataAliases.set(visualization.selectionId, {
      marks: ids,
      surface: surfaceId,
      boundary: boundaryId,
    });
  }

  for (const specimen of application.typography) {
    const bindings: string[] = [];
    const refsForSpecimen: readonly [string, ColorSystemApplicationColorRefV2 | null][] = [
      ['foreground', specimen.foreground],
      ['background', specimen.background],
      ['underlay', specimen.underlay],
    ];
    for (const [purpose, ref] of refsForSpecimen) {
      if (ref === null) continue;
      const id = recipeId('variable', 'semantic', 'typography', specimen.specimenId, purpose);
      addAlias(aliases, {
        recipeId: id,
        applicationKind: 'typography',
        applicationId: `${specimen.specimenId}/${purpose}`,
        name: named(
          `semantic/typography/${slugify(specimen.useCategory) || 'text'}/${slugify(specimen.mode) || 'mode'}/${purpose}`,
          id
        ),
        description: specimen.intendedUse,
        aliasesByMode: aliasesForEveryMode(
          application.modes,
          resolveRef(refs, ref, `${specimen.specimenId}.${purpose}`).variableRecipeId
        ),
        evidenceIds: specimen.evidenceIds,
      });
      bindings.push(id);
    }
    typographyAliases.set(specimen.specimenId, bindings);
  }

  return { aliases, productGraphicsPlans, dataAliases, typographyAliases, stateTokens };
}

function paintBinding(
  purpose: string,
  mode: string,
  variableRecipeId: string
): ColorSystemComponentPaintBindingV2 {
  return { purpose, mode, variableRecipeId };
}

function familyBindings(
  family: ColorSystemSecondaryFamilyV2,
  refs: ReadonlyMap<string, ResolvedColorRecipe>
): ColorSystemComponentPaintBindingV2[] {
  return family.members.flatMap(member =>
    Object.keys(member.valuesByMode).map(mode =>
      paintBinding(
        `${member.stableMemberId}/${mode}`,
        mode,
        resolveRef(
          refs,
          {
            kind: 'approved-family-member',
            ref: { familyId: family.stableFamilyId, memberId: member.stableMemberId, mode },
          },
          `${family.stableFamilyId}/${member.stableMemberId}/${mode}`
        ).variableRecipeId
      )
    )
  );
}

function buildComponents(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2,
  refs: ReadonlyMap<string, ResolvedColorRecipe>,
  applicationAliases: ReturnType<typeof buildApplicationResources>
): ColorSystemComponentRecipeV2[] {
  const components: ColorSystemComponentRecipeV2[] = [];
  const modes = new Set(application.modes);
  const primary = brief.preservedColors
    .filter(color => color.section === 'primary')
    .map(color => ({ ...color, valuesByMode: valuesForModes(color.valuesByMode, modes) }));
  if (primary.length === 0) {
    fail('RESOURCE_CLASSIFICATION_MISMATCH', 'The resource graph requires preserved Primary.');
  }
  components.push({
    recipeId: 'component/family/primary',
    kind: 'primary-family',
    role: 'primary',
    name: 'Primary family',
    content: primary,
    paintBindings: primary.flatMap(color =>
      Object.keys(color.valuesByMode).map(mode =>
        paintBinding(
          `${color.stableColorId}/${mode}`,
          mode,
          resolveRef(
            refs,
            { kind: 'preserved-source-color', stableColorId: color.stableColorId, mode },
            `${color.stableColorId}/${mode}`
          ).variableRecipeId
        )
      )
    ),
  });
  candidate.families.forEach(sourceFamily => {
    const family = {
      ...sourceFamily,
      members: sourceFamily.members.map(member => ({
        ...member,
        valuesByMode: valuesForModes(member.valuesByMode, modes),
      })),
    };
    components.push({
      recipeId: recipeId('component', 'family', family.stableFamilyId),
      kind: 'secondary-family',
      role: 'secondary',
      name: family.displayName,
      content: family,
      paintBindings: familyBindings(family, refs),
    });
  });
  application.productGraphics.forEach(specimen => {
    const plan = applicationAliases.productGraphicsPlans.get(specimen.derivationId);
    if (!plan)
      fail(
        'RESOURCE_CLASSIFICATION_MISMATCH',
        `${specimen.derivationId} has no exact graphic rendering plan.`
      );
    components.push({
      recipeId: recipeId('component', 'product-graphics', specimen.derivationId),
      kind: 'product-graphics',
      role: 'product-graphics',
      name: specimen.intendedUse,
      content: { ...specimen, rendering: plan.rendering, renderingLimitation: plan.limitation },
      paintBindings: plan.bindings,
    });
  });
  const visualizations = [
    application.visualization.categorical,
    application.visualization.sequential,
    application.visualization.diverging,
  ] as const;
  visualizations.forEach(visualization => {
    if (visualization === null) return;
    const aliases = applicationAliases.dataAliases.get(visualization.selectionId);
    if (!aliases) {
      fail(
        'RESOURCE_CLASSIFICATION_MISMATCH',
        `${visualization.selectionId} has no compiled Data Visualization aliases.`
      );
    }
    const surfaceMode =
      visualization.surface.kind === 'preserved-source-color'
        ? visualization.surface.mode
        : visualization.surface.ref.mode;
    components.push({
      recipeId: recipeId('component', 'data-visualization', visualization.kind),
      kind: 'data-visualization',
      role: 'data-visualization',
      name: `${visualization.kind} specimen`,
      content: visualization,
      paintBindings: [
        paintBinding('surface', surfaceMode, aliases.surface),
        ...visualization.marks.map((mark, index) => {
          const mode =
            mark.ref.kind === 'preserved-source-color' ? mark.ref.mode : mark.ref.ref.mode;
          return paintBinding(`mark-${mark.order}`, mode, aliases.marks[index]);
        }),
        ...(visualization.kind === 'categorical' && aliases.boundary
          ? [paintBinding('boundary', surfaceMode, aliases.boundary)]
          : []),
      ],
    });
  });
  application.typography.forEach(specimen => {
    const ids = applicationAliases.typographyAliases.get(specimen.specimenId) ?? [];
    components.push({
      recipeId: recipeId('component', 'typography', specimen.specimenId),
      kind: 'typography',
      role: 'typography',
      name: `${specimen.useCategory} specimen`,
      content: {
        specimen,
        pairEvidence: application.pairEvidence.filter(
          evidence => evidence.context.id === specimen.pairEvidenceId
        ),
      },
      paintBindings: ids.map((id, index) =>
        paintBinding(['foreground', 'background', 'underlay'][index], specimen.mode, id)
      ),
    });
  });
  return components;
}

function presentationContent(
  profile: ColorSystemPresentationProfileV2,
  role: ColorSystemSectionRoleV2
): ColorSystemResourcePresentationRecipeV2 {
  const section = profile.sections.find(item => item.role === role);
  if (!section) {
    fail('RESOURCE_AUTHORITY_MISMATCH', `Presentation profile is missing ${role}.`);
  }
  const {
    sourceNodeId: _source,
    headerNodeId: _header,
    paletteNodeId: _palette,
    ...portable
  } = section;
  return {
    frame: profile.frame,
    typography: profile.typography.filter(textRole => textRole.sections.includes(role)),
    section: portable,
    cardBoundaryPolicy: profile.cardBoundaryPolicy,
    rendererClaimBoundary: profile.rendererClaimBoundary,
  };
}

function assertNoOrphanRecipeRefs(content: ResourceBlueprintContent): void {
  const primitiveIds = new Set(content.collections[0].variables.map(variable => variable.recipeId));
  const aliasIds = new Set(content.collections[1].variables.map(variable => variable.recipeId));
  const variableIds = new Set([...primitiveIds, ...aliasIds]);
  const componentIds = new Set(content.components.map(component => component.recipeId));
  for (const alias of content.collections[1].variables) {
    for (const target of Object.values(alias.aliasesByMode)) {
      if (!primitiveIds.has(target.targetVariableRecipeId)) {
        fail('ORPHAN_RESOURCE_REFERENCE', `${alias.recipeId} aliases an unknown primitive.`);
      }
    }
  }
  for (const style of content.styles) {
    if (!variableIds.has(style.binding.variableRecipeId)) {
      fail('ORPHAN_RESOURCE_REFERENCE', `${style.recipeId} binds an unknown variable.`);
    }
  }
  for (const component of content.components) {
    for (const binding of component.paintBindings) {
      if (!variableIds.has(binding.variableRecipeId)) {
        fail('ORPHAN_RESOURCE_REFERENCE', `${component.recipeId} binds an unknown variable.`);
      }
    }
  }
  for (const frame of content.frames) {
    if (frame.componentRecipeIds.some(id => !componentIds.has(id))) {
      fail('ORPHAN_RESOURCE_REFERENCE', `${frame.recipeId} references an unknown component.`);
    }
    if (frame.systemVariableRecipeIds.some(id => !variableIds.has(id))) {
      fail('ORPHAN_RESOURCE_REFERENCE', `${frame.recipeId} references an unknown variable.`);
    }
  }
}

function assertUniqueVariableNames(content: ResourceBlueprintContent): void {
  for (const collection of content.collections) {
    const names = new Set<string>();
    for (const variable of collection.variables) {
      if (names.has(variable.name)) {
        fail(
          'RESOURCE_CLASSIFICATION_MISMATCH',
          `${collection.role} variable name ${variable.name} is duplicated.`
        );
      }
      names.add(variable.name);
    }
  }
}

/**
 * p3-C: the two collections share one token tree. A path may be a token or a
 * group, never both (`color/gold` and `color/gold/9` cannot coexist), because
 * DTCG addresses `{color.gold.9}` through the group `color.gold`.
 */
function assertTokenPathTree(content: ResourceBlueprintContent): void {
  const names = new Set<string>();
  for (const collection of content.collections) {
    for (const variable of collection.variables) {
      if (names.has(variable.name)) {
        fail(
          'RESOURCE_CLASSIFICATION_MISMATCH',
          `Token path ${variable.name} is used by both collections.`
        );
      }
      names.add(variable.name);
    }
  }
  for (const name of names) {
    const segments = name.split('/');
    for (let length = 1; length < segments.length; length += 1) {
      const prefix = segments.slice(0, length).join('/');
      if (names.has(prefix)) {
        fail(
          'RESOURCE_CLASSIFICATION_MISMATCH',
          `Token path ${name} nests under ${prefix}, which is itself a token.`
        );
      }
    }
  }
}

function assertCompleteVariableModes(content: ResourceBlueprintContent): void {
  const requiredModes = [...content.output.modes].sort(compareText);
  for (const collection of content.collections) {
    for (const variable of collection.variables) {
      const valuesByMode =
        variable.kind === 'alias' ? variable.aliasesByMode : variable.valuesByMode;
      const actualModes = Object.keys(valuesByMode).sort(compareText);
      if (canonicalJson(actualModes) !== canonicalJson(requiredModes)) {
        fail(
          'RESOURCE_CLASSIFICATION_MISMATCH',
          `${variable.recipeId} must define every output mode exactly once.`
        );
      }
    }
  }
}

function assertCaps(counts: ColorSystemResourceBlueprintCountsV2): void {
  const limits = COLOR_SYSTEM_BUILDER_V2_LIMITS;
  if (
    counts.variables > limits.maximumTokens ||
    counts.aliasVariables > limits.maximumAliases ||
    counts.styles > 1_024 ||
    counts.familyModeComponentVariants > limits.maximumFamilyModeComponentVariants ||
    counts.estimatedNodes > limits.maximumEstimatedRecipeNodes
  ) {
    fail('RESOURCE_CAP_EXCEEDED', 'Resource blueprint exceeds a deterministic v2 cap.');
  }
}

function forbiddenVolatileKey(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = forbiddenVolatileKey(item);
      if (nested) return nested;
    }
    return null;
  }
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (
      /^(figmaId|nodeId|sourceNodeId|headerNodeId|paletteNodeId|timestamp|createdAt|updatedAt|reviewHash|approvalHash)$/i.test(
        key
      )
    ) {
      return key;
    }
    const nested = forbiddenVolatileKey(nestedValue);
    if (nested) return nested;
  }
  return null;
}

export function buildColorSystemResourceBlueprintV2(
  brief: ColorSystemBuilderBriefV2,
  strategySet: ColorSystemStrategySetV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2,
  section: ColorSystemSectionBlueprintV2,
  presentationProfile: ColorSystemPresentationProfileV2,
  input: BuildColorSystemResourceBlueprintV2Input
): ColorSystemResourceBlueprintV2 {
  assertColorSystemBuilderBriefV2Integrity(brief);
  assertColorSystemStrategySetV2Integrity(brief, strategySet);
  assertColorSystemStrategyCandidateV2Integrity(brief, candidate);
  assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, application);
  assertColorSystemSectionBlueprintV2Integrity(brief, candidate, section);
  assertColorSystemPresentationProfileV2ContentIntegrity(presentationProfile);
  const selected = strategySet.candidates.find(item => item.id === candidate.id);
  if (
    strategySet.status !== 'ready' ||
    candidate.status !== 'complete' ||
    application.status !== 'ready' ||
    !selected ||
    canonicalJson(selected) !== canonicalJson(candidate) ||
    section.applicationBlueprintHash !== application.applicationBlueprintHash ||
    section.sectionBlueprintHash === application.applicationBlueprintHash ||
    brief.presentationProfileHash !== presentationProfile.profileHash ||
    section.presentationProfileHash !== presentationProfile.profileHash ||
    presentationProfile.sourceAuthorityHash !== brief.sourceHash ||
    presentationProfile.sourcePackageHash !== brief.sourcePackageHash
  ) {
    fail(
      'RESOURCE_AUTHORITY_MISMATCH',
      'Resource inputs do not form one complete acyclic v2 authority chain.'
    );
  }
  const compilerVersion = text(input.compilerVersion, 'compilerVersion', 100);
  const systemId = text(input.systemId, 'systemId', 80);
  if (!SYSTEM_ID_PATTERN.test(systemId)) {
    fail('INVALID_RESOURCE_INPUT', 'systemId must be a stable portable identifier.');
  }
  const outputName = text(input.outputName, 'outputName', 120);
  const modes = sortedModes(application.modes);
  const naming: NamingPlan = {
    families: planFamilyNaming(candidate),
    sources: planSourceNaming(brief),
  };
  const primitiveGraph = buildPrimitiveGraph(brief, candidate, new Set(modes), naming);
  const applicationResources = buildApplicationResources(
    application,
    candidate,
    naming,
    primitiveGraph.variables,
    primitiveGraph.names,
    primitiveGraph.refs
  );
  const primitiveVariables = [...primitiveGraph.variables.values()].sort((left, right) =>
    compareText(left.recipeId, right.recipeId)
  );
  const aliasVariables = [...applicationResources.aliases.values()].sort((left, right) =>
    compareText(left.recipeId, right.recipeId)
  );
  // p3-C style policy: one Paint Style per value a designer picks — the exact
  // preserved sources, each family anchor, and the semantic aliases that name a
  // job — never one per generated scale step.
  const anchorRecipeIds = new Set<string>(
    primitiveVariables
      .filter(variable => variable.origin.kind === 'preserved-source')
      .map(variable => variable.recipeId)
  );
  const familyNames: ColorSystemFamilyTokenNameV2[] = [];
  for (const family of candidate.families) {
    const plan = naming.families.get(family.stableFamilyId);
    if (!plan) fail('RESOURCE_CLASSIFICATION_MISMATCH', `${family.stableFamilyId} is unnamed.`);
    const anchorVariableRecipeId =
      plan.anchorMemberId === null
        ? null
        : recipeId(
            'variable',
            'primitive',
            'secondary',
            family.stableFamilyId,
            plan.anchorMemberId
          );
    if (anchorVariableRecipeId !== null) anchorRecipeIds.add(anchorVariableRecipeId);
    familyNames.push({
      familyId: family.stableFamilyId,
      slug: plan.slug,
      basis: plan.basis,
      sourceName: plan.sourceName,
      hueFamily: plan.hueFamily,
      anchorMemberId: plan.anchorMemberId,
      anchorVariableRecipeId,
    });
  }
  familyNames.sort((left, right) => compareText(left.familyId, right.familyId));
  const styledVariables = [
    ...primitiveVariables.filter(variable => anchorRecipeIds.has(variable.recipeId)),
    ...aliasVariables.filter(variable => STYLE_ALIAS_KINDS.has(variable.applicationKind)),
  ];
  const styles: ColorSystemPaintStyleRecipeV2[] = styledVariables.map(variable => ({
    recipeId: recipeId('style', variable.recipeId),
    name: variable.name,
    description: variable.description,
    binding: { kind: 'variable', variableRecipeId: variable.recipeId },
  }));
  const sortedAnchorIds = [...anchorRecipeIds].sort(compareText);
  const tokenNaming: ColorSystemTokenNamingV2 = {
    version: COLOR_SYSTEM_TOKEN_NAMING_V2_VERSION,
    scheme: {
      source: 'source/<group>/<name>',
      family: 'color/<family>/<step>',
      derivation: '<source path>-a<alpha percent>',
      semantic: 'semantic/<role>',
      state: 'semantic/<role>-hover | semantic/<role>-pressed',
      graphics: 'semantic/graphics/<job>/<n>',
      chart: 'semantic/chart/<kind>/<n | surface | boundary>',
      typography: 'semantic/typography/<use>/<mode>/<purpose>',
    },
    directionCarrier: 'collection-and-page-name',
    families: familyNames,
    sources: [...brief.preservedColors]
      .map((color): ColorSystemSourceTokenNameV2 => {
        const plan = naming.sources.get(color.stableColorId);
        if (!plan) {
          fail(
            'RESOURCE_CLASSIFICATION_MISMATCH',
            `${color.stableColorId} has no planned token name.`
          );
        }
        return {
          stableColorId: color.stableColorId,
          section: color.section,
          group: plan.group,
          groupBasis: plan.groupBasis,
          slug: plan.slug,
          path: plan.path,
          sourceName: color.displayName,
        };
      })
      .sort((left, right) => compareText(left.stableColorId, right.stableColorId)),
    stateTokens: [...applicationResources.stateTokens.records].sort(
      (left, right) => compareText(left.role, right.role) || compareText(left.mode, right.mode)
    ),
    stateTokenSkips: [...applicationResources.stateTokens.skips].sort((left, right) =>
      compareText(left.role, right.role)
    ),
    stylePolicy: {
      kind: 'semantic-aliases-and-anchors',
      statement:
        'Paint Styles are emitted for the exact preserved source colors, the anchor step of every family (step 9, or the named base), and the semantic aliases a designer picks for a job (product roles and states, chart marks, graphics). Generated scale steps and typography specimen bindings are Variables only.',
      emittedStyles: styles.length,
      suppressedPrimitiveStyles: primitiveVariables.length - sortedAnchorIds.length,
      suppressedAliasStyles: aliasVariables.filter(
        variable => !STYLE_ALIAS_KINDS.has(variable.applicationKind)
      ).length,
      anchorVariableRecipeIds: sortedAnchorIds,
      includedAliasKinds: [...STYLE_ALIAS_KINDS].sort(compareText),
      excludedAliasKinds: ['typography'],
    },
  };
  const components = buildComponents(
    brief,
    candidate,
    application,
    primitiveGraph.refs,
    applicationResources
  ).sort((left, right) => compareText(left.recipeId, right.recipeId));
  const componentsByRole = new Map<ColorSystemSectionRoleV2, string[]>();
  for (const role of COLOR_SYSTEM_SECTION_ROLES_V2) {
    componentsByRole.set(
      role,
      components.filter(component => component.role === role).map(component => component.recipeId)
    );
  }
  const frames = section.frames.map(frame => ({
    recipeId: recipeId('frame', frame.role),
    role: frame.role,
    order: frame.order,
    sectionContent: frame,
    presentationContent: presentationContent(presentationProfile, frame.role),
    componentRecipeIds: componentsByRole.get(frame.role) ?? [],
    systemVariableRecipeIds: [
      ...new Set(
        frame.colorRefs.map(
          ref => resolveRef(primitiveGraph.refs, ref, `${frame.role}.colorRefs`).variableRecipeId
        )
      ),
    ],
    documentationChrome: {
      classification: 'documentation-chrome-not-system-color' as const,
      backgroundHex: '#FFFFFF' as const,
      boundaryPolicy: 'none-or-monochrome-inside-1px' as const,
    },
  })) as unknown as ColorSystemResourceBlueprintV2['frames'];
  if (
    frames.some(
      (frame, index) =>
        frame.role !== COLOR_SYSTEM_SECTION_ROLES_V2[index] || frame.order !== index + 1
    )
  ) {
    fail('RESOURCE_AUTHORITY_MISMATCH', 'The five resource frames are out of order.');
  }
  const familyModeComponentVariants = candidate.families.length * modes.length;
  const estimatedNodes = estimateColorSystemResourceNodesV2(
    primitiveVariables.length + aliasVariables.length,
    styles,
    components,
    frames
  );
  const counts: ColorSystemResourceBlueprintCountsV2 = {
    primitiveVariables: primitiveVariables.length,
    aliasVariables: aliasVariables.length,
    variables: primitiveVariables.length + aliasVariables.length,
    styles: styles.length,
    components: components.length,
    frames: 5,
    familyModeComponentVariants,
    estimatedNodes,
  };
  assertCaps(counts);
  const limits: ColorSystemResourceBlueprintLimitsV2 = {
    maximumVariables: 512,
    maximumAliases: 128,
    maximumStyles: 1024,
    maximumFamilyModeComponentVariants: 48,
    maximumEstimatedNodes: 5000,
  };
  const content: ResourceBlueprintContent = {
    version: COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    resourcePolicyVersion: COLOR_SYSTEM_RESOURCE_COMPILER_V2_POLICY_VERSION,
    sourceAuthorityHash: presentationProfile.sourceAuthorityHash,
    sourceHash: brief.sourceHash,
    sourcePackageHash: brief.sourcePackageHash,
    briefHash: brief.briefHash,
    strategySetHash: strategySet.strategySetHash,
    candidateId: candidate.id,
    candidateHash: candidate.candidateHash,
    applicationBlueprintHash: application.applicationBlueprintHash,
    sectionBlueprintHash: section.sectionBlueprintHash,
    presentationProfileHash: presentationProfile.profileHash,
    compilerVersion,
    output: { systemId, name: outputName, modes },
    sectionBlueprint: section,
    collections: [
      {
        recipeId: 'collection/primitives',
        role: 'primitives',
        name: `${outputName} / Primitives and derivations`,
        modes,
        variables: primitiveVariables,
      },
      {
        recipeId: 'collection/semantics',
        role: 'semantics',
        name: `${outputName} / Semantic applications`,
        modes,
        variables: aliasVariables,
      },
    ],
    styles,
    components,
    frames,
    counts,
    limits,
    tokenNaming,
  };
  assertCompleteVariableModes(content);
  assertUniqueVariableNames(content);
  assertTokenPathTree(content);
  assertNoOrphanRecipeRefs(content);
  const forbidden = forbiddenVolatileKey(content);
  if (forbidden) {
    fail('RESOURCE_CLASSIFICATION_MISMATCH', `Resource content contains volatile ${forbidden}.`);
  }
  return { ...content, resourceBlueprintHash: deterministicContentHash(content) };
}

export function assertColorSystemResourceBlueprintV2Integrity(
  brief: ColorSystemBuilderBriefV2,
  strategySet: ColorSystemStrategySetV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2,
  section: ColorSystemSectionBlueprintV2,
  presentationProfile: ColorSystemPresentationProfileV2,
  blueprint: ColorSystemResourceBlueprintV2
): void {
  if (
    blueprint.version !== COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION ||
    blueprint.resourcePolicyVersion !== COLOR_SYSTEM_RESOURCE_COMPILER_V2_POLICY_VERSION ||
    !HASH_PATTERN.test(blueprint.resourceBlueprintHash)
  ) {
    fail('RESOURCE_BLUEPRINT_INTEGRITY', 'Resource blueprint identity is invalid.');
  }
  const rebuilt = buildColorSystemResourceBlueprintV2(
    brief,
    strategySet,
    candidate,
    application,
    section,
    presentationProfile,
    {
      compilerVersion: blueprint.compilerVersion,
      systemId: blueprint.output.systemId,
      outputName: blueprint.output.name,
    }
  );
  const supplied = canonicalJson(blueprint);
  if (canonicalJson(rebuilt) === supplied) return;

  // Retained V2 reviews bind the pre-legend estimate and its original hash. Only
  // that exact historical graph is compatible; the current build still enforces its cap.
  const { resourceBlueprintHash: _hash, ...content } = rebuilt;
  const historicalContent = {
    ...content,
    counts: {
      ...content.counts,
      estimatedNodes:
        content.counts.estimatedNodes - visualizationLegendNodeCount(content.components),
    },
  };
  const historical = {
    ...historicalContent,
    resourceBlueprintHash: deterministicContentHash(historicalContent),
  };
  if (canonicalJson(historical) === supplied) return;
  fail(
    'RESOURCE_BLUEPRINT_INTEGRITY',
    'Resource blueprint failed canonical order, closure, count, and hash validation.'
  );
}
