import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import type { ColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { readAnyGuidelineProject, type OpenedGuidelineProject } from './projectCodec';
import { compareGuidelineSourceProjects, retainedScaleIds } from './refreshLineage';
import { guidelineHash } from './review';
import { readGuidelineAuthoredGradient } from './authoredGradient';
import { GUIDELINE_WORKSPACE_LIMITS } from './selectedOutputs';
import { replayReviewedDesigns, type ReviewedDesignRefreshContext } from './refreshReplay';
import {
  applySourceSetReview,
  inspectSourceSet,
  prepareSourceSetEntry,
  sourceSetEntityId,
  sourceSetSubjectKey,
  type SourceSetDraft,
  type SourceSetEntry,
} from './sourceSet';
import {
  readSourceSetProject,
  serializeSourceSetProject,
  SOURCE_SET_PROJECT_VERSION,
  SOURCE_SET_NEW_SCALE_PROJECT_VERSION,
  type SourceSetWorkspace,
} from './sourceSetProject';

export interface SourceSetRefreshLineage {
  schemaVersion: 'teul.source-set-refresh.v1' | 'teul.source-set-refresh.v2';
  previousProjectJson: string;
  entryId: string;
  nextSourcesHash: string;
  proposalHash: string;
  lineageHash: string;
}
type Inspection = Awaited<ReturnType<typeof inspectSourceSet>>;
type EntryReview = Inspection['entries'][number];
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const sorted = <T>(items: readonly T[]) =>
  [...items].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
const bindingsHash = (draft: SourceSetDraft) =>
  guidelineHash(
    sorted(draft.entries.map(e => ({ id: e.id, projectHash: guidelineHash(e.projectJson) })))
  );
export const sourceSetRefreshApplies = (lineage: SourceSetRefreshLineage, draft: SourceSetDraft) =>
  bindingsHash(draft) === lineage.nextSourcesHash;
async function source(json: string, signal?: AbortSignal): Promise<OpenedGuidelineProject> {
  const result = await readAnyGuidelineProject(json, signal);
  if (result.status !== 'opened' || !result.value.project.review)
    throw new Error('Apply the replacement source review before updating the set.');
  return result.value;
}
function meaning(model: ColorSystemModelV1, id: string, mode: string) {
  const color = model.colors.find(c => c.id === id);
  if (!color) return null;
  return {
    label: color.label,
    value: color.valuesByMode[mode] ?? null,
    families: sorted(model.families.filter(f => f.colorIds.includes(id)).map(f => f.label)),
  };
}
function authority(model: ColorSystemModelV1) {
  return sorted(
    model.sources.map(({ id: _id, sourceHash: _hash, version: _version, ...source }) => source)
  );
}
function reviewedPairs(
  before: EntryReview,
  after: EntryReview,
  pairs: ReadonlyMap<string, string>,
  modes: ReadonlyMap<string, string>,
  metadata: readonly string[]
) {
  const result = new Map<string, string>();
  if (metadata.length || modes.get(before.entry.modeId) !== after.entry.modeId) return result;
  for (const [a, b] of pairs) {
    const left = meaning(before.review.model, a, before.entry.modeId),
      right = meaning(after.review.model, b, after.entry.modeId);
    if (left && right && same(left, right)) result.set(a, b);
  }
  // Correspondence cannot merge two original colors into one updated member.
  const destinations = [...result.values()];
  for (const [a, b] of result)
    if (destinations.filter(id => id === b).length !== 1) result.delete(a);
  return result;
}
function sameMembers(
  before: Inspection['subjects'][number],
  after: Inspection['subjects'][number],
  pairs: ReadonlyMap<string, ReadonlyMap<string, string>>
) {
  return (
    before.subject === after.subject &&
    before.members.length === after.members.length &&
    before.members.every(a =>
      after.members.some(
        b => b.entryId === a.entryId && pairs.get(a.entryId)?.get(a.colorId) === b.colorId
      )
    )
  );
}

/** Refresh review choices as editable intent, never as inherited merged approval. */
export async function proposeSourceSetRefresh(
  previous: SourceSetWorkspace,
  entryId: string,
  nextProjectJson: string,
  signal?: AbortSignal
) {
  const before = await inspectSourceSet(previous.draft, signal),
    old = before.entries.find(e => e.entry.id === entryId);
  if (!old) throw new Error('Select the source in this set that is being updated.');
  const previousSource = await source(old.entry.projectJson, signal),
    nextSource = await source(nextProjectJson, signal);
  if (previousSource.kind !== nextSource.kind)
    throw new Error('A source update must keep its PDF, Figma or website input format.');
  const comparison = compareGuidelineSourceProjects(previousSource, nextSource);
  const metadataChanges = [...comparison.proposal.metadataChanges];
  if (!same(authority(old.review.model), authority(nextSource.project.review!.model)))
    metadataChanges.push('Reviewed source authority changed');
  const prepared = await prepareSourceSetEntry(nextProjectJson, entryId, signal);
  const mappedMode = comparison.modes.get(old.entry.modeId);
  const entry: SourceSetEntry = {
    ...prepared.entry,
    modeId:
      mappedMode && nextSource.project.review!.model.modes.some(m => m.id === mappedMode)
        ? mappedMode
        : prepared.entry.modeId,
  };
  const candidate: EntryReview = {
    entry,
    review: nextSource.project.review!,
    kind: nextSource.kind,
  };
  const colorPairs = reviewedPairs(
    old,
    candidate,
    comparison.colors,
    comparison.modes,
    metadataChanges
  );
  const oldMappings = new Map(
    previous.draft.subjects.filter(s => s.entryId === entryId).map(s => [s.colorId, s.subject])
  );
  const reverse = new Map([...colorPairs].map(([a, b]) => [b, a]));
  const used = new Set([...colorPairs.keys()].map(id => sourceSetSubjectKey(oldMappings.get(id)!)));
  const mappings = prepared.subjects.map((s, index) => {
    const original = reverse.get(s.colorId);
    let subject = original ? oldMappings.get(original)! : s.subject;
    if (!original) {
      let suffix = index + 1;
      while (used.has(sourceSetSubjectKey(subject)))
        subject = `${s.subject.slice(0, 130)} (updated ${suffix++})`;
      used.add(sourceSetSubjectKey(subject));
    }
    return {
      beforeColorId: original ?? null,
      colorId: s.colorId,
      subject,
      status: original ? ('retained' as const) : ('suggested' as const),
    };
  });
  let draft: SourceSetDraft = {
    ...previous.draft,
    entries: previous.draft.entries.map(e => (e.id === entryId ? entry : e)),
    subjects: [
      ...previous.draft.subjects.filter(s => s.entryId !== entryId),
      ...mappings.map(m => ({ entryId, colorId: m.colorId, subject: m.subject })),
    ],
    resolutions: [],
  };
  const fresh = await inspectSourceSet(draft, signal);
  const pairs = new Map(
    before.entries.map(e => [
      e.entry.id,
      e.entry.id === entryId ? colorPairs : new Map(e.review.model.colors.map(c => [c.id, c.id])),
    ])
  );
  const retained: string[] = [],
    reset: string[] = [];
  for (const choice of previous.draft.resolutions) {
    const a = before.subjects.find(s => s.subject === sourceSetSubjectKey(choice.subject))!,
      b = fresh.subjects.find(s => s.subject === a.subject);
    const chosenId = pairs.get(choice.chosen.entryId)?.get(choice.chosen.colorId);
    if (
      b?.conflicting &&
      sameMembers(a, b, pairs) &&
      chosenId &&
      b.members.some(m => m.entryId === choice.chosen.entryId && m.colorId === chosenId && m.value)
    ) {
      draft.resolutions.push({
        ...choice,
        subject: b.subject,
        memberHash: b.memberHash,
        chosen: { entryId: choice.chosen.entryId, colorId: chosenId },
      });
      retained.push(b.subject);
    } else reset.push(a.subject);
  }
  // Rebuild with any retained editable value choices; no old rule adoptions survive.
  draft = { ...draft, resolutions: [...draft.resolutions] };
  await inspectSourceSet(draft, signal);
  const content = {
    entryId,
    previousDraftHash: before.draftHash,
    nextSourceHash: guidelineHash(nextProjectJson),
    draft,
    metadataChanges,
    changes: comparison.proposal.changes,
    mappings,
    retainedResolutions: retained,
    resetResolutions: reset,
    identical: old.entry.projectJson === nextProjectJson,
  };
  signal?.throwIfAborted();
  return freeze({ ...content, proposalHash: guidelineHash(content) });
}
export async function prepareSourceSetRefresh(
  previous: SourceSetWorkspace,
  entryId: string,
  nextProjectJson: string,
  signal?: AbortSignal
) {
  const previousProjectJson = await serializeSourceSetProject(
    { ...previous, refresh: undefined },
    signal
  );
  const proposal = await proposeSourceSetRefresh(previous, entryId, nextProjectJson, signal);
  const content = {
    schemaVersion:
      JSON.parse(previousProjectJson).schemaVersion === SOURCE_SET_NEW_SCALE_PROJECT_VERSION
        ? ('teul.source-set-refresh.v2' as const)
        : ('teul.source-set-refresh.v1' as const),
    previousProjectJson,
    entryId,
    nextSourcesHash: bindingsHash(proposal.draft),
    proposalHash: proposal.proposalHash,
  };
  return freeze({ proposal, lineage: { ...content, lineageHash: guidelineHash(content) } });
}

async function inspectLineage(raw: unknown, draft: SourceSetDraft, signal?: AbortSignal) {
  const value = snapshotColorSystemInertJsonV1(raw, GUIDELINE_WORKSPACE_LIMITS);
  record(value, [
    'schemaVersion',
    'previousProjectJson',
    'entryId',
    'nextSourcesHash',
    'proposalHash',
    'lineageHash',
  ]);
  const { lineageHash, ...content } = value;
  if (
    (value.schemaVersion !== 'teul.source-set-refresh.v1' &&
      value.schemaVersion !== 'teul.source-set-refresh.v2') ||
    typeof value.previousProjectJson !== 'string' ||
    typeof value.entryId !== 'string' ||
    guidelineHash(content) !== lineageHash
  )
    throw new Error('Source-set refresh history failed its integrity check.');
  // One flat predecessor prevents nested history growth and recursive decoding.
  const predecessor = JSON.parse(value.previousProjectJson);
  if (
    value.schemaVersion === 'teul.source-set-refresh.v1'
      ? predecessor?.schemaVersion !== SOURCE_SET_PROJECT_VERSION
      : predecessor?.schemaVersion !== SOURCE_SET_NEW_SCALE_PROJECT_VERSION ||
        predecessor.refresh !== null
  )
    throw new Error(
      value.schemaVersion === 'teul.source-set-refresh.v1'
        ? 'Source-set refresh history requires a flat V1 predecessor.'
        : 'Source-set refresh history requires a flat V3 predecessor.'
    );
  const previous = await readSourceSetProject(value.previousProjectJson, signal);
  if (previous.status !== 'opened') throw new Error('Previous source set is read-only.');
  const lineage = freeze(value as unknown as SourceSetRefreshLineage);
  if (!sourceSetRefreshApplies(lineage, draft))
    throw new Error('Refresh history belongs to a different source set.');
  const entry = draft.entries.find(e => e.id === lineage.entryId);
  if (!entry) throw new Error('The updated source is missing.');
  const proposal = await proposeSourceSetRefresh(
    previous.value,
    entry.id,
    entry.projectJson,
    signal
  );
  if (
    proposal.proposalHash !== lineage.proposalHash ||
    bindingsHash(proposal.draft) !== lineage.nextSourcesHash
  )
    throw new Error('Refresh history differs from its source comparison.');
  return { lineage, previous: previous.value };
}
export async function readSourceSetRefresh(
  raw: unknown,
  draft: SourceSetDraft,
  signal?: AbortSignal
) {
  return (await inspectLineage(raw, draft, signal)).lineage;
}

/** Recompute semantic continuity against the current edited draft, not only the staged proposal. */
export async function replaySourceSetRefresh(workspace: SourceSetWorkspace, signal?: AbortSignal) {
  if (!workspace.refresh || !workspace.review)
    throw new Error('Apply the updated source-set review before checking previous designs.');
  const { lineage, previous } = await inspectLineage(workspace.refresh, workspace.draft, signal);
  const before = await inspectSourceSet(previous.draft, signal),
    after = await inspectSourceSet(workspace.draft, signal);
  const verifiedReview = await applySourceSetReview(
    workspace.draft,
    {
      actor: workspace.review.decision.actor,
      reviewedAt: workspace.review.decision.reviewedAt,
    },
    signal
  );
  if (!same(verifiedReview, workspace.review))
    throw new Error('Current review differs from its source set.');
  const pairs = new Map<string, Map<string, string>>(),
    evidencePairs = new Map<string, string>(),
    scaleIds = new Set<string>(),
    familyPairs = new Map<string, string>();
  for (const old of before.entries) {
    const current = after.entries.find(e => e.entry.id === old.entry.id)!;
    const identity = old.entry.projectJson === current.entry.projectJson;
    const currentSource = identity ? null : await source(current.entry.projectJson, signal);
    const comparison = identity
      ? null
      : compareGuidelineSourceProjects(await source(old.entry.projectJson, signal), currentSource!);
    const metadata = [...(comparison?.proposal.metadataChanges ?? [])];
    if (!same(authority(old.review.model), authority(current.review.model)))
      metadata.push('Source authority changed');
    const colors = reviewedPairs(
      old,
      current,
      comparison?.colors ?? new Map(old.review.model.colors.map(c => [c.id, c.id])),
      comparison?.modes ?? new Map(old.review.model.modes.map(m => [m.id, m.id])),
      metadata
    );
    pairs.set(old.entry.id, colors);
    if (
      metadata.length ||
      (comparison?.modes.get(old.entry.modeId) ?? old.entry.modeId) !== current.entry.modeId
    )
      continue;
    const ns = (kind: string, id: string) => sourceSetEntityId(old.entry.id, kind, id);
    const evidence =
      comparison?.evidence ?? new Map(old.review.model.evidence.map(e => [e.id, e.id]));
    for (const [a, b] of evidence) evidencePairs.set(ns('evidence', a), ns('evidence', b));
    for (const [a, b] of colors) {
      const left = old.review.model.colors.find(c => c.id === a)!,
        right = current.review.model.colors.find(c => c.id === b)!;
      if (left.evidenceRefs.length === right.evidenceRefs.length)
        left.evidenceRefs.forEach((id, i) =>
          evidencePairs.set(ns('evidence', id), ns('evidence', right.evidenceRefs[i]))
        );
    }
    const keptScales =
      comparison && currentSource
        ? retainedScaleIds(comparison.scales, currentSource.project.draft)
        : old.review.model.scales.map(s => s.id);
    for (const id of keptScales)
      if (after.model.scales.some(s => s.id === ns('scale', id))) scaleIds.add(ns('scale', id));
    for (const family of old.review.model.families)
      if (current.review.model.families.some(f => f.id === family.id))
        familyPairs.set(ns('family', family.id), ns('family', family.id));
    for (const scale of old.review.model.scales)
      if (current.review.model.scales.some(s => s.id === scale.id))
        familyPairs.set(ns('scale-members', scale.id), ns('scale-members', scale.id));
  }
  const colorPairs = new Map<string, string>();
  for (const a of before.subjects) {
    const b = after.subjects.find(s => s.subject === a.subject);
    if (
      !b ||
      !sameMembers(a, b, pairs) ||
      !same(a.value, b.value) ||
      !a.chosen ||
      !b.chosen ||
      a.chosen.entryId !== b.chosen.entryId ||
      pairs.get(a.chosen.entryId)?.get(a.chosen.colorId) !== b.chosen.colorId
    )
      continue;
    colorPairs.set(a.representativeColorId, b.representativeColorId);
    const oldColor = before.model.colors.find(c => c.id === a.representativeColorId)!,
      nextColor = after.model.colors.find(c => c.id === b.representativeColorId)!;
    oldColor.evidenceRefs.forEach((id, i) => evidencePairs.set(id, nextColor.evidenceRefs[i]));
  }
  const context: ReviewedDesignRefreshContext = {
    previousModel: previous.review?.model ?? null,
    previousSelection: null,
    legacyGradientKind: 'native',
    outputs: previous.outputs,
    gradient: previous.gradientSelection,
    colorPairs,
    evidencePairs,
    scaleIds,
    familyPairs,
    modePairs: new Map([['Working', 'Working']]),
    metadataChanges: previous.draft.scope === workspace.draft.scope ? [] : ['Working use changed'],
  };
  const result = await replayReviewedDesigns(context, workspace.review, signal);
  const selection = readGuidelineAuthoredGradient(workspace.review, result.selection);
  const content = {
    ...result,
    selection,
    reviewHash: workspace.review.reviewHash,
    lineageHash: lineage.lineageHash,
  };
  return freeze({ ...content, replayHash: guidelineHash(content) });
}
