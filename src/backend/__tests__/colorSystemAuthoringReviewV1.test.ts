import { describe, expect, it, vi } from 'vitest';
import { createColorSystemAuthoringSessionV1 } from '../colorSystemAuthoringSessionV1';
import {
  createColorSystemRecipeStorageV1,
  COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX,
} from '../colorSystemRecipeStorageV1';
import { parseColorSystemRecipeV1, type ColorSystemRecipeV1 } from '../../lib/colorSystemRecipeV1';
import { buildColorSystemModelV1, type ColorSystemModelV1 } from '../../lib/colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../../lib/colorSystemSrgbValueV1';
import { syntheticColorSystemModelInputV1 } from '../../lib/__tests__/fixtures/colorSystemModelV1Fixture';
import {
  COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
  type ColorSystemAuthoringDirectionV1,
} from '../../lib/colorSystemAuthoringExecutionV1';
import {
  COLOR_SYSTEM_PROPOSAL_V1_VERSION,
  type ColorSystemProposalRequestV1,
} from '../../lib/colorSystemProposalV1';
import {
  buildColorSystemOverlayProposalV1,
  COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION,
} from '../../lib/colorSystemOverlayProposalV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
} from '../../lib/colorSystemApplicationRequirementsV1';
import { COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION } from '../../lib/colorSystemModelCompositionV1';
import { COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION } from '../../lib/colorSystemModelInteractionsV1';
import { canonicalJson, deterministicContentHash } from '../../lib/colorSystemHashing';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type Decision = NonNullable<ColorSystemProposalRequestV1['review']>['decisions'][number];
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const runtime = { isCancelled: () => false, yield: async () => {} };
const decision = (ruleId: string): Decision => ({
  ruleId,
  status: 'accepted',
  actor: { kind: 'agent', ref: 'synthetic-reviewer' },
  authorityRef: 'synthetic:review-brief',
  decisionRef: `synthetic:review:${ruleId}`,
});

function sourceModel(negativeZero = false): ColorSystemModelV1 {
  const input = syntheticColorSystemModelInputV1();
  return buildColorSystemModelV1({
    ...input,
    // This unused native channel deliberately distinguishes exact source packets
    // that have the same canonical model hash.
    colors: input.colors.map(color =>
      color.id === 'warm'
        ? {
            ...color,
            valuesByMode: {
              ...color.valuesByMode,
              Day: buildColorSystemSrgbValueV1({ r: negativeZero ? -0 : 0, g: 0.4, b: 0.2 }),
            },
          }
        : color
    ),
    rules: [],
    adoptions: [],
    claims: input.claims.map(claim => ({ ...claim, ruleIds: [] })),
  });
}

/** Two actual, complete mode applications; each proposed rule constrains an occupied role. */
function direction(
  model: ColorSystemModelV1,
  options: { rules?: boolean; mark?: string; ruleMark?: string; minimum?: number } = {}
): ColorSystemAuthoringDirectionV1 {
  const { rules = true, mark = 'ink', ruleMark = mark, minimum = 3 } = options;
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: ['Day', 'Night'].map(modeId => ({
      id: modeId,
      contextId: 'interface',
      modeId,
      uses: [
        { id: 'ground', role: 'ground', area: 100 },
        { id: 'mark', role: 'action', area: 20 },
      ],
      pairs: [
        {
          id: 'mark-on-ground',
          foregroundUseId: 'mark',
          backgroundUseId: 'ground',
          contrast: { minimum, assessment: 'required' },
        },
      ],
    })),
    distinctions: [],
  });
  const brief: ColorSystemProposalRequestV1['brief'] = {
    briefHash: hash('explicit synthetic two-mode review brief'),
    operation: rules ? 'extend' : 'apply',
    contextIds: ['interface'],
    modeIds: ['Day', 'Night'],
    permissions: {
      addColors: false,
      addFamilies: false,
      addScales: false,
      addRules: rules,
      editFamilyIds: [],
      editScaleIds: [],
      replaceRuleIds: [],
    },
  };
  const proposal: ColorSystemProposalRequestV1 = {
    version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
    id: 'explicit-rules',
    sourceModelHash: model.modelHash,
    brief,
    derivation: {
      algorithmId: 'synthetic-explicit-rules',
      algorithmVersion: '1',
      policyHash: hash('synthetic review policy'),
      inputHash: hash({ mark, ruleMark }),
      sourceColorIds: [...new Set(['paper', mark, ruleMark])],
      sourceScaleIds: [],
    },
    colors: [],
    families: [],
    scales: [],
    exceptions: [],
    rules: rules
      ? [
          { id: 'rule:action', role: 'action', colorId: ruleMark },
          { id: 'rule:ground', role: 'ground', colorId: 'paper' },
        ].map(rule => ({
          id: rule.id,
          label: rule.id,
          kind: 'role-binding' as const,
          force: 'requirement' as const,
          contextIds: ['interface'],
          modeIds: ['Day', 'Night'],
          operands: { role: rule.role, members: [{ kind: 'color' as const, id: rule.colorId }] },
        }))
      : [],
  };
  return {
    version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
    id: 'review-direction',
    generation: rules
      ? {
          kind: 'overlay',
          proposal: {
            version: COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION,
            id: 'review-overlay',
            sourceModelHash: model.modelHash,
            brief,
            fragments: [{ id: 'context-rules', kind: 'rules', proposal }],
          },
        }
      : { kind: 'apply', proposal },
    requirements,
    composition: {
      version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
      modelBinding: 'generated-model',
      requirementsHash: hash(requirements),
      maximumNodes: 64,
      maximumSolutions: 3,
      groups: [
        {
          id: 'actual-applications',
          options: [
            {
              id: 'source-paints',
              assignments: requirements.templates.flatMap(template =>
                template.uses.map(use => ({
                  applicationId: template.id,
                  useId: use.id,
                  colorId: use.id === 'ground' ? 'paper' : mark,
                }))
              ),
            },
          ],
        },
      ],
    },
    units: [],
  };
}

