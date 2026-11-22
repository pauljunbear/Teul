import { describe, expect, it } from 'vitest';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemScopedRuleV1,
} from '../../../../src/lib/colorSystemModelV1';
import type { ColorSystemContextApplicationV1 } from '../../../../src/lib/colorSystemRelationshipsV1';
import { syntheticColorSystemModelInputV1 } from '../../../../src/lib/__tests__/fixtures/colorSystemModelV1Fixture';
import { scopedRefreshRules } from './refreshRuleScope';

const source = syntheticColorSystemModelInputV1();
const rule = (id: string) => source.rules.find(r => r.id === `rule:${id}`)!;
function reviewed(rules: readonly ColorSystemScopedRuleV1[], rejected = false) {
  const input = {
    ...source,
    rules,
    claims: source.claims.map(c => ({
      ...c,
      ruleIds: c.ruleIds.filter(id => rules.some(r => r.id === id)),
    })),
    adoptions: [],
  };
  return buildColorSystemModelV1({
    ...input,
    adoptions: buildColorSystemRuleAdoptionsV1(
      input,
      rules.map(r => ({
        ruleId: r.id,
        status: rejected ? 'rejected' : 'accepted',
        actor: { kind: 'user', ref: 'test:rule-scope' },
        authorityRef: 'fixture',
        decisionRef: r.id,
      }))
    ),
  });
}
const app = (
  colors: string[],
  pairs: ColorSystemContextApplicationV1['pairs'] = []
): ColorSystemContextApplicationV1 => ({
  id: 'test:application',
  contextId: 'communications',
  modeId: 'Day',
  uses: colors.map(colorId => ({ id: colorId, colorId, role: colorId, area: 10 })),
  pairs,
});
const pair = (left: string, right: string) => ({
  id: 'pair',
  foregroundUseId: left,
  backgroundUseId: right,
});
const ids = (
  model: ReturnType<typeof reviewed>,
  applications: ColorSystemContextApplicationV1[],
  actual = model
) =>
  scopedRefreshRules(model, 'communications', 'Day', {
    kind: 'applications',
    model: actual,
    applications,
  }).map(r => r.id);

