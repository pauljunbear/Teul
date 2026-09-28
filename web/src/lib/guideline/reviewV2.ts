import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  COLOR_SYSTEM_MODEL_V1_LIMITS as LIMITS,
  type ColorSystemModelInputV1,
  type ColorSystemScopedRuleV1,
  type ColorSystemSelectorV1,
} from '../../../../src/lib/colorSystemModelV1';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { parseCapture, type GuidelineCapture } from './evidence';
import { type GuidelineCaptureAny } from './evidenceV2';
import { compileSourceRuleDefinition } from './structureRules';
import {
  compileGuidelineInventoryModel,
  CONTEXTS,
  guidelineHash,
  parseGuidelineDraftFromInventory,
  suggestGuidelineReview,
  type GuidelineReviewDraft,
  type ReviewedGuideline,
  type ReviewRule,
} from './review';
import {
  createGuidelineSourceInventory,
  assertGuidelineSourceInventory,
  inventoryEvidence,
  type GuidelineSourceInventory,
} from './sourceInventory';

export const REVIEW_V2_VERSION = 'teul.guideline-review.v2' as const;
/** IDs refer to captured observations, authored family labels and declared scale IDs. */
export interface SourceSelectorV2 {
  kind: 'color' | 'family' | 'scale';
  id: string;
}
type PositiveForce = 'requirement' | 'preference' | 'example';
export type SourceRuleDefinition =
  | {
      kind: 'required-partner';
      force: PositiveForce;
      operands: { subject: SourceSelectorV2[]; partner: SourceSelectorV2[] };
    }
  | {
      kind: 'forbidden-pair';
      force: 'prohibition' | 'preference' | 'example';
      operands: {
        left: SourceSelectorV2[];
        right: SourceSelectorV2[];
        ordered: boolean;
        relation: 'co-present' | 'foreground-background';
      };
    }
  | {
      kind: 'prominence';
      force: PositiveForce;
      operands: { kind: 'ordered-groups'; groups: SourceSelectorV2[][] };
    }
  | {
      kind: 'role-binding';
      force: PositiveForce | 'prohibition' | 'permission';
      operands: { role: string; members: SourceSelectorV2[]; presence: 'required' | 'if-present' };
    };
export interface ReviewRuleV2 extends Omit<ReviewRule, 'meaning'> {
  meaning: ReviewRule['meaning'] | 'relationship';
  definition: SourceRuleDefinition | null;
}
export interface SourceScaleV2 {
  id: string;
  label: string;
  family: string;
  slots: { id: string; position: number; observationId: string | null }[];
  evidenceRefs: string[];
}
export interface GuidelineReviewDraftV2 extends Omit<GuidelineReviewDraft, 'rules'> {
  rules: ReviewRuleV2[];
  scales: SourceScaleV2[];
}
export interface ReviewedGuidelineV2 extends Omit<ReviewedGuideline, 'schemaVersion' | 'decision'> {
  schemaVersion: typeof REVIEW_V2_VERSION;
  decision: Omit<ReviewedGuideline['decision'], 'draft'> & { draft: GuidelineReviewDraftV2 };
}

function fields(value: unknown, expected: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...expected].sort().join(',')
  )
    throw new Error('Source structure contains missing or unsupported fields.');
}
function shortText(value: unknown, maximum = 160): asserts value is string {
  if (typeof value !== 'string' || value.length > maximum)
    throw new Error('Source structure contains invalid text.');
}
function selectors(value: unknown): void {
  if (!Array.isArray(value) || value.length > LIMITS.maximumRefs)
    throw new Error('A relationship contains too many selectors.');
  for (const item of value) {
    fields(item, ['kind', 'id']);
    if (!['color', 'family', 'scale'].includes(item.kind as string))
      throw new Error('Unsupported source selector.');
    shortText(item.id);
  }
}
/** Validates a closed relationship shape; source-bound selector resolution occurs at compilation. */
export function assertSourceRuleDefinition(value: unknown): asserts value is SourceRuleDefinition {
  fields(value, ['kind', 'force', 'operands']);
  const positive = ['requirement', 'preference', 'example'];
  switch (value.kind) {
    case 'required-partner':
      if (!positive.includes(value.force as string))
        throw new Error('Unsupported relationship force.');
      fields(value.operands, ['subject', 'partner']);
      selectors(value.operands.subject);
      selectors(value.operands.partner);
      return;
    case 'forbidden-pair':
      if (!['prohibition', 'preference', 'example'].includes(value.force as string))
        throw new Error('Unsupported relationship force.');
      fields(value.operands, ['left', 'right', 'ordered', 'relation']);
      selectors(value.operands.left);
      selectors(value.operands.right);
      if (
        typeof value.operands.ordered !== 'boolean' ||
        !['co-present', 'foreground-background'].includes(value.operands.relation as string)
      )
        throw new Error('Unsupported pair relationship.');
      return;
    case 'prominence':
      if (!positive.includes(value.force as string))
        throw new Error('Unsupported relationship force.');
      fields(value.operands, ['kind', 'groups']);
      if (
        value.operands.kind !== 'ordered-groups' ||
        !Array.isArray(value.operands.groups) ||
        value.operands.groups.length > LIMITS.maximumRefs
      )
        throw new Error('Unsupported prominence relationship.');
      value.operands.groups.forEach(selectors);
      return;
    case 'role-binding':
      if (![...positive, 'prohibition', 'permission'].includes(value.force as string))
        throw new Error('Unsupported relationship force.');
      fields(value.operands, ['role', 'members', 'presence']);
      shortText(value.operands.role, LIMITS.maximumId);
      selectors(value.operands.members);
      if (!['required', 'if-present'].includes(value.operands.presence as string))
        throw new Error('Unsupported role presence.');
      return;
    default:
      throw new Error('Unsupported source relationship.');
  }
}

