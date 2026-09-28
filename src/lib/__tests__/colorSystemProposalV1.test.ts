import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildColorSystemProposalV1,
  compileColorSystemProposalV1,
  parseColorSystemProposalRequestV1,
  COLOR_SYSTEM_PROPOSAL_V1_VERSION,
  type ColorSystemProposalRequestV1,
  type ColorSystemProposalOriginV1,
} from '../colorSystemProposalV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelV1,
  type ColorSystemRuleAdoptionDecisionV1,
} from '../colorSystemModelV1';
import { deterministicContentHash } from '../colorSystemHashing';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import {
  syntheticColorSystemModelInputV1,
  syntheticColorSystemModelV1,
} from './fixtures/colorSystemModelV1Fixture';

function request(
  source: ColorSystemModelV1,
  patch: Partial<ColorSystemProposalRequestV1> = {}
): ColorSystemProposalRequestV1 {
  return {
    version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
    id: 'invented-extension',
    sourceModelHash: source.modelHash,
    brief: {
      briefHash: deterministicContentHash('frozen synthetic extension brief'),
      operation: 'extend',
      contextIds: ['communications'],
      modeIds: ['Day'],
      permissions: {
        addColors: true,
        addFamilies: true,
        addScales: true,
        addRules: true,
        editFamilyIds: ['pigments'],
        editScaleIds: ['blue-scale'],
        replaceRuleIds: ['rule:palette'],
      },
    },
    derivation: {
      algorithmId: 'synthetic:declared-construction',
      algorithmVersion: '1',
      policyHash: deterministicContentHash('policy'),
      inputHash: deterministicContentHash('construction input'),
      sourceColorIds: ['blue'],
      sourceScaleIds: ['blue-scale'],
    },
    colors: [
      {
        id: 'proposed-tone',
        label: 'Proposed tone',
        valuesByMode: {
          Day: buildColorSystemSrgbValueV1({ r: 0.345678901234567, g: 0.6, b: 0.8 }),
        },
      },
    ],
    families: [],
    scales: [],
    rules: [],
    exceptions: [],
    ...patch,
  };
}
function familyExtension(source: ColorSystemModelV1): ColorSystemProposalRequestV1['families'] {
  const { evidenceRefs: _evidence, claimIds: _claims, ...family } = source.families[0];
  return [{ ...family, colorIds: [...family.colorIds, 'proposed-tone'] }];
}
const application = (colorId = 'proposed-tone') => ({
  id: 'composition',
  contextId: 'communications',
  modeId: 'Day',
  uses: [
    { id: 'ground', colorId: 'paper', role: 'background', area: 100 },
    { id: 'mark', colorId, role: 'illustration', area: 20 },
  ],
  pairs: [],
});
const decision = (
  ruleId: string,
  status: 'accepted' | 'rejected' = 'accepted'
): ColorSystemRuleAdoptionDecisionV1 => ({
  ruleId,
  status,
  actor: { kind: 'agent', ref: 'synthetic-reviewer' },
  authorityRef: 'synthetic:extension-permission',
  decisionRef: 'synthetic:review-1',
});
function reviewed(
  source: ColorSystemModelV1,
  input: ColorSystemProposalRequestV1,
  decisions?: readonly ColorSystemRuleAdoptionDecisionV1[]
): ColorSystemProposalRequestV1 {
  const proposal = buildColorSystemProposalV1(source, input);
  return {
    ...input,
    review: {
      reviewedProposalHash: proposal.proposalHash,
      decisions: decisions ?? proposal.pendingRuleIds.map(id => decision(id)),
    },
  };
}
function exceptionRequest(
  source: ColorSystemModelV1,
  fullScope = true
): ColorSystemProposalRequestV1 {
  const original = source.rules.find(rule => rule.id === 'rule:palette')!;
  if (original.kind !== 'palette-membership') throw new Error('Fixture changed');
  const contextIds = fullScope ? original.contextIds : ['communications'];
  const modeIds = fullScope ? original.modeIds : ['Day'];
  return request(source, {
    brief: { ...request(source).brief, contextIds, modeIds },
    colors: request(source).colors.map(color => ({
      ...color,
      valuesByMode: {
        ...color.valuesByMode,
        ...(modeIds.includes('Night')
          ? { Night: buildColorSystemSrgbValueV1({ r: 0.2, g: 0.3, b: 0.4 }) }
          : {}),
      },
    })),
    rules: [
      {
        id: 'proposal:palette',
        label: 'Explicit working extension palette',
        kind: 'palette-membership',
        force: 'requirement',
        contextIds,
        modeIds,
        operands: {
          members: [...original.operands.members, { kind: 'color', id: 'proposed-tone' }],
        },
      },
    ],
    exceptions: [
      {
        sourceRuleId: original.id,
        replacementRuleId: 'proposal:palette',
        reason:
          'The synthetic brief explicitly permits this additional tone in the working palette.',
      },
    ],
  });
}

function withOrigins(
  source: ColorSystemModelV1,
  input: ColorSystemProposalRequestV1,
  groups: readonly Omit<ColorSystemProposalOriginV1, 'sourceHash' | 'derivation'>[]
): ColorSystemProposalRequestV1 {
  return {
    ...input,
    origins: groups.map(group => {
      const leaf = {
        ...input,
        id: `leaf:${group.id}`,
        derivation: { ...input.derivation, algorithmId: `synthetic:${group.id}` },
        colors: input.colors.filter(item => group.colorIds.includes(item.id)),
        families: input.families.filter(item => group.familyIds.includes(item.id)),
        scales: input.scales.filter(item => group.scaleIds.includes(item.id)),
        rules: input.rules.filter(item => group.ruleIds.includes(item.id)),
      };
      return {
        ...group,
        sourceHash: buildColorSystemProposalV1(source, leaf).proposalHash,
        derivation: leaf.derivation,
      };
    }),
  };
}

