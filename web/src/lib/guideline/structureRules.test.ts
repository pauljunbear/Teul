import { describe, expect, it } from 'vitest';
import {
  assertSourceRuleDefinition,
  type SourceRuleDefinition,
  type SourceSelectorV2,
} from './reviewV2';
import { compileSourceRuleDefinition, type SourceRuleCommon } from './structureRules';

const common: SourceRuleCommon = {
  id: 'rule:source-relationship',
  label: 'An interpreted source relationship',
  contextIds: ['product', 'gradient:product'],
  modeIds: ['source:light', 'source:dark'],
  origin: 'inferred',
  evidenceRefs: ['source:statement'],
  claimIds: ['claim:statement'],
};
const color: SourceSelectorV2 = { kind: 'color', id: 'source:blue' };
const family: SourceSelectorV2 = { kind: 'family', id: 'Neutral' };
const scale: SourceSelectorV2 = { kind: 'scale', id: 'source:scale' };
const resolvedColor = { kind: 'color', id: 'compiled:blue' } as const;
const resolvedFamily = { kind: 'family', id: 'compiled:neutral' } as const;
const resolvedScale = { kind: 'scale', id: 'compiled:scale' } as const;
function resolve(selector: SourceSelectorV2) {
  if (selector.kind === 'color' && selector.id === color.id) return resolvedColor;
  if (selector.kind === 'family' && selector.id === family.id) return resolvedFamily;
  if (selector.kind === 'scale' && selector.id === scale.id) return resolvedScale;
  throw new Error('Missing or excluded source selector.');
}
const examples: { definition: SourceRuleDefinition; operands: unknown }[] = [
  {
    definition: {
      kind: 'required-partner',
      force: 'requirement',
      operands: { subject: [color, scale], partner: [family] },
    },
    operands: { subject: [resolvedColor, resolvedScale], partner: [resolvedFamily] },
  },
  {
    definition: {
      kind: 'forbidden-pair',
      force: 'prohibition',
      operands: {
        left: [color],
        right: [family],
        ordered: true,
        relation: 'foreground-background',
      },
    },
    operands: {
      left: [resolvedColor],
      right: [resolvedFamily],
      ordered: true,
      relation: 'foreground-background',
    },
  },
  {
    definition: {
      kind: 'prominence',
      force: 'preference',
      operands: { kind: 'ordered-groups', groups: [[color, scale], [family]] },
    },
    operands: {
      kind: 'ordered-groups',
      groups: [[resolvedColor, resolvedScale], [resolvedFamily]],
    },
  },
  {
    definition: {
      kind: 'role-binding',
      force: 'permission',
      operands: { role: 'action', members: [color, family], presence: 'if-present' },
    },
    operands: { role: 'action', members: [resolvedColor, resolvedFamily], presence: 'if-present' },
  },
];

describe('shared source relationship materialization', () => {
  it.each(examples)(
    'retains source metadata and resolves all $definition.kind operands',
    ({ definition, operands }) => {
      const before = structuredClone({ common, definition });
      assertSourceRuleDefinition(definition);
      const rule = compileSourceRuleDefinition(common, definition, resolve);
      expect(rule).toEqual({ ...common, kind: definition.kind, force: definition.force, operands });
      expect({ common, definition }).toEqual(before);
    }
  );

  it('propagates failed source resolution without substituting a matching-looking color', () => {
    const value: SourceRuleDefinition = {
      kind: 'required-partner',
      force: 'requirement',
      operands: { subject: [color], partner: [{ kind: 'color', id: 'source:excluded' }] },
    };
    expect(() => compileSourceRuleDefinition(common, value, resolve)).toThrow(
      'Missing or excluded'
    );
  });

  it('keeps unfinished draft values legal without mistaking shape validation for resolution', () => {
    const value: unknown = {
      kind: 'role-binding',
      force: 'requirement',
      operands: { role: '', members: [{ kind: 'color', id: '' }], presence: 'required' },
    };
    assertSourceRuleDefinition(value);
    expect(() => compileSourceRuleDefinition(common, value, resolve)).toThrow(
      'Missing or excluded'
    );
  });

  it.each([
    { ...examples[0].definition, extra: true },
    { ...examples[0].definition, force: 'permission' },
    { kind: 'role-binding', force: 'requirement', operands: { role: 'action', members: [color] } },
    {
      kind: 'prominence',
      force: 'requirement',
      operands: { kind: 'ordered-groups', groups: [[{ ...color, role: 'invented' }]] },
    },
  ])('rejects unsupported fields and missing relationship meaning', value => {
    expect(() => assertSourceRuleDefinition(value)).toThrow();
  });
});
