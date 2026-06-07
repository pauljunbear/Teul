import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateColorSystemFrames, type ColorSystemData } from '../colorSystemGeneration';

const scalesData: ColorSystemData = {
  systemName: 'Atomic Test',
  detailLevel: 'minimal',
  includeDarkMode: false,
  scaleMethod: 'custom',
  scales: {
    light: {
      neutral: {
        name: 'Neutral',
        role: 'neutral',
        steps: [],
        profile: 'sRGB',
        method: 'Teul OKLCH v2',
        mode: 'light',
      },
    },
  },
  usageProportions: {
    primary: 0,
    secondary: 0,
    tertiary: 0,
    accent: 0,
    neutral: 100,
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('generateColorSystemFrames atomic generation', () => {
  it('aborts before creating frames when a required font fails to load', async () => {
    const createFrame = vi.fn();
    vi.stubGlobal('figma', {
      loadFontAsync: vi.fn(({ style }: FontName) =>
        style === 'Bold' ? Promise.reject(new Error('font unavailable')) : Promise.resolve()
      ),
      createFrame,
    });

    await expect(generateColorSystemFrames({}, scalesData)).rejects.toThrow(
      'required fonts failed to load'
    );

    expect(createFrame).not.toHaveBeenCalled();
  });

  it('removes the new root frame and rethrows when generation fails later', async () => {
    const generationError = new Error('layout generation failed');
    const pageChildren: SceneNode[] = [];
    const root = {
      remove: vi.fn(() =>
        pageChildren.splice(pageChildren.indexOf(root as unknown as SceneNode), 1)
      ),
    } as unknown as FrameNode;
    const partialFrame = {
      set name(_value: string) {
        throw generationError;
      },
      remove: vi.fn(() =>
        pageChildren.splice(pageChildren.indexOf(partialFrame as unknown as SceneNode), 1)
      ),
    } as unknown as FrameNode;
    const createFrame = vi
      .fn()
      .mockImplementationOnce(() => {
        pageChildren.push(root);
        return root;
      })
      .mockImplementationOnce(() => {
        pageChildren.push(partialFrame);
        return partialFrame;
      });

    vi.stubGlobal('figma', {
      loadFontAsync: vi.fn().mockResolvedValue(undefined),
      createFrame,
      currentPage: { children: pageChildren },
    });

    await expect(generateColorSystemFrames({}, scalesData)).rejects.toBe(generationError);

    expect(root.remove).toHaveBeenCalledOnce();
    expect(partialFrame.remove).toHaveBeenCalledOnce();
    expect(pageChildren).toHaveLength(0);
  });

  it('preserves unrelated page nodes created while generation is in progress', async () => {
    const generationError = new Error('layout generation failed');
    const pageChildren: SceneNode[] = [];
    const unrelatedNode = {
      remove: vi.fn(() =>
        pageChildren.splice(pageChildren.indexOf(unrelatedNode as unknown as SceneNode), 1)
      ),
    } as unknown as SceneNode;
    const root = {
      remove: vi.fn(() =>
        pageChildren.splice(pageChildren.indexOf(root as unknown as SceneNode), 1)
      ),
    } as unknown as FrameNode;
    const partialFrame = {
      set name(_value: string) {
        throw generationError;
      },
      remove: vi.fn(() =>
        pageChildren.splice(pageChildren.indexOf(partialFrame as unknown as SceneNode), 1)
      ),
    } as unknown as FrameNode;
    const createFrame = vi
      .fn()
      .mockImplementationOnce(() => {
        pageChildren.push(root);
        return root;
      })
      .mockImplementationOnce(() => {
        pageChildren.push(unrelatedNode, partialFrame);
        return partialFrame;
      });

    vi.stubGlobal('figma', {
      loadFontAsync: vi.fn().mockResolvedValue(undefined),
      createFrame,
      currentPage: { children: pageChildren },
    });

    await expect(generateColorSystemFrames({}, scalesData)).rejects.toBe(generationError);

    expect(root.remove).toHaveBeenCalledOnce();
    expect(partialFrame.remove).toHaveBeenCalledOnce();
    expect(unrelatedNode.remove).not.toHaveBeenCalled();
    expect(pageChildren).toEqual([unrelatedNode]);
  });

  it('rejects concurrent generation before either operation can share node ownership', async () => {
    let resolveFonts!: () => void;
    const fontsLoaded = new Promise<void>(resolve => {
      resolveFonts = resolve;
    });
    const generationError = new Error('layout generation failed');
    const partialFrame = {
      set name(_value: string) {
        throw generationError;
      },
      remove: vi.fn(),
    } as unknown as FrameNode;
    const createFrame = vi.fn(() => partialFrame);

    vi.stubGlobal('figma', {
      loadFontAsync: vi.fn(() => fontsLoaded),
      createFrame,
    });

    const firstGeneration = generateColorSystemFrames({}, scalesData);

    await expect(generateColorSystemFrames({}, scalesData)).rejects.toThrow(
      'Color system generation is already in progress'
    );
    expect(createFrame).not.toHaveBeenCalled();

    resolveFonts();
    await expect(firstGeneration).rejects.toBe(generationError);
    expect(partialFrame.remove).toHaveBeenCalledOnce();
  });
});
