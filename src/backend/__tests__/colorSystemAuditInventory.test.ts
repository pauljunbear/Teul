import { describe, expect, it, vi } from 'vitest';
import {
  extractStructuredSourceColorSections,
  inventoryFigmaColorSystem,
  materializeObservedLiteralSourceCandidates,
  materializeStructuredSourceCandidates,
  MAX_OBSERVED_LITERAL_SOURCE_CANDIDATES,
  MAX_FIGMA_VARIABLE_ALIAS_DEPTH,
  type ColorSystemAuditProgress,
  type FigmaColorInventoryHost,
  type FigmaColorInventoryOptions,
} from '../colorSystemAuditInventory';
import { auditColorSystem, createSourceSystemSnapshot } from '../../lib/colorSystemAudit';
import type {
  SourceColorSection,
  SourceColorToken,
  SourceColorUsage,
  SourceColorValue,
} from '../../types/colorSystemAudit';

const CAPTURED_AT = '2026-08-02T12:00:00.000Z';
const mixedPaint = Symbol('mixed-paint');

function withPluginData<T extends object>(
  resource: T,
  entries: Readonly<Record<string, string>>
): T {
  return Object.assign(resource, {
    getPluginData: vi.fn((key: string) => entries[key] ?? ''),
    setPluginData: vi.fn(),
  });
}

function solid(
  components: readonly [number, number, number],
  extras: Partial<SolidPaint> = {}
): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: components[0], g: components[1], b: components[2] },
    ...extras,
  };
}

