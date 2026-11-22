/** Read intent is serializable. A live file binding exists only in this backend service. */
import { snapshotColorSystemInertJsonV1 } from '../lib/colorSystemInertJsonV1';
import { compareText } from '../lib/utils';
import type { SnapshotDocumentProfile, SnapshotUsageScope } from '../types/colorSystemAudit';
import type { ColorSystemBuilderV2GenericInventoryRequest } from './colorSystemBuilderV2Controller';
import {
  captureFigmaColorInventoryScope,
  selectFigmaColorInventoryRoots,
  type FigmaColorInventoryFrozenScope,
  type FigmaColorInventoryHost,
} from './colorSystemAuditInventory';
import {
  inventoryColorSystemGenericSourceV2,
  type ColorSystemGenericSourceInventoryV2Result,
} from './colorSystemGenericSourceInventoryV2';

export const COLOR_SYSTEM_MODEL_READ_SCOPE_V1_VERSION = 'teul.model-read-scope.v1' as const;
export interface ColorSystemModelReadScopeV1 {
  readonly version: typeof COLOR_SYSTEM_MODEL_READ_SCOPE_V1_VERSION;
  readonly usageScope: Exclude<SnapshotUsageScope, 'not-applicable'>;
  readonly currentPageId: string;
  readonly selectedNodeIds: readonly string[];
  readonly pageIds: readonly string[];
  readonly fileKey: string | null;
  readonly documentProfile: SnapshotDocumentProfile;
  readonly confirmWholeFile: boolean;
}

declare const liveBinding: unique symbol;
export interface ColorSystemModelReadBindingV1 {
  readonly [liveBinding]: true;
}
export interface ColorSystemModelReadResultV1 {
  readonly inventory: ColorSystemGenericSourceInventoryV2Result;
  readonly readScope: ColorSystemModelReadScopeV1;
  readonly binding: ColorSystemModelReadBindingV1;
}
export interface ColorSystemModelSourceReaderV1 {
  /** A saved descriptor requests an actual host read; it is never proof of a prior read. */
  read(
    request: ColorSystemBuilderV2GenericInventoryRequest,
    savedScope?: unknown
  ): Promise<ColorSystemModelReadResultV1>;
  reread(
    binding: ColorSystemModelReadBindingV1,
    request: ColorSystemBuilderV2GenericInventoryRequest
  ): Promise<ColorSystemModelReadResultV1>;
}
export type ColorSystemModelReadScopeErrorCodeV1 =
  | 'INVALID_READ_SCOPE'
  | 'NEEDS_SOURCE_BINDING'
  | 'FILE_CHANGED'
  | 'PROFILE_CHANGED'
  | 'SCOPE_CHANGED'
  | 'MISSING_NODE'
  | 'MOVED_NODE'
  | 'CANCELLED';
export class ColorSystemModelReadScopeErrorV1 extends Error {
  constructor(
    readonly code: ColorSystemModelReadScopeErrorCodeV1,
    message: string
  ) {
    super(message);
    this.name = 'ColorSystemModelReadScopeErrorV1';
  }
}
function fail(code: ColorSystemModelReadScopeErrorCodeV1, message: string): never {
  throw new ColorSystemModelReadScopeErrorV1(code, message);
}

