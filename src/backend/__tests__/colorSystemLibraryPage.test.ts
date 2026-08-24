import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COLOR_SYSTEM_LIBRARY_PAGE_BLUEPRINT_KEY,
  COLOR_SYSTEM_LIBRARY_PAGE_ROLE_KEY,
  COLOR_SYSTEM_LIBRARY_PAGE_SCHEMA_VERSION,
  createColorSystemLibraryPage,
  loadColorSystemLibraryPageFonts,
  type ColorSystemLibraryPageBlueprint,
} from '../colorSystemLibraryPage';

const hash = (character: string): string => `sha256:${character.repeat(64)}`;

function blueprint(): ColorSystemLibraryPageBlueprint {
  const values = (
    light: string,
    dark: string,
    ownership: 'source' | 'teul-suggested',
    provenance: string
  ) => ({
    Light: { hex: light, ownership, provenance: `${provenance} · Light · ${light}` },
    Dark: { hex: dark, ownership, provenance: `${provenance} · Dark · ${dark}` },
  });
  const alias = (
    id: string,
    name: string,
    role: string,
    targetTokenId: string,
    light: string,
    dark: string,
    order: number,
    state?: string
  ) => ({
    id,
    name,
    role,
    ...(state ? { state } : {}),
    displayMode: 'Light',
    targetsByMode: {
      Light: { targetTokenId, hex: light },
      Dark: { targetTokenId, hex: dark },
    },
    order,
  });
  const chartEvidence = (kind: 'categorical' | 'sequential' | 'diverging') => ({
    surfacePairCount: 4,
    testedSurfacePairCount: 4,
    passedSurfacePairCount: 4,
    minimumSurfaceContrastRatio: 3.12,
    maximumSurfaceThreshold: 3,
    separationScope:
      kind === 'categorical'
        ? ('all-pairs' as const)
        : kind === 'diverging'
          ? ('opposing-arms' as const)
          : ('not-applicable' as const),
    separation:
      kind === 'sequential'
        ? []
        : (['normal', 'protan', 'deutan', 'severe-tritan'] as const).map((condition, index) => ({
            condition,
            minimumDeltaEOK: 0.12 + index * 0.01,
            threshold: 0.08,
            pass: true as const,
          })),
    orderingPass: true as const,
    evaluationHash: hash(kind === 'categorical' ? 'd' : kind === 'sequential' ? 'e' : 'f'),
  });
  return {
    schemaVersion: COLOR_SYSTEM_LIBRARY_PAGE_SCHEMA_VERSION,
    systemName: 'Example Color System',
    pageName: 'Example Color System — Library',
    sourceHash: hash('a'),
    proposalHash: hash('b'),
    strategyId: 'balanced-contrast',
    blueprintHash: hash('c'),
    tokens: [
      {
        id: 'primary.1',
        name: 'Primary 1',
        valuesByMode: values('#F5F5F5', '#202020', 'source', 'Exact source color'),
      },
      {
        id: 'primary.2',
        name: 'Primary 2',
        valuesByMode: values('#B8B8B8', '#757575', 'source', 'Exact source color'),
      },
      {
        id: 'primary.3',
        name: 'Primary 3',
        valuesByMode: values('#202020', '#F5F5F5', 'source', 'Exact source color'),
      },
      {
        id: 'secondary.1',
        name: 'Secondary 1',
        valuesByMode: values(
          '#3568D4',
          '#6E9CFA',
          'teul-suggested',
          'Deterministic harmony candidate'
        ),
      },
      {
        id: 'secondary.2',
        name: 'Secondary 2',
        valuesByMode: values(
          '#D45F35',
          '#F58A64',
          'teul-suggested',
          'Deterministic harmony candidate'
        ),
      },
    ],
    aliases: [
      alias(
        'alias.primary.1',
        'Primary one',
        'source-primary',
        'primary.1',
        '#F5F5F5',
        '#202020',
        0,
        '01-Primary one'
      ),
      alias(
        'alias.primary.2',
        'Primary two',
        'source-primary',
        'primary.2',
        '#B8B8B8',
        '#757575',
        1,
        '02-Primary two'
      ),
      alias(
        'alias.primary.3',
        'Primary three',
        'source-primary',
        'primary.3',
        '#202020',
        '#F5F5F5',
        2,
        '03-Primary three'
      ),
      alias(
        'alias.secondary.1',
        'Secondary one',
        'secondary-one',
        'secondary.1',
        '#3568D4',
        '#6E9CFA',
        3
      ),
      alias(
        'alias.secondary.2',
        'Secondary two',
        'secondary-two',
        'secondary.2',
        '#D45F35',
        '#F58A64',
        4
      ),
    ],
    scales: [
      {
        id: 'primary',
        name: 'Primary',
        description: 'Locked source palette',
        section: 'primary',
        order: 0,
        variants: [
          {
            id: 'primary:Light',
            mode: 'Light',
            steps: [
              { label: '01', tokenId: 'primary.1' },
              { label: '02', tokenId: 'primary.2' },
              { label: '03', tokenId: 'primary.3' },
            ],
          },
          {
            id: 'primary:Dark',
            mode: 'Dark',
            steps: [
              { label: '01', tokenId: 'primary.1' },
              { label: '02', tokenId: 'primary.2' },
              { label: '03', tokenId: 'primary.3' },
            ],
          },
        ],
      },
      {
        id: 'secondary',
        name: 'Secondary',
        description: 'Approved proposed palette',
        section: 'secondary',
        order: 1,
        variants: [
          {
            id: 'secondary:Light',
            mode: 'Light',
            steps: [
              { label: '01', tokenId: 'secondary.1' },
              { label: '02', tokenId: 'secondary.2' },
            ],
          },
          {
            id: 'secondary:Dark',
            mode: 'Dark',
            steps: [
              { label: '01', tokenId: 'secondary.1' },
              { label: '02', tokenId: 'secondary.2' },
            ],
          },
        ],
      },
    ],
    presentationSections: [
      {
        kind: 'primary',
        title: 'Primary',
        description: 'Existing source colors remain unchanged.',
        order: 0,
        sourceSwatches: [
          {
            aliasId: 'alias.primary.1',
            targetTokenId: 'primary.1',
            name: 'Primary one',
            mode: 'Light',
            hex: '#F5F5F5',
            order: 1,
          },
          {
            aliasId: 'alias.primary.2',
            targetTokenId: 'primary.2',
            name: 'Primary two',
            mode: 'Light',
            hex: '#B8B8B8',
            order: 2,
          },
          {
            aliasId: 'alias.primary.3',
            targetTokenId: 'primary.3',
            name: 'Primary three',
            mode: 'Light',
            hex: '#202020',
            order: 3,
          },
        ],
        suggestedScaleIds: [],
        chartIds: [],
      },
      {
        kind: 'secondary',
        title: 'Secondary',
        description: 'Selected proposal scales are shown for review.',
        order: 1,
        sourceSwatches: [],
        suggestedScaleIds: ['secondary'],
        chartIds: [],
      },
      {
        kind: 'product-graphics',
        title: 'Product Graphics',
        description: 'Product graphics colors remain source-bound.',
        order: 2,
        sourceSwatches: [],
        suggestedScaleIds: [],
        chartIds: [],
      },
      {
        kind: 'data-visualization',
        title: 'Data Visualization',
        description: 'Three applied examples use the reviewed chart context.',
        order: 3,
        sourceSwatches: [],
        suggestedScaleIds: [],
        chartIds: ['chart-categorical', 'chart-sequential', 'chart-diverging'],
      },
      {
        kind: 'typography',
        title: 'Typography',
        description: 'Pair-specific accessibility evidence accompanies text colors.',
        order: 4,
        sourceSwatches: [],
        suggestedScaleIds: [],
        chartIds: [],
      },
    ],
    semanticPairEvidence: {
      assessment: 'passed',
      declaredPairCount: 4,
      testedPairCount: 4,
      passedPairCount: 4,
      failedPairCount: 0,
      unsupportedPairCount: 0,
      minimumTestedContrastRatio: 4.62,
      pairIds: ['pair.body', 'pair.heading', 'pair.border', 'pair.focus'],
    },
    charts: [
      {
        id: 'chart-categorical',
        name: 'Categorical',
        kind: 'categorical',
        context: 'Dashboard categories on a light surface',
        nonColorCue: 'labels and height',
        mode: 'Light',
        surfaceHex: '#F2EBDD',
        adjacency: 'separated-marks',
        order: 0,
        evidence: chartEvidence('categorical'),
        marks: [
          { aliasId: 'alias.primary.3', targetTokenId: 'primary.3', label: 'A', hex: '#202020' },
          {
            aliasId: 'alias.secondary.1',
            targetTokenId: 'secondary.1',
            label: 'B',
            hex: '#3568D4',
          },
          {
            aliasId: 'alias.secondary.2',
            targetTokenId: 'secondary.2',
            label: 'C',
            hex: '#D45F35',
          },
        ],
      },
      {
        id: 'chart-sequential',
        name: 'Sequential',
        kind: 'sequential',
        context: 'Low-to-high intensity',
        nonColorCue: 'ordered position and values',
        mode: 'Light',
        surfaceHex: '#F2EBDD',
        adjacency: 'separated-marks',
        order: 1,
        evidence: chartEvidence('sequential'),
        marks: [
          { aliasId: 'alias.primary.1', targetTokenId: 'primary.1', label: 'Low', hex: '#F5F5F5' },
          { aliasId: 'alias.primary.2', targetTokenId: 'primary.2', label: 'Mid', hex: '#B8B8B8' },
          { aliasId: 'alias.primary.3', targetTokenId: 'primary.3', label: 'High', hex: '#202020' },
        ],
      },
      {
        id: 'chart-diverging',
        name: 'Diverging',
        kind: 'diverging',
        context: 'Change around a neutral midpoint',
        nonColorCue: 'signed labels and baseline',
        mode: 'Light',
        surfaceHex: '#F2EBDD',
        adjacency: 'separated-marks',
        order: 2,
        evidence: chartEvidence('diverging'),
        marks: [
          {
            aliasId: 'alias.secondary.1',
            targetTokenId: 'secondary.1',
            label: '-1',
            hex: '#3568D4',
          },
          { aliasId: 'alias.primary.2', targetTokenId: 'primary.2', label: '0', hex: '#B8B8B8' },
          {
            aliasId: 'alias.secondary.2',
            targetTokenId: 'secondary.2',
            label: '+1',
            hex: '#D45F35',
          },
        ],
      },
    ],
  };
}

