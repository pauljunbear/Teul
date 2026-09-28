/**
 * Renderable v2 resource blueprint fixture plus document seeding for host tests.
 *
 * The blueprint mirrors the renderer suite's fixture (two collections with Light
 * and Dark modes, four primitives, two aliases, one component per recipe kind,
 * five ordered role frames). Names follow the p3-C token scheme (P4-C: `source/<group>/<name>`,
 * `color/<family>/<step>`, `semantic/<role>`), and Paint Styles follow its policy:
 * one per exact source, family anchor, and semantic alias — none for the alpha
 * derivation. The seeded "source" collection comes from the repository corpus
 * fixture `fixtures/color-builder/generic-source-v2/variable-first.json`.
 */
import { deterministicContentHash } from '../../../lib/colorSystemHashing';
import { buildColorSystemProductGraphicsProjectionV1 } from '../../../lib/colorSystemProductGraphicsPlanV1';
import {
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_SECTION_ROLES_V2,
  type ColorSystemColorValueV2,
} from '../../../lib/colorSystemBuilderV2Contracts';
import {
  COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_RESOURCE_COMPILER_V2_POLICY_VERSION,
  COLOR_SYSTEM_TOKEN_NAMING_V2_VERSION,
  type ColorSystemComponentRecipeV2,
  type ColorSystemPrimitiveVariableRecipeV2,
  type ColorSystemResourceBlueprintV2,
  type ColorSystemRoleFrameResourceRecipeV2,
  type ColorSystemTokenNamingV2,
} from '../../../lib/colorSystemResourceBlueprintV2';
import {
  createColorSystemCreateJournalRuntimeV2,
  createFigmaColorSystemCreateJournalHostV2,
  type ColorSystemCreateJournalRuntimeV2,
} from '../../colorSystemCreateJournalV2';
import type { RenderColorSystemResourceBlueprintV2Options } from '../../colorSystemResourceRendererV2';
import variableFirstFixture from '../../../../fixtures/color-builder/generic-source-v2/variable-first.json';
import type { InMemoryFigmaDocument } from './inMemoryFigmaPluginApi';

export const HOST_FIXTURE_FILE_HASH = deterministicContentHash('figma-host-file');
const SOURCE_HASH = deterministicContentHash('figma-host-source');
const PACKAGE_HASH = deterministicContentHash('figma-host-package');
const BRIEF_HASH = deterministicContentHash('figma-host-brief');
const STRATEGY_HASH = deterministicContentHash('figma-host-strategy');
const CANDIDATE_HASH = deterministicContentHash('figma-host-candidate');
const APPLICATION_HASH = deterministicContentHash('figma-host-application');
const SECTION_HASH = deterministicContentHash('figma-host-section');
const PROFILE_HASH = deterministicContentHash('figma-host-presentation');

export const HOST_FIXTURE_RECIPE_IDS = {
  primary: 'variable/primitive/preserved/primary-solar',
  black: 'variable/primitive/preserved/source-black',
  secondary: 'variable/primitive/secondary/family-blue/family-blue-base',
  alpha: 'variable/derivation/product-surface/1',
  accent: 'variable/semantic/product/accent',
  text: 'variable/semantic/product/text',
} as const;

/** Token paths the fixture gives each Variable (p3-C naming scheme). */
export const HOST_FIXTURE_TOKEN_NAMES = {
  primary: 'source/primary/solar',
  black: 'source/typography/black',
  secondary: 'color/blue/base',
  alpha: 'color/blue/base-a40',
  accent: 'semantic/accent',
  text: 'semantic/text',
} as const;

/** Variables that earn a Paint Style: exact sources, the family anchor, semantic aliases. */
export const HOST_FIXTURE_STYLED_RECIPE_IDS = [
  HOST_FIXTURE_RECIPE_IDS.primary,
  HOST_FIXTURE_RECIPE_IDS.black,
  HOST_FIXTURE_RECIPE_IDS.secondary,
  HOST_FIXTURE_RECIPE_IDS.accent,
  HOST_FIXTURE_RECIPE_IDS.text,
] as const;

function value(hex: string, r: number, g: number, b: number, alpha = 1): ColorSystemColorValueV2 {
  return { colorSpace: 'srgb', hex, components: { r, g, b }, alpha };
}