function independentFamilies(source: ColorSystemModelV1, accent = 0.7) {
  const input = request(source, {
    colors: [
      {
        id: 'control-light',
        label: 'Control light',
        valuesByMode: { Day: buildColorSystemSrgbValueV1({ r: 0.6, g: 0.7, b: 0.8 }) },
      },
      {
        id: 'control-dark',
        label: 'Control dark',
        valuesByMode: { Day: buildColorSystemSrgbValueV1({ r: 0.2, g: 0.3, b: 0.4 }) },
      },
      {
        id: 'accent-tone',
        label: 'Accent',
        valuesByMode: { Day: buildColorSystemSrgbValueV1({ r: accent, g: 0.4, b: 0.1 }) },
      },
    ],
    families: [
      { id: 'controls', label: 'Controls', colorIds: ['control-light', 'control-dark'] },
      { id: 'accents', label: 'Accents', colorIds: ['accent-tone'] },
    ],
    scales: [
      {
        id: 'control-scale',
        label: 'Control scale',
        familyId: 'controls',
        slots: [
          { id: 'light', position: 1 },
          { id: 'dark', position: 2 },
        ],
        modes: [
          {
            modeId: 'Day',
            anchors: [
              { slotId: 'light', colorId: 'control-light' },
              { slotId: 'dark', colorId: 'control-dark' },
            ],
          },
        ],
      },
    ],
    rules: [
      {
        id: 'proposal:control',
        label: 'Controls use the control scale',
        kind: 'role-binding',
        force: 'requirement',
        contextIds: ['communications'],
        modeIds: ['Day'],
        operands: { role: 'control', members: [{ kind: 'scale', id: 'control-scale' }] },
      },
      {
        id: 'proposal:accent',
        label: 'Accents use the accent family',
        kind: 'role-binding',
        force: 'requirement',
        contextIds: ['communications'],
        modeIds: ['Day'],
        operands: { role: 'accent', members: [{ kind: 'family', id: 'accents' }] },
      },
    ],
  });
  return withOrigins(source, input, [
    {
      id: 'controls',
      colorIds: ['control-light', 'control-dark'],
      familyIds: ['controls'],
      scaleIds: ['control-scale'],
      ruleIds: ['proposal:control'],
    },
    {
      id: 'accents',
      colorIds: ['accent-tone'],
      familyIds: ['accents'],
      scaleIds: [],
      ruleIds: ['proposal:accent'],
    },
  ]);
}

