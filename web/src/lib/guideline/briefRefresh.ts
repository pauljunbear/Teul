import { refreshGuidelineContextPaints } from './contextPaints';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import type {
  ColorSystemModelV1,
  ColorSystemSelectorV1,
} from '../../../../src/lib/colorSystemModelV1';
import {
  createGuidelineDesignBrief,
  readGuidelineDesignBrief,
  type GuidelineDesignBrief,
  type GuidelineDesignBriefInput,
} from './designBrief';
import type { ReviewedGuideline } from './review';

type Review = Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
export interface BriefRefreshMapping {
  mode: string;
  applicationCompositionHash?: string;
  quantitativeCompositionHash?: string;
  capacityCompositionHash?: string;
  reportCompositionHash?: string;
  color: (id: string) => string;
  family: (id: string) => string;
  scale: (id: string) => string;
  checkRules: () => void;
  evidencePairs?: ReadonlyMap<string, string>;
}
export type RefreshReceiptPair =
  | { kind: 'evidence'; evidenceId: string; before: string; after: string }
  | { kind: 'authority'; before: string; after: string };
/** Renew only compiler receipts whose non-receipt text is unchanged, within their owning evidence. */
export function reviewReceiptPairs(before: unknown, after: unknown): RefreshReceiptPair[] {
  const object = (x: unknown): Record<string, unknown> =>
    x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
  const left = object(before),
    right = object(after);
  const previous = left.model as ColorSystemModelV1 | undefined,
    next = right.model as ColorSystemModelV1 | undefined;
  if (!previous || !next) return [];
  const values = (review: Record<string, unknown>) => {
    const decision = object(review.decision),
      profile = object(object(decision.draft).profileDecision);
    return {
      capture: review.captureHash,
      reviewedAt: decision.reviewedAt,
      profileAt: profile.decidedAt,
      draftHash: decision.draftHash,
    };
  };
  const a = values(left),
    b = values(right);
  const replace = (text: string, keys: (keyof typeof a)[]) => {
    for (const key of keys)
      if (typeof a[key] === 'string' && a[key] && typeof b[key] === 'string')
        text = text.replace(a[key] as string, b[key] as string);
    return text;
  };
  const pairs: RefreshReceiptPair[] = [];
  for (const e of previous.evidence) {
    const keys: (keyof typeof a)[] =
      e.locator === 'capture-scope'
        ? ['capture']
        : e.locator === 'review/profile-srgb'
          ? ['capture', 'profileAt']
          : e.locator === 'review/partial-scope'
            ? ['reviewedAt']
            : [];
    if (!keys.length) continue;
    const owner = previous.sources.find(s => s.id === e.sourceId)!;
    const matches = next.evidence.filter(n => {
      const source = next.sources.find(s => s.id === n.sourceId)!;
      return (
        n.locator === e.locator && source.label === owner.label && source.locator === owner.locator
      );
    });
    if (matches.length === 1 && replace(e.description, keys) === matches[0].description)
      pairs.push({
        kind: 'evidence',
        evidenceId: e.id,
        before: e.description,
        after: matches[0].description,
      });
  }
  for (const [prefix, key] of [
    ['review:', 'capture'],
    ['source-set:', 'draftHash'],
  ] as const)
    if (typeof a[key] === 'string' && a[key] && typeof b[key] === 'string')
      pairs.push({ kind: 'authority', before: prefix + a[key], after: prefix + b[key] });
  return pairs;
}
const sorted = (items: readonly unknown[]) =>
  [...items].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
function fail(message: string): never {
  throw new Error(message);
}

export function mapRefreshRuleOperands(
  value: unknown,
  selector: (s: ColorSystemSelectorV1) => ColorSystemSelectorV1
): unknown {
  if (Array.isArray(value)) return value.map(item => mapRefreshRuleOperands(item, selector));
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    if (
      typeof item.kind === 'string' &&
      ['color', 'family', 'scale'].includes(item.kind) &&
      typeof item.id === 'string'
    )
      return selector(item as unknown as ColorSystemSelectorV1);
    return Object.fromEntries(
      Object.entries(item).map(([k, v]) => [k, mapRefreshRuleOperands(v, selector)])
    );
  }
  return value;
}

