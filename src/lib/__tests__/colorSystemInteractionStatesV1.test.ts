import { describe, expect, it } from 'vitest';
import { getWCAGContrast } from '../accessibility';
import type { ColorSystemColorValueV2 } from '../colorSystemBuilderV2Contracts';
import {
  COLOR_SYSTEM_INTERACTION_STATES_V1_LIMITS,
  ColorSystemInteractionStatesV1Error,
  selectColorSystemInteractionStatesV1,
  type ColorSystemInteractionColorV1,
  type ColorSystemInteractionFamilyV1,
  type ColorSystemInteractionStatesInputV1,
} from '../colorSystemInteractionStatesV1';
import { buildColorSystemSrgbValueV1, colorSystemSrgbToRgbV1 } from '../colorSystemSrgbValueV1';
import { hexToRgb } from '../utils';
import { deterministicContentHash } from '../colorSystemHashing';

function color(hex: string, alpha = 1): ColorSystemColorValueV2 {
  const rgb = hexToRgb(hex);
  return buildColorSystemSrgbValueV1({ r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 }, alpha);
}

function source(id: string, value: ColorSystemColorValueV2) {
  return {
    ref: { kind: 'preserved-source-color' as const, stableColorId: id, mode: 'Light' },
    value,
  };
}

function family(
  familyId = 'blue',
  colors = ['#3366CC', '#2854AE', '#20428A'],
  preference = 0,
  firstStep = 9
): ColorSystemInteractionFamilyV1 {
  return {
    familyId,
    contributionId: `contribution:${familyId}`,
    preference,
    members: colors.map((hex, index) => ({
      ref: { familyId, memberId: `${familyId}:${firstStep + index}`, mode: 'Light' },
      value: color(hex),
      step: firstStep + index,
      eligibleJob: 'product-semantics',
    })),
  };
}

function input(
  overrides: Partial<ColorSystemInteractionStatesInputV1> = {}
): ColorSystemInteractionStatesInputV1 {
  return {
    role: 'selected',
    mode: 'Light',
    families: [family()],
    surfaces: [source('white', color('#FFFFFF')), source('paper', color('#F3F0EA'))],
    onForegrounds: [source('ink', color('#000000')), source('white', color('#FFFFFF'))],
    ...overrides,
  };
}

function ready(value: ColorSystemInteractionStatesInputV1) {
  const result = selectColorSystemInteractionStatesV1(value);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Expected a complete state set.');
  return result;
}

function grayForWhiteContrast(ratio: number): ColorSystemColorValueV2 {
  const luminance = 1.05 / ratio - 0.05;
  const channel = 1.055 * luminance ** (1 / 2.4) - 0.055;
  return buildColorSystemSrgbValueV1({ r: channel, g: channel, b: channel });
}

