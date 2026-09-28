import { describe, expect, it } from 'vitest';
import {
  buildColorSystemDesignContentV1,
  buildColorSystemDesignLockV1,
  diffColorSystemDesignContentV1,
  recheckColorSystemDesignLockV1,
} from '../colorSystemDesignContentV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
} from '../colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import type { ColorSystemContextApplicationV1 } from '../colorSystemRelationshipsV1';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';
import {
  buildColorSystemBrandConstraintsV1,
  COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_SCHEMA_VERSION,
} from '../colorSystemBrandConstraintsV1';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
function input(): Mutable<ColorSystemModelInputV1> {
  return structuredClone(syntheticColorSystemModelInputV1()) as Mutable<ColorSystemModelInputV1>;
}
/** Explicit test-only rereview after a synthetic edit; product imports never renew adoptions. */
function model(value = input()) {
  const decisions = value.adoptions.filter(item =>
    value.rules.some(rule => rule.id === item.ruleId)
  );
  const body = { ...value, adoptions: [] };
  return buildColorSystemModelV1({
    ...body,
    adoptions: buildColorSystemRuleAdoptionsV1(
      body,
      decisions.map(({ ruleId, status, actor, authorityRef, decisionRef }) => ({
        ruleId,
        status,
        actor,
        authorityRef,
        decisionRef,
      }))
    ),
  });
}
function application(): Mutable<ColorSystemContextApplicationV1> {
  return {
    id: 'controls',
    contextId: 'interface',
    modeId: 'Day',
    uses: [
      { id: 'action', colorId: 'blue', role: 'action', area: 0.2 },
      { id: 'label', colorId: 'ink', role: 'action-label', area: 0.1 },
      { id: 'ground', colorId: 'paper', role: 'ground', area: 1 },
    ],
    pairs: [
      {
        id: 'action-label',
        foregroundUseId: 'label',
        backgroundUseId: 'action',
        underlayUseId: 'ground',
        contrast: { minimum: 4.5, assessment: 'required' },
      },
    ],
  };
}
function channelChange(value: Mutable<ColorSystemModelInputV1>, id: string, mode = 'Day') {
  const color = value.colors.find(item => item.id === id)!;
  const original = color.valuesByMode[mode];
  color.valuesByMode[mode] = buildColorSystemSrgbValueV1(
    { ...original.components, r: original.components.r + 1e-15 },
    original.alpha
  );
}
const design = (
  value = input(),
  apps: readonly ColorSystemContextApplicationV1[] = [application()]
) => buildColorSystemDesignContentV1(model(value), apps);

