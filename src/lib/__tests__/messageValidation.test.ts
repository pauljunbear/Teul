import { describe, expect, it, vi } from 'vitest';
import { generateColorScale } from '../colorScale';
import { isUIToPluginMessage, validateUIToPluginMessage } from '../messageValidation';
import { radixColors } from '../radixColors';
import { buildSemanticColorPolicy } from '../semanticColorPolicy';

const backendMocks = vi.hoisted(() => ({
  sendSelectionInfo: vi.fn(),
  sendDocumentColorProfile: vi.fn(),
  handleApplyFill: vi.fn(),
  handleApplyStroke: vi.fn(),
  handleCreateStyle: vi.fn(),
  handleApplyGradient: vi.fn(),
  handleCreateGridFrame: vi.fn(),
  handleApplyGrid: vi.fn(),
  handleGenerateColorSystem: vi.fn(),
  generateColorSystemFrames: vi.fn(),
}));

vi.mock('../../backend', () => backendMocks);

const color = { hex: '#123456', name: 'Test Color' };
const systemColor = { hex: '#3366cc', name: 'Primary' };
const gridColor = { r: 1, g: 0.2, b: 0.4, a: 0.1 };

const columns = {
  pattern: 'COLUMNS',
  alignment: 'STRETCH',
  gutterSize: 24,
  count: 12,
  offset: 32,
  visible: true,
  color: gridColor,
};

const sourceColumns = {
  count: 12,
  gutterSize: 24,
  gutterUnit: 'px',
  margin: 32,
  marginUnit: 'px',
  alignment: 'STRETCH',
  visible: true,
  color: gridColor,
};

const generatedScale = generateColorScale('#3366cc', 'light', 'Primary');
const customScale = {
  name: generatedScale.name,
  role: 'Primary',
  profile: generatedScale.profile,
  method: generatedScale.method,
  mode: generatedScale.mode,
  validation: generatedScale.validation,
  steps: generatedScale.steps.map(({ step, hex }) => ({ step, hex })),
};

const scale = {
  name: 'Neutral',
  role: 'Neutral',
  profile: 'sRGB',
  method: 'Radix Colors',
  mode: 'light',
  sourceVersion: '3.0.0',
  sourceFamily: 'slate',
  steps: Object.entries(radixColors.slate.light).map(([step, hex]) => ({
    step: Number(step),
    hex,
  })),
};

const constrainedNeutralScale = scale;

const styleData = {
  systemName: 'Test System',
  includeDarkMode: false,
  scaleMethod: 'custom',
  scales: {
    light: {
      primary: customScale,
      neutral: scale,
    },
  },
};

const colorSystemData = {
  ...styleData,
  detailLevel: 'detailed',
  scaleMethod: 'custom',
  usageProportions: {
    primary: 35,
    secondary: 20,
    tertiary: 15,
    accent: 10,
    neutral: 20,
  },
  documentColorProfile: 'srgb',
};

const colorSystemConfig = {
  sourceColors: [systemColor],
  roleAssignments: [{ ...systemColor, role: 'primary', roles: ['primary'] }],
  scaleMethod: 'custom',
  neutralFamily: 'gray',
  detailLevel: 'detailed',
  includeDarkMode: false,
  systemName: 'Test System',
  documentColorProfile: 'srgb',
};
const generationRequest = {
  requestId: 'color-system-request-1',
  createStyles: false,
};