function harness() {
  let source: ColorSystemRecipeV1['source'] = { model: sourceModel(), intake: 'guideline-json' };
  let yieldHook = async () => {};
  const values = new Map<string, unknown>();
  const setAsync = vi.fn(async (key: string, value: unknown) => {
    values.set(key, structuredClone(value));
  });
  const deleteAsync = vi.fn(async (key: string) => {
    values.delete(key);
  });
  const checkSource = vi.fn(async () => {
    throw new Error('Rule review must not request runtime freshness or write authority.');
  });
  const session = createColorSystemAuthoringSessionV1({
    source: () => source,
    storage: createColorSystemRecipeStorageV1({
      clientStorage: {
        keysAsync: async () => [...values.keys()],
        getAsync: async key => structuredClone(values.get(key)),
        setAsync,
        deleteAsync,
      },
      validateRecipeJsonForSave(raw, id) {
        if (parseColorSystemRecipeV1(JSON.parse(raw)).id !== id)
          throw new Error('Unexpected recipe identity.');
      },
    }),
    checkSource,
    yield: () => yieldHook(),
  });
  return {
    session,
    setAsync,
    deleteAsync,
    checkSource,
    source: () => source,
    replaceSource: (next: ColorSystemRecipeV1['source']) => {
      source = next;
    },
    setYield: (next: () => Promise<void>) => {
      yieldHook = next;
    },
    analyze: (request = direction(source.model)) =>
      session.analyze({
        id: 'review-recipe',
        label: 'Synthetic review recipe',
        direction: request,
      }),
  };
}
type Harness = ReturnType<typeof harness>;
async function pending(test: Harness, request?: ColorSystemAuthoringDirectionV1) {
  expect((await test.analyze(request)).status).toBe('blocked');
  const review = test.session.getPendingReview();
  expect(review?.pendingRuleIds).toEqual(['rule:action', 'rule:ground']);
  return review!;
}
function allDecisions(test: Harness) {
  const review = test.session.getPendingReview()!;
  return test.session.prepareReview(review.proposalHash, review.pendingRuleIds.map(decision));
}

