import { getOrderedScaleKeys, stepToStyleSuffix } from '../lib/colorExport';
import { isSemanticColorPolicyCurrent } from '../lib/semanticColorPolicy';
import type { CreateStylesData } from '../types/colorSystem';
import { hexToFigmaRgb } from './figmaHelpers';
import type { ColorCollisionPolicy } from './colorSystemCollision';
import { isTeulColorResource, markTeulColorResource } from './colorResourceOwnership';

type ModeName = 'Light' | 'Dark';

interface RequestedVariable {
  name: string;
  description: string;
  values: Partial<Record<ModeName, RGB | VariableAlias>>;
}

function getSemanticVariableName(tokenName: string): string {
  // Figma rejects periods in variable names. Slashes retain the semantic
  // hierarchy in the Variables panel without changing the exported token key.
  return `semantic/${tokenName.split('.').join('/')}`;
}

interface UpdatedVariableSnapshot {
  variable: Variable;
  description: string;
  scopes: VariableScope[];
  values: Array<{ modeId: string; value: VariableValue }>;
}

export interface ColorVariableReport {
  collectionName: string;
  modes: ModeName[];
  primitiveCount: number;
  semanticAliasCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  warnings: string[];
}

export interface ColorVariableTransaction {
  report: ColorVariableReport;
  rollback(): string[];
}

function valuesMatch(left: VariableValue | undefined, right: RGB | VariableAlias): boolean {
  if (left === undefined || typeof left !== 'object' || left === null) return false;
  if ('type' in right) {
    return 'type' in left && left.type === 'VARIABLE_ALIAS' && left.id === right.id;
  }
  return (
    'r' in left &&
    'g' in left &&
    'b' in left &&
    Math.abs(left.r - right.r) <= 1e-6 &&
    Math.abs(left.g - right.g) <= 1e-6 &&
    Math.abs(left.b - right.b) <= 1e-6
  );
}

function arraysMatch<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getCollectionName(systemName: string): string {
  return `${systemName} Colors`;
}

function buildPrimitiveRequests(scalesData: CreateStylesData): RequestedVariable[] {
  const requests = new Map<string, RequestedVariable>();
  const addMode = (scales: CreateStylesData['scales']['light'], mode: ModeName): void => {
    for (const key of getOrderedScaleKeys(scales)) {
      const scale = scales[key];
      if (!scale) continue;
      for (const step of scale.steps) {
        const name = `${key}/${stepToStyleSuffix(step.step)}`;
        const request = requests.get(name) ?? {
          name,
          description: `${scale.method} · ${scale.profile}`,
          values: {},
        };
        request.values[mode] = hexToFigmaRgb(step.hex);
        requests.set(name, request);
      }
    }
  };

  addMode(scalesData.scales.light, 'Light');
  if (scalesData.includeDarkMode && scalesData.scales.dark) {
    addMode(scalesData.scales.dark, 'Dark');
  }
  return [...requests.values()];
}

function getOrCreateModes(
  collection: VariableCollection,
  includeDarkMode: boolean,
  collectionWasCreated: boolean
): { modeIds: Record<ModeName, string | undefined>; addedModeIds: string[] } {
  const addedModeIds: string[] = [];
  if (collectionWasCreated) collection.renameMode(collection.defaultModeId, 'Light');

  const lightMode = collection.modes.find(mode => mode.name === 'Light');
  if (!lightMode) throw new Error('Existing variable collection must contain a Light mode');

  let darkMode = collection.modes.find(mode => mode.name === 'Dark');
  if (includeDarkMode && !darkMode) {
    const modeId = collection.addMode('Dark');
    addedModeIds.push(modeId);
    darkMode = { modeId, name: 'Dark' };
  }

  return {
    modeIds: { Light: lightMode.modeId, Dark: darkMode?.modeId },
    addedModeIds,
  };
}

function snapshotVariable(variable: Variable, modeIds: readonly string[]): UpdatedVariableSnapshot {
  return {
    variable,
    description: variable.description,
    scopes: [...variable.scopes],
    values: modeIds.flatMap(modeId => {
      const value = variable.valuesByMode[modeId];
      return value === undefined ? [] : [{ modeId, value }];
    }),
  };
}

