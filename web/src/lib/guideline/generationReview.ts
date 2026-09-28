import type { ColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';

/** Shared Studio gate; it never grants a palette exception or renews changed rule decisions. */
export function guidelineGenerationIssues(
  source: ColorSystemModelV1,
  contextId: string,
  modeId: string,
  checks: 'source' | 'application' = 'source'
) {
  const issues: { code: string; message: string }[] = [];
  const scoped = (item: { contextIds: readonly string[]; modeIds?: readonly string[] }) =>
    (!item.contextIds.length || item.contextIds.includes(contextId)) &&
    (!item.modeIds?.length || item.modeIds.includes(modeId));
  for (const claim of source.claims)
    if (
      checks === 'source' &&
      scoped(claim) &&
      ['unsupported', 'unresolved', 'contradicted'].includes(claim.status)
    )
      issues.push({ code: 'SOURCE_MEANING_REQUIRED', message: `Review required: ${claim.text}` });
  for (const conflict of source.conflicts)
    if (checks === 'source' && scoped(conflict) && conflict.status === 'unresolved')
      issues.push({ code: 'SOURCE_CONFLICT_REQUIRED', message: conflict.message });
  for (const rule of source.rules.filter(scoped)) {
    const adoption = source.adoptions.find(item => item.ruleId === rule.id);
    if (checks === 'source' && !adoption)
      issues.push({
        code: 'SOURCE_RULE_REVIEW_REQUIRED',
        message: `Review the source rule before extending: ${rule.label}`,
      });
    if (
      adoption?.status !== 'rejected' &&
      rule.kind === 'palette-membership' &&
      rule.force === 'requirement'
    )
      issues.push({
        code: 'CLOSED_SOURCE_PALETTE',
        message:
          'This guideline restricts use to its existing palette. An extension requires a separate scoped exception.',
      });
  }
  return issues;
}
