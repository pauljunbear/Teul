import { describe, expect, it, vi } from 'vitest';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemClaimV1,
  type ColorSystemModelInputV1,
  type ColorSystemScopedRuleV1,
} from '../colorSystemModelV1';
import {
  buildColorSystemContextApplicationV1,
  compileColorSystemRelationshipsV1,
  type ColorSystemContextApplicationV1,
} from '../colorSystemRelationshipsV1';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;
const copy = <T>(value: T): Mutable<T> => JSON.parse(JSON.stringify(value)) as Mutable<T>;

function inputWithRules(rules: readonly ColorSystemScopedRuleV1[] = []) {
  const input = copy(syntheticColorSystemModelInputV1());
  input.rules = copy(rules);
  input.claims.forEach(claim => {
    claim.ruleIds = [];
  });
  input.adoptions = [];
  return input;
}
function app(contextId = 'communications'): ColorSystemContextApplicationV1 {
  return {
    id: 'application:boundary',
    contextId,
    modeId: 'Day',
    uses: [
      { id: 'ground', colorId: 'paper', role: 'ground', area: 100 },
      { id: 'mark', colorId: 'blue', role: 'artwork', area: 10 },
    ],
    pairs: [],
  };
}
function addClaim(input: Mutable<ColorSystemModelInputV1>, claim: ColorSystemClaimV1) {
  input.claims.push(copy(claim));
  if (['unresolved', 'unsupported', 'contradicted'].includes(claim.status))
    input.coverage[0].unresolvedClaimIds.push(claim.id);
}
function unresolved(
  id: string,
  contextIds: string[] = [],
  ruleIds: string[] = []
): ColorSystemClaimV1 {
  return {
    id,
    sourceId: 'source:synthetic',
    text: 'An explicitly scoped unresolved source claim.',
    status: 'unresolved',
    evidenceRefs: ['evidence:rules'],
    contextIds,
    ruleIds,
  };
}
// These fixtures deliberately change dependencies to isolate relationship scope behavior.
// Explicitly author a new synthetic review decision after each fixture is complete.
const evaluate = (input: ColorSystemModelInputV1, application = app()) => {
  const reviewed = {
    ...input,
    adoptions: buildColorSystemRuleAdoptionsV1(
      input,
      input.rules.map(rule => ({
        ruleId: rule.id,
        status: 'accepted' as const,
        actor: { kind: 'agent' as const, ref: 'independent-boundary-test' },
        authorityRef: 'synthetic:local-only',
        decisionRef: `decision:${rule.id}`,
      }))
    ),
  };
  return compileColorSystemRelationshipsV1(buildColorSystemModelV1(reviewed)).evaluate(application);
};

