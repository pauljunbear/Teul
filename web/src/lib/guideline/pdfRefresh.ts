import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { parseCaptureAny, observationColorValue, type GuidelineCaptureAny } from './evidenceV2';
import { guidelineHash, suggestGuidelineReviewFromCapture } from './review';
import {
  parseGuidelineStructureDraft,
  upgradeGuidelineDraftV2,
  type GuidelineReviewDraftV2,
  type SourceSelectorV2,
} from './reviewV2';
import { parseGuidelineDraftV4, type GuidelineReviewDraftV4 } from './reviewV4';
import { mapSourceRuleDefinition } from './structureRules';

type Observation = GuidelineCaptureAny['observations'][number];
export interface PdfRefreshChange {
  kind: 'color' | 'text';
  beforeId: string | null;
  afterId: string | null;
  before: string | null;
  after: string | null;
  page: number;
  status: 'unchanged' | 'changed' | 'added' | 'removed' | 'ambiguous';
}
export interface PdfRefreshProposal {
  schemaVersion: 'teul.pdf-refresh-proposal.v1';
  previousCaptureHash: string;
  previousDraftHash: string;
  capture: GuidelineCaptureAny;
  draft: GuidelineReviewDraftV2;
  changes: PdfRefreshChange[];
  metadataChanges: string[];
  retained: { colors: number; rules: number; scales: number };
  reset: { colors: number; rules: number; scales: number; manualValues: number };
  proposalHash: string;
}
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const label = (item: Observation) => (item.kind === 'text' ? item.text : item.literal);
const key = (item: Observation) => canonicalJson([item.kind, item.locator]);
function index(items: readonly Observation[]) {
  const result = new Map<string, Observation[]>();
  for (const item of items) {
    const identity = key(item);
    const group = result.get(identity) ?? [];
    group.push(item);
    result.set(identity, group);
  }
  return result;
}

