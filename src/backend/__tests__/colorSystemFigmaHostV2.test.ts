import { describe, expect, it } from 'vitest';
import {
  colorSystemProductGraphicsComponentSizeV1,
  layoutColorSystemProductGraphicsComponentsV1,
} from '../../lib/colorSystemProductGraphicsLayoutV1';
import {
  buildColorSystemProductGraphicsProjectionV1,
  type ColorSystemProductGraphicsRenderingV1,
} from '../../lib/colorSystemProductGraphicsPlanV1';
import {
  createInMemoryAuthoredFigmaPluginApiV1,
  type AuthoredNativeMockNodeV1,
} from './helpers/inMemoryAuthoredFigmaPluginApiV1';
import {
  COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID,
  colorSystemCreateCompletionStorageKeyV2,
  createColorSystemCreateJournalRuntimeV2,
  createFigmaColorSystemCreateJournalHostV2,
} from '../colorSystemCreateJournalV2';
import {
  COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA,
  createColorSystemFigmaRendererHostV2,
} from '../colorSystemFigmaHostV2';
import { COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION } from '../colorSystemResourceOwnershipV2';
import {
  renderColorSystemResourceBlueprintV2,
  type ColorSystemHostResourceRefV2,
  type ColorSystemRendererComponentRequestV2,
  type ColorSystemRendererHostV2,
  type ColorSystemRendererOwnershipMetadataV2,
} from '../colorSystemResourceRendererV2';
import {
  HOST_FIXTURE_FILE_HASH,
  HOST_FIXTURE_RECIPE_IDS,
  HOST_FIXTURE_RESOURCE_TOTAL,
  HOST_FIXTURE_STYLED_RECIPE_IDS,
  HOST_FIXTURE_TOKEN_NAMES,
  hostBlueprintFixture,
  hostJournalHarness,
  rehashHostBlueprint, // p4-DE
  renderOptions,
  roleFrameRecipe,
  seedVariableFirstSource,
} from './helpers/colorSystemResourceBlueprintFixtureV2';
import {
  colorSystemSpotDescriptionV2,
  type ColorSystemRendererOwnerSpotColorsV2,
} from '../colorSystemResourceRendererV2'; // p4-DE
import {
  createInMemoryFigmaPluginApi,
  resolveVariableColor,
  type FakeNode,
  type InMemoryFigmaOptions,
} from './helpers/inMemoryFigmaPluginApi';

const KEYS = COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA;

function harness(options: InMemoryFigmaOptions = {}) {
  const { figma, document } = createInMemoryFigmaPluginApi(options);
  const source = seedVariableFirstSource(document);
  const sourceSnapshot = document.snapshot();
  const host = createColorSystemFigmaRendererHostV2(figma, HOST_FIXTURE_FILE_HASH);
  const journalKeys = () =>
    document.root
      .getPluginDataKeys()
      .filter(key => key.startsWith(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY));
  return { figma, document, source, sourceSnapshot, host, journalKeys };
}

/** One renderer host serves one create, exactly as the candidate runtime constructs
 * a fresh host per snapshot; pass `host` to model a later create in the same file. */
async function createWithJournal(
  state: ReturnType<typeof harness>,
  blueprint = hostBlueprintFixture(),
  journal = hostJournalHarness(state.figma, blueprint),
  host: ColorSystemRendererHostV2 = state.host
) {
  const receipt = await renderColorSystemResourceBlueprintV2(
    host,
    blueprint,
    renderOptions({ transactionId: journal.transactionId, journal: journal.journal })
  );
  return { receipt, journal, blueprint };
}

function ownership(
  transactionId: string,
  recipeId: string,
  blueprint = hostBlueprintFixture()
): ColorSystemRendererOwnershipMetadataV2 {
  return {
    version: COLOR_SYSTEM_RESOURCE_OWNERSHIP_V2_VERSION,
    transactionId,
    systemId: blueprint.output.systemId,
    recipeId,
    resourceBlueprintHash: blueprint.resourceBlueprintHash,
    sectionBlueprintHash: blueprint.sectionBlueprintHash,
  };
}

/** Creates both collections and the fixture primitives directly through the host. */
async function primeHostVariables(host: ColorSystemRendererHostV2, transactionId = 'direct-tx') {
  const blueprint = hostBlueprintFixture();
  await host.loadFonts([{ family: 'Inter', style: 'Bold' }]);
  const primitives = await host.createCollection({
    recipe: blueprint.collections[0],
    name: blueprint.collections[0].name,
    metadata: ownership(transactionId, 'collection/primitives'),
  });
  const semantics = await host.createCollection({
    recipe: blueprint.collections[1],
    name: blueprint.collections[1].name,
    metadata: ownership(transactionId, 'collection/semantics'),
  });
  const variables = new Map<string, ColorSystemHostResourceRefV2>();
  for (const variable of blueprint.collections[0].variables) {
    const ref = await host.createPrimitiveVariable({
      collectionId: primitives.ref.id,
      recipeId: variable.recipeId,
      name: variable.name,
      description: variable.description,
      scopes: variable.scopes,
      values: Object.entries(variable.valuesByMode).map(([modeName, value]) => ({
        modeName,
        modeId: primitives.modeIds[modeName],
        rgba: { ...value.components, a: value.alpha },
      })),
      metadata: ownership(transactionId, variable.recipeId),
    });
    variables.set(variable.recipeId, ref);
  }
  return { blueprint, primitives, semantics, variables };
}

function componentRequest(
  name: string,
  kind: ColorSystemRendererComponentRequestV2['recipe']['kind'],
  paintBindings: ColorSystemRendererComponentRequestV2['paintBindings'],
  content: Record<string, unknown> = {},
  transactionId = 'direct-tx'
): ColorSystemRendererComponentRequestV2 {
  const recipeId = `component/direct/${name.toLowerCase().replace(/\s+/g, '-')}`;
  return {
    recipe: {
      recipeId,
      kind,
      role: kind === 'primary-family' || kind === 'secondary-family' ? 'secondary' : kind,
      name,
      content,
      paintBindings: paintBindings.map(binding => ({
        purpose: binding.purpose,
        mode: binding.mode,
        variableRecipeId: binding.variableId,
      })),
    } as ColorSystemRendererComponentRequestV2['recipe'],
    name,
    paintBindings,
    metadata: ownership(transactionId, recipeId),
  };
}

function graphicRenderingFixture(
  job: 'product-graphic' | 'functional-iconography' | 'product-ui-surface',
  vector = false
): ColorSystemProductGraphicsRenderingV1 {
  const shape = (x: number, y: number, width: number, height: number) => ({
    kind: 'rect' as const,
    x,
    y,
    width,
    height,
  });
  return buildColorSystemProductGraphicsProjectionV1(
    {
      applicationId: `fixture:${job}`,
      width: 240,
      height: 140,
      root: {
        id: 'outer',
        useId: 'outer',
        shape: shape(0, 0, 240, 140),
        children: [
          {
            id: 'card',
            useId: 'card',
            shape: shape(16, 16, 208, 108),
            children: [
              {
                id: 'selected',
                useId: 'selected',
                shape: shape(40, 40, 100, 40),
                children: vector
                  ? [
                      {
                        id: 'label',
                        useId: 'label',
                        shape: {
                          kind: 'compound-polygon',
                          fillRule: 'evenodd',
                          contours: [
                            [
                              { x: 52, y: 50 },
                              { x: 72, y: 50 },
                              { x: 72, y: 70 },
                              { x: 52, y: 70 },
                            ],
                          ],
                        },
                        textAlternative: 'Continue',
                        children: [],
                      },
                    ]
                  : [],
              },
            ],
          },
        ],
      },
    },
    {
      provenance: 'declared-context',
      requirementsHash: `sha256:${'7'.repeat(64)}`,
      contextId: `fixture:${job}`,
      uses: [
        {
          id: 'outer',
          role: 'outer-backdrop',
          assessment: 'decorative',
          ref: { kind: 'preserved-source-color', stableColorId: 'outer', mode: 'Light' },
        },
        {
          id: 'card',
          role: 'card-surface',
          assessment: 'decorative',
          ref: { kind: 'preserved-source-color', stableColorId: 'card', mode: 'Light' },
        },
        {
          id: 'selected',
          role:
            job === 'product-ui-surface'
              ? 'control-surface'
              : job === 'functional-iconography'
                ? 'functional-icon'
                : 'accent',
          assessment: 'informative',
          ref: { kind: 'preserved-source-color', stableColorId: 'selected', mode: 'Light' },
        },
        ...(vector
          ? [
              {
                id: 'label',
                role: 'label' as const,
                assessment: 'informative' as const,
                ref: {
                  kind: 'preserved-source-color' as const,
                  stableColorId: 'label',
                  mode: 'Light',
                },
              },
            ]
          : []),
      ],
      pairs: [
        {
          pairEvidenceId: 'selected-on-card',
          foregroundUseId: 'selected',
          backgroundUseId: 'card',
          underlayUseId: null,
        },
        ...(vector
          ? [
              {
                pairEvidenceId: 'label-on-selected',
                foregroundUseId: 'label',
                backgroundUseId: 'selected',
                underlayUseId: 'card',
              },
            ]
          : []),
      ],
    }
  );
}

