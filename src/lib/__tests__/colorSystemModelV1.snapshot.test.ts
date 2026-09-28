import { describe, expect, it, vi } from 'vitest';
import {
  buildColorSystemModelV1,
  captureColorSystemModelV1,
  parseColorSystemModelV1,
  type ColorSystemModelV1,
} from '../colorSystemModelV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
} from '../colorSystemApplicationRequirementsV1';
import {
  compileColorSystemModelCompositionV1,
  COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
} from '../colorSystemModelCompositionV1';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import {
  syntheticColorSystemModelInputV1,
  syntheticColorSystemModelV1,
} from './fixtures/colorSystemModelV1Fixture';

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;
const copy = <T>(value: T) => structuredClone(value) as Mutable<T>;
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
function objects(value: unknown): object[] {
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(objects)];
}
function deepFreeze<T>(value: T): T {
  for (const object of objects(value).reverse()) Object.freeze(object);
  return value;
}

describe('explicit immutable validated model snapshots', () => {
  it('captures a detached deep-frozen graph without freezing or aliasing caller data', () => {
    const source = syntheticColorSystemModelV1(),
      before = canonicalJson(source),
      originalObjects = new Set(objects(source)),
      captured = captureColorSystemModelV1(source);
    expect(captured).toEqual(source);
    expect(captured).not.toBe(source);
    expect(objects(captured).every(Object.isFrozen)).toBe(true);
    expect(objects(source).every(value => !Object.isFrozen(value))).toBe(true);
    expect(objects(captured).some(value => originalObjects.has(value))).toBe(false);
    expect(captureColorSystemModelV1(captured)).toBe(captured);
    expect(canonicalJson(source)).toBe(before);
    Object.assign(source.colors[0].valuesByMode.Day.components, { r: 0 });
    expect(canonicalJson(captured)).toBe(before);
  });

  it('parses captured data into independent mutable graphs and fully validates those copies', () => {
    const captured = captureColorSystemModelV1(syntheticColorSystemModelV1()),
      first = parseColorSystemModelV1(captured),
      second = parseColorSystemModelV1(captured),
      capturedObjects = new Set(objects(captured)),
      firstObjects = new Set(objects(first));
    expect(first).toEqual(captured);
    expect(objects(first).every(value => !Object.isFrozen(value))).toBe(true);
    expect(objects(first).some(value => capturedObjects.has(value))).toBe(false);
    expect(objects(second).some(value => firstObjects.has(value))).toBe(false);
    Object.assign(first.sources[0], { sourceHash: hash('changed after parsing') });
    expect(() => parseColorSystemModelV1(first)).toThrow();
    expect(() => captureColorSystemModelV1(first)).toThrow();
    expect(parseColorSystemModelV1(captured)).toEqual(second);
  });

  it('preserves exact native channels and negative zero through the trusted copy path', () => {
    const input = copy(syntheticColorSystemModelInputV1());
    input.adoptions = [];
    input.colors[0].valuesByMode.Day = buildColorSystemSrgbValueV1(
      { r: -0, g: 0.1234567890123456, b: 0.3456789012345678 },
      -0
    );
    const source = buildColorSystemModelV1(input),
      captured = captureColorSystemModelV1(source),
      parsed = parseColorSystemModelV1(captured);
    const value = parsed.colors.find(color => color.id === input.colors[0].id)!.valuesByMode.Day;
    expect(Object.is(value.components.r, -0)).toBe(true);
    expect(Object.is(value.alpha, -0)).toBe(true);
    expect(value.components.g).toBe(0.1234567890123456);
    expect(value.components.b).toBe(0.3456789012345678);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(source));
    expect(parsed.modelHash).toBe(source.modelHash);
  });

  it('does not trust copied, shallow-frozen or deeply frozen supplied model identities', () => {
    const snapshot = captureColorSystemModelV1(syntheticColorSystemModelV1());
    for (const freeze of [(value: ColorSystemModelV1) => value, Object.freeze, deepFreeze]) {
      const valid = freeze(copy(snapshot));
      expect(captureColorSystemModelV1(valid)).not.toBe(valid);
      const forged = copy(snapshot);
      forged.modelHash = hash('forged matching-looking marker');
      freeze(forged);
      expect(() => parseColorSystemModelV1(forged)).toThrow();
      expect(() => captureColorSystemModelV1(forged)).toThrow();
    }
    const serialized = JSON.stringify(snapshot);
    expect(captureColorSystemModelV1(serialized)).not.toBe(snapshot);
    const wrapped = new Proxy(snapshot, {});
    expect(captureColorSystemModelV1(wrapped)).not.toBe(snapshot);
    expect(captureColorSystemModelV1(wrapped)).not.toBe(wrapped);
  });

  it.each(['source', 'value', 'rule', 'evidence', 'adoption'] as const)(
    'rechecks %s changes with stale decisions even when the outer content hash is forged consistently',
    changed => {
      const model = copy(captureColorSystemModelV1(syntheticColorSystemModelV1()));
      if (changed === 'source') model.sources[0].sourceHash = hash('changed source');
      if (changed === 'value')
        model.colors[0].valuesByMode.Day = buildColorSystemSrgbValueV1({
          r: 0.9,
          g: 0.91,
          b: 0.92,
        });
      if (changed === 'rule') model.rules[0].label = 'Changed source meaning';
      if (changed === 'evidence') model.evidence[0].description = 'Changed evidence meaning';
      if (changed === 'adoption') model.adoptions[0].dependencyHash = hash('changed adoption');
      const { modelHash: _oldHash, ...content } = model;
      model.modelHash = hash(content);
      deepFreeze(model);
      expect(() => parseColorSystemModelV1(model)).toThrow();
      expect(() => captureColorSystemModelV1(model)).toThrow();
    }
  );

  it('rejects executable, hidden, cyclic and unknown-version input before granting a capture', () => {
    const getter = vi.fn(() => 0);
    const accessor = copy(syntheticColorSystemModelV1());
    Object.defineProperty(accessor.colors[0].valuesByMode.Day.components, 'r', {
      enumerable: true,
      get: getter,
    });
    const hidden = copy(syntheticColorSystemModelV1());
    Object.defineProperty(hidden, 'captureMarker', { value: true });
    const cyclic = copy(syntheticColorSystemModelV1());
    Object.assign(cyclic, { cycle: cyclic });
    for (const value of [accessor, hidden, cyclic, { schemaVersion: 'future', payload: {} }]) {
      expect(() => captureColorSystemModelV1(value)).toThrow();
      expect(() => parseColorSystemModelV1(value)).toThrow();
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('keeps ordinary builder/parser outputs mutable and independent', () => {
    const source = syntheticColorSystemModelV1(),
      parsed = parseColorSystemModelV1(source);
    expect(objects(source).every(value => !Object.isFrozen(value))).toBe(true);
    expect(objects(parsed).every(value => !Object.isFrozen(value))).toBe(true);
    Object.assign(parsed.sources[0], { label: 'Working edit' });
    expect(source.sources[0].label).not.toBe('Working edit');
  });

  it('preserves complete composition bytes and cancellation for plain and captured input', async () => {
    const source = syntheticColorSystemModelV1(),
      captured = captureColorSystemModelV1(source);
    const requirements = buildColorSystemApplicationRequirementsV1({
      schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
      templates: [
        {
          id: 'control',
          contextId: 'interface',
          modeId: 'Day',
          uses: [{ id: 'paint', role: 'action', area: 10 }],
          pairs: [],
        },
      ],
      distinctions: [],
    });
    const request = {
      version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
      modelHash: source.modelHash,
      requirementsHash: hash(requirements),
      groups: [
        {
          id: 'paint',
          options: [
            {
              id: 'blue',
              assignments: [{ applicationId: 'control', useId: 'paint', colorId: 'blue' }],
            },
          ],
        },
      ],
      maximumNodes: 4,
      maximumSolutions: 3,
    };
    const plain = compileColorSystemModelCompositionV1(source, requirements, request),
      reused = compileColorSystemModelCompositionV1(captured, requirements, request),
      execution = { isCancelled: () => false, yield: async () => {} };
    const before = await plain.compose(execution),
      after = await reused.compose(execution);
    expect(before.status).toBe('ready');
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    let cancelled = false;
    const result = await reused.compose({
      isCancelled: () => cancelled,
      yield: async () => {
        cancelled = true;
      },
    });
    expect(result.status).toBe('cancelled');
    expect(result.solutions).toEqual([]);
  });
});
