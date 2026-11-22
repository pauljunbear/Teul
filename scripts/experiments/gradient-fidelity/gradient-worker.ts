/** Isolated feasibility worker. It is not imported by Studio or its production build. */
import { compileGradientV1, type GradientInputV1 } from '../../../src/lib/colorSystemGradientV1';
import { compileGradientSampledPaintV1 } from '../../../src/lib/colorSystemGradientConstructionV1';
import { buildColorSystemSrgbValueV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import { assessGradientPaintCandidateForExperiment } from '../../../src/lib/colorSystemGradientFidelityV2';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(value: unknown): void;
};
let used = false;
scope.onmessage = ({ data }) => {
  if (used) return;
  used = true;
  const id = data?.id;
  scope.postMessage({ type: 'started', id });
  const start = performance.now();
  try {
    const colors = data?.fixture?.colors;
    if (
      !Array.isArray(colors) ||
      colors.length < 2 ||
      colors.length > 5 ||
      colors.some(rgb => !Array.isArray(rgb) || rgb.length !== 3)
    )
      throw new Error('Use a bounded two-to-five-color fixture.');
    const input: GradientInputV1 = {
      sourceModelHash: `sha256:${'1'.repeat(64)}`,
      briefHash: `sha256:${'2'.repeat(64)}`,
      angleDegrees: 120,
      route: data.fixture.route,
      stops: colors.map(([r, g, b], index) => ({
        position: index / (colors.length - 1),
        value: buildColorSystemSrgbValueV1({ r, g, b }),
        sourceColorId: `source-${index}`,
        locked: true,
      })),
    };
    const original = compileGradientV1(input);
    const candidate = compileGradientSampledPaintV1(input, 0.0025);
    const assessment = assessGradientPaintCandidateForExperiment(original, candidate.stops, {
      maximumMappingStatesPerInterval: 32,
    });
    scope.postMessage({
      type: 'result',
      id,
      result: {
        assessment,
        stops: candidate.stops.length,
        elapsedMs: performance.now() - start,
      },
    });
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id,
      message: error instanceof Error ? error.message : 'Worker failed.',
    });
  }
};
scope.postMessage({ type: 'ready' });
