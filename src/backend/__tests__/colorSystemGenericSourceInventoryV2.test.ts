import { describe, expect, it, vi } from 'vitest';
import type {
  FigmaColorInventoryHost,
  FigmaColorInventoryOptions,
} from '../colorSystemAuditInventory';
import { MAX_FIGMA_COLOR_TRAVERSED_NODES } from '../colorSystemAuditInventory';
import { inventoryColorSystemGenericSourceV2 } from '../colorSystemGenericSourceInventoryV2';

const CAPTURED_AT = '2026-08-21T12:00:00.000Z';

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
      { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
      { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
    ],
  };
}

function sceneNode(id: string, fills: readonly Paint[] = []): SceneNode {
  return {
    id,
    name: id,
    type: 'RECTANGLE',
    fills: [...fills],
    strokes: [],
    fillStyleId: '',
    strokeStyleId: '',
    opacity: 1,
    blendMode: 'NORMAL',
    visible: true,
    parent: null,
    remove: vi.fn(),
    setPluginData: vi.fn(),
    setSharedPluginData: vi.fn(),
  } as unknown as SceneNode;
}

function textNode(id: string, fills: readonly Paint[]): SceneNode {
  return {
    ...sceneNode(id, fills),
    type: 'TEXT',
    characters: id,
  } as unknown as SceneNode;
}

function contextFrame(id: string, name: string, children: readonly SceneNode[]): SceneNode {
  const result = {
    ...sceneNode(id),
    name,
    type: 'FRAME',
    children: [...children],
  } as unknown as SceneNode;
  for (const child of children) Object.assign(child, { parent: result });
  return result;
}

function paletteSection(input: {
  id: string;
  kind: 'Primary' | 'Secondary';
  colorName: string;
  hex: string;
  components: readonly [number, number, number];
}): SceneNode {
  const swatch = sceneNode(`${input.id}-swatch`, [solid(input.components)]);
  Object.assign(swatch, {
    absoluteBoundingBox: { x: 0, y: 0, width: 96, height: 48 },
  });
  const label = textNode(`${input.id}-label`, []);
  Object.assign(label, {
    characters: `${input.colorName}\n${input.hex}`,
    absoluteBoundingBox: { x: 0, y: 52, width: 96, height: 24 },
  });
  const card = contextFrame(`${input.id}-card`, `${input.colorName} card`, [swatch, label]);
  Object.assign(card, {
    absoluteBoundingBox: { x: 0, y: 0, width: 96, height: 80 },
  });
  const section = contextFrame(input.id, `Brand - Colors (${input.kind})`, [card]);
  Object.assign(section, {
    absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 104 },
  });
  return section;
}

function page(
  id: string,
  children: readonly SceneNode[],
  progressive = true
): PageNode & { loadAsync?: () => Promise<void> } {
  const result = {
    id,
    name: id,
    type: 'PAGE',
    children: [...children],
    selection: [] as SceneNode[],
    parent: null,
    appendChild: vi.fn(),
    setPluginData: vi.fn(),
    ...(progressive ? { loadAsync: vi.fn(async () => undefined) } : {}),
  } as unknown as PageNode & { loadAsync?: () => Promise<void> };
  for (const child of children) Object.assign(child, { parent: result });
  return result;
}

function collection(input: {
  id: string;
  name?: string;
  modes: readonly { modeId: string; name: string }[];
  defaultModeId?: string;
}): VariableCollection {
  return {
    id: input.id,
    name: input.name ?? input.id,
    defaultModeId: input.defaultModeId ?? input.modes[0].modeId,
    modes: [...input.modes],
  } as unknown as VariableCollection;
}

function variable(input: {
  id: string;
  collectionId: string;
  valuesByMode: Variable['valuesByMode'];
  name?: string;
  description?: string;
  scopes?: readonly VariableScope[];
}): Variable {
  return {
    id: input.id,
    key: `key-${input.id}`,
    name: input.name ?? input.id,
    description: input.description ?? '',
    resolvedType: 'COLOR',
    variableCollectionId: input.collectionId,
    valuesByMode: input.valuesByMode,
    scopes: [...(input.scopes ?? ['ALL_FILLS'])],
  } as unknown as Variable;
}

