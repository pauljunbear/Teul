import { describe, expect, it } from 'vitest';
import { validatePluginToUIMessage } from '../messageValidation';

const envelope = { requestId: 'request-1', success: true };

describe('validatePluginToUIMessage', () => {
  it.each([
    {
      type: 'selection-info',
      hasSelection: true,
      isFrame: true,
      selectedCount: 1,
      eligibleTargets: [
        {
          id: '1:2',
          name: 'Frame',
          width: 1200,
          height: 800,
          layoutGridCount: 0,
          teulConstructionCount: 0,
        },
      ],
      ineligibleCount: 0,
    },
    { type: 'document-color-profile', profile: 'srgb' },
    {
      type: 'accessibility-selection-result',
      ...envelope,
      profile: 'srgb',
      foreground: '#123456',
      background: '#FEDCBA',
      foregroundSource: 'Label',
      backgroundSource: 'Card',
    },
    {
      type: 'accessibility-selection-result',
      requestId: 'request-2',
      success: false,
      profile: 'display-p3',
      error: 'Display P3 selection analysis is unsupported.',
    },
    {
      type: 'color-system-operation-result',
      ...envelope,
      outputName: 'Brand Copy',
      modes: ['Light', 'Dark'],
      primitiveCount: 24,
      semanticAliasCount: 10,
      styleCount: 34,
      frameCount: 1,
      skippedCount: 0,
      warnings: ['Created a copy.'],
    },
    {
      type: 'mutation-operation-result',
      ...envelope,
      operation: 'apply-fill',
      message: 'Fill applied',
    },
    {
      type: 'grid-applied',
      ...envelope,
      appliedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      message: 'Grid applied',
    },
    { type: 'grid-storage-result', ...envelope, operation: 'get', value: '{}' },
    { type: 'workspace-storage-result', ...envelope, operation: 'set' },
    { type: 'grid-capture-result', ...envelope, frameName: 'Frame' },
  ])('accepts a valid %s payload', message => {
    expect(validatePluginToUIMessage(message)).toEqual({ valid: true, message });
  });

  it.each([
    null,
    { type: 'unknown-result' },
    { type: 'color-system-operation-result', ...envelope, primitiveCount: -1 },
    { type: 'color-system-operation-result', ...envelope, warnings: [''] },
    {
      type: 'accessibility-selection-result',
      ...envelope,
      profile: 'display-p3',
      foreground: '#123456',
      background: '#FEDCBA',
      foregroundSource: 'Label',
      backgroundSource: 'Card',
    },
    {
      type: 'accessibility-selection-result',
      ...envelope,
      profile: 'srgb',
      foreground: '#123456',
      background: '#FEDCBA',
      foregroundSource: 'Label',
      backgroundSource: 'Card',
      error: 'Success cannot also contain an error.',
    },
    {
      type: 'accessibility-selection-result',
      requestId: 'request-3',
      success: false,
      profile: 'srgb',
      error: 'Failure',
      foreground: '#123456',
    },
    {
      type: 'accessibility-selection-result',
      ...envelope,
      profile: 'srgb',
      foreground: 'not-hex',
      background: '#FEDCBA',
      foregroundSource: 'Label',
      backgroundSource: 'Card',
    },
    {
      type: 'selection-info',
      hasSelection: true,
      isFrame: true,
      selectedCount: 1,
      eligibleTargets: [{ id: '', name: 'Frame' }],
      ineligibleCount: 0,
    },
  ])('rejects an invalid plugin payload %#', message => {
    expect(validatePluginToUIMessage(message).valid).toBe(false);
  });
});