/** Renew a brief after proven correspondence. Hashes of old approvals are never copied. */
export function refreshGuidelineBrief(
  previous: Review,
  next: Review,
  old: GuidelineDesignBrief,
  mapping: BriefRefreshMapping,
  receiptPairs: readonly RefreshReceiptPair[] = []
): GuidelineDesignBrief {
  const checked = readGuidelineDesignBrief(old, previous);
  if (checked.input.reportCompositionHash && !mapping.reportCompositionHash)
    fail(
      'Restore the retained report controls to rebind this brief; its identity alone cannot reconstruct records or geometry.'
    );
  if (checked.input.capacityCompositionHash && !mapping.capacityCompositionHash)
    fail(
      'Restore the retained capacity controls to rebind this brief; its identity alone cannot reconstruct records or geometry.'
    );
  if (checked.input.quantitativeCompositionHash && !mapping.quantitativeCompositionHash)
    fail(
      'Restore the retained quantitative controls to rebind this brief; its identity alone cannot reconstruct data or scale evidence.'
    );
  if (checked.input.applicationCompositionHash && !mapping.applicationCompositionHash)
    fail(
      'Restore the retained composition controls to rebind this brief; an identity hash alone cannot reconstruct its gradient.'
    );
  const input: GuidelineDesignBriefInput = {
    ...checked.input,
    modeId: mapping.mode,
    ...(checked.input.capacityCompositionHash
      ? { capacityCompositionHash: mapping.capacityCompositionHash! }
      : {}),
    ...(checked.input.reportCompositionHash
      ? { reportCompositionHash: mapping.reportCompositionHash! }
      : {}),
    ...(checked.input.quantitativeCompositionHash
      ? { quantitativeCompositionHash: mapping.quantitativeCompositionHash! }
      : {}),
    ...(checked.input.applicationCompositionHash
      ? { applicationCompositionHash: mapping.applicationCompositionHash! }
      : {}),
    ...(checked.input.contextPaints
      ? {
          contextPaints: refreshGuidelineContextPaints(
            checked.input.contextPaints,
            checked.input.modeId,
            mapping.mode
          ),
        }
      : {}),
    sourceReferences: checked.input.sourceReferences.map(mapping.color),
    lockedColorIds: checked.input.lockedColorIds.map(mapping.color),
    backgrounds: checked.input.backgrounds.map(background => ({
      ...background,
      sourceColorId:
        background.sourceColorId === null ? null : mapping.color(background.sourceColorId),
    })),
  };
  mapping.checkRules();
  const project = (
    model: ColorSystemModelV1,
    intent: GuidelineDesignBriefInput,
    before: boolean
  ) => {
    const sourceKey = (id: string) => {
      const source =
        model.sources.find(s => s.id === id) ?? fail('A referenced source was removed.');
      const {
        id: _id,
        sourceHash: _hash,
        version: _version,
        currentFileContentHash: _current,
        ...identity
      } = source;
      return identity;
    };
    const evidenceById = new Map(model.evidence.map(e => [e.id, e]));
    const renew = (text: string, evidenceId?: string) => {
      if (!before) return text;
      const matches = receiptPairs.filter(
        pair =>
          pair.before === text &&
          (evidenceId
            ? pair.kind === 'evidence' && pair.evidenceId === evidenceId
            : pair.kind === 'authority')
      );
      const values = new Set(matches.map(pair => pair.after));
      if (values.size > 1) fail('A review receipt has ambiguous correspondence.');
      return matches[0]?.after ?? text;
    };
    const evidence = (id: string) => {
      const e = evidenceById.get(id) ?? fail('A governing evidence record was removed.');
      // These are compiler-generated receipt descriptions. All other evidence stays literal.
      const mapped = before
        ? next.model.evidence.find(n => n.id === mapping.evidencePairs?.get(id))
        : null;
      const locator =
        e.locator?.startsWith('review/statement/') &&
        mapped?.locator?.startsWith('review/statement/')
          ? mapped.locator
          : e.locator;
      return {
        source: sourceKey(e.sourceId),
        locator,
        status: e.status,
        description: renew(e.description, id),
      };
    };
    const links = (item: { evidenceRefs: readonly string[] }) =>
      sorted(item.evidenceRefs.map(evidence));
    const inScope = (item: { contextIds: readonly string[]; modeIds?: readonly string[] }) =>
      (!item.contextIds.length || item.contextIds.includes(intent.sourceContextId)) &&
      (!item.modeIds?.length || item.modeIds.includes(intent.modeId));
    const colorId = (id: string) => (before ? mapping.color(id) : id);
    const familyId = (id: string) => (before ? mapping.family(id) : id);
    const scaleId = (id: string) => (before ? mapping.scale(id) : id);
    const selector = (s: ColorSystemSelectorV1) => ({
      ...s,
      id: s.kind === 'color' ? colorId(s.id) : s.kind === 'family' ? familyId(s.id) : scaleId(s.id),
    });
    const operands = (value: unknown) => mapRefreshRuleOperands(value, selector);
    const rule = (id: string) => {
      const r = model.rules.find(r => r.id === id) ?? fail('A referenced rule was removed.');
      const adoption = model.adoptions.find(a => a.ruleId === id);
      return {
        kind: r.kind,
        label: r.label,
        force: r.force,
        origin: r.origin,
        evidence: links(r),
        operands: operands(r.operands),
        adoption: adoption
          ? {
              status: adoption.status,
              actor: adoption.actor,
              authorityRef: renew(adoption.authorityRef),
            }
          : null,
      };
    };
    const ids = new Set([
      ...intent.sourceReferences,
      ...intent.backgrounds.flatMap(b => (b.sourceColorId ? [b.sourceColorId] : [])),
    ]);
    const rules = model.rules.filter(inScope);
    for (const rule of rules)
      mapRefreshRuleOperands(rule.operands, selected => {
        if (selected.kind === 'color') ids.add(selected.id);
        if (selected.kind === 'family')
          model.families.find(f => f.id === selected.id)?.colorIds.forEach(id => ids.add(id));
        if (selected.kind === 'scale')
          model.scales
            .find(s => s.id === selected.id)
            ?.modes.find(m => m.modeId === intent.modeId)
            ?.anchors.forEach(a => ids.add(a.colorId));
        return selected;
      });
    // A family's membership and scales are dependencies of the current brief contract.
    // Include their color evidence too, even when a rule refers to an unselected partner.
    let previousSize;
    do {
      previousSize = ids.size;
      for (const family of model.families)
        if (family.colorIds.some(id => ids.has(id))) family.colorIds.forEach(id => ids.add(id));
    } while (previousSize !== ids.size);
    const colors = model.colors.filter(c => ids.has(c.id));
    const families = model.families.filter(f => f.colorIds.some(id => ids.has(id)));
    const scales = model.scales.filter(s => families.some(f => f.id === s.familyId));
    const context =
      model.contexts.find(c => c.id === intent.sourceContextId) ??
      fail('The source context was removed.');
    const conflicts = model.conflicts.filter(
      c =>
        inScope(c) &&
        (c.status === 'unresolved' ||
          ((!c.colorIds?.length || c.colorIds.some(id => ids.has(id))) &&
            (!c.ruleIds.length || c.ruleIds.some(id => rules.some(r => r.id === id)))))
    );
    const claimIds = new Set(
      [context, ...colors, ...families, ...scales, ...rules, ...conflicts].flatMap(e => e.claimIds)
    );
    const claim = (id: string) => {
      const c = model.claims.find(c => c.id === id) ?? fail('A governing claim was removed.');
      const profile = c.evidenceRefs.find(
        id => evidenceById.get(id)?.locator === 'review/profile-srgb'
      );
      return {
        source: sourceKey(c.sourceId),
        text: profile ? renew(c.text, profile) : c.text,
        status: c.status,
        evidence: links(c),
        contexts: sorted(c.contextIds),
        rules: sorted(c.ruleIds.map(rule)),
      };
    };
    const claims = model.claims.filter(
      c =>
        inScope(c) &&
        (claimIds.has(c.id) || ['unresolved', 'unsupported', 'contradicted'].includes(c.status))
    );
    const sourceIds = new Set(
      [
        ...colors,
        ...claims,
        ...[context, ...colors, ...families, ...scales, ...rules, ...conflicts].flatMap(e =>
          e.evidenceRefs.map(id => evidenceById.get(id)!)
        ),
      ].map(e => e.sourceId)
    );
    const usedEvidence = new Set(
      [context, ...colors, ...families, ...scales, ...rules, ...conflicts, ...claims].flatMap(
        e => e.evidenceRefs
      )
    );
    const constraints = model.brandConstraintsByContext.filter(
      c => !c.contextIds.length || c.contextIds.includes(intent.sourceContextId)
    );
    constraints.forEach(c => sourceIds.add(c.sourceId));
    return {
      context: { id: context.id, label: context.label, evidence: links(context) },
      mode: model.modes.find(m => m.id === intent.modeId)?.label,
      colors: sorted(
        colors.map(c => ({
          id: colorId(c.id),
          label: c.label,
          source: sourceKey(c.sourceId),
          value: c.valuesByMode[intent.modeId],
          evidence: links(c),
        }))
      ),
      families: sorted(
        families.map(f => ({
          id: familyId(f.id),
          label: f.label,
          members: sorted(f.colorIds.map(colorId)),
          evidence: links(f),
        }))
      ),
      scales: sorted(
        scales.map(s => ({
          id: scaleId(s.id),
          label: s.label,
          family: familyId(s.familyId),
          slots: s.slots,
          anchors: s.modes
            .find(m => m.modeId === intent.modeId)
            ?.anchors.map(a => ({ ...a, colorId: colorId(a.colorId) })),
          evidence: links(s),
        }))
      ),
      rules: sorted(rules.map(r => rule(r.id))),
      claims: sorted(claims.map(c => claim(c.id))),
      conflicts: sorted(
        conflicts.map(c => ({
          message: c.message,
          status: c.status,
          evidence: links(c),
          claims: sorted(c.claimIds.map(claim)),
          rules: sorted(c.ruleIds.map(rule)),
          colors: sorted(c.colorIds?.map(colorId) ?? []),
          resolution: c.resolutionClaimId ? claim(c.resolutionClaimId) : null,
        }))
      ),
      coverage: sorted(
        model.coverage
          .filter(c => sourceIds.has(c.sourceId))
          .map(c => ({
            source: sourceKey(c.sourceId),
            status: c.status,
            note: c.note,
            evidence: sorted(
              c.evidenceRefs
                .filter(
                  id => usedEvidence.has(id) || evidenceById.get(id)?.locator === 'capture-scope'
                )
                .map(evidence)
            ),
            unresolved: sorted(
              c.unresolvedClaimIds.filter(id => claims.some(claim => claim.id === id)).map(claim)
            ),
          }))
      ),
      constraints: sorted(
        constraints.map(c => ({
          source: sourceKey(c.sourceId),
          contexts: sorted(c.contextIds),
          fragment: c.fragment,
        }))
      ),
    };
  };
  const a = project(previous.model, checked.input, true),
    b = project(next.model, input, false);
  if (canonicalJson(a) !== canonicalJson(b))
    fail(
      'The referenced source meaning, evidence, coverage, or governing decisions changed. Previous controls remain in refresh history.'
    );
  return createGuidelineDesignBrief(next, input);
}
