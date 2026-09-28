import {
  gradientWorkerRequestHash,
  GRADIENT_WORKER_VERSION,
  type GradientWorkerRequest,
  type GradientWorkerResult,
  type GradientWorkerValue,
} from './gradientWorkerOperations';
import {
  CONTINUOUS_GRADIENT_VERSION,
  GUIDELINE_DECORATIVE_GRADIENT_POLICY,
  isGuidelineAuthoredGradient,
  readGuidelineAuthoredGradient,
  authoredGradientControls,
  guidelineGradientAssessmentPolicy,
  type GuidelineContinuousGradientSelection,
} from './authoredGradient';
import {
  GRADIENT_REFERENCE_V2,
  gradientPaintHashV2,
} from '../../../../src/lib/colorSystemGradientDesignV2';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { guidelineHash } from './review';
import GradientWorker from './gradient.worker?worker&inline';
import { GRADIENT_FIDELITY_TOLERANCE_V2 } from '../../../../src/lib/colorSystemGradientFidelityV2';
import {
  GRADIENT_ASSESSMENT_V1,
  GRADIENT_RENDER_ALLOWANCE_V1,
} from '../../../../src/lib/colorSystemGradientAssessmentV1';

let serial = 0;
// Only this worker client admits receipts. Saved JSON or an object with matching fields cannot.
const admitted = new WeakSet<object>();
export function hasGradientWorkerVerification(value: GradientWorkerValue): boolean {
  return admitted.has(value);
}

function acceptValue(
  request: GradientWorkerRequest,
  value: GradientWorkerValue
): GradientWorkerValue {
  if (!value || !value.selection || !value.portable)
    throw new Error('Missing gradient verification.');
  const selection = value.selection,
    portable = value.portable;
  if (selection.design.sourceModelHash !== request.review.model.modelHash)
    throw new Error('Gradient source changed.');
  if (
    isGuidelineAuthoredGradient(selection) &&
    selection.schemaVersion === CONTINUOUS_GRADIENT_VERSION
  ) {
    const verified = readGuidelineAuthoredGradient(
      request.review,
      selection
    ) as GuidelineContinuousGradientSelection;
    const fidelity = portable.fidelity,
      assessment = portable.assessment;
    const policy = guidelineGradientAssessmentPolicy(
      request.review,
      verified.modeId,
      verified.policy
    );
    if (
      !fidelity ||
      !assessment ||
      fidelity.schemaVersion !== 'teul.gradient-fidelity.v2' ||
      fidelity.designHash !== verified.design.designHash ||
      fidelity.candidatePaintHash !== gradientPaintHashV2(verified.design) ||
      fidelity.numericalProfile.referenceVersion !== GRADIENT_REFERENCE_V2 ||
      fidelity.numericalProfile.nativeCoordinateAllowance !== 0 ||
      fidelity.numericalProfile.arithmetic !== 'outward-intervals' ||
      fidelity.numericalProfile.renderingQualification !== 'not-qualified' ||
      fidelity.scope !== 'mathematical-route-v2-versus-canonical-paint' ||
      assessment.schemaVersion !== GRADIENT_ASSESSMENT_V1 ||
      assessment.profile !== 'canonical-opaque-srgb' ||
      assessment.renderingChannelAllowance !== GRADIENT_RENDER_ALLOWANCE_V1 ||
      assessment.idealPath !== 'not-certified' ||
      assessment.designHash !== verified.design.designHash ||
      assessment.policyHash !== guidelineHash(policy) ||
      !['pass', 'fail', 'unassessed'].includes(fidelity.status) ||
      !['pass', 'fail', 'unassessed'].includes(assessment.status) ||
      (fidelity.status === 'pass' &&
        (fidelity.reason !== 'bounded' ||
          fidelity.witness !== null ||
          typeof fidelity.maximumDeltaEOKUpperBound !== 'number' ||
          !Number.isFinite(fidelity.maximumDeltaEOKUpperBound) ||
          fidelity.maximumDeltaEOKUpperBound < 0 ||
          fidelity.maximumDeltaEOKUpperBound > fidelity.toleranceDeltaEOK ||
          fidelity.toleranceDeltaEOK !== GRADIENT_FIDELITY_TOLERANCE_V2)) ||
      portable.exportable !== (fidelity.status === 'pass' && assessment.status === 'pass')
    )
      throw new Error('Gradient verification does not bind its paint and policy.');
    if (
      request.operation === 'generate' &&
      (canonicalJson(authoredGradientControls(verified)) !== canonicalJson(request.controls) ||
        canonicalJson(verified.catalog) !== canonicalJson(request.catalog) ||
        canonicalJson(verified.policy) !==
          canonicalJson(request.policy ?? GUIDELINE_DECORATIVE_GRADIENT_POLICY))
    )
      throw new Error('Gradient generation changed its controls.');
  } else if (request.operation !== 'verify')
    throw new Error('New gradients require continuous verification.');
  if (
    request.operation === 'verify' &&
    canonicalJson(selection) !== canonicalJson(request.selection)
  )
    throw new Error('Gradient verification substituted a different selection.');
  for (const field of ['previewCss', 'svg', 'css', 'json'] as const)
    if (typeof portable[field] !== 'string' || portable[field].length > 256000)
      throw new Error('Invalid gradient output.');
  const accepted = freeze(value);
  admitted.add(accepted);
  return accepted;
}