export function hostComponentRecipeFixtureV2(
  recipeId: string,
  kind: ColorSystemComponentRecipeV2['kind'],
  role: ColorSystemComponentRecipeV2['role'],
  variableRecipeId: string
): ColorSystemComponentRecipeV2 {
  if (kind === 'product-graphics') {
    const rendering = buildColorSystemProductGraphicsProjectionV1(
      {
        applicationId: 'fixture-graphic',
        width: 240,
        height: 140,
        root: {
          id: 'background',
          useId: 'background',
          shape: { kind: 'rect', x: 0, y: 0, width: 240, height: 140 },
          children: [
            {
              id: 'foreground',
              useId: 'foreground',
              shape: { kind: 'rect', x: 40, y: 40, width: 100, height: 40 },
              children: [],
            },
          ],
        },
      },
      {
        provenance: 'legacy-pair-only',
        requirementsHash: null,
        contextId: 'fixture-graphic',
        uses: [
          {
            id: 'background',
            role: 'outer-backdrop',
            assessment: 'decorative',
            ref: {
              kind: 'preserved-source-color',
              stableColorId: 'primary-solar',
              mode: 'Light',
            },
          },
          {
            id: 'foreground',
            role: 'control-surface',
            assessment: 'informative',
            ref: {
              kind: 'approved-family-member',
              ref: { familyId: 'family-blue', memberId: 'family-blue-base', mode: 'Light' },
            },
          },
        ],
        pairs: [
          {
            pairEvidenceId: 'fixture-pair',
            foregroundUseId: 'foreground',
            backgroundUseId: 'background',
            underlayUseId: null,
          },
        ],
      }
    );
    return {
      recipeId,
      kind,
      role,
      name: `${role} specimen`,
      content: { job: 'product-ui-surface', mode: 'Light', rendering },
      paintBindings: [
        {
          purpose: 'use:background',
          mode: 'Light',
          variableRecipeId: HOST_FIXTURE_RECIPE_IDS.primary,
        },
        { purpose: 'use:foreground', mode: 'Light', variableRecipeId },
      ],
    };
  }
  return {
    recipeId,
    kind,
    role,
    name: `${role} specimen`,
    content:
      kind === 'data-visualization'
        ? {
            kind: 'categorical',
            marks: [{ order: 1, label: 'Fixture series' }],
            adjacency: 'separated',
            nonColorCue: 'shape',
          }
        : { specimen: role },
    paintBindings: [
      {
        purpose: kind === 'data-visualization' ? 'mark-1' : 'fill',
        mode: 'Light',
        variableRecipeId,
      },
    ],
  };
}

export function roleFrameRecipe(
  role: (typeof COLOR_SYSTEM_SECTION_ROLES_V2)[number],
  order: number,
  componentRecipeId: string,
  variableRecipeId: string,
  cardBoundary: ColorSystemRoleFrameResourceRecipeV2['sectionContent']['cardBoundary'] = {
    kind: 'none',
  }
): ColorSystemRoleFrameResourceRecipeV2 {
  return {
    recipeId: `frame/${role}`,
    role,
    order,
    sectionContent: {
      role,
      order,
      disposition: role === 'primary' || role === 'typography' ? 'preserve' : 'derive',
      title: role,
      guidance: `${role} guidance`,
      colorRefs:
        role === 'primary' || role === 'typography'
          ? [
              {
                kind: 'preserved-source-color',
                stableColorId: role === 'primary' ? 'primary-solar' : 'source-black',
                mode: 'Light',
              },
            ]
          : [
              {
                kind: 'approved-family-member',
                ref: { familyId: 'family-blue', memberId: 'family-blue-base', mode: 'Light' },
              },
            ],
      exampleIds: [`${role}-example`],
      ratingSection: role,
      cardBoundary,
    },
    presentationContent: {
      frame: {
        width: role === 'product-graphics' ? 9540 : 1600,
        height: role === 'product-graphics' ? 5391 : 900,
        backgroundHex: '#FFFFFF',
        siblingGap: 80,
        padding: 64,
        layoutAxis: 'vertical',
        horizontalAlignment: 'center',
        distribution: 'space-between',
        header: {
          x: 64,
          y: 64,
          width: 1472,
          defaultHeight: 120,
          titleGroupGap: 8,
          guidanceX: 900,
          guidanceWidth: 636,
        },
        palette: {
          x: 64,
          y: 240,
          width: 1472,
          height: 596,
          rowGap: 16,
          cardGap: 8,
          cardPadding: 16,
          cardContentGap: 8,
          cardCornerRadius: 0,
          cardContentAlignment: 'bottom-left',
          cardClipContent: true,
        },
        explicitLayoutGrid: 'none-governing',
      },
      typography: [
        {
          role: 'title',
          fontFamily: 'Inter',
          fontStyle: 'Bold',
          fontSize: 32,
          lineHeight: 40,
          lineHeightMultiplier: null,
          letterSpacing: 0,
          sections: [role],
        },
      ],
      section: {
        role,
        order,
        headerHeight: 120,
        guidance: `${role} guidance`,
        guidancePlacement: 'header-right',
        contentAuthorityRef: `authority:${role}`,
        rows: [{ count: 4, width: 1472, height: 280, cardWidth: 350 }],
        metadataOrder: ['name', 'hex', 'origin'],
      },
      cardBoundaryPolicy: {
        kind: 'none-or-monochrome-inside-1px',
        allowedColors: ['#000000', '#FFFFFF'],
        forbidden: ['nested-inside-outside-outline', 'double-outline', 'colored-outline'],
      },
      rendererClaimBoundary: {
        authoringProfile: 'srgb',
        claim: 'Structured sRGB recipe.',
        limitations: ['Displays vary.', 'Calibration varies.'],
        renderAuthority: 'comparison-only',
      },
    },
    componentRecipeIds: [componentRecipeId],
    systemVariableRecipeIds: [variableRecipeId],
    documentationChrome: {
      classification: 'documentation-chrome-not-system-color',
      backgroundHex: '#FFFFFF',
      boundaryPolicy: 'none-or-monochrome-inside-1px',
    },
  };
}