describe('independent declared origins and exact retained decisions', () => {
  it('parses a rule fragment before its generated selectors exist and validates them only in the combined build', () => {
    const source = syntheticColorSystemModelV1();
    const combined = independentFamilies(source);
    const leaf = request(source, { colors: [], rules: combined.rules });
    const parsed = parseColorSystemProposalRequestV1(source, leaf);
    expect(parsed.request.rules).toEqual([...leaf.rules].sort((a, b) => a.id.localeCompare(b.id)));
    expect(Object.keys(parsed).sort()).toEqual(['proposalHash', 'request']);
    expect(() => buildColorSystemProposalV1(source, parsed.request)).toThrow('Unknown reference');
    const final = buildColorSystemProposalV1(source, { ...combined, rules: parsed.request.rules });
    expect(final.pendingRuleIds).toEqual(
      expect.arrayContaining(['proposal:accent', 'proposal:control'])
    );
    expect(parseColorSystemProposalRequestV1(source, combined).proposalHash).toBe(
      final.proposalHash
    );
    const reviewedInput = reviewed(source, combined);
    const adopted = buildColorSystemProposalV1(source, reviewedInput);
    expect(
      parseColorSystemProposalRequestV1(source, {
        ...reviewedInput,
        retainedAdoptions: adopted.workingModel.adoptions.filter(item =>
          item.ruleId.startsWith('proposal:')
        ),
      }).proposalHash
    ).toBe(final.proposalHash);
  });

  it('rejects malformed rule grammar, scopes and decision records at request-only parsing', () => {
    const source = syntheticColorSystemModelV1();
    const input = request(source, { colors: [], rules: independentFamilies(source).rules });
    const first = input.rules[0];
    for (const rule of [
      { ...first, kind: 'unknown' },
      { ...first, force: 'unknown' },
      { ...first, contextIds: ['interface'] },
      { ...first, modeIds: [] },
      { ...first, operands: { ...first.operands, extra: true } },
      { ...first, operands: { role: 'control', members: [] } },
      { ...first, operands: { role: 'control', members: [{ kind: 'unknown', id: 'controls' }] } },
      {
        ...first,
        operands: {
          role: 'control',
          members: [
            { kind: 'family', id: 'controls' },
            { kind: 'family', id: 'controls' },
          ],
        },
      },
    ])
      expect(() =>
        parseColorSystemProposalRequestV1(source, { ...input, rules: [rule] })
      ).toThrow();
    expect(() =>
      parseColorSystemProposalRequestV1(source, {
        ...input,
        review: {
          reviewedProposalHash: deterministicContentHash('declared review'),
          decisions: [{ ...decision(first.id), status: 'invented' }],
        },
      })
    ).toThrow('Unknown rule decision');
    const getter = vi.fn(() => first.operands);
    const hostile = { ...first };
    Object.defineProperty(hostile, 'operands', { enumerable: true, get: getter });
    expect(() => parseColorSystemProposalRequestV1(source, { ...input, rules: [hostile] })).toThrow(
      'accessors'
    );
    expect(getter).not.toHaveBeenCalled();
    const external = structuredClone(input);
    const parsed = parseColorSystemProposalRequestV1(source, external);
    Object.assign(external.rules[0], { label: 'mutated' });
    expect(parsed.request.rules.find(rule => rule.id === first.id)?.label).toBe(first.label);
  });

  it('retains a control decision after an unrelated accent edit without rehashing its attribution', () => {
    const source = syntheticColorSystemModelV1();
    const input = independentFamilies(source);
    const accepted = buildColorSystemProposalV1(source, reviewed(source, input));
    const control = accepted.workingModel.adoptions.find(
      item => item.ruleId === 'proposal:control'
    )!;
    const accent = accepted.workingModel.adoptions.find(item => item.ruleId === 'proposal:accent')!;
    const next = independentFamilies(source, 0.8);
    const result = buildColorSystemProposalV1(source, {
      ...next,
      retainedAdoptions: [control, accent],
    });
    expect(result.proposalHash).toBe(buildColorSystemProposalV1(source, next).proposalHash);
    expect(result.proposalHash).not.toBe(accepted.proposalHash);
    expect(result.workingModel.adoptions.find(item => item.ruleId === control.ruleId)).toEqual(
      control
    );
    expect(
      result.workingModel.adoptions.find(item => item.ruleId === accent.ruleId)
    ).toBeUndefined();
    expect(result.retention).toEqual({
      retainedRuleIds: [control.ruleId],
      staleRuleIds: [accent.ruleId],
    });
    expect(result.pendingRuleIds).toContain(accent.ruleId);
    const beforeColor = accepted.workingModel.colors.find(item => item.id === 'control-dark')!;
    expect(result.workingModel.colors.find(item => item.id === beforeColor.id)).toEqual(
      beforeColor
    );
    expect(result.workingModel.sources.find(item => item.id === beforeColor.sourceId)).toEqual(
      accepted.workingModel.sources.find(item => item.id === beforeColor.sourceId)
    );
    expect(result.sourceAssessmentModel.families).toEqual(source.families);
    expect(result.sourceAssessmentModel.rules).toEqual(source.rules);
    expect(result.derivationStatus).toBe('declared-not-recomputed');
    expect(
      result.workingModel.sources.find(item => item.id === beforeColor.sourceId)
    ).toMatchObject({ status: 'draft', freshnessMode: 'imported-snapshot' });
  });

  it.each(['value', 'membership', 'scale', 'rule', 'derivation'] as const)(
    'drops a retained decision after its %s dependency changes',
    kind => {
      const source = syntheticColorSystemModelV1();
      const input = independentFamilies(source);
      const accepted = buildColorSystemProposalV1(source, reviewed(source, input));
      const adoption = accepted.workingModel.adoptions.find(
        item => item.ruleId === 'proposal:control'
      )!;
      const changed: ColorSystemProposalRequestV1 = {
        ...input,
        retainedAdoptions: [adoption],
        ...(kind === 'value'
          ? {
              colors: input.colors.map(color =>
                color.id === 'control-dark'
                  ? {
                      ...color,
                      valuesByMode: {
                        Day: buildColorSystemSrgbValueV1({ r: 0.200000000000001, g: 0.3, b: 0.4 }),
                      },
                    }
                  : color
              ),
            }
          : kind === 'membership'
            ? {
                families: input.families.map(family =>
                  family.id === 'controls'
                    ? { ...family, colorIds: [...family.colorIds, 'blue'] }
                    : family
                ),
              }
            : kind === 'scale'
              ? {
                  scales: input.scales.map(scale => ({
                    ...scale,
                    slots: scale.slots.map((slot, index) =>
                      index ? { ...slot, position: 3 } : slot
                    ),
                  })),
                }
              : kind === 'rule'
                ? {
                    rules: input.rules.map(rule =>
                      rule.id === adoption.ruleId ? { ...rule, force: 'preference' } : rule
                    ),
                  }
                : {
                    origins: input.origins!.map(origin =>
                      origin.id === 'controls'
                        ? {
                            ...origin,
                            derivation: {
                              ...origin.derivation,
                              inputHash: deterministicContentHash('different input'),
                            },
                          }
                        : origin
                    ),
                  }),
      };
      const result = buildColorSystemProposalV1(source, changed);
      expect(result.retention).toEqual({ retainedRuleIds: [], staleRuleIds: [adoption.ruleId] });
      expect(
        result.workingModel.adoptions.find(item => item.ruleId === adoption.ruleId)
      ).toBeUndefined();
      expect(result.pendingRuleIds).toContain(adoption.ruleId);
    }
  );

  it('lets a fresh exact review deliberately override retained decisions', () => {
    const source = syntheticColorSystemModelV1();
    const input = independentFamilies(source);
    const accepted = buildColorSystemProposalV1(source, reviewed(source, input));
    const retained = accepted.workingModel.adoptions.filter(item =>
      item.ruleId.startsWith('proposal:')
    );
    const next = { ...input, retainedAdoptions: retained };
    const result = buildColorSystemProposalV1(
      source,
      reviewed(source, next, [
        { ...decision('proposal:control', 'rejected'), decisionRef: 'synthetic:new-review' },
      ])
    );
    expect(
      result.workingModel.adoptions.find(item => item.ruleId === 'proposal:control')
    ).toMatchObject({ status: 'rejected', decisionRef: 'synthetic:new-review' });
    expect(result.retention?.retainedRuleIds).toEqual(['proposal:accent']);
    const stale = buildColorSystemProposalV1(source, {
      ...next,
      review: {
        reviewedProposalHash: deterministicContentHash('stale'),
        decisions: [decision('proposal:control', 'rejected')],
      },
    });
    expect(stale.workingModel.adoptions.find(item => item.ruleId === 'proposal:control')).toEqual(
      retained.find(item => item.ruleId === 'proposal:control')
    );
  });

  it('rejects duplicate, malformed and out-of-scope decisions and reports forged bindings as stale', () => {
    const source = syntheticColorSystemModelV1();
    const input = independentFamilies(source);
    const accepted = buildColorSystemProposalV1(source, reviewed(source, input));
    const adoption = accepted.workingModel.adoptions.find(
      item => item.ruleId === 'proposal:control'
    )!;
    expect(() =>
      buildColorSystemProposalV1(source, { ...input, retainedAdoptions: [adoption, adoption] })
    ).toThrow('Repeated retained');
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        retainedAdoptions: [{ ...adoption, dependencyHash: 'forged' }],
      })
    ).toThrow('content hash');
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        retainedAdoptions: [source.adoptions.find(item => item.ruleId === 'rule:role')!],
      })
    ).toThrow('outside the brief');
    for (const forged of [
      { ...adoption, ruleHash: deterministicContentHash('forged rule') },
      { ...adoption, dependencyHash: deterministicContentHash('forged dependencies') },
      { ...adoption, ruleId: 'missing:rule' },
    ]) {
      const result = buildColorSystemProposalV1(source, { ...input, retainedAdoptions: [forged] });
      expect(result.retention?.staleRuleIds).toEqual([forged.ruleId]);
      expect(result.workingModel.adoptions.some(item => item.ruleId === forged.ruleId)).toBe(false);
    }
  });

  it('requires the current scoped attributed replacement for every effective retained rejection', () => {
    const source = syntheticColorSystemModelV1();
    const raw = exceptionRequest(source);
    const input = withOrigins(source, raw, [
      {
        id: 'extension',
        colorIds: ['proposed-tone'],
        familyIds: [],
        scaleIds: [],
        ruleIds: ['proposal:palette'],
      },
    ]);
    const accepted = buildColorSystemProposalV1(
      source,
      reviewed(source, input, [decision('rule:palette', 'rejected'), decision('proposal:palette')])
    );
    const retainedAdoptions = accepted.workingModel.adoptions.filter(item =>
      ['rule:palette', 'proposal:palette'].includes(item.ruleId)
    );
    expect(
      buildColorSystemProposalV1(source, { ...input, retainedAdoptions }).retention?.retainedRuleIds
    ).toEqual(['proposal:palette', 'rule:palette']);
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        retainedAdoptions: retainedAdoptions.filter(item => item.ruleId === 'rule:palette'),
      })
    ).toThrow('accepted replacement');
    expect(() =>
      buildColorSystemProposalV1(source, { ...input, exceptions: [], retainedAdoptions })
    ).toThrow('accepted replacement');
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        retainedAdoptions: retainedAdoptions.map(item =>
          item.ruleId === 'proposal:palette' ? { ...item, decisionRef: 'unrelated decision' } : item
        ),
      })
    ).toThrow('accepted replacement');
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        retainedAdoptions,
        rules: input.rules.map(rule => ({ ...rule, label: 'Changed replacement definition' })),
      })
    ).toThrow('accepted replacement');
  });

  it('requires complete exact origin coverage and rejects dangling, duplicate or colliding origins', () => {
    const source = syntheticColorSystemModelV1();
    const input = independentFamilies(source);
    const origins = input.origins!;
    expect(() => buildColorSystemProposalV1(source, { ...input, origins: [] })).toThrow(
      'distinct identities'
    );
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        origins: [origins[0], origins[0], origins[1]],
      })
    ).toThrow('distinct identities');
    expect(() => buildColorSystemProposalV1(source, { ...input, origins: [origins[0]] })).toThrow(
      'Every changed entity'
    );
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        origins: origins.map((origin, index) =>
          index ? origin : { ...origin, colorIds: [...origin.colorIds, 'blue'] }
        ),
      })
    ).toThrow('unchanged or unknown');
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        origins: [
          ...origins,
          { ...origins[0], id: 'empty', colorIds: [], familyIds: [], scaleIds: [], ruleIds: [] },
        ],
      })
    ).toThrow('at least one changed');
    const proposed = buildColorSystemProposalV1(source, input);
    const originSource = proposed.workingModel.sources.find(item =>
      item.id.startsWith('proposal-origin:')
    )!;
    const { modelHash: _modelHash, ...content } = source;
    const collision = buildColorSystemModelV1({
      ...content,
      sources: [...source.sources, originSource],
      coverage: [
        ...source.coverage,
        proposed.workingModel.coverage.find(item => item.sourceId === originSource.id)!,
      ],
      evidence: proposed.workingModel.evidence
        .filter(item => item.sourceId === originSource.id)
        .concat(source.evidence),
    });
    expect(() =>
      buildColorSystemProposalV1(collision, { ...input, sourceModelHash: collision.modelHash })
    ).toThrow('Origin provenance identity collides');
  });

  it('keeps every contributing origin link, deterministic source ownership and original structural links', () => {
    const source = syntheticColorSystemModelV1();
    const input = independentFamilies(source);
    const shared = {
      ...input,
      origins: input.origins!.map(origin =>
        origin.id === 'accents'
          ? { ...origin, colorIds: [...origin.colorIds, 'control-dark'] }
          : origin
      ),
    };
    const first = buildColorSystemProposalV1(source, shared);
    const second = buildColorSystemProposalV1(source, {
      ...shared,
      origins: [...shared.origins].reverse(),
    });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    const sharedColor = first.workingModel.colors.find(item => item.id === 'control-dark')!;
    expect(sharedColor.evidenceRefs).toHaveLength(2);
    expect(sharedColor.claimIds).toHaveLength(2);
    expect(first.workingModel.sources.find(item => item.id === sharedColor.sourceId)?.label).toBe(
      'Working joint origins accents, controls'
    );
    expect(
      sharedColor.evidenceRefs.map(
        id => first.workingModel.evidence.find(item => item.id === id)?.sourceId
      )
    ).toEqual([sharedColor.sourceId, sharedColor.sourceId]);
    expect(
      sharedColor.evidenceRefs.map(
        id => first.workingModel.evidence.find(item => item.id === id)?.locator
      )
    ).toEqual(['proposal-origin:accents', 'proposal-origin:controls']);
    const extension = request(source, { families: familyExtension(source) });
    const result = buildColorSystemProposalV1(
      source,
      withOrigins(source, extension, [
        {
          id: 'family-extension',
          colorIds: ['proposed-tone'],
          familyIds: ['pigments'],
          scaleIds: [],
          ruleIds: [],
        },
      ])
    );
    const before = source.families.find(item => item.id === 'pigments')!;
    const after = result.workingModel.families.find(item => item.id === before.id)!;
    expect(after.evidenceRefs).toEqual(expect.arrayContaining([...before.evidenceRefs]));
    expect(after.claimIds).toEqual(expect.arrayContaining([...before.claimIds]));
    expect(after.evidenceRefs.length).toBe(before.evidenceRefs.length + 1);
    expect(result.sourceAssessmentModel.families).toEqual(source.families);
  });

  it('detaches origin and retained decision data without reading accessors', () => {
    const source = syntheticColorSystemModelV1();
    const input = independentFamilies(source);
    const accepted = buildColorSystemProposalV1(source, reviewed(source, input));
    const adoption = accepted.workingModel.adoptions.find(
      item => item.ruleId === 'proposal:control'
    )!;
    const mutable = structuredClone({ ...input, retainedAdoptions: [adoption] });
    const result = buildColorSystemProposalV1(source, mutable);
    Object.assign(mutable.origins![0].derivation, {
      inputHash: deterministicContentHash('mutation'),
    });
    Object.assign(mutable.retainedAdoptions[0].actor, { ref: 'forged actor' });
    expect(result.workingModel.adoptions.find(item => item.ruleId === adoption.ruleId)).toEqual(
      adoption
    );
    expect(result.request.origins).toEqual(
      buildColorSystemProposalV1(source, input).request.origins
    );
    const get = vi.fn(() => adoption.dependencyHash);
    const hostile = { ...adoption };
    Object.defineProperty(hostile, 'dependencyHash', { enumerable: true, get });
    expect(() =>
      buildColorSystemProposalV1(source, { ...input, retainedAdoptions: [hostile] })
    ).toThrow('accessors');
    expect(get).not.toHaveBeenCalled();
  });

  it('retains decisions for a shared two-mode color while a separate accent origin changes', () => {
    const source = syntheticColorSystemModelV1();
    const day = independentFamilies(source);
    const night = request(source, {
      id: 'control-night-fragment',
      brief: { ...day.brief, modeIds: ['Night'] },
      colors: [
        {
          id: 'control-dark',
          label: 'Control dark',
          valuesByMode: { Night: buildColorSystemSrgbValueV1({ r: 0.7, g: 0.8, b: 0.9 }) },
        },
      ],
    });
    const nightOrigin: ColorSystemProposalOriginV1 = {
      id: 'controls-night',
      sourceHash: buildColorSystemProposalV1(source, night).proposalHash,
      derivation: night.derivation,
      colorIds: ['control-dark'],
      familyIds: [],
      scaleIds: [],
      ruleIds: [],
    };
    const combine = (input: ColorSystemProposalRequestV1): ColorSystemProposalRequestV1 => ({
      ...input,
      brief: { ...input.brief, modeIds: ['Day', 'Night'] },
      colors: input.colors.map(color =>
        color.id === 'control-dark'
          ? { ...color, valuesByMode: { ...color.valuesByMode, ...night.colors[0].valuesByMode } }
          : color
      ),
      origins: [...input.origins!, nightOrigin],
    });
    const input = combine(day);
    const accepted = buildColorSystemProposalV1(source, reviewed(source, input));
    const adoption = accepted.workingModel.adoptions.find(
      item => item.ruleId === 'proposal:control'
    )!;
    const next = buildColorSystemProposalV1(source, {
      ...combine(independentFamilies(source, 0.8)),
      retainedAdoptions: [adoption],
    });
    const shared = next.workingModel.colors.find(color => color.id === 'control-dark')!;
    expect(shared.valuesByMode.Night).toEqual(night.colors[0].valuesByMode.Night);
    expect(shared.valuesByMode.Day).toEqual(
      day.colors.find(color => color.id === shared.id)!.valuesByMode.Day
    );
    expect(shared).toEqual(accepted.workingModel.colors.find(color => color.id === shared.id));
    expect(shared.evidenceRefs).toHaveLength(2);
    expect(next.workingModel.adoptions.find(item => item.ruleId === adoption.ruleId)).toEqual(
      adoption
    );
    expect(next.retention).toEqual({ retainedRuleIds: [adoption.ruleId], staleRuleIds: [] });
  });

  it('fails the combined source bound instead of losing a contributing origin', () => {
    const source = syntheticColorSystemModelV1();
    const input = request(source);
    const origin: ColorSystemProposalOriginV1 = {
      id: 'leaf',
      sourceHash: buildColorSystemProposalV1(source, input).proposalHash,
      derivation: input.derivation,
      colorIds: ['proposed-tone'],
      familyIds: [],
      scaleIds: [],
      ruleIds: [],
    };
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        origins: Array.from({ length: 31 }, (_, index) => ({ ...origin, id: `leaf-${index}` })),
      })
    ).toThrow('combined source bound');
  });
});

