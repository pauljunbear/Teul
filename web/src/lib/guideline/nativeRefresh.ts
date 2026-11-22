import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { guidelineHash } from './review';
import { mapSourceRuleDefinition } from './structureRules';
import type { SourceReviewDraft } from './sourceReviewContracts';
import type { SourceSelectorV2 } from './reviewV2';

export interface NativeRefreshRecord {
  id: string;
  kind: 'color' | 'mode' | 'statement';
  key: string;
  signature: string;
  label: string;
  locator: string;
  ambiguous?: boolean;
}
export interface NativeRefreshSnapshot {
  captureHash: string;
  records: NativeRefreshRecord[];
  /** Changes here prevent interpretation carryover; authority is never inferred from paint. */
  constraints: Record<string, unknown>;
  revision: unknown;
}
export interface NativeRefreshProposal<D extends string = string> {
  schemaVersion: 'teul.native-refresh-proposal.v1';
  previousCaptureHash: string;
  nextCaptureHash: string;
  previousDraftHash: string;
  draft: SourceReviewDraft<D>;
  changes: {
    kind: NativeRefreshRecord['kind'];
    status: 'unchanged' | 'changed' | 'added' | 'removed' | 'ambiguous';
    beforeId: string | null;
    afterId: string | null;
    before: string | null;
    after: string | null;
    locator: string;
    comparisonKey: string;
    beforeSignature: string | null;
    afterSignature: string | null;
  }[];
  metadataChanges: string[];
  revisionChanged: boolean;
  identical: boolean;
  retained: { colors: number; modes: number; scales: number; statements: number };
  reset: { colors: number; modes: number; scales: number; statements: number };
  proposalHash: string;
}
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function indexed(records: NativeRefreshRecord[]) {
  const result = new Map<string, NativeRefreshRecord[]>();
  for (const record of records) {
    const key = `${record.kind}:${record.key}`,
      items = result.get(key) ?? [];
    items.push(record);
    result.set(key, items);
  }
  return result;
}

