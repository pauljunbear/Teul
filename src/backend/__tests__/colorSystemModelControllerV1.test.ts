import { describe, expect, it, vi } from 'vitest';
import sourceInput from '../../../fixtures/color-builder/generic-source-v2/style-first.json';
import { createColorSystemModelControllerV1 } from '../colorSystemModelControllerV1';
import { buildColorSystemGenericSourceSnapshotV2 } from '../../lib/colorSystemGenericSourceAdapterV2';
import {
  syntheticColorSystemModelV1,
  syntheticColorSystemModelInputV1,
} from '../../lib/__tests__/fixtures/colorSystemModelV1Fixture';
import { buildColorSystemModelV1 } from '../../lib/colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../../lib/colorSystemSrgbValueV1';
import { canonicalJson } from '../../lib/colorSystemHashing';
import { serializeColorSystemInertJsonV1 } from '../../lib/colorSystemInertJsonV1';
import { isColorSystemModelResultV1 } from '../../lib/colorSystemModelBridgeV1';
import type { ColorSystemGenericSourceInventoryV2Result } from '../colorSystemGenericSourceInventoryV2';
import {
  COLOR_SYSTEM_MODEL_READ_SCOPE_V1_VERSION,
  ColorSystemModelReadScopeErrorV1,
  type ColorSystemModelReadBindingV1,
  type ColorSystemModelReadResultV1,
} from '../colorSystemModelReadScopeV1';

const jsonRequest = (
  json = canonicalJson(syntheticColorSystemModelV1()),
  requestId = 'import:1'
) => ({
  type: 'read-color-system-model-v1',
  requestId,
  source: 'guideline-json',
  json,
});
const liveRequest = {
  type: 'read-color-system-model-v1',
  requestId: 'live:1',
  source: 'current-file',
  scope: 'selection',
  confirmWholeFile: false,
};
function setup() {
  const inventory = vi.fn(async (): Promise<ColorSystemGenericSourceInventoryV2Result> => ({
    status: 'ready',
    snapshot: buildColorSystemGenericSourceSnapshotV2(sourceInput),
    auditInventory: null,
    message: 'Ready',
  }));
  const postMessage = vi.fn();
  const controller = createColorSystemModelControllerV1({
    inventory,
    postMessage,
    sourceLocator: () => 'figma-file:synthetic',
  });
  return { controller, inventory, postMessage };
}

