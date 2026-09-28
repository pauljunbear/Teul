import { describe, expect, it, vi } from 'vitest';
import {
  COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS,
  enumerateColorSystemAuthoredInteractionStatesV1,
  selectColorSystemAuthoredInteractionStatesV1,
  type ColorSystemAuthoredInteractionScaleV1,
  type ColorSystemAuthoredInteractionSelectionV1,
  type ColorSystemAuthoredInteractionStatesInputV1,
} from '../colorSystemInteractionStatesV1';
import { canonicalJson } from '../colorSystemHashing';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import { compareText } from '../utils';

const immediate = { isCancelled: () => false, yield: async () => undefined };
const gray = (channel: number, alpha = 1) =>
  buildColorSystemSrgbValueV1({ r: channel, g: channel, b: channel }, alpha);
const color = (id: string, channel: number, alpha = 1) => ({
  ref: { kind: 'preserved-source-color' as const, stableColorId: id, mode: 'Day' },
  value: gray(channel, alpha),
});
function scale(id = 'ink', count = 5): ColorSystemAuthoredInteractionScaleV1 {
  return {
    scaleId: id,
    familyId: 'ink-family',
    contributionId: `proposal:${id}`,
    preference: 0,
    stateOrder: 'ascending',
    preferredPositions: { rest: 0, hover: 17, pressed: 34 },
    members: Array.from({ length: count }, (_, index) => ({
      ref: { familyId: 'ink-family', memberId: `${id}:${index}`, mode: 'Day' },
      position: index * 17,
      value: gray(0.12 + index * 0.001),
      eligibleJob: 'product-semantics',
    })),
  };
}
function input(): ColorSystemAuthoredInteractionStatesInputV1 {
  return {
    role: 'selected',
    mode: 'Day',
    scales: [scale()],
    surfaces: [color('paper', 1), color('warm-paper', 0.94)],
    onForegrounds: [color('z-strong', 1), color('a-passing', 0.85), color('dark', 0)],
  };
}
function positions(selection: ColorSystemAuthoredInteractionSelectionV1) {
  return Object.values(selection.states).map(member => member.position);
}
async function enumerate(value = input(), maximum = 64) {
  const result = await enumerateColorSystemAuthoredInteractionStatesV1(value, maximum, immediate);
  if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
  return result;
}

/** Exhaustively call the existing single selector on each isolated assignment, then order its results. */
async function isolatedOracle(value: ColorSystemAuthoredInteractionStatesInputV1) {
  const admitted: {
    rank: number[];
    identity: string;
    selection: ColorSystemAuthoredInteractionSelectionV1;
  }[] = [];
  for (const rail of value.scales) {
    const members = [...rail.members].sort((a, b) =>
      rail.stateOrder === 'ascending' ? a.position - b.position : b.position - a.position
    );
    for (let a = 0; a < members.length - 2; a++)
      for (let b = a + 1; b < members.length - 1; b++)
        for (let c = b + 1; c < members.length; c++) {
          const triple = [members[a], members[b], members[c]],
            states = ['rest', 'hover', 'pressed'] as const;
          if (
            states.some(
              (state, i) =>
                rail.lockedPositions?.[state] !== undefined &&
                rail.lockedPositions[state] !== triple[i].position
            )
          )
            continue;
          for (const foreground of value.role === 'link' ? [null] : value.onForegrounds) {
            const result = await selectColorSystemAuthoredInteractionStatesV1(
              {
                ...value,
                scales: [{ ...rail, members: triple }],
                onForegrounds: foreground ? [foreground] : [],
              },
              immediate
            );
            if (result.status !== 'ready') continue;
            const direction = rail.stateOrder === 'descending' ? 1 : -1;
            admitted.push({
              rank: [
                rail.preference,
                ...states.map((state, i) =>
                  Math.abs(triple[i].position - rail.preferredPositions[state])
                ),
                ...triple.map(member => direction * member.position),
              ],
              identity: canonicalJson({
                familyId: rail.familyId,
                scaleId: rail.scaleId,
                members: triple.map(member => member.ref),
                foreground: foreground?.ref ?? null,
              }),
              selection: result.selection,
            });
          }
        }
  }
  admitted.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i++)
      if (a.rank[i] !== b.rank[i]) return a.rank[i] < b.rank[i] ? -1 : 1;
    return compareText(a.identity, b.identity);
  });
  return admitted.map(item => item.selection);
}

