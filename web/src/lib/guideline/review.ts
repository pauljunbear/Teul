import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
  COLOR_SYSTEM_MODEL_V1_LIMITS,
  type ColorSystemModelV1,
  type ColorSystemModelInputV1,
  type ColorSystemScopedRuleV1,
  type ColorSystemClaimV1,
} from '../../../../src/lib/colorSystemModelV1';
import { canonicalJson, deterministicContentHash } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { parseCapture, type GuidelineCapture } from './evidence';
import { type GuidelineCaptureAny } from './evidenceV2';
import {
  createGuidelineSourceInventory,
  assertGuidelineSourceInventory,
  inventoryEvidence,
  type GuidelineSourceInventory,
  type GuidelineSourceColor,
} from './sourceInventory';

export const REVIEW_VERSION = 'teul.guideline-review.v1' as const;
export type RuleMeaning = 'needs-interpretation' | 'closed-palette' | 'no-gradients' | 'not-a-rule';
export type ReviewScope = 'all' | 'brand' | 'product';
export interface ReviewColor {
  observationId: string;
  include: boolean;
  label: string;
  family: string;
}
export interface ReviewRule {
  observationId: string;
  meaning: RuleMeaning;
  scope: ReviewScope;
  reason: string;
}
export interface GuidelineReviewDraft {
  captureHash: string;
  colors: ReviewColor[];
  rules: ReviewRule[];
}
export interface ReviewedGuideline {
  schemaVersion: typeof REVIEW_VERSION;
  captureHash: string;
  model: ColorSystemModelV1;
  /** Retain the interpretation and its human/agent decision; it never changes source authority. */
  decision: {
    actor: { kind: 'user' | 'agent'; ref: string };
    reviewedAt: string;
    draft: GuidelineReviewDraft;
  };
  reviewHash: string;
}
export const guidelineHash = (value: unknown) => deterministicContentHash(canonicalJson(value));
export const CONTEXTS = ['brand', 'product', 'gradient:brand', 'gradient:product'] as const;

/** Lexical review prompts, not an automatic interpretation of guideline rules. */
export function suggestGuidelineReview(raw: GuidelineCapture): GuidelineReviewDraft {
  return suggestGuidelineReviewFromCapture(parseCapture(raw));
}

/** Common review prompts after the versioned source boundary has been validated. */
export function suggestGuidelineReviewFromCapture(raw: GuidelineCaptureAny): GuidelineReviewDraft {
  return suggestGuidelineReviewFromInventory(createGuidelineSourceInventory(raw));
}

