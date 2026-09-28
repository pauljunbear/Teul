import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { record, boundedText } from '../../../../services/guideline-intake/src/protocol';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  COLOR_SYSTEM_MODEL_V1_LIMITS as LIMITS,
  type ColorSystemModelV1,
  type ColorSystemModelInputV1,
  type ColorSystemClaimV1,
  type ColorSystemEvidenceV1,
  type ColorSystemScopedRuleV1,
  type ColorSystemSelectorV1,
} from '../../../../src/lib/colorSystemModelV1';
import { CONTEXTS, guidelineHash, type ReviewScope } from './review';
import { assertSourceRuleDefinition } from './reviewV2';
import { compileSourceRuleDefinition } from './structureRules';
import type {
  SourceProfileDecision,
  SourceReviewDraft,
  SourceReviewedSource,
  SourceReviewStatement,
  SourceStatement,
} from './sourceReviewContracts';

interface SourceReviewInventory {
  packet: { contentHash: string };
  declarations: readonly { id: string }[];
  modes: readonly { id: string }[];
}
export interface SourceReviewAdapter<
  I extends SourceReviewInventory,
  D extends string,
  R extends string,
> {
  draftVersion: D;
  reviewVersion: R;
  assertInventory: (inventory: I) => void;
  statements: (inventory: I) => SourceStatement[];
  parseProfileDecision: (captureHash: string, raw: unknown) => SourceProfileDecision | null;
  buildModel: (
    inventory: I,
    selection: {
      captureHash: string;
      declarationIds: readonly string[];
      modeIds: readonly string[];
      profileDecision: SourceProfileDecision | null;
    }
  ) => ColorSystemModelV1;
  id: (kind: string, identity: unknown) => string;
  pendingClaimKey: string;
  scaleModeDescription: string;
}

/** Shared interpretation/structure rules; adapters retain their source and numeric authority. */
export function createSourceReviewCompiler<
  I extends SourceReviewInventory,
  D extends string,
  R extends string,
