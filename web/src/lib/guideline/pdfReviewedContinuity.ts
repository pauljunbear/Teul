import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { parseCaptureAny, type GuidelineCaptureAny } from './evidenceV2';
import { guidelineHash } from './review';
import { COLOR_SYSTEM_MODEL_V1_LIMITS } from '../../../../src/lib/colorSystemModelV1';
import { proposePdfRefresh } from './pdfRefresh';
import { parseGuidelineDraftV4, type GuidelineReviewDraftV4 } from './reviewV4';
import type { SourceSelectorV2 } from './reviewV2';
import {
  isReviewedValueAvailable,
  type PdfRegionWitness,
  type ReviewedValueCandidate,
} from './reviewedValues';
import { mapSourceRuleDefinition } from './structureRules';

const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const witnessId = (witness: PdfRegionWitness) => `reviewed-witness:${witness.witnessHash.slice(7)}`;
const region = (witness: PdfRegionWitness) => canonicalJson([witness.page, witness.bounds]);
const appearance = ({ page, pageSize, bounds, render, raster }: PdfRegionWitness) => ({
  page,
  pageSize,
  bounds,
  render,
  raster,
});
const payload = (candidate: ReviewedValueCandidate) => ({
  method: candidate.method,
  value: candidate.value,
  ...(candidate.method === 'transcribed-digital'
    ? { literal: candidate.literal }
    : { pixel: candidate.pixel }),
});

/** Only unique, included, currently confirmed values are eligible for continuity. */
export function activePdfReviewedValues(draft: GuidelineReviewDraftV4) {
  const witnesses = new Map(draft.reviewedValues.witnesses.map(item => [item.witnessHash, item]));
  const colors = new Map(draft.colors.map(item => [item.observationId, item]));
  return draft.reviewedValues.candidates.flatMap(candidate => {
    const color = colors.get(candidate.id),
      witness = witnesses.get(candidate.witnessHash);
    return color?.include && witness && isReviewedValueAvailable(draft.reviewedValues, candidate.id)
      ? [{ candidate, color, witness }]
      : [];
  });
}

