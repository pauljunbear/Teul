import { isGuidelineNativeGradient } from './nativeGradientSelection';
import {
  guidelineNativeGradientContext,
  type GuidelineNativeGradientSource,
} from './nativeGradientWorkspace';
import {
  captureColorSystemModelV1,
  type ColorSystemModelV1,
} from '../../../../src/lib/colorSystemModelV1';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import {
  readGuidelineCompositionGradient,
  type GuidelineCompositionGradient,
} from './compositionGradient';
import {
  executeGradientWorkerRequest,
  type CompositionGradientWorkerValue,
  type GradientWorkerRequest,
} from './gradientWorkerOperations';
import type { ModeGradientReview } from './modeGradient';

/** Fresh numerical work stays cancellable in browsers; saved receipts cannot authorize export. */
export async function verifyGuidelineCompositionGradient(
  review: ModeGradientReview,
  gradient: GuidelineCompositionGradient,
  workingModel: ColorSystemModelV1,
  signal?: AbortSignal,
  nativeSources: readonly GuidelineNativeGradientSource[] = []
): Promise<CompositionGradientWorkerValue> {
  signal?.throwIfAborted();
  const request: GradientWorkerRequest = {
    operation: 'composition',
    ...(isGuidelineNativeGradient(gradient.selection)
      ? {
          nativeContext: guidelineNativeGradientContext(
            gradient.selection.source,
            review,
            nativeSources
          ),
        }
      : {}),
    review: freeze({
      model: captureColorSystemModelV1(review.model),
      reviewHash: review.reviewHash,
    }),
    gradient: readGuidelineCompositionGradient(gradient),
    workingModel: captureColorSystemModelV1(workingModel),
  };
  const browser = typeof window !== 'undefined';
  const client = browser ? await import('./gradientWorkerClient') : null;
  signal?.throwIfAborted();
  const result = client
    ? await client.runGradientWorker(request, signal, nativeSources)
    : await executeGradientWorkerRequest(request);
  signal?.throwIfAborted();
  if (
    result.kind !== 'composition' ||
    (client && !client.hasCompositionGradientWorkerVerification(result.value))
  )
    throw new Error('Composition gradient verification was not admitted.');
  return freeze(result.value);
}