function applyRequestedVariable(params: {
  variable: Variable;
  request: RequestedVariable;
  modeIds: Record<ModeName, string | undefined>;
  addedModeIds: readonly string[];
  isNew: boolean;
  collisionPolicy: ColorCollisionPolicy;
  updatedSnapshots: UpdatedVariableSnapshot[];
}): boolean {
  const { variable, request, modeIds, addedModeIds, isNew, collisionPolicy, updatedSnapshots } =
    params;
  if (variable.resolvedType !== 'COLOR') {
    throw new Error(`Variable "${request.name}" is not a color variable`);
  }
  if (!isNew && collisionPolicy !== 'update-local') {
    throw new Error(`Variable collision for "${request.name}"`);
  }
  if (!isNew && !isTeulColorResource(variable)) {
    throw new Error(`Variable "${request.name}" is not marked as Teul-owned. Choose Create copy.`);
  }

  const requestedModeIds = (['Light', 'Dark'] as const)
    .map(mode => modeIds[mode])
    .filter((modeId): modeId is string => Boolean(modeId));
  const snapshot = isNew ? undefined : snapshotVariable(variable, requestedModeIds);
  if (snapshot) updatedSnapshots.push(snapshot);
  let changed = isNew;

  if (variable.description !== request.description) changed = true;
  if (!arraysMatch(variable.scopes, ['ALL_FILLS'])) changed = true;

  for (const mode of ['Light', 'Dark'] as const) {
    const modeId = modeIds[mode];
    const value = request.values[mode];
    if (!modeId || !value) continue;
    const existingValue = variable.valuesByMode[modeId];
    if (existingValue === undefined && !isNew && !addedModeIds.includes(modeId)) {
      throw new Error(
        `Cannot safely update "${request.name}" in ${mode}: the existing value is missing and Figma cannot restore an absent value during rollback`
      );
    }
    if (!valuesMatch(existingValue, value)) {
      variable.setValueForMode(modeId, value);
      changed = true;
    }
  }

  variable.description = request.description;
  variable.scopes = ['ALL_FILLS'];
  if (isNew) markTeulColorResource(variable);
  if (!changed && snapshot && updatedSnapshots[updatedSnapshots.length - 1] === snapshot) {
    updatedSnapshots.pop();
  }
  return changed;
}

function rollbackVariableResources(params: {
  collection: VariableCollection;
  collectionWasCreated: boolean;
  createdVariables: Variable[];
  updatedSnapshots: UpdatedVariableSnapshot[];
  addedModeIds: string[];
}): string[] {
  const { collection, collectionWasCreated, createdVariables, updatedSnapshots, addedModeIds } =
    params;
  const failures: string[] = [];
  for (const variable of [...createdVariables].reverse()) {
    try {
      variable.remove();
    } catch (error) {
      console.error('Failed to roll back color variable:', error);
      failures.push(`variable "${variable.name}" removal failed`);
    }
  }
  for (const snapshot of [...updatedSnapshots].reverse()) {
    try {
      snapshot.variable.description = snapshot.description;
      snapshot.variable.scopes = snapshot.scopes;
      for (const { modeId, value } of snapshot.values) {
        snapshot.variable.setValueForMode(modeId, value);
      }
    } catch (error) {
      console.error('Failed to roll back updated color variable:', error);
      failures.push(`variable "${snapshot.variable.name}" restoration failed`);
    }
  }
  if (collectionWasCreated) {
    try {
      collection.remove();
    } catch (error) {
      console.error('Failed to roll back variable collection:', error);
      failures.push(`collection "${collection.name}" removal failed`);
    }
  } else {
    for (const modeId of [...addedModeIds].reverse()) {
      try {
        collection.removeMode(modeId);
      } catch (error) {
        console.error('Failed to roll back variable mode:', error);
        failures.push(`mode "${modeId}" removal failed`);
      }
    }
  }
  return failures;
}

