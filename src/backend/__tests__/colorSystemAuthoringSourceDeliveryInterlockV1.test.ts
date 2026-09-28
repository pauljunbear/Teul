import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeColorSystemInertJsonV1 } from '../../lib/colorSystemInertJsonV1';

// These endpoints expose scheduling only. Actual compilation/Create/journal behavior is covered
// by colorSystemAuthoringDeliveryControllerV1.test.ts using the real services.
const state = vi.hoisted(() => ({
  creating: false,
  modelHandle: vi.fn<(input: unknown) => Promise<unknown>>(),
  modelSource: vi.fn<() => unknown>(),
  authoringHandle: vi.fn<(input: unknown) => Promise<void>>(),
  setSource: vi.fn<(input: unknown) => void>(),
  postMessage: vi.fn<(input: unknown) => void>(),
}));
vi.mock('../colorSystemModelControllerV1', () => ({
  createColorSystemModelControllerV1: () => ({
    handle: state.modelHandle,
    getCurrentSource: state.modelSource,
  }),
}));
vi.mock('../colorSystemAuthoringControllerV1', () => ({
  createColorSystemAuthoringControllerV1: () => ({
    isCreating: () => state.creating,
    setSource: state.setSource,
    handle: state.authoringHandle,
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const sourceRead = (requestId: string) => ({
  type: 'read-color-system-model-v1',
  requestId,
  source: 'guideline-json',
  json: '{}',
});
const create = (requestId: string) => ({
  type: 'color-system-authoring-v1',
  requestId,
  action: 'create-delivery',
  payloadJson: '{}',
});
let runtime: typeof import('../colorSystemBuilderCandidateRuntime');

describe('candidate runtime interlock between source adoption and authored Create', () => {
  beforeAll(async () => {
    vi.stubGlobal('figma', { root: {}, clientStorage: {}, ui: { postMessage: state.postMessage } });
    runtime = await import('../colorSystemBuilderCandidateRuntime');
  });
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.resetAllMocks();
    state.creating = false;
    state.modelHandle.mockResolvedValue(null);
    state.modelSource.mockReturnValue(null);
    state.authoringHandle.mockResolvedValue();
  });

  it('rejects a new source read before the model endpoint while Create is active', async () => {
    state.creating = true;
    await runtime.handleColorSystemModelV1(sourceRead('source:during-create'));
    expect(state.modelHandle).not.toHaveBeenCalled();
    expect(state.modelSource).not.toHaveBeenCalled();
    expect(state.setSource).not.toHaveBeenCalled();
    expect(state.postMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: 'color-system-model-result-v1',
        requestId: 'source:during-create',
        success: false,
        code: 'CREATE_IN_PROGRESS',
      })
    );
    state.creating = false;
    await runtime.handleColorSystemModelV1(sourceRead('source:after-create'));
    expect(state.modelHandle).toHaveBeenCalledExactlyOnceWith(sourceRead('source:after-create'));
  });

  it('blocks Create across pending inventory, source adoption and result posting, then releases', async () => {
    const pending = deferred<unknown>(),
      reentrant: Promise<void>[] = [];
    const accepted = {
      model: { marker: 'exact native snapshot', value: -0 },
      intake: 'current-file',
      readScope: { version: 'synthetic-read-descriptor' },
    };
    state.modelHandle.mockReturnValueOnce(pending.promise);
    state.modelSource.mockReturnValue(accepted);
    state.setSource.mockImplementation(() => {
      reentrant.push(runtime.handleColorSystemAuthoringV1(create('create:during-adoption')));
    });
    state.postMessage.mockImplementation(message => {
      if ((message as { requestId: string }).requestId === 'source:pending')
        reentrant.push(runtime.handleColorSystemAuthoringV1(create('create:during-post')));
    });
    const reading = runtime.handleColorSystemModelV1(sourceRead('source:pending'));
    await runtime.handleColorSystemAuthoringV1(create('create:during-read'));
    expect(state.authoringHandle).not.toHaveBeenCalled();
    const result = {
      type: 'color-system-model-result-v1',
      requestId: 'source:pending',
      success: true,
    };
    pending.resolve(result);
    await reading;
    await Promise.all(reentrant);
    expect(state.setSource).toHaveBeenCalledExactlyOnceWith({
      model: accepted.model,
      intake: accepted.intake,
      currentFileReadScopeJson: serializeColorSystemInertJsonV1(accepted.readScope),
    });
    expect(
      Object.is((state.setSource.mock.calls[0][0] as { model: { value: number } }).model.value, -0)
    ).toBe(true);
    expect(state.postMessage).toHaveBeenCalledWith(result);
    for (const requestId of ['create:during-read', 'create:during-adoption', 'create:during-post'])
      expect(state.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ requestId, success: false, code: 'SOURCE_READ_IN_PROGRESS' })
      );
    expect(state.authoringHandle).not.toHaveBeenCalled();
    await runtime.handleColorSystemAuthoringV1(create('create:after-read'));
    expect(state.authoringHandle).toHaveBeenCalledExactlyOnceWith(create('create:after-read'));
  });

  it('keeps the counter held until every overlapping read has settled, including cancellation messages', async () => {
    const first = deferred<unknown>(),
      second = deferred<unknown>();
    state.modelHandle.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = runtime.handleColorSystemModelV1(sourceRead('source:first'));
    const b = runtime.handleColorSystemModelV1(sourceRead('source:second'));
    await runtime.handleColorSystemModelV1({
      type: 'cancel-color-system-model-v1',
      requestId: 'cancel:first',
      targetRequestId: 'source:first',
    });
    first.resolve(null);
    await a;
    await runtime.handleColorSystemAuthoringV1(create('create:one-still-pending'));
    expect(state.authoringHandle).not.toHaveBeenCalled();
    second.resolve({
      type: 'color-system-model-result-v1',
      requestId: 'source:second',
      success: false,
    });
    await b;
    await runtime.handleColorSystemAuthoringV1(create('create:both-settled'));
    expect(state.authoringHandle).toHaveBeenCalledExactlyOnceWith(create('create:both-settled'));
    expect(state.setSource).not.toHaveBeenCalled();
  });

  it.each(['model', 'adoption', 'posting'] as const)(
    'releases after a %s failure without swallowing it or trapping later Create',
    async failure => {
      const error = new Error(`${failure} failed`);
      state.modelHandle.mockResolvedValue({
        type: 'color-system-model-result-v1',
        requestId: 'source:failing',
        success: true,
      });
      state.modelSource.mockReturnValue({
        model: { marker: 'accepted snapshot' },
        intake: 'guideline-json',
      });
      if (failure === 'model') state.modelHandle.mockRejectedValue(error);
      if (failure === 'adoption')
        state.setSource.mockImplementation(() => {
          throw error;
        });
      if (failure === 'posting')
        state.postMessage.mockImplementation(() => {
          throw error;
        });
      await expect(runtime.handleColorSystemModelV1(sourceRead('source:failing'))).rejects.toBe(
        error
      );
      state.postMessage.mockReset();
      await runtime.handleColorSystemAuthoringV1(create('create:after-failure'));
      expect(state.authoringHandle).toHaveBeenCalledExactlyOnceWith(create('create:after-failure'));
    }
  );

  it('leaves non-Create actions available and never invokes accessor-bearing input while rejecting during Create', async () => {
    const pending = deferred<unknown>();
    state.modelHandle.mockReturnValueOnce(pending.promise);
    const reading = runtime.handleColorSystemModelV1(sourceRead('source:inventory'));
    const inspect = { ...create('authoring:inspect'), action: 'inspect' };
    await runtime.handleColorSystemAuthoringV1(inspect);
    expect(state.authoringHandle).toHaveBeenCalledExactlyOnceWith(inspect);
    pending.resolve(null);
    await reading;
    state.creating = true;
    const getter = vi.fn(() => {
      throw new Error('Getter executed');
    });
    await runtime.handleColorSystemModelV1(
      Object.defineProperty({}, 'type', { enumerable: true, get: getter })
    );
    expect(getter).not.toHaveBeenCalled();
    expect(state.postMessage).not.toHaveBeenCalled();
  });
});
