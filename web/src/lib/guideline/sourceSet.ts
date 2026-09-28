import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelV1,
  type ColorSystemModelInputV1,
  type ColorSystemScopedRuleV1,
  type ColorSystemSelectorV1,
} from '../../../../src/lib/colorSystemModelV1';
import type { ColorSystemColorValueV2 } from '../../../../src/lib/colorSystemBuilderV2Contracts';
import { readAnyGuidelineProject, guidelineProjectName } from './projectCodec';
import { GUIDELINE_WORKSPACE_LIMITS } from './selectedOutputs';
import { guidelineHash } from './review';
import { utf8ByteLength } from '../../../../src/lib/utf8';
import { PROJECT_BYTES } from './project';

export interface SourceSetEntry {
  id: string;
  label: string;
  projectJson: string;
  modeId: string;
}
export interface SourceSetSubject {
  entryId: string;
  colorId: string;
  subject: string;
}
export interface SourceSetResolution {
  subject: string;
  memberHash: string;
  chosen: { entryId: string; colorId: string };
  reason: string;
}
export interface SourceSetDraft {
  entries: SourceSetEntry[];
  scope: 'brand' | 'product';
  subjects: SourceSetSubject[];
  resolutions: SourceSetResolution[];
}
export interface SourceSetDecision {
  actor: { kind: 'user'; ref: string };
  reviewedAt: string;
}
export interface SourceSetReview {
  model: ColorSystemModelV1;
  reviewHash: string;
  decision: SourceSetDecision & { draftHash: string };
}
export class SourceSetFutureVersion extends Error {
  constructor(readonly version: string) {
    super(`Source format ${version} is read-only.`);
  }
}
const WORKING = 'Working';
const REVIEW_SOURCE = 'source-set:decisions';
function ruleSelectors(rule: ColorSystemScopedRuleV1): readonly ColorSystemSelectorV1[] {
  const operands = rule.operands;
  if ('members' in operands) return operands.members;
  if ('left' in operands) return [...operands.left, ...operands.right];
  if ('subject' in operands) return [...operands.subject, ...operands.partner];
  return operands.groups.flat();
}
export const sourceSetSubjectKey = (s: string) =>
  s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export const sourceSetEntityId = (entry: string, kind: string, id: string) =>
  `set:${kind}:${guidelineHash([entry, id]).slice(7, 55)}`;
const unique = <T>(values: readonly T[]) => [...new Set(values)];
const paintKey = (value: ColorSystemColorValueV2 | null) =>
  canonicalJson(value ? [value.colorSpace, value.components, value.alpha] : null);
function text(value: unknown, label: string, limit = 160): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    throw new Error(`${label} must contain 1–${limit} characters.`);
}
export function parseSourceSetDraft(raw: unknown): SourceSetDraft {
  const draft = snapshotColorSystemInertJsonV1(raw, GUIDELINE_WORKSPACE_LIMITS);
  record(draft, ['entries', 'scope', 'subjects', 'resolutions']);
  if (!['brand', 'product'].includes(String(draft.scope)))
    throw new Error('Choose brand or product use.');
  if (!Array.isArray(draft.entries) || draft.entries.length > 8)
    throw new Error('A source set supports at most eight sources.');
  for (const e of draft.entries) {
    record(e, ['id', 'label', 'projectJson', 'modeId']);
    text(e.id, 'Source identity', 128);
    text(e.label, 'Source label');
    text(e.modeId, 'Source mode', 128);
    if (typeof e.projectJson !== 'string')
      throw new Error('Original source project bytes are required.');
  }
  if (unique(draft.entries.map(e => (e as SourceSetEntry).id)).length !== draft.entries.length)
    throw new Error('Source identities must be unique.');
  if (
    !Array.isArray(draft.subjects) ||
    draft.subjects.length > 2048 ||
    !Array.isArray(draft.resolutions) ||
    draft.resolutions.length > 256
  )
    throw new Error('Source-set mapping limit exceeded.');
  for (const s of draft.subjects) {
    record(s, ['entryId', 'colorId', 'subject']);
    text(s.entryId, 'Source identity', 128);
    text(s.colorId, 'Color identity', 128);
    text(s.subject, 'Color subject');
  }
  for (const r of draft.resolutions) {
    record(r, ['subject', 'memberHash', 'chosen', 'reason']);
    record(r.chosen, ['entryId', 'colorId']);
    text(r.subject, 'Resolved subject');
    text(r.memberHash, 'Member hash', 128);
    text(r.chosen.entryId, 'Chosen source', 128);
    text(r.chosen.colorId, 'Chosen color', 128);
    text(r.reason, 'Resolution reason', 4096);
  }
  return freeze(draft as unknown as SourceSetDraft);
}
// Exact-byte validation receipts retain only source reviews, never selected output authority.
const sourceReceipts = new Map<
  string,
  { value: Awaited<ReturnType<typeof validateMember>>; bytes: number }
