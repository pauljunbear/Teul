import { describe, expect, it } from 'vitest';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemEvidenceStatusV1,
  type ColorSystemModelInputV1,
  type ColorSystemScopedRuleV1,
} from '../colorSystemModelV1';
import {
  buildColorSystemContextApplicationV1,
  compileColorSystemRelationshipsV1,
  type ColorSystemContextApplicationV1,
} from '../colorSystemRelationshipsV1';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import {
  syntheticColorSystemModelInputV1,
  syntheticColorSystemModelV1,
} from './fixtures/colorSystemModelV1Fixture';

const color = (id: string) => ({ kind: 'color' as const, id });
function modelInput(rules?: readonly ColorSystemScopedRuleV1[]): ColorSystemModelInputV1 {
  const original = syntheticColorSystemModelInputV1();
  const selected = rules ?? original.rules;
  const input = {
    ...original,
    rules: selected,
    claims: original.claims.map(claim =>
      claim.id === 'claim:rules' ? { ...claim, ruleIds: selected.map(rule => rule.id) } : claim
    ),
    adoptions: [],
  };
  return {
    ...input,
    adoptions: buildColorSystemRuleAdoptionsV1(
      input,
      selected.map(rule => ({
        ruleId: rule.id,
        status: 'accepted',
        actor: { kind: 'agent', ref: 'fixture-reviewer' },
        authorityRef: 'fixture:local-test',
        decisionRef: `fixture:${rule.id}`,
      }))
    ),
  };
}
function onlyRule(id: string): ColorSystemScopedRuleV1 {
  return syntheticColorSystemModelInputV1().rules.find(rule => rule.id === id)!;
}
const application = (colorIds = ['paper', 'warm']): ColorSystemContextApplicationV1 => ({
  id: 'application:synthetic',
  contextId: 'communications',
  modeId: 'Day',
  uses: colorIds.map((colorId, index) => ({
    id: `use:${colorId}`,
    colorId,
    role: colorId === 'paper' ? 'ground' : 'artwork',
    area: 100 / (index + 1),
  })),
  pairs: [],
});
// These fixtures explicitly adopt their edited source before testing relationship behavior.
// Stale-decision rejection is covered independently in the model parser suite.
const evaluate = (input: ColorSystemModelInputV1, app = application()) =>
  compileColorSystemRelationshipsV1(
    buildColorSystemModelV1({
      ...input,
      adoptions: buildColorSystemRuleAdoptionsV1(
        input,
        input.adoptions.map(
          ({ ruleHash: _rule, dependencyHash: _dependencies, ...decision }) => decision
        )
      ),
    })
  ).evaluate(app);

function resolutionInput(
  missingValue: boolean,
  resolutionEvidence: ColorSystemEvidenceStatusV1 | null = 'observed'
): ColorSystemModelInputV1 {
  const original = modelInput([]);
  const gap = {
    ...original.claims[0],
    id: 'claim:gap',
    status: 'unresolved' as const,
    text: 'Numeric source authority is disputed.',
    modeIds: ['Day'],
  };
  const contrary = { ...gap, id: 'claim:contrary', status: 'observed' as const };
  const resolution = {
    ...gap,
    id: 'claim:resolution',
    status: 'observed' as const,
    evidenceRefs: resolutionEvidence === null ? [] : ['evidence:resolution'],
    text: 'An attributed decision resolves the disagreement.',
  };
  return {
    ...original,
    colors: original.colors.map(color =>
      color.id === 'blue'
        ? {
            ...color,
            claimIds: [...color.claimIds, gap.id],
            ...(missingValue
              ? {
                  valuesByMode: { Night: color.valuesByMode.Night },
                  valueGapClaimIdsByMode: { Day: [gap.id] },
                }
              : {}),
          }
        : color
    ),
    claims: [...original.claims, gap, contrary, resolution],
    evidence: [
      ...original.evidence,
      ...(resolutionEvidence === null
        ? []
        : [
            {
              ...original.evidence[0],
              id: 'evidence:resolution',
              status: resolutionEvidence,
            },
          ]),
    ],
    coverage: original.coverage.map(item => ({ ...item, unresolvedClaimIds: [gap.id] })),
    conflicts: [
      {
        id: 'conflict:value',
        message: 'Disputed numeric source authority.',
        status: 'resolved',
        claimIds: [gap.id, contrary.id],
        evidenceRefs: gap.evidenceRefs,
        contextIds: [],
        ruleIds: [],
        colorIds: ['blue'],
        modeIds: ['Day'],
        resolutionClaimId: resolution.id,
      },
    ],
  };
}