describe('validateUIToPluginMessage', () => {
  it.each([
    { type: 'apply-fill', ...color },
    { type: 'apply-stroke', ...color },
    { type: 'create-style', ...color },
    { type: 'get-selection-for-grid' },
    { type: 'get-selection-for-grid', requestId: 'grid-apply-1' },
    { type: 'get-document-color-profile' },
    { type: 'get-grid-storage', requestId: 'grid-storage-get-1' },
    {
      type: 'set-grid-storage',
      requestId: 'grid-storage-set-1',
      value: '{"version":1,"grids":[]}',
    },
    { type: 'delete-grid-storage', requestId: 'grid-storage-delete-1' },
    { type: 'apply-gradient', gradientType: 'LINEAR', colors: [color, color] },
    { type: 'notify', text: 'Copied Test Color' },
    {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: colorSystemData,
    },
    {
      type: 'create-grid-frame',
      config: { columns },
      frameName: 'Grid - Test',
      width: 1440,
      height: 900,
      positionNearSelection: true,
    },
    {
      type: 'apply-grid',
      requestId: 'grid-apply-1',
      sourceConfig: { columns: sourceColumns },
      sourceDimensions: { width: 1440, height: 900 },
      applicationMode: 'scale-from-reference',
      expectedTargetIds: ['1:2', '3:4'],
      replaceExisting: true,
    },
  ])('accepts a valid $type message', message => {
    const result = validateUIToPluginMessage(message);

    expect(result).toEqual({ valid: true, message });
    expect(isUIToPluginMessage(message)).toBe(true);
  });

  it('rejects malformed or oversized saved-grid storage requests', () => {
    expect(validateUIToPluginMessage({ type: 'get-grid-storage', requestId: '' }).valid).toBe(
      false
    );
    expect(
      validateUIToPluginMessage({
        type: 'set-grid-storage',
        requestId: 'grid-storage-set-1',
        value: '',
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        type: 'set-grid-storage',
        requestId: 'grid-storage-set-oversized',
        value: 'x'.repeat(4 * 1024 * 1024 + 1),
      }).valid
    ).toBe(false);
  });

  it('rejects malformed selection refresh correlation IDs', () => {
    expect(
      validateUIToPluginMessage({ type: 'get-selection-for-grid', requestId: 123 }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({ type: 'get-selection-for-grid', requestId: 'x'.repeat(129) })
        .valid
    ).toBe(false);
  });

  it('requires correlated color-system transaction metadata', () => {
    expect(
      validateUIToPluginMessage({
        type: 'generate-color-system',
        createStyles: false,
        config: colorSystemConfig,
        scales: colorSystemData,
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        type: 'generate-color-system',
        ...generationRequest,
        createStyles: 'yes',
        config: colorSystemConfig,
        scales: colorSystemData,
      }).valid
    ).toBe(false);
  });

  it('accepts the active radix-match scale method', () => {
    const message = {
      type: 'generate-color-system',
      ...generationRequest,
      config: { ...colorSystemConfig, scaleMethod: 'radix-match' },
      scales: {
        ...colorSystemData,
        scaleMethod: 'radix-match',
        scales: { light: { neutral: scale } },
      },
    };

    expect(validateUIToPluginMessage(message).valid).toBe(true);
  });

  it('rejects forged Exact Radix values or provenance metadata', () => {
    const baseMessage = {
      type: 'generate-color-system',
      ...generationRequest,
      config: { ...colorSystemConfig, scaleMethod: 'radix-match' },
      scales: {
        ...colorSystemData,
        scaleMethod: 'radix-match',
        scales: { light: { neutral: scale } },
      },
    };

    expect(
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          scales: {
            light: {
              neutral: {
                ...scale,
                steps: scale.steps.map(step =>
                  step.step === 9 ? { ...step, hex: '#123456' } : step
                ),
              },
            },
          },
        },
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          scales: { light: { neutral: { ...scale, sourceFamily: 'blue' } } },
        },
      }).valid
    ).toBe(false);
    expect(() =>
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          scales: { light: { neutral: { ...scale, sourceFamily: 'toString' } } },
        },
      })
    ).not.toThrow();
    expect(
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          scales: { light: { neutral: { ...scale, sourceFamily: 'toString' } } },
        },
      }).valid
    ).toBe(false);

    const blueScale = {
      ...scale,
      name: 'Blue',
      role: 'Primary',
      sourceFamily: 'blue',
      sourceInputHex: '#ff0000',
      steps: Object.entries(radixColors.blue.light).map(([step, hex]) => ({
        step: Number(step),
        hex,
      })),
    };
    expect(
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          scales: { light: { neutral: scale, primary: blueScale } },
        },
      }).valid
    ).toBe(false);
  });

  it('rejects Radix provenance metadata on generated non-Radix scales', () => {
    const message = {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: {
        ...colorSystemData,
        scales: {
          light: {
            neutral: scale,
            primary: {
              ...customScale,
              sourceVersion: '3.0.0',
              sourceFamily: 'blue',
              sourceInputHex: '#3366cc',
            },
          },
        },
      },
    };

    expect(validateUIToPluginMessage(message).valid).toBe(false);
  });

  it('accepts a recomputed passing WCAG-constrained semantic policy', () => {
    const scales = {
      light: {
        neutral: constrainedNeutralScale,
        primary: customScale,
      },
    };
    const semanticPolicy = buildSemanticColorPolicy(scales.light);
    const message = {
      type: 'generate-color-system',
      ...generationRequest,
      config: { ...colorSystemConfig, scaleMethod: 'wcag-constrained' },
      scales: {
        ...colorSystemData,
        scaleMethod: 'wcag-constrained',
        scales,
        semanticPolicy,
      },
    };

    expect(semanticPolicy.valid).toBe(true);
    expect(validateUIToPluginMessage(message).valid).toBe(true);
  });

  it('rejects missing, failing, or forged WCAG-constrained semantic policies', () => {
    const scales = {
      light: {
        neutral: constrainedNeutralScale,
        primary: customScale,
      },
    };
    const semanticPolicy = buildSemanticColorPolicy(scales.light);
    const baseMessage = {
      type: 'generate-color-system',
      ...generationRequest,
      config: { ...colorSystemConfig, scaleMethod: 'wcag-constrained' },
      scales: {
        ...colorSystemData,
        scaleMethod: 'wcag-constrained',
        scales,
      },
    };

    expect(validateUIToPluginMessage(baseMessage).valid).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          semanticPolicy: { ...semanticPolicy, valid: false },
        },
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          semanticPolicy: {
            ...semanticPolicy,
            modes: {
              ...semanticPolicy.modes,
              light: {
                ...semanticPolicy.modes.light,
                tokens: {
                  ...semanticPolicy.modes.light.tokens,
                  'action.text': {
                    ...semanticPolicy.modes.light.tokens['action.text'],
                    value: '#ffffff',
                  },
                },
              },
            },
          },
        },
      }).valid
    ).toBe(false);
  });

  it('rejects the retired radix scale method even when config and scales agree', () => {
    const message = {
      type: 'generate-color-system',
      ...generationRequest,
      config: { ...colorSystemConfig, scaleMethod: 'radix' },
      scales: { ...colorSystemData, scaleMethod: 'radix' },
    };

    expect(validateUIToPluginMessage(message).valid).toBe(false);
  });

  it('rejects missing or inconsistent scale metadata', () => {
    const missingMetadata = {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: {
        ...colorSystemData,
        scales: {
          light: {
            ...colorSystemData.scales.light,
            primary: {
              name: customScale.name,
              role: customScale.role,
              steps: customScale.steps,
            },
          },
        },
      },
    };
    const mismatchedMode = {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: {
        ...colorSystemData,
        scales: {
          light: {
            ...colorSystemData.scales.light,
            primary: { ...customScale, mode: 'dark' },
          },
        },
      },
    };

    expect(validateUIToPluginMessage(missingMetadata).valid).toBe(false);
    expect(validateUIToPluginMessage(mismatchedMode).valid).toBe(false);
  });

  it('rejects custom scale anchors that do not match assigned source colors', () => {
    const message = {
      type: 'generate-color-system',
      ...generationRequest,
      config: {
        ...colorSystemConfig,
        sourceColors: [color],
        roleAssignments: [{ ...color, role: 'primary', roles: ['primary'] }],
      },
      scales: colorSystemData,
    };

    expect(validateUIToPluginMessage(message).valid).toBe(false);
  });

  it('accepts valid maximum grid bounds', () => {
    const message = {
      type: 'create-grid-frame',
      config: {
        columns: {
          ...columns,
          count: 1000,
          gutterSize: 0,
          offset: 0,
        },
      },
      frameName: 'Boundary Grid',
      width: 100000,
      height: 100000,
    };

    expect(validateUIToPluginMessage(message).valid).toBe(true);
  });

  it.each([
    {
      name: 'missing request ID',
      message: {
        type: 'apply-grid',
        sourceConfig: { columns: sourceColumns },
        expectedTargetIds: ['1:2'],
        replaceExisting: true,
      },
    },
    {
      name: 'missing expected target IDs',
      message: {
        type: 'apply-grid',
        requestId: 'grid-apply-missing-targets',
        sourceConfig: { columns: sourceColumns },
        replaceExisting: true,
      },
    },
    {
      name: 'duplicate expected target IDs',
      message: {
        type: 'apply-grid',
        requestId: 'grid-apply-duplicate-targets',
        sourceConfig: { columns: sourceColumns },
        expectedTargetIds: ['1:2', '1:2'],
        replaceExisting: true,
      },
    },
    {
      name: 'empty sourceConfig',
      message: {
        type: 'apply-grid',
        requestId: 'grid-apply-empty-config',
        sourceConfig: {},
        expectedTargetIds: ['1:2'],
        replaceExisting: true,
      },
    },
  ])('rejects unsafe apply-grid payload: $name', ({ message }) => {
    expect(validateUIToPluginMessage(message).valid).toBe(false);
    expect(isUIToPluginMessage(message)).toBe(false);
  });

  it.each([
    null,
    [],
    {},
    { type: 'unknown' },
    { type: 'apply-fill', ...color, hex: '#fff' },
    { type: 'apply-fill', ...color, rgb: [0, 0, 256] },
    { type: 'apply-gradient', gradientType: 'LINEAR', colors: [color] },
    { type: 'apply-gradient', gradientType: 'INVALID', colors: [color, color] },
    { type: 'notify', text: '   ' },
    {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: {
        ...colorSystemData,
        usageProportions: { ...colorSystemData.usageProportions, neutral: 19 },
      },
    },
    {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: {
        ...colorSystemData,
        scales: { light: {} },
      },
    },
    {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: { ...colorSystemData, scaleMethod: 'radix' },
    },
    {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: {
        ...colorSystemData,
        scales: {
          light: {
            ...colorSystemData.scales.light,
            primary: {
              ...customScale,
              steps: customScale.steps.map(step => ({ ...step, hex: '#123456' })),
            },
          },
        },
      },
    },
    {
      type: 'generate-color-system',
      ...generationRequest,
      config: { ...colorSystemConfig, systemName: 'Different System' },
      scales: colorSystemData,
    },
    {
      type: 'create-grid-frame',
      config: {},
      frameName: 'Grid',
      width: 1440,
      height: 900,
    },
    {
      type: 'create-grid-frame',
      config: { columns },
      frameName: 'Grid',
      width: 0,
      height: 900,
    },
    {
      type: 'apply-grid',
      requestId: 'grid-apply-invalid-color',
      sourceConfig: {
        columns: { ...sourceColumns, color: { ...gridColor, a: 2 } },
      },
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    },
    {
      type: 'apply-grid',
      requestId: 'grid-apply-missing-config',
      sourceDimensions: { width: 1440, height: 900 },
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    },
    {
      type: 'apply-grid',
      requestId: 'grid-apply-invalid-gutter',
      sourceConfig: { columns: { ...sourceColumns, gutterSize: Number.NaN } },
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    },
    {
      type: 'apply-grid',
      requestId: 'grid-apply-invalid-alignment',
      sourceConfig: { columns: { ...sourceColumns, alignment: 'SIDE' } },
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    },
  ])('rejects malformed message %#', message => {
    const result = validateUIToPluginMessage(message);

    expect(result.valid).toBe(false);
    expect(isUIToPluginMessage(message)).toBe(false);
    if (!result.valid) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('requires reference dimensions for canonical and scaling modes', () => {
    const message = {
      type: 'apply-grid',
      requestId: 'grid-apply-canonical',
      sourceConfig: { columns: sourceColumns },
      applicationMode: 'canonical-only',
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    };

    expect(validateUIToPluginMessage(message)).toEqual({
      valid: false,
      error: 'apply-grid: canonical-only requires sourceDimensions',
    });
  });

  it('accepts a bounded responsive-width contract without reference dimensions', () => {
    const message = {
      type: 'apply-grid',
      requestId: 'grid-apply-responsive',
      sourceConfig: { columns: sourceColumns },
      applicationMode: 'responsive-width',
      responsiveWidth: { min: 600, max: 904 },
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    };

    expect(validateUIToPluginMessage(message)).toEqual({ valid: true, message });
  });

  it('rejects an invalid responsive-width contract', () => {
    const message = {
      type: 'apply-grid',
      requestId: 'grid-apply-responsive-invalid',
      sourceConfig: { columns: sourceColumns },
      applicationMode: 'responsive-width',
      responsiveWidth: { min: 905, max: 600 },
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    };

    expect(validateUIToPluginMessage(message)).toEqual({
      valid: false,
      error: 'apply-grid: responsive-width requires a valid responsiveWidth contract',
    });
  });
});

