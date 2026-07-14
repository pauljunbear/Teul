import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerateColorSystemMessage } from '../../types/messages';
import { resolveColorSystemOutputName } from '../colorSystemCollision';

function resource<T extends { name: string }>(value: T, owned = false): T {
  const pluginData = new Map<string, string>();
  if (owned) pluginData.set('teul-color-system', '1');
  return {
    ...value,
    getPluginData: (key: string) => pluginData.get(key) ?? '',
    setPluginData: (key: string, data: string) => pluginData.set(key, data),
  };
}

function message(
  collisionPolicy: GenerateColorSystemMessage['collisionPolicy']
): GenerateColorSystemMessage {
  return {
    type: 'generate-color-system',
    requestId: 'collision-test',
    createVariables: true,
    createStyles: true,
    collisionPolicy,
    config: { systemName: 'Brand' } as GenerateColorSystemMessage['config'],
    scales: { systemName: 'Brand' } as GenerateColorSystemMessage['scales'],
  };
}

beforeEach(() => {
  vi.stubGlobal('figma', {
    variables: { getLocalVariableCollectionsAsync: vi.fn().mockResolvedValue([]) },
    getLocalPaintStylesAsync: vi.fn().mockResolvedValue([]),
  });
});

describe('color system collision resolution', () => {
  it('keeps the requested name when no local output collides', async () => {
    await expect(resolveColorSystemOutputName(message('cancel'))).resolves.toEqual({
      outputName: 'Brand',
      warnings: [],
    });
  });

  it('cancels before mutation when local output already exists', async () => {
    vi.mocked(figma.variables.getLocalVariableCollectionsAsync).mockResolvedValue([
      resource({ name: 'Brand Colors' }) as unknown as VariableCollection,
    ]);

    await expect(resolveColorSystemOutputName(message('cancel'))).rejects.toThrow(
      'Local output already exists for "Brand"'
    );
  });

  it('allows updates only when every matching resource is Teul-owned', async () => {
    vi.mocked(figma.variables.getLocalVariableCollectionsAsync).mockResolvedValue([
      resource({ name: 'Brand Colors' }, true) as unknown as VariableCollection,
    ]);
    vi.mocked(figma.getLocalPaintStylesAsync).mockResolvedValue([
      resource({ name: 'Brand/Neutral/1000' }, false) as unknown as PaintStyle,
    ]);

    await expect(resolveColorSystemOutputName(message('update-local'))).rejects.toThrow(
      'is not marked as Teul-owned'
    );

    vi.mocked(figma.getLocalPaintStylesAsync).mockResolvedValue([
      resource({ name: 'Brand/Neutral/1000' }, true) as unknown as PaintStyle,
    ]);
    await expect(resolveColorSystemOutputName(message('update-local'))).resolves.toEqual({
      outputName: 'Brand',
      warnings: [],
    });
  });

  it('finds one collision-free copy name without changing existing output', async () => {
    vi.mocked(figma.variables.getLocalVariableCollectionsAsync).mockResolvedValue([
      resource({ name: 'Brand Colors' }) as unknown as VariableCollection,
      resource({ name: 'Brand Copy Colors' }) as unknown as VariableCollection,
    ]);

    await expect(resolveColorSystemOutputName(message('create-copy'))).resolves.toEqual({
      outputName: 'Brand Copy 2',
      warnings: ['Existing local output was preserved; created "Brand Copy 2" instead.'],
    });
  });
});
