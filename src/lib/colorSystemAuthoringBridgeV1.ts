import {
  COLOR_SYSTEM_AUTHORING_ACTIONS_V1,
  type ColorSystemAuthoringRequestV1,
  type ColorSystemAuthoringResultV1,
} from '../types/colorSystemAuthoringMessagesV1';
import { utf8ByteLength } from './utf8';

export const COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1 = 8 * 1024 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
type RecordValue = Record<string, string | boolean>;

/** Scalar descriptor values only: a transport check must never invoke a field getter. */
function scalars(input: unknown): RecordValue | null {
  try {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    )
      return null;
    const keys = Reflect.ownKeys(input);
    if (keys.length > 6) return null;
    const result: RecordValue = Object.create(null);
    for (const key of keys) {
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key))
        return null;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (
        !descriptor?.enumerable ||
        !('value' in descriptor) ||
        !['string', 'boolean'].includes(typeof descriptor.value)
      )
        return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
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
function json(value: unknown): boolean {
  return (
    text(value, COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1) &&
    utf8ByteLength(value) <= COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1
  );
}

export function isColorSystemAuthoringRequestV1(
  input: unknown
): input is ColorSystemAuthoringRequestV1 {
  const value = scalars(input);
  if (!value || typeof value.requestId !== 'string' || !ID.test(value.requestId)) return false;
  if (value.type === 'cancel-color-system-authoring-v1')
    return (
      keys(value, ['type', 'requestId', 'targetRequestId']) &&
      typeof value.targetRequestId === 'string' &&
      ID.test(value.targetRequestId)
    );
  return (
    value.type === 'color-system-authoring-v1' &&
    keys(value, ['type', 'requestId', 'action', 'payloadJson']) &&
    COLOR_SYSTEM_AUTHORING_ACTIONS_V1.some(action => action === value.action) &&
    json(value.payloadJson)
  );
}

export function isColorSystemAuthoringResultV1(
  input: unknown
): input is ColorSystemAuthoringResultV1 {
  const value = scalars(input);
  if (
    !value ||
    value.type !== 'color-system-authoring-result-v1' ||
    typeof value.requestId !== 'string' ||
    !ID.test(value.requestId)
  )
    return false;
  if (value.success === false)
    return (
      keys(value, ['type', 'requestId', 'success', 'code', 'error']) &&
      text(value.code, 128) &&
      text(value.error, 4096)
    );
  if (Object.prototype.hasOwnProperty.call(value, 'artifactText'))
    return (
      value.success === true &&
      keys(value, ['type', 'requestId', 'success', 'artifactText', 'fileName']) &&
      json(value.artifactText) &&
      typeof value.fileName === 'string' &&
      /^teul-authored\.(?:source\.json|recipe\.json|tokens\.json|geometry\.json|css)$/.test(
        value.fileName
      )
    );
  const field = Object.prototype.hasOwnProperty.call(value, 'exportJson')
    ? 'exportJson'
    : 'dataJson';
  return (
    value.success === true &&
    keys(value, ['type', 'requestId', 'success', field]) &&
    json(value[field])
  );
}