export function hostBlueprintFixture(
  overrides: { outputName?: string } = {}
): ColorSystemResourceBlueprintV2 {
  const outputName = overrides.outputName ?? 'Example Color System';
  const ids = HOST_FIXTURE_RECIPE_IDS;
  const names = HOST_FIXTURE_TOKEN_NAMES;
  const primitiveVariables: ColorSystemPrimitiveVariableRecipeV2[] = [
    {
      recipeId: ids.primary,
      kind: 'primitive',
      name: names.primary,
      description: 'Exact Primary.',
      valuesByMode: {
        Light: value('#E4F222', 228 / 255, 242 / 255, 34 / 255),
        Dark: value('#E4F222', 228 / 255, 242 / 255, 34 / 255),
      },
      scopes: ['ALL_SCOPES'],
      origin: {
        kind: 'preserved-source',
        stableColorId: 'primary-solar',
        section: 'primary',
        evidenceIds: ['primary-lock'],
      },
    },
    {
      recipeId: ids.black,
      kind: 'primitive',
      name: names.black,
      description: 'Exact source black.',
      valuesByMode: { Light: value('#000000', 0, 0, 0), Dark: value('#000000', 0, 0, 0) },
      scopes: ['ALL_SCOPES'],
      origin: {
        kind: 'preserved-source',
        stableColorId: 'source-black',
        section: 'typography',
        evidenceIds: ['black-source'],
      },
    },
    {
      recipeId: ids.secondary,
      kind: 'primitive',
      name: names.secondary,
      description: 'Approved Secondary.',
      valuesByMode: {
        Light: value('#0072B2', 0, 114 / 255, 178 / 255),
        Dark: value('#64B5E8', 100 / 255, 181 / 255, 232 / 255),
      },
      scopes: ['ALL_SCOPES'],
      origin: {
        kind: 'approved-secondary',
        familyId: 'family-blue',
        memberId: 'family-blue-base',
        provenance: {
          kind: 'source-preserved',
          sourceColorIds: ['source-blue'],
          evidenceIds: ['source-blue-evidence'],
        },
      },
    },
    {
      recipeId: ids.alpha,
      kind: 'derivation',
      name: names.alpha,
      description: 'Explicit alpha derivation.',
      valuesByMode: { Light: value('#0072B2', 0, 114 / 255, 178 / 255, 0.4) },
      scopes: ['ALL_SCOPES'],
      origin: {
        kind: 'application-derivation',
        derivationId: 'product-surface',
        sourceVariableRecipeId: ids.secondary,
        transform: { kind: 'alpha', alpha: 0.4 },
        evidenceIds: ['product-surface-evidence'],
      },
    },
  ];
  const aliases = [
    {
      recipeId: ids.accent,
      kind: 'alias' as const,
      applicationKind: 'product-semantic' as const,
      applicationId: 'accent',
      name: names.accent,
      description: 'Product accent.',
      aliasesByMode: {
        Light: { kind: 'variable-alias' as const, targetVariableRecipeId: ids.secondary },
        Dark: { kind: 'variable-alias' as const, targetVariableRecipeId: ids.secondary },
      },
      scopes: ['ALL_SCOPES'],
      evidenceIds: ['accent-evidence'],
    },
    {
      recipeId: ids.text,
      kind: 'alias' as const,
      applicationKind: 'typography' as const,
      applicationId: 'text',
      name: names.text,
      description: 'Text foreground.',
      aliasesByMode: {
        Light: { kind: 'variable-alias' as const, targetVariableRecipeId: ids.black },
        Dark: { kind: 'variable-alias' as const, targetVariableRecipeId: ids.primary },
      },
      scopes: ['TEXT_FILL'],
      evidenceIds: ['text-evidence'],
    },
  ];
  const components = [
    hostComponentRecipeFixtureV2(
      'component/family/primary',
      'primary-family',
      'primary',
      ids.primary
    ),
    hostComponentRecipeFixtureV2(
      'component/family/secondary',
      'secondary-family',
      'secondary',
      ids.accent
    ),
    hostComponentRecipeFixtureV2(
      'component/product-graphics/surface',
      'product-graphics',
      'product-graphics',
      ids.secondary
    ),
    hostComponentRecipeFixtureV2(
      'component/data-visualization/chart',
      'data-visualization',
      'data-visualization',
      ids.accent
    ),
    hostComponentRecipeFixtureV2('component/typography/body', 'typography', 'typography', ids.text),
  ];
  const frames = [
    roleFrameRecipe('primary', 1, components[0].recipeId, ids.primary),
    roleFrameRecipe('secondary', 2, components[1].recipeId, ids.accent),
    roleFrameRecipe('product-graphics', 3, components[2].recipeId, ids.alpha),
    roleFrameRecipe('data-visualization', 4, components[3].recipeId, ids.accent),
    roleFrameRecipe('typography', 5, components[4].recipeId, ids.text, {
      kind: 'monochrome-inside-1px',
      color: '#000000',
    }),
  ] as unknown as ColorSystemResourceBlueprintV2['frames'];
  const variableNames = new Map<string, string>(
    [...primitiveVariables, ...aliases].map(variable => [variable.recipeId, variable.name])
  );
  const styles = HOST_FIXTURE_STYLED_RECIPE_IDS.map(variableRecipeId => ({
    recipeId: `style/${variableRecipeId}`,
    name: variableNames.get(variableRecipeId) ?? variableRecipeId,
    description: 'Variable-bound Paint Style.',
    binding: { kind: 'variable' as const, variableRecipeId },
  }));
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
    families: [
      {
        familyId: 'family-blue',
        slug: 'blue',
        basis: 'brand-name',
        sourceName: 'Blue',
        hueFamily: null,
        anchorMemberId: 'family-blue-base',
        anchorVariableRecipeId: ids.secondary,
      },
    ],
    sources: [
      {
        stableColorId: 'primary-solar',
        section: 'primary',
        group: 'primary',
        groupBasis: 'section',
        slug: 'solar',
        path: names.primary,
        sourceName: 'Solar',
      },
      {
        stableColorId: 'source-black',
        section: 'typography',
        group: 'typography',
        groupBasis: 'section',
        slug: 'black',
        path: names.black,
        sourceName: 'Black',
      },
    ],
    stateTokens: [],
    stateTokenSkips: [],
    stylePolicy: {
      kind: 'semantic-aliases-and-anchors',
      statement: 'Fixture: styles for exact sources, the family anchor, and semantic aliases.',
      emittedStyles: styles.length,
      suppressedPrimitiveStyles: 1,
      suppressedAliasStyles: 0,
      anchorVariableRecipeIds: [ids.black, ids.primary, ids.secondary],
      includedAliasKinds: ['data-visualization', 'product-graphics', 'product-semantic'],
      excludedAliasKinds: ['typography'],
    },
  };
  const sectionBlueprint = {
    sectionBlueprintHash: SECTION_HASH,
    applicationBlueprintHash: APPLICATION_HASH,
    presentationProfileHash: PROFILE_HASH,
  } as unknown as ColorSystemResourceBlueprintV2['sectionBlueprint'];
  const content: Omit<ColorSystemResourceBlueprintV2, 'resourceBlueprintHash'> = {
    version: COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    resourcePolicyVersion: COLOR_SYSTEM_RESOURCE_COMPILER_V2_POLICY_VERSION,
    sourceAuthorityHash: SOURCE_HASH,
    sourceHash: SOURCE_HASH,
    sourcePackageHash: PACKAGE_HASH,
    briefHash: BRIEF_HASH,
    strategySetHash: STRATEGY_HASH,
    candidateId: 'candidate-1',
    candidateHash: CANDIDATE_HASH,
    applicationBlueprintHash: APPLICATION_HASH,
    sectionBlueprintHash: SECTION_HASH,
    presentationProfileHash: PROFILE_HASH,
    compilerVersion: 'figma-host-fixture-v2',
    output: { systemId: 'example-color-system', name: outputName, modes: ['Light', 'Dark'] },
    sectionBlueprint,
    collections: [
      {
        recipeId: 'collection/primitives',
        role: 'primitives',
        name: `${outputName} / Primitives and derivations`,
        modes: ['Light', 'Dark'],
        variables: primitiveVariables,
      },
      {
        recipeId: 'collection/semantics',
        role: 'semantics',
        name: `${outputName} / Semantic applications`,
        modes: ['Light', 'Dark'],
        variables: aliases,
      },
    ],
    styles,
    components,
    frames,
    counts: {
      primitiveVariables: primitiveVariables.length,
      aliasVariables: aliases.length,
      variables: primitiveVariables.length + aliases.length,
      styles: styles.length,
      components: components.length,
      frames: 5,
      familyModeComponentVariants: 2,
      estimatedNodes: 100,
    },
    limits: {
      maximumVariables: 512,
      maximumAliases: 128,
      maximumStyles: 1024,
      maximumFamilyModeComponentVariants: 48,
      maximumEstimatedNodes: 5000,
    },
    tokenNaming,
  };
  return { ...content, resourceBlueprintHash: deterministicContentHash(content) };
}