/** Every call owns one worker; termination makes expensive synchronous math cancellable. */
export function runGradientWorker(
  request: GradientWorkerRequest,
  signal?: AbortSignal
): Promise<GradientWorkerResult> {
  signal?.throwIfAborted();
  const requestHash = gradientWorkerRequestHash(request),
    id = ++serial;
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new GradientWorker();
    } catch {
      reject(new Error('Gradient workers are unavailable. Your saved work is unchanged.'));
      return;
    }
    let settled = false;
    const finish = (error: Error | null, value?: GradientWorkerResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      worker.onmessage = null;
      worker.onmessageerror = null;
      worker.onerror = null;
      worker.terminate();
      if (error) reject(error);
      else resolve(value!);
    };
    const cancel = () => finish(new DOMException('Gradient verification cancelled.', 'AbortError'));
    const timer = setTimeout(
      () =>
        finish(new Error('Gradient verification timed out. Try a shorter route or closer colors.')),
      30000
    );
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onerror = event => {
      event.preventDefault();
      finish(new Error('Gradient worker failed. Try again.'));
    };
    worker.onmessageerror = () => finish(new Error('Gradient worker response could not be read.'));
    worker.onmessage = ({ data }) => {
      if (settled) return;
      try {
        if (data?.version !== GRADIENT_WORKER_VERSION)
          throw new Error('Unsupported gradient worker response.');
        if (data.type === 'ready') {
          worker.postMessage({ version: GRADIENT_WORKER_VERSION, id, requestHash, request });
          return;
        }
        if (data.id !== id || data.requestHash !== requestHash)
          throw new Error('Gradient worker response is stale.');
        if (data.type === 'started') return;
        if (data.type === 'error')
          throw new Error(
            typeof data.message === 'string' ? data.message : 'Gradient verification failed.'
          );
        if (data.type !== 'result' || !data.result)
          throw new Error('Invalid gradient worker response.');
        const result = data.result as GradientWorkerResult;
        if (request.operation === 'suggest') {
          if (
            result.kind !== 'suggestions' ||
            !Array.isArray(result.value.directions) ||
            result.value.directions.length > 3 ||
            canonicalJson(result.value.request) !== canonicalJson(request.request)
          )
            throw new Error('Gradient suggestions changed their request.');
          for (const direction of result.value.directions) {
            if (canonicalJson(direction.selection) !== canonicalJson(direction.verified.selection))
              throw new Error('Gradient suggestion changed its selected paint.');
            acceptValue(request, direction.verified);
            if (!direction.verified.portable.exportable)
              throw new Error('An unchecked suggestion was returned.');
          }
        } else {
          if (result.kind !== 'gradient') throw new Error('Invalid gradient result.');
          acceptValue(request, result.value);
        }
        finish(null, freeze(result));
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Gradient response failed.'));
      }
    };
  });
}
