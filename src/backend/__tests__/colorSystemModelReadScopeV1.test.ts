import { describe, expect, it, vi } from 'vitest';
import sourceInput from '../../../fixtures/color-builder/generic-source-v2/style-first.json';
import { buildColorSystemGenericSourceSnapshotV2 } from '../../lib/colorSystemGenericSourceAdapterV2';
import type { SnapshotDocumentProfile } from '../../types/colorSystemAudit';
import type { ColorSystemBuilderV2GenericInventoryRequest } from '../colorSystemBuilderV2Controller';
import type {
  FigmaColorInventoryHost,
  FigmaColorInventoryOptions,
} from '../colorSystemAuditInventory';
import {
  createColorSystemModelReadScopeV1,
  parseColorSystemModelReadScopeV1,
  type ColorSystemModelReadBindingV1,
} from '../colorSystemModelReadScopeV1';

const request = (
  patch: Partial<ColorSystemBuilderV2GenericInventoryRequest> = {}
): ColorSystemBuilderV2GenericInventoryRequest => ({
  usageScope: 'selection',
  confirmWholeFile: false,
  capturedAt: '2026-09-24T12:00:00.000Z',
  isCancelled: () => false,
  onProgress: () => {},
  ...patch,
});

function fixture(fileKey: string | null = 'synthetic-file') {
  const root = { id: 'root', type: 'DOCUMENT', children: [] } as unknown as DocumentNode;
  const nodes = new Map<string, BaseNode>([[root.id, root]]);
  const pageMutation = vi.fn(() => {
    throw new Error('Page mutation');
  });
  const selectionMutation = vi.fn(() => {
    throw new Error('Selection mutation');
  });
  function page(id: string) {
    let selection: readonly SceneNode[] = [];
    const value = {
      id,
      type: 'PAGE',
      name: id,
      parent: root,
      removed: false,
      children: [],
      loadAsync: vi.fn(async () => {}),
      get selection() {
        return selection;
      },
      set selection(_value: readonly SceneNode[]) {
        selectionMutation();
      },
    } as unknown as PageNode;
    nodes.set(id, value);
    return {
      value,
      select: (items: readonly SceneNode[]) => {
        selection = items;
      },
    };
  }
  const first = page('page:first'),
    second = page('page:second');
  Object.assign(root, { children: [first.value, second.value] });
  function scene(id: string, parent: PageNode | SceneNode = first.value) {
    const value = {
      id,
      type: 'FRAME',
      name: id,
      parent,
      removed: false,
      children: [],
    } as unknown as SceneNode;
    nodes.set(id, value);
    (parent as unknown as { children: SceneNode[] }).children.push(value);
    return value;
  }
  const a = scene('node:a'),
    child = scene('node:child', a),
    b = scene('node:b', second.value);
  first.select([a, child]);
  second.select([b]);
  let currentPage = first.value;
  let key = fileKey;
  let profile: SnapshotDocumentProfile = 'srgb';
  const getNodeByIdAsync = vi.fn(async (id: string) => nodes.get(id) ?? null);
  const host: FigmaColorInventoryHost = {
    root,
    get currentPage() {
      return currentPage;
    },
    set currentPage(_value: PageNode) {
      pageMutation();
    },
    variables: {
      getLocalVariablesAsync: vi.fn(async () => []),
      getLocalVariableCollectionsAsync: vi.fn(async () => []),
      getVariableByIdAsync: vi.fn(async () => null),
    },
    getLocalPaintStylesAsync: vi.fn(async () => []),
    getNodeByIdAsync,
    loadAllPagesAsync: vi.fn(async () => {}),
  };
  const inventory = vi.fn(
    async (_host: FigmaColorInventoryHost, options: FigmaColorInventoryOptions) => ({
      status: 'ready' as const,
      snapshot: buildColorSystemGenericSourceSnapshotV2({
        ...sourceInput,
        capturedAt: options.capturedAt!,
      }),
      auditInventory: null,
      message: 'Ready',
    })
  );
  const dependencies = { fileKey: () => key, documentProfile: () => profile, inventory };
  const service = createColorSystemModelReadScopeV1(host, dependencies);
  return {
    root,
    nodes,
    first,
    second,
    a,
    child,
    b,
    scene,
    host,
    inventory,
    service,
    dependencies,
    getNodeByIdAsync,
    pageMutation,
    selectionMutation,
    switchPage: () => {
      currentPage = second.value;
    },
    setKey: (value: string | null) => {
      key = value;
    },
    setProfile: (value: SnapshotDocumentProfile) => {
      profile = value;
    },
  };
}