/** Total resources one successful create of `hostBlueprintFixture()` journals:
 * 2 collections + 6 variables + 5 styles + 5 components + 5 frames + 1 page. */
export const HOST_FIXTURE_RESOURCE_TOTAL = 24;

/**
 * p4-DE: re-seals a fixture blueprint after a test edits its content, so the
 * renderer's standalone integrity check (hash of everything but the hash) passes.
 */
export function rehashHostBlueprint(
  blueprint: ColorSystemResourceBlueprintV2
): ColorSystemResourceBlueprintV2 {
  const { resourceBlueprintHash: previous, ...content } = blueprint;
  void previous;
  return { ...content, resourceBlueprintHash: deterministicContentHash(content) };
}

export interface HostJournalHarness {
  runtime: ColorSystemCreateJournalRuntimeV2;
  transactionId: string;
  journal: NonNullable<RenderColorSystemResourceBlueprintV2Options['journal']>;
}

/** Builds renderer journal options backed by the real Figma journal host. */
export function hostJournalHarness(
  figma: PluginAPI,
  blueprint: ColorSystemResourceBlueprintV2,
  runtime = createColorSystemCreateJournalRuntimeV2(
    createFigmaColorSystemCreateJournalHostV2(figma)
  )
): HostJournalHarness {
  const authorizationHash = deterministicContentHash({
    label: 'figma-host-create-authorization',
    resourceBlueprintHash: blueprint.resourceBlueprintHash,
  });
  return {
    runtime,
    transactionId: `teul-create-v2:${authorizationHash.slice('sha256:'.length)}`,
    journal: {
      runtime,
      input: {
        requestId: 'figma-host-create-request',
        sessionId: 'teul-color-builder-v2:figma-host-session',
        currentFileIdentityHash: HOST_FIXTURE_FILE_HASH,
        sourceAuthorityHash: SOURCE_HASH,
        liveSourceHash: SOURCE_HASH,
        briefHash: BRIEF_HASH,
        strategySetHash: STRATEGY_HASH,
        candidateHash: CANDIDATE_HASH,
        applicationBlueprintHash: APPLICATION_HASH,
        sectionBlueprintHash: SECTION_HASH,
        resourceBlueprintHash: blueprint.resourceBlueprintHash,
        reviewHash: deterministicContentHash('figma-host-review'),
        approvalHash: deterministicContentHash('figma-host-approval'),
        createAuthorizationHash: authorizationHash,
        systemId: blueprint.output.systemId,
      },
    },
  };
}

