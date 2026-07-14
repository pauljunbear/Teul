import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createColorStyles, type CreateStylesData } from '../../backend/colorStyles';
import { radixColors } from '../radixColors';
import { buildSemanticColorPolicy } from '../semanticColorPolicy';

interface CreatedStyle {
  name: string;
  paints: Paint[];
  description: string;
  remove: ReturnType<typeof vi.fn>;
  getPluginData: (key: string) => string;
  setPluginData: (key: string, value: string) => void;
}

const createdStyles: CreatedStyle[] = [];

beforeEach(() => {
  createdStyles.length = 0;
  vi.stubGlobal('figma', {
    getLocalPaintStylesAsync: vi.fn().mockResolvedValue([]),
    createPaintStyle: vi.fn(() => {
      const pluginData = new Map<string, string>();
      const style: CreatedStyle = {
        name: '',
        paints: [],
        description: '',
        remove: vi.fn(),
        getPluginData: key => pluginData.get(key) ?? '',
        setPluginData: (key, value) => {
          pluginData.set(key, value);
        },
      };
      createdStyles.push(style);
      return style;
    }),
    notify: vi.fn(),
  });
});

function makeScale(role: string) {
  return {
    name: role,
    role,
    profile: 'sRGB' as const,
    method: 'Radix Colors' as const,
    mode: 'light' as const,
    steps: [
      { step: 11, hex: '#111111' },
      { step: 12, hex: '#121212' },
    ],
  };
}

function solidPaint(hex: string): Paint {
  const cleanHex = hex.replace('#', '');
  return {
    type: 'SOLID',
    color: {
      r: parseInt(cleanHex.slice(0, 2), 16) / 255,
      g: parseInt(cleanHex.slice(2, 4), 16) / 255,
      b: parseInt(cleanHex.slice(4, 6), 16) / 255,
    },
  };
}

function storedStyle(name: string, hex: string, owned = true): PaintStyle {
  const pluginData = new Map<string, string>();
  if (owned) pluginData.set('teul-color-system', '1');
  return {
    name,
    paints: [solidPaint(hex)],
    description: '',
    remove: vi.fn(),
    getPluginData: (key: string) => pluginData.get(key) ?? '',
    setPluginData: (key: string, value: string) => {
      pluginData.set(key, value);
    },
  } as unknown as PaintStyle;
}

function makeConstrainedScale(mode: 'light' | 'dark') {
  const background = mode === 'light' ? '#ffffff' : '#000000';
  const foreground = mode === 'light' ? '#111111' : '#eeeeee';
  return {
    name: 'Neutral',
    role: 'Neutral',
    profile: 'sRGB' as const,
    method: 'Teul OKLCH v2' as const,
    mode,
    steps: Array.from({ length: 12 }, (_, index) => ({
      step: index + 1,
      hex:
        index + 1 === 10
          ? mode === 'light'
            ? '#222222'
            : '#dddddd'
          : index + 1 === 8
            ? '#777777'
            : index < 6
              ? background
              : foreground,
    })),
  };
}

function makeConstrainedStylesData(includeDark = true): CreateStylesData {
  const light = { neutral: makeConstrainedScale('light') };
  const dark = includeDark ? { neutral: makeConstrainedScale('dark') } : undefined;
  return {
    systemName: 'Brand',
    includeDarkMode: includeDark,
    scaleMethod: 'wcag-constrained',
    scales: { light, dark },
    semanticPolicy: buildSemanticColorPolicy(light, dark),
  };
}

function makeExactRadixScale(role: string, family: 'blue' | 'slate' = 'slate') {
  return {
    name: role,
    role,
    profile: 'sRGB' as const,
    method: 'Radix Colors' as const,
    mode: 'light' as const,
    sourceVersion: '3.0.0',
    sourceFamily: family,
    steps: Object.entries(radixColors[family].light).map(([step, hex]) => ({
      step: Number(step),
      hex,
    })),
  };
}