function gradient(): GradientPaint {
  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    gradientStops: [
      { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
      { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
    ],
  };
}

function imagePaint(): ImagePaint {
  return {
    type: 'IMAGE',
    scaleMode: 'FILL',
    imageHash: 'image-hash',
  };
}

interface TestSceneNodeOptions {
  id: string;
  name?: string;
  type?: SceneNode['type'];
  fills?: readonly Paint[] | PluginAPI['mixed'];
  strokes?: readonly Paint[] | PluginAPI['mixed'];
  fillStyleId?: string | PluginAPI['mixed'];
  strokeStyleId?: string | PluginAPI['mixed'];
  opacity?: number;
  blendMode?: BlendMode;
  resolvedVariableModes?: Readonly<Record<string, string>>;
  children?: readonly SceneNode[];
  characters?: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
}

function sceneNode(options: TestSceneNodeOptions): SceneNode {
  const mutationSpies = {
    remove: vi.fn(),
    setPluginData: vi.fn(),
    setSharedPluginData: vi.fn(),
  };
  const node = {
    id: options.id,
    name: options.name ?? options.id,
    type: options.type ?? (options.children ? 'FRAME' : 'RECTANGLE'),
    fills: options.fills ?? [],
    strokes: options.strokes ?? [],
    fillStyleId: options.fillStyleId ?? '',
    strokeStyleId: options.strokeStyleId ?? '',
    opacity: options.opacity ?? 1,
    blendMode: options.blendMode ?? 'NORMAL',
    ...(options.resolvedVariableModes
      ? { resolvedVariableModes: { ...options.resolvedVariableModes } }
      : {}),
    visible: true,
    parent: null,
    ...(options.children ? { children: [...options.children] } : {}),
    ...(options.characters !== undefined ? { characters: options.characters } : {}),
    ...(options.absoluteBoundingBox
      ? { absoluteBoundingBox: { ...options.absoluteBoundingBox } }
      : {}),
    ...mutationSpies,
  } as unknown as SceneNode;
  for (const child of options.children ?? []) {
    Object.assign(child, { parent: node });
  }
  return node;
}

function page(id: string, name: string, children: readonly SceneNode[]): PageNode {
  const result = {
    id,
    name,
    type: 'PAGE',
    children: [...children],
    selection: [] as SceneNode[],
    parent: null,
    appendChild: vi.fn(),
    setPluginData: vi.fn(),
  } as unknown as PageNode;
  for (const child of children) Object.assign(child, { parent: result });
  return result;
}

function collection(
  id = 'collection-local',
  modes: readonly { modeId: string; name: string }[] = [{ modeId: 'mode-light', name: 'Light' }]
): VariableCollection {
  return {
    id,
    name: 'Local colors',
    modes: [...modes],
  } as unknown as VariableCollection;
}

function colorVariable(input: {
  id: string;
  name?: string;
  collectionId?: string;
  valuesByMode: Variable['valuesByMode'];
  description?: string;
}): Variable {
  return {
    id: input.id,
    key: `key-${input.id}`,
    name: input.name ?? input.id,
    description: input.description ?? '',
    resolvedType: 'COLOR',
    variableCollectionId: input.collectionId ?? 'collection-local',
    valuesByMode: input.valuesByMode,
  } as unknown as Variable;
}

function paintStyle(id: string, name: string, paints: readonly Paint[]): PaintStyle {
  return {
    id,
    key: `key-${id}`,
    name,
    paints: [...paints],
    description: '',
  } as unknown as PaintStyle;
}

interface HostFixture {
  host: FigmaColorInventoryHost;
  spies: {
    getLocalVariablesAsync: ReturnType<typeof vi.fn>;
    getLocalVariableCollectionsAsync: ReturnType<typeof vi.fn>;
    getVariableByIdAsync: ReturnType<typeof vi.fn>;
    getLocalPaintStylesAsync: ReturnType<typeof vi.fn>;
    getNodeByIdAsync: ReturnType<typeof vi.fn>;
    loadAllPagesAsync: ReturnType<typeof vi.fn>;
    getAvailableLibraryVariableCollectionsAsync: ReturnType<typeof vi.fn>;
    getVariablesInLibraryCollectionAsync: ReturnType<typeof vi.fn>;
    mutationCalls: ReturnType<typeof vi.fn>[];
  };
}

function hostFixture(input: {
  pages: readonly PageNode[];
  currentPage?: PageNode;
  variables?: readonly Variable[];
  collections?: readonly VariableCollection[];
  styles?: readonly PaintStyle[];
  libraryCollections?: readonly LibraryVariableCollection[];
  libraryVariablesByCollection?: Readonly<Record<string, readonly LibraryVariable[]>>;
  libraryError?: Error;
  includeTeamLibrary?: boolean;
}): HostFixture {
  const rootAppendChild = vi.fn();
  const rootSetPluginData = vi.fn();
  const root = {
    id: 'document',
    name: 'Test document',
    type: 'DOCUMENT',
    children: [...input.pages],
    appendChild: rootAppendChild,
    setPluginData: rootSetPluginData,
  } as unknown as DocumentNode;
  for (const currentPage of input.pages) Object.assign(currentPage, { parent: root });

  const variables = [...(input.variables ?? [])];
  const getLocalVariablesAsync = vi.fn(async () => variables);
  const getLocalVariableCollectionsAsync = vi.fn(async () => [...(input.collections ?? [])]);
  const getVariableByIdAsync = vi.fn(async (id: string) => {
    return variables.find(variable => variable.id === id) ?? null;
  });
  const createVariable = vi.fn();
  const createVariableCollection = vi.fn();
  const importVariableByKeyAsync = vi.fn();
  const variablesApi = {
    getLocalVariablesAsync,
    getLocalVariableCollectionsAsync,
    getVariableByIdAsync,
    createVariable,
    createVariableCollection,
    importVariableByKeyAsync,
  };

  const getLocalPaintStylesAsync = vi.fn(async () => [...(input.styles ?? [])]);
  const getNodeByIdAsync = vi.fn(async (id: string) => (id === root.id ? root : null));
  const loadAllPagesAsync = vi.fn(async () => undefined);
  const createPaintStyle = vi.fn();
  const getAvailableLibraryVariableCollectionsAsync = vi.fn(async () => {
    if (input.libraryError) throw input.libraryError;
    return [...(input.libraryCollections ?? [])];
  });
  const getVariablesInLibraryCollectionAsync = vi.fn(async (key: string) => [
    ...(input.libraryVariablesByCollection?.[key] ?? []),
  ]);
  const teamLibrary = {
    getAvailableLibraryVariableCollectionsAsync,
    getVariablesInLibraryCollectionAsync,
  };

  return {
    host: {
      root,
      currentPage: input.currentPage ?? input.pages[0],
      variables: variablesApi,
      ...(input.includeTeamLibrary === false ? {} : { teamLibrary }),
      getLocalPaintStylesAsync,
      getNodeByIdAsync,
      loadAllPagesAsync,
      createPaintStyle,
    } as unknown as FigmaColorInventoryHost,
    spies: {
      getLocalVariablesAsync,
      getLocalVariableCollectionsAsync,
      getVariableByIdAsync,
      getLocalPaintStylesAsync,
      getNodeByIdAsync,
      loadAllPagesAsync,
      getAvailableLibraryVariableCollectionsAsync,
      getVariablesInLibraryCollectionAsync,
      mutationCalls: [
        rootAppendChild,
        rootSetPluginData,
        createVariable,
        createVariableCollection,
        importVariableByKeyAsync,
        createPaintStyle,
      ],
    },
  };
}

function auditOptions(
  overrides: Partial<FigmaColorInventoryOptions> = {}
): FigmaColorInventoryOptions {
  return {
    usageScope: 'selection',
    documentProfile: 'srgb',
    sourceLocator: 'figma://test-document',
    authorization: { status: 'user-authorized' },
    includeEnabledLibraryDescriptors: false,
    confirmWholeFile: false,
    capturedAt: CAPTURED_AT,
    ...overrides,
  };
}

function usageHexes(result: Awaited<ReturnType<typeof inventoryFigmaColorSystem>>): string[] {
  return result.snapshotInput.supportedUsage
    .map(usage => usage.value.hex)
    .filter((hex): hex is string => Boolean(hex))
    .sort();
}

function structuredColorCard(input: {
  id: string;
  name: string;
  hex: string;
  components: readonly [number, number, number];
  x: number;
  y: number;
  alphaPercent?: number;
}): SceneNode {
  const swatch = sceneNode({
    id: `${input.id}-swatch`,
    fills: [solid(input.components)],
  });
  const label = sceneNode({
    id: `${input.id}-label`,
    type: 'TEXT',
    characters: `${input.name}\n${input.hex}${
      input.alphaPercent === undefined ? '' : `, ${input.alphaPercent}%`
    }`,
    absoluteBoundingBox: { x: input.x, y: input.y, width: 80, height: 24 },
  });
  return sceneNode({
    id: input.id,
    children: [swatch, label],
    absoluteBoundingBox: { x: input.x, y: input.y, width: 96, height: 80 },
  });
}

function structuredRgbColorCard(input: {
  id: string;
  name: string;
  rgb: readonly [number, number, number];
  x: number;
  y: number;
}): SceneNode {
  return sceneNode({
    id: input.id,
    children: [
      sceneNode({
        id: `${input.id}-swatch`,
        fills: [solid([input.rgb[0] / 255, input.rgb[1] / 255, input.rgb[2] / 255])],
      }),
      sceneNode({
        id: `${input.id}-label`,
        type: 'TEXT',
        characters: `${input.name}\nRGB: ${input.rgb.join(', ')}`,
        absoluteBoundingBox: { x: input.x, y: input.y, width: 80, height: 24 },
      }),
    ],
    absoluteBoundingBox: { x: input.x, y: input.y, width: 96, height: 80 },
  });
}

function structuredSection(id: string, name: string, cards: readonly SceneNode[]): SceneNode {
  return sceneNode({ id, name, children: cards });
}

describe('inventoryFigmaColorSystem structured source sections', () => {
  function primaryCardsWithRgbBlack(): SceneNode[] {
    const documentedHexCards = Array.from({ length: 13 }, (_, index) => {
      const byte = index + 1;
      const channel = byte / 255;
      const topRow = index < 5;
      return structuredColorCard({
        id: `primary-source-${index + 1}`,
        name: `Source ${index + 1}`,
        hex: `#${byte.toString(16).padStart(2, '0').repeat(3)}`,
        components: [channel, channel, channel],
        x: (topRow ? index : index - 5) * 100,
        y: topRow ? 0 : 100,
      });
    });
    const black = structuredRgbColorCard({
      id: 'primary-black',
      name: 'Black',
      rgb: [0, 0, 0],
      x: 500,
      y: 0,
    });
    return [...documentedHexCards.slice(0, 5), black, ...documentedHexCards.slice(5)];
  }

  function genericPaletteFixture(
    selection: 'all' | 'primary' = 'all',
    includeUnrelatedVariable = false,
    primaryCards?: readonly SceneNode[]
  ): HostFixture {
    const primary = structuredSection(
      'generic-primary',
      'Studio Palette - Colors (Primary)',
      primaryCards ?? [
        structuredColorCard({
          id: 'primary-solar',
          name: 'Solar',
          hex: '#E4F222',
          components: [228 / 255, 242 / 255, 34 / 255],
          x: 0,
          y: 0,
        }),
      ]
    );
    const secondary = structuredSection('generic-secondary', 'Studio Palette - Colors (Secondary)', [
      structuredColorCard({
        id: 'secondary-sky',
        name: 'Sky',
        hex: '#B2C7EB',
        components: [178 / 255, 199 / 255, 235 / 255],
        x: 100,
        y: 0,
      }),
    ]);
    const productGraphics = structuredSection('generic-product-graphics', 'Studio Palette - Colors (Product Graphics)', [
      structuredColorCard({
        id: 'graphics-sky',
        name: 'Sky',
        hex: '#B2C7EB',
        components: [178 / 255, 199 / 255, 235 / 255],
        x: 200,
        y: 0,
      }),
    ]);
    const dataVisualization = structuredSection('generic-data-visualization', 'Studio Palette - Colors (Data Vis)', [
      structuredColorCard({
        id: 'datavis-blaze',
        name: 'Blaze',
        hex: '#E96516',
        components: [233 / 255, 101 / 255, 22 / 255],
        x: 300,
        y: 0,
      }),
      structuredColorCard({
        id: 'datavis-green',
        name: 'Green',
        hex: '#5AB570',
        components: [90 / 255, 181 / 255, 112 / 255],
        x: 200,
        y: 0,
      }),
    ]);
    const typography = structuredSection('generic-typography', 'Studio Palette - Colors (Typography)', [
      ...(includeUnrelatedVariable
        ? [
            structuredColorCard({
              id: 'typography-ink',
              name: 'Ink',
              hex: '#0C0A08',
              components: [12 / 255, 10 / 255, 8 / 255],
              x: 300,
              y: 0,
            }),
          ]
        : []),
      structuredColorCard({
        id: 'typography-hushed',
        name: 'Hushed',
        hex: '#0C0A08',
        components: [12 / 255, 10 / 255, 8 / 255],
        x: 400,
        y: 0,
        alphaPercent: 50,
      }),
    ]);
    const allSections = [primary, secondary, productGraphics, dataVisualization, typography];
    const wrapper = sceneNode({ id: 'brand-color-system', children: allSections });
    const currentPage = page('page-generic-palette', 'Studio Palette', [wrapper]);
    currentPage.selection = selection === 'all' ? [wrapper] : [primary];
    return hostFixture({
      pages: [currentPage],
      currentPage,
      ...(includeUnrelatedVariable
        ? {
            variables: [
              colorVariable({
                id: 'unrelated-local-color',
                valuesByMode: { 'mode-light': { r: 0.1, g: 0.1, b: 0.1 } },
              }),
            ],
            collections: [collection()],
          }
        : {}),
    });
  }

  it('extracts five explicit generic sections with exact labels, alpha, and order', async () => {
    const { host, spies } = genericPaletteFixture();

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ sourceLocator: 'figma-file:generic-palette' })
    );

    expect(result.snapshotInput.sourceSections?.map(section => section.kind)).toEqual([
      'primary',
      'secondary',
      'product-graphics',
      'data-visualization',
      'typography',
    ]);
    expect(
      result.snapshotInput.sourceSections?.every(
        section => section.extractionMethod === 'explicit-heading'
      )
    ).toBe(true);
    expect(result.snapshotInput.sourceSections?.[0]?.entries[0]).toMatchObject({
      name: 'Solar',
      order: 1,
      value: { hex: '#E4F222', alpha: 1 },
    });
    expect(result.snapshotInput.sourceSections?.[1]?.entries[0]?.value.hex).toBe('#B2C7EB');
    expect(result.snapshotInput.sourceSections?.[2]?.entries[0]?.value.hex).toBe('#B2C7EB');
    expect(result.snapshotInput.sourceSections?.[3]?.entries.map(entry => entry.name)).toEqual([
      'Green',
      'Blaze',
    ]);
    expect(result.snapshotInput.sourceSections?.[4]?.entries[0]?.value.alpha).toBe(0.5);
    expect(() => createSourceSystemSnapshot(result.snapshotInput)).not.toThrow();
    expect(spies.mutationCalls.every(spy => spy.mock.calls.length === 0)).toBe(true);

    const original = createSourceSystemSnapshot(result.snapshotInput);
    const changed = createSourceSystemSnapshot({
      ...result.snapshotInput,
      sourceSections: result.snapshotInput.sourceSections?.map(section =>
        section.kind === 'primary'
          ? {
              ...section,
              entries: section.entries.map(entry => ({ ...entry, name: `${entry.name} revised` })),
            }
          : section
      ),
    });
    expect(changed.sourceHash).not.toBe(original.sourceHash);
  });

  it('uses explicit headings in the open document without RGB-only recovery', async () => {
    const { host } = genericPaletteFixture('all', false, primaryCardsWithRgbBlack());

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ sourceLocator: 'figma-file:open-document' })
    );

    expect(result.snapshotInput.sourceSections?.map(section => section.kind)).toEqual([
      'primary',
      'secondary',
      'product-graphics',
      'data-visualization',
      'typography',
    ]);
    expect(
      result.snapshotInput.sourceSections?.every(
        section => section.extractionMethod === 'explicit-heading'
      )
    ).toBe(true);
    const primary = result.snapshotInput.sourceSections?.find(
      section => section.kind === 'primary'
    );
    expect(primary?.entries).toHaveLength(13);
    expect(primary?.entries.some(entry => entry.name === 'Black')).toBe(false);
    expect(() => createSourceSystemSnapshot(result.snapshotInput)).not.toThrow();
  });

  it('falls back to explicit headings for a partial open-document fingerprint without RGB recovery', async () => {
    const { host } = genericPaletteFixture('primary', false, primaryCardsWithRgbBlack());

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ sourceLocator: 'figma-file:open-document' })
    );

    expect(result.snapshotInput.sourceSections).toMatchObject([
      { kind: 'primary', extractionMethod: 'explicit-heading' },
    ]);
    const primary = result.snapshotInput.sourceSections?.[0];
    expect(primary?.entries).toHaveLength(13);
    expect(primary?.entries.some(entry => entry.name === 'Black')).toBe(false);
    expect(() => createSourceSystemSnapshot(result.snapshotInput)).not.toThrow();
  });

  it('ignores one section when its explicit heading no longer declares a role', async () => {
    const { host } = genericPaletteFixture('all', false, primaryCardsWithRgbBlack());
    const primary = (host.currentPage.selection[0] as ChildrenMixin).children.find(
      node => node.id === 'generic-primary'
    );
    if (!primary) throw new Error('Expected the generic Primary fixture node.');
    Object.assign(primary, { name: 'Studio Palette Primary revised' });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ sourceLocator: 'figma-file:open-document' })
    );

    expect(result.snapshotInput.sourceSections?.every(
      section => section.extractionMethod === 'explicit-heading'
    )).toBe(true);
    expect(result.snapshotInput.sourceSections?.map(section => section.kind)).toEqual([
      'secondary',
      'product-graphics',
      'data-visualization',
      'typography',
    ]);
    expect(
      result.snapshotInput.sourceSections
        ?.flatMap(section => section.entries)
        .some(entry => entry.name === 'Black')
    ).toBe(false);
    expect(() => createSourceSystemSnapshot(result.snapshotInput)).not.toThrow();
  });

  it('does not infer an explicit source color from an RGB-only label', () => {
    const primary = structuredSection('generic-primary', 'Studio Palette - Colors (Primary)', [
      ...primaryCardsWithRgbBlack(),
    ]);
    const currentPage = page('page-generic-primary', 'Studio Palette', [primary]);
    currentPage.selection = [primary];
    const { host } = hostFixture({ pages: [currentPage], currentPage });

    const [section] = extractStructuredSourceColorSections(host, {
      usageScope: 'selection',
      sourceLocator: 'figma-file:generic-palette',
      authorization: { status: 'user-authorized' },
    });

    expect(section?.entries).toHaveLength(13);
    expect(section?.entries.some(entry => entry.name === 'Black')).toBe(false);
    expect(new Set(section?.entries.map(entry => entry.id)).size).toBe(13);
  });

  it('rejects RGB prose, out-of-range channels, and labels without a swatch', () => {
    const prose = sceneNode({
      id: 'rgb-prose-card',
      children: [
        sceneNode({ id: 'rgb-prose-swatch', fills: [solid([0, 0, 0])] }),
        sceneNode({
          id: 'rgb-prose-label',
          type: 'TEXT',
          characters: 'Black\nNever use RGB: 0, 0, 0',
        }),
      ],
    });
    const outOfRange = sceneNode({
      id: 'rgb-range-card',
      children: [
        sceneNode({ id: 'rgb-range-swatch', fills: [solid([1, 0, 0])] }),
        sceneNode({
          id: 'rgb-range-label',
          type: 'TEXT',
          characters: 'Invalid red\nRGB: 256, 0, 0',
        }),
      ],
    });
    const uncorroborated = sceneNode({
      id: 'rgb-no-swatch-card',
      children: [
        sceneNode({
          id: 'rgb-no-swatch-label',
          type: 'TEXT',
          characters: 'Black\nRGB: 0, 0, 0',
        }),
      ],
    });
    const primary = structuredSection('generic-primary', 'Studio Palette - Colors (Primary)', [
      prose,
      outOfRange,
      uncorroborated,
    ]);
    const currentPage = page('page-rgb-negatives', 'Studio Palette', [primary]);
    currentPage.selection = [primary];
    const { host } = hostFixture({ pages: [currentPage], currentPage });

    expect(
      extractStructuredSourceColorSections(host, {
        usageScope: 'selection',
        sourceLocator: 'figma-file:generic-palette',
        authorization: { status: 'user-authorized' },
      })
    ).toEqual([]);
  });

  it('uses a card hex once when the same card also contains an RGB label', () => {
    const duplicateCard = sceneNode({
      id: 'duplicate-black-card',
      children: [
        sceneNode({ id: 'duplicate-black-swatch', fills: [solid([0, 0, 0])] }),
        sceneNode({ id: 'duplicate-black-name', type: 'TEXT', characters: 'Black' }),
        sceneNode({ id: 'duplicate-black-hex', type: 'TEXT', characters: '#000000' }),
        sceneNode({ id: 'duplicate-black-rgb', type: 'TEXT', characters: 'RGB: 0, 0, 0' }),
      ],
    });
    const primary = structuredSection('generic-primary', 'Studio Palette - Colors (Primary)', [duplicateCard]);
    const currentPage = page('page-rgb-duplicate', 'Studio Palette', [primary]);
    currentPage.selection = [primary];
    const { host } = hostFixture({ pages: [currentPage], currentPage });

    const [section] = extractStructuredSourceColorSections(host, {
      usageScope: 'selection',
      sourceLocator: 'figma-file:generic-palette',
      authorization: { status: 'user-authorized' },
    });

    expect(section?.entries).toHaveLength(1);
    expect(section?.entries[0]).toMatchObject({ name: 'Black', value: { hex: '#000000' } });
  });

  it('does not use RGB-only fallback for generic explicit headings', () => {
    const primary = structuredSection('acme-primary', 'Acme - Colors (Primary)', [
      structuredRgbColorCard({
        id: 'acme-black',
        name: 'Black',
        rgb: [0, 0, 0],
        x: 0,
        y: 0,
      }),
    ]);
    const currentPage = page('page-generic-rgb', 'Acme', [primary]);
    currentPage.selection = [primary];
    const { host } = hostFixture({ pages: [currentPage], currentPage });

    expect(
      extractStructuredSourceColorSections(host, {
        usageScope: 'selection',
        sourceLocator: 'figma-file:unregistered-file',
        authorization: { status: 'user-authorized' },
      })
    ).toEqual([]);
  });

  it('keeps staggered source rows deterministic across traversal permutations', () => {
    const descriptors = {
      a: { name: 'A', hex: '#AA0000', components: [2 / 3, 0, 0] as const, x: 20, y: 0 },
      b: { name: 'B', hex: '#00BB00', components: [0, 11 / 15, 0] as const, x: 10, y: 3 },
      c: { name: 'C', hex: '#0000CC', components: [0, 0, 4 / 5] as const, x: 0, y: 6 },
    };
    const extractOrder = (permutation: readonly (keyof typeof descriptors)[]): string[] => {
      const cards = permutation.map(key =>
        structuredColorCard({ id: `card-${key}`, ...descriptors[key] })
      );
      const primary = structuredSection('acme-primary', 'Acme - Colors (Primary)', cards);
      const currentPage = page('page-order', 'Order', [primary]);
      currentPage.selection = [primary];
      const { host } = hostFixture({ pages: [currentPage], currentPage });
      return (
        extractStructuredSourceColorSections(host, {
          usageScope: 'selection',
          sourceLocator: 'figma-file:unregistered-file',
          authorization: { status: 'user-authorized' },
        })[0]?.entries.map(entry => entry.name) ?? []
      );
    };

    expect(extractOrder(['a', 'b', 'c'])).toEqual(['B', 'A', 'C']);
    expect(extractOrder(['c', 'b', 'a'])).toEqual(['B', 'A', 'C']);
    expect(extractOrder(['b', 'c', 'a'])).toEqual(['B', 'A', 'C']);
  });

  it('does not inspect explicit sections outside the selected analysis scope', async () => {
    const { host, spies } = genericPaletteFixture('primary');

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ sourceLocator: 'figma-file:generic-palette' })
    );

    expect(result.snapshotInput.sourceSections?.map(section => section.kind)).toEqual(['primary']);
    expect(
      spies.getNodeByIdAsync.mock.calls.some(([id]) =>
        ['generic-secondary', 'generic-product-graphics', 'generic-data-visualization', 'generic-typography'].includes(id)
      )
    ).toBe(false);
  });

  it('keeps structured brand swatches available when an unrelated local color resource exists', async () => {
    const { host } = genericPaletteFixture('all', true);

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ sourceLocator: 'figma-file:generic-palette' })
    );
    const structured = result.snapshotInput.tokens.filter(
      token => token.sourceRepresentation === 'structured-source'
    );

    expect(result.snapshotInput.tokens.map(token => token.id)).toContain('unrelated-local-color');
    expect(structured.map(token => token.valuesByMode.Source?.hex).sort()).toEqual([
      '#0C0A08',
      '#5AB570',
      '#B2C7EB',
      '#E4F222',
      '#E96516',
    ]);
    expect(
      structured
        .filter(token => ['#5AB570', '#E96516'].includes(token.valuesByMode.Source?.hex ?? ''))
        .every(token => token.path[1] === 'data-visualization')
    ).toBe(true);
    expect(structured.find(token => token.valuesByMode.Source?.hex === '#B2C7EB')?.path[1]).toBe(
      'secondary+product-graphics'
    );
    expect(
      result.snapshotInput.sourceSections
        ?.find(section => section.kind === 'typography')
        ?.entries.map(entry => entry.value)
    ).toContainEqual(expect.objectContaining({ colorSpace: 'srgb', hex: '#0C0A08', alpha: 0.5 }));
    expect(structured.find(token => token.valuesByMode.Source?.hex === '#0C0A08')).toMatchObject({
      path: ['Structured source', 'typography', 'Ink', '#0C0A08'],
      valuesByMode: { Source: { alpha: 1 } },
    });
    expect(structured.every(token => token.roleEvidence.length === 0)).toBe(true);
    expect(() => createSourceSystemSnapshot(result.snapshotInput)).not.toThrow();
  });

  it('uses one unique explicit section heading for an unregistered authorized file', async () => {
    const secondary = structuredSection('acme-secondary', 'Acme - Colors (Secondary)', [
      structuredColorCard({
        id: 'acme-sky',
        name: 'Sky',
        hex: '#B2C7EB',
        components: [178 / 255, 199 / 255, 235 / 255],
        x: 0,
        y: 0,
      }),
    ]);
    const currentPage = page('page-one', 'Acme', [secondary]);
    currentPage.selection = [secondary];
    const { host } = hostFixture({ pages: [currentPage], currentPage });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ sourceLocator: 'figma-file:unregistered-file' })
    );

    expect(result.snapshotInput.sourceSections).toMatchObject([
      {
        kind: 'secondary',
        sourceNodeId: 'acme-secondary',
        extractionMethod: 'explicit-heading',
        entries: [{ name: 'Sky', order: 1, value: { hex: '#B2C7EB', alpha: 1 } }],
      },
    ]);
  });

  it('rejects prose hex mentions and uncorroborated labels under an explicit heading', async () => {
    const prose = sceneNode({
      id: 'prose-card',
      children: [
        sceneNode({ id: 'prose-swatch', fills: [solid([1, 0, 0])] }),
        sceneNode({
          id: 'prose-label',
          type: 'TEXT',
          characters: 'Never use #FF0000',
        }),
      ],
    });
    const labelWithoutSwatch = sceneNode({
      id: 'uncorroborated-card',
      children: [
        sceneNode({
          id: 'uncorroborated-label',
          type: 'TEXT',
          characters: 'Warning\n#FFAA00',
        }),
      ],
    });
    const primary = structuredSection('acme-primary', 'Acme - Colors (Primary)', [
      prose,
      labelWithoutSwatch,
    ]);
    const currentPage = page('page-one', 'Acme', [primary]);
    currentPage.selection = [primary];
    const { host } = hostFixture({ pages: [currentPage], currentPage });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ sourceLocator: 'figma-file:unregistered-file' })
    );

    expect(result.snapshotInput.sourceSections).toEqual([]);
  });

  it('fails closed when an explicit heading no longer declares a role', async () => {
    const { host } = genericPaletteFixture('primary');
    Object.assign(host.currentPage.selection[0], { name: 'Legacy primary palette' });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ sourceLocator: 'figma-file:generic-palette' })
    );

    expect(result.snapshotInput.sourceSections).toEqual([]);
  });

  it('honors cancellation before traversing structured source candidates', () => {
    const primary = structuredSection('acme-primary', 'Acme - Colors (Primary)', [
      structuredColorCard({
        id: 'acme-red',
        name: 'Red',
        hex: '#FF0000',
        components: [1, 0, 0],
        x: 0,
        y: 0,
      }),
    ]);
    const currentPage = page('page-one', 'Acme', [primary]);
    currentPage.selection = [primary];
    const { host } = hostFixture({ pages: [currentPage], currentPage });
    let cancellationChecks = 0;

    const sections = extractStructuredSourceColorSections(host, {
      usageScope: 'selection',
      sourceLocator: 'figma-file:unregistered-file',
      authorization: { status: 'user-authorized' },
      isCancelled: () => {
        cancellationChecks += 1;
        return cancellationChecks >= 2;
      },
    });

    expect(sections).toEqual([]);
    expect(cancellationChecks).toBe(2);
  });

  it('does not extract structured sections without owner authorization', async () => {
    const { host } = genericPaletteFixture();

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({
        sourceLocator: 'figma-file:generic-palette',
        authorization: { status: 'unknown' },
      })
    );

    expect(result.snapshotInput.sourceSections).toEqual([]);
  });

  it('omits an inferred section when an explicit heading is not unique', async () => {
    const first = structuredSection('primary-one', 'Acme - Colors (Primary)', [
      structuredColorCard({
        id: 'first-red',
        name: 'Red',
        hex: '#FF0000',
        components: [1, 0, 0],
        x: 0,
        y: 0,
      }),
    ]);
    const second = structuredSection('primary-two', 'Acme - Colors (Primary)', [
      structuredColorCard({
        id: 'second-blue',
        name: 'Blue',
        hex: '#0000FF',
        components: [0, 0, 1],
        x: 100,
        y: 0,
      }),
    ]);
    const wrapper = sceneNode({ id: 'ambiguous-primary', children: [first, second] });
    const currentPage = page('page-one', 'Ambiguous', [wrapper]);
    currentPage.selection = [wrapper];
    const { host } = hostFixture({ pages: [currentPage], currentPage });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ sourceLocator: 'figma-file:unregistered-file' })
    );

    expect(result.snapshotInput.sourceSections).toEqual([]);
  });
});

