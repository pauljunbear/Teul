import {
  executeGradientWorkerRequest,
  gradientWorkerRequestHash,
  GRADIENT_WORKER_VERSION,
  type GradientWorkerRequest,
} from './gradientWorkerOperations';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(data: unknown): void;
};
let used = false;
scope.onmessage = async ({ data }) => {
  if (used) return;
  used = true;
  const id = data?.id;
  try {
    if (data?.version !== GRADIENT_WORKER_VERSION || !Number.isSafeInteger(id) || id < 1)
      throw new Error('Invalid gradient request.');
    const request = snapshotColorSystemInertJsonV1(data.request, {
      maximumBytes: 8_000_000,
      maximumNodes: 250000,
    }) as unknown as GradientWorkerRequest;
    const requestHash = gradientWorkerRequestHash(request);
    if (requestHash !== data.requestHash) throw new Error('Gradient request changed.');
    scope.postMessage({ version: GRADIENT_WORKER_VERSION, id, requestHash, type: 'started' });
    const result = await executeGradientWorkerRequest(request);
    scope.postMessage({
      version: GRADIENT_WORKER_VERSION,
      id,
      requestHash,
      type: 'result',
      result,
    });
  } catch (error) {
    scope.postMessage({
      version: GRADIENT_WORKER_VERSION,
      id,
      requestHash: data?.requestHash,
      type: 'error',
      message: error instanceof Error ? error.message : 'Gradient could not be checked.',
    });
  }
};
scope.postMessage({ version: GRADIENT_WORKER_VERSION, type: 'ready' });
