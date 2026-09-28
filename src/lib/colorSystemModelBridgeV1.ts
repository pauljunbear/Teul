import type {
  ColorSystemModelRequestV1,
  ColorSystemModelResultV1,
} from '../types/colorSystemModelMessagesV1';
import { utf8ByteLength } from './utf8';

export const COLOR_SYSTEM_MODEL_MAX_JSON_BYTES_V1 = 2 * 1024 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
type RecordValue = Record<string, unknown>;

/** Transport fields are scalars. Inspect descriptors before any field can execute. */
function inertRecord(value: unknown): value is RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  return Reflect.ownKeys(value).every(key => {
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key))
      return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    return (
      descriptor.enumerable &&
      'value' in descriptor &&
      ['string', 'boolean'].includes(typeof descriptor.value)
    );
  });
}
function keys(value: RecordValue, expected: readonly string[]): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every(key => Object.prototype.hasOwnProperty.call(value, key))
  );
}
function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}
function json(value: unknown): value is string {
  return (
    text(value, COLOR_SYSTEM_MODEL_MAX_JSON_BYTES_V1) &&
    utf8ByteLength(value) <= COLOR_SYSTEM_MODEL_MAX_JSON_BYTES_V1
  );
}

export function isColorSystemModelRequestV1(value: unknown): value is ColorSystemModelRequestV1 {
  if (!inertRecord(value) || typeof value.requestId !== 'string' || !ID.test(value.requestId))
    return false;
  if (value.type === 'cancel-color-system-model-v1') {
    return (
      keys(value, ['type', 'requestId', 'targetRequestId']) &&
      typeof value.targetRequestId === 'string' &&
      ID.test(value.targetRequestId)
    );
  }
  if (value.type !== 'read-color-system-model-v1') return false;
  if (value.source === 'guideline-json') {
    return keys(value, ['type', 'requestId', 'source', 'json']) && json(value.json);
  }
  return (
    keys(value, ['type', 'requestId', 'source', 'scope', 'confirmWholeFile']) &&
    value.source === 'current-file' &&
    ['selection', 'current-page', 'whole-file'].includes(String(value.scope)) &&
    typeof value.confirmWholeFile === 'boolean' &&
    (value.scope !== 'whole-file' || value.confirmWholeFile === true)
  );
}

export function isColorSystemModelResultV1(value: unknown): value is ColorSystemModelResultV1 {
  if (
    !inertRecord(value) ||
    value.type !== 'color-system-model-result-v1' ||
    typeof value.requestId !== 'string' ||
    !ID.test(value.requestId)
  )
    return false;
  if (value.success === false) {
    return (
      keys(value, ['type', 'requestId', 'success', 'code', 'error']) &&
      text(value.code, 128) &&
      text(value.error, 4096)
    );
  }
  return (
    value.success === true &&
    keys(value, ['type', 'requestId', 'success', 'modelHash', 'modelJson', 'summary']) &&
    typeof value.modelHash === 'string' &&
    /^sha256:[0-9a-f]{64}$/.test(value.modelHash) &&
    json(value.modelJson) &&
    text(value.summary, 65536)
  );
}
