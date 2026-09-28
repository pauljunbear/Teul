import type { FigmaReadConnection } from './figmaConnection.js';
import { IntakeError, canonicalIntakeJson, type JsonValue } from './protocol.js';
import { intakeHash, ProcessorFailure, type IntakeProcessor } from './service.js';

export {
  FIGMA_CAPTURE_VERSION,
  FIGMA_READ_LIMITS,
  FigmaReadError,
  parseFigmaLink,
  parseFigmaCaptureRequest,
} from './figmaProtocol.js';
export type {
  FigmaLink,
  FigmaCaptureRequest,
  FigmaOutline,
  FigmaReadGap,
  FigmaCapturePacket,
} from './figmaProtocol.js';
import { FigmaReadClient } from './figmaReadClient.js';
export { FigmaReadClient, fetchFigmaResponse, readFigmaJson } from './figmaReadClient.js';
import {
  FigmaReadError,
  parseFigmaCaptureRequest,
  parseFigmaCapturePacket,
  fail,
} from './figmaProtocol.js';

export function createFigmaCaptureProcessor(options: {
  client: FigmaReadClient;
  /** Must resolve a stored OAuth connection for this server-derived owner; no request/token fallback. */
  connection: (ownerKey: string, signal: AbortSignal) => Promise<FigmaReadConnection>;
}): IntakeProcessor {
  const profile = {
    id: 'figma-native-capture',
    version: '1',
    kind: 'figma' as const,
    operation: 'capture' as const,
    destination: 'Figma REST API',
    consentPolicyVersion: 'figma-selected-nodes-1',
    maximumAttemptCostMicros: 0,
    maximumJobCostMicros: 0,
  };
  return {
    profile,
    validateInput(input) {
      const request = parseFigmaCaptureRequest(input.payload);
      if (
        input.captureHash !== intakeHash(request) ||
        input.binding.sourceRevision !== intakeHash(request) ||
        JSON.stringify(input.scope) !== JSON.stringify(request.nodeIds)
      )
        throw new IntakeError('FIGMA_REQUEST_BINDING_MISMATCH');
    },
    validateOutput(value) {
      const { contentHash, ...content } = parseFigmaCapturePacket(value);
      if (contentHash !== intakeHash(content)) fail('FIGMA_CAPTURE_HASH_MISMATCH');
    },
    async execute(input, context) {
      let connection: FigmaReadConnection | undefined;
      try {
        connection = await options.connection(context.ownerKey, context.signal);
        context.signal.throwIfAborted();
        const value = await options.client.capture(
          parseFigmaCaptureRequest(input.payload),
          connection.accessToken,
          AbortSignal.any([context.signal, connection.signal]),
          connection.includeVariables
        );
        connection.assertCurrent();
        return { value: JSON.parse(canonicalIntakeJson(value)) as JsonValue, actualCostMicros: 0 };
      } catch (error) {
        if (error instanceof FigmaReadError && error.code === 'FIGMA_AUTH_REJECTED')
          connection?.rejectAuthentication();
        throw new ProcessorFailure(
          error instanceof FigmaReadError ? error.code : 'FIGMA_CAPTURE_UNAVAILABLE',
          'confirmed-final',
          0
        );
      }
    },
  };
}