describe('explicit authoring rule review through the real engine', () => {
  it('stages a computed blocked overlay, prepares without selecting, then rechecks and selects', async () => {
    const test = harness();
    const review = await pending(test);
    expect(review.model.rules.map(rule => rule.id)).toEqual(review.pendingRuleIds);
    expect(test.session.getSnapshot().recipe).toBeNull();
    const before = test.session.getSnapshot();
    let yields = 0;
    test.setYield(async () => {
      yields++;
    });
    const prepared = allDecisions(test);
    expect(yields).toBe(0);
    expect(test.session.getSnapshot()).toEqual(before);
    expect(test.session.getPendingReview()).toEqual(review);
    const result = await test.session.analyze(prepared);
    expect(result.status).toBe('ready');
    expect(yields).toBeGreaterThan(0);
    expect(test.session.getPendingReview()).toBeNull();
    const selected = result.snapshot.recipe!.selection!;
    expect(selected.applications.map(application => application.modeId)).toEqual(['Day', 'Night']);
    expect(selected.model.adoptions).toHaveLength(2);
    expect(selected.model.adoptions.map(adoption => adoption.decisionRef)).toEqual(
      review.pendingRuleIds.map(ruleId => decision(ruleId).decisionRef)
    );
    expect(result.snapshot).toMatchObject({
      qualified: false,
      saved: false,
      sourceFreshness: 'imported-snapshot',
    });
    expect(test.checkSource).not.toHaveBeenCalled();
    expect(test.setAsync).not.toHaveBeenCalled();
    expect(test.deleteAsync).not.toHaveBeenCalled();
    expect(test.source().model.rules).toEqual([]);
    expect(test.source().model.adoptions).toEqual([]);
    expect(JSON.parse(test.session.exportJson())).not.toHaveProperty('authorization');
    expect(test.session.exportJson()).not.toContain('expectedSourceHash');
  });

  it('accumulates partial attributed decisions only after recomputing the same proposal', async () => {
    const test = harness();
    const initial = await pending(test);
    const first = test.session.prepareReview(initial.proposalHash, [decision('rule:action')]);
    expect((await test.session.analyze(first)).status).toBe('blocked');
    const remaining = test.session.getPendingReview()!;
    expect(remaining.proposalHash).toBe(initial.proposalHash);
    expect(remaining.pendingRuleIds).toEqual(['rule:ground']);
    expect(remaining.model.adoptions).toHaveLength(1);
    expect(() =>
      test.session.prepareReview(remaining.proposalHash, [decision('rule:action')])
    ).toThrow(/pending/);
    const second = allDecisions(test);
    if (second.direction.generation.kind !== 'overlay') throw new Error('Expected overlay.');
    expect(second.direction.generation.proposal.review?.decisions).toEqual([
      decision('rule:action'),
      decision('rule:ground'),
    ]);
    expect((await test.session.analyze(second)).status).toBe('ready');
    expect(test.session.getSnapshot().recipe!.selection!.model.adoptions).toHaveLength(2);
  });

  it('does not carry an earlier partial decision into a changed proposal', async () => {
    const test = harness();
    const initial = await pending(test);
    const first = test.session.prepareReview(initial.proposalHash, [decision('rule:action')]);
    expect((await test.session.analyze(first)).status).toBe('blocked');
    const changed = structuredClone(first.direction) as Mutable<typeof first.direction>;
    if (changed.generation.kind !== 'overlay') throw new Error('Expected overlay.');
    const fragment = changed.generation.proposal.fragments[0];
    if (fragment.kind !== 'rules') throw new Error('Expected rules.');
    fragment.proposal.rules[0].label = 'A revised rule definition';
    const current = await pending(test, changed);
    expect(current.proposalHash).not.toBe(initial.proposalHash);
    expect(current.model.adoptions).toEqual([]);
    const second = test.session.prepareReview(current.proposalHash, [decision('rule:ground')]);
    expect((await test.session.analyze(second)).status).toBe('blocked');
    const remaining = test.session.getPendingReview()!;
    expect(remaining.pendingRuleIds).toEqual(['rule:action']);
    expect(remaining.model.adoptions.map(adoption => adoption.ruleId)).toEqual(['rule:ground']);
  });

  it('preserves an explicit rejection as a rejection, without fabricating acceptance', async () => {
    const test = harness();
    const review = await pending(test);
    const rejected: Decision = { ...decision('rule:action'), status: 'rejected' };
    const prepared = test.session.prepareReview(review.proposalHash, [
      rejected,
      decision('rule:ground'),
    ]);
    expect((await test.session.analyze(prepared)).status).toBe('ready');
    const snapshot = test.session.getSnapshot();
    expect(
      snapshot.recipe!.selection!.model.adoptions.find(
        adoption => adoption.ruleId === 'rule:action'
      )
    ).toMatchObject(rejected);
    expect(snapshot.qualified).toBe(false);
    expect(test.source().model.adoptions).toEqual([]);
    expect(test.checkSource).not.toHaveBeenCalled();
    expect(test.setAsync).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'no decision', choices: [] },
    { name: 'duplicate rule', choices: [decision('rule:action'), decision('rule:action')] },
    { name: 'unknown rule', choices: [decision('rule:absent')] },
  ])('rejects $name without changing the pending draft', async ({ choices }) => {
    const test = harness();
    const review = await pending(test);
    expect(() => test.session.prepareReview(review.proposalHash, choices)).toThrow(/pending/);
    expect(test.session.getPendingReview()).toEqual(review);
    expect(test.session.getSnapshot().recipe).toBeNull();
  });

  it('rejects stale hashes, including a superseded computed draft', async () => {
    const test = harness();
    const previous = await pending(test);
    expect(() =>
      test.session.prepareReview(hash('not the proposal'), [decision('rule:action')])
    ).toThrow(/stale/);
    const current = await pending(test, direction(test.source().model, { mark: 'blue-deep' }));
    expect(current.proposalHash).not.toBe(previous.proposalHash);
    expect(() =>
      test.session.prepareReview(previous.proposalHash, [decision('rule:action')])
    ).toThrow(/stale/);
    expect(test.session.getPendingReview()).toEqual(current);
    expect((await test.session.analyze(allDecisions(test))).status).toBe('ready');
  });

  it('detaches pending models and prepared decisions, and never invokes decision accessors', async () => {
    const test = harness();
    const original = await pending(test);
    const exposed = test.session.getPendingReview() as Mutable<typeof original>;
    exposed.model.colors[0].label = 'Mutated outside';
    exposed.pendingRuleIds.length = 0;
    expect(test.session.getPendingReview()).toEqual(original);
    const getter = vi.fn(() => 'rule:action');
    const hostile = { ...decision('rule:action') };
    Object.defineProperty(hostile, 'ruleId', { enumerable: true, get: getter });
    expect(() => test.session.prepareReview(original.proposalHash, [hostile])).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const choices = [structuredClone(decision('rule:action'))] as Mutable<Decision>[];
    const prepared = test.session.prepareReview(original.proposalHash, choices);
    choices[0].actor.ref = 'Changed after preparation';
    expect((await test.session.analyze(prepared)).status).toBe('blocked');
    expect(test.session.getPendingReview()!.model.adoptions[0].actor.ref).toBe(
      'synthetic-reviewer'
    );
  });

  it.each(['cancel', 'startNew', 'invalidateSource'] as const)(
    '%s invalidates the pending review',
    async action => {
      const test = harness();
      const review = await pending(test);
      test.session[action]();
      expect(test.session.getPendingReview()).toBeNull();
      expect(() =>
        test.session.prepareReview(review.proposalHash, [decision('rule:action')])
      ).toThrow(/stale/);
    }
  );

  it('clears pending review when an unknown stored recipe is opened read-only', async () => {
    const test = harness();
    const review = await pending(test);
    const key = `${COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX}future:review-case`;
    const raw = ' {"schemaVersion":"future.recipe.v9","payload":{"signed":-0}}\n';
    await test.setAsync(key, raw);
    expect((await test.session.openReadOnlyStorageEntry(key)).status).toBe('read-only');
    expect(test.session.getPendingReview()).toBeNull();
    expect(test.session.exportJson()).toBe(raw);
    expect(() =>
      test.session.prepareReview(review.proposalHash, [decision('rule:action')])
    ).toThrow(/stale/);
  });

  it.each(['native-zero', 'intake', 'descriptor'] as const)(
    'rejects changed source %s despite an unchanged model hash',
    async change => {
      const test = harness();
      if (change === 'descriptor')
        test.replaceSource({
          ...test.source(),
          intake: 'current-file',
          currentFileReadScopeJson: '{"scope":"a"}',
        });
      const review = await pending(test);
      const initial = test.source();
      const changed =
        change === 'native-zero'
          ? { ...initial, model: sourceModel(true) }
          : change === 'intake'
            ? { ...initial, intake: 'current-file' as const }
            : { ...initial, currentFileReadScopeJson: '{"scope":"b"}' };
      expect(changed.model.modelHash).toBe(initial.model.modelHash);
      if (change === 'native-zero') {
        expect(
          Object.is(
            initial.model.colors.find(color => color.id === 'warm')!.valuesByMode.Day.components.r,
            0
          )
        ).toBe(true);
        expect(
          Object.is(
            changed.model.colors.find(color => color.id === 'warm')!.valuesByMode.Day.components.r,
            -0
          )
        ).toBe(true);
      }
      test.replaceSource(changed);
      expect(() =>
        test.session.prepareReview(review.proposalHash, [decision('rule:action')])
      ).toThrow(/stale/);
      expect(test.session.getSnapshot().recipe).toBeNull();
    }
  );

  it('detects a same-hash native source replacement during execution before staging review', async () => {
    const test = harness();
    expect((await test.analyze(direction(test.source().model, { rules: false }))).status).toBe(
      'ready'
    );
    const before = test.session.exportJson();
    const initial = test.source();
    const changed = { ...initial, model: sourceModel(true) };
    expect(changed.model.modelHash).toBe(initial.model.modelHash);
    test.setYield(async () => {
      test.replaceSource(changed);
    });
    expect((await test.analyze()).status).toBe('changed');
    expect(test.session.getPendingReview()).toBeNull();
    expect(test.session.exportJson()).toBe(before);
    expect((await test.analyze()).status).toBe('changed');
    expect(test.session.exportJson()).toBe(before);
  });

  it('rejects a same-hash source change between preparing and analyzing a first review', async () => {
    const test = harness();
    await pending(test);
    const prepared = allDecisions(test);
    const changed = { ...test.source(), model: sourceModel(true) };
    expect(changed.model.modelHash).toBe(test.source().model.modelHash);
    test.replaceSource(changed);
    const yielded = vi.fn(async () => {});
    test.setYield(yielded);
    expect((await test.session.analyze(prepared)).status).toBe('changed');
    expect(yielded).not.toHaveBeenCalled();
    expect(test.session.getSnapshot().recipe).toBeNull();
    expect(test.session.getPendingReview()).toBeNull();
  });

  it('preserves the prior selected recipe and exact locks through bad, cancelled, and lock-breaking reviewed edits', async () => {
    const test = harness();
    expect(
      (await test.analyze(direction(test.source().model, { rules: false, mark: 'blue-deep' })))
        .status
    ).toBe('ready');
    test.session.lock({ kind: 'scale', id: 'blue-scale' });
    const before = test.session.exportJson();
    await pending(test);
    expect(test.session.exportJson()).toBe(before);
    const malformed = allDecisions(test) as Mutable<ReturnType<typeof allDecisions>>;
    if (malformed.direction.generation.kind !== 'overlay') throw new Error('Expected overlay.');
    malformed.direction.generation.proposal.review!.decisions[0].actor.ref = '';
    await expect(test.session.analyze(malformed)).rejects.toThrow();
    expect(test.session.exportJson()).toBe(before);
    expect(test.session.getPendingReview()).toBeNull();
    await pending(test);
    const prepared = allDecisions(test);
    test.setYield(async () => {
      test.session.cancel();
    });
    expect((await test.session.analyze(prepared)).status).toBe('cancelled');
    expect(test.session.getPendingReview()).toBeNull();
    expect(test.session.exportJson()).toBe(before);
    test.setYield(async () => {});
    await pending(test);
    const blocked = await test.session.analyze(allDecisions(test));
    expect(blocked.status).toBe('blocked');
    expect(blocked.message).toMatch(/locked/);
    expect(test.session.exportJson()).toBe(before);
    expect(test.session.getPendingReview()).toBeNull();
    expect(test.session.getSnapshot().recipe!.locks).toHaveLength(1);
  });

  it.each([
    { name: 'required contrast', options: { minimum: 21 } },
    { name: 'accepted role rule', options: { ruleMark: 'blue-deep' } },
  ])(
    'keeps $name blocking after every pending rule is explicitly accepted',
    async ({ options }) => {
      const test = harness();
      expect((await test.analyze(direction(test.source().model, { rules: false }))).status).toBe(
        'ready'
      );
      const before = test.session.exportJson();
      await pending(test, direction(test.source().model, options));
      const reviewed = allDecisions(test);
      expect((await test.session.analyze(reviewed)).status).toBe('blocked');
      expect(test.session.getPendingReview()).toBeNull();
      expect(test.session.exportJson()).toBe(before);
      expect(test.session.getSnapshot().qualified).toBe(false);
      expect(test.setAsync).not.toHaveBeenCalled();
      expect(test.checkSource).not.toHaveBeenCalled();
    }
  );

  it('rebinds an exact pending concrete model for new adoptions and rejects stale concrete input', async () => {
    const test = harness();
    const original = direction(test.source().model);
    if (original.generation.kind !== 'overlay') throw new Error('Expected overlay.');
    const computed = await buildColorSystemOverlayProposalV1(
      test.source().model,
      original.generation.proposal,
      runtime
    );
    expect(computed.status).toBe('proposed');
    const { modelBinding: _binding, ...composition } = original.composition as Extract<
      typeof original.composition,
      { modelBinding: string }
    >;
    const concrete = {
      ...original,
      composition: { ...composition, modelHash: computed.proposal!.workingModel.modelHash },
    };
    await pending(test, concrete);
    const reviewed = allDecisions(test);
    expect(reviewed.direction.composition).toHaveProperty('modelBinding', 'generated-model');
    expect(reviewed.direction.composition).not.toHaveProperty('modelHash');
    const selected = await test.session.analyze(reviewed);
    expect(selected.status).toBe('ready');
    expect(selected.snapshot.recipe!.selection!.model.modelHash).not.toBe(
      concrete.composition.modelHash
    );
    const before = test.session.exportJson();
    await expect(
      test.analyze({
        ...concrete,
        composition: { ...concrete.composition, modelHash: hash('stale model') },
      })
    ).rejects.toThrow(/stale|model hash|modelHash/i);
    expect(test.session.getPendingReview()).toBeNull();
    expect(test.session.exportJson()).toBe(before);
  });

  it('rebinds a concrete interaction request and still runs the actual selector after review', async () => {
    const test = harness();
    const { modelHash: _hash, ...input } = test.source().model;
    const ids = ['blue-pale', 'blue-mid', 'blue', 'blue-deep'];
    const gray = (channel: number) =>
      buildColorSystemSrgbValueV1({ r: channel, g: channel, b: channel });
    const model = buildColorSystemModelV1({
      ...input,
      colors: input.colors.map(color => {
        const index = ids.indexOf(color.id);
        return index < 0
          ? color
          : {
              ...color,
              valuesByMode: { Day: gray(0.12 + index * 0.05), Night: gray(0.65 + index * 0.05) },
            };
      }),
    });
    test.replaceSource({ ...test.source(), model });
    const original = direction(model, { mark: 'blue-pale' });
    if (original.generation.kind !== 'overlay') throw new Error('Expected overlay.');
    const computed = await buildColorSystemOverlayProposalV1(
      model,
      original.generation.proposal,
      runtime
    );
    const concrete: ColorSystemAuthoringDirectionV1 = {
      ...original,
      composition: {
        ...original.composition,
        groups: original.composition.groups.map(group => ({
          ...group,
          options: group.options.map(option => ({
            ...option,
            assignments: option.assignments.filter(
              item => item.applicationId !== 'Day' || item.useId !== 'mark'
            ),
          })),
        })),
      },
      interactionGroups: [
        {
          id: 'day-action',
          request: {
            version: COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION,
            modelHash: computed.proposal!.workingModel.modelHash,
            contextId: 'interface',
            modeId: 'Day',
            role: 'selected',
            scales: [
              {
                scaleId: 'blue-scale',
                slotIds: ['slot:0', 'slot:1', 'slot:2', 'slot:3'],
                preference: 0,
                preferredSlotIds: { rest: 'slot:0', hover: 'slot:1', pressed: 'slot:2' },
                lockedSlotIds: { rest: 'slot:0' },
                stateOrder: 'ascending',
              },
            ],
            surfaceColorIds: ['paper'],
            onForegroundColorIds: ['paper'],
          },
          bindings: [{ applicationId: 'Day', useId: 'mark', selection: 'rest' }],
        },
      ],
    };
    await pending(test, concrete);
    const prepared = allDecisions(test);
    expect(prepared.direction.interactionGroups![0].request).toHaveProperty(
      'modelBinding',
      'generated-model'
    );
    expect(prepared.direction.interactionGroups![0].request).not.toHaveProperty('modelHash');
    expect((await test.session.analyze(prepared)).status).toBe('ready');
    const before = test.session.exportJson();
    const stale = structuredClone(concrete) as Mutable<typeof concrete>;
    Object.assign(stale.interactionGroups![0].request, {
      modelHash: hash('stale interaction model'),
    });
    await expect(test.analyze(stale)).rejects.toThrow(/different model/i);
    expect(test.session.getPendingReview()).toBeNull();
    expect(test.session.exportJson()).toBe(before);
  });
});