/** Derived correspondence, never persisted approval. The capture-only refresh hash stays unchanged. */
export function preparePdfReviewedContinuity(
  previousCapture: GuidelineCaptureAny,
  previousDraft: GuidelineReviewDraftV4,
  nextCapture: GuidelineCaptureAny
) {
  const old = parseGuidelineDraftV4(previousCapture, previousDraft);
  const capture = parseCaptureAny(nextCapture);
  const proposal = proposePdfRefresh(previousCapture, old, capture);
  // Only validated, frozen witnesses enter this closure; compare their large raster payload once.
  const appearances = new WeakMap<PdfRegionWitness, string>();
  const appearanceHash = (witness: PdfRegionWitness) => {
    let hash = appearances.get(witness);
    if (!hash) {
      hash = guidelineHash(appearance(witness));
      appearances.set(witness, hash);
    }
    return hash;
  };
  return {
    proposal,
    compare(currentDraft: GuidelineReviewDraftV4) {
      const current = parseGuidelineDraftV4(capture, currentDraft);
      const candidatePairs = new Map<string, string>(),
        evidencePairs = new Map<string, string>();
      const empty = {
        candidatePairs,
        evidencePairs,
        scales: [],
        restored: current,
        addedScales: 0,
        restoredRules: 0,
        restorationError: '',
      };
      if (proposal.metadataChanges.length) return empty;
      const before = activePdfReviewedValues(old),
        after = activePdfReviewedValues(current);
      const group = (items: typeof before) => {
        const result = new Map<string, typeof before>();
        for (const item of items) {
          const key = region(item.witness);
          result.set(key, [...(result.get(key) ?? []), item]);
        }
        return result;
      };
      const left = group(before),
        right = group(after);
      for (const [key, a] of left) {
        const b = right.get(key);
        if (
          a.length !== 1 ||
          b?.length !== 1 ||
          appearanceHash(a[0].witness) !== appearanceHash(b[0].witness) ||
          !equal(payload(a[0].candidate), payload(b[0].candidate))
        )
          continue;
        candidatePairs.set(a[0].candidate.id, b[0].candidate.id);
        evidencePairs.set(a[0].candidate.id, b[0].candidate.id);
        evidencePairs.set(witnessId(a[0].witness), witnessId(b[0].witness));
      }
      const mapping = new Map(evidencePairs);
      for (const change of proposal.changes)
        if (change.status === 'unchanged' && change.beforeId && change.afterId)
          mapping.set(change.beforeId, change.afterId);
      const nextColors = new Map(current.colors.map(color => [color.observationId, color]));
      const safeColors = new Set(
        old.colors
          .filter(color => {
            const next = nextColors.get(mapping.get(color.observationId) ?? '');
            return next && equal({ ...color, observationId: next.observationId }, next);
          })
          .map(color => color.observationId)
      );
      const safeFamily = (family: string) => {
        const members = old.colors.filter(color => color.family === family && color.include);
        const next = current.colors.filter(color => color.family === family && color.include);
        return (
          members.length > 0 &&
          members.length === next.length &&
          members.every(color => safeColors.has(color.observationId))
        );
      };
      const scales = old.scales.flatMap(scale => {
        if (
          scale.evidenceRefs.some(ref => !mapping.has(ref)) ||
          scale.slots.some(
            slot => slot.observationId !== null && !safeColors.has(slot.observationId)
          )
        )
          return [];
        return [
          {
            ...scale,
            evidenceRefs: scale.evidenceRefs.map(ref => mapping.get(ref)!),
            slots: scale.slots.map(slot => ({
              ...slot,
              observationId: slot.observationId === null ? null : mapping.get(slot.observationId)!,
            })),
          },
        ];
      });
      // Restore only items reset by the refresh. Never overwrite a later edit or re-add a deleted retained scale.
      const additions = scales.filter(
        scale =>
          !proposal.draft.scales.some(s => s.id === scale.id) &&
          !current.scales.some(s => s.id === scale.id)
      );
      const mergedScales = [...current.scales, ...additions];
      if (mergedScales.length > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumScales)
        return {
          ...empty,
          scales,
          restorationError: `Restoring these scales would exceed the ${COLOR_SYSTEM_MODEL_V1_LIMITS.maximumScales}-scale limit. Remove a current scale before restoring.`,
        };
      const safeScales = new Set(
        scales
          .filter(scale => mergedScales.some(s => s.id === scale.id && equal(s, scale)))
          .map(scale => scale.id)
      );
      const remap = (selector: SourceSelectorV2): SourceSelectorV2 => {
        if (selector.kind === 'color' && safeColors.has(selector.id))
          return { ...selector, id: mapping.get(selector.id)! };
        if (selector.kind === 'family' && safeFamily(selector.id)) return selector;
        if (selector.kind === 'scale' && safeScales.has(selector.id)) return selector;
        throw new Error('Changed rule dependency');
      };
      const baselineRules = new Map(proposal.draft.rules.map(rule => [rule.observationId, rule]));
      const restorations = new Map<string, GuidelineReviewDraftV4['rules'][number]>();
      for (const rule of old.rules) {
        const id = mapping.get(rule.observationId);
        if (
          !id ||
          rule.meaning === 'needs-interpretation' ||
          baselineRules.get(id)?.meaning !== 'needs-interpretation'
        )
          continue;
        if (
          rule.meaning === 'closed-palette' &&
          (old.colors.length !== current.colors.length ||
            old.colors.some(color => !safeColors.has(color.observationId)))
        )
          continue;
        try {
          const definition = rule.definition
            ? mapSourceRuleDefinition(rule.definition, remap)
            : null;
          restorations.set(id, { ...rule, observationId: id, definition });
        } catch {
          /* A changed or incomplete dependency stays unresolved. */
        }
      }
      let restoredRules = 0;
      const rules = current.rules.map(rule => {
        const restoration = restorations.get(rule.observationId);
        if (!restoration || !equal(rule, baselineRules.get(rule.observationId))) return rule;
        restoredRules++;
        return restoration;
      });
      let restored: GuidelineReviewDraftV4;
      try {
        restored = parseGuidelineDraftV4(capture, { ...current, scales: mergedScales, rules });
      } catch (reason) {
        return {
          ...empty,
          scales,
          restorationError:
            reason instanceof Error ? reason.message : 'Related structure could not be restored.',
        };
      }
      return {
        candidatePairs,
        evidencePairs,
        scales,
        restored,
        addedScales: additions.length,
        restoredRules,
        restorationError: '',
      };
    },
  };
}
