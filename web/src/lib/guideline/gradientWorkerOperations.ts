import {
  isGuidelineAuthoredGradient,
  createGuidelineContinuousGradient,
  authoredGradientControls,
  guidelineGradientCatalogPermission,
  AUTHORED_GRADIENT_VERSION,
  type GuidelineAuthoredGradientSelection,
  type GuidelineGradientControls,
  type GuidelineGradientPolicy,
} from './authoredGradient';
import type { GuidelineGradientCatalogPermission } from './gradientCatalog';
import {
  guidelineAuthoredGradientExports,
  guidelineGradientExports,
  guidelineModeGradientExports,
} from './gradientExport';
import type { GuidelineSelection } from './project';
import type { GuidelineModeGradientSelection, ModeGradientReview } from './modeGradient';
import {
  suggestGuidelineGradients,
  type GuidelineGradientSuggestionRequest,
  type GuidelineGradientSuggestions,
} from './gradientSuggestions';
import { guidelineHash } from './review';
import { record } from '../../../../services/guideline-intake/src/protocol';

export const GRADIENT_WORKER_VERSION = 'teul.gradient-worker.v1' as const;
export type GradientSelection =
  GuidelineAuthoredGradientSelection | GuidelineSelection | GuidelineModeGradientSelection;
export type GradientWorkerRequest = { review: ModeGradientReview } & (
  | {
      operation: 'generate';
      controls: GuidelineGradientControls;
      policy: GuidelineGradientPolicy | null;
      catalog: GuidelineGradientCatalogPermission | null;
    }
  | { operation: 'verify'; selection: GradientSelection }
  | { operation: 'suggest'; request: GuidelineGradientSuggestionRequest }
);
export interface GradientWorkerValue {
  selection: GradientSelection;
  portable: ReturnType<typeof guidelineAuthoredGradientExports>;
}
export type VerifiedGradientSuggestions = Omit<GuidelineGradientSuggestions, 'directions'> & {
  directions: (GuidelineGradientSuggestions['directions'][number] & {
    verified: GradientWorkerValue;
  })[];
};
export type GradientWorkerResult =
  | { kind: 'gradient'; value: GradientWorkerValue }
  | { kind: 'suggestions'; value: VerifiedGradientSuggestions };

// Model content is validated against its own hash by the source-bound readers in the worker.
export function gradientWorkerRequestHash(request: GradientWorkerRequest): string {
  return guidelineHash({
    ...request,
    review: { modelHash: request.review.model.modelHash, reviewHash: request.review.reviewHash },
  });
}
function verify(review: ModeGradientReview, selection: GradientSelection): GradientWorkerValue {
  const portable = isGuidelineAuthoredGradient(selection)
    ? guidelineAuthoredGradientExports(review, selection)
    : 'modeId' in selection
      ? guidelineModeGradientExports(review, selection)
      : guidelineGradientExports(review, selection);
  return { selection, portable };
}

/** Worker-only execution: no timer yield can interrupt one numerical assessment on the UI thread. */
export async function executeGradientWorkerRequest(
  request: GradientWorkerRequest
): Promise<GradientWorkerResult> {
  record(request, [
    'operation',
    'review',
    ...(request.operation === 'generate'
      ? ['controls', 'policy', 'catalog']
      : request.operation === 'verify'
        ? ['selection']
        : ['request']),
  ]);
  if (request.operation === 'generate') {
    const selection = createGuidelineContinuousGradient(
      request.review,
      request.controls,
      request.policy ?? undefined,
      request.catalog ?? undefined
    );
    return { kind: 'gradient', value: verify(request.review, selection) };
  }
  if (request.operation === 'verify')
    return { kind: 'gradient', value: verify(request.review, request.selection) };
  if (request.operation !== 'suggest') throw new Error('Unsupported gradient operation.');
  const proposed = await suggestGuidelineGradients(request.review, request.request);
  const directions: VerifiedGradientSuggestions['directions'] = [];
  let rejected = 0;
  for (const direction of proposed.directions) {
    const old = direction.selection;
    try {
      const selection = createGuidelineContinuousGradient(
        request.review,
        authoredGradientControls(old),
        old.schemaVersion === AUTHORED_GRADIENT_VERSION ? undefined : old.policy,
        guidelineGradientCatalogPermission(old) ?? undefined
      );
      const verified = verify(request.review, selection);
      if (!verified.portable.exportable) {
        rejected++;
        continue;
      }
      directions.push({ ...direction, id: selection.design.designHash, selection, verified });
    } catch {
      rejected++;
    }
  }
  return {
    kind: 'suggestions',
    value: {
      ...proposed,
      directions,
      counts: { ...proposed.counts, rejected: proposed.counts.rejected + rejected },
      notes: [
        ...proposed.notes,
        ...(rejected
          ? [
              'Some shortlisted directions could not pass continuous fidelity or final-paint checks.',
            ]
          : []),
      ],
    },
  };
}
