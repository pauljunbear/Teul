import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import type { ReviewedGuideline } from './review';
import {
  isGuidelineNewScale,
  previewGuidelineExtension,
  reviewGuidelineExtension,
  type GuidelineExtensionResult,
  type GuidelineExtensionReview,
} from './extension';
import { assessGuidelineApplication, type GuidelineApplicationResult } from './application';
import type { GuidelineSupportingSelection } from './supportingDirections';

export interface GuidelineAvailableExtension {
  preview: GuidelineExtensionResult;
  decision: GuidelineExtensionReview | null;
}
export interface GuidelineSelectedOutputs {
  extension: GuidelineAvailableExtension | null;
  application: GuidelineApplicationResult | null;
  /** Runtime-only here; workspace V4 and lineage V3 persist this in separate versioned fields. */
  supporting?: GuidelineSupportingSelection | null;
}
/** New requests must not be admitted under older workspace/history contracts. */
export function hasGuidelineNewScale(
  outputs: Pick<GuidelineSelectedOutputs, 'extension' | 'application'>
): boolean {
  const standalone = outputs.extension?.preview.request;
  const embedded = outputs.application?.request.extension?.preview.request;
  return !!(
    (standalone && isGuidelineNewScale(standalone)) ||
    (embedded && isGuidelineNewScale(embedded))
  );
}
export const EMPTY_GUIDELINE_OUTPUTS: GuidelineSelectedOutputs = Object.freeze({
  extension: null,
  application: null,
});
export const GUIDELINE_WORKSPACE_LIMITS = {
  maximumBytes: 16 * 1024 * 1024,
  maximumDepth: 48,
  maximumNodes: 800000,
  maximumObjectKeys: 10000,
};

/** Retain the chosen paints and outcome, not runtime-specific contrast/execution receipt hashes. */
export function storedGuidelineOutputs(outputs: GuidelineSelectedOutputs) {
  const application = outputs.application;
  return {
    extension: outputs.extension,
    application: application
      ? {
          sourceModelHash: application.sourceModelHash,
          reviewHash: application.reviewHash,
          requestHash: application.requestHash,
          request: application.request,
          layout: application.layout,
          model: application.model,
          applications: application.applications,
          geometry: application.geometry,
          status: application.status,
          exportable: application.recipe !== null,
        }
      : null,
  };
}

/** Recompute every outcome, including failures. Saved labels never confer export authority. */
export async function readGuidelineSelectedOutputs(
  raw: unknown,
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'> | null,
  signal?: AbortSignal,
  allowNewScales = false
): Promise<GuidelineSelectedOutputs> {
  signal?.throwIfAborted();
  const saved = snapshotColorSystemInertJsonV1(raw, GUIDELINE_WORKSPACE_LIMITS);
  record(saved, ['extension', 'application']);
  if (!review) {
    if (saved.extension !== null || saved.application !== null)
      throw new Error('Selected outputs require their retained source review.');
    return EMPTY_GUIDELINE_OUTPUTS;
  }
  const execution = {
    isCancelled: () => signal?.aborted ?? false,
    yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
  };
  let extension: GuidelineAvailableExtension | null = null;
  if (saved.extension !== null) {
    record(saved.extension, ['preview', 'decision']);
    const pair = saved.extension as unknown as GuidelineAvailableExtension;
    if (!pair.preview || pair.preview.status === 'cancelled')
      throw new Error('A cancelled extension is not a selected result.');
    if (!allowNewScales && pair.preview.request && isGuidelineNewScale(pair.preview.request))
      throw new Error('Source-derived scale work requires a newer project format.');
    const preview = pair.decision
      ? await reviewGuidelineExtension(review, pair.preview.request, pair.decision, execution)
      : await previewGuidelineExtension(review, pair.preview.request, execution);
    signal?.throwIfAborted();
    if (canonicalJson(preview) !== canonicalJson(pair.preview))
      throw new Error('Saved extension differs from its source review and recorded decisions.');
    extension = { preview, decision: pair.decision };
  }
  let application: GuidelineApplicationResult | null = null;
  if (saved.application !== null) {
    const stored = saved.application as NonNullable<
      ReturnType<typeof storedGuidelineOutputs>['application']
    >;
    if (!stored || stored.status === 'cancelled')
      throw new Error('A cancelled application is not a selected result.');
    if (
      !allowNewScales &&
      stored.request?.extension?.preview?.request &&
      isGuidelineNewScale(stored.request.extension.preview.request)
    )
      throw new Error('Source-derived scale work requires a newer project format.');
    // Its embedded extension is independent of the standalone panel's selection.
    application = await assessGuidelineApplication(review, stored.request, signal);
    signal?.throwIfAborted();
    if (
      canonicalJson(storedGuidelineOutputs({ extension: null, application }).application) !==
      canonicalJson(stored)
    )
      throw new Error('Saved application differs from its source review or actual paint checks.');
  }
  return freeze({ extension, application });
}
