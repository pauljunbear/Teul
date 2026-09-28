import { Button } from './ui/button';
import type { GuidelineExtensionResult } from '../lib/guideline/extension';
import type { GuidelineRuleDecisions } from '../lib/guideline/extensionRuleReview';
import type {
  ColorSystemModelV1,
  ColorSystemScopedRuleV1,
  ColorSystemSelectorV1,
} from '../../../src/lib/colorSystemModelV1';

function describeRule(model: ColorSystemModelV1, rule: ColorSystemScopedRuleV1): string {
  const names = (items: readonly ColorSystemSelectorV1[]) =>
    items
      .map(item => {
        const collection =
          item.kind === 'color'
            ? model.colors
            : item.kind === 'family'
              ? model.families
              : model.scales;
        return `${collection.find(value => value.id === item.id)?.label ?? item.id}${item.role ? ` used as ${item.role}` : ''}`;
      })
      .join(', ');
  switch (rule.kind) {
    case 'required-partner':
      return `${names(rule.operands.subject)} must appear with ${names(rule.operands.partner)}.`;
    case 'forbidden-pair':
      return `${names(rule.operands.left)} and ${names(rule.operands.right)} must not be ${rule.operands.relation === 'co-present' ? 'used together' : 'paired as foreground and background'}${rule.operands.ordered ? ' in this order' : ''}.`;
    case 'prominence':
      return rule.operands.kind === 'ordered-groups'
        ? `From greatest to least visible area: ${rule.operands.groups.map(names).join(' → ')}.`
        : `${names(rule.operands.members)} must occupy ${rule.operands.minimum * 100}–${rule.operands.maximum * 100}% of visible area.`;
    case 'role-binding':
      return `${names(rule.operands.members)} govern the ${rule.operands.role} role (${rule.force}; ${rule.operands.presence ?? 'required'}).`;
    case 'palette-membership':
      return `Palette membership: ${names(rule.operands.members)}.`;
    case 'allowed-pair':
      return `Allowed pairing: ${names(rule.operands.left)} with ${names(rule.operands.right)}.`;
    case 'color-count':
      return `Use ${rule.operands.minimum}–${rule.operands.maximum} ${rule.operands.unit ?? 'colors'} from ${names(rule.operands.members)}.`;
  }
}

export function GuidelineExtensionRuleReview({
  preview,
  decisions,
  onChange,
  onApply,
  busy,
  actionLabel = 'Apply extension rule decisions',
}: {
  preview: GuidelineExtensionResult;
  decisions: GuidelineRuleDecisions;
  onChange: (decisions: GuidelineRuleDecisions) => void;
  onApply: () => void;
  busy: boolean;
  actionLabel?: string;
}) {
  return (
    <>
      {preview.pendingRuleIds.length > 0 && (
        <div className="guideline-notice">
          <h3>Review rules affected by these additions</h3>
          <p>
            Adding family or scale members changes what these rules govern. Each decision applies to
            the complete rule and its original usage scope.
          </p>
          {preview.pendingRuleIds.map(ruleId => {
            const rule = preview.workingModel?.rules.find(item => item.id === ruleId);
            return (
              <label className="guideline-renewal" key={ruleId}>
                {rule?.label ?? ruleId}
                <span className="guideline-muted">{rule?.contextIds.join(' · ')}</span>
                <details>
                  <summary>Rule details</summary>
                  {rule && preview.workingModel && (
                    <p>
                      {describeRule(preview.workingModel, rule)} Force: {rule.force}.
                    </p>
                  )}
                </details>
                <select
                  aria-label={`Decision for ${rule?.label ?? ruleId}`}
                  value={decisions[ruleId] ?? ''}
                  disabled={busy}
                  onChange={e =>
                    onChange({
                      ...decisions,
                      [ruleId]: e.target.value as 'accepted' | 'rejected' | '',
                    })
                  }
                >
                  <option value="">Choose a decision</option>
                  <option value="accepted">Apply this rule to the expanded system</option>
                  <option value="rejected">Do not approve this extension</option>
                </select>
              </label>
            );
          })}
          {preview.pendingRuleIds.some(id => decisions[id] === 'rejected') && (
            <p>
              This extension remains unapproved. Source rules are unchanged; revise the extension or
              review your decision.
            </p>
          )}
          <Button
            disabled={busy || preview.pendingRuleIds.some(id => decisions[id] !== 'accepted')}
            onClick={onApply}
          >
            {actionLabel}
          </Button>
        </div>
      )}
    </>
  );
}
