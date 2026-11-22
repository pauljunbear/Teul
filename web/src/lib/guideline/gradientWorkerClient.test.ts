import { nativeGradientEditFixture } from '../../../fixtures/guidelines/native-gradient-edit-fixture';
import { createGuidelineNativeGradient } from './nativeGradientSelection';
import { guidelineNativeGradientContext } from './nativeGradientWorkspace';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../fixtures/guidelines/figma-project-v1.json';
import { readFigmaProject } from './figmaProject';
import {
  runGradientWorker,
  hasGradientWorkerVerification,
  hasNativeGradientComparisonVerification,
  hasCompositionGradientWorkerVerification,
} from './gradientWorkerClient';
import { nativeGradientComparisonFixture } from '../../../fixtures/guidelines/native-gradient-comparison-fixture';
import { guidelineHash } from './review';
import * as gradientAssessment from '../../../../src/lib/colorSystemGradientAssessmentV1';
import * as gradientFidelity from '../../../../src/lib/colorSystemGradientFidelityV2';
import { buildColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { readGuidelineCompositionGradient } from './compositionGradient';
import { verifyGuidelineCompositionGradient } from './compositionGradientVerification';
import {
  executeGradientWorkerRequest,
  gradientWorkerRequestHash,
  GRADIENT_WORKER_VERSION,
  type GradientWorkerRequest,
  type GradientWorkerResult,
  type GradientWorkerValue,
} from './gradientWorkerOperations';

type Message = Record<string, any>;
type Result = Extract<GradientWorkerResult, { kind: 'gradient' }>;
type GenerateRequest = Extract<GradientWorkerRequest, { operation: 'generate' }>;
type CompareRequest = Extract<GradientWorkerRequest, { operation: 'compare' }>;
type Compared = Extract<GradientWorkerResult, { kind: 'comparison' }>;
class ControlledWorker {
  static instances: ControlledWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: Message[] = [];
  terminate = vi.fn();
  postMessage = vi.fn((data: Message) => {
    this.sent.push(structuredClone(data));
  });
  constructor() {
    ControlledWorker.instances.push(this);
  }
  emit(data: Message) {
    this.onmessage?.({ data } as MessageEvent);
  }
  ready() {
    this.emit({ version: GRADIENT_WORKER_VERSION, type: 'ready' });
  }
  response(result: GradientWorkerResult, override: Message = {}) {
    const sent = this.sent[0];
    return {
      version: GRADIENT_WORKER_VERSION,
      id: sent.id,
      requestHash: sent.requestHash,
      type: 'result',
      result,
      ...override,
    };
  }
}
let request: GenerateRequest;
let generated: Result;
let alternate: Result;
let failed: Result;
let comparisonRequest: CompareRequest;
let compared: Compared;
let compositionRequest: Extract<GradientWorkerRequest, { operation: 'composition' }>;
let composition: Extract<GradientWorkerResult, { kind: 'composition' }>;
async function execute(value: GradientWorkerRequest): Promise<Result> {
  const result = await executeGradientWorkerRequest(value);
  if (result.kind !== 'gradient') throw new Error('Unexpected fixture result');
  return result;
}
beforeAll(async () => {
  const source = await readFigmaProject(fixture);
  if (source.status !== 'opened' || !source.project.review) throw new Error('Fixture');
  const review = source.project.review;
  const colorId = review.model.colors[0].id;
  request = {
    operation: 'generate',
    review,
    controls: {
      scope: 'brand',
      modeId: review.model.modes[0].id,
      angle: 120,
      route: { space: 'oklab' },
      stops: [0, 1].map(position => ({ colorId, position, locked: true })),
    },
    policy: null,
    catalog: null,
  };
  generated = await execute(request);
  alternate = await execute({ ...request, controls: { ...request.controls, angle: 45 } });
  failed = await execute({
    ...request,
    policy: {
      origin: 'designer-authored',
      use: {
        kind: 'text',
        foregroundColorId: colorId,
        minimumRatio: 4.5,
        footprint: { start: 0, end: 1 },
      },
      limits: [],
    },
  });
  expect(generated.value.portable.exportable).toBe(true);
  expect(failed.value.portable.assessment?.status).toBe('fail');
  const native = await nativeGradientComparisonFixture();
  comparisonRequest = {
    operation: 'compare',
    review: native.review,
    selection: native.selection,
    capture: native.inventory.packet,
    gradientId: native.evidence.id,
    frame: { width: 400, height: 240, interpretation: 'srgb' },
  };
  const result = await executeGradientWorkerRequest(comparisonRequest);
  if (result.kind !== 'comparison') throw new Error('Unexpected comparison fixture result');
  compared = result;
  const { modelHash: _modelHash, ...content } = review.model;
  compositionRequest = {
    operation: 'composition',
    review,
    gradient: readGuidelineCompositionGradient({ selection: generated.value.selection }),
    workingModel: buildColorSystemModelV1({
      ...content,
      modes: content.modes.map(mode => ({ ...mode, label: mode.label + ' working model' })),
    }),
  };
  const mixed = await executeGradientWorkerRequest(compositionRequest);
  if (mixed.kind !== 'composition') throw new Error('Expected composition fixture');
  composition = mixed;
});
beforeEach(() => {
  ControlledWorker.instances = [];
  vi.stubGlobal('Worker', ControlledWorker);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function start(value: GradientWorkerRequest = request, signal?: AbortSignal) {
  const pending = runGradientWorker(value, signal);
  const worker = ControlledWorker.instances.at(-1)!;
  worker.ready();
  expect(worker.sent).toHaveLength(1);
  expect(worker.sent[0].requestHash).toBe(gradientWorkerRequestHash(value));
  return { pending, worker };
}
function cleaned(worker: ControlledWorker) {
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(worker.onmessage).toBeNull();
  expect(worker.onmessageerror).toBeNull();
  expect(worker.onerror).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
}

describe('gradient worker admission', () => {
  it('admits only a received verified object, freezes it and refuses copied saved success', async () => {
    expect(hasGradientWorkerVerification(generated.value)).toBe(false);
    const { pending, worker } = start();
    const received = structuredClone(generated);
    worker.emit(worker.response(received));
    const result = await pending;
    if (result.kind !== 'gradient') throw new Error('Unexpected result');
    expect(result).toEqual(generated);
    expect(hasGradientWorkerVerification(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.portable)).toBe(true);
    expect(hasGradientWorkerVerification(structuredClone(result.value))).toBe(false);
    expect(hasGradientWorkerVerification(JSON.parse(JSON.stringify(result.value)))).toBe(false);
    cleaned(worker);
  });

  it('admits a real failed assessment as nonexportable retained work', async () => {
    const value = structuredClone(failed);
    const { pending, worker } = start({
      operation: 'verify',
      review: request.review,
      selection: value.value.selection,
    });
    worker.emit(worker.response(value));
    const result = await pending;
    if (result.kind !== 'gradient') throw new Error('Unexpected result');
    expect(result.value.portable.exportable).toBe(false);
    expect(result.value.portable.textContext).toMatchObject({
      kind: 'text',
      minimumRatio: 4.5,
      footprint: { start: 0, end: 1 },
    });
    expect(result.value.portable.textContext?.foreground).toEqual(
      request.review.model.colors[0].valuesByMode[request.controls.modeId]
    );
    expect(JSON.parse(result.value.portable.json)).not.toHaveProperty('textContext');
    expect(hasGradientWorkerVerification(result.value)).toBe(true);
    cleaned(worker);
  });

  it.each([
    [
      'foreground',
      (context: Message) => {
        context.foreground = null;
      },
    ],
    [
      'coverage',
      (context: Message) => {
        context.footprint = { start: 0.5, end: 1 };
      },
    ],
    [
      'target',
      (context: Message) => {
        context.minimumRatio = 3;
      },
    ],
  ])('rejects substituted text preview %s', async (_name, mutate) => {
    const value = structuredClone(failed);
    const { pending, worker } = start({
      operation: 'verify',
      review: request.review,
      selection: value.value.selection,
    });
    mutate(value.value.portable.textContext!);
    worker.emit(worker.response(value));
    await expect(pending).rejects.toThrow('text preview');
    expect(hasGradientWorkerVerification(value.value)).toBe(false);
    cleaned(worker);
  });

  it.each(['fabricated', 'missing'] as const)(
    'rejects %s text context on decorative work',
    async kind => {
      const { pending, worker } = start();
      const value = structuredClone(generated);
      if (kind === 'fabricated')
        value.value.portable.textContext = failed.value.portable.textContext;
      else delete (value.value.portable as Message).textContext;
      worker.emit(worker.response(value));
      await expect(pending).rejects.toThrow();
      expect(hasGradientWorkerVerification(value.value)).toBe(false);
      cleaned(worker);
    }
  );

  it.each([
    ['worker version', { version: 'teul.gradient-worker.v99' }],
    ['request ID', { id: -1 }],
    ['request hash', { requestHash: 'sha256:' + '0'.repeat(64) }],
    ['message type', { type: 'cached' }],
    ['missing result', { result: null }],
  ])('rejects a mismatched %s', async (_name, override) => {
    const { pending, worker } = start();
    const value = structuredClone(generated);
    worker.emit(worker.response(value, override));
    await expect(pending).rejects.toThrow();
    expect(hasGradientWorkerVerification(value.value)).toBe(false);
    cleaned(worker);
  });

  const mutations: [string, (value: Message) => void][] = [
    [
      'source',
      value => {
        value.selection.design.sourceModelHash = 'sha256:' + '0'.repeat(64);
      },
    ],
    [
      'fidelity version',
      value => {
        value.portable.fidelity.schemaVersion = 'teul.gradient-fidelity.v1';
      },
    ],
    [
      'fidelity design',
      value => {
        value.portable.fidelity.designHash = 'sha256:' + '0'.repeat(64);
      },
    ],
    [
      'paint',
      value => {
        value.portable.fidelity.candidatePaintHash = 'sha256:' + '0'.repeat(64);
      },
    ],
    [
      'reference',
      value => {
        value.portable.fidelity.numericalProfile.referenceVersion =
          'teul.gradient-reference-route.v1';
      },
    ],
    [
      'arithmetic profile',
      value => {
        value.portable.fidelity.numericalProfile.arithmetic = 'sampled';
      },
    ],
    [
      'coordinate allowance',
      value => {
        value.portable.fidelity.numericalProfile.nativeCoordinateAllowance = 1e-10;
      },
    ],
    [
      'rendering qualification',
      value => {
        value.portable.fidelity.numericalProfile.renderingQualification = 'qualified';
      },
    ],
    [
      'fidelity scope',
      value => {
        value.portable.fidelity.scope = 'sampled-native-route';
      },
    ],
    [
      'assessment version',
      value => {
        value.portable.assessment.schemaVersion = 'teul.gradient-assessment.v99';
      },
    ],
    [
      'assessment design',
      value => {
        value.portable.assessment.designHash = 'sha256:' + '0'.repeat(64);
      },
    ],
    [
      'policy',
      value => {
        value.portable.assessment.policyHash = 'sha256:' + '0'.repeat(64);
      },
    ],
    [
      'assessment profile',
      value => {
        value.portable.assessment.profile = 'unbounded-srgb';
      },
    ],
    [
      'assessment allowance',
      value => {
        value.portable.assessment.renderingChannelAllowance = 0;
      },
    ],
    [
      'ideal-path claim',
      value => {
        value.portable.assessment.idealPath = 'certified';
      },
    ],
    [
      'fidelity status',
      value => {
        value.portable.fidelity.status = 'approved';
      },
    ],
    [
      'assessment status',
      value => {
        value.portable.assessment.status = 'approved';
      },
    ],
    [
      'nonfinite bound',
      value => {
        value.portable.fidelity.maximumDeltaEOKUpperBound = Infinity;
      },
    ],
    [
      'negative bound',
      value => {
        value.portable.fidelity.maximumDeltaEOKUpperBound = -1;
      },
    ],
    [
      'bound over tolerance',
      value => {
        value.portable.fidelity.maximumDeltaEOKUpperBound = 0.006;
      },
    ],
    [
      'relaxed tolerance',
      value => {
        value.portable.fidelity.toleranceDeltaEOK = 0.005;
      },
    ],
    [
      'pass reason',
      value => {
        value.portable.fidelity.reason = 'interval-budget';
      },
    ],
    [
      'pass witness',
      value => {
        value.portable.fidelity.witness = { position: 0.5, deltaEOKLowerBound: 0.006 };
      },
    ],
    [
      'exportability',
      value => {
        value.portable.exportable = false;
      },
    ],
    [
      'output type',
      value => {
        value.portable.css = null;
      },
    ],
    [
      'output size',
      value => {
        value.portable.json = 'x'.repeat(256001);
      },
    ],
  ];
  it.each(mutations)('rejects a mismatched %s receipt', async (_name, mutate) => {
    const { pending, worker } = start();
    const value = structuredClone(generated);
    mutate(value.value);
    worker.emit(worker.response(value));
    await expect(pending).rejects.toThrow();
    expect(hasGradientWorkerVerification(value.value)).toBe(false);
    cleaned(worker);
  });

  it('rejects a valid report for changed generation controls or a substituted verification selection', async () => {
    for (const input of [
      request,
      {
        operation: 'verify' as const,
        review: request.review,
        selection: generated.value.selection,
      },
    ]) {
      const { pending, worker } = start(input);
      const value = structuredClone(alternate);
      worker.emit(worker.response(value));
      await expect(pending).rejects.toThrow(/controls|different selection/);
      expect(hasGradientWorkerVerification(value.value)).toBe(false);
      cleaned(worker);
    }
  });
});

describe('native comparison worker admission', () => {
  it('rebuilds source and finite composition without rerunning numerical assessment on the main thread', async () => {
    const assessment = vi.spyOn(gradientAssessment, 'assessGradientPaintV2');
    const fidelity = vi.spyOn(gradientFidelity, 'assessGradientDesignFidelityV2');
    const { pending, worker } = start(comparisonRequest);
    const received = structuredClone(compared);
    expect(hasNativeGradientComparisonVerification(received.value)).toBe(false);
    worker.emit(worker.response(received));
    const result = await pending;
    if (result.kind !== 'comparison') throw new Error('Expected comparison');
    expect(result.value).toEqual(compared.value);
    expect(hasNativeGradientComparisonVerification(result.value)).toBe(true);
    expect(hasNativeGradientComparisonVerification(structuredClone(result.value))).toBe(false);
    expect(hasGradientWorkerVerification(result.verified)).toBe(true);
    expect(Object.isFrozen(result.value.source.paint)).toBe(true);
    expect(assessment).not.toHaveBeenCalled();
    expect(fidelity).not.toHaveBeenCalled();
    cleaned(worker);
  });

  it.each([
    [
      'capture',
      (v: Message) => {
        v.source.captureHash = 'sha256:' + '0'.repeat(64);
      },
    ],
    [
      'gradient ID',
      (v: Message) => {
        v.source.id += '-other';
      },
    ],
    [
      'source channels',
      (v: Message) => {
        v.source.paint.gradientStops[0].color.r = 0.9;
      },
    ],
    [
      'mode',
      (v: Message) => {
        v.proposalModeId = 'other';
      },
    ],
    [
      'selected proposal',
      (v: Message) => {
        v.selectionHash = 'sha256:' + '0'.repeat(64);
      },
    ],
    [
      'frame',
      (v: Message) => {
        v.frame.width = 240;
      },
    ],
    [
      'renderer',
      (v: Message) => {
        v.nativeRenderer = 'other';
      },
    ],
    [
      'content',
      (v: Message) => {
        v.content.artwork.text = 'Approved';
      },
    ],
    [
      'foreground',
      (v: Message) => {
        v.content.foreground.components.r = 0.9;
      },
    ],
    [
      'placement',
      (v: Message) => {
        v.content.placement.left += 2;
      },
    ],
    [
      'source SVG',
      (v: Message) => {
        v.sourceSvg += '<script/>';
      },
    ],
    [
      'proposal SVG',
      (v: Message) => {
        v.proposalSvg += '<script/>';
      },
    ],
    [
      'assessment',
      (v: Message) => {
        v.proposalAssessment.policyHash = 'sha256:' + '0'.repeat(64);
      },
    ],
    [
      'notices',
      (v: Message) => {
        v.notices = [];
      },
    ],
    [
      'status',
      (v: Message) => {
        v.status = 'approved';
      },
    ],
  ])('rejects resealed comparison %s substitution', async (_name, mutate) => {
    const { pending, worker } = start(comparisonRequest);
    const received = structuredClone(compared);
    mutate(received.value);
    const { comparisonHash: _hash, ...body } = received.value;
    received.value.comparisonHash = guidelineHash(body);
    worker.emit(worker.response(received));
    await expect(pending).rejects.toThrow();
    expect(hasNativeGradientComparisonVerification(received.value)).toBe(false);
    expect(hasGradientWorkerVerification(received.verified)).toBe(false);
    cleaned(worker);
  });

  it('derives notices from the source even if both receipt and comparison disclosures are changed', async () => {
    const { pending, worker } = start(comparisonRequest);
    const received = structuredClone(compared);
    received.verified.portable.notices.push('Native source is approved.');
    received.value.notices.push('Native source is approved.');
    const { comparisonHash: _hash, ...body } = received.value;
    received.value.comparisonHash = guidelineHash(body);
    worker.emit(worker.response(received));
    await expect(pending).rejects.toThrow('composition');
    cleaned(worker);
  });

  it('rejects a substituted verified selection and an altered request after dispatch', async () => {
    for (const changeRequest of [false, true]) {
      const input = structuredClone(comparisonRequest);
      const { pending, worker } = start(input);
      const received = structuredClone(compared);
      if (changeRequest) input.frame = { ...input.frame, width: 240 };
      else received.verified = structuredClone(generated.value);
      worker.emit(worker.response(received));
      await expect(pending).rejects.toThrow();
      cleaned(worker);
    }
  });

  it('cancels during asynchronous source replay without admitting a late comparison', async () => {
    const controller = new AbortController();
    const { pending, worker } = start(comparisonRequest, controller.signal);
    const received = structuredClone(compared);
    worker.emit(worker.response(received));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(hasNativeGradientComparisonVerification(received.value)).toBe(false);
    expect(hasGradientWorkerVerification(received.verified)).toBe(false);
    cleaned(worker);
  });

  it('fails worker execution for a missing native gradient or altered capture', async () => {
    await expect(
      executeGradientWorkerRequest({ ...comparisonRequest, gradientId: 'missing' })
    ).rejects.toThrow('missing');
    const capture = structuredClone(comparisonRequest.capture);
    capture.file.name = 'Altered';
    await expect(executeGradientWorkerRequest({ ...comparisonRequest, capture })).rejects.toThrow();
  });
});

describe('composition gradient worker admission', () => {
  it('admits retained paint and fresh derived fidelity without main-thread numerical work', async () => {
    const assessment = vi.spyOn(gradientAssessment, 'assessGradientPaintV2');
    const fidelity = vi.spyOn(gradientFidelity, 'assessGradientDesignFidelityV2');
    const { pending, worker } = start(compositionRequest);
    const received = structuredClone(composition);
    expect(hasCompositionGradientWorkerVerification(received.value)).toBe(false);
    worker.emit(worker.response(received));
    const result = await pending;
    if (result.kind !== 'composition') throw new Error('Expected composition');
    expect(result).toEqual(composition);
    expect(hasCompositionGradientWorkerVerification(result.value)).toBe(true);
    expect(hasCompositionGradientWorkerVerification(structuredClone(result.value))).toBe(false);
    expect(hasGradientWorkerVerification(result.value.original)).toBe(true);
    expect(Object.isFrozen(result.value.binding.paint)).toBe(true);
    expect(assessment).not.toHaveBeenCalled();
    expect(fidelity).not.toHaveBeenCalled();
    cleaned(worker);
  });

  it.each([
    [
      'original selection',
      (v: Message) => {
        v.original.selection = alternate.value.selection;
      },
    ],
    [
      'selection hash',
      (v: Message) => {
        v.binding.selectionHash = 'sha256:' + '0'.repeat(64);
      },
    ],
    [
      'bound design hash',
      (v: Message) => {
        v.binding.boundDesignHash = v.binding.sourceDesignHash;
      },
    ],
    [
      'retained paint',
      (v: Message) => {
        v.binding.paint.compiledPaint.stops[0].position = 0.2;
      },
    ],
    [
      'fidelity design',
      (v: Message) => {
        v.fidelity.designHash = v.binding.sourceDesignHash;
      },
    ],
    [
      'fidelity paint',
      (v: Message) => {
        v.fidelity.candidatePaintHash = v.original.portable.fidelity.candidatePaintHash;
      },
    ],
    [
      'fidelity status',
      (v: Message) => {
        v.fidelity.status = 'approved';
      },
    ],
    [
      'fidelity scope',
      (v: Message) => {
        v.fidelity.scope = 'sampled';
      },
    ],
    [
      'fidelity profile',
      (v: Message) => {
        v.fidelity.numericalProfile.renderingQualification = 'qualified';
      },
    ],
    [
      'fidelity tolerance',
      (v: Message) => {
        v.fidelity.toleranceDeltaEOK = 0.005;
      },
    ],
    [
      'fidelity bound',
      (v: Message) => {
        v.fidelity.maximumDeltaEOKUpperBound = Infinity;
      },
    ],
    [
      'fidelity negative bound',
      (v: Message) => {
        v.fidelity.maximumDeltaEOKUpperBound = -1;
      },
    ],
    [
      'fidelity counts',
      (v: Message) => {
        v.fidelity.visitedIntervals = 0.2;
      },
    ],
    [
      'fidelity budget',
      (v: Message) => {
        v.fidelity.budget.maximumDepth = 100;
      },
    ],
    [
      'fidelity witness',
      (v: Message) => {
        v.fidelity.witness = { position: 0.5, deltaEOKLowerBound: 0.001 };
      },
    ],
    [
      'exportability',
      (v: Message) => {
        v.exportable = false;
      },
    ],
  ])('rejects substituted %s without admitting partial work', async (_name, mutate) => {
    const { pending, worker } = start(compositionRequest);
    const received = structuredClone(composition);
    mutate(received.value);
    worker.emit(worker.response(received));
    await expect(pending).rejects.toThrow();
    expect(hasCompositionGradientWorkerVerification(received.value)).toBe(false);
    expect(hasGradientWorkerVerification(received.value.original)).toBe(false);
    cleaned(worker);
  });

  it('rejects a changed request and cancels composition work without admitting late results', async () => {
    const input = structuredClone(compositionRequest);
    const { pending, worker } = start(input);
    input.gradient.sourceRole = 'changed';
    worker.emit(worker.response(structuredClone(composition)));
    await expect(pending).rejects.toThrow('request changed');
    cleaned(worker);
    const controller = new AbortController();
    const active = start(compositionRequest, controller.signal);
    const late = active.worker.onmessage!;
    controller.abort();
    await expect(active.pending).rejects.toMatchObject({ name: 'AbortError' });
    const received = structuredClone(composition);
    late({ data: active.worker.response(received) } as MessageEvent);
    expect(hasCompositionGradientWorkerVerification(received.value)).toBe(false);
    cleaned(active.worker);
  });

  it('uses the worker in a browser and rejects unavailable workers without a numerical fallback', async () => {
    vi.stubGlobal('window', {});
    const pending = verifyGuidelineCompositionGradient(
      compositionRequest.review,
      compositionRequest.gradient,
      compositionRequest.workingModel
    );
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1));
    const worker = ControlledWorker.instances[0];
    worker.ready();
    worker.emit(worker.response(structuredClone(composition)));
    const accepted = await pending;
    expect(hasCompositionGradientWorkerVerification(accepted)).toBe(true);
    cleaned(worker);
    const fidelity = vi.spyOn(gradientFidelity, 'assessGradientDesignFidelityV2');
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('Unavailable');
        }
      }
    );
    await expect(
      verifyGuidelineCompositionGradient(
        compositionRequest.review,
        compositionRequest.gradient,
        compositionRequest.workingModel
      )
    ).rejects.toThrow('unavailable');
    expect(fidelity).not.toHaveBeenCalled();
  });
});

