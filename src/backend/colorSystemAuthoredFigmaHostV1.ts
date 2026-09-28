/** Native authored delivery adapter. The renderer owns approval, freshness and the transaction. */
import type {
  ColorSystemApplicationGeometryNodeV1,
  ColorSystemApplicationGeometryRegionV1,
} from '../lib/colorSystemApplicationGeometryV1';
import { serializeColorSystemInertJsonV1 } from '../lib/colorSystemInertJsonV1';
import {
  colorSystemAuthoredPageNameV1,
  colorSystemAuthoredResourceNameV1,
  type ColorSystemAuthoredRenderPlanV1,
  type ColorSystemAuthoredRendererHostV1,
} from './colorSystemAuthoredRendererV1';
import {
  createColorSystemNativeCollectionV1,
  createColorSystemNativeVariableV1,
  createColorSystemNativePaintStyleV1,
  colorSystemNativeSolidPaintV1,
  readColorSystemNativeContextV1,
  findColorSystemNativeNameCollisionsV1,
} from './colorSystemNativeOperationsV1';
import {
  COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION,
  COLOR_SYSTEM_AUTHORED_FIGMA_PLUGIN_DATA_V1,
  COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA,
} from './colorSystemResourceOwnershipV2';
import { COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID } from './colorSystemCreateJournalV2';
import type { ColorSystemHostResourceRefV2 } from './colorSystemResourceRendererV2';

export const COLOR_SYSTEM_AUTHORED_FIGMA_HOST_V1_LIMITS = Object.freeze({
  maximumTextLength: 65536,
  documentationWidth: 1280,
  maximumDocumentationHeight: 32768,
});
export const COLOR_SYSTEM_AUTHORED_GEOMETRY_PLUGIN_DATA_V1 = Object.freeze({
  applicationId: 'teul-authored-application-id',
  nodeId: 'teul-authored-geometry-node-id',
  useId: 'teul-authored-use-id',
});
type Resource = VariableCollection | Variable | PaintStyle | PageNode | FrameNode;
type PaintNode = FrameNode | RectangleNode | VectorNode;
type DocumentSpec = { recipeId: string; name: string; fields: readonly string[] };
const KEYS = COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA;
const AUTHORED = COLOR_SYSTEM_AUTHORED_FIGMA_PLUGIN_DATA_V1;
const GEO = COLOR_SYSTEM_AUTHORED_GEOMETRY_PLUGIN_DATA_V1;
const FONT: FontName = { family: 'Arial', style: 'Regular' };
const LIMITS = COLOR_SYSTEM_AUTHORED_FIGMA_HOST_V1_LIMITS;
const STYLE_MODE_NOTE =
  'Paint styles remain mode-dependent aliases. Outside these application boards, explicitly select the documented primitive collection mode; the stored paint fallback does not freeze the resolved color.';
