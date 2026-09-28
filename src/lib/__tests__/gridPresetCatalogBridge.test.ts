import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGridPresetCatalog } from '../../backend/gridPresetCatalog';
import {
  GRID_PRESET_CATALOG_CONTENT_HASH,
  GRID_PRESET_CATALOG_COUNT,
  GRID_PRESET_CATALOG_MAX_BYTES,
  GRID_PRESET_CATALOG_VERSION,
  type GetGridPresetCatalogMessage,
} from '../../types/gridPresetCatalog';
import { GRID_PRESETS } from '../gridPresets';
import { GRID_CATEGORIES } from '../gridPresetCatalogMetadata';
import {
  createGridPresetCatalogLoader,
  validateGridPresetCatalogRequest,
  validateGridPresetCatalogResult,
} from '../gridPresetCatalogBridge';
import { validatePluginToUIMessage, validateUIToPluginMessage } from '../messageValidation';
import { consumeRequestId } from '../requestId';

const request: GetGridPresetCatalogMessage = {
  type: 'get-grid-preset-catalog',
  schemaVersion: GRID_PRESET_CATALOG_VERSION,
  requestId: 'catalog-test',
};
const response = () => getGridPresetCatalog(request);

describe('local grid preset catalog integrity', () => {
  it('pins all 65 existing entries, order, geometry and provenance without data conversion', () => {
    const result = response();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    const expected = JSON.stringify(GRID_PRESETS);
    expect(result.catalogJson).toBe(expected);
    expect(createHash('sha256').update(expected).digest('hex')).toBe(
      '1e050c51064bb0915360af146888a7b949934bdf6e8b22a9e9e56d61b39d94a1'
    );
    expect(`sha256:${createHash('sha256').update(JSON.stringify(expected)).digest('hex')}`).toBe(
      GRID_PRESET_CATALOG_CONTENT_HASH
    );
    expect(JSON.parse(result.catalogJson)).toStrictEqual(GRID_PRESETS);
    expect(GRID_PRESETS).toHaveLength(GRID_PRESET_CATALOG_COUNT);
    expect(new Set(GRID_PRESETS.map(preset => preset.id)).size).toBe(65);
    expect(GRID_PRESETS.every(preset => preset.provenance && preset.referenceDimensions)).toBe(
      true
    );
    expect(GRID_PRESETS.filter(preset => preset.provenance?.sourceUrl)).toHaveLength(31);
    expect(GRID_CATEGORIES.map(category => category.id)).toEqual([
      'all',
      'classic-swiss',
      'editorial',
      'poster',
      'web-ui',
      'modular',
      'baseline',
      'combined',
    ]);
    expect(validatePluginToUIMessage(result).valid).toBe(true);
    expect(validateUIToPluginMessage(request).valid).toBe(true);
  });

  it('accepts exact envelopes only and detaches the validated request', () => {
    const input = { ...request };
    const parsed = validateGridPresetCatalogRequest(input);
    expect(parsed.valid).toBe(true);
    input.requestId = 'mutated';
    if (!parsed.valid) throw new Error(parsed.error);
    expect(parsed.message.requestId).toBe('catalog-test');
    for (const invalid of [
      { ...request, schemaVersion: 'future' },
      { ...request, requestId: '' },
      { ...request, requestId: 'x'.repeat(129) },
      { ...request, requestId: 'a b' },
      { ...request, write: true },
      [],
      null,
    ]) {
      expect(validateGridPresetCatalogRequest(invalid).valid).toBe(false);
      expect(validateUIToPluginMessage(invalid).valid).toBe(false);
    }
  });

  it('rejects every catalog drift, including labels, numeric values, provenance and ordering', () => {
    const result = response();
    if (!result.success) throw new Error(result.error);
    const modified = JSON.parse(result.catalogJson) as typeof GRID_PRESETS;
    modified[0].config.columns!.margin += Number.EPSILON * 4;
    for (const catalogJson of [
      JSON.stringify(modified),
      result.catalogJson.replace('4-Column Swiss-Inspired', 'Changed name'),
      result.catalogJson.replace('not an artifact-level historical reconstruction', 'exact'),
      JSON.stringify([...GRID_PRESETS].reverse()),
      JSON.stringify(GRID_PRESETS.slice(1)),
      result.catalogJson.replace('"isCustom":false', '"isCustom":true'),
      `${result.catalogJson} `,
      '{}',
      'é'.repeat(GRID_PRESET_CATALOG_MAX_BYTES),
    ]) {
      expect(catalogJson).not.toBe(result.catalogJson);
      expect(validateGridPresetCatalogResult({ ...result, catalogJson }).valid).toBe(false);
    }
    for (const invalid of [
      { ...result, schemaVersion: 'future' },
      { ...result, extra: true },
      { ...result, success: 'true' },
      { ...result, catalogJson: undefined },
      { ...result, error: 'unexpected' },
    ])
      expect(validatePluginToUIMessage(invalid).valid).toBe(false);
  });

  it('never invokes getters and rejects hidden, symbolic, inherited or nested transport fields', () => {
    const getter = vi.fn(() => request.requestId);
    for (const field of ['type', 'requestId']) {
      const input = { ...request };
      Object.defineProperty(input, field, { enumerable: true, get: getter });
      expect(validateGridPresetCatalogRequest(input).valid).toBe(false);
      expect(validateUIToPluginMessage(input).valid).toBe(false);
    }
    const hidden = Object.defineProperty({ ...request }, 'secret', { value: 'hidden' });
    const symbol = { ...request, [Symbol('extra')]: true };
    const inherited = Object.assign(Object.create({ inherited: true }), request);
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    for (const value of [hidden, symbol, inherited, revoked.proxy, { ...request, requestId: {} }])
      expect(validateGridPresetCatalogRequest(value).valid).toBe(false);
    const result = response();
    Object.defineProperty(result, 'catalogJson', { enumerable: true, get: getter });
    expect(validateGridPresetCatalogResult(result).valid).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it('keeps failure results bounded and separate from successful data', () => {
    const failure = {
      ...request,
      type: 'grid-preset-catalog-result',
      success: false,
      error: 'Failed.',
    };
    expect(validateGridPresetCatalogResult(failure).valid).toBe(true);
    for (const error of ['', ' ', 'x'.repeat(1025), {}])
      expect(validateGridPresetCatalogResult({ ...failure, error }).valid).toBe(false);
    expect(validateGridPresetCatalogResult({ ...failure, catalogJson: '[]' }).valid).toBe(false);
  });
});

describe('grid catalog request lifecycle', () => {
  let post: ReturnType<typeof vi.spyOn>;
  let load: ReturnType<typeof createGridPresetCatalogLoader>;
  beforeEach(() => {
    vi.useFakeTimers();
    post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    load = createGridPresetCatalogLoader();
  });
  afterEach(() => {
    post.mockRestore();
    vi.useRealTimers();
  });
  const latest = () => post.mock.calls.at(-1)![0].pluginMessage as GetGridPresetCatalogMessage;
  const deliver = (message: unknown, source: Window | null = window.parent) =>
    window.dispatchEvent(new MessageEvent('message', { source, data: { pluginMessage: message } }));

  it('requires both the parent source and current request, then caches owned data', async () => {
    const controller = new AbortController();
    const promise = load(controller.signal);
    const current = latest();
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    deliver(getGridPresetCatalog(current), null);
    deliver(getGridPresetCatalog({ ...current, requestId: 'old-request' }));
    await Promise.resolve();
    expect(settled).toBe(false);
    deliver(getGridPresetCatalog(current));
    const catalog = await promise;
    expect(catalog).toStrictEqual(GRID_PRESETS);
    catalog[0].name = 'Mutated';
    catalog[0].config.columns!.margin = 999;
    const again = await load(new AbortController().signal);
    expect(again).toStrictEqual(GRID_PRESETS);
    expect(again[0]).not.toBe(catalog[0]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(consumeRequestId(current.requestId)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails closed on a corrupt matching result, then retries with a different request', async () => {
    const promise = load(new AbortController().signal);
    const previous = latest();
    const failed = expect(promise).rejects.toThrow(/integrity/);
    deliver({ ...getGridPresetCatalog(previous), catalogJson: '[]' });
    await failed;
    const retry = load(new AbortController().signal);
    const current = latest();
    expect(current.requestId).not.toBe(previous.requestId);
    deliver(getGridPresetCatalog(previous));
    deliver(getGridPresetCatalog(current));
    expect(await retry).toHaveLength(65);
  });

  it('times out, ignores the old response and allows a fresh request', async () => {
    const pending = load(new AbortController().signal);
    const old = latest();
    const failed = expect(pending).rejects.toThrow(/did not respond/);
    vi.advanceTimersByTime(5000);
    await failed;
    deliver(getGridPresetCatalog(old));
    const retry = load(new AbortController().signal);
    expect(post).toHaveBeenCalledTimes(2);
    deliver(getGridPresetCatalog(latest()));
    expect(await retry).toHaveLength(65);
  });

  it('cleans up cancellation without admitting a late reply or caching partial data', async () => {
    const controller = new AbortController();
    const pending = load(controller.signal);
    const previous = latest();
    const failed = expect(pending).rejects.toThrow(/cancelled/);
    controller.abort();
    await failed;
    expect(vi.getTimerCount()).toBe(0);
    expect(consumeRequestId(previous.requestId)).toBe(false);
    deliver(getGridPresetCatalog(previous));
    await expect(load(controller.signal)).rejects.toThrow(/cancelled/);
    const retry = load(new AbortController().signal);
    expect(post).toHaveBeenCalledTimes(2);
    deliver(getGridPresetCatalog(latest()));
    expect(await retry).toHaveLength(65);
  });

  it('rejects postMessage failure and backend failure without caching either', async () => {
    post.mockImplementationOnce(() => {
      throw new Error('host');
    });
    await expect(load(new AbortController().signal)).rejects.toThrow(/could not be requested/);
    expect(vi.getTimerCount()).toBe(0);
    const pending = load(new AbortController().signal);
    const failed = expect(pending).rejects.toThrow('Backend unavailable.');
    deliver({
      type: 'grid-preset-catalog-result',
      schemaVersion: GRID_PRESET_CATALOG_VERSION,
      requestId: latest().requestId,
      success: false,
      error: 'Backend unavailable.',
    });
    await failed;
    expect(vi.getTimerCount()).toBe(0);
  });
});