function graphicRequest(
  name: string,
  job: 'product-graphic' | 'functional-iconography' | 'product-ui-surface',
  paints: readonly { useId: string; variableId: string; recipeId: string }[],
  vector = false
) {
  const request = componentRequest(
    name,
    'product-graphics',
    paints.map(paint => ({
      purpose: `use:${paint.useId}`,
      mode: 'Light',
      variableId: paint.variableId,
    })),
    { job, mode: 'Light', rendering: graphicRenderingFixture(job, vector) }
  );
  request.recipe.paintBindings = paints.map(paint => ({
    purpose: `use:${paint.useId}`,
    mode: 'Light',
    variableRecipeId: paint.recipeId,
  }));
  return request;
}

describe('colorSystemFigmaHostV2', () => {
  describe('declared graphic placement', () => {
    const layoutInput = {
      frame: { width: 9540, height: 5391 },
      palette: { x: 64, y: 240, rowGap: 16 },
      rows: [{ count: 4 }],
      systemVariableCount: 1,
    };
    it('preserves authored pixels and uses the largest row and column dimensions for unequal boards', () => {
      expect(colorSystemProductGraphicsComponentSizeV1({ width: 340, height: 220 })).toEqual({
        width: 760,
        height: 442,
      });
      const components = [
        { id: 'a', width: 760, height: 442 },
        { id: 'b', width: 1120, height: 620 },
        { id: 'c', width: 840, height: 400 },
        { id: 'd', width: 760, height: 322 },
      ];
      const placed = layoutColorSystemProductGraphicsComponentsV1({ ...layoutInput, components });
      expect(placed.map(({ x, y }) => ({ x, y }))).toEqual([
        { x: 64, y: 1600 },
        { x: 1264, y: 1600 },
        { x: 2464, y: 1600 },
        { x: 64, y: 2294 },
      ]);
      expect(placed.map(({ x: _x, y: _y, ...component }) => component)).toEqual(components);
      expect(placed[0].x + placed[0].width).toBeLessThan(placed[1].x);
      expect(placed[1].y + placed[1].height).toBeLessThan(placed[3].y);
    });
    it.each([
      { width: 9540, height: 442 },
      { width: 760, height: 5000 },
    ])('rejects an oversized board without scaling it to the fixed presentation', size => {
      expect(() =>
        layoutColorSystemProductGraphicsComponentsV1({
          ...layoutInput,
          components: [{ id: 'oversized', ...size }],
        })
      ).toThrow('exceed the fixed presentation extent');
    });
  });

  describe('document context', () => {
    it('reports an editable sRGB Figma Design file with every renderer capability', async () => {
      const state = harness();
      await expect(state.host.getContext()).resolves.toEqual({
        documentType: 'figma-design',
        editable: true,
        colorProfile: 'srgb',
        currentFileIdentityHash: HOST_FIXTURE_FILE_HASH,
        capabilities: {
          colorVariables: true,
          variableAliases: true,
          variableBoundPaintStyles: true,
          components: true,
          frames: true,
        },
      });
    });

    it('normalizes profile, editor, mode, and missing API surface into the guard inputs', async () => {
      expect(await harness({ documentColorProfile: 'DISPLAY_P3' }).host.getContext()).toMatchObject(
        {
          colorProfile: 'display-p3',
        }
      );
      expect(await harness({ documentColorProfile: 'LEGACY' }).host.getContext()).toMatchObject({
        colorProfile: 'unknown',
      });
      expect(await harness({ documentColorProfile: 'throw' }).host.getContext()).toMatchObject({
        colorProfile: 'unknown',
      });
      expect(await harness({ editorType: 'figjam' }).host.getContext()).toMatchObject({
        documentType: 'figjam',
        editable: false,
      });
      expect(await harness({ editorType: 'slides' }).host.getContext()).toMatchObject({
        documentType: 'slides',
      });
      expect(await harness({ mode: 'inspect' }).host.getContext()).toMatchObject({
        editable: false,
      });
      const limited = await harness({
        omit: ['createComponent', 'createVariableAlias', 'createPaintStyle', 'createPage'],
      }).host.getContext();
      expect(limited.capabilities).toEqual({
        colorVariables: true,
        variableAliases: false,
        variableBoundPaintStyles: false,
        components: false,
        frames: false,
      });
    });
  });

  describe('create through the renderer', () => {
    it('creates the complete system with exact names, two-mode values, closed aliases, and one undo boundary', async () => {
      const state = harness();
      const { receipt, journal, blueprint } = await createWithJournal(state);
      expect(receipt.status).toBe('created');
      if (receipt.status !== 'created') return;

      expect(receipt.counts).toEqual(blueprint.counts);
      expect(receipt.undoBoundaryCount).toBe(1);
      expect(state.document.commitUndoCount).toBe(1);
      expect(receipt.warnings).toEqual([]);

      const created = [...state.document.collections.values()].filter(
        collection => !state.source.collectionIds.includes(collection.id)
      );
      expect(created.map(collection => collection.name)).toEqual([
        'Example Color System / Primitives and derivations',
        'Example Color System / Semantic applications',
      ]);
      for (const collection of created) {
        expect(collection.modes.map(mode => mode.name)).toEqual(['Light', 'Dark']);
        expect(collection.getPluginData(KEYS.transactionId)).toBe(journal.transactionId);
      }
      expect(created[0].getPluginData(KEYS.collectionRole)).toBe('primitives');
      expect(created[1].getPluginData(KEYS.collectionRole)).toBe('semantics');
      expect(created[0].variableIds).toHaveLength(4);
      expect(created[1].variableIds).toHaveLength(2);

      const byRecipe = new Map(receipt.createdRefs.map(ref => [ref.recipeId, ref]));
      const secondary = byRecipe.get(HOST_FIXTURE_RECIPE_IDS.secondary);
      const accent = byRecipe.get(HOST_FIXTURE_RECIPE_IDS.accent);
      const text = byRecipe.get(HOST_FIXTURE_RECIPE_IDS.text);
      expect(secondary && accent && text).toBeTruthy();
      if (!secondary || !accent || !text) return;
      expect(resolveVariableColor(state.document, secondary.id, 'Light')).toEqual({
        r: 0,
        g: 114 / 255,
        b: 178 / 255,
        a: 1,
      });
      expect(resolveVariableColor(state.document, secondary.id, 'Dark')).toEqual({
        r: 100 / 255,
        g: 181 / 255,
        b: 232 / 255,
        a: 1,
      });
      expect(resolveVariableColor(state.document, accent.id, 'Dark')).toEqual(
        resolveVariableColor(state.document, secondary.id, 'Dark')
      );
      expect(resolveVariableColor(state.document, text.id, 'Light')).toEqual({
        r: 0,
        g: 0,
        b: 0,
        a: 1,
      });
      expect(resolveVariableColor(state.document, text.id, 'Dark')).toEqual({
        r: 228 / 255,
        g: 242 / 255,
        b: 34 / 255,
        a: 1,
      });
      const textVariable = state.document.variables.get(text.id);
      expect(textVariable?.scopes).toEqual(['TEXT_FILL']);
      expect(textVariable?.description).toBe('Text foreground.');

      // Variables carry the token path scheme verbatim: Figma groups on `/`.
      const variableNames = new Map(
        receipt.createdRefs
          .filter(ref => ref.kind === 'variable')
          .map(ref => [ref.recipeId, state.document.variables.get(ref.id)?.name])
      );
      expect(variableNames.get(HOST_FIXTURE_RECIPE_IDS.primary)).toBe('source/primary/solar');
      expect(variableNames.get(HOST_FIXTURE_RECIPE_IDS.secondary)).toBe('color/blue/base');
      expect(variableNames.get(HOST_FIXTURE_RECIPE_IDS.alpha)).toBe('color/blue/base-a40');
      expect(variableNames.get(HOST_FIXTURE_RECIPE_IDS.accent)).toBe('semantic/accent');
      const alpha = byRecipe.get(HOST_FIXTURE_RECIPE_IDS.alpha);
      expect(alpha && resolveVariableColor(state.document, alpha.id, 'Light').a).toBeCloseTo(0.4);

      // Paint Styles exist only for the exact sources, the family anchor, and the
      // semantic aliases; the alpha derivation is a Variable without a style.
      const styles = [...state.document.styles.values()];
      expect(styles.map(style => style.name).sort()).toEqual(
        HOST_FIXTURE_STYLED_RECIPE_IDS.map(
          id =>
            `Example Color System / ${
              HOST_FIXTURE_TOKEN_NAMES[
                (
                  Object.keys(HOST_FIXTURE_RECIPE_IDS) as (keyof typeof HOST_FIXTURE_RECIPE_IDS)[]
                ).find(
                  key => HOST_FIXTURE_RECIPE_IDS[key] === id
                ) as keyof typeof HOST_FIXTURE_TOKEN_NAMES
              ]
            }`
        ).sort()
      );
      expect(styles.some(style => style.name.endsWith(HOST_FIXTURE_TOKEN_NAMES.alpha))).toBe(false);
      const styledVariableIds = new Set(
        styles.map(style => (style.paints[0] as SolidPaint).boundVariables?.color?.id)
      );
      expect(styledVariableIds.has(alpha?.id ?? '')).toBe(false);
      for (const style of styles) {
        expect(style.paints).toHaveLength(1);
        const paint = style.paints[0] as SolidPaint;
        expect(paint.boundVariables?.color?.type).toBe('VARIABLE_ALIAS');
        expect(state.document.variables.has(paint.boundVariables?.color?.id ?? '')).toBe(true);
      }

      const pages = state.document.root.children.map(page => page.name);
      expect(pages).toEqual(['Page 1', 'Brand palette', 'Example Color System — Color System']);
      const page = state.document.root.children[2];
      expect(page.getPluginData(KEYS.recipeId)).toBe(COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID);
      const components = page.children.filter(node => node.type === 'COMPONENT');
      const frames = page.children.filter(node => node.type === 'FRAME');
      expect(components.map(node => node.name)).toEqual([
        'Example Color System / primary specimen',
        'Example Color System / secondary specimen',
        'Example Color System / product-graphics specimen',
        'Example Color System / data-visualization specimen',
        'Example Color System / typography specimen',
      ]);
      expect(frames.map(node => node.name)).toEqual([
        'Example Color System / primary',
        'Example Color System / secondary',
        'Example Color System / product-graphics',
        'Example Color System / data-visualization',
        'Example Color System / typography',
      ]);
      expect(frames.map(node => node.getPluginData(KEYS.frameOrder))).toEqual([
        '1',
        '2',
        '3',
        '4',
        '5',
      ]);
      expect(frames.map(node => node.x)).toEqual([0, 1680, 19240, 5040, 6720]);
      // The primary section shows exact palette cards only; every other role
      // places one specimen instance of its component.
      expect(frames[0].children.filter(node => node.type === 'INSTANCE')).toHaveLength(0);
      expect(
        frames[0].children.filter(node => node.getPluginData(KEYS.sceneRole) === 'color-swatch')
      ).toHaveLength(1);
      for (const frame of frames.slice(1)) {
        const specimens = frame.children.filter(node => node.type === 'INSTANCE');
        expect(specimens).toHaveLength(1);
        expect(specimens[0].mainComponent?.type).toBe('COMPONENT');
        expect(specimens[0].mainComponent?.parent?.id).toBe(page.id);
      }
      const typographyFrame = frames[4];
      const boundedCards = typographyFrame.children.filter(
        node => node.getPluginData(KEYS.sceneRole) === 'color-swatch'
      );
      expect(boundedCards.length).toBeGreaterThan(0);
      for (const card of boundedCards) {
        expect(card.strokes).toHaveLength(1);
        expect(card.strokeWeight).toBe(1);
        expect(card.strokeAlign).toBe('INSIDE');
      }

      // Every created resource carries the exact ownership record.
      const owned = state.document.teulOwnedResources();
      expect(owned).toHaveLength(HOST_FIXTURE_RESOURCE_TOTAL);
      expect(receipt.createdRefs).toHaveLength(HOST_FIXTURE_RESOURCE_TOTAL - 1);
      for (const ref of receipt.createdRefs) {
        expect(owned.some(resource => resource.id === ref.id)).toBe(true);
      }

      // Reveal selected the five frames on the new page.
      expect(state.document.currentPage.id).toBe(page.id);
      expect(page.selection.map(node => node.id)).toEqual(frames.map(node => node.id));
      expect(state.document.revealedNodeIds).toEqual([frames.map(node => node.id)]);

      // The source content from the corpus fixture is untouched.
      expect(state.source.collectionIds.every(id => state.document.collections.has(id))).toBe(true);
      expect(state.document.loadedFonts).toEqual([{ family: 'Inter', style: 'Bold' }]);
    });

    it('keeps the verified journal and its durable acknowledgement after a successful create', async () => {
      const state = harness();
      const { receipt, journal } = await createWithJournal(state);
      expect(receipt.status).toBe('created');

      const persisted = journal.runtime.read();
      expect(persisted?.state).toBe('verified');
      expect(persisted?.transactionId).toBe(journal.transactionId);
      expect(persisted?.resources).toHaveLength(HOST_FIXTURE_RESOURCE_TOTAL);
      expect(persisted?.resources.filter(ref => ref.kind === 'page')).toHaveLength(1);
      // Header, manifest, one entry per resource — and nothing else.
      expect(state.journalKeys()).toHaveLength(HOST_FIXTURE_RESOURCE_TOTAL + 2);
      expect(
        state.document.clientStorage.has(
          colorSystemCreateCompletionStorageKeyV2(HOST_FIXTURE_FILE_HASH)
        )
      ).toBe(true);
    });

    it('treats an identical authorized create as a verified no-op without a second undo boundary', async () => {
      const state = harness();
      const first = await createWithJournal(state);
      expect(first.receipt.status).toBe('created');
      const snapshot = state.document.snapshot();

      const second = await createWithJournal(state, hostBlueprintFixture(), first.journal);
      expect(second.receipt).toMatchObject({
        status: 'verified-no-op',
        action: 'verified-no-op',
        undoBoundaryCount: 0,
        outputName: 'Example Color System',
      });
      if (second.receipt.status !== 'verified-no-op' || first.receipt.status !== 'created') return;
      expect(second.receipt.existingRefs).toHaveLength(HOST_FIXTURE_RESOURCE_TOTAL);
      expect(
        first.receipt.createdRefs.every(
          ref =>
            second.receipt.status === 'verified-no-op' &&
            second.receipt.existingRefs.some(existing => existing.id === ref.id)
        )
      ).toBe(true);
      expect(state.document.commitUndoCount).toBe(1);
      expect(state.document.snapshot()).toEqual(snapshot);
      expect(state.document.teulOwnedResources()).toHaveLength(HOST_FIXTURE_RESOURCE_TOTAL);

      // A plugin restart reaches the same decision from the persisted journal alone.
      const restarted = hostJournalHarness(
        state.figma,
        hostBlueprintFixture(),
        createColorSystemCreateJournalRuntimeV2(
          createFigmaColorSystemCreateJournalHostV2(state.figma)
        )
      );
      const third = await createWithJournal(state, hostBlueprintFixture(), restarted);
      expect(third.receipt.status).toBe('verified-no-op');
      expect(state.document.commitUndoCount).toBe(1);
    });

    it('releases the verified journal for a different blueprint and keeps the first output intact', async () => {
      const state = harness();
      const first = await createWithJournal(state);
      expect(first.receipt.status).toBe('created');
      const ownedAfterFirst = state.document.teulOwnedResources();

      const secondBlueprint = hostBlueprintFixture({ outputName: 'Example Color System II' });
      const second = await createWithJournal(
        state,
        secondBlueprint,
        hostJournalHarness(state.figma, secondBlueprint),
        createColorSystemFigmaRendererHostV2(state.figma, HOST_FIXTURE_FILE_HASH)
      );
      expect(second.receipt.status).toBe('created');
      expect(state.document.commitUndoCount).toBe(2);
      for (const resource of ownedAfterFirst) {
        expect(state.document.teulOwnedResources().some(item => item.id === resource.id)).toBe(
          true
        );
      }
      expect(state.document.teulOwnedResources()).toHaveLength(HOST_FIXTURE_RESOURCE_TOTAL * 2);
      const persisted = second.journal.runtime.read();
      expect(persisted?.transactionId).toBe(second.journal.transactionId);
      expect(persisted?.state).toBe('verified');
      expect(state.journalKeys()).toHaveLength(HOST_FIXTURE_RESOURCE_TOTAL + 2);
    });

    it('rolls back a mid-create failure completely, leaving the source collection and journal keys clean', async () => {
      const state = harness({
        beforeCreate: (kind, ordinal) => {
          if (kind === 'component' && ordinal === 3) throw new Error('Injected component failure.');
        },
      });
      const { receipt } = await createWithJournal(state);

      expect(receipt).toMatchObject({
        status: 'rolled-back',
        failedPhase: 'components',
        message: expect.stringContaining('Injected component failure.'),
        unresolvedRefs: [],
      });
      if (receipt.status !== 'rolled-back') return;
      // 2 collections + 6 variables + 5 styles + 2 components were created before the failure.
      expect(receipt.createdCount).toBe(15);
      expect(receipt.removedCount).toBeGreaterThanOrEqual(15);
      expect(state.document.teulOwnedResources()).toEqual([]);
      expect(state.document.root.children.map(page => page.name)).toEqual([
        'Page 1',
        'Brand palette',
      ]);
      expect(state.document.snapshot()).toEqual(state.sourceSnapshot);
      expect(state.journalKeys()).toEqual([]);
      expect(state.document.commitUndoCount).toBe(0);
      expect(state.document.clientStorage.size).toBe(0);
    });

    it('removes a half-built component and its empty page when rendering fails inside the host', async () => {
      const state = harness({
        beforeCreate: (kind, ordinal) => {
          if (kind === 'rectangle' && ordinal === 1) throw new Error('Injected swatch failure.');
        },
      });
      const { receipt } = await createWithJournal(state);
      expect(receipt).toMatchObject({ status: 'rolled-back', failedPhase: 'components' });
      expect(state.document.teulOwnedResources()).toEqual([]);
      expect(state.document.root.children.map(page => page.name)).toEqual([
        'Page 1',
        'Brand palette',
      ]);
      expect(state.document.snapshot()).toEqual(state.sourceSnapshot);
      expect(state.journalKeys()).toEqual([]);
    });

    it('recovers an interrupted create from the persisted journal on the next run', async () => {
      let interrupt = true;
      const state = harness({
        beforeCreate: (kind, ordinal) => {
          if (interrupt && kind === 'frame' && ordinal === 2) {
            // Simulate the plugin dying: the thrown error never reaches the renderer's
            // rollback because we abandon this run entirely below.
            throw new Error('Plugin closed.');
          }
        },
      });
      const blueprint = hostBlueprintFixture();
      const journal = hostJournalHarness(state.figma, blueprint);
      const persistedRuntime = journal.runtime;
      let begun = false;
      await journal.runtime.reconcile(HOST_FIXTURE_FILE_HASH, {
        systemId: blueprint.output.systemId,
        resourceBlueprintHash: blueprint.resourceBlueprintHash,
        sectionBlueprintHash: blueprint.sectionBlueprintHash,
      });
      // Drive the host directly so the failure leaves resources and journal entries behind.
      let live = persistedRuntime.begin({
        ...journal.journal.input,
        transactionId: journal.transactionId,
        outputAction: 'create-new',
        outputName: blueprint.output.name,
        outputPageName: `${blueprint.output.name} — Color System`,
        counts: blueprint.counts,
      });
      begun = true;
      state.host.setCreatedResourceObserver?.(ref => {
        live = persistedRuntime.record(live, ref);
      });
      await state.host.loadFonts([{ family: 'Inter', style: 'Bold' }]);
      const primitives = await state.host.createCollection({
        recipe: blueprint.collections[0],
        name: blueprint.collections[0].name,
        metadata: ownership(journal.transactionId, 'collection/primitives', blueprint),
      });
      const primary = await state.host.createPrimitiveVariable({
        collectionId: primitives.ref.id,
        recipeId: HOST_FIXTURE_RECIPE_IDS.primary,
        name: HOST_FIXTURE_TOKEN_NAMES.primary,
        description: 'Exact Primary.',
        scopes: ['ALL_SCOPES'],
        values: [
          {
            modeName: 'Light',
            modeId: primitives.modeIds.Light,
            rgba: { r: 0.9, g: 0.95, b: 0.13, a: 1 },
          },
        ],
        metadata: ownership(journal.transactionId, HOST_FIXTURE_RECIPE_IDS.primary, blueprint),
      });
      await expect(
        state.host.createFrame({
          recipe: roleFrameRecipe('primary', 1, 'component/family/primary', primary.recipeId),
          name: 'Example Color System / primary',
          componentIds: [],
          systemVariableIds: [primary.id],
          geometry: roleFrameRecipe('primary', 1, 'component/family/primary', primary.recipeId)
            .presentationContent.frame,
          metadata: ownership(journal.transactionId, 'frame/primary', blueprint),
        })
      ).rejects.toThrow('Plugin closed.');
      state.host.setCreatedResourceObserver?.(null);
      expect(begun).toBe(true);
      // The host removed the half-built frame and the page it had just created
      // for it; the journal still names all three created resources.
      expect(
        state.document
          .teulOwnedResources()
          .map(resource => resource.kind)
          .sort()
      ).toEqual(['collection', 'variable']);
      expect(persistedRuntime.read()?.resources.map(ref => ref.kind)).toEqual([
        'collection',
        'variable',
        'page',
      ]);
      expect(state.journalKeys()).toHaveLength(3 + 2);

      // Next plugin run: a fresh host and journal runtime clean up, then create.
      interrupt = false;
      const restartedHost = createColorSystemFigmaRendererHostV2(
        state.figma,
        HOST_FIXTURE_FILE_HASH
      );
      const restarted = hostJournalHarness(
        state.figma,
        blueprint,
        createColorSystemCreateJournalRuntimeV2(
          createFigmaColorSystemCreateJournalHostV2(state.figma)
        )
      );
      const receipt = await renderColorSystemResourceBlueprintV2(
        restartedHost,
        blueprint,
        renderOptions({ transactionId: restarted.transactionId, journal: restarted.journal })
      );
      expect(receipt.status).toBe('created');
      expect(state.document.teulOwnedResources()).toHaveLength(HOST_FIXTURE_RESOURCE_TOTAL);
      expect(state.document.root.children.map(page => page.name)).toEqual([
        'Page 1',
        'Brand palette',
        'Example Color System — Color System',
      ]);
      expect(state.document.commitUndoCount).toBe(1);
    });

    it('blocks non-sRGB, non-Design, read-only, and capability-limited documents without any mutation', async () => {
      const cases: Array<[InMemoryFigmaOptions, string]> = [
        [{ documentColorProfile: 'DISPLAY_P3' }, 'UNSUPPORTED_PROFILE'],
        [{ documentColorProfile: 'throw' }, 'UNSUPPORTED_PROFILE'],
        [{ editorType: 'figjam' }, 'UNSUPPORTED_HOST'],
        [{ mode: 'inspect' }, 'READ_ONLY'],
        [{ omit: ['createVariableAlias'] }, 'CAPABILITY_MISSING'],
      ];
      for (const [options, code] of cases) {
        const state = harness(options);
        const { receipt } = await createWithJournal(state);
        expect(receipt).toMatchObject({ status: 'blocked', code, mutationCount: 0 });
        expect(state.document.createdCount).toBe(0);
        expect(state.document.teulOwnedResources()).toEqual([]);
        expect(state.journalKeys()).toEqual([]);
        expect(state.document.commitUndoCount).toBe(0);
        expect(state.document.snapshot()).toEqual(state.sourceSnapshot);
      }
    });

    it('cancels on a name collision with the existing document and blocks on a missing font', async () => {
      const colliding = harness();
      colliding.document.suppressCreateHooks = true;
      colliding.document.createCollection('Example Color System / Semantic applications');
      colliding.document.suppressCreateHooks = false;
      const collision = await createWithJournal(colliding);
      expect(collision.receipt).toMatchObject({ status: 'blocked', code: 'COLLISION_CANCELLED' });
      expect(colliding.document.createdCount).toBe(0);

      const pageCollision = harness();
      pageCollision.document.suppressCreateHooks = true;
      pageCollision.document.createPage('Example Color System — Color System');
      pageCollision.document.suppressCreateHooks = false;
      expect(
        await pageCollision.host.findNameCollisions(['Example Color System', 'Unrelated'])
      ).toEqual(['Example Color System']);

      const missingFont = harness({ fonts: [{ family: 'Inter', style: 'Regular' }] });
      const font = await createWithJournal(missingFont);
      expect(font.receipt).toMatchObject({ status: 'blocked', code: 'FONT_UNAVAILABLE' });
      expect(missingFont.document.createdCount).toBe(0);
    });
  });

  describe('host resource operations', () => {
    it('finds collisions across collections, styles, pages, and nested nodes', async () => {
      const state = harness();
      state.document.suppressCreateHooks = true;
      const style = state.document.createPaintStyle();
      style.name = 'Taken style';
      state.document.suppressCreateHooks = false;
      expect(
        await state.host.findNameCollisions([
          'Core colors',
          'Taken style',
          'Brand palette',
          'Primary/Brand swatch',
          'Free name',
        ])
      ).toEqual(['Brand palette', 'Core colors', 'Primary/Brand swatch', 'Taken style']);
    });

    it('loads each font once and falls back to the first loaded font for unknown roles', async () => {
      const state = harness({
        fonts: [
          { family: 'Inter', style: 'Bold' },
          { family: 'Inter', style: 'Regular' },
        ],
      });
      await state.host.loadFonts([
        { family: 'Inter', style: 'Bold' },
        { family: 'Inter', style: 'Bold' },
        { family: 'Inter', style: 'Regular' },
      ]);
      expect(state.document.loadedFonts).toEqual([
        { family: 'Inter', style: 'Bold' },
        { family: 'Inter', style: 'Regular' },
      ]);
      await expect(state.host.loadFonts([{ family: 'Missing', style: 'Bold' }])).rejects.toThrow(
        'unavailable'
      );
    });

    it('removes a Variable, Style, or collection it could not finish instead of leaving an orphan', async () => {
      const state = harness();
      const { primitives, variables } = await primeHostVariables(state.host);
      const before = state.document.teulOwnedResources().length;

      await expect(
        state.host.createPrimitiveVariable({
          collectionId: primitives.ref.id,
          recipeId: 'variable/bad-scope',
          name: 'Bad scope',
          description: '',
          scopes: ['NOT_A_SCOPE'],
          values: [
            {
              modeName: 'Light',
              modeId: primitives.modeIds.Light,
              rgba: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
          metadata: ownership('direct-tx', 'variable/bad-scope'),
        })
      ).rejects.toThrow('Unsupported Figma Variable scope');
      await expect(
        state.host.createPrimitiveVariable({
          collectionId: 'VariableCollectionId:missing',
          recipeId: 'variable/no-collection',
          name: 'No collection',
          description: '',
          scopes: [],
          values: [],
          metadata: ownership('direct-tx', 'variable/no-collection'),
        })
      ).rejects.toThrow('Unknown Variable collection');
      await expect(
        state.host.createAliasVariable({
          collectionId: primitives.ref.id,
          recipeId: 'variable/bad-alias',
          name: 'Bad alias',
          description: '',
          scopes: ['ALL_SCOPES'],
          aliases: [
            {
              modeName: 'Light',
              modeId: primitives.modeIds.Light,
              targetVariableId: 'VariableID:nope',
            },
          ],
          metadata: ownership('direct-tx', 'variable/bad-alias'),
        })
      ).rejects.toThrow('Unknown managed Variable');
      await expect(
        state.host.createPaintStyle({
          recipeId: 'style/unknown',
          name: 'Unknown',
          description: '',
          variableId: 'VariableID:nope',
          metadata: ownership('direct-tx', 'style/unknown'),
        })
      ).rejects.toThrow('Unknown managed Variable');
      await expect(
        state.host.createCollection({
          recipe: { ...hostBlueprintFixture().collections[0], modes: [] },
          name: 'Broken modes',
          metadata: ownership('direct-tx', 'collection/broken'),
        })
      ).resolves.toMatchObject({ modeIds: {} });

      expect(state.document.teulOwnedResources().length).toBe(before + 1);
      expect([...state.document.variables.values()].every(variable => !variable.removed)).toBe(
        true
      );
      expect(state.document.styles.size).toBe(0);
      const primary = variables.get(HOST_FIXTURE_RECIPE_IDS.primary);
      expect(primary).toBeDefined();
    });

    it('renders every component recipe branch with bound paints only', async () => {
      const state = harness();
      const { variables, semantics, primitives } = await primeHostVariables(state.host);
      const primary = variables.get(HOST_FIXTURE_RECIPE_IDS.primary)?.id ?? '';
      const secondary = variables.get(HOST_FIXTURE_RECIPE_IDS.secondary)?.id ?? '';
      const black = variables.get(HOST_FIXTURE_RECIPE_IDS.black)?.id ?? '';
      const alpha = variables.get(HOST_FIXTURE_RECIPE_IDS.alpha)?.id ?? '';
      // Near-white: its white-on-color contrast is below 1.2:1, so the host must
      // draw the monochrome inside boundary around it.
      const paper = await state.host.createPrimitiveVariable({
        collectionId: primitives.ref.id,
        recipeId: 'variable/primitive/preserved/paper',
        name: 'source/typography/paper',
        description: 'Near-white surface.',
        scopes: ['ALL_SCOPES'],
        values: [
          {
            modeName: 'Light',
            modeId: primitives.modeIds.Light,
            rgba: { r: 0.98, g: 0.98, b: 0.98, a: 1 },
          },
          {
            modeName: 'Dark',
            modeId: primitives.modeIds.Dark,
            rgba: { r: 0.98, g: 0.98, b: 0.98, a: 1 },
          },
        ],
        metadata: ownership('direct-tx', 'variable/primitive/preserved/paper'),
      });
      const accent = await state.host.createAliasVariable({
        collectionId: semantics.ref.id,
        recipeId: HOST_FIXTURE_RECIPE_IDS.accent,
        name: HOST_FIXTURE_TOKEN_NAMES.accent,
        description: 'Product accent.',
        scopes: ['ALL_SCOPES'],
        aliases: [
          { modeName: 'Light', modeId: semantics.modeIds.Light, targetVariableId: secondary },
          { modeName: 'Dark', modeId: semantics.modeIds.Dark, targetVariableId: secondary },
        ],
        metadata: ownership('direct-tx', HOST_FIXTURE_RECIPE_IDS.accent),
      });
      const requests = [
        componentRequest(
          'Blue family',
          'secondary-family',
          [
            { purpose: 'step-1', mode: 'Light', variableId: secondary },
            { purpose: 'step-2', mode: 'Light', variableId: accent.id },
            { purpose: 'step-1', mode: 'Dark', variableId: secondary },
          ],
          { brandFit: { prominence: 'Supporting' } }
        ),
        ...(['functional-iconography', 'product-ui-surface', 'product-graphic'] as const).map(
          (job, index) =>
            graphicRequest(['Icon specimen', 'Surface specimen', 'Button specimen'][index], job, [
              {
                useId: 'outer',
                variableId: paper.id,
                recipeId: 'variable/primitive/preserved/paper',
              },
              {
                useId: 'card',
                variableId: paper.id,
                recipeId: 'variable/primitive/preserved/paper',
              },
              {
                useId: 'selected',
                variableId: [alpha, primary, black][index],
                recipeId: [
                  HOST_FIXTURE_RECIPE_IDS.alpha,
                  HOST_FIXTURE_RECIPE_IDS.primary,
                  HOST_FIXTURE_RECIPE_IDS.black,
                ][index],
              },
            ])
        ),
        componentRequest(
          'Sequential ramp',
          'data-visualization',
          [
            { purpose: 'surface', mode: 'Light', variableId: black },
            { purpose: 'mark-1', mode: 'Light', variableId: secondary },
            { purpose: 'mark-2', mode: 'Light', variableId: accent.id },
          ],
          {
            kind: 'sequential',
            endpointLabels: ['Low', 'High'],
            marks: [
              { order: 1, label: 'First' },
              { order: 2, label: 'Second' },
            ],
            nonColorCue: 'axis-and-endpoint-labels',
          }
        ),
        componentRequest(
          'Diverging scale',
          'data-visualization',
          [
            { purpose: 'mark-1', mode: 'Light', variableId: secondary },
            { purpose: 'mark-2', mode: 'Light', variableId: black },
            { purpose: 'mark-3', mode: 'Light', variableId: primary },
          ],
          {
            kind: 'diverging',
            marks: [
              { order: 1, label: 'Negative' },
              { order: 2, label: 'Zero' },
              { order: 3, label: 'Positive' },
            ],
            midpointOrder: 2,
            nonColorCue: 'zero-line-and-sign-labels',
          }
        ),
        componentRequest(
          'Categorical set',
          'data-visualization',
          [
            { purpose: 'boundary', mode: 'Light', variableId: black },
            { purpose: 'mark-1', mode: 'Light', variableId: secondary },
            { purpose: 'mark-2', mode: 'Light', variableId: primary },
            { purpose: 'mark-3', mode: 'Light', variableId: accent.id },
          ],
          {
            kind: 'categorical',
            marks: [
              { order: 1, label: 'Category 1' },
              { order: 2, label: 'Category 2' },
              { order: 3, label: 'Category 3' },
            ],
            adjacency: 'touching',
          }
        ),
        componentRequest(
          'Heading specimen',
          'typography',
          [
            { purpose: 'foreground', mode: 'Light', variableId: black },
            { purpose: 'background', mode: 'Light', variableId: primary },
          ],
          { specimen: { mode: 'Light' }, pairEvidence: [{ ratio: 17.42 }] }
        ),
        componentRequest('Body specimen', 'typography', [
          { purpose: 'foreground', mode: 'Dark', variableId: black },
          { purpose: 'background', mode: 'Dark', variableId: paper.id },
        ]),
        componentRequest('Half pair', 'typography', [
          { purpose: 'foreground', mode: 'Light', variableId: black },
        ]),
      ];
      const refs: ColorSystemHostResourceRefV2[] = [];
      for (const request of requests) refs.push(await state.host.createComponent(request));

      const page = state.document.root.children[2];
      expect(page.name).toBe('Example Color System — Color System');
      expect(page.children.filter(node => node.type === 'COMPONENT')).toHaveLength(requests.length);
      const inventory = await state.host.inspectCreatedSystem({ transactionId: 'direct-tx', refs });
      expect(inventory.counts.components).toBe(requests.length);
      expect(inventory.hiddenLiteralPaintCount).toBe(0);
      expect(inventory.boundaryViolationCount).toBe(0);
      expect(inventory.unresolvedAliasCount).toBe(0);
      const heading = state.document.nodes.get(refs[7].id) as FakeNode;
      expect(heading.strokes).toHaveLength(0);
      expect(heading.findAll(node => node.type === 'TEXT').some(node => node.fontSize === 56)).toBe(
        true
      );
      expect(
        heading
          .findAll(node => node.type === 'TEXT')
          .some(node => node.characters.includes('17.42:1'))
      ).toBe(true);
      const paperBody = state.document.nodes.get(refs[8].id) as FakeNode;
      expect(paperBody.strokes).toHaveLength(1);
      expect(paperBody.strokeWeight).toBe(1);
      expect(paperBody.strokeAlign).toBe('INSIDE');
      expect((paperBody.fills[0] as SolidPaint).boundVariables?.color?.id).toBe(paper.id);
    });

    it.each(['product-graphic', 'functional-iconography', 'product-ui-surface'] as const)(
      'delivers the same declared %s geometry after a display rename and binding reordering',
      async job => {
        const { figma, document } = createInMemoryAuthoredFigmaPluginApiV1({
          fonts: [{ family: 'Inter', style: 'Bold' }],
        });
        const host = createColorSystemFigmaRendererHostV2(figma, HOST_FIXTURE_FILE_HASH);
        const { variables, primitives } = await primeHostVariables(host);
        const paints = [
          { useId: 'outer', recipeId: HOST_FIXTURE_RECIPE_IDS.primary },
          { useId: 'card', recipeId: HOST_FIXTURE_RECIPE_IDS.secondary },
          { useId: 'selected', recipeId: HOST_FIXTURE_RECIPE_IDS.alpha },
          { useId: 'label', recipeId: HOST_FIXTURE_RECIPE_IDS.black },
        ].map(paint => ({ ...paint, variableId: variables.get(paint.recipeId)!.id }));
        const first = graphicRequest('Surface icon: misleading display name', job, paints, true);
        const renamed = graphicRequest('Completely renamed', job, paints, true);
        renamed.paintBindings = [...renamed.paintBindings].reverse();
        const refs = [await host.createComponent(first), await host.createComponent(renamed)];
        const boards = refs.map(
          ref =>
            document.nodes
              .get(ref.id)!
              .findAll(node => !!node.getPluginData('teul:graphic:contextId'))[0]
        );
        const plan = graphicRenderingFixture(job, true);
        const expected = plan.nodes.map(node => ({
          id: node.id,
          parentId: node.parentId ?? '',
          useId: node.useId,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          path: node.path,
          variableId: paints.find(paint => paint.useId === node.useId)!.variableId,
        }));
        for (const board of boards) {
          expect(board.width).toBe(plan.width);
          expect(board.height).toBe(plan.height);
          expect(board.fills).toEqual([]);
          expect(board.getPluginData('teul:graphic:layoutHash')).toBe(plan.layoutHash);
          expect(board.getPluginData('teul:graphic:requirementsHash')).toBe(plan.requirementsHash);
          expect(JSON.parse(board.getPluginData('teul:graphic:pairs'))).toEqual(plan.pairs);
          expect(
            board.children.map(node => ({
              id: node.getPluginData('teul:graphic:nodeId'),
              parentId: node.getPluginData('teul:graphic:parentId'),
              useId: node.getPluginData('teul:graphic:useId'),
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
              path:
                node.type === 'VECTOR'
                  ? (node as AuthoredNativeMockNodeV1).vectorPaths[0].data
                  : null,
              variableId: (node.fills[0] as SolidPaint).boundVariables?.color?.id,
            }))
          ).toEqual(expected);
          for (const node of board.children) {
            const paint = node.fills[0] as SolidPaint;
            const exact = resolveVariableColor(document, paint.boundVariables!.color!.id, 'Light');
            expect(paint.color).toEqual({ r: exact.r, g: exact.g, b: exact.b });
            expect(paint.opacity ?? 1).toBe(exact.a);
            expect(node.opacity).toBe(1);
            expect(node.strokes).toEqual([]);
            expect(node.explicitVariableModes[primitives.ref.id]).toBe(primitives.modeIds.Light);
            expect(node.getPluginData(KEYS.paintClassification)).toBe('system-bound');
          }
          expect(board.children[2].fills[0]).toMatchObject({ opacity: 0.4 });
          expect(board.children[3].name).toBe('Continue');
          expect(board.children[3].getPluginData('teul:graphic:role')).toBe('label');
        }
        const inventory = await host.inspectCreatedSystem({ transactionId: 'direct-tx', refs });
        expect(inventory.hiddenLiteralPaintCount).toBe(0);
        expect(inventory.boundaryViolationCount).toBe(0);
      }
    );

    it.each([
      'missing',
      'extra',
      'duplicate',
      'reversed',
      'wrong-mode',
      'missing-plan',
      'changed-geometry',
    ] as const)('rejects %s graphic delivery before creating any document node', async mutation => {
      const state = harness();
      const { variables } = await primeHostVariables(state.host);
      const paints = [
        { useId: 'outer', recipeId: HOST_FIXTURE_RECIPE_IDS.primary },
        { useId: 'card', recipeId: HOST_FIXTURE_RECIPE_IDS.secondary },
        { useId: 'selected', recipeId: HOST_FIXTURE_RECIPE_IDS.alpha },
      ].map(paint => ({ ...paint, variableId: variables.get(paint.recipeId)!.id }));
      const request = graphicRequest('Surface', 'product-ui-surface', paints);
      const bindings = request.paintBindings.map(binding => ({ ...binding }));
      if (mutation === 'missing') bindings.pop();
      if (mutation === 'extra') bindings.push({ ...bindings[0], purpose: 'use:undeclared' });
      if (mutation === 'duplicate') bindings[1].purpose = bindings[0].purpose;
      if (mutation === 'reversed')
        [bindings[0].variableId, bindings[2].variableId] = [
          bindings[2].variableId,
          bindings[0].variableId,
        ];
      if (mutation === 'wrong-mode') bindings[0].mode = 'Dark';
      if (mutation === 'missing-plan')
        request.recipe.content = { job: 'product-ui-surface', mode: 'Light' };
      if (mutation === 'changed-geometry')
        request.recipe.content = {
          job: 'product-ui-surface',
          mode: 'Light',
          rendering: { ...graphicRenderingFixture('product-ui-surface'), width: 241 },
        };
      request.paintBindings = bindings;
      const before = state.document.snapshot();
      await expect(state.host.createComponent(request)).rejects.toThrow(/Product graphics/);
      expect(state.document.snapshot()).toEqual(before);
    });

    it.each(['categorical', 'sequential', 'diverging'] as const)(
      'binds a nearby %s legend to exact ordered mark variables and modes from recipe content',
      async kind => {
        const state = harness();
        const { variables, primitives } = await primeHostVariables(state.host);
        const variableIds = [
          HOST_FIXTURE_RECIPE_IDS.secondary,
          HOST_FIXTURE_RECIPE_IDS.primary,
          HOST_FIXTURE_RECIPE_IDS.alpha,
        ].map(id => variables.get(id)!.id);
        const marks = [
          { order: 1, label: 'Recorded first' },
          { order: 2, label: 'Recorded midpoint' },
          { order: 3, label: 'Recorded last' },
        ];
        const bindings = variableIds.map((variableId, index) => ({
          purpose: `mark-${index + 1}`,
          variableId,
          mode: index === 1 ? 'Dark' : 'Light',
        }));
        const ref = await state.host.createComponent(
          componentRequest(
            'Recorded chart',
            'data-visualization',
            [
              { purpose: 'surface', mode: 'Light', variableId: variableIds[1] },
              ...[...bindings].reverse(),
            ],
            { kind, marks, midpointOrder: 2, endpointLabels: ['First', 'Last'] }
          )
        );
        const component = state.document.nodes.get(ref.id)!;
        const swatches = component.findAll(node => node.name.startsWith('Legend / '));
        const labels = component.findAll(node => node.name.startsWith('Legend label / '));
        expect(swatches.map(node => node.name)).toEqual(
          marks.map(mark => `Legend / ${mark.order} / ${mark.label}`)
        );
        expect(labels.map(node => node.characters)).toEqual(marks.map(mark => mark.label));
        const plotSwatches = component.findAll(
          node =>
            node.getPluginData(KEYS.sceneRole) === 'color-swatch' &&
            !node.name.startsWith('Legend / ')
        );
        expect(plotSwatches).toHaveLength(marks.length);
        expect(component.findAll(node => node.characters === 'Legend')).toHaveLength(1);
        for (const [index, swatch] of swatches.entries()) {
          expect(swatch.fills).toEqual(plotSwatches[index].fills);
          expect((swatch.fills[0] as SolidPaint).boundVariables?.color?.id).toBe(
            variableIds[index]
          );
          expect(swatch.explicitVariableModes[primitives.ref.id]).toBe(
            primitives.modeIds[bindings[index].mode]
          );
          expect(swatch.y).toBeGreaterThan(900);
          expect(labels[index].y).toBe(swatch.y);
          expect(labels[index].x).toBe(swatch.x + 36);
          expect(labels[index].y + labels[index].height).toBeLessThan(component.height);
        }
        expect(resolveVariableColor(state.document, variableIds[2], 'Light').a).toBe(0.4);
        const inventory = await state.host.inspectCreatedSystem({
          transactionId: 'direct-tx',
          refs: [ref],
        });
        expect(inventory.hiddenLiteralPaintCount).toBe(0);
        expect(inventory.boundaryViolationCount).toBe(0);
      }
    );

    it.each([
      'absent marks',
      'empty marks',
      'missing label',
      'missing order',
      'missing paint',
      'duplicate paint',
      'malformed purpose',
      'missing kind',
    ])('rejects %s rather than creating an incomplete chart or invented legend', async invalid => {
      const state = harness();
      const { variables } = await primeHostVariables(state.host);
      const variableId = variables.get(HOST_FIXTURE_RECIPE_IDS.secondary)!.id;
      const request = componentRequest(
        'Invalid chart',
        'data-visualization',
        [
          { purpose: 'mark-1', variableId, mode: 'Light' },
          { purpose: 'mark-2', variableId, mode: 'Light' },
        ],
        {
          kind: 'categorical',
          marks: [
            { order: 1, label: 'First' },
            { order: 2, label: 'Second' },
          ],
        }
      );
      const content = request.recipe.content as Record<string, unknown>;
      const marks = content.marks as Record<string, unknown>[];
      if (invalid === 'absent marks') delete content.marks;
      if (invalid === 'empty marks') content.marks = [];
      if (invalid === 'missing label') delete marks[1].label;
      if (invalid === 'missing order') delete marks[1].order;
      if (invalid === 'missing paint') request.paintBindings = request.paintBindings.slice(0, 1);
      if (invalid === 'duplicate paint') request.paintBindings[1].purpose = 'mark-1';
      if (invalid === 'malformed purpose') request.paintBindings[1].purpose = 'mark-02';
      if (invalid === 'missing kind') delete content.kind;
      const before = state.document.snapshot();
      await expect(state.host.createComponent(request)).rejects.toThrow(
        /Chart legend|normalized chart kind/
      );
      expect(state.document.snapshot()).toEqual(before);
    });

    it('detects hidden literal paints, boundary violations, and foreign ownership during inspection', async () => {
      const state = harness();
      const { variables } = await primeHostVariables(state.host);
      const secondary = variables.get(HOST_FIXTURE_RECIPE_IDS.secondary)?.id ?? '';
      const ref = await state.host.createComponent(
        componentRequest('Tampered family', 'primary-family', [
          { purpose: 'step-1', mode: 'Light', variableId: secondary },
          { purpose: 'step-2', mode: 'Dark', variableId: secondary },
        ])
      );
      const node = state.document.nodes.get(ref.id) as FakeNode;
      const swatches = node.findAll(
        child => child.getPluginData(KEYS.sceneRole) === 'color-swatch'
      );
      expect(swatches.length).toBe(2);
      swatches[0].fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];
      // A colored outline on a swatch breaks the monochrome inside-boundary rule.
      swatches[1].strokes = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];
      const label = node.findAll(child => child.type === 'TEXT')[0];
      label.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.6 } }];
      const stray = state.document.createNode('RECTANGLE', 'rectangle');
      stray.fills = [{ type: 'SOLID', color: { r: 0, g: 1, b: 0 } }];
      node.appendChild(stray);

      const inventory = await state.host.inspectCreatedSystem({
        transactionId: 'direct-tx',
        refs: [ref],
      });
      expect(inventory.hiddenLiteralPaintCount).toBe(3);
      expect(inventory.boundaryViolationCount).toBe(1);

      await expect(
        state.host.inspectCreatedSystem({ transactionId: 'other-tx', refs: [ref] })
      ).rejects.toThrow('not owned by this transaction');
      await expect(
        state.host.inspectCreatedSystem({
          transactionId: 'direct-tx',
          refs: [{ id: 'missing', kind: 'component', recipeId: 'component/missing' }],
        })
      ).rejects.toThrow('unavailable');
    });

    it('refuses to reveal anything but the five created frames on the created page', async () => {
      const state = harness();
      const { blueprint, variables } = await primeHostVariables(state.host);
      const primary = variables.get(
        HOST_FIXTURE_RECIPE_IDS.primary
      ) as ColorSystemHostResourceRefV2;
      await expect(
        state.host.revealCreatedSystem({ transactionId: 'direct-tx', frameRefs: [] })
      ).rejects.toThrow('Exactly five');
      const fakeRefs = Array.from({ length: 5 }, (_, index) => ({
        id: `missing-${index}`,
        kind: 'frame' as const,
        recipeId: `frame/${index}`,
      }));
      await expect(
        state.host.revealCreatedSystem({ transactionId: 'direct-tx', frameRefs: fakeRefs })
      ).rejects.toThrow('page is unavailable');

      const frameRefs: ColorSystemHostResourceRefV2[] = [];
      for (const [index, role] of (
        ['primary', 'secondary', 'product-graphics', 'data-visualization', 'typography'] as const
      ).entries()) {
        const recipe = roleFrameRecipe(role, index + 1, 'component/none', primary.recipeId);
        frameRefs.push(
          await state.host.createFrame({
            recipe,
            name: `${blueprint.output.name} / ${role}`,
            componentIds: [],
            systemVariableIds: [primary.id],
            geometry: recipe.presentationContent.frame,
            metadata: ownership('direct-tx', recipe.recipeId),
          })
        );
      }
      await expect(
        state.host.revealCreatedSystem({ transactionId: 'other-tx', frameRefs })
      ).rejects.toThrow('unavailable for reveal');
      await expect(
        state.host.revealCreatedSystem({
          transactionId: 'direct-tx',
          frameRefs: [frameRefs[0], frameRefs[0], frameRefs[1], frameRefs[2], frameRefs[3]],
        })
      ).rejects.toThrow('duplicated');
      await state.host.revealCreatedSystem({ transactionId: 'direct-tx', frameRefs });
      expect(state.document.revealedNodeIds).toEqual([frameRefs.map(ref => ref.id)]);
      expect(state.document.currentPage.name).toBe('Example Color System — Color System');

      // A frame whose component reference is unknown is removed again.
      const broken = roleFrameRecipe('secondary', 2, 'component/none', primary.recipeId);
      await expect(
        state.host.createFrame({
          recipe: broken,
          name: 'broken',
          componentIds: ['missing-component'],
          systemVariableIds: [primary.id],
          geometry: broken.presentationContent.frame,
          metadata: ownership('direct-tx', 'frame/broken'),
        })
      ).rejects.toThrow('Unknown component');
      expect(
        state.document.root.children[2].children.filter(node => node.name === 'broken')
      ).toEqual([]);

      // Removing unknown refs is a no-op; removing the last frame keeps the page while components remain.
      await state.host.removeResource({ id: 'nothing', kind: 'frame', recipeId: 'frame/nothing' });
      for (const ref of frameRefs) await state.host.removeResource(ref);
      expect(state.document.root.children.map(page => page.name)).toEqual([
        'Page 1',
        'Brand palette',
      ]);
    });
  });

  // p4-DE: owner-supplied spot colors reach the Variable descriptions through the host adapter.
  describe('owner-supplied spot colors', () => {
    const spot = { system: 'pantone' as const, name: 'Test spot 01', finish: 'coated' as const };

    /** The brand family's anchor derives from the locked Primary, as a derived family does. */
    function blueprintWithAnchorFromPrimary() {
      const base = hostBlueprintFixture();
      const primitives = base.collections[0].variables.map(variable =>
        variable.recipeId === HOST_FIXTURE_RECIPE_IDS.secondary &&
        variable.origin.kind === 'approved-secondary'
          ? {
              ...variable,
              origin: {
                ...variable.origin,
                provenance: { ...variable.origin.provenance, sourceColorIds: ['primary-solar'] },
              },
            }
          : variable
      );
      return rehashHostBlueprint({
        ...base,
        collections: [{ ...base.collections[0], variables: primitives }, base.collections[1]],
      });
    }

    it('appends the owner’s sentence to the anchor step and its exact source token, and counts what it wrote', async () => {
      const state = harness();
      const receipt = await renderColorSystemResourceBlueprintV2(
        state.host,
        blueprintWithAnchorFromPrimary(),
        renderOptions({
          ownerSpotColors: { suppliedOn: '2026-09-08', byFamilyId: { 'family-blue': spot } },
        })
      );
      if (receipt.status !== 'created') throw new Error(`Unexpected status ${receipt.status}.`);
      expect(receipt.spotDescriptionsWritten).toBe(2);

      const sentence = colorSystemSpotDescriptionV2(spot, '2026-09-08');
      expect(sentence).toBe('Spot: Pantone Test spot 01, coated (owner-supplied, 2026-09-08)');
      const descriptions = new Map(
        receipt.createdRefs
          .filter(ref => ref.kind === 'variable')
          .map(ref => [ref.recipeId, state.document.variables.get(ref.id)?.description])
      );
      // The anchor (color/blue/base) and the Primary it derives from (source/solar) carry it…
      expect(descriptions.get(HOST_FIXTURE_RECIPE_IDS.secondary)).toBe(
        `Approved Secondary.\n${sentence}`
      );
      expect(descriptions.get(HOST_FIXTURE_RECIPE_IDS.primary)).toBe(`Exact Primary.\n${sentence}`);
      // …and nothing else does: another source, the alpha derivation, the aliases.
      expect(descriptions.get(HOST_FIXTURE_RECIPE_IDS.black)).toBe('Exact source black.');
      expect(descriptions.get(HOST_FIXTURE_RECIPE_IDS.alpha)).toBe('Explicit alpha derivation.');
      expect(descriptions.get(HOST_FIXTURE_RECIPE_IDS.accent)).toBe('Product accent.');
      expect(descriptions.get(HOST_FIXTURE_RECIPE_IDS.text)).toBe('Text foreground.');
      // Names and values are untouched by the description.
      expect(
        state.document.variables.get(
          receipt.createdRefs.find(ref => ref.recipeId === HOST_FIXTURE_RECIPE_IDS.secondary)!.id
        )?.name
      ).toBe(HOST_FIXTURE_TOKEN_NAMES.secondary);
    });

    it('prints “other” systems verbatim and omits an unstated finish', async () => {
      const state = harness();
      const receipt = await renderColorSystemResourceBlueprintV2(
        state.host,
        hostBlueprintFixture(),
        renderOptions({
          ownerSpotColors: {
            suppliedOn: '2026-09-08',
            byFamilyId: {
              'family-blue': { system: 'other', name: 'House Blue 4', finish: 'none' },
            },
          },
        })
      );
      if (receipt.status !== 'created') throw new Error(`Unexpected status ${receipt.status}.`);
      // The fixture's anchor derives from a source that is not a preserved token, so only the anchor is written.
      expect(receipt.spotDescriptionsWritten).toBe(1);
      const anchor = receipt.createdRefs.find(
        ref => ref.recipeId === HOST_FIXTURE_RECIPE_IDS.secondary
      );
      expect(state.document.variables.get(anchor!.id)?.description).toBe(
        'Approved Secondary.\nSpot: House Blue 4 (owner-supplied, 2026-09-08)'
      );
    });

    it('leaves receipts without spot colors unchanged and blocks malformed or unknown entries before any mutation', async () => {
      const plain = harness();
      const receipt = await renderColorSystemResourceBlueprintV2(
        plain.host,
        hostBlueprintFixture(),
        renderOptions()
      );
      if (receipt.status !== 'created') throw new Error(`Unexpected status ${receipt.status}.`);
      expect('spotDescriptionsWritten' in receipt).toBe(false);

      const state = harness();
      const attempts: ColorSystemRendererOwnerSpotColorsV2[] = [
        { suppliedOn: '2026-09-08', byFamilyId: { 'family-unknown': spot } },
        { suppliedOn: '2026-09-08', byFamilyId: { 'family-blue': { ...spot, name: ' padded ' } } },
        { suppliedOn: '2026-09-08', byFamilyId: { 'family-blue': { ...spot, name: '' } } },
        {
          suppliedOn: '2026-09-08',
          byFamilyId: { 'family-blue': { ...spot, name: 'x'.repeat(41) } },
        },
        { suppliedOn: '2026-09-08T00:00:00.000Z', byFamilyId: { 'family-blue': spot } },
      ];
      for (const ownerSpotColors of attempts) {
        const blocked = await renderColorSystemResourceBlueprintV2(
          state.host,
          hostBlueprintFixture(),
          renderOptions({ ownerSpotColors })
        );
        expect(blocked).toMatchObject({
          status: 'blocked',
          code: 'INVALID_SPOT_COLOR',
          mutationCount: 0,
        });
      }
      expect(state.document.snapshot()).toEqual(state.sourceSnapshot);
    });
  });
});
