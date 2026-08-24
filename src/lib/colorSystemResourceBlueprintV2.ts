import { canonicalJson, deterministicContentHash } from './colorSystemAudit';
import {
  COLOR_SYSTEM_BUILDER_V2_LIMITS,
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_SECTION_ROLES_V2,
  type ColorSystemApplicationColorRefV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemFamilyMemberProvenanceV2,
  type ColorSystemRoleFrameRecipeV2,
  type ColorSystemSecondaryFamilyV2,
  type ColorSystemSectionRoleV2,
  type ColorSystemStrategyCandidateV2,
  type ColorSystemStrategySetV2,
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
  type ColorSystemSectionBlueprintV2,
} from './colorSystemApplicationBlueprintV2';
import {
  assertColorSystemPresentationProfileV2ContentIntegrity,
  type ColorSystemPresentationProfileV2,
  type ColorSystemPresentationSectionRecipeV2,
} from './colorSystemPresentationProfileV2';
import { compareText } from './utils';

export const COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION =
  'teul-color-resource-blueprint/v2' as const;
export const COLOR_SYSTEM_RESOURCE_COMPILER_V2_POLICY_VERSION =
  'teul-color-resource-compiler/v2' as const;

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SYSTEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

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
  | 'primary-family'
  | 'secondary-family'
  | 'product-graphics'
  | 'data-visualization'
  | 'typography';

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

export interface ColorSystemResourceBlueprintLimitsV2 {
  maximumVariables: 512;
  maximumAliases: 128;
  maximumStyles: 1024;
  maximumFamilyModeComponentVariants: 24;
  maximumEstimatedNodes: 5000;
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
  };
}

function sortedModes(modes: readonly string[]): string[] {
  const normalized = [...modes].map(mode => text(mode, 'mode', 80)).sort(compareText);
  if (normalized.length === 0 || new Set(normalized).size !== normalized.length) {
    fail('INVALID_RESOURCE_INPUT', 'Output modes must be a non-empty unique set.');
  }
  return normalized;
}

