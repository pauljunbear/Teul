import { isNativeLinearPaintV1 } from '../../../../src/lib/colorSystemFinalGradientPaintV1';
import {
  isGuidelineNativeGradient,
  createGuidelineNativeGradient,
  type GuidelineNativeGradientControls,
} from './nativeGradientSelection';
import {
  readGuidelineNativeGradientContext,
  resolveGuidelineNativeGradientSource,
  type GuidelineNativeGradientSource,
  type GuidelineNativeGradientSourceBinding,
  type GuidelineNativeGradientContext,
} from './nativeGradientWorkspace';
import {
  createGuidelineContinuousGradient,
  authoredGradientControls,
  guidelineGradientCatalogPermission,
  AUTHORED_GRADIENT_VERSION,
  type GuidelineGradientControls,
  type GuidelineGradientPolicy,
} from './authoredGradient';
import type { GuidelineGradientCatalogPermission } from './gradientCatalog';
import {
  guidelineSelectedGradientExports,
  type GuidelineGradientSelection,
} from './gradientExport';
import type { ModeGradientReview } from './modeGradient';
import {
  suggestGuidelineGradients,
  type GuidelineGradientSuggestionRequest,
  type GuidelineGradientSuggestions,
} from './gradientSuggestions';
import { guidelineHash } from './review';
import { record } from '../../../../services/guideline-intake/src/protocol';
import type { FigmaCapturePacket } from '../../../../services/guideline-intake/src/figmaProtocol';
import { createFigmaNativeInventory } from './figmaInventory';
import { figmaNativeGradients } from './nativeGradient';
import {
  composeNativeGradientComparison,
  type NativeGradientComparison,
  type NativeGradientComparisonFrame,
} from './nativeGradientComparison';
import {
  bindGuidelineCompositionGradient,
  type GuidelineCompositionGradient,
  type GuidelineCompositionGradientBinding,
} from './compositionGradient';
import type { ColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import {
  assessGradientDesignFidelityV2,
  type GradientFidelityV2,
} from '../../../../src/lib/colorSystemGradientFidelityV2';

export const GRADIENT_WORKER_VERSION = 'teul.gradient-worker.v1' as const;
export type GradientSelection = GuidelineGradientSelection;
export type GradientWorkerRequest = {
  review: ModeGradientReview;
  nativeContext?: GuidelineNativeGradientContext;
} & (
  | {
      operation: 'native-edit';
      source: GuidelineNativeGradientSourceBinding;
      controls: GuidelineNativeGradientControls;
    }
  | {
      operation: 'generate';
      controls: GuidelineGradientControls;
      policy: GuidelineGradientPolicy | null;
      catalog: GuidelineGradientCatalogPermission | null;
    }
  | { operation: 'verify'; selection: GradientSelection }
  | { operation: 'suggest'; request: GuidelineGradientSuggestionRequest }
  | {
      operation: 'composition';
      gradient: GuidelineCompositionGradient;
      workingModel: ColorSystemModelV1;
    }
  | {
      operation: 'compare';
      selection: GradientSelection;
      capture: FigmaCapturePacket;
      gradientId: string;
      frame: NativeGradientComparisonFrame;
    }
);
export interface GradientWorkerValue {
  selection: GradientSelection;
  portable: ReturnType<typeof guidelineSelectedGradientExports>;
}
export interface CompositionGradientWorkerValue {
  binding: GuidelineCompositionGradientBinding;
  original: GradientWorkerValue;
  fidelity: GradientFidelityV2 | null;
  exportable: boolean;
}
export type VerifiedGradientSuggestions = Omit<GuidelineGradientSuggestions, 'directions'> & {
  directions: (GuidelineGradientSuggestions['directions'][number] & {
    verified: GradientWorkerValue;
  })[];
};
export type GradientWorkerResult =
  | { kind: 'gradient'; value: GradientWorkerValue }
  | { kind: 'suggestions'; value: VerifiedGradientSuggestions }
  | { kind: 'composition'; value: CompositionGradientWorkerValue }
  | { kind: 'comparison'; value: NativeGradientComparison; verified: GradientWorkerValue };

// Model content is validated against its own hash by the source-bound readers in the worker.
export function gradientWorkerRequestHash(request: GradientWorkerRequest): string {
  return guidelineHash({
    ...request,
    review: { modelHash: request.review.model.modelHash, reviewHash: request.review.reviewHash },
  });
}
function verify(
  review: ModeGradientReview,
  selection: GradientSelection,
  nativeSources: readonly GuidelineNativeGradientSource[] = []
): GradientWorkerValue {
  const portable = guidelineSelectedGradientExports(review, selection, nativeSources);
  return { selection, portable };
}

/** Worker-only execution: no timer yield can interrupt one numerical assessment on the UI thread. */
export async function executeGradientWorkerRequest(
  request: GradientWorkerRequest
): Promise<GradientWorkerResult> {
  record(request, [
    'operation',
    'review',
    ...('nativeContext' in request ? ['nativeContext'] : []),
    ...(request.operation === 'native-edit'
      ? ['source', 'controls']
      : request.operation === 'generate'
        ? ['controls', 'policy', 'catalog']
        : request.operation === 'verify'
          ? ['selection']
          : request.operation === 'compare'
            ? ['selection', 'capture', 'gradientId', 'frame']
            : request.operation === 'composition'
              ? ['gradient', 'workingModel']
              : ['request']),
  ]);
  const native =
    request.operation === 'native-edit' ||
    ('selection' in request && isGuidelineNativeGradient(request.selection)) ||
    (request.operation === 'composition' && isGuidelineNativeGradient(request.gradient.selection));
  if (!!request.nativeContext !== native)
    throw new Error('Native gradient operations require their current source context.');
  const sources = native
    ? await readGuidelineNativeGradientContext(request.nativeContext, request.review)
    : [];
  if (request.operation === 'native-edit') {
    const source = resolveGuidelineNativeGradientSource(request.source, request.review, sources);
    const selection = createGuidelineNativeGradient(request.review, source, request.controls);
    return { kind: 'gradient', value: verify(request.review, selection, sources) };
  }
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
    return { kind: 'gradient', value: verify(request.review, request.selection, sources) };
  if (request.operation === 'composition') {
    const binding = bindGuidelineCompositionGradient(
      request.review,
      request.gradient,
      request.workingModel,
      sources
    );
    const original = verify(request.review, request.gradient.selection, sources);
    const fidelity = isNativeLinearPaintV1(binding.paint)
      ? null
      : assessGradientDesignFidelityV2(binding.paint, {
          maximumMappingStatesPerInterval: 32,
        });
    return {
      kind: 'composition',
      value: {
        binding,
        original,
        fidelity,
        exportable:
          original.portable.exportable &&
          (isNativeLinearPaintV1(binding.paint) || fidelity?.status === 'pass'),
      },
    };
  }
  if (request.operation === 'compare') {
    const inventory = await createFigmaNativeInventory(request.capture);
    const evidence = figmaNativeGradients(inventory).find(item => item.id === request.gradientId);
    if (!evidence) throw new Error('The selected native gradient is missing from its capture.');
    const verified = verify(request.review, request.selection, sources);
    return {
      kind: 'comparison',
      value: composeNativeGradientComparison(
        request.review,
        verified.selection,
        evidence,
        request.frame,
        verified.portable
      ),
      verified,
    };
  }
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