export async function createColorVariables(
  scalesData: CreateStylesData,
  systemName: string,
  collisionPolicy: ColorCollisionPolicy = 'cancel'
): Promise<ColorVariableTransaction> {
  if (
    scalesData.scaleMethod === 'wcag-constrained' &&
    !isSemanticColorPolicyCurrent(
      scalesData.scales.light,
      scalesData.scales.dark,
      scalesData.semanticPolicy
    )
  ) {
    throw new Error('WCAG-constrained semantic token policy is stale or invalid');
  }

  const collectionName = getCollectionName(systemName);
  const matchingCollections = (await figma.variables.getLocalVariableCollectionsAsync()).filter(
    collection => collection.name === collectionName
  );
  if (matchingCollections.length > 1) {
    throw new Error(`Multiple local variable collections are named "${collectionName}"`);
  }
  if (matchingCollections[0] && collisionPolicy !== 'update-local') {
    throw new Error(`Variable collection collision for "${collectionName}"`);
  }
  if (matchingCollections[0] && !isTeulColorResource(matchingCollections[0])) {
    throw new Error(`"${collectionName}" is not marked as Teul-owned. Choose Create copy.`);
  }

  const collectionWasCreated = matchingCollections.length === 0;
  const collection =
    matchingCollections[0] ?? figma.variables.createVariableCollection(collectionName);
  const createdVariables: Variable[] = [];
  const updatedSnapshots: UpdatedVariableSnapshot[] = [];
  let addedModeIds: string[] = [];

  try {
    if (collectionWasCreated) markTeulColorResource(collection);
    const modes = getOrCreateModes(collection, scalesData.includeDarkMode, collectionWasCreated);
    addedModeIds = modes.addedModeIds;
    const existingVariables = (await figma.variables.getLocalVariablesAsync('COLOR')).filter(
      variable => variable.variableCollectionId === collection.id
    );
    const existingByName = new Map<string, Variable[]>();
    for (const variable of existingVariables) {
      const matches = existingByName.get(variable.name) ?? [];
      matches.push(variable);
      existingByName.set(variable.name, matches);
    }

    const variableByName = new Map<string, Variable>();
    let updatedCount = 0;
    let skippedCount = 0;
    const primitiveRequests = buildPrimitiveRequests(scalesData);
    for (const request of primitiveRequests) {
      const existing = existingByName.get(request.name) ?? [];
      if (existing.length > 1) throw new Error(`Duplicate variable name "${request.name}"`);
      const isNew = !existing[0];
      const variable =
        existing[0] ?? figma.variables.createVariable(request.name, collection, 'COLOR');
      if (isNew) createdVariables.push(variable);
      const changed = applyRequestedVariable({
        variable,
        request,
        modeIds: modes.modeIds,
        addedModeIds,
        isNew,
        collisionPolicy,
        updatedSnapshots,
      });
      if (!isNew) {
        if (changed) updatedCount++;
        else skippedCount++;
      }
      variableByName.set(request.name, variable);
    }

    const semanticRequests = new Map<string, RequestedVariable>();
    if (scalesData.scaleMethod === 'wcag-constrained' && scalesData.semanticPolicy) {
      for (const mode of ['Light', 'Dark'] as const) {
        if (mode === 'Dark' && !scalesData.includeDarkMode) continue;
        const report = scalesData.semanticPolicy.modes[mode.toLowerCase() as 'light' | 'dark'];
        if (!report) throw new Error(`Missing ${mode} semantic token report`);
        for (const token of Object.values(report.tokens)) {
          const name = getSemanticVariableName(token.name);
          const sourceName = `${token.source.scale}/${stepToStyleSuffix(token.source.step)}`;
          const sourceVariable = variableByName.get(sourceName);
          if (!sourceVariable) throw new Error(`Missing source variable "${sourceName}"`);
          const request = semanticRequests.get(name) ?? {
            name,
            description: `WCAG-constrained semantic token · ${token.source.scale} step ${token.source.step}`,
            values: {},
          };
          request.values[mode] = figma.variables.createVariableAlias(sourceVariable);
          semanticRequests.set(name, request);
        }
      }
    }

    for (const request of semanticRequests.values()) {
      const existing = existingByName.get(request.name) ?? [];
      if (existing.length > 1) throw new Error(`Duplicate variable name "${request.name}"`);
      const isNew = !existing[0];
      const variable =
        existing[0] ?? figma.variables.createVariable(request.name, collection, 'COLOR');
      if (isNew) createdVariables.push(variable);
      const changed = applyRequestedVariable({
        variable,
        request,
        modeIds: modes.modeIds,
        addedModeIds,
        isNew,
        collisionPolicy,
        updatedSnapshots,
      });
      if (!isNew) {
        if (changed) updatedCount++;
        else skippedCount++;
      }
    }

    const requestedModes: ModeName[] = scalesData.includeDarkMode ? ['Light', 'Dark'] : ['Light'];
    return {
      report: {
        collectionName,
        modes: requestedModes,
        primitiveCount: primitiveRequests.length,
        semanticAliasCount: semanticRequests.size,
        createdCount: createdVariables.length,
        updatedCount,
        skippedCount,
        warnings: [],
      },
      rollback: () =>
        rollbackVariableResources({
          collection,
          collectionWasCreated,
          createdVariables,
          updatedSnapshots,
          addedModeIds,
        }),
    };
  } catch (error) {
    const rollbackFailures = rollbackVariableResources({
      collection,
      collectionWasCreated,
      createdVariables,
      updatedSnapshots,
      addedModeIds,
    });
    if (rollbackFailures.length > 0) {
      const message = error instanceof Error ? error.message : 'Color variable creation failed';
      throw new Error(`${message}; rollback failed: ${rollbackFailures.join('; ')}`);
    }
    throw error;
  }
}