const stringify = (value: unknown) => serializeColorSystemInertJsonV1(value);
function fail(message: string): never {
  throw new Error(`Authored native output: ${message}`);
}
const requireThat = (condition: unknown, message: string): void => {
  if (!condition) fail(message);
};
const numbersEqual = (a: number, b: number) => Object.is(a, b);
function rgba(value: { components: { r: number; g: number; b: number }; alpha: number }): RGBA {
  return { ...value.components, a: value.alpha };
}
function sameColor(actual: unknown, expected: RGBA): boolean {
  if (!actual || typeof actual !== 'object') return false;
  const value = actual as RGBA;
  return (
    Object.keys(value).sort().join(',') === 'a,b,g,r' &&
    (['r', 'g', 'b', 'a'] as const).every(key => numbersEqual(value[key], expected[key]))
  );
}
function samePaint(actual: unknown, expected: RGBA, variableId?: string): boolean {
  if (!actual || typeof actual !== 'object') return false;
  const paint = actual as SolidPaint;
  return (
    paint.type === 'SOLID' &&
    paint.visible !== false &&
    (paint.blendMode === undefined || paint.blendMode === 'NORMAL') &&
    numbersEqual(paint.color?.r, expected.r) &&
    numbersEqual(paint.color?.g, expected.g) &&
    numbersEqual(paint.color?.b, expected.b) &&
    numbersEqual(paint.opacity ?? 1, expected.a) &&
    (variableId
      ? paint.boundVariables?.color?.type === 'VARIABLE_ALIAS' &&
        paint.boundVariables.color.id === variableId
      : !paint.boundVariables?.color)
  );
}
function metadata(
  resource: PluginDataMixin,
  plan: ColorSystemAuthoredRenderPlanV1,
  recipeId: string,
  kind: string
): void {
  resource.setPluginData(KEYS.version, COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION);
  resource.setPluginData(KEYS.transactionId, plan.transactionId);
  resource.setPluginData(KEYS.systemId, plan.systemId);
  resource.setPluginData(KEYS.recipeId, recipeId);
  resource.setPluginData(KEYS.resourceKind, kind);
  for (const key of Object.keys(AUTHORED) as (keyof typeof AUTHORED)[])
    resource.setPluginData(AUTHORED[key], plan.identity[key]);
}
function verifyMetadata(
  resource: PluginDataMixin,
  plan: ColorSystemAuthoredRenderPlanV1,
  recipeId: string,
  kind: string
): void {
  requireThat(
    resource.getPluginData(KEYS.version) === COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION &&
      resource.getPluginData(KEYS.transactionId) === plan.transactionId &&
      resource.getPluginData(KEYS.systemId) === plan.systemId &&
      resource.getPluginData(KEYS.recipeId) === recipeId &&
      resource.getPluginData(KEYS.resourceKind) === kind,
    `Ownership differs for ${recipeId}.`
  );
  requireThat(
    resource.getPluginData(KEYS.resourceBlueprintHash) === '' &&
      resource.getPluginData(KEYS.sectionBlueprintHash) === '',
    'Authored resources cannot claim legacy blueprint identities.'
  );
  for (const key of Object.keys(AUTHORED) as (keyof typeof AUTHORED)[])
    requireThat(
      resource.getPluginData(AUTHORED[key]) === plan.identity[key],
      `Authored ${key} differs for ${recipeId}.`
    );
}
function documentation(plan: ColorSystemAuthoredRenderPlanV1): DocumentSpec[] {
  const { documentation: data } = plan.blueprint;
  const bounded = (spec: DocumentSpec): DocumentSpec => {
    if (spec.fields.some(field => field.length > LIMITS.maximumTextLength))
      fail('Complete documentation exceeds the native text bound; no claim was truncated.');
    return spec;
  };
  const specs: DocumentSpec[] = [
    bounded({
      recipeId: 'documentation/index',
      name: colorSystemAuthoredResourceNameV1(plan.outputName, 'Documentation index'),
      fields: [
        `${plan.outputName}\nAuthored source and delivery record. Geometry and assessment evidence do not imply owner approval.\n${STYLE_MODE_NOTE}\n${stringify(plan.blueprint.identity)}\nProvided artwork metadata; provenance statement, not source-color approval\n${stringify(plan.blueprint.geometry.plan.artwork ?? null)}`,
        `Sources, coverage and contexts\n${stringify({ sources: data.sources, coverage: data.coverage, contexts: data.contexts })}`,
        `Authored families and related scales\n${stringify({ families: data.families, scales: data.scales })}`,
        `Scoped territory policy\n${stringify(data.brandConstraintsByContext)}`,
        `Conflicts and unavailable numeric values\n${stringify({ conflicts: data.conflicts, numericGaps: data.numericGaps })}`,
        `Retained evidence and claims\n${stringify({ evidence: data.evidence, claims: data.claims })}`,
      ],
    }),
  ];
  for (const rule of data.rules)
    specs.push(
      bounded({
        recipeId: `documentation/rule/${rule.id}`,
        name: colorSystemAuthoredResourceNameV1(plan.outputName, `Rule ${rule.id}`),
        fields: [
          `${rule.label}\n${rule.id}`,
          `Scope, force and attributed adoption\n${stringify({ contextIds: rule.contextIds, modeIds: rule.modeIds, force: rule.force, origin: rule.origin, adoption: data.adoptions.find(item => item.ruleId === rule.id) ?? null })}`,
          `Complete rule\n${stringify(rule)}`,
          `Evidence and source claims\n${stringify({ evidence: data.evidence.filter(item => rule.evidenceRefs.includes(item.id)), claims: data.claims.filter(item => rule.claimIds.includes(item.id)) })}`,
        ],
      })
    );
  return specs;
}
function geometryNodes(root: ColorSystemApplicationGeometryNodeV1) {
  const nodes = new Map<string, ColorSystemApplicationGeometryNodeV1>();
  const visit = (node: ColorSystemApplicationGeometryNodeV1) => {
    nodes.set(node.id, node);
    node.children.forEach(visit);
  };
  visit(root);
  return nodes;
}
function styleDescription(plan: ColorSystemAuthoredRenderPlanV1, aliasId: string): string {
  const alias = plan.blueprint.aliases.find(item => item.recipeId === aliasId)!;
  const modeIds = Object.keys(alias.aliasesByMode);
  requireThat(
    modeIds.length === 1,
    'Each authored paint style requires one explicit application mode.'
  );
  const modeId = modeIds[0];
  const primitive = plan.blueprint.primitives.find(
    item => item.recipeId === alias.aliasesByMode[modeId]
  )!;
  const collection = plan.blueprint.collections.find(
    item => item.recipeId === primitive.collectionRecipeId
  )!;
  const mode = collection.modes.find(item => item.id === modeId)!;
  return `${alias.description}\n${STYLE_MODE_NOTE}\nRequired primitive collection: ${colorSystemAuthoredResourceNameV1(plan.outputName, collection.name)}\nRequired mode: ${mode.name} (${mode.id}).`;
}
function localPath(region: ColorSystemApplicationGeometryRegionV1): string {
  return region.contours
    .map(
      contour =>
        contour
          .map(
            (point, i) =>
              `${i ? 'L' : 'M'}${point.x - region.bounds.x} ${point.y - region.bounds.y}`
          )
          .join(' ') + ' Z'
    )
    .join(' ');
}
function pathTokens(value: string): (string | number)[] | null {
  const tokens = value.match(/[MLZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi);
  if (!tokens || value.replace(/[MLZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?|[\s,]+/gi, '') !== '')
    return null;
  return tokens.map(token => (/^[MLZ]$/.test(token) ? token : Number(token)));
}
function samePath(actual: readonly VectorPath[], expected: string): boolean {
  if (actual.length !== 1 || actual[0].windingRule !== 'EVENODD') return false;
  const a = pathTokens(actual[0].data),
    b = pathTokens(expected);
  return !!a && !!b && a.length === b.length && a.every((token, i) => token === b[i]);
}
function cleanNode(node: PaintNode | TextNode): void {
  node.opacity = 1;
  node.blendMode = 'NORMAL';
  node.visible = true;
  node.strokes = [];
  node.effects = [];
  node.rotation = 0;
  if ('cornerRadius' in node) node.cornerRadius = 0;
  if ('layoutMode' in node) node.layoutMode = 'NONE';
  if ('clipsContent' in node) node.clipsContent = false;
}
function verifyClean(node: PaintNode | TextNode, x: number, y: number): void {
  requireThat(
    node.opacity === 1 &&
      node.blendMode === 'NORMAL' &&
      node.visible &&
      node.strokes.length === 0 &&
      node.effects.length === 0 &&
      node.rotation === 0,
    `Unsupported paint effects or visibility on ${node.name}.`
  );
  requireThat(
    node.x === x &&
      node.y === y &&
      node.relativeTransform[0][0] === 1 &&
      node.relativeTransform[0][1] === 0 &&
      node.relativeTransform[1][0] === 0 &&
      node.relativeTransform[1][1] === 1 &&
      node.relativeTransform[0][2] === x &&
      node.relativeTransform[1][2] === y,
    `Transform differs on ${node.name}.`
  );
  if ('cornerRadius' in node)
    requireThat(node.cornerRadius === 0, `Corners differ on ${node.name}.`);
  if ('layoutMode' in node)
    requireThat(
      node.layoutMode === 'NONE' && !node.clipsContent,
      `Frame layout differs on ${node.name}.`
    );
}

export function createColorSystemAuthoredFigmaHostV1(
  api: PluginAPI,
  currentFileIdentityHash: string
): ColorSystemAuthoredRendererHostV1 {
  const records = new Map<
    string,
    { ref: ColorSystemHostResourceRefV2; plan: ColorSystemAuthoredRenderPlanV1 }
  >();
  let observer: ((ref: ColorSystemHostResourceRefV2) => void) | null = null,
    fontsLoaded = false;
  const resolve = async (ref: ColorSystemHostResourceRefV2): Promise<Resource | null> => {
    if (ref.kind === 'collection') return api.variables.getVariableCollectionByIdAsync(ref.id);
    if (ref.kind === 'variable') return api.variables.getVariableByIdAsync(ref.id);
    if (ref.kind === 'style') return (await api.getStyleByIdAsync(ref.id)) as PaintStyle | null;
    return (await api.getNodeByIdAsync(ref.id)) as PageNode | FrameNode | null;
  };
  const removeOwned = (resource: Resource, plan: ColorSystemAuthoredRenderPlanV1) => {
    if ('findAll' in resource)
      for (const child of resource.findAll())
        requireThat(
          child.getPluginData(KEYS.version) ===
            COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION &&
            child.getPluginData(KEYS.transactionId) === plan.transactionId,
          'Cleanup refuses to remove a foreign descendant.'
        );
    resource.remove();
  };
  return {
    setCreatedResourceObserver(value) {
      observer = value;
    },
    async getContext() {
      return {
        ...readColorSystemNativeContextV1(api, currentFileIdentityHash),
        geometryVectors:
          typeof api.createVector === 'function' && typeof api.createRectangle === 'function',
      };
    },
    findNameCollisions: names => findColorSystemNativeNameCollisionsV1(api, names),
    async loadFonts() {
      await api.loadFontAsync(FONT);
      fontsLoaded = true;
    },
    async createOutput(plan, progress) {
      if (!fontsLoaded) fail('Arial Regular must be loaded before creating documentation.');
      const docs = documentation(plan);
      const blueprint = plan.blueprint;
      const collections = new Map<
        string,
        { collection: VariableCollection; modeIds: Readonly<Record<string, string>> }
      >();
      const variables = new Map<string, Variable>();
      const register = (
        resource: Resource,
        kind: ColorSystemHostResourceRefV2['kind'],
        recipeId: string
      ) => {
        metadata(resource, plan, recipeId, kind);
        const ref = { id: resource.id, kind, recipeId };
        records.set(resource.id, { ref, plan });
        observer?.(ref);
        progress.remember(ref);
        return resource;
      };
      progress.setPhase('collections');
      for (const item of blueprint.collections)
        await createColorSystemNativeCollectionV1(
          api,
          colorSystemAuthoredResourceNameV1(plan.outputName, item.name),
          item.modes,
          (collection, modeIds) => {
            register(collection, 'collection', item.recipeId);
            collections.set(item.recipeId, { collection, modeIds });
          }
        );
      progress.setPhase('primitive-variables');
      for (const item of blueprint.primitives) {
        const owner = collections.get(item.collectionRecipeId)!;
        await createColorSystemNativeVariableV1(
          api,
          owner.collection,
          { name: item.name, description: item.description, scopes: ['ALL_FILLS'] },
          () =>
            Object.entries(item.valuesByMode).map(([modeId, value]) => ({
              modeId: owner.modeIds[modeId],
              value: rgba(value),
            })),
          variable => {
            register(variable, 'variable', item.recipeId);
            variables.set(item.recipeId, variable);
          }
        );
      }
      progress.setPhase('alias-variables');
      for (const item of blueprint.aliases) {
        const owner = collections.get(item.collectionRecipeId)!;
        await createColorSystemNativeVariableV1(
          api,
          owner.collection,
          { name: item.name, description: item.description, scopes: ['ALL_FILLS'] },
          () =>
            Object.entries(item.aliasesByMode).map(([modeId, target]) => ({
              modeId: owner.modeIds[modeId],
              value: api.variables.createVariableAlias(variables.get(target)!),
            })),
          variable => {
            register(variable, 'variable', item.recipeId);
            variables.set(item.recipeId, variable);
          }
        );
      }
      const actualPaint = (aliasId: string, modeId: string): RGBA => {
        const alias = blueprint.aliases.find(item => item.recipeId === aliasId)!;
        const primitive = blueprint.primitives.find(
          item => item.recipeId === alias.aliasesByMode[modeId]
        )!;
        return rgba(primitive.valuesByMode[modeId]);
      };
      progress.setPhase('styles');
      for (const item of blueprint.styles) {
        const alias = blueprint.aliases.find(value => value.recipeId === item.variableRecipeId)!;
        const modeIds = Object.keys(alias.aliasesByMode);
        requireThat(
          modeIds.length === 1,
          'Each authored paint style requires one explicit application mode.'
        );
        await createColorSystemNativePaintStyleV1(
          api,
          {
            name: colorSystemAuthoredResourceNameV1(plan.outputName, item.name),
            description: styleDescription(plan, alias.recipeId),
          },
          variables.get(item.variableRecipeId)!,
          actualPaint(alias.recipeId, modeIds[0]),
          style => {
            register(style, 'style', item.recipeId);
          }
        );
      }
      progress.setPhase('frames');
      const page = api.createPage();
      try {
        page.name = colorSystemAuthoredPageNameV1(plan.outputName);
        register(page, 'page', COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID);
      } catch (error) {
        page.remove();
        throw error;
      }
      let boardX = 0;
      for (const board of blueprint.boards) {
        const frame = api.createFrame();
        try {
          page.appendChild(frame);
          frame.name = colorSystemAuthoredResourceNameV1(plan.outputName, board.name);
          cleanNode(frame);
          frame.resize(board.geometry.width, board.geometry.height);
          frame.x = boardX;
          frame.y = 0;
          metadata(frame, plan, board.recipeId, 'frame');
          const referenced = new Set<string>();
          for (const binding of board.paintBindings) {
            const alias = blueprint.aliases.find(
              item => item.recipeId === binding.variableRecipeId
            )!;
            const primitive = blueprint.primitives.find(
              item => item.recipeId === alias.aliasesByMode[board.modeId]
            )!;
            referenced.add(alias.collectionRecipeId);
            referenced.add(primitive.collectionRecipeId);
          }
          for (const id of referenced) {
            const owner = collections.get(id)!;
            requireThat(
              !!owner.modeIds[board.modeId],
              'Referenced collection lacks the exact authored mode.'
            );
            frame.setExplicitVariableModeForCollection(
              owner.collection,
              owner.modeIds[board.modeId]
            );
          }
          const regions = blueprint.geometry.regions.filter(
            item => item.applicationId === board.applicationId
          );
          const sourceNodes = geometryNodes(board.geometry.root);
          for (const region of regions) {
            const root = region.parentNodeId === null;
            const sourceNode = sourceNodes.get(region.nodeId)!;
            const child = root
              ? frame
              : sourceNode.shape.kind === 'rect'
                ? api.createRectangle()
                : api.createVector();
            try {
              if (!root) frame.appendChild(child);
              cleanNode(child);
              if (!root) {
                child.name = sourceNode.textAlternative ?? sourceNode.id;
                if (child.type === 'VECTOR')
                  child.vectorPaths = [{ windingRule: 'EVENODD', data: localPath(region) }];
                child.resize(region.bounds.width, region.bounds.height);
                child.x = region.bounds.x;
                child.y = region.bounds.y;
                metadata(
                  child,
                  plan,
                  `${board.recipeId}/node/${sourceNode.id}`,
                  child.type.toLowerCase()
                );
              }
              const variableId = board.paintBindings.find(
                item => item.useId === region.useId
              )!.variableRecipeId;
              child.fills = [
                api.variables.setBoundVariableForPaint(
                  colorSystemNativeSolidPaintV1(actualPaint(variableId, board.modeId)),
                  'color',
                  variables.get(variableId)!
                ),
              ];
              child.setPluginData(GEO.applicationId, board.applicationId);
              child.setPluginData(GEO.nodeId, region.nodeId);
              child.setPluginData(GEO.useId, region.useId);
            } catch (error) {
              if (!root && !child.removed) child.remove();
              throw error;
            }
          }
          register(frame, 'frame', board.recipeId);
          boardX += board.geometry.width + 96;
        } catch (error) {
          if (!frame.removed) removeOwned(frame, plan);
          throw error;
        }
      }
      let docY = Math.max(...blueprint.boards.map(board => board.geometry.height)) + 160;
      for (const spec of docs) {
        const frame = api.createFrame();
        try {
          page.appendChild(frame);
          metadata(frame, plan, spec.recipeId, 'frame');
          frame.name = spec.name;
          cleanNode(frame);
          frame.x = 0;
          frame.y = docY;
          frame.fills = [colorSystemNativeSolidPaintV1({ r: 1, g: 1, b: 1, a: 1 })];
          let y = 32;
          for (let i = 0; i < spec.fields.length; i++) {
            const text = api.createText();
            try {
              frame.appendChild(text);
              metadata(text, plan, `${spec.recipeId}/text/${i}`, 'text');
              text.name = `${spec.recipeId} field ${i + 1}`;
              cleanNode(text);
              text.fontName = FONT;
              text.fontSize = i === 0 ? 24 : 14;
              text.textAutoResize = 'HEIGHT';
              text.resize(LIMITS.documentationWidth - 64, 16);
              text.characters = spec.fields[i];
              text.x = 32;
              text.y = y;
              text.fills = [colorSystemNativeSolidPaintV1({ r: 0, g: 0, b: 0, a: 1 })];
              requireThat(
                Number.isFinite(text.height) && text.height > 0,
                'Documentation text could not be measured.'
              );
              y += text.height + 24;
              if (y + 8 > LIMITS.maximumDocumentationHeight)
                fail(
                  'Complete documentation exceeds native layout bounds; no claim was truncated.'
                );
            } catch (error) {
              if (!text.removed) text.remove();
              throw error;
            }
          }
          frame.resize(LIMITS.documentationWidth, y + 8);
          register(frame, 'frame', spec.recipeId);
          docY += frame.height + 96;
        } catch (error) {
          if (!frame.removed) removeOwned(frame, plan);
          throw error;
        }
      }
    },
    async verifyOutput(plan, refs) {
      const b = plan.blueprint,
        docs = documentation(plan);
      const expected = [
        ...b.collections.map(item => ({ recipeId: item.recipeId, kind: 'collection' })),
        ...b.primitives.map(item => ({ recipeId: item.recipeId, kind: 'variable' })),
        ...b.aliases.map(item => ({ recipeId: item.recipeId, kind: 'variable' })),
        ...b.styles.map(item => ({ recipeId: item.recipeId, kind: 'style' })),
        ...b.boards.map(item => ({ recipeId: item.recipeId, kind: 'frame' })),
        ...docs.map(item => ({ recipeId: item.recipeId, kind: 'frame' })),
        { recipeId: COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID, kind: 'page' },
      ];
      requireThat(
        refs.length === expected.length &&
          new Set(refs.map(ref => ref.id)).size === refs.length &&
          new Set(refs.map(ref => ref.recipeId)).size === refs.length,
        'Native resource identity/count differs.'
      );
      const resources = new Map<string, Resource>();
      for (const item of expected) {
        const ref = refs.find(ref => ref.recipeId === item.recipeId);
        requireThat(ref?.kind === item.kind, `Missing ${item.recipeId}.`);
        const live = await resolve(ref!);
        requireThat(
          live && (!('removed' in live) || !live.removed),
          `Missing native resource ${item.recipeId}.`
        );
        verifyMetadata(live!, plan, item.recipeId, item.kind);
        resources.set(item.recipeId, live!);
      }
      const collectionModes = new Map<string, Record<string, string>>();
      for (const item of b.collections) {
        const live = resources.get(item.recipeId) as VariableCollection;
        requireThat(
          live.name === colorSystemAuthoredResourceNameV1(plan.outputName, item.name) &&
            live.modes.length === item.modes.length &&
            live.defaultModeId === live.modes[0].modeId,
          'Collection name or mode domain differs.'
        );
        const ids: Record<string, string> = Object.create(null);
        item.modes.forEach((mode, i) => {
          requireThat(live.modes[i].name === mode.name, 'Collection mode name differs.');
          ids[mode.id] = live.modes[i].modeId;
        });
        collectionModes.set(item.recipeId, ids);
        const variableIds = [...b.primitives, ...b.aliases]
          .filter(variable => variable.collectionRecipeId === item.recipeId)
          .map(variable => resources.get(variable.recipeId)!.id)
          .sort();
        requireThat(
          [...live.variableIds].sort().join('\n') === variableIds.join('\n'),
          'Collection variable membership differs.'
        );
      }
      for (const item of [...b.primitives, ...b.aliases]) {
        const live = resources.get(item.recipeId) as Variable;
        const owner = resources.get(item.collectionRecipeId) as VariableCollection;
        const modeIds = collectionModes.get(item.collectionRecipeId)!;
        requireThat(
          live.name === item.name &&
            live.description === item.description &&
            live.variableCollectionId === owner.id &&
            live.resolvedType === 'COLOR' &&
            live.scopes.length === 1 &&
            live.scopes[0] === 'ALL_FILLS',
          `Variable metadata differs for ${item.recipeId}.`
        );
        requireThat(
          Object.keys(live.valuesByMode).sort().join('\n') ===
            Object.values(modeIds).sort().join('\n'),
          'Variable mode domain differs.'
        );
        for (const [modeId, nativeMode] of Object.entries(modeIds)) {
          const value = live.valuesByMode[nativeMode];
          if ('valuesByMode' in item)
            requireThat(
              sameColor(value, rgba(item.valuesByMode[modeId])),
              `Exact native channels differ for ${item.recipeId}/${modeId}.`
            );
          else
            requireThat(
              value &&
                typeof value === 'object' &&
                'type' in value &&
                value.type === 'VARIABLE_ALIAS' &&
                value.id === resources.get(item.aliasesByMode[modeId])!.id &&
                Object.keys(value).sort().join(',') === 'id,type',
              `Native alias differs for ${item.recipeId}/${modeId}.`
            );
        }
      }
      const paintFor = (aliasId: string, modeId: string) => {
        const alias = b.aliases.find(item => item.recipeId === aliasId)!;
        return rgba(
          b.primitives.find(item => item.recipeId === alias.aliasesByMode[modeId])!.valuesByMode[
            modeId
          ]
        );
      };
      for (const item of b.styles) {
        const live = resources.get(item.recipeId) as PaintStyle,
          alias = b.aliases.find(alias => alias.recipeId === item.variableRecipeId)!;
        requireThat(
          live.type === 'PAINT' &&
            live.name === colorSystemAuthoredResourceNameV1(plan.outputName, item.name) &&
            live.description === styleDescription(plan, alias.recipeId) &&
            live.paints.length === 1 &&
            samePaint(
              live.paints[0],
              paintFor(alias.recipeId, Object.keys(alias.aliasesByMode)[0]),
              resources.get(alias.recipeId)!.id
            ),
          `Bound paint style differs for ${item.recipeId}.`
        );
      }
      const page = resources.get(COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID) as PageNode;
      requireThat(
        page.type === 'PAGE' &&
          page.name === colorSystemAuthoredPageNameV1(plan.outputName) &&
          page.parent?.id === api.root.id &&
          page.children.length === b.boards.length + docs.length,
        'Output page structure differs.'
      );
      let boardX = 0,
        nativeNodes = 1;
      for (const board of b.boards) {
        const frame = resources.get(board.recipeId) as FrameNode;
        const regions = b.geometry.regions.filter(
          item => item.applicationId === board.applicationId
        );
        const sourceNodes = geometryNodes(board.geometry.root);
        requireThat(
          frame.type === 'FRAME' &&
            frame.parent?.id === page.id &&
            frame.name === colorSystemAuthoredResourceNameV1(plan.outputName, board.name) &&
            frame.width === board.geometry.width &&
            frame.height === board.geometry.height &&
            frame.children.length === regions.length - 1,
          'Application board geometry or node count differs.'
        );
        verifyClean(frame, boardX, 0);
        boardX += board.geometry.width + 96;
        const modeBindings: Record<string, string> = Object.create(null);
        for (const binding of board.paintBindings) {
          const alias = b.aliases.find(item => item.recipeId === binding.variableRecipeId)!,
            primitive = b.primitives.find(
              item => item.recipeId === alias.aliasesByMode[board.modeId]
            )!;
          for (const collectionId of [alias.collectionRecipeId, primitive.collectionRecipeId])
            modeBindings[resources.get(collectionId)!.id] =
              collectionModes.get(collectionId)![board.modeId];
        }
        requireThat(
          stringify(frame.explicitVariableModes) === stringify(modeBindings),
          'Application explicit collection modes differ.'
        );
        for (let i = 0; i < regions.length; i++) {
          const region = regions[i],
            root = i === 0,
            child = (root ? frame : frame.children[i - 1]) as PaintNode;
          const sourceNode = sourceNodes.get(region.nodeId)!;
          if (!root) {
            requireThat(
              child.type === (sourceNode.shape.kind === 'rect' ? 'RECTANGLE' : 'VECTOR') &&
                child.parent?.id === frame.id &&
                child.width === region.bounds.width &&
                child.height === region.bounds.height &&
                child.name === (sourceNode.textAlternative ?? sourceNode.id),
              'Application paint node geometry differs.'
            );
            verifyClean(child, region.bounds.x, region.bounds.y);
            verifyMetadata(
              child,
              plan,
              `${board.recipeId}/node/${sourceNode.id}`,
              child.type.toLowerCase()
            );
            requireThat(
              Object.keys(child.explicitVariableModes).length === 0,
              'Child paint cannot override the board mode.'
            );
            if (child.type === 'VECTOR')
              requireThat(
                samePath(child.vectorPaths, localPath(region)),
                'Compound EVENODD path differs.'
              );
          }
          const aliasId = board.paintBindings.find(
            item => item.useId === region.useId
          )!.variableRecipeId;
          requireThat(
            child.getPluginData(GEO.applicationId) === board.applicationId &&
              child.getPluginData(GEO.nodeId) === region.nodeId &&
              child.getPluginData(GEO.useId) === region.useId &&
              Array.isArray(child.fills) &&
              child.fills.length === 1 &&
              samePaint(
                child.fills[0],
                paintFor(aliasId, board.modeId),
                resources.get(aliasId)!.id
              ),
            'Application paint binding or geometry identity differs.'
          );
          const aliasVariable = resources.get(aliasId) as Variable;
          const resolved = aliasVariable.resolveForConsumer(child);
          requireThat(
            resolved.resolvedType === 'COLOR' &&
              sameColor(resolved.value, paintFor(aliasId, board.modeId)),
            'Consumer-resolved application color differs from its exact authored mode.'
          );
        }
        nativeNodes += regions.length;
      }
      let docY = Math.max(...b.boards.map(board => board.geometry.height)) + 160;
      for (const spec of docs) {
        const frame = resources.get(spec.recipeId) as FrameNode;
        requireThat(
          frame.type === 'FRAME' &&
            frame.name === spec.name &&
            frame.parent?.id === page.id &&
            frame.width === LIMITS.documentationWidth &&
            frame.children.length === spec.fields.length &&
            Array.isArray(frame.fills) &&
            frame.fills.length === 1 &&
            samePaint(frame.fills[0], { r: 1, g: 1, b: 1, a: 1 }),
          'Documentation frame differs.'
        );
        verifyClean(frame, 0, docY);
        let y = 32;
        for (let i = 0; i < spec.fields.length; i++) {
          const text = frame.children[i] as TextNode;
          requireThat(
            text.type === 'TEXT' &&
              text.name === `${spec.recipeId} field ${i + 1}` &&
              text.parent?.id === frame.id &&
              text.characters === spec.fields[i] &&
              text.fontName !== api.mixed &&
              text.fontName.family === FONT.family &&
              text.fontName.style === FONT.style &&
              text.fontSize === (i === 0 ? 24 : 14) &&
              text.textAutoResize === 'HEIGHT' &&
              text.width === LIMITS.documentationWidth - 64 &&
              text.height > 0 &&
              Number.isFinite(text.height) &&
              Array.isArray(text.fills) &&
              text.fills.length === 1 &&
              samePaint(text.fills[0], { r: 0, g: 0, b: 0, a: 1 }),
            'Documentation text, font or paint differs.'
          );
          verifyClean(text, 32, y);
          verifyMetadata(text, plan, `${spec.recipeId}/text/${i}`, 'text');
          y += text.height + 24;
        }
        requireThat(
          frame.height === y + 8 && frame.height <= LIMITS.maximumDocumentationHeight,
          'Documentation height or bounds differ.'
        );
        docY += frame.height + 96;
        nativeNodes += 1 + spec.fields.length;
      }
      requireThat(
        nativeNodes === page.findAll().length + 1 && nativeNodes <= b.counts.estimatedNodes,
        'Output contains unexpected scene nodes or exceeds its node budget.'
      );
    },
    async removeResource(ref) {
      const recorded = records.get(ref.id);
      if (!recorded || recorded.ref.kind !== ref.kind || recorded.ref.recipeId !== ref.recipeId)
        fail('Cleanup refuses an unowned resource.');
      const live = await resolve(ref);
      if (live) {
        verifyMetadata(live, recorded.plan, ref.recipeId, ref.kind);
        if (ref.kind === 'collection')
          for (const id of (live as VariableCollection).variableIds) {
            const variable = await api.variables.getVariableByIdAsync(id);
            requireThat(
              variable &&
                variable.getPluginData(KEYS.version) ===
                  COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION &&
                variable.getPluginData(KEYS.transactionId) === recorded.plan.transactionId,
              'Cleanup refuses to remove a foreign collection member.'
            );
          }
        removeOwned(live, recorded.plan);
      }
      records.delete(ref.id);
    },
    async commitUndo() {
      api.commitUndo();
    },
  };
}