describe('inventoryFigmaColorSystem scope boundaries', () => {
  function scopedFixture(): HostFixture {
    const selected = sceneNode({ id: 'selected', fills: [solid([1, 0, 0])] });
    const currentPageSibling = sceneNode({ id: 'current-sibling', fills: [solid([0, 1, 0])] });
    const otherPageNode = sceneNode({ id: 'other-page-node', fills: [solid([0, 0, 1])] });
    const currentPage = page('page-one', 'Current page', [selected, currentPageSibling]);
    currentPage.selection = [selected];
    const otherPage = page('page-two', 'Other page', [otherPageNode]);
    return hostFixture({
      pages: [currentPage, otherPage],
      currentPage,
      variables: [
        colorVariable({
          id: 'variable-brand',
          name: 'Brand/Primary',
          valuesByMode: { 'mode-light': { r: 0.2, g: 0.3, b: 0.4 } },
        }),
      ],
      collections: [collection()],
      styles: [paintStyle('style-surface', 'Surface/Default', [solid([0.9, 0.9, 0.9])])],
    });
  }

  it('always inventories all local resources while limiting usage to the selection', async () => {
    const { host, spies } = scopedFixture();

    const result = await inventoryFigmaColorSystem(host, auditOptions());

    expect(result.snapshotInput.resourceScope).toEqual({
      kind: 'all-local-resources',
      localVariableCount: 1,
      localStyleCount: 1,
    });
    expect(result.snapshotInput.tokens.map(token => token.id).sort()).toEqual([
      'style:style-surface',
      'variable-brand',
    ]);
    expect(usageHexes(result)).toEqual(['#FF0000']);
    expect(result.scannedNodeCount).toBe(1);
    expect(spies.getLocalVariablesAsync).toHaveBeenCalledWith('COLOR');
    expect(spies.getLocalPaintStylesAsync).toHaveBeenCalledOnce();
    expect(spies.loadAllPagesAsync).not.toHaveBeenCalled();
  });

  it('scans every node on the current page but does not load or inspect other pages', async () => {
    const { host, spies } = scopedFixture();

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ usageScope: 'current-page' })
    );

    expect(usageHexes(result)).toEqual(['#00FF00', '#FF0000']);
    expect(result.scannedNodeCount).toBe(2);
    expect(spies.loadAllPagesAsync).not.toHaveBeenCalled();
    expect(
      result.snapshotInput.supportedUsage.flatMap(usage =>
        usage.evidence.map(evidence => evidence.locator)
      )
    ).not.toContain('page-two');
  });

  it('requires confirmation before reading the whole file', async () => {
    const { host, spies } = scopedFixture();

    await expect(
      inventoryFigmaColorSystem(
        host,
        auditOptions({ usageScope: 'whole-file', confirmWholeFile: false })
      )
    ).rejects.toThrow('Whole-file analysis requires explicit confirmation.');

    expect(spies.getLocalVariablesAsync).not.toHaveBeenCalled();
    expect(spies.getLocalPaintStylesAsync).not.toHaveBeenCalled();
    expect(spies.loadAllPagesAsync).not.toHaveBeenCalled();
  });

  it('loads all pages only after confirmation and reports page-level progress', async () => {
    const { host, spies } = scopedFixture();
    const progress: ColorSystemAuditProgress[] = [];

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({
        usageScope: 'whole-file',
        confirmWholeFile: true,
        onProgress: event => progress.push(event),
      })
    );

    expect(spies.loadAllPagesAsync).toHaveBeenCalledOnce();
    expect(usageHexes(result)).toEqual(['#0000FF', '#00FF00', '#FF0000']);
    expect(result.scannedNodeCount).toBe(3);
    expect(progress.filter(event => event.phase === 'usage').map(event => event.pageName)).toEqual([
      'Current page',
      'Other page',
    ]);
  });

  it('fails closed when local resources exceed the UI transport envelope', async () => {
    const currentPage = page('page-one', 'Oversized resources', []);
    const { host, spies } = hostFixture({ pages: [currentPage] });
    const oversizedVariables: Variable[] = [];
    oversizedVariables.length = 50_001;
    spies.getLocalVariablesAsync.mockResolvedValue(oversizedVariables);

    await expect(inventoryFigmaColorSystem(host, auditOptions())).rejects.toThrow(
      'Local color variables exceed the audit limit of 50000'
    );
  });
});