/** Bounds and detachment apply equally to saved intent and fresh backend descriptors. */
export function parseColorSystemModelReadScopeV1(input: unknown): ColorSystemModelReadScopeV1 {
  const value = snapshotColorSystemInertJsonV1(input, {
    maximumArrayLength: 100_000,
    maximumObjectKeys: 8,
  }) as Record<string, unknown>;
  const keys = [
    'version',
    'usageScope',
    'currentPageId',
    'selectedNodeIds',
    'pageIds',
    'fileKey',
    'documentProfile',
    'confirmWholeFile',
  ];
  const text = (item: unknown): item is string =>
    typeof item === 'string' && item.length > 0 && item.length <= 256 && item.trim() === item;
  const ids = (item: unknown): item is string[] =>
    Array.isArray(item) && item.every(text) && new Set(item).size === item.length;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some(key => !(key in value)) ||
    value.version !== COLOR_SYSTEM_MODEL_READ_SCOPE_V1_VERSION ||
    !['selection', 'current-page', 'whole-file'].includes(value.usageScope as string) ||
    !text(value.currentPageId) ||
    !ids(value.selectedNodeIds) ||
    !ids(value.pageIds) ||
    value.pageIds.length === 0 ||
    !value.pageIds.includes(value.currentPageId) ||
    (value.usageScope !== 'selection' && value.selectedNodeIds.length !== 0) ||
    !(value.fileKey === null || text(value.fileKey)) ||
    !['srgb', 'display-p3', 'legacy', 'unknown'].includes(value.documentProfile as string) ||
    typeof value.confirmWholeFile !== 'boolean' ||
    (value.usageScope === 'whole-file' && value.confirmWholeFile !== true)
  )
    fail('INVALID_READ_SCOPE', 'Invalid captured source read scope.');
  return {
    ...value,
    selectedNodeIds: [...value.selectedNodeIds].sort(compareText),
    pageIds: [...value.pageIds].sort(compareText),
  } as unknown as ColorSystemModelReadScopeV1;
}

