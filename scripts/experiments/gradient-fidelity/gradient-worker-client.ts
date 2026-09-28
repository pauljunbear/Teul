import type { GradientInputV1 } from '../../../src/lib/colorSystemGradientV1';
import type { GradientFidelityV2 } from '../../../src/lib/colorSystemGradientFidelityV2';

interface Fixture {
  colors: readonly (readonly [number, number, number])[];
  route: GradientInputV1['route'];
}
type Result =
  | {
      status: 'complete';
      assessment: GradientFidelityV2;
      stops: number;
      elapsedMs: number;
      totalMs: number;
    }
  | { status: 'cancelled' | 'failed'; totalMs: number; message?: string };

let serial = 0;
function run(fixture: Fixture, signal?: AbortSignal, onStarted?: () => void): Promise<Result> {
  const start = performance.now();
  if (signal?.aborted) return Promise.resolve({ status: 'cancelled', totalMs: 0 });
  return new Promise(resolve => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./gradient-worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve({
        status: 'failed',
        totalMs: performance.now() - start,
        message: 'Worker unavailable.',
      });
      return;
    }
    const id = ++serial;
    let settled = false;
    const finish = (result: Result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      worker.onmessage = null;
      worker.onmessageerror = null;
      worker.onerror = null;
      worker.terminate();
      resolve(result);
    };
    const cancel = () => finish({ status: 'cancelled', totalMs: performance.now() - start });
    const timer = setTimeout(
      () =>
        finish({
          status: 'failed',
          totalMs: performance.now() - start,
          message: 'Worker timed out.',
        }),
      30000
    );
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onerror = event => {
      event.preventDefault();
      finish({ status: 'failed', totalMs: performance.now() - start, message: 'Worker failed.' });
    };
    worker.onmessageerror = () => {
      finish({
        status: 'failed',
        totalMs: performance.now() - start,
        message: 'Worker message could not be read.',
      });
    };
    worker.onmessage = ({ data }) => {
      if (data?.type === 'ready') {
        try {
          worker.postMessage({ id, fixture });
        } catch {
          finish({
            status: 'failed',
            totalMs: performance.now() - start,
            message: 'Worker input could not be sent.',
          });
        }
      } else if (data?.id === id && data.type === 'started') {
        onStarted?.();
      } else if (data?.id === id && data.type === 'result') {
        finish({ ...data.result, status: 'complete', totalMs: performance.now() - start });
      } else if (data?.id === id && data.type === 'error') {
        finish({ status: 'failed', totalMs: performance.now() - start, message: data.message });
      }
    };
  });
}

declare global {
  interface Window {
    gradientWorkerExperiment: { run: typeof run };
  }
}
window.gradientWorkerExperiment = { run };