function style(id: string, name: string, paints: readonly Paint[]): PaintStyle {
  return {
    id,
    key: `key-${id}`,
    name,
    description: '',
    paints: [...paints],
  } as unknown as PaintStyle;
}

interface HostReceipt {
  host: FigmaColorInventoryHost;
  controls: {
    setCurrentPage(page: PageNode): void;
  };
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
  pages: readonly (PageNode & { loadAsync?: () => Promise<void> })[];
  currentPage?: PageNode;
  variables?: readonly Variable[];
  collections?: readonly VariableCollection[];
  styles?: readonly PaintStyle[];
  includeLibrary?: boolean;
}): HostReceipt {
  const rootAppendChild = vi.fn();
  const rootSetPluginData = vi.fn();
  const root = {
    id: 'document',
    name: 'Generic source test',
    type: 'DOCUMENT',
    children: [...input.pages],
    appendChild: rootAppendChild,
    setPluginData: rootSetPluginData,
  } as unknown as DocumentNode;
  for (const child of input.pages) Object.assign(child, { parent: root });

  const variables = [...(input.variables ?? [])];
  const getLocalVariablesAsync = vi.fn(async () => variables);
  const getLocalVariableCollectionsAsync = vi.fn(async () => [...(input.collections ?? [])]);
  const getVariableByIdAsync = vi.fn(
    async (id: string) => variables.find(item => item.id === id) ?? null
  );
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
  let currentPage = input.currentPage ?? input.pages[0];

  const getLocalPaintStylesAsync = vi.fn(async () => [...(input.styles ?? [])]);
  const getNodeByIdAsync = vi.fn(async (id: string) => (id === root.id ? root : null));
  const loadAllPagesAsync = vi.fn(async () => undefined);
  const createPaintStyle = vi.fn();
  const getAvailableLibraryVariableCollectionsAsync = vi.fn(
    async () =>
      [
        { key: 'remote-collection', name: 'Remote colors', libraryName: 'Shared library' },
      ] as LibraryVariableCollection[]
  );
  const getVariablesInLibraryCollectionAsync = vi.fn(
    async () =>
      [
        { key: 'remote-variable', name: 'Remote/Accent', resolvedType: 'COLOR' },
      ] as LibraryVariable[]
  );
  const importVariableByKeyFromLibraryAsync = vi.fn();

  class PrototypeBackedHost {
    readonly root = root;
    readonly variables = variablesApi;
    readonly teamLibrary =
      input.includeLibrary === false
        ? undefined
        : {
            getAvailableLibraryVariableCollectionsAsync,
            getVariablesInLibraryCollectionAsync,
            importVariableByKeyAsync: importVariableByKeyFromLibraryAsync,
          };

    get currentPage(): PageNode {
      return currentPage;
    }

    async getLocalPaintStylesAsync(): Promise<PaintStyle[]> {
      return getLocalPaintStylesAsync();
    }

    async getNodeByIdAsync(id: string): Promise<BaseNode | null> {
      return getNodeByIdAsync(id);
    }

    async loadAllPagesAsync(): Promise<void> {
      return loadAllPagesAsync();
    }

    createPaintStyle(): void {
      createPaintStyle();
    }
  }

  return {
    host: new PrototypeBackedHost() as unknown as FigmaColorInventoryHost,
    controls: {
      setCurrentPage(pageNode: PageNode): void {
        currentPage = pageNode;
      },
    },
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
        importVariableByKeyFromLibraryAsync,
        createPaintStyle,
      ],
    },
  };
}

function options(overrides: Partial<FigmaColorInventoryOptions> = {}): FigmaColorInventoryOptions {
  return {
    usageScope: 'current-page',
    documentProfile: 'srgb',
    sourceLocator: 'figma://generic-source-test',
    authorization: { status: 'user-authorized' },
    includeEnabledLibraryDescriptors: false,
    confirmWholeFile: false,
    capturedAt: CAPTURED_AT,
    ...overrides,
  };
}

