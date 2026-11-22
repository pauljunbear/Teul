import { isNativeLinearPaintV1 } from '../../../../src/lib/colorSystemFinalGradientPaintV1';
import {
  isGuidelineNativeGradient,
  createGuidelineNativeGradient,
  readGuidelineNativeGradient,
} from './nativeGradientSelection';
import { guidelineNativeGradientExports } from './gradientExport';
import {
  guidelineNativeGradientContext,
  resolveGuidelineNativeGradientSource,
  type GuidelineNativeGradientSource,
} from './nativeGradientWorkspace';
import {
  gradientWorkerRequestHash,
  GRADIENT_WORKER_VERSION,
  type GradientWorkerRequest,
  type GradientWorkerResult,
  type GradientWorkerValue,
  type CompositionGradientWorkerValue,
} from './gradientWorkerOperations';
import {
  CONTINUOUS_GRADIENT_VERSION,
  AUTHORED_GRADIENT_VERSION,
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
  type GradientDesignV2,
} from '../../../../src/lib/colorSystemGradientDesignV2';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { guidelineHash } from './review';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { createFigmaNativeInventory } from './figmaInventory';
import { figmaNativeGradients } from './nativeGradient';
import {
  composeNativeGradientComparison,
  type NativeGradientComparison,
} from './nativeGradientComparison';
import GradientWorker from './gradient.worker?worker&inline';
import {
  GRADIENT_FIDELITY_TOLERANCE_V2,
  type GradientFidelityV2,
} from '../../../../src/lib/colorSystemGradientFidelityV2';
import {
  GRADIENT_ASSESSMENT_V1,
  GRADIENT_RENDER_ALLOWANCE_V1,
} from '../../../../src/lib/colorSystemGradientAssessmentV1';
import { bindGuidelineCompositionGradient } from './compositionGradient';
import { record } from '../../../../services/guideline-intake/src/protocol';

let serial = 0;
// Only this worker client admits receipts. Saved JSON or an object with matching fields cannot.
const admitted = new WeakSet<object>();
const comparisons = new WeakSet<object>();
const compositions = new WeakSet<object>();
export function hasCompositionGradientWorkerVerification(
  value: CompositionGradientWorkerValue
): boolean {
  return compositions.has(value);
}
export function hasGradientWorkerVerification(value: GradientWorkerValue): boolean {
  return admitted.has(value);
}
export function hasNativeGradientComparisonVerification(value: NativeGradientComparison): boolean {
  return comparisons.has(value);
}

function fidelityMatchesPaint(fidelity: GradientFidelityV2, paint: GradientDesignV2): boolean {
  if (
    fidelity.schemaVersion !== 'teul.gradient-fidelity.v2' ||
    fidelity.designHash !== paint.designHash ||
    fidelity.candidatePaintHash !== gradientPaintHashV2(paint) ||
    fidelity.scope !== 'mathematical-route-v2-versus-canonical-paint' ||
    fidelity.numericalProfile.referenceVersion !== GRADIENT_REFERENCE_V2 ||
    fidelity.numericalProfile.nativeCoordinateAllowance !== 0 ||
    fidelity.numericalProfile.arithmetic !== 'outward-intervals' ||
    fidelity.numericalProfile.renderingQualification !== 'not-qualified' ||
    !['pass', 'fail', 'unassessed'].includes(fidelity.status)
  )
    return false;
  return (
    fidelity.status !== 'pass' ||
    (fidelity.reason === 'bounded' &&
      fidelity.witness === null &&
      typeof fidelity.maximumDeltaEOKUpperBound === 'number' &&
      Number.isFinite(fidelity.maximumDeltaEOKUpperBound) &&
      fidelity.maximumDeltaEOKUpperBound >= 0 &&
      fidelity.maximumDeltaEOKUpperBound <= fidelity.toleranceDeltaEOK &&
      fidelity.toleranceDeltaEOK === GRADIENT_FIDELITY_TOLERANCE_V2)
  );
}