describe('complete interaction state selection', () => {
  it('selects one same-family triple and a common foreground, with every measured surface pair', () => {
    const result = ready(input());
    expect(Object.values(result.selection.states).map(member => member.step)).toEqual([9, 10, 11]);
    expect(result.selection.onForeground?.ref).toEqual(source('white', color('#FFFFFF')).ref);
    expect(result.selection.pairs).toHaveLength(12);
    expect(result.selection.distinction).toHaveLength(6);
    expect(result.selection.pairs.every(pair => pair.ratio >= pair.minimumRatio)).toBe(true);
    expect(result.selection.distinction.every(pair => pair.deltaEOK > 0)).toBe(true);
    expect(result.diagnostics).toMatchObject({
      evaluatedTriples: 1,
      feasibleTriples: 1,
      failures: [],
    });
  });

  it('filters complete feasibility before family preference, allowing source-derived or neutral fallbacks', () => {
    const preferred = family('bright-source', ['#EAF027', '#BBC126', '#4E5400']);
    const neutral = family('neutral', ['#555555', '#444444', '#333333'], 1);
    const result = ready(input({ families: [preferred, neutral] }));
    expect(result.selection.familyId).toBe('neutral');
    expect(result.diagnostics.families[0]).toMatchObject({
      familyId: 'bright-source',
      feasibleTriples: 0,
    });
    expect(result.diagnostics.failures[0]).toMatchObject({
      familyId: 'bright-source',
      code: 'SURFACE_CONTRAST',
    });
  });

  it('uses usage-step preferences only among feasible triples and moves link rest before step 11 when needed', () => {
    const complete = family(
      'complete',
      ['#555555', '#444444', '#333333', '#222222', '#111111'],
      0,
      8
    );
    expect(
      Object.values(ready(input({ families: [complete] })).selection.states).map(
        member => member.step
      )
    ).toEqual([9, 10, 11]);
    const link = ready(input({ role: 'link', families: [complete], onForegrounds: [] }));
    expect(Object.values(link.selection.states).map(member => member.step)).toEqual([10, 11, 12]);
    expect(link.selection.onForeground).toBeNull();
    expect(
      link.selection.pairs.every(pair => pair.kind === 'link-text' && pair.minimumRatio === 4.5)
    ).toBe(true);
  });

  it('checks all declared surfaces and reports the exact failing surface', () => {
    const candidate = family('mid-gray', ['#949494', '#909090', '#888888']);
    expect(
      ready(input({ families: [candidate], surfaces: [source('white', color('#FFFFFF'))] })).status
    ).toBe('ready');
    const result = selectColorSystemInteractionStatesV1(input({ families: [candidate] }));
    expect(result.status).toBe('infeasible');
    expect(result.diagnostics.failures[0]).toMatchObject({
      code: 'SURFACE_CONTRAST',
      state: 'rest',
      surface: { stableColorId: 'paper' },
      minimumRatio: 3,
    });
    expect(result.diagnostics.failures[0].ratio).toBeLessThan(3);
  });

  it('requires 4.5 for link states even when a fill would pass 3', () => {
    const candidate = family('mid-gray', ['#888888', '#808080', '#777777']);
    const options = input({ families: [candidate], surfaces: [source('white', color('#FFFFFF'))] });
    expect(ready(options).status).toBe('ready');
    const result = selectColorSystemInteractionStatesV1({ ...options, role: 'link' });
    expect(result.status).toBe('infeasible');
    expect(result.diagnostics.failures[0]).toMatchObject({
      code: 'SURFACE_CONTRAST',
      minimumRatio: 4.5,
    });
    expect(result.diagnostics.failures[0].ratio).toBeGreaterThan(3);
  });

  it('rejects a triple when different states need incompatible foregrounds', () => {
    const result = selectColorSystemInteractionStatesV1(
      input({
        families: [family('mixed', ['#FFFFFF', '#FFFF00', '#000000'])],
        surfaces: [source('mid-gray', color('#777777'))],
      })
    );
    expect(result.status).toBe('infeasible');
    expect(result.diagnostics.failures[0]).toMatchObject({
      code: 'NO_COMMON_FOREGROUND',
      minimumRatio: 4.5,
    });
    expect(result.diagnostics.failures[0].ratio).toBeLessThan(4.5);
  });

  it('rejects exact duplicate rendered states, including different rgba recipes', () => {
    const duplicate = family('duplicate', ['#555555', '#555555', '#333333']);
    expect(
      selectColorSystemInteractionStatesV1(input({ families: [duplicate] })).diagnostics.counts
        .IDENTICAL_RENDERED_STATES
    ).toBe(1);
    const alphaDuplicate = family('alpha-duplicate', ['#000000', '#000000', '#333333']);
    const values = [
      buildColorSystemSrgbValueV1({ r: 0.5, g: 0.5, b: 0.5 }),
      color('#000000', 0.5),
      color('#333333'),
    ];
    const result = selectColorSystemInteractionStatesV1(
      input({
        families: [
          {
            ...alphaDuplicate,
            members: alphaDuplicate.members.map((member, index) => ({
              ...member,
              value: values[index],
            })),
          },
        ],
        surfaces: [source('white', color('#FFFFFF'))],
      })
    );
    expect(result.status).toBe('infeasible');
    expect(result.diagnostics.counts.IDENTICAL_RENDERED_STATES).toBe(1);
  });

  it('retains distinct native channels sharing a display hex without inventing a delta-E floor', () => {
    const candidate = family('native', ['#444444', '#444444', '#444444']);
    const members = candidate.members.map((member, index) => ({
      ...member,
      value: buildColorSystemSrgbValueV1({
        r: (68 + index * 0.001) / 255,
        g: 68 / 255,
        b: 68 / 255,
      }),
    }));
    const result = ready(input({ families: [{ ...candidate, members }] }));
    expect(Object.values(result.selection.states).map(member => member.value)).toEqual(
      members.map(member => member.value)
    );
    expect(new Set(members.map(member => member.value.hex)).size).toBe(1);
    expect(
      result.selection.distinction.every(
        measure => measure.deltaEOK > 0 && measure.deltaEOK < 0.0001
      )
    ).toBe(true);
  });

  it('uses unrounded native contrast at the 4.5 boundary instead of display hex or rounded ratios', () => {
    const candidate = family();
    const run = (ratio: number) =>
      selectColorSystemInteractionStatesV1(
        input({
          role: 'link',
          families: [
            {
              ...candidate,
              members: candidate.members.map((member, index) => ({
                ...member,
                value: index === 0 ? grayForWhiteContrast(ratio) : member.value,
              })),
            },
          ],
          surfaces: [source('white', color('#FFFFFF'))],
          onForegrounds: [],
        })
      );
    const fail = run(4.4999),
      pass = run(4.5001);
    expect(fail.status).toBe('infeasible');
    expect(fail.diagnostics.failures[0].ratio).toBeCloseTo(4.4999, 10);
    expect(Math.round(fail.diagnostics.failures[0].ratio! * 100) / 100).toBe(4.5);
    expect(pass.status).toBe('ready');
    if (pass.status !== 'ready') throw new Error('Expected exact-channel pass.');
    expect(pass.selection.pairs[0].ratio).toBeCloseTo(4.5001, 10);
    expect(grayForWhiteContrast(4.4999).hex).toBe(grayForWhiteContrast(4.5001).hex);
  });

  it('composites translucent labels over fills already composited on each declared ground', () => {
    const candidate = family('alpha', ['#000000', '#000000', '#000000']);
    const members = candidate.members.map((member, index) => ({
      ...member,
      value: color('#000000', [0.8, 0.9, 1][index]),
    }));
    const result = ready(
      input({
        families: [{ ...candidate, members }],
        onForegrounds: [source('label', color('#FFFFFF', 0.6))],
      })
    );
    const pair = result.selection.pairs.find(
      pair =>
        pair.kind === 'label' && pair.state === 'rest' && pair.surface.stableColorId === 'paper'
    )!;
    const ground = colorSystemSrgbToRgbV1(color('#F3F0EA'));
    const renderedFill = { r: ground.r * 0.2, g: ground.g * 0.2, b: ground.b * 0.2 };
    const renderedLabel = {
      r: 255 * 0.6 + renderedFill.r * 0.4,
      g: 255 * 0.6 + renderedFill.g * 0.4,
      b: 255 * 0.6 + renderedFill.b * 0.4,
    };
    expect(pair.renderedBackground.r).toBeCloseTo(renderedFill.r, 12);
    expect(pair.renderedForeground.r).toBeCloseTo(renderedLabel.r, 12);
    expect(pair.ratio).toBeCloseTo(getWCAGContrast(renderedLabel, renderedFill), 12);
  });

  it('preserves exact multi-surface measurements and canonical foreground ties after caching', () => {
    const candidate = family('alpha-tie', ['#000000', '#000000', '#000000']);
    const original = input({
      families: [
        {
          ...candidate,
          members: candidate.members.map((member, index) => ({
            ...member,
            value: color('#000000', [0.8, 0.9, 1][index]),
          })),
        },
      ],
      onForegrounds: [
        source('z-label', color('#FFFFFF', 0.6)),
        source('weak-label', color('#000000', 0.1)),
        source('a-label', color('#FFFFFF', 0.6)),
      ],
    });
    const result = ready(original);
    expect(result.selection.onForeground?.ref).toEqual(
      source('a-label', color('#FFFFFF', 0.6)).ref
    );
    expect(ready({ ...original, onForegrounds: [...original.onForegrounds].reverse() })).toEqual(
      result
    );
    // Canonicalize computed measurements for supported-runtime transcendental drift.
    // Exact caller/native values are asserted independently of this measurement golden.
    expect(deterministicContentHash(result)).toBe(
      'sha256:ebf7a84d7a671157ea355d195145b577e8e0b17798ff5f88ac0118af721f10c7'
    );
  });

  it('ranks deterministically while retaining the caller family display order and input values', () => {
    const first = family('a'),
      second = family('b');
    const original = input({ families: [second, first] });
    const before = JSON.stringify(original);
    const result = ready(original);
    const reversed = ready({
      ...original,
      families: [first, second],
      onForegrounds: [...original.onForegrounds].reverse(),
    });
    expect(result.selection).toEqual(reversed.selection);
    expect(result.selection.familyId).toBe('a');
    expect(result.diagnostics.families.map(family => family.familyId)).toEqual(['b', 'a']);
    expect(JSON.stringify(original)).toBe(before);
  });

  it('returns explicit infeasibility for absent families, missing steps, and missing common foregrounds', () => {
    expect(
      selectColorSystemInteractionStatesV1(input({ families: [] })).diagnostics.counts
        .NO_ELIGIBLE_FAMILIES
    ).toBe(1);
    const short = family('short', ['#333333', '#222222']);
    expect(
      selectColorSystemInteractionStatesV1(input({ families: [short] })).diagnostics.counts
        .INSUFFICIENT_MEMBERS
    ).toBe(1);
    expect(
      selectColorSystemInteractionStatesV1(input({ onForegrounds: [] })).diagnostics.counts
        .NO_COMMON_FOREGROUND
    ).toBe(1);
  });

  it('does not assemble a state set across separate incomplete families', () => {
    const result = selectColorSystemInteractionStatesV1(
      input({
        families: [
          family('first', ['#333333', '#222222']),
          family('second', ['#555555', '#444444']),
        ],
      })
    );
    expect(result.status).toBe('infeasible');
    expect(result.diagnostics.evaluatedTriples).toBe(0);
    expect(result.diagnostics.counts.INSUFFICIENT_MEMBERS).toBe(2);
  });

  it('bounds exhaustive work and failure samples at the declared maximum', () => {
    const families = Array.from({ length: 24 }, (_, index) =>
      family(
        `family-${index}`,
        Array.from({ length: 12 }, () => '#444444'),
        0,
        1
      )
    );
    const result = selectColorSystemInteractionStatesV1(input({ families }));
    expect(result.status).toBe('infeasible');
    expect(result.diagnostics.evaluatedTriples).toBe(24 * 220);
    expect(result.diagnostics.counts.IDENTICAL_RENDERED_STATES).toBe(24 * 220);
    expect(result.diagnostics.failures).toHaveLength(
      COLOR_SYSTEM_INTERACTION_STATES_V1_LIMITS.maximumFailureSamples
    );
    expect(result.diagnostics.omittedFailureSamples).toBe(24 * 220 - 64);
  });
});