describe('inventoryFigmaColorSystem audit-output lineage', () => {
  const genericOwnership = { 'teul-color-system': '1' } as const;
  const auditOwnership = {
    'teul-color-system': '1',
    'teul-color-system-audit-output': '1',
  } as const;

  function sourcePage(): PageNode {
    const source = sceneNode({ id: 'source-color', fills: [solid([0.4, 0.2, 0.3])] });
    const currentPage = page('page-source', 'Source', [source]);
    currentPage.selection = [source];
    return currentPage;
  }

  it('excludes marked and narrowly identified legacy audit resources without changing the source hash', async () => {
    const baselinePage = sourcePage();
    const baseline = await inventoryFigmaColorSystem(
      hostFixture({ pages: [baselinePage], currentPage: baselinePage }).host,
      auditOptions()
    );

    const auditCollection = withPluginData(collection('audit-collection'), auditOwnership);
    const auditVariable = withPluginData(
      colorVariable({
        id: 'audit-variable',
        collectionId: auditCollection.id,
        valuesByMode: { 'mode-light': { r: 0.1, g: 0.2, b: 0.3 } },
        description: 'Teul OKLCH v3 · protected step 9',
      }),
      auditOwnership
    );
    const auditStyle = withPluginData(
      Object.assign(paintStyle('audit-style', 'Any output name/Light/blue/1', [solid([0, 0, 1])]), {
        description: 'Exact Radix Colors 3.0.0 · blue light 1',
      }),
      auditOwnership
    );
    const legacyCollection = withPluginData(
      Object.assign(collection('legacy-collection'), { name: 'Teul Color System Colors' }),
      genericOwnership
    );
    const legacyVariable = withPluginData(
      colorVariable({
        id: 'legacy-variable',
        collectionId: legacyCollection.id,
        valuesByMode: { 'mode-light': { r: 0.9, g: 0.2, b: 0.1 } },
        description: 'Source preserved from source.anchor [rendered] #E6331A',
      }),
      genericOwnership
    );
    const legacyStyle = withPluginData(
      Object.assign(
        paintStyle('legacy-style', 'Teul Color System/Light/product/primitive/1', [
          solid([0.9, 0.2, 0.1]),
        ]),
        { description: 'Teul OKLCH v3 · protected step 9' }
      ),
      genericOwnership
    );
    const pollutedPage = sourcePage();
    const polluted = await inventoryFigmaColorSystem(
      hostFixture({
        pages: [pollutedPage],
        currentPage: pollutedPage,
        variables: [auditVariable, legacyVariable],
        collections: [auditCollection, legacyCollection],
        styles: [auditStyle, legacyStyle],
      }).host,
      auditOptions()
    );

    expect(polluted.snapshotInput.resourceScope).toEqual({
      kind: 'all-local-resources',
      localVariableCount: 0,
      localStyleCount: 0,
    });
    expect(polluted.snapshotInput.tokens).toHaveLength(1);
    expect(polluted.snapshotInput.tokens[0]).toMatchObject({
      sourceRepresentation: 'observed-literal',
      observedUsageCount: 1,
    });
    expect(createSourceSystemSnapshot(polluted.snapshotInput).sourceHash).toBe(
      createSourceSystemSnapshot(baseline.snapshotInput).sourceHash
    );
  });

  it('retains generic Teul-owned historical resources and user-owned resources with similar names', async () => {
    const currentPage = page('page-resources', 'Resources', []);
    const historicalCollection = withPluginData(
      Object.assign(collection('historical-collection'), { name: 'Wada Color System Colors' }),
      genericOwnership
    );
    const historicalVariable = withPluginData(
      colorVariable({
        id: 'wada-variable',
        collectionId: historicalCollection.id,
        valuesByMode: { 'mode-light': { r: 0.2, g: 0.3, b: 0.4 } },
        description: 'Wada digital approximation · sRGB',
      }),
      genericOwnership
    );
    const userCollection = Object.assign(collection('user-collection'), {
      name: 'Teul Color System Colors',
    });
    const userVariable = colorVariable({
      id: 'user-variable',
      collectionId: userCollection.id,
      valuesByMode: { 'mode-light': { r: 0.5, g: 0.6, b: 0.7 } },
      description: 'User-authored color',
    });
    const markedAuditCollection = withPluginData(
      collection('marked-audit-collection'),
      auditOwnership
    );
    const laterUserVariable = colorVariable({
      id: 'later-user-variable',
      collectionId: markedAuditCollection.id,
      valuesByMode: { 'mode-light': { r: 0.1, g: 0.7, b: 0.4 } },
      description: 'Added by the user after Teul created the collection',
    });
    const historicalStyle = withPluginData(
      Object.assign(paintStyle('wada-style', 'Teul/Wada/Red', [solid([0.8, 0.1, 0.2])]), {
        description: 'Historical digital approximation',
      }),
      genericOwnership
    );

    const result = await inventoryFigmaColorSystem(
      hostFixture({
        pages: [currentPage],
        variables: [historicalVariable, userVariable, laterUserVariable],
        collections: [historicalCollection, userCollection, markedAuditCollection],
        styles: [historicalStyle],
      }).host,
      auditOptions()
    );

    expect(result.snapshotInput.tokens.map(token => token.id).sort()).toEqual([
      'later-user-variable',
      'style:wada-style',
      'user-variable',
      'wada-variable',
    ]);
  });

  it('skips a marked overview subtree, selected descendants, and audit-bound usages elsewhere', async () => {
    const overviewChild = sceneNode({ id: 'overview-child', fills: [solid([0, 0, 1])] });
    const overview = withPluginData(
      sceneNode({ id: 'overview', children: [overviewChild] }),
      auditOwnership
    );
    const source = sceneNode({ id: 'source', fills: [solid([1, 0, 0])] });
    const auditStyleUse = sceneNode({
      id: 'audit-style-use',
      fills: [solid([0, 1, 0])],
      fillStyleId: 'audit-style',
    });
    const auditVariableUse = sceneNode({
      id: 'audit-variable-use',
      fills: [
        solid([0, 1, 1], {
          boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'audit-variable' } },
        }),
      ],
    });
    const currentPage = page('page-overview', 'Overview', [
      overview,
      source,
      auditStyleUse,
      auditVariableUse,
    ]);
    const auditCollection = withPluginData(collection('audit-collection'), auditOwnership);
    const auditVariable = withPluginData(
      colorVariable({
        id: 'audit-variable',
        collectionId: auditCollection.id,
        valuesByMode: { 'mode-light': { r: 0, g: 1, b: 1 } },
      }),
      auditOwnership
    );
    const auditStyle = withPluginData(
      paintStyle('audit-style', 'Generated/Green', [solid([0, 1, 0])]),
      auditOwnership
    );
    const fixture = hostFixture({
      pages: [currentPage],
      currentPage,
      variables: [auditVariable],
      collections: [auditCollection],
      styles: [auditStyle],
    });

    const result = await inventoryFigmaColorSystem(
      fixture.host,
      auditOptions({ usageScope: 'current-page' })
    );
    expect(usageHexes(result)).toEqual(['#FF0000']);
    expect(result.snapshotInput.tokens).toHaveLength(1);

    currentPage.selection = [overviewChild];
    const selectedDescendant = await inventoryFigmaColorSystem(fixture.host, auditOptions());
    expect(selectedDescendant.snapshotInput.supportedUsage).toEqual([]);
    expect(selectedDescendant.snapshotInput.tokens).toEqual([]);
  });

  it('does not resolve a user-owned alias through an excluded audit variable', async () => {
    const aliasUse = sceneNode({
      id: 'alias-use',
      fills: [
        solid([0.8, 0.1, 0.7], {
          boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'user-alias' } },
        }),
      ],
    });
    const currentPage = page('page-alias', 'Alias', [aliasUse]);
    const auditCollection = collection('mixed-collection');
    const auditVariable = withPluginData(
      colorVariable({
        id: 'audit-variable',
        collectionId: auditCollection.id,
        valuesByMode: { 'mode-light': { r: 0.2, g: 0.3, b: 0.4 } },
      }),
      auditOwnership
    );
    const userVariable = colorVariable({
      id: 'user-alias',
      collectionId: auditCollection.id,
      valuesByMode: {
        'mode-light': { type: 'VARIABLE_ALIAS', id: 'audit-variable' },
      },
    });

    const result = await inventoryFigmaColorSystem(
      hostFixture({
        pages: [currentPage],
        variables: [auditVariable, userVariable],
        collections: [auditCollection],
      }).host,
      auditOptions({ usageScope: 'current-page' })
    );

    expect(result.snapshotInput.tokens).toHaveLength(1);
    expect(result.snapshotInput.tokens[0].valuesByMode).toEqual({});
    expect(result.snapshotInput.unsupportedUsage).toEqual([
      expect.objectContaining({ reason: 'unresolved-alias' }),
    ]);
    expect(result.snapshotInput.supportedUsage).toEqual([]);
  });

  it('keeps a valid active-mode value when only another mode aliases audit output', async () => {
    const aliasUse = sceneNode({
      id: 'mode-specific-alias-use',
      fills: [
        solid([0.1, 0.2, 0.3], {
          boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'user-mode-variable' } },
        }),
      ],
      resolvedVariableModes: {
        'user-collection': 'mode-light',
        'audit-collection': 'mode-light',
      },
    });
    const currentPage = page('page-mode-specific-alias', 'Mode-specific alias', [aliasUse]);
    const auditCollection = collection('audit-collection');
    const userCollection = collection('user-collection', [
      { modeId: 'mode-light', name: 'Light' },
      { modeId: 'mode-dark', name: 'Dark' },
    ]);
    const auditVariable = withPluginData(
      colorVariable({
        id: 'audit-mode-variable',
        collectionId: auditCollection.id,
        valuesByMode: { 'mode-light': { r: 0.9, g: 0.8, b: 0.7 } },
      }),
      auditOwnership
    );
    const activeColor = { r: 0.1, g: 0.2, b: 0.3 };
    const userVariable = Object.assign(
      colorVariable({
        id: 'user-mode-variable',
        collectionId: userCollection.id,
        valuesByMode: {
          'mode-light': activeColor,
          'mode-dark': { type: 'VARIABLE_ALIAS', id: auditVariable.id },
        },
      }),
      {
        resolveForConsumer: vi.fn(() => ({ resolvedType: 'COLOR', value: activeColor })),
      }
    );

    const result = await inventoryFigmaColorSystem(
      hostFixture({
        pages: [currentPage],
        variables: [auditVariable, userVariable],
        collections: [auditCollection, userCollection],
      }).host,
      auditOptions({ usageScope: 'current-page' })
    );

    expect(usageHexes(result)).toEqual(['#1A334D']);
    expect(result.snapshotInput.supportedUsage[0]).toEqual(
      expect.objectContaining({ tokenId: userVariable.id, mode: 'Light' })
    );
  });
});