/** Explicit draft conversion; does not alter or pretend to preserve an applied V1 review. */
export function upgradeGuidelineDraftV2(draft: GuidelineReviewDraft): GuidelineReviewDraftV2 {
  const copy = snapshotColorSystemInertJsonV1(draft) as GuidelineReviewDraft;
  return { ...copy, rules: copy.rules.map(rule => ({ ...rule, definition: null })), scales: [] };
}
export function suggestGuidelineReviewV2(capture: GuidelineCapture): GuidelineReviewDraftV2 {
  return upgradeGuidelineDraftV2(suggestGuidelineReview(capture));
}
function baseDraft(draft: GuidelineReviewDraftV2): GuidelineReviewDraft {
  return {
    captureHash: draft.captureHash,
    colors: draft.colors,
    // A relationship remains unresolved until V2 has validated and compiled its operands.
    rules: draft.rules.map(({ definition: _definition, ...rule }) => ({
      ...rule,
      meaning: rule.meaning === 'relationship' ? 'needs-interpretation' : rule.meaning,
    })),
  };
}

/** Safe unfinished rows may be saved; applying a review resolves all authored references. */
export function parseGuidelineDraftV2(
  rawCapture: GuidelineCapture,
  rawDraft: unknown
): GuidelineReviewDraftV2 {
  return parseGuidelineStructureDraft(parseCapture(rawCapture), rawDraft);
}

/** Structure validation shared by old and native-value capture formats. */
export function parseGuidelineStructureDraft(
  rawCapture: GuidelineCaptureAny,
  rawDraft: unknown
): GuidelineReviewDraftV2 {
  return parseGuidelineStructureDraftFromInventory(
    createGuidelineSourceInventory(rawCapture),
    rawDraft
  );
}

export function parseGuidelineStructureDraftFromInventory(
  inventory: GuidelineSourceInventory,
  rawDraft: unknown
): GuidelineReviewDraftV2 {
  assertGuidelineSourceInventory(inventory);
  const draft = snapshotColorSystemInertJsonV1(rawDraft) as GuidelineReviewDraftV2;
  fields(draft, ['captureHash', 'colors', 'rules', 'scales']);
  if (
    !Array.isArray(draft.rules) ||
    draft.rules.length > LIMITS.maximumRules ||
    !Array.isArray(draft.scales) ||
    draft.scales.length > LIMITS.maximumScales
  )
    throw new Error('Select at most 128 source rules and 128 scales.');
  for (const rule of draft.rules) {
    fields(rule, ['observationId', 'meaning', 'scope', 'reason', 'definition']);
    if (rule.meaning === 'relationship') {
      if (rule.definition !== null) assertSourceRuleDefinition(rule.definition);
    } else if (rule.definition !== null)
      throw new Error('Only a relationship may contain a rule definition.');
  }
  parseGuidelineDraftFromInventory(inventory, baseDraft(draft));
  const observations = new Map(inventory.entries.map(item => [item.id, item]));
  const scaleIds = new Set<string>();
  for (const scale of draft.scales) {
    fields(scale, ['id', 'label', 'family', 'slots', 'evidenceRefs']);
    shortText(scale.id, LIMITS.maximumId);
    if (!scale.id.trim() || scaleIds.has(scale.id))
      throw new Error(
        'Source scale identities must be nonblank and unique, including in unfinished drafts.'
      );
    scaleIds.add(scale.id);
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(scale.id) ||
      scale.id === 'prototype' ||
      Object.prototype.hasOwnProperty.call(Object.prototype, scale.id)
    )
      throw new Error('Source scales require an inert stable identifier.');
    shortText(scale.label);
    shortText(scale.family);
    if (
      !Array.isArray(scale.slots) ||
      scale.slots.length > LIMITS.maximumSlots ||
      !Array.isArray(scale.evidenceRefs) ||
      scale.evidenceRefs.length > LIMITS.maximumRefs
    )
      throw new Error('A source scale exceeds its slot or evidence limit.');
    for (const slot of scale.slots) {
      fields(slot, ['id', 'position', 'observationId']);
      shortText(slot.id, LIMITS.maximumId);
      if (
        typeof slot.position !== 'number' ||
        !Number.isFinite(slot.position) ||
        slot.position < 0 ||
        slot.position > Number.MAX_SAFE_INTEGER ||
        (slot.observationId !== null && observations.get(slot.observationId)?.kind !== 'color')
      )
        throw new Error('Invalid source scale position or color observation.');
    }
    if (
      scale.evidenceRefs.some(ref => typeof ref !== 'string' || !observations.has(ref)) ||
      new Set(scale.evidenceRefs).size !== scale.evidenceRefs.length
    )
      throw new Error('A source scale references missing or duplicated evidence.');
  }
  return draft;
}

