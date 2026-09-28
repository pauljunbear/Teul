import { describe, expect, it, vi } from 'vitest';
import {
  COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS,
  selectColorSystemAuthoredInteractionStatesV1,
  selectColorSystemInteractionStatesV1,
  type ColorSystemAuthoredInteractionStatesInputV1,
  type ColorSystemAuthoredInteractionScaleV1,
  type ColorSystemInteractionStatesInputV1,
} from '../colorSystemInteractionStatesV1';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};
const immediate = { isCancelled: () => false, yield: async () => undefined };
const gray = (channel: number, alpha = 1) =>
  buildColorSystemSrgbValueV1({ r: channel, g: channel, b: channel }, alpha);
const source = (id: string, channel: number) => ({
  ref: { kind: 'preserved-source-color' as const, stableColorId: id, mode: 'Day' },
  value: gray(channel),
});
function scale(
  scaleId = 'ink-rail',
  positions = [0, 17, 50, 101, Number.MAX_SAFE_INTEGER]
): Mutable<ColorSystemAuthoredInteractionScaleV1> {
  return {
    familyId: 'ink-family',
    scaleId,
    contributionId: `proposal:${scaleId}`,
    preference: 0,
    stateOrder: 'ascending',
    preferredPositions: { rest: positions[0], hover: positions[1], pressed: positions[2] },
    members: positions.map((position, index) => ({
      ref: { familyId: 'ink-family', memberId: `${scaleId}:${index}`, mode: 'Day' },
      position,
      value: gray(0.12 + index * 0.004),
      eligibleJob: 'product-semantics',
    })),
  };
}
function input(): Mutable<ColorSystemAuthoredInteractionStatesInputV1> {
  return {
    role: 'selected',
    mode: 'Day',
    scales: [scale()],
    surfaces: [source('paper', 1), source('off-paper', 0.94)],
    onForegrounds: [source('light-label', 1), source('dark-label', 0)],
  };
}
async function ready(value = input()) {
  const result = await selectColorSystemAuthoredInteractionStatesV1(value, immediate);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Expected ready');
  return result;
}

