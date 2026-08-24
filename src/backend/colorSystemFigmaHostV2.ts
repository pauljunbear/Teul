import type {
  ColorSystemHostResourceRefV2,
  ColorSystemRendererAliasVariableRequestV2,
  ColorSystemRendererCollectionResultV2,
  ColorSystemRendererComponentRequestV2,
  ColorSystemRendererFontV2,
  ColorSystemRendererFrameRequestV2,
  ColorSystemRendererHostContextV2,
  ColorSystemRendererHostInventoryV2,
  ColorSystemRendererHostV2,
  ColorSystemRendererOwnershipMetadataV2,
  ColorSystemRendererPrimitiveVariableRequestV2,
} from './colorSystemResourceRendererV2';
import { COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID } from './colorSystemCreateJournalV2';
import { COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA } from './colorSystemResourceOwnershipV2';

export { COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA } from './colorSystemResourceOwnershipV2';

type ManagedResource =
  | VariableCollection
  | Variable
  | PaintStyle
  | ComponentNode
  | FrameNode
  | PageNode;
type ManagedNode = ComponentNode | FrameNode;

interface ResourceRecord {
  ref: ColorSystemHostResourceRefV2;
  resource: ManagedResource;
  metadata: ColorSystemRendererOwnershipMetadataV2;
}

type VariableRecipeRecord =
  | {
      kind: 'primitive';
      variable: Variable;
      request: ColorSystemRendererPrimitiveVariableRequestV2;
    }
  | {
      kind: 'alias';
      variable: Variable;
      request: ColorSystemRendererAliasVariableRequestV2;
    };

interface ComponentRecord {
  component: ComponentNode;
  request: ColorSystemRendererComponentRequestV2;
}

const VALID_SCOPES = new Set<VariableScope>([
  'ALL_SCOPES',
  'TEXT_CONTENT',
  'CORNER_RADIUS',
  'WIDTH_HEIGHT',
  'GAP',
  'ALL_FILLS',
  'FRAME_FILL',
  'SHAPE_FILL',
  'TEXT_FILL',
  'STROKE_COLOR',
  'STROKE_FLOAT',
  'EFFECT_FLOAT',
  'EFFECT_COLOR',
  'OPACITY',
  'FONT_FAMILY',
  'FONT_STYLE',
  'FONT_WEIGHT',
  'FONT_SIZE',
  'LINE_HEIGHT',
  'LETTER_SPACING',
  'PARAGRAPH_SPACING',
  'PARAGRAPH_INDENT',
]);

function pluginData(resource: PluginDataMixin, metadata: ColorSystemRendererOwnershipMetadataV2) {
  const keys = COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA;
  resource.setPluginData(keys.version, metadata.version);
  resource.setPluginData(keys.transactionId, metadata.transactionId);
  resource.setPluginData(keys.systemId, metadata.systemId);
  resource.setPluginData(keys.recipeId, metadata.recipeId);
  resource.setPluginData(keys.resourceBlueprintHash, metadata.resourceBlueprintHash);
  resource.setPluginData(keys.sectionBlueprintHash, metadata.sectionBlueprintHash);
}

function setResourceKind(resource: PluginDataMixin, kind: ColorSystemHostResourceRefV2['kind']) {
  resource.setPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.resourceKind, kind);
}

function chromePaint(hex: '#000000' | '#FFFFFF', opacity = 1): SolidPaint {
  const channel = hex === '#FFFFFF' ? 1 : 0;
  return {
    type: 'SOLID',
    color: { r: channel, g: channel, b: channel },
    ...(opacity === 1 ? {} : { opacity }),
  };
}

function exactPaint(rgba: RGBA): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: rgba.r, g: rgba.g, b: rgba.b },
    ...(rgba.a === 1 ? {} : { opacity: rgba.a }),
  };
}

function sameBlackOrWhite(paint: Paint): boolean {
  if (paint.type !== 'SOLID') return false;
  const channels = [paint.color.r, paint.color.g, paint.color.b];
  return channels.every(channel => channel === 0) || channels.every(channel => channel === 1);
}

function isBoundSolidPaint(paint: Paint): boolean {
  return (
    paint.type === 'SOLID' &&
    paint.boundVariables?.color?.type === 'VARIABLE_ALIAS' &&
    typeof paint.boundVariables.color.id === 'string'
  );
}

function metadataFor(resource: PluginDataMixin): {
  transactionId: string;
  resourceBlueprintHash: string;
  sectionBlueprintHash: string;
} {
  const keys = COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA;
  return {
    transactionId: resource.getPluginData(keys.transactionId),
    resourceBlueprintHash: resource.getPluginData(keys.resourceBlueprintHash),
    sectionBlueprintHash: resource.getPluginData(keys.sectionBlueprintHash),
  };
}

function normalizedProfile(root: DocumentNode): ColorSystemRendererHostContextV2['colorProfile'] {
  let value: unknown;
  try {
    value = (root as DocumentNode & { readonly documentColorProfile?: unknown })
      .documentColorProfile;
  } catch {
    return 'unknown';
  }
  if (value === 'SRGB') return 'srgb';
  if (value === 'DISPLAY_P3') return 'display-p3';
  return 'unknown';
}

function hostDocumentType(
  editorType: PluginAPI['editorType']
): ColorSystemRendererHostContextV2['documentType'] {
  if (editorType === 'figma') return 'figma-design';
  if (editorType === 'figjam') return 'figjam';
  if ((editorType as string) === 'slides') return 'slides';
  return 'unknown';
}

function variableScopes(scopes: readonly string[]): VariableScope[] {
  return scopes.map(scope => {
    if (!VALID_SCOPES.has(scope as VariableScope)) {
      throw new Error(`Unsupported Figma Variable scope ${scope}.`);
    }
    return scope as VariableScope;
  });
}