describe('backend message boundary', () => {
  it('routes a valid correlated color system transaction once', async () => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify: vi.fn(),
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        ui: {
          onmessage: undefined,
          postMessage: vi.fn(),
        },
      },
    });

    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;
    const message = {
      type: 'generate-color-system' as const,
      ...generationRequest,
      config: colorSystemConfig,
      scales: colorSystemData,
    };

    await onmessage(message);

    expect(backendMocks.handleGenerateColorSystem).toHaveBeenCalledOnce();
    expect(backendMocks.handleGenerateColorSystem).toHaveBeenCalledWith(message);
  });

  it('notifies and does not route an invalid message', async () => {
    const notify = vi.fn();

    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify,
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        ui: {
          onmessage: undefined,
        },
      },
    });

    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({ type: 'apply-fill', hex: 'invalid', name: 'Invalid' });

    expect(notify).toHaveBeenCalledWith('Invalid plugin message');
    expect(backendMocks.handleApplyFill).not.toHaveBeenCalled();
    expect(backendMocks.handleApplyStroke).not.toHaveBeenCalled();
    expect(backendMocks.handleCreateStyle).not.toHaveBeenCalled();
    expect(backendMocks.handleApplyGradient).not.toHaveBeenCalled();
    expect(backendMocks.handleCreateGridFrame).not.toHaveBeenCalled();
    expect(backendMocks.handleApplyGrid).not.toHaveBeenCalled();
    expect(backendMocks.handleGenerateColorSystem).not.toHaveBeenCalled();
    expect(backendMocks.generateColorSystemFrames).not.toHaveBeenCalled();
  });

  it('returns a correlated failure for an invalid apply-grid request', async () => {
    const postMessage = vi.fn();

    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify: vi.fn(),
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        ui: {
          onmessage: undefined,
          postMessage,
        },
      },
    });

    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({
      type: 'apply-grid',
      requestId: 'grid-apply-invalid',
      sourceConfig: {},
      expectedTargetIds: ['frame-1'],
      replaceExisting: true,
    });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'grid-applied',
      requestId: 'grid-apply-invalid',
      success: false,
      appliedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      message: 'Grid apply rejected: invalid request',
      error: 'Invalid grid apply request',
    });
    expect(backendMocks.handleApplyGrid).not.toHaveBeenCalled();
  });

  it('rejects malformed custom scales before frame or style mutation', async () => {
    const notify = vi.fn();
    const postMessage = vi.fn();
    const malformedCustomScale = {
      ...customScale,
      steps: customScale.steps.map(step => ({ ...step, hex: '#123456' })),
    };
    const malformedData = {
      ...colorSystemData,
      scales: {
        light: {
          neutral: scale,
          primary: malformedCustomScale,
        },
      },
    };

    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify,
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        ui: {
          onmessage: undefined,
          postMessage,
        },
      },
    });

    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: malformedData,
    });
    expect(notify).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: generationRequest.requestId,
      success: false,
      error: 'Invalid color system request',
    });
    expect(backendMocks.handleGenerateColorSystem).not.toHaveBeenCalled();
    expect(backendMocks.generateColorSystemFrames).not.toHaveBeenCalled();
  });
});