describe('inventoryFigmaColorSystem paint evidence', () => {
  it('classifies unsupported rendered paints without guessing their colors', async () => {
    const nodes = [
      sceneNode({ id: 'gradient', fills: [gradient()] }),
      sceneNode({ id: 'image', strokes: [imagePaint()] }),
      sceneNode({ id: 'mixed', fills: mixedPaint as unknown as PluginAPI['mixed'] }),
      sceneNode({ id: 'transparent', fills: [solid([1, 0, 0], { opacity: 0.5 })] }),
      sceneNode({ id: 'blended', fills: [solid([1, 0, 0])], blendMode: 'MULTIPLY' }),
      sceneNode({
        id: 'many-paints',
        fills: [solid([1, 0, 0]), solid([0, 1, 0])],
      }),
      sceneNode({
        id: 'valid',
        fills: [{ ...gradient(), visible: false }, solid([0.25, 0.5, 0.75])],
      }),
    ];
    const currentPage = page('page-one', 'Paint cases', nodes);
    const { host } = hostFixture({
      pages: [currentPage],
      currentPage,
      styles: [
        paintStyle('style-gradient', 'Gradient style', [gradient()]),
        paintStyle('style-transparent', 'Transparent style', [solid([0, 0, 0], { opacity: 0.4 })]),
        paintStyle('style-blended', 'Blended style', [solid([0, 0, 0], { blendMode: 'MULTIPLY' })]),
      ],
    });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ usageScope: 'current-page' })
    );

    expect(result.scannedNodeCount).toBe(nodes.length);
    expect(result.snapshotInput.supportedUsage).toHaveLength(1);
    expect(result.snapshotInput.supportedUsage[0]).toMatchObject({
      value: { hex: '#4080BF', alpha: 1 },
      count: 1,
    });
    expect(new Set(result.snapshotInput.unsupportedUsage.map(item => item.reason))).toEqual(
      new Set(['gradient', 'image', 'mixed-paint', 'transparency', 'blend-mode'])
    );
    expect(result.snapshotInput.unsupportedUsage.every(item => item.evidence.length > 0)).toBe(
      true
    );
    expect(result.snapshotInput.tokens.map(token => token.id)).toContain('style:style-transparent');
    expect(
      result.snapshotInput.tokens.find(token => token.id === 'style:style-blended')
    ).toMatchObject({ valuesByMode: {} });
    expect(
      result.snapshotInput.unsupportedUsage.some(item =>
        item.detail.includes('Paint style Blended style uses MULTIPLY blending')
      )
    ).toBe(true);
    expect(result.snapshotInput.tokens.map(token => token.id)).not.toContain(
      'style:style-gradient'
    );
  });

  it('resolves local variable aliases and records unresolved aliases as unsupported', async () => {
    const currentPage = page('page-one', 'Aliases', []);
    const variables = [
      colorVariable({
        id: 'target',
        name: 'Primitive/Blue',
        valuesByMode: { 'mode-light': { r: 0, g: 0.25, b: 1 } },
      }),
      colorVariable({
        id: 'alias',
        name: 'Semantic/Link',
        valuesByMode: {
          'mode-light': { type: 'VARIABLE_ALIAS', id: 'target' },
        },
      }),
      colorVariable({
        id: 'missing-alias',
        name: 'Semantic/Missing',
        valuesByMode: {
          'mode-light': { type: 'VARIABLE_ALIAS', id: 'does-not-exist' },
        },
      }),
    ];
    const { host } = hostFixture({
      pages: [currentPage],
      variables,
      collections: [collection()],
    });

    const result = await inventoryFigmaColorSystem(host, auditOptions());
    const alias = result.snapshotInput.tokens.find(token => token.id === 'alias');

    expect(alias).toMatchObject({
      aliasTargetId: 'target',
      valuesByMode: { Light: { hex: '#0040FF', alpha: 1 } },
    });
    expect(result.snapshotInput.unsupportedUsage).toEqual([
      expect.objectContaining({
        reason: 'unresolved-alias',
        count: 1,
        detail: expect.stringContaining('Semantic/Missing'),
      }),
    ]);
  });

  it('memoizes shared alias suffixes and target lookups', async () => {
    const currentPage = page('page-one', 'Shared aliases', []);
    const aliases = ['first', 'second'].map(id =>
      colorVariable({
        id,
        valuesByMode: {
          'mode-light': { type: 'VARIABLE_ALIAS', id: 'shared-alias' },
        },
      })
    );
    const sharedAlias = colorVariable({
      id: 'shared-alias',
      valuesByMode: {
        'mode-light': { type: 'VARIABLE_ALIAS', id: 'shared-literal' },
      },
    });
    const sharedLiteral = colorVariable({
      id: 'shared-literal',
      valuesByMode: { 'mode-light': { r: 0.2, g: 0.4, b: 0.6 } },
    });
    const { host, spies } = hostFixture({
      pages: [currentPage],
      variables: aliases,
      collections: [collection()],
    });
    spies.getVariableByIdAsync.mockImplementation(async (id: string) => {
      return [sharedAlias, sharedLiteral].find(variable => variable.id === id) ?? null;
    });

    const result = await inventoryFigmaColorSystem(host, auditOptions());

    expect(spies.getVariableByIdAsync).toHaveBeenCalledTimes(2);
    expect(result.snapshotInput.tokens.map(token => token.valuesByMode.Light?.hex)).toEqual([
      '#336699',
      '#336699',
    ]);
  });

  it('bounds alias depth without poisoning a later shallower cached resolution', async () => {
    const currentPage = page('page-one', 'Deep aliases', []);
    const variables = Array.from({ length: MAX_FIGMA_VARIABLE_ALIAS_DEPTH + 2 }, (_, index) =>
      colorVariable({
        id: `depth-${index}`,
        valuesByMode: {
          'mode-light':
            index === MAX_FIGMA_VARIABLE_ALIAS_DEPTH + 1
              ? { r: 0.25, g: 0.5, b: 0.75 }
              : { type: 'VARIABLE_ALIAS', id: `depth-${index + 1}` },
        },
      })
    );
    const { host } = hostFixture({
      pages: [currentPage],
      variables,
      collections: [collection()],
    });

    const result = await inventoryFigmaColorSystem(host, auditOptions());
    const tooDeep = result.snapshotInput.tokens.find(token => token.id === 'depth-0');
    const maximumDepth = result.snapshotInput.tokens.find(token => token.id === 'depth-1');

    expect(Object.keys(tooDeep?.valuesByMode ?? {})).toEqual([]);
    expect(maximumDepth?.valuesByMode.Light?.hex).toBe('#4080BF');
    expect(
      result.snapshotInput.unsupportedUsage.filter(item => item.reason === 'unresolved-alias')
    ).toHaveLength(1);
  });

  it('preserves prototype-shaped Figma mode names as own dictionary keys', async () => {
    const currentPage = page('page-one', 'Prototype mode', []);
    const dangerousCollection = collection('collection-dangerous', [
      { modeId: 'mode-dangerous', name: '__proto__' },
    ]);
    const variables = [
      colorVariable({
        id: 'prototype-target',
        collectionId: dangerousCollection.id,
        valuesByMode: { 'mode-dangerous': { r: 1, g: 0, b: 0 } },
      }),
      colorVariable({
        id: 'prototype-alias',
        collectionId: dangerousCollection.id,
        valuesByMode: {
          'mode-dangerous': { type: 'VARIABLE_ALIAS', id: 'prototype-target' },
        },
      }),
    ];
    const { host } = hostFixture({
      pages: [currentPage],
      variables,
      collections: [dangerousCollection],
    });

    const inventory = await inventoryFigmaColorSystem(host, auditOptions());
    const snapshot = createSourceSystemSnapshot(inventory.snapshotInput);
    const alias = snapshot.tokens.find(token => token.id === 'prototype-alias');

    expect(snapshot.modes).toEqual(['__proto__']);
    expect(Object.prototype.hasOwnProperty.call(alias?.valuesByMode, '__proto__')).toBe(true);
    expect(alias?.valuesByMode['__proto__']?.hex).toBe('#ff0000');
    expect(Object.prototype.hasOwnProperty.call(alias?.aliasTargetsByMode, '__proto__')).toBe(true);
    expect(alias?.aliasTargetsByMode?.['__proto__']).toBe('prototype-target');
  });

  it('retains cross-collection alias edges but fails closed on same-name mode matching', async () => {
    const currentPage = page('page-one', 'Mode aliases', []);
    const sourceCollection = collection('collection-source', [
      { modeId: 'source-light', name: 'Light' },
      { modeId: 'source-dark', name: 'Dark' },
    ]);
    const semanticCollection = collection('collection-semantic', [
      { modeId: 'semantic-light', name: 'Light' },
      { modeId: 'semantic-dark', name: 'Dark' },
    ]);
    const variables = [
      colorVariable({
        id: 'target-light',
        collectionId: sourceCollection.id,
        valuesByMode: {
          'source-light': { r: 0.1, g: 0.2, b: 0.3 },
          'source-dark': { r: 0.9, g: 0.8, b: 0.7 },
        },
      }),
      colorVariable({
        id: 'target-dark',
        collectionId: sourceCollection.id,
        valuesByMode: {
          'source-light': { r: 0.2, g: 0.3, b: 0.4 },
          'source-dark': { r: 0.8, g: 0.7, b: 0.6 },
        },
      }),
      colorVariable({
        id: 'semantic-alias',
        collectionId: semanticCollection.id,
        valuesByMode: {
          'semantic-light': { type: 'VARIABLE_ALIAS', id: 'target-light' },
          'semantic-dark': { type: 'VARIABLE_ALIAS', id: 'target-dark' },
        },
      }),
    ];
    const { host } = hostFixture({
      pages: [currentPage],
      variables,
      collections: [sourceCollection, semanticCollection],
    });

    const result = await inventoryFigmaColorSystem(host, auditOptions());
    const alias = result.snapshotInput.tokens.find(token => token.id === 'semantic-alias');

    expect(alias).toMatchObject({
      aliasTargetsByMode: { Light: 'target-light', Dark: 'target-dark' },
      valuesByMode: {},
    });
    expect(alias).not.toHaveProperty('aliasTargetId');
    expect(
      result.snapshotInput.unsupportedUsage.filter(item => item.reason === 'unresolved-alias')
    ).toHaveLength(2);
  });

  it('preserves mixed literal and alias modes without token-wide alias evidence', async () => {
    const currentPage = page('page-one', 'Mixed aliases', []);
    const sourceCollection = collection('collection-source', [
      { modeId: 'source-light', name: 'Light' },
      { modeId: 'source-dark', name: 'Dark' },
    ]);
    const semanticCollection = collection('collection-semantic', [
      { modeId: 'semantic-light', name: 'Light' },
      { modeId: 'semantic-dark', name: 'Dark' },
    ]);
    const variables = [
      colorVariable({
        id: 'primitive',
        name: 'Primitive/Mixed',
        collectionId: sourceCollection.id,
        valuesByMode: {
          'source-light': { r: 0.1, g: 0.2, b: 0.3 },
          'source-dark': { type: 'VARIABLE_ALIAS', id: 'semantic' },
        },
      }),
      colorVariable({
        id: 'semantic',
        name: 'Semantic/Mixed',
        collectionId: semanticCollection.id,
        valuesByMode: {
          'semantic-light': { type: 'VARIABLE_ALIAS', id: 'primitive' },
          'semantic-dark': { r: 0.8, g: 0.1, b: 0.2 },
        },
      }),
    ];
    const collections = [sourceCollection, semanticCollection];
    const firstInventory = await inventoryFigmaColorSystem(
      hostFixture({ pages: [currentPage], variables, collections }).host,
      auditOptions()
    );
    const secondInventory = await inventoryFigmaColorSystem(
      hostFixture({
        pages: [page('page-two', 'Mixed aliases', [])],
        variables: [...variables].reverse(),
        collections,
      }).host,
      auditOptions()
    );
    const first = createSourceSystemSnapshot(firstInventory.snapshotInput);
    const second = createSourceSystemSnapshot(secondInventory.snapshotInput);
    const primitive = first.tokens.find(token => token.id === 'primitive');
    const semantic = first.tokens.find(token => token.id === 'semantic');

    expect(primitive).toMatchObject({ aliasTargetsByMode: { Dark: 'semantic' } });
    expect(semantic).toMatchObject({ aliasTargetsByMode: { Light: 'primitive' } });
    expect(primitive).not.toHaveProperty('aliasTargetId');
    expect(semantic).not.toHaveProperty('aliasTargetId');
    expect(first.sourceHash).toBe(second.sourceHash);
    expect(auditColorSystem(first).auditHash).toBe(auditColorSystem(second).auditHash);
    expect(
      auditColorSystem(first).diagnostics.filter(diagnostic =>
        ['ALIAS_CYCLE', 'ALIAS_TARGET_MISSING', 'ALIAS_LITERAL_DIVERGENCE'].includes(
          diagnostic.code
        )
      )
    ).toEqual([]);
  });

  it('preserves Display P3 components and never fabricates an sRGB hex', async () => {
    const node = sceneNode({ id: 'p3-node', fills: [solid([0.11, 0.22, 0.33])] });
    const currentPage = page('page-one', 'P3', [node]);
    currentPage.selection = [node];
    const { host } = hostFixture({
      pages: [currentPage],
      currentPage,
      variables: [
        colorVariable({
          id: 'p3-variable',
          valuesByMode: { 'mode-light': { r: 0.12, g: 0.34, b: 0.56, a: 0.78 } },
        }),
      ],
      collections: [collection()],
      styles: [paintStyle('p3-style', 'P3 style', [solid([0.21, 0.43, 0.65])])],
    });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ documentProfile: 'display-p3' })
    );
    const values = [
      ...result.snapshotInput.tokens.flatMap(token => Object.values(token.valuesByMode)),
      ...result.snapshotInput.supportedUsage.map(usage => usage.value),
    ];

    expect(result.snapshotInput.documentProfile).toBe('display-p3');
    expect(values).toHaveLength(3);
    expect(values.every(value => value.colorSpace === 'display-p3')).toBe(true);
    expect(values.every(value => !('hex' in value))).toBe(true);
    expect(values.map(value => value.components)).toEqual([
      [0.12, 0.34, 0.56],
      [0.21, 0.43, 0.65],
      [0.11, 0.22, 0.33],
    ]);
    expect(values[0].alpha).toBe(0.78);
  });

  it('caches repeated bound-variable lookups during usage traversal', async () => {
    const boundPaint = solid([0, 0, 0], {
      boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'shared-bound' } },
    });
    const nodes = [
      sceneNode({ id: 'bound-one', fills: [boundPaint] }),
      sceneNode({ id: 'bound-two', fills: [boundPaint] }),
    ];
    const currentPage = page('page-one', 'Bound variable uses', nodes);
    const sharedBound = {
      ...colorVariable({
        id: 'shared-bound',
        valuesByMode: { 'mode-light': { r: 0.1, g: 0.2, b: 0.3 } },
      }),
      resolveForConsumer: vi.fn(() => ({
        resolvedType: 'COLOR' as const,
        value: { r: 0.1, g: 0.2, b: 0.3 },
      })),
    } as Variable;
    const { host, spies } = hostFixture({ pages: [currentPage], currentPage });
    spies.getVariableByIdAsync.mockResolvedValue(sharedBound);

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ usageScope: 'current-page' })
    );

    expect(spies.getVariableByIdAsync).toHaveBeenCalledTimes(1);
    expect(result.snapshotInput.supportedUsage).toEqual([
      expect.objectContaining({ tokenId: 'shared-bound', count: 2 }),
    ]);
  });
});