describe('read-only source model controller', () => {
  it('keeps native precision and signed zero when returning a detached imported source', async () => {
    const input = syntheticColorSystemModelInputV1();
    const native = buildColorSystemSrgbValueV1({ r: -0, g: 0.1234567890123456, b: 0.35 }, -0);
    const model = buildColorSystemModelV1({
      ...input,
      adoptions: [],
      colors: input.colors.map((color, index) =>
        index === 0 ? { ...color, valuesByMode: { ...color.valuesByMode, Day: native } } : color
      ),
    });
    const json = canonicalJson(model)
      .replace(/"r":0([,}])/g, '"r":-0$1')
      .replace(/"alpha":0([,}])/g, '"alpha":-0$1');
    const { controller } = setup();
    expect((await controller.handle(jsonRequest(json)))?.success).toBe(true);
    const first = controller.getCurrentSource()!;
    const value = first.model.colors.find(color => color.id === input.colors[0].id)!.valuesByMode
      .Day;
    expect(Object.is(value.components.r, -0)).toBe(true);
    expect(Object.is(value.alpha, -0)).toBe(true);
    expect(value.components.g).toBe(0.1234567890123456);
    Object.assign(value.components, { g: 0.5 });
    expect(
      controller.getCurrentSource()!.model.colors.find(color => color.id === input.colors[0].id)!
        .valuesByMode.Day.components.g
    ).toBe(0.1234567890123456);
  });
  it('imports exact models without inventory access and retains the last good model after invalid input', async () => {
    const { controller, inventory, postMessage } = setup();
    const result = await controller.handle(jsonRequest());
    expect(isColorSystemModelResultV1(result)).toBe(true);
    expect(result).toMatchObject({
      success: true,
      modelHash: syntheticColorSystemModelV1().modelHash,
    });
    const before = controller.getCurrentSource();
    expect(before?.intake).toBe('guideline-json');
    expect(await controller.handle(jsonRequest('{"schemaVersion":"future"}'))).toMatchObject({
      success: false,
    });
    expect(controller.getCurrentSource()).toEqual(before);
    expect(inventory).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it('keeps immutable current-file capture claims separate from actual imported-snapshot authority', async () => {
    const { controller, inventory } = setup();
    const live = await controller.handle(liveRequest);
    expect(live?.success).toBe(true);
    if (!live?.success) throw new Error('Expected source model');
    expect(controller.getCurrentSource()?.intake).toBe('current-file');
    const imported = await controller.handle(jsonRequest(live.modelJson));
    expect(imported).toMatchObject({
      success: true,
      modelHash: live.modelHash,
      modelJson: live.modelJson,
    });
    expect(imported?.success && imported.summary).toContain(
      'current-file freshness has not been checked'
    );
    expect(controller.getCurrentSource()?.intake).toBe('guideline-json');
    expect(controller.getCurrentSource()?.model.sources[0].freshnessMode).toBe('current-file');
    expect(inventory).toHaveBeenCalledTimes(1);
    const copy = controller.getCurrentSource()!;
    (copy.model.colors as unknown[]).length = 0;
    expect(controller.getCurrentSource()?.model.colors.length).toBeGreaterThan(0);
  });

  it('does not replace accepted content when a cancelled or superseded inventory finishes late', async () => {
    const { controller, inventory } = setup();
    let finish!: (result: ColorSystemGenericSourceInventoryV2Result) => void;
    inventory.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const reading = controller.handle(liveRequest);
    const imported = await controller.handle(jsonRequest());
    finish({
      status: 'ready',
      snapshot: buildColorSystemGenericSourceSnapshotV2(sourceInput),
      auditInventory: null,
      message: 'Ready',
    });
    expect(await reading).toMatchObject({ success: false, code: 'CANCELLED' });
    expect(controller.getCurrentSource()?.model.modelHash).toBe(
      imported?.success && imported.modelHash
    );
  });

  it('rejects oversized, executable and unauthorized whole-file requests before host reads', async () => {
    const { controller, inventory, postMessage } = setup();
    expect(await controller.handle({ ...liveRequest, scope: 'whole-file' })).toBeNull();
    expect(await controller.handle(jsonRequest('a'.repeat(2 * 1024 * 1024 + 1)))).toBeNull();
    let called = false;
    const hostile = Object.defineProperty({}, 'type', {
      enumerable: true,
      get() {
        called = true;
        return 'read-color-system-model-v1';
      },
    });
    expect(await controller.handle(hostile)).toBeNull();
    expect(called).toBe(false);
    expect(inventory).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('retains the complete original source evidence and attributed decisions through JSON import', async () => {
    const { controller } = setup();
    const result = await controller.handle(jsonRequest());
    expect(result?.success && JSON.parse(result.modelJson)).toEqual(syntheticColorSystemModelV1());
    expect(result?.success && result.summary).toContain('accepted by agent');
  });
});

function freshSetup() {
  const snapshotInput = structuredClone(sourceInput);
  const readScope = {
    version: COLOR_SYSTEM_MODEL_READ_SCOPE_V1_VERSION,
    usageScope: 'current-page' as const,
    currentPageId: 'page-styles',
    selectedNodeIds: [],
    pageIds: ['page-styles'],
    fileKey: 'synthetic',
    documentProfile: 'srgb' as const,
    confirmWholeFile: false,
  };
  const binding = {} as ColorSystemModelReadBindingV1;
  const output = (): ColorSystemModelReadResultV1 => ({
    readScope: structuredClone(readScope),
    binding,
    inventory: {
      status: 'ready',
      snapshot: buildColorSystemGenericSourceSnapshotV2(snapshotInput),
      auditInventory: null,
      message: 'Ready',
    },
  });
  const read = vi.fn(async () => output());
  const reread = vi.fn(async () => output());
  const inventory = vi.fn(async () => output().inventory);
  const now = vi.fn(() => new Date('2026-09-24T12:00:00.000Z'));
  const postMessage = vi.fn();
  const controller = createColorSystemModelControllerV1({
    inventory,
    sourceReader: { read, reread },
    sourceLocator: () => 'figma-file:wrong-post-read-locator',
    postMessage,
    now,
  });
  return {
    controller,
    read,
    reread,
    readScope,
    binding,
    inventory,
    now,
    postMessage,
    output,
    change: (mutate: (input: typeof snapshotInput) => void) => {
      mutate(snapshotInput);
    },
  };
}
const pageRead = { ...liveRequest, scope: 'current-page' };

describe('source model freshness checks', () => {
  it('checks an unchanged source after five minutes without replacing the model or its decisions', async () => {
    const f = freshSetup();
    await f.controller.handle(pageRead);
    const before = f.controller.getCurrentSource()!;
    expect(before.model.sources[0].locator).toBe('figma-file:synthetic');
    f.change(input => {
      input.capturedAt = '2026-09-24T13:00:00.000Z';
    });
    f.now.mockReturnValue(new Date('2026-09-24T13:00:00.000Z'));
    expect(await f.controller.freshCheck()).toMatchObject({
      status: 'same',
      code: 'SOURCE_UNCHANGED',
      sourceModelHash: before.model.modelHash,
    });
    expect(f.controller.getCurrentSource()).toEqual(before);
    expect(f.inventory).not.toHaveBeenCalled();
    expect(f.postMessage).toHaveBeenCalledOnce();
    const exposed = f.controller.getCurrentSource()!;
    (exposed.readScope!.pageIds as string[])[0] = 'forged-page';
    expect(f.controller.getCurrentSource()!.readScope!.pageIds).toEqual(['page-styles']);
  });

  it.each(['native', 'library'])(
    'reports changed %s evidence while preserving accepted source',
    async kind => {
      const f = freshSetup();
      await f.controller.handle(pageRead);
      const before = f.controller.getCurrentSource();
      f.change(input => {
        if (kind === 'native') {
          const style = input.paintStyles[0];
          style.directDeclaration.value.components[0] += 1e-15;
          style.paints[0].solidValue.components[0] += 1e-15;
          style.paints[0].payload.color.r += 1e-15;
        } else input.libraryBoundaryNote = 'Enabled-library inventory changed.';
      });
      expect(await f.controller.freshCheck()).toMatchObject({
        status: 'changed',
        code: 'SOURCE_CHANGED',
      });
      expect(f.controller.getCurrentSource()).toEqual(before);
    }
  );

  it.each([
    'FILE_CHANGED',
    'PROFILE_CHANGED',
    'SCOPE_CHANGED',
    'MISSING_NODE',
    'MOVED_NODE',
  ] as const)('preserves the accepted source on %s', async code => {
    const f = freshSetup();
    await f.controller.handle(pageRead);
    const before = f.controller.getCurrentSource();
    f.reread.mockRejectedValueOnce(new ColorSystemModelReadScopeErrorV1(code, 'Changed'));
    expect(await f.controller.freshCheck()).toMatchObject({ status: 'changed', code });
    expect(f.controller.getCurrentSource()).toEqual(before);
  });

  it('keeps imports unbound until an explicit saved-scope request completes a matching real read', async () => {
    const f = freshSetup();
    const live = await f.controller.handle(pageRead);
    if (!live?.success) throw new Error('Expected live model');
    await f.controller.handle(jsonRequest(live.modelJson));
    expect(await f.controller.freshCheck()).toMatchObject({
      status: 'unsupported',
      code: 'NEEDS_SOURCE_BINDING',
    });
    expect(f.read).toHaveBeenCalledOnce();
    expect(f.controller.getCurrentSource()?.readScope).toBeUndefined();
    expect(await f.controller.freshCheck({ readScope: f.readScope })).toMatchObject({
      status: 'same',
    });
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.controller.getCurrentSource()?.intake).toBe('guideline-json');
    expect(f.controller.getCurrentSource()?.model.modelHash).toBe(live.modelHash);
    expect(await f.controller.freshCheck()).toMatchObject({ status: 'same' });
  });

  it.each(['native', 'precision', 'authority', 'evidence', 'membership', 'mode'] as const)(
    'does not bind an imported %s change carrying unchanged source receipt hashes',
    async kind => {
      const f = freshSetup();
      await f.controller.handle(pageRead);
      const original = f.controller.getCurrentSource()!.model;
      const { modelHash: _modelHash, ...content } = original;
      const first = content.colors[0];
      const mode = Object.keys(first.valuesByMode)[0];
      const native = first.valuesByMode[mode];
      const altered = buildColorSystemModelV1({
        ...content,
        ...(kind === 'native' || kind === 'precision'
          ? {
              colors: content.colors.map((color, index) =>
                index
                  ? color
                  : {
                      ...color,
                      valuesByMode: {
                        ...color.valuesByMode,
                        [mode]: buildColorSystemSrgbValueV1({
                          r: native.components.r + (kind === 'native' ? 0.1 : 1e-15),
                          g: native.components.g,
                          b: native.components.b,
                        }),
                      },
                    }
              ),
            }
          : kind === 'authority'
            ? { sources: content.sources.map(source => ({ ...source, status: 'approved' })) }
            : kind === 'evidence'
              ? {
                  evidence: content.evidence.map((entry, index) =>
                    index ? entry : { ...entry, description: 'Altered source evidence.' }
                  ),
                }
              : kind === 'membership'
                ? {
                    families: [
                      ...content.families,
                      {
                        id: 'invented:family',
                        label: 'Invented source family',
                        colorIds: [first.id],
                        evidenceRefs: first.evidenceRefs,
                        claimIds: first.claimIds,
                      },
                    ],
                  }
                : { modes: content.modes.map(entry => ({ ...entry, label: 'Altered mode' })) }),
      });
      expect(altered.sources[0].sourceHash).toBe(original.sources[0].sourceHash);
      expect(altered.sources[0].currentFileContentHash).toBe(
        original.sources[0].currentFileContentHash
      );
      expect(
        (await f.controller.handle(jsonRequest(serializeColorSystemInertJsonV1(altered))))?.success
      ).toBe(true);
      const before = f.controller.getCurrentSource();
      expect(await f.controller.freshCheck({ readScope: f.readScope })).toMatchObject({
        status: 'changed',
        code: 'SOURCE_CHANGED',
      });
      expect(f.controller.getCurrentSource()).toEqual(before);
      expect(f.controller.getCurrentSource()?.readScope).toBeUndefined();
      expect(await f.controller.freshCheck()).toMatchObject({
        status: 'unsupported',
        code: 'NEEDS_SOURCE_BINDING',
      });
    }
  );

  it('compares signed zero exactly even when source and model hashes are identical', async () => {
    const f = freshSetup();
    f.change(input => {
      const style = input.paintStyles[0];
      style.directDeclaration.value.components[0] = 0;
      style.paints[0].solidValue.components[0] = 0;
      style.paints[0].payload.color.r = 0;
    });
    const live = await f.controller.handle(pageRead);
    if (!live?.success) throw new Error('Expected live source');
    const original = f.controller.getCurrentSource()!.model;
    const mode = Object.keys(original.colors[0].valuesByMode)[0];
    await f.controller.handle(jsonRequest(live.modelJson));
    expect(await f.controller.freshCheck({ readScope: f.readScope })).toMatchObject({
      status: 'same',
    });
    const { modelHash: _modelHash, ...content } = original;
    const altered = buildColorSystemModelV1({
      ...content,
      colors: content.colors.map((color, index) =>
        index
          ? color
          : {
              ...color,
              valuesByMode: {
                ...color.valuesByMode,
                [mode]: buildColorSystemSrgbValueV1({ r: -0, g: 0.5, b: 0.75 }),
              },
            }
      ),
    });
    // Legacy canonical hashing erases -0; the exact native comparison must retain it.
    const imported = await f.controller.handle(
      jsonRequest(serializeColorSystemInertJsonV1(altered))
    );
    if (!imported?.success) throw new Error('Expected imported model');
    expect(
      Object.is(JSON.parse(imported.modelJson).colors[0].valuesByMode[mode].components.r, -0)
    ).toBe(true);
    expect(f.controller.getCurrentSource()!.model.modelHash).toBe(original.modelHash);
    expect(
      Object.is(
        f.controller.getCurrentSource()!.model.colors[0].valuesByMode[mode].components.r,
        -0
      )
    ).toBe(true);
    expect(await f.controller.freshCheck({ readScope: f.readScope })).toMatchObject({
      status: 'changed',
      code: 'SOURCE_CHANGED',
    });
    expect(f.controller.getCurrentSource()?.readScope).toBeUndefined();
  });

  it('does not replace source or attach a late binding when a fresh check is cancelled or superseded', async () => {
    const f = freshSetup();
    await f.controller.handle(pageRead);
    let finish!: (value: ColorSystemModelReadResultV1) => void;
    f.reread.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const checking = f.controller.freshCheck({ requestId: 'fresh:1' });
    await f.controller.handle(jsonRequest());
    const before = f.controller.getCurrentSource();
    finish(f.output());
    expect(await checking).toMatchObject({ status: 'unsupported', code: 'CANCELLED' });
    expect(f.controller.getCurrentSource()).toEqual(before);
    await f.controller.handle(pageRead);
    f.reread.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const cancelled = f.controller.freshCheck({ requestId: 'fresh:2' });
    await f.controller.handle({
      type: 'cancel-color-system-model-v1',
      requestId: 'cancel:1',
      targetRequestId: 'fresh:2',
    });
    finish(f.output());
    expect(await cancelled).toMatchObject({ status: 'unsupported', code: 'CANCELLED' });
  });

  it('reports unavailable evidence and failed host reads without overwriting accepted source', async () => {
    const f = freshSetup();
    await f.controller.handle(pageRead);
    const before = f.controller.getCurrentSource();
    f.reread.mockResolvedValueOnce({
      ...f.output(),
      inventory: {
        status: 'partial',
        snapshot: null,
        auditInventory: null,
        message: 'Incomplete read',
      },
    });
    expect(await f.controller.freshCheck()).toMatchObject({
      status: 'unsupported',
      code: 'SOURCE_READ_UNSUPPORTED',
    });
    f.reread.mockRejectedValueOnce(new Error('Host unavailable'));
    expect(await f.controller.freshCheck()).toMatchObject({
      status: 'unsupported',
      code: 'SOURCE_READ_FAILED',
    });
    expect(f.controller.getCurrentSource()).toEqual(before);
  });
});