describe('independent relationship boundary regressions', () => {
  it('rejects own array map getters and functions without invoking them', () => {
    const getter = vi.fn(() => Array.prototype.map);
    const application = copy(app());
    Object.defineProperty(application.uses, 'map', { get: getter, enumerable: false });
    expect(() => buildColorSystemContextApplicationV1(application)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const override = vi.fn();
    const second = copy(app());
    Object.assign(second.pairs, { map: override });
    expect(() => buildColorSystemContextApplicationV1(second)).toThrow();
    expect(override).not.toHaveBeenCalled();
  });

  it('rejects array subclasses before their overridden methods can run', () => {
    let called = false;
    class HostileArray extends Array {
      map() {
        called = true;
        return [];
      }
    }
    const application = app();
    const uses = new HostileArray();
    uses.push(...application.uses);
    expect(() => buildColorSystemContextApplicationV1({ ...application, uses })).toThrow();
    expect(called).toBe(false);
  });

  it.each([{ contextIds: [] }, { contextIds: ['communications'] }])(
    'keeps a Night-only numeric gap from blocking valid Day use (claim contexts $contextIds)',
    ({ contextIds }) => {
      const input = inputWithRules();
      const claim = {
        ...unresolved('claim:night-gap', contextIds),
        text: 'Only the Night numeric value is unavailable.',
      };
      addClaim(input, claim);
      const blue = input.colors.find(color => color.id === 'blue')!;
      delete blue.valuesByMode.Night;
      blue.claimIds.push(claim.id);
      blue.valueGapClaimIdsByMode = { Night: [claim.id] };
      const result = evaluate(input);
      expect(result.eligible).toBe(true);
      expect(result.unresolvedClaimIds).not.toContain(claim.id);
      const night = evaluate(input, { ...app(), modeId: 'Night' });
      expect(night.eligible).toBe(false);
      expect(night.unresolvedClaimIds).toContain(claim.id);
    }
  );

  it('honors a standalone context-scoped claim without requiring duplicated backlink fields', () => {
    const input = inputWithRules();
    const claim = unresolved('claim:context', ['communications']);
    addClaim(input, claim);
    expect(input.contexts.find(context => context.id === 'communications')!.claimIds).not.toContain(
      claim.id
    );
    const result = evaluate(input);
    expect(result.eligible).toBe(false);
    expect(result.unresolvedClaimIds).toContain(claim.id);
    expect(result.blockers.map(blocker => blocker.id)).toContain(claim.id);
    expect(evaluate(input, app('interface')).eligible).toBe(true);
  });

  it('does not override a claim context restriction just because a used color links to it', () => {
    const input = inputWithRules();
    const claim = unresolved('claim:interface-only', ['interface']);
    addClaim(input, claim);
    input.colors.find(color => color.id === 'blue')!.claimIds.push(claim.id);
    const communications = evaluate(input);
    expect(communications.eligible).toBe(true);
    expect(communications.unresolvedClaimIds).not.toContain(claim.id);
    expect(evaluate(input, app('interface')).eligible).toBe(false);
  });

  it.each(['preference', 'example'] as const)(
    'keeps a %s pairing dispute visible without creating a hard exclusion',
    force => {
      const original = syntheticColorSystemModelInputV1().rules.find(
        rule => rule.kind === 'allowed-pair'
      )!;
      if (original.kind !== 'allowed-pair') throw new Error('fixture');
      const disputed = unresolved('claim:disputed-example', ['communications'], [original.id]);
      const contrary = {
        ...disputed,
        id: 'claim:contrary-example',
        status: 'observed' as const,
        text: 'A separate retained source example uses another pairing.',
      };
      const rule = { ...original, force, claimIds: [disputed.id] };
      const input = inputWithRules([rule]);
      addClaim(input, disputed);
      addClaim(input, contrary);
      input.conflicts.push({
        id: 'conflict:soft',
        message: 'Examples disagree in this pairing context.',
        status: 'unresolved',
        claimIds: [disputed.id, contrary.id],
        evidenceRefs: ['evidence:rules'],
        contextIds: ['communications'],
        ruleIds: [rule.id],
      });
      const application = {
        ...app(),
        uses: [
          app().uses[0],
          { id: 'mark', colorId: 'ink', role: 'artwork', area: 10 },
          { id: 'other', colorId: 'warm', role: 'artwork', area: 5 },
        ],
        pairs: [{ id: 'disputed', foregroundUseId: 'mark', backgroundUseId: 'other' }],
      };
      const result = evaluate(input, application);
      expect(result.rules[0].satisfied).toBe(false);
      expect(result.eligible).toBe(true);
      expect(result.conflictIds).toContain('conflict:soft');
      expect(result.unresolvedClaimIds).toContain(disputed.id);
      expect(result.sourceConfidence).toBe('unresolved');
      expect(result.blockers).toEqual([]);
    }
  );

  it('does not let a resolution in one context clear the same used-color claim in another', () => {
    const input = inputWithRules();
    const disputed = unresolved('claim:disputed');
    const contrary = { ...disputed, id: 'claim:contrary', status: 'observed' as const };
    const resolution = {
      ...disputed,
      id: 'claim:resolution',
      status: 'observed' as const,
      contextIds: ['communications'],
    };
    [disputed, contrary, resolution].forEach(claim => addClaim(input, claim));
    input.colors.find(color => color.id === 'blue')!.claimIds.push(disputed.id);
    input.conflicts.push({
      id: 'conflict:resolved',
      message: 'Resolved for communications only.',
      status: 'resolved',
      claimIds: [disputed.id, contrary.id],
      evidenceRefs: ['evidence:rules'],
      contextIds: ['communications', 'interface'],
      ruleIds: [],
      resolutionClaimId: resolution.id,
    });
    expect(evaluate(input).eligible).toBe(true);
    const other = evaluate(input, app('interface'));
    expect(other.eligible).toBe(false);
    expect(other.unresolvedClaimIds).toContain(disputed.id);
  });

  it('rejects a foreground used as its own compositing underlay', () => {
    const application = {
      ...app(),
      pairs: [
        {
          id: 'cycle',
          foregroundUseId: 'ground',
          backgroundUseId: 'mark',
          underlayUseId: 'ground',
          contrast: { minimum: 4.5, assessment: 'required' as const },
        },
      ],
    };
    expect(() => buildColorSystemContextApplicationV1(application)).toThrow();
  });

  it.each(['family', 'scale'] as const)(
    'includes the unresolved authored %s relationship used by a hard rule',
    kind => {
      const original = syntheticColorSystemModelInputV1().rules.find(
        rule => rule.kind === 'required-partner'
      )!;
      if (original.kind !== 'required-partner') throw new Error('fixture');
      const selector = kind === 'family' ? { kind, id: 'pigments' } : { kind, id: 'blue-scale' };
      const rule = {
        ...original,
        operands: { subject: [selector], partner: [{ kind: 'color' as const, id: 'paper' }] },
      };
      const input = inputWithRules([rule]);
      const claim = unresolved(`claim:${kind}-structure`);
      addClaim(input, claim);
      if (kind === 'family') input.families[0].claimIds.push(claim.id);
      else input.scales.find(scale => scale.id === 'blue-scale')!.claimIds.push(claim.id);
      const result = evaluate(input);
      expect(result.eligible).toBe(false);
      expect(result.unresolvedClaimIds).toContain(claim.id);
    }
  );

  it('treats unresolved direct paint evidence as a source blocker even if its claim says observed', () => {
    const input = inputWithRules();
    input.evidence.find(evidence => evidence.id === 'evidence:values')!.status = 'contradicted';
    const result = evaluate(input);
    expect(result.eligible).toBe(false);
    expect(result.sourceConfidence).toBe('unresolved');
  });
});
