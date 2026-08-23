import { beforeEach, describe, expect, it, vi } from 'vitest';
import { radixColors } from '../../lib/radixColors';
import { buildSemanticColorPolicy } from '../../lib/semanticColorPolicy';
import { generateColorScale } from '../../lib/colorScale';
import type { GenerateColorSystemMessage } from '../../types/messages';

const backendMocks = vi.hoisted(() => ({
  generateColorSystemFrames: vi.fn(),
  createColorStyles: vi.fn(),
  resolveColorSystemOutputName: vi.fn(),
}));

vi.mock('../colorSystemGeneration', () => ({
  generateColorSystemFrames: backendMocks.generateColorSystemFrames,
}));
vi.mock('../colorStyles', () => ({
  createColorStyles: backendMocks.createColorStyles,
}));
vi.mock('../colorSystemCollision', () => ({
  resolveColorSystemOutputName: backendMocks.resolveColorSystemOutputName,
}));

import {
  handleGenerateColorSystem,
  MAX_COMPLETED_COLOR_SYSTEM_RESULTS,
} from '../colorSystemTransaction';

function createMessage(requestId: string, createStyles = false): GenerateColorSystemMessage {
  return {
    type: 'generate-color-system',
    requestId,
    createStyles,
    createVariables: false,
    config: {} as GenerateColorSystemMessage['config'],
    scales: {
      systemName: 'Transaction Test',
    } as GenerateColorSystemMessage['scales'],
  };
}

