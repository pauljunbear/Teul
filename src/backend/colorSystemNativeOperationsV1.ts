import type { ColorSystemRendererHostContextV2 } from './colorSystemResourceRendererV2';
/** Native color operations shared by the legacy and authored delivery contracts. */
async function configured<T extends { remove(): void }, R>(
  resource: T,
  configure: (resource: T) => R | Promise<R>
): Promise<R> {
  try {
    return await configure(resource);
  } catch (error) {
    resource.remove();
    throw error;
  }
}

export function colorSystemNativeSolidPaintV1(rgba: RGBA): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: rgba.r, g: rgba.g, b: rgba.b },
    ...(rgba.a === 1 ? {} : { opacity: rgba.a }),
  };
}

export function createColorSystemNativeCollectionV1<R>(
  api: PluginAPI,
  name: string,
  modes: readonly { id: string; name: string }[],
  complete: (collection: VariableCollection, modeIds: Readonly<Record<string, string>>) => R
): Promise<R> {
  return configured(api.variables.createVariableCollection(name), collection => {
    const modeIds: Record<string, string> = Object.create(null);
    modes.forEach((mode, index) => {
      if (index === 0) {
        collection.renameMode(collection.defaultModeId, mode.name);
        modeIds[mode.id] = collection.defaultModeId;
      } else modeIds[mode.id] = collection.addMode(mode.name);
    });
    return complete(collection, modeIds);
  });
}

export function createColorSystemNativeVariableV1<R>(
  api: PluginAPI,
  collection: VariableCollection,
  request: { name: string; description: string; scopes: readonly VariableScope[] },
  values: () => readonly { modeId: string; value: VariableValue }[],
  complete: (variable: Variable) => R
): Promise<R> {
  return configured(api.variables.createVariable(request.name, collection, 'COLOR'), variable => {
    variable.description = request.description;
    variable.scopes = [...request.scopes];
    values().forEach(entry => variable.setValueForMode(entry.modeId, entry.value));
    return complete(variable);
  });
}

export function createColorSystemNativePaintStyleV1<R>(
  api: PluginAPI,
  request: { name: string; description: string },
  variable: Variable,
  exactColor: RGBA,
  complete: (style: PaintStyle) => R
): Promise<R> {
  return configured(api.createPaintStyle(), style => {
    style.name = request.name;
    style.description = request.description;
    style.paints = [
      api.variables.setBoundVariableForPaint(
        colorSystemNativeSolidPaintV1(exactColor),
        'color',
        variable
      ),
    ];
    return complete(style);
  });
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

export function readColorSystemNativeContextV1(
  api: PluginAPI,
  currentFileIdentityHash: string
): ColorSystemRendererHostContextV2 {
  return {
    documentType: hostDocumentType(api.editorType),
    editable: api.editorType === 'figma' && api.mode === 'default',
    colorProfile: normalizedProfile(api.root),
    currentFileIdentityHash,
    capabilities: {
      colorVariables:
        typeof api.variables?.createVariableCollection === 'function' &&
        typeof api.variables?.createVariable === 'function',
      variableAliases: typeof api.variables?.createVariableAlias === 'function',
      variableBoundPaintStyles:
        typeof api.variables?.setBoundVariableForPaint === 'function' &&
        typeof api.createPaintStyle === 'function',
      components: typeof api.createComponent === 'function',
      frames: typeof api.createFrame === 'function' && typeof api.createPage === 'function',
    },
  };
}
export async function findColorSystemNativeNameCollisionsV1(
  api: PluginAPI,
  names: readonly string[]
): Promise<readonly string[]> {
  await api.loadAllPagesAsync();
  const requested = new Set(names),
    collisions = new Set<string>();
  const legacyNames = new Map([...requested].map(name => [`${name} — Color System`, name]));
  const compare = (actual: string) => {
    if (requested.has(actual)) collisions.add(actual);
    const legacy = legacyNames.get(actual);
    if (legacy !== undefined) collisions.add(legacy);
  };
  (await api.variables.getLocalVariableCollectionsAsync()).forEach(collection =>
    compare(collection.name)
  );
  (await api.getLocalPaintStylesAsync()).forEach(style => compare(style.name));
  for (const page of api.root.children) {
    compare(page.name);
    page.findAll().forEach(node => compare(node.name));
  }
  return [...collisions].sort();
}