/** Source-specific wrappers validate inventories and drafts before calling this pure mapper. */
export function compareNativeReview<D extends string>(
  before: NativeRefreshSnapshot,
  after: NativeRefreshSnapshot,
  old: SourceReviewDraft<D>,
  fresh: SourceReviewDraft<D>,
  validate: (draft: SourceReviewDraft<D>) => SourceReviewDraft<D>
): NativeRefreshProposal<D> {
  const previous = indexed(before.records),
    next = indexed(after.records);
  const unchanged = new Map<string, string>();
  const changes: NativeRefreshProposal<D>['changes'] = [];
  const add = (
    left: NativeRefreshRecord | null,
    right: NativeRefreshRecord | null,
    status: NativeRefreshProposal<D>['changes'][number]['status']
  ) =>
    changes.push({
      kind: (right ?? left!).kind,
      status,
      beforeId: left?.id ?? null,
      afterId: right?.id ?? null,
      before: left?.label ?? null,
      after: right?.label ?? null,
      locator: (right ?? left!).locator,
      comparisonKey: (right ?? left!).key,
      beforeSignature: left?.signature ?? null,
      afterSignature: right?.signature ?? null,
    });
  for (const key of new Set([...previous.keys(), ...next.keys()])) {
    const left = previous.get(key) ?? [],
      right = next.get(key) ?? [];
    if (
      left.length > 1 ||
      right.length > 1 ||
      left.some(item => item.ambiguous) ||
      right.some(item => item.ambiguous)
    ) {
      left.forEach(item => add(item, null, 'ambiguous'));
      right.forEach(item => add(null, item, 'ambiguous'));
    } else if (left.length && right.length) {
      const same = left[0].signature === right[0].signature;
      if (same) unchanged.set(left[0].id, right[0].id);
      add(left[0], right[0], same ? 'unchanged' : 'changed');
    } else if (left.length) add(left[0], null, 'removed');
    else add(null, right[0], 'added');
  }
  const metadataChanges = [
    ...new Set([...Object.keys(before.constraints), ...Object.keys(after.constraints)]),
  ].filter(key => !equal(before.constraints[key] ?? null, after.constraints[key] ?? null));
  const revisionChanged = !equal(before.revision, after.revision);
  const allowed = metadataChanges.length === 0;
  const safeModes = new Map(
    old.modeIds.filter(id => allowed && unchanged.has(id)).map(id => [id, unchanged.get(id)!])
  );
  const safeColors = new Map(
    old.colors
      .filter(item => allowed && unchanged.has(item.declarationId))
      .map(item => [item.declarationId, unchanged.get(item.declarationId)!])
  );
  const safeFamilies = new Map<string, boolean>();
  for (const color of old.colors)
    safeFamilies.set(
      color.family,
      (safeFamilies.get(color.family) ?? true) && safeColors.has(color.declarationId)
    );
  // Profile decisions and partial-source acceptance belong to the next explicit review.
  const draft: SourceReviewDraft<D> = {
    ...fresh,
    modeIds: [...safeModes.values()],
    profileDecision: null,
    colors: old.colors
      .filter(item => safeColors.has(item.declarationId))
      .map(item => ({ ...item, declarationId: safeColors.get(item.declarationId)! })),
    scopeDecision: { accepted: false, reason: old.scopeDecision.reason },
    scales: [],
  };
  for (const scale of old.scales) {
    if (
      !allowed ||
      scale.evidenceRefs.some(id => !unchanged.has(id)) ||
      scale.modes.some(
        mode =>
          !safeModes.has(mode.modeId) ||
          mode.anchors.some(anchor => !safeColors.has(anchor.declarationId))
      )
    )
      continue;
    draft.scales.push({
      ...scale,
      slots: scale.slots.map(slot => ({ ...slot })),
      evidenceRefs: scale.evidenceRefs.map(id => unchanged.get(id)!),
      modes: scale.modes.map(mode => ({
        modeId: safeModes.get(mode.modeId)!,
        anchors: mode.anchors.map(anchor => ({
          ...anchor,
          declarationId: safeColors.get(anchor.declarationId)!,
        })),
      })),
    });
  }
  const safeScales = new Set(draft.scales.map(scale => scale.id));
  const remap = (selector: SourceSelectorV2): SourceSelectorV2 => {
    if (selector.kind === 'color') {
      if (!safeColors.has(selector.id)) throw new Error('Changed color dependency');
      return { ...selector, id: safeColors.get(selector.id)! };
    }
    if (selector.kind === 'scale' ? !safeScales.has(selector.id) : !safeFamilies.get(selector.id))
      throw new Error('Changed structure dependency');
    return { ...selector };
  };
  const statements = new Map(draft.statements.map(item => [item.observationId, item]));
  let retainedStatements = 0;
  for (const statement of old.statements) {
    const id = unchanged.get(statement.observationId);
    if (!allowed || !id || statement.modeIds.some(mode => !safeModes.has(mode))) continue;
    if (
      statement.meaning === 'closed-palette' &&
      (safeColors.size !== old.colors.length ||
        changes.some(item => item.kind === 'color' && item.status !== 'unchanged'))
    )
      continue;
    let definition = statement.definition;
    try {
      if (definition) definition = mapSourceRuleDefinition(definition, remap);
    } catch {
      continue;
    }
    statements.set(id, {
      ...statement,
      observationId: id,
      modeIds: statement.modeIds.map(mode => safeModes.get(mode)!),
      definition,
    });
    retainedStatements++;
  }
  draft.statements = [...statements.values()];
  const retained = {
    colors: draft.colors.length,
    modes: draft.modeIds.length,
    scales: draft.scales.length,
    statements: retainedStatements,
  };
  const result = {
    schemaVersion: 'teul.native-refresh-proposal.v1' as const,
    previousCaptureHash: before.captureHash,
    nextCaptureHash: after.captureHash,
    previousDraftHash: guidelineHash(old),
    draft: validate(draft),
    changes,
    metadataChanges,
    revisionChanged,
    identical:
      !metadataChanges.length &&
      !revisionChanged &&
      changes.every(item => item.status === 'unchanged'),
    retained,
    reset: {
      colors: old.colors.length - retained.colors,
      modes: old.modeIds.length - retained.modes,
      scales: old.scales.length - retained.scales,
      statements: old.statements.length - retained.statements,
    },
  };
  return freeze({ ...result, proposalHash: guidelineHash(result) });
}