function exactSourceFixture(progressive = true): HostReceipt {
  const first = page('page-one', [sceneNode('usage-red', [solid([1, 0, 0])])], progressive);
  const second = page('page-two', [sceneNode('usage-blue', [solid([0, 0, 1])])], progressive);
  const modes = [
    { modeId: 'mode-light', name: 'Light' },
    { modeId: 'mode-dark', name: 'Dark' },
  ];
  const variables = [
    variable({
      id: 'variable-primary',
      name: 'Primary/Brand',
      collectionId: 'collection-core',
      valuesByMode: {
        'mode-light': { r: 0.1, g: 0.2, b: 0.3, a: 0.8 },
        'mode-dark': { r: 0.8, g: 0.7, b: 0.6, a: 1 },
      },
      scopes: ['STROKE_COLOR', 'ALL_FILLS'],
    }),
    variable({
      id: 'variable-secondary',
      name: 'Secondary/Accent',
      collectionId: 'collection-core',
      valuesByMode: {
        'mode-light': { type: 'VARIABLE_ALIAS', id: 'variable-primary' },
        'mode-dark': { type: 'VARIABLE_ALIAS', id: 'variable-primary' },
      },
    }),
  ];
  return hostFixture({
    pages: [first, second],
    currentPage: first,
    variables,
    collections: [
      collection({
        id: 'collection-core',
        name: 'Core colors',
        modes,
        defaultModeId: 'mode-light',
      }),
    ],
    styles: [
      style('style-bound', 'Secondary/Bound', [
        solid([0.1, 0.2, 0.3], {
          boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'variable-primary' } },
        }),
      ]),
      style('style-gradient', 'Product Graphics/Gradient', [gradient()]),
    ],
  });
}