const stableId = (kind: string, value: string) => `${kind}:${guidelineHash(value).slice(7)}`;
export const guidelineColorIdV2 = (observationId: string) => stableId('color', observationId);

/** Source structure remains inferred, even when an explicitly named reviewer adopts its rules. */
export function compileGuidelineReviewV2(
  rawCapture: GuidelineCapture,
  rawDraft: GuidelineReviewDraftV2,
  actor: ReviewedGuideline['decision']['actor'],
  reviewedAt = new Date().toISOString()
): ReviewedGuidelineV2 {
  const capture = parseCapture(rawCapture);
  const draft = parseGuidelineDraftV2(capture, rawDraft);
  const model = compileGuidelineStructureModel(capture, draft, actor, reviewedAt);
  const content = {
    schemaVersion: REVIEW_V2_VERSION,
    captureHash: capture.captureHash,
    model,
    decision: { actor: { ...actor }, reviewedAt, draft },
  };
  return { ...content, reviewHash: guidelineHash(content) };
}

/** One model compiler retains all relationships and exact source values across capture versions. */
export function compileGuidelineStructureModel(
  rawCapture: GuidelineCaptureAny,
  rawDraft: GuidelineReviewDraftV2,
  actor: ReviewedGuideline['decision']['actor'],
  reviewedAt: string
) {
  return compileGuidelineStructureInventoryModel(
    createGuidelineSourceInventory(rawCapture),
    rawDraft,
    actor,
    reviewedAt
  );
}

