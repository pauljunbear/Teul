import { describe, expect, it, vi } from 'vitest';
import { hostComponentRecipeFixtureV2 } from './helpers/colorSystemResourceBlueprintFixtureV2';
import { deterministicContentHash } from '../../lib/colorSystemHashing';
import {
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_SECTION_ROLES_V2,
  type ColorSystemColorValueV2,
} from '../../lib/colorSystemBuilderV2Contracts';
import {
  COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_RESOURCE_COMPILER_V2_POLICY_VERSION,
  estimateColorSystemResourceNodesV2,
  type ColorSystemComponentRecipeV2,
  type ColorSystemPrimitiveVariableRecipeV2,
  type ColorSystemResourceBlueprintV2,
  type ColorSystemRoleFrameResourceRecipeV2,
} from '../../lib/colorSystemResourceBlueprintV2';
import {
  COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID,
  createColorSystemCreateJournalRuntimeV2,
  type ColorSystemCreateJournalHostV2,
} from '../colorSystemCreateJournalV2';
import {
  type ColorSystemHostResourceRefV2,
  type ColorSystemRendererAliasVariableRequestV2,
  type ColorSystemRendererCollectionResultV2,
  type ColorSystemRendererComponentRequestV2,
  type ColorSystemRendererFontV2,
  type ColorSystemRendererFrameRequestV2,
  type ColorSystemRendererHostContextV2,
  type ColorSystemRendererHostInventoryV2,
  type ColorSystemRendererHostV2,
  type ColorSystemRendererMutationPhaseV2,
  type ColorSystemRendererOwnershipMetadataV2,
  type ColorSystemRendererPrimitiveVariableRequestV2,
  type ColorSystemRendererStyleRequestV2,
  type RenderColorSystemResourceBlueprintV2Options,
  renderColorSystemResourceBlueprintV2,
} from '../colorSystemResourceRendererV2';

const FILE_HASH = deterministicContentHash('renderer-file');
const SOURCE_HASH = deterministicContentHash('renderer-source');
const PACKAGE_HASH = deterministicContentHash('renderer-package');
const BRIEF_HASH = deterministicContentHash('renderer-brief');
const STRATEGY_HASH = deterministicContentHash('renderer-strategy');
const CANDIDATE_HASH = deterministicContentHash('renderer-candidate');
const APPLICATION_HASH = deterministicContentHash('renderer-application');
const SECTION_HASH = deterministicContentHash('renderer-section');
const PROFILE_HASH = deterministicContentHash('renderer-presentation');

function value(hex: string, r: number, g: number, b: number, alpha = 1): ColorSystemColorValueV2 {
  return {
    colorSpace: 'srgb',
    hex,
    components: { r, g, b },
    alpha,
  };
}

function component(
  recipeId: string,
  kind: ColorSystemComponentRecipeV2['kind'],
  role: ColorSystemComponentRecipeV2['role'],
  variableRecipeId: string
): ColorSystemComponentRecipeV2 {
  if (kind === 'product-graphics') {
    return hostComponentRecipeFixtureV2(recipeId, kind, role, variableRecipeId);
  }
  return {
    recipeId,
    kind,
    role,
    name: `${role} specimen`,
    content: { specimen: role },
    paintBindings: [{ purpose: 'fill', mode: 'Light', variableRecipeId }],
  };
}