describe('createColorStyles', () => {
  it('uses the established Figma style names and preserves dynamically numbered scales', async () => {
    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: {
        light: {
          neutral: makeScale('Neutral'),
          secondary2: makeScale('Secondary 2'),
          secondary: makeScale('Secondary'),
          primary2: makeScale('Primary 2'),
          primary: makeScale('Primary'),
        },
      },
    };

    await createColorStyles(data, 'Brand');

    const scaleStyleNames = createdStyles
      .map(style => style.name)
      .filter(name => !name.includes('/Semantic/'));

    expect(scaleStyleNames).toEqual([
      'Brand/Primary/1000',
      'Brand/Primary/1100',
      'Brand/Primary 2/1000',
      'Brand/Primary 2/1100',
      'Brand/Secondary/1000',
      'Brand/Secondary/1100',
      'Brand/Secondary 2/1000',
      'Brand/Secondary 2/1100',
      'Brand/Neutral/1000',
      'Brand/Neutral/1100',
    ]);
  });

  it('creates only one style for duplicate names queued by colliding scale inputs', async () => {
    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: {
        light: {
          primary: makeScale('Shared'),
          neutral: makeScale('Shared'),
        },
      },
    };

    const report = await createColorStyles(data, 'Brand');

    const names = createdStyles.map(style => style.name);
    expect(names).toHaveLength(new Set(names).size);
    expect(names.filter(name => name === 'Brand/Shared/1000')).toHaveLength(1);
    expect(names.filter(name => name === 'Brand/Shared/1100')).toHaveLength(1);
    expect(report).toMatchObject({ createdCount: 5, skippedCount: 2, updatedCount: 0 });
  });

  it('rejects duplicate queued names that request different paints before creating styles', async () => {
    const conflictingScale = {
      ...makeScale('Shared'),
      steps: [
        { step: 11, hex: '#222222' },
        { step: 12, hex: '#121212' },
      ],
    };
    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: {
        light: {
          primary: makeScale('Shared'),
          neutral: conflictingScale,
        },
      },
    };

    await expect(createColorStyles(data, 'Brand')).rejects.toThrow(
      'Color style conflict for "Brand/Shared/1000": duplicate queued name requests both #111111 and #222222'
    );
    expect(createdStyles).toEqual([]);
    expect(figma.notify).not.toHaveBeenCalled();
  });

  it('preserves the historical meaning of an existing 1000 style when regenerating', async () => {
    vi.mocked(figma.getLocalPaintStylesAsync).mockResolvedValue([
      storedStyle('Brand/Neutral/1000', '#111111'),
    ]);
    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: {
        light: {
          neutral: makeScale('Neutral'),
        },
      },
    };

    const report = await createColorStyles(data, 'Brand', 'update-local');

    expect(createdStyles.map(style => style.name)).not.toContain('Brand/Neutral/1000');
    expect(createdStyles.map(style => style.name)).toContain('Brand/Neutral/1100');
    expect(report).toMatchObject({ createdCount: 3, updatedCount: 1, skippedCount: 0 });
  });

  it('updates a Teul-owned same-name style with a different paint', async () => {
    const existing = storedStyle('Brand/Neutral/1000', '#ffffff');
    vi.mocked(figma.getLocalPaintStylesAsync).mockResolvedValue([existing]);
    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: {
        light: {
          neutral: makeScale('Neutral'),
        },
      },
    };

    const report = await createColorStyles(data, 'Brand', 'update-local');

    expect(existing.paints).toEqual([solidPaint('#111111')]);
    expect(report.updatedCount).toBe(1);
  });

  it('refuses to update an unrelated local style', async () => {
    vi.mocked(figma.getLocalPaintStylesAsync).mockResolvedValue([
      storedStyle('Brand/Neutral/1000', '#ffffff', false),
    ]);
    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: { light: { neutral: makeScale('Neutral') } },
    };

    await expect(createColorStyles(data, 'Brand', 'update-local')).rejects.toThrow(
      'is not marked as Teul-owned'
    );
    expect(createdStyles).toEqual([]);
  });

  it('serializes overlapping requests so later calls observe newly created names', async () => {
    vi.mocked(figma.getLocalPaintStylesAsync).mockImplementation(
      async () => [...createdStyles] as unknown as PaintStyle[]
    );
    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: {
        light: {
          neutral: makeScale('Neutral'),
        },
      },
    };

    const reports = await Promise.all([
      createColorStyles(data, 'Brand', 'update-local'),
      createColorStyles(data, 'Brand', 'update-local'),
    ]);

    const names = createdStyles.map(style => style.name);
    expect(names).toHaveLength(4);
    expect(names).toHaveLength(new Set(names).size);
    expect(figma.getLocalPaintStylesAsync).toHaveBeenCalledTimes(2);
    expect(reports[0]).toMatchObject({ createdCount: 4, skippedCount: 0 });
    expect(reports[1]).toMatchObject({ createdCount: 0, skippedCount: 4 });
  });

  it('rejects invalid colors before creating any styles', async () => {
    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: {
        light: {
          primary: {
            name: 'Primary',
            role: 'Primary',
            profile: 'sRGB',
            method: 'Radix Colors',
            mode: 'light',
            steps: [{ step: 1, hex: 'not-a-color' }],
          },
          neutral: makeScale('Neutral'),
        },
      },
    };

    await expect(createColorStyles(data, 'Brand')).rejects.toThrow(
      'Invalid hex color: not-a-color'
    );
    expect(createdStyles).toEqual([]);
  });

  it('persists source and validation metadata in generated style descriptions', async () => {
    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: {
        light: {
          neutral: makeExactRadixScale('Neutral'),
        },
      },
    };

    await createColorStyles(data, 'Brand');

    expect(createdStyles[0].description).toBe('Radix Colors · sRGB');
  });

  it('does not label unverified direct Radix-method style data as official Radix', async () => {
    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: {
        light: {
          neutral: makeScale('Neutral'),
        },
      },
    };

    await createColorStyles(data, 'Brand');

    expect(createdStyles[0].description).toBe('Unverified color scale · sRGB');
  });

  it('creates declared constrained semantic styles for both modes without heuristic aliases', async () => {
    const data = makeConstrainedStylesData();

    await createColorStyles(data, 'Brand');

    const semanticStyles = createdStyles.filter(style => style.name.includes('/Semantic/'));
    expect(semanticStyles.map(style => style.name)).toEqual(
      expect.arrayContaining([
        'Brand/Light/Semantic/background.canvas',
        'Brand/Light/Semantic/text.primary',
        'Brand/Dark/Semantic/background.canvas',
        'Brand/Dark/Semantic/text.primary',
      ])
    );
    expect(semanticStyles).toHaveLength(20);
    expect(
      semanticStyles.every(style =>
        style.description?.startsWith('WCAG-constrained semantic token · ')
      )
    ).toBe(true);
    expect(semanticStyles.map(style => style.name)).not.toContain('Brand/Light/Semantic/bg-app');
  });

  it('rejects a constrained semantic style collision before creating any styles', async () => {
    vi.mocked(figma.getLocalPaintStylesAsync).mockResolvedValue([
      storedStyle('Brand/Semantic/background.canvas', '#000000', false),
    ]);
    const data = makeConstrainedStylesData(false);

    await expect(createColorStyles(data, 'Brand', 'update-local')).rejects.toThrow(
      'Color style "Brand/Semantic/background.canvas" is not marked as Teul-owned'
    );
    expect(createdStyles).toEqual([]);
    expect(figma.notify).not.toHaveBeenCalled();
  });

  it('rolls back newly created styles after a Figma API exception and preserves existing styles', async () => {
    const existingStyle = storedStyle('Brand/Neutral/1000', '#111111');
    const apiError = new Error('Figma paints assignment failed');
    let createAttempts = 0;

    vi.mocked(figma.getLocalPaintStylesAsync).mockResolvedValue([
      existingStyle as unknown as PaintStyle,
    ]);
    vi.mocked(figma.createPaintStyle).mockImplementation(() => {
      createAttempts++;
      const style = storedStyle('', '#000000') as unknown as CreatedStyle;
      style.paints = [];
      if (createAttempts === 3) {
        Object.defineProperty(style, 'paints', {
          get: () => [],
          set: () => {
            throw apiError;
          },
        });
      }
      createdStyles.push(style);
      return style as unknown as PaintStyle;
    });

    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: {
        light: {
          neutral: makeScale('Neutral'),
        },
      },
    };

    await expect(createColorStyles(data, 'Brand', 'update-local')).rejects.toBe(apiError);

    expect(createdStyles).toHaveLength(3);
    expect(createdStyles.every(style => style.remove.mock.calls.length === 1)).toBe(true);
    expect(existingStyle.remove).not.toHaveBeenCalled();

    vi.mocked(figma.getLocalPaintStylesAsync).mockResolvedValue([]);
    const recovered = await createColorStyles(data, 'Recovered');
    expect(recovered.createdCount).toBe(4);
  });

  it('restores earlier Teul-owned style updates when a later update fails', async () => {
    const first = storedStyle('Brand/Neutral/1000', '#ffffff');
    const second = storedStyle('Brand/Neutral/1100', '#ffffff');
    let secondPaints: readonly Paint[] = second.paints;
    let failNextAssignment = true;
    Object.defineProperty(second, 'paints', {
      get: () => secondPaints,
      set: (value: readonly Paint[]) => {
        if (failNextAssignment) {
          failNextAssignment = false;
          throw new Error('Injected style update failure');
        }
        secondPaints = value;
      },
    });
    vi.mocked(figma.getLocalPaintStylesAsync).mockResolvedValue([first, second]);
    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: { light: { neutral: makeScale('Neutral') } },
    };

    await expect(createColorStyles(data, 'Brand', 'update-local')).rejects.toThrow(
      'Injected style update failure'
    );

    expect(first.paints).toEqual([solidPaint('#ffffff')]);
    expect(second.paints).toEqual([solidPaint('#ffffff')]);
    expect(createdStyles.every(style => style.remove.mock.calls.length === 1)).toBe(true);
  });

  it('reports failed style removals in the rejected operation error', async () => {
    const apiError = new Error('Figma paints assignment failed');
    const rollbackError = new Error('Style removal failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let createAttempts = 0;

    vi.mocked(figma.createPaintStyle).mockImplementation(() => {
      createAttempts++;
      const style = storedStyle('', '#000000') as unknown as CreatedStyle;
      style.paints = [];
      if (createAttempts === 1) {
        style.remove.mockImplementation(() => {
          throw rollbackError;
        });
      }
      if (createAttempts === 3) {
        Object.defineProperty(style, 'paints', {
          get: () => [],
          set: () => {
            throw apiError;
          },
        });
      }
      createdStyles.push(style);
      return style as unknown as PaintStyle;
    });

    const data: CreateStylesData = {
      systemName: 'Brand',
      includeDarkMode: false,
      scaleMethod: 'radix-match',
      scales: {
        light: {
          neutral: makeScale('Neutral'),
        },
      },
    };

    await expect(createColorStyles(data, 'Brand')).rejects.toThrow(
      'Figma paints assignment failed; rollback failed: style "Brand/Neutral/1000" removal failed'
    );
    expect(createdStyles).toHaveLength(3);
    expect(createdStyles.every(style => style.remove.mock.calls.length === 1)).toBe(true);
    expect(consoleError).toHaveBeenCalledWith('Failed to roll back color style:', rollbackError);
  });
});
