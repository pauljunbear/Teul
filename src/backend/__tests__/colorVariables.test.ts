import { beforeEach, describe, expect, it, vi } from 'vitest';
import { radixColors } from '../../lib/radixColors';
import { buildSemanticColorPolicy } from '../../lib/semanticColorPolicy';
import type { CreateStylesData } from '../../types/colorSystem';
import { createColorVariables } from '../colorVariables';

function makeScale(mode: 'light' | 'dark') {
  return {
    name: 'Neutral',
    role: 'neutral',
    steps: Array.from({ length: 12 }, (_, index) => ({
      step: index + 1,
      hex: mode === 'light' ? '#112233' : '#ddeeff',
    })),
    profile: 'sRGB' as const,
    method: 'Teul OKLCH v2' as const,
    mode,
  };
}

function makeData(includeDarkMode = true): CreateStylesData {
  return {
    systemName: 'Test',
    includeDarkMode,
    scaleMethod: 'custom',
    scales: {
      light: { neutral: makeScale('light') },
      dark: includeDarkMode ? { neutral: makeScale('dark') } : undefined,
    },
  };
}

function makeConstrainedData(): CreateStylesData {
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
  const light = {
    neutral: toScale('light', 'gray'),
    primary: toScale('light', 'blue'),
  };
  const dark = {
    neutral: toScale('dark', 'gray'),
    primary: toScale('dark', 'blue'),
  };

  return {
    systemName: 'Constrained',
    includeDarkMode: true,
    scaleMethod: 'wcag-constrained',
    scales: { light, dark },
    semanticPolicy: buildSemanticColorPolicy(light, dark),
  };
}

function installVariablesMock(options: { failAddMode?: boolean } = {}) {
  const modeList = [{ modeId: 'mode-light', name: 'Mode 1' }];
  const variables: Variable[] = [];
  const removeCollection = vi.fn();
  const collectionPluginData = new Map<string, string>();
  const collection = {
    id: 'collection-1',
    name: 'Test Colors',
    defaultModeId: 'mode-light',
    get modes() {
      return modeList;
    },
    variableIds: [],
    renameMode: vi.fn((modeId: string, name: string) => {
      const mode = modeList.find(item => item.modeId === modeId);
      if (mode) mode.name = name;
    }),
    addMode: vi.fn((name: string) => {
      if (options.failAddMode) throw new Error('Mode limit reached');
      const modeId = `mode-${name.toLowerCase()}`;
      modeList.push({ modeId, name });
      return modeId;
    }),
    removeMode: vi.fn(),
    remove: removeCollection,
    getPluginData: vi.fn((key: string) => collectionPluginData.get(key) ?? ''),
    setPluginData: vi.fn((key: string, value: string) => collectionPluginData.set(key, value)),
  } as unknown as VariableCollection;

  const createVariable = vi.fn((name: string, owner: VariableCollection) => {
    if (/[.{}]/.test(name)) throw new Error(`Invalid Figma variable name: ${name}`);
    const valuesByMode: Record<string, VariableValue> = {};
    const pluginData = new Map<string, string>();
    const variable = {
      id: `variable-${variables.length + 1}`,
      name,
      description: '',
      resolvedType: 'COLOR',
      variableCollectionId: owner.id,
      valuesByMode,
      scopes: [],
      setValueForMode: vi.fn((modeId: string, value: VariableValue) => {
        valuesByMode[modeId] = value;
      }),
      remove: vi.fn(),
      getPluginData: vi.fn((key: string) => pluginData.get(key) ?? ''),
      setPluginData: vi.fn((key: string, value: string) => pluginData.set(key, value)),
    } as unknown as Variable;
    variables.push(variable);
    return variable;
  });

  vi.stubGlobal('figma', {
    variables: {
      getLocalVariableCollectionsAsync: vi.fn().mockResolvedValue([]),
      createVariableCollection: vi.fn(() => collection),
      getLocalVariablesAsync: vi.fn().mockResolvedValue([]),
      createVariable,
      createVariableAlias: vi.fn((variable: Variable) => ({
        type: 'VARIABLE_ALIAS',
        id: variable.id,
      })),
    },
  });

  return { collection, variables, removeCollection, createVariable };
}

