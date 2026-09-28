import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../fixtures/guidelines/figma-project-v1.json';
import { readFigmaProject } from './figmaProject';
import { runGradientWorker, hasGradientWorkerVerification } from './gradientWorkerClient';
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
    expect(hasGradientWorkerVerification(result.value)).toBe(true);
    cleaned(worker);
  });

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
