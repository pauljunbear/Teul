import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSemanticColorPolicy } from '../../lib/semanticColorPolicy';
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
};

interface MockNode {
  name: string;
  children: MockNode[];
  parent: MockNode | null;
  characters?: string;
  width: number;
  height: number;
  appendChild: (child: MockNode) => void;
  resize: (width: number, height: number) => void;
  remove: ReturnType<typeof vi.fn>;
}

function makeNode(): MockNode {
  const node: MockNode = {
    name: '',
    children: [],
    parent: null,
    width: 0,
    height: 0,
    appendChild(child) {
      child.parent = node;
      node.children.push(child);
    },
    resize(width, height) {
      node.width = width;
      node.height = height;
    },
    remove: vi.fn(),
  };
  return node;
}

function makeFullScale(mode: 'light' | 'dark') {
  return {
    name: 'Neutral',
    role: 'neutral',
    steps: Array.from({ length: 12 }, (_, index) => ({
      step: index + 1,
      hex:
        index + 1 === 10
          ? mode === 'light'
            ? '#222222'
            : '#dddddd'
          : index < 6
            ? mode === 'light'
              ? '#ffffff'
              : '#000000'
            : mode === 'light'
              ? '#111111'
              : '#eeeeee',
    })),
    profile: 'sRGB' as const,
    method: 'Teul OKLCH v2' as const,
    mode,
  };
}

function stubSuccessfulFigmaGeneration() {
  const nodes: MockNode[] = [];
  const createNode = () => {
    const node = makeNode();
    nodes.push(node);
    return node;
  };
  const currentPage = { selection: [] as SceneNode[] };

  vi.stubGlobal('figma', {
    loadFontAsync: vi.fn().mockResolvedValue(undefined),
    createFrame: vi.fn(createNode),
    createRectangle: vi.fn(createNode),
    createEllipse: vi.fn(createNode),
    createText: vi.fn(createNode),
    currentPage,
    viewport: {
      center: { x: 0, y: 0 },
      scrollAndZoomIntoView: vi.fn(),
    },
    notify: vi.fn(),
  });

  return { nodes, currentPage };
}

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

  it.each(['minimal', 'detailed', 'presentation'] as const)(
    'adds the typed constrained WCAG report to %s frames',
    async detailLevel => {
      const { nodes } = stubSuccessfulFigmaGeneration();
      const lightScale = makeFullScale('light');
      const darkScale = makeFullScale('dark');
      const constrainedData: ColorSystemData = {
        ...scalesData,
        detailLevel,
        includeDarkMode: true,
        scaleMethod: 'wcag-constrained',
        scales: {
          light: { neutral: lightScale },
          dark: { neutral: darkScale },
        },
        semanticPolicy: buildSemanticColorPolicy({ neutral: lightScale }, { neutral: darkScale }),
      };

      const container = await generateColorSystemFrames({}, constrainedData, { notify: false });

      expect(container.name).toContain('WCAG-Constrained Semantic Tokens');
      expect(nodes.map(node => node.name)).toContain('WCAG Policy Report (light)');
      expect(nodes.map(node => node.name)).toContain('WCAG Policy Report (dark)');
      expect(nodes.map(node => node.name)).toContain('Semantic Token - background.canvas');
      expect(nodes.map(node => node.name)).toContain('Semantic Token - text.primary');
      expect(nodes.map(node => node.characters).filter(Boolean)).toEqual(
        expect.arrayContaining([
          'WCAG 2.2 SEMANTIC TOKEN POLICY',
          'WCAG 2.2 · AA + enhanced primary text',
          'MODE PASS',
          'Scope: declared semantic token pairings only; this is not whole-design WCAG conformance.',
          'TESTED PAIRINGS (13/13 pass)',
          'Enhanced primary text on the canvas background · 18.88:1 · required 7.0:1 · PASS',
        ])
      );
    }
  );

  it('does not add a WCAG report to a nonconstrained detailed frame', async () => {
    const { nodes } = stubSuccessfulFigmaGeneration();
    const customData: ColorSystemData = {
      ...scalesData,
      detailLevel: 'detailed',
      scales: { light: { neutral: makeFullScale('light') } },
    };

    await generateColorSystemFrames({}, customData, { notify: false });

    expect(nodes.map(node => node.name)).not.toContain('WCAG Policy Report (light)');
  });

  it.each(['minimal', 'detailed', 'presentation'] as const)(
    'does not present untested semantic, pairing, CTA, or usage advice in custom %s output',
    async detailLevel => {
      const { nodes } = stubSuccessfulFigmaGeneration();
      const customData: ColorSystemData = {
        ...scalesData,
        detailLevel,
        scales: { light: { neutral: makeFullScale('light') } },
      };

      await generateColorSystemFrames({}, customData, { notify: false });

      const names = nodes.map(node => node.name);
      const text = nodes
        .map(node => node.characters)
        .filter((characters): characters is string => Boolean(characters))
        .join('\n');

      expect(names).not.toContain('Semantic Labels');
      expect(names).not.toContain('Usage Proportions');
      expect(names).not.toContain('Color Pairing Guide');
      expect(text).not.toMatch(
        /SEMANTIC USAGE GUIDE|RADIX STEP USAGE GUIDE|High Contrast|Harmonious Duo|Accents & CTAs|All colors work together/
      );
    }
  );

  it('rejects forged Exact Radix values before creating frames', async () => {
    const forgedScale = {
      ...makeFullScale('light'),
      method: 'Radix Colors' as const,
      sourceVersion: '3.0.0',
      sourceFamily: 'blue',
    };

    await expect(
      generateColorSystemFrames(
        {},
        {
          ...scalesData,
          scaleMethod: 'radix-match',
          scales: { light: { neutral: forgedScale } },
        },
        { notify: false }
      )
    ).rejects.toThrow('Exact Radix Colors claims must match the pinned bundled values');
  });

  it('rejects generated scales mislabeled as Exact Radix mode', async () => {
    await expect(
      generateColorSystemFrames(
        {},
        {
          ...scalesData,
          scaleMethod: 'radix-match',
          scales: { light: { neutral: makeFullScale('light') } },
        },
        { notify: false }
      )
    ).rejects.toThrow('Exact Radix Colors mode requires only pinned bundled values');
  });
});