describe('authored interaction states', () => {
  it('uses explicit nonuniform safe-integer positions without legacy step defaults', async () => {
    const value = input();
    value.scales[0].preferredPositions = { rest: 0, hover: 101, pressed: Number.MAX_SAFE_INTEGER };
    const result = await ready(value);
    expect(Object.values(result.selection.states).map(m => m.position)).toEqual([
      0,
      101,
      Number.MAX_SAFE_INTEGER,
    ]);
    expect(result.selection.scaleId).toBe('ink-rail');
    expect(result.selection.familyId).toBe('ink-family');
    expect(result.selection.pairs).toHaveLength(12);
    expect(result.selection.pairs.every(pair => pair.ratio >= pair.minimumRatio)).toBe(true);
    expect(result.selection.distinction.every(pair => pair.deltaEOK > 0)).toBe(true);
    expect(result.diagnostics.evaluatedTriples).toBe(10);
    expect('step' in result.selection.states.rest).toBe(false);
    expect('families' in result.diagnostics).toBe(false);
    expect(result.selection.states.pressed.value).toEqual(value.scales[0].members[4].value);
  });

  it('honors descending order and missing preferred coordinates deterministically', async () => {
    const value = input();
    value.scales[0].stateOrder = 'descending';
    value.scales[0].preferredPositions = { rest: Number.MAX_SAFE_INTEGER, hover: 100, pressed: 16 };
    const result = await ready(value);
    expect(Object.values(result.selection.states).map(m => m.position)).toEqual([
      Number.MAX_SAFE_INTEGER,
      101,
      17,
    ]);
    value.scales[0].members.reverse();
    expect(await ready(value)).toEqual(result);
  });

  it('retains an exact locked default while choosing the other authored states', async () => {
    const value = input();
    value.scales[0].preferredPositions = { rest: 17, hover: 50, pressed: 101 };
    value.scales[0].lockedPositions = { rest: 0 };
    const result = await ready(value);
    expect(Object.values(result.selection.states).map(member => member.position)).toEqual([
      0, 50, 101,
    ]);
    expect(result.selection.states.rest.value).toEqual(value.scales[0].members[0].value);
    expect(result.selection.states.rest.ref).toEqual(value.scales[0].members[0].ref);
    expect(result.diagnostics.lockRejectedTriples).toBe(4);
    expect(result.diagnostics.scales[0].lockRejectedTriples).toBe(4);
    expect(result.diagnostics.evaluatedTriples).toBe(10);
    expect(result.diagnostics.feasibleTriples).toBe(6);
  });

  it('does not substitute a passing nearby member for an infeasible locked rest', async () => {
    const value = input();
    value.scales[0].members[0].value = gray(0.9);
    expect((await ready(value)).selection.states.rest.position).toBe(17);
    value.scales[0].lockedPositions = { rest: 0 };
    const result = await selectColorSystemAuthoredInteractionStatesV1(value, immediate);
    expect(result.status).toBe('infeasible');
    if (result.status !== 'infeasible') throw new Error('Expected infeasible');
    expect(result.selection).toBeNull();
    expect(result.diagnostics.lockRejectedTriples).toBe(4);
    expect(result.diagnostics.counts.SURFACE_CONTRAST).toBe(6);
    expect(result.diagnostics.feasibleTriples).toBe(0);
  });

  it('honors partial descending locks and detaches them before yielding', async () => {
    const value = input();
    value.scales[0].stateOrder = 'descending';
    value.scales[0].preferredPositions = { rest: 101, hover: 50, pressed: 17 };
    value.scales[0].lockedPositions = { rest: Number.MAX_SAFE_INTEGER, pressed: 0 };
    const expected = await ready(value);
    const result = await selectColorSystemAuthoredInteractionStatesV1(value, {
      isCancelled: () => false,
      yield: async () => {
        const locks = value.scales[0].lockedPositions as { rest: number; pressed: number };
        locks.rest = 17;
        locks.pressed = 101;
      },
    });
    expect(result).toEqual(expected);
    expect(Object.values(expected.selection.states).map(member => member.position)).toEqual([
      Number.MAX_SAFE_INTEGER,
      50,
      0,
    ]);
  });

  it.each([
    { rest: 18 },
    { rest: 50, pressed: 17 },
    { rest: 17, hover: 17 },
    { hover: -1 },
    { pressed: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects missing or inconsistent authored locks %j', async locks => {
    const value = input();
    value.scales[0].lockedPositions = locks;
    await expect(selectColorSystemAuthoredInteractionStatesV1(value, immediate)).rejects.toThrow(
      /Locked/
    );
  });

  it('rejects executable lock fields without invoking them', async () => {
    const value = input(),
      getter = vi.fn(() => 0);
    value.scales[0].lockedPositions = Object.defineProperty({}, 'rest', {
      enumerable: true,
      get: getter,
    });
    await expect(selectColorSystemAuthoredInteractionStatesV1(value, immediate)).rejects.toThrow(
      /accessor/
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it('keeps related scales separate while ranking feasible choices before preferences', async () => {
    const value = input();
    const short = scale('short', [0, 1, 2]);
    short.members.pop();
    const complete = scale('complete');
    complete.preference = 1;
    value.scales = [short, complete];
    const result = await ready(value);
    expect(result.selection.scaleId).toBe('complete');
    expect(result.diagnostics.scales.map(s => [s.familyId, s.scaleId])).toEqual([
      ['ink-family', 'short'],
      ['ink-family', 'complete'],
    ]);
    expect(result.diagnostics.failures[0]).toMatchObject({
      scaleId: 'short',
      code: 'INSUFFICIENT_MEMBERS',
    });
    complete.members = complete.members.slice(0, 2);
    const impossible = await selectColorSystemAuthoredInteractionStatesV1(value, immediate);
    expect(impossible.status).toBe('infeasible');
    if (impossible.status !== 'infeasible') throw new Error('Expected infeasible');
    expect(impossible.diagnostics.evaluatedTriples).toBe(0);
  });

  it('breaks scale and foreground ties by identity while preserving display order', async () => {
    const value = input();
    value.scales = [scale('z'), scale('a')];
    value.onForegrounds = [source('z-label', 1), source('a-label', 1)];
    const first = await ready(value);
    expect(first.selection.scaleId).toBe('a');
    expect(first.selection.onForeground?.ref).toEqual(source('a-label', 1).ref);
    value.scales.reverse();
    value.onForegrounds.reverse();
    expect((await ready(value)).selection).toEqual(first.selection);
    expect(first.diagnostics.scales.map(s => s.scaleId)).toEqual(['z', 'a']);
  });

  it('retains proposed surface references without labeling them preserved source', async () => {
    const value = input();
    const surface = {
      ref: {
        kind: 'approved-family-member' as const,
        ref: { familyId: 'grounds', memberId: 'proposal:ground', mode: 'Day' },
      },
      value: gray(1),
    };
    value.surfaces = [surface];
    const result = await ready(value);
    expect(
      result.selection.pairs.every(
        pair => JSON.stringify(pair.surface) === JSON.stringify(surface.ref)
      )
    ).toBe(true);
    expect(result.selection.pairs[0].background).toEqual(surface.ref);
    expect(result.selection.distinction[0].surface).toEqual(surface.ref);
  });

  it('shares exact pair math and complete gates with the legacy selector', async () => {
    const value = input();
    value.scales = [scale('rail', [9, 10, 11])];
    const legacy: ColorSystemInteractionStatesInputV1 = {
      role: value.role,
      mode: value.mode,
      families: value.scales.map(
        ({
          scaleId: _scaleId,
          stateOrder: _stateOrder,
          preferredPositions: _preferences,
          lockedPositions: _locks,
          members,
          ...family
        }) => ({
          ...family,
          members: members.map(({ position, ...member }) => ({ ...member, step: position })),
        })
      ),
      surfaces: value.surfaces as ColorSystemInteractionStatesInputV1['surfaces'],
      onForegrounds: value.onForegrounds,
    };
    const old = selectColorSystemInteractionStatesV1(legacy),
      authored = await ready(value);
    if (old.status !== 'ready') throw new Error('Expected ready');
    expect(authored.selection.pairs).toEqual(old.selection.pairs);
    expect(authored.selection.distinction).toEqual(old.selection.distinction);
    expect(authored.selection.onForeground).toEqual(old.selection.onForeground);
    value.role = 'link';
    value.onForegrounds = [];
    const link = await ready(value);
    expect(link.selection.onForeground).toBeNull();
    expect(
      link.selection.pairs.every(pair => pair.kind === 'link-text' && pair.minimumRatio === 4.5)
    ).toBe(true);
  });

  it('requires all surfaces, common labels and distinct rendered states', async () => {
    const noLabel = input();
    noLabel.onForegrounds = [];
    const first = await selectColorSystemAuthoredInteractionStatesV1(noLabel, immediate);
    expect(first.status).toBe('infeasible');
    if (first.status !== 'infeasible') throw new Error('Expected infeasible');
    expect(first.diagnostics.counts.NO_COMMON_FOREGROUND).toBeGreaterThan(0);
    const badGround = input();
    badGround.surfaces.push(source('dark-ground', 0.12));
    const second = await selectColorSystemAuthoredInteractionStatesV1(badGround, immediate);
    expect(second.status).toBe('infeasible');
    if (second.status !== 'infeasible') throw new Error('Expected infeasible');
    expect(second.diagnostics.failures.some(f => f.code === 'SURFACE_CONTRAST')).toBe(true);
    const same = input();
    same.scales = [scale('same', [0, 1, 2])];
    same.surfaces = [source('paper', 1)];
    same.scales[0].members[0].value = gray(0.5);
    same.scales[0].members[1].value = gray(0, 0.5);
    const third = await selectColorSystemAuthoredInteractionStatesV1(same, immediate);
    expect(third.status).toBe('infeasible');
    if (third.status !== 'infeasible') throw new Error('Expected infeasible');
    expect(third.diagnostics.counts.IDENTICAL_RENDERED_STATES).toBe(1);
  });

  it('detaches native values and preferences before caller-controlled yielding', async () => {
    const baselineInput = input(),
      expected = await ready(baselineInput),
      value = input();
    const result = await selectColorSystemAuthoredInteractionStatesV1(value, {
      isCancelled: () => false,
      yield: async () => {
        value.scales[0].members[0].value.components.r = 1;
        value.scales[0].members[0].position = 999;
        value.scales[0].preferredPositions.rest = 500;
        value.surfaces[0].value.components.g = 0;
      },
    });
    expect(result).toEqual(expected);
    if (result.status !== 'ready') throw new Error('Expected ready');
    (result.selection.states.rest.value.components as { r: number }).r = 0;
    expect(await ready(baselineInput)).toEqual(expected);
  });

  it('handles all 64 members with bounded diagnostics and rejects 65 without changing legacy bounds', async () => {
    const value = input();
    value.scales = [
      scale(
        'wide',
        Array.from({ length: 64 }, (_, i) => i * 17)
      ),
    ];
    const result = await ready(value);
    expect(result.diagnostics.evaluatedTriples).toBe(41664);
    expect(result.diagnostics.failures.length).toBeLessThanOrEqual(64);
    value.scales[0].members.push({ ...value.scales[0].members[0], position: 9999 });
    await expect(selectColorSystemAuthoredInteractionStatesV1(value, immediate)).rejects.toThrow(
      /bounded/
    );
    expect(COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS.maximumMembersPerScale).toBe(64);
    const legacy = {
      role: 'selected',
      mode: 'Day',
      families: [
        {
          familyId: 'x',
          contributionId: 'x',
          preference: 0,
          members: Array.from({ length: 13 }, (_, i) => ({
            ref: { familyId: 'x', memberId: `${i}`, mode: 'Day' },
            value: gray(0.1),
            eligibleJob: 'product-semantics',
            step: i + 1,
          })),
        },
      ],
      surfaces: [source('paper', 1)],
      onForegrounds: [],
    };
    expect(() =>
      selectColorSystemInteractionStatesV1(legacy as ColorSystemInteractionStatesInputV1)
    ).toThrow(/array bound/);
  });

  it.each(['before', 'cache', 'triples'] as const)(
    'cancels %s without partial output',
    async stage => {
      const value = input();
      value.scales = [
        scale(
          'wide',
          Array.from({ length: 64 }, (_, i) => i)
        ),
      ];
      if (stage === 'cache') {
        value.surfaces = Array.from({ length: 16 }, (_, i) => source(`ground:${i}`, 1));
        value.onForegrounds = Array.from({ length: 32 }, (_, i) => source(`label:${i}`, 1));
      }
      let ticks = 0;
      const yieldWork = vi.fn(async () => {
        ticks++;
      });
      const result = await selectColorSystemAuthoredInteractionStatesV1(value, {
        isCancelled: () => stage === 'before' || ticks >= 3,
        yield: yieldWork,
      });
      expect(result).toEqual({
        policyVersion: 'teul-authored-interaction-states/v1',
        role: 'selected',
        mode: 'Day',
        status: 'cancelled',
      });
      expect(yieldWork).toHaveBeenCalledTimes(stage === 'before' ? 0 : 3);
    }
  );
});

describe('authored state input boundaries', () => {
  it.each([
    [
      'fractional position',
      (v: ReturnType<typeof input>) => {
        v.scales[0].members[0].position = 0.5;
      },
    ],
    [
      'negative position',
      (v: ReturnType<typeof input>) => {
        v.scales[0].members[0].position = -1;
      },
    ],
    [
      'unsafe position',
      (v: ReturnType<typeof input>) => {
        v.scales[0].members[0].position = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'duplicate position',
      (v: ReturnType<typeof input>) => {
        v.scales[0].members[0].position = 17;
      },
    ],
    [
      'unordered preference',
      (v: ReturnType<typeof input>) => {
        v.scales[0].preferredPositions.hover = 0;
      },
    ],
    [
      'missing preference',
      (v: ReturnType<typeof input>) => {
        delete (v.scales[0] as Partial<(typeof v.scales)[0]>).preferredPositions;
      },
    ],
    [
      'duplicate scale',
      (v: ReturnType<typeof input>) => {
        v.scales.push(v.scales[0]);
      },
    ],
    [
      'wrong mode',
      (v: ReturnType<typeof input>) => {
        v.scales[0].members[0].ref.mode = 'Night';
      },
    ],
    [
      'status reserve',
      (v: ReturnType<typeof input>) => {
        v.scales[0].contributionId = 'generic-status-reserve-information';
      },
    ],
    [
      'translucent ground',
      (v: ReturnType<typeof input>) => {
        v.surfaces[0].value = gray(1, 0.9);
      },
    ],
    [
      'too many scales',
      (v: ReturnType<typeof input>) => {
        v.scales = Array.from({ length: 25 }, (_, i) => scale(`rail:${i}`));
      },
    ],
  ] as const)('rejects %s', async (_label, mutate) => {
    const value = input();
    mutate(value);
    await expect(selectColorSystemAuthoredInteractionStatesV1(value, immediate)).rejects.toThrow();
  });

  it('rejects conflicting source or proposed reference values across all uses', async () => {
    const value = input();
    value.onForegrounds.push({
      ref: { kind: 'approved-family-member', ref: value.scales[0].members[0].ref },
      value: gray(1),
    });
    await expect(selectColorSystemAuthoredInteractionStatesV1(value, immediate)).rejects.toThrow(
      /conflicting/
    );
  });

  it('rejects accessors and executable values at each read boundary without calling them', async () => {
    const getter = vi.fn(() => 0),
      coerce = vi.fn(() => '#FFFFFF');
    const paths = [
      (v: ReturnType<typeof input>) =>
        Object.defineProperty(v, 'role', { enumerable: true, get: getter }),
      (v: ReturnType<typeof input>) =>
        Object.defineProperty(v.scales, '0', { enumerable: true, get: getter }),
      (v: ReturnType<typeof input>) =>
        Object.defineProperty(v.scales[0].preferredPositions, 'rest', {
          enumerable: true,
          get: getter,
        }),
      (v: ReturnType<typeof input>) =>
        Object.defineProperty(v.scales[0].members[0].ref, 'mode', {
          enumerable: true,
          get: getter,
        }),
      (v: ReturnType<typeof input>) =>
        Object.defineProperty(v.scales[0].members[0].value.components, 'r', {
          enumerable: true,
          get: getter,
        }),
      (v: ReturnType<typeof input>) =>
        Object.defineProperty(v.scales[0].members[0].value, 'hex', { value: { toString: coerce } }),
    ];
    for (const mutate of paths) {
      const value = input();
      mutate(value);
      await expect(
        selectColorSystemAuthoredInteractionStatesV1(value, immediate)
      ).rejects.toThrow();
    }
    expect(getter).not.toHaveBeenCalled();
    expect(coerce).not.toHaveBeenCalled();
  });

  it('rejects sparse, subclassed and decorated arrays, hostile objects, and unknown fields', async () => {
    const mutations = [
      (v: ReturnType<typeof input>) => {
        delete v.scales[0];
      },
      (v: ReturnType<typeof input>) => {
        Object.setPrototypeOf(v.scales, Object.create(Array.prototype));
      },
      (v: ReturnType<typeof input>) => {
        Object.defineProperty(v.scales, 'map', { value: () => [] });
      },
      (v: ReturnType<typeof input>) => {
        Object.setPrototypeOf(v.scales[0].members[0].value.components, { r: 0 });
      },
      (v: ReturnType<typeof input>) => {
        Object.defineProperty(v.scales[0], 'ignored', { value: true });
      },
      (v: ReturnType<typeof input>) => {
        Object.defineProperty(v, Symbol('hidden'), { value: true });
      },
    ];
    for (const mutate of mutations) {
      const value = input();
      mutate(value);
      await expect(
        selectColorSystemAuthoredInteractionStatesV1(value, immediate)
      ).rejects.toThrow();
    }
  });
});
