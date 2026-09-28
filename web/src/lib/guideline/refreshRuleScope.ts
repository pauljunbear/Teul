import type {
  ColorSystemModelV1,
  ColorSystemScopedRuleV1,
  ColorSystemSelectorV1,
} from '../../../../src/lib/colorSystemModelV1';
import {
  compileColorSystemRelationshipsV1,
  type ColorSystemContextApplicationV1,
} from '../../../../src/lib/colorSystemRelationshipsV1';

export type GuidelineRefreshRuleScope =
  | { kind: 'gradient' }
  | { kind: 'scale'; model: ColorSystemModelV1; scaleId: string }
  | {
      kind: 'applications';
      model: ColorSystemModelV1;
      applications: readonly ColorSystemContextApplicationV1[];
    };

/** This narrows continuity checks only; the original models still govern fresh execution. */
export function scopedRefreshRules(
  source: ColorSystemModelV1,
  contextId: string,
  modeId: string,
  scope?: GuidelineRefreshRuleScope
): readonly ColorSystemScopedRuleV1[] {
  const rules = source.rules.filter(
    r => r.contextIds.includes(contextId) && r.modeIds.includes(modeId)
  );
  if (!scope) return rules;
  if (scope.kind === 'gradient') {
    // Matches the existing gradient gate, including its unconditional closed-palette check.
    return rules.filter(
      rule =>
        (rule.kind === 'palette-membership' && rule.force === 'requirement') ||
        (!['permission', 'example'].includes(rule.force) &&
          source.adoptions.find(a => a.ruleId === rule.id)?.status !== 'rejected')
    );
  }
  if (scope.kind === 'applications') {
    const applications = scope.applications.filter(
      a => a.contextId === contextId && a.modeId === modeId
    );
    if (!applications.length) return rules;
    const evaluator = compileColorSystemRelationshipsV1(scope.model);
    let inactive = new Set(rules.map(r => r.id));
    for (const application of applications) {
      const absent = new Set(
        evaluator
          .evaluate(application)
          .rules.filter(r => r.status === 'not-applicable')
          .map(r => r.ruleId)
      );
      inactive = new Set([...inactive].filter(id => absent.has(id)));
    }
    return rules.filter(r => !inactive.has(r.id));
  }
  const scale = scope.model.scales.find(s => s.id === scope.scaleId);
  const mode = scale?.modes.find(m => m.modeId === modeId);
  if (!scale || !mode) throw new Error('The extended scale is missing from its working model.');
  const colors = new Set(mode.anchors.map(a => a.colorId));
  const touches = (selector: ColorSystemSelectorV1) => {
    if (selector.kind === 'color') return colors.has(selector.id);
    if (selector.kind === 'family') {
      const family = scope.model.families.find(f => f.id === selector.id);
      if (!family) throw new Error('A source rule refers to a missing working family.');
      return family.id === scale.familyId || family.colorIds.some(id => colors.has(id));
    }
    const selected = scope.model.scales.find(s => s.id === selector.id);
    if (!selected) throw new Error('A source rule refers to a missing working scale.');
    return (
      selected.id === scale.id ||
      !!selected.modes.find(m => m.modeId === modeId)?.anchors.some(a => colors.has(a.colorId))
    );
  };
  return rules.filter(rule => {
    if (rule.kind === 'allowed-pair' || rule.kind === 'forbidden-pair')
      return [...rule.operands.left, ...rule.operands.right].some(touches);
    if (rule.kind === 'required-partner')
      return [...rule.operands.subject, ...rule.operands.partner].some(touches);
    // Without actual uses, no role, count, palette or prominence rule is proven irrelevant.
    return true;
  });
}
