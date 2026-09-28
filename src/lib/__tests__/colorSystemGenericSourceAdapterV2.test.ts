import { describe, expect, it } from 'vitest';
import canvasOnly from '../../../fixtures/color-builder/generic-source-v2/canvas-only.json';
import compositingContext from '../../../fixtures/color-builder/generic-source-v2/compositing-context.json';
import displayP3 from '../../../fixtures/color-builder/generic-source-v2/display-p3.json';
import emptyCapacity from '../../../fixtures/color-builder/generic-source-v2/empty-capacity.json';
import hybridConflict from '../../../fixtures/color-builder/generic-source-v2/hybrid-conflict.json';
import styleFirst from '../../../fixtures/color-builder/generic-source-v2/style-first.json';
import variableFirst from '../../../fixtures/color-builder/generic-source-v2/variable-first.json';
import { canonicalJson } from '../colorSystemHashing';
import {
  assertColorSystemGenericSourceSnapshotV2Integrity,
  buildColorSystemGenericSourceSnapshotV2,
  COLOR_SYSTEM_GENERIC_SOURCE_EVIDENCE_MAX_BYTES,
  parseColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotV2,
} from '../colorSystemGenericSourceAdapterV2';

const HASH = /^sha256:[0-9a-f]{64}$/;

describe('exact native source identity', () => {
  it.each([
    { name: 'paint opacity', path: ['paintStyles', 1, 'paints', 0, 'opacity'] },
    {
      name: 'gradient color channel',
      path: ['paintStyles', 0, 'paints', 0, 'payload', 'gradientStops', 0, 'color', 'r'],
    },
    {
      name: 'gradient alpha',
      path: ['paintStyles', 0, 'paints', 0, 'payload', 'gradientStops', 0, 'color', 'a'],
    },
    {
      name: 'gradient position',
      path: ['paintStyles', 0, 'paints', 0, 'payload', 'gradientStops', 0, 'position'],
    },
  ])('binds exact preserved $name before confirmation', ({ path }) => {
    const first = build(mutated(compositingContext, path, 0.123456789012341));
    const second = build(mutated(compositingContext, path, 0.123456789012342));
    expect(first.exactNativeValueHash).toMatch(HASH);
    expect(first.currentFileContentHash).not.toBe(second.currentFileContentHash);
    expect(first.sourceSnapshotHash).not.toBe(second.sourceSnapshotHash);
    const altered = mutated(first, path, 0.123456789012342);
    expect(() => parseColorSystemGenericSourceSnapshotV2(altered)).toThrow('content hashes');
    const { exactNativeValueHash: _identity, ...stripped } = first;
    expect(() => parseColorSystemGenericSourceSnapshotV2(stripped)).toThrow('content hashes');
  });

  it('binds changes smaller than perceptual rounding before confirmation', () => {
    const input = structuredClone(canvasOnly);
    input.paletteStructures[0].entries[0].value.components[0] = 0.123456789012341;
    const first = buildColorSystemGenericSourceSnapshotV2(input);
    const altered = mutated(
      first,
      ['paletteStructures', 0, 'entries', 0, 'value', 'components', 0],
      0.123456789012342
    );
    expect(() => parseColorSystemGenericSourceSnapshotV2(altered)).toThrow('content hashes');
    input.paletteStructures[0].entries[0].value.components[0] = 0.123456789012342;
    const second = buildColorSystemGenericSourceSnapshotV2(input);
    expect(first.exactNativeValueHash).toMatch(HASH);
    expect(first.currentFileContentHash).not.toBe(second.currentFileContentHash);
    expect(first.sourceSnapshotHash).not.toBe(second.sourceSnapshotHash);
    const { exactNativeValueHash: _identity, ...stripped } = first;
    expect(() => parseColorSystemGenericSourceSnapshotV2(stripped)).toThrow('content hashes');
  });
});

function clone<T>(value: T): T {
  return structuredClone(value);
}

type FixturePath = readonly (string | number)[];

function containerAt(root: unknown, path: FixturePath): Record<string, unknown> | unknown[] {
  let cursor = root;
  for (const segment of path) {
    if (Array.isArray(cursor)) {
      cursor = cursor[Number(segment)];
    } else {
      cursor = (cursor as Record<string, unknown>)[String(segment)];
    }
  }
  if (!cursor || typeof cursor !== 'object') throw new Error('Fixture path is not a container.');
  return cursor as Record<string, unknown> | unknown[];
}