>(adapter: SourceReviewAdapter<I, D, R>) {
  function suggest(inventory: I): SourceReviewDraft<D> {
    return {
      schemaVersion: adapter.draftVersion,
      captureHash: inventory.packet.contentHash,
      modeIds: [],
      colors: [],
      profileDecision: null,
      scales: [],
      statements: adapter.statements(inventory).map(item => ({
        observationId: item.id,
        meaning: 'needs-interpretation',
        scope: 'all',
        modeIds: [],
        reason: '',
        definition: null,
      })),
      scopeDecision: { accepted: false, reason: '' },
    };
  }
  function text(value: unknown, maximum: number): asserts value is string {
    if (typeof value !== 'string' || value.length > maximum)
      throw new Error('Review text exceeds its supported length.');
  }
  function list(value: unknown, maximum: number): asserts value is unknown[] {
    if (!Array.isArray(value) || value.length > maximum)
      throw new Error('The review exceeds a supported collection limit.');
  }
  function ids(
    value: unknown,
    known: ReadonlySet<string>,
    maximum: number
  ): asserts value is string[] {
    list(value, maximum);
    if (
      value.some(id => typeof id !== 'string' || !known.has(id)) ||
      new Set(value).size !== value.length
    )
      throw new Error('Review references missing or duplicated source evidence.');
  }
  /** Permits unfinished UI choices; application below validates all resolved relationships. */
  function parse(inventory: I, raw: unknown): SourceReviewDraft<D> {
    adapter.assertInventory(inventory);
    const draft = snapshotColorSystemInertJsonV1(raw);
    record(draft, [
      'schemaVersion',
      'captureHash',
      'modeIds',
      'colors',
      'profileDecision',
      'statements',
      'scales',
      'scopeDecision',
    ]);
    if (
      draft.schemaVersion !== adapter.draftVersion ||
      draft.captureHash !== inventory.packet.contentHash
    )
      throw new Error('The review belongs to a different source capture or version.');
    const declarations = new Set(inventory.declarations.map(item => item.id));
    const allModes = new Set(inventory.modes.map(item => item.id));
    ids(draft.modeIds, allModes, LIMITS.maximumModes);
    list(draft.colors, LIMITS.maximumColors);
    const included = new Set<string>();
    for (const color of draft.colors) {
      record(color, ['declarationId', 'label', 'family']);
      if (
        typeof color.declarationId !== 'string' ||
        !declarations.has(color.declarationId) ||
        included.has(color.declarationId)
      )
        throw new Error('Select each captured color declaration at most once.');
      included.add(color.declarationId);
      text(color.label, LIMITS.maximumText);
      text(color.family, 160);
    }
    const statements = adapter.statements(inventory);
    const byId = new Map(statements.map(item => [item.id, item]));
    list(draft.statements, LIMITS.maximumClaims);
    const reviewed = new Set<string>();
    for (const statement of draft.statements) {
      record(statement, ['observationId', 'meaning', 'scope', 'reason', 'definition', 'modeIds']);
      if (
        typeof statement.observationId !== 'string' ||
        !byId.has(statement.observationId) ||
        reviewed.has(statement.observationId)
      )
        throw new Error('Each captured statement must have one source-bound interpretation.');
      reviewed.add(statement.observationId);
      if (
        typeof statement.meaning !== 'string' ||
        typeof statement.scope !== 'string' ||
        ![
          'needs-interpretation',
          'closed-palette',
          'no-gradients',
          'not-a-rule',
          'relationship',
        ].includes(statement.meaning) ||
        !['all', 'brand', 'product'].includes(statement.scope)
      )
        throw new Error('Unsupported source statement interpretation.');
      text(statement.reason, 2000);
      ids(statement.modeIds, allModes, LIMITS.maximumModes);
      if (statement.meaning === 'relationship' && statement.definition !== null)
        assertSourceRuleDefinition(statement.definition);
      else if (statement.definition !== null)
        throw new Error('Only relationships may contain operands.');
    }
    if (reviewed.size !== statements.length)
      throw new Error('Captured source statements cannot be omitted from the review.');
    const evidence = new Set([...declarations, ...byId.keys()]);
    list(draft.scales, LIMITS.maximumScales);
    const scaleIds = new Set<string>();
    for (const scale of draft.scales) {
      record(scale, ['id', 'label', 'family', 'slots', 'modes', 'evidenceRefs']);
      boundedText(scale.id);
      if (
        !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(scale.id) ||
        scaleIds.has(scale.id) ||
        ['__proto__', 'constructor', 'prototype'].includes(scale.id)
      )
        throw new Error('Each scale needs a distinct inert identifier.');
      scaleIds.add(scale.id);
      text(scale.label, 160);
      text(scale.family, 160);
      ids(scale.evidenceRefs, evidence, LIMITS.maximumRefs);
      list(scale.slots, LIMITS.maximumSlots);
      for (const slot of scale.slots) {
        record(slot, ['id', 'position']);
        text(slot.id, LIMITS.maximumId);
        if (
          typeof slot.position !== 'number' ||
          !Number.isFinite(slot.position) ||
          slot.position < 0 ||
          slot.position > Number.MAX_SAFE_INTEGER
        )
          throw new Error('Source scale positions must be finite nonnegative numbers.');
      }
      list(scale.modes, LIMITS.maximumModes);
      const scaleModes = new Set<string>();
      for (const mode of scale.modes) {
        record(mode, ['modeId', 'anchors']);
        if (
          typeof mode.modeId !== 'string' ||
          !allModes.has(mode.modeId) ||
          scaleModes.has(mode.modeId)
        )
          throw new Error('A scale cannot duplicate or invent source modes.');
        scaleModes.add(mode.modeId);
        list(mode.anchors, LIMITS.maximumSlots);
        for (const anchor of mode.anchors) {
          record(anchor, ['slotId', 'declarationId']);
          text(anchor.slotId, LIMITS.maximumId);
          if (typeof anchor.declarationId !== 'string' || !declarations.has(anchor.declarationId))
            throw new Error('Scale anchor refers to an unavailable declaration.');
        }
      }
    }
    record(draft.scopeDecision, ['accepted', 'reason']);
    if (typeof draft.scopeDecision.accepted !== 'boolean')
      throw new Error('Scope acceptance must be explicit.');
    text(draft.scopeDecision.reason, 2000);
    const profileDecision = adapter.parseProfileDecision(
      draft.captureHash as string,
      draft.profileDecision
    );
    return freeze({ ...draft, profileDecision } as unknown as SourceReviewDraft<D>);
  }

  const scopes = (scope: ReviewScope) =>
    scope === 'all' ? [...CONTEXTS] : [scope, `gradient:${scope}`];
  function compile(
    inventory: I,
    raw: SourceReviewDraft<D>,
    rawActor: SourceReviewedSource<D, R>['decision']['actor'],
    reviewedAt = new Date().toISOString()
  ): SourceReviewedSource<D, R> {
    const draft = parse(inventory, raw);
    const actor = snapshotColorSystemInertJsonV1(rawActor);
    record(actor, ['kind', 'ref']);
    boundedText(actor.ref);
    if (
      actor.kind !== 'user' ||
      !Number.isFinite(Date.parse(reviewedAt)) ||
      new Date(reviewedAt).toISOString() !== reviewedAt
    )
      throw new Error('Applying a source review needs an explicit user and timestamp.');
    if (!draft.scopeDecision.accepted || !draft.scopeDecision.reason.trim())
      throw new Error(
        'Review the captured scope and explain why its partial evidence is sufficient for this work.'
      );
    if (draft.colors.some(item => !item.label.trim())) throw new Error('Name each included color.');
    const base = adapter.buildModel(inventory, {
      captureHash: draft.captureHash,
      declarationIds: draft.colors.map(item => item.declarationId),
      modeIds: draft.modeIds,
      profileDecision: draft.profileDecision,
    });
    const statements = new Map(adapter.statements(inventory).map(item => [item.id, item]));
    const byColor = new Map(base.colors.map(item => [item.id, item]));
    const selected = new Set(draft.colors.map(item => item.declarationId));
    const familyLabels = [...new Set(draft.colors.map(item => item.family.trim()).filter(Boolean))];
    const familyId = (label: string) => adapter.id('family', label);
    const scaleIds = new Set(draft.scales.map(item => item.id));
    const resolve = (selector: {
      kind: 'color' | 'family' | 'scale';
      id: string;
    }): ColorSystemSelectorV1 => {
      if (selector.kind === 'color' && selected.has(selector.id)) return selector;
      if (selector.kind === 'family' && familyLabels.includes(selector.id))
        return { kind: 'family', id: familyId(selector.id) };
      if (selector.kind === 'scale' && scaleIds.has(selector.id)) return selector;
      throw new Error('A source relationship refers to an excluded color, family or scale.');
    };
    const modeIds = (statement: SourceReviewStatement) => {
      if (statement.modeIds.some(id => !draft.modeIds.includes(id)))
        throw new Error('A statement refers to an excluded mode. Update its scope explicitly.');
      return statement.modeIds.length ? statement.modeIds : draft.modeIds;
    };
    const rules: ColorSystemScopedRuleV1[] = draft.statements.flatMap(statement => {
      const source = statements.get(statement.observationId)!;
      const common = {
        id: adapter.id('rule', source.id),
        label: source.text,
        contextIds: scopes(statement.scope),
        modeIds: modeIds(statement),
        origin: 'inferred' as const,
        evidenceRefs: [source.evidenceId],
        claimIds: [source.claimId],
      };
      if (statement.meaning === 'closed-palette')
        return common.modeIds.map(modeId => {
          const members = [...selected]
            .filter(id => byColor.get(id)?.valuesByMode[modeId])
            .map(id => ({ kind: 'color' as const, id }));
          if (!members.length)
            throw new Error('A closed palette needs admitted source colors in each selected mode.');
          return {
            ...common,
            id: adapter.id('rule', [source.id, modeId]),
            modeIds: [modeId],
            kind: 'palette-membership' as const,
            force: 'requirement' as const,
            operands: { members },
          };
        });
      if (statement.meaning === 'relationship') {
        if (!statement.definition)
          throw new Error('Complete each source relationship before applying.');
        return [compileSourceRuleDefinition(common, statement.definition, resolve)];
      }
      return [];
    });
    const decisions = new Map(
      draft.statements.map(item => [statements.get(item.observationId)!.claimId, item])
    );
    const evidence: ColorSystemEvidenceV1[] = [...base.evidence];
    const decisionClaims: ColorSystemClaimV1[] = [];
    const claims = base.claims.map(claim => {
      const statement = decisions.get(claim.id);
      if (statement) {
        if (statement.meaning === 'not-a-rule' && !statement.reason.trim())
          throw new Error('Explain why each excluded source statement is not a color rule.');
        const receiptId = adapter.id('evidence', [claim.id, 'interpretation']);
        evidence.push({
          id: receiptId,
          sourceId: claim.sourceId,
          locator: `review/statement/${statement.observationId}`,
          status: 'inferred',
          description: `User ${actor.ref} interpreted this statement as ${statement.meaning}. ${statement.reason}`,
        });
        return {
          ...claim,
          evidenceRefs: [...claim.evidenceRefs, receiptId],
          status:
            statement.meaning === 'needs-interpretation' || statement.meaning === 'no-gradients'
              ? ('unsupported' as const)
              : ('inferred' as const),
          contextIds:
            statement.meaning === 'not-a-rule'
              ? []
              : scopes(statement.scope).filter(
                  id => statement.meaning !== 'no-gradients' || id.startsWith('gradient:')
                ),
          modeIds: modeIds(statement),
          ruleIds: rules.filter(item => item.claimIds.includes(claim.id)).map(item => item.id),
        };
      }
      if (claim.id === adapter.id('claim', [claim.sourceId, adapter.pendingClaimKey])) {
        const receiptId = adapter.id('evidence', [claim.sourceId, 'reviewed-scope']);
        evidence.push({
          id: receiptId,
          sourceId: claim.sourceId,
          locator: 'review/partial-scope',
          status: 'inferred',
          description: `User ${actor.ref} accepted the selected partial capture for this work at ${reviewedAt}. ${draft.scopeDecision.reason}`,
        });
        return {
          ...claim,
          text: 'The user reviewed the selected partial source scope; this does not establish complete guideline coverage or corporate approval.',
          status: 'inferred' as const,
          evidenceRefs: [...claim.evidenceRefs, receiptId],
        };
      }
      return claim;
    });
    const evidenceById = new Map(evidence.map(item => [item.id, item]));
    const addStructureClaims = (
      key: string[],
      text: string,
      refs: string[],
      modes: string[]
    ): string[] => {
      const refsBySource = new Map<string, string[]>();
      for (const ref of new Set(refs)) {
        const sourceId = evidenceById.get(ref)!.sourceId;
        const sourceRefs = refsBySource.get(sourceId) ?? [];
        sourceRefs.push(ref);
        refsBySource.set(sourceId, sourceRefs);
      }
      return [...refsBySource].map(([sourceId, sourceRefs]) => {
        const id = adapter.id('claim', [...key, sourceId]);
        decisionClaims.push({
          id,
          sourceId,
          text,
          status: 'inferred',
          evidenceRefs: sourceRefs,
          contextIds: [],
          modeIds: modes,
          ruleIds: [],
        });
        return id;
      });
    };
    const families = familyLabels.map(label => {
      const colorIds = draft.colors
        .filter(item => item.family.trim() === label)
        .map(item => item.declarationId);
      const refs = [...new Set(colorIds.map(id => byColor.get(id)!.evidenceRefs[0]))];
      const id = familyId(label);
      const claimIds = addStructureClaims(
        ['family', id],
        `User-reviewed family membership: ${label}. It does not establish a global primary or permitted use.`,
        refs,
        draft.modeIds
      );
      return { id, label, colorIds, evidenceRefs: refs, claimIds };
    });
    const evidenceRef = (id: string) => {
      if (byColor.has(id)) return byColor.get(id)!.evidenceRefs[0];
      if (statements.has(id)) return statements.get(id)!.evidenceId;
      throw new Error('Scale evidence refers to an excluded color.');
    };
    const scales = draft.scales.map(scale => {
      if (
        !scale.label.trim() ||
        !familyLabels.includes(scale.family.trim()) ||
        !scale.evidenceRefs.length
      )
        throw new Error('Name each scale, assign its included family and retain source evidence.');
      const refs = [...new Set(scale.evidenceRefs.map(evidenceRef))];
      const claimIds = addStructureClaims(
        ['scale', scale.id],
        `User-reviewed source scale: ${scale.label}; ${adapter.scaleModeDescription} and empty positions are retained.`,
        refs,
        scale.modes.map(item => item.modeId)
      );
      return {
        id: scale.id,
        label: scale.label.trim(),
        familyId: familyId(scale.family.trim()),
        slots: scale.slots,
        modes: scale.modes.map(mode => {
          if (!draft.modeIds.includes(mode.modeId))
            throw new Error('A scale refers to an excluded mode.');
          return {
            modeId: mode.modeId,
            anchors: mode.anchors.map(anchor => {
              const color = byColor.get(anchor.declarationId);
              if (!color?.valuesByMode[mode.modeId])
                throw new Error(
                  'A source scale anchor needs an included value in its exact source mode.'
                );
              return { slotId: anchor.slotId, colorId: anchor.declarationId };
            }),
          };
        }),
        evidenceRefs: refs,
        claimIds,
      };
    });
    const { modelHash: _hash, ...baseInput } = base;
    const allClaims = [...claims, ...decisionClaims];
    const input: ColorSystemModelInputV1 = {
      ...baseInput,
      evidence,
      claims: allClaims,
      colors: draft.colors.map(item => ({
        ...byColor.get(item.declarationId)!,
        label: item.label.trim(),
      })),
      families,
      scales,
      rules,
      adoptions: [],
      coverage: base.coverage.map(item => ({
        ...item,
        unresolvedClaimIds: allClaims
          .filter(
            claim =>
              claim.sourceId === item.sourceId &&
              ['unsupported', 'unresolved'].includes(claim.status)
          )
          .map(claim => claim.id),
      })),
    };
    const reviewedActor = { kind: 'user' as const, ref: actor.ref };
    const decisionRef = guidelineHash(draft);
    const adoptions = buildColorSystemRuleAdoptionsV1(
      input,
      rules.map(rule => ({
        ruleId: rule.id,
        status: 'accepted',
        actor: reviewedActor,
        authorityRef: `review:${draft.captureHash}`,
        decisionRef,
      }))
    );
    const model = buildColorSystemModelV1({ ...input, adoptions });
    const content = {
      schemaVersion: adapter.reviewVersion,
      captureHash: draft.captureHash,
      model,
      decision: { actor: reviewedActor, reviewedAt, draft },
    };
    return freeze({ ...content, reviewHash: guidelineHash(content) });
  }

  return { suggest, parse, compile };
}
