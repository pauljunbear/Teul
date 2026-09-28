import type { TextObservation } from './evidence';
import type { ReviewRuleV2 } from './reviewV2';

export interface StatementGroup<T extends ReviewRuleV2> {
  text: string;
  items: T[];
}

/** Exact wording can share a view; each occurrence still owns its interpretation. */
export function groupReviewStatements<T extends ReviewRuleV2>(
  rules: readonly T[],
  sources: ReadonlyMap<string, { text?: string }>
): StatementGroup<T>[] {
  const groups = new Map<string, StatementGroup<T>>();
  for (const rule of rules) {
    const text = sources.get(rule.observationId)?.text;
    if (text === undefined) throw new Error('Statement source text is missing.');
    const group = groups.get(text);
    if (group) group.items.push(rule);
    else groups.set(text, { text, items: [rule] });
  }
  return [...groups.values()];
}

/** An explicit exclusion may be copied only to unresolved, verbatim copies. */
export function copyStatementExclusion<T extends ReviewRuleV2>(
  rules: T[],
  sources: ReadonlyMap<string, { text?: string }>,
  fromId: string
): T[] {
  const source = rules.find(rule => rule.observationId === fromId);
  const text = sources.get(fromId)?.text;
  if (!source || source.meaning !== 'not-a-rule' || !source.reason.trim() || text === undefined)
    return rules;
  let changed = false;
  const next = rules.map(rule => {
    if (
      rule.observationId === fromId ||
      rule.meaning !== 'needs-interpretation' ||
      sources.get(rule.observationId)?.text !== text
    )
      return rule;
    changed = true;
    return { ...rule, meaning: 'not-a-rule' as const, reason: source.reason, definition: null };
  });
  return changed ? next : rules;
}

export function indexPdfStatementText(text: readonly TextObservation[]) {
  const byId = new Map(text.map(item => [item.id, item]));
  const pages = new Map<number, TextObservation[]>();
  for (const item of text) {
    if (item.locator.kind !== 'pdf') continue;
    const page = pages.get(item.locator.page) ?? [];
    page.push(item);
    pages.set(item.locator.page, page);
  }
  const positions = new Map<string, number>();
  for (const page of pages.values()) {
    page.sort((a, b) => {
      if (a.locator.kind !== 'pdf' || b.locator.kind !== 'pdf') return 0;
      return a.locator.bounds[1] - b.locator.bounds[1] || a.locator.bounds[0] - b.locator.bounds[0];
    });
    page.forEach((item, i) => positions.set(item.id, i));
  }
  return { byId, pages, positions };
}

/** A bounded viewing aid, never paragraph evidence or a change to captured text. */
export function nearbyPdfStatementText(
  index: ReturnType<typeof indexPdfStatementText>,
  id: string
): TextObservation[] {
  const selected = index.byId.get(id);
  if (!selected || selected.locator.kind !== 'pdf') return [];
  const [x, y, width, height] = selected.locator.bounds;
  if (!(width > 0 && height > 0)) return [];
  const page = index.pages.get(selected.locator.page)!;
  const at = index.positions.get(id)!;
  const neighbors = page.slice(Math.max(0, at - 64), at + 65).filter(item => {
    if (item.locator.kind !== 'pdf' || item.id === id) return false;
    const [left, top, w, h] = item.locator.bounds;
    return (
      w > 0 &&
      h >= height * 0.75 &&
      h <= height * 1.25 &&
      Math.abs(left - x) <= height * 0.75 &&
      Math.abs(top - y) <= height * 8
    );
  });
  const adjacent = (direction: -1 | 1) => {
    const found: TextObservation[] = [];
    let top = y;
    for (let line = 0; line < 3; line++) {
      const candidates = neighbors.filter(item => {
        if (item.locator.kind !== 'pdf') return false;
        const gap = (item.locator.bounds[1] - top) * direction;
        return gap >= height * 0.75 && gap <= height * 2;
      });
      candidates.sort((a, b) => {
        if (a.locator.kind !== 'pdf' || b.locator.kind !== 'pdf') return 0;
        return (a.locator.bounds[1] - b.locator.bounds[1]) * direction;
      });
      const next = candidates[0];
      if (!next || next.locator.kind !== 'pdf') break;
      const nextTop = next.locator.bounds[1];
      // Overlapping alternatives are not a reliable reading order.
      if (
        candidates
          .slice(1)
          .some(item =>
            item.locator.kind === 'pdf'
              ? Math.abs(item.locator.bounds[1] - nextTop) < height * 0.75
              : false
          )
      )
        break;
      found.push(next);
      top = nextTop;
    }
    return direction === -1 ? found.reverse() : found;
  };
  return [...adjacent(-1), selected, ...adjacent(1)];
}
