/** Bounded data detachment only; callers retain ownership of all schema and authority checks. */
import { canonicalJson } from './colorSystemHashing';
import { utf8ByteLength } from './utf8';

export const COLOR_SYSTEM_INERT_JSON_V1_LIMITS = Object.freeze({
  maximumBytes: 2 * 1024 * 1024,
  maximumDepth: 24,
  maximumNodes: 100000,
  maximumArrayLength: 32768,
  maximumObjectKeys: 1024,
});
export type ColorSystemInertJsonLimitsV1 = {
  readonly [Key in keyof typeof COLOR_SYSTEM_INERT_JSON_V1_LIMITS]: number;
};

/** Limit overrides are program policy, never fields read from the unknown payload. */
export function snapshotColorSystemInertJsonV1(
  input: unknown,
  policy: Partial<ColorSystemInertJsonLimitsV1> = {}
): unknown {
  const limits = { ...COLOR_SYSTEM_INERT_JSON_V1_LIMITS, ...policy };
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value < 1))
    throw new Error('JSON snapshot limits must be positive bounded integers.');
  let nodes = 0;
  let textBytes = 0;
  const ancestors = new Set<object>();
  const visit = (value: unknown, depth: number): unknown => {
    if (++nodes > limits.maximumNodes || depth > limits.maximumDepth)
      throw new Error('JSON snapshot exceeds its node or depth bound.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('JSON snapshot requires finite numbers.');
      return value;
    }
    if (typeof value === 'string') {
      textBytes += utf8ByteLength(value);
      if (textBytes > limits.maximumBytes) throw new Error('JSON snapshot exceeds its byte bound.');
      return value;
    }
    if (typeof value !== 'object' || ancestors.has(value))
      throw new Error('JSON snapshot requires inert acyclic data.');
    const array = Array.isArray(value);
    if (
      array
        ? Object.getPrototypeOf(value) !== Array.prototype
        : ![null, Object.prototype].includes(Object.getPrototypeOf(value))
    )
      throw new Error('JSON snapshot requires plain records and arrays.');
    const keys = Reflect.ownKeys(value);
    if (
      array
        ? value.length > limits.maximumArrayLength || keys.length !== value.length + 1
        : keys.length > limits.maximumObjectKeys
    )
      throw new Error('JSON snapshot exceeds a dense array or object bound.');
    ancestors.add(value);
    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (
        typeof key !== 'string' ||
        ['__proto__', 'constructor', 'prototype'].includes(key) ||
        (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))
      )
        throw new Error('JSON snapshot contains an unsupported field.');
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!descriptor.enumerable || !('value' in descriptor))
        throw new Error('JSON snapshot rejects accessors and hidden fields.');
      textBytes += utf8ByteLength(key);
      if (textBytes > limits.maximumBytes) throw new Error('JSON snapshot exceeds its byte bound.');
      result[key] = visit(descriptor.value, depth + 1);
    }
    ancestors.delete(value);
    return array ? Array.from({ length: value.length }, (_, index) => result[index]) : result;
  };
  const snapshot = visit(input, 0);
  if (utf8ByteLength(canonicalJson(snapshot)) > limits.maximumBytes)
    throw new Error('JSON snapshot exceeds its byte bound.');
  return snapshot;
}

/** Stable JSON spelling for native data, including numeric -0, without changing legacy hash policy. */
export function serializeColorSystemInertJsonV1(
  input: unknown,
  policy: Partial<ColorSystemInertJsonLimitsV1> = {}
): string {
  const snapshot = snapshotColorSystemInertJsonV1(input, policy);
  const write = (value: unknown): string => {
    if (typeof value === 'number' && Object.is(value, -0)) return '-0';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(write).join(',')}]`;
    const data = value as Record<string, unknown>;
    return `{${Object.keys(data)
      .sort()
      .map(key => `${JSON.stringify(key)}:${write(data[key])}`)
      .join(',')}}`;
  };
  const serialized = write(snapshot);
  if (
    utf8ByteLength(serialized) >
    (policy.maximumBytes ?? COLOR_SYSTEM_INERT_JSON_V1_LIMITS.maximumBytes)
  )
    throw new Error('JSON serialization exceeds its byte bound.');
  return serialized;
}