describe('inventoryFigmaColorSystem observed literal source candidates', () => {
  function literalOnlyHost(nodes: readonly SceneNode[]): FigmaColorInventoryHost {
    const currentPage = page('page-literals', 'Literal palette', nodes);
    return hostFixture({ pages: [currentPage], currentPage }).host;
  }

  it('ranks exact opaque unbound sRGB usages without inventing roles or authored resources', async () => {
    const nodes = [
      sceneNode({ id: 'red-1', fills: [solid([1, 0, 0])] }),
      sceneNode({ id: 'blue-1', fills: [solid([0, 0, 1])] }),
      sceneNode({ id: 'red-2', fills: [solid([1, 0, 0])] }),
      sceneNode({ id: 'green-1', fills: [solid([0, 1, 0])] }),
      sceneNode({ id: 'blue-2', fills: [solid([0, 0, 1])] }),
      sceneNode({ id: 'red-3', fills: [solid([1, 0, 0])] }),
    ];

    const first = await inventoryFigmaColorSystem(
      literalOnlyHost(nodes),
      auditOptions({ usageScope: 'current-page' })
    );
    const second = await inventoryFigmaColorSystem(
      literalOnlyHost([...nodes].reverse()),
      auditOptions({ usageScope: 'current-page' })
    );
    const candidates = first.snapshotInput.tokens;

    expect(first.snapshotInput.resourceScope).toEqual({
      kind: 'all-local-resources',
      localVariableCount: 0,
      localStyleCount: 0,
    });
    expect(first.snapshotInput.modes).toEqual(['rendered']);
    expect(
      candidates.map(candidate => ({
        representation: candidate.sourceRepresentation,
        count: candidate.observedUsageCount,
        rank: candidate.observedUsageRank,
        hex: candidate.valuesByMode.rendered?.hex,
      }))
    ).toEqual([
      { representation: 'observed-literal', count: 3, rank: 1, hex: '#FF0000' },
      { representation: 'observed-literal', count: 2, rank: 2, hex: '#0000FF' },
      { representation: 'observed-literal', count: 1, rank: 3, hex: '#00FF00' },
    ]);
    expect(candidates.every(candidate => candidate.roleEvidence.length === 0)).toBe(true);
    expect(candidates.every(candidate => candidate.evidence.length > 0)).toBe(true);
    expect(candidates.every(candidate => candidate.id.startsWith('observed-literal:'))).toBe(true);
    expect(
      candidates.every(candidate => candidate.description?.includes('records canvas output only'))
    ).toBe(true);
    expect(
      second.snapshotInput.tokens.map(candidate => ({
        id: candidate.id,
        count: candidate.observedUsageCount,
        rank: candidate.observedUsageRank,
        hex: candidate.valuesByMode.rendered?.hex,
      }))
    ).toEqual(
      candidates.map(candidate => ({
        id: candidate.id,
        count: candidate.observedUsageCount,
        rank: candidate.observedUsageRank,
        hex: candidate.valuesByMode.rendered?.hex,
      }))
    );
    expect(createSourceSystemSnapshot(first.snapshotInput).sourceHash).toBe(
      createSourceSystemSnapshot(second.snapshotInput).sourceHash
    );
  });

  it('retains and aggregates exact remote-bound canvas colors without importing remote identity', async () => {
    const expressive = [0x56 / 255, 0x83 / 255, 0xd2 / 255] as const;
    const remoteVariable = (id: string): Variable =>
      ({
        ...colorVariable({ id, valuesByMode: { remote: { r: 0, g: 0, b: 0 } } }),
        resolveForConsumer: vi.fn(() => ({
          resolvedType: 'COLOR' as const,
          value: { r: expressive[0], g: expressive[1], b: expressive[2] },
        })),
      }) as Variable;
    const remoteById = new Map([
      ['remote-variable-id', remoteVariable('remote-variable-id')],
      ['remote-variable-b', remoteVariable('remote-variable-b')],
    ]);
    const nodes = [
      sceneNode({
        id: 'expressive-a-1',
        fills: [
          solid([0, 0, 0], {
            boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'remote-variable-id' } },
          }),
        ],
      }),
      sceneNode({
        id: 'expressive-b',
        fills: [
          solid([0, 0, 0], {
            boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'remote-variable-b' } },
          }),
        ],
      }),
      sceneNode({
        id: 'expressive-a-2',
        fills: [
          solid([0, 0, 0], {
            boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'remote-variable-id' } },
          }),
        ],
      }),
    ];
    const inventory = async (orderedNodes: readonly SceneNode[]) => {
      const currentPage = page('page-remote', 'Remote palette', orderedNodes);
      const fixture = hostFixture({ pages: [currentPage], currentPage });
      fixture.spies.getVariableByIdAsync.mockImplementation(async (id: string) => {
        return remoteById.get(id) ?? null;
      });
      return inventoryFigmaColorSystem(fixture.host, auditOptions({ usageScope: 'current-page' }));
    };

    const first = await inventory(nodes);
    const second = await inventory([...nodes].reverse());

    expect(first.snapshotInput.resourceScope).toMatchObject({
      localVariableCount: 0,
      localStyleCount: 0,
    });
    expect(first.snapshotInput.supportedUsage).toEqual([
      expect.objectContaining({ tokenId: 'remote-variable-b', count: 1 }),
      expect.objectContaining({ tokenId: 'remote-variable-id', count: 2 }),
    ]);
    expect(first.snapshotInput.tokens).toHaveLength(1);
    expect(first.snapshotInput.tokens[0]).toMatchObject({
      sourceRepresentation: 'observed-literal',
      observedUsageCount: 3,
      observedUsageRank: 1,
      valuesByMode: {
        'resolved-for-consumer': expect.objectContaining({
          hex: '#5683D2',
          components: expressive,
        }),
      },
      roleEvidence: [],
    });
    expect(first.snapshotInput.tokens[0]?.id).not.toContain('remote-variable');
    expect(first.snapshotInput.tokens[0]?.description).not.toContain('remote-variable');
    expect(first.snapshotInput.tokens[0]?.aliasTargetId).toBeUndefined();
    expect(first.snapshotInput.tokens[0]?.aliasTargetsByMode).toBeUndefined();
    expect(second.snapshotInput.tokens).toEqual(first.snapshotInput.tokens);
    expect(createSourceSystemSnapshot(second.snapshotInput).sourceHash).toBe(
      createSourceSystemSnapshot(first.snapshotInput).sourceHash
    );
  });

  it('groups unbound and remote-bound rows by exact mode/value, independent of input order', () => {
    const expressiveValue = {
      colorSpace: 'srgb' as const,
      hex: '#5683D2',
      components: [0x56 / 255, 0x83 / 255, 0xd2 / 255] as const,
      alpha: 1,
    };
    const usage: SourceColorUsage[] = [
      {
        id: 'usage-unbound',
        mode: 'rendered',
        value: expressiveValue,
        count: 1,
        evidence: [{ kind: 'figma-node', locator: 'unbound-node' }],
      },
      {
        id: 'usage-remote-a',
        tokenId: 'remote-variable-a',
        mode: 'rendered',
        value: expressiveValue,
        count: 2,
        evidence: [{ kind: 'figma-node', locator: 'remote-a-node' }],
      },
      {
        id: 'usage-remote-b',
        tokenId: 'remote-variable-b',
        mode: 'rendered',
        value: expressiveValue,
        count: 3,
        evidence: [{ kind: 'figma-node', locator: 'remote-b-node' }],
      },
    ];

    const first = materializeObservedLiteralSourceCandidates(usage);
    const second = materializeObservedLiteralSourceCandidates([...usage].reverse());

    expect(second).toEqual(first);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      observedUsageCount: 6,
      observedUsageRank: 1,
      valuesByMode: { rendered: expressiveValue },
    });
    expect(first[0]?.evidence.map(item => item.locator)).toEqual([
      'remote-a-node',
      'remote-b-node',
      'unbound-node',
    ]);
    expect(first[0]?.id).not.toContain('remote-variable');

    const differentMode = materializeObservedLiteralSourceCandidates([
      ...usage,
      { ...usage[0], id: 'usage-resolved-mode', mode: 'resolved-for-consumer' },
    ]);
    expect(differentMode).toHaveLength(2);
    expect(differentMode.map(candidate => Object.keys(candidate.valuesByMode)[0]).sort()).toEqual([
      'rendered',
      'resolved-for-consumer',
    ]);
  });

  it('does not add observed-literal fallback candidates when an authored token exists', async () => {
    const currentPage = page('page-authored', 'Authored palette', [
      sceneNode({ id: 'literal-red', fills: [solid([1, 0, 0])] }),
    ]);
    const { host } = hostFixture({
      pages: [currentPage],
      currentPage,
      variables: [
        colorVariable({
          id: 'authored-brand',
          valuesByMode: { 'mode-light': { r: 0.2, g: 0.4, b: 0.8 } },
        }),
      ],
      collections: [collection()],
    });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ usageScope: 'current-page' })
    );

    expect(result.snapshotInput.supportedUsage).toHaveLength(1);
    expect(result.snapshotInput.tokens.map(token => token.id)).toEqual(['authored-brand']);
    expect(
      result.snapshotInput.tokens.some(token => token.sourceRepresentation === 'observed-literal')
    ).toBe(false);
  });

  it('does not add fallback candidates when an unsupported local color resource exists', async () => {
    const currentPage = page('page-unsupported-authored', 'Authored palette', [
      sceneNode({ id: 'literal-red', fills: [solid([1, 0, 0])] }),
    ]);
    const { host } = hostFixture({
      pages: [currentPage],
      currentPage,
      styles: [paintStyle('gradient-style', 'Gradient brand', [gradient()])],
    });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ usageScope: 'current-page' })
    );

    expect(result.snapshotInput.resourceScope).toMatchObject({
      localVariableCount: 0,
      localStyleCount: 1,
    });
    expect(result.snapshotInput.supportedUsage).toHaveLength(1);
    expect(result.snapshotInput.tokens).toEqual([]);
    expect(() => createSourceSystemSnapshot(result.snapshotInput)).not.toThrow();
  });

  it('retains the same lexicographically smallest bounded evidence under traversal reversal', async () => {
    const nodes = Array.from({ length: 40 }, (_, index) =>
      sceneNode({
        id: `node-${index.toString().padStart(2, '0')}`,
        fills: [solid([1, 0, 0])],
      })
    );
    const first = await inventoryFigmaColorSystem(
      literalOnlyHost(nodes),
      auditOptions({ usageScope: 'current-page' })
    );
    const second = await inventoryFigmaColorSystem(
      literalOnlyHost([...nodes].reverse()),
      auditOptions({ usageScope: 'current-page' })
    );

    const firstEvidence = first.snapshotInput.tokens[0]?.evidence;
    const secondEvidence = second.snapshotInput.tokens[0]?.evidence;
    expect(firstEvidence).toEqual(secondEvidence);
    expect(firstEvidence).toHaveLength(24);
    expect(firstEvidence?.map(item => item.locator)).toEqual(
      Array.from({ length: 24 }, (_, index) => `node-${index.toString().padStart(2, '0')}`)
    );
    expect(createSourceSystemSnapshot(first.snapshotInput).sourceHash).toBe(
      createSourceSystemSnapshot(second.snapshotInput).sourceHash
    );
  });

  it('does not suppress same-hex structured values with different exact components', () => {
    const value = (components: readonly [number, number, number]): SourceColorValue => ({
      colorSpace: 'srgb',
      hex: '#808080',
      components,
      alpha: 1,
    });
    const authored: SourceColorToken = {
      id: 'authored.gray',
      name: 'Authored gray',
      path: ['authored', 'gray'],
      sourceRepresentation: 'authored-token',
      valuesByMode: { Default: value([0.5, 0.5, 0.5]) },
      evidence: [{ kind: 'figma-resource', locator: 'variable:authored.gray' }],
      roleEvidence: [],
    };
    const section: SourceColorSection = {
      kind: 'primary',
      title: 'Acme - Colors (Primary)',
      sourceNodeId: 'primary-frame',
      extractionMethod: 'explicit-heading',
      entries: [
        {
          id: 'gray-authored',
          name: 'Gray authored',
          order: 1,
          value: value([0.5, 0.5, 0.5]),
          evidence: [{ kind: 'figma-node', locator: 'gray-authored' }],
        },
        {
          id: 'gray-a',
          name: 'Gray A',
          order: 2,
          value: value([0.5001, 0.5001, 0.5001]),
          evidence: [{ kind: 'figma-node', locator: 'gray-a' }],
        },
        {
          id: 'gray-b',
          name: 'Gray B',
          order: 3,
          value: value([0.5002, 0.5002, 0.5002]),
          evidence: [{ kind: 'figma-node', locator: 'gray-b' }],
        },
      ],
      evidence: [{ kind: 'figma-node', locator: 'primary-frame' }],
    };

    const candidates = materializeStructuredSourceCandidates([section], [authored]);

    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map(candidate => candidate.id)).size).toBe(2);
    expect(candidates.map(candidate => candidate.valuesByMode.Source.components)).toEqual([
      [0.5001, 0.5001, 0.5001],
      [0.5002, 0.5002, 0.5002],
    ]);
  });

  it('keeps same-hex exact component variants distinct and unambiguous', async () => {
    const nodes = [
      sceneNode({ id: 'half-a', fills: [solid([0.5, 0.5, 0.5])] }),
      sceneNode({ id: 'half-b', fills: [solid([0.5, 0.5, 0.5])] }),
      sceneNode({ id: 'near-half', fills: [solid([0.5001, 0.5001, 0.5001])] }),
    ];
    const result = await inventoryFigmaColorSystem(
      literalOnlyHost(nodes),
      auditOptions({ usageScope: 'current-page' })
    );

    expect(result.snapshotInput.tokens).toHaveLength(2);
    expect(
      result.snapshotInput.tokens.map(token => ({
        id: token.id,
        name: token.name,
        count: token.observedUsageCount,
        rank: token.observedUsageRank,
        value: token.valuesByMode.rendered,
      }))
    ).toEqual([
      expect.objectContaining({
        name: 'Observed #808080 · rendered · [0.5, 0.5, 0.5]',
        count: 2,
        rank: 1,
        value: expect.objectContaining({ components: [0.5, 0.5, 0.5], hex: '#808080' }),
      }),
      expect.objectContaining({
        name: 'Observed #808080 · rendered · [0.5001, 0.5001, 0.5001]',
        count: 1,
        rank: 2,
        value: expect.objectContaining({ components: [0.5001, 0.5001, 0.5001], hex: '#808080' }),
      }),
    ]);
    expect(new Set(result.snapshotInput.tokens.map(token => token.id)).size).toBe(2);
  });

  it('admits a complete 345-color source surface instead of truncating presentation data', async () => {
    const nodes = Array.from({ length: 345 }, (_, index) => {
      const channel = index / 344;
      return sceneNode({
        id: `literal-${index}`,
        fills: [solid([channel, channel, channel])],
      });
    });

    const result = await inventoryFigmaColorSystem(
      literalOnlyHost(nodes),
      auditOptions({ usageScope: 'current-page' })
    );

    expect(MAX_OBSERVED_LITERAL_SOURCE_CANDIDATES).toBe(50_000);
    expect(result.snapshotInput.tokens).toHaveLength(345);
    expect(result.snapshotInput.tokens.map(token => token.observedUsageRank)).toEqual(
      Array.from({ length: 345 }, (_, index) => index + 1)
    );
  });

  it('fails explicitly instead of truncating when exact variants exceed transport capacity', () => {
    const usage = Array.from(
      { length: MAX_OBSERVED_LITERAL_SOURCE_CANDIDATES + 1 },
      (_, index): SourceColorUsage => {
        const channel = index / MAX_OBSERVED_LITERAL_SOURCE_CANDIDATES;
        const byte = Math.round(channel * 255)
          .toString(16)
          .padStart(2, '0')
          .toUpperCase();
        return {
          id: `usage-${index}`,
          mode: 'rendered',
          value: {
            colorSpace: 'srgb',
            hex: `#${byte}${byte}${byte}`,
            components: [channel, channel, channel],
            alpha: 1,
          },
          count: 1,
          evidence: [],
        };
      }
    );

    expect(() => materializeObservedLiteralSourceCandidates(usage)).toThrow(
      /exceed the snapshot token capacity of 50000; select a narrower usage scope/
    );
  });
});

