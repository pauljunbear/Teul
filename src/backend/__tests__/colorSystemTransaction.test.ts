import { beforeEach, describe, expect, it, vi } from 'vitest';
import { radixColors } from '../../lib/radixColors';
import { buildSemanticColorPolicy } from '../../lib/semanticColorPolicy';
import type { GenerateColorSystemMessage } from '../../types/messages';

const backendMocks = vi.hoisted(() => ({
  generateColorSystemFrames: vi.fn(),
  createColorStyles: vi.fn(),
}));

vi.mock('../colorSystemGeneration', () => ({
  generateColorSystemFrames: backendMocks.generateColorSystemFrames,
}));
vi.mock('../colorStyles', () => ({
  createColorStyles: backendMocks.createColorStyles,
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
      usageProportions: {
        primary: 35,
        secondary: 0,
        tertiary: 0,
        accent: 0,
        neutral: 65,
      },
      semanticPolicy: buildSemanticColorPolicy(scales.light, scales.dark),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const originalSelection = [{ id: 'original-selection' }] as unknown as SceneNode[];
  vi.stubGlobal('figma', {
    currentPage: { selection: originalSelection },
    notify: vi.fn(),
    ui: { postMessage: vi.fn() },
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
    backendMocks.createColorStyles.mockResolvedValue(undefined);

    const message = createMessage('transaction-success', true);
    await handleGenerateColorSystem(message);

    expect(backendMocks.generateColorSystemFrames).toHaveBeenCalledWith(
      message.config,
      message.scales,
      { notify: false }
    );
    expect(backendMocks.createColorStyles).toHaveBeenCalledWith(
      message.scales,
      message.scales.systemName
    );
    expect(frame.remove).not.toHaveBeenCalled();
    expect(figma.ui.postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: true,
    });
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
      error: 'Exact Radix Colors claims must match the pinned bundled values',
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
    expect(figma.ui.postMessage).toHaveBeenLastCalledWith({
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: true,
    });
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