describe('gradient worker lifecycle', () => {
  it('does not create a worker for an already cancelled request', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => runGradientWorker(request, controller.signal)).toThrow();
    expect(ControlledWorker.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminates active work, removes cancellation listeners and ignores a queued late result', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const { pending, worker } = start(request, controller.signal);
    worker.emit(worker.response(generated, { type: 'started', result: undefined }));
    const late = worker.onmessage!;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    cleaned(worker);
    const value = structuredClone(generated);
    late({ data: worker.response(value) } as MessageEvent);
    expect(hasGradientWorkerVerification(value.value)).toBe(false);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('cleans up after structured-clone dispatch failure', async () => {
    const pending = runGradientWorker(request);
    const worker = ControlledWorker.instances[0];
    worker.postMessage.mockImplementationOnce(() => {
      throw new DOMException('Could not clone the request.', 'DataCloneError');
    });
    worker.ready();
    await expect(pending).rejects.toMatchObject({ name: 'DataCloneError' });
    cleaned(worker);
  });

  it('rejects constructor failure without leaving a timer or worker', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('Unavailable');
        }
      }
    );
    await expect(runGradientWorker(request)).rejects.toThrow('unavailable');
    expect(ControlledWorker.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['worker', 'message', 'operation'] as const)('cleans up a %s failure', async kind => {
    const { pending, worker } = start();
    if (kind === 'worker') {
      const preventDefault = vi.fn();
      worker.onerror!({ preventDefault } as unknown as ErrorEvent);
      expect(preventDefault).toHaveBeenCalledOnce();
    } else if (kind === 'message') worker.onmessageerror!();
    else
      worker.emit(
        worker.response(generated, { type: 'error', message: 'Numerical domain refused.' })
      );
    await expect(pending).rejects.toThrow();
    cleaned(worker);
  });

  it('cleans up a timeout and successfully admits the next fresh request', async () => {
    const { pending, worker } = start();
    const outcome = pending.catch(error => error as Error);
    const late = worker.onmessage!;
    await vi.advanceTimersByTimeAsync(30000);
    expect(await outcome).toMatchObject({ message: expect.stringContaining('timed out') });
    cleaned(worker);
    const lateValue = structuredClone(generated);
    late({ data: worker.response(lateValue) } as MessageEvent);
    expect(hasGradientWorkerVerification(lateValue.value)).toBe(false);
    const recovery = start();
    expect(recovery.worker).not.toBe(worker);
    recovery.worker.emit(recovery.worker.response(structuredClone(generated)));
    const result = await recovery.pending;
    expect(result.kind).toBe('gradient');
    expect(hasGradientWorkerVerification(result.value as GradientWorkerValue)).toBe(true);
    cleaned(recovery.worker);
  });
});