describe('inventoryFigmaColorSystem cancellation', () => {
  it('returns a partial resource snapshot when cancellation interrupts variables', async () => {
    const currentPage = page('page-one', 'Cancelled resources', []);
    const { host, spies } = hostFixture({
      pages: [currentPage],
      variables: [
        colorVariable({ id: 'one', valuesByMode: { 'mode-light': { r: 1, g: 0, b: 0 } } }),
        colorVariable({ id: 'two', valuesByMode: { 'mode-light': { r: 0, g: 1, b: 0 } } }),
      ],
      collections: [collection()],
    });
    let cancellationChecks = 0;

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ isCancelled: () => ++cancellationChecks > 1 })
    );

    expect(result).toMatchObject({ cancelled: true, partial: true, scannedNodeCount: 0 });
    expect(result.snapshotInput.tokens.map(token => token.id)).toEqual(['one']);
    expect(result.snapshotInput.resourceScope).toMatchObject({
      localVariableCount: 2,
      localStyleCount: 0,
    });
    expect(spies.getLocalPaintStylesAsync).not.toHaveBeenCalled();
  });

  it('checks cancellation after an awaited alias target lookup', async () => {
    const currentPage = page('page-one', 'Cancelled alias lookup', []);
    const alias = colorVariable({
      id: 'remote-alias',
      valuesByMode: {
        'mode-light': { type: 'VARIABLE_ALIAS', id: 'late-target' },
      },
    });
    const lateTarget = colorVariable({
      id: 'late-target',
      valuesByMode: { 'mode-light': { r: 1, g: 0, b: 0 } },
    });
    const { host, spies } = hostFixture({
      pages: [currentPage],
      variables: [alias],
      collections: [collection()],
    });
    let cancelled = false;
    spies.getVariableByIdAsync.mockImplementation(async () => {
      cancelled = true;
      return lateTarget;
    });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ isCancelled: () => cancelled })
    );

    expect(result).toMatchObject({ cancelled: true, partial: true });
    expect(result.snapshotInput.tokens).toEqual([]);
    expect(result.snapshotInput.unsupportedUsage).toEqual([]);
    expect(spies.getLocalPaintStylesAsync).not.toHaveBeenCalled();
  });

  it('returns the completed batches as partial evidence when usage scanning is cancelled', async () => {
    const nodes = Array.from({ length: 300 }, (_, index) =>
      sceneNode({ id: `node-${index}`, fills: [solid([1, 0, 0])] })
    );
    const currentPage = page('page-one', 'Large page', nodes);
    const { host, spies } = hostFixture({ pages: [currentPage], currentPage });
    let cancelled = false;

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({
        usageScope: 'current-page',
        onProgress: event => {
          if (event.phase === 'usage') cancelled = true;
        },
        isCancelled: () => cancelled,
        includeEnabledLibraryDescriptors: true,
      })
    );

    expect(result).toMatchObject({ cancelled: true, partial: true, scannedNodeCount: 250 });
    expect(result.snapshotInput.supportedUsage).toEqual([
      expect.objectContaining({ count: 250, value: expect.objectContaining({ hex: '#FF0000' }) }),
    ]);
    expect(spies.getAvailableLibraryVariableCollectionsAsync).not.toHaveBeenCalled();
    expect(result.libraryBoundaryNote).toContain('metadata descriptors only');
  });

  it('marks partial enabled-library enumeration as cancelled instead of complete', async () => {
    const currentPage = page('page-one', 'Libraries', []);
    const { host, spies } = hostFixture({
      pages: [currentPage],
      libraryCollections: [
        { key: 'library-one', name: 'One', libraryName: 'Design system' },
        { key: 'library-two', name: 'Two', libraryName: 'Design system' },
      ] as LibraryVariableCollection[],
      libraryVariablesByCollection: {
        'library-one': [
          { key: 'remote-one', name: 'Remote/One', resolvedType: 'COLOR' },
        ] as LibraryVariable[],
        'library-two': [
          { key: 'remote-two', name: 'Remote/Two', resolvedType: 'COLOR' },
        ] as LibraryVariable[],
      },
    });
    let cancelled = false;

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({
        includeEnabledLibraryDescriptors: true,
        onProgress: event => {
          if (event.phase === 'libraries' && event.completed === 1) cancelled = true;
        },
        isCancelled: () => cancelled,
      })
    );

    expect(result).toMatchObject({ cancelled: true, partial: true });
    expect(result.enabledLibraryDescriptors.map(item => item.collectionKey)).toEqual([
      'library-one',
    ]);
    expect(spies.getVariablesInLibraryCollectionAsync).toHaveBeenCalledTimes(1);
  });
});

