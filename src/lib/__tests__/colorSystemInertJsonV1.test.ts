import { describe, expect, it, vi } from 'vitest';
import {
  serializeColorSystemInertJsonV1,
  snapshotColorSystemInertJsonV1,
} from '../colorSystemInertJsonV1';

describe('bounded inert JSON snapshots', () => {
  it('serializes exact finite values with sorted keys and preserves numeric signed zero', () => {
    const raw = serializeColorSystemInertJsonV1({
      z: [-0, 0.1234567890123456, Number.MIN_VALUE],
      a: 'native −0 is data',
    });
    expect(raw).toBe('{"a":"native −0 is data","z":[-0,0.1234567890123456,5e-324]}');
    const parsed = JSON.parse(raw);
    expect(Object.is(parsed.z[0], -0)).toBe(true);
    expect(parsed.z[1]).toBe(0.1234567890123456);
    expect(parsed.z[2]).toBe(Number.MIN_VALUE);
    expect(() => serializeColorSystemInertJsonV1([-0], { maximumBytes: 3 })).toThrow(
      /serialization exceeds/
    );
    expect(serializeColorSystemInertJsonV1([-0], { maximumBytes: 4 })).toBe('[-0]');
  });

  it('applies the same inert guards before serializing and never invokes a getter', () => {
    const getter = vi.fn(() => -0);
    const data = Object.defineProperty({}, 'native', { enumerable: true, get: getter });
    expect(() => serializeColorSystemInertJsonV1(data)).toThrow(/accessor/);
    expect(getter).not.toHaveBeenCalled();
  });
  it('detaches arrays, plain/null records and full native numbers without shared aliases', () => {
    const value = { channel: 0.123456789012341 };
    const input = Object.assign(Object.create(null), {
      items: [value, value],
      flag: true,
      empty: null,
    });
    const result = snapshotColorSystemInertJsonV1(input) as typeof input;
    expect(result).toEqual(input);
    expect(Object.getPrototypeOf(result)).toBeNull();
    value.channel = 0;
    expect(result.items[0].channel).toBe(0.123456789012341);
    result.items[0].channel = 1;
    expect(result.items[1].channel).toBe(0.123456789012341);
  });

  it('counts UTF-8 and serialized punctuation against the exact byte limit', () => {
    expect(snapshotColorSystemInertJsonV1('é', { maximumBytes: 4 })).toBe('é');
    expect(() => snapshotColorSystemInertJsonV1('é', { maximumBytes: 3 })).toThrow('byte bound');
    expect(() => snapshotColorSystemInertJsonV1({ é: 'é' }, { maximumBytes: 3 })).toThrow(
      'byte bound'
    );
    expect(() => snapshotColorSystemInertJsonV1([1, 2], { maximumBytes: 4 })).toThrow('byte bound');
  });

  it('enforces node, depth, array and object bounds', () => {
    expect(() => snapshotColorSystemInertJsonV1([1, 2], { maximumNodes: 2 })).toThrow(
      'node or depth'
    );
    expect(snapshotColorSystemInertJsonV1([1, 2], { maximumNodes: 3 })).toEqual([1, 2]);
    expect(() => snapshotColorSystemInertJsonV1({ a: { b: 1 } }, { maximumDepth: 1 })).toThrow(
      'node or depth'
    );
    expect(() => snapshotColorSystemInertJsonV1([1, 2], { maximumArrayLength: 1 })).toThrow(
      'array or object'
    );
    expect(() => snapshotColorSystemInertJsonV1({ a: 1, b: 2 }, { maximumObjectKeys: 1 })).toThrow(
      'array or object'
    );
    expect(() => snapshotColorSystemInertJsonV1({}, { maximumBytes: Infinity })).toThrow(
      'positive bounded'
    );
  });

  it('rejects accessors and hidden fields without invoking code', () => {
    const getter = vi.fn(() => 1);
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: getter });
    const hidden = Object.defineProperty({}, 'value', { enumerable: false, value: 1 });
    const arrayAccessor = Object.defineProperty([1], '0', { enumerable: true, get: getter });
    for (const value of [accessor, hidden, arrayAccessor])
      expect(() => snapshotColorSystemInertJsonV1(value)).toThrow('accessors and hidden');
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects sparse/extended arrays, foreign prototypes, symbols, cycles and non-JSON values', () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const extended = Object.assign([1], { extra: 2 });
    for (const value of [
      new Array(2),
      extended,
      Object.create({ inherited: true }),
      new Date(),
      cycle,
      { [Symbol('field')]: 1 },
      JSON.parse('{"__proto__":{}}'),
      undefined,
      () => 1,
      NaN,
      Infinity,
      1n,
    ]) {
      expect(() => snapshotColorSystemInertJsonV1(value)).toThrow();
    }
  });
});