function sameIds(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

/** This host exposes reads only; no page/selection/viewport setters or mutation APIs are used. */
export function createColorSystemModelReadScopeV1(
  host: FigmaColorInventoryHost,
  dependencies: {
    fileKey(): string | null;
    documentProfile(): SnapshotDocumentProfile;
    inventory?: typeof inventoryColorSystemGenericSourceV2;
  }
): ColorSystemModelSourceReaderV1 {
  const bindings = new WeakMap<
    ColorSystemModelReadBindingV1,
    {
      scope: ColorSystemModelReadScopeV1;
      root: DocumentNode;
    }
  >();
  const inventory = dependencies.inventory ?? inventoryColorSystemGenericSourceV2;
  const pages = () => host.root.children.filter((node): node is PageNode => node.type === 'PAGE');
  const cancelled = (request: ColorSystemBuilderV2GenericInventoryRequest) => {
    if (request.isCancelled()) fail('CANCELLED', 'Source read cancelled.');
  };
  const assertIdentity = (scope: ColorSystemModelReadScopeV1, root: DocumentNode) => {
    if (host.root !== root || dependencies.fileKey() !== scope.fileKey)
      fail('FILE_CHANGED', 'The current file is not the captured source file.');
    if (dependencies.documentProfile() !== scope.documentProfile)
      fail('PROFILE_CHANGED', 'The source document color profile changed.');
    if (
      !sameIds(
        pages()
          .map(page => page.id)
          .sort(compareText),
        scope.pageIds
      )
    )
      fail('SCOPE_CHANGED', 'The captured source page set changed.');
  };
  const assertPage = (page: PageNode, scope: ColorSystemModelReadScopeV1, root: DocumentNode) => {
    if (page.removed || page.id !== scope.currentPageId || page.parent !== root)
      fail('MISSING_NODE', 'The captured source page is missing or moved.');
  };
  const assertSelected = (node: SceneNode, page: PageNode) => {
    if (node.removed) fail('MISSING_NODE', 'A captured selected node was removed.');
    let parent = node.parent;
    const seen = new Set<BaseNode>();
    while (parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT') {
      if (parent.removed || seen.has(parent))
        fail('MOVED_NODE', 'A captured selected node has an invalid ancestry.');
      seen.add(parent);
      parent = parent.parent;
    }
    if (parent !== page) fail('MOVED_NODE', 'A captured selected node moved outside its page.');
  };
  async function execute(
    request: ColorSystemBuilderV2GenericInventoryRequest,
    replay?: { scope: ColorSystemModelReadScopeV1; root: DocumentNode }
  ): Promise<ColorSystemModelReadResultV1> {
    cancelled(request);
    const root = replay?.root ?? host.root;
    let scope: ColorSystemModelReadScopeV1;
    let frozenScope: FigmaColorInventoryFrozenScope;
    let selected: readonly SceneNode[];
    if (replay) {
      scope = replay.scope;
      if (
        request.usageScope !== scope.usageScope ||
        request.confirmWholeFile !== scope.confirmWholeFile
      )
        fail('INVALID_READ_SCOPE', 'Replay must retain its captured read permission and scope.');
      assertIdentity(scope, root);
      const page = await host.getNodeByIdAsync(scope.currentPageId);
      cancelled(request);
      if (!page || page.type !== 'PAGE')
        fail('MISSING_NODE', 'The captured source page is missing.');
      assertPage(page, scope, root);
      // Loading an inactive page is a read, and must never require making it current.
      if (typeof page.loadAsync === 'function') await page.loadAsync();
      cancelled(request);
      const resolved: SceneNode[] = [];
      for (const id of scope.selectedNodeIds) {
        const node = await host.getNodeByIdAsync(id);
        cancelled(request);
        if (!node || node.type === 'PAGE' || node.type === 'DOCUMENT')
          fail('MISSING_NODE', 'A captured selected node is missing.');
        assertSelected(node, page);
        resolved.push(node);
      }
      selected = resolved;
      frozenScope = Object.freeze({
        usageScope: scope.usageScope,
        currentPage: page,
        currentPageId: page.id,
        currentPageName: page.name,
        selectedNodeIds: Object.freeze([...scope.selectedNodeIds]),
        selectionRoots: Object.freeze(selectFigmaColorInventoryRoots(selected)),
        currentPageRoots: Object.freeze([...page.children]),
        pages: Object.freeze(pages()),
        pageIds: Object.freeze([...scope.pageIds]),
      });
    } else {
      frozenScope = captureFigmaColorInventoryScope(host, request.usageScope);
      selected = request.usageScope === 'selection' ? [...frozenScope.currentPage.selection] : [];
      scope = parseColorSystemModelReadScopeV1({
        version: COLOR_SYSTEM_MODEL_READ_SCOPE_V1_VERSION,
        usageScope: request.usageScope,
        currentPageId: frozenScope.currentPageId,
        selectedNodeIds: frozenScope.selectedNodeIds,
        pageIds: frozenScope.pageIds,
        fileKey: dependencies.fileKey(),
        documentProfile: dependencies.documentProfile(),
        confirmWholeFile: request.confirmWholeFile,
      });
    }
    const assertLive = () => {
      assertIdentity(scope, root);
      assertPage(frozenScope.currentPage, scope, root);
      selected.forEach(node => assertSelected(node, frozenScope.currentPage));
    };
    assertLive();
    const result = await inventory(host, {
      usageScope: scope.usageScope,
      documentProfile: scope.documentProfile,
      sourceLocator: scope.fileKey ? `figma-file:${scope.fileKey}` : 'figma-file:open-document',
      authorization: {
        status: 'user-authorized',
        receiptLocator: `teul-model-read:${request.capturedAt}`,
      },
      includeEnabledLibraryDescriptors: true,
      confirmWholeFile: scope.confirmWholeFile,
      capturedAt: request.capturedAt,
      onProgress: request.onProgress,
      isCancelled: request.isCancelled,
      frozenScope,
    });
    cancelled(request);
    assertLive();
    const binding = Object.freeze({}) as ColorSystemModelReadBindingV1;
    bindings.set(binding, { scope, root });
    return { inventory: result, readScope: parseColorSystemModelReadScopeV1(scope), binding };
  }
  return {
    async read(request, savedScope) {
      if (savedScope === undefined) return execute(request);
      const scope = parseColorSystemModelReadScopeV1(savedScope);
      if (scope.fileKey === null)
        fail('NEEDS_SOURCE_BINDING', 'Saved scope without a file key requires a new source read.');
      return execute(request, { scope, root: host.root });
    },
    async reread(binding, request) {
      const captured = bindings.get(binding);
      if (!captured)
        fail('NEEDS_SOURCE_BINDING', 'Source binding belongs to no live read in this service.');
      return execute(request, captured);
    },
  };
}