describe('refresh rule scope', () => {
  it('uses actual pairs, direction, modes and every application rather than color intersection alone', () => {
    const model = reviewed([rule('forbidden')]);
    expect(ids(model, [app(['blue', 'warm'])])).toEqual([]);
    expect(ids(model, [app(['blue', 'warm'], [pair('warm', 'blue')])])).toEqual([]);
    expect(ids(model, [app(['blue', 'warm'], [pair('blue', 'warm')])])).toEqual(['rule:forbidden']);
    expect(ids(model, [app(['paper']), app(['blue', 'warm'], [pair('blue', 'warm')])])).toEqual([
      'rule:forbidden',
    ]);
    expect(
      ids(model, [
        { ...app(['blue', 'warm'], [pair('blue', 'warm')]), modeId: 'Night' },
        app(['paper']),
      ])
    ).toEqual([]);
    const coPresent = rule('forbidden');
    if (coPresent.kind !== 'forbidden-pair') throw new Error('fixture');
    const unordered = reviewed([
      { ...coPresent, operands: { ...coPresent.operands, ordered: false, relation: 'co-present' } },
    ]);
    expect(ids(unordered, [app(['blue', 'warm'])])).toEqual(['rule:forbidden']);
  });
  it('retains passing partner rules and honors explicit roles', () => {
    const base = rule('partner');
    if (base.kind !== 'required-partner') throw new Error('fixture');
    const model = reviewed([base]);
    expect(ids(model, [app(['paper', 'warm'])])).toEqual([]);
    expect(ids(model, [app(['blue', 'warm'])])).toEqual(['rule:partner']);
    const scoped = reviewed([{ ...base, operands: { ...base.operands, subjectRole: 'logo' } }]);
    expect(ids(scoped, [app(['blue', 'warm'])])).toEqual([]);
    const usedAsLogo = app(['blue', 'warm']);
    expect(
      ids(scoped, [
        {
          ...usedAsLogo,
          uses: usedAsLogo.uses.map(u => (u.colorId === 'blue' ? { ...u, role: 'logo' } : u)),
        },
      ])
    ).toEqual(['rule:partner']);
  });
  it('keeps palette, zero-count, missing prominence area and required absent roles binding', () => {
    const role = rule('role');
    if (role.kind !== 'role-binding') throw new Error('fixture');
    const required = { ...role, contextIds: ['communications'] };
    const count = rule('count');
    if (count.kind !== 'color-count') throw new Error('fixture');
    const model = reviewed([
      rule('palette'),
      { ...count, operands: { ...count.operands, members: [{ kind: 'color', id: 'blue' }] } },
      rule('prominence'),
      required,
    ]);
    const absent = { ...app(['ink']), uses: [{ id: 'ink', colorId: 'ink', role: 'background' }] };
    expect(ids(model, [absent])).toEqual([
      'rule:count',
      'rule:palette',
      'rule:prominence',
      'rule:role',
    ]);
    const optional = reviewed([
      { ...required, operands: { ...required.operands, presence: 'if-present' } },
    ]);
    expect(ids(optional, [absent])).toEqual([]);
  });
  it('does not infer irrelevance from absent usage or a missing assessment', () => {
    const model = reviewed([rule('partner')]);
    expect(ids(model, [])).toEqual(['rule:partner']);
    expect(ids(model, [app(['paper'])], reviewed([]))).toEqual(['rule:partner']);
    expect(scopedRefreshRules(model, 'communications', 'Day').map(r => r.id)).toEqual([
      'rule:partner',
    ]);
  });
  it('limits standalone scale exclusions to fully disjoint relationships', () => {
    const base = rule('partner');
    if (base.kind !== 'required-partner') throw new Error('fixture');
    const disjoint = {
      ...base,
      operands: {
        subject: [{ kind: 'color' as const, id: 'paper' }],
        partner: [{ kind: 'color' as const, id: 'ink' }],
      },
    };
    const model = reviewed([disjoint, rule('count'), rule('prominence')]);
    const scope = { kind: 'scale' as const, model, scaleId: 'blue-scale' };
    expect(scopedRefreshRules(model, 'communications', 'Day', scope).map(r => r.id)).toEqual([
      'rule:count',
      'rule:prominence',
    ]);
    for (const selector of [
      { kind: 'family', id: 'pigments' },
      { kind: 'scale', id: 'blue-scale' },
      { kind: 'color', id: 'blue' },
    ] as const) {
      const relevant = reviewed([
        { ...base, operands: { ...disjoint.operands, subject: [selector] } },
      ]);
      expect(
        scopedRefreshRules(relevant, 'communications', 'Day', { ...scope, model: relevant })
      ).toHaveLength(1);
    }
    expect(() =>
      scopedRefreshRules(model, 'communications', 'Day', { ...scope, scaleId: 'missing' })
    ).toThrow('missing');
  });
  it('ignores only gradient rules already non-governing under the existing gate', () => {
    const permission = rule('allowed'),
      requirement = rule('partner'),
      palette = rule('palette');
    const model = reviewed([permission, { ...requirement, force: 'example' }, palette]);
    expect(
      scopedRefreshRules(model, 'communications', 'Day', { kind: 'gradient' }).map(r => r.id)
    ).toEqual(['rule:palette']);
    const rejected = reviewed([requirement, palette], true);
    expect(
      scopedRefreshRules(rejected, 'communications', 'Day', { kind: 'gradient' }).map(r => r.id)
    ).toEqual(['rule:palette']);
    expect(
      scopedRefreshRules(reviewed([requirement]), 'communications', 'Day', { kind: 'gradient' })
    ).toHaveLength(1);
  });
});