function acceptValue(
  request: GradientWorkerRequest,
  value: GradientWorkerValue,
  admit = true,
  nativeSources: readonly GuidelineNativeGradientSource[] = []
): GradientWorkerValue {
  if (!value || !value.selection || !value.portable)
    throw new Error('Missing gradient verification.');
  const selection = value.selection,
    portable = value.portable;
  if (selection.design.sourceModelHash !== request.review.model.modelHash)
    throw new Error('Gradient source changed.');
  if (isGuidelineNativeGradient(selection)) {
    if (request.operation !== 'native-edit' && request.operation !== 'verify')
      throw new Error('Native paint requires a native edit or verification request.');
    const expected =
      request.operation === 'native-edit'
        ? createGuidelineNativeGradient(
            request.review,
            resolveGuidelineNativeGradientSource(request.source, request.review, nativeSources),
            request.controls
          )
        : readGuidelineNativeGradient(request.review, request.selection, nativeSources)!;
    const context = guidelineNativeGradientContext(expected.source, request.review, nativeSources);
    if (
      canonicalJson(context) !== canonicalJson(request.nativeContext) ||
      canonicalJson(selection) !== canonicalJson(expected) ||
      canonicalJson(portable) !==
        canonicalJson(guidelineNativeGradientExports(request.review, expected, nativeSources))
    )
      throw new Error('Native gradient result changed its source, edit or portable paint.');
    const accepted = freeze(value);
    if (admit) admitted.add(accepted);
    return accepted;
  }
  if (request.operation === 'native-edit' || request.nativeContext)
    throw new Error('Native edit substituted a generated gradient.');
  const policy =
    isGuidelineAuthoredGradient(selection) && selection.schemaVersion !== AUTHORED_GRADIENT_VERSION
      ? guidelineGradientAssessmentPolicy(request.review, selection.modeId, selection.policy)
      : null;
  const textContext = policy?.use.kind === 'text' ? policy.use : null;
  if (
    portable.textContext === undefined ||
    canonicalJson(portable.textContext) !== canonicalJson(textContext)
  )
    throw new Error('Gradient text preview does not match its retained source and policy.');
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
    if (
      !fidelity ||
      !assessment ||
      !fidelityMatchesPaint(fidelity, verified.design) ||
      assessment.schemaVersion !== GRADIENT_ASSESSMENT_V1 ||
      assessment.profile !== 'canonical-opaque-srgb' ||
      assessment.renderingChannelAllowance !== GRADIENT_RENDER_ALLOWANCE_V1 ||
      assessment.idealPath !== 'not-certified' ||
      assessment.designHash !== verified.design.designHash ||
      assessment.policyHash !== guidelineHash(policy) ||
      !['pass', 'fail', 'unassessed'].includes(assessment.status) ||
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
  if (admit) admitted.add(accepted);
  return accepted;
}

function acceptCompositionValue(
  request: Extract<GradientWorkerRequest, { operation: 'composition' }>,
  value: CompositionGradientWorkerValue,
  nativeSources: readonly GuidelineNativeGradientSource[]
) {
  record(value, ['binding', 'original', 'fidelity', 'exportable']);
  const binding = bindGuidelineCompositionGradient(
    request.review,
    request.gradient,
    request.workingModel,
    nativeSources
  );
  if (canonicalJson(value.binding) !== canonicalJson(binding))
    throw new Error('Composition gradient changed its retained paint or source binding.');
  const original = acceptValue(
    {
      operation: 'verify',
      review: request.review,
      selection: request.gradient.selection,
      ...(request.nativeContext ? { nativeContext: request.nativeContext } : {}),
    },
    value.original,
    false,
    nativeSources
  );
  if (isNativeLinearPaintV1(binding.paint)) {
    if (value.fidelity !== null || value.exportable !== original.portable.exportable)
      throw new Error('Native geometry cannot claim generated-route fidelity.');
    const accepted = freeze(value);
    admitted.add(original);
    compositions.add(accepted);
    return accepted;
  }
  if (!value.fidelity)
    throw new Error('Generated composition paint requires fidelity verification.');
  const fidelity = value.fidelity;
  record(fidelity, [
    'schemaVersion',
    'designHash',
    'candidatePaintHash',
    'status',
    'scope',
    'toleranceDeltaEOK',
    'maximumDeltaEOKUpperBound',
    'witness',
    'numericalProfile',
    'budget',
    'visitedIntervals',
    'boundedIntervals',
    'mappingStates',
    'centeredIntervals',
    'reason',
  ]);
  record(fidelity.numericalProfile, [
    'arithmetic',
    'referenceVersion',
    'nativeCoordinateAllowance',
    'renderingQualification',
  ]);
  record(fidelity.budget, [
    'maximumIntervals',
    'maximumDepth',
    'maximumMappingStatesPerInterval',
    'maximumMappingStates',
  ]);
  const counts = [
    fidelity.visitedIntervals,
    fidelity.boundedIntervals,
    fidelity.mappingStates,
    fidelity.centeredIntervals,
  ];
  if (
    !fidelityMatchesPaint(fidelity, binding.paint) ||
    fidelity.toleranceDeltaEOK !== GRADIENT_FIDELITY_TOLERANCE_V2 ||
    canonicalJson(fidelity.budget) !==
      canonicalJson({
        maximumIntervals: 8192,
        maximumDepth: 24,
        maximumMappingStatesPerInterval: 32,
        maximumMappingStates: 65536,
      }) ||
    counts.some(n => !Number.isSafeInteger(n) || n < 0) ||
    fidelity.visitedIntervals > fidelity.budget.maximumIntervals ||
    fidelity.boundedIntervals > fidelity.visitedIntervals ||
    fidelity.centeredIntervals > fidelity.boundedIntervals
  )
    throw new Error('Composition gradient fidelity does not bind its paint and numerical profile.');
  if (fidelity.status === 'pass') {
    if (
      fidelity.boundedIntervals === 0 ||
      fidelity.mappingStates > fidelity.budget.maximumMappingStates
    )
      throw new Error('Invalid composition gradient fidelity pass.');
  } else if (fidelity.status === 'fail') {
    record(fidelity.witness, ['position', 'deltaEOKLowerBound']);
    if (
      fidelity.reason !== 'witness-exceeds-tolerance' ||
      fidelity.maximumDeltaEOKUpperBound !== null ||
      !Number.isFinite(fidelity.witness.position) ||
      fidelity.witness.position < 0 ||
      fidelity.witness.position > 1 ||
      !Number.isFinite(fidelity.witness.deltaEOKLowerBound) ||
      fidelity.witness.deltaEOKLowerBound <= fidelity.toleranceDeltaEOK
    )
      throw new Error('Invalid composition gradient fidelity failure.');
  } else if (
    fidelity.witness !== null ||
    fidelity.maximumDeltaEOKUpperBound !== null ||
    !['interval-budget', 'mapping-budget', 'depth-budget', 'numerical-domain'].includes(
      fidelity.reason
    )
  )
    throw new Error('Invalid unresolved composition gradient fidelity.');
  if (value.exportable !== (original.portable.exportable && fidelity.status === 'pass'))
    throw new Error('Composition gradient exportability changed.');
  const accepted = freeze(value);
  admitted.add(original);
  compositions.add(accepted);
  return accepted;
}

/** Every call owns one worker; termination makes expensive synchronous math cancellable. */
export function runGradientWorker(
  request: GradientWorkerRequest,
  signal?: AbortSignal,
  nativeSources: readonly GuidelineNativeGradientSource[] = []
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
    worker.onmessage = async ({ data }) => {
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
        if (gradientWorkerRequestHash(request) !== requestHash)
          throw new Error('Gradient request changed while checking it.');
        if (request.operation === 'composition') {
          if (result.kind !== 'composition')
            throw new Error('Invalid composition gradient result.');
          if (gradientWorkerRequestHash(request) !== requestHash)
            throw new Error('Composition gradient request changed while checking it.');
          acceptCompositionValue(request, result.value, nativeSources);
        } else if (request.operation === 'compare') {
          if (result.kind !== 'comparison') throw new Error('Invalid native comparison result.');
          const original = canonicalIntakeJson(result.value, 16 * 1024 * 1024);
          const inventory = await createFigmaNativeInventory(request.capture);
          if (settled) return;
          if (gradientWorkerRequestHash(request) !== requestHash)
            throw new Error('Native comparison request changed while checking it.');
          const evidence = figmaNativeGradients(inventory).find(
            item => item.id === request.gradientId
          );
          if (!evidence)
            throw new Error('The selected native gradient is missing from its capture.');
          const verified = acceptValue(
            {
              operation: 'verify',
              review: request.review,
              selection: request.selection,
              ...(request.nativeContext ? { nativeContext: request.nativeContext } : {}),
            },
            result.verified,
            false,
            nativeSources
          );
          const rebuilt = composeNativeGradientComparison(
            request.review,
            verified.selection,
            evidence,
            request.frame,
            verified.portable
          );
          if (original !== canonicalIntakeJson(rebuilt, 16 * 1024 * 1024))
            throw new Error(
              'Native comparison does not match its source, proposal or composition.'
            );
          admitted.add(verified);
          comparisons.add(result.value);
        } else if (request.operation === 'suggest') {
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
          acceptValue(request, result.value, true, nativeSources);
        }
        finish(null, freeze(result));
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Gradient response failed.'));
      }
    };
  });
}
