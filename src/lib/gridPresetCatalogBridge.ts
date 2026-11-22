import type { GridPreset } from '../types/grid';
import {
  GRID_PRESET_CATALOG_CONTENT_HASH,
  GRID_PRESET_CATALOG_MAX_BYTES,
  GRID_PRESET_CATALOG_VERSION,
  type GetGridPresetCatalogMessage,
  type GridPresetCatalogResultMessage,
} from '../types/gridPresetCatalog';
import { deterministicContentHash } from './colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from './colorSystemInertJsonV1';
import { consumeRequestId, createRequestId } from './requestId';
import { utf8ByteLength } from './utf8';

type Validation<T> = { valid: true; message: T } | { valid: false; error: string };
type RecordValue = Record<string, unknown>;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REQUEST_KEYS = ['type', 'schemaVersion', 'requestId'];
const RESULT_KEYS = [...REQUEST_KEYS, 'success'];

function record(input: unknown): RecordValue | null {
  try {
    const value = snapshotColorSystemInertJsonV1(input, {
      maximumBytes: 2 * GRID_PRESET_CATALOG_MAX_BYTES,
      maximumDepth: 1,
      maximumNodes: 6,
      maximumArrayLength: 1,
      maximumObjectKeys: 5,
    });
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as RecordValue)
      : null;
  } catch {
    return null;
  }
}

function keys(value: RecordValue, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(key => key in value);
}

function envelope(value: RecordValue | null, type: string): value is RecordValue {
  return !!(
    value &&
    value.type === type &&
    value.schemaVersion === GRID_PRESET_CATALOG_VERSION &&
    typeof value.requestId === 'string' &&
    ID.test(value.requestId)
  );
}

export function validateGridPresetCatalogRequest(
  input: unknown
): Validation<GetGridPresetCatalogMessage> {
  const value = record(input);
  return envelope(value, 'get-grid-preset-catalog') && keys(value, REQUEST_KEYS)
    ? { valid: true, message: value as unknown as GetGridPresetCatalogMessage }
    : { valid: false, error: 'Invalid grid catalog request.' };
}

export function validateGridPresetCatalogResult(
  input: unknown
): Validation<GridPresetCatalogResultMessage> {
  const value = record(input);
  if (envelope(value, 'grid-preset-catalog-result')) {
    const valid =
      value.success === false
        ? keys(value, [...RESULT_KEYS, 'error']) &&
          typeof value.error === 'string' &&
          value.error.trim().length > 0 &&
          value.error.length <= 1024
        : value.success === true &&
          keys(value, [...RESULT_KEYS, 'catalogJson']) &&
          typeof value.catalogJson === 'string' &&
          value.catalogJson.length <= GRID_PRESET_CATALOG_MAX_BYTES &&
          utf8ByteLength(value.catalogJson) <= GRID_PRESET_CATALOG_MAX_BYTES &&
          deterministicContentHash(value.catalogJson) === GRID_PRESET_CATALOG_CONTENT_HASH;
    // The program-owned pin admits exactly the reviewed catalog, including all
    // geometry, provenance, construction and order. No sender-provided hash is trusted.
    if (valid) return { valid: true, message: value as unknown as GridPresetCatalogResultMessage };
  }
  return { valid: false, error: 'Grid catalog failed integrity validation.' };
}

/** One iframe session cache; each caller receives a separately parsed, owned catalog. */
export function createGridPresetCatalogLoader() {
  let cached: { host: Window; json: string } | undefined;
  return (signal: AbortSignal): Promise<GridPreset[]> => {
    if (signal.aborted) return Promise.reject(new Error('Grid catalog request cancelled.'));
    const host = window.parent;
    if (cached?.host === host) return Promise.resolve(JSON.parse(cached.json) as GridPreset[]);
    const requestId = createRequestId('grid-catalog');
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (error?: string, json?: string) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        window.removeEventListener('message', receive);
        signal.removeEventListener('abort', cancel);
        consumeRequestId(requestId);
        if (json !== undefined) {
          cached = { host, json };
          resolve(JSON.parse(json) as GridPreset[]);
        } else reject(new Error(error));
      };
      const cancel = () => finish('Grid catalog request cancelled.');
      const receive = (event: MessageEvent) => {
        if (event.source !== host) return;
        try {
          const message = Object.getOwnPropertyDescriptor(event.data, 'pluginMessage')?.value;
          if (
            !message ||
            Object.getOwnPropertyDescriptor(message, 'type')?.value !==
              'grid-preset-catalog-result' ||
            Object.getOwnPropertyDescriptor(message, 'requestId')?.value !== requestId
          )
            return;
          const result = validateGridPresetCatalogResult(message);
          if (!result.valid) finish(result.error);
          else if (!result.message.success) finish(result.message.error);
          else finish(undefined, result.message.catalogJson);
        } catch {
          // An unrelated malformed envelope cannot execute a getter or end this request.
        }
      };
      const timeout = window.setTimeout(() => finish('Grid catalog did not respond.'), 5000);
      window.addEventListener('message', receive);
      signal.addEventListener('abort', cancel, { once: true });
      try {
        const request: GetGridPresetCatalogMessage = {
          type: 'get-grid-preset-catalog',
          schemaVersion: GRID_PRESET_CATALOG_VERSION,
          requestId,
        };
        host.postMessage({ pluginMessage: request }, '*');
      } catch {
        finish('Grid catalog could not be requested.');
      }
    });
  };
}