interface TestNode {
  id: string;
  type: string;
  name: string;
  parent: TestNode | null;
  children: TestNode[];
  x: number;
  y: number;
  width: number;
  height: number;
  fills: readonly Paint[];
  strokes: readonly Paint[];
  strokeWeight?: number;
  strokeAlign?: string;
  pluginData: Map<string, string>;
  explicitVariableModes: Map<string, string>;
  appendChild(child: TestNode): void;
  resize(width: number, height: number): void;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
  setExplicitVariableModeForCollection(collection: VariableCollection, modeId: string): void;
  remove(): void;
}

function installFigmaStub() {
  let nextId = 0;
  const pages: TestNode[] = [];
  const created: TestNode[] = [];

  const detach = (node: TestNode): void => {
    if (!node.parent) return;
    const index = node.parent.children.indexOf(node);
    if (index >= 0) node.parent.children.splice(index, 1);
    node.parent = null;
  };

  const node = (type: string, parent: TestNode | null): TestNode => {
    const result: TestNode = {
      id: `${type.toLowerCase()}-${++nextId}`,
      type,
      name: '',
      parent: null,
      children: [],
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fills: [],
      strokes: [],
      pluginData: new Map(),
      explicitVariableModes: new Map(),
      appendChild(child) {
        detach(child);
        child.parent = this;
        this.children.push(child);
      },
      resize(width, height) {
        this.width = width;
        this.height = height;
      },
      setPluginData(key, value) {
        this.pluginData.set(key, value);
      },
      getPluginData(key) {
        return this.pluginData.get(key) ?? '';
      },
      setExplicitVariableModeForCollection(collection, modeId) {
        this.explicitVariableModes.set(collection.id, modeId);
      },
      remove() {
        detach(this);
      },
    };
    parent?.appendChild(result);
    if (type !== 'PAGE') created.push(result);
    return result;
  };

  const currentPage = node('PAGE', null);
  currentPage.name = 'Current page';
  pages.push(currentPage);
  const createSceneNode = (type: string): TestNode => node(type, currentPage);
  const createPage = vi.fn(() => {
    const page = node('PAGE', null);
    pages.push(page);
    return page as unknown as PageNode;
  });
  const setBoundVariableForPaint = vi.fn(
    (paint: SolidPaint, _field: 'color', variable: Variable): SolidPaint =>
      ({
        ...paint,
        boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variable.id } },
      }) as SolidPaint
  );
  const combineAsVariants = vi.fn(
    (components: readonly ComponentNode[], parent: BaseNode & ChildrenMixin) => {
      const set = createSceneNode('COMPONENT_SET');
      (parent as unknown as TestNode).appendChild(set);
      for (const component of components) {
        set.appendChild(component as unknown as TestNode);
      }
      return set as unknown as ComponentSetNode;
    }
  );
  const commitUndo = vi.fn();
  const setCurrentPageAsync = vi.fn();
  const scrollAndZoomIntoView = vi.fn();
  const loadFontAsync = vi.fn(async () => undefined);

  vi.stubGlobal('figma', {
    currentPage: currentPage as unknown as PageNode,
    root: { children: pages },
    createPage,
    createFrame: vi.fn(() => createSceneNode('FRAME') as unknown as FrameNode),
    createComponent: vi.fn(() => createSceneNode('COMPONENT') as unknown as ComponentNode),
    createRectangle: vi.fn(() => createSceneNode('RECTANGLE') as unknown as RectangleNode),
    createText: vi.fn(() => createSceneNode('TEXT') as unknown as TextNode),
    combineAsVariants,
    variables: { setBoundVariableForPaint },
    loadFontAsync,
    commitUndo,
    setCurrentPageAsync,
    viewport: { scrollAndZoomIntoView, center: { x: 0, y: 0 }, zoom: 1 },
  });

  const variables = new Map<string, Variable>();
  for (const id of [
    'primary.1',
    'primary.2',
    'primary.3',
    'secondary.1',
    'secondary.2',
    'alias.primary.1',
    'alias.primary.2',
    'alias.primary.3',
    'alias.secondary.1',
    'alias.secondary.2',
  ]) {
    variables.set(id, { id: `variable:${id}`, resolvedType: 'COLOR' } as Variable);
  }
  const collection = {
    id: 'collection:example',
    modes: [
      { modeId: 'mode:light', name: 'Light' },
      { modeId: 'mode:dark', name: 'Dark' },
    ],
  } as VariableCollection;
  const modeBindings = new Map([
    ['Light', { collection, modeId: 'mode:light' }],
    ['Dark', { collection, modeId: 'mode:dark' }],
  ]);

  return {
    currentPage,
    pages,
    created,
    variables,
    modeBindings,
    createPage,
    setBoundVariableForPaint,
    combineAsVariants,
    commitUndo,
    setCurrentPageAsync,
    scrollAndZoomIntoView,
    loadFontAsync,
  };
}