describe('inventoryColorSystemGenericSourceV2', () => {
  it('uses one immutable inventory pass, preserves raw evidence, loads pages progressively, and performs zero mutations/imports', async () => {
    const { host, spies } = exactSourceFixture(true);

    const result = await inventoryColorSystemGenericSourceV2(
      host,
      options({
        usageScope: 'whole-file',
        confirmWholeFile: true,
        includeEnabledLibraryDescriptors: true,
      })
    );

    expect(result.status).toBe('ready');
    expect(result.snapshot).not.toBeNull();
    expect(result.auditInventory?.rawEvidence?.colorVariables).toHaveLength(2);
    expect(spies.getLocalVariablesAsync).toHaveBeenCalledOnce();
    expect(spies.getLocalVariableCollectionsAsync).toHaveBeenCalledOnce();
    expect(spies.getLocalPaintStylesAsync).toHaveBeenCalledOnce();
    expect(spies.loadAllPagesAsync).not.toHaveBeenCalled();
    for (const pageNode of host.root.children) {
      expect(
        (pageNode as PageNode & { loadAsync?: ReturnType<typeof vi.fn> }).loadAsync
      ).toHaveBeenCalledOnce();
    }

    const snapshot = result.snapshot;
    if (!snapshot) throw new Error('Expected a generic source snapshot.');
    expect(snapshot.scope).toMatchObject({
      usageScope: 'whole-file',
      loadedPageIds: ['page-one', 'page-two'],
      excludedPageIds: [],
      coverage: 'complete-supported-scope',
    });
    expect(
      snapshot.variables.find(item => item.variableId === 'variable-secondary')?.valuesByMode
    ).toMatchObject([
      {
        modeId: 'mode-light',
        rawValue: { kind: 'alias', targetVariableId: 'variable-primary' },
        resolution: 'resolved-alias',
      },
      {
        modeId: 'mode-dark',
        rawValue: { kind: 'alias', targetVariableId: 'variable-primary' },
        resolution: 'resolved-alias',
      },
    ]);
    expect(snapshot.variables.find(item => item.variableId === 'variable-primary')?.scopes).toEqual(
      ['ALL_FILLS', 'STROKE_COLOR']
    );
    expect(snapshot.paintStyles.find(item => item.styleId === 'style-bound')).toMatchObject({
      directDeclaration: { kind: 'alias', targetVariableId: 'variable-primary' },
      governingEligibility: 'eligible',
    });
    expect(snapshot.paintStyles.find(item => item.styleId === 'style-gradient')).toMatchObject({
      directDeclaration: null,
      governingEligibility: 'unsupported',
      paints: [{ type: 'GRADIENT_LINEAR', order: 1 }],
    });
    expect(snapshot.unsupported.map(item => item.kind)).toEqual(
      expect.arrayContaining([
        'context-dependent-color',
        'unsupported-paint',
        'remote-descriptor-only',
      ])
    );
    expect(snapshot.usageEvidence.every(item => item.contextKinds[0] === 'unknown')).toBe(true);
    expect(snapshot.enabledLibraryDescriptors).toMatchObject([
      {
        collectionKey: 'remote-collection',
        variables: [{ key: 'remote-variable', resolvedType: 'COLOR' }],
      },
    ]);
    expect(spies.getAvailableLibraryVariableCollectionsAsync).toHaveBeenCalledOnce();
    expect(spies.getVariablesInLibraryCollectionAsync).toHaveBeenCalledOnce();
    for (const mutation of spies.mutationCalls) expect(mutation).not.toHaveBeenCalled();
  });

  it('uses the compatibility loadAllPagesAsync fallback only when PageNode.loadAsync is unavailable', async () => {
    const { host, spies } = exactSourceFixture(false);

    const result = await inventoryColorSystemGenericSourceV2(
      host,
      options({ usageScope: 'whole-file', confirmWholeFile: true })
    );

    expect(result.status).toBe('ready');
    expect(spies.loadAllPagesAsync).toHaveBeenCalledOnce();
    expect(result.snapshot?.scope.loadedPageIds).toEqual(['page-one', 'page-two']);
  });

  it('freezes selection roots, page identity, palette extraction, and provenance before async host reads', async () => {
    const initialSection = paletteSection({
      id: 'secondary-initial',
      kind: 'Secondary',
      colorName: 'Initial red',
      hex: '#FF0000',
      components: [1, 0, 0],
    });
    const laterSection = paletteSection({
      id: 'secondary-later',
      kind: 'Secondary',
      colorName: 'Later blue',
      hex: '#0000FF',
      components: [0, 0, 1],
    });
    const initialPage = page('page-initial', [initialSection]);
    const laterPage = page('page-later', [laterSection]);
    initialPage.selection = [initialSection];
    laterPage.selection = [laterSection];
    const { host, controls, spies } = hostFixture({
      pages: [initialPage, laterPage],
      currentPage: initialPage,
      includeLibrary: false,
    });
    spies.getLocalVariablesAsync.mockImplementationOnce(async () => {
      initialPage.selection = [laterSection];
      controls.setCurrentPage(laterPage);
      return [];
    });

    const result = await inventoryColorSystemGenericSourceV2(
      host,
      options({ usageScope: 'selection' })
    );

    expect(result.status).toBe('ready');
    expect(result.snapshot?.scope).toEqual({
      kind: 'selection',
      usageScope: 'selection',
      selectedNodeIds: ['secondary-initial'],
      loadedPageIds: ['page-initial'],
      excludedPageIds: ['page-later'],
      coverage: 'complete-supported-scope',
    });
    expect(result.snapshot?.usageEvidence.map(item => item.value.components)).toContainEqual([
      1, 0, 0,
    ]);
    expect(result.snapshot?.usageEvidence.map(item => item.value.components)).not.toContainEqual([
      0, 0, 1,
    ]);
    expect(result.snapshot?.paletteStructures).toMatchObject([
      {
        sectionKind: 'secondary',
        sourceNodeId: 'secondary-initial',
        entries: [{ name: 'Initial red', value: { components: [1, 0, 0] } }],
      },
    ]);
  });

  it('freezes current-page evidence and excludes irrelevant selection from the content hash', async () => {
    const initialSection = paletteSection({
      id: 'primary-current',
      kind: 'Primary',
      colorName: 'Current red',
      hex: '#FF0000',
      components: [1, 0, 0],
    });
    const laterSection = paletteSection({
      id: 'primary-later',
      kind: 'Primary',
      colorName: 'Later blue',
      hex: '#0000FF',
      components: [0, 0, 1],
    });
    const initialPage = page('page-current', [initialSection]);
    const laterPage = page('page-other', [laterSection]);
    initialPage.selection = [initialSection];
    laterPage.selection = [laterSection];
    const { host, controls, spies } = hostFixture({
      pages: [initialPage, laterPage],
      currentPage: initialPage,
      includeLibrary: false,
    });
    spies.getLocalVariablesAsync.mockImplementationOnce(async () => {
      initialPage.selection = [];
      controls.setCurrentPage(laterPage);
      return [];
    });

    const duringChange = await inventoryColorSystemGenericSourceV2(host, options());
    controls.setCurrentPage(initialPage);
    initialPage.selection = [initialSection];
    const withDifferentSelection = await inventoryColorSystemGenericSourceV2(host, options());

    expect(duringChange.snapshot?.scope).toEqual({
      kind: 'current-file',
      usageScope: 'current-page',
      selectedNodeIds: [],
      loadedPageIds: ['page-current'],
      excludedPageIds: ['page-other'],
      coverage: 'complete-supported-scope',
    });
    expect(duringChange.snapshot?.paletteStructures.map(item => item.sourceNodeId)).toEqual([
      'primary-current',
    ]);
    expect(
      duringChange.snapshot?.usageEvidence.map(item => item.value.components)
    ).not.toContainEqual([0, 0, 1]);
    expect(withDifferentSelection.snapshot?.scope.selectedNodeIds).toEqual([]);
    expect(withDifferentSelection.snapshot?.currentFileContentHash).toBe(
      duringChange.snapshot?.currentFileContentHash
    );
    expect(withDifferentSelection.snapshot?.sourceSnapshotHash).toBe(
      duringChange.snapshot?.sourceSnapshotHash
    );
  });

  it('freezes whole-file pages and excludes current selection from freshness even if the host changes mid-analysis', async () => {
    const firstSection = paletteSection({
      id: 'secondary-first-page',
      kind: 'Secondary',
      colorName: 'First red',
      hex: '#FF0000',
      components: [1, 0, 0],
    });
    const secondSection = paletteSection({
      id: 'secondary-second-page',
      kind: 'Primary',
      colorName: 'Second blue',
      hex: '#0000FF',
      components: [0, 0, 1],
    });
    const lateSection = paletteSection({
      id: 'secondary-late-page',
      kind: 'Secondary',
      colorName: 'Late green',
      hex: '#00FF00',
      components: [0, 1, 0],
    });
    const firstPage = page('page-first', [firstSection]);
    const secondPage = page('page-second', [secondSection]);
    const latePage = page('page-late', [lateSection]);
    firstPage.selection = [firstSection];
    latePage.selection = [lateSection];
    const { host, controls, spies } = hostFixture({
      pages: [firstPage, secondPage],
      currentPage: firstPage,
      includeLibrary: false,
    });
    spies.getLocalVariablesAsync.mockImplementationOnce(async () => {
      Object.assign(latePage, { parent: host.root });
      (host.root.children as PageNode[]).push(latePage);
      controls.setCurrentPage(latePage);
      return [];
    });

    const duringChange = await inventoryColorSystemGenericSourceV2(
      host,
      options({ usageScope: 'whole-file', confirmWholeFile: true })
    );

    const stableFirst = page('page-first', [
      paletteSection({
        id: 'secondary-first-page',
        kind: 'Secondary',
        colorName: 'First red',
        hex: '#FF0000',
        components: [1, 0, 0],
      }),
    ]);
    const stableSecond = page('page-second', [
      paletteSection({
        id: 'secondary-second-page',
        kind: 'Primary',
        colorName: 'Second blue',
        hex: '#0000FF',
        components: [0, 0, 1],
      }),
    ]);
    stableFirst.selection = [];
    stableSecond.selection = [stableSecond.children[0]];
    const stableHost = hostFixture({
      pages: [stableFirst, stableSecond],
      currentPage: stableFirst,
      includeLibrary: false,
    }).host;
    const stable = await inventoryColorSystemGenericSourceV2(
      stableHost,
      options({ usageScope: 'whole-file', confirmWholeFile: true })
    );

    expect(duringChange.snapshot?.scope).toEqual({
      kind: 'current-file',
      usageScope: 'whole-file',
      selectedNodeIds: [],
      loadedPageIds: ['page-first', 'page-second'],
      excludedPageIds: [],
      coverage: 'complete-supported-scope',
    });
    expect(duringChange.snapshot?.paletteStructures.map(item => item.sourceNodeId).sort()).toEqual([
      'secondary-first-page',
      'secondary-second-page',
    ]);
    expect(
      duringChange.snapshot?.usageEvidence.map(item => item.value.components)
    ).not.toContainEqual([0, 1, 0]);
    expect(latePage.loadAsync as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(stable.snapshot?.scope.selectedNodeIds).toEqual([]);
    expect(stable.snapshot?.currentFileContentHash).toBe(
      duringChange.snapshot?.currentFileContentHash
    );
    expect(stable.snapshot?.sourceSnapshotHash).toBe(duringChange.snapshot?.sourceSnapshotHash);
  });

  it('classifies only TEXT nodes and explicit ancestor context labels without geometry inference', async () => {
    const text = textNode('body-copy', [solid([1, 0, 0])]);
    const chartMark = sceneNode('chart-mark', [solid([0, 1, 0])]);
    const graphicMark = sceneNode('graphic-mark', [solid([0, 0, 1])]);
    const unlabeledMark = sceneNode('unlabeled-mark', [solid([1, 1, 0])]);
    const unlabeledSameColor = sceneNode('unlabeled-same-color', [solid([1, 0, 0])]);
    const currentPage = page('page-contexts', [
      text,
      contextFrame('chart-context', 'Usage context: Chart', [chartMark]),
      contextFrame('graphic-context', '[Context: Product Graphics]', [graphicMark]),
      contextFrame('geometry-only', 'Chart 2x2 grid', [unlabeledMark]),
      unlabeledSameColor,
    ]);
    const { host } = hostFixture({ pages: [currentPage], includeLibrary: false });

    const result = await inventoryColorSystemGenericSourceV2(host, options());
    const snapshot = result.snapshot;
    if (!snapshot) throw new Error('Expected a generic source snapshot.');
    const contextFor = (components: readonly number[]) =>
      snapshot.usageEvidence.find(item =>
        item.value.components.every((channel, index) => channel === components[index])
      );

    expect(contextFor([1, 0, 0])?.contextKinds).toEqual(['text']);
    expect(contextFor([0, 1, 0])?.contextKinds).toEqual(['chart']);
    expect(contextFor([0, 0, 1])?.contextKinds).toEqual(['product-graphic']);
    expect(contextFor([1, 1, 0])?.contextKinds).toEqual(['unknown']);
    expect(
      snapshot.usageEvidence
        .filter(item =>
          item.value.components.every((channel, index) => channel === [1, 0, 0][index])
        )
        .map(item => item.contextKinds)
    ).toEqual([['text'], ['unknown']]);

    const chartUsage = contextFor([0, 1, 0]);
    const chartEvidence = snapshot.evidence.filter(item =>
      chartUsage?.evidenceIds.includes(item.evidenceId)
    );
    expect(chartEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'figma-node',
          locator: 'chart-context',
          detail: expect.stringContaining('Explicit ancestor label'),
        }),
      ])
    );
  });

  it('returns typed capacity with no partial snapshot after exactly 100,001 node visits', async () => {
    const node = sceneNode('repeated-cap-node');
    const currentPage = page(
      'page-node-cap',
      Array.from({ length: MAX_FIGMA_COLOR_TRAVERSED_NODES + 1 }, () => node)
    );
    const { host, spies } = hostFixture({ pages: [currentPage], includeLibrary: false });
    const progress: number[] = [];

    const result = await inventoryColorSystemGenericSourceV2(
      host,
      options({
        onProgress: event => {
          if (event.phase === 'usage') progress.push(event.completed);
        },
      })
    );

    expect(result).toMatchObject({ status: 'capacity', snapshot: null, auditInventory: null });
    expect(result.message).toContain(`capacity of ${MAX_FIGMA_COLOR_TRAVERSED_NODES} nodes`);
    expect(progress[progress.length - 1]).toBe(MAX_FIGMA_COLOR_TRAVERSED_NODES);
    for (const mutation of spies.mutationCalls) expect(mutation).not.toHaveBeenCalled();
  });

  it('returns typed capacity with no partial snapshot for 50,001 combined Variables and Styles', async () => {
    const currentPage = page('page-resource-cap', []);
    const localCollection = collection({
      id: 'collection-cap',
      modes: [{ modeId: 'mode-default', name: 'Default' }],
    });
    const localVariable = variable({
      id: 'variable-cap',
      collectionId: localCollection.id,
      valuesByMode: { 'mode-default': { r: 0, g: 0, b: 0 } },
    });
    const repeatedStyle = style('style-cap', 'Style cap', [solid([0, 0, 0])]);
    const { host, spies } = hostFixture({
      pages: [currentPage],
      variables: [localVariable],
      collections: [localCollection],
      styles: Array.from({ length: 50_000 }, () => repeatedStyle),
      includeLibrary: false,
    });

    const result = await inventoryColorSystemGenericSourceV2(host, options());

    expect(result).toMatchObject({ status: 'capacity', snapshot: null, auditInventory: null });
    expect(result.message).toContain(
      'Combined local color declarations (Variables, Paint Styles, and palette entries) exceed the capacity of 50000'
    );
    for (const mutation of spies.mutationCalls) expect(mutation).not.toHaveBeenCalled();
  });

  it.each(['display-p3', 'legacy', 'unknown'] as const)(
    'preserves exact %s channels but blocks the current sRGB policy engine',
    async documentProfile => {
      const currentPage = page(`page-${documentProfile}`, []);
      const localCollection = collection({
        id: 'collection-profile',
        modes: [{ modeId: 'mode-default', name: 'Default' }],
      });
      const localVariable = variable({
        id: 'variable-profile',
        collectionId: localCollection.id,
        valuesByMode: {
          'mode-default': { r: 0.123456789012, g: 0.5, b: 0.9, a: 0.75 },
        },
      });
      const { host } = hostFixture({
        pages: [currentPage],
        variables: [localVariable],
        collections: [localCollection],
        includeLibrary: false,
      });

      const result = await inventoryColorSystemGenericSourceV2(host, options({ documentProfile }));

      expect(result.status).toBe('unsupported-profile');
      const mode = result.snapshot?.variables[0].valuesByMode[0];
      expect(mode?.rawValue).toMatchObject({
        kind: 'color',
        value: {
          colorSpace: documentProfile === 'display-p3' ? 'display-p3' : 'unverified',
          components: [0.123456789012, 0.5, 0.9],
          alpha: 0.75,
        },
      });
      expect(mode?.resolution).toBe(
        documentProfile === 'display-p3' ? 'literal' : 'unsupported-profile'
      );
      expect(result.snapshot?.unsupported.map(item => item.kind)).toEqual(
        expect.arrayContaining(['unsupported-profile', 'context-dependent-color'])
      );
    }
  );

  it('types missing, cyclic, cross-collection, duplicate-mode-name, and depth alias boundaries', async () => {
    const currentPage = page('page-aliases', []);
    const duplicateModes = [
      { modeId: 'mode-one', name: 'Default' },
      { modeId: 'mode-two', name: 'Default' },
    ];
    const collectionA = collection({ id: 'collection-a', modes: duplicateModes });
    const collectionB = collection({
      id: 'collection-b',
      modes: [{ modeId: 'mode-one', name: 'Default' }],
    });
    const values = (target: string): Variable['valuesByMode'] => ({
      'mode-one': { type: 'VARIABLE_ALIAS', id: target },
      'mode-two': { type: 'VARIABLE_ALIAS', id: target },
    });
    const aliasVariables: Variable[] = [
      variable({ id: 'cycle-a', collectionId: collectionA.id, valuesByMode: values('cycle-b') }),
      variable({ id: 'cycle-b', collectionId: collectionA.id, valuesByMode: values('cycle-a') }),
      variable({
        id: 'missing',
        collectionId: collectionA.id,
        valuesByMode: values('does-not-exist'),
      }),
      variable({ id: 'cross', collectionId: collectionA.id, valuesByMode: values('other') }),
      variable({
        id: 'other',
        collectionId: collectionB.id,
        valuesByMode: { 'mode-one': { r: 0.1, g: 0.2, b: 0.3 } },
      }),
    ];
    const depthVariables = Array.from({ length: 66 }, (_, index) =>
      variable({
        id: `depth-${index}`,
        collectionId: collectionB.id,
        valuesByMode: {
          'mode-one':
            index === 65
              ? { r: 0.2, g: 0.3, b: 0.4 }
              : { type: 'VARIABLE_ALIAS', id: `depth-${index + 1}` },
        },
      })
    );
    const { host } = hostFixture({
      pages: [currentPage],
      variables: [...aliasVariables, ...depthVariables],
      collections: [collectionA, collectionB],
      includeLibrary: false,
    });

    const result = await inventoryColorSystemGenericSourceV2(host, options());
    const kinds = new Set(result.snapshot?.unsupported.map(item => item.kind));

    expect(result.status).toBe('ready');
    expect(kinds).toEqual(
      new Set([
        'alias-cycle',
        'alias-depth',
        'cross-collection-alias',
        'duplicate-mode-name',
        'missing-alias-target',
      ])
    );
  });

  it('returns a partial cancelled snapshot and supports a clean retry without mutation', async () => {
    const { host, spies } = exactSourceFixture(true);
    let cancelled = true;

    const first = await inventoryColorSystemGenericSourceV2(
      host,
      options({ isCancelled: () => cancelled })
    );
    expect(first.status).toBe('cancelled');
    expect(first.snapshot).toMatchObject({
      cancelled: true,
      partial: true,
      scope: { coverage: 'partial' },
    });

    cancelled = false;
    const retry = await inventoryColorSystemGenericSourceV2(
      host,
      options({ isCancelled: () => cancelled })
    );
    expect(retry.status).toBe('ready');
    expect(retry.snapshot).toMatchObject({ cancelled: false, partial: false });
    for (const mutation of spies.mutationCalls) expect(mutation).not.toHaveBeenCalled();
  });

  it('fails closed as host-error rather than clamping invalid source channels', async () => {
    const currentPage = page('page-invalid', []);
    const localCollection = collection({
      id: 'collection-invalid',
      modes: [{ modeId: 'mode-default', name: 'Default' }],
    });
    const { host } = hostFixture({
      pages: [currentPage],
      collections: [localCollection],
      variables: [
        variable({
          id: 'variable-invalid',
          collectionId: localCollection.id,
          valuesByMode: { 'mode-default': { r: 1.1, g: 0, b: 0 } },
        }),
      ],
      includeLibrary: false,
    });

    const result = await inventoryColorSystemGenericSourceV2(host, options());
    expect(result).toMatchObject({ status: 'host-error', snapshot: null, auditInventory: null });
    expect(result.message).toMatch(/normalized channel/);
  });
});