export function renderOptions(
  overrides: Partial<RenderColorSystemResourceBlueprintV2Options> = {}
): RenderColorSystemResourceBlueprintV2Options {
  return {
    transactionId: 'figma-host-transaction-1',
    expectedCurrentFileIdentityHash: HOST_FIXTURE_FILE_HASH,
    currentFileAcknowledged: true,
    collisionPolicy: 'cancel',
    finalMutationFence: async () => undefined,
    ...overrides,
  };
}

interface GenericSourceFixtureV2 {
  collections: readonly {
    collectionId: string;
    name: string;
    defaultModeId: string;
    modes: readonly { modeId: string; name: string; order: number }[];
  }[];
  variables: readonly {
    variableId: string;
    name: string;
    description: string;
    collectionId: string;
    scopes: readonly string[];
    valuesByMode: readonly {
      modeId: string;
      modeName: string;
      rawValue:
        | { kind: 'color'; value: { components: readonly number[]; alpha: number } }
        | { kind: 'alias'; targetVariableId: string };
    }[];
  }[];
}

export interface SeededSource {
  collectionIds: string[];
  variableIds: Record<string, string>;
  pageId: string;
}

/** Seeds the corpus `variable-first` family (one collection, Light/Dark, one
 * literal and one alias Variable) plus a palette page as pre-existing content. */