describe('separate authored-source and working-proposal assessment', () => {
  it('preserves the byte-identical legacy proposal output without origin or retention fields', () => {
    const source = syntheticColorSystemModelV1();
    const basic = request(source);
    const extension = request(source, { families: familyExtension(source) });
    const replacement = exceptionRequest(source);
    const cases = [
      basic,
      extension,
      reviewed(source, extension),
      reviewed(source, replacement, [
        decision('rule:palette', 'rejected'),
        decision('proposal:palette'),
      ]),
      request(source, { colors: [], brief: { ...basic.brief, operation: 'apply' } }),
    ];
    const raw = JSON.stringify(cases.map(input => buildColorSystemProposalV1(source, input)));
    expect(createHash('sha256').update(raw).digest('hex')).toBe(
      '98f1981fd4e9787d25d72ad3100ddfbb8d5750247b10bd5595a282ee1273c570'
    );
  });

  it('keeps native values and original records immutable without granting source-family membership', () => {
    const source = syntheticColorSystemModelV1();
    const original = JSON.stringify(source);
    const input = request(source);
    const compiled = compileColorSystemProposalV1(source, input);
    const proposal = compiled.proposal;
    expect(
      proposal.sourceAssessmentModel.colors.find(color => color.id === 'proposed-tone')!
        .valuesByMode.Day
    ).toEqual(input.colors[0].valuesByMode.Day);
    expect(proposal.sourceAssessmentModel.families).toEqual(source.families);
    expect(proposal.sourceAssessmentModel.scales).toEqual(source.scales);
    expect(proposal.sourceAssessmentModel.rules).toEqual(source.rules);
    expect(proposal.sourceAssessmentModel.adoptions).toEqual(source.adoptions);
    expect(proposal.sourceAssessmentModel.conflicts).toEqual(source.conflicts);
    expect(proposal.sourceAssessmentModel.modes).toEqual(source.modes);
    for (const color of source.colors)
      expect(proposal.workingModel.colors.find(item => item.id === color.id)).toEqual(color);
    for (const evidence of source.evidence)
      expect(proposal.workingModel.evidence.find(item => item.id === evidence.id)).toEqual(
        evidence
      );
    expect(JSON.stringify(source)).toBe(original);
    const assessment = compiled.evaluate(application());
    expect(
      assessment.sourceCompliance.rules.find(rule => rule.ruleId === 'rule:palette')
    ).toMatchObject({ status: 'fail', satisfied: false });
    expect(
      assessment.workingAssessment.rules.find(rule => rule.ruleId === 'rule:palette')
    ).toMatchObject({ status: 'fail' });
    expect(assessment).toMatchObject({
      status: 'proposed',
      qualified: false,
      derivationStatus: 'declared-not-recomputed',
    });
    expect(
      proposal.workingModel.sources.find(item => item.id.startsWith('proposal:'))
    ).toMatchObject({
      status: 'draft',
      freshnessMode: 'imported-snapshot',
      sourceHash: proposal.proposalHash,
    });
  });

  it('invalidates affected decisions while retaining unrelated original decisions unchanged', () => {
    const source = syntheticColorSystemModelV1();
    const input = request(source, { families: familyExtension(source) });
    const proposal = buildColorSystemProposalV1(source, input);
    expect(proposal.pendingRuleIds).toEqual(
      expect.arrayContaining(['rule:palette', 'rule:count', 'rule:prominence'])
    );
    expect(
      proposal.workingModel.adoptions.find(item => item.ruleId === 'rule:palette')
    ).toBeUndefined();
    expect(proposal.workingModel.adoptions.find(item => item.ruleId === 'rule:role')).toEqual(
      source.adoptions.find(item => item.ruleId === 'rule:role')
    );
    const unreviewed = compileColorSystemProposalV1(source, input).evaluate(application());
    expect(unreviewed.workingAssessment.eligible).toBe(false);
    expect(
      unreviewed.workingAssessment.rules.find(rule => rule.ruleId === 'rule:palette')
    ).toMatchObject({ status: 'unresolved', adoption: 'unreviewed', satisfied: true });
    expect(
      unreviewed.sourceCompliance.rules.find(rule => rule.ruleId === 'rule:palette')
    ).toMatchObject({ satisfied: false });
    const accepted = compileColorSystemProposalV1(source, reviewed(source, input));
    expect(accepted.evaluate(application()).workingAssessment).toMatchObject({
      eligible: true,
      sourceConfidence: 'provisional',
    });
    expect(accepted.evaluate(application()).sourceCompliance.eligible).toBe(false);
    expect(
      accepted.proposal.workingModel.adoptions.find(item => item.ruleId === 'rule:palette')!
        .dependencyHash
    ).not.toBe(source.adoptions.find(item => item.ruleId === 'rule:palette')!.dependencyHash);
  });

  it('leaves changed decisions unreviewed when a receipt is missing or stale', () => {
    const source = syntheticColorSystemModelV1();
    const input = request(source, { families: familyExtension(source) });
    const accepted = reviewed(source, input);
    const next = {
      ...accepted,
      colors: [
        {
          ...accepted.colors[0],
          valuesByMode: {
            Day: buildColorSystemSrgbValueV1({ r: 0.345678901234568, g: 0.6, b: 0.8 }),
          },
        },
      ],
    };
    const first = buildColorSystemProposalV1(source, accepted);
    const stale = buildColorSystemProposalV1(source, next);
    expect(first.proposalHash).not.toBe(stale.proposalHash);
    expect(stale.reviewStatus).toBe('stale');
    expect(stale.pendingRuleIds).toContain('rule:palette');
    expect(
      stale.workingModel.adoptions.find(item => item.ruleId === 'rule:palette')
    ).toBeUndefined();
    expect(stale.sourceAssessmentModel.adoptions).toEqual(source.adoptions);
  });

  it.each(['mode', 'context'] as const)(
    'rejects an exception that would disable the source rule outside the requested %s scope',
    boundary => {
      const input = syntheticColorSystemModelInputV1();
      const draft = buildColorSystemModelV1({
        ...input,
        rules: input.rules.map(rule =>
          rule.id === 'rule:palette'
            ? {
                ...rule,
                contextIds:
                  boundary === 'context' ? ['communications', 'interface'] : rule.contextIds,
                modeIds: boundary === 'context' ? ['Day'] : rule.modeIds,
              }
            : rule
        ),
        adoptions: [],
      });
      const { modelHash: _modelHash, ...content } = draft;
      const source = buildColorSystemModelV1({
        ...content,
        adoptions: buildColorSystemRuleAdoptionsV1(
          draft,
          draft.rules.map(rule => decision(rule.id))
        ),
      });
      const original = structuredClone(source);
      const partial = exceptionRequest(source, false);
      expect(() => buildColorSystemProposalV1(source, partial)).toThrow(
        'Partial-scope rule replacement'
      );
      expect(source).toEqual(original);
    }
  );

  it('requires an attributed exception plus an accepted new proposal replacement before rejecting an original', () => {
    const source = syntheticColorSystemModelV1();
    const input = exceptionRequest(source);
    expect(() =>
      buildColorSystemProposalV1(
        source,
        reviewed(source, input, [decision('rule:palette', 'rejected')])
      )
    ).toThrow('accepted replacement');
    const replacementDecision = decision('proposal:palette');
    expect(() =>
      buildColorSystemProposalV1(
        source,
        reviewed(source, input, [
          decision('rule:palette', 'rejected'),
          { ...replacementDecision, actor: { kind: 'agent', ref: 'another-reviewer' } },
        ])
      )
    ).toThrow('same review decision');
    const compiled = compileColorSystemProposalV1(
      source,
      reviewed(source, input, [decision('rule:palette', 'rejected'), replacementDecision])
    );
    const assessment = compiled.evaluate(application());
    expect(assessment.workingAssessment.eligible).toBe(true);
    expect(
      assessment.workingAssessment.rules.find(rule => rule.ruleId === 'rule:palette')
    ).toMatchObject({ status: 'rejected' });
    expect(
      assessment.workingAssessment.rules.find(rule => rule.ruleId === 'proposal:palette')
    ).toMatchObject({ status: 'pass' });
    expect(
      assessment.sourceCompliance.rules.find(rule => rule.ruleId === 'rule:palette')
    ).toMatchObject({ status: 'fail', adoption: 'accepted' });
    expect(compiled.proposal.workingModel.rules.find(rule => rule.id === 'rule:palette')).toEqual(
      source.rules.find(rule => rule.id === 'rule:palette')
    );
    expect(
      compiled.proposal.workingModel.rules.find(rule => rule.id === 'proposal:palette')?.origin
    ).toBe('proposal');
    expect(compiled.proposal.request.exceptions).toEqual(input.exceptions);
  });

  it('rejects removal of exception bindings, source-rule overwrite, and incomplete replacement scope', () => {
    const source = syntheticColorSystemModelV1();
    const input = exceptionRequest(source);
    const without = { ...input, exceptions: [] };
    expect(() =>
      buildColorSystemProposalV1(
        source,
        reviewed(source, without, [
          decision('rule:palette', 'rejected'),
          decision('proposal:palette'),
        ])
      )
    ).toThrow('attributed exception');
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        rules: [{ ...input.rules[0], id: 'rule:palette' }],
      })
    ).toThrow('cannot be overwritten');
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        rules: [{ ...input.rules[0], modeIds: ['Day'] }],
      })
    ).toThrow('throughout the requested scope');
  });

  it('allows a structure-only scale proposal using unchanged source anchors', () => {
    const source = syntheticColorSystemModelV1();
    const input = request(source, {
      colors: [],
      scales: [
        {
          id: 'proposal:related-scale',
          label: 'Proposed related authored layout',
          familyId: 'pigments',
          slots: [
            { id: 'pale', position: 0 },
            { id: 'missing', position: 0.5 },
            { id: 'deep', position: 1 },
          ],
          modes: [
            {
              modeId: 'Day',
              anchors: [
                { slotId: 'pale', colorId: 'blue-pale' },
                { slotId: 'deep', colorId: 'blue-deep' },
              ],
            },
          ],
        },
      ],
    });
    const proposal = buildColorSystemProposalV1(source, input);
    expect(proposal.sourceAssessmentModel).toEqual(source);
    expect(proposal.workingModel.colors).toEqual(source.colors);
    expect(proposal.workingModel.adoptions).toEqual(source.adoptions);
    expect(
      proposal.workingModel.scales.find(scale => scale.id === 'proposal:related-scale')?.modes[0]
        .anchors
    ).toEqual(input.scales[0].modes[0].anchors);
    expect(proposal.workingModel.families).toEqual(source.families);
    expect(proposal.derivationStatus).toBe('declared-not-recomputed');
  });

  it('permits an explicit additive scale fill and keeps all original pins and other modes', () => {
    const source = syntheticColorSystemModelV1();
    const {
      evidenceRefs: _e,
      claimIds: _c,
      ...old
    } = source.scales.find(scale => scale.id === 'blue-scale')!;
    const changed = {
      ...old,
      slots: [...old.slots, { id: 'proposal-slot', position: 4 }],
      modes: old.modes.map(mode =>
        mode.modeId === 'Day'
          ? {
              ...mode,
              anchors: [...mode.anchors, { slotId: 'proposal-slot', colorId: 'proposed-tone' }],
            }
          : mode
      ),
    };
    const input = request(source, { families: familyExtension(source), scales: [changed] });
    const proposal = buildColorSystemProposalV1(source, input);
    expect(proposal.sourceAssessmentModel.scales).toEqual(source.scales);
    expect(
      proposal.workingModel.scales
        .find(scale => scale.id === old.id)
        ?.modes.find(mode => mode.modeId === 'Night')
    ).toEqual(old.modes.find(mode => mode.modeId === 'Night'));
    expect(proposal.pendingRuleIds).toContain('rule:partner');
    const removed = {
      ...changed,
      modes: changed.modes.map(mode =>
        mode.modeId === 'Day' ? { ...mode, anchors: mode.anchors.slice(1) } : mode
      ),
    };
    expect(() => buildColorSystemProposalV1(source, { ...input, scales: [removed] })).toThrow(
      'exact anchor identities'
    );
    const moved = {
      ...changed,
      slots: changed.slots.map((slot, i) => (i === 0 ? { ...slot, position: -1 } : slot)),
    };
    expect(() => buildColorSystemProposalV1(source, { ...input, scales: [moved] })).toThrow();
  });

  it('enforces explicit permissions and refuses every mutation under apply', () => {
    const source = syntheticColorSystemModelV1();
    const input = request(source);
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        brief: { ...input.brief, permissions: { ...input.brief.permissions, addColors: false } },
      })
    ).toThrow('does not permit');
    const family = { ...input, families: familyExtension(source) };
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...family,
        brief: { ...input.brief, permissions: { ...input.brief.permissions, editFamilyIds: [] } },
      })
    ).toThrow('Family change');
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        brief: { ...input.brief, operation: 'apply' },
      })
    ).toThrow('Apply does not permit');
    const apply = request(source, { colors: [], brief: { ...input.brief, operation: 'apply' } });
    expect(buildColorSystemProposalV1(source, apply).workingModel).toEqual(source);
    expect(() =>
      buildColorSystemProposalV1(source, { ...apply, families: familyExtension(source) })
    ).toThrow('Apply does not permit');
  });

  it('enforces brief context and mode on rules, changes, reviews and applications', () => {
    const source = syntheticColorSystemModelV1();
    const input = request(source);
    const compiled = compileColorSystemProposalV1(source, input);
    expect(() => compiled.evaluate({ ...application(), contextId: 'interface' })).toThrow(
      'brief scope'
    );
    expect(() => compiled.evaluate({ ...application(), modeId: 'Night' })).toThrow('brief scope');
    expect(() =>
      buildColorSystemProposalV1(source, reviewed(source, input, [decision('rule:role')]))
    ).toThrow('outside the brief');
    const extraMode = {
      ...input,
      colors: [
        {
          ...input.colors[0],
          valuesByMode: {
            Day: input.colors[0].valuesByMode.Day,
            Night: input.colors[0].valuesByMode.Day,
          },
        },
      ],
    };
    expect(() => buildColorSystemProposalV1(source, extraMode)).toThrow('requested modes');
    const exception = exceptionRequest(source);
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...exception,
        rules: [{ ...exception.rules[0], contextIds: ['interface'] }],
      })
    ).toThrow('scope exceeds');
  });

  it('preserves unresolved source conflicts and numeric gaps in source comparison', () => {
    const original = syntheticColorSystemModelInputV1();
    const claim = {
      id: 'gap:ink',
      sourceId: original.sources[0].id,
      text: 'Missing exact numeric ink authority.',
      status: 'unresolved' as const,
      evidenceRefs: ['evidence:values'],
      contextIds: [],
      ruleIds: [],
      modeIds: ['Day'],
    };
    const input = {
      ...original,
      colors: original.colors.map(color =>
        color.id === 'ink'
          ? {
              ...color,
              valuesByMode: { Night: color.valuesByMode.Night },
              valueGapClaimIdsByMode: { Day: ['gap:ink'] },
              claimIds: [...color.claimIds, claim.id],
            }
          : color
      ),
      claims: [...original.claims, claim],
      coverage: original.coverage.map(item => ({ ...item, unresolvedClaimIds: [claim.id] })),
      conflicts: [
        {
          id: 'conflict:ink',
          message: 'Numeric authority unresolved.',
          status: 'unresolved' as const,
          claimIds: [claim.id, 'claim:values'],
          evidenceRefs: ['evidence:values'],
          contextIds: [],
          ruleIds: [],
          colorIds: ['ink'],
          modeIds: ['Day'],
        },
      ],
      adoptions: [],
    };
    const source = buildColorSystemModelV1({
      ...input,
      adoptions: buildColorSystemRuleAdoptionsV1(
        input,
        original.adoptions.map(({ ruleHash: _r, dependencyHash: _d, ...item }) => item)
      ),
    });
    const compiled = compileColorSystemProposalV1(source, request(source));
    expect(compiled.proposal.sourceAssessmentModel.conflicts).toEqual(source.conflicts);
    expect(
      compiled.proposal.sourceAssessmentModel.colors.find(color => color.id === 'ink')
    ).toEqual(source.colors.find(color => color.id === 'ink'));
    const result = compiled.evaluate(application('ink')).sourceCompliance;
    expect(result.eligible).toBe(false);
    expect(result.unresolvedClaimIds).toContain('gap:ink');
    expect(result.blockers.some(item => item.id === 'value:ink:Day')).toBe(true);
  });

  it('binds source, brief, structural edits, native channels, and declared provider receipts before decisions', () => {
    const source = syntheticColorSystemModelV1();
    const input = request(source);
    const baseline = buildColorSystemProposalV1(source, input);
    const changedBrief = {
      ...input,
      brief: { ...input.brief, briefHash: deterministicContentHash('another frozen brief') },
    };
    expect(buildColorSystemProposalV1(source, changedBrief).proposalHash).not.toBe(
      baseline.proposalHash
    );
    const provider = {
      id: 'radix' as const,
      sourceVersion: '3.0.0',
      catalogHash: deterministicContentHash('catalog'),
      candidateHash: deterministicContentHash('candidate'),
      queryHash: deterministicContentHash('query'),
      policyHash: deterministicContentHash('retrieval'),
    };
    const declared = buildColorSystemProposalV1(source, {
      ...input,
      derivation: { ...input.derivation, provider },
    });
    expect(declared.proposalHash).not.toBe(baseline.proposalHash);
    expect(declared.derivationStatus).toBe('declared-not-recomputed');
    const accepted = buildColorSystemProposalV1(source, reviewed(source, input, []));
    expect(accepted.proposalHash).toBe(baseline.proposalHash);
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        sourceModelHash: deterministicContentHash('stale source'),
      })
    ).toThrow('Source model is stale');
  });

  it('rejects exact source ID reuse, removed source family members and combined model overflow', () => {
    const source = syntheticColorSystemModelV1();
    const input = request(source);
    expect(() =>
      buildColorSystemProposalV1(source, { ...input, colors: [{ ...input.colors[0], id: 'blue' }] })
    ).toThrow('cannot be overwritten');
    const family = familyExtension(source)[0];
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...input,
        families: [{ ...family, colorIds: family.colorIds.filter(id => id !== 'blue') }],
      })
    ).toThrow();
    const colors = Array.from({ length: 256 }, (_, i) => ({ ...input.colors[0], id: `new-${i}` }));
    expect(() => buildColorSystemProposalV1(source, { ...input, colors })).toThrow();
  });

  it('detaches request/model data and rejects executable, prototype-bearing, cyclic or malformed input', () => {
    const source = syntheticColorSystemModelV1();
    const input = request(source);
    const getter = vi.fn(() => []);
    const data = JSON.parse(JSON.stringify(input));
    Object.defineProperty(data, 'colors', { enumerable: true, get: getter });
    expect(() => buildColorSystemProposalV1(source, data)).toThrow(/accessors/i);
    expect(getter).not.toHaveBeenCalled();
    const inherited = Object.assign(Object.create({ inherited: true }), input);
    expect(() => buildColorSystemProposalV1(source, inherited)).toThrow('plain records');
    const cyclic = JSON.parse(JSON.stringify(input));
    cyclic.loop = cyclic;
    expect(() => buildColorSystemProposalV1(source, cyclic)).toThrow('acyclic');
    const unknown = { ...input, sourceEdits: [] };
    expect(() => buildColorSystemProposalV1(source, unknown)).toThrow('unknown field');
    const sparse = { ...input, colors: new Array(3) };
    expect(() => buildColorSystemProposalV1(source, sparse)).toThrow('dense array');
    const external = JSON.parse(JSON.stringify(input));
    const compiled = compileColorSystemProposalV1(source, external);
    const boundHash = compiled.proposal.proposalHash;
    Object.assign(compiled.proposal, {
      proposalHash: deterministicContentHash('forged display artifact'),
    });
    external.colors[0].valuesByMode.Day.components.r = 0;
    external.brief.contextIds.push('interface');
    expect(compiled.proposal.request.colors[0].valuesByMode.Day).toEqual(
      input.colors[0].valuesByMode.Day
    );
    expect(() => compiled.evaluate({ ...application(), contextId: 'interface' })).toThrow(
      'brief scope'
    );
    expect(compiled.evaluate(application()).proposalHash).toBe(boundHash);
  });
});