describe('captured current-file read scope', () => {
  it('rereads original inactive selection and deduplicates ancestors without UI mutations', async () => {
    const f = fixture();
    const initial = await f.service.read(request());
    f.switchPage();
    f.first.select([]);
    const result = await f.service.reread(initial.binding, request());
    const scope = f.inventory.mock.calls[1][1].frozenScope!;
    expect(scope.currentPage).toBe(f.first.value);
    expect(scope.selectedNodeIds).toEqual(['node:a', 'node:child']);
    expect(scope.selectionRoots).toEqual([f.a]);
    expect(result.readScope).toEqual(initial.readScope);
    expect(f.first.value.loadAsync).toHaveBeenCalledOnce();
    expect(f.host.currentPage).toBe(f.second.value);
    expect(f.first.value.selection).toEqual([]);
    expect(f.pageMutation).not.toHaveBeenCalled();
    expect(f.selectionMutation).not.toHaveBeenCalled();
  });

  it('captures before inventory yields and uses new children when rereading the original page', async () => {
    const f = fixture();
    const originalInventory = f.inventory.getMockImplementation()!;
    f.inventory.mockImplementationOnce(async (host, options) => {
      f.switchPage();
      f.first.select([]);
      return originalInventory(host, options);
    });
    const req = request({ usageScope: 'current-page' });
    const initial = await f.service.read(req);
    expect(initial.readScope.currentPageId).toBe('page:first');
    const added = f.scene('node:added');
    await f.service.reread(initial.binding, req);
    expect(f.inventory.mock.calls[1][1].frozenScope!.currentPageRoots).toEqual([f.a, added]);
  });

  it.each(['missing-node', 'removed-node', 'moved-node', 'missing-page', 'lookup-error'])(
    'fails %s without falling back to the current selection',
    async kind => {
      const f = fixture();
      const initial = await f.service.read(request());
      if (kind === 'missing-node') f.nodes.delete(f.child.id);
      if (kind === 'removed-node') Object.assign(f.child, { removed: true });
      if (kind === 'moved-node') Object.assign(f.child, { parent: f.second.value });
      if (kind === 'missing-page') f.nodes.delete(f.first.value.id);
      if (kind === 'lookup-error')
        f.getNodeByIdAsync.mockRejectedValueOnce(new Error('host lookup failed'));
      f.switchPage();
      await expect(f.service.reread(initial.binding, request())).rejects.toThrow();
      expect(f.inventory).toHaveBeenCalledOnce();
      expect(f.pageMutation).not.toHaveBeenCalled();
    }
  );

  it.each(['add', 'remove'])('reports whole-file page-set %sition explicitly', async change => {
    const f = fixture();
    const req = request({ usageScope: 'whole-file', confirmWholeFile: true });
    const initial = await f.service.read(req);
    Object.assign(f.root, {
      children:
        change === 'add'
          ? [...f.root.children, { id: 'page:new', type: 'PAGE', parent: f.root }]
          : [f.first.value],
    });
    await expect(f.service.reread(initial.binding, req)).rejects.toMatchObject({
      code: 'SCOPE_CHANGED',
    });
    expect(f.inventory).toHaveBeenCalledOnce();
  });

  it.each(['file', 'profile'])(
    'checks %s before and after asynchronous inventory',
    async target => {
      const f = fixture();
      const initial = await f.service.read(request());
      const change = () =>
        target === 'file' ? f.setKey('other-file') : f.setProfile('display-p3');
      const originalInventory = f.inventory.getMockImplementation()!;
      f.inventory.mockImplementationOnce(async (host, options) => {
        change();
        return originalInventory(host, options);
      });
      await expect(f.service.reread(initial.binding, request())).rejects.toMatchObject({
        code: target === 'file' ? 'FILE_CHANGED' : 'PROFILE_CHANGED',
      });
      await expect(f.service.reread(initial.binding, request())).rejects.toThrow();
      expect(f.inventory).toHaveBeenCalledTimes(2);
    }
  );

  it('accepts saved scope only after real resolution and rejects copied live capabilities', async () => {
    const f = fixture();
    const initial = await f.service.read(request());
    const saved = structuredClone(initial.readScope);
    f.switchPage();
    const restarted = createColorSystemModelReadScopeV1(f.host, f.dependencies);
    await expect(restarted.reread(initial.binding, request())).rejects.toMatchObject({
      code: 'NEEDS_SOURCE_BINDING',
    });
    await expect(
      f.service.reread({} as ColorSystemModelReadBindingV1, request())
    ).rejects.toMatchObject({ code: 'NEEDS_SOURCE_BINDING' });
    await expect(restarted.read(request(), saved)).resolves.toMatchObject({ readScope: saved });
    expect(f.getNodeByIdAsync).toHaveBeenCalledWith('node:child');
    (initial.readScope.selectedNodeIds as string[]).splice(0, 2, 'node:b');
    await f.service.reread(initial.binding, request());
    expect(
      f.inventory.mock.calls[f.inventory.mock.calls.length - 1][1].frozenScope!.selectedNodeIds
    ).toEqual(['node:a', 'node:child']);
  });

  it('keeps null file keys bound to the live root and requires rebinding after restart', async () => {
    const f = fixture(null);
    const initial = await f.service.read(request());
    await expect(f.service.reread(initial.binding, request())).resolves.toBeDefined();
    const restarted = createColorSystemModelReadScopeV1(f.host, f.dependencies);
    await expect(
      restarted.read(request(), structuredClone(initial.readScope))
    ).rejects.toMatchObject({ code: 'NEEDS_SOURCE_BINDING' });
    Object.defineProperty(f.host, 'root', { value: { ...f.root } });
    await expect(f.service.reread(initial.binding, request())).rejects.toMatchObject({
      code: 'FILE_CHANGED',
    });
  });

  it('cancels during node resolution and after inventory without issuing a result', async () => {
    const f = fixture();
    const initial = await f.service.read(request());
    let cancelled = false;
    const req = request({ isCancelled: () => cancelled });
    f.getNodeByIdAsync.mockImplementationOnce(async () => {
      cancelled = true;
      return f.first.value;
    });
    await expect(f.service.reread(initial.binding, req)).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    expect(f.inventory).toHaveBeenCalledOnce();
    cancelled = false;
    const originalInventory = f.inventory.getMockImplementation()!;
    f.inventory.mockImplementationOnce(async (host, options) => {
      const result = await originalInventory(host, options);
      cancelled = true;
      return result;
    });
    await expect(f.service.reread(initial.binding, req)).rejects.toMatchObject({
      code: 'CANCELLED',
    });
  });

  it('bounds saved intent and rejects accessors, unknown fields and unauthorized whole-file replay', async () => {
    const f = fixture();
    const initial = await f.service.read(request());
    const getter = vi.fn(() => 'synthetic-file');
    const hostile = { ...initial.readScope };
    Object.defineProperty(hostile, 'fileKey', { enumerable: true, get: getter });
    expect(() => parseColorSystemModelReadScopeV1(hostile)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    for (const value of [
      { ...initial.readScope, fresh: true },
      { ...initial.readScope, pageIds: [] },
      { ...initial.readScope, selectedNodeIds: ['node:a', 'node:a'] },
      { ...initial.readScope, fileKey: 'a'.repeat(257) },
      { ...initial.readScope, usageScope: 'whole-file', confirmWholeFile: false },
    ])
      expect(() => parseColorSystemModelReadScopeV1(value)).toThrow();
    await expect(
      f.service.reread(
        initial.binding,
        request({ usageScope: 'whole-file', confirmWholeFile: true })
      )
    ).rejects.toMatchObject({ code: 'INVALID_READ_SCOPE' });
  });
});
