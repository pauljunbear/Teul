import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { parseColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import {
  compileGradientV1,
  type GradientDesignV1,
  type GradientInputV1,
} from '../../../../src/lib/colorSystemGradientV1';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { guidelineSourceGradientInput, readGuidelineSourceGradient } from './project';
import { guidelineHash, guidelineOperationIssues, type ReviewedGuideline } from './review';

export const MODE_GRADIENT_VERSION = 'teul.guideline-mode-gradient.v1' as const;
export type ModeGradientReview = Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
export interface GuidelineModeGradientSelection {
  schemaVersion: typeof MODE_GRADIENT_VERSION;
  kind: 'gradient';
  scope: 'brand' | 'product';
  modeId: string;
  design: GradientDesignV1;
}
const compiledSelections = new WeakMap<object, { modelHash: string; reviewHash: string }>();

/** Native modes are explicit source bindings; no fallback or same-name mode matching is used. */
export function createGuidelineModeGradient(
  review: ModeGradientReview,
  scope: 'brand' | 'product',
  modeId: string,
  first: string,
  last: string,
  angle: number
): GuidelineModeGradientSelection {
  const selection: GuidelineModeGradientSelection = Object.freeze({
    schemaVersion: MODE_GRADIENT_VERSION,
    kind: 'gradient',
    scope,
    modeId,
    design: compileGradientV1(modeGradientInput(review, scope, modeId, first, last, angle)),
  });
  compiledSelections.set(selection, {
    modelHash: selection.design.sourceModelHash,
    reviewHash: review.reviewHash,
  });
  return selection;
}
function modeGradientInput(
  review: ModeGradientReview,
  scope: 'brand' | 'product',
  modeId: string,
  first: string,
  last: string,
  angle: number
): GradientInputV1 {
  if (!['brand', 'product'].includes(scope)) throw new Error('Unsupported gradient use.');
  if (!/^sha256:[a-f0-9]{64}$/.test(review.reviewHash))
    throw new Error('A gradient must bind an applied source review.');
  const model = parseColorSystemModelV1(review.model);
  if (!model.modes.some(mode => mode.id === modeId))
    throw new Error('Choose a declared source mode for the gradient.');
  if (!model.contexts.find(context => context.id === `gradient:${scope}`)?.modeIds.includes(modeId))
    throw new Error('This source mode is unavailable for the selected gradient use.');
  const issues = guidelineOperationIssues({ model }, 'gradient', scope, modeId);
  if (issues.length) throw new Error(issues[0]);
  return guidelineSourceGradientInput(
    { model },
    {
      modeId,
      first,
      last,
      angle,
      briefHash: guidelineHash({
        schemaVersion: MODE_GRADIENT_VERSION,
        review: review.reviewHash,
        scope,
        modeId,
        first,
        last,
        angle,
      }),
    }
  );
}

/** Rebuild from reviewed source values; saved stop values and cached paint carry no authority. */
export function readGuidelineModeGradientSelection(
  review: ModeGradientReview | null,
  raw: unknown
): GuidelineModeGradientSelection | null {
  if (raw === null) return null;
  if (!review) throw new Error('A selected design requires an applied source review.');
  // Only this module's frozen compiler outputs skip replay, still bound to a validated model.
  const compiled = raw && typeof raw === 'object' ? compiledSelections.get(raw) : undefined;
  if (
    compiled &&
    compiled.reviewHash === review.reviewHash &&
    compiled.modelHash === parseColorSystemModelV1(review.model).modelHash
  )
    return raw as GuidelineModeGradientSelection;
  const saved = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 256_000 });
  record(saved, ['schemaVersion', 'kind', 'scope', 'modeId', 'design']);
  if (saved.schemaVersion !== MODE_GRADIENT_VERSION || saved.kind !== 'gradient')
    throw new Error('Unsupported mode-bound gradient selection.');
  const design = saved.design as GradientDesignV1;
  if (!design || !Array.isArray(design.stops) || design.stops.length !== 2)
    throw new Error('This editor supports two source-anchored gradient stops.');
  const scope = saved.scope as GuidelineModeGradientSelection['scope'],
    modeId = saved.modeId as string;
  const input = modeGradientInput(
    review,
    scope,
    modeId,
    design.stops[0]?.sourceColorId ?? '',
    design.stops[1]?.sourceColorId ?? '',
    design.angleDegrees
  );
  const selection: GuidelineModeGradientSelection = Object.freeze({
    schemaVersion: MODE_GRADIENT_VERSION,
    kind: 'gradient',
    scope,
    modeId,
    design: readGuidelineSourceGradient(design, input),
  });
  compiledSelections.set(selection, {
    modelHash: input.sourceModelHash,
    reviewHash: review.reviewHash,
  });
  return selection;
}
