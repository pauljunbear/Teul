import { colorData } from '../colorData';
import { wernerColors } from '../wernerColorData';
import { validateHistoricalColorDataResult } from '../lib/historicalColorDataBridge';
import {
  HISTORICAL_COLOR_DATA_SCHEMA_VERSION,
  type GetHistoricalColorDataMessage,
  type HistoricalColorDataResultMessage,
} from '../types/historicalColorData';

function failure(
  request: GetHistoricalColorDataMessage,
  error: string
): HistoricalColorDataResultMessage {
  return {
    type: 'historical-color-data-result',
    schemaVersion: HISTORICAL_COLOR_DATA_SCHEMA_VERSION,
    requestId: request.requestId,
    dataset: request.dataset,
    success: false,
    error,
  };
}
/**
 * Returns an immutable source projection only after validating the exact
 * versioned transport shape. `postMessage` performs the cross-process clone.
 */
export function getHistoricalColorData(
  request: GetHistoricalColorDataMessage
): HistoricalColorDataResultMessage {
  const candidate: HistoricalColorDataResultMessage =
    request.dataset === 'wada'
      ? {
          type: 'historical-color-data-result',
          schemaVersion: HISTORICAL_COLOR_DATA_SCHEMA_VERSION,
          requestId: request.requestId,
          dataset: 'wada',
          success: true,
          records: colorData.colors,
        }
      : {
          type: 'historical-color-data-result',
          schemaVersion: HISTORICAL_COLOR_DATA_SCHEMA_VERSION,
          requestId: request.requestId,
          dataset: 'werner',
          success: true,
          records: wernerColors,
        };

  const validation = validateHistoricalColorDataResult(candidate);
  return validation.valid
    ? validation.message
    : failure(request, 'Teul rejected historical color data that failed integrity validation.');
}
