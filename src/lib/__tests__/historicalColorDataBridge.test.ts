import { describe, expect, it } from 'vitest';
import wadaSource from '../../colors.json';
import { getHistoricalColorData } from '../../backend/historicalColorData';
import { wernerColors } from '../../wernerColorData';
import {
  validateHistoricalColorDataRequest,
  validateHistoricalColorDataResult,
} from '../historicalColorDataBridge';
import { validatePluginToUIMessage, validateUIToPluginMessage } from '../messageValidation';
import { HISTORICAL_COLOR_DATA_SCHEMA_VERSION } from '../../types/historicalColorData';

const request = {
  type: 'get-historical-color-data' as const,
  schemaVersion: HISTORICAL_COLOR_DATA_SCHEMA_VERSION,
  requestId: 'historical-data-1',
  dataset: 'wada' as const,
};

describe('historical color data bridge', () => {
  it('accepts only the exact versioned request schema', () => {
    expect(validateHistoricalColorDataRequest(request)).toEqual({
      valid: true,
      message: request,
    });
    expect(validateUIToPluginMessage(request).valid).toBe(true);
    expect(validateHistoricalColorDataRequest({ ...request, unexpected: true }).valid).toBe(false);
    expect(
      validateHistoricalColorDataRequest({ ...request, schemaVersion: 'historical-v0' }).valid
    ).toBe(false);
    expect(validateHistoricalColorDataRequest({ ...request, dataset: 'all' }).valid).toBe(false);
  });

  it('returns the complete Wada corpus without numeric precision loss', () => {
    const result = getHistoricalColorData(request);
    expect(validateHistoricalColorDataResult(result).valid).toBe(true);
    expect(validatePluginToUIMessage(result).valid).toBe(true);
    expect(result.success).toBe(true);
    if (!result.success || result.dataset !== 'wada') throw new Error('Expected Wada data.');
    expect(result.records).toHaveLength(159);
    expect(result.records).toEqual(wadaSource);
    expect(result.records[0]?.lab[0]).toBe(83.42717631799802);
  });

  it('returns the reviewed Werner source and normalized display text together', () => {
    const result = getHistoricalColorData({ ...request, requestId: 'werner-1', dataset: 'werner' });
    expect(validateHistoricalColorDataResult(result).valid).toBe(true);
    expect(validatePluginToUIMessage(result).valid).toBe(true);
    expect(result.success).toBe(true);
    if (!result.success || result.dataset !== 'werner') throw new Error('Expected Werner data.');
    expect(result.records).toEqual(wernerColors);
    const cloveBrown = result.records.find(color => color.id === 109);
    expect(cloveBrown?.text.source.description).toContain('Olive Brown');
    expect(cloveBrown?.text.normalized.description).toContain('Clove Brown');
  });

  it('rejects count, field, value, and normalization drift in backend responses', () => {
    const wadaResult = getHistoricalColorData(request);
    const wernerResult = getHistoricalColorData({ ...request, dataset: 'werner' });
    if (!wadaResult.success || wadaResult.dataset !== 'wada') throw new Error('Expected Wada.');
    if (!wernerResult.success || wernerResult.dataset !== 'werner') {
      throw new Error('Expected Werner.');
    }

    expect(validateHistoricalColorDataResult({ ...wadaResult, records: [] }).valid).toBe(false);
    expect(
      validateHistoricalColorDataResult({
        ...wadaResult,
        records: [{ ...wadaResult.records[0], hex: '#000000' }, ...wadaResult.records.slice(1)],
      }).valid
    ).toBe(false);
    expect(validateHistoricalColorDataResult({ ...wadaResult, unexpected: true }).valid).toBe(
      false
    );

    const [firstWerner, ...remainingWerner] = wernerResult.records;
    expect(
      validateHistoricalColorDataResult({
        ...wernerResult,
        records: [
          {
            ...firstWerner,
            name: `${firstWerner.name} changed`,
          },
          ...remainingWerner,
        ],
      }).valid
    ).toBe(false);
  });

  it('accepts only a bounded exact failure envelope', () => {
    const failure = {
      type: 'historical-color-data-result' as const,
      schemaVersion: HISTORICAL_COLOR_DATA_SCHEMA_VERSION,
      requestId: 'historical-failure-1',
      dataset: 'wada' as const,
      success: false as const,
      error: 'Historical data is unavailable.',
    };
    expect(validateHistoricalColorDataResult(failure).valid).toBe(true);
    expect(validateHistoricalColorDataResult({ ...failure, records: [] }).valid).toBe(false);
    expect(validateHistoricalColorDataResult({ ...failure, error: '' }).valid).toBe(false);
  });
});
