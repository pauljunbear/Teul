/**
 * In-memory stand-in for the Figma plugin sandbox (`figma`), scoped to what the
 * v2 color-system host and journal touch: pages and scene nodes, Variable
 * collections with modes and aliases, Paint Styles, fonts, plugin data,
 * clientStorage, the undo boundary, and the viewport. Every created resource is
 * registered so tests can prove that nothing Teul-owned survives a rollback.
 */
import { COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA } from '../../colorSystemResourceOwnershipV2';

export type FakeCreateKind =
  | 'page'
  | 'frame'
  | 'component'
  | 'instance'
  | 'rectangle'
  | 'text'
  | 'collection'
  | 'variable'
  | 'style';

export interface InMemoryFigmaOptions {
  editorType?: 'figma' | 'figjam' | 'slides';
  mode?: 'default' | 'inspect' | 'codegen';
  /** `'throw'` models a document whose profile getter is unavailable. */
  documentColorProfile?: 'SRGB' | 'DISPLAY_P3' | 'LEGACY' | 'throw';
  /** Fonts `loadFontAsync` accepts; anything else rejects. */
  fonts?: readonly FontName[];
  /** Called before every creation with a running count per kind; throw to inject a failure. */
  beforeCreate?: (kind: FakeCreateKind, ordinal: number) => void;
  /** Removes API surface so capability detection can be exercised. */
  omit?: readonly ('createComponent' | 'createVariableAlias' | 'createPaintStyle' | 'createPage')[];
  fileKey?: string;
}

class PluginDataStore {
  private readonly data = new Map<string, string>();
  getPluginData(key: string): string {
    return this.data.get(key) ?? '';
  }
  setPluginData(key: string, value: string): void {
    if (value === '') this.data.delete(key);
    else this.data.set(key, value);
  }
  getPluginDataKeys(): string[] {
    return [...this.data.keys()];
  }
}

export class FakeNode extends PluginDataStore {
  name = '';
  parent: FakeNode | null = null;
  readonly children: FakeNode[] = [];
  removed = false;
  x = 0;
  y = 0;
  width = 100;
  height = 100;
  visible = true;
  locked = false;
  opacity = 1;
  description = '';
  fills: Paint[] = [];
  strokes: Paint[] = [];
  strokeWeight = 1;
  strokeAlign: 'INSIDE' | 'OUTSIDE' | 'CENTER' = 'INSIDE';
  clipsContent = false;
  cornerRadius = 0;
  fontName: FontName | null = null;
  characters = '';
  fontSize = 12;
  textAutoResize: 'NONE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT' = 'NONE';
  explicitVariableModes: Record<string, string> = {};
  selection: FakeNode[] = [];
  mainComponent: FakeNode | null = null;

  constructor(
    readonly id: string,
    readonly type: string,
    private readonly document: InMemoryFigmaDocument
  ) {
    super();
  }

  appendChild(child: FakeNode): void {
    if (child.removed) throw new Error(`Node ${child.id} was removed.`);
    if (child.parent) child.parent.detach(child);
    child.parent = this;
    this.children.push(child);
  }

  private detach(child: FakeNode): void {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
  }