describe('scoped authored relationship assessment', () => {
  it('cannot resolve a missing numeric paint into existence through a resolution claim', () => {
    const result = evaluate(resolutionInput(true), application(['blue']));
    expect(result.conflictIds).toEqual([]);
    expect(result.eligible).toBe(false);
    expect(result.sourceConfidence).toBe('unresolved');
    expect(result.blockers.some(item => item.id === 'value:blue:Day')).toBe(true);
  });

  it.each(['unsupported', 'contradicted', 'unresolved', null] as const)(
    'keeps a source conflict blocking when resolution evidence is %s',
    status => {
      const result = evaluate(resolutionInput(false, status), application(['blue']));
      expect(result.eligible).toBe(false);
      expect(result.conflictIds).toContain('conflict:value');
      expect(result.sourceConfidence).toBe('unresolved');
    }
  );

  it.each(['observed', 'inferred'] as const)(
    'allows an evidenced %s resolution while retaining its source claims',
    status => {
      const input = resolutionInput(false, status);
      const result = evaluate(input, application(['blue']));
      expect(result.eligible).toBe(true);
      expect(result.conflictIds).toEqual([]);
      expect(input.claims.find(claim => claim.id === 'claim:gap')?.status).toBe('unresolved');
      if (status === 'inferred') expect(result.sourceConfidence).toBe('provisional');
    }
  );

  it.each(['claim', 'evidence'] as const)(
    'does not clear a shared disputed %s for an unrelated co-present paint',
    kind => {
      const base = resolutionInput(false);
      const input = {
        ...base,
        colors: base.colors.map(color =>
          kind === 'claim' && color.id === 'warm'
            ? { ...color, claimIds: [...color.claimIds, 'claim:gap'] }
            : color
        ),
        evidence: base.evidence.map(item =>
          kind === 'evidence' && item.id === 'evidence:values'
            ? { ...item, status: 'contradicted' as const }
            : item
        ),
      };
      expect(evaluate(input, application(['blue'])).eligible).toBe(true);
      expect(evaluate(input, application(['warm'])).eligible).toBe(false);
      const together = evaluate(input, application(['blue', 'warm']));
      expect(together.eligible).toBe(false);
      expect(together.sourceConfidence).toBe('unresolved');
      if (kind === 'claim') expect(together.unresolvedClaimIds).toContain('claim:gap');
      else expect(together.unresolvedEvidenceRefs).toContain('evidence:values');
    }
  );

  it('does not use a color-only resolution to clear a context-wide dependency', () => {
    const base = resolutionInput(false);
    const input = {
      ...base,
      contexts: base.contexts.map(context =>
        context.id === 'communications'
          ? { ...context, claimIds: [...context.claimIds, 'claim:gap'] }
          : context
      ),
    };
    expect(evaluate(input, application(['blue'])).eligible).toBe(false);
  });

  it('allows separate scoped resolutions to cover each disputed paint', () => {
    const base = resolutionInput(false);
    const input = {
      ...base,
      colors: base.colors.map(color =>
        color.id === 'warm' ? { ...color, claimIds: [...color.claimIds, 'claim:gap'] } : color
      ),
      conflicts: [
        ...base.conflicts,
        { ...base.conflicts[0], id: 'conflict:warm', colorIds: ['warm'] },
      ],
    };
    expect(evaluate(input, application(['blue', 'warm'])).eligible).toBe(true);
  });

  it('resolves a standalone rule-scoped claim without requiring a duplicate backlink', () => {
    const base = modelInput([onlyRule('rule:palette')]);
    const disputed = {
      ...base.claims[0],
      id: 'claim:scoped',
      status: 'unresolved' as const,
      ruleIds: ['rule:palette'],
      contextIds: [],
    };
    const contrary = { ...disputed, id: 'claim:contrary', status: 'observed' as const };
    const resolution = { ...contrary, id: 'claim:resolution' };
    const input = {
      ...base,
      claims: [...base.claims, disputed, contrary, resolution],
      coverage: base.coverage.map(item => ({ ...item, unresolvedClaimIds: [disputed.id] })),
      conflicts: [
        {
          id: 'conflict:rule',
          message: 'Resolved rule evidence.',
          status: 'resolved' as const,
          claimIds: [disputed.id, contrary.id],
          evidenceRefs: disputed.evidenceRefs,
          contextIds: [],
          ruleIds: ['rule:palette'],
          resolutionClaimId: resolution.id,
        },
      ],
    };
    const result = evaluate(input, application(['blue']));
    expect(result.rules[0].status).toBe('pass');
    expect(result.eligible).toBe(true);
    expect(result.unresolvedClaimIds).not.toContain(disputed.id);
  });

  it('constrains optional keylines without requiring them or permitting unlisted tones', () => {
    const base = onlyRule('rule:role');
    if (base.kind !== 'role-binding') throw Error('fixture');
    const input = modelInput([
      {
        ...base,
        contextIds: ['communications'],
        operands: {
          role: 'keyline',
          presence: 'if-present',
          members: [color('ink'), color('warm')],
        },
      },
    ]);
    const app = application(['paper', 'blue']);
    expect(evaluate(input, app).rules[0].status).toBe('not-applicable');
    expect(
      evaluate(input, {
        ...app,
        uses: [...app.uses, { id: 'stroke', colorId: 'ink', role: 'keyline' }],
      }).rules[0].status
    ).toBe('pass');
    expect(
      evaluate(input, {
        ...app,
        uses: [...app.uses, { id: 'stroke', colorId: 'blue-pale', role: 'keyline' }],
      }).rules[0].status
    ).toBe('fail');
  });

  it('counts authored base groups without counting a partner used only as an accent', () => {
    const base = onlyRule('rule:count');
    if (base.kind !== 'color-count') throw Error('fixture');
    const input = modelInput([
      {
        ...base,
        force: 'prohibition',
        operands: {
          members: [
            { kind: 'scale', id: 'blue-scale', role: 'base' },
            { kind: 'scale', id: 'blue-scale', role: 'tone' },
            { kind: 'scale', id: 'warm-scale', role: 'base' },
            { kind: 'scale', id: 'warm-scale', role: 'tone' },
          ],
          unit: 'groups',
          minimum: 2,
          maximum: 2,
        },
      },
    ]);
    const app = {
      ...application(),
      uses: [
        { id: 'base', colorId: 'blue', role: 'base' },
        { id: 'tone', colorId: 'blue-deep', role: 'tone' },
        { id: 'accent', colorId: 'warm', role: 'accent' },
      ],
    };
    const good = evaluate(input, app);
    expect(good.eligible).toBe(true);
    expect(good.rules[0].reason).toContain('1 distinct authored groups');
    expect(
      evaluate(input, {
        ...app,
        uses: app.uses.map(use => (use.id === 'accent' ? { ...use, role: 'base' } : use)),
      }).rules[0].status
    ).toBe('fail');
    expect(
      evaluate(input, {
        ...app,
        uses: app.uses.map(use => (use.id === 'tone' ? { ...use, colorId: 'warm-deep' } : use)),
      }).rules[0].status
    ).toBe('fail');
  });

  it('counts genuinely overlapping authored groups separately', () => {
    const base = onlyRule('rule:count');
    if (base.kind !== 'color-count') throw Error('fixture');
    const result = evaluate(
      modelInput([
        {
          ...base,
          operands: {
            members: [
              { kind: 'family', id: 'pigments', role: 'artwork' },
              { kind: 'scale', id: 'blue-scale', role: 'artwork' },
            ],
            unit: 'groups',
            minimum: 1,
            maximum: 1,
          },
        },
      ]),
      application(['blue'])
    );
    expect(result.rules[0].status).toBe('fail');
    expect(result.rules[0].reason).toContain('2 distinct authored groups');
  });

  it('measures prominence by actual roles even when both roles select the same authored family', () => {
    const base = onlyRule('rule:prominence');
    if (base.kind !== 'prominence') throw Error('fixture');
    const input = modelInput([
      {
        ...base,
        operands: {
          kind: 'ordered-groups',
          groups: [
            [
              { kind: 'family', id: 'pigments', role: 'base' },
              { kind: 'family', id: 'pigments', role: 'tone' },
            ],
            [{ kind: 'family', id: 'pigments', role: 'accent' }],
          ],
        },
      },
    ]);
    const app = {
      ...application(),
      uses: [
        { id: 'base', colorId: 'blue', role: 'base', area: 10 },
        { id: 'tone', colorId: 'blue-deep', role: 'tone', area: 15 },
        { id: 'accent', colorId: 'warm', role: 'accent', area: 20 },
      ],
    };
    expect(evaluate(input, app).rules[0]).toMatchObject({ status: 'pass', satisfied: true });
    expect(
      evaluate(input, {
        ...app,
        uses: app.uses.map(use => (use.id === 'accent' ? { ...use, area: 30 } : use)),
      }).rules[0].status
    ).toBe('fail');
    // One identity painted in two roles still has two distinct actual painted areas.
    expect(
      evaluate(input, {
        ...app,
        uses: app.uses.map(use => (use.id === 'accent' ? { ...use, colorId: 'blue' } : use)),
      }).rules[0].status
    ).toBe('pass');
  });

  it('keeps prominence unresolved when an actual painted use overlaps ordered groups', () => {
    const base = onlyRule('rule:prominence');
    if (base.kind !== 'prominence') throw Error('fixture');
    const result = evaluate(
      modelInput([
        {
          ...base,
          operands: {
            kind: 'ordered-groups',
            groups: [[{ kind: 'family', id: 'pigments' }], [{ kind: 'color', id: 'blue' }]],
          },
        },
      ]),
      application(['blue', 'warm'])
    );
    expect(result.eligible).toBe(false);
    expect(result.rules[0]).toMatchObject({ status: 'unresolved', satisfied: null });
  });

  it('does not make a count permission into a requirement or maximum', () => {
    const base = onlyRule('rule:count');
    if (base.kind !== 'color-count') throw Error('fixture');
    const result = evaluate(
      modelInput([
        { ...base, force: 'permission', operands: { ...base.operands, minimum: 3, maximum: 3 } },
      ]),
      application(['paper', 'warm'])
    );
    expect(result.eligible).toBe(true);
    expect(result.rules[0]).toMatchObject({
      status: 'evidence-only',
      satisfied: false,
      enforcement: 'none',
    });
  });

  it('matches role-filtered pair selectors on each actual endpoint', () => {
    const base = onlyRule('rule:forbidden');
    if (base.kind !== 'forbidden-pair') throw Error('fixture');
    const input = modelInput([
      {
        ...base,
        operands: {
          ...base.operands,
          left: [{ ...color('blue'), role: 'label' }],
          right: [{ ...color('warm'), role: 'surface' }],
        },
      },
    ]);
    const app = {
      ...application(),
      uses: [
        { id: 'label', colorId: 'blue', role: 'label' },
        { id: 'other', colorId: 'blue', role: 'unrelated' },
        { id: 'surface', colorId: 'warm', role: 'surface' },
      ],
      pairs: [{ id: 'pair', foregroundUseId: 'other', backgroundUseId: 'surface' }],
    };
    expect(evaluate(input, app).rules[0].status).toBe('not-applicable');
    expect(
      evaluate(input, { ...app, pairs: [{ ...app.pairs[0], foregroundUseId: 'label' }] }).rules[0]
        .status
    ).toBe('fail');
  });

  it('requires an assigned accent only when the subject is actually used as a base', () => {
    const original = onlyRule('rule:partner');
    if (original.kind !== 'required-partner') throw Error('fixture');
    const first: ColorSystemScopedRuleV1 = {
      ...original,
      operands: {
        subject: [color('blue')],
        partner: [color('warm')],
        subjectRole: 'illustration.base',
        partnerRole: 'illustration.accent',
      },
    };
    const second: ColorSystemScopedRuleV1 = {
      ...first,
      id: 'rule:other-base',
      operands: {
        subject: [color('warm')],
        partner: [color('blue-deep')],
        subjectRole: 'illustration.base',
        partnerRole: 'illustration.accent',
      },
    };
    const input = modelInput([first, second]);
    const app = {
      ...application(['paper', 'blue', 'warm']),
      uses: [
        { id: 'ground', colorId: 'paper', role: 'ground', area: 100 },
        { id: 'base', colorId: 'blue', role: 'illustration.base', area: 30 },
        { id: 'accent', colorId: 'warm', role: 'illustration.accent', area: 3 },
      ],
    };
    const good = evaluate(input, app);
    expect(good.eligible).toBe(true);
    expect(good.rules.find(rule => rule.ruleId === second.id)?.status).toBe('not-applicable');
    expect(
      evaluate(input, {
        ...app,
        uses: app.uses.map(use =>
          use.id === 'accent' ? { ...use, role: 'unrelated-artwork' } : use
        ),
      }).eligible
    ).toBe(false);
    expect(
      evaluate(input, {
        ...app,
        uses: app.uses.map(use => (use.id === 'accent' ? { ...use, colorId: 'blue-deep' } : use)),
      }).eligible
    ).toBe(false);
  });

  it('limits a disputed numeric color to that color and its declared mode', () => {
    const input = modelInput([]);
    const alternative = {
      ...input.claims[0],
      id: 'claim:numeric-alternative',
      text: 'A different numeric representation is printed.',
      contextIds: [],
      ruleIds: [],
    };
    const disputed = {
      ...input,
      claims: [...input.claims, alternative],
      conflicts: [
        {
          id: 'conflict:numeric',
          message: 'Printed numeric representations differ.',
          status: 'unresolved' as const,
          claimIds: ['claim:values', alternative.id],
          evidenceRefs: ['evidence:values'],
          contextIds: [],
          ruleIds: [],
          colorIds: ['blue'],
          modeIds: ['Day'],
        },
      ],
    };
    expect(evaluate(disputed, application(['paper', 'warm'])).eligible).toBe(true);
    expect(evaluate(disputed, application(['paper', 'blue'])).conflictIds).toEqual([
      'conflict:numeric',
    ]);
    expect(
      evaluate(disputed, { ...application(['paper', 'blue']), modeId: 'Night' }).eligible
    ).toBe(true);
  });

  it('assesses qualitative relationships without fabricating absent numeric source values', () => {
    const input = modelInput([onlyRule('rule:prominence')]);
    const missingClaim = {
      id: 'claim:missing-paper',
      sourceId: input.sources[0].id,
      text: 'The source names this color but gives no exact numeric value.',
      status: 'unsupported' as const,
      evidenceRefs: ['evidence:values'],
      contextIds: [],
      ruleIds: [],
      modeIds: ['Day'],
    };
    const result = evaluate(
      {
        ...input,
        colors: input.colors.map(color =>
          color.id === 'paper'
            ? {
                ...color,
                valuesByMode: { Night: color.valuesByMode.Night },
                valueGapClaimIdsByMode: { Day: [missingClaim.id] },
                claimIds: [...color.claimIds, missingClaim.id],
              }
            : color
        ),
        claims: [...input.claims, missingClaim],
        coverage: input.coverage.map(item => ({
          ...item,
          status: 'partial',
          unresolvedClaimIds: [missingClaim.id],
        })),
      },
      {
        ...application(),
        pairs: [
          {
            id: 'unknown-numeric-pair',
            foregroundUseId: 'use:warm',
            backgroundUseId: 'use:paper',
            contrast: { minimum: 3, assessment: 'required' },
          },
        ],
      }
    );
    expect(result.rules[0]).toMatchObject({ satisfied: true, status: 'pass' });
    expect(result.pairs[0]).toMatchObject({ ratio: null, status: 'unresolved' });
    expect(result.eligible).toBe(false);
    expect(result.unresolvedClaimIds).toContain(missingClaim.id);
    expect(result.sourceConfidence).toBe('unresolved');
  });

  it('does not call an unevidenced color observed merely because it has a claim ID', () => {
    const input = modelInput([]);
    const result = evaluate({
      ...input,
      colors: input.colors.map(color => ({ ...color, evidenceRefs: [] })),
      claims: input.claims.map(claim =>
        claim.id === 'claim:values' ? { ...claim, evidenceRefs: [] } : claim
      ),
    });
    expect(result.eligible).toBe(true);
    expect(result.sourceConfidence).toBe('provisional');
  });

  it('keeps an interface role local without inventing a global primary or prohibiting it in communications', () => {
    const input = modelInput();
    expect(evaluate(input).eligible).toBe(true);
    const blueCommunications = evaluate(input, application(['paper', 'blue', 'warm']));
    expect(blueCommunications.eligible).toBe(true);
    const ui = {
      ...application(['paper', 'blue']),
      contextId: 'interface',
      uses: [
        { id: 'ground', colorId: 'paper', role: 'ground' },
        { id: 'control', colorId: 'blue', role: 'action' },
      ],
    };
    expect(evaluate(input, ui).eligible).toBe(true);
    const wrong = evaluate(input, {
      ...ui,
      uses: [ui.uses[0], { ...ui.uses[1], colorId: 'warm' }],
    });
    expect(wrong.blockers.map(item => item.id)).toContain('rule:role');
    expect(JSON.stringify(input)).not.toContain('globalPrimary');
  });

  it('includes auxiliary and separator paints in a closed palette', () => {
    const input = modelInput([onlyRule('rule:palette')]);
    const extra = {
      ...input.colors[0],
      id: 'auxiliary',
      label: 'Unadmitted helper',
      valuesByMode: { Day: buildColorSystemSrgbValueV1({ r: 1, g: 1, b: 1 }) },
    };
    const result = evaluate(
      { ...input, colors: [...input.colors, extra] },
      application(['paper', 'warm', 'auxiliary'])
    );
    expect(result.eligible).toBe(false);
    expect(result.rules[0].status).toBe('fail');
  });

  it.each(['permission', 'example'] as const)(
    'does not turn an %s pair into an exclusive allowlist',
    force => {
      const base = onlyRule('rule:allowed');
      if (base.kind !== 'allowed-pair') throw Error('fixture');
      const result = evaluate(modelInput([{ ...base, force }]), {
        ...application(),
        pairs: [{ id: 'warm-on-paper', foregroundUseId: 'use:warm', backgroundUseId: 'use:paper' }],
      });
      expect(result.eligible).toBe(true);
      expect(result.rules[0].enforcement).toBe('none');
    }
  );

  it('distinguishes co-presence from the actual foreground and background relationship', () => {
    const base = onlyRule('rule:forbidden');
    if (base.kind !== 'forbidden-pair') throw Error('fixture');
    const app = {
      ...application(['paper', 'blue', 'warm']),
      pairs: [{ id: 'blue-on-warm', foregroundUseId: 'use:blue', backgroundUseId: 'use:warm' }],
    };
    expect(evaluate(modelInput([base]), app).eligible).toBe(false);
    expect(evaluate(modelInput([base]), { ...app, pairs: [] }).eligible).toBe(true);
    expect(
      evaluate(modelInput([base]), {
        ...app,
        pairs: [{ ...app.pairs[0], foregroundUseId: 'use:warm', backgroundUseId: 'use:blue' }],
      }).eligible
    ).toBe(true);
    const coPresent = {
      ...base,
      operands: { ...base.operands, ordered: false, relation: 'co-present' as const },
    };
    expect(evaluate(modelInput([coPresent]), { ...app, pairs: [] }).eligible).toBe(false);
    expect(
      evaluate(modelInput([coPresent]), { ...app, uses: [...app.uses].reverse(), pairs: [] })
        .eligible
    ).toBe(false);
  });

  it('enforces accepted allowed-pair requirements rather than mere permission', () => {
    const base = onlyRule('rule:allowed');
    if (base.kind !== 'allowed-pair') throw Error('fixture');
    const rule: ColorSystemScopedRuleV1 = {
      ...base,
      force: 'requirement',
      operands: { ...base.operands, left: [color('warm')] },
    };
    const good = {
      ...application(['paper', 'warm', 'ink']),
      pairs: [{ id: 'pair', foregroundUseId: 'use:warm', backgroundUseId: 'use:paper' }],
    };
    expect(evaluate(modelInput([rule]), good).eligible).toBe(true);
    expect(
      evaluate(modelInput([rule]), {
        ...good,
        pairs: [{ ...good.pairs[0], backgroundUseId: 'use:ink' }],
      }).eligible
    ).toBe(false);
  });

  it('preserves an assigned partner across related scales instead of inventing a geometric complement', () => {
    const input = modelInput([onlyRule('rule:partner')]);
    expect(evaluate(input, application(['paper', 'blue-mid', 'warm-deep'])).eligible).toBe(true);
    expect(
      evaluate(input, application(['paper', 'blue-mid', 'ink'])).blockers.map(item => item.id)
    ).toContain('rule:partner');
  });

  it('counts distinct selected colors, including helper roles, without counting repeated paints twice', () => {
    const input = modelInput([onlyRule('rule:count')]);
    const three = application(['paper', 'blue', 'warm']);
    expect(
      evaluate(input, {
        ...three,
        uses: [...three.uses, { id: 'second-blue', colorId: 'blue', role: 'outline' }],
      }).eligible
    ).toBe(true);
    expect(evaluate(input, application(['paper', 'blue', 'warm', 'ink'])).eligible).toBe(false);
  });

  it('keeps preferences advisory and unreviewed preferences out of ranking authority', () => {
    const base = onlyRule('rule:partner');
    if (base.kind !== 'required-partner') throw Error('fixture');
    const input = modelInput([{ ...base, force: 'preference' }]);
    const app = application(['paper', 'blue']);
    const accepted = evaluate(input, app);
    expect(accepted.eligible).toBe(true);
    expect(accepted.rules[0]).toMatchObject({
      status: 'advisory',
      satisfied: false,
      enforcement: 'advisory',
    });
    expect(evaluate({ ...input, adoptions: [] }, app).rules[0]).toMatchObject({
      status: 'evidence-only',
      enforcement: 'none',
    });
  });

  it('requires a decision for an applicable hard rule and preserves an explicit rejection', () => {
    const input = modelInput([onlyRule('rule:partner')]);
    const app = application(['paper', 'blue']);
    expect(evaluate({ ...input, adoptions: [] }, app).rules[0].status).toBe('unresolved');
    expect(
      evaluate(
        {
          ...input,
          adoptions: input.adoptions.map(adoption => ({ ...adoption, status: 'rejected' })),
        },
        app
      ).eligible
    ).toBe(true);
    expect(evaluate({ ...input, adoptions: [] }).eligible).toBe(true); // No subject, no dependent use.
  });

  it('compares the entire secondary bucket in qualitative prominence without inventing source percentages', () => {
    const base = onlyRule('rule:prominence');
    if (base.kind !== 'prominence') throw Error('fixture');
    const rule: ColorSystemScopedRuleV1 = {
      ...base,
      operands: {
        kind: 'ordered-groups',
        groups: [
          [color('paper')],
          [color('blue')],
          [color('ink')],
          [{ kind: 'scale', id: 'warm-scale' }],
        ],
      },
    };
    const app = application(['paper', 'blue', 'ink', 'warm', 'warm-deep']);
    const painted = {
      ...app,
      uses: app.uses.map((use, i) => ({ ...use, area: [500, 200, 100, 60, 60][i] })),
    };
    const result = evaluate(modelInput([rule]), painted);
    expect(result.eligible).toBe(false); // Each secondary is small; their complete bucket is larger than ink.
    expect(result.rules[0].reason).toContain('500, 200, 100, 120');
    expect(
      evaluate(modelInput([rule]), {
        ...painted,
        uses: painted.uses.map(use =>
          use.colorId.startsWith('warm') ? { ...use, area: 30 } : use
        ),
      }).eligible
    ).toBe(true);
    expect(rule.operands).not.toHaveProperty('percentages');
  });

  it('does not claim prominence without actual finite area measurements', () => {
    const input = modelInput([onlyRule('rule:prominence')]);
    const app = application();
    expect(
      evaluate(input, { ...app, uses: app.uses.map(({ area: _area, ...use }) => use) }).rules[0]
        .status
    ).toBe('unresolved');
    const overflow = application(['paper', 'warm', 'warm-deep']);
    expect(
      evaluate(input, {
        ...overflow,
        uses: overflow.uses.map(use => ({ ...use, area: Number.MAX_VALUE })),
      }).rules[0].status
    ).toBe('unresolved');
  });

  it('executes explicit numeric prominence separately from qualitative order', () => {
    const base = onlyRule('rule:prominence');
    if (base.kind !== 'prominence') throw Error('fixture');
    const input = modelInput([
      {
        ...base,
        operands: { kind: 'area-fraction', members: [color('warm')], minimum: 0.1, maximum: 0.2 },
      },
    ]);
    const app = application();
    expect(
      evaluate(input, {
        ...app,
        uses: app.uses.map(use => ({ ...use, area: use.colorId === 'warm' ? 15 : 85 })),
      }).eligible
    ).toBe(true);
    expect(evaluate(input, app).eligible).toBe(false);
  });

  it('preserves a conflicting source assertion and blocks only its dependent relationship', () => {
    const base = onlyRule('rule:forbidden');
    if (base.kind !== 'forbidden-pair') throw Error('fixture');
    const initial = modelInput([base]);
    const input = {
      ...initial,
      claims: [
        ...initial.claims,
        {
          ...initial.claims.find(claim => claim.id === 'claim:rules')!,
          id: 'claim:example',
          text: 'A separate source example labels the otherwise forbidden pair as permitted.',
        },
      ],
    };
    const conflict = {
      id: 'conflict:label',
      message: 'The example label and pairing instruction disagree.',
      status: 'unresolved' as const,
      claimIds: ['claim:rules', 'claim:example'],
      evidenceRefs: ['evidence:rules'],
      contextIds: ['communications'],
      ruleIds: [base.id],
    };
    const disputed = {
      ...application(['paper', 'blue', 'warm']),
      pairs: [{ id: 'disputed', foregroundUseId: 'use:blue', backgroundUseId: 'use:warm' }],
    };
    const before = JSON.stringify(input);
    expect(evaluate({ ...input, conflicts: [conflict] }, disputed).conflictIds).toEqual([
      conflict.id,
    ]);
    expect(
      evaluate({ ...input, conflicts: [conflict] }, application(['paper', 'blue'])).eligible
    ).toBe(true);
    expect(
      evaluate({ ...input, conflicts: [conflict] }, { ...disputed, contextId: 'interface' })
        .conflictIds
    ).toEqual([]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps historical foreground claims separate from current measurements without rounding a failure into a pass', () => {
    const input = modelInput([]);
    const gray = {
      ...input.colors[0],
      id: 'gray',
      label: 'Synthetic gray',
      valuesByMode: {
        Day: buildColorSystemSrgbValueV1({ r: 119 / 255, g: 119 / 255, b: 119 / 255 }),
      },
    };
    const white = {
      ...input.colors[0],
      id: 'white',
      label: 'Synthetic white',
      valuesByMode: { Day: buildColorSystemSrgbValueV1({ r: 1, g: 1, b: 1 }) },
    };
    const claim = {
      ...input.claims[0],
      id: 'claim:historical',
      text: 'The source labels this foreground pairing normal-text compliant.',
      contextIds: ['communications'],
    };
    const model = buildColorSystemModelV1({
      ...input,
      colors: [...input.colors, gray, white],
      claims: [...input.claims, claim],
    });
    const app = {
      ...application(['gray', 'white']),
      pairs: [
        {
          id: 'text',
          foregroundUseId: 'use:white',
          backgroundUseId: 'use:gray',
          contrast: { minimum: 4.5, assessment: 'required' as const },
        },
      ],
    };
    const result = compileColorSystemRelationshipsV1(model).evaluate(app);
    expect(result.pairs[0].ratio).toBeGreaterThan(4.47);
    expect(result.pairs[0].ratio).toBeLessThan(4.5);
    expect(result.pairs[0].status).toBe('fail');
    expect(model.claims.find(item => item.id === claim.id)?.text).toBe(claim.text);
  });

  it('requires the real compositing ground for translucent backgrounds while keeping inactive exemptions explicit', () => {
    const input = modelInput([]);
    const app = {
      ...application(['paper', 'ink', 'blue']),
      pairs: [
        {
          id: 'pair',
          foregroundUseId: 'use:ink',
          backgroundUseId: 'use:blue',
          contrast: { minimum: 4.5, assessment: 'required' as const },
        },
      ],
    };
    expect(evaluate(input, app).pairs[0].status).toBe('unresolved');
    const complete = evaluate(input, {
      ...app,
      pairs: [{ ...app.pairs[0], underlayUseId: 'use:paper' }],
    });
    expect(complete.pairs[0].ratio).not.toBeNull();
    expect(
      evaluate(input, {
        ...app,
        pairs: [{ ...app.pairs[0], contrast: { minimum: 4.5, assessment: 'inactive-exempt' } }],
      }).pairs[0].status
    ).toBe('inactive-exempt');
  });

  it('retains authored mode values and rejects undeclared modes instead of copying another mode', () => {
    const input = modelInput([]);
    const day = evaluate(input);
    const night = evaluate(input, { ...application(), modeId: 'Night' });
    expect(day.applicationHash).not.toBe(night.applicationHash);
    expect(() => evaluate(input, { ...application(), modeId: 'Invented' })).toThrow('unsupported');
  });

  it('binds decisions and rendered application differences, and isolates its compiled policy from caller mutation', () => {
    const input = modelInput([onlyRule('rule:palette')]);
    const model = structuredClone(buildColorSystemModelV1(input));
    const compiled = compileColorSystemRelationshipsV1(model);
    const first = compiled.evaluate(application());
    (model.rules as ColorSystemScopedRuleV1[]).length = 0;
    (first.rules[0].evidenceRefs as string[]).push('untrusted:mutation');
    const second = compiled.evaluate(application());
    expect(second.assessmentHash).toBe(first.assessmentHash);
    expect(second.rules[0].evidenceRefs).not.toContain('untrusted:mutation');
    expect(compiled.evaluate(application(['paper', 'ink'])).assessmentHash).not.toBe(
      second.assessmentHash
    );
    expect(second.sourceConfidence).toBe('provisional');
  });

  it('rejects hostile or malformed paint inputs before evaluating any policy', () => {
    const compiled = compileColorSystemRelationshipsV1(syntheticColorSystemModelV1());
    expect(() =>
      compiled.evaluate({
        ...application(),
        uses: [...application().uses, { ...application().uses[0] }],
      })
    ).toThrow('unique');
    expect(() =>
      compiled.evaluate({
        ...application(),
        pairs: [{ id: 'bad', foregroundUseId: 'missing', backgroundUseId: 'use:paper' }],
      })
    ).toThrow('references');
    let called = false;
    const hostile = Object.defineProperty({}, 'id', {
      enumerable: true,
      get() {
        called = true;
        return 'id';
      },
    });
    expect(() => buildColorSystemContextApplicationV1(hostile)).toThrow('accessors');
    expect(called).toBe(false);
    expect(() =>
      buildColorSystemContextApplicationV1({ ...application(), uses: new Array(1) })
    ).toThrow('unsupported array');
    expect(() =>
      buildColorSystemContextApplicationV1({
        ...application(),
        uses: [{ ...application().uses[0], area: 0 }],
      })
    ).toThrow('positive');
  });
});