export function seedVariableFirstSource(document: InMemoryFigmaDocument): SeededSource {
  const fixture = variableFirstFixture as unknown as GenericSourceFixtureV2;
  document.suppressCreateHooks = true;
  try {
    const collectionIds: string[] = [];
    const modeIds = new Map<string, string>();
    for (const source of fixture.collections) {
      const collection = document.createCollection(source.name);
      const ordered = [...source.modes].sort((left, right) => left.order - right.order);
      ordered.forEach((mode, index) => {
        if (index === 0) {
          collection.renameMode(collection.defaultModeId, mode.name);
          modeIds.set(mode.modeId, collection.defaultModeId);
        } else {
          modeIds.set(mode.modeId, collection.addMode(mode.name));
        }
      });
      collectionIds.push(collection.id);
    }
    const variableIds: Record<string, string> = {};
    const literals = fixture.variables.filter(variable =>
      variable.valuesByMode.every(entry => entry.rawValue.kind === 'color')
    );
    const aliases = fixture.variables.filter(variable => !literals.includes(variable));
    for (const source of [...literals, ...aliases]) {
      const collection = [...document.collections.values()].find(
        candidate =>
          candidate.name ===
          fixture.collections.find(entry => entry.collectionId === source.collectionId)?.name
      );
      if (!collection) throw new Error(`Fixture collection ${source.collectionId} missing.`);
      const variable = document.createVariable(source.name, collection, 'COLOR');
      variable.description = source.description;
      variable.scopes = [...source.scopes] as VariableScope[];
      for (const entry of source.valuesByMode) {
        const modeId = modeIds.get(entry.modeId);
        if (!modeId) throw new Error(`Fixture mode ${entry.modeId} missing.`);
        if (entry.rawValue.kind === 'color') {
          const [r, g, b] = entry.rawValue.value.components;
          variable.setValueForMode(modeId, { r, g, b, a: entry.rawValue.value.alpha });
        } else {
          const targetId = variableIds[entry.rawValue.targetVariableId];
          if (!targetId)
            throw new Error(`Fixture alias target ${entry.rawValue.targetVariableId}.`);
          variable.setValueForMode(modeId, { type: 'VARIABLE_ALIAS', id: targetId });
        }
      }
      variableIds[source.variableId] = variable.id;
    }
    const page = document.createPage('Brand palette');
    const frame = document.createNode('FRAME', 'frame');
    frame.name = 'Core colors board';
    page.appendChild(frame);
    const swatch = document.createNode('RECTANGLE', 'rectangle');
    swatch.name = 'Primary/Brand swatch';
    swatch.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3 } }];
    frame.appendChild(swatch);
    return { collectionIds, variableIds, pageId: page.id };
  } finally {
    document.suppressCreateHooks = false;
  }
}