describe('colorSystemDesignContentV1', () => {
  it('projects exact primaryless native modes, related scales and actual application semantics', () => {
    const result = design();
    expect(result.qualified).toBe(false);
    expect(
      result.content.colors.find(color => color.id === 'blue')!.valuesByMode.Day.components.r
    ).toBe(0.23530000000000004);
    expect(result.content.colors.find(color => color.id === 'blue')!.valuesByMode.Day.alpha).toBe(
      0.9876543210987654
    );
    expect(result.content.scales.map(scale => [scale.id, scale.familyId])).toEqual([
      ['blue-scale', 'pigments'],
      ['warm-scale', 'pigments'],
    ]);
    expect(result.content.modes.map(mode => mode.id)).toEqual(['Day', 'Night']);
    expect(result.content.applications[0].pairs[0].contrast).toEqual({
      minimum: 4.5,
      assessment: 'required',
    });
    expect(result.sourceIdentity.sources[0].id).toBe('source:synthetic');
    expect(result.content).not.toHaveProperty('modelHash');
    expect(result.content.rules[0]).not.toHaveProperty('evidenceRefs');
    expect(result.content.adoptions[0]).toEqual({ ruleId: 'rule:allowed', status: 'accepted' });
  });

  it('ignores evidence/attribution receipt churn but preserves it in the retained source identity', () => {
    const changed = input();
    changed.evidence[0].description =
      'A new evidence description for the identical synthetic design.';
    changed.claims[0].text = 'The same native values were independently observed.';
    changed.adoptions[0].actor.ref = 'another-synthetic-reviewer';
    changed.adoptions[0].decisionRef = 'decision:another-receipt';
    const before = design(),
      after = design(changed);
    expect(before.sourceIdentity.workingModelHash).not.toBe(after.sourceIdentity.workingModelHash);
    expect(before.contentHash).toBe(after.contentHash);
    expect(diffColorSystemDesignContentV1(before, after).changed).toEqual([]);
  });

  it('does not rename unchanged actual applications when derived runtime measurements differ', () => {
    const source = model();
    const first = {
      application: application(),
      ratio: 6.517100973480119,
      assessmentHash: 'runtime-a',
    };
    const second = { ...first, ratio: 6.517100973480121, assessmentHash: 'runtime-b' };
    expect(buildColorSystemDesignContentV1(source, [first.application]).contentHash).toBe(
      buildColorSystemDesignContentV1(source, [second.application]).contentHash
    );
    expect(() => buildColorSystemDesignContentV1(source, [first])).toThrow(/unsupported fields/);
  });

  it('canonicalizes unordered IDs and actual-use order while retaining authored scale order', () => {
    const changed = input();
    changed.colors.reverse();
    changed.families[0].colorIds.reverse();
    changed.rules.reverse();
    changed.scales.reverse();
    const app = application();
    app.uses.reverse();
    expect(design(changed, [app]).contentHash).toBe(design().contentHash);
    const nonuniform = input();
    nonuniform.scales[0].slots[1].position = 0.125;
    const result = design(nonuniform);
    expect(result.content.scales[0].slots[1].position).toBe(0.125);
    expect(result.contentHash).not.toBe(design().contentHash);
  });

  it('detects a 1e-15 native change with the exact channel path', () => {
    const changed = input();
    channelChange(changed, 'blue');
    const before = design(),
      after = design(changed);
    expect(before.contentHash).not.toBe(after.contentHash);
    const difference = diffColorSystemDesignContentV1(before, after);
    expect(
      difference.changed.find(item => item.entity.kind === 'colors' && item.entity.id === 'blue')!
        .paths
    ).toContainEqual(['valuesByMode', 'Day', 'components', 'r']);
    expect(difference.kept).toContainEqual({ kind: 'scales', id: 'warm-scale' });
  });

  it('retains and detects signed zero without rounding or a JSON copy', () => {
    const changed = input();
    changed.colors.find(item => item.id === 'blue')!.valuesByMode.Day = buildColorSystemSrgbValueV1(
      { r: -0, g: 0.25, b: 0.5 },
      -0
    );
    const negative = design(changed);
    const value = negative.content.colors.find(item => item.id === 'blue')!.valuesByMode.Day;
    expect(Object.is(value.components.r, -0)).toBe(true);
    expect(Object.is(value.alpha, -0)).toBe(true);
    changed.colors.find(item => item.id === 'blue')!.valuesByMode.Day = buildColorSystemSrgbValueV1(
      { r: 0, g: 0.25, b: 0.5 },
      0
    );
    const positive = design(changed);
    expect(positive.contentHash).not.toBe(negative.contentHash);
    const lock = buildColorSystemDesignLockV1(negative, { kind: 'scale', id: 'blue-scale' });
    expect(recheckColorSystemDesignLockV1(structuredClone(lock), negative).status).toBe('intact');
    expect(() =>
      recheckColorSystemDesignLockV1(JSON.parse(JSON.stringify(lock)), negative)
    ).toThrow(/exact hash/);
  });

  it('detects missing modes without inventing values or losing a declared numeric gap', () => {
    const changed = input();
    const blue = changed.colors.find(item => item.id === 'blue')!;
    delete blue.valuesByMode.Night;
    blue.valueGapClaimIdsByMode = { Night: ['gap:blue-night'] };
    blue.claimIds.push('gap:blue-night');
    changed.claims.push({
      id: 'gap:blue-night',
      sourceId: 'source:synthetic',
      text: 'No exact Night value is available.',
      status: 'unsupported',
      evidenceRefs: ['evidence:values'],
      contextIds: [],
      ruleIds: [],
      modeIds: ['Night'],
    });
    changed.coverage[0].status = 'partial';
    changed.coverage[0].unresolvedClaimIds.push('gap:blue-night');
    const after = design(changed);
    expect(
      after.content.colors.find(color => color.id === 'blue')!.valuesByMode.Night
    ).toBeUndefined();
    expect(
      diffColorSystemDesignContentV1(design(), after).changed.find(
        item => item.entity.id === 'blue'
      )!.paths
    ).toContainEqual(['valuesByMode', 'Night']);
    const app = application();
    app.modeId = 'Night';
    expect(design(changed, [app]).qualified).toBe(false);
  });

  it('reports added/removed stable IDs and independently identifies changed uses/pairs', () => {
    const beforeInput = input(),
      afterInput = input();
    beforeInput.colors.push({ ...structuredClone(beforeInput.colors[0]), id: 'removed-color' });
    afterInput.colors.push({ ...structuredClone(afterInput.colors[0]), id: 'new-color' });
    afterInput.families[0].colorIds.push('new-color');
    const app = application();
    app.uses[0].colorId = 'blue-deep';
    app.uses[0].area = 0.2 + 1e-15;
    app.pairs[0].contrast!.minimum = 7;
    const diff = diffColorSystemDesignContentV1(design(beforeInput), design(afterInput, [app]));
    expect(diff.added).toContainEqual({ kind: 'colors', id: 'new-color' });
    expect(diff.removed).toContainEqual({ kind: 'colors', id: 'removed-color' });
    expect(diff.changed.map(item => item.entity)).toEqual(
      expect.arrayContaining([
        { kind: 'families', id: 'pigments' },
        { kind: 'applications', id: 'controls' },
        { kind: 'applicationUses', applicationId: 'controls', id: 'action' },
        { kind: 'applicationPairs', applicationId: 'controls', id: 'action-label' },
      ])
    );
  });

  it('detects contextual rule and adoption meaning changes', () => {
    const changed = input();
    const rule = changed.rules.find(item => item.id === 'rule:role')!;
    if (rule.kind !== 'role-binding') throw new Error('Wrong fixture.');
    rule.operands.members = [{ kind: 'color', id: 'blue-deep' }];
    changed.adoptions.find(item => item.ruleId === rule.id)!.status = 'rejected';
    const diff = diffColorSystemDesignContentV1(design(), design(changed));
    expect(diff.changed.map(item => item.entity)).toContainEqual({ kind: 'rules', id: rule.id });
    expect(diff.changed.map(item => item.entity)).toContainEqual({
      kind: 'adoptions',
      id: rule.id,
    });
  });

  it('detaches input and freezes public snapshots; structural forgeries cannot enter diff/locks', () => {
    const source = model(),
      app = application();
    const result = buildColorSystemDesignContentV1(source, [app]);
    app.uses[0].colorId = 'warm';
    expect(result.content.applications[0].uses.find(use => use.id === 'action')!.colorId).toBe(
      'blue'
    );
    expect(() => {
      (result as Mutable<typeof result>).content.colors[0].valuesByMode.Day.components.r = 0;
    }).toThrow();
    expect(() => {
      (result as Mutable<typeof result>).contentHash = 'spoof';
    }).toThrow();
    expect(() => diffColorSystemDesignContentV1({ ...result }, result)).toThrow(/Rebuild/);
    expect(() =>
      buildColorSystemDesignLockV1(JSON.parse(JSON.stringify(result)), {
        kind: 'family',
        id: 'pigments',
      })
    ).toThrow(/Rebuild/);
  });

  it('validates bounded inert applications and exact context/color/mode references', () => {
    const source = model();
    expect(() =>
      buildColorSystemDesignContentV1(source, Array.from({ length: 65 }, application))
    ).toThrow(/64/);
    expect(() => buildColorSystemDesignContentV1(source, [application(), application()])).toThrow(
      /unique/
    );
    for (const edit of [
      (app: ReturnType<typeof application>) => {
        app.contextId = 'unknown';
      },
      (app: ReturnType<typeof application>) => {
        app.modeId = 'Dark';
      },
      (app: ReturnType<typeof application>) => {
        app.uses[0].colorId = 'unknown';
      },
    ]) {
      const app = application();
      edit(app);
      expect(() => buildColorSystemDesignContentV1(source, [app])).toThrow();
    }
    let reads = 0;
    const app = application();
    Object.defineProperty(app.uses[0], 'colorId', {
      enumerable: true,
      get: () => {
        reads++;
        return 'blue';
      },
    });
    expect(() => buildColorSystemDesignContentV1(source, [app])).toThrow(/accessors/);
    expect(reads).toBe(0);
    expect(() => buildColorSystemDesignContentV1(source, new Array(1))).toThrow(/dense/);
    expect(() =>
      buildColorSystemDesignContentV1(source, [{ ...application(), measurements: [] }])
    ).toThrow(/unsupported/);
  });

  it('keeps a scale lock across unrelated sibling paint changes, while the family lock catches them', () => {
    const before = design();
    const scaleLock = buildColorSystemDesignLockV1(before, { kind: 'scale', id: 'blue-scale' });
    const familyLock = buildColorSystemDesignLockV1(before, { kind: 'family', id: 'pigments' });
    const changed = input();
    channelChange(changed, 'warm');
    const after = design(changed);
    expect(
      recheckColorSystemDesignLockV1(JSON.parse(JSON.stringify(scaleLock)), after)
    ).toMatchObject({ status: 'intact', qualified: false });
    expect(recheckColorSystemDesignLockV1(familyLock, after).status).toBe('changed');
    expect(scaleLock.snapshot.scales.map(scale => scale.id)).toEqual(['blue-scale']);
    expect(familyLock.snapshot.scales.map(scale => scale.id)).toEqual(['blue-scale', 'warm-scale']);
  });

  it('locks actual paired native paints in their used mode without locking unused foreign mode values', () => {
    const before = design(),
      lock = buildColorSystemDesignLockV1(before, { kind: 'scale', id: 'blue-scale' });
    const changed = input();
    channelChange(changed, 'ink', 'Night');
    expect(recheckColorSystemDesignLockV1(lock, design(changed)).status).toBe('intact');
    channelChange(changed, 'ink', 'Day');
    expect(recheckColorSystemDesignLockV1(lock, design(changed)).status).toBe('changed');
    expect(lock.snapshot.pairedPaints.map(paint => [paint.useId, paint.modeId])).toEqual([
      ['ground', 'Day'],
      ['label', 'Day'],
    ]);
  });

  it.each(['palette', 'territory'] as const)(
    'scopes %s policies to the locked colors or actual product context',
    kind => {
      const policyInput = (contextId: string, changed: boolean) => {
        const value = input();
        value.contexts.push({
          id: 'marketing',
          label: 'Independent marketing',
          modeIds: ['Day', 'Night'],
          evidenceRefs: [],
          claimIds: [],
        });
        if (kind === 'palette') {
          value.rules.push({
            id: 'independent-palette',
            label: 'Explicit contextual palette',
            kind: 'palette-membership',
            force: 'requirement',
            origin: 'inferred',
            contextIds: [contextId],
            modeIds: ['Day'],
            evidenceRefs: [],
            claimIds: [],
            operands: { members: [{ kind: 'color', id: changed ? 'warm-deep' : 'warm' }] },
          });
        } else {
          value.brandConstraintsByContext.push({
            id: 'context-territory',
            sourceId: value.sources[0].id,
            contextIds: [contextId],
            fragment: structuredClone(
              buildColorSystemBrandConstraintsV1({
                schemaVersion: COLOR_SYSTEM_BRAND_CONSTRAINTS_V1_SCHEMA_VERSION,
                sourceSnapshotHash: value.sources[0].sourceHash,
                rules: [
                  {
                    id: 'context-territory-rule',
                    label: 'Explicit contextual territory',
                    kind: 'brand-territory',
                    scope: {
                      kind: 'generated-families',
                      prominence: ['supporting'],
                      modes: 'all',
                      jobs: 'all',
                    },
                    bounds: {
                      hueRanges: [{ minimum: 180, maximum: changed ? 260 : 270 }],
                      chroma: { minimum: 0, maximum: 0.5 },
                      lightness: { minimum: 0, maximum: 1 },
                    },
                    origin: 'inferred',
                    evidenceRefs: ['evidence:rules'],
                    effect: 'exclude',
                  },
                ],
                decisions: [],
              })
            ) as Mutable<ReturnType<typeof buildColorSystemBrandConstraintsV1>>,
          });
        }
        return value;
      };
      for (const [contextId, expected] of [
        ['marketing', 'intact'],
        ['interface', 'changed'],
      ] as const) {
        const before = design(policyInput(contextId, false));
        const lock = buildColorSystemDesignLockV1(before, { kind: 'scale', id: 'blue-scale' });
        expect(
          recheckColorSystemDesignLockV1(lock, design(policyInput(contextId, true))).status
        ).toBe(expected);
      }
    }
  );

  it('detects source pins, authored slots/modes and affecting partner relationships in locks', () => {
    const before = design(),
      lock = buildColorSystemDesignLockV1(before, { kind: 'scale', id: 'blue-scale' });
    for (const edit of [
      (value: ReturnType<typeof input>) => channelChange(value, 'blue'),
      (value: ReturnType<typeof input>) => {
        value.scales[0].slots[1].position = 0.3;
      },
      (value: ReturnType<typeof input>) => {
        value.scales[0].modes.pop();
        value.rules.find(rule => rule.id === 'rule:partner')!.modeIds = ['Day'];
      },
      (value: ReturnType<typeof input>) => {
        const rule = value.rules.find(item => item.id === 'rule:partner')!;
        if (rule.kind === 'required-partner')
          rule.operands.partner = [{ kind: 'color', id: 'warm' }];
      },
      (value: ReturnType<typeof input>) => {
        value.scales[1].modes[0].anchors[1].colorId = 'warm-deep';
      },
    ]) {
      const changed = input();
      edit(changed);
      expect(recheckColorSystemDesignLockV1(lock, design(changed)).status).toBe('changed');
    }
  });

  it('reports a removed locked target and refuses stale or executable imported lock data', () => {
    const before = design(),
      lock = buildColorSystemDesignLockV1(before, { kind: 'scale', id: 'blue-scale' });
    const changed = input();
    changed.scales = changed.scales.filter(scale => scale.id !== 'blue-scale');
    changed.rules = changed.rules.filter(rule => rule.id !== 'rule:partner');
    for (const claim of changed.claims)
      claim.ruleIds = claim.ruleIds.filter(id => id !== 'rule:partner');
    expect(recheckColorSystemDesignLockV1(lock, design(changed))).toMatchObject({
      status: 'missing',
      currentSnapshotHash: null,
      qualified: false,
    });
    expect(() => buildColorSystemDesignLockV1(before, { kind: 'scale', id: 'missing' })).toThrow(
      /missing/
    );
    expect(() =>
      buildColorSystemDesignLockV1(before, { kind: 'scale', id: 'blue-scale', approved: true })
    ).toThrow();
    const imported = structuredClone(lock) as Mutable<typeof lock>;
    imported.snapshot.colors[0].label = 'Changed';
    expect(() => recheckColorSystemDesignLockV1(imported, before)).toThrow(/exact hash/);
    expect(() => recheckColorSystemDesignLockV1({ ...lock, qualified: true }, before)).toThrow(
      /malformed/
    );
    let reads = 0;
    Object.defineProperty(imported, 'snapshotHash', {
      enumerable: true,
      get: () => {
        reads++;
        return lock.snapshotHash;
      },
    });
    expect(() => recheckColorSystemDesignLockV1(imported, before)).toThrow(/accessors/);
    expect(reads).toBe(0);
    expect(() => {
      (lock as Mutable<typeof lock>).snapshot.colors[0].label = 'Changed';
    }).toThrow();
  });
});