export function suggestGuidelineReviewFromInventory(
  inventory: GuidelineSourceInventory
): GuidelineReviewDraft {
  assertGuidelineSourceInventory(inventory);
  const capture = inventory.capture;
  const draft: GuidelineReviewDraft = {
    captureHash: capture.captureHash,
    colors: inventory.entries
      .filter((item): item is GuidelineSourceColor => item.kind === 'color')
      .map((item, i) => ({
        observationId: item.id,
        include: item.available,
        label: `Color ${i + 1}`,
        family: '',
      })),
    rules: capture.observations
      .filter(
        item =>
          item.kind === 'text' &&
          /\b(do not|don['’]t|never|must|only|prohibit|forbid|avoid|gradient|may be|supporting colors)\b/i.test(
            item.text
          )
      )
      .map(item => ({
        observationId: item.id,
        meaning: 'needs-interpretation',
        scope: 'all',
        reason: '',
      })),
  };
  if (
    draft.colors.length > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumColors ||
    draft.rules.length > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumRules
  )
    throw new Error(
      'This section has more than 256 stated colors or 128 possible rules. Select fewer pages for a review.'
    );
  return draft;
}

/** Structural validation permits unfinished names/decisions so drafts can be recovered. */
export function parseGuidelineDraft(
  raw: GuidelineCapture,
  rawDraft: unknown
): GuidelineReviewDraft {
  return parseGuidelineDraftFromCapture(parseCapture(raw), rawDraft);
}

export function parseGuidelineDraftFromCapture(
  raw: GuidelineCaptureAny,
  rawDraft: unknown
): GuidelineReviewDraft {
  return parseGuidelineDraftFromInventory(createGuidelineSourceInventory(raw), rawDraft);
}

export function parseGuidelineDraftFromInventory(
  inventory: GuidelineSourceInventory,
  rawDraft: unknown
): GuidelineReviewDraft {
  assertGuidelineSourceInventory(inventory);
  const capture = inventory.capture;
  const draft = snapshotColorSystemInertJsonV1(rawDraft) as GuidelineReviewDraft;
  if (!draft || Object.keys(draft).sort().join(',') !== 'captureHash,colors,rules')
    throw new Error('Review contains missing or unsupported fields.');
  if (draft.captureHash !== capture.captureHash)
    throw new Error('The source changed. Review this revision before generating.');
  const observations = new Map(inventory.entries.map(item => [item.id, item]));
  if (
    !Array.isArray(draft.colors) ||
    !Array.isArray(draft.rules) ||
    draft.colors.length > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumColors ||
    draft.rules.length > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumRules
  )
    throw new Error('Select at most 256 colors and 128 rules for one system.');
  const colorIds = new Set<string>();
  for (const color of draft.colors) {
    if (
      !color ||
      Object.keys(color).sort().join(',') !== 'family,include,label,observationId' ||
      observations.get(color.observationId)?.kind !== 'color' ||
      colorIds.has(color.observationId) ||
      typeof color.include !== 'boolean' ||
      (color.include &&
        !(observations.get(color.observationId) as GuidelineSourceColor)?.available) ||
      typeof color.label !== 'string' ||
      color.label.length > 160 ||
      typeof color.family !== 'string' ||
      color.family.length > 160
    )
      throw new Error('Invalid reviewed color or label.');
    colorIds.add(color.observationId);
  }
  const ruleIds = new Set<string>();
  for (const rule of draft.rules) {
    if (
      !rule ||
      Object.keys(rule).sort().join(',') !== 'meaning,observationId,reason,scope' ||
      observations.get(rule.observationId)?.kind !== 'text' ||
      ruleIds.has(rule.observationId) ||
      !['needs-interpretation', 'closed-palette', 'no-gradients', 'not-a-rule'].includes(
        rule.meaning
      ) ||
      !['all', 'brand', 'product'].includes(rule.scope) ||
      typeof rule.reason !== 'string' ||
      rule.reason.length > 4096
    )
      throw new Error('Review each rule and explain any excluded statement.');
    ruleIds.add(rule.observationId);
  }
  // No model or caller can silently omit a prompted restriction from the review packet.
  if (
    suggestGuidelineReviewFromCapture(capture).rules.some(rule => !ruleIds.has(rule.observationId))
  )
    throw new Error('A possible source rule is missing from this review.');
  if (inventory.requiredColorIds.some(id => !colorIds.has(id)))
    throw new Error('A source color is missing. Retain it with Include turned off to exclude it.');
  return draft;
}

/** One explicit review compiles selected evidence into the existing model, retaining unknown meaning. */
export function compileGuidelineReview(
  raw: GuidelineCapture,
  rawDraft: GuidelineReviewDraft,
  actor: { kind: 'user' | 'agent'; ref: string },
  reviewedAt = new Date().toISOString()
): ReviewedGuideline {
  const capture = parseCapture(raw);
  const draft = parseGuidelineDraft(capture, rawDraft);
  const model = compileGuidelineModel(capture, draft, actor, reviewedAt);
  const content = {
    schemaVersion: REVIEW_VERSION,
    captureHash: capture.captureHash,
    model,
    decision: { actor: { ...actor }, reviewedAt, draft },
  };
  return { ...content, reviewHash: guidelineHash(content) };
}

/** Shared model assembly. Versioned review codecs own their envelope and replay contract. */
export function compileGuidelineModel(
  raw: GuidelineCaptureAny,
  rawDraft: GuidelineReviewDraft,
  actor: ReviewedGuideline['decision']['actor'],
  reviewedAt: string
): ColorSystemModelV1 {
  return compileGuidelineInventoryModel(
    createGuidelineSourceInventory(raw),
    rawDraft,
    actor,
    reviewedAt
  );
}

export function compileGuidelineInventoryModel(
  inventory: GuidelineSourceInventory,
  rawDraft: GuidelineReviewDraft,
  actor: ReviewedGuideline['decision']['actor'],
  reviewedAt: string
): ColorSystemModelV1 {
  assertGuidelineSourceInventory(inventory);
  const capture = inventory.capture;
  const draft = parseGuidelineDraftFromInventory(inventory, rawDraft);
  if (
    !['user', 'agent'].includes(actor.kind) ||
    typeof actor.ref !== 'string' ||
    !actor.ref ||
    actor.ref.length > 128 ||
    typeof reviewedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(reviewedAt) ||
    !Number.isFinite(Date.parse(reviewedAt))
  )
    throw new Error('Review requires an explicit actor and date.');
  if (draft.colors.some(color => !color.label.trim()))
    throw new Error('Name each source color before applying the review.');
  if (draft.rules.some(rule => rule.meaning === 'not-a-rule' && !rule.reason.trim()))
    throw new Error('Review each rule and explain any excluded statement.');
  const observations = new Map(inventory.entries.map(item => [item.id, item]));
  const selected = draft.colors.filter(color => color.include);
  if (!selected.length) throw new Error('Include at least one stated source color.');
  const refs = new Set([
    ...selected.map(color => color.observationId),
    ...draft.rules.map(rule => rule.observationId),
  ]);
  selected.forEach(color =>
    (observations.get(color.observationId) as GuidelineSourceColor).evidenceRefs.forEach(ref =>
      refs.add(ref)
    )
  );
  if (refs.size > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumEvidence)
    throw new Error('Selected evidence exceeds the model limit. Narrow this source review.');
  const sourceId = `source:${capture.identity.sha256.slice(7)}`;
  const scopes = (rule: ReviewRule) =>
    rule.scope === 'all' ? [...CONTEXTS] : [rule.scope, `gradient:${rule.scope}`];
  const colors = selected.map((selection, i) => {
    const observation = observations.get(selection.observationId) as GuidelineSourceColor;
    return {
      id: `color:${i + 1}`,
      label: selection.label.trim(),
      sourceId,
      valuesByMode: {
        Source: observation.value,
      },
      evidenceRefs: [observation.id],
      claimIds: observation.claim ? [observation.claim.id] : [],
    };
  });
  const rules: ColorSystemScopedRuleV1[] = draft.rules.flatMap((rule, i) =>
    rule.meaning === 'closed-palette'
      ? [
          {
            id: `rule:${i + 1}`,
            label: 'Use only the reviewed source palette',
            kind: 'palette-membership',
            force: 'requirement',
            contextIds: scopes(rule),
            modeIds: ['Source'],
            origin: 'inferred',
            evidenceRefs: [rule.observationId],
            claimIds: [`claim:${i + 1}`],
            operands: { members: colors.map(color => ({ kind: 'color', id: color.id })) },
          } as ColorSystemScopedRuleV1,
        ]
      : []
  );
  const input: ColorSystemModelInputV1 = {
    schemaVersion: COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
    sources: [
      {
        id: sourceId,
        label: capture.identity.label,
        sourceHash: capture.identity.sha256,
        version: capture.identity.revision,
        locator: capture.identity.locator,
        freshnessMode: 'imported-snapshot',
        status: 'draft',
      },
    ],
    evidence: inventoryEvidence(inventory, refs),
    coverage: [
      {
        sourceId,
        status: 'partial',
        evidenceRefs: [...refs],
        unresolvedClaimIds: draft.rules.flatMap((r, i) =>
          r.meaning === 'needs-interpretation' || r.meaning === 'no-gradients'
            ? [`claim:${i + 1}`]
            : []
        ),
        note: `Reviewed selected colors and statements from ${capture.scope.inspected.length}/${capture.scope.total} source sections. Other text and visual rules may be unreviewed. ${capture.scope.gaps.map(gap => gap.message).join(' ')}`.slice(
          0,
          4096
        ),
      },
    ],
    claims: [
      ...draft.rules.map<ColorSystemClaimV1>((rule, i) => ({
        id: `claim:${i + 1}`,
        sourceId,
        text: (observations.get(rule.observationId) as { text: string }).text.slice(0, 4096),
        status:
          rule.meaning === 'needs-interpretation' || rule.meaning === 'no-gradients'
            ? 'unsupported'
            : 'inferred',
        evidenceRefs: [rule.observationId],
        contextIds:
          rule.meaning === 'not-a-rule'
            ? []
            : scopes(rule).filter(
                context => rule.meaning !== 'no-gradients' || context.startsWith('gradient:')
              ),
        ruleIds: rule.meaning === 'closed-palette' ? [`rule:${i + 1}`] : [],
        modeIds: ['Source'],
      })),
      ...selected.flatMap(color => {
        const item = observations.get(color.observationId) as GuidelineSourceColor;
        return item.claim ? [item.claim] : [];
      }),
    ],
    modes: [{ id: 'Source', label: 'Source values (no display mode stated)' }],
    colors,
    families: [...new Set(selected.map(color => color.family.trim()).filter(Boolean))].map(
      (family, i) => ({
        id: `family:${i + 1}`,
        label: family,
        colorIds: selected.flatMap((color, index) =>
          color.family.trim() === family ? [colors[index].id] : []
        ),
        evidenceRefs: selected
          .filter(color => color.family.trim() === family)
          .map(color => color.observationId),
        claimIds: [],
      })
    ),
    scales: [],
    contexts: CONTEXTS.map(id => ({
      id,
      label: id,
      modeIds: ['Source'],
      evidenceRefs: [],
      claimIds: [],
    })),
    brandConstraintsByContext: [],
    rules,
    adoptions: [],
    conflicts: [],
  };
  const adoptions = buildColorSystemRuleAdoptionsV1(
    input,
    rules.map(rule => ({
      ruleId: rule.id,
      status: 'accepted',
      actor,
      authorityRef: `review:${capture.captureHash}`,
      decisionRef: guidelineHash(draft),
    }))
  );
  return buildColorSystemModelV1({ ...input, adoptions });
}

/** Both unsupported meaning and closed-palette rules are checked before any new paint is generated. */
export function guidelineOperationIssues(
  review: Pick<ReviewedGuideline, 'model'>,
  operation: 'extend' | 'supporting' | 'gradient',
  scope: 'brand' | 'product',
  modeId?: string
): string[] {
  const context = operation === 'gradient' ? `gradient:${scope}` : scope;
  const appliesToMode = (modes?: readonly string[]) =>
    modeId === undefined || !modes?.length || modes.includes(modeId);
  const issues = review.model.claims
    .filter(
      claim =>
        claim.contextIds.includes(context) &&
        appliesToMode(claim.modeIds) &&
        (claim.status === 'unsupported' || claim.status === 'unresolved')
    )
    .map(claim => `Review required: ${claim.text}`);
  for (const rule of review.model.rules) {
    if (!appliesToMode(rule.modeIds)) continue;
    if (
      rule.kind === 'palette-membership' &&
      rule.force === 'requirement' &&
      rule.contextIds.includes(context)
    )
      issues.push(
        'This guideline restricts use to the existing palette. New colors or gradient interiors need a separate scoped exception.'
      );
    else if (
      operation === 'gradient' &&
      rule.contextIds.includes(context) &&
      !['example', 'permission'].includes(rule.force) &&
      review.model.adoptions.find(adoption => adoption.ruleId === rule.id)?.status !== 'rejected'
    )
      issues.push(
        `This gradient preview cannot yet assess the source relationship: ${rule.label}. Use a scope without that rule or wait for application assessment.`
      );
  }
  return issues;
}