  remove(): void {
    if (this.removed) throw new Error(`Node ${this.id} was already removed.`);
    this.parent?.detach(this);
    this.parent = null;
    const stack: FakeNode[] = [this];
    while (stack.length > 0) {
      const node = stack.pop() as FakeNode;
      node.removed = true;
      this.document.nodes.delete(node.id);
      stack.push(...node.children);
    }
    this.document.removals += 1;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  findAll(predicate?: (node: FakeNode) => boolean): FakeNode[] {
    const result: FakeNode[] = [];
    const visit = (node: FakeNode) => {
      for (const child of node.children) {
        if (!predicate || predicate(child)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  setExplicitVariableModeForCollection(collection: FakeVariableCollection, modeId: string): void {
    const live = this.document.collections.get(collection.id);
    if (!live) throw new Error(`Collection ${collection.id} is not in this document.`);
    if (!live.modes.some(mode => mode.modeId === modeId)) {
      throw new Error(`Mode ${modeId} does not belong to collection ${collection.id}.`);
    }
    this.explicitVariableModes[collection.id] = modeId;
  }

  createInstance(): FakeNode {
    if (this.type !== 'COMPONENT') throw new Error('Only components create instances.');
    const instance = this.document.createNode('INSTANCE', 'instance');
    instance.mainComponent = this;
    instance.width = this.width;
    instance.height = this.height;
    instance.name = this.name;
    return instance;
  }
}

export class FakeVariableCollection extends PluginDataStore {
  readonly modes: { modeId: string; name: string }[];
  defaultModeId: string;
  readonly variableIds: string[] = [];
  remote = false;
  removed = false;

  constructor(
    readonly id: string,
    public name: string,
    private readonly document: InMemoryFigmaDocument
  ) {
    super();
    this.defaultModeId = `${id}:mode:0`;
    this.modes = [{ modeId: this.defaultModeId, name: 'Mode 1' }];
  }

  renameMode(modeId: string, name: string): void {
    const mode = this.modes.find(candidate => candidate.modeId === modeId);
    if (!mode) throw new Error(`Unknown mode ${modeId}.`);
    mode.name = name;
  }

  addMode(name: string): string {
    const modeId = `${this.id}:mode:${this.modes.length}`;
    this.modes.push({ modeId, name });
    return modeId;
  }

  remove(): void {
    if (this.removed) throw new Error(`Collection ${this.id} was already removed.`);
    for (const variableId of [...this.variableIds]) {
      this.document.variables.get(variableId)?.remove();
    }
    this.removed = true;
    this.document.collections.delete(this.id);
    this.document.removals += 1;
  }
}

export class FakeVariable extends PluginDataStore {
  description = '';
  scopes: VariableScope[] = [];
  readonly valuesByMode: Record<string, RGBA | VariableAlias> = {};
  remote = false;
  removed = false;

  constructor(
    readonly id: string,
    public name: string,
    readonly variableCollectionId: string,
    readonly resolvedType: VariableResolvedDataType,
    private readonly document: InMemoryFigmaDocument
  ) {
    super();
  }

  setValueForMode(modeId: string, value: RGBA | VariableAlias): void {
    const collection = this.document.collections.get(this.variableCollectionId);
    if (!collection?.modes.some(mode => mode.modeId === modeId)) {
      throw new Error(`Mode ${modeId} does not belong to collection ${this.variableCollectionId}.`);
    }
    this.valuesByMode[modeId] = value;
  }

  remove(): void {
    if (this.removed) throw new Error(`Variable ${this.id} was already removed.`);
    this.removed = true;
    this.document.variables.delete(this.id);
    const collection = this.document.collections.get(this.variableCollectionId);
    if (collection) {
      const index = collection.variableIds.indexOf(this.id);
      if (index >= 0) collection.variableIds.splice(index, 1);
    }
    this.document.removals += 1;
  }
}

export class FakePaintStyle extends PluginDataStore {
  readonly type = 'PAINT' as const;
  name = '';
  description = '';
  paints: Paint[] = [];
  remote = false;
  removed = false;

  constructor(
    readonly id: string,
    private readonly document: InMemoryFigmaDocument
  ) {
    super();
  }

  remove(): void {
    if (this.removed) throw new Error(`Style ${this.id} was already removed.`);
    this.removed = true;
    this.document.styles.delete(this.id);
    this.document.removals += 1;
  }
}

export class InMemoryFigmaDocument {
  readonly nodes = new Map<string, FakeNode>();
  readonly collections = new Map<string, FakeVariableCollection>();
  readonly variables = new Map<string, FakeVariable>();
  readonly styles = new Map<string, FakePaintStyle>();
  readonly root: FakeNode;
  readonly clientStorage = new Map<string, unknown>();
  readonly loadedFonts: FontName[] = [];
  readonly revealedNodeIds: string[][] = [];
  readonly currentPageHistory: string[] = [];
  currentPage: FakeNode;
  commitUndoCount = 0;
  removals = 0;
  /** While true, creations are neither counted nor offered to `beforeCreate`
   * (used when seeding pre-existing document content). */
  suppressCreateHooks = false;
  private sequence = 0;
  private readonly creations = new Map<FakeCreateKind, number>();

  constructor(private readonly options: InMemoryFigmaOptions) {
    this.root = new FakeNode('0:0', 'DOCUMENT', this);
    this.root.name = 'Document';
    this.suppressCreateHooks = true;
    this.currentPage = this.createPage('Page 1');
    this.suppressCreateHooks = false;
  }

  /** Creations made by the code under test (seeded content excluded). */
  get createdCount(): number {
    let total = 0;
    for (const count of this.creations.values()) total += count;
    return total;
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}${this.sequence}:${this.sequence * 3}`;
  }

  noteCreate(kind: FakeCreateKind): void {
    if (this.suppressCreateHooks) return;
    const ordinal = (this.creations.get(kind) ?? 0) + 1;
    this.options.beforeCreate?.(kind, ordinal);
    this.creations.set(kind, ordinal);
  }

  createNode(type: string, kind: FakeCreateKind): FakeNode {
    this.noteCreate(kind);
    const node = new FakeNode(this.nextId(''), type, this);
    this.nodes.set(node.id, node);
    return node;
  }

  createPage(name = ''): FakeNode {
    const page = this.createNode('PAGE', 'page');
    page.name = name;
    this.root.appendChild(page);
    return page;
  }

  createCollection(name: string): FakeVariableCollection {
    this.noteCreate('collection');
    const collection = new FakeVariableCollection(this.nextId('VariableCollectionId:'), name, this);
    this.collections.set(collection.id, collection);
    return collection;
  }

  createVariable(
    name: string,
    collection: FakeVariableCollection,
    resolvedType: VariableResolvedDataType
  ): FakeVariable {
    this.noteCreate('variable');
    if (!this.collections.has(collection.id)) {
      throw new Error(`Collection ${collection.id} is not in this document.`);
    }
    const variable = new FakeVariable(
      this.nextId('VariableID:'),
      name,
      collection.id,
      resolvedType,
      this
    );
    this.variables.set(variable.id, variable);
    collection.variableIds.push(variable.id);
    return variable;
  }

  createPaintStyle(): FakePaintStyle {
    this.noteCreate('style');
    const style = new FakePaintStyle(`S:${this.nextId('')},`, this);
    this.styles.set(style.id, style);
    return style;
  }

  /** Every live collection, variable, style, page, and scene node that carries
   * v2 ownership metadata. Empty after a complete rollback. */
  teulOwnedResources(): { kind: string; id: string; name: string }[] {
    const owned: { kind: string; id: string; name: string }[] = [];
    const transactionKey = COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.transactionId;
    for (const collection of this.collections.values()) {
      if (collection.getPluginData(transactionKey)) {
        owned.push({ kind: 'collection', id: collection.id, name: collection.name });
      }
    }
    for (const variable of this.variables.values()) {
      if (variable.getPluginData(transactionKey)) {
        owned.push({ kind: 'variable', id: variable.id, name: variable.name });
      }
    }
    for (const style of this.styles.values()) {
      if (style.getPluginData(transactionKey)) {
        owned.push({ kind: 'style', id: style.id, name: style.name });
      }
    }
    for (const node of this.nodes.values()) {
      if (node.getPluginData(transactionKey)) {
        owned.push({ kind: node.type.toLowerCase(), id: node.id, name: node.name });
      }
    }
    return owned;
  }

  snapshot(): unknown {
    return {
      pages: this.root.children.map(page => ({
        id: page.id,
        name: page.name,
        children: page.findAll().map(node => ({ id: node.id, type: node.type, name: node.name })),
      })),
      collections: [...this.collections.values()].map(collection => ({
        id: collection.id,
        name: collection.name,
        modes: collection.modes,
        variableIds: [...collection.variableIds],
      })),
      variables: [...this.variables.values()].map(variable => ({
        id: variable.id,
        name: variable.name,
        collection: variable.variableCollectionId,
        scopes: [...variable.scopes],
        valuesByMode: { ...variable.valuesByMode },
      })),
      styles: [...this.styles.values()].map(style => ({
        id: style.id,
        name: style.name,
        paints: style.paints,
      })),
    };
  }
}

function isVariableAlias(value: unknown): value is VariableAlias {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'VARIABLE_ALIAS' &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

export function createInMemoryFigmaPluginApi(options: InMemoryFigmaOptions = {}): {
  figma: PluginAPI;
  document: InMemoryFigmaDocument;
} {
  const document = new InMemoryFigmaDocument(options);
  const fonts = options.fonts ?? [{ family: 'Inter', style: 'Bold' }];
  const omit = new Set(options.omit ?? []);
  const requireLive = <T extends { removed: boolean; id: string }>(value: T | undefined) =>
    value && !value.removed ? value : null;

  const root = document.root as FakeNode & { documentColorProfile?: unknown };
  Object.defineProperty(root, 'documentColorProfile', {
    configurable: true,
    get() {
      if (options.documentColorProfile === 'throw') {
        throw new Error('documentColorProfile is unavailable in this document.');
      }
      return options.documentColorProfile ?? 'SRGB';
    },
  });

  const variables = {
    createVariableCollection: (name: string) => document.createCollection(name),
    createVariable: (
      name: string,
      collection: FakeVariableCollection,
      resolvedType: VariableResolvedDataType
    ) => document.createVariable(name, collection, resolvedType),
    createVariableAlias: (variable: FakeVariable): VariableAlias => {
      if (!requireLive(document.variables.get(variable.id))) {
        throw new Error(`Variable ${variable.id} is not in this document.`);
      }
      return { type: 'VARIABLE_ALIAS', id: variable.id };
    },
    setBoundVariableForPaint: (paint: SolidPaint, field: 'color', variable: FakeVariable) => {
      if (!requireLive(document.variables.get(variable.id))) {
        throw new Error(`Variable ${variable.id} is not in this document.`);
      }
      return {
        ...paint,
        boundVariables: { [field]: { type: 'VARIABLE_ALIAS', id: variable.id } },
      } as SolidPaint;
    },
    getLocalVariableCollectionsAsync: async () => [...document.collections.values()],
    getVariableCollectionByIdAsync: async (id: string) => requireLive(document.collections.get(id)),
    getVariableByIdAsync: async (id: string) => requireLive(document.variables.get(id)),
  };
  if (omit.has('createVariableAlias')) {
    delete (variables as Partial<typeof variables>).createVariableAlias;
  }

  const figma = {
    editorType: options.editorType ?? 'figma',
    mode: options.mode ?? 'default',
    fileKey: options.fileKey,
    root,
    get currentPage() {
      return document.currentPage;
    },
    variables,
    viewport: {
      scrollAndZoomIntoView: (nodes: readonly FakeNode[]) => {
        document.revealedNodeIds.push(nodes.map(node => node.id));
      },
    },
    clientStorage: {
      getAsync: async (key: string) => document.clientStorage.get(key),
      setAsync: async (key: string, value: unknown) => {
        document.clientStorage.set(key, value);
      },
      deleteAsync: async (key: string) => {
        document.clientStorage.delete(key);
      },
    },
    loadAllPagesAsync: async () => undefined,
    loadFontAsync: async (font: FontName) => {
      const available = fonts.some(
        candidate => candidate.family === font.family && candidate.style === font.style
      );
      if (!available) throw new Error(`Font ${font.family} ${font.style} is unavailable.`);
      document.loadedFonts.push(font);
    },
    createPage: () => document.createPage(),
    createFrame: () => document.createNode('FRAME', 'frame'),
    createComponent: () => document.createNode('COMPONENT', 'component'),
    createRectangle: () => document.createNode('RECTANGLE', 'rectangle'),
    createText: () => document.createNode('TEXT', 'text'),
    createPaintStyle: () => document.createPaintStyle(),
    getLocalPaintStylesAsync: async () => [...document.styles.values()],
    getStyleByIdAsync: async (id: string) => requireLive(document.styles.get(id)),
    getNodeByIdAsync: async (id: string) => requireLive(document.nodes.get(id)),
    setCurrentPageAsync: async (page: FakeNode) => {
      if (page.type !== 'PAGE' || page.removed) throw new Error('Not a live page.');
      document.currentPage = page;
      document.currentPageHistory.push(page.id);
    },
    commitUndo: () => {
      document.commitUndoCount += 1;
    },
  } as Record<string, unknown>;
  for (const key of omit) if (key !== 'createVariableAlias') delete figma[key];

  return { figma: figma as unknown as PluginAPI, document };
}

/** Resolves a Variable value through aliases to its exact RGBA for one mode name. */
export function resolveVariableColor(
  document: InMemoryFigmaDocument,
  variableId: string,
  modeName: string,
  depth = 0
): RGBA {
  if (depth > 16) throw new Error('Alias cycle.');
  const variable = document.variables.get(variableId);
  if (!variable) throw new Error(`Unknown variable ${variableId}.`);
  const collection = document.collections.get(variable.variableCollectionId);
  const mode = collection?.modes.find(candidate => candidate.name === modeName);
  if (!mode) throw new Error(`Unknown mode ${modeName} for ${variableId}.`);
  const value = variable.valuesByMode[mode.modeId];
  if (isVariableAlias(value)) return resolveVariableColor(document, value.id, modeName, depth + 1);
  if (!value) throw new Error(`Variable ${variableId} has no value for ${modeName}.`);
  return value;
}