function buildPrimitiveGraph(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  modes: ReadonlySet<string>
): {
  variables: Map<string, ColorSystemPrimitiveVariableRecipeV2>;
  refs: Map<string, ResolvedColorRecipe>;
} {
  const variables = new Map<string, ColorSystemPrimitiveVariableRecipeV2>();
  const refs = new Map<string, ResolvedColorRecipe>();
  const addValues = (
    stableId: string,
    valuesByMode: Readonly<Record<string, ColorSystemColorValueV2>>,
    variableRecipeId: string
  ) => {
    for (const [mode, value] of Object.entries(valuesByMode)) {
      if (!modes.has(mode)) {
        fail(
          'RESOURCE_AUTHORITY_MISMATCH',
          `${stableId} uses mode ${mode} outside the application blueprint.`
        );
      }
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
    addUnique(
      variables,
      {
        recipeId: id,
        kind: 'primitive',
        name: `Primitive / ${color.displayName}`,
        description: `Exact preserved ${color.section} source color.`,
        valuesByMode: Object.fromEntries(
          Object.entries(color.valuesByMode).map(([mode, value]) => [mode, cloneValue(value)])
        ),
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
    for (const member of family.members) {
      const id = recipeId(
        'variable',
        'primitive',
        'secondary',
        family.stableFamilyId,
        member.stableMemberId
      );
      addUnique(
        variables,
        {
          recipeId: id,
          kind: 'primitive',
          name: `Secondary / ${family.displayName} / ${member.displayName}`,
          description: `Approved Secondary member with ${member.provenance.kind} provenance.`,
          valuesByMode: Object.fromEntries(
            Object.entries(member.valuesByMode).map(([mode, value]) => [mode, cloneValue(value)])
          ),
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
    const resolved = refs.get(`source\u0000${lock.stableColorId}\u0000${lock.mode}`);
    if (!resolved || canonicalJson(resolved.value) !== canonicalJson(lock.expectedValue)) {
      fail(
        'RESOURCE_CLASSIFICATION_MISMATCH',
        `Exact Primary lock ${lock.lockId} is missing or changed in the primitive graph.`
      );
    }
  }

  return { variables, refs };
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

function buildApplicationResources(
  application: ColorSystemApplicationSystemBlueprintV2,
  primitives: Map<string, ColorSystemPrimitiveVariableRecipeV2>,
  refs: ReadonlyMap<string, ResolvedColorRecipe>
): {
  aliases: Map<string, ColorSystemSemanticVariableRecipeV2>;
  productGraphicsAliases: Map<string, string[]>;
  dataAliases: Map<string, { marks: string[]; surface: string; boundary: string | null }>;
  typographyAliases: Map<string, string[]>;
} {
  const aliases = new Map<string, ColorSystemSemanticVariableRecipeV2>();
  const productGraphicsAliases = new Map<string, string[]>();
  const dataAliases = new Map<
    string,
    { marks: string[]; surface: string; boundary: string | null }
  >();
  const typographyAliases = new Map<string, string[]>();

  const roles = new Map<string, typeof application.productSemantics>();
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
    addAlias(aliases, {
      recipeId: recipeId('variable', 'semantic', 'product', roleName),
      applicationKind: 'product-semantic',
      applicationId: roleName,
      name: `Semantic / Product / ${roleName}`,
      description: entries.map(entry => entry.intendedUse).join(' | '),
      aliasesByMode,
      evidenceIds: [...new Set(entries.flatMap(entry => entry.evidenceIds))].sort(compareText),
    });
  }

  for (const specimen of application.productGraphics) {
    const specimenAliases: string[] = [];
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
            const value = cloneValue(modeSource.value);
            value.alpha *= transform.alpha;
            return [mode, value];
          })
        );
        addUnique(
          primitives,
          {
            recipeId: targetVariableRecipeId,
            kind: 'derivation',
            name: `Derivation / ${specimen.derivationId} / ${index + 1}`,
            description: `Explicit alpha derivation for ${specimen.job}.`,
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
        name: `Semantic / Product Graphics / ${specimen.job} / ${index + 1}`,
        description: specimen.intendedUse,
        aliasesByMode: aliasesForEveryMode(application.modes, targetVariableRecipeId),
        evidenceIds: specimen.evidenceIds,
      });
      specimenAliases.push(aliasId);
    });
    productGraphicsAliases.set(specimen.derivationId, specimenAliases);
  }

  const visualizations = [
    application.visualization.categorical,
    application.visualization.sequential,
    application.visualization.diverging,
  ] as const;
  for (const visualization of visualizations) {
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
        name: `Semantic / Data Visualization / ${visualization.kind} / ${mark.label}`,
        description: `${visualization.kind} mark ${mark.order}.`,
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
      name: `Semantic / Data Visualization / ${visualization.kind} / Surface`,
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
        name: 'Semantic / Data Visualization / categorical / Boundary',
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
        name: `Semantic / Typography / ${specimen.useCategory} / ${specimen.mode} / ${purpose}`,
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

  return { aliases, productGraphicsAliases, dataAliases, typographyAliases };
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
  const primary = brief.preservedColors.filter(color => color.section === 'primary');
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
  candidate.families.forEach(family => {
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
    components.push({
      recipeId: recipeId('component', 'product-graphics', specimen.derivationId),
      kind: 'product-graphics',
      role: 'product-graphics',
      name: specimen.intendedUse,
      content: specimen,
      paintBindings: (
        applicationAliases.productGraphicsAliases.get(specimen.derivationId) ?? []
      ).map((id, index) => paintBinding(`paint-${index + 1}`, specimen.mode, id)),
    });
  });
  const visualizations = [
    application.visualization.categorical,
    application.visualization.sequential,
    application.visualization.diverging,
  ] as const;
  visualizations.forEach(visualization => {
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
  const primitiveGraph = buildPrimitiveGraph(brief, candidate, new Set(modes));
  const applicationResources = buildApplicationResources(
    application,
    primitiveGraph.variables,
    primitiveGraph.refs
  );
  const primitiveVariables = [...primitiveGraph.variables.values()].sort((left, right) =>
    compareText(left.recipeId, right.recipeId)
  );
  const aliasVariables = [...applicationResources.aliases.values()].sort((left, right) =>
    compareText(left.recipeId, right.recipeId)
  );
  const styles: ColorSystemPaintStyleRecipeV2[] = [...primitiveVariables, ...aliasVariables].map(
    variable => ({
      recipeId: recipeId('style', variable.recipeId),
      name: `Paint / ${variable.name}`,
      description: variable.description,
      binding: { kind: 'variable', variableRecipeId: variable.recipeId },
    })
  );
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
  const familyModeComponentVariants = candidate.families.reduce(
    (count, family) =>
      count + new Set(family.members.flatMap(member => Object.keys(member.valuesByMode))).size,
    0
  );
  const estimatedNodes =
    primitiveVariables.length +
    aliasVariables.length +
    styles.length +
    components.reduce((count, component) => count + 4 + component.paintBindings.length * 2, 0) +
    frames.reduce(
      (count, frame) =>
        count + 8 + frame.componentRecipeIds.length * 2 + frame.systemVariableRecipeIds.length,
      0
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
    maximumFamilyModeComponentVariants: 24,
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
  };
  assertCompleteVariableModes(content);
  assertUniqueVariableNames(content);
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
  if (canonicalJson(rebuilt) !== canonicalJson(blueprint)) {
    fail(
      'RESOURCE_BLUEPRINT_INTEGRITY',
      'Resource blueprint failed canonical order, closure, count, and hash validation.'
    );
  }
}