function fontKey(font: FontName): string {
  return `${font.family}\u0000${font.style}`;
}

function scenePaints(node: SceneNode): { fills: readonly Paint[]; strokes: readonly Paint[] } {
  const fills = 'fills' in node && Array.isArray(node.fills) ? node.fills : [];
  const strokes = 'strokes' in node && Array.isArray(node.strokes) ? node.strokes : [];
  return { fills, strokes };
}

function allSceneNodes(root: SceneNode): SceneNode[] {
  if ('findAll' in root && typeof root.findAll === 'function') {
    return [root, ...root.findAll()];
  }
  return [root];
}

function stripCollectionSuffix(name: string): string {
  return name
    .replace(/ \/ Primitives and derivations$/, '')
    .replace(/ \/ Semantic applications$/, '');
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function contentOrder(value: unknown): number {
  const order = objectValue(value)?.order;
  return typeof order === 'number' && Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
}

function modeRank(mode: string): number {
  if (mode === 'Light') return 0;
  if (mode === 'Dark') return 1;
  return 2;
}

export function createColorSystemFigmaRendererHostV2(
  figmaApi: PluginAPI,
  currentFileIdentityHash: string
): ColorSystemRendererHostV2 {
  const records = new Map<string, ResourceRecord>();
  const collections = new Map<string, VariableCollection>();
  const variables = new Map<string, VariableRecipeRecord>();
  const components = new Map<string, ComponentRecord>();
  const loadedFonts = new Map<string, FontName>();
  let page: PageNode | null = null;
  let outputName = 'Teul Color System';
  let componentIndex = 0;
  let createdResourceObserver: ((ref: ColorSystemHostResourceRefV2) => void) | null = null;

  const remember = (
    resource: ManagedResource,
    kind: ColorSystemHostResourceRefV2['kind'],
    recipeId: string,
    metadata: ColorSystemRendererOwnershipMetadataV2
  ): ColorSystemHostResourceRefV2 => {
    pluginData(resource, metadata);
    setResourceKind(resource, kind);
    const ref = { id: resource.id, kind, recipeId };
    records.set(resource.id, { ref, resource, metadata });
    createdResourceObserver?.(ref);
    return ref;
  };

  const ensurePage = (metadata: ColorSystemRendererOwnershipMetadataV2): PageNode => {
    if (page) return page;
    const created = figmaApi.createPage();
    try {
      created.name = `${outputName} — Color System`;
      const pageMetadata = {
        ...metadata,
        recipeId: COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID,
      };
      remember(created, 'page', COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID, pageMetadata);
      page = created;
      return created;
    } catch (error) {
      records.delete(created.id);
      created.remove();
      throw error;
    }
  };

  const requireFont = (preferred?: ColorSystemRendererFontV2): FontName => {
    if (preferred) {
      const exact = loadedFonts.get(fontKey(preferred));
      if (exact) return exact;
    }
    const first = loadedFonts.values().next().value as FontName | undefined;
    if (!first) throw new Error('No presentation font was preloaded.');
    return first;
  };

  const createText = (
    parent: ChildrenMixin,
    characters: string,
    x: number,
    y: number,
    width: number,
    fontSize: number,
    font: FontName,
    opacity = 1
  ): TextNode => {
    const node = figmaApi.createText();
    parent.appendChild(node);
    node.name = characters.slice(0, 80);
    node.fontName = font;
    node.characters = characters;
    node.fontSize = fontSize;
    node.fills = [chromePaint('#000000', opacity)];
    node.x = x;
    node.y = y;
    node.resize(width, Math.max(fontSize * 1.3, 16));
    node.textAutoResize = 'HEIGHT';
    node.setPluginData(
      COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.paintClassification,
      'documentation-chrome'
    );
    node.setPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.sceneRole, 'documentation-text');
    return node;
  };

  const variableRecord = (id: string): VariableRecipeRecord => {
    const record = variables.get(id);
    if (!record) throw new Error(`Unknown managed Variable ${id}.`);
    return record;
  };

  const exactColor = (id: string, mode?: string, seen = new Set<string>()): RGBA => {
    if (seen.has(id)) throw new Error(`Variable alias cycle at ${id}.`);
    seen.add(id);
    const record = variableRecord(id);
    if (record.kind === 'primitive') {
      const entry =
        record.request.values.find(value => value.modeName === mode) ?? record.request.values[0];
      if (!entry) throw new Error(`Variable ${id} has no exact fallback color.`);
      return entry.rgba;
    }
    const alias =
      record.request.aliases.find(value => value.modeName === mode) ?? record.request.aliases[0];
    if (!alias) throw new Error(`Alias Variable ${id} has no target.`);
    return exactColor(alias.targetVariableId, mode, seen);
  };

  const boundPaint = (variableId: string, mode?: string): SolidPaint => {
    const record = variableRecord(variableId);
    return figmaApi.variables.setBoundVariableForPaint(
      exactPaint(exactColor(variableId, mode)),
      'color',
      record.variable
    );
  };

  const preferredMode = (variableId: string): string => {
    const record = variableRecord(variableId);
    const mode =
      record.kind === 'primitive'
        ? record.request.values[0]?.modeName
        : record.request.aliases[0]?.modeName;
    if (!mode) throw new Error(`Variable ${variableId} has no presentation mode.`);
    return mode;
  };

  const applyExplicitVariableMode = (
    node: SceneNode,
    variableId: string,
    mode: string,
    seen = new Set<string>()
  ): void => {
    if (seen.has(variableId)) throw new Error(`Variable alias cycle at ${variableId}.`);
    seen.add(variableId);
    const record = variableRecord(variableId);
    const applyModeId = (modeId: string): void => {
      const collection = collections.get(record.request.collectionId);
      if (!collection || !collection.modes.some(candidate => candidate.modeId === modeId)) {
        throw new Error(`Variable ${variableId} has no valid Figma collection mode for ${mode}.`);
      }
      node.setExplicitVariableModeForCollection(collection, modeId);
    };
    if (record.kind === 'primitive') {
      const entry = record.request.values.find(value => value.modeName === mode);
      if (!entry) {
        throw new Error(`Variable ${variableId} cannot resolve presentation mode ${mode}.`);
      }
      applyModeId(entry.modeId);
      return;
    }
    const entry = record.request.aliases.find(value => value.modeName === mode);
    if (!entry) throw new Error(`Variable ${variableId} cannot resolve presentation mode ${mode}.`);
    applyModeId(entry.modeId);
    applyExplicitVariableMode(node, entry.targetVariableId, mode, seen);
  };

  const createBoundSwatch = (
    parent: ChildrenMixin,
    variableId: string,
    mode: string,
    x: number,
    y: number,
    width: number,
    height: number,
    boundary: ColorSystemRendererFrameRequestV2['recipe']['sectionContent']['cardBoundary'] = {
      kind: 'none',
    }
  ): RectangleNode => {
    const swatch = figmaApi.createRectangle();
    parent.appendChild(swatch);
    swatch.name = `Bound color ${variableId}`;
    swatch.x = x;
    swatch.y = y;
    swatch.resize(width, height);
    swatch.fills = [boundPaint(variableId, mode)];
    applyExplicitVariableMode(swatch, variableId, mode);
    if (boundary.kind === 'monochrome-inside-1px') {
      swatch.strokes = [chromePaint(boundary.color)];
      swatch.strokeWeight = 1;
      swatch.strokeAlign = 'INSIDE';
    } else {
      swatch.strokes = [];
    }
    swatch.setPluginData(
      COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.paintClassification,
      'system-bound'
    );
    swatch.setPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.sceneRole, 'color-swatch');
    return swatch;
  };

  const formatColor = (variableId: string, mode: string): string => {
    const color = exactColor(variableId, mode);
    const hex = [color.r, color.g, color.b]
      .map(channel =>
        Math.round(channel * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
      .toUpperCase();
    const alpha = color.a === 1 ? '' : ` · ${Math.round(color.a * 100)}% alpha`;
    return `#${hex}${alpha}`;
  };

  const readableChromeColor = (variableId: string, mode: string): '#000000' | '#FFFFFF' => {
    const color = exactColor(variableId, mode);
    const linear = (channel: number) =>
      channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    const luminance =
      0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
    const blackContrast = (luminance + 0.05) / 0.05;
    const whiteContrast = 1.05 / (luminance + 0.05);
    return blackContrast >= whiteContrast ? '#000000' : '#FFFFFF';
  };

  const visibilityBoundary = (
    variableId: string,
    mode: string
  ): ColorSystemRendererFrameRequestV2['recipe']['sectionContent']['cardBoundary'] => {
    const color = exactColor(variableId, mode);
    const linear = (channel: number) =>
      channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    const luminance =
      0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
    return 1.05 / (luminance + 0.05) < 1.2
      ? { kind: 'monochrome-inside-1px', color: '#000000' }
      : { kind: 'none' };
  };

  const setDocumentationTextColor = (node: TextNode, color: '#000000' | '#FFFFFF') => {
    node.fills = [chromePaint(color)];
    node.setPluginData(
      COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.paintClassification,
      'documentation-chrome'
    );
  };

  const setBoundTextColor = (node: TextNode, variableId: string, mode: string) => {
    node.fills = [boundPaint(variableId, mode)];
    applyExplicitVariableMode(node, variableId, mode);
    node.setPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.paintClassification, 'system-bound');
  };

  const createChromeRule = (
    parent: ChildrenMixin,
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    const rule = figmaApi.createRectangle();
    parent.appendChild(rule);
    rule.name = 'Documentation rule';
    rule.x = x;
    rule.y = y;
    rule.resize(width, height);
    rule.fills = [chromePaint('#000000')];
    rule.strokes = [];
    rule.setPluginData(
      COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.paintClassification,
      'documentation-chrome'
    );
    rule.setPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.sceneRole, 'documentation-rule');
    return rule;
  };

  const renderFamilyComponent = (
    node: ComponentNode,
    request: ColorSystemRendererComponentRequestV2,
    font: FontName
  ) => {
    const byMode = new Map<string, typeof request.paintBindings>();
    request.paintBindings.forEach(binding => {
      const entries = byMode.get(binding.mode) ?? [];
      byMode.set(binding.mode, [...entries, binding]);
    });
    const modes = [...byMode.keys()].sort(
      (left, right) => modeRank(left) - modeRank(right) || left.localeCompare(right)
    );
    node.resize(2100, modes.length > 1 ? 760 : 500);
    createText(node, request.name, 48, 36, 2004, 34, font);
    const content = objectValue(request.recipe.content);
    const brandFit = objectValue(content?.brandFit);
    const prominence = typeof brandFit?.prominence === 'string' ? brandFit.prominence : null;
    createText(
      node,
      prominence
        ? `${prominence} family · exact Light and Dark scale values`
        : 'Exact source colors',
      48,
      84,
      2004,
      18,
      font,
      0.62
    );
    modes.forEach((mode, modeIndex) => {
      const bindings = byMode.get(mode) ?? [];
      const startX = 166;
      const gap = 10;
      const available = 1886;
      const width = Math.max(
        40,
        (available - Math.max(0, bindings.length - 1) * gap) / bindings.length
      );
      const y = 154 + modeIndex * 278;
      createText(node, mode, 48, y + 78, 96, 18, font, 0.7);
      bindings.forEach((binding, index) => {
        const swatch = createBoundSwatch(
          node,
          binding.variableId,
          binding.mode,
          startX + index * (width + gap),
          y,
          width,
          190,
          visibilityBoundary(binding.variableId, binding.mode)
        );
        swatch.name = `${binding.purpose} · ${binding.mode}`;
      });
      if (bindings.length > 0) {
        createText(
          node,
          `1  ${' '.repeat(Math.max(1, bindings.length * 2 - 3))}  ${bindings.length}`,
          startX,
          y + 204,
          available,
          13,
          font,
          0.55
        );
      }
    });
  };

  const renderProductGraphicComponent = (
    node: ComponentNode,
    request: ColorSystemRendererComponentRequestV2,
    font: FontName
  ) => {
    node.resize(2700, 1050);
    createText(node, request.name, 56, 42, 2588, 32, font);
    createText(
      node,
      'Variable-bound application specimen · not a new palette color',
      56,
      88,
      2588,
      18,
      font,
      0.62
    );
    const binding = request.paintBindings[0];
    if (!binding) return;
    if (request.name.toLowerCase().includes('icon')) {
      [0, 1, 2].forEach(index =>
        createBoundSwatch(
          node,
          binding.variableId,
          binding.mode,
          420 + index * 610,
          260,
          430,
          430,
          visibilityBoundary(binding.variableId, binding.mode)
        )
      );
      createChromeRule(node, 555, 395, 160, 18);
      createChromeRule(node, 555, 455, 160, 18);
      createChromeRule(node, 555, 515, 100, 18);
    } else if (request.name.toLowerCase().includes('surface')) {
      const surface = createBoundSwatch(
        node,
        binding.variableId,
        binding.mode,
        230,
        220,
        2240,
        590,
        visibilityBoundary(binding.variableId, binding.mode)
      );
      surface.name = 'Product surface specimen';
      createChromeRule(node, 440, 410, 1120, 24);
      createChromeRule(node, 440, 480, 760, 18);
      createChromeRule(node, 440, 610, 420, 96);
    } else {
      [
        [220, 260, 760, 470],
        [1040, 260, 560, 470],
        [1660, 260, 820, 220],
        [1660, 530, 820, 200],
      ].forEach(([x, y, width, height]) =>
        createBoundSwatch(
          node,
          binding.variableId,
          binding.mode,
          x,
          y,
          width,
          height,
          visibilityBoundary(binding.variableId, binding.mode)
        )
      );
    }
    createText(
      node,
      `${formatColor(binding.variableId, binding.mode)} · ${binding.mode}`,
      56,
      940,
      2588,
      17,
      font,
      0.62
    );
  };

  const renderDataVisualizationComponent = (
    node: ComponentNode,
    request: ColorSystemRendererComponentRequestV2,
    font: FontName
  ) => {
    const content = objectValue(request.recipe.content);
    const marks = Array.isArray(content?.marks) ? content.marks.map(objectValue) : [];
    const markLabel = (index: number, fallback: string): string => {
      const label = marks[index]?.label;
      return typeof label === 'string' && label.trim().length > 0 ? label : fallback;
    };
    const nonColorCue =
      typeof content?.nonColorCue === 'string'
        ? content.nonColorCue
            .replace(/-/g, ' ')
            .replace('axis and endpoint labels', 'axis + endpoint labels')
            .replace('zero line and sign labels', 'zero line + sign labels')
        : 'direct labels';
    const surfaceBinding = request.paintBindings.find(binding => binding.purpose === 'surface');
    const boundaryBinding = request.paintBindings.find(binding => binding.purpose === 'boundary');
    const bindings = request.paintBindings.filter(binding => binding.purpose.startsWith('mark-'));
    const chartTextColor = surfaceBinding
      ? readableChromeColor(surfaceBinding.variableId, surfaceBinding.mode)
      : '#000000';
    if (surfaceBinding) {
      node.fills = [boundPaint(surfaceBinding.variableId, surfaceBinding.mode)];
      applyExplicitVariableMode(node, surfaceBinding.variableId, surfaceBinding.mode);
      node.setPluginData(
        COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.paintClassification,
        'system-bound'
      );
    }
    const chartText = (
      characters: string,
      x: number,
      y: number,
      width: number,
      fontSize: number,
      opacity = 1
    ) => {
      const text = createText(node, characters, x, y, width, fontSize, font, opacity);
      setDocumentationTextColor(text, chartTextColor);
      return text;
    };
    const chartRule = (x: number, y: number, width: number, height: number) => {
      const rule = createChromeRule(node, x, y, width, height);
      rule.fills = [chromePaint(chartTextColor, 0.72)];
      return rule;
    };
    const bindCategoricalBoundary = (swatch: RectangleNode) => {
      if (!boundaryBinding) return;
      swatch.strokes = [boundPaint(boundaryBinding.variableId, boundaryBinding.mode)];
      swatch.strokeWeight = 1;
      swatch.strokeAlign = 'INSIDE';
      applyExplicitVariableMode(swatch, boundaryBinding.variableId, boundaryBinding.mode);
    };
    node.resize(2700, 1120);
    chartText(request.name, 56, 42, 2588, 32);
    chartText(
      `Direct labels + ${nonColorCue} remain part of the chart contract`,
      56,
      88,
      2588,
      18,
      0.62
    );
    chartRule(220, 830, 2260, 12);
    const kind = request.name.toLowerCase();
    if (kind.includes('sequential')) {
      const endpointLabels =
        Array.isArray(content?.endpointLabels) && content.endpointLabels.length === 2
          ? content.endpointLabels
          : ['Lower', 'Higher'];
      const width = 2100 / Math.max(bindings.length, 1);
      bindings.forEach((binding, index) => {
        createBoundSwatch(
          node,
          binding.variableId,
          binding.mode,
          300 + index * width,
          310,
          width - 18,
          430,
          visibilityBoundary(binding.variableId, binding.mode)
        );
        chartText(
          markLabel(index, `Value ${index + 1}`),
          300 + index * width,
          770,
          width - 18,
          17,
          0.65
        );
      });
      chartText(String(endpointLabels[0]), 300, 885, 300, 18, 0.7);
      chartText(String(endpointLabels[1]), 2100, 885, 300, 18, 0.7);
    } else if (kind.includes('diverging')) {
      const gap = 24;
      const width = (2100 - Math.max(0, bindings.length - 1) * gap) / Math.max(bindings.length, 1);
      const midpointOrder =
        typeof content?.midpointOrder === 'number'
          ? content.midpointOrder
          : Math.floor(bindings.length / 2) + 1;
      bindings.forEach((binding, index) => {
        const x = 300 + index * (width + gap);
        const height = index === midpointOrder - 1 ? 270 : 500;
        createBoundSwatch(
          node,
          binding.variableId,
          binding.mode,
          x,
          830 - height,
          width,
          height,
          visibilityBoundary(binding.variableId, binding.mode)
        );
        chartText(
          markLabel(
            index,
            index === 0 ? 'Negative' : index === bindings.length - 1 ? 'Positive' : 'Zero'
          ),
          x,
          875,
          width,
          17,
          0.7
        );
      });
      chartRule(1344, 220, 12, 690);
    } else {
      const touching = content?.adjacency === 'touching';
      const gap = touching ? 0 : 28;
      const width = (2100 - Math.max(0, bindings.length - 1) * gap) / Math.max(bindings.length, 1);
      bindings.forEach((binding, index) => {
        const height = 340 + (index % 3) * 120;
        const x = 300 + index * (width + gap);
        const swatch = createBoundSwatch(
          node,
          binding.variableId,
          binding.mode,
          x,
          830 - height,
          width,
          height,
          visibilityBoundary(binding.variableId, binding.mode)
        );
        swatch.cornerRadius = index % 3 === 0 ? 0 : index % 3 === 1 ? 54 : 240;
        bindCategoricalBoundary(swatch);
        chartText(markLabel(index, `Category ${index + 1}`), x, 875, width, 17, 0.7);
      });
    }
  };

  const renderTypographyComponent = (
    node: ComponentNode,
    request: ColorSystemRendererComponentRequestV2,
    font: FontName
  ) => {
    node.resize(2100, 980);
    const foreground =
      request.paintBindings.find(binding => binding.purpose === 'foreground') ??
      request.paintBindings[0];
    const background =
      request.paintBindings.find(binding => binding.purpose === 'background') ??
      request.paintBindings[1];
    if (!foreground || !background) return;
    node.fills = [boundPaint(background.variableId, background.mode)];
    applyExplicitVariableMode(node, background.variableId, background.mode);
    node.setPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.paintClassification, 'system-bound');
    const boundary = visibilityBoundary(background.variableId, background.mode);
    if (boundary.kind === 'monochrome-inside-1px') {
      node.strokes = [chromePaint(boundary.color)];
      node.strokeWeight = 1;
      node.strokeAlign = 'INSIDE';
    }
    const title = createText(node, request.name, 60, 52, 1980, 26, font);
    setBoundTextColor(title, foreground.variableId, foreground.mode);
    const sample = createText(
      node,
      'A clear color system makes every product surface easier to understand.',
      60,
      260,
      1880,
      request.name.toLowerCase().includes('heading') ? 56 : 34,
      font
    );
    setBoundTextColor(sample, foreground.variableId, foreground.mode);
    const content = objectValue(request.recipe.content);
    const specimen = objectValue(content?.specimen);
    const pairEvidence = Array.isArray(content?.pairEvidence) ? content?.pairEvidence : [];
    const firstEvidence = objectValue(pairEvidence[0]);
    const ratio = typeof firstEvidence?.ratio === 'number' ? firstEvidence.ratio.toFixed(2) : null;
    const evidence = createText(
      node,
      ratio
        ? `Measured pair: ${ratio}:1 · ${String(specimen?.mode ?? foreground.mode)}`
        : `Exact rendered pair · ${foreground.mode}`,
      60,
      860,
      1980,
      18,
      font
    );
    setBoundTextColor(evidence, foreground.variableId, foreground.mode);
  };

  const maybeRemoveEmptyPage = (): void => {
    if (page && page.children.length === 0) {
      page.remove();
      page = null;
    }
  };

  return {
    setCreatedResourceObserver(observer) {
      createdResourceObserver = observer;
    },
    async getContext() {
      return {
        documentType: hostDocumentType(figmaApi.editorType),
        editable: figmaApi.editorType === 'figma' && figmaApi.mode === 'default',
        colorProfile: normalizedProfile(figmaApi.root),
        currentFileIdentityHash,
        capabilities: {
          colorVariables:
            typeof figmaApi.variables?.createVariableCollection === 'function' &&
            typeof figmaApi.variables?.createVariable === 'function',
          variableAliases: typeof figmaApi.variables?.createVariableAlias === 'function',
          variableBoundPaintStyles:
            typeof figmaApi.variables?.setBoundVariableForPaint === 'function' &&
            typeof figmaApi.createPaintStyle === 'function',
          components: typeof figmaApi.createComponent === 'function',
          frames:
            typeof figmaApi.createFrame === 'function' && typeof figmaApi.createPage === 'function',
        },
      };
    },

    async findNameCollisions(names) {
      await figmaApi.loadAllPagesAsync();
      const requested = new Set(names);
      const collisions = new Set<string>();
      const compare = (actual: string) => {
        if (requested.has(actual)) collisions.add(actual);
        for (const candidate of requested) {
          if (actual === `${candidate} — Color System`) collisions.add(candidate);
        }
      };
      (await figmaApi.variables.getLocalVariableCollectionsAsync()).forEach(collection =>
        compare(collection.name)
      );
      (await figmaApi.getLocalPaintStylesAsync()).forEach(style => compare(style.name));
      for (const candidatePage of figmaApi.root.children) {
        compare(candidatePage.name);
        candidatePage.findAll().forEach(node => compare(node.name));
      }
      return [...collisions].sort();
    },

    async loadFonts(fonts) {
      const unique = new Map<string, FontName>();
      fonts.forEach(font => unique.set(fontKey(font), { family: font.family, style: font.style }));
      for (const font of unique.values()) await figmaApi.loadFontAsync(font);
      unique.forEach((font, key) => loadedFonts.set(key, font));
    },

    async createCollection(request): Promise<ColorSystemRendererCollectionResultV2> {
      const collection = figmaApi.variables.createVariableCollection(request.name);
      try {
        outputName = stripCollectionSuffix(request.name);
        const modes: Record<string, string> = {};
        request.recipe.modes.forEach((mode, index) => {
          if (index === 0) {
            collection.renameMode(collection.defaultModeId, mode);
            modes[mode] = collection.defaultModeId;
          } else {
            modes[mode] = collection.addMode(mode);
          }
        });
        const ref = remember(collection, 'collection', request.recipe.recipeId, request.metadata);
        collection.setPluginData(
          COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.collectionRole,
          request.recipe.role
        );
        collections.set(collection.id, collection);
        return { ref, modeIds: modes };
      } catch (error) {
        collection.remove();
        throw error;
      }
    },

    async createPrimitiveVariable(request) {
      const collection = collections.get(request.collectionId);
      if (!collection) throw new Error(`Unknown Variable collection ${request.collectionId}.`);
      const variable = figmaApi.variables.createVariable(request.name, collection, 'COLOR');
      try {
        variable.description = request.description;
        variable.scopes = variableScopes(request.scopes);
        request.values.forEach(entry => variable.setValueForMode(entry.modeId, entry.rgba));
        const ref = remember(variable, 'variable', request.recipeId, request.metadata);
        variables.set(variable.id, { kind: 'primitive', variable, request });
        return ref;
      } catch (error) {
        variable.remove();
        throw error;
      }
    },

    async createAliasVariable(request) {
      const collection = collections.get(request.collectionId);
      if (!collection) throw new Error(`Unknown Variable collection ${request.collectionId}.`);
      const variable = figmaApi.variables.createVariable(request.name, collection, 'COLOR');
      try {
        variable.description = request.description;
        variable.scopes = variableScopes(request.scopes);
        request.aliases.forEach(entry => {
          const target = variableRecord(entry.targetVariableId).variable;
          variable.setValueForMode(entry.modeId, figmaApi.variables.createVariableAlias(target));
        });
        const ref = remember(variable, 'variable', request.recipeId, request.metadata);
        variables.set(variable.id, { kind: 'alias', variable, request });
        return ref;
      } catch (error) {
        variable.remove();
        throw error;
      }
    },

    async createPaintStyle(request) {
      const target = variableRecord(request.variableId);
      const style = figmaApi.createPaintStyle();
      try {
        style.name = request.name;
        style.description = request.description;
        style.paints = [
          figmaApi.variables.setBoundVariableForPaint(
            exactPaint(exactColor(request.variableId)),
            'color',
            target.variable
          ),
        ];
        return remember(style, 'style', request.recipeId, request.metadata);
      } catch (error) {
        style.remove();
        throw error;
      }
    },

    async createComponent(request) {
      const destination = ensurePage(request.metadata);
      const node = figmaApi.createComponent();
      try {
        destination.appendChild(node);
        node.name = request.name;
        node.description = `${request.recipe.kind} · ${request.recipe.role}`;
        node.resize(760, 440);
        node.x = componentIndex * 2_850;
        node.y = 5_700;
        componentIndex += 1;
        node.fills = [chromePaint('#FFFFFF')];
        node.strokes = [];
        node.clipsContent = false;
        node.setPluginData(
          COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.paintClassification,
          'documentation-chrome'
        );
        const font = requireFont();
        if (
          request.recipe.kind === 'primary-family' ||
          request.recipe.kind === 'secondary-family'
        ) {
          renderFamilyComponent(node, request, font);
        } else if (request.recipe.kind === 'product-graphics') {
          renderProductGraphicComponent(node, request, font);
        } else if (request.recipe.kind === 'data-visualization') {
          renderDataVisualizationComponent(node, request, font);
        } else if (request.recipe.kind === 'typography') {
          renderTypographyComponent(node, request, font);
        }
        const ref = remember(node, 'component', request.recipe.recipeId, request.metadata);
        components.set(node.id, { component: node, request });
        return ref;
      } catch (error) {
        node.remove();
        maybeRemoveEmptyPage();
        throw error;
      }
    },

    async createFrame(request) {
      const destination = ensurePage(request.metadata);
      const node = figmaApi.createFrame();
      try {
        destination.appendChild(node);
        node.name = request.name;
        node.resize(request.geometry.width, request.geometry.height);
        node.x =
          (request.recipe.order - 1) * (request.geometry.width + request.geometry.siblingGap);
        node.y = 0;
        node.fills = [chromePaint('#FFFFFF')];
        node.strokes = [];
        node.clipsContent = true;
        node.setPluginData(
          COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.paintClassification,
          'documentation-chrome'
        );
        node.setPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.frameRole, request.recipe.role);
        node.setPluginData(
          COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.frameOrder,
          String(request.recipe.order)
        );
        const titleRole = request.recipe.presentationContent.typography.find(role =>
          role.role.toLowerCase().includes('title')
        );
        const font = requireFont(
          titleRole ? { family: titleRole.fontFamily, style: titleRole.fontStyle } : undefined
        );
        const header = request.geometry.header;
        const changeLabel =
          request.recipe.sectionContent.disposition === 'preserve'
            ? 'KEPT EXACTLY AS SUPPLIED'
            : 'TEUL RECOMMENDATION';
        createText(node, changeLabel, header.x, header.y, header.width * 0.45, 20, font, 0.58);
        createText(
          node,
          request.recipe.sectionContent.title,
          header.x,
          header.y + 52,
          Math.min(header.width, request.geometry.width - header.x * 2),
          titleRole?.fontSize ?? 64,
          font
        );
        createText(
          node,
          request.recipe.sectionContent.guidance,
          Math.min(header.guidanceX, request.geometry.width - header.guidanceWidth - 32),
          header.y + 52,
          header.guidanceWidth,
          Math.max(18, (titleRole?.fontSize ?? 64) * 0.35),
          font,
          0.65
        );

        const palette = request.geometry.palette;
        const cardGap = palette.cardGap;
        const role = request.recipe.role;
        const rows = request.recipe.presentationContent.section.rows;
        const rowCapacity = rows.reduce((sum, row) => sum + row.count, 0);
        const variableIds =
          role === 'secondary' && request.systemVariableIds.length > 24
            ? []
            : request.systemVariableIds.slice(0, rowCapacity);
        let variableIndex = 0;
        let cardEndY = palette.y;
        rows.forEach(row => {
          const remaining = variableIds.length - variableIndex;
          if (remaining <= 0) return;
          const count = Math.min(row.count, remaining);
          const cardHeight =
            role === 'primary'
              ? row.height
              : role === 'product-graphics'
                ? 410
                : role === 'data-visualization'
                  ? 520
                  : 500;
          for (let column = 0; column < count; column += 1) {
            const variableId = variableIds[variableIndex];
            variableIndex += 1;
            const mode = preferredMode(variableId);
            const card = figmaApi.createFrame();
            node.appendChild(card);
            const recipeName = records.get(variableId)?.ref.recipeId ?? variableId;
            card.name = recipeName.split('/').slice(-3).join(' / ');
            card.x = palette.x + column * (row.cardWidth + cardGap);
            card.y = cardEndY;
            card.resize(row.cardWidth, cardHeight);
            card.fills = [boundPaint(variableId, mode)];
            applyExplicitVariableMode(card, variableId, mode);
            const boundary = request.recipe.sectionContent.cardBoundary;
            if (boundary.kind === 'monochrome-inside-1px') {
              card.strokes = [chromePaint(boundary.color)];
              card.strokeWeight = 1;
              card.strokeAlign = 'INSIDE';
            } else {
              card.strokes = [];
            }
            card.clipsContent = true;
            card.setPluginData(
              COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.paintClassification,
              'system-bound'
            );
            card.setPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.sceneRole, 'color-swatch');
            const textColor = readableChromeColor(variableId, mode);
            const label = createText(
              card,
              recipeName.split('/').slice(-2).join(' / '),
              palette.cardPadding,
              Math.max(palette.cardPadding, cardHeight - 132),
              row.cardWidth - palette.cardPadding * 2,
              role === 'primary' ? 24 : 18,
              font
            );
            setDocumentationTextColor(label, textColor);
            const value = createText(
              card,
              `${formatColor(variableId, mode)} · ${mode}`,
              palette.cardPadding,
              Math.max(palette.cardPadding + 36, cardHeight - 76),
              row.cardWidth - palette.cardPadding * 2,
              role === 'primary' ? 18 : 15,
              font,
              0.72
            );
            setDocumentationTextColor(value, textColor);
          }
          cardEndY += cardHeight + palette.rowGap;
        });

        const componentRecords = request.componentIds
          .map(componentId => {
            const componentRecord = components.get(componentId);
            if (!componentRecord) throw new Error(`Unknown component ${componentId}.`);
            return componentRecord;
          })
          .sort(
            (left, right) =>
              contentOrder(left.request.recipe.content) -
                contentOrder(right.request.recipe.content) ||
              left.component.name.localeCompare(right.component.name)
          );
        const componentLayout =
          role === 'secondary'
            ? { columns: 4, startY: palette.y, gapX: 92, gapY: 74 }
            : role === 'product-graphics'
              ? {
                  columns: 3,
                  startY: Math.max(cardEndY + 110, palette.y + 1360),
                  gapX: 80,
                  gapY: 74,
                }
              : role === 'data-visualization'
                ? {
                    columns: 3,
                    startY: Math.max(cardEndY + 110, palette.y + 680),
                    gapX: 80,
                    gapY: 74,
                  }
                : role === 'typography'
                  ? {
                      columns: 4,
                      startY: Math.max(cardEndY + 110, palette.y + 660),
                      gapX: 92,
                      gapY: 74,
                    }
                  : null;
        if (componentLayout) {
          componentRecords.forEach((componentRecord, index) => {
            const instance = componentRecord.component.createInstance();
            node.appendChild(instance);
            instance.name = `${componentRecord.component.name} specimen`;
            const column = index % componentLayout.columns;
            const row = Math.floor(index / componentLayout.columns);
            instance.x =
              palette.x + column * (componentRecord.component.width + componentLayout.gapX);
            instance.y =
              componentLayout.startY +
              row * (componentRecord.component.height + componentLayout.gapY);
          });
        }

        const summary =
          role === 'primary'
            ? `${variableIds.length} exact source colors preserved; Primary is unchanged.`
            : role === 'secondary'
              ? `${componentRecords.length} suggested families with exact 12-step Light and Dark scales.`
              : role === 'product-graphics'
                ? `${componentRecords.length} variable-bound Product Graphics and iconography specimens.`
                : role === 'data-visualization'
                  ? 'Categorical, sequential, and diverging specimens with direct non-color cues.'
                  : `${componentRecords.length} exact foreground/background specimens across Light and Dark.`;
        const rating =
          role === 'primary'
            ? 'Rating: exact lock coverage; no suggested replacement colors.'
            : role === 'secondary'
              ? 'Rating: family coverage, Light/Dark scale completeness, brand-fit prominence, and job eligibility.'
              : role === 'product-graphics'
                ? 'Rating: three required jobs covered; accessibility attaches only to exact contexts.'
                : role === 'data-visualization'
                  ? 'Rating: chart-role coverage plus advisory CVD separation; color is never the only cue.'
                  : 'Rating: WCAG 2.2 ratios belong only to the exact rendered text pairs shown.';
        createText(
          node,
          summary,
          palette.x,
          request.geometry.height - 190,
          palette.width * 0.62,
          18,
          font,
          0.68
        );
        createText(
          node,
          rating,
          palette.x,
          request.geometry.height - 140,
          palette.width * 0.86,
          16,
          font,
          0.58
        );
        const ref = remember(node, 'frame', request.recipe.recipeId, request.metadata);
        return ref;
      } catch (error) {
        node.remove();
        maybeRemoveEmptyPage();
        throw error;
      }
    },

    async inspectCreatedSystem(request): Promise<ColorSystemRendererHostInventoryV2> {
      const selected = request.refs.map(ref => {
        const record = records.get(ref.id);
        if (!record) throw new Error(`Created resource ${ref.id} is unavailable.`);
        const actual = metadataFor(record.resource);
        if (actual.transactionId !== request.transactionId) {
          throw new Error(`Created resource ${ref.id} is not owned by this transaction.`);
        }
        return record;
      });
      const count = (kind: ColorSystemHostResourceRefV2['kind']) =>
        selected.filter(record => record.ref.kind === kind).length;
      const collectionRoles = selected
        .filter(record => record.ref.kind === 'collection')
        .map(record =>
          record.resource.getPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.collectionRole)
        );
      const frameRecords = selected
        .filter(record => record.ref.kind === 'frame')
        .sort(
          (left, right) =>
            Number(left.resource.getPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.frameOrder)) -
            Number(right.resource.getPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.frameOrder))
        );
      let hiddenLiteralPaintCount = 0;
      let boundaryViolationCount = 0;
      for (const record of selected) {
        if (record.ref.kind !== 'component' && record.ref.kind !== 'frame') continue;
        for (const node of allSceneNodes(record.resource as ManagedNode)) {
          const classification = node.getPluginData(
            COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.paintClassification
          );
          const role = node.getPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.sceneRole);
          const { fills, strokes } = scenePaints(node);
          if (classification === 'system-bound') {
            hiddenLiteralPaintCount += fills.filter(paint => !isBoundSolidPaint(paint)).length;
          } else if (classification === 'documentation-chrome') {
            hiddenLiteralPaintCount += [...fills, ...strokes].filter(
              paint => !sameBlackOrWhite(paint)
            ).length;
          } else if (fills.length > 0 || strokes.length > 0) {
            hiddenLiteralPaintCount += fills.length + strokes.length;
          }
          if (role === 'color-swatch' && strokes.length > 0) {
            const strokeNode = node as RectangleNode;
            if (
              strokes.length !== 1 ||
              !sameBlackOrWhite(strokes[0]) ||
              strokeNode.strokeWeight !== 1 ||
              strokeNode.strokeAlign !== 'INSIDE'
            ) {
              boundaryViolationCount += 1;
            }
          }
        }
      }
      const unresolvedAliasCount = [...variables.values()].reduce((sum, record) => {
        if (record.kind !== 'alias') return sum;
        return (
          sum +
          Object.values(record.variable.valuesByMode).filter(
            value =>
              typeof value !== 'object' ||
              value === null ||
              !('type' in value) ||
              value.type !== 'VARIABLE_ALIAS' ||
              !variables.has(value.id)
          ).length
        );
      }, 0);
      return {
        counts: {
          collections: count('collection'),
          variables: count('variable'),
          styles: count('style'),
          components: count('component'),
          frames: count('frame'),
        },
        collectionRoles: collectionRoles as ['primitives', 'semantics'],
        frameRoles: frameRecords.map(record =>
          record.resource.getPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.frameRole)
        ),
        resourceBlueprintHashes: selected.map(
          record => metadataFor(record.resource).resourceBlueprintHash
        ),
        sectionBlueprintHashes: selected.map(
          record => metadataFor(record.resource).sectionBlueprintHash
        ),
        unresolvedAliasCount,
        hiddenLiteralPaintCount,
        boundaryViolationCount,
      };
    },

    async removeResource(ref) {
      const record = records.get(ref.id);
      if (!record) return;
      record.resource.remove();
      records.delete(ref.id);
      collections.delete(ref.id);
      variables.delete(ref.id);
      components.delete(ref.id);
      maybeRemoveEmptyPage();
    },

    async commitUndo() {
      figmaApi.commitUndo();
    },

    async revealCreatedSystem(request) {
      if (request.frameRefs.length !== 5) {
        throw new Error('Exactly five created presentation frames are required for reveal.');
      }
      const destination = page;
      if (!destination) throw new Error('The created color-system page is unavailable.');
      const frames = request.frameRefs.map(ref => {
        const record = records.get(ref.id);
        if (
          !record ||
          ref.kind !== 'frame' ||
          record.ref.kind !== 'frame' ||
          !('type' in record.resource) ||
          record.resource.type !== 'FRAME' ||
          metadataFor(record.resource).transactionId !== request.transactionId ||
          record.resource.parent !== destination
        ) {
          throw new Error(`Created presentation frame ${ref.id} is unavailable for reveal.`);
        }
        return record.resource as FrameNode;
      });
      if (new Set(frames.map(frame => frame.id)).size !== 5) {
        throw new Error('Created presentation frames are duplicated.');
      }
      await figmaApi.setCurrentPageAsync(destination);
      destination.selection = frames;
      figmaApi.viewport.scrollAndZoomIntoView(frames);
    },
  };
}