>();
let receiptBytes = 0;
async function validateMember(json: string, signal?: AbortSignal) {
  const opened = await readAnyGuidelineProject(json, signal);
  if (opened.status === 'read-only') throw new SourceSetFutureVersion(opened.version);
  const review = opened.value.project.review;
  if (!review) throw new Error('Apply the source review before adding it to a source set.');
  if (review.model.brandConstraintsByContext.length || review.model.conflicts.length)
    throw new Error(
      'This source has nested territory decisions or conflicts that source sets cannot yet review.'
    );
  return freeze({ review, kind: opened.value.kind, label: guidelineProjectName(opened.value) });
}
async function readMember(json: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const cached = sourceReceipts.get(json);
  if (cached) {
    sourceReceipts.delete(json);
    sourceReceipts.set(json, cached);
    return cached.value;
  }
  const value = await validateMember(json, signal),
    bytes = utf8ByteLength(json);
  signal?.throwIfAborted();
  const completed = sourceReceipts.get(json);
  if (completed) return completed.value;
  while (sourceReceipts.size >= 8 || receiptBytes + bytes > PROJECT_BYTES) {
    const oldest = sourceReceipts.keys().next().value;
    if (oldest === undefined) break;
    receiptBytes -= sourceReceipts.get(oldest)!.bytes;
    sourceReceipts.delete(oldest);
  }
  sourceReceipts.set(json, { value, bytes });
  receiptBytes += bytes;
  return value;
}
async function openEntry(entry: SourceSetEntry, signal?: AbortSignal) {
  const { review, kind } = await readMember(entry.projectJson, signal);
  if (!review.model.modes.some(m => m.id === entry.modeId))
    throw new Error('Select a declared source mode.');
  return { entry, review, kind };
}
export async function prepareSourceSetEntry(projectJson: string, id: string, signal?: AbortSignal) {
  const { review, label } = await readMember(projectJson, signal);
  if (!review?.model.modes.length) throw new Error('Apply the source review before adding it.');
  const entry = {
    id,
    label,
    projectJson,
    modeId: review.model.modes[0].id,
  };
  const names = review.model.colors.map(c => sourceSetSubjectKey(c.label));
  const subjects = review.model.colors.map((c, i) => ({
    entryId: id,
    colorId: c.id,
    subject:
      names.filter(n => n === names[i]).length > 1
        ? `${c.label.slice(0, 120)} (${i + 1})`
        : c.label.slice(0, 160),
  }));
  parseSourceSetDraft({ entries: [entry], subjects, scope: 'brand', resolutions: [] });
  return { entry, subjects };
}
export async function inspectSourceSet(raw: SourceSetDraft, signal?: AbortSignal) {
  const draft = parseSourceSetDraft(raw);
  if (!draft.entries.length) throw new Error('Add a reviewed source to begin.');
  const entries = [];
  for (const entry of [...draft.entries].sort((a, b) => a.id.localeCompare(b.id))) {
    entries.push(await openEntry(entry, signal));
    signal?.throwIfAborted();
  }
  const identities = entries.map(e =>
    guidelineHash([e.kind, e.review.model.sources.map(s => s.sourceHash).sort(), e.entry.modeId])
  );
  if (unique(identities).length !== identities.length)
    throw new Error('This capture and mode are already in the source set.');
  const contexts = [draft.scope, `gradient:${draft.scope}`];
  for (const e of entries)
    if (
      !contexts.every(id =>
        e.review.model.contexts.some(c => c.id === id && c.modeIds.includes(e.entry.modeId))
      )
    )
      throw new Error(`${e.entry.label} does not declare the selected use in this source mode.`);
  const map = new Map<string, string>();
  const key = (e: string, c: string) => canonicalJson([e, c]);
  for (const s of draft.subjects) {
    const k = key(s.entryId, s.colorId);
    if (map.has(k)) throw new Error('A source color has more than one subject mapping.');
    map.set(k, sourceSetSubjectKey(s.subject));
  }
  const expected = entries.flatMap(e => e.review.model.colors.map(c => key(e.entry.id, c.id)));
  if (map.size !== expected.length || expected.some(k => !map.has(k)))
    throw new Error('Map every included source color exactly once.');
  for (const e of entries) {
    const names = e.review.model.colors.map(c => map.get(key(e.entry.id, c.id))!);
    if (unique(names).length !== names.length)
      throw new Error(
        'Colors within one source need distinct subjects; resolve duplicate names first.'
      );
  }
  const draftHash = guidelineHash({
    ...draft,
    entries: entries.map(e => e.entry),
    subjects: [...draft.subjects].sort((a, b) =>
      key(a.entryId, a.colorId).localeCompare(key(b.entryId, b.colorId))
    ),
    resolutions: [...draft.resolutions].sort((a, b) =>
      sourceSetSubjectKey(a.subject).localeCompare(sourceSetSubjectKey(b.subject))
    ),
  });
  const groups = new Map<
    string,
    Array<{
      entryId: string;
      colorId: string;
      label: string;
      sourceLabel: string;
      value: ColorSystemColorValueV2 | null;
      reviewHash: string;
      modeId: string;
    }>
  >();
  for (const e of entries)
    for (const c of e.review.model.colors) {
      const subject = map.get(key(e.entry.id, c.id))!;
      const members = groups.get(subject) ?? [];
      members.push({
        entryId: e.entry.id,
        colorId: c.id,
        label: c.label,
        sourceLabel: e.entry.label,
        value: c.valuesByMode[e.entry.modeId] ?? null,
        reviewHash: e.review.reviewHash,
        modeId: e.entry.modeId,
      });
      groups.set(subject, members);
    }
  const resolutions = new Map(draft.resolutions.map(r => [sourceSetSubjectKey(r.subject), r]));
  if (
    resolutions.size !== draft.resolutions.length ||
    [...resolutions.keys()].some(s => !groups.has(s))
  )
    throw new Error('Resolution subjects must be unique and present.');
  const subjects = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, members]) => {
      const memberHash = guidelineHash({ subject, scope: draft.scope, members });
      const conflicting = unique(members.map(m => paintKey(m.value))).length > 1;
      const decision = resolutions.get(subject);
      const picked =
        decision &&
        members.find(
          m => m.entryId === decision.chosen.entryId && m.colorId === decision.chosen.colorId
        );
      if (decision && (decision.memberHash !== memberHash || !picked?.value || !conflicting))
        throw new Error(
          'A color resolution is stale or does not choose an available conflicting value.'
        );
      const chosen = picked ?? (!conflicting && members[0].value ? members[0] : null);
      return {
        subject,
        memberHash,
        members,
        conflicting,
        resolved: !!chosen,
        chosen: chosen ? { entryId: chosen.entryId, colorId: chosen.colorId } : null,
        value: chosen?.value ?? null,
        representativeColorId: sourceSetEntityId('subjects', 'color', subject),
      };
    });
  const bySubject = new Map(subjects.map(s => [s.subject, s]));
  const representative = (e: string, c: string) => bySubject.get(map.get(key(e, c))!)!;
  const sources: ColorSystemModelInputV1['sources'][number][] = [];
  const evidence: ColorSystemModelInputV1['evidence'][number][] = [];
  const claims: ColorSystemModelInputV1['claims'][number][] = [];
  const coverage: ColorSystemModelInputV1['coverage'][number][] = [];
  const families: ColorSystemModelInputV1['families'][number][] = [];
  const scales: ColorSystemModelInputV1['scales'][number][] = [];
  const rules: ColorSystemScopedRuleV1[] = [];
  const conflicts: ColorSystemModelInputV1['conflicts'][number][] = [];
  const unavailableScales: { entryId: string; scaleId: string; label: string; reason: string }[] =
    [];
  const memberClaim = new Map<string, { claimId: string; evidenceRefs: readonly string[] }>();
  const active = (
    item: { contextIds: readonly string[]; modeIds?: readonly string[] },
    mode: string
  ) =>
    (!item.modeIds?.length || item.modeIds.includes(mode)) &&
    (!item.contextIds.length || item.contextIds.some(c => contexts.includes(c)));
  // Subject matches establish color correspondence, not permission to grow another source's groups.
  const governedGroups = entries.flatMap(({ entry, review }) =>
    review.model.rules
      .filter(r => active(r, entry.modeId))
      .flatMap(r =>
        ruleSelectors(r)
          .filter(s => s.kind !== 'color')
          .map(s => {
            const ids =
              s.kind === 'family'
                ? review.model.families.find(f => f.id === s.id)!.colorIds
                : (review.model.scales
                    .find(scale => scale.id === s.id)!
                    .modes.find(m => m.modeId === entry.modeId)
                    ?.anchors.map(a => a.colorId) ?? []);
            return {
              entryId: entry.id,
              colors: new Set(ids.map(id => representative(entry.id, id).representativeColorId)),
            };
          })
      )
  );
  for (const { entry, review } of entries) {
    const model = review.model,
      ns = (kind: string, id: string) => sourceSetEntityId(entry.id, kind, id);
    const selectedRules = model.rules.filter(r => active(r, entry.modeId));
    const selectedClaims = model.claims.filter(c => active(c, entry.modeId));
    const claimIds = new Set(selectedClaims.map(c => c.id)),
      ruleIds = new Set(selectedRules.map(r => r.id));
    const links = (item: { evidenceRefs: readonly string[]; claimIds: readonly string[] }) => ({
      evidenceRefs: item.evidenceRefs.map(id => ns('evidence', id)),
      claimIds: item.claimIds.filter(id => claimIds.has(id)).map(id => ns('claim', id)),
    });
    sources.push(...model.sources.map(s => ({ ...s, id: ns('source', s.id) })));
    evidence.push(
      ...model.evidence.map(e => ({
        ...e,
        id: ns('evidence', e.id),
        sourceId: ns('source', e.sourceId),
      }))
    );
    claims.push(
      ...selectedClaims.map(c => ({
        ...c,
        id: ns('claim', c.id),
        sourceId: ns('source', c.sourceId),
        evidenceRefs: c.evidenceRefs.map(id => ns('evidence', id)),
        contextIds: c.contextIds.filter(id => contexts.includes(id)),
        modeIds: [WORKING],
        ruleIds: c.ruleIds.filter(id => ruleIds.has(id)).map(id => ns('rule', id)),
      }))
    );
    coverage.push(
      ...model.coverage.map(c => ({
        ...c,
        sourceId: ns('source', c.sourceId),
        evidenceRefs: c.evidenceRefs.map(id => ns('evidence', id)),
        unresolvedClaimIds: c.unresolvedClaimIds
          .filter(id => claimIds.has(id))
          .map(id => ns('claim', id)),
        note: `${c.note}\nProjection: ${entry.modeId} → Working; ${draft.scope}. Other evidence remains in the original project.`,
      }))
    );
    for (const c of model.colors) {
      const id = ns('observation', c.id),
        refs = c.evidenceRefs.map(id => ns('evidence', id));
      claims.push({
        id,
        sourceId: ns('source', c.sourceId),
        text: `${c.label}; ${entry.modeId}: ${canonicalJson(c.valuesByMode[entry.modeId] ?? null)}`,
        status: 'inferred',
        evidenceRefs: refs,
        contextIds: contexts,
        ruleIds: [],
        modeIds: [WORKING],
      });
      memberClaim.set(key(entry.id, c.id), { claimId: id, evidenceRefs: refs });
    }
    families.push(
      ...model.families.map(f => ({
        ...f,
        ...links(f),
        id: ns('family', f.id),
        colorIds: unique(f.colorIds.map(id => representative(entry.id, id).representativeColorId)),
      }))
    );
    for (const s of model.scales) {
      const authored = s.modes.find(m => m.modeId === entry.modeId);
      const members = unique(
        (authored?.anchors ?? []).map(
          a => representative(entry.id, a.colorId).representativeColorId
        )
      );
      const foreignMembership = governedGroups.some(
        group => group.entryId !== entry.id && members.some(id => group.colors.has(id))
      );
      const valid =
        authored &&
        !foreignMembership &&
        authored.anchors.every(a => {
          const source = model.colors.find(c => c.id === a.colorId)!.valuesByMode[entry.modeId];
          const chosen = representative(entry.id, a.colorId).value;
          return source && chosen && paintKey(source) === paintKey(chosen);
        });
      if (valid)
        scales.push({
          ...s,
          ...links(s),
          id: ns('scale', s.id),
          familyId: ns('family', s.familyId),
          slots: s.slots,
          modes: [
            {
              modeId: WORKING,
              anchors: authored.anchors.map(a => ({
                slotId: a.slotId,
                colorId: representative(entry.id, a.colorId).representativeColorId,
              })),
            },
          ],
        });
      else {
        if (
          members.length &&
          selectedRules.some(r =>
            ruleSelectors(r).some(selector => selector.kind === 'scale' && selector.id === s.id)
          )
        )
          families.push({
            id: ns('scale-members', s.id),
            label: `${s.label} source members`,
            colorIds: members,
            ...links(s),
          });
        unavailableScales.push({
          entryId: entry.id,
          scaleId: s.id,
          label: s.label,
          reason: foreignMembership
            ? 'Another source governs an overlapping family or scale. Color matches do not authorize adding members to that group; extension needs a separate group review.'
            : authored
              ? 'A source anchor differs from the working value or has no resolved value. Original anchors remain in the source project.'
              : 'This scale has no anchors in the selected source mode.',
        });
      }
    }
    const selector = (s: ColorSystemSelectorV1): ColorSystemSelectorV1 => {
      const retainedScale =
        s.kind === 'scale' && scales.some(scale => scale.id === ns('scale', s.id));
      return {
        ...s,
        kind: s.kind === 'scale' && !retainedScale ? 'family' : s.kind,
        id:
          s.kind === 'color'
            ? representative(entry.id, s.id).representativeColorId
            : ns(retainedScale ? 'scale' : s.kind === 'scale' ? 'scale-members' : 'family', s.id),
      };
    };
    const selectors = (ss: readonly ColorSystemSelectorV1[]) => ss.map(selector);
    for (const r of selectedRules) {
      let operands;
      switch (r.kind) {
        case 'allowed-pair':
        case 'forbidden-pair':
          operands = {
            ...r.operands,
            left: selectors(r.operands.left),
            right: selectors(r.operands.right),
          };
          break;
        case 'required-partner':
          operands = {
            ...r.operands,
            subject: selectors(r.operands.subject),
            partner: selectors(r.operands.partner),
          };
          break;
        case 'prominence':
          operands =
            r.operands.kind === 'ordered-groups'
              ? { ...r.operands, groups: r.operands.groups.map(selectors) }
              : { ...r.operands, members: selectors(r.operands.members) };
          break;
        default:
          operands = { ...r.operands, members: selectors(r.operands.members) };
      }
      rules.push({
        ...r,
        ...links(r),
        id: ns('rule', r.id),
        contextIds: r.contextIds.filter(id => contexts.includes(id)),
        modeIds: [WORKING],
        operands,
      } as ColorSystemScopedRuleV1);
    }
  }
  sources.push({
    id: REVIEW_SOURCE,
    label: 'Reviewed source-set decisions',
    sourceHash: draftHash,
    version: '1',
    locator: null,
    freshnessMode: 'imported-snapshot',
    status: 'draft',
  });
  const colors = subjects.map(s => {
    const evidenceId = sourceSetEntityId('subjects', 'evidence', s.subject),
      claimId = sourceSetEntityId('subjects', 'claim', s.subject);
    evidence.push({
      id: evidenceId,
      sourceId: REVIEW_SOURCE,
      locator: null,
      status: 'inferred',
      description: `Reviewed subject ${s.subject}. Members: ${s.memberHash}. Value choice: ${canonicalJson(s.chosen)}. ${resolutions.get(s.subject)?.reason ?? 'Equal values; correspondence requires review.'}`,
    });
    claims.push({
      id: claimId,
      sourceId: REVIEW_SOURCE,
      text: s.resolved
        ? `Working value for ${s.subject}; original source observations remain separate.`
        : `Resolve the working value for ${s.subject}.`,
      status: s.resolved ? 'inferred' : 'unresolved',
      evidenceRefs: [evidenceId],
      contextIds: contexts,
      modeIds: [WORKING],
      ruleIds: [],
    });
    if (s.conflicting) {
      const members = s.members.map(m => memberClaim.get(key(m.entryId, m.colorId))!);
      conflicts.push({
        id: sourceSetEntityId('subjects', 'conflict', s.subject),
        message: `Sources disagree about ${s.subject}.`,
        status: s.resolved ? 'resolved' : 'unresolved',
        claimIds: members.map(m => m.claimId),
        evidenceRefs: unique(members.flatMap(m => m.evidenceRefs)),
        contextIds: contexts,
        ruleIds: [],
        colorIds: [s.representativeColorId],
        modeIds: [WORKING],
        ...(s.resolved ? { resolutionClaimId: claimId } : {}),
      });
    }
    return {
      id: s.representativeColorId,
      label: s.subject,
      sourceId: REVIEW_SOURCE,
      valuesByMode: s.value ? { [WORKING]: s.value } : {},
      ...(s.value ? {} : { valueGapClaimIdsByMode: { [WORKING]: [claimId] } }),
      evidenceRefs: [evidenceId],
      claimIds: [claimId],
    };
  });
  coverage.push({
    sourceId: REVIEW_SOURCE,
    status: subjects.every(s => s.resolved) ? 'complete' : 'partial',
    evidenceRefs: evidence.filter(e => e.sourceId === REVIEW_SOURCE).map(e => e.id),
    unresolvedClaimIds: claims
      .filter(c => c.sourceId === REVIEW_SOURCE && c.status === 'unresolved')
      .map(c => c.id),
    note: 'Explicit subject and mode projection; original source authority and source gaps remain unchanged.',
  });
  const model = buildColorSystemModelV1({
    schemaVersion: 'teul.color-system-model.v1',
    sources,
    evidence,
    coverage,
    claims,
    colors,
    families,
    scales,
    rules,
    conflicts,
    modes: [{ id: WORKING, label: 'Working' }],
    contexts: contexts.map(id => ({
      id,
      label: id,
      modeIds: [WORKING],
      evidenceRefs: [],
      claimIds: [],
    })),
    brandConstraintsByContext: [],
    adoptions: [],
  });
  return freeze({ model, draftHash, subjects, unavailableScales, entries });
}
export async function applySourceSetReview(
  draft: SourceSetDraft,
  rawDecision: SourceSetDecision,
  signal?: AbortSignal
): Promise<SourceSetReview> {
  const decision = snapshotColorSystemInertJsonV1(rawDecision);
  record(decision, ['actor', 'reviewedAt']);
  record(decision.actor, ['kind', 'ref']);
  if (decision.actor.kind !== 'user')
    throw new Error('A source set needs an explicit designer review.');
  text(decision.actor.ref, 'Reviewer', 128);
  if (
    typeof decision.reviewedAt !== 'string' ||
    !Number.isFinite(Date.parse(decision.reviewedAt)) ||
    new Date(decision.reviewedAt).toISOString() !== decision.reviewedAt
  )
    throw new Error('The review needs a canonical timestamp.');
  if (draft.entries.length < 2) throw new Error('Add at least two reviewed sources.');
  const inspected = await inspectSourceSet(draft, signal);
  const { modelHash: _hash, ...input } = inspected.model;
  const actor = decision.actor as SourceSetDecision['actor'];
  const adoptions = buildColorSystemRuleAdoptionsV1(
    input,
    input.rules.map(r => ({
      ruleId: r.id,
      status: 'accepted',
      actor,
      authorityRef: `source-set:${inspected.draftHash}`,
      decisionRef: inspected.draftHash,
    }))
  );
  const content = {
    model: buildColorSystemModelV1({ ...input, adoptions }),
    decision: { actor, reviewedAt: decision.reviewedAt, draftHash: inspected.draftHash },
  };
  return freeze({ ...content, reviewHash: guidelineHash(content) });
}