function pageLayout(page: PageNode): unknown {
  return (page.children as readonly SceneNode[]).map(child => ({
    name: child.name,
    x: child.x,
    y: child.y,
    width: child.width,
    height: child.height,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createColorSystemLibraryPage', () => {
  it('creates deterministic bound components and three specimens without navigating or committing', async () => {
    const fixture = installFigmaStub();
    const tracked: Array<PageNode | SceneNode> = [];
    await loadColorSystemLibraryPageFonts();
    const first = createColorSystemLibraryPage(blueprint(), fixture.variables, {
      modeBindings: fixture.modeBindings,
      onNodeCreated: created => tracked.push(created),
    });
    const second = createColorSystemLibraryPage(blueprint(), fixture.variables, {
      modeBindings: fixture.modeBindings,
    });

    expect(first.page.name).toBe('Example Color System — Library');
    expect(first.scaleCount).toBe(2);
    expect(first.componentCount).toBe(4);
    expect(first.componentSetCount).toBe(2);
    expect(first.aliasSwatchCount).toBe(3);
    expect(first.chartSpecimenCount).toBe(3);
    expect(first.boundPaintCount).toBe(26);
    expect(first.nodeCount).toBe(first.nodes.length);
    expect(tracked).toHaveLength(first.nodeCount + 1);
    expect(pageLayout(first.page)).toEqual(pageLayout(second.page));

    expect(fixture.setBoundVariableForPaint).toHaveBeenCalledTimes(52);
    expect(fixture.combineAsVariants).toHaveBeenCalledTimes(4);
    expect(fixture.loadFontAsync).toHaveBeenCalledTimes(2);
    expect(fixture.commitUndo).not.toHaveBeenCalled();
    expect(fixture.setCurrentPageAsync).not.toHaveBeenCalled();
    expect(fixture.scrollAndZoomIntoView).not.toHaveBeenCalled();
    expect((figma.currentPage as unknown as TestNode).id).toBe(fixture.currentPage.id);

    const presentationFrames = (first.page as unknown as TestNode).children.filter(
      node => node.getPluginData(COLOR_SYSTEM_LIBRARY_PAGE_ROLE_KEY) === 'presentation-section'
    );
    expect(presentationFrames.map(frame => frame.name)).toEqual([
      'Example Color System — Primary',
      'Example Color System — Secondary',
      'Example Color System — Product Graphics',
      'Example Color System — Data Visualization',
      'Example Color System — Typography',
    ]);
    expect(presentationFrames.map(frame => frame.x)).toEqual([80, 1392, 2704, 4016, 5328]);
    expect(presentationFrames.map(frame => [frame.width, frame.height])).toEqual(
      Array.from({ length: 5 }, () => [1280, 720])
    );
    expect(
      first.nodes.filter(node => node.type === 'FRAME').every(node => node.strokes.length === 0)
    ).toBe(true);
    expect(
      first.nodes.some(
        node =>
          (node as unknown as TestNode).getPluginData(COLOR_SYSTEM_LIBRARY_PAGE_ROLE_KEY) ===
          'semantic-alias-section'
      )
    ).toBe(false);

    expect(
      (first.page as unknown as TestNode).getPluginData(COLOR_SYSTEM_LIBRARY_PAGE_ROLE_KEY)
    ).toBe('library-page');
    expect(
      (first.page as unknown as TestNode).getPluginData(COLOR_SYSTEM_LIBRARY_PAGE_BLUEPRINT_KEY)
    ).toBe(hash('c'));
    const componentSets = first.nodes.filter(node => node.type === 'COMPONENT_SET');
    expect(componentSets.map(node => node.name)).toEqual([
      'Palette / Primary',
      'Palette / Secondary',
    ]);
    const paletteComponents = first.nodes.filter(node => node.type === 'COMPONENT');
    expect(paletteComponents.map(node => node.name)).toEqual([
      'Mode=Light',
      'Mode=Dark',
      'Mode=Light',
      'Mode=Dark',
    ]);
    expect(
      paletteComponents.map(node =>
        (node as unknown as TestNode).explicitVariableModes.get('collection:example')
      )
    ).toEqual(['mode:light', 'mode:dark', 'mode:light', 'mode:dark']);
    const chartPaintVariableIds = first.nodes
      .filter(
        node =>
          (node as unknown as TestNode).getPluginData(COLOR_SYSTEM_LIBRARY_PAGE_ROLE_KEY) ===
          'chart-mark'
      )
      .flatMap(node =>
        ((node as unknown as TestNode).fills as readonly SolidPaint[]).flatMap(paint =>
          paint.boundVariables?.color ? [paint.boundVariables.color.id] : []
        )
      );
    expect(chartPaintVariableIds).toEqual(
      expect.arrayContaining([
        'variable:alias.primary.1',
        'variable:alias.primary.2',
        'variable:alias.primary.3',
        'variable:alias.secondary.1',
        'variable:alias.secondary.2',
      ])
    );
    expect(
      first.nodes.filter(
        node =>
          (node as unknown as TestNode).getPluginData(COLOR_SYSTEM_LIBRARY_PAGE_ROLE_KEY) ===
          'chart-specimen'
      )
    ).toHaveLength(3);

    const chartFrames = first.nodes.filter(
      node =>
        (node as unknown as TestNode).getPluginData(COLOR_SYSTEM_LIBRARY_PAGE_ROLE_KEY) ===
        'chart-specimen'
    ) as unknown as TestNode[];
    const reviewedSurfaces = chartFrames.flatMap(frame =>
      frame.children.filter(
        child =>
          child.getPluginData(COLOR_SYSTEM_LIBRARY_PAGE_ROLE_KEY) === 'chart-reviewed-surface'
      )
    );
    expect(reviewedSurfaces).toHaveLength(3);
    expect(reviewedSurfaces.map(surface => (surface.fills[0] as SolidPaint).color)).toEqual([
      { r: 0xf2 / 255, g: 0xeb / 255, b: 0xdd / 255 },
      { r: 0xf2 / 255, g: 0xeb / 255, b: 0xdd / 255 },
      { r: 0xf2 / 255, g: 0xeb / 255, b: 0xdd / 255 },
    ]);
    const chartMarks = first.nodes.filter(
      node =>
        (node as unknown as TestNode).getPluginData(COLOR_SYSTEM_LIBRARY_PAGE_ROLE_KEY) ===
        'chart-mark'
    ) as unknown as TestNode[];
    expect(chartMarks).toHaveLength(9);
    expect(chartMarks.every(mark => mark.strokes.length === 0)).toBe(true);

    const presentationSwatches = first.nodes.filter(node => {
      const role = (node as unknown as TestNode).getPluginData(COLOR_SYSTEM_LIBRARY_PAGE_ROLE_KEY);
      return role === 'presentation-source-swatch' || role === 'presentation-proposal-swatch';
    }) as unknown as TestNode[];
    expect(presentationSwatches).toHaveLength(7);
    expect(
      presentationSwatches.every(swatch =>
        swatch.strokes.every(stroke => {
          const color = (stroke as SolidPaint).color;
          return (
            (color.r === 0 && color.g === 0 && color.b === 0) ||
            (color.r === 1 && color.g === 1 && color.b === 1)
          );
        })
      )
    ).toBe(true);
    expect(
      presentationSwatches.every(
        swatch =>
          swatch.strokes.length === 0 ||
          (swatch.strokes.length === 1 &&
            swatch.strokeWeight === 1 &&
            swatch.strokeAlign === 'INSIDE')
      )
    ).toBe(true);
  });

  it('rejects an incomplete chart recipe before creating a page', () => {
    const fixture = installFigmaStub();
    const invalid = { ...blueprint(), charts: blueprint().charts.slice(0, 2) };

    expect(() =>
      createColorSystemLibraryPage(invalid, fixture.variables, {
        modeBindings: fixture.modeBindings,
      })
    ).toThrow('charts must contain 3-3 entries');
    expect(fixture.createPage).not.toHaveBeenCalled();
  });

  it('rejects boundaries on separated marks before creating a page', () => {
    const fixture = installFigmaStub();
    const valid = blueprint();
    const invalid = {
      ...valid,
      charts: valid.charts.map((chart, index) =>
        index === 0 ? { ...chart, boundaryHex: '#000000' } : chart
      ),
    };

    expect(() =>
      createColorSystemLibraryPage(invalid, fixture.variables, {
        modeBindings: fixture.modeBindings,
      })
    ).toThrow('separated marks must omit a boundary');
    expect(fixture.createPage).not.toHaveBeenCalled();
  });

  it('rejects non-monochrome boundaries on touching regions before creating a page', () => {
    const fixture = installFigmaStub();
    const valid = blueprint();
    const invalid = {
      ...valid,
      charts: valid.charts.map((chart, index) =>
        index === 0
          ? { ...chart, adjacency: 'touching-regions' as const, boundaryHex: '#151515' }
          : chart
      ),
    };

    expect(() =>
      createColorSystemLibraryPage(invalid, fixture.variables, {
        modeBindings: fixture.modeBindings,
      })
    ).toThrow('touching regions require a black or white boundary');
    expect(fixture.createPage).not.toHaveBeenCalled();
  });

  it('preflights both fonts independently from the synchronous renderer', async () => {
    const fixture = installFigmaStub();

    await loadColorSystemLibraryPageFonts();

    expect(fixture.loadFontAsync).toHaveBeenCalledTimes(2);
    expect(fixture.createPage).not.toHaveBeenCalled();
  });

  it('requires every reviewed visual mode binding before mutation', () => {
    const fixture = installFigmaStub();
    const lightOnly = new Map([['Light', fixture.modeBindings.get('Light')!]]);

    expect(() =>
      createColorSystemLibraryPage(blueprint(), fixture.variables, {
        modeBindings: lightOnly,
      })
    ).toThrow('No Figma Variable mode binding was provided for "Dark"');
    expect(fixture.createPage).not.toHaveBeenCalled();
  });

  it('requires a created COLOR variable for each primitive and alias paint before mutation', () => {
    const fixture = installFigmaStub();
    fixture.variables.delete('alias.primary.1');

    expect(() =>
      createColorSystemLibraryPage(blueprint(), fixture.variables, {
        modeBindings: fixture.modeBindings,
      })
    ).toThrow('No created Figma Variable was provided for "alias.primary.1"');
    expect(fixture.createPage).not.toHaveBeenCalled();
  });
});