describe('inventoryFigmaColorSystem enabled-library boundary', () => {
  it('returns metadata descriptors separately without importing them into the source snapshot', async () => {
    const currentPage = page('page-one', 'Library metadata', []);
    const { host, spies } = hostFixture({
      pages: [currentPage],
      variables: [
        colorVariable({
          id: 'local-variable',
          valuesByMode: { 'mode-light': { r: 1, g: 0, b: 0 } },
        }),
      ],
      collections: [collection()],
      libraryCollections: [
        { key: 'remote-collection', name: 'Primitives', libraryName: 'Remote system' },
      ] as LibraryVariableCollection[],
      libraryVariablesByCollection: {
        'remote-collection': [
          { key: 'remote-color', name: 'Remote/Blue', resolvedType: 'COLOR' },
          { key: 'remote-string', name: 'Remote/Label', resolvedType: 'STRING' },
        ] as LibraryVariable[],
      },
    });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ includeEnabledLibraryDescriptors: true })
    );

    expect(result.enabledLibraryDescriptors).toEqual([
      {
        collectionKey: 'remote-collection',
        collectionName: 'Primitives',
        libraryName: 'Remote system',
        variables: [
          { key: 'remote-color', name: 'Remote/Blue', resolvedType: 'COLOR' },
          { key: 'remote-string', name: 'Remote/Label', resolvedType: 'STRING' },
        ],
      },
    ]);
    expect(result.snapshotInput.tokens.map(token => token.id)).toEqual(['local-variable']);
    expect(JSON.stringify(result.snapshotInput)).not.toContain('remote-color');
    expect(result.snapshotInput.resourceScope).toMatchObject({ localVariableCount: 1 });
    expect(result.libraryBoundaryNote).toContain('metadata descriptors only');
    expect(spies.getVariableByIdAsync).not.toHaveBeenCalledWith('remote-color');
    for (const mutationCall of spies.mutationCalls) expect(mutationCall).not.toHaveBeenCalled();
  });

  it('fails soft when enabled-library metadata is unavailable', async () => {
    const currentPage = page('page-one', 'Library unavailable', []);
    const { host } = hostFixture({
      pages: [currentPage],
      libraryError: new Error('teamlibrary permission denied'),
    });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ includeEnabledLibraryDescriptors: true })
    );

    expect(result).toMatchObject({ cancelled: false, partial: false });
    expect(result.enabledLibraryDescriptors).toEqual([]);
    expect(result.libraryBoundaryNote).toContain('teamlibrary permission denied');
  });

  it('bounds enabled-library collections to the UI transport envelope', async () => {
    const currentPage = page('page-one', 'Large library list', []);
    const libraryCollections = Array.from({ length: 1_001 }, (_, index) => ({
      key: `library-${index}`,
      name: `Collection ${index}`,
      libraryName: 'Remote system',
    })) as LibraryVariableCollection[];
    const { host, spies } = hostFixture({ pages: [currentPage], libraryCollections });

    const result = await inventoryFigmaColorSystem(
      host,
      auditOptions({ includeEnabledLibraryDescriptors: true })
    );

    expect(result.enabledLibraryDescriptors).toHaveLength(1_000);
    expect(spies.getVariablesInLibraryCollectionAsync).toHaveBeenCalledTimes(1_000);
    expect(result.libraryBoundaryNote).toContain('bounded to 1000 collections');
  });

  it('never invokes mutation-capable document, node, style, or variable methods', async () => {
    const child = sceneNode({ id: 'read-only-child', fills: [solid([0.1, 0.2, 0.3])] });
    const currentPage = page('page-one', 'Read only', [child]);
    currentPage.selection = [child];
    const { host, spies } = hostFixture({
      pages: [currentPage],
      currentPage,
      variables: [
        colorVariable({
          id: 'read-only-variable',
          valuesByMode: { 'mode-light': { r: 0.1, g: 0.2, b: 0.3 } },
        }),
      ],
      collections: [collection()],
      styles: [paintStyle('read-only-style', 'Read only style', [solid([0.4, 0.5, 0.6])])],
    });

    const result = await inventoryFigmaColorSystem(host, auditOptions());

    expect(result.cancelled).toBe(false);
    for (const mutationCall of spies.mutationCalls) expect(mutationCall).not.toHaveBeenCalled();
    expect(
      (currentPage as unknown as { appendChild: ReturnType<typeof vi.fn> }).appendChild
    ).not.toHaveBeenCalled();
    expect(
      (child as unknown as { remove: ReturnType<typeof vi.fn> }).remove
    ).not.toHaveBeenCalled();
    expect(
      (child as unknown as { setPluginData: ReturnType<typeof vi.fn> }).setPluginData
    ).not.toHaveBeenCalled();
  });
});