describe('authored coherent interaction enumeration', () => {
  it('retains all passing label choices and counts assignments separately from feasible triples', async () => {
    const value = input(),
      result = await enumerate(value),
      single = await selectColorSystemAuthoredInteractionStatesV1(value, immediate);
    expect(result.status).toBe('ready');
    expect(result.totalEligibleSelections).toBe(20);
    expect(result.selections).toHaveLength(20);
    expect(result).toMatchObject({ complete: true, truncated: false });
    expect(result.diagnostics.feasibleTriples).toBe(10);
    if (single.status !== 'ready') throw new Error('Expected single selection');
    expect(result.diagnostics).toEqual(single.diagnostics);
    expect(single.selection.onForeground?.ref).toEqual(color('z-strong', 1).ref);
    expect(result.selections[0].onForeground?.ref).toEqual(color('a-passing', 0.85).ref);
    expect(result.selections[1]).toEqual(single.selection);
    for (const selection of result.selections) {
      expect(selection.pairs).toHaveLength(12);
      expect(selection.pairs.every(pair => pair.ratio >= pair.minimumRatio)).toBe(true);
      expect(selection.distinction.every(pair => pair.deltaEOK > 0)).toBe(true);
    }
    const prefix = await enumerate(value, 1);
    expect(prefix.selections).toEqual(result.selections.slice(0, 1));
    expect(prefix).toMatchObject({ totalEligibleSelections: 20, complete: false, truncated: true });
  });

  it('matches isolated exhaustive selection across related scales, locks, direction and rank ties', async () => {
    const value: ColorSystemAuthoredInteractionStatesInputV1 = {
      ...input(),
      scales: [
        { ...scale('z'), lockedPositions: { rest: 0 } },
        {
          ...scale('a'),
          stateOrder: 'descending',
          preferredPositions: { rest: 68, hover: 40, pressed: 0 },
          lockedPositions: { pressed: 0 },
        },
        { ...scale('later', 4), preference: 1 },
        { ...scale('incomplete', 2), preference: 0 },
      ],
    };
    const oracle = await isolatedOracle(value),
      result = await enumerate(value, 7);
    expect(result.selections).toEqual(oracle.slice(0, 7));
    expect(result.totalEligibleSelections).toBe(oracle.length);
    expect(result.diagnostics.lockRejectedTriples).toBe(8);
    expect(result.diagnostics.failures).toContainEqual(
      expect.objectContaining({ scaleId: 'incomplete', code: 'INSUFFICIENT_MEMBERS' })
    );
    const permuted = await enumerate(
      {
        ...value,
        scales: [...value.scales]
          .reverse()
          .map(rail => ({ ...rail, members: [...rail.members].reverse() })),
        onForegrounds: [...value.onForegrounds].reverse(),
      },
      7
    );
    expect(permuted.selections).toEqual(result.selections);
    expect(permuted.totalEligibleSelections).toBe(result.totalEligibleSelections);
    expect(result.diagnostics.scales.map(rail => rail.scaleId)).toEqual(
      value.scales.map(rail => rail.scaleId)
    );
  });

  it('counts each link triple once without labels and requires the link contrast threshold', async () => {
    const value: ColorSystemAuthoredInteractionStatesInputV1 = {
      ...input(),
      role: 'link',
      onForegrounds: [],
    };
    const result = await enumerate(value);
    expect(result.selections).toEqual(await isolatedOracle(value));
    expect(result.totalEligibleSelections).toBe(10);
    expect(
      result.selections.every(
        selection =>
          selection.onForeground === null &&
          selection.pairs.every(pair => pair.kind === 'link-text' && pair.minimumRatio === 4.5)
      )
    ).toBe(true);
    const weak = {
      ...scale('weak', 3),
      members: scale('weak', 3).members.map((member, i) => ({
        ...member,
        value: gray(0.5 + i * 0.01),
      })),
    };
    expect((await enumerate({ ...value, scales: [weak] })).status).toBe('infeasible');
  });

  it('reports complete infeasibility without joining separate incomplete scales or incompatible grounds', async () => {
    for (const value of [
      { ...input(), scales: [] },
      { ...input(), scales: [scale('one', 2), scale('two', 2)] },
      { ...input(), onForegrounds: [] },
      { ...input(), surfaces: [...input().surfaces, color('dark-ground', 0.12)] },
      {
        ...input(),
        scales: [
          {
            ...scale('same', 3),
            members: scale('same', 3).members.map(member => ({ ...member, value: gray(0.12) })),
          },
        ],
      },
    ]) {
      const result = await enumerate(value);
      expect(result).toMatchObject({
        status: 'infeasible',
        selections: [],
        totalEligibleSelections: 0,
        truncated: false,
        complete: true,
      });
    }
  });

  it('keeps native states sharing a display hex and measures translucent choices on every ground', async () => {
    const rail = scale('fractional', 3),
      value = {
        ...input(),
        scales: [
          {
            ...rail,
            members: rail.members.map((member, i) => ({
              ...member,
              value: gray((30 + i * 0.001) / 255, 0.95),
            })),
          },
        ],
        onForegrounds: [color('label', 1, 0.8), color('weak', 1, 0.1)],
      };
    const result = await enumerate(value);
    expect(result.totalEligibleSelections).toBe(1);
    expect(result.selections[0]).toEqual((await isolatedOracle(value))[0]);
    expect(
      new Set(Object.values(result.selections[0].states).map(member => member.value.hex)).size
    ).toBe(1);
    expect(result.selections[0].pairs.some(pair => pair.renderedForeground.r !== 255 * 0.8)).toBe(
      true
    );
  });

  it('scans all 64 members and 32 feasible foregrounds while retaining at most 64 choices', async () => {
    const value = {
        ...input(),
        scales: [scale('wide', 64)],
        onForegrounds: Array.from({ length: 32 }, (_, i) => color(`label:${i}`, 1)),
      },
      result = await enumerate(value, 64);
    expect(result.diagnostics.evaluatedTriples).toBe(41664);
    expect(result.diagnostics.feasibleTriples).toBe(41664);
    expect(result.totalEligibleSelections).toBe(41664 * 32);
    expect(result.selections).toHaveLength(64);
    expect(result).toMatchObject({ complete: false, truncated: true });
    expect(positions(result.selections[0])).toEqual([0, 17, 34]);
    expect(new Set(result.selections.map(selection => canonicalJson(selection))).size).toBe(64);
    expect(COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS.maximumSelections).toBe(64);
  });

  it('detaches before hooks and does not let returned mutation affect replay', async () => {
    const value = input(),
      expected = await enumerate(value, 4);
    const result = await enumerateColorSystemAuthoredInteractionStatesV1(value, 4, {
      isCancelled: () => false,
      yield: async () => {
        Object.assign(value.scales[0].preferredPositions, { rest: 999 });
        Object.assign(value.scales[0].members[0].value.components, { r: 1 });
        Object.assign(value.onForegrounds[0].value.components, { g: 0 });
      },
    });
    expect(result).toEqual(expected);
    if (result.status === 'cancelled') throw new Error('Unexpected cancellation');
    Object.assign(result.selections[0].states.rest.value.components, { r: 0.9 });
    expect(await enumerate(input(), 4)).toEqual(expected);
  });

  it.each(['before', 'cache', 'choices', 'triples'] as const)(
    'cancels during %s without exposing partial results',
    async stage => {
      const value: ColorSystemAuthoredInteractionStatesInputV1 = {
        ...input(),
        scales: Array.from({ length: 24 }, (_, i) => ({
          ...scale(`wide:${i}`, 64),
          ...(stage === 'choices'
            ? { preferredPositions: { rest: 61 * 17, hover: 62 * 17, pressed: 63 * 17 } }
            : {}),
        })),
        surfaces:
          stage === 'cache'
            ? Array.from({ length: 16 }, (_, i) => color(`ground:${i}`, 1))
            : input().surfaces,
        onForegrounds:
          stage === 'triples' ? [] : Array.from({ length: 32 }, (_, i) => color(`label:${i}`, 1)),
      };
      let ticks = 0;
      const yieldWork = vi.fn(async () => {
        ticks++;
      });
      const result = await enumerateColorSystemAuthoredInteractionStatesV1(value, 64, {
        isCancelled: () => stage === 'before' || ticks >= (stage === 'choices' ? 7 : 3),
        yield: yieldWork,
      });
      expect(result).toEqual({
        policyVersion: 'teul-authored-interaction-states/v1',
        role: 'selected',
        mode: 'Day',
        status: 'cancelled',
        selections: [],
        totalEligibleSelections: null,
        truncated: false,
        complete: false,
      });
      expect(yieldWork).toHaveBeenCalledTimes(stage === 'before' ? 0 : stage === 'choices' ? 7 : 3);
    }
  );

  it('checks cancellation after the last kernel chunk before publishing results', async () => {
    let checks = 0;
    const result = await enumerateColorSystemAuthoredInteractionStatesV1(
      { ...input(), scales: [scale('small', 3)] },
      64,
      {
        isCancelled: () => ++checks === 5,
        yield: async () => undefined,
      }
    );
    expect(result.status).toBe('cancelled');
    expect(result.selections).toEqual([]);
    expect(result.totalEligibleSelections).toBeNull();
  });

  it.each([0, 65, -1, 1.5, NaN, Infinity, '3', { valueOf: () => 3 }])(
    'rejects cap %j before execution hooks',
    async cap => {
      const execution = { isCancelled: vi.fn(() => false), yield: vi.fn(async () => undefined) };
      await expect(
        enumerateColorSystemAuthoredInteractionStatesV1(input(), cap as number, execution)
      ).rejects.toThrow(/Maximum selections/);
      expect(execution.isCancelled).not.toHaveBeenCalled();
      expect(execution.yield).not.toHaveBeenCalled();
    }
  );

  it('reuses strict inert input validation before any hook or executable field', async () => {
    const value = input(),
      getter = vi.fn(() => 0),
      execution = { isCancelled: vi.fn(() => false), yield: vi.fn(async () => undefined) };
    Object.defineProperty(value.scales[0].members[0].value.components, 'r', {
      enumerable: true,
      get: getter,
    });
    await expect(
      enumerateColorSystemAuthoredInteractionStatesV1(value, 64, execution)
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(execution.isCancelled).not.toHaveBeenCalled();
    expect(execution.yield).not.toHaveBeenCalled();
  });
});
