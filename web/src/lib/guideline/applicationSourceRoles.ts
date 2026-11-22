import type { ColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';

/** Role names from scoped source predicates; their assignment remains an authored decision. */
export function guidelineApplicationSourceRoles(
  model: ColorSystemModelV1,
  contextId: string,
  modeId: string
): string[] {
  const roles = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['role', 'subjectRole', 'partnerRole'].includes(key) && typeof child === 'string')
        roles.add(child);
      else visit(child);
    }
  };
  model.rules
    .filter(rule => rule.contextIds.includes(contextId) && rule.modeIds.includes(modeId))
    .forEach(rule => visit(rule.operands));
  return [...roles].sort();
}

/** A misspelled source role must not turn a prohibition into a non-applicable rule. */
export function validateGuidelinePanelSourceRoles(
  roles: readonly string[],
  mapping: { readonly ground: string; readonly heading: string; readonly body: string } | undefined
): void {
  if (!roles.length) return;
  if (!mapping)
    throw new Error('Map each panel region to its source role before checking this application.');
  const structural = { ground: 'ground', heading: 'text-1', body: 'text-2' };
  for (const region of ['ground', 'heading', 'body'] as const) {
    if (!roles.includes(mapping[region]) && mapping[region] !== structural[region])
      throw new Error(
        `Choose an available source role or the explicit structural fallback for ${region}.`
      );
  }
}
