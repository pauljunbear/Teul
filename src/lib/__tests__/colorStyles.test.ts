import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createColorStyles, type CreateStylesData } from '../../backend/colorStyles';

interface CreatedStyle {
  name: string;
  paints: Paint[];
  description?: string;
  remove: ReturnType<typeof vi.fn>;
}

const createdStyles: CreatedStyle[] = [];

beforeEach(() => {
  createdStyles.length = 0;
  vi.stubGlobal('figma', {
    getLocalPaintStylesAsync: vi.fn().mockResolvedValue([]),
    createPaintStyle: vi.fn(() => {
      const style: CreatedStyle = { name: '', paints: [], remove: vi.fn() };
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

    await createColorStyles(data, 'Brand');

    const names = createdStyles.map(style => style.name);
    expect(names).toHaveLength(new Set(names).size);
    expect(names.filter(name => name === 'Brand/Shared/1000')).toHaveLength(1);
    expect(names.filter(name => name === 'Brand/Shared/1100')).toHaveLength(1);
    expect(figma.notify).toHaveBeenCalledWith(
      'Created 5 color styles; skipped 2 duplicate queued names'
    );
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
      { name: 'Brand/Neutral/1000', paints: [solidPaint('#111111')] } as unknown as PaintStyle,
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

    await createColorStyles(data, 'Brand');

    expect(createdStyles.map(style => style.name)).not.toContain('Brand/Neutral/1000');
    expect(createdStyles.map(style => style.name)).toContain('Brand/Neutral/1100');
    expect(figma.notify).toHaveBeenCalledWith('Created 3 color styles; skipped 1 existing name');
  });

  it('rejects an existing same-name style with a different paint before creating styles', async () => {
    vi.mocked(figma.getLocalPaintStylesAsync).mockResolvedValue([
      { name: 'Brand/Neutral/1000', paints: [solidPaint('#ffffff')] } as unknown as PaintStyle,
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

    await expect(createColorStyles(data, 'Brand')).rejects.toThrow(
      'Color style conflict for "Brand/Neutral/1000": existing paint does not match requested #111111'
    );
    expect(createdStyles).toEqual([]);
    expect(figma.notify).not.toHaveBeenCalled();
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

    await Promise.all([createColorStyles(data, 'Brand'), createColorStyles(data, 'Brand')]);

    const names = createdStyles.map(style => style.name);
    expect(names).toHaveLength(4);
    expect(names).toHaveLength(new Set(names).size);
    expect(figma.getLocalPaintStylesAsync).toHaveBeenCalledTimes(2);
    expect(figma.notify).toHaveBeenNthCalledWith(1, 'Created 4 color styles');
    expect(figma.notify).toHaveBeenNthCalledWith(
      2,
      'Created 0 color styles; skipped 4 existing names'
    );
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
          neutral: {
            ...makeScale('Neutral'),
            method: 'Radix Colors',
            profile: 'sRGB',
          },
        },
      },
    };

    await createColorStyles(data, 'Brand');

    expect(createdStyles[0].description).toBe('Radix Colors · sRGB');
  });

  it('rolls back newly created styles after a Figma API exception and preserves existing styles', async () => {
    const existingStyle = {
      name: 'Brand/Neutral/1000',
      paints: [solidPaint('#111111')],
      remove: vi.fn(),
    };
    const apiError = new Error('Figma paints assignment failed');
    let createAttempts = 0;

    vi.mocked(figma.getLocalPaintStylesAsync).mockResolvedValue([
      existingStyle as unknown as PaintStyle,
    ]);
    vi.mocked(figma.createPaintStyle).mockImplementation(() => {
      createAttempts++;
      const style: CreatedStyle = { name: '', paints: [], remove: vi.fn() };
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

    await expect(createColorStyles(data, 'Brand')).rejects.toBe(apiError);

    expect(createdStyles).toHaveLength(3);
    expect(createdStyles.every(style => style.remove.mock.calls.length === 1)).toBe(true);
    expect(existingStyle.remove).not.toHaveBeenCalled();
    expect(figma.notify).not.toHaveBeenCalled();

    vi.mocked(figma.getLocalPaintStylesAsync).mockResolvedValue([]);
    await createColorStyles(data, 'Recovered');
    expect(figma.notify).toHaveBeenCalledWith('Created 4 color styles');
  });

  it('reports failed style removals in the rejected operation error', async () => {
    const apiError = new Error('Figma paints assignment failed');
    const rollbackError = new Error('Style removal failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let createAttempts = 0;

    vi.mocked(figma.createPaintStyle).mockImplementation(() => {
      createAttempts++;
      const style: CreatedStyle = { name: '', paints: [], remove: vi.fn() };
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
      'Figma paints assignment failed; failed to roll back 1 created color style'
    );
    expect(createdStyles).toHaveLength(3);
    expect(createdStyles.every(style => style.remove.mock.calls.length === 1)).toBe(true);
    expect(consoleError).toHaveBeenCalledWith('Failed to roll back color style:', rollbackError);
  });
});