export function compileGuidelineStructureInventoryModel(
  inventory: GuidelineSourceInventory,
  rawDraft: GuidelineReviewDraftV2,
  actor: ReviewedGuideline['decision']['actor'],
  reviewedAt: string,
  decisionRef?: string
) {
  assertGuidelineSourceInventory(inventory);
  const capture = inventory.capture;
  const draft = parseGuidelineStructureDraftFromInventory(inventory, rawDraft);
  const baseModel = compileGuidelineInventoryModel(inventory, baseDraft(draft), actor, reviewedAt);
  const observations = new Map(inventory.entries.map(item => [item.id, item]));
  const selected = new Set(
    draft.colors.filter(item => item.include).map(item => item.observationId)
  );
  const colorIdMap = new Map(
    baseModel.colors.map(color => [color.id, guidelineColorIdV2(color.evidenceRefs[0])])
  );
  const familyIds = new Map(
    baseModel.families.map(family => [family.label, stableId('family', family.label)])
  );
  const scaleIds = new Set(draft.scales.map(scale => scale.id));
  const resolve = (selector: SourceSelectorV2): ColorSystemSelectorV1 => {
    if (selector.kind === 'color' && selected.has(selector.id))
      return { kind: 'color', id: guidelineColorIdV2(selector.id) };
    if (selector.kind === 'family' && familyIds.has(selector.id))
      return { kind: 'family', id: familyIds.get(selector.id)! };
    if (selector.kind === 'scale' && scaleIds.has(selector.id) && selector.id.trim())
      return { kind: 'scale', id: selector.id };
    throw new Error(
      `A source relationship refers to a missing or excluded ${selector.kind}: ${selector.id || '(unfinished)'}.`
    );
  };
  const rules = draft.rules.flatMap<ColorSystemScopedRuleV1>(rule => {
    const common = {
      id: stableId('rule', rule.observationId),
      label: (observations.get(rule.observationId) as { text: string }).text.slice(
        0,
        LIMITS.maximumText
      ),
      contextIds: rule.scope === 'all' ? [...CONTEXTS] : [rule.scope, `gradient:${rule.scope}`],
      modeIds: ['Source'],
      origin: 'inferred' as const,
      evidenceRefs: [rule.observationId],
      claimIds: [stableId('claim', rule.observationId)],
    };
    if (rule.meaning === 'closed-palette')
      return [
        {
          ...common,
          kind: 'palette-membership',
          force: 'requirement',
          operands: {
            members: [...selected].map(id => ({
              kind: 'color' as const,
              id: guidelineColorIdV2(id),
            })),
          },
        },
      ];
    if (rule.meaning !== 'relationship') return [];
    if (!rule.definition)
      throw new Error('Complete each source relationship before applying the review.');
    return [compileSourceRuleDefinition(common, rule.definition, resolve)];
  });
  const refs = new Set(baseModel.evidence.map(item => item.id));
  for (const scale of draft.scales) {
    if (!scale.label.trim() || !scale.family.trim() || !scale.evidenceRefs.length)
      throw new Error(
        'Name each source scale, choose its family, and retain its source evidence before applying.'
      );
    scale.evidenceRefs.forEach(ref => refs.add(ref));
    scale.slots.forEach(slot => {
      if (slot.observationId === null) return;
      if (!selected.has(slot.observationId))
        throw new Error('A source scale anchor refers to an excluded source color.');
      refs.add(slot.observationId);
    });
  }
  // Every included color observation retains the exact text from which its value was captured.
  [...refs].forEach(ref => {
    const observation = observations.get(ref)!;
    if (observation.kind === 'color') observation.evidenceRefs.forEach(id => refs.add(id));
  });
  const claimIdMap = new Map(
    draft.rules.map((rule, index) => [`claim:${index + 1}`, stableId('claim', rule.observationId)])
  );
  const relationshipClaims = new Set(
    draft.rules
      .filter(rule => rule.meaning === 'relationship')
      .map(rule => stableId('claim', rule.observationId))
  );
  const { modelHash: _modelHash, ...baseInput } = baseModel;
  const input: ColorSystemModelInputV1 = {
    ...baseInput,
    colors: baseModel.colors.map(color => ({ ...color, id: colorIdMap.get(color.id)! })),
    families: baseModel.families.map(family => ({
      ...family,
      id: familyIds.get(family.label)!,
      colorIds: family.colorIds.map(id => colorIdMap.get(id)!),
    })),
    evidence: inventoryEvidence(inventory, refs),
    claims: baseModel.claims.map(claim => {
      const id = claimIdMap.get(claim.id);
      if (!id) return claim;
      return {
        ...claim,
        id,
        status: relationshipClaims.has(id) ? 'inferred' : claim.status,
        ruleIds: rules.filter(rule => rule.claimIds.includes(id)).map(rule => rule.id),
      };
    }),
    coverage: baseModel.coverage.map(item => ({
      ...item,
      evidenceRefs: [...refs],
      unresolvedClaimIds: item.unresolvedClaimIds
        .map(id => claimIdMap.get(id)!)
        .filter(id => !relationshipClaims.has(id)),
    })),
    scales: draft.scales.map(scale => {
      const familyId = familyIds.get(scale.family.trim());
      if (!familyId) throw new Error('A source scale refers to a missing family.');
      return {
        id: scale.id,
        label: scale.label.trim(),
        familyId,
        slots: scale.slots.map(({ id, position }) => ({ id, position })),
        modes: [
          {
            modeId: 'Source',
            anchors: scale.slots.flatMap(slot =>
              slot.observationId === null
                ? []
                : [{ slotId: slot.id, colorId: guidelineColorIdV2(slot.observationId) }]
            ),
          },
        ],
        evidenceRefs: scale.evidenceRefs,
        claimIds: [],
      };
    }),
    rules,
    adoptions: [],
  };
  const sourceDecisionRef = decisionRef ?? guidelineHash(draft);
  const adoptions = buildColorSystemRuleAdoptionsV1(
    input,
    rules.map(rule => ({
      ruleId: rule.id,
      status: 'accepted',
      actor,
      authorityRef: `review:${capture.captureHash}`,
      decisionRef: sourceDecisionRef,
    }))
  );
  return buildColorSystemModelV1({ ...input, adoptions });
}