function frame(
  role: (typeof COLOR_SYSTEM_SECTION_ROLES_V2)[number],
  order: number,
  componentRecipeId: string,
  variableRecipeId: string
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
      cardBoundary: { kind: 'none' },
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

function blueprint(): ColorSystemResourceBlueprintV2 {
  const primaryId = 'variable/primitive/preserved/primary-solar';
  const blackId = 'variable/primitive/preserved/source-black';
  const secondaryId = 'variable/primitive/secondary/family-blue/family-blue-base';
  const alphaId = 'variable/derivation/product-surface/1';
  const accentId = 'variable/semantic/product/accent';
  const textId = 'variable/semantic/product/text';
  const primitiveVariables: ColorSystemPrimitiveVariableRecipeV2[] = [
    {
      recipeId: primaryId,
      kind: 'primitive' as const,
      name: 'Primitive / Solar',
      description: 'Exact Primary.',
      valuesByMode: {
        Light: value('#E4F222', 228 / 255, 242 / 255, 34 / 255),
        Dark: value('#E4F222', 228 / 255, 242 / 255, 34 / 255),
      },
      scopes: ['ALL_SCOPES'] as const,
      origin: {
        kind: 'preserved-source' as const,
        stableColorId: 'primary-solar',
        section: 'primary' as const,
        evidenceIds: ['primary-lock'],
      },
    },
    {
      recipeId: blackId,
      kind: 'primitive' as const,
      name: 'Primitive / Black',
      description: 'Exact source black.',
      valuesByMode: {
        Light: value('#000000', 0, 0, 0),
        Dark: value('#000000', 0, 0, 0),
      },
      scopes: ['ALL_SCOPES'] as const,
      origin: {
        kind: 'preserved-source' as const,
        stableColorId: 'source-black',
        section: 'typography' as const,
        evidenceIds: ['black-source'],
      },
    },
    {
      recipeId: secondaryId,
      kind: 'primitive' as const,
      name: 'Secondary / Blue / Base',
      description: 'Approved Secondary.',
      valuesByMode: {
        Light: value('#0072B2', 0, 114 / 255, 178 / 255),
        Dark: value('#64B5E8', 100 / 255, 181 / 255, 232 / 255),
      },
      scopes: ['ALL_SCOPES'] as const,
      origin: {
        kind: 'approved-secondary' as const,
        familyId: 'family-blue',
        memberId: 'family-blue-base',
        provenance: {
          kind: 'source-preserved' as const,
          sourceColorIds: ['source-blue'],
          evidenceIds: ['source-blue-evidence'],
        },
      },
    },
    {
      recipeId: alphaId,
      kind: 'derivation' as const,
      name: 'Derivation / Product surface',
      description: 'Explicit alpha derivation.',
      valuesByMode: {
        Light: value('#0072B2', 0, 114 / 255, 178 / 255, 0.4),
      },
      scopes: ['ALL_SCOPES'] as const,
      origin: {
        kind: 'application-derivation' as const,
        derivationId: 'product-surface',
        sourceVariableRecipeId: secondaryId,
        transform: { kind: 'alpha' as const, alpha: 0.4 },
        evidenceIds: ['product-surface-evidence'],
      },
    },
  ];
  const aliases = [
    {
      recipeId: accentId,
      kind: 'alias' as const,
      applicationKind: 'product-semantic' as const,
      applicationId: 'accent',
      name: 'Semantic / Product / Accent',
      description: 'Product accent.',
      aliasesByMode: {
        Light: { kind: 'variable-alias' as const, targetVariableRecipeId: secondaryId },
        Dark: { kind: 'variable-alias' as const, targetVariableRecipeId: secondaryId },
      },
      scopes: ['ALL_SCOPES'],
      evidenceIds: ['accent-evidence'],
    },
    {
      recipeId: textId,
      kind: 'alias' as const,
      applicationKind: 'typography' as const,
      applicationId: 'text',
      name: 'Semantic / Typography / Text',
      description: 'Text foreground.',
      aliasesByMode: {
        Light: { kind: 'variable-alias' as const, targetVariableRecipeId: blackId },
        Dark: { kind: 'variable-alias' as const, targetVariableRecipeId: primaryId },
      },
      scopes: ['TEXT_FILL'],
      evidenceIds: ['text-evidence'],
    },
  ];
  const components = [
    component('component/family/primary', 'primary-family', 'primary', primaryId),
    component('component/family/secondary', 'secondary-family', 'secondary', accentId),
    component(
      'component/product-graphics/surface',
      'product-graphics',
      'product-graphics',
      secondaryId
    ),
    component(
      'component/data-visualization/chart',
      'data-visualization',
      'data-visualization',
      accentId
    ),
    component('component/typography/body', 'typography', 'typography', textId),
  ];
  const frames = [
    frame('primary', 1, components[0].recipeId, primaryId),
    frame('secondary', 2, components[1].recipeId, accentId),
    frame('product-graphics', 3, components[2].recipeId, alphaId),
    frame('data-visualization', 4, components[3].recipeId, accentId),
    frame('typography', 5, components[4].recipeId, textId),
  ] as unknown as ColorSystemResourceBlueprintV2['frames'];
  const styles = [primaryId, secondaryId, alphaId, accentId, textId].map(variableRecipeId => ({
    recipeId: `style/${variableRecipeId}`,
    name: `Paint / ${variableRecipeId}`,
    description: 'Variable-bound Paint Style.',
    binding: { kind: 'variable' as const, variableRecipeId },
  }));
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
    compilerVersion: 'renderer-fixture-v2',
    output: { systemId: 'example-color-system', name: 'Example Color System', modes: ['Light', 'Dark'] },
    sectionBlueprint,
    collections: [
      {
        recipeId: 'collection/primitives',
        role: 'primitives',
        name: 'Example Color System / Primitives and derivations',
        modes: ['Light', 'Dark'],
        variables: primitiveVariables,
      },
      {
        recipeId: 'collection/semantics',
        role: 'semantics',
        name: 'Example Color System / Semantic applications',
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
    // The renderer treats naming evidence as opaque content; the fixture keeps it minimal.
    tokenNaming: {
      version: 'teul-token-naming/v2',
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
      families: [],
      sources: [],
      stateTokens: [],
      stateTokenSkips: [],
      stylePolicy: {
        kind: 'semantic-aliases-and-anchors',
        statement: 'Renderer fixture: one style per fixture variable.',
        emittedStyles: styles.length,
        suppressedPrimitiveStyles: 0,
        suppressedAliasStyles: 0,
        anchorVariableRecipeIds: [],
        includedAliasKinds: ['data-visualization', 'product-graphics', 'product-semantic'],
        excludedAliasKinds: ['typography'],
      },
    },
  };
  return { ...content, resourceBlueprintHash: deterministicContentHash(content) };
}

type FailurePhase = ColorSystemRendererMutationPhaseV2 | null;

interface StoredResource {
  ref: ColorSystemHostResourceRefV2;
  request: unknown;
  metadata: ColorSystemRendererOwnershipMetadataV2;
}

class FakeRendererHost implements ColorSystemRendererHostV2 {
  readonly resources = new Map<string, StoredResource>();
  readonly existingNames = new Set<string>();
  readonly events: string[] = [];
  readonly primitiveRequests: ColorSystemRendererPrimitiveVariableRequestV2[] = [];
  readonly aliasRequests: ColorSystemRendererAliasVariableRequestV2[] = [];
  readonly frameRequests: ColorSystemRendererFrameRequestV2[] = [];
  revealedFrameIds: string[] = [];
  mutationCount = 0;
  undoCount = 0;
  fontFailure = false;
  revealFailure = false;
  private createdResourceObserver: ((ref: ColorSystemHostResourceRefV2) => void) | null = null;
  private pageCreated = false;
  context: ColorSystemRendererHostContextV2 = {
    documentType: 'figma-design',
    editable: true,
    colorProfile: 'srgb',
    currentFileIdentityHash: FILE_HASH,
    capabilities: {
      colorVariables: true,
      variableAliases: true,
      variableBoundPaintStyles: true,
      components: true,
      frames: true,
    },
  };

  constructor(readonly failurePhase: FailurePhase = null) {}

  setCreatedResourceObserver(observer: ((ref: ColorSystemHostResourceRefV2) => void) | null): void {
    this.createdResourceObserver = observer;
  }

  private maybeFail(phase: ColorSystemRendererMutationPhaseV2): void {
    if (this.failurePhase === phase) throw new Error(`Injected ${phase} failure.`);
  }

  private store(
    kind: ColorSystemHostResourceRefV2['kind'],
    recipeId: string,
    request: { metadata: StoredResource['metadata'] }
  ): ColorSystemHostResourceRefV2 {
    if (this.createdResourceObserver && !this.pageCreated) {
      const pageRef = {
        id: 'page-1',
        kind: 'page' as const,
        recipeId: COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID,
      };
      const pageMetadata = {
        ...request.metadata,
        recipeId: COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID,
      };
      this.resources.set(pageRef.id, {
        ref: pageRef,
        request: { metadata: pageMetadata },
        metadata: pageMetadata,
      });
      this.pageCreated = true;
      this.mutationCount += 1;
      this.createdResourceObserver(pageRef);
    }
    const ref = { id: `${kind}-${this.resources.size + 1}`, kind, recipeId };
    this.resources.set(ref.id, { ref, request, metadata: request.metadata });
    this.mutationCount += 1;
    this.createdResourceObserver?.(ref);
    return ref;
  }

  async getContext(): Promise<ColorSystemRendererHostContextV2> {
    return this.context;
  }

  async findNameCollisions(names: readonly string[]): Promise<readonly string[]> {
    this.events.push('collision-preflight');
    return names.filter(name => this.existingNames.has(name));
  }

  async loadFonts(_fonts: readonly ColorSystemRendererFontV2[]): Promise<void> {
    this.events.push('fonts-loaded');
    if (this.fontFailure) throw new Error('Inter Bold is unavailable.');
  }

  async createCollection(request: Parameters<ColorSystemRendererHostV2['createCollection']>[0]) {
    this.maybeFail('collections');
    const ref = this.store('collection', request.recipe.recipeId, request);
    return {
      ref,
      modeIds: Object.fromEntries(request.recipe.modes.map(mode => [mode, `${ref.id}-${mode}`])),
    } satisfies ColorSystemRendererCollectionResultV2;
  }

  async createPrimitiveVariable(request: ColorSystemRendererPrimitiveVariableRequestV2) {
    this.maybeFail('primitive-variables');
    this.primitiveRequests.push(request);
    return this.store('variable', request.recipeId, request);
  }

  async createAliasVariable(request: ColorSystemRendererAliasVariableRequestV2) {
    this.maybeFail('alias-variables');
    this.aliasRequests.push(request);
    if (request.aliases.some(alias => !this.resources.has(alias.targetVariableId))) {
      throw new Error('Unresolved alias target.');
    }
    return this.store('variable', request.recipeId, request);
  }

  async createPaintStyle(request: ColorSystemRendererStyleRequestV2) {
    this.maybeFail('styles');
    if (!this.resources.has(request.variableId)) throw new Error('Unresolved style Variable.');
    return this.store('style', request.recipeId, request);
  }

  async createComponent(request: ColorSystemRendererComponentRequestV2) {
    this.maybeFail('components');
    if (request.paintBindings.some(binding => !this.resources.has(binding.variableId))) {
      throw new Error('Unresolved component Variable.');
    }
    return this.store('component', request.recipe.recipeId, request);
  }

  async createFrame(request: ColorSystemRendererFrameRequestV2) {
    this.maybeFail('frames');
    this.frameRequests.push(request);
    if (
      [...request.componentIds, ...request.systemVariableIds].some(id => !this.resources.has(id))
    ) {
      throw new Error('Unresolved frame binding.');
    }
    return this.store('frame', request.recipe.recipeId, request);
  }

  async inspectCreatedSystem(): Promise<ColorSystemRendererHostInventoryV2> {
    this.maybeFail('verification');
    const values = [...this.resources.values()];
    const byKind = (kind: ColorSystemHostResourceRefV2['kind']) =>
      values.filter(value => value.ref.kind === kind);
    const collections = byKind('collection');
    const aliases = this.aliasRequests;
    return {
      counts: {
        collections: collections.length,
        variables: byKind('variable').length,
        styles: byKind('style').length,
        components: byKind('component').length,
        frames: byKind('frame').length,
      },
      collectionRoles: collections.map(value => {
        const request = value.request as Parameters<
          ColorSystemRendererHostV2['createCollection']
        >[0];
        return request.recipe.role;
      }) as ['primitives', 'semantics'],
      frameRoles: this.frameRequests.map(request => request.recipe.role),
      resourceBlueprintHashes: values.map(value => value.metadata.resourceBlueprintHash),
      sectionBlueprintHashes: values.map(value => value.metadata.sectionBlueprintHash),
      unresolvedAliasCount: aliases.reduce(
        (count, request) =>
          count +
          request.aliases.filter(alias => !this.resources.has(alias.targetVariableId)).length,
        0
      ),
      hiddenLiteralPaintCount: 0,
      boundaryViolationCount: this.frameRequests.filter(
        request =>
          request.recipe.sectionContent.cardBoundary.kind !== 'none' &&
          request.recipe.sectionContent.cardBoundary.kind !== 'monochrome-inside-1px'
      ).length,
    };
  }

  async removeResource(ref: ColorSystemHostResourceRefV2): Promise<void> {
    const stored = this.resources.get(ref.id);
    const storedName =
      stored && typeof stored.request === 'object' && stored.request !== null
        ? (stored.request as { name?: unknown }).name
        : undefined;
    if (typeof storedName === 'string') this.existingNames.delete(storedName);
    this.resources.delete(ref.id);
    this.events.push(`remove-resource:${ref.id}`);
    this.mutationCount += 1;
  }

  async commitUndo(): Promise<void> {
    this.maybeFail('undo-boundary');
    this.events.push('commit-undo');
    this.undoCount += 1;
    this.mutationCount += 1;
  }

  async revealCreatedSystem(request: {
    transactionId: string;
    frameRefs: readonly ColorSystemHostResourceRefV2[];
  }): Promise<void> {
    this.events.push('reveal-created-system');
    if (this.revealFailure) throw new Error('Injected reveal failure.');
    if (
      request.transactionId !== 'renderer-transaction-1' ||
      request.frameRefs.length !== 5 ||
      request.frameRefs.some(ref => ref.kind !== 'frame' || !this.resources.has(ref.id))
    ) {
      throw new Error('Invalid reveal request.');
    }
    this.revealedFrameIds = request.frameRefs.map(ref => ref.id);
  }
}

function options(
  overrides: Partial<Parameters<typeof renderColorSystemResourceBlueprintV2>[2]> = {}
): RenderColorSystemResourceBlueprintV2Options {
  return {
    transactionId: 'renderer-transaction-1',
    expectedCurrentFileIdentityHash: FILE_HASH,
    currentFileAcknowledged: true,
    collisionPolicy: 'cancel' as const,
    finalMutationFence: async () => undefined,
    ...overrides,
  };
}

function journalHarness(
  host: FakeRendererHost,
  resourceBlueprint: ColorSystemResourceBlueprintV2,
  options: { failJournalClear?: boolean; failCompletionWrite?: boolean } = {}
) {
  const rootData = new Map<string, string>();
  const completionAcknowledgements = new Map<string, unknown>();
  const journalHost: ColorSystemCreateJournalHostV2 = {
    getRootPluginData: key => rootData.get(key) ?? '',
    setRootPluginData: (key, value) => {
      if (options.failJournalClear && key === COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY && !value) {
        throw new Error('journal clear failed');
      }
      if (value) rootData.set(key, value);
      else rootData.delete(key);
    },
    getCompletionAcknowledgement: async fileHash => completionAcknowledgements.get(fileHash),
    setCompletionAcknowledgement: async (fileHash, value) => {
      if (options.failCompletionWrite) throw new Error('completion acknowledgement failed');
      completionAcknowledgements.set(fileHash, value);
      host.events.push('completion-acknowledged');
    },
    clearCompletionAcknowledgement: async fileHash => {
      completionAcknowledgements.delete(fileHash);
    },
    fingerprintResources: async refs =>
      deterministicContentHash(
        refs.map(ref => {
          const stored = host.resources.get(ref.id);
          if (!stored) throw new Error(`missing fingerprint resource ${ref.id}`);
          return { ref, request: stored.request, metadata: stored.metadata };
        })
      ),
    loadAllPages: async () => undefined,
    resolveResource: async ref => {
      const stored = host.resources.get(ref.id);
      if (!stored) return null;
      return {
        id: stored.ref.id,
        kind: stored.ref.kind,
        name: stored.ref.recipeId,
        remote: false,
        ownership: { ...stored.metadata, resourceKind: stored.ref.kind },
        remove: () => host.removeResource(stored.ref),
      };
    },
  };
  const runtime = createColorSystemCreateJournalRuntimeV2(journalHost);
  const authorizationHash = deterministicContentHash('renderer-create-authorization');
  return {
    rootData,
    runtime,
    transactionId: `teul-create-v2:${authorizationHash.slice('sha256:'.length)}`,
    journal: {
      runtime,
      input: {
        requestId: 'renderer-create-request',
        sessionId: 'teul-color-builder-v2:renderer-session',
        currentFileIdentityHash: FILE_HASH,
        sourceAuthorityHash: SOURCE_HASH,
        liveSourceHash: SOURCE_HASH,
        briefHash: BRIEF_HASH,
        strategySetHash: STRATEGY_HASH,
        candidateHash: CANDIDATE_HASH,
        applicationBlueprintHash: APPLICATION_HASH,
        sectionBlueprintHash: SECTION_HASH,
        resourceBlueprintHash: resourceBlueprint.resourceBlueprintHash,
        reviewHash: deterministicContentHash('renderer-review'),
        approvalHash: deterministicContentHash('renderer-approval'),
        createAuthorizationHash: authorizationHash,
        systemId: resourceBlueprint.output.systemId,
      },
    },
  };
}

describe('colorSystemResourceRendererV2', () => {
  it.each([
    'missing-plan',
    'missing-use',
    'extra-use',
    'wrong-mode',
    'wrong-origin',
    'oversize-width',
    'oversize-height',
  ])('rejects graphic %s before any document mutation', async invalid => {
    const host = new FakeRendererHost();
    const resource = blueprint();
    const graphic = resource.components.find(component => component.kind === 'product-graphics')!;
    if (invalid === 'missing-plan')
      graphic.content = { ...(graphic.content as object), rendering: null };
    if (invalid === 'missing-use') graphic.paintBindings = graphic.paintBindings.slice(0, -1);
    if (invalid === 'extra-use')
      graphic.paintBindings = [
        ...graphic.paintBindings,
        { ...graphic.paintBindings[0], purpose: 'use:undeclared' },
      ];
    if (invalid === 'wrong-mode') graphic.paintBindings[0].mode = 'Dark';
    if (invalid === 'wrong-origin')
      graphic.paintBindings.find(
        binding => binding.purpose === 'use:foreground'
      )!.variableRecipeId = 'variable/primitive/preserved/primary-solar';
    const frame = resource.frames.find(frame => frame.role === 'product-graphics')!;
    if (invalid === 'oversize-width') frame.presentationContent.frame.width = 600;
    if (invalid === 'oversize-height') frame.presentationContent.frame.height = 1800;
    resource.counts.estimatedNodes = estimateColorSystemResourceNodesV2(
      resource.counts.variables,
      resource.styles,
      resource.components,
      resource.frames
    );
    const { resourceBlueprintHash: _hash, ...content } = resource;
    resource.resourceBlueprintHash = deterministicContentHash(content);
    const receipt = await renderColorSystemResourceBlueprintV2(host, resource, options());
    expect(receipt).toMatchObject({
      status: 'blocked',
      code: 'INVALID_BLUEPRINT',
      mutationCount: 0,
    });
    expect(host.mutationCount).toBe(0);
    expect(host.resources.size).toBe(0);
  });

  it('materializes exact RGBA, closed aliases, bound resources, and five ordered frames', async () => {
    const host = new FakeRendererHost();
    const resourceBlueprint = blueprint();
    const receipt = await renderColorSystemResourceBlueprintV2(host, resourceBlueprint, options());
    expect(receipt.status).toBe('created');
    expect(host.undoCount).toBe(1);
    expect(host.events.slice(-2)).toEqual(['reveal-created-system', 'commit-undo']);
    expect(host.revealedFrameIds).toEqual(
      [...host.resources.values()]
        .filter(resource => resource.ref.kind === 'frame')
        .map(resource => resource.ref.id)
    );
    if (receipt.status === 'created') expect(receipt.warnings).toEqual([]);
    expect(host.resources.size).toBe(
      2 +
        resourceBlueprint.counts.variables +
        resourceBlueprint.counts.styles +
        resourceBlueprint.counts.components +
        5
    );
    const alpha = host.primitiveRequests.find(
      request => request.recipeId === 'variable/derivation/product-surface/1'
    );
    expect(alpha?.values[0].rgba).toEqual({ r: 0, g: 114 / 255, b: 178 / 255, a: 0.4 });
    expect(
      host.aliasRequests.every(request =>
        request.aliases.every(alias => host.resources.has(alias.targetVariableId))
      )
    ).toBe(true);
    expect(host.frameRequests.map(request => request.recipe.role)).toEqual(
      COLOR_SYSTEM_SECTION_ROLES_V2
    );
    expect(JSON.stringify(host.frameRequests)).not.toContain('sourceNodeId');
    expect(
      host.frameRequests.every(
        request =>
          request.recipe.sectionContent.cardBoundary.kind === 'none' &&
          request.recipe.documentationChrome.backgroundHex === '#FFFFFF'
      )
    ).toBe(true);
    expect(
      host.frameRequests
        .flatMap(request => request.componentIds)
        .every(id => host.resources.has(id))
    ).toBe(true);
  });

  it('cancels collisions without mutation and creates a separately named copy without updating anything', async () => {
    const cancelHost = new FakeRendererHost();
    cancelHost.existingNames.add('Example Color System');
    const cancelled = await renderColorSystemResourceBlueprintV2(
      cancelHost,
      blueprint(),
      options()
    );
    expect(cancelled).toMatchObject({ status: 'blocked', code: 'COLLISION_CANCELLED' });
    expect(cancelHost.mutationCount).toBe(0);
    expect(cancelHost.resources.size).toBe(0);

    const copyHost = new FakeRendererHost();
    copyHost.existingNames.add('Example Color System');
    const copied = await renderColorSystemResourceBlueprintV2(
      copyHost,
      blueprint(),
      options({ collisionPolicy: 'create-copy', copyName: 'Example Color System 2' })
    );
    expect(copied).toMatchObject({
      status: 'created',
      action: 'create-copy',
      outputName: 'Example Color System 2',
    });
    expect(copyHost.resources.size).toBeGreaterThan(0);
  });

  it('keeps verified resources, warns on reveal failure, and commits reveal inside one undo boundary', async () => {
    const host = new FakeRendererHost();
    host.revealFailure = true;
    const resourceBlueprint = blueprint();

    const receipt = await renderColorSystemResourceBlueprintV2(host, resourceBlueprint, options());

    expect(receipt.status).toBe('created');
    expect(host.undoCount).toBe(1);
    expect(host.events.slice(-2)).toEqual(['reveal-created-system', 'commit-undo']);
    expect(host.resources.size).toBe(
      2 +
        resourceBlueprint.counts.variables +
        resourceBlueprint.counts.styles +
        resourceBlueprint.counts.components +
        5
    );
    if (receipt.status === 'created') {
      expect(receipt.warnings).toEqual([
        'The system was created, but Figma could not show the new page automatically. Open "Example Color System — Color System" from Pages.',
      ]);
    }
  });

  it('keeps the verified journal through commit, acknowledges completion, and makes an identical retry a verified no-op', async () => {
    const host = new FakeRendererHost();
    const resourceBlueprint = blueprint();
    const journal = journalHarness(host, resourceBlueprint);

    const receipt = await renderColorSystemResourceBlueprintV2(
      host,
      resourceBlueprint,
      options({ transactionId: journal.transactionId, journal: journal.journal })
    );

    expect(receipt.status).toBe('created');
    expect(host.undoCount).toBe(1);
    expect(journal.runtime.read()?.state).toBe('verified');
    expect(journal.rootData.has(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY)).toBe(true);
    const resourceCount = host.resources.size;
    const mutationCount = host.mutationCount;

    const repeated = await renderColorSystemResourceBlueprintV2(
      host,
      resourceBlueprint,
      options({ transactionId: journal.transactionId, journal: journal.journal })
    );

    expect(repeated).toMatchObject({
      status: 'verified-no-op',
      action: 'verified-no-op',
      undoBoundaryCount: 0,
      outputName: 'Example Color System',
    });
    expect(journal.runtime.read()?.state).toBe('verified');
    expect(host.resources.size).toBe(resourceCount);
    expect(host.mutationCount).toBe(mutationCount);
    expect(host.undoCount).toBe(1);
  });

  it('reaches a verified no-op even when the completed output was created under a colliding copy name', async () => {
    const host = new FakeRendererHost();
    const resourceBlueprint = blueprint();
    const journal = journalHarness(host, resourceBlueprint);
    const copyName = 'Example Color System — Reviewed Copy';
    host.existingNames.add(resourceBlueprint.output.name);
    const renderOptions = options({
      transactionId: journal.transactionId,
      collisionPolicy: 'create-copy',
      copyName,
      journal: journal.journal,
    });

    const created = await renderColorSystemResourceBlueprintV2(
      host,
      resourceBlueprint,
      renderOptions
    );
    expect(created).toMatchObject({
      status: 'created',
      action: 'create-copy',
      outputName: copyName,
    });
    host.existingNames.add(copyName);
    const mutationCount = host.mutationCount;

    const repeated = await renderColorSystemResourceBlueprintV2(
      host,
      resourceBlueprint,
      renderOptions
    );

    expect(repeated).toMatchObject({
      status: 'verified-no-op',
      action: 'verified-no-op',
      outputName: copyName,
      undoBoundaryCount: 0,
    });
    expect(host.mutationCount).toBe(mutationCount);
    expect(host.undoCount).toBe(1);
  });

  it('blocks a no-op when the committed output fingerprint changed', async () => {
    const host = new FakeRendererHost();
    const resourceBlueprint = blueprint();
    const journal = journalHarness(host, resourceBlueprint);
    const renderOptions = options({
      transactionId: journal.transactionId,
      journal: journal.journal,
    });
    const created = await renderColorSystemResourceBlueprintV2(
      host,
      resourceBlueprint,
      renderOptions
    );
    expect(created.status).toBe('created');
    const stored = [...host.resources.values()].find(resource => resource.ref.kind === 'variable');
    if (!stored) throw new Error('The renderer test did not create a Variable.');
    stored.request = { ...(stored.request as object), name: 'Owner-edited Variable' };
    const mutationCount = host.mutationCount;

    const repeated = await renderColorSystemResourceBlueprintV2(
      host,
      resourceBlueprint,
      renderOptions
    );

    expect(repeated).toMatchObject({ status: 'blocked', code: 'RECOVERY_REQUIRED' });
    if (repeated.status === 'blocked') {
      expect(repeated.message).toContain('cannot be treated as an identical no-op');
    }
    expect(host.mutationCount).toBe(mutationCount);
    expect(journal.runtime.read()?.state).toBe('verified');
  });

  it('runs collision/font/final fences before cleaning a partial copy journal, then creates safely', async () => {
    const host = new FakeRendererHost();
    const resourceBlueprint = blueprint();
    const journal = journalHarness(host, resourceBlueprint);
    const copyName = 'Example Color System — Interrupted Copy';
    host.existingNames.add(resourceBlueprint.output.name);
    host.existingNames.add(copyName);
    let persisted = journal.runtime.begin({
      ...journal.journal.input,
      transactionId: journal.transactionId,
      outputAction: 'create-copy',
      outputName: copyName,
      outputPageName: `${copyName} — Color System`,
      counts: resourceBlueprint.counts,
    });
    const interruptedRef = {
      kind: 'collection' as const,
      id: 'interrupted-collection',
      recipeId: 'collection/primitives',
    };
    const interruptedMetadata: ColorSystemRendererOwnershipMetadataV2 = {
      version: 'teul-color-resource-owner/v2',
      transactionId: journal.transactionId,
      systemId: resourceBlueprint.output.systemId,
      recipeId: interruptedRef.recipeId,
      resourceBlueprintHash: resourceBlueprint.resourceBlueprintHash,
      sectionBlueprintHash: resourceBlueprint.sectionBlueprintHash,
    };
    host.resources.set(interruptedRef.id, {
      ref: interruptedRef,
      request: { name: copyName, metadata: interruptedMetadata },
      metadata: interruptedMetadata,
    });
    persisted = journal.runtime.record(persisted, interruptedRef);
    expect(persisted.state).toBe('creating');
    const finalFence = vi.fn(async () => {
      host.events.push('final-mutation-fence');
    });

    const result = await renderColorSystemResourceBlueprintV2(
      host,
      resourceBlueprint,
      options({
        transactionId: journal.transactionId,
        collisionPolicy: 'create-copy',
        copyName,
        finalMutationFence: finalFence,
        journal: journal.journal,
      })
    );

    expect(result.status).toBe('created');
    expect(host.existingNames.has(copyName)).toBe(false);
    expect(host.events.indexOf('collision-preflight')).toBeLessThan(
      host.events.indexOf('fonts-loaded')
    );
    expect(host.events.indexOf('fonts-loaded')).toBeLessThan(
      host.events.indexOf('final-mutation-fence')
    );
    expect(host.events.indexOf('final-mutation-fence')).toBeLessThan(
      host.events.indexOf(`remove-resource:${interruptedRef.id}`)
    );
    expect(finalFence).toHaveBeenCalledTimes(2);
  });

  it('preserves a complete verified output and recovery marker when the final undo boundary fails', async () => {
    const host = new FakeRendererHost('undo-boundary');
    const resourceBlueprint = blueprint();
    const journal = journalHarness(host, resourceBlueprint);

    const receipt = await renderColorSystemResourceBlueprintV2(
      host,
      resourceBlueprint,
      options({ transactionId: journal.transactionId, journal: journal.journal })
    );

    expect(receipt).toMatchObject({
      status: 'cleanup-incomplete',
      failedPhase: 'undo-boundary',
      removedCount: 0,
    });
    expect(host.undoCount).toBe(0);
    expect(journal.runtime.read()?.state).toBe('verified');
    const resourceCount = host.resources.size;
    await expect(
      journal.runtime.reconcile(FILE_HASH, {
        systemId: resourceBlueprint.output.systemId,
        resourceBlueprintHash: resourceBlueprint.resourceBlueprintHash,
        sectionBlueprintHash: resourceBlueprint.sectionBlueprintHash,
      })
    ).resolves.toMatchObject({
      status: 'preserved-unacknowledged-output',
      blocksNewMutation: true,
    });
    expect(host.resources.size).toBe(resourceCount);
  });

  it('reports cleanup-incomplete when rollback removed resources but durable journal reconciliation still failed', async () => {
    const host = new FakeRendererHost('primitive-variables');
    const resourceBlueprint = blueprint();
    const journal = journalHarness(host, resourceBlueprint, { failJournalClear: true });

    const receipt = await renderColorSystemResourceBlueprintV2(
      host,
      resourceBlueprint,
      options({ transactionId: journal.transactionId, journal: journal.journal })
    );

    expect(receipt).toMatchObject({
      status: 'cleanup-incomplete',
      failedPhase: 'primitive-variables',
    });
    if (receipt.status === 'cleanup-incomplete') {
      expect(receipt.message).toContain('Durable journal reconciliation remains blocked');
      expect(receipt.unresolvedRefs.length).toBeGreaterThan(0);
    }
    expect(journal.runtime.read()?.state).toBe('creating');
  });

  it('keeps commitUndo final and repairs a transient completion acknowledgement on same-runtime retry', async () => {
    const host = new FakeRendererHost();
    const resourceBlueprint = blueprint();
    const journalOptions = { failCompletionWrite: true };
    const journal = journalHarness(host, resourceBlueprint, journalOptions);
    const renderOptions = options({
      transactionId: journal.transactionId,
      journal: journal.journal,
    });

    const receipt = await renderColorSystemResourceBlueprintV2(
      host,
      resourceBlueprint,
      renderOptions
    );

    expect(receipt).toMatchObject({
      status: 'cleanup-incomplete',
      failedPhase: 'completion-acknowledgement',
      removedCount: 0,
    });
    expect(host.undoCount).toBe(1);
    expect(journal.runtime.read()?.state).toBe('verified');
    expect(host.resources.size).toBeGreaterThan(0);
    const mutationCount = host.mutationCount;

    journalOptions.failCompletionWrite = false;
    const retried = await renderColorSystemResourceBlueprintV2(
      host,
      resourceBlueprint,
      renderOptions
    );

    expect(retried).toMatchObject({ status: 'verified-no-op', undoBoundaryCount: 0 });
    expect(host.mutationCount).toBe(mutationCount);
    expect(host.undoCount).toBe(1);
  });

  it('runs the final source/profile fence after collision and font awaits and before the first mutation', async () => {
    const host = new FakeRendererHost();
    const finalFence = vi.fn(async () => {
      host.events.push('final-mutation-fence');
    });

    const receipt = await renderColorSystemResourceBlueprintV2(
      host,
      blueprint(),
      options({ finalMutationFence: finalFence })
    );

    expect(receipt.status).toBe('created');
    expect(finalFence).toHaveBeenCalledOnce();
    expect(host.events.indexOf('collision-preflight')).toBeLessThan(
      host.events.indexOf('fonts-loaded')
    );
    expect(host.events.indexOf('fonts-loaded')).toBeLessThan(
      host.events.indexOf('final-mutation-fence')
    );
    expect(host.events.indexOf('final-mutation-fence')).toBeLessThan(
      host.events.indexOf('commit-undo')
    );
  });

  it('blocks with zero mutation when the final source/profile fence fails', async () => {
    const host = new FakeRendererHost();
    const receipt = await renderColorSystemResourceBlueprintV2(
      host,
      blueprint(),
      options({
        finalMutationFence: async () => {
          throw new Error('governed source changed during font loading');
        },
      })
    );

    expect(receipt).toMatchObject({ status: 'blocked', code: 'FINAL_FENCE_FAILED' });
    expect(host.mutationCount).toBe(0);
    expect(host.resources.size).toBe(0);
    expect(host.undoCount).toBe(0);
  });

  it.each([
    'collections',
    'primitive-variables',
    'alias-variables',
    'styles',
    'components',
    'frames',
    'verification',
    'undo-boundary',
  ] satisfies readonly ColorSystemRendererMutationPhaseV2[])(
    'compensates every created resource after a %s failure',
    async failurePhase => {
      const host = new FakeRendererHost(failurePhase);
      const receipt = await renderColorSystemResourceBlueprintV2(host, blueprint(), options());
      expect(receipt.status).toBe('rolled-back');
      expect(host.resources.size).toBe(0);
      if (receipt.status === 'rolled-back') {
        expect(receipt.failedPhase).toBe(failurePhase);
        expect(receipt.removedCount).toBe(receipt.createdCount);
        expect(receipt.unresolvedRefs).toEqual([]);
      }
    }
  );

  it.each([1, 280])(
    'checks current legend node cost for a saved graph with %i charts without replacing its historical estimate',
    async copies => {
      const host = new FakeRendererHost();
      const resource = blueprint();
      const chart = resource.components.find(component => component.kind === 'data-visualization')!;
      const charts = Array.from({ length: copies }, (_, index) => ({
        ...chart,
        recipeId: index === 0 ? chart.recipeId : `component/extra-chart-${index}`,
        content: {
          kind: 'categorical',
          marks: [1, 2, 3].map(order => ({ order, label: `Recorded ${order}` })),
        },
        paintBindings: [1, 2, 3].map(order => ({
          ...chart.paintBindings[0],
          purpose: `mark-${order}`,
        })),
      }));
      resource.components = [
        ...resource.components.filter(component => component !== chart),
        ...charts,
      ];
      resource.frames.find(frame => frame.role === 'data-visualization')!.componentRecipeIds =
        charts.map(component => component.recipeId);
      resource.counts.components = resource.components.length;
      const currentEstimate = estimateColorSystemResourceNodesV2(
        resource.counts.variables,
        resource.styles,
        resource.components,
        resource.frames
      );
      resource.counts.estimatedNodes = currentEstimate - copies * 7;
      const { resourceBlueprintHash: _hash, ...content } = resource;
      resource.resourceBlueprintHash = deterministicContentHash(content);
      const before = structuredClone(resource);
      expect(resource.counts.estimatedNodes).toBeLessThan(resource.limits.maximumEstimatedNodes);
      const receipt = await renderColorSystemResourceBlueprintV2(host, resource, options());
      if (copies === 1) {
        expect(currentEstimate).toBeLessThan(resource.limits.maximumEstimatedNodes);
        expect(receipt.status).toBe('created');
      } else {
        expect(currentEstimate).toBeGreaterThan(resource.limits.maximumEstimatedNodes);
        expect(receipt).toMatchObject({
          status: 'blocked',
          code: 'INVALID_BLUEPRINT',
          mutationCount: 0,
        });
        expect(host.mutationCount).toBe(0);
      }
      expect(resource).toEqual(before);
    }
  );

  it('performs zero document mutation for current-file, font, capability, collision, and cap failures', async () => {
    const cases: Array<{
      host: FakeRendererHost;
      resourceBlueprint: ColorSystemResourceBlueprintV2;
      renderOptions: ReturnType<typeof options>;
      code: string;
    }> = [];
    cases.push({
      host: new FakeRendererHost(),
      resourceBlueprint: blueprint(),
      renderOptions: options({ currentFileAcknowledged: false }),
      code: 'CURRENT_FILE_REQUIRED',
    });
    const fontHost = new FakeRendererHost();
    fontHost.fontFailure = true;
    cases.push({
      host: fontHost,
      resourceBlueprint: blueprint(),
      renderOptions: options(),
      code: 'FONT_UNAVAILABLE',
    });
    const capabilityHost = new FakeRendererHost();
    capabilityHost.context = {
      ...capabilityHost.context,
      capabilities: { ...capabilityHost.context.capabilities, variableAliases: false },
    };
    cases.push({
      host: capabilityHost,
      resourceBlueprint: blueprint(),
      renderOptions: options(),
      code: 'CAPABILITY_MISSING',
    });
    const copyCollisionHost = new FakeRendererHost();
    copyCollisionHost.existingNames.add('Example Color System');
    copyCollisionHost.existingNames.add('Example Color System 2');
    cases.push({
      host: copyCollisionHost,
      resourceBlueprint: blueprint(),
      renderOptions: options({ collisionPolicy: 'create-copy', copyName: 'Example Color System 2' }),
      code: 'COPY_NAME_COLLISION',
    });
    const overCap = structuredClone(blueprint());
    overCap.counts.variables = 513;
    const { resourceBlueprintHash: _hash, ...content } = overCap;
    overCap.resourceBlueprintHash = deterministicContentHash(content);
    cases.push({
      host: new FakeRendererHost(),
      resourceBlueprint: overCap,
      renderOptions: options(),
      code: 'INVALID_BLUEPRINT',
    });

    for (const testCase of cases) {
      const receipt = await renderColorSystemResourceBlueprintV2(
        testCase.host,
        testCase.resourceBlueprint,
        testCase.renderOptions
      );
      expect(receipt).toMatchObject({ status: 'blocked', code: testCase.code, mutationCount: 0 });
      expect(testCase.host.mutationCount).toBe(0);
      expect(testCase.host.resources.size).toBe(0);
    }
  });
});