describe('interaction input boundaries', () => {
  it('accepts the exact identity/preference bounds and rejects values beyond them', () => {
    const limits = COLOR_SYSTEM_INTERACTION_STATES_V1_LIMITS;
    const atLimit = {
      ...family(),
      contributionId: 'x'.repeat(limits.maximumIdentityLength),
      preference: limits.maximumPreference,
    };
    expect(ready(input({ families: [atLimit] })).status).toBe('ready');
    for (const patch of [
      { contributionId: 'x'.repeat(limits.maximumIdentityLength + 1) },
      { preference: limits.maximumPreference + 1 },
      { preference: Number.NaN },
      { preference: -1 },
      { preference: 0.5 },
    ]) {
      expect(() =>
        selectColorSystemInteractionStatesV1(input({ families: [{ ...atLimit, ...patch }] }))
      ).toThrow(ColorSystemInteractionStatesV1Error);
    }
  });

  it.each([
    [
      'families',
      () => ({ families: Array.from({ length: 25 }, (_, index) => family(`family-${index}`)) }),
    ],
    [
      'members',
      () => ({
        families: [
          family(
            'large',
            Array.from({ length: 13 }, () => '#333333'),
            0,
            1
          ),
        ],
      }),
    ],
    [
      'surfaces',
      () => ({
        surfaces: Array.from({ length: 17 }, (_, index) =>
          source(`ground-${index}`, color('#FFFFFF'))
        ),
      }),
    ],
    [
      'foregrounds',
      () => ({
        onForegrounds: Array.from({ length: 33 }, (_, index) =>
          source(`label-${index}`, color('#FFFFFF'))
        ),
      }),
    ],
  ] as const)('rejects oversized %s before enumeration', (_name, overrides) => {
    expect(() => selectColorSystemInteractionStatesV1(input(overrides()))).toThrow(
      ColorSystemInteractionStatesV1Error
    );
  });

  it('rejects status reserves and members without explicit product-semantics eligibility', () => {
    expect(() =>
      selectColorSystemInteractionStatesV1(
        input({ families: [{ ...family(), contributionId: 'generic-status-reserve-information' }] })
      )
    ).toThrow(/Status reserves/);
    const wrong = family();
    expect(() =>
      selectColorSystemInteractionStatesV1(
        input({
          families: [
            {
              ...wrong,
              members: wrong.members.map(member => ({
                ...member,
                eligibleJob: 'categorical-data' as 'product-semantics',
              })),
            },
          ],
        })
      )
    ).toThrow(/product-semantics/);
  });

  it('rejects inconsistent references, duplicate steps, and conflicting exact values', () => {
    const candidate = family();
    for (const patch of [
      { ref: { ...candidate.members[0].ref, familyId: 'other' } },
      { ref: { ...candidate.members[0].ref, mode: 'Dark' } },
      { step: 10 },
    ]) {
      expect(() =>
        selectColorSystemInteractionStatesV1(
          input({
            families: [
              {
                ...candidate,
                members: [{ ...candidate.members[0], ...patch }, ...candidate.members.slice(1)],
              },
            ],
          })
        )
      ).toThrow(ColorSystemInteractionStatesV1Error);
    }
    const conflicting: ColorSystemInteractionColorV1 = {
      ref: { kind: 'approved-family-member', ref: candidate.members[0].ref },
      value: color('#FFFFFF'),
    };
    expect(() =>
      selectColorSystemInteractionStatesV1(input({ onForegrounds: [conflicting] }))
    ).toThrow(/conflicting values/);
  });

  it('rejects absent/translucent grounds, sparse arrays, unknown fields, and malformed exact colors', () => {
    expect(() => selectColorSystemInteractionStatesV1(input({ surfaces: [] }))).toThrow(
      /declared surface/
    );
    expect(() =>
      selectColorSystemInteractionStatesV1(
        input({ surfaces: [source('alpha-ground', color('#FFFFFF', 0.9))] })
      )
    ).toThrow(/opaque preserved/);
    expect(() => selectColorSystemInteractionStatesV1(input({ families: new Array(2) }))).toThrow(
      /missing entry/
    );
    expect(() =>
      selectColorSystemInteractionStatesV1({
        ...input(),
        ignored: true,
      } as ColorSystemInteractionStatesInputV1)
    ).toThrow(/unsupported shape/);
    const bad = { ...color('#FFFFFF'), components: { r: Number.NaN, g: 1, b: 1 } };
    expect(() =>
      selectColorSystemInteractionStatesV1(input({ surfaces: [source('bad', bad)] }))
    ).toThrow(ColorSystemInteractionStatesV1Error);
  });
});