function createConstrainedMessage(requestId: string): GenerateColorSystemMessage {
  const toScale = (mode: 'light' | 'dark', name: 'gray' | 'blue') => ({
    name,
    role: name === 'gray' ? 'neutral' : 'primary',
    profile: 'sRGB' as const,
    method: 'Radix Colors' as const,
    mode,
    sourceVersion: '3.0.0',
    sourceFamily: name,
    steps: Object.entries(radixColors[name][mode]).map(([step, hex]) => ({
      step: Number(step),
      hex,
    })),
  });
  const scales = {
    light: {
      neutral: toScale('light', 'gray'),
      primary: toScale('light', 'blue'),
    },
    dark: {
      neutral: toScale('dark', 'gray'),
      primary: toScale('dark', 'blue'),
    },
  };

  return {
    ...createMessage(requestId, true),
    scales: {
      systemName: 'Transaction Test',
      detailLevel: 'detailed',
      includeDarkMode: true,
      scaleMethod: 'wcag-constrained',
      scales,
      semanticPolicy: buildSemanticColorPolicy(scales.light, scales.dark),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  backendMocks.resolveColorSystemOutputName.mockResolvedValue({
    outputName: 'Transaction Test',
    warnings: [],
  });
  backendMocks.createColorStyles.mockResolvedValue({
    styleCount: 4,
    createdCount: 4,
    updatedCount: 0,
    skippedCount: 0,
    warnings: [],
  });
  const originalSelection = [{ id: 'original-selection' }] as unknown as SceneNode[];
  vi.stubGlobal('figma', {
    root: { documentColorProfile: 'SRGB' },
    currentPage: { selection: originalSelection },
    notify: vi.fn(),
    ui: { postMessage: vi.fn() },
    commitUndo: vi.fn(),
    viewport: {
      center: { x: 10, y: 20 },
      zoom: 1.5,
    },
  });
});

describe('handleGenerateColorSystem', () => {
  it('posts a correlated terminal success after the requested mutations complete', async () => {
    const frame = { remove: vi.fn() } as unknown as FrameNode;
    backendMocks.generateColorSystemFrames.mockResolvedValue(frame);
    const message = createMessage('transaction-success', true);
    await handleGenerateColorSystem(message);

    expect(backendMocks.generateColorSystemFrames).toHaveBeenCalledWith(
      {
        ...message.config,
        systemName: message.scales.systemName,
        documentColorProfile: 'srgb',
      },
      { ...message.scales, documentColorProfile: 'srgb' },
      {
        notify: false,
        beforeFirstMutation: expect.any(Function),
      }
    );
    expect(backendMocks.createColorStyles).toHaveBeenCalledWith(
      { ...message.scales, documentColorProfile: 'srgb' },
      message.scales.systemName,
      'cancel',
      expect.any(Function)
    );
    expect(frame.remove).not.toHaveBeenCalled();
    expect(figma.ui.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'color-system-operation-result',
        requestId: message.requestId,
        success: true,
        outputName: 'Transaction Test',
        styleCount: 4,
        frameCount: 1,
      })
    );
  });

  it('removes completed frames when optional style creation fails', async () => {
    const frame = { remove: vi.fn() } as unknown as FrameNode;
    const styleError = new Error('style creation failed');
    const originalSelection = [...figma.currentPage.selection];
    backendMocks.generateColorSystemFrames.mockImplementation(async () => {
      figma.currentPage.selection = [frame];
      figma.viewport.center = { x: 200, y: 300 };
      figma.viewport.zoom = 0.5;
      return frame;
    });
    backendMocks.createColorStyles.mockRejectedValue(styleError);

    const message = createMessage('transaction-style-failure', true);
    await handleGenerateColorSystem(message);

    expect(frame.remove).toHaveBeenCalledOnce();
    expect(figma.currentPage.selection).toEqual(originalSelection);
    expect(figma.viewport.center).toEqual({ x: 10, y: 20 });
    expect(figma.viewport.zoom).toBe(1.5);
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error: styleError.message,
    });
  });

  it('includes a failed generated-frame rollback in the terminal transaction error', async () => {
    const styleError = new Error('style creation failed');
    const rollbackError = new Error('frame removal failed');
    const frame = {
      remove: vi.fn(() => {
        throw rollbackError;
      }),
    } as unknown as FrameNode;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    backendMocks.generateColorSystemFrames.mockResolvedValue(frame);
    backendMocks.createColorStyles.mockRejectedValue(styleError);

    const message = createMessage('transaction-frame-rollback-failure', true);
    await handleGenerateColorSystem(message);

    expect(frame.remove).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to roll back generated color system frame:',
      rollbackError
    );
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error:
        'style creation failed; rollback failed: generated frame removal failed (frame removal failed)',
    });
  });

  it('does not start style creation when frame generation fails', async () => {
    const frameError = new Error('frame generation failed');
    backendMocks.generateColorSystemFrames.mockRejectedValue(frameError);

    const message = createMessage('transaction-frame-failure', true);
    await handleGenerateColorSystem(message);

    expect(backendMocks.createColorStyles).not.toHaveBeenCalled();
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error: frameError.message,
    });
  });

  it('rejects a WCAG-constrained request unless its semantic policy passed', async () => {
    const message = createMessage('transaction-invalid-semantic-policy', true);
    message.scales.scaleMethod = 'wcag-constrained';

    await handleGenerateColorSystem(message);

    expect(backendMocks.generateColorSystemFrames).not.toHaveBeenCalled();
    expect(backendMocks.createColorStyles).not.toHaveBeenCalled();
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error: 'WCAG-constrained semantic token policy must be current and pass before generation',
    });
  });

  it.each([
    ['DISPLAY_P3', 'Display P3'],
    ['LEGACY', 'legacy'],
    [undefined, 'unknown'],
  ])(
    're-reads the live %s root profile and performs zero sRGB color-system mutations',
    async (rootProfile, expectedLabel) => {
      const message = createConstrainedMessage(`transaction-profile-${expectedLabel}`);
      message.config.documentColorProfile = 'srgb';
      message.scales.documentColorProfile = 'srgb';
      (figma.root as unknown as { documentColorProfile?: unknown }).documentColorProfile =
        rootProfile;

      await handleGenerateColorSystem(message);

      expect(backendMocks.resolveColorSystemOutputName).not.toHaveBeenCalled();
      expect(backendMocks.generateColorSystemFrames).not.toHaveBeenCalled();
      expect(backendMocks.createColorStyles).not.toHaveBeenCalled();
      expect(figma.commitUndo).not.toHaveBeenCalled();
      expect(figma.ui.postMessage).toHaveBeenCalledWith({
        type: 'color-system-operation-result',
        requestId: message.requestId,
        success: false,
        error: expect.stringContaining(`current profile is ${expectedLabel}`),
      });
    }
  );

  it('blocks non-constrained sRGB source mutation in a live Display P3 document', async () => {
    const message = createMessage('transaction-live-profile');
    message.config.documentColorProfile = 'srgb';
    message.scales.documentColorProfile = 'srgb';
    (figma.root as unknown as { documentColorProfile?: unknown }).documentColorProfile =
      'DISPLAY_P3';

    await handleGenerateColorSystem(message);

    expect(backendMocks.resolveColorSystemOutputName).not.toHaveBeenCalled();
    expect(backendMocks.generateColorSystemFrames).not.toHaveBeenCalled();
    expect(figma.ui.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'color-system-operation-result',
        requestId: message.requestId,
        success: false,
        error: expect.stringContaining('current profile is Display P3'),
      })
    );
  });

  it('rechecks the live profile after async collision preflight and before constrained mutation', async () => {
    const message = createConstrainedMessage('transaction-profile-toctou');
    backendMocks.resolveColorSystemOutputName.mockImplementationOnce(async () => {
      (figma.root as unknown as { documentColorProfile?: unknown }).documentColorProfile =
        'DISPLAY_P3';
      return { outputName: 'Transaction Test', warnings: [] };
    });

    await handleGenerateColorSystem(message);

    expect(backendMocks.generateColorSystemFrames).not.toHaveBeenCalled();
    expect(backendMocks.createColorStyles).not.toHaveBeenCalled();
    expect(figma.commitUndo).not.toHaveBeenCalled();
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error: expect.stringContaining('current profile is Display P3'),
    });
  });

  it('rechecks the live profile after async font loading immediately before first mutation', async () => {
    const message = createConstrainedMessage('transaction-font-profile-race');
    backendMocks.generateColorSystemFrames.mockImplementationOnce(
      async (_config, _scales, options: { beforeFirstMutation: () => void }) => {
        (figma.root as unknown as { documentColorProfile?: unknown }).documentColorProfile =
          'DISPLAY_P3';
        options.beforeFirstMutation();
        return { remove: vi.fn() } as unknown as FrameNode;
      }
    );

    await handleGenerateColorSystem(message);

    expect(backendMocks.createColorStyles).not.toHaveBeenCalled();
    expect(figma.commitUndo).not.toHaveBeenCalled();
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error: expect.stringContaining('current profile is Display P3'),
    });
  });

  it('rolls back if the document profile changes between frame and style mutations', async () => {
    const frame = { remove: vi.fn() } as unknown as FrameNode;
    const message = createMessage('transaction-mid-mutation-profile-race', true);
    backendMocks.generateColorSystemFrames.mockImplementationOnce(
      async (_config, _scales, options: { beforeFirstMutation: () => void }) => {
        options.beforeFirstMutation();
        return frame;
      }
    );
    backendMocks.createColorStyles.mockImplementationOnce(
      async (_scales, _name, _policy, beforeMutation: () => void) => {
        (figma.root as unknown as { documentColorProfile?: unknown }).documentColorProfile =
          'DISPLAY_P3';
        beforeMutation();
        return {
          styleCount: 0,
          createdCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          warnings: [],
        };
      }
    );

    await handleGenerateColorSystem(message);

    expect(frame.remove).toHaveBeenCalledOnce();
    expect(figma.commitUndo).not.toHaveBeenCalled();
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error: expect.stringContaining('no mixed-profile output was kept'),
    });
  });

  it('allows a current 13-pair sRGB constrained policy after the live profile preflight', async () => {
    const frame = { remove: vi.fn() } as unknown as FrameNode;
    backendMocks.generateColorSystemFrames.mockResolvedValue(frame);
    const message = createConstrainedMessage('transaction-live-srgb');

    expect(message.scales.semanticPolicy).toMatchObject({
      standard: 'WCAG 2.2',
      colorSpace: 'sRGB',
      valid: true,
    });
    expect(message.scales.semanticPolicy?.modes.light.pairings).toHaveLength(13);
    expect(message.scales.semanticPolicy?.modes.dark?.pairings).toHaveLength(13);

    await handleGenerateColorSystem(message);

    expect(backendMocks.generateColorSystemFrames).toHaveBeenCalledOnce();
    expect(backendMocks.createColorStyles).toHaveBeenCalledOnce();
    expect(figma.commitUndo).toHaveBeenCalledOnce();
    expect(figma.ui.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'color-system-operation-result',
        requestId: message.requestId,
        success: true,
      })
    );
  });

  it('recomputes the WCAG-constrained policy before starting any mutations', async () => {
    const message = createConstrainedMessage('transaction-forged-semantic-policy');
    message.scales.semanticPolicy = {
      ...message.scales.semanticPolicy!,
      valid: true,
      modes: {
        ...message.scales.semanticPolicy!.modes,
        light: {
          ...message.scales.semanticPolicy!.modes.light,
          tokens: {
            ...message.scales.semanticPolicy!.modes.light.tokens,
            'action.text': {
              ...message.scales.semanticPolicy!.modes.light.tokens['action.text'],
              value: '#ffffff',
            },
          },
        },
      },
    };

    await handleGenerateColorSystem(message);

    expect(backendMocks.generateColorSystemFrames).not.toHaveBeenCalled();
    expect(backendMocks.createColorStyles).not.toHaveBeenCalled();
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error: 'WCAG-constrained semantic token policy must be current and pass before generation',
    });
  });

  it('rejects forged Exact Radix values before starting any mutations', async () => {
    const message = createConstrainedMessage('transaction-forged-radix');
    message.scales.scales.light.neutral!.steps[8].hex = '#123456';

    await handleGenerateColorSystem(message);

    expect(backendMocks.generateColorSystemFrames).not.toHaveBeenCalled();
    expect(backendMocks.createColorStyles).not.toHaveBeenCalled();
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error: 'Exact Radix sRGB Solid claims must match the pinned bundled values',
    });
  });

  it('rejects forged values carrying a Teul OKLCH v3 method claim before mutation', async () => {
    const message = createMessage('transaction-forged-local-minde');
    const generated = generateColorScale('#3366cc', 'light', 'Primary');
    message.scales.scales = {
      light: {
        neutral: {
          name: 'Primary',
          role: 'primary',
          profile: 'sRGB',
          method: 'Teul OKLCH v3',
          mode: 'light',
          steps: generated.steps.map(({ step, hex }) => ({ step, hex })),
          validation: generated.validation,
        },
      },
    };
    message.scales.scales.light.neutral.steps[7].hex = generated.steps[6].hex;

    await handleGenerateColorSystem(message);

    expect(backendMocks.generateColorSystemFrames).not.toHaveBeenCalled();
    expect(backendMocks.createColorStyles).not.toHaveBeenCalled();
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error: 'Teul OKLCH v3 claims must match backend-regenerated Local MINDE scales',
    });
  });

  it('deduplicates active and replayed request IDs without repeating mutations', async () => {
    let resolveGeneration!: (frame: FrameNode) => void;
    const generation = new Promise<FrameNode>(resolve => {
      resolveGeneration = resolve;
    });
    const frame = { remove: vi.fn() } as unknown as FrameNode;
    backendMocks.generateColorSystemFrames.mockReturnValue(generation);

    const message = createMessage('transaction-duplicate');
    const firstSubmission = handleGenerateColorSystem(message);
    await handleGenerateColorSystem(message);

    expect(backendMocks.generateColorSystemFrames).toHaveBeenCalledOnce();
    expect(figma.ui.postMessage).not.toHaveBeenCalled();

    resolveGeneration(frame);
    await firstSubmission;
    await handleGenerateColorSystem(message);

    expect(backendMocks.generateColorSystemFrames).toHaveBeenCalledOnce();
    expect(figma.ui.postMessage).toHaveBeenCalledTimes(2);
    expect(figma.ui.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'color-system-operation-result',
        requestId: message.requestId,
        success: true,
      })
    );
  });

  it('rejects active requestId reuse with a different payload without repeating mutations', async () => {
    let resolveGeneration!: (frame: FrameNode) => void;
    const generation = new Promise<FrameNode>(resolve => {
      resolveGeneration = resolve;
    });
    const frame = { remove: vi.fn() } as unknown as FrameNode;
    backendMocks.generateColorSystemFrames.mockReturnValue(generation);

    const message = createMessage('transaction-active-payload-conflict');
    const conflictingMessage = {
      ...message,
      scales: {
        ...message.scales,
        systemName: 'Different Transaction',
      },
    };
    const firstSubmission = handleGenerateColorSystem(message);
    await handleGenerateColorSystem(conflictingMessage);

    expect(backendMocks.generateColorSystemFrames).toHaveBeenCalledOnce();
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error:
        'requestId "transaction-active-payload-conflict" was already used for a different color system payload',
    });

    resolveGeneration(frame);
    await firstSubmission;
  });

  it('rejects completed requestId reuse with a different payload instead of replaying stale success', async () => {
    const frame = { remove: vi.fn() } as unknown as FrameNode;
    backendMocks.generateColorSystemFrames.mockResolvedValue(frame);

    const message = createMessage('transaction-completed-payload-conflict');
    await handleGenerateColorSystem(message);
    vi.mocked(figma.ui.postMessage).mockClear();

    await handleGenerateColorSystem({
      ...message,
      scales: {
        ...message.scales,
        systemName: 'Different Transaction',
      },
    });

    expect(backendMocks.generateColorSystemFrames).toHaveBeenCalledOnce();
    expect(figma.ui.postMessage).toHaveBeenCalledOnce();
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error:
        'requestId "transaction-completed-payload-conflict" was already used for a different color system payload',
    });
  });

  it('evicts the oldest completed transaction result when retention reaches its bound', async () => {
    const frame = { remove: vi.fn() } as unknown as FrameNode;
    backendMocks.generateColorSystemFrames.mockResolvedValue(frame);
    const firstMessage = createMessage('transaction-retention-0');

    for (let index = 0; index <= MAX_COMPLETED_COLOR_SYSTEM_RESULTS; index++) {
      await handleGenerateColorSystem(createMessage(`transaction-retention-${index}`));
    }

    expect(backendMocks.generateColorSystemFrames).toHaveBeenCalledTimes(
      MAX_COMPLETED_COLOR_SYSTEM_RESULTS + 1
    );

    await handleGenerateColorSystem(firstMessage);

    expect(backendMocks.generateColorSystemFrames).toHaveBeenCalledTimes(
      MAX_COMPLETED_COLOR_SYSTEM_RESULTS + 2
    );
  });
});