function setFixturePath(root: unknown, path: FixturePath, value: unknown): void {
  const parent = containerAt(root, path.slice(0, -1));
  const key = path[path.length - 1];
  if (key === undefined) throw new Error('Fixture path must not be empty.');
  if (Array.isArray(parent)) parent[Number(key)] = value;
  else parent[String(key)] = value;
}

function deleteFixturePath(root: unknown, path: FixturePath): void {
  const parent = containerAt(root, path.slice(0, -1));
  const key = path[path.length - 1];
  if (key === undefined) throw new Error('Fixture path must not be empty.');
  if (Array.isArray(parent)) parent.splice(Number(key), 1);
  else delete parent[String(key)];
}

function mutated(source: unknown, path: FixturePath, value: unknown): unknown {
  const draft = clone(source);
  setFixturePath(draft, path, value);
  return draft;
}

function without(source: unknown, path: FixturePath): unknown {
  const draft = clone(source);
  deleteFixturePath(draft, path);
  return draft;
}

function build(value: unknown): ColorSystemGenericSourceSnapshotV2 {
  return buildColorSystemGenericSourceSnapshotV2(value);
}

function expectFrozen(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectFrozen(child);
}

describe('ColorSystemGenericSourceSnapshotV2', () => {
  it('matches the exact seven-fixture source snapshot hash ledger', () => {
    expect({
      'variable-first': build(variableFirst).sourceSnapshotHash,
      'style-first': build(styleFirst).sourceSnapshotHash,
      'canvas-only': build(canvasOnly).sourceSnapshotHash,
      'display-p3': build(displayP3).sourceSnapshotHash,
      'compositing-context': build(compositingContext).sourceSnapshotHash,
      'hybrid-conflict': build(hybridConflict).sourceSnapshotHash,
      'empty-capacity': build(emptyCapacity).sourceSnapshotHash,
    }).toEqual({
      'variable-first': 'sha256:182e48c2b2012025ff42af7346e471a3dac513b7be620d95c360b621fe7837b8',
      'style-first': 'sha256:485c5a9cd5e6aa6de9d178367b009d0f980905f1dfc1a02d4631d53d895f5e43',
      'canvas-only': 'sha256:42a5039e1fc64413e0dc9b27e2b0675501c8a2afafa2722e0c26a0592119f3c0',
      'display-p3': 'sha256:d6054b772c3cd53e34531115b932fab85221593ec370614a7d80b3fef921bd80',
      'compositing-context':
        'sha256:f9c8423371fb8ae34c03f660a9bf059c2d1848a7c845fa5f98c84696ebf39091',
      'hybrid-conflict': 'sha256:da51153ebe530a19c7d64b51ca2eaa02bf13ca8c2620a2d8db84d97ed5eb58af',
      'empty-capacity': 'sha256:a61de45af88857b636bbca83647152b6895d2fe05230f9969e5f7d18cad7a482',
    });
    // Native source channels and preserved paint numerics are data, not runtime
    // noise. Their exact digest participates in source identity. Existing byte-only
    // fixtures retain their hashes; perceptual math still uses twelve-digit rounding.
    const literal: FixturePath = [
      'variables',
      1,
      'valuesByMode',
      0,
      'rawValue',
      'value',
      'components',
      0,
    ];
    const resolved: FixturePath = [
      'variables',
      1,
      'valuesByMode',
      0,
      'resolvedValue',
      'components',
      0,
    ];
    const baseline = build(variableFirst).sourceSnapshotHash;
    const noisy = mutated(
      mutated(variableFirst, literal, 0.1 * (1 + 1e-13)),
      resolved,
      0.1 * (1 + 1e-13)
    );
    expect(canonicalJson(noisy)).not.toBe(canonicalJson(variableFirst));
    expect(build(noisy).sourceSnapshotHash).not.toBe(baseline);
    const oneStep = mutated(
      mutated(variableFirst, literal, 0.1 + 1 / 255),
      resolved,
      0.1 + 1 / 255
    );
    expect(build(oneStep).sourceSnapshotHash).not.toBe(baseline);
  });

  it.each([
    ['variable-first', variableFirst],
    ['style-first', styleFirst],
    ['canvas-only', canvasOnly],
    ['display-p3', displayP3],
    ['compositing-context', compositingContext],
    ['hybrid-conflict', hybridConflict],
    ['empty-capacity', emptyCapacity],
  ])('builds, freezes, and strictly round-trips the %s golden', (_name, fixture) => {
    const snapshot = build(fixture);

    expect(snapshot.currentFileContentHash).toMatch(HASH);
    expect(snapshot.sourceSnapshotHash).toMatch(HASH);
    expect(parseColorSystemGenericSourceSnapshotV2(snapshot)).toEqual(snapshot);
    expect(() => assertColorSystemGenericSourceSnapshotV2Integrity(snapshot)).not.toThrow();
    expectFrozen(snapshot);
  });

  it('preserves exact mode IDs, raw aliases, values, alpha, scopes, and native mode order', () => {
    const snapshot = build(variableFirst);
    const accent = snapshot.variables.find(item => item.variableId === 'variable-accent');
    const primary = snapshot.variables.find(item => item.variableId === 'variable-primary');

    expect(snapshot.collections[0]).toMatchObject({
      defaultModeId: 'mode-light',
      modes: [
        { modeId: 'mode-light', name: 'Light', order: 1 },
        { modeId: 'mode-dark', name: 'Dark', order: 2 },
      ],
    });
    expect(accent?.valuesByMode.map(item => item.rawValue)).toEqual([
      { kind: 'alias', targetVariableId: 'variable-primary' },
      { kind: 'alias', targetVariableId: 'variable-primary' },
    ]);
    expect(accent?.valuesByMode.map(item => item.resolvedValue?.components)).toEqual([
      [0.1, 0.2, 0.3],
      [0.8, 0.7, 0.6],
    ]);
    expect(primary?.scopes).toEqual(['ALL_FILLS', 'STROKE_COLOR']);
    expect(primary?.valuesByMode[0].rawValue).toEqual({
      kind: 'color',
      value: { colorSpace: 'srgb', components: [0.1, 0.2, 0.3], alpha: 1 },
    });
  });

  it('is byte- and hash-deterministic across 100 repeats and non-semantic permutations', () => {
    const expected = build(variableFirst);
    const expectedJson = canonicalJson(expected);

    for (let repeat = 0; repeat < 100; repeat += 1) {
      const permuted = clone(variableFirst);
      permuted.variables.reverse();
      permuted.evidence.reverse();
      permuted.collections.reverse();
      permuted.collections.forEach(collection => collection.modes.reverse());
      permuted.variables.forEach(variable => {
        variable.valuesByMode.reverse();
        variable.scopes.reverse();
        variable.evidenceIds.reverse();
      });
      permuted.scope.selectedNodeIds.reverse();
      permuted.scope.loadedPageIds.reverse();

      const rebuilt = build(repeat % 2 === 0 ? permuted : variableFirst);
      expect(canonicalJson(rebuilt)).toBe(expectedJson);
      expect(rebuilt.currentFileContentHash).toBe(expected.currentFileContentHash);
      expect(rebuilt.sourceSnapshotHash).toBe(expected.sourceSnapshotHash);
    }
  });

  it('retains Paint Style paint payload/order while only an opaque normal solid governs', () => {
    const eligible = build(styleFirst).paintStyles[0];
    const blocked = build(compositingContext).paintStyles;

    expect(eligible).toMatchObject({
      governingEligibility: 'eligible',
      directDeclaration: { kind: 'literal' },
      paints: [{ order: 1, type: 'SOLID', opacity: 1, blendMode: 'NORMAL' }],
    });
    expect(blocked[0]).toMatchObject({
      styleId: 'style-gradient',
      governingEligibility: 'unsupported',
      directDeclaration: null,
      paints: [{ order: 1, type: 'GRADIENT_LINEAR' }],
    });
    expect(blocked[0].paints[0].payload).toMatchObject({
      gradientStops: [{ position: 0 }, { position: 1 }],
      gradientTransform: [
        [1, 0, 0],
        [0, 1, 0],
      ],
    });
    expect(blocked[1]).toMatchObject({
      styleId: 'style-translucent',
      governingEligibility: 'context-dependent',
      directDeclaration: null,
      paints: [{ opacity: 0.5, blendMode: 'MULTIPLY' }],
    });
  });

  it('preserves explicit canvas card order but canonicalizes selection and resource enumeration', () => {
    const expected = build(canvasOnly);
    const permuted = clone(canvasOnly);
    permuted.evidence.reverse();
    permuted.scope.selectedNodeIds = ['frame-secondary', 'frame-another'].reverse();
    const withBothSelections = build(permuted);

    expect(expected.paletteStructures[0].entries.map(item => [item.name, item.order])).toEqual([
      ['Mist', 1],
      ['Ink', 2],
    ]);
    expect(withBothSelections.scope.selectedNodeIds).toEqual(['frame-another', 'frame-secondary']);

    const reorderedCards = clone(canvasOnly);
    reorderedCards.paletteStructures[0].entries.reverse();
    expect(() => build(reorderedCards)).toThrow(/native order/);
  });

  it('preserves Display P3 components and blocks profile reinterpretation', () => {
    const p3 = build(displayP3);
    expect(p3.variables[0].valuesByMode[0].resolvedValue).toEqual({
      colorSpace: 'display-p3',
      components: [0.97, 0.1, 0.2],
      alpha: 1,
    });
    expect(p3.unsupported.map(item => item.kind)).toContain('unsupported-profile');

    const forgedSrgb = clone(displayP3);
    forgedSrgb.variables[0].valuesByMode[0].rawValue.value.colorSpace = 'srgb';
    forgedSrgb.variables[0].valuesByMode[0].resolvedValue.colorSpace = 'srgb';
    expect(() => build(forgedSrgb)).toThrow(/display-p3 document profile/);

    const legacy = clone(displayP3);
    legacy.documentProfile = 'legacy';
    legacy.variables[0].valuesByMode[0].rawValue.value.colorSpace = 'unverified';
    delete (legacy.variables[0].valuesByMode[0] as { resolvedValue?: unknown }).resolvedValue;
    legacy.variables[0].valuesByMode[0].resolution = 'unsupported-profile';
    expect(build(legacy).variables[0].valuesByMode[0]).toMatchObject({
      rawValue: { kind: 'color', value: { colorSpace: 'unverified' } },
      resolution: 'unsupported-profile',
    });
  });

  it('fails closed on hash drift, unknown fields, prototype-bearing paint data, and unsafe flattening', () => {
    const snapshot = build(styleFirst);
    const hashDrift = clone(snapshot);
    hashDrift.paintStyles[0].name = 'Changed after hashing';
    expect(() => parseColorSystemGenericSourceSnapshotV2(hashDrift)).toThrow(/not canonical/);

    const unknown = clone(styleFirst) as typeof styleFirst & { surprise?: boolean };
    unknown.surprise = true;
    expect(() => build(unknown)).toThrow(/unsupported fields/);

    const prototypePayload = clone(styleFirst) as unknown as Record<string, unknown>;
    const paints = (prototypePayload.paintStyles as Array<Record<string, unknown>>)[0]
      .paints as Array<Record<string, unknown>>;
    Object.defineProperty(paints[0].payload, '__proto__', {
      value: { polluted: true },
      enumerable: true,
    });
    expect(() => build(prototypePayload)).toThrow(/prototype-bearing key/);

    const flattenedGradient = clone(compositingContext);
    flattenedGradient.paintStyles[0].governingEligibility = 'eligible';
    (
      flattenedGradient.paintStyles[0] as unknown as { directDeclaration: unknown }
    ).directDeclaration = {
      kind: 'literal',
      value: { colorSpace: 'srgb', components: [1, 0, 0], alpha: 1 },
    };
    expect(() => build(flattenedGradient)).toThrow(/does not match its exact paint evidence/);
  });

  it('scales top-level resource locators past 1,000 but blocks a serialized evidence payload above 16 MiB', () => {
    const aboveRuleLedgerLimit = clone(styleFirst);
    aboveRuleLedgerLimit.evidence = Array.from({ length: 1_001 }, (_, index) => ({
      evidenceId: `e-resource-${index}`,
      kind: 'figma-resource',
      locator: `variable:resource-${index}`,
    }));
    aboveRuleLedgerLimit.paintStyles[0].evidenceIds = ['e-resource-0'];
    expect(build(aboveRuleLedgerLimit).evidence).toHaveLength(1_001);

    const oversized = clone(styleFirst);
    const detail = 'x'.repeat(4_096);
    oversized.evidence = Array.from({ length: 4_100 }, (_, index) => ({
      evidenceId: `e-oversized-${index}`,
      kind: 'figma-resource',
      locator: detail,
    }));
    oversized.paintStyles[0].evidenceIds = ['e-oversized-0'];
    expect(() => build(oversized)).toThrow(
      new RegExp(`${COLOR_SYSTEM_GENERIC_SOURCE_EVIDENCE_MAX_BYTES}-byte serialized capacity`)
    );
  });

  it('rejects 50,001 combined Variable, Paint Style, and palette-entry declarations before normalization', () => {
    const overCapacity = clone(canvasOnly) as unknown as Record<string, unknown>;
    const paletteStructures = overCapacity.paletteStructures as Array<Record<string, unknown>>;
    const sourceEntry = (paletteStructures[0].entries as unknown[])[0];
    paletteStructures[0].entries = Array.from({ length: 49_999 }, () => sourceEntry);
    overCapacity.collections = [clone(variableFirst.collections[0])];
    overCapacity.variables = [clone(variableFirst.variables[0])];
    overCapacity.paintStyles = [clone(styleFirst.paintStyles[0])];

    expect(() => build(overCapacity)).toThrow(
      /Variables, Paint Styles, and palette entries exceed 50000 combined declarations/
    );
  });

  it('strictly rejects malformed primitive, collection, Variable, and lifecycle evidence', () => {
    const mode = clone(variableFirst.collections[0].modes[0]);
    const value = clone(variableFirst.variables[0].valuesByMode[0]);

    const cases: ReadonlyArray<readonly [unknown, RegExp]> = [
      [null, /plain object/],
      [without(styleFirst, ['capturedAt']), /missing fields/],
      [mutated(styleFirst, ['capturedAt'], 42), /must be text/],
      [mutated(styleFirst, ['capturedAt'], ' '), /non-empty bounded text/],
      [mutated(styleFirst, ['capturedAt'], 'x'.repeat(4_097)), /non-empty bounded text/],
      [mutated(styleFirst, ['cancelled'], 'false'), /must be boolean/],
      [mutated(styleFirst, ['scannedNodeCount'], Number.NaN), /finite number/],
      [mutated(styleFirst, ['scannedNodeCount'], 0.5), /must be an integer/],
      [mutated(styleFirst, ['scannedNodeCount'], 100_001), /finite number from 0 through 100000/],
      [mutated(styleFirst, ['documentProfile'], 'adobe-rgb'), /unsupported/],
      [mutated(styleFirst, ['evidence'], {}), /must be an array/],
      [mutated(styleFirst, ['paintStyles', 0, 'evidenceIds'], []), /must not be empty/],
      [
        mutated(
          styleFirst,
          ['paintStyles', 0, 'evidenceIds'],
          ['e-style-accent', 'e-style-accent']
        ),
        /must not contain duplicates/,
      ],
      [mutated(variableFirst, ['scope', 'excludedPageIds'], ['page-main']), /must not overlap/],
      [mutated(variableFirst, ['scope', 'kind'], 'selection'), /must use selection audit evidence/],
      [
        mutated(variableFirst, ['scope', 'selectedNodeIds'], ['irrelevant-selection']),
        /Non-selection scope must not include selected node IDs/,
      ],
      [
        mutated(variableFirst, ['collections', 0, 'modes', 0, 'collectionId'], 'other'),
        /must match its collection/,
      ],
      [mutated(variableFirst, ['collections', 0, 'modes'], []), /modes must not be empty/],
      [mutated(variableFirst, ['collections', 0, 'modes'], [mode, mode]), /unique mode IDs/],
      [
        mutated(variableFirst, ['collections', 0, 'modes', 0, 'order'], 2),
        /contiguous native order/,
      ],
      [
        mutated(variableFirst, ['collections', 0, 'defaultModeId'], 'mode-missing'),
        /identify a collection mode/,
      ],
      [
        mutated(variableFirst, ['variables', 0, 'valuesByMode', 0, 'resolution'], 'literal'),
        /alias raw values cannot use literal/,
      ],
      [
        without(
          mutated(
            variableFirst,
            ['variables', 0, 'valuesByMode', 0, 'resolution'],
            'resolved-alias'
          ),
          ['variables', 0, 'valuesByMode', 0, 'resolvedValue']
        ),
        /resolved aliases require resolvedValue/,
      ],
      [
        mutated(
          variableFirst,
          ['variables', 0, 'valuesByMode', 0, 'resolution'],
          'unresolved-alias'
        ),
        /blocked resolutions cannot retain resolvedValue/,
      ],
      [
        mutated(variableFirst, ['variables', 1, 'valuesByMode', 0, 'resolution'], 'resolved-alias'),
        /literal raw values must use literal/,
      ],
      [mutated(variableFirst, ['variables', 0, 'collectionId'], 'missing'), /missing collection/],
      [
        mutated(variableFirst, ['variables', 0, 'valuesByMode'], [value]),
        /preserve every collection mode/,
      ],
      [
        mutated(variableFirst, ['variables', 0, 'valuesByMode', 0, 'modeName'], 'Wrong'),
        /does not match its collection/,
      ],
      [mutated(variableFirst, ['variables', 0, 'valuesByMode'], [value, value]), /repeats a mode/],
      [mutated(styleFirst, ['cancelled'], true), /Cancelled snapshots must be partial/],
      [mutated(styleFirst, ['partial'], true), /cannot claim complete/],
      [
        mutated(styleFirst, ['paintStyles', 0, 'evidenceIds'], ['e-missing']),
        /Referenced evidence is missing/,
      ],
      [mutated(styleFirst, ['schemaVersion'], 'wrong'), /schemaVersion is unsupported/],
      [mutated(styleFirst, ['adapterVersion'], 'wrong'), /adapterVersion is unsupported/],
    ];

    for (const [candidate, error] of cases) expect(() => build(candidate)).toThrow(error);
  });

  it('strictly preserves JSON, missing values, contexts, and direct declaration boundaries', () => {
    const richPayload = clone(styleFirst);
    setFixturePath(richPayload, ['paintStyles', 0, 'paints', 0, 'payload'], {
      array: [null, true, ''],
      negativeZero: -0,
      nested: { answer: 42 },
    });
    setFixturePath(richPayload, ['evidence', 0, 'detail'], '');
    expect(build(richPayload).paintStyles[0].paints[0].payload).toEqual({
      array: [null, true, ''],
      negativeZero: 0,
      nested: { answer: 42 },
    });

    const missing = clone(variableFirst);
    for (let index = 0; index < missing.variables[0].valuesByMode.length; index += 1) {
      setFixturePath(missing, ['variables', 0, 'valuesByMode', index, 'rawValue'], {
        kind: 'missing',
      });
      deleteFixturePath(missing, ['variables', 0, 'valuesByMode', index, 'resolvedValue']);
      setFixturePath(missing, ['variables', 0, 'valuesByMode', index, 'resolution'], 'missing');
    }
    expect(
      build(missing).variables[0].valuesByMode.every(item => item.resolution === 'missing')
    ).toBe(true);

    const boundAlias = clone(styleFirst);
    setFixturePath(
      boundAlias,
      ['paintStyles', 0, 'paints', 0, 'boundVariableId'],
      'variable-accent'
    );
    setFixturePath(boundAlias, ['paintStyles', 0, 'directDeclaration'], {
      kind: 'alias',
      targetVariableId: 'variable-accent',
    });
    expect(build(boundAlias).paintStyles[0].directDeclaration).toEqual({
      kind: 'alias',
      targetVariableId: 'variable-accent',
    });

    const provenContext = clone(variableFirst);
    provenContext.usageEvidence[0].contextKinds = ['chart', 'product-ui'];
    expect(build(provenContext).usageEvidence[0].contextKinds).toEqual(['chart', 'product-ui']);
  });

  it('rejects malformed color, paint, palette, usage, descriptor, JSON, and hash evidence', () => {
    const deepPayload: Record<string, unknown> = {};
    let cursor = deepPayload;
    for (let depth = 0; depth < 66; depth += 1) {
      const child: Record<string, unknown> = {};
      cursor.child = child;
      cursor = child;
    }
    const mode = clone(variableFirst.collections[0].modes[0]);
    const variable = clone(variableFirst.variables[0]);
    const style = clone(styleFirst.paintStyles[0]);
    const structure = clone(canvasOnly.paletteStructures[0]);
    const usage = clone(variableFirst.usageEvidence[0]);
    const descriptor = {
      collectionKey: 'library-collection',
      collectionName: 'Library',
      libraryName: 'Shared',
      variables: [
        { key: 'duplicate', name: 'A', resolvedType: 'COLOR' },
        { key: 'duplicate', name: 'B', resolvedType: 'COLOR' },
      ],
      evidenceIds: ['e-style-accent'],
    };

    const cases: ReadonlyArray<readonly [unknown, RegExp]> = [
      [
        mutated(styleFirst, ['paintStyles', 0, 'paints', 0, 'payload'], null),
        /payload must be an object/,
      ],
      [
        mutated(styleFirst, ['paintStyles', 0, 'paints', 0, 'payload'], { value: Infinity }),
        /non-finite number/,
      ],
      [
        mutated(styleFirst, ['paintStyles', 0, 'paints', 0, 'payload'], deepPayload),
        /exceeds JSON depth/,
      ],
      [
        mutated(styleFirst, ['paintStyles', 0, 'paints', 0, 'payload'], {
          values: Array.from({ length: 1_001 }, () => 0),
        }),
        /bounded JSON array size/,
      ],
      [
        mutated(
          styleFirst,
          ['paintStyles', 0, 'paints', 0, 'payload'],
          Object.fromEntries(Array.from({ length: 1_001 }, (_, index) => [`key-${index}`, index]))
        ),
        /bounded JSON object size/,
      ],
      [
        mutated(styleFirst, ['paintStyles', 0, 'paints', 0, 'solidValue', 'components'], [0, 1]),
        /exactly three/,
      ],
      [
        mutated(styleFirst, ['paintStyles', 0, 'paints', 0, 'solidValue', 'components', 0], 2),
        /finite number/,
      ],
      [
        mutated(styleFirst, ['paintStyles', 0, 'paints', 0, 'solidValue', 'colorSpace'], 'lab'),
        /unsupported/,
      ],
      [
        without(styleFirst, ['paintStyles', 0, 'paints', 0, 'solidValue']),
        /solid paint requires solidValue/,
      ],
      [
        mutated(styleFirst, ['paintStyles', 0, 'paints', 0, 'type'], 'GRADIENT_LINEAR'),
        /non-solid paint cannot expose solidValue/,
      ],
      [mutated(styleFirst, ['paintStyles', 0, 'paints', 0, 'order'], 2), /contiguous native order/],
      [without(styleFirst, ['paintStyles', 0, 'directDeclaration']), /missing fields/],
      [
        mutated(styleFirst, ['paintStyles', 0, 'directDeclaration'], null),
        /eligible styles require/,
      ],
      [
        mutated(
          mutated(
            styleFirst,
            ['paintStyles', 0, 'paints', 0, 'boundVariableId'],
            'variable-accent'
          ),
          ['paintStyles', 0, 'directDeclaration'],
          { kind: 'alias', targetVariableId: 'different' }
        ),
        /direct alias must match/,
      ],
      [mutated(canvasOnly, ['paletteStructures', 0, 'entries'], []), /entries must not be empty/],
      [mutated(canvasOnly, ['paletteStructures', 0, 'sectionKind'], 'other'), /unsupported/],
      [
        mutated(variableFirst, ['usageEvidence', 0, 'contextKinds'], ['unknown', 'chart']),
        /cannot mix unknown/,
      ],
      [mutated(variableFirst, ['usageEvidence', 0, 'contextKinds'], ['other']), /unsupported/],
      [mutated(variableFirst, ['usageEvidence', 0, 'count'], 0), /finite number/],
      [mutated(styleFirst, ['enabledLibraryDescriptors'], [descriptor]), /unique keys/],
      [
        mutated(
          variableFirst,
          ['collections'],
          [variableFirst.collections[0], variableFirst.collections[0]]
        ),
        /unique identities/,
      ],
      [mutated(variableFirst, ['variables'], [variable, variable]), /unique identities/],
      [mutated(styleFirst, ['paintStyles'], [style, style]), /unique identities/],
      [mutated(canvasOnly, ['paletteStructures'], [structure, structure]), /unique identities/],
      [mutated(variableFirst, ['usageEvidence'], [usage, usage]), /unique identities/],
      [
        mutated(
          variableFirst,
          ['collections', 0, 'modes'],
          [mode, { ...mode, modeId: 'mode-other' }]
        ),
        /defaultModeId must identify|contiguous native order/,
      ],
    ];

    for (const [candidate, error] of cases) expect(() => build(candidate)).toThrow(error);

    const snapshot = clone(build(styleFirst));
    snapshot.currentFileContentHash = 'not-a-hash';
    expect(() => parseColorSystemGenericSourceSnapshotV2(snapshot)).toThrow(/canonical SHA-256/);
  });
});
