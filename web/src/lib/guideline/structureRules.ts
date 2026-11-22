import type {
  ColorSystemScopedRuleV1,
  ColorSystemSelectorV1,
} from '../../../../src/lib/colorSystemModelV1';
import type { SourceRuleDefinition, SourceSelectorV2 } from './reviewV2';

export type SourceRuleCommon = Omit<ColorSystemScopedRuleV1, 'kind' | 'force' | 'operands'>;

/** Map a validated definition without changing its force, relationship or operand order. */
export function mapSourceRuleDefinition<T>(
  definition: SourceRuleDefinition,
  resolveSelector: (selector: SourceSelectorV2) => T
) {
  switch (definition.kind) {
    case 'required-partner':
      return {
        ...definition,
        operands: {
          subject: definition.operands.subject.map(resolveSelector),
          partner: definition.operands.partner.map(resolveSelector),
        },
      };
    case 'forbidden-pair':
      return {
        ...definition,
        operands: {
          ...definition.operands,
          left: definition.operands.left.map(resolveSelector),
          right: definition.operands.right.map(resolveSelector),
        },
      };
    case 'prominence':
      return {
        ...definition,
        operands: {
          kind: 'ordered-groups' as const,
          groups: definition.operands.groups.map(group => group.map(resolveSelector)),
        },
      };
    case 'role-binding':
      return {
        ...definition,
        operands: {
          ...definition.operands,
          members: definition.operands.members.map(resolveSelector),
        },
      };
  }
}

/** Materializes a validated definition using the caller's source-bound selector identities. */
export function compileSourceRuleDefinition(
  common: SourceRuleCommon,
  definition: SourceRuleDefinition,
  resolveSelector: (selector: SourceSelectorV2) => ColorSystemSelectorV1
): ColorSystemScopedRuleV1 {
  return { ...common, ...mapSourceRuleDefinition(definition, resolveSelector) };
}