/** Copy editable interpretation only. This never creates a review, adoption or current design. */
export function proposePdfRefresh(
  previousRaw: GuidelineCaptureAny,
  previousDraftRaw: GuidelineReviewDraftV2 | GuidelineReviewDraftV4,
  nextRaw: GuidelineCaptureAny
): PdfRefreshProposal {
  const previous = parseCaptureAny(previousRaw),
    capture = parseCaptureAny(nextRaw);
  if (
    previous.kind !== 'pdf' ||
    capture.kind !== 'pdf' ||
    [...previous.observations, ...capture.observations].some(item => item.locator.kind !== 'pdf')
  )
    throw new Error('PDF refresh requires PDF evidence on both sides.');
  const reviewed =
    'reviewedValues' in previousDraftRaw ? parseGuidelineDraftV4(previous, previousDraftRaw) : null;
  const old = reviewed ?? parseGuidelineStructureDraft(previous, previousDraftRaw);
  const draft = upgradeGuidelineDraftV2(suggestGuidelineReviewFromCapture(capture));
  const metadataChanges: string[] = [];
  for (const field of ['label', 'locator', 'revision'] as const)
    if (!equal(previous.identity[field], capture.identity[field]))
      metadataChanges.push(`Source ${field} changed`);
  if (previous.extractionVersion !== capture.extractionVersion)
    metadataChanges.push('Extraction method changed');
  if (!equal(previous.scope, capture.scope))
    metadataChanges.push('Selected pages or capture coverage changed');
  const oldById = new Map(previous.observations.map(item => [item.id, item]));
  const nextById = new Map(capture.observations.map(item => [item.id, item]));
  const before = index(previous.observations),
    after = index(capture.observations);
  const mapping = new Map<string, string>(),
    unchanged = new Map<string, string>();
  const changes: PdfRefreshChange[] = [];
  const content = (item: Observation, items: Map<string, Observation>) =>
    item.kind === 'text'
      ? { text: item.text }
      : {
          literal: item.literal,
          method: item.method,
          value: observationColorValue(item),
          evidence: item.evidenceRefs.map(ref => {
            const evidence = items.get(ref)!;
            return { kind: evidence.kind, locator: evidence.locator, text: label(evidence) };
          }),
        };
  const add = (
    left: Observation | null,
    right: Observation | null,
    status: PdfRefreshChange['status']
  ) => {
    const item = right ?? left!;
    changes.push({
      kind: item.kind,
      beforeId: left?.id ?? null,
      afterId: right?.id ?? null,
      before: left ? label(left) : null,
      after: right ? label(right) : null,
      page: item.locator.kind === 'pdf' ? item.locator.page : 0,
      status,
    });
  };
  for (const identity of new Set([...before.keys(), ...after.keys()])) {
    const left = before.get(identity) ?? [],
      right = after.get(identity) ?? [];
    if (left.length > 1 || right.length > 1) {
      left.forEach(item => add(item, null, 'ambiguous'));
      right.forEach(item => add(null, item, 'ambiguous'));
    } else if (left.length && right.length) {
      mapping.set(left[0].id, right[0].id);
      const same = equal(content(left[0], oldById), content(right[0], nextById));
      if (same) unchanged.set(left[0].id, right[0].id);
      add(left[0], right[0], same ? 'unchanged' : 'changed');
    } else if (left.length) add(left[0], null, 'removed');
    else add(null, right[0], 'added');
  }
  // A numerically identical color cannot inherit decisions through ambiguous source text.
  for (const change of changes) {
    if (change.status !== 'unchanged' || change.kind !== 'color') continue;
    const left = oldById.get(change.beforeId!)!,
      right = nextById.get(change.afterId!)!;
    if (left.kind !== 'color' || right.kind !== 'color') continue;
    if (
      left.evidenceRefs.length !== right.evidenceRefs.length ||
      left.evidenceRefs.some((id, i) => unchanged.get(id) !== right.evidenceRefs[i])
    ) {
      unchanged.delete(left.id);
      change.status = 'ambiguous';
    }
  }
  const retained = { colors: 0, rules: 0, scales: 0 };
  const reset = {
    colors: 0,
    rules: 0,
    scales: old.scales.length,
    manualValues: reviewed?.reviewedValues.candidates.length ?? 0,
  };
  // Profile/authority metadata and coverage changes need a fresh interpretation even at equal paint.
  const permitted = metadataChanges.length === 0;
  const oldColorByNew = new Map(
    old.colors.flatMap(item => {
      const nextId = unchanged.get(item.observationId);
      return nextId && permitted ? [[nextId, item] as const] : [];
    })
  );
  draft.colors = draft.colors.map(color => {
    const previousColor = oldColorByNew.get(color.observationId);
    if (previousColor) {
      retained.colors++;
      return { ...previousColor, observationId: color.observationId };
    }
    reset.colors++;
    return { ...color, include: false };
  });
  const safeColorIds = new Set(
    old.colors
      .filter(color => permitted && unchanged.has(color.observationId))
      .map(color => color.observationId)
  );
  const safeColor = (id: string) => safeColorIds.has(id);
  const safeFamilies = new Map<string, boolean>();
  for (const color of old.colors)
    safeFamilies.set(
      color.family,
      (safeFamilies.get(color.family) ?? true) && safeColor(color.observationId)
    );
  for (const scale of old.scales) {
    if (
      !permitted ||
      scale.evidenceRefs.some(ref => !unchanged.has(ref)) ||
      scale.slots.some(slot => slot.observationId !== null && !safeColor(slot.observationId))
    )
      continue;
    draft.scales.push({
      ...scale,
      evidenceRefs: scale.evidenceRefs.map(ref => unchanged.get(ref)!),
      slots: scale.slots.map(slot => ({
        ...slot,
        observationId: slot.observationId === null ? null : unchanged.get(slot.observationId)!,
      })),
    });
    retained.scales++;
    reset.scales--;
  }
  const safeScales = new Set(draft.scales.map(scale => scale.id));
  const remapSelector = (selector: SourceSelectorV2): SourceSelectorV2 => {
    if (selector.kind === 'color') {
      if (!safeColor(selector.id)) throw new Error('Changed color dependency');
      return { ...selector, id: unchanged.get(selector.id)! };
    }
    if (selector.kind === 'scale') {
      if (!safeScales.has(selector.id)) throw new Error('Changed scale dependency');
    } else {
      if (!safeFamilies.get(selector.id)) throw new Error('Changed family dependency');
    }
    return { ...selector };
  };
  const nextRules = new Map(draft.rules.map(rule => [rule.observationId, rule]));
  for (const rule of old.rules) {
    const id = mapping.get(rule.observationId);
    if (!id) {
      reset.rules++;
      continue;
    }
    let definition = rule.definition;
    let safe = permitted && unchanged.has(rule.observationId);
    if (rule.meaning === 'closed-palette')
      safe &&=
        old.colors.every(color => safeColor(color.observationId)) &&
        old.colors.length === draft.colors.length;
    if (safe && definition) {
      try {
        definition = mapSourceRuleDefinition(definition, remapSelector);
      } catch {
        safe = false;
      }
    }
    if (safe) {
      nextRules.set(id, { ...rule, observationId: id, definition });
      retained.rules++;
    } else {
      nextRules.set(id, {
        observationId: id,
        meaning: 'needs-interpretation',
        scope: 'all',
        reason: '',
        definition: null,
      });
      reset.rules++;
    }
  }
  draft.rules = [...nextRules.values()];
  // Existing validators catch missing restriction prompts, incomplete references and bounds.
  const validated = parseGuidelineStructureDraft(capture, draft);
  const proposal = {
    schemaVersion: 'teul.pdf-refresh-proposal.v1' as const,
    previousCaptureHash: previous.captureHash,
    previousDraftHash: guidelineHash(old),
    capture,
    draft: validated,
    changes,
    metadataChanges,
    retained,
    reset,
  };
  return freeze({ ...proposal, proposalHash: guidelineHash(proposal) });
}