describe('native gradient worker admission', () => {
  async function native() {
    const f = await nativeGradientEditFixture();
    const selection = createGuidelineNativeGradient(f.review, f.sources[0], f.controls);
    const request: GradientWorkerRequest = {
      operation: 'native-edit',
      review: f.review,
      source: selection.source,
      controls: f.controls,
      nativeContext: guidelineNativeGradientContext(selection.source, f.review, f.sources),
    };
    return { ...f, selection, request, result: await executeGradientWorkerRequest(request) };
  }
  it('admits only the exact native result against current sources and retains no fidelity certificate', async () => {
    const f = await native();
    const pending = runGradientWorker(f.request, undefined, f.sources);
    const worker = ControlledWorker.instances.at(-1)!;
    worker.ready();
    worker.emit(worker.response(structuredClone(f.result)));
    const result = await pending;
    if (result.kind !== 'gradient') throw new Error('Native result');
    expect(result.value.selection).toEqual(f.selection);
    expect(hasGradientWorkerVerification(result.value)).toBe(true);
    expect(result.value.portable.fidelity).toBeNull();
    cleaned(worker);
  });
  it.each(['changed-edit', 'changed-css', 'fake-fidelity', 'missing-source', 'stale-controls'])(
    'rejects %s and cleans up the worker',
    async kind => {
      const f = await native();
      const result = structuredClone(f.result);
      if (result.kind !== 'gradient') throw new Error('Native result');
      if (kind === 'changed-edit')
        result.value.selection = createGuidelineNativeGradient(f.review, f.sources[0], {
          ...f.controls,
          rotationDegrees: 45,
        });
      if (kind === 'changed-css') result.value.portable.css = '.gradient { background: red; }';
      if (kind === 'fake-fidelity')
        result.value.portable.fidelity = generated.value.portable.fidelity;
      const pending = runGradientWorker(
        f.request,
        undefined,
        kind === 'missing-source' ? [] : f.sources
      );
      const worker = ControlledWorker.instances.at(-1)!;
      worker.ready();
      const rejected = expect(pending).rejects.toThrow();
      if (kind === 'stale-controls' && f.request.operation === 'native-edit')
        f.request.controls = { ...f.controls, rotationDegrees: 30 };
      worker.emit(worker.response(result));
      await rejected;
      cleaned(worker);
      expect(hasGradientWorkerVerification(result.value)).toBe(false);
    }
  );
  it('admits a native composition and rejects a generated-route certificate for it', async () => {
    const f = await native();
    const request: GradientWorkerRequest = {
      operation: 'composition',
      review: f.review,
      workingModel: f.review.model,
      gradient: { selection: f.selection },
      nativeContext: f.request.nativeContext,
    };
    const result = await executeGradientWorkerRequest(request);
    if (result.kind !== 'composition') throw new Error('Native composition');
    for (const forged of [false, true]) {
      const response = structuredClone(result);
      if (forged) response.value.fidelity = composition.value.fidelity;
      const pending = runGradientWorker(request, undefined, f.sources);
      const worker = ControlledWorker.instances.at(-1)!;
      worker.ready();
      const checked = forged
        ? expect(pending).rejects.toThrow('fidelity')
        : expect(pending).resolves.toEqual(result);
      worker.emit(worker.response(response));
      await checked;
      cleaned(worker);
      expect(hasCompositionGradientWorkerVerification(response.value)).toBe(!forged);
    }
  });
});