function installExistingVariablesMock(options: { owned?: boolean; failOnceAt?: number } = {}) {
  const owned = options.owned ?? true;
  const modeList = [
    { modeId: 'mode-light', name: 'Light' },
    { modeId: 'mode-dark', name: 'Dark' },
  ];
  const collectionPluginData = new Map<string, string>();
  if (owned) collectionPluginData.set('teul-color-system', '1');
  const collection = {
    id: 'collection-1',
    name: 'Test Colors',
    defaultModeId: 'mode-light',
    modes: modeList,
    renameMode: vi.fn(),
    addMode: vi.fn(),
    removeMode: vi.fn(),
    remove: vi.fn(),
    getPluginData: vi.fn((key: string) => collectionPluginData.get(key) ?? ''),
    setPluginData: vi.fn((key: string, value: string) => collectionPluginData.set(key, value)),
  } as unknown as VariableCollection;

  let setAttempts = 0;
  let hasFailed = false;
  const suffixes = [
    '50',
    '100',
    '200',
    '300',
    '400',
    '500',
    '600',
    '700',
    '800',
    '900',
    '1000',
    '1100',
  ];
  const variables = Array.from({ length: 12 }, (_, index) => {
    const pluginData = new Map<string, string>();
    if (owned) pluginData.set('teul-color-system', '1');
    const valuesByMode: Record<string, VariableValue> = {
      'mode-light': { r: 0, g: 0, b: 0 },
      'mode-dark': { r: 0, g: 0, b: 0 },
    };
    return {
      id: `variable-${index + 1}`,
      name: `neutral/${suffixes[index]}`,
      description: 'Previous description',
      resolvedType: 'COLOR',
      variableCollectionId: collection.id,
      valuesByMode,
      scopes: ['TEXT_FILL'],
      setValueForMode: vi.fn((modeId: string, value: VariableValue) => {
        setAttempts++;
        if (!hasFailed && options.failOnceAt === setAttempts) {
          hasFailed = true;
          throw new Error('Injected variable update failure');
        }
        valuesByMode[modeId] = value;
      }),
      remove: vi.fn(),
      getPluginData: vi.fn((key: string) => pluginData.get(key) ?? ''),
      setPluginData: vi.fn((key: string, value: string) => pluginData.set(key, value)),
    } as unknown as Variable;
  });

  vi.stubGlobal('figma', {
    variables: {
      getLocalVariableCollectionsAsync: vi.fn().mockResolvedValue([collection]),
      createVariableCollection: vi.fn(),
      getLocalVariablesAsync: vi.fn().mockResolvedValue(variables),
      createVariable: vi.fn(),
      createVariableAlias: vi.fn((variable: Variable) => ({
        type: 'VARIABLE_ALIAS',
        id: variable.id,
      })),
    },
  });
  return { collection, variables };
}

describe('native Figma color variables', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('creates one collection with light and dark values for every scale step', async () => {
    const { collection, variables, createVariable } = installVariablesMock();

    await createColorVariables(makeData(), 'Test');

    expect(figma.variables.createVariableCollection).toHaveBeenCalledWith('Test Colors');
    expect(collection.renameMode).toHaveBeenCalledWith('mode-light', 'Light');
    expect(collection.addMode).toHaveBeenCalledWith('Dark');
    expect(createVariable).toHaveBeenCalledTimes(12);
    expect(variables[0].name).toBe('neutral/50');
    expect(variables[0].valuesByMode['mode-light']).toEqual({
      r: 17 / 255,
      g: 34 / 255,
      b: 51 / 255,
    });
    expect(variables[0].valuesByMode['mode-dark']).toEqual({
      r: 221 / 255,
      g: 238 / 255,
      b: 1,
    });
  });

  it('creates WCAG semantic aliases with Figma-valid hierarchical names', async () => {
    const { variables, createVariable } = installVariablesMock();

    const transaction = await createColorVariables(makeConstrainedData(), 'Constrained');

    expect(transaction.report.semanticAliasCount).toBe(10);
    expect(createVariable).toHaveBeenCalledWith(
      'semantic/background/canvas',
      expect.anything(),
      'COLOR'
    );
    expect(createVariable).toHaveBeenCalledWith(
      'semantic/action/backgroundHover',
      expect.anything(),
      'COLOR'
    );
    expect(variables.every(variable => !/[.{}]/.test(variable.name))).toBe(true);
    expect(
      variables.find(variable => variable.name === 'semantic/text/primary')?.valuesByMode[
        'mode-light'
      ]
    ).toMatchObject({ type: 'VARIABLE_ALIAS' });
  });

  it('removes a newly created collection if the plan cannot add a required mode', async () => {
    const { removeCollection, createVariable } = installVariablesMock({ failAddMode: true });

    await expect(createColorVariables(makeData(), 'Test')).rejects.toThrow('Mode limit reached');

    expect(createVariable).not.toHaveBeenCalled();
    expect(removeCollection).toHaveBeenCalledOnce();
  });

  it('updates only Teul-owned variables and can restore the prior values', async () => {
    const { variables } = installExistingVariablesMock();

    const transaction = await createColorVariables(makeData(), 'Test', 'update-local');

    expect(transaction.report).toMatchObject({
      primitiveCount: 12,
      updatedCount: 12,
      createdCount: 0,
    });
    expect(variables[0].valuesByMode['mode-light']).toEqual({
      r: 17 / 255,
      g: 34 / 255,
      b: 51 / 255,
    });

    expect(transaction.rollback()).toEqual([]);
    expect(variables[0].valuesByMode['mode-light']).toEqual({ r: 0, g: 0, b: 0 });
    expect(variables[0].description).toBe('Previous description');
    expect(variables[0].scopes).toEqual(['TEXT_FILL']);
  });

  it('rejects unrelated variables before changing them', async () => {
    const { variables } = installExistingVariablesMock({ owned: false });

    await expect(createColorVariables(makeData(), 'Test', 'update-local')).rejects.toThrow(
      'is not marked as Teul-owned'
    );
    expect(
      variables.every(variable => vi.mocked(variable.setValueForMode).mock.calls.length === 0)
    ).toBe(true);
  });

  it('restores earlier variables when a later update fails', async () => {
    const { variables } = installExistingVariablesMock({ failOnceAt: 3 });

    await expect(createColorVariables(makeData(), 'Test', 'update-local')).rejects.toThrow(
      'Injected variable update failure'
    );
    expect(variables[0].valuesByMode['mode-light']).toEqual({ r: 0, g: 0, b: 0 });
    expect(variables[0].valuesByMode['mode-dark']).toEqual({ r: 0, g: 0, b: 0 });
    expect(variables[1].valuesByMode['mode-light']).toEqual({ r: 0, g: 0, b: 0 });
  });
});
